"""People and roles with Cedar: each role may do only what it holds; refusals are recorded; Telegram link codes work. Run:  python tests/rbac_test.py"""
import os, sys, tempfile
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_rbac_")
os.environ["TOLERANCE_PORT"] = "48487"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from server.app import app
from server import rbac
from workspace import store

c = TestClient(app)
t = c.get("/api/team").json()
owner = t["me"]
assert t["local"] and [m["role"] for m in t["members"]] == ["Owner"] and t["can_manage"]
assert set(t["roles"]) == {"Owner", "Supervisor", "Operator", "Viewer"}

sup = c.post("/api/team/people", json={"name": "Priya", "email": "p@x.io", "role": "Supervisor"}).json()["members"][-1]
op = c.post("/api/team/people", json={"name": "Omar", "role": "Operator"}).json()["members"][-1]
r = c.post("/api/team/roles", json={"name": "Shift lead", "permissions": ["approve_actions", "run_checks"]}).json()   # a custom role
assert r["roles"]["Shift lead"]["permissions"][0] == "view"
lead = c.post("/api/team/people", json={"name": "Lena", "role": "Shift lead"}).json()["members"][-1]

can = rbac.allowed
assert can(owner, "change_thresholds") and can(sup["id"], "approve_actions") and not can(sup["id"], "change_thresholds")
assert not can(op["id"], "approve_actions") and can(op["id"], "run_checks") and can(lead["id"], "approve_actions") and not can(lead["id"], "manage_channels")

H = lambda m: {"x-acting-as": m}
assert c.post("/api/jig/warden/settings", data={"floor": "40", "limit": "80"}, headers=H(op["id"])).status_code == 403
assert c.post("/api/jig/warden/settings", data={"floor": "40", "limit": "80"}, headers=H(sup["id"])).status_code == 403
assert c.post("/api/jig/warden/settings", data={"floor": "40", "limit": "80"}, headers=H(owner)).status_code == 200
assert c.post("/api/team/people", json={"name": "X", "role": "Viewer"}, headers=H(sup["id"])).status_code == 403
assert c.post("/api/jig/channels", data={"type": "slack", "url": "https://hooks.slack.com/x"}, headers=H(op["id"])).status_code == 403

from server import hostops as H_
LIM = {"subject": "OVN1", "predicate": "max_temp_c", "value": 260, "doc": "d", "quote": "q", "status": "approved"}
H_._limit = lambda p: LIM
H_._limits_ctx = lambda: [LIM]
H_._tell = lambda *a, **k: None
H_.process({"name": "vm", "where": "gw", "services": {"mongod": True, "mosquitto": True}, "readings": {}, "results": []})
H_.process({"name": "vm", "where": "gw", "services": {"mongod": False, "mosquitto": True}, "readings": {}, "results": []})
iid = H_._state(store.load())["incidents"][0]["id"]
assert c.post(f"/api/host/incidents/{iid}/approve", headers=H(op["id"])).status_code == 403
ok = c.post(f"/api/host/incidents/{iid}/approve", headers=H(sup["id"]))
assert ok.status_code == 200 and ok.json()["by"] == "Priya (Supervisor)", ok.text
audit = " | ".join(a["text"] for a in H_._state(store.load())["audit"])
assert "Omar (Operator) tried to" in audit and "approved by Priya (Supervisor) through the app" in audit, audit

assert c.post(f"/api/team/people/{owner}/role", params={"role": "Viewer"}).status_code == 400
assert c.delete("/api/team/roles/Shift lead").status_code == 400
assert c.delete(f"/api/team/people/{lead['id']}").status_code == 200 and c.delete("/api/team/roles/Shift lead").status_code == 200

code = [m for m in c.get("/api/team").json()["members"] if m["id"] == sup["id"]][0]["link_code"]
assert rbac.link_telegram(code, 555)["id"] == sup["id"] and rbac.member(telegram_id=555)["name"] == "Priya"
assert rbac.link_telegram(code, 556) is None   # a code works once
print("rbac_test ok")
