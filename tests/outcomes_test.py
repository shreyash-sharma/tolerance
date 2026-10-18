"""After a Cloud SQL database is back, Tolerance asks how it went; each result is kept; confirmed results move Warden's track record; people can open and resolve issues; the SLO numbers come from the records.
Run:  python tests/outcomes_test.py"""
import os, sys, tempfile, time
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_out_")
os.environ["TOLERANCE_PORT"] = "48485"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from foreman import notify, outcomes, safety
from server import hostops as H, rbac
from workspace import store

sent = []
notify._all = lambda: [{"id": "ch_tg", "type": "telegram", "name": "Telegram", "token": "t", "chat_id": "1"}]
notify.telegram_buttons = lambda ch, text, rows, html=False: (sent.append(("buttons", text, rows)), {"message_id": 1})[1]
notify.telegram_html = lambda ch, text: (sent.append(("html", text)), {})[1]
notify.dispatch = lambda *a, **k: 1
H._watch = lambda ch: None
LIM = {"subject": "OVN1", "predicate": "max_temp_c", "value": 260, "doc": "d.md", "quote": "q", "status": "approved"}
H._limit = lambda pred: LIM if pred == "max_temp_c" else None
H._limits_ctx = lambda: [LIM]

ok = True
def check(name, cond, info=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name, "" if cond else info); ok &= bool(cond)

def rep(name="cloud-sql", **k):
    base = {"name": name, "where": "Cloud SQL tolerance-erp", "services": {"cloud_sql": True}, "readings": {}, "results": []}
    base.update(k)
    return H.process(base)
incs = lambda: H._state(store.load())["incidents"]
score = lambda: safety.score_action({"kind": "restart_service", "station": "cloud_sql", "params": {}}, {"evidence": 0.9, "state": "failed", "n_affected": 3, "limits": [LIM]})

before = score()
fac = lambda s: next(f for f in s["factors"] if f["id"] == "precedent")

# a Cloud SQL outage: approved, fixed, closed
rep(services={"cloud_sql": False})
inc = incs()[0]
H.decide(inc["id"], True, "Owner", "Telegram")
time.sleep(0.2)
sent.clear()
rep(services={"cloud_sql": True})
inc = incs()[0]
row = next(r for r in store.load()["outcomes"] if r["incident"] == inc["id"])
check("the closed incident leaves one record", row["resolver"] == "tolerance" and row["by"] == "Owner" and row["verdict"] is None, row)
ask = [m for m in sent if m[0] == "buttons"]
check("Telegram is asked once, after Cloud SQL is back", len(ask) == 1 and "Is it restored" in ask[0][1] and "Owner" in ask[0][1], sent)
check("with three answers", [b[1] for b in ask[0][2][0]] == [f"fb:{inc['id']}:y", f"fb:{inc['id']}:p", f"fb:{inc['id']}:n"], ask[0][2])
sent.clear(); rep(services={"cloud_sql": True}); check("it is not asked twice", not sent)

# the answer is kept and moves Warden's track record (a contextual estimate for this action on this target)
r = outcomes.feedback(inc["id"], "yes", "Owner", "Telegram")
check("the answer is kept", r["verdict"] == "yes" and r["verdict_by"] == "Owner")
after = score()
check("a confirmed fix raises the record from 50% to 67%", abs(fac(before)["value"] - 0.5) < 1e-9 and abs(fac(after)["value"] - 2 / 3) < 0.01 and after["score"] >= before["score"], (fac(before), fac(after)))
check("the factor says why", "worked 1 time" in fac(after)["note"], fac(after)["note"])
check("another context is not affected", safety.score_action({"kind": "restart_service", "station": "mongod", "params": {}}, {"evidence": 0.9, "state": "failed", "n_affected": 3, "limits": [LIM]})["factors"][4]["value"] == 0.5)
check("a wrong answer is refused", outcomes.feedback(inc["id"], "maybe", "x", "x") is None)

# a failure lowers it
rep(services={"cloud_sql": False}); i2 = incs()[-1]; H.decide(i2["id"], True, "Owner", "the app"); time.sleep(0.2); rep(services={"cloud_sql": True})
outcomes.feedback(i2["id"], "no", "Owner", "the app")
s, f = outcomes.counts("restart_service", "cloud_sql")
check("one worked and one failed gives 50% again", (s, f) == (1.0, 1.0) and abs(outcomes.record(s, f) - 0.5) < 1e-9, (s, f))
check("the learning table shows it", outcomes.learning()[0]["worked"] == 1.0 and outcomes.learning()[0]["failed"] == 1.0)

# the oven: recorded, never asked about
sent.clear()
rep("vm", services={"mongod": True, "mosquitto": True}, readings={"oven_temp_c": 262.0})
o = [i for i in incs() if i["kind"] == "temp_high"][0]
H.decide(o["id"], True, "Owner", "Telegram")
rep("vm", services={"mongod": True, "mosquitto": True}, readings={"oven_temp_c": 236.0})
check("the oven incident is recorded", any(r["incident"] == o["id"] for r in store.load()["outcomes"]))
check("but nobody is asked how it went", not [m for m in sent if m[0] == "buttons" and "fb:" in str(m[2])], sent)

# something that came back by itself (nobody approved a fix)
d = store.load()
fake = {"id": "inc_self", "title": "Broker is down", "kind": "service_down", "target": "mosquitto", "opened": time.time() - 90, "resolved": time.time(), "by": None, "via": None, "action": None}
outcomes.on_resolved(d, fake); store.save(d)
check("a service that comes back alone counts as the machine", next(r for r in store.load()["outcomes"] if r["incident"] == "inc_self")["resolver"] == "machine")

# people open and resolve issues; the note is required
iss = H.report_issue("WH1 conveyor jam", "WH1", "belt stops every minute", "Supervisor")
check("an issue is opened", iss["status"] == "open" and any(i["id"] == iss["id"] for i in H._state(store.load())["issues"]))
try:
    H.resolve_issue(iss["id"], "", "Supervisor"); check("a note is required", False)
except ValueError:
    check("a note is required", True)
done = H.resolve_issue(iss["id"], "Cleared a jam at the belt entry and reset the sensor.", "Supervisor")
check("the issue is resolved by people at the plant", done["resolver"] == "plant" and next(r for r in store.load()["outcomes"] if r["incident"] == iss["id"])["note"].startswith("Cleared"))

# the numbers
rep_ = H.slo_report()
check("the counts add up", rep_["totals"]["reported"] == len(incs()) + 1 and rep_["totals"]["resolved"] >= 4, rep_["totals"])
check("who resolved them", rep_["by_resolver"]["tolerance"] >= 2 and rep_["by_resolver"]["machine"] == 1 and rep_["by_resolver"]["plant"] == 1, rep_["by_resolver"])
cs = next(p for p in rep_["per_service"] if p["unit"] == "cloud_sql")
check("Cloud SQL shows its target and that the last restore is within it", cs["target_restore_min"] == 15 and cs["within_target"] is True and cs["availability_pct"] > 99.9, cs)
check("defaults are marked as defaults", cs["from_docs"] is False)
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
