"""Tool gateway. Every tool call an agent makes passes through Cedar before it touches anything.
The model proposes; this layer decides. Denials are returned to the agent with the reason and written to the audit log."""
import asyncio, json, time
import cedarpy, httpx

from plant import core

ERP_URL = f"http://127.0.0.1:{core.PORT + 1}"
OPCUA = f"opc.tcp://127.0.0.1:{core.PORT}/tolerance/plant"


class Gateway:
    def __init__(self, boundaries):
        self.cedar = boundaries["cedar"]
        self.entities = boundaries["cedar_entities"]
        self.audit = []
        self.sandbox = None  # set by recovery

    # ---- authorization
    def authorize(self, agent, action, rtype, rid, context=None):
        req = {"principal": f'Agent::"{agent}"', "action": f'Action::"{action}"', "resource": f'{rtype}::"{rid}"', "context": context or {}}
        r = cedarpy.is_authorized(req, self.cedar, self.entities)
        ok = str(r.decision).endswith("Allow")
        reasons = list(getattr(r.diagnostics, "reasons", []) or [])
        return ok, reasons

    def _log(self, agent, tool, args, ok, reasons, why, result_summary=None):
        e = {"t": round(time.time(), 3), "agent": agent, "tool": tool, "args": args, "decision": "ALLOW" if ok else "DENY", "policy": reasons, "why": why, "result": result_summary}
        self.audit.append(e)
        return e

    # ---- the single entry point agents use
    def call(self, agent, tool, args, context=None):
        if tool.startswith("mcp:"):
            return self._call_mcp(agent, tool, args or {}, context)
        fn = TOOLS.get(tool)
        if not fn:
            self._log(agent, tool, args, False, [], "unknown tool")
            return {"ok": False, "error": f"unknown tool {tool}"}
        action, rtype, rid = fn["scope"](args)
        ok, reasons = self.authorize(agent, action, rtype, rid, context)
        if not ok:
            why = f"no policy permits {agent} to {action} {rtype}::{rid}" + ("" if not (context and context.get('human_approved') is False) else " without human approval")
            self._log(agent, tool, args, False, reasons, why)
            return {"ok": False, "denied": True, "reason": why}
        try:
            res = fn["run"](self, args)
        except Exception as e:  # tool failure is data, not a crash
            self._log(agent, tool, args, True, reasons, "allowed; tool error", str(e)[:120])
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}
        via = getattr(fn["run"], "via", None)
        self._log(agent, tool, args, True, reasons, "permitted by policy" + (f" · via MCP ({via})" if via else ""), summarize(res))
        return {"ok": True, "result": res}


def _call_mcp(self, agent, tool, args, context):
    """Any tool of any MCP server: authorised by Cedar as McpTool::"server/tool". Read-only tools may be read; anything else needs a policy that does not exist, so it is denied."""
    from mcpx.hub import HUB
    server, _, name = tool[4:].partition("/")
    meta = HUB.meta(server, name)
    action = "read_mcp" if (meta and meta["read_only"]) else "act_mcp"
    ok, reasons = self.authorize(agent, action, "McpTool", f"{server}/{name}", context)
    if not ok:
        why = f"no policy permits {agent} to {action} McpTool::{server}/{name}" + ("" if meta else " (no such tool)")
        self._log(agent, tool, args, False, reasons, why)
        return {"ok": False, "denied": True, "reason": why}
    try:
        res = HUB.call(server, name, args, who=agent)
    except Exception as e:
        self._log(agent, tool, args, True, reasons, "allowed; tool error", str(e)[:120])
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
    self._log(agent, tool, args, True, reasons, "permitted by policy · via MCP", summarize(res))
    return {"ok": True, "result": res}


Gateway._call_mcp = _call_mcp


def summarize(res):
    if isinstance(res, list):
        return f"{len(res)} rows"
    if isinstance(res, dict):
        return ", ".join(f"{k}={v if not isinstance(v, (list, dict)) else len(v)}" for k, v in list(res.items())[:4])
    return str(res)[:80]


# ------------------------------------------------------------------ tools (real reads against the plant's interfaces)
def t_query_collection(gw, a):
    return core.STORE.find(a["collection"], a.get("filter") or {}, limit=min(int(a.get("limit", 50)), 200))


def t_read_traces(gw, a):
    out = []
    for l in open(core.TRACER.path):
        s = json.loads(l)
        if a.get("service") and s["service"] != a["service"]:
            continue
        if a.get("status") and s["status"] != a["status"]:
            continue
        if a.get("min_ts") and s["start"] < a["min_ts"]:
            continue
        out.append({"service": s["service"], "name": s["name"], "status": s["status"], "attributes": s["attributes"], "events": s["events"], "trace_id": s["trace_id"]})
    return out[-int(a.get("limit", 40)):]


def t_queue_status(gw, a):
    st = core.STORE.queue_stats()
    return st if not a.get("queue") else {a["queue"]: st.get(a["queue"], {})}


def t_dead_letters(gw, a):
    return core.STORE.dead_letters(a.get("queue"))


def t_erp_get_order(gw, a):
    r = httpx.get(f"{ERP_URL}/manufacturing-orders/{a['mo']}", timeout=10)
    return r.json() if r.status_code == 200 else {"status": r.status_code}


def t_opcua_read(gw, a):
    async def go():
        from asyncua import Client
        async with Client(OPCUA, timeout=10) as c:
            line = await c.nodes.objects.get_child(["2:Line1"])
            for grp in await line.get_children():
                for obj in await grp.get_children():
                    if (await obj.read_browse_name()).Name == a["node"]:
                        return {(await v.read_browse_name()).Name: await v.read_value() for v in await obj.get_children()}
        return {}
    return asyncio.run(go())


def t_physical_state(gw, a):
    """Machine state from the lake (the real log): current state per asset and failure episodes in the last N hours of log time."""
    from physical import service as PH, reliability as REL
    hours = float(a.get("hours", 6))
    seg = PH.recent_window(hours)
    if not len(seg):
        return {"note": "no machine data in the lake yet"}
    ep = REL.episodes(seg)
    label = PH.CFG["labels"]
    out = {"log_time": str(seg.ts.max()), "window_hours": hours, "assets": {}}
    for asset, e in ep.items():
        last = seg[seg.asset == asset].iloc[-1]
        out["assets"][asset] = {"now": label.get(int(last.status), str(int(last.status))), "failures_in_window": len(e["failures"]), "failed_seconds_in_window": round(sum((b - s0).total_seconds() for s0, b in e["failures"]), 1)}
    out["any_failure_in_window"] = any(v["failures_in_window"] for v in out["assets"].values())
    return out


# ------------------------------------------------------------------ real incidents: telemetry tools bound to the incident's case
GRAPH = {"edges": {}}  # system -> {(caller, callee): calls}; set from the reviewed model


def _case(gw):
    if not getattr(gw, "case", None):
        raise RuntimeError("no incident case bound to this gateway")
    return gw.case


def t_case_info(gw, a):
    from rca import data as D
    c = _case(gw)
    r = D.case_row(c)
    cov = D.coverage(c)
    return {"system": r["system_name"], "telemetry_available": {"metrics": True, "logs": cov in ("ml", "mlt"), "traces": cov == "mlt"}, "window_minutes": r["duration_minutes"],
            "alert_time_is_fault_onset": True, "services_in_metrics": sorted(D.services_of(D.metrics(c)))}


def _mcp(name):
    """These telemetry tools are served by the telemetry MCP server: the call travels over the Model Context Protocol."""
    def run(gw, a):
        from mcpx.hub import HUB
        args = dict(a)
        args["case"] = _case(gw)
        return HUB.call("telemetry", name, args, who="rca")
    run.via = "mcp:telemetry/" + name
    return run


def _probe(name):
    return _mcp({"metrics": "metric_anomalies", "traces": "trace_anomalies", "logs": "log_anomalies"}[name])


def t_log_messages(gw, a):
    from rca import probes as P
    return P.log_messages(_case(gw), a["service"], int(a.get("n", 6)))


def t_service_neighbors(gw, a):
    from rca import data as D
    sysid = D.case_row(_case(gw))["system"]
    e = GRAPH["edges"].get(sysid, {})
    if not e:
        return {"note": "no call graph is known for this system (it records no traces)"}
    return {"service": a["service"], "calls": sorted({b for (x, b) in e if x == a["service"]}), "called_by": sorted({x for (x, b) in e if b == a["service"]})}


LEDGER = []


def t_propose_remediation(gw, a):
    return {"proposed": {"service": a.get("service"), "action": a.get("action"), "reason": a.get("reason")}, "status": "proposed; a person decides"}


def t_execute_remediation(gw, a):
    import time as _t
    wo = {"id": f"WO-{len(LEDGER) + 1:04d}", "service": a.get("service"), "action": a.get("action"), "at": _t.time(), "state": "created (no actuator connected: handed to the on-call engineer)"}
    LEDGER.append(wo)
    return wo


def t_restart_service(gw, a):
    raise RuntimeError("never runs: policy forbids it")


def t_replay_to_replica(gw, a):
    from fabric import recovery
    return recovery.replay(gw, a)


def t_propose_plan(gw, a):
    return {"plan": a["plan"], "status": "proposed, awaiting gate and human approval"}


def t_apply_to_production(gw, a):
    from fabric import recovery
    return recovery.apply(gw, a)


def t_write_collection(gw, a):
    core.STORE.put(a["collection"], a["doc"], a["key"])
    return {"written": a["doc"].get(a["key"])}


TOOLS = {
    "query_collection": {"scope": lambda a: ("read_collection", "Collection", a["collection"]), "run": t_query_collection,
                         "doc": "Read documents from a collection with an optional equality filter.", "params": {"collection": "string", "filter": "object", "limit": "integer"}},
    "read_traces": {"scope": lambda a: ("read_traces", "Service", a.get("service") or "svc-monitor"), "run": t_read_traces,
                    "doc": "Read recent distributed-trace spans for one service, optionally only errors (status=ERROR).", "params": {"service": "string", "status": "string", "limit": "integer"}},
    "queue_status": {"scope": lambda a: ("read_queue", "Queue", a.get("queue") or "scan-events"), "run": t_queue_status,
                     "doc": "Message counts by state for a queue.", "params": {"queue": "string"}},
    "dead_letters": {"scope": lambda a: ("read_queue", "Queue", a.get("queue") or "scan-events"), "run": t_dead_letters,
                     "doc": "Messages that exhausted retries, with the last error.", "params": {"queue": "string"}},
    "physical_state": {"scope": lambda a: ("read_physical", "Physical", "station_states"), "run": t_physical_state,
                       "doc": "Real machine state log from the lake: each asset's current state and its failures in the last N hours (hours, default 6). Use it to tell whether the physical line was healthy.", "params": {"hours": "integer"}},
    "case_info": {"scope": lambda a: ("read_telemetry", "Telemetry", "catalog"), "run": _mcp("case_info"), "doc": "What telemetry exists for this incident (metrics, logs, traces), its system and window.", "params": {}},
    "metric_anomalies": {"scope": lambda a: ("read_telemetry", "Telemetry", "metrics"), "run": _probe("metrics"), "doc": "Rank services by how far their metrics moved after the alert time versus before (robust shift). Returns the series behind each rank.", "params": {"top_k": "integer"}},
    "trace_anomalies": {"scope": lambda a: ("read_telemetry", "Telemetry", "traces"), "run": _probe("traces"), "doc": "Rank services by change in error rate and p90 latency in distributed traces after the alert time. Only systems that record traces.", "params": {"top_k": "integer"}},
    "log_anomalies": {"scope": lambda a: ("read_telemetry", "Telemetry", "logs"), "run": _probe("logs"), "doc": "Rank services by rise in error-like log lines after the alert time, with the most common messages. Only systems that record logs.", "params": {"top_k": "integer"}},
    "log_messages": {"scope": lambda a: ("read_service", "Service", a["service"]), "run": _mcp("log_messages"), "doc": "Distinct error-like and brand-new log messages of one service after the alert time. Read the messages to see what they say.", "params": {"service": "string", "n": "integer"}},
    "service_neighbors": {"scope": lambda a: ("read_graph", "Graph", "services"), "run": _mcp("service_neighbors"), "doc": "Which services a service calls and which call it, from the reviewed dependency graph.", "params": {"service": "string"}},
    "propose_remediation": {"scope": lambda a: ("propose", "Env", "plan"), "run": t_propose_remediation, "doc": "Record a proposed remediation for a service (action: restart, scale, rollback, investigate-network, fix-config). A person decides.", "params": {"service": "string", "action": "string", "reason": "string"}},
    "execute_remediation": {"scope": lambda a: ("apply", "Env", "workorders"), "run": t_execute_remediation, "doc": "Create a work order for an approved remediation. Needs a person's approval.", "params": {"service": "string", "action": "string"}},
    "restart_service": {"scope": lambda a: ("restart", "Service", a["service"]), "run": t_restart_service, "doc": "Restart a service directly.", "params": {"service": "string"}},
    "erp_get_order": {"scope": lambda a: ("read_api", "Api", "erp"), "run": t_erp_get_order,
                      "doc": "Read a manufacturing order from the ERP API.", "params": {"mo": "string"}},
    "opcua_read": {"scope": lambda a: ("read_node", "Node", a["node"]), "run": t_opcua_read,
                   "doc": "Read the variables of a station or device over OPC UA (read only).", "params": {"node": "string"}},
    "write_collection": {"scope": lambda a: ("write_collection", "Collection", a["collection"]), "run": t_write_collection,
                         "doc": "Write a document into a collection.", "params": {"collection": "string", "doc": "object", "key": "string"}},
    "replay_to_replica": {"scope": lambda a: ("replay", "Env", "replica"), "run": t_replay_to_replica,
                          "doc": "Replay a recovery plan inside an isolated replica of the data store.", "params": {"plan": "object"}},
    "propose_plan": {"scope": lambda a: ("propose", "Env", "plan"), "run": t_propose_plan, "doc": "Record a proposed recovery plan.", "params": {"plan": "object"}},
    "apply_to_production": {"scope": lambda a: ("apply", "Env", "production"), "run": t_apply_to_production,
                            "doc": "Apply a verified plan to production. Requires the safety gate and a human approval.", "params": {"plan": "object"}},
}
