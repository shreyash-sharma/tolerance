"""Pairing: /start gets a hello, a wrong code is refused, /pair <code> saves the chat as a channel and confirms. Run:  python tests/telegram_pair_test.py"""
import os, sys, tempfile, time
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_pair_")
os.environ["TOLERANCE_PORT"] = "48486"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import httpx
from server import hostops as H
from foreman import notify
from workspace import store

code = "ABC123"
H.PAIR[code] = {"token": "123:ABC" + "x" * 20, "uid": "local", "bot": "plant_bot", "done": False, "chat": "", "name": "", "until": time.time() + 60}
posts, n = [], {"n": 0}
def upd(i, chat, text): return {"update_id": i, "message": {"chat": {"id": chat, "first_name": "Shreyash"}, "text": text}}
class Done(BaseException): pass
def fake_get(url, **kw):
    n["n"] += 1
    if n["n"] == 1:
        return type("R", (), {"json": lambda self: {"result": [upd(1, 42, "/start"), upd(2, 42, "/pair WRONG1"), upd(3, 42, f"/pair {code}")]}})()
    return type("R", (), {"json": lambda self: {"result": []}})()
httpx.get = fake_get
httpx.post = lambda url, **kw: posts.append((url.rsplit("/", 1)[-1], (kw.get("json") or {}).get("text", ""))) or None
H._pair_loop(code)
texts = [t for _, t in posts]
assert any("send:  /pair" in t for t in texts), texts
assert any("not right" in t for t in texts), texts
assert any(t.startswith("Paired") for t in texts), texts
assert H.PAIR[code]["done"] and H.PAIR[code]["chat"] == "42"
ch = [c for c in store.load().get("channels", []) if c["type"] == "telegram"]
assert len(ch) == 1 and ch[0]["chat_id"] == "42", ch
print("telegram_pair_test ok")
