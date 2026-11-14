import type { WebGLRenderer } from "three";

/**
 * Render resolution that follows the frame rate, shared by the games that have no resolution
 * control of their own.
 *
 * Phones have 2.5-3x screens, and a fixed low pixel ratio looks soft on them, while a fixed high
 * one makes weaker phones stutter. So a game starts at a safe ratio (`start`), climbs towards the
 * screen's own sharpness (`max`, up to 2x) while frames stay smooth, and steps down as soon as
 * they do not. A ratio that turned out too slow is never tried again, so it cannot flip back and
 * forth.
 *
 * Call tick() once a frame, right BEFORE renderer.render(): changing the ratio clears the canvas,
 * and a cleared canvas left on screen shows as a black flash.
 */
export class AdaptiveRes {
  cur: number;
  private ceil: number;
  private readonly start: number;
  private readonly min: number;
  private acc = 0;
  private n = 0;
  private good = 0;

  constructor(
    private readonly renderer: WebGLRenderer,
    /** Runs after the ratio changed: the game's own resize(), for anything sized from the canvas. */
    private readonly onChange: () => void,
    { start, max = 2, min = 1 }: { start: number; max?: number; min?: number },
  ) {
    const dpr = window.devicePixelRatio || 1;
    this.ceil = Math.min(dpr, max);
    this.cur = this.start = Math.min(this.ceil, start);
    this.min = Math.min(this.cur, min);
    renderer.setPixelRatio(this.cur);
  }

  /** `dt`: the real time of the last frame, in seconds. */
  tick(dt: number) {
    // One long frame is a hitch (a download, shaders compiling, the tab coming back), not the frame rate.
    if (dt > 0.2) {
      this.acc = 0;
      this.n = 0;
      return;
    }
    this.acc += dt;
    this.n++;
    if (this.acc < 1.5) return;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;

    let next = this.cur;
    if (avg > 1 / 50 && this.cur > this.min) {
      next = Math.max(this.min, this.cur * 0.85);
      // Never retry a ratio above the starting one once it proved too slow.
      this.ceil = Math.max(next, Math.min(this.ceil, this.start));
      this.good = 0;
    } else if (avg < 1 / 57 && this.cur < this.ceil) {
      // Only climb after a few smooth windows in a row.
      if (++this.good >= 3) {
        next = Math.min(this.ceil, this.cur * 1.12);
        this.good = 0;
      }
    } else this.good = 0;

    if (Math.abs(next - this.cur) < 0.01) return;
    this.cur = next;
    this.renderer.setPixelRatio(next);
    this.onChange();
  }
}
