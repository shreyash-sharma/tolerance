# Build log: what is built, how to run it, what is not

Date of this entry: 2026-10-14. Source of truth for goals: `END_GOAL.md`. Diagrams: `diagrams/01-platform.svg`, `02-demo-journey.svg`, `03-safety-gate.svg`.

## Built and tested

| Part | Where | What it does | Checked how |
|---|---|---|---|
| Foreman core | `foreman/core.py` | Agent contracts (the catalog card), visible runs with every step | Catalog returns 7 agents |
| Foreman Gemini layer | `foreman/llm.py` | JSON answers and MCP tool loops. Each live answer is recorded; the next identical run replays it | Live runs with Gemini; replay used by the second round |
| Foreman gate | `foreman/gate.py`, `rca/policy.py` | One Cedar policy, default deny. Each agent is its own principal. The broker may apply to the plant only inside the safety rules | Allow and deny cases tested with cedarpy |
| Warden | `foreman/safety.py` | Score 0 to 100 from six factors, the user's floor and limit, hard-limit checks from documents, Action Broker, backtest | See "Measured" |
| Seven agents | `foreman/agents.py` | Document Reader, Connector Scout, Plant Modeler, Diagnosis, Verifier, Remediation Planner, Warden | Scout, Modeler and the operations flow run end to end |
| New MCP tool | `mcpx/servers.py` `failure_episodes` | Failure episodes of one station with the states before and nearby failures | Used by Diagnosis and Verifier |
| Document upload and structure | `documents/engine.py` | Upload, material flows, hard limits with quotes | Used by Modeler and Warden |
| API | `server/jig_api.py` | `/api/jig/*` | curl tests |
| Screens | `web/components/{Onboard,Agents,Operations,Warden,Trace}.tsx` | `/onboard`, `/agents`, `/operations`, `/safety` | Opened in the browser pane |
| Deck v3 | `web/components/deck/Deck.tsx` | Nine slides, 177 seconds, at `/deck` | Slides 3, 5, 6, 8 viewed |
| Anatomy figures | `deck/figures/{platform,warden}.mjs` | Platform rack and the two Warden gates, animated | Viewed in the browser pane |

## Added after the first entry (2026-10-14, later)

- **Probe v0** (`probe/agent.py`, `server/probe_api.py`, `/probes`): a real program that tests the plant's OPC UA and ERP interfaces on a timer and reports to the platform. The platform compares what each vantage point sees and says "path fault" (one probe fails, others pass), "down at the target" (all fail) or "healthy". Demo probes start as local processes; a fault can be injected, and every report marks it as injected. Probes test the plant interfaces, since machines are replayed data.
- **Agent tests** (`tests/foreman_test.py`, 31 checks, no Gemini needed): hard limits block whatever the score, the two lines, the Cedar gate cases, the Action Broker, the Verifier's number check, agent contracts. The tests found one real bug: a maintenance window that crosses midnight (22:00-05:00) was handled wrongly. Fixed.
- **Screens polished**: onboarding (2D plan first and full width, readable overview, stale warning removed), Warden's reason text now comes from Gemini (it fell back to a template too often).
- **Deck**: the three architecture diagrams are appendix slides after the close (outside the 177 seconds; autoplay stops at the close).
- **Finding**: with the default floor of 40, almost nothing is refused (0 of 465 in the backtest; the lowest scores sit near 50), because the factors rarely all score low. The refuse zone is reachable only with weak evidence plus a hard-to-undo, wide action. Raise the floor to about 55 to see refusals, or rescale the score. Not yet decided.

## Measured

- **Operations flow, live Gemini, station TR.** Round 1: Diagnosis cited "2 failures in 24 hours". The Verifier recomputed from the data: 1 failure. Rejected. Round 2 (with the issues sent back): supported, evidence strength 0.90. Planner proposed Inspect and a speed change. Warden scored 92 and 80. Both were at or above the limit of 80 and the broker applied them in the simulator.
- **Warden backtest on 465 recorded RCAEval incidents** (real fault injections, rule investigator, `seed/rca_library.json`). Diagnosis was right in 75.1%. At floor 40 and limit 80: 149 would run alone (120 right, 29 wrong), 316 would wait for a person, 0 refused. Score histogram by tens from 0: 0, 0, 0, 0, 0, 3, 79, 234, 144, 5.
- **Limit curve:** wrong diagnoses that would run alone fall from 116 of 465 at limit 50 to 29 of 149 at limit 80, 5 of 30 at 85 and 0 of 5 at 90.

## Honest limits

- The backtest scores software incidents from RCAEval. We have no incident history for the plant, so there is no plant backtest. The action chosen for each case is a fixed map from fault family to action kind.
- The score is rule-driven. The factors and weights are our design, not a published standard. They are not tuned on outcomes.
- Machines are replayed data and the actuator is a simulator. Nothing here changes a real machine.
- The probe tests the plant interfaces from processes on one computer; multi-computer use is supported by the command line but not tested. No Cloud Run deployment is claimed until it is tested.
- Documents are synthetic with real station names. Telemetry is real (SDU lab log).
- The Verifier's hard check compares numbers the diagnosis cites with the failure count, mean repair time and episode durations. It does not check other kinds of claim; Gemini reviews the argument for those.
- Plant Modeler checks only that named stations exist.

## Gemma roadmap: evidence and the gap

Checked on 2026-10-14:

- Google documents Gemma tuning (LoRA with Keras and Hugging Face, Vertex AI, GKE).
- LLM-MANUF, *Advanced Engineering Informatics* 2025 (article 103263): a framework that fine-tunes LLMs for manufacturing decisions. We could not read its results, so we quote no numbers.
- arXiv 2608.10710: an ensemble of prompted open-weight models for automotive fault classification (best Top-1 0.917). The authors list fine-tuning as future work.
- Leuphana sllm4prod: a project on small domain-specific language models (10 billion parameters or fewer) for manufacturing.
- Correction: PARAM (arXiv 2508.04714) is Gemini with retrieval for maintenance, not a fine-tuning study. An earlier note cited it as fine-tuning evidence. It is not. Also, we could not confirm the earlier note's BLEU-4 83.37 figure for LLM-MANUF. Do not use either claim.
- **Gap:** no Gemma study on factory data and no edge speed figures. Closing it needs GPU compute.

## How to run

```sh
# backend (from D:\GitHub\Tolerance)
.venv\Scripts\python.exe -m uvicorn server.app:app --port 48410
# front end
cd web && npm run dev          # http://localhost:3000
```

Pages: `/onboard`, `/floor`, `/operations`, `/safety`, `/agents`, `/deck`. Rebuild the figures with `node deck/figures/platform.mjs --light` (and `warden.mjs`). The backend has no auto-reload: restart it after Python edits. The backtest cache is `data/jig_backtest.json` (about four minutes to build the first time; delete it to rebuild).

## Not yet done

- Optional spikes: LangExtract, React Flow (the 2D plan is plain SVG today), Telegraf.
- Cloud Run deployment and test.
- The 3-minute video recording (use autoplay `A` on `/deck`).
- Ask the owner to confirm: the rule that a score never overrides a hard limit.
- Licence files for any open-source code we copy into the repo (MIT and Apache need the notice kept).

## Update, 15 October 2026

| Area | What changed | Where |
|---|---|---|
| Nine agents | Sentinel is the ninth agent. It is rule-driven and uses no model. The Guide is counted too: nine in all. | `foreman/agents.py`, `foreman/guide.py` |
| Sentinel | A small Python rule engine: a rule has checks (field, operator, value) on a table of your data, a web address, a port, a service, or document claims. Service checks send the first message of the protocol and do not log in. The optional Decide check lets Gemini put short texts into labels the owner chooses (answer limited to those labels); plain checks judge the counts. | `sentinel/`, `tests/sentinel_test.py`, `tests/sentinel_protocols_test.py` |
| Playbooks | The owner draws a trigger, checks, a decision and actions. Code walks it. Warden scores any action that changes the plant. | `foreman/playbook.py`, `web/components/Playbooks.tsx` |
| Channels | Slack, Teams, Discord, Telegram or a webhook get approvals, blocked actions, failing rules and playbook messages. Private addresses are refused. | `foreman/notify.py`, `web/components/Channels.tsx` |
| Floor editor | The full Pascal editor opens on the drawn floor, next to what Tolerance learnt. Saved edits show on the live floor. | `web/components/FloorEditor.tsx`, `/api/jig/floor` |
| Own data | A visitor can upload their own machine log. It goes into a private database. Word states (RUN, FAULT) work. Quality files with a 0/1 result (Bosch) work. | `connectors/registry.py`, `physical/service.py`, `workspace/sources.py` |
| Big plants | A plant with more than 16 stations draws one box per machine. 3D for 50 stations loads in about 20 seconds. | `web/components/Floor3D.tsx` |
| Verifier | The Verifier and its reviewer see the last 24 hours, the whole log and the station summary. | `foreman/agents.py` |

Not done: Kanshi's deep connector checks (a login, a query) are not ported. Service checks stop at the first protocol message.
