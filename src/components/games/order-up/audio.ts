import { audio, NoiseLoop } from "../shared/audio";

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Order Up! sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private readonly sizzleLoop = new NoiseLoop({ type: "bandpass", freq: 4200, q: 0.6 });
  private readonly hum = new NoiseLoop({ type: "lowpass", freq: 260, q: 0.5 });
  private coinStep = 0;
  private lastCoin = 0;
  private crackle = 0;

  /** An ingredient lands on the stack — each kind has its own pitch. */
  plop(pitch = 0) {
    audio.tone(320 + pitch * 40, 0.12, { type: "sine", volume: 0.22, slide: -180 });
    audio.noise(0.07, { volume: 0.12, freq: 900 + pitch * 120, type: "lowpass" });
  }

  /** A tap that did nothing useful. */
  nope() {
    audio.tone(190, 0.09, { type: "square", volume: 0.07 });
    audio.tone(150, 0.12, { type: "square", volume: 0.07, delay: 0.09 });
  }

  pattyOn() {
    audio.noise(0.5, { volume: 0.22, freq: 5200, type: "highpass", slide: -2600 });
    audio.tone(140, 0.08, { type: "sine", volume: 0.18, slide: -60 });
  }

  pattyReady() {
    audio.tone(hz(84), 0.14, { type: "triangle", volume: 0.12 });
    audio.tone(hz(88), 0.22, { type: "triangle", volume: 0.12, delay: 0.09 });
  }

  pattyTake() {
    audio.noise(0.12, { volume: 0.18, freq: 2600, type: "bandpass", slide: 1500, q: 1.2 });
    audio.tone(420, 0.08, { type: "sine", volume: 0.12, slide: 240 });
  }

  burnWarn() {
    audio.tone(hz(81), 0.07, { type: "square", volume: 0.05 });
  }

  burnt() {
    audio.tone(hz(64), 0.22, { type: "sawtooth", volume: 0.08 });
    audio.tone(hz(60), 0.32, { type: "sawtooth", volume: 0.08, delay: 0.2 });
    audio.noise(0.6, { volume: 0.2, freq: 900, slide: -500 });
  }

  /** Order bell — the burger is served. */
  ding() {
    for (const [m, v] of [
      [96, 0.16],
      [103, 0.06],
      [108, 0.04],
    ] as const) {
      audio.tone(hz(m), 1.1, { type: "sine", volume: v, attack: 0.003 });
    }
  }

  coins(count = 3) {
    const now = performance.now();
    this.coinStep = now - this.lastCoin < 900 ? Math.min(this.coinStep + 1, 6) : 0;
    this.lastCoin = now;
    for (let i = 0; i < count; i++) {
      const base = hz(88 + this.coinStep + (i % 2) * 5);
      audio.tone(base, 0.08, { type: "square", volume: 0.045, delay: i * 0.07 });
      audio.tone(base * 1.5, 0.14, { type: "square", volume: 0.04, delay: i * 0.07 + 0.04 });
    }
  }

  doorBell() {
    audio.tone(hz(88), 0.5, { type: "sine", volume: 0.1, attack: 0.004 });
    audio.tone(hz(84), 0.7, { type: "sine", volume: 0.1, attack: 0.004, delay: 0.16 });
  }

  grumble() {
    audio.tone(150, 0.28, { type: "sawtooth", volume: 0.09, slide: -40 });
    audio.tone(120, 0.42, { type: "sawtooth", volume: 0.09, slide: -45, delay: 0.24 });
    audio.noise(0.4, { volume: 0.08, freq: 400 });
  }

  wrong() {
    audio.tone(hz(55), 0.16, { type: "square", volume: 0.08 });
    audio.tone(hz(54), 0.22, { type: "square", volume: 0.08, delay: 0.16 });
  }

  bin() {
    audio.noise(0.25, { volume: 0.3, freq: 3000, type: "bandpass", slide: -2400, q: 0.8 });
    audio.tone(110, 0.16, { type: "triangle", volume: 0.25, slide: -40, delay: 0.18 });
    audio.noise(0.12, { volume: 0.25, freq: 600, delay: 0.18 });
  }

  combo(level: number) {
    audio.jingle([79 + Math.min(level, 8), 83 + Math.min(level, 8), 86 + Math.min(level, 8)], { volume: 0.08, step: 0.05 });
  }

  newDay() {
    audio.jingle([72, 76, 79, 84], { volume: 0.12 });
  }

  closing() {
    audio.jingle([84, 79, 76, 72], { volume: 0.1, step: 0.12 });
  }

  success() {
    audio.jingle([72, 76, 79, 84, 88], { volume: 0.13, step: 0.09 });
  }

  fail() {
    audio.jingle([67, 63, 60], { type: "sawtooth", volume: 0.06, step: 0.16 });
  }

  buy() {
    audio.noise(0.08, { volume: 0.2, freq: 3000, type: "highpass" });
    audio.tone(hz(96), 0.5, { type: "sine", volume: 0.12, delay: 0.06, attack: 0.003 });
    audio.tone(hz(91), 0.5, { type: "sine", volume: 0.08, delay: 0.12, attack: 0.003 });
  }

  tick() {
    audio.tone(1800, 0.03, { type: "square", volume: 0.03 });
  }

  /** Sizzle bed: `cooking` patties on the grill (0 = silent); random fat crackles on top. */
  sizzle(cooking: number, dt: number) {
    this.sizzleLoop.set(cooking ? 0.035 + cooking * 0.02 : 0);
    if (!cooking) return;
    this.crackle -= dt;
    if (this.crackle <= 0) {
      this.crackle = 0.05 + Math.random() * (0.35 / cooking);
      audio.noise(0.03, { volume: 0.05 + Math.random() * 0.06, freq: 2500 + Math.random() * 4000, type: "highpass" });
    }
  }

  /** Low diner murmur while customers are inside. */
  murmur(level: number) {
    this.hum.set(level * 0.05);
  }

  silence() {
    this.sizzleLoop.set(0);
    this.hum.set(0);
  }

  dispose() {
    this.sizzleLoop.stop();
    this.hum.stop();
  }
}
