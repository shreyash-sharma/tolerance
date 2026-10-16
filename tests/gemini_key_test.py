"""A visitor's own Gemini key: kept encrypted, used for their calls only, and the shared daily cap does not apply to it. Run:  python tests/gemini_key_test.py"""
import os, sys, tempfile
DATA = tempfile.mkdtemp(prefix="tol_key_")
os.environ["TOLERANCE_DATA"] = DATA
os.environ["TOLERANCE_PORT"] = "48481"
os.environ["GEMINI_API_KEY"] = "shared-key-shared-key-shared"
os.environ["GEMINI_DAILY_CAP"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fabric import agents as A
from workspace import store, vault

assert A.user_key() is None
A.count_call()
try:
    A.count_call(); raise SystemExit("the shared cap should stop the second call")
except RuntimeError:
    pass
A.mark_busy("Gemini is under heavy load")
assert A.busy()

ref = vault.put("user-own-key-0123456789abcdef")
store.update(lambda d: d.update(gemini_key=ref))
assert A.user_key() == "user-own-key-0123456789abcdef"
raw = "".join(open(os.path.join(d, f), encoding="utf-8", errors="ignore").read() for d, _, fs in os.walk(DATA) for f in fs if f.endswith(".json"))
assert "user-own-key" not in raw, "the key must be encrypted at rest"
A.count_call(); A.count_call()          # their own key: the shared cap does not stop them
assert A.busy() == "", "no shared-load notice for a visitor with their own key"
seen = {}
import google.genai as G
G.Client = lambda **kw: seen.update(kw) or object()
A.make_client()
assert seen.get("api_key") == "user-own-key-0123456789abcdef", seen

store.update(lambda d: (vault.drop(d.get("gemini_key")), d.pop("gemini_key", None)))
assert A.user_key() is None and A.busy()
print("gemini_key_test ok")
