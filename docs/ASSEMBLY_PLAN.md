# Assembly plan: the parts we take from open source

Rule: we assemble, we do not build the laboratory. Every row is a real repository. Stars, licence and last-push date were read from GitHub on 2026-10-14. Nothing here is installed or tested yet. "Effort" is my estimate.

Naming rule agreed with the owner: every component in the diagram is called an agent, including plain code. Each catalog card carries a small "how it works" label (model-driven, rule-driven or mixed). It costs nothing and protects us in questions.

## 1. The six agents plus gateway, and the parts behind each

| Agent | What we take | Repo | Stars | Licence | What it gives us | Effort |
|---|---|---|---|---|---|---|
| **Document Reader** | LangExtract | [google/langextract](https://github.com/google/langextract) | 38.9k | Apache-2.0 | Extraction with exact source location, parallel chunks, Gemini-native, and an interactive HTML page that highlights each claim in its document. We hand-built the quote check; this replaces it and adds the highlight view. | S to M |
| | Docling or MarkItDown | [docling-project/docling](https://github.com/docling-project/docling), [microsoft/markitdown](https://github.com/microsoft/markitdown) | 68.9k, 190k | MIT | PDF, Word, Excel, PowerPoint to clean text. Lets customers drop real files, not only text. | S |
| | LLM Guard | [protectai/llm-guard](https://github.com/protectai/llm-guard) | 3.2k | MIT | A prompt-injection scanner (replaces our short pattern list). Needs a model download. | S |
| **Connector Scout** | Ready MCP servers | [kukapay/opcua-mcp](https://github.com/kukapay/opcua-mcp), [kukapay/modbus-mcp](https://github.com/kukapay/modbus-mcp), [ezhuk/mqtt-mcp](https://github.com/ezhuk/mqtt-mcp), [crystaldba/postgres-mcp](https://github.com/crystaldba/postgres-mcp), [googleapis/mcp-toolbox](https://github.com/googleapis/mcp-toolbox) | 30, 25, 25, 3.4k, 16.7k | MIT, Apache-2.0 | The connectors the customer "plugs in". The Scout only discovers and profiles them (MCP lists tools itself). Several expose raw writes; we wrap them read-only. | S each |
| | MTConnect | [mtconnect/cppagent](https://github.com/mtconnect/cppagent), [Ladder99/fanuc-driver](https://github.com/Ladder99/fanuc-driver) | 182, 143 | Apache-2.0 | The standard machine-tool data agent and a Fanuc collector. No MTConnect MCP server exists yet. | M |
| **Plant Modeler** | React Flow | [xyflow/xyflow](https://github.com/xyflow/xyflow) | 38.7k | MIT | The 2D plan: stations as nodes, flows as edges, badges for ghost, conflict and gap. Crosswork-style diagram. | S to M |
| | Eclipse BaSyx | [eclipse-basyx/basyx-python-sdk](https://github.com/eclipse-basyx/basyx-python-sdk) | 105 | MIT | The Asset Administration Shell, the Industry 4.0 standard for a digital twin. Export our model in it for credibility. | M |
| | Splink | [moj-analytical-services/splink](https://github.com/moj-analytical-services/splink) | 2.5k | MIT | Name matching at scale ("R1 is TR"). Our data is small; take it only if a customer file is large. | S |
| | Graphiti or LightRAG | [getzep/graphiti](https://github.com/getzep/graphiti), [HKUDS/LightRAG](https://github.com/HKUDS/LightRAG) | 31.7k, 40.1k | Apache-2.0, MIT | A knowledge graph with provenance. Heavy (needs a graph database). Probably skip for the hackathon. | L |
| **Diagnosis** | AssetOpsBench | [IBM/AssetOpsBench](https://github.com/IBM/AssetOpsBench) | 2.4k | Apache-2.0 | Five industrial MCP servers (IoT, failure modes, time-series models, work orders, vibration), four agent frameworks, and an LLM-judge scoring method. Accepted at KDD 2026. | M |
| | PyRCA and OpenRCA | [salesforce/PyRCA](https://github.com/salesforce/PyRCA), [microsoft/OpenRCA](https://github.com/microsoft/OpenRCA) | 572, 434 | BSD-3, MIT | Root-cause algorithms and an LLM root-cause benchmark. We already beat official BARO on RCAEval; these add credibility. | S |
| **Verifier** | DeepEval and Ragas | [confident-ai/deepeval](https://github.com/confident-ai/deepeval), [vibrantlabsai/ragas](https://github.com/vibrantlabsai/ragas) | 18.9k, 16k | Apache-2.0 | Faithfulness and hallucination scores. Use them as the critic's score and in the tests. | S |
| | promptfoo | [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | 26k | MIT | Red-team and regression suite. Produces the "measured" numbers for the deck. | S |
| **Remediation Planner** | AssetOpsBench work-order server | same repo | | Apache-2.0 | A full work-order lifecycle (create, approve, assign, close) with a read-only switch. The place the plan lands. | M |
| | Strands Agent SOP | [strands-agents/agent-sop](https://github.com/strands-agents/agent-sop) | 1.2k | Apache-2.0 | A format for SOPs as agent workflows. Fits "SOP becomes a runbook". Not yet read in detail. | S |
| | LangGraph or ADK approval step | [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | 43.3k | MIT | Pause and resume for human approval. | S |
| **Policy Gateway** | We keep our Cedar gateway as the decision point. | [cedar-policy/cedar](https://github.com/cedar-policy/cedar) | 1.8k | Apache-2.0 | Already built and tested. | done |
| | A front door for MCP | [IBM/mcp-context-forge](https://github.com/IBM/mcp-context-forge), [agentgateway/agentgateway](https://github.com/agentgateway/agentgateway) | 4.6k, 5.3k | Apache-2.0 | A registry, auth, rate limits, audit and plugins. ContextForge reports a Cedar or OPA decision point. Choose one after a short test. | M |

## 2. Framework and shipping (the Google fit)

| Part | Repo | Stars | Licence | Why |
|---|---|---|---|---|
| Agent Development Kit | [google/adk-python](https://github.com/google/adk-python) | 21.8k | Apache-2.0 | Coordinator, sequential, parallel and loop agents; built-in evaluation and a trace UI; Gemini-native. Host the new agents here. |
| ADK recipes | [google/adk-recipes](https://github.com/google/adk-recipes) | 10.5k | Apache-2.0 | Reference patterns and plugins. |
| Agent Starter Pack | [GoogleCloudPlatform/agent-starter-pack](https://github.com/GoogleCloudPlatform/agent-starter-pack) | 6.6k | Apache-2.0 | Ship agents to Cloud Run with CI and observability. Meets the hackathon's Cloud Run need. |
| A2A SDK | [a2aproject/a2a-python](https://github.com/a2aproject/a2a-python) | 2.2k | Apache-2.0 | Optional. Our agents live in one platform, so we may not need it. |

## 3. The probe (the ThousandEyes philosophy: observers in many places, compare the views)

| Part | Repo | Stars | Licence | Role |
|---|---|---|---|---|
| Telegraf | [influxdata/telegraf](https://github.com/influxdata/telegraf) | 17.9k | MIT | The installable observer. It already has inputs for OPC UA, Modbus, MQTT, Siemens S7, HTTP and files. Config files become the "tests". |
| OpenTelemetry Collector, Grafana Alloy | [open-telemetry/opentelemetry-collector](https://github.com/open-telemetry/opentelemetry-collector), [grafana/alloy](https://github.com/grafana/alloy) | 7.7k, 3.6k | Apache-2.0 | Alternatives to Telegraf. |
| OPC UA library | [FreeOpcUa/opcua-asyncio](https://github.com/FreeOpcUa/opcua-asyncio) | 1.5k | LGPL-3.0 | Use as a library (we already run an OPC UA simulator). |
| Node-RED OPC UA | [mikakaraila/node-red-contrib-opcua](https://github.com/mikakaraila/node-red-contrib-opcua) | 266 | other | Low-code option. |

The vantage-point comparison (what the controller reports versus what an independent probe measures) is our own small rule on top. No part gives it to us.

## 4. Analytics agents (phase 2)

| Agent | Part | Repo | Stars | Licence |
|---|---|---|---|---|
| Process Drift | Evidently, PyOD, River | [evidentlyai/evidently](https://github.com/evidentlyai/evidently), [yzhao062/pyod](https://github.com/yzhao062/pyod), [online-ml/river](https://github.com/online-ml/river) | 8k, 10k, 6.1k | Apache-2.0, BSD |
| Combination Analyst | Our own small code on alert history (no good ready part found) | | | |
| Shift Reporter | A plain template over telemetry, with Gemini for the text | | | |

## 5. Recommended order

1. **LangExtract in the Document Reader.** Small. Gives the interactive highlight view.
2. **React Flow for the 2D overview.** Small. It is the Crosswork-style picture.
3. **ADK as the host for the new agents** (Verifier, Planner, Line Query), with Agent Starter Pack for Cloud Run.
4. **AssetOpsBench servers: work orders and failure modes first.** Then vibration if we have data.
5. **Telegraf as the probe**, pointed at our OPC UA simulator and a CSV, with two instances to show two vantage points.
6. **DeepEval and promptfoo** for the Verifier tests and the numbers.
7. **ContextForge or agentgateway** as the MCP front door, after a one-hour test.

## 6. Risks and limits

- Nothing is installed or run yet. Effort figures are my judgement.
- AssetOpsBench ships simulated chiller data, not a line like ours. We take its servers and methods, not its data.
- ContextForge and agentgateway may be heavy (extra services). Test before committing.
- Avoid AGPL parts (octelium, pullmd appeared in results). Telegraf, LangExtract, ADK and the rest above are MIT or Apache-2.0. opcua-asyncio is LGPL: fine as a library.
- LLM Guard downloads a model for injection detection. Ask before downloading.
- Strands Agent SOP and agentgateway were not read in detail.
- Searches for ready-made manufacturing agent repositories returned nothing useful. There may be some I did not find.
