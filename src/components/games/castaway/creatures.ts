import * as THREE from "three";
import { Animator, angleDiff, turnTowards, yawTo } from "./anim";
import { CREATURES, type CreatureDef, type CreatureKind } from "./data";
import { Bar } from "./fx";
import type { Collider } from "./world";

/**
 * Night creatures: reef crabs, drowned sailors, bloated brutes and sea ghosts. They crawl out of
 * the surf, hunt the castaway, keep out of firelight (except brutes, who stamp fires out), break
 * walls that are in the way, telegraph every attack, and slink back into the sea at dawn.
 */

export interface Blocker {
  /** Circle (r) or wall segment (half length `half` along `rot`, thickness `thick`). */
  x: number;
  z: number;
  r: number;
  wall: boolean;
  rot: number;
  half: number;
  solid: boolean;
  hp: number;
  /** Burning fire's fear radius (0 = not a fire / out). */
  light: number;
  kind: string;
}

export interface CreatureCtx {
  height(x: number, z: number): number;
  /** Ground the creature can stand on (shallow water ok). */
  walkable(x: number, z: number): boolean;
  player: { x: number; z: number; alive: boolean; light: number; lightKind: "torch" | "lantern" | null };
  blockers(x: number, z: number, r: number): Blocker[];
  solids(x: number, z: number, r: number, out: Collider[]): Collider[];
  hitPlayer(c: Creature, dmg: number): void;
  hitBlocker(c: Creature, b: Blocker, dmg: number): void;
  telegraph(pos: { x: number; y: number; z: number }, r: number, dur: number): unknown;
  cancelTelegraph(h: unknown): void;
  sound(kind: "growl" | "windup" | "emerge", c: Creature): void;
  splash(x: number, z: number): void;
  dawn: boolean;
}

type State = "emerge" | "seek" | "windup" | "recover" | "flee" | "dying" | "gone";

export interface CreatureAssets {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  scale: number;
}

const tmpSolids: Collider[] = [];

export class Creature {
  readonly root = new THREE.Group();
  readonly def: CreatureDef;
  readonly anim: Animator;
  readonly bar = new Bar("#ef4444", 0.9);
  private readonly mats: THREE.MeshLambertMaterial[] = [];
  private readonly model: THREE.Object3D;
  active = false;
  state: State = "gone";
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  hp = 1;
  kx = 0;
  kz = 0;
  t = 0;
  cool = 0;
  flash = 0;
  /** What it's attacking: the player, or a wall / fire in the way. */
  target: Blocker | null = null;
  private tele: unknown = null;
  private stuckT = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private detour = 0;
  private detourT = 0;
  private growlT = 2;
  private hover = 0;
  /** Fades ghosts / sinks the dead. */
  private fade = 1;

  constructor(
    readonly kind: CreatureKind,
    assets: CreatureAssets,
  ) {
    this.def = CREATURES[kind];
    this.model = assets.scene.clone(true);
    this.model.scale.setScalar(assets.scale);
    // Own materials so hits can flash this one alone.
    const cache = new Map<THREE.Material, THREE.MeshLambertMaterial>();
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshLambertMaterial;
      let m = cache.get(src);
      if (!m) {
        m = src.clone();
        if (kind === "ghost") {
          m.transparent = true;
          m.opacity = 0.82;
        }
        cache.set(src, m);
        this.mats.push(m);
      }
      mesh.material = m;
      mesh.castShadow = kind !== "ghost";
      mesh.frustumCulled = false;
    });
    this.root.add(this.model);
    this.root.visible = false;
    this.anim = new Animator(this.model, assets.clips);
  }

  get radius() {
    return this.def.radius;
  }

  spawn(x: number, z: number, hp: number, ctx: CreatureCtx) {
    this.active = true;
    this.state = "emerge";
    this.x = x;
    this.z = z;
    this.kx = this.kz = 0;
    this.hp = hp;
    this.t = 0;
    this.cool = 1;
    this.flash = 0;
    this.fade = 1;
    this.target = null;
    this.stuckT = 0;
    this.detourT = 0;
    this.growlT = 1 + Math.random() * 3;
    this.yaw = yawTo(-x, -z);
    this.y = ctx.height(x, z);
    this.root.visible = true;
    this.root.position.set(x, this.y, z);
    this.model.rotation.set(0, 0, 0);
    this.setOpacity(this.kind === "ghost" ? 0 : 1);
    this.anim.play(this.walkClip, { speed: 1 });
    ctx.sound("emerge", this);
    ctx.splash(x, z);
  }

  private get walkClip() {
    return this.kind === "crab" ? "walk" : this.kind === "ghost" ? "idle" : "walk";
  }

  private get runClip() {
    return this.kind === "crab" ? "run" : this.kind === "ghost" ? "idle" : this.kind === "brute" ? "walk" : "sprint";
  }

  private setOpacity(o: number) {
    for (const m of this.mats) {
      m.transparent = this.kind === "ghost" || o < 1;
      m.opacity = this.kind === "ghost" ? 0.8 * o : o;
    }
  }

  /** Damage from the castaway. Returns true if it died. */
  damage(dmg: number, dirX: number, dirZ: number, knock: number, ctx: CreatureCtx) {
    if (!this.active || this.state === "dying") return false;
    this.hp -= dmg;
    this.flash = 0.18;
    const k = knock / (this.kind === "brute" ? 2.2 : 1);
    this.kx += dirX * k;
    this.kz += dirZ * k;
    this.bar.set(this.hp / this.maxHp);
    // A hit interrupts a wind-up (not a brute's).
    if (this.state === "windup" && this.kind !== "brute") {
      ctx.cancelTelegraph(this.tele);
      this.tele = null;
      this.state = "recover";
      this.t = 0.45;
    }
    if (this.hp <= 0) {
      this.die(ctx);
      return true;
    }
    return false;
  }

  maxHp = 1;

  private die(ctx: CreatureCtx) {
    ctx.cancelTelegraph(this.tele);
    this.tele = null;
    this.state = "dying";
    this.t = 0;
    if (this.kind === "crab") this.anim.play("gesture-negative", { once: true, speed: 0.6 });
    else this.anim.play("die", { once: true, fade: 0.08 });
  }

  update(dt: number, ctx: CreatureCtx) {
    if (!this.active) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    for (const m of this.mats) m.emissive.setScalar(this.flash > 0 ? 0.8 * (this.flash / 0.18) : 0);
    this.anim.update(dt);

    if (this.state === "dying") {
      // Topple, sink and vanish.
      const k = Math.min(1, this.t / 0.5);
      if (this.kind === "crab") this.model.rotation.z = Math.PI * k;
      const sink = Math.max(0, this.t - 0.7) * 1.2;
      this.root.position.y = this.y - sink;
      if (this.kind === "ghost") this.setOpacity(Math.max(0, 1 - this.t * 1.5));
      if (this.t > 1.6) this.despawn();
      return;
    }

    const p = ctx.player;
    // Knockback.
    if (this.kx || this.kz) {
      this.move(this.kx * dt, this.kz * dt, ctx, true);
      const decay = Math.exp(-7 * dt);
      this.kx *= decay;
      this.kz *= decay;
      if (Math.abs(this.kx) + Math.abs(this.kz) < 0.05) this.kx = this.kz = 0;
    }

    if (this.kind === "ghost") {
      this.fade = Math.min(1, this.fade + dt);
      this.hover += dt;
    }

    if (ctx.dawn && this.state !== "flee") {
      ctx.cancelTelegraph(this.tele);
      this.tele = null;
      this.state = "flee";
      this.t = 0;
    }

    switch (this.state) {
      case "emerge": {
        if (this.kind === "ghost") this.setOpacity(Math.min(1, this.t / 1.2));
        this.steer(dt, p.x, p.z, ctx, 0.75);
        if (this.t > 1.2) this.state = "seek";
        break;
      }
      case "seek": {
        this.cool -= dt;
        this.growlT -= dt;
        if (this.growlT <= 0) {
          this.growlT = 3 + Math.random() * 5;
          ctx.sound("growl", this);
        }
        // Brutes go for a fire the castaway hides by.
        if (this.def.stomps && !this.target) {
          for (const b of ctx.blockers(this.x, this.z, 16)) {
            if (b.light > 0 && b.kind === "campfire" && Math.hypot(p.x - b.x, p.z - b.z) < b.light + 2) {
              this.target = b;
              break;
            }
          }
        }
        if (this.target && this.target.hp <= 0) this.target = null;
        const tx = this.target ? this.target.x : p.x;
        const tz = this.target ? this.target.z : p.z;
        const dist = Math.hypot(tx - this.x, tz - this.z) - (this.target ? (this.target.wall ? 0.2 : this.target.r) : 0);
        const reach = this.def.reach + (this.target ? 0.15 : 0);
        if (dist < reach && this.cool <= 0 && (this.target || p.alive)) {
          this.state = "windup";
          this.t = 0;
          this.yaw = yawTo(tx - this.x, tz - this.z);
          const fx = this.x + Math.sin(this.yaw) * reach * 0.6;
          const fz = this.z + Math.cos(this.yaw) * reach * 0.6;
          this.tele = ctx.telegraph({ x: fx, y: ctx.height(fx, fz), z: fz }, reach * 0.75, this.def.windup);
          ctx.sound("windup", this);
          if (this.kind === "crab") this.anim.play("eat", { speed: 0.8 / this.def.windup });
          else this.anim.play("attack-melee-right", { once: true, speed: 0.21 / this.def.windup, fade: 0.1 });
          break;
        }
        this.steer(dt, tx, tz, ctx, dist < 4 ? 0.85 : 1);
        break;
      }
      case "windup": {
        const tx = this.target ? this.target.x : p.x;
        const tz = this.target ? this.target.z : p.z;
        this.yaw = turnTowards(this.yaw, yawTo(tx - this.x, tz - this.z), 2.5, dt);
        if (this.t >= this.def.windup) {
          this.tele = null;
          this.strike(ctx);
          this.state = "recover";
          this.t = 0;
          if (this.kind !== "crab") this.anim.play("attack-melee-right", { once: true, speed: 1.2, fade: 0 });
        }
        break;
      }
      case "recover": {
        if (this.t > 0.45) {
          this.state = "seek";
          this.cool = this.def.cooldown * (0.8 + Math.random() * 0.4);
          this.anim.play(this.walkClip);
        }
        break;
      }
      case "flee": {
        // Back to the sea: straight away from the island's middle.
        const l = Math.hypot(this.x, this.z) || 1;
        this.steer(dt, this.x + (this.x / l) * 20, this.z + (this.z / l) * 20, ctx, 1.1, true);
        if (this.kind === "ghost") this.setOpacity(Math.max(0, 1 - this.t / 2));
        if ((this.kind === "ghost" && this.t > 2) || ctx.height(this.x, this.z) < -1.4 || this.t > 14) this.despawn();
        break;
      }
    }

    // Pose.
    const hover = this.kind === "ghost" ? 0.35 + Math.sin(this.hover * 2.2) * 0.12 : 0;
    this.y = Math.max(ctx.height(this.x, this.z), this.kind === "ghost" ? -0.2 : -9);
    this.root.position.set(this.x, this.y + hover, this.z);
    this.root.rotation.y = this.yaw;
  }

  /** Walks towards (tx, tz), keeping out of firelight (most kinds) and sliding around obstacles. */
  private steer(dt: number, tx: number, tz: number, ctx: CreatureCtx, speedK: number, ignoreFear = false) {
    let dx = tx - this.x;
    let dz = tz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    let speed = this.def.speed * speedK;
    // Firelight: stay outside the circle, prowling along its edge.
    let afraid = false;
    if (this.def.fear > 0 && !ignoreFear) {
      for (const b of ctx.blockers(this.x, this.z, 16)) {
        if (b.light <= 0) continue;
        const R = b.light * (this.kind === "ghost" ? 1.05 : 0.9);
        const fx = this.x - b.x;
        const fz = this.z - b.z;
        const fd = Math.hypot(fx, fz) || 1;
        if (fd < R + 1.2) {
          afraid = true;
          const push = Math.min(1.6, (R + 1.2 - fd) / 1.2);
          // Away from the fire plus a sideways prowl.
          dx += (fx / fd) * push * 2.2 + (-fz / fd) * 0.5 * Math.sign(Math.sin(this.hover + this.x));
          dz += (fz / fd) * push * 2.2 + (fx / fd) * 0.5 * Math.sign(Math.sin(this.hover + this.x));
        }
      }
      // A held torch / lantern keeps crabs (and ghosts, with a lantern) at bay.
      const p = ctx.player;
      const fearLight = p.light > 0 && (this.kind === "crab" || (this.kind === "ghost" && p.lightKind === "lantern"));
      if (fearLight) {
        const R = p.lightKind === "lantern" ? 4.2 : 3.0;
        const fx = this.x - p.x;
        const fz = this.z - p.z;
        const fd = Math.hypot(fx, fz) || 1;
        if (fd < R) {
          afraid = true;
          dx += (fx / fd) * 2.4;
          dz += (fz / fd) * 2.4;
        }
      }
    }
    if (this.detourT > 0) {
      this.detourT -= dt;
      const c = Math.cos(this.detour);
      const s = Math.sin(this.detour);
      const ndx = dx * c - dz * s;
      const ndz = dx * s + dz * c;
      dx = ndx;
      dz = ndz;
    }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    if (afraid) speed *= 0.8;
    // Slower in water.
    if (ctx.height(this.x, this.z) < -0.3 && this.kind !== "ghost") speed *= 0.65;
    const blocked = this.move(dx * speed * dt, dz * speed * dt, ctx, false);
    if (Math.abs(angleDiff(this.yaw, yawTo(dx, dz))) > 0.01) this.yaw = turnTowards(this.yaw, yawTo(dx, dz), 7, dt);
    if (this.anim.name !== this.runClip && this.anim.name !== this.walkClip) this.anim.play(this.walkClip);
    else this.anim.play(d > 6 ? this.runClip : this.walkClip, { speed: this.kind === "brute" ? 0.75 : 1 });
    // A wall in the way: break it.
    if (blocked && !this.target && this.state === "seek" && blocked.hp > 0) this.target = blocked;
    // Stuck behind a tree or rock: try a detour for a moment.
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = Math.hypot(this.x - this.stuckX, this.z - this.stuckZ);
      if (moved < 0.6 && !afraid && this.state === "seek") {
        this.detour = (Math.random() < 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.6);
        this.detourT = 0.9;
      }
      this.stuckT = 0;
      this.stuckX = this.x;
      this.stuckZ = this.z;
    }
  }

  /** Moves with collision. Returns the structure it bumped into, if any. */
  private move(mx: number, mz: number, ctx: CreatureCtx, knocked: boolean): Blocker | null {
    let nx = this.x + mx;
    let nz = this.z + mz;
    const r = this.def.radius;
    let bumped: Blocker | null = null;
    if (!ctx.walkable(nx, nz) && ctx.walkable(this.x, this.z) && this.state !== "flee" && this.state !== "emerge") {
      nx = this.x;
      nz = this.z;
    }
    if (this.kind !== "ghost") {
      for (const s of ctx.solids(nx, nz, r, tmpSolids)) {
        const dx = nx - s.x;
        const dz = nz - s.z;
        const d = Math.hypot(dx, dz);
        const min = r + s.r;
        if (d < min && d > 1e-4) {
          nx = s.x + (dx / d) * min;
          nz = s.z + (dz / d) * min;
        }
      }
    }
    if (!this.def.phase) {
      for (const b of ctx.blockers(nx, nz, r + 2.5)) {
        if (!b.solid) continue;
        const hit = pushOut(nx, nz, r, b);
        if (hit) {
          nx = hit.x;
          nz = hit.z;
          if (!knocked) bumped = b;
        }
      }
    }
    this.x = nx;
    this.z = nz;
    return bumped;
  }

  private strike(ctx: CreatureCtx) {
    const p = ctx.player;
    const reach = this.def.reach + 0.35;
    if (this.target && this.target.hp > 0) {
      ctx.hitBlocker(this, this.target, this.def.wallDamage);
      if (this.target.hp <= 0) this.target = null;
      // A swing at a wall can still clip the castaway right behind it.
    }
    if (!p.alive) return;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + 0.4) return;
    const facing = Math.abs(angleDiff(this.yaw, yawTo(dx, dz)));
    if (facing > 1.2 && d > 0.8) return;
    ctx.hitPlayer(this, this.def.damage);
  }

  despawn() {
    this.active = false;
    this.state = "gone";
    this.root.visible = false;
    this.bar.group.visible = false;
    this.anim.stopAll();
  }

  dispose() {
    this.anim.stopAll();
    for (const m of this.mats) m.dispose();
    this.bar.dispose();
  }
}

/** Pushes a circle out of a blocker (circle or wall segment). */
export function pushOut(x: number, z: number, r: number, b: Blocker): { x: number; z: number } | null {
  if (!b.wall) {
    const dx = x - b.x;
    const dz = z - b.z;
    const d = Math.hypot(dx, dz);
    const min = r + b.r;
    if (d >= min || d < 1e-5) return null;
    return { x: b.x + (dx / d) * min, z: b.z + (dz / d) * min };
  }
  // Wall: segment along the wall's local x axis.
  const ux = Math.cos(b.rot);
  const uz = -Math.sin(b.rot);
  const rx = x - b.x;
  const rz = z - b.z;
  const along = Math.max(-b.half, Math.min(b.half, rx * ux + rz * uz));
  const cx = b.x + ux * along;
  const cz = b.z + uz * along;
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.hypot(dx, dz);
  const min = r + b.r;
  if (d >= min) return null;
  if (d < 1e-5) {
    // Exactly on the line: push along the wall's normal.
    const nx = -uz;
    const nz = ux;
    return { x: cx + nx * min, z: cz + nz * min };
  }
  return { x: cx + (dx / d) * min, z: cz + (dz / d) * min };
}
