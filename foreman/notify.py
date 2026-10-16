"""Tells a person that something needs them. Warden's "a person must approve" reaches Slack, Teams, Discord, Telegram or any webhook,
not only the app. Channels belong to one visitor. Ideas follow the notification providers of the Kanshi project; the code is new and small.

A visitor can paste any address, so every address is checked first: https only, and never a private, loopback or link-local address
(the cloud metadata server lives there). A secret (webhook address, bot token) is never sent back to the screen."""
import contextvars, ipaddress, os, socket, threading, time, uuid
from urllib.parse import urlparse

import httpx

from workspace import store

TYPES = {
    "slack": {"title": "Slack", "fields": ["url"], "hint": "Incoming webhook address"},
    "teams": {"title": "Microsoft Teams", "fields": ["url"], "hint": "Workflow or webhook address"},
    "discord": {"title": "Discord", "fields": ["url"], "hint": "Channel webhook address"},
    "telegram": {"title": "Telegram", "fields": ["token", "chat_id"], "hint": "Bot token and chat id"},
    "webhook": {"title": "Any webhook (JSON)", "fields": ["url"], "hint": "Receives a JSON message"},
}
MAX_CHANNELS = 5
_SENT = {}   # visitor -> times of recent sends (a small rate limit)


class Refused(ValueError):
    pass


def public_url():
    return os.environ.get("TOLERANCE_PUBLIC_URL") or "https://tolerance-749288317336.asia-southeast1.run.app"


def check_url(url):
    """Raises Refused unless this address is https and points at the public internet."""
    p = urlparse(str(url or "").strip())
    if p.scheme != "https" or not p.hostname:
        raise Refused("The address must start with https://")
    if os.environ.get("TOLERANCE_ALLOW_PRIVATE_NOTIFY") == "1":
        return p.geturl()
    try:
        infos = socket.getaddrinfo(p.hostname, p.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        raise Refused("I cannot find that address.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise Refused("That address points inside a private network. Use a public address.")
    return p.geturl()


# ---------------------------------------------------------------- storage
def _all():
    return store.load().get("channels", [])


def public():
    """Channels for the screen: no secrets."""
    return [{"id": c["id"], "type": c["type"], "name": c["name"], "hint": _mask(c), "last": c.get("last")} for c in _all()]


def _mask(c):
    if c["type"] == "telegram":
        return "chat " + str(c.get("chat_id", ""))[:12]
    host = urlparse(c.get("url", "")).hostname or ""
    return host


def add(kind, name, url="", token="", chat_id=""):
    if kind not in TYPES:
        raise Refused("unknown channel type")
    d = store.load()
    if len(d.get("channels", [])) >= MAX_CHANNELS:
        raise Refused(f"At most {MAX_CHANNELS} channels. Remove one first.")
    ch = {"id": "ch_" + uuid.uuid4().hex[:8], "type": kind, "name": (name or TYPES[kind]["title"]).strip()[:40]}
    if kind == "telegram":
        if not token.strip() or not chat_id.strip():
            raise Refused("Telegram needs a bot token and a chat id.")
        ch.update(token=token.strip()[:200], chat_id=chat_id.strip()[:40])
    else:
        ch["url"] = check_url(url)
    d.setdefault("channels", []).append(ch)
    store.save(d)
    return ch["id"]


def remove(cid):
    d = store.load()
    d["channels"] = [c for c in d.get("channels", []) if c["id"] != cid]
    store.save(d)


# ---------------------------------------------------------------- sending
def _post(url, body):
    r = httpx.post(url, json=body, timeout=10, follow_redirects=False)
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code} {r.text[:120]}")


def send_one(ch, title, text, link=None):
    """One message to one channel. Raises on failure."""
    body = f"{text}\n{link}" if link else text
    if ch["type"] == "slack":
        _post(check_url(ch["url"]), {"text": f"*{title}*\n{body}"})
    elif ch["type"] == "teams":
        _post(check_url(ch["url"]), {"type": "message", "attachments": [{"contentType": "application/vnd.microsoft.card.adaptive", "content": {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json", "type": "AdaptiveCard", "version": "1.4",
            "body": [{"type": "TextBlock", "weight": "Bolder", "text": title}, {"type": "TextBlock", "wrap": True, "text": body}]}}]})
    elif ch["type"] == "discord":
        _post(check_url(ch["url"]), {"content": f"**{title}**\n{body}"[:1900]})
    elif ch["type"] == "telegram":
        _post(f"https://api.telegram.org/bot{ch['token']}/sendMessage", {"chat_id": ch["chat_id"], "text": f"{title}\n{body}"[:3900], "disable_web_page_preview": True})
    else:
        _post(check_url(ch["url"]), {"title": title, "text": text, "link": link, "source": "tolerance", "at": time.time()})


def telegram_buttons(ch, text, rows, html=False):
    """A Telegram message with buttons. rows: [[(label, callback_data), ...], ...]. Returns the sent message."""
    r = httpx.post(f"https://api.telegram.org/bot{ch['token']}/sendMessage", json={"chat_id": ch["chat_id"], "text": text[:3900], "disable_web_page_preview": True, **({"parse_mode": "HTML"} if html else {}),
                   "reply_markup": {"inline_keyboard": [[{"text": t, "callback_data": c} for t, c in row] for row in rows]}}, timeout=10)
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code} {r.text[:120]}")
    return (r.json() or {}).get("result", {})


def telegram_html(ch, text):
    """A Telegram message in HTML (bold, emojis). Returns the sent message."""
    r = httpx.post(f"https://api.telegram.org/bot{ch['token']}/sendMessage", json={"chat_id": ch["chat_id"], "text": text[:3900], "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=10)
    if r.status_code >= 400:
        raise RuntimeError(f"{r.status_code} {r.text[:120]}")
    return (r.json() or {}).get("result", {})


def test(cid):
    ch = next((c for c in _all() if c["id"] == cid), None)
    if not ch:
        raise Refused("no such channel")
    try:
        send_one(ch, "Tolerance test", "This is a test message. Warden will use this channel when a person must approve an action.", public_url())
        res = {"ok": True}
    except Exception as e:
        res = {"ok": False, "error": str(e)[:160]}
    d = store.load()
    for c in d.get("channels", []):
        if c["id"] == cid:
            c["last"] = {"ok": res["ok"], "at": time.time(), "error": res.get("error")}
    store.save(d)
    return res


def _allowed(uid):
    now = time.time()
    hits = [t for t in _SENT.get(uid, []) if now - t < 60]
    if len(hits) >= 10:
        _SENT[uid] = hits
        return False
    hits.append(now)
    _SENT[uid] = hits
    return True


def dispatch(title, text, link=None):
    """Send to every channel of this visitor, in the background. Never raises: a broken channel must not stop the flow."""
    chans = list(_all())
    if not chans or not _allowed(store.UID.get()):
        return 0
    ctx = contextvars.copy_context()

    def go():
        for ch in chans:
            try:
                send_one(ch, title, text, link or public_url())
            except Exception as e:
                try:
                    d = store.load()
                    for c in d.get("channels", []):
                        if c["id"] == ch["id"]:
                            c["last"] = {"ok": False, "at": time.time(), "error": str(e)[:160]}
                    store.save(d)
                except Exception:
                    pass
    threading.Thread(target=lambda: ctx.run(go), daemon=True, name="notify").start()
    return len(chans)
