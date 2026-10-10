/* Patti Veedu — 3D models for everything inside the house, built from turned (lathe), extruded and
   bevelled shapes with procedural textures. Each builder returns a THREE.Group already added to the scene;
   static groups are flagged for batching so the whole house still renders in ~100 draw calls. */
'use strict';
(function (K) {
  const P = K.Props = {};
  let scene, M, X = {};
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const rng = K.rng;

  /* ---------------- textures ---------------- */
  function tex(w, h, draw, repeat = true) { const c = K.canvas(w, h), g = c.getContext('2d'); draw(g, w, h); return K.toTex(c, repeat); }
  function noise(g, w, h, r, n, a, light) { for (let i = 0; i < n; i++) { g.fillStyle = r() < 0.7 ? `rgba(0,0,0,${r() * a})` : `rgba(255,240,210,${r() * (light || a * 0.3)})`; const s = 1 + r() * 2; g.fillRect(r() * w, r() * h, s, s); } }
  function blot(g, x, y, rad, col) { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }

  // carved teak panel: raised frame + lotus medallion, lit from top-left
  function carvedTex(seed, W = 256, H = 512, cols = 1) {
    const wood = K.makeWoodTex(seed, '#3a1f0d', W, H).image;
    return tex(W, H, (g) => {
      g.drawImage(wood, 0, 0);
      const bevel = (x, y, w, h, d) => {
        g.lineWidth = d; g.strokeStyle = 'rgba(255,205,150,0.22)'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y); g.lineTo(x + w, y); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.stroke();
      };
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(18, 18, W - 36, H - 36);
      bevel(18, 18, W - 36, H - 36, 4); bevel(30, 30, W - 60, H - 60, 3);
      const R = Math.min(W / cols, H) * 0.3;
      for (let c = 0; c < cols; c++) {
        g.save(); g.translate(W * (c + 0.5) / cols, H / 2);
        for (let i = 0; i < 16; i++) { g.rotate(Math.PI / 8); g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath(); g.ellipse(0, -R * 0.55, R * 0.12, R * 0.42, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,200,140,0.18)'; g.lineWidth = 1.5; g.stroke(); }
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(0, 0, R * 0.2, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,210,150,0.25)'; g.lineWidth = 2; g.stroke();
        g.restore();
      }
      if (H > W) for (const yy of [60, H - 60]) for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(W / 2 - 75 + i * 25, yy, 6, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,200,140,0.18)'; g.stroke(); }
    }, false);
  }
  // pierced lattice (jali) with transparent holes
  function jaliTex() {
    const c = K.canvas(256, 256), g = c.getContext('2d'), wood = K.makeWoodTex(41, '#3b200e', 256, 256).image;
    g.drawImage(wood, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    const n = 4, s = 256 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const cx = (i + 0.5) * s, cy = (j + 0.5) * s;
      g.beginPath(); g.moveTo(cx, cy - s * 0.38); g.lineTo(cx + s * 0.38, cy); g.lineTo(cx, cy + s * 0.38); g.lineTo(cx - s * 0.38, cy); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(i * s, j * s, 5, 0, 7); g.fill(); }
    const t = K.toTex(c, true); return t;
  }
  // woven rope (naar) under a cot: holes between strands
  function ropeWeaveTex() {
    const c = K.canvas(128, 128), g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i++) for (const d of [0, 1]) {
      const p = i * 16 + 4;
      g.fillStyle = '#8f7446';
      if (d) g.fillRect(0, p, 128, 7); else g.fillRect(p, 0, 7, 128);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 128; k += 6) { if (d) g.fillRect(k, p, 2, 7); else g.fillRect(p, k, 7, 2); }
    }
    return K.toTex(c, true);
  }
  const stripeTex = (base, lines) => tex(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (const [x, wd, col] of lines) { g.fillStyle = col; g.fillRect(x, 0, wd, h); } const r = rng(3); noise(g, w, h, r, 400, 0.08); });
  function sheetTex(base, border) {
    return tex(256, 256, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      const r = rng(9); for (let i = 0; i < 60; i++) blot(g, r() * w, r() * h, 10 + r() * 30, 'rgba(120,100,70,0.06)');
      g.fillStyle = border; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22);
      g.fillStyle = 'rgba(255,230,160,0.55)'; for (let x = 4; x < w; x += 16) { g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 6, 16); g.lineTo(x + 12, 6); g.fill(); g.beginPath(); g.moveTo(x, h - 6); g.lineTo(x + 6, h - 16); g.lineTo(x + 12, h - 6); g.fill(); }
      noise(g, w, h, r, 900, 0.06);
    });
  }
  const checkTex = (a, b) => tex(128, 128, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let i = 0; i < 8; i++) { g.globalAlpha = 0.55; g.fillRect(i * 16, 0, 6, h); g.fillRect(0, i * 16, w, 6); } g.globalAlpha = 1; noise(g, w, h, rng(5), 500, 0.1); });
  const matTex = () => tex(256, 256, (g, w, h) => {
    g.fillStyle = '#a88a52'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) { g.fillStyle = (y / 4) % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,170,0.08)'; g.fillRect(0, y, w, 2); }
    for (const [y, c] of [[30, '#7d2418'], [44, '#2b5a2a'], [h - 50, '#2b5a2a'], [h - 36, '#7d2418']]) { g.fillStyle = c; g.globalAlpha = 0.75; g.fillRect(0, y, w, 8); }
    g.globalAlpha = 1; noise(g, w, h, rng(7), 1500, 0.12);
  });
  const sackTex = () => tex(128, 128, (g, w, h) => { g.fillStyle = '#8c7650'; g.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 3) { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } const r = rng(11); for (let i = 0; i < 10; i++) blot(g, r() * w, r() * h, 10 + r() * 25, 'rgba(40,25,10,0.18)'); g.fillStyle = 'rgba(120,30,20,0.5)'; g.font = 'bold 22px serif'; g.fillText('அரிசி', 30, 70); });
  // glazed pickle jar: unglazed foot, cream body with crackle, brown shoulder glaze (v runs bottom→top)
  const glazeTex = () => tex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#b49a74'); gr.addColorStop(0.08, '#b49a74'); gr.addColorStop(0.1, '#e6d9b8'); gr.addColorStop(0.62, '#dccca4'); gr.addColorStop(0.7, '#7a4a22'); gr.addColorStop(1, '#4e2c12');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(13); g.strokeStyle = 'rgba(90,70,40,0.25)'; g.lineWidth = 0.6;
    for (let i = 0; i < 60; i++) { g.beginPath(); let x = r() * w, y = h * (0.35 + r() * 0.5); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 14; y += (r() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 18; i++) blot(g, r() * w, h * (0.3 + r() * 0.4), 6 + r() * 10, 'rgba(110,70,30,0.12)');
  });
  const terraTex = (band) => tex(64, 256, (g, w, h) => {
    g.fillStyle = '#8a4426'; g.fillRect(0, 0, w, h); const r = rng(17);
    for (let i = 0; i < 30; i++) blot(g, r() * w, r() * h, 6 + r() * 16, r() < 0.5 ? 'rgba(40,15,5,0.25)' : 'rgba(200,120,70,0.15)');
    if (band) { g.fillStyle = 'rgba(235,225,200,0.8)'; g.fillRect(0, h * 0.42, w, 3); g.fillRect(0, h * 0.47, w, 2); for (let x = 2; x < w; x += 8) { g.beginPath(); g.arc(x, h * 0.445, 1.6, 0, 7); g.fill(); } }
    g.fillStyle = 'rgba(10,6,4,0.5)'; g.fillRect(0, h * 0.9, w, h * 0.1);
    noise(g, w, h, r, 300, 0.15);
  });
  const brassTex = (base, dark) => tex(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); const r = rng(19); for (let i = 0; i < 26; i++) blot(g, r() * w, r() * h, 6 + r() * 22, dark); for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,240,200,0.12)'; g.fillRect(0, r() * h, w, 1); } });
  const clockTex = () => tex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9caa2'; g.fillRect(0, 0, w, h); const c = w / 2;
    const gr = g.createRadialGradient(c, c, 20, c, c, c); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(70,50,20,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2a1c10'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, c * 0.92, 0, 7); g.stroke(); g.lineWidth = 1; g.beginPath(); g.arc(c, c, c * 0.72, 0, 7); g.stroke();
    g.fillStyle = '#1e140b'; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    R.forEach((t, i) => { const a = i / 12 * Math.PI * 2; g.save(); g.translate(c + Math.sin(a) * c * 0.82, c - Math.cos(a) * c * 0.82); g.rotate(a); g.fillText(t, 0, 0); g.restore(); });
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, l = i % 5 ? 4 : 9; g.save(); g.translate(c, c); g.rotate(a); g.fillStyle = '#1e140b'; g.fillRect(-1, -c * 0.7, 2, l); g.restore(); }
    g.strokeStyle = 'rgba(30,20,10,0.35)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(c + 20 + i * 9, c + 60 - i * 3); g.lineTo(c + 50 + i * 12, c + 90 - i * 9); g.stroke(); } // a crack in the glass
    noise(g, w, h, rng(23), 900, 0.12);
  }, false);
  const spineTex = () => tex(64, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h); g.fillStyle = '#d6a845'; for (const y of [18, 26, h - 30, h - 22]) g.fillRect(6, y, w - 12, 3); g.fillRect(14, h * 0.4, w - 28, 26); noise(g, w, h, rng(29), 90, 0.08); }, false);
  const tinTex = () => tex(128, 64, (g, w, h) => { g.fillStyle = '#d8d2c2'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3241b'; g.fillRect(52, 14, 24, 36); g.fillRect(40, 26, 48, 12); g.fillStyle = 'rgba(80,60,30,0.6)'; g.font = '9px sans-serif'; g.fillText('MEDICAL', 4, 60); noise(g, w, h, rng(31), 300, 0.25); }, false);

  /* ---------------- geometry helpers ---------------- */
  function lathe(pts, seg = 14) { return new THREE.LatheGeometry(pts.map(p => V2(Math.max(0.0005, p[0]), p[1])), seg); }
  // rounded box centred on the origin
  function rbox(w, h, d, r = 0.015) {
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    if (r < 0.003) return new THREE.BoxGeometry(w, h, d);
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.lineTo(x, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelOffset: -r, bevelSegments: 2, curveSegments: 1 });
    g.translate(0, 0, -(d - 2 * r) / 2);
    return g;
  }
  function M_(geo, mat, x = 0, y = 0, z = 0, parent, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); if (parent) parent.add(m); return m; }
  function G(x, y, z, ry = 0, batch = true) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.userData.batch = batch; scene.add(g); return g; }
  function finish(g, cast = true) { g.traverse(c => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = true; } }); return g; }
  const yawTo = (fx, fz) => Math.atan2(fx, fz);
  P.yawTo = yawTo;
  // merge a dynamic group's meshes per material (keeps the group's own transform) — fewer draw calls for moving things
  P.mergeGroup = function (g) {
    g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), buckets = new Map(), kill = [];
    g.traverse(c => { if (!c.isMesh || c === g || c.userData.keep || c.userData.inter || Array.isArray(c.material) || (c.material && c.material.visible === false)) return; const geo = c.geometry.clone(); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)); const b = buckets.get(c.material) || []; b.push(geo); buckets.set(c.material, b); kill.push(c); });
    kill.forEach(c => c.parent.remove(c));
    for (const [mat, list] of buckets) { const m = new THREE.Mesh(merge(list), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    return g;
  };

  // turned leg profile: foot, bead, shaft, collar (height h, radius r)
  function legGeo(h, r, seg = 8) {
    return lathe([[0, 0], [r * 0.85, 0], [r * 1.15, h * 0.04], [r * 0.9, h * 0.1], [r * 0.7, h * 0.14], [r * 1.05, h * 0.2], [r * 0.7, h * 0.26], [r * 0.62, h * 0.55], [r * 0.75, h * 0.82], [r * 1.05, h * 0.88], [r * 1.05, h], [0, h]], seg);
  }
  P.legGeo = legGeo;

  /* ---------------- materials ---------------- */
  P.init = function (sc, mats, merge_) {
    scene = sc; M = mats; merge = merge_;
    const env = K.envMap || null;
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));
    const metal = (o) => std(Object.assign({ envMap: env, envMapIntensity: env ? 1.0 : 0 }, o));
    // upgrade the shared metals in place so everything that already uses them shines
    const up = (m, o) => { Object.assign(m, o); m.needsUpdate = true; };
    up(M.brass, { map: brassTex('#e3b45a', 'rgba(70,45,10,0.35)'), color: new THREE.Color(0xffffff), metalness: 0.92, roughness: 0.3, emissive: new THREE.Color(0x120a02), envMap: env, envMapIntensity: env ? 1.1 : 0 });
    up(M.copper, { map: brassTex('#c0703f', 'rgba(40,60,40,0.3)'), color: new THREE.Color(0xffffff), metalness: 0.9, roughness: 0.36, emissive: new THREE.Color(0x0e0402), envMap: env, envMapIntensity: env ? 1.0 : 0 });
    up(M.steel, { metalness: 0.9, roughness: 0.3, envMap: env, envMapIntensity: env ? 0.9 : 0 });
    up(M.iron, { metalness: 0.75, roughness: 0.5, envMap: env, envMapIntensity: env ? 0.5 : 0 });
    up(M.glassDark, { envMap: env, envMapIntensity: env ? 0.8 : 0 });
    X = {
      carved: std({ map: carvedTex(43), roughness: 0.55 }),
      carvedWide: std({ map: carvedTex(44, 512, 256, 2), roughness: 0.55 }),
      jali: std({ map: jaliTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
      rope: std({ map: ropeWeaveTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }),
      mattress: std({ map: stripeTex('#d9d0bb', [[10, 3, '#4a5f8a'], [40, 3, '#8a3a2a'], [72, 3, '#4a5f8a'], [104, 3, '#8a3a2a']]), roughness: 1 }),
      sheet: std({ map: sheetTex('#e4dccb', '#7c1d16'), roughness: 1 }),
      sheetBlue: std({ map: sheetTex('#c9cfd6', '#2a3a5a'), roughness: 1 }),
      sheetPlum: std({ map: sheetTex('#6b4660', '#c99a3b'), roughness: 1 }),
      pillow: std({ color: 0xe8e2d4, roughness: 1 }),
      blanket: std({ map: checkTex('#6a1e1a', '#d0a040'), roughness: 1 }),
      paai: std({ map: matTex(), roughness: 1, side: THREE.DoubleSide }),
      sack: std({ map: sackTex(), roughness: 1 }),
      glaze: std({ map: glazeTex(), roughness: 0.35, envMap: env, envMapIntensity: env ? 0.35 : 0 }),
      terra: std({ map: terraTex(false), roughness: 0.9 }),
      terraBand: std({ map: terraTex(true), roughness: 0.9 }),
      clothTie: std({ color: 0xc8bfa8, roughness: 1 }),
      glass: std({ color: 0xbfd2d0, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, envMap: env, envMapIntensity: env ? 1.2 : 0, depthWrite: false }),
      bottle: std({ color: 0x23321f, roughness: 0.08, metalness: 0.2, envMap: env, envMapIntensity: env ? 1 : 0 }),
      clock: std({ map: clockTex(), roughness: 0.5 }),
      tin: std({ map: tinTex(), metalness: 0.5, roughness: 0.4, envMap: env, envMapIntensity: env ? 0.6 : 0 }),
      cushion: std({ map: checkTex('#7c1d16', '#3a0c08'), roughness: 1 }),
      sling: std({ map: stripeTex('#7c1d16', [[0, 6, '#d0a040'], [20, 4, '#1d3a2a'], [64, 6, '#d0a040'], [84, 4, '#1d3a2a']]), roughness: 1, side: THREE.DoubleSide }),
      plaster: std({ map: terraTex(false), color: 0xb9a48c, roughness: 1 }),
      sootClay: std({ color: 0x0d0907, roughness: 1 }),
      ash: std({ color: 0x2a2724, roughness: 1 }),
      firewood: std({ map: K.makeWoodTex(47, '#5b3a22', 128, 256), roughness: 1 }),
      bulbGlass: std({ color: 0x8a8878, roughness: 0.15, transparent: true, opacity: 0.6, envMap: env, envMapIntensity: env ? 0.8 : 0 }),
      blackHole: new THREE.MeshBasicMaterial({ color: 0x050302 }),
      spines: [0x6b2018, 0x1e4430, 0x2c2a5f, 0x7a561e, 0x4a1d38, 0x3a2a1a].map(c => { const m = std({ map: spineTex(), color: c, roughness: 0.85 }); m.userData.flat = true; return m; }),
      paperStack: std({ color: 0xcfc3a3, roughness: 1 }),
      lacquerRed: std({ color: 0x6a140e, roughness: 0.45 })
    };
    P.X = X;
  };
  let merge;

  /* ======================= furniture ======================= */
  // cot (kattil): long axis along local x, head at local -x. o: {x,y,z,ry,w,d,sheet,net,pillow}
  P.cot = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), w = o.w || 2.0, d = o.d || 1.2, H = 0.42, wood = M.teak;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(legGeo(H + 0.04, 0.045), wood, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), g);
    for (const sz of [-1, 1]) M_(rbox(w - 0.02, 0.1, 0.06, 0.012), wood, 0, H - 0.02, sz * (d / 2 - 0.04), g);
    for (const sx of [-1, 1]) M_(rbox(0.06, 0.1, d - 0.08, 0.012), wood, sx * (w / 2 - 0.04), H - 0.02, 0, g);
    // woven rope bed (naar) seen from below when hiding
    M_(new THREE.PlaneGeometry(w - 0.12, d - 0.12), X.rope, 0, H - 0.04, 0, g, -Math.PI / 2);
    // mattress, sheet, pillow, folded blanket
    M_(rbox(w - 0.1, 0.11, d - 0.1, 0.045), X.mattress, 0, H + 0.075, 0, g);
    M_(rbox(w - 0.06, 0.02, d - 0.04, 0.008), o.sheet || X.sheet, 0, H + 0.135, 0, g);
    for (const sz of [-1, 1]) M_(new THREE.PlaneGeometry(w - 0.1, 0.12), o.sheet || X.sheet, 0, H + 0.08, sz * (d / 2 - 0.015), g, 0, sz < 0 ? Math.PI : 0);
    if (o.pillow !== false) { const pl = M_(rbox(0.36, 0.1, d * 0.6, 0.045), X.pillow, -w / 2 + 0.3, H + 0.19, 0, g); pl.scale.y = 1; }
    M_(rbox(0.4, 0.07, d * 0.75, 0.025), X.blanket, w / 2 - 0.35, H + 0.18, 0, g);
    // carved headboard and low footboard with finial posts
    M_(new THREE.BoxGeometry(0.05, 0.62, d - 0.06), X.carvedWide, -w / 2 + 0.03, H + 0.36, 0, g);
    const crest = new THREE.Shape(); crest.moveTo(-d / 2 + 0.03, 0); crest.lineTo(d / 2 - 0.03, 0); crest.quadraticCurveTo(d / 2 - 0.05, 0.08, d * 0.2, 0.12); crest.quadraticCurveTo(0, 0.26, -d * 0.2, 0.12); crest.quadraticCurveTo(-d / 2 + 0.05, 0.08, -d / 2 + 0.03, 0);
    const cg = new THREE.ExtrudeGeometry(crest, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 8 }); cg.rotateY(Math.PI / 2); cg.translate(-w / 2 + 0.005, H + 0.67, 0);
    M_(cg, wood, 0, 0, 0, g);
    M_(rbox(0.05, 0.3, d - 0.06, 0.012), wood, w / 2 - 0.03, H + 0.2, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const ph = sx < 0 ? 0.78 : 0.42;
      M_(lathe([[0, 0], [0.035, 0], [0.035, ph * 0.85], [0.05, ph * 0.9], [0.028, ph * 0.96], [0.045, ph], [0.02, ph + 0.06], [0, ph + 0.08]], 10), wood, sx * (w / 2 - 0.035), H - 0.04, sz * (d / 2 - 0.035), g);
      M_(new THREE.SphereGeometry(0.018, 8, 6), M.brass, sx * (w / 2 - 0.035), H - 0.04 + ph + 0.08, sz * (d / 2 - 0.035), g);
    }
    if (o.net) for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 6), M.dark, sx * (w / 2 - 0.035), H + 0.75, sz * (d / 2 - 0.035), g);
    return finish(g);
  };

  // wardrobe (almirah): footprint x0..x1, z0..z1, doors facing [fx,fz]; jali panels at eye level so you can see out when hiding
  P.wardrobe = function (o) {
    const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, alongX = o.facing[0] === 0;
    const W = alongX ? o.x1 - o.x0 : o.z1 - o.z0, D = alongX ? o.z1 - o.z0 : o.x1 - o.x0, H = 2.1, y0 = o.y0 || 0;
    const g = G(cx, y0, cz, yawTo(o.facing[0], o.facing[1])), wood = o.mat || M.teak, t = 0.03;
    // carcass: separate panels (all faces point outward, so the hiding camera inside sees out)
    M_(rbox(W, H - 0.12, t, 0.006), wood, 0, 0.06 + (H - 0.12) / 2, -D / 2 + t / 2, g);
    for (const s of [-1, 1]) M_(rbox(t, H - 0.12, D, 0.006), wood, s * (W / 2 - t / 2), 0.06 + (H - 0.12) / 2, 0, g);
    M_(rbox(W, t, D, 0.006), wood, 0, 0.09, 0, g);
    // plinth with bun feet, cornice with arched crest
    M_(rbox(W + 0.04, 0.1, D + 0.03, 0.02), M.dark, 0, 0.05, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(new THREE.SphereGeometry(0.045, 10, 6), M.dark, sx * (W / 2 - 0.05), 0.02, sz * (D / 2 - 0.05), g);
    M_(rbox(W + 0.08, 0.08, D + 0.06, 0.02), M.dark, 0, H, 0, g);
    M_(rbox(W + 0.03, 0.05, D + 0.02, 0.015), wood, 0, H - 0.06, 0, g);
    const crest = new THREE.Shape(); crest.moveTo(-W * 0.42, 0); crest.lineTo(W * 0.42, 0); crest.quadraticCurveTo(W * 0.3, 0.06, W * 0.12, 0.08); crest.quadraticCurveTo(0, 0.2, -W * 0.12, 0.08); crest.quadraticCurveTo(-W * 0.3, 0.06, -W * 0.42, 0);
    M_(new THREE.ExtrudeGeometry(crest, { depth: 0.03, bevelEnabled: false, curveSegments: 8 }), M.dark, 0, H + 0.04, D / 2 - 0.02, g);
    // two doors: carved lower panel, louvered upper panel, left a finger's width ajar — from inside you peek out through the slats
    const dw = W / 2 - 0.035, fz = D / 2 - 0.005, LOUV = X.louv || (X.louv = new THREE.BoxGeometry(1, 0.03, 0.01));
    for (const s of [-1, 1]) {
      const dx = s * (dw / 2 + 0.0125);
      for (const [yy, hh] of [[0.14, 0.05], [1.0, 0.05], [1.98, 0.05]]) M_(rbox(dw, hh, 0.03, 0.006), wood, dx, yy + hh / 2, fz, g);
      for (const e of [-1, 1]) M_(rbox(0.05, 1.89, 0.03, 0.006), wood, dx + e * (dw / 2 - 0.025), 0.14 + 0.945, fz, g);
      M_(new THREE.BoxGeometry(dw - 0.1, 0.8, 0.012), X.carved, dx, 0.59, fz - 0.004, g);
      for (let i = 0; i < 18; i++) { const sl = M_(LOUV, M.dark, dx, 1.085 + i * 0.05, fz, g, -0.45); sl.scale.x = dw - 0.09; }
      M_(new THREE.TorusGeometry(0.022, 0.005, 6, 12), M.brass, s * 0.045, 1.02, fz + 0.022, g);
      M_(rbox(0.035, 0.09, 0.006, 0.002), M.brass, s * 0.045, 0.9, fz + 0.016, g);
    }
    // inside: a hanging rod with a saree and a veshti at the sides, a folded pile on the floor
    M_(new THREE.CylinderGeometry(0.01, 0.01, W - 0.08, 6), M.brass, 0, 1.86, -D / 2 + 0.07, g, 0, 0, Math.PI / 2);
    for (const [x, col] of [[-W / 2 + 0.1, 0x6e1a24], [W / 2 - 0.1, 0xcfc6ae]]) M_(new THREE.PlaneGeometry(0.12, 1.0), X['hang' + col] || (X['hang' + col] = new THREE.MeshStandardMaterial({ color: col, roughness: 1, side: THREE.DoubleSide })), x, 1.36, -D / 2 + 0.07, g, 0, Math.PI / 2, 0);
    M_(rbox(W - 0.12, 0.12, D * 0.5, 0.03), X.blanket, 0, 0.16, -D / 2 + D * 0.27, g);
    return finish(g);
  };

  // trunk (pettagam) with brass corners, bands, handles and a hasp. o: {x,y,z,ry,w,h,d,mat}
  P.trunk = function (o) {
    const w = o.w || 1, h = o.h || 0.55, d = o.d || 0.6, g = G(o.x, o.y || 0, o.z, o.ry || 0), wood = o.mat || M.dark;
    M_(rbox(w, h - 0.12, d, 0.015), wood, 0, (h - 0.12) / 2 + 0.03, 0, g);
    M_(rbox(w + 0.02, 0.12, d + 0.02, 0.02), wood, 0, h - 0.06, 0, g);
    M_(new THREE.BoxGeometry(w + 0.025, 0.012, d + 0.025), M.brass, 0, h - 0.125, 0, g);
    for (const x of [-w * 0.3, w * 0.3]) M_(new THREE.BoxGeometry(0.035, h + 0.004, d + 0.012), M.brass, x, h / 2 + 0.01, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.06, h - 0.03]) M_(new THREE.BoxGeometry(0.07, 0.07, 0.07), M.brass, sx * (w / 2 - 0.03), y, sz * (d / 2 - 0.03), g);
    for (const sx of [-1, 1]) M_(new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI), M.iron, sx * (w / 2 + 0.012), h * 0.6, 0, g, 0, Math.PI / 2, Math.PI);
    M_(rbox(0.06, 0.1, 0.012, 0.004), M.brass, 0, h - 0.13, d / 2 + 0.01, g);
    M_(rbox(0.05, 0.05, 0.025, 0.008), M.brass, 0, h - 0.21, d / 2 + 0.025, g);
    M_(new THREE.TorusGeometry(0.018, 0.004, 6, 10, Math.PI), M.steel, 0, h - 0.185, d / 2 + 0.025, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 8), M.dark, sx * (w / 2 - 0.06), 0.015, sz * (d / 2 - 0.06), g);
    return finish(g);
  };

  // table with turned legs and apron. o: {x,y,z,ry,w,d,h,drawer,mat,top}
  P.table = function (o) {
    const w = o.w, d = o.d, h = o.h || 0.75, g = G(o.x, o.y || 0, o.z, o.ry || 0), wood = o.mat || M.teak;
    M_(rbox(w, 0.045, d, 0.015), o.top || wood, 0, h - 0.0225, 0, g);
    const lh = h - 0.045;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(legGeo(lh, o.legR || 0.032), M.dark, sx * (w / 2 - 0.06), 0, sz * (d / 2 - 0.06), g);
    for (const sz of [-1, 1]) M_(rbox(w - 0.14, 0.09, 0.025, 0.006), M.dark, 0, lh - 0.05, sz * (d / 2 - 0.06), g);
    for (const sx of [-1, 1]) M_(rbox(0.025, 0.09, d - 0.14, 0.006), M.dark, sx * (w / 2 - 0.06), lh - 0.05, 0, g);
    if (o.drawer) { M_(rbox(w * 0.45, 0.08, 0.02, 0.006), wood, 0, lh - 0.05, d / 2 - 0.045, g); M_(new THREE.SphereGeometry(0.016, 8, 6), M.brass, 0, lh - 0.05, d / 2 - 0.03, g); }
    if (o.shelf) M_(rbox(w - 0.14, 0.02, d - 0.14, 0.005), M.dark, 0, 0.18, 0, g);
    return finish(g);
  };

  // chair facing local +z. o: {x,y,z,ry,arms,broken,mat}
  P.chair = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), wood = o.mat || M.teak, sh = 0.45, w = 0.48, d = 0.46;
    M_(rbox(w, 0.04, d, 0.012), wood, 0, sh, 0, g);
    M_(new THREE.PlaneGeometry(w - 0.08, d - 0.08), X.rope, 0, sh + 0.022, 0, g, -Math.PI / 2);
    const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    legs.forEach(([sx, sz], i) => {
      if (o.broken && i === 1) return;
      const back = sz < 0, lh = back ? sh + 0.55 : sh;
      M_(back ? lathe([[0, 0], [0.024, 0], [0.024, lh * 0.9], [0.032, lh * 0.94], [0.018, lh], [0, lh + 0.02]], 10) : legGeo(lh, 0.024), wood, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03), g);
    });
    for (const sz of [-1, 1]) M_(new THREE.CylinderGeometry(0.012, 0.012, w - 0.06, 6), M.dark, 0, 0.16, sz * (d / 2 - 0.03), g, 0, 0, Math.PI / 2);
    M_(rbox(w - 0.02, 0.08, 0.03, 0.01), wood, 0, sh + 0.5, -d / 2 + 0.03, g);
    for (let i = -2; i <= 2; i++) M_(lathe([[0, 0], [0.01, 0], [0.016, 0.1], [0.01, 0.22], [0.012, 0.42], [0, 0.42]], 8), M.dark, i * 0.075, sh + 0.04, -d / 2 + 0.03, g);
    if (o.arms) for (const sx of [-1, 1]) { M_(rbox(0.05, 0.03, d + 0.04, 0.01), wood, sx * (w / 2 + 0.01), sh + 0.24, 0.01, g); M_(legGeo(0.24, 0.016), M.dark, sx * (w / 2 + 0.01), sh, d / 2 - 0.04, g); }
    if (o.broken) { g.rotation.z = 0.12; g.position.y += 0.02; }
    return finish(g);
  };

  // easy chair (saaivu naarkaali) with a cloth sling; long axis local z, back at -z
  P.easyChair = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), wood = M.teak;
    for (const sx of [-1, 1]) {
      const rail = M_(rbox(0.05, 0.05, 1.3, 0.012), wood, sx * 0.3, 0.42, 0.05, g); rail.rotation.x = -0.12;
      M_(legGeo(0.4, 0.025), M.dark, sx * 0.3, 0, 0.55, g);
      const back = M_(rbox(0.045, 1.0, 0.045, 0.012), wood, sx * 0.3, 0.55, -0.42, g); back.rotation.x = -0.55;
      M_(rbox(0.07, 0.03, 0.8, 0.012), wood, sx * 0.36, 0.58, 0.25, g);
    }
    M_(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), M.dark, 0, 0.88, -0.65, g, 0, 0, Math.PI / 2);
    M_(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), M.dark, 0, 0.36, 0.6, g, 0, 0, Math.PI / 2);
    // sagging sling
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(0, 0.36 + (0.88 - 0.36) * t * t * 0.9 + (1 - t) * 0.0 - Math.sin(t * Math.PI) * 0.18, 0.6 - 1.25 * t)); }
    const geo = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
    pts.forEach((p, i) => { for (const sx of [-1, 1]) { pos.push(sx * 0.27, p.y, p.z); uv.push(sx < 0 ? 0 : 1, i / 10); } if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    M_(geo, X.sling, 0, 0, 0, g);
    return finish(g);
  };

  // cushioned settee (study). front local +z
  P.settee = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), w = o.w || 0.9, d = 0.7, wood = M.teak;
    M_(rbox(w, 0.12, d, 0.02), wood, 0, 0.3, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(legGeo(0.3, 0.028), M.dark, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), g);
    M_(rbox(w - 0.06, 0.14, d - 0.08, 0.05), X.cushion, 0, 0.43, 0.02, g);
    M_(new THREE.BoxGeometry(w, 0.5, 0.06), X.carvedWide, 0, 0.62, -d / 2 + 0.03, g);
    M_(rbox(w - 0.1, 0.3, 0.1, 0.05), X.cushion, 0, 0.62, -d / 2 + 0.1, g);
    for (const sx of [-1, 1]) M_(rbox(0.06, 0.28, d, 0.02), wood, sx * (w / 2 - 0.03), 0.48, 0, g);
    return finish(g);
  };

  // bench with backrest; long axis local x, back at -z
  P.bench = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), w = o.w || 2.0, d = 0.5, wood = M.teak;
    M_(rbox(w, 0.06, d, 0.015), wood, 0, 0.42, 0, g);
    for (const x of [-w / 2 + 0.08, 0, w / 2 - 0.08]) for (const sz of [-1, 1]) M_(legGeo(0.39, 0.03), M.dark, x, 0, sz * (d / 2 - 0.06), g);
    M_(rbox(w, 0.12, 0.04, 0.012), M.dark, 0, 0.82, -d / 2 + 0.02, g);
    for (let i = 0; i < 9; i++) M_(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), M.dark, -w / 2 + 0.12 + i * (w - 0.24) / 8, 0.6, -d / 2 + 0.02, g);
    return finish(g);
  };

  // open shelving rack along local x, against a wall behind (local -z). o: {x,y,z,ry,w,h,d,levels:[y..]}
  P.rack = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), w = o.w, d = o.d || 0.42, h = o.h || 2.1;
    for (const sx of [-1, 1]) M_(rbox(0.06, h, d, 0.01), M.dark, sx * (w / 2 - 0.03), h / 2, 0, g);
    for (const y of o.levels) {
      M_(rbox(w - 0.06, 0.035, d, 0.008), M.wood, 0, y, 0, g);
      M_(rbox(w - 0.06, 0.03, 0.015, 0.004), M.dark, 0, y - 0.02, d / 2 - 0.005, g);
      for (const sx of [-1, 1]) { const b = new THREE.Shape(); b.moveTo(0, 0); b.lineTo(0.13, 0); b.quadraticCurveTo(0.03, -0.03, 0, -0.13); b.lineTo(0, 0); const bg = new THREE.ExtrudeGeometry(b, { depth: 0.025, bevelEnabled: false, curveSegments: 4 }); bg.rotateY(-Math.PI / 2); M_(bg, M.dark, sx * (w / 2 - 0.075), y - 0.018, -d / 2 + 0.01, g); }
    }
    M_(rbox(w + 0.04, 0.05, d + 0.03, 0.012), M.dark, 0, h, 0, g);
    return finish(g);
  };

  /* ======================= vessels and small things (all lathe-turned) ======================= */
  const VESSELS = {
    kudam: [[0, 0], [0.07, 0], [0.11, 0.02], [0.15, 0.08], [0.16, 0.14], [0.14, 0.21], [0.07, 0.27], [0.055, 0.3], [0.07, 0.33], [0.08, 0.34], [0.062, 0.34], [0.05, 0.31], [0, 0.31]],
    sombu: [[0, 0], [0.04, 0], [0.065, 0.02], [0.08, 0.06], [0.075, 0.1], [0.04, 0.14], [0.035, 0.16], [0.05, 0.19], [0.04, 0.19], [0, 0.17]],
    thavalai: [[0, 0], [0.1, 0], [0.17, 0.04], [0.2, 0.1], [0.19, 0.16], [0.15, 0.2], [0.15, 0.22], [0.17, 0.23], [0.15, 0.23], [0, 0.2]],
    tumbler: [[0, 0], [0.032, 0], [0.036, 0.01], [0.04, 0.1], [0.044, 0.105], [0.036, 0.1], [0, 0.01]],
    davara: [[0, 0], [0.04, 0], [0.055, 0.015], [0.06, 0.045], [0.064, 0.05], [0.05, 0.045], [0, 0.015]],
    plate: [[0, 0], [0.13, 0], [0.15, 0.008], [0.17, 0.022], [0.16, 0.022], [0.14, 0.01], [0, 0.008]],
    paanai: [[0, 0], [0.08, 0], [0.18, 0.06], [0.22, 0.16], [0.2, 0.26], [0.13, 0.32], [0.11, 0.34], [0.13, 0.37], [0.115, 0.375], [0, 0.34]],
    lid: [[0, 0.02], [0.15, 0], [0.16, 0], [0.14, 0.012], [0.06, 0.035], [0.035, 0.045], [0.03, 0.06], [0, 0.06]],
    bharani: [[0, 0], [0.09, 0], [0.12, 0.02], [0.155, 0.1], [0.165, 0.2], [0.15, 0.3], [0.11, 0.35], [0.075, 0.37], [0.075, 0.4], [0.085, 0.41], [0.07, 0.41], [0, 0.39]],
    bottle: [[0, 0], [0.035, 0], [0.04, 0.01], [0.04, 0.17], [0.03, 0.2], [0.014, 0.23], [0.014, 0.27], [0.018, 0.28], [0, 0.28]],
    boiler: [[0, -0.28], [0.14, -0.27], [0.36, -0.22], [0.5, -0.12], [0.56, 0], [0.52, 0.16], [0.4, 0.27], [0.42, 0.3], [0.38, 0.31], [0.35, 0.25], [0, 0.24]],
    bell: [[0.085, 0], [0.06, 0.04], [0.045, 0.1], [0.03, 0.14], [0.025, 0.17], [0, 0.17]]
  };
  P.vessel = function (kind, x, y, z, s = 1, mat, parent, ry = 0) {
    const big = s * Math.max(...VESSELS[kind].map(p => p[0])) > 0.25;
    const geo = lathe(VESSELS[kind].map(p => [p[0] * s, p[1] * s]), big ? 20 : kind === 'tumbler' || kind === 'davara' || kind === 'bottle' ? 10 : 14);
    const m = new THREE.Mesh(geo, mat || M.brass); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
    if (parent) parent.add(m); else { const g = G(0, 0, 0); g.add(m); }
    return m;
  };
  // pickle jar with a cloth-tied mouth
  P.bharani = function (x, y, z, s = 1, parent) {
    const g = parent || G(0, 0, 0);
    P.vessel('bharani', x, y, z, s, X.glaze, g);
    const cap = M_(new THREE.SphereGeometry(0.1 * s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), X.clothTie, x, y + 0.395 * s, z, g); cap.scale.y = 0.45;
    M_(new THREE.TorusGeometry(0.078 * s, 0.006 * s, 5, 14), M.rope, x, y + 0.39 * s, z, g, Math.PI / 2);
    return g;
  };
  // gunny sack: a lumpy sphere tied at the top
  P.sack = function (x, y, z, s = 1, ry = 0) {
    const g = G(x, y, z, ry);
    const geo = new THREE.SphereGeometry(0.36 * s, 16, 12), p = geo.attributes.position, r = rng(Math.floor(x * 100 + z * 7));
    for (let i = 0; i < p.count; i++) { const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i), k = 1 + (Math.sin(vx * 18) * Math.cos(vz * 15)) * 0.04 + (r() - 0.5) * 0.02; const sq = vy < 0 ? 0.8 : 1 - Math.max(0, vy / (0.36 * s)) * 0.45; p.setXYZ(i, vx * k * sq, vy * 0.85, vz * k * sq); }
    geo.computeVertexNormals();
    M_(geo, X.sack, 0, 0.3 * s, 0, g);
    M_(lathe([[0.06 * s, 0], [0.04 * s, 0.05 * s], [0.07 * s, 0.12 * s], [0.03 * s, 0.13 * s]], 10), X.sack, 0, 0.55 * s, 0, g);
    M_(new THREE.TorusGeometry(0.045 * s, 0.008, 5, 10), M.rope, 0, 0.6 * s, 0, g, Math.PI / 2);
    return finish(g);
  };
  // sleeping mat (paai), half rolled
  P.paai = function (x, z, w, l, ry = 0, y = 0) {
    const g = G(x, y, z, ry);
    M_(new THREE.PlaneGeometry(w, l * 0.8), X.paai, 0, 0.004, l * 0.1, g, -Math.PI / 2);
    M_(new THREE.CylinderGeometry(0.06, 0.06, w, 14, 1, false), X.paai, 0, 0.06, -l * 0.3 - 0.06, g, 0, 0, Math.PI / 2);
    return finish(g, false);
  };
  // hanging bulb with holder and cord
  P.bulb = function (x, yTop, z, cord) {
    const g = G(x, yTop, z, 0);
    M_(new THREE.CylinderGeometry(0.004, 0.004, cord, 4), M.soot, 0, -cord / 2, 0, g);
    M_(lathe([[0, -0.055], [0.015, -0.055], [0.022, -0.05], [0.022, -0.005], [0.006, 0]], 10), M.dark, 0, -cord, 0, g);
    M_(lathe([[0, -0.135], [0.03, -0.13], [0.045, -0.1], [0.04, -0.06], [0.012, -0.02], [0.012, 0]], 14), X.bulbGlass, 0, -cord - 0.05, 0, g);
    return finish(g, false);
  };
  // hurricane lantern (cold, glass globe)
  P.lantern = function (x, y, z, parent) {
    const g = parent || G(x, y, z, 0), ox = parent ? x : 0, oy = parent ? y : 0, oz = parent ? z : 0;
    M_(lathe([[0, 0], [0.08, 0], [0.09, 0.02], [0.085, 0.06], [0.05, 0.075], [0, 0.075]], 16), M.iron, ox, oy, oz, g);
    M_(lathe([[0.035, 0.075], [0.06, 0.1], [0.07, 0.16], [0.06, 0.22], [0.035, 0.25]], 16), X.glass, ox, oy, oz, g);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; M_(new THREE.CylinderGeometry(0.004, 0.004, 0.2, 4), M.iron, ox + Math.cos(a) * 0.075, oy + 0.16, oz + Math.sin(a) * 0.075, g); }
    M_(lathe([[0, 0.25], [0.04, 0.245], [0.065, 0.255], [0.03, 0.29], [0, 0.3]], 14), M.iron, ox, oy, oz, g);
    M_(new THREE.TorusGeometry(0.07, 0.004, 5, 14, Math.PI), M.iron, ox, oy + 0.3, oz, g);
    return finish(g);
  };

  /* ======================= kitchen ======================= */
  // wood-fired clay stove along local x, front local +z
  P.stove = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), w = o.w || 2.6, d = 0.8, h = 0.75;
    M_(rbox(w, h, d, 0.06), X.plaster, 0, h / 2, 0, g);
    M_(rbox(w + 0.02, 0.03, d + 0.02, 0.012), X.sootClay, 0, h + 0.005, 0, g);
    for (const hx of o.holes) {
      M_(new THREE.TorusGeometry(0.19, 0.035, 8, 20), X.terra, hx, h + 0.03, 0, g, Math.PI / 2);
      M_(new THREE.CircleGeometry(0.17, 18), X.blackHole, hx, h + 0.022, 0, g, -Math.PI / 2);
      // arched firebox mouth on the front, with ash and a few sticks
      const arch = new THREE.Shape(); arch.moveTo(-0.13, 0); arch.lineTo(0.13, 0); arch.lineTo(0.13, 0.14); arch.absarc(0, 0.14, 0.13, 0, Math.PI, false); arch.lineTo(-0.13, 0);
      M_(new THREE.ShapeGeometry(arch, 8), X.blackHole, hx, 0.04, d / 2 + 0.002, g);
      M_(new THREE.CircleGeometry(0.11, 10, 0, Math.PI), X.ash, hx, 0.045, d / 2 + 0.06, g, -Math.PI / 2);
      for (let i = 0; i < 3; i++) M_(new THREE.CylinderGeometry(0.022, 0.025, 0.6, 7), X.firewood, hx - 0.06 + i * 0.06, 0.07 + (i % 2) * 0.03, d / 2 + 0.12, g, Math.PI / 2 - 0.08, 0.1 * (i - 1), 0);
    }
    // soot streaks up the wall: smoke hood
    M_(rbox(w + 0.2, 0.18, 0.7, 0.05), X.sootClay, 0, 2.15, -0.05, g);
    M_(rbox(w + 0.1, 0.9, 0.08, 0.03), X.sootClay, 0, 2.7, -0.36, g);
    return finish(g);
  };
  // grinding stone (aattukkal): granite basin + rolling stone
  P.grinder = function (x, z, ry = 0) {
    const g = G(x, 0, z, ry);
    M_(lathe([[0, 0], [0.34, 0], [0.36, 0.05], [0.33, 0.4], [0.35, 0.45], [0.26, 0.45], [0.2, 0.3], [0.08, 0.26], [0, 0.26]], 22), M.granite, 0, 0, 0, g);
    M_(lathe([[0, 0], [0.1, 0], [0.12, 0.05], [0.12, 0.25], [0.1, 0.3], [0, 0.3]], 14), M.granite, 0.06, 0.26, 0, g);
    M_(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6), M.dark, 0.06, 0.6, 0, g);
    return finish(g);
  };

  /* ======================= hall, study, bedroom ======================= */
  // grandfather clock (front local +z); returns {group, pendulum}
  // grandfather clock (front local +z). Hollow trunk with a glass door, separate hands, pendulum.
  // returns {group, pendulum, hands:{h,m}, door}
  P.clock = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), wood = M.teak;
    M_(rbox(0.5, 0.25, 0.4, 0.02), M.dark, 0, 0.125, 0, g);
    M_(rbox(0.4, 1.3, 0.02, 0.005), M.dark, 0, 0.9, -0.15, g);                         // back
    for (const sx of [-1, 1]) M_(rbox(0.03, 1.3, 0.32, 0.008), wood, sx * 0.185, 0.9, 0, g); // sides
    M_(rbox(0.4, 0.03, 0.32, 0.008), wood, 0, 0.265, 0, g); M_(rbox(0.4, 0.04, 0.32, 0.008), wood, 0, 1.53, 0, g);
    M_(rbox(0.5, 0.55, 0.38, 0.02), wood, 0, 1.8, 0, g);
    const crest = new THREE.Shape(); crest.moveTo(-0.25, 0); crest.lineTo(0.25, 0); crest.quadraticCurveTo(0.22, 0.1, 0.08, 0.12); crest.quadraticCurveTo(0, 0.22, -0.08, 0.12); crest.quadraticCurveTo(-0.22, 0.1, -0.25, 0);
    M_(new THREE.ExtrudeGeometry(crest, { depth: 0.36, bevelEnabled: false, curveSegments: 8 }), M.dark, 0, 2.07, -0.18, g);
    M_(new THREE.CircleGeometry(0.17, 28), X.clock, 0, 1.8, 0.192, g);
    M_(new THREE.TorusGeometry(0.175, 0.012, 6, 28), M.brass, 0, 1.8, 0.195, g);
    for (const sx of [-1, 1]) M_(lathe([[0.02, 0], [0.03, 0.1], [0.02, 0.5], [0.03, 0.55]], 8), M.dark, sx * 0.22, 1.53, 0.17, g);
    const ry = o.ry || 0, dyn = (y, lx, lz) => { const d = new THREE.Group(); const c = Math.cos(ry), s2 = Math.sin(ry); d.position.set(o.x + lx * c + lz * s2, y, o.z - lx * s2 + lz * c); d.rotation.y = ry; d.userData.dyn = true; scene.add(d); return d; };
    // pendulum
    const pg = dyn(1.5, 0, 0);
    M_(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 4), M.brass, 0, -0.27, 0.05, pg);
    M_(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 18), M.brass, 0, -0.58, 0.05, pg, Math.PI / 2);
    finish(pg, false);
    // hands, pivoting at the face centre
    const hg = dyn(1.8, 0, 0.2), mk = (len, wd, z) => { const geo = new THREE.BoxGeometry(wd, len, 0.004); geo.translate(0, len / 2 - 0.02, z); const piv = new THREE.Group(); piv.add(new THREE.Mesh(geo, X.handM || (X.handM = new THREE.MeshStandardMaterial({ color: 0x120c06, roughness: 0.6 })))); hg.add(piv); return piv; };
    const hands = { h: mk(0.095, 0.012, 0.004), m: mk(0.14, 0.008, 0.008) };
    M_(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 10), M.brass, 0, 0, 0.012, hg, Math.PI / 2);
    // glazed trunk door, hinged on the left
    const door = dyn(0, -0.2, 0.17);
    for (const [w, h, x, y] of [[0.4, 0.04, 0.2, 0.3], [0.4, 0.04, 0.2, 1.49], [0.035, 1.23, 0.0175, 0.895], [0.035, 1.23, 0.3825, 0.895]]) M_(rbox(w, h, 0.025, 0.006), wood, x, y, 0, door);
    M_(new THREE.PlaneGeometry(0.33, 1.15), X.glass, 0.2, 0.895, 0, door);
    M_(new THREE.SphereGeometry(0.012, 8, 6), M.brass, 0.36, 0.9, 0.02, door);
    finish(door, false); P.mergeGroup(door); P.mergeGroup(pg);
    return { group: finish(g), pendulum: pg, hands, door };
  };
  // pallanguzhi board on a low stand with a drawer (front local +z). returns {group, drawer, seedsAt(i)}
  P.pallanguzhi = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), wood = M.teak;
    M_(rbox(0.95, 0.12, 0.34, 0.02), M.dark, 0, 0.07, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(new THREE.SphereGeometry(0.03, 8, 6), M.dark, sx * 0.43, 0.012, sz * 0.13, g);
    // fish-shaped board
    const sh = new THREE.Shape(); sh.moveTo(-0.38, -0.12); sh.lineTo(0.38, -0.12); sh.quadraticCurveTo(0.46, -0.1, 0.5, 0); sh.quadraticCurveTo(0.46, 0.1, 0.38, 0.12); sh.lineTo(-0.38, 0.12); sh.quadraticCurveTo(-0.44, 0.1, -0.46, 0.05); sh.lineTo(-0.52, 0.1); sh.lineTo(-0.5, 0); sh.lineTo(-0.52, -0.1); sh.lineTo(-0.46, -0.05); sh.quadraticCurveTo(-0.44, -0.1, -0.38, -0.12);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 6 }); bg.rotateX(-Math.PI / 2); bg.translate(0, 0.135, 0);
    M_(bg, wood, 0, 0, 0, g);
    const cupM = X.cupM || (X.cupM = new THREE.MeshStandardMaterial({ color: 0x1a0d06, roughness: 0.9 }));
    const cup = new THREE.CircleGeometry(0.034, 14), rim = new THREE.TorusGeometry(0.035, 0.005, 4, 14);
    const cups = [];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) { const x = -0.3 + i * 0.1, z = r ? -0.055 : 0.055; M_(cup, cupM, x, 0.194, z, g, -Math.PI / 2); M_(rim, M.brass, x, 0.194, z, g, Math.PI / 2); cups.push({ x, z }); }
    for (const x of [-0.41, 0.41]) { M_(new THREE.CircleGeometry(0.05, 14), cupM, x, 0.194, 0, g, -Math.PI / 2); M_(new THREE.TorusGeometry(0.05, 0.006, 4, 14), M.brass, x, 0.194, 0, g, Math.PI / 2); }
    // store cups full of tamarind seeds
    const seedM = X.seedM || (X.seedM = new THREE.MeshStandardMaterial({ color: 0x4a2412, roughness: 0.5 })), seed = new THREE.SphereGeometry(0.009, 5, 4), r = rng(57);
    for (const x of [-0.41, 0.41]) for (let k = 0; k < 9; k++) { const sd = M_(seed, seedM, x + (r() - 0.5) * 0.06, 0.2 + r() * 0.01, (r() - 0.5) * 0.06, g); sd.scale.set(1, 0.6, 1.4); }
    // carved symbol plaques for the four marked cups (front row)
    const plaques = (o.syms || []).map((sy, k) => { const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshStandardMaterial({ map: K.makeSymbolPanel(sy), roughness: 0.6 })); pm.position.set(-0.3 + k * 0.2, 0.17, 0.123); g.add(pm); pm.userData.dyn = true; pm.userData.keepMat = true; return pm; });
    // drawer (moves)
    const c = Math.cos(o.ry || 0), s2 = Math.sin(o.ry || 0);
    const dr = new THREE.Group(); dr.position.set(o.x, 0, o.z); dr.rotation.y = o.ry || 0; dr.userData.dyn = true; scene.add(dr);
    M_(rbox(0.3, 0.075, 0.02, 0.006), wood, 0, 0.07, 0.172, dr); M_(new THREE.SphereGeometry(0.012, 8, 6), M.brass, 0, 0.07, 0.19, dr);
    M_(new THREE.BoxGeometry(0.28, 0.008, 0.26), M.dark, 0, 0.036, 0.04, dr); for (const sx of [-1, 1]) M_(new THREE.BoxGeometry(0.008, 0.05, 0.26), M.dark, sx * 0.14, 0.06, 0.04, dr);
    finish(dr, false); P.mergeGroup(dr);
    // live seeds in the four symbol cups
    const sg = new THREE.Group(); sg.position.set(o.x, 0, o.z); sg.rotation.y = o.ry || 0; sg.userData.dyn = true; scene.add(sg);
    const setSeeds = (counts) => {
      while (sg.children.length) { const c = sg.children[0]; sg.remove(c); c.geometry.dispose(); }
      const parts = []; counts.forEach((n, k) => { for (let j = 0; j < n; j++) { const a = j * 2.4, rr = j ? 0.014 : 0, sd = new THREE.SphereGeometry(0.009, 5, 4); sd.scale(1.1, 0.7, 1.5); sd.rotateY(a); sd.translate(cups[k * 2].x + Math.cos(a) * rr, 0.2, cups[k * 2].z + Math.sin(a) * rr); parts.push(sd); } });
      if (parts.length) sg.add(new THREE.Mesh(merge(parts), seedM));
    };
    return { group: finish(g), drawer: dr, setSeeds, plaques, cups };
  };
  // black rotary telephone on a little stand (front local +z); handset is a separate group so it can rattle
  P.phone = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0);
    P.table({ x: o.x, z: o.z, ry: o.ry || 0, w: 0.42, d: 0.36, h: 0.78, legR: 0.024, shelf: true });
    const bak = X.bakelite || (X.bakelite = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.22, metalness: 0.1, envMap: K.envMap || null, envMapIntensity: K.envMap ? 0.9 : 0 }));
    const body = new THREE.Shape(); body.moveTo(-0.1, 0); body.lineTo(0.1, 0); body.lineTo(0.085, 0.07); body.quadraticCurveTo(0.06, 0.1, 0, 0.1); body.quadraticCurveTo(-0.06, 0.1, -0.085, 0.07); body.lineTo(-0.1, 0);
    const bgeo = new THREE.ExtrudeGeometry(body, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8 }); bgeo.translate(0, 0, -0.1);
    M_(bgeo, bak, 0, 0.78, 0, g, 0, Math.PI / 2, 0);
    // dial on the sloping front
    const dial = new THREE.Group(); dial.position.set(0, 0.835, 0.09); dial.rotation.x = -0.75; g.add(dial);
    M_(new THREE.CylinderGeometry(0.048, 0.05, 0.008, 22), M.steel, 0, 0, 0, dial);
    M_(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 14), X.paperStack, 0, 0.002, 0, dial);
    for (let i = 0; i < 10; i++) { const a = -0.5 + i * 0.5; M_(new THREE.CircleGeometry(0.008, 8), bak, Math.cos(a) * 0.034, 0.0055, Math.sin(a) * 0.034, dial, -Math.PI / 2); }
    // cradle forks
    for (const sx of [-1, 1]) M_(rbox(0.02, 0.04, 0.03, 0.006), bak, sx * 0.07, 0.885, -0.01, g);
    // coiled cord
    const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(new THREE.Vector3(-0.11 - Math.sin(t * Math.PI) * 0.06 + Math.cos(t * 40) * 0.006, 0.8 + Math.sin(t * Math.PI) * 0.05 + Math.sin(t * 40) * 0.006, -0.05 + t * 0.08)); }
    M_(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.004, 4, false), bak, 0, 0, 0, g);
    const c = Math.cos(o.ry || 0), s2 = Math.sin(o.ry || 0);
    const hs = new THREE.Group(); hs.position.set(o.x - 0.0 * c, 0.905, o.z); hs.rotation.y = o.ry || 0; hs.userData.dyn = true; scene.add(hs);
    M_(new THREE.CylinderGeometry(0.014, 0.014, 0.17, 8), bak, 0, 0, 0, hs, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) M_(lathe([[0.012, 0], [0.03, 0.005], [0.032, 0.025], [0.022, 0.03], [0, 0.028]], 12), bak, sx * 0.09, -0.012, 0, hs, Math.PI, 0, 0);
    finish(hs, false); P.mergeGroup(hs);
    return { group: finish(g), handset: hs };
  };
  // ghost of a little girl: soft silhouette texture for a billboard sprite
  P.ghostTex = function () {
    const c = K.canvas(128, 256), g = c.getContext('2d');
    const body = (col) => { g.fillStyle = col; g.beginPath(); g.moveTo(48, 92); g.quadraticCurveTo(64, 84, 80, 92); g.lineTo(84, 130); g.lineTo(98, 228); g.quadraticCurveTo(64, 240, 30, 228); g.lineTo(44, 130); g.closePath(); g.fill(); };
    const dress = g.createLinearGradient(0, 120, 0, 240); dress.addColorStop(0, 'rgba(225,220,205,0.95)'); dress.addColorStop(0.75, 'rgba(210,205,190,0.6)'); dress.addColorStop(1, 'rgba(200,200,190,0)');
    body(dress);
    g.fillStyle = 'rgba(70,20,24,0.95)'; g.beginPath(); g.moveTo(48, 92); g.quadraticCurveTo(64, 84, 80, 92); g.lineTo(83, 126); g.quadraticCurveTo(64, 132, 45, 126); g.closePath(); g.fill(); // blouse
    g.fillStyle = '#060404'; g.beginPath(); g.ellipse(64, 62, 17, 21, 0, 0, 7); g.fill(); // head, face in shadow
    g.beginPath(); g.moveTo(46, 58); g.quadraticCurveTo(38, 110, 44, 150); g.lineTo(52, 150); g.quadraticCurveTo(48, 100, 56, 70); g.fill(); // long hair
    g.beginPath(); g.moveTo(82, 58); g.quadraticCurveTo(90, 110, 84, 150); g.lineTo(76, 150); g.quadraticCurveTo(80, 100, 72, 70); g.fill();
    for (const x of [40, 88]) { g.fillStyle = 'rgba(205,200,190,0.9)'; g.fillRect(x - 3, 96, 6, 44); }
    const glow = g.createRadialGradient(64, 140, 10, 64, 140, 110); glow.addColorStop(0, 'rgba(200,210,230,0.18)'); glow.addColorStop(1, 'rgba(200,210,230,0)'); g.globalCompositeOperation = 'destination-over'; g.fillStyle = glow; g.fillRect(0, 0, 128, 256);
    return K.toTex(c, false);
  };
  // silver anklet (kolusu): chain ring with little bells
  P.anklet = function (silver) {
    const parts = [], ring = new THREE.TorusGeometry(0.045, 0.0035, 5, 28); ring.rotateX(Math.PI / 2); parts.push(ring);
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, b = new THREE.SphereGeometry(0.006, 6, 5); b.translate(Math.cos(a) * 0.047, -0.006, Math.sin(a) * 0.047); parts.push(b); }
    const clasp = new THREE.BoxGeometry(0.012, 0.006, 0.006); clasp.translate(0.045, 0.002, 0); parts.push(clasp);
    const g = new THREE.Group(); g.add(new THREE.Mesh(merge(parts), silver)); return g;
  };
  // bookshelf against a wall (back at local -z)
  P.bookshelf = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), w = o.w, h = 2.2, d = 0.4, r = rng(77);
    for (const sx of [-1, 1]) M_(rbox(0.05, h, d, 0.01), M.dark, sx * (w / 2 - 0.025), h / 2, 0, g);
    M_(rbox(w, h, 0.02, 0.005), M.dark, 0, h / 2, -d / 2 + 0.035, g); // in from the back edge: flush against a wall it z-fought the plaster
    M_(rbox(w + 0.06, 0.08, d + 0.04, 0.02), M.dark, 0, h, 0, g);
    M_(rbox(w + 0.02, 0.1, d + 0.02, 0.02), M.dark, 0, 0.05, 0, g);
    for (let s = 0; s < 4; s++) {
      const y = 0.1 + s * 0.52;
      M_(rbox(w - 0.1, 0.03, d - 0.02, 0.006), M.wood, 0, y, 0, g);
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.1) {
        if (r() < 0.08) { // a lying stack
          const sw = 0.26; if (x + sw > w / 2 - 0.08) break;
          for (let k = 0; k < 3 + Math.floor(r() * 3); k++) M_(rbox(0.24, 0.035, 0.18, 0.004), X.spines[Math.floor(r() * 6)], x + sw / 2, y + 0.034 + k * 0.037, 0.02, g, 0, (r() - 0.5) * 0.2, 0);
          x += sw + 0.02; continue;
        }
        const bw = 0.035 + r() * 0.045, bh = 0.24 + r() * 0.16, bd = 0.2 + r() * 0.06;
        M_(new THREE.BoxGeometry(bw, bh, bd), X.spines[Math.floor(r() * 6)], x + bw / 2, y + 0.015 + bh / 2, d / 2 - bd / 2 - 0.02, g, 0, 0, (r() - 0.5) * 0.06);
        x += bw + 0.004;
      }
    }
    return finish(g);
  };
  // dressing table against a wall (back at local -z); mirror mesh is created by the caller (clue texture)
  P.dresser = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), w = o.w || 1.0, d = 0.45, wood = M.teak;
    M_(rbox(w, 0.06, d, 0.015), wood, 0, 0.78, 0, g);
    M_(rbox(w - 0.04, 0.55, d - 0.04, 0.015), wood, 0, 0.47, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(legGeo(0.2, 0.03), M.dark, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), g);
    for (const [yy, ww] of [[0.64, w * 0.42], [0.4, w * 0.9]]) for (const sx of (ww < w * 0.5 ? [-1, 1] : [0])) { M_(rbox(ww, 0.17, 0.02, 0.006), M.dark, sx * w * 0.23, yy, d / 2 - 0.01, g); M_(new THREE.SphereGeometry(0.014, 8, 6), M.brass, sx * w * 0.23, yy, d / 2 + 0.01, g); }
    // mirror frame with arch
    const fr = new THREE.Shape(); fr.moveTo(-0.38, 0); fr.lineTo(0.38, 0); fr.lineTo(0.38, 0.9); fr.absarc(0, 0.9, 0.38, 0, Math.PI, false); fr.lineTo(-0.38, 0);
    const hole = new THREE.Path(); hole.moveTo(-0.31, 0.07); hole.lineTo(0.31, 0.07); hole.lineTo(0.31, 1.0); hole.lineTo(-0.31, 1.0); hole.lineTo(-0.31, 0.07); fr.holes.push(hole);
    const my = o.mirrorY || 0.84;
    M_(new THREE.ExtrudeGeometry(fr, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 12 }), M.dark, 0, my, -d / 2 + 0.02, g);
    if (my > 0.86) for (const sx of [-1, 1]) M_(rbox(0.05, my - 0.8 + 0.1, 0.05, 0.01), M.dark, sx * 0.36, 0.8 + (my - 0.8 + 0.1) / 2, -d / 2 + 0.04, g);
    P.vessel('bottle', -w * 0.3, 0.81, 0.05, 0.5, M.glassDark, g); P.vessel('davara', w * 0.3, 0.81, 0.06, 0.8, M.brass, g);
    M_(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), M.redGrip, w * 0.15, 0.82, 0.1, g);
    return finish(g);
  };
  // swing (oonjal): a carved plank on brass chains, returns a moving group pivoting at the ceiling
  P.swing = function (x, z, HT) {
    const sw = new THREE.Group(); sw.position.set(x, HT, z); scene.add(sw); sw.userData.dyn = true;
    const plankY = -HT + 0.5;
    M_(rbox(1.8, 0.09, 0.72, 0.025), M.teak, 0, plankY, 0, sw);
    M_(rbox(1.84, 0.03, 0.76, 0.012), M.dark, 0, plankY - 0.05, 0, sw);
    for (let i = 0; i < 18; i++) M_(new THREE.SphereGeometry(0.014, 6, 4), M.brass, -0.86 + i * 0.1, plankY, 0.375, sw);
    const L = HT - 0.55, LINK = new THREE.TorusGeometry(0.024, 0.006, 3, 6);
    for (const [dx, dz] of [[-0.8, -0.28], [0.8, -0.28], [-0.8, 0.28], [0.8, 0.28]]) {
      const n = Math.floor(L / 0.08);
      for (let i = 0; i < n; i++) M_(LINK, M.brass, dx, -0.03 - i * 0.08, dz, sw, 0, i % 2 ? Math.PI / 2 : 0, Math.PI / 2);
      M_(lathe([[0, 0], [0.03, 0.01], [0.035, 0.04], [0.02, 0.06], [0, 0.06]], 8), M.brass, dx, plankY + 0.045, dz, sw);
    }
    finish(sw); P.mergeGroup(sw);
    return sw;
  };
  // cradle (thottil): a saree sling on a spreader, hung by ropes; pivots at the ceiling
  P.cradle = function (x, z, HT) {
    const cr = new THREE.Group(); cr.position.set(x, HT, z); scene.add(cr); cr.userData.dyn = true;
    for (const s of [-1, 1]) M_(new THREE.CylinderGeometry(0.008, 0.008, 2.45, 4), M.rope, 0, -1.22, s * 0.36, cr, s * 0.04, 0, 0);
    M_(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 8), M.dark, 0, -2.42, 0, cr, Math.PI / 2);
    const saree = new THREE.MeshStandardMaterial({ map: K.makeSareeTex('bottom'), roughness: 1, side: THREE.DoubleSide });
    const cl = M_(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), saree, 0, -2.45, 0, cr); cl.scale.set(0.62, 0.55, 1);
    finish(cr); P.mergeGroup(cr);
    return cr;
  };
  // carved teak pillar on a granite base
  P.pillar = function (x, z, HT) {
    const g = G(x, 0, z, 0), h = HT - 0.35;
    M_(rbox(0.52, 0.18, 0.52, 0.02), M.granite, 0, 0.09, 0, g);
    M_(lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.16, 0.08], [0.2, 0.17], [0, 0.17]], 16), M.granite, 0, 0.18, 0, g);
    M_(lathe([[0, 0], [0.17, 0], [0.2, 0.08], [0.21, 0.2], [0.16, 0.32], [0.14, 0.4], [0.17, 0.43], [0.14, 0.46], [0.15, h * 0.5], [0.14, h - 0.62], [0.17, h - 0.58], [0.14, h - 0.55], [0.16, h - 0.45], [0.22, h - 0.36], [0, h - 0.36]], 16), M.teak, 0, 0.35, 0, g);
    for (const y of [0.78, h * 0.55]) M_(new THREE.TorusGeometry(0.155, 0.018, 6, 18), M.brass, 0, y + 0.35, 0, g, Math.PI / 2);
    M_(rbox(0.48, 0.16, 0.48, 0.03), M.teak, 0, HT - 0.43, 0, g);
    // bracket arms
    for (let i = 0; i < 4; i++) { const b = new THREE.Shape(); b.moveTo(0, 0); b.lineTo(0.28, 0); b.quadraticCurveTo(0.26, -0.06, 0.12, -0.08); b.quadraticCurveTo(0.03, -0.12, 0, -0.2); b.lineTo(0, 0); const bg = new THREE.ExtrudeGeometry(b, { depth: 0.06, bevelEnabled: false, curveSegments: 6 }); bg.translate(0.12, 0, -0.03); bg.rotateY(i * Math.PI / 2); M_(bg, M.dark, 0, HT - 0.3, 0, g); }
    M_(rbox(0.72, 0.15, 0.3, 0.02), M.dark, 0, HT - 0.075, 0, g);
    return finish(g);
  };
  // kuthuvilakku: tiered brass oil lamp; returns {group, flames[]} with five wick sprites
  P.kuthu = function (x, y, z, scale, flameTex) {
    const g = G(x, y, z, 0); g.scale.setScalar(scale);
    M_(lathe([[0, 0], [0.13, 0], [0.135, 0.012], [0.11, 0.025], [0.115, 0.035], [0.07, 0.05], [0.05, 0.07], [0.03, 0.08], [0.022, 0.12], [0.03, 0.13], [0.02, 0.14], [0.018, 0.36], [0.03, 0.37], [0.02, 0.385], [0.022, 0.42], [0.05, 0.44], [0.09, 0.48], [0.095, 0.5], [0.08, 0.5], [0.04, 0.47], [0.02, 0.5], [0.025, 0.54], [0.012, 0.6], [0.02, 0.62], [0, 0.66]], 16), M.brass, 0, 0, 0, g);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, sp = M_(new THREE.ConeGeometry(0.014, 0.05, 6), M.brass, Math.cos(a) * 0.09, 0.495, Math.sin(a) * 0.09, g); sp.rotation.set(0, 0, 0); sp.lookAt(Math.cos(a) * 5, 0.5, Math.sin(a) * 5); sp.rotateX(Math.PI / 2); }
    const bird = M_(new THREE.SphereGeometry(0.022, 8, 6), M.brass, 0, 0.67, 0, g); bird.scale.set(1, 1, 1.7);
    M_(new THREE.ConeGeometry(0.008, 0.04, 5), M.brass, 0, 0.7, 0.03, g, -0.6, 0, 0);
    finish(g, true);
    // the five wick flames as one mesh of crossed quads: one draw call per lamp
    const fm = X.flameM || (X.flameM = new THREE.MeshBasicMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
    const parts = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; for (const r of [0, Math.PI / 2]) { const q = new THREE.PlaneGeometry(0.04, 0.08); q.translate(0, 0.03, 0); q.rotateY(r + a); q.translate(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1); parts.push(q); } }
    const flame = new THREE.Mesh(merge(parts), fm); flame.position.y = 0.53; flame.visible = false; g.add(flame);
    const flames = [flame];
    return { group: g, flames };
  };
  // low wooden seat (manai) with carved legs
  P.manai = function (x, y, z, ry = 0, w = 0.5) {
    const g = G(x, y, z, ry);
    M_(rbox(w, 0.05, w * 0.6, 0.015), M.teak, 0, 0.1, 0, g);
    for (const sx of [-1, 1]) M_(rbox(0.05, 0.09, w * 0.55, 0.012), M.dark, sx * (w / 2 - 0.05), 0.045, 0, g);
    return finish(g);
  };
  // glass-fronted kitchen cabinet against a wall (back local -z), with plates/vessels inside
  P.cabinet = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), w = o.w, h = o.h || 1.9, d = 0.5;
    M_(rbox(w, h - 0.1, 0.02, 0.005), M.dark, 0, 0.05 + (h - 0.1) / 2, -d / 2 + 0.01, g);
    for (const sx of [-1, 1]) M_(rbox(0.04, h, d, 0.008), M.teak, sx * (w / 2 - 0.02), h / 2, 0, g);
    M_(rbox(w + 0.06, 0.07, d + 0.04, 0.02), M.dark, 0, h, 0, g); M_(rbox(w, 0.1, d, 0.02), M.dark, 0, 0.05, 0, g);
    const lv = [0.1, 0.62, 1.12, 1.55];
    lv.forEach(y => M_(rbox(w - 0.08, 0.025, d - 0.04, 0.005), M.wood, 0, y, 0, g));
    // contents
    const r = rng(Math.floor(o.x * 13));
    for (let i = 0; i < 4; i++) { const p = P.vessel('plate', -w / 2 + 0.2 + i * (w - 0.4) / 3, 1.13, -d / 2 + 0.08, 1, M.brass, g); p.rotation.set(-1.25, 0, 0); p.position.y = 1.29; }
    for (let i = 0; i < 4; i++) P.vessel(i % 2 ? 'sombu' : 'davara', -w / 2 + 0.18 + i * (w - 0.36) / 3, 0.635, 0.02, 1, i % 2 ? M.copper : M.brass, g);
    for (let i = 0; i < 3; i++) P.vessel('bottle', -w / 2 + 0.25 + i * (w - 0.5) / 2, 1.565, 0, 0.8 + r() * 0.3, M.glassDark, g);
    // glazed doors with frames
    const dw = w / 2 - 0.03;
    for (const s of [-1, 1]) {
      const dx = s * (dw / 2 + 0.005);
      for (const yy of [0.12, 1.86]) M_(rbox(dw, 0.04, 0.025, 0.006), M.teak, dx, yy, d / 2 - 0.01, g);
      for (const e of [-1, 1]) M_(rbox(0.04, 1.78, 0.025, 0.006), M.teak, dx + e * (dw / 2 - 0.02), 0.99, d / 2 - 0.01, g);
      M_(rbox(dw, 0.03, 0.02, 0.005), M.teak, dx, 0.9, d / 2 - 0.01, g);
      M_(new THREE.PlaneGeometry(dw - 0.06, 1.7), X.glass, dx, 0.99, d / 2 - 0.006, g);
      M_(new THREE.SphereGeometry(0.013, 8, 6), M.brass, s * 0.03, 0.95, d / 2 + 0.01, g);
    }
    return finish(g);
  };
  // tulasi maadam (sacred basil planter)
  P.tulasi = function (x, z, mat, leafMat) {
    const g = G(x, 0, z, 0);
    M_(lathe([[0, 0], [0.3, 0], [0.3, 0.12], [0.24, 0.16], [0.22, 0.5], [0.27, 0.56], [0.3, 0.66], [0.26, 0.72], [0.22, 0.72], [0, 0.7]], 4), mat, 0, 0, 0, g, 0, Math.PI / 4, 0);
    const r = rng(Math.floor(x * 31 + z));
    for (let i = 0; i < 14; i++) M_(new THREE.SphereGeometry(0.035 + r() * 0.035, 6, 5), leafMat, (r() - 0.5) * 0.24, 0.76 + r() * 0.32, (r() - 0.5) * 0.24, g);
    M_(new THREE.CylinderGeometry(0.008, 0.012, 0.35, 5), M.dark, 0, 0.88, 0, g);
    return finish(g);
  };

  // closed pedestal stool (the lamp stands in the courtyard)
  P.pedestal = function (x, z, w, h, y = 0) {
    const g = G(x, y, z, 0);
    M_(rbox(w + 0.04, 0.06, w + 0.04, 0.015), M.dark, 0, 0.03, 0, g);
    M_(rbox(w, h - 0.12, w, 0.02), M.teak, 0, 0.06 + (h - 0.12) / 2, 0, g);
    M_(rbox(w + 0.05, 0.06, w + 0.05, 0.02), M.dark, 0, h - 0.03, 0, g);
    for (const yy of [0.1, h - 0.1]) M_(new THREE.BoxGeometry(w + 0.012, 0.012, w + 0.012), M.brass, 0, yy, 0, g);
    return finish(g);
  };
  // low sideboard with carved doors (back local -z)
  P.sideboard = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0), w = o.w, h = o.h || 0.9, d = o.d || 0.5;
    M_(rbox(w, h - 0.08, d, 0.02), M.dark, 0, 0.08 + (h - 0.08) / 2, 0, g);
    M_(rbox(w + 0.04, 0.04, d + 0.03, 0.012), M.teak, 0, h + 0.02, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M_(new THREE.SphereGeometry(0.04, 8, 6), M.dark, sx * (w / 2 - 0.06), 0.04, sz * (d / 2 - 0.06), g);
    for (const sx of [-1, 1]) { M_(new THREE.BoxGeometry(w / 2 - 0.06, h - 0.22, 0.015), X.carved, sx * (w / 4), 0.1 + (h - 0.2) / 2, d / 2 + 0.002, g); M_(new THREE.SphereGeometry(0.014, 8, 6), M.brass, sx * 0.05, h * 0.55, d / 2 + 0.015, g); }
    P.vessel('kudam', -w * 0.22, h + 0.04, 0, 1, M.brass, g); P.vessel('sombu', w * 0.2, h + 0.04, 0.05, 1, M.copper, g);
    return finish(g);
  };
  // wall shelf plank on two brackets (back local -z)
  P.wallShelf = function (x, y, z, w, d, ry) {
    const g = G(x, y, z, ry);
    M_(rbox(w, 0.035, d, 0.008), M.wood, 0, 0, 0, g);
    M_(rbox(w, 0.03, 0.015, 0.004), M.dark, 0, -0.02, d / 2 - 0.006, g);
    for (const sx of [-1, 1]) { const b = new THREE.Shape(); b.moveTo(0, 0); b.lineTo(d * 0.9, 0); b.quadraticCurveTo(d * 0.25, -d * 0.2, 0, -d * 0.9); b.lineTo(0, 0); const bg = new THREE.ExtrudeGeometry(b, { depth: 0.03, bevelEnabled: false, curveSegments: 5 }); bg.rotateY(-Math.PI / 2); M_(bg, M.dark, sx * (w / 2 - 0.12), -0.018, -d / 2, g); }
    return finish(g);
  };

  /* ======================= second wing: puzzle props ======================= */
  const dynG = (x, y, z, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.userData.dyn = true; scene.add(g); return g; };
  P.dynG = dynG;
  // Godrej-style iron safe; the door swings on its left edge; the dial knob is missing until found
  P.safe = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), body = X.safeM || (X.safeM = new THREE.MeshStandardMaterial({ color: 0x2f4a3e, metalness: 0.55, roughness: 0.4 }));
    const w = 0.8, h = 1.25, d = 0.7;
    M_(rbox(w, 0.1, d, 0.02), M.iron, 0, 0.05, 0, g);
    for (const [x, y, z, ww, hh, dd] of [[-w / 2 + 0.03, 0.72, 0, 0.06, h, d], [w / 2 - 0.03, 0.72, 0, 0.06, h, d], [0, 0.12, 0, w, 0.06, d], [0, 1.32, 0, w, 0.06, d], [0, 0.72, -d / 2 + 0.03, w, h, 0.06]]) M_(new THREE.BoxGeometry(ww, hh, dd), body, x, y, z, g);
    M_(new THREE.BoxGeometry(w - 0.12, h - 0.14, d - 0.1), X.blackHole, 0, 0.72, -0.02, g);
    M_(new THREE.BoxGeometry(0.5, 0.03, 0.4), M.iron, 0, 0.72, 0, g);
    const door = dynG(0, 0, 0); g.updateMatrixWorld(true); door.position.copy(new THREE.Vector3(-w / 2 + 0.02, 0.15, d / 2).applyMatrix4(g.matrixWorld)); door.rotation.y = o.ry || 0;
    M_(new THREE.BoxGeometry(w - 0.06, h - 0.06, 0.07), body, (w - 0.06) / 2, 0.57, 0.035, door);
    M_(new THREE.BoxGeometry(w - 0.22, h - 0.26, 0.012), X.safePanel || (X.safePanel = new THREE.MeshStandardMaterial({ color: 0x3a5a4b, metalness: 0.5, roughness: 0.38 })), (w - 0.06) / 2, 0.57, 0.075, door);
    M_(new THREE.BoxGeometry(0.2, 0.06, 0.01), M.brass, (w - 0.06) / 2, 1.0, 0.085, door);
    const handle = M_(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), M.steel, (w - 0.06) / 2 + 0.2, 0.55, 0.1, door, 0, 0, Math.PI / 2);
    M_(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 18), M.steel, (w - 0.06) / 2, 0.72, 0.08, door, Math.PI / 2);
    const knob = M_(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 20), X.knobM || (X.knobM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.3 })), (w - 0.06) / 2, 0.72, 0.11, door, Math.PI / 2);
    knob.visible = false; knob.userData.keep = true;
    finish(g); return { group: g, door, knob, handle };
  };
  // beam balance on a low table: a sack of paddy on one pan, brass weights beside it
  P.balance = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0);
    M_(rbox(0.5, 0.06, 0.24, 0.012), M.teak, 0, 0.03, 0, g);
    const drawer = dynG(0, 0, 0); g.updateMatrixWorld(true); drawer.position.copy(new THREE.Vector3(0, 0.0, 0).applyMatrix4(g.matrixWorld)); drawer.rotation.y = o.ry || 0;
    M_(rbox(0.34, 0.05, 0.2, 0.008), M.wood, 0, -0.03, 0, drawer); M_(new THREE.SphereGeometry(0.012, 8, 6), M.brass, 0, -0.03, 0.105, drawer);
    M_(new THREE.CylinderGeometry(0.014, 0.02, 0.55, 10), M.brass, 0, 0.33, 0, g);
    const beam = dynG(0, 0, 0); beam.position.copy(new THREE.Vector3(0, 0.6, 0).applyMatrix4(g.matrixWorld)); beam.rotation.y = o.ry || 0;
    M_(new THREE.BoxGeometry(0.62, 0.018, 0.018), M.brass, 0, 0, 0, beam);
    const pans = [];
    for (const s of [-1, 1]) {
      const hang = new THREE.Group(); hang.position.set(s * 0.3, 0, 0); beam.add(hang);
      for (const a of [0, 2.1, 4.2]) M_(new THREE.CylinderGeometry(0.002, 0.002, 0.26, 3), M.iron, Math.cos(a) * 0.05, -0.13, Math.sin(a) * 0.05, hang, 0, 0, 0);
      M_(lathe([[0.001, -0.29], [0.09, -0.285], [0.1, -0.26], [0.001, -0.27]], 16), M.brass, 0, 0, 0, hang);
      pans.push(hang);
    }
    const sack = M_(new THREE.SphereGeometry(0.07, 10, 8), X.sack, 0, -0.22, 0, pans[0]); sack.scale.set(1, 0.8, 0.9);
    const weights = [1, 2, 4, 8, 16].map((v, i) => { const sz = 0.018 + Math.cbrt(v) * 0.012; const m = M_(new THREE.CylinderGeometry(sz, sz * 1.15, sz * 1.6, 12), M.brass, 0, 0, 0); m.userData.dyn = true; m.userData.wv = v; scene.add(m); return m; });
    finish(g); return { group: g, beam, pans, drawer, weights, sack };
  };
  // wall fuse board: three porcelain carriers (missing) and a main switch
  P.fusebox = function (o) {
    const g = G(o.x, o.y, o.z, o.ry || 0);
    M_(rbox(0.62, 0.5, 0.04, 0.01), M.teak, 0, 0, 0, g);
    const porc = X.porc || (X.porc = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.35 }));
    for (let i = 0; i < 3; i++) { M_(new THREE.BoxGeometry(0.1, 0.16, 0.03), porc, -0.18 + i * 0.12, 0.06, 0.03, g); M_(new THREE.BoxGeometry(0.03, 0.03, 0.02), M.brass, -0.18 + i * 0.12, 0.13, 0.05, g); M_(new THREE.BoxGeometry(0.03, 0.03, 0.02), M.brass, -0.18 + i * 0.12, -0.01, 0.05, g); }
    M_(new THREE.BoxGeometry(0.12, 0.2, 0.06), M.iron, 0.22, 0.04, 0.04, g);
    const slots = [], lever = dynG(0, 0, 0); g.updateMatrixWorld(true);
    lever.position.copy(new THREE.Vector3(0.22, 0.04, 0.08).applyMatrix4(g.matrixWorld)); lever.rotation.y = o.ry || 0;
    M_(new THREE.BoxGeometry(0.025, 0.14, 0.025), M.redGrip || M.iron, 0, 0.06, 0, lever);
    for (let i = 0; i < 3; i++) { const f = dynG(0, 0, 0); f.position.copy(new THREE.Vector3(-0.18 + i * 0.12, 0.06, 0.055).applyMatrix4(g.matrixWorld)); f.rotation.y = o.ry || 0; M_(new THREE.BoxGeometry(0.08, 0.13, 0.04), porc, 0, 0, 0, f); M_(new THREE.BoxGeometry(0.04, 0.04, 0.03), X.blackHole, 0, 0, 0.012, f); f.visible = false; slots.push(f); }
    const lampG = dynG(0, 0, 0); lampG.position.copy(new THREE.Vector3(0, 0.2, 0.05).applyMatrix4(g.matrixWorld));
    const lamp = M_(new THREE.SphereGeometry(0.022, 10, 8), X.lampOff || (X.lampOff = new THREE.MeshBasicMaterial({ color: 0x401010 })), 0, 0, 0, lampG); lamp.userData.keepMat = true;
    finish(g); return { group: g, slots, lever, lamp };
  };
  // deep stone water tank (thotti): water and a sealed wooden box rise when it is filled
  P.tank = function (o) {
    const g = G(o.x, 0, o.z, 0), w = o.w || 1.4, d = o.d || 1.4, h = 1.05, t = 0.14, stone = M.granite;
    for (const [x, z, ww, dd] of [[0, -d / 2 + t / 2, w, t], [0, d / 2 - t / 2, w, t], [-w / 2 + t / 2, 0, t, d - 2 * t], [w / 2 - t / 2, 0, t, d - 2 * t]]) M_(new THREE.BoxGeometry(ww, h, dd), stone, x, h / 2, z, g);
    M_(new THREE.BoxGeometry(w - 2 * t, 0.04, d - 2 * t), X.sootClay, 0, -0.5, 0, g);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * t, 1.6, d - 2 * t), Object.assign(X.sootClay.clone(), { side: THREE.BackSide })); inner.position.set(0, 0.25, 0); g.add(inner);
    const water = dynG(o.x, -0.45, o.z); M_(new THREE.PlaneGeometry(w - 2 * t - 0.02, d - 2 * t - 0.02), M.water, 0, 0, 0, water, -Math.PI / 2);
    const box = dynG(o.x + 0.12, -0.42, o.z - 0.08, 0.3);
    M_(rbox(0.36, 0.2, 0.26, 0.015), X.carved || M.teak, 0, 0.1, 0, box); M_(new THREE.BoxGeometry(0.38, 0.03, 0.28), M.dark, 0, 0.2, 0, box);
    for (const s of [-1, 1]) M_(new THREE.BoxGeometry(0.02, 0.21, 0.27), M.brass, s * 0.12, 0.1, 0, box);
    finish(g); return { group: g, water, box, rimY: h };
  };
  // electric water pump in the wash room (1987): green motor, fan cowl, pipes
  P.motor = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), green = X.motorM || (X.motorM = new THREE.MeshStandardMaterial({ color: 0x2d5a3a, metalness: 0.4, roughness: 0.45 }));
    M_(rbox(0.5, 0.08, 0.3, 0.01), M.iron, 0, 0.04, 0, g);
    M_(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 18), green, 0, 0.22, 0, g, 0, 0, Math.PI / 2);
    M_(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 16), M.iron, 0.24, 0.2, 0, g, 0, 0, Math.PI / 2);
    M_(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8), M.iron, 0.3, 0.9, 0, g);
    M_(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), M.iron, 0.3, 1.7, -0.3, g, Math.PI / 2);
    const fan = dynG(0, 0, 0); g.updateMatrixWorld(true); fan.position.copy(new THREE.Vector3(-0.2, 0.22, 0).applyMatrix4(g.matrixWorld)); fan.rotation.y = o.ry || 0;
    for (let i = 0; i < 4; i++) M_(new THREE.BoxGeometry(0.01, 0.16, 0.04), M.steel, 0, 0, 0, fan, i * Math.PI / 4);
    finish(g); return { group: g, fan };
  };
  P.harmonium = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0);
    M_(rbox(0.62, 0.22, 0.32, 0.015), M.teak, 0, 0.11, 0, g);
    const white = X.keysW || (X.keysW = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.4 }));
    for (let i = 0; i < 14; i++) M_(new THREE.BoxGeometry(0.034, 0.02, 0.12), white, -0.24 + i * 0.037, 0.225, 0.08, g);
    for (let i = 0; i < 13; i++) if ([2, 6, 9, 13].indexOf(i) < 0) M_(new THREE.BoxGeometry(0.02, 0.03, 0.07), X.blackHole, -0.22 + i * 0.037, 0.24, 0.05, g);
    M_(new THREE.BoxGeometry(0.58, 0.16, 0.04), X.carved || M.teak, 0, 0.3, -0.12, g, -0.3);
    finish(g); return g;
  };
  P.veena = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0);
    M_(new THREE.SphereGeometry(0.2, 14, 10), M.teak, 0, 0.22, 0, g).scale.set(1, 0.8, 1);
    M_(new THREE.CylinderGeometry(0.035, 0.05, 1.0, 10), M.teak, 0.55, 0.32, 0, g, 0, 0, Math.PI / 2 - 0.05);
    M_(new THREE.SphereGeometry(0.11, 10, 8), M.dark, 1.05, 0.36, 0, g);
    for (let i = 0; i < 4; i++) M_(new THREE.CylinderGeometry(0.0015, 0.0015, 1.1, 3), M.brass, 0.5, 0.36, -0.02 + i * 0.013, g, 0, 0, Math.PI / 2 - 0.05);
    finish(g); return g;
  };
  P.radio = function (o) {
    const g = G(o.x, o.y || 0, o.z, o.ry || 0);
    M_(rbox(0.46, 0.3, 0.22, 0.03), M.teak, 0, 0.15, 0, g);
    M_(new THREE.PlaneGeometry(0.24, 0.2), X.sling || M.redCloth, -0.08, 0.16, 0.112, g);
    const dial = dynG(0, 0, 0); g.updateMatrixWorld(true); dial.position.copy(new THREE.Vector3(0.14, 0.18, 0.112).applyMatrix4(g.matrixWorld)); dial.rotation.y = o.ry || 0;
    const glow = M_(new THREE.PlaneGeometry(0.12, 0.08), X.dialOff || (X.dialOff = new THREE.MeshBasicMaterial({ color: 0x1a1408 })), 0, 0, 0.002, dial); glow.userData.keepMat = true;
    for (const x of [0.1, 0.18]) M_(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), M.dark, x, 0.06, 0.115, g, Math.PI / 2);
    finish(g); return { group: g, glow };
  };
  P.sewing = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), black = X.sewM || (X.sewM = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.4, roughness: 0.3 }));
    M_(rbox(1.0, 0.04, 0.5, 0.01), M.teak, 0, 0.76, 0, g);
    for (const s of [-1, 1]) M_(new THREE.BoxGeometry(0.06, 0.74, 0.44), M.iron, s * 0.42, 0.37, 0, g);
    M_(new THREE.TorusGeometry(0.16, 0.02, 6, 20), M.iron, 0.42, 0.42, 0.25, g, 0, Math.PI / 2);
    M_(new THREE.BoxGeometry(0.42, 0.08, 0.16), black, 0, 0.82, 0, g);
    M_(new THREE.BoxGeometry(0.08, 0.2, 0.12), black, 0.17, 0.92, 0, g);
    M_(new THREE.BoxGeometry(0.4, 0.07, 0.1), black, 0.0, 1.03, 0, g);
    M_(new THREE.BoxGeometry(0.07, 0.12, 0.08), black, -0.17, 0.96, 0, g);
    M_(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), M.steel, 0.24, 0.98, 0, g, 0, 0, Math.PI / 2);
    M_(new THREE.BoxGeometry(0.24, 0.006, 0.02), M.brass, 0, 1.05, 0.051, g);
    finish(g); return g;
  };
  // big wooden paddy bin (kudhir) with a carved front
  P.grainBin = function (o) {
    const g = G(o.x, 0, o.z, o.ry || 0), w = o.w || 1.4, d = o.d || 0.9, h = o.h || 1.7;
    M_(rbox(w, h, d, 0.03), M.wood, 0, h / 2, 0, g);
    M_(new THREE.PlaneGeometry(w * 0.8, h * 0.7), X.carvedWide || M.teak, 0, h * 0.5, d / 2 + 0.002, g);
    M_(rbox(w + 0.06, 0.06, d + 0.06, 0.015), M.dark, 0, h + 0.03, 0, g);
    M_(new THREE.BoxGeometry(0.16, 0.12, 0.08), M.dark, 0, 0.18, d / 2 + 0.04, g);
    finish(g); return g;
  };
})(window.K);
