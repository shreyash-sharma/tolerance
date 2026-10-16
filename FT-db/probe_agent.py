#!/usr/bin/env python3
"""Tolerance host probe. Runs on a server next to the machines. Python 3 standard library only.

Every few seconds it tells Tolerance which services are running and what the oven reads, and it asks for work. Nothing connects in to this server.
It can do only two things, and only inside the limits below (it checks them again, whatever Tolerance asks):
  1. restart one of the services in PROBE_UNITS, with: sudo -n /usr/bin/systemctl restart <unit>
  2. write the oven target to PROBE_OVEN_FILE, between PROBE_OVEN_MIN and PROBE_OVEN_MAX

Settings come from the environment (the systemd unit reads /etc/tolerance-probe.env):
  TOLERANCE_URL        where Tolerance can be reached from this server, e.g. http://127.0.0.1:48411 (an SSH reverse tunnel to the laptop)
  PROBE_TOKEN          the probe token shown in the Tolerance app
  PROBE_OWNER          the owner id shown next to the token (default: local)
  PROBE_NAME           a name for this probe (default: the host name)
  PROBE_UNITS          comma list of services, default: mongod,mosquitto
  PROBE_OVEN_FILE      default /var/lib/FT-db/oven.value (the target the line simulator follows)
  PROBE_OVEN_TEMP      default /var/lib/FT-db/oven.temp  (the current temperature, written by the line simulator)
  PROBE_OVEN_MIN/MAX   default 200 / 260
  PROBE_LOG            a file for the log lines the terminal view shows (optional)
  PROBE_EVERY          seconds between reports, default 4
"""
import json, os, socket, subprocess, sys, time, urllib.request

URL = os.environ.get("TOLERANCE_URL", "http://127.0.0.1:48411").rstrip("/")
TOKEN = os.environ.get("PROBE_TOKEN", "")
OWNER = os.environ.get("PROBE_OWNER", "local")
NAME = os.environ.get("PROBE_NAME", socket.gethostname())
UNITS = [u.strip() for u in os.environ.get("PROBE_UNITS", "mongod,mosquitto").split(",") if u.strip()]
OVEN_FILE = os.environ.get("PROBE_OVEN_FILE", "/var/lib/FT-db/oven.value")
OVEN_TEMP = os.environ.get("PROBE_OVEN_TEMP", "/var/lib/FT-db/oven.temp")
OVEN_MIN, OVEN_MAX = float(os.environ.get("PROBE_OVEN_MIN", "200")), float(os.environ.get("PROBE_OVEN_MAX", "260"))
LOG = os.environ.get("PROBE_LOG", "")
EVERY = float(os.environ.get("PROBE_EVERY", "4"))
SYSTEMCTL = "/usr/bin/systemctl"


def log(text):
    line = time.strftime("%H:%M:%S ") + text
    print(line, flush=True)
    if LOG:
        try:
            with open(LOG, "a") as f:
                f.write(line + "\n")
        except OSError:
            pass


def active(unit):
    try:
        return subprocess.run([SYSTEMCTL, "is-active", unit], capture_output=True, text=True, timeout=5).stdout.strip() == "active"
    except Exception:
        return False


def number(path):
    try:
        return float(open(path).read().strip())
    except Exception:
        return None


def run(cmd):
    """One command from Tolerance. Anything outside the short list is refused here, whatever Tolerance asks."""
    kind = cmd.get("kind")
    if kind == "service_restart":
        unit = str(cmd.get("unit") or "")
        if unit not in UNITS:
            return False, f"refused: {unit} is not in this probe's list"
        r = subprocess.run(["sudo", "-n", SYSTEMCTL, "restart", unit], capture_output=True, text=True, timeout=60)
        ok = r.returncode == 0 and active(unit)
        return ok, "restarted" if ok else (r.stderr.strip() or "service did not become active")[:150]
    if kind == "set_oven":
        try:
            v = float(cmd.get("value"))
        except (TypeError, ValueError):
            return False, "refused: not a number"
        if not (OVEN_MIN <= v <= OVEN_MAX):
            return False, f"refused: {v:g} is outside {OVEN_MIN:g} to {OVEN_MAX:g}"
        tmp = OVEN_FILE + ".tmp"
        try:
            with open(tmp, "w") as f:
                f.write(f"{v:g}\n")
            os.replace(tmp, OVEN_FILE)
        except OSError:
            with open(OVEN_FILE, "w") as f:   # the file is group-writable but the folder may not be
                f.write(f"{v:g}\n")
        return True, f"oven target {v:g} C"
    return False, f"refused: unknown command {kind}"


def report(results):
    body = {"name": NAME, "where": socket.gethostname(), "services": {u: active(u) for u in UNITS}, "readings": {}, "results": results}
    t, target = number(OVEN_TEMP), number(OVEN_FILE)
    if t is not None:
        body["readings"]["oven_temp_c"] = t
    if target is not None:
        body["readings"]["oven_target_c"] = target
    req = urllib.request.Request(URL + "/api/host/report", data=json.dumps(body).encode(), method="POST",
                                 headers={"content-type": "application/json", "x-host-token": TOKEN, "x-host-owner": OWNER})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode()).get("commands", [])


def main():
    if not TOKEN:
        sys.exit("PROBE_TOKEN is not set")
    log(f"probe {NAME} starts; services {','.join(UNITS)}; reporting to {URL}")
    results, down = [], False
    while True:
        try:
            cmds = report(results)
            results = []
            if down:
                log("Tolerance is reachable again")
                down = False
            for c in cmds:
                ok, out = run(c)
                who = f" (approved by {c['by']} through {c['via']})" if c.get("by") else ""
                log(f"executed {c['kind']} {c.get('unit') or c.get('value')}: {'ok' if ok else 'FAILED'} - {out}{who}")
                results.append({"id": c["id"], "ok": ok, "output": out})
        except Exception as e:
            if not down:
                log(f"cannot reach Tolerance: {str(e)[:100]}")
                down = True
        time.sleep(EVERY)


if __name__ == "__main__":
    main()
