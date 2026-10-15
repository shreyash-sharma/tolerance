"""Connection tests for the owner's own systems: log in, run one safe read, say how long it took and what is there.
The checks follow Kanshi's executors (Postgres, MySQL, SQL Server, MongoDB, MQTT and the rest): the same login, the same safe default query (SELECT 1), the same rule that only
reads are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN, WITH, VALUES), the same answer shape (up or down, response time, a message, an error).
The test never changes anything in the system. Passwords come from the vault, never from the browser after the first time."""
import json, re, time
from urllib.parse import quote, unquote, urlparse

from sentinel import guard

SAFE = re.compile(r"^\s*(select|show|describe|desc|explain|with|values)\b", re.I)
BAD = re.compile(r";\s*\S|\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|exec|execute|merge|call)\b", re.I)
DEFAULT_PORT = {"postgres": 5432, "mysql": 3306, "mssql": 1433, "oracle": 1521, "mongodb": 27017, "mqtt": 1883, "kafka": 9092, "opcua": 4840}
SCHEMES = {"postgres": "postgresql+psycopg2", "mysql": "mysql+pymysql", "mssql": "mssql+pymssql", "oracle": "oracle+oracledb"}
LABEL = {"mcp": "MCP server", "postgres": "PostgreSQL", "mysql": "MySQL", "mssql": "SQL Server", "oracle": "Oracle", "mongodb": "MongoDB", "mqtt": "MQTT broker", "kafka": "Kafka", "opcua": "OPC UA", "api": "REST API"}


class ProbeError(Exception):
    pass


def check_query(q):
    """Only reads, one statement. The same rule Kanshi applies to monitoring queries."""
    q = (q or "").strip() or "SELECT 1"
    if not SAFE.match(q) or BAD.search(q):
        raise ProbeError("Only one read is allowed: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH or VALUES.")
    return q


def parse(kind, url):
    """Host, port, user, password, database and options from an address of any of the usual shapes."""
    u = (url or "").strip()
    if not u:
        raise ProbeError("Type the address first.")
    if "://" not in u:
        u = {"postgres": "postgresql", "mssql": "mssql", "oracle": "oracle"}.get(kind, kind) + "://" + u
    p = urlparse(u)
    if not p.hostname:
        raise ProbeError("I cannot read a host name in that address.")
    q = dict(x.split("=", 1) for x in (p.query or "").split("&") if "=" in x)
    return {"scheme": p.scheme, "host": p.hostname, "port": p.port or DEFAULT_PORT.get(kind, 0), "user": unquote(p.username) if p.username else "", "password": unquote(p.password) if p.password else "",
            "database": (p.path or "").lstrip("/"), "query": q, "raw": u}


def split_secret(kind, url, secret=""):
    """If the owner typed user:password in the address, take the password out of it. Returns (address without a password, password)."""
    try:
        p = parse(kind, url)
    except ProbeError:
        return url, secret
    pw = secret or p["password"]
    clean = re.sub(r"(//[^/@:\s]*):[^/@\s]*@", r"\g<1>@", url.strip())
    return clean, pw


def sqlalchemy_url(kind, url, password=""):
    """The SQLAlchemy address a source uses to sync, with the driver this build has for that engine."""
    from sqlalchemy.engine import URL
    p = parse(kind, url)
    q = {}
    if kind == "oracle" and p["database"]:
        q["service_name"] = p["database"]
    return URL.create(SCHEMES[kind], username=p["user"] or None, password=password or p["password"] or None, host=p["host"], port=p["port"], database=None if kind == "oracle" else (p["database"] or None), query=q)


def _guard(host, port):
    try:
        guard.check_host(host, port)
    except guard.Refused as e:
        raise ProbeError(str(e))


def _sql(kind, p, password, query, timeout):
    q = check_query(query)
    if kind == "postgres":
        import psycopg2
        c = psycopg2.connect(host=p["host"], port=p["port"], user=p["user"] or None, password=password or None, dbname=p["database"] or "postgres", connect_timeout=timeout)
        ver_q = "show server_version"
        tab_q = "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')"
    elif kind == "mysql":
        import pymysql
        c = pymysql.connect(host=p["host"], port=p["port"], user=p["user"], password=password, database=p["database"] or None, connect_timeout=timeout, read_timeout=timeout)
        ver_q, tab_q = "select version()", "select count(*) from information_schema.tables where table_schema = database()"
    elif kind == "mssql":
        import pymssql
        c = pymssql.connect(server=p["host"], port=str(p["port"]), user=p["user"], password=password, database=p["database"] or "master", login_timeout=timeout, timeout=timeout)
        ver_q, tab_q = "select @@version", "select count(*) from information_schema.tables"
    else:
        import oracledb
        c = oracledb.connect(user=p["user"], password=password, dsn=f"{p['host']}:{p['port']}/{p['database'] or 'XE'}", tcp_connect_timeout=timeout)
        ver_q, tab_q = "select banner from v$version fetch first 1 rows only", "select count(*) from user_tables"
    try:
        cur = c.cursor()
        cur.execute(q)
        rows = cur.fetchall() if cur.description else []
        detail = {"rows": len(rows)}
        try:
            cur.execute(ver_q)
            detail["version"] = str(cur.fetchone()[0])[:80]
            cur.execute(tab_q)
            detail["tables"] = int(cur.fetchone()[0])
        except Exception:
            pass
        return detail
    finally:
        c.close()


def _mongo(p, password, query, timeout):
    import pymongo
    uri = p["raw"]
    kw = dict(serverSelectionTimeoutMS=timeout * 1000, connectTimeoutMS=timeout * 1000)
    if password:
        kw["password"] = password
    if p["user"]:
        kw["username"] = p["user"]
    host = p["host"]
    c = pymongo.MongoClient(host=host, port=p["port"], **kw) if "mongodb+srv" not in uri else pymongo.MongoClient(uri, **kw)
    try:
        cmd = json.loads(query) if (query or "").strip().startswith("{") else {"ping": 1}   # Kanshi's default is {"ping": 1}
        out = c[p["database"] or "admin"].command(cmd)
        detail = {"ok": bool(out.get("ok"))}
        try:
            detail["version"] = c.server_info().get("version", "")
            db = p["database"]
            detail["collections"] = len(c[db].list_collection_names()) if db else len(c.list_database_names())
        except Exception:
            pass
        return detail
    finally:
        c.close()


def _mqtt(p, password, topic, timeout):
    import threading
    import paho.mqtt.client as mqtt
    got = {"rc": None, "msg": None}
    ev, ev2 = threading.Event(), threading.Event()
    cl = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    if p["user"]:
        cl.username_pw_set(p["user"], password or None)

    def on_connect(c, u, f, rc, props=None):
        got["rc"] = rc
        ev.set()
        if rc == 0 and topic:
            c.subscribe(topic)

    def on_message(c, u, m):
        got["msg"] = {"topic": m.topic, "payload": m.payload[:200].decode("utf8", "replace")}
        ev2.set()
    cl.on_connect, cl.on_message = on_connect, on_message
    cl.connect(p["host"], p["port"], keepalive=10)
    cl.loop_start()
    try:
        if not ev.wait(timeout):
            raise ProbeError("The broker did not answer.")
        if str(got["rc"]) not in ("Success", "0"):
            raise ProbeError(f"The broker refused the login ({got['rc']}).")
        detail = {"connected": True}
        if topic and ev2.wait(min(3, timeout)):
            detail["sample"] = got["msg"]
        return detail
    finally:
        cl.loop_stop()
        cl.disconnect()


def _kafka(p, password, topic, timeout):
    from kafka import KafkaConsumer
    c = KafkaConsumer(bootstrap_servers=f"{p['host']}:{p['port']}", request_timeout_ms=timeout * 1000, api_version_auto_timeout_ms=timeout * 1000)
    try:
        topics = sorted(t for t in c.topics() if not t.startswith("__"))
        return {"topics": len(topics), "sample": topics[:5]}
    finally:
        c.close()


def _opcua(p, password, _q, timeout):
    import asyncio
    from asyncua import Client

    async def go():
        c = Client(p["raw"] if p["raw"].startswith("opc.tcp") else f"opc.tcp://{p['host']}:{p['port']}", timeout=timeout)
        await c.connect()
        try:
            kids = await c.nodes.objects.get_children()
            return {"objects": len(kids)}
        finally:
            await c.disconnect()
    return asyncio.run(go())


def _api(url, token, timeout):
    import httpx
    h = {"Authorization": "Bearer " + token} if token else {}
    r = httpx.get(url, headers=h, timeout=timeout, follow_redirects=False)
    if r.status_code >= 400:
        raise ProbeError(f"The service answered {r.status_code}.")
    try:
        data = r.json()
    except Exception:
        raise ProbeError("The service did not answer with JSON.")
    if isinstance(data, dict):
        data = next((v for v in data.values() if isinstance(v, list)), [data])
    return {"rows": len(data) if isinstance(data, list) else 1}


def test(kind, url, secret="", query="", timeout=8):
    """One connection test. Never raises: the answer says up or down, how long it took, and what was found."""
    t0 = time.time()
    try:
        if kind == "mcp":
            from mcpx import remote
            tr, tools = remote.list_tools(url, secret)
            detail = {"tools": len(tools), "read_only": sum(1 for t in tools if t["read_only"]), "transport": tr}
        elif kind == "api":
            from sentinel.guard import check_url
            check_url(url)
            detail = _api(url, secret, timeout)
        else:
            if kind not in DEFAULT_PORT:
                raise ProbeError("I do not know how to test that kind of system yet.")
            p = parse(kind, url)
            _guard(p["host"], p["port"])
            pw = secret or p["password"]
            if kind in SCHEMES:
                detail = _sql(kind, p, pw, query, timeout)
            elif kind == "mongodb":
                detail = _mongo(p, pw, query, timeout)
            elif kind == "mqtt":
                detail = _mqtt(p, pw, query or p["database"], timeout)
            elif kind == "kafka":
                detail = _kafka(p, pw, query, timeout)
            else:
                detail = _opcua(p, pw, query, timeout)
        ms = round((time.time() - t0) * 1000)
        bits = [f"{k} {v}" for k, v in detail.items() if k in ("version", "tables", "collections", "topics", "objects", "rows", "tools", "read_only") and v != ""]
        return {"ok": True, "status": "up", "ms": ms, "message": f"{LABEL.get(kind, kind)} answered in {ms} ms" + (" · " + ", ".join(bits) if bits else ""), "detail": detail}
    except ProbeError as e:
        return {"ok": False, "status": "down", "ms": round((time.time() - t0) * 1000), "message": str(e), "error": str(e)}
    except Exception as e:
        msg = f"{type(e).__name__}: {str(e).splitlines()[0] if str(e) else ''}"[:240]
        return {"ok": False, "status": "down", "ms": round((time.time() - t0) * 1000), "message": f"{LABEL.get(kind, kind)} test failed: {msg}", "error": msg}
