import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Proto } from "../shared/assets";
import { Badge, Cone } from "./fx";
import { angleDiff, turnTowards, type Grid, type Vec2 } from "./grid";
import { deg, type CameraDef, type GuardDef } from "./levels";

// --- Tuning ----------------------------------------------------------------------------------------------

export const GUARD_RANGE = 6.2;
export const GUARD_HALF = 0.62;
export const CAM_RANGE = 6.6;
export const CAM_HALF = 0.42;
/** Darkness shrinks sight to this share of the range (the bright core of the cone). */
export const DARK_SHARE = 0.5;
export const SUSPICIOUS = 0.34;
const CATCH_DIST = 0.72;

// --- Animation -------------------------------------------------------------------------------------------

/** Cross-faded clips plus a crouch pose that can be blended over anything (sneaking). */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private crouchAction: THREE.AnimationAction | null = null;
  current: THREE.AnimationAction | null = null;
  name = "";
  crouch = 0;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.clips.set(c.name, c);
    const crouch = this.action("crouch");
    if (crouch) {
      crouch.setLoop(THREE.LoopRepeat, Infinity);
      crouch.play();
      crouch.weight = 0;
      this.crouchAction = crouch;
    }
  }

  private action(name: string) {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      this.actions.set(name, a);
    }
    return a;
  }

  play(name: string, { once = false, fade = 0.18, speed = 1, restart = false } = {}) {
    const next = this.action(name);
    if (!next) return;
    if (this.current === next && !restart) {
      next.timeScale = speed;
      return;
    }
    const prev = this.current;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (prev && prev !== next && fade > 0) next.crossFadeFrom(prev, fade, false);
    else if (prev && prev !== next) prev.stop();
    next.play();
    this.current = next;
    this.name = name;
  }

  set speed(s: number) {
    if (this.current) this.current.timeScale = s;
  }

  get finished() {
    const a = this.current;
    return !a || (a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 1e-3);
  }

  update(dt: number) {
    if (this.crouchAction) {
      this.crouchAction.weight = this.crouch;
      if (this.current) this.current.weight = 1 - this.crouch * 0.85;
    }
    this.mixer.update(dt);
  }

  stopAll() {
    this.mixer.stopAllAction();
    this.current = null;
    this.name = "";
    if (this.crouchAction) {
      this.crouchAction.play();
      this.crouchAction.weight = 0;
    }
  }
}

/** A posed, animated copy of a character model. */
export class CharView {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly anim: Animator;

  constructor(proto: Proto) {
    this.model = cloneSkinned(proto.object);
    this.root.add(this.model);
    this.anim = new Animator(this.model, proto.animations);
    this.anim.play("idle", { fade: 0 });
  }

  place(x: number, z: number, yaw: number) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
  }
}

// --- Shared context ----------------------------------------------------------------------------------------

export interface Thief {
  x: number;
  z: number;
  sneaking: boolean;
  running: boolean;
  moving: boolean;
}

export interface WatchCtx {
  grid: Grid;
  player: Thief;
  alarm: boolean;
  lastKnown: Vec2;
  guards: Guard[];
  time: number;
  rand(): number;
  /** Someone saw enough: ring the alarm. */
  raiseAlarm(x: number, z: number, by: string): void;
  /** During the alarm: a guard or camera has eyes on the thief. */
  spotted(x: number, z: number): void;
  caught(by: Guard): void;
  voice(kind: "huh" | "hey" | "shrug" | "wake" | "lock", pitch: number): void;
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
  readonly view: CharView;
  readonly cone = new Cone(34);
  readonly badge: Badge;
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
  private stepT = 0;
  private readonly walkSpeed: number;
  private readonly runSpeed: number;
  /** A knocked-out colleague this guard is walking over to. */
  private body: Guard | null = null;
  private coinSpot: Vec2 | null = null;

  constructor(
    readonly def: GuardDef,
    proto: Proto,
    atlas: THREE.Texture,
    readonly index: number,
    grid: Grid,
  ) {
    this.route = def.route.map(([x, z, wait = 0, face]) => ({ x, z, wait: def.route.length === 1 ? Infinity : wait, face: face === undefined ? null : deg(face) }));
    this.x = this.route[0].x;
    this.z = this.route[0].z;
    const first = this.route[0];
    const next = this.route[1] ?? first;
    this.yaw = first.face ?? (next !== first ? Math.atan2(next.x - first.x, next.z - first.z) : 0);
    this.lookBase = this.yaw;
    this.view = new CharView(proto);
    this.badge = new Badge(atlas, 0.56);
    const warden = def.kind === "warden";
    this.walkSpeed = def.speed ?? (warden ? 1.6 : 1.35);
    this.runSpeed = warden ? 3.85 : 3.65;
    this.pitch = warden ? 1.25 : 0.9 + (index % 3) * 0.08;
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
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > GUARD_RANGE) return -1;
    const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
    if (ang > GUARD_HALF) {
      // Bumping into a guard (or brushing past him without sneaking) gives you away.
      if (d < (p.sneaking ? 0.6 : 0.95) && ctx.grid.los(this.x, this.z, p.x, p.z)) return 0.8;
      return -1;
    }
    const light = ctx.alarm ? 1 : ctx.grid.lightAt(p.x, p.z);
    const reach = GUARD_RANGE * (DARK_SHARE + (1 - DARK_SHARE) * light);
    if (d > reach) return -1;
    if (!ctx.grid.los(this.x, this.z, p.x, p.z)) return -1;
    return 1 - d / reach;
  }

  private sees2(ctx: WatchCtx, x: number, z: number, range: number) {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) > GUARD_HALF) return false;
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
    if (wasCalm) ctx.voice("huh", this.pitch);
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

  knockOut() {
    this.enter("ko");
    this.koT = 28;
    this.awareness = 0;
    this.body = null;
    this.view.anim.play("die", { once: true, fade: 0.08, speed: 0.8 });
  }

  /** Woken up (by time or by a colleague). */
  wake(ctx: WatchCtx) {
    if (this.state !== "ko") return;
    this.enter("wake");
    this.view.anim.play("idle", { fade: 0.6 });
    ctx.voice("wake", this.pitch);
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
      let rate = (0.75 + 2.3 * s) * (p.running ? 1.35 : 1) * (p.sneaking ? 0.85 : 1);
      if (ctx.alarm) rate *= 2.5;
      this.awareness = Math.min(1, this.awareness + rate * dt);
      this.stim = { x: p.x, z: p.z };
      this.unseenT = 0;
      if (ctx.alarm) {
        ctx.spotted(p.x, p.z);
        if (this.state !== "hunt") this.hunt(ctx);
      } else if (this.awareness >= 1) {
        ctx.voice("hey", this.pitch);
        ctx.raiseAlarm(p.x, p.z, "guard");
      } else if (this.awareness >= SUSPICIOUS && this.state !== "suspicious") {
        const calm = !this.curious;
        this.enter("suspicious");
        if (calm) ctx.voice("huh", this.pitch);
      }
    } else {
      this.unseenT += dt;
      const calm = this.state === "patrol" || this.state === "wait" || this.state === "return";
      if (this.state !== "hunt") this.awareness = Math.max(0, this.awareness - (calm ? 0.3 : 0.07) * dt);
    }

    // A colleague on the floor?
    if (!ctx.alarm && !this.body && (this.state === "patrol" || this.state === "wait" || this.state === "return" || this.state === "search")) {
      for (const g of ctx.guards) {
        if (g === this || g.state !== "ko") continue;
        if (this.sees2(ctx, g.x, g.z, GUARD_RANGE * 0.85)) {
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
        if (near || this.follow(dt, 1.95, 6)) {
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
            ctx.voice("shrug", this.pitch);
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
        // Brushing past the thief while hunting still catches him.
        if (Math.hypot(p.x - this.x, p.z - this.z) < CATCH_DIST * 0.8) ctx.caught(this);
        break;
      }
    }
  }

  /** Animation, model, cone and badge. */
  sync(dt: number, ctx: WatchCtx, camera: THREE.Camera, moved: number) {
    const v = this.view;
    v.place(this.x, this.z, this.yaw);
    if (this.state !== "ko" && this.state !== "wake") {
      const speed = moved / Math.max(1e-4, dt);
      if (speed > 2.6) v.anim.play("sprint", { speed: speed / 4 });
      else if (speed > 0.15) v.anim.play("walk", { speed: Math.max(0.6, speed / 1.9) });
      else v.anim.play("idle");
      if (speed > 0.15) {
        this.stepT -= moved;
        if (this.stepT <= 0) this.stepT = 0.7;
      }
    }
    v.anim.update(dt);

    const cone = this.cone;
    cone.mesh.visible = this.alive;
    if (this.alive) {
      cone.update(ctx.grid, this.x, this.z, this.yaw, GUARD_HALF, GUARD_RANGE);
      if (this.state === "hunt") cone.style("#ff3b3b", 0.34, ctx.alarm ? 1 : DARK_SHARE);
      else if (this.curious || this.awareness > 0.05) cone.style(this.awareness > 0.6 ? "#ff6a3d" : "#ffad42", 0.3, DARK_SHARE);
      else cone.style("#ffe7a3", 0.24, DARK_SHARE);
    }

    const b = this.badge;
    b.mesh.position.set(this.x, 1.55, this.z);
    b.mesh.quaternion.copy(camera.quaternion);
    if (this.state === "ko") {
      b.mesh.visible = true;
      b.set(2, this.koT / 28, "#a5b4fc", 0.85);
    } else if (this.state === "hunt") {
      b.mesh.visible = true;
      b.set(1, 1, "#ff3b3b");
      b.mesh.position.y = 1.55 + Math.abs(Math.sin(ctx.time * 9)) * 0.08;
    } else if (this.awareness > 0.04 || this.curious) {
      b.mesh.visible = true;
      b.set(0, this.awareness, this.awareness > 0.6 ? "#ff6a3d" : "#ffc14d");
    } else b.mesh.visible = false;
  }

  dispose() {
    this.cone.dispose();
    this.badge.dispose();
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
  disabled = false;
  sees = false;
  readonly cone = new Cone(26);
  readonly badge: Badge;
  private lastTarget = 0;
  private servoT = 0;

  constructor(
    readonly def: CameraDef,
    atlas: THREE.Texture,
  ) {
    this.base = deg(def.dir);
    this.sweep = deg(def.sweep) / 2;
    this.range = def.range ?? CAM_RANGE;
    this.x = def.x + Math.sin(this.base) * 0.56;
    this.z = def.z + Math.cos(this.base) * 0.56;
    this.yaw = this.base;
    this.badge = new Badge(atlas, 0.48);
  }

  private perceive(ctx: WatchCtx) {
    const p = ctx.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > this.range) return -1;
    if (Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) > CAM_HALF) return -1;
    const light = ctx.alarm ? 1 : ctx.grid.lightAt(p.x, p.z);
    const reach = this.range * (0.62 + 0.38 * light);
    if (d > reach) return -1;
    if (!ctx.grid.los(this.x, this.z, p.x, p.z)) return -1;
    return 1 - d / reach;
  }

  update(dt: number, ctx: WatchCtx, sfx: { servo(): void }) {
    if (this.disabled) {
      this.sees = false;
      this.awareness = 0;
      return;
    }
    const s = this.perceive(ctx);
    this.sees = s >= 0;
    const p = ctx.player;
    if (this.sees) {
      this.awareness = Math.min(1, this.awareness + dt * (ctx.alarm ? 3 : 1.0 + 1.6 * s));
      if (!this.tracking) ctx.voice("lock", 1);
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
      if (this.servoT <= 0 && Math.hypot(p.x - this.x, p.z - this.z) < 9) sfx.servo();
    }
  }

  sync(ctx: WatchCtx, camera: THREE.Camera) {
    const cone = this.cone;
    cone.mesh.visible = !this.disabled;
    if (!this.disabled) {
      cone.update(ctx.grid, this.x, this.z, this.yaw, CAM_HALF, this.range);
      if (this.awareness > 0.02 || ctx.alarm) cone.style(this.awareness > 0.6 || ctx.alarm ? "#ff4d4d" : "#ffad42", 0.3, 0.62);
      else cone.style("#7cc6ff", 0.22, 0.62);
    }
    const b = this.badge;
    b.mesh.visible = !this.disabled && this.awareness > 0.03;
    if (b.mesh.visible) {
      b.mesh.position.set(this.def.x, 1.95, this.def.z + 0.2);
      b.mesh.quaternion.copy(camera.quaternion);
      b.set(this.awareness >= 1 ? 1 : 0, this.awareness, this.awareness > 0.6 ? "#ff4d4d" : "#ffc14d");
    }
  }

  dispose() {
    this.cone.dispose();
    this.badge.dispose();
  }
}
