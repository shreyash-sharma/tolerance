"""Knowledge compilation: evidence -> a typed, versioned Operational Intermediate Representation (OIR).

Rules: an edge enters the graph only if it is observed at runtime. Declared-only edges and under-determined identifiers
go to the uncertainty list instead of being asserted. Every node and edge keeps the evidence ids that support it."""
import hashlib, json, re, time
import networkx as nx

LAYER = {"station": "physical", "device": "physical", "queue": "event", "fn": "application", "coll": "data", "api": "enterprise", "svc": "application"}
FLOW_TYPES = {"publishes", "triggers", "writes", "reads", "calls"}


def shape(v):
    return re.sub(r"\d", "9", re.sub(r"[a-z]", "a", re.sub(r"[A-Z]", "A", str(v))))


def jaccard(a, b):
    return len(a & b) / max(1, len(a | b))


def contain(a, b):
    return len(a & b) / max(1, len(a))


def compile_oir(evs, namer=None):
    G = nx.DiGraph()
    uncertainty = []

    def node(nid, **kw):
        if nid not in G:
            kind = nid.split(":", 1)[0]
            G.add_node(nid, kind=kind, layer=LAYER.get(kind, "other"), label=nid.split(":", 1)[1], evidence=[], attrs={})
        G.nodes[nid]["evidence"] += kw.pop("ev", [])
        G.nodes[nid]["attrs"].update(kw)

    # ---- structural nodes from interfaces
    for e in evs:
        c = e["claim"]
        if e["kind"] == "station":
            node(f"station:{c['id']}", ev=[e["id"]], vars=c["variables"])
        elif e["kind"] == "device":
            node(f"device:{c['id']}", ev=[e["id"]], vars=c["variables"])
        elif e["kind"] == "function":
            node(f"fn:{c['fn']}", ev=[e["id"]], owner=c.get("owner"))
        elif e["kind"] == "collection":
            node(f"coll:{c['coll']}", ev=[e["id"]], rows=c["rows"])
        elif e["kind"] == "api":
            node("api:erp", ev=[e["id"]], title=c["title"])
        elif e["kind"] == "operation":
            node("api:erp", ev=[e["id"]])
            G.nodes["api:erp"]["attrs"].setdefault("operations", []).append(f"{c['method']} {c['path']}")

    # ---- edges: observed at runtime are asserted; declared-only are contradictions
    observed = {}
    for e in evs:
        if e["kind"] == "observed_edge":
            c = e["claim"]
            observed[(c["src"], c["dst"], c["type"])] = e
    declared = {}
    for e in evs:
        if e["kind"] == "declared_edge":
            c = e["claim"]
            declared[(c["src"], c["dst"], c["type"])] = e
    for key, e in observed.items():
        src, dst, typ = key
        node(src); node(dst)
        ev_ids = [e["id"]] + ([declared[key]["id"]] if key in declared else [])
        G.add_edge(src, dst, type=typ, evidence=ev_ids, count=e["claim"]["count"], errors=e["claim"]["errors"], last_error=e["claim"]["last_error"],
                   status="confirmed" if key in declared else "observed-undeclared", confidence=0.97 if key in declared else 0.85)
        if key not in declared and src.split(":")[0] not in ("station", "device"):
            uncertainty.append({"kind": "undeclared_dependency", "subject": f"{src} -> {dst} ({typ})", "evidence": [e["id"]],
                                "note": "seen in traces but absent from any manifest; kept, flagged for owner confirmation"})
    for key, e in declared.items():
        if key not in observed:
            uncertainty.append({"kind": "declared_not_observed", "subject": f"{key[0]} -> {key[1]} ({key[2]})", "evidence": [e["id"]],
                                "note": "declared in a manifest but never observed at runtime; not added to the graph"})

    # ---- entity resolution over sampled field values
    fields = {}
    for e in evs:
        if e["kind"] == "sample":
            c = e["claim"]
            fields[c["field"]] = {"values": set(map(str, c["values"])), "ev": e["id"]}
    ids = {f: d for f, d in fields.items() if d["values"] and all(re.match(r"^[A-Z]{2,4}-?\d+$", v) for v in d["values"]) and len(d["values"]) > 1}
    # identifier-shaped fields: group by value-shape prefix, then by value overlap
    byshape = {}
    for f, d in ids.items():
        shapes = {shape(v) for v in d["values"]}
        if len(shapes) == 1:
            byshape.setdefault(next(iter(shapes)), []).append(f)
    entities = []
    for sh, fs in sorted(byshape.items()):
        # connected components under containment >= 0.6
        comp = []
        for f in fs:
            placed = False
            for grp in comp:
                if any(max(contain(ids[f]["values"], ids[g]["values"]), contain(ids[g]["values"], ids[f]["values"])) >= 0.6 for g in grp):
                    grp.append(f); placed = True; break
            if not placed:
                comp.append([f])
        for grp in comp:
            if len(grp) > 1:
                entities.append({"shape": sh, "fields": sorted(grp), "example": sorted(ids[grp[0]]["values"])[0], "evidence": [ids[f]["ev"] for f in sorted(grp)]})
    # ambiguous fields: identifier-like but mixed shapes
    for f, d in fields.items():
        shapes = {}
        for v in d["values"]:
            shapes.setdefault(shape(v), []).append(v)
        if len(shapes) > 1 and all(re.match(r"^[A-Z]{2,4}-?\d+$", v) for v in d["values"]):
            rank = []
            for sh, vals in shapes.items():
                m = next((en for en in entities if en["shape"] == sh), None)
                rank.append({"shape": sh, "share": round(len(vals) / len(d["values"]), 2), "maps_to": (m or {}).get("fields", [None])[0], "example": vals[0]})
            uncertainty.append({"kind": "ambiguous_identifier", "subject": f, "evidence": [d["ev"]], "candidates": rank,
                                "note": "one field holds more than one kind of identifier; mapping withheld until a person or a documented rule resolves it"})

    # ---- classify entity classes (names are semantic; supplied by a namer such as Gemini, with an offline fallback)
    names = (namer or (lambda ens: [en["shape"] for en in ens]))(entities)
    for en, nm in zip(entities, names):
        en["class"] = nm
    field_class = {f: en["class"] for en in entities for f in en["fields"]}

    # ---- identity links: entity classes that appear together in one document type, ordered by when each type first appears
    doctypes = sorted([e for e in evs if e["kind"] == "doctype"], key=lambda e: e["claim"]["first_ts"])
    links, chain, seen = [], [], set()
    for e in doctypes:
        c = e["claim"]
        cls = []
        for fname in c["fields"]:
            k = field_class.get(f"{c['coll']}.{fname}")
            if k and k not in cls:
                cls.append(k)
        for i, a in enumerate(cls):
            for b in cls[i + 1:]:
                links.append({"a": a, "b": b, "via": f"{c['coll']}[{c['type']}]", "evidence": [e["id"]]})
        for k in cls:
            if k not in seen:
                seen.add(k); chain.append(k)
        for fname in c["fields"]:
            if fname in ("fw_version", "firmware") and "FIRMWARE" not in seen:
                seen.add("FIRMWARE"); chain.append("FIRMWARE")

    spec = {"nodes": [{"id": n, **{k: (sorted(v) if isinstance(v, set) else v) for k, v in d.items()}} for n, d in G.nodes(data=True)],
            "edges": [{"src": a, "dst": b, **d} for a, b, d in G.edges(data=True)]}
    version = hashlib.sha256(json.dumps(spec, sort_keys=True, default=str).encode()).hexdigest()[:12]
    return {"version": version, "compiled_at": int(time.time()), "graph": G, "spec": spec, "entities": entities, "uncertainty": uncertainty,
            "identity_links": links, "entity_chain": chain, "stats": {"nodes": G.number_of_nodes(), "edges": G.number_of_edges(), "uncertain": len(uncertainty), "entities": len(entities)}}


def flow_graph(G):
    """Directed data-flow view: reads point from the collection to the function that reads it."""
    return G  # edges are already stored in data-flow direction


def blast(G, nid):
    return {"upstream": sorted(nx.ancestors(G, nid)), "downstream": sorted(nx.descendants(G, nid))}
