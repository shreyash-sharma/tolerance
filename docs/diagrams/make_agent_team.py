"""Draws docs/diagrams/04-agent-team.svg: the Tolerance agent team as a flat architecture schematic.
Owner and Guide on the left, the two agent teams in the middle, the shared services on the right, the connectors and the machines below.
Run:  python docs/diagrams/make_agent_team.py     (also copies the file to web/public/deck/diagrams/)"""
import html, os, shutil, textwrap

W, H = 1600, 900
BG, CARD, EDGE, TEXT, MUTE = "#0f1115", "#181b22", "#2f3642", "#e9ecef", "#9aa3ad"
AMBER, MINT, BLUE, VIOLET, RED = "#f2b84b", "#9fe6bf", "#8fb4ff", "#c9a6ff", "#ef6b57"
ICONS = {
    "person": "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6",
    "chat": "M4 5h16v11H9l-5 4z M8 9h8 M8 12h5",
    "file": "M7 3h7l4 4v14H7z M14 3v4h4 M9 12h6 M9 16h6",
    "plug": "M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4",
    "map": "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14",
    "search": "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5",
    "check": "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4",
    "list": "M5 6h14 M5 12h14 M5 18h9 M3 6h.01 M3 12h.01 M3 18h.01",
    "shield": "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z",
    "eye": "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    "db": "M5 6c0-2 14-2 14 0v12c0 2-14 2-14 0z M5 12c0 2 14 2 14 0",
    "factory": "M3 20V10l6 3V10l6 3V6h6v14z M7 20v-3 M12 20v-3 M17 20v-3",
    "spark": "M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z",
    "gear": "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2",
}
out = []
add = out.append


def esc(t):
    return html.escape(t, quote=False)


def icon(name, x, y, size, color, sw=1.7):
    s = size / 24
    add(f'<g transform="translate({x},{y}) scale({s})" fill="none" stroke="{color}" stroke-width="{sw / s * 0.9:.2f}" stroke-linecap="round" stroke-linejoin="round"><path d="{ICONS[name]}"/></g>')


def lines(t, x, y, size, color, width_chars, lh=1.35, weight=400, anchor="start"):
    for i, ln in enumerate(textwrap.wrap(t, width_chars, break_long_words=False)):
        add(f'<text x="{x}" y="{y + i * size * lh:.1f}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}">{esc(ln)}</text>')
    return len(textwrap.wrap(t, width_chars, break_long_words=False))


def chip(x, y, label, color, filled=False, w=None, spark=False):
    w = w or (len(label) * 6.4 + 18 + (14 if spark else 0))
    add(f'<rect x="{x}" y="{y}" width="{w:.0f}" height="22" rx="11" fill="{color if filled else "none"}" fill-opacity="{0.16 if filled else 0}" stroke="{color}" stroke-opacity=".7"/>')
    tx = x + 10 + (14 if spark else 0)
    if spark:
        icon("spark", x + 7, y + 5, 12, color, 1.6)
    add(f'<text x="{tx}" y="{y + 15}" font-size="11" fill="{color}" font-weight="600">{esc(label)}</text>')
    return w


def card(x, y, w, h, name, text, ic, accent, mode, gem=True, nchars=None, name_size=17, stack=False):
    add(f'<g class="card"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{CARD}" stroke="{EDGE}"/>')
    add(f'<rect x="{x}" y="{y}" width="5" height="{h}" rx="2.5" fill="{accent}"/>')
    add(f'<circle cx="{x + 34}" cy="{y + 34}" r="20" fill="{accent}" fill-opacity=".14"/>')
    icon(ic, x + 22, y + 22, 24, accent)
    if stack:
        n = lines(name, x + 18, y + 84, name_size, TEXT, max(8, int((w - 28) / (name_size * 0.56))), 1.2, 700)
        ty = y + 84 + (n - 1) * name_size * 1.2 + 10
    else:
        n = lines(name, x + 64, y + 30, name_size, TEXT, max(8, int((w - 76) / (name_size * 0.56))), 1.2, 700)
        ty = y + 30 + n * name_size * 1.2 - 2
    lines(text, x + 18, ty + 18, 12 if stack else 13, MUTE, nchars or int((w - 34) / 6.6), 1.3 if stack else 1.35)
    cx = x + 16
    cx += chip(cx, y + h - 36, mode, accent, True) + 6
    if gem:   # a narrow card shows only the spark, the wide ones say Gemini
        chip(cx, y + h - 36, "" if stack else "Gemini", VIOLET, False, w=26 if stack else None, spark=True)
    add("</g>")


def arrow(x1, y1, x2, y2, color=MUTE, label=None, lx=None, ly=None, dash=True, mid=None):
    d = f"M{x1},{y1} L{x2},{y2}" if not mid else f"M{x1},{y1} L{mid[0]},{mid[1]} L{x2},{y2}"
    cls = ' class="flow"' if dash else ""
    add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2"{cls} marker-end="url(#ah-{color[1:]})"/>')
    if label:
        add(f'<text x="{lx if lx is not None else (x1 + x2) / 2}" y="{ly if ly is not None else (y1 + y2) / 2 - 8}" font-size="12" fill="{color}" text-anchor="middle" font-weight="600">{esc(label)}</text>')


add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Helvetica, Arial, sans-serif" role="img">')
add('<title>The Tolerance agent team</title><desc>The plant owner talks to the Guide. The Guide runs the onboarding team (Document Reader, Connector Scout, Plant Modeler) and hands failures to the operations team (Diagnosis, Verifier, Remediation Planner, Warden, Sentinel). Eight agents use Gemini on Vertex AI and Sentinel uses plain rules; read the compiled plant model, and reach the machines only through the Cedar policy gateway, MCP connectors and probes.</desc>')
add(f'<defs><style>.flow{{stroke-dasharray:7 6;animation:fl 1.1s linear infinite}}@keyframes fl{{to{{stroke-dashoffset:-26}}}}.card{{animation:glow 8s ease-in-out infinite}}@keyframes glow{{0%,100%{{filter:none}}50%{{filter:drop-shadow(0 0 6px #f2b84b33)}}}}@media (prefers-reduced-motion: reduce){{.flow,.card{{animation:none}}}}</style>')
for c in (MUTE, AMBER, MINT, BLUE, VIOLET, RED):
    add(f'<marker id="ah-{c[1:]}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="{c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker>')
add('<linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8cff"/><stop offset=".5" stop-color="#9b72f2"/><stop offset="1" stop-color="#ee6a8f"/></linearGradient></defs>')
add(f'<rect width="{W}" height="{H}" fill="{BG}"/>')
add(f'<text x="40" y="52" font-size="26" fill="{TEXT}" font-weight="700">Tolerance: the agent team</text><text x="40" y="78" font-size="14" fill="{MUTE}">Nine agents on one gateway. Eight use Gemini; Sentinel uses plain rules. Nothing reaches a machine except through the policy gate.</text>')

# left: owner above the Guide
card(40, 130, 250, 168, "Plant owner", "Drops documents, answers questions, sets the two safety lines.", "person", BLUE, "Human", gem=False)
card(40, 400, 250, 270, "Guide", "Assistant and router. Reads the documents with the owner, asks what is unclear, draws the plant, hands failures to operations.", "chat", AMBER, "Mixed", nchars=29)
arrow(100, 298, 100, 400, BLUE, None)
add(f'<text x="112" y="352" font-size="12" fill="{BLUE}" font-weight="600">Documents, answers</text>')
arrow(262, 400, 262, 298, AMBER, None)
add(f'<text x="268" y="352" font-size="12" fill="{AMBER}" font-weight="600">Questions</text>')

# middle: the two teams inside the Foreman panel
add(f'<rect x="610" y="100" width="650" height="578" rx="20" fill="#13161c" stroke="{EDGE}" stroke-dasharray="6 5"/>')
add(f'<text x="632" y="132" font-size="15" fill="{MUTE}" font-weight="700" letter-spacing="1.4">FOREMAN · THE AGENT LAYER</text>')
add(f'<text x="632" y="166" font-size="13" fill="{AMBER}" font-weight="700" letter-spacing="1">ONBOARDING TEAM</text>')
ox = 632
for i, (n, t, ic) in enumerate([("Document Reader", "Reads documents into facts, each with its exact quote.", "file"), ("Connector Scout", "Says what each connected data source holds.", "plug"), ("Plant Modeler", "Writes the overview and the 2D plan. A person confirms.", "map")]):
    card(ox + i * 204, 180, 192, 190, n, t, ic, AMBER, ["Mixed", "Model", "Mixed"][i])
add(f'<text x="632" y="406" font-size="13" fill="{MINT}" font-weight="700" letter-spacing="1">OPERATIONS TEAM</text>')
oy = 420
for i, (n, t, ic, m) in enumerate([("Diagnosis", "Finds why a station failed, with read-only tools.", "search", "Model"), ("Verifier", "Recomputes every number the diagnosis cites.", "check", "Mixed"), ("Remediation Planner", "Proposes the fix with exact settings.", "list", "Model"), ("Warden", "Scores the fix. Enforces the hard limits.", "shield", "Rules"), ("Sentinel", "Checks your systems and claims with plain rules. No model.", "eye", "Rules")]):
    card(632 + i * 122, oy, 114, 238, n, t, ic, [MINT, MINT, MINT, RED, BLUE][i], m, gem=(n != "Sentinel"), name_size=14, nchars=14, stack=True)
    if i < 3:
        arrow(632 + i * 122 + 114, oy + 119, 632 + (i + 1) * 122, oy + 119, MINT, dash=False)
arrow(290, 500, 610, 270, AMBER, "Read, ask, confirm", 392, 366, mid=(450, 500))
arrow(290, 600, 610, 540, MINT, "Failure alert", 372, 586, mid=(450, 600))

# right: shared services
def service(y, h, name, text, ic, accent, grad=False):
    add(f'<rect x="1320" y="{y}" width="260" height="{h}" rx="14" fill="{CARD}" stroke="{"url(#gem)" if grad else EDGE}" stroke-width="{2 if grad else 1}"/>')
    add(f'<circle cx="1352" cy="{y + 36}" r="20" fill="{accent}" fill-opacity=".14"/>')
    icon(ic, 1340, y + 24, 24, accent)
    n = lines(name, 1384, y + 32, 16, TEXT, 18, 1.2, 700)
    lines(text, 1338, y + 52 + n * 19, 13, MUTE, 33)


service(100, 130, "Gemini on Vertex AI", "Writes the words, reads free-text answers, chooses tools, reviews arguments.", "spark", VIOLET, True)
service(250, 118, "Compiled plant model", "Facts, limits and flows, each with the exact quote it came from.", "db", BLUE)
service(388, 130, "Cedar policy gateway", "Default deny. Reads pass. Every call is logged with who, what and the decision.", "shield", RED)
service(538, 120, "Action Broker", "Applies only what the gate allows, in a simulator. A person approves the rest.", "gear", AMBER)
arrow(1260, 165, 1318, 165, VIOLET, "Ask", 1289, 154)
arrow(1260, 308, 1318, 308, BLUE, "Read", 1289, 297)
arrow(1260, 453, 1318, 453, RED, "Gate", 1289, 442)
arrow(1260, 598, 1318, 598, AMBER, "Act", 1289, 587)

# below: connectors, probes, machines
add(f'<rect x="610" y="700" width="650" height="64" rx="14" fill="{CARD}" stroke="{EDGE}"/>')
icon("plug", 632, 718, 28, MINT)
add(f'<text x="676" y="728" font-size="16" fill="{TEXT}" font-weight="700">MCP connectors and probes</text><text x="676" y="750" font-size="13" fill="{MUTE}">Read-only tools for databases, OPC UA, telemetry and inspection data.</text>')
add(f'<rect x="610" y="806" width="650" height="64" rx="14" fill="{CARD}" stroke="{EDGE}"/>')
icon("factory", 632, 824, 28, BLUE)
add(f'<text x="676" y="834" font-size="16" fill="{TEXT}" font-weight="700">Machines</text><text x="676" y="856" font-size="13" fill="{MUTE}">A real lab machine log, replayed as if live. Actions run in a simulator.</text>')
arrow(935, 764, 935, 806, MUTE, "Read", 960, 790)
arrow(935, 678, 935, 700, RED, "Only through the gate", 1030, 694)

# legend
lx = 40
for label, c in (("Human", BLUE), ("Onboarding agent", AMBER), ("Operations agent", MINT), ("Safety", RED), ("Gemini", VIOLET)):
    add(f'<rect x="{lx}" y="846" width="14" height="14" rx="3" fill="{c}" fill-opacity=".25" stroke="{c}"/><text x="{lx + 22}" y="858" font-size="13" fill="{MUTE}">{label}</text>')
    lx += 24 + len(label) * 7.4 + 20
add(f'<text x="40" y="826" font-size="12" fill="{MUTE}">Mode tags: Model = Gemini drives the step. Rules = plain code, auditable. Mixed = both.</text>')
add("</svg>")

here = os.path.dirname(os.path.abspath(__file__))
svg = "\n".join(out)
open(os.path.join(here, "04-agent-team.svg"), "w", encoding="utf8").write(svg)
dest = os.path.join(here, "..", "..", "web", "public", "deck", "diagrams")
os.makedirs(dest, exist_ok=True)
shutil.copy(os.path.join(here, "04-agent-team.svg"), os.path.join(dest, "04-agent-team.svg"))
print("wrote 04-agent-team.svg", len(svg), "bytes")
