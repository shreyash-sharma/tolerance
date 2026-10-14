"""Foreman: the manufacturing layer under the Tolerance agents.

Ideas taken from Google ADK and AWS Strands (agents as tools, workflows, a critic loop, human gates, runbooks), shaped for a plant:
  Contract   what an agent is for, what it may touch and what it must never do (the catalog card)
  Run        a visible record of one agent's work: every model call, tool call and decision, with timing
  register   the catalog of agents, so the router and the UI read the same facts
Agents call the plant only through the policy gateway (foreman.gate). Every agent uses Gemini for at least one step."""
import threading, time, uuid
from dataclasses import dataclass, field, asdict

CONTRACTS = {}
FUNCS = {}
RUNS = {}
ORDER = []
LOCK = threading.RLock()


@dataclass
class Contract:
    id: str
    name: str
    team: str                 # onboarding | operations
    job: str                  # one sentence
    use_case: str
    solution: str
    outcomes: list
    inputs: list
    tools: list               # MCP tools or services it may call
    forbidden: list
    output: str
    success: str
    mode: str                 # model-driven | rule-driven | mixed
    gemini_use: str
    trust: str                # read | propose | decide
    origin: list = field(default_factory=list)   # open-source parts this layer builds on (kept in docs, not on slides)
    status: str = "built"


def register(contract, fn=None):
    CONTRACTS[contract.id] = contract
    if fn:
        FUNCS[contract.id] = fn
    return contract


def catalog():
    return [asdict(c) for c in CONTRACTS.values()]


class Run:
    """The visible work of one agent. Steps are appended as they happen so the screen can follow them."""

    def __init__(self, agent, title, parent=None, meta=None):
        self.id = "run_" + uuid.uuid4().hex[:8]
        self.agent = agent
        self.title = title
        self.parent = parent
        self.meta = meta or {}
        self.t0 = time.time()
        self.steps = []
        self.status = "running"
        self.result = None
        self.error = None
        self.source = None      # live | recorded | rule
        with LOCK:
            RUNS[self.id] = self
            ORDER.append(self.id)
            while len(ORDER) > 120:
                RUNS.pop(ORDER.pop(0), None)

    def step(self, kind, text, **data):
        s = {"t": round(time.time() - self.t0, 2), "kind": kind, "text": text}
        s.update({k: v for k, v in data.items() if v is not None})
        self.steps.append(s)
        return s

    def finish(self, result=None, source=None):
        self.result = result
        self.source = source or self.source
        self.status = "done"
        self.step("done", "finished")
        return result

    def fail(self, err):
        self.error = f"{type(err).__name__}: {err}"
        self.status = "failed"
        self.step("error", self.error)

    def public(self, with_result=True):
        out = {"id": self.id, "agent": self.agent, "title": self.title, "parent": self.parent, "status": self.status, "source": self.source, "seconds": round(time.time() - self.t0, 1),
               "steps": list(self.steps), "error": self.error, "meta": self.meta}
        if with_result:
            out["result"] = self.result
        return out


def get_run(rid):
    return RUNS.get(rid)


def recent(n=30):
    return [RUNS[i].public(with_result=False) for i in reversed(ORDER[-n:]) if i in RUNS]
