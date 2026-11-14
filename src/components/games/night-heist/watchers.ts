import { angleDiff, turnTowards, type Grid, type Vec2 } from "./grid";
import { deg, type CameraDef, type DroneDef, type GuardDef, type GuardKind } from "./levels";

/**
 * Everything that watches for the thief — guards (and their dogs), cameras and drones — as pure logic:
 * no three.js here, so the same code runs in the game, in the solver and in the check script.
 * What they look like is in actors.ts.
 */

// --- Tuning ----------------------------------------------------------------------------------------------

export interface GuardSpec {
  /** How far and how wide it sees. `half: Math.PI` senses all around (a dog's nose). */
  range: number;
  half: number;
  /** Share of the range that still works in the dark (1 = a flashlight / a nose: darkness is no help). */
  dark: number;
  walk: number;
  run: number;
  /** Can be knocked out from behind. */
  ko: boolean;
  /** Walks over to a colleague on the floor and wakes him. */
  finds: boolean;
  label: string;
}

export const GUARD_SPECS: Record<GuardKind, GuardSpec> = {
  guard: { range: 6.2, half: 0.62, dark: 0.5, walk: 1.35, run: 3.65, ko: true, finds: true, label: "Night guard" },
  warden: { range: 6.2, half: 0.62, dark: 0.5, walk: 1.6, run: 3.85, ko: true, finds: true, label: "Warden" },
  sentry: { range: 8.4, half: 0.34, dark: 1, walk: 1.2, run: 3.6, ko: true, finds: true, label: "Flashlight sentry" },
  captain: { range: 6.8, half: 0.78, dark: 0.55, walk: 1.5, run: 3.95, ko: false, finds: true, label: "Captain" },
  dog: { range: 2.7, half: Math.PI, dark: 1, walk: 1.75, run: 4.7, ko: false, finds: false, label: "Guard dog" },
};

export const CAM_RANGE = 6.6;
export const CAM_HALF = 0.42;
/** Cameras keep this share of their range in the dark. */
export const CAM_DARK = 0.62;
export const DRONE_RADIUS = 1.75;
export const SUSPICIOUS = 0.34;
export const KO_TIME = 28;
const CATCH_DIST = 0.72;

// --- Shared context ----------------------------------------------------------------------------------------

export interface Thief {
  x: number;
  z: number;
  sneaking: boolean;
  running: boolean;
  moving: boolean;
}

export type Voice = "huh" | "hey" | "shrug" | "wake" | "lock" | "bark" | "growl" | "servo" | "drone";

export interface WatchCtx {
  grid: Grid;
  player: Thief;
  alarm: boolean;
  lastKnown: Vec2;
  guards: Guard[];
  time: number;
  /** The thief stands in smoke: eyes and lenses see nothing (noses still do). */
  cloaked: boolean;
  /** Multiplies how fast anyone notices the thief (a thief's perk). */
  notice: number;
  rand(): number;
  /** Someone saw enough: ring the alarm. */
  raiseAlarm(x: number, z: number, by: string): void;
  /** During the alarm: a guard or camera has eyes on the thief. */
  spotted(x: number, z: number): void;
  caught(by: Guard): void;
  voice(kind: Voice, pitch: number, x: number, z: number): void;
  /** A dog barks: everyone in earshot comes to look. */
  bark(dog: Guard): void;
  /** A guard reached a thrown coin. */
  pickCoin(x: number, z: number): void;
}

// --- Guards --------------------------------------------------------------------------------------------------

export type GuardState = "wait" | "patrol" | "suspicious" | "investigate" | "search" | "return" | "hunt" | "ko" | "wake";

interface Point {
  x: number;
  z: number;
  wait: number;
  face: number | null;
}

export class Guard {
  x: number;
  z: number;
  yaw: number;
  state: GuardState = "wait";
  t = 0;
  awareness = 0;
  sees = false;
  koT = 0;
  /** How long a knockout lasts for this guard (set when he goes down). */
  koTotal = KO_TIME;
  readonly kind: GuardKind;
  readonly spec: GuardSpec;
  readonly route: Point[];
  readonly pitch: number;
  private wp = 0;
  private path: Vec2[] = [];
  private pi = 0;
  private stim: Vec2 = { x: 0, z: 0 };
  private lookBase = 0;
  private repathT = 0;
  private unseenT = 0;
  private wanderT = 0;
  private readonly walkSpeed: number;
  private readonly runSpeed: number;
  /** A knocked-out colleague this guard is walking over to. */
  private body: Guard | null = null;
  private coinSpot: Vec2 | null = null;

  constructor(
    readonly def: GuardDef,
    readonly index: number,
    grid: Grid,
  ) {
    this.kind = def.kind ?? "guard";
    this.spec = GUARD_SPECS[this.kind];
    this.route = def.route.map(([x, z, wait = 0, face]) => ({ x, z, wait: def.route.length === 1 ? Infinity : wait, face: face === undefined ? null : deg(face) }));
    this.x = this.route[0].x;
    this.z = this.route[0].z;
    const first = this.route[0];
    const next = this.route[1] ?? first;
    this.yaw = first.face ?? (next !== first ? Math.atan2(next.x - first.x, next.z - first.z) : 0);
    this.lookBase = this.yaw;
    this.walkSpeed = def.speed ?? this.spec.walk;
    this.runSpeed = this.spec.run;
    this.pitch = this.kind === "dog" ? 1.6 : this.kind === "warden" ? 1.25 : this.kind === "captain" ? 0.75 : 0.9 + (index % 3) * 0.08;
    if (first.wait > 0) this.enter("wait");
    else this.advance(grid);
  }

  get alive() {
    return this.state !== "ko" && this.state !== "wake";
  }

  get alert() {
    return this.state === "hunt";
  }

  get curious() {
    return this.state === "suspicious" || this.state === "investigate" || this.state === "search";
  }

  private enter(state: GuardState) {
    this.state = state;
    this.t = 0;
    if (state === "wait" || state === "search") this.lookBase = this.yaw;
  }

  private goTo(x: number, z: number, grid: Grid) {
    this.path = grid.path(this.x, this.z, x, z, { radius: 0.28 }) ?? [];
    this.pi = 0;
  }

  private advance(grid: Grid) {
    if (this.route.length > 1) this.wp = (this.wp + 1) % this.route.length;
    this.enter("patrol");
    const p = this.route[this.wp];
    this.goTo(p.x, p.z, grid);
  }

  /** Walk along the current path. Returns true on arrival. */
  private follow(dt: number, speed: number, turn: number) {
    while (this.pi < this.path.length) {
      const p = this.path[this.pi];
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.04) {
        this.pi++;
        continue;
      }
      const want = Math.atan2(dx, dz);
      this.yaw = turnTowards(this.yaw, want, turn, dt);
      // Slow down while turning sharply so guards don't moonwalk around corners.
      const align = Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(angleDiff(this.yaw, want)))));
      const step = Math.min(d, speed * align * dt);
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
      return false;
    }
    return true;
  }

  /** How well the guard sees the thief right now: -1 not at all, 0..1 closeness. */
  private perceive(ctx: WatchCtx) {
    const p = ctx.player;
    const spec = this.spec;
    const nose = spec.half >= Math.PI;
    if (ctx.cloaked && !nose) return -1;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > spec.range) return -1;
    const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
    if (ang > spec.half) {
      // Bumping into a guard (or brushing past him without sneaking) gives you away.
      if (d < (p.sneaking ? 0.6 : 0.95) && ctx.grid.los(this.x, this.z, p.x, p.z)) return 0.8;
      return -1;
    }
    const light = ctx.alarm ? 1 : ctx.grid.lightAt(p.x, p.z);
    const reach = spec.range * (spec.dark + (1 - spec.dark) * light);
    if (d > reach) return -1;
    if (!ctx.grid.los(this.x, this.z, p.x, p.z)) return -1;
    return 1 - d / reach;
  }

  private sees2(ctx: WatchCtx, x: number, z: number, range: number) {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) > this.spec.half) return false;
    return ctx.grid.los(this.x, this.z, x, z);
  }

  /** Something to check out (a noise, a glimpse, a colleague on the floor). */
  notice(x: number, z: number, ctx: WatchCtx, { level = SUSPICIOUS + 0.02, coin = false } = {}) {
    if (!this.alive) return;
    if (this.state === "hunt") {
      // During the alarm, noises pull hunters over.
      this.stim = { x, z };
      this.goTo(x, z, ctx.grid);
      this.wanderT = 0;
      return;
    }
    const wasCalm = !this.curious;
    this.stim = { x, z };
    this.coinSpot = coin ? { x, z } : this.coinSpot;
    this.awareness = Math.max(this.awareness, level);
    this.enter("suspicious");
    this.unseenT = 0;
    if (wasCalm) ctx.voice(this.kind === "dog" ? "growl" : "huh", this.pitch, this.x, this.z);
  }

  /** The alarm rang: hunt the thief. */
  hunt(ctx: WatchCtx) {
    if (!this.alive) return;
    this.enter("hunt");
    this.awareness = 1;
    this.goTo(ctx.lastKnown.x, ctx.lastKnown.z, ctx.grid);
    this.wanderT = 0;
  }

  /** The alarm is over: back to the rounds, still a little jumpy. */
  standDown(ctx: WatchCtx) {
    if (!this.alive) return;
    this.awareness = 0.25;
    this.returnToRoute(ctx);
  }

  private returnToRoute(ctx: WatchCtx) {
    this.enter("return");
    const p = this.route[this.wp];
    this.goTo(p.x, p.z, ctx.grid);
  }

  knockOut(seconds = KO_TIME) {
    this.enter("ko");
    this.koT = this.koTotal = seconds;
    this.awareness = 0;
    this.body = null;
  }

  /** Woken up (by time or by a colleague). */
  wake(ctx: WatchCtx) {
    if (this.state !== "ko") return;
    this.enter("wake");
    ctx.voice("wake", this.pitch, this.x, this.z);
  }

  update(dt: number, ctx: WatchCtx) {
    const grid = ctx.grid;
    this.t += dt;
    if (this.state === "ko") {
      this.koT -= dt;
      if (this.koT <= 0) this.wake(ctx);
      this.sees = false;
      return;
    }
    if (this.state === "wake") {
      this.sees = false;
      if (this.t > 1.2) {
        this.awareness = 0.5;
        this.stim = { x: this.x, z: this.z };
        this.enter("search");
      }
      return;
    }

    // --- Perception.
    const s = this.perceive(ctx);
    this.sees = s >= 0;
    const p = ctx.player;
    if (this.sees) {
      let rate = (0.75 + 2.3 * s) * (p.running ? 1.35 : 1) * (p.sneaking ? 0.85 : 1) * ctx.notice;
      if (ctx.alarm) rate *= 2.5;
      this.awareness = Math.min(1, this.awareness + rate * dt);
      this.stim = { x: p.x, z: p.z };
      this.unseenT = 0;
      if (ctx.alarm) {
        ctx.spotted(p.x, p.z);
        if (this.state !== "hunt") this.hunt(ctx);
      } else if (this.awareness >= 1) {
        ctx.voice(this.kind === "dog" ? "bark" : "hey", this.pitch, this.x, this.z);
        ctx.raiseAlarm(p.x, p.z, this.kind === "dog" ? "dog" : "guard");
      } else if (this.awareness >= SUSPICIOUS && this.state !== "suspicious") {
        const calm = !this.curious;
        this.enter("suspicious");
        if (calm) {
          if (this.kind === "dog") ctx.bark(this);
          else ctx.voice("huh", this.pitch, this.x, this.z);
        }
      }
    } else {
      this.unseenT += dt;
      const calm = this.state === "patrol" || this.state === "wait" || this.state === "return";
      if (this.state !== "hunt") this.awareness = Math.max(0, this.awareness - (calm ? 0.3 : 0.07) * dt);
    }

    // A colleague on the floor?
    if (this.spec.finds && !ctx.alarm && !this.body && (this.state === "patrol" || this.state === "wait" || this.state === "return" || this.state === "search")) {
      for (const g of ctx.guards) {
        if (g === this || g.state !== "ko") continue;
        if (this.sees2(ctx, g.x, g.z, this.spec.range * 0.85)) {
          this.body = g;
          this.notice(g.x, g.z, ctx, { level: 0.6 });
          break;
        }
      }
    }

    // --- Behaviour.
    switch (this.state) {
      case "wait": {
        const pt = this.route[this.wp];
        if (pt.face !== null && this.t < 0.6) this.lookBase = turnTowards(this.lookBase, pt.face, 4, dt);
        const period = pt.wait === Infinity ? 7 : Math.max(2, pt.wait);
        const k = (this.t % period) / period;
        this.yaw = turnTowards(this.yaw, this.lookBase + Math.sin(k * Math.PI * 2) * 0.85, 3, dt);
        if (this.t >= pt.wait) this.advance(grid);
        break;
      }
      case "patrol": {
        if (this.follow(dt, this.walkSpeed, 5)) {
          const pt = this.route[this.wp];
          if (pt.wait > 0) this.enter("wait");
          else this.advance(grid);
        }
        break;
      }
      case "suspicious": {
        // Stop, turn to the disturbance, think about it.
        this.yaw = turnTowards(this.yaw, Math.atan2(this.stim.x - this.x, this.stim.z - this.z), 4.2, dt);
        if (this.unseenT > 1.0 && this.t > 0.8) {
          if (Math.hypot(this.stim.x - this.x, this.stim.z - this.z) > 0.9) {
            this.enter("investigate");
            this.goTo(this.stim.x, this.stim.z, grid);
          } else this.enter("search");
        }
        break;
      }
      case "investigate": {
        const target = this.body ?? this.stim;
        const near = Math.hypot(target.x - this.x, target.z - this.z) < (this.body ? 1.15 : 0.6);
        if (near || this.follow(dt, Math.max(1.95, this.walkSpeed * 1.25), 6)) {
          if (this.body) {
            this.body.wake(ctx);
            this.body = null;
          }
          if (this.coinSpot && Math.hypot(this.coinSpot.x - this.x, this.coinSpot.z - this.z) < 1.4) ctx.pickCoin(this.coinSpot.x, this.coinSpot.z);
          this.coinSpot = null;
          this.enter("search");
        }
        break;
      }
      case "search": {
        this.yaw = this.lookBase + Math.sin((this.t / 3.6) * Math.PI * 2) * 1.5;
        if (this.t > 3.6) {
          if (this.awareness > SUSPICIOUS + 0.1) this.t = 0;
          else {
            if (this.kind !== "dog") ctx.voice("shrug", this.pitch, this.x, this.z);
            this.returnToRoute(ctx);
          }
        }
        break;
      }
      case "return": {
        if (this.follow(dt, this.walkSpeed, 5)) {
          if (this.route[this.wp].wait > 0) this.enter("wait");
          else this.advance(grid);
        }
        break;
      }
      case "hunt": {
        this.repathT -= dt;
        if (this.sees) {
          if (this.repathT <= 0) {
            this.repathT = 0.3;
            this.goTo(p.x, p.z, grid);
          }
          this.follow(dt, this.runSpeed, 9);
          if (Math.hypot(p.x - this.x, p.z - this.z) < CATCH_DIST) ctx.caught(this);
        } else if (this.pi < this.path.length) {
          this.follow(dt, this.runSpeed * 0.85, 8);
        } else {
          // Search around the last known spot.
          this.wanderT -= dt;
          this.yaw += Math.sin(ctx.time * 2.2 + this.index) * dt * 2.2;
          if (this.wanderT <= 0) {
            this.wanderT = 1.6 + ctx.rand() * 1.6;
            const a = ctx.rand() * Math.PI * 2;
            const r = 1.5 + ctx.rand() * 3;
            const c = grid.nearestWalkable(ctx.lastKnown.x + Math.cos(a) * r, ctx.lastKnown.z + Math.sin(a) * r);
            if (c) this.goTo(c.x, c.z, grid);
          }
        }
        // Brushing past the thief while hunting still catches him (not through smoke).
        if (!ctx.cloaked && Math.hypot(p.x - this.x, p.z - this.z) < CATCH_DIST * 0.8) ctx.caught(this);
        break;
      }
    }
  }
}

// --- Security cameras --------------------------------------------------------------------------------------

export class SecurityCamera {
  /** The floor-side origin of the view. */
  readonly x: number;
  readonly z: number;
  readonly base: number;
  readonly sweep: number;
  readonly range: number;
  yaw: number;
  awareness = 0;
  tracking = false;
  /** Switched off at the console for the rest of the heist. */
  disabled = false;
  /** Seconds left blinded by a jammer. */
  jamT = 0;
  sees = false;
  private lastTarget = 0;
  private servoT = 0;

  constructor(readonly def: CameraDef) {
    this.base = deg(def.dir);
    this.sweep = deg(def.sweep) / 2;
    this.range = def.range ?? CAM_RANGE;
    this.x = def.x + Math.sin(this.base) * 0.56;
    this.z = def.z + Math.cos(this.base) * 0.56;
    this.yaw = this.base;
  }

  get off() {
    return this.disabled || this.jamT > 0;
  }

  private perceive(ctx: WatchCtx) {
    if (ctx.cloaked) return -1;
    const p = ctx.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > this.range) return -1;
    if (Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) > CAM_HALF) return -1;
    const light = ctx.alarm ? 1 : ctx.grid.lightAt(p.x, p.z);
    const reach = this.range * (CAM_DARK + (1 - CAM_DARK) * light);
    if (d > reach) return -1;
    if (!ctx.grid.los(this.x, this.z, p.x, p.z)) return -1;
    return 1 - d / reach;
  }

  update(dt: number, ctx: WatchCtx) {
    if (this.jamT > 0) this.jamT = Math.max(0, this.jamT - dt);
    if (this.off) {
      this.sees = false;
      this.awareness = 0;
      this.tracking = false;
      return;
    }
    const s = this.perceive(ctx);
    this.sees = s >= 0;
    const p = ctx.player;
    if (this.sees) {
      this.awareness = Math.min(1, this.awareness + dt * (ctx.alarm ? 3 : (1.0 + 1.6 * s) * ctx.notice));
      if (!this.tracking) ctx.voice("lock", 1, this.x, this.z);
      this.tracking = true;
      const want = Math.atan2(p.x - this.x, p.z - this.z);
      const lim = this.sweep + 0.35;
      const off = Math.max(-lim, Math.min(lim, angleDiff(this.base, want)));
      this.yaw = turnTowards(this.yaw, this.base + off, 1.6, dt);
      if (ctx.alarm) ctx.spotted(p.x, p.z);
      else if (this.awareness >= 1) ctx.raiseAlarm(p.x, p.z, "camera");
    } else {
      this.awareness = Math.max(0, this.awareness - dt * 0.32);
      if (this.tracking && this.awareness < 0.05) this.tracking = false;
      if (!this.tracking) {
        const period = this.def.period;
        const k = ((ctx.time / period + (this.def.phase ?? 0)) % 1) * Math.PI * 2;
        const target = this.base + Math.sin(k) * this.sweep;
        const dir = Math.sign(Math.cos(k));
        if (dir !== this.lastTarget) {
          this.lastTarget = dir;
          this.servoT = 0.2;
        }
        this.yaw = turnTowards(this.yaw, target, 1.4, dt);
      }
    }
    if (this.servoT > 0) {
      this.servoT -= dt;
      if (this.servoT <= 0 && Math.hypot(p.x - this.x, p.z - this.z) < 9) ctx.voice("servo", 1, this.x, this.z);
    }
  }
}

// --- Drones -------------------------------------------------------------------------------------------------

/** A patrol drone: it flies straight over walls and furniture and scans the floor right under it. */
export class Drone {
  x: number;
  z: number;
  yaw = 0;
  awareness = 0;
  sees = false;
  jamT = 0;
  readonly radius = DRONE_RADIUS;
  private readonly route: { x: number; z: number; wait: number }[];
  private readonly speed: number;
  private wp = 0;
  private waitT = 0;
  private humT = 0;

  constructor(readonly def: DroneDef) {
    this.route = def.route.map(([x, z, wait = 0]) => ({ x, z, wait }));
    this.speed = def.speed ?? 1.35;
    this.x = this.route[0].x;
    this.z = this.route[0].z;
    this.waitT = this.route[0].wait;
    this.wp = this.route.length > 1 ? 1 : 0;
    const n = this.route[this.wp];
    this.yaw = Math.atan2(n.x - this.x, n.z - this.z);
  }

  get off() {
    return this.jamT > 0;
  }

  update(dt: number, ctx: WatchCtx) {
    const p = ctx.player;
    if (this.jamT > 0) {
      this.jamT = Math.max(0, this.jamT - dt);
      this.sees = false;
      this.awareness = Math.max(0, this.awareness - dt);
      return;
    }
    // Fly the round.
    if (this.waitT > 0) this.waitT -= dt;
    else {
      const t = this.route[this.wp];
      const dx = t.x - this.x;
      const dz = t.z - this.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        this.x = t.x;
        this.z = t.z;
        this.waitT = t.wait;
        this.wp = (this.wp + 1) % this.route.length;
      } else {
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
        this.yaw = turnTowards(this.yaw, Math.atan2(dx, dz), 3, dt);
      }
    }
    // Scan.
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    this.sees = !ctx.cloaked && d < this.radius;
    if (this.sees) {
      const s = 1 - d / this.radius;
      this.awareness = Math.min(1, this.awareness + dt * (ctx.alarm ? 3 : (1.2 + 1.8 * s) * ctx.notice));
      if (ctx.alarm) ctx.spotted(p.x, p.z);
      else if (this.awareness >= 1) ctx.raiseAlarm(p.x, p.z, "drone");
    } else this.awareness = Math.max(0, this.awareness - dt * 0.4);
    this.humT -= dt;
    if (this.humT <= 0 && d < 7) {
      this.humT = 1.1;
      ctx.voice("drone", 1 - Math.min(1, d / 7), this.x, this.z);
    }
  }
}
