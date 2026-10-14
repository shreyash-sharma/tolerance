"""Plant fingerprint: work out what kind of plant the connected data describes, and say why.
Evidence comes in layers, strongest first: the shape of the data (state logs, pass/fail per unit, service telemetry, unit traceability), then structure
(identifiers, stations, how rows relate), then vocabulary (names of tables, columns and assets) as supporting evidence only, because real names are often cryptic.
The output is a hypothesis with its evidence and its gaps for the person to confirm or correct. It is never presented as fact."""
import hashlib, json, math, os, re, time

from workspace import store

VOCAB = {
    "electronics": r"spi|aoi|\bict\b|\bfct\b|reflow|solder|placement|pick|stencil|pcb|panel|smt|paste|component|footprint|board",
    "process": r"temp|pressure|flow|level|valve|\bph\b|tank|reactor|batch|recipe|setpoint|pump|viscos",
    "machining": r"spindle|feedrate|tool|axis|cnc|coolant|chuck|torque|vibration",
    "packaging": r"filler|capper|labeler|bottle|carton|packml|palletiz",
    "software": r"service|latency|cpu|memory|\bpod\b|\bspan\b|trace|error_rate|replica|p9\d",
    "logistics": r"\bagv\b|warehouse|\bwh\d|transfer|pallet|forklift|shuttle|conveyor|\bc\d\b|\btr\b",
}
ARCH = {
    "electronics": ("Electronics / PCB assembly and inspection", "Units are inspected and get a pass or fail, with many process signals per unit: the signature of an SMT or test line."),
    "fleet": ("Machine fleet with state logs", "Equipment reports status codes over time: the signature of discrete machines whose uptime and failures can be modelled."),
    "software": ("Software service estate", "Services with metrics, logs, traces or a call graph: the software layer running next to the plant."),
    "process": ("Process plant (continuous or batch)", "Continuous analog measurements such as temperature, pressure and flow."),
    "traceability": ("Discrete assembly with unit traceability", "Unit or serial IDs seen at several stations: material flow can be discovered from the data, not guessed."),
    "logistics": ("Material handling and intralogistics", "Assets such as AGVs, warehouses, transfer units and conveyors."),
    "business": ("Business-system layer (orders, ERP)", "Order or customer records: the business view of what the plant should be making."),
}
_CACHE = {}


def _hits(texts, key):
    rx = re.compile(VOCAB[key], re.I)
    found = sorted({t for t in texts if rx.search(str(t))})
    return found


def _lake(sql):
    from connectors import registry as CR
    return CR.lake_query(sql)


def gather():
    """Facts about the connected data. Everything here is read from what the person connected."""
    from interpret import model as M
    items = M.reviewed_items()
    f = {"tables": [], "state_logs": [], "inspection": [], "assets": [], "services": 0, "sources": []}
    d = store.load()
    f["sources"] = [{"name": s["name"], "kind": s["kind"], "rows": s.get("rows", 0), "live": bool(s.get("live"))} for s in d["sources"]]
    for it in items:
        if it["type"] == "table" and not it["title"].startswith("_dlt"):
            cols = it["detail"]["columns"]
            roles = {}
            for c in cols:
                roles[c["role"]] = roles.get(c["role"], 0) + 1
            f["tables"].append({"name": it["title"], "rows": it["detail"]["rows"], "cols": [c["name"] for c in cols], "roles": roles, "col_info": cols})
        elif it["type"] == "state_map" and it["status"] != "rejected":
            dd = it["detail"]
            try:
                assets = _lake(f'select distinct "{dd["asset"]}" a from lake."{dd["table"]}" order by 1 limit 60')["a"].astype(str).tolist()
            except Exception:
                assets = []
            f["state_logs"].append({"table": dd["table"], "rows": dd.get("rows", 0), "assets": assets, "codes": len(dd.get("labels", {}))})
            f["assets"] += assets
        elif it["type"] == "entity" and it["detail"].get("system"):
            f["services"] += len(it["detail"].get("fields", []))
    try:
        from mcpx.servers import _find_inspection
        for x in _find_inspection():
            df = x["df"]
            res = df[x["result"]].astype(str).str.lower()
            f["inspection"].append({"table": x["table"], "units": len(df), "fail_rate": float(res.isin({"fail", "nok", "bad", "failed", "defect"}).mean()),
                                    "signals": int(sum(1 for c in df.columns if str(df[c].dtype).startswith(("float", "int")) and c not in (x["result"],))), "has_unit_id": bool(x["id"])})
    except Exception:
        pass
    return f


def _trace_tables(f):
    """Tables where a unit-like identifier repeats across several station-like values: unit genealogy."""
    out = []
    for t in f["tables"]:
        ids = [c for c in t["col_info"] if c["role"] in ("identifier", "key") and c["distinct"] and t["rows"] / max(c["distinct"], 1) >= 2.5 and c["distinct"] >= 50]
        stn = [c for c in t["col_info"] if c["role"] == "category" and 3 <= c["distinct"] <= 60 and re.search(r"station|stage|step|machine|line|op", c["name"], re.I)]
        if ids and stn:
            out.append({"table": t["name"], "id": ids[0]["name"], "station": stn[0]["name"]})
    return out


def score(f):
    H = {}

    def add(k, w, text, src):
        h = H.setdefault(k, {"id": k, "score": 0.0, "evidence": []})
        h["score"] += w
        h["evidence"].append({"text": text, "weight": w, "source": src})

    names = [t["name"] for t in f["tables"]] + [c for t in f["tables"] for c in t["cols"][:60]] + f["assets"]
    for s in f["state_logs"]:
        add("fleet", 1.6, f"{s['table']} is a state log: {len(s['assets'])} assets, {s['codes']} status codes, {s['rows']:,} rows", "data shape")
        if len(s["assets"]) >= 3:
            add("fleet", .4, f"{len(s['assets'])} distinct assets share one status vocabulary", "structure")
    for i in f["inspection"]:
        add("electronics", 1.5, f"{i['table']}: a pass/fail verdict for {i['units']:,} units ({i['fail_rate'] * 100:.1f}% fail)", "data shape")
        if i["signals"] >= 20:
            add("electronics", .8, f"{i['signals']} numeric process signals recorded per unit", "data shape")
        if i["has_unit_id"]:
            add("traceability", .5, "each inspected unit has an identifier", "structure")
    for t in _trace_tables(f):
        add("traceability", 1.4, f"{t['table']}: unit identifier {t['id']} repeats across values of {t['station']} (unit genealogy)", "structure")
    if f["services"]:
        add("software", 1.4, f"{f['services']} services with call or telemetry data", "data shape")
    if any(t["name"] in ("service_catalog", "trace_edges") or t["name"].endswith("__alerts") for t in f["tables"]):
        add("software", .6, "service catalog, call edges or alert feed present", "structure")
    # vocabulary: supporting only
    for key, arch in (("electronics", "electronics"), ("process", "process"), ("logistics", "logistics"), ("packaging", "logistics"), ("machining", "fleet"), ("software", "software")):
        hit = _hits(names, key)
        if hit:
            add(arch, min(.8, .25 * len(hit)), f"names suggest {key}: {', '.join(hit[:5])}", "vocabulary")
    num_proc = sum(1 for t in f["tables"] for c in t["col_info"] if c["role"] == "measure" and re.search(VOCAB["process"], c["name"], re.I))
    if num_proc >= 3:
        add("process", 1.2, f"{num_proc} continuous measurement columns with process-style names", "data shape")
    if any(re.search(r"order|customer|invoice|sku|shipment", t["name"] + " ".join(t["cols"]), re.I) for t in f["tables"]):
        add("business", 1.0, "tables with orders, customers or shipments", "data shape")
    out = []
    for k, h in H.items():
        h["label"], h["about"] = ARCH[k]
        h["confidence"] = round(h["score"] / (h["score"] + 1.0), 2)
        h["score"] = round(h["score"], 2)
        out.append(h)
    out.sort(key=lambda h: -h["score"])
    return out


def layers_and_gaps(f, hyp):
    ids = {h["id"] for h in hyp if h["confidence"] >= .5}
    layers = [
        {"layer": "Shop floor", "found": bool(f["state_logs"]), "detail": f"{len(f['assets'])} assets with a state log" if f["state_logs"] else "no machine state log"},
        {"layer": "Quality and test", "found": bool(f["inspection"]), "detail": f"{sum(i['units'] for i in f['inspection']):,} inspected units" if f["inspection"] else "no pass/fail inspection data"},
        {"layer": "Software and telemetry", "found": bool(f["services"]), "detail": f"{f['services']} services" if f["services"] else "no service telemetry"},
        {"layer": "Business systems", "found": "business" in ids, "detail": "orders found" if "business" in ids else "no orders or ERP data"},
        {"layer": "Maintenance records", "found": any(re.search(r"work.?order|maintenance|cmms|ticket", t["name"], re.I) for t in f["tables"]), "detail": "work orders found" if any(re.search(r"work.?order|maintenance|cmms|ticket", t["name"], re.I) for t in f["tables"]) else "no work orders or tickets"},
    ]
    gaps = []
    if f["state_logs"] and "traceability" not in ids:
        gaps.append("No unit-level traceability: material flow between stations cannot be discovered from the data, only drawn by you.")
    if not layers[4]["found"]:
        gaps.append("No maintenance or work-order records: failure causes can be diagnosed but not checked against what was actually repaired.")
    if f["inspection"] and not any(i["has_unit_id"] for i in f["inspection"]):
        gaps.append("Inspection rows have no unit identifier, so a failing unit cannot be traced back to a station.")
    if f["state_logs"] and not f["inspection"]:
        gaps.append("No quality data next to the machine states: downtime can be analysed, quality escapes cannot.")
    if f["inspection"] and not f["state_logs"]:
        gaps.append("No machine state data next to the inspection results: process drift cannot be tied to equipment.")
    return layers, gaps


def explain(f, hyp, gaps):
    """One short plain-language read of the evidence (Gemini, cached). Falls back to a template."""
    top = [h for h in hyp if h["confidence"] >= .5][:3]
    key = hashlib.sha256(json.dumps([[h["id"], h["score"]] for h in hyp] + gaps, sort_keys=True).encode()).hexdigest()[:16]
    if key in _CACHE:
        return _CACHE[key]
    names = " and ".join(h["label"].lower() for h in top) or "an unclear plant"
    base = {"by": "template", "text": f"The connected data looks like {names}."}
    try:
        from fabric.agents import gemini_available, make_client, gen_with_retry
        if gemini_available() and top:
            from google.genai import types
            ev = [{"hypothesis": h["label"], "confidence": h["confidence"], "evidence": [e["text"] for e in h["evidence"]][:5]} for h in top]
            prompt = ("You are helping a plant engineer check what a system inferred about their plant from raw data. In at most 3 sentences, say what kind of plant this looks like and the single most useful thing to confirm. "
                      "Use only this evidence, be modest, no jargon like 'cell' or 'module'. Evidence: " + json.dumps(ev) + " Gaps: " + json.dumps(gaps))
            r = gen_with_retry(make_client(), tries=2, max_wait=6, model=os.environ.get("TOLERANCE_NAMING_MODEL") or "gemini-3.1-flash-lite", contents=prompt, config=types.GenerateContentConfig(temperature=0))
            if r.text:
                base = {"by": "gemini", "text": r.text.strip()}
    except Exception:
        pass
    _CACHE[key] = base
    return base


def run(with_explanation=True):
    f = gather()
    hyp = score(f)
    layers, gaps = layers_and_gaps(f, hyp)
    d = store.load().get("fingerprint", {})
    plant = [h["label"] for h in hyp if h["confidence"] >= .5 and h["id"] not in ("traceability", "business")][:3]
    return {"hypotheses": hyp, "plant": plant, "layers": layers, "gaps": gaps, "explanation": explain(f, hyp, gaps) if with_explanation else None, "confirmed": d.get("confirmed"), "answers": d.get("answers", []),
            "sources": f["sources"], "computed": time.time()}


def answer(action, label=None, note=None):
    def fn(d):
        fp = d.setdefault("fingerprint", {"answers": []})
        fp["answers"].append({"action": action, "label": label, "note": note, "at": time.time()})
        if action in ("confirm", "correct"):
            fp["confirmed"] = {"label": label, "by": "you", "action": action, "at": time.time()}
        elif action == "reset":
            fp["confirmed"] = None
    store.update(fn)
