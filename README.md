# Tolerance

**An agentic platform for manufacturing, built around a Symbiotic Compiler.** Google Cloud AI Builder Cup 2026, Manufacturing theme.

A new plant gives Tolerance its name and its documents. Nine agents work from them. Four read them, ask the owner what is unclear, connect to the plant's data, and compile everything into one checked model of the plant. Other agents then diagnose failures, check their own findings, propose fixes, and score how safe each fix is. The owner decides how far the agents may act alone. A hard limit written in the plant's own documents is never crossed, whatever the score.

> Status: working prototype that runs locally. The Cloud Run deployment is scripted (`deploy.sh`, `Dockerfile`, `DEPLOY.md`) and the live address is added here after the first deploy.

## The idea in three diagrams

**The platform.** Nine agents on Foreman, with shared services, one policy gateway, MCP connectors and probes, and the machines.

<p align="center"><img src="docs/diagrams/01-platform.svg" alt="The Tolerance platform: assistant and router, the agent team on Foreman, shared services, the policy gateway, MCP connectors and probes, machines" width="760"></p>

**The journey.** From dropped documents to a decision at the gate.

<p align="center"><img src="docs/diagrams/02-demo-journey.svg" alt="Drop documents, connect machines, confirm the overview, build the 3D, a fault is found, the gate decides" width="760"></p>

**The safety gate (Warden).** Hard limits from your documents come first and are never overridden. Then Warden scores the action from 0 to 100 against the two lines you set.

<p align="center"><img src="docs/diagrams/03-safety-gate.svg" alt="Planner proposes an action, hard limits block it or pass it, Warden scores it, then refused, you approve, or runs itself" width="700"></p>

## The ingestion step

After the owner gives the documents, the Guide shows what it understood (facts with their quotes, stations, limits, conflicts, hidden orders removed). Then it asks where the data lives and shows every source family with an honest label: **live in this build**, **plugs in with your URL**, or **through a bridge**. The owner can also name an MCP server or a read-only database address; passwords are cut out and never stored. Sources that are not live here are written down for setup.

## The floor editor, Sentinel, playbooks and channels

| | |
|---|---|
| <img src="docs/images/screens/23-floor-editor.jpg" alt="The floor editor: what Tolerance learnt on the left, the full Pascal editor on the right"><br>**Floor editor.** What Tolerance learnt on the left, the full editor on the right. | <img src="docs/images/screens/19-sentinel.png" alt="Sentinel: rules with their checks and results"><br>**Sentinel.** Rules, their checks, and what each one saw. |
| <img src="docs/images/screens/20-playbooks.png" alt="Playbooks: a canvas with a trigger, checks and actions"><br>**Playbooks.** Draw what happens when a station fails. | <img src="docs/images/screens/22-channels.jpg" alt="Channels: where Warden tells a person"><br>**Channels.** Slack, Teams, Discord, Telegram or a webhook. |


- **Floor editor** (`/floor/edit`): the full Pascal editor opens on the floor the Guide drew, with a "what I learnt" panel beside it (stations, facts, limits, conflicts, data). The owner edits all of it. Saving keeps the scene on the server and moves or removes the matching stations in the plant model. The live floor then shows the owner's scene, with live colours and labels.
- **Sentinel** (`/sentinel`, the ninth agent): plain rules, no model. A rule is a list of checks (a field, an operator, a value) on a table of your data, a web address, a network port, a service, or what the documents say. A service check sends the first message of the protocol (MQTT, Redis, PostgreSQL, MySQL, MongoDB, RabbitMQ, OPC UA, Memcached, InfluxDB, ClickHouse, Elasticsearch, SQL Server port) and does not log in. The **Decide** check is optional and marked AI-assisted: Gemini puts up to 100 short texts (an alarm column, or the quotes from your documents) into labels you choose, its answer is limited to those labels, and a text that gives orders is treated as data. Plain checks then judge the counts. This is how Jev works, with Gemini: a model that can only answer from a fixed set of outputs. Next, a small Gemma tuned for this one job, classification for Sentinel, can take over. The engine choice is already in place. It can suggest checks for your connected data. A rule that starts failing tells your channels. Web, port and service checks reach public addresses only.
- **Playbooks** (`/playbooks`): the owner draws what should happen when a station fails: a trigger, checks, a decision and actions. Checks read through the same policy gateway as the agents. Any action that changes the plant is scored by Warden first.
- **Channels** (on the Warden page): Slack, Teams, Discord, Telegram or any webhook. "A person must approve", blocked actions, failing Sentinel rules and playbook messages reach people where they work. Addresses stay on the server.

## The 3D factory

The factory assembles itself from the confirmed plan, with data flows shown as cables (the X-ray view), live station labels, and a dashed ghost station that only the documents mention (C3). Built on the Pascal Editor. The floor opens in quick 2D. The 3D bar has only controls that work on a floor: Walk, Turn, Top view, Reset view, Data flows (the X-ray layer), Labels and Replay build. Switch to 3D and a loader shows while the engine starts; the first time takes about 20 seconds, and after that it opens quickly.

<p align="center"><img src="docs/images/screens/00-floor-3d.jpg" alt="The 3D factory: warehouse shelves, a robot arm, conveyors, data cables and station labels" width="860"></p>

## Animated figures (Anatomy)

These are interactive in the app and in the deck (they move). Here they are as stills. Each one shows a real mechanism of the product, drawn with the [Anatomy](https://github.com/wheresryan22/anatomy) kit.

| | |
|---|---|
| <img src="docs/images/figures/gauge.png" alt="The tolerance gauge: a dial indicator measuring parts against a tolerance band"><br>**The tolerance gauge.** A part is measured against its tolerance band: in or out. | <img src="docs/images/figures/platform.png" alt="One platform, nine agents standing on a shared base"><br>**One platform.** The agents stand on one shared base: one gateway, one policy, one record. |
| <img src="docs/images/figures/interlock.png" alt="The interlock: a gate on a rail where read calls pass and a write call waits for a person"><br>**The interlock.** Every tool call reaches one gate. Reads pass. A write stops and waits for a person. | <img src="docs/images/figures/warden.png" alt="The Warden gates: two gates on a rail, the floor and the limit"><br>**The Warden gates.** The first gate is your floor, the second is your limit. A score between them waits for a person. |
| <img src="docs/images/figures/selector.png" alt="The selector: a learner that chooses which evidence to read first"><br>**The selector.** A contextual bandit learns which evidence to read first, and a confirmed diagnosis rewards the choice. | |

The first-time flow also draws the owner's own plant in this style, from what the Guide learned (see "Your plant, drawn" below).

## The app, screen by screen

The first-time flow, as a new visitor sees it. These screenshots come from the end-to-end test on the live site (`node tests/e2e.mjs`), which saves one for every step.

| | |
|---|---|
| <img src="docs/images/screens/01-login.png" alt="Login: Google, email and password, or continue as guest"><br>**1. Sign in** with Google or email, or continue as a guest. Each visitor gets a private plant. | <img src="docs/images/screens/02-plant-name.png" alt="What is your plant called?"><br>**2. The plant name.** The only question on the first screen. No menu yet. |
| <img src="docs/images/screens/03-spark-reveal.png" alt="A spark sweeps across the plant name and fills the letters with colour"><br>**3. A spark takes over the name.** It sweeps across the name and the letters fill with colour. | <img src="docs/images/screens/04-drop-zone.png" alt="Drop your documents here"><br>**4. Drop your documents.** Manuals, work instructions, safety rules, emails. A sample pack is there for people who have none. |
| <img src="docs/images/screens/05-guide.png" alt="The Guide chats with the owner"><br>**5. The Guide talks with the owner.** It reads the documents, asks which data to connect, and asks what the plant makes. | <img src="docs/images/screens/06-plant-drawn.png" alt="Your plant as the Guide understands it, drawn with Anatomy"><br>**6. Your plant, drawn.** Gemini turns the confirmed understanding into a layout, and Anatomy draws it. | 
| <img src="docs/images/screens/07-tour.png" alt="The tour: only Floor is in the menu and the Guide explains it"><br>**7. The tour.** The menu grows one section at a time while the Guide says what each is for. | <img src="docs/images/screens/08-operations.png" alt="Operations: what happened, what we suggest, and whether it needs approval"><br>**8. Operations.** What happened, what we suggest, and who must approve it. The agents' work is one click away. |
| <img src="docs/images/screens/09-warden.png" alt="Warden: two sliders and a backtest on 465 past incidents"><br>**9. Warden.** You set two lines. The chart shows what they would have done on 465 recorded incidents. | <img src="docs/images/screens/10-warden-hard-limit.png" alt="Warden blocks an action that breaks a hard limit from the documents"><br>**10. A hard limit.** An action above a limit from your own documents is blocked, whatever its score. |
| <img src="docs/images/screens/11-probes.png" alt="Probes: three places see the same machine, one path is cut"><br>**11. Probes.** Several places test the same machine. If only one fails, the fault is on its path. | <img src="docs/images/screens/12-agents.png" alt="The agent catalog: nine agents with what each may touch"><br>**12. Agents.** Eight agents, each with a card: what it may touch and what it must never do. |
| <img src="docs/images/screens/13-compiled-model.png" alt="The compiled model: every fact with the exact quote it came from"><br>**13. The compiled model.** Every fact keeps the exact words it came from. | |

## The pitch deck

A three-minute deck that runs in the browser at `/deck`, with the live app embedded.

| | |
|---|---|
| <img src="docs/images/screens/14-deck-platform.jpg" alt="Deck slide: nine agents, one gateway"><br>The platform | <img src="docs/images/screens/15-deck-operations.png" alt="Deck slide: the Verifier catches the agent's mistake"><br>Operations: the Verifier catches a wrong number |
| <img src="docs/images/screens/16-deck-warden.png" alt="Deck slide: you set the two lines"><br>Warden | <img src="docs/images/screens/17-deck-roadmap.png" alt="Deck slide: next, a Gemma that knows your plant"><br>Roadmap |
| <img src="docs/images/screens/24-deck-sentinel.jpg" alt="Deck appendix: Sentinel, playbooks, channels and the floor editor"><br>Appendix: rules, playbooks and people | |

## What a person sees

1. **Plant name.** The only question on the first screen. No menu, no panels.
2. **A spark takes over the name.** A glowing spark sweeps across the typed plant name and the letters fill with colour. It lasts about four seconds and can be skipped.
3. **Drop your documents.** A real drag-and-drop area. A sample pack of eight documents is available for people who have none.
4. **The Guide talks with the owner.** It reads the documents, asks which data sources to connect, asks what the plant makes, and settles conflicts between documents, missing stations and hard limits, one question at a time.
5. **The plant, drawn.** Gemini turns the confirmed understanding into a layout, and the Anatomy kit draws it.
6. **A tour.** The menu grows one section at a time: Floor (3D), Operations, Warden, Agents, Probes, Compiled model. The Guide says what each is for, tied to what the plant makes.

Settings has "Show me around" and "Start over".

## The agents (Foreman)

<p align="center"><img src="docs/images/figures/agent-team.png" alt="The agent team: the owner and the Guide, the onboarding and operations teams, shared services, connectors and machines" width="900"></p>


Foreman is the layer that runs the agents: a contract card per agent, a visible record of every step, one policy gateway, and a record and replay for model calls. Every agent can use Gemini. In Sentinel it only puts short texts into labels you choose, and plain rules decide every result. Plain code is labelled as such (model-driven, rule-driven, or mixed).

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
| Sentinel | Checks your systems and the agents' claims with plain rules | Only in the optional Decide check: Gemini puts short texts into labels you choose, and its answer is limited to those labels. Code decides every result |

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
python -m tests.foreman_test        # checks on Warden, the Cedar gate, the Verifier, the nine contracts and the fallback. No Gemini needed
python tests/sentinel_test.py       # the Sentinel rule engine and its address guard
python tests/sentinel_protocols_test.py   # the service checks, against small fake servers
node tests/e2e.mjs                  # drives the whole app in real Chrome: first visit, Guide, tour, Operations, Warden, Probes, deck
```

`node tests/e2e.mjs` writes a screenshot of every step to `docs/e2e/` and a report to `docs/e2e/REPORT.md`.

## Where things are

| Folder | What |
|---|---|
| `foreman/` | The agents, the Guide, Warden, the gateway, playbooks, channels and the model layer |
| `sentinel/` | Sentinel: the rule engine, the checks, the service protocol checks and the address guard |
| `server/` | FastAPI: `/api/jig/*` (platform), `/api/probes`, `/api/ws/*` (workspace) |
| `probe/` | The probe program |
| `documents/`, `mcpx/`, `fabric/`, `rca/` | Document engine, MCP servers and hub, policy gateway, incident investigator |
| `web/` | Next.js app: first-time flow, Floor and floor editor, Operations, Warden, Agents, Probes, Sentinel, Playbooks, deck at `/deck` |
| `deck/` | Anatomy figures for the pitch deck |
| `docs/` | End goal, build log, UX review, diagrams, end-to-end screenshots |

More: `docs/END_GOAL.md` (the plan and why), `docs/BUILD_LOG.md` (what is built and measured), `docs/UX_REVIEW.md`.

## Licences

Third-party code and data are listed in `THIRD_PARTY_NOTICES.md`.
