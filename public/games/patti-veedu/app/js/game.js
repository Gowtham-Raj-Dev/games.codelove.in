/* KOLUSU — game loop, player, puzzles, UI */
'use strict';
(function (K) {
  const W = K.W, E = K.E, N = K.Nav, A = K.Audio, t = K.t;
  const $ = id => document.getElementById(id);
  const MOBILE = !!window.KOLUSU_MOBILE, native = window.KolusuNative || null;
  const isDesktopApp = /Electron/i.test(navigator.userAgent);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('kolusu.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('kolusu.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  /* ---------------- renderer / scene ---------------- */
  const canvas = $('c');
  // WebGL2 when the phone has it (texture arrays); ?gl1 forces the WebGL1 path for testing
  const gl1 = /[?&]gl1\b/.test(location.search) ? canvas.getContext('webgl', { antialias: true, stencil: false, powerPreference: 'high-performance' }) : null;
  const renderer = new THREE.WebGLRenderer(Object.assign({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false }, gl1 ? { context: gl1 } : {}));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32;
  renderer.shadowMap.enabled = false; // no shadow pass: light and shadow are baked into the house
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020203);
  scene.fog = new THREE.FogExp2(0x060608, 0.058);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60); camera.rotation.order = 'YXZ'; scene.add(camera);
  // only Paatti (and a few signs) use three's own lighting: a hemisphere fed by the baked light at the camera
  const hemi = new THREE.HemisphereLight(0x3c4870, 0x22170e, 0.48); scene.add(hemi);
  K.R.init(renderer, scene, camera);
  const TORCH_I = 2.6, torch = new THREE.SpotLight(0xffe4b8, TORCH_I, 22, 0.48, 0.55, 1.5); torch.position.set(0.18, -0.16, 0.05);
  const torchTarget = new THREE.Object3D(); torchTarget.position.set(0.05, -0.1, -5); camera.add(torch, torchTarget); torch.target = torchTarget;
  torch.castShadow = false;
  const handGroup = new THREE.Group(); handGroup.position.set(0.3, -0.26, -0.5); camera.add(handGroup);
  const outside = { visible: false };

  // rain in the open courtyard
  const RAIN = MOBILE ? 260 : 520, rainPos = new Float32Array(RAIN * 6), rainV = new Float32Array(RAIN);
  for (let i = 0; i < RAIN; i++) { rainPos.set([0, -100, 0, 0, -100, 0], i * 6); rainV[i] = 8 + Math.random() * 4; }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x8a9ab8, transparent: true, opacity: 0.13 })); rain.frustumCulled = false; rain.userData.noTrack = true; scene.add(rain);

  /* ---------------- state ---------------- */
  const P = K.P = { x: 9.4, z: 2.4, y: 1.6, lv: 0, feet: 0, yaw: Math.PI, pitch: 0, vx: 0, vz: 0, crouch: false, torch: true, hidden: false, hideSpot: null, stamina: 1, tired: false, held: null, inMoon: false, bob: 0, wake: 0 };
  const G = K.Game = {
    state: 'boot', night: 1, max: 5, diffKey: store.get('diff', 'normal'), run: null, found: {}, notes: new Set(), lampSeq: [], time: 0,
    overlay: null, sens: store.get('sens', 1), vol: store.get('vol', 0.8), quality: 'high', haptics: store.get('haptics', 'on'), autoCam: store.get('autocam', window.KOLUSU_MOBILE ? 'on' : 'off'), lookT: 0, amb: store.get('amb', 0.45), mus: store.get('mus', 0.6),
    mobile: MOBILE, flags: {}, timers: [], noEnemy: false, res: 1
  };
  const DIFF = { easy: { speed: 0.84, vision: 0.8, ko: 36 }, normal: { speed: 1, vision: 1, ko: 28 }, hard: { speed: 1.14, vision: 1.2, ko: 20 } };
  const keys = {};
  let locked = false, dragLook = false, dragging = false, expectUnlock = false;

  function later(sec, fn) { G.timers.push({ t: sec, fn }); }
  // High is fixed: full device sharpness up to a pixel budget the phone GPU can always hold (never lowered while playing)
  function basePR() { const dpr = window.devicePixelRatio || 1, px = Math.max(1, window.innerWidth * window.innerHeight); return Math.max(1, Math.min(dpr, 2, Math.sqrt((MOBILE ? 1.7e6 : 3.7e6) / px))); }
  function applyQuality() {
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && m.map.anisotropy !== aniso) { m.map.anisotropy = aniso; m.map.needsUpdate = true; } }); });
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
    G.res = 1; resize();
  }
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setPixelRatio(basePR() * G.res); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  window.addEventListener('resize', resize);

  /* ---------------- HUD helpers ---------------- */
  let toastTimer = 0;
  function blink() { const f = $('fade'); f.style.transition = 'none'; f.style.opacity = 0.85; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .45s'; f.style.opacity = 0; })); }
  function toast(html, sec = 3.6) { const el = $('toast'); el.innerHTML = html; el.classList.add('show'); toastTimer = sec; }
  let roomTimer = 0, lastRoom = null;
  const hud = { stam: -1, danger: -1, cross: null, prompt: '' };
  function haptic(ms) { if (G.haptics === 'off') return; try { if (native && native.vibrate) native.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no vibration */ } }
  K.haptic = haptic;
  function setHeld(id) {
    P.held = id; while (handGroup.children.length) handGroup.remove(handGroup.children[0]);
    if (id) {
      const m = W.itemMesh(id); const s = { smallkey: 1.7, brasskey: 1.1, almirahkey: 1.5, matchbox: 1.8, bucket: 0.55, boltcutter: 0.75, oosi: 1.6, kolusu: 1.5, safeknob: 1.3 }[W.typeOf(id)] || 1;
      m.scale.setScalar(s); m.rotation.set(0.3, id === 'boltcutter' ? 1.9 : 0.6, 0); if (id === 'bucket') m.position.set(0.04, -0.16, -0.05);
      m.traverse(c => { if (c.isMesh) c.castShadow = false; });
      handGroup.add(m); K.R.convertDynamic(m, { hand: true });
    }
    renderHeld();
  }
  function renderHeld() { const hn = $('heldName'); if (!hn) return; if (P.held) { hn.textContent = W.ITEM_DEF[W.typeOf(P.held)].name; hn.classList.remove('empty'); } else { hn.textContent = t('nothing'); hn.classList.add('empty'); } }
  function diyas(lost, dying) { let h = ''; for (let i = 1; i <= G.max; i++) h += K.diya(i <= lost ? (i === dying ? 'dying' : 'out') : 'lit'); return h; }
  G.diyas = diyas;
  function renderLives(anim) {
    const l = $('lives'), lost = G.night - 1;
    if (l) { l.innerHTML = diyas(lost, anim ? lost : 0); if (anim) setTimeout(() => { if (G.night - 1 === lost) l.innerHTML = diyas(lost, 0); }, 1600); }
    $('nightLbl').innerHTML = `${t('night', { n: G.night })}<small>/ ${G.max}</small>`;
  }
  function showCard(sub, big, line, sec, then, dying) {
    const c = $('card'); $('cardSub').textContent = sub; $('cardBig').textContent = big; $('cardLine').textContent = line || '';
    if (K.LampFX.ready) { $('cardLampsAlt').innerHTML = ''; } else $('cardLampsAlt').innerHTML = diyas(G.night - 1, dying || 0);
    c.hidden = false; $('fade').style.transition = 'opacity .6s'; $('fade').style.opacity = 1;
    if (K.LampFX.ready) K.LampFX.play(G.night - 1, dying || 0);
    later(sec, () => { c.hidden = true; K.LampFX.stop(); $('fade').style.transition = 'opacity 1.6s'; $('fade').style.opacity = 0; if (then) then(); });
  }

  /* ---------------- desktop pointer lock / keyboard ---------------- */
  // a lock asked for without a click (after Esc, a timer) may be refused: then the "click to play" hint shows.
  // Only repeated refusals of a real click switch to hold-and-drag looking.
  let lockByClick = false, lockFails = 0, skipMove = 0;
  function requestLock(byClick) {
    if (MOBILE) return;
    if (dragLook) { canvas.focus(); return; }
    if (!canvas.requestPointerLock) { enableDrag(); return; }
    lockByClick = !!byClick;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(lockRefused); } catch (e) { lockRefused(); }
  }
  function lockRefused() { if (lockByClick && ++lockFails >= 3) enableDrag(); lockByClick = false; updateClickHint(); }
  function enableDrag() { dragLook = true; updateClickHint(); }
  document.addEventListener('pointerlockerror', lockRefused);
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked && G.state === 'play' && !G.overlay) { if (expectUnlock) expectUnlock = false; else openPause(); }
    if (locked) { expectUnlock = false; lockFails = 0; skipMove = 2; }
    updateClickHint();
  });
  function releaseLock() { if (document.pointerLockElement) { expectUnlock = true; document.exitPointerLock(); } }
  function updateClickHint() { const el = $('clickToPlay'); if (el) el.hidden = MOBILE || !(G.state === 'play' && !G.overlay && !locked && !dragLook); }
  if (!MOBILE) {
    canvas.addEventListener('mousedown', () => { if (G.state !== 'play' || G.overlay) return; if (!locked && !dragLook) { requestLock(true); return; } if (dragLook) dragging = true; });
    window.addEventListener('mouseup', () => dragging = false);
    document.addEventListener('mousemove', e => { if (G.state !== 'play' || G.overlay) return; if (!(locked || (dragLook && dragging))) return;
      // Chromium sends a jump right after the lock and the odd huge spike on Windows: drop those so the view never snaps
      if (skipMove > 0) { skipMove--; return; }
      const mx = e.movementX || 0, my = e.movementY || 0; if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
      G.look(mx * 0.48, my * 0.48); });
  }
  window.addEventListener('keydown', e => {
    const k = e.code;
    if (k === 'Tab') e.preventDefault();
    if (G.overlay === 'keypad') { keypadKey(e); return; }
    if (G.overlay === 'note') { if (k === 'ArrowRight' || k === 'KeyD') notePg.go(notePg.st.p + 1); else if (k === 'ArrowLeft' || k === 'KeyA') notePg.go(notePg.st.p - 1); else if (k === 'KeyE' || k === 'Escape' || k === 'Enter' || k === 'Space') closeOverlay(); return; }
    if (G.overlay === 'journal') {
      if (k === 'KeyJ' || k === 'Tab' || k === 'Escape') closeOverlay();
      else if (k === 'Digit1') setJTab('diary'); else if (k === 'Digit2') setJTab('letters'); else if (k === 'Digit3') setJTab('map');
      else if (jTab === 'letters' && (k === 'ArrowRight' || k === 'KeyD')) jrPg.go(jrPg.st.p + 1); else if (jTab === 'letters' && (k === 'ArrowLeft' || k === 'KeyA')) jrPg.go(jrPg.st.p - 1);
      return;
    }
    if (G.overlay === 'mapPad') { if (k === 'KeyM' || k === 'Escape') closeOverlay(); else if (k === 'Equal' || k === 'NumpadAdd') $('mzIn').onclick(); else if (k === 'Minus' || k === 'NumpadSubtract') $('mzOut').onclick(); return; }
    if (G.overlay === 'pause') { if (k === 'Escape') resume(); return; }
    if (G.overlay) { if (k === 'Escape') closeOverlay(); return; }
    if (G.state !== 'play') return;
    keys[k] = true;
    if (k === 'KeyE') interact();
    else if (k === 'KeyG') G.drop();
    else if (k === 'KeyF') G.toggleTorch();
    else if (k === 'KeyC' || k === 'ControlLeft') G.toggleCrouch();
    else if (k === 'KeyJ' || k === 'Tab') openJournal();
    else if (k === 'KeyM') G.map();
    else if (k === 'Escape' || k === 'KeyP') { releaseLock(); openPause(); }
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G.state === 'play' && !G.overlay) openPause(); });

  /* ---------------- player ---------------- */
  const solidBuckets = [];
  function collide(x, z, r, lv = P.lv) {
    W.solidLists(x, z, r + 0.2, lv, solidBuckets);
    for (let it = 0; it < 3; it++) {
      for (let bi = 0; bi < solidBuckets.length; bi++) for (const s of solidBuckets[bi]) {
        if (!s.on || s.lv !== lv) continue;
        if (s.t === 'b') {
          if (x < s.minX - r || x > s.maxX + r || z < s.minZ - r || z > s.maxZ + r) continue;
          const nx = Math.max(s.minX, Math.min(x, s.maxX)), nz = Math.max(s.minZ, Math.min(z, s.maxZ)), dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-9) { const d = Math.sqrt(d2), p = r - d; x += dx / d * p; z += dz / d * p; }
            else { const l = x - s.minX, rr = s.maxX - x, tt = z - s.minZ, b = s.maxZ - z, m = Math.min(l, rr, tt, b); if (m === l) x = s.minX - r; else if (m === rr) x = s.maxX + r; else if (m === tt) z = s.minZ - r; else z = s.maxZ + r; }
          }
        } else {
          const dx = x - s.x, dz = z - s.z, m = s.r + r; if (Math.abs(dx) > m || Math.abs(dz) > m) continue;
          const d = Math.hypot(dx, dz);
          if (d < m) { if (d > 1e-6) { x = s.x + dx / d * m; z = s.z + dz / d * m; } else x = s.x + m; }
        }
      }
    }
    return { x, z };
  }
  function updatePlayer(dt) {
    if (P.hidden) { P.vx = P.vz = 0; return; }
    const f = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }, r = { x: Math.cos(P.yaw), z: -Math.sin(P.yaw) };
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) { mx += f.x; mz += f.z; }
    if (keys.KeyS || keys.ArrowDown) { mx -= f.x; mz -= f.z; }
    if (keys.KeyD) { mx += r.x; mz += r.z; }
    if (keys.KeyA) { mx -= r.x; mz -= r.z; }
    if (keys.ArrowLeft || keys.ArrowRight) { P.yaw += (keys.ArrowLeft ? 1 : -1) * dt * 2.2; G.lookT = performance.now(); }
    let mag = (mx || mz) ? 1 : 0;
    const T = K.Touch;
    if (T && (T.x || T.y)) { mx += f.x * T.y + r.x * T.x; mz += f.z * T.y + r.z * T.x; mag = Math.max(mag, Math.min(1, Math.hypot(T.x, T.y))); }
    const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; } else mag = 0;
    const wantRun = (keys.ShiftLeft || keys.ShiftRight || (T && T.run)) && mag > 0 && !P.crouch && !P.tired;
    let sp = (P.crouch ? 1.45 : wantRun ? 4.6 : 2.9) * (wantRun ? 1 : Math.max(0.35, mag));
    if (P.wake > 0) sp *= 0.4;
    if (wantRun) { P.stamina -= dt / 4.5; if (P.stamina <= 0) { P.stamina = 0; P.tired = true; } }
    else { P.stamina = Math.min(1, P.stamina + dt / 6); if (P.tired && P.stamina > 0.35) P.tired = false; }
    const ax = mx * sp, az = mz * sp, k = Math.min(1, dt * 12);
    P.vx += (ax - P.vx) * k; P.vz += (az - P.vz) * k;
    const res = collide(P.x + P.vx * dt, P.z + P.vz * dt, 0.3); P.x = res.x; P.z = res.z;
    const gr = W.ground(P.x, P.z, P.lv); P.lv = gr.lv; P.feet += (gr.y - P.feet) * Math.min(1, dt * 16);
    const speed = Math.hypot(P.vx, P.vz);
    autoCamera(dt, speed, mag);
    const target = P.crouch ? 0.95 : 1.62;
    if (P.wake > 0) { P.wake -= dt; P.y = 0.35 + (1 - Math.max(0, P.wake) / 1.6) * (target - 0.35); }
    else P.y += (target - P.y) * Math.min(1, dt * 8);
    if (speed > 0.3) {
      const prev = Math.sin(P.bob); P.bob += dt * speed * 2.3; const cur = Math.sin(P.bob);
      if ((prev < 0 && cur >= 0) || (prev > 0 && cur <= 0)) {
        const run = speed > 3.5;
        A.footstep(P.crouch ? 0.25 : run ? 1 : 0.55, run);
        if (run) E.hear(P.x, P.z, 8, P.lv); else if (!P.crouch) E.hear(P.x, P.z, 2.2, P.lv);
      }
    }
    for (const c of W.creaky) {
      c.cd -= dt;
      if (c.cd <= 0 && P.lv === 0 && speed > 0.4 && !P.crouch && Math.abs(P.x - c.x) < 0.32 && Math.abs(P.z - c.z) < 0.32) {
        c.cd = 1.2; A.clink({ x: c.x, y: 0, z: c.z }); E.hear(c.x, c.z, 10, 0); haptic(30);
        if (!G.flags.creakTip) { G.flags.creakTip = true; toast(t('t_creak'), 5); }
      }
    }
    P.inMoon = W.isOutside(P.x, P.z, P.lv);
    A.setOutdoor && A.setOutdoor(P.hidden ? 0 : P.inMoon ? 1 : (P.lv === 1 ? 0.35 : 0));
    if (G.flags.doorOpen && P.lv === 0 && P.z > W.gateZone.z && P.x > W.gateZone.x0 - 0.3 && P.x < W.gateZone.x1 + 0.3) escape();
    const st = Math.round(P.stamina * 50) / 50;
    if (st !== hud.stam) { hud.stam = st; $('stam').classList.toggle('show', st < 0.99); $('stam').firstElementChild.style.transform = `scaleX(${st})`; }
    const room = W.roomAt(P.x, P.z, P.lv);
    if (room && room !== lastRoom) { lastRoom = room; G.flags['v_' + room.id] = 1; const rl = $('roomLbl'); rl.textContent = room.name; rl.classList.add('show'); roomTimer = 2.5; }
  }
  // automatic camera flow: while you walk, the view eases round to where you are really going (a diagonal
  // push on the stick becomes a smooth curve, sliding along a wall turns you down the passage) and the
  // gaze settles back to level. Any look swipe takes over at once; walking backwards never spins you.
  let acW = 0;
  function autoCamera(dt, speed, mag) {
    const quiet = performance.now() - G.lookT;
    const on = G.autoCam === 'on' && !P.hidden && G.state === 'play' && !G.overlay && quiet > 650 && speed > 0.5 && mag > 0;
    acW += ((on ? 1 : 0) - acW) * Math.min(1, dt * (on ? 2.5 : 8)); // fade in and out, never a jerk
    if (acW < 0.01) return;
    const cs = (G.ctl && G.ctl.cs) || 1;
    let d = Math.atan2(-P.vx, -P.vz) - P.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < 1.9) { const turn = d * Math.min(1, dt * 1.7 * cs * Math.min(1, speed / 2.9)) * acW; P.yaw += Math.max(-dt * 2.4 * cs, Math.min(dt * 2.4 * cs, turn)); }
    if (quiet > 1500) P.pitch += (-0.05 - P.pitch) * Math.min(1, dt * 0.9 * cs) * acW;
  }
  const fwdV = new THREE.Vector3();
  function placeCamera() {
    if (P.hidden) { const c = P.hideSpot.cam; camera.position.set(c.x, c.y + Math.sin(G.time * 1.6) * 0.004, c.z); }
    else { const b = Math.min(1, Math.hypot(P.vx, P.vz) / 3); camera.position.set(P.x, P.feet + P.y + Math.sin(P.bob * 2) * 0.035 * b, P.z); }
    camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob) * 0.006);
    handGroup.position.set(0.3 + Math.sin(P.bob) * 0.012, -0.26 + Math.abs(Math.cos(P.bob)) * 0.01, -0.5);
    torch.intensity = P.torch && !P.hidden ? TORCH_I : 0;
    K.listenerPos = camera.position;
    fwdV.set(0, 0, -1).applyQuaternion(camera.quaternion);
    A.listener(camera.position, fwdV);
  }

  /* ---------------- interaction ---------------- */
  const ray = new THREE.Raycaster(); ray.far = 2.5; ray.layers.enableAll(); // culled rooms sit on another layer for a frame: still hit them
  const center = new THREE.Vector2(0, 0), nearT = [];
  let target = null;
  function oosiReady() {
    if (!P.held || W.typeOf(P.held) !== 'oosi' || !E.active || E.state === 'ko' || E.lv !== P.lv || P.hidden) return false;
    const dx = E.pos.x - P.x, dz = E.pos.z - P.z, d = Math.hypot(dx, dz);
    if (d > 2.3 || Math.abs(E.y - P.feet) > 1.2) return false;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); return (fx * dx + fz * dz) / Math.max(d, 0.01) > 0.45;
  }
  function findTarget() {
    if (P.hidden) { target = null; return; }
    if (oosiReady()) { target = { kind: 'oosi' }; return; }
    camera.updateMatrixWorld();
    ray.setFromCamera(center, camera);
    nearT.length = 0; const cp = camera.position;
    for (const m of W.rayTargets) { const e = m.matrixWorld.elements, dx = e[12] - cp.x, dy = e[13] - cp.y, dz = e[14] - cp.z; if (dx * dx + dy * dy + dz * dz < 12) nearT.push(m); }
    const hits = nearT.length ? ray.intersectObjects(nearT, false) : nearT;
    target = null;
    for (const h of hits) {
      const it = h.object.userData.inter;
      if (!it) return;
      { const hp = h.point, dx = hp.x - cp.x, dz = hp.z - cp.z, d = Math.hypot(dx, dz) || 1, bx = hp.x - dx / d * 0.3, bz = hp.z - dz / d * 0.3; if (d > 0.45 && !N.los(cp.x, cp.z, bx, bz, P.lv)) return; }
      if (it.kind === 'item' && it.item.state !== 'world') continue;
      if (it.kind === 'almirah' && W.almirah.target === 1) continue;
      if (it.kind === 'main' && G.flags.doorOpen) continue;
      if (it.kind === 'clock' && W.clock.running) continue;
      if (it.kind === 'pall' && W.pall.target === 1) continue;
      target = it; return;
    }
  }
  const ord = p => t('ord' + p);
  const sym = s => t('sym_' + s);
  function remainingList() { const L = W.main.locks; return [L.pad && t('lock_pad'), L.chain && t('lock_chain'), L.num && t('lock_num'), L.bar && t('lock_bar')].filter(Boolean).join(', '); }
  function promptFor(tg) {
    const h = P.held;
    switch (tg.kind) {
      case 'item': return t('p_item', { a: t(h ? 'a_swap' : 'a_take'), n: tg.item.name });
      case 'door': { const d = tg.door; if (d.locked) return doorPrompt(d, h); return t(d.open ? 'a_close' : 'a_open'); }
      case 'main': {
        const L = W.main.locks;
        if (L.pad && h === 'brasskey') return t('p_pad'); if (L.chain && h === 'boltcutter') return t('p_chain'); if (L.bar && h === 'bigkey') return t('p_bar');
        if (!L.pad && !L.chain && !L.num && !L.bar) return t('p_escape'); if (L.num) return t('p_numlock');
        return `<span class="no">${t('p_still', { r: remainingList() })}</span>`;
      }
      case 'lamp': { const l = tg.lamp; if (l.lit) return `<span class="no">${t('p_lamp_lit', { s: sym(l.sym) })}</span>`; return h === 'matchbox' ? t('p_lamp_light', { s: sym(l.sym) }) : `<span class="no">${t('p_lamp_need', { s: sym(l.sym) })}</span>`; }
      case 'well': if (W.well.used || W.well.busy) return `<span class="no">${t('a_well')}</span>`; return h === 'bucket' ? t('p_well_go') : `<span class="no">${t('p_well')}</span>`;
      case 'almirah': return h === 'almirahkey' ? t('p_almirah_go') : `<span class="no">${t('p_almirah')}</span>`;
      case 'clue': return G.found[tg.pos] ? `<span class="no">${t('p_clue_seen', { o: ord(tg.pos), d: G.run.code[tg.pos - 1] })}</span>` : t('p_clue');
      case 'note': return t('p_note');
      case 'hide': return t(tg.spot.type === 'cot' ? 'p_hide_cot' : tg.spot.type === 'hay' ? 'p_hide_hay' : 'p_hide_alm');
      case 'oosi': return `<b class="stab">${t('p_oosi')}</b>`;
      case 'clock': return t('p_clock');
      case 'pall': return t('p_pall');
      case 'phone': return W.phone.ring ? `<b class="stab">${t('p_phone_ring')}</b>` : `<span class="no">${t('p_phone')}</span>`;
      case 'cradle': return W.typeOf(h) === 'kolusu' ? t('p_cradle_put') : `<span class="no">${t(G.flags.kolusuHome ? 'p_cradle_done' : 'p_cradle')}</span>`;
      default: return wingPrompt(tg, h);
    }
    return '';
  }
  G.actionInfo = function () {
    if (G.state !== 'play') return null;
    if (P.hidden) return { l: t('a_out'), i: 'exit' };
    const tg = target; if (!tg) return null; const h = P.held;
    switch (tg.kind) {
      case 'item': return { l: t(h ? 'a_swap' : 'a_take'), i: 'grab' };
      case 'door': { const d = tg.door; if (d.locked) return doorAction(d, h); return { l: t(d.open ? 'a_close' : 'a_open'), i: 'door' }; }
      case 'main': { const L = W.main.locks; if (L.pad && h === 'brasskey') return { l: t('a_open'), i: 'skey' }; if (L.chain && h === 'boltcutter') return { l: t('a_cut'), i: 'cut' }; if (L.bar && h === 'bigkey') return { l: t('a_open'), i: 'skey' }; if (!L.pad && !L.chain && !L.num && !L.bar) return { l: t('a_escape'), i: 'exit' }; return L.num ? { l: t('a_code'), i: 'code' } : { l: t('a_locked'), i: 'lock' }; }
      case 'lamp': return { l: t(tg.lamp.lit ? 'a_lit' : 'a_light'), i: 'lamp' };
      case 'well': return { l: t(h === 'bucket' ? 'a_lower' : 'a_well'), i: 'well' };
      case 'almirah': return h === 'almirahkey' ? { l: t('a_open'), i: 'pkey' } : { l: t('a_locked'), i: 'lock' };
      case 'clue': return { l: t('a_look'), i: 'eye' };
      case 'note': return { l: t('a_read'), i: 'scroll' };
      case 'hide': return { l: t('a_hide'), i: 'hide' };
      case 'oosi': return { l: t('a_stab'), i: 'syringe', hot: true };
      case 'clock': return { l: t('a_set'), i: 'clock' };
      case 'pall': return { l: t('a_seeds'), i: 'grab' };
      case 'phone': return W.phone.ring ? { l: t('a_answer'), i: 'sound', hot: true } : { l: t('a_look'), i: 'sound' };
      case 'cradle': return W.typeOf(h) === 'kolusu' ? { l: t('a_put'), i: 'grab', hot: true } : { l: t('a_look'), i: 'eye' };
      default: return wingAction(tg, h);
    }
    return null;
  };
  function interact() {
    if (P.hidden) { unhide(); return; }
    if (!target) return;
    const tg = target;
    switch (tg.kind) {
      case 'item': pickUp(tg.item); break;
      case 'door': useDoor(tg.door); break;
      case 'main': useMain(); break;
      case 'lamp': useLamp(tg.lamp); break;
      case 'well': useWell(); break;
      case 'almirah': useAlmirah(); break;
      case 'clue': readClue(tg.pos); break;
      case 'note': openNote(tg.note); break;
      case 'hide': hide(tg.spot); break;
      case 'oosi': useOosi(false); break;
      case 'clock': openClock(); break;
      case 'pall': openPall(); break;
      case 'phone': answerPhone(); break;
      case 'cradle': useCradle(); break;
      default: wingUse(tg);
    }
  }
  function consume() { const it = W.items[P.held]; if (it) it.hide('gone'); setHeld(null); }
  function pickUp(it) {
    const at = { x: it.mesh.position.x, y: it.mesh.position.y, z: it.mesh.position.z };
    if (P.held) { const old = W.items[P.held]; old.place(at.x, at.y, at.z, Math.random() * 6); E.hear(P.x, P.z, 3, P.lv); }
    it.hide('hand'); setHeld(it.id); A.pickup(); haptic(15);
    toast(t('picked', { n: it.name, x: t(it.id === 'kolusu2' ? 'x_kolusu2' : 'x_' + it.type) }), 4.5); saveSoon();
    G.flags['got_' + it.id] = true;
  }
  function dropHeld(noisy, at) {
    const it = W.items[P.held]; if (!it) return;
    let x = at ? at.x : P.x - Math.sin(P.yaw) * 0.55, z = at ? at.z : P.z - Math.cos(P.yaw) * 0.55;
    const c = collide(x, z, 0.12); x = c.x; z = c.z;
    if (!N.passAt(x, z, P.lv) && !at) { x = P.x; z = P.z; }
    it.place(x, W.ground(x, z, P.lv).y, z, Math.random() * 6); setHeld(null);
    if (noisy) { const p = { x, y: P.feet, z }; A.clang(p, 1, it.id === 'bucket' ? 300 : it.id === 'boltcutter' ? 520 : 1300); E.hear(x, z, it.id === 'bucket' ? 11 : 8.5, P.lv); }
  }
  function useDoor(d) {
    const p = { x: d.center.x, y: 1.2, z: d.center.z };
    if (d.locked) {
      if (d.lock === 'smallkey' && P.held === 'smallkey') { consume(); d.locked = false; A.unlock(p); d.setOpen(true); later(0.3, () => A.creak(p, 0.8)); E.hear(p.x, p.z, 5, 0); haptic(40); toast(t('t_guest')); G.flags.guestOpen = true; }
      else if (wingDoor(d, p)) return;
      else if (d.lock === 'lamps') toast(t('t_pooja_locked'), 4);
      else toast(t('t_need_key'));
      return;
    }
    p.y = (d.y || 0) + 1.2; d.setOpen(!d.open); A.creak(p, 0.7, 0.6); if (!d.open) later(0.4, () => A.thud(p, 0.4)); E.hear(p.x, p.z, 4.5, d.lv || 0);
  }
  function useLamp(l) {
    if (l.lit) return;
    if (P.held !== 'matchbox') { toast(t('t_need_match')); return; }
    A.match(); l.lit = true; l.flames.forEach(f => f.visible = true);
    later(0.15, () => A.whoosh({ x: l.x, y: 1, z: l.z }, 0.5)); E.hear(l.x, l.z, 4, 0);
    G.lampSeq.push(l.sym);
    const i = G.lampSeq.length - 1;
    if (G.run.order[i] !== l.sym) {
      later(0.8, () => {
        for (const m of W.lamps) { m.lit = false; m.flames.forEach(f => f.visible = false); }
        G.lampSeq = []; A.gust(); E.hear(12, 10, 60, 0); haptic(220);
        toast(t('t_lamp_wrong'), 4.5);
      });
    } else if (G.lampSeq.length === 4) {
      later(1.0, () => {
        const d = W.doorById.pooja; d.locked = false; d.setOpen(true);
        A.bell({ x: 16.5, y: 1.5, z: 5.5 }); A.creak({ x: 16.5, y: 1.2, z: 6 }, 0.8, 1.6); E.hear(16.5, 6, 10, 0); haptic(60);
        G.flags.poojaOpen = true; toast(t('t_pooja_open'), 5);
      });
    } else toast(t('t_lamp_ok', { s: sym(l.sym), n: G.lampSeq.length }), 2.2);
  }
  let wellAnim = null;
  function useWell() {
    const w = W.well;
    if (w.used || w.busy) return;
    if (P.held !== 'bucket') { toast(t('t_well_need'), 4); return; }
    consume(); w.busy = true; w.bucket.visible = true; wellAnim = { t: 0 }; haptic(40);
    A.pulley({ x: 12, y: 1.5, z: 10 }); E.hear(12, 10, 13, 0);
    toast(t('t_well_go'), 3);
  }
  function updateWell(dt) {
    if (!wellAnim) return;
    const w = W.well; wellAnim.t += dt; const tt = wellAnim.t;
    let y; if (tt < 1.6) y = 2.55 - (tt / 1.6) * 2.4; else if (tt < 1.9) y = 0.15; else y = Math.min(2.2, 0.15 + (tt - 1.9) / 1.7 * 2.05);
    w.bucket.position.set(12.16, y - 0.45, 10); w.wheel.rotation.y = tt * 4;
    w.rope.scale.y = Math.max(0.1, 2.86 - y); w.rope.position.y = 2.86 - (2.86 - y) / 2;
    if (tt > 3.7) {
      wellAnim = null; w.busy = false; w.used = true; w.bucket.position.set(12.16, 1.75, 10);
      W.items.brasskey.place(12, 0.93, 9.05, 0.4); W.items.brasskey.home = { x: 12, y: 0.93, z: 9.05, rotY: 0.4 };
      W.items.kolusu.place(12.4, 0.93, 9.12, 0.3); W.items.kolusu.home = { x: 12.4, y: 0.93, z: 9.12, rotY: 0.3 }; A.anklet({ x: 12.4, y: 1, z: 9.1 }, 0.6);
      toast(t('t_well_done'), 4);
    }
  }
  function useAlmirah() {
    if (W.almirah.target === 1) return;
    if (P.held !== 'almirahkey') { toast(t('t_alm_need')); return; }
    consume(); A.unlock({ x: 0.7, y: 1, z: 16.2 }); later(0.3, () => A.creak({ x: 0.7, y: 1, z: 16.2 }, 0.9, 1.2));
    W.almirah.target = 1; W.almirahHit.position.y = -20; W.almirahHit.updateMatrixWorld(); E.hear(0.7, 16.2, 6, 0); haptic(40);
    toast(t('t_alm_open'), 4);
  }
  function readClue(pos) {
    const d = G.run.code[pos - 1];
    if (!G.found[pos]) { G.found[pos] = true; A.pickup(); haptic(15); }
    toast(t('t_clue', { o: ord(pos), d, p: pos, n: Object.keys(G.found).length }), 4.5);
  }
  function remaining() { const r = remainingList(); return r ? t('t_remaining', { r }) : t('t_all_open'); }
  function useMain() {
    const m = W.main, L = m.locks, p = { x: 12, y: 1.2, z: 19.8 };
    if (L.pad && P.held === 'brasskey') { haptic(60); consume(); L.pad = false; A.unlock(p); later(0.25, () => A.clang({ x: 12, y: 0, z: 19.7 }, 0.8, 900)); m.pad.position.set(12.1, 0.05, 19.7); m.pad.rotation.set(1.2, 0.4, 1.5); E.hear(12, 19.6, 7, 0); toast(t('t_pad_open') + remaining()); return; }
    if (L.chain && P.held === 'boltcutter') { haptic(90); consume(); L.chain = false; A.chainCut(p); m.chain.visible = false; E.hear(12, 19.6, 14, 0); toast(t('t_chain_cut') + remaining()); return; }
    if (L.bar && P.held === 'bigkey') { haptic(90); consume(); L.bar = false; A.unlock(p); m.barT = 0.001; later(0.5, () => A.thud({ x: 12, y: 0.2, z: 19.6 }, 1.2)); E.hear(12, 19.6, 12, 0); toast(t('t_bar_open') + remaining(), 4.5); return; }
    if (!L.pad && !L.chain && !L.num && !L.bar) { openMainDoor(); return; }
    if (L.num) { openKeypad(); return; }
    toast(t('t_more_locks') + remaining());
  }
  function hide(spot) {
    if (P.held === 'bucket' && spot.type === 'cot') { toast(t('t_cot_bucket')); return; }
    blink();
    P.hidden = true; P.hideSpot = spot; P.crouch = false;
    P.x = spot.cam.x; P.z = spot.cam.z; P.yaw = spot.cam.yaw; P.pitch = spot.type === 'cot' ? 0.02 : -0.05; P.vx = P.vz = 0;
    $('hideMask').className = (spot.type === 'almirah' ? 'slats' : spot.type === 'hay' ? 'hay' : 'cot') + ' show'; $('hideTxt').classList.add('show');
    document.body.classList.add('hiding'); handGroup.visible = false;
    const room = W.roomAt(spot.exit.x, spot.exit.z, spot.lv); if (room) { lastRoom = room; $('roomLbl').textContent = room.name; }
    P.lv = spot.lv; A.creak({ x: spot.cam.x, y: spot.cam.y, z: spot.cam.z }, 0.35, 0.4); E.hear(spot.cam.x, spot.cam.z, 2.5, spot.lv); haptic(20);
    E.onHide(spot);
  }
  function unhide() {
    const s = P.hideSpot; if (!s) return;
    blink();
    P.hidden = false; P.hideSpot = null; P.x = s.exit.x; P.z = s.exit.z; P.lv = s.lv; P.feet = W.FLOOR[s.lv]; P.y = s.type === 'almirah' ? 1.62 : 0.6;
    P.yaw = s.cam.yaw; P.pitch = 0;
    $('hideMask').className = ''; $('hideTxt').classList.remove('show'); document.body.classList.remove('hiding'); handGroup.visible = true;
    A.creak({ x: s.exit.x, y: P.feet + 1, z: s.exit.z }, 0.35, 0.4);
  }


  /* ---------------- puzzles: the stopped clock, the pallanguzhi board, Valli's anklet ---------------- */
  const STORY = ['clock', 'valli', 'search', 'night', 'cradle', 'ledger', 'valliroom', 'tankbox', 'safeletter'];
  const clockStr = (c) => `${c.h}:${String(c.m).padStart(2, '0')}`;
  const ck = { h: 12, m: 0 };
  function drawClockFace() {
    const R = 86, svg = $('ckSvg'); let h = `<circle cx="100" cy="100" r="96" class="ckRim"/><circle cx="100" cy="100" r="90" class="ckFace"/>`;
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r1 = i % 5 ? 82 : 76; h += `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * 86}" y2="${100 - Math.cos(a) * 86}" class="ckTick${i % 5 ? '' : ' big'}"/>`; }
    ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => { const a = i / 12 * Math.PI * 2; h += `<text x="${100 + Math.sin(a) * 64}" y="${100 - Math.cos(a) * 64}" class="ckNum">${n}</text>`; });
    const ma = ck.m * 6, ha = (ck.h % 12) * 30 + ck.m * 0.5;
    h += `<line x1="100" y1="100" x2="100" y2="52" class="ckH" transform="rotate(${ha} 100 100)"/><line x1="100" y1="100" x2="100" y2="30" class="ckM" transform="rotate(${ma} 100 100)"/><circle cx="100" cy="100" r="5" class="ckPin"/>`;
    svg.innerHTML = h; void R;
    $('ckTime').textContent = clockStr(ck);
  }
  function openClock() {
    ck.h = W.clock.h; ck.m = W.clock.m; drawClockFace();
    $('ckMsg').textContent = t(G.notes.has('clock') ? 'ck_hint' : 'ck_hint_none'); $('clockPad').hidden = false; openOverlay('clockPad'); A.click();
  }
  function stepClock(dh, dm) {
    if (dm) { ck.m += dm; if (ck.m >= 60) { ck.m = 0; ck.h = ck.h % 12 + 1; } if (ck.m < 0) { ck.m = 55; ck.h = ck.h === 1 ? 12 : ck.h - 1; } }
    if (dh) { ck.h += dh; if (ck.h > 12) ck.h = 1; if (ck.h < 1) ck.h = 12; }
    W.clock.set(ck.h, ck.m); A.tick(W.clockPos, dm !== 0); drawClockFace();
  }
  function tryClock() {
    const c = G.run.clock;
    if (ck.h === c.h && ck.m === c.m) {
      closeOverlay(); const cl = W.clock; cl.running = true; cl.target = 1; W.clockHit.position.y = -20; W.clockHit.updateMatrixWorld();
      W.items.smallkey.place(17.65, 0.29, 19.52, 0.7); G.flags.clockOk = true; haptic(60);
      for (let i = 0; i < 3; i++) later(0.3 + i * 1.4, () => A.gong(W.clockPos, 0.8));
      later(0.5, () => A.creak({ x: 17.65, y: 0.9, z: 19.3 }, 0.6, 0.9)); E.hear(17.65, 19.4, 12, 0);
      toast(t('t_clock_ok'), 5); PH.next = Math.min(PH.next, G.time + 35);
    } else {
      A.gong(W.clockPos, 1.25); haptic(160); E.hear(17.65, 19.4, 18, 0);
      $('ckMsg').innerHTML = `<span class="bad">${t('ck_wrong')}</span>`;
    }
  }
  $('ckHm').onclick = () => stepClock(-1, 0); $('ckHp').onclick = () => stepClock(1, 0);
  $('ckMm').onclick = () => stepClock(0, -5); $('ckMp').onclick = () => stepClock(0, 5);
  $('ckSet').onclick = tryClock; $('ckClose').onclick = closeOverlay;

  function buildPall() {
    const b = $('plBoard'), pa = W.pall; b.innerHTML = '';
    const store = () => { const d = document.createElement('div'); d.className = 'plStore'; d.innerHTML = '<i></i>'.repeat(9); return d; };
    b.appendChild(store());
    const grid = document.createElement('div'); grid.className = 'plGrid';
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) {
      const cup = document.createElement('button'); cup.className = 'plCup';
      const k = r === 1 && i % 2 === 0 ? i / 2 : -1;
      if (k < 0) { cup.disabled = true; cup.setAttribute('aria-hidden', 'true'); }
      else {
        cup.classList.add('mark'); const n = pa.counts[k];
        cup.innerHTML = `<b>${K.SYMBOL_GLYPH[pa.syms[k]]}</b><span class="seeds">${'<i></i>'.repeat(n)}</span><em>${n}</em>`;
        cup.setAttribute('aria-label', `${t('sym_' + pa.syms[k])}: ${n}`);
        cup.onclick = () => { pa.counts[k] = (pa.counts[k] + 1) % 5; pa.board.setSeeds(pa.counts); A.tick({ x: pa.x, y: 0.2, z: pa.z }, true); buildPall(); };
      }
      grid.appendChild(cup);
    }
    b.appendChild(grid); b.appendChild(store());
  }
  function openPall() { G.flags.pallSeen = true; buildPall(); $('plMsg').textContent = ''; $('pallPad').hidden = false; openOverlay('pallPad'); A.click(); }
  function tryPall() {
    const pa = W.pall, ok = pa.syms.every((sy, k) => pa.counts[k] === G.run.order.indexOf(sy) + 1);
    if (ok) {
      closeOverlay(); pa.target = 1; W.pallHit.position.y = -20; W.pallHit.updateMatrixWorld(); G.flags.pallOk = true; haptic(50);
      A.unlock({ x: pa.x, y: 0.1, z: pa.z + 0.2 }); later(0.3, () => A.creak({ x: pa.x, y: 0.1, z: pa.z + 0.2 }, 0.4, 0.5)); E.hear(pa.x, pa.z, 5, 0);
      later(0.9, () => { const v = new THREE.Vector3(); pa.drawer.getWorldPosition(v); W.items.wingkey.place(8.25, v.y + 0.046, v.z - 0.02, 1.57); });
      toast(t('t_pall_ok'), 5); saveSoon();
    } else {
      pa.counts = [0, 0, 0, 0]; pa.board.setSeeds(pa.counts); A.seeds({ x: pa.x, y: 0.2, z: pa.z }); E.hear(pa.x, pa.z, 7, 0); haptic(80);
      buildPall(); $('plMsg').innerHTML = `<span class="bad">${t('pl_wrong')}</span>`;
    }
  }
  $('plTry').onclick = tryPall; $('plClose').onclick = closeOverlay;
  $('plClear').onclick = () => { W.pall.counts = [0, 0, 0, 0]; W.pall.board.setSeeds(W.pall.counts); A.seeds({ x: W.pall.x, y: 0.2, z: W.pall.z }); buildPall(); };

  function useCradle() {
    const cp = { x: 23, y: 1.2, z: 4.4 }, F = G.flags;
    if (F.kolusuHome) { toast(t('t_cradle_done'), 3); return; }
    if (W.typeOf(P.held) !== 'kolusu') { W.cradleTarget = 0.3; later(2.4, () => { if (!F.kolusuHome) W.cradleTarget = 0.08; }); A.creak(cp, 0.4, 0.6); toast(t(F.kolusuN ? 't_cradle_one' : 't_cradle'), 4.5); return; }
    consume(); F.kolusuN = (F.kolusuN || 0) + 1; (F.kolusuN === 1 ? W.cradleKolusu : W.cradleKolusu2).visible = true; W.cradleTarget = 0.22; haptic(40);
    A.lullaby(cp); A.anklet(cp, 0.5);
    const calm = F.kolusuN >= 2; if (calm) F.kolusuHome = true;
    if (E.active && E.state !== 'ko') { E.knockout(calm ? 60 : 30, true); A.cry({ x: E.pos.x, y: E.y + 1.5, z: E.pos.z }); }
    toast(t(calm ? 't_cradle_put' : 't_cradle_put1'), 7); saveSoon();
  }

  /* ---------------- the second wing (irandaam kattu): its locks and puzzles ---------------- */
  const WG = W.wing, T4 = W.FLOOR[1];
  const no = s => `<span class="no">${s}</span>`;
  const FUSE_P = { x: 24.25, y: 1.65, z: 16.4 }, MOTOR_P = { x: 39.7, y: 0.4, z: 4.4 }, TANK_P = { x: 37.9, y: 1, z: 10 }, SAFE_P = { x: 38.2, y: 0.8, z: 1.3 };
  function doorPrompt(d, h) {
    switch (d.lock) {
      case 'smallkey': return h === 'smallkey' ? t('p_usekey') : no(t('p_locked'));
      case 'wingkey': return h === 'wingkey' ? t('p_usekey') : no(t('p_wing'));
      case 'sickle': return h === 'sickle' ? t('p_rope_cut') : no(t('p_rope'));
      case 'bolt': return P.x > d.center.x ? t('p_unbolt') : no(t('p_bolted'));
      case 'valli': return t('p_letters');
    }
    return no(t('p_locked'));
  }
  function doorAction(d, h) {
    switch (d.lock) {
      case 'smallkey': if (h === 'smallkey') return { l: t('a_open'), i: 'key' }; break;
      case 'wingkey': if (h === 'wingkey') return { l: t('a_open'), i: 'key' }; break;
      case 'sickle': if (h === 'sickle') return { l: t('a_cut'), i: 'cut' }; break;
      case 'bolt': if (P.x > d.center.x) return { l: t('a_unbolt'), i: 'door' }; break;
      case 'valli': return { l: t('a_code'), i: 'code' };
    }
    return { l: t('a_locked'), i: 'lock' };
  }
  function wingDoor(d, p) {
    const lp = { x: p.x, y: (d.y || 0) + 1.2, z: p.z };
    if (d.lock === 'wingkey') {
      if (P.held !== 'wingkey') { toast(t('t_wing_locked'), 4.5); G.flags.wingSeen = true; return true; }
      consume(); d.locked = false; A.unlock(lp); later(0.3, () => { d.setOpen(true); A.creak(lp, 1, 1.6); }); E.hear(p.x, p.z, 8, 0); haptic(50);
      G.flags.wingOpen = true; toast(t('t_wing_open'), 6); saveSoon(); return true;
    }
    if (d.lock === 'sickle') {
      if (P.held !== 'sickle') { toast(t('t_rope'), 4.5); G.flags.ropeSeen = true; return true; }
      consume(); WG.rope.forEach(r => r.visible = false); d.locked = false; A.whoosh(lp, 0.6); later(0.25, () => { d.setOpen(true); A.creak(lp, 0.8); }); E.hear(p.x, p.z, 5, 0); haptic(40);
      G.flags.granaryOpen = true; toast(t('t_rope_cut'), 4.5); saveSoon(); return true;
    }
    if (d.lock === 'bolt') {
      if (P.x > d.center.x) { d.locked = false; A.unlock(lp); later(0.25, () => { d.setOpen(true); A.creak(lp, 0.8); }); E.hear(p.x, p.z, 5, 1); G.flags.boltOpen = true; toast(t('t_bolt_open'), 5); saveSoon(); }
      else { A.thud(lp, 0.4); toast(t('t_bolted'), 4.5); G.flags.boltSeen = true; }
      return true;
    }
    if (d.lock === 'valli') { openLetters(d); return true; }
    return false;
  }
  function wingPrompt(tg, h) {
    switch (tg.kind) {
      case 'chart': return t('p_chart');
      case 'scale': return t('p_scale');
      case 'safe': return WG.safeKnob ? t('p_safe') : h === 'safeknob' ? t('p_knob') : no(t('p_safe_knob'));
      case 'fusebox': if (WG.power) return no(t('p_power_on')); if (W.typeOf(h) === 'fuse') return t('p_fuse_put'); return WG.fuses >= 3 ? t('p_lever') : no(t('p_fuse', { n: WG.fuses }));
      case 'portraits': return t('p_portraits');
      case 'tank': return WG.tankFull ? t('p_tank_box') : no(t(WG.motorOn ? 'p_tank_fill' : 'p_tank'));
      case 'motor': return WG.tankFull ? no(t('p_motor_done')) : WG.motorOn ? no(t('p_motor_run')) : WG.power ? t('p_motor') : no(t('p_motor_dead'));
      case 'radio': return WG.power ? t(WG.radioT > 0 ? 'p_radio_off' : 'p_radio') : no(t('p_radio_dead'));
    }
    return '';
  }
  function wingAction(tg, h) {
    switch (tg.kind) {
      case 'chart': case 'portraits': return { l: t('a_look'), i: 'eye' };
      case 'scale': return { l: t('a_weigh'), i: 'grab' };
      case 'safe': return WG.safeKnob ? { l: t('a_code'), i: 'code' } : h === 'safeknob' ? { l: t('a_fit'), i: 'grab', hot: true } : { l: t('a_locked'), i: 'lock' };
      case 'fusebox': if (WG.power) return { l: t('a_look'), i: 'eye' }; if (W.typeOf(h) === 'fuse') return { l: t('a_fit'), i: 'grab', hot: true }; return WG.fuses >= 3 ? { l: t('a_switch'), i: 'lamp', hot: true } : { l: t('a_look'), i: 'eye' };
      case 'tank': return WG.tankFull ? { l: t('a_open'), i: 'grab', hot: true } : { l: t('a_look'), i: 'well' };
      case 'motor': return { l: t('a_switch'), i: 'sound' };
      case 'radio': return { l: t('a_switch'), i: 'music' };
    }
    return null;
  }
  function wingUse(tg) {
    switch (tg.kind) {
      case 'chart': openNote('chart'); break;
      case 'scale': openScale(); break;
      case 'safe': useSafe(); break;
      case 'fusebox': useFuse(); break;
      case 'portraits': openPortraits(); break;
      case 'tank': useTank(); break;
      case 'motor': useMotor(); break;
      case 'radio': useRadio(); break;
    }
  }
  // fuse board in the wedding hall: three fuses, then the main switch
  function useFuse() {
    if (WG.power) { toast(t('t_power_already'), 3); return; }
    if (W.typeOf(P.held) === 'fuse') {
      consume(); WG.fuse.slots[WG.fuses].visible = true; WG.fuses++; A.clink(FUSE_P); A.click(); haptic(25); G.flags.fuseSeen = true;
      toast(t(WG.fuses < 3 ? 't_fuse_in' : 't_fuse_all', { n: WG.fuses }), 4.5); saveSoon(); return;
    }
    if (WG.fuses >= 3) {
      WG.leverT = 1; WG.power = true; G.flags.power = true; WG.fuse.lamp.material.color.setHex(0x5cff86);
      A.power(FUSE_P); haptic(90); E.hear(FUSE_P.x, FUSE_P.z, 24, 0);
      later(1.4, () => toast(t('t_power'), 6.5)); saveSoon(); return;
    }
    G.flags.fuseSeen = true; A.click(); toast(t('t_fuse_need', { n: 3 - WG.fuses }), 5);
  }
  // the pump fills the deep tank in the second courtyard; Valli's box floats up
  function useMotor() {
    if (WG.tankFull) { toast(t('t_motor_done'), 3); return; }
    if (WG.motorOn) { toast(t('t_motor_run'), 3); return; }
    if (!WG.power) { A.click(); toast(t('t_motor_dead'), 4.5); G.flags.motorSeen = true; return; }
    WG.motorOn = true; A.motor(MOTOR_P, 11.5); later(1.0, () => A.water({ x: 38.4, y: 1.3, z: 9.6 }, 10.5)); E.hear(MOTOR_P.x, MOTOR_P.z, 20, 0); haptic(60);
    toast(t('t_motor_on'), 5.5);
  }
  W.onTankFull = function () { A.thud(TANK_P, 0.4); if (G.state === 'play') toast(t('t_tank_full'), 5.5); G.flags.tankFull = true; saveSoon(); };
  function useTank() {
    if (!WG.tankFull) { G.flags.tankSeen = true; toast(t(WG.motorOn ? 't_tank_filling' : 't_tank_dry'), 5.5); return; }
    if (WG.boxOpen) return;
    WG.boxOpen = true; WG.tankHit.position.y = -20; WG.tankHit.updateMatrixWorld(); haptic(30);
    A.creak(TANK_P, 0.5, 0.5); later(0.3, () => A.anklet({ x: 37.6, y: 1.1, z: 9.4 }, 0.7));
    W.items.kolusu2.place(37.55, 1.055, 9.37, 0.5);
    later(0.5, () => { if (G.state === 'play' && !G.overlay) openNote('tankbox'); }); saveSoon();
  }
  // the valve radio upstairs: loud enough to call Paatti to it
  let radioSnd = null, radioPing = 0;
  function useRadio() {
    if (!WG.power) { A.static(); toast(t('t_radio_dead'), 3.5); return; }
    if (WG.radioT > 0) { WG.radioT = 0.001; if (radioSnd) radioSnd.stop(); radioSnd = null; A.click(); return; }
    WG.radioT = 25; radioPing = 0.5; radioSnd = A.radio({ x: 45.5, y: T4 + 0.8, z: 16.2 }, 25); haptic(20);
    toast(t(G.flags.radioTip ? 't_radio2' : 't_radio'), 6); G.flags.radioTip = true;
  }
  function radioTick(dt) { if (WG.radioT > 0) { radioPing -= dt; if (radioPing <= 0) { radioPing = 3; E.hear(45.5, 16.2, 30, 1); } } else if (radioSnd) radioSnd = null; }
  // the iron safe in the accounts room
  function useSafe() {
    if (!WG.safeKnob) {
      if (P.held === 'safeknob') { consume(); WG.safeKnob = true; WG.safe.knob.visible = true; A.click(); A.clink(SAFE_P); haptic(20); toast(t('t_knob_on'), 4.5); saveSoon(); return; }
      G.flags.safeSeen = true; toast(t('t_safe_knob'), 5); return;
    }
    G.flags.safeSeen = true; openKeypad('safe');
  }
  function openSafe() {
    WG.safeT = 1; WG.safeHit.position.y = -20; WG.safeHit.updateMatrixWorld(); G.flags.safeOpen = true;
    A.unlock(SAFE_P); later(0.4, () => A.creak(SAFE_P, 0.7, 1.4)); E.hear(SAFE_P.x, SAFE_P.z, 6, 0); haptic(60);
    W.items.bigkey.place(38.55, 0.75, 1.3, 1.57); toast(t('t_safe_open'), 4.5);
    later(1.6, () => { if (G.state === 'play' && !G.overlay) openNote('safeletter'); }); saveSoon();
  }
  // Valli's door: a three-ring letter lock
  let letterDoor = null;
  function buildLetters() {
    const w = $('ltWheels'); w.innerHTML = '';
    WG.letters.forEach((v, i) => {
      const col = document.createElement('div'); col.className = 'wheel';
      const up = document.createElement('button'); up.textContent = '▲'; up.setAttribute('aria-label', `Ring ${i + 1} up`); up.onclick = () => { WG.letters[i] = (WG.letters[i] + W.LETTERS.length - 1) % W.LETTERS.length; A.tick({ x: 34.5, y: T4 + 1.1, z: 5 }, true); buildLetters(); };
      const d = document.createElement('div'); d.className = 'd ta'; d.textContent = W.LETTERS[v];
      const dn = document.createElement('button'); dn.textContent = '▼'; dn.setAttribute('aria-label', `Ring ${i + 1} down`); dn.onclick = () => { WG.letters[i] = (WG.letters[i] + 1) % W.LETTERS.length; A.tick({ x: 34.5, y: T4 + 1.1, z: 5 }, false); buildLetters(); };
      col.append(up, d, dn); w.appendChild(col);
    });
  }
  function openLetters(d) { letterDoor = d; G.flags.lettersSeen = true; buildLetters(); $('ltMsg').textContent = t('lt_hint'); $('letterPad').hidden = false; openOverlay('letterPad'); A.click(); }
  function tryLetters() {
    const want = ['வ', 'ள்', 'ளி'], ok = WG.letters.every((v, i) => W.LETTERS[v] === want[i]), d = letterDoor || W.doorById.valli, p = { x: d.center.x, y: T4 + 1.1, z: d.center.z };
    if (ok) {
      closeOverlay(); d.locked = false; WG.letterLock.visible = false; A.unlock(p); later(0.35, () => { d.setOpen(true); A.creak(p, 0.9, 1.2); }); haptic(60); E.hear(p.x, p.z, 5, 1);
      G.flags.valliOpen = true; toast(t('t_valli_open'), 5.5); saveSoon();
    } else { A.clink(p); haptic(100); E.hear(p.x, p.z, 6, 1); $('ltMsg').innerHTML = `<span class="bad">${t('lt_wrong')}</span>`; }
  }
  $('ltTry').onclick = tryLetters; $('ltClose').onclick = closeOverlay;
  // the beam balance: weigh the paddy sack with brass weights; the drawer below holds the safe's knob
  function drawScale() {
    const S = WG.scale, sum = WG.onPan.reduce((a, on, i) => a + (on ? S.weights[i].userData.wv : 0), 0);
    const tilt = Math.max(-1, Math.min(1, (WG.sack - sum) / 8)) * 12, svg = $('scSvg');
    const pan = (x, y, inner) => `<g transform="translate(${x} ${y})"><line x1="0" y1="0" x2="-30" y2="52" class="scStr"/><line x1="0" y1="0" x2="30" y2="52" class="scStr"/><path d="M-40 52 Q0 74 40 52 Z" class="scPan"/>${inner}</g>`;
    const a = tilt * Math.PI / 180, lx = 160 - Math.cos(a) * 110, ly = 40 + Math.sin(a) * 110, rx = 160 + Math.cos(a) * 110, ry = 40 - Math.sin(a) * 110;
    let wts = ''; let k = 0; WG.onPan.forEach((on, i) => { if (!on) return; const v = S.weights[i].userData.wv, r = 7 + Math.cbrt(v) * 3; wts += `<g transform="translate(${-26 + (k % 4) * 17} ${52 - r * 1.3 - Math.floor(k / 4) * 16})"><rect x="${-r * 0.55}" y="0" width="${r * 1.1}" height="${r * 1.3}" rx="2" class="scW"/><text x="0" y="${r * 0.8}" class="scWt">${K.tamilNum(v)}</text></g>`; k++; });
    svg.innerHTML = `<rect x="150" y="40" width="20" height="104" class="scPost"/><rect x="118" y="138" width="84" height="10" rx="3" class="scPost"/>` +
      `<line x1="${lx}" y1="${ly}" x2="${rx}" y2="${ry}" class="scBeamL"/><circle cx="160" cy="40" r="6" class="scPin"/>` +
      pan(lx, ly, `<ellipse cx="0" cy="40" rx="26" ry="16" class="scSack"/><rect x="-20" y="28" width="40" height="20" rx="2" class="scTag"/><text x="0" y="42" class="scTagT">${K.tamilNum(WG.sack)}</text>`) + pan(rx, ry, wts);
    const box = $('scWeights'); box.innerHTML = '';
    S.weights.forEach((m, i) => {
      const b = document.createElement('button'); b.className = 'scBtn' + (WG.onPan[i] ? ' on' : ''); b.innerHTML = `<i></i><b>${K.tamilNum(m.userData.wv)}</b>`;
      b.setAttribute('aria-label', 'Weight ' + m.userData.wv); b.setAttribute('aria-pressed', String(!!WG.onPan[i]));
      b.onclick = () => { if (WG.scaleDone) return; WG.onPan[i] = WG.onPan[i] ? 0 : 1; A.clink({ x: 32, y: 1, z: 4.2 }); haptic(10); drawScale(); checkScale(); };
      box.appendChild(b);
    });
  }
  function openScale() { G.flags.scaleSeen = true; drawScale(); $('scMsg').textContent = ''; $('scalePad').hidden = false; openOverlay('scalePad'); A.click(); }
  function checkScale() {
    const S = WG.scale, sum = WG.onPan.reduce((a, on, i) => a + (on ? S.weights[i].userData.wv : 0), 0);
    if (sum !== WG.sack) { $('scMsg').textContent = sum > WG.sack ? t('sc_heavy') : sum ? t('sc_light') : ''; return; }
    WG.scaleDone = true; $('scMsg').innerHTML = `<b class="good">${t('sc_ok')}</b>`; haptic(50);
    later(0.9, () => {
      if (G.overlay === 'scalePad') closeOverlay();
      WG.drawerT = 1; WG.scaleHit.position.y = -20; WG.scaleHit.updateMatrixWorld(); A.creak({ x: 32, y: 0.8, z: 4 }, 0.4, 0.5);
      W.items.safeknob.place(32.0, 0.712, 4.03, 0.4); G.flags.scaleOk = true; toast(t('t_scale_ok'), 5); saveSoon();
    });
  }
  $('scClose').onclick = closeOverlay;
  // the family portraits: hang them eldest to youngest, left to right
  let porSel = -1;
  function buildPortraits() {
    const row = $('poRow'); row.innerHTML = '';
    WG.por.forEach((who, i) => {
      const b = document.createElement('button'); b.className = 'poCard' + (porSel === i ? ' sel' : '');
      const tex = W.portraitTex(who, G.run.years[who]); b.innerHTML = `<img alt="" src="${porImg(tex)}"><em><small>${W.WHO_NAME[who]}</small><b>${K.tamilNum(G.run.years[who])}</b></em><span>${i + 1}</span>`;
      b.setAttribute('aria-label', W.WHO_NAME[who] + ' ' + K.tamilNum(G.run.years[who]));
      b.onclick = () => {
        if (WG.porDone) return;
        if (porSel < 0) { porSel = i; } else if (porSel === i) { porSel = -1; }
        else { const a = WG.por[porSel]; WG.por[porSel] = WG.por[i]; WG.por[i] = a; porSel = -1; W.hangPortraits(G.run.years); A.creak({ x: 34.8, y: T4 + 1.8, z: 17.6 }, 0.25, 0.3); haptic(12); }
        buildPortraits();
      };
      row.appendChild(b);
    });
  }
  const porImgs = new Map(); const porImg = tex => { if (!porImgs.has(tex)) porImgs.set(tex, tex.image.toDataURL ? tex.image.toDataURL('image/jpeg', 0.82) : ''); return porImgs.get(tex); };
  function openPortraits() { G.flags.porSeen = true; porSel = -1; buildPortraits(); $('poMsg').textContent = ''; $('porPad').hidden = false; openOverlay('porPad'); A.click(); }
  function tryPortraits() {
    const y = G.run.years, ok = WG.por.every((w, i) => i === 0 || y[WG.por[i - 1]] < y[w]);
    if (ok) {
      WG.porDone = true; closeOverlay(); WG.nicheT = 1; WG.portraitHit.position.y = -20; WG.portraitHit.updateMatrixWorld();
      const p = { x: 34.7, y: T4 + 0.9, z: 17.6 }; A.unlock(p); later(0.3, () => A.creak(p, 0.5, 0.7)); E.hear(p.x, p.z, 5, 1); haptic(50);
      W.items.fuse2.place(34.78, T4 + 0.745, 17.62, 1.4); G.flags.porOk = true; toast(t('t_por_ok'), 5); saveSoon();
    } else { const p = { x: 34.8, y: T4 + 1.8, z: 17.6 }; A.clang(p, 0.5, 300); haptic(100); E.hear(p.x, p.z, 7, 1); $('poMsg').innerHTML = `<span class="bad">${t('po_wrong')}</span>`; }
  }
  $('poHang').onclick = tryPortraits; $('poClose').onclick = closeOverlay;

  /* ---------------- the telephone in the hall ---------------- */
  const PH = { next: 75, ringT: 0, burst: 0, calls: 0, rings: 0 };
  function startRing() { if (W.phone.ring || G.flags.doorOpen) return; W.phone.ring = 1; PH.ringT = 11; PH.burst = 0; PH.rings++; if (PH.rings === 1 || P.lv !== 0 || Math.hypot(P.x - W.phone.x, P.z - W.phone.z) > 9) toast(t('t_phone_ring'), 4); }
  function phoneTick(dt) {
    const ph = W.phone;
    if (ph.ring) {
      PH.ringT -= dt; PH.burst -= dt;
      if (PH.burst <= 0) { PH.burst = 3; A.phoneRing({ x: ph.x, y: 0.9, z: ph.z }); E.hear(ph.x, ph.z, 13, 0); haptic(15); }
      if (PH.ringT <= 0) { ph.ring = 0; E.hear(ph.x, ph.z, 40, 0); toast(t('t_phone_miss'), 3.5); PH.next = G.time + 110 + Math.random() * 60; }
      return;
    }
    if (G.time >= PH.next && PH.calls < 8 && !P.hidden && E.state !== 'chase' && E.state !== 'hidegrab' && !G.flags.doorOpen) startRing();
  }
  function pickCall() {
    const F = G.flags;
    if (!W.clock.running && !F.callClock) { F.callClock = 1; return t('call_clock'); }
    if (!F.kolusuHome && !F.got_kolusu && !F.callValli) { F.callValli = 1; return t('call_valli'); }
    if (F.got_kolusu && !F.kolusuHome && !F.callCradle) { F.callCradle = 1; return t('call_cradle'); }
    if (!F.callRun) { F.callRun = 1; return t('call_run'); }
    return t('call_hint', { h: nextHint().replace(/<[^>]+>/g, '') });
  }
  function answerPhone() {
    if (!W.phone.ring) { A.static(); toast(t('t_phone_dead'), 2.6); return; }
    W.phone.ring = 0; PH.calls++; A.phoneVoice(); haptic(30); E.hear(W.phone.x, W.phone.z, 4, 0);
    const msg = pickCall(); later(0.5, () => toast(`<span class="voice">${msg}</span>`, 7.5));
    PH.next = G.time + 95 + Math.random() * 75;
  }

  /* ---------------- suspense: things that happen in the house ---------------- */
  const SC = { sec: 0, ghostCD: 40, slamCD: 55, aboveCD: 45, ghostT: -1, gx: 0, gz: 0 };
  function resetStory() {
    Object.assign(PH, { next: 75, ringT: 0, burst: 0, calls: 0, rings: 0 });
    Object.assign(SC, { sec: 0, ghostCD: 40, slamCD: 55, aboveCD: 45, ghostT: -1 });
    ck.h = G.run.clockStart.h; ck.m = G.run.clockStart.m;
  }
  function gongNight() { for (let i = 0; i < G.night; i++) later(1.2 + i * 1.7, () => A.gong(W.clockPos, 0.55)); }
  function spawnGhost() {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), base = Math.atan2(fx, fz);
    for (const d of [6.5, 7.5, 5.5]) for (const side of [0, 0.2, -0.2]) {
      const a = base + side, x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d;
      if (!N.passAt(x, z, P.lv) || !N.los(P.x, P.z, x, z, P.lv) || W.ground(x, z, P.lv).stair) continue;
      const gy = W.ground(x, z, P.lv).y;
      if (K.Valli && K.Valli.ready) K.Valli.show(x, gy, z, camera.position); else { W.ghost.position.set(x, gy + 0.6, z); W.ghost.visible = true; W.ghost.material.opacity = 0; }
      SC.ghostT = 0; SC.gx = x; SC.gz = z;
      A.anklet({ x, y: gy + 0.1, z }, 0.45); later(0.35, () => A.whisper({ x, y: gy + 1, z }));
      if (!G.flags.ghostSeen) { G.flags.ghostSeen = true; later(1.8, () => toast(t('t_ghost'), 3.5)); }
      return true;
    }
    return false;
  }
  function slamDoor() {
    const cands = shuffle(W.doors.filter(d => d.open && !d.locked && (d.lv || 0) === P.lv));
    for (const d of cands) {
      const dist = Math.hypot(d.center.x - P.x, d.center.z - P.z); if (dist < 3 || dist > 12) continue;
      if (E.lv === P.lv && Math.hypot(E.pos.x - d.center.x, E.pos.z - d.center.z) < 2.2) continue;
      d.fast = true; d.setOpen(false); const p = { x: d.center.x, y: (d.y || 0) + 1.2, z: d.center.z }; A.slam(p); E.hear(p.x, p.z, 8, d.lv || 0); haptic(50);
      return true;
    }
    return false;
  }
  function footstepsAbove() { for (let i = 0; i < 6; i++) later(i * 0.6, () => { const p = { x: P.x + 2 - i * 0.6, y: 4.3, z: P.z + 1.2 }; A.paattiStep(p); if (i % 2 === 0) A.anklet(p, 0.5); }); }
  function suspense(dt) {
    if (SC.ghostT >= 0) {
      SC.ghostT += dt; const k = SC.ghostT, near = Math.hypot(P.x - SC.gx, P.z - SC.gz) < 3.5;
      if ((k > 1.5 || near) && SC.ghostT < 10) SC.ghostT = 10;
      const op = SC.ghostT >= 10 ? Math.max(0, 0.8 - (SC.ghostT - 10) * 2.4) : Math.min(0.8, k * 3.2) * (0.8 + Math.random() * 0.2);
      if (K.Valli && K.Valli.ready) { K.Valli.setOpacity(op * 1.2); K.Valli.update(dt, camera.position); } else W.ghost.material.opacity = op;
      if (SC.ghostT >= 10 && op <= 0) { SC.ghostT = -1; W.ghost.visible = false; K.Valli && K.Valli.hide(); }
    }
    SC.sec += dt; if (SC.sec < 1) return; SC.sec = 0;
    W.setMirror(G.night >= 2);
    if (P.hidden || G.flags.doorOpen) return;
    SC.ghostCD--; SC.slamCD--; SC.aboveCD--;
    const room = W.roomAt(P.x, P.z, P.lv), F = G.flags;
    if (room && room.id === 'bedroom' && !F.cradleScare && G.time > 12) { F.cradleScare = true; W.cradleTarget = 0.5; A.lullaby({ x: 23, y: 1.3, z: 4.4 }); A.creak({ x: 23, y: 3, z: 4.4 }, 0.5, 1.4); later(7.5, () => { if (!F.kolusuHome) W.cradleTarget = 0.08; }); }
    if (room && room.id === 'kitchen' && W.fallPlate.t === -1 && G.time > 25 && Math.random() < 0.3) { W.fallPlate.t = 0; later(0.85, () => { const p = { x: 0.77, y: 0.05, z: 4.15 }; A.clang(p, 1, 1300); later(0.3, () => A.clang(p, 0.45, 1300)); later(0.6, () => A.clink(p)); E.hear(p.x, p.z, 9, 0); }); }
    if (room && room.id === 'hall' && G.night >= 2 && F.swingNight !== G.night) { F.swingNight = G.night; W.swingAmp = 0.03; A.creak({ x: 9, y: 3, z: 17.6 }, 0.6, 1.4); later(6, () => { W.swingAmp = 0; }); }
    if (E.state === 'chase' || E.state === 'hidegrab') return;
    const dP = E.lv === P.lv ? Math.hypot(E.pos.x - P.x, E.pos.z - P.z) : 99;
    if (SC.ghostCD <= 0 && dP > 11 && G.time > 35 && SC.ghostT < 0 && Math.random() < 0.08) { SC.ghostCD = spawnGhost() ? 75 + Math.random() * 75 : 8; }
    if (SC.slamCD <= 0 && Math.random() < 0.05) { SC.slamCD = slamDoor() ? 80 + Math.random() * 90 : 10; }
    if (SC.aboveCD <= 0 && P.lv === 0 && !P.inMoon && E.lv !== 1 && Math.random() < 0.06) { SC.aboveCD = 90 + Math.random() * 90; footstepsAbove(); }
  }

  /* ---------------- the five lamps as 3D images ---------------- */
  function useLampImages() {
    const im = K.diyaImg; if (!im) return;
    const st = document.createElement('style');
    st.textContent = `.d3 .bl{background-image:url(${im.lit})}.d3 .bo{background-image:url(${im.out})}.d3 .fl{background-image:url(${im.flame});transform-origin:${im.wx} ${im.wy}}.d3 .smk{left:${im.wx};top:${im.wy}}`;
    document.head.appendChild(st);
    K.diya = (state) => `<span class="d3 ${state}"><i class="bl"></i><i class="bo"></i><i class="fl"></i><svg class="smk" viewBox="0 0 10 24" aria-hidden="true"><path d="M5 24C3 19 7 16 5 12C3.4 9 6.4 6 5 2" /></svg></span>`;
  }

  /* ---------------- notes / journal / keypad / pause ---------------- */
  function openOverlay(name) { requestAnimationFrame(markScrolls); G.overlay = name; releaseLock(); for (const k in keys) keys[k] = false; updateClickHint(); }
  function closeOverlay() { const o = G.overlay; if (!o) return; if (o === 'ctlPad') { closeCtl(); return; } $(o).hidden = true; G.overlay = null; if (G.state === 'play') requestLock(); updateClickHint(); }
  // a letter's words (and its little tables) into an element, ending with who wrote it
  function fillNote(id, el) {
    el.textContent = '';
    if (id === 'clock') el.textContent = t('note_clock', { time: clockStr(G.run.clock) });
    else if (id === 'lamps') {
      const o = G.run.order;
      el.textContent = t('note_lamps_a');
      const sd = document.createElement('div'); sd.className = 'sym'; sd.innerHTML = o.map(x => K.SYMBOL_GLYPH[x]).join(' → '); el.appendChild(sd);
      el.appendChild(document.createTextNode(o.map(sym).join(', ') + t('note_lamps_b')));
    } else if (id === 'chart') {
      el.textContent = t('note_chart');
      const tb = document.createElement('div'); tb.className = 'numChart';
      tb.innerHTML = K.TAMIL_DIGITS.map((d, i) => `<span><b>${d}</b><i>${i}</i></span>`).join('') + `<span class="wide"><b>${K.tamilNum(1987)}</b><i>1987</i></span>`;
      el.appendChild(tb);
    } else el.textContent = t('note_' + id);
    const sg = { valliroom: t('sig_valli'), tankbox: t('sig_valli'), chart: '' }[id] ?? t('thatha');
    if (sg) { const d = document.createElement('div'); d.className = 'sig'; d.textContent = sg; el.appendChild(d); }
  }
  /* no scrollbars anywhere: long text flows into columns exactly one box wide, and the box turns them like pages */
  const PG_GAP = 28;
  function makePager(box, inner, prev, next, label, row) {
    const st = { p: 0, n: 1 }, step = () => box.clientWidth + PG_GAP;
    function layout(cpp = 1) {
      const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
      inner.style.transition = 'none'; inner.style.transform = 'none'; inner.style.columnCount = 'auto';
      inner.style.height = h + 'px'; inner.style.columnWidth = Math.floor((w - PG_GAP * (cpp - 1)) / cpp) + 'px'; inner.style.columnGap = PG_GAP + 'px';
      const r = inner.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(inner); let maxR = r.left;
      for (const q of rg.getClientRects()) if (q.width > 0) maxR = Math.max(maxR, q.right);
      st.n = Math.max(1, Math.ceil((maxR - r.left - 2) / step())); go(Math.min(st.p, st.n - 1), true);
    }
    function go(p, instant) {
      st.p = Math.max(0, Math.min(st.n - 1, p));
      inner.style.transition = instant ? 'none' : ''; inner.style.transform = st.p ? `translateX(${-st.p * step()}px)` : 'none';
      label.textContent = `${st.p + 1} / ${st.n}`; prev.disabled = st.p === 0; next.disabled = st.p >= st.n - 1; row.hidden = st.n <= 1;
    }
    prev.onclick = () => { go(st.p - 1); A.click(); }; next.onclick = () => { go(st.p + 1); A.click(); };
    let sx = null; box.addEventListener('pointerdown', e => { sx = e.clientX; }); box.addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 40) { go(st.p + (e.clientX < sx ? 1 : -1)); A.click(); } sx = null; });
    return { layout, go, st };
  }
  G._openNote = id => openNote(id); // for tests
  const notePg = makePager($('noteBox'), $('noteText'), $('notePrev'), $('noteNext'), $('notePage'), $('notePager'));
  function openNote(id) {
    G.notes.add(id); A.click();
    const el = $('noteText'); fillNote(id, el);
    const pap = $('note').querySelector('.paper'), wide = id !== 'chart' && el.textContent.length > 330 && window.innerWidth > 1.6 * window.innerHeight;
    pap.classList.toggle('wide', wide);
    $('note').hidden = false; openOverlay('note'); notePg.st.p = 0;
    requestAnimationFrame(() => notePg.layout(wide ? 2 : 1));
    if (id === 'ledger' || id === 'portraits' || id === 'valliroom') saveSoon();
  }
  $('noteClose').onclick = closeOverlay;
  /* the diary: three tabs on top (what is left to do, Thatha's letters, the map); nothing in it scrolls */
  let jTab = 'diary', jSel = -1, jNote = null, jlPage = 0, jItems = [];
  const jrPg = makePager($('jrBox'), $('jrText'), $('jrPrev'), $('jrNext'), $('jrPage'), $('jrPager'));
  function setJTab(tb) {
    jTab = tb;
    document.querySelectorAll('.jtabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.jt === tb)));
    document.querySelectorAll('#journal .jpane').forEach(p => { p.hidden = p.dataset.jp !== tb; });
    if (tb === 'map') requestAnimationFrame(drawMini); else if (tb === 'letters') requestAnimationFrame(renderLetters); else renderObj();
  }
  document.querySelectorAll('.jtabs button').forEach(b => b.onclick = () => { if (jTab !== b.dataset.jt) { setJTab(b.dataset.jt); A.click(); } });
  function renderObj() {
    const ol = $('objList'); ol.innerHTML = '';
    if (jSel < 0 || jSel >= jItems.length) { jSel = jItems.findIndex(x => !x[0]); if (jSel < 0) jSel = 0; }
    jItems.forEach(([done, txt], i) => {
      const b = document.createElement('button'); b.className = 'jitem' + (done ? ' done' : ''); b.setAttribute('aria-current', String(i === jSel));
      b.innerHTML = `<span class="ck"></span><span class="tt"></span>`; b.querySelector('.tt').textContent = txt;
      b.onclick = () => { jSel = i; renderObj(); A.click(); }; ol.appendChild(b);
    });
    const it = jItems[jSel] || [false, '', ''];
    $('objTitle').textContent = it[1]; $('objHint').textContent = it[0] ? t('j_done') : (it[2] || '');
    const cv = $('codeView'); cv.innerHTML = '';
    for (let i = 1; i <= 4; i++) { const sp = document.createElement('span'); sp.textContent = G.found[i] ? G.run.code[i - 1] : '?'; cv.appendChild(sp); }
  }
  function renderLetters() {
    const nl = $('noteList'); nl.innerHTML = '';
    const ids = [...G.notes];
    if (!ids.length) { nl.innerHTML = `<span class="muted" style="font-size:.78rem">${t('j_none')}</span>`; $('jlPager').hidden = true; $('jrText').textContent = ''; $('jrPager').hidden = true; return; }
    if (!jNote || !G.notes.has(jNote)) jNote = ids[ids.length - 1];
    // how many fit in the column: measure one, then show that many per page
    const mk = id => { const b = document.createElement('button'); b.className = 'jitem'; b.setAttribute('aria-current', String(id === jNote)); b.innerHTML = '<span class="tt"></span>'; b.querySelector('.tt').textContent = t('n_' + id); b.onclick = () => { jNote = id; renderLetters(); A.click(); }; return b; };
    $('jlPager').hidden = true; nl.appendChild(mk(ids[0])); const ih = nl.firstChild.offsetHeight + 3.5;
    let per = Math.max(1, Math.floor((nl.clientHeight + 3.5) / ih));
    if (ids.length > per) { $('jlPager').hidden = false; per = Math.max(1, Math.floor((nl.clientHeight + 3.5) / ih)); } // the page buttons take a row
    const pages = Math.ceil(ids.length / per); if (jlPage >= pages) jlPage = pages - 1;
    const sel = ids.indexOf(jNote); if (sel >= 0 && (sel < jlPage * per || sel >= (jlPage + 1) * per)) jlPage = Math.floor(sel / per);
    nl.innerHTML = ''; ids.slice(jlPage * per, (jlPage + 1) * per).forEach(id => nl.appendChild(mk(id)));
    $('jlPager').hidden = pages <= 1; $('jlPage').textContent = `${jlPage + 1} / ${pages}`; $('jlPrev').disabled = jlPage === 0; $('jlNext').disabled = jlPage >= pages - 1;
    $('jlPrev').onclick = () => { jlPage--; jNote = ids[jlPage * per]; renderLetters(); A.click(); };
    $('jlNext').onclick = () => { jlPage++; jNote = ids[jlPage * per]; renderLetters(); A.click(); };
    fillNote(jNote, $('jrText')); jrPg.st.p = 0; jrPg.layout(1);
  }
  function openJournal() {
    const L = W.main.locks, F = G.flags;
    jItems = [
      [!L.pad, t('o_pad'), hintPad()],
      [!L.chain, t('o_chain'), t(F.got_boltcutter ? 'h_ch_got' : F.got_almirahkey ? 'h_ch_key' : F.poojaOpen ? 'h_ch_pooja' : G.notes.has('lamps') ? 'h_ch_lamps' : 'h_ch_study')],
      [!L.num, t('o_num'), hintNum()],
      [!L.bar, t('o_bar'), hintBar()]
    ];
    if (F.got_kolusu || F.kolusuHome || G.notes.has('cradle') || G.notes.has('valli')) jItems.push([!!F.kolusuHome, t('o_kolusu'), hintKolusu()]);
    if (G.flags.doorOpen) jItems.push([false, t('o_gate'), t('h_gate')]);
    else if (!G.flags.got_oosi) jItems.push([false, t('o_oosi'), t('h_oosi')]);
    jSel = -1;
    $('pageCount').textContent = `${[...G.notes].filter(n => STORY.includes(n)).length}/${STORY.length}`;
    G.mapLv = P.lv; setMapTabs(); $('journal').hidden = false; openOverlay('journal');
    setJTab(jTab);
  }
  // the map shows one half of the compound at a time: the old house, or the second wing (tap the map to switch)
  /* ---------------- the map: one painter for the diary's small map and the full-screen map ---------------- */
  const MAPV = { '-1': [-0.5, 6.5, 5.5, 14.5], '0': [-0.5, 46.5, -1.4, 21.4], '1': [-0.5, 46.5, -2, 20.6] }; // what "fit" shows on each floor
  const MAPLIM = { '-1': [-1, 7.5, 5, 15], '0': [-1, 47, -10.6, 28.6], '1': [-1, 47, -2.2, 21] };       // how far the view may pan
  const FONT_M = '"Hind Madurai", "Noto Sans Tamil", system-ui, sans-serif';
  function fitView(lv, w, h, pad) { const [x0, x1, z0, z1] = MAPV[lv]; const s = Math.max(1, Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (z1 - z0))); return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, s, fit: s }; }
  // where the next step happens (mirrors nextHint), for the gold ring on the map
  function hintTarget() {
    const L = W.main.locks, F = G.flags, T = (x, z, lv = 0) => ({ x, z, lv }), MAIN = T(12, 19.2);
    const bar = () => {
      if (F.got_bigkey) return MAIN;
      if (!F.wingOpen) return F.got_wingkey ? T(23.6, 10) : F.pallOk ? T(8.2, 14.8) : F.wingSeen ? T(8.2, 14.6) : T(23.6, 10);
      if (F.safeOpen) return T(38.2, 1.3);
      if (!G.notes.has('ledger')) return T(30.1, 3.95, 1);
      if (!WG.safeKnob) { if (F.got_safeknob) return T(38.0, 1.3); if (F.scaleOk) return T(32, 3.9); return G.notes.has('chart') ? T(32, 4.0) : T(31.4, 2.6); }
      return F.porSeen || G.notes.has('portraits') ? T(38.0, 1.3) : T(34.4, 17.6, 1);
    };
    if (F.doorOpen) return T(12, 25.5);
    if (L.bar && F.wingOpen && P.x > 24) return bar();
    if (L.pad) {
      if (!F.guestOpen) { if (!F.clockOk) return G.notes.has('clock') ? T(17.65, 19.0) : T(23.3, 2.75); return F.got_smallkey ? T(18, 17) : T(17.65, 19.0); }
      if (!G.notes.has('well')) return T(20.3, 19.3);
      if (W.well.used) return F.got_brasskey ? MAIN : T(12, 9.2);
      return F.got_bucket ? T(12, 10) : T(19.05, 19.1);
    }
    if (L.chain) { if (F.got_boltcutter) return MAIN; if (F.got_almirahkey) return T(0.9, 16.2); if (F.poojaOpen) return T(16.5, 1.6); if (G.notes.has('lamps')) return F.got_matchbox ? T(12, 10) : T(17.95, -9.4); return T(23.3, 8.75); }
    if (L.num) { const clue = { 1: T(8.2, 14.8), 2: T(18.6, 3.2, 1), 3: T(5.6, 9.3, -1), 4: T(16.5, 3.4) }; if (!G.found[1] && F.pallSeen) return clue[1]; for (const k of [1, 2, 3, 4]) if (!G.found[k]) return clue[k]; return MAIN; }
    return bar();
  }
  function paintMap(c, lv, view, big, now) {
    const F = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1)), cw = Math.round((c.clientWidth || 320) * F), ch = Math.round((c.clientHeight || 180) * F);
    if (cw < 4 || ch < 4) return;
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    const g = c.getContext('2d'), s = view.s * F, X = x => cw / 2 + (x - view.cx) * s, Z = z => ch / 2 + (z - view.cz) * s, FL = G.flags;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0c0908'; g.fillRect(0, 0, cw, ch);
    const rooms = W.ROOMS.filter(r => (r.lv || 0) === lv);
    // yards and the open terrace first, the rooms on top; rooms not yet entered stay darker
    for (const out of [true, false]) for (const r of rooms) {
      if (!!r.out !== out) continue;
      g.fillStyle = out ? (r.id === 'terrace' ? '#1b1f27' : '#132019') : FL['v_' + r.id] ? '#3a2b1e' : '#231a14';
      g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    }
    if (lv === 0) {
      g.fillStyle = '#1f2c44'; g.fillRect(X(9), Z(8), 6 * s, 4 * s); g.fillRect(X(31), Z(7.5), 8 * s, 5 * s);
      g.strokeStyle = '#7a6a52'; g.lineWidth = 1.5 * F; g.beginPath(); g.arc(X(12), Z(10), 1.05 * s, 0, 7); g.stroke(); g.strokeRect(X(37.2), Z(9.3), 1.4 * s, 1.4 * s);
    }
    if (lv === 1) { g.fillStyle = '#060709'; g.fillRect(X(8.9), Z(7.9), 6.2 * s, 4.2 * s); g.fillRect(X(30.9), Z(7.4), 8.2 * s, 5.2 * s); }
    // hiding places
    g.fillStyle = 'rgba(110,200,190,.55)';
    for (const h of W.hideSpots) if ((h.lv || 0) === lv) { const x = X(h.cam.x), z = Z(h.cam.z), r = Math.max(2.5 * F, 0.28 * s); g.beginPath(); g.moveTo(x, z - r); g.lineTo(x + r, z); g.lineTo(x, z + r); g.lineTo(x - r, z); g.closePath(); g.fill(); }
    // walls
    g.fillStyle = '#b08a52'; const wt = Math.max(1.2 * F, 0.2 * s);
    for (const b of W.losBoxes) if ((b.lv || 0) === lv) { const w = (b.maxX - b.minX) * s, h = (b.maxZ - b.minZ) * s; g.fillRect(X(b.minX) - (w < wt ? (wt - w) / 2 : 0), Z(b.minZ) - (h < wt ? (wt - h) / 2 : 0), Math.max(wt, w), Math.max(wt, h)); }
    // doors: red = locked
    for (const d of W.doors) if ((d.lv || 0) === lv) {
      const b = d.box, w = Math.max(2.4 * F, (b.maxX - b.minX) * s), h = Math.max(2.4 * F, (b.maxZ - b.minZ) * s);
      g.fillStyle = d.locked ? '#ff4b36' : '#d8ccb0'; g.fillRect((X(b.minX) + X(b.maxX)) / 2 - w / 2, (Z(b.minZ) + Z(b.maxZ)) / 2 - h / 2, w, h);
    }
    if (lv === 0) { const L = W.main.locks, locked = !G.flags.doorOpen && (L.pad || L.chain || L.num || L.bar); g.fillStyle = locked ? '#ff4b36' : '#7ad18a'; g.fillRect(X(11.2), Z(19.85), 1.6 * s, Math.max(3 * F, 0.3 * s)); }
    // stairs
    g.strokeStyle = 'rgba(214,200,180,.85)'; g.lineWidth = Math.max(1, 0.9 * F);
    for (const st of W.stairs) if (st.lo === lv || st.hi === lv) {
      g.fillStyle = 'rgba(214,200,180,.12)'; g.fillRect(X(st.x0), Z(st.z0), (st.x1 - st.x0) * s, (st.z1 - st.z0) * s); g.strokeRect(X(st.x0), Z(st.z0), (st.x1 - st.x0) * s, (st.z1 - st.z0) * s);
      const n = 8; for (let i = 1; i < n; i++) { g.beginPath(); if (st.axis === 'x') { const x = st.x0 + (st.x1 - st.x0) * i / n; g.moveTo(X(x), Z(st.z0)); g.lineTo(X(x), Z(st.z1)); } else { const z = st.z0 + (st.z1 - st.z0) * i / n; g.moveTo(X(st.x0), Z(z)); g.lineTo(X(st.x1), Z(z)); } g.stroke(); }
    }
    // room names: shrink to fit, two lines if needed, left out when the room is too small at this zoom
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // wrap a name onto as many lines as its room holds (smallest font that still fits wins the fewest lines)
    const wrapAt = (words, maxW) => { const lines = []; let cur = ''; for (const w of words) { const tryL = cur ? cur + ' ' + w : w; if (!cur || g.measureText(tryL).width <= maxW) cur = tryL; else { lines.push(cur); cur = w; } } if (cur) lines.push(cur); return lines; };
    const label = (text, cx, cy, maxW, maxH, color) => {
      const words = String(text).split(/\s+/), fMax = big ? 10.5 : 7.5, fMin = big ? 6.5 : 5;
      g.fillStyle = color;
      for (let f = fMax; f >= fMin; f -= 0.5) {
        g.font = `600 ${f * F}px ${FONT_M}`;
        const lines = wrapAt(words, maxW), lh = f * F * 1.18;
        if (lines.length > 3 || lines.some(l => g.measureText(l).width > maxW) || lines.length * lh > maxH) continue;
        lines.forEach((l, k) => g.fillText(l, cx, cy + (k - (lines.length - 1) / 2) * lh));
        return;
      }
    };
    for (const r of rooms) {
      if (r.id === 'terrace') continue;
      // keep the name off a staircase inside the room: use the larger free side
      let x0 = r.x0, x1 = r.x1, z0 = r.z0, z1 = r.z1;
      for (const st of W.stairs) {
        if (st.lo !== lv && st.hi !== lv) continue;
        if (st.x1 <= x0 || st.x0 >= x1 || st.z1 <= z0 || st.z0 >= z1) continue;
        if (st.axis === 'z') { if (st.x0 - x0 > x1 - st.x1) x1 = st.x0; else x0 = st.x1; }
        else { if (st.z0 - z0 > z1 - st.z1) z1 = st.z0; else z0 = st.z1; }
      }
      const open = r.id === 'courtyard' || r.id === 'court2' || r.id === 'gallery2', w = (x1 - x0) * s - 8 * F, h = (z1 - z0) * s - 6 * F;
      const cy = open ? Z(z0) + Math.min(1.3 * s, h / 2) : Z((z0 + z1) / 2);
      label(r.name, X((x0 + x1) / 2), cy, w, open ? 2.2 * s : h, r.out ? '#a9c2a9' : FL['v_' + r.id] ? '#f3e8cf' : '#a99a85');
    }
    if (lv === 0) label(t('main_door'), X(12), Z(20.85), 6 * s, 1.1 * s, '#ff8270');
    if (lv === 1) label(t('r_terrace'), X(12), Z(4.2), 10 * s, 3 * s, '#9aa3b5');
    // the next step: a pulsing gold ring
    const tg = hintTarget();
    if (tg && tg.lv === lv) { const k = now ? (Math.sin(now / 260) + 1) / 2 : 0.6, r = (7 + k * 5) * F; g.strokeStyle = `rgba(255,96,72,${0.6 + k * 0.4})`; g.lineWidth = 2.4 * F; g.shadowColor = 'rgba(255,40,20,.8)'; g.shadowBlur = 10 * F; g.beginPath(); g.arc(X(tg.x), Z(tg.z), r, 0, 7); g.stroke(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,80,60,.5)'; g.beginPath(); g.arc(X(tg.x), Z(tg.z), 3.2 * F, 0, 7); g.fill(); }
    // you
    if (P.lv === lv) { g.save(); g.translate(X(P.x), Z(P.z)); g.rotate(-P.yaw + Math.PI); g.scale(F, F); const a = big ? 1.25 : 1; g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6; g.fillStyle = '#f3e6d2'; g.strokeStyle = '#1a0806'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 10 * a); g.lineTo(6.5 * a, -6 * a); g.lineTo(0, -2.5 * a); g.lineTo(-6.5 * a, -6 * a); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    return tg;
  }
  // the small map in the diary: the whole floor; tap it for the big one
  function setMapTabs() { document.querySelectorAll('#mapTabs button, #mapTabs2 button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.lv === G.mapLv))); }
  function drawMini() { const c = $('mapCanvas'); if (!c) return; const v = fitView(G.mapLv, c.clientWidth || 320, c.clientHeight || 180, 4); paintMap(c, G.mapLv, v, false, 0); }
  document.querySelectorAll('#mapTabs button').forEach(b => b.onclick = () => { G.mapLv = +b.dataset.lv; setMapTabs(); drawMini(); A.click(); });
  $('mapCanvas').addEventListener('click', () => { $('journal').hidden = true; G.overlay = null; openMap(G.mapLv); });
  if ($('mapOpen')) $('mapOpen').onclick = () => { $('journal').hidden = true; G.overlay = null; openMap(G.mapLv); };
  // the full-screen map: drag to move, pinch / wheel / buttons to zoom, double-tap to zoom in
  const MV = { lv: 0, cx: 12, cz: 10, s: 10, fit: 10, ptrs: new Map(), pd: 0, moved: 0, lastTap: 0, raf: 0 };
  const bigC = $('bigMap');
  function clampView() { const [x0, x1, z0, z1] = MAPLIM[MV.lv]; MV.s = Math.max(MV.fit * 0.8, Math.min(MV.fit * 5, MV.s)); MV.cx = Math.max(x0, Math.min(x1, MV.cx)); MV.cz = Math.max(z0, Math.min(z1, MV.cz)); }
  function zoomAt(px, py, k) { const w = bigC.clientWidth, h = bigC.clientHeight, wx = MV.cx + (px - w / 2) / MV.s, wz = MV.cz + (py - h / 2) / MV.s; MV.s *= k; clampView(); MV.cx = wx - (px - w / 2) / MV.s; MV.cz = wz - (py - h / 2) / MV.s; clampView(); }
  function mapFrame(now) {
    if (G.overlay !== 'mapPad') { MV.raf = 0; return; }
    const tg = paintMap(bigC, MV.lv, MV, true, now);
    const hl = $('mapHint'); const hk = nextHint(); if (hl.dataset.h !== hk) { hl.dataset.h = hk; hl.innerHTML = hk; }
    document.querySelectorAll('#mapTabs2 button').forEach(b => b.classList.toggle('goal', !!tg && tg.lv === +b.dataset.lv));
    MV.raf = requestAnimationFrame(mapFrame);
  }
  function openMap(lv) {
    if (lv === undefined) lv = P.lv;
    MV.lv = G.mapLv = lv; setMapTabs(); $('mapPad').hidden = false; openOverlay('mapPad'); A.click();
    requestAnimationFrame(() => { Object.assign(MV, fitView(lv, bigC.clientWidth, bigC.clientHeight, 10)); if (!MV.raf) MV.raf = requestAnimationFrame(mapFrame); });
  }
  document.querySelectorAll('#mapTabs2 button').forEach(b => b.onclick = () => { MV.lv = G.mapLv = +b.dataset.lv; setMapTabs(); Object.assign(MV, fitView(MV.lv, bigC.clientWidth, bigC.clientHeight, 10)); A.click(); });
  $('mapClose').onclick = closeOverlay;
  $('mzIn').onclick = () => { zoomAt(bigC.clientWidth / 2, bigC.clientHeight / 2, 1.5); A.click(); };
  $('mzOut').onclick = () => { zoomAt(bigC.clientWidth / 2, bigC.clientHeight / 2, 1 / 1.5); A.click(); };
  $('mzMe').onclick = () => { if (P.lv !== MV.lv) { MV.lv = G.mapLv = P.lv; setMapTabs(); Object.assign(MV, fitView(MV.lv, bigC.clientWidth, bigC.clientHeight, 10)); } MV.cx = P.x; MV.cz = P.z; MV.s = Math.max(MV.s, MV.fit * 1.6); clampView(); A.click(); };
  $('mzAll').onclick = () => { Object.assign(MV, fitView(MV.lv, bigC.clientWidth, bigC.clientHeight, 10)); A.click(); };
  bigC.addEventListener('pointerdown', e => { e.preventDefault(); try { bigC.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } MV.ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); MV.moved = 0; if (MV.ptrs.size === 2) { const [a, b] = [...MV.ptrs.values()]; MV.pd = Math.hypot(a.x - b.x, a.y - b.y); } });
  bigC.addEventListener('pointermove', e => {
    const p0 = MV.ptrs.get(e.pointerId); if (!p0) return;
    const nx = e.offsetX, ny = e.offsetY;
    if (MV.ptrs.size === 1) { MV.cx -= (nx - p0.x) / MV.s; MV.cz -= (ny - p0.y) / MV.s; clampView(); MV.moved += Math.abs(nx - p0.x) + Math.abs(ny - p0.y); }
    else if (MV.ptrs.size === 2) {
      const other = [...MV.ptrs.entries()].find(([id]) => id !== e.pointerId)[1], d = Math.hypot(nx - other.x, ny - other.y);
      const mx = (nx + other.x) / 2, my = (ny + other.y) / 2, omx = (p0.x + other.x) / 2, omy = (p0.y + other.y) / 2;
      MV.cx -= (mx - omx) / MV.s; MV.cz -= (my - omy) / MV.s; if (MV.pd > 0) zoomAt(mx, my, d / MV.pd); MV.pd = d; MV.moved = 99;
    }
    p0.x = nx; p0.y = ny;
  });
  const mapUp = e => {
    if (!MV.ptrs.has(e.pointerId)) return; const p0 = MV.ptrs.get(e.pointerId); MV.ptrs.delete(e.pointerId);
    if (MV.ptrs.size === 0 && MV.moved < 8) { const now = performance.now(); if (now - MV.lastTap < 320) { zoomAt(p0.x, p0.y, 1.8); MV.lastTap = 0; } else MV.lastTap = now; }
  };
  bigC.addEventListener('pointerup', mapUp); bigC.addEventListener('pointercancel', mapUp);
  bigC.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  G.map = () => { if (G.state === 'play' && !G.overlay) openMap(); };
  if ($('btnMap')) $('btnMap').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); G.map(); });
  // keypad
  const kp = { v: [0, 0, 0, 0], sel: 0 };
  function buildWheels() {
    const w = $('wheels'); w.innerHTML = '';
    kp.v.forEach((v, i) => {
      const col = document.createElement('div'); col.className = 'wheel';
      const up = document.createElement('button'); up.textContent = '▲'; up.setAttribute('aria-label', `Digit ${i + 1} up`); up.onclick = () => { kp.sel = i; kp.v[i] = (kp.v[i] + 1) % 10; A.click(); buildWheels(); };
      const d = document.createElement('div'); d.className = 'd' + (kp.sel === i ? ' sel' : ''); d.textContent = v; d.onclick = () => { kp.sel = i; buildWheels(); };
      const dn = document.createElement('button'); dn.textContent = '▼'; dn.setAttribute('aria-label', `Digit ${i + 1} down`); dn.onclick = () => { kp.sel = i; kp.v[i] = (kp.v[i] + 9) % 10; A.click(); buildWheels(); };
      col.append(up, d, dn); w.appendChild(col);
    });
  }
  function buildNumpad() {
    const np = $('numpad'); if (!np) return; np.innerHTML = '';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].forEach(k => {
      const b = document.createElement('button'); b.textContent = k === 'del' ? '⌫' : k === 'ok' ? t('kp_try') : k; if (k === 'ok') b.className = 'ok'; if (k === 'del') b.className = 'del';
      b.setAttribute('aria-label', k === 'del' ? 'Back' : k === 'ok' ? 'Try code' : 'Digit ' + k);
      b.onclick = () => { if (k === 'ok') { tryCode(); return; } if (k === 'del') kp.sel = Math.max(0, kp.sel - 1); else { kp.v[kp.sel] = +k; kp.sel = Math.min(3, kp.sel + 1); } A.click(); haptic(8); buildWheels(); };
      np.appendChild(b);
    });
  }
  function openKeypad(mode) {
    kp.mode = mode || 'main'; if (kp.mode !== kp.lastMode) { kp.v = [0, 0, 0, 0]; kp.lastMode = kp.mode; }
    buildNumpad(); kp.sel = 0; buildWheels(); $('kpTitle').textContent = t(kp.mode === 'safe' ? 'kp_safe' : 'kp_title');
    $('kpMsg').textContent = t(kp.mode === 'safe' ? 'kp_safe_hint' : 'kp_hint'); $('keypad').hidden = false; openOverlay('keypad');
  }
  function keypadKey(e) {
    const k = e.key;
    if (/^[0-9]$/.test(k)) { kp.v[kp.sel] = +k; kp.sel = Math.min(3, kp.sel + 1); A.click(); buildWheels(); }
    else if (k === 'ArrowUp') { kp.v[kp.sel] = (kp.v[kp.sel] + 1) % 10; buildWheels(); }
    else if (k === 'ArrowDown') { kp.v[kp.sel] = (kp.v[kp.sel] + 9) % 10; buildWheels(); }
    else if (k === 'ArrowLeft' || k === 'Backspace') { kp.sel = Math.max(0, kp.sel - 1); buildWheels(); }
    else if (k === 'ArrowRight') { kp.sel = Math.min(3, kp.sel + 1); buildWheels(); }
    else if (k === 'Enter') tryCode();
    else if (k === 'Escape') closeOverlay();
    e.preventDefault();
  }
  function tryCode() {
    if (kp.mode === 'safe') {
      if (kp.v.join('') === String(G.run.years.valli)) { A.beep(true); closeOverlay(); openSafe(); }
      else { A.beep(false); haptic(120); $('kpMsg').textContent = t('kp_wrong'); kp.sel = 0; buildWheels(); A.clink(SAFE_P); E.hear(SAFE_P.x, SAFE_P.z, 5, 0); }
      return;
    }
    if (kp.v.join('') === G.run.code.join('')) {
      A.beep(true); A.unlock({ x: 12.3, y: 1.8, z: 19.8 }); haptic(60); const m = W.main; m.locks.num = false;
      m.num.position.set(12.4, 0.05, 19.65); m.num.rotation.set(0.3, 0.8, 1.57); later(0.3, () => A.clang({ x: 12.4, y: 0, z: 19.7 }, 0.6, 700));
      closeOverlay(); toast(t('t_num_open') + remaining(), 4);
    } else { A.beep(false); haptic(120); $('kpMsg').textContent = t('kp_wrong'); kp.sel = 0; buildWheels(); E.hear(12, 19.6, 5, 0); }
  }
  $('kpClose').onclick = closeOverlay;
  if ($('jClose')) $('jClose').onclick = closeOverlay;
  function openPause() { if (G.state !== 'play' || G.overlay) return; if (!(E.state === 'chase' || E.state === 'hidegrab' || P.hidden)) saveGame(); $('pTime').textContent = fmt(G.time); $('pause').hidden = false; G.overlay = 'pause'; for (const k in keys) keys[k] = false; A.ambient(false); A.musicDuck(true); updateClickHint(); }
  function resume() { A.init(); A.resume(); $('pause').hidden = true; G.overlay = null; A.ambient(true); A.musicDuck(false); requestLock(); updateClickHint(); }
  $('pResume').onclick = resume;
  $('pRestart').onclick = () => { $('pause').hidden = true; G.overlay = null; startGame(); };
  $('pMenu').onclick = () => { $('pause').hidden = true; G.overlay = null; toMenu(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { openPause(); A.suspend(); } else A.resume(); });

  /* ---------------- game flow ---------------- */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function newRun() {
    const rt = () => ({ h: 1 + Math.floor(Math.random() * 12), m: 5 * Math.floor(Math.random() * 12) }), clock = rt(); let start; do start = rt(); while (start.h === clock.h && Math.abs(start.m - clock.m) < 15);
    const yr = (a, b) => a + Math.floor(Math.random() * (b - a + 1)), th = yr(1904, 1912);
    const years = { thatha: th, paatti: th + yr(4, 8), son: yr(1936, 1946), valli: yr(1976, 1980) };
    let porOrder; do porOrder = shuffle(W.WHO.slice()); while (porOrder.every((w, i) => w === W.WHO[i]));
    const letters = [0, 0, 0].map(() => Math.floor(Math.random() * W.LETTERS.length)); if (letters.join() === '1,3,5') letters[0] = 0;
    let sack; do sack = yr(9, 30); while ((sack & (sack - 1)) === 0);
    return { code: [0, 0, 0, 0].map(() => Math.floor(Math.random() * 10)), order: shuffle(K.SYMBOLS.slice()), clock, clockStart: start, pallSyms: shuffle(K.SYMBOLS.slice()), years, porOrder, letters, sack };
  }
  function spawnPlayer() { Object.assign(P, { x: 9.4, z: 2.4, lv: 0, feet: 0, yaw: Math.PI, pitch: -0.25, vx: 0, vz: 0, crouch: false, hidden: false, hideSpot: null, stamina: 1, tired: false, wake: 1.6, y: 0.35 }); $('hideMask').className = ''; $('hideTxt').classList.remove('show'); document.body.classList.remove('hiding'); handGroup.visible = true; }
  const PAATTI_SPAWNS = [{ x: 12, z: 18.6, lv: 0 }, { x: 20.6, z: 10.6, lv: 0 }, { x: 4.5, z: 12.6, lv: 0 }, { x: 15.5, z: 17.4, lv: 0 }, { x: 12, z: -4.5, lv: 0 }];
  const WING_SPAWNS = [{ x: 33.5, z: 6.2, lv: 0 }, { x: 40.5, z: 13.8, lv: 1 }, { x: 30, z: 17.2, lv: 0 }];
  function startGame() {
    A.setHeart(0); { const d = $('menuDark'); if (d) d.style.opacity = 0; LB.dim = -1; }
    A.init(); A.resume(); A.setAmbience(G.amb); A.setMusic(G.mus); A.ambient(true); A.musicDuck(false); A.music('game');
    clearSave(); saveT = 25;
    G.run = newRun(); G.night = 1; G.found = {}; G.notes = new Set(); G.lampSeq = []; G.time = 0; G.flags = {}; G.timers = []; G.escT = 0; G.escFade = false;
    W.resetState(G.run); W.almirahHit.position.y = 1.0; W.almirahHit.updateMatrixWorld(); outside.visible = false; wellAnim = null; resetStory();
    setHeld(null); spawnPlayer(); lastRoom = null;
    E.active = !G.noEnemy; E.catchArmed = true; E.reset(1, DIFF[G.diffKey], PAATTI_SPAWNS[0]);
    $('menu').hidden = true; $('end').hidden = true; $('hud').hidden = false; renderLives();
    G.state = 'card';
    $('fade').style.transition = 'none'; $('fade').style.opacity = 1;
    showCard('இரவு 1', t('night', { n: 1 }), t('card_1'), 3.2, () => {
      G.state = 'play'; requestLock(); updateClickHint(); gongNight();
      later(2.5, () => toast(t('t_start'), 5));
    });
  }
  /* ---------------- save / continue: the house remembers where you were ---------------- */
  const SAVE_KEY = 'save1';
  let saveT = 25;
  function saveSoon() { saveT = Math.min(saveT, 1.5); }
  function saveTick(dt) { saveT -= dt; if (saveT > 0) return; if (E.state === 'chase' || E.state === 'hidegrab' || P.hidden || W.wing.motorOn) { saveT = 3; return; } saveT = 25; saveGame(); }
  function saveGame() {
    if (G.state !== 'play' && G.state !== 'card') return;
    try {
      const items = {}; for (const id in W.items) { const it = W.items[id], m = it.mesh, r = v => Math.round(v * 1000) / 1000; items[id] = [it.state, r(m.position.x), r(m.position.y), r(m.position.z), r(m.rotation.y)]; }
      const doors = {}; for (const id in W.doorById) { const d = W.doorById[id]; doors[id] = [d.locked ? 1 : 0, d.open ? 1 : 0]; }
      store.set(SAVE_KEY, { v: 1, diff: G.diffKey, night: G.night, time: Math.round(G.time), run: G.run, found: G.found, notes: [...G.notes], lampSeq: G.lampSeq, flags: G.flags,
        p: [Math.round(P.x * 100) / 100, Math.round(P.z * 100) / 100, P.lv, Math.round(P.yaw * 100) / 100], held: P.held, items, doors, world: W.snapshot(), at: Date.now() });
    } catch (e) { /* storage full or unavailable: keep playing */ }
  }
  function clearSave() { try { localStorage.removeItem('kolusu.' + SAVE_KEY); } catch (e) { /* storage unavailable */ } renderContinue(); }
  function renderContinue() {
    const b = $('btnContinue'); if (!b) return; const sv = store.get(SAVE_KEY, null);
    b.hidden = !(sv && sv.v === 1 && sv.run); if (b.hidden) return;
    $('contInfo').textContent = `${t('night', { n: sv.night })} · ${t('d_' + sv.diff)} · ${fmt(sv.time || 0)}`;
  }
  function continueGame() {
    const sv = store.get(SAVE_KEY, null); if (!sv || sv.v !== 1 || !sv.run) { startGame(); return; }
    A.setHeart(0); { const d = $('menuDark'); if (d) d.style.opacity = 0; LB.dim = -1; }
    A.init(); A.resume(); A.setAmbience(G.amb); A.setMusic(G.mus); A.ambient(true); A.musicDuck(false); A.music('game');
    G.diffKey = DIFF[sv.diff] ? sv.diff : 'normal'; setSeg('.diffSeg', 'd', G.diffKey);
    G.run = sv.run; G.night = sv.night || 1; G.found = sv.found || {}; G.notes = new Set(sv.notes || []); G.lampSeq = sv.lampSeq || []; G.time = sv.time || 0; G.flags = sv.flags || {}; G.timers = []; G.escT = 0; G.escFade = false;
    W.resetState(G.run); W.almirahHit.position.y = 1.0; W.almirahHit.updateMatrixWorld(); outside.visible = false; wellAnim = null; resetStory();
    setHeld(null); spawnPlayer(); lastRoom = null;
    W.restore(sv.world, sv.doors, sv.items, G.run);
    if (sv.held && W.items[sv.held]) { W.items[sv.held].hide('hand'); setHeld(sv.held); }
    if (sv.p) { P.x = sv.p[0]; P.z = sv.p[1]; P.lv = sv.p[2]; P.yaw = sv.p[3]; P.feet = W.ground(P.x, P.z, P.lv).y; }
    P.pitch = 0; P.wake = 0; P.y = 1.62;
    const far = PAATTI_SPAWNS.concat(G.flags.wingOpen ? WING_SPAWNS : []).slice().sort((a, b) => Math.hypot(b.x - P.x, b.z - P.z) - Math.hypot(a.x - P.x, a.z - P.z))[0];
    E.active = !G.noEnemy; E.catchArmed = true; E.reset(G.night, DIFF[G.diffKey], far);
    PH.next = G.time + 60;
    $('menu').hidden = true; $('end').hidden = true; $('hud').hidden = false; renderLives();
    G.state = 'card'; $('fade').style.transition = 'none'; $('fade').style.opacity = 1;
    showCard(`இரவு ${G.night}`, t('night', { n: G.night }), t('card_cont'), 2.6, () => { G.state = 'play'; requestLock(); updateClickHint(); gongNight(); later(2, () => toast(t('t_cont', { h: nextHint() }), 6)); });
  }
  if ($('btnContinue')) $('btnContinue').onclick = continueGame;
  window.addEventListener('pagehide', () => { if (G.state === 'play') saveGame(); });

  function useOosi(auto) {
    consume(); E.knockout(DIFF[G.diffKey].ko); G.flags.usedOosi = true;
    haptic(auto ? 320 : 140); A.whoosh({ x: E.pos.x, y: E.y + 1, z: E.pos.z }, 0.8); later(0.35, () => A.thud({ x: E.pos.x, y: E.y, z: E.pos.z }, 1));
    const fl = $('flash'); fl.style.background = '#3fd18f'; fl.style.transition = 'none'; fl.style.opacity = 0.35; requestAnimationFrame(() => { fl.style.transition = 'opacity .9s'; fl.style.opacity = 0; setTimeout(() => fl.style.background = '', 950); });
    toast(t(auto ? 't_oosi_auto' : 't_oosi_hit', { s: DIFF[G.diffKey].ko }), 4.5);
  }
  G.onWake = function (calm) { if (G.state === 'play') toast(t(calm ? 't_calm_end' : 't_wake'), 3.5); };
  function openMainDoor() {
    if (G.flags.doorOpen) return;
    G.flags.doorOpen = true; W.main.opening = true; W.mainSolid.on = false;
    A.bigDoor({ x: 12, y: 1.2, z: 20 }); haptic(100); E.hear(12, 19, 60, 0);
    toast(t('t_door_open'), 5);
  }
  let voiceSubT = 0;
  G.onVoice = function (key, dur) {
    const V = window.PAATTI_VOICE, el = $('voiceSub'); if (!V || !V[key] || !el || G.state !== 'play') return;
    el.textContent = V[key][K.lang === 'en' ? 'en' : 'ta']; el.classList.add('on');
    clearTimeout(voiceSubT); voiceSubT = setTimeout(() => el.classList.remove('on'), Math.max(2.5, dur - 1) * 1000);
  };
  G.onChase = function (on) { if (on) haptic(120); if (on && !G.flags.chaseTip) { G.flags.chaseTip = true; toast(t('t_chase'), 4); } };
  const headV = new THREE.Vector3();
  G.caught = function () {
    if (G.state !== 'play') return;
    if (P.held && W.typeOf(P.held) === 'oosi') { if (P.hidden) unhide(); useOosi(true); return; }
    G.state = 'caught'; G.caughtT = 0; E.catchArmed = false;
    if (G.overlay) { $(G.overlay).hidden = true; G.overlay = null; }
    if (P.hidden) unhide();
    if (P.held) dropHeld(false, { x: P.x, z: P.z });
    A.scream(); A.setChase(false); A.setHeart(0); haptic(450);
    const ang = Math.atan2(-(E.pos.x - P.x), -(E.pos.z - P.z));
    P.yaw = ang; P.pitch = 0;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    E.pos.x = P.x + fx * 0.62; E.pos.z = P.z + fz * 0.62; E.yaw = Math.atan2(-fx, -fz);
    E.model.position.set(E.pos.x, E.y, E.pos.z); E.model.rotation.set(0, E.yaw, 0);
    E.grabPose();
    const fl = $('flash'); fl.style.transition = 'none'; fl.style.opacity = 0.75; requestAnimationFrame(() => { fl.style.transition = 'opacity 1.2s'; fl.style.opacity = 0; });
    releaseLock();
  };
  function afterCaught() {
    if (G.night >= G.max) { gameOver(); return; }
    G.night++; renderLives(true);
    spawnPlayer(); setHeld(null);
    for (const d of W.doors) if (!d.locked && d.open && Math.random() < 0.5) d.setOpen(false, true);
    const sp = PAATTI_SPAWNS.concat(G.flags.wingOpen ? WING_SPAWNS : []);
    E.catchArmed = true; E.reset(G.night, DIFF[G.diffKey], sp[Math.floor(Math.random() * sp.length)]);
    G.state = 'card';
    PH.next = Math.max(PH.next, G.time + 55);
    showCard(`இரவு ${G.night}`, t('night', { n: G.night }), t('card_' + G.night), 3.8, () => { G.state = 'play'; requestLock(); updateClickHint(); gongNight(); saveGame(); }, G.night - 1);
  }
  function fmt(s) { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60, p2 = n => String(n).padStart(2, '0'); return h ? `${h}:${p2(m)}:${p2(x)}` : `${p2(m)}:${p2(x)}`; }
  K.fmtTime = fmt;
  function gameOver() {
    clearSave(); G.state = 'end'; $('hud').hidden = true; A.setChase(false); A.setHeart(0); A.ambient(false); A.music('end');
    $('endLamps').innerHTML = diyas(G.max, G.max);
    $('endEyebrow').textContent = t('lose_eyebrow'); $('endTitle').textContent = t('lose_title'); $('endText').textContent = t('lose_text');
    $('endStats').innerHTML = `<span>${t('st_locks')}</span><b>${4 - Object.values(W.main.locks).filter(Boolean).length} / 4</b><span>${t('st_digits')}</span><b>${Object.keys(G.found).length} / 4</b><span>${t('st_time')}</span><b>${fmt(G.time)}</b>`;
    $('fade').style.transition = 'opacity .8s'; $('fade').style.opacity = 0.6; $('end').hidden = false;
  }
  function escape() {
    if (G.state !== 'play') return;
    G.state = 'escape'; G.escT = 0; A.setChase(false); A.setHeart(0); E.active = false; haptic(100);
    P.pitch = 0.05; releaseLock(); $('hud').hidden = true;
  }
  function winScreen() {
    clearSave(); G.state = 'end'; A.ambient(false); A.music('end');
    const key = 'best_' + G.diffKey, best = store.get(key, null), isBest = best === null || G.time < best;
    if (isBest) store.set(key, G.time);
    $('endLamps').innerHTML = diyas(G.night - 1, 0);
    $('endEyebrow').textContent = t('win_eyebrow', { n: G.night, d: t('d_' + G.diffKey) });
    const tr = !!G.flags.kolusuHome; $('endTitle').textContent = t(tr ? 'win_true_title' : 'win_title'); $('endText').textContent = t(tr ? 'win_true_text' : 'win_text') + (tr ? '' : ' ' + t('win_hint_true'));
    if (tr) $('endEyebrow').textContent = t('true_end') + ' · ' + $('endEyebrow').textContent;
    $('endStats').innerHTML = `<span>${t('st_time')}</span><b>${fmt(G.time)}${isBest ? t('new_best') : ''}</b><span>${t('st_nights')}</span><b>${G.night} / ${G.max}</b><span>${t('st_diff')}</span><b>${t('d_' + G.diffKey)}</b>`;
    $('end').hidden = false; renderBest();
  }
  function toMenu() {
    G.state = 'menu'; releaseLock(); $('hud').hidden = true; $('end').hidden = true; $('menu').hidden = false; showMenuPanel('menuMain');
    $('fade').style.transition = 'opacity 1s'; $('fade').style.opacity = 0; A.setChase(false); A.setHeart(0); outside.visible = false; A.ambient(false); A.musicDuck(false); A.music('menu');
    W.main.opening = false; W.main.open = 0; E.active = true; menuPose(); updateClickHint(); renderContinue();
  }
  $('endAgain').onclick = startGame; $('endMenu').onclick = toMenu;

  /* ---------------- menus, language, settings ---------------- */
  function showMenuPanel(id) {
    for (const p of ['menuMain', 'menuHow', 'menuSettings', 'menuCredits']) { const el = $(p); if (el) el.hidden = p !== id; }
    const m = $('menu'); if (id === 'menuMain') delete m.dataset.panel; else m.dataset.panel = id;
    requestAnimationFrame(markScrolls);
  }
  /* long panels: a fade at the bottom says there is more below; it goes when you reach the end */
  function markScroll(el) { if (!el || !el.classList) return; const more = el.scrollHeight - el.clientHeight - el.scrollTop > 6; el.classList.toggle('more', more); }
  function markScrolls() { document.querySelectorAll('.panel, .paper, .scrolly').forEach(markScroll); }
  document.addEventListener('scroll', e => markScroll(e.target), true);
  window.addEventListener('resize', () => requestAnimationFrame(markScrolls));
  /* on-screen controls: size, see-through, which hand */
  const CTL0 = { b: 1, j: 1, a: 1, hand: 'r', cs: 1 };
  G.ctl = Object.assign({}, CTL0, store.get('ctl', {}));
  function applyCtl() {
    const r = document.documentElement.style, c = G.ctl;
    r.setProperty('--ctlB', c.b); r.setProperty('--ctlJ', c.j); r.setProperty('--ctlA', c.a);
    document.body.classList.toggle('lefty', c.hand === 'l');
    [['ctlBtn', 'b'], ['ctlJoy', 'j'], ['ctlAlpha', 'a'], ['ctlCam', 'cs']].forEach(([id, k]) => { const el = $(id); if (el) el.value = c[k]; });
    setSeg('.camSeg', 'cam', G.autoCam); const cr = $('ctlCamRow'); if (cr) cr.classList.toggle('off', G.autoCam !== 'on');
    document.querySelectorAll('.handSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hand === c.hand)));
  }
  [['ctlBtn', 'b'], ['ctlJoy', 'j'], ['ctlAlpha', 'a'], ['ctlCam', 'cs']].forEach(([id, k]) => { const el = $(id); if (el) el.oninput = () => { G.ctl[k] = +el.value; store.set('ctl', G.ctl); applyCtl(); }; });
  document.querySelectorAll('.handSeg button').forEach(b => b.onclick = () => { G.ctl.hand = b.dataset.hand; store.set('ctl', G.ctl); applyCtl(); A.click(); });
  let ctlFrom = null;
  function openCtl() {
    ctlFrom = G.overlay === 'pause' ? 'pause' : G.state === 'menu' ? 'menu' : null;
    if (ctlFrom === 'pause') { $('pause').hidden = true; G.overlay = null; }
    if (ctlFrom === 'menu') { $('menu').hidden = true; $('hud').hidden = false; }
    document.body.classList.add('ctlPreview'); applyCtl(); $('ctlPad').hidden = false; G.overlay = 'ctlPad'; A.click();
  }
  function closeCtl() {
    $('ctlPad').hidden = true; G.overlay = null; document.body.classList.remove('ctlPreview');
    if (ctlFrom === 'menu') { $('hud').hidden = true; $('menu').hidden = false; }
    else if (ctlFrom === 'pause') { G.overlay = null; openPause(); }
    ctlFrom = null;
  }
  document.querySelectorAll('.ctlOpen').forEach(b => b.onclick = openCtl);
  $('ctlDone').onclick = closeCtl;
  $('ctlReset').onclick = () => { G.ctl = Object.assign({}, CTL0); store.set('ctl', G.ctl); applyCtl(); A.click(); };
  document.querySelectorAll('.camSeg button').forEach(b => b.onclick = () => { G.autoCam = b.dataset.cam; store.set('autocam', G.autoCam); applyCtl(); A.click(); });
  $('btnPlay').onclick = startGame;
  $('btnHow').onclick = () => showMenuPanel('menuHow');
  $('btnSettings').onclick = () => showMenuPanel('menuSettings');
  if ($('btnCredits')) $('btnCredits').onclick = () => showMenuPanel('menuCredits');
  if ($('credBack')) $('credBack').onclick = () => showMenuPanel('menuSettings');
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => showMenuPanel('menuMain'));
  if (native && native.exit) { $('btnQuit').hidden = false; $('btnQuit').onclick = () => native.exit(); }
  else if (isDesktopApp) { $('btnQuit').hidden = false; $('btnQuit').onclick = () => window.close(); }
  function setSeg(sel, attr, val) { document.querySelectorAll(`${sel} button`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val))); }
  document.querySelectorAll('.diffSeg button').forEach(b => b.onclick = () => { G.diffKey = b.dataset.d; store.set('diff', G.diffKey); setSeg('.diffSeg', 'd', G.diffKey); renderBest(); });
  document.querySelectorAll('.gfxSeg button').forEach(b => b.onclick = () => { G.quality = b.dataset.q; store.set('gfx2', G.quality); setSeg('.gfxSeg', 'q', G.quality); applyQuality(); });
  document.querySelectorAll('.hapSeg button').forEach(b => b.onclick = () => { G.haptics = b.dataset.h; store.set('haptics', G.haptics); setSeg('.hapSeg', 'h', G.haptics); haptic(30); });
  document.querySelectorAll('.langSeg button').forEach(b => b.onclick = () => K.setLang(b.dataset.l));
  applyCtl();
  function bindRange(ids, key, apply) { ids.forEach(id => { const el = $(id); if (!el) return; el.value = G[key]; el.oninput = () => { G[key] = +el.value; store.set(key, G[key]); ids.forEach(o => { if (o !== id && $(o)) $(o).value = el.value; }); apply && apply(); }; }); }
  bindRange(['sens', 'sens2'], 'sens'); bindRange(['vol', 'vol2'], 'vol', () => A.setVolume(G.vol)); bindRange(['amb', 'amb2'], 'amb', () => A.setAmbience(G.amb)); bindRange(['mus', 'mus2'], 'mus', () => A.setMusic(G.mus));
  function renderBest() { const b = store.get('best_' + G.diffKey, null); $('bestTime').textContent = b === null ? '' : t('best', { d: t('d_' + G.diffKey), t: fmt(b) }); }
  K.onLang = function (l) {
    setSeg('.langSeg', 'l', l); renderBest(); renderContinue(); renderHeld(); renderLives(); lastRoom = null; hud.prompt = null; chip.lv = chip.obj = ''; chip.ko = -1; if (G.state === 'play') updateChips();
    if ($('numpad') && $('numpad').childElementCount) buildNumpad();
    if (G.overlay === 'journal') { $('journal').hidden = true; G.overlay = null; openJournal(); }
    if (G.overlay === 'mapPad') { const h = $('mapHint'); if (h) h.dataset.h = ''; }
    if ($('objChip') && G.state === 'play') updateChips();
  };
  function menuPose() { LB.stage = 0; LB.next = 6; LB.flick = 0; LB.scare = 0; LB.post = 0; LB.intro = 2.2; E.pos.set(LSTAGES[0][0], 0, LSTAGES[0][1]); E.yaw = 0; E.state = 'wait'; K.Valli && K.Valli.hide(); }
  /* ---------------- the lobby: you stand in the black front hall. Far off, a lantern. Each time the light dies she is closer;
     when she is close enough the light dies once more, and her face is in yours. Then the dark, the heartbeat, and she is far again. ---------------- */
  const CAMZ = 18.45, CAMX = 11.95;
  const LSTAGES = [[12.95, 11.8], [12.8, 13.6], [12.62, 15.1], [12.48, 16.3], [12.36, 17.15]];
  const LB = { stage: 0, next: 6, flick: 0, dim: -1, look: new THREE.Vector3(12.3, 1.3, 12), wT: 9, gT: 0, ex: 0.85, vT: 14, scare: 0, post: 0, intro: 2.2, vallT: 0 };
  G._lobby = LB; // for tests
  const LWH = { ta: ['வள்ளி...', 'ஜல்... ஜல்...', 'யார் அங்கே?', 'போகாதே...', 'என் கொலுசு எங்கே?', 'பாப்பா...', 'திரும்பிப் பார்க்காதே...'], en: ['Valli...', 'jhal... jhal...', "Who's there?", "Don't go...", 'Where is my anklet?', 'Little one...', "Don't look back..."] };
  function lobby(dt) {
    const last = LSTAGES.length - 1, sh = LB.scare > 0 ? 0.02 : 0;
    // a camera held by someone standing very still in the hall, breathing
    camera.position.set(CAMX + Math.sin(menuT * 0.11) * 0.05 + (Math.random() - 0.5) * sh, 1.52 + Math.sin(menuT * 0.37) * 0.015 + (Math.random() - 0.5) * sh, CAMZ);
    let dim = 0;
    if (LB.scare > 0) { // her face, here
      LB.scare -= dt; E.pos.set(CAMX + 0.22, 0, CAMZ - 0.62);
      LB.look.set(CAMX + 0.15, 1.42, CAMZ - 0.62); camera.lookAt(LB.look);
      if (LB.scare <= 0) { LB.post = 1.5; A.setHeart(0.85); }
    } else {
      if (LB.post > 0) { // after: black, and a heartbeat
        LB.post -= dt; dim = 1;
        if (LB.post <= 0) { LB.stage = 0; LB.next = 6 + Math.random() * 3; A.setHeart(0); LB.vallT = 2.6;
          if (K.Valli && K.Valli.ready) { K.Valli.show(11.15, 0, 11.4, camera.position); K.Valli.setOpacity(0.9); A.anklet({ x: 11.15, y: 0.2, z: 11.4 }, 0.5); } }
      }
      const st = LSTAGES[LB.stage]; E.pos.set(st[0], 0, st[1]);
      LB.look.lerp(new THREE.Vector3(CAMX + (st[0] - CAMX) * 0.3, 1.3, st[1]), Math.min(1, dt * 2)); camera.lookAt(LB.look);
      if (LB.post <= 0) {
        if (LB.flick > 0) {
          LB.flick -= dt; dim = 1;
          if (LB.flick <= 0) {
            if (LB.stage === last) { // the face
              LB.scare = 0.55; E.grabPose(); A.sting(); haptic(60);
              const t = $('menuTitle'); if (t) { t.classList.add('glitch'); setTimeout(() => t.classList.remove('glitch'), 380); }
            } else {
              LB.stage++; const p = LSTAGES[LB.stage]; A.anklet({ x: p[0], y: 0.2, z: p[1] }, LB.stage >= last - 1 ? 1.1 : 0.7);
              if (LB.stage === last) { later(0.3, () => A.whisper({ x: camera.position.x + 0.5, y: 1.6, z: camera.position.z - 0.4 })); haptic(25); }
              LB.next = LB.stage === last ? 3.2 : 4.2 + Math.random() * 3;
              A.setHeart(LB.stage >= last - 1 ? 0.3 + (LB.stage - last + 1) * 0.3 : 0);
            }
          }
        } else {
          LB.next -= dt;
          if (LB.next <= 0) { LB.flick = LB.stage === last ? 0.6 : 0.16 + Math.random() * 0.18; const t = $('menuTitle'); if (t && Math.random() < 0.6) { t.classList.add('glitch'); setTimeout(() => t.classList.remove('glitch'), 160); } }
          else if (Math.random() < dt * 0.7) dim = 0.3 + Math.random() * 0.4; // the light stutters
        }
      }
    }
    if (LB.intro > 0) { LB.intro -= dt; dim = Math.max(dim, Math.min(1, LB.intro / 1.2)); } // the menu opens on black; the lantern comes up out of it
    if (LB.vallT > 0) { LB.vallT -= dt; if (K.Valli) { K.Valli.update(dt, camera.position); K.Valli.setOpacity(Math.min(0.9, LB.vallT * 1.2) * (Math.random() < 0.06 ? 0.2 : 1)); if (LB.vallT <= 0) K.Valli.hide(); } }
    // the dark is the scene going black, not a curtain over it: only her eyes stay lit
    if (dim !== LB.dim) { LB.dim = dim; LB.ex = 0.85 * (1 - dim * 0.985); const d = $('menuDark'); if (d) d.style.opacity = dim >= 1 ? 0.3 : 0; }
    // and sometimes, out of the dark, she speaks
    LB.vT -= dt;
    if (LB.vT <= 0) { LB.vT = 22 + Math.random() * 20; const keys = ['anyone', 'come', 'valli', 'hiding', 'seeyou']; if (!$('menu').hidden && LB.scare <= 0) A.voice && A.voice(keys[Math.floor(Math.random() * keys.length)], { x: E.pos.x, y: 1.4, z: E.pos.z }, 0.9); }
    // words in the dark
    LB.wT -= dt;
    if (LB.wT <= 0) {
      LB.wT = 7 + Math.random() * 7; const w = $('menuWhisper');
      if (w && !$('menu').hidden) {
        const list = LWH[K.lang === 'en' ? 'en' : 'ta']; w.textContent = list[Math.floor(Math.random() * list.length)];
        w.style.transition = 'none'; w.style.left = (40 + Math.random() * 45) + 'vw'; w.style.top = (10 + Math.random() * 70) + 'vh'; w.style.transform = `rotate(${(Math.random() - 0.5) * 14}deg)`;
        void w.offsetWidth; w.style.transition = ''; w.classList.add('on'); w.style.transform += ' translateY(-14px)';
        setTimeout(() => w.classList.remove('on'), 2600);
      }
    }
  }
  // film grain for the lobby, made once
  (function () { const g = $('menuGrain'); if (!g) return; const c = document.createElement('canvas'); c.width = c.height = 180; const x = c.getContext('2d'), d = x.createImageData(180, 180); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } x.putImageData(d, 0, 0); g.style.backgroundImage = `url(${c.toDataURL()})`; })();

  /* ---------------- touch / native API ---------------- */
  // every button, tab, toggle and slider answers with a sound (the big ones a heavier one)
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('button, [role="tab"], .lm, .jitem, .pgb, input[type="range"], .mapOpen, #mapCanvas');
    if (!b || b.disabled) return;
    if (!A.ctxReady || !A.ctxReady()) { try { A.init(); } catch (x) { /* audio starts on the first touch */ } }
    A.ui(b.matches('#btnPlay, #btnContinue, #pResume, .primary, .lm.main, #ctlDone'));
  }, true);
  window.addEventListener('keydown', e => { if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement && document.activeElement.matches && document.activeElement.matches('button')) A.ui(false); }, true);
  G.look = function (dx, dy) {
    if (G.state !== 'play' || G.overlay) return;
    const s = 0.0046 * G.sens; if (dx || dy) G.lookT = performance.now();
    P.yaw -= dx * s; P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch - dy * s));
    if (P.hidden) { const sp = P.hideSpot.cam; let d = P.yaw - sp.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; P.yaw = sp.yaw + Math.max(-0.7, Math.min(0.7, d)); P.pitch = Math.max(-0.4, Math.min(0.4, P.pitch)); }
  };
  G.act = () => { if (G.state === 'play' && !G.overlay) interact(); };
  G.drop = () => { if (G.state === 'play' && P.held && !P.hidden) dropHeld(true); };
  G.toggleTorch = () => { if (G.state !== 'play') return; P.torch = !P.torch; A.click(); haptic(10); };
  G.toggleCrouch = () => { if (G.state !== 'play' || P.hidden) return; P.crouch = !P.crouch; haptic(10); };
  G.journal = () => { if (G.state === 'play' && !G.overlay) openJournal(); };
  G.pause = () => { if (G.state === 'play' && !G.overlay) openPause(); };
  if ($('objChip')) $('objChip').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); G.journal(); });
  window.kolusuBack = function () {
    if (G.overlay === 'pause') { resume(); return 'handled'; }
    if (G.overlay) { closeOverlay(); return 'handled'; }
    if (G.state === 'play') { openPause(); return 'handled'; }
    if (G.state === 'end') { toMenu(); return 'handled'; }
    if (G.state === 'menu') { if ($('menuMain').hidden) { showMenuPanel('menuMain'); return 'handled'; } return 'exit'; }
    return 'handled';
  };
  window.kolusuPause = function () { if (G.state === 'play' && !G.overlay) openPause(); A.suspend(); };
  window.kolusuResume = function () { A.resume(); };

  /* ---------------- weather ---------------- */
  let boltT = 8, flashT = 0, flashOn = -1;
  function roofed(x, z, lv) {
    if (lv <= 0 && x > 0 && x < 24 && z > 0 && z < 20 && !(x > 9 && x < 15 && z > 8 && z < 12)) return true;
    if (x > 23.9 && x < 46.1 && z > -0.1 && z < 20.1 && !(x > 31 && x < 39 && z > 7.5 && z < 12.5)) return true; // the wing, both floors
    if (lv === 1 && x > 0.4 && x < 5 && z > 15 && z < 19.6) return true;
    if (lv <= 0 && x > 14.3 && x < 22.7 && z > -10 && z < -6) return true;
    return x < -0.3 || x > 46.3 || z < -10.3;
  }
  function updateWeather(dt) {
    const pa = rainGeo.attributes.position.array, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, clv = G.state === 'menu' ? 0 : P.lv;
    const inHouse = clv <= 0 && cx > 0 && cx < 24 && cz > 0 && cz < 20, inWing = clv >= 0 && cx > 24 && cx < 46 && cz > 0 && cz < 20;
    for (let i = 0; i < RAIN; i++) {
      const o = i * 6; let y = pa[o + 1] - rainV[i] * dt;
      const fx = pa[o], fz = pa[o + 2], floorY = (clv === 1 && fx > 0 && fx < 24 && fz > -1.5 && fz < 20) ? 4.0 : clv < 0 ? -3 : 0;
      if (y < floorY) {
        let x = cx + (Math.random() - 0.5) * 18, z = cz + (Math.random() - 0.5) * 18;
        if (inWing) { if (roofed(x, z, clv)) { x = 31 + Math.random() * 8; z = 7.5 + Math.random() * 5; } }
        else if (inHouse || roofed(x, z, clv)) { x = 9 + Math.random() * 6; z = 8 + Math.random() * 4; if (!inHouse && clv !== 0) { y = -100; pa[o + 1] = pa[o + 4] = y; continue; } }
        y = Math.max(cy, 0) + 3 + Math.random() * 5; pa[o] = pa[o + 3] = x; pa[o + 2] = pa[o + 5] = z;
      }
      pa[o + 1] = y; pa[o + 4] = y + 0.28;
    }
    rainGeo.attributes.position.needsUpdate = true;
    boltT -= dt;
    if (boltT <= 0) { boltT = 38 + Math.random() * 40; flashT = 0.5; setTimeout(() => A.thunder(), 700 + Math.random() * 1500); }
    let on = 0;
    if (flashT > 0) { flashT -= dt; on = (flashT > 0.38 || (flashT > 0.12 && flashT < 0.24)) ? 1 : 0; }
    if (on !== flashOn) { flashOn = on; for (const m of W.windows) m.color.setHex(on ? 0x9aaed8 : 0x0b1222); }
    G.flash = on;
  }

  /* ---------------- adaptive resolution: keep frame time near 16–20 ms ---------------- */
  const perf = { acc: 0, n: 0, warm: 0 };
  function adapt() { /* graphics stay on High: no automatic lowering of quality or resolution */ }

  /* ---------------- main loop ---------------- */
  let last = performance.now(), menuT = 0, frameN = 0, tickT = 0, chipT = 0;
  const LV_ICON = { basement: 'cave', ground: 'home', terrace: 'night', outside: 'tree' };
  function hintPad() {
    const F = G.flags;
    if (!F.guestOpen) { if (!F.clockOk) return t(G.notes.has('clock') ? 'h_clock_set' : 'h_clock_find'); return t(F.got_smallkey ? 'h_guest' : 'h_clock_key'); }
    return G.notes.has('well') ? t(W.well.used ? 'h_pad_got' : 'h_pad_well') : t('h_well_short');
  }
  function hintNum() { return t(!G.found[1] && G.flags.pallSeen ? 'h_pall' : 'h_num', { n: Object.keys(G.found).length }); }
  function hintBar() {
    const F = G.flags;
    if (F.got_bigkey) return t('h_bar_got');
    if (!F.wingOpen) return t(F.got_wingkey ? 'h_wing_key' : F.pallOk ? 'h_wing_drawer' : F.wingSeen ? 'h_wing_pall' : 'h_wing_find');
    if (F.safeOpen) return t('h_bar_safe');
    if (!G.notes.has('ledger')) return t('h_ledger');
    if (!WG.safeKnob) return t(F.got_safeknob ? 'h_knob' : F.scaleOk ? 'h_knob_take' : G.notes.has('chart') ? 'h_scale' : 'h_chart');
    return t(F.porSeen || G.notes.has('portraits') ? 'h_safe_year' : 'h_safe');
  }
  function hintKolusu() {
    const F = G.flags, n = F.kolusuN || 0;
    if (F.kolusuHome) return '';
    if (!F.got_kolusu) return t('h_kolusu_find');
    if (n === 0 || F.got_kolusu2) return t('h_kolusu_cradle');
    if (WG.tankFull) return t('h_k2_box');
    if (WG.power) return t('h_k2_motor');
    if (WG.fuses >= 3) return t('h_k2_lever');
    if (!F.wingOpen) return t('h_k2_wing');
    return t('h_k2_fuses', { n: WG.fuses });
  }
  function nextHint() {
    const L = W.main.locks, F = G.flags;
    if (F.doorOpen) return t('h_gate');
    if (L.bar && F.wingOpen && P.x > 24) return hintBar(); // inside the second wing: its own next step first
    if (L.pad) return hintPad();
    if (L.chain) return t(F.got_boltcutter ? 'h_ch_got' : F.got_almirahkey ? 'h_ch_key' : F.poojaOpen ? 'h_ch_pooja' : G.notes.has('lamps') ? 'h_ch_lamps' : 'h_ch_study');
    if (L.num) return hintNum();
    return hintBar();
  }
  const chip = { lv: '', obj: '', ko: -1, plv: null, t: -1 };
  function updateChips() {
    const key = P.lv < 0 ? 'basement' : P.lv > 0 ? 'terrace' : W.isOutside(P.x, P.z, 0) && !(P.x > 9 && P.x < 15 && P.z > 8 && P.z < 12) ? 'outside' : 'ground';
    const room = W.roomAt(P.x, P.z, P.lv), label = room ? room.name : t('lv_' + key);
    const lk = key + label; if (lk !== chip.lv && $('lvChip')) { const moved = chip.lv !== ''; chip.lv = lk; const el = $('lvChip'); el.innerHTML = K.icon(LV_ICON[key]) + `<span>${label}</span>`; if (moved) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }
    const ts = Math.floor(G.time); if (ts !== chip.t && $('timeText')) { chip.t = ts; $('timeText').textContent = fmt(ts); }
    const ob = nextHint(); if (ob !== chip.obj && $('objText')) { chip.obj = ob; $('objText').innerHTML = ob; $('objChip').classList.remove('flash'); void $('objChip').offsetWidth; $('objChip').classList.add('flash'); }
    const ko = Math.ceil(E.koLeft()); if (ko !== chip.ko && $('koChip')) { chip.ko = ko; $('koChip').hidden = ko <= 0; $('koChip').classList.toggle('calm', !!E.calm); if (ko > 0) $('koChip').innerHTML = K.icon(E.calm ? 'ghost' : 'syringe') + `<span>${t(E.calm ? 'ko_calm' : 'ko_chip', { s: ko })}</span>`; }
  }
  G.nextHint = nextHint;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawMs = now - last; last = now;
    const dt = Math.min(0.05, rawMs / 1000); frameN++;
    adapt(rawMs);
    for (let i = G.timers.length - 1; i >= 0; i--) { const tm = G.timers[i]; tm.t -= dt; if (tm.t <= 0) { G.timers.splice(i, 1); tm.fn(); } }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }
    if (roomTimer > 0) { roomTimer -= dt; if (roomTimer <= 0) $('roomLbl').classList.remove('show'); }
    const tsec = now / 1000;
    W.update(dt, tsec); updateWeather(dt); A.update();
    if (G.state === 'menu') {
      menuT += dt; lobby(dt);
      E.model.visible = true; E.model.position.set(E.pos.x, 0, E.pos.z); E.model.rotation.set(0, Math.atan2(camera.position.x - E.pos.x, camera.position.z - E.pos.z), 0);
      if (LB.scare > 0) { E.t += dt; E.tickModel(dt, 1.52, camera.position); } else E.idleAnim(dt);
      torch.intensity = 0; K.listenerPos = camera.position;
      if (LB.scare <= 0) { const u = E.model.userData, near = LB.stage >= LSTAGES.length - 2; if (u.eyes) for (const e of u.eyes) { e.material.color.setHex(near ? 0xff2a1a : 0xdfe8e4); e.material.opacity = LB.dim >= 1 ? 1 : near ? 0.9 : 0.6; const k = near ? 0.045 : 0.034; e.scale.set(k, k, 1); } }
      camera.getWorldDirection(fwdV); A.listener(camera.position, fwdV);
    } else if (G.state === 'play') {
      if (G.overlay !== 'pause') G.time += dt;
      if (!G.overlay) {
        updatePlayer(dt); updateWell(dt);
        E.update(dt);
        if (frameN % 2 === 0) findTarget();
        let pr = target ? promptFor(target) : '';
        if (!MOBILE && pr && pr.indexOf('class="no"') < 0) pr = '<kbd>E</kbd>' + pr;
        if (pr !== hud.prompt) { $('prompt').innerHTML = pr; hud.prompt = pr; }
        if (!!target !== hud.cross) { hud.cross = !!target; $('cross').classList.toggle('on', !!target); }
        const dg = (E.state === 'chase' || E.state === 'hidegrab') ? Math.round((0.6 + Math.sin(tsec * 8) * 0.25) * 20) / 20 : 0;
        if (dg !== hud.danger) { hud.danger = dg; $('danger').style.opacity = dg; }
        tickT += dt; if (tickT > 1) { tickT = 0; if (P.lv === 0 && W.clock.running) A.tick(W.clockPos, Math.random() < 0.5); }
        phoneTick(dt); suspense(dt); radioTick(dt); saveTick(dt);
        chipT -= dt; if (chipT <= 0 || P.lv !== chip.plv) { chipT = 0.25; chip.plv = P.lv; updateChips(); }
      }
      placeCamera();
    } else if (G.state === 'card') {
      placeCamera(); E.idleAnim(dt);
    } else if (G.state === 'caught') {
      G.caughtT += dt;
      const sh = Math.max(0, 1 - G.caughtT / 1.2) * 0.05;
      E.tickModel(dt, P.y, camera.position);
      placeCamera(); torch.intensity = P.torch && Math.random() < 0.25 ? TORCH_I : 0; camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
      E.headPos(headV); camera.lookAt(headV);
      if (G.caughtT > 1.0 && !G.caughtFaded) { G.caughtFaded = true; $('fade').style.transition = 'opacity .9s'; $('fade').style.opacity = 1; }
      if (G.caughtT > 2.1) { G.caughtFaded = false; afterCaught(); }
    } else if (G.state === 'escape') {
      G.escT += dt;
      P.z = Math.min(32, P.z + dt * 1.8); P.x += (12 - P.x) * Math.min(1, dt * 2);
      let dy = Math.PI - P.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; P.yaw += dy * Math.min(1, dt * 3);
      placeCamera();
      const fade = $('fade');
      if (G.escT > 1.4 && !G.escFade) { G.escFade = true; fade.style.background = '#cdd6e6'; fade.style.transition = 'opacity 1.6s'; fade.style.opacity = 1; }
      if (G.escT > 3.2) { G.escFade = false; fade.style.background = '#000'; fade.style.transition = 'opacity .6s'; fade.style.opacity = 0.55; winScreen(); }
    } else if (G.state === 'end') placeCamera();
    const ex = G.state === 'menu' ? LB.ex : G.state === 'play' && P.hidden ? 1.95 : 1.32; if (G.state === 'menu') renderer.toneMappingExposure = ex; else if (Math.abs(renderer.toneMappingExposure - ex) > 0.005) renderer.toneMappingExposure += (ex - renderer.toneMappingExposure) * Math.min(1, dt * 3);
    renderFrame(tsec);
  }
  const plPos = new THREE.Vector3(), rst = { torch: { obj: torch, target: torchTarget, on: false, intensity: 0, color: torch.color, range: 22, angle: 0.48, penumbra: 0.55 }, pl: { pos: plPos, on: false, intensity: 0, range: 6.5 }, flash: 0, fog: scene.fog };
  let hemiT = 0;
  function renderFrame(tsec) {
    const ts = rst.torch; ts.on = torch.intensity > 0; ts.intensity = torch.intensity;
    const u = E.model && E.model.userData, lt = u && u.light;
    rst.pl.on = !!(lt && lt.intensity > 0 && (E.active || G.state === 'menu')); if (rst.pl.on) { lt.getWorldPosition(plPos); rst.pl.intensity = lt.intensity * 0.9; }
    rst.flash = G.flash || 0;
    K.R.cull(camera); K.R.frame(tsec, rst); K.R.setHandProbe(camera.position.x, camera.position.y - 0.3, camera.position.z);
    if ((hemiT -= 1) <= 0) { hemiT = 10; const pr = K.R.probeAt(camera.position.x, camera.position.y, camera.position.z); const k = 1.6; hemi.color.setRGB(pr.r * k + 0.01, pr.g * k + 0.01, pr.b * k + 0.015); hemi.groundColor.setRGB(pr.r * k * 0.6, pr.g * k * 0.55, pr.b * k * 0.5); hemi.intensity = 1; }
    if (rst.flash) hemi.intensity = 2.2;
    renderer.render(scene, camera);
  }
  /* ---------------- boot: build in steps behind the loading screen ---------------- */
  /* a small warm room rendered into a prefiltered cube: gives brass, copper and glass something to reflect */
  function makeEnv() {
    try {
      const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene();
      s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), new THREE.MeshBasicMaterial({ color: 0x1b120c, side: THREE.BackSide })));
      const panel = (w, h, col, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; s.add(m); };
      panel(2.4, 1.6, 0xb07a40, 0, 1.0, -5.9, 0); panel(1.4, 2.2, 0x6a5038, 5.9, 0.6, 1, Math.PI / 2); panel(1.6, 1.0, 0x3a4660, -5.9, 1.4, -2, Math.PI / 2);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0x3a1a10 })); fl.rotation.x = -Math.PI / 2; fl.position.y = -2.4; s.add(fl);
      const t = pm.fromScene(s, 0.04).texture; pm.dispose(); return t;
    } catch (e) { return null; }
  }
  function setLoad(p) { const b = $('loadBar'); if (b) b.style.transform = `scaleX(${p / 100})`; }
  async function boot() {
    K.applyI18n(); document.documentElement.dataset.lang = K.lang;
    setSeg('.langSeg', 'l', K.lang); setSeg('.diffSeg', 'd', G.diffKey); setSeg('.gfxSeg', 'q', G.quality); setSeg('.hapSeg', 'h', G.haptics); setSeg('.camSeg', 'cam', G.autoCam); renderBest();
    renderContinue(); setLoad(8); await nextFrame();
    K.texScale = G.quality === 'high' ? 1.5 : G.quality === 'medium' ? 1.25 : 1;
    K.envMap = makeEnv(); setLoad(14); await nextFrame();
    if (K.Yard) { await K.Yard.load(); setLoad(18); await nextFrame(); } // library models for the yards, before the house is built
    const bt = [performance.now()], mark = () => bt.push(performance.now());
    W.build(scene); mark(); setLoad(40); await nextFrame();
    N.build(); mark(); setLoad(48); await nextFrame();
    { const t0 = performance.now(); G.run = newRun(); W.resetState(G.run); K.R.stats.resetMs = Math.round(performance.now() - t0); }
    W.compile(); mark(); setLoad(70); await nextFrame();
    await E.build(scene); K.R.track(E.model); if (K.Valli) await K.Valli.build(scene); mark(); setLoad(80); await nextFrame();
    mark(); K.R.finishTextures(); mark(); menuPose(); applyQuality(); setLoad(88); await nextFrame();
    // upload every buffer and texture and link every shader now, so nothing stalls mid-game
    camera.position.set(12, 1.6, 10); K.R.warmup();
    { const u = E.model.userData, mt = W.mirrorTex(); for (const tx of [u.screamTex, u.faceTex, mt.base, mt.msg].concat(u.texList || [], K.Valli ? K.Valli.textures() : [])) if (tx && renderer.initTexture) renderer.initTexture(tx); }
    mark();
    K.R.stats.boot = { build: bt[1] - bt[0], nav: bt[2] - bt[1], compile: bt[3] - bt[2], paatti: bt[4] - bt[3], wait: bt[5] - bt[4], arrays: bt[6] - bt[5], warm: bt[7] - bt[6] }; for (const k in K.R.stats.boot) K.R.stats.boot[k] = Math.round(K.R.stats.boot[k]);
    K.LampFX.init(); useLampImages(); renderLives();
    setLoad(100); await nextFrame();
    G.state = 'menu';
    const sp = $('splash'); if (sp) { sp.style.opacity = 0; setTimeout(() => sp.remove(), 650); }
    last = performance.now(); requestAnimationFrame(frame);
    // music: start the theme at once where the platform allows it, otherwise on the first touch
    const startTheme = () => { A.init(); A.resume(); A.setAmbience(G.amb); A.setMusic(G.mus); if (G.state === 'menu') { A.ambient(false); A.music('menu'); } };
    startTheme(); ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, function once() { startTheme(); document.removeEventListener(ev, once, true); }, true));
    if (console && W.batchInfo) console.log('[kolusu] static meshes merged:', W.batchInfo.merged, '→ draw calls:', W.batchInfo.drawCalls, '| tris', W.batchInfo.tris, '| bake ms', W.batchInfo.ms, '| layers', JSON.stringify(K.R.stats.layers), K.R.stats.texMB + 'MB | paatti:', E.kind);
  }
  boot();

  // test / debug hooks
  window.__kolusu = {
    G, P, E, W, K, camera, renderer, scene,
    teleport(x, z, yaw, lv) { P.x = x; P.z = z; if (yaw !== undefined && yaw !== null) P.yaw = yaw; if (lv !== undefined) { P.lv = lv; P.feet = W.ground(x, z, lv).y; } },
    look(yaw, pitch) { P.yaw = yaw; P.pitch = pitch || 0; },
    give(id) { const it = W.items[id]; if (P.held) dropHeld(false); it.hide('hand'); setHeld(id); },
    noEnemy(v) { G.noEnemy = v; E.active = !v; },
    interact, toast, hide, unhide, clockSet: (h, m) => { ck.h = h; ck.m = m; W.clock.set(h, m); }, clockTry: () => tryClock(), pallSet: (c) => { W.pall.counts = c.slice(); }, pallTry: () => tryPall(), ring: () => startRing(), ghost: () => spawnGhost(), slam: () => slamDoor(), PH: () => PH, target: () => target, findTarget, start: startGame, save: saveGame, cont: continueGame, step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { G.simT = (G.simT || 0) + dt; updatePlayer(dt); E.update(dt); updateWell(dt); W.update(dt, G.simT); } }
  };
})(window.K);
