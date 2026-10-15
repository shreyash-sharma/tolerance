"""Playbooks: the owner draws what should happen when a station fails. Trigger, then checks, then decisions, then actions.
The idea follows the reflexes of the Kanshi project. A playbook is plain data that code walks; no model decides a branch.
Checks read through the same policy gateway as the agents. An action that changes the plant goes through Warden first."""
import time, uuid

from foreman import gate
from sentinel import engine
from workspace import store

MAX_PLAYBOOKS, MAX_NODES = 5, 24
SOURCES = {
    "failures": "Failures in the last N hours",
    "forecast": "Chance of failing in the next 4 hours",
    "rule": "A Sentinel rule is passing",
}
ACTIONS = {"notify": "Tell my channels", "inspect": "Inspect or measure", "schedule_maintenance": "Schedule maintenance", "adjust_speed": "Lower the speed", "clear_jam": "Clear a jam", "restart_station": "Restart the station", "stop_station": "Stop the station"}
TYPES = {"trigger", "check", "decision", "action"}


def _all():
    d = store.load()
    return d, d.setdefault("playbooks", [])


def list_public():
    return {"playbooks": _all()[1], "sources": SOURCES, "actions": ACTIONS, "ops": engine.OPS, "no_value": list(engine.NO_VALUE)}


def validate(pb):
    nodes, edges = pb.get("nodes") or [], pb.get("edges") or []
    if len(nodes) > MAX_NODES:
        raise ValueError(f"At most {MAX_NODES} blocks in one playbook.")
    ids = set()
    for n in nodes:
        if n.get("type") not in TYPES or not n.get("id"):
            raise ValueError("A block has an unknown type.")
        ids.add(n["id"])
    if sum(1 for n in nodes if n["type"] == "trigger") != 1:
        raise ValueError("A playbook needs exactly one trigger.")
    for e in edges:
        if e.get("source") not in ids or e.get("target") not in ids:
            raise ValueError("A link points at a block that is not there.")
    for n in nodes:
        dd = n.get("data") or {}
        if n["type"] == "check" and dd.get("source") not in SOURCES:
            raise ValueError("A check needs a source.")
        if n["type"] == "action" and dd.get("kind") not in ACTIONS:
            raise ValueError("An action needs a kind.")


def save(pb):
    validate(pb)
    d, pbs = _all()
    pid = pb.get("id") or "pb_" + uuid.uuid4().hex[:8]
    rec = {"id": pid, "name": str(pb.get("name") or "My playbook")[:60], "enabled": bool(pb.get("enabled", True)), "nodes": pb["nodes"], "edges": pb["edges"], "saved": time.time()}
    for i, x in enumerate(pbs):
        if x["id"] == pid:
            pbs[i] = rec
            break
    else:
        if len(pbs) >= MAX_PLAYBOOKS:
            raise ValueError(f"At most {MAX_PLAYBOOKS} playbooks. Remove one first.")
        pbs.append(rec)
    store.save(d)
    return pid


def remove(pid):
    d, pbs = _all()
    d["playbooks"] = [x for x in pbs if x["id"] != pid]
    store.save(d)


def starter():
    """A first playbook the owner can change: if a station fails often, say so; if the forecast is high too, ask Warden for maintenance."""
    return {"name": "When a station fails", "enabled": True,
            "nodes": [
                {"id": "t", "type": "trigger", "position": {"x": 0, "y": 120}, "data": {"station": "*"}},
                {"id": "c1", "type": "check", "position": {"x": 240, "y": 120}, "data": {"source": "failures", "hours": 24, "path": "failures", "op": "gte", "value": "3"}},
                {"id": "c2", "type": "check", "position": {"x": 500, "y": 40}, "data": {"source": "forecast", "path": "p_fail_4h", "op": "gte", "value": "0.3"}},
                {"id": "a1", "type": "action", "position": {"x": 760, "y": 0}, "data": {"kind": "schedule_maintenance", "text": ""}},
                {"id": "a2", "type": "action", "position": {"x": 760, "y": 130}, "data": {"kind": "notify", "text": "{station} keeps failing. Please look at it."}},
                {"id": "a3", "type": "action", "position": {"x": 500, "y": 240}, "data": {"kind": "inspect", "text": ""}},
            ],
            "edges": [
                {"id": "e1", "source": "t", "target": "c1"},
                {"id": "e2", "source": "c1", "sourceHandle": "pass", "target": "c2"},
                {"id": "e3", "source": "c1", "sourceHandle": "fail", "target": "a3"},
                {"id": "e4", "source": "c2", "sourceHandle": "pass", "target": "a1"},
                {"id": "e5", "source": "c2", "sourceHandle": "fail", "target": "a2"},
            ]}


# ---------------------------------------------------------------- running
def _observe(data, station):
    src = data.get("source")
    if src == "failures":
        r = gate.call("playbook", "telemetry/failure_episodes", {"station": station, "hours": float(data.get("hours") or 24)})
        if not r.get("ok"):
            raise RuntimeError("the gateway refused the read: " + str(r.get("error") or r.get("reason") or "")[:120])
        return r.get("result") or {}
    if src == "forecast":
        r = gate.call("playbook", "telemetry/list_stations", {})
        if not r.get("ok"):
            raise RuntimeError("the gateway refused the read")
        return next((x for x in (r.get("result") or {}).get("stations", []) if str(x.get("name", "")).lower() == station.lower()), {})
    if src == "rule":
        from sentinel import service as SV
        res = SV.run_rule(data.get("rule_id"))
        return {"ok": bool(res["ok"]), "error": res.get("error")}
    raise ValueError("unknown check source")


def _act(data, station, trace):
    kind, text = data.get("kind"), str(data.get("text") or "").replace("{station}", station)
    if kind == "notify":
        from foreman import notify
        n = notify.dispatch(f"Playbook: {station}", text or f"A playbook ran for {station}.")
        return {"done": f"told {n} channel(s)" if n else "no channel is set up, so nobody was told"}
    from foreman import safety
    from foreman.agents import context_for
    action = {"kind": kind, "station": station, "params": {"type": "preventive"} if kind == "schedule_maintenance" else ({"max_speed_pct": 70} if kind == "adjust_speed" else {}), "why": text or f"A playbook asked for: {ACTIONS[kind]}"}
    sc = safety.score_action(action, context_for(station, 0.8))
    rec = None
    if sc["decision"] == "auto":
        rec = safety.apply(sc, None)
    elif sc["decision"] == "approve":
        from foreman import notify
        notify.dispatch(f"Approval needed: {station}", f"A playbook proposes: {sc['label']} (score {sc['score']}). A person must approve it in Tolerance.")
    return {"done": f"Warden scored it {sc['score']}: {sc['decision']}" + (" and it ran" if rec else ""), "score": sc["score"], "decision": sc["decision"], "violations": sc.get("violations", [])}


def run(pb, station):
    """Walk one playbook for one station. Returns the trace: every block visited and what it saw."""
    nodes = {n["id"]: n for n in pb["nodes"]}
    out_edges = {}
    for e in pb["edges"]:
        out_edges.setdefault(e["source"], []).append(e)
    start = next(n for n in pb["nodes"] if n["type"] == "trigger")
    trace, results, cur, seen = [], [], start["id"], set()
    while cur and cur not in seen and len(trace) < 40:
        seen.add(cur)
        n = nodes[cur]
        d = n.get("data") or {}
        label = None
        try:
            if n["type"] == "trigger":
                want = d.get("station") or "*"
                if want not in ("*", station):
                    trace.append({"id": cur, "type": "trigger", "text": f"This playbook is for {want}, not {station}", "ok": False})
                    break
                trace.append({"id": cur, "type": "trigger", "text": f"{station} failed", "ok": True})
            elif n["type"] == "check":
                obs = _observe(d, station)
                r = engine.evaluate(obs, {"path": d.get("path") or "ok", "op": d.get("op") or "eq", "value": d.get("value")})
                results.append(r["ok"])
                label = "pass" if r["ok"] else "fail"
                trace.append({"id": cur, "type": "check", "text": f"{engine.describe(d | {'path': d.get('path') or 'ok'})}: saw {r['error'] or r['actual']}", "ok": r["ok"], "branch": label})
            elif n["type"] == "decision":
                need = int(d.get("count") or 1)
                hits = sum(1 for x in results if x == (d.get("mode") != "fail"))
                ok = hits >= need
                label = "yes" if ok else "no"
                trace.append({"id": cur, "type": "decision", "text": f"{hits} of {len(results)} checks {'passed' if d.get('mode') != 'fail' else 'failed'}; need {need}", "ok": ok, "branch": label})
            elif n["type"] == "action":
                trace.append({"id": cur, "type": "action", "text": ACTIONS.get(d.get("kind"), "action"), **_act(d, station, trace), "ok": True})
        except Exception as e:
            trace.append({"id": cur, "type": n["type"], "text": f"{type(e).__name__}: {str(e)[:140]}", "ok": False, "error": True})
            break
        nxt = [e for e in out_edges.get(cur, []) if (label is None or e.get("sourceHandle") in (label, None))]
        cur = nxt[0]["target"] if nxt else None
    return {"station": station, "trace": trace, "at": time.time()}


def run_by_id(pid, station):
    pb = next((x for x in _all()[1] if x["id"] == pid), None)
    if not pb:
        raise ValueError("no such playbook")
    return run(pb, station)


def run_enabled_for(station):
    """Called after the operations flow: every enabled playbook whose trigger fits the station."""
    out = []
    for pb in _all()[1]:
        if pb.get("enabled"):
            try:
                out.append({"id": pb["id"], "name": pb["name"], **run(pb, station)})
            except Exception as e:
                out.append({"id": pb["id"], "name": pb["name"], "trace": [{"text": f"{type(e).__name__}: {str(e)[:120]}", "ok": False}]})
    return out
