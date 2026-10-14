"""The live alert feed. Each alert is derived from a real incident case (what a monitoring system would have raised) and carries no root cause.
The feed arrives over time, like alerts do; a SQL connector picks the new rows up incrementally."""
import json, os, random, sqlite3, threading, time
from datetime import datetime, timezone

from . import core

DB = os.path.join(core.DATA, "alerts.db")
LIB = os.path.join(core.ROOT, "seed", "rca_library.json")
TEXT = {"cpu": "CPU saturation", "memory": "memory pressure", "disk": "disk I/O contention", "network": "network errors", "latency": "latency SLO breach", "load": "traffic and load anomaly", "errors": "elevated error rate", "silent": "user-visible errors with no obvious resource anomaly", "other": "anomalous behaviour"}


def library():
    return json.load(open(LIB))


def reset(initial=3, seed=7):
    lib = library()
    random.Random(seed).shuffle(lib)
    if os.path.exists(DB):
        os.remove(DB)
    c = sqlite3.connect(DB)
    c.execute("create table alerts(id integer primary key autoincrement, case_id text, system text, started_at text, coverage text, symptom text, summary text)")
    c.commit()
    c.close()
    return lib


class AlertFeed:
    def __init__(self, order, interval=20.0):
        self.order, self.interval, self.i, self.run, self.th = order, interval, 0, False, None

    def add_one(self):
        if self.i >= len(self.order):
            return None
        x = self.order[self.i]
        self.i += 1
        from rca import data as D
        r = D.case_row(x["case"])
        when = datetime.fromtimestamp(int(r["inject_time"]), timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        sym = x["ctx"]["symptom"]
        c = sqlite3.connect(DB)
        c.execute("insert into alerts(case_id,system,started_at,coverage,symptom,summary) values(?,?,?,?,?,?)",
                  (x["case"], x["ctx"]["system"], when, x["ctx"]["coverage"], sym, f"{r['system_name']}: {TEXT.get(sym, TEXT['other'])} detected"))
        c.commit()
        c.close()
        return x["case"]

    def start(self):
        if self.run:
            return
        self.run = True
        self.th = threading.Thread(target=self._loop, daemon=True)
        self.th.start()

    def stop(self):
        self.run = False

    def _loop(self):
        while self.run and self.i < len(self.order):
            time.sleep(self.interval)
            if self.run:
                self.add_one()
        self.run = False

    def status(self):
        return {"running": self.run, "raised": self.i, "remaining": len(self.order) - self.i, "interval_s": self.interval}
