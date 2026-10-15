"""The data feeds of the plant, for the floor: each connected system (MES, MongoDB, ERP, IoT...), how fresh it is, and which stations it carries data for.
A system feeds a station when a column of its tables holds that station's name. Answers are kept for 20 seconds, per visitor."""
import time

from workspace import store, sources as SRC
from interpret import engine as E
from connectors import registry as CR

_C = {}


def _q(name):
    return '"' + name.replace('"', '""') + '"'


def _table_stations(table, names):
    """Station names found in the text columns of one table (names is {lowercase: real name})."""
    found = set()
    try:
        cols = CR.lake_query(f"describe lake.{_q(table)}")
        for _, c in cols.iterrows():
            if "VARCHAR" not in str(c["column_type"]).upper() or str(c["column_name"]).startswith("_dlt"):
                continue
            df = CR.lake_query(f"select distinct {_q(c['column_name'])} v from lake.{_q(table)} limit 400")
            for v in df["v"].dropna():
                hit = names.get(str(v).strip().lower())
                if hit:
                    found.add(hit)
    except Exception:
        pass
    return found


def feeds(twin):
    key = store.UID.get()
    srcs = store.load()["sources"]
    sig = (len(twin.get("stations", [])), tuple((x["id"], bool(x.get("error")), x.get("syncs", 0) > 0) for x in srcs))   # a new source or station shows at once
    hit = _C.get(key)
    if hit and hit[2] == sig and time.time() - hit[0] < 20:
        return hit[1]
    names = {}
    for s in twin.get("stations", []):
        if s.get("ghost") or str(s["id"]).startswith("ghost:"):
            continue
        names[s["name"].lower()] = s["name"]
        if s.get("asset"):
            names[str(s["asset"]).lower()] = s["name"]
    out = []
    for s in srcs:
        tables = list((s.get("tables") or {}).keys())
        fed = set()
        for t in tables:
            fed |= _table_stations(t, names)
        for st in twin.get("stations", []):
            if any(b["table"] in tables for b in st.get("binds", [])):
                fed.add(st["name"])
        sysid = SRC.system_of(s)
        age = round(time.time() - s["last"], 1) if s.get("last") else None
        out.append({"id": s["id"], "name": s["name"], "system": sysid, "system_name": SRC.SYSTEMS[sysid][0], "tables": tables, "rows": s.get("rows", 0), "age_s": age,
                    "error": s.get("error"), "status": "error" if s.get("error") else ("waiting" if not s.get("syncs") else "live"), "stations": sorted(fed)})
    _C[key] = (time.time(), out, sig)
    return out
