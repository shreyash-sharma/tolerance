"""What happened after a fix, and what Tolerance learns from it.

Every incident that closes leaves one record: what broke, which fix ran, who approved it, who resolved it (Tolerance, the machine, people at the plant), how long it took, and later
what a person said about the result ("restored", "partly", "not fixed"). The records feed a small contextual bandit: one Beta estimate for every action in every context (the action
and what it acts on). The estimate starts at 50 percent and moves with each confirmed outcome. Warden's "precedent" factor reads it, so a fix that worked before scores a little higher.
The LLM Planner proposes the fix and explains it. The bandit only ranks it. Warden's gate, the hard limits and a person still decide, and nothing here can approve a fix."""
import time

from workspace import store

RESOLVERS = {"tolerance": "Tolerance", "machine": "The machine", "plant": "People at the plant", "engineer": "Engineers"}
VERDICTS = {"yes": ("Restored, everything works", 1.0), "partly": ("Partly fixed", 0.5), "no": ("Not fixed", 0.0)}


def ctx_key(kind, station):
    return f"{kind}:{station}"


def resolver_of(inc):
    """Who resolved it: nobody acted (the machine came back), someone fixed it outside this tool, or an approved fix ran."""
    by, via = inc.get("by"), str(inc.get("via") or "")
    if inc.get("resolver"):
        return inc["resolver"]
    if by is None:
        return "machine"
    if via == "Google Cloud" or str(by).startswith("someone outside"):
        return "plant"
    return "tolerance"


def on_resolved(d, inc):
    """Called while the workspace is being changed (d is the loaded state). One record for each incident."""
    rows = d.setdefault("outcomes", [])
    old = next((r for r in rows if r["incident"] == inc["id"]), None)
    if old:
        return old
    a = inc.get("action") or {}
    done = inc.get("resolved") or time.time()
    row = {"id": store.new_id("out"), "incident": inc["id"], "title": inc["title"], "kind": inc["kind"], "target": inc.get("target"), "action": a.get("kind"), "station": a.get("station"),
           "ctx": ctx_key(a.get("kind"), a.get("station")), "opened": inc["opened"], "resolved": done, "restore_s": max(0, round(done - inc["opened"])),
           "resolver": resolver_of(inc), "by": inc.get("by"), "via": inc.get("via"), "auto_check": True, "verdict": None, "verdict_by": None, "verdict_at": None}
    rows.append(row)
    del rows[:-300]
    return row


def feedback(incident_id, verdict, by, via):
    """A person says how it went. Returns the record, or None when there is no such record or the verdict is unknown."""
    if verdict not in VERDICTS:
        return None
    with store.LOCK:
        d = store.load()
        row = next((r for r in d.get("outcomes", []) if r["incident"] == incident_id), None)
        if not row:
            return None
        row.update(verdict=verdict, verdict_by=by, verdict_at=time.time(), via_feedback=via)
        h = d.setdefault("host", {})
        h.setdefault("audit", []).append({"at": time.time(), "text": f"{by} confirmed the result through {via}: {VERDICTS[verdict][0].lower()} ({row['title']})"})
        del h["audit"][:-80]
        store.save(d)
        return row


def counts(kind, station):
    """(worked, failed) for this action in this context, from confirmed outcomes only. A partial result counts half for each."""
    key = ctx_key(kind, station)
    s = f = 0.0
    for r in store.load().get("outcomes", []):
        if r["ctx"] == key and r.get("verdict") in VERDICTS:
            w = VERDICTS[r["verdict"]][1]
            s += w
            f += 1.0 - w
    return s, f


def record(s, f):
    """The Beta posterior mean with a uniform prior: 50 percent before anything is known."""
    return (1.0 + s) / (2.0 + s + f)


def learning():
    """For the screen: each action and context with what worked, what did not, the estimate, and what it adds to Warden's score."""
    from foreman import safety
    seen = {}
    for r in store.load().get("outcomes", []):
        if r.get("verdict") in VERDICTS:
            seen.setdefault(r["ctx"], (r["action"], r["station"]))
    out = []
    for key, (kind, station) in seen.items():
        s, f = counts(kind, station)
        m = record(s, f)
        out.append({"ctx": key, "action": (safety.ACTIONS.get(kind) or {}).get("label", kind), "target": station, "worked": s, "failed": f, "estimate": round(m, 3),
                    "points": round(100 * safety.WEIGHTS["precedent"] * (m - 0.5), 1)})
    return sorted(out, key=lambda x: -(x["worked"] + x["failed"]))
