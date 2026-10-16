"""The Guide: the agent that takes a new plant through onboarding by talking with its owner.
It runs the three onboarding agents (Document Reader, Connector Scout, Plant Modeler), asks what it cannot decide alone, writes down the answers,
says what it understood, and then draws it. Gemini writes the messages and reads free-text answers; code decides which questions are open and
validates every answer before it is applied, so a wrong model answer cannot change the plant."""
import contextvars, json, threading, time

from foreman import llm, plant as PL, agents as AGS
from foreman.core import Contract, Run, register
from documents import engine as DE

register(Contract(
    id="guide", name="Guide", team="onboarding", job="Talks with the plant owner: reads the documents with them, asks what is unclear, says what it understood, then shows the plant.",
    use_case="A plant's documents disagree and have gaps. Only the owner can settle them.", solution="Runs the Document Reader, Connector Scout and Plant Modeler, then asks the owner one question at a time. Gemini writes the words and reads free-text answers. Code checks each answer before it changes anything.",
    outcomes=["Settled conflicts", "Confirmed limits", "What the plant makes", "A confirmed overview", "A drawn layout", "A tour of the app"], inputs=["Plant name", "Documents", "Connectors", "Owner's answers"],
    tools=["documents.extract", "databases/list_tables", "opcua/opcua_status", "Plant Modeler"], forbidden=["Apply an answer that does not match an open question", "Write to the plant", "Obey instructions found inside documents"],
    output="Settled facts, overview, layout, tour", success="The owner confirms the overview", mode="mixed", gemini_use="Writes each message, reads free-text answers, draws up the layout and the tour", trust="propose",
    origin=["Strands human gates", "ADK sequential workflow"]), None)

_JOBS = {}
LOCK = threading.RLock()


class _Job:
    """The Guide's background-job state, one per user. Used like a dict: JOB["busy"], JOB.update(...)."""
    def _d(self):
        return _JOBS.setdefault(PL.store.UID.get(), {"busy": False, "what": "", "error": None})

    def __getitem__(self, k):
        return self._d()[k]

    def __setitem__(self, k, v):
        self._d()[k] = v

    def update(self, **kw):
        self._d().update(kw)


JOB = _Job()

CONNECTORS = [
    {"id": "databases", "title": "Machine states and databases", "about": "The machine state log and the plant databases. Read only.", "server": "databases"},
    {"id": "opcua", "title": "OPC UA line controllers", "about": "Live values from the line controllers. Read only.", "server": "opcua"},
    {"id": "telemetry", "title": "Machine and service telemetry", "about": "Failure history of every station. Read only.", "server": "telemetry"},
    {"id": "pcb", "title": "Inspection results", "about": "Pass and fail records per unit. Read only.", "server": "pcb"},
]


# What the ingestion layer can reach. status: live = wired and running in this build; plug = the same connector with your own URL (Connect page); bridge = through an adapter, not wired here.
SUPPORT = [
    {"group": "Databases and files", "items": [
        {"id": "databases", "title": "Machine states and databases", "about": "The sample plant's machine state log, in SQL. Read only.", "status": "live"},
        {"id": "sql", "title": "PostgreSQL, MySQL, SQL Server, Oracle", "about": "Any SQLAlchemy URL. Snapshot first, then only new rows. Sentinel can check that it answers.", "status": "plug"},
        {"id": "files", "title": "S3, GCS, Azure files", "about": "CSV, JSONL and Parquet files, new files by modified time.", "status": "plug"},
        {"id": "warehouse", "title": "BigQuery, Snowflake, Databricks", "about": "History that already sits in a warehouse.", "status": "bridge"},
        {"id": "mongo", "title": "MongoDB", "about": "Collections as tables. Sentinel can check that it answers.", "status": "bridge"},
    ]},
    {"group": "Machines and controllers", "items": [
        {"id": "opcua", "title": "OPC UA line controllers", "about": "Live values from the line controllers. Read only.", "status": "live"},
        {"id": "mqtt", "title": "MQTT and Sparkplug B", "about": "Machine telemetry from an IoT broker. Sentinel can check that it answers.", "status": "bridge"},
        {"id": "plc", "title": "Modbus, Siemens S7, Rockwell", "about": "Direct PLC registers, through a protocol adapter.", "status": "bridge"},
        {"id": "kafka", "title": "Kafka and Redpanda", "about": "Event streams from the plant network.", "status": "bridge"},
    ]},
    {"group": "Plant systems", "items": [
        {"id": "telemetry", "title": "Machine and service telemetry", "about": "Failure history of every station. Read only.", "status": "live"},
        {"id": "pcb", "title": "Inspection results", "about": "Pass and fail records per unit. Read only.", "status": "live"},
        {"id": "rest", "title": "ERP and MES over REST", "about": "Orders and genealogy from SAP, Opcenter or any OpenAPI service.", "status": "plug"},
        {"id": "historian", "title": "Historians (AVEVA PI, Ignition)", "about": "Time series kept by the plant historian.", "status": "bridge"},
        {"id": "cmms", "title": "Maintenance systems (Maximo, others)", "about": "Work orders and spare parts.", "status": "bridge"},
    ]},
]
LIVE_IDS = {c["id"] for c in CONNECTORS}


def _systems():
    """The data systems the documents name, each with the sentence that names it. The owner is asked for these, not for a generic list."""
    from documents import systems as DS
    try:
        return DS.find(DE.list_docs())
    except Exception:
        return []


def understood(st):
    """What the document readers understood, in numbers and in the plant's own words, for the owner to check."""
    claims = st["claims"]
    seen, picks = set(), []
    for c in claims:
        k = c["predicate"]
        if k in seen or not c.get("quote"):
            continue
        seen.add(k)
        picks.append({"subject": c.get("subject_resolved") or c["subject"], "predicate": c["predicate"], "value": c["value"], "quote": c["quote"], "doc": c["doc"]})
        if len(picks) == 6:
            break
    stations = sorted({c["subject_resolved"] for c in claims if c.get("known") and c["subject_resolved"] != "ORDER"})
    named = sorted({c["subject_resolved"] for c in claims if c["subject_resolved"] != "ORDER" and c["predicate"] in ("installed", "feeds", "max_temp_c", "max_speed_pct", "max_speed_ms", "belt_speed_ms", "payload_max_kg", "maintenance_window", "max_consecutive_faults", "inspection_interval_h")})
    from connectors import registry as CR
    have_data = CR.own_lake() or bool(PL.get().get("use_sample"))   # without machine data, "known" and "only in the text" mean nothing yet
    return {"documents": [{"name": d["name"], "kind": d["kind"], "claims": d["claims"]} for d in st["docs"]][:10], "facts": len(claims), "stations": stations, "named": named, "have_data": have_data,
            "limits": len(st.get("guardrails", [])), "conflicts": len(st["conflicts"]), "ghosts": [g["name"] for g in st["ghosts"]], "gaps": len(st["gaps"]),
            "injections": len(st["injections"]), "samples": picks, "systems": _systems()}


def _say(text, card=None):
    PL.update(lambda p: p["chat"].append({"role": "guide", "text": text, "card": card, "at": time.time()}))


def _user(text):
    PL.update(lambda p: p["chat"].append({"role": "user", "text": text, "at": time.time()}))


def _job(what, fn):
    """Slow work runs in a thread; the screen polls state()."""
    with LOCK:
        if JOB["busy"]:
            return False
        JOB.update(busy=True, what=what, error=None)

    def go():
        try:
            fn()
        except Exception as e:
            JOB["error"] = f"{type(e).__name__}: {str(e)[:160]}"
            _say("Something went wrong on my side: " + JOB["error"] + " You can press the button again.")
        finally:
            JOB["busy"] = False
    ctx = contextvars.copy_context()   # the thread must act for the same user
    threading.Thread(target=lambda: ctx.run(go), daemon=True, name="guide-job").start()
    return True


def _ask(system, payload, default):
    """One Gemini JSON answer, with a plain fallback so the flow never stops."""
    try:
        out, src = llm.ask_json("guide", system, json.dumps(payload, default=str), tries=2, timeout=18)
        return out, src
    except Exception:
        return default, "rule"


VOICE = "You are Guide, the onboarding agent of Tolerance, an AI platform for factories. Speak to the plant owner in short plain sentences. No jargon. Never invent facts: use only the facts given."


# --------------------------------------------------------------- the questions
def questions():
    """Open questions, in order. Built from the documents' state, so the model cannot invent one."""
    p = PL.get()
    st = DE.state()
    out = []
    if not p.get("goal") and not p.get("goal_skipped"):
        out.append({"id": "goal", "kind": "text", "text": "What does this plant make?", "hint": "Or write it in your own words. You can skip this.",
                    "options": [{"id": o, "label": o} for o in (p.get("goal_options") or [])]})
    for c in st["conflicts"]:
        if not c.get("resolved"):
            what = f"{c['subject']} {c['predicate'].replace('_', ' ')}"
            out.append({"id": c["key"], "kind": "choice", "text": f"Your documents disagree about {what}. Which is right?",
                        "options": [{"id": o["claim_id"], "label": f"{o['value']}", "sub": f"{o['doc']}: “{o['quote']}”"} for o in c["options"]]})
    ghosts = [g for g in st["ghosts"] if g["status"] == "proposed"]
    if len(ghosts) > 1 and not p.get("ghosts_single"):   # one question for all of them, not one per station
        names = ", ".join(g["name"] for g in ghosts)
        out.append({"id": "ghosts", "kind": "choice", "text": f"{len(ghosts)} stations are in your documents but I see no data from them: {names}. Are they real stations?",
                    "options": [{"id": "add_all", "label": "Yes, all are real", "sub": "I add them to the plant as stations without data."},
                                {"id": "ignore_all", "label": "No, ignore them all", "sub": ""},
                                {"id": "one_by_one", "label": "Let me decide one by one", "sub": ""}]})
    else:
        for g in ghosts:
            q = g["claims"][0]["quote"] if g["claims"] else ""
            out.append({"id": f"ghost:{g['name']}", "kind": "choice", "text": f"{g['name']} is in your documents but I see no data from it. Is it a real station?",
                        "options": [{"id": "added", "label": "Yes, it is real", "sub": f"“{q}”" if q else ""}, {"id": "ignored", "label": "No, ignore it", "sub": ""}]})
    open_limits = [g for g in st["guardrails"] if g["status"] == "proposed"]
    if open_limits:
        out.append({"id": "limits", "kind": "choice", "text": f"I found {len(open_limits)} hard limit(s) in your documents. Warden will never let an action cross them. Do you approve them?",
                    "options": [{"id": "approve_all", "label": "Approve all", "sub": "; ".join(f"{g['subject']} {g['predicate'].replace('_', ' ')} = {g['value']}" for g in open_limits[:6])}, {"id": "later", "label": "Not now", "sub": "I will keep them as proposals."}]})
    return out


def _apply(qid, value):
    """Apply one answer to the plant. Returns a short description, or None if the answer does not match an open question."""
    qs = {q["id"]: q for q in questions()}
    q = qs.get(qid)
    if not q:
        return None
    if q["kind"] == "text":
        v = str(value).strip()
        if not v:
            return None
        PL.update(lambda p: p.update(goal=v))
        return "goal"
    ids = {o["id"] for o in q["options"]}
    if value not in ids:
        return None
    if qid == "ghosts":
        if value == "one_by_one":
            PL.update(lambda p: p.update(ghosts_single=True))
        else:
            for g in DE.state()["ghosts"]:
                if g["status"] == "proposed":
                    DE.resolve_action(f"ghost:{g['name']}", "added" if value == "add_all" else "ignored")
        return "ghosts"
    if qid == "limits":
        if value == "approve_all":
            for g in DE.state()["guardrails"]:
                if g["status"] == "proposed":
                    DE.resolve_action(g["id"], "approved")
        else:
            PL.update(lambda p: p["notes"].append("The owner postponed approving the hard limits."))
        return "limits"
    DE.resolve_action(qid, value)
    return qid


# --------------------------------------------------------------- the flow
def start():
    """After the documents are in: read them, say what was found, ask for connectors."""
    p = PL.get()
    if p["stage"] != "guide":
        PL.set_stage("guide")
    if p["chat"]:
        return state()

    def work():
        JOB["what"] = "Connecting the machine data"
        ensure_data()   # the saved document readings are keyed by the station names, so the stations must be known first
        JOB["what"] = "Reading your documents"
        st = DE.run_all()
        facts = {"plant": p["name"], "documents": [{"name": d["name"], "claims": d["claims"]} for d in st["docs"]], "claims": len(st["claims"]), "conflicts": len(st["conflicts"]),
                 "ghost_stations": [g["name"] for g in st["ghosts"]], "gaps": len(st["gaps"]), "hidden_instructions_removed": len(st["injections"])}
        default = {"message": f"I read {len(st['docs'])} documents for {p['name']} and found {len(st['claims'])} facts, each with the exact words it came from." + (f" {len(st['injections'])} instruction aimed at me was removed, not obeyed." if st["injections"] else "")}
        out, _ = _ask(VOICE + " Say what you found in the documents in three short sentences. Mention any conflict, missing station or removed hidden instruction. Then say you will ask the owner a few questions after looking at the data sources. Reply as JSON: {\"message\": \"...\"}.", facts, default)
        PL.update(lambda x: x.update(phase="connect"))
        _say(str(out.get("message") or default["message"]), None)
        _say("Here is what I understood. Please check it. Then tell me where your data lives. I only read. I never write.", {"type": "ingest", "understood": understood(st), "support": SUPPORT})
    _job("Reading your documents", work)
    return state()


def connect(ids, also=None, db_url="", mcp_url="", named=None):
    all_items = {i["id"]: i for g in SUPPORT for i in g["items"]}
    also = [i for i in (also or []) if i in all_items and i not in LIVE_IDS]
    ids = [i for i in ids if i in LIVE_IDS]
    from connectors import registry as CR
    own = CR.own_lake()   # the owner uploaded a machine log of their own
    if not ids and not own:
        raise ValueError("choose at least one connector that is live in this build, or upload your own machine log")
    import re
    db_url, mcp_url = (re.sub(r"//[^/@\s]*@", "//", str(x or "").strip())[:300] for x in (db_url, mcp_url))   # a password must never be stored, so any user:password part is cut
    PL.update(lambda p: p.update(connectors=ids, wishes={"also": also, "db_url": db_url, "mcp_url": mcp_url}))
    said = "Connect: " + (", ".join(c["title"] for c in CONNECTORS if c["id"] in ids) or "my own machine log")
    if also:
        said += ". Also in use: " + ", ".join(all_items[i]["title"] for i in also)
    if mcp_url:
        said += ". My MCP server is at " + mcp_url
    named = [x for x in (named or []) if isinstance(x, dict) and x.get("name")][:40]
    if named:
        by = {k: [x["name"] + (" (" + x["note"] + ")" if x.get("note") and x["note"] != "written down for setup" else "") for x in named if x.get("state") == k] for k in ("connected", "written", "skipped", "open")}
        said += ". Your documents named " + str(len(named)) + " systems. " + " ".join(f"{lab}: {', '.join(v)}." for lab, k in (("Connected", "connected"), ("Written down for setup", "written"), ("Skipped", "skipped"), ("Not dealt with yet", "open")) for v in [by[k]] if v)
        PL.update(lambda p: p.update(systems=named))
    _user(said)

    def work():
        JOB["what"] = "Connecting the machine data"
        mine = None
        if own:
            JOB["what"] = "Matching your documents to your stations"
            DE._ST.update(t=0)
            mine = DE.run_all()   # read again: the station names are now the plant's own
        else:
            ensure_data()
        JOB["what"] = "Looking at the data sources"
        r = AGS.run_scout()
        res = r.get("result") or {}
        tables = res.get("tables") or []
        default = {"message": "I looked through the connected data. " + "; ".join(f"{t['name']} holds {t['role']}" for t in tables[:5]) + "."}
        out, _ = _ask(VOICE + " The Connector Scout looked at the data sources. Say in two or three short sentences what the plant's data holds, and name at most two kinds of data that would help the owner most (for example maintenance records or quality results). Do not list more. Reply as JSON: {\"message\": \"...\"}.",
                      {"connected": ids, "tables": tables, "missing": res.get("missing")}, default)
        extra = ""
        if also or db_url or mcp_url:
            extra = " I wrote down the rest you named (" + ", ".join(filter(None, [*(all_items[i]["title"] for i in also), "your database address" if db_url else "", "your MCP server" if mcp_url else ""])) + "). This build reads only the sample sources. After setup, the Connect page takes your own database address, and your MCP server joins the same gateway, behind the same Warden gate."
        tail = " The machine data is a real manufacturing lab's state log, replayed as if it were live."
        if mine is not None:
            known = DE._stations()
            tail = f" Your machine log has {len(known)} stations: {', '.join(known)}. Matched against your documents, {len(mine['conflicts'])} {'fact disagrees' if len(mine['conflicts']) == 1 else 'facts disagree'}, {len(mine['ghosts'])} {'station appears' if len(mine['ghosts']) == 1 else 'stations appear'} only in the text" + (" (" + ", ".join(g["name"] for g in mine["ghosts"]) + ")" if mine["ghosts"] else "") + f", {len(mine['gaps'])} expected {'limit is' if len(mine['gaps']) == 1 else 'limits are'} missing and {len(mine['injections'])} hidden {'order was' if len(mine['injections']) == 1 else 'orders were'} removed."
        _say(str(out.get("message") or default["message"]) + tail + extra)
        PL.update(lambda p: p.update(phase="qa"))
        _next()
    _job("Looking at the data sources", work)
    return state()


def ensure_data():
    """The plant's machine data comes from the sample sources (a real lab's machine log, replayed as if live). Attach them if the lake is empty."""
    try:
        from workspace import twin as _T
        if _T.has_state():   # other sources (a database with orders, say) do not count: the stations come from the machine states
            return True
    except Exception:
        pass
    from server import ws_api
    for which in ("machine", "quality"):
        try:
            ws_api.add_sample(which)
        except Exception:
            pass
    try:
        from physical import service as PH
        DE._ST["t"] = 0   # forget the cached station list
        return len(PH.lake_df()) > 0
    except Exception:
        return False


def _goal_options():
    """Up to four short guesses of what the plant makes, taken only from the documents. An empty list when they do not say."""
    st = DE.state()
    facts = [{"doc": d["name"], "claims": [f"{c['subject']} {str(c['predicate']).replace('_', ' ')} {c['value']}" for c in d["claims"][:25]]} for d in st["docs"]][:12]
    out, _ = _ask(VOICE + " Say what products this plant might make, using only the documents. Give at most 4 short answers of 2 to 5 words each (for example: EV battery packs). If the documents do not show what is made, return an empty list. Reply as JSON: {\"options\": [\"...\"]}.",
                  {"documents": facts}, {"options": []})
    got = out.get("options") if isinstance(out, dict) else None
    return [str(x).strip()[:60] for x in (got or []) if isinstance(x, str) and len(x.strip()) >= 3][:4]


def _next():
    """Ask the next open question, or move on to the summary."""
    qs = questions()
    if qs and qs[0]["id"] == "goal" and "goal_options" not in PL.get():
        opts = _goal_options()
        PL.update(lambda p: p.update(goal_options=opts))
        qs = questions()
    if qs:
        q = qs[0]
        _say(q["text"], {"type": "question", "q": q, "left": len(qs)})
        return
    _summarise()


def _summarise():
    JOB["what"] = "Writing down what I understood"
    PL.update(lambda p: p.update(phase="confirm"))
    r = AGS.run_modeler()
    res = r.get("result") or {}
    st = DE.state()
    facts = {"overview": res.get("overview"), "what_it_makes": PL.get().get("goal"), "limits": len(res.get("limits") or []), "stations": [s["name"] for s in res.get("stations") or []]}
    default = {"message": (res.get("overview") or "I have what I need.") + " Is this right?"}
    out, _ = _ask(VOICE + " Tell the owner what you understood about their plant in four short sentences, using the overview and what the plant makes. End with the question: is this right? Reply as JSON: {\"message\": \"...\"}.", facts, default)
    _say(str(out.get("message") or default["message"]), {"type": "confirm"})


SAY_SYS = (VOICE + " The owner wrote a message. The open questions are given with ids and allowed option ids. Decide what the message answers. "
           "Reply as JSON: {\"reply\": \"one or two short sentences\", \"answers\": [{\"qid\": \"...\", \"value\": \"an allowed option id, or the owner's words for a text question\"}], \"note\": \"a fact the owner told you that is not an answer, or empty\"}. "
           "Only answer a question if the message clearly answers it. If the owner asks you something, answer from the facts and leave answers empty.")


def say(text=None, action=None):
    """One turn from the owner: a button (action) or free text."""
    p = PL.get()
    if JOB["busy"]:
        raise ValueError("I am still working. One moment.")
    if action:
        t = action.get("type")
        if t == "connect":
            return connect(action.get("ids") or [], action.get("also"), action.get("db_url", ""), action.get("mcp_url", ""), action.get("named"))
        if t == "answer":
            label = str(action.get("label") or action.get("value"))
            if _apply(action.get("qid"), action.get("value")) is None:
                raise ValueError("that answer does not match an open question")
            _user(label)
            _job("Thinking", _next)
            return state()
        if t == "skip_goal":
            PL.update(lambda x: x.update(goal_skipped=True))
            _user("Skip")
            _job("Thinking", _next)
            return state()
        if t == "confirm":
            if action.get("ok"):
                _user("Yes, this is right.")
                _job("Drawing your plant", _layout)
            else:
                _user("Not quite.")
                PL.update(lambda x: x.update(phase="fix"))
                _say("What is wrong or missing? Tell me in your own words.")
            return state()
    text = str(text or "").strip()
    if not text:
        raise ValueError("write something first")
    _user(text)

    def work():
        JOB["what"] = "Thinking"
        qs = questions()
        phase = PL.get().get("phase")
        out, src = _ask(SAY_SYS, {"plant": p["name"], "phase": phase, "open_questions": [{"id": q["id"], "text": q["text"], "options": [o["id"] for o in q.get("options", [])]} for q in qs[:4]], "message": text},
                        {"reply": "Thank you. I wrote that down.", "answers": [], "note": text if phase in ("fix", "confirm") else ""})
        done = 0
        if src == "rule" and qs:   # Gemini is unavailable: read the message by simple rules
            top = qs[0]
            if top["kind"] == "text":
                done += 1 if _apply(top["id"], text) else 0
            else:
                low = text.lower()
                hit = [o for o in top["options"] if str(o["label"]).lower() in low or (o["id"] != "later" and str(o["id"]).lower() in low)]
                if len(hit) == 1:
                    done += 1 if _apply(top["id"], hit[0]["id"]) else 0
        for a in (out.get("answers") or [])[:4]:
            if _apply(a.get("qid"), a.get("value")) is not None:
                done += 1
        note = str(out.get("note") or "").strip()
        if note or (src == "rule" and not done):
            PL.update(lambda x: x["notes"].append(note or text))
        if out.get("reply"):
            _say(str(out["reply"]))
        if phase in ("fix",) or (phase == "confirm" and (note or not done)):
            _summarise()
        elif phase == "qa":
            _next()
    _job("Thinking", work)
    return state()


# --------------------------------------------------------------- layout and tour
LAYOUT_SYS = ("You prepare a drawing of a factory for its owner. For each station choose a kind: conveyor, robot, warehouse, agv, station. Add a caption of at most six words and, for the stations that matter most to what this plant makes, "
              "a callout of at most twelve words. Use only the station names given. Reply as JSON: {\"stations\": [{\"name\": \"...\", \"kind\": \"...\", \"caption\": \"...\"}], \"callouts\": [{\"station\": \"...\", \"text\": \"...\"}]}.")
KINDS = {"conveyor", "robot", "warehouse", "agv", "station"}


def _layout():
    JOB["what"] = "Drawing your plant"
    plan = (__import__("workspace.store", fromlist=["x"]).load().get("jig_plan")) or AGS.run_modeler()["result"]
    names = [s["name"] for s in plan["stations"]]
    ghosts = [g for g in plan.get("ghosts", [])]
    default = {"stations": [{"name": n, "kind": "station", "caption": ""} for n in names], "callouts": []}
    out, src = _ask(LAYOUT_SYS, {"plant": PL.get()["name"], "what_it_makes": PL.get().get("goal"), "stations": [{"name": s["name"], "state": s["state"], "failures": s["failures"]} for s in plan["stations"]], "flows": [[e["from"], e["to"]] for e in plan["flows"]], "ghosts": ghosts}, default)
    seen, stations = set(), []
    for s in out.get("stations", []):
        if s.get("name") in names and s["name"] not in seen:
            seen.add(s["name"])
            stations.append({"name": s["name"], "kind": s.get("kind") if s.get("kind") in KINDS else "station", "caption": str(s.get("caption") or "")[:40]})
    stations += [{"name": n, "kind": "station", "caption": ""} for n in names if n not in seen]
    callouts = [{"station": c["station"], "text": str(c.get("text", ""))[:90]} for c in out.get("callouts", []) if c.get("station") in names][:5]
    layout = {"title": PL.get()["name"], "stations": stations, "ghosts": ghosts, "flows": [{"from": e["from"], "to": e["to"], "quote": e.get("quote", "")} for e in plan["flows"]],
              "callouts": callouts, "limits": len(plan.get("limits") or []), "by": src}
    PL.update(lambda p: p.update(layout=layout, stage="layout", phase="layout"))
    _say("Here is your plant, as I understand it. Look it over. If something is wrong, tell me.", {"type": "layout"})


SECTIONS = [("/floor", "Floor", "The factory in 2D and 3D. A failed machine lights up here. You can edit the floor."), ("/operations", "Operations", "Pick a failed station. The agents find the cause, check it, and plan a fix."),
            ("/safety", "Warden", "You set how far the agents may act alone. See what your lines would have done on past incidents."), ("/agents", "Agents", "The nine agents, what each may touch and what it must never do."),
            ("/probes", "Probes", "Small programs near the machines. They show whether a fault is the machine or the network path."), ("/compile", "Compiled model", "Everything I learned about this plant and where each fact came from."),
            ("/sentinel", "Sentinel", "Plain rules check your systems and what the documents say. A rule that starts failing tells you."), ("/playbooks", "Playbooks", "You draw what should happen when a station fails. Warden still scores every action.")]


def tour():
    """Short notes for each section, in the owner's terms. Gemini writes them; the list of sections is fixed."""
    goal = PL.get().get("goal")
    default = [{"path": p, "title": t, "text": d} for p, t, d in SECTIONS]
    out, src = _ask(VOICE + " Write one sentence for each app section telling the owner what it is for and what to try first, tied to what the plant makes when it fits. Reply as JSON: {\"steps\": [{\"path\": \"...\", \"text\": \"...\"}]} using exactly the paths given, in order.",
                    {"what_it_makes": goal, "sections": [{"path": p, "title": t, "about": d} for p, t, d in SECTIONS]}, {"steps": []})
    by = {s.get("path"): str(s.get("text") or "") for s in out.get("steps", [])}
    steps = [{"path": p, "title": t, "text": (by.get(p) or d)[:220]} for p, t, d in SECTIONS]
    PL.update(lambda x: x.update(tour=steps))
    return steps


def confirm_layout(ok=True):
    if not ok:
        PL.update(lambda p: p.update(stage="guide", phase="fix"))
        _say("What should I change in the drawing? Tell me in your own words.")
        return state()
    steps = tour()
    PL.update(lambda p: p.update(stage="tour"))
    return state()


def state():
    p = PL.get()
    chat = p["chat"]
    return {"plant": {k: p.get(k) for k in ("name", "stage", "use_sample", "connectors", "wishes", "phase", "goal", "layout", "tour")}, "chat": chat, "busy": JOB["busy"], "what": JOB["what"], "error": JOB["error"]}
