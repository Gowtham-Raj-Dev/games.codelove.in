import { audio } from "../shared/audio";

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
/** Major scale steps for the rising coin chain. */
const COIN_STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];

/** Sky Hop sound effects, synthesized on the shared audio hub (no audio files). */
export class Sfx {
  private coinStep = 0;
  private lastCoin = 0;
  private lastStep = 0;

  jump() {
    audio.tone(330, 0.16, { type: "square", volume: 0.07, slide: 330 });
    audio.tone(660, 0.1, { type: "triangle", volume: 0.08, slide: 220, delay: 0.02 });
  }

  doubleJump() {
    audio.tone(520, 0.14, { type: "square", volume: 0.06, slide: 520 });
    audio.tone(780, 0.16, { type: "triangle", volume: 0.08, slide: 600, delay: 0.05 });
    audio.noise(0.2, { volume: 0.12, freq: 2000, type: "bandpass", slide: 3000, q: 2 });
  }

  land(hard = 0) {
    audio.noise(0.09 + hard * 0.08, { volume: 0.16 + hard * 0.2, freq: 700, slide: -500 });
    audio.tone(140, 0.08, { type: "sine", volume: 0.12 + hard * 0.15, slide: -60 });
  }

  step() {
    const now = performance.now();
    if (now - this.lastStep < 150) return;
    this.lastStep = now;
    audio.noise(0.05, { volume: 0.05, freq: 1100 + Math.random() * 500, q: 1.2, type: "bandpass" });
  }

  coin() {
    // Coins picked up in quick succession climb the scale.
    const now = performance.now();
    this.coinStep = now - this.lastCoin < 650 ? Math.min(this.coinStep + 1, COIN_STEPS.length - 1) : 0;
    this.lastCoin = now;
    const base = hz(84 + COIN_STEPS[this.coinStep]);
    audio.tone(base, 0.07, { type: "square", volume: 0.055 });
    audio.tone(base * 1.5, 0.18, { type: "square", volume: 0.05, delay: 0.055 });
  }

  star() {
    audio.jingle([72, 76, 79, 84, 88, 91, 96], { type: "triangle", volume: 0.15, step: 0.06 });
    audio.jingle([79, 84, 88], { type: "sine", volume: 0.1, step: 0.12 });
  }

  oneUp() {
    audio.jingle([76, 79, 88, 84, 86, 91], { type: "square", volume: 0.07, step: 0.09 });
  }

  heart() {
    audio.jingle([72, 79, 84], { type: "sine", volume: 0.16, step: 0.08 });
  }

  key() {
    audio.jingle([84, 88, 91, 96], { type: "triangle", volume: 0.12, step: 0.05 });
    audio.tone(hz(96), 0.5, { type: "sine", volume: 0.05, delay: 0.2 });
  }

  chest() {
    audio.noise(0.25, { volume: 0.2, freq: 500, slide: 400 });
    audio.jingle([67, 72, 76, 79, 84], { type: "triangle", volume: 0.13, step: 0.07 });
  }

  locked() {
    audio.tone(220, 0.12, { type: "square", volume: 0.07 });
    audio.tone(185, 0.18, { type: "square", volume: 0.07, delay: 0.12 });
  }

  spring() {
    audio.tone(180, 0.38, { type: "sine", volume: 0.24, slide: 700 });
    audio.tone(360, 0.3, { type: "triangle", volume: 0.08, slide: 900, delay: 0.03 });
    // Wobble: a few detuned blips trailing off.
    for (let i = 0; i < 4; i++) audio.tone(520 + i * 60, 0.06, { type: "sine", volume: 0.05 * (1 - i / 4), delay: 0.12 + i * 0.06 });
  }

  crumbleWarn() {
    audio.noise(0.3, { volume: 0.1, freq: 400, q: 3, type: "bandpass" });
  }

  crumble() {
    audio.noise(0.5, { volume: 0.32, freq: 900, slide: -700 });
    audio.tone(90, 0.35, { type: "triangle", volume: 0.14, slide: -40 });
  }

  stomp() {
    audio.tone(520, 0.12, { type: "square", volume: 0.09, slide: -340 });
    audio.noise(0.12, { volume: 0.25, freq: 600, slide: -400 });
    audio.tone(880, 0.12, { type: "triangle", volume: 0.07, delay: 0.08, slide: 400 });
  }

  poundStart() {
    audio.noise(0.22, { volume: 0.14, freq: 3000, type: "bandpass", slide: -2400, q: 1.5 });
  }

  pound() {
    audio.noise(0.4, { volume: 0.45, freq: 500, slide: -380 });
    audio.tone(70, 0.35, { type: "sine", volume: 0.35, slide: -30 });
  }

  crate() {
    audio.noise(0.22, { volume: 0.38, freq: 1600, q: 0.9, slide: -1200 });
    audio.tone(240, 0.08, { type: "square", volume: 0.05, slide: -120 });
  }

  bonk() {
    audio.tone(300, 0.08, { type: "square", volume: 0.06, slide: -100 });
  }

  hurt() {
    audio.tone(420, 0.25, { type: "sawtooth", volume: 0.08, slide: -300 });
    audio.noise(0.15, { volume: 0.2, freq: 1200 });
  }

  fall() {
    audio.tone(700, 0.9, { type: "triangle", volume: 0.1, slide: -600 });
  }

  lose() {
    audio.jingle([67, 66, 65, 64], { type: "square", volume: 0.06, step: 0.16 });
  }

  checkpoint() {
    audio.jingle([67, 71, 74, 79], { type: "square", volume: 0.06, step: 0.07 });
    audio.noise(0.3, { volume: 0.08, freq: 5000, type: "highpass" });
  }

  complete() {
    audio.jingle([72, 76, 79, 84], { type: "square", volume: 0.07, step: 0.11 });
    audio.jingle([79, 84, 88, 91, 96], { type: "triangle", volume: 0.12, step: 0.1 });
    audio.tone(hz(84), 1.1, { type: "triangle", volume: 0.1, delay: 0.55 });
    audio.tone(hz(88), 1.1, { type: "triangle", volume: 0.08, delay: 0.55 });
    audio.tone(hz(91), 1.1, { type: "triangle", volume: 0.07, delay: 0.55 });
  }

  go() {
    audio.tone(hz(72), 0.12, { type: "square", volume: 0.07 });
    audio.tone(hz(84), 0.25, { type: "square", volume: 0.07, delay: 0.12 });
  }
}
