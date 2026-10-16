"""API of the Tolerance platform: the agent catalog, onboarding, operations and Warden."""
import json, threading
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from foreman import core, safety, agents as AGS, plant as PL, guide as GD
from workspace import store

from fastapi import Depends
from server import rbac
router = APIRouter(prefix="/api/jig")
JOBS = {}


def j(o):
    return JSONResponse(json.loads(json.dumps(o, default=str)))


@router.get("/attention")
def attention():
    """What needs a person now: actions waiting for approval, and Sentinel rules that are failing. For the bell."""
    me, items = store.UID.get(), []
    for rid in reversed(core.ORDER[-40:]):
        r = core.RUNS.get(rid)
        if not r or getattr(r, "uid", me) != me or r.meta.get("flow") != "operations" or not r.result:
            continue
        for p in r.result.get("proposals", []):
            if p.get("decision") == "approve" and not p.get("applied"):
                items.append({"kind": "approval", "text": f"{p['label']} on {r.result['station']} waits for a person (score {p['score']})", "link": "/operations"})
    try:
        from server import hostops
        for inc in hostops._state(store.load())["incidents"]:
            if inc["status"] == "waiting":
                items.append({"kind": "approval", "text": f"{inc['title']}. The fix waits for a person (score {inc['scored']['score']})", "link": "/operations"})
    except Exception:
        pass
    from sentinel import service as SV
    _, s = SV._state()
    for rule in s["rules"]:
        last = s["last"].get(rule["id"])
        if last and not last["ok"] and not last.get("maintenance"):
            items.append({"kind": "rule", "text": f"Sentinel: {rule['name']} is failing", "link": "/sentinel"})
    counts = {"approvals": sum(1 for i in items if i["kind"] == "approval"), "rules": sum(1 for i in items if i["kind"] == "rule"), "failed": 0, "risk": 0, "data": 0}
    try:   # the station counts come from the same short-lived answer the floor uses
        from server import ws_api
        sts = [x for x in ws_api.twin_cached()["stations"] if not x.get("ghost") and not str(x["id"]).startswith("ghost:")]
        counts["failed"] = sum(1 for x in sts if x["state"] == "failed")
        counts["risk"] = sum(1 for x in sts if x["state"] != "failed" and (x.get("p_fail") or 0) >= 0.5)
        counts["data"] = len(SV.impact_map(s)["stations"])
    except Exception:
        pass
    return j({"count": len(items), "items": items[:20], "counts": counts})


@router.get("/agents")
def agents():
    cat = core.catalog()
    runs = core.recent(60)
    for c in cat:
        mine = [r for r in runs if r["agent"] == c["id"]]
        c["runs"] = len(mine)
        c["last"] = mine[0] if mine else None
    return j({"agents": cat, "settings": safety.settings()})


@router.get("/runs")
def runs():
    return j(core.recent(40))


@router.get("/runs/{rid}")
def run(rid: str):
    r = core.get_run(rid)
    if not r:
        raise HTTPException(404, "unknown run")
    return j(r.public())


def _bg(name, fn, *a):
    """Run slow agents in a thread; the screen polls the run. Returns the run id once the first step exists."""
    box = {}
    def go():
        box["r"] = fn(*a)
    t = threading.Thread(target=go, daemon=True)
    t.start()
    t.join(0.05)
    return t, box


# ----- onboarding
@router.post("/docs/upload")
async def docs_upload(file: UploadFile = File(...)):
    from documents import engine as DE
    data = await file.read()
    if len(data) > 8_000_000:
        raise HTTPException(413, "file too large")
    from server import quota
    try:
        quota.charge_upload(store.UID.get(), len(data), len([d for d in DE.list_docs() if d["origin"] == "upload"]))
    except quota.Denied as e:
        raise HTTPException(e.status, str(e))
    try:
        DE.save_upload(file.filename or "upload.txt", data)
    except Exception as e:
        raise HTTPException(400, f"{type(e).__name__}: {e}")
    return j({"ok": True, "docs": [{k: d[k] for k in ("name", "kind", "chars", "origin")} for d in DE.list_docs()]})


@router.delete("/docs/{name}")
def docs_remove(name: str):
    from documents import engine as DE
    DE.remove_upload(name)
    return j({"ok": True})


@router.post("/scout")
def scout(live: int = 0):
    return j(AGS.run_scout(bool(live)))


@router.post("/modeler")
def modeler(live: int = 0):
    return j(AGS.run_modeler(bool(live)))


@router.get("/plan")
def plan():
    return j(store.load().get("jig_plan"))


@router.post("/plan/confirm")
def plan_confirm(ok: int = Form(1), note: str = Form("")):
    try:
        return j(AGS.confirm_plan(bool(ok), note))
    except ValueError as e:
        raise HTTPException(400, str(e))


# ----- what the owner says they use that this build cannot read yet (an MCP server, for example)
@router.post("/wishes")
def wishes_add(mcp_url: str = Form(""), name: str = Form(""), quote: str = Form("")):
    """A plant has many MCP servers. Each one the owner names is written down with the sentence of theirs that named it. This build lists them; it does not call them yet."""
    import re
    url = re.sub(r"//[^/@\s]*@", "//", mcp_url.strip())[:300]   # a password must never be stored
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "An MCP server address starts with http:// or https://")
    rec = {"id": store.new_id("mcp"), "name": (name.strip() or "MCP server")[:120], "url": url, "quote": quote.strip()[:300], "at": __import__("time").time()}

    def put(p):
        w = p.get("wishes") or {"also": [], "db_url": "", "mcp_url": ""}
        w["mcp_servers"] = [x for x in (w.get("mcp_servers") or []) if x["url"] != url] + [rec]
        p["wishes"] = w
    PL.update(put)
    return j({"ok": True, "server": rec})


@router.get("/mcp_servers")
def mcp_servers_list():
    return j({"servers": ((PL.get().get("wishes") or {}).get("mcp_servers") or [])})


# ----- the owner's edited floor (a Pascal scene graph kept per visitor)
@router.get("/feeds")
def feeds_get():
    """Every connected system with the stations it carries data for. The floor draws these as icons joined to their stations."""
    from server import ws_api
    from workspace import feeds
    return j({"feeds": feeds.feeds(ws_api.twin_cached())})


@router.get("/floor")
def floor_get():
    d = store.load()
    return j({"scene": d.get("floor_scene"), "saved_at": d.get("floor_saved_at")})


@router.put("/floor")
async def floor_put(request: Request):
    body = await request.body()
    if len(body) > 3_000_000:
        raise HTTPException(413, "the floor is too large to save (3 MB at most)")
    try:
        scene = json.loads(body)
    except Exception:
        raise HTTPException(400, "not valid JSON")
    if not isinstance(scene, dict) or not isinstance(scene.get("nodes"), dict) or not isinstance(scene.get("rootNodeIds"), list):
        raise HTTPException(400, "that is not a floor scene")
    d = store.load()
    d["floor_scene"], d["floor_saved_at"] = scene, __import__("time").time()
    store.save(d)
    return j({"ok": True, "nodes": len(scene["nodes"])})


@router.delete("/floor")
def floor_reset():
    d = store.load()
    d.pop("floor_scene", None)
    d.pop("floor_saved_at", None)
    store.save(d)
    return j({"ok": True})


# ----- playbooks: what should happen when a station fails, drawn by the owner
class PlaybookBody(BaseModel):
    id: str = ""
    name: str = ""
    enabled: bool = True
    nodes: list
    edges: list


@router.get("/playbooks")
def playbooks_get():
    from foreman import playbook as PB
    return j({**PB.list_public(), "starter": PB.starter()})


@router.post("/playbooks")
def playbooks_save(b: PlaybookBody):
    from foreman import playbook as PB
    try:
        PB.save(b.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))
    return j(PB.list_public())


@router.delete("/playbooks/{pid}")
def playbooks_remove(pid: str):
    from foreman import playbook as PB
    PB.remove(pid)
    return j(PB.list_public())


@router.post("/playbooks/{pid}/run")
def playbooks_run(pid: str, station: str = Form(...)):
    from foreman import playbook as PB
    try:
        return j(PB.run_by_id(pid, station))
    except ValueError as e:
        raise HTTPException(400, str(e))


# ----- Sentinel: plain rules on the plant's systems and claims
class RuleBody(BaseModel):
    name: str = ""
    kind: str
    target: dict = {}
    assertions: list
    severity: str = "warn"


def _sentinel(fn, *a):
    from sentinel import guard
    try:
        return j(fn(*a))
    except (ValueError, guard.Refused) as e:
        raise HTTPException(400, str(e))


@router.get("/sentinel")
def sentinel_get():
    from sentinel import service as SV
    return j(SV.public())


class ScheduleBody(BaseModel):
    enabled: bool
    every_min: int = 5
    tz_offset_min: int = 0


class WindowBody(BaseModel):
    name: str = ""
    start: str
    end: str
    rules: list = []


@router.post("/sentinel/schedule")
def sentinel_schedule(b: ScheduleBody):
    from sentinel import service as SV
    _sentinel(SV.set_schedule, b.enabled, b.every_min, b.tz_offset_min)
    return j(SV.public())


@router.post("/sentinel/windows")
def sentinel_window_add(b: WindowBody):
    from sentinel import service as SV
    _sentinel(SV.add_window, b.name, b.start, b.end, b.rules)
    return j(SV.public())


@router.delete("/sentinel/windows/{wid}")
def sentinel_window_remove(wid: str):
    from sentinel import service as SV
    SV.remove_window(wid)
    return j(SV.public())


@router.post("/sentinel/windows/propose")
def sentinel_window_propose():
    from sentinel import service as SV
    SV.propose_windows()
    return j(SV.public())


@router.get("/sentinel/impact")
def sentinel_impact():
    """For the floor: which stations lose their data because a rule is failing, and which rules say so."""
    from sentinel import service as SV
    return j(SV.impact_map())


class TryBody(BaseModel):
    kind: str
    target: dict = {}


@router.post("/sentinel/try")
def sentinel_try(b: TryBody):
    from sentinel import service as SV
    return _sentinel(SV.try_rule, b.kind, b.target)


@router.get("/sentinel/columns")
def sentinel_columns(table: str):
    from sentinel import service as SV
    return j({"columns": SV.columns(table)})


@router.post("/sentinel/rules")
def sentinel_add(b: RuleBody):
    from sentinel import service as SV
    _sentinel(SV.add, b.name, b.kind, b.target, b.assertions, b.severity)
    return j(SV.public())


@router.delete("/sentinel/rules/{rid}")
def sentinel_remove(rid: str):
    from sentinel import service as SV
    SV.remove(rid)
    return j(SV.public())


@router.post("/sentinel/propose")
def sentinel_propose():
    from sentinel import service as SV
    SV.propose()
    return j(SV.run_all())


@router.post("/sentinel/run")
def sentinel_run():
    from sentinel import service as SV
    return j(SV.run_all())


# ----- channels: where Warden tells a person
@router.get("/channels")
def channels_get():
    from foreman import notify
    return j({"channels": notify.public(), "types": notify.TYPES})


@router.post("/channels", dependencies=[Depends(rbac.need("manage_channels"))])
def channels_add(type: str = Form(...), name: str = Form(""), url: str = Form(""), token: str = Form(""), chat_id: str = Form("")):
    from foreman import notify
    try:
        notify.add(type, name, url, token, chat_id)
    except notify.Refused as e:
        raise HTTPException(400, str(e))
    return j({"channels": notify.public()})


@router.delete("/channels/{cid}", dependencies=[Depends(rbac.need("manage_channels"))])
def channels_remove(cid: str):
    from foreman import notify
    notify.remove(cid)
    return j({"channels": notify.public()})


@router.post("/channels/{cid}/test", dependencies=[Depends(rbac.need("manage_channels"))])
def channels_test(cid: str):
    from foreman import notify
    try:
        r = notify.test(cid)
    except notify.Refused as e:
        raise HTTPException(400, str(e))
    return j({**r, "channels": notify.public()})


# ----- operations
@router.post("/operations")
def operations(station: str = Form(...), live: int = Form(0)):
    return j(AGS.run_operations(station, bool(live)))


@router.post("/operations/{rid}/approve", dependencies=[Depends(rbac.need("approve_actions"))])
def approve(rid: str, index: int = Form(...), by: str = Form("operator")):
    try:
        return j(AGS.approve_proposal(rid, index, by))
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/operations/{rid}/reject", dependencies=[Depends(rbac.need("approve_actions"))])
def reject(rid: str, index: int = Form(...)):
    try:
        return j(AGS.reject_proposal(rid, index))
    except Exception as e:
        raise HTTPException(400, str(e))


# ----- Warden
@router.get("/warden")
def warden():
    return j({"settings": safety.settings(), "actions": {k: v["label"] for k, v in safety.ACTIONS.items()}, "weights": safety.WEIGHTS, "labels": safety.LABELS,
              "applied": (store.load().get("jig_actions") or [])[-12:][::-1], "backtest_job": safety.JOB})


@router.post("/warden/settings", dependencies=[Depends(rbac.need("change_thresholds"))])
def warden_settings(floor: int = Form(...), limit: int = Form(...)):
    try:
        return j(safety.set_settings(floor, limit))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/warden/backtest")
def warden_backtest(floor: int = None, limit: int = None):
    return j(safety.backtest(floor, limit))


@router.post("/warden/score")
def warden_score(kind: str = Form(...), station: str = Form(...), params: str = Form("{}"), evidence: float = Form(0.8), consecutive_faults: int = Form(0), plant_time: str = Form(""), order_value: float = Form(0)):
    ctx = AGS.context_for(station, evidence)
    ctx["consecutive_faults"] = max(ctx["consecutive_faults"], consecutive_faults)
    ctx["plant_time"] = plant_time or None
    ctx["order_value"] = order_value
    try:
        sc = safety.score_action({"kind": kind, "station": station, "params": json.loads(params)}, ctx)
    except ValueError as e:
        raise HTTPException(400, str(e))
    sc["reason"], sc["reason_by"] = safety.rationale(sc)
    return j(sc)


@router.post("/warden/reset")
def warden_reset():
    safety.reset_history()
    return j({"ok": True})


# ----- the plant record and the guide (first-time flow)
from pydantic import BaseModel


class SayBody(BaseModel):
    text: str = ""
    action: dict | None = None


@router.get("/plant")
def plant_get():
    from documents import engine as DE
    p = PL.get()
    from server import quota
    from workspace import store as _st
    return j({"plant": p, "docs": [{k: d[k] for k in ("name", "kind", "chars", "origin")} for d in DE.list_docs()], "connectors": GD.CONNECTORS, "guide": GD.state(), "usage": quota.usage(_st.UID.get())})


@router.post("/plant/name")
def plant_name(name: str = Form(...)):
    try:
        return j(PL.set_name(name))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/plant/sample")
def plant_sample(on: int = Form(1)):
    return j(PL.use_sample(bool(on)))


@router.post("/plant/stage")
def plant_stage(stage: str = Form(...)):
    try:
        return j(PL.set_stage(stage))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/plant/reset")
def plant_reset():
    GD.JOB.update(busy=False, what="", error=None)
    return j(PL.reset())


@router.get("/guide")
def guide_get():
    return j(GD.state())


@router.post("/guide/start")
def guide_start():
    return j(GD.start())


@router.post("/guide/say")
def guide_say(b: SayBody):
    try:
        return j(GD.say(b.text, b.action))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/guide/layout/confirm")
def guide_layout_confirm(ok: int = Form(1)):
    return j(GD.confirm_layout(bool(ok)))


@router.get("/proof")
def proof():
    """What a reviewer can check: where the app runs, which model answered each call, and whether a call failed and why."""
    import os
    from foreman import llm
    from fabric import agents as FA
    vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true")
    ledger = llm.LEDGER[-60:][::-1]
    by = {}
    for c in llm.LEDGER:
        k = f"{c['provider']}:{c['source']}"
        by[k] = by.get(k, 0) + 1
    return j({"runtime": {"on_google_cloud": bool(os.environ.get("K_SERVICE")), "cloud_run_service": os.environ.get("K_SERVICE"), "revision": os.environ.get("K_REVISION"),
                          "project": os.environ.get("GOOGLE_CLOUD_PROJECT"), "location": os.environ.get("GOOGLE_CLOUD_LOCATION"), "gemini_through": "Vertex AI" if vertex else ("Google AI Studio key" if FA.gemini_available() else "none"),
                          "gemma_fallback": llm.fallback_configured(), "models": os.environ.get("TOLERANCE_MODELS")},
              "gemini_calls_today": FA.calls_today(), "counts": by, "ledger": ledger})


@router.get("/auth")
def auth_config():
    """Tells the screens whether sign-in is on, and gives the public web settings of the Firebase project."""
    from server import auth
    return j({"enabled": auth.REQUIRED, "config": auth.CONFIG if auth.REQUIRED else None})


@router.post("/redeem")
def redeem(code: str = Form(...)):
    """An access code gives a bigger quota and skips the new-session limit."""
    from server import quota
    try:
        return j({"ok": True, "usage": quota.redeem(store.UID.get(), code)})
    except quota.Denied as e:
        raise HTTPException(e.status, str(e))
