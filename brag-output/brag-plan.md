# /brag plan: Tolerance, 15-second hook for the hackathon demo

This opens a 4-minute demo that already walks through the documents, the compiler, playbooks and Warden. The intro only has to hook.

**Angle.** Tolerance is a symbiote and the factory is its host (the landing page's own line). It takes the factory over, and when the oven catches fire it cools it and tells you.

**Look.** A dark line drawing of the plant. The symbiote is flat cel-shaded amber goo after the 2008 *Spectacular Spider-Man* symbiote: one base colour, a hard shadow side and a crisp highlight. The Tolerance wordmark is the creature itself: its letters are goo that breathes, wobbles, drips and sprouts tendrils, and every tentacle grows out of them. Tentacles wind round each machine, front bands shaded and back bands sunk into shadow, with green veins once bonded. 60 fps.

**Ties to the demo.** The 250°C oven limit is the playbook threshold shown at 2:15, and the warning card stands in for the Telegram message that follows.

## Storyboard (15.0 s, 1920x1080, 60 fps)

| Time | On screen | Sound |
|---|---|---|
| 0.0-1.6 | "THE FACTORY IS THE HOST." over the line drawing of the plant; the living Tolerance letters rise at the bottom | Drone, two slow heartbeats |
| 1.6-4.6 | Tentacles grow out of the letters, travel low along the floor, strike and wind round every machine; each turns "bonded". "SOMETHING GOT IN." | Hit, heartbeat speeding up, a lunge and a blip per machine |
| 4.6-8.0 | A slow push in on the oven as it catches fire: flames in the window and from the chimney, the outline red, the readout climbing past 250°C to 268°C | Fire roaring, crackles, rumble, alarm speeding up |
| 8.0-10.0 | Two more tentacles wind round the top and bottom of the oven in mint; steam, the flames die, 240°C, COOLED | The roar cut, a hard hiss of steam, metal ticks |
| 10.0-11.6 | The warning card slides in: "OVN1 overheated · 268°C. I cooled it to 240°C and held the line." "AND IT TELLS YOU." The camera pulls back and the tentacles retract into Tolerance | Two-note chime, a calm chord |
| 11.6-15.0 | The wordmark rises to the middle as the plant fades; the logo, eyebrow and tagline form round it | Landing hit, D major chord, fade |

Re-render from `brag-output/scripts`: `node capture.js && python3 audio.py music.wav && ffmpeg -framerate 60 -i frames/f_%04d.png -i music.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -shortest ../brag.mp4`
