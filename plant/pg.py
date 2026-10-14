"""A real PostgreSQL (embedded server via pgserver) that holds the ERP's system of record.
The ERP API still answers over HTTP; underneath, every order change is written here, so a SQL connector can read it like any customer database."""
import json, os, threading, time

from . import core

_srv = None
_ready = threading.Event()
_lock = threading.RLock()
DDL = """create table if not exists erp_orders(mo text primary key, vin text, status text, genealogy_status text, genealogy jsonb, updated_at timestamptz default now(), seq bigserial)"""


def start():
    """Start in the background; callers use ready() before relying on it."""
    def run():
        global _srv
        try:
            import pgserver, shutil
            # the server is a disposable mirror: always start from a clean directory (an ungraceful stop on Windows leaves recovery debris)
            d = os.path.join(core.DATA, "pg")
            shutil.rmtree(d, ignore_errors=True)
            if os.path.exists(d):
                d = os.path.join(core.DATA, f"pg_{int(time.time())}")
            _srv = pgserver.get_server(d, cleanup_mode=None)
            with conn() as c, c.cursor() as cur:
                cur.execute(DDL)
            _ready.set()
            for o in core.STORE.find("erp_orders"):  # orders created before the server was up
                upsert(o)
        except Exception as e:  # the demo still runs without it; the catalog says so
            core.STATE["pg_error"] = f"{type(e).__name__}: {e}"[:200]
    threading.Thread(target=run, daemon=True).start()


def ready():
    return _ready.is_set()


def uri():
    return _srv.get_uri() if _srv else None


def conn():
    import psycopg2
    c = psycopg2.connect(_srv.get_uri())
    c.autocommit = True
    return c


def wipe():
    if not ready():
        return
    with _lock, conn() as c, c.cursor() as cur:
        cur.execute("truncate erp_orders restart identity")


def upsert(o):
    if not ready():
        return
    with _lock, conn() as c, c.cursor() as cur:
        cur.execute("""insert into erp_orders(mo,vin,status,genealogy_status,genealogy,updated_at) values(%s,%s,%s,%s,%s,now())
                       on conflict(mo) do update set status=excluded.status, genealogy_status=excluded.genealogy_status, genealogy=excluded.genealogy, updated_at=now(), seq=nextval('erp_orders_seq_seq')""",
                    (o["mo"], o["vin"], o.get("status"), o.get("genealogy_status"), json.dumps(o.get("genealogy"))))
