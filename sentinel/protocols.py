"""Protocol checks: does a service answer in its own protocol? Each check opens a connection, sends the first message of the protocol,
and reads the reply. No login is used and no data is read. This proves the right kind of service is listening and how fast it answers.
The list of services follows the monitors of the Kanshi project; the code here is new and small."""
import socket, struct, time

import httpx

from sentinel import guard

# protocol: (title, default port, kind). kind "tcp" speaks a raw protocol; kind "http" is a web address.
PROTOCOLS = {
    "mqtt": ("MQTT broker", 1883, "tcp"),
    "redis": ("Redis", 6379, "tcp"),
    "postgres": ("PostgreSQL", 5432, "tcp"),
    "mysql": ("MySQL or MariaDB", 3306, "tcp"),
    "mongodb": ("MongoDB", 27017, "tcp"),
    "rabbitmq": ("RabbitMQ (AMQP)", 5672, "tcp"),
    "opcua": ("OPC UA server", 4840, "tcp"),
    "memcached": ("Memcached", 11211, "tcp"),
    "sqlserver": ("SQL Server (port only)", 1433, "tcp"),
    "influxdb": ("InfluxDB", 8086, "http"),
    "clickhouse": ("ClickHouse", 8123, "http"),
    "elasticsearch": ("Elasticsearch", 9200, "http"),
}


def _exchange(host, port, payload, want=64, timeout=5.0):
    """Connect, send the first bytes (if any), read the reply. Returns (reply, ms)."""
    t0 = time.time()
    with socket.create_connection((host, int(port)), timeout=timeout) as s:
        s.settimeout(timeout)
        if payload:
            s.sendall(payload)
        try:
            data = s.recv(want)
        except socket.timeout:
            data = b""
    return data, round((time.time() - t0) * 1000)


def _bson_int(doc, key):
    """The int32 value of a top-level key in a BSON document, or None. Enough to read maxWireVersion."""
    i, k = 4, key.encode() + b"\x00"
    while i < len(doc) - 1:
        t = doc[i]
        j = doc.index(b"\x00", i + 1)
        name = doc[i + 1:j + 1]
        i = j + 1
        if t == 0x10:
            if name == k:
                return struct.unpack("<i", doc[i:i + 4])[0]
            i += 4
        elif t in (0x01, 0x12, 0x09):
            i += 8
        elif t == 0x08:
            i += 1
        elif t == 0x02:
            n = struct.unpack("<i", doc[i:i + 4])[0]
            i += 4 + n
        elif t in (0x03, 0x04):
            n = struct.unpack("<i", doc[i:i + 4])[0]
            i += n
        else:
            return None
    return None


def _mqtt(host, port):
    cid = b"tolerance-sentinel"
    var = b"\x00\x04MQTT\x04\x02\x00\x0a" + struct.pack(">H", len(cid)) + cid
    reply, ms = _exchange(host, port, bytes([0x10, len(var)]) + var)
    ok = len(reply) >= 4 and reply[0] == 0x20 and reply[1] == 2
    return {"protocol_ok": ok, "latency_ms": ms, "connack_code": reply[3] if ok else None, "auth_required": ok and reply[3] in (4, 5)}


def _redis(host, port):
    reply, ms = _exchange(host, port, b"*1\r\n$4\r\nPING\r\n")
    ok = reply.startswith((b"+PONG", b"-NOAUTH", b"-ERR", b"-DENIED"))
    return {"protocol_ok": ok, "latency_ms": ms, "auth_required": reply.startswith(b"-NOAUTH")}


def _postgres(host, port):
    reply, ms = _exchange(host, port, struct.pack(">II", 8, 80877103))   # the SSLRequest message: the server answers S or N
    return {"protocol_ok": reply[:1] in (b"S", b"N"), "latency_ms": ms, "tls_offered": reply[:1] == b"S"}


def _mysql(host, port):
    reply, ms = _exchange(host, port, b"", want=128)   # the server speaks first
    ok = len(reply) > 6 and reply[4] == 0x0A
    ver = reply[5:reply.index(b"\x00", 5)].decode("latin-1", "replace") if ok and b"\x00" in reply[5:] else None
    return {"protocol_ok": ok, "latency_ms": ms, "server_version": ver}


def _mongodb(host, port):
    doc = b"".join([b"\x10hello\x00" + struct.pack("<i", 1), b"\x02$db\x00" + struct.pack("<i", 6) + b"admin\x00"])
    doc = struct.pack("<i", len(doc) + 5) + doc + b"\x00"
    body = struct.pack("<I", 0) + b"\x00" + doc   # flag bits, section kind 0, the document
    msg = struct.pack("<iiii", 16 + len(body), 1, 0, 2013) + body
    reply, ms = _exchange(host, port, msg, want=2048)
    ok = len(reply) >= 16 and struct.unpack("<i", reply[12:16])[0] in (1, 2013)
    wire = _bson_int(reply[21:], "maxWireVersion") if ok and len(reply) > 25 else None
    return {"protocol_ok": ok, "latency_ms": ms, "max_wire_version": wire}


def _rabbitmq(host, port):
    reply, ms = _exchange(host, port, b"AMQP\x00\x00\x09\x01")
    return {"protocol_ok": reply[:1] == b"\x01" or reply.startswith(b"AMQP"), "latency_ms": ms}


def _opcua(host, port):
    url = f"opc.tcp://{host}:{port}".encode()
    body = struct.pack("<IIIII", 0, 65536, 65536, 0, 0) + struct.pack("<i", len(url)) + url
    reply, ms = _exchange(host, port, b"HELF" + struct.pack("<I", 8 + len(body)) + body)
    return {"protocol_ok": reply[:4] in (b"ACKF", b"ERRF"), "latency_ms": ms, "accepted": reply[:4] == b"ACKF"}


def _memcached(host, port):
    reply, ms = _exchange(host, port, b"version\r\n")
    return {"protocol_ok": reply.startswith(b"VERSION"), "latency_ms": ms, "server_version": reply[8:].strip().decode("latin-1", "replace") or None}


def _sqlserver(host, port):
    reply, ms = _exchange(host, port, b"")
    return {"protocol_ok": True, "latency_ms": ms}   # a port answered; the SQL Server login protocol is not spoken here


_TCP = {"mqtt": _mqtt, "redis": _redis, "postgres": _postgres, "mysql": _mysql, "mongodb": _mongodb, "rabbitmq": _rabbitmq, "opcua": _opcua, "memcached": _memcached, "sqlserver": _sqlserver}
_HTTP_PATHS = {"influxdb": ["/health", "/ping"], "clickhouse": ["/ping"], "elasticsearch": ["/"]}


def observe(protocol, host="", port=0, url=""):
    """One observation for a service. Never raises for a down service: it says reachable false."""
    if protocol not in PROTOCOLS:
        raise ValueError("unknown protocol")
    kind = PROTOCOLS[protocol][2]
    if kind == "http":
        base = guard.check_url(url).rstrip("/")
        last = None
        for path in _HTTP_PATHS[protocol]:
            t0 = time.time()
            try:
                r = httpx.get(base + path, timeout=6, follow_redirects=False)
            except Exception as e:
                last = {"reachable": False, "protocol_ok": False, "error": f"{type(e).__name__}: {str(e)[:100]}", "latency_ms": round((time.time() - t0) * 1000)}
                continue
            ok = r.status_code in (200, 204) or (protocol == "elasticsearch" and r.status_code == 401)
            body = None
            try:
                body = r.json()
            except Exception:
                pass
            obs = {"reachable": True, "protocol_ok": ok, "status": r.status_code, "latency_ms": round((time.time() - t0) * 1000), "auth_required": r.status_code == 401}
            if isinstance(body, dict):
                obs["server_version"] = (body.get("version") or {}).get("number") if isinstance(body.get("version"), dict) else body.get("version")
                obs["health"] = body.get("status")
            if ok:
                return obs
            last = obs
        return last or {"reachable": False, "protocol_ok": False}
    port = int(port or PROTOCOLS[protocol][1])
    guard.check_host(host, port)
    t0 = time.time()
    try:
        obs = _TCP[protocol](host, port)
        obs["reachable"] = True
        return obs
    except Exception as e:
        return {"reachable": False, "protocol_ok": False, "error": f"{type(e).__name__}: {str(e)[:100]}", "latency_ms": round((time.time() - t0) * 1000)}
