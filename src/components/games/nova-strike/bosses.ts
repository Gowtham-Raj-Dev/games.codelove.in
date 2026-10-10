import * as THREE from "three";
import { blankEnemy, type Ctx, type Enemies, type Enemy } from "./enemies";
import { M } from "./manifest";
import { clamp, damp, newFrame, smooth } from "./rail";
import { BOX, TRENCH, type BossKind } from "./stages";

/**
 * Stage bosses, built from library models. A boss flies ahead of the player (rail-relative), cycles
 * through telegraphed attacks and exposes glowing weak points: armoured parts first deflect
 * shots, then open up once the outer weak points are destroyed.
 */

const RED = new THREE.Color("#ff2d55");
const ORANGE = new THREE.Color("#ff8a3c");
const CYAN = new THREE.Color("#22d3ee");
const MAGENTA = new THREE.Color("#ff4fd8");
const WHITE = new THREE.Color("#ffffff");
const GOLD = new THREE.Color("#ffd166");

const f = newFrame();
const tmpV = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface PartOpts {
  key: string;
  /** Largest dimension in metres. */
  size: number;
  at: [number, number, number];
  hp?: number;
  weak?: boolean;
  armored?: boolean;
  radius?: number;
  glow?: THREE.Color;
  score?: number;
  rotY?: number;
  rotX?: number;
  rotZ?: number;
  parent?: THREE.Object3D;
}

interface Glowing {
  materials: THREE.MeshStandardMaterial[];
  color: THREE.Color;
}

export abstract class Boss {
  readonly group = new THREE.Group();
  readonly parts: Enemy[] = [];
  abstract readonly name: string;
  /** Distance ahead of the player and offsets inside the rail frame. */
  d = 320;
  x = 0;
  y = 0;
  t = 0;
  state = "enter";
  stateT = 0;
  phase = 1;
  dying = -1;
  dead = false;
  private readonly glowing = new Map<Enemy, Glowing>();
  private readonly ownMaterials: THREE.Material[] = [];
  protected hullRadius = 9;
  /** Every boss is built at this scale (sizes, offsets and hit radii). */
  protected readonly k = 1.5;
  /** World position of the boss centre. */
  readonly center = new THREE.Vector3();

  constructor(
    protected readonly ctx: Ctx,
    protected readonly enemies: Enemies,
  ) {
    ctx.root.add(this.group);
  }

  protected part(o: PartOpts): Enemy {
    const proto = this.ctx.protos.get(o.key);
    const e = blankEnemy("part");
    e.boss = true;
    e.noHit = true;
    e.hp = e.maxHp = o.hp ?? 9999;
    // Everything is invulnerable while the boss flies in.
    e.armored = this.state === "enter" || (o.armored ?? !o.weak);
    e.lockable = !!o.weak;
    e.radius = (o.radius ?? o.size * 0.45) * this.k;
    e.score = o.score ?? (o.weak ? 1000 : 0);
    e.glow = o.glow ?? null;
    e.glowSize = o.size * 0.9 * this.k;
    if (proto) {
      const obj = proto.object.clone();
      const max = Math.max(proto.size.x, proto.size.y, proto.size.z);
      obj.scale.setScalar((o.size * this.k) / max);
      obj.position.set(o.at[0] * this.k, o.at[1] * this.k, o.at[2] * this.k);
      obj.rotation.set(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0);
      (o.parent ?? this.group).add(obj);
      e.obj = obj;
      if (o.weak && o.glow) {
        // Weak points glow: own copies of the part's materials with a pulsing emissive.
        const mats: THREE.MeshStandardMaterial[] = [];
        obj.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          const swap = (m: THREE.Material) => {
            const c = (m as THREE.MeshStandardMaterial).clone();
            c.emissive = o.glow!.clone();
            c.emissiveIntensity = 0.6;
            mats.push(c);
            this.ownMaterials.push(c);
            return c;
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
        });
        this.glowing.set(e, { materials: mats, color: o.glow });
      }
    }
    this.parts.push(e);
    this.enemies.add(e);
    return e;
  }

  /** Makes an armoured part vulnerable (a weak point that glows). */
  protected expose(e: Enemy, glow: THREE.Color, hp: number) {
    e.armored = false;
    e.lockable = true;
    e.hp = e.maxHp = hp;
    e.glow = glow;
    e.score = 2000;
    if (e.obj && !this.glowing.has(e)) {
      const mats: THREE.MeshStandardMaterial[] = [];
      e.obj.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh) return;
        const swap = (m: THREE.Material) => {
          const c = (m as THREE.MeshStandardMaterial).clone();
          c.emissive = glow.clone();
          c.emissiveIntensity = 0.6;
          mats.push(c);
          this.ownMaterials.push(c);
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      });
      this.glowing.set(e, { materials: mats, color: glow });
    }
    this.ctx.flashes.spawn(e.pos, 6, glow, 0.5);
  }

  /** 0..1 health of what is left to destroy. */
  abstract hp(): number;

  protected abstract behave(dt: number): void;

  protected setState(s: string) {
    this.state = s;
    this.stateT = 0;
  }

  /** Local offset (boss frame) → world. */
  protected world(local: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(local).applyMatrix4(this.group.matrixWorld);
  }

  /** Rail-local (x, y) at distance d ahead of the player → world. */
  protected railPoint(d: number, x: number, y: number, out: THREE.Vector3) {
    this.ctx.rail.frame(this.ctx.s + d, f);
    return out.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y);
  }

  get alive() {
    return !this.dead && this.dying < 0;
  }

  update(dt: number) {
    const { ctx } = this;
    this.t += dt;
    this.stateT += dt;
    if (this.state === "enter") {
      this.d = damp(this.d, 66, 1.6, dt);
      if (this.stateT > 3.2) {
        this.parts.forEach((p) => {
          if (p.lockable) p.armored = false;
        });
        this.setState("idle");
      }
    }
    if (this.dying >= 0) this.updateDying(dt);
    else if (this.state !== "enter") this.behave(dt);

    // Place the group in the rail frame, facing the player.
    ctx.rail.frame(ctx.s + this.d, f);
    this.group.position.copy(f.pos).addScaledVector(f.right, this.x).addScaledVector(f.up, this.y);
    this.group.quaternion.copy(f.quat).multiply(tmpQ.setFromAxisAngle(Y_AXIS, Math.PI));
    this.group.updateMatrixWorld(true);
    this.center.copy(this.group.position);
    for (const p of this.parts) {
      if (!p.alive || !p.obj) continue;
      p.obj.getWorldPosition(p.pos);
      p.s = ctx.s + this.d;
    }
    // Weak point glow.
    for (const [e, g] of this.glowing) {
      if (!e.alive) continue;
      const pulse = 0.55 + Math.sin(this.t * 5 + e.id) * 0.35;
      for (const m of g.materials) m.emissiveIntensity = e.armored ? 0.15 : 0.5 + pulse * 0.9;
      if (!e.armored) ctx.glows.add(e.pos, g.color, e.glowSize * (0.8 + pulse * 0.4), 0.45 + pulse * 0.4);
    }
    // Ramming into the hull hurts.
    if (this.dying < 0 && ctx.player.distanceTo(this.center) < this.hullRadius * this.k) {
      ctx.hurt(25, this.center);
      ctx.shake(0.9);
    }
  }

  /** Starts the death sequence once the last weak point is gone. */
  protected die() {
    if (this.dying >= 0) return;
    this.dying = 0;
    this.ctx.sfx.explosion(2);
    this.ctx.shake(1.2);
  }

  private updateDying(dt: number) {
    const { ctx } = this;
    const before = this.dying;
    this.dying += dt;
    this.d = damp(this.d, 85, 1, dt);
    this.group.rotation.z += dt * 0.4;
    // Chain of explosions over the hull, then one big blast.
    if (Math.floor(before * 7) !== Math.floor(this.dying * 7) && this.dying < 2.6) {
      tmpA.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 20);
      this.world(tmpA, tmpB);
      ctx.explode(tmpB, 5 + Math.random() * 5);
      ctx.sfx.explosion(Math.random() < 0.5 ? 1 : 0);
      ctx.shake(0.35);
    }
    if (this.dying >= 2.8 && !this.dead) {
      ctx.explode(this.center, 26, GOLD);
      ctx.flashes.spawn(this.center, 60, WHITE, 0.9);
      ctx.flashes.spawn(this.center, 50, GOLD, 1.2, true, this.group.quaternion);
      ctx.sfx.explosion(2);
      ctx.shake(2);
      this.dead = true;
      for (const p of this.parts) if (p.alive) this.enemies.remove(p);
      this.group.visible = false;
    }
  }

  dispose() {
    for (const p of this.parts) if (p.alive) this.enemies.remove(p);
    this.group.removeFromParent();
    for (const m of this.ownMaterials) m.dispose();
  }

  // --- Shared attack helpers -----------------------------------------------------------------------

  /** Fan of bolts from a world point towards the player. */
  protected fan(from: THREE.Vector3, n: number, spread: number, speed: number) {
    for (let i = 0; i < n; i++) this.ctx.fire(from, { speed, spread: (i - (n - 1) / 2) * spread, lead: false, size: 1.3, color: ORANGE });
    this.ctx.sfx.enemyShot();
  }

  /** A shootable homing projectile (meteor or energy orb) launched from a world point. */
  protected missile(from: THREE.Vector3, opts: { key?: string; size: number; speed: number; homing: number; hp: number; damage: number; glow: THREE.Color }) {
    const { ctx } = this;
    const e = blankEnemy("boulder");
    e.rel = true;
    // Rail-local coordinates of the launch point.
    ctx.rail.frame(ctx.s + this.d, f);
    tmpV.copy(from).sub(f.pos);
    e.x = tmpV.dot(f.right);
    e.y = tmpV.dot(f.up);
    e.d = this.d + tmpV.dot(f.fwd);
    e.vx = opts.speed;
    e.vy = opts.homing;
    e.hp = e.maxHp = opts.hp;
    e.score = 150;
    e.noHit = true;
    e.collide = opts.damage;
    e.radius = opts.size * 0.55;
    e.size = opts.size;
    e.glow = opts.glow;
    e.glowSize = opts.size * 1.4;
    e.target.set(ctx.px, ctx.py);
    e.spin.set(Math.random(), Math.random(), Math.random()).normalize().multiplyScalar(3);
    if (opts.key && ctx.protos.has(opts.key)) {
      e.key = opts.key;
      e.obj = ctx.pool.get(opts.key, ctx.root);
      e.obj.scale.setScalar(opts.size);
    }
    this.enemies.add(e);
    return e;
  }

  /** A sweeping beam from `from` to the rail-local point (x, y) at the player's depth. Returns true if it touches the player. */
  protected beam(from: THREE.Vector3, x: number, y: number, width: number, color: THREE.Color, alpha: number) {
    const { ctx } = this;
    this.railPoint(-6, x, y, tmpA);
    // Extend past the player.
    tmpB.copy(tmpA).sub(from).multiplyScalar(1.25).add(from);
    ctx.beams.add(from, tmpB, width, color, alpha);
    // Distance from the player to the beam segment.
    tmpV.subVectors(tmpB, from);
    const t = clamp(tmpA.subVectors(ctx.player, from).dot(tmpV) / tmpV.lengthSq(), 0, 1);
    tmpA.copy(from).addScaledVector(tmpV, t);
    return tmpA.distanceTo(ctx.player) < width * 0.45 + 0.6;
  }
}

// --- Stage 1: Titan Drill -------------------------------------------------------------------------

class TitanDrill extends Boss {
  readonly name = "Titan Drill";
  private readonly pods: Enemy[];
  private readonly core: Enemy;
  private readonly rocks: Enemy[] = [];
  private readonly orbit = new THREE.Group();
  private volley = 0;
  private toss = 0;
  private ram = { x: 0, y: 0 };
  private cycle = 0;

  constructor(ctx: Ctx, enemies: Enemies) {
    super(ctx, enemies);
    this.hullRadius = 9;
    // Hull: the mining craft, its nose towards the player (group +Z faces the player... after the flip, -Z).
    this.part({ key: M.miner, size: 28, at: [0, -3.5, 0], armored: true, radius: 10 });
    this.pods = [-1, 1].map((side) => this.part({ key: M.turretDouble, size: 6, at: [side * 11, 0.5, -3], weak: true, hp: 60, glow: ORANGE, radius: 3.6, rotY: Math.PI }));
    this.core = this.part({ key: M.generator, size: 6, at: [0, 1, -13], armored: true, radius: 3.8, rotY: Math.PI });
    this.group.add(this.orbit);
    this.spawnRocks();
  }

  private spawnRocks() {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const r = this.part({ key: M.meteorDetailed, size: 4.6, at: [Math.cos(a) * 17, Math.sin(a) * 9, 0], weak: false, armored: false, hp: 3, radius: 2.4, parent: this.orbit });
      r.lockable = true;
      r.score = 150;
      this.rocks.push(r);
    }
  }

  hp() {
    if (this.phase === 1) return 0.5 + (this.pods.reduce((a, p) => a + Math.max(0, p.alive ? p.hp : 0), 0) / 120) * 0.5;
    return (Math.max(0, this.core.alive ? this.core.hp : 0) / 110) * 0.5;
  }

  protected behave(dt: number) {
    const { ctx } = this;
    this.orbit.rotation.z += dt * 0.6;
    const ramming = this.state === "ram";
    if (!ramming) {
      this.x = damp(this.x, Math.sin(this.t * 0.45) * 5, 2, dt);
      this.y = damp(this.y, Math.cos(this.t * 0.6) * 2 + 1, 2, dt);
      this.d = damp(this.d, 64 + Math.sin(this.t * 0.3) * 6, 1.5, dt);
    }
    if (this.phase === 1 && this.pods.every((p) => !p.alive)) {
      this.phase = 2;
      this.expose(this.core, RED, 110);
      ctx.sfx.siren();
      this.setState("idle");
    }
    if (this.phase === 2 && !this.core.alive) {
      this.die();
      return;
    }
    const fast = this.phase === 2 ? 0.75 : 1;
    switch (this.state) {
      case "idle":
        if (this.stateT > 1.4 * fast) {
          this.cycle++;
          const live = this.rocks.filter((r) => r.alive);
          if (this.phase === 2 && this.cycle % 3 === 0) {
            this.setState("ram-aim");
            ctx.sfx.bossCharge();
          } else if (this.cycle % 2 === 0 && live.length) {
            this.toss = 0;
            this.setState("toss");
          } else {
            this.setState("spread-charge");
            ctx.sfx.bossCharge();
          }
        }
        break;
      case "spread-charge": {
        const k = this.stateT / 0.9;
        for (const src of this.sources()) ctx.glows.add(src, ORANGE, 3 + k * 6, 0.6 + k);
        if (this.stateT > 0.9) {
          this.volley = 0;
          this.setState("spread");
        }
        break;
      }
      case "spread":
        if (this.stateT > this.volley * 0.28 && this.volley < 3) {
          this.volley++;
          for (const src of this.sources()) this.fan(src, this.phase === 2 ? 7 : 5, 0.11, 46 + ctx.stage * 4);
        }
        if (this.stateT > 1.2) this.setState("idle");
        break;
      case "toss": {
        const live = this.rocks.filter((r) => r.alive);
        const r = live[0];
        if (!r) {
          this.setState("idle");
          if (this.rocks.every((x) => !x.alive)) {
            this.rocks.length = 0;
            this.spawnRocks();
          }
          break;
        }
        ctx.glows.add(r.pos, RED, 5 + this.stateT * 6, 0.5 + this.stateT * 2);
        if (this.stateT > 0.6) {
          this.missile(r.pos, { key: M.meteorDetailed, size: 4.2, speed: 34, homing: 1.1, hp: 3, damage: 18, glow: ORANGE });
          this.enemies.remove(r);
          this.toss++;
          this.stateT = 0;
          ctx.sfx.bombLaunch();
          if (this.toss >= 3) this.setState("idle");
        }
        break;
      }
      case "ram-aim": {
        if (this.stateT < 0.9) this.ram = { x: ctx.px, y: ctx.py };
        // Red target box where it will strike.
        this.railPoint(14, this.ram.x, this.ram.y, tmpA);
        const s = 5;
        const blink = Math.sin(this.stateT * 30) > 0 ? 1.6 : 0.6;
        ctx.rail.frame(ctx.s + 14, f);
        const corners = [
          [-s, -s],
          [s, -s],
          [s, s],
          [-s, s],
        ];
        for (let i = 0; i < 4; i++) {
          const [ax, ay] = corners[i];
          const [bx, by] = corners[(i + 1) % 4];
          tmpV.copy(tmpA).addScaledVector(f.right, ax * 0.5).addScaledVector(f.up, ay * 0.4);
          tmpB.copy(tmpA).addScaledVector(f.right, bx * 0.5).addScaledVector(f.up, by * 0.4);
          ctx.beams.add(tmpV, tmpB, 0.3, RED, blink);
        }
        if (this.stateT > 1.25) this.setState("ram");
        break;
      }
      case "ram": {
        const t = this.stateT;
        if (t < 0.45) {
          const k = smooth(t / 0.45);
          this.d = 64 - k * 48;
          this.x = this.ram.x * k;
          this.y = this.ram.y * k - 1;
          if (t > 0.3) {
            ctx.shake(0.15);
            if (Math.abs(ctx.px - this.ram.x) < 5 && Math.abs(ctx.py - this.ram.y) < 3.6) ctx.hurt(30, this.center);
          }
        } else if (t > 0.8) {
          this.d = damp(this.d, 64, 2.5, dt);
        }
        if (t > 2) this.setState("idle");
        break;
      }
    }
  }

  private sources() {
    const out: THREE.Vector3[] = [];
    if (this.phase === 1) for (const p of this.pods) if (p.alive) out.push(p.pos);
    if (this.phase === 2 && this.core.alive) out.push(this.core.pos);
    return out;
  }
}

// --- Stage 2: Orbital Warden ----------------------------------------------------------------------

class OrbitalWarden extends Boss {
  readonly name = "Orbital Warden";
  private readonly spin = new THREE.Group();
  private readonly dishes: Enemy[];
  private readonly turrets: Enemy[];
  private readonly core: Enemy;
  private beamDir = 1;
  private beamY = 0;
  private beamX = 0;
  private vertical = false;
  private turretT = 1.5;
  private cycle = 0;

  constructor(ctx: Ctx, enemies: Enemies) {
    super(ctx, enemies);
    this.hullRadius = 11;
    this.group.add(this.spin);
    this.part({ key: M.mir, size: 44, at: [0, 0, 6], armored: true, radius: 12, parent: this.spin, rotX: Math.PI / 2 });
    this.dishes = [-1, 1].map((side) => this.part({ key: M.dish, size: 8, at: [side * 15, 3, -4], weak: true, hp: 65, glow: CYAN, radius: 4.4, rotX: -Math.PI / 2, parent: this.spin }));
    this.turrets = [
      [-7, 9],
      [7, 9],
      [-7, -9],
      [7, -9],
    ].map(([x, y]) => {
      const t = this.part({ key: M.turretSingle, size: 4.2, at: [x, y > 0 ? y : y + 1, -3], weak: true, hp: 10, glow: ORANGE, radius: 2.6, rotZ: y > 0 ? 0 : Math.PI, parent: this.spin });
      t.score = 400;
      return t;
    });
    this.core = this.part({ key: M.generator, size: 7, at: [0, 0, -9], armored: true, radius: 4.2, rotY: Math.PI });
  }

  hp() {
    if (this.phase === 1) return 0.5 + (this.dishes.reduce((a, p) => a + (p.alive ? Math.max(0, p.hp) : 0), 0) / 130) * 0.5;
    return ((this.core.alive ? Math.max(0, this.core.hp) : 0) / 120) * 0.5;
  }

  protected behave(dt: number) {
    const { ctx } = this;
    const beaming = this.state === "beam" || this.state === "beam-aim";
    this.spin.rotation.z += dt * (this.phase === 2 ? 0.5 : 0.18) * (beaming ? 0.2 : 1);
    this.x = damp(this.x, Math.sin(this.t * 0.35) * 4, 1.5, dt);
    this.y = damp(this.y, Math.sin(this.t * 0.5) * 2, 1.5, dt);
    this.d = damp(this.d, 72, 1.2, dt);
    if (this.phase === 1 && this.dishes.every((p) => !p.alive)) {
      this.phase = 2;
      this.expose(this.core, MAGENTA, 120);
      ctx.sfx.siren();
      this.setState("idle");
    }
    if (this.phase === 2 && !this.core.alive) {
      this.die();
      return;
    }
    // Turrets keep firing between attacks.
    this.turretT -= dt;
    if (this.turretT <= 0) {
      this.turretT = this.phase === 2 ? 1.1 : 1.6;
      const live = this.turrets.filter((t) => t.alive);
      if (live.length && ctx.bolts() < 18) {
        const t = live[Math.floor(Math.random() * live.length)];
        ctx.fire(t.pos, { speed: 54 + ctx.stage * 4, lead: true, color: ORANGE });
        ctx.sfx.enemyShot();
      }
    }
    switch (this.state) {
      case "idle":
        if (this.stateT > (this.phase === 2 ? 1.1 : 1.6)) {
          this.cycle++;
          if (this.cycle % 3 === 2) this.setState("mines");
          else {
            this.vertical = this.cycle % 2 === 1;
            this.beamDir = Math.random() < 0.5 ? -1 : 1;
            this.setState("beam-aim");
            ctx.sfx.bossCharge();
          }
        }
        break;
      case "beam-aim": {
        // Lock the beam's line on the player's height (or column), then show where it will sweep.
        if (this.stateT < 0.7) {
          this.beamY = clamp(ctx.py, -BOX.y + 1, BOX.y - 1);
          this.beamX = clamp(ctx.px, -BOX.x + 1, BOX.x - 1);
        }
        for (const src of this.emitters()) {
          ctx.glows.add(src, CYAN, 4 + this.stateT * 6, 0.6 + this.stateT);
          const blink = Math.sin(this.stateT * 40) > 0 ? 0.9 : 0.3;
          if (this.vertical) this.beam(src, this.beamX, -this.beamDir * BOX.y * 1.4, 0.18, RED, blink);
          else this.beam(src, -this.beamDir * BOX.x * 1.4, this.beamY, 0.18, RED, blink);
          // Preview of the sweep line.
          this.railPoint(-6, this.vertical ? this.beamX : -BOX.x * 1.4, this.vertical ? -BOX.y * 1.4 : this.beamY, tmpA);
          this.railPoint(-6, this.vertical ? this.beamX : BOX.x * 1.4, this.vertical ? BOX.y * 1.4 : this.beamY, tmpB);
          ctx.beams.add(tmpA, tmpB, 0.12, RED, blink * 0.6);
        }
        if (this.stateT > 1.3) {
          this.setState("beam");
          ctx.sfx.beam();
        }
        break;
      }
      case "beam": {
        const T = this.phase === 2 ? 1.3 : 1.7;
        const k = clamp(this.stateT / T, 0, 1);
        const sweep = -this.beamDir + 2 * this.beamDir * k;
        for (const src of this.emitters()) {
          const hit = this.vertical ? this.beam(src, this.beamX, sweep * BOX.y * 1.4, 1.5, CYAN, 1.6) : this.beam(src, sweep * BOX.x * 1.4, this.beamY, 1.5, CYAN, 1.6);
          ctx.beams.add(src, tmpB, 0.5, WHITE, 1.2);
          if (hit) ctx.hurt(16, src);
        }
        ctx.shake(0.08);
        if (this.stateT > T) this.setState("idle");
        break;
      }
      case "mines": {
        if (this.stateT > 0.2 && this.stateT - dt <= 0.2) {
          const n = this.phase === 2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            tmpA.set(Math.cos(a) * 6, Math.sin(a) * 6, -4);
            this.world(tmpA, tmpB);
            this.missile(tmpB, { key: M.drone, size: 2.6, speed: 26, homing: 0.8, hp: 1, damage: 14, glow: RED });
          }
          ctx.sfx.bombLaunch();
        }
        if (this.stateT > 1.4) this.setState("idle");
        break;
      }
    }
  }

  private emitters() {
    const out: THREE.Vector3[] = [];
    if (this.phase === 1) for (const d of this.dishes) if (d.alive) out.push(d.pos);
    if (this.phase === 2 && this.core.alive) out.push(this.core.pos);
    return out;
  }
}

// --- Stage 3: Station Core ------------------------------------------------------------------------

interface Fence {
  d: number;
  vertical: boolean;
  lines: number[];
  hitDone: boolean;
}

class StationCore extends Boss {
  readonly name = "Station Core";
  private readonly ring = new THREE.Group();
  private readonly shields = new THREE.Group();
  private readonly emitters: Enemy[];
  private readonly core: Enemy;
  private fence: Fence | null = null;
  private cycle = 0;
  private salvo = 0;

  constructor(ctx: Ctx, enemies: Enemies) {
    super(ctx, enemies);
    this.hullRadius = 6;
    this.group.add(this.ring, this.shields);
    this.part({ key: M.gateComplex, size: 20, at: [0, -10, 0], armored: true, radius: 6, parent: this.ring });
    this.part({ key: M.hangarGlass, size: 16, at: [0, -6, 8], armored: true, radius: 6, rotX: -Math.PI / 2 });
    this.emitters = [0, 1, 2, 3].map((i) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      return this.part({ key: M.turretDouble, size: 4.6, at: [Math.cos(a) * 9, Math.sin(a) * 9, -2], weak: true, hp: 45, glow: CYAN, radius: 3, rotX: -Math.PI / 2, parent: this.ring });
    });
    // Rotating shield plates in front of the core.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.part({ key: M.structureClosed, size: 5, at: [Math.cos(a) * 5.5, Math.sin(a) * 5.5, -7], armored: true, radius: 2.6, parent: this.shields });
    }
    this.core = this.part({ key: M.generator, size: 6.5, at: [0, 0, -3], armored: true, radius: 3.6, rotY: Math.PI });
  }

  hp() {
    if (this.phase === 1) return 0.5 + (this.emitters.reduce((a, p) => a + (p.alive ? Math.max(0, p.hp) : 0), 0) / 180) * 0.5;
    return ((this.core.alive ? Math.max(0, this.core.hp) : 0) / 140) * 0.5;
  }

  protected behave(dt: number) {
    const { ctx } = this;
    this.ring.rotation.z += dt * (this.phase === 2 ? 0.8 : 0.35);
    this.shields.rotation.z -= dt * (this.phase === 2 ? 1.1 : 0.7);
    this.x = damp(this.x, Math.sin(this.t * 0.4) * 3, 1.5, dt);
    this.y = damp(this.y, 1 + Math.sin(this.t * 0.55) * 1.5, 1.5, dt);
    this.d = damp(this.d, 68, 1.2, dt);
    if (this.phase === 1 && this.emitters.every((p) => !p.alive)) {
      this.phase = 2;
      this.expose(this.core, MAGENTA, 140);
      ctx.sfx.siren();
      this.setState("idle");
    }
    if (this.phase === 2 && !this.core.alive) {
      this.die();
      return;
    }
    this.updateFence(dt);
    switch (this.state) {
      case "idle":
        if (this.stateT > (this.phase === 2 ? 1.0 : 1.5)) {
          this.cycle++;
          const pick = this.cycle % 3;
          if (pick === 1) {
            this.setState("fence-aim");
            ctx.sfx.bossCharge();
          } else if (pick === 2) {
            this.salvo = 0;
            this.setState("missiles");
          } else {
            this.setState(this.phase === 2 ? "pulse-aim" : "volley");
            if (this.phase === 2) ctx.sfx.bossCharge();
          }
        }
        break;
      case "fence-aim": {
        if (!this.fence) {
          const vertical = Math.random() < 0.5;
          // Leave one gap: every line but one is lit.
          const slots = vertical ? [-6, -3, 0, 3, 6] : [-3.6, -1.2, 1.2, 3.6];
          const gap = Math.floor(Math.random() * slots.length);
          const lines = slots.filter((_, i) => i !== gap && (this.phase === 2 || i !== (gap + 2) % slots.length));
          this.fence = { d: this.d - 6, vertical, lines, hitDone: false };
        }
        if (this.stateT > 1.0) this.setState("fence");
        break;
      }
      case "fence":
        if (this.fence && this.fence.d < -12) {
          this.fence = null;
          this.setState("idle");
        }
        break;
      case "missiles":
        if (this.stateT > this.salvo * 0.22 && this.salvo < (this.phase === 2 ? 8 : 6)) {
          const src = this.emitters.filter((e) => e.alive);
          const from = src.length ? src[this.salvo % src.length].pos : this.core.pos;
          this.missile(from, { size: 1.6, speed: 30, homing: 1.4, hp: 1, damage: 12, glow: MAGENTA });
          ctx.sfx.enemyShot();
          this.salvo++;
        }
        if (this.stateT > 2.2) this.setState("idle");
        break;
      case "volley":
        if (this.stateT > 0.3 && this.stateT - dt <= 0.3) for (const e of this.emitters) if (e.alive) this.fan(e.pos, 3, 0.08, 52);
        if (this.stateT > 1) this.setState("idle");
        break;
      case "pulse-aim": {
        const k = this.stateT / 1.0;
        ctx.glows.add(this.core.pos, MAGENTA, 6 + k * 10, 0.6 + k * 1.5);
        if (this.stateT > 1.0) {
          // A ring of bolts that opens around the player: stay in the middle or roll.
          ctx.rail.frame(ctx.s, f);
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            this.railPoint(0, ctx.px + Math.cos(a) * 4.2, ctx.py + Math.sin(a) * 3.2, tmpA);
            const dir = tmpA.sub(this.core.pos).normalize();
            ctx.fire(this.core.pos, { speed: 48, dir: dir.clone(), color: MAGENTA, size: 1.4 });
          }
          ctx.sfx.bomb();
          this.setState("idle");
        }
        break;
      }
    }
  }

  private updateFence(dt: number) {
    const { ctx } = this;
    const fence = this.fence;
    if (!fence) return;
    const live = this.state === "fence";
    if (live) fence.d -= (this.phase === 2 ? 46 : 38) * dt;
    ctx.rail.frame(ctx.s + fence.d, f);
    const W = TRENCH.halfWidth - 1;
    for (const at of fence.lines) {
      if (fence.vertical) {
        tmpA.copy(f.pos).addScaledVector(f.right, at).addScaledVector(f.up, TRENCH.floor);
        tmpB.copy(f.pos).addScaledVector(f.right, at).addScaledVector(f.up, TRENCH.wallTop);
      } else {
        tmpA.copy(f.pos).addScaledVector(f.right, -W).addScaledVector(f.up, at);
        tmpB.copy(f.pos).addScaledVector(f.right, W).addScaledVector(f.up, at);
      }
      if (live) ctx.beams.add(tmpA, tmpB, 1.4, RED, 1.7);
      else ctx.beams.add(tmpA, tmpB, 0.25, RED, Math.sin(this.stateT * 40) > 0 ? 1.2 : 0.3);
    }
    if (live && !fence.hitDone && fence.d <= 0) {
      fence.hitDone = true;
      for (const at of fence.lines) {
        const dist = fence.vertical ? Math.abs(ctx.px - at) : Math.abs(ctx.py - at);
        if (dist < (fence.vertical ? 1.5 : 1.1)) {
          ctx.hurt(22, ctx.player);
          ctx.shake(0.6);
          break;
        }
      }
    }
  }
}

export function createBoss(kind: BossKind, ctx: Ctx, enemies: Enemies): Boss {
  if (kind === "drill") return new TitanDrill(ctx, enemies);
  if (kind === "warden") return new OrbitalWarden(ctx, enemies);
  return new StationCore(ctx, enemies);
}
