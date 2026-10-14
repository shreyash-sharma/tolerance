"""Recorded Gemini runs. Every live Gemini investigation and chat answer is stored; with replay on, the same question is answered from the recording, instantly,
and the result is labelled as a recorded run (never passed off as live). Recordings from this machine live in data/; a curated set can be shipped in seed/."""
import hashlib, json, os, threading

from plant import core

LOCK = threading.RLock()
LIVE = os.path.join(core.DATA, "demo_cache.json")
SEED = os.path.join(core.ROOT, "seed", "demo_cache.json")


def _read(p):
    try:
        return json.load(open(p, encoding="utf8"))
    except Exception:
        return {}


def get(key):
    with LOCK:
        d = _read(LIVE)
        return d.get(key) or _read(SEED).get(key)


def put(key, value):
    with LOCK:
        d = _read(LIVE)
        d[key] = value
        tmp = LIVE + ".tmp"
        json.dump(d, open(tmp, "w", encoding="utf8"), default=str)
        os.replace(tmp, LIVE)


def count():
    with LOCK:
        return len({**_read(SEED), **_read(LIVE)})


def inv_key(case, strategy):
    return f"inv:{case}:{strategy}"


def chat_key(message):
    return "chat:" + hashlib.sha256(" ".join(str(message).lower().split()).encode()).hexdigest()[:20]
