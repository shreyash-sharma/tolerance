"""Default-deny policy for the investigator, generated from the model: which telemetry may be read, which services, and nothing that acts without a person."""


def build(services, mcp=None, principals=("rca", "console")):
    """services: iterable of service names present in the reviewed model."""
    services = sorted(set(services))
    L = ["// Generated from the reviewed model. Default deny. The investigator can read telemetry and propose; only a person's approval can create a work order."]
    for t in ("catalog", "metrics", "traces", "logs"):
        L.append(f'permit(principal == Agent::"rca", action == Action::"read_telemetry", resource == Telemetry::"{t}");')
    L.append('permit(principal == Agent::"rca", action == Action::"read_graph", resource == Graph::"services");')
    for s in services:
        L.append(f'permit(principal == Agent::"rca", action == Action::"read_service", resource == Service::"{s}");')
    L.append('permit(principal == Agent::"rca", action == Action::"propose", resource == Env::"plan");')
    L.append('permit(principal == Agent::"remediation", action == Action::"apply", resource == Env::"workorders") when { context.human_approved == true };')
    mcp = list(mcp or [])
    for srv, tool in mcp:
        for who in principals:
            L.append(f'permit(principal == Agent::"{who}", action == Action::"read_mcp", resource == McpTool::"{srv}/{tool}");')
    # The safety gate. Warden's score and the user's limit arrive as context; Cedar, not the app, decides whether an action may run.
    L.append('permit(principal == Agent::"broker", action == Action::"apply", resource == Env::"plant") when { context.within_limits == true && context.human_approved == true };')
    L.append('permit(principal == Agent::"broker", action == Action::"apply", resource == Env::"plant") when { context.within_limits == true && context.needs_person == false && context.warden_score >= context.auto_limit };')
    L.append('forbid(principal, action == Action::"apply", resource == Env::"plant") when { context.within_limits == false };')
    L.append('forbid(principal, action == Action::"act_mcp", resource);')
    L.append('forbid(principal, action == Action::"restart", resource);')
    cedar = "\n".join(L)
    ents = [{"uid": {"type": t, "id": i}, "attrs": {}, "parents": []} for t, ids in [("Agent", ["rca", "remediation", "broker"] + [x for x in principals if x not in ("rca", "console")]), ("Telemetry", ["catalog", "metrics", "traces", "logs"]), ("Graph", ["services"]),
                                                                                  ("Service", services), ("Env", ["plan", "workorders", "plant"]), ("McpTool", [f"{a}/{b}" for a, b in mcp])] for i in ids]
    ents += [{"uid": {"type": "Agent", "id": "console"}, "attrs": {}, "parents": []}]
    domains = {"telemetry": {"title": "Telemetry domain", "mode": "read only", "tools": ["case_info", "metric_anomalies", "trace_anomalies", "log_anomalies", "log_messages"]},
               "topology": {"title": "Topology domain", "mode": "read only", "tools": ["service_neighbors"]},
               "advice": {"title": "Advice domain", "mode": "propose only", "tools": ["propose_remediation"]},
               "action": {"title": "Action domain", "mode": "human approval", "tools": ["execute_remediation"]}}
    if mcp:
        domains["mcp"] = {"title": "MCP tools", "mode": "read only; writes denied", "tools": [f"{a}/{b}" for a, b in mcp]}
    return {"cedar": cedar, "cedar_entities": ents, "domains": domains, "counts": {"permits": cedar.count("permit("), "forbids": cedar.count("forbid(")}, "resources": {"services": services}}
