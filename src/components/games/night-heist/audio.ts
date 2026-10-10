import { audio, NoiseLoop } from "../shared/audio";

/** Night Heist's synthesized sounds: soft and loud footsteps, guard voices, security gear, loot. */
export class Sfx {
  private readonly hum = new NoiseLoop({ type: "bandpass", freq: 900, q: 9 });
  private humTone: { osc: OscillatorNode; gain: GainNode } | null = null;
  private sirenT = 0;

  step(kind: "sneak" | "walk" | "run") {
    if (kind === "sneak") audio.noise(0.05, { volume: 0.05, freq: 600, type: "lowpass" });
    else if (kind === "walk") {
      audio.noise(0.07, { volume: 0.14, freq: 900, type: "lowpass", slide: -500 });
      audio.tone(110 + Math.random() * 20, 0.06, { type: "sine", volume: 0.07 });
    } else {
      audio.noise(0.09, { volume: 0.32, freq: 1300, type: "lowpass", slide: -700 });
      audio.tone(95 + Math.random() * 20, 0.08, { type: "sine", volume: 0.16 });
    }
  }

  guardStep() {
    audio.noise(0.06, { volume: 0.05, freq: 700, type: "lowpass" });
  }

  /** "Hm?" — a guard noticed something: a rising vocal-ish blip. */
  huh(pitch = 1) {
    audio.tone(190 * pitch, 0.16, { type: "sawtooth", volume: 0.07, slide: 40 * pitch, attack: 0.02 });
    audio.tone(380 * pitch, 0.2, { type: "triangle", volume: 0.06, slide: 160 * pitch, delay: 0.12, attack: 0.02 });
  }

  /** "Hey!" — spotted. */
  hey(pitch = 1) {
    audio.tone(420 * pitch, 0.12, { type: "sawtooth", volume: 0.1, slide: 180 * pitch, attack: 0.01 });
    audio.tone(600 * pitch, 0.22, { type: "square", volume: 0.06, slide: -260 * pitch, delay: 0.1 });
  }

  /** The guard gives up looking. */
  shrug(pitch = 1) {
    audio.tone(260 * pitch, 0.18, { type: "triangle", volume: 0.05, slide: -80 * pitch });
    audio.tone(200 * pitch, 0.22, { type: "triangle", volume: 0.045, slide: -60 * pitch, delay: 0.16 });
  }

  servo() {
    audio.noise(0.18, { volume: 0.05, freq: 2400, q: 6, type: "bandpass", slide: 600 });
  }

  cameraLock() {
    audio.tone(1320, 0.07, { type: "square", volume: 0.05 });
    audio.tone(1320, 0.07, { type: "square", volume: 0.05, delay: 0.12 });
  }

  /** Laser hum level 0..1 (nearest active gate). */
  laserHum(level: number) {
    this.hum.set(level * 0.05, 700 + level * 500);
    const ctx = audio.ctx;
    if (!ctx || !audio.sfxBus) return;
    if (!this.humTone) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 58;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(audio.sfxBus);
      osc.start();
      this.humTone = { osc, gain };
    }
    this.humTone.gain.gain.setTargetAtTime(level * 0.03, ctx.currentTime, 0.08);
  }

  zap() {
    audio.noise(0.25, { volume: 0.3, freq: 3000, q: 2, type: "bandpass", slide: -2400 });
    audio.tone(880, 0.25, { type: "sawtooth", volume: 0.12, slide: -600 });
  }

  plateClick() {
    audio.noise(0.05, { volume: 0.4, freq: 2500, type: "highpass" });
    audio.tone(160, 0.25, { type: "square", volume: 0.12, slide: -80, delay: 0.04 });
  }

  /** Call every frame while the alarm is on: a two-tone siren. */
  siren(dt: number) {
    this.sirenT -= dt;
    if (this.sirenT > 0) return;
    this.sirenT = 0.9;
    audio.tone(740, 0.42, { type: "square", volume: 0.05, slide: 220, attack: 0.04 });
    audio.tone(960, 0.42, { type: "square", volume: 0.05, slide: -220, delay: 0.45, attack: 0.04 });
  }

  alarmStart() {
    this.sirenT = 0.35;
    audio.tone(220, 0.3, { type: "sawtooth", volume: 0.12, slide: 440 });
  }

  allClear() {
    audio.jingle([69, 64, 60], { type: "triangle", volume: 0.08, step: 0.12 });
  }

  coinThrow() {
    audio.noise(0.12, { volume: 0.06, freq: 2000, type: "bandpass", slide: 1200 });
  }

  coinClink() {
    audio.tone(2637, 0.18, { type: "triangle", volume: 0.12 });
    audio.tone(3520, 0.14, { type: "sine", volume: 0.08, delay: 0.05 });
    audio.tone(2349, 0.16, { type: "triangle", volume: 0.07, delay: 0.14 });
  }

  pickup() {
    audio.jingle([84, 88, 91, 96], { type: "sine", volume: 0.09, step: 0.05 });
    audio.noise(0.3, { volume: 0.05, freq: 6000, type: "highpass" });
  }

  gem() {
    audio.jingle([76, 79, 83, 88, 91], { type: "triangle", volume: 0.12, step: 0.07 });
    audio.jingle([88, 95], { type: "sine", volume: 0.07, step: 0.18 });
  }

  key() {
    audio.tone(1760, 0.08, { type: "square", volume: 0.05 });
    audio.tone(2349, 0.12, { type: "square", volume: 0.05, delay: 0.08 });
  }

  unlock() {
    audio.tone(1568, 0.06, { type: "square", volume: 0.05 });
    audio.tone(2093, 0.1, { type: "square", volume: 0.05, delay: 0.07 });
    audio.noise(0.6, { volume: 0.22, freq: 300, type: "lowpass", delay: 0.15 });
    audio.tone(70, 0.6, { type: "sine", volume: 0.18, slide: -20, delay: 0.15 });
  }

  denied() {
    audio.tone(180, 0.14, { type: "square", volume: 0.06 });
    audio.tone(150, 0.2, { type: "square", volume: 0.06, delay: 0.15 });
  }

  console() {
    audio.jingle([72, 67, 60, 55], { type: "square", volume: 0.05, step: 0.08 });
    audio.noise(0.4, { volume: 0.08, freq: 1500, type: "bandpass", delay: 0.32 });
  }

  knockout() {
    audio.noise(0.12, { volume: 0.35, freq: 500, type: "lowpass" });
    audio.tone(90, 0.2, { type: "sine", volume: 0.25, slide: -40 });
    audio.noise(0.3, { volume: 0.12, freq: 300, type: "lowpass", delay: 0.28 });
  }

  wake() {
    audio.tone(160, 0.3, { type: "sawtooth", volume: 0.05, slide: 60 });
  }

  escape() {
    audio.jingle([69, 72, 76, 81, 84], { type: "triangle", volume: 0.14, step: 0.09 });
    audio.jingle([57, 64], { type: "sine", volume: 0.1, step: 0.2 });
  }

  caught() {
    audio.tone(220, 0.5, { type: "sawtooth", volume: 0.12, slide: -110 });
    audio.tone(165, 0.7, { type: "sawtooth", volume: 0.1, slide: -80, delay: 0.35 });
    audio.noise(0.3, { volume: 0.2, freq: 400, type: "lowpass", delay: 0.1 });
  }

  denyExit() {
    audio.tone(330, 0.12, { type: "triangle", volume: 0.06 });
  }

  stopLoops() {
    this.laserHum(0);
  }

  dispose() {
    this.hum.stop();
    if (this.humTone) {
      try {
        this.humTone.osc.stop();
      } catch {
        // Already stopped.
      }
      this.humTone.osc.disconnect();
      this.humTone.gain.disconnect();
      this.humTone = null;
    }
  }
}
