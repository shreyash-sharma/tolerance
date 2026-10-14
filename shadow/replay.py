"""Shadow mode. Incidents are replayed in order. For each one the system commits to a prediction BEFORE the outcome is revealed.
The commitment is a SHA-256 over the prediction plus a random salt, stored first; the truth is read from the sealed injector log only afterwards.
No equipment is actuated and no production system is written to."""
import hashlib, json, os, random, time
from plant import incidents
from fabric import agents, gateway
from shadow import sage


def seal(pred):
    salt = os.urandom(8).hex()
    body = json.dumps(pred, sort_keys=True)
    return {"commit": hashlib.sha256((salt + body).encode()).hexdigest(), "salt": salt, "body": body, "sealed_at": time.time()}


def verify(c):
    return hashlib.sha256((c["salt"] + c["body"]).encode()).hexdigest() == c["commit"]


def run_shadow(boundaries, selector, n=10, seed=5, vehicles=12, use_gemini=False, on_event=None, memory=None):
    rnd = random.Random(seed)
    classes = list(sage.PRIORS)
    log, memory = [], list(memory or [])
    for i in range(n):
        cls = rnd.choices(classes, [sage.PRIORS[c]["w"] for c in classes])[0]
        ctx = sage.sample_context(cls, rnd)
        inc = incidents.run_incident(cls, n=vehicles, seed=5000 + i)
        alert = {**incidents.alert_of(inc), "mos": inc["mos"]}
        k, _ = selector.choose(ctx, explore=False)
        strat = sage.STRATS[k]
        gw = gateway.Gateway(boundaries)
        agent = agents.GeminiAgent(gw, alert, strat) if use_gemini else agents.RuleAgent(gw, alert, agents.STRATEGIES[strat])
        pred = agent.run()
        committed = seal({"incident": i, "class": pred["class"], "component": pred["component"], "confidence": pred["confidence"], "strategy": strat})
        if on_event:
            on_event({"type": "sealed", "i": i, "ctx": ctx, "strategy": strat, "commit": committed["commit"][:16], "missing": len(inc["missing"])})
        # only now is the truth read
        truth = {"class": inc["class"], "component": inc["component"]}
        ok = pred["class"] == truth["class"]
        rec = {"i": i, "ctx": ctx, "strategy": strat, "alert": alert["title"], "prediction": {"class": pred["class"], "component": pred["component"], "confidence": pred["confidence"]},
               "truth": truth, "correct": ok, "component_correct": pred["component"] == truth["component"], "calls": pred["calls"],
               "reward": round(sage.reward(ok, pred["calls"]), 3), "commit": committed["commit"], "commit_valid": verify(committed),
               "agent": pred["agent"], "evidence": pred["evidence"], "explanation": pred["explanation"]}
        log.append(rec)
        memory.append({"ctx": ctx, "class": truth["class"], "strategy": strat, "reward": rec["reward"]})
        if on_event:
            on_event({"type": "revealed", **rec})
    n_ok = sum(r["correct"] for r in log)
    return {"incidents": log, "summary": {"n": len(log), "top1": round(n_ok / max(1, len(log)), 3), "mean_calls": round(sum(r["calls"] for r in log) / max(1, len(log)), 2),
                                           "all_commits_valid": all(r["commit_valid"] for r in log), "agent": log[0]["agent"] if log else None}}
