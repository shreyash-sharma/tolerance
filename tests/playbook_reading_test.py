"""A playbook that starts from a probe reading: the oven goes above a value, one message goes to the chosen channel, and it fires again only after the reading dropped. Run:  python tests/playbook_reading_test.py"""
import os, sys, tempfile, time
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_pbr_")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from foreman import notify, playbook as PB
from server import hostops as H
from workspace import store

H._tell = lambda *a, **k: None
sent = []
notify.dispatch = lambda title, text, link=None, only=None: (sent.append((title, text, only)), 1)[1]
notify._all = lambda: [{"id": "ch_tg", "type": "telegram", "name": "Telegram @bot"}]

pid = PB.save({"name": "Oven too hot", "enabled": True, "nodes": [
    {"id": "t", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {"event": "reading", "station": "OVN1"}},
    {"id": "c", "type": "check", "position": {"x": 1, "y": 0}, "data": {"source": "reading", "path": "oven_temp_c", "op": "gt", "value": "250"}},
    {"id": "a", "type": "action", "position": {"x": 2, "y": 0}, "data": {"kind": "notify", "channel": "ch_tg", "text": "{station} is at {value} C"}}],
    "edges": [{"id": "e1", "source": "t", "target": "c"}, {"id": "e2", "source": "c", "sourceHandle": "pass", "target": "a"}]})

def report(t):
    H.process({"name": "pcb-gateway", "where": "x", "services": {"mosquitto": True}, "readings": {"oven_temp_c": t}, "results": []})
    time.sleep(0.5)

ok = True
def check(name, cond, info=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name, "" if cond else info); ok &= bool(cond)

report(235); check("below the value, nothing is sent", sent == [])
report(262); check("above the value, one message goes to the chosen channel", len(sent) == 1 and sent[0][2] == "ch_tg" and "OVN1 is at 262 C" in sent[0][1], sent)
report(263); report(264); check("a reading that stays high does not send again", len(sent) == 1)
report(240); report(262); check("it fires again after the reading dropped", len(sent) == 2)
lr = next(p for p in store.load()["playbooks"] if p["id"] == pid).get("last_run")
check("the last run is kept for the page", lr and any(s.get("done") for s in lr["trace"]))
r = PB.run_by_id(pid, "OVN1")
check("Run now on the page walks the same blocks", [s["type"] for s in r["trace"]] == ["trigger", "check", "action"] and r["trace"][1]["ok"])
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
