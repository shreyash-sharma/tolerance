"""Guide: a failed suggestion never stops the flow, and a job that failed before saying anything is tried once more. Run:  python tests/guide_flow_test.py"""
import os, sys, tempfile
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_job_")
sys.path.insert(0, ".")
from foreman import guide as G
# the real shape: claims is a list in state()["claims"], and a count inside the per-document rows
G.DE.state = lambda: {"docs": [{"name": "a.md", "claims": 3}], "claims": [{"subject": "OVN1", "predicate": "max_temp_c", "value": 260}], "conflicts": [], "ghosts": [], "guardrails": []}
G._ask = lambda system, payload, default: ({"options": ["EV battery packs"]}, "x")
assert G._goal_options() == ["EV battery packs"]
G.DE.state = lambda: (_ for _ in ()).throw(RuntimeError("boom"))
assert G._goal_options() == []
G._ask = lambda system, payload, default: (default, "rule")   # the model gives nothing: words in the documents still point at the product
G.DE.state = lambda: {"docs": [], "claims": [], "conflicts": [], "ghosts": [], "guardrails": []}
G.DE.list_docs = lambda include_seed=None: [{"name": "a.md", "text": "The reflow oven profile and the AOI result for the PCB line."}]
assert G._goal_options() == ["Printed circuit boards"], G._goal_options()
print("goal options never fatal ok")
# a job that fails before saying anything runs twice
import time
calls = []
def flaky():
    calls.append(1)
    if len(calls) == 1: raise ValueError("transient")
    G._say("done")
G.JOB.update(busy=False)
assert G._job("t", flaky)
t = time.time()
while G.JOB["busy"] and time.time() - t < 10: time.sleep(0.1)
chat = [m["text"] for m in G.PL.get()["chat"]]
print(calls, chat)
assert len(calls) == 2 and chat == ["done"]
# a job that fails after saying something is not repeated
calls.clear()
def late():
    calls.append(1); G._say("half"); raise ValueError("late")
assert G._job("t2", late)
t = time.time()
while G.JOB["busy"] and time.time() - t < 10: time.sleep(0.1)
chat = [m["text"] for m in G.PL.get()["chat"]]
print(calls, chat)
assert len(calls) == 1 and chat[-1].startswith("Something went wrong")
print("retry ok")
