"""Telegram buttons: the message carries Approve and Reject, a tap from the right chat approves the fix, a tap from another chat does not. Run:  python tests/telegram_buttons_test.py"""
import os, sys, tempfile, threading
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_tg_")
os.environ["TOLERANCE_PORT"] = "48485"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import httpx
from server import hostops as H
from foreman import notify
from workspace import store

LIM = {"subject": "OVN1", "predicate": "max_temp_c", "value": 260, "doc": "d", "quote": "q", "status": "approved"}
H._limit = lambda p: LIM; H._limits_ctx = lambda: [LIM]
store.update(lambda d: d.setdefault("channels", []).append({"id": "ch1", "type": "telegram", "name": "Telegram", "token": "123:ABC" + "x" * 20, "chat_id": "42"}))

sent, posts = [], []
notify.telegram_buttons = lambda ch, text, rows, html=False: sent.append((text, rows)) or {"message_id": 7}
H._watch = lambda ch: None
from server import rbac
_d = store.load(); next(m for m in rbac._state(_d)["members"] if m.get("owner")).update(name="You", telegram_id=""); store.save(_d)                      # the poller is run by hand below
H.process({"name": "vm", "where": "gw", "services": {"mongod": True, "mosquitto": True}, "readings": {}, "results": []})
H.process({"name": "vm", "where": "gw", "services": {"mongod": False, "mosquitto": True}, "readings": {}, "results": []})
text, rows = sent[0]
assert "70/100" in text and "NEEDS YOUR APPROVAL" in text and [b[0] for b in rows[0]] == ["✅ Approve", "❌ Reject"], (text, rows)
iid = rows[0][0][1].split(":")[1]

class Done(BaseException): pass
calls = {"n": 0}
def fake_get(url, **kw):
    calls["n"] += 1
    if calls["n"] > 1:
        raise Done()
    return type("R", (), {"json": lambda self: {"result": [
        {"update_id": 1, "callback_query": {"id": "a", "data": f"hi:{iid}:a", "from": {"id": 9, "first_name": "Mallory"}, "message": {"message_id": 7, "text": "x", "chat": {"id": 999}}}},
        {"update_id": 2, "callback_query": {"id": "b", "data": f"hi:{iid}:a", "from": {"id": 7, "first_name": "Shreyash"}, "message": {"message_id": 7, "text": "x", "chat": {"id": 42}}}},
        {"update_id": 5, "callback_query": {"id": "c", "data": f"hi:{iid}:a", "from": {"id": 10, "first_name": "Stranger"}, "message": {"message_id": 7, "text": "x", "chat": {"id": 42}}}}]}})()
httpx.get = fake_get
httpx.post = lambda url, **kw: posts.append((url.rsplit("/", 1)[-1], kw.get("json"))) or None
try:
    H._poll({"token": "123:ABC" + "x" * 20, "chat_id": "42"}, "local")
except Done:
    pass
assert ("answerCallbackQuery", {"callback_query_id": "a", "text": "This chat is not allowed to approve."}) in posts, posts
inc = [i for i in H._state(store.load())["incidents"] if i["id"] == iid][0]
assert ("answerCallbackQuery", {"callback_query_id": "c", "text": "You are not on the team. Ask the owner for a link code."}) in posts, posts
assert inc["status"] == "applying" and inc["by"] == "Shreyash (Owner)" and inc["via"] == "Telegram", inc
assert any(p[0] == "editMessageText" and "Approved by Shreyash (Owner) through Telegram" in p[1]["text"] for p in posts), posts
print("telegram_buttons_test ok")
