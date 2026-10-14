"""The plant map: the interpreted model projected as a graph of things and links, plus a chat that edits it.
Nodes are sources, data tables, machines, systems and services. Links are where data comes from, which system a table describes, and who calls whom.
Every edit the chat makes is the same correction a person could make by hand (approve / reject / rename), recorded the same way, so nothing bypasses review."""
import json, time

from connectors import registry as CR
from interpret import model as M, engine as E
from workspace import store
from fabric import agents as FA


def _layout():
    return store.load().get("layout", {})


def save_layout(pos):
    def f(d):
        d.setdefault("layout", {}).update({k: [round(float(v[0]), 4), round(float(v[1]), 4)] for k, v in pos.items()})
    store.update(f)


def build():
    items = M.reviewed_items()
    d = store.load()
    nodes, edges = [], []
    seen = set()

    def node(i, kind, label, **kw):
        if i in seen:
            return
        seen.add(i)
        nodes.append({"id": i, "kind": kind, "label": label, **kw})

    for s in d["sources"]:
        node("src:" + s["id"], "source", s["name"], rows=s.get("rows", 0), live=bool(s.get("live")), conf=1.0, status="connected" if not s.get("error") else "error")
    owner = {}
    for s in d["sources"]:
        for t in s.get("tables", {}):
            owner[t] = s["id"]
    by_id = {i["id"]: i for i in items}
    for it in items:
        if it["type"] == "table" and not it["title"].startswith("_dlt"):
            node("tbl:" + it["title"], "data", it["title"], rows=it["detail"]["rows"], conf=it["confidence"], status=it["status"], item=it["id"], summary=it["summary"])
            if it["title"] in owner:
                edges.append({"a": "src:" + owner[it["title"]], "b": "tbl:" + it["title"], "kind": "feeds"})
    for it in items:
        if it["type"] == "state_map" and it["status"] != "rejected":
            dd = it["detail"]
            try:
                assets = CR.lake_query(f'select distinct "{dd["asset"]}" a from lake."{dd["table"]}" order by 1 limit 24')["a"].tolist()
            except Exception:
                assets = []
            for a in assets:
                node(f"mach:{a}", "machine", str(a), conf=it["confidence"], status=it["status"], item=it["id"], summary="A machine seen in the state log.")
                edges.append({"a": "tbl:" + dd["table"], "b": f"mach:{a}", "kind": "describes"})
    cat_tbl = "tbl:service_catalog" if "tbl:service_catalog" in {n["id"] for n in nodes} else None
    for it in items:
        if it["type"] == "entity" and it["detail"].get("system"):
            sy = it["detail"]["system"]
            node(f"sys:{sy}", "system", it["title"], conf=it["confidence"], status=it["status"], item=it["id"], summary=it["summary"])
            if cat_tbl:
                edges.append({"a": cat_tbl, "b": f"sys:{sy}", "kind": "describes"})
            if it["status"] == "rejected":
                continue
            for f in it["detail"]["fields"]:
                sv = f.split(".", 1)[1]
                node(f"svc:{sy}:{sv}", "service", sv, group=f"sys:{sy}", conf=it["confidence"], status="ok")
                edges.append({"a": f"sys:{sy}", "b": f"svc:{sy}:{sv}", "kind": "member"})
    for it in items:
        if it["type"] == "dependency" and it["detail"].get("svc"):
            dd = it["detail"]
            a, b = f"svc:{dd['system']}:{dd['src']}", f"svc:{dd['system']}:{dd['dst']}"
            if a in seen and b in seen:
                edges.append({"a": a, "b": b, "kind": "calls", "item": it["id"], "status": it["status"], "count": dd.get("count", 0), "errors": dd.get("errors", 0), "conf": it["confidence"]})
    return {"nodes": nodes, "edges": edges, "layout": _layout(), "summary": M.summary(items) if items else None}


# ------------------------------------------------------------------ chat: Gemini edits the map through the same corrections a person makes
TOOLS = {
    "find_nodes": ("Find nodes whose label contains the text. Returns id, kind and label.", {"query": "STRING"}),
    "describe_node": ("Describe one node: kind, confidence, summary, and the nodes it links to and from.", {"node": "STRING"}),
    "reject_link": ("Mark a call between two services as not real (the person's correction). Use ids from find_nodes.", {"caller": "STRING", "callee": "STRING"}),
    "restore_link": ("Undo a rejection of a call between two services.", {"caller": "STRING", "callee": "STRING"}),
    "approve": ("Approve what the system inferred about a node (sets it reviewed).", {"node": "STRING"}),
    "rename": ("Rename a system or table in the model, in the person's words.", {"node": "STRING", "name": "STRING"}),
    "move_node": ("Move a node on the canvas. x and y are 0..1 fractions of the canvas (0,0 top left).", {"node": "STRING", "x": "NUMBER", "y": "NUMBER"}),
    "move_near": ("Move one node next to another on the canvas.", {"node": "STRING", "target": "STRING"}),
    "focus": ("Highlight nodes on the canvas for the person (comma separated ids).", {"nodes": "STRING"}),
    "rebuild_model": ("Apply all pending corrections: rebuilds the model, policy and dashboards.", {}),
    "list_stations": ("List the stations on the factory floor with state and position (x,y are 0..1 fractions) and bound tables.", {}),
    "move_station": ("Move a station on the floor. x and y are 0..1 fractions (0,0 top left).", {"station": "STRING", "x": "NUMBER", "y": "NUMBER"}),
    "arrange_line": ("Arrange stations in the given order as a flow (a snaking line of rows, four per row, so arrows are visible) and draw the material flow between consecutive ones. stations is a comma separated list of names or ids.", {"stations": "STRING", "y": "NUMBER"}),
    "add_station": ("Add a new station to the floor.", {"name": "STRING", "x": "NUMBER", "y": "NUMBER"}),
    "connect_stations": ("Draw a material flow from one station to another.", {"a": "STRING", "b": "STRING"}),
    "bind_table": ("Bind a data table to a station, so its data shows in the station's live view. Use list_tables to see tables.", {"station": "STRING", "table": "STRING"}),
    "rename_station": ("Rename a station.", {"station": "STRING", "name": "STRING"}),
    "list_tables": ("List the data tables available to bind.", {}),
}
SYSTEM = """You are the assistant inside Tolerance. The person works on two views of their plant: the factory floor (stations, the flow between them, the data each sends) and the systems map (services and calls). Use the floor tools for stations and the map tools for services. The person is looking at a graph of what the system believes their plant is: sources, data tables, machines, systems and the services inside them, with calls between services.
Help them understand it and correct it. Use the tools; never invent nodes. Find ids with find_nodes before acting. Prefer small, reversible edits and say exactly what you changed.
Corrections are the person's decisions: only reject, rename or approve when they ask or clearly agree. After editing links or names, tell them to apply the corrections (or call rebuild_model if they ask).
Answer briefly in plain language. Do not use words like cell or module."""


class Ctx:
    def __init__(self):
        self.g = build()
        self.nodes = {n["id"]: n for n in self.g["nodes"]}
        self.actions = []

    def refresh(self):
        self.g = build()
        self.nodes = {n["id"]: n for n in self.g["nodes"]}

    def _edge(self, a, b):
        return next((e for e in self.g["edges"] if e["a"] == a and e["b"] == b and e["kind"] == "calls"), None)

    def call(self, name, a):
        self.calls = getattr(self, "calls", []) + [{"tool": name, "args": a}]
        try:
            return getattr(self, "t_" + name)(**a)
        except Exception as e:
            return {"error": f"{type(e).__name__}: {e}"}

    def t_find_nodes(self, query):
        q = query.lower()
        return {"matches": [{"id": n["id"], "kind": n["kind"], "label": n["label"]} for n in self.nodes.values() if q in n["label"].lower() or q in n["id"].lower()][:15]}

    def t_describe_node(self, node):
        n = self.nodes.get(node)
        if not n:
            return {"error": "no such node"}
        out = [e for e in self.g["edges"] if e["a"] == node and e["kind"] != "member"]
        inn = [e for e in self.g["edges"] if e["b"] == node and e["kind"] != "member"]
        return {"id": node, "kind": n["kind"], "label": n["label"], "confidence": n.get("conf"), "status": n.get("status"), "summary": n.get("summary"),
                "links_to": [{"node": e["b"], "kind": e["kind"], "status": e.get("status")} for e in out][:20], "links_from": [{"node": e["a"], "kind": e["kind"], "status": e.get("status")} for e in inn][:20]}

    def _set(self, item, action, value=None):
        M.correct(item, action, value)
        self.actions.append({"type": "item", "item": item, "action": action})
        self.refresh()

    def t_reject_link(self, caller, callee):
        e = self._edge(caller, callee)
        if not e:
            return {"error": "no such call between those nodes"}
        self._set(e["item"], "reject")
        return {"ok": True, "rejected": f"{caller} -> {callee}", "note": "pending: apply corrections to rebuild"}

    def t_restore_link(self, caller, callee):
        e = self._edge(caller, callee)
        if not e:
            return {"error": "no such call between those nodes"}
        M.undo(e["item"])
        self.actions.append({"type": "item", "item": e["item"], "action": "undo"})
        self.refresh()
        return {"ok": True}

    def t_approve(self, node):
        n = self.nodes.get(node)
        if not n or not n.get("item"):
            return {"error": "that node has nothing to approve"}
        self._set(n["item"], "approve")
        return {"ok": True}

    def t_rename(self, node, name):
        n = self.nodes.get(node)
        if not n or not n.get("item") or n["kind"] not in ("system", "data"):
            return {"error": "only systems and tables can be renamed"}
        self._set(n["item"], "edit", name)
        return {"ok": True, "renamed_to": name}

    def t_move_node(self, node, x, y):
        if node not in self.nodes:
            return {"error": "no such node"}
        x, y = max(0.03, min(0.97, float(x))), max(0.04, min(0.96, float(y)))
        save_layout({node: [x, y]})
        self.actions.append({"type": "move", "node": node, "x": x, "y": y})
        return {"ok": True}

    def t_move_near(self, node, target):
        lay = _layout()
        if node not in self.nodes or target not in self.nodes:
            return {"error": "no such node"}
        tx, ty = lay.get(target, [0.5, 0.5])
        return self.t_move_node(node, tx + 0.05, ty + 0.06)

    def t_focus(self, nodes):
        ids = [x.strip() for x in str(nodes).split(",") if x.strip() in self.nodes]
        self.actions.append({"type": "focus", "nodes": ids})
        return {"ok": True, "focused": ids}

    # ---- factory floor
    def _st(self, ref):
        from workspace import twin as T
        d = T.build()
        self._stations = d["stations"]
        r = str(ref).strip().lower()
        for s_ in self._stations:
            if s_["id"].lower() == r or s_["name"].lower() == r or (s_.get("asset") or "").lower() == r:
                return s_
        return None

    def t_list_stations(self):
        from workspace import twin as T
        d = T.build()
        return {"stations": [{"id": s_["id"], "name": s_["name"], "state": s_["state"], "x": round(s_["x"], 2), "y": round(s_["y"], 2), "tables": [b["table"] for b in s_.get("binds", [])]} for s_ in d["stations"]]}

    def t_list_tables(self):
        from workspace import twin as T
        return {"tables": T._tables()}

    def t_move_station(self, station, x, y):
        from workspace import twin as T
        s_ = self._st(station)
        if not s_:
            return {"error": "no such station"}
        T.move(s_["id"], max(.06, min(.84, float(x))), max(.08, min(.92, float(y))))
        self.actions.append({"type": "twin"})
        return {"ok": True}

    def t_arrange_line(self, stations, y=0.5):
        from workspace import twin as T
        refs = [r.strip() for r in str(stations).split(",") if r.strip()]
        found = [self._st(r) for r in refs]
        if not found or any(f is None for f in found):
            return {"error": "unknown station in the list", "unknown": [r for r, f in zip(refs, found) if f is None]}
        n = len(found)
        per = 4 if n > 4 else n
        rows = (n + per - 1) // per
        y0 = max(.2, min(.8 - .26 * (rows - 1), float(y) - .13 * (rows - 1)))
        for i, s_ in enumerate(found):
            r, c = divmod(i, per)
            if r % 2:
                c = per - 1 - c
            T.move(s_["id"], .14 + (.64 * c / max(per - 1, 1)), y0 + .26 * r)
        for a, b in zip(found, found[1:]):
            T.set_flow(a["id"], b["id"], "approved")
        self.actions.append({"type": "twin"})
        return {"ok": True, "order": [f["name"] for f in found]}

    def t_add_station(self, name, x=0.5, y=0.5):
        from workspace import twin as T
        sid = T.add_station(name, max(.06, min(.84, float(x))), max(.08, min(.92, float(y))))
        self.actions.append({"type": "twin"})
        return {"ok": True, "id": sid}

    def t_connect_stations(self, a, b):
        from workspace import twin as T
        sa, sb = self._st(a), self._st(b)
        if not sa or not sb:
            return {"error": "no such station"}
        T.set_flow(sa["id"], sb["id"], "approved")
        self.actions.append({"type": "twin"})
        return {"ok": True}

    def t_bind_table(self, station, table):
        from workspace import twin as T
        s_ = self._st(station)
        if not s_ or table not in T._tables():
            return {"error": "no such station or table", "tables": T._tables()}
        T.bind(s_["id"], table)
        self.actions.append({"type": "twin"})
        return {"ok": True}

    def t_rename_station(self, station, name):
        from workspace import twin as T
        s_ = self._st(station)
        if not s_:
            return {"error": "no such station"}
        T.rename(s_["id"], name)
        self.actions.append({"type": "twin"})
        return {"ok": True}

    def t_rebuild_model(self):
        self.actions.append({"type": "rebuild"})
        return {"ok": True, "note": "the app will rebuild the model now"}


def digest(g):
    kinds = {}
    for n in g["nodes"]:
        kinds[n["kind"]] = kinds.get(n["kind"], 0) + 1
    systems = [n["label"] + f" ({n['id']})" for n in g["nodes"] if n["kind"] == "system"]
    rej = sum(1 for e in g["edges"] if e.get("status") == "rejected")
    try:
        from workspace import twin as T
        st = ", ".join(f"{s_['name']} ({s_['state']})" for s_ in T.build()["stations"])
    except Exception:
        st = "none"
    return f"MAP: {kinds}. Systems: {', '.join(systems) or 'none'}. Rejected calls so far: {rej}. Floor stations: {st or 'none'}."


def chat(message, history=None, max_turns=8, replay=False):
    from workspace import demo_cache as DC
    key = DC.chat_key(message)
    if replay:
        rec = DC.get(key)
        if rec:
            ctx = Ctx()
            for c in rec["calls"]:
                ctx.call(c["tool"], c["args"])
            return {"reply": rec["reply"], "actions": ctx.actions, "steps": rec["steps"], "seconds": 0.0, "recorded": True}
    from google.genai import types
    ctx = Ctx()
    props = {"STRING": types.Schema(type="STRING"), "NUMBER": types.Schema(type="NUMBER")}
    decls = [types.FunctionDeclaration(name=n, description=d, parameters=types.Schema(type="OBJECT", properties={k: props[v] for k, v in p.items()}) if p else None) for n, (d, p) in TOOLS.items()]
    client = FA.make_client()
    contents = [types.Content(role=h["role"], parts=[types.Part(text=h["text"])]) for h in (history or [])[-8:]]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    cfg = types.GenerateContentConfig(system_instruction=SYSTEM + "\n" + digest(ctx.g), tools=[types.Tool(function_declarations=decls)], temperature=0.2,
                                      automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    reply, steps, t0 = "", [], time.time()
    for _ in range(max_turns):
        resp = FA.gen_with_retry(client, tries=4, max_wait=8, model="auto", contents=contents, config=cfg)
        cand = resp.candidates[0].content
        contents.append(cand)
        calls = [p.function_call for p in cand.parts if getattr(p, "function_call", None)]
        reply = "".join(p.text for p in cand.parts if getattr(p, "text", None)) or reply
        if not calls:
            break
        parts = []
        for fc in calls:
            args = json.loads(json.dumps(dict(fc.args or {}), default=str))
            out = ctx.call(fc.name, args)
            steps.append({"tool": fc.name, "args": args, "ok": "error" not in out})
            parts.append(types.Part.from_function_response(name=fc.name, response=json.loads(json.dumps(out, default=str))))
        contents.append(types.Content(role="user", parts=parts))
    out = {"reply": reply.strip() or "Done.", "actions": ctx.actions, "steps": steps, "seconds": round(time.time() - t0, 1)}
    try:
        DC.put(key, {"reply": out["reply"], "calls": getattr(ctx, "calls", []), "steps": steps})
    except Exception:
        pass
    return out
