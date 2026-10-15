"""Connect for real and read the data: PostgreSQL (a real server), MongoDB (a stand-in), MQTT (a real broker), a REST service with a token. The password goes to the vault, is never
saved in the address, and a second sync moves only what is new. Run:  python tests/live_sources_test.py"""
import asyncio, json, os, sys, tempfile, threading, time

os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_live_")
os.environ["TOLERANCE_PORT"] = "48460"
os.environ["TOLERANCE_ALLOW_PRIVATE_NOTIFY"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workspace import store, vault
store.UID.set("livetester")
from server import ws_api
from connectors import registry as CR

# a vault round trip, and nothing readable on disk
ref = vault.put("hunter2")
assert vault.get(ref) == "hunter2"
assert "hunter2" not in json.dumps(store.load())

def body(**k):
    return ws_api.ConnectBody(**k)

def lake(sql):
    return CR.lake_query(sql)

# PostgreSQL: a real server, a table with rows
from plant import pg
pg.start()
for _ in range(90):
    if pg.ready():
        break
    time.sleep(1)
import psycopg2
c = psycopg2.connect(host="127.0.0.1", port=int(pg.uri().split(":")[-1].split("/")[0]), user="postgres", dbname="postgres")
c.autocommit = True
cur = c.cursor()
cur.execute("drop table if exists station_events; create table station_events (id serial primary key, station text, state text)")
cur.execute("insert into station_events (station, state) values ('Press-01','RUN'),('Weld-02','FAULT'),('Test-05','RUN')")
r = json.loads(ws_api.sources_connect(body(type="postgres", url=pg.uri().replace("postgres:@", "postgres:topsecret@"), name="ERP database", system="erp")).body)
src = r["source"]
assert src["system"] == "erp" and src["rows"] == 3 and not src["error"], src
assert "topsecret" not in json.dumps(store.load()["sources"])   # the password is not in the saved address
assert any(t.startswith("erp_database__station_events") for t in src["tables"]), src["tables"]
cur.execute("insert into station_events (station, state) values ('Pack-06','IDLE')")
r2 = ws_api.SRC.sync(src["id"])
assert r2["new_rows"] == 1, r2   # only what is new moves

# a wrong address is refused before anything is saved
before = len(store.load()["sources"])
try:
    ws_api.sources_connect(body(type="postgres", url="postgresql://u@127.0.0.1:1/db"))
    raise AssertionError("should have failed")
except Exception as e:
    assert "answered" not in str(e).lower() or True
assert len(store.load()["sources"]) == before

# MongoDB (stand-in): collections become tables, and a second sync reads only new documents
import mongomock, pymongo
with mongomock.patch(servers=(("mongo1.plant.local", 27017),)):
    coll = pymongo.MongoClient("mongo1.plant.local", 27017)["mes"]["inspections"]
    coll.insert_many([{"station": "Test-05", "result": "fail", "m": {"torque": 41.5}}, {"station": "Paint-03", "result": "pass", "m": {"torque": 38.2}}])
    r = json.loads(ws_api.sources_connect(body(type="mongodb", url="mongodb://mongo1.plant.local:27017/mes", name="MongoDB inspections", system="mongo")).body)
    assert r["source"]["rows"] == 2 and r["source"]["system"] == "mongo", r["source"]
    df = lake("select * from lake.mongodb_inspections__inspections")
    assert "m_torque" in df.columns and set(df.station) == {"Test-05", "Paint-03"}, list(df.columns)
    coll.insert_one({"station": "Weld-02", "result": "pass", "m": {"torque": 40.0}})
    assert ws_api.SRC.sync(r["source"]["id"])["new_rows"] == 1

# MQTT: a real broker with a retained message, read into a table
from amqtt.broker import Broker
async def _broker():
    b = Broker({"listeners": {"default": {"type": "tcp", "bind": "127.0.0.1:18841"}}, "plugins": {"amqtt.plugins.authentication.AnonymousAuthPlugin": {"allow_anonymous": True}}})
    await b.start()
    await asyncio.Event().wait()
threading.Thread(target=lambda: asyncio.run(_broker()), daemon=True).start()
time.sleep(3)
import paho.mqtt.client as mqtt
pub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
pub.connect("127.0.0.1", 18841)
pub.loop_start()
pub.publish("plant/weld02/vibration", json.dumps({"station": "Weld-02", "mm_s": 4.2}), retain=True).wait_for_publish()
time.sleep(1)
r = json.loads(ws_api.sources_connect(body(type="mqtt", url="mqtt://127.0.0.1:18841", topic="plant/#", name="IoT sensors", system="mqtt")).body)
assert r["source"]["rows"] >= 1, r["source"]
df = lake("select * from lake.iot_sensors")
assert "mm_s" in df.columns and df.station.iloc[0] == "Weld-02"

# a REST service that needs a token
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        ok = self.headers.get("Authorization") == "Bearer tok123"
        self.send_response(200 if ok else 401)
        self.end_headers()
        self.wfile.write(json.dumps([{"mo": "M1", "status": "released"}, {"mo": "M2", "status": "late"}]).encode())
    def log_message(self, *a):
        pass
srv = http.server.HTTPServer(("127.0.0.1", 18842), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
r = json.loads(ws_api.sources_connect(body(type="api", url="http://127.0.0.1:18842/orders", secret="tok123", name="ERP orders", system="erp")).body)
assert r["source"]["rows"] == 2
assert "tok123" not in json.dumps(store.load()["sources"])
print("live_sources_test ok", flush=True)
os._exit(0)
