/* KOLUSU — the Chettinad bungalow: walls, rooms, props, doors, puzzle objects */
'use strict';
(function (K) {
  const W = K.W = {
    solids: [], losBoxes: [], doors: [], rayTargets: [], hideSpots: [], creaky: [], items: {}, lamps: [],
    anim: [], clues: [], notes: {}, windows: [], gaps: [], skyOpen: []
  };
  W.BOUNDS = { x0: -0.5, x1: 46.5, z0: -10.5, z1: 29 };
  W.AREA = { '-1': [[0, 6, 6, 14]], '0': [[0, 46, -10, 20]], '1': [[0, 46, 0, 20], [20.8, 22.45, -1.45, 0.1]] };
  const HT = 3.6, T = 0.1;
  W.HT = HT;
  W.FLOOR = { '-1': -3, '0': 0, '1': 4.0 };
  let LV = 0; // level that new solids / LOS boxes belong to
  W.ROOMS = [
    { id: 'store', get name() { return K.t('r_store'); }, x0: 8, x1: 14, z0: 0, z1: 6 },
    { id: 'kitchen', get name() { return K.t('r_kitchen'); }, x0: 0, x1: 8, z0: 0, z1: 6 },
    { id: 'pooja', get name() { return K.t('r_pooja'); }, x0: 14, x1: 19, z0: 0, z1: 6 },
    { id: 'bedroom', get name() { return K.t('r_bedroom'); }, x0: 19, x1: 24, z0: 0, z1: 6 },
    { id: 'dining', get name() { return K.t('r_dining'); }, x0: 0, x1: 6, z0: 6, z1: 14 },
    { id: 'courtyard', get name() { return K.t('r_courtyard'); }, x0: 6, x1: 18, z0: 6, z1: 14 },
    { id: 'study', get name() { return K.t('r_study'); }, x0: 18, x1: 24, z0: 6, z1: 14 },
    { id: 'hall', get name() { return K.t('r_hall'); }, x0: 6, x1: 18, z0: 14, z1: 20 },
    { id: 'bath', get name() { return K.t('r_bath'); }, x0: 0, x1: 6, z0: 14, z1: 20 },
    { id: 'guest', get name() { return K.t('r_guest'); }, x0: 18, x1: 24, z0: 14, z1: 20 },
    // the second courtyard wing (irandaam kattu), ground floor
    { id: 'passage2', get name() { return K.t('r_passage2'); }, x0: 24, x1: 28, z0: 5, z1: 15 },
    { id: 'court2', get name() { return K.t('r_court2'); }, x0: 28, x1: 42, z0: 5, z1: 15 },
    { id: 'sewing', get name() { return K.t('r_sewing'); }, x0: 42, x1: 46, z0: 5, z1: 15 },
    { id: 'granary', get name() { return K.t('r_granary'); }, x0: 24, x1: 31, z0: 0, z1: 5 },
    { id: 'office', get name() { return K.t('r_office'); }, x0: 31, x1: 39, z0: 0, z1: 5 },
    { id: 'wash', get name() { return K.t('r_wash'); }, x0: 39, x1: 46, z0: 0, z1: 5 },
    { id: 'wedding', get name() { return K.t('r_wedding'); }, x0: 24, x1: 36, z0: 15, z1: 20 },
    { id: 'feast', get name() { return K.t('r_feast'); }, x0: 36, x1: 46, z0: 15, z1: 20 },
    { id: 'backyard', get name() { return K.t('r_backyard'); }, x0: 0, x1: 46, z0: -10, z1: 0, out: true, roofed: (x, z) => x > 14.3 && x < 22.7 && z < -6 },
    { id: 'frontyard', get name() { return K.t('r_frontyard'); }, x0: 0, x1: 46, z0: 20, z1: 28, out: true },
    { id: 'basement', lv: -1, get name() { return K.t('r_basement'); }, x0: 0, x1: 6, z0: 6, z1: 14 },
    { id: 'troom', lv: 1, get name() { return K.t('r_troom'); }, x0: 0.4, x1: 5, z0: 15, z1: 19.6 },
    // the wing's upper floor (maadi)
    { id: 'upass', lv: 1, get name() { return K.t('r_upass'); }, x0: 24, x1: 28, z0: 5, z1: 15 },
    { id: 'gallery2', lv: 1, get name() { return K.t('r_gallery2'); }, x0: 28, x1: 42, z0: 5, z1: 15 },
    { id: 'library', lv: 1, get name() { return K.t('r_library'); }, x0: 42, x1: 46, z0: 5, z1: 15 },
    { id: 'thatha', lv: 1, get name() { return K.t('r_thatha'); }, x0: 24, x1: 31, z0: 0, z1: 5 },
    { id: 'valli', lv: 1, get name() { return K.t('r_valli'); }, x0: 31, x1: 38, z0: 0, z1: 5 },
    { id: 'loft', lv: 1, get name() { return K.t('r_loft'); }, x0: 38, x1: 46, z0: 0, z1: 5 },
    { id: 'portraits', lv: 1, get name() { return K.t('r_portraits'); }, x0: 24, x1: 35, z0: 15, z1: 20 },
    { id: 'music', lv: 1, get name() { return K.t('r_music'); }, x0: 35, x1: 46, z0: 15, z1: 20 },
    { id: 'terrace', lv: 1, get name() { return K.t('r_terrace'); }, x0: 0, x1: 24, z0: -1.5, z1: 20, out: true }
  ];
  // rooms by 1 m buckets (the bake asks this hundreds of thousands of times): exact test on the few candidates, in list order
  let roomGrid = null; const RG = { x0: -2, z0: -12, w: 52, h: 44 };
  function buildRoomGrid() {
    roomGrid = [-1, 0, 1].map(() => new Array(RG.w * RG.h));
    for (const r of W.ROOMS) {
      const g = roomGrid[(r.lv || 0) + 1];
      for (let j = Math.max(0, Math.floor(r.z0 - RG.z0)); j <= Math.min(RG.h - 1, Math.floor(r.z1 - RG.z0)); j++)
        for (let i = Math.max(0, Math.floor(r.x0 - RG.x0)); i <= Math.min(RG.w - 1, Math.floor(r.x1 - RG.x0)); i++) (g[j * RG.w + i] || (g[j * RG.w + i] = [])).push(r);
    }
  }
  W.roomAt = function (x, z, lv = 0) {
    if (!roomGrid) buildRoomGrid();
    const i = Math.floor(x - RG.x0), j = Math.floor(z - RG.z0);
    if (lv < -1 || lv > 1 || i < 0 || j < 0 || i >= RG.w || j >= RG.h) { for (const r of W.ROOMS) if ((r.lv || 0) === lv && x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return r; return null; }
    const c = roomGrid[lv + 1][j * RG.w + i]; if (!c) return null;
    for (let k = 0; k < c.length; k++) { const r = c[k]; if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return r; }
    return null;
  };
  W.isOutside = function (x, z, lv = 0) { const r = W.roomAt(x, z, lv); return !!(r && r.out) || (lv === 0 && ((x > 9 && x < 15 && z > 8 && z < 12) || (x > 31 && x < 39 && z > 7.5 && z < 12.5))); };
  /* stairs: t = 0 at the bottom end, 1 at the top */
  W.stairs = [
    { id: 'base', lo: -1, hi: 0, axis: 'z', x0: 0.3, x1: 1.5, z0: 7.2, z1: 12.4, topAtMin: true, yLo: -3, yHi: 0 },
    { id: 'roof', lo: 0, hi: 1, axis: 'x', x0: 13.6, x1: 20.8, z0: -1.35, z1: -0.15, topAtMin: false, yLo: 0, yHi: 4.0 },
    { id: 'wing', lo: 0, hi: 1, axis: 'x', x0: 26.4, x1: 31.4, z0: 18.6, z1: 19.8, topAtMin: false, yLo: 0, yHi: 4.0 }
  ];
  W.ground = function (x, z, lv) {
    for (const s of W.stairs) {
      if (lv !== s.lo && lv !== s.hi) continue;
      if (x < s.x0 - 0.02 || x > s.x1 + 0.02 || z < s.z0 - 0.02 || z > s.z1 + 0.02) continue;
      let tt = s.axis === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0);
      if (s.topAtMin) tt = 1 - tt; tt = Math.max(0, Math.min(1, tt));
      return { y: s.yLo + tt * (s.yHi - s.yLo), lv: tt > 0.5 ? s.hi : s.lo, stair: s };
    }
    return { y: W.FLOOR[lv], lv, stair: null };
  };

  /* ---------------- geometry helpers ---------------- */
  function worldUV(geo, su, sv) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      if (ny > 0.5) uv.setXY(i, x / su, z / su);
      else if (nx > 0.5) uv.setXY(i, z / su, y / sv);
      else uv.setXY(i, x / su, y / sv);
    }
    uv.needsUpdate = true; return geo;
  }
  function boxGeo(x0, x1, y0, y1, z0, z1) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g;
  }
  function merge(geos) {
    let nv = 0, ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
      const c = g.attributes.position.count;
      if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
      else for (let i = 0; i < c; i++) idx[io++] = i + vo;
      vo += c;
    }
    const m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.setIndex(new THREE.BufferAttribute(idx, 1)); m.computeBoundingSphere(); return m;
  }
  function quadGeo(x0, x1, z0, z1, y, s, down) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3));
    const ny = down ? -1 : 1;
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / s, -z0 / s, x1 / s, -z0 / s, x1 / s, -z1 / s, x0 / s, -z1 / s], 2));
    g.setIndex(down ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]); return g;
  }
  function quad4(p, mat, ur = 1, vr = 1) { // p: 4 Vector3 corners, double-sided
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([].concat(...p.map(v => [v.x, v.y, v.z])), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, ur, 0, ur, vr, 0, vr], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); return m;
  }

  /* ---------------- solids ---------------- */
  function solidBox(x0, x1, z0, z1, extra) { const s = Object.assign({ t: 'b', minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), on: true, lv: LV }, extra || {}); W.solids.push(s); return s; }
  function solidCirc(x, z, r) { const s = { t: 'c', x, z, r, on: true, lv: LV }; W.solids.push(s); return s; }
  W.solidBox = solidBox;

  let scene, M;
  function add(o) { scene.add(o); return o; }
  function shadow(o, cast = true, recv = true) { o.traverse(c => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = recv; } }); return o; }
  // box prop: centre x,z; y = bottom
  function prop(w, h, d, x, y, z, mat, solid = true, rotY = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z); m.rotation.y = rotY; shadow(m); add(m);
    if (solid) { const sw = Math.abs(Math.cos(rotY)) > 0.5 ? w : d, sd = Math.abs(Math.cos(rotY)) > 0.5 ? d : w; solidBox(x - sw / 2, x + sw / 2, z - sd / 2, z + sd / 2); }
    return m;
  }
  function cyl(rt, rb, h, x, y, z, mat, seg = 16, solidR = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y + h / 2, z); shadow(m); add(m);
    if (solidR) solidCirc(x, z, solidR); return m;
  }
  W.addInter = function (mesh, obj) { mesh.userData.inter = obj; W.rayTargets.push(mesh); return mesh; };
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  function hitBox(w, h, d, x, y, z, obj, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat); m.position.set(x, y, z); (parent || scene).add(m); W.addInter(m, obj); return m;
  }
  W.hitBox = hitBox;

  /* ---------------- materials ---------------- */
  function std(o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o)); }
  function buildMaterials() {
    const wood = K.makeWoodTex(11, '#5a3418'), dark = K.makeWoodTex(12, '#2f1a0c'), teak = K.makeWoodTex(13, '#43240f');
    M = W.M = {
      wall: std({ map: K.makeWallTex(21), roughness: 0.95 }),
      ceil: std({ map: K.makePlankTex(22), roughness: 0.9 }),
      wood: std({ map: wood, roughness: 0.7 }),
      dark: std({ map: dark, roughness: 0.7 }),
      teak: std({ map: teak, roughness: 0.55 }),
      brass: std({ color: 0xc19032, metalness: 0.55, roughness: 0.32, emissive: 0x2a1a04 }),
      copper: std({ color: 0xa4582e, metalness: 0.5, roughness: 0.4, emissive: 0x1a0802 }),
      iron: std({ color: 0x2b2b2e, metalness: 0.6, roughness: 0.55 }),
      steel: std({ color: 0x8d9194, metalness: 0.7, roughness: 0.35, emissive: 0x0b0b0b }),
      cloth: std({ color: 0xcdc5b3, roughness: 1 }),
      redCloth: std({ color: 0x7c1d16, roughness: 1 }),
      clay: std({ color: 0x7d3b1e, roughness: 0.92 }),
      plaster: std({ color: 0x6d5a48, roughness: 1 }),
      soot: std({ color: 0x141110, roughness: 1 }),
      granite: std({ map: K.makeGraniteTex(23), roughness: 0.55 }),
      leaf: std({ color: 0x356b26, roughness: 0.7, side: THREE.DoubleSide }),
      marigold: std({ color: 0xe0861a, roughness: 0.9, emissive: 0x301200 }),
      sack: std({ color: 0x8a7450, roughness: 1 }),
      rope: std({ color: 0x8b7044, roughness: 1 }),
      black: new THREE.MeshBasicMaterial({ color: 0x020202 }),
      water: std({ color: 0x050a0c, roughness: 0.05, metalness: 0.3 }),
      glassDark: std({ color: 0x0b1012, roughness: 0.15, metalness: 0.4 }),
      paper: std({ map: K.makeNoteTex(), roughness: 0.95 }),
      roof: std({ map: K.makeRoofTex(24), roughness: 0.9, side: THREE.DoubleSide }),
      redGrip: std({ color: 0x8e1a12, roughness: 0.6 }),
      book: [0x5b1a14, 0x1e3b2a, 0x2c2a4f, 0x6b4a1a, 0x3d1d2f].map(c => std({ color: c, roughness: 0.9 })),
      floors: {
        rings: std({ map: K.makeTileTex({ style: 'rings', base: '#8a2a1c', a: '#d4a23a', b: '#1d3a2a', c: '#e7d7b0' }, 31), roughness: 0.38 }),
        ringsB: std({ map: K.makeTileTex({ style: 'rings', base: '#1f3d3a', a: '#c99a3b', b: '#7d1f17', c: '#e6d5ae' }, 32), roughness: 0.38 }),
        diamond: std({ map: K.makeTileTex({ style: 'diamond', base: '#e2d3ae', a: '#7c231a', b: '#20302a', c: '#d6a540' }, 33), roughness: 0.4 }),
        diamondB: std({ map: K.makeTileTex({ style: 'diamond', base: '#2a2a2a', a: '#b48a2e', b: '#5f1d15', c: '#e1d0a8' }, 34), roughness: 0.4 }),
        checker: std({ map: K.makeTileTex({ style: 'checker', base: '#1c1a18', a: '#d9ccab', c: '#7b2a1a' }, 35), roughness: 0.42 }),
        red: std({ map: K.makeTileTex({ style: 'checker', base: '#6a2316', a: '#5d1f14', c: '#3a120b' }, 36), roughness: 0.5 })
      }
    };
  }

  /* ---------------- walls ---------------- */
  const wallGeos = [];
  let WALLGEOS = wallGeos, WB = 0, WT = HT; // target geometry list and base/top height for wallX/wallZ
  function wallBox(x0, x1, y0, y1, z0, z1) {
    WALLGEOS.push(worldUV(boxGeo(x0, x1, y0, y1, z0, z1), 2, HT));
    if (y0 < WB + 1.5) { solidBox(x0, x1, z0, z1, { wall: true }); W.losBoxes.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, lv: LV }); }
  }
  function wallX(z, x0, x1, gaps = []) {
    let c = x0; gaps.sort((a, b) => a.c - b.c);
    for (const g of gaps) { const a = g.c - g.w / 2, b = g.c + g.w / 2; if (a > c) wallBox(c, a, WB, WT, z - T, z + T); if (WB + (g.h || 2.2) < WT) wallBox(a, b, WB + (g.h || 2.2), WT, z - T, z + T); c = b; W.gaps.push({ ax: 'x', at: z, a, b, y0: WB, y1: Math.min(WT, WB + (g.h || 2.2)), lv: LV }); }
    if (c < x1) wallBox(c, x1, WB, WT, z - T, z + T);
  }
  function wallZ(x, z0, z1, gaps = []) {
    let c = z0; gaps.sort((a, b) => a.c - b.c);
    for (const g of gaps) { const a = g.c - g.w / 2, b = g.c + g.w / 2; if (a > c) wallBox(x - T, x + T, WB, WT, c, a); if (WB + (g.h || 2.2) < WT) wallBox(x - T, x + T, WB + (g.h || 2.2), WT, a, b); c = b; W.gaps.push({ ax: 'z', at: x, a, b, y0: WB, y1: Math.min(WT, WB + (g.h || 2.2)), lv: LV }); }
    if (c < z1) wallBox(x - T, x + T, WB, WT, c, z1);
  }

  /* ---------------- doors ---------------- */
  // axis 'x': wall runs along x (door in a wall at fixed z). swing: +1/-1 picks which side it opens to.
  function makeDoor(o) {
    const d = Object.assign({ open: false, angle: 0, target: 0, locked: !!o.lock, lockInit: !!o.lock, lv: LV }, o); const Y = o.y || 0;
    const pivot = new THREE.Group(), w = o.w - 0.04;
    const dk = (o.seed || 5) % 4, mat = (W._doorM || (W._doorM = {}))[dk] || (W._doorM[dk] = std({ map: K.makeDoorTex(51 + dk, false), roughness: 0.6 }));
    let geo;
    if (o.axis === 'x') { pivot.position.set(o.x - o.w / 2 + 0.02, Y, o.z); geo = new THREE.BoxGeometry(w, 2.16, 0.06); geo.translate(w / 2, 1.08, 0); }
    else { pivot.position.set(o.x, Y, o.z - o.w / 2 + 0.02); geo = new THREE.BoxGeometry(0.06, 2.16, w); geo.translate(0, 1.08, w / 2); }
    const leaf = new THREE.Mesh(geo, mat); shadow(leaf); pivot.add(leaf);
    // ring handle
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 14), M.brass);
    if (o.axis === 'x') { ring.position.set(w - 0.12, 1.05, 0.05 * (o.swing || 1)); }
    else { ring.position.set(0.05 * (o.swing || 1), 1.05, w - 0.12); ring.rotation.y = Math.PI / 2; }
    pivot.add(ring);
    const ring2 = ring.clone(); if (o.axis === 'x') ring2.position.z *= -1; else ring2.position.x *= -1; pivot.add(ring2);
    leaf.userData.keep = true; K.Props.mergeGroup(pivot);
    // frame
    const fh = 2.2;
    if (o.axis === 'x') { prop(0.08, fh, 0.24, o.x - o.w / 2 - 0.0, Y, o.z, M.dark, false); prop(0.08, fh, 0.24, o.x + o.w / 2, Y, o.z, M.dark, false); prop(o.w + 0.16, 0.1, 0.24, o.x, Y + fh - 0.04, o.z, M.dark, false); }
    else { prop(0.24, fh, 0.08, o.x, Y, o.z - o.w / 2, M.dark, false); prop(0.24, fh, 0.08, o.x, Y, o.z + o.w / 2, M.dark, false); prop(0.24, 0.1, o.w + 0.16, o.x, Y + fh - 0.04, o.z, M.dark, false); }
    add(pivot);
    d.pivot = pivot; d.leaf = leaf;
    d.solid = o.axis === 'x' ? solidBox(o.x - o.w / 2, o.x + o.w / 2, o.z - 0.05, o.z + 0.05, { door: true }) : solidBox(o.x - 0.05, o.x + 0.05, o.z - o.w / 2, o.z + o.w / 2, { door: true });
    d.center = { x: o.x, z: o.z };
    d.box = { minX: d.solid.minX, maxX: d.solid.maxX, minZ: d.solid.minZ, maxZ: d.solid.maxZ };
    d.setOpen = function (v, instant) {
      d.open = v; d.target = v ? 1 : 0; if (instant) d.angle = d.target;
      d.solid.on = !v;
    };
    d.update = function (dt) {
      if (d.angle !== d.target) {
        const sp = (d.fast ? 7 : 2.2) * dt; d.angle += Math.sign(d.target - d.angle) * Math.min(sp, Math.abs(d.target - d.angle)); if (d.angle === d.target) d.fast = false;
      }
      pivot.rotation.y = -d.angle * (Math.PI / 2) * 0.92 * (o.swing || 1) * (o.axis === 'x' ? 1 : -1);
    };
    d.reset = function () { d.locked = d.lockInit; d.setOpen(false, true); d.update(0); };
    W.addInter(leaf, { kind: 'door', door: d });
    W.doors.push(d);
    return d;
  }

  /* ---------------- windows (dark, barred; lightning shows through) ---------------- */
  function addWindow(x, z, nx, nz) {
    const g = new THREE.Group(), mat = W.windowMat || (W.windowMat = new THREE.MeshBasicMaterial({ color: 0x0b1222 })); mat.userData.mergeBasic = true;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), mat); g.add(pane);
    for (let i = -2; i <= 2; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 6), M.iron); b.position.set(i * 0.2, 0, 0.03); g.add(b); }
    for (const [w, h, px, py] of [[1.16, 0.08, 0, 0.69], [1.16, 0.08, 0, -0.69], [0.08, 1.46, 0.58, 0], [0.08, 1.46, -0.58, 0]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), M.dark); f.position.set(px, py, 0.02); g.add(f); }
    const wy = (W.FLOOR[LV] || 0) + 1.65; g.position.set(x + nx * 0.105, wy, z + nz * 0.105); g.lookAt(x + nx * 5, wy, z + nz * 5);
    add(g); g.userData.batch = true; if (!W.windows.length) W.windows.push(mat);
    const inR = W.roomAt(x + nx * 0.7, z + nz * 0.7, LV);
    if (inR && !inR.out && K.R) K.R.addLight({ x: x + nx * 0.55, y: (W.FLOOR[LV] || 0) + 1.75, z: z + nz * 0.55, col: [0.075, 0.095, 0.16], range: 3.4, decay: 1.6, lv: LV });
  }

  /* ---------------- items ---------------- */
  const ITEM_DEF = {};
  for (const id of ['smallkey', 'matchbox', 'bucket', 'brasskey', 'almirahkey', 'boltcutter', 'oosi', 'kolusu', 'wingkey', 'sickle', 'fuse', 'safeknob', 'bigkey']) ITEM_DEF[id] = { get name() { return K.t('i_' + id); } };
  W.typeOf = id => (!id ? id : id.startsWith('oosi') ? 'oosi' : id.startsWith('fuse') ? 'fuse' : id.startsWith('kolusu') ? 'kolusu' : id);
  W.ITEM_DEF = ITEM_DEF;
  function keyMesh(scale, mat, ornate) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028 * scale, 0.007 * scale, 6, 16), mat); ring.rotation.x = Math.PI / 2; ring.position.x = -0.05 * scale; g.add(ring);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * scale, 0.006 * scale, 0.1 * scale, 6), mat); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.02 * scale; g.add(shaft);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.018 * scale, 0.006 * scale, 0.028 * scale), mat); bit.position.set(0.06 * scale, 0, 0.014 * scale); g.add(bit);
    if (ornate) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.012 * scale, 8, 6), mat); k.position.x = -0.018 * scale; g.add(k); }
    return g;
  }
  function itemMesh(id) {
    let g = K.Items3D ? K.Items3D.make(id, M) : null;
    if (g) { /* the detailed model (items3d.js) */ }
    else if (id === 'smallkey') { g = keyMesh(1.2, M.brass); g.position.y = 0.01; }
    else if (id === 'brasskey') { g = keyMesh(2.1, M.brass, true); g.position.y = 0.02; }
    else if (id === 'almirahkey') { g = keyMesh(1.5, M.steel); g.position.y = 0.01; }
    else if (id === 'matchbox') {
      g = new THREE.Group();
      const lab = W._labM || (W._labM = std({ map: K.makeLabelTex('தீ', '#d6a72a', '#7c1a0f') }));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.04), [M.clay, M.clay, lab, M.clay, M.clay, M.clay]); b.position.y = 0.01; g.add(b);
    } else if (id === 'bucket') {
      g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.26, 18, 1, true), Object.assign(M.brass.clone(), { side: THREE.DoubleSide })); body.position.y = 0.13; g.add(body);
      const bot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), M.brass); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.005; g.add(bot);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 16, Math.PI), M.iron); h.position.y = 0.26; g.add(h);
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), M.rope); rope.position.set(0, 0.43, 0); rope.rotation.x = Math.PI / 2; g.add(rope);
    } else if (id === 'boltcutter') {
      g = new THREE.Group();
      for (const s of [-1, 1]) {
        const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), M.iron); hnd.rotation.z = Math.PI / 2; hnd.rotation.y = s * 0.08; hnd.position.set(-0.05, 0.015, s * 0.02); g.add(hnd);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 8), M.redGrip); grip.rotation.z = Math.PI / 2; grip.rotation.y = s * 0.08; grip.position.set(-0.2, 0.015, s * 0.032); g.add(grip);
      }
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.05), M.iron); jaw.position.set(0.2, 0.015, 0); g.add(jaw);
    } else if (id.startsWith('oosi')) { // sedative syringe
      g = new THREE.Group();
      const glass = new THREE.MeshStandardMaterial({ color: 0xdfe8ea, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1 });
      const fluid = new THREE.MeshStandardMaterial({ color: 0x39d18a, emissive: 0x0d4a2c, roughness: 0.3 });
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 10), glass); barrel.rotation.z = Math.PI / 2; g.add(barrel);
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.075, 8), fluid); liq.rotation.z = Math.PI / 2; liq.position.x = 0.012; g.add(liq);
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.05, 4), M.steel); needle.rotation.z = Math.PI / 2; needle.position.x = 0.08; g.add(needle);
      const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), M.steel); plunger.rotation.z = Math.PI / 2; plunger.position.x = -0.075; g.add(plunger);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 10), M.steel); cap.rotation.z = Math.PI / 2; cap.position.x = -0.105; g.add(cap);
      g.position.y = 0.014;
    } else if (id === 'wingkey') { g = keyMesh(1.7, M.iron, true); g.position.y = 0.012; }
    else if (id === 'bigkey') { g = keyMesh(3.4, M.iron, true); g.position.y = 0.02; }
    else if (id === 'sickle') {
      g = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 4, 16, Math.PI * 1.1), M.steel); blade.rotation.x = Math.PI / 2; blade.scale.set(1, 1, 0.3); blade.position.set(0.1, 0.01, 0); g.add(blade);
      const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.2, 8), M.wood); hnd.rotation.z = Math.PI / 2; hnd.position.set(-0.08, 0.016, -0.1); g.add(hnd);
    } else if (id.startsWith('fuse')) {
      g = new THREE.Group(); const porc = K.Props.X.porc || (K.Props.X.porc = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.35 }));
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.13), porc); b.position.y = 0.02; g.add(b);
      for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.025), M.brass); c.position.set(0, 0.045, s * 0.045); g.add(c); }
    } else if (id === 'safeknob') {
      g = new THREE.Group(); const k = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 20), K.Props.X.knobM || (K.Props.X.knobM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.3 }))); k.position.y = 0.025; g.add(k);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.01, 0.03), M.steel); m.position.set(0, 0.052, 0.03); g.add(m);
    } else if (id.startsWith('kolusu')) {
      g = K.Props.anklet(W._silver || (W._silver = new THREE.MeshStandardMaterial({ color: 0xe4e4e8, metalness: 0.95, roughness: 0.22, envMap: K.envMap || null, envMapIntensity: K.envMap ? 1.2 : 0, emissive: 0x111114 })));
      g.position.y = 0.01;
    }
    shadow(g, true, false); K.Props.mergeGroup(g);
    return g;
  }
  W.itemMesh = itemMesh;
  const glintTex = () => W._glint || (W._glint = K.makeGlowTex('rgba(255,250,220,1)', 'rgba(255,220,140,0.35)'));
  function makeItem(id, x, y, z, rotY = 0) {
    const mesh = itemMesh(id); mesh.position.set(x, y, z); mesh.rotation.y = rotY; add(mesh);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
    sp.scale.set(0.12, 0.12, 0.12); sp.position.set(0, id === 'bucket' ? 0.3 : 0.05, 0); mesh.add(sp);
    const hs = id === 'bucket' ? 0.24 : id === 'boltcutter' || id === 'sickle' || id === 'bigkey' ? 0.2 : id.startsWith('oosi') || id.startsWith('kolusu') ? 0.13 : 0.11;
    const hb = new THREE.Mesh(new THREE.SphereGeometry(hs, 8, 6), hitMat); hb.position.y = id === 'bucket' ? 0.15 : 0.03; mesh.add(hb);
    const it = { id, type: W.typeOf(id), get name() { return ITEM_DEF[W.typeOf(id)].name; }, mesh, glint: sp, state: 'world', home: { x, y, z, rotY }, restY: 0 };
    W.addInter(hb, { kind: 'item', item: it });
    W.items[id] = it;
    it.place = function (px, py, pz, ry) { it.state = 'world'; mesh.visible = true; mesh.position.set(px, py, pz); mesh.rotation.set(0, ry || 0, 0); mesh.updateMatrixWorld(true); };
    it.hide = function (st = 'gone') { it.state = st; mesh.visible = false; };
    return it;
  }

  /* ---------------- the build ---------------- */
  W.build = function (sc) {
    W.__scene = sc;
    scene = sc; buildMaterials(); K.Props.init(sc, M, merge);
    const F = M.floors;

    // floors (tile size: texture spans 1.2 m = 2x2 tiles)
    const fl = [
      [8, 14, 0, 6, F.red], [0, 8, 0, 6, F.checker], [14, 19, 0, 6, F.diamond], [19, 24, 0, 6, F.ringsB],
      [0, 6, 6, 7.2, F.diamondB], [0, 6, 12.4, 14, F.diamondB], [0, 0.3, 7.2, 12.4, F.diamondB], [1.5, 6, 7.2, 12.4, F.diamondB], [18, 24, 6, 14, F.checker], [6, 18, 14, 20, F.rings], [0, 6, 14, 20, F.red], [18, 24, 14, 20, F.ringsB]
    ];
    for (const [x0, x1, z0, z1, m] of fl) { const f = new THREE.Mesh(quadGeo(x0, x1, z0, z1, 0, 1.2), m); f.receiveShadow = true; add(f); }
    // veranda around the courtyard + granite courtyard
    const ver = [[6, 18, 6, 8], [6, 18, 12, 14], [6, 9, 8, 12], [15, 18, 8, 12]];
    for (const [x0, x1, z0, z1] of ver) { const f = new THREE.Mesh(quadGeo(x0, x1, z0, z1, 0, 1.2), F.rings); f.receiveShadow = true; add(f); }
    const cy = new THREE.Mesh(quadGeo(9, 15, 8, 12, 0.0, 2.0), M.granite); cy.receiveShadow = true; add(cy);
    // granite edging around the open courtyard
    for (const [x0, x1, z0, z1] of [[8.9, 15.1, 7.9, 8.05], [8.9, 15.1, 11.95, 12.1], [8.9, 9.05, 8, 12], [14.95, 15.1, 8, 12]]) {
      const e = new THREE.Mesh(boxGeo(x0, x1, 0, 0.05, z0, z1), M.granite); e.receiveShadow = true; add(e);
    }

    // ceiling with the courtyard opening
    const cg = [];
    for (const [x0, x1, z0, z1] of [[0, 24, 0, 8], [0, 24, 12, 20], [0, 9, 8, 12], [15, 24, 8, 12]]) cg.push(quadGeo(x0, x1, z0, z1, HT, 3, true));
    const ceil = new THREE.Mesh(merge(cg), M.ceil); add(ceil);
    // beams
    const bg = [];
    for (let x = 1; x < 24; x += 2) { if (x > 8.5 && x < 15.5) { bg.push(boxGeo(x - 0.09, x + 0.09, HT - 0.2, HT, 0, 7.9)); bg.push(boxGeo(x - 0.09, x + 0.09, HT - 0.2, HT, 12.1, 20)); } else bg.push(boxGeo(x - 0.09, x + 0.09, HT - 0.2, HT, 0, 20)); }
    add(new THREE.Mesh(merge(bg), M.dark));
    // light-well above the courtyard: short parapet, sloping tiled roofs, sky
    const pg = [];
    const skyTex = K.makeSkyTex(); skyTex.wrapS = skyTex.wrapT = THREE.RepeatWrapping; skyTex.repeat.set(2, 2);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
    sky.rotation.x = Math.PI / 2; sky.position.set(12, 20, 9); add(sky); W.sky = sky; sky.userData.dyn = true;

    // ---- walls ----
    wallX(0, 0, 24, [{ c: 6.5, w: 1.0 }]); wallX(20, 0, 24, [{ c: 12, w: 1.6, h: 2.5 }]);
    wallZ(0, 0, 20); wallZ(24, 0, 20, [{ c: 10, w: 1.2 }]);
    wallX(6, 0, 24, [{ c: 3, w: 1.2 }, { c: 11, w: 1.2 }, { c: 16.5, w: 1.0 }, { c: 21.5, w: 1.2 }]);
    wallZ(8, 0, 6); wallZ(14, 0, 6); wallZ(19, 0, 6);
    wallZ(6, 6, 14, [{ c: 10, w: 1.4, h: 2.5 }]);
    wallZ(18, 6, 14, [{ c: 10, w: 1.2 }]);
    wallX(14, 0, 24, [{ c: 3, w: 1.0 }, { c: 12, w: 2.4, h: 2.7 }]);
    wallZ(6, 14, 20); wallZ(18, 14, 20, [{ c: 17, w: 1.2 }]);
    const walls = new THREE.Mesh(merge(wallGeos), M.wall); walls.receiveShadow = true; walls.castShadow = false; add(walls);
    W.wallMesh = walls;
    // arch trims
    prop(0.3, 0.12, 1.6, 6, 2.44, 10, M.dark, false); prop(2.6, 0.14, 0.3, 12, 2.62, 14, M.dark, false);

    // ---- doors ----
    W.doorById = {};
    for (const cfg of [
      { id: 'kitchen', axis: 'x', x: 3, z: 6, w: 1.2, swing: 1, seed: 51 },
      { id: 'store', axis: 'x', x: 11, z: 6, w: 1.2, swing: -1, seed: 52 },
      { id: 'pooja', axis: 'x', x: 16.5, z: 6, w: 1.0, swing: -1, lock: 'lamps', seed: 53 },
      { id: 'bedroom', axis: 'x', x: 21.5, z: 6, w: 1.2, swing: -1, seed: 54 },
      { id: 'study', axis: 'z', x: 18, z: 10, w: 1.2, swing: 1, seed: 55 },
      { id: 'bath', axis: 'x', x: 3, z: 14, w: 1.0, swing: 1, seed: 56 },
      { id: 'guest', axis: 'z', x: 18, z: 17, w: 1.2, swing: 1, lock: 'smallkey', seed: 57 },
      { id: 'back', axis: 'x', x: 6.5, z: 0, w: 1.0, swing: 1, seed: 58 },
      { id: 'wing', axis: 'z', x: 24, z: 10, w: 1.2, swing: 1, lock: 'wingkey', seed: 60 }
    ]) W.doorById[cfg.id] = makeDoor(cfg);

    // ---- windows ----
    addWindow(0, 3, 1, 0); addWindow(0, 10, 1, 0);
    addWindow(8.5, 20, 0, -1); addWindow(15.5, 20, 0, -1); addWindow(3, 20, 0, -1); addWindow(4, 0, 0, 1);
    addWindow(3, 20, 0, 1); addWindow(20.5, 20, 0, 1); addWindow(0, 3, -1, 0); addWindow(0, 17, -1, 0);

    buildCourtyard(); buildStore(); buildKitchen(); buildPooja(); buildBedroom(); buildDining(); buildStudy(); buildHall(); buildBath(); buildGuest();
    buildCreaky();
    const tag = (from, zone) => { for (let i = from; i < scene.children.length; i++) scene.children[i].traverse(c => { if (c.userData.zone === undefined) c.userData.zone = zone; }); };
    tag(0, 'house');
    let mk = scene.children.length; buildBasement(); tag(mk, 'base');
    mk = scene.children.length; buildTerrace(); tag(mk, 'terrace');
    mk = scene.children.length; buildBackyard(); tag(mk, 'back');
    mk = scene.children.length; buildFrontyard(); tag(mk, 'front');
    buildWing();
    buildLights(); tag(0, 'house');
    W.ghost = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.Props.ghostTex(), transparent: true, depthWrite: false, opacity: 0, fog: false })); W.ghost.scale.set(0.62, 1.24, 1); W.ghost.visible = false; W.ghost.userData.dyn = true; scene.add(W.ghost);
    W.skyOpen.push({ x0: 9, x1: 15, z0: 8, z1: 12, lv: 0 }, { x0: 31, x1: 39, z0: 7.5, z1: 12.5, lv: 0 }, { x0: 31, x1: 39, z0: 7.5, z1: 12.5, lv: 1 });
    W.extraPortals = [['courtyard', 'terrace', [8.9, 3.3, 7.9, 15.1, 4.9, 12.1]], ['dining', 'basement', [0.25, -0.5, 7.15, 1.55, 0.4, 12.45]],
      ['court2', 'gallery2', [30.9, 3.3, 7.4, 39.1, 4.6, 12.6]], ['gallery2', 'out1', [30.9, 6.9, 7.4, 39.1, 8.6, 12.6]], ['wedding', 'portraits', [26.3, 3.3, 18.5, 31.5, 4.6, 19.9]]];
    indexSolids();
  };

  W.extraFlames = [];
  /* ---------------- rooms as render cells: level, sky, ambient light, ambient occlusion ---------------- */
  W.lattice = function () {
    if (W._lat) return W._lat;
    const xs = new Set(), zs = new Set();
    for (const r of W.ROOMS) { xs.add(r.x0); xs.add(r.x1); zs.add(r.z0); zs.add(r.z1); }
    for (const o of W.skyOpen) { xs.add(o.x0); xs.add(o.x1); zs.add(o.z0); zs.add(o.z1); }
    return (W._lat = { xs: [...xs].sort((a, b) => a - b), zs: [...zs].sort((a, b) => a - b) });
  };
  W.levelOfY = y => (y < -0.25 ? -1 : y < 3.85 ? 0 : 1);
  W.cellAt = function (x, y, z) { const lv = W.levelOfY(y), r = W.roomAt(x, z, lv); return r ? r.id : 'out' + lv; };
  W.cellIsOut = id => id.startsWith('out') || !!(W.ROOMS.find(r => r.id === id) || {}).out;
  W.skyAt = function (x, y, z, lv) {
    const r = W.roomAt(x, z, lv); if (!r || r.out) return r && r.roofed && r.roofed(x, z) ? 0.25 : 1;
    let k = 0;
    for (const o of W.skyOpen) {
      if (o.lv !== lv) continue;
      const dx = Math.max(o.x0 - x, 0, x - o.x1), dz = Math.max(o.z0 - z, 0, z - o.z1), d = Math.hypot(dx, dz);
      if (d === 0) return 1;
      k = Math.max(k, Math.max(0, 1 - d / 3.4) * 0.55);
    }
    return k;
  };
  const AMB_IN = [0.034, 0.030, 0.032], AMB_OUT = [0.03, 0.036, 0.055], AMB_BASE = [0.022, 0.019, 0.018];
  W.ambientAt = function (x, y, z, lv, ny) {
    const r = W.roomAt(x, z, lv);
    if (!r || r.out) return AMB_OUT;
    if (lv < 0) return AMB_BASE;
    return r.amb || AMB_IN;
  };
  const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  W.ceilOf = function (r, lv) { return r.ceil !== undefined ? r.ceil : lv < 0 ? 0 : lv === 0 ? HT : W.FLOOR[1] + 3.2; };
  W.aoAt = function (x, y, z, nx, ny, nz) {
    const lv = W.levelOfY(y), px = x + nx * 0.06, pz = z + nz * 0.06, r = W.roomAt(px, pz, lv);
    let ao = 1;
    const fy = W.FLOOR[lv], dyF = y - fy;
    if (r && !r.out) {
      const cy = W.ceilOf(r, lv);
      if (Math.abs(nx) < 0.7) ao *= 0.62 + 0.38 * sm(0, 0.9, Math.min(x - r.x0, r.x1 - x));
      if (Math.abs(nz) < 0.7) ao *= 0.62 + 0.38 * sm(0, 0.9, Math.min(z - r.z0, r.z1 - z));
      if (ny < 0.7) ao *= 0.72 + 0.28 * sm(0, 0.7, dyF);
      if (ny > -0.7) ao *= 0.78 + 0.22 * sm(0, 0.7, cy - y);
    } else if (ny < 0.7) ao *= 0.8 + 0.2 * sm(0, 0.5, dyF);
    // contact shadow on the floor around and under furniture
    if (ny > 0.6 && dyF < 0.08 && dyF > -0.08) {
      let best = 9;
      W.eachSolid(x, z, 0.7, lv, s => {
        if (s.wall || s.door) return;
        let d; if (s.t === 'b') { const dx = Math.max(s.minX - x, 0, x - s.maxX), dz = Math.max(s.minZ - z, 0, z - s.maxZ); d = Math.hypot(dx, dz); }
        else d = Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
        if (d < best) best = d;
      });
      if (best < 0.7) ao *= 0.42 + 0.58 * sm(0, 0.7, best);
    } else if (ny < 0.6 && dyF < 0.4 && dyF > -0.05) ao *= 0.82 + 0.18 * sm(0, 0.4, dyF);
    return Math.max(0.25, ao);
  };
  /* solids in 2 m buckets: collisions and contact shadows only look at their neighbourhood */
  const SG = new Map(), SGC = 2;
  const sgKey = (i, j, lv) => (lv + 2) * 1e6 + (i + 500) * 1000 + (j + 500);
  function indexSolids() {
    SG.clear();
    for (const s of W.solids) {
      const x0 = s.t === 'b' ? s.minX : s.x - s.r, x1 = s.t === 'b' ? s.maxX : s.x + s.r, z0 = s.t === 'b' ? s.minZ : s.z - s.r, z1 = s.t === 'b' ? s.maxZ : s.z + s.r;
      for (let i = Math.floor(x0 / SGC); i <= Math.floor(x1 / SGC); i++) for (let j = Math.floor(z0 / SGC); j <= Math.floor(z1 / SGC); j++) {
        const k = sgKey(i, j, s.lv); if (!SG.has(k)) SG.set(k, []); SG.get(k).push(s);
      }
    }
  }
  W.indexSolids = indexSolids;
  const seen = new Set();
  W.eachSolid = function (x, z, r, lv, fn) {
    const i0 = Math.floor((x - r) / SGC), i1 = Math.floor((x + r) / SGC), j0 = Math.floor((z - r) / SGC), j1 = Math.floor((z + r) / SGC);
    if (i0 === i1 && j0 === j1) { const l = SG.get(sgKey(i0, j0, lv)); if (l) for (let n = 0; n < l.length; n++) fn(l[n]); return; }
    seen.clear();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = SG.get(sgKey(i, j, lv)); if (l) for (let n = 0; n < l.length; n++) { const s = l[n]; if (!seen.has(s)) { seen.add(s); fn(s); } } }
  };
  W.solidLists = function (x, z, r, lv, out) {
    out.length = 0;
    const i0 = Math.floor((x - r) / SGC), i1 = Math.floor((x + r) / SGC), j0 = Math.floor((z - r) / SGC), j1 = Math.floor((z + r) / SGC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = SG.get(sgKey(i, j, lv)); if (l) out.push(l); }
    return out;
  };

  /* ---------------- compile: bake and merge the static house, convert moving things, link the rooms ---------------- */
  W.compile = function () {
    const Rr = K.R, ct = [performance.now()]; Rr.prepareBake();
    const isStatic = m => m.isMesh && !m.userData.dyn && !m.userData.inter && m.material !== hitMat && !m.isSkinnedMesh && !m.userData.keepMat;
    scene.updateMatrixWorld(true);
    const list = [], fall = [];
    const consider = m => { if (!isStatic(m)) return; const mats = Array.isArray(m.material) ? m.material : [m.material]; if (mats.every(x => Rr.describe(x))) list.push(m); else if (mats.length === 1 && mats[0].userData.mergeBasic) fall.push(m); };
    for (const o of scene.children.slice()) {
      if (o.isMesh) consider(o);
      else if (o.isGroup && o.userData.batch) o.traverse(c => { if (c.isMesh) consider(c); });
    }
    // window panes keep their own material (lightning flashes them) but are merged per room
    ct.push(performance.now());
    const byKey = new Map();
    for (const m of fall) { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); g.computeBoundingSphere(); const c = g.boundingSphere.center, key = m.material.uuid + '|' + W.cellAt(c.x, c.y, c.z); if (!byKey.has(key)) byKey.set(key, { mat: m.material, cell: W.cellAt(c.x, c.y, c.z), geos: [] }); byKey.get(key).geos.push(g); if (m.parent) m.parent.remove(m); }
    for (const [, b] of byKey) { const nm = new THREE.Mesh(merge(b.geos.map(g => g.index ? g.toNonIndexed() : g).map(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); return g; })), b.mat); nm.matrixAutoUpdate = false; nm.userData.merged = true; scene.add(nm); Rr.track(nm, [b.cell]); }
    ct.push(performance.now());
    const st = Rr.compileStatic(list, { maxEdge: 0.8 });
    ct.push(performance.now());
    // rooms are linked by their openings
    for (const g of W.gaps) {
      const mid = (g.a + g.b) / 2, my = (g.y0 + g.y1) / 2;
      let A, B, box, door = null;
      if (g.ax === 'x') { A = W.cellAt(mid, my, g.at - 0.35); B = W.cellAt(mid, my, g.at + 0.35); box = [g.a, g.y0, g.at - 0.15, g.b, g.y1, g.at + 0.15]; door = W.doors.find(d => d.axis === 'x' && Math.abs(d.z - g.at) < 0.2 && Math.abs(d.x - mid) < 0.3 && (d.lv || 0) === g.lv); }
      else { A = W.cellAt(g.at - 0.35, my, mid); B = W.cellAt(g.at + 0.35, my, mid); box = [g.at - 0.15, g.y0, g.a, g.at + 0.15, g.y1, g.b]; door = W.doors.find(d => d.axis === 'z' && Math.abs(d.x - g.at) < 0.2 && Math.abs(d.z - mid) < 0.3 && (d.lv || 0) === g.lv); }
      if (!door && W.main && g.ax === 'x' && Math.abs(g.at - W.main.z) < 0.2 && Math.abs(mid - W.main.x) < 0.3) door = { get angle() { return W.main.open; } };
      Rr.addPortal(A, B, box, door);
    }
    for (const p of W.extraPortals || []) Rr.addPortal(p[0], p[1], p[2], p[3]);
    ct.push(performance.now());
    // everything that moves uses the same shader, lit by a probe, and is drawn only with its room
    const skip = new Set([W.sky, W.ghost]);
    for (const o of scene.children.slice()) {
      if (o.isLight || o.isCamera || skip.has(o) || o.userData.noTrack || o.userData.cell !== undefined || o.userData.merged) continue;
      if (o.isMesh && o.material === hitMat) continue;
      Rr.convertDynamic(o);
      const d = W.doors.find(dd => dd.pivot === o);
      if (d) { const n = d.axis === 'x' ? [0, 0.45] : [0.45, 0], y = (d.y || 0) + 1; Rr.track(o, [W.cellAt(d.center.x - n[0], y, d.center.z - n[1]), W.cellAt(d.center.x + n[0], y, d.center.z + n[1])]); }
      else if (!o.isGroup || o.children.some(c => c.material !== hitMat)) Rr.track(o);
    }
    ct.push(performance.now()); Rr.stats.compileT = ct.slice(1).map((x, i) => Math.round(x - ct[i]));
    W.rayTargets = W.rayTargets.filter(m => m.userData.inter);
    W.batchInfo = { merged: st.meshes, drawCalls: st.calls, tris: st.tris, ms: st.ms };
  };

  /* ================= new areas: basement, terrace, backyard, front yard ================= */
  function outM(o) { const m = std(Object.assign({ emissive: 0x03050a }, o)); if (o.color !== undefined) m.color.convertSRGBToLinear(); return m; } // hex colours are authored in sRGB // moonlit outdoor surfaces
  function stairSteps(st, mat, n) {
    const L = st.axis === 'x' ? st.x1 - st.x0 : st.z1 - st.z0;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, top = st.yLo + t1 * (st.yHi - st.yLo);
      let a0, a1; // along-axis span of this step
      if (st.topAtMin) { a1 = (st.axis === 'x' ? st.x1 : st.z1) - t0 * L; a0 = a1 - L / n; }
      else { a0 = (st.axis === 'x' ? st.x0 : st.z0) + t0 * L; a1 = a0 + L / n; }
      const g = st.axis === 'x' ? boxGeo(a0, a1, st.yLo, top, st.z0, st.z1) : boxGeo(st.x0, st.x1, st.yLo, top, a0, a1);
      add(new THREE.Mesh(worldUV(g, 1.2, 1.2), mat));
    }
  }
  function extraWalls(list, mat) { const m = new THREE.Mesh(merge(list), mat); add(m); return m; }
  function withWalls(list, base, top, fn) { const pg = WALLGEOS, pb = WB, pt = WT; WALLGEOS = list; WB = base; WT = top; fn(); WALLGEOS = pg; WB = pb; WT = pt; }
  function plainBox(x0, x1, y0, y1, z0, z1, mat, solid) { const m = new THREE.Mesh(worldUV(boxGeo(x0, x1, y0, y1, z0, z1), 2, 2), mat); m.castShadow = false; m.receiveShadow = true; add(m); if (solid) solidBox(x0, x1, z0, z1); return m; }
  const YM = (key, o) => K.Yard && K.Yard.place(key, o, add); // a library model (yard.js), or null: then the old shapes are built
  function yardLantern(x, yTop, z, h) { // a hanging iron lantern with a live flame and warm baked light
    const g = YM('lantern', { x, y: yTop - h, z, h, ry: x }); if (!g) return;
    const fm = K.Props.X.flameM || new THREE.MeshBasicMaterial({ map: W._flame || (W._flame = K.makeFlameTex()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide });
    const fy = yTop - h * 0.68, f = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.14), fm); f.position.set(x, fy, z); f.userData.dyn = true; f.id2 = W.extraFlames.length; add(f);
    const f2 = f.clone(); f2.rotation.y = Math.PI / 2; f.add(f2); f2.position.set(0, 0, 0); W.extraFlames.push(f);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: W._lanternGlow || (W._lanternGlow = K.makeGlowTex('rgba(255,190,110,0.85)', 'rgba(255,130,50,0.18)')), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.set(0.7, 0.7, 1); sp.position.set(x, fy, z); sp.userData.dyn = true; add(sp);
    if (K.R) K.R.addLight({ x, y: fy, z, col: [0.5, 0.27, 0.09], range: 4.2, decay: 1.8, flick: true, lv: LV });
  }
  function tree(x, z, h, canopy, trunkM, leafM) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, h, 10), trunkM); t.position.set(x, h / 2, z); add(t); solidCirc(x, z, 0.45);
    for (let i = 0; i < canopy.length; i++) { const [dx, dy, dz, r] = canopy[i]; const c = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafM); c.position.set(x + dx, h + dy, z + dz); c.scale.y = 0.75; add(c); }
  }

  function buildBasement() {
    LV = -1; const B = -3;
    const stoneM = std({ map: K.makeStoneTex(61), roughness: 0.95 });
    const floorM = std({ map: K.makeSlabTex(62), color: 0x8a8070, roughness: 0.95 });
    add(new THREE.Mesh(quadGeo(0, 6, 6, 14, B, 2.5), floorM));
    for (const [x0, x1, z0, z1] of [[0, 6, 6, 7.2], [0, 6, 12.4, 14], [0, 0.3, 7.2, 12.4], [1.5, 6, 7.2, 12.4]]) add(new THREE.Mesh(quadGeo(x0, x1, z0, z1, -0.02, 3, true), M.ceil));
    const sg = []; withWalls(sg, B, 0, () => { wallX(6, 0, 6); wallX(14, 0, 6); wallZ(0, 6, 14); wallZ(6, 6, 14); });
    extraWalls(sg, stoneM);
    stairSteps(W.stairs[0], M.dark, 15);
    solidBox(1.5, 1.62, 6.1, 12.4);                       // stair side, basement level
    LV = 0; solidBox(1.5, 1.62, 7.2, 12.5); solidBox(0.2, 1.62, 12.4, 12.52); LV = -1; // railing round the hole upstairs
    for (let i = 0; i < 6; i++) { const z = 7.4 + i * 1.0; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), M.dark); b.position.set(1.56, 0.45, z); b.userData.zone = 'house'; add(b); }
    const hr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 5.2), M.dark); hr.position.set(1.56, 0.92, 9.8); hr.userData.zone = 'house'; add(hr);
    // shelves of pickle jars (oorugai bharani) along the east wall
    const P = K.Props;
    P.rack({ x: 5.65, y: B, z: 9.3, w: 3.6, d: 0.45, h: 1.75, levels: [0.5225, 1.2225], ry: -Math.PI / 2 });
    solidBox(5.4, 5.9, 7.5, 11.1);
    const jg = new THREE.Group(); jg.userData.batch = true; add(jg);
    for (let i = 0; i < 5; i++) for (const [y, s] of [[B + 0.54, 1], [B + 1.24, 0.78]]) P.bharani(5.65, y, 7.8 + i * 0.68, s, jg);
    // clue painted on the wall above the jars
    const clue = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), std({ roughness: 0.9 })); clue.position.set(5.885, B + 2.1, 9.3); clue.rotation.y = -Math.PI / 2; add(clue);
    clue.userData.dyn = true; clue.userData.keepMat = true; W.clues.push({ pos: 3, mesh: clue, make: (d, p) => K.makeClueBoard('#5f574b', d, p) });
    hitBox(0.08, 0.66, 0.66, 5.86, B + 2.1, 9.3, { kind: 'clue', pos: 3 });
    // table with an old medicine tin (first syringe)
    P.table({ x: 3.6, y: B, z: 7.0, w: 1.0, d: 0.6, h: 0.77, mat: M.wood });
    solidBox(3.05, 4.15, 6.65, 7.35);
    prop(0.22, 0.08, 0.14, 3.95, B + 0.77, 6.95, P.X.tin, false);
    P.vessel('bottle', 3.2, B + 0.77, 7.15, 0.6, M.glassDark); P.lantern(4.0, B + 0.77, 7.2);
    // trunks, sacks, a broken chair, cobwebs
    P.trunk({ x: 2.6, y: B, z: 13.55, w: 0.9, h: 0.5, d: 0.55 }); solidBox(2.15, 3.05, 13.275, 13.825);
    note(2.55, B + 0.502, 13.55, -0.3, 'search');
    P.trunk({ x: 3.2, y: B, z: 12.4, w: 0.7, h: 0.45, d: 0.5, mat: M.teak }); solidBox(2.85, 3.55, 12.15, 12.65);
    for (const [x, z] of [[4.2, 9.2], [4.6, 9.8]]) { P.sack(x, B, z, 0.9, x); solidCirc(x, z, 0.3); }
    P.chair({ x: 2.6, y: B, z: 9.62, ry: 0, broken: true, mat: M.wood }); solidBox(2.375, 2.825, 9.375, 9.825);
    const web = std({ color: 0xd8d8d0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    for (const [x, z, ry] of [[0.35, 13.65, 0.8], [5.65, 13.65, -0.8], [5.65, 6.35, -2.4]]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), web); w.position.set(x, -0.45, z); w.rotation.set(0.6, ry, 0); add(w); }
    // hiding wardrobe
    almirah(3.7, 4.9, 13.35, 13.9, [0, -1], M.teak, B);
    addHide({ id: 'base-wardrobe', type: 'almirah', lv: -1, cam: { x: 4.3, y: B + 1.5, z: 13.73, yaw: 0 }, exit: { x: 4.3, z: 12.8 }, hit: hitBox(1.22, 2.1, 0.58, 4.3, B + 1.05, 13.62, null) });
    P.bulb(3.5, 0, 10.5, 0.52);
    LV = 0;
  }

  function buildTerrace() {
    LV = 1; const T4 = W.FLOOR['1'];
    const slabM = outM({ map: K.makeSlabTex(71), color: 0xd2cec8, roughness: 0.95 });
    const parM = outM({ map: K.makeWallTex(72, '#a49779'), roughness: 0.95 });
    const tg = [];
    for (const [x0, x1, z0, z1] of [[0, 24, 0, 7.9], [0, 24, 12.1, 20], [0, 8.9, 7.9, 12.1], [15.1, 24, 7.9, 12.1]]) tg.push(quadGeo(x0, x1, z0, z1, T4, 2.5));
    add(new THREE.Mesh(merge(tg), slabM));
    // slab edges seen from the yards and the courtyard
    const eg = [];
    for (const b of [[0, 24, -0.1, 0.1], [0, 24, 19.9, 20.1], [-0.1, 0.1, 0, 20], [23.9, 24.1, 0, 20], [8.9, 15.1, 7.8, 8.0], [8.9, 15.1, 12.0, 12.2], [8.8, 9.0, 7.9, 12.1], [15.0, 15.2, 7.9, 12.1]]) eg.push(worldUV(boxGeo(b[0], b[1], HT, T4, b[2], b[3]), 2, HT));
    add(new THREE.Mesh(merge(eg), parM));
    // parapets round the roof and the open courtyard
    const pg = [];
    withWalls(pg, T4, T4 + 1.0, () => { wallX(0, 0, 24, [{ c: 21.65, w: 1.5, h: 9 }]); wallX(20, 0, 24); wallZ(0, 0, 20); });
    withWalls(pg, T4, T4 + 0.9, () => { wallX(7.9, 8.9, 15.1); wallX(12.1, 8.9, 15.1); wallZ(8.9, 7.9, 12.1); wallZ(15.1, 7.9, 12.1); });
    // terrace room (maadi arai)
    withWalls(pg, T4, T4 + 2.6, () => { wallX(15, 0.4, 5.0, [{ c: 2.7, w: 0.9, h: 2.1 }]); wallX(19.6, 0.4, 5.0); wallZ(0.4, 15, 19.6); wallZ(5.0, 15, 19.6); });
    extraWalls(pg, parM);
    plainBox(0.25, 5.15, T4 + 2.6, T4 + 2.78, 14.85, 19.75, slabM, false);
    add(new THREE.Mesh(quadGeo(0.5, 4.9, 15.1, 19.5, T4 + 2.58, 3, true), M.ceil));
    W.doorById.troom = makeDoor({ id: 'troom', axis: 'x', x: 2.7, z: 15, w: 0.9, swing: 1, y: T4, seed: 59 });
    // cot to hide under, table with the second syringe, a trunk
    K.Props.cot({ x: 2.0, y: T4, z: 18.9, w: 2.0, d: 1.1, sheet: K.Props.X.sheetBlue });
    solidBox(1.0, 3.0, 18.35, 19.45);
    addHide({ id: 'troom-cot', type: 'cot', lv: 1, cam: { x: 2.0, y: T4 + 0.24, z: 18.75, yaw: 0 }, exit: { x: 2.0, z: 17.6 }, hit: hitBox(2.0, 0.5, 1.1, 2.0, T4 + 0.25, 18.9, null) });
    K.Props.table({ x: 4.3, y: T4, z: 16.0, w: 0.6, d: 0.5, h: 0.62, legR: 0.026 }); solidBox(4.0, 4.6, 15.75, 16.25);
    K.Props.trunk({ x: 4.4, y: T4, z: 19.0, w: 0.8, h: 0.5, d: 0.5 }); solidBox(4.0, 4.8, 18.75, 19.25);
    note(4.35, T4 + 0.502, 19.0, 0.4, 'valli');
    // black water tank with a red digit on it
    const tankM = outM({ color: 0x18181b, roughness: 0.92 });
    prop(1.8, 0.35, 1.8, 19.8, T4, 3.2, slabM);
    cyl(0.75, 0.78, 1.45, 19.8, T4 + 0.35, 3.2, tankM, 20, 0); solidCirc(19.8, 3.2, 0.95);
    cyl(0.32, 0.32, 0.1, 19.8, T4 + 1.8, 3.2, tankM, 14);
    const tc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), std({ roughness: 0.6 })); tc.position.set(19.02, T4 + 1.05, 3.2); tc.rotation.y = -Math.PI / 2; add(tc);
    tc.userData.dyn = true; tc.userData.keepMat = true; W.clues.push({ pos: 2, mesh: tc, make: (d, p) => K.makeClueBoard('#18181a', d, p) });
    hitBox(0.08, 0.66, 0.66, 19.0, T4 + 1.05, 3.2, { kind: 'clue', pos: 2 });
    // clothesline with a drying saree and veshti
    for (const x of [8.5, 15.5]) cyl(0.03, 0.03, 2.0, x, T4, 16.6, M.iron, 6, 0.12);
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 7, 4), M.iron); wire.rotation.z = Math.PI / 2; wire.position.set(12, T4 + 1.95, 16.6); add(wire);
    W.clothes = [];
    for (const [x, w, col] of [[10.6, 2.4, 0x7a1e2a], [13.9, 1.6, 0xd8d2c0]]) {
      const cl = new THREE.Group(); cl.position.set(x, T4 + 1.95, 16.6); add(cl);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.3, 6, 4), outM({ color: col, side: THREE.DoubleSide, roughness: 1 })); m.position.y = -0.65; cl.add(m);
      cl.userData.dyn = true; W.clothes.push(cl);
    }
    // plants, an old chair, a TV antenna
    const pot = outM({ color: 0x7d3b1e, roughness: 0.9 }), green = outM({ color: 0x2f5a24, roughness: 0.8 });
    for (const [x, z] of [[2, 2], [6.5, 1], [23, 18.6], [16.5, 19.2]]) {
      if (YM('banana', { x, y: T4, z, h: 1.1, ry: x + z, sink: 0 })) { solidCirc(x, z, 0.25); continue; } // a banana sapling in its pot
      cyl(0.2, 0.15, 0.35, x, T4, z, pot, 10, 0.25); const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), green); l.position.set(x, T4 + 0.55, z); add(l);
    }
    prop(0.5, 0.45, 0.5, 6.5, T4, 13.5, M.wood); prop(0.5, 0.5, 0.05, 6.5, T4 + 0.45, 13.27, M.wood, false);
    cyl(0.025, 0.025, 2.6, 10.5, T4, 1.0, M.iron, 6, 0.1);
    for (const [y, w] of [[2.2, 1.2], [2.45, 0.9], [2.6, 0.6]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, w, 4), M.iron); b.rotation.z = Math.PI / 2; b.position.set(10.5, T4 + y, 1.0); add(b); }
    LV = 0;
  }

  function buildBackyard() {
    LV = 0;
    const soilM = outM({ map: K.makeSoilTex(81), roughness: 1 });
    const s1 = new THREE.Mesh(quadGeo(-0.2, 46.2, -10.2, 0, 0, 6), soilM); add(s1);
    const cwM = outM({ map: K.makeWallTex(83, '#857a63'), roughness: 1 });
    const cg = [];
    withWalls(cg, 0, 2.4, () => { wallX(-10, 0, 46); wallZ(0, -10, 0); wallZ(46, -10, 0); });
    extraWalls(cg, cwM);
    const stepM = outM({ color: 0x6e6b66, roughness: 0.9 });
    plainBox(6.0, 7.0, 0, 0.06, -0.7, -0.1, stepM, false);
    // the outside staircase to the terrace, with a landing and a closed store beneath it
    stairSteps(W.stairs[1], stepM, 20);
    plainBox(20.8, 22.45, 0, 3.75, -1.45, -0.1, cwM, true);
    plainBox(20.8, 22.45, 3.75, 4.0, -1.45, 0.0, stepM, false);
    add(new THREE.Mesh(quadGeo(20.8, 22.45, -1.45, 0, 4.0, 1.5), stepM));
    solidBox(13.6, 20.8, -1.5, -1.38);                                                   // stair rail (ground side)
    LV = 1; solidBox(13.6, 20.85, -1.5, -1.38); solidBox(20.8, 22.55, -1.55, -1.42); solidBox(22.45, 22.58, -1.55, 0.05); LV = 0;
    for (let i = 0; i <= 12; i++) { const x = 13.6 + i * 0.6, y = Math.min(4.0, (x - 13.6) / 7.2 * 4.0); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 5), M.iron); b.position.set(x, y + 0.47, -1.42); add(b); }
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 8.25, 6), M.iron); rail.position.set(17.2, 2.0 + 0.95, -1.42); rail.rotation.z = Math.PI / 2 - Math.atan2(4.0, 7.2); add(rail);
    for (const [x0, x1, z0, z1] of [[20.8, 22.5, -1.48, -1.44], [22.47, 22.51, -1.48, 0]]) plainBox(x0, x1, 4.0, 4.95, z0, z1, M.iron, false);
    // neem tree, coconut palm, banana plants
    const bark = outM({ color: 0x3a2c22, roughness: 1 }), leafM = outM({ color: 0x1f3a1c, roughness: 0.9 });
    if (YM('tree', { x: 4, z: -6.5, h: 5.8, ry: 0.5 })) solidCirc(4, -6.5, 0.45);
    else tree(4, -6.5, 3.4, [[0, 0.6, 0, 1.9], [1.2, 0.2, 0.6, 1.4], [-1.1, 0.3, -0.5, 1.5], [0.3, 1.4, -0.4, 1.3], [-0.4, 0.9, 1.1, 1.2]], bark, leafM);
    if (YM('palm', { x: 11.5, z: -8.6, h: 7.8, ry: 2.0 })) solidCirc(11.5, -8.6, 0.3);
    else {
      const palm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 7.2, 8), bark); palm.position.set(11.5, 3.6, -8.6); palm.rotation.z = 0.06; add(palm); solidCirc(11.5, -8.6, 0.3);
      const frond = outM({ color: 0x2a4a22, side: THREE.DoubleSide, roughness: 0.9 });
      for (let i = 0; i < 8; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.6), frond); const a = i / 8 * Math.PI * 2; f.position.set(11.1 + Math.cos(a) * 1.0, 7.0, -8.6 + Math.sin(a) * 1.0); f.rotation.set(Math.PI / 2 - 0.5, 0, 0); f.rotation.order = 'YXZ'; f.rotation.y = -a + Math.PI / 2; add(f); }
    }
    const banana = outM({ color: 0x2f5a26, side: THREE.DoubleSide, roughness: 0.8 });
    for (const [x, z] of [[22.9, -3.2], [22.8, -5.3]]) {
      if (YM('banana', { x, z, h: 1.9, ry: x * 2.3 + z })) { solidCirc(x, z, 0.25); continue; } // its pot stays under the soil
      cyl(0.12, 0.15, 1.8, x, 0, z, leafM, 8, 0.25); for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.5), banana); const a = i / 5 * Math.PI * 2; l.position.set(x + Math.cos(a) * 0.5, 2.0, z + Math.sin(a) * 0.5); l.rotation.set(-0.9, -a + Math.PI / 2, 0, 'YXZ'); add(l); }
    }
    // behind the second wing: more palms and trees, dead trees, rocks and ferns along the wall
    if (K.Yard && K.Yard.ready) {
      for (const [k, x, z, h, ry, r] of [['palm', 33, -8.7, 8.4, 0.7, 0.3], ['tree', 38.5, -6.2, 6.2, 2.6, 0.45], ['deadTree', 27.4, -8.4, 5.0, 0.4, 0.3], ['deadTreeM', 44.3, -8.9, 4.2, 2.2, 0.25], ['banana', 44.8, -2.6, 1.9, 1.0, 0.25], ['banana', 44.6, -4.4, 1.7, 2.4, 0.25]]) {
        YM(k, { x, z, h, ry }); solidCirc(x, z, r);
      }
      for (const [k, x, z, s, ry] of [['stone', 25.4, -9.4, 0.42, 0.3], ['fern', 30.2, -9.5, 0.8, 1.1], ['fern', 35.8, -9.4, 0.7, 2.0], ['stone', 41.6, -9.5, 0.5, 2.7], ['fern', 45.2, -6.6, 0.75, 0.6], ['stone', 1.0, -9.4, 0.38, 1.4], ['fern', 2.2, -9.5, 0.6, 2.9], ['fern', 9.0, -9.5, 0.55, 0.2]]) {
        YM(k, { x, z, s, ry, sink: k === 'stone' ? 0.08 : 0 });
      }
    }
    // cattle shed: posts, sloping thatch, trough, hay to hide in, a shelf with the matchbox
    const thatch = outM({ map: K.makeThatchTex(84), side: THREE.DoubleSide, roughness: 1 });
    for (const x of [14.7, 18.5, 22.3]) { cyl(0.08, 0.1, 2.55, x, 0, -6.3, bark, 8, 0.14); }
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    add(quad4([V(14.3, 2.5, -6.0), V(22.7, 2.5, -6.0), V(22.7, 3.0, -10.0), V(14.3, 3.0, -10.0)], thatch, 4, 2));
    plainBox(15.4, 17.6, 0, 0.5, -9.75, -9.15, stepM, true);
    note(16.1, 0.502, -9.45, 0.25, 'night');
    plainBox(17.3, 18.7, 1.0, 1.04, -9.85, -9.55, M.wood, false);
    for (const x of [17.4, 18.6]) plainBox(x - 0.02, x + 0.02, 0.6, 1.0, -9.84, -9.8, M.wood, false);
    const hayM = outM({ map: K.makeThatchTex(85), color: 0xc9a85a, roughness: 1 });
    for (const [dx, dz, r] of [[0, 0, 1.0], [0.7, 0.4, 0.75], [-0.6, 0.3, 0.7], [0.2, -0.5, 0.8]]) { const h = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), hayM); h.scale.y = 0.75; h.position.set(20.6 + dx, r * 0.55, -8.7 + dz); add(h); }
    solidCirc(20.6, -8.7, 1.05);
    addHide({ id: 'hay', type: 'hay', lv: 0, cam: { x: 20.6, y: 0.85, z: -8.3, yaw: Math.PI }, exit: { x: 20.6, z: -7.1 }, hit: hitBox(2.0, 1.5, 1.8, 20.6, 0.7, -8.6, null) });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 16), M.dark); wheel.position.set(14.9, 0.55, -9.7); wheel.rotation.y = 0.2; add(wheel);
    // washing stone and pots by the back door
    plainBox(8.0, 9.2, 0, 0.35, -1.6, -1.0, M.granite, true);
    for (const [x, z] of [[9.6, -0.6], [9.9, -1.1]]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), M.copper); k.position.set(x, 0.17, z); add(k); }
    // stepping stones to the shed
    const flat = outM({ color: 0x5c5955, roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = 6.6 + t * 9.6 + Math.sin(i) * 0.2, z = -1.4 - t * 4.2;
      if (YM('stoneFlat', { x, z, s: 0.3, sink: 0.15, ry: i * 1.7 })) continue;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.04, 9), flat); st.position.set(x, 0.02, z); add(st);
    }
    // an iron lantern burning on the washing stone
    if (YM('lanternStand', { x: 8.35, y: 0.35, z: -1.4, h: 0.42, ry: 0.5 })) {
      const fm = K.Props.X.flameM || new THREE.MeshBasicMaterial({ map: W._flame || (W._flame = K.makeFlameTex()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide });
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.1), fm); f.position.set(8.35, 0.35 + 0.17, -1.4); f.userData.dyn = true; f.id2 = W.extraFlames.length; add(f);
      const f2 = f.clone(); f2.rotation.y = Math.PI / 2; f.add(f2); f2.position.set(0, 0, 0); W.extraFlames.push(f);
      if (K.R) K.R.addLight({ x: 8.35, y: 0.6, z: -1.5, col: [0.42, 0.23, 0.08], range: 3.6, decay: 1.8, flick: true, lv: 0 });
    }
    addWindow(3.5, 0, 0, -1); addWindow(10, 0, 0, -1);
  }

  function buildFrontyard() {
    LV = 0;
    const soilM = outM({ map: K.makeSoilTex(91), roughness: 1 });
    add(new THREE.Mesh(quadGeo(-0.2, 46.2, 20, 28.2, 0, 6), soilM));
    const road = new THREE.Mesh(quadGeo(-6, 52, 28.2, 40, -0.01, 4), outM({ color: 0x1d1c1b, roughness: 1 })); add(road);
    const cwM = outM({ map: K.makeWallTex(93, '#857a63'), roughness: 1 });
    const cg = [];
    withWalls(cg, 0, 2.4, () => { wallZ(0, 20, 28); wallZ(46, 20, 28); wallX(28, 0, 46, [{ c: 12, w: 2.4, h: 9 }]); });
    extraWalls(cg, cwM);
    for (const x of [10.55, 13.45]) { plainBox(x - 0.3, x + 0.3, 0, 2.8, 27.7, 28.3, cwM, true); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), cwM); ball.position.set(x, 3.0, 28); add(ball); }
    // iron gate, swung half open
    W.gate = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(12 + s * 1.2, 0, 28); add(g); g.rotation.y = s * 1.1;
      for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 5), M.iron); b.position.set(-s * (0.08 + i * 0.16), 1.05, 0); g.add(b); }
      for (const y of [0.25, 1.0, 1.95]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.04), M.iron); r.position.set(-s * 0.58, y, 0); g.add(r); }
      g.userData.dyn = true; W.gate.push(g);
    }
    W.gateZone = { x0: 10.9, x1: 13.1, z: 27.7 };
    // thinnai: raised platforms either side of the door, under a tiled awning
    const thM = outM({ color: 0x6b5a48, roughness: 0.9 });
    plainBox(6.6, 10.6, 0, 0.45, 20.1, 21.3, thM, true); plainBox(13.4, 17.4, 0, 0.45, 20.1, 21.3, thM, true);
    for (const x of [6.9, 10.4, 13.6, 17.1]) cyl(0.09, 0.11, 2.55, x, 0.45, 21.15, M.teak, 10, 0.14);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    add(quad4([V(6.4, 3.25, 20.05), V(17.6, 3.25, 20.05), V(17.6, 2.95, 21.6), V(6.4, 2.95, 21.6)], M.roof, 8, 1));
    // a kolam at the door, tulasi maadam, a mango tree, a bicycle
    const kol = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({ map: K.makeKolamTex(null, 0), transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); kol.rotation.x = -Math.PI / 2; kol.position.set(12, 0.012, 22.2); add(kol);
    prop(0.5, 0.85, 0.5, 8.6, 0, 24.4, outM({ color: 0x8a7a68, roughness: 0.9 }));
    if (!YM('tulasi', { x: 8.6, y: 0.85, z: 24.4, h: 0.6, ry: 0.8 })) for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), outM({ color: 0x2f5a24 })); l.position.set(8.6 + (Math.random() - 0.5) * 0.3, 1.0 + Math.random() * 0.25, 24.4 + (Math.random() - 0.5) * 0.3); add(l); }
    const bark = outM({ color: 0x3a2c22, roughness: 1 }), leafM = outM({ color: 0x1d361a, roughness: 0.9 });
    if (YM('tree', { x: 4.2, z: 24.5, h: 5.2, ry: 3.6 })) solidCirc(4.2, 24.5, 0.45);
    else tree(4.2, 24.5, 3.0, [[0, 0.5, 0, 1.8], [1.0, 0.1, 0.5, 1.3], [-1.0, 0.3, -0.4, 1.3], [0.2, 1.2, 0.2, 1.2]], bark, leafM);
    // lanterns under the thinnai awning, and the empty east half of the yard: trees, a palm, a dead tree, rocks, ferns
    if (K.Yard && K.Yard.ready) {
      yardLantern(9.9, 3.1, 20.75, 0.95); yardLantern(14.1, 3.1, 20.75, 0.95);
      for (const [k, x, z, h, ry, r] of [['tree', 22.0, 25.6, 5.6, 1.2, 0.45], ['palm', 30.5, 26.9, 8.0, 2.8, 0.3], ['deadTree', 43.6, 26.3, 5.2, 3.9, 0.3], ['banana', 35.0, 21.0, 1.9, 0.7, 0.25], ['banana', 36.6, 20.9, 1.6, 2.1, 0.25], ['deadTreeM', 26.0, 21.2, 4.0, 1.0, 0.25]]) {
        YM(k, { x, z, h, ry }); solidCirc(x, z, r);
      }
      for (const [k, x, z, s, ry] of [['fern', 18.8, 27.4, 0.75, 0.4], ['stone', 25.2, 27.5, 0.45, 1.9], ['fern', 39.4, 27.4, 0.8, 2.4], ['stone', 45.2, 21.0, 0.5, 0.8], ['fern', 45.0, 23.6, 0.7, 1.6], ['fern', 1.0, 27.3, 0.6, 3.0], ['stone', 6.4, 27.5, 0.36, 2.2]]) {
        YM(k, { x, z, s, ry, sink: k === 'stone' ? 0.08 : 0 });
      }
    }
    const bike = new THREE.Group(); bike.position.set(0.5, 0, 22.5); bike.rotation.y = Math.PI / 2; add(bike); bike.userData.batch = true;
    for (const x of [-0.5, 0.5]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 5, 16), M.iron); w.position.set(x, 0.33, 0); bike.add(w); }
    for (const [x, y, l, r] of [[0, 0.55, 0.9, 0.2], [-0.25, 0.6, 0.55, -0.9], [0.3, 0.6, 0.55, 0.9]]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, l, 5), M.iron); f.position.set(x, y, 0); f.rotation.z = Math.PI / 2 + r; bike.add(f); }
    solidBox(0.2, 0.8, 21.8, 23.2);
  }

  /* ================= the second courtyard wing (irandaam kattu), two floors ================= */
  W.powerGlows = []; W.wing = {};
  function nicheLamp(x, y, z, nx, nz) { // a clay agal in a wall niche: small flame, warm baked light
    const P = K.Props;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = Math.atan2(nx, nz); g.userData.batch = true; add(g);
    const niche = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.06), M.soot); niche.position.set(0, 0.12, -0.02); g.add(niche);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.16), M.plaster); shelf.position.set(0, -0.09, 0.05); g.add(shelf);
    const diya = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.04, 0.003], [0.06, 0.02], [0.065, 0.035], [0.055, 0.03], [0.001, 0.02]].map(p => new THREE.Vector2(p[0], p[1])), 12), M.clay); diya.position.set(0, -0.07, 0.06); g.add(diya);
    const fm = K.Props.X.flameM || new THREE.MeshBasicMaterial({ map: W._flame || (W._flame = K.makeFlameTex()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.1), fm); f.position.set(x + Math.sin(g.rotation.y) * 0.06, y - 0.01, z + Math.cos(g.rotation.y) * 0.06); f.userData.dyn = true; f.id2 = W.extraFlames.length; add(f);
    const f2 = f.clone(); f2.rotation.y = Math.PI / 2; f.add(f2); f2.position.set(0, 0, 0); W.extraFlames.push(f);
    if (K.R) K.R.addLight({ x: x + nx * 0.3, y: y + 0.05, z: z + nz * 0.3, col: [0.5, 0.27, 0.09], range: 4.2, decay: 1.8, flick: true, lv: LV });
  }
  function powerBulb(x, yTop, z, lv) { // electric bulbs: dark until the fuses are back
    K.Props.bulb(x, yTop, z, 0.55);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: W._bulbGlow || (W._bulbGlow = K.makeGlowTex('rgba(255,236,190,0.9)', 'rgba(255,190,110,0.25)')), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.scale.set(0.9, 0.9, 1); sp.position.set(x, yTop - 0.62, z); sp.visible = false; sp.userData.dyn = true; add(sp); W.powerGlows.push(sp);
    if (K.R) K.R.addLight({ x, y: yTop - 0.6, z, col: [1, 1, 1], range: 6.5, decay: 1.6, group: 4, gi: 0.9, lv, noOcc: false });
  }
  function upperPillar(x, z) {
    const g = new THREE.Group(); g.userData.batch = true; add(g);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 3.2, 14), M.dark); c.position.set(x, 4.0 + 1.6, z); g.add(c);
    for (const y of [4.25, 6.95]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), M.brass); r.position.set(x, y, z); g.add(r); }
    LV = 1; solidCirc(x, z, 0.24); LV = 0;
  }
  function railing(x0, z0, x1, z1, y, lv) { // balusters and a handrail along a line
    const g = new THREE.Group(); g.userData.batch = true; add(g);
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.28));
    const bgeo = K.Props.legGeo(0.86, 0.022, 6);
    for (let i = 0; i <= n; i++) { const t = i / n, b = new THREE.Mesh(bgeo, M.dark); b.position.set(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t); g.add(b); }
    const hr = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.07, 0.09), M.teak); hr.position.set((x0 + x1) / 2, y + 0.9, (z0 + z1) / 2); hr.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(hr);
    const br = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.05, 0.08), M.teak); br.position.set((x0 + x1) / 2, y + 0.03, (z0 + z1) / 2); br.rotation.y = hr.rotation.y; g.add(br);
  }
  function buildWing() {
    const P = K.Props, X = P.X, F = M.floors, T4 = W.FLOOR[1], T7 = T4 + 3.2;
    const slabM = W._slabM || (W._slabM = outM({ map: K.makeSlabTex(71), color: 0xd2cec8, roughness: 0.95 }));
    const parM = W._parM || (W._parM = outM({ map: K.makeWallTex(72, '#a49779'), roughness: 0.95 }));
    LV = 0;
    // ---------- ground floor: floors, light-well, ceiling, beams
    for (const [x0, x1, z0, z1, m] of [
      [24, 28, 5, 15, F.diamond], [24, 31, 0, 5, F.red], [31, 39, 0, 5, F.ringsB], [39, 46, 0, 5, F.checker], [42, 46, 5, 15, F.diamondB],
      [24, 36, 15, 20, F.rings], [36, 46, 15, 20, F.diamond], [28, 42, 5, 7.5, F.rings], [28, 42, 12.5, 15, F.rings], [28, 31, 7.5, 12.5, F.rings], [39, 42, 7.5, 12.5, F.rings]
    ]) add(new THREE.Mesh(quadGeo(x0, x1, z0, z1, 0, 1.2), m));
    add(new THREE.Mesh(quadGeo(31, 39, 7.5, 12.5, 0, 2.0), M.granite));
    for (const [x0, x1, z0, z1] of [[30.9, 39.1, 7.4, 7.55], [30.9, 39.1, 12.45, 12.6], [30.9, 31.05, 7.5, 12.5], [38.95, 39.1, 7.5, 12.5]]) add(new THREE.Mesh(boxGeo(x0, x1, 0, 0.05, z0, z1), M.granite));
    const openings = [[24, 46, 0, 7.5], [24, 46, 12.5, 15], [24, 31, 7.5, 12.5], [39, 46, 7.5, 12.5]];
    const cg = []; for (const [x0, x1, z0, z1] of openings.concat([[24, 26.4, 15, 20], [31.4, 46, 15, 20], [26.4, 31.4, 15, 18.6]])) cg.push(quadGeo(x0, x1, z0, z1, HT, 3, true));
    add(new THREE.Mesh(merge(cg), M.ceil));
    const bg = [];
    const beam = (x, z0, z1, y) => { if (x > 26.4 && x < 31.4 && y < 4 && z1 > 18.6) { if (z0 < 18.55) bg.push(boxGeo(x - 0.09, x + 0.09, y - 0.2, y, z0, 18.55)); return; } bg.push(boxGeo(x - 0.09, x + 0.09, y - 0.2, y, z0, z1)); };
    for (const y of [HT, T7]) for (let x = 25; x < 46; x += 2) { if (x > 30.5 && x < 39.5) { beam(x, 0, 7.4, y); beam(x, 12.6, 20, y); } else beam(x, 0, 20, y); }
    add(new THREE.Mesh(merge(bg), M.dark));
    // slab edges around the light-well and the stair hole
    const eg = [];
    for (const b of [[31, 39, 7.4, 7.5], [31, 39, 12.5, 12.6], [30.9, 31, 7.4, 12.6], [39, 39.1, 7.4, 12.6]]) { eg.push(worldUV(boxGeo(b[0], b[1], HT, T4, b[2], b[3]), 2, 2)); eg.push(worldUV(boxGeo(b[0], b[1], T7, T7 + 0.4, b[2], b[3]), 2, 2)); }
    eg.push(worldUV(boxGeo(26.4, 31.4, HT, T4, 18.5, 18.6), 2, 2), worldUV(boxGeo(26.3, 26.4, HT, T4, 18.6, 20), 2, 2));
    add(new THREE.Mesh(merge(eg), M.plaster));
    // ---------- ground floor walls
    const wg = [];
    withWalls(wg, 0, HT, () => {
      wallX(0, 24, 46); wallX(20, 24, 46); wallZ(46, 0, 20);
      wallX(5, 24, 46, [{ c: 26, w: 1.2 }, { c: 35, w: 1.2 }, { c: 40.5, w: 1.0 }]);
      wallX(15, 24, 46, [{ c: 26, w: 1.6, h: 2.6 }, { c: 32, w: 1.6, h: 2.6 }, { c: 39, w: 1.2 }]);
      wallZ(28, 5, 15, [{ c: 10, w: 2.4, h: 2.8 }]); wallZ(42, 5, 15, [{ c: 10, w: 1.2 }]);
      wallZ(31, 0, 5); wallZ(39, 0, 5); wallZ(36, 15, 20);
    });
    extraWalls(wg, M.wall);
    for (const [x, z] of [[31, 7.5], [39, 7.5], [31, 12.5], [39, 12.5], [35, 7.5], [35, 12.5]]) { pillar(x, z); upperPillar(x, z); }
    // ---------- upper floor (maadi)
    LV = 1;
    for (const [x0, x1, z0, z1, m] of [
      [24, 28, 5, 15, F.checker], [42, 46, 5, 15, F.diamond], [24, 31, 0, 5, F.ringsB], [31, 38, 0, 5, F.diamondB], [38, 46, 0, 5, M.ceil],
      [24, 26.4, 15, 20, F.rings], [31.4, 35, 15, 20, F.rings], [26.4, 31.4, 15, 18.5, F.rings], [35, 46, 15, 20, F.checker],
      [28, 42, 5, 7.4, F.ringsB], [28, 42, 12.6, 15, F.ringsB], [28, 30.9, 7.4, 12.6, F.ringsB], [39.1, 42, 7.4, 12.6, F.ringsB]
    ]) add(new THREE.Mesh(quadGeo(x0, x1, z0, z1, T4, 1.2), m));
    const ug = [];
    withWalls(ug, T4, T7, () => {
      wallX(0, 24, 46); wallX(20, 24, 46); wallZ(46, 0, 20); wallZ(24, 0, 20, [{ c: 10, w: 1.0 }]);
      wallX(5, 24, 46, [{ c: 26, w: 1.0 }, { c: 34.5, w: 1.0 }, { c: 41, w: 1.0 }]);
      wallX(15, 24, 46, [{ c: 26, w: 1.6, h: 2.6 }, { c: 31, w: 1.4, h: 2.6 }, { c: 39, w: 1.0 }]);
      wallZ(28, 5, 15, [{ c: 10, w: 2.4, h: 2.8 }]); wallZ(42, 5, 15, [{ c: 10, w: 1.0 }]);
      wallZ(31, 0, 5); wallZ(38, 0, 5); wallZ(35, 15, 20);
    });
    extraWalls(ug, M.wall);
    const ucg = []; for (const [x0, x1, z0, z1] of openings) ucg.push(quadGeo(x0, x1, z0, z1, T7, 3, true));
    ucg.push(quadGeo(24, 46, 15, 20, T7, 3, true));
    add(new THREE.Mesh(merge(ucg.slice(0, 4).concat([quadGeo(24, 46, 15, 20, T7, 3, true)])), M.ceil));
    // the opening at the upper floor: railing, and nothing to walk on
    railing(31, 7.45, 39, 7.45, T4, 1); railing(31, 12.55, 39, 12.55, T4, 1); railing(30.95, 7.5, 30.95, 12.5, T4, 1); railing(39.05, 7.5, 39.05, 12.5, T4, 1);
    solidBox(30.9, 39.1, 7.38, 12.62);
    // stair hole railing upstairs
    railing(26.4, 18.47, 31.4, 18.47, T4, 1); railing(26.33, 18.55, 26.33, 19.95, T4, 1);
    solidBox(26.4, 31.4, 18.42, 18.55); solidBox(26.25, 26.4, 18.5, 19.95);
    // ---------- roof: slab, parapet, rim of the light-well
    const rg = []; for (const [x0, x1, z0, z1] of openings.concat([[24, 46, 15, 20]])) rg.push(quadGeo(x0, x1, z0, z1, T7 + 0.4, 2.5));
    add(new THREE.Mesh(merge(rg), slabM));
    const reg = []; for (const b of [[24, 46, -0.1, 0.1], [24, 46, 19.9, 20.1], [45.9, 46.1, 0, 20], [23.9, 24.1, 0, 20]]) reg.push(worldUV(boxGeo(b[0], b[1], T7, T7 + 0.4, b[2], b[3]), 2, 2));
    add(new THREE.Mesh(merge(reg), parM));
    const pgw = [];
    withWalls(pgw, T7 + 0.4, T7 + 1.2, () => { wallX(0, 24, 46); wallX(20, 24, 46); wallZ(46, 0, 20); wallZ(24, 0, 20); wallX(7.5, 31, 39); wallX(12.5, 31, 39); wallZ(31, 7.5, 12.5); wallZ(39, 7.5, 12.5); });
    extraWalls(pgw, parM);
    // ---------- stairs from the wedding hall
    LV = 0;
    stairSteps(W.stairs[2], M.dark, 18);
    plainBox(31.4, 31.52, 0, 3.6, 18.6, 19.8, M.dark, false);
    solidBox(26.9, 31.5, 18.46, 18.6); solidBox(31.35, 31.6, 18.55, 19.85);
    railing(26.9, 18.52, 31.4, 18.52, 0, 0);
    // ---------- doors
    for (const cfg of [
      { id: 'granary', axis: 'x', x: 26, z: 5, w: 1.2, swing: -1, lock: 'sickle', seed: 61 },
      { id: 'office', axis: 'x', x: 35, z: 5, w: 1.2, swing: -1, seed: 62 },
      { id: 'wash', axis: 'x', x: 40.5, z: 5, w: 1.0, swing: -1, seed: 63 },
      { id: 'sewing', axis: 'z', x: 42, z: 10, w: 1.2, swing: -1, seed: 64 },
      { id: 'feast', axis: 'x', x: 39, z: 15, w: 1.2, swing: 1, seed: 65 }
    ]) W.doorById[cfg.id] = makeDoor(cfg);
    LV = 1;
    for (const cfg of [
      { id: 'terraceDoor', axis: 'z', x: 24, z: 10, w: 1.0, swing: 1, y: T4, lock: 'bolt', seed: 66 },
      { id: 'thatha', axis: 'x', x: 26, z: 5, w: 1.0, swing: -1, y: T4, seed: 67 },
      { id: 'valli', axis: 'x', x: 34.5, z: 5, w: 1.0, swing: -1, y: T4, lock: 'valli', seed: 68 },
      { id: 'loft', axis: 'x', x: 41, z: 5, w: 1.0, swing: -1, y: T4, seed: 69 },
      { id: 'music', axis: 'x', x: 39, z: 15, w: 1.0, swing: 1, y: T4, seed: 70 },
      { id: 'library', axis: 'z', x: 42, z: 10, w: 1.0, swing: -1, y: T4, seed: 71 }
    ]) W.doorById[cfg.id] = makeDoor(cfg);
    // ---------- windows (both faces)
    LV = 0;
    for (const [x, z, nx, nz] of [[27.5, 0, 0, 1], [35, 0, 0, 1], [42.5, 0, 0, 1], [46, 2.5, -1, 0], [46, 10, -1, 0], [46, 17.5, -1, 0], [30, 20, 0, -1], [41, 20, 0, -1]]) { addWindow(x, z, nx, nz); addWindow(x, z, -nx, -nz); }
    LV = 1;
    for (const [x, z, nx, nz] of [[27.5, 0, 0, 1], [34.5, 0, 0, 1], [42, 0, 0, 1], [46, 10, -1, 0], [46, 2.5, -1, 0], [29, 20, 0, -1], [40.5, 20, 0, -1], [24, 3, 1, 0], [24, 17, 1, 0]]) { addWindow(x, z, nx, nz); addWindow(x, z, -nx, -nz); }
    LV = 0;
    // ---------- light: oil lamps below, electric bulbs (dark until the fuses are found) everywhere
    nicheLamp(24.12, 1.9, 7.2, 1, 0); nicheLamp(27.88, 1.9, 13.2, -1, 0); nicheLamp(41.88, 1.9, 6.6, -1, 0); nicheLamp(24.12, 1.9, 17.6, 1, 0);
    for (const [x, z] of [[26, 10], [29.5, 6.2], [40.5, 13.8], [35, 2.5], [30, 17], [41, 17.5], [44, 10], [27.5, 2.5], [42.5, 2.5]]) powerBulb(x, HT, z, 0);
    for (const [x, z] of [[26, 10], [29.5, 10], [40.5, 10], [27.5, 2.5], [34.5, 2.5], [42, 2.5], [30, 17.5], [40.5, 17.5], [44, 10]]) powerBulb(x, T7, z, 1);
    buildWingRooms();
    LV = 0;
  }
  function buildWingRooms() {
    const P = K.Props, X = P.X, T4 = W.FLOOR[1], WG = W.wing;
    const potted = (x, z, y = 0) => { const p = new THREE.Group(); p.userData.batch = true; add(p); const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 10), M.clay); pot.position.set(x, y + 0.175, z); p.add(pot); const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), M.leaf); l.position.set(x, y + 0.55, z); l.scale.y = 0.8; p.add(l); solidCirc(x, z, 0.24); };
    LV = 0;
    // ---- passage
    P.bench({ x: 27.6, z: 8.2, w: 1.6, ry: -Math.PI / 2 }); solidBox(27.3, 27.95, 7.4, 9.0);
    // ---- second courtyard: tulasi in the middle, the deep water tank by the east pillars
    P.tulasi(35, 10, M.plaster, M.leaf); solidBox(34.79, 35.21, 9.79, 10.21);
    WG.tank = P.tank({ x: 37.9, z: 10, w: 1.4, d: 1.4 }); solidBox(37.2, 38.6, 9.3, 10.7);
    WG.tankHit = hitBox(1.5, 1.2, 1.5, 37.9, 0.6, 10, { kind: 'tank' });
    WG.water = 0;
    for (const [x, z] of [[31.8, 8.2], [31.8, 11.8], [36.6, 8.0]]) potted(x, z);
    plainBox(29, 30.6, 0, 0.42, 14.3, 14.75, M.granite, true);
    // pipe from the wash-room pump to the tank, along the veranda ceiling
    {
      const pg = new THREE.Group(); pg.userData.batch = true; add(pg);
      const seg = (x0, y0, z0, x1, y1, z1) => { const l = Math.hypot(x1 - x0, y1 - y0, z1 - z0), m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, l, 8), M.iron); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize()); pg.add(m); };
      seg(39.6, 3.2, 5.0, 39.6, 3.2, 9.6); seg(39.6, 3.2, 9.6, 39.6, 2.2, 9.6); seg(39.6, 2.2, 9.6, 38.75, 1.35, 9.6); seg(38.75, 1.35, 9.6, 38.4, 1.35, 9.6);
    }
    // ---- paddy granary (door tied with rope)
    P.grainBin({ x: 25.0, z: 2.6, w: 1.7, d: 0.9, h: 1.8, ry: Math.PI / 2 }); solidBox(24.5, 25.5, 1.7, 3.5);
    P.grainBin({ x: 27.6, z: 0.55, w: 1.5, d: 0.9, h: 1.7 }); solidBox(26.85, 28.35, 0.1, 1.0);
    P.grainBin({ x: 30.4, z: 2.2, w: 1.4, d: 0.9, h: 1.6, ry: -Math.PI / 2 }); solidBox(29.95, 30.9, 1.5, 2.9);
    for (const [x, z, sc] of [[28.4, 2.6, 1], [29.0, 3.3, 0.9], [27.6, 3.4, 0.85], [29.4, 4.2, 0.8]]) { P.sack(x, 0, z, sc, x * 2); solidCirc(x, z, 0.32 * sc); }
    P.wallShelf(28.6, 1.3, 4.86, 0.9, 0.24, Math.PI);
    { const rope = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14), M.rope), d = W.doorById.granary; rope.position.set(1.05, 1.05, 0.06); rope.rotation.y = Math.PI / 2; d.pivot.add(rope); const r2 = rope.clone(); r2.position.z = -0.06; r2.rotation.x = 0.6; d.pivot.add(r2); WG.rope = [rope, r2]; }
    // ---- accounts room: desk, ledger, lantern (lit), Tamil numeral chart, the beam balance, the safe
    P.table({ x: 33.2, z: 1.0, w: 1.6, d: 0.8, h: 0.78 }); solidBox(32.4, 34.0, 0.6, 1.4);
    P.chair({ x: 33.2, z: 1.75, ry: Math.PI, arms: true }); solidBox(32.95, 33.45, 1.5, 2.0);
    { const b = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.26), X.spines[3]); b.position.set(32.8, 0.81, 1.05); b.rotation.y = 0.15; add(b); const b2 = b.clone(); b2.position.set(32.85, 0.87, 1.02); b2.rotation.y = -0.1; add(b2); }
    P.lantern(33.85, 0.78, 0.8); if (K.R) K.R.addLight({ x: 33.85, y: 1.05, z: 0.85, col: [0.42, 0.24, 0.08], range: 4.5, decay: 1.6, flick: true, lv: 0 });
    P.bookshelf({ x: 36.2, z: 0.28, w: 2.0 }); solidBox(35.2, 37.2, 0.05, 0.55);
    { const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), std({ map: K.makeNumeralChart(), roughness: 0.9 })); ch.position.set(31.115, 1.65, 2.6); ch.rotation.y = Math.PI / 2; add(ch); hitBox(0.08, 0.84, 0.64, 31.13, 1.65, 2.6, { kind: 'chart' }); }
    P.table({ x: 32.0, z: 4.3, w: 1.0, d: 0.55, h: 0.72 }); solidBox(31.5, 32.5, 4.0, 4.6);
    WG.scale = P.balance({ x: 32.0, y: 0.72, z: 4.2, ry: Math.PI }); WG.scaleHit = hitBox(0.9, 0.7, 0.5, 32.0, 1.05, 4.25, { kind: 'scale' });
    WG.scale.weights.forEach((m, i) => { m.position.set(31.6 + i * 0.095, 0.72 + m.geometry.parameters.height / 2, 4.47); m.userData.home = m.position.clone(); });
    WG.scaleTag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), std({ roughness: 0.9 })); WG.scaleTag.userData.keepMat = true; WG.scaleTag.userData.dyn = true; WG.scaleTag.position.set(0.0, -0.17, -0.08); WG.scaleTag.rotation.y = Math.PI; WG.scale.pans[0].add(WG.scaleTag);
    WG.safe = P.safe({ x: 38.6, z: 1.3, ry: -Math.PI / 2 }); solidBox(38.2, 38.98, 0.85, 1.75);
    WG.safeHit = hitBox(0.2, 1.3, 0.9, 38.17, 0.72, 1.3, { kind: 'safe' });
    // ---- wash room: pump motor, copper boiler, washing stone, hiding almirah
    WG.motor = P.motor({ x: 39.7, z: 4.4, ry: Math.PI }); solidBox(39.35, 40.05, 4.15, 4.75); WG.motorHit = hitBox(0.75, 0.55, 0.45, 39.7, 0.28, 4.4, { kind: 'motor' });
    P.vessel('boiler', 45.1, 0.364, 1.0, 1.2, M.copper); solidCirc(45.1, 1.0, 0.66);
    plainBox(41.6, 42.8, 0, 0.3, 0.15, 0.75, M.granite, true);
    for (let i = 0; i < 3; i++) P.vessel('kudam', 43.3 + i * 0.42, 0, 0.35, 1.1, M.copper);
    almirah(45.4, 45.95, 2.4, 3.6, [-1, 0]);
    addHide({ id: 'wash-almirah', type: 'almirah', cam: { x: 45.78, y: 1.5, z: 3.0, yaw: Math.PI / 2 }, exit: { x: 44.85, z: 3.0 }, hit: hitBox(0.58, 2.1, 1.22, 45.67, 1.05, 3.0, null) });
    // ---- sewing room
    P.sewing({ x: 45.0, z: 7.6, ry: -Math.PI / 2 }); solidBox(44.7, 45.3, 7.05, 8.15);
    P.chair({ x: 44.2, z: 7.6, ry: Math.PI / 2 }); solidBox(43.95, 44.45, 7.35, 7.85);
    P.rack({ x: 44.0, z: 14.62, w: 2.6, d: 0.45, h: 1.6, levels: [0.55, 1.15], ry: Math.PI }); solidBox(42.7, 45.3, 14.35, 14.9);
    { const cg = new THREE.Group(); cg.userData.batch = true; add(cg); const cols = [0x7a1e2a, 0x2a4a6a, 0xc9a046, 0x3a5a2a, 0xd8d2c0]; for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 10), std({ color: cols[i % 5], roughness: 1 })); r.rotation.z = Math.PI / 2; r.position.set(43.0 + (i % 4) * 0.62, i < 4 ? 0.68 : 1.28, 14.6); cg.add(r); } }
    almirah(45.4, 45.95, 10.8, 12.0, [-1, 0]);
    addHide({ id: 'sewing-wardrobe', type: 'almirah', cam: { x: 45.78, y: 1.5, z: 11.4, yaw: Math.PI / 2 }, exit: { x: 44.85, z: 11.4 }, hit: hitBox(0.58, 2.1, 1.22, 45.67, 1.05, 11.4, null) });
    P.trunk({ x: 42.6, z: 5.5, w: 0.9, h: 0.5, d: 0.55 }); solidBox(42.15, 43.05, 5.225, 5.775);
    // ---- wedding hall: fuse board, a lit kuthu vilakku, chairs, rolled mats
    WG.fuse = P.fusebox({ x: 24.12, y: 1.65, z: 16.4, ry: Math.PI / 2 }); WG.fuseHit = hitBox(0.12, 0.6, 0.7, 24.16, 1.65, 16.4, { kind: 'fusebox' });
    WG.fuses = 0; WG.power = false;
    { const v = W.kuthu(34.9, 0, 16.0, 1.5); v.flames.forEach(f => f.visible = true); W.extraLamps = (W.extraLamps || []).concat([v]); solidCirc(34.9, 16.0, 0.3); }
    P.bench({ x: 29.5, z: 15.55, w: 2.4 }); solidBox(28.3, 30.7, 15.3, 15.85);
    for (let i = 0; i < 3; i++) P.chair({ x: 35.3, y: i * 0.08, z: 19.3, ry: Math.PI + i * 0.1 });
    solidBox(35.0, 35.65, 19.0, 19.65);
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.4, 12), X.paai); m.rotation.x = Math.PI / 2; m.position.set(33.0 + i * 0.25, 0.11 + (i === 1 ? 0.18 : 0), 19.2); add(m); }
    solidBox(32.85, 33.6, 18.5, 19.9);
    // ---- feast hall: a long low table set with banana leaves, stools, a cauldron, a wardrobe to hide in
    P.table({ x: 41.0, z: 16.6, w: 7.0, d: 0.7, h: 0.32, legR: 0.04 }); solidBox(37.5, 44.5, 16.25, 16.95);
    for (let i = 0; i < 9; i++) { const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), M.leaf); lf.rotation.x = -Math.PI / 2; lf.position.set(37.9 + i * 0.78, 0.325, 16.6); add(lf); P.manai(37.9 + i * 0.78, 0, 17.4, 0, 0.42); }
    solidBox(37.6, 44.4, 17.2, 17.6);
    P.vessel('boiler', 45.2, 0.36, 19.2, 1.4, M.copper); solidCirc(45.2, 19.2, 0.72);
    almirah(36.6, 37.8, 19.4, 19.95, [0, -1]);
    addHide({ id: 'feast-wardrobe', type: 'almirah', cam: { x: 37.2, y: 1.5, z: 19.78, yaw: 0 }, exit: { x: 37.2, z: 18.85 }, hit: hitBox(1.22, 2.1, 0.58, 37.2, 1.05, 19.67, null) });

    // ================= upper floor =================
    LV = 1;
    P.bench({ x: 27.6, y: T4, z: 12.5, w: 1.6, ry: -Math.PI / 2 }); solidBox(27.3, 27.95, 11.7, 13.3);
    P.easyChair({ x: 29.6, y: T4, z: 13.8, ry: Math.PI * 0.8 }); solidBox(29.25, 29.95, 13.2, 14.4);
    P.easyChair({ x: 40.6, y: T4, z: 6.2, ry: -0.2 }); solidBox(40.25, 40.95, 5.6, 6.8);
    potted(41.4, 13.9, T4); potted(28.6, 5.6, T4);
    // Thaatha's room: cot to hide under, his desk with the ledger, a trunk
    P.cot({ x: 27.4, y: T4, z: 0.85, w: 2.0, d: 1.1, sheet: X.sheetBlue }); solidBox(26.4, 28.4, 0.3, 1.4);
    addHide({ id: 'thatha-cot', type: 'cot', lv: 1, cam: { x: 27.4, y: T4 + 0.24, z: 0.72, yaw: Math.PI }, exit: { x: 27.4, z: 1.95 }, hit: hitBox(2.0, 0.5, 1.1, 27.4, T4 + 0.25, 0.85, null) });
    P.table({ x: 30.2, y: T4, z: 3.9, w: 1.0, d: 0.6, h: 0.75 }); solidBox(29.7, 30.7, 3.6, 4.2);
    P.chair({ x: 30.2, y: T4, z: 3.3, ry: 0 }); solidBox(29.95, 30.45, 3.05, 3.55);
    note(30.1, T4 + 0.752, 3.95, 0.2, 'ledger');
    P.trunk({ x: 24.6, y: T4, z: 4.2, w: 0.9, h: 0.5, d: 0.55, ry: Math.PI / 2 }); solidBox(24.325, 24.875, 3.75, 4.65);
    { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 1.0, 6), M.dark); st.position.set(28.9, T4 + 0.48, 0.2); st.rotation.z = 0.18; add(st); }
    // Valli's room: a small cot, a toy chest, her drawings, a little table with her diary
    P.cot({ x: 35.9, y: T4, z: 0.75, w: 1.4, d: 0.8, sheet: X.sheetPlum }); solidBox(35.2, 36.6, 0.35, 1.15);
    P.trunk({ x: 32.1, y: T4, z: 0.5, w: 0.7, h: 0.4, d: 0.45, mat: M.teak }); solidBox(31.75, 32.45, 0.275, 0.725);
    P.table({ x: 33.6, y: T4, z: 4.3, w: 0.6, d: 0.45, h: 0.5 }); solidBox(33.3, 33.9, 4.07, 4.53);
    note(33.6, T4 + 0.502, 4.3, -0.3, 'valliroom');
    for (const [x, sd] of [[32.6, 81], [34.0, 82]]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), std({ map: K.makeChildDrawing(sd), roughness: 0.9 })); d.position.set(x, T4 + 1.5, 0.112); add(d); }
    {
      const dg = new THREE.Group(); dg.userData.batch = true; add(dg);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.2, 8), std({ color: 0xb3203a, roughness: 1 })); body.position.set(36.2, T4 + 0.56, 0.7); body.rotation.x = -1.3; dg.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), std({ color: 0xc89870, roughness: 0.9 })); head.position.set(36.2, T4 + 0.58, 0.82); dg.add(head);
    }
    // loft: broken things, trunks, cobwebs, a wardrobe
    for (const [x, z, w] of [[39.0, 0.5, 0.9], [40.2, 0.5, 0.8], [44.6, 4.4, 0.9]]) { P.trunk({ x, y: T4, z, w, h: 0.5, d: 0.55 }); solidBox(x - w / 2, x + w / 2, z - 0.275, z + 0.275); }
    P.chair({ x: 42.6, y: T4, z: 1.2, ry: 0.6, broken: true }); solidBox(42.35, 42.85, 0.95, 1.45);
    for (const [x, z] of [[43.5, 0.6], [44.2, 0.8]]) { P.sack(x, T4, z, 0.9, x); solidCirc(x, z, 0.3); }
    almirah(45.4, 45.95, 2.0, 3.2, [-1, 0], M.teak, T4);
    addHide({ id: 'loft-wardrobe', type: 'almirah', lv: 1, cam: { x: 45.78, y: T4 + 1.5, z: 2.6, yaw: Math.PI / 2 }, exit: { x: 44.85, z: 2.6 }, hit: hitBox(0.58, 2.1, 1.22, 45.67, T4 + 1.05, 2.6, null) });
    { const web = W._web || (W._web = std({ color: 0xd8d8d0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })); for (const [x, z, ry] of [[38.35, 0.35, 0.8], [45.65, 4.65, -2.4]]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), web); w.position.set(x, T4 + 2.75, z); w.rotation.set(0.6, ry, 0); add(w); } }
    // portrait hall: four portraits on the east wall, a small niche below them
    WG.portraits = [];
    for (let i = 0; i < 4; i++) {
      const z = 16.05 + i * 1.05, por = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.82), std({ roughness: 0.6 }));
      por.position.set(34.885, T4 + 1.85, z); por.rotation.y = -Math.PI / 2; por.userData.keepMat = true; por.userData.dyn = true; add(por);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.94, 0.74), M.teak); fr.position.set(34.93, T4 + 1.85, z); add(fr);
      WG.portraits.push(por);
    }
    WG.portraitHit = hitBox(0.2, 1.0, 4.2, 34.8, T4 + 1.85, 17.62, { kind: 'portraits' });
    { // a small wall cabinet under the portraits: its door opens when the family hangs in order
      plainBox(34.66, 34.9, T4 + 0.7, T4 + 0.74, 17.34, 17.9, M.teak, false); plainBox(34.66, 34.9, T4 + 1.06, T4 + 1.1, 17.34, 17.9, M.teak, false);
      plainBox(34.66, 34.9, T4 + 0.74, T4 + 1.06, 17.34, 17.37, M.teak, false); plainBox(34.66, 34.9, T4 + 0.74, T4 + 1.06, 17.87, 17.9, M.teak, false);
      plainBox(34.86, 34.9, T4 + 0.74, T4 + 1.06, 17.37, 17.87, M.soot, false);
      const nd = new THREE.Group(); nd.position.set(34.655, T4 + 0.9, 17.36); nd.userData.dyn = true; add(nd);
      const nm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.35, 0.53), X.carved || M.teak); nm.position.set(0, 0, 0.265); nd.add(nm);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), M.brass); kn.position.set(-0.018, 0, 0.47); nd.add(kn); WG.niche = nd;
    }
    P.bench({ x: 32.6, y: T4, z: 15.55, w: 2.0 }); solidBox(31.6, 33.6, 15.3, 15.85);
    // music room: harmonium, veena, a valve radio on a stool
    plainBox(38.6, 41.4, T4, T4 + 0.12, 18.6, 19.9, M.teak, true);
    P.harmonium({ x: 40.0, y: T4 + 0.12, z: 19.25, ry: Math.PI });
    P.veena({ x: 42.8, y: T4, z: 19.3, ry: Math.PI }); solidBox(42.5, 44.0, 19.0, 19.7);
    { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), X.paai); p.rotation.x = -Math.PI / 2; p.position.set(40, T4 + 0.13, 19.2); add(p); }
    P.table({ x: 45.5, y: T4, z: 16.2, w: 0.5, d: 0.6, h: 0.62, ry: Math.PI / 2 }); solidBox(45.2, 45.8, 15.95, 16.45);
    WG.radio = P.radio({ x: 45.5, y: T4 + 0.62, z: 16.2, ry: -Math.PI / 2 }); WG.radioHit = hitBox(0.32, 0.4, 0.56, 45.5, T4 + 0.78, 16.2, { kind: 'radio' });
    // Valli's name in chalk on the gallery wall beside her door, and the letter lock on that door
    { const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), std({ map: K.makeChalkName(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); ch.position.set(33.3, T4 + 1.05, 5.104); ch.userData.keepMat = true; ch.userData.dyn = true; add(ch); }
    { const d = W.doorById.valli, lk = new THREE.Group(); lk.position.set(0.76, 0.9, 0); d.pivot.add(lk);
      for (const s of [-1, 1]) { const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.03), M.brass); body.position.set(0, 0, s * 0.055); lk.add(body); for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 10), M.iron); r.rotation.x = Math.PI / 2; r.position.set(-0.045 + i * 0.045, 0, s * 0.072); lk.add(r); } }
      WG.letterLock = lk; }
    // library: shelves, a reading desk with Thaatha's note about the portraits
    P.bookshelf({ x: 45.72, y: T4, z: 7.6, w: 2.4, ry: -Math.PI / 2 }); solidBox(45.5, 45.95, 6.4, 8.8);
    P.bookshelf({ x: 45.72, y: T4, z: 12.4, w: 2.4, ry: -Math.PI / 2 }); solidBox(45.5, 45.95, 11.2, 13.6);
    P.table({ x: 43.8, y: T4, z: 10.0, w: 1.0, d: 0.6, h: 0.75, ry: Math.PI / 2 }); solidBox(43.5, 44.1, 9.5, 10.5);
    P.chair({ x: 43.1, y: T4, z: 10.0, ry: Math.PI / 2 }); solidBox(42.85, 43.35, 9.75, 10.25);
    note(43.85, T4 + 0.752, 10.1, 1.4, 'portraits');
    LV = 0;
  }

  /* ---------------- rooms ---------------- */
  let BEAD = null;
  function pillar(x, z) { K.Props.pillar(x, z, HT); solidCirc(x, z, 0.3); }
  function kuthuVilakku(x, y, z, scale = 1, group) {
    const v = K.Props.kuthu(x, y, z, scale, W._flame || (W._flame = K.makeFlameTex()));
    if (K.R) v.light = K.R.addLight({ x, y: y + 0.62 * scale, z, col: [0.62, 0.34, 0.11], range: group === undefined ? 4.6 : 7.5, decay: 1.7, flick: group === undefined, group, gi: 1, lv: LV });
    return v;
  }
  W.kuthu = kuthuVilakku;
  function buildCourtyard() {
    const P = K.Props, X = P.X;
    for (const [x, z] of [[9, 8], [15, 8], [9, 12], [15, 12]]) pillar(x, z);
    // well
    const wx = 12, wz = 10;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.02, 0.8, 28, 1, true), Object.assign(M.granite.clone(), { side: THREE.DoubleSide })); ring.position.set(wx, 0.4, wz); shadow(ring); add(ring);
    const lip = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.86, 0.8), new THREE.Vector2(1.08, 0.8), new THREE.Vector2(1.1, 0.84), new THREE.Vector2(1.08, 0.92), new THREE.Vector2(0.86, 0.92), new THREE.Vector2(0.86, 0.8)], 28), M.granite); lip.position.set(wx, 0, wz); shadow(lip); add(lip);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.97, 24), M.water); water.rotation.x = -Math.PI / 2; water.position.set(wx, 0.08, wz); add(water);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.75, 24, 1, true), Object.assign(M.soot.clone(), { side: THREE.BackSide })); inner.position.set(wx, 0.45, wz); add(inner);
    const wg = new THREE.Group(); wg.position.set(wx, 0, wz); wg.userData.batch = true; add(wg);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(P.legGeo(2.2, 0.055), M.teak); post.position.set(s * 0.95, 0.88, 0); wg.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6), M.brass); cap.position.set(s * 0.95, 3.1, 0); wg.add(cap);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.1, 10), M.teak); bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.95, 0); wg.add(bar);
    shadow(wg);
    const wheel = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001, -0.035), new THREE.Vector2(0.17, -0.035), new THREE.Vector2(0.17, -0.02), new THREE.Vector2(0.14, 0), new THREE.Vector2(0.17, 0.02), new THREE.Vector2(0.17, 0.035), new THREE.Vector2(0.001, 0.035)], 18), M.iron); wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 2.86, wz); add(wheel); wheel.userData.dyn = true;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5), M.rope); rope.position.set(wx + 0.16, 2.3, wz); rope.scale.y = 1.1; add(rope); rope.userData.dyn = true;
    const wb = itemMesh('bucket'); wb.visible = false; add(wb); // bucket used on the well
    W.well = { x: wx, z: wz, rope, wheel, bucket: wb, busy: false, used: false };
    solidCirc(wx, wz, 1.12);
    hitBox(2.1, 1.0, 2.1, wx, 0.5, wz, { kind: 'well' });
    // tulasi maadam
    P.tulasi(9.75, 8.75, M.plaster, M.leaf); solidBox(9.54, 9.96, 8.54, 8.96);
    // four lamps on stools — the order puzzle
    const L = [{ s: 'sun', x: 12, z: 7.35, f: [0, 1] }, { s: 'moon', x: 15.65, z: 10, f: [-1, 0] }, { s: 'star', x: 12, z: 12.65, f: [0, -1] }, { s: 'lotus', x: 8.35, z: 10, f: [1, 0] }];
    for (const l of L) {
      P.pedestal(l.x, l.z, 0.42, 0.5); solidBox(l.x - 0.21, l.x + 0.21, l.z - 0.21, l.z + 0.21);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), std({ map: K.makeSymbolPanel(l.s), roughness: 0.6 }));
      panel.position.set(l.x + l.f[0] * 0.212, 0.26, l.z + l.f[1] * 0.212); panel.lookAt(l.x + l.f[0] * 3, 0.26, l.z + l.f[1] * 3); add(panel);
      const v = kuthuVilakku(l.x, 0.5, l.z, 1.1, W.lamps.length);
      const lamp = { sym: l.s, x: l.x, z: l.z, lit: false, flames: v.flames, light: null };
      hitBox(0.5, 1.25, 0.5, l.x, 0.62, l.z, { kind: 'lamp', lamp });
      W.lamps.push(lamp);
    }
    // easy chair (saaivu naarkaali)
    P.easyChair({ x: 16.9, z: 7.0, ry: Math.PI }); solidBox(16.55, 17.25, 6.4, 7.6);
  }
  function almirah(x0, x1, z0, z1, facing, mat, y0 = 0) { // facing: direction the doors face [dx,dz]
    K.Props.wardrobe({ x0, x1, z0, z1, facing, mat, y0 }); solidBox(x0, x1, z0, z1);
  }
  function note(x, y, z, rz, id) { const n = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), M.paper); n.rotation.x = -Math.PI / 2; n.rotation.z = rz; n.position.set(x, y, z); add(n); hitBox(0.3, 0.08, 0.34, x, y + 0.02, z, { kind: 'note', note: id }); return n; }
  function addHide(o) { if (o.lv === undefined) o.lv = 0; W.hideSpots.push(o); W.addInter(o.hit, { kind: 'hide', spot: o }); }

  function buildStore() {
    const P = K.Props, X = P.X;
    // sleeping mat where you wake up
    P.paai(9.4, 2.2, 0.9, 1.8, 0);
    for (const [x, z, s] of [[8.55, 0.55, 1], [9.25, 0.45, 0.9], [8.55, 1.3, 0.85]]) { P.sack(x, 0, z, s, x * 3); solidCirc(x, z, 0.33 * s); }
    // open shelves along the north wall, full of vessels
    P.rack({ x: 11.6, z: 0.3, w: 3.06, d: 0.45, h: 2.1, levels: [0.6225, 1.3225, 2.0225] });
    solidBox(10.05, 13.15, 0.05, 0.55);
    const vg = new THREE.Group(); vg.userData.batch = true; add(vg);
    ['kudam', 'sombu', 'thavalai', 'kudam', 'sombu', 'thavalai'].forEach((k, i) => P.vessel(k, 10.4 + i * 0.5, 1.34, 0.3, k === 'thavalai' ? 0.7 : 1, i % 2 ? M.copper : M.brass, vg, i));
    for (let i = 0; i < 6; i++) P.vessel('paanai', 10.5 + i * 0.45, 0.64, 0.3, 0.55, i % 3 ? X.terra : X.terraBand, vg, i);
    for (let i = 0; i < 4; i++) P.vessel('bottle', 10.6 + i * 0.6, 2.04, 0.3, 0.9 + (i % 2) * 0.15, M.glassDark, vg);
    for (let i = 0; i < 3; i++) { const pl = P.vessel('plate', 12.75 + i * 0.03, 2.2, 0.18, 1, M.brass, vg); pl.rotation.x = -1.3; }
    // trunk with the first letter on it
    P.trunk({ x: 12.6, z: 3.0, w: 1.0, h: 0.55, d: 0.6 }); solidBox(12.1, 13.1, 2.7, 3.3);
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), M.paper); note.rotation.x = -Math.PI / 2; note.rotation.z = 0.3; note.position.set(12.5, 0.557, 2.95); add(note);
    hitBox(0.3, 0.1, 0.34, 12.5, 0.58, 2.95, { kind: 'note', note: 'intro' });
    // hiding almirah
    almirah(13.4, 13.95, 3.6, 4.8, [-1, 0]);
    addHide({ id: 'store-almirah', type: 'almirah', cam: { x: 13.78, y: 1.5, z: 4.2, yaw: Math.PI / 2 }, exit: { x: 12.85, z: 4.2 }, hit: hitBox(0.58, 2.1, 1.22, 13.67, 1.05, 4.2, null) });
    // dead bulb
    P.bulb(11, HT, 3, 0.98);
  }
  function buildKitchen() {
    const P = K.Props, X = P.X;
    // wood-fired stove (aduppu) with a pot on the fire and a soot-black hood
    P.stove({ x: 2.6, z: 0.45, w: 2.6, holes: [-0.7, 0.7] }); solidBox(1.3, 3.9, 0.05, 0.85);
    const kg = new THREE.Group(); kg.userData.batch = true; add(kg);
    P.vessel('paanai', 1.9, 0.77, 0.45, 0.9, X.terra, kg); P.vessel('thavalai', 3.3, 0.77, 0.45, 1, M.copper, kg);
    // west-wall shelves of brass
    P.wallShelf(0.25, 1.4, 3.0, 2.2, 0.3, Math.PI / 2); P.wallShelf(0.25, 1.95, 3.0, 2.2, 0.3, Math.PI / 2);
    for (let i = 0; i < 5; i++) { P.vessel(i % 2 ? 'sombu' : 'kudam', 0.25, 1.418, 2.1 + i * 0.45, i % 2 ? 1 : 0.6, i % 2 ? M.copper : M.brass, kg, i); const loose = i === 4, pl = P.vessel('plate', 0.2, 1.968, 2.1 + i * 0.45, 1, M.brass, loose ? null : kg); if (loose) { W.fallPlate = { mesh: pl, home: { x: 0.17, y: 2.13, z: 3.9 }, t: -1, x: 0.17, z: 3.9 }; pl.parent.userData.batch = false; pl.parent.userData.dyn = true; } pl.rotation.set(0, 0, -(Math.PI / 2 - 0.25)); pl.position.set(0.17, 2.13, 2.1 + i * 0.45); }
    // table
    P.table({ x: 5.0, z: 3.4, w: 1.8, d: 0.9, h: 0.8, shelf: true }); solidBox(4.1, 5.9, 2.95, 3.85);
    for (let i = 0; i < 3; i++) P.vessel('tumbler', 4.6 + i * 0.35, 0.8, 3.2, 1, M.brass, kg);
    P.vessel('plate', 5.4, 0.8, 3.6, 1, M.brass, kg); P.vessel('davara', 5.65, 0.8, 3.25, 1, M.brass, kg);
    P.vessel('kudam', 4.5, 0.2, 3.5, 1.1, M.brass, kg);
    // grinding stone
    P.grinder(7.35, 2.4); solidCirc(7.35, 2.4, 0.36);
    // rice pot covered with a brass plate (one of the small-key spots)
    P.vessel('paanai', 7.15, 0, 4.85, 1.6, X.terraBand, kg); solidCirc(7.15, 4.85, 0.36);
    P.vessel('plate', 7.15, 0.598, 4.85, 1.15, M.brass, kg);
    // calendar clue on the west wall
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.59), std({ roughness: 0.9 })); cal.position.set(0.112, 1.75, 5.0); cal.rotation.y = Math.PI / 2; add(cal);
    cal.material.map = K.makeCalendarTex(null, 0);
  }
  function buildPooja() {
    const P = K.Props, X = P.X;
    const ag = new THREE.Group(); ag.userData.batch = true; add(ag);
    const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); ag.add(b); return b; };
    // two-step altar with brass edging, carved backboard, turned posts and an arched canopy
    box(2.0, 0.6, 0.7, 16.5, 0.3, 0.45, M.teak); box(2.02, 0.03, 0.72, 16.5, 0.6, 0.45, M.brass); box(2.02, 0.03, 0.72, 16.5, 0.05, 0.45, M.brass);
    box(1.4, 0.18, 0.3, 16.5, 0.69, 0.3, M.dark);
    box(2.0, 2.6, 0.1, 16.5, 1.9, 0.15, X.carved);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(P.legGeo(2.0, 0.06), M.teak); p.position.set(16.5 + s * 0.85, 0.6, 0.7); ag.add(p); }
    const arch = new THREE.Shape(); arch.moveTo(-0.95, 0); arch.lineTo(0.95, 0); arch.lineTo(0.95, -0.45); arch.lineTo(0.8, -0.45); arch.quadraticCurveTo(0.6, -0.05, 0, -0.08); arch.quadraticCurveTo(-0.6, -0.05, -0.8, -0.45); arch.lineTo(-0.95, -0.45); arch.lineTo(-0.95, 0);
    const ar = new THREE.Mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.05, bevelEnabled: false, curveSegments: 14 }), M.teak); ar.position.set(16.5, 2.75, 0.76); ag.add(ar);
    box(2.0, 0.16, 0.8, 16.5, 2.82, 0.45, M.dark);
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M.brass); b.position.set(15.7 + i * 0.2, 2.73, 0.86); ag.add(b); }
    shadow(ag);
    // a glowing brass frame — the household shrine
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshBasicMaterial({ map: K.makeGlowTex('rgba(255,210,120,1)', 'rgba(160,80,20,0.6)') }));
    frame.position.set(16.5, 1.55, 0.21); add(frame);
    const fr = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 4), M.brass); fr.rotation.z = Math.PI / 4; fr.scale.set(0.95, 1.2, 1); fr.position.set(16.5, 1.55, 0.22); add(fr);
    W.poojaLamps = [kuthuVilakku(15.85, 0.6, 0.55, 0.8), kuthuVilakku(17.15, 0.6, 0.55, 0.8)];
    W.poojaLamps.forEach(v => v.flames.forEach(f => f.visible = true));
    // marigold and jasmine garlands
    const jas = W._jas || (W._jas = std({ color: 0xf2eedd, roughness: 0.8, emissive: 0x1a1a14 }));
    for (let i = 0; i < 34; i++) { const t = i / 33, m = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), i % 3 ? M.marigold : jas); m.position.set(15.6 + t * 1.8, 2.5 - Math.sin(t * Math.PI) * 0.38, 0.8); add(m); }
    // bell on a chain
    const bellM = W._bellM || (W._bellM = Object.assign(M.brass.clone(), { side: THREE.DoubleSide }));
    P.vessel('bell', 17.8, 2.32, 1.2, 1.1, bellM);
    const bc = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.1, 4), M.iron); bc.position.set(17.8, 3.03, 1.2); add(bc);
    // low stool with the plate holding the almirah key
    P.table({ x: 16.5, z: 1.35, w: 0.5, d: 0.5, h: 0.35, legR: 0.03 }); solidBox(16.25, 16.75, 1.1, 1.6);
    P.vessel('plate', 16.5, 0.35, 1.35, 1.1, M.brass);
    // kolam clue on the floor
    const kol = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshStandardMaterial({ transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    kol.rotation.x = -Math.PI / 2; kol.position.set(16.5, 0.01, 3.4); add(kol);
    kol.userData.dyn = true; kol.userData.keepMat = true; W.clues.push({ pos: 4, mesh: kol, make: K.makeKolamTex, where: 'Pooja arai kolam' });
    hitBox(1.0, 0.05, 1.0, 16.5, 0.03, 3.4, { kind: 'clue', pos: 4 });
    solidBox(15.5, 17.5, 0.1, 0.8);
  }
  function buildBedroom() {
    const P = K.Props, X = P.X;
    // cot (kattil) with a torn mosquito net
    P.cot({ x: 21.6, z: 0.78, w: 2.0, d: 1.2, net: true, sheet: X.sheet });
    solidBox(20.6, 22.6, 0.15, 1.4);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.3), std({ color: 0xd8d4c8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    net.position.set(21.6, 1.35, 1.34); add(net);
    addHide({ id: 'bed-cot', type: 'cot', cam: { x: 21.6, y: 0.24, z: 0.95, yaw: Math.PI }, exit: { x: 21.6, z: 2.0 }, hit: hitBox(2.0, 0.5, 1.2, 21.6, 0.25, 0.78, null) });
    // dressing table + mirror clue
    P.dresser({ x: 23.68, z: 2.8, ry: -Math.PI / 2, w: 1.0, mirrorY: 0.915 }); solidBox(23.455, 23.9, 2.3, 3.3);
    const mir = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.93), std({ roughness: 0.25, metalness: 0.2 })); mir.position.set(23.86, 1.45, 2.8); mir.rotation.y = -Math.PI / 2; add(mir);
    mir.material.map = K.makeMirrorTex(null, 0); W.mirror = mir; mir.userData.dyn = true; mir.userData.keepMat = true;
    // cradle (thottil) swaying from the ceiling
    W.cradle = P.cradle(23.0, 4.4, HT); solidCirc(23.0, 4.4, 0.4);
    const ck = itemMesh('kolusu'); ck.position.set(0, -2.47, 0.05); ck.visible = false; W.cradle.add(ck); W.cradleKolusu = ck;
    const ck2 = itemMesh('kolusu'); ck2.position.set(0.09, -2.47, -0.06); ck2.rotation.y = 1.3; ck2.visible = false; W.cradle.add(ck2); W.cradleKolusu2 = ck2;
    hitBox(0.7, 0.7, 1.0, 23.0, 1.15, 4.4, { kind: 'cradle' });
    W.cradleAmp = 0.08; W.cradleTarget = 0.08;
    note(23.52, 0.813, 2.72, -0.6, 'clock');
    P.trunk({ x: 19.65, z: 4.9, w: 0.9, h: 0.5, d: 0.55 }); solidBox(19.2, 20.1, 4.625, 5.175);
  }
  function buildDining() {
    const P = K.Props, X = P.X;
    P.table({ x: 2.8, z: 10.0, w: 1.0, d: 2.6, h: 0.44, legR: 0.04 }); solidBox(2.3, 3.3, 8.7, 11.3);
    const dg = new THREE.Group(); dg.userData.batch = true; add(dg);
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), M.leaf); lf.rotation.x = -Math.PI / 2; lf.position.set(2.8 + s * 0.26, 0.445, 9.05 + i * 0.62); add(lf);
        P.vessel('tumbler', 2.8 + s * 0.42, 0.44, 9.25 + i * 0.62, 0.85, M.brass, dg);
      }
      P.manai(3.55, 0, 9.05 + i * 0.62, Math.PI / 2, 0.42);
    }
    solidBox(3.42, 3.68, 8.8, 11.1);
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), X.paai); m.rotation.x = -Math.PI / 2; m.position.set(4.05, 0.006, 10); add(m); }
    P.cabinet({ x: 5.62, z: 7.4, ry: -Math.PI / 2, w: 1.4, h: 1.9 }); solidBox(5.37, 5.87, 6.7, 8.1);
    P.sideboard({ x: 5.65, z: 12.8, ry: -Math.PI / 2, w: 1.0, h: 0.9, d: 0.5 }); solidBox(5.4, 5.9, 12.3, 13.3);
  }
  function buildStudy() {
    const P = K.Props, X = P.X;
    P.table({ x: 23.5, z: 9.0, w: 1.6, d: 0.8, h: 0.8, ry: -Math.PI / 2, drawer: true }); solidBox(23.1, 23.95, 8.2, 9.8);
    P.chair({ x: 22.75, z: 9.0, ry: Math.PI / 2, arms: true }); solidBox(22.5, 23.0, 8.75, 9.25);
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), X.spines[0]); ledger.position.set(23.55, 0.82, 9.45); ledger.rotation.y = 0.2; add(ledger);
    P.vessel('bottle', 23.75, 0.8, 9.6, 0.35, M.glassDark);
    // hurricane lantern (cold)
    P.lantern(23.7, 0.8, 8.4);
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), M.paper); note.rotation.x = -Math.PI / 2; note.rotation.z = -0.25; note.position.set(23.45, 0.802, 8.75); add(note);
    hitBox(0.3, 0.08, 0.34, 23.45, 0.82, 8.75, { kind: 'note', note: 'lamps' });
    // bookshelf
    P.bookshelf({ x: 20.5, z: 13.72, w: 2.6, ry: Math.PI }); solidBox(19.2, 21.8, 13.5, 13.95);
    P.settee({ x: 19.3, z: 7.25, w: 0.9 }); solidBox(18.85, 19.75, 6.85, 7.6);
    almirah(23.4, 23.95, 11.6, 12.8, [-1, 0]);
    addHide({ id: 'study-wardrobe', type: 'almirah', cam: { x: 23.78, y: 1.5, z: 12.2, yaw: Math.PI / 2 }, exit: { x: 22.85, z: 12.2 }, hit: hitBox(0.58, 2.1, 1.22, 23.67, 1.05, 12.2, null) });
  }
  function buildHall() {
    const P = K.Props, X = P.X;
    // swing (oonjal)
    W.swing = P.swing(9.0, 17.6, HT); solidBox(8.05, 9.95, 17.2, 18.0);
    // ancestor portrait in a carved frame with a sandal-and-jasmine garland, + first digit card
    const por = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.96), std({ map: K.makePortraitTex(), roughness: 0.6 })); por.position.set(8.2, 2.1, 14.115); add(por);
    const fs = new THREE.Shape(); fs.moveTo(-0.46, -0.58); fs.lineTo(0.46, -0.58); fs.lineTo(0.46, 0.5); fs.quadraticCurveTo(0.3, 0.62, 0, 0.66); fs.quadraticCurveTo(-0.3, 0.62, -0.46, 0.5); fs.lineTo(-0.46, -0.58);
    const fh = new THREE.Path(); fh.moveTo(-0.36, -0.48); fh.lineTo(0.36, -0.48); fh.lineTo(0.36, 0.48); fh.lineTo(-0.36, 0.48); fh.lineTo(-0.36, -0.48); fs.holes.push(fh);
    const fm = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 }), M.teak); fm.position.set(8.2, 2.1, 14.1); add(fm); shadow(fm);
    const jas = W._jas || (W._jas = std({ color: 0xf2eedd, roughness: 0.8, emissive: 0x1a1a14 }));
    for (let i = 0; i < 44; i++) { const t = i / 43, a = (t - 0.5) * Math.PI * 1.1; const m = new THREE.Mesh(BEAD || (BEAD = new THREE.SphereGeometry(0.032, 5, 4)), i % 4 === 0 ? M.marigold : jas); m.position.set(8.2 + Math.sin(a) * 0.5, 2.62 - (1 - Math.cos(a)) * 0.75 - Math.sin(t * Math.PI) * 0.05, 14.2); add(m); }
    // pallanguzhi board under the portrait; its drawer holds the first digit
    const pl = P.pallanguzhi({ x: 8.2, z: 14.55, syms: ['sun', 'moon', 'star', 'lotus'] }); solidBox(7.72, 8.68, 14.38, 14.72);
    W.pall = { board: pl, drawer: pl.drawer, open: 0, target: 0, counts: [0, 0, 0, 0], syms: ['sun', 'moon', 'star', 'lotus'], x: 8.2, z: 14.55 };
    W.pallHit = hitBox(0.98, 0.3, 0.4, 8.2, 0.12, 14.55, { kind: 'pall' });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), std({ roughness: 0.9 })); card.rotation.x = -Math.PI / 2; card.rotation.z = 0.15; card.position.set(0, 0.045, 0.05); pl.drawer.add(card);
    hitBox(0.24, 0.06, 0.2, 0, 0.06, 0.05, { kind: 'clue', pos: 1 }, pl.drawer);
    card.userData.dyn = true; card.userData.keepMat = true; W.clues.push({ pos: 1, mesh: card, make: (d, p) => { const c = K.canvas(160, 128), g = c.getContext('2d'); g.fillStyle = '#e1d4b4'; g.fillRect(0, 0, 160, 128); K.drawClue(g, 80, 54, 70, d, p); return K.toTex(c, false); }, where: 'Valavu Thatha photo' });
    // grandfather clock
    const ck = P.clock({ x: 17.65, z: 19.55, ry: Math.PI }); W.pendulum = ck.pendulum; solidBox(17.4, 17.9, 19.35, 19.75);
    W.clockPos = { x: 17.65, y: 1.5, z: 19.5 };
    W.clock = { hands: ck.hands, door: ck.door, open: 0, target: 0, running: false, h: 12, m: 0, x: 17.65, z: 19.5 };
    W.clock.set = function (h, m) { W.clock.h = h; W.clock.m = m; ck.hands.m.rotation.z = -m / 60 * Math.PI * 2; ck.hands.h.rotation.z = -((h % 12) + m / 60) / 12 * Math.PI * 2; };
    W.clockHit = hitBox(0.52, 2.1, 0.45, 17.65, 1.05, 19.5, { kind: 'clock' });
    // black rotary telephone
    const ph = P.phone({ x: 16.75, z: 19.55, ry: Math.PI }); solidBox(16.54, 16.96, 19.37, 19.73);
    W.phone = { handset: ph.handset, x: 16.75, z: 19.55, ring: 0 };
    hitBox(0.45, 0.4, 0.42, 16.75, 0.9, 19.55, { kind: 'phone' });
    note(6.45, 0.452, 16.15, 0.3, 'cradle');
    // bench and hall pillars
    P.bench({ x: 6.45, z: 16.6, w: 2.0, ry: Math.PI / 2 }); solidBox(6.15, 6.75, 15.6, 17.6);
    for (const x of [10.2, 13.8]) pillar(x, 15.3);
    // main door: carved double door with three locks
    buildMainDoor();
  }
  function buildMainDoor() {
    const z = 20, x = 12, w = 1.6, h = 2.5;
    const tex = K.makeDoorTex(77, true), mat = std({ map: tex, roughness: 0.55 });
    const leaves = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(x + s * w / 2, 0, z - 0.02); add(piv);
      const geo = new THREE.BoxGeometry(w / 2 + 0.01, h - 0.02, 0.09); geo.translate(-s * (w / 4 + 0.005), h / 2, s * 0.004);
      const leaf = new THREE.Mesh(geo, mat); shadow(leaf); piv.add(leaf); leaves.push({ piv, leaf, s });
    }
    // carved frame
    prop(0.22, h + 0.1, 0.34, x - w / 2 - 0.11, 0, z, M.teak, false); prop(0.22, h + 0.1, 0.34, x + w / 2 + 0.11, 0, z, M.teak, false);
    prop(w + 0.6, 0.3, 0.36, x, h, z, M.teak, false);
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.brass); b.position.set(x - 0.75 + i * 0.25, h + 0.15, z - 0.19); add(b); }
    const lockGroup = new THREE.Group(); add(lockGroup);
    const zf = z - 0.08;
    // 1. brass padlock on a hasp
    const pad = new THREE.Group(); pad.position.set(x, 1.0, zf - 0.03);
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.06), M.brass); pad.add(pb);
    const sh = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14, Math.PI), M.steel); sh.position.y = 0.08; pad.add(sh);
    const kh = new THREE.Mesh(new THREE.CircleGeometry(0.015, 8), M.black); kh.position.set(0, -0.03, -0.031); kh.rotation.y = Math.PI; pad.add(kh);
    prop(0.36, 0.05, 0.02, x, 1.1, zf + 0.02, M.iron, false);
    lockGroup.add(pad);
    // 2. iron chain across both leaves
    const chain = new THREE.Group();
    const p0 = new THREE.Vector3(x - 0.62, 1.55, zf - 0.02), p1 = new THREE.Vector3(x + 0.62, 1.3, zf - 0.02);
    for (let i = 0; i < 18; i++) {
      const t = i / 17, p = p0.clone().lerp(p1, t); p.y -= Math.sin(t * Math.PI) * 0.12;
      const l = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 5, 10), M.iron); l.position.copy(p); l.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, -0.2); l.scale.set(1.3, 0.8, 1); chain.add(l);
    }
    for (const p of [p0, p1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 8), M.iron); st.rotation.x = Math.PI / 2; st.position.copy(p).setZ(zf + 0.01); chain.add(st); }
    lockGroup.add(chain);
    // 3. four-wheel number lock
    const num = new THREE.Group(); num.position.set(x + 0.3, 1.8, zf - 0.03);
    const nb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.06), M.iron); num.add(nb);
    for (let i = 0; i < 4; i++) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 10), M.brass); wh.rotation.z = Math.PI / 2; wh.position.set(-0.075 + i * 0.05, 0, -0.035); num.add(wh); }
    const nsh = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14, Math.PI), M.steel); nsh.position.y = 0.05; num.add(nsh);
    lockGroup.add(num);
    shadow(lockGroup, true, false);
    const bar = new THREE.Group(); bar.position.set(x, 0.72, zf - 0.07); add(bar);
    { const b = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.13, 0.1), M.teak); bar.add(b);
      for (const s of [-1, 1]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.14), M.iron); br.position.set(s * 0.95, 0, 0.03); bar.add(br); }
      const lk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.08), M.iron); lk.position.set(0.25, -0.16, -0.06); bar.add(lk);
      const shk = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 14, Math.PI), M.steel); shk.position.set(0.25, -0.05, -0.06); bar.add(shk); }
    W.main = { leaves, pad, chain, num, bar, x, z, open: 0, opening: false, locks: { pad: true, chain: true, num: true, bar: true } };
    W.mainSolid = solidBox(x - w / 2, x + w / 2, z - 0.12, z + 0.05, { door: true });

    W.mainHit = hitBox(1.7, 2.5, 0.2, x, 1.25, z - 0.2, { kind: 'main' });
    // a little light under the door gap — the outside world
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.03), new THREE.MeshBasicMaterial({ color: 0x5d6d8f })); gap.position.set(x, 0.015, z - 0.075); gap.rotation.y = Math.PI; add(gap);
  }
  function buildBath() {
    const P = K.Props, X = P.X;
    // copper water boiler (anda) with water
    P.vessel('boiler', 1.0, 0.364, 19.0, 1.3, M.copper);
    const wat = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), M.water); wat.rotation.x = -Math.PI / 2; wat.position.set(1.0, 0.7, 19.0); add(wat);
    solidCirc(1.0, 19.0, 0.72);
    // granite washing stone, copper pots, a brass mug
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.6), M.granite); ws.position.set(4.6, 0.15, 19.55); shadow(ws); add(ws); solidBox(4.0, 5.2, 19.25, 19.85);
    for (let i = 0; i < 2; i++) P.vessel('kudam', 2.4 + i * 0.42, 0, 19.6, 1.15, M.copper);
    P.vessel('sombu', 4.25, 0.3, 19.6, 0.9, M.brass); P.vessel('davara', 4.9, 0.3, 19.5, 1, M.brass);
    // ledge (one of the small-key spots)
    P.wallShelf(5.82, 1.0325, 18.6, 0.9, 0.3, -Math.PI / 2);
    const soap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.05), std({ color: 0x8aa36b })); soap.position.set(5.8, 1.06, 18.9); add(soap);
    // locked iron almirah (Godrej style) with the bolt cutter
    const ax0 = 0.1, ax1 = 0.65, az0 = 15.6, az1 = 16.8;
    const gm = new THREE.MeshStandardMaterial({ color: 0x3e4f49, metalness: 0.55, roughness: 0.42, envMap: K.envMap || null, envMapIntensity: K.envMap ? 0.6 : 0 });
    const gd = new THREE.MeshStandardMaterial({ color: 0x4a5c55, metalness: 0.55, roughness: 0.4, envMap: K.envMap || null, envMapIntensity: K.envMap ? 0.6 : 0 });
    const ab = new THREE.Group(); ab.userData.batch = true; add(ab);
    const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); ab.add(o); return o; };
    const cx = (ax0 + ax1) / 2;
    part(new THREE.BoxGeometry(ax1 - ax0 - 0.02, 1.92, 0.025), gm, cx, 1.04, az0 + 0.0125); part(new THREE.BoxGeometry(ax1 - ax0 - 0.02, 1.92, 0.025), gm, cx, 1.04, az1 - 0.0125);
    part(new THREE.BoxGeometry(0.025, 1.92, az1 - az0), gm, ax0 + 0.0125, 1.04, 16.2);
    part(new THREE.BoxGeometry(ax1 - ax0 + 0.02, 0.06, az1 - az0 + 0.02), gm, cx, 2.03, 16.2); part(new THREE.BoxGeometry(ax1 - ax0, 0.05, az1 - az0), gm, cx, 0.1, 16.2);
    for (const z of [az0 + 0.05, az1 - 0.05]) for (const x of [ax0 + 0.05, ax1 - 0.05]) part(new THREE.CylinderGeometry(0.025, 0.03, 0.08, 8), M.iron, x, 0.04, z);
    shadow(ab);
    const doors = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(ax1 + 0.01, 0, 16.2 + s * 0.6); add(piv);
      const g = new THREE.BoxGeometry(0.03, 1.9, 0.59); g.translate(0, 1.04, -s * 0.295);
      const d = new THREE.Mesh(g, gd); shadow(d); piv.add(d); doors.push({ piv, s, mesh: d });
      for (const yy of [0.5, 1.55]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.6, 0.45), gm); r.position.set(0.017, yy, -s * 0.295); piv.add(r); }
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), M.steel); handle.position.set(ax1 + 0.045, 1.1, 16.25); add(handle);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.04), M.steel); plate.position.set(ax1 + 0.03, 0.98, 16.25); add(plate);
    W.almirah = { doors, open: 0, target: 0, handle };
    W.almirahHit = hitBox(0.1, 1.9, 1.2, ax1 + 0.04, 1.0, 16.2, { kind: 'almirah' });
    solidBox(ax0, ax1, az0, az1);
    prop(0.5, 0.03, 1.1, 0.38, 0.95, 16.2, M.wood, false); // inner shelf
  }
  function buildGuest() {
    const P = K.Props, X = P.X;
    P.cot({ x: 22.4, z: 19.2, w: 2.0, d: 1.2, ry: Math.PI, sheet: X.sheetPlum });
    solidBox(21.4, 23.4, 18.6, 19.85);
    addHide({ id: 'guest-cot', type: 'cot', cam: { x: 22.4, y: 0.24, z: 19.05, yaw: 0 }, exit: { x: 22.4, z: 17.9 }, hit: hitBox(2.0, 0.5, 1.2, 22.4, 0.25, 19.2, null) });
    P.table({ x: 20.3, z: 19.5, w: 0.5, d: 0.5, h: 0.6, legR: 0.026 }); solidBox(20.05, 20.55, 19.25, 19.75);
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), M.paper); note.rotation.x = -Math.PI / 2; note.rotation.z = 0.5; note.position.set(20.3, 0.603, 19.5); add(note);
    hitBox(0.3, 0.08, 0.34, 20.3, 0.62, 19.5, { kind: 'note', note: 'well' });
    P.vessel('sombu', 20.45, 0.6, 19.65, 0.8, M.copper);
    P.trunk({ x: 23.4, z: 15.0, w: 0.9, h: 0.5, d: 0.55 }); solidBox(22.95, 23.85, 14.725, 15.275);
    P.chair({ x: 19.3, z: 15.0, ry: Math.PI / 2 }); solidBox(19.05, 19.55, 14.75, 15.25);
  }
  function buildCreaky() {
    const tex = K.makeCrackTex(), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const [x, z] of [[11, 6.75], [6.8, 10], [12, 14.75], [18.75, 10.05], [3, 13.3], [16.5, 6.85], [21.5, 5.25], [9.6, 4.3], [4.5, 2.2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.008, z); add(m);
      W.creaky.push({ x, z, cd: 0 });
    }
  }
  function buildLights() {
    // lamps around the courtyard share four small lights (always present → no shader recompiles)
    // all lamp light is baked; the four courtyard lamps are switchable light groups 0-3
    W.lampLight = { intensity: 0 }; W.poojaLight = { intensity: 0 };
  }

  /* ---------------- run-time state ---------------- */
  W.spawnItems = function (run) {
    const list = [['smallkey', 17.65, 0.29, 19.52, 0.7], ['kolusu', 12.35, 0.93, 9.1, 0.3], ['matchbox', 17.95, 1.05, -9.7, 0.3], ['bucket', 19.05, 0, 19.35, 0], ['almirahkey', 16.5, 0.375, 1.35, 1.2], ['boltcutter', 0.38, 0.985, 16.2, 1.57], ['brasskey', 12, 0.93, 9.05, 0.4], ['oosi1', 3.55, -3 + 0.762, 7.1, 0.4], ['oosi2', 4.3, 4.0 + 0.632, 16.0, 1.2]];
    for (const [id, x, y, z, r] of list) {
      const it = W.items[id] || makeItem(id, x, y, z, r);
      it.home = { x, y, z, rotY: r }; it.place(x, y, z, r);
    }
    W.items.brasskey.hide('hidden'); // in the well
    W.items.kolusu.hide('hidden');   // in the well too
    W.items.smallkey.hide('hidden'); // behind the stopped clock's glass
    // second wing
    const T4 = W.FLOOR[1];
    const wing = [['wingkey', 8.25, 0.05, 14.69, 1.57], ['sickle', 42.55, 0.515, 5.5, 0.4], ['fuse1', 28.75, 1.335, 4.82, 0.2], ['fuse2', 34.78, T4 + 0.745, 17.62, 1.4], ['fuse3', 32.1, T4 + 0.415, 0.5, 2.6],
      ['safeknob', 32.0, 0.72, 4.15, 0], ['bigkey', 38.55, 0.75, 1.3, 1.57], ['kolusu2', 37.55, 1.055, 9.37, 0.5], ['oosi3', 44.85, 0.79, 7.2, 1.2], ['oosi4', 40.2, T4 + 0.515, 0.5, 0.3]];
    for (const [id, x, y, z, r] of wing) { const it = W.items[id] || makeItem(id, x, y, z, r); it.home = { x, y, z, rotY: r }; it.place(x, y, z, r); }
    for (const id of ['wingkey', 'fuse2', 'safeknob', 'bigkey', 'kolusu2']) W.items[id].hide('hidden');
  };
  W.resetState = function (run) {
    for (const d of W.doors) d.reset();
    for (const l of W.lamps) { l.lit = false; l.flames.forEach(f => f.visible = false); }
    W.well.busy = false; W.well.used = false; W.well.bucket.visible = false;
    W.almirah.open = 0; W.almirah.target = 0;
    const m = W.main; m.locks = { pad: true, chain: true, num: true, bar: true }; m.pad.visible = m.chain.visible = m.num.visible = true; m.bar.visible = true; m.bar.position.set(m.x, 0.72, m.z - 0.15); m.bar.rotation.set(0, 0, 0); m.barT = 0; m.open = 0; m.opening = false; W.mainSolid.on = true;
    m.pad.position.set(m.x, 1.0, m.z - 0.11); m.pad.rotation.set(0, 0, 0); m.num.position.set(m.x + 0.3, 1.8, m.z - 0.11); m.num.rotation.set(0, 0, 0);
    for (const c of W.clues) { if (c.mesh.material.map) c.mesh.material.map.dispose(); c.mesh.material.map = c.make(run.code[c.pos - 1], c.pos); c.mesh.material.needsUpdate = true; }
    W.spawnItems(run);
    // puzzles and story props
    const c = W.clock; c.open = c.target = 0; c.running = false; c.set(run.clockStart.h, run.clockStart.m); W.clockHit.position.y = 1.05; W.clockHit.updateMatrixWorld();
    const pa = W.pall; pa.open = pa.target = 0; pa.counts = [0, 0, 0, 0]; pa.syms = run.pallSyms; pa.board.setSeeds(pa.counts); W.pallHit.position.y = 0.12; W.pallHit.updateMatrixWorld();
    pa.board.plaques.forEach((pm, k) => { if (pm.material.map) pm.material.map.dispose(); pm.material.map = K.makeSymbolPanel(run.pallSyms[k]); pm.material.needsUpdate = true; });
    W.phone.ring = 0; W.cradleKolusu.visible = false; W.cradleAmp = W.cradleTarget = 0.08; W.swingAmp = 0;
    const fp = W.fallPlate; fp.t = -1; fp.mesh.position.set(fp.home.x, fp.home.y, fp.home.z); fp.mesh.rotation.set(0, 0, -(Math.PI / 2 - 0.25));
    W.ghost.visible = false; K.Valli && K.Valli.hide(); W.setMirror(false);
    W.wingReset(run);
  };
  // both mirror faces are made once and uploaded during loading: no texture work mid-game
  W.mirrorTex = function () {
    if (W._mt) return W._mt;
    const base = K.makeMirrorTex(null, 0);
    const c = K.canvas(256, 384), g = c.getContext('2d'); g.drawImage(base.image, 0, 0);
    g.save(); g.translate(128, 170); g.rotate(-0.08); g.font = 'bold 54px "Hind Madurai","Noto Sans Tamil",sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(150,18,12,0.85)'; g.fillText('வள்ளி', 0, 0); g.font = 'bold 40px sans-serif'; g.fillText('?', 70, 50); g.restore();
    g.fillStyle = 'rgba(140,16,10,0.7)'; const r = K.rng(5); for (let i = 0; i < 7; i++) { const x = 70 + i * 18 + r() * 8; g.fillRect(x, 180, 2.5, 20 + r() * 60); }
    return (W._mt = { base, msg: K.toTex(c, false) });
  };
  W.setMirror = function (msg) {
    if (W._mirrorMsg === msg) return; W._mirrorMsg = msg;
    const t = W.mirrorTex(); W.mirror.material.map = msg ? t.msg : t.base; W.mirror.material.needsUpdate = true;
  };

  /* ---------------- second wing: puzzle state ---------------- */
  const WHO = ['thatha', 'paatti', 'son', 'valli'];
  const WHO_NAME = { thatha: 'சொக்கலிங்கம்', paatti: 'மீனாட்சி', son: 'முருகப்பன்', valli: 'வள்ளி' };
  W.WHO = WHO; W.WHO_NAME = WHO_NAME;
  W.LETTERS = ['க', 'வ', 'ம', 'ள்', 'ன்', 'ளி', 'லா', 'ரா'];
  W.portraitTex = function (who, year) { const WG = W.wing, key = who + year; WG.porTex = WG.porTex || {}; if (!WG.porTex[key]) { WG.porTex[key] = K.makeFamilyPortrait(who, WHO_NAME[who], year); if (K.R) K.R.upload(WG.porTex[key]); } return WG.porTex[key]; };
  W.hangPortraits = function (years) { const WG = W.wing; WG.por.forEach((who, i) => { const m = WG.portraits[i].material; m.map = W.portraitTex(who, years[who]); m.needsUpdate = true; }); };
  W.wingReset = function (run) {
    const WG = W.wing, T4 = W.FLOOR[1];
    WG.fuses = 0; WG.power = false; WG.powerK = 0; WG.leverK = 0; WG.leverT = 0;
    WG.fuse.slots.forEach(s => s.visible = false); WG.fuse.lever.rotation.x = 0; WG.fuse.lamp.material.color.setHex(0x401010);
    W.powerGlows.forEach(g => g.visible = false); if (K.R) K.R.setGroup(4, 0, 0, 0);
    WG.radioT = 0; WG.radio.glow.material.color.setHex(0x1a1408);
    WG.rope.forEach(r => r.visible = true);
    WG.por = run.porOrder.slice(); WG.porDone = false; WG.nicheK = 0; WG.nicheT = 0; WG.niche.rotation.y = 0;
    W.hangPortraits(run.years);
    WG.portraitHit.position.y = T4 + 1.85; WG.portraitHit.updateMatrixWorld();
    if (WG.scaleTag.material.map) WG.scaleTag.material.map.dispose(); WG.scaleTag.material.map = K.makeSackTag(run.sack); WG.scaleTag.material.needsUpdate = true; if (K.R) K.R.upload(WG.scaleTag.material.map);
    WG.sack = run.sack; WG.onPan = [0, 0, 0, 0, 0]; WG.tilt = 0.2; WG.scaleDone = false; WG.drawerK = 0; WG.drawerT = 0;
    WG.scaleHit.position.y = 1.05; WG.scaleHit.updateMatrixWorld();
    WG.safeKnob = false; WG.safeK = 0; WG.safeT = 0; WG.safe.knob.visible = false; WG.safeHit.position.y = 0.72; WG.safeHit.updateMatrixWorld();
    WG.water = 0; WG.motorOn = false; WG.boxOpen = false; WG.tankFull = false; WG.tankHit.position.y = 0.6; WG.tankHit.updateMatrixWorld();
    WG.letters = run.letters.slice(); WG.letterLock.visible = true;
    W.cradleKolusu2.visible = false;
  };
  /* ---------------- save / restore of everything that changes while playing ---------------- */
  W.snapshot = function () {
    const WG = W.wing, m = W.main;
    return {
      locks: Object.assign({}, m.locks), lamps: W.lamps.map(l => (l.lit ? 1 : 0)), well: W.well.used ? 1 : 0, alm: W.almirah.target,
      clock: W.clock.running ? 1 : 0, pall: W.pall.target, pallC: W.pall.counts.slice(), cradle: [W.cradleKolusu.visible ? 1 : 0, W.cradleKolusu2.visible ? 1 : 0],
      wing: { fuses: WG.fuses, power: WG.power ? 1 : 0, por: WG.por.slice(), porDone: WG.porDone ? 1 : 0, onPan: WG.onPan.slice(), scaleDone: WG.scaleDone ? 1 : 0,
        knob: WG.safeKnob ? 1 : 0, safe: WG.safeT ? 1 : 0, water: Math.round(WG.water * 1000) / 1000, full: WG.tankFull ? 1 : 0, box: WG.boxOpen ? 1 : 0, letters: WG.letters.slice() }
    };
  };
  W.restore = function (w, doors, items, run) {
    const WG = W.wing, m = W.main, away = h => { h.position.y = -20; h.updateMatrixWorld(); };
    for (const id in doors || {}) { const d = W.doorById[id]; if (!d) continue; d.locked = !!doors[id][0]; d.setOpen(!!doors[id][1], true); d.update(0); }
    if (!W.doorById.granary.locked) WG.rope.forEach(r => (r.visible = false));
    if (!W.doorById.valli.locked) WG.letterLock.visible = false;
    for (const id in items || {}) { const it = W.items[id], v = items[id]; if (!it) continue; if (v[0] === 'world') it.place(v[1], v[2], v[3], v[4]); else it.hide(v[0] === 'hand' ? 'gone' : v[0]); }
    if (!w) return;
    const L = (m.locks = Object.assign({ pad: true, chain: true, num: true, bar: true }, w.locks));
    if (!L.pad) { m.pad.position.set(12.1, 0.05, 19.7); m.pad.rotation.set(1.2, 0.4, 1.5); }
    if (!L.chain) m.chain.visible = false;
    if (!L.num) { m.num.position.set(12.4, 0.05, 19.65); m.num.rotation.set(0.3, 0.8, 1.57); }
    if (!L.bar) { m.barT = 1; m.bar.position.set(m.x, 0.08, m.z - 0.55); m.bar.rotation.set(-0.5, 0, 0.06); }
    W.lamps.forEach((l, i) => { l.lit = !!w.lamps[i]; l.flames.forEach(f => (f.visible = l.lit)); });
    if (w.well) { W.well.used = true; W.well.bucket.visible = true; W.well.bucket.position.set(12.16, 1.75, 10); }
    if (w.alm) { W.almirah.target = W.almirah.open = 1; away(W.almirahHit); }
    if (w.clock) { const c = W.clock; c.running = true; c.target = c.open = 1; c.door.rotation.y = Math.PI - 1.7; c.set(run.clock.h, run.clock.m); away(W.clockHit); }
    if (w.pall) { const pa = W.pall; pa.target = pa.open = 1; pa.drawer.position.z = pa.z + 0.2; away(W.pallHit); }
    if (w.pallC) { W.pall.counts = w.pallC.slice(); W.pall.board.setSeeds(W.pall.counts); }
    if (w.cradle) { W.cradleKolusu.visible = !!w.cradle[0]; W.cradleKolusu2.visible = !!w.cradle[1]; }
    const g = w.wing; if (!g) return;
    WG.fuses = g.fuses; WG.fuse.slots.forEach((sl, i) => (sl.visible = i < g.fuses));
    if (g.power) { WG.power = true; WG.leverT = WG.leverK = 1; WG.fuse.lever.rotation.x = 2.4; WG.powerK = 0; WG.fuse.lamp.material.color.setHex(0x5cff86); }
    WG.por = g.por.slice(); W.hangPortraits(run.years);
    if (g.porDone) { WG.porDone = true; WG.nicheT = WG.nicheK = 1; WG.niche.rotation.y = -1.5; away(WG.portraitHit); }
    WG.onPan = g.onPan.slice();
    if (g.scaleDone) { WG.scaleDone = true; WG.drawerT = WG.drawerK = 1; WG.scale.drawer.position.z = 4.2 - 0.17; away(WG.scaleHit); }
    if (g.knob) { WG.safeKnob = true; WG.safe.knob.visible = true; }
    if (g.safe) { WG.safeT = WG.safeK = 1; WG.safe.door.rotation.y = -Math.PI / 2 - 1.75; away(WG.safeHit); }
    WG.water = g.full ? 1 : g.water || 0; WG.tankFull = !!g.full;
    if (g.box) { WG.boxOpen = true; away(WG.tankHit); }
    WG.letters = g.letters.slice();
  };
  const _v = new THREE.Vector3();
  function wingUpdate(dt, t) {
    const WG = W.wing; if (!WG.fuse) return;
    // power: the main switch drops, the bulbs stutter, then burn steady
    if (WG.leverT !== WG.leverK) { WG.leverK += Math.sign(WG.leverT - WG.leverK) * Math.min(dt * 4, Math.abs(WG.leverT - WG.leverK)); WG.fuse.lever.rotation.x = WG.leverK * 2.4; }
    if (WG.power && WG.powerK < 1) {
      WG.powerK = Math.min(1, WG.powerK + dt * 0.7);
      const k = WG.powerK < 0.6 ? (Math.sin(WG.powerK * 60) > 0.2 ? WG.powerK : 0.05) : WG.powerK;
      if (K.R) K.R.setGroup(4, 1.0 * k, 0.8 * k, 0.55 * k);
      W.powerGlows.forEach(g => { g.visible = k > 0.3; g.material.opacity = k; });
      if (WG.powerK >= 1 && K.R) K.R.reprobe();
    }
    // radio dial
    if (WG.radioT > 0) { WG.radioT -= dt; const on = WG.radioT > 0; WG.radio.glow.material.color.setHex(on ? (Math.sin(t * 9) > -0.6 ? 0xffb347 : 0xd88a2a) : 0x1a1408); }
    // pump and tank
    if (WG.motorOn) {
      WG.motor.fan.rotation.x += dt * 38;
      WG.water = Math.min(1, WG.water + dt / 11);
      if (WG.water >= 1) { WG.motorOn = false; WG.tankFull = true; if (W.onTankFull) W.onTankFull(); }
    }
    const tk = WG.tank, wy = -0.45 + WG.water * 1.28;
    if (Math.abs(tk.water.position.y - wy) > 1e-4) { tk.water.position.y = wy; }
    const by = Math.max(-0.42, wy - 0.13) + (WG.water > 0.25 ? Math.sin(t * 1.7) * 0.012 : 0);
    if (Math.abs(tk.box.position.y - by) > 1e-4) { tk.box.position.y = by; tk.box.rotation.y = 0.3 + (WG.water > 0.25 ? Math.sin(t * 0.6) * 0.15 : 0); }
    // beam balance: tilts towards the heavier side; the pans hang straight
    const S = WG.scale, sum = WG.onPan.reduce((a, on, i) => a + (on ? S.weights[i].userData.wv : 0), 0);
    const tgt = Math.max(-1, Math.min(1, (WG.sack - sum) / 8)) * 0.2;
    WG.tilt += (tgt - WG.tilt) * Math.min(1, dt * 3.5); S.beam.rotation.z = WG.tilt; S.pans.forEach(p => p.rotation.z = -WG.tilt);
    S.pans[1].updateMatrixWorld(true); S.pans[1].getWorldPosition(_v);
    let n = 0;
    S.weights.forEach((m, i) => {
      if (WG.onPan[i]) { const a = n++ * 2.2, r = n > 1 ? 0.045 : 0; m.position.set(_v.x + Math.cos(a) * r, _v.y - 0.272 + m.geometry.parameters.height / 2, _v.z + Math.sin(a) * r); }
      else m.position.copy(m.userData.home);
    });
    if (WG.drawerT !== WG.drawerK) { WG.drawerK = Math.min(WG.drawerT, WG.drawerK + dt * 1.2); S.drawer.position.z = 4.2 - WG.drawerK * 0.17; }
    // safe door and portrait cabinet
    if (WG.safeT !== WG.safeK) { WG.safeK = Math.min(WG.safeT, WG.safeK + dt * 0.8); WG.safe.door.rotation.y = -Math.PI / 2 - WG.safeK * 1.75; }
    if (WG.nicheT !== WG.nicheK) { WG.nicheK = Math.min(WG.nicheT, WG.nicheK + dt * 1.1); WG.niche.rotation.y = -WG.nicheK * 1.5; }
  }

  /* per-frame ambient animation */
  W.update = function (dt, t) {
    wingUpdate(dt, t);
    for (const d of W.doors) d.update(dt);
    if (W.swing) { W.swing.rotation.x = Math.sin(t * 0.7) * 0.05 + Math.sin(t * 0.23) * 0.03; }
    if (W.clothes) W.clothes.forEach((c, i) => { c.rotation.x = Math.sin(t * 1.7 + i) * 0.22 + Math.sin(t * 3.1 + i * 2) * 0.06; });
    if (W.cradle) { W.cradleAmp += (W.cradleTarget - W.cradleAmp) * Math.min(1, dt * 0.8); W.cradle.rotation.x = Math.sin(t * 1.6) * W.cradleAmp; }
    if (W.swing && W.swingAmp) W.swing.rotation.x += Math.sin(t * 1.9) * W.swingAmp;
    if (W.pendulum) W.pendulum.rotation.z = W.clock && W.clock.running ? Math.sin(t * Math.PI) * 0.13 : 0.02;
    const c = W.clock; if (c && c.open !== c.target) { c.open = Math.min(c.target, c.open + dt * 1.2); c.door.rotation.y = Math.PI - c.open * 1.7; }
    const pa = W.pall; if (pa && pa.open !== pa.target) { pa.open = Math.min(pa.target, pa.open + dt * 1.4); pa.drawer.position.z = pa.z + pa.open * 0.2; }
    const ph = W.phone; if (ph) { ph.handset.position.y = 0.905 + (ph.ring ? Math.abs(Math.sin(t * 38)) * 0.006 : 0); ph.handset.rotation.z = ph.ring ? Math.sin(t * 31) * 0.05 : 0; }
    const fp = W.fallPlate; if (fp && fp.t >= 0) {
      fp.t += dt; const k = fp.t, m = fp.mesh;
      if (k < 0.35) { m.rotation.z = -(Math.PI / 2 - 0.25) + k * 1.6; m.position.x = fp.x + k * 0.5; }
      else if (k < 0.9) { const f = (k - 0.35) / 0.55; m.position.set(fp.x + 0.18 + f * 0.4, 2.13 - f * f * 2.12, fp.z + f * 0.25); m.rotation.z += dt * 14; }
      else { m.position.set(fp.x + 0.6, 0.012, fp.z + 0.25); const w = Math.max(0, 1.6 - k); m.rotation.set(0, k * 3, w * Math.sin(k * 30) * 0.25); if (k > 1.6) fp.t = -2; }
    }
    for (const v of W.poojaLamps) v.flames.forEach((f, i) => f.scale.set(1, 0.85 + Math.sin(t * 15 + i) * 0.15, 1));
    for (const v of W.extraFlames) v.scale.set(1, 0.85 + Math.sin(t * 14 + v.id) * 0.15, 1);
    W.lamps.forEach((l, i) => {
      if (l.lit) l.flames.forEach((f, k) => f.scale.set(1, 0.85 + Math.sin(t * 17 + k * 2) * 0.18, 1));
      l.glow = Math.min(1, (l.glow || 0) + (l.lit ? dt * 2.5 : -dt * 4)); if (l.glow < 0) l.glow = 0;
      const k = l.glow * (0.88 + Math.sin(t * 11 + i) * 0.06 + Math.random() * 0.05); if (K.R) K.R.setGroup(i, 1.0 * k, 0.56 * k, 0.2 * k);
    });
    const lp = K.listenerPos;
    for (const id in W.items) { const it = W.items[id]; if (it.state !== 'world') continue; const near = !lp || Math.abs(lp.x - it.mesh.position.x) + Math.abs(lp.z - it.mesh.position.z) + Math.abs(lp.y - it.mesh.position.y) < 9; it.glint.visible = near; if (near) it.glint.material.opacity = 0.25 + Math.max(0, Math.sin(t * 2.2 + it.home.x)) * 0.55; }
    // almirah doors
    const a = W.almirah; if (a.open !== a.target) { a.open += Math.sign(a.target - a.open) * Math.min(dt * 1.5, Math.abs(a.target - a.open)); }
    for (const d of a.doors) d.piv.rotation.y = -d.s * a.open * 1.7;
    // main door leaves
    const m = W.main; if (m.opening && m.open < 1) m.open = Math.min(1, m.open + dt * 0.35);
    if (m.barT > 0 && m.barT < 1) { // the crossbar is lifted out of its brackets and dropped on the floor
      m.barT = Math.min(1, m.barT + dt * 1.3); const k = m.barT, f = Math.max(0, (k - 0.35) / 0.65);
      m.bar.position.set(m.x, k < 0.35 ? 0.72 + 0.14 * Math.sin(k / 0.35 * Math.PI / 2) : 0.86 - 0.78 * f * f, m.z - 0.15 - 0.4 * k); m.bar.rotation.set(-0.5 * f, 0, 0.06 * f);
    }
    for (const l of m.leaves) l.piv.rotation.y = l.s * m.open * 1.6;
  };
})(window.K);
