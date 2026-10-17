"""A signed-in visitor's MQTT stream is read again and again, not only once. Run:  python tests/live_visitors_test.py"""
import json, os, sys, tempfile, time
d = tempfile.mkdtemp(prefix="tol_lv_"); os.environ["TOLERANCE_DATA"] = d
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from workspace import sources as SRC, store

os.makedirs(os.path.join(d, "users"), exist_ok=True)
src = lambda sid, kind: {"id": sid, "name": sid, "kind": kind, "params": {}, "live": True, "syncs": 1, "rows": 0, "tables": {}}
json.dump({"sources": [src("mq1", "mqtt_live"), src("pg1", "sql_live"), src("csv1", "csv")]}, open(os.path.join(d, "users", "visitor1.json"), "w"))
calls = []
SRC.sync = lambda sid: calls.append((store.UID.get(), sid))
L = SRC.Live(); L.run = True
last = {}
L._pass(last)          # first sight: nothing is read yet, the clocks start
for k in list(last): last[k] -= 40
calls.clear(); L._pass(last)
ok = True
def check(name, cond):
    global ok
    print(("PASS " if cond else "FAIL ") + name); ok &= bool(cond)
check("the visitor's stream and database are read", ("visitor1", "mq1") in calls and ("visitor1", "pg1") in calls)
check("a file source is not polled", not any(c[1] == "csv1" for c in calls))
calls.clear(); L._pass(last)
check("right away again: nothing is read twice in a row", calls == [])
last[("visitor1", "mq1")] -= 4
calls.clear(); L._pass(last)
check("after a few seconds the stream is read again, the database is not yet", calls == [("visitor1", "mq1")])
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
