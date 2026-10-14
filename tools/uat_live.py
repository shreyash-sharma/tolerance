"""User acceptance test of the live site, signing in with a real email and password.

  1. (optional, --deploy) deploys the current code to Cloud Run
  2. creates the test user in Firebase from the credentials in a text file you fill in
  3. drives the whole app in real Chrome: it logs in through the screen, goes through the first-time flow, the Guide, the tour, Operations, Warden,
     Probes and the deck, and saves a screenshot of every step
  4. deletes the test user again (unless --keep-user)

Credentials file (default tools/uat_credentials.txt, never committed). Two lines:
    email=test.user@example.com
    password=at-least-6-characters

Run:   python tools/uat_live.py                 test the live site
       python tools/uat_live.py --deploy        deploy first, then test
       python tools/uat_live.py --guest         no credentials: sign in as a guest instead
Needs: Node 22 and Chrome (for the browser test), and for --deploy the Google Cloud CLI signed in.
"""
import argparse, json, os, shutil, subprocess, sys, time
import httpx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get("TOLERANCE_URL", "https://tolerance-749288317336.asia-southeast1.run.app")
PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "zippy-purpose-489005-e9")
REGION = "asia-southeast1"


def read_credentials(path):
    kv = {}
    for line in open(path, encoding="utf8"):
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            kv[k.strip().lower()] = v.strip()
    if not kv.get("email") or len(kv.get("password", "")) < 6:
        sys.exit(f"{path} needs two lines: email=... and password=... (at least 6 characters)")
    return kv["email"], kv["password"]


def gcloud():
    found = shutil.which("gcloud") or shutil.which("gcloud.cmd")
    if found:
        return found
    guess = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Cloud SDK", "google-cloud-sdk", "bin", "gcloud.cmd")
    return guess if os.path.exists(guess) else sys.exit("Google Cloud CLI not found. Install it and run: gcloud auth login")


def deploy():
    envfile = os.path.join(ROOT, "infra", "cloudrun.local.env.yaml")
    if not os.path.exists(envfile):
        sys.exit("infra/cloudrun.local.env.yaml is missing (it holds the Firebase settings and is not in git)")
    print("Deploying to Cloud Run (about 6 minutes)...")
    cmd = [gcloud(), "run", "deploy", "tolerance", "--source", ".", f"--region={REGION}", f"--project={PROJECT}", "--allow-unauthenticated", "--cpu=2", "--memory=2Gi",
           "--min-instances=1", "--max-instances=1", "--no-cpu-throttling", "--timeout=3600", "--port=8080", f"--env-vars-file={envfile}"]
    if subprocess.run(cmd, cwd=ROOT).returncode != 0:
        sys.exit("deploy failed")


class Firebase:
    def __init__(self):
        cfg = httpx.get(URL + "/api/jig/auth", timeout=30).json()
        if not cfg.get("enabled"):
            sys.exit("sign-in is not enabled on the live site")
        self.key = cfg["config"]["apiKey"]

    def _post(self, method, body):
        return httpx.post(f"https://identitytoolkit.googleapis.com/v1/accounts:{method}?key={self.key}", json=body, timeout=30)

    def create(self, email, password):
        r = self._post("signUp", {"email": email, "password": password, "returnSecureToken": True})
        if r.status_code == 200:
            print("Test user created.")
            return r.json()["idToken"], True
        if "EMAIL_EXISTS" in r.text:
            r = self._post("signInWithPassword", {"email": email, "password": password, "returnSecureToken": True})
            if r.status_code == 200:
                print("Test user already existed; signed in with the given password.")
                return r.json()["idToken"], False
            sys.exit("that email exists with a different password")
        sys.exit("could not create the test user: " + r.text[:200])

    def delete(self, token):
        r = self._post("delete", {"idToken": token})
        print("Test user deleted." if r.status_code == 200 else "Could not delete the test user: " + r.text[:160])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--credentials", default=os.path.join(ROOT, "tools", "uat_credentials.txt"))
    ap.add_argument("--deploy", action="store_true")
    ap.add_argument("--guest", action="store_true")
    ap.add_argument("--keep-user", action="store_true")
    a = ap.parse_args()
    if a.deploy:
        deploy()
    env = dict(os.environ, WEB=URL, E2E_OUT=os.path.join(ROOT, "data", "uat"))
    fb = token = created = None
    if a.guest:
        env["LIVE_AUTH"] = "guest"
    else:
        email, password = read_credentials(a.credentials)
        fb = Firebase()
        token, created = fb.create(email, password)
        env.update(LIVE_AUTH="email", LIVE_EMAIL=email, LIVE_PASSWORD=password)
    try:
        rc = subprocess.run(["node", os.path.join(ROOT, "tests", "e2e.mjs")], cwd=ROOT, env=env).returncode
    finally:
        if fb and created and not a.keep_user:
            fb.delete(token)
    print("Screenshots and the report are in data/uat/")
    sys.exit(rc)


if __name__ == "__main__":
    main()
