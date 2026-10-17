"""Connector layer. Built on dlt (open source): each source is snapshot-loaded once at setup, then synced incrementally to stay live.
Every sync lands in one DuckDB lake. Sources not wired in this build are listed honestly as 'available via dlt' or 'bridged'."""
import asyncio, json, os, threading, time
import dlt
from dlt.sources.sql_database import sql_database

from plant import core
from workspace import store

LAKE = os.path.join(core.DATA, "estate.duckdb")
PIPES = os.path.join(core.DATA, "dlt")
STATE = os.path.join(core.DATA, "connectors.json")
_OWN = {}   # visitor -> (has their own lake, checked at)


def _safe(uid):
    return "".join(ch for ch in uid if ch.isalnum() or ch in "-_")[:64]


def own_lake():
    """A visitor who brings their own machine data gets their own database file, so their plant never mixes with the sample or with anyone else's."""
    uid = store.UID.get()
    if uid == "local":
        return False
    hit = _OWN.get(uid)
    if hit and (hit[0] or time.time() - hit[1] < 3):
        return hit[0]
    flag = bool(store.load().get("own_lake"))
    _OWN[uid] = (flag, time.time())
    return flag


def set_own_lake():
    uid = store.UID.get()
    with store.LOCK:
        d = store.load()
        d["own_lake"] = True
        store.save(d)
    _OWN[uid] = (True, time.time())


def lake_path():
    return os.path.join(core.DATA, "users", "lake_" + _safe(store.UID.get()) + ".duckdb") if own_lake() else LAKE


def pipes_dir():
    return os.path.join(core.DATA, "users", "dlt_" + _safe(store.UID.get())) if own_lake() else PIPES
LOCK = threading.RLock()


# ------------------------------------------------------------------ custom resources
@dlt.resource(name="opcua_nodes", write_disposition="append")
def opcua_nodes(endpoint):
    from compiler.discover import _browse
    now = time.time()
    for group, name, vars_ in asyncio.run(_browse(endpoint)):
        for k, v in vars_.items():
            yield {"ts": now, "group": group, "node": name, "variable": k, "value": str(v)}


@dlt.resource(name="traces", write_disposition="append")
def traces(path):
    st = dlt.current.resource_state()
    off = st.get("offset", 0)
    if not os.path.exists(path):
        return
    with open(path, "rb") as f:
        f.seek(off)
        for line in f:
            if not line.endswith(b"\n"):
                break
            off += len(line)
            s = json.loads(line)
            yield {"trace_id": s["trace_id"], "span_id": s["span_id"], "parent_id": s["parent_id"], "service": s["service"], "name": s["name"],
                   "status": s["status"], "start": s["start"], "attributes": json.dumps(s["attributes"]), "events": json.dumps(s["events"])}
    st["offset"] = off


@dlt.resource(name="erp_orders", write_disposition="replace")
def erp_orders(base):
    import httpx
    for o in httpx.get(base + "/manufacturing-orders", timeout=10).json():
        yield {"mo": o["mo"], "vin": o["vin"], "status": o["status"], "genealogy_status": o["genealogy_status"], "genealogy": json.dumps(o.get("genealogy"))}


# ------------------------------------------------------------------ catalog
def catalog():
    """Each entry: how it is built and what it truly is today. status: live (wired and running), available (same plugin, other URL), bridged (supported by dlt/Debezium/Telegraf, not wired here)."""
    from plant import mes
    from plant import pg
    pgr, pgurl = pg.ready(), (pg.uri() or "").replace("postgresql://", "postgresql+psycopg2://")
    erp = f"http://127.0.0.1:{core.PORT + 1}"
    opc = f"opc.tcp://127.0.0.1:{core.PORT}/tolerance/plant"
    return [
        dict(id="mes", title="MES station states", kind="SQL database", engine="SQLite (any SQLAlchemy URL)", status="live", table="station_states", cursor="id",
             url=f"sqlite:///{mes.DB}", about="Real machine state logs from a manufacturing lab. Snapshot at setup, then new rows stream in."),
        dict(id="docs", title="Document store", kind="SQL database", engine="SQLite JSON documents", status="live", table="docs", cursor=None,
             url=f"sqlite:///{core.STORE.path}", about="Scans, genealogy and telemetry documents of the plant software."),
        dict(id="queue", title="Event queues", kind="SQL database", engine="SQLite queue tables", status="live", table="queue", cursor="seq",
             url=f"sqlite:///{core.STORE.path}", about="Message queues between stations and functions; incremental by sequence number."),
        dict(id="erppg", title="ERP database", kind="SQL database", engine="PostgreSQL 16 (real server)", status="live" if pgr else "bridged", table="erp_orders", cursor="seq",
             url=pgurl, about="The ERP's system of record. Rows change as genealogy is attached; synced by sequence."),
        dict(id="erp", title="ERP API", kind="REST API", engine="OpenAPI over HTTP", status="live", base=erp, about="Manufacturing orders and genealogy status."),
        dict(id="opcua", title="Line controllers", kind="OPC UA", engine="asyncua client", status="live", endpoint=opc, about="Station and device variables (read-only)."),
        dict(id="traces", title="Service traces", kind="Trace files", engine="OpenTelemetry-shaped JSONL", status="live", path=core.TRACER.path, about="Spans from stations, queues, functions and the ERP call."),
        dict(id="pg", title="MySQL / SQL Server / Oracle", kind="SQL database", engine="SQLAlchemy via dlt", status="available", about="Same plugin as the PostgreSQL and SQLite sources with a different URL."),
        dict(id="pgcdc", title="PostgreSQL change capture", kind="CDC", engine="dlt pg_replication / Debezium", status="bridged", about="Log-based changes after the snapshot. Needs a Postgres with logical replication."),
        dict(id="mongo", title="MongoDB", kind="Document database", engine="dlt verified source", status="bridged", about="Collections as tables, incremental by cursor."),
        dict(id="kafka", title="Kafka / Redpanda", kind="Event stream", engine="dlt verified source", status="bridged", about="Topics as streams."),
        dict(id="s3", title="S3 / GCS / Azure files", kind="Object storage", engine="dlt filesystem", status="available", about="CSV, JSONL and Parquet files, incremental by modified time."),
        dict(id="mqtt", title="MQTT / Sparkplug", kind="IoT broker", engine="Telegraf / Benthos", status="bridged", about="Machine telemetry."),
        dict(id="warehouse", title="BigQuery / Snowflake / Databricks", kind="Warehouse", engine="dlt destinations and sources", status="bridged", about="Historic data already in a warehouse."),
    ]


def _build(s):
    k = s["id"]
    if k in ("mes", "queue"):
        src = sql_database(s["url"], table_names=[s["table"]]).with_resources(s["table"])
        getattr(src, s["table"]).apply_hints(incremental=dlt.sources.incremental(s["cursor"]))
        return src
    if k == "erppg":
        # every change of an order is appended as a new row (a change log), keyed by the table's sequence
        src = sql_database(s["url"], table_names=["erp_orders"]).with_resources("erp_orders")
        src.erp_orders.apply_hints(table_name="erp_orders_pg", primary_key=[], write_disposition="append", incremental=dlt.sources.incremental("seq"))
        return src
    if k == "docs":
        return sql_database(s["url"], table_names=["docs"]).with_resources("docs")
    if k == "erp":
        return erp_orders(s["base"])
    if k == "opcua":
        return opcua_nodes(s["endpoint"])
    if k == "traces":
        return traces(s["path"])
    raise ValueError(k)


def _load_state():
    try:
        return json.load(open(STATE))
    except Exception:
        return {}


def sync(sid):
    """One sync. The first run of a source is the snapshot; later runs only move what is new."""
    with LOCK:
        s = next((x for x in catalog() if x["id"] == sid and x["status"] == "live"), None)
        if not s:
            raise KeyError(sid)
        st = _load_state()
        h = st.setdefault(sid, {"syncs": 0, "rows": 0, "history": []})
        mode = "snapshot" if h["syncs"] == 0 else "live"
        pipe = dlt.pipeline(pipeline_name="src_" + sid, destination=dlt.destinations.duckdb(lake_path()), dataset_name="lake", pipelines_dir=pipes_dir())
        t0 = time.time()
        pipe.run(_build(s))
        rc = {k: v for k, v in (pipe.last_trace.last_normalize_info.row_counts or {}).items() if not k.startswith("_dlt")}
        n = sum(rc.values())
        h["syncs"] += 1
        h["rows"] += n
        h["last"] = time.time()
        h["last_new"] = n
        h["mode"] = mode
        h["history"] = (h["history"] + [{"t": round(h["last"], 1), "mode": mode, "new": n}])[-30:]
        json.dump(st, open(STATE, "w"))
        return {"id": sid, "mode": mode, "new_rows": n, "total_rows": h["rows"], "seconds": round(time.time() - t0, 2), "tables": rc}


def status():
    st = _load_state()
    out = []
    for s in catalog():
        h = st.get(s["id"], {})
        out.append({**{k: v for k, v in s.items() if k not in ("url", "base", "endpoint", "path")}, "syncs": h.get("syncs", 0), "rows": h.get("rows", 0),
                    "last_new": h.get("last_new"), "mode": h.get("mode"), "age_s": round(time.time() - h["last"], 1) if h.get("last") else None, "history": h.get("history", [])})
    return out


def lake_query(sql):
    """Read from the lake. Serialised with syncs and opened with the same configuration as dlt's connection (DuckDB allows one config per file per process)."""
    import duckdb
    with LOCK:
        os.makedirs(os.path.dirname(lake_path()), exist_ok=True)
        c = duckdb.connect(lake_path())
        try:
            return c.sql(sql).df()
        finally:
            c.close()


class Live:
    """Keeps every live source current. Each pass is cheap because only new rows move."""
    def __init__(self, every=3.0):
        self.every, self.run, self.th, self.errors, self.ids = every, False, None, {}, []

    def start(self, ids=None):
        if self.run:
            return
        self.run = True
        self.ids = ids or [s["id"] for s in catalog() if s["status"] == "live"]
        self.th = threading.Thread(target=self._loop, daemon=True)
        self.th.start()

    def stop(self):
        self.run = False

    def _loop(self):
        while self.run:
            for sid in self.ids:
                if not self.run:
                    break
                try:
                    sync(sid)
                except Exception as e:
                    self.errors[sid] = f"{type(e).__name__}: {e}"[:200]
            time.sleep(self.every)
