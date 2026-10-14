"""Compile the discovered graph into enforceable boundaries.

Output:
  * trust domains and the tools each may use (derived from what the graph says exists)
  * Cedar policies (default-deny) that the tool gateway really enforces
  * an MCP-Toolbox-style tools.yaml (generated artifact; the demo enforces the Cedar form in-process)
  * an Asset Administration Shell export of the physical assets (Eclipse BaSyx SDK)
A person approves these. The model cannot grant itself anything."""
import json

DOMAINS = {
    "data": {"title": "Data domain", "mode": "read only", "tools": ["query_collection"], "agents": ["rca"]},
    "application": {"title": "Application domain", "mode": "restricted tools", "tools": ["read_traces", "queue_status", "dead_letters", "erp_get_order"], "agents": ["rca"]},
    "industrial": {"title": "Industrial domain", "mode": "telemetry only", "tools": ["opcua_read", "physical_state"], "agents": ["rca"]},
    "action": {"title": "Action domain", "mode": "human approval", "tools": ["replay_to_replica", "propose_plan", "apply_to_production"], "agents": ["recovery"]},
}


def build_boundaries(oir):
    G = oir["graph"]
    colls = sorted(n.split(":", 1)[1] for n in G if n.startswith("coll:"))
    queues = sorted(n.split(":", 1)[1] for n in G if n.startswith("queue:"))
    stations = sorted(n.split(":", 1)[1] for n in G if n.startswith(("station:", "device:")))
    fns = sorted(n.split(":", 1)[1] for n in G if n.startswith(("fn:", "svc:")))
    resources = {"collections": colls, "queues": queues, "stations": stations, "services": fns}

    lines = ["// Generated from OIR " + oir["version"] + ". Default deny. Humans approve; the model cannot widen this."]
    for c in colls:
        lines.append(f'permit(principal == Agent::"rca", action == Action::"read_collection", resource == Collection::"{c}");')
    for q in queues:
        lines.append(f'permit(principal == Agent::"rca", action == Action::"read_queue", resource == Queue::"{q}");')
    for s in fns:
        lines.append(f'permit(principal == Agent::"rca", action == Action::"read_traces", resource == Service::"{s}");')
    for s in stations:
        lines.append(f'permit(principal == Agent::"rca", action == Action::"read_node", resource == Node::"{s}");')
    lines.append('permit(principal == Agent::"rca", action == Action::"read_api", resource == Api::"erp");')
    lines.append('permit(principal == Agent::"rca", action == Action::"read_physical", resource == Physical::"station_states");')
    lines.append('permit(principal == Agent::"recovery", action == Action::"replay", resource == Env::"replica");')
    lines.append('permit(principal == Agent::"recovery", action == Action::"propose", resource == Env::"plan");')
    lines.append('permit(principal == Agent::"recovery", action == Action::"read_collection", resource);')
    lines.append('permit(principal == Agent::"recovery", action == Action::"apply", resource == Env::"production") when { context.human_approved == true && context.gate_passed == true };')
    lines.append('forbid(principal, action == Action::"write_collection", resource) unless { context.human_approved == true && context.gate_passed == true };')
    cedar = "\n".join(lines)

    entities = [{"uid": {"type": t, "id": i}, "attrs": {}, "parents": []} for t, ids in
                [("Agent", ["rca", "recovery"]), ("Collection", colls), ("Queue", queues), ("Service", fns), ("Node", stations), ("Api", ["erp"]), ("Env", ["replica", "plan", "production"]), ("Physical", ["station_states"])] for i in ids]

    toolbox = ["# Generated from OIR " + oir["version"] + " for MCP Toolbox for Databases (sqlite source). Emitted artifact; the demo enforces the Cedar form.",
               "sources:", "  plant-docs:", "    kind: sqlite", "    database: data/plant.db", "tools:"]
    for c in colls:
        toolbox += [f"  read_{c}:", "    kind: sqlite-sql", "    source: plant-docs", f"    description: Read-only access to the '{c}' collection.",
                    f"    statement: SELECT body FROM docs WHERE collection = '{c}' LIMIT 200"]
    toolbox += ["toolsets:", "  rca_readonly:"] + [f"    - read_{c}" for c in colls]

    return {"domains": DOMAINS, "resources": resources, "cedar": cedar, "cedar_entities": entities, "toolbox_yaml": "\n".join(toolbox),
            "counts": {"permits": cedar.count("permit("), "forbids": cedar.count("forbid(")}}


def export_aas(oir):
    """Physical assets as Asset Administration Shells (Eclipse BaSyx Python SDK, AAS metamodel v3)."""
    from basyx.aas import model
    from basyx.aas.adapter.json import write_aas_json_file
    import io
    store = model.DictObjectStore()
    for n, d in oir["graph"].nodes(data=True):
        if d["kind"] not in ("station", "device"):
            continue
        name = d["label"]
        sm = model.Submodel(id_=f"urn:tolerance:sm:{name}", id_short="OperationalData",
                            submodel_element=[model.Property(id_short=v, value_type=model.datatypes.String, value="live via OPC UA") for v in d["attrs"].get("vars", [])])
        shell = model.AssetAdministrationShell(id_=f"urn:tolerance:aas:{name}", id_short=name.replace("-", "_"),
                                               asset_information=model.AssetInformation(asset_kind=model.AssetKind.INSTANCE, global_asset_id=f"urn:tolerance:asset:{name}"),
                                               submodel={model.ModelReference.from_referable(sm)})
        store.add(sm); store.add(shell)
    buf = io.StringIO()
    write_aas_json_file(buf, store)
    return json.loads(buf.getvalue())


def digest(oir):
    """Compact text of the compiled model, handed to the investigator so it reasons over the graph, not over guesses."""
    G = oir["graph"]
    lines = ["COMPILED MODEL (OIR %s). Data flows left to right." % oir["version"]]
    for a, b, d in G.edges(data=True):
        lines.append(f"  {a} --{d['type']}--> {b}" + (f"   [{d['errors']} errors in traces]" if d.get("errors") else ""))
    lines.append("Valid values: service names for read_traces are the fn:/svc: labels (e.g. fn-ingest-scan); queue names are the queue: labels; collections are the coll: labels; nodes for opcua_read are the station:/device: labels; manufacturing orders are MO-####.")
    lines.append("Entity chain: " + " -> ".join(oir.get("entity_chain", [])))
    for u in oir["uncertainty"]:
        lines.append(f"  UNCERTAIN {u['kind']}: {u['subject']}")
    return "\n".join(lines)
