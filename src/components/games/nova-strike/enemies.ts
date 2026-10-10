import * as THREE from "three";
import type { Pool, Proto } from "../shared/assets";
import { Instancer, type Beams, type Flashes, type Glows, type Particles } from "./fx";
import { M } from "./manifest";
import { clamp, damp, hash, newFrame, smooth, type Rail } from "./rail";
import type { Sfx } from "./sfx";
import { BOX, TRENCH, type Drop, type Pattern, type ShipType, type StageEvent } from "./stages";

/**
 * Everything that can be shot: ships flying formation patterns, asteroids (instanced), meteors,
 * mines, turrets, drifting satellites and boss parts. Positions live in rail coordinates
 * (s, x, y); "rel" enemies keep their distance `d` ahead of the player instead of a fixed s.
 */

/** Game services the enemies, hazards and bosses use (implemented by the engine). */
export interface Ctx {
  rail: Rail;
  /** Player rail distance and rail speed (s per second). */
  s: number;
  speed: number;
  time: number;
  stage: number;
  player: THREE.Vector3;
  px: number;
  py: number;
  pvx: number;
  pvy: number;
  pool: Pool;
  protos: Map<string, Proto>;
  root: THREE.Group;
  particles: Particles;
  glows: Glows;
  beams: Beams;
  flashes: Flashes;
  sfx: Sfx;
  /** Fires an enemy bolt from `from` towards the player (or along `dir`). */
  fire(from: THREE.Vector3, opts?: BoltOpts): void;
  explode(pos: THREE.Vector3, size: number, color?: THREE.Color): void;
  shake(amount: number): void;
  hurt(damage: number, from: THREE.Vector3): void;
  bolts(): number;
  /** Rail-speed velocity vector (world), so bolts and drops keep up with the flight. */
  railVel: THREE.Vector3;
}

export interface BoltOpts {
  speed?: number;
  dir?: THREE.Vector3;
  spread?: number;
  lead?: boolean;
  damage?: number;
  size?: number;
  color?: THREE.Color;
  /** Homing strength (0 = straight). */
  homing?: number;
  /** Bolts that can be shot down and locked onto. */
  shootable?: boolean;
}

export type EnemyKind = "ship" | "rock" | "crystal" | "meteor" | "mine" | "turret" | "satellite" | "part" | "boulder";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  ship: ShipType | null;
  pattern: Pattern | null;
  alive: boolean;
  hp: number;
  maxHp: number;
  score: number;
  radius: number;
  /** Damage to the player on contact (0 = harmless). */
  collide: number;
  rel: boolean;
  s: number;
  d: number;
  x: number;
  y: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  side: 1 | -1;
  index: number;
  count: number;
  t: number;
  hold: number;
  pos: THREE.Vector3;
  prevX: number;
  prevY: number;
  key: string;
  obj: THREE.Object3D | null;
  /** Instanced (rocks): rotation + size. */
  inst: boolean;
  rot: THREE.Quaternion;
  spin: THREE.Vector3;
  size: number;
  yaw: number;
  bank: number;
  fireT: number;
  charge: number;
  flash: number;
  locked: boolean;
  armored: boolean;
  lockable: boolean;
  drop: Drop | null;
  /** Doesn't count towards hits / medals. */
  noHit: boolean;
  /** Owned by a boss (positioned by it, removed with it). */
  boss: boolean;
  /** Turret head to aim, if any. */
  head: THREE.Object3D | null;
  glow: THREE.Color | null;
  glowSize: number;
  /** Mine / dive state. */
  armed: boolean;
  target: THREE.Vector2;
}

interface ShipDef {
  key: string;
  length: number;
  hp: number;
  score: number;
  radius: number;
  fire: number;
  burst: number;
  collide: number;
}

export const SHIPS: Record<ShipType, ShipDef> = {
  speeder: { key: M.speederA, length: 3.4, hp: 1, score: 100, radius: 2.2, fire: 3.0, burst: 1, collide: 14 },
  dart: { key: M.speederB, length: 3.4, hp: 1, score: 120, radius: 2.2, fire: 2.2, burst: 1, collide: 14 },
  raider: { key: M.speederC, length: 3.8, hp: 3, score: 200, radius: 2.5, fire: 1.8, burst: 2, collide: 16 },
  gunship: { key: M.speederD, length: 4.8, hp: 9, score: 450, radius: 3.0, fire: 1.5, burst: 3, collide: 20 },
  cargo: { key: M.cargoA, length: 8.5, hp: 12, score: 600, radius: 4.2, fire: 0, burst: 0, collide: 24 },
  miner: { key: M.miner, length: 8.5, hp: 14, score: 700, radius: 4.2, fire: 2.6, burst: 5, collide: 24 },
};

export const ROCK_KEYS = [M.meteor, M.meteorDetailed, M.rockA, M.rockB] as const;
export const CRYSTAL_KEYS = [M.crystalA, M.crystalB] as const;
export const SATELLITE_KEYS = [M.mgs, M.wfpc, M.mro, M.rover, M.tdrs, M.grace, M.seastar, M.jupiterC] as const;

const RED = new THREE.Color("#ff3b5c");
const ORANGE = new THREE.Color("#ff9a3c");
const CYAN = new THREE.Color("#22d3ee");
const GREEN = new THREE.Color("#5eead4");
const WHITE = new THREE.Color("#ffffff");
const FLASH = new THREE.Color(3, 3, 3);
const ROCK_COLOR = new THREE.Color("#8a6a55");

const f = newFrame();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, "YXZ");
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();

let nextId = 1;

export function blankEnemy(kind: EnemyKind): Enemy {
  return {
    id: nextId++,
    kind,
    ship: null,
    pattern: null,
    alive: true,
    hp: 1,
    maxHp: 1,
    score: 0,
    radius: 1,
    collide: 0,
    rel: false,
    s: 0,
    d: 0,
    x: 0,
    y: 0,
    x0: 0,
    y0: 0,
    vx: 0,
    vy: 0,
    side: 1,
    index: 0,
    count: 1,
    t: 0,
    hold: 0,
    pos: new THREE.Vector3(),
    prevX: 0,
    prevY: 0,
    key: "",
    obj: null,
    inst: false,
    rot: new THREE.Quaternion(),
    spin: new THREE.Vector3(),
    size: 1,
    yaw: Math.PI,
    bank: 0,
    fireT: 1,
    charge: 0,
    flash: 0,
    locked: false,
    armored: false,
    lockable: true,
    drop: null,
    noHit: false,
    boss: false,
    head: null,
    glow: null,
    glowSize: 0,
    armed: false,
    target: new THREE.Vector2(),
  };
}

/** Swaps materials to a white-hot copy for a few frames when something is hit. */
export class HitFlash {
  private readonly cache = new Map<THREE.Material, THREE.Material>();
  private readonly originals = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();

  private hot(m: THREE.Material) {
    let h = this.cache.get(m);
    if (!h) {
      const c = (m as THREE.MeshStandardMaterial).clone();
      if ("emissive" in c) {
        c.emissive = new THREE.Color("#ffffff");
        c.emissiveIntensity = 1.6;
      }
      h = c;
      this.cache.set(m, h);
    }
    return h;
  }

  set(obj: THREE.Object3D, on: boolean) {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (on) {
        if (this.originals.has(mesh)) return;
        this.originals.set(mesh, mesh.material);
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => this.hot(m)) : this.hot(mesh.material);
      } else {
        const orig = this.originals.get(mesh);
        if (orig) {
          mesh.material = orig;
          this.originals.delete(mesh);
        }
      }
    });
  }

  dispose() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
  }
}

export interface KillInfo {
  enemy: Enemy;
  /** Killed by the player's weapons (not a collision or a boss clean-up). */
  byPlayer: boolean;
}

export class Enemies {
  readonly list: Enemy[] = [];
  readonly flash = new HitFlash();
  private readonly rocks = new Map<string, Instancer>();
  onKill: (info: KillInfo) => void = () => {};
  onDrop: (drop: Drop, e: Enemy) => void = () => {};

  constructor(private readonly ctx: Ctx) {
    for (const key of [...ROCK_KEYS, ...CRYSTAL_KEYS]) {
      const proto = ctx.protos.get(key);
      if (!proto) continue;
      const inst = new Instancer(proto, 120, { colors: true });
      ctx.root.add(inst.group);
      this.rocks.set(key, inst);
    }
  }

  rockKeys() {
    return ROCK_KEYS.filter((k) => this.rocks.has(k));
  }

  // --- Spawning ---------------------------------------------------------------------------------

  add(e: Enemy) {
    this.list.push(e);
    return e;
  }

  private attach(e: Enemy, key: string) {
    e.key = key;
    if (!this.ctx.protos.has(key)) return;
    e.obj = this.ctx.pool.get(key, this.ctx.root);
  }

  spawnEvent(ev: StageEvent) {
    const { ctx } = this;
    switch (ev.kind) {
      case "wave": {
        const def = SHIPS[ev.type];
        for (let i = 0; i < ev.count; i++) {
          const e = blankEnemy("ship");
          e.ship = ev.type;
          e.pattern = ev.pattern;
          e.rel = true;
          e.hp = e.maxHp = def.hp;
          e.score = def.score;
          e.radius = def.radius;
          e.collide = def.collide;
          e.x0 = ev.x;
          e.y0 = ev.y;
          e.side = ev.side;
          e.index = i;
          e.count = ev.count;
          e.fireT = 0.4 + Math.random() * def.fire * 0.7;
          this.initPattern(e);
          this.attach(e, def.key);
          this.add(e);
        }
        break;
      }
      case "cargo": {
        const def = SHIPS[ev.type];
        const e = blankEnemy("ship");
        e.ship = ev.type;
        e.pattern = "hover";
        e.rel = true;
        e.hp = e.maxHp = def.hp;
        e.score = def.score;
        e.radius = def.radius;
        e.collide = def.collide;
        e.x0 = ev.x;
        e.y0 = ev.y;
        e.side = ev.side;
        e.drop = ev.drop;
        e.hold = 7;
        e.fireT = 2;
        this.initPattern(e);
        this.attach(e, ev.type === "cargo" ? (ev.drop === "laser" ? M.cargoB : M.cargoA) : M.miner);
        e.glow = ev.drop === "laser" ? CYAN : ev.drop === "bomb" ? RED : ORANGE;
        e.glowSize = 3;
        this.add(e);
        break;
      }
      case "rocks": {
        const keys = this.rockKeys();
        if (!keys.length) break;
        const placed: { s: number; x: number; y: number; r: number }[] = [];
        for (let i = 0; i < ev.count + ev.crystals; i++) {
          const crystal = i >= ev.count;
          const size = crystal ? 5.5 + Math.random() * 1.5 : (ev.tight ? 3.6 : 3) + Math.random() * (ev.tight ? 4 : 3);
          const r = size * 0.42;
          let s = 0;
          let x = 0;
          let y = 0;
          for (let tries = 0; tries < 12; tries++) {
            s = ev.at + Math.random() * ev.len;
            x = (Math.random() * 2 - 1) * (BOX.x + 2);
            y = (Math.random() * 2 - 1) * (BOX.y + 1.5);
            if (placed.every((p) => Math.abs(p.s - s) > p.r + r + 3 || Math.hypot(p.x - x, p.y - y) > p.r + r + 2.6)) break;
          }
          placed.push({ s, x, y, r });
          const e = blankEnemy(crystal ? "crystal" : "rock");
          e.s = s;
          e.x = x;
          e.y = y;
          e.size = size;
          e.radius = r;
          e.hp = e.maxHp = crystal ? 5 : Math.ceil(size / 2.2);
          e.score = crystal ? 300 : 50;
          e.collide = crystal ? 22 : 12 + Math.round(size * 2);
          e.vx = (Math.random() - 0.5) * 1.2;
          e.vy = (Math.random() - 0.5) * 1.2;
          e.inst = true;
          e.key = crystal ? CRYSTAL_KEYS[Math.floor(Math.random() * 2)] : keys[Math.floor(Math.random() * keys.length)];
          e.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.4 + Math.random() * 0.9);
          e.rot.setFromEuler(tmpE.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
          e.noHit = !crystal;
          if (crystal) {
            e.drop = Math.random() < 0.5 ? "ring" : null;
            e.glow = GREEN;
            e.glowSize = 2.4;
          }
          this.add(e);
        }
        break;
      }
      case "meteors": {
        const keys = [M.meteorDetailed, M.meteor].filter((k) => this.rocks.has(k));
        if (!keys.length) break;
        ctx.sfx.alert();
        for (let i = 0; i < ev.count; i++) {
          const e = blankEnemy("meteor");
          const arrive = ev.at + i * 18;
          const T = Math.max(1.5, (arrive - ctx.s) / Math.max(10, ctx.speed));
          e.s = arrive;
          e.vx = -ev.side * (20 + Math.random() * 8);
          const crossX = (Math.random() * 2 - 1) * BOX.x * 0.9;
          e.x = crossX - e.vx * T;
          e.y = (Math.random() * 2 - 1) * BOX.y * 0.9;
          e.vy = (Math.random() - 0.5) * 3;
          e.y -= e.vy * T;
          e.size = 3.2 + Math.random() * 1.6;
          e.radius = e.size * 0.45;
          e.hp = e.maxHp = 2;
          e.score = 120;
          e.collide = 18;
          e.inst = true;
          e.key = keys[i % keys.length];
          e.spin.set(Math.random(), Math.random(), Math.random()).normalize().multiplyScalar(2.5);
          e.glow = ORANGE;
          e.glowSize = 3.5;
          this.add(e);
        }
        break;
      }
      case "mines": {
        for (let i = 0; i < ev.count; i++) {
          const e = blankEnemy("mine");
          const a = (i / ev.count) * Math.PI * 2 + Math.random() * 0.5;
          e.s = ev.at + i * 14 + Math.random() * 6;
          e.x = ev.x + Math.cos(a) * (2.5 + Math.random() * 4.5);
          e.y = ev.y + Math.sin(a) * (1.5 + Math.random() * 2.6);
          e.hp = e.maxHp = 1;
          e.score = 80;
          e.radius = 1.7;
          e.collide = 14;
          e.glow = RED;
          e.glowSize = 1.4;
          e.hold = Math.random() * 6;
          this.attach(e, M.drone);
          this.add(e);
        }
        break;
      }
      case "satellite": {
        const e = blankEnemy("satellite");
        e.s = ev.at;
        e.x = ev.x;
        e.y = ev.y;
        e.size = ev.size;
        e.radius = ev.size * 0.42;
        e.hp = e.maxHp = 6;
        e.score = 300;
        e.collide = 22;
        e.vx = (Math.random() - 0.5) * 1.6;
        e.vy = (Math.random() - 0.5) * 1.2;
        e.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.35);
        e.rot.setFromEuler(tmpE.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
        this.attach(e, ev.model);
        this.add(e);
        break;
      }
      case "wallTurret": {
        const floor = ev.y < 0;
        this.turret(ev.at, floor ? ev.side * 9 : ev.side * (TRENCH.halfWidth - 0.4), floor ? TRENCH.floor : TRENCH.wallTop, floor ? M.turretDouble : M.turretSingle);
        break;
      }
      default:
        break;
    }
  }

  /** A turret standing on something at rail position (s, x, y). */
  turret(s: number, x: number, y: number, key: string) {
    const e = blankEnemy("turret");
    e.s = s;
    e.x = x;
    e.y = y;
    e.hp = e.maxHp = 4;
    e.score = 250;
    e.radius = 2.2;
    e.collide = 16;
    e.fireT = 1 + Math.random() * 1.5;
    this.attach(e, key);
    e.head = e.obj?.getObjectByName("turret") ?? null;
    this.add(e);
    return e;
  }

  private initPattern(e: Enemy) {
    const n = e.count;
    const mid = (n - 1) / 2;
    const i = e.index;
    switch (e.pattern) {
      case "swoop":
        e.t = -i * 0.32;
        break;
      case "line":
        e.t = 0;
        e.x0 += (i - mid) * 4.4;
        break;
      case "vee":
        e.t = 0;
        e.x0 += (i - mid) * 3.6;
        e.hold = Math.abs(i - mid) * 7;
        break;
      case "hover":
        e.t = -i * 0.5;
        e.x0 += n > 1 ? (i - mid) * 7 : 0;
        e.hold = e.hold || 6.5 + i * 0.8;
        break;
      case "chase":
        e.t = -i * 0.45;
        e.yaw = 0;
        break;
      case "dive":
        e.t = -i * 0.7;
        e.x0 += (i - mid) * 5;
        break;
      case "orbit":
        e.t = 0;
        e.hold = 9;
        break;
      default:
        break;
    }
    e.d = 400; // off-screen until its pattern places it
  }

  // --- Update -----------------------------------------------------------------------------------

  update(dt: number) {
    const { ctx } = this;
    for (const e of this.list) {
      if (!e.alive) continue;
      e.prevX = e.x;
      e.prevY = e.y;
      e.t += dt;
      if (e.flash > 0) {
        e.flash -= dt;
        if (e.flash <= 0 && e.obj) this.flash.set(e.obj, false);
      }
      if (e.boss) continue;
      if (e.rel) this.movePattern(e, dt);
      else this.moveFixed(e, dt);
      if (!e.alive) continue;
      if (e.rel) e.s = ctx.s + e.d;
      ctx.rail.frame(e.s, f);
      e.pos.copy(f.pos).addScaledVector(f.right, e.x).addScaledVector(f.up, e.y);
      this.orient(e, dt);
      this.updateFire(e, dt);
      // Gone past the player: recycle.
      if (e.s < ctx.s - 30 || (e.rel && (e.d > 420 || e.d < -40))) this.remove(e);
    }
    // Drop dead entries now and then.
    if (this.list.length > 40 && this.list.some((e) => !e.alive)) {
      for (let i = this.list.length - 1; i >= 0; i--) if (!this.list[i].alive) this.list.splice(i, 1);
    }
  }

  private movePattern(e: Enemy, dt: number) {
    const { ctx } = this;
    if (e.t < 0) {
      e.d = 400;
      return;
    }
    const t = e.t;
    const i = e.index;
    switch (e.pattern) {
      case "swoop": {
        const T = 4.2;
        const u = t / T;
        if (u <= 1) {
          e.d = 175 - 135 * smooth(u);
          e.x = e.x0 + e.side * 24 * Math.cos(Math.PI * u);
          e.y = e.y0 + 6 * Math.sin(Math.PI * u) - 2;
        } else {
          e.d -= 55 * dt;
          e.y += 14 * dt * Math.min(1, u - 1);
          e.x -= e.side * 16 * dt;
        }
        e.yaw = Math.PI;
        break;
      }
      case "line":
      case "vee": {
        e.d = 240 + e.hold - 40 * t;
        e.x = e.x0 + Math.sin(t * 1.6 + i) * 0.8;
        e.y = e.y0 + Math.sin(t * 2.1 + i * 0.7) * 1.2;
        e.yaw = Math.PI;
        break;
      }
      case "hover": {
        const enter = 2.6;
        const exitAt = enter + e.hold;
        const target = e.ship === "cargo" || e.ship === "miner" ? 75 : 62;
        if (t < enter) e.d = 210 - (210 - target) * smooth(t / enter);
        else if (t < exitAt) e.d = target + Math.sin(t * 0.7 + i) * 6;
        else {
          e.d += 45 * dt * Math.min(1, (t - exitAt) * 1.5);
          e.y += 10 * dt;
        }
        const w = e.ship === "cargo" ? 0.35 : 0.8;
        e.x = e.x0 + Math.sin(t * w + i * 1.7) * (e.ship === "cargo" ? 5 : 4.5);
        e.y = (t < exitAt ? e.y0 : e.y) + (t < exitAt ? Math.cos(t * w * 1.4 + i) * 2.4 : 0);
        e.yaw = Math.PI;
        break;
      }
      case "chase": {
        if (e.hold === 0) {
          // Overtake from behind, then turn round and fight.
          if (e.d > 300) e.d = -30 - i * 6;
          e.d += 48 * dt;
          e.x = e.side * (5 + i * 2.5) * (1 - smooth((e.d + 30) / 80) * 0.6);
          e.y = e.y0 + 4 - smooth((e.d + 30) / 80) * 4 + (i % 2) * 2;
          e.yaw = 0;
          if (e.d >= 62 + i * 9) {
            e.hold = 1;
            e.t = 2.6; // skip the hover entry
            e.x0 = e.x;
            e.y0 = e.y;
            e.pattern = "hover";
            e.hold = 5 + i;
          }
        }
        break;
      }
      case "dive": {
        if (!e.armed) {
          e.armed = true;
          e.target.set(ctx.px, ctx.py);
          e.d = 170;
          e.x = e.x0 + e.side * 6;
          e.y = 20;
        }
        if (t < 1.2) e.target.set(ctx.px, ctx.py);
        e.d -= 52 * dt;
        const k = 1 - Math.exp(-1.6 * dt);
        e.x += (e.target.x - e.x) * k;
        e.y += (e.target.y - e.y) * k;
        e.yaw = Math.PI;
        e.charge = Math.max(e.charge, 0.05); // red glow: incoming
        break;
      }
      case "orbit": {
        const a = t * 1.3 + (i / e.count) * Math.PI * 2;
        const R = 6 + Math.sin(t * 0.7) * 1.5;
        if (t < e.hold) e.d = Math.max(78, 200 - t * 70);
        else e.d += 50 * dt;
        e.x = e.x0 + Math.cos(a) * R;
        e.y = e.y0 + Math.sin(a) * R * 0.6;
        e.yaw = Math.PI;
        break;
      }
      default:
        if (e.kind === "boulder") {
          // Boss projectiles: close in, steering towards where the player was.
          e.d -= e.vx * dt;
          if (e.d > 14) e.target.set(ctx.px, ctx.py);
          const k = 1 - Math.exp(-e.vy * dt);
          e.x += (e.target.x - e.x) * k;
          e.y += (e.target.y - e.y) * k;
          tmpQ.setFromAxisAngle(tmpV.copy(e.spin).normalize(), e.spin.length() * dt);
          e.rot.premultiply(tmpQ);
        }
        break;
    }
  }

  private moveFixed(e: Enemy, dt: number) {
    const { ctx } = this;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.spin.lengthSq() > 0) {
      tmpQ.setFromAxisAngle(tmpV.copy(e.spin).normalize(), e.spin.length() * dt);
      e.rot.premultiply(tmpQ);
    }
    if (e.kind === "mine") {
      const ahead = e.s - ctx.s;
      e.y += Math.sin(ctx.time * 2 + e.hold) * 0.6 * dt;
      if (!e.armed && ahead < 55 && ahead > 0) {
        e.armed = true;
      }
      if (e.armed) {
        // Drift towards the player as it closes in.
        const k = 1 - Math.exp(-0.9 * dt);
        e.x += (ctx.px - e.x) * k;
        e.y += (ctx.py - e.y) * k;
      }
    }
  }

  private orient(e: Enemy, dt: number) {
    const obj = e.obj;
    if (e.inst) return;
    if (!obj) return;
    obj.position.copy(e.pos);
    if (e.kind === "satellite" || e.ship === "cargo" || e.ship === "miner") obj.visible = e.s > this.ctx.s - 1.5;
    if (e.kind === "ship") {
      const vx = dt > 0 ? (e.x - e.prevX) / dt : 0;
      const vy = dt > 0 ? (e.y - e.prevY) / dt : 0;
      const dir = e.yaw > 1.5 ? -1 : 1;
      e.bank = damp(e.bank, clamp(vx * 0.05 * dir, -0.9, 0.9), 6, dt);
      tmpE.set(clamp(vy * 0.03, -0.4, 0.4) * dir, e.yaw, -e.bank * (e.ship === "cargo" ? 0.3 : 1));
      obj.quaternion.copy(f.quat).multiply(tmpQ.setFromEuler(tmpE));
    } else if (e.kind === "turret") {
      obj.quaternion.copy(f.quat);
      // Hanging turrets are upside down.
      if (e.bank) obj.quaternion.multiply(tmpQ.setFromAxisAngle(tmpV.set(0, 0, 1), e.bank));
      if (e.head) {
        // Aim the head at the player (yaw in the turret's frame).
        tmpV.copy(this.ctx.player).sub(e.pos);
        tmpQ.copy(obj.quaternion).invert();
        tmpV.applyQuaternion(tmpQ);
        // The barrels point down -Z.
        e.head.rotation.y = Math.atan2(-tmpV.x, -tmpV.z);
      }
    } else if (e.kind === "mine") {
      obj.quaternion.copy(f.quat).multiply(tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), this.ctx.time * 1.5 + e.hold));
    } else {
      obj.quaternion.copy(f.quat).multiply(e.rot);
      if (e.kind === "satellite") obj.scale.setScalar(e.size);
    }
  }

  private updateFire(e: Enemy, dt: number) {
    const { ctx } = this;
    const ahead = e.s - ctx.s;
    let rate = 0;
    let burst = 1;
    if (e.kind === "ship" && e.ship) {
      rate = SHIPS[e.ship].fire;
      burst = SHIPS[e.ship].burst;
      if (e.pattern === "dive" || (e.pattern === "chase" && e.hold === 0)) rate = 0;
    } else if (e.kind === "turret") {
      rate = 2.3;
      burst = 1;
    }
    if (!rate) return;
    const inRange = ahead > 22 && ahead < 150;
    if (e.charge > 0) {
      e.charge -= dt;
      if (e.charge <= 0) {
        e.charge = 0;
        if (inRange) this.shoot(e, burst);
      }
      return;
    }
    if (!inRange) return;
    const difficulty = 1 + ctx.stage * 0.18;
    e.fireT -= dt * difficulty;
    if (e.fireT <= 0) {
      e.fireT = rate * (0.8 + Math.random() * 0.5);
      if (ctx.bolts() < 10 + ctx.stage * 4) e.charge = 0.5;
    }
  }

  private shoot(e: Enemy, burst: number) {
    const { ctx } = this;
    const speed = 50 + ctx.stage * 6;
    if (e.ship === "miner") {
      // Fan of bolts.
      for (let k = 0; k < burst; k++) ctx.fire(e.pos, { speed: speed * 0.85, spread: (k - (burst - 1) / 2) * 0.12, lead: false });
    } else if (burst === 1) ctx.fire(e.pos, { speed, lead: true });
    else for (let k = 0; k < burst; k++) ctx.fire(e.pos, { speed: speed * (1 - k * 0.08), spread: (k - (burst - 1) / 2) * 0.05, lead: true });
    ctx.sfx.enemyShot();
  }

  // --- Rendering extras -------------------------------------------------------------------------

  /** Instanced rocks, telegraph glows, weak-point glows. Call after update. */
  render() {
    const { ctx } = this;
    for (const inst of this.rocks.values()) inst.begin();
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.inst) {
        const inst = this.rocks.get(e.key);
        // Big rocks the ship has just passed would fill the chase camera's view.
        if (inst && (e.s > ctx.s - 1 || e.size < 4.5)) {
          ctx.rail.frame(e.s, f);
          tmpQ.copy(f.quat).multiply(e.rot);
          tmpS.setScalar(e.size);
          tmpM.compose(e.pos, tmpQ, tmpS);
          inst.add(tmpM, e.flash > 0 ? FLASH : e.kind === "meteor" ? ROCK_COLOR : undefined);
        }
      }
      if (e.charge > 0 && !e.boss) {
        const k = e.pattern === "dive" ? 0.6 + Math.sin(ctx.time * 30) * 0.4 : 1 - e.charge / 0.5;
        ctx.glows.add(e.pos, RED, 2 + k * 3.5, 0.5 + k * 1.2);
      }
      if (e.glow && !e.boss) {
        const pulse = e.kind === "mine" ? (e.armed ? 0.5 + Math.sin(ctx.time * 22) * 0.5 : 0.4 + Math.sin(ctx.time * 3 + e.hold) * 0.3) : 0.7 + Math.sin(ctx.time * 4 + e.id) * 0.25;
        if (e.kind === "meteor") {
          ctx.glows.add(e.pos, e.glow, e.size * 1.2, 0.5);
          if (Math.random() < 0.6) ctx.particles.emit(e.pos, -e.vx * 0.3, 0, 0, ORANGE, e.size * 0.6, 0.5, 1, 1.5);
        } else ctx.glows.add(e.pos, e.glow, e.glowSize * (e.kind === "ship" ? 1.4 : 1), pulse);
      }
    }
    for (const inst of this.rocks.values()) inst.end();
  }

  // --- Combat -----------------------------------------------------------------------------------

  /** First enemy a segment a→b passes through (within its radius + pad). */
  hitSegment(a: THREE.Vector3, b: THREE.Vector3, pad: number): Enemy | null {
    let best: Enemy | null = null;
    let bestT = Infinity;
    tmpV.subVectors(b, a);
    const len2 = tmpV.lengthSq();
    for (const e of this.list) {
      if (!e.alive || e.d > 380) continue;
      tmpV2.subVectors(e.pos, a);
      let t = len2 > 0 ? tmpV2.dot(tmpV) / len2 : 0;
      t = clamp(t, 0, 1);
      const dx = a.x + tmpV.x * t - e.pos.x;
      const dy = a.y + tmpV.y * t - e.pos.y;
      const dz = a.z + tmpV.z * t - e.pos.z;
      const r = e.radius + pad;
      if (dx * dx + dy * dy + dz * dz < r * r && t < bestT) {
        bestT = t;
        best = e;
      }
    }
    return best;
  }

  /** Damages an enemy; returns true if it died. */
  damage(e: Enemy, amount: number, at: THREE.Vector3, byPlayer = true): boolean {
    const { ctx } = this;
    if (!e.alive) return false;
    if (e.armored) {
      ctx.particles.burst(at, 5, 14, WHITE, 0.5, 0.25);
      ctx.sfx.ping();
      return false;
    }
    e.hp -= amount;
    if (e.obj) {
      this.flash.set(e.obj, true);
      e.flash = 0.07;
    } else e.flash = 0.07;
    if (e.hp <= 0) {
      this.kill(e, byPlayer);
      return true;
    }
    ctx.particles.burst(at, 6, 12, ORANGE, 0.6, 0.3);
    ctx.sfx.hit();
    return false;
  }

  kill(e: Enemy, byPlayer: boolean) {
    const { ctx } = this;
    if (!e.alive) return;
    const big = e.kind === "satellite" || e.ship === "cargo" || e.ship === "miner" || e.ship === "gunship" || e.kind === "crystal";
    const size = e.kind === "rock" || e.kind === "meteor" ? e.size * 0.9 : big ? 6 : e.boss ? 5 : 3.2;
    ctx.explode(e.pos, size, e.kind === "crystal" ? GREEN : e.kind === "rock" ? ROCK_COLOR : undefined);
    if (e.kind === "rock" || e.kind === "meteor" || e.kind === "crystal") {
      // Rock shards.
      ctx.particles.burst(e.pos, 14, 18, e.kind === "crystal" ? GREEN : ROCK_COLOR, 0.9, 0.9, ctx.railVel, 1.2);
    }
    ctx.sfx.explosion(big ? 1 : 0);
    if (e.drop && byPlayer) this.onDrop(e.drop, e);
    this.onKill({ enemy: e, byPlayer });
    this.remove(e);
  }

  remove(e: Enemy) {
    e.alive = false;
    e.locked = false;
    if (e.obj) {
      this.flash.set(e.obj, false);
      if (e.boss) e.obj.removeFromParent();
      else this.ctx.pool.release(e.key, e.obj);
      e.obj = null;
    }
  }

  clear() {
    for (const e of this.list) if (e.alive) this.remove(e);
    this.list.length = 0;
  }

  /** Enemy bodies the player can fly into. */
  forEachAlive(fn: (e: Enemy) => void) {
    for (const e of this.list) if (e.alive) fn(e);
  }

  dispose() {
    this.flash.dispose();
    for (const inst of this.rocks.values()) inst.dispose();
  }
}

/** Decorative instanced asteroid field around the rail (no collisions). */
export class RockField {
  private readonly inst: Instancer[] = [];
  private readonly rot = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly fr = newFrame();
  readonly group = new THREE.Group();

  constructor(protos: Map<string, Proto>, keys: readonly string[]) {
    for (const k of keys) {
      const proto = protos.get(k);
      if (!proto) continue;
      const i = new Instancer(proto, 160);
      this.inst.push(i);
      this.group.add(i.group);
    }
  }

  /** Fills the field for rail distances [s0, s1]: a slot every 9 m, deterministic per slot. */
  update(rail: Rail, s0: number, s1: number, time: number, density = 1) {
    if (!this.inst.length) return;
    for (const i of this.inst) i.begin();
    const step = 9;
    for (let slot = Math.floor(s0 / step); slot * step < s1; slot++) {
      for (let k = 0; k < 3; k++) {
        const h = hash(slot, k);
        if (h > 0.42 * density) continue;
        const s = slot * step + hash(slot, k + 10) * step;
        const side = hash(slot, k + 20) < 0.5 ? -1 : 1;
        const dist = 42 + Math.pow(hash(slot, k + 30), 1.3) * 170;
        const x = side * dist;
        const y = (hash(slot, k + 40) - 0.5) * 2 * (18 + dist * 0.5);
        const size = 3 + Math.pow(hash(slot, k + 50), 2.5) * 34 * (0.25 + dist / 200);
        rail.frame(s, this.fr);
        this.p.copy(this.fr.pos).addScaledVector(this.fr.right, x).addScaledVector(this.fr.up, y);
        const spin = (hash(slot, k + 60) - 0.5) * 0.5;
        this.e.set(hash(slot, k + 70) * 6 + time * spin, hash(slot, k + 80) * 6 + time * spin * 0.7, hash(slot, k + 90) * 6);
        this.rot.setFromEuler(this.e);
        this.sc.setScalar(size);
        this.m.compose(this.p, this.rot, this.sc);
        this.inst[Math.floor(hash(slot, k + 100) * this.inst.length)].add(this.m);
      }
    }
    for (const i of this.inst) i.end();
  }

  dispose() {
    for (const i of this.inst) i.dispose();
  }
}
