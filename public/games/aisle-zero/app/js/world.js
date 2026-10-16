/* AISLE ZERO — the abandoned supermarket. Everything here is built in code with generated PBR-style textures:
   layout, collision boxes, navigation grid, lights, shelving with thousands of instanced products, props and pickups. */
(function () {
  const K = window.K;
  const W = (K.world = {});
  const PI = Math.PI;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];

  W.XI = 35.7; W.ZI = 47.7; W.CEIL = 3.4; // inner half-size of the store (m), ceiling height
  W.X0 = -36; W.Z0 = -48; W.CS = 0.5; W.GW = 144; W.GH = 192; // navigation grid: 0.5 m cells
  W.boxes = []; W.items = []; W.hides = []; W.panels = [];
  const addBox = (x0, x1, z0, z1, kind) => W.boxes.push({ x0, x1, z0, z1, kind });
  const addC = (cx, cz, hw, hd, kind) => addBox(cx - hw, cx + hw, cz - hd, cz + hd, kind);

  /* ---------------- layout ---------------- */
  const PAIRS = []; for (let i = 0; i < 9; i++) PAIRS.push(-20.8 + 5.2 * i); // double-sided shelf runs (x centres)
  const SEGS = [{ z0: -22, n: 10 }, { z0: -4, n: 10 }, { z0: 14, n: 6 }]; // modules of 1.3 m along z; cross aisles between
  const LM = 1.3, HW = 0.6; // module length, half-width of a double run
  const BOARDS = [0.2, 0.6, 1.0, 1.4]; // shelf board heights
  const AISLE_NAMES = ["COOKING OILS", "SPICES", "RICE & FLOUR", "SNACKS", "BEVERAGES", "SALT & SUGAR", "CLEANING", "SWEETS & HONEY", "BABY & PET", "FROZEN"];
  W.AISLES = AISLE_NAMES.map((en, i) => ({ n: i + 1, x: i === 0 ? -25 : i === 9 ? 25 : (PAIRS[i - 1] + PAIRS[i]) / 2, en }));
  W.spawn = { x: 0, z: 44, yaw: 0 };
  W.payPoint = { x: 0, z: 31 };
  W.exitPoint = { x: 0, z: -47.7 };
  W.creatureStart = [0, -40];

  const shelfFace = (pairIdx, side) => PAIRS[pairIdx] + side * 0.55; // x where items sit on a shelf face
  W.ITEM_DEFS = [
    { id: "oil", kind: "bottle", label: "OIL", x: shelfFace(0, -1), z: 17, y: BOARDS[1], color: 0x7dff9a, bg: "#7a8a2a", en: "Cooking oil", hEn: "Aisle 1 · Cooking Oils" },
    { id: "rice", kind: "bag", label: "RICE", x: shelfFace(1, 1), z: 0.2, y: BOARDS[1], color: 0xffe9a0, bg: "#b8a46a", en: "Rice bag", hEn: "Aisle 3 · Rice & Flour" },
    { id: "salt", kind: "salt", label: "SALT", x: shelfFace(5, -1), z: -15.5, y: BOARDS[2], color: 0xffffff, bg: "#cfd4d8", en: "Salt", hEn: "Aisle 6 · Salt & Sugar" },
    { id: "honey", kind: "jar", label: "HONEY", x: shelfFace(7, -1), z: 3.4, y: BOARDS[1], color: 0xffc23a, bg: "#c8861c", en: "Honey", hEn: "Aisle 8 · Sweets & Honey" },
    { id: "milk", kind: "carton", label: "MILK", x: 33.1, z: -11, y: 1.05, color: 0xcfe8ff, bg: "#dfe6ee", en: "Milk packet", hEn: "Freezer wall (east)" },
    { id: "bread", kind: "loaf", label: "BREAD", x: -30.2, z: 6, y: 1.05, color: 0xffb870, bg: "#a8743a", en: "Bread", hEn: "Bakery corner (west)" },
    { id: "biscuit", kind: "flat", label: "BISCUITS", x: -22.55, z: -38.1, y: 0.915, color: 0xff9ad0, bg: "#b04a6a", en: "Biscuits", hEn: "Stock room (west rack)" },
    { id: "tin", kind: "can", label: "TINS", x: 22.55, z: -38.1, y: 0.915, color: 0xff7a5a, bg: "#b8402a", en: "Tinned food", hEn: "Stock room (east rack)" },
  ];

  /* ---------------- generated textures ---------------- */
  function cv(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function tex(c, rx, ry, color) { const t = new THREE.CanvasTexture(c); if (color !== false) t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rx) t.repeat.set(rx, ry); t.anisotropy = 8; return t; }
  function noise(g, w, h, n, a, dark) { for (let i = 0; i < n; i++) { const v = dark ? Math.random() * 60 : 150 + Math.random() * 100; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5); } }
  function stains(g, w, h, n, rmax, col) { for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h, r = 8 + Math.random() * rmax; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${0.18 + Math.random() * 0.3})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); } }

  function floorMaps() {
    const S = 512, map = cv(S, S), rough = cv(S, S), bump = cv(S, S), g = map.getContext("2d"), r = rough.getContext("2d"), b = bump.getContext("2d");
    const shades = ["#4d4c47", "#53514b", "#484742", "#504e48"];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = shades[(x + y * 2) % 4]; g.fillRect(x * 256, y * 256, 256, 256);
      const v = 90 + Math.random() * 40; r.fillStyle = `rgb(${v},${v},${v})`; r.fillRect(x * 256, y * 256, 256, 256);
      b.fillStyle = "#999"; b.fillRect(x * 256, y * 256, 256, 256);
    }
    for (const c of [g, r, b]) { c.strokeStyle = c === r ? "#e0e0e0" : "#1a1a18"; c.lineWidth = 6; for (let k = 0; k < 2; k++) { c.beginPath(); c.moveTo(k * 256, 0); c.lineTo(k * 256, S); c.moveTo(0, k * 256); c.lineTo(S, k * 256); c.stroke(); } }
    noise(g, S, S, 700, 0.12, true); noise(g, S, S, 300, 0.05, false);
    stains(g, S, S, 22, 60, "20,18,12"); stains(r, S, S, 22, 70, "230,230,230"); stains(r, S, S, 8, 90, "40,40,40");
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(200,200,190,${Math.random() * 0.1})`; g.lineWidth = 1 + Math.random() * 2; const x = Math.random() * S, y = Math.random() * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-60, 60), y + rnd(-40, 40)); g.stroke(); }
    noise(b, S, S, 1500, 0.12, true);
    return { map: tex(map, 60, 80), rough: tex(rough, 60, 80, false), bump: tex(bump, 60, 80, false) };
  }
  function wallMap() {
    const w = 512, h = 512, c = cv(w, h), g = c.getContext("2d");
    g.fillStyle = "#6a6c63"; g.fillRect(0, 0, w, h);
    stains(g, w, h, 20, 80, "30,34,26"); noise(g, w, h, 1500, 0.18, true);
    for (let i = 0; i < 16; i++) { const x = Math.random() * w, l = 60 + Math.random() * 300; const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, "rgba(20,26,16,.45)"); gr.addColorStop(1, "rgba(20,26,16,0)"); g.fillStyle = gr; g.fillRect(x, 0, 4 + Math.random() * 14, l); }
    const gb = g.createLinearGradient(0, h * 0.62, 0, h); gb.addColorStop(0, "#2d4743"); gb.addColorStop(1, "#1d2e2c"); g.fillStyle = gb; g.fillRect(0, h * 0.64, w, h * 0.36);
    g.fillStyle = "#c9cbbf"; g.fillRect(0, h * 0.635, w, 5);
    stains(g, w, h * 0.4, 8, 50, "10,10,8"); noise(g, w, h, 1500, 0.4, true);
    for (let i = 0; i < 14; i++) { g.fillStyle = "rgba(110,110,100,.45)"; g.fillRect(Math.random() * w, h * 0.64 + Math.random() * h * 0.35, 3 + Math.random() * 10, 2 + Math.random() * 6); }
    return tex(c, 18, 1);
  }
  function ceilMap() {
    const S = 256, c = cv(S, S), g = c.getContext("2d");
    g.fillStyle = "#3a3c3b"; g.fillRect(0, 0, S, S); noise(g, S, S, 900, 0.2, true); stains(g, S, S, 6, 50, "40,30,10");
    g.strokeStyle = "#1c1d1d"; g.lineWidth = 5; g.strokeRect(0, 0, S, S); g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
    return tex(c, 60, 80);
  }
  const BRANDS = ["CRUNCHIES", "OAT BITES", "SUNRISE", "GOLDEN", "FRESHA", "CHOCO", "TEA TIME", "SPICY", "DAIRY", "PURE", "MAGIC", "JOLLY", "VITA", "NUTRI", "SOFT", "ZEST", "HERO", "BRIGHT", "MAXX", "HOMEY"];
  function atlasMap() {
    const S = 1024, C = 8, cs = S / C, c = cv(S, S), g = c.getContext("2d");
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const x = i * cs, y = j * cs, hue = (Math.random() * 360) | 0, sat = 25 + Math.random() * 35, lum = 28 + Math.random() * 28;
      g.fillStyle = `hsl(${hue},${sat}%,${lum}%)`; g.fillRect(x, y, cs, cs);
      g.fillStyle = `hsl(${(hue + 160) % 360},${sat + 10}%,${lum + 18}%)`; const style = (Math.random() * 3) | 0;
      if (style === 0) g.fillRect(x, y + cs * 0.12, cs, cs * 0.22); else if (style === 1) { g.beginPath(); g.arc(x + cs / 2, y + cs * 0.38, cs * 0.3, 0, 7); g.fill(); } else { g.fillRect(x, y + cs * 0.55, cs, cs * 0.14); g.fillRect(x, y + cs * 0.1, cs, cs * 0.06); }
      g.fillStyle = "rgba(255,255,255,.85)"; g.font = `bold ${(cs * 0.17) | 0}px Arial`; g.textAlign = "center"; g.fillText(pick(BRANDS), x + cs / 2, y + cs * 0.48);
      g.font = `${(cs * 0.09) | 0}px Arial`; g.fillStyle = "rgba(255,255,255,.55)"; g.fillText(pick(["500g", "1kg", "250g", "FAMILY PACK", "NEW", "2 for 1", "ORIGINAL"]), x + cs / 2, y + cs * 0.65);
      g.fillStyle = "rgba(240,240,240,.8)"; g.fillRect(x + cs * 0.3, y + cs * 0.8, cs * 0.4, cs * 0.12); g.fillStyle = "#111"; for (let k = 0; k < 14; k++) g.fillRect(x + cs * 0.32 + k * 3.4, y + cs * 0.82, 1 + (k % 3), cs * 0.08);
      const gr = g.createLinearGradient(x, y, x + cs, y); gr.addColorStop(0, "rgba(0,0,0,.35)"); gr.addColorStop(0.5, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,.35)"); g.fillStyle = gr; g.fillRect(x, y, cs, cs);
      g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 3; g.strokeRect(x, y, cs, cs);
    }
    noise(g, S, S, 6000, 0.22, true); stains(g, S, S, 40, 40, "40,35,25");
    const t = tex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }
  function gridAlpha() { const c = cv(64, 64), g = c.getContext("2d"); g.clearRect(0, 0, 64, 64); g.strokeStyle = "#fff"; g.lineWidth = 4; g.strokeRect(0, 0, 64, 64); g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke(); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
  function signTex(lines, w, h, bg, fg, border) {
    const c = cv(w, h), g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = border || fg; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; lines.forEach((ln) => { g.font = ln.font; g.fillText(ln.t, w / 2, ln.y * h); }); noise(g, w, h, 600, 0.35, true); return tex(c);
  }
  function labelTex(text, bg) {
    const c = cv(128, 128), g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(0, 40, 128, 48); g.fillStyle = "#1a1a1a"; g.font = `bold ${text.length > 5 ? 20 : 28}px Arial`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 64, 64);
    g.fillStyle = "rgba(255,255,255,.4)"; g.fillRect(0, 100, 128, 6); noise(g, 128, 128, 400, 0.3, true); return tex(c);
  }
  function lockerTex() {
    const c = cv(128, 256), g = c.getContext("2d"); g.fillStyle = "#4b5b59"; g.fillRect(0, 0, 128, 256); noise(g, 128, 256, 1400, 0.5, true); stains(g, 128, 256, 6, 40, "50,30,10");
    g.fillStyle = "#222"; for (let i = 0; i < 6; i++) g.fillRect(24, 22 + i * 7, 80, 3); for (let i = 0; i < 6; i++) g.fillRect(24, 200 + i * 7, 80, 3);
    g.fillStyle = "#a8aaa6"; g.fillRect(96, 110, 8, 30); g.strokeStyle = "#2a2f2e"; g.lineWidth = 4; g.strokeRect(2, 2, 124, 252); g.fillStyle = "rgba(120,50,20,.35)"; g.fillRect(10, 230, 108, 20); return tex(c);
  }

  /* ---------------- instancing helpers ---------------- */
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function instanced(geo, mat, list, o) {
    o = o || {}; const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length;
    let cells = null; if (o.cells) { cells = new Float32Array(list.length * 2); }
    list.forEach((t, i) => {
      _e.set(t.rx || 0, t.ry || 0, t.rz || 0); _q.setFromEuler(_e); _p.set(t.x, t.y, t.z); _s.set(t.sx === undefined ? 1 : t.sx, t.sy === undefined ? 1 : t.sy, t.sz === undefined ? 1 : t.sz);
      _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); if (t.c !== undefined) im.setColorAt(i, _c.set(t.c));
      if (cells) { cells[i * 2] = t.cu; cells[i * 2 + 1] = t.cv; }
    });
    if (cells) geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false; im.castShadow = !!o.cast; im.receiveShadow = true; return im;
  }
  function mergeGeos(parts) {
    const pos = [], nor = [], uv = [], idx = []; let off = 0; const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
    parts.forEach(({ geo, x, y, z, rx, ry, rz }) => {
      const g = geo.index ? geo : geo; m.compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1)); nm.getNormalMatrix(m);
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); uv.push(u.getX(i), u.getY(i)); }
      for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); off += p.count;
    });
    const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx); return out;
  }
  const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  /* ---------------- shopping cart (used for the player's cart and scattered carts) ---------------- */
  const metal = new THREE.MeshStandardMaterial({ color: 0xb4b8ba, metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9 });
  let cartFrameGeo = null, cartBasketGeo = null, gridMat = null;
  function cartGeos() {
    if (cartFrameGeo) return;
    const parts = [];
    [-0.27, 0.27].forEach((sx) => { parts.push({ geo: bx(0.025, 0.025, 0.9), x: sx, y: 0.14, z: 0 }); parts.push({ geo: bx(0.025, 0.7, 0.025), x: sx * 0.95, y: 0.5, z: 0.45, rx: -0.12 }); parts.push({ geo: bx(0.025, 0.025, 0.05), x: sx, y: 0.14, z: -0.43 }); parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.035, 10).rotateZ(PI / 2), x: sx * 1.05, y: 0.05, z: 0.38 }); parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.035, 10).rotateZ(PI / 2), x: sx * 1.05, y: 0.05, z: -0.38 }); });
    parts.push({ geo: bx(0.58, 0.03, 0.03), x: 0, y: 0.84, z: 0.5 }); parts.push({ geo: bx(0.54, 0.025, 0.025), x: 0, y: 0.14, z: 0.38 });
    cartFrameGeo = mergeGeos(parts);
    const bp = [{ geo: new THREE.PlaneGeometry(0.54, 0.86).rotateX(-PI / 2), x: 0, y: 0.32, z: 0 }, { geo: new THREE.PlaneGeometry(0.86, 0.34), x: -0.28, y: 0.5, z: 0, ry: -PI / 2 }, { geo: new THREE.PlaneGeometry(0.86, 0.34), x: 0.28, y: 0.5, z: 0, ry: PI / 2 }, { geo: new THREE.PlaneGeometry(0.56, 0.34), x: 0, y: 0.5, z: -0.43 }, { geo: new THREE.PlaneGeometry(0.58, 0.34), x: 0, y: 0.5, z: 0.43, ry: PI }];
    cartBasketGeo = mergeGeos(bp);
    const gt = gridAlpha(); gt.repeat.set(6, 6); gridMat = new THREE.MeshStandardMaterial({ color: 0xc4c8ca, metalness: 0.8, roughness: 0.4, alphaMap: gt, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide, map: gt });
  }
  W.makeCart = function () { cartGeos(); const g = new THREE.Group(); const f = new THREE.Mesh(cartFrameGeo, metal), b = new THREE.Mesh(cartBasketGeo, gridMat); f.castShadow = b.castShadow = true; g.add(f); g.add(b); return g; };

  /* ---------------- build ---------------- */
  W.build = function (scene) {
    const root = (W.root = new THREE.Group()); scene.add(root);
    const HX = W.XI, HZ = W.ZI;

    // environment map: a dark room with a few strip lights, so wet floors and metal pick up soft reflections
    try {
      const envScene = new THREE.Scene(); const room = new THREE.Mesh(new THREE.BoxGeometry(60, 12, 60), new THREE.MeshBasicMaterial({ color: 0x07090a, side: THREE.BackSide })); envScene.add(room);
      const strip = new THREE.MeshBasicMaterial({ color: 0xffffff }); for (let i = -3; i <= 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 40), strip); m.position.set(i * 8, 5.6, 0); envScene.add(m); }
      const pm = new THREE.PMREMGenerator(K.renderer); scene.environment = pm.fromScene(envScene, 0.03).texture; pm.dispose();
    } catch (e) { console.warn("env map skipped", e); }

    /* floor */
    const fm = floorMaps();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 0.6, HZ * 2 + 0.6), new THREE.MeshStandardMaterial({ map: fm.map, roughnessMap: fm.rough, bumpMap: fm.bump, bumpScale: 1.2, roughness: 1, metalness: 0.12, envMapIntensity: 0.55 }));
    floor.rotation.x = -PI / 2; floor.receiveShadow = true; root.add(floor);
    /* ceiling */
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 0.6, HZ * 2 + 0.6), new THREE.MeshStandardMaterial({ map: ceilMap(), roughness: 1 }));
    ceil.rotation.x = PI / 2; ceil.position.y = W.CEIL; root.add(ceil);
    /* walls */
    const wt = wallMap(); const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.95 });
    const wall = (len, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, W.CEIL), wallMat.clone()); m.material.map = wt.clone(); m.material.map.needsUpdate = true; m.material.map.repeat.set(len / 4, 1); m.position.set(x, W.CEIL / 2, z); m.rotation.y = ry; m.receiveShadow = true; root.add(m); return m; };
    wall(HX * 2, 0, -HZ, 0); wall(HZ * 2, -HX, 0, PI / 2); wall(HZ * 2, HX, 0, -PI / 2);
    // front wall: rolled-down steel shutters over the shop windows, with dead glass doors
    { const c = cv(512, 256), g = c.getContext("2d"); g.fillStyle = "#58605f"; g.fillRect(0, 0, 512, 256); for (let y = 0; y < 256; y += 10) { const gr = g.createLinearGradient(0, y, 0, y + 10); gr.addColorStop(0, "#7a8381"); gr.addColorStop(1, "#3c4342"); g.fillStyle = gr; g.fillRect(0, y, 512, 9); } noise(g, 512, 256, 3000, 0.5, true); stains(g, 512, 256, 14, 50, "60,35,10");
      const t = tex(c, 4, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, W.CEIL), new THREE.MeshStandardMaterial({ map: t, metalness: 0.5, roughness: 0.55 })); m.position.set(0, W.CEIL / 2, HZ); m.rotation.y = PI; root.add(m);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.4), new THREE.MeshBasicMaterial({ map: signTex([{ t: "SRI VELAN SUPER MARKET", font: "bold 54px Arial", y: 0.38 }, { t: "CLOSED SINCE 1998", font: "bold 34px Arial", y: 0.78 }], 800, 112, "#1a1410", "#b9a97a", "#6a1a1a"), color: 0x9a9a9a })); sg.position.set(0, 2.35, HZ - 0.05); sg.rotation.y = PI; root.add(sg); }
    // baseboards + wall pilasters
    const dark = new THREE.MeshStandardMaterial({ color: 0x26302f, roughness: 0.8 });
    [[0, -HZ + 0.06, HX * 2, 0.12, 0.12], [0, HZ - 0.06, HX * 2, 0.12, 0.12], [-HX + 0.06, 0, 0.12, 0.12, HZ * 2], [HX - 0.06, 0, 0.12, 0.12, HZ * 2]].forEach(([x, z, w, h, d]) => { const m = new THREE.Mesh(bx(w, h, d), dark); m.position.set(x, 0.06, z); root.add(m); });
    const pil = [];
    for (let z = -36; z <= 36; z += 12) { pil.push({ x: -HX + 0.25, y: W.CEIL / 2, z, sx: 0.5, sy: W.CEIL, sz: 0.5 }); pil.push({ x: HX - 0.25, y: W.CEIL / 2, z, sx: 0.5, sy: W.CEIL, sz: 0.5 }); }
    root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x777a72, roughness: 0.9 }), pil));

    /* ---------- stock-room dividing wall (z = -26) with two wide doorways ---------- */
    { const parts = [[-HX, -16], [-12, 12], [16, HX]]; const wm = new THREE.MeshStandardMaterial({ map: wt.clone(), roughness: 0.95 });
      parts.forEach(([a, b]) => { const len = b - a, m = new THREE.Mesh(bx(len, W.CEIL, 0.3), wm.clone()); m.material.map = wt.clone(); m.material.map.needsUpdate = true; m.material.map.repeat.set(len / 4, 1); m.position.set((a + b) / 2, W.CEIL / 2, -26); m.castShadow = m.receiveShadow = true; root.add(m); addBox(a, b, -26.15, -25.85, "wall"); });
      const lintel = new THREE.Mesh(bx(4, 0.7, 0.3), dark); [-14, 14].forEach((x) => { const l = lintel.clone(); l.position.set(x, W.CEIL - 0.35, -26); root.add(l); }); }

    /* ---------- shelving ---------- */
    const structList = [], railList = [], bins = [], prodBoxes = [], prodCyl = [];
    const atlas = atlasMap();
    const structMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.5, envMapIntensity: 0.7 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const cell = () => { const i = (Math.random() * 64) | 0; return { cu: (i % 8) / 8, cv: (7 - ((i / 8) | 0)) / 8 }; };
    function product(px, side, z, board) {
      const r = Math.random(); const base = BOARDS[board] + 0.015;
      if (r < 0.6) { const w = rnd(0.12, 0.3), h = rnd(0.16, 0.36), d = rnd(0.1, 0.28), cl = cell(); prodBoxes.push({ x: px + side * (0.1 + d / 2 + rnd(0, 0.04)), y: base + h / 2, z: z, sx: d, sy: h, sz: w, ry: rnd(-0.08, 0.08), rz: Math.random() < 0.05 ? rnd(-1.3, 1.3) : 0, c: _gray(0.55 + Math.random() * 0.45), ...cl }); return w; }
      const rad = r < 0.85 ? rnd(0.035, 0.05) : rnd(0.045, 0.06), h = r < 0.85 ? rnd(0.09, 0.16) : rnd(0.2, 0.3), cl = cell();
      const rows = r < 0.85 ? 3 : 1; for (let k = 0; k < rows; k++) prodCyl.push({ x: px + side * (0.12 + rad + k * rad * 2.05), y: base + h / 2, z, sx: rad * 2, sy: h, sz: rad * 2, c: _gray(0.55 + Math.random() * 0.45), ...cl });
      return rad * 2 + 0.01;
    }
    const _gray = (v) => { const c = (Math.round(v * 255) << 16) | (Math.round(v * 255) << 8) | Math.round(v * 255); return c; };
    function shelfRun(px, z0, n, opts) {
      opts = opts || {}; const len = n * LM, zc = z0 + len / 2, tall = opts.tall;
      const H = tall ? 3.0 : 1.8;
      structList.push({ x: px, y: H / 2, z: zc, sx: 0.04, sy: H, sz: len, c: 0x444a4b }); // spine
      structList.push({ x: px, y: 0.06, z: zc, sx: HW * 2, sy: 0.12, sz: len, c: 0x2a2e2f }); // kick plate
      structList.push({ x: px, y: H + 0.02, z: zc, sx: HW * 2, sy: 0.04, sz: len, c: 0x555b5c }); // top cap
      for (let i = 0; i <= n; i++) structList.push({ x: px, y: H / 2, z: z0 + i * LM, sx: HW * 2, sy: H, sz: 0.05, c: 0x5c6264 });
      const boards = tall ? [0.2, 0.9, 1.6, 2.3] : BOARDS;
      [-1, 1].forEach((side) => {
        boards.forEach((by, bi) => {
          structList.push({ x: px + side * 0.31, y: by, z: zc, sx: 0.52, sy: 0.03, sz: len, c: 0x72797b });
          railList.push({ x: px + side * 0.575, y: by + 0.02, z: zc, sx: 0.015, sy: 0.05, sz: len, c: pick([0xbfbfb0, 0xd0c070, 0xc8c8c8, 0xaa4a3a]) });
        });
        // products
        const empties = Math.random() < 0.5;
        for (let bi = 0; bi < 4; bi++) { let z = z0 + 0.05; const dens = rnd(0.55, 0.95); while (z < z0 + len - 0.1) { if (Math.random() > dens) { z += rnd(0.2, 0.6); continue; } const w = product(px, side, z + 0.08, tall ? 0 : bi); z += w + rnd(0.005, 0.03); } }
        if (empties) { /* ransacked: a few knocked-over products on the floor */ for (let k = 0; k < 3; k++) { const cl = cell(); prodBoxes.push({ x: px + side * rnd(0.8, 1.6), y: 0.07, z: z0 + rnd(0, len), sx: 0.2, sy: 0.14, sz: 0.26, ry: rnd(0, 6), rz: rnd(-0.3, 0.3), c: _gray(0.5), ...cl }); } }
      });
      if (!opts.noCaps) [[z0 - 0.35, -1], [z0 + len + 0.35, 1]].forEach(([zz]) => { bins.push({ x: px, y: 0.45, z: zz, sx: HW * 2, sy: 0.9, sz: 0.55, c: pick([0x6a5a40, 0x5a4a36, 0x6a6a68]) }); for (let k = 0; k < 7; k++) { const cl = cell(); prodBoxes.push({ x: px + rnd(-0.45, 0.45), y: 0.9 + rnd(0.05, 0.22), z: zz + rnd(-0.2, 0.2), sx: rnd(0.16, 0.26), sy: rnd(0.14, 0.3), sz: rnd(0.14, 0.26), ry: rnd(0, 6), rz: Math.random() < 0.2 ? rnd(-0.5, 0.5) : 0, c: _gray(0.6), ...cl }); } });
      addBox(px - HW - 0.02, px + HW + 0.02, z0 - (opts.noCaps ? 0.05 : 0.7), z0 + len + (opts.noCaps ? 0.05 : 0.7), "shelf");
    }
    PAIRS.forEach((px) => SEGS.forEach((s) => shelfRun(px, s.z0, s.n)));
    // stock room: taller pallet racking
    [-30, -22, 22, 30].forEach((px) => shelfRun(px, -45.5, 12, { tall: true, noCaps: true }));
    const prodMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.75, metalness: 0.02, envMapIntensity: 0.3 });
    prodMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aCell;").replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_UV\nvUv = vUv * 0.125 + aCell;\n#endif"); };
    root.add(instanced(bx(1, 1, 1), structMat, structList, { cast: true }));
    root.add(instanced(bx(1, 1, 1), railMat, railList));
    root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), bins, { cast: true }));
    root.add(instanced(bx(1, 1, 1), prodMat, prodBoxes, { cells: true }));
    root.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), prodMat, prodCyl, { cells: true }));

    /* ---------- produce & bakery corner (west) ---------- */
    { const crateTex = (() => { const c = cv(128, 128), g = c.getContext("2d"); g.fillStyle = "#6a5638"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#4a3a24"; for (let i = 0; i < 5; i++) g.fillRect(0, i * 26, 128, 4); noise(g, 128, 128, 250, 0.25, true); return tex(c); })();
      const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 }); const produce = [], crates = [];
      for (let i = 0; i < 9; i++) [-31.5, -28.8].forEach((x, k) => { const z = -19 + i * 4.4 + k * 1.2; crates.push({ x, y: 0.38, z, sx: 1.6, sy: 0.76, sz: 1.2, ry: 0 }); addC(x, z, 0.85, 0.65, "table"); for (let j = 0; j < 22; j++) produce.push({ x: x + rnd(-0.7, 0.7), y: 0.8 + rnd(0, 0.1), z: z + rnd(-0.5, 0.5), sx: rnd(0.1, 0.17), sy: rnd(0.08, 0.15), sz: rnd(0.1, 0.17), c: pick([0x4a5a2a, 0x6a2a1a, 0x7a6a2a, 0x3a4a1a, 0x5a3a1a, 0x2a3a1a]) }); });
      root.add(instanced(bx(1, 1, 1), crateMat, crates, { cast: true })); root.add(instanced(new THREE.SphereGeometry(0.5, 7, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), produce)); }
    // bakery counter with a glass case
    { const m = new THREE.Mesh(bx(1.1, 1.0, 5.2), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.6 })); m.position.set(-30.4, 0.5, 6); m.castShadow = true; root.add(m); const gl = new THREE.Mesh(bx(0.95, 0.5, 5.0), new THREE.MeshStandardMaterial({ color: 0x9fb4b0, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 })); gl.position.set(-30.4, 1.25, 6); root.add(gl); addBox(-31, -29.8, 3.3, 8.7, "counter"); }

    /* ---------- east freezer wall (glass-door units, cold light inside) ---------- */
    { const bodies = [], doors = [], glow = [];
      for (let k = 0; k < 17; k++) { const z = -21.6 + k * 2.6; bodies.push({ x: HX - 0.45, y: 1.1, z, sx: 0.9, sy: 2.2, sz: 2.5, c: 0x9aa09f }); doors.push({ x: HX - 0.93, y: 1.05, z, sx: 0.05, sy: 1.9, sz: 2.2 }); glow.push({ x: HX - 0.91, y: 1.05, z, sx: 0.02, sy: 1.8, sz: 2.1, c: k % 5 === 3 ? 0x151a1c : 0x9ec8dc }); }
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.5 }), bodies, { cast: true }));
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0c1012, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.42 }), doors));
      root.add(instanced(bx(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), glow));
      addBox(HX - 1.0, HX, -22.9, 22.9, "freezer");
      const stand = new THREE.Mesh(bx(0.7, 1.0, 0.7), new THREE.MeshStandardMaterial({ color: 0x3d4140, roughness: 0.5, metalness: 0.3 })); stand.position.set(33.1, 0.5, -11); stand.castShadow = true; root.add(stand); addC(33.1, -11, 0.45, 0.45, "table");
      const fl = new THREE.PointLight(0x9fd0e8, 0.8, 9); fl.position.set(HX - 2, 2, -6); root.add(fl); const fl2 = fl.clone(); fl2.position.set(HX - 2, 2, 12); root.add(fl2); W.freezerLights = [fl, fl2]; }

    /* ---------- lobby: checkout lanes, carts, vending ---------- */
    { const counterM = new THREE.MeshStandardMaterial({ color: 0x3d4140, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.5 }), belt = new THREE.MeshStandardMaterial({ color: 0x111313, roughness: 0.9 }), reg = new THREE.MeshStandardMaterial({ color: 0x1d2222, roughness: 0.5 }), scr = new THREE.MeshBasicMaterial({ color: 0x1c4a3a });
      const lanes = [-21, -14, -7, 0, 7, 14, 21];
      lanes.forEach((x, i) => { const g = new THREE.Group(); const c1 = new THREE.Mesh(bx(1.0, 1.0, 3.0), counterM); c1.position.set(0, 0.5, 0); const bl = new THREE.Mesh(bx(0.7, 0.04, 2.0), belt); bl.position.set(-0.05, 1.02, -0.5); const rg = new THREE.Mesh(bx(0.4, 0.3, 0.45), reg); rg.position.set(0.15, 1.15, 1.0); const sc = new THREE.Mesh(bx(0.28, 0.2, 0.02), scr); sc.position.set(0.15, 1.34, 0.8); sc.rotation.x = -0.3; g.add(c1, bl, rg, sc); [c1, rg].forEach((m) => (m.castShadow = true)); g.position.set(x, 0, 31 + 0.5); root.add(g);
        addC(x, 31.5, 0.55, 1.5, "counter"); const lamp = new THREE.Mesh(bx(0.5, 0.35, 0.1), new THREE.MeshBasicMaterial({ map: signTex([{ t: String(i + 1), font: "bold 90px Arial", y: 0.55 }], 128, 96, i === 3 ? "#0a2a10" : "#1a0808", i === 3 ? "#40ff70" : "#6a2020") })); lamp.position.set(x, 2.5, 31.5); lamp.rotation.y = PI; root.add(lamp); if (i === 3) W.payLamp = lamp; });
      // rope barriers + shopping carts + baskets + vending machine
      const carts = []; for (let i = 0; i < 9; i++) carts.push({ x: -31.4 + (i % 3) * 0.05, y: 0.0, z: 36 + i * 1.0, ry: PI / 2 + rnd(-0.1, 0.1) });
      [[-9, 22, 0.7], [11, -6, 2.0], [-22, 12, 4], [3, 14, 1.0], [27, -14, 5], [-12, 40, 3]].forEach(([x, z, r]) => carts.push({ x, z, ry: r, y: 0, rz: Math.random() < 0.2 ? PI / 2 : 0 }));
      cartGeos(); root.add(instanced(cartFrameGeo, metal, carts.map((c) => ({ ...c, y: c.rz ? 0.3 : 0 })), { cast: true })); root.add(instanced(cartBasketGeo, gridMat, carts.map((c) => ({ ...c, y: c.rz ? 0.3 : 0 })), { cast: true }));
      addBox(-32.5, -30.2, 35.4, 45, "cart");
      const vend = new THREE.Mesh(bx(1.0, 1.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.4, metalness: 0.3 })); vend.position.set(HX - 0.6, 0.95, 36); vend.castShadow = true; root.add(vend); const vg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0xbfe8ff })); vg.position.set(HX - 1.01, 1.15, 36); vg.rotation.y = -PI / 2; root.add(vg); addC(HX - 0.6, 36, 0.55, 0.5, "machine"); const vl = new THREE.PointLight(0xaee0ff, 0.8, 7); vl.position.set(HX - 2, 1.4, 36); root.add(vl); W.vendLight = vl;
      // wet-floor sign + mop bucket
      const ws = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.65, 4), new THREE.MeshStandardMaterial({ color: 0xd8c010, roughness: 0.6 })); ws.position.set(6, 0.33, 24); ws.rotation.y = 0.7; ws.castShadow = true; root.add(ws); }

    /* ---------- lockers (hiding places) ---------- */
    { const lt = lockerTex(), side = new THREE.MeshStandardMaterial({ color: 0x3e4c4a, roughness: 0.6, metalness: 0.4 }), front = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.55, metalness: 0.45 }); const mats = [side, side, side, side, front, side];
      const spots = [[-35.3, -14, 1, 0], [-35.3, 14, 1, 0], [-35.3, 26, 1, 0], [35.3, 40, -1, 0], [-35.3, -31, 1, 0], [-35.3, -41, 1, 0], [35.3, -31, -1, 0], [35.3, -41, -1, 0], [-10, -47.3, 0, 1], [10, -47.3, 0, 1]];
      const hideSign = new THREE.MeshBasicMaterial({ map: signTex([{ t: "HIDE", font: "bold 64px Arial", y: 0.52 }], 256, 112, "#06180c", "#46d39a"), transparent: true, opacity: 0.7 });
      spots.forEach(([x, z, ox, oz]) => {
        const along = [-oz, ox]; [-1, 0, 1].forEach((k) => { const m = new THREE.Mesh(bx(0.5, 2.0, 0.75), mats); m.position.set(x + along[0] * k * 0.52, 1.0, z + along[1] * k * 0.52); m.rotation.y = Math.atan2(ox, oz); m.castShadow = m.receiveShadow = true; root.add(m); });
        addBox(x - (ox ? 0.45 : 1.0), x + (ox ? 0.45 : 1.0), z - (oz ? 0.45 : 1.0), z + (oz ? 0.45 : 1.0), "locker");
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), hideSign); sg.position.set(x + ox * 0.4, 2.15, z + oz * 0.4); sg.rotation.y = Math.atan2(ox, oz); root.add(sg);
        W.hides.push({ x, z, ox, oz });
      }); }

    /* ---------- stock room clutter: pallets, cardboard stacks, barrels ---------- */
    { const cardTex = (() => { const c = cv(128, 128), g = c.getContext("2d"); g.fillStyle = "#8a6a44"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#6a4e30"; g.fillRect(0, 60, 128, 8); g.fillStyle = "#c8c0a8"; g.fillRect(8, 8, 40, 20); noise(g, 128, 128, 250, 0.22, true); stains(g, 128, 128, 3, 30, "40,30,10"); return tex(c); })();
      const cardMat = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.95 }), palM = new THREE.MeshStandardMaterial({ color: 0x6a5436, roughness: 0.95 }); const cards = [], pals = [];
      [[-12, -33, 3], [12, -34, 4], [-6, -41, 2], [7, -42.5, 3], [0, -31, 2], [-17, -43, 3], [17, -42, 2], [-34, -35, 2], [33.5, -35.5, 3]].forEach(([x, z, h]) => { pals.push({ x, y: 0.08, z, sx: 1.2, sy: 0.16, sz: 1.2 }); let hh = 0; for (let k = 0; k < h; k++) { cards.push({ x: x + rnd(-0.05, 0.05), y: 0.16 + 0.42 + k * 0.84, z: z + rnd(-0.05, 0.05), sx: 1.1, sy: 0.82, sz: 1.1, ry: rnd(-0.06, 0.06) }); hh = k; } addC(x, z, 0.65, 0.65, "crate"); });
      root.add(instanced(bx(1, 1, 1), palM, pals, { cast: true })); root.add(instanced(bx(1, 1, 1), cardMat, cards, { cast: true })); }

    /* ---------- emergency exit door (back wall) ---------- */
    { const hinge = new THREE.Group(); hinge.position.set(-1.0, 0, -HZ + 0.12); const leaf = new THREE.Mesh(bx(2.0, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a3a32, roughness: 0.5, metalness: 0.5 })); leaf.position.set(1.0, 1.15, 0); leaf.castShadow = true; const bar = new THREE.Mesh(bx(1.5, 0.06, 0.07), metal); bar.position.set(1.0, 1.05, 0.08); hinge.add(leaf, bar); root.add(hinge);
      const frame = new THREE.Mesh(bx(2.4, 2.5, 0.2), dark); frame.position.set(0, 1.25, -HZ - 0.04); root.add(frame);
      const outside = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.3), new THREE.MeshBasicMaterial({ color: 0xa8c4ff })); outside.position.set(0, 1.15, -HZ + 0.02); root.add(outside);
      W.door = { hinge, open: false, t: 0 }; addBox(-1.1, 1.1, -HZ - 0.2, -HZ + 0.5, "door"); W.exitBlock = { x0: -1.1, x1: 1.1, z0: -HZ - 0.2, z1: -HZ + 0.5 };
      const es = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshBasicMaterial({ map: signTex([{ t: "EXIT", font: "bold 66px Arial", y: 0.52 }], 256, 96, "#200505", "#ff3030") })); es.position.set(0, 2.75, -HZ + 0.1); root.add(es); W.exitSign = es;
      W.exitLight = new THREE.PointLight(0xff2020, 1.4, 14); W.exitLight.position.set(0, 2.3, -HZ + 1.5); root.add(W.exitLight); }

    /* ---------- aisle signs, wall writing, blood, puddles ---------- */
    W.AISLES.forEach((a) => { const mat = new THREE.MeshBasicMaterial({ map: signTex([{ t: "AISLE " + a.n, font: "bold 46px Arial", y: 0.34 }, { t: a.en, font: "bold 24px Arial", y: 0.74 }], 384, 140, "#162016", "#cfd8b0"), color: 0xb0b0b0 });
      [-22.4, -6.5, 11.5, 22.6].forEach((z) => { for (let s = 0; s < 2; s++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.73), mat); m.position.set(a.x, 2.8, z + (s ? 0.02 : -0.02)); m.rotation.y = s ? 0 : PI; root.add(m); } const rod = new THREE.Mesh(bx(0.03, 0.6, 0.03), dark); rod.position.set(a.x, 3.15, z); root.add(rod); }); });
    const bloodTex = (() => { const c = cv(128, 128), g = c.getContext("2d"); for (let i = 0; i < 60; i++) { const x = 64 + (Math.random() - 0.5) * 90, y = 64 + (Math.random() - 0.5) * 90, r = 2 + Math.random() * 14; g.fillStyle = `rgba(60,5,5,${0.3 + Math.random() * 0.5})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } for (let i = 0; i < 5; i++) { g.strokeStyle = "rgba(50,4,4,.6)"; g.lineWidth = 3 + Math.random() * 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + (Math.random() - 0.5) * 130, 64 + (Math.random() - 0.5) * 130); g.stroke(); } return tex(cvToAlpha(c)); })();
    function cvToAlpha(c) { return c; }
    const bloodMat = new THREE.MeshStandardMaterial({ map: bloodTex, transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < 24; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), bloodMat); d.rotation.x = -PI / 2; d.rotation.z = rnd(0, 6.28); const a = pick(W.AISLES); d.position.set(a.x + rnd(-1.2, 1.2), 0.012, rnd(-42, 40)); d.receiveShadow = true; root.add(d); }
    const pud = new THREE.MeshStandardMaterial({ color: 0x050707, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.85, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3 });
    for (let i = 0; i < 14; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(1, 14), pud); p.rotation.x = -PI / 2; p.scale.set(rnd(0.7, 2.2), rnd(0.6, 1.6), 1); const a = pick(W.AISLES); p.position.set(a.x + rnd(-1.3, 1.3), 0.015, rnd(-44, 42)); root.add(p); }
    const msg = (text, x, y, z, ry, w) => { const c = cv(512, 128), g = c.getContext("2d"); g.fillStyle = "rgba(110,8,8,.92)"; g.font = 'bold 56px "Segoe Script","Brush Script MT",cursive'; g.textAlign = "center"; g.fillText(text, 256, 74); for (let i = 0; i < 30; i++) g.fillRect(60 + Math.random() * 390, 84 + Math.random() * 20, 2, 8 + Math.random() * 28); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false })); m.position.set(x, y, z); m.rotation.y = ry; root.add(m); };
    msg("RUN", -14, 1.6, -HZ + 0.05, 0, 5); msg("IT WATCHES", -HX + 0.05, 1.6, -14, PI / 2, 5); msg("DON'T LOOK BACK", HX - 0.05, 1.6, 26, -PI / 2, 6); msg("NO WAY OUT", 0, 1.7, -25.8, 0, 5);

    /* ---------- ducts, pipes, light fixtures ---------- */
    { const ductM = new THREE.MeshStandardMaterial({ color: 0x70767a, metalness: 0.6, roughness: 0.5 }); const ducts = [];
      for (let x = -30; x <= 30; x += 10) ducts.push({ x: x + 2, y: W.CEIL - 0.28, z: 0, sx: 0.5, sy: 0.3, sz: 90, c: 0x363b3e });
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.55 }), ducts, { cast: false }));
      const pipes = []; for (let z = -40; z <= 40; z += 20) pipes.push({ x: 0, y: W.CEIL - 0.1, z, sx: 70, sy: 0.12, sz: 0.12, c: 0x5a4a3a }); root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.6 }), pipes)); }
    const pts = [];
    W.AISLES.forEach((a) => { for (let z = -23; z <= 22; z += 5.8) pts.push([a.x, z]); });
    for (let z = 25; z <= 45; z += 5) for (let x = -30; x <= 30; x += 6) pts.push([x, z]);
    for (let z = -44; z <= -28; z += 5.3) for (let x = -34; x <= 34; x += 6.8) pts.push([x, z]);
    for (let z = -20; z <= 20; z += 6) [-31, 30].forEach((x) => pts.push([x, z]));
    pts.forEach(([x, z]) => W.panels.push({ x, z, phase: Math.random() * 100, broken: Math.random() < 0.38, flick: 0, base: 0.8 + Math.random() * 0.2, v: 1 }));
    root.add(instanced(bx(0.34, 0.07, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a8f90, roughness: 0.5 }), pts.map(([x, z]) => ({ x, y: W.CEIL - 0.035, z }))));
    W.panelMesh = instanced(bx(0.22, 0.02, 1.15), new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.map(([x, z]) => ({ x, y: W.CEIL - 0.08, z, c: 0xffffff })));
    root.add(W.panelMesh);
    W.pool = []; for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xdbe6cf, 0, 16, 2); l.position.set(0, W.CEIL - 0.4, 0); root.add(l); W.pool.push(l); }
    W.blackout = 0;

    /* ---------- pickups: real-looking packages with a soft glow so the player can find them ---------- */
    const haloTex = (() => { const c = cv(64, 64), g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.3)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return tex(c); })();
    W.items = W.ITEM_DEFS.map((def) => {
      const lt = labelTex(def.label, def.bg), mt = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.55, emissive: new THREE.Color(def.color).multiplyScalar(0.18), emissiveMap: lt });
      const geo = { carton: bx(0.1, 0.22, 0.075), bag: bx(0.3, 0.44, 0.11), salt: bx(0.1, 0.16, 0.07), loaf: bx(0.36, 0.13, 0.12), flat: bx(0.3, 0.05, 0.2) }[def.kind] || (def.kind === "jar" ? new THREE.CylinderGeometry(0.06, 0.06, 0.12, 14) : def.kind === "can" ? new THREE.CylinderGeometry(0.05, 0.05, 0.1, 14) : new THREE.CylinderGeometry(0.04, 0.045, 0.3, 14));
      const mesh = new THREE.Mesh(geo, mt); const hgt = (geo.parameters.height || 0.2); mesh.position.y = hgt / 2; mesh.castShadow = true;
      const g = new THREE.Group(); g.add(mesh);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: def.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(1.9, 1.9, 1); sp.position.y = hgt / 2; g.add(sp);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.3, 8, 1, true), new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 1.65; g.add(beam);
      g.position.set(def.x, def.y, def.z); g.rotation.y = def.kind === "bag" ? 0.2 : 0; root.add(g);
      return { def, group: g, mesh, sp, beam, got: false, t: Math.random() * 6, baseY: def.y };
    });

    /* ---------- navigation + patrol waypoints ---------- */
    W.finalizeNav();
    W.waypoints = [];
    const wp = (x, z) => { const [i, j] = W.toCell(x, z); if (!W.blocked[j * W.GW + i]) W.waypoints.push([x, z]); };
    W.AISLES.forEach((a) => [-13.5, -6.5, 1, 11.5, 18, -22.6].forEach((z) => wp(a.x, z)));
    [[-24, 38], [-12, 38], [0, 38], [12, 38], [24, 38], [-30, 0], [-30, -12], [-30, 16], [30, -14], [30, 6], [-20, -32], [20, -32], [0, -36], [-6, -44], [6, -44], [-26, -42], [26, -44], [-14, -27.5], [14, -27.5]].forEach(([x, z]) => wp(x, z));
    return root;
  };

  W.resetItems = function () { W.items.forEach((it) => { it.got = false; it.group.visible = true; }); };

  /* ---------------- per-frame ---------------- */
  W.updateLights = function (dt, px, pz) {
    W.blackout = Math.max(0, W.blackout - dt); const ps = W.panels;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; p.phase += dt; let v = p.base;
      if (p.broken) { v = Math.sin(p.phase * 17) * Math.sin(p.phase * 5.3) > 0.82 ? 0.9 : 0.03; if (Math.random() < dt * 0.5) p.phase += Math.random() * 10; }
      else if (p.flick > 0) { p.flick -= dt; v = Math.random() < 0.5 ? 0.08 : 0.9; } else if (Math.random() < dt * 0.04) p.flick = 0.1 + Math.random() * 0.5;
      if (W.blackout > 0) v *= 0.02;
      p.v = v; _c.setRGB(0.8 * v, 0.9 * v, 0.72 * v); W.panelMesh.setColorAt(i, _c);
    }
    W.panelMesh.instanceColor.needsUpdate = true;
    const best = [];
    for (let i = 0; i < ps.length; i++) { const d = (ps[i].x - px) ** 2 + (ps[i].z - pz) ** 2; if (best.length < 6) { best.push([d, i]); best.sort((a, b) => a[0] - b[0]); } else if (d < best[5][0]) { best[5] = [d, i]; best.sort((a, b) => a[0] - b[0]); } }
    for (let i = 0; i < W.pool.length; i++) { const p = ps[best[i][1]]; W.pool[i].position.set(p.x, W.CEIL - 0.4, p.z); W.pool[i].intensity = p.v * 2.0; }
  };
  W.tick = function (dt, t) {
    W.items.forEach((it) => { if (it.got) return; it.t += dt; it.group.position.y = it.baseY + Math.sin(it.t * 1.6) * 0.012; it.sp.material.opacity = 0.5 + Math.sin(it.t * 2.5) * 0.18; it.beam.material.opacity = 0.17 + Math.sin(it.t * 1.7) * 0.05; });
    if (W.door) { const d = W.door; if (d.open && d.t < 1) d.t = Math.min(1, d.t + dt / 1.3); if (!d.open && d.t > 0) d.t = 0; d.hinge.rotation.y = -d.t * 1.95; }
    if (W.freezerLights) W.freezerLights.forEach((l, i) => (l.intensity = 0.6 + Math.sin(t * 7 + i) * 0.05 * (Math.random() < 0.02 ? 6 : 1)));
    if (W.vendLight) W.vendLight.intensity = 0.7 + (Math.random() < 0.03 ? -0.5 : 0);
  };
  W.updateItems = function () {};
  W.openDoor = function () {
    if (!W.door || W.door.open) return; W.door.open = true;
    const i = W.boxes.findIndex((b) => b.kind === "door"); if (i >= 0) W.boxes.splice(i, 1);
    W.exitSign.material.map = signTex([{ t: "EXIT", font: "bold 66px Arial", y: 0.52 }], 256, 96, "#021a05", "#40ff60"); W.exitSign.material.needsUpdate = true; W.exitLight.color.setHex(0x30ff50);
    if (W.payLamp) W.payLamp.material.color.setHex(0x333333);
  };
  W.closeDoor = function () {
    if (W.door) { W.door.open = false; W.door.t = 0; W.door.hinge.rotation.y = 0; }
    if (!W.boxes.some((b) => b.kind === "door")) W.boxes.push({ ...W.exitBlock, kind: "door" });
    W.exitSign.material.map = signTex([{ t: "EXIT", font: "bold 66px Arial", y: 0.52 }], 256, 96, "#200505", "#ff3030"); W.exitSign.material.needsUpdate = true; W.exitLight.color.setHex(0xff2020);
  };

  /* ---------------- navigation grid ---------------- */
  W.finalizeNav = function () {
    const { GW, GH, X0, Z0, CS } = W; W.blocked = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const cx = X0 + (i + 0.5) * CS, cz = Z0 + (j + 0.5) * CS; let b = 0;
      if (cx < -W.XI + 0.8 || cx > W.XI - 0.8 || cz < -W.ZI + 0.8 || cz > W.ZI - 0.8) b = 1;
      if (!b) for (const bx2 of W.boxes) { if (bx2.kind === "door") continue; if (cx > bx2.x0 - 0.55 && cx < bx2.x1 + 0.55 && cz > bx2.z0 - 0.55 && cz < bx2.z1 + 0.55) { b = 1; break; } }
      W.blocked[j * GW + i] = b;
    }
  };

  /* ---------------- collision / line of sight ---------------- */
  W.collide = function (p, r) {
    p.x = Math.max(-W.XI + r, Math.min(W.XI - r, p.x)); p.z = Math.max(-W.ZI + r, Math.min(W.ZI - r, p.z));
    for (let k = 0; k < 2; k++) for (const b of W.boxes) {
      const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1)), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
        else { const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z, m = Math.min(l, rr, t, bt); if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r; }
      }
    }
  };
  function segHitsBox(ax, az, bx2, bz, b, pad) {
    let t0 = 0, t1 = 1; const dx = bx2 - ax, dz = bz - az, mn = [b.x0 - pad, b.z0 - pad], mx = [b.x1 + pad, b.z1 + pad], o = [ax, az], d = [dx, dz];
    for (let k = 0; k < 2; k++) { if (Math.abs(d[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) return false; } else { let ta = (mn[k] - o[k]) / d[k], tb = (mx[k] - o[k]) / d[k]; if (ta > tb) { const t = ta; ta = tb; tb = t; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return false; } }
    return true;
  }
  const LOW = { table: 1, counter: 1, cart: 1, crate: 1, machine: 0 };
  W.hasLOS = function (ax, az, bx2, bz, pad) { for (const b of W.boxes) { if (LOW[b.kind] && !(pad > 0)) continue; if (segHitsBox(ax, az, bx2, bz, b, pad || 0)) return false; } return true; };

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let dist = null, queue = null;
  W.toCell = (x, z) => [Math.max(0, Math.min(W.GW - 1, Math.floor((x - W.X0) / W.CS))), Math.max(0, Math.min(W.GH - 1, Math.floor((z - W.Z0) / W.CS)))];
  W.cellCenter = (i, j) => [W.X0 + (i + 0.5) * W.CS, W.Z0 + (j + 0.5) * W.CS];
  function nearestFree(i, j) { if (!W.blocked[j * W.GW + i]) return [i, j]; for (let r = 1; r < 14; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < W.GW && b < W.GH && !W.blocked[b * W.GW + a]) return [a, b]; } return [i, j]; }
  W.buildField = function (tx, tz) {
    const { GW, GH } = W; if (!dist) { dist = new Int16Array(GW * GH); queue = new Int32Array(GW * GH); }
    let [ti, tj] = W.toCell(tx, tz); [ti, tj] = nearestFree(ti, tj); dist.fill(-1); let qh = 0, qt = 0; queue[qt++] = tj * GW + ti; dist[tj * GW + ti] = 0;
    while (qh < qt) { const c = queue[qh++], ci = c % GW, cj = (c / GW) | 0, cd = dist[c]; for (const [di, dj] of NB) { const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= GW || b >= GH) continue; const n = b * GW + a; if (W.blocked[n] || dist[n] !== -1) continue; if (di && dj && (W.blocked[cj * GW + a] || W.blocked[b * GW + ci])) continue; dist[n] = cd + 1; queue[qt++] = n; } }
  };
  W.nextStep = function (x, z) {
    const [ci, cj] = W.toCell(x, z), cur = dist[cj * W.GW + ci]; let best = null, bd = cur < 0 ? 1e9 : cur;
    for (const [di, dj] of NB) { const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= W.GW || b >= W.GH) continue; const d = dist[b * W.GW + a]; if (d < 0 || d >= bd) continue; if (di && dj && (W.blocked[cj * W.GW + a] || W.blocked[b * W.GW + ci])) continue; bd = d; best = [a, b]; }
    return best ? W.cellCenter(best[0], best[1]) : null;
  };
  W.randomFree = function (nx, nz, radius) {
    for (let k = 0; k < 120; k++) { let x, z; if (nx !== undefined) { x = nx + (Math.random() - 0.5) * 2 * radius; z = nz + (Math.random() - 0.5) * 2 * radius; } else { x = -W.XI + 2 + Math.random() * (2 * W.XI - 4); z = -W.ZI + 2 + Math.random() * (2 * W.ZI - 4); } const [i, j] = W.toCell(x, z); if (!W.blocked[j * W.GW + i]) return W.cellCenter(i, j); }
    return [0, 10];
  };
})();
