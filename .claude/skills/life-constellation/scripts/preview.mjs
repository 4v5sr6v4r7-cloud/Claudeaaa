#!/usr/bin/env node
// Usage: node preview.mjs <project-dir> [out.html]
// Builds one self-contained preview page (fonts, engine and cast inlined) with
// play/pause, a scrubber and a jump list of every event. Publish it as a
// private Artifact to get a preview link.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || ".");
const out = path.resolve(process.argv[3] || path.join(dir, "preview.html"));
const read = (f) => fs.readFileSync(f, "utf8");
const b64 = (f) => fs.readFileSync(path.join(dir, "fonts", f)).toString("base64");
const cast = read(path.join(dir, "cast.js"));
const core = read(path.join(dir, "lc-core.js"));
const render = read(path.join(dir, "lc-render.js"));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(core + cast, ctx);
const me = ctx.window.LC_CONFIG.people.find((p) => p.id === ctx.window.LC_CONFIG.me).name;
const face = (fam, file, w, st = "normal") => `@font-face{font-family:"${fam}";src:url(data:font/woff2;base64,${b64(file)}) format("woff2");font-weight:${w};font-style:${st}}`;

const html = `<title>${me}'s Life Constellation</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${face("LC Sans", "inter-latin-400-normal.woff2", 400)}
${face("LC Sans", "inter-latin-700-normal.woff2", 700)}
${face("LC Serif", "eb-garamond-latin-400-normal.woff2", 400)}
${face("LC Serif", "eb-garamond-latin-500-normal.woff2", 500)}
${face("LC Serif", "eb-garamond-latin-400-italic.woff2", 400, "italic")}
/* Layout: the vertical film centred like a phone screen, controls and the event list beside it (stacked on phones). Single dark look: it is a night sky. */
:root{
  --night:#05071a; --panel:#0c1030; --line:#232a5c; --ink:#e9e6ff; --muted:#9aa0d0; --gold:#ffd36e;
  --display:"LC Serif", Georgia, serif; --ui:"LC Sans", system-ui, sans-serif;
  color-scheme:dark;
}
html,body{background:var(--night);color:var(--ink)}
body{font-family:var(--ui);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:20px}
.wrap{display:flex;gap:28px;justify-content:center;align-items:flex-start;flex-wrap:wrap;max-width:1100px;margin:0 auto}
.stage{flex:0 1 420px;min-width:0;display:flex;flex-direction:column;gap:12px}
canvas{width:100%;max-width:100%;aspect-ratio:9/16;height:auto;border-radius:14px;background:#000;display:block;box-shadow:0 0 0 1px var(--line),0 20px 60px rgba(0,0,0,.5)}
.bar{display:flex;gap:12px;align-items:center}
button{font:inherit;color:var(--night);background:var(--gold);border:0;border-radius:999px;padding:8px 18px;font-weight:700;cursor:pointer;min-width:84px}
button:focus-visible,input:focus-visible,li button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
input[type=range]{flex:1;min-width:0;accent-color:var(--gold)}
.read{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px;display:flex;justify-content:space-between}
.read b{color:var(--gold);font-weight:700}
aside{flex:1 1 320px;min-width:0;max-width:520px}
h1{font-family:var(--display);font-weight:500;font-size:34px;margin:0 0 4px;text-wrap:balance}
.sub{color:var(--muted);margin:0 0 16px;font-size:14px;line-height:1.5}
ol{list-style:none;margin:0;padding:0;display:grid;gap:2px;max-height:70vh;overflow:auto;border-top:1px solid var(--line)}
li button{all:unset;box-sizing:border-box;width:100%;display:grid;grid-template-columns:62px 52px 1fr;gap:8px;padding:7px 8px;border-bottom:1px solid var(--line);cursor:pointer;font-size:14px;font-variant-numeric:tabular-nums}
li button:hover{background:var(--panel)}
li .t{color:var(--muted)} li .a{color:var(--gold)}
li.on button{background:var(--panel)}
@media (prefers-reduced-motion: reduce){canvas{box-shadow:none}}
</style>
<div class="wrap">
  <div class="stage">
    <canvas id="sky" width="1080" height="1920"></canvas>
    <div class="bar"><button id="play" type="button">Play</button><input id="scrub" type="range" min="0" step="0.0333" value="0" aria-label="Video time"></div>
    <div class="read"><span>time <b id="tt">0.0</b> s</span><span>age <b id="age">0</b></span><span id="len"></span></div>
  </div>
  <aside>
    <h1>${me}'s Life Constellation</h1>
    <p class="sub">Preview of the 1080×1920 video, no music. Tap any moment below to jump to it.</p>
    <ol id="events"></ol>
  </aside>
</div>
<script>${cast}</script>
<script>${core}</script>
<script>${render}</script>
<script>
(function(){
  const LC = window.LC, T = LC.TOTAL;
  const scrub = document.getElementById("scrub"), play = document.getElementById("play");
  const tt = document.getElementById("tt"), ageEl = document.getElementById("age");
  scrub.max = T; document.getElementById("len").textContent = "length " + T.toFixed(1) + " s";
  let t = 0, playing = false, last = 0;
  const list = document.getElementById("events");
  const rows = LC.events.map(function(e){
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button";
    b.innerHTML = '<span class="t">' + e.t.toFixed(1) + ' s</span><span class="a">' + (e.age < 0 ? "–" : e.age.toFixed(0)) + '</span><span></span>';
    b.lastChild.textContent = (e.who + " " + e.what).trim();
    b.addEventListener("click", function(){ setT(e.look); });
    li.appendChild(b); list.appendChild(li); return { li: li, e: e };
  });
  function setT(v){
    t = Math.max(0, Math.min(T, v)); scrub.value = t; tt.textContent = t.toFixed(1);
    ageEl.textContent = Math.max(0, Math.floor(LC.ageAt(Math.min(t, LC.clock.clockS))));
    rows.forEach(function(r){ r.li.classList.toggle("on", Math.abs(r.e.look - t) < 0.05); });
    window.__lcDraw(t);
  }
  function tick(now){
    if (!playing) return;
    t += (now - last) / 1000; last = now;
    if (t >= T) { t = T; playing = false; play.textContent = "Play"; }
    setT(t);
    if (playing) requestAnimationFrame(tick);
  }
  play.addEventListener("click", function(){
    playing = !playing; play.textContent = playing ? "Pause" : "Play";
    if (playing) { if (t >= T) t = 0; last = performance.now(); requestAnimationFrame(tick); }
  });
  scrub.addEventListener("input", function(){ setT(+scrub.value); });
  window.__lcReady.then(function(){ setT(LC.events[0] ? LC.events[0].look + 14 : 0); });
})();
</script>
`;
fs.writeFileSync(out, html);
console.log(`preview written to ${out} (${(html.length / 1024).toFixed(0)} KB)`);
