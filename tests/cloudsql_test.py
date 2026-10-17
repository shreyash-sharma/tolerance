"""Cloud SQL watch: the instance stops, an incident opens, a person approves, Tolerance starts it, the incident closes. Only the start is ever sent. Run:  python tests/cloudsql_test.py"""
import os, sys, tempfile, threading, time
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_csql_")
os.environ["TOLERANCE_PORT"] = "48488"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import cloudsql as C, hostops as H
from workspace import store

state = {"state": "RUNNABLE", "policy": "ALWAYS", "ip": "34.1.2.3", "version": "POSTGRES_16"}
sent = []
C.tcp_ok = lambda ip, port=5432: state["state"] == "RUNNABLE"
C.api_get = lambda p, i: dict(state)
def start(p, i):
    sent.append((p, i)); state.update(state="MAINTENANCE", policy="ALWAYS")   # it takes a while to boot
C.api_start = start
C.api_ops = lambda p, i: {"type": "UPDATE", "status": "RUNNING", "start": time.time() - 5}
C.EVERY = 0.15
H._tell = lambda *a, **k: None
LIM = []
H._limits_ctx = lambda: LIM

store.update(lambda d: d.update(cloud_sql={"project": "demo-proj", "instance": "tolerance-erp", "affects": ["WH1", "C1", "C2"], "last": {}}))
C.watch("local")
def wait(cond, secs=8):
    t = time.time()
    while time.time() - t < secs:
        if cond(): return True
        time.sleep(0.1)
    return False
incs = lambda: H._state(store.load())["incidents"]

time.sleep(0.6)
assert incs() == [], "a running database opens nothing"
state.update(state="STOPPED", policy="NEVER")                      # the owner stops it with gcloud
assert wait(lambda: incs() and incs()[0]["status"] == "waiting")
i0 = incs()[0]
assert i0["target"] == "cloud_sql" and i0["scored"]["decision"] == "approve", i0["scored"]
print("cloud sql fix score", i0["scored"]["score"])
time.sleep(0.6)
assert sent == [], "nothing is started before a person approves"
assert H.decide(i0["id"], True, "Shreyash (Owner)", "Telegram")["status"] == "applying"
assert wait(lambda: sent == [("demo-proj", "tolerance-erp")]), sent  # only the start, only this instance
time.sleep(0.8)
assert incs()[0]["status"] == "applying" and len(incs()) == 1, "booting is not 'back', and not a new incident"
cs = store.load()["cloud_sql"]
assert cs.get("starting_since") and (cs["last"].get("op") or {}).get("status") == "RUNNING", cs   # the card can show the real progress
state.update(state="RUNNABLE")                                      # now it is running and the port answers
assert wait(lambda: incs()[0]["status"] == "resolved"), incs()[0]["status"]
assert len(incs()) == 1
assert wait(lambda: "starting_since" not in store.load()["cloud_sql"]), "the start timer clears when it is up"
audit = " | ".join(a["text"] for a in H._state(store.load())["audit"])
assert "approved by Shreyash (Owner) through Telegram" in audit and "is back" in audit, audit
store.update(lambda d: d.pop("cloud_sql", None))                   # the loop ends when the watch is removed
print("cloudsql_test ok")
