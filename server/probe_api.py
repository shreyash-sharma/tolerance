"""Platform side of the probes: check-in, reports, and the comparison of what each vantage point sees."""
import subprocess, sys, threading, time
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/probes")
PROBES = {}
HIST = {}
LOCK = threading.RLock()
PROCS = {}
ROOT = __import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__)))


class Report(BaseModel):
    name: str
    where: str = ""
    os: str = ""
    every: float = 10
    tests: list
    at: float


def compare(probes):
    """For each target: who sees it up, who sees it down. The verdict says where the problem is."""
    now = time.time()
    live = [p for p in probes if now - p["last_seen"] <= 3 * p["every"] + 2]
    targets = {}
    for p in live:
        for t in p["tests"]:
            targets.setdefault(t["name"], {"target": t["target"], "views": []})["views"].append({"probe": p["name"], "where": p["where"], "ok": t["ok"], "detail": t["detail"], "ms": t.get("connect_ms"), "injected": t.get("injected", False)})
    out = []
    for name, d in targets.items():
        v = d["views"]
        up = [x for x in v if x["ok"]]
        down = [x for x in v if not x["ok"]]
        if len(v) < 2:
            verdict, why = "one view", "Only one probe watches this target. Add a second probe in another place to tell a machine fault from a path fault."
        elif not down:
            verdict, why = "healthy", "Every probe reaches it."
        elif not up:
            verdict, why = "down at the target", f"All {len(v)} probes fail. The fault is at the target, not on one path."
        else:
            verdict, why = "path fault", f"{', '.join(x['probe'] for x in down)} cannot reach it, but {', '.join(x['probe'] for x in up)} can. The target works; look at the path from {down[0]['where']}."
        out.append({"target_name": name, "target": d["target"], "verdict": verdict, "why": why, "views": v})
    return out


@router.post("/report")
def report(r: Report):
    with LOCK:
        p = PROBES.setdefault(r.name, {"name": r.name, "first_seen": time.time(), "reports": 0})
        p.update(where=r.where, os=r.os, every=r.every, tests=r.tests, last_seen=time.time(), reports=p["reports"] + 1)
        h = HIST.setdefault(r.name, [])
        h.append({"at": time.time(), "ok": all(t["ok"] for t in r.tests)})
        del h[:-60]
    return {"ok": True}


@router.get("")
def status():
    with LOCK:
        probes = [dict(p, history=HIST.get(p["name"], [])[-30:], managed=p["name"] in PROCS and PROCS[p["name"]].poll() is None) for p in PROBES.values()]
    now = time.time()
    for p in probes:
        p["alive"] = now - p["last_seen"] <= 3 * p["every"] + 2
    return JSONResponse({"probes": probes, "compare": compare(probes)})


@router.post("/start")
def start(name: str, where: str = "", cut: str = "", every: float = 6):
    """Start a probe as its own process on this machine. Used to demonstrate several vantage points from one laptop."""
    if not name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "bad name")
    with LOCK:
        old = PROCS.get(name)
        if old and old.poll() is None:
            old.terminate()
        args = [sys.executable, "-m", "probe.agent", "--name", name, "--where", where or name, "--every", str(every)]
        if cut:
            args += ["--cut", cut]
        PROCS[name] = subprocess.Popen(args, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"ok": True}


@router.post("/stop")
def stop(name: str):
    with LOCK:
        p = PROCS.pop(name, None)
        if p and p.poll() is None:
            p.terminate()
        PROBES.pop(name, None)
    return {"ok": True}
