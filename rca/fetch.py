"""Fetch the real incident archive (RCAEval, CC BY 4.0, authors' Hugging Face copy) into data_real/rcaeval.
Usage: python -m rca.fetch [patterns...]   default: the case index, RE1 (metrics) and RE3 (metrics, logs, traces), about 450 MB."""
import os, sys
from huggingface_hub import snapshot_download
from plant import core

if __name__ == "__main__":
    pats = sys.argv[1:] or ["cases.parquet", "README.md", "re1*", "re3*"]
    dest = os.path.join(core.ROOT, "data_real", "rcaeval")
    snapshot_download("phamquiluan/RCAEval", repo_type="dataset", local_dir=dest, allow_patterns=pats, max_workers=8)
    print("archive at", dest)
