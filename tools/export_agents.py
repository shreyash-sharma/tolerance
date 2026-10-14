"""Writes web/components/deck/agentsData.ts from the agents' own contracts, so the deck always says what the code says.
Run:  python tools/export_agents.py"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from foreman import core, agents, guide   # importing registers the contracts

ORDER = ["guide", "reader", "scout", "modeler", "diagnosis", "verifier", "planner", "warden"]
KEYS = ("id", "name", "team", "job", "use_case", "solution", "outcomes", "gemini_use", "mode", "trust", "forbidden", "tools")
HEAD = ("/* Generated from the agents' own contracts (foreman/agents.py, foreman/guide.py). Regenerate with: python tools/export_agents.py */\n"
        "export type AgentCard = { id: string; name: string; team: string; job: string; use_case: string; solution: string; outcomes: string[]; gemini_use: string; mode: string; trust: string; forbidden: string[]; tools: string[] };\n"
        "export const AGENTS: AgentCard[] = ")
by = {c["id"]: c for c in core.catalog()}
out = [{k: by[i][k] for k in KEYS} for i in ORDER]
with open(os.path.join(ROOT, "web", "components", "deck", "agentsData.ts"), "w", encoding="utf8") as f:
    f.write(HEAD + json.dumps(out, indent=2, ensure_ascii=False) + ";\n")
print(len(out), "agents exported")
