"""Who may do what, for people. Cedar decides, the same engine that decides what the agents may do.
Roles are lists of permissions. People hold one role. Every protected route asks Cedar before it runs, and the answer is checked on the server, not only hidden in the screen.
On a laptop the owner can act as any person on the team, to show what each role may and may not do (the screen says so). In the cloud the signed-in person is the owner of their own plant."""
import contextvars, hmac, secrets, time

import cedarpy
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from workspace import store

router = APIRouter(prefix="/api/team")
PERMS = {
    "view": "See the floor, incidents and the audit log",
    "run_checks": "Run checks and diagnoses",
    "approve_actions": "Approve or reject a fix",
    "change_thresholds": "Change the score thresholds",
    "connect_systems": "Connect systems and probes",
    "manage_channels": "Add or remove alert channels",
    "manage_team": "Add people and change roles",
}
BUILTIN = {
    "Owner": {"permissions": list(PERMS), "builtin": True, "note": "Everything. Cannot be changed."},
    "Supervisor": {"permissions": ["view", "run_checks", "approve_actions", "manage_channels"], "builtin": True, "note": "Approves fixes and runs the alerts."},
    "Operator": {"permissions": ["view", "run_checks"], "builtin": True, "note": "Runs checks. Cannot approve."},
    "Viewer": {"permissions": ["view"], "builtin": True, "note": "Read only."},
}
ACTING = contextvars.ContextVar("acting", default="")   # the team member who acts in this request (a laptop only)
EMAIL = contextvars.ContextVar("email", default="")     # the signed-in email in the cloud


def _state(d=None):
    d = d if d is not None else store.load()
    r = d.setdefault("rbac", {})
    r.setdefault("roles", {k: dict(v) for k, v in BUILTIN.items()})
    for k, v in BUILTIN.items():   # built-in roles are fixed
        r["roles"][k] = dict(v)
    r.setdefault("members", [])
    if not any(m.get("owner") for m in r["members"]):
        r["members"].insert(0, {"id": "m_owner", "name": "Owner", "email": EMAIL.get() or "", "role": "Owner", "owner": True, "telegram_id": "", "link_code": ""})
    return r


def _cedar(r):
    L = ["// Generated from the roles on the Team page. Default deny."]
    for role, spec in r["roles"].items():
        for p in spec["permissions"]:
            if p in PERMS:
                L.append(f'permit(principal in Role::"{role}", action == Action::"{p}", resource == Plant::"this");')
    ents = [{"uid": {"type": "Role", "id": role}, "attrs": {}, "parents": []} for role in r["roles"]]
    ents += [{"uid": {"type": "User", "id": m["id"]}, "attrs": {}, "parents": [{"type": "Role", "id": m["role"]}] if m["role"] in r["roles"] else []} for m in r["members"]]
    ents.append({"uid": {"type": "Plant", "id": "this"}, "attrs": {}, "parents": []})
    return "\n".join(L), ents


def allowed(member_id, permission):
    r = _state()
    policy, ents = _cedar(r)
    req = {"principal": f'User::"{member_id}"', "action": f'Action::"{permission}"', "resource": 'Plant::"this"', "context": {}}
    return str(cedarpy.is_authorized(req, policy, ents).decision).endswith("Allow")


def member(member_id=None, telegram_id=None):
    for m in _state()["members"]:
        if (member_id and m["id"] == member_id) or (telegram_id and m.get("telegram_id") and str(m["telegram_id"]) == str(telegram_id)):
            return m
    return None


def current():
    """Who is acting. The acting member on a laptop, else the owner (a signed-in person owns their own plant)."""
    r = _state()
    a = ACTING.get()
    m = next((x for x in r["members"] if x["id"] == a), None) if a else None
    return m or next(x for x in r["members"] if x.get("owner"))


def label(m):
    return m["role"] if m["name"].lower() == m["role"].lower() else f"{m['name']} ({m['role']})"


def need(permission):
    """A route dependency: the acting person must hold this permission, or the answer is 403 and the refusal is recorded."""
    def dep(request: Request, x_acting_as: str = Header("")):
        from server import auth
        tok = ACTING.set("" if auth.REQUIRED else x_acting_as)
        m = current()
        if not allowed(m["id"], permission):
            _audit(f"{label(m)} tried to {PERMS[permission].lower()} and was refused")
            raise HTTPException(403, f"Your role ({m['role']}) may not do this: {PERMS[permission].lower()}.")
        return m
    return dep


def _audit(text):
    d = store.load()
    h = d.setdefault("host", {})
    h.setdefault("audit", []).append({"at": time.time(), "text": text})
    del h["audit"][:-80]
    store.save(d)


# ------------------------------------------------------------------ the Team page API
class Person(BaseModel):
    name: str
    email: str = ""
    role: str = "Viewer"


class RoleBody(BaseModel):
    name: str
    permissions: list


def _public(r):
    from server import auth
    me = current()
    return {"perms": PERMS, "roles": r["roles"], "local": not auth.REQUIRED, "me": me["id"],
            "members": [{k: m.get(k, "") for k in ("id", "name", "email", "role", "owner", "telegram_id", "link_code")} for m in r["members"]],
            "can_manage": allowed(me["id"], "manage_team")}


@router.get("")
def team(x_acting_as: str = Header("")):
    from server import auth
    ACTING.set("" if auth.REQUIRED else x_acting_as)
    return JSONResponse(_public(_state()))


@router.post("/people", dependencies=[Depends(need("manage_team"))])
def add_person(b: Person):
    d = store.load()
    r = _state(d)
    if b.role not in r["roles"] or b.role == "Owner":
        raise HTTPException(400, "Pick a role from the list. There is one Owner.")
    if not b.name.strip():
        raise HTTPException(400, "Write the person's name.")
    r["members"].append({"id": store.new_id("m"), "name": b.name.strip()[:60], "email": b.email.strip()[:120], "role": b.role, "owner": False, "telegram_id": "", "link_code": secrets.token_hex(3).upper()})
    store.save(d)
    _audit(f"{label(current())} added {b.name.strip()} as {b.role}")
    return JSONResponse(_public(_state()))


@router.post("/people/{mid}/role", dependencies=[Depends(need("manage_team"))])
def set_role(mid: str, role: str):
    d = store.load()
    r = _state(d)
    m = next((x for x in r["members"] if x["id"] == mid), None)
    if not m or m.get("owner"):
        raise HTTPException(400, "The owner's role cannot be changed.")
    if role not in r["roles"] or role == "Owner":
        raise HTTPException(400, "Pick a role from the list.")
    old, m["role"] = m["role"], role
    store.save(d)
    _audit(f"{label(current())} changed {m['name']} from {old} to {role}")
    return JSONResponse(_public(_state()))


@router.delete("/people/{mid}", dependencies=[Depends(need("manage_team"))])
def remove_person(mid: str):
    d = store.load()
    r = _state(d)
    m = next((x for x in r["members"] if x["id"] == mid), None)
    if not m or m.get("owner"):
        raise HTTPException(400, "The owner cannot be removed.")
    r["members"].remove(m)
    store.save(d)
    _audit(f"{label(current())} removed {m['name']}")
    return JSONResponse(_public(_state()))


@router.post("/roles", dependencies=[Depends(need("manage_team"))])
def save_role(b: RoleBody):
    d = store.load()
    r = _state(d)
    name = b.name.strip()[:30]
    if not name or name in BUILTIN:
        raise HTTPException(400, "Choose a new name. The four built-in roles cannot be changed.")
    perms = [p for p in b.permissions if p in PERMS]
    if "view" not in perms:
        perms.insert(0, "view")
    r["roles"][name] = {"permissions": perms, "builtin": False, "note": "Custom role."}
    store.save(d)
    _audit(f"{label(current())} saved the role {name}: {', '.join(perms)}")
    return JSONResponse(_public(_state()))


@router.delete("/roles/{name}", dependencies=[Depends(need("manage_team"))])
def delete_role(name: str):
    d = store.load()
    r = _state(d)
    if name in BUILTIN or name not in r["roles"]:
        raise HTTPException(400, "Only custom roles can be deleted.")
    if any(m["role"] == name for m in r["members"]):
        raise HTTPException(400, "Move the people who hold this role to another role first.")
    del r["roles"][name]
    store.save(d)
    _audit(f"{label(current())} deleted the role {name}")
    return JSONResponse(_public(_state()))


def link_telegram(code, telegram_id):
    """A person sends /link <code> to the bot: their Telegram account is tied to their place on the team."""
    d = store.load()
    r = _state(d)
    m = next((x for x in r["members"] if x.get("link_code") and hmac.compare_digest(x["link_code"], code.strip().upper())), None)
    if not m:
        return None
    m["telegram_id"] = str(telegram_id)
    m["link_code"] = ""
    store.save(d)
    _audit(f"{m['name']} linked Telegram")
    return m


def link_owner(telegram_id, first_name=""):
    """The first tap from the paired chat, before anyone is linked: tie that Telegram account to the owner."""
    d = store.load()
    r = _state(d)
    o = next(x for x in r["members"] if x.get("owner"))
    o["telegram_id"] = str(telegram_id)
    if o["name"] in ("", "You", "Owner") and first_name:
        o["name"] = first_name
    store.save(d)
    _audit(f"{o['name']} (Owner) linked Telegram by the first tap from the paired chat")
    return o
