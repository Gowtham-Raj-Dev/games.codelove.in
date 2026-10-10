import { audio, NoiseLoop } from "../shared/audio";

/** Siege Smash sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private recent = 0;
  private window = 0;
  private readonly wind = new NoiseLoop({ type: "bandpass", freq: 700, q: 0.6 });

  /** Limits how many impact sounds start per 100 ms so a collapse stays a rumble, not noise. */
  private budget() {
    const now = performance.now();
    if (now - this.window > 100) {
      this.window = now;
      this.recent = 0;
    }
    return ++this.recent <= 4;
  }

  /** A block hitting something. `mass` in game units (0.3 … 6), `speed` m/s. */
  impact(material: "stone" | "wood" | "roof" | "powder" | "flesh" | "ground", mass: number, speed: number) {
    if (!audio.sfxOn || !this.budget()) return;
    const loud = Math.min(1, (speed - 1) / 9) * Math.min(1, 0.35 + mass / 4);
    if (loud <= 0.03) return;
    const low = 1 / Math.sqrt(Math.max(0.2, mass));
    const j = 0.85 + Math.random() * 0.3;
    if (material === "wood" || material === "powder") {
      audio.tone(170 * low * j + 60, 0.12, { type: "triangle", volume: 0.22 * loud, slide: -40 });
      audio.noise(0.1, { volume: 0.32 * loud, freq: 1500 * j, type: "bandpass", q: 2.2 });
    } else if (material === "flesh") {
      audio.noise(0.08, { volume: 0.25 * loud, freq: 700 * j, type: "lowpass" });
    } else {
      // Stone (and slate roofs): a deep thump plus a gritty crack.
      audio.tone(80 * low * j + 38, 0.22, { type: "sine", volume: 0.42 * loud, slide: -24 });
      audio.noise(0.2 + 0.1 * Math.min(1, mass / 4), { volume: 0.4 * loud, freq: 520 * low * j + 260, slide: -300, type: "lowpass", q: 1 });
      if (material === "roof") audio.noise(0.08, { volume: 0.18 * loud, freq: 3200 * j, type: "bandpass", q: 3 });
    }
  }

  /** A piece breaking apart. */
  shatter(material: "stone" | "wood" | "roof" | "powder") {
    if (!audio.sfxOn) return;
    if (material === "wood" || material === "powder") {
      audio.noise(0.35, { volume: 0.45, freq: 2200, type: "bandpass", q: 1.4, slide: -1500 });
      audio.tone(140, 0.18, { type: "square", volume: 0.07, slide: -60 });
      for (let i = 0; i < 3; i++) audio.noise(0.05, { volume: 0.25, freq: 2600 + i * 500, type: "bandpass", q: 4, delay: 0.04 + i * 0.05 });
    } else {
      audio.noise(0.6, { volume: 0.55, freq: 900, slide: -760, type: "lowpass" });
      audio.tone(55, 0.45, { type: "sine", volume: 0.4, slide: -20 });
      for (let i = 0; i < 4; i++) audio.noise(0.07, { volume: 0.22, freq: 1200 + i * 300, type: "bandpass", q: 3, delay: 0.06 + i * 0.07 });
    }
  }

  /** Wooden creak as a structure starts to lean. */
  creak() {
    if (!audio.sfxOn) return;
    const f = 90 + Math.random() * 50;
    audio.tone(f, 0.55, { type: "sawtooth", volume: 0.045, slide: f * 0.35, attack: 0.08 });
    audio.noise(0.5, { volume: 0.08, freq: 900 + Math.random() * 400, type: "bandpass", q: 9 });
  }

  /** Ratchet clicks while the trebuchet winds back. */
  ratchet(count = 5, spacing = 0.11) {
    for (let i = 0; i < count; i++) {
      audio.noise(0.035, { volume: 0.2, freq: 2400, type: "bandpass", q: 5, delay: i * spacing });
      audio.tone(320, 0.03, { type: "square", volume: 0.035, delay: i * spacing });
    }
  }

  /** The arm swings: creak of timber, then a rushing whoosh. */
  launch() {
    audio.tone(70, 0.3, { type: "sawtooth", volume: 0.08, slide: 50 });
    audio.noise(0.5, { volume: 0.4, freq: 400, type: "bandpass", q: 1.2, slide: 2600, delay: 0.05 });
    audio.noise(0.25, { volume: 0.25, freq: 300, slide: -200, delay: 0.35 });
  }

  /** Air rushing past a projectile (0 … 1). */
  flight(level: number) {
    this.wind.set(level * 0.12, 500 + level * 900);
  }

  split() {
    audio.tone(880, 0.12, { type: "square", volume: 0.08, slide: 400 });
    audio.noise(0.25, { volume: 0.35, freq: 3000, type: "highpass", slide: -2000 });
    audio.tone(1320, 0.18, { type: "triangle", volume: 0.1, delay: 0.05 });
  }

  explosion(big = true) {
    const v = big ? 1 : 0.75;
    audio.noise(1.1, { volume: 0.85 * v, freq: 1600, slide: -1450, type: "lowpass" });
    audio.tone(70, 0.8, { type: "sine", volume: 0.6 * v, slide: -45 });
    audio.tone(140, 0.25, { type: "square", volume: 0.12 * v, slide: -100 });
    audio.noise(0.4, { volume: 0.3 * v, freq: 4000, type: "highpass", slide: -3000, delay: 0.05 });
  }

  /** A defender is knocked out. */
  ko() {
    const f = 300 + Math.random() * 120;
    audio.tone(f, 0.28, { type: "square", volume: 0.07, slide: -f * 0.55 });
    audio.tone(f * 1.5, 0.2, { type: "triangle", volume: 0.07, slide: -f * 0.7, delay: 0.03 });
    audio.noise(0.25, { volume: 0.2, freq: 900, type: "lowpass", delay: 0.08 });
  }

  /** Defenders jeering after a miss. */
  taunt() {
    for (let i = 0; i < 3; i++) audio.tone(420 + i * 40 + Math.random() * 30, 0.14, { type: "square", volume: 0.04, slide: 60, delay: i * 0.13 });
  }

  select() {
    audio.tone(660, 0.06, { type: "triangle", volume: 0.12 });
    audio.tone(990, 0.08, { type: "triangle", volume: 0.1, delay: 0.05 });
  }

  denied() {
    audio.tone(200, 0.12, { type: "square", volume: 0.07, slide: -40 });
  }

  star(i: number) {
    audio.tone([784, 988, 1175][i] ?? 1175, 0.35, { type: "triangle", volume: 0.16 });
    audio.tone(([784, 988, 1175][i] ?? 1175) * 2, 0.25, { type: "sine", volume: 0.06, delay: 0.03 });
  }

  /** Victory: a fanfare and a crowd of cheering attackers. */
  win() {
    audio.jingle([67, 72, 76, 79, 84], { type: "square", volume: 0.09, step: 0.11 });
    audio.jingle([60, 64, 67, 72], { type: "triangle", volume: 0.12, step: 0.11 });
    for (let i = 0; i < 6; i++) audio.noise(0.7, { volume: 0.12, freq: 1100 + Math.random() * 900, type: "bandpass", q: 2.5, delay: 0.2 + i * 0.12 });
  }

  lose() {
    audio.jingle([67, 63, 60, 55], { type: "triangle", volume: 0.12, step: 0.2 });
  }

  dispose() {
    this.wind.stop();
  }
}
