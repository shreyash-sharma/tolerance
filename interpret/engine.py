"""Interpretation: what the system believes about the data a person has connected.

Everything here is computed from the lake tables, whatever they are called. The output is a list of reviewable items, each with a
confidence and evidence, so a person can approve, correct or reject them. Gemini (when available) adds plain-language meaning;
the structure never depends on it."""
import hashlib, json, os, re
import numpy as np
import pandas as pd

from connectors import registry as CR

ID_RE = re.compile(r"^[A-Za-z]{1,8}[-_ ]?\d{2,}$")
HEX_RE = re.compile(r"^[0-9a-f]{8,}$")
_ANN_CACHE = {}


def lake_tables():
    df = CR.lake_query("select table_name from information_schema.tables where table_schema='lake' and table_name not like '\\_dlt%' escape '\\' order by 1")
    return list(df["table_name"])


def _q(name):
    return '"' + name.replace('"', '""') + '"'


def profile_table(t, sample=20000):
    cols = CR.lake_query(f"describe lake.{_q(t)}")
    n = int(CR.lake_query(f"select count(*) c from lake.{_q(t)}")["c"][0])
    out = {"table": t, "rows": n, "columns": []}
    sdf = CR.lake_query(f"select * from lake.{_q(t)} using sample {min(sample, max(n, 1))} rows") if n else pd.DataFrame()
    real = [c for _, c in cols.iterrows() if not c["column_name"].startswith("_dlt")]
    agg = None
    if n and real:
        agg = CR.lake_query("select " + ", ".join(f"count({_q(c['column_name'])}) as nn{i}, approx_count_distinct({_q(c['column_name'])}) as d{i}" for i, c in enumerate(real)) + f" from lake.{_q(t)}").iloc[0]
    for i, c in enumerate(real):
        name, typ = c["column_name"], str(c["column_type"])
        col = {"name": name, "type": typ, "nulls": 0, "distinct": 0, "samples": [], "role": "other"}
        if n:
            col["nulls"] = int(n - agg[f"nn{i}"])
            col["distinct"] = int(agg[f"d{i}"])
            vals = sdf[name].dropna() if name in sdf else pd.Series([], dtype=object)
            col["samples"] = [str(v) for v in vals.astype(str).unique()[:5]]
            col["role"] = _role(name, typ, vals, col["distinct"], n)
            if "int" in typ.lower() or "double" in typ.lower() or "float" in typ.lower() or "decimal" in typ.lower():
                col["min"], col["max"] = float(vals.min()) if len(vals) else None, float(vals.max()) if len(vals) else None
        out["columns"].append(col)
    return out


def _is_ts(vals):
    if not len(vals):
        return False
    s = vals.astype(str).head(200)
    if not s.str.match(r"^\d{4}-\d{2}-\d{2}").mean() > .9 and not s.str.match(r"^\d{9,10}(\.\d+)?$").mean() > .9:
        return False
    return True


def _role(name, typ, vals, distinct, n):
    low = typ.lower()
    if "timestamp" in low or "date" in low:
        return "timestamp"
    if "varchar" in low or "text" in low:
        if _is_ts(vals):
            return "timestamp"
        s = vals.astype(str).head(500)
        if len(s) and s.map(lambda v: bool(ID_RE.match(v))).mean() > .9 and distinct >= 5:
            return "identifier"
        if len(s) and s.map(lambda v: bool(HEX_RE.match(v))).mean() > .9 and distinct > .5 * n:
            return "key"
        if distinct <= max(60, 0.02 * n):
            return "category"
        if len(s) and s.str.startswith(("{", "[")).mean() > .8:
            return "json"
        return "text"
    if "int" in low:
        if distinct <= 12:
            return "code"
        if name in ("id", "seq", "rowid") or (distinct > .95 * n and n > 20):
            return "key"
        return "measure"
    if any(k in low for k in ("double", "float", "decimal", "real")):
        return "measure"
    if "bool" in low:
        return "flag"
    return "other"


def profile_all():
    return [profile_table(t) for t in lake_tables()]


# ------------------------------------------------------------------ roles of whole tables
def find_state_logs(profiles):
    out = []
    for p in profiles:
        cols = {c["name"]: c for c in p["columns"]}
        ts = [c["name"] for c in p["columns"] if c["role"] == "timestamp"]
        assets = [c["name"] for c in p["columns"] if c["role"] in ("category", "identifier") and 2 <= c["distinct"] <= 80 and c["name"] + "_code" not in cols]
        codes = [c["name"] for c in p["columns"] if c["role"] == "code" and 2 <= c["distinct"] <= 8]
        if ts and assets and codes and p["rows"] >= 200:
            out.append({"table": p["table"], "ts": ts[0], "asset": assets[0], "status": codes[0], "rows": p["rows"]})
    return out


def state_stats(sl):
    """Per status code: how common, how long each stay is, how many stays. Computed from the data (capped sample of the log)."""
    df = CR.lake_query(f"select {_q(sl['ts'])} ts, {_q(sl['asset'])} asset, {_q(sl['status'])} status from lake.{_q(sl['table'])} order by 1 limit 300000")
    df["ts"] = pd.to_datetime(df["ts"])
    rows = {}
    for a, g in df.groupby("asset"):
        g = g.reset_index(drop=True)
        dur = (g.ts.shift(-1) - g.ts).dt.total_seconds().fillna(0)
        for code, gg in g.assign(dur=dur).groupby("status"):
            r = rows.setdefault(int(code), {"code": int(code), "n": 0, "dur": [], "assets": set()})
            r["n"] += len(gg)
            r["dur"] += list(gg.dur[gg.dur > 0])
            r["assets"].add(a)
    total = sum(r["n"] for r in rows.values()) or 1
    out = []
    for code, r in sorted(rows.items()):
        d = np.array(r["dur"]) if r["dur"] else np.array([0.0])
        out.append({"code": code, "share": round(r["n"] / total, 4), "rows": r["n"], "mean_stay_s": round(float(d.mean()), 1), "assets": len(r["assets"])})
    return out


def propose_state_labels(stats):
    """Heuristic first guess: the rarest code is a failure if it is rare and the log has at least three codes; the most common is 'busy'; the rest idle."""
    labels, conf = {}, {}
    if not stats:
        return labels, conf
    by_share = sorted(stats, key=lambda s: s["share"])
    rare = by_share[0]
    for s in stats:
        labels[s["code"]], conf[s["code"]] = "idle", 0.5
    common = by_share[-1]
    labels[common["code"]], conf[common["code"]] = "busy", 0.55
    if len(stats) >= 3 and rare["share"] < 0.03:
        labels[rare["code"]], conf[rare["code"]] = "failed", round(min(.9, .55 + (0.03 - rare["share"]) * 10), 2)
    return labels, conf


# ------------------------------------------------------------------ identity and links
def _values(table, col, cap=20000):
    df = CR.lake_query(f"select distinct cast({_q(col)} as varchar) v from lake.{_q(table)} where {_q(col)} is not null limit {cap}")
    return set(df["v"])


def _shape(v):
    return re.sub(r"\d", "9", re.sub(r"[a-z]", "a", re.sub(r"[A-Z]", "A", str(v))))


def find_identity(profiles):
    ids = []
    for p in profiles:
        for c in p["columns"]:
            if c["role"] == "identifier":
                ids.append({"table": p["table"], "col": c["name"], "values": _values(p["table"], c["name"])})
    for i in ids:
        sh = {_shape(v) for v in list(i["values"])[:300]}
        i["shape"] = sorted(sh)[0] if len(sh) == 1 else "mixed"
    groups = []
    for a in ids:
        if a["shape"] == "mixed":
            continue
        placed = False
        for g in groups:
            if g["shape"] == a["shape"] and any(max(len(a["values"] & b["values"]) / max(1, len(a["values"])), len(a["values"] & b["values"]) / max(1, len(b["values"]))) >= .6 for b in g["members"]):
                g["members"].append(a)
                placed = True
                break
        if not placed:
            groups.append({"shape": a["shape"], "members": [a]})
    ents = []
    for g in groups:
        if len(g["members"]) < 2:
            continue
        cont = []
        for a in g["members"]:
            for b in g["members"]:
                if a is not b:
                    cont.append(len(a["values"] & b["values"]) / max(1, len(a["values"])))
        ents.append({"shape": g["shape"], "fields": sorted(f"{m['table']}.{m['col']}" for m in g["members"]), "example": sorted(g["members"][0]["values"])[0],
                     "confidence": round(float(np.mean(cont)), 2) if cont else .5})
    mixed = [{"field": f"{i['table']}.{i['col']}", "examples": sorted(list(i["values"]))[:3], "shapes": sorted({_shape(v) for v in list(i["values"])[:300]})} for i in ids if i["shape"] == "mixed"]
    return ents, mixed, ids


def find_links(ids):
    """Inclusion dependencies between identifier columns of different tables: a likely foreign key. Identical sets are reported once, as the same set."""
    out, seen = [], set()
    for a in ids:
        for b in ids:
            if a is b or a["table"] == b["table"] or a["shape"] != b["shape"] or a["shape"] == "mixed":
                continue
            ca = len(a["values"] & b["values"]) / max(1, len(a["values"]))
            cb = len(a["values"] & b["values"]) / max(1, len(b["values"]))
            if ca >= .85 and cb >= .85:  # the same set of identifiers on both sides
                key = tuple(sorted([f"{a['table']}.{a['col']}", f"{b['table']}.{b['col']}"]))
                if key not in seen:
                    seen.add(key)
                    out.append({"from": key[0], "to": key[1], "containment": round(min(ca, cb), 3), "shared": len(a["values"] & b["values"]), "kind": "same set"})
            elif ca >= .85 and len(b["values"]) >= len(a["values"]):
                out.append({"from": f"{a['table']}.{a['col']}", "to": f"{b['table']}.{b['col']}", "containment": round(ca, 3), "shared": len(a["values"] & b["values"]), "kind": "references"})
    return out


# ------------------------------------------------------------------ Gemini meaning (optional, cached)
def annotate(profiles, state_logs, entities):
    from fabric.agents import gemini_available, make_client, gen_with_retry
    payload = {"tables": [{"table": p["table"], "rows": p["rows"], "columns": [{"name": c["name"], "type": c["type"], "role": c["role"], "samples": c["samples"][:3]} for c in p["columns"]]} for p in profiles],
               "state_logs": state_logs, "entities": [{"fields": e["fields"], "example": e["example"]} for e in entities]}
    key = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    if key in _ANN_CACHE:
        return _ANN_CACHE[key]
    out = {"by": "heuristic", "tables": {}, "entities": [], "state_notes": ""}
    for p in profiles:
        out["tables"][p["table"]] = {"purpose": _heuristic_purpose(p)}
    for e in entities:
        out["entities"].append(_heuristic_entity(e))
    if gemini_available() and profiles:
        try:
            from google.genai import types
            prompt = ("You are interpreting a manufacturing company's data for an operator to review. Using only the profile below, answer JSON: "
                      '{"tables": {"<table>": {"purpose": "<one sentence>"}}, "entities": ["<UPPER_SNAKE_CASE class name per entity group, same order>"], '
                      '"state_notes": "<one sentence on what the status codes in the state logs probably mean, or empty>"}. Be modest: say "unclear" when unsure.\n' + json.dumps(payload, default=str)[:24000])
            r = gen_with_retry(make_client(), tries=3, max_wait=8, model=os.environ.get("TOLERANCE_NAMING_MODEL") or "gemini-3.1-flash-lite", contents=prompt,
                               config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0))
            g = json.loads(r.text)
            for t, v in (g.get("tables") or {}).items():
                if t in out["tables"] and isinstance(v, dict) and v.get("purpose"):
                    out["tables"][t]["purpose"] = v["purpose"]
            if isinstance(g.get("entities"), list) and len(g["entities"]) == len(entities):
                out["entities"] = [str(x) for x in g["entities"]]
            out["state_notes"] = g.get("state_notes") or ""
            out["by"] = "gemini"
        except Exception as e:
            out["error"] = f"{type(e).__name__}: {str(e)[:120]}"
    _ANN_CACHE[key] = out
    return out


def _heuristic_purpose(p):
    roles = {c["role"] for c in p["columns"]}
    names = " ".join(c["name"] for c in p["columns"])
    if {"timestamp", "category", "code"} <= roles:
        return "A time-ordered log of state changes per asset."
    if "span_id" in names or "trace_id" in names:
        return "Distributed-trace spans: which services called which."
    if "timestamp" in roles:
        return "A time-ordered event log."
    if "identifier" in roles or "key" in roles:
        return "A table of records keyed by identifiers."
    return "A table of attributes."


def _heuristic_entity(e):
    low = " ".join(e["fields"]).lower()
    for name, toks in (("PCB", ("pcb", "board")), ("BATTERY_PACK", ("pack",)), ("VEHICLE", ("vin", "vehicle")), ("BMS", ("bms",)), ("MANUFACTURING_ORDER", ("mo", "order")), ("DEVICE", ("device", "tdev"))):
        if any(t in low for t in toks):
            return name
    return "ENTITY_" + re.sub(r"\W", "", e["shape"])[:6]
