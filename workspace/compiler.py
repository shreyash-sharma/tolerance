"""The compile step: the reviewed model becomes the things the rest of the system runs on.
  twin     reliability model of the machines (failure and repair behaviour fitted from their state log, compiled to a stochastic Petri net)
  graph    the service call graph the investigators reason over, minus the calls the person rejected
  policy   the default-deny permission policy for agents, generated from the systems in the model
  quality  which process signals separate failing units from passing ones, where an inspection log exists
Each compile is compared with the previous one, so the person sees what their corrections changed."""
import json, time

import numpy as np
import pandas as pd

from connectors import registry as CR
from interpret import engine as E
from workspace import store
from fabric import gateway


def quality_signals(top=8):
    """Find a table with a pass/fail result per unit, and rank numeric signals by how well they separate fails from passes (rank AUC, the Mann-Whitney statistic)."""
    for t in E.lake_tables():
        if t.startswith("_dlt"):
            continue
        try:
            df = CR.lake_query(f'select * from lake."{t}" limit 20000')
        except Exception:
            continue
        res = next((c for c in df.columns if pd.api.types.is_string_dtype(df[c]) and set(df[c].dropna().astype(str).str.lower().unique()) <= {"pass", "fail"} and df[c].nunique() == 2), None)
        if not res:
            continue
        ts = next((c for c in df.columns if "at" in c or "time" in c or c.startswith("ts")), None)
        fail = (df[res].astype(str).str.lower() == "fail").to_numpy()
        n1, n0 = int(fail.sum()), int((~fail).sum())
        if n1 < 5 or n0 < 20:
            continue
        rows = []
        for c in df.columns:
            if c == res or not pd.api.types.is_numeric_dtype(df[c]) or c.lower() in ("id", "unit_id"):
                continue
            v = pd.to_numeric(df[c], errors="coerce")
            ok = v.notna().to_numpy()
            if ok.sum() < 100 or v[ok].nunique() < 4 or fail[ok].sum() < 5:
                continue
            r = v[ok].rank().to_numpy()
            f = fail[ok]
            m1, m0 = int(f.sum()), int((~f).sum())
            auc = (r[f].sum() - m1 * (m1 + 1) / 2) / (m1 * m0)
            rows.append({"signal": c, "auc": round(float(auc), 3), "strength": round(abs(float(auc) - .5) * 2, 3), "direction": "higher in fails" if auc > .5 else "lower in fails"})
        rows.sort(key=lambda r: -r["strength"])
        weekly = None
        if ts:
            w = pd.to_datetime(df[ts]).dt.to_period("W").astype(str)
            g = pd.DataFrame({"w": w, "f": fail}).groupby("w").f.agg(["mean", "size"])
            weekly = [{"week": k, "fail_rate": round(float(r["mean"]), 4), "units": int(r["size"])} for k, r in g.iterrows()]
        return {"table": t, "units": int(len(df)), "fails": n1, "fail_rate": round(n1 / len(df), 4), "signals": len(rows), "top": rows[:top], "weekly": weekly}
    return None


def build(S):
    """Build the artifacts from the current effective model. Returns (artifacts, steps with timings)."""
    from physical import service as PH
    art, steps = {}, []

    def step(key, name, fn):
        t0 = time.time()
        try:
            art[key] = fn()
            err = None
        except Exception as e:
            art[key], err = None, f"{type(e).__name__}: {str(e)[:120]}"
        steps.append({"id": key, "name": name, "ms": round((time.time() - t0) * 1000), "error": err, "present": art[key] is not None})

    def twin():
        model, val, df = PH.compile_physical(force=True)
        a = model["assets"]
        fits = {}
        for m in a.values():
            fits[m["ttf"]["dist"]] = fits.get(m["ttf"]["dist"], 0) + 1
        return {"assets": len(a), "failures": sum(m["failures"] for m in a.values()), "rows": int(len(df)), "places": len(model["net"]["places"]), "transitions": len(model["net"]["transitions"]),
                "holdout_coverage": round(val["coverage"], 2) if val else None, "failure_code": PH.CFG.get("fail"), "fits": fits,
                "per_asset": [{"asset": k, "failures": m["failures"], "mtbf_min": round((m["mtbf_s"] or 0) / 60, 1), "mttr_s": round(m["mttr_s"] or 0, 1), "ttf": m["ttf"]["dist"], "ttr": m["ttr"]["dist"]} for k, m in a.items()]}
    try:
        PH.live_only()
        step("twin", "Machine reliability model", twin)
    except Exception:
        pass

    def graph():
        edges = gateway.GRAPH["edges"]
        svcs = S.get("rca_services") or {}
        if not svcs:
            return None
        return {"systems": len(svcs), "services": sum(len(v) for v in svcs.values()), "calls": sum(len(v) for v in edges.values()), "per_system": {k: {"services": len(v), "calls": len(edges.get(k, {}))} for k, v in svcs.items()}}
    step("graph", "Service call graph", graph)

    def policy():
        b = S.get("rca_bounds")
        if not b:
            return None
        return {"permits": b["counts"]["permits"], "domains": {k: v["tools"] for k, v in b["domains"].items()}, "services": b["counts"].get("services"), "default": "deny", "cedar_lines": len(b["cedar"].splitlines())}
    step("policy", "Agent permission policy", policy)
    step("quality", "Quality signals", quality_signals)
    return art, steps


def numbers(art):
    """Flat numbers used to compare two compiles."""
    out = {}
    if art.get("twin"):
        t = art["twin"]
        out.update({"machines modelled": t["assets"], "failures learned from": t["failures"], "Petri net transitions": t["transitions"], "failure code": t["failure_code"]})
    if art.get("graph"):
        out.update({"systems": art["graph"]["systems"], "services": art["graph"]["services"], "calls the investigators see": art["graph"]["calls"]})
    if art.get("policy"):
        out["permits in the policy"] = art["policy"]["permits"]
    if art.get("quality"):
        out["inspection signals ranked"] = art["quality"]["signals"]
    return out


def diff(prev, cur):
    a, b = numbers(prev or {}), numbers(cur)
    return [{"label": k, "before": a.get(k), "after": b[k], "changed": a.get(k) != b[k]} for k in b]


def history():
    return store.load().get("compiled", [])


def remember(version, art):
    def f(d):
        d.setdefault("compiled", []).append({"version": version, "at": time.time(), "art": art})
        d["compiled"] = d["compiled"][-12:]
    store.update(f)
