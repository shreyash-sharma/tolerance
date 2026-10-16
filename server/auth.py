"""Sign-in check. In the cloud the app is set up with FIREBASE_WEB_CONFIG (the public web settings of the Firebase project); then every /api call must carry a
Firebase ID token ("Authorization: Bearer ..."), which is verified against Google's public keys. Guests use Firebase anonymous sign-in, so each visitor has an id
and their own plant. With no FIREBASE_WEB_CONFIG (a laptop, the tests) there is no sign-in and everything runs as the user "local"."""
import json, os, threading, time

from google.auth.transport import requests as greq
from google.oauth2 import id_token

try:
    CONFIG = json.loads(os.environ.get("FIREBASE_WEB_CONFIG", "") or "null")
except Exception:
    CONFIG = None
REQUIRED = bool(CONFIG and CONFIG.get("projectId") and CONFIG.get("apiKey"))
PUBLIC = ("/api/jig/auth", "/api/jig/proof", "/api/host/report", "/api/cloud/oauth/callback")   # a host probe proves itself with its own token
_cache, _lock, _req = {}, threading.Lock(), greq.Request()


def verify(token):
    """The user for a valid token, else None. A verified token is remembered until it expires, so Google's keys are not fetched on every call."""
    now = time.time()
    with _lock:
        hit = _cache.get(token)
        if hit and hit["exp"] > now + 30:
            return hit
    try:
        claims = id_token.verify_firebase_token(token, _req, audience=CONFIG["projectId"])
    except Exception:
        return None
    if not claims:
        return None
    user = {"uid": claims.get("user_id") or claims.get("sub"), "email": claims.get("email"), "guest": claims.get("firebase", {}).get("sign_in_provider") == "anonymous", "exp": claims.get("exp", now + 300)}
    with _lock:
        if len(_cache) > 2000:
            _cache.clear()
        _cache[token] = user
    return user
