"""A small synthetic EV plant that really runs.

Stations publish events to queues. Function-style workers consume them, write to a document store and call an ERP API.
Every hop emits OpenTelemetry-style spans to data/traces.jsonl. Nothing here is visible to the compiler except through
its real interfaces: the ERP's OpenAPI, the OPC UA server, the function manifests, the document store and the traces.

All data is synthetic. Physical controllers are modelled by an OPC UA simulator, not real hardware."""
import json, os, re, sqlite3, threading, time, uuid, random
from contextlib import contextmanager

def _load_env():
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf8"):
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v)


_load_env()
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.environ.get("TOLERANCE_DATA") or os.path.join(ROOT, "data")
PORT = int(os.environ.get("TOLERANCE_PORT", "48400"))  # OPC UA on PORT, ERP on PORT+1
os.makedirs(DATA, exist_ok=True)
LOCK = threading.RLock()


# ------------------------------------------------------------------ tracing
class Tracer:
    """Minimal OpenTelemetry-shaped span writer (same field names as OTLP JSON)."""
    def __init__(self, path):
        self.path = path
        self.local = threading.local()

    def reset(self):
        open(self.path, "w").close()

    @contextmanager
    def span(self, service, name, **attrs):
        stack = getattr(self.local, "stack", None)
        if stack is None:
            stack = self.local.stack = []
        parent = stack[-1] if stack else None
        trace_id = parent["trace_id"] if parent else uuid.uuid4().hex
        rec = {"trace_id": trace_id, "span_id": uuid.uuid4().hex[:16], "parent_id": parent["span_id"] if parent else None,
               "service": service, "name": name, "attributes": dict(attrs), "start": time.time(), "status": "OK", "events": []}
        stack.append(rec)
        try:
            yield rec
        except Exception as e:
            rec["status"] = "ERROR"
            rec["events"].append({"name": "exception", "type": type(e).__name__, "message": str(e)})
            raise
        finally:
            stack.pop()
            rec["end"] = time.time()
            with LOCK, open(self.path, "a") as f:
                f.write(json.dumps(rec) + "\n")


TRACER = Tracer(os.path.join(DATA, "traces.jsonl"))


# ------------------------------------------------------------------ document store + queue (sqlite)
class _Conn(sqlite3.Connection):
    def __exit__(self, *a):
        r = super().__exit__(*a)
        self.close()
        return r


class Store:
    """Document collections (Mongo/Cosmos-shaped) and named queues, both in one sqlite file."""
    def __init__(self, path):
        self.path = path
        self.init()

    def conn(self):
        c = sqlite3.connect(self.path, timeout=30, factory=_Conn)
        c.execute('pragma synchronous=off'); c.execute('pragma journal_mode=memory')
        c.row_factory = sqlite3.Row
        return c

    def init(self):
        with LOCK, self.conn() as c:
            c.execute("create table if not exists docs(collection text, id text, body text, primary key(collection,id))")
            c.execute("create table if not exists queue(seq integer primary key autoincrement, name text, body text, state text default 'ready', attempts integer default 0, error text)")

    def wipe(self):
        with LOCK, self.conn() as c:
            c.execute("delete from docs"); c.execute("delete from queue")

    # documents
    def put(self, coll, doc, key):
        with LOCK, self.conn() as c:
            c.execute("insert or replace into docs values(?,?,?)", (coll, str(doc[key]), json.dumps(doc)))

    def get(self, coll, id_):
        with LOCK, self.conn() as c:
            r = c.execute("select body from docs where collection=? and id=?", (coll, str(id_))).fetchone()
        return json.loads(r["body"]) if r else None

    def find(self, coll, flt=None, limit=1000):
        with LOCK, self.conn() as c:
            rows = c.execute("select body from docs where collection=?", (coll,)).fetchall()
        out = []
        for r in rows:
            d = json.loads(r["body"])
            if all(d.get(k) == v for k, v in (flt or {}).items()):
                out.append(d)
                if len(out) >= limit:
                    break
        return out

    def collections(self):
        with LOCK, self.conn() as c:
            return [r[0] for r in c.execute("select distinct collection from docs")]

    # queues
    def publish(self, name, body):
        with LOCK, self.conn() as c:
            c.execute("insert into queue(name,body) values(?,?)", (name, json.dumps(body)))

    def take(self, name):
        with LOCK, self.conn() as c:
            r = c.execute("select * from queue where name=? and state='ready' order by seq limit 1", (name,)).fetchone()
            if not r:
                return None
            c.execute("update queue set state='working', attempts=attempts+1 where seq=?", (r["seq"],))
            return {"seq": r["seq"], "body": json.loads(r["body"]), "attempts": r["attempts"] + 1}

    def done(self, seq):
        with LOCK, self.conn() as c:
            c.execute("update queue set state='done' where seq=?", (seq,))

    def retry_or_dead(self, seq, err, max_attempts=3):
        with LOCK, self.conn() as c:
            r = c.execute("select attempts from queue where seq=?", (seq,)).fetchone()
            c.execute("update queue set state=?, error=? where seq=?", ("dead" if r["attempts"] >= max_attempts else "ready", err, seq))

    def queue_stats(self):
        with LOCK, self.conn() as c:
            rows = c.execute("select name,state,count(*) n from queue group by name,state").fetchall()
        out = {}
        for r in rows:
            out.setdefault(r["name"], {})[r["state"]] = r["n"]
        return out

    def dead_letters(self, name=None):
        with LOCK, self.conn() as c:
            rows = c.execute("select seq,name,body,attempts,error from queue where state='dead'" + (" and name=?" if name else ""), (name,) if name else ()).fetchall()
        return [{"seq": r["seq"], "queue": r["name"], "body": json.loads(r["body"]), "attempts": r["attempts"], "error": r["error"]} for r in rows]


STORE = Store(os.path.join(DATA, "plant.db"))


# ------------------------------------------------------------------ ERP (state kept in the store under erp_* collections)
class ERP:
    def __init__(self, store):
        self.s = store

    def orders(self):
        return self.s.find("erp_orders")

    def order(self, mo):
        return self.s.get("erp_orders", mo)

    def attach_genealogy(self, mo, g):
        o = self.s.get("erp_orders", mo)
        if not o:
            raise KeyError(mo)
        o["genealogy"] = g
        o["genealogy_status"] = "complete"
        self.s.put("erp_orders", o, "mo")
        if PG_HOOK:
            PG_HOOK(o)
        return o


ERPX = ERP(STORE)

FW_RE = re.compile(r"^v\d+\.\d+\.\d+$")
PG_WIPE = None
PG_HOOK = None  # set by the server when the PostgreSQL system of record is up
STATE = {"fw_format_bug": False, "erp_http": None}  # erp_http: callable(mo, genealogy) when talking to the real HTTP ERP


# ------------------------------------------------------------------ function-style workers
def fn_ingest_scan(msg):
    """queue scan-events -> collection scans. Strict transform of the firmware version."""
    with TRACER.span("fn-ingest-scan", "invoke", **{"tol.trigger": "queue:scan-events", "faas.name": "fn-ingest-scan"}):
        e = msg["body"]
        with TRACER.span("fn-ingest-scan", "transform", **{"event.type": e["type"]}):
            doc = {"event_id": e["event_id"], "type": e["type"], "station": e["station"], "ts": e["ts"]}
            if e["type"] == "pcb_flash":
                fw = e["fw"]
                if STATE["fw_format_bug"] and not FW_RE.match(fw):
                    raise ValueError(f"firmware version {fw!r} does not match v<major>.<minor>.<patch>")
                doc.update(pcb_serial=e["pcb_serial"], fw_version=fw)
            elif e["type"] == "pack_scan":
                doc.update(pack_serial=e["pack_serial"], pcb_serial=e["pcb_serial"], bms_id=e["bms_id"])
            else:
                doc.update(vin=e["vin"], pack_serial=e["pack_serial"], telemetry_device=e["telemetry_device"], mo=e["mo"])
        with TRACER.span("fn-ingest-scan", "write", **{"db.system": "docstore", "db.collection": "scans", "db.operation": "write"}):
            STORE.put("scans", doc, "event_id")
        if doc["type"] == "vehicle_assembly":
            with TRACER.span("fn-ingest-scan", "publish", **{"messaging.destination": "genealogy-jobs"}):
                STORE.publish("genealogy-jobs", {"vin": doc["vin"]})


def fn_build_genealogy(msg):
    """queue genealogy-jobs -> reads scans, writes genealogy. Needs the full pcb -> pack -> vehicle chain."""
    with TRACER.span("fn-build-genealogy", "invoke", **{"tol.trigger": "queue:genealogy-jobs", "faas.name": "fn-build-genealogy"}):
        vin = msg["body"]["vin"]
        with TRACER.span("fn-build-genealogy", "read", **{"db.system": "docstore", "db.collection": "scans", "db.operation": "read"}):
            veh = next((d for d in STORE.find("scans", {"type": "vehicle_assembly", "vin": vin})), None)
            pack = next((d for d in STORE.find("scans", {"type": "pack_scan", "pack_serial": veh["pack_serial"]})), None) if veh else None
            pcb = next((d for d in STORE.find("scans", {"type": "pcb_flash", "pcb_serial": pack["pcb_serial"]})), None) if pack else None
        if not (veh and pack and pcb):
            # chain incomplete: the function logs and moves on, as many real pipelines do
            with TRACER.span("fn-build-genealogy", "skip", **{"log.level": "warn", "log.message": f"chain incomplete for {vin}: pcb={'ok' if pcb else 'missing'}"}):
                return
        g = {"vin": vin, "mo": veh["mo"], "board_sn": pcb["pcb_serial"], "firmware": pcb["fw_version"], "bms_id": pack["bms_id"],
             "pack_sn": pack["pack_serial"], "telemetry_device": veh["telemetry_device"], "built_at": veh["ts"]}
        with TRACER.span("fn-build-genealogy", "write", **{"db.system": "docstore", "db.collection": "genealogy", "db.operation": "write"}):
            STORE.put("genealogy", g, "vin")
        with TRACER.span("fn-build-genealogy", "publish", **{"messaging.destination": "genealogy-ready"}):
            STORE.publish("genealogy-ready", {"vin": vin})


def fn_erp_sync(msg):
    """queue genealogy-ready -> reads genealogy, calls the ERP API."""
    with TRACER.span("fn-erp-sync", "invoke", **{"tol.trigger": "queue:genealogy-ready", "faas.name": "fn-erp-sync"}):
        vin = msg["body"]["vin"]
        with TRACER.span("fn-erp-sync", "read", **{"db.system": "docstore", "db.collection": "genealogy", "db.operation": "read"}):
            g = STORE.get("genealogy", vin)
        payload = {"vin": g["vin"], "pcbSerialNo": g["board_sn"], "firmwareVersion": g["firmware"], "bmsId": g["bms_id"], "packSerialNo": g["pack_sn"]}
        with TRACER.span("fn-erp-sync", "http", **{"http.method": "POST", "http.url": f"http://erp.local/manufacturing-orders/{g['mo']}/genealogy", "tol.api": "erp"}):
            (STATE["erp_http"] or (lambda mo, p: ERPX.attach_genealogy(mo, p)))(g["mo"], payload)


def fn_telemetry(msg):
    """queue telemetry-ingest -> collection telemetry. Rows carry an ambiguous unit_id on purpose."""
    with TRACER.span("fn-telemetry", "invoke", **{"tol.trigger": "queue:telemetry-ingest", "faas.name": "fn-telemetry"}):
        t = msg["body"]
        with TRACER.span("fn-telemetry", "write", **{"db.system": "docstore", "db.collection": "telemetry", "db.operation": "write"}):
            STORE.put("telemetry", t, "reading_id")


def monitor_sweep():
    """A separate health service that reads scans. A real, unlisted consumer."""
    with TRACER.span("svc-monitor", "invoke", **{"faas.name": "svc-monitor"}):
        with TRACER.span("svc-monitor", "read", **{"db.system": "docstore", "db.collection": "scans", "db.operation": "read"}):
            STORE.find("scans", limit=5)


WORKERS = {"scan-events": fn_ingest_scan, "genealogy-jobs": fn_build_genealogy, "genealogy-ready": fn_erp_sync, "telemetry-ingest": fn_telemetry}


def drain(max_rounds=50):
    for _ in range(max_rounds):
        moved = False
        for q, fn in WORKERS.items():
            m = STORE.take(q)
            if not m:
                continue
            moved = True
            try:
                fn(m)
                STORE.done(m["seq"])
            except Exception as e:
                STORE.retry_or_dead(m["seq"], f"{type(e).__name__}: {e}")
        if not moved:
            return


# ------------------------------------------------------------------ station software (publishes to the queue)
def station_publish(station, payload):
    with TRACER.span("station-sw", "scan", **{"tol.station": station, "scan.ack": True}):
        with TRACER.span("station-sw", "publish", **{"messaging.destination": "scan-events", "tol.station": station}):
            STORE.publish("scan-events", {**payload, "station": station, "event_id": payload.get("event_id") or uuid.uuid4().hex[:12]})


def telemetry_publish(reading):
    with TRACER.span("telemetry-gw", "forward", **{"messaging.destination": "telemetry-ingest"}):
        STORE.publish("telemetry-ingest", reading)


# ------------------------------------------------------------------ production run
def build_vehicles(n=40, start_ts=1_760_000_000, rc_window=None, seed=7):
    """Build n vehicles. Vehicles whose index is in rc_window get a firmware string with an '-rc1' suffix."""
    rnd = random.Random(seed)
    rc_window = set(rc_window or [])
    vehicles = []
    for i in range(n):
        fw = "v3.2.1-rc1" if i in rc_window else rnd.choice(["v3.1.4", "v3.2.0", "v3.2.1"])
        v = {"i": i, "pcb": f"PCB-{40000 + i}", "pack": f"PK-{70000 + i}", "bms": f"BMS-{900 + i}", "vin": f"EVX{1000000 + i}",
             "mo": f"MO-{5000 + i}", "tdev": f"TD-{300 + i}", "fw": fw, "ts": start_ts + i * 600}
        vehicles.append(v)
    return vehicles


def seed_erp(vehicles):
    for v in vehicles:
        o = {"mo": v["mo"], "vin": v["vin"], "status": "released", "genealogy": None, "genealogy_status": "pending"}
        STORE.put("erp_orders", o, "mo")
        if PG_HOOK:
            PG_HOOK(o)


def run_vehicle(v, with_telemetry=True):
    station_publish("ST-PCB-01", {"type": "pcb_flash", "pcb_serial": v["pcb"], "fw": v["fw"], "ts": v["ts"]})
    station_publish("ST-PACK-02", {"type": "pack_scan", "pack_serial": v["pack"], "pcb_serial": v["pcb"], "bms_id": v["bms"], "ts": v["ts"] + 120})
    station_publish("ST-EOL-03", {"type": "vehicle_assembly", "vin": v["vin"], "pack_serial": v["pack"], "telemetry_device": v["tdev"], "mo": v["mo"], "ts": v["ts"] + 300})
    if with_telemetry:
        # unit_id is deliberately ambiguous: sometimes the pack serial, sometimes the VIN
        unit = v["pack"] if v["i"] % 5 else v["vin"]
        telemetry_publish({"reading_id": f"R-{v['i']}", "unit_id": unit, "device": v["tdev"], "soc": 80 - v["i"] % 7, "ts": v["ts"] + 900})
    drain()


def reset_plant(n=40, rc_window=None, fault=False):
    STORE.wipe(); TRACER.reset()
    if PG_WIPE:
        PG_WIPE()
    STATE["fw_format_bug"] = fault
    vs = build_vehicles(n, rc_window=rc_window)
    seed_erp(vs)
    for v in vs:
        run_vehicle(v)
    monitor_sweep()
    return vs


def health():
    """Reconciliation the plant's own dashboard can do: assembled vehicles vs vehicles with genealogy in the ERP."""
    asm = STORE.find("scans", {"type": "vehicle_assembly"})
    gen = {d["vin"] for d in STORE.find("genealogy")}
    erp = {o["vin"] for o in ERPX.orders() if o["genealogy_status"] == "complete"}
    missing = sorted(d["vin"] for d in asm if d["vin"] not in erp)
    return {"assembled": len(asm), "genealogy_docs": len(gen), "erp_complete": len(erp), "missing_vins": missing, "dead_letters": len(STORE.dead_letters())}
