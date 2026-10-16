"""Guide: a visitor who connected only a database still gets machine states and stations. Run:  python tests/guide_own_lake_test.py"""
import os, sys, tempfile, sqlite3
d = tempfile.mkdtemp(prefix="tol_own_"); os.environ["TOLERANCE_DATA"] = d
sys.path.insert(0, ".")
from workspace import store, sources as SRC
from connectors import registry as CR
store.UID.set("visitor1")
db = os.path.join(d, "erp.db"); c = sqlite3.connect(db); c.execute("create table orders(id int, item text)"); c.executemany("insert into orders values (?,?)", [(i, "x") for i in range(20)]); c.commit(); c.close()
CR.set_own_lake()
s = SRC.add("sqlite", "ERP", path=db); SRC.sync(s["id"])
from foreman import guide as G
from workspace import twin as T
print("own", CR.own_lake(), "has_state before", T.has_state())
G.ensure_data()
print("has_state after", T.has_state())
names = [x["name"] for x in T.build()["stations"]]
print(sorted(names)); assert all(n in names for n in ("C1", "C2", "AGV"))
print("ok")
