import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { Animator, angleDiff, damp, turnTowards, yawTo } from "./anim";
import type { Sfx } from "./audio";
import { HealthBar, type Decal, type Decals, type Particles } from "./fx";
import type { EnemyKind, Room } from "./level";

/** Skeleton enemies: what each kind can do, and how it thinks. */

export type AttackKind = "melee" | "bolt" | "leap" | "spin" | "summon" | "nova";

export interface AttackDef {
  id: string;
  kind: AttackKind;
  clip: string;
  /** Telegraph time before the strike lands. */
  windup: number;
  /** Clip time at which the strike lands (the clip is slowed/sped so this meets the end of the wind-up). */
  contact: number;
  /** Clip time to start from. */
  from?: number;
  /** Seconds of follow-through after the strike. */
  recover: number;
  range: number;
  /** Half-angle of the hit sector (π = all around). */
  arc: number;
  /** Multiplier of the enemy's base damage. */
  damage: number;
  knock: number;
  blockable: boolean;
  cooldown: number;
  minDist?: number;
  maxDist?: number;
  weight: number;
  /** Heavy hits warn with a sound. */
  heavy?: boolean;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  /** Knockback taken is divided by this. */
  mass: number;
  scale: number;
  height: number;
  turn: number;
  coins: [number, number];
  run: string;
  walk: string;
  idle: string;
  /** Interrupted by normal hits while winding up? */
  armored: boolean;
  blockChance: number;
  attacks: AttackDef[];
}

const MINION_CHOP: AttackDef = { id: "chop", kind: "melee", clip: "1H_Melee_Attack_Chop", windup: 0.62, contact: 0.66, from: 0.05, recover: 0.5, range: 2.4, arc: 0.85, damage: 1, knock: 3, blockable: true, cooldown: 0.95, weight: 1 };
const MINION_SLICE: AttackDef = { id: "slice", kind: "melee", clip: "1H_Melee_Attack_Slice_Diagonal", windup: 0.55, contact: 0.47, from: 0.08, recover: 0.45, range: 2.3, arc: 1.05, damage: 1, knock: 3, blockable: true, cooldown: 0.9, weight: 1 };

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  minion: {
    kind: "minion",
    name: "Skeleton",
    hp: 58,
    speed: 4.5,
    radius: 0.55,
    damage: 14,
    mass: 1,
    scale: 1,
    height: 2.5,
    turn: 7,
    coins: [1, 2],
    run: "Running_A",
    walk: "Walking_D_Skeletons",
    idle: "Idle_Combat",
    armored: false,
    blockChance: 0,
    attacks: [MINION_CHOP, MINION_SLICE],
  },
  warrior: {
    kind: "warrior",
    name: "Skeleton Warrior",
    hp: 210,
    speed: 3.1,
    radius: 0.72,
    damage: 25,
    mass: 3,
    scale: 1.08,
    height: 2.9,
    turn: 4.5,
    coins: [3, 5],
    run: "Running_A",
    walk: "Walking_D_Skeletons",
    idle: "Idle_Combat",
    armored: true,
    blockChance: 0.55,
    attacks: [
      { id: "heavy", kind: "melee", clip: "2H_Melee_Attack_Chop", windup: 0.95, contact: 0.86, from: 0.1, recover: 0.75, range: 2.9, arc: 0.7, damage: 1, knock: 6, blockable: true, cooldown: 1.6, weight: 2, heavy: true, maxDist: 3.2 },
      { id: "leap", kind: "leap", clip: "1H_Melee_Attack_Jump_Chop", windup: 0.95, contact: 0.78, recover: 0.7, range: 2.3, arc: Math.PI, damage: 1.15, knock: 8, blockable: true, cooldown: 3.8, weight: 1.4, heavy: true, minDist: 4.2, maxDist: 8.5 },
    ],
  },
  mage: {
    kind: "mage",
    name: "Skeleton Mage",
    hp: 70,
    speed: 3.1,
    radius: 0.55,
    damage: 17,
    mass: 1,
    scale: 1,
    height: 2.8,
    turn: 6,
    coins: [2, 3],
    run: "Running_A",
    walk: "Walking_D_Skeletons",
    idle: "Idle_Combat",
    armored: false,
    blockChance: 0,
    attacks: [{ id: "bolt", kind: "bolt", clip: "Spellcasting", windup: 0.95, contact: 0.2, recover: 0.6, range: 14, arc: 0.3, damage: 1, knock: 3, blockable: true, cooldown: 2.6, weight: 1 }],
  },
  rogue: {
    kind: "rogue",
    name: "Skeleton Rogue",
    hp: 46,
    speed: 6,
    radius: 0.5,
    damage: 11,
    mass: 0.8,
    scale: 0.96,
    height: 2.4,
    turn: 9,
    coins: [2, 3],
    run: "Running_A",
    walk: "Walking_D_Skeletons",
    idle: "Idle_Combat",
    armored: false,
    blockChance: 0,
    attacks: [
      { id: "stab", kind: "melee", clip: "1H_Melee_Attack_Stab", windup: 0.45, contact: 0.41, from: 0.08, recover: 0.4, range: 2.3, arc: 0.7, damage: 1, knock: 2.5, blockable: true, cooldown: 0.7, weight: 2 },
      { id: "pounce", kind: "leap", clip: "1H_Melee_Attack_Jump_Chop", windup: 0.75, contact: 0.78, recover: 0.55, range: 2, arc: Math.PI, damage: 1.1, knock: 5, blockable: true, cooldown: 3.2, weight: 1, minDist: 3.5, maxDist: 7.5 },
    ],
  },
  archer: {
    kind: "archer",
    name: "Skeleton Archer",
    hp: 64,
    speed: 3.4,
    radius: 0.5,
    damage: 15,
    mass: 1,
    scale: 0.96,
    height: 2.4,
    turn: 7,
    coins: [2, 4],
    run: "Running_A",
    walk: "Walking_D_Skeletons",
    idle: "Idle_Combat",
    armored: false,
    blockChance: 0,
    attacks: [{ id: "shot", kind: "bolt", clip: "1H_Ranged_Shoot", windup: 0.8, contact: 0.2, recover: 0.5, range: 15, arc: 0.3, damage: 1, knock: 3, blockable: true, cooldown: 2.2, weight: 1 }],
  },
  boss: {
    kind: "boss",
    name: "The Bone King",
    hp: 4800,
    speed: 3.2,
    radius: 1.25,
    damage: 32,
    mass: 30,
    scale: 1.8,
    height: 4.9,
    turn: 3.2,
    coins: [30, 40],
    run: "Running_A",
    walk: "Walking_D_Skeletons",
    idle: "Idle_Combat",
    armored: true,
    blockChance: 0,
    attacks: [
      { id: "cleave", kind: "melee", clip: "1H_Melee_Attack_Slice_Diagonal", windup: 0.85, contact: 0.47, from: 0.05, recover: 0.7, range: 4.6, arc: 1.25, damage: 1, knock: 9, blockable: true, cooldown: 1.0, weight: 3, heavy: true, maxDist: 4.6 },
      { id: "slam", kind: "leap", clip: "1H_Melee_Attack_Jump_Chop", windup: 1.15, contact: 0.78, recover: 0.95, range: 3.6, arc: Math.PI, damage: 1.4, knock: 12, blockable: false, cooldown: 1.4, weight: 2.2, heavy: true, minDist: 3.5, maxDist: 15 },
      { id: "spin", kind: "spin", clip: "2H_Melee_Attack_Spin", windup: 0.85, contact: 0.6, recover: 0.6, range: 4.2, arc: Math.PI, damage: 0.55, knock: 7, blockable: false, cooldown: 1.4, weight: 1.3, heavy: true, maxDist: 6 },
      { id: "summon", kind: "summon", clip: "Spellcast_Summon", windup: 1.2, contact: 1.17, recover: 1.4, range: 0, arc: Math.PI, damage: 0, knock: 0, blockable: false, cooldown: 2, weight: 1.2, minDist: 3 },
      { id: "nova", kind: "nova", clip: "Spellcast_Raise", windup: 1.0, contact: 1.1, recover: 0.8, range: 0, arc: Math.PI, damage: 0.6, knock: 3, blockable: true, cooldown: 1.6, weight: 1.1, minDist: 3 },
    ],
  },
};

export type EnemyState = "dormant" | "rise" | "chase" | "windup" | "strike" | "hurt" | "stun" | "block" | "roar" | "dead";

/** What an enemy can see and do in the world (implemented by the engine). */
export interface EnemyCtx {
  readonly sfx: Sfx;
  readonly room: Room;
  readonly enemies: readonly Enemy[];
  readonly sparks: Particles;
  readonly dust: Particles;
  readonly decals: Decals;
  readonly px: number;
  readonly pz: number;
  readonly playerDown: boolean;
  /** 0-based room number (enemies get tougher). */
  readonly depth: number;
  tokens: { melee: number; cast: number };
  meleeStrike(e: Enemy, atk: AttackDef): void;
  areaStrike(e: Enemy, x: number, z: number, radius: number, damage: number, knock: number, blockable: boolean): void;
  spawnBolt(e: Enemy, x: number, y: number, z: number, yaw: number, speed: number, damage: number): void;
  summon(kinds: EnemyKind[], near: { x: number; z: number }): void;
  shake(n: number): void;
  bossRoar(e: Enemy): void;
}

export interface EnemyAssets {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  right?: THREE.Object3D;
  left?: THREE.Object3D;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const EYE = { minion: "#7cf7ff", warrior: "#ffcf5a", mage: "#c58bff", boss: "#ff2346", rogue: "#5effa0", archer: "#ffb347" } as const;
const TINT = new THREE.Color();

export class Enemy {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly anim: Animator;
  readonly bar: HealthBar;
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private readonly eyes: THREE.MeshStandardMaterial[] = [];
  /** Bone colours before any world tint. */
  private readonly bone: THREE.Color[] = [];
  private readonly hand: THREE.Object3D | null;
  def: EnemyDef;
  active = false;
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  vx = 0;
  vz = 0;
  hp = 1;
  maxHp = 1;
  dmgMult = 1;
  state: EnemyState = "chase";
  t = 0;
  attack: AttackDef | null = null;
  struck = false;
  cooldown = 0;
  token: "melee" | "cast" | null = null;
  decal: Decal | null = null;
  flash = 0;
  stunFor = 0;
  /** Seconds before plain hits can stagger again. */
  staggerCd = 0;
  strafe = 1;
  think = 0;
  /** Swing id that last hit this enemy (one hit per swing). */
  lastSwing = -1;
  leap: { fx: number; fz: number; tx: number; tz: number } | null = null;
  spinTick = 0;
  phase2 = false;
  summonCd = 6;
  moveSpeed = 0;
  /** Seconds the eyes stay bright (telegraph). */
  glare = 0;
  riseDur = 2;
  /** Started its rising animation (risers wait underground first). */
  risen = false;
  private riseClip = "Spawn_Ground_Skeletons";
  sink = 0;
  wave = 0;
  private flashShown = -1;

  constructor(
    readonly kind: EnemyKind,
    assets: EnemyAssets,
    barMats: { bg: THREE.Material; lag: THREE.Material },
  ) {
    this.def = ENEMIES[kind];
    this.model = cloneSkinned(assets.scene);
    const handR = this.model.getObjectByName("handslot.r");
    const handL = this.model.getObjectByName("handslot.l");
    if (assets.right && handR) handR.add(assets.right.clone());
    if (assets.left && handL) handL.add(assets.left.clone());
    this.hand = handR ?? null;
    const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    this.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      let m = copies.get(src);
      if (!m) {
        m = src.clone();
        copies.set(src, m);
        if (src.name.toLowerCase().includes("glow")) {
          m.color.set(EYE[kind]);
          if ("emissive" in m) {
            m.emissive = new THREE.Color(EYE[kind]);
            m.emissiveIntensity = 1.4;
          }
          this.eyes.push(m);
        } else if ("emissive" in m) {
          this.mats.push(m);
          this.bone.push(m.color.clone());
        }
      }
      mesh.material = m;
    });
    this.root.add(this.model);
    this.root.scale.setScalar(this.def.scale);
    this.anim = new Animator(this.model, assets.clips);
    this.bar = new HealthBar(kind === "warrior" ? 1.5 : 1.1, kind === "boss" ? "#ff2346" : "#f43f5e", barMats);
  }

  /** A world's look: tints the bones (null = natural bone) and recolours the eyes (null = this kind's own). */
  dress(tint: string | null, eyes: string | null = null) {
    this.mats.forEach((m, i) => {
      m.color.copy(this.bone[i]);
      if (tint) m.color.multiply(TINT.set(tint));
    });
    const c = eyes ?? EYE[this.kind];
    for (const m of this.eyes) {
      m.color.set(c);
      m.emissive.set(c);
    }
  }

  get radius() {
    return this.def.radius;
  }

  get alive() {
    return this.active && this.state !== "dead";
  }

  /** Can be hit right now (not rising out of the floor). */
  get hittable() {
    return this.alive && this.state !== "rise" && this.state !== "dormant";
  }

  get topY() {
    return this.def.height + this.y;
  }

  handPosition(out: THREE.Vector3) {
    if (this.hand) {
      this.hand.getWorldPosition(out);
      return out;
    }
    return out.set(this.x, 1.6, this.z);
  }

  /** Puts a fresh enemy into the room. `depth` scales health and damage; risers wait `delay` seconds underground. */
  spawn(x: number, z: number, yaw: number, depth: number, mode: "rise" | "dormant" | "awake", delay = 0) {
    const hpScale = 1 + depth * 0.13;
    this.maxHp = Math.round(this.def.hp * (this.kind === "boss" ? 1 : hpScale));
    this.hp = this.maxHp;
    // The Bone King hits hard on his own terms; everything else scales with depth.
    this.dmgMult = this.kind === "boss" ? 1 : 1 + depth * 0.1;
    this.active = true;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.yaw = yaw;
    this.vx = 0;
    this.vz = 0;
    this.attack = null;
    this.token = null;
    this.decal = null;
    this.flash = 0;
    this.glare = 0;
    this.cooldown = rand(0.6, 1.4);
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.think = rand(0.5, 2);
    this.lastSwing = -1;
    this.staggerCd = 0;
    this.leap = null;
    this.phase2 = false;
    this.summonCd = 7;
    this.sink = 0;
    this.moveSpeed = 0;
    this.bar.reset();
    this.anim.stopAll();
    this.root.visible = true;
    if (mode === "dormant") {
      this.state = "dormant";
      this.anim.pose(this.kind === "boss" ? "Skeleton_Inactive_Standing_Pose" : "Skeletons_Inactive_Floor_Pose");
    } else if (mode === "rise") {
      // Held underground (the clip starts below the floor) until the delay runs out.
      this.state = "rise";
      this.risen = false;
      this.riseClip = "Spawn_Ground_Skeletons";
      this.t = -delay;
      this.riseDur = 2.0;
      this.anim.pose("Spawn_Ground_Skeletons", 0.25);
    } else {
      this.state = "chase";
      this.anim.play(this.def.idle, { fade: 0 });
    }
    this.sync();
  }

  /** Wakes a dormant skeleton (lying on the floor, or the boss standing still). */
  wake(delay = 0) {
    if (this.state !== "dormant") return;
    this.state = "rise";
    this.risen = false;
    this.riseClip = this.kind === "boss" ? "Skeletons_Awaken_Standing" : "Skeletons_Awaken_Floor";
    this.t = -delay;
    this.riseDur = this.kind === "boss" ? 1.4 : 2.0;
  }

  setFlash(v: number) {
    const f = Math.round(v * 20) / 20;
    if (f === this.flashShown) return;
    this.flashShown = f;
    const boss = this.kind === "boss";
    for (const m of this.mats) m.emissive.setRGB(f * 1.2 + (boss ? 0.08 : 0), f * 1.1, f * 1.0);
  }

  setGlare(v: number) {
    for (const m of this.eyes) if ("emissiveIntensity" in m) m.emissiveIntensity = 1.4 + v * 5;
  }

  sync() {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.yaw;
  }

  dispose() {
    this.mats.forEach((m) => m.dispose());
    this.eyes.forEach((m) => m.dispose());
    this.bar.dispose();
  }

  // --- AI ------------------------------------------------------------------------------------------

  private releaseToken(ctx: EnemyCtx) {
    if (this.token) ctx.tokens[this.token]++;
    this.token = null;
  }

  private clearTelegraph(ctx: EnemyCtx, fade = 0.12) {
    if (this.decal) ctx.decals.fade(this.decal, fade);
    this.decal = null;
  }

  /** Stops whatever it was doing (hit reactions, parries, death). */
  interrupt(ctx: EnemyCtx) {
    this.clearTelegraph(ctx);
    this.releaseToken(ctx);
    this.attack = null;
    this.leap = null;
    if (this.state !== "dead") this.y = 0;
    this.glare = 0;
    if (this.state === "windup" || this.state === "strike") this.toChase();
  }

  hurt(ctx: EnemyCtx, heavy: boolean) {
    if (this.state === "dead" || this.state === "stun") return;
    if (this.def.armored && !heavy && (this.state === "windup" || this.state === "strike")) return;
    if (this.kind === "boss") return;
    // Poise: right after a stagger, plain hits only flash, so combos can't lock a skeleton down forever.
    if (this.staggerCd > 0 && !heavy) return;
    this.staggerCd = 1.3;
    this.interrupt(ctx);
    this.state = "hurt";
    this.t = 0;
    this.anim.play(Math.random() < 0.5 ? "Hit_A" : "Hit_B", { once: true, fade: 0.05, speed: 1.3 });
  }

  block(ctx: EnemyCtx) {
    void ctx;
    this.state = "block";
    this.t = 0;
    this.anim.play("Block_Hit", { once: true, fade: 0.06, speed: 1.4 });
    this.cooldown = Math.min(this.cooldown, 0.25);
  }

  stun(ctx: EnemyCtx, seconds: number) {
    if (this.state === "dead") return;
    this.interrupt(ctx);
    this.state = "stun";
    this.t = 0;
    this.stunFor = seconds;
    this.anim.play("Hit_B", { once: true, fade: 0.05, speed: 0.8 });
  }

  die(ctx: EnemyCtx) {
    this.interrupt(ctx);
    this.state = "dead";
    this.t = 0;
    this.bar.group.visible = false;
    this.anim.play(Math.random() < 0.65 || this.kind === "boss" ? "Death_C_Skeletons" : "Death_A", { once: true, fade: 0.08, speed: this.kind === "boss" ? 0.8 : 1.15 });
  }

  /** Per frame. Returns false once the enemy has sunk into the floor and can be recycled. */
  update(ctx: EnemyCtx, dt: number): boolean {
    this.anim.update(dt);
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.staggerCd = Math.max(0, this.staggerCd - dt);
    this.glare = Math.max(0, this.glare - dt * 2);
    this.setFlash(this.flash);
    this.setGlare(this.state === "windup" ? 1 : this.glare);

    switch (this.state) {
      case "dormant":
        break;
      case "rise":
        if (this.t < 0) break;
        if (!this.risen) {
          this.risen = true;
          if (this.riseClip === "Spawn_Ground_Skeletons") this.anim.play(this.riseClip, { once: true, fade: 0, speed: 1.6, from: 0.25 });
          else this.anim.play(this.riseClip, { once: true, fade: 0.1, speed: this.kind === "boss" ? 0.75 : 1.2 });
        }
        if (this.t >= this.riseDur) {
          this.state = "chase";
          this.t = 0;
          this.anim.play(this.def.idle, { fade: 0.3 });
        }
        break;
      case "chase":
        this.updateChase(ctx, dt);
        break;
      case "windup":
        this.updateWindup(ctx, dt);
        break;
      case "strike":
        this.updateStrike(ctx, dt);
        break;
      case "hurt":
        if (this.t > 0.42) this.toChase();
        break;
      case "block":
        if (this.t > 0.45) this.toChase();
        break;
      case "stun":
        if (Math.random() < dt * 14) {
          const a = this.t * 9;
          ctx.sparks.emit({ x: this.x + Math.cos(a) * 0.5, y: this.topY + 0.1, z: this.z + Math.sin(a) * 0.5, vy: 0.4, life: 0.45, size: 0.22, color: "#ffe066", endColor: "#ff8a00" });
        }
        if (this.t > 0.6 && this.anim.name === "Hit_B") this.anim.play(this.def.idle, { fade: 0.3, speed: 0.5 });
        if (this.t > this.stunFor) this.toChase();
        break;
      case "roar":
        if (this.t > 1.25) {
          this.toChase();
          this.cooldown = 0.3;
        }
        break;
      case "dead":
        if (this.t > 1.5) {
          if (this.sink === 0) {
            ctx.dust.burst(10, this.x, 0.2, this.z, { speed: 1.6, up: 0.6, life: 1.1, size: 1.1, endSize: 2, color: "#6b5a4e", alpha: 0.5, drag: 2.5 });
          }
          this.sink += dt;
          this.y -= dt * (0.6 + this.sink * 1.4);
          if (this.y < -2.6 * this.def.scale) {
            this.active = false;
            this.root.visible = false;
            return false;
          }
        }
        break;
    }

    // Knockback slides along the floor.
    if (this.vx || this.vz) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      const k = Math.exp(-7 * dt);
      this.vx *= k;
      this.vz *= k;
      if (Math.abs(this.vx) + Math.abs(this.vz) < 0.02) this.vx = this.vz = 0;
    }
    if (this.state !== "dead" && this.state !== "dormant") this.collide(ctx);
    this.sync();
    return true;
  }

  private toChase() {
    this.state = "chase";
    this.t = 0;
    this.anim.play(this.def.idle, { fade: 0.2 });
  }

  /** Keeps out of walls, props and other skeletons. */
  private collide(ctx: EnemyCtx) {
    const r = this.radius;
    const { room } = ctx;
    for (const c of room.colliders) {
      const dx = this.x - c.x;
      const dz = this.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 1e-4) {
        this.x = c.x + (dx / d) * min;
        this.z = c.z + (dz / d) * min;
      }
    }
    for (const o of ctx.enemies) {
      if (o === this || !o.active || o.state === "dead" || o.state === "dormant") continue;
      const dx = this.x - o.x;
      const dz = this.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.radius + r;
      if (d < min && d > 1e-4) {
        const share = o.def.mass / (o.def.mass + this.def.mass);
        const push = (min - d) * share;
        this.x += (dx / d) * push;
        this.z += (dz / d) * push;
      }
    }
    this.x = THREE.MathUtils.clamp(this.x, -room.hw + r, room.hw - r);
    this.z = THREE.MathUtils.clamp(this.z, -room.hd + r, room.hd - r);
  }

  /** Steering direction towards (tx, tz) that slides around props. */
  private steer(ctx: EnemyCtx, dirX: number, dirZ: number, out: { x: number; z: number }) {
    let sx = dirX;
    let sz = dirZ;
    for (const c of ctx.room.colliders) {
      const dx = this.x - c.x;
      const dz = this.z - c.z;
      const d = Math.hypot(dx, dz);
      const reach = c.r + this.radius + 1.3;
      if (d > reach || d < 1e-4) continue;
      // Only props ahead matter; push sideways around them.
      if (-(dx * dirX + dz * dirZ) / d < -0.2) continue;
      const w = (1 - d / reach) * 1.6;
      const side = dx * dirZ - dz * dirX > 0 ? 1 : -1;
      sx += (dx / d) * w * 0.5 + dirZ * side * w;
      sz += (dz / d) * w * 0.5 - dirX * side * w;
    }
    for (const o of ctx.enemies) {
      if (o === this || !o.alive) continue;
      const dx = this.x - o.x;
      const dz = this.z - o.z;
      const d = Math.hypot(dx, dz);
      const reach = o.radius + this.radius + 0.9;
      if (d > reach || d < 1e-4) continue;
      const w = (1 - d / reach) * 1.2;
      sx += (dx / d) * w;
      sz += (dz / d) * w;
    }
    const l = Math.hypot(sx, sz) || 1;
    out.x = sx / l;
    out.z = sz / l;
    return out;
  }

  private readonly dir = { x: 0, z: 0 };

  private move(ctx: EnemyCtx, dirX: number, dirZ: number, speed: number, dt: number, face = true) {
    this.moveSpeed = damp(this.moveSpeed, speed, 8, dt);
    if (this.moveSpeed < 0.05) return;
    const d = this.steer(ctx, dirX, dirZ, this.dir);
    this.x += d.x * this.moveSpeed * dt;
    this.z += d.z * this.moveSpeed * dt;
    if (face) this.yaw = turnTowards(this.yaw, yawTo(d.x, d.z), this.def.turn, dt);
  }

  private locomotion(backwards = false) {
    const s = this.moveSpeed;
    if (s > 2.4) this.anim.play(this.def.run, { fade: 0.2, speed: Math.max(0.7, s / 4.6) });
    else if (s > 0.35) this.anim.play(backwards ? "Walking_Backwards" : this.def.walk, { fade: 0.25, speed: Math.max(0.6, s / 1.6) });
    else this.anim.play(this.def.idle, { fade: 0.3 });
  }

  private updateChase(ctx: EnemyCtx, dt: number) {
    if (ctx.playerDown) {
      this.moveSpeed = damp(this.moveSpeed, 0, 6, dt);
      this.locomotion();
      return;
    }
    const dx = ctx.px - this.x;
    const dz = ctx.pz - this.z;
    const dist = Math.hypot(dx, dz) || 1e-3;
    const nx = dx / dist;
    const nz = dz / dist;
    this.cooldown -= dt;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = rand(1.2, 2.6);
      if (Math.random() < 0.4) this.strafe = -this.strafe;
    }
    const speed = this.def.speed * (this.phase2 ? 1.2 : 1) * (1 + ctx.depth * 0.02);

    if (this.kind === "mage" || this.kind === "archer") {
      const want = this.cooldown <= 0 && ctx.tokens.cast > 0 && dist < 13;
      if (want) return this.begin(ctx, this.def.attacks[0]);
      let mx = 0;
      let mz = 0;
      let backwards = false;
      if (dist < 5.5) {
        mx = -nx + -nz * this.strafe * 0.4;
        mz = -nz + nx * this.strafe * 0.4;
        backwards = true;
      } else if (dist > 9.5) {
        mx = nx;
        mz = nz;
      } else {
        mx = -nz * this.strafe;
        mz = nx * this.strafe;
      }
      const sp = dist < 5.5 ? speed * 0.85 : dist > 9.5 ? speed : speed * 0.4;
      this.move(ctx, mx, mz, sp, dt, false);
      this.yaw = turnTowards(this.yaw, yawTo(nx, nz), this.def.turn, dt);
      this.locomotion(backwards);
      return;
    }

    if (this.kind === "boss") return this.bossThink(ctx, dt, dist, nx, nz, speed);

    // Melee: pick an attack that fits the distance; wait for a token so only a few swing at once.
    if (this.cooldown <= 0) {
      const options = this.def.attacks.filter((a) => dist <= (a.maxDist ?? a.range) && dist >= (a.minDist ?? 0));
      if (options.length && ctx.tokens.melee > 0) {
        const atk = this.weighted(options);
        if (Math.abs(angleDiff(this.yaw, yawTo(nx, nz))) < 0.9 || atk.kind === "leap") return this.begin(ctx, atk);
      }
    }
    const reach = this.def.attacks[0].range * 0.75;
    const waiting = ctx.tokens.melee <= 0 && !this.token;
    const ring = waiting ? 3.6 + (this.def.radius - 0.55) : reach;
    if (dist > ring + 0.4) {
      // Close in, curving a little to the side so a crowd fans out.
      const curve = Math.min(0.5, dist / 12) * this.strafe * 0.5;
      this.move(ctx, nx - nz * curve, nz + nx * curve, speed, dt);
    } else if (dist < ring - 0.8) {
      this.move(ctx, -nx, -nz, speed * 0.4, dt, false);
      this.yaw = turnTowards(this.yaw, yawTo(nx, nz), this.def.turn, dt);
    } else {
      // Circle at the edge, facing the knight.
      this.move(ctx, -nz * this.strafe, nx * this.strafe, waiting ? speed * 0.35 : speed * 0.2, dt, false);
      this.yaw = turnTowards(this.yaw, yawTo(nx, nz), this.def.turn, dt);
    }
    this.locomotion();
  }

  private weighted(list: AttackDef[]) {
    let r = Math.random() * list.reduce((n, a) => n + a.weight, 0);
    return list.find((a) => (r -= a.weight) < 0) ?? list[0];
  }

  private bossThink(ctx: EnemyCtx, dt: number, dist: number, nx: number, nz: number, speed: number) {
    this.summonCd -= dt;
    if (!this.phase2 && this.hp < this.maxHp * 0.5) {
      this.phase2 = true;
      this.state = "roar";
      this.t = 0;
      this.anim.play("Taunt", { once: true, fade: 0.15, speed: 0.85 });
      ctx.bossRoar(this);
      return;
    }
    if (this.cooldown <= 0) {
      const minions = ctx.enemies.filter((e) => e.alive && e.kind !== "boss").length;
      const options = this.def.attacks.filter((a) => {
        if (a.kind === "summon") return this.summonCd <= 0 && minions < 3;
        if (a.kind === "nova") return this.phase2;
        return dist <= (a.maxDist ?? a.range) && dist >= (a.minDist ?? 0);
      });
      if (options.length) {
        const atk = this.weighted(options);
        if (atk.kind !== "melee" || Math.abs(angleDiff(this.yaw, yawTo(nx, nz))) < 0.6) return this.begin(ctx, atk);
      }
    }
    if (dist > 3.4) this.move(ctx, nx, nz, speed, dt);
    else {
      this.moveSpeed = damp(this.moveSpeed, 0, 6, dt);
      this.yaw = turnTowards(this.yaw, yawTo(nx, nz), this.def.turn, dt);
    }
    this.locomotion();
  }

  private begin(ctx: EnemyCtx, atk: AttackDef) {
    this.state = "windup";
    this.t = 0;
    this.attack = atk;
    this.struck = false;
    this.moveSpeed = 0;
    if (this.kind !== "boss") {
      this.token = atk.kind === "bolt" ? "cast" : "melee";
      ctx.tokens[this.token]--;
    }
    const windup = atk.windup * (this.phase2 ? 0.82 : 1);
    const from = atk.from ?? 0;
    if (atk.kind === "bolt") {
      this.anim.play(this.kind === "archer" ? "1H_Ranged_Aiming" : "Spellcasting", { fade: 0.15, speed: 1 });
      ctx.sfx.charge();
    } else if (atk.kind === "summon" || atk.kind === "nova") {
      this.anim.play(atk.clip, { once: true, fade: 0.2, speed: 1 });
    } else {
      this.anim.play(atk.clip, { once: true, fade: 0.12, speed: Math.max(0.25, (atk.contact - from) / windup), from });
    }
    if (atk.heavy) ctx.sfx.warn();
    const color = atk.blockable ? "#ff2d55" : "#ff9a1f";
    if (atk.kind === "melee") {
      this.decal = ctx.decals.get().set("telegraph", this.x, this.z, atk.range, color, { yaw: this.yaw, arc: atk.arc });
    } else if (atk.kind === "leap") {
      // Land a little ahead of where the knight is heading.
      const dx = ctx.px - this.x;
      const dz = ctx.pz - this.z;
      const dist = Math.hypot(dx, dz) || 1;
      const go = Math.min(dist, (atk.maxDist ?? 8) + 1);
      const tx = THREE.MathUtils.clamp(this.x + (dx / dist) * go, -ctx.room.hw + 1.5, ctx.room.hw - 1.5);
      const tz = THREE.MathUtils.clamp(this.z + (dz / dist) * go, -ctx.room.hd + 1.5, ctx.room.hd - 1.5);
      this.leap = { fx: this.x, fz: this.z, tx, tz };
      this.yaw = yawTo(dx, dz);
      this.decal = ctx.decals.get().set("telegraph", tx, tz, atk.range, color, { arc: Math.PI });
    } else if (atk.kind === "spin") {
      this.decal = ctx.decals.get().set("telegraph", this.x, this.z, atk.range, color, { arc: Math.PI });
    } else if (atk.kind === "summon") {
      this.decal = ctx.decals.get().set("rune", this.x, this.z, 3.2, "#b06bff", { opacity: 0.9 });
    } else if (atk.kind === "nova") {
      this.decal = ctx.decals.get().set("rune", this.x, this.z, 4, "#ff3355", { opacity: 0.9 });
    }
  }

  private updateWindup(ctx: EnemyCtx, dt: number) {
    const atk = this.attack;
    if (!atk) return this.toChase();
    const windup = atk.windup * (this.phase2 ? 0.82 : 1);
    const k = Math.min(1, this.t / windup);
    const dx = ctx.px - this.x;
    const dz = ctx.pz - this.z;
    if (atk.kind === "melee" || atk.kind === "bolt" || atk.kind === "spin") {
      // Track the knight early in the wind-up, then commit.
      if (k < 0.6) this.yaw = turnTowards(this.yaw, yawTo(dx, dz), this.def.turn * (atk.kind === "bolt" ? 1.5 : 0.9), dt);
    }
    if (this.decal) {
      const u = this.decal.mat.uniforms;
      u.uProgress.value = k;
      if (atk.kind === "melee" || atk.kind === "spin") {
        this.decal.holder.position.set(this.x, 0.04, this.z);
        this.decal.holder.rotation.y = this.yaw;
      }
    }
    if (atk.kind === "bolt" && this.kind === "mage") {
      // A charging orb at the staff hand.
      const p = this.handPosition(TMP);
      if (Math.random() < dt * 40) ctx.sparks.emit({ x: p.x + rand(-0.3, 0.3), y: p.y + rand(-0.2, 0.4), z: p.z + rand(-0.3, 0.3), vx: 0, vy: 0.8, vz: 0, life: 0.35, size: 0.35 + k * 0.4, color: "#d8a6ff", endColor: "#6a2cff" });
      if (Math.random() < dt * 20) ctx.sparks.emit({ x: p.x, y: p.y + 0.15, z: p.z, life: 0.12, size: 0.6 + k * 0.9, color: "#e9c8ff", endColor: "#8b4dff" });
    }
    if (atk.kind === "leap" && this.leap && k > 0.42) {
      // Airborne: arc over to the landing spot.
      const j = Math.min(1, (k - 0.42) / 0.58);
      const e = j * j * (3 - 2 * j);
      this.x = this.leap.fx + (this.leap.tx - this.leap.fx) * e;
      this.z = this.leap.fz + (this.leap.tz - this.leap.fz) * e;
      this.y = Math.sin(j * Math.PI) * (this.kind === "boss" ? 2.4 : 1.4);
    }
    if (atk.kind === "summon" || atk.kind === "nova") {
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const r = rand(0.5, 3);
        ctx.sparks.emit({ x: this.x + Math.cos(a) * r, y: 0.2, z: this.z + Math.sin(a) * r, vy: rand(1.5, 3.5), life: 0.8, size: 0.4, color: atk.kind === "nova" ? "#ff6680" : "#c99bff", endColor: "#3a0a5e" });
      }
    }
    if (this.t >= windup) this.strike(ctx);
  }

  private strike(ctx: EnemyCtx) {
    const atk = this.attack;
    if (!atk) return this.toChase();
    this.state = "strike";
    this.t = 0;
    this.struck = true;
    if (this.decal) {
      this.decal.mat.uniforms.uProgress.value = 1;
      this.decal.mat.uniforms.uOpacity.value = 1.6;
    }
    if (atk.kind === "melee") {
      this.anim.speed = 1.15;
      ctx.meleeStrike(this, atk);
      this.clearTelegraph(ctx, 0.2);
    } else if (atk.kind === "leap") {
      this.y = 0;
      this.anim.speed = 1;
      if (this.leap) {
        this.x = this.leap.tx;
        this.z = this.leap.tz;
      }
      this.leap = null;
      ctx.areaStrike(this, this.x, this.z, atk.range, this.def.damage * atk.damage * this.dmgMult, atk.knock, atk.blockable);
      ctx.decals.wave(this.x, this.z, atk.range * 1.4, atk.blockable ? "#ff5a6e" : "#ffae42", 0.5);
      ctx.dust.burst(this.kind === "boss" ? 26 : 14, this.x, 0.2, this.z, { speed: this.kind === "boss" ? 7 : 4.5, up: 1, life: 0.9, size: 1.2, endSize: 2.4, color: "#7a6656", alpha: 0.55, drag: 3 });
      ctx.sfx.slam();
      ctx.shake(this.kind === "boss" ? 0.9 : 0.45);
      this.clearTelegraph(ctx, 0.25);
      if (this.kind === "boss" && this.phase2) {
        // Phase two: bone shards burst out of the impact.
        for (let i = 0; i < 8; i++) ctx.spawnBolt(this, this.x, 1.2, this.z, (i / 8) * Math.PI * 2 + this.yaw, 6, this.def.damage * 0.45);
      }
    } else if (atk.kind === "spin") {
      this.spinTick = 0;
      this.anim.play("2H_Melee_Attack_Spinning", { fade: 0.1, speed: 1.1 });
      ctx.sfx.spin();
    } else if (atk.kind === "bolt") {
      const archer = this.kind === "archer";
      this.anim.play(archer ? "1H_Ranged_Shoot" : "Spellcast_Shoot", { once: true, fade: 0.05, speed: 1.3, from: archer ? 0 : 0.12 });
      const p = this.handPosition(TMP);
      const dx = ctx.px - this.x;
      const dz = ctx.pz - this.z;
      const aim = yawTo(dx, dz);
      const dmg = this.def.damage * this.dmgMult;
      const speed = (archer ? 9 : 6.2) + ctx.depth * 0.15;
      ctx.spawnBolt(this, p.x, Math.max(1.2, p.y), p.z, aim, speed, dmg);
      if (ctx.depth >= 6 && !archer) {
        ctx.spawnBolt(this, p.x, Math.max(1.2, p.y), p.z, aim - 0.32, speed, dmg);
        ctx.spawnBolt(this, p.x, Math.max(1.2, p.y), p.z, aim + 0.32, speed, dmg);
      }
      ctx.sfx.bolt();
      this.clearTelegraph(ctx);
    } else if (atk.kind === "summon") {
      ctx.summon(this.phase2 ? ["minion", "minion", "mage"] : ["minion", "minion", "minion"], { x: this.x, z: this.z });
      this.summonCd = 14;
      this.clearTelegraph(ctx, 0.6);
    } else if (atk.kind === "nova") {
      const n = 12;
      for (let i = 0; i < n; i++) ctx.spawnBolt(this, this.x, 1.3, this.z, (i / n) * Math.PI * 2 + this.t, 5.2, this.def.damage * 0.5);
      ctx.sfx.bolt();
      ctx.shake(0.3);
      this.clearTelegraph(ctx, 0.3);
    }
  }

  private updateStrike(ctx: EnemyCtx, dt: number) {
    const atk = this.attack;
    if (!atk) return this.toChase();
    if (atk.kind === "spin") {
      // Spinning towards the knight, hitting everything close.
      const dur = 1.5;
      const dx = ctx.px - this.x;
      const dz = ctx.pz - this.z;
      const d = Math.hypot(dx, dz) || 1;
      this.move(ctx, dx / d, dz / d, 2.6, dt, false);
      this.spinTick -= dt;
      if (this.decal) this.decal.holder.position.set(this.x, 0.04, this.z);
      if (this.spinTick <= 0) {
        this.spinTick = 0.32;
        ctx.areaStrike(this, this.x, this.z, atk.range, this.def.damage * atk.damage * this.dmgMult, atk.knock, false);
      }
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2;
        ctx.dust.emit({ x: this.x + Math.cos(a) * atk.range * 0.8, y: 0.2, z: this.z + Math.sin(a) * atk.range * 0.8, vx: -Math.sin(a) * 4, vz: Math.cos(a) * 4, vy: 0.5, life: 0.5, size: 0.9, endSize: 1.6, color: "#7a6656", alpha: 0.45, drag: 3 });
      }
      if (this.t > dur) {
        this.clearTelegraph(ctx, 0.2);
        this.finishAttack(ctx, atk);
      }
      return;
    }
    if (this.t > atk.recover) this.finishAttack(ctx, atk);
  }

  private finishAttack(ctx: EnemyCtx, atk: AttackDef) {
    this.state = "chase";
    this.t = 0;
    this.releaseToken(ctx);
    this.cooldown = atk.cooldown * rand(0.85, 1.25) * (this.phase2 ? 0.7 : 1);
    this.attack = null;
    this.anim.play(this.def.idle, { fade: 0.25 });
  }
}

const TMP = new THREE.Vector3();
