/* AISLE ZERO — procedural horror audio (no audio files). Everything is synthesized with WebAudio. */
(function () {
  const SFX = (window.SFX = {
    ctx: null, ready: false, muted: false,

    init() {
      if (this.ready) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const C = (this.ctx = new AC());
      this.master = C.createGain(); this.master.gain.value = 0.9;
      const comp = C.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 10; comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master.connect(comp); comp.connect(C.destination);

      // reverb (big empty store)
      const len = (C.sampleRate * 3.2) | 0, ib = C.createBuffer(2, len, C.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      this.rev = C.createConvolver(); this.rev.buffer = ib;
      const revG = C.createGain(); revG.gain.value = 0.55; this.rev.connect(revG); revG.connect(this.master);
      this.bus = C.createGain(); this.bus.connect(this.master);
      const send = C.createGain(); send.gain.value = 0.38; this.bus.connect(send); send.connect(this.rev);

      const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.nbuf = nb;

      // ambient drone
      const dg = (this.droneG = C.createGain()); dg.gain.value = 0; dg.connect(this.bus);
      const dlp = C.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 160; dlp.Q.value = 4; dlp.connect(dg);
      [[41.2, "sawtooth"], [41.9, "sawtooth"], [82.4, "sine"], [61.7, "triangle"]].forEach(([f, t], i) => {
        const o = C.createOscillator(); o.type = t; o.frequency.value = f; const g = C.createGain(); g.gain.value = i === 2 ? 0.5 : 0.3; o.connect(g); g.connect(dlp); o.start();
      });
      const lfo = C.createOscillator(); lfo.frequency.value = 0.07; const lg = C.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(dlp.frequency); lfo.start();
      // thin eerie wail
      const wg = (this.wailG = C.createGain()); wg.gain.value = 0; wg.connect(this.bus);
      this.wail = C.createOscillator(); this.wail.type = "sine"; this.wail.frequency.value = 1180;
      const vib = C.createOscillator(); vib.frequency.value = 5.3; const vg = C.createGain(); vg.gain.value = 9; vib.connect(vg); vg.connect(this.wail.frequency); vib.start();
      this.wail.connect(wg); this.wail.start();
      // fluorescent hum
      const hum = C.createOscillator(); hum.type = "sawtooth"; hum.frequency.value = 100;
      const hl = C.createBiquadFilter(); hl.type = "bandpass"; hl.frequency.value = 300; hl.Q.value = 6;
      this.humG = C.createGain(); this.humG.gain.value = 0.012; hum.connect(hl); hl.connect(this.humG); this.humG.connect(this.bus); hum.start();

      // chase layer
      const cg = (this.chaseG = C.createGain()); cg.gain.value = 0; cg.connect(this.bus);
      const clp = C.createBiquadFilter(); clp.type = "lowpass"; clp.frequency.value = 900; clp.connect(cg);
      this.trem = C.createGain(); this.trem.gain.value = 0.5; this.trem.connect(clp);
      const tl = (this.tremLfo = C.createOscillator()); tl.frequency.value = 5; const tg = C.createGain(); tg.gain.value = 0.5; tl.connect(tg); tg.connect(this.trem.gain); tl.start();
      [[110, "sawtooth"], [155.6, "sawtooth"], [220.4, "square"], [329, "sawtooth"]].forEach(([f, t]) => {
        const o = C.createOscillator(); o.type = t; o.frequency.value = f; const g = C.createGain(); g.gain.value = 0.22; o.connect(g); g.connect(this.trem); o.start();
      });
      const rn = C.createBufferSource(); rn.buffer = nb; rn.loop = true;
      const rbp = C.createBiquadFilter(); rbp.type = "bandpass"; rbp.frequency.value = 2200; rbp.Q.value = 2;
      this.riseG = C.createGain(); this.riseG.gain.value = 0; rn.connect(rbp); rbp.connect(this.riseG); this.riseG.connect(this.bus); rn.start();

      // cart rumble
      const cn = C.createBufferSource(); cn.buffer = nb; cn.loop = true;
      const clf = C.createBiquadFilter(); clf.type = "lowpass"; clf.frequency.value = 380;
      this.rollG = C.createGain(); this.rollG.gain.value = 0; cn.connect(clf); clf.connect(this.rollG); this.rollG.connect(this.bus); cn.start();

      // creature 3D voice
      const pn = (this.cp = C.createPanner());
      pn.panningModel = "HRTF"; pn.distanceModel = "inverse"; pn.refDistance = 2.4; pn.rolloffFactor = 1.4; pn.maxDistance = 90;
      pn.connect(this.bus);
      const bn = C.createBufferSource(); bn.buffer = nb; bn.loop = true;
      const bbp = C.createBiquadFilter(); bbp.type = "bandpass"; bbp.frequency.value = 520; bbp.Q.value = 0.9;
      this.breathG = C.createGain(); this.breathG.gain.value = 0; bn.connect(bbp); bbp.connect(this.breathG); this.breathG.connect(pn); bn.start();
      const bl = C.createOscillator(); bl.frequency.value = 0.28; const blg = C.createGain(); blg.gain.value = 0.5; bl.connect(blg); blg.connect(this.breathG.gain); bl.start();
      const gr = C.createOscillator(); gr.type = "sawtooth"; gr.frequency.value = 46;
      const glp = C.createBiquadFilter(); glp.type = "lowpass"; glp.frequency.value = 170;
      this.growlG = C.createGain(); this.growlG.gain.value = 0; gr.connect(glp); glp.connect(this.growlG); this.growlG.connect(pn); gr.start();
      const gv = C.createOscillator(); gv.frequency.value = 9; const gvg = C.createGain(); gvg.gain.value = 6; gv.connect(gvg); gvg.connect(gr.frequency); gv.start();

      this.ready = true;
      this.droneG.gain.setTargetAtTime(0.2, C.currentTime, 3);
      this.wailG.gain.setTargetAtTime(0.012, C.currentTime, 5);
    },

    setMuted(m) { this.muted = m; if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); },
    suspend() { if (this.ready && this.ctx.state === "running") this.ctx.suspend(); },
    resume() { if (this.ready && this.ctx.state === "suspended") this.ctx.resume(); },

    tone(type, f0, f1, dur, vol, dest, delay, lp) {
      if (!this.ready) return; const C = this.ctx, t = C.currentTime + (delay || 0);
      const o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = o; if (lp) { const f = C.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; o.connect(f); n = f; }
      n.connect(g); g.connect(dest || this.bus); o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, vol, ftype, f0, f1, q, dest, delay) {
      if (!this.ready) return; const C = this.ctx, t = C.currentTime + (delay || 0);
      const s = C.createBufferSource(); s.buffer = this.nbuf; s.loop = true;
      const f = C.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 1;
      const g = C.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },

    /* ---- interface sounds ---- */
    uiHover() { this.tone("sine", 520, 700, 0.05, 0.016); },
    uiClick() { this.tone("square", 320, 170, 0.07, 0.035, null, 0, 1800); this.noise(0.05, 0.03, "bandpass", 2400, 1200, 2); },
    uiConfirm() { this.tone("sine", 95, 42, 0.5, 0.28, null, 0, 300); this.tone("sawtooth", 110, 230, 0.6, 0.045, null, 0.02, 900); this.noise(0.4, 0.05, "lowpass", 900, 150, 1); },
    uiToggle(open) { this.tone("triangle", open ? 380 : 320, open ? 600 : 190, 0.1, 0.04); this.noise(0.05, 0.02, "highpass", 3000, 5000, 1); },
    uiBack() { this.tone("sine", 260, 140, 0.16, 0.05); },
    tick() { this.tone("sine", 720, 940, 0.05, 0.028); },
    exhale() { this.noise(0.7, 0.07, "lowpass", 700, 160, 1); },
    heartbeat(v) { this.tone("sine", 68, 38, 0.2, v, null, 0, 200); this.tone("sine", 60, 34, 0.22, v * 0.7, null, 0.2, 200); },
    step(loud) { this.tone("sine", 95, 50, 0.09, 0.05 * loud); this.noise(0.07, 0.05 * loud, "lowpass", 700, 200, 1); },
    squeak() { const f = 1500 + Math.random() * 900; this.tone("sine", f, f * (1.1 + Math.random() * 0.3), 0.14 + Math.random() * 0.1, 0.03); },
    pickup() { this.noise(0.25, 0.12, "highpass", 2500, 6000, 1); this.tone("sine", 420, 300, 0.35, 0.08, null, 0, 900); this.tone("sine", 660, 880, 0.2, 0.05, null, 0.1); },
    clang(v) { const f = 300 + Math.random() * 700; this.noise(1.6, 0.28 * (v || 1), "bandpass", f, f * 0.97, 35); this.noise(0.1, 0.4 * (v || 1), "highpass", 3000, 5000, 1); },
    throwSfx() { this.noise(0.12, 0.08, "bandpass", 1200, 600, 2); },
    beep() { this.tone("square", 1760, 1760, 0.09, 0.05, null, 0, 3000); },
    ding() { this.tone("sine", 880, 880, 0.9, 0.08); this.tone("sine", 1320, 1320, 0.6, 0.04); },
    whisper() {
      if (!this.ready) return; const C = this.ctx;
      const pan = C.createStereoPanner(); pan.pan.value = Math.random() < 0.5 ? -0.9 : 0.9; pan.connect(this.bus);
      for (let k = 0; k < 4; k++) this.noise(0.45, 0.07, "bandpass", 500 + Math.random() * 1800, 800 + Math.random() * 1800, 9, pan, k * 0.38);
    },
    pa() {
      this.tone("sine", 660, 660, 0.9, 0.07, null, 0); this.tone("sine", 523, 523, 1.3, 0.07, null, 0.7);
      for (let k = 0; k < 6; k++) this.noise(0.35, 0.05, "bandpass", 900 + Math.random() * 1500, 500 + Math.random() * 1500, 4, null, 1.8 + k * 0.3);
      this.noise(1.8, 0.025, "highpass", 2000, 5000, 1, null, 1.6);
    },
    roar(dest, vol) {
      const d = dest || this.bus; vol = vol || 0.6;
      this.tone("sawtooth", 210, 60, 1.4, vol * 0.5, d, 0, 500); this.tone("sawtooth", 223, 65, 1.4, vol * 0.5, d, 0, 500);
      this.noise(1.3, vol * 0.55, "bandpass", 900, 250, 1.4, d);
    },
    stinger() { this.tone("sawtooth", 900, 300, 0.9, 0.12, null, 0, 2500); this.tone("sawtooth", 955, 310, 0.9, 0.1, null, 0, 2500); this.noise(0.6, 0.12, "highpass", 3000, 6000, 1); },
    creatureStep() { this.tone("sine", 70, 32, 0.18, 0.55, this.cp, 0, 250); this.noise(0.1, 0.2, "lowpass", 400, 100, 1, this.cp); },
    alarm() { for (let k = 0; k < 8; k++) { this.tone("square", 880, 880, 0.28, 0.07, null, k * 0.6, 1800); this.tone("square", 620, 620, 0.28, 0.07, null, k * 0.6 + 0.3, 1800); } },
    doorOpen() { this.noise(1.4, 0.1, "bandpass", 200, 90, 3); this.tone("sawtooth", 120, 80, 1.3, 0.05, null, 0, 400); },
    hide() { this.noise(0.4, 0.1, "lowpass", 600, 200, 1); this.tone("sine", 80, 50, 0.3, 0.1); },
    jump() {
      this.noise(1.6, 1.0, "lowpass", 9000, 300, 0.8);
      [190, 201, 297, 412].forEach((f) => this.tone("sawtooth", f * 2.2, f * 0.4, 1.5, 0.35, null, 0, 3500));
      this.tone("sine", 46, 28, 1.6, 0.9, null, 0, 200); this.noise(0.5, 0.6, "highpass", 3000, 9000, 1);
    },
    lose() { this.tone("sine", 55, 25, 3, 0.5, null, 0, 150); },
    win() { [220, 277, 330, 440].forEach((f, i) => this.tone("sine", f, f, 3.5, 0.1, null, i * 0.25, 700)); },

    update(dt, s) {
      if (!this.ready) return; const C = this.ctx, t = C.currentTime;
      this.chaseG.gain.setTargetAtTime(s.chase * 0.13, t, 0.4);
      this.tremLfo.frequency.setTargetAtTime(4 + s.chase * 4 + s.fear * 3, t, 0.3);
      this.riseG.gain.setTargetAtTime(s.chase * 0.012 + s.fear * 0.01, t, 0.4);
      this.droneG.gain.setTargetAtTime(0.2 + s.fear * 0.12, t, 1);
      this.wailG.gain.setTargetAtTime(0.012 + s.fear * 0.02, t, 1);
      this.wail.frequency.setTargetAtTime(1180 - s.fear * 500 + Math.sin(t * 0.3) * 60, t, 0.8);
      this.rollG.gain.setTargetAtTime(Math.min(1, s.speed / 5) * 0.08, t, 0.1);
      const cp = this.cp;
      if (cp.positionX) { cp.positionX.value = s.cx; cp.positionY.value = 1.8; cp.positionZ.value = s.cz; } else cp.setPosition(s.cx, 1.8, s.cz);
      this.breathG.gain.setTargetAtTime(0.5 + s.chase * 0.3, t, 0.2);
      this.growlG.gain.setTargetAtTime(s.chase * 0.3 + s.fear * 0.05, t, 0.3);
      const L = C.listener;
      if (L.positionX) {
        L.positionX.value = s.px; L.positionY.value = 1.6; L.positionZ.value = s.pz;
        L.forwardX.value = s.fx; L.forwardY.value = 0; L.forwardZ.value = s.fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else { L.setPosition(s.px, 1.6, s.pz); L.setOrientation(s.fx, 0, s.fz, 0, 1, 0); }
    },
  });
})();
