"""The rule-based investigator for real incidents, and the context an incident arrives with.
A strategy is the order in which evidence sources are consulted: metrics, traces or logs first. The investigator stops as soon as the fused
ranking has a clear leader, so a good first choice means fewer tool calls. Each call that finds the source missing still costs a call."""
import functools

from rca import data as D, probes as P

STRATEGIES = {"metrics_first": ["metrics", "traces", "logs"], "traces_first": ["traces", "logs", "metrics"], "logs_first": ["logs", "traces", "metrics"]}
CALL_COST = 0.06
SYMPTOM = {"cpu": "cpu", "mem": "memory", "diskio": "disk", "socket": "network", "load": "load", "error": "errors", "latency-50": "latency", "latency-90": "latency"}


@functools.lru_cache(maxsize=2048)
def probe_cached(case, probe):
    return P.PROBES[probe](case)


def alert_context(case):
    """What the alert says before anyone investigates: the system, which telemetry exists, and the family of the strongest metric shift."""
    r = D.case_row(case)
    m = probe_cached(case, "metrics")
    top = m["ranked"][0] if m["ranked"] else None
    sym = SYMPTOM.get(top["family"], "other") if top and top["score"] >= 1.5 else "silent"
    return {"system": r["system"], "coverage": D.coverage(case), "symptom": sym}


def run(case, order, stop_margin=0.35, call=None):
    """Consult sources in `order` until the fused ranking has a clear leader. `call(probe)` lets a caller (the policy gateway) mediate each probe."""
    results, steps = [], []
    for p in order:
        out = call(p) if call else probe_cached(case, p)
        results.append(out)
        steps.append(p)
        ranked = P.fuse(results)
        if ranked:
            lead = ranked[0][1]
            second = ranked[1][1] if len(ranked) > 1 else 0.0
            only_one_source_exists = D.coverage(case) == "m"
            if (lead - second) >= stop_margin * lead or only_one_source_exists:
                break
    ranked = P.fuse(results)
    return {"ranked": ranked, "steps": steps, "calls": len(steps), "results": results}


def hypothesis(case, res):
    ranked = res["ranked"]
    if not ranked:
        return {"service": None, "ranked": [], "confidence": 0.0, "evidence": [], "fault_family": "unknown", "calls": res["calls"], "steps": res["steps"]}
    top = ranked[0][0]
    ev, fam = [], None
    for r in res["results"]:
        for x in r.get("ranked", []):
            if x["service"] == top:
                ev.append(f"{r['probe']}: {x['why']}")
                if r["probe"] == "metrics":
                    fam = P.FAMNAME.get(x.get("family"), x.get("family"))
                break
    lead = ranked[0][1]
    second = ranked[1][1] if len(ranked) > 1 else 0.0
    conf = round(min(0.98, 0.35 + 0.6 * (lead - second) / lead), 2) if lead else 0.2
    return {"service": top, "ranked": [{"service": s, "score": round(v, 3)} for s, v in ranked[:5]], "confidence": conf, "evidence": ev, "fault_family": fam or "code-level (errors in logs / traces)",
            "calls": res["calls"], "steps": res["steps"]}
