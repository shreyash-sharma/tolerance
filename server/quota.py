"""Limits that keep the public site usable: a quota per visitor, a bigger one with an access code, a limit on new sessions per network address,
and a cap on the number of users held in memory. Together with the daily cap on Gemini calls and the automatic billing stop, one visitor
cannot use up the budget, the memory, or the day's AI calls for everyone else."""
import hmac, json, os, threading, time
from collections import deque

from plant import core

CAPS = {
    "guest": {"gemini": 80, "upload_bytes": 2_000_000, "docs": 10},
    "member": {"gemini": 200, "upload_bytes": 4_000_000, "docs": 20},
    "code": {"gemini": 800, "upload_bytes": 8_000_000, "docs": 40},
}
NEW_PER_HOUR_PER_IP = int(os.environ.get("NEW_SESSIONS_PER_HOUR", "12"))
MAX_USERS = int(os.environ.get("MAX_USERS", "400"))
CODES = [c.strip() for c in os.environ.get("ACCESS_CODES", "").split(",") if c.strip()]
LOCK = threading.Lock()
_users, _ips = {}, {}
PATH = os.path.join(core.DATA, "usage.json")


class Denied(Exception):
    def __init__(self, msg, status=429):
        super().__init__(msg)
        self.status = status


def _save():
    try:
        json.dump(_users, open(PATH, "w"))
    except Exception:
        pass


def _load():
    try:
        _users.update(json.load(open(PATH)))
    except Exception:
        pass


_load()


def touch(uid, guest, ip):
    """Called for every signed-in request. Registers a new visitor, and refuses it when the site is full or one network address makes too many."""
    with LOCK:
        u = _users.get(uid)
        if u:
            return u
        if len(_users) >= MAX_USERS:
            raise Denied("The demo is full right now. Please try again later, or ask for an access code.", 503)
        now = time.time()
        q = _ips.setdefault(ip or "?", deque())
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= NEW_PER_HOUR_PER_IP:
            raise Denied("Too many new sessions from your network in the last hour. Try again later, or use an access code.")
        q.append(now)
        u = _users[uid] = {"tier": "guest" if guest else "member", "gemini": 0, "bytes": 0, "first": now}
        _save()
        return u


def redeem(uid, code):
    code = (code or "").strip()
    ok = any(hmac.compare_digest(code.encode(), c.encode()) for c in CODES) if code else False
    if not ok:
        raise Denied("That access code is not valid.", 400)
    with LOCK:
        _users.setdefault(uid, {"gemini": 0, "bytes": 0, "first": time.time()})["tier"] = "code"
        _save()
    return usage(uid)


def usage(uid):
    u = _users.get(uid)
    if not u:
        return None
    cap = CAPS[u["tier"]]
    return {"tier": u["tier"], "gemini_used": u["gemini"], "gemini_cap": cap["gemini"], "upload_cap_bytes": cap["upload_bytes"], "docs_cap": cap["docs"]}


def charge_gemini(uid):
    u = _users.get(uid)
    if not u:
        return
    cap = CAPS[u["tier"]]["gemini"]
    if u["gemini"] >= cap:
        raise RuntimeError(f"AI call limit reached for this {'guest session' if u['tier'] == 'guest' else 'account'} ({cap} calls). Sign in or enter an access code for more.")
    u["gemini"] += 1


def charge_upload(uid, nbytes, n_docs):
    u = _users.get(uid)
    if not u:
        return
    cap = CAPS[u["tier"]]
    if n_docs >= cap["docs"]:
        raise Denied(f"You can keep up to {cap['docs']} documents. Remove one first, or enter an access code.", 413)
    if u["bytes"] + nbytes > cap["upload_bytes"]:
        raise Denied("Upload limit reached for this session. Enter an access code for more room.", 413)
    u["bytes"] += nbytes
