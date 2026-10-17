# /brag plan: Tolerance, 15-second hook for the hackathon demo

This opens a 4-minute demo that already walks through the documents, the compiler, playbooks and Warden, so the intro shows none of the UI. Its only job is to hook people.

**Angle.** Tolerance is a symbiote and the factory is its host (the landing page's own line). A living liquid in the brand colours crawls in, bonds to every machine, takes over the screen, then pulls itself into the logo.

**Hook.** Black screen, a heartbeat, "THE FACTORY IS THE HOST." slams in.

**The twist.** It reads everything, wires into everything, and acts only when you say so. This sets up the demo's close: "The model can propose. It cannot approve itself."

**Tone.** Cinematic and a bit menacing, then heroic. Hard cuts and slammed type.

**Identity.** Liquid in sand `#ffd391` and amber `#f5b544`, turning green `#28966a` where it bonds. Background `#0f1214`, Barlow, the real logo SVG. An original creature, not any film character.

## Storyboard (15.0 s, 1920x1080, 30 fps)

| Time | On screen | Sound |
|---|---|---|
| 0.0-1.55 | "THE FACTORY IS THE HOST." | Two heartbeats |
| 1.0-5.0 | Line drawing of the plant (TR, OVN1, C1, WH1). Amber tendrils crawl in from the edges, latch on, turn green; each machine reads "bonded" | Faster heartbeat, wet tendrils, drips, rising drone |
| 5.0-5.9 | The liquid floods the screen | Flood hit |
| 5.9-8.9 | "IT READS EVERYTHING." / "WIRES INTO EVERYTHING." / "ACTS ONLY WHEN YOU SAY SO." on sand | Hit on each line, A minor pulse |
| 8.9-9.8 | The liquid pulls back into one rounded tile | Reverse whoosh |
| 9.8-15.0 | The tile becomes the logo; "SYMBIOTIC INTELLIGENCE FOR INDUSTRY 5.0", "Tolerance.", "A symbiotic compiler for factories.", "Google Cloud AI Builder Cup 2026 · Manufacturing" | Landing hit, chime, warm chord, fade |

Re-render from `brag-output/scripts`: `node capture.js && python3 audio.py music.wav && ffmpeg -framerate 30 -i frames/f_%04d.png -i music.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -shortest ../brag.mp4`
