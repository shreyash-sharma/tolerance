"""Choose fusion weights by leave-one-group-out cross-validation (groups = suite x system), so the reported score on each group comes from weights that never saw it.
Components are cached per case; weights searched on a small fixed grid; scored with the official RCAEval Evaluator (coarse, Avg@5)."""
import collections, itertools, json, os, sys, time, warnings
warnings.filterwarnings("ignore")
from bench.official import load
baro, Evaluator, Node = load()
from bench.variants import baro_services, probe_services
from rca import data as D

CACHE = "bench/results/components.json"
K = 20


def components():
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    idx = D.index()
    idx = idx[idx.suite.isin(["RE1", "RE3"])]
    out = {}
    for n, r in enumerate(idx.itertuples(), 1):
        try:
            b, _ = baro_services(r.case, r.system, r.suite)
        except Exception:
            continue
        out[r.case] = {"suite": r.suite, "system": r.system, "fault": r.fault, "truth": r.root_cause_service, "baro": b, "ours": probe_services(r.case, "metrics"),
                       "traces": probe_services(r.case, "traces"), "logs": probe_services(r.case, "logs")}
        if n % 100 == 0:
            print(n, flush=True)
    json.dump(out, open(CACHE, "w"))
    return out


def fuse(c, w):
    sc = collections.defaultdict(float)
    for name, wt in zip(("baro", "ours", "traces", "logs"), w):
        if wt:
            for i, s in enumerate(c[name]):
                sc[s] += wt / (K + i + 1)
    return [s for s, _ in sorted(sc.items(), key=lambda x: -x[1])]


def avg5(cases, w):
    e = Evaluator()
    for c in cases:
        e.add_case([Node(entity=s, metric="x") for s in fuse(c, w)] or [Node(entity="?", metric="x")], Node(entity=c["truth"], metric="x"))
    return e.average_service(5)


def main():
    comp = components()
    groups = collections.defaultdict(list)
    for case, c in comp.items():
        f4 = c["suite"] == "RE1" and c["fault"] in ("cpu", "mem", "delay", "loss")
        if c["suite"] == "RE3" or f4:
            groups[(c["suite"], c["system"])].append(c)
    grid = [w for w in itertools.product((0, .5, 1, 2), repeat=4) if sum(w) > 0]
    res = {}
    for held in groups:
        train = [c for g, cs in groups.items() if g != held for c in cs]
        best = max(grid, key=lambda w: avg5(train, w))
        res[held] = {"weights": best, "heldout_avg5": round(avg5(groups[held], best), 3), "n": len(groups[held])}
        print(held, res[held], flush=True)
    full = max(grid, key=lambda w: avg5([c for cs in groups.values() for c in cs], w))
    print("weights on all data (for the shipped pipeline):", full)
    json.dump({"cv": {"|".join(k): v for k, v in res.items()}, "all_data_weights": full}, open("bench/results/cv.json", "w"), indent=1)


if __name__ == "__main__":
    main()
