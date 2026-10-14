# 3-minute demo: a person using Tolerance

Nothing here is automated. A single operator brings data, checks what the system understood, corrects it, works an incident and watches the system learn from those decisions. The simulator dock (bottom right) only stands in for the plant so events happen without waiting a shift; say so once.

Start from a clean workspace: Simulator dock -> *Reset workspace*. Weighting: Gen AI and technical merit 40, problem and impact 25, innovation 25, UX 10.

| Time | You do | You say |
|---|---|---|
| 0:00 | Overview, empty state | "An operator opens Tolerance with no setup. It starts empty. They bring their own data." |
| 0:08 | Data -> drop `machine_log_sample.csv`, then `vehicle_orders.db` | "A real machine state log from a manufacturing lab, and an orders database. Each source loads once, the snapshot. After that only new rows move." |
| 0:28 | Model: read the machine-state card | "Now the part that matters: what did it understand? Gemini wrote what each table is. For the machine log it guessed that code 0 is busy. It says it is only 50% sure. This decides what counts as a failure." |
| 0:45 | Correct the mapping (0 idle, 1 busy, 2 failed), approve the rest, *Apply corrections & rebuild* | "I correct it. The model rebuilds and says exactly what changed downstream." |
| 1:00 | Operations | "Every dashboard now uses my definition of failure: fleet, MTBF, availability, the failures timeline, and the probability of a failure in the next four hours. The model improves as data grows, shown here. Gemini turns it into an advisory that only proposes." |
| 1:20 | Data -> Sample estate (or already attached); Model -> Dependencies map, click one edge to reject it | "With an ERP, queues and functions attached, the system also maps dependencies. I reject one it should not have inferred. Boundaries for the agents are regenerated from my corrected model." |
| 1:40 | Simulator -> Trigger incident; open it in Incidents | "A software incident arrives: vehicles built, no traceability record. The operator suspects a scan." |
| 1:50 | Step 1: look at the recommendation, then Investigate (Gemini) | "The learner recommends where to look first. It has seen no decisions yet, so it does not know. I follow it. Gemini investigates through the policy gateway." |
| 2:05 | Step 2-3: read the evidence, test *Replay the window* then *Idempotent repair* | "Root cause with evidence. The obvious fix is blocked by the gate: it would duplicate records. The safe one passes in a replica." |
| 2:25 | Step 4: *Approve and apply* | "Nothing acts without me. Applying needs the gate and my approval. My decision is feedback." |
| 2:35 | Learning: *Replay 80 past incidents* | "Every decision, mine and the recorded ones, trains a contextual bandit. After experience it prefers station first when an operator reports it, traces first when the dead-letter alert fires." |
| 2:52 | Agents & policy: *Let the agent write to production* | "And every agent call is audited. This one is refused by default-deny policy generated from the model." |

## Deck (PDF), 6 slides
1. Problem: failures cross layers; nobody knows whose; diagnosis is manual. 2. Solution: bring data, review what it understood, operate, learn. 3. How Gemini is used (naming and interpretation, investigator over a compiled model, advisory) with governance around it. 4. What is real: real machine log, real connectors (dlt, PostgreSQL), measured results, honest limits. 5. Impact and scale: no prior data model needed; connector catalog; Cloud Run. 6. Roadmap.

## Judge Q&A
- *Is the data real?* The machine log is the published SDU Industry 4.0 Lab log. The software layer is simulated; the alert metadata is simulated; we say so.
- *What do corrections change?* The state mapping defines every failure and forecast; rejected dependencies leave the graph and the investigator's digest; boundaries are regenerated.
- *How does it learn?* A contextual bandit (Vowpal Wabbit) trained on your decisions plus replayed recorded incidents. Cold at the start, visible shift as decisions accumulate. We report where it does not help.
- *Scale?* dlt connectors, snapshot then incremental; one lake; Cloud Run.
