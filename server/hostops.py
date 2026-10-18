"""Host operations: a probe on a real server reports which services run and what a machine reads. When a service stops, or an oven goes above the limit
in the documents, Tolerance opens an incident, Warden scores the fix, and the fix runs by itself, or a person approves it in the app or on Telegram.
The probe only asks for work (a pull model): nothing connects in to the server. It can run only the commands in its own short list."""
import hashlib, hmac, os, secrets, threading, time

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from foreman import notify, outcomes, safety
from server import rbac
from workspace import store

router = APIRouter(prefix="/api/host")
LOCK = store.LOCK   # the workspace file's own lock: a read-change-write here can never be overwritten by a stale copy from another thread

# the services the probe may restart, and the stations whose data each one carries (from the plant's documents)
UNITS = {
    "mongod": {"label": "MongoDB", "affects": ["C1", "C2", "TR"], "what": "inspection results and maintenance notes"},
    "mosquitto": {"label": "MQTT broker", "affects": ["OVN1"], "what": "the sensor feed of the line"},
    "cloud_sql": {"label": "Cloud SQL database", "affects": ["WH1", "C1", "C2"], "what": "the ERP orders and materials"},
}
OVEN = "OVN1"
# the readings a probe reports, and the station each one belongs to. The playbook page uses this to say what is watched from a station.
READINGS = {
    "oven_temp_c": {"label": "Oven temperature", "unit": "\u00B0C", "station": OVEN, "limit": "max_temp_c"},
    "oven_target_c": {"label": "Oven setpoint", "unit": "\u00B0C", "station": OVEN},
    "oven_setpoint_c": {"label": "Oven setpoint (MQTT)", "unit": "\u00B0C", "station": OVEN},
}
OVEN_SAFE = 235.0   # the setpoint a fix asks for


def _secret():
    raw = os.environ.get("TOLERANCE_VAULT_KEY", "")
    if raw:
        return raw.encode()
    from plant import core
    from workspace import vault
    vault._fernet()   # makes the key file if there is none
    return open(os.path.join(core.DATA, "vault.key"), "rb").read()


def token_for(uid):
    """A probe's token: derived from the server's secret and the owner, so no list of tokens is kept."""
    return hmac.new(_secret(), f"host:{uid}".encode(), hashlib.sha256).hexdigest()[:32]


def _state(d):
    h = d.setdefault("host", {})
    h.setdefault("probes", {})
    h.setdefault("incidents", [])
    h.setdefault("commands", [])
    h.setdefault("audit", [])
    h.setdefault("issues", [])
    return h


def _audit(h, text):
    h["audit"].append({"at": time.time(), "text": text})
    del h["audit"][:-80]
    print(f"[host] {text}", flush=True)
    print(f"[host] {text}", flush=True)   # the server log shows the same story as the audit log


def _limit(pred):
    try:
        from documents import engine as DE
        for l in DE.limits():
            if str(l["subject"]).upper() == OVEN and l["predicate"] == pred and str(l.get("status")) != "rejected":
                return l
    except Exception:
        pass
    return None


def _num(v):
    try:
        return float(v)
    except Exception:
        return None


# ------------------------------------------------------------------ incidents
def _open(h, kind, target, title, detail, action, ctx):
    scored = safety.score_action(action, ctx)
    inc = {"id": store.new_id("inc"), "kind": kind, "target": target, "title": title, "detail": detail, "action": action, "scored": {k: scored[k] for k in ("kind", "label", "score", "decision", "violations", "floor", "limit", "factors", "within_limits", "needs_person", "action")},
           "status": "waiting", "opened": time.time(), "by": None, "via": None, "messages": []}
    h["incidents"].append(inc)
    _audit(h, f"{title}. Fix proposed: {scored['label']} (score {scored['score']}, {scored['decision']})")
    return inc, scored


def _queue(h, inc, by, via):
    """Run the fix: the Action Broker asks Cedar first. Then the probe gets one command."""
    scored = inc["scored"]
    rec = safety.apply({**scored, "action": inc["action"], "label": scored["label"]}, approved_by=by if via != "auto" else None)
    if rec["mode"] == "refused":
        inc["status"] = "refused"
        _audit(h, f"{inc['title']}: the Action Broker did not apply the fix ({rec['status']})")
        return False
    a = inc["action"]
    cmd = {"id": store.new_id("cmd"), "incident": inc["id"], "kind": "set_oven" if a["kind"] == "adjust_temperature" else "service_restart",
           "unit": a["station"] if a["kind"] != "adjust_temperature" else None, "value": (a["params"] or {}).get("max_temp_c"), "by": "Warden" if via == "auto" else by, "via": "its own score" if via == "auto" else via, "at": time.time(), "state": "pending"}
    h["commands"].append(cmd)
    inc.update(status="applying", by=by, via=via, decided=time.time())
    _audit(h, f"{inc['title']}: {'applied by itself' if via == 'auto' else 'approved by ' + str(by) + ' through ' + via}. Command {cmd['kind']} sent to the probe")
    return True


def _text(inc, extra=""):
    s = inc["scored"]
    lines = [inc["title"], inc["detail"], f"Fix: {s['label']}" + (f" ({_fix_text(inc)})" if _fix_text(inc) else "") + f". Warden score {s['score']} of 100 (floor {s['floor']}, limit {s['limit']})."]
    if s["violations"]:
        lines.append("Blocked: " + "; ".join(s["violations"]))
    if extra:
        lines.append(extra)
    return "\n".join(lines)


def _fix_text(inc):
    a = inc["action"]
    return f"set the oven to {a['params'].get('max_temp_c')} C" if a["kind"] == "adjust_temperature" else (f"start {UNITS[a['station']]['label']} again" if a["station"] == "cloud_sql" else f"restart {a['station']}")


_BADGE = {"waiting": ("\U0001F7E0", "NEEDS YOUR APPROVAL"), "applying": ("\U0001F535", "FIX IS RUNNING"), "resolved": ("\U0001F7E2", "RESOLVED"), "rejected": ("\u26AA", "REJECTED"),
          "refused": ("\U0001F534", "NOT APPLIED"), "blocked": ("\u26D4", "BLOCKED BY A HARD LIMIT")}


def _bar(score):
    n = max(0, min(10, round(score / 10)))
    return "\u25B0" * n + "\u25B1" * (10 - n)


def _tg(inc, note=""):
    """The Telegram message: the state in emojis, the facts in bold, the score as a bar, and a plain line for what happens next."""
    import html
    e = html.escape
    s, a = inc["scored"], inc["action"]
    dot, word = _BADGE.get(inc["status"], ("\U0001F7E0", inc["status"].upper()))
    head = "\U0001F6A8" if inc["kind"] == "service_down" else "\U0001F321\uFE0F"
    if inc["status"] == "resolved":
        head = "\u2705"
    fix = (f"set the oven to <b>{e(str(a['params'].get('max_temp_c')))} \u00B0C</b>" if a["kind"] == "adjust_temperature"
           else f"start <b>{e(UNITS[a['station']]['label'])}</b> again" if a["station"] == "cloud_sql" else f"restart <b>{e(a['station'])}</b>")
    lines = [f"{head} <b>{e(inc['title'])}</b>", "\u2501" * 14, f"\U0001F4CB {e(inc['detail'])}", f"\U0001F6E0 Fix: {fix}",
             f"\U0001F6E1 Warden score: <b>{s['score']}/100</b>  {_bar(s['score'])}", f"<i>asks a person below {s['limit']}, refuses below {s['floor']}</i>"]
    if s["violations"]:
        lines.append("\u26D4 " + e("; ".join(s["violations"])))
    lines.append("")
    lines.append(f"{dot} <b>{word}</b>")
    if inc.get("by") and inc["status"] != "waiting":
        who = "Warden, by its own score" if inc.get("via") in ("auto", "its own score") else f"{e(str(inc['by']))} through {e(str(inc.get('via')))}"
        lines.append(("\u274C Rejected by " if inc["status"] == "rejected" else "\u2705 Approved by " if inc.get("via") not in ("auto", "its own score") else "\U0001F916 Applied by ") + who)
    if note:
        lines.append(f"<i>{e(note)}</i>")
    return "\n".join(lines)


def _tell(inc, extra="", buttons=False):
    """Telegram gets a formatted message, with Approve and Reject buttons when a person must decide. Every other channel gets plain text."""
    for ch in list(notify._all()):
        try:
            if ch["type"] == "telegram":
                if buttons:
                    r = notify.telegram_buttons(ch, _tg(inc, extra), [[("\u2705 Approve", f"hi:{inc['id']}:a"), ("\u274C Reject", f"hi:{inc['id']}:r")]], html=True)
                    inc["messages"].append({"chat": ch["chat_id"], "id": r.get("message_id")})
                    _watch(ch)
                else:
                    notify.telegram_html(ch, _tg(inc, extra))
            else:
                notify.send_one(ch, "Tolerance", _text(inc, extra), notify.public_url())
        except Exception as e:
            _audit(_state(store.load()), f"Could not tell {ch.get('name', ch['type'])}: {str(e)[:80]}")


def _took(seconds):
    m, s = divmod(int(seconds), 60)
    return f"{m} min {s} s" if m else f"{s} s"


def _followup_facts(inc):
    """What happened, in plain words, for the message that asks the people how it went."""
    res = outcomes.resolver_of(inc)
    took = _took(max(0, (inc.get("resolved") or time.time()) - inc["opened"]))
    if res == "tolerance":
        how = f"Tolerance started it again, approved by {inc.get('by')} through {inc.get('via')}."
    elif res == "plant":
        how = "Someone fixed it outside Tolerance."
    else:
        how = "It came back by itself."
    return how, took


def _followup_tg(inc, note=""):
    import html
    e = html.escape
    how, took = _followup_facts(inc)
    lines = [f"\u2705 <b>{e(inc['title'].replace(' is down', ' is back'))}</b>", "\u2501" * 14, f"\U0001F4CB {e(inc['detail'])}", f"\U0001F6E0 {e(how)}",
             f"\u23F1 Back after <b>{took}</b>. The automatic check says it answers."]
    if note:
        lines += ["", note]
    else:
        lines += ["", "<b>Is it restored, and is everything working?</b>"]
    return "\n".join(lines)


def _followup_text(inc):
    how, took = _followup_facts(inc)
    return f"{inc['title'].replace(' is down', ' is back')}\n{inc['detail']}\n{how}\nBack after {took}. The automatic check says it answers.\nIs it restored, and is everything working?"


def _followup(iid):
    """After a Cloud SQL database is back: ask the people if it is restored and everything works. The answer is kept as the outcome."""
    with LOCK:
        d = store.load()
        inc = next((i for i in _state(d)["incidents"] if i["id"] == iid), None)
        if not inc or inc.get("followup"):
            return
        inc["followup"] = time.time()
        store.save(d)
    for ch in list(notify._all()):
        try:
            if ch["type"] == "telegram":
                notify.telegram_buttons(ch, _followup_tg(inc), [[("\u2705 Yes, all working", f"fb:{iid}:y"), ("\u26A0\uFE0F Partly", f"fb:{iid}:p"), ("\u274C Not fixed", f"fb:{iid}:n")]], html=True)
                _watch(ch)
            else:
                notify.send_one(ch, "Tolerance", _followup_text(inc) + "\nAnswer in the app, on Operations.", notify.public_url())
        except Exception as e:
            _audit_note(f"Could not ask {ch.get('name', ch['type'])} how it went: {str(e)[:80]}")


def _feedback_tap(cq, base, ch, uid):
    import httpx
    chat = str((cq.get("message") or {}).get("chat", {}).get("id", ""))

    def say(text):
        httpx.post(base + "/answerCallbackQuery", json={"callback_query_id": cq["id"], "text": text}, timeout=10)
    if chat != str(ch["chat_id"]):
        say("This chat is not allowed to answer.")
        return
    _, iid, v = cq["data"].split(":")
    verdict = {"y": "yes", "p": "partly", "n": "no"}.get(v)
    tok = store.UID.set(uid)
    try:
        person = rbac.member(telegram_id=(cq.get("from") or {}).get("id"))
        if not person and not any(x.get("telegram_id") for x in rbac._state()["members"]):
            person = rbac.link_owner((cq.get("from") or {}).get("id"), (cq.get("from") or {}).get("first_name"))
        if not person or not rbac.allowed(person["id"], "run_checks"):
            say("Your role may not answer this.")
            return
        who = rbac.label(person)
        row = outcomes.feedback(iid, verdict, who, "Telegram")
        inc = next((i for i in _state(store.load())["incidents"] if i["id"] == iid), None)
        est = outcomes.record(*outcomes.counts(row["action"], row["station"])) if row else None
    finally:
        store.UID.reset(tok)
    say("Recorded." if row else "No record for this.")
    msg = cq.get("message") or {}
    if row and inc and msg.get("message_id"):
        import html
        note = f"\U0001F9E0 <b>Recorded:</b> {html.escape(outcomes.VERDICTS[verdict][0])}, by {html.escape(who)}.\nWarden's record for this fix is now <b>{est * 100:.0f}%</b>."
        httpx.post(base + "/editMessageText", json={"chat_id": ch["chat_id"], "message_id": msg["message_id"], "text": _followup_tg(inc, note), "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=10)


def report_issue(title, target, details, by):
    """A person opens an issue by hand. It joins the same record as the incidents Tolerance finds."""
    with LOCK:
        d = store.load()
        h = _state(d)
        iss = {"id": store.new_id("iss"), "title": str(title).strip()[:120], "target": str(target).strip()[:40], "details": str(details).strip()[:600], "by": by, "opened": time.time(), "status": "open", "resolver": None, "note": ""}
        h["issues"].append(iss)
        del h["issues"][:-60]
        _audit(h, f"{by} reported an issue: {iss['title']}")
        store.save(d)
    try:
        notify.dispatch("Issue reported", f"{by}: {iss['title']}" + (f" ({iss['target']})" if iss["target"] else ""))
    except Exception:
        pass
    return iss


def resolve_issue(iid, note, by):
    """A person says what was done. The note is required: it is what Tolerance keeps and learns from."""
    note = str(note or "").strip()
    if len(note) < 5:
        raise ValueError("Write what was done to resolve it.")
    with LOCK:
        d = store.load()
        h = _state(d)
        iss = next((i for i in h["issues"] if i["id"] == iid), None)
        if not iss or iss["status"] != "open":
            return None
        now = time.time()
        iss.update(status="resolved", resolver="plant", resolved=now, note=note[:600], resolved_by=by)
        d.setdefault("outcomes", []).append({"id": store.new_id("out"), "incident": iid, "title": iss["title"], "kind": "manual", "target": iss["target"], "action": None, "station": iss["target"], "ctx": "manual:" + iss["target"],
                                             "opened": iss["opened"], "resolved": now, "restore_s": round(now - iss["opened"]), "resolver": "plant", "by": by, "via": "the app", "auto_check": False,
                                             "verdict": None, "verdict_by": None, "verdict_at": None, "note": note[:600]})
        _audit(h, f"{by} resolved an issue: {iss['title']}")
        store.save(d)
    return iss


def _issue_from_telegram(msg0, base, ch, uid):
    import httpx
    if str((msg0.get("chat") or {}).get("id", "")) != str(ch["chat_id"]):
        return
    text = str(msg0.get("text", "")).split(None, 1)
    body = text[1].strip() if len(text) > 1 else ""
    tok = store.UID.set(uid)
    try:
        person = rbac.member(telegram_id=(msg0.get("from") or {}).get("id"))
        if not person or not rbac.allowed(person["id"], "run_checks"):
            reply = "Your role may not report issues, or you are not linked. Send /link CODE first."
        elif not body:
            reply = "Write the issue after the command. For example: /issue WH1 conveyor jam"
        else:
            words = body.split(None, 1)
            known = {s.lower() for s in list(UNITS) + ["AGV", "C1", "C2", "TR", "WH1", "WH2", "OVN1"]}
            target, details = (words[0], words[1] if len(words) > 1 else "") if words[0].lower() in known else ("", body)
            iss = report_issue(details or body, target, "", rbac.label(person))
            reply = f"Issue opened: {iss['title']}" + (f" ({iss['target']})" if iss["target"] else "") + ". It is on the SLO and incidents page."
    finally:
        store.UID.reset(tok)
    httpx.post(base + "/sendMessage", json={"chat_id": msg0["chat"]["id"], "text": reply}, timeout=10)


def process(rep):
    """One report from a probe. Returns the commands it should run."""
    name = rep["name"]
    with LOCK:
        d = store.load()
        h = _state(d)
        pr = h["probes"].setdefault(name, {"first": time.time()})
        prev = dict(pr.get("services") or {})
        pr.update(services=rep.get("services") or {}, readings=rep.get("readings") or {}, seen=time.time(), where=rep.get("where", ""))
        store.save(d)
    notices, followups = [], []
    # the documents engine reads the data lake, which a live sync holds while it waits for the workspace lock: ask it BEFORE taking that lock, never inside it
    lim = _limit("max_temp_c")
    lctx = _limits_ctx()
    with LOCK:
        d = store.load()
        h = _state(d)
        # results of earlier commands
        for res in rep.get("results") or []:
            for c in h["commands"]:
                if c["id"] == res.get("id") and c["state"] == "sent":
                    c.update(state="done" if res.get("ok") else "failed", output=str(res.get("output", ""))[:200], finished=time.time())
                    _audit(h, f"Probe ran {c['kind']} {c.get('unit') or c.get('value')}: {'ok' if res.get('ok') else 'failed'} {str(res.get('output', ''))[:80]}")
        # services
        for unit, meta in UNITS.items():
            if unit not in (rep.get("services") or {}):
                continue
            up = bool(rep["services"][unit])
            open_inc = next((i for i in h["incidents"] if i["kind"] == "service_down" and i["target"] == unit and i["status"] in ("waiting", "applying")), None)
            if not up and not open_inc and (prev.get(unit, True) or True):
                if prev.get(unit) is False and any(i["target"] == unit and i["status"] in ("refused", "rejected") and time.time() - i["opened"] < 120 for i in h["incidents"]):
                    continue   # a person just said no: do not ask again at once
                aff = _affects(unit, meta)
                action = {"kind": "restart_service", "station": unit, "params": {}, "why": f"{meta['label']} stopped on {rep.get('where') or name}"}
                inc, sc = _open(h, "service_down", unit, f"{meta['label']} is down on {rep.get('where') or name}", f"It carries {meta['what']}. Data for {', '.join(aff)} is lost until it is back.", action,
                                {"evidence": 0.9, "state": "failed", "n_affected": len(aff), "limits": lctx, "consecutive_faults": 0})
                if sc["decision"] == "auto":
                    _queue(h, inc, "Warden", "auto")
                    notices.append((inc, "Warden fixed it by itself: the score is above the limit. I restart the service now.", False))
                elif sc["decision"] == "approve":
                    notices.append((inc, "A person must approve this fix.", True))
                else:
                    inc["status"] = "blocked" if sc["decision"] == "blocked" else "refused"
                    notices.append((inc, "I did not run it.", False))
            elif up and open_inc and open_inc["status"] in ("applying", "waiting"):
                open_inc.update(status="resolved", resolved=time.time())
                outcomes.on_resolved(d, open_inc)
                _audit(h, f"{meta['label']} is back. Incident closed")
                notices.append((open_inc, f"{meta['label']} is running again. Incident closed.", False))
                if unit == "cloud_sql":
                    followups.append(open_inc["id"])
        # the oven
        t = _num((rep.get("readings") or {}).get("oven_temp_c"))
        if t is not None and lim and _num(lim["value"]):
            L = _num(lim["value"])
            open_inc = next((i for i in h["incidents"] if i["kind"] == "temp_high" and i["status"] in ("waiting", "applying")), None)
            if t > L and not open_inc:
                action = {"kind": "adjust_temperature", "station": OVEN, "params": {"max_temp_c": OVEN_SAFE}, "why": f"The reflow oven reads {t:.0f} C"}
                inc, sc = _open(h, "temp_high", OVEN, f"Reflow oven {t:.0f} C is above the limit of {L:g} C", f"The limit comes from the documents ({lim['doc']}: \"{lim['quote']}\").", action,
                                {"evidence": 0.9, "state": "busy", "n_affected": 1, "limits": lctx, "consecutive_faults": 0})
                if sc["decision"] == "auto":
                    _queue(h, inc, "Warden", "auto")
                    notices.append((inc, "Warden fixed it by itself.", False))
                else:
                    notices.append((inc, "A person must approve this fix." if sc["decision"] == "approve" else "I did not run it.", sc["decision"] == "approve"))
            elif t <= L and open_inc and open_inc["status"] == "applying":
                open_inc.update(status="resolved", resolved=time.time())
                outcomes.on_resolved(d, open_inc)
                _audit(h, f"Oven is back at {t:.0f} C. Incident closed")
                notices.append((open_inc, f"The oven is back at {t:.0f} C. Incident closed.", False))
        out = []
        for c in h["commands"]:
            # a command goes only to the probe it is for: the Cloud SQL watcher takes the start of its own instance, every other probe takes the rest
            mine = (c.get("unit") == "cloud_sql") == (name == "cloud-sql")
            if c["state"] == "pending" and mine:
                c["state"] = "sent"
                out.append({k: c.get(k) for k in ("id", "kind", "unit", "value", "by", "via")})
        store.save(d)
    for inc, extra, buttons in notices:
        _tell(inc, extra, buttons)
    for iid in followups:
        _followup(iid)
    try:   # playbooks that start from a probe reading (the oven above a value, say)
        from foreman import playbook as _pb
        _pb.on_report(rep)
    except Exception:
        pass
    return out


def _affects(unit, meta):
    """The stations that lose data. For a Cloud SQL database the owner can name them; otherwise the built-in list."""
    if unit == "cloud_sql":
        mine = (store.load().get("cloud_sql") or {}).get("affects")
        if mine:
            return list(mine)
    return meta["affects"]


def _limits_ctx():
    try:
        from documents import engine as DE
        return DE.limits()
    except Exception:
        return []


def mark_starting(unit):
    """The service is being started again (by an approval here or somewhere else): a waiting incident for it becomes 'applying', so no one approves twice."""
    with LOCK:
        d = store.load()
        h = _state(d)
        hit = False
        for i in h["incidents"]:
            if i.get("kind") == "service_down" and i.get("target") == unit and i["status"] == "waiting":
                i.update(status="applying", by="someone outside this app", via="Google Cloud", decided=time.time())
                _audit(h, f"{i['title']}: it is starting again (started outside this app)")
                hit = True
        if hit:
            store.save(d)
    return hit


def decide(iid, ok, by, via):
    """A person says yes or no, in the app or on Telegram."""
    with LOCK:
        d = store.load()
        h = _state(d)
        inc = next((i for i in h["incidents"] if i["id"] == iid), None)
        if not inc or inc["status"] != "waiting":
            return None
        if ok:
            _queue(h, inc, by, via)
        else:
            inc.update(status="rejected", by=by, via=via, decided=time.time())
            _audit(h, f"{inc['title']}: rejected by {by} through {via}")
        store.save(d)
    return inc


# ------------------------------------------------------------------ Telegram buttons: the app asks Telegram for taps (no public address needed)
_POLL = {}


def _audit_note(text):
    with LOCK:
        d = store.load()
        _audit(_state(d), text)
        store.save(d)


def _watch(ch):
    key = ch["token"]
    if key in _POLL and _POLL[key].is_alive():
        return
    import contextvars
    ctx = contextvars.copy_context()
    t = threading.Thread(target=lambda: ctx.run(_poll, ch, store.UID.get()), daemon=True, name="telegram-taps")
    _POLL[key] = t
    t.start()


def _poll(ch, uid):
    import httpx
    base = f"https://api.telegram.org/bot{ch['token']}"
    offset = None
    idle_until = time.time() + 1800
    while time.time() < idle_until:
        try:
            r = httpx.get(base + "/getUpdates", params={"timeout": 20, "allowed_updates": '["callback_query", "message"]', **({"offset": offset} if offset else {})}, timeout=30).json()
            for u in r.get("result", []):
                offset = u["update_id"] + 1
                msg0 = u.get("message") or {}
                if str(msg0.get("text", "")).startswith("/link"):   # a team member ties their Telegram to their place on the team
                    parts = msg0["text"].split(None, 1)
                    tok = store.UID.set(uid)
                    try:
                        who_ = rbac.link_telegram(parts[1], (msg0.get("from") or {}).get("id")) if len(parts) > 1 else None
                    finally:
                        store.UID.reset(tok)
                    httpx.post(base + "/sendMessage", json={"chat_id": msg0["chat"]["id"], "text": (f"Linked. You are {who_['name']}, role {who_['role']}." if who_ else "That link code is not right.")}, timeout=10)
                    continue
                if str(msg0.get("text", "")).startswith("/issue"):
                    _issue_from_telegram(msg0, base, ch, uid)
                    continue
                cq = u.get("callback_query")
                if cq and str(cq.get("data", "")).startswith("fb:"):
                    _feedback_tap(cq, base, ch, uid)
                    continue
                if not cq or not str(cq.get("data", "")).startswith("hi:"):
                    continue
                chat = str((cq.get("message") or {}).get("chat", {}).get("id", ""))
                if chat != str(ch["chat_id"]):
                    httpx.post(base + "/answerCallbackQuery", json={"callback_query_id": cq["id"], "text": "This chat is not allowed to approve."}, timeout=10)
                    continue
                _, iid, act = cq["data"].split(":")
                tok = store.UID.set(uid)
                try:
                    person = rbac.member(telegram_id=(cq.get("from") or {}).get("id"))
                    if not person and not any(x.get("telegram_id") for x in rbac._state()["members"]):
                        # nobody is linked yet: the chat that paired with the bot belongs to the owner, so the first tap from it links the owner
                        person = rbac.link_owner((cq.get("from") or {}).get("id"), (cq.get("from") or {}).get("first_name"))
                    if not person or not rbac.allowed(person["id"], "approve_actions"):
                        who_ = (cq.get("from") or {}).get("first_name") or "someone"
                        _audit_note(f"{who_} tried to answer a request on Telegram and was refused" + (f" (role {person['role']})" if person else " (not on the team)"))
                        httpx.post(base + "/answerCallbackQuery", json={"callback_query_id": cq["id"], "text": "Your role may not approve fixes." if person else "You are not on the team. Ask the owner for a link code."}, timeout=10)
                        continue
                    who = rbac.label(person)
                    inc = decide(iid, act == "a", who, "Telegram")
                finally:
                    store.UID.reset(tok)
                msg = (cq.get("message") or {})
                verdict = "No open request for this." if not inc else (f"Approved by {who}." if act == "a" else f"Rejected by {who}.")
                httpx.post(base + "/answerCallbackQuery", json={"callback_query_id": cq["id"], "text": verdict}, timeout=10)
                if msg.get("message_id") and inc:
                    tok2 = store.UID.set(uid)
                    try:
                        cur = next((i for i in _state(store.load())["incidents"] if i["id"] == inc["id"]), inc)
                        httpx.post(base + "/editMessageText", json={"chat_id": ch["chat_id"], "message_id": msg["message_id"], "text": _tg(cur, "The probe carries out the fix on its next report." if act == "a" else ""), "parse_mode": "HTML"}, timeout=10)
                    finally:
                        store.UID.reset(tok2)
        except Exception:
            time.sleep(3)


# ------------------------------------------------------------------ routes
class Report(BaseModel):
    name: str
    where: str = ""
    services: dict = {}
    readings: dict = {}
    results: list = []


@router.post("/report")
def report(r: Report, x_host_token: str = Header(""), x_host_owner: str = Header("local")):
    if not hmac.compare_digest(x_host_token, token_for(x_host_owner)):
        raise HTTPException(401, "wrong probe token")
    tok = store.UID.set(x_host_owner)
    try:
        return JSONResponse({"commands": process(r.model_dump())})
    finally:
        store.UID.reset(tok)


@router.get("/setup")
def setup():
    """What the owner puts on the server: the token for this account's probe."""
    uid = store.UID.get()
    return JSONResponse({"owner": uid, "token": token_for(uid), "units": list(UNITS)})


@router.get("")
def overview():
    d = store.load()
    h = _state(d)
    now = time.time()
    probes = [dict(p, name=k, alive=now - p.get("seen", 0) < 20) for k, p in h["probes"].items()]
    return JSONResponse({"probes": probes, "incidents": list(reversed(h["incidents"][-20:])), "issues": list(reversed(h["issues"][-20:])), "audit": list(reversed(h["audit"][-30:])),
                         "verdicts": {r["incident"]: r.get("verdict") for r in d.get("outcomes", []) if r.get("verdict")}})


# ------------------------------------------------------------------ service levels: what the documents promise, and what the incidents show
SLO_DEFAULTS = {"cloud_sql": (15, 99.5), "mosquitto": (5, 99.9), "mongod": (15, 99.5), "oven": (10, None)}
SLO_NAMES = {"cloud_sql": "Cloud SQL database (ERP)", "mosquitto": "MQTT broker", "mongod": "MongoDB", "oven": "Reflow oven"}
_SLO_WORDS = [("cloud_sql", r"cloud sql|erp|postgres|\bdatabase\b"), ("mosquitto", r"mqtt|mosquitto|broker"), ("mongod", r"mongo"), ("oven", r"oven|reflow|ovn")]


def slo_targets():
    """The service levels the documents state. Where they state none, a default is used and marked as one."""
    out = {k: {"restore_min": v[0], "availability_pct": v[1], "from_docs": False, "quotes": []} for k, v in SLO_DEFAULTS.items()}
    try:
        import re
        from documents import engine as DE
        for c in DE.state().get("claims", []):
            p = str(c.get("predicate", ""))
            field = {"slo_restore_minutes": "restore_min", "slo_availability_pct": "availability_pct"}.get(p)
            key = next((k for k, rx in _SLO_WORDS if re.search(rx, str(c.get("subject", "")).lower())), None)
            v = _num(c.get("value"))
            if field and key and v is not None:
                out[key][field] = v
                out[key]["from_docs"] = True
                out[key]["quotes"].append({"doc": c.get("doc"), "quote": c.get("quote")})
    except Exception:
        pass
    return out


def slo_report(window_days=30):
    now = time.time()
    window = window_days * 86400.0
    with LOCK:
        d = store.load()
        h = _state(d)
        rows = list(d.get("outcomes", []))
        incs, issues = list(h["incidents"]), list(h["issues"])
    targets = slo_targets()
    key_of = lambda i: "oven" if i["kind"] == "temp_high" else i["target"]
    by_resolver = {k: 0 for k in outcomes.RESOLVERS}
    for r in rows:
        by_resolver[r["resolver"]] = by_resolver.get(r["resolver"], 0) + 1
    verdicts = {r["incident"]: r.get("verdict") for r in rows}
    per = []
    for key in list(dict.fromkeys(["cloud_sql", "mosquitto", "oven"] + [key_of(i) for i in incs])):
        mine = [i for i in incs if key_of(i) == key and now - i["opened"] <= window]
        down = sum(((i.get("resolved") or now) - i["opened"]) for i in mine if i["status"] in ("resolved", "waiting", "applying"))
        done = [r for r in rows if r["kind"] in ("service_down", "temp_high") and (("oven" if r["kind"] == "temp_high" else r["target"]) == key)]
        t = targets.get(key) or {"restore_min": None, "availability_pct": None, "from_docs": False, "quotes": []}
        last = done[-1]["restore_s"] if done else None
        avail = round(100 * (1 - down / window), 3)
        budget = (down / (window * (1 - t["availability_pct"] / 100.0)) * 100) if t.get("availability_pct") else None
        per.append({"unit": key, "label": SLO_NAMES.get(key, key), "incidents": len(mine), "last_restore_s": last,
                    "avg_restore_s": round(sum(r["restore_s"] for r in done) / len(done)) if done else None,
                    "target_restore_min": t["restore_min"], "target_availability_pct": t["availability_pct"], "from_docs": t["from_docs"], "quotes": t["quotes"][:2],
                    "within_target": (last <= t["restore_min"] * 60) if (last is not None and t["restore_min"]) else None,
                    "availability_pct": avail, "budget_used_pct": round(budget, 1) if budget is not None else None})
    recent = [{"kind": "auto", "id": i["id"], "title": i["title"], "status": i["status"], "opened": i["opened"], "resolved": i.get("resolved"), "restore_s": round(i["resolved"] - i["opened"]) if i.get("resolved") else None,
               "resolver": outcomes.resolver_of(i) if i["status"] == "resolved" else None, "by": i.get("by"), "via": i.get("via"), "verdict": verdicts.get(i["id"]), "followup": bool(i.get("followup"))} for i in incs]
    recent += [{"kind": "manual", "id": i["id"], "title": i["title"], "target": i["target"], "details": i["details"], "status": i["status"], "opened": i["opened"], "resolved": i.get("resolved"),
                "restore_s": round(i["resolved"] - i["opened"]) if i.get("resolved") else None, "resolver": i.get("resolver"), "by": i.get("by"), "note": i.get("note"), "verdict": None} for i in issues]
    recent.sort(key=lambda x: -x["opened"])
    reported = len(incs) + len(issues)
    resolved = sum(1 for i in incs if i["status"] == "resolved") + sum(1 for i in issues if i["status"] == "resolved")
    openn = sum(1 for i in incs if i["status"] in ("waiting", "applying")) + sum(1 for i in issues if i["status"] == "open")
    mttr = round(sum(r["restore_s"] for r in rows) / len(rows)) if rows else None
    return {"window_days": window_days, "totals": {"reported": reported, "resolved": resolved, "open": openn, "not_applied": reported - resolved - openn},
            "by_resolver": by_resolver, "resolver_names": outcomes.RESOLVERS, "mttr_s": mttr, "per_service": per, "recent": recent[:15], "learning": outcomes.learning(),
            "confirmed": sum(1 for r in rows if r.get("verdict"))}


class IssueBody(BaseModel):
    title: str
    target: str = ""
    details: str = ""


class ResolveBody(BaseModel):
    note: str


@router.get("/slo")
def slo():
    return JSONResponse(slo_report())


@router.post("/incidents/{iid}/feedback")
def incident_feedback(iid: str, verdict: str, m=Depends(rbac.need("run_checks"))):
    row = outcomes.feedback(iid, verdict, rbac.label(m), "the app")
    if not row:
        raise HTTPException(404, "There is no finished incident with that id, or the answer is not one of yes, partly, no.")
    return JSONResponse(row)


@router.post("/issues")
def new_issue(b: IssueBody, m=Depends(rbac.need("run_checks"))):
    if len(b.title.strip()) < 4:
        raise HTTPException(400, "Write a short title for the issue.")
    return JSONResponse(report_issue(b.title, b.target, b.details, rbac.label(m)))


@router.post("/issues/{iid}/resolve")
def close_issue(iid: str, b: ResolveBody, m=Depends(rbac.need("run_checks"))):
    try:
        iss = resolve_issue(iid, b.note, rbac.label(m))
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not iss:
        raise HTTPException(404, "There is no open issue with that id.")
    return JSONResponse(iss)


@router.post("/incidents/{iid}/approve")
def approve(iid: str, m=Depends(rbac.need("approve_actions"))):
    inc = decide(iid, True, rbac.label(m), "the app")
    if not inc:
        raise HTTPException(404, "no open request with that id")
    return JSONResponse(inc)


@router.post("/incidents/{iid}/reject")
def reject(iid: str, m=Depends(rbac.need("approve_actions"))):
    inc = decide(iid, False, rbac.label(m), "the app")
    if not inc:
        raise HTTPException(404, "no open request with that id")
    return JSONResponse(inc)


class TgBody(BaseModel):
    token: str


@router.post("/telegram/find")
def telegram_find(b: TgBody):
    """Look up the bot and the chats that wrote to it, so the owner does not have to hunt for a chat id. The token is used once here and not kept."""
    import httpx
    t = b.token.strip()
    if ":" not in t or len(t) < 20:
        raise HTTPException(400, "That does not look like a bot token. Copy it again from BotFather.")
    base = f"https://api.telegram.org/bot{t}"
    try:
        me = httpx.get(base + "/getMe", timeout=10).json()
        if not me.get("ok"):
            raise HTTPException(400, "Telegram did not accept this token.")
        ups = httpx.get(base + "/getUpdates", params={"timeout": 0}, timeout=10).json().get("result", [])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, "I could not reach Telegram just now.")
    chats = {}
    for u in ups:
        m = u.get("message") or (u.get("callback_query") or {}).get("message") or {}
        c = m.get("chat")
        if c:
            chats[str(c["id"])] = c.get("title") or c.get("first_name") or c.get("username") or str(c["id"])
    return JSONResponse({"bot": (me.get("result") or {}).get("username", ""), "chats": [{"id": k, "name": v} for k, v in chats.items()]})


# ------------------------------------------------------------------ pairing: the owner sends the bot /start and /pair <code>
PAIR = {}   # code -> {"token", "uid", "bot", "done", "chat", "name", "until"}


def _pair_loop(code):
    import httpx
    p = PAIR[code]
    base = f"https://api.telegram.org/bot{p['token']}"
    send = lambda chat, text: httpx.post(base + "/sendMessage", json={"chat_id": chat, "text": text}, timeout=10)
    offset = None
    while time.time() < p["until"] and not p["done"]:
        try:
            r = httpx.get(base + "/getUpdates", params={"timeout": 15, "allowed_updates": '["message"]', **({"offset": offset} if offset else {})}, timeout=25).json()
            for u in r.get("result", []):
                offset = u["update_id"] + 1
                m = u.get("message") or {}
                chat, text = (m.get("chat") or {}), (m.get("text") or "").strip()
                if not chat or not text:
                    continue
                if text.startswith("/start"):
                    send(chat["id"], "Hello. I am the Tolerance bot. To connect me to your plant, send:  /pair " + "<the code shown in Tolerance>")
                elif text.startswith("/pair"):
                    given = text.split(None, 1)[1].strip() if len(text.split(None, 1)) > 1 else ""
                    if given.upper() != code:
                        send(chat["id"], "That code is not right. Copy it again from the Tolerance screen.")
                        continue
                    tok = store.UID.set(p["uid"])
                    try:
                        name = chat.get("title") or chat.get("first_name") or "Telegram"
                        notify.add("telegram", f"Telegram @{p['bot']}", "", p["token"], str(chat["id"]))
                    finally:
                        store.UID.reset(tok)
                    tok = store.UID.set(p["uid"])
                    try:
                        with LOCK:
                            d_ = store.load()
                            own = next(x for x in rbac._state(d_)["members"] if x.get("owner"))
                            own["telegram_id"] = str((m.get("from") or {}).get("id") or "")
                            store.save(d_)
                    finally:
                        store.UID.reset(tok)
                    p.update(done=True, chat=str(chat["id"]), name=name)
                    send(chat["id"], "Paired. I will send approvals and warnings here, with Approve and Reject buttons.")
                    # leave the last update acknowledged, so the approval listener starts clean
                    httpx.get(base + "/getUpdates", params={"offset": offset, "timeout": 0}, timeout=10)
                    return
        except Exception:
            time.sleep(2)


class PairBody(BaseModel):
    token: str


@router.post("/telegram/pair/start")
def pair_start(b: PairBody):
    """Check the bot token and make a one-time code. The owner sends /start and /pair <code> to the bot; the chat that does is the one that gets approvals."""
    import httpx
    t = b.token.strip()
    if ":" not in t or len(t) < 20:
        raise HTTPException(400, "That does not look like a bot token. Copy it again from BotFather.")
    try:
        me = httpx.get(f"https://api.telegram.org/bot{t}/getMe", timeout=10).json()
    except Exception:
        raise HTTPException(400, "I could not reach Telegram just now.")
    if not me.get("ok"):
        raise HTTPException(400, "Telegram did not accept this token.")
    code = secrets.token_hex(3).upper()   # six characters
    PAIR[code] = {"token": t, "uid": store.UID.get(), "bot": (me.get("result") or {}).get("username", ""), "done": False, "chat": "", "name": "", "until": time.time() + 1800}
    import contextvars
    ctx = contextvars.copy_context()
    threading.Thread(target=lambda: ctx.run(_pair_loop, code), daemon=True, name="telegram-pair").start()
    return JSONResponse({"bot": PAIR[code]["bot"], "code": code})


@router.get("/telegram/pair/{code}")
def pair_status(code: str):
    p = PAIR.get(code.upper())
    if not p or p["uid"] != store.UID.get():
        raise HTTPException(404, "unknown code")
    return JSONResponse({"paired": p["done"], "name": p["name"], "expired": time.time() > p["until"] and not p["done"]})
