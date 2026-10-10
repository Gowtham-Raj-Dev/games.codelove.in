import { audio, NoiseLoop } from "../shared/audio";

/** Cannon Cove sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private readonly waves = new NoiseLoop({ type: "lowpass", freq: 420, q: 0.5 });
  private readonly wind = new NoiseLoop({ type: "bandpass", freq: 900, q: 0.7 });
  private readonly rush = new NoiseLoop({ type: "highpass", freq: 1800, q: 0.4 });
  private lastCoin = 0;
  private coinStep = 0;
  private lastSplash = 0;
  private lastHit = 0;

  /** A cannon shot. `near` 0..1 (distance falloff), `delay` seconds. */
  cannon(near = 1, delay = 0) {
    const v = 0.25 + 0.75 * near;
    const pitch = 0.9 + Math.random() * 0.2;
    audio.noise(1.1, { volume: 0.6 * v, freq: 700 * near + 240, slide: -600 * near - 120, delay });
    audio.noise(0.16, { volume: 0.32 * v * near, freq: 2600, type: "bandpass", q: 0.6, delay });
    audio.tone(62 * pitch, 0.7, { type: "sine", volume: 0.55 * v, slide: -30, delay, attack: 0.005 });
    audio.tone(120 * pitch, 0.2, { type: "triangle", volume: 0.22 * v, slide: -80, delay, attack: 0.004 });
  }

  /** Fuse hiss: an enemy is about to fire. */
  fuse(near = 1) {
    audio.noise(0.7, { volume: 0.08 + 0.1 * near, freq: 5200, type: "highpass", slide: -1800 });
    audio.tone(1320, 0.12, { type: "square", volume: 0.025 + 0.03 * near });
  }

  splash(near = 1) {
    const now = performance.now();
    if (now - this.lastSplash < 45) return;
    this.lastSplash = now;
    const v = 0.15 + 0.85 * near;
    audio.noise(0.55, { volume: 0.32 * v, freq: 1600, type: "bandpass", q: 0.9, slide: -1200 });
    audio.noise(0.3, { volume: 0.18 * v, freq: 3800, type: "highpass", delay: 0.04 });
    audio.tone(240, 0.12, { type: "sine", volume: 0.1 * v, slide: -160 });
  }

  /** Cannonball smashing into wood. */
  hit(near = 1, heavy = false) {
    const now = performance.now();
    if (now - this.lastHit < 40) return;
    this.lastHit = now;
    const v = 0.3 + 0.7 * near;
    audio.noise(0.32, { volume: 0.5 * v, freq: 2400, slide: -2000 });
    audio.tone(heavy ? 70 : 95, 0.3, { type: "square", volume: 0.14 * v, slide: -40 });
    audio.noise(0.1, { volume: 0.3 * v, freq: 5200, type: "highpass" });
    audio.tone(310, 0.08, { type: "triangle", volume: 0.1 * v, slide: -200, delay: 0.02 });
  }

  /** The player's own hull taking a hit (louder, with a creak). */
  hurt() {
    this.hit(1, true);
    audio.tone(180, 0.35, { type: "sawtooth", volume: 0.05, slide: -90, delay: 0.05 });
  }

  bump() {
    audio.tone(58, 0.4, { type: "sine", volume: 0.45, slide: -20 });
    audio.noise(0.35, { volume: 0.4, freq: 380, slide: -200 });
    audio.tone(140, 0.4, { type: "sawtooth", volume: 0.05, slide: -60, delay: 0.05 });
  }

  /** A ship going down: groaning timbers and bubbles. */
  sink(near = 1) {
    const v = 0.3 + 0.7 * near;
    audio.tone(92, 2.2, { type: "sawtooth", volume: 0.07 * v, slide: -48, attack: 0.3 });
    audio.tone(61, 2.6, { type: "sawtooth", volume: 0.05 * v, slide: -25, attack: 0.5, delay: 0.3 });
    audio.noise(2.6, { volume: 0.32 * v, freq: 420, slide: -260, delay: 0.1 });
    for (let i = 0; i < 6; i++) audio.tone(300 + Math.random() * 500, 0.08, { type: "sine", volume: 0.05 * v, slide: 300, delay: 0.5 + i * 0.25 + Math.random() * 0.1 });
  }

  explode(near = 1) {
    const v = 0.3 + 0.7 * near;
    audio.noise(1.6, { volume: 0.7 * v, freq: 600, slide: -500 });
    audio.tone(48, 1.2, { type: "sine", volume: 0.6 * v, slide: -18 });
  }

  coin(big = false) {
    const now = performance.now();
    this.coinStep = now - this.lastCoin < 500 ? (this.coinStep + 1) % 6 : 0;
    this.lastCoin = now;
    const base = 988 * Math.pow(2, [0, 2, 4, 7, 9, 12][this.coinStep] / 12);
    audio.tone(base, 0.08, { type: "square", volume: 0.06 });
    audio.tone(base * 1.5, 0.2, { type: "square", volume: 0.055, delay: 0.06 });
    if (big) audio.jingle([79, 83, 86, 91], { type: "triangle", volume: 0.1, step: 0.06 });
  }

  repair() {
    audio.jingle([67, 72, 76], { type: "triangle", volume: 0.12, step: 0.06 });
    audio.noise(0.2, { volume: 0.1, freq: 900, type: "bandpass", q: 2 });
  }

  sail(up: boolean) {
    audio.noise(0.35, { volume: 0.2, freq: up ? 700 : 1800, type: "bandpass", q: 1.2, slide: up ? 1400 : -1100 });
    audio.tone(up ? 330 : 260, 0.09, { type: "triangle", volume: 0.05, slide: up ? 80 : -60 });
  }

  reloaded() {
    audio.tone(1568, 0.05, { type: "square", volume: 0.03 });
    audio.noise(0.06, { volume: 0.08, freq: 3000, type: "bandpass", q: 3, delay: 0.03 });
  }

  empty() {
    audio.tone(220, 0.07, { type: "square", volume: 0.04, slide: -40 });
  }

  waveStart() {
    audio.jingle([62, 69, 74, 69, 74, 78], { type: "square", volume: 0.07, step: 0.11 });
  }

  waveClear() {
    audio.jingle([74, 78, 81, 86, 90], { type: "triangle", volume: 0.14, step: 0.09 });
  }

  boss() {
    audio.tone(55, 3, { type: "sawtooth", volume: 0.1, slide: -12, attack: 0.6 });
    audio.tone(58.3, 3, { type: "sawtooth", volume: 0.08, slide: -12, attack: 0.6 });
    audio.jingle([57, 60, 63, 66, 69], { type: "sine", volume: 0.12, step: 0.22 });
  }

  /** The ghost ship's barrage warning. */
  wail() {
    audio.tone(440, 1.2, { type: "sine", volume: 0.07, slide: -220, attack: 0.2 });
    audio.tone(466, 1.2, { type: "sine", volume: 0.06, slide: -233, attack: 0.25 });
  }

  pick() {
    audio.jingle([67, 71, 74, 79], { type: "triangle", volume: 0.14, step: 0.06 });
  }

  gameOver() {
    audio.jingle([69, 65, 62, 57], { type: "triangle", volume: 0.14, step: 0.2 });
  }

  /** Ambient beds: sea swell, wind in the rigging, water rushing past the hull. */
  ambience(sea: number, wind: number, rush: number) {
    this.waves.set(sea * 0.07, 320 + sea * 220);
    this.wind.set(wind * 0.035, 600 + wind * 700);
    this.rush.set(rush * 0.045, 1500 + rush * 1500);
  }

  dispose() {
    this.waves.stop();
    this.wind.stop();
    this.rush.stop();
  }
}
