"""SAGE: Symbiotic Adaptive Guidance Engine.

  experience memory   every investigation is stored with its context, evidence and what each strategy cost
  strategy selector   a contextual bandit (Vowpal Wabbit, cb_explore_adf) picks which approved investigation order to try first
  evaluation          held-out incidents, several shuffles, against fixed, random and memory-lookup baselines

Feedback comes only from verified outcomes (was the diagnosis correct, how many tool calls did it take), never from the model grading itself.
The incident library is synthetic, including the priors that tie alert context to root-cause class. Read the results with that in mind."""
import json, os, random, statistics
import vowpalwabbit

from plant import core, incidents
from fabric import agents, gateway

STRATS = list(agents.STRATEGIES)
CALL_COST = 0.06
ALERTS = ["dlq_alert", "erp_reconciliation", "operator_report", "line_audit"]
PRIORS = {  # synthetic assumption: how an incident of each class usually first shows up
    "INGEST_TRANSFORM_FAILURE": dict(w=.30, alert=[.55, .25, .10, .10], deploy=.60),
    "ERP_SYNC_FAILURE": dict(w=.25, alert=[.25, .50, .15, .10], deploy=.30),
    "GENEALOGY_JOIN_GAP": dict(w=.25, alert=[.10, .35, .35, .20], deploy=.15),
    "STATION_SCAN_FAILURE": dict(w=.20, alert=[.05, .10, .50, .35], deploy=.05),
}
DATASET = os.path.join(core.DATA, "sage_dataset.json")
_SEED = os.path.join(core.ROOT, "seed", "sage_dataset.json")
if not os.path.exists(DATASET) and os.path.exists(_SEED):  # first start of a fresh container
    import shutil
    shutil.copyfile(_SEED, DATASET)


def sample_context(cls, rnd):
    p = PRIORS[cls]
    return {"alert": rnd.choices(ALERTS, p["alert"])[0], "deploy": int(rnd.random() < p["deploy"]), "shift": rnd.choice("ABC"), "size": rnd.choice(["small", "large"])}


SIGNATURE = {"INGEST_TRANSFORM_FAILURE": "dlq_alert", "ERP_SYNC_FAILURE": "erp_reconciliation", "GENEALOGY_JOIN_GAP": "line_audit", "STATION_SCAN_FAILURE": "operator_report"}


def recontext(data, alpha, seed=0):
    """Same incidents and same real outcomes, new alert contexts. alpha = how much the first alert reveals about the failing layer
    (0: the alert source says nothing; 1: it almost always points at the failing layer)."""
    rnd = random.Random(seed)
    out = []
    for h in data:
        sig = SIGNATURE[h["class"]]
        alert = sig if rnd.random() < 0.9 * alpha else rnd.choice(ALERTS)
        out.append({**h, "ctx": {**h["ctx"], "alert": alert}})
    return out


def sensitivity(data, alphas=(0.0, 0.25, 0.5, 0.75, 1.0), shuffles=8):
    rows = []
    for a in alphas:
        r = evaluate(recontext(data, a), train_n=int(len(data) * 0.75), shuffles=shuffles)["policies"]
        best_fixed = max((k for k in r if k.startswith("fixed")), key=lambda k: r[k]["reward"]["mean"])
        rows.append({"alpha": a, "bandit": r["bandit"]["reward"]["mean"], "memory": r["memory"]["reward"]["mean"], "best_fixed": r[best_fixed]["reward"]["mean"],
                     "best_fixed_name": best_fixed, "oracle": r["oracle"]["reward"]["mean"], "bandit_sd": r["bandit"]["reward"]["sd"]})
    return rows


def reward(correct, calls):
    return (1.0 if correct else 0.0) - CALL_COST * calls


def build_dataset(boundaries, n=100, seed=11, vehicles=12, progress=None):
    """Run n real incidents through the plant; record every strategy's real outcome. (Counterfactual logging is what makes held-out evaluation possible.)"""
    rnd = random.Random(seed)
    classes = list(PRIORS)
    out = []
    for i in range(n):
        cls = rnd.choices(classes, [PRIORS[c]["w"] for c in classes])[0]
        ctx = sample_context(cls, rnd)
        inc = incidents.run_incident(cls, n=vehicles, seed=1000 + i)
        alert = {**incidents.alert_of(inc), "mos": inc["mos"]}
        outcomes = {}
        for s in STRATS:
            gw = gateway.Gateway(boundaries)
            r = agents.RuleAgent(gw, alert, agents.STRATEGIES[s]).run()
            outcomes[s] = {"correct": r["class"] == cls, "calls": r["calls"], "reward": round(reward(r["class"] == cls, r["calls"]), 3), "class": r["class"]}
        out.append({"i": i, "class": cls, "ctx": ctx, "outcomes": outcomes})
        if progress:
            progress(i + 1, n)
    json.dump(out, open(DATASET, "w"))
    return out


def load_dataset():
    return json.load(open(DATASET)) if os.path.exists(DATASET) else None


# ------------------------------------------------------------------ the bandit
def _shared(ctx):
    return f"shared |s alert={ctx['alert']} deploy={ctx['deploy']} shift={ctx['shift']} size={ctx['size']}"


def _ex(ctx, chosen=None, cost=None, prob=None):
    lines = [_shared(ctx)]
    for k, s in enumerate(STRATS):
        lab = f"0:{cost}:{prob} " if chosen == k else ""
        lines.append(f"{lab}|a strategy={s}")
    return "\n".join(lines)


class Selector:
    def __init__(self, epsilon=0.12, seed=0):
        self.vw = vowpalwabbit.Workspace(f"--cb_explore_adf --epsilon {epsilon} -q sa --quiet --random_seed {seed}")
        self.rnd = random.Random(seed)

    def pmf(self, ctx):
        return self.vw.predict(_ex(ctx))

    def choose(self, ctx, explore=True):
        p = self.pmf(ctx)
        k = self.rnd.choices(range(len(STRATS)), p)[0] if explore else max(range(len(STRATS)), key=lambda j: p[j])
        return k, p[k]

    def learn(self, ctx, k, prob, rew):
        self.vw.learn(_ex(ctx, k, round(-rew, 4), round(prob, 4)))

    def close(self):
        self.vw.finish()


def memory_choice(history, ctx, k=7):
    """Retrieval baseline: strategy with the best average reward among the k most similar remembered incidents."""
    def sim(h):
        return (h["ctx"]["alert"] == ctx["alert"]) * 2 + (h["ctx"]["deploy"] == ctx["deploy"]) + (h["ctx"]["size"] == ctx["size"]) * .3
    near = sorted(history, key=lambda h: -sim(h))[:k]
    if not near:
        return 1
    avg = [statistics.mean(h["outcomes"][s]["reward"] for h in near) for s in STRATS]
    return max(range(len(STRATS)), key=lambda j: avg[j])


def evaluate(data, train_n=70, shuffles=12):
    """Online learning over a shuffled stream, then a frozen greedy policy on held-out incidents. Mean and spread across shuffles."""
    res = {k: [] for k in ["bandit", "memory", "fixed:" + STRATS[0], "fixed:" + STRATS[1], "fixed:" + STRATS[2], "random", "oracle"]}
    calls = {k: [] for k in res}
    acc = {k: [] for k in res}
    curves = []
    for sh in range(shuffles):
        rnd = random.Random(sh)
        d = data[:]
        rnd.shuffle(d)
        train, test = d[:train_n], d[train_n:]
        sel = Selector(seed=sh)
        cum, curve = 0, []
        for t, h in enumerate(train):
            k, prob = sel.choose(h["ctx"])
            r = h["outcomes"][STRATS[k]]["reward"]
            sel.learn(h["ctx"], k, prob, r)
            cum += r
            curve.append(cum / (t + 1))
        curves.append(curve)

        def score(name, pick):
            rs = [h["outcomes"][STRATS[pick(h)]] for h in test]
            res[name].append(statistics.mean(o["reward"] for o in rs))
            calls[name].append(statistics.mean(o["calls"] for o in rs))
            acc[name].append(statistics.mean(1.0 if o["correct"] else 0.0 for o in rs))
        score("bandit", lambda h: sel.choose(h["ctx"], explore=False)[0])
        score("memory", lambda h: memory_choice(train, h["ctx"]))
        for j, s in enumerate(STRATS):
            score("fixed:" + s, lambda h, j=j: j)
        score("random", lambda h: rnd.randrange(3))
        score("oracle", lambda h: max(range(3), key=lambda j: h["outcomes"][STRATS[j]]["reward"]))
        sel.close()
    stat = lambda xs: {"mean": round(statistics.mean(xs), 3), "sd": round(statistics.pstdev(xs), 3)}
    avgcurve = [round(statistics.mean(c[t] for c in curves), 3) for t in range(len(curves[0]))]
    return {"n_train": train_n, "n_test": len(data) - train_n, "shuffles": shuffles,
            "policies": {k: {"reward": stat(res[k]), "calls": stat(calls[k]), "accuracy": stat(acc[k])} for k in res},
            "learning_curve": avgcurve,
            "note": "synthetic incident library with synthetic context priors; all diagnoses are produced by the rule-based investigator, so differences come from strategy choice, not model skill"}
