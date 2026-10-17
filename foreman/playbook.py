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
    "reading": "A reading from a probe",
    "service": "A service on your server is running",
}
ACTIONS = {"notify": "Tell my channels", "inspect": "Inspect or measure", "schedule_maintenance": "Schedule maintenance", "adjust_speed": "Lower the speed", "adjust_temperature": "Lower the temperature", "clear_jam": "Clear a jam", "restart_station": "Restart the station", "stop_station": "Stop the station"}
TYPES = {"trigger", "check", "decision", "action"}


def _all():
    d = store.load()
    return d, d.setdefault("playbooks", [])


def list_public():
    from server import hostops as HO
    return {"playbooks": _all()[1], "sources": SOURCES, "actions": ACTIONS, "ops": engine.OPS, "no_value": list(engine.NO_VALUE),
            "stations": stations_list(), "units": {k: v["label"] for k, v in HO.UNITS.items()}}


def _probes():
    return (store.load().get("host") or {}).get("probes") or {}


def stations_list():
    """Every station a playbook can be about: the plant's stations, plus those a probe reading or a service it reports belongs to."""
    from server import hostops as HO, ws_api
    names = {s["name"] for s in (ws_api.twin_cached().get("stations") or []) if not str(s.get("id", "")).startswith("ghost:")}
    for k in _mqtt_readings():
        if k in HO.READINGS:
            names.add(HO.READINGS[k]["station"])
    for p in _probes().values():
        for k in (p.get("readings") or {}):
            if k in HO.READINGS:
                names.add(HO.READINGS[k]["station"])
        for u in (p.get("services") or {}):
            if u in HO.UNITS:
                names.update(HO._affects(u, HO.UNITS[u]))
    return sorted(names)


def signals(station):
    """Everything that is watched from one station, with the live value, so the owner can pick what a playbook should be about."""
    from documents import engine as DE
    from server import hostops as HO, ws_api
    from sentinel import service as SV
    low = str(station).lower()
    out, limits = [], []
    st = next((s for s in (ws_api.twin_cached().get("stations") or []) if str(s["name"]).lower() == low and not str(s.get("id", "")).startswith("ghost:")), None)
    if st and st.get("state") != "unknown":
        out.append({"id": "state", "kind": "state", "label": "Machine state", "now": st.get("state"), "source": "the machine data", "trigger": "fails"})
        if st.get("failures") is not None:
            out.append({"id": "failures", "kind": "failures", "label": "Failures in the last 24 hours", "now": st.get("failures"), "source": "the machine data", "op": "gte", "value": "3"})
        if st.get("p_fail") is not None:
            out.append({"id": "forecast", "kind": "forecast", "label": "Chance of failing in the next 4 hours", "now": round(float(st["p_fail"]), 2), "source": "the forecast", "op": "gte", "value": "0.3"})
    try:
        for g in DE.state().get("guardrails", []):
            if str(g.get("subject", "")).lower() == low and g.get("value") is not None:
                limits.append({"what": str(g["predicate"]).replace("_", " "), "predicate": g["predicate"], "value": g["value"], "doc": g.get("doc")})
    except Exception:
        pass
    lim = {x["predicate"]: x["value"] for x in limits}
    for pname, p in _probes().items():
        for k, v in (p.get("readings") or {}).items():
            meta = HO.READINGS.get(k)
            if meta and str(meta["station"]).lower() == low and v is not None:
                lv = lim.get(meta.get("limit")) if meta.get("limit") else None
                out.append({"id": "reading:" + k, "kind": "reading", "key": k, "label": meta["label"], "unit": meta["unit"], "now": round(float(v), 1), "source": f"probe {pname}", "limit": lv, "op": "gt"})
        for u, up in (p.get("services") or {}).items():
            meta = HO.UNITS.get(u)
            if meta and low in [x.lower() for x in HO._affects(u, meta)]:
                out.append({"id": "service:" + u, "kind": "service", "unit": u, "label": meta["label"], "now": "running" if up else "down", "source": f"probe {pname}", "carries": meta["what"]})
    have = {x.get("key") for x in out if x["kind"] == "reading"}
    for k, (v, where) in _mqtt_readings().items():
        meta = HO.READINGS.get(k)
        if meta and str(meta["station"]).lower() == low and k not in have:
            lv = lim.get(meta.get("limit")) if meta.get("limit") else None
            out.append({"id": "reading:" + k, "kind": "reading", "key": k, "label": meta["label"], "unit": meta["unit"], "now": round(float(v), 1), "source": where, "limit": lv, "op": "gt"})
    try:
        rules = [r["name"] for r in SV.public()["rules"] if station in (r.get("stations") or [])]
    except Exception:
        rules = []
    return {"station": station, "signals": out, "limits": limits, "rules": rules}


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
            rec.update({k: x[k] for k in ("armed", "last_run") if k in x})
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
def _reading_key(topic):
    """plant/pcb/oven/temp_c becomes oven_temp_c: the last two parts of the topic."""
    import re
    return re.sub(r"[^a-z0-9_]+", "_", "_".join(str(topic).strip("/").split("/")[-2:]).lower()).strip("_")


def _mqtt_readings(window_s=90):
    """The newest number on every topic of the MQTT streams this plant connected: {reading key: (value, where it came from)}."""
    out = {}
    try:
        from connectors import registry as CR
        for s in store.load().get("sources", []):
            if s.get("kind") != "mqtt_live":
                continue
            for t in (s.get("tables") or {}):
                if t.startswith("_dlt"):
                    continue
                df = CR.lake_query(f'select topic, payload, ts from lake."{t}" where ts > {time.time() - window_s} qualify row_number() over (partition by topic order by ts desc) = 1')
                for r in df.itertuples():
                    try:
                        v = float(str(r.payload).strip())
                    except Exception:
                        try:
                            import json
                            j = json.loads(str(r.payload))
                            v = float(j["value"] if isinstance(j, dict) and "value" in j else j)
                        except Exception:
                            continue
                    out[_reading_key(r.topic)] = (v, f"MQTT {s.get('name', '').split(' · ')[-1]}".strip())
    except Exception:
        pass
    return out


def _readings():
    """The latest readings in one place: what every probe reported, and the newest number on each topic of a connected MQTT stream."""
    out = {k: v for k, (v, _) in _mqtt_readings().items()}
    for p in ((store.load().get("host") or {}).get("probes") or {}).values():
        out.update({k: v for k, v in (p.get("readings") or {}).items() if v is not None})
    return out


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
    if src == "reading":
        return _readings()
    if src == "service":
        up = [bool((p.get("services") or {}).get(data.get("unit"))) for p in ((store.load().get("host") or {}).get("probes") or {}).values() if data.get("unit") in (p.get("services") or {})]
        if not up:
            raise RuntimeError("no probe has reported that service yet")
        return {"running": 1 if all(up) else 0}
    if src == "rule":
        from sentinel import service as SV
        res = SV.run_rule(data.get("rule_id"))
        return {"ok": bool(res["ok"]), "error": res.get("error")}
    raise ValueError("unknown check source")


def _act(data, station, trace, vars=None, dry=False):
    kind, text = data.get("kind"), str(data.get("text") or "").replace("{station}", station)
    for k, v in (vars or {}).items():   # {value} and {oven_temp_c} become what the check saw
        text = text.replace("{" + str(k) + "}", f"{v:g}" if isinstance(v, float) else str(v))
    if dry:
        return {"done": "would run", "dry": True}
    if kind == "notify":
        from foreman import notify
        dot = {"info": "\U0001F535", "warning": "\U0001F7E0", "critical": "\U0001F534"}.get(data.get("severity") or "", "")
        n = notify.dispatch(f"{dot + ' ' if dot else ''}Playbook: {station}", text or f"A playbook ran for {station}.", only=data.get("channel") or None)
        return {"done": f"told {n} channel(s)" if n else "no channel is set up, so nobody was told"}
    from foreman import safety
    from foreman.agents import context_for
    action = {"kind": kind, "station": station, "params": {"type": "preventive"} if kind == "schedule_maintenance" else ({"max_speed_pct": 70} if kind == "adjust_speed" else ({"max_temp_c": 235} if kind == "adjust_temperature" else {})), "why": text or f"A playbook asked for: {ACTIONS[kind]}"}
    sc = safety.score_action(action, context_for(station, 0.8))
    rec = None
    if sc["decision"] == "auto":
        rec = safety.apply(sc, None)
    elif sc["decision"] == "approve":
        from foreman import notify
        notify.dispatch(f"Approval needed: {station}", f"A playbook proposes: {sc['label']} (score {sc['score']}). A person must approve it in Tolerance.")
    return {"done": f"Warden scored it {sc['score']}: {sc['decision']}" + (" and it ran" if rec else ""), "score": sc["score"], "decision": sc["decision"], "violations": sc.get("violations", [])}


def run(pb, station, dry=False):
    """Walk one playbook for one station. Returns the trace: every block visited and what it saw. With dry=True nothing is sent or changed."""
    vars = {}
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
            if n["type"] == "trigger" and d.get("event") == "reading":
                station = d.get("station") or station or "OVN1"
                trace.append({"id": cur, "type": "trigger", "text": f"A probe reported a reading ({station})", "ok": True})
            elif n["type"] == "trigger":
                want = d.get("station") or "*"
                if want not in ("*", station):
                    trace.append({"id": cur, "type": "trigger", "text": f"This playbook is for {want}, not {station}", "ok": False})
                    break
                trace.append({"id": cur, "type": "trigger", "text": f"{station} failed", "ok": True})
            elif n["type"] == "check":
                obs = _observe(d, station)
                r = engine.evaluate(obs, {"path": d.get("path") or "ok", "op": d.get("op") or "eq", "value": d.get("value")})
                results.append(r["ok"])
                if r["actual"] is not None:
                    vars["value"] = vars[d.get("path") or "ok"] = r["actual"]
                label = "pass" if r["ok"] else "fail"
                trace.append({"id": cur, "type": "check", "text": f"{engine.describe(d | {'path': d.get('path') or 'ok'})}: saw {r['error'] or r['actual']}", "ok": r["ok"], "branch": label})
            elif n["type"] == "decision":
                need = int(d.get("count") or 1)
                hits = sum(1 for x in results if x == (d.get("mode") != "fail"))
                ok = hits >= need
                label = "yes" if ok else "no"
                trace.append({"id": cur, "type": "decision", "text": f"{hits} of {len(results)} checks {'passed' if d.get('mode') != 'fail' else 'failed'}; need {need}", "ok": ok, "branch": label})
            elif n["type"] == "action":
                trace.append({"id": cur, "type": "action", "text": ACTIONS.get(d.get("kind"), "action"), **_act(d, station, trace, vars, dry), "ok": True})
        except Exception as e:
            trace.append({"id": cur, "type": n["type"], "text": f"{type(e).__name__}: {str(e)[:140]}", "ok": False, "error": True})
            break
        nxt = [e for e in out_edges.get(cur, []) if (label is None or e.get("sourceHandle") in (label, None))]
        cur = nxt[0]["target"] if nxt else None
    return {"station": station, "trace": trace, "at": time.time()}


def on_report(rep):
    """A probe has reported. Every active playbook that starts from a probe reading is checked. It fires once when its checks first pass,
    and fires again only after they have stopped passing, so a reading that stays high does not send a message every few seconds."""
    import contextvars, threading
    ctx = contextvars.copy_context()

    def go():
        for pb in list(_all()[1]):
            try:
                trig = next((n for n in pb["nodes"] if n["type"] == "trigger"), None)
                if not pb.get("enabled") or not trig or (trig.get("data") or {}).get("event") != "reading":
                    continue
                probe = run(pb, "", dry=True)
                fired = any(s["type"] == "action" and s.get("ok") for s in probe["trace"]) and not any(s.get("error") for s in probe["trace"])
                armed = pb.get("armed", True)
                pid = pb["id"]
                if fired and armed:
                    res = run(pb, "")
                    store.update(lambda d, res=res, pid=pid: [p.update(armed=False, last_run={"at": time.time(), "trace": res["trace"]}) for p in d.get("playbooks", []) if p["id"] == pid])
                elif not fired and not armed:
                    store.update(lambda d, pid=pid: [p.update(armed=True) for p in d.get("playbooks", []) if p["id"] == pid])
            except Exception:
                continue
    threading.Thread(target=lambda: ctx.run(go), daemon=True, name="playbook-report").start()


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
