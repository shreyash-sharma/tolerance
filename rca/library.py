"""Build the incident library from the real archive: for every case, the context it arrives with and what each investigation order achieves.
This is the learner's recorded experience (and the ground truth lives here, never in the lake or the model)."""
import json, os, sys, time
from rca import data as D, agent as AG

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "seed", "rca_library.json")


def build(limit=None, progress=None):
    idx = D.index()
    idx = idx[idx.suite.isin(["RE1", "RE3"])]
    rows = []
    cases = list(idx.itertuples())
    if limit:
        cases = cases[:limit]
    for i, r in enumerate(cases):
        try:
            ctx = AG.alert_context(r.case)
            outcomes = {}
            for s, order in AG.STRATEGIES.items():
                res = AG.run(r.case, order)
                h = AG.hypothesis(r.case, res)
                ranked = [x["service"] for x in h["ranked"]]
                ok = bool(ranked) and ranked[0] == r.root_cause_service
                outcomes[s] = {"correct": ok, "top3": r.root_cause_service in ranked[:3], "calls": res["calls"], "reward": round((1.0 if ok else 0.0) - AG.CALL_COST * res["calls"], 3)}
            rows.append({"case": r.case, "ctx": ctx, "truth": r.root_cause_service, "fault": r.fault, "suite": r.suite, "outcomes": outcomes})
        except Exception as e:
            print("skip", r.case, type(e).__name__, str(e)[:80])
        if progress and (i + 1) % 25 == 0:
            progress(i + 1, len(cases))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(rows, open(OUT, "w"))
    return rows


if __name__ == "__main__":
    t = time.time()
    rows = build(int(sys.argv[1]) if len(sys.argv) > 1 else None, progress=lambda a, b: print(f"{a}/{b}", flush=True))
    print("built", len(rows), "cases in", round(time.time() - t), "s ->", OUT)
