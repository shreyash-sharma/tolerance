# UX review: Nielsen heuristic evaluation, after the design pass

Method: the `nielsen-heuristics` skill (evaluation mode, screenshots, quick form). Evidence: the saved screenshots in `docs/e2e/`. One evaluator (an AI), so it finds about a third of the real problems. This is a clean-in-this-inspection result, not "ready to ship".

## Inventory (what was examined)
Onboard (4 steps, 2D plan, confirm), Operations (answer, diagnosis, verifier, proposals, trace), Warden (two lines, backtest, try-an-action, applied list), Agents (7 cards), Probes, sidebar, and the deck slides. Not observed: the 3D floor (headless Chrome drew it blank), phone width, keyboard-only use, error states.

## Findings by heuristic (severity 0 to 4)

| # | Heuristic | Finding | Evidence | Sev |
|---|---|---|---|---|
| H1 | Visibility of system status | Long Gemini steps (Scout, Modeler, Operations) show only a changed button label. There is no progress for the 10 to 25 second waits. | `Operations`: button text "Agents are working…" only | 3 |
| H1 | | The Warden backtest says "takes about four minutes" on first load with a bare count. Fine, but no progress bar. | Warden, backtest card | 1 |
| H2 | Match with the real world | Gemini sentences are plain, but table roles and the trace still show `telemetry/failure_episodes`, "Cedar ALLOW", "MCP". Fine for judges, strange for an operator. | Scout and trace panels | 2 |
| H3 | User control and freedom | An operator can undo nothing after "Approve". The action is simulated, but the screen does not say how to reverse it. | Operations, after Approve | 2 |
| H3 | | "Clear history" has no confirmation. Low risk (simulator). | Warden, applied card | 1 |
| H4 | Consistency and standards | The old pages (Systems, Connect, Compile, Learning, Review list) use a different look from the new ones. They sit under "Advanced". | Sidebar | 2 |
| H5 | Error prevention | The "Settings (JSON)" box accepts any text. A typo gives an error after the click. | Warden, Try an action | 2 |
| H5 | | The floor and limit sliders cannot cross, and the Save button is disabled until a change. Good. | Warden | 0 |
| H6 | Recognition rather than recall | The 2D plan arrows show their source sentence only on hover. A new user does not know to hover. | Onboard step 3 caption | 2 |
| H7 | Flexibility and efficiency | No shortcut from a failed station on the Floor to the Operations flow. The operator picks the station again from a list. | Operations select | 2 |
| H8 | Aesthetic and minimalist design | Operations still shows four stacked cards (diagnosis, verifier, proposals, trace link) under the answer. The answer card is now first and clear. | Operations screenshot | 1 |
| H8 | | Intro paragraphs on every page are 2 to 3 lines. Better than before, still long. | All pages | 1 |
| H9 | Help users recover from errors | One bare "Internal Server Error" was seen once from the dev proxy. The app now retries once. No friendly message if both attempts fail. | Onboard step 2 (earlier run) | 2 |
| H10 | Help and documentation | No first-run guidance. The app now opens on Onboard, which states the four steps. | Onboard | 1 |

Max severity: 3 (H1). 

## Considered and rejected
- **Dark theme with grey text:** contrast was measured by eye at about 7:1 on the main grey. The dim grey was raised to #8b949e. Not reported.
- **Amber as the only action colour:** intentional. One colour for "do something", red and green only for state.
- **Seven agents shown as cards before any data:** intentional. The catalog is the product's main idea.
- **Technical words in the trace:** hidden by default under "Show the work", so not a main-path problem.

## Top 3 fixes
1. **H1:** show a step list while an agent runs ("Diagnosis: calling tools… Verifier: checking…") instead of one changed button label.
2. **H6:** show the arrow sentence on the 2D plan as visible text on click, with a hint line.
3. **H7:** link a failed station on the Floor straight into Operations with the station already chosen.

## Verification
- Verified from screenshots: Onboard, Operations, Warden, Agents, Probes.
- **Not verified:** 3D floor, phone layout, keyboard-only use, empty and error states, the deck on a projector.

## Verdict
**Needs changes.** No severity-4 finding. One severity-3 finding (H1). Single-evaluator caveat applies.

## Score change since the first review
Before the design pass an Apple-style review scored hierarchy 5/10 and polish 5/10. Fixed since: answer-first Operations, a tidy Warden form with labels, a clean applied list with Clear history, a 6-item sidebar with "Advanced" folded, larger and brighter text, and a visible focus ring. Remaining: the three fixes above.
