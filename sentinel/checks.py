"""What a rule looks at. Each function returns an observation dict that assertions are run against."""
import socket, time

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
    """A table of the visitor's data: how many rows, which columns, how empty, how new."""
    import pandas as pd
    from connectors import registry as CR
    from interpret import engine as E
    p = E.profile_table(table)
    cols = [c["name"] for c in p["columns"] if not c["name"].startswith("_dlt")]
    n = p["rows"]
    worst = max((c["nulls"] / n for c in p["columns"] if n and not c["name"].startswith("_dlt")), default=0.0)
    obs = {"rows": n, "columns": cols, "column_count": len(cols), "worst_null_rate": round(worst, 4)}
    if baseline_cols is None:   # the first look is the baseline, so nothing has changed yet
        obs.update(columns_added=[], columns_missing=[], schema_unchanged=True)
    else:
        obs["columns_added"] = sorted(set(cols) - set(baseline_cols))
        obs["columns_missing"] = sorted(set(baseline_cols) - set(cols))
        obs["schema_unchanged"] = not obs["columns_added"] and not obs["columns_missing"]
    ts = next((c["name"] for c in p["columns"] if c["role"] == "timestamp"), None)
    if ts and n:
        try:
            newest = pd.to_datetime(CR.lake_query(f'select max("{ts}") m from lake."{table}"')["m"][0], utc=True)
            obs["newest"] = str(newest)[:19]
            obs["newest_age_hours"] = round((pd.Timestamp.now(tz="UTC") - newest).total_seconds() / 3600, 2)
        except Exception:
            pass
    return obs
