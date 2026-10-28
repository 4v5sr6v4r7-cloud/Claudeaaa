/*
 * Life Constellation — canvas renderer.
 * Every frame is a pure function of time: draw(t) is called from HyperFrames'
 * "hf-seek" event. Label placement (which needs hysteresis so names do not
 * jump) is precomputed once, frame by frame from t = 0, so it is deterministic too.
 */
(function () {
  "use strict";
  const C = window.LC_CONFIG;
  const LC = window.LifeConstellation.build(C);
  window.LC = LC;
  const { W, H, NOW_Y, PX, FPS, TOTAL, END, people, me, stars, starOf, clamp, smooth, lerp } = LC;
  const tK = LC.clock.clockS; // my star moment
  const endAge = LC.clock.endAge;
  const child = LC.byId[C.child];
  const SANS = '"LC Sans", "DejaVu Sans", sans-serif';
  const SERIF = '"LC Serif", "DejaVu Serif", serif';
  const NAME_PX = 24, APART_PX = 20, STAR_PX = 22, ROW = 30;
  const CHILD_RATE = 0.42; // years per second my child keeps climbing after the end

  const cv = document.getElementById("sky");
  const ctx = cv.getContext("2d");
  const mk = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const layer = mk(), lctx = layer.getContext("2d");

  // ------------------------------------------------------------ colour util
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function tint(hex, w) { const [r, g, b] = rgb(hex); return `rgb(${Math.round(lerp(r, 255, w))},${Math.round(lerp(g, 255, w))},${Math.round(lerp(b, 255, w))})`; }

  // ------------------------------------------------------------- background
  const rand = LC.mulberry32(C.seed || 1999);
  const bg = mk();
  (function paintBackground() {
    const g = bg.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0c1440"); grad.addColorStop(0.45, "#081032"); grad.addColorStop(1, "#02040e");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const clouds = [[0.22, 0.18, "#6b3fa0"], [0.8, 0.3, "#4b2f8f"], [0.35, 0.55, "#5a2a7a"], [0.75, 0.72, "#3a2470"], [0.5, 0.08, "#7a4ab0"]];
    g.globalCompositeOperation = "lighter";
    for (const [cx, cy, col] of clouds) {
      for (let k = 0; k < 7; k++) {
        const x = cx * W + (rand() - 0.5) * 320, y = cy * H + (rand() - 0.5) * 260, r = 140 + rand() * 260;
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, rgba(col, 0.07 + rand() * 0.05)); rg.addColorStop(1, rgba(col, 0));
        g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  })();
  const field = Array.from({ length: 500 }, () => ({
    x: rand() * W, y: rand() * H, r: 0.35 + Math.pow(rand(), 3) * 1.5,
    a: 0.25 + rand() * 0.65, f: 0.5 + rand() * 2.2, ph: rand() * 6.28,
  }));

  // ----------------------------------------------------------- time helpers
  const camAge = (t) => LC.ageAt(Math.min(t, tK));
  const headAge = (p, t) => (p === child && t > tK ? endAge + (t - tK) * CHILD_RATE : camAge(t));
  const yOf = (a, cam) => NOW_Y + (cam - a) * PX;
  const oldFade = (t) => 1 - smooth((t - tK - END.fadeLines[0]) / (END.fadeLines[1] - END.fadeLines[0]));
  const nameFont = (px, bold) => `${bold ? 700 : 400} ${px}px ${SANS}`;

  function starPos(s) {
    if (s.big) return { x: LC.xAt(me, endAge - 0.001), y: NOW_Y };
    return { x: s.x, y: s.y };
  }
  function crossFade(p, t) {
    if (p.kind !== "crosses") return 1;
    return 1 - smooth((t - (p.crossT0 + LC.CROSS_S + 2.5)) / 2.5);
  }

  // ---------------------------------------------------------------- heads
  function heads(t) {
    const out = [], cam = camAge(t);
    for (const p of people) {
      const a = headAge(p, t);
      if (!LC.alive(p, a)) continue;
      if (p.isMe && t >= tK) continue;
      let alpha = LC.alphaAt(p, a) * crossFade(p, t);
      if (t > tK && p !== child) alpha *= oldFade(t);
      if (alpha < 0.02) continue;
      if (isFinite(p.from)) alpha *= smooth((a - p.from) / 0.25 + 0.15);
      out.push({ p, a, x: LC.xAt(p, a), y: yOf(a, cam), alpha, apart: LC.isApart(p, a) });
    }
    return out;
  }

  // ------------------------------------------------------- label placement
  const nFrames = Math.round(TOTAL * FPS) + 1;
  let LABELS = null; // per frame: [{id, text, x, y, w, h, px, alpha, color, hx, hy, under}]
  function starBoxes(t) {
    const out = [];
    for (const s of stars) {
      if (t < s.t + LC.SPARK_S) continue;
      const { x, y } = starPos(s);
      const R = s.big ? 40 : 15;
      out.push({ x: x - R, y: y - R, w: 2 * R, h: 2 * R, kind: "star", id: s.p.id });
      const lb = starLabel(s);
      out.push(Object.assign({ kind: "starlabel", id: s.p.id }, lb));
    }
    return out;
  }
  // Star names sit below the star unless that box would be crossed by a
  // constellation link or touch another star; then try right, left, above.
  const starLabelCache = {};
  function links() {
    const ids = C.constellation || [], out = [];
    for (let k = 0; k < ids.length - 1; k++) out.push([starPos(starOf[ids[k]]), starPos(starOf[ids[k + 1]])]);
    return out;
  }
  function segHitsBox(A, B, b, pad) {
    const n = Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / 3);
    for (let i = 0; i <= n; i++) {
      const x = lerp(A.x, B.x, i / n), y = lerp(A.y, B.y, i / n);
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
    }
    return false;
  }
  function starLabel(s) {
    if (starLabelCache[s.p.id]) return starLabelCache[s.p.id];
    const { x, y } = starPos(s);
    const px = s.big ? 32 : STAR_PX;
    ctx.font = nameFont(px, s.big);
    const w = ctx.measureText(s.p.name).width, h = px * 1.2;
    const off = s.big ? 64 : 21;
    const cands = [
      { x: x - w / 2, y: y + off }, { x: x + 20, y: y - h / 2 }, { x: x - 20 - w, y: y - h / 2 }, { x: x - w / 2, y: y - off - h },
    ].map((c) => ({ x: clamp(c.x, 10, W - 10 - w), y: c.y, w, h }));
    const L = links();
    const others = stars.filter((o) => o !== s).map((o) => { const q = starPos(o); return { x: q.x - 16, y: q.y - 16, w: 32, h: 32 }; });
    let pick = cands.find((b) => !L.some(([A, B]) => segHitsBox(A, B, b, 6)) && !others.some((o) => overlap(b, o, 4))) || cands[0];
    const out = Object.assign({ px, text: s.p.name }, pick);
    starLabelCache[s.p.id] = out;
    return out;
  }
  const AXIS_BOX = { x: 0, y: NOW_Y - 40, w: 104, h: 64, kind: "axis" };
  function tickBoxes(t) {
    const cam = camAge(t), out = [];
    for (let k = Math.max(0, Math.ceil((cam - 12) / 5) * 5); k <= cam + 12.5; k += 5) {
      const y = yOf(k, cam);
      if (Math.abs(y - NOW_Y) < 46 || y < 110) continue;
      out.push({ x: 0, y: y - 13, w: 56, h: 26, kind: "tick" });
    }
    return out;
  }
  const overlap = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

  function precomputeLabels() {
    LABELS = new Array(nFrames);
    const state = {}; // id -> {row, down, dx, dy, seen}
    const PAD = 6;
    for (let f = 0; f < nFrames; f++) {
      const t = f / FPS;
      const hs = heads(t).filter((h) => h.alpha > 0.04);
      hs.sort((u, v) => (v.p.isMe - u.p.isMe) || (v.alpha - u.alpha) || (u.p.rank - v.p.rank) || (u.p.idx - v.p.idx));
      const fixed = [AXIS_BOX, ...starBoxes(t), ...tickBoxes(t)];
      for (const h of hs) fixed.push({ x: h.x - 9, y: h.y - 9, w: 18, h: 18, kind: "head" });
      const placed = fixed.slice();
      const out = [];
      // pass 1: target slots (names are placed from the un-wobbled path, so the
      // line's tiny wobble never makes them hop between rows)
      for (const h of hs) {
        const p = h.p, text = LC.nameAt(p, h.a);
        const px = h.apart ? APART_PX : NAME_PX, bold = !h.apart;
        ctx.font = nameFont(px, bold);
        const w = ctx.measureText(text).width, bh = px * 1.15;
        const under = p.kind === "crosses";
        const hx = LC.xAt(p, h.a, true);
        const base = clamp(hx - w / 2, 8, W - 8 - w);
        const rowY = (r) => (under ? h.y + 26 + r * ROW : h.y - 22 - bh - r * ROW);
        const st = state[p.id] || (state[p.id] = { row: 0, down: 0, dx: null, dy: null, seen: -9 });
        const fits = (b) => !placed.some((q) => overlap(b, q, PAD));
        const tryRow = (r) => {
          const y = rowY(r), box = { x: base, y, w, h: bh };
          const hits = placed.filter((q) => overlap(box, q, PAD));
          if (!hits.length) return { r, x: base, y };
          if (hits.length === 1) { // small overlap: slide sideways
            const q = hits[0], ox = Math.min(box.x + w, q.x + q.w) - Math.max(box.x, q.x);
            if (ox < w * 0.5) {
              for (const nx of [q.x + q.w + PAD + 2, q.x - PAD - 2 - w].sort((u, v) => Math.abs(u - base) - Math.abs(v - base))) {
                if (nx < 8 || nx + w > W - 8 || Math.abs(nx + w / 2 - hx) > w * 0.75 + 20) continue;
                if (fits({ x: nx, y, w, h: bh })) return { r, x: nx, y };
              }
            }
          }
          return null; // big overlap: move a line out
        };
        let best = null;
        for (let r = 0; r < 9 && !best; r++) best = tryRow(r);
        if (!best) best = { r: 9, x: base, y: rowY(9) };
        // hysteresis: only drop back to a lower row after it has been free for 15 frames
        if (best.r < st.row && st.seen === f - 1) {
          const keep = tryRow(st.row);
          if (keep && ++st.down < 15) best = keep; else st.down = 0;
        } else st.down = 0;
        st.row = best.r;
        placed.push({ x: best.x, y: best.y, w, h: bh, kind: "label" });
        out.push({ id: p.id, text, w, h: bh, px, bold, alpha: h.alpha, color: p.color, hx: h.x, hy: h.y, row: best.r, under, tx: best.x, ty: best.y, st });
      }
      // pass 2: glide toward the slot, unless the glide would touch another name -> snap
      const shown = [];
      out.forEach((l, i) => {
        const st = l.st;
        let x = l.tx, y = l.ty;
        if (st.dx !== null && st.seen === f - 1) {
          const gx = st.dx + (l.tx - st.dx) * 0.3, gy = st.dy + (l.ty - st.dy) * 0.3;
          const g = { x: gx, y: gy, w: l.w, h: l.h };
          const others = [...fixed, ...shown, ...out.slice(i + 1).map((o) => ({ x: o.tx, y: o.ty, w: o.w, h: o.h }))];
          if (!others.some((q) => overlap(g, q, 1))) { x = gx; y = gy; }
        }
        st.dx = x; st.dy = y; st.seen = f;
        l.x = x; l.y = y; delete l.st;
        shown.push({ x, y, w: l.w, h: l.h });
      });
      LABELS[f] = out;
    }
  }

  // ---------------------------------------------------------------- drawing
  function star4(g, x, y, R, color, a) {
    const rg = g.createRadialGradient(x, y, 0, x, y, R * 3.2);
    rg.addColorStop(0, rgba(color, 0.55 * a)); rg.addColorStop(1, rgba(color, 0));
    g.fillStyle = rg; g.fillRect(x - R * 3.2, y - R * 3.2, R * 6.4, R * 6.4);
    g.beginPath();
    const r = R * 0.26;
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4 - Math.PI / 2, rr = k % 2 ? r : R;
      g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    g.closePath();
    g.fillStyle = `rgba(255,255,255,${a})`; g.fill();
    g.beginPath(); g.arc(x, y, R * 0.22, 0, 6.283); g.fillStyle = rgba(color, 0.8 * a); g.fill();
  }
  function glowDot(g, x, y, r, color, a) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r * 4.5);
    rg.addColorStop(0, rgba(color, 0.6 * a)); rg.addColorStop(1, rgba(color, 0));
    g.fillStyle = rg; g.fillRect(x - r * 4.5, y - r * 4.5, r * 9, r * 9);
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fillStyle = `rgba(255,255,255,${a})`; g.fill();
  }
  function ring(g, x, y, r, color, a, w) {
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.strokeStyle = rgba(color, a); g.lineWidth = w || 2; g.stroke();
  }

  function drawLines(t) {
    const cam = camAge(t);
    lctx.clearRect(0, 0, W, H);
    lctx.globalCompositeOperation = "lighter";
    lctx.lineCap = "round"; lctx.lineJoin = "round";
    const fadeOld = t > tK ? oldFade(t) : 1;
    for (const p of people) {
      const hA = headAge(p, t);
      const a1 = Math.min(p.lineEnd, hA);
      const a0 = Math.max(p.from, cam - 12.6);
      if (a1 <= a0) continue;
      const cf = crossFade(p, t);
      if (cf <= 0.01) continue;
      const pts = [];
      const step = 0.1;
      for (let a = a0; a < a1; a += step) pts.push(a);
      pts.push(a1);
      const CH = 5;
      for (let s = 0; s < pts.length - 1; s += CH) {
        const seg = pts.slice(s, Math.min(pts.length, s + CH + 1));
        const mid = seg[seg.length >> 1];
        let al = LC.alphaAt(p, mid) * cf;
        if (p.kind === "crosses") al *= 0.75;
        if (t > tK) al *= p === child && mid >= endAge - 1.5 ? 1 : fadeOld;
        if (al < 0.01) continue;
        const wScale = 0.5 + 0.5 * Math.min(1, al);
        lctx.beginPath();
        seg.forEach((a, k) => { const x = LC.xAt(p, a), y = yOf(a, cam); k ? lctx.lineTo(x, y) : lctx.moveTo(x, y); });
        for (const [lw, la] of [[16, 0.06], [7, 0.2], [3, 0.95]]) {
          lctx.strokeStyle = rgba(p.color, la * al);
          lctx.lineWidth = lw * wScale;
          lctx.stroke();
        }
      }
    }
    // fade the past out in the bottom 25%
    lctx.globalCompositeOperation = "destination-out";
    const fg = lctx.createLinearGradient(0, H * 0.75, 0, H);
    fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(1, "rgba(0,0,0,1)");
    lctx.fillStyle = fg; lctx.fillRect(0, H * 0.75, W, H * 0.25);
    lctx.globalCompositeOperation = "source-over";
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(layer, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  function drawAxis(t) {
    const cam = camAge(t), a = t > tK ? oldFade(t) : 1;
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    // now line
    const ng = ctx.createLinearGradient(0, 0, W, 0);
    ng.addColorStop(0, "rgba(255,255,255,0)"); ng.addColorStop(0.12, "rgba(255,255,255,0.16)");
    ng.addColorStop(0.88, "rgba(255,255,255,0.16)"); ng.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = ng; ctx.fillRect(0, NOW_Y - 0.75, W, 1.5);
    // ticks every 5 years
    ctx.font = `400 22px ${SANS}`; ctx.textBaseline = "middle";
    for (let k = Math.max(0, Math.ceil((cam - 12) / 5) * 5); k <= cam + 12.5; k += 5) {
      const y = yOf(k, cam);
      if (Math.abs(y - NOW_Y) < 46 || y < 110) continue;
      const fa = y > H * 0.75 ? 1 - (y - H * 0.75) / (H * 0.25) : 1;
      ctx.fillStyle = `rgba(200,210,255,${0.38 * fa})`; ctx.fillRect(0, y - 0.75, 16, 1.5);
      ctx.fillStyle = `rgba(200,210,255,${0.5 * fa})`; ctx.fillText(String(k), 24, y);
    }
    // current age in yellow
    ctx.fillStyle = "#FFD84D";
    ctx.beginPath(); ctx.moveTo(4, NOW_Y - 8); ctx.lineTo(14, NOW_Y); ctx.lineTo(4, NOW_Y + 8); ctx.fill();
    ctx.font = `700 42px ${SANS}`;
    ctx.fillText(String(Math.max(0, Math.floor(cam + 1e-6))), 20, NOW_Y + 1);
    // the word "age"
    ctx.font = `400 26px ${SANS}`; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(220,228,255,0.6)";
    ctx.fillText("age", 28, 72);
    ctx.restore();
  }

  function drawHeads(t, hs) {
    ctx.globalCompositeOperation = "lighter";
    for (const h of hs) {
      const r = h.p.isMe ? 7 : h.apart ? 4 : 5.5;
      glowDot(ctx, h.x, h.y, r, h.p.color, Math.min(1, h.alpha * 1.1));
    }
    ctx.globalCompositeOperation = "source-over";
    // arrival / change flashes
    for (const p of people) {
      const flashes = [];
      if (isFinite(p.from)) flashes.push(LC.timeOfAge(p.from));
      for (const c of p.changes) if (c.flash) flashes.push(LC.timeOfAge(c.at));
      for (const tf of flashes) {
        const e = (t - tf) / 0.9;
        if (e < 0 || e > 1) continue;
        const a = headAge(p, t);
        const x = LC.xAt(p, a), y = yOf(a, camAge(t));
        ring(ctx, x, y, 8 + 46 * smooth(e), p.color, 0.8 * (1 - e), 2.5);
        if (p.changes.some((c) => c.flash && Math.abs(LC.timeOfAge(c.at) - tf) < 1e-6)) {
          for (let k = 0; k < 8; k++) {
            const ang = k * 0.785 + 0.3, d = 14 + 50 * smooth(e);
            glowDot(ctx, x + Math.cos(ang) * d, y + Math.sin(ang) * d, 2, "#FFFFFF", 1 - e);
          }
        }
      }
    }
  }

  function drawStars(t) {
    const cam = camAge(t);
    for (const s of stars) {
      if (t < s.t) continue;
      const P1 = starPos(s);
      if (s.big) continue; // drawn in the ending
      const e = (t - s.t) / LC.SPARK_S;
      if (e < 1) {
        const P0 = { x: LC.xAt(s.p, s.at - 0.001), y: NOW_Y };
        const c = { x: lerp(P0.x, P1.x, 0.15), y: Math.min(P0.y, P1.y) - 120 };
        const at = (u) => ({ x: (1 - u) ** 2 * P0.x + 2 * (1 - u) * u * c.x + u * u * P1.x, y: (1 - u) ** 2 * P0.y + 2 * (1 - u) * u * c.y + u * u * P1.y });
        const u = smooth(e);
        ctx.globalCompositeOperation = "lighter";
        for (let k = 16; k >= 1; k--) {
          const uk = u - k * 0.03;
          if (uk < 0) continue;
          const q = at(uk);
          glowDot(ctx, q.x, q.y, 2.4 * (1 - k / 20), s.p.color, 0.75 * (1 - k / 17));
        }
        const q = at(u);
        glowDot(ctx, q.x, q.y, 5, s.p.color, 1);
        ctx.globalCompositeOperation = "source-over";
        continue;
      }
      const e2 = (t - s.t - LC.SPARK_S) / 0.8;
      if (e2 < 1) ring(ctx, P1.x, P1.y, 6 + 64 * smooth(e2), s.p.color, 0.9 * (1 - e2), 2.5);
      const pop = 1 + 0.7 * (1 - smooth(e2 * 1.5));
      const tw = 0.85 + 0.15 * Math.sin(t * 1.3 + s.p.idx);
      ctx.globalCompositeOperation = "lighter";
      star4(ctx, P1.x, P1.y, 11 * pop, s.p.color, tw);
      ctx.globalCompositeOperation = "source-over";
      const lb = starLabel(s);
      drawText(lb.text, lb.x, lb.y, lb.px, false, s.p.color, smooth(e2 * 2) * 0.95);
    }
    void cam;
  }

  function drawText(text, x, y, px, bold, color, a) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = nameFont(px, bold);
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(3,5,20,0.8)"; ctx.lineWidth = 5;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = tint(color, 0.35);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawLabels(t) {
    const f = clamp(Math.round(t * FPS), 0, nFrames - 1);
    for (const l of LABELS[f]) {
      if (l.row >= 1 && !l.under) {
        ctx.strokeStyle = rgba(l.color, 0.28 * l.alpha); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(l.hx, l.hy - 8); ctx.lineTo(clamp(l.hx, l.x + 4, l.x + l.w - 4), l.y + l.h); ctx.stroke();
      }
      drawText(l.text, l.x, l.y, l.px, l.bold, l.color, Math.min(1, l.alpha * 1.15));
    }
  }

  function drawEnding(t) {
    if (t < tK) return;
    const s = starOf[me.id], P = starPos(s), e = (t - tK) / END.flare[1];
    // bloom
    const bloom = 40 + 520 * smooth(e * 2.2) * (1 - 0.6 * smooth((e - 0.4) / 0.6));
    const ba = 0.9 - 0.55 * smooth((e - 0.3) / 0.7);
    ctx.globalCompositeOperation = "lighter";
    const rg = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, bloom);
    rg.addColorStop(0, `rgba(255,236,190,${ba})`); rg.addColorStop(0.25, `rgba(255,200,110,${ba * 0.5})`); rg.addColorStop(1, "rgba(255,180,80,0)");
    ctx.fillStyle = rg; ctx.fillRect(P.x - bloom, P.y - bloom, bloom * 2, bloom * 2);
    // constellation links, one by one
    const ids = C.constellation || [];
    for (let k = 0; k < ids.length - 1; k++) {
      const t0 = tK + END.links[0] + k * END.links[1];
      const u = smooth((t - t0) / END.links[1]);
      if (u <= 0) continue;
      const A = starPos(starOf[ids[k]]), B = starPos(starOf[ids[k + 1]]);
      const d = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / d, uy = (B.y - A.y) / d;
      const ra = starOf[ids[k]].big ? 44 : 18, rb = starOf[ids[k + 1]].big ? 44 : 18;
      const sx = A.x + ux * ra, sy = A.y + uy * ra;
      const ex = lerp(sx, B.x - ux * rb, u), ey = lerp(sy, B.y - uy * rb, u);
      for (const [lw, la] of [[6, 0.1], [1.6, 0.75]]) {
        ctx.strokeStyle = `rgba(255,236,205,${la})`; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
    // my star
    const tw = 0.9 + 0.1 * Math.sin(t * 1.1);
    star4(ctx, P.x, P.y, 36 * smooth(e * 1.6) * tw, "#FFD36E", 1);
    ctx.globalCompositeOperation = "source-over";
    const lb = starLabel(s);
    drawText(lb.text, lb.x, lb.y, lb.px, true, "#FFD36E", smooth((e - 0.4) * 2));

    // words
    const cx = W / 2, ty = Math.round(H * 0.75);
    const ta = smooth((t - tK - END.title) / 1.6);
    if (ta > 0) {
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = ta; ctx.fillStyle = "#F6EEDC";
      ctx.font = `500 84px ${SERIF}`;
      ctx.fillText(C.title || "Life is a journey", cx, ty);
      const ru = smooth((t - tK - END.rule) / 1.0);
      ctx.globalAlpha = 0.7 * ru; ctx.fillRect(cx - 140 * ru, ty + 38, 280 * ru, 1.5);
      const ia = smooth((t - tK - END.italic) / 1.6);
      ctx.globalAlpha = ia; ctx.font = `italic 400 38px ${SERIF}`; ctx.fillStyle = "#E9DFC8";
      (C.subtitle || []).forEach((line, k) => ctx.fillText(line, cx, ty + 100 + k * 50));
      ctx.restore();
    }
  }

  function draw(t) {
    t = clamp(t, 0, TOTAL);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (const s of field) {
      const a = s.a * (0.72 + 0.28 * Math.sin(t * s.f + s.ph));
      ctx.fillStyle = `rgba(220,228,255,${a})`;
      ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    drawAxis(t);
    drawLines(t);
    drawStars(t);
    drawHeads(t, heads(t));
    drawLabels(t);
    drawEnding(t);
    const fb = smooth((t - tK - END.black[0]) / END.black[1]);
    if (fb > 0) { ctx.fillStyle = `rgba(0,0,0,${fb})`; ctx.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------ debug/check
  window.__lcBoxes = function (t) {
    const f = clamp(Math.round(t * FPS), 0, nFrames - 1);
    const labels = LABELS[f].map((l) => ({ kind: "label", id: l.id, text: l.text, x: l.x, y: l.y, w: l.w, h: l.h, settled: Math.abs(l.x - l.tx) < 1 && Math.abs(l.y - l.ty) < 1 }));
    const sb = starBoxes(t).map((b) => Object.assign({}, b));
    return { labels, stars: sb };
  };

  // ------------------------------------------------------------------ boot
  const fonts = [nameFont(24, false), nameFont(24, true), `500 40px ${SERIF}`, `italic 400 40px ${SERIF}`];
  const ready = Promise.all(fonts.map((f) => document.fonts.load(f, "Life is a journey Aa")))
    .catch(() => null)
    .then(() => { precomputeLabels(); });
  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  window.__hf.buildReady.lifeConstellation = ready;
  let isReady = false, lastT = 0;
  window.__lcDraw = (t) => { lastT = t; if (isReady) draw(t); };
  window.__lcReady = ready.then(() => { isReady = true; draw(lastT); });
  window.addEventListener("hf-seek", (e) => {
    lastT = e.detail.time;
    if (isReady) draw(lastT);
    else if (e.detail.waitUntil) e.detail.waitUntil(window.__lcReady);
  });
})();
