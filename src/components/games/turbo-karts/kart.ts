import * as THREE from "three";
import type { Driver } from "./manifest";
import { CURB_HALF, LAPS, locate, type Track, type TrackPos } from "./tracks";

/**
 * Arcade kart handling: a scalar forward speed along the heading plus a decaying side velocity
 * (knock-backs), yaw from steering, drifts that charge mini-turbos, hops, ramps and tricks.
 * Positions are found on the track's centre line every frame (lap distance s, lateral d).
 */

export type ItemKind = "boost" | "triple" | "shield" | "banana" | "coins";

export interface KartInput {
  throttle: number;
  brake: number;
  /** -1 (right) .. 1 (left). */
  steer: number;
  drift: boolean;
}

export const KART_R = 1.1;
const GRAVITY = 28;
const TURN = 2.15;
export const DRIFT_LEVELS = [1.0, 2.1, 3.4];
const MINI_TURBO = [0, 0.65, 1.05, 1.6];
/** Drift turn rate: base share of full lock, ± what steering in / out of the drift adds. */
export const DRIFT_BASE = 0.92;
export const DRIFT_RANGE = 0.68;
const BOOST_FACTOR = 1.36;
const COIN_BONUS = 0.008;
export const MAX_COINS = 10;

export interface KartEvents {
  wall(k: Kart, impact: number): void;
  land(k: Kart, hard: number): void;
  hop(k: Kart): void;
  driftLevel(k: Kart, level: number): void;
  miniTurbo(k: Kart, level: number): void;
  trick(k: Kart): void;
}

export interface KartEnv {
  /** Class top speed (m/s) before driver stats, coins and boosts. */
  top: number;
  events: KartEvents;
}

export interface Drift {
  dir: number;
  charge: number;
  level: number;
}

const ease = (t: number) => t * t * (3 - 2 * t);

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export class Kart {
  readonly root = new THREE.Group();
  /** Tilt, hop squash, drift yaw, spin-outs and tricks. */
  readonly body = new THREE.Group();
  readonly wheels: THREE.Object3D[] = [];
  character: THREE.Object3D | null = null;
  readonly stats: { top: number; accel: number; turn: number };

  x = 0;
  y = 0;
  z = 0;
  vy = 0;
  heading = 0;
  speed = 0;
  extX = 0;
  extZ = 0;
  grounded = true;
  hopping = false;
  airTime = 0;
  bigAir = false;
  trick = false;
  trickT = 0;
  readonly pos: TrackPos = { i: 0, s: 0, d: 0, y: 0 };
  /** Lap distance travelled since the start (negative on the grid). */
  total = 0;
  lapsDone = 0;
  lapStart = 0;
  lapTimes: number[] = [];
  finished = false;
  finishTime = 0;
  place = 1;

  steer = 0;
  throttle = 0;
  drift: Drift | null = null;
  private driftHeld = false;
  private pendingDrift = 0;
  boostT = 0;
  boostPower = BOOST_FACTOR;
  spinT = 0;
  spinAngle = 0;
  shieldT = 0;
  invulnT = 0;
  coins = 0;
  item: ItemKind | null = null;
  itemCount = 0;
  rollT = 0;
  offroad = false;
  wrongT = 0;
  omega = 0;
  /** Smoothed visual drift yaw. */
  private yawOffset = 0;
  private lean = 0;
  private pitch = 0;
  private squash = 0;
  /** Last rear-wheel positions for tyre marks. */
  readonly marks: { x: number; y: number; z: number; on: boolean }[] = [
    { x: 0, y: 0, z: 0, on: false },
    { x: 0, y: 0, z: 0, on: false },
  ];

  constructor(
    readonly index: number,
    readonly driver: Driver,
    public isPlayer: boolean,
    model: THREE.Object3D,
  ) {
    const k = (n: number) => 0.94 + n * 0.025;
    this.stats = { top: 0.97 + driver.speed * 0.012, accel: k(driver.accel) * 1.0, turn: 0.92 + driver.handling * 0.028 };
    this.root.add(this.body);
    this.body.add(model);
    this.body.rotation.order = "YXZ";
    for (const name of ["wheel-front-left", "wheel-front-right", "wheel-back-left", "wheel-back-right"]) {
      const w = model.getObjectByName(name);
      if (w) {
        w.rotation.order = "YXZ";
        this.wheels.push(w);
      }
    }
    this.character = model.getObjectByName("character") ?? null;
  }

  get lap() {
    return Math.max(1, Math.min(LAPS, this.lapsDone + 1));
  }

  get boosting() {
    return this.boostT > 0;
  }

  get spinning() {
    return this.spinT > 0;
  }

  /** Puts the kart at rest on a track position. */
  place0(track: Track, x: number, z: number, heading: number, hint: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.extX = this.extZ = 0;
    this.vy = 0;
    this.grounded = true;
    this.hopping = false;
    this.bigAir = false;
    this.trick = false;
    this.drift = null;
    this.driftHeld = false;
    this.boostT = this.spinT = this.shieldT = this.invulnT = 0;
    this.spinAngle = 0;
    this.coins = 0;
    this.item = null;
    this.itemCount = 0;
    this.rollT = 0;
    this.steer = 0;
    this.throttle = 0;
    this.wrongT = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapsDone = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.marks.forEach((m) => (m.on = false));
    locate(track, x, z, hint, this.pos, 60);
    this.y = this.pos.y;
    this.total = this.pos.s > track.length / 2 ? this.pos.s - track.length : this.pos.s;
    this.syncVisual(0);
  }

  /** Top speed right now (class × stats × coins, boosts and grass). */
  topSpeed(env: KartEnv) {
    let top = env.top * this.stats.top * (1 + COIN_BONUS * this.coins);
    if (this.boostT > 0) top *= this.boostPower;
    else if (this.offroad) top *= 0.5;
    if (this.drift) top *= 0.985;
    return top;
  }

  startBoost(seconds: number, power = BOOST_FACTOR) {
    this.boostT = Math.max(this.boostT, seconds);
    this.boostPower = Math.max(power, this.boostT > seconds ? this.boostPower : power);
  }

  spinOut() {
    if (this.invulnT > 0 || this.spinT > 0) return false;
    this.spinT = 1.15;
    this.invulnT = 2.2;
    this.drift = null;
    this.boostT = 0;
    this.speed *= 0.35;
    if (this.grounded) {
      this.vy = 5;
      this.grounded = false;
      this.hopping = true;
    }
    this.coins = Math.max(0, this.coins - 2);
    return true;
  }

  update(dt: number, input: KartInput, track: Track, env: KartEnv) {
    this.boostT = Math.max(0, this.boostT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    const spinning = this.spinT > 0;
    if (spinning) {
      this.spinT = Math.max(0, this.spinT - dt);
      this.spinAngle += dt * 15 * Math.max(0.25, this.spinT);
    } else this.spinAngle = 0;

    const sample = track.samples[this.pos.i];
    this.offroad = this.grounded && !sample.elevated && Math.abs(this.pos.d) > CURB_HALF + 0.4;
    const top = this.topSpeed(env);
    const baseTop = env.top * this.stats.top;
    const steerIn = spinning ? 0 : input.steer;
    this.steer += (steerIn - this.steer) * (1 - Math.exp(-11 * dt));
    this.throttle = input.throttle;

    // --- Longitudinal ---
    const s = this.speed;
    if (spinning) this.speed -= Math.sign(s) * Math.min(Math.abs(s), 26 * dt);
    else if (this.grounded || this.hopping) {
      if (input.throttle > 0 && input.brake <= 0) {
        if (s < top) {
          let a = (6 + 26 * Math.pow(Math.max(0, 1 - s / top), 1.4)) * this.stats.accel * input.throttle;
          if (this.boostT > 0) a = Math.max(a, 34);
          if (s < 0) a += 20;
          this.speed = Math.min(top, s + a * dt);
        } else this.speed = Math.max(top, s - (this.offroad ? 26 : 6) * dt);
      } else if (input.brake > 0) {
        if (s > 0.5) this.speed = s - 30 * dt * input.brake;
        else this.speed = Math.max(-9, s - 14 * dt);
      } else {
        const drag = 3.5 + 0.012 * s * s + (this.offroad ? 12 : 0);
        this.speed = s - Math.sign(s) * Math.min(Math.abs(s), drag * dt);
        if (s > top) this.speed = Math.max(top, s - 9 * dt);
      }
    }

    // --- Drift & hop ---
    const pressed = input.drift && !this.driftHeld;
    this.driftHeld = input.drift;
    if (pressed && !spinning) {
      if (this.grounded) {
        this.vy = 4.6;
        this.grounded = false;
        this.hopping = true;
        this.squash = 1;
        env.events.hop(this);
        this.pendingDrift = 0.3;
      } else if (this.bigAir && !this.trick) {
        this.trick = true;
        this.trickT = 0;
        env.events.trick(this);
      }
    }
    if (this.pendingDrift > 0) {
      this.pendingDrift -= dt;
      if (input.drift && !this.drift && Math.abs(this.steer) > 0.22 && this.speed > 10) {
        this.drift = { dir: Math.sign(input.steer || this.steer), charge: 0, level: 0 };
        this.pendingDrift = 0;
      }
    }
    if (this.drift) {
      const d = this.drift;
      if (!input.drift || spinning || this.speed < 10) {
        if (input.drift === false && d.level > 0 && !spinning) {
          this.startBoost(MINI_TURBO[d.level], d.level === 3 ? 1.42 : 1.36);
          env.events.miniTurbo(this, d.level);
        }
        this.drift = null;
      } else if (this.grounded) {
        d.charge += dt * (1 + 0.7 * Math.max(0, input.steer * d.dir));
        const level = d.charge >= DRIFT_LEVELS[2] ? 3 : d.charge >= DRIFT_LEVELS[1] ? 2 : d.charge >= DRIFT_LEVELS[0] ? 1 : 0;
        if (level > d.level) {
          d.level = level;
          env.events.driftLevel(this, level);
        }
      }
    }

    // --- Yaw ---
    const v = Math.abs(this.speed);
    const g = Math.min(1, v / 7) * (1 - 0.18 * Math.min(1, v / baseTop));
    const wmax = TURN * this.stats.turn;
    let omega: number;
    if (spinning) omega = 0;
    else if (this.drift) omega = this.drift.dir * wmax * g * (DRIFT_BASE + DRIFT_RANGE * this.steer * this.drift.dir);
    else omega = this.steer * wmax * g * Math.sign(this.speed || 1);
    if (!this.grounded && !this.hopping) omega *= 0.3;
    this.omega = omega;
    this.heading = wrap(this.heading + omega * dt);

    // --- Move ---
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const decay = Math.exp(-4.5 * dt);
    this.extX *= decay;
    this.extZ *= decay;
    const px = this.x;
    const pz = this.z;
    let vx = fx * this.speed + this.extX;
    let vz = fz * this.speed + this.extZ;
    this.x += vx * dt;
    this.z += vz * dt;

    const prevS = this.pos.s;
    const prevI = this.pos.i;
    locate(track, this.x, this.z, this.pos.i, this.pos);

    // Driving into the back of a ramp: a step up is a wall.
    if (this.grounded && this.pos.y > this.y + 0.9) {
      this.x = px;
      this.z = pz;
      this.speed = -this.speed * 0.3;
      this.extX = this.extZ = 0;
      locate(track, this.x, this.z, this.pos.i, this.pos);
      env.events.wall(this, 8);
    }

    // --- Walls ---
    const p = track.samples[this.pos.i];
    const wl = p.wallL - KART_R;
    const wr = p.wallR - KART_R;
    if (this.pos.d > wl || this.pos.d < -wr) {
      const side = this.pos.d > wl ? 1 : -1;
      const over = side > 0 ? this.pos.d - wl : -wr - this.pos.d;
      const nx = p.tz * side;
      const nz = -p.tx * side;
      this.x -= nx * over;
      this.z -= nz * over;
      this.pos.d -= side * over;
      const vn = vx * nx + vz * nz;
      if (vn > 0) {
        vx -= 1.4 * vn * nx;
        vz -= 1.4 * vn * nz;
        const fwd = vx * fx + vz * fz;
        this.speed = fwd * (1 - Math.min(0.45, vn / 28));
        this.extX = vx - fx * fwd;
        this.extZ = vz - fz * fwd;
        if (vn > 7 && this.drift) this.drift = null;
        env.events.wall(this, vn);
      }
      // Slide along the wall: the nose keeps turning to the wall's direction while touching it,
      // so the kart never stays pinned nose-first.
      const ahead = fx * p.tx + fz * p.tz >= 0 ? 1 : -1;
      const along = Math.atan2(p.tx * ahead, p.tz * ahead);
      const err = wrap(along - this.heading);
      this.heading = wrap(this.heading + err * Math.min(0.6, Math.max(vn, 0) * 0.04 + 3 * dt));
    }

    // --- Vertical ---
    const ground = this.pos.y;
    // Over a kicker's lip the kart keeps its climb as launch speed.
    const crest = track.samples[prevI].kind === "jump" && track.samples[this.pos.i].kind !== "jump" && this.vy > 2;
    if (this.grounded) {
      if (crest || ground < this.y - 0.3) {
        // Off the lip of a ramp: keep the climb rate as launch speed.
        this.grounded = false;
        this.hopping = false;
        this.bigAir = true;
        this.airTime = 0;
        this.trick = false;
      } else {
        this.vy = (ground - this.y) / Math.max(dt, 1e-3);
        this.y = ground;
      }
    }
    if (!this.grounded) {
      this.airTime += dt;
      this.vy -= (this.bigAir ? GRAVITY * 0.72 : GRAVITY) * dt;
      this.y += this.vy * dt;
      if (this.trick) this.trickT = Math.min(1, this.trickT + dt * 2.2);
      if (this.y <= ground) {
        const hard = Math.min(1, Math.max(0, -this.vy / 16));
        this.y = ground;
        this.grounded = true;
        const wasBig = this.bigAir;
        this.hopping = false;
        this.bigAir = false;
        this.vy = 0;
        this.squash = Math.max(this.squash, hard * 1.2 + (wasBig ? 0.3 : 0.15));
        if (wasBig || hard > 0.3) env.events.land(this, hard);
        if (this.trick) {
          this.trick = false;
          this.startBoost(0.9);
          env.events.miniTurbo(this, 2);
        }
      }
    }

    // --- Progress ---
    let ds = this.pos.s - prevS;
    if (ds > track.length / 2) ds -= track.length;
    if (ds < -track.length / 2) ds += track.length;
    this.total += ds;
    const tangentDot = fx * p.tx + fz * p.tz;
    if (tangentDot < -0.35 && Math.abs(this.speed) > 3 && this.speed > 0) this.wrongT += dt;
    else this.wrongT = Math.max(0, this.wrongT - dt * 2);
  }

  /** Visual pose: body tilt, drift yaw, wheels. */
  syncVisual(dt: number, track?: Track) {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.heading;
    const k = 1 - Math.exp(-10 * dt);
    const targetYaw = this.drift ? this.drift.dir * 0.42 : this.steer * 0.06;
    this.yawOffset += (targetYaw - this.yawOffset) * (dt ? k : 1);
    const targetLean = this.drift ? -this.drift.dir * 0.09 : -this.steer * 0.05 * Math.min(1, Math.abs(this.speed) / 15);
    this.lean += (targetLean - this.lean) * (dt ? k : 1);
    let slopePitch = 0;
    if (track && this.grounded) {
      const n = track.samples.length;
      const a = track.samples[(this.pos.i - 2 + n) % n];
      const b = track.samples[(this.pos.i + 2) % n];
      const dir = Math.sign(Math.sin(this.heading) * a.tx + Math.cos(this.heading) * a.tz) || 1;
      slopePitch = -Math.atan2(b.y - a.y, 4) * dir;
    } else if (!this.grounded && !this.hopping) {
      slopePitch = -Math.atan2(this.vy, Math.max(8, Math.abs(this.speed))) * 0.6;
    }
    const accelPitch = this.boostT > 0 ? -0.05 : 0;
    this.pitch += (slopePitch + accelPitch - this.pitch) * (dt ? 1 - Math.exp(-12 * dt) : 1);
    this.squash = Math.max(0, this.squash - dt * 4);
    const roll = this.trickT > 0 && this.trickT < 1 ? ease(this.trickT) * Math.PI * 2 : 0;
    this.body.rotation.set(this.pitch, this.yawOffset + this.spinAngle, this.lean + roll);
    if (this.trickT >= 1) this.trickT = 0;
    const sq = Math.sin(Math.min(1, this.squash) * Math.PI) * 0.08;
    this.body.scale.set(1 + sq, 1 - sq, 1 + sq);
    // Wheels: spin with speed, front wheels steer (counter-steer while drifting).
    const spin = (this.speed * dt) / 0.43;
    const steerAngle = this.drift ? -this.drift.dir * 0.25 + this.steer * 0.15 : this.steer * 0.42;
    this.wheels.forEach((w, i) => {
      w.rotation.x += spin;
      if (i < 2) w.rotation.y = steerAngle;
    });
    if (this.character) {
      this.character.rotation.z = -this.steer * 0.12 - (this.drift ? this.drift.dir * 0.1 : 0);
    }
  }
}
