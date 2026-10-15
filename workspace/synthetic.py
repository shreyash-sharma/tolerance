"""A made-up plant that keeps its data in several systems, so the whole path can be tried without a real factory.
It writes the files each system would export: a machine log (MES), a MongoDB export of inspections and maintenance notes, an ERP database
(work orders and materials), and an IoT sensor export. Station names match across all of them, so Tolerance can tell which system feeds which station.
    python -m workspace.synthetic OUT_DIR"""
import csv, json, os, random, sqlite3, sys
from datetime import datetime, timedelta

STATIONS = ["Press-01", "Weld-02", "Paint-03", "Assembly-04", "Test-05", "Pack-06"]
PRODUCTS = ["Bracket A", "Housing B", "Frame C"]


def _oid(r):
    return "".join(r.choice("0123456789abcdef") for _ in range(24))


def build(out, days=3, seed=7, now=None):
    r = random.Random(seed)
    os.makedirs(out, exist_ok=True)
    end = (now or datetime.utcnow()).replace(second=0, microsecond=0)
    start = end - timedelta(days=days)
    files = {}

    # MES: one row per change of state
    rows, faults = [], []
    for i, st in enumerate(STATIONS):
        t, state = start + timedelta(minutes=r.randint(0, 20)), "RUN"
        flaky = 3.2 if st in ("Weld-02", "Test-05") else 1.0
        while t < end:
            rows.append((t.strftime("%Y-%m-%d %H:%M:%S"), st, state))
            if state == "RUN":
                if r.random() < 0.035 * flaky:
                    state = "FAULT"
                    faults.append((t, st))
                elif r.random() < 0.12:
                    state = "IDLE"
                t += timedelta(minutes=r.randint(8, 40))
            elif state == "FAULT":
                state = "RUN"
                t += timedelta(minutes=r.randint(4, 25))
            else:
                state = "RUN"
                t += timedelta(minutes=r.randint(3, 15))
    rows.sort()
    p = os.path.join(out, "mes_station_log.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp", "machine", "state"])
        w.writerows(rows)
    files["mes"] = p

    # MongoDB export (mongoexport, one JSON document per line, with extended JSON types)
    p = os.path.join(out, "mongo_inspections.jsonl")
    with open(p, "w") as f:
        for n in range(900):
            st = r.choice(STATIONS[2:5])
            t = start + timedelta(minutes=r.randint(0, days * 1440))
            bad = r.random() < (0.12 if st == "Test-05" else 0.04)
            f.write(json.dumps({"_id": {"$oid": _oid(r)}, "serial": f"U{100000 + n}", "station": st, "inspected_at": {"$date": t.strftime("%Y-%m-%dT%H:%M:%SZ")},
                                "result": "fail" if bad else "pass",
                                "measurements": {"torque_nm": round(r.gauss(42 + (6 if bad else 0), 2), 2), "temp_c": round(r.gauss(71 + (9 if bad else 0), 3), 1), "gap_mm": {"$numberDouble": str(round(r.gauss(1.2, .1), 3))}},
                                "operator": r.choice(["asha", "marco", "li"])}) + "\n")
    files["mongo_inspections"] = p
    p = os.path.join(out, "mongo_maintenance.jsonl")
    with open(p, "w") as f:
        for t, st in faults[:60]:
            f.write(json.dumps({"_id": {"$oid": _oid(r)}, "station": st, "opened": {"$date": t.strftime("%Y-%m-%dT%H:%M:%SZ")}, "kind": r.choice(["bearing", "sensor", "jam", "overheat"]),
                                "technician": r.choice(["ravi", "ines", "tom"]), "minutes": {"$numberInt": str(r.randint(5, 90))}, "note": "stopped by fault, restarted after check"}) + "\n")
    files["mongo_maintenance"] = p

    # ERP (SQLite file standing in for the ERP database): work orders and materials
    p = os.path.join(out, "erp.db")
    if os.path.exists(p):
        os.remove(p)
    c = sqlite3.connect(p)
    c.execute("create table work_orders (id integer primary key, order_no text, product text, qty integer, station text, planned_start text, status text)")
    c.execute("create table materials (id integer primary key, sku text, description text, station text, on_hand integer, reorder_level integer)")
    for n in range(80):
        t = start + timedelta(hours=r.randint(0, days * 24))
        c.execute("insert into work_orders values (?,?,?,?,?,?,?)", (n + 1, f"WO-{4000 + n}", r.choice(PRODUCTS), r.choice([50, 100, 200]), r.choice(STATIONS), t.strftime("%Y-%m-%d %H:%M"), r.choice(["released", "running", "done", "late"])))
    for n, st in enumerate(STATIONS):
        c.execute("insert into materials values (?,?,?,?,?,?)", (n + 1, f"SKU-{200 + n}", f"Feedstock for {st}", st, r.randint(5, 400), 60))
    c.commit()
    c.close()
    files["erp"] = p

    # IoT sensors (an MQTT broker export)
    p = os.path.join(out, "iot_sensors.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["time", "station", "vibration_mm_s", "motor_temp_c"])
        t = start
        while t < end:
            for st in STATIONS:
                w.writerow([t.strftime("%Y-%m-%d %H:%M:%S"), st, round(abs(r.gauss(2.1 + (1.5 if st == "Weld-02" else 0), .5)), 2), round(r.gauss(58, 4), 1)])
            t += timedelta(minutes=30)
    files["iot"] = p
    return files


# which system each file stands for
SYSTEMS = {"mes": ("MES station log", "mes"), "mongo_inspections": ("MongoDB inspections", "mongo"), "mongo_maintenance": ("MongoDB maintenance notes", "mongo"), "erp": ("ERP orders and materials", "erp"), "iot": ("IoT sensors (MQTT)", "mqtt")}

if __name__ == "__main__":
    print(json.dumps(build(sys.argv[1] if len(sys.argv) > 1 else "synthetic_plant"), indent=1))
