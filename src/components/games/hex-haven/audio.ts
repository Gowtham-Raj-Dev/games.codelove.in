import { audio, NoiseLoop } from "../shared/audio";

/**
 * Hex Haven sound effects, synthesized on the shared audio hub. Chimes use the G major pentatonic
 * scale of the soundtrack (HEX_AMBIENT, root G3) so they always blend with the music.
 */

const PENTA = [0, 2, 4, 7, 9];
/** MIDI note of the n-th pentatonic degree above G5. */
const penta = (n: number) => 79 + 12 * Math.floor(n / 5) + PENTA[((n % 5) + 5) % 5];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class Sfx {
  private readonly waves = new NoiseLoop({ type: "lowpass", freq: 380, q: 0.4 });
  private lastHover = 0;

  private bell(midi: number, delay = 0, volume = 0.07) {
    const f = hz(midi);
    audio.tone(f, 0.9, { type: "sine", volume, delay, attack: 0.004 });
    audio.tone(f * 2, 0.35, { type: "sine", volume: volume * 0.35, delay, attack: 0.004 });
    audio.tone(f * 3.01, 0.18, { type: "triangle", volume: volume * 0.12, delay, attack: 0.003 });
  }

  /** A wooden tile landing on the table. */
  place() {
    audio.noise(0.06, { volume: 0.32, freq: 1900, type: "bandpass", q: 2.2 });
    audio.tone(190, 0.1, { type: "triangle", volume: 0.22, slide: -70 });
    audio.noise(0.05, { volume: 0.16, freq: 1200, type: "bandpass", q: 3, delay: 0.045 });
    audio.tone(150, 0.07, { type: "triangle", volume: 0.1, slide: -40, delay: 0.045 });
  }

  /** One rising chime per matching edge. */
  matches(count: number) {
    for (let i = 0; i < count; i++) this.bell(penta(i), 0.09 + i * 0.075, 0.05 + i * 0.006);
  }

  perfect(flawless: boolean) {
    const notes = flawless ? [0, 2, 4, 5, 7, 9, 10] : [0, 2, 4, 5, 7];
    notes.forEach((n, i) => this.bell(penta(n), 0.5 + i * 0.07, 0.06));
    audio.noise(0.9, { volume: 0.06, freq: 6000, type: "highpass", delay: 0.5 });
  }

  quest() {
    audio.jingle([67, 71, 74, 79, 83, 86], { type: "triangle", volume: 0.13, step: 0.09 });
    [79, 83, 86].forEach((m, i) => this.bell(m + 12, 0.62 + i * 0.05, 0.035));
  }

  questFailed() {
    [74, 71, 67].forEach((m, i) => audio.tone(hz(m), 0.4, { type: "triangle", volume: 0.06, delay: i * 0.14 }));
  }

  questStarted() {
    this.bell(86, 0.25, 0.05);
    this.bell(91, 0.33, 0.04);
  }

  bonusTile() {
    audio.tone(hz(91), 0.25, { type: "sine", volume: 0.05, delay: 0.25 });
  }

  rotate() {
    audio.noise(0.035, { volume: 0.1, freq: 2600, type: "bandpass", q: 4 });
    audio.tone(1250, 0.04, { type: "triangle", volume: 0.035 });
  }

  /** A soft tick when the ghost moves onto another spot. */
  hover() {
    const now = performance.now();
    if (now - this.lastHover < 50) return;
    this.lastHover = now;
    audio.tone(2100, 0.025, { type: "sine", volume: 0.018 });
  }

  invalid() {
    audio.tone(150, 0.14, { type: "triangle", volume: 0.12, slide: -40 });
    audio.tone(142, 0.14, { type: "square", volume: 0.025, slide: -40, delay: 0.02 });
  }

  undo() {
    audio.noise(0.22, { volume: 0.14, freq: 500, type: "bandpass", slide: 1600, q: 1.4 });
    audio.tone(520, 0.16, { type: "triangle", volume: 0.07, slide: -180 });
  }

  draw() {
    audio.noise(0.09, { volume: 0.05, freq: 3400, type: "highpass" });
  }

  start() {
    [67, 74, 79, 83].forEach((m, i) => this.bell(m, i * 0.12, 0.05));
  }

  gameOver() {
    [86, 83, 79, 74, 79].forEach((m, i) => this.bell(m, i * 0.28, 0.06));
  }

  /** The sea around the island: a quiet surf bed (0 = silent). */
  surf(level: number) {
    this.waves.set(level * 0.05, 320 + level * 120);
  }

  dispose() {
    this.waves.stop();
  }
}
