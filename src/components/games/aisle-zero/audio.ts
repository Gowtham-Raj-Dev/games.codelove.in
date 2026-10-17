import { audio } from "../shared/audio";

/**
 * Aisle Zero's horror soundscape, synthesized (no audio files) on the shared audio hub: the store's
 * ambience (drone, wail, fluorescent hum, the chase layer) plays on the music bus, so the music button
 * silences it; everything else — footsteps, the cart, the creature's 3D breathing and roars, pickups —
 * is a sound effect. A big empty-store reverb sits under both.
 */

export interface SoundState {
  chase: number;
  fear: number;
  speed: number;
  /** Creature position, player position and facing (for the 3D voice). */
  cx: number;
  cz: number;
  px: number;
  pz: number;
  fx: number;
  fz: number;
}

type Dest = AudioNode | null | undefined;

export class Sfx {
  ready = false;
  private ctx!: AudioContext;
  private bus!: GainNode;
  private amb!: GainNode;
  private nbuf!: AudioBuffer;
  private droneG!: GainNode;
  private wailG!: GainNode;
  private wail!: OscillatorNode;
  private chaseG!: GainNode;
  private tremLfo!: OscillatorNode;
  private riseG!: GainNode;
  private rollG!: GainNode;
  private breathG!: GainNode;
  private growlG!: GainNode;
  /** The creature's voice: a 3D panner the player hears from where it is. */
  cp: PannerNode | null = null;
  private readonly loops: AudioScheduledSourceNode[] = [];
  private readonly outs: AudioNode[] = [];

  /** Builds the graph once audio is running (the first tap or key press). Safe to call often. */
  init() {
    if (this.ready) return;
    const C = audio.ctx;
    if (!C || !audio.sfxBus || !audio.musicBus) return;
    this.ctx = C;
    const start = <T extends AudioScheduledSourceNode>(n: T) => {
      n.start();
      this.loops.push(n);
      return n;
    };

    // Two outputs: effects (sfx bus) and ambience (music bus). The hub's buses are quieter than the old
    // standalone master, so both are lifted to keep the original balance.
    this.bus = C.createGain();
    this.bus.gain.value = 1.25;
    this.bus.connect(audio.sfxBus);
    this.amb = C.createGain();
    this.amb.gain.value = 1.9;
    this.amb.connect(audio.musicBus);
    this.outs.push(this.bus, this.amb);

    // reverb (big empty store)
    const len = (C.sampleRate * 3.2) | 0;
    const ib = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ib.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const rev = C.createConvolver();
    rev.buffer = ib;
    const revG = C.createGain();
    revG.gain.value = 0.55;
    rev.connect(revG).connect(this.bus);
    const send = C.createGain();
    send.gain.value = 0.38;
    this.bus.connect(send).connect(rev);
    const ambSend = C.createGain();
    ambSend.gain.value = 0.38;
    this.amb.connect(ambSend).connect(rev);

    this.nbuf = audio.noiseBuffer;
    const nb = this.nbuf;

    // ambient drone
    const dg = (this.droneG = C.createGain());
    dg.gain.value = 0;
    dg.connect(this.amb);
    const dlp = C.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 160;
    dlp.Q.value = 4;
    dlp.connect(dg);
    (
      [
        [41.2, "sawtooth"],
        [41.9, "sawtooth"],
        [82.4, "sine"],
        [61.7, "triangle"],
      ] as const
    ).forEach(([f, t], i) => {
      const o = C.createOscillator();
      o.type = t;
      o.frequency.value = f;
      const g = C.createGain();
      g.gain.value = i === 2 ? 0.5 : 0.3;
      o.connect(g).connect(dlp);
      start(o);
    });
    const lfo = C.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = C.createGain();
    lg.gain.value = 70;
    lfo.connect(lg).connect(dlp.frequency);
    start(lfo);
    // thin eerie wail
    const wg = (this.wailG = C.createGain());
    wg.gain.value = 0;
    wg.connect(this.amb);
    this.wail = C.createOscillator();
    this.wail.type = "sine";
    this.wail.frequency.value = 1180;
    const vib = C.createOscillator();
    vib.frequency.value = 5.3;
    const vg = C.createGain();
    vg.gain.value = 9;
    vib.connect(vg).connect(this.wail.frequency);
    start(vib);
    this.wail.connect(wg);
    start(this.wail);
    // fluorescent hum
    const hum = C.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 100;
    const hl = C.createBiquadFilter();
    hl.type = "bandpass";
    hl.frequency.value = 300;
    hl.Q.value = 6;
    const humG = C.createGain();
    humG.gain.value = 0.012;
    hum.connect(hl).connect(humG).connect(this.amb);
    start(hum);

    // chase layer
    const cg = (this.chaseG = C.createGain());
    cg.gain.value = 0;
    cg.connect(this.amb);
    const clp = C.createBiquadFilter();
    clp.type = "lowpass";
    clp.frequency.value = 900;
    clp.connect(cg);
    const trem = C.createGain();
    trem.gain.value = 0.5;
    trem.connect(clp);
    const tl = (this.tremLfo = C.createOscillator());
    tl.frequency.value = 5;
    const tg = C.createGain();
    tg.gain.value = 0.5;
    tl.connect(tg).connect(trem.gain);
    start(tl);
    (
      [
        [110, "sawtooth"],
        [155.6, "sawtooth"],
        [220.4, "square"],
        [329, "sawtooth"],
      ] as const
    ).forEach(([f, t]) => {
      const o = C.createOscillator();
      o.type = t;
      o.frequency.value = f;
      const g = C.createGain();
      g.gain.value = 0.22;
      o.connect(g).connect(trem);
      start(o);
    });
    const rn = C.createBufferSource();
    rn.buffer = nb;
    rn.loop = true;
    const rbp = C.createBiquadFilter();
    rbp.type = "bandpass";
    rbp.frequency.value = 2200;
    rbp.Q.value = 2;
    this.riseG = C.createGain();
    this.riseG.gain.value = 0;
    rn.connect(rbp).connect(this.riseG).connect(this.amb);
    start(rn);

    // cart rumble
    const cn = C.createBufferSource();
    cn.buffer = nb;
    cn.loop = true;
    const clf = C.createBiquadFilter();
    clf.type = "lowpass";
    clf.frequency.value = 380;
    this.rollG = C.createGain();
    this.rollG.gain.value = 0;
    cn.connect(clf).connect(this.rollG).connect(this.bus);
    start(cn);

    // creature 3D voice
    const pn = (this.cp = C.createPanner());
    pn.panningModel = "HRTF";
    pn.distanceModel = "inverse";
    pn.refDistance = 2.4;
    pn.rolloffFactor = 1.4;
    pn.maxDistance = 90;
    pn.connect(this.bus);
    const bn = C.createBufferSource();
    bn.buffer = nb;
    bn.loop = true;
    const bbp = C.createBiquadFilter();
    bbp.type = "bandpass";
    bbp.frequency.value = 520;
    bbp.Q.value = 0.9;
    this.breathG = C.createGain();
    this.breathG.gain.value = 0;
    bn.connect(bbp).connect(this.breathG).connect(pn);
    start(bn);
    const bl = C.createOscillator();
    bl.frequency.value = 0.28;
    const blg = C.createGain();
    blg.gain.value = 0.5;
    bl.connect(blg).connect(this.breathG.gain);
    start(bl);
    const gr = C.createOscillator();
    gr.type = "sawtooth";
    gr.frequency.value = 46;
    const glp = C.createBiquadFilter();
    glp.type = "lowpass";
    glp.frequency.value = 170;
    this.growlG = C.createGain();
    this.growlG.gain.value = 0;
    gr.connect(glp).connect(this.growlG).connect(pn);
    start(gr);
    const gv = C.createOscillator();
    gv.frequency.value = 9;
    const gvg = C.createGain();
    gvg.gain.value = 6;
    gv.connect(gvg).connect(gr.frequency);
    start(gv);

    this.ready = true;
    this.droneG.gain.setTargetAtTime(0.2, C.currentTime, 3);
    this.wailG.gain.setTargetAtTime(0.012, C.currentTime, 5);
  }

  dispose() {
    for (const n of this.loops) {
      try {
        n.stop();
      } catch {
        // Already stopped.
      }
      n.disconnect();
    }
    this.loops.length = 0;
    for (const n of this.outs) n.disconnect();
    this.cp?.disconnect();
    this.ready = false;
  }

  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, dest?: Dest, delay = 0, lp = 0) {
    if (!this.ready) return;
    const C = this.ctx;
    const t = C.currentTime + delay;
    const o = C.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n: AudioNode = o;
    if (lp) {
      const f = C.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      o.connect(f);
      n = f;
    }
    n.connect(g);
    g.connect(dest || this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur: number, vol: number, ftype: BiquadFilterType, f0: number, f1: number, q = 1, dest?: Dest, delay = 0) {
    if (!this.ready) return;
    const C = this.ctx;
    const t = C.currentTime + delay;
    const s = C.createBufferSource();
    s.buffer = this.nbuf;
    s.loop = true;
    const f = C.createBiquadFilter();
    f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.bus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  // --- interface sounds ---
  uiToggle(open: boolean) {
    this.tone("triangle", open ? 380 : 320, open ? 600 : 190, 0.1, 0.04);
    this.noise(0.05, 0.02, "highpass", 3000, 5000, 1);
  }
  uiConfirm() {
    this.tone("sine", 95, 42, 0.5, 0.28, null, 0, 300);
    this.tone("sawtooth", 110, 230, 0.6, 0.045, null, 0.02, 900);
    this.noise(0.4, 0.05, "lowpass", 900, 150, 1);
  }
  uiBack() {
    this.tone("sine", 260, 140, 0.16, 0.05);
  }
  tick() {
    this.tone("sine", 720, 940, 0.05, 0.028);
  }
  flashClick() {
    this.tone("square", 1200, 900, 0.04, 0.05);
  }
  crouch(down: boolean) {
    this.tone("sine", down ? 210 : 150, down ? 130 : 220, 0.09, 0.035);
  }
  exhale() {
    this.noise(0.7, 0.07, "lowpass", 700, 160, 1);
  }
  heartbeat(v: number) {
    this.tone("sine", 68, 38, 0.2, v, null, 0, 200);
    this.tone("sine", 60, 34, 0.22, v * 0.7, null, 0.2, 200);
  }
  step(loud: number) {
    this.tone("sine", 95, 50, 0.09, 0.05 * loud);
    this.noise(0.07, 0.05 * loud, "lowpass", 700, 200, 1);
  }
  squeak() {
    const f = 1500 + Math.random() * 900;
    this.tone("sine", f, f * (1.1 + Math.random() * 0.3), 0.14 + Math.random() * 0.1, 0.03);
  }
  pickup() {
    this.noise(0.25, 0.12, "highpass", 2500, 6000, 1);
    this.tone("sine", 420, 300, 0.35, 0.08, null, 0, 900);
    this.tone("sine", 660, 880, 0.2, 0.05, null, 0.1);
  }
  clang(v = 1) {
    const f = 300 + Math.random() * 700;
    this.noise(1.6, 0.28 * v, "bandpass", f, f * 0.97, 35);
    this.noise(0.1, 0.4 * v, "highpass", 3000, 5000, 1);
  }
  throwSfx() {
    this.noise(0.12, 0.08, "bandpass", 1200, 600, 2);
  }
  beep() {
    this.tone("square", 1760, 1760, 0.09, 0.05, null, 0, 3000);
  }
  ding() {
    this.tone("sine", 880, 880, 0.9, 0.08);
    this.tone("sine", 1320, 1320, 0.6, 0.04);
  }
  whisper() {
    if (!this.ready) return;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() < 0.5 ? -0.9 : 0.9;
    pan.connect(this.bus);
    for (let k = 0; k < 4; k++) this.noise(0.45, 0.07, "bandpass", 500 + Math.random() * 1800, 800 + Math.random() * 1800, 9, pan, k * 0.38);
    setTimeout(() => pan.disconnect(), 3000);
  }
  pa() {
    this.tone("sine", 660, 660, 0.9, 0.07, null, 0);
    this.tone("sine", 523, 523, 1.3, 0.07, null, 0.7);
    for (let k = 0; k < 6; k++) this.noise(0.35, 0.05, "bandpass", 900 + Math.random() * 1500, 500 + Math.random() * 1500, 4, null, 1.8 + k * 0.3);
    this.noise(1.8, 0.025, "highpass", 2000, 5000, 1, null, 1.6);
  }
  /** A roar, from the creature (`at3d`) or all around. */
  roar(vol = 0.6, at3d = true) {
    const d = at3d ? this.cp : null;
    this.tone("sawtooth", 210, 60, 1.4, vol * 0.5, d, 0, 500);
    this.tone("sawtooth", 223, 65, 1.4, vol * 0.5, d, 0, 500);
    this.noise(1.3, vol * 0.55, "bandpass", 900, 250, 1.4, d);
  }
  stinger() {
    this.tone("sawtooth", 900, 300, 0.9, 0.12, null, 0, 2500);
    this.tone("sawtooth", 955, 310, 0.9, 0.1, null, 0, 2500);
    this.noise(0.6, 0.12, "highpass", 3000, 6000, 1);
  }
  creatureStep() {
    this.tone("sine", 70, 32, 0.18, 0.55, this.cp, 0, 250);
    this.noise(0.1, 0.2, "lowpass", 400, 100, 1, this.cp);
  }
  alarm() {
    for (let k = 0; k < 8; k++) {
      this.tone("square", 880, 880, 0.28, 0.07, null, k * 0.6, 1800);
      this.tone("square", 620, 620, 0.28, 0.07, null, k * 0.6 + 0.3, 1800);
    }
  }
  doorOpen() {
    this.noise(1.4, 0.1, "bandpass", 200, 90, 3);
    this.tone("sawtooth", 120, 80, 1.3, 0.05, null, 0, 400);
  }
  hide() {
    this.noise(0.4, 0.1, "lowpass", 600, 200, 1);
    this.tone("sine", 80, 50, 0.3, 0.1);
  }
  jump() {
    this.noise(1.6, 1.0, "lowpass", 9000, 300, 0.8);
    [190, 201, 297, 412].forEach((f) => this.tone("sawtooth", f * 2.2, f * 0.4, 1.5, 0.35, null, 0, 3500));
    this.tone("sine", 46, 28, 1.6, 0.9, null, 0, 200);
    this.noise(0.5, 0.6, "highpass", 3000, 9000, 1);
  }
  lose() {
    this.tone("sine", 55, 25, 3, 0.5, null, 0, 150);
  }
  win() {
    [220, 277, 330, 440].forEach((f, i) => this.tone("sine", f, f, 3.5, 0.1, null, i * 0.25, 700));
  }
  /** The apparition vanishing when stared at. */
  hiss() {
    this.noise(0.5, 0.1, "highpass", 2500, 6000, 1);
  }
  /** A low thud somewhere in the store. */
  rumble() {
    this.noise(1.2, 0.1, "lowpass", 500, 80, 1);
  }

  /** Silences the chase layer at once (after death). */
  quietChase() {
    if (this.ready) this.chaseG.gain.value = 0;
  }

  update(s: SoundState) {
    if (!this.ready || !this.cp) return;
    const C = this.ctx;
    const t = C.currentTime;
    this.chaseG.gain.setTargetAtTime(s.chase * 0.13, t, 0.4);
    this.tremLfo.frequency.setTargetAtTime(4 + s.chase * 4 + s.fear * 3, t, 0.3);
    this.riseG.gain.setTargetAtTime(s.chase * 0.012 + s.fear * 0.01, t, 0.4);
    this.droneG.gain.setTargetAtTime(0.2 + s.fear * 0.12, t, 1);
    this.wailG.gain.setTargetAtTime(0.012 + s.fear * 0.02, t, 1);
    this.wail.frequency.setTargetAtTime(1180 - s.fear * 500 + Math.sin(t * 0.3) * 60, t, 0.8);
    this.rollG.gain.setTargetAtTime(Math.min(1, s.speed / 5) * 0.08, t, 0.1);
    const cp = this.cp;
    if (cp.positionX) {
      cp.positionX.value = s.cx;
      cp.positionY.value = 1.8;
      cp.positionZ.value = s.cz;
    } else cp.setPosition(s.cx, 1.8, s.cz);
    this.breathG.gain.setTargetAtTime(0.5 + s.chase * 0.3, t, 0.2);
    this.growlG.gain.setTargetAtTime(s.chase * 0.3 + s.fear * 0.05, t, 0.3);
    const L = C.listener;
    if (L.positionX) {
      L.positionX.value = s.px;
      L.positionY.value = 1.6;
      L.positionZ.value = s.pz;
      L.forwardX.value = s.fx;
      L.forwardY.value = 0;
      L.forwardZ.value = s.fz;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(s.px, 1.6, s.pz);
      L.setOrientation(s.fx, 0, s.fz, 0, 1, 0);
    }
  }
}
