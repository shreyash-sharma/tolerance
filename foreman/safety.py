"""Warden: the safety score, and the Action Broker that carries out what the gate allows.

For each proposed action Warden does two separate things:
  1. Hard limits (from the plant's documents). A broken limit blocks the action. The score can never override it.
  2. A safety score from 0 to 100 from six factors. The USER sets two lines: below the floor the action is refused, between the floor and the limit
     a person approves it, at or above the limit it may run itself. Cedar enforces this at the broker; the app does not decide alone.
The score is rule-driven so every number can be audited. Gemini writes the plain-language reason."""
import json, os, threading, time

from plant import core
from workspace import store

DEFAULTS = {"floor": 40, "limit": 80}

ACTIONS = {
    "inspect": {"label": "Inspect or measure", "rev": 1.0, "reach": 0.0, "corrective": False},
    "adjust_speed": {"label": "Change a speed setting", "rev": 0.9, "reach": 0.3, "corrective": True},
    "adjust_temperature": {"label": "Change a temperature setting", "rev": 0.9, "reach": 0.3, "corrective": True},
    "clear_jam": {"label": "Clear a jam", "rev": 0.85, "reach": 0.5, "corrective": True},
    "restart_station": {"label": "Restart a station", "rev": 0.7, "reach": 1.0, "corrective": True},
    "stop_station": {"label": "Stop a station", "rev": 0.6, "reach": 1.0, "corrective": True},
    "reroute_orders": {"label": "Re-route orders", "rev": 0.8, "reach": 0.6, "corrective": True},
    "schedule_maintenance": {"label": "Schedule maintenance", "rev": 0.95, "reach": 0.2, "corrective": False},
    "scale_out": {"label": "Scale out a service", "rev": 0.9, "reach": 0.5, "corrective": True},
    "restart_service": {"label": "Restart a service", "rev": 0.7, "reach": 1.0, "corrective": True},
    "rollback_change": {"label": "Roll back a change", "rev": 0.8, "reach": 1.0, "corrective": True},
    "move_volume": {"label": "Move a data volume", "rev": 0.4, "reach": 1.0, "corrective": True},
}
WEIGHTS = {"reversibility": 0.25, "reach": 0.20, "margin": 0.15, "evidence": 0.25, "precedent": 0.10, "plant_state": 0.05}
LABELS = {"reversibility": "Can it be undone", "reach": "How much it touches", "margin": "Distance from the limits", "evidence": "Strength of the evidence", "precedent": "People approved this before", "plant_state": "State of the plant"}
MAX_TYPE = {"max_temp_c", "max_speed_pct", "max_speed_ms", "belt_speed_ms", "payload_max_kg"}
LOCK = threading.RLock()


# ------------------------------------------------------------------ settings and memory
def settings():
    s = store.load().get("safety") or {}
    return {"floor": int(s.get("floor", DEFAULTS["floor"])), "limit": int(s.get("limit", DEFAULTS["limit"]))}


def set_settings(floor, limit):
    floor, limit = int(floor), int(limit)
    if not (0 <= floor < limit <= 100):
        raise ValueError("the floor must be lower than the limit, both between 0 and 100")

    def f(d):
        d.setdefault("safety", {}).update(floor=floor, limit=limit)
        d["safety"].setdefault("changes", []).append({"floor": floor, "limit": limit, "at": time.time()})
    store.update(f)
    return settings()


def _approvals(kind):
    a = (store.load().get("safety") or {}).get("approvals", {}).get(kind, {})
    return int(a.get("approved", 0)), int(a.get("rejected", 0))


def _precedent(kind, station):
    """What is known about this action in this context. Confirmed outcomes (see foreman/outcomes.py) come first, because they say the fix worked. With none, the people's earlier approvals and rejections stand in."""
    try:
        from foreman import outcomes
        s, f = outcomes.counts(kind, station)
    except Exception:
        s = f = 0.0
    if s + f > 0:
        return s, f, True
    ap, rj = _approvals(kind)
    return ap, rj, False


def record_person_decision(kind, approved):
    def f(d):
        a = d.setdefault("safety", {}).setdefault("approvals", {}).setdefault(kind, {"approved": 0, "rejected": 0})
        a["approved" if approved else "rejected"] += 1
    store.update(f)


def reset_history():
    """Forget the applied actions and the approvals. Settings stay."""
    def f(d):
        d["jig_actions"] = []
        (d.get("safety") or {}).pop("approvals", None)
    store.update(f)


# ------------------------------------------------------------------ the score
def _num(v):
    try:
        return float(v)
    except Exception:
        return None


def _lim(limits, subject, pred):
    for l in limits or []:
        if str(l["subject"]).lower() == str(subject).lower() and l["predicate"] == pred:
            return l
    return None


def score_action(action, ctx):
    """action: {kind, station, params:{...}}. ctx: {evidence, state, consecutive_faults, n_affected, plant_time, limits, order_value}."""
    kind = action.get("kind")
    meta = ACTIONS.get(kind)
    if not meta:
        raise ValueError(f"unknown action kind {kind}")
    st, params, limits = action.get("station"), action.get("params") or {}, ctx.get("limits") or []
    viol, needs = [], None
    margin_vals = []

    for pred, v in params.items():
        l = _lim(limits, st, pred)
        if l and pred in MAX_TYPE and _num(v) is not None and _num(l["value"]):
            L, x = _num(l["value"]), _num(v)
            if x > L:
                viol.append(f"{x:g} is above the {L:g} limit for {pred.replace('_', ' ')} ({l['doc']}: “{l['quote']}”)")
            else:
                margin_vals.append((L - x) / L)
    if kind == "restart_station":
        l = _lim(limits, st, "max_consecutive_faults")
        if l and _num(l["value"]) and ctx.get("consecutive_faults", 0) >= _num(l["value"]):
            viol.append(f"{st} has had {ctx['consecutive_faults']} faults in a row; the documents say to stop it and call maintenance, not restart it ({l['doc']}: “{l['quote']}”)")
    if kind == "schedule_maintenance" and str(params.get("type", "")).lower() == "preventive":
        l = _lim(limits, st, "maintenance_window")
        pt = ctx.get("plant_time")
        if l and pt and "-" in str(l["value"]):
            a, b = str(l["value"]).split("-")
            inside = (a <= pt <= b) if a <= b else (pt >= a or pt <= b)   # a window such as 22:00-05:00 crosses midnight
            if not inside:
                viol.append(f"preventive maintenance is only allowed between {a} and {b}; it is {pt} ({l['doc']}: “{l['quote']}”)")
    if kind == "reroute_orders":
        l = _lim(limits, "ORDER", "approval_threshold_eur")
        ov = _num(ctx.get("order_value"))
        if l and ov and ov > _num(l["value"]):
            needs = f"the order is worth {ov:g} EUR, above the {_num(l['value']):g} EUR that needs a supervisor ({l['doc']})"

    n = int(ctx.get("n_affected", 0))
    f_rev = meta["rev"]
    f_reach = 1.0 - meta["reach"] * min(1.0, n / 4.0)
    f_margin = min(1.0, min(margin_vals) / 0.25) if margin_vals else 1.0
    f_evid = max(0.0, min(1.0, float(ctx.get("evidence", 0.5))))
    ap, rj, learned = _precedent(kind, st)
    f_prec = (1.0 + ap) / (2.0 + ap + rj)   # the Beta estimate with a uniform prior: 0.5 until something is known
    state = ctx.get("state", "unknown")
    f_state = 1.0 if (kind == "inspect" or state in ("failed", "idle")) else (0.6 if state == "busy" else 0.7)

    vals = {"reversibility": f_rev, "reach": f_reach, "margin": f_margin, "evidence": f_evid, "precedent": f_prec, "plant_state": f_state}
    notes = {"reversibility": f"{meta['label']}: {'easy' if f_rev >= 0.85 else 'hard' if f_rev < 0.6 else 'moderate'} to undo",
             "reach": f"{n} station(s) or service(s) downstream" if meta["reach"] else "does not touch the flow",
             "margin": (f"{min(margin_vals) * 100:.0f}% below the nearest limit" if margin_vals else "no limited setting is changed"),
             "evidence": f"the Verifier supports the diagnosis at {f_evid * 100:.0f}%",
             "precedent": (f"in this situation the fix worked {ap:g} time(s) and failed {rj:g} time(s), as confirmed by people" if learned
                          else f"people approved this action {ap} time(s) and rejected it {rj} time(s)" if (ap + rj) else "no one has approved or rejected this action yet"),
             "plant_state": f"station is {state}"}
    factors = [{"id": k, "label": LABELS[k], "value": round(vals[k], 2), "weight": WEIGHTS[k], "points": round(100 * WEIGHTS[k] * vals[k], 1), "note": notes[k]} for k in WEIGHTS]
    total = int(round(sum(100 * WEIGHTS[k] * vals[k] for k in WEIGHTS)))
    s = settings()
    if viol:
        decision = "blocked"
    elif total < s["floor"]:
        decision = "refuse"
    elif needs or total < s["limit"]:
        decision = "approve"
    else:
        decision = "auto"
    return {"action": action, "kind": kind, "label": meta["label"], "score": total, "decision": decision, "factors": factors, "violations": viol, "needs_person": needs,
            "floor": s["floor"], "limit": s["limit"], "within_limits": not viol}


def with_decision(res, floor, limit):
    """The decision this score would get under other lines (used by the backtest and the sliders)."""
    if res["violations"]:
        return "blocked"
    if res["score"] < floor:
        return "refuse"
    if res["needs_person"] or res["score"] < limit:
        return "approve"
    return "auto"


def rationale(res, run=None, live=False):
    """Two plain sentences. Gemini writes them from the numbers; if it is unavailable, a template does."""
    top = sorted(res["factors"], key=lambda f: f["value"])[:2]
    base = (f"Warden scored {res['label'].lower()} at {res['score']} out of 100 against a floor of {res['floor']} and a limit of {res['limit']}. "
            + ("It breaks a hard limit, so it is blocked." if res["violations"] else
               {"auto": "It is above your limit, so it may run itself.", "approve": "It needs a person to approve it.", "refuse": "It is below your floor, so it is refused."}[res["decision"]])
            + (" The weakest points: " + "; ".join(f["note"] for f in top) + "." if top else ""))
    try:
        from foreman import llm
        out, src = llm.ask_json("warden", "You write the reason for a safety decision in a factory. Two short plain sentences. First say what the decision means for the operator, using decision_text exactly in meaning. Then name the weakest factor from weakest_factors and why it matters. Use only the facts given. Do not add numbers. Do not say the action is safe or acceptable. Reply as JSON: {\"reason\": \"...\"}.",
                                json.dumps({"action": res["label"], "station": res["action"].get("station"), "score": res["score"], "floor": res["floor"], "limit": res["limit"], "decision": res["decision"], "decision_text": {"auto": "It is above the limit, so it runs by itself.", "approve": "A person must approve it before it runs.", "refuse": "It is below the floor, so it is refused.", "blocked": "It breaks a hard limit, so it is blocked whatever the score."}[res["decision"]],
                                            "violations": res["violations"], "needs_person": res["needs_person"], "weakest_factors": [f["note"] for f in top]}), run=run, live=live)
        txt = str(out.get("reason", "")).strip()
        if txt and len(txt) < 600:
            return f"Warden scored it {res['score']} out of 100 (floor {res['floor']}, limit {res['limit']}). " + txt, src
    except Exception:
        pass
    return base, "template"


# ------------------------------------------------------------------ the broker
def apply(scored, approved_by=None, run=None):
    """The Action Broker. Asks Cedar whether this action may be applied to the plant. A simulated actuator carries it out: the plant is replayed data."""
    from foreman import gate
    ctx = {"within_limits": bool(scored["within_limits"]), "needs_person": bool(scored["needs_person"]) or scored["score"] < scored["limit"], "warden_score": int(scored["score"]),
           "auto_limit": int(scored["limit"]), "human_approved": bool(approved_by)}
    if scored["score"] < scored["floor"] and not approved_by:
        ctx["needs_person"] = True
    ok, reasons = gate.decide_apply(ctx)
    if scored["score"] < scored["floor"] and ok and approved_by:
        # a person may approve above the hard limits only; below the floor the action is refused even with approval
        ok = False
    mode = "auto" if ok and not approved_by else ("person" if ok else "refused")
    rec = {"id": store.new_id("act"), "action": scored["action"], "label": scored["label"], "score": scored["score"], "mode": mode, "approved_by": approved_by, "decision_by_cedar": ok, "policy": reasons,
           "at": time.time(), "status": "executed in the simulator (the plant is replayed data)" if ok else "not executed"}
    if run:
        run.step("decision", f"Action Broker: {'applied' if ok else 'not applied'} ({mode})", cedar=reasons)
    if ok:
        def f(d):
            d.setdefault("jig_actions", []).append(rec)
            del d["jig_actions"][:-100]
        store.update(f)
        if approved_by:
            record_person_decision(scored["kind"], True)
    return rec


# ------------------------------------------------------------------ the backtest on recorded incidents
CACHE = os.path.join(core.DATA, "jig_backtest.json")
SEED = os.path.join(core.ROOT, "seed", "jig_backtest.json")   # the result computed on the 465 recorded incidents, shipped with the app


def _cache_file():
    """The backtest result to use: one computed here, else the shipped one. An empty result is never used."""
    for path in (CACHE, SEED):
        try:
            if os.path.exists(path) and json.load(open(path)).get("items"):
                return path
        except Exception:
            pass
    return None
JOB = {"state": "idle", "done": 0, "total": 0, "error": None}
FAULT_KIND = {"CPU": "scale_out", "memory": "restart_service", "disk I/O": "move_volume", "sockets": "inspect", "load": "scale_out", "latency": "inspect", "error rate": "rollback_change"}


def _compute_backtest():
    from rca import agent as AG
    lib = json.load(open(os.path.join(core.ROOT, "seed", "rca_library.json")))
    JOB.update(state="running", total=len(lib), done=0, error=None)
    items = []
    for i, x in enumerate(lib):
        try:
            res = AG.run(x["case"], AG.STRATEGIES["metrics_first"])
            h = AG.hypothesis(x["case"], res)
            fam = str(h.get("fault_family") or "")
            kind = next((v for k, v in FAULT_KIND.items() if k.lower() in fam.lower()), "rollback_change")
            sc = score_action({"kind": kind, "station": h.get("service") or "service", "params": {}},
                              {"evidence": h.get("confidence", 0.3), "state": "busy", "n_affected": 2, "limits": []})
            items.append({"case": x["case"], "truth": x["truth"], "predicted": h.get("service"), "correct": h.get("service") == x["truth"], "confidence": h.get("confidence"), "kind": kind,
                          "label": sc["label"], "score": sc["score"], "fault": x["fault"], "suite": x.get("suite")})
        except Exception as e:
            items.append({"case": x["case"], "error": str(e)[:80]})
        JOB["done"] = i + 1
        if i % 25 == 0:
            json.dump({"partial": True, "items": items}, open(CACHE + ".part", "w"))
    if not [i for i in items if "score" in i]:
        raise RuntimeError("no incident could be scored (the incident data is not on this machine)")
    out = {"built_at": time.time(), "n": len([i for i in items if "score" in i]), "items": [i for i in items if "score" in i], "source": "seed/rca_library.json (the 465 recorded RCAEval incidents, real fault-injection cases)"}
    json.dump(out, open(CACHE, "w"))
    JOB.update(state="done")
    return out


def start_backtest():
    with LOCK:
        if JOB["state"] == "running":
            return JOB
        if _cache_file():
            JOB.update(state="done")
            return JOB
        threading.Thread(target=lambda: _safe_bt(), daemon=True, name="warden-backtest").start()
        JOB["state"] = "running"
    return JOB


def _safe_bt():
    try:
        _compute_backtest()
    except Exception as e:
        JOB.update(state="error", error=f"{type(e).__name__}: {e}")


def backtest(floor=None, limit=None):
    s = settings()
    floor = s["floor"] if floor is None else int(floor)
    limit = s["limit"] if limit is None else int(limit)
    path = _cache_file()
    if not path:
        start_backtest()
        return {"ready": False, "job": dict(JOB)}
    d = json.load(open(path))
    items = d["items"]

    def verdict(sc):
        return "refuse" if sc < floor else ("auto" if sc >= limit else "approve")

    counts = {"auto": 0, "approve": 0, "refuse": 0}
    wrong_auto = right_auto = harmful = 0
    for it in items:
        v = verdict(it["score"])
        counts[v] += 1
        if v == "auto":
            if it["correct"]:
                right_auto += 1
            else:
                wrong_auto += 1
                harmful += 1 if ACTIONS.get(it["kind"], {}).get("corrective") else 0
    curve = []
    for L in range(0, 101, 5):
        a = [it for it in items if it["score"] >= max(L, floor)]
        curve.append({"limit": L, "auto": len(a), "wrong": sum(1 for it in a if not it["correct"]), "harmful": sum(1 for it in a if not it["correct"] and ACTIONS.get(it["kind"], {}).get("corrective"))})
    hist = [0] * 10
    for it in items:
        hist[min(9, it["score"] // 10)] += 1
    wrong = sorted([it for it in items if not it["correct"] and verdict(it["score"]) == "auto"], key=lambda x: -x["score"])[:8]
    return {"ready": True, "floor": floor, "limit": limit, "n": len(items), "counts": counts, "auto_right": right_auto, "auto_wrong": wrong_auto, "auto_harmful": harmful,
            "diagnosis_accuracy": round(sum(1 for it in items if it["correct"]) / max(1, len(items)), 3), "curve": curve, "histogram": hist, "worst_auto": wrong, "source": d["source"]}
