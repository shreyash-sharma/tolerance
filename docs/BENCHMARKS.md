# Benchmarks: root-cause analysis on RCAEval

What this shows: on the standard microservice root-cause benchmark, run through the benchmark authors' own code and scorer, our pipeline beats the published method on RE1 and gives a mixed result on RE3. Everything below is reproducible from this repository.

## Protocol

- **Data:** RCAEval (Pham et al.), the real fault-injection cases on Online Boutique (OB), Sock Shop (SS) and Train Ticket (TT). RE1 = metrics only (375 cases: 25 per system per fault; we report CPU, MEM, DELAY, LOSS as the BARO paper does; DISK cases are in the data but not in that table). RE3 = multi-source, code-level faults (90 cases: metrics, logs, traces).
- **Task:** given the alert time, rank the services; the injected service is the answer.
- **Scorer:** RCAEval's own `Evaluator` (the file shipped in `pip install RCAEval`). Coarse-grained = root-cause service. `AC@k`, and `Avg@5 = mean(AC@1..AC@5)`. No re-implementation of the metric.
- **Baseline:** the authors' own `baro()` (RobustScaler on the pre-alert window, score = maximum robust z-score per metric), loaded from the package, run on the same cases. It is the `RobustScorer[t_inject]` row of the BARO paper (given the true injection time).
- **Our pipeline:** a robust level-shift score per service over metrics, plus trace error-rate/latency change and log error-rate change where those exist, fused by reciprocal-rank fusion. Gemini is *not* used for these numbers (see "Not yet measured").

## Sanity check: does our harness reproduce the paper?

| | Published (BARO paper, Table 3) | Official `baro()` on our copy of the data |
|---|---|---|
| Online Boutique | 0.86 | 0.867 |
| Sock Shop | 0.95 | 0.954 |
| Train Ticket | 0.79 | **0.652** |

Online Boutique and Sock Shop reproduce to two decimals, so the data handling and scoring are right. **Train Ticket does not reproduce (0.652 vs 0.79).** We have not resolved why (RE1's Train Ticket data may differ from the paper's, or a preprocessing detail). We report our own run of the official code as the baseline and show the published number beside it.

## RE1 (metrics only), coarse Avg@5, mean over CPU / MEM / DELAY / LOSS

| Method | OB | SS | TT |
|---|---|---|---|
| BARO, official code (metric-level top-k) | 0.869 | 0.954 | 0.652 |
| BARO, one slot per service (fairness check) | 0.869 | 0.958 | 0.662 |
| **Ours: robust shift per service** | **0.914** | **0.976** | **0.848** |
| BARO + ours, fused | 0.924 | 0.978 | 0.808 |
| Published BARO (paper) | 0.86 | 0.95 | 0.79 |

AC@1: official BARO 0.745 / 0.84 / 0.49; ours 0.816 / 0.90 / 0.63 (OB / SS / TT).

The one-slot-per-service row exists because BARO's metric-level top five can spend several slots on one service while ours ranks distinct services; collapsing BARO to services changes almost nothing, so our margin is not a formatting artefact. Two OB cases (of 100) crash inside the official BARO code and are skipped for that method (98 scored).

## RE3 (multi-source, code-level faults), coarse Avg@5, mean over f1-f5

| Method | OB | SS | TT |
|---|---|---|---|
| BARO, official code | 0.733 | 0.700 | 0.940 |
| Ours: metrics only | 0.713 | 0.560 | 0.067 |
| BARO + ours (metrics), fused | 0.787 | 0.840 | 0.773 |
| BARO + ours + traces + logs, fused | 0.667 | 0.907 | 0.967 |

No single fixed fusion wins every cell. Our metric-only score collapses on RE3 Train Ticket (about 100 services; code-level faults do not always move metrics).

### Honest estimate: weights chosen by cross-validation

Fusion weights (BARO, ours, traces, logs) were searched on a fixed grid with **leave-one-group-out cross-validation** (groups = suite x system), so each score below comes from weights that never saw that group.

| Held-out group | Avg@5 (CV) | Official BARO | |
|---|---|---|---|
| RE1 OB | 0.906 | 0.869 | beats |
| RE1 SS | 0.978 | 0.954 | beats |
| RE1 TT | 0.744 | 0.652 | beats our run of BARO; below the paper's 0.79 |
| RE3 OB | 0.480 | 0.733 | **loses** |
| RE3 SS | 0.893 | 0.700 | beats |
| RE3 TT | 0.707 | 0.940 | **loses** |

**Summary:** RE1 is a clear win (3 of 3 against official BARO as run here, 2 of 3 against the published numbers). RE3 is mixed: 1 of 3 under cross-validation.

## Research summary (`python -m bench.research`)

Read from the per-case rankings in `bench/results/components.json` and the 465 scored incidents in `seed/jig_backtest.json`. No downloads. Every interval is a 95% percentile bootstrap over cases (10,000 resamples, seed 7); differences are paired. Output: `bench/results/research.json`.

**Q1, RE1 metric-only faults (298 cases, four faults).** Tolerance minus official BARO, Avg@5: all +0.083 [+0.05, +0.12]; Train Ticket +0.186 [+0.10, +0.27]; Online Boutique +0.045 [-0.01, +0.10]; Sock Shop +0.018 [-0.01, +0.05]. By fault, BARO to ours: CPU 0.911 to 0.992, disk 0.907 to 0.968, delay 0.829 to 0.845, loss 0.592 to 0.835, memory 0.984 to 0.979.

**Q2, RE3 code-level faults (30 cases per system).** Metrics alone lose (Train Ticket 0.067). BARO + ours + traces + logs minus BARO: all +0.051 [-0.00, +0.11]; Sock Shop +0.193 [+0.11, +0.29]; Train Ticket +0.027 [-0.03, +0.10]; Online Boutique -0.067 [-0.17, +0.05]. We do not claim a win on RE3 overall.

**Q3, the safety gate (465 incidents).** Diagnosis correct in 75.1%. As a predictor of a correct diagnosis the Warden score has AUROC 0.46 and plain confidence 0.73, so the score does not find wrong diagnoses. It bounds harm: at the default limit 149 incidents run alone with 29 wrong and harm 0.0 (reversibility-weighted, from the action table), against 19 wrong and harm 2.6 for the same number chosen by confidence alone, and 116 wrong and harm 4.8 when everything runs alone. Using both (gate, then confidence), 100 run alone with 11 wrong and harm 0.0, against 9 wrong and harm 1.1 for confidence alone.

**Threats.** RCAEval is microservice software, not a factory. The probes were developed on these cases. Harm uses our own reversibility table. The backtest uses the metrics-first diagnosis, not Gemini. Our run of BARO on Train Ticket (0.652) is below the paper's 0.79.

## Not yet measured (do not claim)

- **The Gemini agent at scale.** We recorded 8 live investigations (7 of 8 correct, tiny sample, not a benchmark). Code-level faults (RE3) are where reading log text should help, but a full RE3 run needs about 90 cases x several tool calls, which the free key's quota cannot cover. This is the most likely route to winning RE3.
- **RE2** (270 cases, the paper's main table): data not downloaded.
- **Fine-grained (metric-level) accuracy** for our pipeline: we rank services, not metrics, so we make no fine-grained claim.
- **Other baselines** (CIRCA, RCD, CausalRCA, N-Sigma, EasyRCA, MicroRank, TraceRCA, PDiagnose): their code needs heavier dependencies (causal discovery libraries) than our environment installs; published numbers for them are in the RCAEval and BARO papers.

## Reproduce

```bash
python -m rca.fetch                         # RE1 + RE3 from Hugging Face into data_real/rcaeval
pip install RCAEval --no-deps --target data_real/rcaeval_pkg
pip install scikit-learn scipy pypdf
python -m bench.run_rcaeval RE1 RE3         # official BARO vs ours, per fault
python -m bench.variants RE1 RE3            # fusion variants, one scorer
python -m bench.cvfuse                      # cross-validated weights
```

Raw outputs: `bench/results/*.json`. The official files are loaded by `bench/official.py` (the package's heavy `__init__` chain is bypassed; BARO and the Evaluator are the authors' unmodified files).

## References

- Pham, Ha, Zhang. *BARO: Robust Root Cause Analysis for Microservices via Multivariate Bayesian Online Change Point Detection*, FSE 2024 (Table 3 coarse, Table 4 fine).
- Pham et al. *RCAEval: A Benchmark for Root Cause Analysis of Microservice Systems with Telemetry Data*, WWW 2025 companion (arXiv 2412.17015): datasets, Avg@k definition, Table 6.
