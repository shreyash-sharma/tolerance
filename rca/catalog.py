"""Catalog tables the connectors load from the incident archive: the case index (without ground truth), the service catalog and the call graph.
The telemetry itself stays in the archive and is queried on demand."""
import collections
import pandas as pd

from rca import data as D


def cases_table():
    c = D.index()
    c = c[c.suite.isin(["RE1", "RE3"])]
    return [{"case_id": r.case, "system": r.system, "system_name": r.system_name, "suite": r.suite, "n_metrics": int(r.n_metrics), "duration_minutes": float(r.duration_minutes), "has_logs": bool(r.has_logs), "has_traces": bool(r.has_traces)} for r in c.itertuples()]


def _representatives(c):
    out = {}
    for r in c.itertuples():
        key = (r.system, D.coverage(r.case))
        out.setdefault(key, r.case)
    return out


def service_catalog():
    idx = D.index()
    idx = idx[idx.suite.isin(["RE1", "RE3"])]
    reps = _representatives(idx)
    rows = {}
    for (system, cov), case in reps.items():
        m = D.metrics(case)
        for svc, ser in D.services_of(m).items():
            r = rows.setdefault((system, svc), {"system": system, "service": svc, "metric_series": 0, "families": set(), "in_logs": False, "in_traces": False})
            r["metric_series"] = max(r["metric_series"], len(ser))
            r["families"] |= {f for _, f in ser}
        lg = D.logs(case)
        if lg is not None:
            for s in lg.container_name.dropna().unique():
                rows.setdefault((system, s), {"system": system, "service": s, "metric_series": 0, "families": set(), "in_logs": False, "in_traces": False})["in_logs"] = True
        t = D.traces(case)
        if t is not None:
            for s in t.serviceName.dropna().unique():
                rows.setdefault((system, s), {"system": system, "service": s, "metric_series": 0, "families": set(), "in_logs": False, "in_traces": False})["in_traces"] = True
    return [{**r, "families": ",".join(sorted(r["families"]))} for r in rows.values()]


def trace_edges(per_system=3):
    idx = D.index()
    idx = idx[(idx.suite == "RE3") & idx.has_traces]
    out = []
    for system, g in idx.groupby("system"):
        agg, err = collections.Counter(), collections.Counter()
        for case in list(g.case)[:per_system]:
            t = D.traces(case)
            if t is None:
                continue
            t = t.dropna(subset=["serviceName"])[["spanID", "parentSpanID", "serviceName", "statusCode"]]
            par = t[["spanID", "serviceName"]].rename(columns={"spanID": "p", "serviceName": "caller"})
            m = t.merge(par, left_on="parentSpanID", right_on="p", how="inner")
            m = m[m.caller != m.serviceName]
            m["bad"] = (m.statusCode.notna() & (m.statusCode.astype(str) != "0")).astype(int)
            for r in m.groupby(["caller", "serviceName"]).agg(n=("bad", "size"), bad=("bad", "sum")).reset_index().itertuples():
                agg[(r.caller, r.serviceName)] += int(r.n)
                err[(r.caller, r.serviceName)] += int(r.bad)
        for (a, b), n in agg.items():
            out.append({"system": system, "caller": a, "callee": b, "calls": int(n), "error_rate": round(err[(a, b)] / n, 4)})
    return out
