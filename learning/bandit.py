"""The learner: a contextual bandit (Vowpal Wabbit) that chooses which evidence source to consult first when an incident arrives.
Context = what the alert looks like before anyone investigates (which telemetry exists, the family of the strongest metric shift).
Every decision a person makes is an event in a persisted log; the model is rebuilt from that log on start, so learning accumulates across sessions.
A "time-lapse" replays recorded outcomes of real incidents, so a short demo can show experience accumulating."""
import collections, json, os, random, threading, time
import vowpalwabbit

from plant import core
from rca import agent as AG

PATH = os.path.join(core.DATA, "learning.json")
LIB = os.path.join(core.ROOT, "seed", "rca_library.json")
LOCK = threading.RLock()
ARMS = list(AG.STRATEGIES)
FEATURES = ("coverage", "symptom")


def library():
    try:
        return json.load(open(LIB))
    except Exception:
        return []


def ctx_key(c):
    return f"{c['coverage']}|{c['symptom']}"


def _shared(ctx):
    return "shared |s " + " ".join(f"{k}={ctx[k]}" for k in FEATURES)


def _ex(ctx, chosen=None, cost=None, prob=None):
    lines = [_shared(ctx)]
    for k, a in enumerate(ARMS):
        lab = f"0:{cost}:{prob} " if chosen == k else ""
        lines.append(f"{lab}|a strategy={a}")
    return "\n".join(lines)


def reference_contexts(n=8):
    cnt = collections.Counter((x["ctx"]["coverage"], x["ctx"]["symptom"]) for x in library())
    return [{"coverage": c, "symptom": s} for (c, s), _ in cnt.most_common(n)]


class Learner:
    def __init__(self, epsilon=0.12, seed=3):
        self.epsilon, self.seed = epsilon, seed
        self.events = []
        self.ref = reference_contexts()
        self._new_vw()
        self._load()

    def _new_vw(self):
        self.vw = vowpalwabbit.Workspace(f"--cb_explore_adf --epsilon {self.epsilon} -q sa --quiet --random_seed {self.seed}")
        self.rnd = random.Random(self.seed)

    def _load(self):
        try:
            self.events = json.load(open(PATH))["events"]
        except Exception:
            self.events = []
        for e in self.events:
            self.vw.learn(_ex(e["ctx"], ARMS.index(e["arm"]), round(-e["reward"], 4), round(e["prob"], 4)))

    def _save(self):
        tmp = PATH + ".tmp"
        json.dump({"events": self.events}, open(tmp, "w"))
        os.replace(tmp, PATH)

    def reset(self):
        with LOCK:
            self.vw.finish()
            self._new_vw()
            self.events = []
            if os.path.exists(PATH):
                os.remove(PATH)

    def pmf(self, ctx):
        return self.vw.predict(_ex(ctx))

    def recommend(self, ctx):
        with LOCK:
            p = self.pmf(ctx)
            greedy = max(range(len(ARMS)), key=lambda j: p[j])
            return {"arm": ARMS[greedy], "pmf": {a: round(p[i], 3) for i, a in enumerate(ARMS)}, "decisions_so_far": len(self.events)}

    def snapshot(self):
        return {ctx_key(c): [round(x, 3) for x in self.pmf(c)] for c in self.ref}

    def record(self, ctx, arm, reward, source="human", incident=None, correct=None, calls=None, label=None):
        with LOCK:
            p = self.pmf(ctx)
            k = ARMS.index(arm)
            prob = max(p[k], 0.01)
            self.vw.learn(_ex(ctx, k, round(-reward, 4), round(prob, 4)))
            ev = {"i": len(self.events) + 1, "t": time.time(), "source": source, "incident": incident, "ctx": ctx, "arm": arm, "prob": round(prob, 4), "reward": round(reward, 4), "correct": correct, "calls": calls,
                  "label": label, "pmf": self.snapshot()}
            self.events.append(ev)
            self._save()
            return ev

    def timelapse(self, n=40, seed=None):
        """Replay recorded real incidents: the learner chooses an order, and receives what that order actually achieved on that case."""
        data = library()
        if not data:
            return []
        rnd = random.Random(seed if seed is not None else len(self.events) + 11)
        out = []
        for _ in range(n):
            h = rnd.choice(data)
            ctx = {k: h["ctx"][k] for k in FEATURES}
            with LOCK:
                p = self.pmf(ctx)
                k = self.rnd.choices(range(len(ARMS)), p)[0]
            o = h["outcomes"][ARMS[k]]
            out.append(self.record(ctx, ARMS[k], o["reward"], source="replay", correct=o["correct"], calls=o["calls"], label=h["case"]))
        return out

    def stats(self):
        ev = self.events
        cum, run = [], 0
        for e in ev:
            run += e["reward"]
            cum.append(round(run / (len(cum) + 1), 4))
        arms = {a: sum(1 for e in ev if e["arm"] == a) for a in ARMS}
        win = 15
        rolling = [round(sum(x["reward"] for x in ev[max(0, i - win + 1):i + 1]) / len(ev[max(0, i - win + 1):i + 1]), 3) for i in range(len(ev))]
        return {"n": len(ev), "arms": arms, "running_mean": cum, "rolling_mean": rolling, "human": sum(1 for e in ev if e["source"] == "human"), "replay": sum(1 for e in ev if e["source"] == "replay"),
                "latest": self.snapshot(), "arm_names": ARMS, "refs": [ctx_key(c) for c in self.ref], "series": [{"i": e["i"], "source": e["source"], "arm": e["arm"], "reward": e["reward"], "pmf": e["pmf"], "ctx": e["ctx"], "calls": e.get("calls"), "label": e.get("label")} for e in ev]}


def evaluate(train_frac=0.7, shuffles=10):
    """Offline check on the recorded real incidents: the bandit trained online on a shuffled stream, then frozen on held-out cases, against fixed orders and the best possible choice."""
    import statistics
    data = library()
    res = collections.defaultdict(list)
    for sh in range(shuffles):
        rnd = random.Random(sh)
        d = data[:]
        rnd.shuffle(d)
        k = int(len(d) * train_frac)
        train, test = d[:k], d[k:]
        vw = vowpalwabbit.Workspace(f"--cb_explore_adf --epsilon 0.12 -q sa --quiet --random_seed {sh}")
        for h in train:
            ctx = {f: h["ctx"][f] for f in FEATURES}
            p = vw.predict(_ex(ctx))
            a = rnd.choices(range(len(ARMS)), p)[0]
            vw.learn(_ex(ctx, a, round(-h["outcomes"][ARMS[a]]["reward"], 4), round(max(p[a], .01), 4)))
        def score(pick):
            return statistics.mean(h["outcomes"][ARMS[pick(h)]]["reward"] for h in test)
        res["bandit"].append(score(lambda h: max(range(3), key=lambda j: vw.predict(_ex({f: h["ctx"][f] for f in FEATURES}))[j])))
        for j, a in enumerate(ARMS):
            res["fixed:" + a].append(score(lambda h, j=j: j))
        res["oracle"].append(score(lambda h: max(range(3), key=lambda j: h["outcomes"][ARMS[j]]["reward"])))
        vw.finish()
    return {k: {"mean": round(statistics.mean(v), 3), "sd": round(statistics.pstdev(v), 3)} for k, v in res.items()}


LEARNER = None


def get():
    global LEARNER
    if LEARNER is None:
        LEARNER = Learner()
    return LEARNER
