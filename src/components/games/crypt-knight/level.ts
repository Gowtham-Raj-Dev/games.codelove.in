import * as THREE from "three";
import type { Pool, Proto } from "../shared/assets";
import type { Decal, Decals, Glows } from "./fx";
import type { WorldDef } from "./content";
import { D } from "./manifest";

/** Rooms of the crypt, built from Dungeon Remastered pieces (4 × 4 m tiles). */

export const TILE = 4;

export type EnemyKind = "minion" | "warrior" | "mage" | "boss" | "rogue" | "archer";
export type Layout = "plain" | "pillars" | "hall" | "rubble" | "cross" | "throne";

export interface RoomPlan {
  /** Size in tiles; the width is odd so the door sits in the middle of the far wall. */
  w: number;
  d: number;
  layout: Layout;
  waves: EnemyKind[][];
  chest: boolean;
  spikes: number;
  boss?: boolean;
}

export const ROOMS: RoomPlan[] = [
  { w: 5, d: 4, layout: "plain", waves: [["minion", "minion", "minion"]], chest: false, spikes: 0 },
  { w: 5, d: 4, layout: "pillars", waves: [["minion", "minion", "minion"], ["minion", "minion", "minion", "minion"]], chest: true, spikes: 0 },
  { w: 5, d: 5, layout: "rubble", waves: [["minion", "minion", "warrior"], ["minion", "minion", "minion", "minion"]], chest: false, spikes: 0 },
  { w: 5, d: 5, layout: "hall", waves: [["mage", "minion", "minion", "minion"], ["mage", "warrior", "minion", "minion", "minion"]], chest: true, spikes: 0 },
  {
    w: 7,
    d: 5,
    layout: "cross",
    waves: [
      ["warrior", "minion", "minion", "mage", "minion"],
      ["warrior", "minion", "minion", "minion", "mage"],
    ],
    chest: false,
    spikes: 2,
  },
  {
    w: 5,
    d: 5,
    layout: "pillars",
    waves: [
      ["minion", "minion", "minion", "minion", "minion"],
      ["mage", "mage", "warrior", "minion"],
      ["warrior", "minion", "minion", "minion"],
    ],
    chest: true,
    spikes: 2,
  },
  {
    w: 7,
    d: 5,
    layout: "rubble",
    waves: [
      ["warrior", "warrior", "minion", "minion", "minion"],
      ["mage", "mage", "minion", "minion", "minion", "minion"],
    ],
    chest: false,
    spikes: 3,
  },
  {
    w: 7,
    d: 5,
    layout: "hall",
    waves: [
      ["mage", "mage", "mage", "minion", "minion"],
      ["warrior", "warrior", "minion", "minion", "minion"],
      ["warrior", "mage", "minion", "minion", "minion"],
    ],
    chest: true,
    spikes: 2,
  },
  {
    w: 7,
    d: 6,
    layout: "cross",
    waves: [
      ["warrior", "warrior", "minion", "minion", "minion", "minion"],
      ["mage", "mage", "minion", "minion", "minion", "warrior"],
      ["warrior", "warrior", "mage", "mage", "minion", "minion"],
    ],
    chest: true,
    spikes: 4,
  },
  { w: 7, d: 6, layout: "throne", waves: [["boss"]], chest: false, spikes: 0, boss: true },
];

/** A world's ten rooms: the crypt's rooms with some skeletons swapped for the world's rogues and archers. */
export function worldRooms(world: WorldDef): RoomPlan[] {
  return ROOMS.map((room, r) => ({
    ...room,
    waves: room.waves.map((wave, w) => {
      let minions = r;
      let mages = r;
      const out = wave.map((kind): EnemyKind => {
        if (kind === "minion" && world.rogues && ++minions % world.rogues === 0) return "rogue";
        if (kind === "mage" && world.archers && ++mages % world.archers === 0) return "archer";
        return kind;
      });
      if (world.extra && r >= 2 && !room.boss && w === room.waves.length - 1) out.push(world.extra);
      return out;
    }),
  }));
}

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export interface Breakable extends Collider {
  key: string;
  obj: THREE.Object3D;
  broken: boolean;
}

export interface Chest extends Collider {
  obj: THREE.Object3D;
  lid: THREE.Object3D;
  open: number;
  opened: boolean;
  yaw: number;
}

export interface Spike {
  x: number;
  z: number;
  obj: THREE.Object3D;
  node: THREE.Object3D;
  baseY: number;
  t: number;
  period: number;
  state: "down" | "warn" | "up";
  /** Actors already hit during this thrust. */
  hit: Set<object>;
  warnDecal: Decal | null;
}

export interface Torch {
  x: number;
  y: number;
  z: number;
  flame: THREE.Sprite;
  core: THREE.Sprite;
  seed: number;
  /** Index into the real point lights, or -1 for glow-only torches. */
  light: number;
}

interface Part {
  key: string;
  obj: THREE.Object3D;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

export class Room {
  readonly group = new THREE.Group();
  hw = 10;
  hd = 8;
  plan: RoomPlan = ROOMS[0];
  colliders: Collider[] = [];
  breakables: Breakable[] = [];
  chests: Chest[] = [];
  spikes: Spike[] = [];
  torches: Torch[] = [];
  /** Real lights are few; these are where they go this room. */
  lightSpots: THREE.Vector3[] = [];
  doorOpen = 0;
  doorTarget = 0;
  /** Torch colours of the current world (flame, core). */
  flame = { flame: "#ff8a3d", core: "#ffd38a" };
  private parts: Part[] = [];
  private decals: Decal[] = [];
  private readonly doorway: THREE.Object3D;
  private readonly doorPivot: THREE.Group;

  constructor(
    private readonly protos: Map<string, Proto>,
    private readonly pool: Pool,
    private readonly fxDecals: Decals,
    private readonly glows: Glows,
  ) {
    // The exit door is a single object kept for the whole game; its door leaf swings on a hinge.
    this.doorway = this.protos.get(D.doorway)!.object.clone();
    this.doorPivot = new THREE.Group();
    const leaf = this.doorway.getObjectByName("wall_doorway_door");
    if (leaf?.parent) {
      const half = 1.0;
      leaf.parent.add(this.doorPivot);
      this.doorPivot.position.set(leaf.position.x - half, leaf.position.y, leaf.position.z);
      this.doorPivot.add(leaf);
      leaf.position.set(half, 0, 0);
    }
  }

  size(key: string) {
    return this.protos.get(key)?.size ?? new THREE.Vector3(1, 1, 1);
  }

  private place(key: string, x: number, y: number, z: number, yaw = 0, scaleY = 1): THREE.Object3D | null {
    if (!this.protos.has(key)) return null;
    const obj = this.pool.get(key, this.group);
    obj.position.set(x, y, z);
    obj.rotation.y = yaw;
    obj.scale.set(1, scaleY, 1);
    this.parts.push({ key, obj });
    return obj;
  }

  clear() {
    for (const p of this.parts) this.pool.release(p.key, p.obj);
    for (const d of this.decals) this.fxDecals.release(d);
    for (const t of this.torches) {
      t.flame.removeFromParent();
      t.core.removeFromParent();
    }
    for (const s of this.spikes) this.fxDecals.release(s.warnDecal);
    this.parts = [];
    this.decals = [];
    this.colliders = [];
    this.breakables = [];
    this.chests = [];
    this.spikes = [];
    this.torches = [];
    this.lightSpots = [];
    this.doorway.removeFromParent();
  }

  build(plan: RoomPlan) {
    this.clear();
    this.plan = plan;
    const hw = (plan.w * TILE) / 2;
    const hd = (plan.d * TILE) / 2;
    this.hw = hw;
    this.hd = hd;
    this.doorOpen = 0;
    this.doorTarget = 0;
    this.doorPivot.rotation.y = 0;

    // --- Floor: big tiles, some split into small (broken / decorated) ones, spike traps in the middle.
    const spikeCells = new Set<string>();
    if (plan.spikes > 0) {
      const options: [number, number][] = [];
      for (let i = 0; i < plan.w; i++)
        for (let j = 0; j < plan.d; j++) {
          const cx = -hw + TILE / 2 + i * TILE;
          // Never at the doors or right where the knight walks in.
          if (Math.abs(cx) < 3 && (j === 0 || j >= plan.d - 2)) continue;
          if (i === 0 || i === plan.w - 1) continue;
          options.push([i, j]);
        }
      for (let k = 0; k < plan.spikes && options.length; k++) {
        const idx = Math.floor(Math.random() * options.length);
        const [i, j] = options.splice(idx, 1)[0];
        spikeCells.add(`${i},${j}`);
      }
    }
    for (let i = 0; i < plan.w; i++)
      for (let j = 0; j < plan.d; j++) {
        const cx = -hw + TILE / 2 + i * TILE;
        const cz = -hd + TILE / 2 + j * TILE;
        if (spikeCells.has(`${i},${j}`)) {
          this.addSpike(cx, cz);
          continue;
        }
        const r = Math.random();
        if (r < 0.2 && plan.layout !== "throne") {
          for (const [dx, dz] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ])
            this.floorTile(pick([D.floorSmall, D.floorSmall, D.floorBrokenA, D.floorBrokenB, D.floorDecorated]), cx + dx, cz + dz, Math.floor(rand(0, 4)) * (Math.PI / 2));
        } else if (r < 0.28) this.floorTile(D.floorDirt, cx, cz, Math.floor(rand(0, 4)) * (Math.PI / 2));
        else this.floorTile(D.floor, cx, cz, Math.floor(rand(0, 4)) * (Math.PI / 2));
      }
    // Floor beyond both doors, so the openings don't look onto the void.
    this.floorTile(D.floor, 0, -hd - TILE / 2, 0);
    this.floorTile(D.floor, 0, hd + TILE / 2, 0);

    // --- Torches: two on the far wall by the door, then every other tile along the sides. The first
    // four (far pair + the middle side pair) get the real lights; the rest only glow.
    const sideZs: number[] = [];
    for (let j = 0; j < plan.d; j += 2) sideZs.push(-hd + TILE / 2 + j * TILE);
    const mid = sideZs.reduce((best, z) => (Math.abs(z + 1) < Math.abs(best + 1) ? z : best), sideZs[0]);
    const torchSpots: { x: number; z: number; yaw: number }[] = [
      { x: -TILE, z: -hd, yaw: 0 },
      { x: TILE, z: -hd, yaw: 0 },
      { x: -hw, z: mid, yaw: Math.PI / 2 },
      { x: hw, z: mid, yaw: -Math.PI / 2 },
    ];
    for (const z of sideZs) if (z !== mid) torchSpots.push({ x: -hw, z, yaw: Math.PI / 2 }, { x: hw, z, yaw: -Math.PI / 2 });
    if (plan.w >= 7) torchSpots.push({ x: -3 * TILE, z: -hd, yaw: 0 }, { x: 3 * TILE, z: -hd, yaw: 0 });
    const torchAt = (x: number, z: number) => torchSpots.some((t) => Math.abs(t.x - x) < 0.6 && Math.abs(t.z - z) < 0.6);

    // --- Walls: far wall with the exit door in the middle, side walls, low balustrade at the near side.
    const plain = [D.wall, D.wall, D.wallArched, D.wallCracked];
    const fancy = [D.wall, D.wallArched, D.wallCracked, D.wallShelves, D.wallWindow, D.wallPillar];
    for (let i = 0; i < plan.w; i++) {
      const x = -hw + TILE / 2 + i * TILE;
      if (Math.abs(x) < 0.1) {
        this.doorway.position.set(0, 0, -hd - 0.5);
        this.doorway.rotation.y = 0;
        this.group.add(this.doorway);
      } else this.place(pick(torchAt(x, -hd) || Math.abs(Math.abs(x) - 2 * TILE) < 0.1 ? plain : fancy), x, 0, -hd - 0.5, 0);
    }
    for (let j = 0; j < plan.d; j++) {
      const z = -hd + TILE / 2 + j * TILE;
      this.place(pick(torchAt(-hw, z) ? plain : fancy), -hw - 0.5, 0, z, Math.PI / 2);
      this.place(pick(torchAt(hw, z) ? plain : fancy), hw + 0.5, 0, z, -Math.PI / 2);
    }
    this.place(D.wallCorner, -hw - 0.5, 0, -hd - 0.5);
    this.place(D.wallCorner, hw + 0.5, 0, -hd - 0.5);
    for (let i = 0; i < plan.w; i++) {
      const x = -hw + TILE / 2 + i * TILE;
      if (Math.abs(x) > 0.1) this.place(D.barrier, x, 0, hd + 0.35, 0);
    }
    for (const x of [-hw - 0.5, hw + 0.5, -2.1, 2.1]) this.place(D.column, x, 0, hd + 0.35);
    torchSpots.forEach((s, i) => this.addTorch(s.x, s.z, s.yaw, i < 4 ? i : -1));

    // Red banners on the far wall.
    for (const x of [-2 * TILE, 2 * TILE]) {
      if (Math.abs(x) < hw) this.place(plan.layout === "throne" ? D.bannerShield : pick([D.bannerRed, D.bannerThin, D.bannerShield]), x, 0.4, -hd + 0.2, 0);
    }

    // --- Layout features.
    const L = plan.layout;
    if (L === "pillars") {
      const px = Math.min(hw - 4.5, 5);
      const pz = Math.min(hd - 4, 3.5);
      // Kept shorter than the walls so they hide less of the fight from the high camera.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.solid(D.pillar, sx * px, sz * pz, 0.9, 0, 0.6);
    } else if (L === "hall") {
      const px = hw - 3.2;
      for (const sz of [-1, 1]) for (const sx of [-1, 1]) this.solid(D.pillarDecorated, sx * px, sz * Math.min(4, hd - 3.5), 1.0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    } else if (L === "cross") {
      for (const sx of [-1, 1]) this.solid(D.pillar, sx * 4.5, -1, 0.9, 0, 0.6);
      this.solid(D.column, 0, -hd + 5.5, 0.55);
    } else if (L === "rubble") {
      this.solid(D.rubble, -hw + 2.2, -hd + 1.8, 2.0, 0);
      this.solid(D.tableBroken, hw - 3.2, hd - 4, 1.2, rand(0, Math.PI));
    } else if (L === "throne") {
      for (const sz of [-1, 0.2]) for (const sx of [-1, 1]) this.solid(D.pillarDecorated, sx * (hw - 3.5), sz * (hd - 4), 1.0, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      for (const sx of [-1, 1]) {
        this.place(D.candles, sx * 3, 0, -hd + 1.2);
        this.place(D.candles, sx * 5.5, 0, -hd + 1.0);
        this.place(D.coinStack, sx * 6.8, 0, -hd + 1.4, rand(0, 6));
      }
    }

    // Clutter along the walls (corners first), keeping the middle clear for fighting.
    const corners: [number, number][] = [
      [-hw + 1.6, -hd + 1.5],
      [hw - 1.6, -hd + 1.5],
      [-hw + 1.6, hd - 2.0],
      [hw - 1.6, hd - 2.0],
    ];
    for (const [cx, cz] of corners) {
      if (this.blocked(cx, cz, 1.5)) continue;
      const kind = Math.random();
      if (kind < 0.3) {
        this.solid(D.barrel, cx, cz, 1.0, rand(0, 6));
        this.breakable(pick([D.barrelSmall, D.box]), cx + Math.sign(-cx) * 1.6, cz + rand(-0.4, 0.4));
      } else if (kind < 0.55) this.solid(D.crates, cx, cz, 1.25, Math.round(rand(0, 3)) * (Math.PI / 2));
      else if (kind < 0.75) {
        this.solid(D.barrelStack, cx, cz, 1.0, cx < 0 ? Math.PI / 2 : -Math.PI / 2);
        this.place(D.candles, cx + Math.sign(-cx) * 1.3, 0, cz);
      } else {
        this.solid(D.boxLarge, cx, cz, 0.95, rand(-0.3, 0.3));
        this.breakable(D.box, cx + Math.sign(-cx) * 1.5, cz);
      }
    }
    // A few loose breakables along the side walls.
    const loose = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < loose; k++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (hw - 0.9);
      const z = rand(-hd + 3, hd - 3);
      if (!this.blocked(x, z, 1.2)) this.breakable(pick([D.barrelSmall, D.box, D.barrelSmall]), x, z);
    }
    if (Math.random() < 0.6) {
      const x = rand(-hw + 3, hw - 3);
      if (!this.blocked(x, -hd + 0.9, 1.4) && Math.abs(x) > 2.5) this.place(D.swordShield, x, 0, -hd + 0.45, 0);
    }
    if (L !== "throne" && Math.random() < 0.5) {
      const x = pick([-1, 1]) * (hw - 1.4);
      const z = rand(-1, 2);
      if (!this.blocked(x, z, 1.4)) this.solid(D.trunk, x, z, 0.9, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    }

    // Chest against the far wall, beside the door.
    if (plan.chest) {
      const x = (Math.random() < 0.5 ? -1 : 1) * rand(2.6, Math.min(hw - 2.5, 6));
      this.addChest(x, -hd + 1.3, 0);
    }
  }

  /** Floor pieces share a 0.16 m slab (decorated ones carry rocks or candles on top of it). */
  private floorTile(key: string, x: number, z: number, yaw: number) {
    return this.place(key, x, -0.16, z, yaw);
  }

  private solid(key: string, x: number, z: number, r: number, yaw = 0, scaleY = 1) {
    const obj = this.place(key, x, 0, z, yaw, scaleY);
    if (obj) this.colliders.push({ x, z, r });
    return obj;
  }

  private breakable(key: string, x: number, z: number) {
    const obj = this.place(key, x, 0, z, rand(0, Math.PI * 2));
    if (!obj) return;
    const b: Breakable = { key, obj, x, z, r: 0.6, broken: false };
    this.breakables.push(b);
    this.colliders.push(b);
  }

  private addChest(x: number, z: number, yaw: number) {
    const obj = this.place(D.chest, x, 0, z, yaw);
    if (!obj) return;
    let pivot = obj.userData.lidPivot as THREE.Object3D | undefined;
    if (!pivot) {
      // Hinge the lid at its back edge (first use of this pooled chest).
      const lid = obj.getObjectByName("chest_lid");
      const g = new THREE.Group();
      if (lid?.parent) {
        lid.parent.add(g);
        g.position.set(0, 0.62, -0.68);
        g.add(lid);
        lid.position.set(0, 0.817 - 0.62, 0.023 + 0.68);
      }
      obj.userData.lidPivot = g;
      pivot = g;
    }
    pivot.rotation.x = 0;
    const c: Chest = { obj, lid: pivot, x, z, r: 1.0, open: 0, opened: false, yaw };
    this.chests.push(c);
    this.colliders.push(c);
  }

  private addSpike(x: number, z: number) {
    const key = D.spikes;
    if (!this.protos.has(key)) return this.floorTile(D.floor, x, z, 0);
    // Base slab sits flush with the floor; the spikes node slides up and down.
    const obj = this.place(key, x, -0.2, z, 0);
    if (!obj) return;
    const node = obj.getObjectByName("spikes");
    if (!node) return;
    if (obj.userData.spikeBase === undefined) obj.userData.spikeBase = node.position.y;
    const baseY = obj.userData.spikeBase as number;
    node.position.y = baseY - 2;
    this.spikes.push({ x, z, obj, node, baseY, t: rand(0, 2.5), period: rand(3.4, 4.2), state: "down", hit: new Set(), warnDecal: null });
  }

  private addTorch(x: number, z: number, yaw: number, light: number) {
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const ts = this.size(D.torch);
    this.place(D.torch, x + nx * (ts.z / 2), 1.7, z + nz * (ts.z / 2), yaw);
    const fx = x + nx * 0.55;
    const fz = z + nz * 0.55;
    const fy = 1.7 + ts.y + 0.12;
    const flame = this.glows.make(this.flame.flame, 1.6, 0.85);
    const core = this.glows.make(this.flame.core, 0.55, 1);
    flame.position.set(fx, fy, fz);
    core.position.set(fx, fy - 0.05, fz);
    this.group.add(flame, core);
    this.torches.push({ x: fx, y: fy, z: fz, flame, core, seed: Math.random() * 100, light });
    if (light >= 0) this.lightSpots[light] = new THREE.Vector3(fx + nx * 0.4, fy + 0.2, fz + nz * 0.4);
    const pool = this.fxDecals.get().set("pool", x + nx * 1.6, z + nz * 1.6, 3.8, this.flame.flame, { opacity: 0.22, y: 0.02 });
    this.decals.push(pool);
  }

  /** Is a circle at (x, z) free of props? */
  blocked(x: number, z: number, r: number) {
    return this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r);
  }

  /** Random free floor spot at least `minDist` from (px, pz). */
  freeSpot(px: number, pz: number, minDist: number, taken: { x: number; z: number }[] = [], margin = 2.2) {
    for (let tries = 0; tries < 80; tries++) {
      const x = rand(-this.hw + margin, this.hw - margin);
      const z = rand(-this.hd + margin, this.hd - margin - 1);
      if (Math.hypot(x - px, z - pz) < minDist) continue;
      if (this.blocked(x, z, 1.2)) continue;
      if (this.spikes.some((s) => Math.abs(s.x - x) < 2.4 && Math.abs(s.z - z) < 2.4)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 2.4)) continue;
      return { x, z };
    }
    return { x: rand(-this.hw + margin, this.hw - margin), z: rand(-this.hd + margin, 0) };
  }

  removeCollider(c: Collider) {
    this.colliders = this.colliders.filter((x) => x !== c);
  }

  releasePart(obj: THREE.Object3D) {
    const i = this.parts.findIndex((p) => p.obj === obj);
    if (i < 0) return;
    this.pool.release(this.parts[i].key, obj);
    this.parts.splice(i, 1);
  }

  update(dt: number, elapsed: number) {
    // Door swing.
    if (this.doorOpen !== this.doorTarget) {
      this.doorOpen = Math.min(this.doorTarget, this.doorOpen + dt * 0.9);
      const k = this.doorOpen;
      this.doorPivot.rotation.y = 1.85 * (1 - Math.pow(1 - k, 3));
    }
    // Torch flicker.
    for (const t of this.torches) {
      const f = 0.82 + Math.sin(elapsed * 9 + t.seed) * 0.08 + Math.sin(elapsed * 23 + t.seed * 2) * 0.06 + Math.sin(elapsed * 3.1 + t.seed) * 0.05;
      t.flame.scale.set(1.5 * f, 1.85 * f, 1);
      t.core.scale.setScalar(0.5 + f * 0.12);
      (t.flame.material as THREE.SpriteMaterial).opacity = 0.65 + f * 0.25;
    }
    // Chest lids.
    for (const c of this.chests) {
      if (!c.opened || c.open >= 1) continue;
      c.open = Math.min(1, c.open + dt * 2.5);
      const k = c.open;
      c.lid.rotation.x = -1.95 * (1 - Math.pow(1 - k, 3)) - Math.sin(k * Math.PI) * 0.15;
    }
  }

  openDoor() {
    this.doorTarget = 1;
  }

  get doorReady() {
    return this.doorOpen > 0.55;
  }
}
