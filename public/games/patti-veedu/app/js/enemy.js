/* KOLUSU — navigation grid, line of sight, and Kolusu Paatti */
'use strict';
(function (K) {
  const W = K.W;

  /* ============ navigation: one grid per floor, joined at the staircases ============ */
  // 25 cm cells. grid: 1 = blocked for walking (walls and furniture grown by the body radius).
  // wall: 1 = a wall for sight and light. doorCell / doorLos: which door covers a cell.
  const N = K.Nav = {};
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];
  const CELL = 0.25, R = 0.3, LI = lv => lv + 1;
  let X0 = -0.5, Z0 = -10.5, GW = 100, GH = 158, NC = GW * GH;
  let grid, wall, block, comp, doorCell, doorLos, gScore, came, stamp, closed, isLink, cur = 0, links = new Map(), lockSig = '';
  N.CELL = CELL;
  const ccx = i => X0 + (i + 0.5) * CELL, ccz = j => Z0 + (j + 0.5) * CELL;
  function cellOf(x, z, lv) { const i = Math.max(0, Math.min(GW - 1, Math.floor((x - X0) / CELL))), j = Math.max(0, Math.min(GH - 1, Math.floor((z - Z0) / CELL))); return LI(lv) * NC + j * GW + i; }
  const lvOf = k => Math.floor(k / NC) - 1;
  const ptOf = k => { const l = k % NC; return { x: ccx(l % GW), z: ccz((l / GW) | 0), lv: lvOf(k) }; };
  const pass = k => k >= 0 && k < NC * 3 && !block[k];
  N.passAt = (x, z, lv = 0) => { if (x < X0 || z < Z0 || x >= X0 + GW * CELL || z >= Z0 + GH * CELL || lv < -1 || lv > 1) return false; return pass(cellOf(x, z, lv)); };
  function rangeI(a, b, grow) { return [Math.max(0, Math.ceil((a - grow - X0) / CELL - 0.5)), Math.min(GW - 1, Math.floor((b + grow - X0) / CELL - 0.5))]; }
  function rangeJ(a, b, grow) { return [Math.max(0, Math.ceil((a - grow - Z0) / CELL - 0.5)), Math.min(GH - 1, Math.floor((b + grow - Z0) / CELL - 0.5))]; }
  function overI(a, b) { return [Math.max(0, Math.floor((a - X0) / CELL)), Math.min(GW - 1, Math.floor((b - X0) / CELL - 1e-6))]; }
  function overJ(a, b) { return [Math.max(0, Math.floor((a - Z0) / CELL)), Math.min(GH - 1, Math.floor((b - Z0) / CELL - 1e-6))]; }
  N.refreshDoors = function () {
    const sig = W.doors.map(d => d.locked ? 1 : 0).join(''); if (sig === lockSig) return; lockSig = sig;
    for (let k = 0; k < NC * 3; k++) block[k] = grid[k] || (doorCell[k] >= 0 && W.doors[doorCell[k]].locked) ? 1 : 0;
    labelRegions();
  };
  // connected regions: a path between two regions is impossible, so A* is never run for it
  function labelRegions() {
    if (!comp || comp.length !== NC * 3) comp = new Int32Array(NC * 3);
    comp.fill(0); let id = 0; const q = new Int32Array(NC * 3);
    for (let s0 = 0; s0 < NC * 3; s0++) {
      if (block[s0] || comp[s0]) continue;
      id++; let h = 0, t = 0; q[t++] = s0; comp[s0] = id;
      while (h < t) {
        const k = q[h++], lb = ((k / NC) | 0) * NC, l = k - lb, ci = l % GW, cj = (l - ci) / GW;
        for (let d = 0; d < 4; d++) { const i = ci + DI[d], j = cj + DJ[d]; if (i < 0 || j < 0 || i >= GW || j >= GH) continue; const n = lb + j * GW + i; if (!block[n] && !comp[n]) { comp[n] = id; q[t++] = n; } }
        if (isLink[k]) for (const [n] of links.get(k)) if (!block[n] && !comp[n]) { comp[n] = id; q[t++] = n; }
      }
    }
  }
  N.build = function () {
    const B = W.BOUNDS || { x0: -0.5, x1: 24.5, z0: -10.5, z1: 29 };
    X0 = B.x0; Z0 = B.z0; GW = Math.ceil((B.x1 - B.x0) / CELL); GH = Math.ceil((B.z1 - B.z0) / CELL); NC = GW * GH;
    grid = new Uint8Array(NC * 3).fill(1); wall = new Uint8Array(NC * 3); block = new Uint8Array(NC * 3);
    doorCell = new Int16Array(NC * 3).fill(-1); doorLos = new Int16Array(NC * 3).fill(-1);
    gScore = new Float32Array(NC * 3); came = new Int32Array(NC * 3); stamp = new Uint32Array(NC * 3); closed = new Uint32Array(NC * 3); isLink = new Uint8Array(NC * 3);
    for (const lv of [-1, 0, 1]) {
      const base = LI(lv) * NC;
      for (const a of (W.AREA[lv] || [])) { const [i0, i1] = rangeI(a[0], a[1], -0.001), [j0, j1] = rangeJ(a[2], a[3], -0.001); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[base + j * GW + i] = 0; }
      for (const s of W.solids) {
        if (s.lv !== lv || s.door) continue;
        if (s.t === 'b') { const [i0, i1] = rangeI(s.minX, s.maxX, R), [j0, j1] = rangeJ(s.minZ, s.maxZ, R); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[base + j * GW + i] = 1; }
        else { const rr = s.r + R, [i0, i1] = rangeI(s.x, s.x, rr), [j0, j1] = rangeJ(s.z, s.z, rr); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const dx = ccx(i) - s.x, dz = ccz(j) - s.z; if (dx * dx + dz * dz < rr * rr) grid[base + j * GW + i] = 1; } }
      }
      for (const st of W.stairs) if (st.lo === lv || st.hi === lv) { const [i0, i1] = rangeI(st.x0, st.x1, 0.05), [j0, j1] = rangeJ(st.z0, st.z1, 0.05); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[base + j * GW + i] = 1; }
      const wallBoxes = W.solids.filter(s => s.lv === lv && s.wall).concat(W.losBoxes.filter(b => (b.lv || 0) === lv));
      for (const b of wallBoxes) { const [i0, i1] = overI(b.minX, b.maxX), [j0, j1] = overJ(b.minZ, b.maxZ); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) wall[base + j * GW + i] = 1; }
      W.doors.forEach((d, n) => {
        if ((d.lv || 0) !== lv) return; const b = d.box;
        { const [i0, i1] = rangeI(b.minX, b.maxX, R), [j0, j1] = rangeJ(b.minZ, b.maxZ, R); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = base + j * GW + i; if (!grid[k]) doorCell[k] = n; } }
        { const [i0, i1] = overI(b.minX, b.maxX), [j0, j1] = overJ(b.minZ, b.maxZ); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) doorLos[base + j * GW + i] = n; }
      });
    }
    lockSig = ''; N.refreshDoors();
    links = new Map(); N.portals = [];
    for (const st of W.stairs) {
      let top, bot;
      if (st.axis === 'z') { const x = (st.x0 + st.x1) / 2; top = { x, z: st.topAtMin ? st.z0 - 0.35 : st.z1 + 0.35 }; bot = { x, z: st.topAtMin ? st.z1 + 0.35 : st.z0 - 0.35 }; }
      else { const z = (st.z0 + st.z1) / 2; top = { x: st.topAtMin ? st.x0 - 0.35 : st.x1 + 0.35, z }; bot = { x: st.topAtMin ? st.x1 + 0.35 : st.x0 - 0.35, z }; }
      const a = nearestFree(cellOf(top.x, top.z, st.hi)), b = nearestFree(cellOf(bot.x, bot.z, st.lo));
      const len = (st.axis === 'x' ? st.x1 - st.x0 : st.z1 - st.z0) + 0.7, cost = Math.hypot(len, st.yHi - st.yLo) / CELL;
      if (a < 0 || b < 0) continue;
      if (!links.has(a)) links.set(a, []); if (!links.has(b)) links.set(b, []);
      links.get(a).push([b, cost]); links.get(b).push([a, cost]); isLink[a] = isLink[b] = 1; N.portals.push({ a: ptOf(a), b: ptOf(b), st });
    }
    labelRegions();
  };
  function nearestFree(k) {
    if (pass(k)) return k;
    const lvBase = Math.floor(k / NC) * NC, l = k % NC, ci = l % GW, cj = (l / GW) | 0;
    for (let r = 1; r < 16; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      const n = lvBase + j * GW + i; if (pass(n)) return n;
    }
    return -1;
  }
  // can one walk from a to b right now (locked doors included)?
  N.reach = function (ax, az, alv, bx, bz, blv) { N.refreshDoors(); const a = nearestFree(cellOf(ax, az, alv)), b = nearestFree(cellOf(bx, bz, blv)); return a >= 0 && b >= 0 && comp[a] === comp[b]; };
  N.cellKey = (x, z, lv = 0) => cellOf(x, z, lv);
  N.nearestFreePoint = function (x, z, lv = 0) { const k = nearestFree(cellOf(x, z, lv)); return k < 0 ? null : ptOf(k); };
  function clear(a, b, lv) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.15);
    for (let s = 1; s < n; s++) if (!N.passAt(a.x + dx * s / n, a.z + dz * s / n, lv)) return false;
    return true;
  }
  N.clear = clear;
  // binary heap on typed arrays (no garbage while Paatti thinks)
  const HCAP = 1 << 18, HK = new Int32Array(HCAP), HF = new Float32Array(HCAP); let hn = 0;
  function hpush(k, f) { if (hn >= HCAP) return; let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (HF[p] <= f) break; HK[i] = HK[p]; HF[i] = HF[p]; i = p; } HK[i] = k; HF[i] = f; }
  function hpop() { const top = HK[0], lk = HK[--hn], lf = HF[hn]; let i = 0; for (; ;) { const l = 2 * i + 1; if (l >= hn) break; const r = l + 1, m = (r < hn && HF[r] < HF[l]) ? r : l; if (HF[m] >= lf) break; HK[i] = HK[m]; HF[i] = HF[m]; i = m; } HK[i] = lk; HF[i] = lf; return top; }
  N.iters = 0;
  N.find = function (sx, sz, slv, tx, tz, tlv) {
    N.refreshDoors();
    const s = nearestFree(cellOf(sx, sz, slv)), t = nearestFree(cellOf(tx, tz, tlv));
    if (s < 0 || t < 0) return null;
    if (comp[s] !== comp[t]) { N.iters = 0; return null; }
    cur++; hn = 0;
    const tl = t % NC, ti = tl % GW, tj = (tl / GW) | 0, HW = 1.3;
    stamp[s] = cur; gScore[s] = 0; came[s] = -1;
    { const l = s % NC, di = Math.abs(l % GW - ti), dj = Math.abs(((l / GW) | 0) - tj); hpush(s, HW * (Math.max(di, dj) + 0.414 * Math.min(di, dj))); }
    let found = false, iter = 0;
    while (hn && iter++ < 70000) {
      const k = hpop(); if (closed[k] === cur) continue; closed[k] = cur;
      if (k === t) { found = true; break; }
      const lb = ((k / NC) | 0) * NC, l = k - lb, ci = l % GW, cj = (l - ci) / GW, gk = gScore[k];
      for (let d = 0; d < 8; d++) {
        const i = ci + DI[d], j = cj + DJ[d]; if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
        const n = lb + j * GW + i; if (block[n] || closed[n] === cur) continue;
        if (d > 3 && (block[lb + cj * GW + i] || block[lb + j * GW + ci])) continue;
        const g = gk + DC[d];
        if (stamp[n] !== cur || g < gScore[n]) { stamp[n] = cur; gScore[n] = g; came[n] = k; const di = Math.abs(i - ti), dj = Math.abs(j - tj); hpush(n, g + HW * (Math.max(di, dj) + 0.414 * Math.min(di, dj))); }
      }
      if (isLink[k]) for (const [n, c] of links.get(k)) {
        if (block[n] || closed[n] === cur) continue; const g = gk + c;
        if (stamp[n] !== cur || g < gScore[n]) { stamp[n] = cur; gScore[n] = g; came[n] = k; const ln = n % NC, di = Math.abs(ln % GW - ti), dj = Math.abs(((ln / GW) | 0) - tj); hpush(n, g + HW * (Math.max(di, dj) + 0.414 * Math.min(di, dj))); }
      }
    }
    N.iters = iter;
    if (!found) return null;
    const pts = []; for (let k = t; k >= 0; k = came[k]) pts.push(ptOf(k));
    pts.reverse();
    // string-pull within each floor; stair hops are kept as-is
    const out = [pts[0]]; let a = 0;
    while (a < pts.length - 1) {
      if (pts[a + 1].lv !== pts[a].lv) { out.push(pts[a + 1]); a++; continue; }
      let b = Math.min(pts.length - 1, a + 28);
      for (let q = a + 1; q <= b; q++) if (pts[q].lv !== pts[a].lv) { b = q - 1; break; }
      while (b > a + 1 && !clear(pts[a], pts[b], pts[a].lv)) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  };
  // grid walk between two points; the end cells are skipped so thin walls never block their own surfaces
  function walk(x0, z0, x1, z1, lv, doors) {
    if (lv < -1 || lv > 1) return true;
    const gx = (x0 - X0) / CELL, gz = (z0 - Z0) / CELL, ex = (x1 - X0) / CELL, ez = (z1 - Z0) / CELL;
    let i = Math.floor(gx), j = Math.floor(gz); const ie = Math.floor(ex), je = Math.floor(ez);
    const dx = ex - gx, dz = ez - gz, sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sz = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tdx = sx ? Math.abs(1 / dx) : 1e9, tdz = sz ? Math.abs(1 / dz) : 1e9;
    let tmx = sx > 0 ? (i + 1 - gx) * tdx : sx < 0 ? (gx - i) * tdx : 1e9, tmz = sz > 0 ? (j + 1 - gz) * tdz : sz < 0 ? (gz - j) * tdz : 1e9;
    const base = LI(lv) * NC;
    for (let n = 0; n < 4000; n++) {
      if (i === ie && j === je) return true;
      if (tmx < tmz) { tmx += tdx; i += sx; } else { tmz += tdz; j += sz; }
      if (i === ie && j === je) return true;
      if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
      const k = base + j * GW + i;
      if (wall[k]) return false;
      if (doors && doorLos[k] >= 0 && W.doors[doorLos[k]].angle < 0.45) return false;
    }
    return true;
  }
  N.los = (x0, z0, x1, z1, lv = 0) => walk(x0, z0, x1, z1, lv, true) && mainDoorClear(x0, z0, x1, z1, lv);
  N.losWalls = (x0, z0, x1, z1, lv = 0) => walk(x0, z0, x1, z1, lv, false);
  function mainDoorClear(x0, z0, x1, z1, lv) { const m = W.main; if (!m || lv !== 0 || m.open > 0.3) return true; return !((z0 - m.z) * (z1 - m.z) < 0 && Math.abs((x0 + (x1 - x0) * (m.z - z0) / ((z1 - z0) || 1e-9)) - m.x) < 0.85); }

  /* ============ Kolusu Paatti — the model ============ */
  function limbPivot(parent, x, y, z, len, rad, mat) {
    const piv = new THREE.Group(); piv.position.set(x, y, z); parent.add(piv);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 0.8, len, 8), mat); arm.position.y = -len / 2; piv.add(arm);
    const hand = new THREE.Group(); hand.position.y = -len; piv.add(hand);
    return { piv, hand };
  }
  function buildPaatti() {
    const g = new THREE.Group();
    const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, o));
    const saree = std({ color: 0xaeaba3, emissive: 0x0d0f12, side: THREE.DoubleSide });
    const skin = std({ color: 0x8e9396, roughness: 0.75, emissive: 0x0a0c0f });
    const hairM = std({ color: 0x070709, roughness: 0.45, side: THREE.DoubleSide });
    const red = std({ color: 0xaeaba3, emissive: 0x0d0f12 });
    const prof = [[0.001, 0], [0.42, 0], [0.4, 0.12], [0.33, 0.55], [0.25, 0.92], [0.2, 1.05], [0.24, 1.2], [0.25, 1.32], [0.2, 1.42], [0.09, 1.48], [0.06, 1.52], [0.001, 1.52]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 22), saree); g.add(body);
    const border = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.425, 0.09, 22, 1, true), red); border.position.y = 0.05; g.add(border);
    // pallu across the shoulder
    const pallu = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.95), saree); pallu.position.set(0.04, 1.08, 0.2); pallu.rotation.set(-0.25, 0, 0.55); g.add(pallu);
    const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.95), red); pb.position.set(0.12, 1.06, 0.205); pb.rotation.set(-0.25, 0, 0.55); g.add(pb);
    // feet with anklets peeking under the hem
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.14), skin); f.position.set(s * 0.09, 0.02, 0.38); g.add(f);
      const an = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 14), std({ color: 0xbfc3c6, metalness: 0.8, roughness: 0.25, emissive: 0x222222 })); an.rotation.x = Math.PI / 2; an.position.set(s * 0.09, 0.06, 0.34); g.add(an);
    }
    // head
    const headG = new THREE.Group(); headG.position.set(0, 1.6, 0.05); g.add(headG);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), skin); head.scale.set(0.92, 1.12, 0.98); headG.add(head);
    const eyeHole = new THREE.MeshBasicMaterial({ color: 0x000000 }), glow = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), eyeHole); e.position.set(s * 0.045, 0.015, 0.1); e.scale.set(1.1, 0.8, 0.6); headG.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 6), glow); p.position.set(s * 0.045, 0.012, 0.118); headG.add(p);
    }
    const pottu = new THREE.Mesh(new THREE.CircleGeometry(0.013, 12), new THREE.MeshBasicMaterial({ color: 0xa3120b })); pottu.position.set(0, 0.075, 0.121); pottu.rotation.x = -0.35; headG.add(pottu);
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), eyeHole); mouth.position.set(0, -0.065, 0.1); mouth.scale.set(1.3, 0.7, 0.5); headG.add(mouth);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), skin); nose.position.set(0, -0.015, 0.125); nose.rotation.x = Math.PI / 2; headG.add(nose);
    // long loose white hair
    const strands = [];
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * 0.25 + (i / 21) * Math.PI * 1.5; // around the back and sides
      const len = 0.55 + Math.random() * 0.35;
      const piv = new THREE.Group(); piv.position.set(Math.sin(a) * 0.1, 0.1, Math.cos(a) * 0.1 - 0.01); piv.rotation.y = a;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.06, len), hairM); s.position.set(0, -len / 2, -0.03); piv.add(s);
      headG.add(piv); strands.push(piv);
    }
    for (const x of [-0.07, 0.04, 0.085]) { // strands across the face
      const piv = new THREE.Group(); piv.position.set(x, 0.11, 0.1); const len = 0.3 + Math.random() * 0.2;
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.035, len), hairM); s.position.y = -len / 2; piv.add(s); headG.add(piv); strands.push(piv);
    }
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.134, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), hairM); crown.position.y = 0.03; crown.rotation.x = -0.45; headG.add(crown);
    headG.rotation.x = 0.22;
    // arms
    const L = limbPivot(g, 0.21, 1.36, 0.02, 0.56, 0.035, skin);
    const Rr = limbPivot(g, -0.21, 1.36, 0.02, 0.5, 0.035, skin);
    for (const h of [L.hand, Rr.hand]) { const hs = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), skin); hs.scale.set(0.8, 1.2, 0.6); h.add(hs); }
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.09, 4), skin); f.position.set(-0.024 + i * 0.016, -0.07, 0); f.rotation.x = 0.2; L.hand.add(f); }
    // the brass oil lamp she carries
    const lamp = new THREE.Group(); Rr.hand.add(lamp);
    const brass = new THREE.MeshStandardMaterial({ color: 0xc19032, metalness: 0.55, roughness: 0.32, emissive: 0x2a1a04 });
    const lb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), brass); lamp.add(lb);
    const lh = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 10), brass); lh.position.set(-0.07, -0.01, 0); lamp.add(lh);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: W._flame || (W._flame = K.makeFlameTex()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.scale.set(0.06, 0.12, 1); flame.position.set(0.05, 0.06, 0); lamp.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.makeGlowTex('rgba(255,200,120,0.6)', 'rgba(255,120,30,0.18)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.set(0.7, 0.7, 1); halo.position.set(0.05, 0.06, 0); lamp.add(halo);
    const light = new THREE.PointLight(0xff9437, 1.6, 6.5, 2); light.position.set(0.05, 0.12, 0); lamp.add(light);
    g.traverse(c => { if (c.isMesh) { c.castShadow = true; } });
    g.userData = { headG, L, R: Rr, lamp, flame, halo, light, strands, body };
    return g;
  }

  /* ============ AI ============ */
  // Paatti never leaves the compound walls — the front yard is beyond her
  const WAY = [
    { x: 10.8, z: 3.6, lv: 0 }, { x: 5.6, z: 1.8, lv: 0 }, { x: 16.5, z: 4.6, lv: 0 }, { x: 21.2, z: 3.2, lv: 0 }, { x: 4.0, z: 8.0, lv: 0 }, { x: 4.0, z: 12.6, lv: 0 },
    { x: 7.4, z: 7.2, lv: 0 }, { x: 16.6, z: 7.6, lv: 0 }, { x: 7.4, z: 12.8, lv: 0 }, { x: 16.6, z: 12.8, lv: 0 }, { x: 20.6, z: 10.6, lv: 0 }, { x: 11, z: 18.6, lv: 0 },
    { x: 15.5, z: 17.4, lv: 0 }, { x: 3.0, z: 16.8, lv: 0 }, { x: 20.6, z: 17.0, lv: 0 }, { x: 12, z: 13.2, lv: 0 },
    { x: 4.5, z: -3.0, lv: 0 }, { x: 12.0, z: -4.5, lv: 0 }, { x: 18.0, z: -7.3, lv: 0 }, { x: 7.5, z: -8.5, lv: 0 },
    { x: 3.2, z: 10.5, lv: -1 }, { x: 4.0, z: 12.6, lv: -1 },
    { x: 6.0, z: 3.0, lv: 1 }, { x: 18.0, z: 16.0, lv: 1 }, { x: 2.7, z: 17.0, lv: 1 }, { x: 20.5, z: 10.0, lv: 1 }, { x: 12.0, z: 5.5, lv: 1 },
    // the second wing, both floors
    { x: 26.0, z: 10.0, lv: 0 }, { x: 29.5, z: 6.2, lv: 0 }, { x: 40.5, z: 13.8, lv: 0 }, { x: 35.0, z: 13.8, lv: 0 }, { x: 35.0, z: 6.2, lv: 0 }, { x: 33.5, z: 3.2, lv: 0 },
    { x: 42.8, z: 3.0, lv: 0 }, { x: 44.0, z: 10.0, lv: 0 }, { x: 28.0, z: 2.8, lv: 0 }, { x: 30.0, z: 17.2, lv: 0 }, { x: 41.0, z: 18.3, lv: 0 },
    { x: 26.0, z: 10.0, lv: 1 }, { x: 29.5, z: 13.8, lv: 1 }, { x: 40.5, z: 6.2, lv: 1 }, { x: 35.0, z: 13.8, lv: 1 }, { x: 28.0, z: 2.8, lv: 1 }, { x: 34.0, z: 2.8, lv: 1 },
    { x: 42.0, z: 3.2, lv: 1 }, { x: 43.6, z: 12.0, lv: 1 }, { x: 30.0, z: 16.6, lv: 1 }, { x: 40.0, z: 17.2, lv: 1 }
  ];
  const E = K.E = {
    pos: new THREE.Vector3(), yaw: 0, lv: 0, y: 0, state: 'idle', path: null, pi: 0, wait: 0, repath: 0, lastSeen: { x: 0, z: 0, lv: 0 }, lastSeenT: -99,
    sus: 0, sawHide: null, stepT: 0, humT: 12, whisperT: 20, voiceT: 22, lastLine: '', lookT: 0, lookBase: 0, speed: 0, diff: { speed: 1, vision: 1, ko: 28 }, night: 1,
    lastWays: [], target: null, active: true, model: null, t: 0, chaseT: 0, catchArmed: true, koT: 0, getup: 0
  };
  E.build = function (scene) {
    E.scene = scene; E.model = buildPaatti(); E.kind = 'proc'; scene.add(E.model);
    return new Promise(resolve => {
      const src = window.GRANNY_GLB || window.PAATTI_RB_GLB || window.PAATTI_GLB, granny = !!window.GRANNY_GLB, rb = !granny && !!window.PAATTI_RB_GLB;
      if (!src || !THREE.GLTFLoader) { resolve(false); return; }
      try {
        const s = atob(src), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
        const hairP = rb && K.loadHair ? K.loadHair() : Promise.resolve(null);
        new THREE.GLTFLoader().parse(u.buffer, '', gltf => hairP.then(hairSrc => {
          try { const m = granny ? setupGranny(gltf) : rb ? setupRocket(gltf, hairSrc) : setupGLB(gltf); scene.remove(E.model); E.model = m; E.kind = granny ? 'granny' : rb ? 'rocket' : 'glb'; scene.add(m); resolve(true); }
          catch (e) { console.warn('Paatti model setup failed, using fallback', e); resolve(false); }
        }), err => { console.warn('Paatti model failed to load', err); resolve(false); });
      } catch (e) { resolve(false); }
    });
  };

  /* ---------- the rigged Paatti (Mesh2Motion CC0 mannequin, dressed) ---------- */
  const RARM = new Set(['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', 'index_01_r', 'middle_01_r', 'pinky_01_r', 'ring_01_r', 'thumb_01_r']);
  const LARM = new Set(['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'index_01_l', 'middle_01_l', 'pinky_01_l', 'ring_01_l', 'thumb_01_l']);
  const boneOf = t => t.name.split('.')[0];
  function compose(name, base, overrides) {
    const tracks = base.tracks.filter(t => !t.name.startsWith('root.') && !overrides.some(([, set]) => set.has(boneOf(t)))).map(t => t.clone());
    for (const [c, set] of overrides) for (const t of c.tracks) if (set.has(boneOf(t))) tracks.push(t.clone());
    return new THREE.AnimationClip(name, base.duration, tracks);
  }
  // fewer draw calls: merge sibling meshes that share a material (beads, bells, bangles) into one mesh
  function mergeChildren(parent) {
    const groups = new Map();
    for (const c of parent.children) if (c.isMesh && !c.isSkinnedMesh && !c.children.length && !Array.isArray(c.material)) { if (!groups.has(c.material)) groups.set(c.material, []); groups.get(c.material).push(c); }
    for (const [mat, list] of groups) {
      if (list.length < 2) continue;
      const parts = list.map(m => { m.updateMatrix(); let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), UV = new Float32Array(n * 2); let o = 0;
      for (const g of parts) { P.set(g.attributes.position.array, o * 3); if (g.attributes.normal) Nn.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) UV.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      const mm = new THREE.Mesh(geo, mat); for (const m of list) parent.remove(m); parent.add(mm);
    }
  }
  function setupGLB(gltf) {
    // Paatti as a pei: a dead old woman, small and stooped, corpse-pale, long loose grey hair, a torn
    // and stained white saree, tarnished bangles and the silver kolusu; pale eyes that glow in the dark
    const root = new THREE.Group(), body = gltf.scene;
    body.scale.set(0.8, 0.82, 0.8); root.add(body); root.updateMatrixWorld(true);
    const clips = {}; gltf.animations.forEach(c => clips[c.name] = c);
    let skinned = null; body.traverse(o => { if (o.isSkinnedMesh) skinned = o; });
    if (!skinned || !clips.Idle_Lantern) throw new Error('model incomplete');
    const bone = n => body.getObjectByName(n);
    const wp = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };
    const g = skinned.geometry, pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), v = new THREE.Vector3();
    skinned.updateMatrixWorld(true);
    const headP = wp(bone('head')), neckY = wp(bone('neck_01')).y - 0.02;
    const shoulderX = Math.abs(wp(bone('upperarm_l')).x), elbowX = Math.abs(wp(bone('lowerarm_l')).x);
    const sleeveX = shoulderX + (elbowX - shoulderX) * 0.45;
    const lin = c => c.map(x => Math.pow(x, 2.2)); // vertex colours are linear; these are picked in sRGB
    const SKIN = lin([0.5, 0.52, 0.49]), SAREE = lin([0.6, 0.58, 0.53]), BLOUSE = lin([0.13, 0.11, 0.11]);
    const mottle = (x, y, z) => 0.72 + 0.28 * (0.5 + 0.25 * Math.sin(x * 61 + y * 17) + 0.25 * Math.sin(z * 53 - y * 29 + x * 7)); // bruised, uneven dead skin
    const arr = pos.array, dq = !pos.normalized ? 1 : arr instanceof Int16Array ? 1 / 32767 : arr instanceof Uint16Array ? 1 / 65535 : arr instanceof Int8Array ? 1 / 127 : arr instanceof Uint8Array ? 1 / 255 : 1;
    const hb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 };
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).multiplyScalar(dq).applyMatrix4(skinned.matrixWorld);
      if (v.y > headP.y - 0.03 && Math.abs(v.x) < 0.2) { hb.x0 = Math.min(hb.x0, v.x); hb.x1 = Math.max(hb.x1, v.x); hb.z0 = Math.min(hb.z0, v.z); hb.z1 = Math.max(hb.z1, v.z); hb.y0 = Math.min(hb.y0, v.y); hb.y1 = Math.max(hb.y1, v.y); }
      const ax = Math.abs(v.x);
      const sk = v.y > neckY || ax > sleeveX, c = sk ? SKIN : (ax > shoulderX - 0.02 ? BLOUSE : SAREE);
      const mo = sk ? mottle(v.x, v.y, v.z) * (ax > elbowX + 0.12 ? 0.7 : 1) : 1; // and darker hands
      col[i * 3] = c[0] * mo; col[i * 3 + 1] = c[1] * mo; col[i * 3 + 2] = c[2] * mo;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    skinned.material = new THREE.MeshStandardMaterial({ vertexColors: true, skinning: true, roughness: 0.85, emissive: 0x070a0a });
    skinned.frustumCulled = false; skinned.castShadow = true;
    const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, o));
    const sareeTex = K.makeGhostSareeTex(); sareeTex.wrapS = THREE.RepeatWrapping; sareeTex.repeat.set(3, 1);
    const sareeM = std({ map: sareeTex, color: 0xc4c0b6, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x0a0b0a });
    const palluTex = K.makeGhostSareeTex(); palluTex.wrapS = palluTex.wrapT = THREE.RepeatWrapping;
    const palluM = std({ map: palluTex, color: 0xc4c0b6, roughness: 0.85, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x0a0b0a });
    const gold = std({ color: 0x6e5a2c, metalness: 0.6, roughness: 0.6 }); // tarnished
    const silver = std({ color: 0x9a9c98, metalness: 0.8, roughness: 0.4, emissive: 0x101010 });
    const hairM = std({ map: K.makeGreyHairTex(), color: 0x5e5b56, roughness: 0.9, side: THREE.DoubleSide });
    const hairLongM = std({ map: K.makeGhostHairTex(), color: 0x8e8a83, roughness: 0.9, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x0c0c0b });
    function attachAt(boneName, obj, worldPos) { obj.position.copy(worldPos); root.add(obj); obj.updateMatrixWorld(true); bone(boneName).attach(obj); return obj; }
    // --- saree: ankle length so the kolusu show, gold temple border at the hem
    const pelvisP = wp(bone('pelvis')), h = pelvisP.y;
    const prof = [[0.33, -h + 0.075], [0.315, -h + 0.2], [0.27, -h * 0.55], [0.21, -0.1], [0.175, 0.05], [0.16, 0.16]].map(([r, y]) => new THREE.Vector2(r, y));
    attachAt('pelvis', new THREE.Mesh(new THREE.LatheGeometry(prof, 36), sareeM), pelvisP);
    // front pleats (kosuvam)
    const pleatH = h - 0.12, pleat = new THREE.Mesh(new THREE.PlaneGeometry(0.15, pleatH, 6, 1), sareeM);
    const pp = pleat.geometry.attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, (i % 7) % 2 ? 0.01 : -0.004);
    pleat.geometry.computeVertexNormals();
    pleat.rotation.x = -Math.atan2(0.33 - 0.19, pleatH); // follow the skirt's slope
    attachAt('pelvis', pleat, new THREE.Vector3(0.015, pelvisP.y - 0.06 - pleatH / 2, pelvisP.z + 0.265));
    // pallu: across the chest to the left shoulder, then down the back
    const chestP = wp(bone('spine_03'));
    const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.62), palluM); pf.rotation.set(-0.15, 0, 0.58);
    attachAt('spine_03', pf, new THREE.Vector3(-0.005, chestP.y - 0.06, chestP.z + 0.12));
    const pb = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.72), palluM); pb.rotation.set(0.1, Math.PI, 0.16);
    attachAt('spine_03', pb, new THREE.Vector3(0.05, chestP.y - 0.3, chestP.z - 0.13));
    // --- head
    const rx = (hb.x1 - hb.x0) / 2, ry = (hb.y1 - hb.y0) / 2, rz = (hb.z1 - hb.z0) / 2;
    const hc = new THREE.Vector3((hb.x0 + hb.x1) / 2, hb.y0 + ry, (hb.z0 + hb.z1) / 2);
    const headG = new THREE.Group(); attachAt('head', headG, hc);
    const face = new THREE.Group();
    // the face carries a faint glow of its own, so in the dark it shows before the rest of her
    const faceTex = K.makePaattiFace(false), screamTex = K.makePaattiFace(true), faceM = std({ map: faceTex, emissiveMap: faceTex, emissive: 0x2a2c2a, roughness: 0.8 });
    const fm = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 22, Math.PI / 2 - 1.3, 2.6, Math.PI * 0.16, Math.PI * 0.74), faceM);
    fm.scale.set(rx + 0.004, ry + 0.003, rz + 0.004); face.add(fm);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM);
    cap.scale.set(rx + 0.012, ry * 0.92 + 0.012, rz + 0.016); cap.position.set(0, ry * 0.1, -rz * 0.06); cap.rotation.x = -0.62; face.add(cap);
    // long loose hair, never tied: cards hanging from the scalp down past the waist, two locks over the face
    const strands = [], hr = (Math.sin(7.3) * 0.5 + 0.5);
    const lock = (a, y, w, len, tilt) => {
      const piv = new THREE.Group(); piv.rotation.order = 'YXZ';
      piv.position.set(Math.sin(a) * (rx + 0.006), y, Math.cos(a) * (rz + 0.006)); piv.rotation.y = a;
      const st = new THREE.Mesh(new THREE.PlaneGeometry(w, len, 1, 4), hairLongM); st.position.y = -len / 2;
      const sp = st.geometry.attributes.position; for (let i = 0; i < sp.count; i++) { const k = 0.5 - sp.getY(i) / len; sp.setZ(i, -k * k * 0.05); sp.setX(i, sp.getX(i) * (1 + k * 0.5)); } // curl in a little and spread at the ends
      st.geometry.computeVertexNormals();
      piv.add(st); face.add(piv); piv.rotation.x = tilt; piv.userData = { rx: tilt, a, ca: Math.cos(a) }; strands.push(piv);
    };
    for (let i = 0; i < 11; i++) { const a = Math.PI * (0.42 + i * 0.116); lock(a, ry * (0.42 + 0.08 * Math.sin(i * 2.1)), 0.075 + 0.02 * Math.sin(i * 3.7), 0.56 + 0.16 * Math.abs(Math.sin(i * 1.9 + hr)), -0.18 - 0.22 * Math.max(0, -Math.cos(a))); } // the back locks fall clear of her bent back
    for (const a of [-1.05, 1.0, -0.8]) lock(a, ry * 0.55, 0.055, a === -0.8 ? 0.42 : 0.5, -0.06); // locks framing the face, one straying across
    for (const sgn of [-1, 1]) { // tarnished thodu earrings
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), gold); e.position.set(sgn * (rx + 0.004), -ry * 0.12, -0.005); face.add(e);
    }
    // eyes that catch the light: two small cold glints, red when she hunts
    const eyeTex = W._eyeGlow || (W._eyeGlow = K.makeGlowTex('rgba(240,246,236,1)', 'rgba(170,200,205,0.35)'));
    const eyes = [-1, 1].map(s => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75 }));
      sp.position.set(s * 0.337 * rx, 0.195 * ry, 0.921 * rz).multiplyScalar(1.04); sp.scale.set(0.034, 0.034, 1); face.add(sp); return sp;
    });
    attachAt('head', face, hc);
    const faceFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bone('head').getWorldQuaternion(new THREE.Quaternion()).invert());
    // --- gold bangles at both wrists
    for (const side of ['l', 'r']) {
      const a = wp(bone('lowerarm_' + side)), b = wp(bone('hand_' + side)), dir = b.clone().sub(a).normalize();
      for (let k = 0; k < 3; k++) {
        const bg = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 6, 16), gold);
        bg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        attachAt('lowerarm_' + side, bg, b.clone().addScaledVector(dir, -0.035 - k * 0.012));
      }
    }
    // --- silver kolusu with little bells
    for (const side of ['l', 'r']) {
      const k = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.007, 6, 18), silver); ring.rotation.x = Math.PI / 2; k.add(ring);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const bl = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 5), silver); bl.position.set(Math.cos(a) * 0.05, -0.01, Math.sin(a) * 0.05); k.add(bl); }
      attachAt('foot_' + side, k, wp(bone('foot_' + side)).add(new THREE.Vector3(0, 0.03, 0)));
    }
    // --- the brass lamp, placed in the hand while posed with Idle_Lantern
    const mixer = new THREE.AnimationMixer(body);
    const idleA = mixer.clipAction(clips.Idle_Lantern); idleA.play(); mixer.update(0.01); root.updateMatrixWorld(true);
    const handP = wp(bone('hand_r'));
    const lamp = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: 0xc19032, metalness: 0.55, roughness: 0.32, emissive: 0x2a1a04 });
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), brass); lamp.add(bowl);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), brass); chain.position.y = 0.07; lamp.add(chain);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: W._flame || (W._flame = K.makeFlameTex()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.scale.set(0.06, 0.12, 1); flame.position.set(0.04, 0.05, 0); lamp.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.makeGlowTex('rgba(255,200,120,0.6)', 'rgba(255,120,30,0.18)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.set(0.7, 0.7, 1); halo.position.set(0.04, 0.05, 0); lamp.add(halo);
    const light = new THREE.PointLight(0xff9437, 1.6, 6.5, 2); light.position.set(0.04, 0.12, 0); lamp.add(light);
    attachAt('hand_r', lamp, handP.clone().add(new THREE.Vector3(0, -0.13, 0.02)));
    idleA.stop();
    // --- animation set
    const A = {
      idle: compose('idleLamp', clips.Idle_A, [[clips.Idle_Lantern, RARM]]),
      walk: compose('walkLamp', clips.Walk_Formal, [[clips.Idle_Lantern, RARM]]),
      chase: compose('chaseLamp', clips.Jog, [[clips.Idle_Lantern, RARM], [clips.Zombie_Walk, LARM]]),
      search: compose('searchLamp', clips.Zombie_Idle, [[clips.Idle_Lantern, RARM]]),
      grab: clips.Zombie_Scratch,
      fall: compose('fall', clips.Death_D, []),
      getup: compose('getup', clips.LayToIdle, [])
    };
    const actions = {}; for (const k in A) actions[k] = mixer.clipAction(A[k]);
    for (const k of ['grab', 'fall', 'getup']) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
    actions.idle.play();
    root.traverse(o => { if (o.isMesh && o !== skinned) o.castShadow = false; });
    { const parents = new Set(); root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && o.parent) parents.add(o.parent); }); parents.forEach(mergeChildren); }
    const ghostParts = []; { const inLamp = o => { for (let p = o; p; p = p.parent) if (p === lamp) return true; return false; }; root.traverse(o => { if ((o.isMesh || o.isSprite) && !inLamp(o)) ghostParts.push(o); }); }
    root.userData = { glb: true, pei: true, faceFwd, faceM, faceTex, screamTex, eyes, ghostParts, flk: 6 + Math.random() * 8, flkOn: 0, tw: 3 + Math.random() * 4, twA: 0, twT: 0, twHold: 0, mixer, actions, cur: 'idle', light, flame, halo, strands, head: bone('head'), headG, bones: { spine_01: bone('spine_01'), spine_02: bone('spine_02'), spine_03: bone('spine_03'), neck_01: bone('neck_01'), head: bone('head') } };
    root.userData.rest = {}; for (const k in root.userData.bones) root.userData.rest[k] = root.userData.bones[k].quaternion.clone();
    return root;
  }
  /* ---------- the player's own Paatti model (personal build): scaled, turned to face +Z, clips mapped ---------- */
  function setupGranny(gltf) {
    const root = new THREE.Group(), wrap = new THREE.Group(), body = gltf.scene;
    wrap.add(body); root.add(wrap); wrap.rotation.y = -Math.PI / 2; // the model faces +X
    // glTF skins ignore the skinned node's own transform; three r128 applies it, which crumples this export.
    // Bind with an identity matrix and keep the skinned mesh's world matrix at identity: only the bones place it.
    body.traverse(o => {
      if (!o.isSkinnedMesh) return;
      o.bind(o.skeleton, new THREE.Matrix4()); o.bindMode = 'detached';
      o.updateMatrixWorld = function () { this.matrixWorld.identity(); this.matrixWorldNeedsUpdate = false; };
    });
    root.updateMatrixWorld(true);
    const bone = n => body.getObjectByName(n), wp = o => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };
    const head = bone('Bip01_Head_020'), toeL = bone('Bip01_L_Toe0_06'), toeR = bone('Bip01_R_Toe0_012'), pelvis = bone('Bip01_Pelvis_01');
    if (!head || !toeL || !pelvis) throw new Error('model incomplete');
    const sc = 1.42 / (wp(head).y - Math.min(wp(toeL).y, wp(toeR).y));
    wrap.scale.setScalar(sc); root.updateMatrixWorld(true);
    const pv = wp(pelvis), fy = Math.min(wp(toeL).y, wp(toeR).y) - 0.04 * sc;
    wrap.position.set(-pv.x, -fy, -pv.z); root.updateMatrixWorld(true);
    body.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map) m.map.anisotropy = 4; if (m.transparent) { m.alphaTest = 0.35; m.depthWrite = true; } }); } });
    const clips = {}; gltf.animations.forEach(c => clips[c.name] = c);
    const mixer = new THREE.AnimationMixer(body);
    const A = {
      idle: clips.idle || clips.idle_1, walk: clips.Walk, chase: (clips.Walk || clips.idle).clone(),
      search: clips.Look || clips.idle, bed: clips.lookBed || clips.Look, grab: clips.Hit || clips.idle,
      fall: clips.arrowHit || clips.Hit, getup: (clips.idle_1 || clips.idle).clone()
    };
    A.chase.name = 'chase'; A.getup.name = 'getup';
    const actions = {}; for (const k in A) if (A[k]) actions[k] = mixer.clipAction(A[k]);
    for (const k of ['grab', 'fall']) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
    actions.idle.play();
    // a faint warm glow so she can be seen coming in the dark (the house's own lamps are baked)
    const light = new THREE.PointLight(0xff8a4a, 1.0, 5.5, 2); light.position.set(0, 1.25, 0.35); root.add(light);
    root.rotation.order = 'YXZ';
    root.userData = { glb: true, granny: true, mixer, actions, cur: 'idle', light, strands: [], head, wrap, tilt: 0 };
    return root;
  }
  /* ---------- Paatti from a real scanned human (Microsoft Rocketbox avatar, MIT), repainted as a dead old woman ---------- */
  function setupRocket(gltf, hairSrc) {
    const root = new THREE.Group(), body = gltf.scene, S = 0.9; // a small old woman, about 1.5 m
    body.scale.setScalar(S); root.add(body); root.rotation.order = 'YXZ'; root.updateMatrixWorld(true);
    const clips = {}; gltf.animations.forEach(c => clips[c.name] = c);
    const skins = []; body.traverse(o => { if (o.isSkinnedMesh) skins.push(o); });
    const bone = n => body.getObjectByName('Bip01_' + n);
    if (!skins.length || !clips.idle || !clips.walk || !bone('Head') || !bone('R_Hand')) throw new Error('model incomplete');
    const wp = o => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v; };
    // walk in place: the game moves her, so take the forward travel out of the clips (and measure it for the step rate)
    const stride = {};
    for (const c of Object.values(clips)) for (const tr of c.tracks) {
      if (!/^Bip01\.position$/.test(tr.name)) continue;
      const v = tr.values, n = v.length / 3; stride[c.name] = Math.hypot(v[(n - 1) * 3] - v[0], v[(n - 1) * 3 + 2] - v[2]) * S / c.duration;
      for (let i = 0; i < n; i++) { v[i * 3] = v[0]; v[i * 3 + 2] = v[2]; }
    }
    // materials: keep the scanned detail, add a faint glow of her own so the face shows first in the dark
    const texList = [];
    for (const sm of skins) {
      sm.frustumCulled = false; sm.castShadow = false;
      const m = sm.material; for (const k of ['map', 'normalMap']) if (m[k]) { m[k].anisotropy = 4; texList.push(m[k]); }
      if (/head/.test(m.name)) { m.emissiveMap = m.map; m.emissive.setHex(0x2a2c2a); m.roughness = 0.7; m.normalScale.set(1.2, 1.2); }
      else if (/body/.test(m.name)) { m.emissiveMap = m.map; m.emissive.setHex(0x121412); m.roughness = 0.85; }
      else { m.alphaTest = 0.45; m.transparent = false; m.depthWrite = true; m.emissive.setHex(0x101010); m.side = THREE.DoubleSide; }
    }
    const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, o));
    function attachAt(b, obj, worldPos) { obj.position.copy(worldPos); root.add(obj); obj.updateMatrixWorld(true); b.attach(obj); return obj; }
    // the inside of the mouth (tongue, throat) is dark, whatever texture it borrows
    for (const sm of skins) {
      const sk = sm.skeleton, ji = sm.geometry.attributes.skinIndex, jw = sm.geometry.attributes.skinWeight; if (!sk || !ji) continue;
      const inner = new Set(sk.bones.map((b, i) => /MTongue/.test(b.name) ? i : -1).filter(i => i >= 0)); if (!inner.size) continue;
      const n = ji.count, col = new Float32Array(n * 3).fill(1); let hit = 0;
      const gi = [ji.getX.bind(ji), ji.getY.bind(ji), ji.getZ.bind(ji), ji.getW.bind(ji)], gw = [jw.getX.bind(jw), jw.getY.bind(jw), jw.getZ.bind(jw), jw.getW.bind(jw)];
      for (let i = 0; i < n; i++) { let w = 0; for (let k = 0; k < 4; k++) if (inner.has(gi[k](i))) w += gw[k](i); if (w > 0.4) { col[i * 3] = 0.16; col[i * 3 + 1] = 0.1; col[i * 3 + 2] = 0.1; hit++; } }
      if (hit) { sm.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); sm.material.vertexColors = true; }
    }
    // skinned positions in the bind pose, to find the head
    const pts = []; { const v = new THREE.Vector3(); for (const sm of skins) { if (!/head/.test(sm.material.name)) continue; const pa = sm.geometry.attributes.position; sm.updateMatrixWorld(true); for (let i = 0; i < pa.count; i += 2) { sm.boneTransform(i, v); v.applyMatrix4(sm.matrixWorld); pts.push([v.x, v.y, v.z]); } } }
    const headB = bone('Head'), headP = wp(headB);
    const hb = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
    for (const [x, y, z] of pts) if (y > headP.y - 0.02) { hb.x0 = Math.min(hb.x0, x); hb.x1 = Math.max(hb.x1, x); hb.y0 = Math.min(hb.y0, y); hb.y1 = Math.max(hb.y1, y); hb.z0 = Math.min(hb.z0, z); hb.z1 = Math.max(hb.z1, z); }
    // --- long grey hair falling loose from the crown and down the back, over the old bun (her own dress stays, repainted)
    const rx = (hb.x1 - hb.x0) / 2, ry = (hb.y1 - hb.y0) / 2, rz = (hb.z1 - hb.z0) / 2;
    const hc = new THREE.Vector3((hb.x0 + hb.x1) / 2, hb.y0 + ry, (hb.z0 + hb.z1) / 2);
    const face = new THREE.Group(); attachAt(headB, face, hc);
    const faceFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(headB.getWorldQuaternion(new THREE.Quaternion()).invert());
    const hairLongM = new THREE.MeshLambertMaterial({ map: K.makeGhostHairTex(), color: 0x86827b, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x0c0c0b }); // cheap: lit per vertex
    const strands = [];
    const lock = (a, y, w, len, tilt, rr = 1) => {
      const piv = new THREE.Group(); piv.rotation.order = 'YXZ';
      piv.position.set(Math.sin(a) * (rx * rr + 0.008), y, Math.cos(a) * (rz * rr + 0.008) - rz * 0.12); piv.rotation.y = a;
      const st = new THREE.Mesh(new THREE.PlaneGeometry(w, len, 1, 4), hairLongM); st.position.y = -len / 2;
      const sp = st.geometry.attributes.position; for (let i = 0; i < sp.count; i++) { const k = 0.5 - sp.getY(i) / len; sp.setZ(i, -k * k * 0.05); sp.setX(i, sp.getX(i) * (1 + k * 0.5)); }
      st.geometry.computeVertexNormals(); piv.add(st); face.add(piv); piv.rotation.x = tilt; piv.userData = { rx: tilt, a, ca: Math.cos(a) }; strands.push(piv);
    };
    if (hairSrc) {
      // real long black hair (a scanned-quality hair model) instead of painted cards; her own wisps and lashes go
      for (const sm of skins) if (/opacity/.test(sm.material.name)) sm.visible = false;
      const heads = skins.filter(sm => /head/.test(sm.material.name)), w0 = hb.x1 - hb.x0;
      K.tuckBehind(heads[0], hb.z1 - w0 * 1.2, headP.y - 0.02);              // her old bun goes under the hair
      const skull = new THREE.Box3(); for (const q of K.headPoints(heads)) if (q.y > headP.y + 0.035) skull.expandByPoint(q);
      const hairG = K.fitHair(hairSrc, root, headB, skull, { fit: 1.08, depth: 0.95, top: 0.006, brow: 0.035, emissive: 0x0b0b0b });
      for (const mt of hairG.userData.mats) for (const k of ['map', 'normalMap']) if (mt[k] && !texList.includes(mt[k])) texList.push(mt[k]);
    } else {
      for (let i = 0; i < 11; i++) { const a = Math.PI * (0.44 + i * 0.112); lock(a, ry * (0.5 + 0.08 * Math.sin(i * 2.1)), 0.08 + 0.02 * Math.sin(i * 3.7), 0.62 + 0.16 * Math.abs(Math.sin(i * 1.9)), -0.2 - 0.25 * Math.max(0, -Math.cos(a)), 1.04); }
      for (const a of [-1.15, 1.1, -0.85]) lock(a, ry * 0.62, 0.05, a === -0.85 ? 0.42 : 0.52, -0.08);
    }
    // eyes that catch the light, set in front of the real eyeballs
    const eyeTex = W._eyeGlow || (W._eyeGlow = K.makeGlowTex('rgba(240,246,236,1)', 'rgba(170,200,205,0.35)'));
    const fwdW = new THREE.Vector3(0, 0, 1);
    const eyes = ['LEye', 'REye'].map(n => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75, toneMapped: false }));
      sp.scale.set(0.03, 0.03, 1); attachAt(headB, sp, wp(bone(n)).addScaledVector(fwdW, 0.02 * S)); return sp;
    });
    // --- tarnished bangles, thodu, silver kolusu
    const gold = std({ color: 0x6e5a2c, metalness: 0.6, roughness: 0.6 });
    const silver = std({ color: 0x9a9c98, metalness: 0.8, roughness: 0.4, emissive: 0x101010 });
    for (const side of ['L', 'R']) {
      const a = wp(bone(side + '_Forearm')), b = wp(bone(side + '_Hand')), dir = b.clone().sub(a).normalize();
      for (let k = 0; k < 3; k++) { const bg = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.004, 6, 16), gold); bg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); attachAt(bone(side + '_Forearm'), bg, b.clone().addScaledVector(dir, -0.03 - k * 0.011)); }
      const k = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 18), silver); ring.rotation.x = Math.PI / 2; k.add(ring);
      for (let i = 0; i < 9; i++) { const an = i / 9 * Math.PI * 2; const bl = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5), silver); bl.position.set(Math.cos(an) * 0.047, -0.01, Math.sin(an) * 0.047); k.add(bl); }
      attachAt(bone(side + '_Foot'), k, wp(bone(side + '_Foot')).add(new THREE.Vector3(0, 0.02, -0.01)));
    }
    // --- animation set: her own clips, a clip-less pose for the grab, the fall is the tilt
    const mixer = new THREE.AnimationMixer(body);
    const one = (c, name) => { const x = c.clone(); x.name = name; return x; };
    const A = { idle: clips.idle, walk: clips.walk, chase: clips.walkFast || clips.walk, search: clips.listen || clips.idle, bed: clips.listen || clips.idle, grab: one(clips.idle, 'grab'), fall: one(clips.idle, 'fall'), getup: one(clips.idle, 'getup') };
    const actions = {}; for (const k in A) actions[k] = mixer.clipAction(A[k]);
    for (const k of ['grab', 'fall']) { actions[k].setLoop(THREE.LoopOnce); actions[k].clampWhenFinished = true; }
    actions.idle.play();
    const bones = { spine_01: bone('Spine'), spine_02: bone('Spine1'), spine_03: bone('Spine2'), neck_01: bone('Neck'), head: headB, jaw: bone('MJaw'),
      ua_l: bone('L_UpperArm'), fa_l: bone('L_Forearm'), ha_l: bone('L_Hand'), ua_r: bone('R_UpperArm'), fa_r: bone('R_Forearm'), ha_r: bone('R_Hand') };
    const rest = {}; for (const k in bones) if (bones[k]) rest[k] = bones[k].quaternion.clone();
    // --- an old hurricane lantern, gripped by its wire handle; it hangs from her fist and swings as she walks
    const fingers = { r: [], l: [] };
    for (const sd of ['R', 'L']) for (let f = 0; f <= 4; f++) for (const seg of ['', '1', '2']) { const fb = bone(sd + '_Finger' + f + seg); if (fb) fingers[sd.toLowerCase()].push({ b: fb, thumb: f === 0, seg: seg ? +seg : 0 }); }
    const frest = new Map(); for (const sd of ['r', 'l']) for (const f of fingers[sd]) frest.set(f.b, f.b.quaternion.clone());
    root.userData = { bones, rest, frest, fingers, rocket: true, raiseK: 0, curlSign: CURL }; const prevM = E.model; E.model = root; armPose(root.userData, 0, 0, 1); grip(root.userData, 1, 0); E.model = prevM; root.updateMatrixWorld(true);
    const L = makeLantern(), lamp = L.group, flame = L.flame, halo = L.halo, light = L.light;
    const hr = bone('R_Hand'), f1 = wp(bone('R_Finger1') || hr), f4 = wp(bone('R_Finger4') || hr), f2 = wp(bone('R_Finger2') || hr);
    const gripP = f1.clone().add(f4).multiplyScalar(0.5).lerp(f2, 0.35); // inside the curled fingers
    attachAt(hr, lamp, gripP);
    for (const [fb, q] of frest) fb.quaternion.copy(q);
    for (const k in bones) if (bones[k]) bones[k].quaternion.copy(rest[k]);
    root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) o.castShadow = false; });
    { const parents = new Set(); root.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && o.parent) parents.add(o.parent); }); parents.forEach(mergeChildren); }
    const ghostParts = []; { const inLamp = o => { for (let p = o; p; p = p.parent) if (p === lamp) return true; return false; }; root.traverse(o => { if ((o.isMesh || o.isSprite) && !inLamp(o)) ghostParts.push(o); }); }
    root.userData = { glb: true, pei: true, rocket: true, lie: true, faceFwd, texList, eyes, ghostParts, lamp, lantern: L, fingers, frest, curlSign: CURL, raiseK: 0, stride: { walk: stride.walk || 1.0, chase: stride.walkFast || 1.35 },
      flk: 6 + Math.random() * 8, flkOn: 0, tw: 3 + Math.random() * 4, twA: 0, twT: 0, twHold: 0, armK: 0, grabK: 0, jawA: 0,
      mixer, actions, cur: 'idle', light, flame, halo, strands, head: headB, headG: face, bones, rest, tilt: 0 };
    return root;
  }
  // an old tin hurricane lantern: fuel tank, glass globe in a wire guard, side tubes, chimney cap, wire bail.
  // Its origin is the top of the bail, where the hand holds it.
  function makeLantern() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const tin = new THREE.MeshStandardMaterial({ color: 0x5a2a1e, metalness: 0.45, roughness: 0.62, emissive: 0x120604 }); // old red paint gone dark and rusty
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4744, metalness: 0.7, roughness: 0.5 });
    const H = 0.27, by = -0.075 - H; // the bail is 7.5 cm tall; the lantern hangs below it
    const lathe = (pts, m, seg = 18) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
    const tank = lathe([[0.0, 0], [0.06, 0.0], [0.072, 0.012], [0.074, 0.03], [0.066, 0.05], [0.042, 0.058], [0.04, 0.062]], tin); tank.position.y = by; body.add(tank);
    // glass globe: warm, faintly lit from inside, with a sooty top
    const glass = new THREE.MeshBasicMaterial({ color: 0x8a5a2a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const globe = lathe([[0.03, 0], [0.05, 0.02], [0.058, 0.055], [0.054, 0.09], [0.036, 0.115], [0.03, 0.12]], glass, 16); globe.position.y = by + 0.062; body.add(globe);
    const soot = new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    const sootC = lathe([[0.046, 0], [0.04, 0.02], [0.031, 0.034]], soot, 16); sootC.position.y = by + 0.148; body.add(sootC);
    // wire guard: four bars and two rings
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.12, 4), steel); bar.position.set(Math.cos(a) * 0.063, by + 0.122, Math.sin(a) * 0.063); bar.rotation.z = 0; body.add(bar); }
    for (const yy of [0.085, 0.16]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(yy > 0.1 ? 0.052 : 0.063, 0.0025, 4, 20), steel); ring.rotation.x = Math.PI / 2; ring.position.y = by + yy; body.add(ring); }
    // the two side tubes that make it a hurricane lantern
    for (const sx of [-1, 1]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.19, 6), tin); tube.position.set(sx * 0.08, by + 0.13, 0); body.add(tube);
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.035, 6), tin); elbow.rotation.z = Math.PI / 2; elbow.position.set(sx * 0.066, by + 0.226, 0); body.add(elbow);
    }
    const cap = lathe([[0.05, 0], [0.056, 0.008], [0.05, 0.02], [0.03, 0.04], [0.018, 0.05], [0.0, 0.052]], tin); cap.position.y = by + 0.18; body.add(cap);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.02, 8), steel); vent.position.y = by + 0.24; body.add(vent);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.014, 8), steel); knob.rotation.x = Math.PI / 2; knob.position.set(0, by + 0.05, 0.072); body.add(knob);
    // wire bail from the tube tops up to the fist
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.0025, 4, 20, Math.PI), steel); bail.position.y = by + H - 0.05; bail.scale.y = 1.0; body.add(bail);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 })); grip.rotation.z = Math.PI / 2; grip.position.y = by + H + 0.025; body.add(grip);
    // the flame and its light
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: W._flame || (W._flame = K.makeFlameTex()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.scale.set(0.035, 0.07, 1); flame.position.set(0, by + 0.1, 0); body.add(flame);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.makeGlowTex('rgba(255,200,120,0.55)', 'rgba(255,120,30,0.16)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.set(0.6, 0.6, 1); halo.position.set(0, by + 0.1, 0); body.add(halo);
    const light = new THREE.PointLight(0xff9437, 1.6, 6.5, 2); light.position.set(0, by + 0.11, 0); body.add(light);
    body.position.y = 0.0;
    return { group: g, body, flame, halo, light, glass };
  }
  const CURL = 1; // which way round the across-palm axis closes the hand
  // the fist around the bail: fingers curl into the palm
  const _fa = new THREE.Vector3(), _fb = new THREE.Vector3();
  function grip(u, kr, kl) {
    if (!u.fingers) return;
    for (const [sd, k] of [['r', kr], ['l', kl]]) {
      if (k <= 0.01) continue;
      const list = u.fingers[sd]; if (!list.length) continue;
      const hand = u.bones['ha_' + sd]; if (!hand) continue;
      // across-palm axis: index knuckle to little-finger knuckle
      const idx = list.find(f => !f.thumb && f.seg === 0 && /Finger1$/.test(f.b.name)), pnk = list.find(f => !f.thumb && f.seg === 0 && /Finger4$/.test(f.b.name));
      if (!idx || !pnk) continue;
      idx.b.getWorldPosition(_fa); pnk.b.getWorldPosition(_fb); _ax.copy(_fa).sub(_fb).normalize(); if (sd === 'l') _ax.negate();
      for (const f of list) { if (f.thumb) { bend(f.b, (f.seg ? 0.35 : 0.2) * k * (sd === 'l' ? -1 : 1)); continue; } bend(f.b, (f.seg === 0 ? 1.1 : f.seg === 1 ? 1.25 : 0.8) * k * u.curlSign); }
    }
  }
  // arms: one carries the lamp out in front, the other reaches for you when she runs; both when she has you
  const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _mq = new THREE.Quaternion();
  function aimLimb(b, c, dirModel, k) {
    if (!b || !c || k <= 0) return;
    b.getWorldPosition(_hp); c.getWorldPosition(_w); _f.copy(_w).sub(_hp).normalize();
    _d1.copy(dirModel).normalize().applyQuaternion(_mq);
    _rq.setFromUnitVectors(_f, _d1); _iq.identity(); _rq.slerp(_iq, 1 - k);
    b.parent.getWorldQuaternion(_pq); _bq.copy(_pq).invert().multiply(_rq).multiply(_pq); b.quaternion.premultiply(_bq);
  }
  const ARM = {
    lampU: new THREE.Vector3(-0.16, -0.97, 0.12), lampF: new THREE.Vector3(-0.06, -0.62, 0.78), lampH: new THREE.Vector3(-0.02, -0.85, 0.5),   // carried low at her side
    raiseU: new THREE.Vector3(-0.2, -0.3, 0.93), raiseF: new THREE.Vector3(0.02, 0.32, 0.95), raiseH: new THREE.Vector3(0.0, 0.2, 1),            // held up to look
    _u: new THREE.Vector3(), _f: new THREE.Vector3(), _h: new THREE.Vector3(),
    reachU: new THREE.Vector3(0.22, 0.12, 1), reachF: new THREE.Vector3(0.08, 0.08, 1),
    grabUL: new THREE.Vector3(0.3, 0.3, 1), grabFL: new THREE.Vector3(-0.1, 0.25, 1), grabUR: new THREE.Vector3(-0.3, 0.3, 1), grabFR: new THREE.Vector3(0.1, 0.25, 1)
  };
  function armPose(u, reach, grab, lampK) {
    const b = u.bones; E.model.updateMatrixWorld(true); E.model.getWorldQuaternion(_mq);
    if (grab > 0.01) { aimLimb(b.ua_l, b.fa_l, ARM.grabUL, grab); aimLimb(b.fa_l, b.ha_l, ARM.grabFL, grab); aimLimb(b.ua_r, b.fa_r, ARM.grabUR, grab); aimLimb(b.fa_r, b.ha_r, ARM.grabFR, grab); }
    if (lampK * (1 - grab) > 0.01) {
      const r = u.raiseK || 0, k = lampK * (1 - grab), f2 = u.fingers && u.fingers.r.find(f => /Finger2$/.test(f.b.name));
      ARM._u.lerpVectors(ARM.lampU, ARM.raiseU, r); ARM._f.lerpVectors(ARM.lampF, ARM.raiseF, r); ARM._h.lerpVectors(ARM.lampH, ARM.raiseH, r);
      aimLimb(b.ua_r, b.fa_r, ARM._u, k); aimLimb(b.fa_r, b.ha_r, ARM._f, k); if (f2) aimLimb(b.ha_r, f2.b, ARM._h, k);
    }
    if (reach * (1 - grab) > 0.01) { aimLimb(b.ua_l, b.fa_l, ARM.reachU, reach * (1 - grab)); aimLimb(b.fa_l, b.ha_l, ARM.reachF, reach * (1 - grab)); }
  }
  const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _ax = new THREE.Vector3(), _eu = new THREE.Euler();
  function bend(b, ang) { b.parent.getWorldQuaternion(_pq); _rq.setFromAxisAngle(_ax, ang); _bq.copy(_pq).invert().multiply(_rq).multiply(_pq); b.quaternion.premultiply(_bq); }
  // turn a bone (by a share of the needed angle) so the face points at a world position
  const _f = new THREE.Vector3(), _w = new THREE.Vector3(), _hp = new THREE.Vector3(), _aq = new THREE.Quaternion(), _iq = new THREE.Quaternion();
  function aimBone(b, headB, fwdLocal, target, share) {
    headB.getWorldQuaternion(_aq); _f.copy(fwdLocal).applyQuaternion(_aq);
    headB.getWorldPosition(_hp); _w.copy(target).sub(_hp).normalize();
    _rq.setFromUnitVectors(_f, _w); _iq.identity(); _rq.slerp(_iq, 1 - share); // world-space turn, scaled
    b.parent.getWorldQuaternion(_pq); _bq.copy(_pq).invert().multiply(_rq).multiply(_pq); b.quaternion.premultiply(_bq);
  }
  E.faceTo = function (target, k = 1) { const u = E.model.userData; if (!u.faceFwd) return; E.model.updateMatrixWorld(true); aimBone(u.bones.neck_01, u.bones.head, u.faceFwd, target, 0.45 * k); aimBone(u.bones.head, u.bones.head, u.faceFwd, target, k); };
  function unstoop(u) { if (u.rest) for (const k in u.rest) u.bones[k].quaternion.copy(u.rest[k]); if (u.frest) for (const [fb, q] of u.frest) fb.quaternion.copy(q); }
  function stoop(amount) {
    const u = E.model.userData; if (!u.glb || !u.bones) return;
    E.model.updateMatrixWorld(true); E.model.getWorldQuaternion(_pq); _ax.set(1, 0, 0).applyQuaternion(_pq);
    bend(u.bones.spine_01, 0.12 * amount); bend(u.bones.spine_02, 0.2 * amount); bend(u.bones.spine_03, 0.1 * amount);
    bend(u.bones.neck_01, -0.3 * amount); bend(u.bones.head, -0.3 * amount);
  }
  // pei behaviour on top of the clips: head cocked and twitching, hair drifting, a body that flickers out
  function setFace(u, tex) { if (u.faceM && u.faceM.map !== tex) { u.faceM.map = tex; u.faceM.emissiveMap = tex; } }
  function ghostVis(u, on) { if (u.ghostParts) for (const o of u.ghostParts) o.visible = on; }
  function peiTick(dt, chase, idle, scare) {
    const u = E.model.userData; if (!u.pei) return;
    const t = E.t;
    // twitch: the head snaps sideways, holds, and eases back; more often while she hunts
    u.tw -= dt;
    if (u.tw <= 0 && u.twHold <= 0) { u.twT = (Math.random() < 0.5 ? -1 : 1) * (0.32 + Math.random() * 0.3); u.twHold = 0.25 + Math.random() * 0.35; u.tw = chase ? 1.2 + Math.random() * 2 : 3 + Math.random() * 6; }
    if (u.twHold > 0) { u.twHold -= dt; if (u.twHold <= 0) u.twT = 0; }
    u.twA += (u.twT - u.twA) * Math.min(1, dt * (u.twT ? 28 : 5));
    const jit = u.twHold > 0 ? (Math.random() - 0.5) * 0.06 : 0;
    E.model.getWorldQuaternion(_pq);
    _ax.set(0, 0, 1).applyQuaternion(_pq); bend(u.bones.head, 0.2 + u.twA + jit);     // cocked to one side
    _ax.set(0, 1, 0); bend(u.bones.neck_01, Math.sin(t * 0.43) * 0.18 * (chase ? 0.3 : 1)); // slow, searching turn
    // hair drifts as if underwater; streams back when she runs
    // (hung from the model's frame, not the head's, so a bowed head does not throw it over her face)
    if (u.strands.length) {
      const par = u.strands[0].parent; par.updateMatrixWorld(true); par.getWorldQuaternion(_bq).invert(); E.model.getWorldQuaternion(_pq);
      u.strands.forEach((s, i) => { const d = s.userData; _eu.set((d.rx || 0) + Math.sin(t * 1.3 + i * 1.7) * 0.05 + (chase && !scare ? 0.45 * d.ca : 0), d.a, Math.sin(t * 0.9 + i * 2.3) * 0.07, 'YXZ'); s.quaternion.setFromEuler(_eu); if (!scare) s.quaternion.premultiply(_pq).premultiply(_bq); });
    }
    if (u.rocket) {
      u.armK += ((chase && !scare ? 1 : 0) - u.armK) * Math.min(1, dt * 4); u.grabK += ((scare ? 1 : 0) - u.grabK) * Math.min(1, dt * 8);
      u.raiseK += ((idle && !chase && !scare ? 1 : 0) - u.raiseK) * Math.min(1, dt * 1.6); // stops, lifts the lantern and looks
      armPose(u, u.armK, u.grabK, 1); grip(u, 1, Math.max(u.armK * 0.55, u.grabK * 0.7)); // a fist on the lantern; clawed fingers when she reaches
      // the jaw hangs a little open; it drops wide when she screams
      const jw = scare ? 0.42 + Math.sin(t * 40) * 0.03 : chase ? 0.16 : 0.05; u.jawA += (jw - u.jawA) * Math.min(1, dt * 10);
      if (u.bones.jaw) { u.bones.head.getWorldQuaternion(_aq); _f.copy(u.faceFwd).applyQuaternion(_aq); _ax.set(0, 1, 0).cross(_f).normalize(); bend(u.bones.jaw, u.jawA); }
    }
    // eyes: cold and dim, red and bright in the chase
    for (const e of u.eyes) { e.material.color.setHex(chase ? 0xff3022 : 0xdfe8e4); e.material.opacity = chase ? 0.95 : 0.55 + Math.sin(t * 0.7) * 0.15; const k = chase ? 0.05 : 0.034; e.scale.set(k, k, 1); }
    // flicker: now and then her body stutters out of sight for a few frames (the lamp stays lit)
    if (!chase) {
      u.flk -= dt;
      if (u.flk <= 0) { u.flkOn = 0.32; u.flk = (idle ? 5 : 8) + Math.random() * 10; }
    }
    if (u.flkOn > 0) { u.flkOn -= dt; const k = u.flkOn; ghostVis(u, !(k > 0.24 || (k > 0.1 && k < 0.17)) || chase); if (u.flkOn <= 0) ghostVis(u, true); }
    if (u.lamp) { // the lantern hangs from the fist and swings with her steps
      const lp = u.lamp, a = u.actions[u.cur], ph = a ? a.time / a.getClip().duration * Math.PI * 4 : 0;
      const amp = idle ? 0.03 : chase ? 0.32 : 0.16;
      _eu.set(Math.sin(ph) * amp + Math.sin(t * 1.7) * 0.03, 0, Math.cos(ph * 0.5) * amp * 0.35, 'XYZ'); _rq.setFromEuler(_eu);
      lp.parent.updateMatrixWorld(true); lp.parent.getWorldQuaternion(_bq).invert(); E.model.getWorldQuaternion(_pq); lp.quaternion.copy(_bq.multiply(_pq).multiply(_rq));
    }
  }
  function playAnim(name, fade = 0.3, scale = 1) {
    const u = E.model.userData; if (!u.glb) return;
    const a = u.actions[name]; a.timeScale = scale;
    if (u.cur === name) return;
    const prev = u.actions[u.cur]; a.reset(); a.play(); if (prev) a.crossFadeFrom(prev, fade, false);
    u.cur = name;
  }
  E.headPos = function (out) { const u = E.model.userData; if (u.glb) { u.head.getWorldPosition(out); out.y += 0.06; } else out.set(E.pos.x, 1.55, E.pos.z); return out; };
  E.grabPose = function () { const u = E.model.userData; if (u.glb) { u.tilt = 0; u.faceK = 0; u.grabK = 0; playAnim('grab', 0.08, 1.4); setFace(u, u.screamTex); if (u.pei) { u.flkOn = 0; ghostVis(u, true); for (const e of u.eyes) { e.material.color.setHex(0xff3022); e.material.opacity = 1; } } } else { u.L.piv.rotation.x = -1.6; u.R.piv.rotation.x = -1.3; u.headG.rotation.set(0, 0, 0); } };
  E.idleAnim = function (dt) {
    E.t += dt; const u = E.model.userData;
    if (u.glb) { setFace(u, u.faceTex); playAnim('idle', 0.4, 1); unstoop(u); u.mixer.update(dt); stoop(1); peiTick(dt, false, true); }
    else { u.L.piv.rotation.x = -0.15 + Math.sin(E.t * 1.1) * 0.05; u.R.piv.rotation.x = -0.95; u.lamp.rotation.x = 0.95; u.headG.rotation.z = Math.sin(E.t * 0.37) * 0.12; }
    const fl = 0.85 + Math.sin(E.t * 14) * 0.08 + Math.random() * 0.07; u.light.intensity = (u.granny ? 1.0 : 1.6) * fl; if (u.flame) u.flame.scale.set(0.06, 0.12 * fl, 1);
  };
  E.tickModel = function (dt, eyeY, look) {
    const u = E.model.userData; if (!u.glb) return;
    unstoop(u); u.mixer.update(dt); stoop(0.5); peiTick(dt, true, false, !!look);
    if (look && u.faceFwd) { u.faceK = Math.min(1, (u.faceK || 0) + dt * 6); E.faceTo(look, 0.92 * u.faceK); } // her face snaps up to yours
    if (eyeY !== undefined) { E.model.position.y = 0; E.model.updateMatrixWorld(true); const hv = new THREE.Vector3(); u.head.getWorldPosition(hv); E.model.position.y = Math.max(0, Math.min(0.7, eyeY - 0.12 - hv.y)); }
  };
  E.reset = function (night, diff, at) {
    E.night = night; E.diff = diff;
    const mu = E.model && E.model.userData; if (mu && mu.glb) { setFace(mu, mu.faceTex); mu.tilt = 0; if (mu.pei) { mu.flkOn = 0; ghostVis(mu, true); } }
    const p = at || { x: 12, z: 18.6, lv: 0 };
    E.pos.set(p.x, 0, p.z); E.lv = p.lv || 0; E.y = W.FLOOR[E.lv]; E.yaw = Math.PI; E.state = 'wait'; E.wait = 6 + Math.random() * 2; E.path = null; E.sus = 0; E.sawHide = null; E.lastSeenT = -99; E.koT = 0; E.getup = 0; E.calm = false;
    E.lookBase = E.yaw; K.Audio.setChase(false);
    if (mu && mu.glb) playAnim('idle', 0.1, 1);
  };
  const SPEED = { patrol: 1.25, wait: 0, investigate: 1.95, chase: 3.15, search: 1.85, hidegrab: 2.6, ko: 0 };
  function speedOf(s) { return (SPEED[s] || 0) * E.diff.speed * (1 + (E.night - 1) * 0.05); }
  /* a point on a staircase maps to the stair end on the same half (stair cells are not in the grid) */
  function stairEnd(x, z, lv, top) { const g = W.ground(x, z, lv); if (!g.stair) return null; const pt = N.portals.find(q => q.st === g.stair); if (!pt) return null; return (top === undefined ? g.lv === g.stair.hi : top) ? pt.a : pt.b; }
  function plen(path) { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) + (path[i].lv !== path[i - 1].lv ? 3 : 0); return l; }
  function goTo(x, z, lv) {
    if (lv === undefined) lv = E.lv;
    const te = stairEnd(x, z, lv); if (te) { x = te.x; z = te.z; lv = te.lv; }
    const here = { x: E.pos.x, z: E.pos.z, lv: E.lv };
    if (W.ground(E.pos.x, E.pos.z, E.lv).stair) {
      // mid-stair: finish the flight towards whichever end gives the shorter route
      let best = null, bl = Infinity;
      for (const top of [true, false]) {
        const e = stairEnd(E.pos.x, E.pos.z, E.lv, top); if (!e) continue;
        const p = N.find(e.x, e.z, e.lv, x, z, lv); if (!p) continue;
        const l = plen(p) + Math.hypot(e.x - E.pos.x, e.z - E.pos.z);
        if (l < bl) { bl = l; best = [here, { x: e.x, z: e.z, lv: e.lv }].concat(p.slice(1)); }
      }
      E.path = best;
    } else E.path = N.find(E.pos.x, E.pos.z, E.lv, x, z, lv);
    E.pi = 1; E.target = { x, z, lv }; return !!E.path;
  }
  function pickWaypoint() {
    const P = K.P;
    let cands = WAY.filter(w => N.passAt(w.x, w.z, w.lv) && !E.lastWays.includes(w) && N.reach(E.pos.x, E.pos.z, E.lv, w.x, w.z, w.lv));
    // she haunts the half of the house you are in more often than the other
    if (Math.random() < 0.55) { const side = cands.filter(w => (w.x > 24) === (P.x > 24)); if (side.length) cands = side; }
    if (Math.random() < 0.4) { const near = cands.filter(w => w.lv === P.lv && Math.hypot(w.x - P.x, w.z - P.z) < 9); if (near.length) cands = near; }
    else if (Math.random() < 0.6) { const same = cands.filter(w => w.lv === E.lv); if (same.length) cands = same; }
    const w = cands[Math.floor(Math.random() * cands.length)] || WAY[0];
    E.lastWays.push(w); if (E.lastWays.length > 4) E.lastWays.shift();
    return w;
  }
  function say(key, near) {
    const p = { x: E.pos.x, y: E.y + 1.4, z: E.pos.z }, dur = K.Audio.voice && K.Audio.voice(key, p, near < 6 ? 1 : 0.85);
    if (!dur) return;
    E.lastLine = key; E.humT = Math.max(E.humT, dur + 3); E.whisperT = Math.max(E.whisperT, dur + 3);
    if (near < 13 && K.Game && K.Game.onVoice) K.Game.onVoice(key, dur);
  }
  E.say = say;
  E.setState = function (s) {
    const prev = E.state; E.state = s;
    E.nearHide = s === 'search' && W.hideSpots.some(h => h.lv === E.lv && Math.hypot(h.exit.x - E.pos.x, h.exit.z - E.pos.z) < 1.7);
    if (s === 'chase' && prev !== 'chase') { K.Audio.sting(); K.Audio.setChase(true); E.chaseT = 0; K.Game && K.Game.onChase && K.Game.onChase(true); if (Math.random() < 0.5 && E.t - (E.runLineT || -99) > 30) { E.runLineT = E.t; setTimeout(() => { if (E.state === 'chase') say('run', 4); }, 900); } }
    if (s !== 'chase' && prev === 'chase') { K.Audio.setChase(false); K.Game && K.Game.onChase && K.Game.onChase(false); }
  };
  function canSee() {
    const P = K.P; if (P.hidden || !E.active || E.state === 'ko') return false;
    if (P.lv !== E.lv || Math.abs(P.feet - E.y) > 1.4) return false;
    const dx = P.x - E.pos.x, dz = P.z - E.pos.z, d = Math.hypot(dx, dz);
    let range = P.torch ? 15 : 7.5;
    if (P.crouch) range *= 0.6;
    if (P.inMoon) range += 3;
    range *= E.diff.vision;
    if (d > range) return false;
    if (d > 1.7) { const fx = Math.sin(E.yaw), fz = Math.cos(E.yaw), dot = (fx * dx + fz * dz) / d; if (dot < Math.cos(1.05)) return false; }
    return N.los(E.pos.x, E.pos.z, P.x, P.z, E.lv);
  }
  E.hear = function (x, z, radius, lv = 0) {
    if (!E.active || E.state === 'chase' || E.state === 'hidegrab' || E.state === 'ko') return;
    if (lv !== E.lv && radius < 13) return; // floors muffle all but the loudest sounds
    const d = Math.hypot(x - E.pos.x, z - E.pos.z), eff = lv !== E.lv ? radius * 0.7 : N.los(E.pos.x, E.pos.z, x, z, lv) ? radius : radius * 0.6;
    if (d > eff) return;
    const j = Math.min(1.2, d * 0.08);
    // already heading there: keep the current path (A* is the costliest thing Paatti does)
    if (E.state === 'investigate' && E.path && E.target && E.target.lv === lv && Math.hypot(E.target.x - x, E.target.z - z) < 1.6) return;
    if (E.t - (E.hearT || -9) < 0.35 && E.state === 'investigate') return;
    E.hearT = E.t;
    if (goTo(x + (Math.random() - 0.5) * j, z + (Math.random() - 0.5) * j, lv)) { E.setState('investigate'); E.wait = 0; }
  };
  E.onHide = function (spot) {
    const P = K.P; const d = Math.hypot(P.x - E.pos.x, P.z - E.pos.z);
    if (E.state === 'chase' && E.t - E.lastSeenT < 0.6 && d < 9 && E.lv === spot.lv) { E.sawHide = spot; goTo(spot.exit.x, spot.exit.z, spot.lv); E.setState('hidegrab'); }
    else E.sawHide = null;
  };
  E.knockout = function (sec, calm) {
    E.setState('ko'); E.koT = sec; E.getup = 0; E.path = null; E.sus = 0; E.sawHide = null; E.calm = !!calm;
    K.Audio.setChase(false); K.Audio.setHeart(0);
    const u = E.model.userData; if (u.glb) playAnim(calm ? 'search' : 'fall', calm ? 0.6 : 0.12, calm ? 0.5 : 1);
  };
  E.koLeft = () => (E.state === 'ko' ? Math.max(0, E.koT) : 0);
  E.dist = () => Math.hypot(K.P.x - E.pos.x, K.P.z - E.pos.z);

  function settleY() { const g = W.ground(E.pos.x, E.pos.z, E.lv); E.y = g.y; E.lv = g.lv; }
  function follow(dt, sp) {
    if (!E.path || E.pi >= E.path.length) return true;
    let rem = sp * dt;
    while (rem > 0 && E.pi < E.path.length) {
      const p = E.path[E.pi], dx = p.x - E.pos.x, dz = p.z - E.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { E.lv = p.lv; E.pi++; continue; }
      const st = Math.min(rem, d); E.pos.x += dx / d * st; E.pos.z += dz / d * st; rem -= st;
      turnTo(Math.atan2(dx, dz), dt * 7); settleY();
      if (st >= d) { E.lv = p.lv; E.pi++; }
    }
    settleY();
    return E.pi >= E.path.length;
  }
  function turnTo(a, k) { let d = a - E.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; E.yaw += d * Math.min(1, k); }

  E.update = function (dt) {
    E.t += dt; const P = K.P;
    E.model.visible = true; // never hidden as a whole: her lamp light must stay in the scene (no shader recompiles)
    if (!E.active) { const u = E.model.userData; if (u.light) u.light.intensity = 0; return; }
    if (E.state === 'ko') {
      E.koT -= dt;
      const u = E.model.userData;
      if (E.koT <= 0 && E.calm && !E.getup) { E.calm = false; E.setState('wait'); E.wait = 2; E.lookBase = E.yaw; E.lookT = 0; K.Game && K.Game.onWake && K.Game.onWake(true); return; }
      if (E.koT <= 0 && !E.getup) { E.getup = u.granny || u.lie ? 1.6 : u.glb ? u.actions.getup.getClip().duration / 1.2 : 1; if (u.glb) playAnim('getup', 0.2, 1.2); }
      if (E.getup) { E.getup -= dt; if (E.getup <= 0) { E.getup = 0; E.setState('search'); E.wait = 3; E.lookBase = E.yaw; E.lookT = 0; K.Game && K.Game.onWake && K.Game.onWake(); } }
      K.Audio.setHeart(0); animate(dt, false, 0); return;
    }
    for (const d of W.doors) if ((d.lv || 0) === E.lv && !d.open && !d.locked && Math.hypot(d.center.x - E.pos.x, d.center.z - E.pos.z) < 1.05) { d.setOpen(true); K.Audio.creak({ x: d.center.x, y: E.y + 1.2, z: d.center.z }, 0.9); }
    const sees = canSee(), d = E.dist();
    if (sees) {
      E.sus += dt * (d < 4 ? 7 : d < 8 ? 3 : 1.6);
      if (E.sus > 0.55 && E.state !== 'chase' && E.state !== 'hidegrab') E.setState('chase');
      if (E.state === 'chase') { E.lastSeen.x = P.x; E.lastSeen.z = P.z; E.lastSeen.lv = P.lv; E.lastSeenT = E.t; }
    } else E.sus = Math.max(0, E.sus - dt * 0.4);
    const sp = speedOf(E.state);
    switch (E.state) {
      case 'wait':
        E.wait -= dt; E.lookT += dt; turnTo(E.lookBase + Math.sin(E.lookT * 0.8) * 1.1, dt * 2);
        if (E.wait <= 0) { const w = pickWaypoint(); if (goTo(w.x, w.z, w.lv)) E.setState('patrol'); else E.wait = 1; }
        break;
      case 'patrol':
        if (follow(dt, sp)) { E.setState('wait'); E.wait = 1.5 + Math.random() * 3; E.lookBase = E.yaw; E.lookT = 0; }
        break;
      case 'investigate':
        if (follow(dt, sp)) { E.setState('search'); E.wait = 4 + Math.random() * 2; E.path = null; E.lookBase = E.yaw; E.lookT = 0; }
        break;
      case 'search':
        if (E.path && E.pi < E.path.length) follow(dt, sp);
        else { E.wait -= dt; E.lookT += dt; turnTo(E.lookBase + Math.sin(E.lookT * 1.3) * 1.5, dt * 3); if (E.wait <= 0) { E.setState('wait'); E.wait = 0.5; } }
        break;
      case 'chase': {
        E.chaseT += dt;
        if (E.t - E.lastSeenT > 2.6) {
          const vx = P.vx || 0, vz = P.vz || 0;
          const tgt = N.nearestFreePoint(E.lastSeen.x + vx * 0.5, E.lastSeen.z + vz * 0.5, E.lastSeen.lv) || E.lastSeen;
          goTo(tgt.x, tgt.z, E.lastSeen.lv); E.setState('search'); E.wait = 5; E.lookBase = E.yaw; break;
        }
        E.repath -= dt;
        const direct = sees && d < 6 && !W.ground(E.pos.x, E.pos.z, E.lv).stair && N.clear({ x: E.pos.x, z: E.pos.z }, { x: P.x, z: P.z }, E.lv);
        if (direct && d > 1e-3) {
          const dx = P.x - E.pos.x, dz = P.z - E.pos.z, st = Math.min(sp * dt, d);
          E.pos.x += dx / d * st; E.pos.z += dz / d * st; turnTo(Math.atan2(dx, dz), dt * 9); E.path = null; settleY();
        } else {
          if (E.repath <= 0 || !E.path) { const tg = E.target; if (!E.path || !tg || tg.lv !== E.lastSeen.lv || Math.hypot(tg.x - E.lastSeen.x, tg.z - E.lastSeen.z) > 0.6 || E.pi >= E.path.length) goTo(E.lastSeen.x, E.lastSeen.z, E.lastSeen.lv); E.repath = 0.35; }
          follow(dt, sp);
        }
        break;
      }
      case 'hidegrab':
        if (follow(dt, sp)) { if (P.hidden && E.sawHide && P.hideSpot === E.sawHide) { K.Game.caught(true); return; } E.setState('search'); E.wait = 3; }
        break;
    }
    if (!P.hidden && d < 0.85 && E.lv === P.lv && Math.abs(E.y - P.feet) < 1.2 && E.catchArmed) { K.Game.caught(false); return; }
    const moving = E.state !== 'wait' && !(E.state === 'search' && (!E.path || E.pi >= E.path.length));
    if (moving) {
      E.stepT -= dt;
      if (E.stepT <= 0) {
        const s = Math.max(0.6, sp); E.stepT = 0.72 / Math.sqrt(s / 1.25);
        const p = { x: E.pos.x, y: E.y + 0.15, z: E.pos.z };
        K.Audio.anklet(p, E.state === 'chase' ? 1.25 : 0.9); K.Audio.paattiStep(p, 1);
      }
    }
    E.humT -= dt;
    if (E.humT <= 0) { E.humT = 16 + Math.random() * 18; if (E.state !== 'chase') K.Audio.hum({ x: E.pos.x, y: E.y + 1.5, z: E.pos.z }); }
    E.whisperT -= dt;
    if (E.whisperT <= 0) { E.whisperT = 18 + Math.random() * 20; if (d < 7 && E.lv === P.lv && E.state !== 'chase') K.Audio.whisper({ x: E.pos.x, y: E.y + 1.5, z: E.pos.z }); }
    // now and then she speaks, to no one, into the dark house
    E.voiceT -= dt;
    if (E.voiceT <= 0 && E.state !== 'chase' && E.state !== 'hidegrab' && E.state !== 'ko') {
      const near = E.lv === P.lv ? d : d + 6;
      if (near < 18) {
        const pool = E.state === 'search' || E.state === 'investigate' ? ['hiding', 'seeyou', 'heard', 'anyone'] : ['anyone', 'come', 'valli', 'hiding', 'heard'];
        let key = pool[Math.floor(Math.random() * pool.length)]; if (key === E.lastLine) key = pool[(pool.indexOf(key) + 1) % pool.length];
        say(key, near);
        E.voiceT = 40 + Math.random() * 35;
      } else E.voiceT = 6;
    }
    K.Audio.setHeart(E.state === 'chase' || E.state === 'hidegrab' ? 1 : (E.lv === P.lv ? Math.max(0, 1 - d / 11) * 0.75 : 0));
    animate(dt, moving, sp);
  };
  E._animate = (dt, moving, sp) => animate(dt, moving, sp); // for tests
  function animate(dt, moving, sp) {
    const m = E.model, u = m.userData, t = E.t;
    const chase = E.state === 'chase' || E.state === 'hidegrab';
    if (u.glb) {
      m.position.set(E.pos.x, E.y, E.pos.z); m.rotation.set(0, E.yaw, 0);
      if (u.granny || u.lie) { // lies down when knocked out, gets back up after
        const want = E.state === 'ko' && !(E.getup > 0) && !E.calm ? 1 : 0;
        u.tilt += (want - u.tilt) * Math.min(1, dt * (want ? 3.2 : 1.6));
        m.rotation.set(-u.tilt * 1.42, E.yaw, 0); m.position.y = E.y + u.tilt * 0.12;
      }
      if (E.state === 'ko') { if (u.pei && u.flkOn > 0) { u.flkOn = 0; ghostVis(u, true); } unstoop(u); u.mixer.update(dt); u.light.intensity = 0.5; return; }
      if (!moving) playAnim(E.state === 'search' ? (u.granny && E.nearHide ? 'bed' : 'search') : 'idle', 0.35, 1);
      else if (chase) playAnim('chase', 0.25, u.rocket ? Math.max(1, sp / u.stride.chase) : u.granny ? Math.max(1.2, sp / 1.6) : Math.max(0.8, sp / 3.0));
      else playAnim('walk', 0.3, u.rocket ? Math.max(0.6, sp / u.stride.walk) : u.granny ? Math.max(0.8, sp / 1.25) : Math.max(0.7, sp / 1.25 * 0.85));
      unstoop(u); u.mixer.update(dt); stoop(chase ? 0.55 : 1);
      if (u.pei) { peiTick(dt, chase, !moving); m.position.y += 0.03 + Math.sin(t * 1.2) * 0.015; } // she does not quite touch the floor
      else u.strands.forEach((s, i) => { s.rotation.x = Math.sin(t * 2 + i) * 0.08 + (chase ? 0.3 : 0); });
      const fl = 0.85 + Math.sin(t * 14) * 0.08 + Math.random() * 0.07;
      u.light.intensity = (u.granny ? 1.0 : 1.6) * fl; if (u.flame) u.flame.scale.set(0.06, 0.12 * fl, 1);
      return;
    }
    if (E.state === 'ko') { m.position.set(E.pos.x, E.y + 0.2, E.pos.z); m.rotation.set(-1.45, E.yaw, 0); return; }
    m.position.set(E.pos.x, E.y + (moving ? Math.abs(Math.sin(t * sp * 2.6)) * 0.03 : 0) + Math.sin(t * 1.3) * 0.01, E.pos.z);
    m.rotation.y = E.yaw;
    m.rotation.z = Math.sin(t * sp * 1.3) * (moving ? 0.035 : 0.01);
    m.rotation.x = chase ? 0.12 : 0.04;
    u.L.piv.rotation.x = chase ? -1.35 + Math.sin(t * 9) * 0.1 : -0.15 + Math.sin(t * 1.1) * 0.05;
    u.L.piv.rotation.z = chase ? -0.15 : 0.08;
    u.R.piv.rotation.x = -0.95 + Math.sin(t * 2) * 0.03;
    u.lamp.rotation.x = 0.95;
    u.headG.rotation.y = chase ? 0 : Math.sin(t * 0.6) * 0.25;
    u.headG.rotation.z = Math.sin(t * 0.37) * 0.12;
    u.strands.forEach((s, i) => { s.rotation.x = Math.sin(t * 2 + i) * 0.06 + (moving ? 0.12 : 0) + (chase ? 0.2 : 0); });
    const fl = 0.85 + Math.sin(t * 14) * 0.08 + Math.random() * 0.07;
    u.light.intensity = 1.6 * fl; u.flame.scale.set(0.06, 0.12 * fl, 1);
  }
})(window.K);
