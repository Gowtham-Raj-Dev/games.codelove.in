import { audio } from "../shared/audio";

/** Kingdom Clash sound effects and stingers, synthesized on the shared audio hub (no files). */
export class Sfx {
  private readonly last = new Map<string, number>();

  private ok(name: string, gap: number) {
    const now = performance.now();
    if (now - (this.last.get(name) ?? -1e9) < gap * 1000) return false;
    this.last.set(name, now);
    return true;
  }

  click() {
    if (!this.ok("click", 0.03)) return;
    audio.tone(660, 0.06, { type: "triangle", volume: 0.08 });
  }

  denied() {
    if (!this.ok("denied", 0.15)) return;
    audio.tone(220, 0.12, { type: "square", volume: 0.06 });
    audio.tone(165, 0.16, { type: "square", volume: 0.05, delay: 0.09 });
  }

  /** Builder hammering on a construction site. */
  hammer() {
    if (!this.ok("hammer", 0.18)) return;
    audio.noise(0.05, { volume: 0.16, freq: 2400, type: "bandpass", q: 4 });
    audio.tone(900 + Math.random() * 300, 0.04, { type: "square", volume: 0.035 });
  }

  place() {
    audio.noise(0.25, { volume: 0.25, freq: 500, slide: -300 });
    audio.tone(140, 0.2, { type: "sine", volume: 0.2, slide: -60 });
  }

  pickUp() {
    audio.tone(420, 0.08, { type: "triangle", volume: 0.08, slide: 200 });
  }

  coins(amount = 1) {
    if (!this.ok("coins", 0.06)) return;
    const n = Math.min(5, 2 + Math.floor(Math.log10(Math.max(1, amount))));
    for (let i = 0; i < n; i++) audio.tone(1800 + Math.random() * 700, 0.09, { type: "square", volume: 0.035, delay: i * 0.045 });
    audio.tone(2637, 0.18, { type: "triangle", volume: 0.06, delay: n * 0.045 });
  }

  elixir() {
    if (!this.ok("elixir", 0.06)) return;
    for (let i = 0; i < 4; i++) audio.tone(500 + i * 180, 0.12, { type: "sine", volume: 0.07, slide: 300, delay: i * 0.05 });
  }

  gems() {
    audio.jingle([84, 88, 91, 96], { type: "triangle", volume: 0.1, step: 0.06 });
  }

  /** Upgrade or construction complete. */
  fanfare() {
    audio.jingle([67, 72, 76, 79, 84], { type: "sawtooth", volume: 0.07, step: 0.09 });
    audio.jingle([60, 64, 67, 72], { type: "triangle", volume: 0.1, step: 0.09 });
  }

  trained() {
    if (!this.ok("trained", 0.25)) return;
    audio.tone(520, 0.08, { type: "triangle", volume: 0.06 });
    audio.tone(780, 0.12, { type: "triangle", volume: 0.06, delay: 0.07 });
  }

  /** Battle start: a horn call. */
  horn() {
    audio.tone(196, 0.5, { type: "sawtooth", volume: 0.09, attack: 0.08 });
    audio.tone(294, 0.7, { type: "sawtooth", volume: 0.09, attack: 0.08, delay: 0.42 });
    audio.tone(392, 1.0, { type: "sawtooth", volume: 0.1, attack: 0.1, delay: 0.95 });
  }

  victory() {
    audio.jingle([60, 64, 67, 72, 76, 79, 84], { type: "sawtooth", volume: 0.08, step: 0.11 });
    audio.jingle([48, 55, 60, 64], { type: "triangle", volume: 0.12, step: 0.22 });
    audio.tone(1046, 1.2, { type: "triangle", volume: 0.1, delay: 0.8, attack: 0.05 });
  }

  defeat() {
    audio.jingle([67, 63, 60, 55, 51], { type: "triangle", volume: 0.12, step: 0.22 });
    audio.tone(98, 1.3, { type: "sawtooth", volume: 0.06, delay: 0.9, slide: -30 });
  }

  star() {
    audio.jingle([79, 84, 88, 91], { type: "triangle", volume: 0.12, step: 0.05 });
  }

  deploy() {
    if (!this.ok("deploy", 0.07)) return;
    audio.noise(0.12, { volume: 0.1, freq: 700, type: "bandpass", q: 1.5, slide: -300 });
    audio.tone(330 + Math.random() * 80, 0.08, { type: "triangle", volume: 0.05 });
  }

  noDeploy() {
    if (!this.ok("nodeploy", 0.35)) return;
    audio.tone(180, 0.14, { type: "square", volume: 0.05 });
  }

  sword() {
    if (!this.ok("sword", 0.05)) return;
    audio.noise(0.07, { volume: 0.13, freq: 3000, type: "bandpass", q: 3, slide: -1500 });
    audio.tone(1200 + Math.random() * 600, 0.05, { type: "square", volume: 0.025 });
  }

  punch() {
    if (!this.ok("punch", 0.08)) return;
    audio.noise(0.1, { volume: 0.22, freq: 380, slide: -200 });
    audio.tone(90, 0.12, { type: "sine", volume: 0.18, slide: -30 });
  }

  bow() {
    if (!this.ok("bow", 0.05)) return;
    audio.tone(700, 0.08, { type: "triangle", volume: 0.05, slide: -380 });
    audio.noise(0.06, { volume: 0.06, freq: 4000, type: "highpass" });
  }

  arrowTower() {
    if (!this.ok("ballista", 0.07)) return;
    audio.tone(500, 0.12, { type: "triangle", volume: 0.08, slide: -280 });
    audio.noise(0.08, { volume: 0.09, freq: 2600, type: "bandpass", q: 3, slide: -1800 });
  }

  cannon() {
    if (!this.ok("cannon", 0.09)) return;
    audio.noise(0.35, { volume: 0.3, freq: 900, slide: -760 });
    audio.tone(110, 0.25, { type: "sine", volume: 0.3, slide: -60 });
  }

  catapult() {
    if (!this.ok("catapult", 0.12)) return;
    audio.tone(160, 0.14, { type: "square", volume: 0.05, slide: -60 });
    audio.noise(0.4, { volume: 0.15, freq: 500, type: "bandpass", q: 1.4, slide: 1200, delay: 0.04 });
  }

  zap() {
    if (!this.ok("zap", 0.08)) return;
    audio.tone(1300, 0.18, { type: "sawtooth", volume: 0.04, slide: -900 });
    audio.tone(650, 0.22, { type: "sine", volume: 0.06, slide: 500 });
  }

  /** Hidden Tesla: an electric crack and buzz. */
  shock() {
    if (!this.ok("shock", 0.1)) return;
    audio.noise(0.05, { volume: 0.22, freq: 6500, type: "highpass" });
    audio.noise(0.18, { volume: 0.12, freq: 3000, type: "bandpass", q: 6, slide: -1800, delay: 0.02 });
    audio.tone(120, 0.16, { type: "sawtooth", volume: 0.05, slide: 40 });
  }

  /** A Hidden Tesla springs out of the ground. */
  rise() {
    audio.tone(180, 0.4, { type: "sawtooth", volume: 0.06, slide: 700 });
    audio.noise(0.35, { volume: 0.14, freq: 700, slide: -400 });
  }

  /** The Wall Breaker's bomb: a deep blast with a crack on top. */
  blast() {
    if (!this.ok("blast", 0.08)) return;
    audio.noise(0.06, { volume: 0.3, freq: 4200, type: "highpass" });
    audio.noise(1.0, { volume: 0.55, freq: 1500, slide: -1400, delay: 0.02 });
    audio.tone(55, 0.8, { type: "sine", volume: 0.5, slide: -30 });
  }

  boom(big = false) {
    if (!this.ok(big ? "boomBig" : "boom", 0.07)) return;
    audio.noise(big ? 0.9 : 0.45, { volume: big ? 0.5 : 0.3, freq: big ? 1400 : 1000, slide: big ? -1300 : -900 });
    audio.tone(big ? 65 : 90, big ? 0.7 : 0.3, { type: "sine", volume: big ? 0.45 : 0.25, slide: -40 });
  }

  collapse() {
    if (!this.ok("collapse", 0.1)) return;
    audio.noise(0.9, { volume: 0.32, freq: 700, slide: -600 });
    audio.noise(0.4, { volume: 0.18, freq: 2600, type: "bandpass", q: 1, delay: 0.08 });
    audio.tone(70, 0.6, { type: "sine", volume: 0.25, slide: -30 });
  }

  wallBreak() {
    if (!this.ok("wall", 0.1)) return;
    audio.noise(0.4, { volume: 0.22, freq: 1600, type: "bandpass", q: 0.8, slide: -1100 });
  }

  die() {
    if (!this.ok("die", 0.08)) return;
    audio.tone(420, 0.2, { type: "triangle", volume: 0.05, slide: -260 });
  }

  heal() {
    if (!this.ok("heal", 0.3)) return;
    audio.jingle([76, 79, 83], { type: "sine", volume: 0.05, step: 0.06 });
  }

  thunder() {
    if (!this.ok("thunder", 0.12)) return;
    audio.noise(0.08, { volume: 0.35, freq: 5000, type: "highpass" });
    audio.noise(0.9, { volume: 0.32, freq: 900, slide: -800, delay: 0.04 });
  }

  spell(kind: string) {
    if (kind === "lightning") return;
    if (kind === "freeze") {
      audio.tone(1500, 0.5, { type: "sine", volume: 0.06, slide: 900 });
      audio.noise(0.5, { volume: 0.12, freq: 6000, type: "highpass" });
    } else if (kind === "rage") {
      audio.tone(110, 0.6, { type: "sawtooth", volume: 0.08, slide: 60 });
      audio.tone(220, 0.6, { type: "sawtooth", volume: 0.05, slide: 120 });
    } else if (kind === "jump") {
      audio.tone(300, 0.25, { type: "triangle", volume: 0.09, slide: 600 });
    } else audio.jingle([72, 76, 79, 84], { type: "sine", volume: 0.08, step: 0.07 });
  }

  trap() {
    audio.tone(1600, 0.06, { type: "square", volume: 0.05 });
  }

  alarm() {
    for (let i = 0; i < 3; i++) {
      audio.tone(660, 0.18, { type: "square", volume: 0.05, delay: i * 0.4 });
      audio.tone(520, 0.18, { type: "square", volume: 0.05, delay: i * 0.4 + 0.2 });
    }
  }
}
