import { audio, NoiseLoop } from "../shared/audio";

/** Castaway's sound effects and ambience, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private readonly last = new Map<string, number>();
  private readonly surf = new NoiseLoop({ type: "lowpass", freq: 520, q: 0.5 });
  private readonly wind = new NoiseLoop({ type: "bandpass", freq: 420, q: 0.9 });
  private readonly fire = new NoiseLoop({ type: "bandpass", freq: 1500, q: 0.6 });
  private crackleT = 0;
  private stepSide = 0;

  private gate(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last.get(key) ?? -1e9) < ms) return false;
    this.last.set(key, now);
    return true;
  }

  /** Ambience: surf by the sea, wind at night, fire crackle near flames. */
  ambience(dt: number, time: number, { sea, night, fire }: { sea: number; night: number; fire: number }) {
    if (!audio.ctx) return;
    const swell = 0.5 + 0.5 * Math.sin(time * 0.7) * Math.sin(time * 0.23 + 1);
    this.surf.set(0.05 + sea * (0.1 + swell * 0.16), 380 + swell * 420);
    this.wind.set(night * (0.035 + 0.03 * Math.sin(time * 0.31)), 360 + 140 * Math.sin(time * 0.17));
    this.fire.set(fire * 0.06, 1300 + Math.random() * 400);
    if (fire > 0.05) {
      this.crackleT -= dt;
      if (this.crackleT <= 0) {
        this.crackleT = 0.05 + Math.random() * 0.22;
        audio.noise(0.03, { volume: 0.05 + fire * 0.14 * Math.random(), freq: 2500 + Math.random() * 3000, type: "bandpass", q: 4 });
      }
    }
  }

  stopAmbience() {
    this.surf.stop();
    this.wind.stop();
    this.fire.stop();
  }

  step(sand: boolean, water: boolean) {
    if (!this.gate("step", 120)) return;
    this.stepSide ^= 1;
    if (water) audio.noise(0.14, { volume: 0.09, freq: 900 + this.stepSide * 200, type: "bandpass", q: 0.8, slide: -500 });
    else if (sand) audio.noise(0.07, { volume: 0.06, freq: 2600 + this.stepSide * 300, type: "highpass" });
    else audio.noise(0.06, { volume: 0.06, freq: 700 + this.stepSide * 120, type: "bandpass", q: 1.4 });
  }

  swing() {
    audio.noise(0.16, { volume: 0.18, freq: 900, type: "bandpass", slide: 1400, q: 1.1 });
  }

  chop(final = false) {
    if (!this.gate("chop", 50)) return;
    audio.tone(final ? 110 : 150 + Math.random() * 30, 0.16, { type: "triangle", volume: 0.42, slide: -60 });
    audio.noise(0.09, { volume: 0.42, freq: 1100, type: "bandpass", q: 1.2, slide: -500 });
    audio.noise(0.04, { volume: 0.18, freq: 3800, type: "highpass", delay: 0.01 });
  }

  treeFall() {
    for (let i = 0; i < 4; i++) audio.tone(90 + i * 22, 0.18, { type: "sawtooth", volume: 0.04, slide: -30, delay: i * 0.12 });
    audio.noise(0.6, { volume: 0.12, freq: 800, type: "bandpass", q: 2, slide: -500, delay: 0.1 });
  }

  treeLand() {
    audio.tone(55, 0.6, { type: "sine", volume: 0.6, slide: -20 });
    audio.noise(0.7, { volume: 0.5, freq: 600, slide: -450 });
    audio.noise(0.4, { volume: 0.2, freq: 2400, type: "bandpass", q: 0.6, delay: 0.05 });
  }

  clink(final = false) {
    if (!this.gate("clink", 50)) return;
    const f = 1700 + Math.random() * 500;
    audio.tone(f, 0.12, { type: "triangle", volume: 0.16 });
    audio.tone(f * 1.52, 0.09, { type: "sine", volume: 0.09, delay: 0.005 });
    audio.noise(0.06, { volume: 0.32, freq: 4200, type: "highpass" });
    if (final) {
      for (let i = 0; i < 5; i++) audio.noise(0.05, { volume: 0.22, freq: 1600 + Math.random() * 2400, type: "bandpass", q: 3, delay: 0.04 + i * 0.05 });
      audio.tone(90, 0.3, { type: "sine", volume: 0.35, slide: -40 });
    }
  }

  rustle() {
    if (!this.gate("rustle", 80)) return;
    for (let i = 0; i < 3; i++) audio.noise(0.12, { volume: 0.12, freq: 3000 + Math.random() * 1500, type: "bandpass", q: 0.7, delay: i * 0.07 });
  }

  pickup() {
    if (!this.gate("pickup", 45)) return;
    audio.tone(620 + Math.random() * 80, 0.08, { type: "sine", volume: 0.12, slide: 400 });
  }

  crate() {
    audio.noise(0.25, { volume: 0.35, freq: 700, type: "bandpass", q: 0.8, slide: -300 });
    for (let i = 0; i < 3; i++) audio.noise(0.05, { volume: 0.18, freq: 1500 + i * 600, type: "bandpass", q: 3, delay: 0.05 + i * 0.05 });
    audio.jingle([72, 76, 79], { type: "triangle", volume: 0.08, step: 0.06 });
  }

  bottle() {
    audio.tone(1200, 0.25, { type: "sine", volume: 0.12, slide: -300 });
    audio.jingle([76, 81, 84, 88], { type: "sine", volume: 0.09, step: 0.08 });
  }

  craft() {
    for (let i = 0; i < 3; i++) audio.noise(0.05, { volume: 0.22, freq: 1200 + i * 400, type: "bandpass", q: 2, delay: i * 0.09 });
    audio.jingle([67, 71, 74, 79], { type: "triangle", volume: 0.13, step: 0.07 });
  }

  place() {
    audio.tone(80, 0.25, { type: "sine", volume: 0.45, slide: -30 });
    audio.noise(0.2, { volume: 0.28, freq: 500, slide: -300 });
  }

  denied() {
    if (!this.gate("denied", 200)) return;
    audio.tone(180, 0.12, { type: "square", volume: 0.06 });
    audio.tone(130, 0.18, { type: "square", volume: 0.06, delay: 0.09 });
  }

  eat() {
    for (let i = 0; i < 3; i++) audio.noise(0.06, { volume: 0.18, freq: 1800 + Math.random() * 900, type: "bandpass", q: 2.5, delay: i * 0.11 });
    audio.tone(330, 0.12, { type: "sine", volume: 0.06, slide: 120, delay: 0.32 });
  }

  splash(big = false) {
    audio.noise(big ? 0.6 : 0.35, { volume: big ? 0.4 : 0.25, freq: 1400, type: "bandpass", q: 0.6, slide: -900 });
    audio.noise(0.2, { volume: 0.12, freq: 3800, type: "highpass", delay: 0.04 });
  }

  /** The fishing line ticking while the timing needle sweeps. */
  reel() {
    if (!this.gate("reel", 70)) return;
    audio.tone(2200 + Math.random() * 300, 0.025, { type: "square", volume: 0.025 });
  }

  catchFish() {
    this.splash(true);
    audio.jingle([72, 76, 79, 84], { type: "triangle", volume: 0.14, step: 0.07 });
  }

  missFish() {
    audio.noise(0.3, { volume: 0.2, freq: 1200, type: "bandpass", slide: -800 });
    audio.tone(300, 0.25, { type: "triangle", volume: 0.06, slide: -120 });
  }

  fireLight() {
    audio.noise(0.7, { volume: 0.3, freq: 600, type: "lowpass", slide: 1600 });
    audio.tone(120, 0.5, { type: "sine", volume: 0.2, slide: 80 });
  }

  fuel() {
    audio.noise(0.3, { volume: 0.2, freq: 900, type: "bandpass", q: 0.8 });
    for (let i = 0; i < 4; i++) audio.noise(0.03, { volume: 0.12, freq: 3000 + Math.random() * 2000, type: "bandpass", q: 4, delay: 0.1 + i * 0.07 });
  }

  cookDone() {
    audio.jingle([79, 84], { type: "sine", volume: 0.12, step: 0.1 });
  }

  hurt() {
    audio.tone(220, 0.2, { type: "sawtooth", volume: 0.1, slide: -110 });
    audio.tone(80, 0.25, { type: "sine", volume: 0.4, slide: -30 });
    audio.noise(0.14, { volume: 0.28, freq: 900, slide: -600 });
  }

  hit(heavy = false) {
    if (!this.gate("hit", 40)) return;
    audio.tone(heavy ? 110 : 160, heavy ? 0.22 : 0.14, { type: "sine", volume: heavy ? 0.5 : 0.36, slide: -70 });
    audio.noise(heavy ? 0.16 : 0.1, { volume: heavy ? 0.45 : 0.32, freq: 1800, type: "bandpass", q: 0.9, slide: -1200 });
  }

  wallHit() {
    if (!this.gate("wall", 90)) return;
    audio.tone(130, 0.14, { type: "triangle", volume: 0.25, slide: -50 });
    audio.noise(0.12, { volume: 0.25, freq: 800, type: "bandpass", q: 1.2 });
  }

  wallBreak() {
    audio.noise(0.5, { volume: 0.45, freq: 700, slide: -500 });
    for (let i = 0; i < 4; i++) audio.noise(0.05, { volume: 0.2, freq: 1300 + i * 500, type: "bandpass", q: 3, delay: 0.05 + i * 0.06 });
  }

  growl(kind: string) {
    if (!this.gate(`growl-${kind}`, 600)) return;
    if (kind === "crab") {
      for (let i = 0; i < 4; i++) audio.noise(0.025, { volume: 0.14, freq: 3800, type: "bandpass", q: 6, delay: i * 0.06 });
    } else if (kind === "ghost") {
      audio.tone(520, 1.0, { type: "sine", volume: 0.06, slide: -180, attack: 0.25 });
      audio.tone(780, 0.9, { type: "sine", volume: 0.03, slide: -260, attack: 0.3 });
    } else {
      const f = kind === "brute" ? 70 : 110;
      audio.tone(f, 0.7, { type: "sawtooth", volume: 0.09, slide: -30, attack: 0.08 });
      audio.noise(0.6, { volume: 0.12, freq: kind === "brute" ? 300 : 500, type: "bandpass", q: 1, slide: -150 });
    }
  }

  /** Something climbing out of the surf. */
  emerge() {
    if (!this.gate("emerge", 250)) return;
    audio.noise(0.8, { volume: 0.2, freq: 900, type: "bandpass", q: 0.6, slide: -600 });
  }

  windup() {
    if (!this.gate("windup", 120)) return;
    audio.tone(196, 0.28, { type: "triangle", volume: 0.07, slide: 80 });
  }

  creatureDie() {
    if (!this.gate("cdie", 60)) return;
    audio.noise(0.4, { volume: 0.3, freq: 600, type: "bandpass", slide: -400 });
    audio.tone(140, 0.35, { type: "triangle", volume: 0.12, slide: -90 });
  }

  /** Low brass-ish chord when night falls. */
  nightFalls() {
    audio.tone(110, 2.2, { type: "sawtooth", volume: 0.07, attack: 0.4, slide: -8 });
    audio.tone(130.8, 2.2, { type: "sawtooth", volume: 0.05, attack: 0.5, slide: -8 });
    audio.tone(164.8, 2.0, { type: "triangle", volume: 0.07, attack: 0.5 });
    audio.noise(2.0, { volume: 0.12, freq: 300, type: "lowpass", slide: -150 });
  }

  dawn() {
    audio.jingle([67, 72, 76, 79, 84], { type: "sine", volume: 0.1, step: 0.14 });
  }

  achievement() {
    audio.jingle([72, 76, 79, 84, 88], { type: "triangle", volume: 0.1, step: 0.07 });
  }

  recipe() {
    audio.jingle([76, 83], { type: "sine", volume: 0.1, step: 0.09 });
  }

  sleep() {
    audio.jingle([72, 67, 64, 60], { type: "sine", volume: 0.08, step: 0.18 });
  }

  wake() {
    audio.tone(440, 0.2, { type: "square", volume: 0.05 });
    audio.tone(440, 0.2, { type: "square", volume: 0.05, delay: 0.25 });
  }

  die() {
    audio.tone(196, 0.5, { type: "triangle", volume: 0.15, slide: -60 });
    audio.tone(147, 0.7, { type: "triangle", volume: 0.15, slide: -50, delay: 0.35 });
    audio.tone(98, 1.2, { type: "triangle", volume: 0.17, slide: -30, delay: 0.75 });
  }

  /** A ship's horn, then the rescue fanfare. */
  horn() {
    audio.tone(98, 1.8, { type: "sawtooth", volume: 0.12, attack: 0.15 });
    audio.tone(147, 1.8, { type: "sawtooth", volume: 0.07, attack: 0.15 });
  }

  fanfare() {
    audio.jingle([60, 64, 67, 72], { type: "triangle", volume: 0.16, step: 0.14 });
    audio.jingle([72, 76, 79, 84, 88, 91], { type: "square", volume: 0.06, step: 0.12 });
    audio.tone(523, 1.4, { type: "triangle", volume: 0.1, delay: 0.75 });
    audio.tone(659, 1.4, { type: "triangle", volume: 0.08, delay: 0.75 });
    audio.tone(784, 1.4, { type: "triangle", volume: 0.08, delay: 0.75 });
  }

  start() {
    audio.noise(1.2, { volume: 0.2, freq: 500, type: "lowpass", slide: 300 });
    audio.jingle([64, 67, 72], { type: "triangle", volume: 0.1, step: 0.12 });
  }
}
