"""Sentinel rules for one visitor: stored, proposed from the visitor's data, run, and reported. A rule that turns from passing to failing tells the visitor's channels."""
import time, uuid

from sentinel import checks, decide, engine, guard, protocols
from workspace import store

MAX_RULES = 30
KINDS = {"table": "A table of your data", "http": "A web address", "tcp": "A network port", "service": "A service on your network (MQTT, Redis, a database)", "decide": "AI-assisted: put texts into labels you choose", "claims": "What the documents say"}
_PRESET = {
    "rows_present": {"path": "rows", "op": "gt", "value": 0},
    "not_too_empty": {"path": "worst_null_rate", "op": "lte", "value": 0.5},
    "schema_same": {"path": "schema_unchanged", "op": "eq", "value": True},
}


def _state():
    d = store.load()
    return d, d.setdefault("sentinel", {"rules": [], "last": {}, "history": {}})


def public():
    d, s = _state()
    out = []
    for r in s["rules"]:
        last = s["last"].get(r["id"])
        out.append({**{k: v for k, v in r.items() if k != "baseline_cols"}, "last": last, "history": s["history"].get(r["id"], [])[-20:],
                    "text": [engine.describe(a) for a in r["assertions"]]})
    return {"rules": out, "engines": decide.ENGINES, "kinds": KINDS, "protocols": {k: {"title": v[0], "port": v[1], "kind": v[2]} for k, v in protocols.PROTOCOLS.items()}, "ops": engine.OPS, "no_value": list(engine.NO_VALUE), "tables": _tables()}


def columns(table):
    """Column names of one table, for the Decide rule's picker."""
    from connectors import registry as CR
    df = CR.lake_query("select column_name c from information_schema.columns where table_schema = 'lake' and table_name = '" + str(table).replace("'", "''") + "' order by ordinal_position")
    return [c for c in df["c"] if not c.startswith("_dlt")]


def _tables():
    try:
        from interpret import engine as E
        return [t for t in E.lake_tables() if not t.startswith("_dlt")]
    except Exception:
        return []


def add(name, kind, target, assertions, severity="warn"):
    if kind not in KINDS:
        raise ValueError("unknown kind")
    target = dict(target or {})
    if kind == "http":
        target["url"] = guard.check_url(target.get("url"))
    elif kind == "tcp":
        guard.check_host(str(target.get("host", "")), int(target.get("port", 0)))
        target = {"host": str(target["host"]), "port": int(target["port"])}
    elif kind == "service":
        proto = target.get("protocol")
        if proto not in protocols.PROTOCOLS:
            raise ValueError("choose a service type")
        if protocols.PROTOCOLS[proto][2] == "http":
            target = {"protocol": proto, "url": guard.check_url(target.get("url"))}
        else:
            port = int(target.get("port") or protocols.PROTOCOLS[proto][1])
            guard.check_host(str(target.get("host", "")), port)
            target = {"protocol": proto, "host": str(target["host"]), "port": port}
    elif kind == "decide":
        if target.get("source") not in ("table", "claims"):
            raise ValueError("choose where the texts come from")
        if target["source"] == "table" and not (target.get("table") and target.get("column")):
            raise ValueError("choose a table and a column")
        if target.get("engine", "gemini") == "laya":
            raise ValueError("Laya is not installed in this build. Choose Gemini.")
        if target.get("engine", "gemini") not in decide.ENGINES:
            raise ValueError("unknown engine")
        target = {"source": target["source"], "table": target.get("table", ""), "column": target.get("column", ""), "question": str(target.get("question") or "")[:300],
                  "options": decide.clean_options(target.get("options")), "engine": target.get("engine", "gemini")}
    elif kind == "table" and not target.get("table"):
        raise ValueError("choose a table")
    clean = []
    for a in assertions or []:
        if a.get("op") not in engine.OPS or not str(a.get("path", "")).strip():
            raise ValueError("each check needs a field and an operator")
        clean.append({"path": str(a["path"]).strip(), "op": a["op"], "value": a.get("value")})
    if not clean:
        raise ValueError("add at least one check")
    d, s = _state()
    if len(s["rules"]) >= MAX_RULES:
        raise ValueError(f"At most {MAX_RULES} rules. Remove one first.")
    rid = "sr_" + uuid.uuid4().hex[:8]
    s["rules"].append({"id": rid, "name": (name or KINDS[kind]).strip()[:60], "kind": kind, "target": target, "assertions": clean, "severity": "crit" if severity == "crit" else "warn"})
    store.save(d)
    return rid


def remove(rid):
    d, s = _state()
    s["rules"] = [r for r in s["rules"] if r["id"] != rid]
    s["last"].pop(rid, None)
    s["history"].pop(rid, None)
    store.save(d)


def propose():
    """Default rules for the visitor's connected data and documents. Existing rules are kept; nothing is added twice."""
    d, s = _state()
    have = {(r["kind"], str(r["target"]), r["name"]) for r in s["rules"]}
    added = 0
    for t in _tables():
        for name, keys in ((f"{t} has rows", ["rows_present"]), (f"{t} is not mostly empty", ["not_too_empty"]), (f"{t} keeps its columns", ["schema_same"])):
            if ("table", str({"table": t}), name) in have or len(s["rules"]) >= MAX_RULES:
                continue
            s["rules"].append({"id": "sr_" + uuid.uuid4().hex[:8], "name": name, "kind": "table", "target": {"table": t}, "assertions": [dict(_PRESET[k]) for k in keys], "severity": "warn"})
            added += 1
    if ("claims", str({}), "The documents agree with each other") not in have and len(s["rules"]) < MAX_RULES:
        s["rules"].append({"id": "sr_" + uuid.uuid4().hex[:8], "name": "The documents agree with each other", "kind": "claims", "target": {},
                           "assertions": [{"path": "conflicts", "op": "eq", "value": 0}, {"path": "hidden_orders_removed", "op": "eq", "value": 0}], "severity": "crit"})
        added += 1
    store.save(d)
    return added


def observe(rule):
    k, t = rule["kind"], rule["target"]
    if k == "table":
        return checks.table_observation(t["table"], rule.get("baseline_cols"))
    if k == "http":
        return checks.http_observation(t["url"])
    if k == "tcp":
        return checks.tcp_observation(t["host"], t["port"])
    if k == "decide":
        return decide.observe(t)
    if k == "service":
        return protocols.observe(t["protocol"], t.get("host", ""), t.get("port", 0), t.get("url", ""))
    if k == "claims":
        from documents import engine as DE
        st = DE.state()
        return {"facts": len(st["claims"]), "conflicts": len([c for c in st["conflicts"] if not c.get("resolved")]), "stations_only_in_text": len(st["ghosts"]),
                "gaps": len(st["gaps"]), "hidden_orders_removed": len(st["injections"])}
    raise ValueError("unknown kind")


def run_rule(rid):
    d, s = _state()
    rule = next((r for r in s["rules"] if r["id"] == rid), None)
    if not rule:
        raise ValueError("no such rule")
    try:
        obs = observe(rule)
        if rule["kind"] == "table" and "baseline_cols" not in rule:
            rule["baseline_cols"] = obs["columns"]   # the first look is what "unchanged" is measured against
        res = engine.run_assertions(obs, rule["assertions"])
        summary = {k: v for k, v in obs.items() if k not in ("columns", "headers", "json", "text")}
        out = {"at": time.time(), "ok": res["ok"], "results": res["results"], "seen": summary, "error": None}
    except Exception as e:
        out = {"at": time.time(), "ok": False, "results": [], "seen": {}, "error": f"{type(e).__name__}: {str(e)[:140]}"}
    before = s["last"].get(rid)
    s["last"][rid] = out
    s["history"].setdefault(rid, []).append(bool(out["ok"]))
    del s["history"][rid][:-60]
    store.save(d)
    if not out["ok"] and (before is None or before.get("ok")):
        try:
            from foreman import notify
            bad = [engine.describe(a) for a, r in zip(rule["assertions"], out["results"]) if not r["ok"]] or [out["error"]]
            notify.dispatch(f"Sentinel: {rule['name']} failed ({'critical' if rule['severity'] == 'crit' else 'warning'})", "; ".join(str(b) for b in bad[:3]))
        except Exception:
            pass
    return out


def run_all():
    d, s = _state()
    ids = [r["id"] for r in s["rules"]]
    for rid in ids:
        run_rule(rid)
    return public()
