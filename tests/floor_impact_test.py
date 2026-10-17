"""A server or database that is down marks the stations that lose its data, and a waiting incident turns into 'applying' once the service is starting. Run:  python tests/floor_impact_test.py"""
import os, sys, tempfile
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_impact_")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sentinel import service as SV
from server import hostops as HO
from workspace import store

ok = True
def check(name, cond):
    global ok
    print(("PASS " if cond else "FAIL ") + name); ok &= bool(cond)

inc = {"id": "inc_1", "kind": "service_down", "target": "cloud_sql", "title": "Cloud SQL database is down", "status": "waiting", "by": None, "via": None}
store.update(lambda d: d.setdefault("host", {}).setdefault("incidents", []).append(inc))
imp = SV.impact_map(fresh=True)["stations"]
check("the stations that lose the data are marked", all("Cloud SQL database is down" in imp.get(s, []) for s in ("WH1", "C1", "C2")) and "TR" not in imp)
check("a waiting incident turns into applying when the service starts", HO.mark_starting("cloud_sql") and HO._state(store.load())["incidents"][0]["status"] == "applying")
check("an applying incident still marks the stations", "WH1" in SV.impact_map(fresh=True)["stations"])
store.update(lambda d: d["host"]["incidents"][0].update(status="resolved"))
check("a resolved incident clears the marks", not SV.impact_map(fresh=True)["stations"])
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
