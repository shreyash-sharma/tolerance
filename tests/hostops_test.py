"""Host operations: a service stops, Warden scores the fix, a person approves, the probe gets one command, the service returns and the incident closes.
The oven goes over the document limit; a fix above the limit is blocked. Run:  python tests/hostops_test.py"""
import os, sys, tempfile
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_host_")
os.environ["TOLERANCE_PORT"] = "48484"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import hostops as H
from workspace import store

LIM = {"subject": "OVN1", "predicate": "max_temp_c", "value": 260, "doc": "10_sop_reflow_oven.md", "quote": "The oven temperature must not exceed 260 degrees Celsius.", "status": "approved"}
H._limit = lambda pred: LIM if pred == "max_temp_c" else None
H._limits_ctx = lambda: [LIM]

def rep(**k):
    base = {"name": "vm", "where": "pcb-gateway", "services": {"mongod": True, "mosquitto": True}, "readings": {"oven_temp_c": 235.0}, "results": []}
    base.update(k)
    return H.process(base)

assert rep() == []
assert H.token_for("local") != H.token_for("other") and len(H.token_for("local")) == 32

# act 1: MongoDB stops. It carries three stations, so a person decides.
assert rep(services={"mongod": False, "mosquitto": True}) == []
inc = [i for i in H._state(store.load())["incidents"] if i["target"] == "mongod"][0]
assert inc["status"] == "waiting" and inc["scored"]["decision"] == "approve", inc["scored"]
print("mongod fix score", inc["scored"]["score"])
assert rep(services={"mongod": False, "mosquitto": True}) == []            # still waiting: no second incident, no command
assert len([i for i in H._state(store.load())["incidents"] if i["target"] == "mongod"]) == 1
assert H.decide(inc["id"], True, "Shreyash", "Telegram")["status"] == "applying"
cmds = rep(services={"mongod": False, "mosquitto": True})
assert cmds and cmds[0]["kind"] == "service_restart" and cmds[0]["unit"] == "mongod", cmds
assert rep(services={"mongod": False, "mosquitto": True}) == []            # a command is sent once
rep(services={"mongod": True, "mosquitto": True}, results=[{"id": cmds[0]["id"], "ok": True, "output": "restarted"}])
st = H._state(store.load())
assert [i for i in st["incidents"] if i["target"] == "mongod"][0]["status"] == "resolved"
assert any("approved by Shreyash through Telegram" in a["text"] for a in st["audit"])

# act 2: the broker stops. It carries one feed, so Warden may fix it by itself.
rep(services={"mongod": True, "mosquitto": False})
b = [i for i in H._state(store.load())["incidents"] if i["target"] == "mosquitto"][0]
print("mosquitto fix score", b["scored"]["score"], b["scored"]["decision"], b["status"])

# act 3: the oven goes over the limit
rep(readings={"oven_temp_c": 262.0})
o = [i for i in H._state(store.load())["incidents"] if i["kind"] == "temp_high"][0]
print("oven fix score", o["scored"]["score"], o["scored"]["decision"])
assert o["scored"]["violations"] == []   # setting 235 is inside the limit
H.decide(o["id"], True, "the owner", "the app")
c = rep(readings={"oven_temp_c": 262.0})
assert any(x["kind"] == "set_oven" and x["value"] == 235.0 for x in c), c
rep(readings={"oven_temp_c": 236.0})
assert [i for i in H._state(store.load())["incidents"] if i["kind"] == "temp_high"][0]["status"] == "resolved"

# a fix above the limit is blocked at any score
from foreman import safety
r = safety.score_action({"kind": "adjust_temperature", "station": "OVN1", "params": {"max_temp_c": 270}}, {"evidence": 0.9, "state": "busy", "n_affected": 1, "limits": [LIM]})
assert r["decision"] == "blocked"
# commands are routed: the Cloud SQL watcher never takes a VM probe's command, and the VM probe never takes the Cloud SQL start
rep(services={"mongod": False, "mosquitto": True})
mi = [i for i in H._state(store.load())["incidents"] if i["target"] == "mongod" and i["status"] == "waiting"][0]
H.decide(mi["id"], True, "the owner", "the app")
stolen = H.process({"name": "cloud-sql", "where": "x", "services": {"cloud_sql": True}, "readings": {}, "results": []})
assert stolen == [], stolen
assert any(c["unit"] == "mongod" for c in rep(services={"mongod": False, "mosquitto": True}))
print("hostops_test ok")
