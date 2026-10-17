"""Playbooks: what is watched from a station, and the service check. Run:  python tests/playbook_signals_test.py"""
import os, sys, tempfile, time
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_sig_")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server import hostops as H
from foreman import playbook as PB
H._tell = lambda *a, **k: None
H.process({"name": "pcb-gateway", "where": "gw", "services": {"mosquitto": True, "mongod": True}, "readings": {"oven_temp_c": 235.4, "oven_target_c": 235.0}, "results": []})
time.sleep(0.3)
print("stations:", PB.stations_list())
s = PB.signals("OVN1")
print([ (x["label"], x["now"], x.get("unit")) for x in s["signals"]], s["limits"], s["rules"])
assert any(x["key"] == "oven_temp_c" and x["now"] == 235.4 for x in s["signals"] if x["kind"] == "reading")
assert any(x["unit"] == "mosquitto" for x in s["signals"] if x["kind"] == "service")
c1 = PB.signals("C1"); print([ (x["label"], x["now"]) for x in c1["signals"]])
assert any(x["unit"] == "mongod" for x in c1["signals"] if x["kind"] == "service") and not any(x["kind"] == "reading" for x in c1["signals"])
# the service check
r = PB._observe({"source": "service", "unit": "mosquitto"}, "OVN1"); assert r == {"running": 1}
H.process({"name": "pcb-gateway", "where": "gw", "services": {"mosquitto": False}, "readings": {}, "results": []})
assert PB._observe({"source": "service", "unit": "mosquitto"}, "OVN1") == {"running": 0}
print("signals ok")
