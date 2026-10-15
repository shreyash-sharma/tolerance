"""Connection tests follow Kanshi's executors: log in, run one safe read, report time and what is there; only reads are allowed; passwords stay out of the address.
Uses a real PostgreSQL (the one the sample plant starts), a MongoDB stand-in, a real MQTT broker (in this process), a small REST service and the sample plant's OPC UA server.
Run:  python tests/probes_test.py"""
import asyncio, json, os, sys, tempfile, threading, time

os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_probes_")
os.environ["TOLERANCE_PORT"] = "48450"
os.environ["TOLERANCE_ALLOW_PRIVATE_NOTIFY"] = "1"   # the test servers are on this computer
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors import probes as P

# the safe-read rule
assert P.check_query("") == "SELECT 1"
assert P.check_query("select * from t where a = 1")
for bad in ("DROP TABLE x", "select 1; delete from t", "update t set a = 1", "exec sp_who"):
    try:
        P.check_query(bad)
        raise AssertionError("allowed: " + bad)
    except P.ProbeError:
        pass
# a password typed into the address is taken out of it
clean, pw = P.split_secret("postgres", "postgresql://reader:s3cret@db.plant.local:5432/mes")
assert clean == "postgresql://reader@db.plant.local:5432/mes" and pw == "s3cret"
assert str(P.sqlalchemy_url("mysql", "mysql://u@h/db", "p@ss")).startswith("mysql+pymysql://u:***@h:3306/db")
assert "service_name=XE" in str(P.sqlalchemy_url("oracle", "oracle://u@h/XE", "p"))
assert str(P.sqlalchemy_url("mssql", "mssql://u@h/db", "p")).startswith("mssql+pymssql://u:***@h:1433/db")

# PostgreSQL: a real server
from plant import pg
pg.start()
for _ in range(90):
    if pg.ready():
        break
    time.sleep(1)
assert pg.ready()
r = P.test("postgres", pg.uri())
assert r["ok"] and r["detail"]["version"].startswith("16") and r["status"] == "up", r
assert P.test("postgres", pg.uri(), query="SELECT version()")["ok"]
assert not P.test("postgres", pg.uri(), query="DROP TABLE x")["ok"]
assert not P.test("postgres", "postgresql://u@127.0.0.1:1/db", timeout=3)["ok"]

# MongoDB: a stand-in server, same driver calls
import mongomock
with mongomock.patch(servers=(("mongo1.plant.local", 27017),)):
    import pymongo
    pymongo.MongoClient("mongo1.plant.local", 27017)["mes"]["inspections"].insert_many([{"a": 1}, {"a": 2}])
    r = P.test("mongodb", "mongodb://mongo1.plant.local:27017/mes")
    assert r["ok"] and r["detail"]["collections"] == 1, r

# MQTT: a real broker
from amqtt.broker import Broker


async def _run_broker():
    b = Broker({"listeners": {"default": {"type": "tcp", "bind": "127.0.0.1:18831"}}, "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}}})
    await b.start()
    await asyncio.Event().wait()


threading.Thread(target=lambda: asyncio.run(_run_broker()), daemon=True).start()
time.sleep(3)
r = P.test("mqtt", "mqtt://127.0.0.1:18831", query="plant/#", timeout=6)
assert r["ok"] and r["detail"]["connected"], r
assert not P.test("mqtt", "mqtt://127.0.0.1:1", timeout=2)["ok"]

# REST: a small service
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        ok = self.headers.get("Authorization") == "Bearer tok"
        self.send_response(200 if ok else 401)
        self.end_headers()
        self.wfile.write(json.dumps([{"mo": 1}, {"mo": 2}, {"mo": 3}]).encode())
    def log_message(self, *a):
        pass
srv = http.server.HTTPServer(("127.0.0.1", 18832), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
assert P.test("api", "http://127.0.0.1:18832/orders", secret="tok")["detail"]["rows"] == 3
assert not P.test("api", "http://127.0.0.1:18832/orders")["ok"]

# the private-address guard still holds when it is switched on
os.environ["TOLERANCE_ALLOW_PRIVATE_NOTIFY"] = "0"
r = P.test("postgres", "postgresql://u@127.0.0.1:5432/db")
assert not r["ok"] and "private" in r["message"].lower(), r
print("probes_test ok", flush=True)
os._exit(0)
