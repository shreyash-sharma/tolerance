"""Fills the AI Builder Cup submission template for Tolerance. Run:  python submission/build_deck.py
Reads 'Submission Template _ AI Builder Cup.pptx', writes 'Tolerance - AI Builder Cup submission.pptx'. Screens and figures come from submission/assets."""
import copy, os
from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "Submission Template _ AI Builder Cup.pptx")
OUT = os.path.join(HERE, "Tolerance - AI Builder Cup submission.pptx")
A = lambda f: os.path.join(HERE, "assets", f)

BODY, HEAD = "Google Sans Flex", "Google Sans Flex SemiBold"
INK, MUTED, BLUE, GREEN, AMBER, RED, CARD, LINE = "202124", "5F6368", "1A73E8", "188038", "B06000", "C5221F", "F1F3F4", "DADCE0"
rgb = lambda h: RGBColor.from_string(h)

prs = Presentation(SRC)


# ------------------------------------------------------------------ helpers
def font(run, size, bold=False, color=INK, name=None):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = rgb(color)
    run.font.name = name or (HEAD if bold else BODY)


def text(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP, name="text"):
    """paras: list of dicts {t, size, bold, color, bullet, after, align}. A text may be a list of (text, {bold, color}) runs."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.04)
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = p.get("align", PP_ALIGN.LEFT)
        para.space_after = Pt(p.get("after", 4))
        runs = p["t"] if isinstance(p["t"], list) else [(p["t"], {})]
        if p.get("bullet"):
            pPr = para._p.get_or_add_pPr()
            pPr.set("marL", str(int(Inches(0.18))))
            pPr.set("indent", str(-int(Inches(0.18))))
            bu = etree.SubElement(pPr, "{http://schemas.openxmlformats.org/drawingml/2006/main}buChar")
            bu.set("char", "•")
        for t, o in runs:
            r = para.add_run()
            r.text = t
            font(r, p.get("size", 12), o.get("bold", p.get("bold", False)), o.get("color", p.get("color", INK)))
    return tb


def card(slide, x, y, w, h, fill=CARD, name="card"):
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    s.name = name
    s.adjustments[0] = 0.06
    s.fill.solid()
    s.fill.fore_color.rgb = rgb(fill)
    s.line.fill.background()
    s.shadow.inherit = False
    return s


def pic(slide, path, x, y, w, h, border=True, name="picture"):
    """Fit the picture inside the box, centred, keeping its shape."""
    iw, ih = Image.open(path).size
    k = min(w / iw, h / ih)
    pw, ph = iw * k, ih * k
    p = slide.shapes.add_picture(path, Inches(x + (w - pw) / 2), Inches(y + (h - ph) / 2), Inches(pw), Inches(ph))
    p.name = name
    if border:
        p.line.color.rgb = rgb(LINE)
        p.line.width = Pt(0.75)
    return p


def set_title(slide, title, sub=None):
    """The template's own title box: keep its shape and font, replace the words."""
    box = next(s for s in slide.shapes if s.has_text_frame and s.top < Inches(1.0) and s.top > Inches(0.5))
    tf = box.text_frame
    first = tf.paragraphs[0]
    for r in first.runs[1:]:
        r._r.getparent().remove(r._r)
    first.runs[0].text = title
    for p in tf.paragraphs[1:]:
        p._p.getparent().remove(p._p)
    box.height = Inches(0.55)
    return box


def stat(slide, x, y, w, big, small, color=BLUE):
    card(slide, x, y, w, 1.0, name="stat card")
    text(slide, x, y + 0.08, w, 0.5, [{"t": big, "size": 24, "bold": True, "color": color, "align": PP_ALIGN.CENTER}], name="stat number")
    text(slide, x + 0.05, y + 0.58, w - 0.1, 0.4, [{"t": small, "size": 10, "color": MUTED, "align": PP_ALIGN.CENTER}], name="stat label")


def caption(slide, x, y, w, t):
    text(slide, x, y, w, 0.3, [{"t": t, "size": 10, "color": MUTED}], name="caption")


slides = list(prs.slides)
S = {i + 1: s for i, s in enumerate(slides)}

# ------------------------------------------------------------------ 1. team details
s = S[1]
box = next(sh for sh in s.shapes if sh.has_text_frame and "Team name" in sh.text_frame.text)
fills = {
    "Team name": "Tolerance",
    "Team leader name": "Shreyash Sharma",
    "Problem Statement": "Manufacturing. Plants run on scattered knowledge: manuals, orders, machine logs. When a station fails, nobody can quickly tell why, or whether a fix is safe. "
                         "We built an agentic platform that learns a plant from its own documents and data, finds the cause, and acts only inside limits the owner sets.",
}
for para in box.text_frame.paragraphs:
    t = "".join(r.text for r in para.runs)
    for k, v in fills.items():
        if t.strip().startswith(k):
            base = para.runs[-1]
            r = copy.deepcopy(base._r)
            para._p.insert(list(para._p).index(base._r) + 1, r)
            from pptx.text.text import _Run
            nr = _Run(r, para)
            nr.text = v
            nr.font.bold = False
            nr.font.size = Pt(12 if k == "Problem Statement" else 15)
    for r in para.runs:
        if r.text.strip().startswith(("Team name", "Team leader", "Problem Statement")):
            r.font.size = Pt(15)
box.top = Inches(3.1)
box.height = Inches(2.3)

# ------------------------------------------------------------------ 2. the template's note slide goes
ids = prs.slides._sldIdLst
def drop(i):
    sid = list(ids)[i]
    prs.part.drop_rel(sid.rId)
    ids.remove(sid)
drop(15 - 1)   # the empty content slide before "Thank you"
drop(2 - 1)    # "Note: please download this template"

# ------------------------------------------------------------------ 3. brief about the idea
s = S[3]
set_title(s, "Brief about the idea")
text(s, 0.35, 1.3, 5.3, 4.1, [
    {"t": "An agentic platform for manufacturing. It learns a plant from the plant's own documents and data, finds why a station failed, and acts only inside limits the owner sets.", "size": 14, "bold": True, "after": 8},
    {"t": [("Nine agents, one gateway. ", {"bold": True}), ("Four read the documents, connect the systems and build the model. Five run it: Diagnosis, Verifier, Planner, Warden and Sentinel.", {})], "size": 11.5, "bullet": True, "after": 5},
    {"t": [("Evidence before action. ", {"bold": True}), ("Every fact keeps the exact quote it came from. Instructions hidden in a file are removed, never obeyed. The Verifier recomputes every number a diagnosis cites.", {})], "size": 11.5, "bullet": True, "after": 5},
    {"t": [("Autonomy is a dial. ", {"bold": True}), ("Warden scores each action 0 to 100. The owner sets two lines: refuse, ask a person, or run alone. A hard limit from the documents is never crossed.", {})], "size": 11.5, "bullet": True, "after": 5},
    {"t": [("Built on Google Cloud. ", {"bold": True}), ("Gemini on Vertex AI in every agent, Cloud Run, Firebase sign-in.", {})], "size": 11.5, "bullet": True},
])
pic(s, A("floor_plan.png"), 5.85, 1.3, 3.85, 2.3, name="Floor plan screenshot")
caption(s, 5.85, 3.62, 3.85, "The live floor: plan, data feeds and status.")
stat(s, 5.85, 4.1, 1.2, "9", "agents")
stat(s, 7.2, 4.1, 1.2, "465", "incidents backtested")
stat(s, 8.55, 4.1, 1.15, "10", "live system types")

# ------------------------------------------------------------------ 4. opportunities
s = S[4]
set_title(s, "Opportunities")
cols = [
    ("How is it different from other ideas?", BLUE, [
        "It learns from the plant's own documents and data, not from a fixed template.",
        "It finds the systems your documents name (MES, ERP, MongoDB, MQTT, MCP servers) and asks for each one by name.",
        "Autonomy is a setting the owner controls, enforced by policy, not by a prompt.",
    ]),
    ("How will it solve the problem?", GREEN, [
        "It compiles scattered manuals, logs and orders into one checked model. Every fact has its quote.",
        "When a station fails, Diagnosis, Verifier, Planner and Warden answer in about 20 seconds.",
        "Sentinel watches data, services and certificates. Playbooks and channels reach the right person.",
    ]),
    ("USP of the solution", AMBER, [
        "Evidence before action: a wrong number is sent back, a broken hard limit blocks the action.",
        "Two lines you set, tried first on 465 recorded incidents before you trust them.",
        "Every step is recorded. Gemini works in every agent. Plain rules decide every safety result.",
    ]),
]
for i, (h, c, items) in enumerate(cols):
    x = 0.3 + i * 3.17
    card(s, x, 1.3, 3.05, 3.25, name="column card")
    text(s, x + 0.12, 1.4, 2.8, 0.6, [{"t": h, "size": 13, "bold": True, "color": c}], name="column title")
    text(s, x + 0.12, 2.05, 2.82, 2.5, [{"t": t, "size": 11, "bullet": True, "after": 7} for t in items], name="column text")
card(s, 0.3, 4.68, 9.4, 0.62, fill="E8F0FE", name="summary banner")
text(s, 0.45, 4.7, 9.1, 0.58, [{"t": "Plants already have the data and the experts. Tolerance connects them, checks its own answers, and leaves the authority with the people.", "size": 12, "bold": True, "color": BLUE}], anchor=MSO_ANCHOR.MIDDLE, name="summary text")

# ------------------------------------------------------------------ 5. features
s = S[5]
set_title(s, "List of features offered by the solution")
feats = [
    ("Guide onboarding", "Asks the plant name, reads the documents, settles conflicts, draws the plant."),
    ("Document Reader", "Facts with exact quotes. Hidden instructions are removed first."),
    ("Live connectors", "PostgreSQL, MySQL, SQL Server, Oracle, MongoDB, MQTT, Kafka, OPC UA, REST. Test, then connect."),
    ("Your own MCP servers", "They join the same hub. Only read-only tools can run."),
    ("Floor in 2D and 3D", "A Pascal plan and 3D view, with every data feed joined to its stations."),
    ("Layout editor", "Move, add and delete stations. Draw how parts flow."),
    ("Operations", "Diagnosis, Verifier, Planner and Warden in one run, step by step."),
    ("Warden gate", "Score 0 to 100, your two lines, hard limits, a backtest."),
    ("Sentinel", "Plain rules on data, services and certificates. Maintenance windows."),
    ("Playbooks", "Draw what should happen when a station fails."),
    ("Approval channels", "Slack, Teams, Discord, Telegram or a webhook."),
    ("Private by design", "Firebase sign-in, a private plant per user, encrypted passwords, usage caps."),
]
for i, (h, d) in enumerate(feats):
    r, c = divmod(i, 4)
    x, y = 0.3 + c * 2.37, 1.3 + r * 1.36
    card(s, x, y, 2.27, 1.26, name="feature card")
    text(s, x + 0.08, y + 0.06, 2.1, 0.3, [{"t": h, "size": 12, "bold": True, "color": BLUE}], name="feature title")
    text(s, x + 0.08, y + 0.38, 2.1, 0.85, [{"t": d, "size": 10, "color": INK}], name="feature text")

# ------------------------------------------------------------------ 6. process flow
s = S[6]
set_title(s, "Process flow diagram or Use-case diagram")
text(s, 0.3, 1.2, 4, 0.3, [{"t": "Set up once", "size": 12, "bold": True, "color": MUTED}], name="row label")
steps = ["Give the plant name and documents", "Connect the systems the documents name", "The model is compiled, each fact with its quote", "The owner confirms what was understood", "The floor goes live in 2D and 3D", "The owner sets the two lines"]
for i, t in enumerate(steps):
    x = 0.3 + i * 1.57
    shp = card(s, x, 1.5, 1.42, 1.0, fill="E8F0FE", name="step")
    text(s, x + 0.04, 1.5, 1.34, 1.0, [{"t": t, "size": 10, "align": PP_ALIGN.CENTER}], anchor=MSO_ANCHOR.MIDDLE, name="step text")
    if i < len(steps) - 1:
        ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + 1.43), Inches(1.9), Inches(0.14), Inches(0.2))
        ar.fill.solid(); ar.fill.fore_color.rgb = rgb(BLUE); ar.line.fill.background(); ar.name = "arrow"
text(s, 0.3, 2.75, 5, 0.3, [{"t": "When a station fails", "size": 12, "bold": True, "color": MUTED}], name="row label")
ops = [("Diagnosis", "finds the cause with read-only tools"), ("Verifier", "recomputes every number it cites"), ("Planner", "proposes the fix with exact settings"), ("Warden", "hard limits, then a score from 0 to 100")]
for i, (h, d) in enumerate(ops):
    x = 0.3 + i * 1.78
    card(s, x, 3.05, 1.62, 1.2, fill="E6F4EA" if h != "Warden" else "FCE8E6", name="operations step")
    text(s, x + 0.06, 3.1, 1.5, 1.25, [{"t": h, "size": 12, "bold": True, "color": GREEN if h != "Warden" else RED, "after": 3}, {"t": d, "size": 10}], name="operations text")
    if i < len(ops) - 1:
        ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + 1.63), Inches(3.55), Inches(0.14), Inches(0.2))
        ar.fill.solid(); ar.fill.fore_color.rgb = rgb(GREEN); ar.line.fill.background(); ar.name = "arrow"
outs = [("Blocked or refused", "does not run", RED, "FCE8E6"), ("A person approves", "in the app or chat", AMBER, "FEF7E0"), ("Runs by itself", "inside your limit", GREEN, "E6F4EA")]
for i, (h, d, c, f) in enumerate(outs):
    y = 3.05 + i * 0.41
    card(s, 7.55, y, 2.15, 0.37, fill=f, name="outcome")
    text(s, 7.6, y, 2.05, 0.37, [{"t": [(h + ": ", {"bold": True, "color": c}), (d, {})], "size": 9}], anchor=MSO_ANCHOR.MIDDLE, name="outcome text")
ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(7.33), Inches(3.55), Inches(0.18), Inches(0.2))
ar.fill.solid(); ar.fill.fore_color.rgb = rgb(RED); ar.line.fill.background(); ar.name = "arrow"
text(s, 0.3, 4.45, 9.4, 0.8, [
    {"t": [("Then: ", {"bold": True}), ("the Action Broker applies only what the gate allows, in a simulator. Every model call, tool call and decision is recorded. ", {}), ("Who uses it: ", {"bold": True}), ("the plant owner sets it up and the limits, an operator reads the floor, a person approves the middle zone.", {})], "size": 10.5},
])

# ------------------------------------------------------------------ 7. wireframes / mock diagrams
s = S[7]
set_title(s, "Wireframes/Mock diagrams of the proposed solution (optional)")
trio = [("ingest_cards.png", "The Guide asks for each system the documents name, with the sentence that names it."), ("layout_editor_crop.png", "The layout editor: move and add stations, draw part flows."), ("warden_gate.png", "The Warden gate: every rule an action must meet.")]
for i, (f, c) in enumerate(trio):
    x = 0.3 + i * 3.17
    pic(s, A(f), x, 1.3, 3.05, 2.55, name="screen")
    text(s, x, 3.95, 3.05, 0.8, [{"t": c, "size": 10.5, "color": MUTED}], name="caption")
text(s, 0.3, 4.85, 9.4, 0.5, [{"t": "These are screens of the running prototype, not sketches.", "size": 10.5, "color": MUTED}], name="note")

# ------------------------------------------------------------------ 8. architecture
s = S[8]
set_title(s, "Architecture diagram of the proposed solution")
pic(s, A("agent_team.png"), 0.3, 1.3, 6.35, 3.6, border=True, name="Architecture diagram")
text(s, 6.85, 1.3, 2.85, 4.0, [
    {"t": "How it fits together", "size": 12, "bold": True, "color": BLUE, "after": 5},
    {"t": [("One container on Cloud Run: ", {"bold": True}), ("the web app and the API.", {})], "size": 10.5, "bullet": True, "after": 4},
    {"t": [("Foreman: ", {"bold": True}), ("runs the nine agents, with a contract card and a record of every step.", {})], "size": 10.5, "bullet": True, "after": 4},
    {"t": [("Gemini on Vertex AI ", {"bold": True}), ("writes the words, reads answers and picks tools.", {})], "size": 10.5, "bullet": True, "after": 4},
    {"t": [("Cedar policy gateway: ", {"bold": True}), ("default deny; nothing reaches a machine except through it.", {})], "size": 10.5, "bullet": True, "after": 4},
    {"t": [("MCP hub: ", {"bold": True}), ("built-in and the owner's own servers; only read-only tools run.", {})], "size": 10.5, "bullet": True, "after": 4},
    {"t": [("Data lake: ", {"bold": True}), ("DuckDB, loaded once and kept current by connectors.", {})], "size": 10.5, "bullet": True, "after": 4},
])
caption(s, 0.3, 4.95, 6.35, "The agent team: owner, Guide, onboarding and operations agents, shared services, policy gateway and machines.")

# ------------------------------------------------------------------ 9. technologies
s = S[9]
set_title(s, "Technologies to be used in the solution")
tech = [
    ("Google Cloud", BLUE, ["Gemini on Vertex AI (Gemini 2.5 Flash and the flash-lite family)", "Cloud Run, one always-on instance", "Firebase Authentication (Google, email, guest)", "Cloud Build and Artifact Registry"]),
    ("Agents and safety", RED, ["Foreman agent layer, Gemini function calling", "Cedar policy, default deny", "Model Context Protocol (hub and client)", "Rule-driven Warden and Sentinel"]),
    ("Data and connectors", GREEN, ["DuckDB lake, dlt loaders", "SQLAlchemy: PostgreSQL, MySQL, SQL Server, Oracle", "pymongo, MQTT, Kafka, OPC UA (asyncua)", "Encrypted vault for passwords"]),
    ("Web", AMBER, ["Next.js 16 and React 19", "Pascal Editor viewer (2D plan, 3D)", "three.js, React Flow", "FastAPI backend"]),
]
for i, (h, c, items) in enumerate(tech):
    x = 0.3 + i * 2.37
    card(s, x, 1.3, 2.27, 3.05, name="technology card")
    text(s, x + 0.1, 1.38, 2.1, 0.4, [{"t": h, "size": 12.5, "bold": True, "color": c}], name="technology title")
    text(s, x + 0.1, 1.85, 2.1, 2.45, [{"t": t, "size": 10.5, "bullet": True, "after": 6} for t in items], name="technology text")
card(s, 0.3, 4.5, 9.4, 0.62, fill="E8F0FE", name="gemini banner")
text(s, 0.45, 4.52, 9.1, 0.58, [{"t": "Gemini is called through one gateway: a daily cap, model rotation when a model is busy, recorded answers as a fallback, and a visible notice when Gemini is under load.", "size": 11, "bold": True, "color": BLUE}], anchor=MSO_ANCHOR.MIDDLE, name="gemini text")
text(s, 0.3, 5.15, 9.4, 0.3, [{"t": "Open source is used under its own licence; the licences are listed in the repository.", "size": 9.5, "color": MUTED}], name="note")

# ------------------------------------------------------------------ 10. cost
s = S[10]
set_title(s, "Estimated implementation cost (optional)")
rows = [
    ("Cloud Run", "One always-on instance (2 vCPU, 2 GiB) serves the web app and the API."),
    ("Gemini on Vertex AI", "A daily cap of 1,500 calls and a quota per visitor. Recorded answers replay without a call."),
    ("Firebase Authentication", "Free tier covers sign-in with Google, email and guest."),
    ("Cloud Build, Artifact Registry", "A build per deploy."),
    ("Data", "Files and DuckDB inside the container. No managed database yet."),
]
for i, (h, d) in enumerate(rows):
    y = 1.3 + i * 0.72
    card(s, 0.3, y, 6.3, 0.64, name="cost row")
    text(s, 0.4, y + 0.04, 1.85, 0.56, [{"t": h, "size": 11, "bold": True, "color": BLUE}], anchor=MSO_ANCHOR.MIDDLE, name="cost item")
    text(s, 2.3, y + 0.04, 4.2, 0.56, [{"t": d, "size": 10.5}], anchor=MSO_ANCHOR.MIDDLE, name="cost text")
card(s, 6.85, 1.3, 2.85, 3.5, fill="E8F0FE", name="budget card")
text(s, 6.97, 1.4, 2.65, 3.3, [
    {"t": "Kept small on purpose", "size": 12.5, "bold": True, "color": BLUE, "after": 6},
    {"t": "The build is planned to stay under $100 of the $300 credit.", "size": 11, "after": 8},
    {"t": "Caps that keep it there", "size": 11, "bold": True, "color": BLUE, "after": 3},
    {"t": "A daily limit on Gemini calls", "size": 10.5, "bullet": True, "after": 2},
    {"t": "A quota per visitor, tighter for guests", "size": 10.5, "bullet": True, "after": 2},
    {"t": "Recorded answers replay for free", "size": 10.5, "bullet": True, "after": 8},
    {"t": "To grow: one lake per plant in Cloud SQL or Cloud Storage, more instances under load, and a model budget per customer.", "size": 10.5},
], name="budget text")

# ------------------------------------------------------------------ 11. snapshots
s = S[11]
set_title(s, "Snapshots of the prototype")
shots = [("floor_plan.png", "The floor in 2D with its data feeds"), ("floor_3d.png", "The same plant in 3D"), ("layout_editor.png", "The layout editor"),
         ("warden_gate.png", "The Warden gate"), ("sentinel.png", "Sentinel rules"), ("agents.png", "The nine agents")]
for i, (f, c) in enumerate(shots):
    r, k = divmod(i, 3)
    x, y = 0.3 + k * 3.17, 1.25 + r * 2.1
    pic(s, A(f), x, y, 3.05, 1.72, name="screen")
    caption(s, x, y + 1.74, 3.05, c)

# ------------------------------------------------------------------ 12. performance
s = S[12]
set_title(s, "Prototype Performance report/Benchmarking")
stat(s, 0.3, 1.3, 2.2, "465", "real fault-injection incidents replayed through Warden")
stat(s, 2.65, 1.3, 2.2, "75%", "of those diagnoses were right")
stat(s, 5.0, 1.3, 2.2, "~18 s", "failed station to a scored plan, measured locally")
stat(s, 7.35, 1.3, 2.35, "0.2 s", "a read-only MCP tool call, measured locally", color=GREEN)
card(s, 0.3, 2.5, 4.6, 2.0, name="warden result card")
text(s, 0.42, 2.58, 4.4, 1.9, [
    {"t": "Warden with the default lines (40 and 80)", "size": 12, "bold": True, "color": BLUE, "after": 6},
    {"t": [("149 ", {"bold": True, "color": GREEN}), ("would run alone: 120 right, 29 wrong", {})], "size": 11.5, "after": 4},
    {"t": [("316 ", {"bold": True, "color": AMBER}), ("would wait for a person", {})], "size": 11.5, "after": 4},
    {"t": "The incident set is software faults (RCAEval). There is no history from a real plant yet.", "size": 10.5, "color": MUTED},
], name="warden result text")
card(s, 0.3, 4.62, 9.4, 0.68, fill="E8F0FE", name="measure banner")
text(s, 0.45, 4.64, 9.1, 0.64, [{"t": "Figures come from the running prototype on one computer. Gemini's speed varies with load, so the app shows a notice when Gemini is busy and the plain rules answer instead.", "size": 11, "bold": True, "color": BLUE}], anchor=MSO_ANCHOR.MIDDLE, name="measure text")
card(s, 5.05, 2.5, 4.65, 2.0, name="checks card")
text(s, 5.17, 2.58, 4.45, 1.9, [
    {"t": "Checks that pass today", "size": 12, "bold": True, "color": BLUE, "after": 6},
    {"t": "12 automated suites: policy, agents, Sentinel, probes, connectors, vault, MCP.", "size": 10, "bullet": True, "after": 3},
    {"t": "Real PostgreSQL and MQTT connected, loading only what is new.", "size": 10, "bullet": True, "after": 3},
    {"t": "A remote MCP server: a read-only tool runs, an acting tool is denied.", "size": 10, "bullet": True, "after": 3},
    {"t": "Not yet tested live: Kafka, Oracle, SQL Server, MySQL.", "size": 10, "bullet": True, "color": MUTED},
], name="checks text")

# ------------------------------------------------------------------ 13. future
s = S[13]
set_title(s, "Additional Details/Future Development (if any)")
fut = [
    ("Tune Gemma for Sentinel", "Gemini sorts short texts into labels today. We plan to fine-tune Gemma for that one classification job, with plain rules still judging the result."),
    ("Reach private plant networks", "Probes or a tunnel so a cloud copy can read systems inside a factory network."),
    ("A pilot with a real plant", "Replace the replayed lab log and software incidents with a customer's own history."),
    ("Write actions behind Warden", "Let remote MCP tools act, only through the gate and with a person's approval."),
    ("More live checks", "Test Kafka, Oracle, SQL Server and MySQL against live servers. Add roles for approvers and many plants per owner."),
]
for i, (h, d) in enumerate(fut):
    y = 1.3 + i * 0.8
    card(s, 0.3, y, 9.4, 0.72, name="future row")
    text(s, 0.42, y + 0.04, 2.6, 0.64, [{"t": h, "size": 12, "bold": True, "color": BLUE}], anchor=MSO_ANCHOR.MIDDLE, name="future item")
    text(s, 3.05, y + 0.04, 6.55, 0.64, [{"t": d, "size": 10.5}], anchor=MSO_ANCHOR.MIDDLE, name="future text")

# ------------------------------------------------------------------ 14. links
s = S[14]
box = next(sh for sh in s.shapes if sh.has_text_frame and "Provide links" in sh.text_frame.text)
paras = box.text_frame.paragraphs
for p in paras:
    t = "".join(r.text for r in p.runs)
    add = {"GitHub Public Repository": ": https://github.com/shreyash-sharma/tolerance",
           "Demo Video Link": ": to be added",
           "Final Product Link": ": https://tolerance-749288317336.asia-southeast1.run.app"}
    for k, v in add.items():
        if t.strip().startswith(k):
            p.runs[-1].text = p.runs[-1].text + v
box.height = Inches(1.9)
text(s, 0.35, 2.7, 4, 0.3, [{"t": "How to try it", "size": 12, "bold": True, "color": MUTED}], name="row label")
for i, (n, t) in enumerate([("1", "Open the final product link."), ("2", "Choose Register, Sign in, or Try it as a guest. A guest gets a private plant with usage caps."), ("3", "Give a plant name and drop documents, or load the made-up plant that has MES, MongoDB, ERP and IoT data.")]):
    x = 0.35 + i * 3.14
    card(s, x, 3.05, 3.0, 1.55, name="try step")
    text(s, x + 0.1, 3.1, 0.6, 0.5, [{"t": n, "size": 22, "bold": True, "color": BLUE}], name="step number")
    text(s, x + 0.1, 3.65, 2.8, 0.95, [{"t": t, "size": 11}], name="step text")

prs.save(OUT)
print("saved", OUT)
