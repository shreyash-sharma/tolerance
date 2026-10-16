"""Model rotation: an overloaded model is skipped at once, then for five minutes after two overloads in a row. Run:  python tests/rotation_test.py"""
import os, sys, tempfile, time
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_rot_")
os.environ["TOLERANCE_PORT"] = "48483"
os.environ["GEMINI_API_KEY"] = "k" * 30
os.environ["TOLERANCE_MODELS"] = "bad,good,other"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fabric import agents as A

calls = []
class M:
    def generate_content(self, model, contents=None, **kw):
        calls.append(model)
        if model == "bad":
            raise RuntimeError("503 UNAVAILABLE. high demand")
        return type("R", (), {"text": "ok"})()
class C:
    models = M()

t = time.time()
assert A.gen_with_retry(C(), model="bad", contents="x").text == "ok"
assert calls == ["bad", "good"], calls            # the next healthy model answered at once
assert time.time() - t < 2, "no waiting when another model is healthy"
A.gen_with_retry(C(), model="bad", contents="x")   # second overload in a row: the model is skipped for five minutes
assert A._dead.get("bad", 0) > time.time() + 200
n = len(calls)
A.gen_with_retry(C(), model="bad", contents="x")
assert calls[n:] == ["good"], calls[n:]            # the unhealthy model is not even tried
A._dead.clear(); A._dead.update({"good": time.time() + 999, "other": time.time() + 999})
try:
    A.gen_with_retry(C(), tries=2, max_wait=1, model="bad", contents="x"); raise SystemExit("should fail when every model is unhealthy")
except RuntimeError:
    pass
print("rotation_test ok")
