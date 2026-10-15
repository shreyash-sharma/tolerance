"""The factory twin: stations on a floor, the flow between them, and what each station is saying right now.
Stations come from the machine state log (one per asset) and from whatever the person adds. Flows are suggested from the data (a station tends to start soon after another finishes)
and are only suggestions: the person confirms, rejects or draws them. Everything the person does is stored in the workspace, so the floor they build survives a restart."""
import time

import numpy as np
import pandas as pd

from physical import service as PH, reliability as REL
from workspace import store

LABEL = {0: "idle", 1: "busy", 2: "failed"}
_FC = {"t": 0, "rows": {}}
_INF = store.PerUser(lambda: {"n": -1, "flows": []})


def _tw(d):
    return d.setdefault("twin", {"stations": {}, "flows": [], "binds": {}, "removed": []})


def has_state():
    try:
        PH.live_only()
        return True
    except Exception:
        return False


def infer_flows(df, window_s=45, min_p=0.5, min_lift=1.6, per_node=2):
    """Suggest which station feeds which: B starts shortly after A finishes much more often than chance. Weak at coarse sampling, so the score is shown and the person decides."""
    st, en = {}, {}
    for a, g in df.sort_values("ts").groupby("asset"):
        s, t = g.status.to_numpy(), g.ts.to_numpy()
        st[a] = t[1:][(s[1:] == 1) & (s[:-1] != 1)]
        en[a] = t[1:][(s[1:] != 1) & (s[:-1] == 1)]
    span = max((df.ts.max() - df.ts.min()).total_seconds(), 1)
    W = np.timedelta64(int(window_s), "s")
    cand = []
    for A in st:
        for B in st:
            if A == B or len(en[A]) < 5 or len(st[B]) < 5:
                continue
            idx = np.searchsorted(st[B], en[A])
            lags = [(st[B][i] - e) / np.timedelta64(1, "s") for i, e in zip(idx, en[A]) if i < len(st[B]) and st[B][i] - e <= W]
            p = len(lags) / len(en[A])
            base = min(1.0, len(st[B]) * window_s / span)
            lift = p / base if base else 0
            if p >= min_p and lift >= min_lift:
                cand.append({"a": A, "b": B, "score": round(p, 2), "lift": round(lift, 1), "lag_s": round(float(np.median(lags)), 1) if lags else None, "n": len(lags)})
    cand.sort(key=lambda c: -c["score"] * c["lift"])
    out, used = [], {}
    for c in cand:
        if used.get(c["a"], 0) >= per_node:
            continue
        if any(o["a"] == c["b"] and o["b"] == c["a"] for o in out):
            continue
        used[c["a"]] = used.get(c["a"], 0) + 1
        out.append(c)
    return out


def _layers(assets, flows):
    """Left-to-right order by following the strongest flows; stations with no flow are placed by name."""
    depth = {a: 0 for a in assets}
    for _ in range(len(assets)):
        for f in flows:
            if f["a"] in depth and f["b"] in depth and depth[f["b"]] <= depth[f["a"]] and depth[f["a"]] < len(assets) - 1:
                depth[f["b"]] = depth[f["a"]] + 1
    return depth


def _forecast(model, df):
    if time.time() - _FC["t"] < 20 and _FC["rows"]:
        return _FC["rows"]
    try:
        fc = PH.forecast(model, df, hours=4, runs=120)
        _FC["rows"] = {r["asset"]: r for r in fc["rows"]}
        _FC["t"] = time.time()
    except Exception:
        pass
    return _FC["rows"]


def build():
    d = store.load()
    tw = _tw(d)
    stations, flows = [], []
    live = {}
    fc = {}
    if has_state():
        model, _, df = PH.compile_physical()
        fc = _forecast(model, df)
        win = PH.recent_window(0.5)
        # a machine that has run steadily has no event in the last half hour, so every machine in the log counts, with its latest known state
        for a, g in pd.concat([win, df[~df.asset.isin(set(win.asset))].groupby("asset").tail(48)]).groupby("asset"):
            live[a] = {"spark": [int(x) for x in g.status.tail(48)], "state": LABEL.get(int(g.status.iloc[-1]), "idle"), "last": str(g.ts.iloc[-1])}
        if _INF["n"] != len(df):
            _INF.update(n=len(df), flows=infer_flows(df))
        assets = sorted(live)
    else:
        assets = []
    inferred = _INF["flows"]
    auto = {}
    if assets:
        try:
            from connectors import registry as CR
            c = PH.CFG
            q = CR.lake_query(f'select "{c["asset"]}" a, count(*) n from lake."{c["table"]}" group by 1')
            auto = {r.a: {"table": c["table"], "rows": int(r.n), "column": c["status"], "auto": True} for r in q.itertuples()}
        except Exception:
            pass
    depth = _layers(assets, inferred)
    cols = max(depth.values(), default=0) + 1
    rowc = {}
    removed = set(tw.get("removed", []))
    for a in assets:
        sid = f"st:{a}"
        if sid in removed:
            continue
        if sid in tw["stations"] and "x" in tw["stations"][sid]:
            pos = tw["stations"][sid]
        elif cols > 1:
            k = depth[a]
            r = rowc.get(k, 0)
            rowc[k] = r + 1
            pos = {"x": 0.16 + 0.68 * k / (cols - 1), "y": 0.26 + 0.24 * r}
        else:
            i = assets.index(a)
            pos = {"x": 0.2 + 0.3 * (i % 3), "y": 0.3 + 0.3 * (i // 3)}
        f = fc.get(a, {})
        lv = live.get(a, {})
        stations.append({"id": sid, "name": tw["stations"].get(sid, {}).get("name") or a, "asset": a, "auto": True, "x": pos["x"], "y": pos["y"], "state": lv.get("state", "idle"), "spark": lv.get("spark", []),
                         "p_fail": f.get("p_fail"), "failures": f.get("failures"), "mtbf_min": f.get("mtbf_min"), "mttr_s": f.get("mttr_s"), "availability": f.get("availability"), "binds": ([auto[a]] if a in auto else []) + tw["binds"].get(sid, []), "last": lv.get("last")})
    for sid, s in tw["stations"].items():
        if s.get("custom"):
            stations.append({"id": sid, "name": s["name"], "asset": None, "auto": False, "x": s["x"], "y": s["y"], "state": "unknown", "spark": [], "binds": tw["binds"].get(sid, []), "kind": s.get("kind")})
    links = tw.get("links", {})
    open_inc = [i for i in d["incidents"] if i.get("kind") == "service" and i["status"] not in ("closed", "resolved")]
    for st_ in stations:
        sy = links.get(st_["id"], [])
        st_["systems"] = sy
        st_["sw_alerts"] = [{"id": i["id"], "title": i["title"]} for i in open_inc if (i.get("alert") or {}).get("system") in sy]
    ids = {s["id"] for s in stations}
    status = {(f["a"], f["b"]): f for f in tw["flows"]}
    for c in inferred:
        a, b = f"st:{c['a']}", f"st:{c['b']}"
        if a in ids and b in ids:
            u = status.get((a, b))
            flows.append({"id": f"{a}>{b}", "a": a, "b": b, "by": "data", "status": u["status"] if u else "suggested", "score": c["score"], "lift": c["lift"], "lag_s": c["lag_s"]})
    for f in tw["flows"]:
        if f.get("by") == "user" and f["a"] in ids and f["b"] in ids:
            flows.append({"id": f"{f['a']}>{f['b']}", "a": f["a"], "b": f["b"], "by": "you", "status": f.get("status", "approved")})
    return {"stations": stations, "flows": flows, "time": live and max(v["last"] for v in live.values()), "has_data": bool(assets), "tables": _tables()}


_Q = {}


def _quality(table):
    """If a bound table is an inspection log (pass/fail per unit), say how often units fail and which signals separate the fails."""
    if table not in _Q:
        from workspace import compiler as C
        try:
            q = C.quality_signals()
            _Q[table] = {"fail_rate": q["fail_rate"], "fails": q["fails"], "units": q["units"], "top": q["top"][:3], "weekly": q["weekly"]} if q and q["table"] == table else None
        except Exception:
            _Q[table] = None
    return _Q[table]


def _tables():
    from interpret import engine as E
    try:
        return [t for t in E.lake_tables() if not t.startswith("_dlt")]
    except Exception:
        return []


def live(sid, minutes=30):
    """What one station is saying: its recent state as segments, recent events, and the numbers behind it."""
    d = store.load()
    asset = sid[3:] if sid.startswith("st:") else None
    out = {"id": sid, "segments": [], "events": [], "binds": []}
    if asset and has_state():
        df = PH.recent_window(minutes / 60)
        g = df[df.asset == asset].reset_index(drop=True)
        if len(g):
            seg = []
            for i, r in g.iterrows():
                st = LABEL.get(int(r.status), "idle")
                t1 = g.ts.iloc[i + 1] if i + 1 < len(g) else r.ts + pd.Timedelta(seconds=30)
                if seg and seg[-1]["label"] == st:
                    seg[-1]["t1"] = str(t1)
                else:
                    seg.append({"label": st, "t0": str(r.ts), "t1": str(t1)})
            out["segments"] = seg
            ch = g[g.status != g.status.shift()]
            out["events"] = [{"ts": str(r.ts), "label": LABEL.get(int(r.status), "idle")} for r in ch.tail(10).itertuples()][::-1]
            out["window"] = [str(g.ts.iloc[0]), str(g.ts.iloc[-1])]
            tot = (g.ts.iloc[-1] - g.ts.iloc[0]).total_seconds() or 1
            out["share"] = {k: round(sum((pd.Timestamp(s["t1"]) - pd.Timestamp(s["t0"])).total_seconds() for s in seg if s["label"] == k) / tot, 3) for k in ("busy", "idle", "failed")}
    tw = d.get("twin", {})
    from connectors import registry as CR
    for b in tw.get("binds", {}).get(sid, []):
        try:
            n = int(CR.lake_query(f'select count(*) c from lake."{b["table"]}"')["c"][0])
            prev = CR.lake_query(f'select * from lake."{b["table"]}" limit 4')
            cols = [c for c in prev.columns if not c.startswith("_dlt")][:6]
            item = {"table": b["table"], "rows": n, "columns": cols, "preview": prev[cols].astype(str).values.tolist()}
            q = _quality(b["table"])
            if q:
                item["quality"] = q
            out["binds"].append(item)
        except Exception as e:
            out["binds"].append({"table": b["table"], "error": str(e)[:100]})
    return out


# ------------------------------------------------------------------ the person's edits
def add_station(name, x, y, kind=None):
    sid = "st:c_" + store.new_id("n")[2:]

    def f(d):
        _tw(d)["stations"][sid] = {"name": name, "x": float(x), "y": float(y), "custom": True, "kind": kind}
    store.update(f)
    return sid


def move(sid, x, y):
    def f(d):
        t = _tw(d)["stations"].setdefault(sid, {})
        t["x"], t["y"] = float(x), float(y)
    store.update(f)


def rename(sid, name):
    def f(d):
        _tw(d)["stations"].setdefault(sid, {})["name"] = name
    store.update(f)


def remove(sid):
    def f(d):
        t = _tw(d)
        if sid in t["stations"] and t["stations"][sid].get("custom"):
            del t["stations"][sid]
        else:
            t.setdefault("removed", []).append(sid)
        t["flows"] = [x for x in t["flows"] if x["a"] != sid and x["b"] != sid]
    store.update(f)


def set_flow(a, b, status, by="user"):
    def f(d):
        t = _tw(d)
        t["flows"] = [x for x in t["flows"] if not (x["a"] == a and x["b"] == b)]
        if status != "delete":
            t["flows"].append({"a": a, "b": b, "status": status, "by": by})
    store.update(f)


def bind(sid, table):
    def f(d):
        L = _tw(d)["binds"].setdefault(sid, [])
        if not any(x["table"] == table for x in L):
            L.append({"table": table})
    store.update(f)


def link_system(sid, system, off=False):
    def f(d):
        L = _tw(d).setdefault("links", {}).setdefault(sid, [])
        if off and system in L:
            L.remove(system)
        elif not off and system not in L:
            L.append(system)
    store.update(f)


def floor_context(system):
    """What the floor is doing for stations that depend on this software system (given to the investigator as context, never as proof of cause)."""
    d = store.load()
    links = d.get("twin", {}).get("links", {})
    rows = []
    try:
        cur = {s["id"]: s for s in build()["stations"]}
    except Exception:
        return []
    for sid, sy in links.items():
        if system in sy and sid in cur:
            s = cur[sid]
            rows.append(f"station {s['name']}: now {s['state']}; {s.get('failures') or 0} failures seen; chance of failure in 4 h {int((s.get('p_fail') or 0) * 100)}%")
    return rows


def unbind(sid, table):
    def f(d):
        t = _tw(d)["binds"]
        t[sid] = [x for x in t.get(sid, []) if x["table"] != table]
    store.update(f)
