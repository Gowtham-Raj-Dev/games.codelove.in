import { audio } from "../shared/audio";

/**
 * Beat Street sound effects, synthesized on the shared audio hub. The music carries the hits, so
 * there are no hit ticks (they'd only add latency); just a soft thud on a miss, the fever whoosh and
 * the crowd.
 */
export class Sfx {
  private lastMiss = 0;

  miss() {
    const now = performance.now();
    if (now - this.lastMiss < 90) return;
    this.lastMiss = now;
    audio.tone(110, 0.14, { type: "sine", volume: 0.22, slide: -45 });
    audio.noise(0.1, { volume: 0.14, freq: 420, slide: -250 });
  }

  /** Releasing a hold note too early. */
  drop() {
    audio.tone(330, 0.18, { type: "triangle", volume: 0.07, slide: -160 });
  }

  holdDone() {
    audio.tone(1568, 0.12, { type: "sine", volume: 0.045 });
  }

  fever() {
    audio.noise(1.1, { volume: 0.32, freq: 260, type: "bandpass", slide: 5200, q: 0.9 });
    audio.noise(0.7, { volume: 0.12, freq: 6000, type: "highpass", delay: 0.35 });
    audio.jingle([72, 76, 79, 84, 88], { type: "square", volume: 0.07, step: 0.06 });
    this.cheer(0.8);
  }

  feverEnd() {
    audio.noise(0.6, { volume: 0.16, freq: 3000, type: "bandpass", slide: -2600, q: 1.2 });
  }

  /** Crowd roar: a few overlapping filtered-noise swells. */
  cheer(level = 1) {
    if (!audio.sfxOn) return;
    for (let i = 0; i < 4; i++) {
      audio.noise(0.9 + i * 0.25, { volume: 0.11 * level, freq: 900 + i * 450, type: "bandpass", q: 0.7, slide: -300, delay: i * 0.07 });
    }
    audio.noise(0.25, { volume: 0.12 * level, freq: 2600, type: "bandpass", q: 4, delay: 0.1 });
    audio.noise(0.25, { volume: 0.1 * level, freq: 3100, type: "bandpass", q: 4, delay: 0.32 });
  }

  boo() {
    if (!audio.sfxOn) return;
    audio.noise(1.2, { volume: 0.2, freq: 420, type: "bandpass", q: 1.4, slide: -180 });
    audio.tone(155, 1.0, { type: "sawtooth", volume: 0.035, slide: -35, attack: 0.15 });
    audio.tone(118, 1.1, { type: "sawtooth", volume: 0.03, slide: -25, attack: 0.2, delay: 0.08 });
  }

  combo(level: number) {
    const base = 72 + Math.min(level, 4) * 2;
    audio.jingle([base, base + 4, base + 7], { type: "triangle", volume: 0.07, step: 0.05 });
  }

  click(accent: boolean, delay = 0) {
    audio.tone(accent ? 1760 : 1175, 0.05, { type: "square", volume: accent ? 0.12 : 0.08, delay, attack: 0.002 });
  }

  move() {
    audio.tone(880, 0.05, { type: "triangle", volume: 0.06 });
  }

  locked() {
    audio.tone(196, 0.12, { type: "square", volume: 0.06, slide: -40 });
  }

  results(good: boolean) {
    if (good) {
      audio.jingle([72, 76, 79, 84, 88, 91], { type: "square", volume: 0.07, step: 0.08 });
      this.cheer(1.1);
    } else {
      audio.jingle([67, 64, 60], { type: "triangle", volume: 0.08, step: 0.14 });
    }
  }
}
