import * as THREE from "three";
import type { Proto } from "../shared/assets";
import { Wake } from "./fx";
import { waveHeight } from "./ocean";

/** Ships: wind-driven sailing, floating on the waves, sails that reef and flags that stream downwind. */

export type ShipClass = "player" | "sloop" | "brig" | "frigate" | "ghost";
/** 1 = left (port), -1 = right (starboard). */
export type Side = 1 | -1;

export interface ShipStats {
  name: string;
  hp: number;
  /** Top speed (m/s) at full sail on a beam reach in a normal wind. */
  speed: number;
  /** Max turn rate (rad/s). */
  turn: number;
  /** Cannons per side. */
  guns: number;
  damage: number;
  reload: number;
  range: number;
  bounty: number;
  loot: number;
  scale: number;
}

export const ENEMY_STATS: Record<Exclude<ShipClass, "player">, ShipStats> = {
  sloop: { name: "Navy sloop", hp: 40, speed: 9.4, turn: 0.72, guns: 2, damage: 5, reload: 3.9, range: 44, bounty: 15, loot: 2, scale: 1 },
  brig: { name: "Navy brig", hp: 75, speed: 8.8, turn: 0.6, guns: 3, damage: 6, reload: 4.3, range: 48, bounty: 25, loot: 3, scale: 1 },
  frigate: { name: "Navy frigate", hp: 125, speed: 8.2, turn: 0.5, guns: 4, damage: 7, reload: 4.7, range: 52, bounty: 40, loot: 4, scale: 1 },
  ghost: { name: "The Drowned Queen", hp: 380, speed: 9.2, turn: 0.55, guns: 5, damage: 8, reload: 3.8, range: 54, bounty: 150, loot: 8, scale: 1.4 },
};

export const PLAYER_STATS: ShipStats = { name: "Your sloop", hp: 100, speed: 11.5, turn: 0.85, guns: 3, damage: 10, reload: 3.2, range: 46, bounty: 0, loot: 0, scale: 1 };

export interface DeckSlot {
  z: number;
  y: number;
}

export interface Wind {
  /** Direction the wind blows towards (yaw, same convention as ship headings). */
  angle: number;
  x: number;
  z: number;
  /** 0.7..1.2 */
  strength: number;
}

/** Sailing efficiency by angle off the wind (0 = straight into it, π = dead downwind). */
const POLAR: [number, number][] = [
  [0, 0.16],
  [0.55, 0.3],
  [0.95, 0.78],
  [1.57, 1],
  [2.2, 0.96],
  [2.75, 0.86],
  [Math.PI, 0.78],
];

export function polar(alpha: number) {
  for (let i = 1; i < POLAR.length; i++) {
    const [a1, v1] = POLAR[i];
    const [a0, v0] = POLAR[i - 1];
    if (alpha <= a1) {
      const t = (alpha - a0) / (a1 - a0);
      return v0 + (v1 - v0) * t * t * (3 - 2 * t);
    }
  }
  return POLAR[POLAR.length - 1][1];
}

export function pointOfSail(alpha: number) {
  if (alpha < 0.6) return "In irons";
  if (alpha < 1.15) return "Close-hauled";
  if (alpha < 2.0) return "Beam reach";
  if (alpha < 2.7) return "Broad reach";
  return "Running";
}

const WATERLINE = 0.95;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt));

interface SailRig {
  node: THREE.Object3D;
  y: number;
  top: number;
  scale: THREE.Vector3;
  /** Fore-and-aft sails (sailboats) swing round their mast with the wind. */
  boom: THREE.Object3D | null;
}

interface FlagRig {
  node: THREE.Object3D;
  base: number;
  phase: number;
}

let nextId = 1;

export class Ship {
  readonly id = nextId++;
  readonly root = new THREE.Group();
  /** Which pool the engine returns this ship to (its model key). */
  pool = "";
  readonly wake: Wake;
  model: THREE.Object3D | null = null;
  private materials: THREE.MeshStandardMaterial[] = [];
  private sails: SailRig[] = [];
  private flags: FlagRig[] = [];
  private emissiveBase = new THREE.Color(0, 0, 0);
  private deckGuns: THREE.Group | null = null;
  /** Containers / deck cargo that show as the hold fills (cargo ships). */
  private cargoNodes: THREE.Object3D[] = [];
  /** Deck cannon positions in model space (player ship only). */
  gunSlots: DeckSlot[] = [];
  /** Engines instead of sails: the wind doesn't matter. */
  steam = false;
  private waterline = WATERLINE;

  stats: ShipStats;
  kind: ShipClass;
  x = 0;
  z = 0;
  y = 0;
  heading = 0;
  speed = 0;
  yawRate = 0;
  pitch = 0;
  roll = 0;
  /** Sail level 0 (furled) … 3 (full). */
  sail = 2;
  sailVis = 2 / 3;
  /** Steering input -1 (left) … 1 (right) and the rudder that follows it. */
  steerIn = 0;
  steer = 0;
  /** Angle off the wind (0 = into it). */
  alpha = Math.PI / 2;
  hp = 100;
  maxHp = 100;
  length = 9;
  beam = 3.8;
  scale = 1;
  reload: Record<Side, number> = { 1: 0, [-1]: 0 } as Record<Side, number>;
  sinkT = -1;
  listSide = 1;
  hitFlash = 0;
  bumpCd = 0;
  lastHit = 0;
  /** Effect timers. */
  smokeT = 0;
  sprayT = 0;

  // AI
  aimT = -1;
  aimSide: Side = 1;
  side: Side = 1;
  sideTimer = 0;
  barrageT = 7;
  wander = 0;

  constructor(kind: ShipClass, stats: ShipStats, wakeMaterial: THREE.Material) {
    this.kind = kind;
    this.stats = stats;
    this.root.rotation.order = "YXZ";
    this.wake = new Wake(wakeMaterial);
  }

  /**
   * Swaps in a (new) ship model; materials are cloned so hit flashes stay per ship. `waterline` (model
   * units above the keel) and `beam` (metres) default to the Pirate Kit ships'.
   */
  setModel(proto: Proto, scale: number, tint?: THREE.Color, { waterline = WATERLINE, beam = 3.8 * scale, steam = false } = {}) {
    if (this.model) {
      this.root.remove(this.model);
      this.materials.forEach((m) => m.dispose());
    }
    const model = proto.object.clone();
    model.scale.setScalar(scale);
    model.position.y = -waterline * scale;
    this.waterline = waterline;
    this.steam = steam;
    this.materials = [];
    this.sails = [];
    this.flags = [];
    this.cargoNodes = [];
    const sails: THREE.Object3D[] = [];
    const cache = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const src = mesh.material as THREE.MeshStandardMaterial;
        let mat = cache.get(src);
        if (!mat) {
          mat = src.clone();
          if (tint) {
            mat.emissive.copy(tint);
            mat.emissiveIntensity = 1;
          }
          cache.set(src, mat);
          this.materials.push(mat);
        }
        mesh.material = mat;
        mesh.castShadow = true;
      }
      const name = o.name.toLowerCase();
      if (name.startsWith("sail")) sails.push(o);
      else if (name.startsWith("flag")) this.flags.push({ node: o, base: o.rotation.y, phase: Math.random() * 6 });
      else if (name.startsWith("cargo")) this.cargoNodes.push(o);
    });
    // Rigged after the walk: a swinging sail gets a new parent.
    this.sails = sails.map((o) => this.rig(o));
    this.emissiveBase.copy(tint ?? new THREE.Color(0, 0, 0));
    this.model = model;
    this.deckGuns = null;
    this.gunSlots = [];
    this.root.add(model);
    this.scale = scale;
    this.length = proto.size.z * scale * 0.92;
    this.beam = beam;
  }

  /** Shows the deck containers in proportion to how full the hold is (0..1). */
  setCargo(frac: number) {
    const n = this.cargoNodes.length;
    const show = frac <= 0 ? 0 : Math.max(1, Math.round(frac * n));
    this.cargoNodes.forEach((node, i) => (node.visible = i < show));
  }

  private rig(node: THREE.Object3D): SailRig {
    // Sails reef upwards: find the top edge in the parent's space.
    node.updateWorldMatrix(true, true);
    const inv = node.parent ? node.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
    const box = new THREE.Box3();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)));
    });
    let boom: THREE.Object3D | null = null;
    const size = box.getSize(new THREE.Vector3());
    if (!box.isEmpty() && node.parent && size.x < size.z * 0.4) {
      // A fore-and-aft sail: hang it from its mast (the highest point of the rig) so it can swing.
      const mast = new THREE.Vector3();
      const v = new THREE.Vector3();
      let best = -Infinity;
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m);
          if (v.y > best) {
            best = v.y;
            mast.copy(v);
          }
        }
      });
      boom = new THREE.Group();
      boom.position.set(mast.x, 0, mast.z);
      node.parent.add(boom);
      node.position.x -= mast.x;
      node.position.z -= mast.z;
      boom.add(node);
    }
    return { node, y: node.position.y, top: box.isEmpty() ? node.position.y : box.max.y, scale: node.scale.clone(), boom };
  }

  reset(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.steerIn = 0;
    this.sinkT = -1;
    this.hitFlash = 0;
    this.aimT = -1;
    this.reload[1] = 0;
    this.reload[-1] = 0;
    this.y = waveHeight(x, z);
    this.pitch = 0;
    this.roll = 0;
    this.root.visible = true;
    this.wake.reset();
  }

  get fx() {
    return Math.sin(this.heading);
  }

  get fz() {
    return Math.cos(this.heading);
  }

  get alive() {
    return this.sinkT < 0;
  }

  /** Unit vector out of the given side. */
  sideX(side: Side) {
    return Math.cos(this.heading) * side;
  }

  sideZ(side: Side) {
    return -Math.sin(this.heading) * side;
  }

  physics(dt: number, wind: Wind, speedMul = 1, turnMul = 1, minPolar = 0) {
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    if (this.sinkT >= 0) {
      this.speed = damp(this.speed, 0, 0.8, dt);
      this.yawRate = damp(this.yawRate, 0, 1, dt);
    } else {
      this.steer += (this.steerIn - this.steer) * (1 - Math.exp(-4.5 * dt));
      this.sailVis = damp(this.sailVis, this.sail / 3, 1.5, dt);
      const from = -(this.fx * wind.x + this.fz * wind.z);
      this.alpha = Math.acos(clamp(from, -1, 1));
      const eff = this.steam ? 1 : Math.max(minPolar, polar(this.alpha));
      const top = this.stats.speed * speedMul;
      const target = top * this.sailVis * eff * (this.steam ? 1 : wind.strength);
      this.speed = damp(this.speed, target, target > this.speed ? 0.45 : 0.32, dt);
      const grip = clamp(0.3 + (0.7 * this.speed) / (0.5 * top), 0.3, 1);
      const turn = this.stats.turn * turnMul * grip * (1 - 0.3 * this.sailVis);
      this.yawRate = -this.steer * turn;
    }
    this.heading += this.yawRate * dt;
    this.x += this.fx * this.speed * dt;
    this.z += this.fz * this.speed * dt;
  }

  /** Floats the ship on the waves (pitch / roll / heel / sinking) and animates sails and flags. */
  pose(dt: number, time: number, wind: Wind) {
    const fx = this.fx;
    const fz = this.fz;
    const lx = Math.cos(this.heading);
    const lz = -Math.sin(this.heading);
    const half = this.length * 0.4;
    const side = this.beam * 0.5;
    const hb = waveHeight(this.x + fx * half, this.z + fz * half);
    const hs = waveHeight(this.x - fx * half, this.z - fz * half);
    const hp = waveHeight(this.x + lx * side, this.z + lz * side);
    const hsb = waveHeight(this.x - lx * side, this.z - lz * side);
    let y = (hb + hs + hp + hsb) / 4;
    let pitch = Math.atan2(hs - hb, half * 2) * 0.85 - this.speed * 0.004;
    const windSide = wind.x * lx + wind.z * lz;
    let roll = Math.atan2(hp - hsb, side * 2) * 0.7 - windSide * this.sailVis * wind.strength * 0.1 + this.yawRate * this.speed * 0.014;
    if (this.sinkT >= 0) {
      const t = this.sinkT;
      const k = Math.min(1, t / 6);
      roll += this.listSide * 0.6 * Math.min(1, t / 2.5);
      pitch += 0.38 * k * k;
      y -= Math.pow(k, 1.6) * 11 * this.scale;
    }
    this.pitch = damp(this.pitch, pitch, 5, dt);
    this.roll = damp(this.roll, roll, 5, dt);
    this.y = damp(this.y, y, 7, dt);
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(this.pitch, this.heading, this.roll);

    const reef = 0.2 + 0.8 * this.sailVis;
    // The boom swings out to leeward: a little close-hauled, far out running before the wind.
    const swing = clamp((this.alpha - 0.45) * 0.55, 0.08, 1.2) * (0.35 + 0.65 * this.sailVis);
    const boom = windSide >= 0 ? -swing : swing;
    for (const s of this.sails) {
      s.node.scale.set(s.scale.x, s.scale.y * reef, s.scale.z * (0.55 + 0.45 * reef));
      s.node.position.y = s.top - (s.top - s.y) * reef;
      if (s.boom) s.boom.rotation.y = damp(s.boom.rotation.y, boom, 2.2, dt);
    }
    const wlx = wind.x * lx + wind.z * lz;
    const wlz = wind.x * fx + wind.z * fz;
    const flagYaw = Math.atan2(-wlx, -wlz);
    for (const f of this.flags) f.node.rotation.y = f.base + flagYaw + Math.sin(time * 7 + f.phase) * 0.09;

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    for (const m of this.materials) {
      m.emissive.copy(this.emissiveBase);
      if (this.hitFlash > 0) m.emissive.lerp(HIT, this.hitFlash * 0.4);
    }
  }

  /** Mounts `n` library cannons along each rail (the most central deck slots first). */
  setDeckGuns(cannon: Proto | undefined, slots: DeckSlot[], n: number) {
    this.deckGuns?.removeFromParent();
    this.deckGuns = null;
    this.gunSlots = slots.slice(0, Math.min(n, slots.length)).sort((a, b) => a.z - b.z);
    if (!cannon || !this.model || !this.gunSlots.length) return;
    const group = new THREE.Group();
    for (const s of this.gunSlots) {
      for (const side of [1, -1]) {
        const c = cannon.object.clone();
        c.position.set(side * 1.38, s.y - 0.02, s.z);
        c.rotation.y = (side * Math.PI) / 2;
        group.add(c);
      }
    }
    this.model.add(group);
    this.deckGuns = group;
  }

  /** World position of cannon `i` of `n` on a side. */
  muzzle(side: Side, i: number, n: number, out: THREE.Vector3) {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    let lz = (-0.3 + t * 0.52) * this.length;
    const lx = side * this.beam * 0.55;
    let ly = 1.55 * this.scale;
    if (this.gunSlots.length) {
      // Fire from the mounted deck guns.
      const slot = this.gunSlots[Math.round(t * (this.gunSlots.length - 1))];
      lz = slot.z * this.scale;
      ly = (slot.y - this.waterline + 0.4) * this.scale;
    }
    // From the ship's state rather than its matrix, so it is right even before the next render.
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    return out.set(this.x + c * lx + s * lz, this.y + ly + Math.sin(this.roll) * lx, this.z - s * lx + c * lz);
  }

  /** Is a world point inside the hull (or low rigging)? */
  contains(px: number, py: number, pz: number, pad = 0.35) {
    const dx = px - this.x;
    const dz = pz - this.z;
    const lz = dx * this.fx + dz * this.fz;
    const lx = dx * Math.cos(this.heading) - dz * Math.sin(this.heading);
    const half = this.length * 0.5;
    if (Math.abs(lz) > half + pad) return false;
    const taper = lz > half * 0.35 ? 1 - ((lz - half * 0.35) / (half * 0.65)) * 0.7 : 1;
    if (Math.abs(lx) > this.beam * 0.5 * taper + pad) return false;
    return py < this.y + 4.6 * this.scale && py > this.y - 1.5;
  }

  /** Collision circles along the keel: [x, z] pairs. */
  circles(out: number[]) {
    const r = this.length * 0.3;
    out[0] = this.x + this.fx * r;
    out[1] = this.z + this.fz * r;
    out[2] = this.x;
    out[3] = this.z;
    out[4] = this.x - this.fx * r;
    out[5] = this.z - this.fz * r;
    return out;
  }

  get radius() {
    return this.beam * 0.5;
  }

  dispose() {
    this.materials.forEach((m) => m.dispose());
    this.wake.dispose();
  }
}

const HIT = new THREE.Color("#ff5a2a");
