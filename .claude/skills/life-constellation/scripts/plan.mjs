#!/usr/bin/env node
// Usage: node plan.mjs <project-dir> [--write]
// Prints the cast table, clock checkpoints and every event with its exact second.
// --write also stamps the total duration into <project-dir>/index.html.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] || ".");
const ctx = { window: {}, globalThis: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(here, "../engine/lc-core.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, "cast.js"), "utf8"), ctx);
const LC = ctx.window.LifeConstellation.build(ctx.window.LC_CONFIG);

const pad = (s, n) => String(s).padEnd(n);
console.log("\nCAST");
console.log(pad("name", 12) + pad("colour", 10) + pad("from", 7) + pad("to", 7) + "what happens");
for (const p of LC.people) {
  const from = isFinite(p.from) ? p.from : "family";
  const to = p.star ? p.star.at : p.leaves ? p.leaves.at : p.kind === "crosses" ? p.from : "∞";
  const what = [
    p.isMe ? "me — biggest star" : p.kind.toUpperCase(),
    ...p.apart.map(([a, b]) => `apart ${a}–${b}`),
    ...(p.with ? [`moves with ${p.with}`] : []),
    ...p.changes.map((c) => `${c.at}: ${c.label || c.rename}`),
    ...(p.leaves ? [`LEAVES ${p.leaves.at}`] : []),
    ...(p.star && !p.isMe ? [`★ ${p.star.at}`] : []),
  ].join(", ");
  console.log(pad(p.name, 12) + pad(p.color, 10) + pad(from, 7) + pad(to, 7) + what);
}

console.log("\nCLOCK (video second → age)");
let row = "";
for (let t = 0; t <= LC.clock.clockS + 0.001; t += 4) row += `${t.toFixed(0).padStart(4)}s→${LC.ageAt(t).toFixed(1).padStart(5)}  `;
console.log(row.replace(/(([^ ]+ +){6})/g, "$1\n"));

console.log("\nEVENTS (t = moment, look = snapshot second)");
for (const e of LC.events) console.log(`${e.t.toFixed(2).padStart(7)}s  look ${e.look.toFixed(2).padStart(7)}s  age ${e.age.toFixed(1).padStart(5)}  ${e.who} ${e.what}`);
console.log(`\nTOTAL ${LC.TOTAL}s  (clock ${LC.clock.clockS}s + ending)`);

if (process.argv.includes("--write")) {
  const f = path.join(dir, "index.html");
  const html = fs.readFileSync(f, "utf8").replace(/data-duration="[\d.]+"/g, `data-duration="${LC.TOTAL}"`);
  fs.writeFileSync(f, html);
  fs.writeFileSync(path.join(dir, "events.json"), JSON.stringify(LC.events, null, 2));
  console.log(`wrote duration ${LC.TOTAL}s into index.html and events.json`);
}
