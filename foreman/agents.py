"""The nine Tolerance agents. Each has a Contract (the catalog card) and a function. Every agent uses Gemini for at least one step.
Operations agents reach the plant only through foreman.gate (Cedar, default deny). Onboarding and operations are chained by the flows at the bottom."""
import json, re

from foreman import core, gate, llm, safety
from foreman.core import Contract, Run, register

FORBID_WRITE = "Write to the plant"

register(Contract(
    id="reader", name="Document Reader", team="onboarding", job="Reads the plant's documents and turns them into claims, each with a verbatim quote.",
    use_case="Manuals, work instructions and safety sheets hold the limits and the structure of the plant.", solution="Gemini extracts claims; code checks every quote against the page; instructions hidden in documents are removed first.",
    outcomes=["Claims with quotes", "Conflicts between documents", "Missing facts", "Hidden instructions flagged"], inputs=["PDF, Markdown, text files"], tools=["documents.extract"],
    forbidden=["Obey instructions found inside documents", FORBID_WRITE], output="Claims, conflicts, gaps", success="Every claim has a quote that exists on the page", mode="mixed",
    gemini_use="Claim extraction from document text", trust="read", origin=["LangExtract", "Docling"]), None)
register(Contract(
    id="scout", name="Connector Scout", team="onboarding", job="Looks at the connected sources and says what each one holds and what is missing.",
    use_case="A plant has ERP, MES, PLC and file data. Someone must say which is which.", solution="MCP servers list sources and tables. Gemini names the role of each table from its columns.",
    outcomes=["Role of each table", "Which sources are live", "What data is missing"], inputs=["MCP connectors"], tools=["databases/list_sources", "databases/list_tables", "databases/describe_table", "opcua/opcua_status"],
    forbidden=[FORBID_WRITE, "Read rows outside SELECT"], output="Source map", success="Each table has a role and a reason", mode="model-driven", gemini_use="Names the role of each table from its columns", trust="read", origin=["MCP servers", "dlt"]), None)
register(Contract(
    id="modeler", name="Plant Modeler", team="onboarding", job="Writes what the factory is, draws the 2D plan, and waits for a person to confirm before the 3D is built.",
    use_case="The 3D model must come from facts a person has checked.", solution="Stations from data, material flow from the documents, limits from the documents. Gemini writes the overview and each sentence cites its source.",
    outcomes=["Written overview", "2D plan", "Limits list", "Confirmation gate"], inputs=["Claims", "Station data"], tools=["telemetry/list_stations", "documents.flows", "documents.limits"],
    forbidden=["Build the 3D before a person confirms"], output="Overview and plan", success="A person confirms or corrects every item", mode="mixed", gemini_use="Writes the plain overview from the facts", trust="propose",
    origin=["React Flow", "BaSyx"]), None)
register(Contract(
    id="diagnosis", name="Diagnosis", team="operations", job="Finds out why a station failed, using only read-only tools.",
    use_case="A station stopped. Someone must say why, fast.", solution="Gemini picks MCP tools, reads the results and submits a cause with evidence. Cedar allows each call.",
    outcomes=["Cause", "Evidence per claim", "Tool trace"], inputs=["Failed station"], tools=["telemetry/station_history", "telemetry/failure_episodes", "telemetry/fleet_failures", "telemetry/list_stations"],
    forbidden=[FORBID_WRITE, "Call a tool Cedar denies"], output="Cause and evidence", success="The Verifier supports the cause", mode="model-driven", gemini_use="Chooses tools and writes the diagnosis", trust="propose",
    origin=["PyRCA", "OpenRCA", "AssetOpsBench"]), None)
register(Contract(
    id="verifier", name="Verifier", team="operations", job="Checks the diagnosis against the data and rejects what the data does not support.",
    use_case="A model can sound sure and be wrong.", solution="Rule checks recompute every cited number from the tool results. Gemini then reviews the argument. A hard check cannot be talked away.",
    outcomes=["Supported or not", "Issues list", "Evidence score"], inputs=["Diagnosis", "Tool results"], tools=["telemetry/failure_episodes", "telemetry/list_stations"],
    forbidden=["Approve a claim whose numbers do not match"], output="Verdict and score", success="No number in the diagnosis differs from the data", mode="mixed", gemini_use="Reviews the argument for gaps", trust="decide",
    origin=["DeepEval", "Ragas", "Strands critic loop"]), None)
register(Contract(
    id="planner", name="Remediation Planner", team="operations", job="Proposes the action to fix the problem, with the exact settings.",
    use_case="After a cause is known, someone must choose a fix that respects the plant's limits.", solution="Gemini proposes actions from the diagnosis and the limits. Warden scores each. Nothing is applied here.",
    outcomes=["Action list", "Exact settings", "Why this action"], inputs=["Verified diagnosis", "Hard limits"], tools=["documents.limits"],
    forbidden=[FORBID_WRITE, "Propose a setting above a hard limit as the first choice"], output="Proposed actions", success="Every proposal names a station, a kind and settings", mode="model-driven",
    gemini_use="Chooses the action and settings", trust="propose", origin=["Strands agent SOPs", "ADK recipes"]), None)
register(Contract(
    id="warden", name="Warden", team="operations", job="Scores how safe each action is, enforces the hard limits, and applies what the user's limit allows.",
    use_case="Some fixes are small and some can stop a line. The user decides how far the system may go alone.", solution="Six factors give a score from 0 to 100. The user sets a floor and a limit. Cedar enforces them at the Action Broker.",
    outcomes=["Score with factors", "Auto, approve or refuse", "Backtest on past incidents"], inputs=["Proposed action", "Limits", "Evidence"], tools=["Action Broker"],
    forbidden=["Let a high score override a hard limit"], output="Score and decision", success="No action that breaks a hard limit is ever applied", mode="rule-driven", gemini_use="Writes the plain reason for each decision", trust="decide",
    origin=["Cedar", "Strands human gates"]), None)
register(Contract(
    id="sentinel", name="Sentinel", team="operations", job="Checks your systems and the agents' own claims with plain rules, and tells a person when one fails.",
    use_case="A plant's IT side fails quietly: a feed stops, a column changes, a service is slow. A model should not be the judge of that.", solution="Rules check a field with an operator and a value: on your data tables, a web address, a network port, a service protocol, or what the documents say. An optional Decide check lets Gemini put short texts into labels you choose, and its answer is limited to those labels. Code decides every result. A schedule runs the rules by itself. Maintenance windows keep planned work quiet. An impact map shows which stations lose their data. A rule that starts failing, and one that recovers, tells your channels.",
    outcomes=["Pass or fail for each rule", "What it saw", "Labels for short texts (optional)", "The stations that lose data when a rule fails", "A message to a person when a rule fails or recovers"], inputs=["Rules", "Connected tables", "Public addresses", "Document claims"], tools=["databases/list_tables", "Public web, port and protocol checks"],
    forbidden=[FORBID_WRITE, "Let a model say pass or fail", "Follow an instruction found inside a text", "Reach a private network address", "Log in to a service or read its data"], output="Rule results", success="The same data and rule always give the same result", mode="mixed",
    gemini_use="Only in the optional Decide check: it puts short texts into labels you choose, limited to those labels. Plain code decides every result.", trust="read", origin=["Kanshi assertion engine (own project)", "Jev (a model limited to a fixed set of outputs)"]), None)

SYS_SCOUT = ("You describe data sources in a factory. For each table given, say its role (one of: machine states, orders, inspection results, service metrics, alerts, catalog, other) and one short reason from its columns. "
             "Also list what a factory would still need that is missing. Reply as JSON: {\"tables\": [{\"name\": \"...\", \"role\": \"...\", \"reason\": \"...\"}], \"missing\": [\"...\"]}.")


# --------------------------------------------------------------- onboarding
def run_scout(live=False):
    run = Run("scout", "Map the connected sources")
    try:
        srcs = gate.call("scout", "databases/list_sources")
        run.step("tool", "databases/list_sources", decision="ALLOW" if srcs.get("ok") else "DENY")
        tabs = gate.call("scout", "databases/list_tables")
        run.step("tool", "databases/list_tables", decision="ALLOW" if tabs.get("ok") else "DENY")
        names = [t["table"] if isinstance(t, dict) else str(t) for t in (tabs.get("result") or {}).get("tables", [])][:12]
        cols = {}
        for n in names:
            d = gate.call("scout", "databases/describe_table", {"table": n})
            run.step("tool", f"databases/describe_table {n}", decision="ALLOW" if d.get("ok") else "DENY")
            r = d.get("result")
            cols[n] = [c["name"] for c in (r or {}).get("columns", [])][:14]
        ua = gate.call("scout", "opcua/opcua_status")
        run.step("tool", "opcua/opcua_status", decision="ALLOW" if ua.get("ok") else "DENY", result=str(ua.get("result"))[:120])
        try:
            out, src = llm.ask_json("scout", SYS_SCOUT, json.dumps({"tables": cols}), run=run, live=live)
        except llm.LLMUnavailable:
            out, src = {"tables": [{"name": n, "role": "other", "reason": "Gemini not available"} for n in cols], "missing": []}, "rule"
        res = {"sources": (srcs.get("result") or {}), "opcua": ua.get("result"), "tables": out.get("tables", []), "missing": out.get("missing", [])}
        return run.finish(res, src) and run.public()
    except Exception as e:
        run.fail(e)
        return run.public()


def _station_facts():
    from workspace import twin
    return twin.build()


def run_modeler(live=False):
    """Facts first (stations, flows, limits). Gemini writes the overview from those facts only; code checks that every station it names exists."""
    from documents import engine as DE
    run = Run("modeler", "Write the plant overview")
    try:
        t = _station_facts()
        st = DE.state()
        fl, lim = DE.flows(st), DE.limits(st)
        run.step("tool", "twin.build", text2=f"{len(t['stations'])} stations")
        run.step("tool", "documents.flows", text2=f"{len(fl)} flows from documents")
        run.step("tool", "documents.limits", text2=f"{len(lim)} hard limits")
        stations = [{"name": s["name"], "state": s["state"], "failures": s["failures"], "mttr_s": s["mttr_s"], "availability": s["availability"]} for s in t["stations"]]
        facts = {"stations": stations, "flows": [{"from": e["from"], "to": e["to"], "doc": e["doc"]} for e in fl], "limits": [{k: l[k] for k in ("subject", "predicate", "value", "doc")} for l in lim],
                 "ghosts": [g["name"] for g in st["ghosts"] if g["status"] != "ignored"], "conflicts": len(st["conflicts"]), "gaps": len(st["gaps"]),
                 "what_it_makes": (__import__("foreman.plant", fromlist=["x"]).get().get("goal")), "owner_notes": (__import__("foreman.plant", fromlist=["x"]).get().get("notes") or [])[-6:]}
        sys = ("You write a short overview of a factory for the person who runs it, in plain English, from the facts given only. Five to eight sentences. Name each station you mention exactly as given. "
               "Say what is unknown. Reply as JSON: {\"overview\": \"...\", \"questions\": [\"things a person should confirm\"]}.")
        try:
            out, src = llm.ask_json("modeler", sys, json.dumps(facts, default=str), run=run, live=live)
        except llm.LLMUnavailable:
            out, src = {"overview": f"The plant has {len(stations)} stations: " + ", ".join(s["name"] for s in stations) + ".", "questions": []}, "rule"
        names = {s["name"] for s in stations}
        said = set(re.findall(r"\b[A-Z][A-Z0-9]{1,4}\b", out.get("overview", ""))) & {n for n in names}
        unknown = [w for w in re.findall(r"\b[A-Z]{1,3}\d\b", out.get("overview", "")) if w not in names and w not in facts["ghosts"]]
        run.step("check", "Every named station exists" if not unknown else f"Gemini named unknown stations: {unknown}", ok=not unknown)
        res = {"overview": out.get("overview", ""), "questions": out.get("questions", []), "unknown_named": unknown, "stations": stations, "flows": fl,
               "limits": lim, "ghosts": [g["name"] for g in st["ghosts"] if g["status"] != "ignored"], "confirmed": False}
        run.finish(res, src)
        from workspace import store
        store.update(lambda d: d.__setitem__("jig_plan", {**res, "built_at": __import__("time").time()}))
        return run.public()
    except Exception as e:
        run.fail(e)
        return run.public()


def confirm_plan(ok=True, note=""):
    from workspace import store
    def f(d):
        p = d.get("jig_plan")
        if not p:
            raise ValueError("no plan yet")
        p["confirmed"], p["note"] = bool(ok), note
    store.update(f)
    return store.load().get("jig_plan")


# --------------------------------------------------------------- operations
DIAG_SYS = ("You are the Diagnosis agent for a factory line. A station failed. Use the tools to look at the station history, its earlier failures and other stations. "
            "Then call submit with the most likely cause, your confidence between 0 and 1, and evidence: each item cites a tool and a number you saw. Do not invent numbers.")


def _submit_decl(types):
    return types.FunctionDeclaration(name="submit", description="Submit the diagnosis.", parameters_json_schema={
        "type": "object", "properties": {"cause": {"type": "string"}, "confidence": {"type": "number"},
                                         "evidence": {"type": "array", "items": {"type": "object", "properties": {"tool": {"type": "string"}, "claim": {"type": "string"}, "number": {"type": "number"}}, "required": ["tool", "claim"]}},
                                         "next_look": {"type": "string"}}, "required": ["cause", "confidence", "evidence"]})


def run_diagnosis(station, live=False, parent=None, feedback=None):
    run = Run("diagnosis", f"Why did {station} fail?", parent=parent)
    tools = ["telemetry/station_history", "telemetry/failure_episodes", "telemetry/fleet_failures", "telemetry/list_stations"]
    from mcpx import remote as _rm
    own = [f"{sv['id']}/{t['name']}" for sv in _rm.servers() for t in sv["tools"] if t["read_only"]][:12]   # the owner's own MCP servers add their read-only tools
    tools += own
    try:
        try:
            final, steps, src = llm.tool_loop("diagnosis", DIAG_SYS, f"Station {station} entered the failed state." + (" The plant also connected its own MCP servers; their read-only tools may help (for example the state of a station in the MES)." if own else "") + (f" A reviewer rejected your earlier answer: {feedback}. Use only numbers that the tools return." if feedback else ""), tools, lambda full, args: gate.call("diagnosis", full, args), _submit_decl, run, live=live)
        except llm.LLMUnavailable:
            r = gate.call("diagnosis", "telemetry/failure_episodes", {"station": station, "hours": 24})
            run.step("tool", "telemetry/failure_episodes", decision="ALLOW" if r.get("ok") else "DENY")
            res = r.get("result") or {}
            final = {"cause": f"{station} has failed {res.get('failures', '?')} times in 24 hours (mean repair {res.get('mean_ttr_s')} s)", "confidence": 0.4,
                     "evidence": [{"tool": "telemetry/failure_episodes", "claim": "failures in 24 h", "number": res.get("failures", 0)}]}
            src = "rule"
        final["station"] = station
        run.finish(final, src)
        return run.public()
    except Exception as e:
        run.fail(e)
        return run.public()


def run_verifier(station, diag, live=False, parent=None):
    """Hard checks first: recompute failure count and repair time from the data. Then Gemini reviews the argument. A hard fail stays a fail."""
    run = Run("verifier", f"Check the diagnosis for {station}", parent=parent)
    try:
        r = gate.call("verifier", "telemetry/failure_episodes", {"station": station, "hours": 24})
        run.step("tool", "telemetry/failure_episodes", decision="ALLOW" if r.get("ok") else "DENY")
        data = r.get("result") or {}
        truth_nums = {"failures": data.get("failures"), "mean_ttr_s": data.get("mean_ttr_s")}
        for ep in data.get("episodes", []):
            truth_nums.setdefault("durations", []).append(ep["duration_s"])
        pool = [v for v in [truth_nums["failures"], truth_nums["mean_ttr_s"]] + truth_nums.get("durations", []) if v is not None]
        # A diagnosis may cite the whole history or the station's forecast, not only the last 24 hours. Those numbers come from the same read-only tools, so they count too.
        wider = {}
        for call, args in (("telemetry/failure_episodes", {"station": station, "hours": 24 * 3650}), ("telemetry/list_stations", {})):
            more = gate.call("verifier", call, args)
            run.step("tool", call, decision="ALLOW" if more.get("ok") else "DENY")
            mr = more.get("result") or {}
            if "stations" in mr:
                mr = next((x for x in mr["stations"] if str(x.get("name", "")).lower() == station.lower()), {})
            wider["whole_log" if "episodes" in mr else "station_summary"] = {k: v for k, v in mr.items() if k != "episodes"}
            pool += [float(v) for k, v in mr.items() if isinstance(v, (int, float)) and not isinstance(v, bool) and k in ("failures", "mean_ttr_s", "p_fail_4h", "window_hours")]
            pool += [float(e["duration_s"]) for e in mr.get("episodes", [])]
            if "failures" in mr and call == "telemetry/failure_episodes":
                truth_nums["failures_all_time"] = mr.get("failures")
        issues, hard_ok, checked = [], True, 0
        for ev in diag.get("evidence", []):
            n = ev.get("number")
            if n is None:
                continue
            checked += 1
            if not any(abs(float(n) - float(v)) <= max(0.6, 0.06 * abs(float(v))) for v in pool):
                issues.append(f"The number {n} for “{ev.get('claim')}” is not in the data (last 24 h: {truth_nums['failures']} failures, mean repair {truth_nums['mean_ttr_s']} s; whole log: {truth_nums.get('failures_all_time')} failures).")
                hard_ok = False
        run.step("check", f"Recomputed {checked} cited numbers: {'all match' if hard_ok else str(len(issues)) + ' do not match'}", ok=hard_ok)
        review, src = {"gaps": [], "supported": True}, "rule"
        try:
            review, src = llm.ask_json("verifier", "You review a factory diagnosis against the data. The data has the last 24 hours, the whole log and a station summary; a number is supported if any of them shows it. Say if the argument has gaps (a claim with no evidence, a cause the data does not point to). "
                                       "Reply as JSON: {\"supported\": true|false, \"gaps\": [\"...\"]}.", json.dumps({"diagnosis": diag, "data_last_24h": data, **wider}, default=str)[:6000], run=run, live=live)
        except llm.LLMUnavailable:
            pass
        gaps = [str(g) for g in review.get("gaps", [])][:4]
        ev = 0.0 if not hard_ok else max(0.0, min(1.0, float(diag.get("confidence", 0.5)) * (0.55 if gaps else 1.0) * (0.6 if not review.get("supported", True) else 1.0)))
        res = {"supported": hard_ok and bool(review.get("supported", True)), "hard_ok": hard_ok, "evidence": round(ev, 2), "issues": issues + gaps, "checked_numbers": checked, "data": truth_nums}
        run.finish(res, src)
        return run.public()
    except Exception as e:
        run.fail(e)
        return run.public()


PLAN_SYS = ("You plan fixes for a factory station that failed. Propose one to three actions, best first. kind must be one of: inspect, adjust_speed, clear_jam, restart_station, stop_station, reroute_orders, schedule_maintenance. "
            "params holds exact settings, for example {\"max_speed_pct\": 70} or {\"type\": \"preventive\"}. Respect the limits given. Reply as JSON: {\"actions\": [{\"kind\": \"...\", \"station\": \"...\", \"params\": {}, \"why\": \"...\"}]}.")
KINDS = {"inspect", "adjust_speed", "clear_jam", "restart_station", "stop_station", "reroute_orders", "schedule_maintenance"}


def run_planner(station, diag, ver, live=False, parent=None, revise=None):
    from documents import engine as DE
    run = Run("planner", f"Plan the fix for {station}", parent=parent)
    try:
        lim = DE.limits()
        mine = [{k: l[k] for k in ("subject", "predicate", "value")} for l in lim if l["subject"] in (station, "ORDER")]
        payload = {"station": station, "diagnosis": diag, "verification": {k: ver.get(k) for k in ("supported", "issues", "evidence")}, "limits": mine, "revise": revise}
        try:
            out, src = llm.ask_json("planner", PLAN_SYS, json.dumps(payload, default=str), run=run, live=live, extra=str(revise))
        except llm.LLMUnavailable:
            out, src = {"actions": [{"kind": "inspect", "station": station, "params": {}, "why": "Gemini not available; inspection is the safe default."}]}, "rule"
        acts = [a for a in out.get("actions", []) if a.get("kind") in KINDS][:3] or [{"kind": "inspect", "station": station, "params": {}, "why": "no valid action proposed"}]
        for a in acts:
            a.setdefault("station", station)
            a["params"] = a.get("params") or {}
        run.finish({"actions": acts}, src)
        return run.public()
    except Exception as e:
        run.fail(e)
        return run.public()


def context_for(station, evidence):
    from documents import engine as DE
    from physical import service as PH, reliability as REL
    st = DE.state()
    fl = DE.flows(st)
    seg = PH.recent_window(24)
    ep = REL.episodes(seg)
    key = next((a for a in ep if str(a).lower() == station.lower()), None)
    # faults in a row: failures with fewer than 10 minutes between them
    consec, last = 0, None
    if key:
        for (s, e) in ep[key]["failures"]:
            consec = consec + 1 if last is not None and (s - last).total_seconds() < 600 else 1
            last = e
    cur = next((s["state"] for s in _station_facts()["stations"] if s["name"] == station), "unknown")
    return {"evidence": evidence, "state": cur, "consecutive_faults": consec, "n_affected": len(DE.downstream(station, st, fl)), "limits": DE.limits(st), "plant_time": None}


def run_operations(station, live=False):
    """The whole loop for one failed station: diagnose, verify (critic loop, at most two rounds), plan, score each action with Warden, ask Cedar to apply those that may run."""
    top = Run("diagnosis", f"Operations flow for {station}", meta={"station": station, "flow": "operations"})
    top.agent = "router"
    out = {"station": station, "rounds": [], "proposals": []}
    try:
        diag_run = run_diagnosis(station, live, parent=top.id)
        diag = diag_run["result"] or {}
        if diag_run["status"] != "done":
            raise RuntimeError("diagnosis failed: " + str(diag_run["error"]))
        ver_run = run_verifier(station, diag, live, parent=top.id)
        ver = ver_run["result"] or {}
        out["rounds"].append({"diagnosis": diag_run["id"], "verifier": ver_run["id"], "supported": ver.get("supported")})
        if not ver.get("supported"):
            top.step("decision", "Verifier rejected the diagnosis; sending it back once with the issues", issues=ver.get("issues"))
            diag_run2 = run_diagnosis(station, live, parent=top.id, feedback=" ".join(ver.get("issues", []))[:600])
            diag = diag_run2["result"] or diag
            ver_run = run_verifier(station, diag, live, parent=top.id)
            ver = ver_run["result"] or ver
            out["rounds"].append({"diagnosis": diag_run2["id"], "verifier": ver_run["id"], "supported": ver.get("supported")})
        plan_run = run_planner(station, diag, ver, live, parent=top.id)
        ctx = context_for(station, ver.get("evidence", 0.0))
        w = Run("warden", f"Score the actions for {station}", parent=top.id)
        for a in (plan_run["result"] or {}).get("actions", []):
            sc = safety.score_action(a, ctx)
            txt, src = safety.rationale(sc, run=w, live=live)
            sc["reason"], sc["reason_by"], sc["why"] = txt, src, a.get("why")
            w.step("score", f"{sc['label']}: {sc['score']} → {sc['decision']}", score=sc["score"], decision=sc["decision"])
            rec = None
            if sc["decision"] == "auto":
                rec = safety.apply(sc, None, run=w)
            sc["applied"] = rec
            out["proposals"].append(sc)
        w.finish({"n": len(out["proposals"])}, "rule")
        try:   # a person is needed: tell them where they work, not only in the app
            from foreman import notify
            need = [p for p in out["proposals"] if p["decision"] == "approve" and not p.get("applied")]
            if need:
                notify.dispatch(f"Approval needed: {station}", f"{len(need)} action(s) wait for a person on {station}. " + "; ".join(f"{p['label']} (score {p['score']})" for p in need[:3]) + ". " + (need[0].get("reason") or "")[:240])
            blocked = [p for p in out["proposals"] if p.get("violations")]
            if blocked:
                notify.dispatch(f"Warden blocked an action: {station}", "; ".join(f"{p['label']}: {p['violations'][0]}" for p in blocked[:2]))
        except Exception:
            pass
        out.update(diagnosis=diag, verification=ver, plan_run=plan_run["id"], warden_run=w.id, settings=safety.settings())
        try:   # the owner's own playbooks run after the agents, and pass through the same gate
            from foreman import playbook
            out["playbooks"] = playbook.run_enabled_for(station)
        except Exception:
            out["playbooks"] = []
        top.finish(out, "mixed")
        return top.public()
    except Exception as e:
        top.fail(e)
        return top.public()


def approve_proposal(run_id, index, by="operator"):
    r = core.get_run(run_id)
    if not r or not r.result:
        raise ValueError("no such run")
    sc = r.result["proposals"][int(index)]
    if sc.get("applied"):
        return sc["applied"]
    rec = safety.apply(sc, approved_by=by)
    sc["applied"] = rec
    return rec


def reject_proposal(run_id, index):
    r = core.get_run(run_id)
    sc = r.result["proposals"][int(index)]
    safety.record_person_decision(sc["kind"], False)
    sc["applied"] = {"mode": "rejected", "status": "a person rejected it"}
    return sc["applied"]
