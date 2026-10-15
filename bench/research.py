"""Research-style analysis on the data already in the repository. Nothing is downloaded and nothing is re-run: it reads the per-case rankings in bench/results/components.json
(official BARO collapsed to services, our metric probe, our trace probe, our log probe, on every RCAEval case we have) and the 465 scored incidents in seed/jig_backtest.json.
Every interval is a 95% percentile bootstrap over cases (10,000 resamples, seed 7). Paired differences resample the same cases for both methods.
Run:  python -m bench.research        Writes bench/results/research.json"""
import collections, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
rng = np.random.default_rng(7)
K = 20   # reciprocal-rank-fusion constant, fixed before looking at results (the same as bench/variants.py)
F1 = ("cpu", "mem", "delay", "loss")        # the four faults the BARO paper reports
F3 = ("f1", "f2", "f3", "f4", "f5")
B = 10000


def rrf(lists):
    sc = collections.defaultdict(float)
    for li in lists:
        for i, s in enumerate(li):
            sc[s] += 1.0 / (K + i + 1)
    return [s for s, _ in sorted(sc.items(), key=lambda x: -x[1])]


def hit(rank, truth, k):
    return 1.0 if truth in rank[:k] else 0.0


def avg5(rank, truth):
    return float(np.mean([hit(rank, truth, k) for k in range(1, 6)]))


def boot(vals, n=B):
    """Mean and 95% interval of a vector of per-case scores."""
    v = np.asarray(vals, float)
    idx = rng.integers(0, len(v), size=(n, len(v)))
    m = v[idx].mean(axis=1)
    return float(v.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5))


def paired(a, b, n=B):
    """Mean difference a - b over the same cases, its 95% interval, and the share of resamples where a does not beat b."""
    d = np.asarray(a, float) - np.asarray(b, float)
    idx = rng.integers(0, len(d), size=(n, len(d)))
    m = d[idx].mean(axis=1)
    return float(d.mean()), float(np.percentile(m, 2.5)), float(np.percentile(m, 97.5)), float((m <= 0).mean())


def rca():
    comp = json.load(open(os.path.join(HERE, "results", "components.json")))
    cases = []
    for k, c in comp.items():
        c = dict(c)
        c["id"] = k
        cases.append(c)
    methods = {
        "BARO (official, collapsed to services)": lambda c: c["baro"],
        "Ours: metric shift": lambda c: c["ours"],
        "Ours + traces + logs": lambda c: rrf([c["ours"], c["traces"], c["logs"]]),
        "BARO + ours": lambda c: rrf([c["baro"], c["ours"]]),
        "BARO + ours + traces + logs": lambda c: rrf([c["baro"], c["ours"], c["traces"], c["logs"]]),
    }
    out = {"n_cases": len(cases), "cells": {}, "faults": {}, "paired": {}, "sources": {}}
    scored = {m: {c["id"]: avg5(f(c), c["truth"]) for c in cases} for m, f in methods.items()}
    ac1 = {m: {c["id"]: hit(f(c), c["truth"], 1) for c in cases} for m, f in methods.items()}
    ac3 = {m: {c["id"]: hit(f(c), c["truth"], 3) for c in cases} for m, f in methods.items()}

    def sel(suite, system, faults):
        return [c for c in cases if c["suite"] == suite and (system is None or c["system"] == system) and c["fault"] in faults]

    # 1. the table: suite x system, every method, with intervals
    for suite, faults in (("RE1", F1), ("RE3", F3)):
        for system in ("ob", "ss", "tt"):
            cs = sel(suite, system, faults)
            if not cs:
                continue
            row = {"n": len(cs)}
            for m in methods:
                row[m] = {"avg5": boot([scored[m][c["id"]] for c in cs]), "ac1": boot([ac1[m][c["id"]] for c in cs]), "ac3": boot([ac3[m][c["id"]] for c in cs])}
            out["cells"][f"{suite}|{system}"] = row
    # 2. by fault family, all systems pooled (RE1: five resource faults)
    for fault in ("cpu", "mem", "disk", "delay", "loss"):
        cs = [c for c in cases if c["suite"] == "RE1" and c["fault"] == fault]
        if cs:
            out["faults"][fault] = {"n": len(cs), **{m: boot([scored[m][c["id"]] for c in cs]) for m in ("BARO (official, collapsed to services)", "Ours: metric shift")}}
    # 3. paired differences against BARO on the same cases
    base = "BARO (official, collapsed to services)"
    for name, cs in (("RE1 all", [c for c in cases if c["suite"] == "RE1" and c["fault"] in F1]), ("RE1 Train Ticket", sel("RE1", "tt", F1)), ("RE1 Online Boutique", sel("RE1", "ob", F1)),
                     ("RE1 Sock Shop", sel("RE1", "ss", F1)), ("RE3 all", [c for c in cases if c["suite"] == "RE3"]), ("RE3 Sock Shop", sel("RE3", "ss", F3)),
                     ("RE3 Train Ticket", sel("RE3", "tt", F3)), ("RE3 Online Boutique", sel("RE3", "ob", F3))):
        if not cs:
            continue
        out["paired"][name] = {"n": len(cs)}
        for m in methods:
            if m != base:
                out["paired"][name][m] = paired([scored[m][c["id"]] for c in cs], [scored[base][c["id"]] for c in cs])
    # 4. does a second source help? RE3 cases that have traces and logs
    for flag, label in (("traces", "with traces"), ("logs", "with logs")):
        cs = [c for c in cases if c["suite"] == "RE3" and c[flag]]
        if cs:
            out["sources"][label] = {"n": len(cs), "BARO": boot([scored[base][c["id"]] for c in cs]), "Ours + traces + logs": boot([scored["Ours + traces + logs"][c["id"]] for c in cs]),
                                     "BARO + ours + traces + logs": boot([scored["BARO + ours + traces + logs"][c["id"]] for c in cs])}
    return out


def auroc(score, label):
    """Probability that a random correct case scores above a random wrong one (ties count half)."""
    s, y = np.asarray(score, float), np.asarray(label, int)
    pos, neg = s[y == 1], s[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    gt = (pos[:, None] > neg[None, :]).mean()
    eq = (pos[:, None] == neg[None, :]).mean()
    return float(gt + 0.5 * eq)


def autonomy():
    sys.path.insert(0, ROOT)
    from foreman.safety import ACTIONS
    items = [i for i in json.load(open(os.path.join(ROOT, "seed", "jig_backtest.json")))["items"] if "score" in i]
    y = np.array([1 if i["correct"] else 0 for i in items])
    conf = np.array([float(i.get("confidence") or 0) for i in items])
    score = np.array([float(i["score"]) for i in items])
    rev = np.array([ACTIONS[i["kind"]]["rev"] for i in items])
    n = len(items)
    harm = (1 - y) * (1 - rev)      # a wrong action costs more when it is hard to undo (the action table's own reversibility values)
    out = {"n": n, "diagnosis_correct": float(y.mean()), "auroc": {"Warden score": auroc(score, y), "Diagnosis confidence only": auroc(conf, y)}, "curves": {}, "at": {}}
    # policies: run alone for the top share of incidents by a ranking, a person handles the rest
    rank = {"Always run alone": np.zeros(n), "Diagnosis confidence only": conf, "Warden score": score, "Random order": rng.random(n)}
    for name, key in rank.items():
        order = np.argsort(-key, kind="stable") if name != "Always run alone" else np.arange(n)
        pts = []
        for cov in range(5, 101, 5):
            m = int(round(n * cov / 100))
            top = order[:m]
            pts.append({"coverage": cov, "wrong_per_100": float(100 * (1 - y[top]).mean()) if m else 0.0, "wrong_total": int((1 - y[top]).sum()), "harm": float(harm[top].sum())})
        out["curves"][name] = pts
    # a fixed operating point: the share Warden lets run alone at the default lines (limit 80), and the same share under the other rankings
    auto = score >= 80
    share = float(auto.mean())
    m = int(auto.sum())
    out["at"] = {"limit": 80, "auto": m, "share": share}
    for name, key in rank.items():
        if name == "Always run alone":
            top = np.arange(n)
        else:
            top = np.argsort(-key, kind="stable")[:m]
        out["at"][name] = {"run_alone": int(len(top)), "wrong": int((1 - y[top]).sum()), "harm": float(harm[top].sum()), "precision": float(y[top].mean())}
    # bootstrap the Warden vs confidence difference in wrong-per-100 at the same coverage
    diffs = []
    for _ in range(2000):
        idx = rng.integers(0, n, size=n)
        yy, cc, ss = y[idx], conf[idx], score[idx]
        mm = max(1, int(round(n * share)))
        wa = (1 - yy[np.argsort(-ss, kind="stable")[:mm]]).mean()
        ca = (1 - yy[np.argsort(-cc, kind="stable")[:mm]]).mean()
        diffs.append(100 * (ca - wa))
    out["at"]["wrong_per_100_gain_vs_confidence"] = [float(np.mean(diffs)), float(np.percentile(diffs, 2.5)), float(np.percentile(diffs, 97.5))]
    # the two together: only incidents the gate would let run (score >= limit), ranked by diagnosis confidence, against confidence alone with no gate
    elig = np.where(score >= 80)[0]
    joint = elig[np.argsort(-conf[elig], kind="stable")]
    allc = np.argsort(-conf, kind="stable")
    out["joint"] = []
    for k in (25, 50, 75, 100, len(elig)):
        out["joint"].append({"k": int(k), "gate_and_confidence": {"wrong": int((1 - y[joint[:k]]).sum()), "harm": float(harm[joint[:k]].sum())},
                             "confidence_only": {"wrong": int((1 - y[allc[:k]]).sum()), "harm": float(harm[allc[:k]].sum())},
                             "gate_only": {"wrong": int((1 - y[np.argsort(-score, kind="stable")[:k]]).sum()), "harm": float(harm[np.argsort(-score, kind="stable")[:k]].sum())}})
    boots = []
    for _ in range(2000):
        idx = rng.integers(0, n, size=n)
        boots.append(auroc(score[idx], y[idx]) - auroc(conf[idx], y[idx]))
    out["auroc_gain"] = [float(np.mean(boots)), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))]
    return out


if __name__ == "__main__":
    res = {"rca": rca(), "autonomy": autonomy()}
    path = os.path.join(HERE, "results", "research.json")
    json.dump(res, open(path, "w"), indent=1)
    r = res["rca"]
    print("cases", r["n_cases"])
    base = "BARO (official, collapsed to services)"
    for k, row in r["cells"].items():
        b, o, f = row[base]["avg5"], row["Ours: metric shift"]["avg5"], row["Ours + traces + logs"]["avg5"]
        print(f"{k:8} n={row['n']:3}  BARO {b[0]:.3f} [{b[1]:.2f},{b[2]:.2f}]  ours {o[0]:.3f} [{o[1]:.2f},{o[2]:.2f}]  ours+T+L {f[0]:.3f} [{f[1]:.2f},{f[2]:.2f}]")
    for k, row in r["paired"].items():
        o = row["Ours: metric shift"]
        f = row["Ours + traces + logs"]
        g = row["BARO + ours + traces + logs"]
        print(f"paired {k:20} n={row['n']:3} ours-BARO {o[0]:+.3f} [{o[1]:+.2f},{o[2]:+.2f}] p={o[3]:.3f} | ours+T+L {f[0]:+.3f} [{f[1]:+.2f},{f[2]:+.2f}] p={f[3]:.3f} | all {g[0]:+.3f} [{g[1]:+.2f},{g[2]:+.2f}] p={g[3]:.3f}")
    for k, v in r["faults"].items():
        print("fault", k, v["n"], {m: round(v[m][0], 3) for m in (base, "Ours: metric shift")})
    for k, v in r["sources"].items():
        print("sources", k, v["n"], {m: round(v[m][0], 3) for m in ("BARO", "Ours + traces + logs", "BARO + ours + traces + logs")})
    a = res["autonomy"]
    print("autonomy n", a["n"], "diagnosis correct", round(a["diagnosis_correct"], 3), "auroc", {k: round(v, 3) for k, v in a["auroc"].items()}, "gain", [round(x, 3) for x in res["autonomy"]["auroc_gain"]])
    print("at", {k: (v if not isinstance(v, dict) else v) for k, v in a["at"].items()})
