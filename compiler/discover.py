"""Discovery connectors. Each reads one real interface of the plant and returns evidence records.

Evidence record: {"id", "source", "kind", "claim": {...}, "detail": str}
Nothing here knows the plant's topology. Everything is read through an interface a customer would grant:
an OpenAPI document, an OPC UA browse, function manifests, the document store's schema and samples, and traces."""
import asyncio, glob, json, os, re
import httpx

_EID = [0]


def ev(source, kind, claim, detail=""):
    _EID[0] += 1
    return {"id": f"E{_EID[0]:04d}", "source": source, "kind": kind, "claim": claim, "detail": detail}


# ------------------------------------------------------------------ OpenAPI
def from_openapi(base_url):
    spec = httpx.get(base_url + "/openapi.json", timeout=10).json()
    out = [ev("openapi", "api", {"api": "erp", "title": spec["info"]["title"]}, spec["info"].get("description", ""))]
    for path, ops in spec["paths"].items():
        for method, op in ops.items():
            out.append(ev("openapi", "operation", {"api": "erp", "method": method.upper(), "path": path, "summary": op.get("summary", "")}, f"{method.upper()} {path}"))
    for name, sch in spec.get("components", {}).get("schemas", {}).items():
        for field in sch.get("properties", {}):
            out.append(ev("openapi", "schema_field", {"api": "erp", "schema": name, "field": field}, f"{name}.{field}"))
    return out


# ------------------------------------------------------------------ OPC UA
async def _browse(endpoint):
    from asyncua import Client
    out = []
    async with Client(endpoint, timeout=10) as c:
        line = await c.nodes.objects.get_child(["2:Line1"])
        for group in await line.get_children():
            gname = (await group.read_browse_name()).Name
            for obj in await group.get_children():
                oname = (await obj.read_browse_name()).Name
                vars_ = {}
                for v in await obj.get_children():
                    vars_[(await v.read_browse_name()).Name] = await v.read_value()
                out.append((gname, oname, vars_))
    return out


def from_opcua(endpoint):
    out = []
    for group, name, vars_ in asyncio.run(_browse(endpoint)):
        kind = "station" if group == "Stations" else "device"
        out.append(ev("opcua", kind, {"id": name, "group": group, "variables": sorted(vars_)}, f"{group}/{name}: " + ", ".join(f"{k}={v}" for k, v in vars_.items())))
        for k, val in vars_.items():
            if isinstance(val, str) and re.match(r"^[A-Z]{2,4}-?\d+$", val):
                out.append(ev("opcua", "sample", {"field": f"opcua.{name}.{k}", "values": [val]}, f"{name}.{k}={val}"))
    return out


# ------------------------------------------------------------------ function manifests
def from_manifests(root):
    out = []
    for path in sorted(glob.glob(os.path.join(root, "*", "function.json"))):
        fn = os.path.basename(os.path.dirname(path))
        m = json.load(open(path))
        out.append(ev("manifest", "function", {"fn": fn, "owner": m.get("owner")}, m.get("note") or f"function manifest for {fn}, owner {m.get('owner')}"))
        for b in m["bindings"]:
            t = b["type"]
            if t == "queueTrigger":
                out.append(ev("manifest", "declared_edge", {"src": f"queue:{b['queueName']}", "dst": f"fn:{fn}", "type": "triggers"}, f"{fn} trigger {b['queueName']}"))
            elif t == "queue":
                out.append(ev("manifest", "declared_edge", {"src": f"fn:{fn}", "dst": f"queue:{b['queueName']}", "type": "publishes"}, f"{fn} outputs to {b['queueName']}"))
            elif t == "docstore":
                if b["direction"] == "in":
                    out.append(ev("manifest", "declared_edge", {"src": f"coll:{b['collection']}", "dst": f"fn:{fn}", "type": "reads"}, f"{fn} reads {b['collection']}"))
                else:
                    out.append(ev("manifest", "declared_edge", {"src": f"fn:{fn}", "dst": f"coll:{b['collection']}", "type": "writes"}, f"{fn} writes {b['collection']}"))
            elif t == "http":
                out.append(ev("manifest", "declared_edge", {"src": f"fn:{fn}", "dst": f"api:{b['api']}", "type": "calls"}, f"{fn} calls {b['api']}"))
    return out


# ------------------------------------------------------------------ document store (read-only schema + samples)
def from_docstore(store, skip_prefixes=("erp_",)):
    out = []
    for coll in store.collections():
        if coll.startswith(skip_prefixes):
            continue  # another system's private storage: reached only through its own API
        docs = store.find(coll, limit=400)
        out.append(ev("docstore", "collection", {"coll": coll, "rows": len(docs)}, f"{coll}: {len(docs)} documents"))
        if any("type" in d for d in docs):
            by = {}
            for d in docs:
                by.setdefault(d.get("type"), []).append(d)
            for t, ds in sorted(by.items(), key=lambda kv: min(d.get("ts", 0) for d in kv[1])):
                names = list(dict.fromkeys(k for d in ds for k in d))
                out.append(ev("docstore", "doctype", {"coll": coll, "type": t, "fields": names, "first_ts": min(d.get("ts", 0) for d in ds), "rows": len(ds)}, f"{coll}[{t}]: {len(ds)} docs, fields {', '.join(names)}"))
        fields = {}
        for d in docs:
            for k, v in d.items():
                fields.setdefault(k, set()).add(v if isinstance(v, (str, int, float)) else str(v))
        for k, vals in fields.items():
            sv = sorted(map(str, vals))
            out.append(ev("docstore", "sample", {"field": f"{coll}.{k}", "values": sv[:400], "distinct": len(vals)}, f"{coll}.{k}: {len(vals)} distinct values"))
    return out


def from_erp_samples(base_url):
    """Read-only API samples of the ERP's genealogy payloads (the values behind its OpenAPI field names)."""
    out = []
    rows = httpx.get(base_url + "/manufacturing-orders", timeout=10).json()
    cols = {}
    for r in rows:
        g = r.get("genealogy") or {}
        for k, v in g.items():
            cols.setdefault(k, set()).add(str(v))
        cols.setdefault("mo", set()).add(r["mo"])
    for k, vals in cols.items():
        out.append(ev("erp-api", "sample", {"field": f"erp.{k}", "values": sorted(vals)[:400], "distinct": len(vals)}, f"erp.{k}: {len(vals)} distinct values"))
    return out


# ------------------------------------------------------------------ traces
def from_traces(path):
    spans = [json.loads(l) for l in open(path) if l.strip()]
    out = []
    agg = {}

    def edge(src, dst, typ, s):
        a = agg.setdefault((src, dst, typ), {"n": 0, "err": 0, "ex": None, "services": set()})
        a["n"] += 1
        a["services"].add(s["service"])
        if s["status"] == "ERROR":
            a["err"] += 1
            a["ex"] = a["ex"] or next((e["message"] for e in s["events"]), None)

    def node_of(service):
        if service.startswith("fn-"):
            return f"fn:{service}"
        if service == "telemetry-gw":
            return "device:telemetry-gw"
        if service == "station-sw":
            return None
        return f"svc:{service}"

    for s in spans:
        a = s["attributes"]
        me = node_of(s["service"])
        if "tol.trigger" in a and me:
            q = a["tol.trigger"].split(":", 1)[1]
            edge(f"queue:{q}", me, "triggers", s)
        if "messaging.destination" in a:
            q = f"queue:{a['messaging.destination']}"
            if a.get("tol.station"):
                edge(f"station:{a['tol.station']}", q, "publishes", s)
            elif me:
                edge(me, q, "publishes", s)
        if "db.collection" in a and me:
            c = f"coll:{a['db.collection']}"
            if a["db.operation"] == "write":
                edge(me, c, "writes", s)
            else:
                edge(c, me, "reads", s)
        if "tol.api" in a and me:
            edge(me, f"api:{a['tol.api']}", "calls", s)
    for (src, dst, typ), v in sorted(agg.items()):
        out.append(ev("traces", "observed_edge", {"src": src, "dst": dst, "type": typ, "count": v["n"], "errors": v["err"], "last_error": v["ex"]},
                      f"{typ}: {src} -> {dst} ({v['n']} spans, {v['err']} errors)"))
    return out, spans


def discover_all(erp_url, opcua_endpoint, manifests_dir, store, trace_path):
    evs = []
    evs += from_openapi(erp_url)
    evs += from_opcua(opcua_endpoint)
    evs += from_manifests(manifests_dir)
    evs += from_docstore(store)
    evs += from_erp_samples(erp_url)
    t, spans = from_traces(trace_path)
    evs += t
    return evs, spans
