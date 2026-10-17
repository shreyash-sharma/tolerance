"""A probe report and a source being connected at the same moment must not lose the new source. Run:  python tests/store_race_test.py"""
import os, sqlite3, sys, tempfile, threading
d = tempfile.mkdtemp(prefix="tol_race_"); os.environ["TOLERANCE_DATA"] = d
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import hostops as H
from workspace import sources as SRC, store
from connectors import registry as CR

H._tell = lambda *a, **k: None
db = os.path.join(d, "erp.db"); c = sqlite3.connect(db); c.execute("create table t(id int)"); c.executemany("insert into t values (?)", [(i,) for i in range(5)]); c.commit(); c.close()
stop, errors = threading.Event(), []

def reports():
    store.UID.set("visitor1")
    while not stop.is_set():
        H.process({"name": "cloud-sql", "where": "x", "services": {"cloud_sql": True}, "readings": {}, "results": []})

store.UID.set("visitor1")
t = threading.Thread(target=reports, daemon=True); t.start()
for i in range(60):
    try:
        s = SRC.add("sqlite", f"ERP {i}", path=db)
        CR.set_own_lake()
        if not SRC.get(s["id"]): errors.append("lost " + s["id"])
    except KeyError as e:
        errors.append(str(e))
stop.set(); t.join(5)
print("lost sources:", len(errors))
assert not errors, errors[:3]
print("store_race_test ok")
