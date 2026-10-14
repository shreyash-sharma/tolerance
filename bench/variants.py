"""Fusion variants under one protocol (official RCAEval Evaluator, coarse = root-cause service).
Components per case: BARO's robust z-score collapsed to services; our robust-shift metric probe; our trace probe; our log probe.
Fusion: reciprocal-rank fusion (fixed k), chosen before looking at results; every variant is reported."""
import collections, json, sys, time, warnings
warnings.filterwarnings("ignore")
from bench.official import load
baro, Evaluator, Node = load()
from rca import data as D, probes as P

K = 20  # RRF constant


def baro_services(case, sysid, suite):
    m = D.metrics(case)
    ranks = baro(m, inject_time=D.inject_time(case), dataset=f"{suite.lower()}-{sysid}")["ranks"]
    seen, out = set(), []
    for c in ranks:
        s = c.partition("_")[0]
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out, ranks


def probe_services(case, name):
    try:
        r = P.PROBES[name](case) if name != "metrics" else P.metric_probe(case, top=80)
        return [x["service"] for x in r["ranked"] if x["score"] > 0]
    except Exception:
        return []


def rrf(lists, weights=None):
    sc = collections.defaultdict(float)
    for li, w in zip(lists, weights or [1] * len(lists)):
        for i, s in enumerate(li):
            sc[s] += w / (K + i + 1)
    return [s for s, _ in sorted(sc.items(), key=lambda x: -x[1])]


def main(suites):
    idx = D.index()
    idx = idx[idx.suite.isin(suites)]
    ev = collections.defaultdict(lambda: collections.defaultdict(Evaluator))
    t0 = time.time()
    for n, r in enumerate(idx.itertuples(), 1):
        case, sysid, fault, svc, suite = r.case, r.system, r.fault, r.root_cause_service, r.suite
        try:
            b_srv, b_raw = baro_services(case, sysid, suite)
        except Exception:
            continue
        om = probe_services(case, "metrics")
        tr = probe_services(case, "traces")
        lg = probe_services(case, "logs")
        V = {
            "BARO official (metric-level top-k)": [c.partition("_")[0] for c in b_raw],
            "BARO, one slot per service": b_srv,
            "Ours: metric shift": om,
            "BARO + ours (metrics)": rrf([b_srv, om]),
            "BARO + ours + traces + logs": rrf([b_srv, om, tr, lg]),
            "Ours + traces + logs (no BARO)": rrf([om, tr, lg]),
        }
        key = (suite, sysid, fault)
        for name, services in V.items():
            ev[name][key].add_case([Node(entity=s, metric="x") for s in services] or [Node(entity="?", metric="x")], Node(entity=svc, metric="x"))
        if n % 100 == 0:
            print(f"{n}/{len(idx)} {time.time() - t0:.0f}s", flush=True)
    out = {m: {"|".join(k): {"n": e.num, "ac1": e.accuracy_service(1), "ac3": e.accuracy_service(3), "avg5": e.average_service(5)} for k, e in g.items()} for m, g in ev.items()}
    path = f"bench/results/variants_{int(time.time())}.json"
    json.dump(out, open(path, "w"), indent=1)
    print("saved", path)
    return out


def summarize(out):
    def mean(g, suite, sysid, faults, field):
        v = [(g[f"{suite}|{sysid}|{f}"][field], g[f"{suite}|{sysid}|{f}"]["n"]) for f in faults if f"{suite}|{sysid}|{f}" in g]
        n = sum(x[1] for x in v)
        return round(sum(a * c for a, c in v) / n, 3) if n else None
    F1 = ("cpu", "mem", "delay", "loss"); F3 = ("f1", "f2", "f3", "f4", "f5")
    print(f"{'method':38} | RE1 Avg@5 ob   ss   tt  | RE1 AC@1 ob  ss  tt  | RE3 Avg@5 ob   ss   tt")
    for m, g in out.items():
        a = [mean(g, "RE1", s, F1, "avg5") for s in ("ob", "ss", "tt")]
        b = [mean(g, "RE1", s, F1, "ac1") for s in ("ob", "ss", "tt")]
        c = [mean(g, "RE3", s, F3, "avg5") for s in ("ob", "ss", "tt")]
        print(f"{m:38} | {a[0]}  {a[1]}  {a[2]} | {b[0]} {b[1]} {b[2]} | {c[0]}  {c[1]}  {c[2]}")


if __name__ == "__main__":
    o = main(sys.argv[1:] or ["RE1", "RE3"])
    summarize(o)
