---
name: life-constellation
description: Make a vertical 1080x1920 video of a whole life told as lines of light — every person is a glowing line climbing a starry sky with the narrator's age; people join, cross, drift apart, leave, and the ones who die rise and become stars that join into a constellation at the end. Rendered with HyperFrames, no music. Use when the user says "make a life constellation", asks for a life-story / family constellation / "lines of light" video, or gives a list of people and ages for one.
---

# Life Constellation

A ~132 s vertical video (1080x1920, 30 fps, silent — the user adds music in Instagram).
The camera follows the narrator's age from ~2 s before birth to `endAge` (85) in 116 s,
then the ending: the narrator becomes the biggest star, their child keeps climbing,
the constellation draws, "Life is a journey", fade to black.

Everything lives in this skill folder:

| file | what it is |
|---|---|
| `engine/lc-core.js` | pure math: clock table (age every 0.1 s), lanes in (age, x) space, stars, event list |
| `engine/lc-render.js` | one canvas, drawn from HyperFrames' `hf-seek` event; labels precomputed per frame |
| `engine/index.html` | the composition (fonts, canvas, empty GSAP timeline that only fixes the length) |
| `engine/cast.example.js` | the default cast and the full cast-file format (read its header) |
| `scripts/new-project.sh <dir> [cast.js]` | `hyperframes init` + copy engine + stamp duration |
| `scripts/plan.mjs <dir> [--write]` | prints cast table, clock, every event with its exact second; `--write` stamps the length |
| `scripts/check.mjs <dir> [--sweep s] [--frames out]` | overlap/cut-off/hidden-star checker + one PNG per event + contact sheet |
| `scripts/preview.mjs <dir> [out.html]` | self-contained scrubbable preview page (publish as a private Artifact) |

Work in phases. **Stop for the user's approval where marked.** Never invent anyone's
passing without asking — for real people, ask before placing imagined future deaths.

## 0. Setup

- `node -v` and `ffmpeg -version`. If either is missing, tell the user what you will install, then install only that.
- `npx --yes hyperframes@0.8.210 --help` must work (HyperFrames renders HTML to MP4 frame by frame).
- Playwright for `check.mjs`: use the preinstalled one (`NODE_PATH=$(npm root -g)`), else `npm i -D playwright`.

## 1. The cast — STOP for "ok"

Ask who is in the story and which language the names are in. If they don't want real
people, use the default cast (`engine/cast.example.js`: Grandma, Grandpa, Mom, Dad, Me,
Kindergarten friend, Grade school friend, Childhood friend, Middle school friend, First
love, High school friend, College friend, Coworker, Wife, Son).

For each person decide: name on screen, colour, and what happens:

- **FAMILY** — there before I'm born (omit `from`).
- **JOINS** — arrives at age X and stays (`from`, `origin: "left" | "right" | <parent id>`; a child is born out of the parent's line).
- **CROSSES** — `kind: "crosses"`: straight diagonal, ~3 s across the screen, name under the line, dimmer, trail fades.
- **LEAVES** — `leaves: { at, side }`: bends off the side of the screen.
- **DRIFTS APART / REJOINS** — `apart: [[from, to], ...]`: slides to the screen edge, thin and dim, then curves back. `with: <id>` makes kids/partners follow a parent's separations.
- **BECOMES A STAR** — `star: { at, x, y }`: fixed spot in the top half (y 70–840, keep the interior of the constellation clear).
- Small story beats: `changes: [{ at, gap, alpha, rename, flash, label }]` (marriage = `gap: 0.55, flash: true`; "not as close any more" = `gap: 1.8, alpha: 0.62`).

Turn real ages into the narrator's age: event age = narrator's age now − (person's age now − their age at the event).
Group families by colour family (Mom's side warm, Dad's side blue, partner's family green…) and by side (L/R) and rank (1 = closest lane).

Show a table — name, colour, from age, to age, what happens — (`node scripts/plan.mjs <dir>` prints it) and **wait for "ok"**.

## 2. The clock

`clockBands: [[fromAge, toAge, secondsPerYear], ...]` — slow at the start, fast through
quiet years, slow again near the end; **slow wherever stars cluster** so each gets its moment
(≥ ~1.3 s between stars). They are normalised to fill `clockSeconds` (116) and kept as a table
of ages every 0.1 s. `plan.mjs` prints the exact second of every event.

## 3. Build

```bash
SK=.claude/skills/life-constellation          # or ~/.claude/skills/life-constellation
$SK/scripts/new-project.sh constellations/<name>      # then write constellations/<name>/cast.js
node $SK/scripts/plan.mjs constellations/<name> --write
cd constellations/<name> && npx --yes hyperframes@0.8.210 lint
```

Engine rules (already implemented — keep them if you edit): every frame is a pure function of
time (no timers, no rAF, no unseeded random); background navy gradient + purple nebulae + 500
seeded stars; now line at 52 % height; age axis left (tick every 5 years, current age yellow,
"age" top-left); 80 px = 1 year, `y = nowY + (age_now − age) × 80`; lines fade out in the bottom
25 %; three passes per line (wide glow, medium glow, 3 px core); white glowing head with the name
above; names that would touch slide sideways (small overlap) or move a row out (big overlap),
with hysteresis so they don't flicker. Ending: flare + biggest star where I stand, axis and old
lines fade, child keeps climbing, links drawn one by one in `constellation` order, title at 75 %
height in a classic serif with a thin rule and the italic subtitle, 1.2 s fade to black.

## 4. Check — STOP for "render"

```bash
node $SK/scripts/check.mjs constellations/<name> --sweep 0.0333 --frames constellations/<name>/review
```

It tests every frame for names overlapping, text cut off, a star hidden behind a name, a
constellation link crossing a star's name, and saves a PNG per event plus `contact-sheet.jpg`.
Look at the contact sheet yourself too (crowded moments, unreadable names). Fix (star x/y, ranks,
clock bands, label sizes) and re-check — **max 3 rounds**. Then build the preview:

```bash
node $SK/scripts/preview.mjs constellations/<name> <scratchpad>/<name>-preview.html
```

publish it as a private Artifact (the preview link), send the contact sheet and a few key frames,
and **wait for "render"** or changes.

## 5. Render

```bash
cd constellations/<name>
npx --yes hyperframes@0.8.210 render -f 30 -q delivery -o renders/<name>-life-constellation.mp4
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of default=nw=1 renders/<name>-life-constellation.mp4
```

Verify 1080x1920, 30 fps, duration ≈ `TOTAL` from `plan.mjs` (±0.1 s), no audio stream
(the user adds the song from Instagram's library). Send the MP4 to the user.
