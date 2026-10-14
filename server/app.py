"""Tolerance console API. One process: plant interfaces (ERP over HTTP, OPC UA), compiler, gateway, shadow, SAGE."""
import json, os, random, threading, time
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from plant import core, run_plant, incidents
from compiler import discover, oir, semantics, score
from fabric import emit, gateway, agents, recovery
from shadow import sage, replay
from connectors import registry as CR
from physical import service as PH
from plant import mes, pg
from server import ws_api
from workspace import sources as WSRC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ERP = f"http://127.0.0.1:{run_plant.ERP_PORT}"
OPCUA = f"opc.tcp://127.0.0.1:{core.PORT}/tolerance/plant"
app = FastAPI(title="Tolerance console")
from server.state import S
S.update({"rep": None, "live": CR.Live(every=3.0), "oir": None, "bounds": None, "gw": None, "selector": None, "eval": None, "alert": None, "inc": None, "gemini_error": None})
LOCK = threading.Lock()


def ensure_sample_plant():
    """Prepare the sample estate: the machine log split into a snapshot (already in the database) and a live feed (not started until the source is attached)."""
    if S.get("rep") is None:
        rest, total = mes.reset(24000)
        S["rep"] = mes.Replayer(rest, rate_per_s=400)


@app.on_event("startup")
def boot():
    S["compile_now"] = lambda: compile_now()
    WSRC.LIVE.start()
    threading.Thread(target=lambda: (time.sleep(8), compile_now()), daemon=True).start()  # warm the semantic naming cache
    if os.environ.get("K_SERVICE") or os.environ.get("AUTO_SAMPLE_DATA") == "1":
        def _attach():
            time.sleep(15)
            try:
                from foreman import guide
                guide.ensure_data()
            except Exception as e:
                print("sample data not attached:", e)
        threading.Thread(target=_attach, daemon=True, name="attach-sample-data").start()
    pg.start()
    core.PG_HOOK = pg.upsert
    core.PG_WIPE = pg.wipe
    run_plant.start_all()
    core.reset_plant(40)  # a healthy plant first


def j(o):
    return JSONResponse(json.loads(json.dumps(o, default=lambda x: sorted(x) if isinstance(x, set) else str(x))))


def compile_now():
    evs, spans = discover.discover_all(ERP, OPCUA, os.path.join(ROOT, "plant", "functions"), core.STORE, core.TRACER.path)
    namer, mode = semantics.make_namer()
    t = time.time()
    o = oir.compile_oir(evs, namer)
    S.update(oir=o, evs={e["id"]: e for e in evs}, mode=mode, gemini_error=getattr(namer, "error", None))
    return evs, spans, o, mode, time.time() - t


@app.post("/api/connect")
def connect_all(rate: int = 400, snapshot_rows: int = 24000):
    """Setup: snapshot every wired source into the lake once, then keep them live (the machine log keeps arriving)."""
    with LOCK:
        if S["rep"]:
            S["rep"].stop()
        S["live"].stop()
        for f in ("estate.duckdb", "connectors.json"):
            pth = os.path.join(core.DATA, f)
            if os.path.exists(pth):
                os.remove(pth)
        import shutil
        shutil.rmtree(os.path.join(core.DATA, "dlt"), ignore_errors=True)
        PH._cache.update(n=-1)
        PH.SEALS.clear()
        rest, total = mes.reset(snapshot_rows)
        S["rep"] = mes.Replayer(rest, rate_per_s=rate)
        ids = ["mes", "docs", "queue", "erp", "opcua", "traces"] + (["erppg"] if pg.ready() else [])
        res = [CR.sync(sid) for sid in ids]
        S["rep"].start()
        S["live"].start(["mes", "queue", "traces", "erp"] + (["erppg"] if pg.ready() else []))
        return j({"snapshot": res, "mes_total_rows": total, "live_feed_rows": len(rest)})


@app.get("/api/connectors")
def connectors_status():
    return j({"sources": CR.status(), "replayer": S["rep"].status() if S["rep"] else None, "live": S["live"].run, "errors": S["live"].errors})


@app.post("/api/connectors/sync")
def connectors_sync(id: str):
    with LOCK:
        return j(CR.sync(id))


@app.get("/api/physical")
def physical(hours: float = 4.0):
    model, val, df = PH.compile_physical()
    fc = PH.forecast(model, df, hours=hours)
    return j({"rows_in_lake": len(df), "model": {"assets": model["assets"], "net": model["net"], "start": model["start"], "end": model["end"]}, "validation": val, "forecast": fc})


@app.post("/api/physical/advise")
def physical_advise(hours: float = 4.0, gemini: int = 1):
    model, val, df = PH.compile_physical()
    return j(PH.advise(PH.forecast(model, df, hours=hours), use_gemini=bool(gemini)))


@app.get("/api/physical/live")
def physical_live():
    try:
        return j(PH.live_only())
    except Exception:
        return j({"rows": 0, "log_time": None, "assets": []})


@app.get("/api/physical/learning")
def physical_learning():
    return j(PH.learning_curve())


@app.post("/api/physical/seal")
def physical_seal(hours: float = 3.0):
    return j(PH.seal_forecast(hours))


@app.get("/api/physical/seals")
def physical_seals():
    return j(PH.score_seals())


@app.get("/api/status")
def status():
    return j({"gemini_key": agents.gemini_available(), "semantic_mode": S.get("mode"), "health": core.health(), "queues": core.STORE.queue_stats(),
              "compiled": bool(S["oir"]), "bounds": bool(S["bounds"]), "selector": bool(S["selector"]), "model": agents.MODEL_POOL[0]})


@app.post("/api/plant/reset")
def plant_reset(fault: int = 1):
    with LOCK:
        if fault:
            vs = core.reset_plant(40, rc_window=[22, 23, 24, 25], fault=True)
            S["inc"] = {"class": "INGEST_TRANSFORM_FAILURE", "window": [22, 23, 24, 25]}
        else:
            vs = core.reset_plant(40)
            S["inc"] = None
        S["alert"] = None
        S["gw"] = None
        core.STATE["erp_http"] = None
        h = core.health()
        S["affected"] = h["missing_vins"]
        if h["missing_vins"]:
            S["alert"] = {"title": f"{len(h['missing_vins'])} vehicles have no traceability record in the ERP", "missing_vins": h["missing_vins"], "built": h["assembled"],
                          "mos": {v["vin"]: v["mo"] for v in vs}}
    return j({"health": h, "alert": S["alert"]})


@app.post("/api/discover")
def do_discover():
    with LOCK:
        evs, spans, o, mode, dt = compile_now()
        G = o["graph"]
        sc = score.score(o)
        by_source = {}
        for e in evs:
            by_source[e["source"]] = by_source.get(e["source"], 0) + 1
        nodes = [{"id": n, "kind": d["kind"], "layer": d["layer"], "label": d["label"], "evidence": d["evidence"][:6], "attrs": {k: v for k, v in d["attrs"].items() if k != "vars"}, "vars": d["attrs"].get("vars", [])} for n, d in G.nodes(data=True)]
        edges = [{"src": a, "dst": b, "type": d["type"], "status": d["status"], "count": d["count"], "errors": d["errors"], "last_error": d["last_error"], "evidence": d["evidence"], "confidence": d["confidence"]} for a, b, d in G.edges(data=True)]
        used = set()
        for n in nodes:
            used |= set(n["evidence"])
        for e in edges:
            used |= set(e["evidence"])
        for u in o["uncertainty"]:
            used |= set(u["evidence"])
        for en in o["entities"]:
            used |= set(en["evidence"])
        return j({"version": o["version"], "mode": mode, "gemini_error": S["gemini_error"], "stats": {**o["stats"], "evidence": len(evs), "spans": len(spans), "sources": by_source, "ms": round(dt * 1000)},
                  "nodes": nodes, "edges": edges, "entities": o["entities"], "uncertainty": o["uncertainty"], "chain": o["entity_chain"], "links": o["identity_links"], "score": sc,
                  "evidence": {i: S["evs"][i] for i in used if i in S["evs"]}})


@app.post("/api/boundaries")
def do_bounds():
    with LOCK:
        if not S["oir"]:
            raise HTTPException(409, "compile first")
        b = emit.build_boundaries(S["oir"])
        S["bounds"] = b
        S["gw"] = gateway.Gateway(b)
        return j({"domains": b["domains"], "resources": b["resources"], "cedar": b["cedar"], "toolbox_yaml": b["toolbox_yaml"], "counts": b["counts"]})


@app.get("/api/aas")
def aas():
    if not S["oir"]:
        raise HTTPException(409, "compile first")
    return j(emit.export_aas(S["oir"]))


@app.post("/api/gate/attempt-write")
def attempt_write():
    """The RCA agent tries to patch production data. The gateway decides, not the model."""
    gw = S["gw"] or gateway.Gateway(emit.build_boundaries(S["oir"]))
    r = gw.call("rca", "write_collection", {"collection": "genealogy", "doc": {"vin": "EVX1000022", "board_sn": "PCB-40022"}, "key": "vin"})
    return j({"result": r, "audit": gw.audit[-1]})


@app.post("/api/investigate")
def investigate(mode: str = "rule", strategy: str = "trace_first"):
    with LOCK:
        if not (S["gw"] and S["alert"]):
            raise HTTPException(409, "needs boundaries and an active alert")
        gw = S["gw"]
        n0 = len(gw.audit)
        note = None
        res = None
        if mode == "gemini":
            if not agents.gemini_available():
                raise HTTPException(409, "no Gemini credentials in the environment")
            try:
                res = agents.GeminiAgent(gw, S["alert"], strategy, context=emit.digest(S["oir"]) if S.get("oir") else "").run()
                if res["class"] == "UNKNOWN":
                    raise RuntimeError("Gemini returned no diagnosis")
            except Exception as e:  # never leave the operator without an answer: fall back, and say so
                note = f"Gemini unavailable ({type(e).__name__}); used the rule-based investigator"
                del gw.audit[n0:]
        if res is None:
            res = agents.RuleAgent(gw, S["alert"], agents.STRATEGIES[strategy]).run()
            if note:
                res["agent"] = res["agent"] + " (fallback)"
                res["note"] = note
        S["hyp"] = res
        return j({"hypothesis": res, "audit": gw.audit[n0:]})


@app.post("/api/recover/replay")
def recover_replay(plan: str):
    with LOCK:
        gw = S["gw"]
        if not gw:
            raise HTTPException(409, "needs boundaries")
        out = gw.call("recovery", "replay_to_replica", {"plan": {"kind": plan}})
        return j({"result": out, "audit": gw.audit[-1], "gate_ok": getattr(gw, "last_gate_ok", False)})


@app.post("/api/recover/apply")
def recover_apply(approved: int = 0):
    with LOCK:
        gw = S["gw"]
        out = gw.call("recovery", "apply_to_production", {"plan": {}}, context={"human_approved": bool(approved), "gate_passed": bool(getattr(gw, "last_gate_ok", False))})
        h = core.health()
        return j({"result": out, "audit": gw.audit[-1], "health": h})


@app.get("/api/audit")
def audit():
    return j((S["gw"].audit if S["gw"] else []))


# ------------------------------------------------------------------ SAGE and shadow
def trained_selector():
    if S["selector"]:
        return S["selector"]
    data = sage.load_dataset()
    if not data:
        raise HTTPException(409, "incident library not built (python -m shadow.build_dataset 400)")
    sel = sage.Selector(seed=1)
    for h in data[: int(len(data) * 0.75)]:
        k, p = sel.choose(h["ctx"])
        sel.learn(h["ctx"], k, p, h["outcomes"][sage.STRATS[k]]["reward"])
    S["selector"] = sel
    return sel


@app.post("/api/sage/pick")
def sage_pick():
    sel = trained_selector()
    ctx = {"alert": "operator_report", "deploy": 1, "shift": "B", "size": "small"}
    p = sel.pmf(ctx)
    k = max(range(len(p)), key=lambda j: p[j])
    return j({"ctx": ctx, "strategy": sage.STRATS[k], "pmf": {s: round(p[i], 3) for i, s in enumerate(sage.STRATS)}})


@app.get("/api/sage/eval")
def sage_eval():
    path = os.path.join(core.DATA, "sage_eval.json")
    data = sage.load_dataset()
    if not data:
        raise HTTPException(409, "incident library not built")
    if not os.path.exists(path) or os.path.getmtime(path) < os.path.getmtime(sage.DATASET):
        r = sage.evaluate(data, train_n=int(len(data) * 0.75), shuffles=12)
        r["sensitivity"] = sage.sensitivity(data)
        r["incident_library"] = len(data)
        r["classes"] = {c: sum(1 for h in data if h["class"] == c) for c in sage.PRIORS}
        json.dump(r, open(path, "w"))
    return j(json.load(open(path)))


@app.post("/api/shadow/run")
def shadow_run(n: int = 10, gemini: int = 0):
    with LOCK:
        if not S["bounds"]:
            S["bounds"] = emit.build_boundaries(S["oir"] or (compile_now()[2]))
        sel = trained_selector()
        events = []
        hook, wipe = core.PG_HOOK, core.PG_WIPE
        core.PG_HOOK = core.PG_WIPE = None  # simulated incidents must not write into the real PostgreSQL
        try:
            res = replay.run_shadow(S["bounds"], sel, n=n, use_gemini=bool(gemini) and agents.gemini_available(), on_event=events.append)
        finally:
            core.PG_HOOK, core.PG_WIPE = hook, wipe
        # leave the plant in the flagship incident state afterwards
        plant_reset_nolock()
        return j({**res, "events": events})


def plant_reset_nolock():
    vs = core.reset_plant(40, rc_window=[22, 23, 24, 25], fault=True)
    S["inc"] = {"class": "INGEST_TRANSFORM_FAILURE", "window": [22, 23, 24, 25]}
    h = core.health()
    S["affected"] = h["missing_vins"]
    S["alert"] = {"title": f"{len(h['missing_vins'])} vehicles have no traceability record in the ERP", "missing_vins": h["missing_vins"], "built": h["assembled"], "mos": {v["vin"]: v["mo"] for v in vs}}
    S["gw"] = gateway.Gateway(S["bounds"]) if S["bounds"] else None


@app.get("/api/twin")
def twin():
    """Physical lane vs digital lane for the vehicles of interest."""
    h = core.health()
    vins = h["missing_vins"] or S.get("affected", [])
    rows = []
    for v in vins:
        scans = core.STORE.find("scans")
        phys = [d for d in scans if d.get("vin") == v or d.get("pack_serial") == (next((x for x in scans if x.get("vin") == v), {}) or {}).get("pack_serial")]
        g = core.STORE.get("genealogy", v)
        o = next(iter(core.STORE.find("erp_orders", {"vin": v})), {})
        rows.append({"vin": v, "station_scans": len([d for d in phys if d["type"] in ("pack_scan", "vehicle_assembly")]), "genealogy": bool(g), "erp": o.get("genealogy_status")})
    return j({"health": h, "rows": rows})


app.include_router(ws_api.router)
from server import jig_api
app.include_router(jig_api.router)
from server import probe_api
app.include_router(probe_api.router)
@app.middleware("http")
async def sign_in_check(request, call_next):
    """Cloud mode: /api calls need a valid Firebase token, and the store then answers for that user only."""
    from server import auth
    from workspace import store
    path = request.url.path
    if auth.REQUIRED and path.startswith("/api/") and path not in auth.PUBLIC:
        h = request.headers.get("authorization", "")
        user = auth.verify(h[7:]) if h.lower().startswith("bearer ") else None
        if not user:
            return JSONResponse({"detail": "sign in required"}, status_code=401)
        tok = store.UID.set(user["uid"])
        try:
            return await call_next(request)
        finally:
            store.UID.reset(tok)
    return await call_next(request)


@app.middleware("http")
async def no_cache_ui(request, call_next):
    resp = await call_next(request)
    if not request.url.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


app.mount("/samples", StaticFiles(directory=os.path.join(ROOT, "seed", "samples")), name="samples")
# The exported web app (web/out, built with STATIC_EXPORT=1) is served from here in the container; the old plain UI is the fallback.
_web = os.path.join(ROOT, "web", "out")
app.mount("/", StaticFiles(directory=_web if os.path.isdir(_web) else os.path.join(ROOT, "ui"), html=True), name="ui")
