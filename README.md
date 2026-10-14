# Tolerance

**An agentic platform for manufacturing, built around a Symbiotic Compiler.** Google Cloud AI Builder Cup 2026, Manufacturing theme.

A new plant gives Tolerance its name and its documents. Eight agents read them, ask the owner what is unclear, connect to the plant's data, and compile everything into one checked model of the plant. Other agents then diagnose failures, check their own findings, propose fixes, and score how safe each fix is. The owner decides how far the agents may act alone. A hard limit written in the plant's own documents is never crossed, whatever the score.

> Status: working prototype that runs locally. The Cloud Run deployment is scripted (`deploy.sh`, `Dockerfile`, `DEPLOY.md`) and the live address is added here after the first deploy.

## What a person sees

1. **Plant name.** The only question on the first screen. No menu, no panels.
2. **A spark takes over the name.** A glowing spark sweeps across the typed plant name and the letters fill with colour. It lasts about four seconds and can be skipped.
3. **Drop your documents.** A real drag-and-drop area. A sample pack of eight documents is available for people who have none.
4. **The Guide talks with the owner.** It reads the documents, asks which data sources to connect, asks what the plant makes, and settles conflicts between documents, missing stations and hard limits, one question at a time.
5. **The plant, drawn.** Gemini turns the confirmed understanding into a layout, and the Anatomy kit draws it.
6. **A tour.** The menu grows one section at a time: Floor (3D), Operations, Warden, Agents, Probes, Compiled model. The Guide says what each is for, tied to what the plant makes.

Settings has "Show me around" and "Start over".

## The agents (Foreman)

Foreman is the layer that runs the agents: a contract card per agent, a visible record of every step, one policy gateway, and a record and replay for model calls. Every agent uses Gemini in at least one step. Plain code is labelled as such (model-driven, rule-driven, or mixed).

| Agent | Job | Where Gemini is used |
|---|---|---|
| Guide | Talks with the owner and runs onboarding | Writes each message, reads free-text answers, writes the layout and the tour |
| Document Reader | Documents into facts, each with its exact quote | Claim extraction. Code checks every quote against the page. Instructions hidden in documents are removed first |
| Connector Scout | Says what each connected table holds | Names the role of each table from its columns |
| Plant Modeler | Writes the overview and the 2D plan | Writes the overview from the facts only |
| Diagnosis | Finds why a station failed | Chooses read-only tools and writes the diagnosis |
| Verifier | Recomputes every number the diagnosis cites | Reviews the argument. A failed number check cannot be argued away |
| Remediation Planner | Proposes the fix with exact settings | Chooses the action and settings |
| Warden | Scores each action from 0 to 100 | Writes the plain reason. The score itself is rule-driven so it can be audited |

**Warden.** Six factors give the score. The owner sets two lines: below the floor an action is refused, between the lines a person approves it, at or above the limit it may run by itself. Cedar enforces this at the Action Broker. The page shows a backtest on 465 recorded RCAEval incidents, so the owner sees what the lines would have done before trusting them.

## Google Cloud usage

| Google service | Used for | Code |
|---|---|---|
| **Gemini** (Vertex AI when deployed, Google AI Studio on a laptop) | Every agent above, plus the incident investigator with tool use, semantic naming and the chat | `fabric/agents.py` (client, model pool, retry), `foreman/llm.py` (JSON answers, tool loop, record and replay, call ledger), `documents/engine.py`, `foreman/guide.py`, `foreman/agents.py`, `rca/gemini.py`, `compiler/semantics.py`, `interpret/engine.py`, `discover/fingerprint.py`, `workspace/graph.py` |
| **Vertex AI** | Gemini without an API key in the container, using the Cloud Run service account | `fabric/agents.py` (`GOOGLE_GENAI_USE_VERTEXAI`), `deploy.sh` |
| **Cloud Run** | Hosting the backend and the screens | `Dockerfile`, `deploy.sh`, `DEPLOY.md` |
| **Cloud Build** | Building the container from source (`gcloud run deploy --source .`) | `deploy.sh` |

Optional and off in the deployed app: if Gemini does not answer, a small Gemma model on Fireworks AI can answer instead (`foreman/llm.py`, set `FIREWORKS_API_KEY`). It runs outside Google Cloud, so `deploy.sh` sets `FALLBACK_GEMMA=0`. Every such answer is labelled "fallback" in the agent trace.

Not Google, and used on purpose: Cedar (policy), the Model Context Protocol (the tool layer), DuckDB, dlt, Pascal Editor (3D), the Anatomy kit (figures).

## What is real, replayed, simulated

| Piece | State |
|---|---|
| Machine telemetry | Real. The Industry 4.0 Lab state log of the University of Southern Denmark (Zenodo 5078737, CC BY 4.0), replayed as if live |
| Incident archive and backtest | Real. The 465 fault-injection cases of RCAEval. There is no incident history from a real plant, so the Warden backtest covers software incidents only |
| Inspection data | Real. UCI SECOM |
| Documents in the sample pack | Synthetic, with real station names |
| Plant actions | Simulated. The plant is replayed data, so every applied action runs in a simulator |
| Probes | Real programs. They test the plant interfaces (OPC UA and the ERP) and compare views from several places. A fault can be injected, and it is always marked as injected |
| Gemini answers in demos | Live when Gemini answers. Recorded answers replay when it does not, and are labelled "recorded" |

## Run it

Needs Python 3.11 and Node 22.

```bash
python -m venv .venv && .venv/Scripts/activate        # bin/activate on Linux or macOS
pip install -r requirements.txt
cp .env.example .env                                   # add GEMINI_API_KEY
cd web && npm install && npm run build && cd ..
```

Windows: `.\run_local.ps1` starts the backend (port 48410) and the web app (port 3000), then open http://localhost:3000. `.\run_local.ps1 -Stop` stops them.
Elsewhere: `python -m uvicorn server.app:app --port 48410` and, in `web/`, `npx next start -p 3000`.

The first visit starts the first-time flow. "Start over" in Plant settings brings it back.

## Tests

```bash
python -m tests.foreman_test        # 38 checks on Warden, the Cedar gate, the Verifier, contracts and the fallback. No Gemini needed
node tests/e2e.mjs                  # drives the whole app in real Chrome: first visit, Guide, tour, Operations, Warden, Probes, deck
```

`node tests/e2e.mjs` writes a screenshot of every step to `docs/e2e/` and a report to `docs/e2e/REPORT.md`.

## Where things are

| Folder | What |
|---|---|
| `foreman/` | The agents, the Guide, Warden, the gateway and the model layer |
| `server/` | FastAPI: `/api/jig/*` (platform), `/api/probes`, `/api/ws/*` (workspace) |
| `probe/` | The probe program |
| `documents/`, `mcpx/`, `fabric/`, `rca/` | Document engine, MCP servers and hub, policy gateway, incident investigator |
| `web/` | Next.js app: first-time flow, Floor, Operations, Warden, Agents, Probes, deck at `/deck` |
| `deck/` | Anatomy figures for the pitch deck |
| `docs/` | End goal, build log, UX review, diagrams, end-to-end screenshots |

More: `docs/END_GOAL.md` (the plan and why), `docs/BUILD_LOG.md` (what is built and measured), `docs/UX_REVIEW.md`.

## Licences

Third-party code and data are listed in `THIRD_PARTY_NOTICES.md`.
