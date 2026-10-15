"""Workspace state: the user's sources, model corrections, model versions, incidents and decisions. One JSON file, one lock.
Everything the person does in the app is recorded here, so a restart (or a deploy) keeps the work."""
import contextvars, json, os, threading, time, uuid

from plant import core

PATH = os.path.join(core.DATA, "workspace.json")
# Who is asking. "local" is the single-user mode (no sign-in) and the background jobs; a signed-in visitor gets their own file.
UID = contextvars.ContextVar("uid", default="local")


def _path():
    uid = UID.get()
    if uid == "local":
        return PATH
    d = os.path.join(core.DATA, "users")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "".join(c for c in uid if c.isalnum() or c in "-_")[:64] + ".json")
LOCK = threading.RLock()


class PerUser:
    """A small cache or setting that each visitor has their own copy of. Behaves like a dict; the visitor is the one in UID."""
    def __init__(self, make):
        self._make, self._d = make, {}

    def _cur(self):
        return self._d.setdefault(UID.get(), self._make())

    def __getitem__(self, k): return self._cur()[k]
    def __setitem__(self, k, v): self._cur()[k] = v
    def get(self, k, d=None): return self._cur().get(k, d)
    def update(self, *a, **k): return self._cur().update(*a, **k)
    def __iter__(self): return iter(self._cur())
    def keys(self): return self._cur().keys()
    def items(self): return self._cur().items()
    def __len__(self): return len(self._cur())


_DEFAULT = {"name": "My plant", "sources": [], "corrections": [], "versions": [], "incidents": [], "decisions": [], "notes": []}


def load():
    with LOCK:
        try:
            d = json.load(open(_path(), encoding="utf8"))
        except Exception:
            d = {}
        for k, v in _DEFAULT.items():
            d.setdefault(k, json.loads(json.dumps(v)))
        return d


def save(d):
    with LOCK:
        path = _path()
        tmp = path + ".tmp"
        json.dump(d, open(tmp, "w", encoding="utf8"), default=str)
        os.replace(tmp, path)


def update(fn):
    """Read-modify-write under the lock. fn(state) may mutate state and return a value."""
    with LOCK:
        d = load()
        out = fn(d)
        save(d)
        return out


def new_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def reset():
    with LOCK:
        if os.path.exists(_path()):
            os.remove(_path())
