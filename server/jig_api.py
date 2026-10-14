"""API of the Tolerance platform: the agent catalog, onboarding, operations and Warden."""
import json, threading
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from foreman import core, safety, agents as AGS, plant as PL, guide as GD
from workspace import store

router = APIRouter(prefix="/api/jig")
JOBS = {}


def j(o):
    return JSONResponse(json.loads(json.dumps(o, default=str)))


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


# ----- operations
@router.post("/operations")
def operations(station: str = Form(...), live: int = Form(0)):
    return j(AGS.run_operations(station, bool(live)))


@router.post("/operations/{rid}/approve")
def approve(rid: str, index: int = Form(...), by: str = Form("operator")):
    try:
        return j(AGS.approve_proposal(rid, index, by))
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/operations/{rid}/reject")
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


@router.post("/warden/settings")
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
    return j({"plant": p, "docs": [{k: d[k] for k in ("name", "kind", "chars", "origin")} for d in DE.list_docs()], "connectors": GD.CONNECTORS, "guide": GD.state()})


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
