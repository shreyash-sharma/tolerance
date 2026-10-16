"""Fills the AI Builder Cup submission template for Tolerance. Run:  python submission/build_deck.py
Reads 'template_extended.pptx' (the official template plus eleven copies of one content slide), writes 'Tolerance - AI Builder Cup submission.pptx'.
Main deck: 16 slides, product first. Then 'Thank you', then the appendix. Screens and figures come from submission/assets.
A value that is not known yet is written as a red [FILL] marker. Nothing is invented."""
import copy, json, os
from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_MARKER_STYLE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.text.text import _Run
from pptx.util import Inches, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "template_extended.pptx")
OUT = os.path.join(HERE, "Tolerance - AI Builder Cup submission.pptx")
A = lambda f: os.path.join(HERE, "assets", f)

BODY, HEAD = "Google Sans Flex", "Google Sans Flex SemiBold"
INK, MUTED, BLUE, GREEN, AMBER, RED, CARD, LINE = "202124", "5F6368", "1A73E8", "188038", "B06000", "C5221F", "F1F3F4", "DADCE0"
FILLRED = "D50000"
rgb = lambda h: RGBColor.from_string(h)

prs = Presentation(SRC)
FILLS = []   # (slide label, what is missing), printed at the end


def font(run, size, bold=False, color=INK, name=None):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = rgb(color)
    run.font.name = name or (HEAD if bold else BODY)


def F(t="[FILL]"):
    """A visible red marker for a value that has not been supplied."""
    return (t, {"bold": True, "color": FILLRED})


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
        sz = p.get("size", 12)
        if len(runs) == 1 and p.get("bold") and p.get("color") in (BLUE, GREEN, AMBER, RED) and sz == 12 and "takeaway" not in name:
            sz = 14   # every heading is 14
        for t, o in runs:
            r = para.add_run()
            r.text = t
            font(r, sz, o.get("bold", p.get("bold", False)), o.get("color", p.get("color", INK)), o.get("font", p.get("font")))
    return tb


def card(slide, x, y, w, h, fill=CARD, name="card"):
    s = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    s.name = name
    s.adjustments[0] = 0.05
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


def set_title(slide, title):
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


def tile(slide, x, y, w, h, big, small, color=BLUE, bigsize=24):   # numbers are always 24
    """A figure with its label. `big` is a string or a list of runs (so a [FILL] can sit inside it)."""
    card(slide, x, y, w, h, name="stat card")
    text(slide, x, y + 0.08, w, 0.55, [{"t": big, "size": bigsize, "bold": True, "color": color, "align": PP_ALIGN.CENTER}], anchor=MSO_ANCHOR.MIDDLE, name="stat number")
    text(slide, x + 0.05, y + 0.66, w - 0.1, h - 0.7, [{"t": small, "size": 12, "color": MUTED, "align": PP_ALIGN.CENTER}], name="stat label")


def caption(slide, x, y, w, t, h=0.5):
    text(slide, x, y, w, h, [{"t": t, "size": 12, "color": MUTED}], name="caption")


def banner(slide, y, t, h=0.55, fill="E8F0FE", color=BLUE, size=12):
    card(slide, 0.3, y, 9.4, h, fill=fill, name="takeaway")
    text(slide, 0.45, y, 9.1, h, [{"t": t, "size": size, "bold": True, "color": color}], anchor=MSO_ANCHOR.MIDDLE, name="takeaway text")


def table(slide, x, y, w, rows, widths, head, size=12, rh=0.32, name="table"):
    sh = slide.shapes.add_table(len(rows) + 1, len(head), Inches(x), Inches(y), Inches(w), Inches(rh * (len(rows) + 1)))
    sh.name = name
    tb = sh.table
    for j, wd in enumerate(widths):
        tb.columns[j].width = Inches(wd)
    for i, row in enumerate([head] + rows):
        tb.rows[i].height = Inches(rh)
        for j, v in enumerate(row):
            c = tb.cell(i, j)
            c.margin_left = c.margin_right = Inches(0.05)
            c.margin_top = c.margin_bottom = Inches(0.02)
            c.fill.solid()
            c.fill.fore_color.rgb = rgb(BLUE if i == 0 else ("FFFFFF" if i % 2 else CARD))
            para = c.text_frame.paragraphs[0]
            para.alignment = PP_ALIGN.LEFT if j == 0 else PP_ALIGN.CENTER
            run = para.add_run()
            run.text = str(v)
            font(run, size, bold=(i == 0), color="FFFFFF" if i == 0 else INK)
    return sh


def flow_box(slide, x, y, w, h, title, sub=None, color=BLUE, fill=CARD, name="flow box", ts=12, ss=12):
    """A rounded box with a coloured edge and a bold title, optional second line."""
    b = card(slide, x, y, w, h, fill=fill, name=name)
    b.line.color.rgb = rgb(color)
    b.line.width = Pt(1.25)
    paras = [{"t": title, "size": ts, "bold": True, "color": INK, "align": PP_ALIGN.CENTER, "after": 0}]
    if sub:
        paras.append({"t": sub, "size": ss, "color": MUTED, "align": PP_ALIGN.CENTER, "after": 0})
    text(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.MIDDLE, name=name + " text")
    return b


def flow_arrow(slide, x1, y1, x2, y2, color=MUTED, dash=False):
    """A straight line with an arrow head at the end."""
    from pptx.enum.shapes import MSO_CONNECTOR
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.name = "flow arrow"
    c.line.color.rgb = rgb(color)
    c.line.width = Pt(1.5)
    ln = c.line._get_or_add_ln()
    if dash:
        d = etree.SubElement(ln, "{http://schemas.openxmlformats.org/drawingml/2006/main}prstDash")
        d.set("val", "dash")
    t = etree.SubElement(ln, "{http://schemas.openxmlformats.org/drawingml/2006/main}tailEnd")
    t.set("type", "triangle")
    return c


MATH = "Cambria Math"
slides = list(prs.slides)
S = {i + 1: s for i, s in enumerate(slides)}
ids = prs.slides._sldIdLst

# ------------------------------------------------------------------ 1. team details
s = S[1]
box = next(sh for sh in s.shapes if sh.has_text_frame and "Team name" in sh.text_frame.text)
THEME = "Manufacturing: Intelligent Operations & Industrial Efficiency"
fills = {
    "Team name": "Lanterns",
    "Team leader name": "Shreyash Sharma. Team member: Kritika Tiwari",
    "Problem Statement": THEME + ". Plants run on scattered knowledge: manuals, orders, machine logs. When a station fails, nobody can quickly tell why, or whether a fix is safe. "
                         "We built an agentic platform around a Symbiotic Compiler: it compiles a plant from its own documents and data, finds the cause, and acts only inside limits the owner sets.",
}
for para in box.text_frame.paragraphs:
    t = "".join(r.text for r in para.runs)
    for k, v in fills.items():
        if t.strip().startswith(k):
            base = para.runs[-1]
            r = copy.deepcopy(base._r)
            para._p.insert(list(para._p).index(base._r) + 1, r)
            nr = _Run(r, para)
            nr.text = v
            nr.font.bold = False
            nr.font.size = Pt(12 if k == "Problem Statement" else 14)
    for r in para.runs:
        if r.text.strip().startswith(("Team name", "Team leader", "Problem Statement")):
            r.font.size = Pt(14)
box.top = Inches(3.1)
box.height = Inches(2.3)


# the template's empty slide and its note slide go
def drop(i):
    sid = list(ids)[i]
    prs.part.drop_rel(sid.rId)
    ids.remove(sid)


drop(15 - 1)
drop(2 - 1)

# ------------------------------------------------------------------ 2. brief about the idea
s = S[3]
set_title(s, "Brief about the idea")
text(s, 0.3, 1.2, 5.05, 4.2, [
    {"t": "An agentic platform for manufacturing, built around a Symbiotic Compiler. It compiles a plant's own documents and data into one checked knowledge graph, finds why a station failed, and acts only inside limits the owner sets.", "size": 14, "bold": True, "after": 6},
    {"t": [("Nine agents, one gateway. ", {"bold": True}), ("Four read the documents, connect the systems and build the model. Five run it: Diagnosis, Verifier, Planner, Warden and Sentinel.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Evidence before action. ", {"bold": True}), ("Every fact keeps the exact quote it came from. Instructions hidden in a file are removed, never obeyed. The Verifier recomputes every number a diagnosis cites.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Autonomy is a dial. ", {"bold": True}), ("Warden scores each action 0 to 100. Below 40: refused. From 40 to 79: a person approves. From 80: it runs alone. The owner can change 40 and 80. A hard limit from the documents is never crossed.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Built on Google Cloud. ", {"bold": True}), ("Gemini on Vertex AI in every agent, Cloud Run, Firebase sign-in.", {})], "size": 12, "bullet": True},
], name="brief text")
pic(s, A("floor_3d.png"), 5.45, 1.2, 4.25, 2.4, name="3D plant screenshot")
tile(s, 5.45, 3.72, 1.35, 1.65, "9", "agents")
tile(s, 6.9, 3.72, 1.4, 1.65, "~30 s", "failed station to scored plan, median of 7 local runs")
tile(s, 8.4, 3.72, 1.3, 1.65, "17", "system types read from documents")

# ------------------------------------------------------------------ 3. why it matters (new)
s = S[17]
set_title(s, "Why it matters")
cols = [
    ("The problem", BLUE, [
        [("Unplanned downtime. ", {"bold": True}), ("A station fails and the line waits.", {})],
        [("Nobody can quickly tell why it failed, or whether a fix is safe.", {})],
        [("The knowledge sits in manuals, orders, machine logs and a few people's heads.", {})],
    ]),
    ("The cost", BLUE, [
        [("Every hour a line is down is output the plant does not get back.", {})],
        [("Unplanned downtime costs the world's 500 largest companies about $1.4 trillion a year, 11% of their revenue (Siemens, The True Cost of Downtime 2024).", {"bold": True})],
    ]),
    ("Who benefits, and how it scales", BLUE, [
        [("Small and mid-size plants that have no reliability team.", {})],
        [("Onboarding works for any plant whose systems can be connected.", {})],
        [("The owner keeps the authority. Warden runs an action alone only when its score reaches the owner's threshold (80 by default).", {})],
    ]),
]
for i, (h, c, items) in enumerate(cols):
    x = 0.3 + i * 3.17
    card(s, x, 1.25, 3.05, 3.2, name="column card")
    text(s, x + 0.12, 1.35, 2.8, 0.45, [{"t": h, "size": 14, "bold": True, "color": c}], name="column title")
    text(s, x + 0.12, 1.9, 2.82, 3.35, [{"t": t, "size": 12, "bullet": True, "after": 12} for t in items], name="column text")

# ------------------------------------------------------------------ 4. opportunities
s = S[4]
set_title(s, "Opportunities")
cols = [
    ("How is it different from other ideas?", "The Symbiotic Compiler", BLUE, [
        "It reads the documents and data of your plant.",
        "It builds a knowledge graph of stations, systems and flows. Each fact has its quote.",
        "A person confirms the graph. The agents use it. This is the symbiosis.",
    ]),
    ("How will it solve the problem?", "From a fault to a fix", GREEN, [
        "A station fails. Diagnosis finds the cause in logs, databases and APIs.",
        "The Verifier checks the numbers. The Planner proposes a fix with exact settings.",
        "Warden scores the fix. The fix runs alone, a person approves it, or it is refused.",
    ]),
    ("USP of the solution", "Four things that work together", AMBER, [
        "Auto-remediation. It finds the cause and fixes it. Warden keeps the owner in control.",
        "Built from your documents. No template. Each fact has its quote.",
        "It asks for each system by name. It knows 17 system types. It only reads.",
        "It checks itself. The Verifier recomputes every number before action.",
    ]),
]
for i, (q, h, c, items) in enumerate(cols):
    x = 0.3 + i * 3.17
    card(s, x, 1.15, 3.05, 3.5, name="column card")
    text(s, x + 0.1, 1.18, 2.85, 0.9, [{"t": q, "size": 14, "bold": True, "color": c, "after": 1}, {"t": h, "size": 12, "color": MUTED}], name="column title")
    text(s, x + 0.1, 2.12, 2.88, 2.55, [{"t": t, "size": 12, "bullet": True, "after": 6} for t in items], name="column text")
banner(s, 4.72, "Maintenance copilots, such as MaintainX CoPilot and Siemens Industrial Copilot, answer a technician's questions. Tolerance learns the plant from its own documents. It puts every action through a gate the owner controls.", 0.7, size=12)

# ------------------------------------------------------------------ 5. features
s = S[5]
set_title(s, "List of features offered by the solution")
feats = [
    ("Guide onboarding", "Asks the plant name, reads the documents, settles conflicts, draws the plant."),
    ("Document Reader", "Facts with exact quotes. Hidden instructions are removed first."),
    ("Live connectors (17 types)", "Tested live: PostgreSQL, MQTT, MongoDB. Built, not yet tested live: MySQL, SQL Server, Oracle, Kafka, OPC UA."),
    ("Your own MCP servers", "They join the same hub. Only read-only tools can run."),
    ("Floor in 2D and 3D", "A 2D plan and 3D view, with every data feed joined to its stations."),
    ("Layout editor", "Move, add and delete stations. Draw how parts flow."),
    ("Operations", "Diagnosis, Verifier, Planner and Warden in one run, step by step."),
    ("Warden gate", "Score 0 to 100. Below 40 refused, from 80 runs alone. Hard limits. A backtest."),
    ("Sentinel", "Plain rules on data, services and certificates. Maintenance windows."),
    ("Playbooks", "Draw what should happen when a station fails."),
    ("Roles and approval", "Cedar decides who may approve. Telegram buttons, Slack, Teams, Discord or a webhook."),
    ("Private by design", "Firebase sign-in, a private plant per user, encrypted passwords, usage caps."),
]
heights = [1.15, 0.93, 0.93, 0.93]
y = 1.12
for r in range(4):
    for c in range(3):
        h, d = feats[r * 3 + c]
        x = 0.3 + c * 3.17
        card(s, x, y, 3.05, heights[r], name="feature card")
        text(s, x + 0.08, y + 0.04, 2.9, 0.28, [{"t": h, "size": 12, "bold": True, "color": BLUE}], name="feature title")
        text(s, x + 0.08, y + 0.31, 2.9, heights[r] - 0.33, [{"t": d, "size": 12, "color": INK}], name="feature text")
    y += heights[r] + 0.05

# ------------------------------------------------------------------ 6. process flow
s = S[6]
set_title(s, "Process flow diagram or Use-case diagram")
text(s, 0.3, 1.1, 9.4, 0.3, [{"t": "Set up once: the Symbiotic Compiler builds the plant", "size": 12, "bold": True, "color": MUTED}], name="row label")
steps = ["Give the plant name and documents", "Connect the systems the documents name", "The knowledge graph is compiled, each fact with its quote", "The owner confirms what was understood", "The floor goes live in 2D and 3D", "The owner sets the score thresholds (40 and 80)"]
for i, t in enumerate(steps):
    x = 0.3 + i * 1.57
    card(s, x, 1.4, 1.43, 1.25, fill="E8F0FE", name="step")
    text(s, x + 0.03, 1.4, 1.37, 1.25, [{"t": t, "size": 12, "align": PP_ALIGN.CENTER}], anchor=MSO_ANCHOR.MIDDLE, name="step text")
    if i < len(steps) - 1:
        ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + 1.44), Inches(1.93), Inches(0.12), Inches(0.2))
        ar.fill.solid(); ar.fill.fore_color.rgb = rgb(BLUE); ar.line.fill.background(); ar.name = "arrow"
text(s, 0.3, 2.75, 5, 0.3, [{"t": "When a station fails", "size": 12, "bold": True, "color": MUTED}], name="row label")
ops = [("Diagnosis", "finds the cause with read-only tools"), ("Verifier", "recomputes every number it cites"), ("Planner", "proposes the fix with exact settings"), ("Warden", "hard limits, then a score from 0 to 100")]
for i, (h, d) in enumerate(ops):
    x = 0.3 + i * 1.7
    card(s, x, 3.05, 1.55, 1.4, fill="E6F4EA" if h != "Warden" else "FCE8E6", name="operations step")
    text(s, x + 0.04, 3.08, 1.47, 1.35, [{"t": h, "size": 12, "bold": True, "color": GREEN if h != "Warden" else RED, "after": 3}, {"t": d, "size": 12}], name="operations text")
    if i < len(ops) - 1:
        ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + 1.56), Inches(3.65), Inches(0.12), Inches(0.2))
        ar.fill.solid(); ar.fill.fore_color.rgb = rgb(GREEN); ar.line.fill.background(); ar.name = "arrow"
outs = [("Blocked or refused", "does not run", RED, "FCE8E6"), ("A person approves", "in the app or chat", AMBER, "FEF7E0"), ("Runs by itself", "score 80 or more", GREEN, "E6F4EA")]
for i, (h, d, c, f) in enumerate(outs):
    y = 3.05 + i * 0.5
    card(s, 7.3, y, 2.4, 0.45, fill=f, name="outcome")
    text(s, 7.33, y, 2.35, 0.45, [{"t": [(h + ": ", {"bold": True, "color": c}), (d, {})], "size": 12}], anchor=MSO_ANCHOR.MIDDLE, name="outcome text")
ar = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(7.1), Inches(3.65), Inches(0.16), Inches(0.2))
ar.fill.solid(); ar.fill.fore_color.rgb = rgb(RED); ar.line.fill.background(); ar.name = "arrow"
text(s, 0.3, 4.55, 9.4, 0.85, [
    {"t": [("Then: ", {"bold": True}), ("the Action Broker applies only what the gate allows, in a simulator. Every model call, tool call and decision is recorded. ", {}), ("Who uses it: ", {"bold": True}), ("the owner sets it up and the limits, an operator reads the floor, a supervisor approves the middle zone.", {})], "size": 12},
], name="flow note")

# ------------------------------------------------------------------ 7. one incident, start to finish (new)
s = S[18]
set_title(s, "One incident, start to finish")
stages = [
    ("Fault", "A station or node in the plant keeps stopping. The Operations run starts."),
    ("Diagnosis", "Finds the cause with read-only tools on the plant's data: station logs, the MES database, APIs. Result: repeated stops and a 0.3 chance of another in 4 hours. Confidence 70%."),
    ("Verifier", "Recomputes the numbers from the same data. They match, so the diagnosis stands. No hard limit is broken."),
    ("Planner", "Proposes three actions: inspect the station, schedule maintenance, cap its speed at 70%."),
    ("Warden", "Scores each action 0 to 100 from six factors: undo, reach, limits, evidence, history, plant state. Inspect (88) and maintenance (84) reach the threshold of 80 and run alone. The speed cap (74) is between 40 and 80, so a person decides."),
    ("Approval", "The plant owner approves in the app. The change runs in the simulator, about 30 s after the alert. Every step is in the log."),
]
widths = [1.3, 1.7, 1.3, 1.3, 2.0, 1.4]
card(s, 0.55, 1.57, 8.9, 0.05, fill=BLUE, name="timeline")
x = 0.3
for i, ((h, t), w) in enumerate(zip(stages, widths)):
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + w / 2 - 0.165), Inches(1.43), Inches(0.33), Inches(0.33))
    dot.name = "timeline dot"
    dot.fill.solid(); dot.fill.fore_color.rgb = rgb(BLUE); dot.line.fill.background()
    tf = dot.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.paragraphs[0].alignment = PP_ALIGN.CENTER
    rr = tf.paragraphs[0].add_run(); rr.text = str(i + 1); font(rr, 12, True, "FFFFFF")
    card(s, x, 1.95, w, 2.85, name="stage card")
    text(s, x + 0.05, 2.0, w - 0.1, 0.5, [{"t": h, "size": 12, "bold": True, "color": BLUE}], name="stage title")
    text(s, x + 0.05, 2.4, w - 0.1, 2.4, [{"t": t, "size": 12}], name="stage text")
    x += w + 0.08
text(s, 0.3, 4.85, 9.4, 0.35, [{"t": "Taken from a recorded run. Every step is in the audit log.", "size": 12, "color": MUTED}], name="caption")

# ------------------------------------------------------------------ 8. screens (wireframes slot)
s = S[7]
set_title(s, "Appendix: an Operations run and the Warden gate")
pic(s, A("operations_run.png"), 0.3, 1.15, 5.0, 3.3, name="Operations screen")
pic(s, A("warden_gate.png"), 5.45, 1.15, 4.25, 3.3, name="Warden gate screen")
caption(s, 0.3, 4.5, 5.0, "An Operations run: cause, check, scored fixes, and Approve or Reject.", 0.65)
caption(s, 5.45, 4.5, 4.25, "The Warden gate: every rule an action must meet.", 0.65)
text(s, 0.3, 5.1, 9.4, 0.3, [{"t": "These are screens of the running prototype, not sketches.", "size": 12, "color": MUTED}], name="note")

# ------------------------------------------------------------------ 9. architecture: the methodology and incident flow
# sizes: 14 box titles, 18 equations, 28 metric numbers; 11 and 10.5 for the small notes, so the eye goes to the flow first
s = S[8]
set_title(s, "Architecture diagram of the proposed solution")
text(s, 0.3, 1.08, 4, 0.26, [{"t": "Once, at setup", "size": 11, "color": AMBER, "font": MATH}], name="lane label")
flow_box(s, 0.3, 1.36, 2.2, 0.8, "Documents and data", "MES, ERP, MQTT, MCP", BLUE, ts=14, ss=10.5)
flow_arrow(s, 2.52, 1.76, 2.9, 1.76, BLUE)
flow_box(s, 2.92, 1.36, 2.6, 0.8, "Symbiotic Compiler", "Reader, Scout, Modeler", BLUE, fill="E8F0FE", ts=14, ss=10.5)
flow_arrow(s, 5.54, 1.76, 5.92, 1.76, BLUE)
flow_box(s, 5.94, 1.36, 2.3, 0.8, "Knowledge graph", "each edge keeps its quote", BLUE, ts=14, ss=10.5)
text(s, 8.32, 1.36, 1.4, 0.8, [{"t": "An edge counts only if seen in runtime data.", "size": 10.5, "color": MUTED, "font": MATH}], anchor=MSO_ANCHOR.MIDDLE, name="graph rule")
text(s, 0.3, 2.3, 4, 0.26, [{"t": "When a station fails", "size": 11, "color": GREEN, "font": MATH}], name="lane label")
steps8 = [("Alert", GREEN, "E6F4EA"), ("Diagnosis", GREEN, "E6F4EA"), ("Verifier", GREEN, "E6F4EA"), ("Planner", GREEN, "E6F4EA"), ("Warden", RED, "FCE8E6"), ("Action Broker", GREEN, "E6F4EA")]
for i, (t8, c8, f8) in enumerate(steps8):
    x8 = 0.3 + i * 1.59
    flow_box(s, x8, 2.6, 1.45, 0.62, t8, None, c8, f8, ts=14)
    if i < 5:
        flow_arrow(s, x8 + 1.47, 2.91, x8 + 1.57, 2.91, MUTED)
flow_arrow(s, 7.4, 2.17, 7.4, 2.58, BLUE, dash=True)
text(s, 7.5, 2.2, 2.2, 0.28, [{"t": "limits and reach", "size": 10.5, "color": MUTED, "font": MATH}], name="graph feed")
# the two equations: large, each with one small line under it
text(s, 0.3, 3.5, 4.5, 0.5, [{"t": "F(c) = (1/K) Σₚ sₚ(c) / maxₖ sₚ(k)", "size": 18, "bold": True, "color": INK, "font": MATH}], name="equation fusion")
text(s, 0.3, 3.98, 4.5, 0.3, [{"t": "Metric, trace and log probes fused into one ranking of causes.", "size": 10.5, "color": MUTED}], name="equation caption")
pill = [("Alone: S ≥ 80", GREEN, "E6F4EA"), ("Approve: 40 to 79", AMBER, "FEF7E0"), ("Refused: S < 40", RED, "FCE8E6")]
for i, (t8, c8, f8) in enumerate(pill):
    x8 = 5.0 + i * 1.575
    flow_box(s, x8, 3.42, 1.55, 0.42, t8, None, c8, f8, name="decision", ts=12)
text(s, 5.0, 3.9, 4.7, 0.5, [{"t": "S = Σᵢ 100 · wᵢ · vᵢ", "size": 18, "bold": True, "color": INK, "font": MATH}], name="equation warden")
text(s, 5.0, 4.33, 4.7, 0.3, [{"t": "Six factors. A broken hard limit blocks at any score.", "size": 10.5, "color": MUTED}], name="equation caption")
mets = [("+0.08", GREEN, "Avg@5 over BARO, public software benchmark (RCAEval)"), ("32%", BLUE, "of 465 benchmark incidents (RCAEval) run alone"), ("~30 s", BLUE, "failed station to scored plan, median of 7 local runs")]
for i, (n8, c8, l8) in enumerate(mets):
    x8 = 0.3 + i * 3.17
    card(s, x8, 4.72, 3.05, 0.66, name="metric card")
    text(s, x8 + 0.05, 4.72, 1.2, 0.66, [{"t": n8, "size": 24, "bold": True, "color": c8, "align": PP_ALIGN.CENTER}], anchor=MSO_ANCHOR.MIDDLE, name="metric number")
    text(s, x8 + 1.25, 4.72, 1.78, 0.66, [{"t": l8, "size": 10.5, "color": MUTED}], anchor=MSO_ANCHOR.MIDDLE, name="metric label")
text(s, 0.3, 4.33, 4.5, 0.28, [{"t": "Runs on Cloud Run, Vertex AI and Firebase.", "size": 10.5, "color": MUTED}], name="runs on")

# ------------------------------------------------------------------ 10. technologies
s = S[9]
set_title(s, "Technologies to be used in the solution")
tech = [
    ("Google Cloud", BLUE, ["Gemini on Vertex AI (Gemini 2.5 Flash and the flash-lite family)", "Cloud Run, one always-on instance", "Firebase Authentication (Google, email, guest)", "Cloud Build and Artifact Registry"]),
    ("Agents and safety", BLUE, ["Foreman agent runner, Gemini function calling", "Cedar policy language, default deny", "Model Context Protocol (hub and client)", "Rule-driven Warden and Sentinel"]),
    ("Data and connectors", BLUE, ["DuckDB lake, dlt loaders", "SQLAlchemy: PostgreSQL, MySQL, SQL Server, Oracle", "pymongo, MQTT, Kafka, OPC UA (asyncua)", "Encrypted vault for passwords"]),
    ("Web", BLUE, ["Next.js 16 and React 19", "2D and 3D floor-plan viewer", "three.js, React Flow", "FastAPI backend"]),
]
for i, (h, c, items) in enumerate(tech):
    r, cc = divmod(i, 2)
    x, y = 0.3 + cc * 4.75, 1.15 + r * 1.75
    card(s, x, y, 4.65, 1.67, name="technology card")
    text(s, x + 0.1, y + 0.04, 4.4, 0.3, [{"t": h, "size": 12, "bold": True, "color": c}], name="technology title")
    text(s, x + 0.1, y + 0.36, 4.45, 1.3, [{"t": t, "size": 12, "bullet": True, "after": 2} for t in items], name="technology text")
banner(s, 4.72, "Gemini is called through one gateway: a daily cap, model rotation when a model is busy, recorded answers as a fallback, and a visible notice when Gemini is under load.", 0.68)

# ------------------------------------------------------------------ 11. cost
s = S[10]
set_title(s, "Estimated implementation cost (optional)")
rows = [
    ["Cloud Run", "Web app and API. Today: 1 instance. Production: 3 instances in different zones.", "~$120", "~$380"],
    ["Gemini on Vertex AI", "About $0.02 for each incident. 20 incidents a day today, 200 in production, plus onboarding.", "~$11", "~$140"],
    ["Database", "Cloud SQL with high availability: 4 vCPU, 16 GB, 200 GB. Today: files and DuckDB in the container.", "$0", "~$500"],
    ["Network and security", "Load balancer, Cloud Armor, and VPN links to the plant networks.", "$0", "~$190"],
    ["Logs, storage, build", "Audit logs, monitoring, backups, secrets, and one build for each deploy.", "~$2", "~$85"],
    ["One month", "Production is about $130 for each plant.", "~$135", "~$1,300"],
]
sh = table(s, 0.3, 1.12, 9.4, rows, [1.75, 4.55, 1.35, 1.75], ["Item", "What it covers", "Pilot, 1 plant", "Production, 10 plants"], size=12, rh=0.54, name="cost table")
for c in sh.table.rows[len(rows)].cells:
    for para in c.text_frame.paragraphs:
        for r in para.runs:
            r.font.bold = True
            r.font.name = HEAD
            r.font.color.rgb = rgb(BLUE)
text(s, 0.3, 4.95, 9.4, 0.5, [{"t": "Estimate at list prices, in US dollars. It leaves out people, a support plan and licences. Gemini: about 3,000 input and 500 output tokens for each call.", "size": 12, "color": MUTED}], name="cost note")

# ------------------------------------------------------------------ 12. snapshots
s = S[11]
set_title(s, "Snapshots of the prototype")
pic(s, A("floor_3d.png"), 0.3, 1.2, 4.65, 3.2, name="Floor in 3D")
caption(s, 0.3, 4.45, 4.65, "The same plant in 3D, with its data flows", 0.4)
pic(s, A("floor_plan.png"), 5.05, 1.2, 4.65, 3.2, name="Floor in 2D")
caption(s, 5.05, 4.45, 4.65, "The demo plant in 2D: data feeds, name tags and the status panel", 0.65)

# ------------------------------------------------------------------ 13. how the product performs
s = S[12]
set_title(s, "How the product performs")
tile(s, 0.3, 1.15, 2.1, 1.35, "~30 s", "failed station to scored plan, median of 7 local runs")
tile(s, 2.5, 1.15, 2.1, 1.35, "~9", "Gemini calls per incident, one measured run")
tile(s, 4.7, 1.15, 3.0, 1.35, "12 / 4 / 0", "actions run alone / sent for approval / blocked (16 actions, 7 demo incidents)")
tile(s, 7.8, 1.15, 1.9, 1.35, "0.2 s", "a read-only MCP tool call, measured locally", color=GREEN)
card(s, 0.3, 2.62, 4.6, 2.7, name="checks card")
text(s, 0.4, 2.66, 4.4, 2.62, [
    {"t": "Checks that pass today", "size": 12, "bold": True, "color": BLUE, "after": 4},
    {"t": "12 automated suites: policy, agents, Sentinel, probes, connectors, vault, MCP.", "size": 12, "bullet": True, "after": 3},
    {"t": "PostgreSQL, MQTT and MongoDB connected live, loading only what is new.", "size": 12, "bullet": True, "after": 3},
    {"t": "A remote MCP server: a read-only tool runs, an acting tool is denied.", "size": 12, "bullet": True, "after": 3},
    {"t": "Not yet tested live: MySQL, SQL Server, Oracle, Kafka, OPC UA.", "size": 12, "bullet": True, "color": MUTED},
], name="checks text")
card(s, 5.05, 2.62, 4.65, 1.4, fill="E8F0FE", name="research card")
text(s, 5.15, 2.65, 4.45, 1.55, [
    {"t": "Research result", "size": 12, "bold": True, "color": BLUE, "after": 3},
    {"t": "Root-cause ranking on a public software benchmark (RCAEval RE1, 298 cases): +0.08 Avg@5 over BARO, 95% interval +0.05 to +0.12. No Gemini in this test.", "size": 12},
], name="research text")
text(s, 5.05, 4.5, 4.65, 0.8, [{"t": "Figures come from the running prototype on one computer. Gemini's speed varies with load; the app then shows a notice.", "size": 12, "color": MUTED}], name="measure note")

# ------------------------------------------------------------------ research numbers, read from bench/results/research.json
R = json.load(open(os.path.join(HERE, "..", "bench", "results", "research.json"), encoding="utf-8"))
RC, AU = R["rca"], R["autonomy"]
BASE = "BARO (official, collapsed to services)"
f2 = lambda v: f"{v:.2f}"
sg = lambda v: f"{v:+.2f}"
PR = RC["paired"]


def ci_row(t):   # (mean, lo, hi, p)
    return f"{sg(t[0])}  [{sg(t[1])}, {sg(t[2])}]"


def style_chart(ch, title, lo=None, hi=None, labels=True, legend=True, numfmt="0.00", fs=12):
    ch.has_title = True
    ch.chart_title.text_frame.text = title
    r = ch.chart_title.text_frame.paragraphs[0].runs[0]
    r.font.size = Pt(fs); r.font.bold = True
    ch.has_legend = legend
    if legend:
        ch.legend.position = XL_LEGEND_POSITION.BOTTOM
        ch.legend.include_in_layout = False
        ch.legend.font.size = Pt(fs)
    va = ch.value_axis
    if lo is not None:
        va.minimum_scale, va.maximum_scale = lo, hi
    va.has_major_gridlines = True
    va.major_gridlines.format.line.color.rgb = rgb(LINE)
    va.tick_labels.font.size = Pt(fs)
    ch.category_axis.tick_labels.font.size = Pt(fs)
    if labels:
        pl = ch.plots[0]
        pl.has_data_labels = True
        pl.data_labels.font.size = Pt(fs)
        pl.data_labels.number_format = numfmt
        pl.data_labels.number_format_is_linked = False


# ------------------------------------------------------------------ 13b. benchmark (main deck)
s = S[28]
set_title(s, "Benchmark: finding the root cause")
cd = CategoryChartData()
cd.categories = ["CPU", "Memory", "Disk", "Delay", "Loss"]
fa = RC["faults"]
cd.add_series("BARO", [fa[k][BASE][0] for k in ("cpu", "mem", "disk", "delay", "loss")])
cd.add_series("Tolerance", [fa[k]["Ours: metric shift"][0] for k in ("cpu", "mem", "disk", "delay", "loss")])
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.3), Inches(1.15), Inches(5.3), Inches(3.35), cd)
gf.name = "RE1 by fault chart"
style_chart(gf.chart, "Avg@5 by fault type, RCAEval RE1", 0.5, 1.0, fs=12)
for ser, col in zip(gf.chart.plots[0].series, ("9AA0A6", BLUE)):
    ser.format.fill.solid(); ser.format.fill.fore_color.rgb = rgb(col)
gf.chart.plots[0].gap_width = 60
tile(s, 5.75, 1.15, 1.95, 1.4, "+0.08", "Avg@5 over BARO, 95% interval +0.05 to +0.12", color=GREEN)
tile(s, 7.8, 1.15, 1.9, 1.4, "298", "cases, 3 systems, 4 fault types")
text(s, 5.75, 2.7, 3.95, 1.85, [
    {"t": "Public software benchmark (RCAEval), not factory data.", "size": 12, "bullet": True, "after": 4},
    {"t": "BARO is the published baseline, run unmodified.", "size": 12, "bullet": True, "after": 4},
    {"t": "Largest gain on packet loss: 0.59 to 0.84.", "size": 12, "bullet": True, "after": 4},
    {"t": "No Gemini in this test.", "size": 12, "bullet": True},
], name="benchmark text")
banner(s, 4.62, "Per-system detail is in the appendix. On Train Ticket the gain is +0.19 against our BARO run (0.66); the BARO paper reports 0.79 for this system.", 0.75, size=12)

# ------------------------------------------------------------------ 14. the safety gate: autonomy against harm
s = S[19]
set_title(s, "Warden keeps irreversible actions with a person")
banner(s, 1.12, "At the default thresholds (40 and 80), 149 of 465 benchmark incidents (32%) run alone; the rest wait for a person.", 0.62, fill="FCE8E6", color=RED, size=14)
cd = CategoryChartData()
pts = AU["curves"]["Warden score"]
cd.categories = [str(p["coverage"]) for p in pts]
for m, lab in (("Diagnosis confidence only", "Confidence only"), ("Warden score", "Warden gate"), ("Random order", "Random")):
    cd.add_series(lab, [round(p["harm"], 2) for p in AU["curves"][m]])
gf = s.shapes.add_chart(XL_CHART_TYPE.LINE, Inches(0.3), Inches(1.75), Inches(5.1), Inches(2.65), cd)
gf.name = "harm chart"
style_chart(gf.chart, "Harm grows as more is run alone", None, None, labels=False)
va = gf.chart.value_axis
va.has_title = True
va.axis_title.text_frame.text = "Harm"
va.axis_title.text_frame.paragraphs[0].runs[0].font.size = Pt(12)
ca = gf.chart.category_axis
skip = etree.SubElement(ca._element, "{http://schemas.openxmlformats.org/drawingml/2006/chart}tickLblSkip")
skip.set("val", "2")
nm = ca._element.find("{http://schemas.openxmlformats.org/drawingml/2006/chart}noMultiLvlLbl")
if nm is not None:
    ca._element.remove(skip)
    nm.addprevious(skip)
ca.has_title = True
ca.axis_title.text_frame.text = "Share run alone (%)"
ca.axis_title.text_frame.paragraphs[0].runs[0].font.size = Pt(12)
for ser, col in zip(gf.chart.plots[0].series, ("80868B", RED, "BDC1C6")):
    ser.format.line.color.rgb = rgb(col)
    ser.format.line.width = Pt(2.5)
    ser.smooth = False
    ser.marker.style = XL_MARKER_STYLE.NONE
AT = AU["at"]
rows = [["Run all alone", AT["Always run alone"]["run_alone"], AT["Always run alone"]["wrong"], f"{AT['Always run alone']['harm']:.1f}"],
        ["Random 149", AT["Random order"]["run_alone"], AT["Random order"]["wrong"], f"{AT['Random order']['harm']:.1f}"],
        ["Confidence only", AT["Diagnosis confidence only"]["run_alone"], AT["Diagnosis confidence only"]["wrong"], f"{AT['Diagnosis confidence only']['harm']:.1f}"],
        ["Warden gate", AT["Warden score"]["run_alone"], AT["Warden score"]["wrong"], f"{AT['Warden score']['harm']:.1f}"]]
text(s, 5.55, 1.78, 4.15, 0.55, [{"t": "465 incidents from a public software benchmark (RCAEval)", "size": 12, "bold": True, "color": BLUE}], name="table title")
table(s, 5.55, 2.4, 4.15, rows, [1.45, 1.05, 0.8, 0.85], ["Policy", "Run alone", "Wrong", "Harm"], size=12, rh=0.38, name="autonomy table")
card(s, 0.3, 4.45, 9.4, 0.95, fill=CARD, name="caveat card")
text(s, 0.4, 4.45, 9.2, 0.95, [{"t": "Warden lets more wrong diagnoses run alone (29) than confidence alone (19), but only actions that can be undone, so harm stays at zero. Harm is weighted by our action table's reversibility values, so low harm partly follows from the gate's design. The chart shows how much autonomy that costs.", "size": 12}], anchor=MSO_ANCHOR.MIDDLE, name="caveat text")

# ------------------------------------------------------------------ 15. future development
s = S[13]
set_title(s, "Additional Details/Future Development (if any)")
fut = [
    ("A pilot with a real plant", "Replace the replayed lab log and software incidents with a customer's own history."),
    ("Tune Gemma for Sentinel", "Gemini sorts short texts into labels today. We plan to fine-tune Gemma for that one classification job, with plain rules still judging the result."),
    ("Reach private plant networks", "Probes or a tunnel so a cloud copy can read systems inside a factory network."),
    ("Write actions behind Warden", "Let remote MCP tools act, only through the gate and with a person's approval."),
    ("More live checks", "Test Kafka, Oracle, SQL Server, MySQL and OPC UA against live servers. Add roles for approvers and many plants per owner."),
]
for i, (h, d) in enumerate(fut):
    y = 1.15 + i * 0.84
    card(s, 0.3, y, 9.4, 0.78, name="future row")
    text(s, 0.4, y + 0.02, 2.75, 0.74, [{"t": h, "size": 12, "bold": True, "color": BLUE}], anchor=MSO_ANCHOR.MIDDLE, name="future item")
    text(s, 3.2, y + 0.02, 6.4, 0.74, [{"t": d, "size": 12}], anchor=MSO_ANCHOR.MIDDLE, name="future text")

# ------------------------------------------------------------------ 16. links
s = S[14]
box = next(sh for sh in s.shapes if sh.has_text_frame and "Provide links" in sh.text_frame.text)
for p in box.text_frame.paragraphs:
    t = "".join(r.text for r in p.runs)
    add = {"GitHub Public Repository": ": https://github.com/shreyash-sharma/tolerance",
           "Demo Video Link": ": ",
           "Final Product Link": ": https://tolerance-749288317336.asia-southeast1.run.app"}
    for k, v in add.items():
        if t.strip().startswith(k):
            p.runs[-1].text = p.runs[-1].text + v
            if k == "Demo Video Link":
                base = p.runs[-1]
                r = copy.deepcopy(base._r)
                p._p.insert(list(p._p).index(base._r) + 1, r)
                nr = _Run(r, p)
                nr.text = "[FILL: demo video URL]"
                nr.font.bold = True
                nr.font.color.rgb = rgb(FILLRED)
box.height = Inches(1.9)
text(s, 0.35, 2.7, 4, 0.3, [{"t": "How to try it", "size": 12, "bold": True, "color": MUTED}], name="row label")
for i, (n, t) in enumerate([("1", "Open the final product link."), ("2", "Sign in with your Google ID. Or Register, or Try it as a guest. A guest gets a private plant with usage caps."), ("3", "Give a plant name and drop documents, or load the made-up plant that has MES, MongoDB, ERP and IoT data.")]):
    x = 0.35 + i * 3.14
    card(s, x, 3.05, 3.0, 1.9, name="try step")
    text(s, x + 0.1, 3.1, 0.6, 0.5, [{"t": n, "size": 24, "bold": True, "color": BLUE}], name="step number")
    text(s, x + 0.1, 3.65, 2.8, 1.25, [{"t": t, "size": 12}], name="step text")
FILLS.append(("Links", "demo video URL"))

# ================================================================== appendix (after "Thank you")
# A1. root-cause ranking detail
s = S[20]
set_title(s, "Appendix: Root-cause ranking detail (RCAEval RE1)")
cd = CategoryChartData()
cd.categories = ["CPU", "Memory", "Disk", "Delay", "Loss"]
fa = RC["faults"]
cd.add_series("BARO", [fa[k][BASE][0] for k in ("cpu", "mem", "disk", "delay", "loss")])
cd.add_series("Tolerance", [fa[k]["Ours: metric shift"][0] for k in ("cpu", "mem", "disk", "delay", "loss")])
gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.3), Inches(1.15), Inches(5.0), Inches(3.45), cd)
gf.name = "RE1 by fault chart"
style_chart(gf.chart, "Avg@5 by fault type, RCAEval RE1", 0.5, 1.0, fs=12)
for ser, col in zip(gf.chart.plots[0].series, ("9AA0A6", BLUE)):
    ser.format.fill.solid(); ser.format.fill.fore_color.rgb = rgb(col)
gf.chart.plots[0].gap_width = 60
rows = [[n.replace("RE1 ", ""), PR[n]["n"], ci_row(PR[n]["Ours: metric shift"])] for n in ("RE1 all", "RE1 Train Ticket", "RE1 Online Boutique", "RE1 Sock Shop")]
text(s, 5.45, 1.15, 4.25, 0.55, [{"t": "Difference from BARO, Avg@5 (95% interval)", "size": 12, "bold": True, "color": BLUE}], name="table title")
table(s, 5.45, 1.7, 4.25, rows, [1.45, 0.45, 2.35], ["Subset", "n", "Tolerance minus BARO"], size=12, rh=0.34, name="RE1 paired table")
text(s, 5.45, 3.5, 4.25, 1.15, [
    {"t": "BARO is already at 0.96 on Sock Shop, so there is little room.", "size": 12, "bullet": True, "after": 3},
    {"t": "Packet loss gains most by fault: 0.59 to 0.84.", "size": 12, "bullet": True, "after": 3},
    {"t": "Pooled rows use the four faults the BARO paper reports.", "size": 12, "bullet": True, "color": MUTED},
], name="reading")
banner(s, 4.72, "Pooled: +0.08 Avg@5 over BARO (interval +0.05 to +0.12). Train Ticket: +0.19 against our BARO run (0.66); the BARO paper reports 0.79 for this system.", 0.68)

# A2. what the results cover and the next tests
s = S[21]
set_title(s, "Appendix: What the results cover, and the next tests")
card(s, 0.3, 1.15, 4.65, 3.3, fill="E8F0FE", name="threats card")
text(s, 0.4, 1.2, 4.45, 3.2, [
    {"t": "What the results cover", "size": 12, "bold": True, "color": BLUE, "after": 5},
    {"t": "Software incidents on RCAEval. A factory pilot is the next step.", "size": 12, "bullet": True, "after": 4},
    {"t": "The probes were developed on these cases, so RE2 is the held-out test.", "size": 12, "bullet": True, "after": 4},
    {"t": "Harm uses the action table's reversibility values, not measured damage.", "size": 12, "bullet": True, "after": 4},
    {"t": "The backtest uses the metrics-first diagnosis, not Gemini.", "size": 12, "bullet": True, "after": 4},
    {"t": "Our run of BARO on Train Ticket is 0.65; the paper reports 0.79.", "size": 12, "bullet": True},
], name="threats text")
card(s, 5.05, 1.15, 4.65, 3.3, fill="E6F4EA", name="next card")
text(s, 5.15, 1.2, 4.45, 3.2, [
    {"t": "What we run next", "size": 12, "bold": True, "color": GREEN, "after": 5},
    {"t": "RCAEval RE2 (270 cases), the paper's main table, as a held-out test.", "size": 12, "bullet": True, "after": 4},
    {"t": "The Gemini agent on RE3, where log text should matter, inside the credit budget.", "size": 12, "bullet": True, "after": 4},
    {"t": "The other baselines (CIRCA, RCD, CausalRCA) once their dependencies fit.", "size": 12, "bullet": True, "after": 4},
    {"t": "A customer's own incident history replayed through Warden.", "size": 12, "bullet": True},
], name="next text")
banner(s, 4.55, "Reproduce it: python -m bench.research reads the per-case rankings in bench/results and the 465 benchmark incidents (RCAEval) in seed. No downloads, runs in seconds.", 0.8)

# A2b. research background
s = S[29]
set_title(s, "Appendix: from industrial RCA research to evidence-first agents")
card(s, 0.3, 1.15, 4.65, 2.55, name="research card")
text(s, 0.4, 1.18, 4.45, 2.5, [
    {"t": "Earlier research", "size": 12, "bold": True, "color": BLUE, "after": 3},
    {"t": "A study of root-cause recommendation using structured incident metadata and machine-learning methods.", "size": 12, "after": 5},
    {"t": [("8,128 ", {"bold": True, "color": BLUE}), ("historical EV incident records studied.", {})], "size": 12, "after": 5},
    {"t": "Structured priors proved competitive with more complex models.", "size": 12, "after": 5},
    {"t": [("Status: ", {"bold": True}), ("accepted at ICCIS 2026 (International Conference on Communication and Intelligent Systems, BITS Pilani, Goa) for Springer's Lecture Notes in Networks and Systems. Awaiting print.", {})], "size": 12},
], name="research text")
card(s, 5.05, 1.15, 4.65, 2.55, fill="E8F0FE", name="design card")
text(s, 5.15, 1.18, 4.45, 2.15, [
    {"t": "Tolerance's design", "size": 12, "bold": True, "color": BLUE, "after": 3},
    {"t": "An independent agentic system that connects operational knowledge to evidence-backed diagnosis and controlled remediation.", "size": 12, "after": 5},
    {"t": "Structured evidence first", "size": 12, "bullet": True, "after": 2},
    {"t": "Gemini for investigation", "size": 12, "bullet": True, "after": 2},
    {"t": "Deterministic safety checks", "size": 12, "bullet": True},
], name="design text")
card(s, 0.3, 3.8, 9.4, 0.85, fill="E6F4EA", name="insight card")
text(s, 0.4, 3.8, 9.2, 0.85, [
    {"t": [("Research insight. ", {"bold": True, "color": GREEN}), ("Not every industrial fault needs a complex neural network. Structured knowledge can provide strong diagnostic signals. Agentic reasoning can then investigate missing evidence and support controlled decisions.", {})], "size": 12},
], anchor=MSO_ANCHOR.MIDDLE, name="insight text")
text(s, 0.3, 4.72, 9.4, 0.65, [{"t": "Prior research and the Tolerance prototype are separate implementations. The historical dataset and proprietary assets are not part of the submitted system.", "size": 12, "color": MUTED}], name="research note")

# A2c. the agent team
s = S[33]
set_title(s, "The agent team and the services around it")
pic(s, A("agent_team.png"), 0.3, 1.2, 6.0, 3.4, border=True, name="Architecture diagram")
text(s, 6.45, 1.15, 3.3, 4.2, [
    {"t": "How it fits together", "size": 12, "bold": True, "color": BLUE, "after": 5},
    {"t": [("Cloud Run: ", {"bold": True}), ("one container with the web app and the API.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Foreman (our agent runner): ", {"bold": True}), ("runs the nine agents and records every step.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Gemini on Vertex AI: ", {"bold": True}), ("writes the words, reads answers, picks tools.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Cedar (open-source policy language): ", {"bold": True}), ("default deny. Nothing reaches a machine except through it.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("MCP hub: ", {"bold": True}), ("built-in and your own servers. Only read-only tools run.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Plant knowledge graph: ", {"bold": True}), ("stations, systems and flows. Each edge keeps its evidence, and counts only if seen in runtime data.", {})], "size": 12, "bullet": True, "after": 4},
    {"t": [("Data lake: ", {"bold": True}), ("DuckDB, kept current by connectors.", {})], "size": 12, "bullet": True},
], name="architecture text")
caption(s, 0.3, 4.7, 6.0, "The agent team: owner, Guide, onboarding and operations agents, shared services, policy gateway and machines.", 0.65)

# A2d. how the numbers work
s = S[34]
set_title(s, "Appendix: how the numbers work")
eqs = [
    ("Warden score", ["S = Σᵢ 100 · wᵢ · vᵢ", "w = 0.25, 0.20, 0.15, 0.25, 0.10, 0.05"], "Six factors, each from 0 to 1: undo, reach, margin to limits, evidence, history, plant state."),
    ("Decision", ["blocked if a hard limit breaks", "refused if S < 40, else approve if S < 80"], "Otherwise the action runs alone. The owner can change 40 and 80."),
    ("Factors", ["v(reach) = 1 − r · min(1, n/4)", "v(history) = 0.5 + 0.5 (a − j) / (a + j + 2)"], "n = stations downstream, a and j = past approvals and rejections."),
    ("Metric-shift probe", ["score = ln(1 + min(d/σ, 60)) + d/range", "σ = max(1.4826 MAD, 0.5 IQR, 0.02 |med|, …)"], "d = change of the median after the alert. The robust scale stops noise from winning."),
    ("Fusion and ranking", ["F(c) = (1/K) Σₚ sₚ(c) / maxₖ sₚ(k)", "Avg@5 = ⅕ Σₖ₌₁..₅ AC@k"], "AC@k = share of cases with the true cause in the top k. Intervals: paired bootstrap."),
    ("Harm and learning", ["H = (1 − y)(1 − rev)", "reward = 1[correct] − λ · tool calls"], "A wrong action costs more when it is hard to undo. A bandit learns which evidence to read first."),
]
for i, (h8, lines, why) in enumerate(eqs):
    r8, c8 = divmod(i, 2)
    x8, y8 = 0.3 + c8 * 4.75, 1.12 + r8 * 1.4
    card(s, x8, y8, 4.65, 1.34, name="equation card")
    text(s, x8 + 0.1, y8 + 0.03, 4.45, 1.3, [
        {"t": h8, "size": 14, "bold": True, "color": BLUE, "after": 2},
        {"t": lines[0], "size": 12, "font": MATH, "bold": True, "after": 0},
        {"t": lines[1], "size": 12, "font": MATH, "bold": True, "after": 2},
        {"t": why, "size": 12, "color": MUTED},
    ], name="equation text")

# ---- the agent cards (from the web deck's appendix)
raw = open(os.path.join(HERE, "..", "web", "components", "deck", "agentsData.ts"), encoding="utf-8").read()
AG = {a["id"]: a for a in json.loads(raw[raw.index("= [") + 2: raw.rindex("];") + 1])}
MODE = {"model-driven": "Model-driven", "rule-driven": "Rule-driven", "mixed": "Model and rules"}
EXTRA = [
    {"name": "Playbooks", "mode": "rule-driven", "use_case": "Each plant reacts to a failure in its own way.",
     "solution": "The owner draws a trigger, checks, a decision and actions on a canvas. Code walks it. Warden scores any action that changes the plant.",
     "outcomes": ["A trace of every block", "Actions scored by Warden"], "forbidden": ["Skip Warden for an action that changes the plant"]},
    {"name": "Channels", "mode": "rule-driven", "use_case": "A person who is not in the app must still know when to approve.",
     "solution": "Warden messages Slack, Teams, Discord, Telegram or a webhook. Addresses stay on the server. Private addresses are refused.",
     "outcomes": ["Approval requests", "Blocked actions", "Failing rules"], "forbidden": ["Send to a private network address", "Show an address back in the app"]},
    {"name": "Layout editor", "mode": "rule-driven", "use_case": "The drawn floor is never exactly right.",
     "solution": "A node canvas next to the live floor: move, add and delete stations, rename them, and draw how parts flow. Every change is saved at once and the plan and 3D view follow.",
     "outcomes": ["Moved, added or deleted stations", "Part flows between stations"], "forbidden": ["Change data or limits"]},
]
AG["warden"] = dict(AG["warden"], solution=AG["warden"]["solution"].replace("The user sets a floor and a limit.", "The user sets two score thresholds, 40 and 80 by default."))
SENT = dict(AG["sentinel"])
SENT["solution"] = "Plain rules check a field against a value on your data tables, a web address, a port, a service or a certificate. A schedule runs them, maintenance windows keep planned work quiet, and an impact map shows which stations lose data. A rule that fails or recovers tells your channels."
SENT["forbidden"] = ["Write to the plant", "Let a model say pass or fail", "Reach a private network address"]
SENT["outcomes"] = ["Pass or fail for each rule", "The stations that lose data", "A message when a rule fails or recovers"]
def agent_card(slide, a, x, y, w, h, pt=10):
    card(slide, x, y, w, h, name="agent card")
    text(slide, x + 0.1, y + 0.04, w - 1.9, 0.3, [{"t": a["name"], "size": 14, "bold": True, "color": BLUE}], name="agent name")
    mode = MODE.get(a.get("mode"), a.get("mode", ""))
    text(slide, x + w - 1.85, y + 0.08, 1.75, 0.26, [{"t": mode + " · Gemini" if a.get("gemini_use", "None").lower() not in ("none", "none.") else mode, "size": 10, "color": MUTED, "align": PP_ALIGN.RIGHT}], name="agent mode")
    out = " · ".join(a["outcomes"])
    nev = "; ".join(a["forbidden"])
    text(slide, x + 0.1, y + 0.38, w - 0.2, h - 0.4, [
        {"t": [("Use case: ", {"bold": True, "color": BLUE}), (a["use_case"], {})], "size": pt, "after": 2},
        {"t": [("Solution: ", {"bold": True, "color": AMBER}), (a["solution"], {})], "size": pt, "after": 2},
        {"t": [("Outcomes: ", {"bold": True, "color": GREEN}), (out, {})], "size": pt, "after": 2},
        {"t": [("Must never: ", {"bold": True, "color": RED}), (nev, {})], "size": pt, "color": MUTED},
    ], name="agent text")


def agents_slide(slide, title, cards, h1=2.05, h2=2.05, pt=10):
    set_title(slide, title)
    for i, a in enumerate(cards):
        r, c = divmod(i, 2)
        agent_card(slide, a, 0.3 + c * 4.75, 1.15 if r == 0 else 1.15 + h1 + 0.08, 4.65, h1 if r == 0 else h2, pt)


# A3. the journey
s = S[22]
set_title(s, "Appendix: the journey, from documents to a decision")
pic(s, A("02-demo-journey_crop.png"), 0.3, 1.25, 6.0, 2.55, border=False, name="Journey diagram")
text(s, 6.45, 1.2, 3.3, 4.1, [
    {"t": "Six steps", "size": 12, "bold": True, "color": BLUE, "after": 5},
    {"t": "You provide the documents and name the systems that hold the data.", "size": 12, "bullet": True, "after": 5},
    {"t": "The agents read, connect and compile. You confirm what was understood.", "size": 12, "bullet": True, "after": 5},
    {"t": "The plant is built from the checked facts, in 2D and 3D.", "size": 12, "bullet": True, "after": 5},
    {"t": "When a fault is found, the agents gather evidence. The gate decides: it runs alone, or it asks you.", "size": 12, "bullet": True},
], name="journey text")
text(s, 0.3, 3.95, 6.0, 0.8, [{"t": "Boxes in grey are what you provide, in blue what the agents do, in red a decision.", "size": 12, "color": MUTED}], name="journey note")

# A3b. roles and people
s = S[35]
set_title(s, "Appendix: roles and people, decided by Cedar")
PERMS = ["See the floor and incidents", "Run checks and diagnoses", "Approve or reject a fix", "Change the score thresholds", "Connect systems and probes", "Manage alert channels", "Add people and change roles"]
ROLES = [("Owner", [1, 1, 1, 1, 1, 1, 1]), ("Supervisor", [1, 1, 1, 0, 0, 1, 0]), ("Operator", [1, 1, 0, 0, 0, 0, 0]), ("Viewer", [1, 0, 0, 0, 0, 0, 0])]
rows = [[PERMS[i]] + ["✓" if r[1][i] else "–" for r in ROLES] for i in range(len(PERMS))]
table(s, 0.3, 1.15, 6.5, rows, [2.5, 0.85, 1.25, 1.05, 0.85], ["Permission"] + [r[0] for r in ROLES], size=12, rh=0.4, name="roles table")
text(s, 6.95, 1.12, 2.75, 4.2, [
    {"t": "How it works", "size": 14, "bold": True, "color": BLUE, "after": 5},
    {"t": "One policy engine for agents and for people: Cedar, default deny.", "size": 12, "bullet": True, "after": 5},
    {"t": "The owner adds people and makes new roles on the Team page.", "size": 12, "bullet": True, "after": 5},
    {"t": "Every request is checked on the server, not only hidden on the screen.", "size": 12, "bullet": True, "after": 5},
    {"t": "A tap on Approve in Telegram follows the same rules. Each person links their own Telegram account.", "size": 12, "bullet": True, "after": 5},
    {"t": "The audit log shows who approved, their role and the channel. A refusal is recorded too.", "size": 12, "bullet": True},
], name="roles text")

# A4. the safety gate, limits first and then the score
s = S[23]
set_title(s, "Appendix: the safety gate, limits first and then the score")
pic(s, A("03-safety-gate_crop.png"), 0.3, 1.2, 4.5, 4.0, border=False, name="Safety gate diagram")
text(s, 4.95, 1.15, 4.8, 4.2, [
    {"t": "Why this order", "size": 12, "bold": True, "color": BLUE, "after": 5},
    {"t": "A hard limit from your documents comes first. A score never overrides it.", "size": 12, "bullet": True, "after": 4},
    {"t": "Warden then scores the action from 0 to 100 on six factors: can it be undone, how much it touches, distance from the limits, strength of the evidence, what people approved before, and the state of the plant.", "size": 12, "bullet": True, "after": 4},
    {"t": "You set two score thresholds: 40 and 80 by default. Below 40 it is refused. From 40 to 79 you approve. From 80 it runs by itself.", "size": 12, "bullet": True, "after": 4},
    {"t": "You see what the thresholds would have done on 465 incidents from a public software benchmark (RCAEval) before you trust them.", "size": 12, "bullet": True},
], name="gate text")

# A5, A6, A7. the agents, four cards on each slide
agents_slide(S[24], "Appendix: the onboarding team", [AG["guide"], AG["reader"], AG["scout"], AG["modeler"]], 2.45, 1.7, 10)
agents_slide(S[25], "Appendix: the operations team", [AG["diagnosis"], AG["verifier"], AG["planner"], AG["warden"]], 2.05, 2.05, 10)
agents_slide(S[26], "Appendix: plain rules, playbooks, channels, layout editor", [SENT, EXTRA[0], EXTRA[1], EXTRA[2]], 2.36, 1.76, 9.5)

# ------------------------------------------------------------------ order: main deck (16), Thank you, appendix
el = {n: next(e for e in ids if prs.part.related_part(e.rId) is S[n].part) for n in S if n not in (2, 15)}
order = [1, 3, 17, 4, 33, 5, 6, 18, 8, 9, 10, 12, 28, 19, 13, 14] + [16] + [20, 21, 29, 34, 22, 35, 23, 24, 25, 26, 11]
for e in list(ids):
    ids.remove(e)
for n in order:
    ids.append(el[n])
assert len(order) - 12 == 16
for n in el:
    if n not in order:   # slides that are no longer used leave the package
        prs.part.drop_rel(el[n].rId)

prs.save(OUT)
print("saved", OUT, len(order), "slides")
for i, (where, what) in enumerate(FILLS):
    print("FILL:", where, "-", what)
