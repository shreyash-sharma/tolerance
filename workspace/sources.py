"""Sources the person adds themselves: upload a CSV or SQLite file, give a database URL or an API URL, or attach the sample estate.
Every source is loaded once (the setup snapshot) and can then be synced to pick up only what is new. Built on dlt, landing in the same lake."""
import json, os, re, shutil, threading, time
import dlt
from dlt.sources.sql_database import sql_database

from plant import core
from connectors import registry as CR
from workspace import store

UPLOADS = os.path.join(core.DATA, "uploads")
os.makedirs(UPLOADS, exist_ok=True)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_") or "source"


# ------------------------------------------------------------------ resources
# Machine logs often say RUN or FAULT instead of 0, 1, 2. The loader adds a code column next to such a column: 0 idle, 1 busy, 2 failed.
STATE_WORDS = {
    "idle": {"idle", "standby", "waiting", "stopped", "stop", "off", "starved", "blocked", "paused", "ready", "setup"},
    "busy": {"run", "running", "busy", "active", "producing", "production", "on", "auto", "operating"},
    "failed": {"fault", "faulted", "failed", "failure", "error", "alarm", "down", "breakdown", "estop", "e-stop", "emergency"},
}
STATE_CODE = {"idle": 0, "busy": 1, "failed": 2}


def state_codes(col):
    """If every value in this text column is a known machine-state word (and at least two kinds appear), return the code for each value, else None."""
    vals = {str(v).strip().lower() for v in col.dropna().unique()}
    word = {w: k for k, ws in STATE_WORDS.items() for w in ws}
    if len(vals) < 2 or not vals <= set(word):
        return None
    return col.map(lambda v: STATE_CODE[word[str(v).strip().lower()]] if str(v).strip().lower() in word else None)


def csv_resource(path, table):
    """Append-only CSV. Each sync reads only the rows after the ones already loaded (a growing file behaves like a live feed)."""
    import pandas as pd

    @dlt.resource(name=table, write_disposition="append")
    def rows():
        st = dlt.current.resource_state()
        done = st.get("rows_done", 0)
        skip = range(1, done + 1) if done else None
        n = 0
        for chunk in pd.read_csv(path, skiprows=skip, chunksize=40000):
            chunk.columns = [slug(c) for c in chunk.columns]
            for col in [c for c in chunk.columns if (chunk[c].dtype == object or pd.api.types.is_string_dtype(chunk[c])) and not c.endswith("_code")]:
                codes = state_codes(chunk[col])
                if codes is not None:
                    chunk[col + "_code"] = codes.astype("int64")
            n += len(chunk)
            yield chunk.to_dict("records")
        st["rows_done"] = done + n
    return rows()


def _ejson(v):
    """MongoDB extended JSON to plain values: {"$oid": ...}, {"$date": ...} and the number wrappers."""
    if isinstance(v, dict):
        if len(v) == 1:
            k, x = next(iter(v.items()))
            if k in ("$oid", "$date", "$numberInt", "$numberLong", "$numberDouble", "$numberDecimal", "$uuid"):
                if isinstance(x, dict) and "$numberLong" in x:
                    x = x["$numberLong"]
                if k in ("$numberInt", "$numberLong"):
                    return int(x)
                if k in ("$numberDouble", "$numberDecimal"):
                    return float(x)
                return x
        return {k: _ejson(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_ejson(x) for x in v]
    return v


def _flat(d, pre=""):
    out = {}
    for k, v in d.items():
        key = slug(pre + str(k))
        if isinstance(v, dict):
            out.update(_flat(v, key + "_"))
        elif isinstance(v, list):
            out[key] = json.dumps(v)
        else:
            out[key] = v
    return out


def mongo_resource(path, table):
    """A MongoDB export (mongoexport JSON lines, or one JSON array). Documents become rows, nested fields become columns, and _id / $date wrappers are unwrapped.
    Append-only: a growing export file only adds the lines after the ones already loaded."""
    @dlt.resource(name=table, write_disposition="append")
    def rows():
        st = dlt.current.resource_state()
        done = st.get("lines_done", 0)
        with open(path, encoding="utf-8") as f:
            head = f.read(1)
            f.seek(0)
            if head == "[":
                docs = json.load(f)
                new, n = docs[done:], len(docs)
            else:
                lines = [ln for ln in f if ln.strip()]
                new, n = [json.loads(ln) for ln in lines[done:]], len(lines)
        batch = [_flat(_ejson(d)) for d in new if isinstance(d, dict)]
        if batch:
            yield batch
        st["lines_done"] = n
    return rows()


# what kind of system a source is, for the icons on the floor
SYSTEMS = {
    "mes": ("MES", "Machine states"), "erp": ("ERP", "Orders and materials"), "mongo": ("MongoDB", "Document database"), "postgres": ("PostgreSQL", "SQL database"),
    "sql": ("SQL database", "SQL database"), "opcua": ("OPC UA", "Line controllers"), "mqtt": ("MQTT", "IoT broker"), "api": ("API", "REST API"), "files": ("Files", "Files"),
    "traces": ("Traces", "Service traces"), "docs": ("Documents", "Plant documents"), "other": ("Data", "Data"),
}


def system_of(rec):
    """A person's tag wins. Else the file or name says it (mongo, erp, sap, mqtt, opc...), else the kind of source."""
    p = rec.get("params", {})
    if p.get("system") in SYSTEMS:
        return p["system"]
    hay = f"{rec.get('name', '')} {os.path.basename(p.get('path', '') or '')} {p.get('url', '')}".lower()
    for key, words in (("mongo", ("mongo",)), ("erp", ("erp", "sap", "odoo", "netsuite", "work_order", "workorder")), ("mqtt", ("mqtt", "iot", "sparkplug", "sensor")), ("opcua", ("opc",)),
                       ("mes", ("mes", "machine", "station")), ("postgres", ("postgres", "psycopg"))):
        if any(w in hay for w in words):
            return key
    b = rec.get("params", {}).get("id")
    if rec["kind"] == "builtin":
        return {"mes": "mes", "docs": "docs", "queue": "mes", "erp": "erp", "erppg": "erp", "opcua": "opcua", "traces": "traces"}.get(b, "other")
    return {"api": "api", "db_url": "sql", "sqlite": "sql", "csv": "files", "json": "mongo", "archive": "other"}.get(rec["kind"], "other")


def api_resource(url, table):
    import httpx

    @dlt.resource(name=table, write_disposition="replace")
    def rows():
        r = httpx.get(url, timeout=20)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict):
            data = next((v for v in data.values() if isinstance(v, list)), [data])
        for row in data:
            yield {slug(k): (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in row.items()} if isinstance(row, dict) else {"value": row}
    return rows()


def archive_resources():
    """Catalog tables from the real incident archive: the case index (no ground truth), the service catalog and the call graph seen in traces."""
    from rca import catalog as C

    @dlt.resource(name="cases", write_disposition="replace")
    def cases():
        yield from C.cases_table()

    @dlt.resource(name="service_catalog", write_disposition="replace")
    def service_catalog():
        yield from C.service_catalog()

    @dlt.resource(name="trace_edges", write_disposition="replace")
    def trace_edges():
        yield from C.trace_edges()
    return [cases(), service_catalog(), trace_edges()]


def sql_source(url, name):
    """All tables of a database. A table with an integer key named id/seq/rowid syncs incrementally; others are refreshed."""
    from sqlalchemy import create_engine, inspect
    eng = create_engine(url)
    insp = inspect(eng)
    tables = [t for t in insp.get_table_names() if not t.startswith("sqlite_")]
    src = sql_database(url, table_names=tables)
    for t in tables:
        cols = {c["name"]: c for c in insp.get_columns(t)}
        cur = next((c for c in ("id", "seq", "rowid") if c in cols and "INT" in str(cols[c]["type"]).upper()), None)
        res = getattr(src, t)
        if cur:
            res.apply_hints(table_name=f"{name}__{t}", primary_key=[], write_disposition="append", incremental=dlt.sources.incremental(cur))
        else:
            res.apply_hints(table_name=f"{name}__{t}", primary_key=[], write_disposition="replace")
    eng.dispose()
    return src


# ------------------------------------------------------------------ registry of the person's sources
def add(kind, name, **params):
    """kind: csv | sqlite | db_url | api | builtin."""
    sid = store.new_id("src")

    def f(d):
        rec = {"id": sid, "name": name, "kind": kind, "params": params, "live": kind in ("builtin", "api", "csv", "sqlite", "db_url", "json"), "created": time.time(), "syncs": 0, "rows": 0, "last": None,
               "last_new": None, "tables": {}, "error": None, "history": []}
        d["sources"].append(rec)
        return rec
    return store.update(f)


def remove(sid):
    store.update(lambda d: d.__setitem__("sources", [s for s in d["sources"] if s["id"] != sid]))


def get(sid):
    return next((s for s in store.load()["sources"] if s["id"] == sid), None)


def _pipeline(sid):
    return dlt.pipeline(pipeline_name="ws_" + sid, destination=dlt.destinations.duckdb(CR.lake_path()), dataset_name="lake", pipelines_dir=CR.pipes_dir())


def sync(sid):
    with CR.LOCK:
        s = get(sid)
        if not s:
            raise KeyError(sid)
        t0 = time.time()
        mode = "snapshot" if s["syncs"] == 0 else "live"
        err, rc = None, {}
        try:
            if s["kind"] == "builtin":
                r = CR.sync(s["params"]["id"])
                rc = r["tables"]
            else:
                nm = slug(s["name"])
                if s["kind"] == "archive":
                    src = archive_resources()
                elif s["kind"] == "csv":
                    src = csv_resource(s["params"]["path"], nm)
                elif s["kind"] == "json":
                    src = mongo_resource(s["params"]["path"], nm)
                elif s["kind"] == "api":
                    src = api_resource(s["params"]["url"], nm)
                else:
                    url = s["params"]["url"] if s["kind"] == "db_url" else "sqlite:///" + s["params"]["path"]
                    src = sql_source(url, nm)
                pipe = _pipeline(sid)
                pipe.run(src)
                rc = {k: v for k, v in (pipe.last_trace.last_normalize_info.row_counts or {}).items() if not k.startswith("_dlt")}
        except Exception as e:
            err = f"{type(e).__name__}: {str(e)[:260]}"
        n = sum(rc.values())

        def f(d):
            x = next(z for z in d["sources"] if z["id"] == sid)
            x["syncs"] += 1
            x["rows"] += n
            x["last"] = time.time()
            x["last_new"] = n
            x["error"] = err
            for t, c in rc.items():
                x["tables"][t] = x["tables"].get(t, 0) + c
            x["history"] = (x["history"] + [{"t": round(time.time(), 1), "mode": mode, "new": n, "err": bool(err)}])[-40:]
        store.update(f)
        return {"id": sid, "mode": mode, "new_rows": n, "tables": rc, "seconds": round(time.time() - t0, 2), "error": err}


def lag(s):
    """How far behind the source this lake is, where the source can tell us (the replayed machine log can)."""
    if s["kind"] == "builtin" and s["params"].get("id") == "mes":
        from server import state
        rp = state.S.get("rep")
        return rp.status()["remaining"] if rp else None
    return None


class Live:
    """Keeps all live sources current; each pass only moves new rows."""
    def __init__(self, every=3.0):
        self.every, self.run, self.th, self.errors = every, False, None, {}

    def start(self):
        if self.run:
            return
        self.run = True
        self.th = threading.Thread(target=self._loop, daemon=True)
        self.th.start()

    def stop(self):
        self.run = False

    def _loop(self):
        while self.run:
            for s in list(store.load()["sources"]):
                if not self.run:
                    break
                if s["live"] and s["syncs"] > 0:
                    try:
                        sync(s["id"])
                    except Exception as e:
                        self.errors[s["id"]] = str(e)[:160]
            time.sleep(self.every)


LIVE = Live()
