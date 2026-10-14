"""Incidents and the human decisions on them.
  service incidents: raised by the live alert feed (derived from real incident cases). The person asks for a recommendation on where to look first,
  runs the investigation (Gemini or the rule-based investigator, both through the policy gateway), reads the evidence, approves a remediation if they want one,
  and says whether the diagnosis is right. That decision is the reward the learner trains on.
  machine incidents: raised by real failures arriving in the live machine data."""
import json, os, time

from plant import core
from fabric import agents as FA, gateway
from rca import agent as AG, data as D, gemini as RG, probes as P
from learning import bandit
from workspace import store

CALL_COST = AG.CALL_COST
TOOL_OF = {"metrics": "metric_anomalies", "traces": "trace_anomalies", "logs": "log_anomalies"}
COVER_TEXT = {"m": "metrics only", "ml": "metrics and logs", "mlt": "metrics, logs and traces"}
FAULT_ACTION = {"CPU": "scale out or raise the CPU limit", "memory": "restart to reclaim memory, then find the leak", "disk I/O": "move the volume or throttle the writer", "sockets": "check connection limits and retries",
                "load": "scale out and check the upstream traffic", "latency": "check the network path and the dependency it waits on", "error rate": "roll back the latest change"}
_TRUTH = {}
PROGRESS = {}  # incident id -> live audit list of the investigation in flight


def truth_of(case):
    if not _TRUTH:
        for x in bandit.library():
            _TRUTH[x["case"]] = {"service": x["truth"], "fault": x["fault"]}
    return _TRUTH.get(case)


def public(inc):
    return {k: v for k, v in inc.items() if not k.startswith("_")}


def list_all():
    return [public(i) for i in reversed(store.load()["incidents"])]


def get(iid):
    return next((i for i in store.load()["incidents"] if i["id"] == iid), None)


def _put(inc):
    def f(d):
        for k, x in enumerate(d["incidents"]):
            if x["id"] == inc["id"]:
                d["incidents"][k] = inc
                return
        d["incidents"].append(inc)
    store.update(f)


# ------------------------------------------------------------------ creation
def scan_alerts(max_new=20):
    """Turn new rows of the alert feed (already ingested into the lake) into incidents."""
    from connectors import registry as CR
    from interpret import engine as E
    tabs = [t for t in E.lake_tables() if t == "alerts" or t.endswith("__alerts")]
    if not tabs:
        return []
    d = store.load()
    last = d.get("alerts_last_id", 0)
    df = CR.lake_query(f'select * from lake."{tabs[0]}" where id > {int(last)} order by id limit {int(max_new)}')
    created = []
    for r in df.itertuples():
        case = r.case_id
        row = D.case_row(case)
        if not row:
            continue
        iid = store.new_id("inc")
        ctx = {"coverage": r.coverage, "symptom": r.symptom, "system": r.system}
        inc = {"id": iid, "kind": "service", "title": r.summary, "opened": time.time(), "alert_time": str(r.started_at), "status": "open", "case": case, "ctx": ctx,
               "alert": {"system": r.system, "system_name": row["system_name"], "coverage_text": COVER_TEXT.get(r.coverage, r.coverage), "feed_id": int(r.id)}, "investigation": None, "decision": None, "work_order": None, "notes": []}
        inc["_truth"] = truth_of(case)
        _put(inc)
        created.append(public(inc))
    if len(df):
        store.update(lambda dd: dd.__setitem__("alerts_last_id", int(df["id"].max())))
    return created


def scan_machine_events(max_new=5):
    """One open incident per asset for each new failure that has arrived in the live machine data. The first scan only sets a baseline."""
    from physical import service as PH
    import pandas as pd
    df = PH.lake_df()
    if not len(df):
        return []
    d = store.load()
    last = d.get("machine_scan_ts")
    onsets = []
    for a, g in df.groupby("asset"):
        g = g.reset_index(drop=True)
        mask = (g.status == PH.REL.FAIL) & (g.status.shift(1, fill_value=-1) != PH.REL.FAIL)
        for idx in g.index[mask]:
            onsets.append((g.ts[idx], a, idx, g))
    onsets.sort(key=lambda x: x[0])
    open_assets = {i.get("asset") for i in d["incidents"] if i["kind"] == "machine" and i["status"] == "open"}
    new = [o for o in onsets if last is not None and o[0] > pd.Timestamp(last) and o[1] not in open_assets]
    seen = set()
    new = [o for o in reversed(new) if not (o[1] in seen or seen.add(o[1]))][::-1]
    created = []
    for ts, a, idx, g in new[-max_new:]:
        nxt = g[(g.index > idx) & (g.status != PH.REL.FAIL)]
        dur = float((nxt.ts.iloc[0] - ts).total_seconds()) if len(nxt) else None
        iid = store.new_id("inc")
        inc = {"id": iid, "kind": "machine", "title": f"{a} entered the failed state", "opened": time.time(), "status": "open", "log_time": str(ts), "asset": a, "duration_s": dur, "decision": None, "notes": [],
               "ctx": None, "alert": None, "investigation": None}
        _put(inc)
        created.append(public(inc))
    store.update(lambda dd: dd.__setitem__("machine_scan_ts", str(df.ts.max())))
    return created


# ------------------------------------------------------------------ workflow
def recommend(inc):
    ctx = {k: inc["ctx"][k] for k in bandit.FEATURES}
    r = bandit.get().recommend(ctx)
    r["context"] = inc["ctx"]
    return r


def _digest(S, inc):
    """What the investigator is told about the system, from the reviewed model: services, which telemetry exists, the call graph."""
    system = inc["ctx"]["system"]
    edges = gateway.GRAPH["edges"].get(system, {})
    svcs = S.get("rca_services", {}).get(system, [])
    lines = [f"MODEL OF THIS SYSTEM ({inc['alert']['system_name']}): {len(svcs)} services: {', '.join(svcs[:60])}"]
    if edges:
        lines.append("Calls (caller -> callee), most frequent first:")
        for (a, b), n in sorted(edges.items(), key=lambda x: -x[1])[:40]:
            lines.append(f"  {a} -> {b}")
    else:
        lines.append("No call graph is known for this system.")
    try:
        from workspace import twin as T
        fl = T.floor_context(system)
        if fl:
            lines.append("FACTORY FLOOR (stations the person says depend on this system; context only, not evidence of cause):")
            lines += ["  " + x for x in fl]
    except Exception:
        pass
    return "\n".join(lines)


def investigate(S, inc, strategy, mode="gemini", replay=False):
    gw = gateway.Gateway(S["rca_bounds"])
    gw.case = inc["case"]
    PROGRESS[inc["id"]] = {"audit": gw.audit, "t0": time.time(), "done": False}
    note, res = None, None
    from workspace import demo_cache as DC
    rec = DC.get(DC.inv_key(inc["case"], strategy)) if (replay and mode == "gemini") else None
    if rec:
        # play the recording back with its steps visible, labelled as recorded
        for a in rec["audit"]:
            time.sleep(0.6)
            gw.audit.append(a)
        res = dict(rec["result"])
        res["agent"] = "Gemini · recorded run"
        res["recorded"] = True
        PROGRESS[inc["id"]]["done"] = True
        inc["investigation"] = {"strategy": strategy, "result": res, "audit": list(gw.audit), "at": time.time()}
        inc["status"] = "diagnosed"
        S["gw"] = gw
        _put(inc)
        return inc["investigation"]
    if mode == "gemini" and FA.gemini_available():
        try:
            res = RG.run(gw, inc, strategy, context=_digest(S, inc))
        except Exception as e:
            note = f"Gemini unavailable ({type(e).__name__}); used the rule-based investigator"
            gw = gateway.Gateway(S["rca_bounds"])
            gw.case = inc["case"]
            PROGRESS[inc["id"]] = {"audit": gw.audit, "t0": time.time(), "done": False}
            res = None

    def call(p):
        out = gw.call("rca", TOOL_OF[p], {"top_k": 8})
        if out.get("ok"):
            return out["result"]
        return {"probe": p, "ok": False, "ranked": [], "note": out.get("reason") or out.get("error", "")}
    if res is None:
        run = AG.run(inc["case"], AG.STRATEGIES[strategy], call=call)
        res = AG.hypothesis(inc["case"], run)
        res["agent"] = "rule-based investigator" + (" (fallback)" if note else "")
        if note:
            res["note"] = note
        fam = res.get("fault_family")
        res["remediation"] = {"action": FAULT_ACTION.get(fam, "investigate the service's recent change and roll back if one correlates"), "reason": f"{fam} anomaly on {res['service']}"} if res["service"] else None
        res["explanation"] = f"Highest fused evidence points at {res['service']}." if res["service"] else "No service stood out."
    if res.get("service") and not res.get("remediation"):
        fam = str(res.get("fault_family") or "")
        act = next((v for k, v in FAULT_ACTION.items() if k.lower() in fam.lower().replace("_", " ")), None) or f"check the latest change to {res['service']} and roll it back if it lines up with the alert"
        res["remediation"] = {"action": act, "reason": f"proposed from the diagnosis ({fam or 'unspecified fault'}); a person decides"}
    PROGRESS[inc["id"]]["done"] = True
    if str(res.get("agent", "")).startswith("Gemini") and not res.get("recorded"):
        try:
            DC.put(DC.inv_key(inc["case"], strategy), {"result": res, "audit": gw.audit, "recorded_at": time.time()})
        except Exception:
            pass
    inc["investigation"] = {"strategy": strategy, "result": res, "audit": gw.audit, "at": time.time()}
    inc["status"] = "diagnosed"
    S["gw"] = gw
    _put(inc)
    return inc["investigation"]


def work_order(S, inc, action=None):
    """Create a work order for the proposed remediation. Needs the person's approval; there is no actuator, so it is handed to the on-call engineer."""
    h = inc["investigation"]["result"]
    gw = gateway.Gateway(S["rca_bounds"])
    gw.case = inc["case"]
    act = action or (h.get("remediation") or {}).get("action") or "investigate"
    out = gw.call("remediation", "execute_remediation", {"service": h["service"], "action": act}, context={"human_approved": True})
    deny = gw.call("remediation", "execute_remediation", {"service": h["service"], "action": act}, context={"human_approved": False})
    inc["work_order"] = {**(out.get("result") or {}), "refused_without_approval": bool(deny.get("denied"))}
    _put(inc)
    return inc["work_order"]


def decide(S, inc, decision, note=None):
    """decision: accept (the diagnosis is right) or reject (it is wrong). The reward trains the learner."""
    inv = inc["investigation"]
    correct = decision == "accept"
    calls = inv["result"]["calls"]
    reward = (1.0 if correct else 0.0) - CALL_COST * calls
    ctx = {k: inc["ctx"][k] for k in bandit.FEATURES}
    ev = bandit.get().record(ctx, inv["strategy"], reward, source="human", incident=inc["id"], correct=correct, calls=calls, label=inc["case"])
    tr = inc.get("_truth") or {}
    ranked = [x["service"] for x in inv["result"]["ranked"]]
    inc["decision"] = {"decision": decision, "note": note, "at": time.time(), "reward": round(reward, 3), "learner_event": ev["i"],
                       "agreed_with_ground_truth": (bool(ranked) and ranked[0] == tr.get("service")) if tr else None}
    inc["status"] = "resolved" if correct and inc.get("work_order") else "closed"
    _put(inc)
    return {"decision": inc["decision"], "event": {k: ev[k] for k in ("i", "arm", "reward", "prob")}}


def series(inc, service, points=140):
    """Metric series of a service around the alert, for the chart (the fault onset is marked)."""
    df, cols, t0 = P.series_window(inc["case"], service)
    if not len(df) or not cols:
        return {"series": [], "t0": t0}
    step = max(1, len(df) // points)
    d = df.iloc[::step]
    out = []
    for c in cols[:6]:
        v = d[c].astype(float)
        lo, hi = float(v.min()), float(v.max())
        out.append({"name": c, "family": D.split_series(c)[1], "points": [[int(t), round(float((x - lo) / (hi - lo)) if hi > lo else 0.0, 4)] for t, x in zip(d.time, v)], "min": lo, "max": hi})
    return {"series": out, "t0": t0}
