/* Things you pick up, modelled properly: old skeleton keys with cut bits, a sliding matchbox with sticks,
   a riveted well bucket on a rope, bolt cutters, a glass syringe, a serrated sickle, kit-kat porcelain fuses,
   a numbered safe dial and a silver anklet with bells. Each model is a few merged meshes (a handful of draw calls). */
(function (K) {
  const I = K.Items3D = {};
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(Math.max(0.0001, r), y)), seg);
  const ext = (shape, depth, bevel = 0, uvk = 7) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 }); g.translate(0, 0, -depth / 2); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvk, uv.getY(i) * uvk); return g; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
  const cv = (w, h, fn) => { const c = K.canvas(w, h), g = c.getContext('2d'); fn(g, w, h); return K.toTex(c); };
  let MAT = null;
  function mats(M) {
    if (MAT) return MAT;
    const std = o => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.8, metalness: 0 }, o));
    const env = K.envMap || null, metal = o => std(Object.assign({ envMap: env, envMapIntensity: env ? 1 : 0 }, o));
    MAT = {
      brassOld: metal({ map: cv(128, 128, (g, w, h) => { g.fillStyle = '#b8892e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? `rgba(60,80,40,${Math.random() * 0.35})` : `rgba(255,220,140,${Math.random() * 0.2})`; const r = 2 + Math.random() * 9; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); } }), metalness: 0.6, roughness: 0.42 }),
      ironOld: metal({ map: cv(128, 128, (g, w, h) => { g.fillStyle = '#2e2b29'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.55 ? `rgba(120,52,20,${Math.random() * 0.45})` : `rgba(0,0,0,${Math.random() * 0.3})`; const r = 1 + Math.random() * 7; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); } }), metalness: 0.55, roughness: 0.62 }),
      steelBlade: metal({ map: cv(128, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d9dcdc'); gr.addColorStop(0.25, '#8f9294'); gr.addColorStop(1, '#4a3a30'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(110,48,18,${Math.random() * 0.4})`; g.fillRect(Math.random() * w, h * 0.3 + Math.random() * h * 0.7, 2 + Math.random() * 6, 1 + Math.random() * 3); } }), metalness: 0.7, roughness: 0.4 }),
      rubber: std({ color: 0x7a1410, roughness: 0.75 }),
      porcelain: std({ color: 0xece6d8, roughness: 0.28, metalness: 0.05 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xe8f0f2, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.1, depthWrite: false }),
      fluid: std({ color: 0x2fd185, emissive: 0x0e5a34, roughness: 0.25 }),
      blackRub: std({ color: 0x141414, roughness: 0.6 }),
      matchWood: std({ color: 0xd8c08a, roughness: 0.9 }),
      matchHead: std({ color: 0x8a1a10, roughness: 0.7 }),
      sleeve: std({ map: cv(256, 128, (g, w, h) => {
        g.fillStyle = '#d6a72a'; g.fillRect(0, 0, w, h); g.fillStyle = '#7c1a0f'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
        g.fillStyle = '#7c1a0f'; g.beginPath(); g.arc(w * 0.28, h / 2, 28, 0, 7); g.fill(); g.fillStyle = '#f2c94c'; g.beginPath(); g.moveTo(w * 0.28, h / 2 - 20); g.quadraticCurveTo(w * 0.28 + 14, h / 2, w * 0.28, h / 2 + 18); g.quadraticCurveTo(w * 0.28 - 14, h / 2, w * 0.28, h / 2 - 20); g.fill();
        g.fillStyle = '#5a1008'; g.font = 'bold 26px "Catamaran","Noto Sans Tamil",sans-serif'; g.textBaseline = 'middle'; g.fillText('தீப்பெட்டி', w * 0.42, h / 2 + 2, w * 0.54);
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,30,10,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      }), roughness: 0.85 }),
      striker: std({ map: cv(64, 32, (g, w, h) => { g.fillStyle = '#4a2a1a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,10,5' : '120,80,50'},0.6)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); } }), roughness: 1 }),
      tray: std({ color: 0xc9b07a, roughness: 0.9 }),
      dial: std({ map: cv(256, 256, (g, w, h) => {
        g.fillStyle = '#121212'; g.fillRect(0, 0, w, h); const cx = w / 2, cy = h / 2;
        g.strokeStyle = '#c8c2b4'; for (let i = 0; i < 100; i++) { const a = i / 100 * Math.PI * 2 - Math.PI / 2, r0 = i % 10 === 0 ? 92 : i % 5 === 0 ? 100 : 106; g.lineWidth = i % 10 === 0 ? 3 : 1.4; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * 118, cy + Math.sin(a) * 118); g.stroke(); }
        g.fillStyle = '#e4ddcc'; g.font = 'bold 22px "Catamaran","Noto Sans Tamil",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const TD = K.TAMIL_DIGITS || ['௦', '௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯'];
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2; g.fillText(TD[i], cx + Math.cos(a) * 74, cy + Math.sin(a) * 74); }
        const gr = g.createRadialGradient(cx, cy, 10, cx, cy, 55); gr.addColorStop(0, '#2a2a2a'); gr.addColorStop(1, '#0c0c0c'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 52, 0, 7); g.fill();
      }), roughness: 0.4, metalness: 0.3 }),
      knurl: metal({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.5 }),
      wood: M.wood || std({ color: 0x6a4428, roughness: 0.8 }),
      rope: std({ color: 0x6a5538, roughness: 1 }),
      silver: metal({ color: 0xe0e0e4, metalness: 0.95, roughness: 0.22, emissive: 0x111114 })
    };
    return MAT;
  }

  /* ---------------- keys ---------------- */
  // an old key lying flat: bow at -x, shaft along +x, the bit hanging off the end in +z
  function key(s, mat, style) {
    const g = new THREE.Group(), L = 0.11 * s, r = 0.0055 * s;
    if (style === 'ring' || style === 'flat') {
      const bow = new THREE.Shape(); bow.absarc(0, 0, 0.03 * s, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, 0.017 * s, 0, Math.PI * 2, true); bow.holes.push(hole);
      g.add(mesh(ext(bow, (style === 'flat' ? 0.004 : 0.007) * s, 0.0012 * s), mat, -0.03 * s));
    } else { // trefoil bow: three loops round a boss
      for (let i = 0; i < 3; i++) { const a = Math.PI + (i - 1) * 2.1, t = new THREE.TorusGeometry(0.017 * s, 0.0042 * s, 6, 18); t.rotateX(Math.PI / 2); g.add(mesh(t, mat, -0.03 * s + Math.cos(a) * 0.018 * s, 0, Math.sin(a) * 0.018 * s)); }
      const boss = new THREE.SphereGeometry(0.009 * s, 10, 8); boss.scale(1, 0.6, 1); g.add(mesh(boss, mat, -0.03 * s));
    }
    if (style !== 'flat') {
      const sh = lathe([[r * 1.6, 0], [r * 1.6, 0.006 * s], [r, 0.009 * s], [r, 0.014 * s], [r * 1.4, 0.016 * s], [r * 1.4, 0.02 * s], [r, 0.023 * s], [r, L], [r * 1.1, L + 0.002 * s], [r * 0.5, L + 0.004 * s]], 10);
      sh.rotateZ(-Math.PI / 2); g.add(mesh(sh, mat, 0.0, 0, 0));
      // the bit: a plate with ward cuts
      const b = new THREE.Shape(), bw = 0.022 * s, bl = 0.03 * s;
      b.moveTo(0, 0); b.lineTo(bw, 0); b.lineTo(bw, bl * 0.3); b.lineTo(bw * 0.7, bl * 0.3); b.lineTo(bw * 0.7, bl * 0.5); b.lineTo(bw, bl * 0.5); b.lineTo(bw, bl); b.lineTo(bw * 0.35, bl); b.lineTo(bw * 0.35, bl * 0.72); b.lineTo(0, bl * 0.72); b.lineTo(0, 0);
      const bg = ext(b, 0.005 * s, 0.0006 * s); g.add(mesh(bg, mat, L - bw - 0.004 * s, 0, 0.004 * s));
    } else { // a flat cupboard key: blade with a cut edge
      const b = new THREE.Shape(), bl = 0.075 * s, bw = 0.014 * s;
      b.moveTo(0, -bw / 2); for (let i = 0; i <= 6; i++) { const x = (i / 6) * bl; b.lineTo(x, -bw / 2 - (i % 2 ? 0.004 * s : 0)); } b.lineTo(bl + 0.006 * s, 0); b.lineTo(bl, bw / 2); b.lineTo(0, bw / 2); b.lineTo(0, -bw / 2);
      g.add(mesh(ext(b, 0.0032 * s, 0.0005 * s), mat, 0, 0, 0));
    }
    g.position.y = 0.004 * s;
    return g;
  }

  const B = {};
  B.smallkey = m => key(1.25, m.brassOld, 'ring');
  B.brasskey = m => key(2.0, m.brassOld, 'trefoil');
  B.almirahkey = m => key(1.35, MAT.steelBlade, 'flat');
  B.wingkey = m => key(1.7, m.ironOld, 'trefoil');
  B.bigkey = m => key(3.2, m.ironOld, 'trefoil');

  /* ---------------- a box of matches, half open ---------------- */
  B.matchbox = m => {
    const g = new THREE.Group(), w = 0.056, d = 0.037, h = 0.017, t = 0.0012;
    g.add(mesh(new THREE.BoxGeometry(w, t, d), m.sleeve, 0, h - t / 2, 0));             // label on top
    g.add(mesh(new THREE.BoxGeometry(w, t, d), m.tray, 0, t / 2, 0));
    for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(w, h, t), m.striker, 0, h / 2, sz * (d / 2 - t / 2)));
    const tg = new THREE.Group(); tg.position.x = 0.022; g.add(tg);                       // the tray slid out
    tg.add(mesh(new THREE.BoxGeometry(w - 0.004, t, d - 0.004), m.tray, 0, 0.0025, 0));
    for (const sx of [-1, 1]) tg.add(mesh(new THREE.BoxGeometry(t, h - 0.006, d - 0.004), m.tray, sx * (w / 2 - 0.003), h / 2 - 0.0005, 0));
    for (const sz of [-1, 1]) tg.add(mesh(new THREE.BoxGeometry(w - 0.004, h - 0.006, t), m.tray, 0, h / 2 - 0.0005, sz * (d / 2 - 0.003)));
    for (let i = 0; i < 9; i++) { const z = -d / 2 + 0.006 + i * 0.0033 + (i % 2) * 0.0008, x = (i % 3 - 1) * 0.0015;
      const st = new THREE.BoxGeometry(0.046, 0.0022, 0.0022); tg.add(mesh(st, m.matchWood, x, 0.006 + (i % 2) * 0.0024, z));
      const hd = new THREE.SphereGeometry(0.0021, 6, 5); hd.scale(1.6, 1, 1); tg.add(mesh(hd, m.matchHead, x + 0.024, 0.006 + (i % 2) * 0.0024, z)); }
    return g;
  };

  /* ---------------- the well bucket ---------------- */
  B.bucket = m => {
    const g = new THREE.Group();
    const wall = lathe([[0.122, 0.004], [0.126, 0.02], [0.128, 0.022], [0.15, 0.2], [0.153, 0.205], [0.165, 0.255], [0.174, 0.262], [0.176, 0.27], [0.168, 0.272], [0.163, 0.262], [0.15, 0.21], [0.12, 0.02], [0.116, 0.012]], 26);
    const inside = m.brassOld.clone(); inside.side = THREE.DoubleSide; g.add(mesh(wall, inside));
    const bot = lathe([[0, 0.006], [0.12, 0.006], [0.124, 0.0]], 26); g.add(mesh(bot, m.brassOld));
    for (const y of [0.09, 0.18]) { const b = new THREE.TorusGeometry(0.135 + y * 0.12, 0.004, 4, 30); b.rotateX(Math.PI / 2); g.add(mesh(b, m.brassOld, 0, y, 0)); }
    for (const s of [-1, 1]) { // ears with rivets
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.04, 0.03), m.ironOld, s * 0.168, 0.24, 0));
      for (const z of [-0.008, 0.008]) g.add(mesh(new THREE.SphereGeometry(0.004, 6, 4), m.ironOld, s * 0.175, 0.232, z));
    }
    const bail = new THREE.TorusGeometry(0.168, 0.0045, 5, 24, Math.PI); g.add(mesh(bail, m.ironOld, 0, 0.245, 0));
    const grip = new THREE.CylinderGeometry(0.012, 0.012, 0.07, 10); grip.rotateZ(Math.PI / 2); g.add(mesh(grip, m.wood, 0, 0.413, 0));
    for (let i = 0; i < 5; i++) { const c = new THREE.TorusGeometry(0.05 - i * 0.002, 0.008, 5, 16); c.rotateX(Math.PI / 2 + (i - 2) * 0.08); g.add(mesh(c, m.rope, 0.004 * i, 0.43 + i * 0.012, 0)); } // the rope, coiled
    const knot = new THREE.SphereGeometry(0.016, 8, 6); g.add(mesh(knot, m.rope, 0, 0.418, 0));
    return g;
  };

  /* ---------------- bolt cutters ---------------- */
  B.boltcutter = m => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const arm = new THREE.CylinderGeometry(0.0085, 0.011, 0.36, 10); arm.rotateZ(Math.PI / 2); const a = mesh(arm, m.ironOld, -0.06, 0.014, s * 0.024); a.rotation.y = s * 0.07; g.add(a);
      const gp = lathe([[0.016, 0], [0.018, 0.01], [0.016, 0.02], [0.018, 0.03], [0.016, 0.04], [0.018, 0.05], [0.016, 0.06], [0.018, 0.07], [0.016, 0.08], [0.018, 0.09], [0.016, 0.1], [0.018, 0.11], [0.016, 0.12], [0.014, 0.13], [0.0, 0.135]], 10);
      gp.rotateZ(Math.PI / 2); const gm = mesh(gp, m.rubber, -0.21, 0.016, s * 0.036); gm.rotation.y = s * 0.07; g.add(gm);
      // jaw blade
      const jw = new THREE.Shape(); jw.moveTo(0, 0); jw.lineTo(0.07, -s * 0.004); jw.quadraticCurveTo(0.095, -s * 0.002, 0.1, s * 0.008); jw.lineTo(0.03, s * 0.022); jw.lineTo(0, s * 0.02); jw.lineTo(0, 0);
      g.add(mesh(ext(jw, 0.012, 0.001), MAT.steelBlade, 0.12, 0.014, s * 0.002));
      // side plates of the compound pivot
      const pl = new THREE.Shape(); pl.absarc(0, 0, 0.022, Math.PI / 2, Math.PI * 1.5, false); pl.lineTo(0.06, -0.022); pl.absarc(0.06, 0, 0.022, -Math.PI / 2, Math.PI / 2, false); pl.lineTo(0, 0.022);
      g.add(mesh(ext(pl, 0.004, 0.0008), m.ironOld, 0.085, 0.014 + s * 0.012, 0));
    }
    for (const x of [0.085, 0.145]) { const bolt = new THREE.CylinderGeometry(0.006, 0.006, 0.034, 8); g.add(mesh(bolt, MAT.steelBlade, x, 0.014, 0)); }
    return g;
  };

  /* ---------------- a glass syringe of sedative ---------------- */
  B.oosi = m => {
    const g = new THREE.Group();
    const barrel = lathe([[0.012, 0], [0.012, 0.1], [0.0125, 0.102], [0.0, 0.103]], 14); barrel.rotateZ(-Math.PI / 2); g.add(mesh(barrel, m.glass, -0.05, 0, 0));
    const liq = new THREE.CylinderGeometry(0.0098, 0.0098, 0.062, 12); liq.rotateZ(Math.PI / 2); g.add(mesh(liq, m.fluid, 0.012, 0, 0));
    for (let i = 0; i < 6; i++) { const r = new THREE.TorusGeometry(0.0121, 0.0004, 3, 14); r.rotateY(Math.PI / 2); g.add(mesh(r, m.blackRub, -0.035 + i * 0.012, 0, 0)); } // the marks
    const stop = new THREE.CylinderGeometry(0.0105, 0.0105, 0.008, 12); stop.rotateZ(Math.PI / 2); g.add(mesh(stop, m.blackRub, -0.023, 0, 0));
    for (const rz of [0, Math.PI / 2]) { const rod = new THREE.BoxGeometry(0.06, 0.012, 0.0022); rod.rotateX(rz); g.add(mesh(rod, m.porcelain, -0.055, 0, 0)); }
    const thumb = new THREE.CylinderGeometry(0.014, 0.014, 0.003, 14); thumb.rotateZ(Math.PI / 2); g.add(mesh(thumb, m.porcelain, -0.086, 0, 0));
    const fl = new THREE.Shape(); fl.absellipse(0, 0, 0.004, 0.024, 0, Math.PI * 2); const fg = new THREE.ExtrudeGeometry(fl, { depth: 0.003, bevelEnabled: false }); fg.rotateY(Math.PI / 2); g.add(mesh(fg, m.glass, -0.052, 0, 0));
    const hub = lathe([[0.005, 0], [0.004, 0.012], [0.0018, 0.016]], 10); hub.rotateZ(-Math.PI / 2); g.add(mesh(hub, m.fluid, 0.053, 0, 0));
    const needle = new THREE.CylinderGeometry(0.0006, 0.0006, 0.045, 4); needle.rotateZ(Math.PI / 2); g.add(mesh(needle, MAT.steelBlade, 0.091, 0, 0));
    g.position.y = 0.014;
    return g;
  };

  /* ---------------- a sickle: serrated crescent blade, worn wooden handle ---------------- */
  B.sickle = m => {
    const g = new THREE.Group(), sh = new THREE.Shape();
    const C1 = [0.06, 0], R = 0.11, C2 = [0.075, -0.025], r = 0.09;
    sh.moveTo(0, -0.012); sh.lineTo(-0.002, 0.012);
    for (let i = 0; i <= 30; i++) { const a = Math.PI * (1 - 0.9 * i / 30); sh.lineTo(C1[0] + Math.cos(a) * R, C1[1] + Math.sin(a) * R); }  // the back of the blade
    sh.lineTo(0.17, 0.03);                                                                                                                  // the point
    for (let i = 0; i <= 34; i++) { const a = Math.PI * (0.12 + 0.82 * i / 34), rr = r + (i % 2 ? 0.0028 : 0); sh.lineTo(C2[0] + Math.cos(a) * rr, C2[1] + Math.sin(a) * rr); } // the serrated edge
    sh.lineTo(0, -0.012);
    g.add(mesh(ext(sh, 0.0028, 0.0006), MAT.steelBlade, 0, 0.006, 0));
    const tang = new THREE.CylinderGeometry(0.004, 0.004, 0.04, 6); tang.rotateZ(Math.PI / 2); g.add(mesh(tang, m.ironOld, -0.018, 0.012, 0.008));
    const hd = lathe([[0.014, 0], [0.017, 0.02], [0.018, 0.09], [0.016, 0.11], [0.019, 0.125], [0.0, 0.13]], 10); hd.rotateZ(Math.PI / 2); g.add(mesh(hd, m.wood, -0.035, 0.018, 0.008));
    const fer = new THREE.CylinderGeometry(0.0155, 0.0155, 0.01, 10); fer.rotateZ(Math.PI / 2); g.add(mesh(fer, m.brassOld, -0.04, 0.018, 0.008));
    return g;
  };

  /* ---------------- a kit-kat porcelain fuse carrier ---------------- */
  B.fuse = m => {
    const g = new THREE.Group(), base = new THREE.Shape(), w = 0.05, l = 0.12, rr = 0.008;
    base.moveTo(-l / 2 + rr, -w / 2); base.lineTo(l / 2 - rr, -w / 2); base.quadraticCurveTo(l / 2, -w / 2, l / 2, -w / 2 + rr); base.lineTo(l / 2, w / 2 - rr); base.quadraticCurveTo(l / 2, w / 2, l / 2 - rr, w / 2); base.lineTo(-l / 2 + rr, w / 2); base.quadraticCurveTo(-l / 2, w / 2, -l / 2, w / 2 - rr); base.lineTo(-l / 2, -w / 2 + rr); base.quadraticCurveTo(-l / 2, -w / 2, -l / 2 + rr, -w / 2);
    g.add(mesh(ext(base, 0.022, 0.002), m.porcelain, 0, 0.012, 0));
    const hump = lathe([[0.018, 0], [0.017, 0.012], [0.012, 0.022], [0.0, 0.025]], 14); hump.scale(1.2, 1, 0.75); g.add(mesh(hump, m.porcelain, 0, 0.022, 0)); // the grip
    for (const s of [-1, 1]) {
      const blade = new THREE.BoxGeometry(0.004, 0.026, 0.022); g.add(mesh(blade, m.brassOld, s * 0.052, 0.0, 0));
      const scr = new THREE.CylinderGeometry(0.0045, 0.0045, 0.004, 10); g.add(mesh(scr, m.brassOld, s * 0.04, 0.025, 0));
      const slot = new THREE.BoxGeometry(0.007, 0.0012, 0.0012); g.add(mesh(slot, m.ironOld, s * 0.04, 0.0272, 0));
    }
    const wire = new THREE.CylinderGeometry(0.0007, 0.0007, 0.08, 4); wire.rotateZ(Math.PI / 2); g.add(mesh(wire, MAT.steelBlade, 0, 0.026, 0.012));
    return g;
  };

  /* ---------------- the safe's dial ---------------- */
  B.safeknob = m => {
    const g = new THREE.Group(), seg = 48, kn = new THREE.CylinderGeometry(0.046, 0.05, 0.05, seg, 1);
    const p = kn.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.035 * (Math.round(a / (Math.PI * 2) * seg) % 2); if (Math.abs(p.getY(i)) < 0.0249) continue; p.setX(i, x * k); p.setZ(i, z * k); }
    kn.computeVertexNormals(); g.add(mesh(kn, m.knurl, 0, 0.025, 0));
    const face = new THREE.CircleGeometry(0.044, 40); face.rotateX(-Math.PI / 2); g.add(mesh(face, m.dial, 0, 0.0505, 0));
    const ptr = new THREE.ConeGeometry(0.005, 0.012, 3); ptr.rotateX(Math.PI / 2); g.add(mesh(ptr, m.brassOld, 0, 0.052, -0.05));
    return g;
  };

  /* ---------------- the silver anklet: linked chain and little bells ---------------- */
  B.kolusu = m => {
    const g = new THREE.Group(), N = 30, R = 0.046;
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, l = new THREE.TorusGeometry(0.0042, 0.0012, 4, 8); l.rotateY(-a + (i % 2 ? Math.PI / 2 : 0)); l.rotateX(i % 2 ? Math.PI / 2 : 0); g.add(mesh(l, m.silver, Math.cos(a) * R, 0, Math.sin(a) * R)); }
    for (let i = 0; i < 12; i++) {
      const a = (i + 0.5) / 12 * Math.PI * 2, bell = new THREE.SphereGeometry(0.0058, 10, 8); bell.scale(1, 0.92, 1);
      g.add(mesh(bell, m.silver, Math.cos(a) * (R + 0.002), -0.011, Math.sin(a) * (R + 0.002)));
      const slit = new THREE.BoxGeometry(0.0085, 0.0012, 0.0016); slit.rotateY(-a); g.add(mesh(slit, m.ironOld, Math.cos(a) * (R + 0.0075), -0.013, Math.sin(a) * (R + 0.0075)));
      const lk = new THREE.TorusGeometry(0.0022, 0.0007, 3, 6); g.add(mesh(lk, m.silver, Math.cos(a) * (R + 0.001), -0.003, Math.sin(a) * (R + 0.001)));
    }
    const clasp = new THREE.SphereGeometry(0.0055, 8, 6); g.add(mesh(clasp, m.silver, R, 0, 0));
    g.position.y = 0.006;
    return g;
  };

  I.make = function (id, M) {
    const type = id.startsWith('oosi') ? 'oosi' : id.startsWith('fuse') ? 'fuse' : id.startsWith('kolusu') ? 'kolusu' : id;
    const b = B[type]; if (!b) return null;
    return b(mats(M));
  };
})(window.K);
