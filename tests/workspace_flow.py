"""Drive the workspace API the way a person would, on real data: attach the real incident archive and its live alert feed, review and correct the model,
work incidents with an investigator, decide, and watch the learner. Needs a running server and the archive (python -m rca.fetch).
Run:  python -m tests.workspace_flow [base_url]"""
import json, sys, time
import httpx

B = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:48410") + "/api/ws"
c = httpx.Client(timeout=240)


def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        sys.exit(1)


c.post(B + "/reset")
r = c.post(B + "/sources/sample", params={"which": "incidents"}).json()
ok(all(s["error"] is None for s in r["synced"]), f"archive and alert feed attached: {[(list(s['tables']), s['new_rows']) for s in r['synced']]}")
it = c.post(B + "/model/interpret").json()
types = {i["type"] for i in it["items"]}
ok({"table", "entity", "dependency"} <= types, f"interpretation: {it['summary']}")
dep = next(i for i in it["items"] if i["type"] == "dependency" and i["detail"].get("svc"))
c.post(B + "/model/items", data={"id": dep["id"], "action": "reject", "note": "not a real dependency"})
rb = c.post(B + "/model/rebuild").json()
ok(any("1 rejected" in e for e in rb["effects"]), f"model rebuilt: {rb['effects']}")
c.post(B + "/learning/reset")
c.post(B + "/incidents/scan")
inc = [i for i in c.get(B + "/incidents").json()["incidents"] if i["kind"] == "service"]
ok(len(inc) >= 3, f"{len(inc)} service incidents raised from the live alert feed")
lib = {x["case"]: x for x in json.load(open("seed/rca_library.json"))}
hits = 0
for i in inc[:3]:
    ok("_truth" not in i, f"incident {i['id']} ({i['ctx']}): truth hidden")
    rec = c.post(B + f"/incidents/{i['id']}/recommend").json()
    inv = c.post(B + f"/incidents/{i['id']}/investigate", data={"strategy": rec["arm"], "mode": "rule"}).json()
    top = inv["result"]["service"]
    truth = lib[i["case"]]["truth"]
    d = c.post(B + f"/incidents/{i['id']}/decide", data={"decision": "accept" if top == truth else "reject"}).json()
    hits += top == truth
    print(f"   order {rec['arm']}: blamed {top}; truth {truth}; reward {d['decision']['reward']}; calls {inv['result']['calls']}")
    if top == truth:
        wo = c.post(B + f"/incidents/{i['id']}/workorder").json()
        ok(wo.get("refused_without_approval") and wo.get("id"), f"work order {wo.get('id')} created only with approval")
st = c.get(B + "/learning").json()
ok(st["n"] == 3 and st["human"] == 3, f"learner recorded {st['n']} human decisions")
tl = c.post(B + "/learning/timelapse", params={"n": 80}).json()
ok(tl["stats"]["n"] == 83, "replayed 80 recorded real incidents")
print("preference after experience (coverage|symptom -> metrics, traces, logs first):")
for k, v in tl["stats"]["latest"].items():
    print("  ", k, v)
ev = c.get(B + "/learning/evaluation").json()
print("held-out evaluation on the 465 recorded incidents:", {k: v["mean"] for k, v in ev.items()})
print("ALL PASSED")
