import { audio, NoiseLoop } from "../shared/audio";

/** Putt Paradise sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private readonly roll = new NoiseLoop({ type: "lowpass", freq: 420, q: 0.6 });
  private readonly sea = new NoiseLoop({ type: "lowpass", freq: 380, q: 0.4 });
  private lastSea = 0;
  private lastHit = 0;

  /** The putter meeting the ball: a woody tick, fuller with power (0..1). */
  putt(power: number) {
    const p = Math.min(1, Math.max(0, power));
    audio.noise(0.05, { volume: 0.18 + p * 0.3, freq: 2600 + p * 2200, type: "bandpass", q: 2.2 });
    audio.tone(900 + p * 500, 0.07, { type: "triangle", volume: 0.12 + p * 0.14, slide: -300 });
    audio.tone(180 + p * 60, 0.09, { type: "sine", volume: 0.1 + p * 0.25, slide: -60 });
  }

  /** Ball against a wall or a sail. */
  hit(kind: "wall" | "floor" | "blade", speed: number) {
    const now = performance.now();
    if (now - this.lastHit < 45) return;
    this.lastHit = now;
    const v = Math.min(1, speed / 3);
    if (kind === "wall") {
      audio.tone(520 + v * 380, 0.06, { type: "square", volume: 0.04 + v * 0.1, slide: -160 });
      audio.noise(0.05, { volume: 0.1 + v * 0.3, freq: 1800 + v * 1400, type: "bandpass", q: 1.6 });
    } else if (kind === "blade") {
      audio.tone(210, 0.12, { type: "triangle", volume: 0.14 + v * 0.2, slide: -70 });
      audio.noise(0.08, { volume: 0.2 + v * 0.25, freq: 700, type: "bandpass", q: 1.2 });
    } else {
      audio.tone(140, 0.08, { type: "sine", volume: 0.08 + v * 0.22, slide: -40 });
      audio.noise(0.06, { volume: 0.08 + v * 0.18, freq: 600 });
    }
  }

  /** Rolling over the carpet: level 0..1. */
  rolling(level: number) {
    const l = Math.min(1, Math.max(0, level));
    this.roll.set(l * 0.14, 260 + l * 900);
  }

  /** Ball rattling into the cup. */
  cup() {
    for (let i = 0; i < 4; i++) audio.tone(1500 - i * 140, 0.035, { type: "square", volume: 0.05 - i * 0.008, delay: i * 0.055 });
    audio.tone(330, 0.22, { type: "sine", volume: 0.3, slide: -140, delay: 0.24 });
    audio.noise(0.12, { volume: 0.18, freq: 500, delay: 0.24 });
  }

  /** Lip-out: the ball rides the rim and spins away. */
  lip() {
    audio.tone(1300, 0.05, { type: "square", volume: 0.05, slide: -400 });
    audio.tone(1000, 0.05, { type: "square", volume: 0.04, delay: 0.06, slide: -300 });
  }

  splash() {
    audio.noise(0.55, { volume: 0.55, freq: 2400, type: "lowpass", slide: -2000 });
    audio.noise(0.25, { volume: 0.3, freq: 5200, type: "highpass", slide: -3000 });
    audio.tone(240, 0.18, { type: "sine", volume: 0.18, slide: -150 });
  }

  /** Ball dropping off the course onto the grass. */
  thud() {
    audio.tone(110, 0.14, { type: "sine", volume: 0.3, slide: -40 });
    audio.noise(0.14, { volume: 0.25, freq: 400 });
  }

  penalty() {
    audio.tone(392, 0.16, { type: "triangle", volume: 0.12 });
    audio.tone(311, 0.26, { type: "triangle", volume: 0.12, delay: 0.14 });
  }

  /** Light applause: many soft claps, swelling and fading. */
  applause(seconds = 1.6, strength = 1) {
    const claps = Math.round(seconds * 26 * strength);
    for (let i = 0; i < claps; i++) {
      const t = (i / claps) * seconds + Math.random() * 0.05;
      const env = Math.sin((Math.min(1, t / seconds) * Math.PI) ** 0.8);
      audio.noise(0.03, { volume: (0.06 + Math.random() * 0.08) * env * strength, freq: 1600 + Math.random() * 1800, type: "bandpass", q: 1.4, delay: t });
    }
  }

  /** Result jingles, by score relative to par. */
  result(diff: number, holeInOne: boolean) {
    if (holeInOne) {
      audio.jingle([72, 76, 79, 84, 88, 91, 96], { type: "triangle", volume: 0.18, step: 0.08 });
      audio.jingle([60, 64, 67, 72], { type: "sine", volume: 0.12, step: 0.16 });
      this.applause(2.6, 1.3);
    } else if (diff <= -2) {
      audio.jingle([72, 76, 79, 84, 88], { type: "triangle", volume: 0.17, step: 0.08 });
      this.applause(2, 1.1);
    } else if (diff === -1) {
      audio.jingle([72, 76, 79, 84], { type: "triangle", volume: 0.16, step: 0.08 });
      this.applause(1.4, 0.8);
    } else if (diff === 0) {
      audio.jingle([67, 72, 76], { type: "triangle", volume: 0.14, step: 0.09 });
      this.applause(0.9, 0.45);
    } else {
      audio.jingle([67, 64, 60], { type: "triangle", volume: 0.11, step: 0.12 });
    }
  }

  /** A soft UI tick (power steps, ball choice). */
  tick(up = true) {
    audio.tone(up ? 1320 : 990, 0.03, { type: "triangle", volume: 0.05 });
  }

  /** A windmill sail sweeping past. */
  sail(level: number) {
    audio.noise(0.45, { volume: 0.05 * level, freq: 300, type: "bandpass", slide: 500, q: 0.8 });
  }

  /** The lagoon: a soft surf that swells and settles (call every frame with the clock). */
  waves(time: number) {
    if (time - this.lastSea < 0.1) return;
    this.lastSea = time;
    const swell = 0.5 + 0.5 * Math.sin(time * 0.55) * Math.sin(time * 0.21 + 1);
    this.sea.set(0.012 + swell * 0.022, 260 + swell * 260);
  }

  whoosh() {
    audio.noise(0.5, { volume: 0.12, freq: 500, type: "bandpass", slide: 1600, q: 0.9 });
  }

  /** Mutes the loops (pause). */
  quiet() {
    this.roll.set(0);
    this.sea.set(0);
  }

  dispose() {
    this.roll.stop();
    this.sea.stop();
  }
}
