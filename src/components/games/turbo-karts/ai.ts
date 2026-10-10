import { DRIFT_BASE, DRIFT_RANGE, type Kart, type KartInput } from "./kart";
import { ROAD_HALF, type Track } from "./tracks";

/**
 * AI rivals: pure-pursuit steering towards the racing line (with a personal lane bias and
 * avoidance of bananas and karts), a speed profile from the line's curvature, drifts through
 * long corners for mini-turbos, item use and gentle rubber-banding around the player.
 */

export interface Hazard {
  s: number;
  d: number;
}

export interface AiWorld {
  track: Track;
  karts: Kart[];
  hazards: Hazard[];
  /** Per-sample corner speed limit (m/s). */
  vmax: Float32Array;
  /** Lap distance of the leading human (rubber band reference). */
  playerTotal: number | null;
  top: number;
  time: number;
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Corner speed limits from the racing line, with braking zones before tight corners. */
export function speedProfile(track: Track, top: number) {
  const n = track.samples.length;
  const v = new Float32Array(n);
  const w = 2.15 * 0.86;
  for (let i = 0; i < n; i++) {
    const c = Math.abs(track.lineCurv[i]);
    const r = c > 1e-4 ? 1 / c : 1e4;
    v[i] = Math.min(top * 1.5, (r * w) / (1 + (0.18 * r * w) / top));
  }
  // Brake in time: each sample may be at most what a 22 m/s² stop allows before the next.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = v[(i + 1) % n];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * 22 * 1));
    }
  }
  return v;
}

export class AiDriver {
  /** Preferred lateral offset from the racing line. */
  private bias: number;
  private phase = Math.random() * 10;
  private avoid = 0;
  private driftHold = false;
  private loose = 0;
  private itemTimer = 0;
  private tripleTimer = 0;
  private recover = 0;
  private recoverSteer = 0;
  private pinnedT = 0;
  /** Seconds left at the start before reacting to GO. */
  reaction = 0;
  rocket = false;
  readonly input: KartInput = { throttle: 0, brake: 0, steer: 0, drift: false };
  useItem = false;

  constructor(
    readonly kart: Kart,
    /** 0.9..1.02 — top speed share and how often it drifts. */
    readonly skill: number,
  ) {
    this.bias = (Math.random() - 0.5) * 2.2;
  }

  think(dt: number, world: AiWorld): KartInput {
    const k = this.kart;
    const { track } = world;
    const { samples } = track;
    const n = samples.length;
    const inp = this.input;
    this.useItem = false;

    if (this.recover > 0) {
      this.recover -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.drift = false;
      inp.steer = this.recoverSteer;
      return inp;
    }
    const pinned = Math.abs(k.pos.d) > Math.min(samples[k.pos.i].wallL, samples[k.pos.i].wallR) - 1.6 && Math.abs(k.speed) < 3 && !k.spinning;
    this.pinnedT = pinned ? this.pinnedT + dt : 0;
    if (this.pinnedT > 0.7) {
      this.pinnedT = 0;
      this.recover = 0.9;
      // Reverse with the wheels turned so the nose swings back towards the road.
      this.recoverSteer = Math.sign(k.pos.d) || 1;
      this.driftHold = false;
    }

    if (this.reaction > 0) {
      this.reaction -= dt;
      inp.throttle = 0;
      inp.steer = 0;
      inp.drift = false;
      return inp;
    }

    // --- Target point ---
    const speed = Math.max(0, k.speed);
    const look = 4.5 + speed * 0.3;
    const ti = (k.pos.i + Math.round(look)) % n;
    const p = samples[ti];
    const limit = p.elevated || p.kind === "jump" || p.kind === "jumpDown" || p.kind === "under" ? 1.4 : ROAD_HALF - 1.1;
    const wander = Math.sin(world.time * 0.23 + this.phase) * 0.7;

    // Avoid bananas and karts just ahead in our lane.
    let want = track.line[ti] + this.bias + wander;
    let avoid = 0;
    for (const h of world.hazards) {
      let ahead = h.s - k.pos.s;
      if (ahead < -track.length / 2) ahead += track.length;
      if (ahead > 2 && ahead < 32 && Math.abs(h.d - want) < 2.4) avoid = h.d > want ? -2.8 : 2.8;
    }
    for (const o of world.karts) {
      if (o === k || o.finished) continue;
      const ahead = o.total - k.total;
      if (ahead > 1.5 && ahead < 10 && Math.abs(o.pos.d - (want + avoid)) < 2.2 && speed > Math.max(0, o.speed) - 1) {
        avoid += o.pos.d > want ? -2.3 : 2.3;
        break;
      }
    }
    this.avoid += (avoid - this.avoid) * (1 - Math.exp(-4 * dt));
    want = Math.max(-limit, Math.min(limit, want + this.avoid));
    // Off the asphalt: head back towards the middle.
    if (Math.abs(k.pos.d) > ROAD_HALF) want = Math.max(-limit, Math.min(limit, want - Math.sign(k.pos.d) * 1.5));
    const tx = p.x + p.tz * want;
    const tz = p.z - p.tx * want;

    // --- Pure pursuit ---
    const dx = tx - k.x;
    const dz = tz - k.z;
    const dist = Math.hypot(dx, dz) || 1;
    const alpha = wrap(Math.atan2(dx, dz) - k.heading);
    const wantOmega = ((2 * Math.sin(alpha)) / dist) * Math.max(6, speed);
    const g = Math.min(1, speed / 7) * (1 - 0.18 * Math.min(1, speed / (world.top * k.stats.top)));
    const wmax = 2.15 * k.stats.turn * Math.max(0.15, g);

    // --- Drift through long corners ---
    let curvAhead = 0;
    for (let j = 6; j < 26; j += 2) curvAhead += track.lineCurv[(k.pos.i + j) % n];
    curvAhead /= 10;
    const curvNear = track.lineCurv[(k.pos.i + 5) % n];
    if (k.drift) {
      const d = k.drift.dir;
      const s = (wantOmega / (d * wmax) - DRIFT_BASE) / DRIFT_RANGE;
      inp.steer = d * Math.max(-1, Math.min(1, s));
      // Let go when the corner opens up (the drift can't turn gently enough) or flips.
      if (s < -1.1 || curvNear * d < 1 / 90) this.loose += dt;
      else this.loose = Math.max(0, this.loose - dt);
      inp.drift = this.loose < 0.18;
      if (!inp.drift) this.driftHold = false;
    } else {
      inp.steer = Math.max(-1, Math.min(1, wantOmega / wmax));
      const wantsDrift = Math.abs(curvAhead) > 1 / 34 && speed > 15 && k.grounded && this.skill > 0.93;
      if (wantsDrift && !this.driftHold) {
        this.driftHold = true;
        this.loose = 0;
        inp.steer = Math.sign(curvAhead);
      }
      inp.drift = this.driftHold;
      // Keep turning in during the hop so the drift catches.
      if (this.driftHold && k.hopping) inp.steer = Math.sign(curvAhead || inp.steer) * Math.max(0.6, Math.abs(inp.steer));
      if (this.driftHold && !k.drift && !k.hopping && k.grounded && Math.abs(curvAhead) < 1 / 50) this.driftHold = false;
    }

    // --- Speed ---
    let factor = this.skill;
    if (world.playerTotal !== null) {
      const gap = k.total - world.playerTotal;
      factor *= gap > 0 ? 1 - Math.min(0.09, gap / 650) : 1 + Math.min(0.11, -gap / 380);
    }
    const target = Math.min(world.top * k.stats.top * factor * 1.02, world.vmax[(k.pos.i + 3) % n] * (0.96 + this.skill * 0.04));
    if (k.speed > target + 1.5 && !k.boosting) {
      inp.throttle = 0;
      inp.brake = k.speed > target + 4 ? 1 : 0;
    } else {
      inp.brake = 0;
      inp.throttle = k.speed > target ? 0.0 : 1;
      if (k.speed > target * 0.985 && !k.boosting) inp.throttle = 0.4;
    }
    if (k.boosting) inp.throttle = 1;
    // Back off the wall if stuck.
    if (Math.abs(k.pos.d) > ROAD_HALF + 1.5 && speed < 4) inp.throttle = 1;

    // --- Items ---
    if (k.item && k.rollT <= 0) {
      this.itemTimer += dt;
      let straight = true;
      for (let j = 0; j < 40; j += 4) if (Math.abs(track.lineCurv[(k.pos.i + j) % n]) > 1 / 45) straight = false;
      if (k.item === "boost") this.useItem = (straight && this.itemTimer > 0.8) || this.itemTimer > 6;
      else if (k.item === "triple") {
        this.tripleTimer -= dt;
        if ((straight || this.itemTimer > 5) && this.tripleTimer <= 0) {
          this.useItem = true;
          this.tripleTimer = 1.3;
        }
      } else if (k.item === "banana") {
        const chaser = world.karts.some((o) => o !== k && k.total - o.total > 3 && k.total - o.total < 16);
        this.useItem = (chaser && this.itemTimer > 0.6) || this.itemTimer > 9;
      } else this.useItem = this.itemTimer > 0.5;
      if (this.useItem && k.item !== "triple") this.itemTimer = 0;
    } else if (!k.item) this.itemTimer = 0;

    return inp;
  }
}
