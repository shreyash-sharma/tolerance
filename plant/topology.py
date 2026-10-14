"""Sealed ground truth for scoring the compiler. The compiler never imports this module; only the scorer does."""
TRUE_EDGES = {
    ("station:ST-PCB-01", "queue:scan-events", "publishes"), ("station:ST-PACK-02", "queue:scan-events", "publishes"),
    ("station:ST-EOL-03", "queue:scan-events", "publishes"),
    ("queue:scan-events", "fn:fn-ingest-scan", "triggers"), ("fn:fn-ingest-scan", "coll:scans", "writes"),
    ("fn:fn-ingest-scan", "queue:genealogy-jobs", "publishes"),
    ("queue:genealogy-jobs", "fn:fn-build-genealogy", "triggers"), ("coll:scans", "fn:fn-build-genealogy", "reads"),
    ("fn:fn-build-genealogy", "coll:genealogy", "writes"), ("fn:fn-build-genealogy", "queue:genealogy-ready", "publishes"),
    ("queue:genealogy-ready", "fn:fn-erp-sync", "triggers"), ("coll:genealogy", "fn:fn-erp-sync", "reads"),
    ("fn:fn-erp-sync", "api:erp", "calls"),
    ("device:telemetry-gw", "queue:telemetry-ingest", "publishes"), ("queue:telemetry-ingest", "fn:fn-telemetry", "triggers"),
    ("fn:fn-telemetry", "coll:telemetry", "writes"),
    ("coll:scans", "svc:svc-monitor", "reads"),
}
# fields that carry the same real-world identity
TRUE_IDENTITY = {
    "PCB": {"scans.pcb_serial", "genealogy.board_sn", "erp.pcbSerialNo"},
    "PACK": {"scans.pack_serial", "genealogy.pack_sn", "erp.packSerialNo"},
    "VIN": {"scans.vin", "genealogy.vin", "erp.vin"},
    "BMS": {"scans.bms_id", "genealogy.bms_id", "erp.bmsId"},
    "MO": {"scans.mo", "genealogy.mo", "erp.mo"},
    "TDEV": {"scans.telemetry_device", "genealogy.telemetry_device", "telemetry.device"},
}
# traps: things a careless tool would assert but the evidence cannot support
TRAPS = {"stale_manifest": ("fn:fn-legacy-export", "coll:scans_v2", "writes"), "ambiguous_field": "telemetry.unit_id"}
