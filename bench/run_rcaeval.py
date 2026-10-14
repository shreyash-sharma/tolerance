"""Benchmark on RCAEval with the official BARO code and the official evaluator, next to our pipeline, under one protocol.
Protocol: for each case, rank candidates; score with RCAEval's Evaluator (AC@1, AC@3, Avg@5). Coarse = root-cause service, fine = root-cause metric (service + metric).
Run:  python -m bench.run_rcaeval [suite ...]    (default RE1 RE3)"""
import collections, json, sys, time, warnings
warnings.filterwarnings("ignore")

from bench.official import load
baro, Evaluator, Node = load()
from rca import data as D, probes as P

FINE = {"cpu": "cpu", "mem": "mem", "delay": "latency", "loss": "latency"}  # fault -> the metric that carries it (BARO paper, fine-grained)
FAULT4 = ("cpu", "mem", "delay", "loss")


def nodes_from_cols(cols):
    out = []
    for c in cols:
        ent, _, met = c.partition("_")
        out.append(Node(entity=ent, metric=met))
    return out


def ours_metrics(case):
    """Our metric ranking: services, best first (our robust shift score over each service's series)."""
    r = P.metric_probe(case, top=60)
    return [x["service"] for x in r["ranked"]]


def ours_fused(case):
    """Our fused ranking over every probe that exists for the case (metrics, traces, logs)."""
    res = []
    for k in ("metrics", "traces", "logs"):
        try:
            res.append(P.PROBES[k](case))
        except Exception:
            pass
    return [s for s, _ in P.fuse(res)]


def main(suites):
    idx = D.index()
    idx = idx[idx.suite.isin(suites)]
    ev = collections.defaultdict(lambda: collections.defaultdict(Evaluator))  # method -> (suite, system, fault) -> evaluator
    t0 = time.time()
    for n, r in enumerate(idx.itertuples(), 1):
        case, sysid, fault, svc, suite = r.case, r.system, r.fault, r.root_cause_service, r.suite
        try:
            m = D.metrics(case)
            inj = D.inject_time(case)
            b = baro(m, inject_time=inj, dataset=f"{suite.lower()}-{sysid}")["ranks"]
        except Exception as e:
            print("skip", case, type(e).__name__, str(e)[:80])
            continue
        key = (suite, sysid, fault)
        # official BARO: metric-level ranks, evaluated by the official Evaluator
        ev["BARO (official code)"][key].add_case(nodes_from_cols(b), Node(entity=svc, metric=FINE.get(fault, fault)))
        for name, fn in (("Ours: metrics", ours_metrics), ("Ours: fused (metrics+traces+logs)", ours_fused)):
            try:
                services = fn(case)
            except Exception:
                services = []
            ev[name][key].add_case([Node(entity=s, metric=FINE.get(fault, fault)) for s in services], Node(entity=svc, metric=FINE.get(fault, fault)))
        if n % 50 == 0:
            print(f"{n}/{len(idx)} cases, {time.time() - t0:.0f}s", flush=True)
    out = {}
    for method, groups in ev.items():
        out[method] = {}
        for key, e in groups.items():
            out[method]["|".join(key)] = {"n": e.num, "ac1": e.accuracy_service(1), "ac3": e.accuracy_service(3), "avg5": e.average_service(5), "fine_avg5": e.average(5)}
    path = f"bench/results/rcaeval_{int(time.time())}.json"
    json.dump(out, open(path, "w"), indent=1)
    print("saved", path)
    return out


def table(out, suite="RE1", faults=FAULT4):
    """Mean over the faults, per system, as the BARO paper reports (coarse Avg@5)."""
    rows = []
    for method, g in out.items():
        row = {"method": method}
        for sysid in ("ob", "ss", "tt"):
            v = [g[f"{suite}|{sysid}|{f}"]["avg5"] for f in faults if f"{suite}|{sysid}|{f}" in g]
            n = sum(g[f"{suite}|{sysid}|{f}"]["n"] for f in faults if f"{suite}|{sysid}|{f}" in g)
            row[sysid] = round(sum(v) / len(v), 3) if v else None
            row[sysid + "_n"] = n
        rows.append(row)
    return rows


if __name__ == "__main__":
    suites = sys.argv[1:] or ["RE1", "RE3"]
    out = main(suites)
    for s in suites:
        print(f"\n{s} coarse Avg@5 (mean over faults {FAULT4 if s == 'RE1' else 'f1-f5'}):")
        for r in table(out, s, FAULT4 if s == "RE1" else ("f1", "f2", "f3", "f4", "f5")):
            print("  ", r)
