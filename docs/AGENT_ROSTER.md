# Tolerance as an agent platform: the roster, the probe, and the diagrams

Status: research and proposal, now partly built. The roster grew from six agents to seven (Warden added) and the framework layer is called Foreman. See `BUILD_LOG.md` for what is built and measured, and `END_GOAL.md` for the final picture.

Tolerance becomes what Crosswork AI is for networks: a **platform** with shared services and a **team of named agents**, each with a contract. This document decides which agents we have, why each one earns its place, how they are wired, how a probe on every machine feeds them (the ThousandEyes idea), and which diagrams we draw.

## 1. Design rules (from the research)

1. **An agent exists only where there is reasoning, or where trust differs.** A single-agent baseline beat or matched a four-subagent design in an industrial root-cause study (Westermo, 120 runs): the multi-agent version was about 3x slower and 2x the cost with no consistent quality gain. The authors say specialisation pays off with many tools, large context or clearly separable responsibilities. [Westermo experience report](https://arxiv.org/html/2609.21843v1) So: deterministic steps stay code, not agents.
2. **The model advises, deterministic tools act, the operator decides the ambiguous and safety-critical.** This is the design of a 2026 system that turns plant SOPs into a process twin bound to live tags (mean F1 95.2% on 16 flows at one food manufacturer; at ambiguous tags it asked the operator and mis-bound none, where a single-pass baseline mis-bound 75%). Single-company results, abstract only. [FacProcessTwin](https://arxiv.org/abs/2606.17666)
3. **Every tool call passes one gateway with default deny.** This is how AgentCore Gateway uses Cedar: every `tools/list` and `tools/call` is evaluated before the tool runs. [AgentCore policy](https://xebia.com/blog/cedar-policies-for-amazon-bedrock-agentcore-gateway/) We already do this.
4. **Pick the orchestration pattern per job.** Coordinator for routing, sequential pipeline for onboarding, parallel fan-out for evidence, generator and critic for verification (always with a loop limit), human-in-the-loop for anything that changes the plant. [ADK multi-agent patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) Strands names the same set: agents-as-tools, swarm, graph, workflow; swarms can loop forever, so we do not use one. [Strands patterns](https://aws.amazon.com/blogs/machine-learning/multi-agent-collaboration-patterns-with-strands-agents-and-amazon-nova/)
5. **Every agent has a written contract** (name, trigger, inputs, permitted tools, forbidden actions, output, success test). The router reads the description, so the description is design.

## 2. Platform services (the Crosswork "services" row)

| Service | Job | Today |
|---|---|---|
| Assistant and Dispatcher | One entry. Routes a request to the right agent (coordinator pattern). | Partial: floor chat with tools; no router |
| Agent Catalog | Contract per agent: use case, solution, outcomes, tools, trust level. | Not built |
| Model Gateway | One governed route to Gemini (model-agnostic, cost and latency limits, recorded runs). | Built (Gemini client, cache, retry) |
| Context Service | SOPs, manuals and work instructions as retrievable text with citations. | Partial: documents with quotes; no vector store |
| Plant Model | The factory as a graph: site, line, station, flows, bindings, ghosts. | Built (factory twin) |
| Connector Gateway | MCP servers and probes, one way in. | Built (4 MCP servers, 22 tools) |
| Policy Gateway | Cedar, default deny, human approval for writes. | Built |
| Evaluation | Per-agent tests with seeded traps. | Partial (RCAEval, document key) |
| Observability and Audit | Who called what, decision, trace. | Partial (audit log) |
| Learner | Chooses what evidence to read first. | Built (bandit) |

## 3. The roster

Three teams. Seven reasoning agents, three deterministic services.

### Team 1: Onboarding (build the model of the plant)

| Agent | Contract | Tools and data | Trust | Pattern | Today |
|---|---|---|---|---|---|
| **Document Reader** | Turn dropped documents into claims, each with the exact quote. Classify each as active, uncertain or low confidence. Strip text aimed at the system. | Documents only | Read | Parallel fan-out, one per document | Built (8 documents, precision 90%, recall 100% on the seeded pack) |
| **Connector Scout** | For each connected MCP server or probe: list tools, tables and tags, profile them, say what kind of plant this looks like and why. | MCP discovery calls, samples | Read | Parallel per connector | Partial (fingerprint and profiling exist; not as an agent with a contract) |
| **Plant Modeler** | Reconcile claims with live data into one model: resolve names and aliases, find ghosts (documented, not measured), find conflicts, list gaps, write the overview. Never decide a conflict. | Claims, profiles, plant model | Propose | Sequential, then human gate | Partial (reconciliation exists as code in the document layer and twin) |

Deterministic, not agents: Layout engine (2D plan from the model), Floor Builder (3D from the confirmed model), Guardrail Drafter (limit per rule clause, kept as a pure function of the claim).

### Team 2: Operations (run the plant)

| Agent | Contract | Tools and data | Trust | Pattern | Today |
|---|---|---|---|---|---|
| **Line Query** | Answer questions about the plant in plain language by calling read-only tools. No opinions. | MCP read tools, plant model | Read | Single agent | Partial (tools exist; no agent) |
| **Diagnosis** | On an alert, form hypotheses and gather evidence. Return ranked causes with sources and unknowns. | MCP read tools, Context Service, learner | Read and propose | Parallel evidence gather | Built (Gemini and rule investigators) |
| **Verifier** | Check each hypothesis against the cited evidence and the SOP. Reject unsupported claims, cap confidence. | Evidence, Context Service | Read | Critic loop (hard limit) | Not built |
| **Remediation Planner** | Find the procedure, produce a step plan and a structured payload inside the approved limits. Propose only. | SOPs, guardrails, plant model | Propose | Sequential, human gate | Partial (propose and work order exist) |

Deterministic, not agents: **Action Broker** (executes an approved plan; approval is bound to the exact payload; checks the limit again at the moment of action) and **Tolerance Auditor** (checks live values against approved limits and raises an event, with no model in the decision).

### Team 3: Governance (the security gateway)

The **Policy Gateway** is deterministic and sits in front of every agent and probe: default deny, writes only with human approval, injection scrub on input, full audit. It is not counted as an agent. It is the part of the diagram the buyer should remember.

### Phase 2 analytics agents (data exists, agents do not)

| Agent | Job | Data |
|---|---|---|
| **Process Drift** | Learn normal behaviour and flag departures, with no rules to write. | SECOM inspection signals, station history |
| **Combination Analyst** (toxic factor) | Find combinations of machine, shift and signal that precede failures, from weeks of history. | Alert and state history |
| **Shift Reporter** | Summarise a shift with sources. | Telemetry history |

## 4. Onboarding flow (the order you asked for)

1. **Drop documents.** Document Reader runs in parallel. Output: claims with quotes, conflicts, gaps, ghost candidates, blocked injections.
2. **Connect connectors.** Connector Scout discovers each MCP server and probe and profiles it. Output: tools, tables, tags, the plant-type hypothesis with evidence.
3. **Overview, written and in 2D.** Plant Modeler reconciles 1 and 2. Output: a written description ("a four-station line with two warehouses, one ghost conveyor") and a 2D plan with every station, flow, binding and open question. The person confirms or corrects. This is the human gate.
4. **Build the 3D.** The Floor Builder composes the confirmed model. The assembly animation is a replay of its deterministic steps.

Today's eight-stage screen collapses into these four visible steps, with the agents running inside them.

## 5. The probe (the ThousandEyes idea)

ThousandEyes places lightweight agents at three vantage points: Cloud Agents the vendor hosts, Enterprise Agents the customer installs inside the network (virtual appliance, Docker container or Linux package), and Endpoint Agents on user devices. Each agent checks in with a collector, receives test instructions, runs tests and reports. [Agent types](https://www.thousandeyes.com/product/global-vantage-points) Cisco now exposes the platform's events, alerts and metrics to AI assistants through an MCP server that enforces existing account permissions. [ThousandEyes MCP](https://www.thousandeyes.com/blog/optimize-aiops-with-thousandeyes-mcp-server)

**The Tolerance Probe** is the same shape for a plant:

| Probe | Where | ThousandEyes analogue | Does |
|---|---|---|---|
| **Plant Probe** | One per network segment or line | Enterprise Agent | Reads OPC UA, MTConnect, Modbus, MQTT or a database; runs tests; serves read-only MCP tools |
| **Machine Probe** | On or beside one machine | Device Agent | Adapter for one controller; republishes in a common form |
| **Operator Probe** | A phone or tablet | Endpoint Agent | Operator input: photo, note, approval |

**How it behaves**
- Installed as a container, a package or a service. Outbound-only: it dials the platform, so no inbound firewall hole.
- Registers with a token, then receives **tests** from the platform: signal alive, value inside its band, cycle time normal, data fresh, controller reachable.
- Exposes **read-only MCP tools** locally and through the Connector Gateway. It is a Cedar principal of its own (`Probe::"line1"`), so a probe can only do what its scope says.
- Buffers when the link drops. Test packages are signed.
- Machine-side reality: the standard approach for machine tools is an adapter that reads the controller and an agent process that serves it over HTTP, which keeps clients unchanged when a controller brand changes. [MTConnect architecture](https://industrialmonitordirect.com/de/blogs/knowledgebase/mtconnect-data-acquisition-protocol-architecture-and-guide) Open-source MCP servers already exist for OPC UA and MQTT. [OPC UA MCP](https://enterprisedna.co/directories/mcp/kukapay-opcua-mcp) Several expose raw writes, so a probe ships read-only.

**The idea worth stealing most: vantage points.** ThousandEyes compares the same thing from outside, inside and the endpoint. For a plant: compare what the controller *reports* with what an independent probe *measures* (current draw, vibration, a camera count). Disagreement means a machine reports "running" and is not, or the reverse. This is a check no single-source system can do.

## 6. How the pieces connect (for the diagrams)

```
Operator -> Assistant -> Dispatcher -> Line Query | Diagnosis | Verifier | Remediation Planner
                                  \                |
                                   Model Gateway   Context Service, Plant Model, Learner
                                   |
                          Policy Gateway (default deny, approval, audit)
                                   |
                       Connector Gateway (MCP)  ->  Plant Probe / Machine Probe / Operator Probe -> machines
                                   |
                              Action Broker (approved, exact payload) -> machines
```

## 7. Diagram plan (built with the Anatomy skill, animated)

Same set as Cisco's slides, each as an isometric machine with a live readout:

| # | Figure | Shows | Machine metaphor | Moving parts |
|---|---|---|---|---|
| 1 | **Platform architecture** (Crosswork's first slide) | Services plus the three teams | A control cabinet: agent modules in a rack, services as backplane cards | Modules light as a request passes |
| 2 | **Onboarding data flow** (the audit data-flow slide) | Documents and connectors, three agents, the 2D plan, then 3D | An intake line: sorter, reader, press, plan table | Parts travel left to right; a conflict part stops at the human gate |
| 3 | **Operations solution architecture** (Incident Co-pilot slide) | Dispatcher, four agents, gateway, probes | A switchboard with patch cables to the machines | A call routes and is permitted, held, or denied |
| 4 | **Probe network** (ThousandEyes) | Probes on machines checking in; vantage-point comparison | A measuring bench with two gauges that must agree | The two needles diverge when a machine lies |
| 5 | **Trust ladder / gateway** | Read, propose, approve, act within limits | The interlock we already built | Exists |

## 8. Suggested build order

1. Write the **Agent Catalog** as data (one contract per agent) and show it. Cheap, and it is the Crosswork selling format.
2. Re-cut the onboarding screen into the four steps above (documents first).
3. **Verifier** (small, makes the diagnosis trustworthy and shows the critic loop).
4. **Line Query** (read tools already exist).
5. **Probe v0**: one Plant Probe that wraps our OPC UA and CSV sources, checks in, and serves read-only MCP.
6. Diagrams 1 to 4.
7. Phase 2 analytics agents.

## 9. What I could not verify

- FacProcessTwin: I read the abstract only; the split between model and tools inside it is not confirmed.
- The Westermo result is one company, two failures, an unoptimised multi-agent variant.
- ThousandEyes MCP: sources disagree on alpha versus general availability.
- I did not research Vertex AI Agent Engine or A2A in depth. We may not need A2A: agents here live in one platform.
- The probe is a design. No part of it is built.
- Strands patterns were taken from AWS documentation as search summaries; check API names against the current docs before borrowing code.

## Sources

- Westermo experience report: <https://arxiv.org/html/2609.21843v1>
- FacProcessTwin: <https://arxiv.org/abs/2606.17666>
- ADK multi-agent patterns: <https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/>
- Strands multi-agent patterns: <https://aws.amazon.com/blogs/machine-learning/multi-agent-collaboration-patterns-with-strands-agents-and-amazon-nova/>
- AgentCore Gateway and Cedar: <https://xebia.com/blog/cedar-policies-for-amazon-bedrock-agentcore-gateway/>
- ThousandEyes agents: <https://www.thousandeyes.com/product/global-vantage-points>
- ThousandEyes MCP server: <https://www.thousandeyes.com/blog/optimize-aiops-with-thousandeyes-mcp-server>
- MTConnect agent and adapter: <https://industrialmonitordirect.com/de/blogs/knowledgebase/mtconnect-data-acquisition-protocol-architecture-and-guide>
- OPC UA MCP server: <https://enterprisedna.co/directories/mcp/kukapay-opcua-mcp>
- Multi-agent maintenance for machine tools (chatbot, solution finder, actor, supervisor): <https://papers.phmsociety.org/index.php/phmap/article/view/4480>
- MA-RCA (RCA, retrieval, validation, report agents): <https://link.springer.com/article/10.1007/s40747-025-02096-0>
