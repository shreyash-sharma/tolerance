"""A manufacturing-execution-system style station-state database fed by REAL machine state logs.

The published Industry 4.0 Lab state log (SDU, Zenodo 5078737) is split in two: the first part is already in the database
when a customer connects (the setup snapshot); the rest arrives afterwards, row by row, as if the machines were still running.
Replay speed is accelerated but the order and the content of the rows are the real ones."""
import os, sqlite3, threading, time
import pandas as pd
from . import core

LOG = os.path.join(core.ROOT, "data_real", "sdu", "I4.0Lab_state_log_failures.csv")
if not os.path.exists(LOG):  # deployed image: the unmodified published file ships in seed/
    LOG = os.path.join(core.ROOT, "seed", "sdu", "I4.0Lab_state_log_failures.csv")
DB = os.path.join(core.DATA, "mes.db")


def connect():
    c = sqlite3.connect(DB, timeout=30)
    c.execute("pragma synchronous=off")
    return c


def reset(snapshot_rows=60000):
    """(Re)create the database with the first `snapshot_rows` rows; the remainder becomes the live feed."""
    d = pd.read_csv(LOG)
    d.insert(0, "id", range(1, len(d) + 1))
    if os.path.exists(DB):
        os.remove(DB)
    c = connect()
    c.execute("create table station_states(id integer primary key, ts text, asset text, status integer)")
    c.executemany("insert into station_states values(?,?,?,?)", d.iloc[:snapshot_rows].itertuples(index=False, name=None))
    c.commit(); c.close()
    return d.iloc[snapshot_rows:].reset_index(drop=True), len(d)


class Replayer:
    """Appends the not-yet-seen rows at a steady pace. start()/stop() are safe to call repeatedly."""
    def __init__(self, rest, rate_per_s=400):
        self.rest, self.rate, self.i, self.run = rest, rate_per_s, 0, False
        self.th = None

    def start(self):
        if self.run:
            return
        self.run = True
        self.th = threading.Thread(target=self._loop, daemon=True)
        self.th.start()

    def stop(self):
        self.run = False

    def _loop(self):
        while self.run and self.i < len(self.rest):
            n = max(1, int(self.rate * 0.25))
            chunk = self.rest.iloc[self.i:self.i + n]
            c = connect()
            c.executemany("insert into station_states values(?,?,?,?)", chunk.itertuples(index=False, name=None))
            c.commit()
            c.close()
            self.i += len(chunk)
            time.sleep(0.25)
        self.run = False

    def status(self):
        return {"running": self.run, "appended": self.i, "remaining": len(self.rest) - self.i}
