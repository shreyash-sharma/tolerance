"""Evidence probes over a case's telemetry. Each returns a ranked list of suspect services with the numbers behind the rank.
Alert time is taken as the fault onset time, as in the RCA benchmark literature: the question is which service to blame."""
import re
import numpy as np
import pandas as pd

from rca import data as D

ERR_RE = re.compile(r"(?:error|fail|exception|timeout|timed out|refused|unavailable|panic|fatal|unable|denied|reset by peer)", re.I)
FAMNAME = {"cpu": "CPU", "mem": "memory", "diskio": "disk I/O", "socket": "sockets", "load": "load", "error": "error rate", "latency-50": "latency", "latency-90": "latency"}
ALIASES = {}  # trace/log service name -> metric service name; set from the person's corrections in the model review


def canon(name):
    return ALIASES.get(name, name)


def metric_probe(case, top=8):
    df = D.metrics(case)
    t0 = D.inject_time(case)
    n, f = df[df.time < t0], df[df.time >= t0]
    series = []
    for col in df.columns:
        if col == "time":
            continue
        svc, fam = D.split_series(col)
        if not svc or svc in D.NOT_SERVICE:
            continue
        a, b = n[col].dropna().to_numpy(float), f[col].dropna().to_numpy(float)
        if len(a) < 5 or len(b) < 5:
            continue
        med = float(np.median(a))
        mad = 1.4826 * float(np.median(np.abs(a - med)))
        iqr = float(np.subtract(*np.percentile(a, [75, 25])))
        rng = float(np.ptp(np.concatenate([a, b]))) + 1e-9
        d = abs(float(np.median(b)) - med)
        scale = max(mad, 0.5 * iqr, 0.02 * abs(med), 0.02 * rng, 1e-6)
        series.append({"series": col, "service": svc, "family": fam, "score": float(np.log1p(min(d / scale, 60)) + d / rng), "before": round(med, 4), "after": round(float(np.median(b)), 4)})
    by = {}
    for s in series:
        if s["service"] not in by or s["score"] > by[s["service"]]["score"]:
            by[s["service"]] = s
    ranked = sorted(by.values(), key=lambda s: -s["score"])
    return {"probe": "metrics", "ok": True, "ranked": [{"service": s["service"], "score": s["score"], "why": f"{FAMNAME.get(s['family'], s['family'])} moved from {s['before']} to {s['after']} ({s['series']})", "series": s["series"], "family": s["family"]} for s in ranked[:top]]}


def trace_probe(case, top=8):
    t = D.traces(case)
    if t is None:
        return {"probe": "traces", "ok": False, "note": "no traces recorded for this system", "ranked": []}
    t0 = D.inject_time(case) * 1000
    t = t.dropna(subset=["serviceName"])
    t = t.assign(svc=t.serviceName.map(canon), err=(t.statusCode.notna() & (t.statusCode.astype(str) != "0")).astype(float), ms=pd.to_numeric(t.startTimeMillis, errors="coerce"))
    n, f = t[t.ms < t0], t[t.ms >= t0]
    out = []
    for svc in sorted(set(t.svc)):
        a, b = n[n.svc == svc], f[f.svc == svc]
        if len(a) < 20 or len(b) < 20:
            continue
        e0, e1 = a.err.mean(), b.err.mean()
        l0, l1 = max(a.duration.quantile(.9), 1), max(b.duration.quantile(.9), 1)
        score = max((e1 - e0) / (0.005 + e0), 3 * max(0.0, np.log(l1 / l0)), 0.0)
        out.append({"service": svc, "score": float(np.log1p(score)), "why": f"error rate {e0:.3f} to {e1:.3f}, p90 latency {int(l0)} to {int(l1)} us over {len(b)} spans"})
    out.sort(key=lambda x: -x["score"])
    return {"probe": "traces", "ok": True, "ranked": out[:top]}


def log_probe(case, top=8):
    lg = D.logs(case)
    if lg is None:
        return {"probe": "logs", "ok": False, "note": "no logs recorded for this system", "ranked": []}
    t0 = D.inject_time(case)
    ts = pd.to_numeric(lg.timestamp, errors="coerce")
    lg = lg.assign(ts=ts, e=lg.message.astype(str).str.contains(ERR_RE), svc=lg.container_name.map(canon))
    t_start, t_end = float(ts.min()), float(ts.max())
    wn, wf = max(t0 - t_start, 1), max(t_end - t0, 1)
    out = []
    for svc, g in lg.groupby("svc"):
        n_err, f_err = int(g[(g.ts < t0)].e.sum()), int(g[(g.ts >= t0)].e.sum())
        rate_n, rate_f = n_err / wn, f_err / wf
        score = max(0.0, (rate_f - rate_n) * wf / (np.sqrt(rate_n * wf + 1) + 1))
        top_msg = g[(g.ts >= t0) & g.e].message.astype(str).str.slice(0, 90).value_counts().head(2)
        out.append({"service": svc, "score": float(np.log1p(score)), "why": f"error-like log lines {n_err} to {f_err}" + (f", e.g. “{top_msg.index[0]}”" if len(top_msg) else ""),
                    "messages": [{"text": k, "count": int(v)} for k, v in top_msg.items()]})
    out.sort(key=lambda x: -x["score"])
    return {"probe": "logs", "ok": True, "ranked": out[:top]}


PROBES = {"metrics": metric_probe, "traces": trace_probe, "logs": log_probe}


def fuse(results):
    """Mean of each probe's scores after scaling to its own maximum, so no signal drowns another. Returns ranked services."""
    acc, cnt = {}, {}
    for r in results:
        if not r["ok"] or not r["ranked"]:
            continue
        mx = max(x["score"] for x in r["ranked"]) or 1.0
        for x in r["ranked"]:
            acc.setdefault(x["service"], []).append(x["score"] / mx)
        for s in list(acc):
            pass
    k = sum(1 for r in results if r["ok"] and r["ranked"]) or 1
    ranked = sorted(((s, sum(v) / k) for s, v in acc.items()), key=lambda x: -x[1])
    return ranked


def log_messages(case, service, n=8):
    """Distinct error-like messages of one service after the alert time, and messages that appear only after it."""
    lg = D.logs(case)
    if lg is None:
        return {"ok": False, "note": "no logs recorded for this system"}
    t0 = D.inject_time(case)
    ts = pd.to_numeric(lg.timestamp, errors="coerce")
    g = lg.assign(ts=ts, svc=lg.container_name.map(canon))
    g = g[g.svc == service]
    before, after = g[g.ts < t0].message.astype(str), g[g.ts >= t0].message.astype(str)
    new = after[~after.isin(set(before))].str.slice(0, 120).value_counts().head(n)
    err = after[after.str.contains(ERR_RE)].str.slice(0, 120).value_counts().head(n)
    return {"ok": True, "service": service, "new_after_alert": [{"text": k, "count": int(v)} for k, v in new.items()], "error_like_after_alert": [{"text": k, "count": int(v)} for k, v in err.items()]}


def series_window(case, service, family=None):
    """Raw metric series of one service around the alert time, for the chart."""
    df = D.metrics(case)
    t0 = D.inject_time(case)
    cols = [c for c in df.columns if c != "time" and D.split_series(c)[0] == service and (family is None or D.split_series(c)[1] == family)]
    return df, cols, t0
