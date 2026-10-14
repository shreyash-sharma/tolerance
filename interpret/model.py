"""The reviewable model: interpretation items + the person's corrections = the effective model that everything else uses.
Corrections are recorded, versioned, and change real downstream behaviour: the state mapping decides what counts as a failure,
rejected dependencies leave the graph (and the investigator's digest and the permission boundaries), renamed entities are renamed everywhere."""
import time

from interpret import engine as E
from workspace import store

_cache = {"items": None, "profiles": None, "at": 0}


def build_items(force=False, oir=None):
    """Compute raw items from the lake (plus the compiled dependency graph if there is one)."""
    profiles = E.profile_all()
    state_logs = E.find_state_logs(profiles)
    ents, mixed, ids = E.find_identity(profiles)
    links = E.find_links(ids)
    ann = E.annotate(profiles, state_logs, ents)
    items = []
    for p in profiles:
        items.append({"id": f"table:{p['table']}", "type": "table", "title": p["table"], "confidence": .8 if ann["by"] == "gemini" else .65,
                      "summary": ann["tables"].get(p["table"], {}).get("purpose", ""), "by": ann["by"],
                      "detail": {"rows": p["rows"], "columns": [{k: c[k] for k in ("name", "type", "role", "distinct", "nulls", "samples")} for c in p["columns"]]}})
    for sl in state_logs:
        stats = E.state_stats(sl)
        labels, conf = E.propose_state_labels(stats)
        items.append({"id": f"state:{sl['table']}", "type": "state_map", "title": f"Machine states in {sl['table']}", "confidence": round(min(conf.values()) if conf else .5, 2),
                      "summary": "Which status code means what. This decides what counts as a failure.", "by": "heuristic",
                      "detail": {**sl, "stats": stats, "labels": {str(k): v for k, v in labels.items()}, "confidence_by_code": {str(k): v for k, v in conf.items()}, "notes": ann.get("state_notes", "")}})
    for i, e in enumerate(ents):
        items.append({"id": f"entity:{e['shape']}", "type": "entity", "title": ann["entities"][i] if i < len(ann["entities"]) else E._heuristic_entity(e), "confidence": e["confidence"],
                      "summary": f"{len(e['fields'])} fields that hold the same kind of identifier, e.g. {e['example']}.", "by": ann["by"], "detail": {"fields": e["fields"], "example": e["example"], "shape": e["shape"]}})
    for m in mixed:
        items.append({"id": f"q:mixed:{m['field']}", "type": "question", "title": f"{m['field']} holds more than one kind of identifier", "confidence": .3,
                      "summary": "The values follow different patterns. Which entity does this column mainly refer to?", "by": "heuristic",
                      "detail": {"field": m["field"], "examples": m["examples"], "shapes": m["shapes"], "options": [it["title"] for it in items if it["type"] == "entity"] + ["Leave unresolved"]}})
    for l in links:
        items.append({"id": f"link:{l['from']}>{l['to']}", "type": "link", "title": f"{l['from']}  {'↔' if l.get('kind') == 'same set' else '→'}  {l['to']}", "confidence": l["containment"],
                      "summary": (f"Both columns hold the same set of identifiers ({l['shared']} values): one row on each side per entity." if l.get("kind") == "same set" else f"{int(l['containment'] * 100)}% of the values in the first column appear in the second, so it probably references it ({l['shared']} shared values)."), "by": "heuristic", "detail": l})
    tables = {p["table"] for p in profiles}
    if "service_catalog" in tables:
        from connectors import registry as CR
        cat = CR.lake_query("select system, service, in_logs, in_traces, metric_series from lake.service_catalog order by 1,2")
        names = {"ob": "Online Boutique", "ss": "Sock Shop", "tt": "Train Ticket"}
        for sysid, g in cat.groupby("system"):
            items.append({"id": f"entity:svc:{sysid}", "type": "entity", "title": f"SERVICE ({names.get(sysid, sysid)})", "confidence": .9,
                          "summary": f"{len(g)} services seen in metrics, logs or traces of {names.get(sysid, sysid)}; {int(g.in_traces.sum())} appear in traces, {int(g.in_logs.sum())} in logs.", "by": "catalog",
                          "detail": {"fields": [f"{sysid}.{x}" for x in g.service], "example": g.service.iloc[0], "shape": "service", "system": sysid}})
    if "trace_edges" in tables:
        from connectors import registry as CR
        te = CR.lake_query("select system, caller, callee, calls, error_rate from lake.trace_edges order by calls desc")
        for r in te.itertuples():
            items.append({"id": f"dep:svc:{r.system}:{r.caller}>{r.callee}", "type": "dependency", "title": f"{r.caller}  calls  {r.callee}", "confidence": round(min(.99, .6 + r.calls / 200000), 2),
                          "summary": f"Seen {int(r.calls):,} times in traces of {r.system.upper()}" + (f"; {r.error_rate:.1%} of those calls errored." if r.error_rate else "."), "by": "traces",
                          "detail": {"src": r.caller, "dst": r.callee, "system": r.system, "type": "calls", "status": "observed", "count": int(r.calls), "errors": 0, "last_error": None, "svc": True}})
    if oir:
        for a, b, d in oir["graph"].edges(data=True):
            items.append({"id": f"dep:{a}>{b}:{d['type']}", "type": "dependency", "title": f"{a.split(':')[1]}  {d['type']}  {b.split(':')[1]}", "confidence": d.get("confidence", .85),
                          "summary": f"Seen {d['count']} times at runtime ({d['status']})." + (f" {d['errors']} errors." if d.get("errors") else ""), "by": "traces",
                          "detail": {"src": a, "dst": b, "type": d["type"], "status": d["status"], "count": d["count"], "errors": d["errors"], "last_error": d.get("last_error")}})
        for en in oir.get("entities", []):
            items.append({"id": f"entity:oir:{en['shape']}", "type": "entity", "title": en.get("class", en["shape"]), "confidence": .9,
                          "summary": f"{len(en['fields'])} fields across the plant's systems that hold the same identifier, e.g. {en['example']}.", "by": "compiler", "detail": {"fields": en["fields"], "example": en["example"], "shape": en["shape"], "oir": True}})
        for u in oir["uncertainty"]:
            if u["kind"] == "ambiguous_identifier":
                items.append({"id": f"q:mixed:{u['subject']}", "type": "question", "title": f"{u['subject']} holds more than one kind of identifier", "confidence": .3,
                              "summary": "The values follow different patterns. Which entity does this column mainly refer to?", "by": "compiler",
                              "detail": {"field": u["subject"], "examples": [c["example"] for c in u.get("candidates", [])], "shapes": [c["shape"] for c in u.get("candidates", [])],
                                         "options": [en.get("class", en["shape"]) for en in oir.get("entities", [])] + ["Leave unresolved"]}})
                continue
            if False:
                continue
            items.append({"id": f"q:unc:{u['kind']}:{u['subject']}", "type": "question", "title": u["subject"], "confidence": .4, "summary": u["note"], "by": "compiler",
                          "detail": {"kind": u["kind"], "options": ["Keep it out of the model", "Include it"] if u["kind"] == "declared_not_observed" else ["Keep it", "Remove it"]}})
    _cache.update(items=items, profiles=profiles, at=time.time())
    return items


def corrections_by_id():
    out = {}
    for c in store.load()["corrections"]:
        out[c["id"]] = c
    return out


def reviewed_items(force=False, oir=None):
    items = _cache["items"] if (_cache["items"] is not None and not force) else build_items(force=True, oir=oir)
    cor = corrections_by_id()
    out = []
    for it in items:
        c = cor.get(it["id"])
        x = dict(it)
        x["status"] = "proposed"
        x["correction"] = None
        if c:
            x["status"] = {"approve": "approved", "reject": "rejected", "edit": "edited", "answer": "answered"}.get(c["action"], "proposed")
            x["correction"] = {"action": c["action"], "value": c.get("value"), "at": c["at"], "note": c.get("note")}
        out.append(x)
    return out


def correct(item_id, action, value=None, note=None):
    rec = {"id": item_id, "action": action, "value": value, "note": note, "at": time.time(), "by": "operator"}
    store.update(lambda d: d["corrections"].append(rec))
    return rec


def undo(item_id):
    store.update(lambda d: d.__setitem__("corrections", [c for c in d["corrections"] if c["id"] != item_id]))


def summary(items):
    n = len(items)
    by = {}
    for it in items:
        by[it["status"]] = by.get(it["status"], 0) + 1
    reviewed = n - by.get("proposed", 0)
    return {"items": n, "reviewed": reviewed, "approved": by.get("approved", 0), "edited": by.get("edited", 0), "rejected": by.get("rejected", 0), "answered": by.get("answered", 0),
            "open": by.get("proposed", 0), "open_questions": sum(1 for it in items if it["type"] == "question" and it["status"] == "proposed"),
            "mean_confidence": round(sum(it["confidence"] for it in items) / n, 2) if n else 0}


# ------------------------------------------------------------------ the effective model
def effective(items):
    """What the rest of the system uses: state mapping, entity names, links, rejected dependencies."""
    eff = {"state": None, "entities": {}, "rejected_deps": [], "included_deps": [], "tables_off": [], "links": []}
    for it in items:
        c = it["correction"]
        if it["type"] == "table" and it["status"] == "rejected":
            eff["tables_off"].append(it["title"])
        elif it["type"] == "state_map":
            d = it["detail"]
            labels = {int(k): v for k, v in d["labels"].items()}
            if c and c["action"] == "edit" and isinstance(c["value"], dict):
                labels = {int(k): v for k, v in c["value"].items()}
            if it["status"] != "rejected":
                fail = next((k for k, v in labels.items() if v == "failed"), None)
                cand = {"table": d["table"], "ts": d["ts"], "asset": d["asset"], "status": d["status"], "labels": labels, "fail": fail, "reviewed": it["status"] in ("approved", "edited"), "rows": d.get("rows", 0)}
                cur = eff["state"]
                # several state logs: use the one you reviewed, then the biggest
                if cur is None or (cand["reviewed"], cand["rows"]) > (cur["reviewed"], cur["rows"]):
                    eff["state"] = cand
        elif it["type"] == "entity" and it["status"] == "rejected" and it["detail"].get("system"):
            eff.setdefault("rejected_systems", []).append(it["detail"]["system"])
        elif it["type"] == "entity" and it["status"] != "rejected":
            name = it["title"]
            if c and c["action"] == "edit" and c.get("value"):
                name = str(c["value"])
            eff["entities"][it["id"]] = {"name": name, "fields": d_fields(it), "reviewed": it["status"] in ("approved", "edited")}
        elif it["type"] == "link" and it["status"] != "rejected":
            eff["links"].append(it["detail"])
        elif it["type"] == "dependency" and it["status"] == "rejected":
            if it["detail"].get("svc"):
                eff.setdefault("rejected_svc_edges", []).append((it["detail"]["system"], it["detail"]["src"], it["detail"]["dst"]))
            else:
                eff["rejected_deps"].append((it["detail"]["src"], it["detail"]["dst"], it["detail"]["type"]))
        elif it["type"] == "question" and it["status"] == "answered":
            eff.setdefault("answers", {})[it["id"]] = c["value"]
    return eff


def d_fields(it):
    return it["detail"].get("fields", [])


def apply_to_oir(oir, eff, items=None):
    """Apply the person's corrections to the compiled model: drop rejected dependencies, rename entities, resolve the mixed-identifier questions."""
    G = oir["graph"]
    removed = 0
    for a, b, t in eff["rejected_deps"]:
        if G.has_edge(a, b) and G[a][b].get("type") == t:
            G.remove_edge(a, b)
            removed += 1
    oir["stats"]["edges"] = G.number_of_edges()
    rej = set(eff["rejected_deps"])
    oir["spec"]["edges"] = [e for e in oir["spec"]["edges"] if (e["src"], e["dst"], e["type"]) not in rej]
    renamed = 0
    for en in oir.get("entities", []):
        v = eff["entities"].get(f"entity:oir:{en['shape']}")
        if v and v["name"] != en.get("class"):
            oir["entity_chain"] = [v["name"] if c == en.get("class") else c for c in oir.get("entity_chain", [])]
            en["class"] = v["name"]
            renamed += 1
    resolved = 0
    for qid, answer in (eff.get("answers") or {}).items():
        if qid.startswith("q:mixed:") and answer and answer != "Leave unresolved":
            field = qid[len("q:mixed:"):]
            en = next((e for e in oir.get("entities", []) if e.get("class") == answer), None)
            if en and field not in en["fields"]:
                en["fields"].append(field)
                oir["uncertainty"] = [u for u in oir["uncertainty"] if not (u["kind"] == "ambiguous_identifier" and u["subject"] == field)]
                resolved += 1
    return {"removed": removed, "renamed": renamed, "resolved": resolved}


def record_version(summary_, note):
    def f(d):
        v = {"version": len(d["versions"]) + 1, "at": time.time(), "note": note, "summary": summary_}
        d["versions"].append(v)
        return v
    return store.update(f)
