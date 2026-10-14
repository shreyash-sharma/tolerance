"""Incident injector. Each incident is a real run through the plant with a known, sealed root cause.
The investigators never see `truth`; only the shadow harness scores against it."""
import random
from . import core

CLASSES = {
    "INGEST_TRANSFORM_FAILURE": "fn-ingest-scan",
    "ERP_SYNC_FAILURE": "fn-erp-sync",
    "GENEALOGY_JOIN_GAP": "fn-build-genealogy",
    "STATION_SCAN_FAILURE": "ST-EOL-03",
}
KIND_BY_CLASS = {k: k for k in CLASSES}


def _erp_503(window_mos):
    def call(mo, payload):
        if mo in window_mos:
            raise RuntimeError("HTTP 503 Service Unavailable from erp.local")
        return core.ERPX.attach_genealogy(mo, payload)
    return call


def run_incident(cls, n=14, window=None, seed=0, start_ts=1_760_000_000):
    rnd = random.Random(seed)
    window = list(window) if window else sorted(rnd.sample(range(3, n - 1), rnd.choice([2, 3, 4])))
    core.STORE.wipe(); core.TRACER.reset()
    core.STATE["fw_format_bug"] = cls == "INGEST_TRANSFORM_FAILURE"
    rc = set(window) if cls == "INGEST_TRANSFORM_FAILURE" else set()
    vs = core.build_vehicles(n, start_ts=start_ts, rc_window=rc, seed=seed + 7)
    core.seed_erp(vs)
    mos = {vs[i]["mo"] for i in window}
    core.STATE["erp_http"] = _erp_503(mos) if cls == "ERP_SYNC_FAILURE" else None
    for v in vs:
        in_w = v["i"] in window
        if cls == "GENEALOGY_JOIN_GAP" and in_w:
            # packs scanned late: the vehicle record arrives first, so the join finds no pack
            core.station_publish("ST-PCB-01", {"type": "pcb_flash", "pcb_serial": v["pcb"], "fw": v["fw"], "ts": v["ts"]})
            core.station_publish("ST-EOL-03", {"type": "vehicle_assembly", "vin": v["vin"], "pack_serial": v["pack"], "telemetry_device": v["tdev"], "mo": v["mo"], "ts": v["ts"] + 300})
            core.drain()
            core.station_publish("ST-PACK-02", {"type": "pack_scan", "pack_serial": v["pack"], "pcb_serial": v["pcb"], "bms_id": v["bms"], "ts": v["ts"] + 420})
            core.drain()
        elif cls == "STATION_SCAN_FAILURE" and in_w:
            core.station_publish("ST-PCB-01", {"type": "pcb_flash", "pcb_serial": v["pcb"], "fw": v["fw"], "ts": v["ts"]})
            core.station_publish("ST-PACK-02", {"type": "pack_scan", "pack_serial": v["pack"], "pcb_serial": v["pcb"], "bms_id": v["bms"], "ts": v["ts"] + 120})
            core.drain()  # the end-of-line scan never reached the software
        else:
            core.run_vehicle(v, with_telemetry=True)
    core.monitor_sweep()
    core.STATE["erp_http"] = None
    core.STATE["fw_format_bug"] = False if cls != "INGEST_TRANSFORM_FAILURE" else core.STATE["fw_format_bug"]
    built = [v["vin"] for v in vs]
    erp_done = {o["vin"] for o in core.ERPX.orders() if o["genealogy_status"] == "complete"}
    missing = [v for v in built if v not in erp_done]
    return {"class": cls, "component": CLASSES[cls], "window": window, "built": built, "missing": missing, "mos": {v["vin"]: v["mo"] for v in vs}}


def alert_of(inc, n_hint=None):
    """What the on-call person sees first. Never includes the class."""
    return {"title": f"{len(inc['missing'])} vehicles have no traceability record in the ERP", "missing_vins": inc["missing"], "built": len(inc["built"])}
