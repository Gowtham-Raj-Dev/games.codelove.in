/* KOLUSU — synthesised audio. One-shots are pre-rendered into buffers at load for low CPU on phones. */
'use strict';
(function (K) {
  const A = {};
  const MOBILE = !!window.KOLUSU_MOBILE;
  let ctx = null, master, comp, sfx, amb, noiseBuf, vol = 0.8;
  let C = null, OUT = null;            // context + output the synth helpers write into (live or offline)
  let chaseGain, heartLevel = 0, nextBeat = 0, ambGain, roofG, outG, ambLevel = 0.45, outside = -1, ambOn = false;
  const BUF = {};                      // name -> [AudioBuffer variants]
  const R = Math.random;

  A.ready = () => !!ctx;
  A._tap = () => master;
  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // phones: a larger output buffer and a lower internal rate keep the audio thread from running dry (crackles, stutter)
    if (MOBILE) { try { ctx = new AC({ latencyHint: 'playback', sampleRate: 32000 }); } catch (e) { try { ctx = new AC({ latencyHint: 'playback' }); } catch (e2) { ctx = null; } } }
    if (!ctx) ctx = new AC({ latencyHint: MOBILE ? 'balanced' : 'interactive' });
    master = ctx.createGain(); master.gain.value = vol;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0; amb.connect(master);
    const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = R() * 2 - 1;
    C = ctx; OUT = sfx;
    startAmbient();
    prerenderAll();
    loadVoices();
  };
  /* Paatti's spoken lines: decoded once, off the main thread, so speaking never stalls a frame */
  const VO = {};
  function loadVoices() {
    const V = window.PAATTI_VOICE; if (!V || !ctx.decodeAudioData) return;
    for (const k in V) {
      try {
        const s = atob(V[k].d), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
        const done = b => { VO[k] = b; }, fail = () => {};
        const pr = ctx.decodeAudioData(u.buffer, done, fail); if (pr && pr.catch) pr.catch(fail);
      } catch (e) { /* no voice */ }
    }
  }
  let voiceSrc = null;
  A.voice = function (key, p, gain = 1) {
    if (!ctx || !VO[key] || voiceSrc) return 0;
    const s = ctx.createBufferSource(); s.buffer = VO[key];
    const g = ctx.createGain(); g.gain.value = 1.15 * gain;
    const pn = panner(p, 2.4, 1.05); s.connect(g); g.connect(pn);
    s.onended = () => { voiceSrc = null; try { g.disconnect(); pn.disconnect(); } catch (e) { /* gone */ } };
    s.start(); voiceSrc = s; return VO[key].duration;
  };
  A.voiceReady = k => !!VO[k];
  A.setVolume = function (v) { vol = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
  A.ambient = function (on) { ambOn = on; if (amb) amb.gain.setTargetAtTime(on ? 1 : 0.3, ctx.currentTime, 0.8); };
  /* ambience slider (0..1): rain + wind + drone level */
  A.setAmbience = function (v) { ambLevel = Math.max(0, Math.min(1, +v || 0)); if (ambGain) ambGain.gain.setTargetAtTime(ambLevel * 2, ctx.currentTime, 0.15); };
  /* 0 = indoors, 1 = under open sky, 0.5 = terrace room / doorway */
  A.setOutdoor = function (f) {
    if (!ctx || !outG || Math.abs(f - outside) < 0.01) return; outside = f;
    outG.gain.setTargetAtTime(0.034 * f, ctx.currentTime, 0.6);
    roofG.gain.setTargetAtTime(0.014 * (1 - f * 0.6), ctx.currentTime, 0.6);
  };

  function setP(node, x, y, z) {
    if (node.positionX) { node.positionX.value = x; node.positionY.value = y; node.positionZ.value = z; }
    else node.setPosition(x, y, z);
  }
  function panner(p, ref = 1.6, roll = 1.25) {
    if (!p) return sfx;
    const n = ctx.createPanner(); n.panningModel = MOBILE ? 'equalpower' : 'HRTF'; n.distanceModel = 'inverse';
    n.refDistance = ref; n.maxDistance = 60; n.rolloffFactor = roll;
    setP(n, p.x, p.y === undefined ? 1 : p.y, p.z); n.connect(sfx); return n;
  }
  A.listener = function (pos, fwd) {
    if (!ctx) return; const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
  };

  /* ---- synth helpers: always use C (context) and OUT (destination) ---- */
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function noise() { const s = C.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function osc(type, f) { const o = C.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function filt(type, f, q = 1) { const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function burst(out, t, dur, ftype, f, q, peak, a = 0.004) {
    const n = noise(), fl = filt(ftype, f, q), g = C.createGain();
    env(g, t, a, peak, dur); n.connect(fl); fl.connect(g); g.connect(out); n.start(t, R() * 1.5); n.stop(t + a + dur + 0.05);
    return fl;
  }
  function partials(out, t, base, ratios, peak, dec) {
    ratios.forEach((r, i) => { const o = osc('sine', base * r), g = C.createGain(); env(g, t, 0.003, peak / (1 + i * 0.6), dec / (1 + i * 0.35)); o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.1); });
  }

  /* ---- sound recipes (t = start time, out = destination) ---- */
  const SY = {
    anklet(out, t, amp = 1) {
      const n = 3 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const tk = t + k * 0.022 + R() * 0.035, f0 = 2900 + R() * 1600;
        [1, 1.53, 2.17].forEach((r, i) => { const o = osc('sine', f0 * r), g = C.createGain(); env(g, tk, 0.002, amp * 0.16 / (1 + i), 0.1 + R() * 0.22); o.connect(g); g.connect(out); o.start(tk); o.stop(tk + 0.45); });
      }
      burst(out, t, 0.06, 'highpass', 6000, 0.7, amp * 0.05);
    },
    footstep(out, t, run) {
      burst(out, t, run ? 0.09 : 0.07, 'lowpass', run ? 900 : 520, 0.8, run ? 0.32 : 0.16);
      const o = osc('sine', 80), g = C.createGain(); o.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      env(g, t, 0.004, run ? 0.25 : 0.1, 0.09); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.15);
    },
    pstep(out, t) { burst(out, t, 0.12, 'lowpass', 300, 0.6, 0.18, 0.02); },
    creak(out, t, amp = 1, dur = 0.8) {
      const o = osc('sawtooth', 110), bp = filt('bandpass', 760, 7), g = C.createGain();
      for (let i = 0; i < 10; i++) o.frequency.linearRampToValueAtTime(80 + R() * 110, t + (i + 1) * dur / 10);
      const am = osc('square', 28 + R() * 20), amg = C.createGain(); amg.gain.value = 0.5; am.connect(amg); amg.connect(g.gain);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * amp, t + 0.05); g.gain.setValueAtTime(0.22 * amp, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(bp); bp.connect(g); g.connect(out); o.start(t); am.start(t); o.stop(t + dur + 0.05); am.stop(t + dur + 0.05);
    },
    thud(out, t) {
      burst(out, t, 0.25, 'lowpass', 220, 0.8, 0.5);
      const o = osc('sine', 70), g = C.createGain(); o.frequency.exponentialRampToValueAtTime(35, t + 0.2); env(g, t, 0.003, 0.4, 0.25); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35);
    },
    clink(out, t) { partials(out, t, 1900 + R() * 300, [1, 1.7, 2.9], 0.22, 0.25); burst(out, t, 0.05, 'bandpass', 4200, 1.2, 0.15); partials(out, t + 0.09, 2300, [1, 1.6], 0.1, 0.15); },
    clang(out, t, base = 380) { partials(out, t, base * (0.9 + R() * 0.2), [1, 2.32, 4.25, 6.63], 0.32, 1.3); burst(out, t, 0.08, 'bandpass', 2500, 1, 0.2); partials(out, t + 0.18, base * 1.1, [1, 2.4], 0.1, 0.5); },
    pickup(out, t) { burst(out, t, 0.03, 'bandpass', 3000, 2, 0.15); partials(out, t + 0.02, 880, [1, 1.5], 0.08, 0.25); },
    match(out, t) { burst(out, t, 0.18, 'highpass', 2500, 0.7, 0.35); for (let i = 0; i < 6; i++) burst(out, t + 0.05 + R() * 0.3, 0.02, 'bandpass', 3000, 3, 0.15); burst(out, t + 0.15, 0.5, 'lowpass', 900, 0.5, 0.08, 0.05); },
    whoosh(out, t) { const f = burst(out, t, 0.6, 'bandpass', 300, 1.5, 0.3, 0.15); f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.5); },
    unlock(out, t) { burst(out, t, 0.02, 'bandpass', 2500, 3, 0.3); burst(out, t + 0.12, 0.03, 'bandpass', 1800, 3, 0.35); partials(out, t + 0.13, 700, [1, 2.2], 0.12, 0.4); },
    click(out, t) { burst(out, t, 0.015, 'bandpass', 2200, 2, 0.12); },
    // menu / button press: an old wooden switch — a dry tock, a dull thump under it, a little metal tick on top
    ui(out, t) {
      burst(out, t, 0.028, 'bandpass', 1350, 3.5, 0.26, 0.001);
      burst(out, t + 0.004, 0.012, 'highpass', 5200, 0.8, 0.05, 0.001);
      const o = osc('sine', 115), g = C.createGain(); o.frequency.exponentialRampToValueAtTime(58, t + 0.09); env(g, t, 0.002, 0.2, 0.1); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.14);
    },
    // a heavier press for the main buttons: the same, with a low door-knock under it
    uiBig(out, t) {
      SY.ui(out, t);
      const o = osc('sine', 70), g = C.createGain(); o.frequency.exponentialRampToValueAtTime(38, t + 0.3); env(g, t + 0.01, 0.004, 0.32, 0.32); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
      burst(out, t + 0.01, 0.18, 'lowpass', 420, 0.8, 0.2, 0.004);
    },
    beepOk(out, t) { partials(out, t, 1320, [1], 0.12, 0.15); partials(out, t + 0.12, 1760, [1], 0.12, 0.3); },
    beepBad(out, t) { const o = osc('square', 120), g = C.createGain(); env(g, t, 0.005, 0.12, 0.35); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45); },
    tick(out, t, alt) { const o = osc('square', alt ? 1150 : 900), g = C.createGain(); env(g, t, 0.001, 0.05, 0.03); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.06); },
    splash(out, t) { const f = burst(out, t, 0.9, 'lowpass', 2500, 0.8, 0.4, 0.01); f.frequency.exponentialRampToValueAtTime(250, t + 0.8); },
    whisper(out, t) { const n = 5 + Math.floor(R() * 5); for (let i = 0; i < n; i++) burst(out, t + i * (0.12 + R() * 0.1), 0.08 + R() * 0.1, 'bandpass', 1400 + R() * 1800, 4, 0.12, 0.03); }
  };

  /* ---- pre-rendering ---- */
  const PRE = [
    ['anklet', 0.6, 8, () => SY.anklet(OUT, 0, 1)], ['walk', 0.2, 4, () => SY.footstep(OUT, 0, false)], ['runstep', 0.22, 4, () => SY.footstep(OUT, 0, true)],
    ['pstep', 0.2, 3, () => SY.pstep(OUT, 0)], ['creak', 0.85, 4, () => SY.creak(OUT, 0, 1, 0.8)], ['creakS', 0.45, 3, () => SY.creak(OUT, 0, 1, 0.38)],
    ['thud', 0.4, 2, () => SY.thud(OUT, 0)], ['clink', 0.35, 4, () => SY.clink(OUT, 0)], ['clangLo', 1.6, 2, () => SY.clang(OUT, 0, 300)],
    ['clangMid', 1.6, 2, () => SY.clang(OUT, 0, 520)], ['clangHi', 1.6, 2, () => SY.clang(OUT, 0, 1300)], ['pickup', 0.35, 1, () => SY.pickup(OUT, 0)],
    ['match', 0.75, 2, () => SY.match(OUT, 0)], ['whoosh', 0.8, 2, () => SY.whoosh(OUT, 0)], ['unlock', 0.6, 1, () => SY.unlock(OUT, 0)], ['click', 0.06, 1, () => SY.click(OUT, 0)], ['ui', 0.16, 2, () => SY.ui(OUT, 0)], ['uiBig', 0.45, 1, () => SY.uiBig(OUT, 0)],
    ['beepOk', 0.5, 1, () => SY.beepOk(OUT, 0)], ['beepBad', 0.5, 1, () => SY.beepBad(OUT, 0)], ['tickA', 0.08, 1, () => SY.tick(OUT, 0, false)], ['tickB', 0.08, 1, () => SY.tick(OUT, 0, true)],
    ['splash', 1.0, 1, () => SY.splash(OUT, 0)], ['whisper', 1.6, 3, () => SY.whisper(OUT, 0)]
  ];
  async function prerenderAll() {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return;
    const sr = 22050;
    for (const [name, dur, variants, fn] of PRE) {
      const list = [];
      for (let v = 0; v < variants; v++) {
        try {
          const off = new OAC(1, Math.ceil(dur * sr), sr);
          const pc = C, po = OUT; C = off; OUT = off.destination;
          try { fn(); } finally { C = pc; OUT = po; }
          list.push(await off.startRendering());
        } catch (e) { break; }
      }
      if (list.length) BUF[name] = list;
      await new Promise(r => setTimeout(r, 0)); // keep the main thread responsive
    }
  }
  function play(name, p, gain = 1, rate = 1, ref, roll) {
    const list = BUF[name]; if (!list) return false;
    const s = ctx.createBufferSource(); s.buffer = list[Math.floor(R() * list.length)]; s.playbackRate.value = rate * (0.96 + R() * 0.08);
    const g = ctx.createGain(); g.gain.value = gain; s.connect(g); g.connect(panner(p, ref, roll)); s.start(); return true;
  }
  function live(fn, p, ref, roll) { const out = panner(p, ref, roll); fn(out, ctx.currentTime); }

  function startAmbient() {
    ambGain = ctx.createGain(); ambGain.gain.value = ambLevel * 2; ambGain.connect(amb);
    // soft rain: low-passed noise (a gentle hush, not a hiss)
    const r1 = noise(), lp1 = filt('lowpass', 1500, 0.5), hp1 = filt('highpass', 260, 0.5); roofG = ctx.createGain(); roofG.gain.value = 0.014;
    r1.connect(lp1); lp1.connect(hp1); hp1.connect(roofG); roofG.connect(ambGain); r1.start();
    // open-air rain: a touch brighter, only up when the player is outside
    const r3 = noise(), lp3 = filt('lowpass', 2600, 0.4), hp3 = filt('highpass', 420, 0.5); outG = ctx.createGain(); outG.gain.value = 0;
    r3.connect(lp3); lp3.connect(hp3); hp3.connect(outG); outG.connect(ambGain); r3.start(0, 0.7);
    // courtyard spout, positional and quiet
    const r2 = noise(), lp = filt('lowpass', 1900, 0.5), g2 = ctx.createGain(); g2.gain.value = 0.06;
    const pn = ctx.createPanner(); pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = 2.5; pn.rolloffFactor = 1.6; setP(pn, 12, 1, 10);
    r2.connect(lp); lp.connect(g2); g2.connect(pn); pn.connect(ambGain); r2.start(0, 1.3);
    [49, 73.6, 98.4].forEach((f, i) => {
      const o = osc('sine', f), g = ctx.createGain(); g.gain.value = 0.026 / (i + 1);
      const l = osc('sine', 0.05 + i * 0.031), lg = ctx.createGain(); lg.gain.value = 0.015 / (i + 1);
      l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(ambGain); o.start(); l.start();
    });
    const w = noise(), wf = filt('bandpass', 380, 1.4), wg = ctx.createGain(); wg.gain.value = 0.016;
    const wl = osc('sine', 0.06), wlg = ctx.createGain(); wlg.gain.value = 180; wl.connect(wlg); wlg.connect(wf.frequency);
    w.connect(wf); wf.connect(wg); wg.connect(ambGain); w.start(); wl.start();
    chaseGain = ctx.createGain(); chaseGain.gain.value = 0; chaseGain.connect(master);
  }
  // the chase drone only runs while Paatti chases (idle oscillators still cost the audio thread)
  let chaseNodes = null;
  function chaseOn() {
    if (chaseNodes || !ctx) return; C = ctx;
    const clp = filt('lowpass', 380, 3), os = [55, 58.3, 82.4].map(f => { const o = osc('sawtooth', f); o.connect(clp); o.start(); return o; });
    const pulse = ctx.createGain(); pulse.gain.value = 0.5; const pl = osc('sine', 2.4), plg = ctx.createGain(); plg.gain.value = 0.5; pl.connect(plg); plg.connect(pulse.gain); pl.start();
    clp.connect(pulse); pulse.connect(chaseGain); chaseNodes = os.concat([pl]);
  }
  function chaseOff() { if (!chaseNodes) return; const n = chaseNodes, t = ctx.currentTime + 7; chaseNodes = null; n.forEach(o => { try { o.stop(t); } catch (e) { /* already stopped */ } }); }
  A.setChase = function (on) { if (chaseGain) { if (on) chaseOn(); else chaseOff(); chaseGain.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, on ? 0.2 : 1.2); } if (on !== chasing) { chasing = on; if (mus && on) mus.q.length = 0; musLevels(); } };
  A.setHeart = function (v) { heartLevel = v; };
  A.update = function () {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (heartLevel > 0.06 && t >= nextBeat) {
      const iv = 1.15 - 0.62 * heartLevel;
      for (const [dt, a] of [[0, 1], [0.17, 0.7]]) {
        const o = ctx.createOscillator(), g = ctx.createGain(), tt = t + dt;
        o.frequency.setValueAtTime(70, tt); o.frequency.exponentialRampToValueAtTime(38, tt + 0.15);
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.55 * heartLevel * a), tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.19);
        o.connect(g); g.connect(sfx); o.start(tt); o.stop(tt + 0.3);
      }
      nextBeat = t + iv;
    }
  };

  /* ---- public one-shots ---- */
  A.anklet = (p, amp = 1) => { if (ctx) play('anklet', p, amp, 1, 1.8, 1.1) || live((o, t) => SY.anklet(o, t, amp), p, 1.8, 1.1); };
  A.footstep = (amp, run) => { if (ctx) play(run ? 'runstep' : 'walk', null, amp) || live((o, t) => SY.footstep(o, t, run), null); };
  A.paattiStep = (p) => { if (ctx) play('pstep', p, 1, 1, 1.5, 1.3) || live((o, t) => SY.pstep(o, t), p, 1.5, 1.3); };
  A.creak = (p, amp = 1, dur = 0.8) => { if (ctx) play(dur < 0.5 ? 'creakS' : 'creak', p, amp, dur > 1.2 ? 0.7 : 1, 2, 1) || live((o, t) => SY.creak(o, t, amp, dur), p, 2, 1); };
  A.thud = (p, amp = 1) => { if (ctx) play('thud', p, amp) || live((o, t) => SY.thud(o, t), p); };
  A.clink = (p) => { if (ctx) play('clink', p) || live((o, t) => SY.clink(o, t), p); };
  A.clang = (p, amp = 1, base = 380) => { if (ctx) play(base < 400 ? 'clangLo' : base < 900 ? 'clangMid' : 'clangHi', p, amp, 1, 2) || live((o, t) => SY.clang(o, t, base), p, 2); };
  A.pickup = () => { if (ctx) play('pickup', null) || live((o, t) => SY.pickup(o, t), null); };
  A.match = () => { if (ctx) play('match', null) || live((o, t) => SY.match(o, t), null); };
  A.whoosh = (p, amp = 1) => { if (ctx) play('whoosh', p, amp) || live((o, t) => SY.whoosh(o, t), p); };
  A.unlock = (p) => { if (ctx) play('unlock', p) || live((o, t) => SY.unlock(o, t), p); };
  let lastUi = 0;
  A.click = () => { if (ctx && performance.now() - lastUi > 140) play('click', null) || live((o, t) => SY.click(o, t), null); };
  A.ui = (big) => { lastUi = performance.now(); if (ctx) play(big ? 'uiBig' : 'ui', null, big ? 0.9 : 0.75) || live((o, t) => SY[big ? 'uiBig' : 'ui'](o, t), null); };
  A.beep = (ok) => { if (ctx) play(ok ? 'beepOk' : 'beepBad', null) || live((o, t) => (ok ? SY.beepOk : SY.beepBad)(o, t), null); };
  A.tick = (p, alt) => { if (ctx) play(alt ? 'tickB' : 'tickA', p, 1, 1, 1, 1.4) || live((o, t) => SY.tick(o, t, alt), p, 1, 1.4); };
  A.whisper = (p) => { if (ctx) play('whisper', p, 1, 1, 1.5, 1) || live((o, t) => SY.whisper(o, t), p, 1.5, 1); };
  A.pulley = (p) => {
    if (!ctx) return;
    for (let i = 0; i < 5; i++) setTimeout(() => A.creak(p, 0.7, 0.35), i * 420);
    setTimeout(() => { play('splash', p) || live((o, t) => SY.splash(o, t), p); }, 1300);
    for (let i = 0; i < 5; i++) setTimeout(() => A.creak(p, 0.6, 0.3), 2200 + i * 330);
  };
  A.chainCut = (p) => {
    if (!ctx) return;
    live((o, t) => { burst(o, t, 0.05, 'highpass', 3000, 0.7, 0.6); partials(o, t, 1250, [1, 2.7, 4.1], 0.3, 0.6); }, p);
    for (let i = 0; i < 8; i++) setTimeout(() => A.clink(p), 120 + i * 70 + R() * 50);
  };
  A.bell = (p) => { if (!ctx) return; live((o, t) => { partials(o, t, 540, [0.5, 1, 1.19, 1.56, 2, 2.51, 3.01], 0.35, 4.5); partials(o, t + 1.4, 540, [0.5, 1, 1.19, 1.56, 2, 2.51], 0.25, 4); }, p, 3, 0.8); };
  A.gust = () => {
    if (!ctx) return;
    live((o, t) => { const f = burst(o, t, 2.2, 'bandpass', 200, 1.2, 0.45, 0.5); f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.9); f.frequency.exponentialRampToValueAtTime(220, t + 2.4); }, null);
    for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2, d = 2 + R() * 3; setTimeout(() => A.anklet({ x: K.listenerPos.x + Math.cos(a) * d, y: 1, z: K.listenerPos.z + Math.sin(a) * d }, 1.2), i * 160 + R() * 120); }
  };
  A.sting = () => {
    if (!ctx) return;
    live((o, t) => {
      const lp = filt('lowpass', 300, 2), g = C.createGain(); lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3500, t + 0.9); env(g, t, 0.05, 0.22, 1.4);
      [220, 233.1, 311.1, 329.6].forEach(f => { const q = osc('sawtooth', f); q.connect(lp); q.start(t); q.stop(t + 1.6); });
      lp.connect(g); g.connect(o); burst(o, t, 0.9, 'highpass', 1500, 0.7, 0.18, 0.3);
    }, null);
  };
  A.scream = () => {
    if (!ctx) return;
    live((o, t) => {
      const ws = C.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); } ws.curve = curve;
      const bp = filt('bandpass', 1400, 0.9), g = C.createGain(); env(g, t, 0.01, 0.75, 1.5);
      [[950, 260], [1310, 340], [700, 190]].forEach(([a, b]) => { const q = osc('sawtooth', a); q.frequency.setValueAtTime(a, t); q.frequency.exponentialRampToValueAtTime(b, t + 1.4); const v = osc('sine', 9), vg = C.createGain(); vg.gain.value = 40; v.connect(vg); vg.connect(q.frequency); q.connect(ws); q.start(t); v.start(t); q.stop(t + 1.6); v.stop(t + 1.6); });
      const n = noise(); n.connect(ws); n.start(t); n.stop(t + 1.6);
      ws.connect(bp); bp.connect(g); g.connect(o); burst(o, t, 0.5, 'lowpass', 150, 0.7, 0.9);
    }, null);
  };
  A.thunder = () => {
    if (!ctx) return; const t = ctx.currentTime;
    C = ctx; burst(ambGain || amb, t, 0.25, 'highpass', 1400, 0.6, 0.035);
    const n = noise(), lp = filt('lowpass', 140, 0.6), g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    let tt = t; for (let i = 0; i < 9; i++) { tt += 0.18 + R() * 0.4; g.gain.exponentialRampToValueAtTime(0.1 + R() * 0.2, tt); }
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.8); n.connect(lp); lp.connect(g); g.connect(ambGain || amb); n.start(t); n.stop(tt + 1.6);
  };
  A.hum = (p) => {
    if (!ctx) return; const out = panner(p, 2, 1.1), t0 = ctx.currentTime + 0.05;
    const phrases = [[7, 8, 7, 5, 4, 5, 4, 1, 0], [0, 1, 4, 5, 4, 1, 0], [12, 11, 8, 7, 8, 7, 5, 4], [4, 5, 7, 5, 4, 1, 4, 0]];
    const ph = phrases[Math.floor(R() * phrases.length)], base = 185;
    const o1 = osc('sawtooth', base), o2 = osc('sawtooth', base * 1.004), f1 = filt('bandpass', 480, 4), f2 = filt('bandpass', 1050, 6), lp = filt('lowpass', 1500), g = ctx.createGain();
    const vib = osc('sine', 5.2), vg = ctx.createGain(); vg.gain.value = 3.5; vib.connect(vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
    let t = t0;
    ph.forEach(s => {
      const f = base * Math.pow(2, s / 12), d = 0.42 + R() * 0.35;
      o1.frequency.setTargetAtTime(f, t, 0.05); o2.frequency.setTargetAtTime(f * 1.004, t, 0.05);
      if (R() < 0.45) { const up = f * Math.pow(2, 1 / 12); o1.frequency.setTargetAtTime(up, t + d * 0.35, 0.04); o1.frequency.setTargetAtTime(f, t + d * 0.6, 0.05); }
      t += d;
    });
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.4); g.gain.setValueAtTime(0.11, t - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o1.connect(f1); o2.connect(f1); o1.connect(f2); f1.connect(lp); f2.connect(lp); lp.connect(g); g.connect(out);
    [o1, o2, vib].forEach(o => { o.start(t0); o.stop(t + 0.4); });
  };
  A.bigDoor = (p) => {
    if (!ctx) return; A.creak(p, 1.2, 2.2); setTimeout(() => A.creak(p, 1, 1.5), 500);
    live((o, t) => { const f = burst(o, t + 0.4, 3, 'bandpass', 500, 0.8, 0.3, 0.8); f.frequency.exponentialRampToValueAtTime(2000, t + 3); }, null);
  };

  /* ================= music: an original lullaby in a Todi-like (phrygian) scale on a worn music box,
     over a low drone, with slow dissonant swells. Everything is synthesised; no audio files. ================= */
  let mus = null, musLevel = 0.6, musMode = 'off', musDucked = false, chasing = false;
  const SA = 293.66; // D4
  // phrases: [semitones from Sa (null = rest), beats]
  const PH = [
    [[7, 1], [5, .5], [3, .5], [1, 1], [0, 1.5], [null, .5], [1, .5], [3, .5], [5, 1], [3, .5], [1, .5], [0, 2]],
    [[8, 1], [7, .5], [5, .5], [7, 1], [10, 1.5], [8, .5], [7, 1], [5, .5], [3, .5], [1, 1], [0, 2]],
    [[12, 1.5], [13, .5], [12, 1], [10, 1], [8, 1.5], [7, .5], [5, 1], [3, 1], [1, 1], [0, 2.5]],
    [[0, .5], [3, .5], [7, 1], [8, .5], [7, .5], [5, 1], [3, 1], [1, 1.5], [-2, .5], [0, 3]]
  ];
  const MENU_ORDER = [0, 1, 0, 2, 3];
  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { lp += ((R() * 2 - 1) - lp) * 0.32; d[i] = lp * Math.pow(1 - i / len, decay); } }
    return b;
  }
  function musSetup() {
    if (mus || !ctx) return;
    C = ctx;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(master);
    const dry = ctx.createGain(); dry.gain.value = 0.75; dry.connect(bus);
    const rv = ctx.createConvolver(); rv.buffer = makeIR(MOBILE ? 1.7 : 3.4, MOBILE ? 2.0 : 2.4); // a long reverb is the costliest node on a phone const wet = ctx.createGain(); wet.gain.value = 0.6; rv.connect(wet); wet.connect(bus);
    const box = ctx.createGain(); box.connect(dry); box.connect(rv);
    const pad = ctx.createGain(); pad.gain.value = 0; const plp = filt('lowpass', 300, 0.6); plp.connect(pad); pad.connect(dry); pad.connect(rv);
    [[73.42, 'sine', 0.55], [110, 'triangle', 0.16], [146.83 * 1.003, 'sawtooth', 0.045], [146.83 * 0.997, 'sawtooth', 0.045]].forEach(([f, type, g]) => { const o = osc(type, f), gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(plp); o.start(); });
    const lfo = osc('sine', 0.045), lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(plp.frequency); lfo.start();
    const ten = ctx.createGain(); ten.gain.value = 0; const to = osc('sine', 155.56); to.connect(ten); ten.connect(dry); ten.connect(rv); to.start();
    mus = { bus, dry, rv, box, pad, ten, q: [], next: 0, restUntil: 0, pi: 0, beat: 60 / 54, vel: 0.1, swellT: 0, tenT: 0, ankT: 0, warb: R() * 10 };
    setInterval(musTick, 100);
  }
  function warble(t) { return 0.11 * Math.sin(t * 0.9 + mus.warb) + 0.05 * Math.sin(t * 2.3); }
  function boxNote(t, semi, vel, len) {
    const f = SA * Math.pow(2, (semi + warble(t)) / 12);
    const g = ctx.createGain(), gh = ctx.createGain(); g.connect(mus.box); gh.connect(mus.box);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    gh.gain.setValueAtTime(0.0001, t); gh.gain.exponentialRampToValueAtTime(vel, t + 0.003); gh.gain.exponentialRampToValueAtTime(0.0001, t + len * 0.28);
    [[1, 1, g], [2.0, 0.12, g], [2.76, 0.2, gh], [5.4, 0.07, gh]].forEach(([r, a, out]) => { const o = ctx.createOscillator(); o.frequency.value = f * r; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(out); o.start(t); o.stop(t + len + 0.05); });
  }
  function swell(t, vel, dur) {
    const g = ctx.createGain(), lp = filt('lowpass', 520, 0.8); lp.connect(g); g.connect(mus.dry); g.connect(mus.rv);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(900, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(260, t + dur);
    [146.83, 155.56, 207.65, 220].forEach((f, i) => { const o = osc('sawtooth', f * (1 + (R() - 0.5) * 0.004)), og = ctx.createGain(); og.gain.value = i === 2 ? 0.5 : 1; o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.1); });
  }
  function pushPhrase(idx, opts = {}) {
    const ph = PH[idx], slow = opts.slow || 1, n = ph.length;
    ph.forEach(([semi, beats], i) => {
      let b = beats * slow, drop = 0;
      if (opts.windDown && i >= n - 4) { const k = i - (n - 5); b *= 1 + k * 0.32; drop = -0.18 * k; }
      mus.q.push([semi === null ? null : semi + drop, b, (opts.vel || mus.vel) * (0.85 + R() * 0.3), i === 0 && semi !== null]);
    });
    mus.q.push([null, opts.tail === undefined ? 1.5 : opts.tail, 0, false]);
  }
  function refill(now) {
    if (musMode === 'menu') { pushPhrase(MENU_ORDER[mus.pi++ % MENU_ORDER.length], { vel: 0.13 }); return true; }
    if (musMode === 'game' && !chasing) {
      if (now < mus.restUntil) return false;
      pushPhrase(Math.floor(R() * PH.length), { vel: 0.07, slow: 1.15, windDown: R() < 0.35, tail: 0.5 });
      let dur = 0; mus.q.forEach(e => dur += e[1] * mus.beat); mus.restUntil = now + dur + 22 + R() * 26; return true;
    }
    return false;
  }
  function musTick() {
    if (!ctx || !mus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (mus.next < now) mus.next = now + 0.05;
    let guard = 0;
    while (mus.next < now + 0.45 && guard++ < 32) {
      if (!mus.q.length && !refill(now)) break;
      const [semi, beats, vel, bass] = mus.q.shift();
      if (semi !== null && !chasing) { boxNote(mus.next, semi, vel, 2.4 + beats * 0.6); if (bass) boxNote(mus.next, semi - 24, vel * 0.55, 3.2); }
      mus.next += beats * mus.beat;
    }
    if (musMode === 'game' || musMode === 'menu') {
      if (now > mus.swellT) { if (mus.swellT && !chasing) swell(now + 0.1, musMode === 'menu' ? 0.012 : 0.02, 11 + R() * 5); mus.swellT = now + (musMode === 'menu' ? 30 : 45) + R() * 40; }
      if (now > mus.tenT) {
        if (mus.tenT && musMode === 'game' && !chasing) { const g = mus.ten.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.011, now + 6); g.linearRampToValueAtTime(0.011, now + 10); g.linearRampToValueAtTime(0, now + 18); }
        mus.tenT = now + 35 + R() * 35;
      }
      if (musMode === 'menu' && now > mus.ankT) { if (mus.ankT) A.anklet({ x: K.listenerPos ? K.listenerPos.x + (R() - 0.5) * 8 : 12, y: 1, z: K.listenerPos ? K.listenerPos.z + (R() - 0.5) * 8 : 10 }, 0.35 * musLevel); mus.ankT = now + 22 + R() * 20; }
    }
  }
  function musLevels() {
    if (!mus) return; const t = ctx.currentTime;
    const on = musMode !== 'off';
    mus.bus.gain.setTargetAtTime(on ? musLevel * 1.7 * (musDucked ? 0.45 : 1) : 0, t, 0.6);
    const pad = musMode === 'menu' ? 0.026 : musMode === 'game' ? (chasing ? 0.008 : 0.018) : musMode === 'end' ? 0.014 : 0;
    mus.pad.gain.setTargetAtTime(pad, t, chasing ? 0.4 : 2.5);
  }
  A.music = function (mode) {
    if (!ctx) return; musSetup(); if (!mus) return;
    if (mode === musMode && mode !== 'end') { musLevels(); return; }
    musMode = mode; mus.q.length = 0; const now = ctx.currentTime; mus.next = now + 0.6;
    if (mode === 'menu') { mus.pi = 0; mus.next = now + 1.2; mus.ankT = now + 9; }
    if (mode === 'game') { mus.restUntil = now + 10 + R() * 8; mus.swellT = now + 20; mus.tenT = now + 25; }
    if (mode === 'end') { pushPhrase(3, { vel: 0.08, slow: 1.35, tail: 0 }); pushPhrase(0, { vel: 0.06, slow: 1.5, windDown: true, tail: 0 }); }
    musLevels();
  };
  A.setMusic = function (v) { musLevel = Math.max(0, Math.min(1, +v || 0)); musLevels(); };
  A.musicDuck = function (on) { musDucked = !!on; musLevels(); };
  A.suspend = function () { if (ctx && ctx.state === 'running') ctx.suspend(); };
  A.ctxReady = () => !!ctx;
  A.resume = function () { if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume(); };

  /* ---- story sounds ---- */
  // old two-bell telephone ring: a 20 Hz striker on two bells, two bursts
  A.phoneRing = (p) => {
    if (!ctx) return;
    live((o, t) => {
      for (const st of [0, 0.42]) {
        const g = C.createGain(); g.gain.value = 0; g.connect(o);
        const am = osc('square', 20), amg = C.createGain(); amg.gain.value = 0.5; am.connect(amg); amg.connect(g.gain);
        const env2 = C.createGain(); env2.gain.setValueAtTime(0.0001, t + st); env2.gain.exponentialRampToValueAtTime(1, t + st + 0.01); env2.gain.setValueAtTime(1, t + st + 0.32); env2.gain.exponentialRampToValueAtTime(0.0001, t + st + 0.38);
        g.connect(env2); env2.connect(o); g.disconnect(o);
        const bias = C.createConstantSource ? C.createConstantSource() : null; if (bias) { bias.offset.value = 0.5; bias.connect(g.gain); bias.start(t + st); bias.stop(t + st + 0.4); }
        [[1150, 0.09], [1150 * 2.76, 0.03], [1420, 0.07], [1420 * 2.4, 0.02]].forEach(([f, a]) => { const q = osc('sine', f), qg = C.createGain(); qg.gain.value = a; q.connect(qg); qg.connect(g); q.start(t + st); q.stop(t + st + 0.42); });
        am.start(t + st); am.stop(t + st + 0.42);
      }
    }, p, 2.5, 0.9);
  };
  // a voice on a dead line: crackle, then whispering and a child humming far away
  A.phoneVoice = () => {
    if (!ctx) return;
    live((o, t) => {
      const lp = filt('bandpass', 1500, 0.8), g = C.createGain(); g.gain.value = 0.6; lp.connect(g); g.connect(o);
      const n = noise(), ng = C.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
      for (let i = 0; i < 40; i++) ng.gain.setValueAtTime(0.02 + R() * 0.09, t + 0.1 + i * 0.1);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 4.6); n.connect(ng); ng.connect(lp); n.start(t); n.stop(t + 4.7);
      for (let i = 0; i < 7; i++) burst(lp, t + 0.8 + i * (0.18 + R() * 0.12), 0.1 + R() * 0.12, 'bandpass', 1300 + R() * 1600, 5, 0.2, 0.03);
      // humming: a small voice, three notes of the lullaby
      const v = osc('triangle', 440), vf = filt('bandpass', 900, 3), vg = C.createGain(); v.connect(vf); vf.connect(vg); vg.connect(lp);
      const notes = [7, 5, 3, 1, 0], base = 392;
      notes.forEach((n2, i) => v.frequency.setValueAtTime(base * Math.pow(2, n2 / 12), t + 2.0 + i * 0.42));
      const vib = osc('sine', 5.5), vb = C.createGain(); vb.gain.value = 6; vib.connect(vb); vb.connect(v.frequency);
      vg.gain.setValueAtTime(0.0001, t + 1.9); vg.gain.exponentialRampToValueAtTime(0.25, t + 2.1); vg.gain.setValueAtTime(0.25, t + 3.9); vg.gain.exponentialRampToValueAtTime(0.0001, t + 4.3);
      v.start(t + 1.9); vib.start(t + 1.9); v.stop(t + 4.4); vib.stop(t + 4.4);
    }, null);
  };
  A.static = () => { if (ctx) live((o, t) => { burst(o, t, 0.6, 'bandpass', 2000, 0.7, 0.12, 0.02); }, null); };
  // deep clock gong
  A.gong = (p, amp = 1) => { if (!ctx) return; live((o, t) => { partials(o, t, 196, [0.5, 1, 1.5, 2.0, 2.76, 3.9], 0.32 * amp, 5.5); burst(o, t, 0.05, 'lowpass', 600, 0.7, 0.2 * amp); }, p, 3, 0.6); };
  // the lullaby on a music box, from a place in the room
  A.lullaby = (p, notes) => {
    if (!ctx) return;
    live((o, t) => {
      const seq = notes || [[7, 1], [5, .5], [3, .5], [1, 1], [0, 1.5], [1, .5], [3, .5], [5, 1], [3, .5], [1, .5], [0, 2]], beat = 0.58;
      let tt = t + 0.2;
      seq.forEach(([n2, b]) => { const f = 587.3 * Math.pow(2, n2 / 12); partials(o, tt, f, [1, 2, 2.76], 0.09, 1.6 + b * 0.6); tt += b * beat; });
    }, p, 2.2, 0.9);
  };
  A.slam = (p) => { if (!ctx) return; A.creak(p, 1, 0.35); setTimeout(() => { A.thud(p, 1.4); live((o, t) => burst(o, t, 0.4, 'lowpass', 300, 0.7, 0.45), p, 2.5, 1); }, 160); };
  A.seeds = (p) => { if (!ctx) return; for (let i = 0; i < 7; i++) setTimeout(() => A.tick(p, i % 2), i * 45 + R() * 40); };
  A.cry = (p) => { // Paatti weeping: a falling breathy wail
    if (!ctx) return;
    live((o, t) => {
      for (let k = 0; k < 3; k++) {
        const tt = t + k * 1.9, v = osc('sawtooth', 300), f1 = filt('bandpass', 700, 5), f2 = filt('lowpass', 1400), g = C.createGain();
        v.frequency.setValueAtTime(330 - k * 15, tt); v.frequency.exponentialRampToValueAtTime(210, tt + 1.5);
        const vib = osc('sine', 6), vb = C.createGain(); vb.gain.value = 9; vib.connect(vb); vb.connect(v.frequency);
        env(g, tt, 0.25, 0.07, 1.4); v.connect(f1); f1.connect(f2); f2.connect(g); g.connect(o); v.start(tt); vib.start(tt); v.stop(tt + 1.8); vib.stop(tt + 1.8);
        burst(o, tt, 1.2, 'bandpass', 2400, 1.5, 0.025, 0.2);
      }
    }, p, 2, 1);
  };
  /* ---- second wing machines ---- */
  // main switch: a heavy clunk, an arc crackle, then mains hum rising
  A.power = (p) => {
    if (!ctx) return;
    live((o, t) => {
      burst(o, t, 0.12, 'lowpass', 500, 0.8, 0.5); burst(o, t + 0.02, 0.25, 'bandpass', 3200, 1.2, 0.12);
      for (let i = 0; i < 6; i++) burst(o, t + 0.08 + R() * 0.5, 0.03, 'highpass', 4000, 0.7, 0.08);
      const h = osc('sawtooth', 50), f = filt('lowpass', 260), g = C.createGain();
      g.gain.setValueAtTime(0.0001, t + 0.3); g.gain.exponentialRampToValueAtTime(0.06, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      h.connect(f); f.connect(g); g.connect(o); h.start(t + 0.3); h.stop(t + 4.6);
    }, p, 2.5, 0.9);
  };
  // the water pump: an electric whine with a churning body, for dur seconds
  A.motor = (p, dur = 10) => {
    if (!ctx) return;
    live((o, t) => {
      const m = osc('sawtooth', 48), m2 = osc('square', 96), f = filt('lowpass', 420, 2), g = C.createGain();
      m.frequency.setValueAtTime(20, t); m.frequency.exponentialRampToValueAtTime(48, t + 1.2); m2.frequency.setValueAtTime(40, t); m2.frequency.exponentialRampToValueAtTime(96, t + 1.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 1.0); g.gain.setValueAtTime(0.14, t + dur - 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      m.connect(f); m2.connect(f); f.connect(g); g.connect(o); m.start(t); m2.start(t); m.stop(t + dur + 0.1); m2.stop(t + dur + 0.1);
      const n = noise(), nf = filt('bandpass', 900, 0.8), ng = C.createGain();
      ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.05, t + 1.2); ng.gain.setValueAtTime(0.05, t + dur - 0.8); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(nf); nf.connect(ng); ng.connect(o); n.start(t); n.stop(t + dur + 0.1);
    }, p, 2, 1);
  };
  // water pouring into the stone tank
  A.water = (p, dur = 10) => {
    if (!ctx) return;
    live((o, t) => {
      const n = noise(), f = filt('bandpass', 1300, 0.6), f2 = filt('lowpass', 2600), g = C.createGain(), lfo = osc('sine', 3.3), lg = C.createGain();
      lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.6); g.gain.setValueAtTime(0.12, t + dur - 1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      f.frequency.setValueAtTime(1500, t); f.frequency.linearRampToValueAtTime(700, t + dur); // the pitch drops as the tank fills
      n.connect(f); f.connect(f2); f2.connect(g); g.connect(o); n.start(t); lfo.start(t); n.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    }, p, 2, 1);
  };
  // the valve radio: static, then a nadaswaram-like reed melody through a small speaker; returns { stop }
  A.radio = (p, dur = 25) => {
    if (!ctx) return { stop() {} };
    const out = panner(p, 3, 0.7), bus = C.createGain(); bus.gain.value = 1; bus.connect(out);
    const t = ctx.currentTime, spk = filt('bandpass', 1400, 0.7); spk.connect(bus);
    burst(spk, t, 0.9, 'bandpass', 2400, 0.5, 0.18, 0.02);
    const st = noise(), sf = filt('highpass', 2500), sg = C.createGain(); sg.gain.value = 0.012; st.connect(sf); sf.connect(sg); sg.connect(spk); st.start(t); st.stop(t + dur);
    const scale = [0, 1, 4, 5, 7, 8, 11, 12], base = 349; // mayamalavagowla, around F4
    let tt = t + 0.9, k = 0;
    while (tt < t + dur - 0.5) {
      const deg = scale[(k * 3 + (k % 5) * 2) % scale.length] + (k % 11 === 0 ? 12 : 0), len = [0.36, 0.36, 0.72, 0.36, 1.1][k % 5];
      const v = osc('sawtooth', base * Math.pow(2, deg / 12)), g = C.createGain(), vib = osc('sine', 5.2), vg = C.createGain();
      vg.gain.value = 5; vib.connect(vg); vg.connect(v.frequency);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.07, tt + 0.05); g.gain.setValueAtTime(0.06, tt + len * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, tt + len);
      v.connect(g); g.connect(spk); v.start(tt); vib.start(tt); v.stop(tt + len + 0.05); vib.stop(tt + len + 0.05);
      if (k % 2 === 0) { const d = osc('triangle', base / 2), dg = C.createGain(); env(dg, tt, 0.005, 0.05, 0.25); d.connect(dg); dg.connect(spk); d.start(tt); d.stop(tt + 0.3); }
      tt += len; k++;
    }
    bus.gain.setValueAtTime(1, t + dur - 0.6); bus.gain.linearRampToValueAtTime(0.0001, t + dur);
    return { stop() { try { const n = ctx.currentTime; bus.gain.cancelScheduledValues(n); bus.gain.setValueAtTime(bus.gain.value, n); bus.gain.linearRampToValueAtTime(0.0001, n + 0.15); } catch (e) { /* already stopped */ } } };
  };
  K.Audio = A;
})(window.K = window.K || {});
