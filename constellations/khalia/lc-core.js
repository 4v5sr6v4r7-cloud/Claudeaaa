/*
 * Life Constellation — core (pure math, no DOM).
 * config -> clock (video time <-> age), per-person paths in (age, x) space,
 * star schedule and the list of events. Shared by the renderer (browser)
 * and the planning/check scripts (node).
 */
(function (root) {
  "use strict";

  const W = 1080, H = 1920, FPS = 30;
  const NOW_Y = Math.round(H * 0.52); // the "now" line
  const PX = 80; // px per year
  const STEP = 0.05; // layout grid, years
  const JOIN_Y = 2.0; // years a newcomer takes to glide into their lane
  const LEAVE_Y = 1.4; // years a leaving line takes to bend off-screen
  const BEND_Y = 0.8; // years a dying line bends sideways before it stops
  const SIGMA = 0.55; // smoothing of lane changes (years) -> soft S-curves
  const CROSS_S = 3.0; // seconds a crossing line takes to cross the screen
  const SPARK_S = 1.5; // seconds a spark takes to rise to its star

  // Ending schedule, seconds after my own star moment.
  const END = {
    flare: [0, 2.2],
    fadeLines: [0.6, 2.6],
    links: [2.6, 1.0], // start, seconds per constellation segment
    title: 8.8,
    rule: 9.6,
    italic: 10.2,
    black: [15.0, 1.2],
  };
  const ENDING_S = END.black[0] + END.black[1];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- clock
  function buildClock(C) {
    const endAge = C.endAge ?? 85;
    const clockS = C.clockSeconds ?? 116;
    const pre = C.preRoll ?? 2;
    const bands = C.clockBands || [[0, 5, 1.6], [5, 30, 1.3], [30, 70, 0.8], [70, endAge, 1.5]];
    const da = 0.01, n = Math.round(endAge / da);
    const raw = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const a = i * da;
      let d = bands[bands.length - 1][2];
      for (const [a0, a1, s] of bands) if (a >= a0 && a < a1) { d = s; break; }
      raw[i] = d;
    }
    // soften band edges: moving average over +-1.2 years
    const win = Math.round(1.2 / da), pre_ = new Float64Array(n + 2);
    for (let i = 0; i <= n; i++) pre_[i + 1] = pre_[i] + raw[i];
    const dens = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const lo = Math.max(0, i - win), hi = Math.min(n, i + win);
      dens[i] = (pre_[hi + 1] - pre_[lo]) / (hi - lo + 1);
    }
    const cum = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) cum[i] = cum[i - 1] + 0.5 * (dens[i] + dens[i - 1]) * da;
    const scale = (clockS - pre) / cum[n];
    const d0 = dens[0] * scale; // seconds per year at birth, used for the pre-roll

    // The clock as a table: age every 0.1 s.
    const dt = 0.1, m = Math.round(clockS / dt);
    const table = new Float64Array(m + 1);
    let j = 0;
    for (let k = 0; k <= m; k++) {
      const t = k * dt;
      if (t <= pre) { table[k] = (t - pre) / d0; continue; }
      const target = (t - pre) / scale;
      while (j < n && cum[j + 1] < target) j++;
      const f = j < n ? (target - cum[j]) / (cum[j + 1] - cum[j]) : 0;
      table[k] = (j + f) * da;
    }
    table[m] = endAge;

    function ageAt(t) {
      if (t <= 0) return table[0] + t / d0;
      if (t >= clockS) return endAge;
      const x = t / dt, k = Math.floor(x);
      return lerp(table[k], table[Math.min(m, k + 1)], x - k);
    }
    function timeOfAge(a) {
      if (a <= table[0]) return (a - table[0]) * d0;
      if (a >= endAge) return clockS;
      let lo = 0, hi = m;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (table[mid] <= a) lo = mid; else hi = mid; }
      return (lo + (a - table[lo]) / (table[hi] - table[lo])) * dt;
    }
    return { endAge, clockS, pre, table, dt, ageAt, timeOfAge };
  }

  // --------------------------------------------------------------- people
  function build(C) {
    const clock = buildClock(C);
    const { endAge, clockS } = clock;
    const TOTAL = +(clockS + ENDING_S).toFixed(2);
    const byId = {};
    const people = C.people.map((p, idx) => {
      const q = Object.assign({}, p);
      q.idx = idx;
      q.isMe = p.id === C.me;
      q.kind = p.kind || (p.from == null ? "family" : "joins");
      q.from = q.kind === "family" ? -Infinity : (p.isMe || p.id === C.me ? 0 : p.from);
      if (q.isMe) { q.from = 0; q.star = Object.assign({ at: endAge }, p.star || {}); }
      q.apart = p.apart || [];
      q.changes = (p.changes || []).slice().sort((a, b) => a.at - b.at);
      q.rank = p.rank ?? 1;
      q.side = q.isMe ? "C" : (p.side || "L");
      q.phase = (idx * 2.399) % (Math.PI * 2);
      q.layoutEnd = p.star ? p.star.at : p.leaves ? p.leaves.at : Infinity;
      if (q.isMe) q.layoutEnd = endAge;
      q.lineEnd = p.leaves ? p.leaves.at + LEAVE_Y : q.layoutEnd;
      if (q.kind === "crosses") {
        const t0 = clock.timeOfAge(p.from);
        q.crossEndAge = clock.ageAt(t0 + CROSS_S);
        q.layoutEnd = -Infinity;
        q.lineEnd = q.crossEndAge;
        q.crossT0 = t0;
      }
      byId[q.id] = q;
      return q;
    });
    const me = byId[C.me];
    if (!me) throw new Error("config.me must name one of the people");

    const isApart = (p, a) => {
      for (const [a0, a1] of p.apart) if (a >= a0 && a < a1) return true;
      return p.with && byId[p.with] ? isApart(byId[p.with], a) && byId[p.with].from <= a : false;
    };
    const changeAt = (p, a, key, dflt) => {
      let v = dflt;
      for (const c of p.changes) if (a >= c.at && c[key] !== undefined) v = c[key];
      return v;
    };
    const inLayout = (p, a) => p.kind !== "crosses" && a >= p.from && a < p.layoutEnd;

    // Grid of layout targets
    const A_MIN = Math.floor(clock.ageAt(0) - 14);
    const A_MAX = endAge + 20;
    const N = Math.round((A_MAX - A_MIN) / STEP) + 1;
    const ageOf = (i) => A_MIN + i * STEP;
    const tx = people.map(() => new Float64Array(N).fill(NaN));
    const ta = people.map(() => new Float64Array(N).fill(NaN));
    const CX = W / 2, SPAN = 375, MAXGAP = 82;
    const APART_IN = { L: 205, R: W - 160 }, APART_STEP = 24;

    for (let i = 0; i < N; i++) {
      const a = Math.min(ageOf(i), endAge - 0.001); // the layout freezes after my last year
      const main = { L: [], R: [] }, away = { L: [], R: [] };
      for (const p of people) {
        if (!inLayout(p, a)) continue;
        if (p.isMe) { tx[p.idx][i] = CX; ta[p.idx][i] = 1; continue; }
        if (isApart(p, a)) away[p.apartSide || p.side].push(p);
        else main[p.side].push(p);
      }
      for (const s of ["L", "R"]) {
        const list = main[s].sort((x, y) => x.rank - y.rank);
        const ks = list.map((p) => changeAt(p, a, "gap", 1));
        const sumK = ks.reduce((u, v) => u + v, 0) || 1;
        const g = Math.min(MAXGAP, SPAN / sumK);
        let off = 0;
        list.forEach((p, k) => {
          off += g * ks[k];
          tx[p.idx][i] = CX + (s === "L" ? -off : off);
          ta[p.idx][i] = changeAt(p, a, "alpha", 1);
        });
        away[s].sort((x, y) => x.rank - y.rank).forEach((p, k) => {
          tx[p.idx][i] = s === "L" ? APART_IN.L - k * APART_STEP : APART_IN.R + k * APART_STEP;
          ta[p.idx][i] = 0.36;
        });
      }
    }
    // after leaving the layout (star / leaves), hold the last target so the bend starts from there
    for (const p of people) {
      let last = NaN, lastA = 1;
      for (let i = 0; i < N; i++) {
        if (!isNaN(tx[p.idx][i])) { last = tx[p.idx][i]; lastA = ta[p.idx][i]; }
        else if (ageOf(i) >= p.from && !isNaN(last) && ageOf(i) < p.lineEnd + 1) { tx[p.idx][i] = last; ta[p.idx][i] = lastA; }
      }
    }

    // Gaussian smoothing -> S-curves between keyframes
    const R = Math.ceil((SIGMA * 3) / STEP);
    const kern = []; for (let k = -R; k <= R; k++) kern.push(Math.exp(-0.5 * ((k * STEP) / SIGMA) ** 2));
    const sx = people.map(() => new Float64Array(N).fill(NaN));
    const sa = people.map(() => new Float64Array(N).fill(NaN));
    for (const p of people) {
      const X = tx[p.idx], A = ta[p.idx];
      for (let i = 0; i < N; i++) {
        if (isNaN(X[i])) continue;
        let w = 0, vx = 0, va = 0;
        for (let k = -R; k <= R; k++) {
          const j = i + k; if (j < 0 || j >= N || isNaN(X[j])) continue;
          const kw = kern[k + R]; w += kw; vx += kw * X[j]; va += kw * A[j];
        }
        sx[p.idx][i] = vx / w; sa[p.idx][i] = va / w;
      }
    }

    function gridAt(arr, a) {
      const f = (a - A_MIN) / STEP, i = Math.floor(f);
      if (i < 0) return arr[0];
      if (i >= N - 1) return arr[N - 1];
      const u = arr[i], v = arr[i + 1];
      if (isNaN(u)) return v; if (isNaN(v)) return u;
      return lerp(u, v, f - i);
    }

    function originX(p, a) {
      if (p.origin === "left") return -20;
      if (p.origin === "right") return W + 20;
      if (p.origin && byId[p.origin]) return xAt(byId[p.origin], a, true);
      return p.side === "L" ? -70 : p.side === "R" ? W + 70 : CX;
    }

    // x of a person's line at age a (screen px)
    function xAt(p, a, noWobble) {
      if (p.kind === "crosses") {
        const u = clamp((a - p.from) / (p.crossEndAge - p.from), 0, 1);
        const [x0, x1] = p.direction === "rtl" ? [W + 60, -60] : [-60, W + 60];
        return lerp(x0, x1, u);
      }
      let x = gridAt(sx[p.idx], a);
      if (isFinite(p.from) && !p.isMe) x = lerp(originX(p, p.from), x, smooth((a - p.from) / JOIN_Y));
      if (p.leaves) {
        const u = (a - p.leaves.at) / LEAVE_Y;
        if (u > 0) x = lerp(x, p.leaves.side === "R" ? W + 140 : -140, clamp(u, 0, 1) ** 2);
      }
      if (p.star && !p.isMe) {
        const u = (a - (p.star.at - BEND_Y)) / BEND_Y;
        if (u > 0) x += (p.side === "R" ? 1 : -1) * 60 * clamp(u, 0, 1) ** 2;
      }
      if (!noWobble) {
        const amp = p.isMe ? 1.5 : 3.2;
        x += amp * Math.sin(a * 1.7 + p.phase) + amp * 0.5 * Math.sin(a * 0.63 + p.phase * 1.7);
      }
      return x;
    }
    function alphaAt(p, a) {
      if (p.kind === "crosses") return 0.62;
      const v = gridAt(sa[p.idx], a);
      return isNaN(v) ? 1 : v;
    }
    const exists = (p, a) => a >= p.from && a <= p.lineEnd;
    const alive = (p, a) => a >= p.from && a < (p.kind === "crosses" ? p.crossEndAge : p.layoutEnd);
    const nameAt = (p, a) => changeAt(p, a, "rename", p.name);

    // --------------------------------------------------------- stars/events
    const T = clock.timeOfAge;
    const stars = people.filter((p) => p.star).map((p) => ({
      p,
      at: p.star.at,
      t: p.isMe ? clockS : T(p.star.at),
      x: p.isMe ? null : p.star.x,
      y: p.isMe ? NOW_Y : p.star.y,
      big: p.isMe,
    }));
    const starOf = {}; stars.forEach((s) => (starOf[s.p.id] = s));

    const events = [];
    const add = (age, t, what, who, look) => events.push({ age, t: +t.toFixed(2), what, who, look: +(look ?? t).toFixed(2) });
    add(0, T(0), "born", me.name, T(0) + 0.8);
    for (const p of people) {
      if (p.isMe) continue;
      if (p.kind === "crosses") add(p.from, T(p.from), "crosses", p.name, T(p.from) + CROSS_S * 0.5);
      else if (isFinite(p.from)) add(p.from, T(p.from), "joins", p.name, T(p.from) + 1.4);
      for (const [a0, a1] of p.apart) {
        add(a0, T(a0), "drifts apart", p.name, T(a0) + 1.6);
        if (a1 < (p.layoutEnd ?? Infinity)) add(a1, T(a1), "rejoins", p.name, T(a1) + 1.6);
      }
      for (const c of p.changes) add(c.at, T(c.at), c.label || (c.rename ? `becomes "${c.rename}"` : "changes"), p.name, T(c.at) + 1.4);
      if (p.leaves) add(p.leaves.at, T(p.leaves.at), "leaves", p.name, T(p.leaves.at) + 1.0);
      if (p.star) add(p.star.at, T(p.star.at), "becomes a star", p.name, T(p.star.at) + SPARK_S + 0.9);
    }
    add(endAge, clockS, "I become the biggest star", me.name, clockS + 2.4);
    add(endAge, clockS + END.links[0] + 6 * END.links[1], "constellation complete", "", clockS + END.links[0] + 6 * END.links[1] + 0.2);
    add(endAge, clockS + END.italic, "Life is a journey", "", clockS + END.italic + 2.6);
    add(endAge, TOTAL, "fade to black", "", TOTAL - 0.6);
    events.sort((a, b) => a.t - b.t);

    return {
      W, H, FPS, NOW_Y, PX, CROSS_S, SPARK_S, END, TOTAL, C, clock, people, byId, me, stars, starOf, events,
      ageAt: clock.ageAt, timeOfAge: T, xAt, alphaAt, exists, alive, isApart, nameAt, changeAt,
      mulberry32, clamp, smooth, lerp,
    };
  }

  const api = { build, buildClock };
  root.LifeConstellation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
