"""The scheduler: runs a visitor's Sentinel rules every few minutes, so a rule that starts failing tells a person without anyone pressing Run.
The idea follows the producer of the Kanshi project, in a few lines. Only visitors who switch it on are run. The Decide check is not
run on a schedule, because every run costs model calls: it runs only when a person asks. One slow visitor never blocks the others for long."""
import json, os, threading, time

from plant import core
from workspace import store

INDEX = os.path.join(core.DATA, "sentinel_schedules.json")
_LOCK = threading.RLock()
MAX_SCHEDULED, MIN_EVERY, MAX_EVERY = 25, 1, 1440
_started = False


def _index():
    try:
        return json.load(open(INDEX, encoding="utf8"))
    except Exception:
        return {}


def mark(uid, on):
    """Remembers which visitors want a schedule, so the loop does not have to open every visitor's file."""
    with _LOCK:
        d = _index()
        if on:
            if uid not in d and len(d) >= MAX_SCHEDULED:
                raise ValueError("The scheduler is full. Try again later.")
            d[uid] = True
        else:
            d.pop(uid, None)
        os.makedirs(os.path.dirname(INDEX), exist_ok=True)
        json.dump(d, open(INDEX, "w", encoding="utf8"))


def _tick():
    from sentinel import service as SV
    for uid in list(_index()):
        tok = store.UID.set(uid)
        try:
            s = SV.schedule()
            if not s["enabled"]:
                mark(uid, False)
                continue
            if time.time() - (s.get("last_run") or 0) >= s["every_min"] * 60:
                SV.run_all(scheduled=True)
        except Exception as e:   # one visitor's problem must not stop the loop
            print("sentinel schedule:", uid, type(e).__name__, str(e)[:100])
        finally:
            store.UID.reset(tok)


def start():
    global _started
    if _started:
        return
    _started = True

    def loop():
        time.sleep(20)
        while True:
            try:
                _tick()
            except Exception as e:
                print("sentinel scheduler:", type(e).__name__, str(e)[:100])
            time.sleep(20)
    threading.Thread(target=loop, daemon=True, name="sentinel-scheduler").start()
