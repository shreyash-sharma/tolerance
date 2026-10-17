# /brag plan: Tolerance, 15-second hook for the hackathon demo

This opens a 4-minute demo that already walks through the documents, the compiler, playbooks and Warden. The intro only has to hook.

**Angle.** Tolerance is a symbiote and the factory is its host (the landing page's own line). It takes the factory over, and when the oven catches fire it cools it and tells you.

**Look.** Dark deco, after the 90s *Batman: The Animated Series*: everything painted on black and shaped by light, solid silhouettes with one thin rim of light, blood-red and deep-amber skies, searchlights, condensed letterspaced titles, a little paper grain. The symbiote is a shadow body with an amber rim; its veins turn green where it has bonded. Motion is smooth and continuous, rendered at 60 fps. An original creature, not any film or comic character.

**Ties to the demo.** The 250°C oven limit is the playbook threshold shown at 2:15, and the warning card stands in for the Telegram message that follows.

## Storyboard (15.0 s, 1920x1080, 60 fps)

| Time | On screen | Sound |
|---|---|---|
| 0.0-1.6 | The factory from outside: sawtooth roofs, a deco tower, three smokestacks against a red sky and a white disc. Something rim-lit is already climbing a smokestack. "THE FACTORY IS THE HOST." | Drone, two slow heartbeats |
| 1.6-4.6 | Cut inside, wide on the machines. Tendrils pour in, wrap the arm, the oven, the conveyor and the rack; each light flips red to green. "SOMETHING GOT IN." | Hit, heartbeat speeding up, a lunge and a blip per machine |
| 4.6-8.0 | One slow push in on the oven as it overheats: flames out of the window, over the roof and up the chimney, growing; the readout climbs past 250°C to 268°C; the camera shakes | Fire roaring, crackles, rumble, alarm speeding up |
| 8.0-10.0 | The symbiote cools it: more of it wraps the oven, green veins pulse, steam bursts out, the flames die, 240°C, "COOLED", the light goes green | The roar cut, a hard hiss of steam, metal ticks |
| 10.0-12.0 | Its warning slides in: "OVN1 overheated · 268°C. I cooled it to 240°C and held the line. Review the cause when you are ready." "AND IT TELLS YOU." | Two-note chime, a calm chord |
| 12.0-15.0 | Red title card: the logo, "TOLERANCE", "A SYMBIOTIC COMPILER FOR FACTORIES", "GOOGLE CLOUD AI BUILDER CUP 2026 · MANUFACTURING" | Landing hit, D major chord, fade |

Re-render from `brag-output/scripts`: `node capture.js && python3 audio.py music.wav && ffmpeg -framerate 60 -i frames/f_%04d.png -i music.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -shortest ../brag.mp4`
