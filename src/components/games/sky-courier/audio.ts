import { audio, NoiseLoop } from "../shared/audio";

/** Sky Courier sound effects, synthesized on the shared audio hub (no audio files). Chimes are in D major, like the waltz. */
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const CHIME = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95];

export class Sfx {
  private readonly engine = new NoiseLoop({ type: "lowpass", freq: 240, q: 1.4 });
  private readonly wind = new NoiseLoop({ type: "bandpass", freq: 900, q: 0.55 });
  private readonly rush = new NoiseLoop({ type: "highpass", freq: 2400, q: 0.3 });
  private prop: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode; depth: GainNode; filter: BiquadFilterNode } | null = null;
  private chimeStep = 0;
  private lastChime = 0;
  private lastBump = 0;
  private lastChirp = 0;

  /** Called every frame while flying (or idling on the menu). */
  flight(throttle: number, speed: number, boost: boolean, on: boolean) {
    if (!on || !audio.ctx) {
      this.engine.set(0);
      this.wind.set(0);
      this.rush.set(0);
      this.propLevel(0, 0);
      return;
    }
    const s = Math.min(1, speed / 55);
    this.engine.set(0.05 + throttle * 0.1 + (boost ? 0.08 : 0), 180 + throttle * 260 + (boost ? 260 : 0));
    this.wind.set(0.015 + s * s * 0.14, 500 + s * 1400);
    this.rush.set(boost ? 0.07 : s > 0.7 ? (s - 0.7) * 0.18 : 0, 2600);
    this.propLevel(0.035 + throttle * 0.05 + (boost ? 0.03 : 0), 7 + throttle * 16 + (boost ? 8 : 0));
  }

  private propLevel(level: number, rate: number) {
    const ctx = audio.ctx;
    if (!ctx || !audio.sfxBus) return;
    if (!this.prop) {
      if (level <= 0) return;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 70;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 380;
      filter.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 10;
      const depth = ctx.createGain();
      depth.gain.value = 0;
      lfo.connect(depth).connect(gain.gain);
      osc.connect(filter).connect(gain).connect(audio.sfxBus);
      osc.start();
      lfo.start();
      this.prop = { osc, lfo, gain, depth, filter };
    }
    const t = ctx.currentTime;
    const p = this.prop;
    p.gain.gain.setTargetAtTime(level, t, 0.08);
    p.depth.gain.setTargetAtTime(level * 0.8, t, 0.08);
    p.lfo.frequency.setTargetAtTime(rate, t, 0.15);
    p.osc.frequency.setTargetAtTime(52 + rate * 2.4, t, 0.15);
    p.filter.frequency.setTargetAtTime(260 + rate * 14, t, 0.15);
  }

  /** Flying through a ring: a chime that climbs while you keep the chain going. */
  ring(gold = false) {
    const now = performance.now();
    this.chimeStep = now - this.lastChime < 3500 ? Math.min(CHIME.length - 1, this.chimeStep + 1) : 0;
    this.lastChime = now;
    const n = CHIME[this.chimeStep];
    audio.tone(midi(n), 0.6, { type: "sine", volume: 0.2, attack: 0.005 });
    audio.tone(midi(n + 12), 0.4, { type: "triangle", volume: 0.06, delay: 0.03 });
    audio.tone(midi(n + 7), 0.5, { type: "sine", volume: 0.08, delay: 0.07 });
    if (gold) audio.jingle([n, n + 4, n + 7, n + 12], { type: "triangle", volume: 0.1, step: 0.06 });
    audio.noise(0.4, { volume: 0.1, freq: 3000, type: "bandpass", q: 0.8, slide: 2400 });
  }

  boost() {
    audio.noise(0.9, { volume: 0.28, freq: 500, type: "bandpass", q: 0.7, slide: 2600 });
    audio.tone(110, 0.6, { type: "sawtooth", volume: 0.05, slide: 160 });
  }

  pickup() {
    audio.jingle([62, 66, 69, 74], { type: "triangle", volume: 0.16, step: 0.075 });
    audio.noise(0.2, { volume: 0.12, freq: 1800, type: "bandpass" });
  }

  deliver(big: boolean) {
    audio.jingle(big ? [74, 78, 81, 86, 90] : [74, 78, 81, 86], { type: "triangle", volume: 0.17, step: 0.085 });
    for (let i = 0; i < (big ? 7 : 4); i++) audio.tone(midi(93 + (i % 3) * 2), 0.12, { type: "square", volume: 0.025, delay: 0.35 + i * 0.06 });
  }

  late() {
    audio.tone(midi(57), 0.5, { type: "triangle", volume: 0.14, slide: -40 });
    audio.tone(midi(53), 0.6, { type: "triangle", volume: 0.12, delay: 0.18, slide: -30 });
  }

  tick(urgent: boolean) {
    audio.tone(urgent ? 1320 : 990, 0.05, { type: "square", volume: 0.035 });
  }

  bump(power: number) {
    const now = performance.now();
    if (now - this.lastBump < 120) return;
    this.lastBump = now;
    const v = Math.min(1, 0.35 + power);
    audio.tone(62, 0.45, { type: "sine", volume: 0.5 * v, slide: -24 });
    audio.noise(0.35, { volume: 0.4 * v, freq: 420, slide: -260 });
    audio.tone(190, 0.25, { type: "square", volume: 0.06 * v, slide: -120, delay: 0.02 });
  }

  balloon() {
    audio.tone(180, 0.35, { type: "sine", volume: 0.3, slide: 220 });
    audio.tone(120, 0.3, { type: "sine", volume: 0.2, slide: -50, delay: 0.05 });
    audio.noise(0.2, { volume: 0.12, freq: 700 });
  }

  birds() {
    const now = performance.now();
    if (now - this.lastChirp < 200) return;
    this.lastChirp = now;
    for (let i = 0; i < 6; i++) {
      const f = 2100 + Math.random() * 1600;
      audio.tone(f, 0.09, { type: "sine", volume: 0.07, slide: 900 + Math.random() * 600, delay: i * 0.07 + Math.random() * 0.03 });
    }
    audio.noise(0.3, { volume: 0.18, freq: 2600, type: "bandpass", q: 1.2 });
  }

  chirp(near: number) {
    if (near <= 0.02) return;
    const f = 2400 + Math.random() * 1500;
    audio.tone(f, 0.07, { type: "sine", volume: 0.04 * near, slide: 700 });
    audio.tone(f * 1.1, 0.06, { type: "sine", volume: 0.03 * near, slide: 500, delay: 0.09 });
  }

  thunder(near: number, delay: number) {
    const v = 0.2 + near * 0.6;
    audio.noise(2.4, { volume: 0.45 * v, freq: 260, slide: -180, delay });
    audio.tone(42, 1.6, { type: "sine", volume: 0.3 * v, slide: -12, delay });
  }

  zap() {
    audio.noise(0.25, { volume: 0.5, freq: 5200, type: "highpass" });
    audio.tone(880, 0.2, { type: "sawtooth", volume: 0.08, slide: -700 });
  }

  updraft() {
    audio.noise(1.4, { volume: 0.12, freq: 380, type: "bandpass", q: 0.5, slide: 900 });
  }

  countdown(go: boolean) {
    if (go) audio.jingle([74, 81, 86], { type: "square", volume: 0.08, step: 0.05 });
    else audio.tone(midi(69), 0.18, { type: "square", volume: 0.07 });
  }

  warn() {
    audio.tone(660, 0.1, { type: "square", volume: 0.04 });
    audio.tone(520, 0.1, { type: "square", volume: 0.04, delay: 0.13 });
  }

  click() {
    audio.tone(1200, 0.04, { type: "triangle", volume: 0.05 });
  }

  medal(level: number) {
    const base = [74, 78, 81, 86];
    audio.jingle(level >= 3 ? [...base, 90, 93] : level === 2 ? [...base, 90] : base, { type: "triangle", volume: 0.16, step: 0.1 });
  }

  silence() {
    this.flight(0, 0, false, false);
  }

  dispose() {
    this.engine.stop();
    this.wind.stop();
    this.rush.stop();
    if (this.prop) {
      try {
        this.prop.osc.stop();
        this.prop.lfo.stop();
      } catch {
        // Already stopped.
      }
      this.prop.gain.disconnect();
      this.prop = null;
    }
  }
}
