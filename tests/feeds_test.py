"""The made-up multi-system plant goes in end to end: MES log, MongoDB export, ERP database and IoT file are read, each is tagged with its system,
and each system is matched to the stations it carries data for. Uses its own empty data folder. Run:  python tests/feeds_test.py"""
import json, os, sys, tempfile

TMP = tempfile.mkdtemp(prefix="tol_feeds_")
os.environ["TOLERANCE_DATA"] = TMP
os.environ["TOLERANCE_PORT"] = "48440"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workspace import store, sources as SRC, synthetic
from server import ws_api, jig_api

store.UID.set("feedtest")

# MongoDB extended JSON is unwrapped
assert SRC._ejson({"$oid": "ab"}) == "ab"
assert SRC._ejson({"x": {"$numberInt": "5"}, "d": {"$date": "2026-01-01T00:00:00Z"}}) == {"x": 5, "d": "2026-01-01T00:00:00Z"}
assert SRC._flat({"a": {"b": 1}, "c": [1]}) == {"a_b": 1, "c": "[1]"}
# the system of a source: a tag wins, else the name, else the kind
assert SRC.system_of({"name": "x", "kind": "csv", "params": {"system": "erp"}}) == "erp"
assert SRC.system_of({"name": "Mongo dump", "kind": "json", "params": {}}) == "mongo"
assert SRC.system_of({"name": "plain", "kind": "csv", "params": {"path": "a.csv"}}) == "files"

r = json.loads(ws_api.add_sample("synthetic").body)
assert not any(x["error"] for x in r["synced"]), r
assert r["machine"] and len(r["machine"]["stations"]) == len(synthetic.STATIONS), r["machine"]

feeds = json.loads(jig_api.feeds_get().body)["feeds"]
by = {}
for f in feeds:
    by.setdefault(f["system"], []).append(f)
assert set(by) == {"mes", "mongo", "erp", "mqtt"}, set(by)
assert len(by["mongo"]) == 2
for f in feeds:
    assert f["status"] == "live" and f["rows"] > 0, f
insp = next(f for f in by["mongo"] if "inspections" in f["name"])
assert insp["stations"] == ["Assembly-04", "Paint-03", "Test-05"], insp["stations"]   # only the stations it names
assert sorted(by["erp"][0]["stations"]) == sorted(synthetic.STATIONS)
print("feeds_test ok:", {k: [len(f["stations"]) for f in v] for k, v in by.items()})
