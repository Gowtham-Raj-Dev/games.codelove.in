import { audio, NoiseLoop } from "../shared/audio";

/** A droning two-oscillator engine whose pitch follows the kart's speed through three "gears". */
class EngineVoice {
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;

  set(level: number, freq: number) {
    const { ctx } = audio;
    if (!ctx || !audio.sfxBus) return;
    if (!this.gain) {
      this.osc1 = ctx.createOscillator();
      this.osc2 = ctx.createOscillator();
      this.osc1.type = "sawtooth";
      this.osc2.type = "square";
      this.filter = ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.Q.value = 3;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      const sub = ctx.createGain();
      sub.gain.value = 0.55;
      this.osc1.connect(this.filter);
      this.osc2.connect(sub).connect(this.filter);
      this.filter.connect(this.gain).connect(audio.sfxBus);
      this.osc1.start();
      this.osc2.start();
    }
    const t = ctx.currentTime;
    this.gain.gain.setTargetAtTime(level, t, 0.05);
    this.osc1!.frequency.setTargetAtTime(freq, t, 0.05);
    this.osc2!.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.filter!.frequency.setTargetAtTime(380 + freq * 4, t, 0.08);
  }

  stop() {
    try {
      this.osc1?.stop();
      this.osc2?.stop();
    } catch {
      // Already stopped.
    }
    this.gain?.disconnect();
    this.osc1 = this.osc2 = null;
    this.filter = null;
    this.gain = null;
  }
}

/** Turbo Karts sound effects, all synthesized on the shared audio hub. */
export class Sfx {
  private readonly engine = new EngineVoice();
  private readonly roar = new NoiseLoop({ type: "bandpass", freq: 300, q: 1.2 });
  private readonly screech = new NoiseLoop({ type: "bandpass", freq: 2300, q: 7 });
  private readonly rumble = new NoiseLoop({ type: "lowpass", freq: 220, q: 0.8 });
  private readonly wind = new NoiseLoop({ type: "highpass", freq: 1800, q: 0.5 });
  private coinStep = 0;
  private lastCoin = 0;
  private lastWall = 0;

  /** Every frame while racing: speed 0..1+ (boost goes above 1), drifting, on grass, boosting. */
  drive(speedT: number, throttle: number, drifting: boolean, driftLevel: number, offroad: boolean, boosting: boolean, airborne: boolean) {
    const v = Math.max(0, Math.min(1.4, speedT));
    // Three gears: the pitch climbs, then drops a little at each shift.
    const gears = [0, 0.3, 0.62, 1.45];
    let g = 0;
    while (g < gears.length - 2 && v > gears[g + 1]) g++;
    const local = (v - gears[g]) / (gears[g + 1] - gears[g]);
    const freq = 52 + g * 16 + local * 62 + (boosting ? 18 : 0) + (airborne ? 14 : 0);
    this.engine.set(0.05 + throttle * 0.035 + v * 0.03, freq);
    this.roar.set(0.05 + v * 0.1, 220 + v * 500);
    this.screech.set(drifting && !airborne ? 0.07 + driftLevel * 0.025 : 0, 1900 + driftLevel * 350);
    this.rumble.set(offroad && v > 0.1 && !airborne ? 0.3 : 0, 180 + v * 200);
    this.wind.set(boosting ? 0.1 : v * 0.03, 1400 + v * 1600);
  }

  quiet() {
    this.engine.set(0, 50);
    this.roar.set(0);
    this.screech.set(0);
    this.rumble.set(0);
    this.wind.set(0);
  }

  /** Idle engine on menus / the grid. */
  idle(level = 0.05) {
    this.engine.set(level, 50);
    this.roar.set(level * 0.6, 200);
    this.screech.set(0);
    this.rumble.set(0);
    this.wind.set(0);
  }

  beep(go: boolean) {
    if (go) {
      audio.tone(880, 0.5, { type: "square", volume: 0.13 });
      audio.tone(1320, 0.5, { type: "triangle", volume: 0.08, delay: 0.02 });
    } else audio.tone(440, 0.28, { type: "square", volume: 0.12 });
  }

  rev() {
    audio.tone(70, 0.5, { type: "sawtooth", volume: 0.08, slide: 90 });
  }

  boost(strength = 1) {
    audio.noise(0.55 + strength * 0.2, { volume: 0.35, freq: 500, type: "bandpass", slide: 2600, q: 1.1 });
    audio.tone(160, 0.4, { type: "sawtooth", volume: 0.07, slide: 220 });
  }

  miniTurbo(level: number) {
    audio.noise(0.35 + level * 0.15, { volume: 0.32, freq: 700 + level * 300, type: "bandpass", slide: 2400, q: 1.3 });
    audio.tone(330 + level * 110, 0.18, { type: "square", volume: 0.06, slide: 300 });
  }

  hop() {
    audio.tone(220, 0.12, { type: "triangle", volume: 0.12, slide: 180 });
  }

  driftLevel(level: number) {
    const base = [0, 988, 1319, 1760][level] ?? 1760;
    audio.tone(base, 0.09, { type: "triangle", volume: 0.08 });
    audio.tone(base * 1.5, 0.12, { type: "triangle", volume: 0.05, delay: 0.05 });
  }

  itemBox() {
    audio.noise(0.15, { volume: 0.2, freq: 3000, type: "highpass" });
    audio.tone(660, 0.08, { type: "square", volume: 0.07 });
    audio.tone(990, 0.1, { type: "square", volume: 0.06, delay: 0.06 });
  }

  rouletteTick() {
    audio.tone(1200 + Math.random() * 600, 0.04, { type: "square", volume: 0.035 });
  }

  itemReady() {
    audio.jingle([76, 81, 88], { type: "square", volume: 0.07, step: 0.05 });
  }

  coin() {
    const now = performance.now();
    this.coinStep = now - this.lastCoin < 500 ? (this.coinStep + 1) % 6 : 0;
    this.lastCoin = now;
    const base = 988 * Math.pow(2, [0, 2, 4, 7, 9, 12][this.coinStep] / 12);
    audio.tone(base, 0.07, { type: "square", volume: 0.06 });
    audio.tone(base * 1.335, 0.14, { type: "square", volume: 0.05, delay: 0.06 });
  }

  banana() {
    audio.tone(380, 0.14, { type: "triangle", volume: 0.14, slide: -180 });
  }

  spin() {
    audio.noise(0.3, { volume: 0.4, freq: 900, type: "bandpass", slide: -500, q: 2 });
    audio.tone(520, 0.6, { type: "sawtooth", volume: 0.08, slide: -380 });
    audio.tone(260, 0.5, { type: "triangle", volume: 0.12, slide: -150, delay: 0.1 });
  }

  shield() {
    audio.jingle([69, 76, 81], { type: "sine", volume: 0.12, step: 0.05 });
    audio.noise(0.4, { volume: 0.12, freq: 1500, type: "bandpass", slide: 1500 });
  }

  shieldBreak() {
    audio.noise(0.35, { volume: 0.35, freq: 4000, type: "highpass", slide: -3000 });
    audio.tone(880, 0.3, { type: "sine", volume: 0.1, slide: -600 });
  }

  wall(impact: number) {
    const now = performance.now();
    if (now - this.lastWall < 140) return;
    this.lastWall = now;
    const k = Math.min(1, impact / 14);
    audio.noise(0.18 + k * 0.15, { volume: 0.2 + k * 0.4, freq: 700, slide: -500 });
    audio.tone(110, 0.15, { type: "square", volume: 0.06 + k * 0.1, slide: -40 });
  }

  bump() {
    audio.tone(180, 0.1, { type: "square", volume: 0.1, slide: -70 });
    audio.noise(0.1, { volume: 0.18, freq: 900 });
  }

  land(hard: number) {
    audio.noise(0.16, { volume: 0.2 + hard * 0.3, freq: 600, slide: -400 });
    audio.tone(90, 0.14, { type: "sine", volume: 0.18 + hard * 0.2, slide: -30 });
  }

  trick() {
    audio.jingle([79, 84, 91], { type: "square", volume: 0.07, step: 0.045 });
  }

  lap() {
    audio.jingle([72, 76, 79, 84], { type: "square", volume: 0.08, step: 0.08 });
  }

  finalLap() {
    audio.jingle([72, 76, 79, 84, 79, 84, 88], { type: "square", volume: 0.09, step: 0.075 });
  }

  finish(place: number) {
    if (place <= 1) audio.jingle([72, 76, 79, 84, 88, 91, 96], { type: "square", volume: 0.1, step: 0.09 });
    else if (place <= 3) audio.jingle([72, 76, 79, 84, 88], { type: "triangle", volume: 0.12, step: 0.1 });
    else audio.jingle([72, 71, 69, 67], { type: "triangle", volume: 0.12, step: 0.14 });
  }

  wrongWay() {
    audio.tone(330, 0.2, { type: "square", volume: 0.06 });
    audio.tone(262, 0.25, { type: "square", volume: 0.06, delay: 0.2 });
  }

  click() {
    audio.tone(660, 0.05, { type: "square", volume: 0.05 });
  }

  dispose() {
    this.engine.stop();
    this.roar.stop();
    this.screech.stop();
    this.rumble.stop();
    this.wind.stop();
  }
}
