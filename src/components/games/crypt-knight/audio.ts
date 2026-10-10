import { audio } from "../shared/audio";

/** Crypt Knight sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private last = new Map<string, number>();

  /** Skips a sound if the same one played a moment ago (ten skeletons dying at once shouldn't clip). */
  private gate(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.last.get(key) ?? -1e9) < ms) return false;
    this.last.set(key, now);
    return true;
  }

  swing(step: number) {
    const f = [900, 1200, 700][step] ?? 900;
    audio.noise(0.2, { volume: 0.32, freq: f, type: "bandpass", slide: f * 1.8, q: 1.2 });
    audio.noise(0.12, { volume: 0.12, freq: 3200, type: "highpass", delay: 0.03 });
  }

  /** Sword meets bone. */
  hit(heavy = false) {
    if (!this.gate("hit", 40)) return;
    audio.tone(heavy ? 120 : 170, heavy ? 0.22 : 0.14, { type: "sine", volume: heavy ? 0.5 : 0.36, slide: heavy ? -70 : -90 });
    audio.noise(heavy ? 0.16 : 0.1, { volume: heavy ? 0.5 : 0.36, freq: 2200, type: "bandpass", q: 0.9, slide: -1500 });
    audio.noise(0.05, { volume: 0.22, freq: 4800, type: "highpass", delay: 0.01 });
  }

  boneBreak() {
    if (!this.gate("bone", 70)) return;
    for (let i = 0; i < 5; i++) audio.noise(0.045, { volume: 0.26 - i * 0.03, freq: 2600 + Math.random() * 2400, type: "bandpass", q: 4, delay: i * 0.045 + Math.random() * 0.02 });
    audio.tone(90, 0.3, { type: "sine", volume: 0.3, slide: -40, delay: 0.05 });
  }

  clang(strong = false) {
    if (!this.gate("clang", 50)) return;
    for (const [f, v] of [
      [1240, 0.09],
      [1880, 0.07],
      [2730, 0.05],
    ] as const)
      audio.tone(f * (strong ? 1.06 : 1), strong ? 0.5 : 0.3, { type: "triangle", volume: v * (strong ? 1.5 : 1) });
    audio.noise(0.08, { volume: 0.32, freq: 5200, type: "highpass" });
  }

  parry() {
    this.clang(true);
    audio.tone(880, 0.35, { type: "sine", volume: 0.14, slide: 880, delay: 0.04 });
    audio.jingle([84, 91], { type: "triangle", volume: 0.08, step: 0.05 });
  }

  roll() {
    audio.noise(0.3, { volume: 0.3, freq: 500, type: "lowpass", slide: 900 });
    audio.noise(0.18, { volume: 0.12, freq: 2400, type: "bandpass", slide: -1600, delay: 0.08 });
  }

  spin() {
    for (let i = 0; i < 3; i++) audio.noise(0.26, { volume: 0.34, freq: 700 + i * 300, type: "bandpass", slide: 1600, q: 1.4, delay: i * 0.22 });
    audio.tone(220, 0.7, { type: "sawtooth", volume: 0.06, slide: 440 });
  }

  hurt() {
    audio.tone(240, 0.22, { type: "sawtooth", volume: 0.12, slide: -130 });
    audio.tone(80, 0.25, { type: "sine", volume: 0.45, slide: -30 });
    audio.noise(0.16, { volume: 0.32, freq: 900, slide: -600 });
  }

  potion() {
    for (let i = 0; i < 3; i++) audio.tone(300 + i * 70, 0.09, { type: "sine", volume: 0.18, slide: 260, delay: i * 0.1 });
    audio.jingle([76, 79, 83, 88], { type: "sine", volume: 0.09, step: 0.06 });
  }

  /** A mage starts charging a bolt. */
  charge() {
    if (!this.gate("charge", 120)) return;
    audio.tone(330, 0.7, { type: "sine", volume: 0.07, slide: 330, attack: 0.3 });
    audio.tone(495, 0.7, { type: "triangle", volume: 0.035, slide: 495, attack: 0.3 });
  }

  bolt() {
    if (!this.gate("bolt", 60)) return;
    audio.tone(900, 0.25, { type: "square", volume: 0.05, slide: -600 });
    audio.noise(0.2, { volume: 0.16, freq: 3000, type: "bandpass", slide: -2200, q: 2 });
  }

  fizzle() {
    if (!this.gate("fizzle", 50)) return;
    audio.noise(0.25, { volume: 0.2, freq: 4000, type: "highpass", slide: -3000 });
    audio.tone(500, 0.18, { type: "sine", volume: 0.07, slide: -300 });
  }

  /** Heavy enemy wind-up — a low warning so big hits never come out of nowhere. */
  warn() {
    if (!this.gate("warn", 150)) return;
    audio.tone(196, 0.3, { type: "triangle", volume: 0.09, slide: 60 });
  }

  rise() {
    if (!this.gate("rise", 200)) return;
    audio.noise(1.1, { volume: 0.32, freq: 260, type: "lowpass", slide: -120 });
    for (let i = 0; i < 6; i++) audio.noise(0.04, { volume: 0.12, freq: 3000 + Math.random() * 2000, type: "bandpass", q: 5, delay: 0.3 + i * 0.12 + Math.random() * 0.05 });
  }

  door() {
    audio.noise(1.0, { volume: 0.3, freq: 300, type: "lowpass", slide: 200 });
    audio.tone(70, 0.9, { type: "sawtooth", volume: 0.07, slide: 30 });
    audio.tone(60, 0.3, { type: "sine", volume: 0.4, delay: 0.85 });
  }

  chest() {
    audio.tone(160, 0.35, { type: "sawtooth", volume: 0.07, slide: 160 });
    audio.jingle([79, 83, 86, 91], { type: "square", volume: 0.05, step: 0.06 });
  }

  breakWood() {
    if (!this.gate("wood", 60)) return;
    audio.noise(0.22, { volume: 0.45, freq: 900, type: "bandpass", q: 0.7, slide: -500 });
    for (let i = 0; i < 3; i++) audio.noise(0.05, { volume: 0.18, freq: 1800 + i * 500, type: "bandpass", q: 3, delay: 0.04 + i * 0.05 });
  }

  coin() {
    if (!this.gate("coin", 45)) return;
    const f = 1320 + Math.random() * 240;
    audio.tone(f, 0.08, { type: "square", volume: 0.045 });
    audio.tone(f * 1.5, 0.14, { type: "square", volume: 0.04, delay: 0.05 });
  }

  pickupPotion() {
    audio.jingle([67, 72, 76], { type: "sine", volume: 0.12, step: 0.06 });
  }

  spikes() {
    if (!this.gate("spikes", 120)) return;
    audio.noise(0.14, { volume: 0.3, freq: 5200, type: "highpass" });
    audio.tone(1500, 0.12, { type: "triangle", volume: 0.04, slide: -400 });
  }

  roomClear() {
    audio.jingle([64, 67, 71, 76, 79], { type: "triangle", volume: 0.16, step: 0.09 });
  }

  powerUp() {
    audio.jingle([72, 76, 79, 84, 88], { type: "square", volume: 0.07, step: 0.06 });
    audio.jingle([60, 64, 67], { type: "triangle", volume: 0.12, step: 0.06 });
  }

  buy() {
    audio.jingle([84, 88], { type: "square", volume: 0.06, step: 0.05 });
  }

  denied() {
    audio.tone(160, 0.15, { type: "square", volume: 0.08 });
    audio.tone(120, 0.2, { type: "square", volume: 0.08, delay: 0.1 });
  }

  roar() {
    audio.tone(70, 1.3, { type: "sawtooth", volume: 0.2, slide: -25, attack: 0.1 });
    audio.tone(105, 1.1, { type: "sawtooth", volume: 0.1, slide: -40, attack: 0.1 });
    audio.noise(1.3, { volume: 0.35, freq: 420, type: "bandpass", q: 0.8, slide: -250 });
  }

  slam() {
    audio.tone(55, 0.7, { type: "sine", volume: 0.7, slide: -25 });
    audio.noise(0.7, { volume: 0.6, freq: 700, slide: -600 });
    audio.noise(0.2, { volume: 0.3, freq: 3000, type: "highpass", delay: 0.02 });
  }

  playerDeath() {
    audio.tone(196, 0.5, { type: "triangle", volume: 0.16, slide: -60 });
    audio.tone(147, 0.7, { type: "triangle", volume: 0.16, slide: -50, delay: 0.35 });
    audio.tone(98, 1.2, { type: "triangle", volume: 0.18, slide: -30, delay: 0.75 });
  }

  victory() {
    audio.jingle([64, 68, 71, 76], { type: "square", volume: 0.07, step: 0.12 });
    audio.jingle([76, 80, 83, 88], { type: "triangle", volume: 0.14, step: 0.12 });
  }

  start() {
    audio.tone(330, 0.15, { type: "triangle", volume: 0.14 });
    audio.tone(494, 0.3, { type: "triangle", volume: 0.14, delay: 0.12 });
    audio.noise(0.4, { volume: 0.12, freq: 3500, type: "highpass", slide: -2000, delay: 0.05 });
  }
}
