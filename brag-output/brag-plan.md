# /brag plan: Tolerance, 15-second hook for the hackathon demo

This opens a 4-minute demo that already walks through the documents, the compiler, playbooks and Warden. The intro only has to hook.

**Angle.** Tolerance is a symbiote and the factory is its host (the landing page's own line). It takes the factory over, and when the oven catches fire it cools it and tells you.

**Look.** The landing page come alive: an isometric factory line in deep teal with sage machines, an amber-dashed conveyor, a skyline with lit windows and amber light beams. The symbiote is the Symbiotic Compiler helix: twin amber and mint strands. Manrope type, amber eyebrow labels, glass cards. Smooth, continuous motion at 60 fps.

**Ties to the demo.** The 250°C oven limit is the playbook threshold shown at 2:15, and the warning card stands in for the Telegram message that follows.

## Storyboard (15.0 s, 1920x1080, 60 fps)

| Time | On screen | Sound |
|---|---|---|
| 0.0-1.6 | The factory line, wide, text on the left. "Northfield Assembly Plant / The factory is the host." | Drone, two slow heartbeats |
| 1.6-4.6 | The helix comes down the light beam, lands on the line and splits both ways; each station gets a ring of light and its pin turns red to green. "The symbiote / Something got in." | Hit, heartbeat speeding up, a lunge and a blip per station |
| 4.6-8.0 | A slow push in on the oven as it overheats: the box tints red, flames from the vent, heat shimmer, a warning ring; a glass chip climbs 238 to 268°C | Fire roaring, crackles, rumble, alarm speeding up |
| 8.0-10.0 | The strands spiral up the oven in mint, cool particles and steam rise, the flames die; 240°C, COOLED | The roar cut, a hard hiss of steam, metal ticks |
| 10.0-12.0 | Its warning slides in on a glass card: "OVN1 overheated · 268°C. I cooled it to 240°C and held the line. Review the cause when you are ready." "And it tells you." | Two-note chime, a calm chord |
| 12.0-15.0 | The logo, "Tolerance.", "A symbiotic compiler for factories.", "Google Cloud AI Builder Cup 2026 · Manufacturing" | Landing hit, D major chord, fade |

Re-render from `brag-output/scripts`: `node capture.js && python3 audio.py music.wav && ffmpeg -framerate 60 -i frames/f_%04d.png -i music.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -shortest ../brag.mp4`
