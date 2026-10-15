"""MCP servers for the plant: databases, PCB / inspection data, machine and service telemetry, OPC UA.
Real Model Context Protocol servers (mcp.server.fastmcp), all read-only by design. The hub connects to them over the MCP protocol, and every call an agent makes
goes through the policy gateway first. Blocking work runs in threads so one slow query never stalls the others."""
import asyncio, json, math, re, time

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

READ = ToolAnnotations(readOnlyHint=True, destructiveHint=False, idempotentHint=True)
_DENY_SQL = re.compile(r"\b(insert|update|delete|drop|alter|create|attach|copy|export|pragma|call|install|load|replace|truncate)\b", re.I)


def clean(o):
    """JSON-safe copy (numpy, pandas, NaN)."""
    import numpy as np
    import pandas as pd
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(x) for x in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating, float)):
        return None if (isinstance(o, float) and math.isnan(o)) or (isinstance(o, np.floating) and np.isnan(o)) else float(o)
    if isinstance(o, (pd.Timestamp,)):
        return str(o)
    if o is pd.NaT:
        return None
    return o


CUR_UID = {"uid": "local"}   # set by the hub for the call in flight


def _thread(fn):
    """Run a blocking function off the event loop."""
    async def run(*a, **k):
        uid = CUR_UID["uid"]   # the hub says which visitor this call is for; the in-memory server task does not inherit it

        def act():
            from workspace import store
            tok = store.UID.set(uid)
            try:
                return fn(*a, **k)
            finally:
                store.UID.reset(tok)
        return clean(await asyncio.to_thread(act))
    run.__name__ = fn.__name__
    run.__doc__ = fn.__doc__
    # keep the signature so MCP can build the tool schema
    import functools
    run = functools.wraps(fn)(run)
    return run


def _q(t):
    return '"' + str(t).replace('"', '""') + '"'


# =================================================================== databases
db = FastMCP("plant-databases", log_level="WARNING", instructions="Read-only access to every database, file and API the person has connected to the plant (all loaded into one lake). SELECT only.")


def _lake(sql):
    from connectors import registry as CR
    return CR.lake_query(sql)


@db.tool(annotations=READ)
@_thread
def list_sources() -> dict:
    """The data sources connected to this plant: name, kind, rows loaded, tables, whether it is live."""
    from workspace import store
    return {"sources": [{"name": s["name"], "kind": s["kind"], "rows": s.get("rows", 0), "live": bool(s.get("live")), "tables": s.get("tables", {}), "error": s.get("error")} for s in store.load()["sources"]]}


@db.tool(annotations=READ)
@_thread
def list_tables() -> dict:
    """All tables in the plant data lake with row counts."""
    from interpret import engine as E
    out = []
    for t in E.lake_tables():
        if t.startswith("_dlt"):
            continue
        n = int(_lake(f"select count(*) c from lake.{_q(t)}")["c"][0])
        out.append({"table": t, "rows": n})
    return {"tables": out}


@db.tool(annotations=READ)
@_thread
def describe_table(table: str) -> dict:
    """Columns of a table: type, null count, distinct values and a few samples."""
    d = _lake(f"describe lake.{_q(table)}")
    n = int(_lake(f"select count(*) c from lake.{_q(table)}")["c"][0])
    s = _lake(f"select * from lake.{_q(table)} limit 3")
    cols = [{"name": r.column_name, "type": str(r.column_type), "sample": [str(x) for x in s[r.column_name].tolist()] if r.column_name in s else []} for r in d.itertuples() if not r.column_name.startswith("_dlt")]
    return {"table": table, "rows": n, "columns": cols[:80], "more_columns": max(0, len(cols) - 80)}


@db.tool(annotations=READ)
@_thread
def sample_rows(table: str, n: int = 5) -> dict:
    """A few rows of a table."""
    df = _lake(f"select * from lake.{_q(table)} limit {max(1, min(int(n), 20))}")
    df = df[[c for c in df.columns if not c.startswith("_dlt")]]
    return {"table": table, "columns": list(df.columns)[:40], "rows": df.iloc[:, :40].astype(str).values.tolist()}


@db.tool(annotations=READ)
@_thread
def query(sql: str) -> dict:
    """Run a read-only SQL query (SELECT or WITH) against the lake. Tables are in schema `lake`, e.g. select * from lake.station_states. At most 500 rows."""
    s = sql.strip().rstrip(";")
    if not re.match(r"^(select|with)\b", s, re.I) or _DENY_SQL.search(s) or ";" in s:
        raise ValueError("read-only: only a single SELECT/WITH statement is allowed")
    df = _lake(f"select * from ({s}) as q limit 500")
    return {"columns": list(df.columns), "rows": df.astype(str).values.tolist(), "row_count": len(df)}


# =================================================================== PCB / inspection
pcb = FastMCP("pcb-inspection", log_level="WARNING", instructions="Inspection and test data for printed-circuit-board lines: pass/fail per unit, process signals, SPC. Read-only.")
_INS = {}
_PASS = {"pass", "ok", "good", "passed"}
_FAIL = {"fail", "nok", "bad", "failed", "defect"}


def _find_inspection(prefer=None):
    key = prefer or ""
    hit = _INS.get(key)
    if hit and time.time() - hit[0] < 30:
        return hit[1]
    v = _scan_inspection(prefer)
    _INS[key] = (time.time(), v)
    return v


def _scan_inspection(prefer=None):
    from interpret import engine as E
    import pandas as pd
    out = []
    for t in E.lake_tables():
        if t.startswith("_dlt") or (prefer and t != prefer):
            continue
        try:
            df = _lake(f"select * from lake.{_q(t)} limit 20000")
        except Exception:
            continue
        for c in df.columns:
            if pd.api.types.is_string_dtype(df[c]):
                vals = set(df[c].dropna().astype(str).str.lower().unique())
                if vals and vals <= (_PASS | _FAIL) and len(vals) >= 2:
                    ts = next((x for x in df.columns if re.search(r"(^|_)(ts|time|at|date)($|_)|_at$|time", x)), None)
                    ident = next((x for x in df.columns if re.search(r"unit|serial|board|panel|sn$|^id$", x)), None)
                    out.append({"table": t, "result": c, "ts": ts, "id": ident, "df": df})
                    break
    return out


def _ins(table=None):
    found = _find_inspection(table)
    if not found:
        raise ValueError("no inspection table with a pass/fail result per unit is connected")
    return found[0]


@pcb.tool(annotations=READ)
@_thread
def list_inspection_tables() -> dict:
    """Tables that look like inspection or test results (a pass/fail verdict per unit), with unit counts and fail rate."""
    return {"tables": [{"table": f["table"], "result_column": f["result"], "timestamp_column": f["ts"], "unit_column": f["id"], "units": len(f["df"]),
                        "fail_rate": round(float(f["df"][f["result"]].astype(str).str.lower().isin(_FAIL).mean()), 4)} for f in _find_inspection()]}


@pcb.tool(annotations=READ)
@_thread
def fail_rate(table: str = "", by: str = "week") -> dict:
    """Failed-inspection rate over time (by = day or week) or by a station/line column if one exists (by = station)."""
    import pandas as pd
    f = _ins(table or None)
    df = f["df"].copy()
    df["_fail"] = df[f["result"]].astype(str).str.lower().isin(_FAIL)
    if by in ("day", "week") and f["ts"]:
        key = pd.to_datetime(df[f["ts"]]).dt.to_period("D" if by == "day" else "W").astype(str)
    elif by == "station":
        col = next((c for c in df.columns if re.search(r"station|line|machine|stage", c)), None)
        if not col:
            raise ValueError("no station/line column in this table")
        key = df[col].astype(str)
    else:
        raise ValueError("by must be day, week or station")
    g = df.groupby(key)["_fail"].agg(["mean", "size"])
    return {"table": f["table"], "by": by, "overall_fail_rate": round(float(df["_fail"].mean()), 4), "series": [{"key": k, "fail_rate": round(float(r["mean"]), 4), "units": int(r["size"])} for k, r in g.iterrows()][-60:]}


@pcb.tool(annotations=READ)
@_thread
def top_signals(table: str = "", n: int = 8) -> dict:
    """Process signals ranked by how well they separate failing units from passing ones (rank AUC; 0.5 means no information)."""
    import pandas as pd
    f = _ins(table or None)
    df = f["df"]
    fail = df[f["result"]].astype(str).str.lower().isin(_FAIL).to_numpy()
    rows = []
    for c in df.columns:
        if c in (f["result"], f["ts"], f["id"]) or not pd.api.types.is_numeric_dtype(df[c]):
            continue
        v = pd.to_numeric(df[c], errors="coerce")
        ok = v.notna().to_numpy()
        if ok.sum() < 100 or v[ok].nunique() < 4 or fail[ok].sum() < 5:
            continue
        r = v[ok].rank().to_numpy()
        m1, m0 = int(fail[ok].sum()), int((~fail[ok]).sum())
        auc = (r[fail[ok]].sum() - m1 * (m1 + 1) / 2) / (m1 * m0)
        rows.append({"signal": c, "auc": round(float(auc), 3), "direction": "higher in fails" if auc > .5 else "lower in fails", "strength": round(abs(float(auc) - .5) * 2, 3)})
    rows.sort(key=lambda x: -x["strength"])
    return {"table": f["table"], "units": len(df), "fails": int(fail.sum()), "signals_ranked": len(rows), "top": rows[:max(1, min(int(n), 25))]}


@pcb.tool(annotations=READ)
@_thread
def spc(signal: str, table: str = "") -> dict:
    """Statistical process control for one signal: mean, sigma, 3-sigma limits computed on the first half of the data, and how many later points fall outside them (an out-of-control drift check)."""
    import pandas as pd
    f = _ins(table or None)
    df = f["df"]
    if signal not in df.columns:
        raise ValueError(f"no signal {signal}")
    if f["ts"]:
        df = df.sort_values(f["ts"])
    v = pd.to_numeric(df[signal], errors="coerce").dropna().reset_index(drop=True)
    h = len(v) // 2
    base = v[:h]
    mu, sd = float(base.mean()), float(base.std() or 1e-9)
    later = v[h:]
    out = ((later > mu + 3 * sd) | (later < mu - 3 * sd))
    return {"signal": signal, "points": len(v), "baseline_mean": round(mu, 4), "baseline_sigma": round(sd, 4), "ucl": round(mu + 3 * sd, 4), "lcl": round(mu - 3 * sd, 4),
            "later_points_outside_limits": int(out.sum()), "share_outside": round(float(out.mean()), 4) if len(out) else 0.0}


@pcb.tool(annotations=READ)
@_thread
def get_unit(unit_id: str, table: str = "") -> dict:
    """The inspection record of one unit (board/panel serial): its verdict and its strongest readings."""
    f = _ins(table or None)
    if not f["id"]:
        raise ValueError("this table has no unit/serial column")
    df = f["df"]
    row = df[df[f["id"]].astype(str) == str(unit_id)]
    if not len(row):
        return {"found": False}
    r = row.iloc[0].to_dict()
    return {"found": True, "unit": unit_id, "result": r[f["result"]], "timestamp": str(r.get(f["ts"])) if f["ts"] else None, "readings": {k: v for k, v in list(r.items())[:14]}}


# =================================================================== machine and service telemetry
tel = FastMCP("telemetry", log_level="WARNING", instructions="Machine states and forecasts, and service metrics, logs and traces around an incident. Read-only.")


@tel.tool(annotations=READ)
@_thread
def list_stations() -> dict:
    """The stations on the factory floor with current state, failure count and chance of failing in the next 4 hours."""
    from workspace import twin as T
    return {"stations": [{"name": s["name"], "state": s["state"], "failures": s.get("failures"), "p_fail_4h": s.get("p_fail"), "data_from": [b["table"] for b in s.get("binds", [])]} for s in T.build()["stations"]]}


@tel.tool(annotations=READ)
@_thread
def station_history(station: str, minutes: int = 30) -> dict:
    """Recent state of one station (busy, idle, failed segments) and its latest events."""
    from workspace import twin as T
    st = next((s for s in T.build()["stations"] if s["name"].lower() == station.lower() or s["id"].lower() == station.lower()), None)
    if not st:
        raise ValueError("no such station")
    lv = T.live(st["id"], minutes)
    return {"station": st["name"], "share": lv.get("share"), "events": lv.get("events"), "window": lv.get("window")}


@tel.tool(annotations=READ)
@_thread
def failure_episodes(station: str, hours: float = 24) -> dict:
    """Failure episodes of one station in the last N hours of log time: start, duration, the states just before it, and which other stations failed within five minutes before or two minutes after."""
    from physical import service as PH, reliability as REL
    seg = PH.recent_window(float(hours))
    ep = REL.episodes(seg)
    key = next((a for a in ep if str(a).lower() == station.lower()), None)
    if key is None:
        raise ValueError("no such station")
    labels = PH.CFG.get("labels", {})
    g = seg[seg.asset == key]
    out = []
    for (s, e) in ep[key]["failures"]:
        before = g[g.ts < s].tail(6)
        near = []
        for a, f in ep.items():
            if a == key:
                continue
            for (s2, e2) in f["failures"]:
                dt = (s2 - s).total_seconds()
                if -300 <= dt <= 120:
                    near.append({"station": a, "starts_relative_s": round(dt), "duration_s": round((e2 - s2).total_seconds(), 1)})
        out.append({"start": str(s), "end": str(e), "duration_s": round((e - s).total_seconds(), 1), "states_before": [labels.get(int(x), str(x)) for x in before.status], "other_stations_failing_nearby": near})
    ttr = ep[key]["ttr"]
    return {"station": key, "window_hours": float(hours), "failures": len(out), "mean_ttr_s": round(sum(ttr) / len(ttr), 1) if ttr else None, "episodes": out[-6:]}


@tel.tool(annotations=READ)
@_thread
def fleet_failures(hours: float = 6) -> dict:
    """Machine failures in the last N hours of log time, per asset."""
    from physical import service as PH, reliability as REL
    seg = PH.recent_window(float(hours))
    ep = REL.episodes(seg)
    return {"window_hours": hours, "failures": {a: len(e["failures"]) for a, e in ep.items()}}


def _case_probe(name):
    def run(case: str, top_k: int = 6) -> dict:
        from rca import agent as AG
        out = AG.probe_cached(case, name)
        return {**out, "ranked": out["ranked"][:int(top_k)]}
    return run


@tel.tool(annotations=READ, name="case_info")
@_thread
def case_info(case: str) -> dict:
    """What telemetry exists for an incident case (metrics, logs, traces), its system and window."""
    from rca import data as D
    r = D.case_row(case)
    cov = D.coverage(case)
    return {"system": r["system_name"], "telemetry_available": {"metrics": True, "logs": cov in ("ml", "mlt"), "traces": cov == "mlt"}, "window_minutes": r["duration_minutes"],
            "alert_time_is_fault_onset": True, "services_in_metrics": sorted(D.services_of(D.metrics(case)))}


tel.tool(annotations=READ, name="metric_anomalies", description="Rank services by how far their metrics moved after the alert time versus before. Returns the series behind each rank.")(_thread(_case_probe("metrics")))
tel.tool(annotations=READ, name="trace_anomalies", description="Rank services by change in error rate and p90 latency in distributed traces after the alert time. Only systems that record traces.")(_thread(_case_probe("traces")))
tel.tool(annotations=READ, name="log_anomalies", description="Rank services by rise in error-like log lines after the alert time, with the most common messages. Only systems that record logs.")(_thread(_case_probe("logs")))


@tel.tool(annotations=READ, name="log_messages")
@_thread
def log_messages(case: str, service: str, n: int = 6) -> dict:
    """Distinct error-like and brand-new log messages of one service after the alert time."""
    from rca import probes as P
    return P.log_messages(case, service, int(n))


@tel.tool(annotations=READ, name="service_neighbors")
@_thread
def service_neighbors(case: str, service: str) -> dict:
    """Which services a service calls and which call it, from the reviewed dependency graph."""
    from rca import data as D
    from fabric import gateway as G
    sysid = D.case_row(case)["system"]
    e = G.GRAPH["edges"].get(sysid, {})
    if not e:
        return {"note": "no call graph is known for this system (it records no traces)"}
    return {"service": service, "calls": sorted({b for (x, b) in e if x == service}), "called_by": sorted({x for (x, b) in e if b == service})}


# =================================================================== OPC UA
opc = FastMCP("opc-ua", log_level="WARNING", instructions="Read-only OPC UA client for line controllers. Connects to the endpoint set in TOLERANCE_OPCUA (default: the sample plant).")


def _endpoint():
    import os
    from fabric import gateway as G
    return os.environ.get("TOLERANCE_OPCUA") or G.OPCUA


@opc.tool(annotations=READ)
async def opcua_status() -> dict:
    """Whether the OPC UA endpoint answers, and its address."""
    from asyncua import Client
    ep = _endpoint()
    try:
        async with Client(ep, timeout=3):
            return {"endpoint": ep, "connected": True}
    except Exception as e:
        return {"endpoint": ep, "connected": False, "error": f"{type(e).__name__}: {str(e)[:100]}"}


@opc.tool(annotations=READ)
async def opcua_browse(depth: int = 2) -> dict:
    """Browse the address space under Objects (two levels by default)."""
    from asyncua import Client
    ep = _endpoint()
    async with Client(ep, timeout=5) as c:
        async def walk(n, d):
            out = []
            for ch in await n.get_children():
                name = (await ch.read_browse_name()).Name
                item = {"name": name}
                if d > 1:
                    item["children"] = await walk(ch, d - 1)
                out.append(item)
            return out
        return {"endpoint": ep, "nodes": await walk(c.nodes.objects, max(1, min(int(depth), 4)))}


@opc.tool(annotations=READ)
async def opcua_read(path: str) -> dict:
    """Read the variables under a node. path is browse names separated by '/', e.g. 'Line1/Station3'."""
    from asyncua import Client
    ep = _endpoint()
    async with Client(ep, timeout=5) as c:
        node = c.nodes.objects
        for part in [p for p in path.split("/") if p]:
            found = None
            for ch in await node.get_children():
                if (await ch.read_browse_name()).Name == part:
                    found = ch
                    break
            if not found:
                raise ValueError(f"no node {part}")
            node = found
        vals = {}
        for v in await node.get_children():
            try:
                vals[(await v.read_browse_name()).Name] = str(await v.read_value())
            except Exception:
                pass
        return {"path": path, "variables": vals}


SERVERS = {"databases": (db, "Databases", "Every database, file and API connected to the plant. SELECT only."),
           "pcb": (pcb, "PCB and inspection", "Pass/fail per unit, process signals and SPC for electronics lines."),
           "telemetry": (tel, "Machine and service telemetry", "Machine states and forecasts; service metrics, logs and traces."),
           "opcua": (opc, "OPC UA", "Read-only access to line controllers.")}
