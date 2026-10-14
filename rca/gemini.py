"""Gemini as the investigator for a real incident. It reads evidence through the policy gateway (telemetry tools only), reasons about
where a fault originates (symptoms often show up in callers, not at the root), and submits a ranked diagnosis. It cannot act."""
import json, time

from fabric import agents as FA

SYSTEM = """You are the incident investigator inside Tolerance. An alert fired for one system. Your job: find the service where the fault ORIGINATES.
Facts about this data: the alert time is the fault onset. Symptoms usually appear in callers (errors, latency) while the root cause is a callee, so read the actual log messages, look at who calls whom, and compare each service's own signals.
Metric shifts show resource faults (cpu, memory, disk, network); code-level faults often show only in logs and traces. Some systems record only metrics.
Use the tools economically (each call has a cost). Never claim what the evidence does not show. You cannot change anything: you may only read telemetry and propose a remediation, which a person must approve.
Finish by calling submit_diagnosis with up to three ranked suspect services."""


def _decls(types, tool_names, registry):
    props = {"string": "STRING", "object": "OBJECT", "integer": "INTEGER"}
    d = []
    for n in tool_names:
        t = registry[n]
        d.append(types.FunctionDeclaration(name=n, description=t["doc"], parameters=types.Schema(type="OBJECT", properties={k: types.Schema(type=props[v]) for k, v in t["params"].items()})))
    d.append(types.FunctionDeclaration(name="submit_diagnosis", description="Submit the final diagnosis and stop.", parameters=types.Schema(type="OBJECT", properties={
        "suspects": types.Schema(type="ARRAY", items=types.Schema(type="OBJECT", properties={"service": types.Schema(type="STRING"), "confidence": types.Schema(type="NUMBER"), "reason": types.Schema(type="STRING")}, required=["service", "confidence", "reason"])),
        "fault_type": types.Schema(type="STRING"), "explanation": types.Schema(type="STRING"),
        "remediation": types.Schema(type="OBJECT", properties={"action": types.Schema(type="STRING"), "reason": types.Schema(type="STRING")})}, required=["suspects", "fault_type", "explanation"])))
    return d


TOOLS = ["case_info", "metric_anomalies", "trace_anomalies", "log_anomalies", "log_messages", "service_neighbors"]


def run(gw, inc, strategy, context="", max_seconds=60, max_turns=10):
    from google.genai import types
    from fabric.gateway import TOOLS as REG
    t0 = time.time()
    client = FA.make_client()
    hint = {"metrics_first": "Start with metric_anomalies.", "traces_first": "Start with trace_anomalies (if the system records traces).", "logs_first": "Start with log_anomalies (if the system records logs)."}[strategy]
    user = f"ALERT: {inc['title']}\nSystem: {inc['alert'].get('system_name')}. Telemetry available (from the catalog): {inc['alert'].get('coverage_text')}. Strongest metric shift family: {inc['ctx']['symptom']}.\nSuggested starting point from the learner: {hint}"
    contents = [types.Content(role="user", parts=[types.Part(text=user)])]
    cfg = types.GenerateContentConfig(system_instruction=SYSTEM + ("\n\n" + context if context else ""), tools=[types.Tool(function_declarations=_decls(types, TOOLS, REG))], temperature=0,
                                      automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    steps, final, used = [], None, None
    n0 = len(gw.audit)
    for _ in range(max_turns):
        if time.time() - t0 > max_seconds:
            raise TimeoutError("Gemini investigation took too long")
        resp = FA.gen_with_retry(client, tries=4, max_wait=8, model="auto", contents=contents, config=cfg)
        used = getattr(resp, "model_version", None) or used
        cand = resp.candidates[0].content
        contents.append(cand)
        calls = [p.function_call for p in cand.parts if getattr(p, "function_call", None)]
        if not calls:
            break
        parts = []
        for fc in calls:
            args = json.loads(json.dumps(dict(fc.args or {}), default=lambda o: list(o) if hasattr(o, "__iter__") else str(o)))
            if fc.name == "submit_diagnosis":
                final = args
                parts.append(types.Part.from_function_response(name=fc.name, response={"ok": True}))
                continue
            out = gw.call("rca", fc.name, args)
            steps.append(fc.name)
            payload = json.loads(json.dumps(out, default=str))
            s = json.dumps(payload)
            if len(s) > 7000:
                payload = {"ok": payload.get("ok"), "truncated": True, "preview": s[:7000]}
            parts.append(types.Part.from_function_response(name=fc.name, response=payload))
        contents.append(types.Content(role="user", parts=parts))
        if final:
            break
    if not final:
        raise RuntimeError("Gemini returned no diagnosis")
    sus = sorted(final.get("suspects") or [], key=lambda s: -float(s.get("confidence", 0)))
    return {"service": sus[0]["service"] if sus else None, "ranked": [{"service": s["service"], "score": float(s.get("confidence", 0)), "reason": s.get("reason", "")} for s in sus[:5]],
            "confidence": float(sus[0].get("confidence", 0.5)) if sus else 0.0, "evidence": [s.get("reason", "") for s in sus[:3] if s.get("reason")], "fault_family": final.get("fault_type", ""),
            "explanation": final.get("explanation", ""), "remediation": final.get("remediation"), "calls": len(gw.audit) - n0, "steps": steps, "agent": f"Gemini ({used or 'auto'})", "latency_s": round(time.time() - t0, 1)}
