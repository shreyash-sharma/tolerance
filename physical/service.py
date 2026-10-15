"""Physical layer, computed from the data the connectors have landed in the lake (never from the raw file).
Compile: reliability model per asset. Forecast: failures expected in the next window. Shadow: forecasts are sealed, then scored when the live data catches up."""
import hashlib, json, os, time
import numpy as np
import pandas as pd

from connectors import registry as R
from workspace import store
from physical import reliability as REL

_cache = store.PerUser(lambda: {"n": -1, "model": None, "val": None})
_DEFAULT_CFG = {"table": "station_states", "ts": "ts", "asset": "asset", "status": "status", "fail": 2, "labels": {0: "idle", 1: "busy", 2: "FAILED"}, "reviewed": False}


class _Cfg:
    """Which table is the machine state log and what its codes mean. The sample plant uses the shared default; a visitor with their own machine data has their own."""
    def __init__(self):
        self._own = {}

    def _cur(self):
        if not R.own_lake():
            return _DEFAULT_CFG
        uid = store.UID.get()
        if uid not in self._own:
            saved = store.load().get("phys_cfg")
            self._own[uid] = {**_DEFAULT_CFG, **(saved or {})}
        return self._own[uid]

    def __getitem__(self, k): return self._cur()[k]
    def get(self, k, d=None): return self._cur().get(k, d)
    def keys(self): return self._cur().keys()
    def __iter__(self): return iter(self._cur())
    def items(self): return self._cur().items()

    def update(self, *a, **k):
        cur = self._cur()
        cur.update(*a, **k)
        if cur is not _DEFAULT_CFG:
            d = store.load()
            d["phys_cfg"] = {x: cur[x] for x in ("table", "ts", "asset", "status", "fail", "labels", "reviewed") if x in cur}
            store.save(d)


CFG = _Cfg()


def configure(table, ts, asset, status, labels, fail):
    """Set which lake table is the machine state log and what its codes mean (from the reviewed model)."""
    CFG.update(table=table, ts=ts, asset=asset, status=status, fail=fail if fail is not None else -999, labels={int(k): ("FAILED" if v == "failed" else v) for k, v in labels.items()})
    REL.FAIL = CFG["fail"]
    _cache.update(n=-1)


def label_of(code):
    return CFG["labels"].get(int(code), str(code))
SEALS = []  # sealed forecasts, newest last


def lake_df():
    c = CFG
    REL.FAIL = c["fail"]   # the failure code belongs to this visitor's plant
    df = R.lake_query(f'select "{c["ts"]}" as ts, "{c["asset"]}" as asset, "{c["status"]}" as status from lake."{c["table"]}" order by 1')
    df["ts"] = pd.to_datetime(df["ts"], utc=True).dt.tz_localize(None)
    return df


def compile_physical(force=False):
    df = lake_df()
    if not force and len(df) == _cache["n"]:
        return _cache["model"], _cache["val"], df
    model = REL.build_model(df)
    val = REL.holdout_validation(df, split=0.7) if len(df) > 5000 else None
    _cache.update(n=len(df), model=model, val=val)
    return model, val, df


def live_state(df):
    """Current status and time since the last repair per asset."""
    out = {}
    t_now = df.ts.max()
    for a, g in df.groupby("asset"):
        last = g.iloc[-1]
        fails = g[g.status == REL.FAIL]
        since = None
        if len(fails):
            # last time the asset left the failed state
            after = g[g.ts > fails.ts.iloc[-1]]
            nf = after[after.status != REL.FAIL]
            since = float((t_now - (nf.ts.iloc[0] if len(nf) else fails.ts.iloc[-1])).total_seconds())
        out[a] = {"status": int(last.status), "label": label_of(last.status), "since_repair_s": since}
    return out, str(t_now)


def forecast(model, df, hours=4.0, runs=300):
    st, t_now = live_state(df)
    sim = REL.simulate(model, hours * 3600, runs=runs, seed=3, state={a: v["since_repair_s"] or 0 for a, v in st.items()})
    rows = []
    for a, f in sim.items():
        m = model["assets"][a]
        rows.append({"asset": a, "state": st[a]["label"], "since_repair_min": round((st[a]["since_repair_s"] or 0) / 60, 1), "p_fail": round(f["p_any"], 3), "expected": round(f["mean"], 2),
                     "mtbf_min": round((m["mtbf_s"] or 0) / 60, 1), "mttr_s": round(m["mttr_s"] or 0, 1), "availability": round(m["availability_observed"] or 0, 4), "failures": m["failures"],
                     "ttf_dist": m["ttf"]["dist"], "ttr_dist": m["ttr"]["dist"], "thin": bool(m["ttf"].get("thin"))})
    rows.sort(key=lambda r: -r["p_fail"])
    return {"at": t_now, "hours": hours, "rows": rows}


# ------------------------------------------------------------------ shadow with live data
def seal_forecast(hours=6.0):
    model, _, df = compile_physical()
    fc = forecast(model, df, hours=hours, runs=300)
    t0 = df.ts.max()
    body = json.dumps({"at": str(t0), "hours": hours, "forecast": {r["asset"]: {"expected": r["expected"], "p_fail": r["p_fail"]} for r in fc["rows"]}}, sort_keys=True)
    salt = os.urandom(8).hex()
    rec = {"id": len(SEALS) + 1, "sealed_wall": time.time(), "t0": str(t0), "t_end": str(t0 + pd.Timedelta(hours=hours)), "hours": hours, "salt": salt, "body": body,
           "commit": hashlib.sha256((salt + body).encode()).hexdigest(), "scored": None}
    SEALS.append(rec)
    return {k: v for k, v in rec.items() if k not in ("salt", "body")}


def score_seals():
    """Score every sealed forecast whose window has fully arrived in the lake. Counts failure onsets per asset in the window."""
    _, _, df = compile_physical()
    tmax = df.ts.max()
    out = []
    for r in SEALS:
        if r["scored"] is None and tmax >= pd.Timestamp(r["t_end"]):
            seg = df[(df.ts > pd.Timestamp(r["t0"])) & (df.ts <= pd.Timestamp(r["t_end"]))]
            body = json.loads(r["body"])
            rows = []
            for a, f in body["forecast"].items():
                g = seg[seg.asset == a].reset_index(drop=True)
                onsets = int(((g.status == REL.FAIL) & (g.status.shift(1, fill_value=0) != REL.FAIL)).sum())
                lo, hi = max(0, f["expected"] - 2 * np.sqrt(max(f["expected"], .25))), f["expected"] + 2 * np.sqrt(max(f["expected"], .25))
                rows.append({"asset": a, "expected": f["expected"], "observed": onsets, "inside": bool(lo <= onsets <= hi)})
            r["scored"] = {"rows": rows, "coverage": round(sum(x["inside"] for x in rows) / len(rows), 2), "mae": round(float(np.mean([abs(x["expected"] - x["observed"]) for x in rows])), 2),
                           "commit_valid": hashlib.sha256((r["salt"] + r["body"]).encode()).hexdigest() == r["commit"]}
        out.append({k: v for k, v in r.items() if k not in ("salt", "body")})
    return out


# ------------------------------------------------------------------ Gemini advisor
ADVISOR_PROMPT = """You are the reliability advisor inside Tolerance, an industrial intelligence layer for a manufacturing line.
You receive a reliability model learned from real machine state logs (per asset: failures seen, mean time between failures, mean repair time, availability,
the fitted distributions, the live state, and the probability of a failure in the next window from a Monte Carlo of the model).
Write a short advisory for the shift supervisor. Rules: only use the numbers given; say when evidence is thin (few failures); never claim a cause the data does not show; exponential models are memoryless, so never call an asset 'overdue' because its uptime exceeds its MTBF;
every recommended action is a PROPOSAL that a person must approve. Answer as JSON: {"headline": str, "assets": [{"asset": str, "risk": "high|medium|low", "why": str, "proposal": str}], "caveats": [str]}"""


def advise(fc, use_gemini=True):
    from fabric.agents import gemini_available
    if use_gemini and gemini_available():
        try:
            from google.genai import types
            from fabric.agents import gen_with_retry, make_client
            client = make_client()
            model = (os.environ.get("TOLERANCE_MODEL") or "auto")
            r = gen_with_retry(client, tries=3, max_wait=8, model=model, contents=json.dumps(fc), config=types.GenerateContentConfig(system_instruction=ADVISOR_PROMPT, response_mime_type="application/json", temperature=0))
            out = json.loads(r.text)
            out["by"] = f"Gemini ({getattr(r, 'model_version', None) or model})"
            return out
        except Exception as e:
            err = f"{type(e).__name__}: {str(e)[:160]}"
    else:
        err = None
    rows = fc["rows"]
    top = rows[0]
    out = {"headline": f"{top['asset']} is the most likely to fail in the next {fc['hours']:g} h (p={top['p_fail']}).",
           "assets": [{"asset": r["asset"], "risk": "high" if r["p_fail"] > .6 else "medium" if r["p_fail"] > .3 else "low", "why": f"{r['failures']} failures seen, MTBF {r['mtbf_min']} min, availability {r['availability']}",
                       "proposal": "Schedule a check at the next idle window; a person approves."} for r in rows],
           "caveats": ["Rule-based summary (Gemini was not used)." + (f" Reason: {err}" if err else "")], "by": "rule-based"}
    return out


def learning_curve(points=(0.2, 0.35, 0.5, 0.65, 0.8), window=0.12, runs=200):
    """Does the model get better as the lake grows? Fit on the first k of the data, forecast the next window, compare with what happened."""
    df = lake_df()
    t0, t1 = df.ts.min(), df.ts.max()
    out = []
    for k in points:
        cut = t0 + (t1 - t0) * k
        end = min(t1, cut + (t1 - t0) * window)
        train, test = df[df.ts < cut], df[(df.ts >= cut) & (df.ts < end)]
        if len(train) < 3000 or len(test) < 100:
            continue
        m = REL.build_model(train)
        sim = REL.simulate(m, (end - cut).total_seconds(), runs=runs, seed=5)
        ep = REL.episodes(test)
        errs, inside = [], []
        for a in m["assets"]:
            obs = len(ep.get(a, {"failures": []})["failures"])
            f = sim[a]
            errs.append(abs(obs - f["mean"]))
            inside.append(f["p10"] <= obs <= f["p90"])
        out.append({"fit_on_rows": int(len(train)), "fit_on_hours": round((cut - t0).total_seconds() / 3600, 1), "mae": round(float(np.mean(errs)), 2), "coverage": round(float(np.mean(inside)), 2)})
    return out


def live_only():
    """Cheap view for polling: last status per asset and how far the lake has caught up."""
    c = CFG
    df = R.lake_query(f'select "{c["asset"]}" as asset, arg_max("{c["status"]}", "{c["ts"]}") as status, max("{c["ts"]}") as ts, count(*) as n from lake."{c["table"]}" group by 1 order by 1')
    total = int(df["n"].sum())
    return {"rows": total, "log_time": str(df["ts"].max()), "assets": [{"asset": r.asset, "status": int(r.status), "label": label_of(r.status)} for r in df.itertuples()]}


def recent_window(hours):
    """Only the last `hours` of log time, straight from SQL (cheap; used by tools that run many times)."""
    c = CFG
    df = R.lake_query(f"""with m as (select max(try_cast("{c["ts"]}" as timestamp)) mt from lake."{c["table"]}")
                         select "{c["ts"]}" as ts, "{c["asset"]}" as asset, "{c["status"]}" as status from lake."{c["table"]}", m
                         where try_cast("{c["ts"]}" as timestamp) > m.mt - interval '{float(hours)} hours' order by 1""")
    df["ts"] = pd.to_datetime(df["ts"], utc=True).dt.tz_localize(None)
    return df

