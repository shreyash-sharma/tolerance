"""Tests Sentinel's Decide check with a stand-in for the model. Run:  python tests/sentinel_decide_test.py
What it proves: the labels are always from the owner's list or "unsure", a short or bad answer is never guessed, Laya says it is not installed,
and plain assertions judge the counts."""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sentinel import decide as D, engine as E

bad = 0


def check(name, ok, got=None):
    global bad
    if not ok:
        bad += 1
        print("FAIL", name, got if got is not None else "")


# labels from a stand-in model: one valid, one invented, and a short answer
calls = []


def fake_ask(agent, system, user, live=False, schema=None, **kw):
    calls.append(schema)
    import json
    n = len(json.loads(user)["texts"])
    return (["safety", "made_up_label", "routine"] + ["quality"] * 100)[:max(0, n - 1)], "gemini"   # one label short on purpose


D.llm.ask_json = fake_ask

check("labels are cleaned and 'unsure' is reserved", D.clean_options("Safety, Quality; routine, safety, unsure".replace(";", ",")) == ["safety", "quality", "routine"])
try:
    D.clean_options("only_one")
    check("one label is refused", False)
except ValueError:
    pass
try:
    D.clean_options(", ".join(f"l{i}" for i in range(12)))
    check("too many labels are refused", False)
except ValueError:
    pass

texts = ["a", "b", "c", "d"]
labels, src = D.classify(texts, "Which kind?", ["safety", "quality", "routine"])
check("an invented label becomes unsure", labels[1] == "unsure", labels)
check("a short answer is padded with unsure, not guessed", labels[3] == "unsure" and len(labels) == 4, labels)
check("the schema limits decoding to the labels and unsure", calls and calls[0]["items"]["enum"] == ["safety", "quality", "routine", "unsure"], calls)

try:
    D.classify(texts, "q", ["a", "b"], engine="laya")
    check("Laya must say it is not installed", False)
except ValueError as e:
    check("Laya message is plain", "not installed" in str(e), str(e))

# the counts feed plain assertions
obs = {"total": 4, "counts": {"safety": 1, "unsure": 3}, "share": {"safety": 0.25, "unsure": 0.75}, "unsure_share": 0.75}
check("a share is judged by a plain assertion", E.evaluate(obs, {"path": "share.safety", "op": "lte", "value": 0.3})["ok"])
check("a count is judged by a plain assertion", not E.evaluate(obs, {"path": "counts.safety", "op": "eq", "value": 0})["ok"])

print("decide tests:", "all passed" if not bad else f"{bad} failed")
sys.exit(1 if bad else 0)
