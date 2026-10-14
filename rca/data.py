"""Access to the real incident archive (RCAEval: real fault-injection cases on Online Boutique, Sock Shop and Train Ticket, with the root-cause
service recorded). Each case is a folder of Parquet telemetry: metrics for every case, logs and traces for the multi-source ones.
Tools read a case's telemetry on demand, the way an observability backend would be queried; the lake holds the catalogs and the live alert feed."""
import functools, os, re
import numpy as np
import pandas as pd

from plant import core

ROOT = os.environ.get("TOLERANCE_ARCHIVE") or os.path.join(core.ROOT, "data_real", "rcaeval")
NOT_SERVICE = {"main", "PassthroughCluster", "time"}
FAMILY_RE = re.compile(r"^(?P<svc>.+)_(?P<fam>cpu|mem|load|latency-\d+|error|diskio|socket|workload|traffic|[a-z]+)$")
_idx = {"df": None}


def available():
    return os.path.exists(os.path.join(ROOT, "cases.parquet"))


def index():
    if _idx["df"] is None:
        c = pd.read_parquet(os.path.join(ROOT, "cases.parquet"))
        c = c[[os.path.isdir(os.path.join(ROOT, x)) and os.path.exists(os.path.join(ROOT, x, "metrics.parquet")) for x in c["case"]]].reset_index(drop=True)
        _idx["df"] = c
    return _idx["df"]


def case_row(case):
    r = index()
    x = r[r.case == case]
    return x.iloc[0].to_dict() if len(x) else None


@functools.lru_cache(maxsize=24)
def metrics(case):
    df = pd.read_parquet(os.path.join(ROOT, case, "metrics.parquet"))
    return df.sort_values("time").reset_index(drop=True)


@functools.lru_cache(maxsize=8)
def traces(case):
    p = os.path.join(ROOT, case, "traces.parquet")
    return pd.read_parquet(p) if os.path.exists(p) else None


@functools.lru_cache(maxsize=8)
def logs(case):
    p = os.path.join(ROOT, case, "logs.parquet")
    return pd.read_parquet(p) if os.path.exists(p) else None


def inject_time(case):
    return int(float(open(os.path.join(ROOT, case, "inject_time.txt")).read().strip()))


def split_series(name):
    m = FAMILY_RE.match(name)
    return (m.group("svc"), m.group("fam")) if m else (None, None)


def services_of(df):
    out = {}
    for c in df.columns:
        if c == "time":
            continue
        s, f = split_series(c)
        if s and s not in NOT_SERVICE:
            out.setdefault(s, []).append((c, f))
    return out


def coverage(case):
    r = case_row(case)
    return "mlt" if r and r["has_traces"] else "ml" if r and r["has_logs"] else "m"
