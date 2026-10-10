import { audio, NoiseLoop } from "../shared/audio";

/** Skate Rush sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private coinStep = 0;
  private lastCoin = 0;
  private readonly roll = new NoiseLoop({ type: "lowpass", freq: 500 });

  coin() {
    // Coins picked up in quick succession climb a little scale.
    const now = performance.now();
    this.coinStep = now - this.lastCoin < 400 ? (this.coinStep + 1) % 8 : 0;
    this.lastCoin = now;
    const base = 880 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12][this.coinStep] / 12);
    audio.tone(base, 0.09, { type: "square", volume: 0.07 });
    audio.tone(base * 1.5, 0.16, { type: "square", volume: 0.06, delay: 0.05 });
  }

  jump() {
    audio.noise(0.18, { volume: 0.25, freq: 600, type: "bandpass", slide: 2400, q: 1.5 });
    audio.tone(260, 0.16, { type: "triangle", volume: 0.18, slide: 260 });
  }

  land() {
    audio.noise(0.12, { volume: 0.35, freq: 900, slide: -700 });
    audio.tone(110, 0.1, { type: "sine", volume: 0.3, slide: -50 });
  }

  duck() {
    audio.noise(0.22, { volume: 0.22, freq: 2400, type: "bandpass", slide: -1800, q: 2 });
  }

  lane() {
    audio.noise(0.09, { volume: 0.12, freq: 3000, type: "highpass" });
  }

  bump() {
    audio.tone(150, 0.14, { type: "square", volume: 0.15, slide: -60 });
    audio.noise(0.12, { volume: 0.3, freq: 500 });
  }

  power() {
    audio.jingle([72, 76, 79, 84]);
  }

  shieldBreak() {
    audio.noise(0.35, { volume: 0.4, freq: 4000, type: "highpass", slide: -3000 });
    audio.tone(660, 0.3, { type: "sawtooth", volume: 0.08, slide: -400 });
  }

  crash() {
    audio.noise(0.6, { volume: 0.7, freq: 1800, slide: -1600 });
    audio.tone(90, 0.5, { type: "sawtooth", volume: 0.25, slide: -50 });
  }

  go() {
    audio.tone(523, 0.12, { type: "square", volume: 0.1 });
    audio.tone(1047, 0.28, { type: "square", volume: 0.1, delay: 0.12 });
  }

  /** Rolling-wheels noise: level 0..1 (0 when airborne or stopped). */
  rolling(level: number) {
    this.roll.set(level * 0.16, 350 + level * 700);
  }

  dispose() {
    this.roll.stop();
  }
}
