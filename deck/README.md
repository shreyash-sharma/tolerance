# Pitch deck (local app)

The 3-minute pitch deck is a page of the local app: start the app and open `http://localhost:3000/deck`.

| Key | Action |
|---|---|
| `→` `Space` | Next slide (starts the timer) |
| `←` | Previous slide |
| `1`–`9` | Jump to a slide |
| `N` | Speaker notes (the words to say, with the seconds for each slide) |
| `A` | Autoplay at the script timing (3:00): use it to screen-record the video |
| `T` / `R` | Start or stop the timer / reset everything |
| `F` | Fullscreen |
| `H` | Hide the key hints and timer |

Slide 3 embeds the live factory (`/floor?embed=1`) and starts its assembly animation when the slide opens; its five callouts appear at the seconds of the narration. Slide 5 embeds a second copy of the factory and fails station TR when the slide opens, so the real alert, camera fly-in and machine card play on screen. The numbers on slides 3 and 4 come from the running backend (`/api/ws/docs`, `/api/ws/mcp`) and fall back to the recorded values if it is not running. The benchmark numbers on slide 7 are from `docs/BENCHMARKS.md`.

## The three machine figures

`figures/gauge.mjs` (the tolerance gauge, from the kit's dial-indicator example with a tolerance band), `figures/interlock.mjs` (the policy gate) and `figures/selector.mjs` (the learner) are built with the Anatomy kit (<https://github.com/wheresryan22/anatomy>, MIT, licence in `LICENSE-anatomy.txt`). The kit files in `kit/` and `scripts/` are unmodified copies.

```sh
cd deck/figures
node gauge.mjs && node gauge.mjs --light
node interlock.mjs && node interlock.mjs --light
node selector.mjs && node selector.mjs --light
```

The pages are written to `web/public/deck/figures/`. The deck uses the light versions. The figures are illustrations of mechanisms: the selector's success rates are made up for the picture, and the interlock's tool names come from the product's real policy.

## Deck v3 (platform story)

Nine slides, 177 seconds: title, problem, platform (`figures/platform.mjs`), onboarding (live factory), operations (the Verifier catches a wrong number), Warden (`figures/warden.mjs`, with the live backtest numbers from `/api/jig/warden/backtest`), results, Gemma roadmap, close. Build the new figures with `node platform.mjs --light` and `node warden.mjs --light` in `deck/figures`.
