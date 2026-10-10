import { audio, NoiseLoop } from "../shared/audio";
import type { TowerKind } from "./rules";

/** Saucer Siege sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  /** Last play time per sound, so twenty turrets don't turn into white noise. */
  private readonly last = new Map<string, number>();
  private readonly hum = new NoiseLoop({ type: "bandpass", freq: 220, q: 6 });

  private ok(name: string, gap: number) {
    const now = performance.now();
    if (now - (this.last.get(name) ?? -1e9) < gap * 1000) return false;
    this.last.set(name, now);
    return true;
  }

  shoot(kind: TowerKind) {
    if (!audio.sfxOn) return;
    switch (kind) {
      case "ballista":
        if (!this.ok("ballista", 0.06)) return;
        audio.tone(520, 0.12, { type: "triangle", volume: 0.12, slide: -300 });
        audio.noise(0.08, { volume: 0.12, freq: 2600, type: "bandpass", q: 3, slide: -1800 });
        break;
      case "cannon":
        if (!this.ok("cannon", 0.08)) return;
        audio.noise(0.35, { volume: 0.32, freq: 900, slide: -760 });
        audio.tone(120, 0.25, { type: "sine", volume: 0.35, slide: -70 });
        break;
      case "catapult":
        if (!this.ok("catapult", 0.1)) return;
        audio.tone(180, 0.12, { type: "square", volume: 0.06, slide: -60 });
        audio.noise(0.4, { volume: 0.18, freq: 500, type: "bandpass", q: 1.4, slide: 1400, delay: 0.04 });
        break;
      case "turret":
        if (!this.ok("turret", 0.055)) return;
        audio.tone(900 + Math.random() * 200, 0.05, { type: "square", volume: 0.045, slide: -500 });
        audio.noise(0.04, { volume: 0.1, freq: 3200, type: "highpass" });
        break;
    }
  }

  hit() {
    if (!this.ok("hit", 0.05)) return;
    audio.noise(0.06, { volume: 0.12, freq: 1800, type: "bandpass", q: 2 });
    audio.tone(1400, 0.04, { type: "square", volume: 0.025 });
  }

  explosion(big = false) {
    if (!this.ok(big ? "boom-big" : "boom", big ? 0.05 : 0.07)) return;
    audio.noise(big ? 1.1 : 0.5, { volume: big ? 0.6 : 0.32, freq: big ? 1400 : 1100, slide: big ? -1300 : -950 });
    audio.tone(big ? 70 : 95, big ? 0.8 : 0.35, { type: "sine", volume: big ? 0.5 : 0.28, slide: -40 });
    if (big) audio.noise(0.5, { volume: 0.3, freq: 5000, type: "highpass", delay: 0.05 });
  }

  /** A saucer is hit for good: an alien warble going down. */
  saucerDown() {
    if (!this.ok("down", 0.06)) return;
    audio.tone(880, 0.3, { type: "sine", volume: 0.08, slide: -700 });
    audio.tone(1320, 0.18, { type: "triangle", volume: 0.05, slide: -900 });
  }

  coin() {
    if (!this.ok("coin", 0.05)) return;
    audio.tone(1568, 0.07, { type: "square", volume: 0.035 });
    audio.tone(2093, 0.12, { type: "square", volume: 0.035, delay: 0.05 });
  }

  build() {
    audio.noise(0.25, { volume: 0.3, freq: 400, slide: -250 });
    audio.tone(150, 0.18, { type: "triangle", volume: 0.25, slide: -60 });
    audio.jingle([67, 72, 76], { volume: 0.1, step: 0.06 });
  }

  upgrade() {
    audio.noise(0.2, { volume: 0.22, freq: 500, slide: -300 });
    audio.jingle([67, 71, 74, 79, 83], { volume: 0.12, step: 0.055 });
  }

  sell() {
    audio.jingle([79, 76, 72], { type: "square", volume: 0.06, step: 0.06 });
    audio.noise(0.3, { volume: 0.2, freq: 600, slide: -400 });
  }

  denied() {
    if (!this.ok("denied", 0.15)) return;
    audio.tone(160, 0.14, { type: "square", volume: 0.08 });
    audio.tone(120, 0.18, { type: "square", volume: 0.08, delay: 0.09 });
  }

  click() {
    audio.tone(1200, 0.04, { type: "triangle", volume: 0.06 });
  }

  /** A saucer reaches the keep. */
  leak() {
    audio.tone(660, 0.18, { type: "square", volume: 0.09 });
    audio.tone(440, 0.3, { type: "square", volume: 0.09, delay: 0.16 });
    audio.noise(0.4, { volume: 0.25, freq: 2400, type: "bandpass", q: 1.2, slide: -2000 });
  }

  waveStart(boss: boolean) {
    // A medieval horn: two stacked saws, slightly detuned.
    const notes = boss ? [50, 50, 53] : [55, 62];
    notes.forEach((n, i) => {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      audio.tone(f, 0.5, { type: "sawtooth", volume: 0.07, delay: i * 0.28, attack: 0.05 });
      audio.tone(f * 1.006, 0.5, { type: "sawtooth", volume: 0.05, delay: i * 0.28, attack: 0.05 });
    });
    if (boss) audio.tone(55, 1.6, { type: "sine", volume: 0.3, slide: -15, delay: 0.3 });
  }

  bonus() {
    audio.jingle([72, 76, 79, 84], { type: "square", volume: 0.06, step: 0.05 });
  }

  /** Tractor beam locks on. */
  beam() {
    if (!this.ok("beam", 0.2)) return;
    audio.tone(300, 0.7, { type: "sine", volume: 0.12, slide: 500, attack: 0.08 });
    audio.tone(305, 0.7, { type: "triangle", volume: 0.06, slide: 520, attack: 0.08 });
  }

  freeze() {
    if (!this.ok("freeze", 0.2)) return;
    audio.noise(0.5, { volume: 0.18, freq: 6000, type: "highpass", slide: -3000 });
    audio.tone(2000, 0.3, { type: "sine", volume: 0.05, slide: 1200 });
  }

  /** Last seconds before a wave. */
  tick(n: number) {
    audio.tone(n === 1 ? 880 : 660, 0.08, { type: "triangle", volume: 0.07 });
  }

  victory() {
    audio.jingle([60, 64, 67, 72, 76, 79, 84], { type: "square", volume: 0.08, step: 0.09 });
  }

  defeat() {
    audio.jingle([67, 63, 60, 55], { type: "triangle", volume: 0.14, step: 0.22 });
    audio.noise(1.4, { volume: 0.4, freq: 1200, slide: -1100 });
  }

  /** Saucer engine bed: level grows with the number of saucers alive. */
  engines(level: number) {
    this.hum.set(level * 0.05, 180 + level * 90);
  }

  dispose() {
    this.hum.stop();
  }
}
