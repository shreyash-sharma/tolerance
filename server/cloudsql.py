"""A Google Cloud SQL database as a watched system. Tolerance asks the Cloud SQL Admin API for the instance state every few seconds. When the instance is stopped,
it opens an incident like any other service going down: Warden scores the fix, a person approves it in the app or on Telegram, and then Tolerance starts the instance.
The only thing it can do to the instance is start it (activation policy ALWAYS). It never stops, deletes or changes anything else, and only for the one instance the owner named.
Credentials: the Cloud Run service account (role roles/cloudsql.editor or admin on this instance). On a laptop: gcloud application-default credentials, or the gcloud login."""
import base64, json, os, subprocess, threading, time
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from server import hostops, rbac
from workspace import store, vault

router = APIRouter(prefix="/api/cloud")
API = "https://sqladmin.googleapis.com/v1/projects/{p}/instances/{i}"
EVERY = 5.0
_THREADS = {}
UNIT = "cloud_sql"


SCOPES = "https://www.googleapis.com/auth/sqlservice.admin openid email"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
_ACCESS = {}   # uid -> (access token, expiry)


def oauth_ready():
    return bool(os.environ.get("GOOGLE_OAUTH_CLIENT_ID") and os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"))


def _oauth_cfg():
    return store.load().get("google_oauth") or None


def _oauth_token():
    """An access token for the person who pressed Connect Google Cloud, made from the refresh token in the vault. None when nobody connected."""
    g = _oauth_cfg()
    if not g:
        return None
    uid = store.UID.get()
    hit = _ACCESS.get(uid)
    if hit and hit[1] > time.time() + 60:
        return hit[0]
    refresh = vault.get(g["ref"])
    if not refresh:
        raise ValueError("The Google sign-in is gone. Press Connect Google Cloud again.")
    r = httpx.post(TOKEN_URL, data={"client_id": os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""), "client_secret": os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", ""),
                                    "refresh_token": refresh, "grant_type": "refresh_token"}, timeout=15)
    if r.status_code != 200:
        raise ValueError("Google ended your sign-in (it expires after a few days in test mode). Press Connect Google Cloud again.")
    d = r.json()
    _ACCESS[uid] = (d["access_token"], time.time() + int(d.get("expires_in", 3000)))
    return d["access_token"]


def _redirect_uri(request):
    base = os.environ.get("TOLERANCE_PUBLIC_URL", "").rstrip("/")
    if not base:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
        base = f"{proto}://{request.headers.get('x-forwarded-host', request.headers.get('host', ''))}"
    return base + "/api/cloud/oauth/callback"


def _token():
    """An access token. The signed-in person's Google connection first, else the service account on Cloud Run, else application-default credentials, else the gcloud login of this computer."""
    mine = _oauth_token()
    if mine:
        return mine
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


def _refused(r, tok, what):
    """A plain sentence for a 401 or 403: which account was used, whether the Cloud SQL permission was granted, and what Google said."""
    who = (_oauth_cfg() or {}).get("email") or ""
    reason = ""
    try:
        reason = (r.json().get("error") or {}).get("message", "")[:140]
    except Exception:
        pass
    scopes = ""
    if who and tok:
        try:
            scopes = httpx.get("https://oauth2.googleapis.com/tokeninfo", params={"access_token": tok}, timeout=10).json().get("scope", "")
        except Exception:
            pass
    if who and scopes and "sqlservice.admin" not in scopes:
        return f"{who} is connected, but the Cloud SQL permission was not ticked on Google's screen. Press Use a different account, connect again, and leave every box ticked."
    if who:
        return f"Google refused {who}: that account has no right to {what} in this project." + (f" Google says: {reason}" if reason else "") + " Use the project owner's account, or add this account to the project with a Cloud SQL role."
    return f"Google refused the service account to {what} in this project." + (f" Google says: {reason}" if reason else "")


def api_get(project, instance):
    """The instance: {state, policy, ip, version}. Raises ValueError with a plain sentence on failure."""
    tok = _token()
    if not tok:
        raise ValueError("I have no Google Cloud credentials here. On Cloud Run the service account is used. On a laptop run: gcloud auth application-default login")
    r = httpx.get(API.format(p=project, i=instance), headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    if r.status_code == 404:
        raise ValueError("I cannot find that instance in that project.")
    if r.status_code in (401, 403):
        raise ValueError(_refused(r, tok, "look at this Cloud SQL instance"))
    if r.status_code >= 400:
        raise ValueError(f"Google answered {r.status_code}.")
    d = r.json()
    ips = [x.get("ipAddress") for x in d.get("ipAddresses", []) if x.get("type") == "PRIMARY"]
    return {"state": d.get("state", ""), "policy": (d.get("settings") or {}).get("activationPolicy", ""), "ip": ips[0] if ips else "", "version": d.get("databaseVersion", "")}


def api_find(project, host):
    """The instance in this project that the database address points to: matched by its IP, or by its name. Raises ValueError with a plain sentence."""
    tok = _token()
    if not tok:
        raise ValueError("I have no Google Cloud credentials here. Press Connect Google Cloud.")
    r = httpx.get(f"https://sqladmin.googleapis.com/v1/projects/{project}/instances", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    if r.status_code in (401, 403):
        raise ValueError(_refused(r, tok, "list Cloud SQL instances"))
    if r.status_code >= 400:
        raise ValueError(f"Google answered {r.status_code}.")
    for d in r.json().get("items", []):
        ips = [x.get("ipAddress") for x in d.get("ipAddresses", [])]
        if host in ips or host == d.get("name"):
            return d["name"]
    raise ValueError("No Cloud SQL instance in that project has this address. Check the project id.")


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
    c = _cfg()
    g = _oauth_cfg()
    return JSONResponse({"config": c, "default_project": os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
                         "oauth": {"available": oauth_ready(), "connected": bool(g), "email": (g or {}).get("email", "")}})


@router.post("/oauth/start", dependencies=[Depends(rbac.need("connect_systems"))])
def oauth_start(request: Request):
    """The address of Google's consent screen. The state is sealed with the vault key and names the plant, so the callback needs no sign-in."""
    if not oauth_ready():
        raise HTTPException(400, "This server has no Google OAuth client yet (GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET).")
    state = vault._fernet().encrypt(json.dumps({"uid": store.UID.get()}).encode()).decode()
    q = urlencode({"client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"], "redirect_uri": _redirect_uri(request), "response_type": "code", "scope": SCOPES,
                   "access_type": "offline", "prompt": "consent", "state": state})
    return JSONResponse({"url": f"{AUTH_URL}?{q}"})


def _done(back, result):
    """Opened as a small window (from the connect step): close it, the page behind notices. Opened as a page: go back to Probes."""
    return HTMLResponse(f"<!doctype html><meta charset=utf-8><title>Google Cloud</title><body style='font:16px sans-serif;background:#111;color:#ddd;padding:24px'>"
                        f"<p>{'Connected. You can close this window.' if result == 'connected' else 'Not connected.'}</p>"
                        f"<script>if(window.opener){{window.close()}}else{{location.replace('{back}?google={result}')}}</script>")


@router.get("/oauth/callback")
def oauth_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    """Google sends the browser back here. Public route: only a state sealed by this server is trusted."""
    back = "/probes/"
    if error or not code:
        return _done(back, "declined")
    try:
        uid = json.loads(vault._fernet().decrypt(state.encode(), ttl=900))["uid"]
    except Exception:
        return _done(back, "expired")
    r = httpx.post(TOKEN_URL, data={"code": code, "client_id": os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""), "client_secret": os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", ""),
                                    "redirect_uri": _redirect_uri(request), "grant_type": "authorization_code"}, timeout=15)
    d = r.json() if r.status_code == 200 else {}
    if not d.get("refresh_token"):
        return _done(back, "failed")
    email = ""
    try:
        part = d.get("id_token", "").split(".")[1]
        email = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))).get("email", "")
    except Exception:
        pass
    tok = store.UID.set(uid)
    try:
        old = _oauth_cfg()
        ref = vault.put(d["refresh_token"])
        store.update(lambda s: s.__setitem__("google_oauth", {"ref": ref, "email": email, "at": time.time()}))
        if old:
            vault.drop(old["ref"])
        _ACCESS.pop(uid, None)
    finally:
        store.UID.reset(tok)
    return _done(back, "connected")


@router.delete("/oauth", dependencies=[Depends(rbac.need("connect_systems"))])
def oauth_disconnect():
    g = _oauth_cfg()
    if g:
        try:
            rt = vault.get(g["ref"])
            if rt:
                httpx.post("https://oauth2.googleapis.com/revoke", data={"token": rt}, timeout=10)
        except Exception:
            pass
        vault.drop(g["ref"])
        store.update(lambda s: s.pop("google_oauth", None))
        _ACCESS.pop(store.UID.get(), None)
    return JSONResponse({"oauth": {"available": oauth_ready(), "connected": False, "email": ""}})


@router.post("", dependencies=[Depends(rbac.need("connect_systems"))])
def save(b: Body):
    p, i = b.project.strip(), b.instance.strip()
    if not p or not i:
        raise HTTPException(400, "Give the project id and the instance name.")
    try:
        info = api_get(p, i)
    except ValueError as e:
        raise HTTPException(400, str(e))
    with store.LOCK:
        d = store.load()
        d["cloud_sql"] = {"project": p, "instance": i, "affects": [x for x in b.affects if isinstance(x, str)][:8], "last": dict(info, up=is_up(info), starting=classify(info) is None, at=time.time(), error="")}
        store.save(d)
    watch(store.UID.get())
    return JSONResponse({"config": d["cloud_sql"]})


class Auto(BaseModel):
    host: str
    project: str = ""


@router.post("/auto", dependencies=[Depends(rbac.need("connect_systems"))])
def auto(b: Auto):
    """Find the Cloud SQL instance behind the database address (with the connected Google account) and start watching it."""
    project = b.project.strip() or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    if not project:
        raise HTTPException(400, "Give the Google Cloud project id.")
    try:
        name = api_find(project, b.host.strip())
    except ValueError as e:
        raise HTTPException(400, str(e))
    return save(Body(project=project, instance=name, affects=[]))


@router.delete("", dependencies=[Depends(rbac.need("connect_systems"))])
def remove():
    with store.LOCK:
        d = store.load()
        d.pop("cloud_sql", None)
        store.save(d)
    return JSONResponse({"config": None})
