import { audio, NoiseLoop } from "../shared/audio";

/** Nova Strike sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private readonly last = new Map<string, number>();
  private readonly engine = new NoiseLoop({ type: "lowpass", freq: 320, q: 1.2 });
  private readonly rumble = new NoiseLoop({ type: "bandpass", freq: 90, q: 2 });
  private charge: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

  private ok(name: string, gap: number) {
    const now = performance.now();
    if (now - (this.last.get(name) ?? -1e9) < gap * 1000) return false;
    this.last.set(name, now);
    return true;
  }

  /** Engine hum; level 0 silences it. */
  engineHum(level: number, boost: number) {
    this.engine.set(level * (0.05 + boost * 0.05), 260 + boost * 520);
    this.rumble.set(level * 0.035 * (1 + boost), 70 + boost * 40);
  }

  laser(level: number) {
    if (!audio.sfxOn || !this.ok("laser", 0.045)) return;
    if (level > 1) {
      audio.tone(1500, 0.11, { type: "sawtooth", volume: 0.05, slide: -1100 });
      audio.tone(760, 0.12, { type: "square", volume: 0.04, slide: -500 });
    } else {
      audio.tone(1250, 0.09, { type: "square", volume: 0.045, slide: -900 });
    }
    audio.noise(0.05, { volume: 0.05, freq: 5200, type: "highpass" });
  }

  /** The rising charge whine, held until release(). */
  chargeStart() {
    const { ctx } = audio;
    if (!ctx || !audio.sfxOn || this.charge) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.75);
    lfo.frequency.value = 18;
    lfoGain.gain.value = 22;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.1);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    osc.connect(filter).connect(gain).connect(audio.sfxBus);
    osc.start(t);
    lfo.start(t);
    this.charge = { osc, lfo, gain };
  }

  chargeStop() {
    const c = this.charge;
    const { ctx } = audio;
    this.charge = null;
    if (!c || !ctx) return;
    const t = ctx.currentTime;
    c.gain.gain.cancelScheduledValues(t);
    c.gain.gain.setValueAtTime(Math.max(0.0001, c.gain.gain.value), t);
    c.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    c.osc.stop(t + 0.1);
    c.lfo.stop(t + 0.1);
  }

  charged() {
    audio.tone(1760, 0.12, { type: "triangle", volume: 0.08 });
    audio.tone(2637, 0.16, { type: "triangle", volume: 0.05, delay: 0.06 });
  }

  lock(n: number) {
    if (!this.ok("lock", 0.04)) return;
    audio.tone(1100 + n * 220, 0.07, { type: "square", volume: 0.06 });
    audio.tone(1100 + n * 220, 0.05, { type: "square", volume: 0.04, delay: 0.08 });
  }

  homing(n: number) {
    audio.noise(0.4, { volume: 0.16, freq: 1600, type: "bandpass", q: 1.5, slide: 2600 });
    audio.tone(420, 0.35, { type: "sawtooth", volume: 0.06, slide: 900 });
    if (n > 1) audio.jingle([84, 88, 91].slice(0, n - 1), { type: "square", volume: 0.03, step: 0.05 });
  }

  chargeShot() {
    audio.tone(240, 0.45, { type: "sawtooth", volume: 0.09, slide: -150 });
    audio.noise(0.5, { volume: 0.22, freq: 900, slide: -600 });
  }

  /** A hit on something that takes several shots. */
  hit() {
    if (!this.ok("hit", 0.05)) return;
    audio.noise(0.05, { volume: 0.1, freq: 2600, type: "bandpass", q: 2 });
    audio.tone(1900, 0.03, { type: "square", volume: 0.025 });
  }

  /** Shots bouncing off armour. */
  ping() {
    if (!this.ok("ping", 0.08)) return;
    audio.tone(2800, 0.07, { type: "triangle", volume: 0.05, slide: -600 });
  }

  explosion(size: 0 | 1 | 2) {
    if (!this.ok("boom" + size, size === 2 ? 0.1 : 0.06)) return;
    if (size === 0) {
      audio.noise(0.35, { volume: 0.22, freq: 1500, slide: -1200 });
      audio.tone(140, 0.2, { type: "sine", volume: 0.16, slide: -90 });
    } else if (size === 1) {
      audio.noise(0.7, { volume: 0.36, freq: 1300, slide: -1150 });
      audio.noise(0.25, { volume: 0.18, freq: 4200, type: "highpass" });
      audio.tone(90, 0.5, { type: "sine", volume: 0.3, slide: -55 });
    } else {
      audio.noise(1.6, { volume: 0.55, freq: 1100, slide: -1000 });
      audio.noise(0.5, { volume: 0.3, freq: 5000, type: "highpass", delay: 0.04 });
      audio.tone(60, 1.3, { type: "sine", volume: 0.5, slide: -30 });
      audio.tone(110, 0.6, { type: "triangle", volume: 0.18, slide: -70, delay: 0.1 });
    }
  }

  shieldHit(heavy = false) {
    if (!this.ok("shield", 0.12)) return;
    audio.tone(heavy ? 160 : 240, 0.28, { type: "sawtooth", volume: 0.12, slide: -120 });
    audio.noise(0.25, { volume: heavy ? 0.32 : 0.2, freq: 900, type: "bandpass", q: 1.2, slide: -600 });
  }

  deflect() {
    if (!this.ok("deflect", 0.05)) return;
    audio.tone(1800, 0.12, { type: "triangle", volume: 0.07, slide: 900 });
    audio.noise(0.06, { volume: 0.08, freq: 6000, type: "highpass" });
  }

  roll() {
    audio.noise(0.45, { volume: 0.2, freq: 500, type: "bandpass", q: 1.6, slide: 2400 });
    audio.tone(300, 0.3, { type: "sine", volume: 0.05, slide: 400 });
  }

  boost() {
    if (!this.ok("boost", 0.3)) return;
    audio.noise(0.6, { volume: 0.18, freq: 400, type: "bandpass", q: 1, slide: 1800 });
  }

  brake() {
    if (!this.ok("brake", 0.3)) return;
    audio.noise(0.4, { volume: 0.12, freq: 1600, type: "bandpass", q: 1.2, slide: -1200 });
  }

  bombLaunch() {
    audio.tone(200, 0.4, { type: "sawtooth", volume: 0.08, slide: 600 });
    audio.noise(0.3, { volume: 0.15, freq: 1200, type: "bandpass", slide: 1500 });
  }

  bomb() {
    audio.noise(2.4, { volume: 0.7, freq: 900, slide: -820 });
    audio.tone(45, 1.8, { type: "sine", volume: 0.6, slide: -20 });
    audio.tone(180, 0.9, { type: "sawtooth", volume: 0.08, slide: -150 });
    audio.noise(0.8, { volume: 0.25, freq: 6000, type: "highpass", delay: 0.05 });
  }

  ring() {
    audio.jingle([76, 79, 83, 88], { type: "triangle", volume: 0.12, step: 0.05 });
  }

  pickup() {
    audio.jingle([72, 76, 79, 84, 88], { type: "square", volume: 0.06, step: 0.045 });
  }

  /** Boss warning siren: four rising whoops. */
  siren() {
    for (let i = 0; i < 4; i++) {
      audio.tone(520, 0.42, { type: "sawtooth", volume: 0.07, slide: 420, delay: i * 0.55 });
      audio.tone(526, 0.42, { type: "square", volume: 0.035, slide: 420, delay: i * 0.55 });
    }
  }

  /** Short warning blip (incoming meteors, laser gates). */
  alert() {
    if (!this.ok("alert", 0.5)) return;
    audio.tone(880, 0.1, { type: "square", volume: 0.05 });
    audio.tone(880, 0.1, { type: "square", volume: 0.05, delay: 0.16 });
  }

  /** A boss charging an attack. */
  bossCharge() {
    if (!this.ok("bcharge", 0.3)) return;
    audio.tone(110, 0.9, { type: "sawtooth", volume: 0.07, slide: 500 });
    audio.noise(0.9, { volume: 0.08, freq: 300, type: "bandpass", q: 3, slide: 1600 });
  }

  beam() {
    if (!this.ok("beam", 0.2)) return;
    audio.tone(70, 1.2, { type: "sawtooth", volume: 0.1, slide: 20 });
    audio.noise(1.2, { volume: 0.14, freq: 2400, type: "bandpass", q: 4 });
  }

  enemyShot() {
    if (!audio.sfxOn || !this.ok("eshot", 0.07)) return;
    audio.tone(520, 0.1, { type: "square", volume: 0.03, slide: -300 });
  }

  checkpoint() {
    audio.jingle([72, 79, 84], { type: "triangle", volume: 0.12, step: 0.08 });
  }

  medal(tier: number) {
    const notes = tier >= 3 ? [72, 76, 79, 84, 88, 91, 96] : tier === 2 ? [72, 76, 79, 84, 88] : [72, 76, 79];
    audio.jingle(notes, { type: "triangle", volume: 0.14, step: 0.08 });
  }

  combo(mult: number) {
    audio.tone(660 * Math.pow(2, Math.min(mult, 8) / 12), 0.12, { type: "square", volume: 0.04 });
  }

  lifeLost() {
    audio.tone(440, 0.8, { type: "sawtooth", volume: 0.08, slide: -360 });
    audio.tone(330, 0.9, { type: "square", volume: 0.05, slide: -260, delay: 0.15 });
  }

  start() {
    audio.jingle([62, 69, 74, 81], { type: "square", volume: 0.07, step: 0.07 });
    audio.noise(0.8, { volume: 0.18, freq: 300, type: "bandpass", slide: 2000 });
  }

  ui() {
    audio.tone(1320, 0.05, { type: "square", volume: 0.04 });
  }

  silence() {
    this.engineHum(0, 0);
    this.chargeStop();
  }

  dispose() {
    this.chargeStop();
    this.engine.stop();
    this.rumble.stop();
  }
}
