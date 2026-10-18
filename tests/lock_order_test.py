"""The documents engine reads the data lake. A live sync holds the lake lock and then wants the workspace lock, so a probe report must never ask the engine while it holds the workspace lock.
Run:  python tests/lock_order_test.py"""
import os, sys, tempfile
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_lo_")
os.environ["TOLERANCE_PORT"] = "48491"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import hostops as H
from workspace import store

held = []
H._limit = lambda p: (held.append(store.LOCK._is_owned()), None)[1]
H._limits_ctx = lambda: (held.append(store.LOCK._is_owned()), [])[1]
H.process({"name": "cloud-sql", "where": "Cloud SQL i", "services": {"cloud_sql": False}, "readings": {}, "results": []})
H.process({"name": "vm", "where": "vm", "services": {}, "readings": {"oven_temp_c": 300.0}, "results": []})
assert held and not any(held), held
print("lock_order_test ok")
