"""Tests Sentinel's protocol checks against small fake servers on this machine. Run:  python tests/sentinel_protocols_test.py"""
import os, socket, struct, sys, threading

os.environ["TOLERANCE_ALLOW_PRIVATE_NOTIFY"] = "1"   # the fake servers are on 127.0.0.1
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sentinel import protocols as P


def fake(first=None, answer=None):
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)

    def run():
        c, _ = srv.accept()
        c.settimeout(2)
        try:
            if first is not None:
                c.sendall(first)
            else:
                got = c.recv(4096)
                c.sendall(answer(got))
        except Exception:
            pass
        c.close()
        srv.close()
    threading.Thread(target=run, daemon=True).start()
    return srv.getsockname()[1]


def mongo_reply(_):
    inner = b"\x10maxWireVersion\x00" + struct.pack("<i", 17)
    doc = struct.pack("<i", len(inner) + 5) + inner + b"\x00"
    body = struct.pack("<I", 0) + b"\x00" + doc
    return struct.pack("<iiii", 16 + len(body), 2, 1, 2013) + body


CASES = [
    ("mqtt", dict(answer=lambda g: b"\x20\x02\x00\x00"), lambda o: o["protocol_ok"] and o["connack_code"] == 0 and not o["auth_required"]),
    ("mqtt", dict(answer=lambda g: b"\x20\x02\x00\x05"), lambda o: o["protocol_ok"] and o["auth_required"]),
    ("redis", dict(answer=lambda g: b"+PONG\r\n"), lambda o: o["protocol_ok"] and not o["auth_required"]),
    ("redis", dict(answer=lambda g: b"-NOAUTH Authentication required.\r\n"), lambda o: o["protocol_ok"] and o["auth_required"]),
    ("postgres", dict(answer=lambda g: b"N"), lambda o: o["protocol_ok"] and not o["tls_offered"]),
    ("mysql", dict(first=b"\x4a\x00\x00\x00\x0a8.0.36\x00" + b"\x00" * 20), lambda o: o["protocol_ok"] and o["server_version"] == "8.0.36"),
    ("mongodb", dict(answer=mongo_reply), lambda o: o["protocol_ok"] and o["max_wire_version"] == 17),
    ("rabbitmq", dict(answer=lambda g: b"\x01\x00\x00\x00\x00\x01\x2a"), lambda o: o["protocol_ok"]),
    ("opcua", dict(answer=lambda g: b"ACKF" + b"\x00" * 24), lambda o: o["protocol_ok"] and o["accepted"]),
    ("memcached", dict(answer=lambda g: b"VERSION 1.6.21\r\n"), lambda o: o["protocol_ok"] and o["server_version"] == "1.6.21"),
    ("redis", dict(answer=lambda g: b"<html>not redis</html>"), lambda o: not o["protocol_ok"]),   # a web server on the Redis port must not pass
]


def main():
    bad = 0
    for proto, kw, ok in CASES:
        port = fake(**kw)
        obs = P.observe(proto, "127.0.0.1", port)
        if not (obs.get("reachable") and ok(obs)):
            bad += 1
            print("FAIL", proto, obs)
    dead = P.observe("redis", "127.0.0.1", 1)
    if dead.get("reachable") or dead.get("protocol_ok"):
        bad += 1
        print("FAIL: a closed port must be unreachable", dead)
    print("protocol tests:", "all passed" if not bad else f"{bad} failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
