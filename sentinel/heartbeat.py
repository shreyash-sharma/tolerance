"""Heartbeat checks: a machine, a PLC gateway or a script calls a secret web address now and then. If the calls stop, the rule fails.
The idea follows the push monitors of the Kanshi project. The address needs no login, so it holds only a long random token. It tells nothing
about the owner and can do nothing except record "I am alive". Beats are kept in one small file, apart from any visitor's data."""
import json, os, threading, time

from fastapi import APIRouter

from plant import core

router = APIRouter(prefix="/api/hb")
PATH = os.path.join(core.DATA, "heartbeats.json")
_LOCK = threading.RLock()


def _load():
    try:
        return json.load(open(PATH, encoding="utf8"))
    except Exception:
        return {}


def _save(d):
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    tmp = PATH + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf8"))
    os.replace(tmp, PATH)


def ensure(token):
    with _LOCK:
        d = _load()
        d.setdefault(token, {"last": None, "count": 0})
        _save(d)


def remove(token):
    with _LOCK:
        d = _load()
        d.pop(token, None)
        _save(d)


def info(token):
    with _LOCK:
        return _load().get(token)


def beat(token):
    """Records one beat. Returns False for an unknown token."""
    with _LOCK:
        d = _load()
        rec = d.get(token)
        if rec is None:
            return False
        now = time.time()
        if not rec["last"] or now - rec["last"] >= 1.0:   # more than one beat a second is not counted
            rec["last"], rec["count"] = now, rec["count"] + 1
            _save(d)
        return True


@router.api_route("/{token}", methods=["GET", "POST"])
def hb(token: str):
    if len(token) < 16 or not beat(token):
        return {"ok": False}   # the same answer for a wrong token as for a missing one
    return {"ok": True}


def observe(token, grace_s):
    rec = info(token) or {"last": None, "count": 0}
    since = None if not rec["last"] else round(time.time() - rec["last"], 1)
    return {"beats": rec["count"], "ever": bool(rec["last"]), "seconds_since": since if since is not None else 10 ** 9, "grace_s": grace_s,
            "last_beat": None if not rec["last"] else time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(rec["last"])) + " UTC"}
