"""A Google Cloud SQL database as a watched system. Tolerance asks the Cloud SQL Admin API for the instance state every few seconds. When the instance is stopped,
it opens an incident like any other service going down: Warden scores the fix, a person approves it in the app or on Telegram, and then Tolerance starts the instance.
The only thing it can do to the instance is start it (activation policy ALWAYS). It never stops, deletes or changes anything else, and only for the one instance the owner named.
Credentials: the Cloud Run service account (role roles/cloudsql.editor or admin on this instance). On a laptop: gcloud application-default credentials, or the gcloud login."""
import subprocess, threading, time

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server import hostops, rbac
from workspace import store

router = APIRouter(prefix="/api/cloud")
API = "https://sqladmin.googleapis.com/v1/projects/{p}/instances/{i}"
EVERY = 5.0
_THREADS = {}
UNIT = "cloud_sql"


def _token():
    """An access token. The service account on Cloud Run, else application-default credentials, else the gcloud login of this computer."""
    try:
        import google.auth
        from google.auth.transport.requests import Request
        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        creds.refresh(Request())
        return creds.token
    except Exception:
        pass
    try:
        return subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, timeout=20, shell=(subprocess.os.name == "nt")).stdout.strip()
    except Exception:
        return ""


def api_get(project, instance):
    """The instance: {state, policy, ip, version}. Raises ValueError with a plain sentence on failure."""
    tok = _token()
    if not tok:
        raise ValueError("I have no Google Cloud credentials here. On Cloud Run the service account is used. On a laptop run: gcloud auth application-default login")
    r = httpx.get(API.format(p=project, i=instance), headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    if r.status_code == 404:
        raise ValueError("I cannot find that instance in that project.")
    if r.status_code in (401, 403):
        raise ValueError("Google refused: this account may not look at Cloud SQL instances in that project (role cloudsql.viewer or more).")
    if r.status_code >= 400:
        raise ValueError(f"Google answered {r.status_code}.")
    d = r.json()
    ips = [x.get("ipAddress") for x in d.get("ipAddresses", []) if x.get("type") == "PRIMARY"]
    return {"state": d.get("state", ""), "policy": (d.get("settings") or {}).get("activationPolicy", ""), "ip": ips[0] if ips else "", "version": d.get("databaseVersion", "")}


def api_start(project, instance):
    """The one change Tolerance may make: switch the instance on."""
    tok = _token()
    r = httpx.patch(API.format(p=project, i=instance), headers={"Authorization": f"Bearer {tok}"}, json={"settings": {"activationPolicy": "ALWAYS"}}, timeout=20)
    if r.status_code == 409:
        return   # an operation is already running: the instance is already starting
    if r.status_code >= 400:
        raise ValueError(f"Google refused the start ({r.status_code}): {r.text[:120]}")


def tcp_ok(ip, port=5432):
    import socket
    try:
        socket.create_connection((ip, port), timeout=3).close()
        return True
    except OSError:
        return False


def classify(info):
    """True: running and the database port answers. False: stopped on purpose or suspended. None: starting or changing, so nothing is reported yet."""
    if info["policy"] == "NEVER" or (info["state"] in ("SUSPENDED", "STOPPED") and info["policy"] != "ALWAYS"):
        return False
    if info["state"] == "RUNNABLE" and info["policy"] == "ALWAYS" and (not info.get("ip") or tcp_ok(info["ip"])):
        return True
    return None


def is_up(info):
    return classify(info) is True


def _cfg():
    return store.load().get("cloud_sql") or None


def _loop(uid):
    tok = store.UID.set(uid)
    started = {}   # command id -> when the start was sent
    results = []
    try:
        while True:
            c = _cfg()
            if not c:
                return
            try:
                info = api_get(c["project"], c["instance"])
                up = classify(info)
                store.update(lambda d: d["cloud_sql"].update(last=dict(info, up=bool(up), starting=up is None, at=time.time(), error="")))
            except Exception as e:
                up = None
                store.update(lambda d: d["cloud_sql"].update(last=dict(d["cloud_sql"].get("last") or {}, error=str(e)[:160], at=time.time())))
            if up is not None:
                rep = {"name": "cloud-sql", "where": f"Cloud SQL {c['instance']}", "services": {UNIT: up}, "readings": {}, "results": results}
                results = []
                for cmd in hostops.process(rep):
                    if cmd["kind"] == "service_restart" and cmd.get("unit") == UNIT:
                        try:
                            api_start(c["project"], c["instance"])
                            results.append({"id": cmd["id"], "ok": True, "output": "Cloud SQL start sent"})
                        except Exception as e:
                            results.append({"id": cmd["id"], "ok": False, "output": str(e)[:150]})
            time.sleep(EVERY)
    finally:
        store.UID.reset(tok)


def watch(uid):
    t = _THREADS.get(uid)
    if t and t.is_alive():
        return
    t = threading.Thread(target=_loop, args=(uid,), daemon=True, name="cloudsql-watch")
    _THREADS[uid] = t
    t.start()


class Body(BaseModel):
    project: str
    instance: str
    affects: list = []


@router.get("")
def status():
    import os
    c = _cfg()
    return JSONResponse({"config": c, "default_project": os.environ.get("GOOGLE_CLOUD_PROJECT", "")})


@router.post("", dependencies=[Depends(rbac.need("connect_systems"))])
def save(b: Body):
    p, i = b.project.strip(), b.instance.strip()
    if not p or not i:
        raise HTTPException(400, "Give the project id and the instance name.")
    try:
        info = api_get(p, i)
    except ValueError as e:
        raise HTTPException(400, str(e))
    d = store.load()
    d["cloud_sql"] = {"project": p, "instance": i, "affects": [x for x in b.affects if isinstance(x, str)][:8], "last": dict(info, up=is_up(info), starting=classify(info) is None, at=time.time(), error="")}
    store.save(d)
    watch(store.UID.get())
    return JSONResponse({"config": d["cloud_sql"]})


@router.delete("", dependencies=[Depends(rbac.need("connect_systems"))])
def remove():
    d = store.load()
    d.pop("cloud_sql", None)
    store.save(d)
    return JSONResponse({"config": None})
