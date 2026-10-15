"""Sentinel rules for one visitor: stored, proposed from the visitor's data, run, and reported.
A rule that turns from passing to failing tells the visitor's channels, and so does one that recovers. Maintenance windows quiet a rule
while planned work is on. An impact map says which stations lose their data when a rule fails. A schedule runs the rules without a click."""
import re, secrets, time, uuid

from sentinel import checks, decide, engine, guard, heartbeat, protocols
from workspace import store

MAX_RULES, MAX_WINDOWS = 30, 12
KINDS = {"table": "A table of your data", "http": "A web address", "tcp": "A network port", "service": "A service on your network (MQTT, Redis, a database)",
         "tls": "A certificate (days until it expires)", "heartbeat": "A heartbeat (a machine or script calls in)", "decide": "AI-assisted: put texts into labels you choose", "claims": "What the documents say"}
_PRESET = {
    "rows_present": {"path": "rows", "op": "gt", "value": 0},
    "not_too_empty": {"path": "worst_null_rate", "op": "lte", "value": 0.5},
    "schema_same": {"path": "schema_unchanged", "op": "eq", "value": True},
}
_IMPACT = store.PerUser(lambda: {"t": 0.0, "v": {}})


def _state():
    d = store.load()
    s = d.setdefault("sentinel", {})
    s.setdefault("rules", [])
    s.setdefault("last", {})
    s.setdefault("history", {})
    s.setdefault("windows", [])
    s.setdefault("schedule", {"enabled": False, "every_min": 5, "last_run": 0, "tz_offset_min": 0})
    return d, s


# ---------------------------------------------------------------- the schedule
def schedule():
    return _state()[1]["schedule"]


def set_schedule(enabled, every_min, tz_offset_min):
    from sentinel import schedule as SCH
    every = int(every_min)
    if not SCH.MIN_EVERY <= every <= SCH.MAX_EVERY:
        raise ValueError(f"Run every {SCH.MIN_EVERY} to {SCH.MAX_EVERY} minutes.")
    d, s = _state()
    s["schedule"].update(enabled=bool(enabled), every_min=every, tz_offset_min=max(-720, min(840, int(tz_offset_min or 0))))
    SCH.mark(store.UID.get(), bool(enabled))
    store.save(d)
    return s["schedule"]


# ---------------------------------------------------------------- maintenance windows
def _mins(hhmm):
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(hhmm).strip())
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise ValueError("A time looks like 02:00.")
    return int(m.group(1)) * 60 + int(m.group(2))


def add_window(name, start, end, rules=None):
    a, b = _mins(start), _mins(end)
    if a == b:
        raise ValueError("The start and the end must differ.")
    d, s = _state()
    if len(s["windows"]) >= MAX_WINDOWS:
        raise ValueError(f"At most {MAX_WINDOWS} windows. Remove one first.")
    ids = {r["id"] for r in s["rules"]}
    s["windows"].append({"id": "mw_" + uuid.uuid4().hex[:6], "name": (name or "Maintenance").strip()[:60], "start": start.strip(), "end": end.strip(), "rules": [r for r in (rules or []) if r in ids]})
    store.save(d)


def remove_window(wid):
    d, s = _state()
    s["windows"] = [w for w in s["windows"] if w["id"] != wid]
    store.save(d)


def active_window(rid, s=None, now=None):
    """The maintenance window that is on now for this rule, or None. Windows are daily; one that ends before it starts crosses midnight."""
    s = s or _state()[1]
    t = time.gmtime((now if now is not None else time.time()) + s["schedule"].get("tz_offset_min", 0) * 60)
    cur = t.tm_hour * 60 + t.tm_min
    for w in s["windows"]:
        if w["rules"] and rid not in w["rules"]:
            continue
        a, b = _mins(w["start"]), _mins(w["end"])
        if (a <= cur < b) if a < b else (cur >= a or cur < b):
            return w
    return None


def propose_windows():
    """Windows from the maintenance times the documents state for each station. A window covers the rules that touch that station."""
    from documents import engine as DE
    d, s = _state()
    have = {w["name"] for w in s["windows"]}
    imp = impact_map(s)
    added = 0
    for g in DE.state().get("guardrails", []):
        if g["predicate"] != "maintenance_window" or not g.get("value") or g["status"] == "blocked":
            continue
        m = re.fullmatch(r"\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*", str(g["value"]))
        name = f"{g['subject']} maintenance (from {g.get('doc')})"
        if not m or name in have or len(s["windows"]) >= MAX_WINDOWS:
            continue
        rules = [rid for rid, sts in imp["rules"].items() if g["subject"] in sts]
        s["windows"].append({"id": "mw_" + uuid.uuid4().hex[:6], "name": name, "start": m.group(1), "end": m.group(2), "rules": rules})
        added += 1
    store.save(d)
    return added


# ---------------------------------------------------------------- the impact map
def _stations_of(rule, bound):
    t = rule["target"]
    if rule["kind"] in ("table", "decide") and t.get("table"):
        return sorted(bound.get(t["table"], []))
    return sorted(t.get("affects", []))


def impact_map(s=None, fresh=False):
    """Which stations lose their data if a rule fails: stations are tied to tables, and any other rule can name the stations it affects."""
    c = _IMPACT._cur()
    s = s or _state()[1]
    if fresh or time.time() - c["t"] > 20 or not c["v"].get("bound_ok"):
        bound = {}
        try:
            from workspace import twin
            for st in twin.build()["stations"]:
                if st.get("ghost") or str(st["id"]).startswith("ghost:"):
                    continue
                for b in st.get("binds", []):
                    bound.setdefault(b["table"], []).append(st["name"])
        except Exception:
            pass
        c["v"] = {"bound": bound, "bound_ok": True}
        c["t"] = time.time()
    bound = c["v"]["bound"]
    rules = {r["id"]: _stations_of(r, bound) for r in s["rules"]}
    failing = {}
    for r in s["rules"]:
        last = s["last"].get(r["id"])
        if last and not last["ok"] and not last.get("maintenance"):
            for st in rules[r["id"]]:
                failing.setdefault(st, []).append(r["name"])
    return {"rules": rules, "stations": failing}


# ---------------------------------------------------------------- reading and writing rules
def public():
    from foreman import notify
    d, s = _state()
    imp = impact_map(s)
    out = []
    for r in s["rules"]:
        last = s["last"].get(r["id"])
        extra = {"hb_url": f"{notify.public_url()}/api/hb/{r['target']['token']}"} if r["kind"] == "heartbeat" else {}
        out.append({**{k: v for k, v in r.items() if k != "baseline_cols"}, **extra, "last": last, "history": s["history"].get(r["id"], [])[-20:],
                    "text": [engine.describe(a) for a in r["assertions"]], "stations": imp["rules"].get(r["id"], []), "in_maintenance": bool(active_window(r["id"], s))})
    return {"rules": out, "engines": decide.ENGINES, "kinds": KINDS, "protocols": {k: {"title": v[0], "port": v[1], "kind": v[2]} for k, v in protocols.PROTOCOLS.items()},
            "ops": engine.OPS, "no_value": list(engine.NO_VALUE), "tables": _tables(), "schedule": s["schedule"], "windows": s["windows"], "impacted": imp["stations"],
            "stations": sorted({x for v in imp["rules"].values() for x in v})}


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


def _clean_target(kind, target, make_token=True):
    """Checks and tidies the target of a rule. Returns (target, token). Raises ValueError or guard.Refused."""
    if kind not in KINDS:
        raise ValueError("unknown kind")
    target = dict(target or {})
    affects = [str(x)[:40] for x in (target.get("affects") or [])][:20] if isinstance(target.get("affects"), list) else []
    token = None
    if kind == "http":
        target = {"url": guard.check_url(target.get("url"))}
    elif kind == "tcp":
        guard.check_host(str(target.get("host", "")), int(target.get("port", 0)))
        target = {"host": str(target["host"]), "port": int(target["port"])}
    elif kind == "tls":
        host, port = str(target.get("host", "")).strip(), int(target.get("port") or 443)
        guard.check_host(host, port)
        target = {"host": host, "port": port}
    elif kind == "heartbeat":
        token = secrets.token_urlsafe(18) if make_token else None
        target = {"token": token or "", "grace_s": max(10, min(86400 * 7, int(target.get("grace_s") or 300)))}
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
        if target.get("engine", "gemini") == "gemma":
            raise ValueError("The tuned Gemma is the next step and is not ready yet. Choose Gemini.")
        if target.get("engine", "gemini") not in decide.ENGINES:
            raise ValueError("unknown engine")
        target = {"source": target["source"], "table": target.get("table", ""), "column": target.get("column", ""), "question": str(target.get("question") or "")[:300],
                  "options": decide.clean_options(target.get("options")), "engine": target.get("engine", "gemini")}
    elif kind == "table" and not target.get("table"):
        raise ValueError("choose a table")
    if affects and kind not in ("table", "decide"):
        target["affects"] = affects
    return target, token


def add(name, kind, target, assertions, severity="warn"):
    target, token = _clean_target(kind, target)
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
    if token:
        heartbeat.ensure(token)
    store.save(d)
    return rid


def _flatten(obj, prefix="", depth=0, out=None):
    """The fields of an observation as a flat list, so the page can show them and let the owner click one."""
    out = [] if out is None else out
    if len(out) >= 60:
        return out
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("columns", "text", "headers") and prefix == "":
                continue
            _flatten(v, f"{prefix}.{k}" if prefix else str(k), depth + 1, out)
    elif isinstance(obj, list):
        out.append({"path": prefix, "value": f"{len(obj)} items", "type": "list"})
        if obj and isinstance(obj[0], dict) and depth < 3:
            _flatten(obj[0], prefix + "[*]", depth + 1, out)
    elif obj is not None:
        kind = "boolean" if isinstance(obj, bool) else "number" if isinstance(obj, (int, float)) else "text"
        out.append({"path": prefix, "value": str(obj)[:80], "type": kind})
    return out


def try_rule(kind, target):
    """Looks at the target once, without saving anything, and says which fields a check can use."""
    target, _ = _clean_target(kind, target, make_token=False)
    if kind == "heartbeat":
        return {"fields": _flatten({"seconds_since": 0, "beats": 0, "ever": False, "last_beat": "never"}), "note": "A heartbeat has nothing to look at yet. These are the fields it will have."}
    return {"fields": _flatten(observe({"kind": kind, "target": target}))}


def remove(rid):
    d, s = _state()
    gone = [r for r in s["rules"] if r["id"] == rid]
    s["rules"] = [r for r in s["rules"] if r["id"] != rid]
    s["last"].pop(rid, None)
    s["history"].pop(rid, None)
    for w in s["windows"]:
        w["rules"] = [x for x in w["rules"] if x != rid]
    for r in gone:
        if r["kind"] == "heartbeat":
            heartbeat.remove(r["target"]["token"])
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


# ---------------------------------------------------------------- running
def observe(rule):
    k, t = rule["kind"], rule["target"]
    if k == "table":
        return checks.table_observation(t["table"], rule.get("baseline_cols"))
    if k == "http":
        return checks.http_observation(t["url"])
    if k == "tcp":
        return checks.tcp_observation(t["host"], t["port"])
    if k == "tls":
        return checks.tls_observation(t["host"], t["port"])
    if k == "heartbeat":
        return heartbeat.observe(t["token"], t["grace_s"])
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


def _tell(title, text):
    try:
        from foreman import notify
        notify.dispatch(title, text)
    except Exception:
        pass


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
    win = active_window(rid, s)
    out["maintenance"] = win["name"] if win else None
    before = s["last"].get(rid)
    s["last"][rid] = out
    s["history"].setdefault(rid, []).append(None if win else bool(out["ok"]))   # a run during maintenance is shown grey, not red
    del s["history"][rid][:-60]
    store.save(d)
    if win:
        return out
    stations = impact_map(s)["rules"].get(rid, [])
    if not out["ok"] and (before is None or before.get("ok") or before.get("maintenance")):
        bad = [engine.describe(a) for a, r in zip(rule["assertions"], out["results"]) if not r["ok"]] or [out["error"]]
        _tell(f"Sentinel: {rule['name']} failed ({'critical' if rule['severity'] == 'crit' else 'warning'})", "; ".join(str(b) for b in bad[:3]) + (f". Affects: {', '.join(stations[:8])}." if stations else ""))
    elif out["ok"] and before is not None and not before.get("ok") and not before.get("maintenance"):
        _tell(f"Sentinel: {rule['name']} is back", "The rule passes again." + (f" Affects: {', '.join(stations[:8])}." if stations else ""))
    return out


def run_all(scheduled=False):
    d, s = _state()
    for r in list(s["rules"]):
        if scheduled and r["kind"] == "decide":
            continue   # a model call on every tick would cost too much: Decide runs only when a person asks
        run_rule(r["id"])
    if scheduled:
        d, s = _state()
        s["schedule"]["last_run"] = time.time()
        store.save(d)
    return public()
