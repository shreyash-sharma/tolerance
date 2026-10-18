"""Live sources the owner connects to: SQL databases (PostgreSQL, MySQL, SQL Server, Oracle), MongoDB, MQTT, Kafka, OPC UA and REST services with a token.
Each is loaded once as a snapshot and then only what is new moves, like every other source. Passwords and tokens are read from the vault at the moment of the sync."""
import json, re, time

import dlt

from connectors import probes as P
from workspace import vault

KINDS = {"sql_live", "mongo_live", "mqtt_live", "kafka_live", "opcua_live"}
ENGINE_OF_TYPE = {"postgres": "sql_live", "mysql": "sql_live", "mssql": "sql_live", "oracle": "sql_live", "mongodb": "mongo_live", "mqtt": "mqtt_live", "kafka": "kafka_live", "opcua": "opcua_live"}


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_") or "x"


def _flat(d, pre=""):
    out = {}
    for k, v in d.items():
        key = _slug(pre + str(k))
        if isinstance(v, dict):
            out.update(_flat(v, key + "_"))
        elif isinstance(v, (list, tuple)):
            out[key] = json.dumps(v, default=str)
        elif isinstance(v, (int, float, str, bool)) or v is None:
            out[key] = v
        else:
            out[key] = str(v)   # ObjectId, datetime and the like
    return out


def sql_url(params):
    """The address with the password put back in, only in memory and only for this sync."""
    u = P.sqlalchemy_url(params["engine"], params["url"], vault.get(params.get("secret_ref")) or "")
    return u.render_as_string(hide_password=False)


def mongo_resources(params, nm):
    import pymongo
    pw = vault.get(params.get("secret_ref")) or ""
    p = P.parse("mongodb", params["url"])
    P._guard(p["host"], p["port"])
    cl = P.mongo_client(p, pw)
    db = cl[params.get("database") or p["database"] or "admin"]
    wanted = params.get("collections") or []
    names = [c for c in db.list_collection_names() if not c.startswith("system.") and (not wanted or c in wanted)]
    out = []
    for coll in names[:40]:
        def make(coll=coll):
            @dlt.resource(name=f"{nm}__{_slug(coll)}", write_disposition="append")
            def rows():
                st = dlt.current.resource_state()
                last = st.get("last_id")
                q = {}
                if last:
                    from bson import ObjectId
                    try:
                        q = {"_id": {"$gt": ObjectId(last)}}
                    except Exception:
                        q = {}
                n, top = 0, last
                batch = []
                for doc in db[coll].find(q).sort("_id", 1).limit(50000):
                    top = str(doc["_id"])
                    batch.append(_flat(doc))
                    if len(batch) >= 2000:
                        yield batch
                        batch = []
                if batch:
                    yield batch
                st["last_id"] = top
            return rows()
        out.append(make())
    return out


def mqtt_resource(params, nm):
    import threading
    import paho.mqtt.client as mqtt
    pw = vault.get(params.get("secret_ref")) or ""
    p = P.parse("mqtt", params["url"])
    P._guard(p["host"], p["port"])
    topic = params.get("topic") or p["database"] or "#"

    got = []
    cl = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if p["user"]:
        cl.username_pw_set(p["user"], pw or None)
    if p["scheme"] in ("mqtts", "ssl", "tls") or p["port"] == 8883:
        cl.tls_set()
    up = threading.Event()
    cl.on_connect = lambda c, u, f, rc, props=None: (c.subscribe(topic), up.set())

    def on_message(c, u, m):
        body = m.payload.decode("utf8", "replace")
        row = {"ts": time.time(), "topic": m.topic, "payload": body[:2000]}
        try:
            j = json.loads(body)
            if isinstance(j, dict):
                row.update({k: v for k, v in _flat(j).items() if k not in row})
        except Exception:
            pass
        got.append(row)
    cl.on_message = on_message
    # listen NOW, before the lock is taken: a shared broker can take many seconds, and nothing else may wait on the lake meanwhile
    cl.connect(p["host"], p["port"], keepalive=10)
    cl.loop_start()
    up.wait(25)     # a shared cloud broker can be slow to answer: the listening time starts once it has
    time.sleep(4)   # one sync listens for a few seconds; the live loop syncs again every few seconds
    cl.loop_stop()
    cl.disconnect()

    @dlt.resource(name=nm, write_disposition="append")
    def rows():
        if got:
            yield got
    return rows()


def kafka_resource(params, nm):
    from kafka import KafkaConsumer
    p = P.parse("kafka", params["url"])
    P._guard(p["host"], p["port"])
    topic = params.get("topic") or p["database"]
    if not topic:
        raise ValueError("Say which Kafka topic to read.")

    @dlt.resource(name=nm, write_disposition="append")
    def rows():
        c = KafkaConsumer(topic, bootstrap_servers=f"{p['host']}:{p['port']}", group_id="tolerance-" + _slug(nm), auto_offset_reset="earliest", enable_auto_commit=True, consumer_timeout_ms=4000)
        got = []
        try:
            for m in c:
                row = {"topic": m.topic, "partition": m.partition, "offset": m.offset, "ts": m.timestamp, "key": m.key.decode("utf8", "replace") if m.key else None}
                body = (m.value or b"").decode("utf8", "replace")
                row["value"] = body[:2000]
                try:
                    j = json.loads(body)
                    if isinstance(j, dict):
                        row.update({k: v for k, v in _flat(j).items() if k not in row})
                except Exception:
                    pass
                got.append(row)
                if len(got) >= 5000:
                    break
        finally:
            c.close()
        if got:
            yield got
    return rows()


def resource(rec, nm):
    """The dlt source for one live source record."""
    k, p = rec["kind"], rec["params"]
    if k == "sql_live":
        from workspace import sources as S
        return S.sql_source(sql_url(p), nm)
    if k == "mongo_live":
        return mongo_resources(p, nm)
    if k == "mqtt_live":
        return mqtt_resource(p, nm)
    if k == "kafka_live":
        return kafka_resource(p, nm)
    if k == "opcua_live":
        from connectors.registry import opcua_nodes
        return opcua_nodes(p["url"])
    raise ValueError(k)
