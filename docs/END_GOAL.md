# Tolerance: the end goal (the single source of truth)

Written 2026-10-14. This file records every decision made in the planning conversation. Detailed research is in `AGENT_ROSTER.md` and `ASSEMBLY_PLAN.md`. The three diagrams are in `diagrams/` (SVG).

## 1. What we are building

**Tolerance is an agent platform for factories. It is Crosswork AI for manufacturing.**

A customer gives it documents and connects their machines. The platform builds a model of the factory by itself. A team of agents watches the factory, finds faults, checks its own findings, proposes fixes, and scores how safe each fix is. Low-risk fixes run by themselves, inside limits the customer sets. Everything else waits for a person. A policy gateway checks every call.

Positioning (from the Crosswork material in `../CW`): a platform plus a named team of agents, an ingestion story, a fixed card per agent (use case, solution, outcomes), evidence in every answer, human approval for change, and a business-impact framing. We copy the structure and the philosophy, not the product. We do not care what the rest of the market does.

Naming:
- Platform: **Tolerance**.
- Agent framework: **Foreman** (a manufacturing layer on Google ADK, using the ideas of AWS Strands: agents as tools, workflows, SOPs as runbooks). Name confirmed by the owner on 2026-10-14 (replaced "Jig"). Code lives in `foreman/`; the API path stays `/api/jig` and the Gemini cache keys keep the `jig:` prefix so recorded answers still replay.
- Safety score agent: **Warden** (confirmed).
- Plain code may be called an agent. Every catalog card carries a small label: model-driven, rule-driven or mixed.

## 2. The demo journey (diagram `02-demo-journey.svg`)

1. **Drop documents.** The Document Reader extracts claims with exact quotes.
2. **Connect machines.** The Connector Scout discovers each MCP connector and profiles it.
3. **Confirm the overview.** The Plant Modeler writes what it thinks the factory is, in words and as a 2D plan, and shows ghosts, conflicts and gaps. The person confirms. This is the first human decision.
4. **Build the 3D.** The factory assembles from the confirmed plan.
5. **A fault is found.** The camera flies to it. Agents gather evidence through the gateway. The Verifier rejects causes the evidence does not support.
6. **The gate decides.** The Remediation Planner proposes a fix. Warden scores it. It runs itself, or a person approves, or it is refused.

Order follows the judging rubric: 40% technical and Gen AI, 25% problem and impact, 25% innovation, 10% experience. Agents and measured results come early. Tickets are out of scope.

## 3. The platform (diagram `01-platform.svg`)

Top to bottom: assistant and router; the agent team on Foreman; the policy gateway; MCP connectors and probes; machines. Shared services beside the team: plant model, documents, Gemini gateway, learner.

### The seven agents

| Agent | Team | Job | Uses Gemini for | Mode |
|---|---|---|---|---|
| Document Reader | Onboarding | Documents to claims, each with the exact quote; strip injected instructions | Extraction | Mixed |
| Connector Scout | Onboarding | Discover each connector's tools, tables and tags; profile; say what plant this looks like | Plant-type summary | Mixed |
| Plant Modeler | Onboarding | Reconcile claims and live data; ghosts, conflicts, gaps; write the overview; draw the 2D plan | The written overview | Mixed |
| Diagnosis | Operations | Hypotheses with evidence through the gateway | Investigation and tool use | Model-driven |
| Verifier | Operations | Check each hypothesis against its evidence; cap confidence | Critic | Mixed |
| Remediation Planner | Operations | Step plan and structured payload inside the limits; proposes only | Plan writing | Mixed |
| Warden | Operations | Safety score for each proposed action | Plain-language rationale | Mixed (score is rule-driven so it can be audited) |

Deterministic services that appear in the diagrams: the Policy Gateway (Cedar, default deny), the Action Broker (runs an approved or auto-approved plan; bound to the exact payload; rechecks limits at the moment of action), the Layout engine, the Floor Builder, and the Tolerance Auditor.

Every agent uses Gemini in at least one step. The Gemini gateway records runs so a demo replays without a live key.

## 4. The safety gate and Warden (diagram `03-safety-gate.svg`)

1. The Remediation Planner proposes an action.
2. **Hard limits** from the documents are checked first. A broken limit blocks the action. **The score never overrides a hard limit.** (Rule set by me; needs the owner's confirmation.)
3. Otherwise **Warden** scores the action from 0 to 100. Inputs:
   - Can the action be undone?
   - How many stations or orders does it touch?
   - How far is it from the limits?
   - How strong is the evidence (from the Verifier)?
   - Did a person approve this kind of action before (from the learner)?
   - Is the plant idle or inside a maintenance window?
4. The user sets two lines:
   - Below the **floor**: refused.
   - Between the floor and the **limit**: a person approves.
   - Above the **limit**: it runs itself.
5. Before the lines are saved, a **backtest** replays past incidents and shows what each setting would have done. The user decides whether the limit is good. This is the part of the demo that shows how safety is defined.
6. Every decision is logged with its score, its factors and who decided.

Honest note: the plant is replayed data, so "runs itself" executes in a simulated actuator that creates and closes a work order. We say so on screen.

## 5. The probe (philosophy only)

ThousandEyes is a philosophy for us: small observers in many places, each seeing from its own place, and the platform compares the views to find where the fault is. We do not use or rebuild the product.

For a plant: compare what a controller reports with what an independent probe measures. A disagreement means a machine reports "running" and is not. Probes are real software. The machines behind them are replayed data and a simulator, so the demo says "replayed data". Telegraf is the planned collector (inputs for OPC UA, Modbus, MQTT, Siemens S7 confirmed). Not built yet.

## 6. Open-source parts (details in `ASSEMBLY_PLAN.md`)

We take code and ideas, adapt them for manufacturing, and rename them. We keep every licence and notice file in the repository, because MIT and Apache require it. We do not put them on slides.

LangExtract (Document Reader), React Flow (2D plan), Google ADK and Agent Starter Pack (framework and Cloud Run), IBM AssetOpsBench servers (work orders, failure modes), Telegraf (probe), DeepEval and promptfoo (Verifier tests), Cedar (kept), ContextForge or agentgateway (MCP front door, after a test).

Risks: each part must be tested on our stack first. Some need extra services or large downloads. The plan is a one-hour test per part, then the next candidate if it fails.

## 7. A fine-tuned Gemma for manufacturing (roadmap, not built)

A fine-tuned Gemma would likely work better on plant language. It needs compute the owner does not have now. The slide must say "possible", not "done".

What the evidence says:
- **LLM-MANUF** combines several small models, each fine-tuned on manufacturing text from one automotive maker. The ensemble matched 30B-parameter models (BLEU-4 83.37). The gain comes from the ensemble. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1474034625001569)
- **PARAM** (maintenance agents): fine-tuned small models become competitive on targeted tasks. Small models without fine-tuning lose accuracy and completeness. [arXiv](https://arxiv.org/pdf/2508.04714)
- **Aircraft maintenance:** a fine-tuned GPT-3.5 beat general GPT-3.5 and GPT-4. I saw this only through a survey; check the original. GPT-3.5 is not small.
- **LoRA on a robotic model** cut peak memory from 36.2 to 10.8 GiB (not Gemma). [arXiv](https://arxiv.org/pdf/2607.10172)
- Google documents Gemma tuning paths (Keras LoRA, Hugging Face, Vertex AI, GKE) and edge formats such as GGUF. [Gemma tuning](https://ai.google.dev/gemma/docs/tune)

Gap: I found no published Gemma study in a factory setting and no Gemma speed figures on factory hardware. The slide says so.

## 8. Decisions and rules

- Tolerance equals Crosswork AI for manufacturing. Not a pivot of the data or the benchmarks: a reframe plus new agents.
- Six agents accepted, plus Warden (seven).
- Onboarding order: documents, connectors, overview (written and 2D), then 3D.
- Remediation may run by itself when the safety score is above a limit the user sets.
- No tickets for now.
- ThousandEyes is philosophy only.
- Take open-source code and ideas, adapt for manufacturing, do not announce copying on slides, keep licence files.
- Probes are real; machines are replayed. Say "replayed data".
- Documents in the demo are synthetic with real station names. Telemetry is real (SDU lab). Say so.
- Do not claim Google Cloud deployment until it is tested.

## 9. What exists and what does not (start of the build)

Built before this build: Document Reader, Diagnosis, Cedar gateway, MCP hub (4 servers, 22 tools), learner, factory twin, 3D floor, X-ray, assembly animation, 8-stage ingestion screen, benchmarks, the 3-minute deck.

Built in this build: see `BUILD_LOG.md`.

## Update, 15 October 2026

The platform now has nine agents. Sentinel is the new one. It checks the plant's systems and the agents' own claims with plain rules, and no model decides a result. Around it are three new areas: playbooks (the owner draws what happens when a station fails), channels (people are told where they work) and a floor editor (the owner can change everything the Guide drew). Gemini is used by eight agents. Sentinel, playbooks and channels use none.
