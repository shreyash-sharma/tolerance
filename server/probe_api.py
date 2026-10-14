"""Platform side of the probes: check-in, reports, and the comparison of what each vantage point sees."""
import os, secrets, subprocess, sys, threading, time
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/probes")
PROBES = {}
HIST = {}
LOCK = threading.RLock()
PROCS = {}
ROOT = __import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__)))


SECRET = secrets.token_hex(16)   # lets the probe programs, which run inside this container, report without a visitor token
MAX_PER_VISITOR, MAX_TOTAL = 3, 12


def _me():
    from workspace import store
    return store.UID.get()


class Report(BaseModel):
    owner: str = "local"
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
        k = (r.owner, r.name)
        p = PROBES.setdefault(k, {"name": r.name, "owner": r.owner, "first_seen": time.time(), "reports": 0})
        p.update(where=r.where, os=r.os, every=r.every, tests=r.tests, last_seen=time.time(), reports=p["reports"] + 1)
        h = HIST.setdefault(k, [])
        h.append({"at": time.time(), "ok": all(t["ok"] for t in r.tests)})
        del h[:-60]
    return {"ok": True}


@router.get("")
def status():
    with LOCK:
        me = _me()
        probes = [dict(p, history=HIST.get((me, p["name"]), [])[-30:], managed=(me, p["name"]) in PROCS and PROCS[(me, p["name"])].poll() is None) for p in PROBES.values() if p.get("owner") == me]
    now = time.time()
    for p in probes:
        p["alive"] = now - p["last_seen"] <= 3 * p["every"] + 2
    return JSONResponse({"probes": probes, "compare": compare(probes)})


@router.post("/start")
def start(name: str, where: str = "", cut: str = "", every: float = 6):
    """Start a probe as its own process on this machine. Used to demonstrate several vantage points from one laptop. Each visitor has their own."""
    if not name.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "bad name")
    me = _me()
    with LOCK:
        for k in [k for k, p in PROCS.items() if p.poll() is not None]:
            PROCS.pop(k, None)
        old = PROCS.get((me, name))
        if old and old.poll() is None:
            old.terminate()
        mine = [k for k in PROCS if k[0] == me and k[1] != name]
        if len(mine) >= MAX_PER_VISITOR or len(PROCS) >= MAX_TOTAL:
            raise HTTPException(429, "Too many probes are running. Stop one first.")
        port = os.environ.get("PORT", "48410")   # the cloud gives the port; a laptop uses 48410
        args = [sys.executable, "-m", "probe.agent", "--name", name, "--where", where or name, "--every", str(every), "--owner", me, "--server", f"http://127.0.0.1:{port}"]
        if cut:
            args += ["--cut", cut]
        PROCS[(me, name)] = subprocess.Popen(args, cwd=ROOT, env=dict(os.environ, PROBE_KEY=SECRET), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"ok": True}


@router.post("/stop")
def stop(name: str):
    me = _me()
    with LOCK:
        p = PROCS.pop((me, name), None)
        if p and p.poll() is None:
            p.terminate()
        PROBES.pop((me, name), None)
    return {"ok": True}
