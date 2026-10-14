"""Snapshot at setup, then live increments, across every wired connector. Run with TOLERANCE_DATA / TOLERANCE_PORT set to scratch values."""
import os, shutil, time
from plant import core
for f in ("estate.duckdb", "connectors.json"):
    p = os.path.join(core.DATA, f)
    if os.path.exists(p):
        os.remove(p)
shutil.rmtree(os.path.join(core.DATA, "dlt"), ignore_errors=True)
from plant import run_plant, mes
from connectors import registry as R

core.reset_plant(14)
run_plant.start_all()
rest, total = mes.reset(60000)
print("MES total rows", total, "| live feed rows", len(rest))
for sid in ("mes", "docs", "queue", "erp", "opcua", "traces"):
    r = R.sync(sid)
    print("SNAPSHOT", r["id"], r["new_rows"], "rows", r["seconds"], "s", r["tables"])
rep = mes.Replayer(rest, rate_per_s=2000)
rep.start()
time.sleep(3)
print("replayer", rep.status())
r = R.sync("mes")
print("LIVE mes", r["mode"], r["new_rows"], "new rows")
time.sleep(2)
r2 = R.sync("mes")
print("LIVE mes", r2["mode"], r2["new_rows"], "new rows")
rep.stop()
q = R.lake_query("select count(*) n, min(ts) a, max(ts) b from lake.station_states").to_dict("records")
print("lake station_states", q)
assert q[0]["n"] == 60000 + r["new_rows"] + r2["new_rows"], "increments must add up exactly, no duplicates"
print("OK: snapshot + live increments add up exactly")
