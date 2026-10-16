# Codex brief 3: install the Tolerance probe on the VM

Same rules as before. New files go in `~/FT-db`, except the places named below that need root. Never print a token or password. Show PASS or FAIL with output for each check.

## 0. First, from the earlier brief
Do `CODEX_RESEED.md` if you have not (station names C1, C2, TR in MongoDB).

## 1. The line simulator also writes the current oven temperature
- Change `~/FT-db/line_sim.py`: every loop, after it publishes `plant/pcb/oven/temp_c`, write the same number to `/var/lib/FT-db/oven.temp` (write a temp file and rename, one number and a newline).
- The file must be owned by `tolprobe:tolprobe`, mode 664 (the simulator runs as `tolprobe`; the owner's user is in that group).
- Check: `cat /var/lib/FT-db/oven.temp` shows about 235. `oven 250` and 20 seconds later the file shows about 250. `oven reset` returns it.

## 2. Install the probe
- The owner gives you the file `probe_agent.py`. Copy it to `/opt/FT-db/probe_agent.py`. Owner `tolprobe`, mode 755. It uses only the Python standard library, so use the system `python3` (`/usr/bin/python3`).
- Create the log file `/var/log/FT-db/probe.log` (folder and file owned by `tolprobe`, mode 644).
- Create `/etc/tolerance-probe.env` (root owned, mode 640, group `tolprobe`) with these lines. The owner pastes the token and the owner id later; leave the two values as the words `PASTE_TOKEN` and `PASTE_OWNER`:
```
TOLERANCE_URL=http://127.0.0.1:48411
PROBE_TOKEN=PASTE_TOKEN
PROBE_OWNER=PASTE_OWNER
PROBE_NAME=pcb-gateway
PROBE_UNITS=mongod,mosquitto
PROBE_OVEN_FILE=/var/lib/FT-db/oven.value
PROBE_OVEN_TEMP=/var/lib/FT-db/oven.temp
PROBE_OVEN_MIN=200
PROBE_OVEN_MAX=260
PROBE_LOG=/var/log/FT-db/probe.log
PROBE_EVERY=4
```
- The unit file `/etc/systemd/system/tolerance-probe.service` (replace the one from before): `User=tolprobe`, `EnvironmentFile=/etc/tolerance-probe.env`, `ExecStart=/usr/bin/python3 /opt/FT-db/probe_agent.py`, `Restart=always`, `RestartSec=3`. Do NOT set `NoNewPrivileges`, `ProtectSystem` or `PrivateTmp`: the probe must run `sudo` and write `/var/lib/FT-db`.
- `systemctl daemon-reload`. Do not start it yet.
- Change `~/FT-db/status.sh` (and `status_view.py`): the probe log lines now come from `/var/log/FT-db/probe.log` (last 3 lines).

## 3. Check that SSH can carry a reverse tunnel
- Run `sudo sshd -T | grep -i -E "allowtcpforwarding|gatewayports"`. Needed: `allowtcpforwarding yes` (or `remote`) and `gatewayports no`. Report the lines. Change nothing unless forwarding is off; if it is off, tell the owner and ask before you change it.

## 4. What the owner does next (tell him, do not do it)
1. On his laptop he opens ONE tunnel that carries the databases to the laptop and the app to the VM:
`ssh -N -L 27018:127.0.0.1:27017 -L 1884:127.0.0.1:1883 -R 48411:127.0.0.1:48410 <user>@<the VM address>`
2. He opens the Tolerance app and copies the probe token and owner id (the app shows them on the Probes page).
3. He gives you both values. You put them in `/etc/tolerance-probe.env` without printing them, then run `sudo systemctl enable --now tolerance-probe`.

## 5. Final checks (after step 4 is done)
- `curl -s http://127.0.0.1:48411/api/jig/agents | head -c 80` on the VM shows JSON (the tunnel works).
- `systemctl is-active tolerance-probe` prints `active`. `tail -3 /var/log/FT-db/probe.log` shows `probe pcb-gateway starts` and no errors.
- Stop MongoDB by hand (`sudo systemctl stop mongod`). Within 10 seconds the owner sees an incident in the app. After he approves it, the log shows `executed service_restart mongod: ok - restarted (approved by ... through ...)` and `systemctl is-active mongod` prints `active`.
- `oven 262`: the owner sees the oven warning. After he approves, the log shows `executed set_oven 235` and the temperature falls to about 235.
- Report all outputs with secrets replaced by `***`.
