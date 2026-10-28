#!/usr/bin/env node
// Usage: node check.mjs <project-dir> [--frames <out-dir>] [--sweep 0.25]
// Loads the composition in headless Chromium, and for every event (plus a sweep
// over the whole video) checks: names overlapping, text cut off at the screen
// edge, a star (or its name) hidden behind a name, a constellation link crossing
// a star's name. With --frames, saves a PNG per event and a contact sheet.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = await import("playwright")); }

const args = process.argv.slice(2);
const dir = path.resolve(args[0] || ".");
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const framesDir = opt("--frames", null);
const sweep = parseFloat(opt("--sweep", "0.25"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto("file://" + path.join(dir, "index.html"));
await page.waitForFunction(() => window.__lcReady !== undefined);
await page.evaluate(() => window.__lcReady);

const info = await page.evaluate(() => ({ total: window.LC.TOTAL, events: window.LC.events, W: window.LC.W, H: window.LC.H }));
const times = new Map();
for (const e of info.events) times.set(+e.look.toFixed(2), `${e.who} ${e.what}`.trim());
for (let t = 0; t < info.total; t += sweep) if (!times.has(+t.toFixed(2))) times.set(+t.toFixed(2), null);

const problems = [];
for (const [t, label] of [...times.entries()].sort((a, b) => a[0] - b[0])) {
  const r = await page.evaluate((t) => {
    const out = [], { labels, stars } = window.__lcBoxes(t), W = window.LC.W, H = window.LC.H;
    const ov = (a, b, pad = 0) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + pad) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + pad);
    const texts = [...labels, ...stars.filter((s) => s.kind === "starlabel").map((s) => ({ ...s, text: s.text + " ★" }))];
    for (let i = 0; i < texts.length; i++) {
      const a = texts[i];
      if (a.x < 2 || a.x + a.w > W - 2 || a.y < 2 || a.y + a.h > H - 2) out.push(`cut off: "${a.text}"`);
      for (let j = i + 1; j < texts.length; j++) {
        const b = texts[j];
        if (ov(a, b) > 6) out.push(`names overlap: "${a.text}" / "${b.text}"`);
      }
      for (const s of stars) if (s.kind === "star" && s.id !== a.id && ov(a, s) > 6) out.push(`star hidden: ★${s.id} under "${a.text}"`);
    }
    return out;
  }, t);
  for (const msg of r) problems.push({ t, label, msg });
}

// constellation links crossing a star's name (static, once the ending is reached)
const linkHits = await page.evaluate(() => {
  const LC = window.LC, out = [], ids = LC.C.constellation || [];
  const end = window.__lcBoxes(LC.TOTAL - 0.1).stars;
  const pos = (id) => { const b = end.find((s) => s.kind === "star" && s.id === id); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
  for (let k = 0; k < ids.length - 1; k++) {
    const A = pos(ids[k]), B = pos(ids[k + 1]);
    for (const l of end.filter((s) => s.kind === "starlabel")) {
      for (let i = 0; i <= 200; i++) {
        const x = A.x + (B.x - A.x) * i / 200, y = A.y + (B.y - A.y) * i / 200;
        if (x > l.x && x < l.x + l.w && y > l.y && y < l.y + l.h) { out.push(`link ${ids[k]}→${ids[k + 1]} crosses "${l.text}"`); break; }
      }
    }
  }
  return out;
});
for (const msg of linkHits) problems.push({ t: info.total - 0.1, label: "ending", msg });

// group consecutive identical problems
const seen = new Map();
for (const p of problems) {
  const g = seen.get(p.msg);
  if (g && p.t - g.last <= sweep + 0.01) { g.last = p.t; if (p.label) g.events.add(p.label); }
  else seen.set(p.msg + "@" + p.t, { msg: p.msg, first: p.t, last: p.t, events: new Set(p.label ? [p.label] : []) }), seen.set(p.msg, seen.get(p.msg + "@" + p.t));
}
const groups = [...new Set([...seen.values()])].sort((a, b) => a.first - b.first);
console.log(`checked ${times.size} moments over ${info.total}s`);
if (!groups.length) console.log("OK — no overlaps, cut-offs or hidden stars");
for (const g of groups) console.log(`${g.first.toFixed(2)}–${g.last.toFixed(2)}s  ${g.msg}${g.events.size ? "  [" + [...g.events].join("; ") + "]" : ""}`);

if (framesDir) {
  fs.mkdirSync(framesDir, { recursive: true });
  const shots = info.events.filter((e, i, a) => a.findIndex((f) => Math.abs(f.look - e.look) < 0.3) === i);
  let n = 0;
  for (const e of shots) {
    await page.evaluate((t) => window.__lcDraw(t), e.look);
    const f = path.join(framesDir, `${String(n++).padStart(2, "0")}-${e.look.toFixed(1)}s-${(e.who + " " + e.what).trim().replace(/[^A-Za-z0-9]+/g, "_")}.png`);
    await page.locator("#sky").screenshot({ path: f });
  }
  try {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-pattern_type", "glob", "-i", path.join(framesDir, "*.png"),
      "-vf", "scale=360:-1,drawbox=c=black@0:t=0,tile=8x" + Math.ceil(n / 8) + ":padding=6:color=black", "-frames:v", "1", path.join(framesDir, "contact-sheet.jpg")]);
  } catch (err) { console.log("contact sheet failed:", err.message); }
  console.log(`saved ${n} event frames to ${framesDir}`);
}
await browser.close();
process.exit(groups.length ? 1 : 0);
