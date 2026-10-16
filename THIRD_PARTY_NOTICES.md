# Third-party notices

Tolerance uses the open-source parts and public data below. Each keeps its own licence. This list names the main ones; each package's own licence file in its repository or in `node_modules` and the Python environment applies in full.

## Code copied into this repository

| Part | Where | Licence |
|---|---|---|
| Anatomy kit (`iso-kit.mjs`) by Ryan, https://github.com/wheresryan22/anatomy | `deck/kit/`, `web/public/deck/kit/`, `deck/scripts/` | MIT. The licence text is in `deck/LICENSE-anatomy.txt` |

## Libraries used (installed, not copied)

| Library | Used for | Licence (as published by the project) |
|---|---|---|
| Pascal Editor (`@pascal-app/*`) | 3D factory | MIT |
| Next.js, React | Screens | MIT |
| three.js | 3D | MIT |
| Kenney Factory Kit 3.0 (`web/public/models/factory`) | 3D machine models | CC0 |
| FastAPI, Uvicorn | Backend | MIT / BSD-3-Clause |
| DuckDB | Data lake | MIT |
| dlt | Connectors | Apache-2.0 |
| Model Context Protocol Python SDK (`mcp`) | Tool layer | MIT |
| cedarpy (Cedar policy language) | Policy gateway | Apache-2.0 |
| Vowpal Wabbit | Contextual bandit | BSD-3-Clause |
| asyncua | OPC UA | LGPL-3.0, used unmodified as a library |
| google-genai | Gemini client | Apache-2.0 |

Licences above are from our notes on each project and should be re-checked against the package metadata before a release.

## Added libraries

| Library | Use | Licence |
|---|---|---|
| reactflow 11 | The playbook canvas | MIT |

The Sentinel rule engine, the playbooks and the notification channels are new code. Their shape follows the author's own Kanshi project (assertions, reflexes, notification providers); no code from the third-party projects kept inside that repository is used.

## Data

| Data | Source | Licence |
|---|---|---|
| Machine state log | Industry 4.0 Lab, University of Southern Denmark, Zenodo record 5078737 | CC BY 4.0 |
| Incident cases | RCAEval benchmark datasets | See the RCAEval project |
| Inspection data | UCI SECOM | See the UCI repository |
