"""The workspace API: what the person does in the app. Sources, model review and correction, dashboards, incidents, learning."""
import json, os, shutil, threading, time
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from plant import core, mes
from connectors import registry as CR
from workspace import store, sources as SRC
from interpret import model as M, engine as E
from learning import bandit
from incidents import service as INC
from physical import service as PH
from fabric import emit, gateway, agents
from server.state import S

router = APIRouter(prefix="/api/ws")
LOCK = threading.RLock()


def _oir():
    """The compiled dependency graph only belongs to the model when the sample estate (which exposes those interfaces) is attached."""
    return S.get("oir") if any(x["kind"] == "builtin" for x in store.load()["sources"]) else None


def j(o):
    return JSONResponse(json.loads(json.dumps(o, default=lambda x: sorted(x) if isinstance(x, set) else str(x))))


def src_public(s):
    s = dict(s)
    s["lag"] = SRC.lag(s)
    s["age_s"] = round(time.time() - s["last"], 1) if s.get("last") else None
    return s


# ------------------------------------------------------------------ workspace and sources
@router.get("")
def workspace():
    d = store.load()
    items = M.reviewed_items(oir=_oir()) if M._cache["items"] is not None else []
    return j({"name": d["name"], "sources": [src_public(s) for s in d["sources"]], "model": M.summary(items) if items else None, "version": (d["versions"][-1] if d["versions"] else None),
              "incidents_open": sum(1 for i in d["incidents"] if i["status"] in ("open", "diagnosed", "plan_tested")), "decisions": bandit.get().stats()["n"], "compiled": len(d.get("compiled", [])),
              "gemini": agents.gemini_available(), "log_time": (PH.live_only()["log_time"] if _has_state() else None)})


def _has_state():
    try:
        PH.live_only()
        return True
    except Exception:
        return False


@router.get("/sources")
def sources():
    d = store.load()
    rep = S.get("rep")
    return j({"sources": [src_public(s) for s in d["sources"]], "replayer": rep.status() if rep else None, "live": SRC.LIVE.run, "errors": SRC.LIVE.errors})


def adopt_state_log():
    """After a machine log is uploaded: find the state log in the visitor's data, take its meaning (RUN, FAULT and so on), and make it the plant's log. Returns what was found."""
    from documents import engine as DE
    items = M.reviewed_items(force=True)
    st = M.effective(items)["state"]
    if not st:
        return None
    PH.configure(st["table"], st["ts"], st["asset"], st["status"], st["labels"], st["fail"])
    DE._ST.update(t=0)
    df = PH.lake_df()
    return {"table": st["table"], "stations": sorted(df.asset.astype(str).unique()), "rows": int(len(df)), "labels": {str(k): v for k, v in st["labels"].items()},
            "from": str(df.ts.min())[:16], "to": str(df.ts.max())[:16]}


@router.post("/sources/upload")
async def upload(file: UploadFile = File(...), name: str = Form("")):
    fn = file.filename or "upload"
    ext = os.path.splitext(fn)[1].lower()
    if ext not in (".csv", ".db", ".sqlite", ".sqlite3"):
        raise HTTPException(400, "Upload a .csv or a SQLite file (.db / .sqlite). For other systems add a URL.")
    data = await file.read()
    if len(data) > 25_000_000:
        raise HTTPException(413, "file too large (25 MB at most)")
    nm = name.strip() or os.path.splitext(fn)[0]
    CR.set_own_lake()   # the visitor brings their own data: it goes into their own database, apart from the sample
    path = os.path.join(SRC.UPLOADS, f"{CR._safe(store.UID.get())}_{SRC.slug(nm)}{ext}")
    with open(path, "wb") as f:
        f.write(data)
    kind = "csv" if ext == ".csv" else "sqlite"
    s = SRC.add(kind, nm, path=path)
    r = SRC.sync(s["id"])
    SRC.LIVE.start()
    machine = None
    try:
        machine = adopt_state_log()
    except Exception as e:
        machine = {"error": f"{type(e).__name__}: {str(e)[:160]}"}
    quality = None
    try:   # a pass/fail result per unit (inspection or test data) is a different kind of file from a machine log
        from mcpx import servers as MS
        MS._INS.clear()
        tn = (r.get("tables") or {})
        hit = next((x for x in MS._find_inspection() if x["table"] in tn), None)
        if hit:
            res = hit["df"][hit["result"]].astype(str).str.lower().isin(MS._FAIL)
            quality = {"table": hit["table"], "units": int(len(hit["df"])), "fail_rate": round(float(res.mean()), 4), "signals": int(sum(1 for c in hit["df"].columns if str(hit["df"][c].dtype).startswith(("float", "int")))),
                       "has_time": bool(hit["ts"])}
    except Exception:
        pass
    return j({"source": src_public(SRC.get(s["id"])), "sync": r, "machine": machine, "quality": quality})


@router.post("/sources/url")
def add_url(kind: str = Form(...), url: str = Form(...), name: str = Form("")):
    if kind not in ("api", "db_url"):
        raise HTTPException(400, "kind must be api or db_url")
    nm = name.strip() or ("api" if kind == "api" else "database")
    s = SRC.add(kind, nm, url=url)
    r = SRC.sync(s["id"])
    SRC.LIVE.start()
    return j({"source": src_public(SRC.get(s["id"])), "sync": r})


@router.post("/sources/sample")
def add_sample(which: str = "incidents"):
    """Attach a sample:
      incidents: the real incident archive (RCAEval: real fault-injection cases) plus a live alert feed derived from it;
      machine:   the real machine state log from a manufacturing lab, partly loaded now and arriving live;
      estate:    the simulated plant (kept for the guided tour)."""
    with LOCK:
        from server import app as A
        have = {(s["kind"], s["params"].get("id") or s["name"]) for s in store.load()["sources"]}
        out = []
        if which == "incidents":
            from rca import data as D
            from plant import alerts as AL
            if not D.available():
                raise HTTPException(409, "the incident archive is not on this machine (python -m rca.fetch)")
            order = AL.reset()
            S["alerts"] = AL.AlertFeed(order, interval=S.get("alert_interval", 75.0))
            for _ in range(3):
                S["alerts"].add_one()
            a1 = SRC.add("archive", "Observability archive (real incidents)")
            out.append(SRC.sync(a1["id"]))
            a2 = SRC.add("sqlite", "Alert feed", path=AL.DB)
            out.append(SRC.sync(a2["id"]))
            S["alerts"].start()
        elif which == "machine":
            A.ensure_sample_plant()
            s_ = SRC.add("builtin", "Machine states (live)", id="mes")
            out.append(SRC.sync(s_["id"]))
            if S.get("rep"):
                S["rep"].start()
        elif which == "quality":
            path = os.path.join(core.ROOT, "seed", "samples", "inspection_results_secom.csv")
            s_ = SRC.add("csv", "Inspection results (real, SECOM)", path=path)
            out.append(SRC.sync(s_["id"]))
        elif which == "estate":
            A.ensure_sample_plant()
            ids = [("mes", "Machine states (live)"), ("docs", "Plant documents"), ("queue", "Event queues"), ("erp", "ERP API"), ("opcua", "Line controllers (OPC UA)"), ("traces", "Service traces")]
            if A.pg.ready():
                ids.insert(3, ("erppg", "ERP database (PostgreSQL)"))
            for bid, nm in ids:
                if ("builtin", bid) in have:
                    continue
                s_ = SRC.add("builtin", nm, id=bid)
                out.append(SRC.sync(s_["id"]))
            if S.get("rep"):
                S["rep"].start()
        else:
            raise HTTPException(400, "unknown sample")
        SRC.LIVE.start()
        return j({"synced": out})


@router.post("/sources/{sid}/sync")
def sync_one(sid: str):
    try:
        return j(SRC.sync(sid))
    except KeyError:
        raise HTTPException(404, "unknown source")


@router.delete("/sources/{sid}")
def remove(sid: str):
    SRC.remove(sid)
    return j({"ok": True})


# ------------------------------------------------------------------ model review
@router.post("/model/interpret")
def interpret():
    with LOCK:
        if any(x["kind"] == "builtin" for x in store.load()["sources"]) and not S.get("oir"):
            S["compile_now"]()
        items = M.reviewed_items(force=True, oir=_oir())
        auto = not store.load()["versions"]
        if auto:
            _rebuild("Initial interpretation")
        return j({"items": items, "summary": M.summary(items)})


@router.get("/model")
def model():
    items = M.reviewed_items(force=M._cache["items"] is None, oir=_oir())
    d = store.load()
    return j({"items": items, "summary": M.summary(items), "versions": d["versions"], "state": dict(PH.CFG.items())})


@router.post("/model/items")
def correct_item(id: str = Form(...), action: str = Form(...), value: str = Form(""), note: str = Form("")):
    if action not in ("approve", "reject", "edit", "answer"):
        raise HTTPException(400, "bad action")
    val = None
    if value:
        try:
            val = json.loads(value)
        except Exception:
            val = value
    M.correct(id, action, val, note or None)
    items = M.reviewed_items()
    return j({"item": next((i for i in items if i["id"] == id), None), "summary": M.summary(items)})


@router.delete("/model/items")
def undo_item(id: str):
    M.undo(id)
    items = M.reviewed_items()
    return j({"summary": M.summary(items)})


def _rebuild_real(eff):
    """The real incident estate: services and call graph from the lake catalogs, minus what the person rejected; policy regenerated from them."""
    from interpret import engine as E
    from rca import policy
    if "service_catalog" not in E.lake_tables():
        return None
    cat = CR.lake_query("select system, service from lake.service_catalog")
    off = set(eff.get("rejected_systems") or [])
    S["rca_services"] = {}
    for r in cat.itertuples():
        if r.system not in off:
            S["rca_services"].setdefault(r.system, []).append(r.service)
    rej = set(eff.get("rejected_svc_edges") or [])
    graph = {}
    if "trace_edges" in E.lake_tables():
        te = CR.lake_query("select system, caller, callee, calls from lake.trace_edges")
        for r in te.itertuples():
            if r.system not in off and (r.system, r.caller, r.callee) not in rej:
                graph.setdefault(r.system, {})[(r.caller, r.callee)] = int(r.calls)
    gateway.GRAPH["edges"] = graph
    from mcpx.hub import HUB
    S["rca_bounds"] = policy.build([x for v in S["rca_services"].values() for x in v], mcp=HUB.read_only_tools())
    n_edges = sum(len(v) for v in graph.values())
    return f"service graph: {n_edges} calls across {len(graph)} systems ({len(rej)} rejected by you); {sum(len(v) for v in S['rca_services'].values())} services in the investigator's policy"


def _rebuild(note):
    items = M.reviewed_items()
    eff = M.effective(items)
    effects = []
    if eff["state"]:
        st = eff["state"]
        before = dict(PH.CFG.items())
        PH.configure(st["table"], st["ts"], st["asset"], st["status"], st["labels"], st["fail"])
        effects.append(f"machine states: failure = code {st['fail']} in {st['table']}" + ("" if st["reviewed"] else " (not yet reviewed)"))
    removed = 0
    if _oir():
        # recompile fresh, then apply what the person rejected
        S["compile_now"]()
        ch = M.apply_to_oir(S["oir"], eff)
        removed = ch["removed"]
        S["bounds"] = emit.build_boundaries(S["oir"])
        S["gw"] = gateway.Gateway(S["bounds"])
        effects.append(f"dependency graph: {S['oir']['graph'].number_of_edges()} edges ({ch['removed']} removed, {ch['renamed']} entities renamed, {ch['resolved']} identifier questions resolved by you); permission boundaries regenerated")
    real = _rebuild_real(eff)
    if real:
        effects.append(real)
    names = {v["name"] for v in eff["entities"].values()}
    if names:
        effects.append(f"entities: {', '.join(sorted(names))}")
    v = M.record_version({**M.summary(items), "effects": effects}, note)
    return {"version": v, "effects": effects, "summary": M.summary(items)}


@router.post("/model/rebuild")
def rebuild(note: str = Form("Applied corrections")):
    with LOCK:
        return j(_rebuild(note))


# ------------------------------------------------------------------ plant fingerprint
@router.get("/discover")
def discover_get(explain: int = 1):
    from discover import fingerprint as FP
    with LOCK:
        return j(FP.run(bool(explain)))


@router.post("/discover/answer")
def discover_answer(action: str = Form(...), label: str = Form(""), note: str = Form("")):
    from discover import fingerprint as FP
    if action not in ("confirm", "correct", "reset"):
        raise HTTPException(400, "bad action")
    FP.answer(action, label or None, note or None)
    return j({"ok": True})


# ------------------------------------------------------------------ documents
@router.get("/docs")
def docs_state():
    from documents import engine as DE
    st = DE.state()
    return j({**st, "flows": DE.flows(st)})


@router.post("/docs/extract")
def docs_extract():
    from documents import engine as DE
    with LOCK:
        return j(DE.run_all())


@router.post("/docs/resolve")
def docs_resolve(key: str = Form(...), value: str = Form(...)):
    from documents import engine as DE
    return j(DE.resolve_action(key, value))


@router.get("/docs/text")
def docs_text(name: str):
    from documents import engine as DE
    for d in DE.list_docs():
        if d["name"] == name:
            return j(d)
    raise HTTPException(404, "unknown document")


@router.get("/docs/eval")
def docs_eval():
    from documents import engine as DE
    return j(DE.evaluate())


@router.post("/docs/reset")
def docs_reset():
    from documents import engine as DE
    DE.reset()
    return j({"ok": True})


# ------------------------------------------------------------------ MCP
def _mcp_gw():
    """A gateway whose policy covers the MCP tools, independent of any incident archive (used by the MCP console)."""
    if not S.get("mcp_gw"):
        from rca import policy
        from mcpx.hub import HUB
        S["mcp_gw"] = gateway.Gateway(policy.build([], mcp=HUB.read_only_tools()))
    return S["mcp_gw"]


@router.get("/mcp")
def mcp_info():
    from mcpx.hub import HUB, LOG
    gw = _mcp_gw()
    return j({"servers": HUB.servers(), "error": HUB.error, "calls": LOG[-30:][::-1], "audit": [a for a in gw.audit if a["tool"].startswith("mcp:")][-30:][::-1],
              "tools": sum(len(s["tools"]) for s in HUB.servers())})


@router.post("/mcp/call")
def mcp_call(server: str = Form(...), tool: str = Form(...), args: str = Form("{}")):
    """The console: call any MCP tool as the `console` principal. Cedar decides first, exactly as it does for an agent."""
    try:
        a = json.loads(args or "{}")
    except Exception:
        raise HTTPException(400, "args must be JSON")
    return j(_mcp_gw().call("console", f"mcp:{server}/{tool}", a))


# ------------------------------------------------------------------ plant map
@router.get("/graph")
def graph_get():
    from workspace import graph as G
    return j(G.build())


@router.post("/graph/layout")
def graph_layout(pos: str = Form(...)):
    from workspace import graph as G
    G.save_layout(json.loads(pos))
    return j({"ok": True})


@router.post("/chat")
def chat(message: str = Form(...), history: str = Form("[]"), replay: int = Form(0)):
    from workspace import graph as G
    if not agents.gemini_available():
        raise HTTPException(409, "the assistant needs Gemini (set GEMINI_API_KEY)")
    try:
        return j(G.chat(message, json.loads(history), replay=bool(replay)))
    except Exception as e:
        raise HTTPException(503, f"The assistant could not answer ({type(e).__name__}). Try again in a moment.")


def _pretty(i):
    if i.startswith("dep:svc:"):
        sy, rest = i[8:].split(":", 1)
        a, _, b = rest.partition(">")
        return f"the call {a} → {b} ({sy})"
    if i.startswith("entity:svc:"):
        return f"the system {i[11:]}"
    if i.startswith("state:"):
        return "the machine state mapping"
    if i.startswith("table:"):
        return f"the table {i[6:]}"
    return i


# ------------------------------------------------------------------ compile
@router.get("/compile")
def compile_state():
    from workspace import compiler as C
    h = C.history()
    return j({"history": [{"version": x["version"], "at": x["at"]} for x in h], "latest": h[-1] if h else None, "versions": store.load()["versions"]})


@router.post("/compile")
def compile_run(note: str = Form("Compiled from the reviewed model")):
    """Apply the person's corrections, then build everything the rest of the system runs on, and show what changed."""
    from workspace import compiler as C
    with LOCK:
        d0 = store.load()
        pending = [c for c in d0["corrections"] if not d0["versions"] or c["at"] > d0["versions"][-1]["at"]]
        t0 = time.time()
        r = _rebuild(note)
        art, steps = C.build(S)
        prev = C.history()[-1]["art"] if C.history() else None
        C.remember(r["version"]["version"], art)
        return j({"version": r["version"], "effects": r["effects"], "corrections": [{"id": c["id"], "label": _pretty(c["id"]), "action": c["action"], "value": c.get("value")} for c in pending],
                  "artifacts": art, "steps": steps, "diff": C.diff(prev, art), "seconds": round(time.time() - t0, 1), "first": prev is None})


# ------------------------------------------------------------------ factory twin
_TWIN_CACHE = store.PerUser(lambda: {"t": 0.0, "v": None})


def twin_cached():
    """The station list. Several parts of a page ask for it every few seconds and building it takes a second or two, so one answer is shared for two seconds."""
    from workspace import twin as T
    c = _TWIN_CACHE._cur()
    if c["v"] is None or time.time() - c["t"] > 2.0:
        c["v"], c["t"] = T.build(), time.time()
    return c["v"]


@router.get("/twin")
def twin_get():
    return j(twin_cached())


@router.get("/twin/live")
def twin_live(id: str, minutes: float = 30):
    from workspace import twin as T
    return j(T.live(id, minutes))


@router.post("/twin/station")
def twin_add(name: str = Form(...), x: float = Form(...), y: float = Form(...), kind: str = Form("")):
    from workspace import twin as T
    _TWIN_CACHE._cur().update(t=0.0)   # a change to the model must show at once
    return j({"id": T.add_station(name, x, y, kind or None)})


@router.post("/twin/move")
def twin_move(id: str = Form(...), x: float = Form(...), y: float = Form(...)):
    from workspace import twin as T
    _TWIN_CACHE._cur().update(t=0.0)   # a change to the model must show at once
    T.move(id, x, y)
    return j({"ok": True})


@router.post("/twin/rename")
def twin_rename(id: str = Form(...), name: str = Form(...)):
    from workspace import twin as T
    _TWIN_CACHE._cur().update(t=0.0)   # a change to the model must show at once
    T.rename(id, name)
    return j({"ok": True})


@router.delete("/twin/station")
def twin_remove(id: str):
    from workspace import twin as T
    _TWIN_CACHE._cur().update(t=0.0)   # a change to the model must show at once
    T.remove(id)
    return j({"ok": True})


@router.post("/twin/flow")
def twin_flow(a: str = Form(...), b: str = Form(...), status: str = Form("approved")):
    from workspace import twin as T
    _TWIN_CACHE._cur().update(t=0.0)   # a change to the model must show at once
    T.set_flow(a, b, status)
    return j({"ok": True})


@router.post("/twin/link")
def twin_link(id: str = Form(...), system: str = Form(...), off: int = Form(0)):
    from workspace import twin as T
    T.link_system(id, system, bool(off))
    return j({"ok": True})


@router.post("/twin/bind")
def twin_bind(id: str = Form(...), table: str = Form(...), off: int = Form(0)):
    from workspace import twin as T
    (T.unbind if off else T.bind)(id, table)
    return j({"ok": True})


# ------------------------------------------------------------------ dashboards
@router.get("/overview")
def overview():
    d = store.load()
    srcs = [src_public(s) for s in d["sources"]]
    items = M.reviewed_items(oir=_oir()) if M._cache["items"] is not None else []
    phys = None
    if _has_state():
        try:
            model_, val, df = PH.compile_physical()
            fc = PH.forecast(model_, df, hours=4, runs=150)
            phys = {"rows": len(df), "log_time": str(df.ts.max()), "assets": fc["rows"], "validation": val}
        except Exception as e:
            phys = {"error": str(e)[:120]}
    L = bandit.get().stats()
    gw = S.get("gw")
    audit = gw.audit if gw else []
    return j({"workspace": d["name"], "sources": srcs, "model": M.summary(items) if items else None, "version": (d["versions"][-1] if d["versions"] else None), "physical": phys,
              "incidents": [INC.public(i) for i in d["incidents"][-8:]][::-1], "open": sum(1 for i in d["incidents"] if i["status"] in ("open", "diagnosed", "plan_tested")),
              "learning": {"n": L["n"], "human": L["human"], "replay": L["replay"], "rolling": L["rolling_mean"][-1] if L["rolling_mean"] else None},
              "agents": {"calls": len(audit), "denied": sum(1 for a in audit if a["decision"] == "DENY")}})


@router.get("/physical/episodes")
def episodes(hours: float = 72):
    from physical import reliability as REL
    df = PH.recent_window(hours)
    ep = REL.episodes(df)
    return j({"from": str(df.ts.min()), "to": str(df.ts.max()), "assets": {a: [{"start": str(s), "end": str(e)} for s, e in v["failures"]] for a, v in ep.items()}})


@router.get("/agents")
def agents_view():
    d = store.load()
    rows = []
    for inc in d["incidents"]:
        for a in (inc.get("investigation") or {}).get("audit", []):
            rows.append({**a, "incident": inc["id"]})
    b = S.get("rca_bounds") or S.get("bounds")
    orders = [{"incident": i["id"], **i["work_order"]} for i in d["incidents"] if i.get("work_order")]
    return j({"audit": sorted(rows, key=lambda r: -r["t"])[:300], "cedar": b["cedar"] if b else None, "domains": b["domains"] if b else None,
              "counts": b["counts"] if b else None, "seals": PH.score_seals() if _has_state() else [], "work_orders": orders})


@router.post("/agents/try_restart")
def try_restart(service: str = "frontend"):
    """Show the boundary: an agent tries to restart a service on its own. Default deny, so the gateway refuses."""
    from fabric import gateway
    with LOCK:
        _ensure_rca()
        gw = gateway.Gateway(S["rca_bounds"])
        r = gw.call("rca", "restart_service", {"service": service})
        return j({"result": r, "audit": gw.audit[-1], "service": service})


# ------------------------------------------------------------------ incidents
@router.get("/incidents")
def incidents_list():
    return j({"incidents": INC.list_all()})


@router.post("/incidents/scan")
def incidents_scan():
    created = []
    try:
        created += INC.scan_alerts()
    except Exception:
        pass
    try:
        created += INC.scan_machine_events()
    except Exception:
        pass
    return j({"created": created})


def _inc(iid):
    i = INC.get(iid)
    if not i:
        raise HTTPException(404, "unknown incident")
    return i


@router.get("/incidents/{iid}")
def incident(iid: str):
    return j(INC.public(_inc(iid)))


@router.post("/incidents/{iid}/ack")
def incident_ack(iid: str, note: str = Form("")):
    i = _inc(iid)
    i["status"] = "closed"
    i["decision"] = {"decision": "acknowledged", "note": note or None, "at": time.time()}
    INC._put(i)
    return j(INC.public(i))


@router.post("/incidents/{iid}/recommend")
def incident_recommend(iid: str):
    i = _inc(iid)
    if not i.get("ctx"):
        raise HTTPException(400, "this incident has no investigation context")
    return j(INC.recommend(i))


def _ensure_rca():
    if not S.get("rca_bounds"):
        with LOCK:
            _rebuild("Initial model")


@router.post("/incidents/{iid}/investigate")
def incident_investigate(iid: str, strategy: str = Form("metrics_first"), mode: str = Form("gemini"), replay: int = Form(0)):
    with LOCK:
        i = _inc(iid)
        if i["kind"] != "service":
            raise HTTPException(400, "only service incidents are investigated")
        _ensure_rca()
        return j(INC.investigate(S, i, strategy, mode, bool(replay)))


@router.get("/demo/cache")
def demo_cache_info():
    from workspace import demo_cache as DC
    return j({"recordings": DC.count()})


@router.get("/incidents/{iid}/progress")
def incident_progress(iid: str):
    pr = INC.PROGRESS.get(iid)
    if not pr:
        return j({"steps": [], "done": False})
    return j({"steps": [{"tool": a["tool"], "decision": a["decision"], "result": str(a.get("result") or "")[:90]} for a in list(pr["audit"])], "done": pr["done"], "seconds": round(time.time() - pr["t0"], 1)})


@router.get("/incidents/{iid}/series")
def incident_series(iid: str, service: str):
    return j(INC.series(_inc(iid), service))


@router.post("/incidents/{iid}/workorder")
def incident_workorder(iid: str, action: str = Form("")):
    with LOCK:
        i = _inc(iid)
        if not i.get("investigation"):
            raise HTTPException(409, "investigate first")
        _ensure_rca()
        return j(INC.work_order(S, i, action or None))


@router.post("/incidents/{iid}/decide")
def incident_decide(iid: str, decision: str = Form(...), note: str = Form("")):
    with LOCK:
        i = _inc(iid)
        if decision not in ("accept", "reject"):
            raise HTTPException(400, "decision must be accept or reject")
        if not i.get("investigation"):
            raise HTTPException(409, "investigate first")
        return j(INC.decide(S, i, decision, note))


# ------------------------------------------------------------------ simulation controls (demo scaffolding, labelled as such in the UI)
@router.post("/sim/alert")
def sim_alert(n: int = 1):
    """Raise the next alert(s) from the feed now, instead of waiting."""
    feed = S.get("alerts")
    if not feed:
        raise HTTPException(409, "no alert feed yet: attach the incident archive")
    raised = [feed.add_one() for _ in range(max(1, min(n, 10)))]
    return j({"raised": [r for r in raised if r], "status": feed.status()})


@router.post("/sim/alert_rate")
def sim_alert_rate(seconds: float):
    feed = S.get("alerts")
    S["alert_interval"] = max(2.0, min(seconds, 300.0))
    if feed:
        feed.interval = S["alert_interval"]
    return j({"interval_s": S["alert_interval"]})


@router.post("/sim/speed")
def sim_speed(rows_per_s: int):
    rep = S.get("rep")
    if not rep:
        raise HTTPException(409, "no live machine feed yet")
    rep.rate = max(10, min(rows_per_s, 20000))
    return j(rep.status())


@router.post("/sim/pause")
def sim_pause(on: int = 1):
    rep = S.get("rep")
    if not rep:
        raise HTTPException(409, "no live machine feed yet")
    rep.stop() if on else rep.start()
    return j(rep.status())


# ------------------------------------------------------------------ learning
@router.get("/learning")
def learning():
    return j(bandit.get().stats())


@router.post("/learning/timelapse")
def timelapse(n: int = 40):
    with LOCK:
        out = bandit.get().timelapse(n)
        return j({"added": len(out), "stats": bandit.get().stats()})


_EVAL = {}


@router.get("/learning/evaluation")
def learning_eval():
    if not _EVAL:
        _EVAL.update(bandit.evaluate())
    return j(_EVAL)


@router.post("/learning/reset")
def learning_reset():
    bandit.get().reset()
    return j({"ok": True})


@router.post("/reset")
def reset_all():
    """Start over with an empty workspace."""
    with LOCK:
        SRC.LIVE.stop()
        if S.get("rep"):
            S["rep"].stop()
        for f in ("estate.duckdb", "connectors.json", "workspace.json", "learning.json"):
            p = os.path.join(core.DATA, f)
            if os.path.exists(p):
                os.remove(p)
        shutil.rmtree(os.path.join(core.DATA, "dlt"), ignore_errors=True)
        M._cache.update(items=None)
        PH._cache.update(n=-1)
        bandit.LEARNER = None
        feed = S.get("alerts")
        if feed:
            feed.stop()
        S.update(oir=None, bounds=None, gw=None, alerts=None, rca_bounds=None, rca_services={})
        gateway.GRAPH["edges"] = {}
        for f in ("alerts.db",):
            pth = os.path.join(core.DATA, f)
            if os.path.exists(pth):
                os.remove(pth)
        return j({"ok": True})
