"""What a rule looks at. Each function returns an observation dict that assertions are run against."""
import socket, ssl, time
from datetime import datetime, timezone

import httpx

from sentinel import guard


def http_observation(url, timeout=8.0):
    url = guard.check_url(url)
    t0 = time.time()
    try:
        r = httpx.get(url, timeout=timeout, follow_redirects=False)
    except Exception as e:
        return {"reachable": False, "error": f"{type(e).__name__}: {str(e)[:100]}", "latency_ms": round((time.time() - t0) * 1000)}
    ms = round((time.time() - t0) * 1000)
    body = None
    try:
        body = r.json()
    except Exception:
        pass
    return {"reachable": True, "status": r.status_code, "latency_ms": ms, "size_bytes": len(r.content), "headers": {k.lower(): v for k, v in r.headers.items()},
            "json": body, "text": r.text[:2000]}


def tcp_observation(host, port, timeout=5.0):
    guard.check_host(host, int(port))
    t0 = time.time()
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            pass
        return {"reachable": True, "latency_ms": round((time.time() - t0) * 1000)}
    except Exception as e:
        return {"reachable": False, "error": f"{type(e).__name__}: {str(e)[:100]}", "latency_ms": round((time.time() - t0) * 1000)}


def table_observation(table, baseline_cols=None):
    """A table of the visitor's data: how many rows, which columns, how empty, how new. Two small queries, so a schedule can run it often."""
    import pandas as pd
    from connectors import registry as CR
    q = lambda x: '"' + str(x).replace('"', '""') + '"'
    info = CR.lake_query("select column_name c, data_type t from information_schema.columns where table_schema = 'lake' and table_name = '" + str(table).replace("'", "''") + "' order by ordinal_position")
    cols = [(c, t) for c, t in zip(info["c"], info["t"]) if not c.startswith("_dlt")]
    names = [c for c, _ in cols]
    agg = CR.lake_query("select count(*) n" + "".join(f", count({q(c)}) c{i}" for i, (c, _) in enumerate(cols)) + f" from lake.{q(table)}")
    n = int(agg["n"][0])
    worst = max((1 - int(agg[f"c{i}"][0]) / n for i in range(len(cols))), default=0.0) if n else 0.0
    obs = {"rows": n, "columns": names, "column_count": len(names), "worst_null_rate": round(worst, 4)}
    if baseline_cols is None:   # the first look is the baseline, so nothing has changed yet
        obs.update(columns_added=[], columns_missing=[], schema_unchanged=True)
    else:
        obs["columns_added"] = sorted(set(names) - set(baseline_cols))
        obs["columns_missing"] = sorted(set(baseline_cols) - set(names))
        obs["schema_unchanged"] = not obs["columns_added"] and not obs["columns_missing"]
    ts = next((c for c, t in cols if "TIMESTAMP" in t.upper() or t.upper() == "DATE"), None)
    if ts and n:
        try:
            newest = pd.to_datetime(CR.lake_query(f"select max({q(ts)}) m from lake.{q(table)}")["m"][0], utc=True)
            obs["newest"] = str(newest)[:19]
            obs["newest_age_hours"] = round((pd.Timestamp.now(tz="UTC") - newest).total_seconds() / 3600, 2)
        except Exception:
            pass
    return obs


def tls_observation(host, port=443, timeout=6.0):
    """The certificate a server shows: when it ends, who issued it, whether the chain is valid. The check does not send any data."""
    guard.check_host(host, int(port))
    t0 = time.time()
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, int(port)), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as tls:
                cert = tls.getpeercert()
        end = datetime.fromtimestamp(ssl.cert_time_to_seconds(cert["notAfter"]), tz=timezone.utc)
        name = lambda rdn: ", ".join(v for part in rdn for k, v in part if k in ("commonName", "organizationName"))
        return {"reachable": True, "valid": True, "days_left": round((end - datetime.now(timezone.utc)).total_seconds() / 86400, 1), "not_after": str(end)[:10],
                "issuer": name(cert.get("issuer", ())), "subject": name(cert.get("subject", ())), "latency_ms": round((time.time() - t0) * 1000)}
    except ssl.SSLCertVerificationError as e:
        return {"reachable": True, "valid": False, "days_left": -1, "error": "The certificate is not valid: " + str(e.verify_message)[:100], "latency_ms": round((time.time() - t0) * 1000)}
    except Exception as e:
        return {"reachable": False, "valid": False, "days_left": -1, "error": f"{type(e).__name__}: {str(e)[:100]}", "latency_ms": round((time.time() - t0) * 1000)}
