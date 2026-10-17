"""A playbook reads the oven temperature from a connected MQTT stream, not only from a probe. Run:  python tests/playbook_mqtt_test.py"""
import os, sys, tempfile, time
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_pbm_")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd
from connectors import registry as CR
from foreman import notify, playbook as PB
from workspace import store

store.update(lambda d: d["sources"].append({"id": "src_m", "name": "MQTT broker · broker.hivemq.com:1883", "kind": "mqtt_live", "params": {}, "tables": {"mqtt_stream": 5}}))
rows = {"v": 235.0}
def fake_query(sql):
    return pd.DataFrame([{"topic": "tol-abc/plant/pcb/oven/temp_c", "payload": str(rows["v"]), "ts": time.time()}, {"topic": "tol-abc/plant/pcb/oven/state", "payload": "RUN", "ts": time.time()}])
CR.lake_query = fake_query
sent = []
notify.dispatch = lambda title, text, link=None, only=None: (sent.append((title, text, only)), 1)[1]
notify._all = lambda: [{"id": "ch_tg", "type": "telegram", "name": "Telegram @bot"}]

ok = True
def check(name, cond, info=""):
    global ok
    print(("PASS " if cond else "FAIL ") + name, "" if cond else info); ok &= bool(cond)

check("the topic becomes a reading key", PB._reading_key("tol-abc/plant/pcb/oven/temp_c") == "oven_temp_c")
r = PB._readings()
check("the newest number of the stream is a reading, text is skipped", r.get("oven_temp_c") == 235.0 and "oven_state" not in r, r)
check("the stream's station is offered", "OVN1" in PB.stations_list())
sg = PB.signals("OVN1")
check("the station shows the reading and where it came from", any(x.get("key") == "oven_temp_c" and x["source"].startswith("MQTT") for x in sg["signals"]), sg["signals"])
pid = PB.save({"name": "Oven too hot", "enabled": True, "nodes": [
    {"id": "t", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {"event": "reading", "station": "OVN1"}},
    {"id": "c", "type": "check", "position": {"x": 1, "y": 0}, "data": {"source": "reading", "path": "oven_temp_c", "op": "gt", "value": "250"}},
    {"id": "a", "type": "action", "position": {"x": 2, "y": 0}, "data": {"kind": "notify", "channel": "ch_tg", "text": "{station} is at {value} C"}}],
    "edges": [{"id": "e1", "source": "t", "target": "c"}, {"id": "e2", "source": "c", "sourceHandle": "pass", "target": "a"}]})
PB.on_report({}); time.sleep(0.5); check("below the value, nothing is sent", sent == [])
rows["v"] = 262.0
PB.on_report({}); time.sleep(0.5)
check("above the value, the message goes to the chosen channel", len(sent) == 1 and sent[0][2] == "ch_tg" and "262" in sent[0][1], sent)
PB.on_report({}); time.sleep(0.5); check("it does not repeat while the reading stays high", len(sent) == 1)
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
