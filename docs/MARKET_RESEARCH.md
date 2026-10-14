# Tolerance: what plants actually want, how they work, and what that means for the product

Research brief, October 2026. Sources are listed at the end. Most come from vendor and trade press, so every number below is a company claim unless marked otherwise. Where a claim could not be verified, it says so.

---

## 1. Bottom line

**Does anyone want this?** Partly. Three parts of the idea have real, evidenced demand. One part is already crowded. One part nobody sells.

| Part of the idea | Evidence of demand | Crowded? |
|---|---|---|
| Turn messy plant data into a usable model fast | Legacy integration is the #1 AI barrier for manufacturers (55% in one US mid-market survey); 45% still siloed; only 27% have a data lake. Cognite and Sight Machine sell exactly this. | **Yes**: Cognite, Sight Machine, HighByte, Litmus, Siemens |
| Root-cause analysis that crosses systems | Unplanned downtime is expensive (Siemens: $2.3M/hour for a large automotive plant). Plants still do RCA by hand (5-Why, fishbone, Pareto) on unreliable reason codes. | Partly: Siemens Industrial Copilot, Oden, Fero, Augury. No public customer case studies on cross-layer RCA were found. |
| Governed, human-approved agents | Trust and culture are cited as the layer under the technical barriers. IT/OT security holds a veto. | Early: HighByte's MCP client and Cognite's permissioned MCP are the closest. |
| **"Connect any telemetry and it works out what kind of plant it is"** | No buyer asked for this by name. It is a *feature* of onboarding, not a product. No published method infers plant type from raw data. | Nobody sells it as such |

**Honest read.** The market wants *faster, safer onboarding of messy data into something trustworthy, then useful answers from it*. "Auto-discover the plant" is a good way to deliver the first half, but it must be sold as shortening onboarding, with a human confirming, not as magic.

**The correction to our current approach.** We asked the user to pick connector tiles. Real clients don't think in connectors. They think in *lines, failures, quality escapes and downtime*, and onboarding is a staged project (scope → pre-check → read-only export → readiness assessment → pilot on one line). The product should look like that.

---

## 2. Who buys and what they actually say

- **Buying is a committee, not a person.** Product call: VP Operations or Digital Transformation. Integration: plant manager or CIO. Maintenance/asset work: reliability director. Security: IT/OT security director, who holds a practical veto. Contract: finance. The control engineer informally vetoes from below. Sales cycles are cited at 6 to 24 months; budgets are approved annually, often in Q4. (Single-vendor frameworks and one practitioner account; directional.)
- **Pilots stall.** 73% of mid-market manufacturers are still testing AI and none reported full deployment (one US survey, dated 2026). Common causes: unclear ownership, data quality, integration, and no path to purchase. Advice repeated across sources: time-box a pilot to 60 to 90 days and design a scale-or-stop decision from day one.
- **Quality, not predictive maintenance, is now the top AI use case.** Rockwell's 2025 survey (about 1,560 manufacturers, 17 countries): 50% plan AI for product quality; 49% for cybersecurity; workforce skills are the top obstacle; 95% plan AI investment over five years. Predictive maintenance used to be first.
- **What the big players sell.**
  - Siemens Industrial Copilot: conversational help for maintenance and PLC engineering; pilots reported about 25% less reactive maintenance time (Siemens' own figure). Onboarding is a staged project: free pre-check, OT/IT assessment, preparation, implementation, acceptance test.
  - BMW's Virtual Factory is a *planning* twin (3D scans plus equipment, logistics, vehicle data in Omniverse, 30+ sites); claims collision checks cut from about four weeks to three days. It is not operational RCA.
  - Cognite: contextualization into a knowledge graph; "Industrial MCP" for agents; quick start "from up to 3 sources in weeks" (marketing).
  - Sight Machine: ISA-95-style asset hierarchy; reviewers say complex plants still need dedicated data engineering during rollout.
- **Price signals.** Mostly undisclosed. One low-end reference: Senseye starts around $7.5 per asset per month. Another unsourced guide says $50 to $200 per asset per month. Treat as orientation only.

---

## 3. How plants actually work

### 3.1 The layers (ISA-95 / Purdue)

| Level | What it is | Typical systems | Data and clock |
|---|---|---|---|
| 0 | The physical process | Machines, materials | none |
| 1 | Sensing and actuation | Sensors, drives, valves | raw signals, milliseconds |
| 2 | Control and supervision | PLC, SCADA, HMI, DCS | states, alarms, setpoints, seconds |
| 3 | Manufacturing operations | **MES**, historian, quality (LIMS/QMS), maintenance (CMMS) | production events, OEE, minutes/shifts |
| 4 | Business | ERP, planning, PLM | orders, materials, days/months |
| 3.5 | IT/OT DMZ (Purdue overlay) | firewalls, brokers | where security enforces boundaries |

Key practical fact: **each level runs on a different clock**, and many integration failures come from pushing raw data at systems built for summaries. Historians usually sit at Level 3; some plants place them at the 2/3 boundary or in the DMZ.

### 3.2 Three kinds of plant, three kinds of data

- **Discrete** (electronics, automotive, appliances): countable units. Data is *event-driven*: unit tracking, counts, equipment states, serial-number genealogy.
- **Process** (chemicals, food, pharma): bulk material. Data is *timestamped measurements*: temperatures, flows, levels; KPIs like rate and yield.
- **Batch**: a flow pattern in either: stops between lots; data is durations, parameters, recipe steps.

This matters for "what kind of plant is it": the *shape* of the data (unit events vs continuous analog vs phased recipes) differs by type and is detectable.

### 3.3 A PCB / SMT line in detail

Flow: solder-paste **printer** → **SPI** (solder paste inspection) → **pick-and-place** → **reflow oven** → **AOI** (automated optical inspection) → optional **X-ray** → through-hole/wave/selective solder → **ICT** or flying-probe → **functional test** → depanel/coat/pack.

What each station produces:
- Printer / placement / reflow: machine states, faults and clearances, recipe changes, material consumption, process parameters.
- SPI: per-pin paste volume, height, position (data feeds SPC).
- AOI: per-component and per-joint verdicts, error codes, measurements; **false calls** (good boards flagged) are a major labour sink at the manual-inspection station.
- ICT / functional test: pass/fail with measurements.
- Traceability by panel and board serial number links every event to a unit.

The standard for this is **IPC-CFX (IPC-2591)**: JSON messages over AMQP 1.0 through a broker, vendor-neutral, no licence fee. Messages include `StationOnline`, `StationStateChanged`, `UnitsInspected`, `ToolChanged`, work started/completed, fault occurred/cleared. Inspection reporting is covered by IPC-2547; assembly equipment by IPC-2546; board-level traceability by HERMES / IPC-1782. EMS (contract manufacturer) MES products such as Aegis FactoryLogix cover NPI, production and analytics, driven heavily by customer traceability requirements (for example European automotive).

**Real public data exists for this line:**
- Siemens AOI false-call dataset (Mendeley, DOI 10.17632/99jzmh9658.1; article CC BY 4.0): 132 days, 440,274 rows, 77 columns, boards flagged by AOI with operator labels (4,622 true defects vs ~435,650 false calls). Anonymised: years set to 1970, features scaled 0 to 1, column names and units removed. Label noise and drift are acknowledged.
- PHME 2022 challenge (with Bitron): SPI pin-level data for 15,387 boards (~6 million pins) with AOI, operator and repair labels, joinable by panel/figure/component IDs. Licence not confirmed.
- Bosch production line (Kaggle): 4 lines, 52 stations, 2 years, very sparse, <1% failures; general assembly, not SMT.
- No open CFX simulator or sample-message corpus was found; only the official SDK, a Node-RED wrapper, and the public demo site.

### 3.4 How root cause is found today

5-Why for a single recurring chain, fishbone (6 Ms) when causes spread, Pareto to decide what deserves an RCA, fault tree / 8D for critical or recurring failures. All depend on **event data quality**: guessed downtime reason codes send the analysis the wrong way; manual logs record long stops well and micro-stops poorly; findings often never become tracked work orders. Typical failure: stopping at the first plausible cause (often "operator error").

---

## 4. What clients will and won't give

### 4.1 What a serious pilot asks for

Compiled from practitioner guidance (no authoritative standard exists; the duration is my inference):
1. Historian tags for the target assets, raw-resolution retention dates, and **gap logs**.
2. PLC/SCADA state and alarm data with tag mapping, units, quality flags.
3. Machine fault logs and MES production events with consistent clocks and asset IDs.
4. Full CMMS work-order exports: failure code, failed component, technician notes.
5. A list of known failures with dates, and **a definition of what counts as a failure**.
6. Planned maintenance and shutdown calendar (so planned stops are not mistaken for failures).
7. Sensor placement and calibration records.
Enough history to contain several events of the target failure mode plus normal periods; if failures are rare, use anomaly detection trained on normal data.

### 4.2 What will actually be hard

- **Labels are the bottleneck.** Failure codes get skipped; free text varies by person and language; the same asset has several spellings (one case: 40% of work orders for one unit used three spellings). Studies cross-check labels across operator records, PLC codes and maintenance notes (two-of-three agreement) with expert review.
- **Cryptic, anonymised data is normal.** Tag names like `4001:Val` carry no meaning without context. The Siemens AOI data was published with names and units stripped; Bosch's likewise. **A product that depends on readable names will fail on real data; it must work from behaviour and structure first, names second.**
- **Cloud egress is the sticking point, not a standard.** IEC 62443 does not mandate on-premise hosting, but each AI call from the OT zone to a cloud API crosses boundaries it was designed to segment, and NIS2 can pull AI providers into scope. In practice: zone-and-conduit design with controlled egress, or edge/on-prem for data that must stay local. Read-only access is expected; I found no public statement of how Siemens enforces it.
- **Trust.** Studies are thin. One controlled study found *local* explanations lowered trust and worsened human-AI performance, and self-reported trust did not track behaviour. A 2019 to 2025 review of 63 papers says human-in-the-loop explainability must match maintenance workflows, and flags generative AI as under-studied. Aim for calibrated reliance, and measure behaviour, not surveys.

### 4.3 What clients readily give vs withhold (inference)

Readily: historian exports of a few lines, downtime logs, quality records, anonymised extracts. Reluctant: live write access, unredacted product/recipe data, anything crossing the DMZ to a public cloud without review. Our read-only, human-approved posture matches this.

---

## 5. The MCP landscape (what "we have MCPs for everything" really means)

MCP is already a commodity layer in industrial software:

- **HighByte Intelligence Hub**: embedded industrial MCP server (July 2025) exposing data pipelines to agents as described tools; **MCP *client* (Nov 2025)** to centrally control third-party MCP servers; ready-made MCP tools for MQTT and OPC UA.
- **Litmus Edge**: MCP server for devices, telemetry, history, containers and data models.
- **Inductive Automation (Ignition)**: MCP module announced Sept 2025, early access only.
- **Cognite**: "Industrial MCP" gives agents the same query, time-series and document tools as Atlas AI, with *the signed-in user's permissions*.
- **Open source**: IndustriAgents' OPC UA MCP (15 tools: browse/read/history/subscribe/alarms/write/method-call, **read-only by default**, `observe` / `operator` / `full` profiles, append-only audit log, secure channel required for control tools; its own README says MCP policy does not replace OPC UA authorisation), a Modbus MCP, and the IndustriConnect suite (Modbus, MQTT/Sparkplug B, OPC UA, BACnet, DNP3, EtherCAT, EtherNet/IP, PROFIBUS, PROFINET, S7comm). Also kukapay and balzangi OPC UA servers.
- Verdantix has a 2026 report profiling ten industrial vendors building MCP capabilities. I found no official Siemens or Rockwell MCP announcement.

**Implication:** being able to read telemetry through MCP is not a moat. Owning the *layer above* is: working out what plant this is, building a human-correctable model, governing every agent call, and learning from verdicts. We should *consume* existing MCP servers as the ingestion edge and govern them, not build protocol connectors.

---

## 6. How to "figure out what kind of plant it is"

No published method infers plant type from raw telemetry (closest: Granger-causality knowledge-graph learning from industrial time series, arXiv 2407.02106; multi-agent LLM time-series annotation, TESSA, arXiv 2410.17462; ontology/semantic-mapping patents that rely on a classifier plus user confirmation). So this would be our own method, and we should present it as a *hypothesis with evidence that a person confirms*, not as ground truth.

A layered fingerprint, strongest evidence first:

1. **Protocol and namespace fingerprints (deterministic).** CFX topics and capabilities (`UnitsInspected`, AOI/SPI/ICT, placement) mean electronics assembly. OPC UA companion specifications identify equipment families: Euromap 77/82/83 for plastics (injection, extrusion, blow), PackML for packaging, VDMA 40010 for robotics, MTConnect for CNC. (Euromap/PackML/VDMA details come from a secondary guide and a spec index; confirm against the OPC Foundation registry before relying on them.) Sparkplug/UNS topic paths follow ISA-95 Enterprise/Site/Area/Line.
2. **Data-shape fingerprints.** Unit-level events with serials and a route (discrete); continuous analog with units like °C, bar, m³/h (process); phased recipe steps with durations (batch); state machines with idle/run/fault (machine-level).
3. **Structure from traceability.** If events carry unit or panel IDs, the **material flow can be discovered, not guessed**: unit passes station A then B. Object-centric process mining (OCEL 2.0) is the established representation for lines where parts, orders and machines interact. This replaces the weak timing inference we tried on 30-second state logs.
4. **Semantics from names and units**, annotated by an LLM, with Brick/Haystack-style tags as the vocabulary, only as supporting evidence because names are often cryptic.
5. **Human confirmation.** Show the hypothesis ("electronics assembly line, 7 stations, flow A→B→C; evidence: …; confidence: …") and let the person correct it. Every correction is versioned; this is the product's actual advantage.

**What LLMs can credibly do here.** Agentic RCA research shows promise on real plant data (AgentRCA: a data-driven digital twin plus tool-using LLM, near-supervised performance without fault-specific training; CausalPulse at AAAI 2026) but I found no benchmark combining real incident labels, measured hallucination, and a safety evaluation. Hallucination is a known risk in process control, with neuro-symbolic verification proposed. So: ground every claim in tool results, show evidence, keep a human approving actions.

---

## 7. What this means for Tolerance

### Where we were wrong
- We led with connector tiles. Clients lead with a **line, a failure or quality problem, and a 60 to 90 day pilot**.
- We treated "plant" as one undifferentiated blob. Plants differ (discrete / process / batch; SMT vs machining vs molding) and the data shapes differ.
- Our floor flows came from timing on a 30-second log: weak. Real flow comes from unit traceability.
- Our "quality" stand-in (SECOM) is semiconductor process data from 2008 with no station context.

### What the evidence supports building (proposals, not yet built)
1. **Pick a wedge: an electronics / SMT line.** Reasons: IPC-CFX gives a standard event vocabulary, real SPI/AOI data is public, quality is the #1 AI use case, and false-call reduction is a concrete, measurable pain. Keep the architecture generic and say so.
2. **"Plant fingerprint" as the first screen after connecting data.** The layered method above, with evidence and a confirm/correct step. Sell it as shortening onboarding.
3. **A readiness assessment instead of a tile grid.** Per layer: what was found, what is missing, how complete, the 12-months-of-one-KPI-in-10-minutes test, label availability. This mirrors the Siemens pre-check and the readiness checklists.
4. **Consume MCP, govern it.** Use existing OPC UA / Modbus / MQTT / database MCP servers as the edge; our Cedar gateway mediates every call, read-only by default, with audit. Position next to HighByte's MCP client.
5. **Discover flow from unit traceability** when present; fall back to "draw it yourself" when not, and say which.
6. **A pilot report card** for the 60 to 90 day pilot: top-1 root cause on past incidents, time to first hypothesis, number of human corrections needed, quality escapes caught. This is the number a buyer can take to a budget meeting, in the same spirit as Siemens' "25% less reactive maintenance time".
7. **ISA-95 / Unified Namespace export** from the compile step, so the model plugs into what plants already run.
8. **Replace SECOM** with the Siemens AOI dataset (licence check) and/or PHME 2022 (licence unconfirmed) so the floor has an inspection station with realistic, labelled, drifting data.

### What to claim, and not claim
- Claim: read-only, human-approved, versioned model correction, governed agents, evidence-grounded diagnoses, shown on real public data.
- Do not claim: that plant type is "auto-detected" without confirmation; that MCP connectors are unique; that the learner beats a fixed strategy (it does not: 0.631 vs 0.672 on 465 recorded incidents); that cross-layer links are proven (the plants in our demo are different datasets, and the link is declared).

---

## 8. What I could not verify, and how to close the gaps

- Siemens or Rockwell MCP announcements; how Siemens enforces read-only OT access; typical onboarding duration; real pricing for Seeq, Augury, Uptake.
- Customer evidence for cross-layer RCA (none found).
- Licences for PHME 2022; exact Euromap/PackML/VDMA identifiers.
- Whether buyers value "auto plant-type discovery" at all.

**Fastest way to close these: talk to 5 to 8 people.** Plant engineers, reliability managers, an MES integrator, an EMS quality engineer. Suggested questions:
1. Walk me through the last time a line went down. Who found the cause, how long, from what data?
2. Where does your downtime and defect data live today? Who can export it, and what would you refuse to share?
3. If I gave you a map of your plant built from your data, what would you check first? What would make you stop trusting it?
4. What would a 60-day pilot have to show for you to ask for a budget?
5. Who else must say yes?

---

## Sources

Demand and market: Siemens True Cost of Downtime 2024 (assets.new.siemens.com TCOD-2024 PDF); Rockwell 2025 State of Smart Manufacturing release; manufacturingdigital.com "Industrial AI barriers"; MarketScale mid-market survey; Cisco/AWS manufacturing brief; ARC Advisory IT/OT buyer pieces; vktr.com on the CIO veto.
Vendors: Siemens Industrial Copilot maintenance (scientific-computing.com, automation.com); Siemens Insights Hub connectivity docs; BMW Virtual Factory (assemblymag.com, newmobility.news); Cognite docs and Industrial MCP; Sight Machine reviews; Fero Labs, Retrocausal, Tulip funding coverage; Aegis FactoryLogix case material.
Plant and PCB: ISA-95/Purdue explainers (itotinsider, teeptrak, symestic); IPC-CFX (electronics.org, europlacer, neotel, AIS); SMT process flow guides; discrete/process/batch practitioner pieces; HiveMQ UNS and Sparkplug.
Data: Siemens AOI dataset (PMC10847760, Mendeley DOI 10.17632/99jzmh9658.1); PHME 2022 challenge and arXiv 2309.03113; Bosch Kaggle (arXiv 1701.00705); readiness checklists (hqsoftwarelab, iiot-world, ifactoryapp); maintenance data quality (NIST maintenance-data slides, oxmaint); RCA practice (fabrico, ifactoryapp).
MCP: IndustriAgents OPC UA / Modbus MCP and IndustriConnect (GitHub); kukapay and balzangi opcua-mcp; HighByte MCP releases (July and Nov 2025); Litmus MCP; Inductive Automation MCP module; Cognite Industrial MCP; Verdantix MCP report listing.
Research: arXiv 2407.02106 (knowledge-graph learning from industrial time series); arXiv 2410.17462 (TESSA); OCEL 2.0 and object-centric process mining (arXiv 2310.11332 and related); P&ID LLM/graph papers (arXiv 2502.18928, 2412.05937); AgentRCA and CausalPulse (AAAI 2026); human-in-the-loop XAI for predictive maintenance review (Coventry); University of Wisconsin trust thesis; hallucination in process control (Processes 14(2), 2026).
