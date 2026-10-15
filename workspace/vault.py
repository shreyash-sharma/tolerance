"""Passwords and tokens for the owner's own systems. They are encrypted before they are stored, they never go back to the browser, and they are read only at the moment a source connects.
The key comes from TOLERANCE_VAULT_KEY (set it from Secret Manager in the cloud). On a laptop with no key, one is made once and kept in the data folder."""
import base64, hashlib, os

from cryptography.fernet import Fernet, InvalidToken

from plant import core
from workspace import store

_KEY = {}


def _fernet():
    if "f" not in _KEY:
        raw = os.environ.get("TOLERANCE_VAULT_KEY", "")
        if raw:
            key = base64.urlsafe_b64encode(hashlib.sha256(raw.encode()).digest())   # any string works as the setting; it is stretched to a valid key
        else:
            path = os.path.join(core.DATA, "vault.key")
            if not os.path.exists(path):
                os.makedirs(core.DATA, exist_ok=True)
                open(path, "wb").write(Fernet.generate_key())
            key = open(path, "rb").read()
        _KEY["f"] = Fernet(key)
    return _KEY["f"]


def put(secret):
    """Keep a secret for this visitor. Returns a reference to store in place of it."""
    ref = store.new_id("sec")
    token = _fernet().encrypt(str(secret).encode()).decode()

    def f(d):
        d.setdefault("vault", {})[ref] = token
    store.update(f)
    return ref


def get(ref):
    tok = (store.load().get("vault") or {}).get(ref)
    if not tok:
        return None
    try:
        return _fernet().decrypt(tok.encode()).decode()
    except InvalidToken:
        return None


def drop(ref):
    def f(d):
        (d.get("vault") or {}).pop(ref, None)
    store.update(f)
