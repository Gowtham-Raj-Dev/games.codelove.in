/* KOLUSU — touch controls and the live mobile HUD */
'use strict';
(function (K) {
  const G = K.Game, P = K.P;
  const $ = id => document.getElementById(id);
  const T = K.Touch = { x: 0, y: 0, run: false };
  const layer = $('touchLayer'), joy = $('joy'), knob = $('joyKnob');
  const RADIUS0 = 54;
  let joyId = null, jx = 0, jy = 0, lookId = null, lx = 0, ly = 0, usedJoy = false;
  const ITEM_ICON = { smallkey: 'key', brasskey: 'skey', almirahkey: 'pkey', matchbox: 'match', bucket: 'bucket', boltcutter: 'cut', oosi: 'syringe', wingkey: 'key', bigkey: 'skey', sickle: 'cut', fuse: 'flame', safeknob: 'code', kolusu: 'grab' };
  const typeOf = id => (K.W && K.W.typeOf ? K.W.typeOf(id) : id);

  function joyReset() {
    joyId = null; T.x = 0; T.y = 0; T.run = false;
    joy.classList.remove('on', 'running'); joy.style.left = ''; joy.style.top = ''; joy.style.bottom = '';
    knob.style.transform = '';
  }
  layer.addEventListener('pointerdown', e => {
    if (G.state !== 'play' || G.overlay) return;
    e.preventDefault();
    const lefty = document.body.classList.contains('lefty'), onJoySide = lefty ? e.clientX > window.innerWidth * 0.58 : e.clientX < window.innerWidth * 0.42;
    if (onJoySide && joyId === null) {
      joyId = e.pointerId; jx = e.clientX; jy = e.clientY;
      const s = joy.offsetWidth / 2;
      joy.style.left = (jx - s) + 'px'; joy.style.top = (jy - s) + 'px'; joy.style.bottom = 'auto';
      joy.classList.add('on');
      if (!usedJoy) { usedJoy = true; const h = $('joyHint'); if (h) h.hidden = true; }
    } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    try { layer.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
  }, { passive: false });
  layer.addEventListener('pointermove', e => {
    if (e.pointerId === joyId) {
      let dx = e.clientX - jx, dy = e.clientY - jy; const d = Math.hypot(dx, dy);
      const RADIUS = RADIUS0 * ((G.ctl && G.ctl.j) || 1);
      if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
      knob.style.transform = `translate3d(${dx}px,${dy}px,0)`;
      const m = Math.min(1, d / RADIUS), dead = 0.12;
      const amt = m < dead ? 0 : (m - dead) / (1 - dead), len = Math.hypot(dx, dy) || 1;
      T.x = dx / len * amt; T.y = -dy / len * amt;
      const run = m > 0.94 && !P.tired && !P.crouch;
      if (run !== T.run) { T.run = run; joy.classList.toggle('running', run); }
    } else if (e.pointerId === lookId) {
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      G.look(dx, dy);
    }
  }, { passive: true });
  function release(e) { if (e.pointerId === joyId) joyReset(); if (e.pointerId === lookId) lookId = null; }
  layer.addEventListener('pointerup', release); layer.addEventListener('pointercancel', release); layer.addEventListener('lostpointercapture', release);

  function press(id, fn) { const b = $(id); if (!b) return; b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); fn(); }); const up = () => b.classList.remove('down'); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up); }
  press('btnAct', () => { G.act(); K.haptic && K.haptic(12); });
  press('btnTorch', () => G.toggleTorch());
  press('btnCrouch', () => G.toggleCrouch());
  press('btnDrop', () => G.drop());
  press('btnDiary', () => G.journal());
  press('btnPause', () => G.pause());
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());

  const act = $('btnAct'), actIcon = $('actIcon'), actLbl = $('actLbl'), slot = $('slotIcon'), drop = $('btnDrop'), bT = $('btnTorch'), bC = $('btnCrouch');
  const dkT = $('dkTorch'), dkC = $('dkCrouch'), dkD = $('dkDrop');
  let lastAct = null, lastHeld, lastPlay = null, lastTorch = null, lastCrouch = null, lastLang = null;
  function sync() {
    requestAnimationFrame(sync);
    const playing = G.state === 'play' && !G.overlay;
    if (playing !== lastPlay) { lastPlay = playing; layer.hidden = !playing || !G.mobile; if (!playing) { joyReset(); lookId = null; } }
    const a = G.actionInfo ? G.actionInfo() : null, key = (a ? a.l + '|' + a.i + (a.hot ? '!' : '') : '') + K.lang;
    if (key !== lastAct) {
      lastAct = key;
      act.classList.toggle('ready', !!a); act.classList.toggle('hot', !!(a && a.hot));
      actIcon.innerHTML = K.icon(a ? a.i : 'grab');
      actLbl.textContent = a ? a.l : '';
    }
    if (P.held !== lastHeld || K.lang !== lastLang) {
      lastHeld = P.held; lastLang = K.lang;
      slot.innerHTML = P.held ? K.icon(ITEM_ICON[typeOf(P.held)] || 'grab') : '';
      drop.hidden = !P.held; if (dkD) dkD.hidden = !P.held;
    }
    if (P.torch !== lastTorch) { lastTorch = P.torch; bT.setAttribute('aria-pressed', String(!!P.torch)); if (dkT) dkT.classList.toggle('on', !!P.torch); }
    if (P.crouch !== lastCrouch) { lastCrouch = P.crouch; bC.setAttribute('aria-pressed', String(!!P.crouch)); if (dkC) dkC.classList.toggle('on', !!P.crouch); }
  }
  requestAnimationFrame(sync);
})(window.K);
