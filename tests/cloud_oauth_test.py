"""Connect Google Cloud: the sealed state, the callback stores the refresh token in the vault, the access token is made from it, disconnect removes it. Run:  python tests/cloud_oauth_test.py"""
import os, sys, tempfile
os.environ["TOLERANCE_DATA"] = tempfile.mkdtemp(prefix="tol_oauth_")
os.environ["GOOGLE_OAUTH_CLIENT_ID"] = "cid"
os.environ["GOOGLE_OAUTH_CLIENT_SECRET"] = "csec"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from urllib.parse import urlparse, parse_qs
from fastapi.testclient import TestClient
from server import cloudsql as C
from server.app import app
from workspace import store, vault

ok = True
def check(name, cond):
    global ok
    print(("PASS " if cond else "FAIL ") + name); ok &= bool(cond)

class R:
    def __init__(s, code, d): s.status_code, s._d = code, d
    def json(s): return s._d
posts = []
def fake_post(url, data=None, **k):
    posts.append((url, dict(data or {})))
    if data.get("grant_type") == "authorization_code":
        import base64, json
        p = base64.urlsafe_b64encode(json.dumps({"email": "boss@plant.com"}).encode()).decode().strip("=")
        return R(200, {"refresh_token": "RT-123", "access_token": "AT-1", "id_token": f"x.{p}.y"})
    if data.get("grant_type") == "refresh_token":
        return R(200, {"access_token": "AT-2", "expires_in": 3600})
    return R(200, {})
C.httpx.post = fake_post
c = TestClient(app, follow_redirects=False)

d = c.get("/api/cloud").json()
check("oauth offered and not connected", d["oauth"]["available"] and not d["oauth"]["connected"])
url = c.post("/api/cloud/oauth/start").json()["url"]
q = parse_qs(urlparse(url).query)
check("consent url has offline, consent, narrow scope", q["access_type"] == ["offline"] and q["prompt"] == ["consent"] and "sqlservice.admin" in q["scope"][0] and "cloud-platform" not in q["scope"][0])
check("redirect uri is the callback", q["redirect_uri"][0].endswith("/api/cloud/oauth/callback"))
r = c.get("/api/cloud/oauth/callback", params={"code": "abc", "state": "forged"})
check("forged state refused", "google=expired" in r.headers["location"] and not store.load().get("google_oauth"))
r = c.get("/api/cloud/oauth/callback", params={"code": "abc", "state": q["state"][0]})
check("callback connects", "google=connected" in r.headers["location"])
g = store.load()["google_oauth"]
check("refresh token only in the vault, encrypted", "RT-123" not in str(store.load()) and vault.get(g["ref"]) == "RT-123")
check("email shown", c.get("/api/cloud").json()["oauth"] == {"available": True, "connected": True, "email": "boss@plant.com"})
check("access token made from refresh token", C._token() == "AT-2")
r = c.get("/api/cloud/oauth/callback", params={"error": "access_denied"})
check("declined is handled", "google=declined" in r.headers["location"])
c.delete("/api/cloud/oauth")
check("disconnect removes it", not store.load().get("google_oauth") and not c.get("/api/cloud").json()["oauth"]["connected"])
check("token revoked at Google", any("revoke" in u for u, _ in posts))
print("ALL PASS" if ok else "SOME FAILED"); sys.exit(0 if ok else 1)
