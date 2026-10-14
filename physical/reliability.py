"""Reliability modelling from machine state logs (replicates the published process-mining approach for smart manufacturing systems).

Input: an event log of (timestamp, asset, status) where the status of an asset changes over time. Failure is the failed state.
Steps, as in the study: (1) extract failure and repair episodes per asset, (2) fit time-to-failure and time-to-repair distributions,
(3) assemble a stochastic Petri net (up/down places, fail/repair transitions with the fitted distributions),
(4) assess reliability by simulating that net and check the forecast against held-out data.
Everything here is computed from the data; nothing is hard-coded per asset."""
import math
import numpy as np
import pandas as pd
from scipy import stats

FAIL = 2  # status code for the failed state in this log family (0 idle, 1 busy, 2 failed)
CANDIDATES = {"exponential": stats.expon, "weibull": stats.weibull_min, "lognormal": stats.lognorm, "gamma": stats.gamma}


def load(path_or_df):
    d = path_or_df if isinstance(path_or_df, pd.DataFrame) else pd.read_csv(path_or_df)
    d = d.copy(); d["ts"] = pd.to_datetime(d["ts"])
    return d.sort_values(["ts"], kind="stable").reset_index(drop=True)


def episodes(df, fail_code=None):
    fail_code = FAIL if fail_code is None else fail_code
    """Per asset: failure intervals [start, end) and the uptime between them."""
    out = {}
    t_end = df.ts.max()
    for a, g in df.groupby("asset"):
        g = g.reset_index(drop=True)
        fails, up_start = [], g.ts.iloc[0]
        ttf, ttr = [], []
        in_fail, fstart = False, None
        for ts, st in zip(g.ts, g.status):
            if st == fail_code and not in_fail:
                in_fail, fstart = True, ts
                ttf.append((ts - up_start).total_seconds())
            elif st != fail_code and in_fail:
                in_fail = False; ttr.append((ts - fstart).total_seconds()); fails.append((fstart, ts)); up_start = ts
        if in_fail:
            fails.append((fstart, t_end))
        out[a] = {"failures": fails, "ttf": ttf, "ttr": ttr, "span_s": (t_end - g.ts.iloc[0]).total_seconds()}
    return out


def fit(x):
    """Fit candidate distributions, pick by AIC. Degenerate (near-constant) samples are reported as such, not forced."""
    x = np.asarray([v for v in x if v > 0], float)
    if len(x) < 5:
        # too few observations to choose a shape: fall back to the memoryless model and say so
        if not len(x):
            return {"dist": "insufficient data", "n": 0, "mean": None, "thin": True}
        return {"dist": "exponential", "params": [0.0, float(x.mean())], "aic": None, "n": int(len(x)), "mean": float(x.mean()), "thin": True}
    if x.std() / x.mean() < 1e-6:
        return {"dist": "constant", "n": int(len(x)), "mean": float(x.mean()), "params": [float(x.mean())], "aic": None}
    best = None
    for name, d in CANDIDATES.items():
        try:
            p = d.fit(x, floc=0)
            ll = float(np.sum(d.logpdf(x, *p)))
            aic = 2 * (len(p) - 1) - 2 * ll
            if best is None or aic < best["aic"]:
                best = {"dist": name, "params": [float(v) for v in p], "aic": float(aic)}
        except Exception:
            continue
    best.update(n=int(len(x)), mean=float(x.mean()), cv=float(x.std() / x.mean()))
    return best


def sample(f, rng, size=1):
    if f["dist"] == "constant":
        return np.full(size, f["params"][0])
    if f["dist"] == "insufficient data":
        return np.full(size, 1e12)  # nothing observed: treat as never failing in the horizon, and the forecast flags it
    return CANDIDATES[f["dist"]].rvs(*f["params"], size=size, random_state=rng)


def build_model(df, name="plant"):
    ep = episodes(df)
    assets = {}
    for a, e in ep.items():
        ft, rt = fit(e["ttf"]), fit(e["ttr"])
        mtbf = ft.get("mean"); mttr = rt.get("mean")
        down = sum((b - s).total_seconds() for s, b in e["failures"])
        assets[a] = {"failures": len(e["failures"]), "ttf": ft, "ttr": rt, "mtbf_s": mtbf, "mttr_s": mttr,
                     "availability_model": (mtbf / (mtbf + mttr)) if mtbf and mttr else None,
                     "availability_observed": 1 - down / e["span_s"] if e["span_s"] else None}
    # the stochastic Petri net: for each asset an Up place and a Down place, a timed fail and a timed repair transition
    net = {"places": [], "transitions": []}
    for a, m in assets.items():
        net["places"] += [{"id": f"{a}.up", "tokens": 1}, {"id": f"{a}.down", "tokens": 0}]
        net["transitions"] += [{"id": f"{a}.fail", "from": f"{a}.up", "to": f"{a}.down", "delay": m["ttf"]},
                               {"id": f"{a}.repair", "from": f"{a}.down", "to": f"{a}.up", "delay": m["ttr"]}]
    return {"name": name, "assets": assets, "net": net, "span_s": max(e["span_s"] for e in ep.values()), "start": str(df.ts.min()), "end": str(df.ts.max())}


def simulate(model, horizon_s, runs=400, seed=0, state=None):
    """Monte Carlo of the net. Returns, per asset, the failure-count distribution over the horizon.
    state: optional {asset: seconds since last repair} so a forecast can start from the live situation."""
    rng = np.random.default_rng(seed)
    out = {}
    for a, m in model["assets"].items():
        ft, rt = m["ttf"], m["ttr"]
        counts = []
        for _ in range(runs):
            t, n = -(state or {}).get(a, 0.0), 0
            while True:
                t += float(sample(ft, rng)[0])
                if t >= horizon_s:
                    break
                if t >= 0:
                    n += 1
                t += float(sample(rt, rng)[0])
            counts.append(n)
        c = np.array(counts)
        out[a] = {"mean": float(c.mean()), "p10": float(np.percentile(c, 10)), "p90": float(np.percentile(c, 90)), "p_any": float((c > 0).mean())}
    return out


def holdout_validation(df, split=0.7, runs=400, seed=1):
    """Fit on the first part of the log, forecast the failure counts of the rest, compare with what happened."""
    t0, t1 = df.ts.min(), df.ts.max(); cut = t0 + (t1 - t0) * split
    train, test = df[df.ts < cut], df[df.ts >= cut]
    model = build_model(train)
    horizon = (t1 - cut).total_seconds()
    fc = simulate(model, horizon, runs=runs, seed=seed)
    ep = episodes(test)
    rows = []
    for a in model["assets"]:
        obs = len(ep.get(a, {"failures": []})["failures"])
        f = fc[a]
        rows.append({"asset": a, "observed": obs, "forecast": round(f["mean"], 1), "p10": f["p10"], "p90": f["p90"], "inside_band": f["p10"] <= obs <= f["p90"], "abs_err": round(abs(obs - f["mean"]), 1)})
    mae = float(np.mean([r["abs_err"] for r in rows]))
    return {"cut": str(cut), "horizon_h": round(horizon / 3600, 1), "rows": rows, "mae": round(mae, 2), "coverage": float(np.mean([r["inside_band"] for r in rows]))}
