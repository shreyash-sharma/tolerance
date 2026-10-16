"""Keeps visitors' work across restarts and deploys. A Cloud Run container's disk is temporary, so the per-visitor files (their saved plant, their database, their uploads) are copied
to a Cloud Storage bucket every minute and on shutdown, and copied back when the service starts.
Set TOLERANCE_BACKUP_BUCKET to a bucket name (or to file:/some/folder to try it on a laptop). With nothing set, this does nothing.
Only what a visitor makes is copied: DATA/users and DATA/uploads. The sample plant is rebuilt on start, so it is not."""
import os, shutil, tempfile, threading, time

from plant import core

ROOTS = ("users", "uploads")
EVERY = 60
_seen = {}
_lock = threading.Lock()
_th = None


def _bucket():
    return os.environ.get("TOLERANCE_BACKUP_BUCKET", "").strip()


def enabled():
    return bool(_bucket())


class _Dir:
    """A folder standing in for a bucket (for tests and laptops)."""
    def __init__(self, path):
        self.path = path
        os.makedirs(path, exist_ok=True)

    def put(self, name, src):
        dst = os.path.join(self.path, name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)

    def names(self):
        for d, _, fs in os.walk(self.path):
            for f in fs:
                yield os.path.relpath(os.path.join(d, f), self.path).replace("\\", "/")

    def get(self, name, dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(self.path, name), dst)


class _Gcs:
    def __init__(self, bucket):
        from google.cloud import storage
        self.b = storage.Client().bucket(bucket)

    def put(self, name, src):
        self.b.blob("data/" + name).upload_from_filename(src)

    def names(self):
        for bl in self.b.list_blobs(prefix="data/"):
            yield bl.name[len("data/"):]

    def get(self, name, dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        self.b.blob("data/" + name).download_to_filename(dst)


def _backend():
    b = _bucket()
    if b.startswith("file:"):
        return _Dir(os.path.join(b[5:], "data"))
    return _Gcs(b)


def _name(path):
    return os.path.relpath(path, core.DATA).replace("\\", "/")


def _files():
    for r in ROOTS:
        top = os.path.join(core.DATA, r)
        for d, _, fs in os.walk(top):
            for f in fs:
                if f.endswith((".wal", ".tmp", ".lock")):
                    continue
                yield os.path.join(d, f)


def snapshot():
    """Copy every changed visitor file. Returns how many were copied. Never raises."""
    if not enabled():
        return 0
    n = 0
    with _lock:
        try:
            be = _backend()
        except Exception as e:
            print("backup: cannot reach the bucket:", e)
            return 0
        for path in _files():
            try:
                st = os.stat(path)
                sig = (st.st_mtime_ns, st.st_size)
                if _seen.get(path) == sig:
                    continue
                if path.endswith(".duckdb"):
                    from connectors import registry as CR
                    with CR.LOCK:   # a database file is copied between syncs, so the copy is whole
                        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".duckdb")
                        tmp.close()
                        shutil.copyfile(path, tmp.name)
                    try:
                        be.put(_name(path), tmp.name)
                    finally:
                        os.unlink(tmp.name)
                else:
                    be.put(_name(path), path)
                _seen[path] = sig
                n += 1
            except Exception as e:
                print("backup: could not copy", path, e)
    return n


def restore():
    """Copy back what is missing on this disk. Called once at start. Returns how many files came back."""
    if not enabled():
        return 0
    n = 0
    try:
        be = _backend()
        for name in list(be.names()):
            if name.split("/", 1)[0] not in ROOTS:
                continue
            dst = os.path.join(core.DATA, *name.split("/"))
            if os.path.exists(dst):
                continue
            be.get(name, dst)
            st = os.stat(dst)
            _seen[dst] = (st.st_mtime_ns, st.st_size)
            n += 1
    except Exception as e:
        print("backup: could not restore:", e)
    if n:
        print(f"backup: restored {n} files")
    return n


def start():
    global _th
    if not enabled() or _th:
        return

    def loop():
        while True:
            time.sleep(EVERY)
            snapshot()
    _th = threading.Thread(target=loop, daemon=True, name="backup")
    _th.start()
