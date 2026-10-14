"""Tests for the Foreman agents and Warden. No Gemini needed: the model-free parts are tested on fixed inputs.
Run from the repo root:  .venv\\Scripts\\python.exe -m tests.foreman_test"""
import sys, tempfile, os

os.environ.setdefault("TOLERANCE_DATA", tempfile.mkdtemp(prefix="foreman_test_"))
from foreman import safety, gate, agents, core, guide
from workspace import store

LIM = [
    {"subject": "TR", "predicate": "max_speed_pct", "value": 60, "doc": "SOP", "quote": "the arm must not exceed 60 percent"},
    {"subject": "TR", "predicate": "max_consecutive_faults", "value": 3, "doc": "SOP", "quote": "after three faults stop the arm"},
    {"subject": "TR", "predicate": "maintenance_window", "value": "22:00-05:00", "doc": "SOP", "quote": "preventive work at night only"},
    {"subject": "ORDER", "predicate": "approval_threshold_eur", "value": 5000, "doc": "Policy", "quote": "above 5000 EUR a supervisor approves"},
]
CTX = dict(evidence=0.9, state="idle", consecutive_faults=0, n_affected=0, plant_time="23:00", limits=LIM)
FAILED = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  ({extra})" if extra and not cond else ""))
    if not cond:
        FAILED.append(name)


def sc(kind, params=None, **over):
    return safety.score_action({"kind": kind, "station": "TR", "params": params or {}}, {**CTX, **over})


def main():
    safety.set_settings(40, 80)

    # --- hard limits can never be overridden by the score
    r = sc("adjust_speed", {"max_speed_pct": 85}, evidence=1.0)
    check("speed above the limit is blocked", r["decision"] == "blocked" and not r["within_limits"], r["decision"])
    check("a blocked action can still have a high score", r["score"] >= 60, r["score"])
    r = sc("adjust_speed", {"max_speed_pct": 50})
    check("speed below the limit is not blocked", r["decision"] != "blocked")
    r = sc("restart_station", consecutive_faults=3)
    check("restart after three faults in a row is blocked", r["decision"] == "blocked")
    r = sc("schedule_maintenance", {"type": "preventive"}, plant_time="14:00")
    check("preventive maintenance outside its window is blocked", r["decision"] == "blocked")
    r = sc("schedule_maintenance", {"type": "preventive"}, plant_time="23:00")
    check("preventive maintenance inside its window is allowed", r["decision"] != "blocked")
    r = sc("schedule_maintenance", {"type": "preventive"}, plant_time="03:00")
    check("a window that crosses midnight works after midnight", r["decision"] != "blocked")
    r = safety.score_action({"kind": "reroute_orders", "station": "TR", "params": {}}, {**CTX, "order_value": 9000})
    check("an order above the approval threshold needs a person even at a high score", r["decision"] == "approve" and r["needs_person"])

    # --- the two lines
    hi = sc("inspect", state="idle", evidence=1.0)
    check("a safe inspect with strong evidence runs alone", hi["decision"] == "auto" and hi["score"] >= 80, hi["score"])
    lo = sc("stop_station", evidence=0.0, n_affected=4, state="busy")
    check("a weak, wide, hard-to-undo action is refused", lo["decision"] == "refuse", f"{lo['decision']} {lo['score']}")
    mid = sc("restart_station", evidence=0.7, n_affected=2, state="busy")
    check("a middle score waits for a person", mid["decision"] == "approve", f"{mid['decision']} {mid['score']}")
    safety.set_settings(40, 99)
    check("raising the limit moves an action from auto to approve", sc("inspect", evidence=1.0)["decision"] == "approve")
    safety.set_settings(40, 80)
    try:
        safety.set_settings(80, 40)
        check("floor above limit is rejected", False)
    except ValueError:
        check("floor above limit is rejected", True)

    # --- the Cedar gate at the broker
    ok, _ = gate.decide_apply({"within_limits": True, "needs_person": False, "warden_score": 90, "auto_limit": 80, "human_approved": False})
    check("Cedar permits an action above the limit that needs no person", ok)
    ok, _ = gate.decide_apply({"within_limits": True, "needs_person": True, "warden_score": 70, "auto_limit": 80, "human_approved": False})
    check("Cedar refuses a middle action without a person", not ok)
    ok, _ = gate.decide_apply({"within_limits": True, "needs_person": True, "warden_score": 70, "auto_limit": 80, "human_approved": True})
    check("Cedar permits a middle action after a person approved", ok)
    ok, _ = gate.decide_apply({"within_limits": False, "needs_person": False, "warden_score": 99, "auto_limit": 80, "human_approved": True})
    check("Cedar refuses a hard-limit break even at score 99 with approval", not ok)
    ok, _ = gate.decide_apply({"within_limits": True, "needs_person": False, "warden_score": 79, "auto_limit": 80, "human_approved": False})
    check("Cedar refuses a score one point under the limit", not ok)

    # --- the broker applies only what Cedar permits
    s = sc("inspect", evidence=1.0)
    rec = safety.apply(s)
    check("the broker applies an auto action in the simulator", rec["decision_by_cedar"] and rec["mode"] == "auto" and "simulator" in rec["status"])
    s = sc("restart_station", evidence=0.7, n_affected=2, state="busy")
    rec = safety.apply(s)
    check("the broker does not apply a middle action alone", not rec["decision_by_cedar"] and rec["mode"] == "refused")
    rec = safety.apply(s, approved_by="operator")
    check("the broker applies it after approval", rec["decision_by_cedar"] and rec["mode"] == "person")
    s = sc("adjust_speed", {"max_speed_pct": 85})
    check("the broker never applies a hard-limit break, even with approval", not safety.apply(s, approved_by="operator")["decision_by_cedar"])
    s = sc("stop_station", evidence=0.0, n_affected=4, state="busy")
    check("the broker does not apply below the floor, even with approval", not safety.apply(s, approved_by="operator")["decision_by_cedar"])

    # --- agent access: each agent may only call read-only MCP tools through the gateway
    r = gate.call("scout", "telemetry/list_stations")
    check("an agent may call a read-only tool", r.get("ok"), str(r)[:120])
    r = gate.call("scout", "telemetry/drop_everything")
    check("an agent is denied a tool that does not exist", not r.get("ok"))

    # --- the Verifier's hard check rejects a number that is not in the data
    real = gate.call
    gate.call = lambda agent, tool, args=None, context=None: {"ok": True, "result": {"failures": 1, "mean_ttr_s": 8.9, "episodes": [{"duration_s": 8.9}]}}
    try:
        bad = agents.run_verifier("TR", {"cause": "x", "confidence": 0.9, "evidence": [{"tool": "t", "claim": "failed 2 times", "number": 2}]})["result"]
        good = agents.run_verifier("TR", {"cause": "x", "confidence": 0.9, "evidence": [{"tool": "t", "claim": "failed 1 time", "number": 1}]})["result"]
    finally:
        gate.call = real
    check("the Verifier rejects a cited number that is not in the data", bad["hard_ok"] is False and bad["supported"] is False and bad["evidence"] == 0.0)
    check("the Verifier accepts a number that matches", good["hard_ok"] is True)


    # --- the Gemma fallback: used only when Gemini does not answer, labelled, and switched off by FALLBACK_GEMMA=0
    from foreman import llm
    saved = (llm.available, llm._gemma_json, os.environ.get("FIREWORKS_API_KEY"), os.environ.get("FALLBACK_GEMMA"))
    llm.available = lambda: False
    llm._gemma_json = lambda system, user, timeout=30: ({"ok": True}, "gemma-test")
    try:
        os.environ["FIREWORKS_API_KEY"] = "test"; os.environ.pop("FALLBACK_GEMMA", None)
        out, src = llm.ask_json("verifier", "s", "fallback test one")
        check("when Gemini is unavailable, Gemma answers and is labelled", src == "gemma" and out == {"ok": True}, src)
        check("the ledger records the fallback as Fireworks", llm.LEDGER[-1]["provider"] == "fireworks" and llm.LEDGER[-1]["source"] == "fallback")
        os.environ["FALLBACK_GEMMA"] = "0"
        try:
            llm.ask_json("verifier", "s", "fallback test two")
            check("FALLBACK_GEMMA=0 switches the fallback off", False)
        except llm.LLMUnavailable:
            check("FALLBACK_GEMMA=0 switches the fallback off", True)
    finally:
        llm.available, llm._gemma_json = saved[0], saved[1]
        for k, v in (("FIREWORKS_API_KEY", saved[2]), ("FALLBACK_GEMMA", saved[3])):
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)


    # --- each signed-in visitor has their own plant, documents and Warden lines
    from foreman import plant as PLT
    from workspace import store as ST
    t1 = ST.UID.set("user-A")
    try:
        PLT.reset(); PLT.set_name("Plant A"); safety.set_settings(30, 70)
        ST.UID.reset(t1); t2 = ST.UID.set("user-B")
        PLT.reset(); PLT.set_name("Plant B")
        check("a second user starts with their own default Warden lines", safety.settings() == {"floor": 40, "limit": 80}, safety.settings())
        ST.UID.reset(t2); t3 = ST.UID.set("user-A")
        check("the first user's plant name is unchanged by the second", PLT.get()["name"] == "Plant A")
        check("the first user's Warden lines are unchanged", safety.settings() == {"floor": 30, "limit": 70})
        PLT.reset()
        ST.UID.reset(t3)
    finally:
        for u in ("user-A", "user-B"):
            tt = ST.UID.set(u); ST.reset(); ST.UID.reset(tt)
    check("the single-user mode is a separate store", ST.UID.get() == "local")

    # --- contracts
    cat = core.catalog()
    check("eight agents are registered", len(cat) == 8, len(cat))
    check("every agent says how it uses Gemini", all(c["gemini_use"] for c in cat))
    check("every agent lists what it must never do", all(c["forbidden"] for c in cat))
    check("only Warden and Verifier decide", sorted(c["id"] for c in cat if c["trust"] == "decide") == ["verifier", "warden"])

    print("\n%d failed" % len(FAILED) if FAILED else "\nall passed")
    sys.exit(1 if FAILED else 0)


if __name__ == "__main__":
    main()
