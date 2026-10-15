"""Tests Sentinel's heartbeat checks, maintenance windows, schedule and failure messages, in a scratch data folder. Run:  python tests/sentinel_service_test.py"""
import os, shutil, sys, tempfile, time

TMP = tempfile.mkdtemp(prefix="tol_sentinel_")
os.environ["TOLERANCE_DATA"] = TMP
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sentinel import guard, heartbeat as HB, schedule as SCH, service as SV
from workspace import store

store.UID.set("tester")
bad = 0


def check(name, ok, got=None):
    global bad
    if not ok:
        bad += 1
        print("FAIL", name, got if got is not None else "")


sent = []
import foreman.notify as N
N.dispatch = lambda title, text, link=None: sent.append((title, text)) or 1   # no real message is sent

# --- heartbeat
rid = SV.add("Gateway alive", "heartbeat", {"grace_s": 60}, [{"path": "seconds_since", "op": "lte", "value": 60}], "crit")
rule = next(r for r in SV._state()[1]["rules"] if r["id"] == rid)
tok = rule["target"]["token"]
check("a heartbeat token is long and random", len(tok) >= 20)
out = SV.run_rule(rid)
check("a heartbeat that never came fails", not out["ok"], out)
check("the failure was announced once", len(sent) == 1 and "failed" in sent[0][0], sent)
check("a wrong token is refused", HB.beat("x" * 24) is False and HB.hb("short")["ok"] is False)
check("a right token is accepted", HB.beat(tok) is True)
out = SV.run_rule(rid)
check("after a beat the rule passes", out["ok"], out)
check("recovery is announced", len(sent) == 2 and "back" in sent[1][0], sent)
check("a second beat inside one second is not counted", HB.beat(tok) and HB.info(tok)["count"] == 1, HB.info(tok))

# --- maintenance windows (a window that crosses midnight, and one that does not)
s = SV._state()[1]
SV.add_window("Night work", "22:00", "04:00", [rid])
SV.add_window("Noon work", "12:00", "13:00", [])
s = SV._state()[1]
at = lambda h, m: time.mktime((2026, 10, 15, h, m, 0, 0, 0, 0)) - time.timezone   # a UTC time of day, with the schedule offset at 0
check("23:30 is inside the night window", SV.active_window(rid, s, at(23, 30)) is not None)
check("03:59 is inside the night window", SV.active_window(rid, s, at(3, 59)) is not None)
check("04:00 is outside it", SV.active_window(rid, s, at(4, 0)) is None)
check("12:30 is inside the noon window that covers all rules", SV.active_window(rid, s, at(12, 30)) is not None)
try:
    SV.add_window("x", "25:00", "01:00")
    check("a bad time must be refused", False)
except ValueError:
    pass

# a rule that fails inside a window is quiet and grey
sent.clear()
SV.remove_window(next(w["id"] for w in SV._state()[1]["windows"] if w["name"] == "Noon work"))
SV.remove_window(next(w["id"] for w in SV._state()[1]["windows"] if w["name"] == "Night work"))
d, s = SV._state()
now = time.gmtime()
s["windows"].append({"id": "mw_now", "name": "Now", "start": "%02d:%02d" % ((now.tm_hour - 1) % 24, 0), "end": "%02d:%02d" % ((now.tm_hour + 1) % 24, 0), "rules": [rid]})
store.save(d)
time.sleep(0)
d, s = SV._state()
s["last"][rid]["ok"] = True
store.save(d)
os_time = time.time
import sentinel.heartbeat as H2
rec = H2._load()
rec[tok]["last"] = time.time() - 9999   # the beat is long overdue
H2._save(rec)
out = SV.run_rule(rid)
check("a failure inside a window is marked as maintenance", out["maintenance"] == "Now" and not out["ok"], out)
check("and sends no message", sent == [], sent)
check("and the history shows grey, not red", SV._state()[1]["history"][rid][-1] is None)

# --- the schedule
try:
    SV.set_schedule(True, 0, 0)
    check("every 0 minutes must be refused", False)
except ValueError:
    pass
SV.set_schedule(True, 5, 120)
check("the schedule is saved", SV.schedule()["enabled"] and SV.schedule()["every_min"] == 5 and SV.schedule()["tz_offset_min"] == 120)
check("the visitor is on the scheduler's list", "tester" in SCH._index())
SV.set_schedule(False, 5, 0)
check("switching off removes the visitor from the list", "tester" not in SCH._index())

# --- addresses
try:
    SV.add("tls", "tls", {"host": "127.0.0.1"}, [{"path": "days_left", "op": "gt", "value": 14}])
    check("a certificate check on a private address must be refused", False)
except guard.Refused:
    pass

# --- impact: a rule can name the stations it affects
rid2 = SV.add("MES port", "tcp", {"host": "example.com", "port": 443, "affects": ["TR", "C1"]}, [{"path": "reachable", "op": "eq", "value": "true"}])
check("a rule that names stations is in the impact map", SV.impact_map(fresh=True)["rules"][rid2] == ["C1", "TR"], SV.impact_map(fresh=True)["rules"])

shutil.rmtree(TMP, ignore_errors=True)
print("sentinel service tests:", "all passed" if not bad else f"{bad} failed")
sys.exit(1 if bad else 0)
