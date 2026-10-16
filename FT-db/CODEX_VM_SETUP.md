# Brief for Codex: set up the Linux VM for the Tolerance demo (version 3, simple)

You work on one Linux VM. The owner gives you access. Do the steps in order. After each step, run the check and show the output. Stop and ask if a check fails twice.

## What the VM is
A PCB line gateway for a demo. It runs an MQTT broker with simulated sensor values, a MongoDB with inspection data, and a probe. The sensor values are simulated. The services and the commands are real.

## Rules
- Put every new file in `~/FT-db` on the VM. Do not change or delete other files in the home folder. One exception: service files and `/opt/FT-db/` (step 7), which need root.
- Use `sudo` only where a step says so.
- Never print or log passwords or tokens. Read them from `~/FT-db/secrets.env` (mode 600). Create this file with fresh random values. Show the owner only the file name.
- Services listen on localhost only, unless step 9 says otherwise.
- Use Python 3 and a virtual environment in `~/FT-db/venv`. Do not install Python packages system-wide.

## 1. Look at the system
`cat /etc/os-release`, `uname -m`, `python3 --version`, `systemctl --version | head -1`, `df -h /`, `free -m`. Report the result. Pick install methods that fit this OS and CPU.

## 2. MongoDB (official Community repository)
- Install `mongodb-org`. Enable and start `mongod`. Turn on authentication.
- Users in database `plant`: `reader` (read only, for the Tolerance connector) and `admin_ft` (for the seed script only).
- Check: `systemctl is-active mongod` prints `active`. `reader` can run `ping`.

## 3. Seed MongoDB
- `plant.inspections`: 900 documents: `station` (Paint-03, Assembly-04, Test-05), `unit_id`, `result` (pass, fail), `defect` (text or null), `ts` (ISO time over the last 7 days).
- `plant.maintenance`: 60 documents: `station`, `note`, `ts`.
- Fixed random seed. Script: `~/FT-db/seed_mongo.py`. Check: counts are 900 and 60.

## 4. MQTT broker
- Install `mosquitto`. Enable and start it. Create user `plant_reader`. Turn off anonymous access.
- Check: `systemctl is-active mosquitto` prints `active`. Publish and subscribe on `test/ping` work.

## 5. The line simulator (a PCB line gateway sends sensor values)
- Write `~/FT-db/line_sim.py`. It publishes every 2 seconds to MQTT:
  - `plant/pcb/oven/temp_c` (a number near 235, small noise)
  - `plant/pcb/conveyor/speed_mm_s` (a number near 420)
  - `plant/pcb/aoi/result` (pass or fail, about 3 percent fail)
- Run it as the systemd service `line-sim`. It needs `mosquitto`. It reconnects by itself when the broker returns.
- Check: `mosquitto_sub` shows new values every 2 seconds.

## 6. Reset script for retakes
- `~/FT-db/reset.sh`: starts `mongod`, `mosquitto` and `line-sim`, waits until all are active, prints `ready`.

## 7. The probe service (the code arrives later)
- Create system user `tolprobe` (no login shell) if it does not exist. Create `/opt/FT-db/` owned by `tolprobe`.
- Create `tolerance-probe.service`. It runs `/home/<user>/FT-db/venv/bin/python /opt/FT-db/probe_agent.py` with settings from `/etc/tolerance-probe.env` (mode 600, root-owned, readable by `tolprobe`). Do not start it yet. The file `probe_agent.py` arrives from the owner later.
- Sudoers file `/etc/sudoers.d/tolerance-probe`. Allow user `tolprobe` to run ONLY these, without a password:
  - `/usr/bin/systemctl start|restart|is-active mongod`
  - `/usr/bin/systemctl start|restart|is-active mosquitto`
  - Check with `visudo -cf`. Show the file to the owner.
- Do NOT allow `stop` for `tolprobe`. The owner stops services with his own account.

## 8. The terminal view for the demo
- Install `tmux`.
- `~/FT-db/status.sh`: prints once per second, in large clear text:
  - `mongod`, `mosquitto`, `line-sim`: active (green) or inactive (red)
  - `inspections: 900` (or `connection refused` in red)
  - `oven temp: 235.2 C` (the last MQTT value, or `no data` in red when the broker is down)
  - the last 3 lines of the probe log
- `~/FT-db/demo_tmux.sh`: a tmux session, a large top pane with `status.sh`, a small bottom pane with a short prompt. The prompt hides host name, IP and user name.

## 9. Network — ask the owner, then do only his answer
- (a) Keep everything on localhost. The Tolerance app connects through an SSH tunnel (ports 27017 and 1883).
- (b) Open ports 27017 and 1883 to ONE source IP only (the owner's public IP), in the cloud firewall or `ufw`. Never to `0.0.0.0/0`.
- Show the final `ss -tlnp` and the firewall rules.

## 10. Final check
- Run `reset.sh`, then `demo_tmux.sh`.
- Test 1: `sudo systemctl stop mongod` → status shows red and `connection refused`. `sudo systemctl start mongod` → green, 900 inspections.
- Test 2: `sudo systemctl stop mosquitto` → `oven temp: no data` in red. Start it → values return and `line-sim` reconnects.
- Test 3: `sudo -u tolprobe sudo -n systemctl restart mongod` works. `sudo -u tolprobe sudo -n systemctl stop mongod` is refused. `sudo -u tolprobe sudo -n systemctl restart sshd` is refused.
- Report: OS, versions, open ports, files created, anything that failed. Do not start `tolerance-probe`. Do not store any Tolerance URL yet.
