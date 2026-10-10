/* Patti Veedu — the five nights as five clay oil lamps (agal vilakku), modelled in 3D.
   A small second renderer draws them live on the night card (a lamp blowing out, smoke rising) and
   pre-renders still images of a lit and a cold lamp for the HUD and the end screen. */
'use strict';
(function (K) {
  const L = K.LampFX = { ready: false };
  let R, scene, cam, lamps = [], smoke = [], smokeTex, raf = 0, t0 = 0, dying = 0, lostN = 0, canvas;

  function clayTex() {
    const c = K.canvas(128, 128), g = c.getContext('2d'), r = K.rng(5);
    g.fillStyle = '#9a4a28'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { const x = r() * 128, y = r() * 128, rad = 6 + r() * 20, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() < 0.5 ? 'rgba(60,20,8,0.35)' : 'rgba(210,130,80,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.15})`; g.fillRect(r() * 128, r() * 128, 1.5, 1.5); }
    for (let y = 0; y < 128; y += 7) { g.fillStyle = 'rgba(40,12,4,0.12)'; g.fillRect(0, y, 128, 1); } // potter's wheel rings
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function smokeTexture() {
    const c = K.canvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(210,210,210,0.55)'); gr.addColorStop(0.5, 'rgba(180,180,180,0.18)'); gr.addColorStop(1, 'rgba(160,160,160,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }
  // agal vilakku: a shallow turned bowl with one pinched lip for the wick
  function diyaGeo() {
    const prof = [[0, 0], [0.028, 0], [0.031, 0.004], [0.027, 0.01], [0.035, 0.014], [0.052, 0.024], [0.064, 0.036], [0.069, 0.044], [0.067, 0.049], [0.061, 0.047], [0.051, 0.039], [0.036, 0.033], [0.0005, 0.031]];
    const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 40), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), rr = Math.hypot(x, z); if (rr < 0.001) continue;
      const k = Math.pow(Math.max(0, x / rr), 10), up = Math.max(0, (y - 0.018) / 0.031);
      const nr = rr * (1 + 0.55 * k * up), ny = y + 0.012 * k * up, ang = Math.atan2(z, x) * (1 - 0.25 * k * up);
      pos.setXYZ(i, Math.cos(ang) * nr, ny, Math.sin(ang) * nr * (1 - 0.3 * k * up));
    }
    geo.computeVertexNormals(); return geo;
  }
  function makeLamp(mats, flameTex, glowTex) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(mats.geo, mats.clay); g.add(body);
    const oil = new THREE.Mesh(new THREE.CircleGeometry(0.052, 24), mats.oil); oil.rotation.x = -Math.PI / 2; oil.position.y = 0.036; g.add(oil);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.045, 6), mats.wick); wick.position.set(0.078, 0.052, 0); wick.rotation.z = -0.95; g.add(wick);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 5), mats.tipLit); tip.position.set(0.095, 0.064, 0); g.add(tip);
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flame.center.set(0.5, 0.12); flame.position.set(0.096, 0.062, 0); flame.scale.set(0.034, 0.078, 1); g.add(flame);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    glow.position.set(0.096, 0.085, 0); glow.scale.set(0.2, 0.2, 1); g.add(glow);
    const light = new THREE.PointLight(0xff9a3a, 1.2, 0.7, 2); light.position.set(0.096, 0.09, 0); g.add(light);
    return { g, flame, glow, light, tip, mats, lit: 1 };
  }
  function setLit(l, v) { l.lit = v; l.flame.visible = l.glow.visible = v > 0.01; l.flame.scale.set(0.034 * Math.max(0.05, v), 0.078 * Math.max(0.05, v), 1); l.glow.material.opacity = 0.55 * v; l.light.intensity = 1.2 * v; l.tip.material = v > 0.5 ? l.mats.tipLit : l.mats.tipOut; }

  L.init = function () {
    try {
      canvas = document.getElementById('lampCanvas'); if (!canvas || !window.THREE) return;
      R = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      R.outputEncoding = THREE.sRGBEncoding; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.2; R.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0x8090b0, 0x2a1408, 0.22); scene.add(hemi); L.hemi = hemi;
      const mats = {
        geo: diyaGeo(),
        clay: new THREE.MeshStandardMaterial({ map: clayTex(), roughness: 0.85 }),
        oil: new THREE.MeshStandardMaterial({ color: 0x2a1404, roughness: 0.12, metalness: 0.35 }),
        wick: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1 }),
        tipLit: new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff7a1a, emissiveIntensity: 1.4 }),
        tipOut: new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1 })
      };
      const flameTex = K.makeFlameTex(), glowTex = K.makeGlowTex('rgba(255,200,110,0.9)', 'rgba(255,120,30,0.25)');
      smokeTex = smokeTexture();
      // a dark teak plank with a few marigold petals
      const plankTex = K.makeWoodTex(91, '#2c1709', 256, 128);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.025, 0.24), new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.6 })); plank.position.y = -0.0125; scene.add(plank);
      const petal = new THREE.MeshStandardMaterial({ color: 0xe8861a, roughness: 0.9 }), r = K.rng(8);
      for (let i = 0; i < 14; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.009, 6), petal); p.rotation.x = -Math.PI / 2; p.position.set((r() - 0.5) * 0.95, 0.001, (r() - 0.5) * 0.18 + 0.03); scene.add(p); }
      for (let i = 0; i < 5; i++) { const l = makeLamp(mats, flameTex, glowTex); l.g.position.set((i - 2) * 0.17, 0, 0); l.g.rotation.y = -Math.PI / 2 + (i - 2) * 0.12; scene.add(l.g); lamps.push(l); }
      cam = new THREE.PerspectiveCamera(26, 3.4, 0.05, 10); cam.position.set(0, 0.2, 0.74); cam.lookAt(0, 0.035, 0);
      // still images for the HUD: lit body, flame alone, cold body
      const W = 120, H = 120; R.setPixelRatio(1); R.setSize(W, H, false);
      const c1 = new THREE.PerspectiveCamera(30, W / H, 0.02, 5); c1.position.set(0.0, 0.2, 0.3); c1.lookAt(0.005, 0.055, 0);
      const solo = lamps[2]; lamps.forEach(l => l.g.visible = l === solo); plank.visible = false; scene.children.forEach(o => { if (o.isMesh && o.geometry.type === 'CircleGeometry') o.visible = false; });
      const snap = () => { R.render(scene, c1); return canvas.toDataURL('image/png'); };
      solo.g.rotation.y = -Math.PI / 2 + 0.35;
      setLit(solo, 1); solo.flame.visible = false; solo.glow.visible = false; hemi.intensity = 0.75; const litImg = snap();
      solo.body = solo.g.children[0]; const hideBody = v => solo.g.children.forEach(o => { if (o !== solo.flame && o !== solo.glow && !o.isLight) o.visible = v; });
      hideBody(false); solo.flame.visible = solo.glow.visible = true; hemi.intensity = 0;
      solo.flame.material.blending = solo.glow.material.blending = THREE.NormalBlending; solo.glow.material.opacity = 0.22; solo.flame.material.needsUpdate = solo.glow.material.needsUpdate = true; solo.flame.scale.set(0.05, 0.11, 1);
      const flameImg = snap();
      solo.flame.material.blending = solo.glow.material.blending = THREE.AdditiveBlending; solo.flame.material.needsUpdate = solo.glow.material.needsUpdate = true; hideBody(true);
      const wp = new THREE.Vector3(); solo.g.updateMatrixWorld(true); solo.tip.getWorldPosition(wp); wp.project(c1);
      setLit(solo, 0); hemi.intensity = 1.1; const outImg = snap();
      K.diyaImg = { lit: litImg, flame: flameImg, out: outImg, wx: ((wp.x + 1) / 2 * 100).toFixed(1) + '%', wy: ((1 - wp.y) / 2 * 100).toFixed(1) + '%' };
      // back to the card layout
      lamps.forEach(l => l.g.visible = true); plank.visible = true; scene.children.forEach(o => { if (o.isMesh) o.visible = true; });
      solo.g.rotation.y = -Math.PI / 2; hemi.intensity = 0.22;
      L.ready = true;
    } catch (e) { L.ready = false; }
  };

  function puff(l, dense) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    const p = new THREE.Vector3(); l.tip.getWorldPosition(p); s.position.copy(p); s.scale.setScalar(0.02);
    s.userData = { age: 0, life: dense ? 2.2 : 2.8, vx: (Math.random() - 0.5) * 0.01, dense, seed: Math.random() * 9 };
    scene.add(s); smoke.push(s);
  }
  let lastT = 0, puffT = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const t = (now - t0) / 1000, dt = Math.min(0.05, (now - lastT) / 1000 || 0.016); lastT = now;
    lamps.forEach((l, i) => {
      const n = i + 1;
      if (n === dying) { const k = Math.max(0, Math.min(1, (t - 1.0) / 0.45)); setLit(l, 1 - k); if (k > 0 && k < 1) l.flame.material.rotation = Math.sin(t * 40) * 0.4 * k; if (t > 1.0 && t < 1.5 && Math.random() < 0.6) puff(l, true); }
      else if (n <= lostN) setLit(l, 0);
      else { setLit(l, 0.92 + Math.sin(t * 11 + i * 2) * 0.05 + Math.random() * 0.05); l.flame.material.rotation = Math.sin(t * 3 + i) * 0.06; }
    });
    puffT -= dt; if (puffT <= 0) { puffT = 0.22; lamps.forEach((l, i) => { if (i + 1 <= lostN || (i + 1 === dying && t > 1.45)) puff(l, false); }); }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i], u = s.userData; u.age += dt; const k = u.age / u.life;
      if (k >= 1) { scene.remove(s); s.material.dispose(); smoke.splice(i, 1); continue; }
      s.position.y += dt * (u.dense ? 0.05 : 0.035); s.position.x += u.vx * dt + Math.sin(u.age * 2.4 + u.seed) * 0.0006;
      s.scale.setScalar(0.02 + k * (u.dense ? 0.12 : 0.07)); s.material.opacity = (u.dense ? 0.55 : 0.32) * Math.sin(Math.PI * Math.min(1, k * 1.2));
    }
    R.render(scene, cam);
  }
  // show the card scene: `lost` lamps already cold, lamp number `dyingN` blows out now (0 = none)
  L.play = function (lost, dyingN) {
    if (!L.ready) return false;
    lostN = dyingN ? lost - 1 : lost; dying = dyingN || 0;
    const w = canvas.clientWidth || 480, h = canvas.clientHeight || 140;
    R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    smoke.forEach(s => scene.remove(s)); smoke = [];
    cancelAnimationFrame(raf); t0 = performance.now(); lastT = t0; raf = requestAnimationFrame(loop);
    return true;
  };
  L.stop = function () { cancelAnimationFrame(raf); raf = 0; };
})(window.K = window.K || {});
