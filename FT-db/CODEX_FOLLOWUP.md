# Follow-up brief for Codex (after the first VM setup)

Same rules as before: new files only in `~/FT-db` (and `/opt/FT-db`, `/var/lib/FT-db`, `/etc/tolerance-probe.env`, the sudoers file and service files, which need root). No passwords or tokens in any output. Read secrets from `~/FT-db/secrets.env`. Show the owner file names, not values.

## Part A. Report what you built (paste the output, do not summarise)
Run these and paste the full output. Replace any password or token with `***`.
1. `cat /etc/os-release | head -4; uname -m; python3 --version`
2. `systemctl is-active mongod mosquitto line-sim` and `mongod --version | head -1; mosquitto -h | head -1`
3. `ss -tlnp` and the firewall state (`sudo ufw status verbose`, or the cloud firewall rules you changed). Say which network option you chose: (a) localhost with tunnel, or (b) open to one IP. Name the IP only as the first two parts, like `203.0.*.*`.
4. `ls -la ~/FT-db /opt/FT-db` and `sudo cat /etc/sudoers.d/tolerance-probe` and `sudo visudo -cf /etc/sudoers.d/tolerance-probe`
5. Mongo counts: `plant.inspections` and `plant.maintenance` (use the reader user). One sample document from each, with any user data left as it is (it is fake).
6. `mosquitto_sub` for 5 values from each topic under `plant/pcb/#` (use the reader user).
7. The results of Test 1, Test 2 and Test 3 from step 10 of the first brief, with the exact commands and the output. State clearly: PASS or FAIL for each.
8. Everything that failed, was skipped, or that you changed from the brief, and why.

## Part B. New work: the reflow oven
The VM is the gateway of a PCB line. The simulator publishes the temperature of the reflow oven. For the demo, the owner types a short command to raise the temperature.

1. Create `/var/lib/FT-db/oven.value` (a text file with one number, start `235`). Owner `tolprobe`, group `tolprobe`, mode `664`. Add the owner's login user to group `tolprobe`.
2. Change `line_sim.py`:
   - It reads `/var/lib/FT-db/oven.value` every 2 seconds. This is the target.
   - The published temperature `plant/pcb/oven/temp_c` moves toward the target by at most 4 °C per 2 seconds, with small noise (±0.3). So a change from 235 to 262 takes about 15 seconds, and looks real.
   - Also publish the target to `plant/pcb/oven/setpoint_c`.
   - If the file is missing or not a number, use 235 and log one line.
3. Create `~/FT-db/oven` (a small shell script, in your PATH for the owner, for example `~/bin/oven` that is a link):
   - `oven 262` writes `262` to the file and prints `oven target 262 C`.
   - `oven reset` writes `235`.
   - `oven` with no argument prints the current target.
   - It accepts only numbers from 150 to 300. Otherwise it prints an error. (The demo limit, 260, is enforced by Tolerance, not here.)
4. Change `status.sh`: show `oven: 262.0 C` in green below 245, amber from 245 to 260, red above 260. Show `oven: no data` in red when MQTT is down.
5. Change `reset.sh`: also run `oven reset`.
6. Do not change the sudoers file. The probe will write the oven file directly (it has group access).
7. Checks (paste the output):
   - Run `oven 262`. In 20 seconds `mosquitto_sub -t plant/pcb/oven/temp_c` shows values near 262.
   - Run `oven reset`. The values return to about 235.
   - As `tolprobe`: `sudo -u tolprobe bash -c 'echo 240 > /var/lib/FT-db/oven.value'` works.
   - Run `reset.sh`: it prints `ready`.

## Part C. Stop here
- Do not start `tolerance-probe`. The probe file comes later from the owner.
- Do not store any Tolerance URL or Telegram token.
- Report Part A and Part B outputs.
