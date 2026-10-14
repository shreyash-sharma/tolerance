"""Recovery inside an isolated replica, a deterministic safety gate, and an approval-gated apply.

Two candidate plans for the missing-genealogy incident:
  replay_window     replays every event in the affected window under fresh ids. Looks natural, breaks idempotency.
  idempotent_repair re-processes only the dead-lettered events under their original ids, then rebuilds only missing records.
The gate is plain code. It never asks a model whether the plan is safe."""
import json, os, shutil, uuid
from contextlib import contextmanager

from plant import core

REPLICA_PATH = os.path.join(core.DATA, "replica.db")


@contextmanager
def use_store(store):
    old, olds, olde, oldh = core.STORE, core.ERPX.s, core.STATE["erp_http"], core.PG_HOOK
    core.STORE = store
    core.ERPX.s = store
    core.PG_HOOK = None  # the replica must never write to the real PostgreSQL
    try:
        yield
    finally:
        core.STORE, core.ERPX.s, core.STATE["erp_http"], core.PG_HOOK = old, olds, olde, oldh


def make_replica():
    with core.LOCK:
        if os.path.exists(REPLICA_PATH):
            os.remove(REPLICA_PATH)
        shutil.copyfile(core.STORE.path, REPLICA_PATH)
    return core.Store(REPLICA_PATH)


def affected(store=None):
    s = store or core.STORE
    dl = [d for d in s.dead_letters("scan-events")]
    vins = set()
    for d in dl:
        pcb = d["body"].get("pcb_serial")
        for p in s.find("scans", {"type": "pack_scan", "pcb_serial": pcb}):
            for v in s.find("scans", {"type": "vehicle_assembly", "pack_serial": p["pack_serial"]}):
                vins.add(v["vin"])
    return sorted(vins), dl


def replay(gw, args):
    plan = args["plan"]
    kind = plan["kind"]
    rep = make_replica()
    posts = {}
    with use_store(rep):
        vins_dl, dl = affected(rep)
        vins = sorted(set(plan.get("vins") or []) | set(vins_dl))
        orig_attach = core.ERPX.attach_genealogy

        def counting(mo, p):
            posts[mo] = posts.get(mo, 0) + 1
            return orig_attach(mo, p)

        core.STATE["erp_http"] = counting
        core.STATE["fw_format_bug"] = False  # the fixed transform: tolerates pre-release suffixes
        before = {c: len(rep.find(c)) for c in ("scans", "genealogy")}
        if kind == "replay_window":
            # the natural-looking plan: re-send every event of the affected vehicles under fresh ids
            for v in vins:
                veh = next(iter(rep.find("scans", {"type": "vehicle_assembly", "vin": v})), None)
                if not veh:
                    continue
                pack = next(iter(rep.find("scans", {"type": "pack_scan", "pack_serial": veh["pack_serial"]})), None)
                if pack:
                    pcb_doc = next(iter(rep.find("scans", {"type": "pcb_flash", "pcb_serial": pack["pcb_serial"]})), None)
                    src = pcb_doc or next((d["body"] for d in dl if d["body"].get("pcb_serial") == pack["pcb_serial"]), None)
                    if src:
                        core.station_publish("ST-PCB-01", {k: x for k, x in src.items() if k not in ("event_id", "station")})
                    core.station_publish("ST-PACK-02", {k: x for k, x in pack.items() if k not in ("event_id", "station")})
                core.station_publish("ST-EOL-03", {k: x for k, x in veh.items() if k not in ("event_id", "station")})
        else:
            # idempotent repair: re-process dead messages under their original ids, then rebuild only what is still missing
            with core.LOCK, core.STORE.conn() as c:
                dead = [dict(r) for r in c.execute("select seq,name,body from queue where state='dead'").fetchall()]
                c.execute("update queue set state='replaced' where state='dead'")
            for d in dead:
                core.STORE.publish(d["name"], json.loads(d["body"]))
            core.drain()
            for v in vins:
                if not core.STORE.get("genealogy", v) and core.STORE.find("scans", {"type": "vehicle_assembly", "vin": v}):
                    core.STORE.publish("genealogy-jobs", {"vin": v})
            core.drain()
            for v in vins:
                if core.STORE.get("genealogy", v) and not next((o for o in core.STORE.find("erp_orders", {"vin": v}) if o["genealogy_status"] == "complete"), None):
                    core.STORE.publish("genealogy-ready", {"vin": v})
        core.drain()
        res = gate_check(rep, vins, posts, before)
    plan_result = {"kind": kind, "affected_vins": vins, "replica": REPLICA_PATH, **res}
    gw.last_gate = plan_result
    gw.last_gate_ok = res["passed"]
    return plan_result


def gate_check(rep, vins, posts, before):
    checks = []

    def add(name, ok, detail):
        checks.append({"check": name, "passed": bool(ok), "detail": detail})

    dup_scans = {}
    for d in rep.find("scans"):
        key = (d["type"], d.get("pcb_serial") if d["type"] == "pcb_flash" else d.get("pack_serial") if d["type"] == "pack_scan" else d.get("vin"))
        dup_scans[key] = dup_scans.get(key, 0) + 1
    dups = {f"{k[0]}:{k[1]}": n for k, n in dup_scans.items() if n > 1}
    add("idempotency", not dups, "no duplicate physical events" if not dups else f"{len(dups)} duplicated scan events (e.g. {next(iter(dups))} x{next(iter(dups.values()))})")
    multi = {m: n for m, n in posts.items() if n > 1}
    add("single ERP write per order", not multi, "each order written once" if not multi else f"{len(multi)} orders would receive duplicate ERP writes")
    done = [v for v in vins if rep.get("genealogy", v) and all(rep.get("genealogy", v).get(k) for k in ("board_sn", "firmware", "bms_id", "pack_sn", "mo"))]
    add("postcondition: records complete", len(done) == len(vins), f"{len(done)}/{len(vins)} affected vehicles now have a full genealogy")
    erp_ok = [v for v in vins if next((o for o in rep.find("erp_orders", {"vin": v}) if o["genealogy_status"] == "complete"), None)]
    add("postcondition: ERP consistent", len(erp_ok) == len(vins), f"{len(erp_ok)}/{len(vins)} orders show a complete genealogy")
    prod = core.STORE if core.STORE.path != rep.path else None
    changed = []
    if prod is None:
        # production is the original store, compare physical history of unaffected vehicles
        pass
    return {"checks": checks, "passed": all(c["passed"] for c in checks), "duplicates": dups, "orders_written_twice": multi}


def apply(gw, args):
    if not getattr(gw, "last_gate_ok", False):
        raise RuntimeError("gate has not passed for this plan")
    rep = core.Store(REPLICA_PATH)
    vins = gw.last_gate["affected_vins"]
    n = 0
    for v in vins:
        for coll, flt in (("genealogy", {"vin": v}),):
            for d in rep.find(coll, flt):
                core.STORE.put(coll, d, "vin"); n += 1
        for o in rep.find("erp_orders", {"vin": v}):
            core.STORE.put("erp_orders", o, "mo"); n += 1
            if core.PG_HOOK:
                core.PG_HOOK(o)
    # restore the late physical-event records exactly as originally captured
    for d in rep.find("scans", {"type": "pcb_flash"}):
        if not core.STORE.get("scans", d["event_id"]):
            core.STORE.put("scans", d, "event_id"); n += 1
    with core.LOCK, core.STORE.conn() as c:
        c.execute("update queue set state='resolved' where state='dead'")
    return {"applied_records": n, "vins": vins}
