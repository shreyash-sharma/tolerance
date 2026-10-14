"""End-to-end smoke test of the real pipeline. Run: python -m tests.smoke  (uses its own ports and data dir if TOLERANCE_PORT / TOLERANCE_DATA are set)."""
import os
from plant import core, run_plant, incidents
from compiler import discover, oir, semantics, score
from fabric import emit, gateway, agents

ok = lambda c, m: print(("PASS " if c else "FAIL ") + m) or (c or exit(1))
core.reset_plant(40, rc_window=[22, 23, 24, 25], fault=True); run_plant.start_all()
h = core.health(); ok(len(h["missing_vins"]) == 4 and h["dead_letters"] == 4, "incident reproduces: 4 vehicles missing, 4 dead letters")
evs, _ = discover.discover_all(f"http://127.0.0.1:{core.PORT+1}", f"opc.tcp://127.0.0.1:{core.PORT}/tolerance/plant", "plant/functions", core.STORE, core.TRACER.path)
o = oir.compile_oir(evs, semantics.make_namer()[0]); sc = score.score(o)
ok(sc["edges"]["f1"] >= .95, f"edge F1 {sc['edges']['f1']}"); ok(sc["identity"]["f1"] >= .95, f"identity F1 {sc['identity']['f1']}")
ok(all(sc["traps"].values()), "stale manifest rejected, ambiguous field withheld")
gw = gateway.Gateway(emit.build_boundaries(o))
ok(gw.call("rca", "write_collection", {"collection": "genealogy", "doc": {"vin": "x"}, "key": "vin"}).get("denied"), "RCA write denied by Cedar")
alert = {"title": "t", "missing_vins": h["missing_vins"], "built": 40, "mos": {v: "MO-" + str(5000 + int(v[3:]) - 1000000) for v in h["missing_vins"]}}
r = agents.RuleAgent(gw, alert, agents.STRATEGIES["trace_first"]).run(); ok(r["class"] == "INGEST_TRANSFORM_FAILURE", f"diagnosis {r['class']} in {r['calls']} calls")
a = gw.call("recovery", "replay_to_replica", {"plan": {"kind": "replay_window"}})["result"]; ok(not a["passed"], "naive replay blocked by the gate")
b = gw.call("recovery", "replay_to_replica", {"plan": {"kind": "idempotent_repair"}})["result"]; ok(b["passed"], "idempotent repair passes the gate")
ok(gw.call("recovery", "apply_to_production", {"plan": {}}, context={"human_approved": False, "gate_passed": True}).get("denied"), "apply without approval denied")
ok(gw.call("recovery", "apply_to_production", {"plan": {}}, context={"human_approved": True, "gate_passed": True}).get("ok"), "apply with approval succeeds")
ok(core.health()["missing_vins"] == [], "production consistent after recovery")
print("ALL PASSED")
