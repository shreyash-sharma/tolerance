# Tolerance: the Symbiotic Compiler

Tolerance is a workspace a plant operator uses. They bring their data (upload files, give a database or API URL, or attach a sample estate), review and correct what the system understood, operate from dashboards, work incidents with a governed Gemini investigator, and the system learns from their decisions. Built for the Google Cloud AI Builder Cup, Manufacturing theme.

```
Connect -> Discover -> Compile -> Isolate -> Twin -> Shadow -> Learn -> Recover
```

## Run it

```bash
python -m venv .venv && .venv/Scripts/activate        # use bin/activate on Linux/macOS
pip install -r requirements.txt
echo GEMINI_API_KEY=your-key > .env                    # or Vertex AI, see DEPLOY.md
python -m uvicorn server.app:app --port 48410
# open http://localhost:48410  -> the workspace (Overview, Data, Model, Operations, Incidents, Agents & policy, Learning)
#                                  http://localhost:48410/tour.html  -> the guided, automated tour
python -m tests.smoke                                  # end-to-end assertions (set TOLERANCE_DATA / TOLERANCE_PORT to scratch values)
python -m tests.connectors_test                        # snapshot + live increments across every connector
python -m tests.workspace_flow                         # drives the workspace API like a person: data, corrections, incidents, learning (needs a running server)
```

Deploy to Cloud Run: see [DEPLOY.md](DEPLOY.md).

## What is real

| Piece | What it is |
|---|---|
| **Machine data** | The published Industry 4.0 Lab state log (University of Southern Denmark, Zenodo 5078737, CC BY 4.0): 179,454 real state rows from six assets over six days, including real failures. The first 24,000 rows are the setup snapshot; the rest arrive live after you connect. |
| **Connectors** | Built on **dlt**. Wired and running: SQL (SQLite and a real **PostgreSQL** server), REST/OpenAPI, OPC UA, trace files. Each loads once at setup (snapshot), then only what is new moves (incremental cursors). Everything lands in a DuckDB lake. The catalog also lists what the same layer supports but is not wired here (MySQL/SQL Server/Oracle, S3/GCS, change capture via Debezium or dlt `pg_replication`, MongoDB, Kafka, MQTT via Telegraf, warehouses), marked honestly as *available* or *bridged*. |
| **Physical model** | Implements the process-mining reliability approach of Friederich and Lazarova-Molnar (Winter Simulation Conference 2022, "Data-driven reliability modeling of smart manufacturing systems using process mining"): failure and repair episodes from state logs, fitted time-to-failure and time-to-repair distributions, a stochastic Petri net, Monte Carlo reliability assessment. Evidence-thin assets fall back to a memoryless model and are flagged. Hold-out validation and a learning curve are computed from the data. |
| **Digital model** | Discovery reads an OpenAPI document, an OPC UA server, function manifests, document-store schemas and OpenTelemetry-shaped traces. An edge is asserted only if it was observed running; declared-only edges and mixed-identifier fields go to an uncertainty list. Entity resolution uses value containment between identifier fields (the inclusion-dependency idea behind classic schema matching). Scored against a sealed ground truth. |
| **Gemini** | (1) names the entity classes the compiler discovers; (2) the RCA investigator: Gemini function calling over the tools, handed a digest of the compiled model; (3) the shift advisory over the reliability model. Model rotation across quotas, a fast fall-back to a rule-based investigator, and every fall-back is labelled. |
| **Governance** | Default-deny policy in **Cedar** generated from the graph and enforced on every tool call by a gateway (cedarpy). Recovery is rehearsed in an isolated replica and checked by a deterministic gate (idempotency, single ERP write, postconditions); applying needs the gate *and* a person. An MCP Toolbox config and an Asset Administration Shell export (Eclipse BaSyx SDK) are emitted from the same graph. |
| **Shadow mode** | Forecasts and diagnoses are SHA-256 committed (salted) before the outcome exists, then scored: physical forecasts against rows that arrive after sealing, incident diagnoses against a sealed injector log. |
| **Model review** | `interpret/`: profiles every table in the lake (types, roles, identifiers), finds machine state logs, proposes what each status code means, groups identifier columns that hold the same entity, finds inclusion-dependency links, and (with the sample estate) imports the dependency graph. Gemini adds plain-language meaning. Each belief has a confidence and evidence; the person approves, edits, rejects or answers. Corrections are versioned and change downstream behaviour: the state mapping defines failures and forecasts, rejected dependencies leave the graph and the agent digest, boundaries are regenerated. |
| **Incidents and learning** | Incidents come from the plant software (simulated faults, run for real) and from the live machine data (real failures). The person picks an investigation order (the bandit recommends one), reads Gemini's evidence, tests recovery in a replica, and decides. Each decision is a reward for the bandit, persisted in an event log and replayed on start. A time-lapse replays recorded incidents to show experience accumulating. |
| **SAGE** | Contextual bandit (Vowpal Wabbit `cb_explore_adf`) plus memory lookup choose which investigation order to try first, evaluated on held-out incidents against fixed, random, memory and oracle policies, with a sensitivity analysis on how informative the first alert is. |

## What is not (read this before quoting numbers)

- The machine log is real. The **software layer is synthetic** (a simulated EV plant: ERP, queues, functions, a document store). No dataset couples physical and software layers; Tolerance's physical-state tool lets the investigator rule the physical line in or out, but the coupling in the demo is by design, not recorded.
- The lab log's failures are brief (seconds to minutes) and its durations are partly deterministic, so reliability forecasts are modest and some assets have few failures. The console says so ("thin evidence").
- Perfect edge scores on a small synthetic software estate show the method works end to end, not that a real estate will score the same.
- On the SAGE benchmark the adaptive selector beats the best fixed investigation order only when the first alert is informative about the failing layer; a simple memory lookup matches the bandit at this size. All diagnoses in that benchmark come from the rule-based investigator.
- The structural twin is reconstructed; behavioural fidelity needs calibrated simulation models.
- The MCP Toolbox YAML is emitted, not executed; the demo enforces the Cedar form in-process.
- Gemini access during development used a free-tier key with strict daily quotas; production runs should use Vertex AI (see DEPLOY.md).

## Layout

```
plant/       synthetic plant, MES feed from the real log, embedded PostgreSQL, incident injector, sealed ground truth
connectors/  dlt-based snapshot-then-live ingestion and the connector catalog
physical/    reliability model, forecasts, sealed forecasts, learning curve
compiler/    discovery connectors, OIR compiler, Gemini naming, scorer
fabric/      boundary emission, Cedar gateway, agents (Gemini + rule-based), recovery and gate
shadow/      sealed-prediction replay, SAGE
server/      FastAPI API
ui/          the mission canvas (physical line below, discovered digital layer above)
seed/        data shipped in the image (the unmodified published log, the incident library)
```

## Related work and tools used

- Reliability modelling from state logs with process mining: Friederich and Lazarova-Molnar, WSC 2021/2022; dataset: SDU Industry 4.0 Lab, Zenodo 5078737.
- Ingestion: dlt; change capture patterns: Debezium; OPC UA: asyncua and Telegraf's OPC UA plugin; embedded PostgreSQL: pgserver.
- Authorization: Cedar (via cedarpy); agent privilege and data-flow control ideas: Progent (arXiv 2504.11703) and CaMeL (arXiv 2503.18813).
- Incident diagnosis with LLMs and retrieval: RCACopilot (arXiv 2305.15778), RCAgent (arXiv 2310.16340); experience-based learning: ExpeL (arXiv 2308.10144).
- Schema matching and dependency discovery that informed the entity resolution: Valentine (arXiv 2010.07386), inclusion-dependency discovery (SPIDER).
- Statistical RCA baselines considered: BARO (arXiv 2405.09330) and the RCAEval benchmark (arXiv 2412.17015); not used in this prototype.
- Learning: Vowpal Wabbit contextual bandits with offline policy evaluation.
- Industrial standards: Asset Administration Shell (Eclipse BaSyx), ISA-95 vocabulary.
