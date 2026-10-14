"""Load the official RCAEval code (BARO, evaluator) without the package's heavy optional dependencies.
The files are the original authors' (pip install RCAEval --no-deps into data_real/rcaeval_pkg); only the package __init__ chain is bypassed."""
import os, sys, types

PKG = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data_real", "rcaeval_pkg")


def load():
    sys.path.insert(0, PKG)
    e2e = types.ModuleType("RCAEval.e2e")
    e2e.__path__ = [os.path.join(PKG, "RCAEval", "e2e")]
    import RCAEval  # light __init__
    sys.modules["RCAEval.e2e"] = e2e
    from RCAEval.e2e.baro import baro
    from RCAEval.benchmark.evaluation import Evaluator
    from RCAEval.classes.graph import Node
    return baro, Evaluator, Node
