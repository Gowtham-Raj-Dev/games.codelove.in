import * as THREE from "three";
import type { Proto } from "../shared/assets";
import { ISLAND, LOOT, PROPS, TOWN, TRADE_SHIPS } from "./manifest";
import { waveHeight } from "./ocean";
import { BOUNDS, inHauntedSea, PORTS, rng, type PortDef, type PortId } from "./trade";

/**
 * The seas: islands assembled from Pirate Kit pieces (sand and grass patches, palms, rocks, huts,
 * docks, flags), reefs and wrecks, and — on the open sea — port towns built from Fantasy Town houses
 * and stalls around long jetties. Everything static is merged into one mesh per island and kit (each
 * kit's models share one colour atlas). Two layouts: the small cove of the wave battles, and the
 * open sea of the trading career.
 */

export const ARENA = 205;

export interface Shoal {
  x: number;
  z: number;
  r: number;
  /** Height of the tallest thing on it (cannonballs fly over lower rocks). */
  top: number;
  /** Jetty posts: solid for ships, but no shallows or surf drawn around them. */
  dock?: boolean;
}

export interface FortSite {
  x: number;
  z: number;
  /** Direction (yaw) from the island centre towards the sea. */
  yaw: number;
  large: boolean;
}

export interface Floater {
  obj: THREE.Object3D;
  x: number;
  z: number;
  yaw: number;
  phase: number;
}

interface IslandPlan {
  x: number;
  z: number;
  r: number;
  fort?: "small" | "large";
  dock?: boolean;
  hut?: boolean;
  treasure?: boolean;
  flag?: boolean;
  haunted?: boolean;
}

interface ReefPlan {
  x: number;
  z: number;
  r: number;
  wreck?: boolean;
}

export interface Layout {
  islands: IslandPlan[];
  reefs: ReefPlan[];
  ports: PortDef[];
  /** Radius of the ring of buoys around the cove (none on the open sea). */
  buoys: number | null;
}

/** An island on the chart (not a port). */
export interface IslandInfo {
  id: number;
  x: number;
  z: number;
  r: number;
  treasure: boolean;
  haunted: boolean;
}

/** A port town: where its jetty runs and where ships may dock. */
export interface PortSite {
  id: PortId;
  def: PortDef;
  x: number;
  z: number;
  r: number;
  /** Jetty: from (jx, jz) out along heading `h` for `len` metres. */
  jx: number;
  jz: number;
  h: number;
  len: number;
  /** Sail into this circle to dock. */
  zone: { x: number; z: number; r: number };
}

const COVE_ISLANDS: IslandPlan[] = [
  { x: 40, z: 58, r: 16, dock: true, hut: true, flag: true },
  { x: -64, z: 22, r: 13, fort: "small" },
  { x: -28, z: -74, r: 18, fort: "large", flag: true },
  { x: 86, z: -34, r: 12, treasure: true },
  { x: 122, z: 72, r: 15, fort: "small", hut: true },
  { x: -124, z: -22, r: 14, dock: true },
  { x: -96, z: 108, r: 17, flag: true, hut: true },
  { x: 18, z: 146, r: 11 },
  { x: 62, z: -132, r: 14, fort: "large" },
  { x: -150, z: -116, r: 12, treasure: true },
  { x: 150, z: -92, r: 13, dock: true },
  { x: 170, z: 16, r: 9 },
];

const COVE_REEFS: ReefPlan[] = [
  { x: -12, z: 80, r: 4.2 },
  { x: 100, z: 18, r: 5 },
  { x: -78, z: -46, r: 4.2 },
  { x: 38, z: -64, r: 4.6, wreck: true },
  { x: -152, z: 52, r: 4.4 },
  { x: 104, z: 142, r: 5 },
  { x: -44, z: 162, r: 4.4 },
  { x: -4, z: -156, r: 5 },
];

export const COVE: Layout = { islands: COVE_ISLANDS, reefs: COVE_REEFS, ports: [], buoys: ARENA + 6 };

/** The open sea of the trading career: the ten ports, then islands and reefs scattered between them (the same for every voyage). */
export function openSeaLayout(): Layout {
  const r = rng(424242);
  const taken: { x: number; z: number; r: number }[] = [];
  for (const p of PORTS) {
    taken.push({ x: p.x, z: p.z, r: p.r + 60 });
    // Keep the harbour approach clear.
    taken.push({ x: p.x + Math.sin(p.dock) * (p.r + 70), z: p.z + Math.cos(p.dock) * (p.r + 70), r: 55 });
  }
  const islands: IslandPlan[] = [];
  for (let tries = 0; islands.length < 56 && tries < 6000; tries++) {
    const x = (r() * 2 - 1) * (BOUNDS - 70);
    const z = (r() * 2 - 1) * (BOUNDS - 70);
    const rad = r() < 0.25 ? 14 + r() * 6 : 8 + r() * 7;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + rad + 38)) continue;
    const haunted = inHauntedSea(x, z);
    islands.push({ x, z, r: rad, haunted, hut: !haunted && r() < 0.22, flag: !haunted && r() < 0.15 });
    taken.push({ x, z, r: rad });
  }
  // Treasure: islands well away from any port, a few of them in the Haunted Sea.
  const far = islands
    .map((isl, i) => ({ i, d: Math.min(...PORTS.map((p) => Math.hypot(p.x - isl.x, p.z - isl.z))) + (isl.haunted ? 200 : 0) + r() * 150 }))
    .sort((a, b) => b.d - a.d);
  for (const { i } of far.slice(0, 12)) islands[i].treasure = true;
  const reefs: ReefPlan[] = [];
  for (let tries = 0; reefs.length < 34 && tries < 4000; tries++) {
    const x = (r() * 2 - 1) * (BOUNDS - 50);
    const z = (r() * 2 - 1) * (BOUNDS - 50);
    const rad = 3.6 + r() * 2;
    if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + rad + 26)) continue;
    reefs.push({ x, z, r: rad, wreck: r() < (inHauntedSea(x, z) ? 0.6 : 0.18) });
    taken.push({ x, z, r: rad });
  }
  return { islands, reefs, ports: PORTS, buoys: null };
}

/** Geometry of a proto, flattened into its own space (one entry per mesh). */
export function bake(proto: Proto) {
  const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = [];
  proto.object.updateMatrixWorld(true);
  proto.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    out.push({ geometry: mesh.geometry, material: Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, matrix: mesh.matrixWorld.clone() });
  });
  return out;
}

/** Merges many placed protos into one mesh (position, normal, uv), assuming one shared material. */
class Batch {
  private parts: { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  material: THREE.Material | null = null;

  add(proto: Proto | undefined, matrix: THREE.Matrix4) {
    if (!proto) return;
    for (const part of bake(proto)) {
      this.material ??= part.material;
      this.parts.push({ geometry: part.geometry, matrix: new THREE.Matrix4().multiplyMatrices(matrix, part.matrix) });
    }
  }

  build(): THREE.Mesh | null {
    if (!this.parts.length || !this.material) return null;
    let vertices = 0;
    let indices = 0;
    for (const { geometry } of this.parts) {
      const n = geometry.attributes.position.count;
      vertices += n;
      indices += geometry.index ? geometry.index.count : n;
    }
    const pos = new Float32Array(vertices * 3);
    const nor = new Float32Array(vertices * 3);
    const uv = new Float32Array(vertices * 2);
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    const v = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    let vo = 0;
    let io = 0;
    for (const { geometry, matrix } of this.parts) {
      normalMatrix.getNormalMatrix(matrix);
      const p = geometry.attributes.position;
      const n = geometry.attributes.normal;
      const t = geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(matrix);
        pos.set([v.x, v.y, v.z], (vo + i) * 3);
        if (n) {
          v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
          nor.set([v.x, v.y, v.z], (vo + i) * 3);
        }
        if (t) uv.set([t.getX(i), t.getY(i)], (vo + i) * 2);
      }
      if (geometry.index) for (let i = 0; i < geometry.index.count; i++) index[io++] = geometry.index.getX(i) + vo;
      else for (let i = 0; i < p.count; i++) index[io++] = vo + i;
      vo += p.count;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** One Batch per kit (each kit has its own colour atlas). */
class Batches {
  private readonly kits = new Map<string, Batch>();

  constructor(private readonly protos: Map<string, Proto>) {}

  add(key: string, matrix: THREE.Matrix4) {
    const proto = this.protos.get(key);
    if (!proto) return null;
    const kit = key.split("/")[0];
    let batch = this.kits.get(kit);
    if (!batch) this.kits.set(kit, (batch = new Batch()));
    batch.add(proto, matrix);
    return proto;
  }

  build() {
    return [...this.kits.values()].map((b) => b.build()).filter((m): m is THREE.Mesh => !!m);
  }
}

const m4 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const BUOY_SCALE = new THREE.Vector3(1.6, 1.6, 1.6);
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const place = (x: number, y: number, z: number, yaw: number, sx: number, sy = sx, sz = sx, tiltX = 0, tiltZ = 0) =>
  m4.clone().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(tiltX, yaw, tiltZ, "YXZ")).clone(), new THREE.Vector3(sx, sy, sz));

/** Islands are laid out with (cos, sin) angles; ships use headings (sin, cos). */
const toYaw = (angle: number) => Math.PI / 2 - angle;

export class World {
  readonly group = new THREE.Group();
  readonly shoals: Shoal[] = [];
  readonly forts: FortSite[] = [];
  readonly floaters: Floater[] = [];
  readonly islands: IslandInfo[] = [];
  readonly ports: PortSite[] = [];
  /** Per-island groups, hidden when far from the camera. */
  private readonly chunks: { obj: THREE.Object3D; x: number; z: number; r: number }[] = [];
  private readonly meshes: THREE.Mesh[] = [];
  private buoys: { meshes: THREE.InstancedMesh[]; places: { x: number; z: number; phase: number }[] }[] = [];

  constructor(
    private readonly protos: Map<string, Proto>,
    layout: Layout,
  ) {
    layout.islands.forEach((plan, i) => this.island(plan, i));
    layout.reefs.forEach((reef, i) => this.reef(reef, i));
    layout.ports.forEach((def, i) => this.port(def, i));
    if (layout.buoys) this.buildBuoys(layout.buoys);
  }

  private proto(key: string) {
    return this.protos.get(key);
  }

  private chunk(b: Batches, x: number, z: number, r: number) {
    const meshes = b.build();
    if (!meshes.length) return;
    const g = new THREE.Group();
    for (const mesh of meshes) {
      g.add(mesh);
      this.meshes.push(mesh);
    }
    this.group.add(g);
    this.chunks.push({ obj: g, x, z, r });
  }

  /** Sand, grass, edge rocks, palms and plants; returns the height of the tallest thing. */
  private ground(b: Batches, x: number, z: number, r: number, rand: () => number, { haunted = false, clear = null as number | null } = {}) {
    const at = (radius: number, angle: number) => ({ x: x + Math.cos(angle) * radius, z: z + Math.sin(angle) * radius });
    // Is an angle on the side kept clear for a town?
    const open = (angle: number) => clear === null || Math.abs(Math.atan2(Math.sin(angle - clear), Math.cos(angle - clear))) > 1.25;

    // Sand: overlapping patches, thickened so their sides are hidden under the waves.
    const patches = 3 + Math.round(r / 5);
    for (let i = 0; i < patches; i++) {
      const a = (i / patches) * Math.PI * 2 + rand() * 0.6;
      const d = i === 0 ? 0 : r * (0.28 + rand() * 0.2);
      const p = at(d, a);
      const s = (r / 7.2) * (0.8 + rand() * 0.25);
      const key = rand() < 0.45 && !haunted ? ISLAND.sandFoliage : ISLAND.sand;
      const proto = this.proto(key);
      if (!proto) continue;
      const top = i === 0 ? 0.95 : 0.62 + rand() * 0.18;
      const sy = 1.4 / proto.size.y;
      b.add(key, place(p.x, top - proto.size.y * sy, p.z, rand() * Math.PI * 2, s, sy, s));
    }
    // Grass on the higher middle.
    if (!haunted) {
      const grassCount = r > 12 ? 2 : 1;
      for (let i = 0; i < grassCount; i++) {
        const key = rand() < 0.5 ? ISLAND.grass : ISLAND.grassFoliage;
        const proto = this.proto(key);
        if (!proto) continue;
        const p = at(r * 0.18 * rand(), rand() * Math.PI * 2);
        const s = (r / 9) * (0.85 + rand() * 0.3);
        const sy = 0.9 / proto.size.y;
        b.add(key, place(p.x, 1.25 - proto.size.y * sy, p.z, rand() * Math.PI * 2, s, sy, s));
      }
    }
    // Rocks at the edge.
    const rocks = [ISLAND.rocksSandA, ISLAND.rocksSandB, ISLAND.rocksSandC];
    const rockCount = (haunted ? 3 : 1) + Math.floor(rand() * 2);
    let top = 1.4;
    // (Random numbers are drawn in the same order as the original cove, so it looks the same.)
    for (let i = 0; i < rockCount; i++) {
      const key = rocks[Math.floor(rand() * rocks.length)];
      const d = r * (0.62 + rand() * 0.15);
      const a = rand() * Math.PI * 2;
      const p = at(d, a);
      const s = (1.1 + rand() * 0.6) * (haunted ? 1.3 : 1);
      if (!open(a)) continue;
      const proto = b.add(key, place(p.x, -0.4, p.z, rand() * Math.PI * 2, s));
      if (proto) top = Math.max(top, proto.size.y * s - 0.4);
    }
    // Palms (a few bare ones in the Haunted Sea).
    const palms = haunted ? [ISLAND.palmStraight, ISLAND.palmBend] : [ISLAND.palmBend, ISLAND.palmStraight, ISLAND.palmDetailedBend, ISLAND.palmDetailedStraight];
    const palmCount = Math.round((r / 3.2) * (haunted ? 0.4 : 1));
    for (let i = 0; i < palmCount; i++) {
      const key = palms[Math.floor(rand() * palms.length)];
      const a = rand() * Math.PI * 2;
      const p = at(r * (0.15 + rand() * 0.42), a);
      const s = 1.25 + rand() * 0.55;
      if (!open(a)) continue;
      const proto = b.add(key, place(p.x, 0.75, p.z, rand() * Math.PI * 2, s));
      if (proto) top = Math.max(top, proto.size.y * s + 0.75);
    }
    // Small plants.
    const plants = [ISLAND.grassTuft, ISLAND.grassPatch, ISLAND.grassPlant];
    for (let i = 0; i < (haunted ? 1 : 4) + Math.floor(rand() * 4); i++) {
      const key = plants[Math.floor(rand() * plants.length)];
      const p = at(r * rand() * 0.55, rand() * Math.PI * 2);
      b.add(key, place(p.x, 0.8, p.z, rand() * Math.PI * 2, 1.2 + rand() * 0.8));
    }
    return top;
  }

  private island(plan: IslandPlan, seed: number) {
    const rand = rng(1000 + seed * 97);
    const r = plan.r;
    const b = new Batches(this.protos);
    const { x: cx, z: cz } = plan;
    const at = (radius: number, angle: number) => ({ x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius });
    let top = this.ground(b, cx, cz, r, rand, { haunted: plan.haunted });
    // Features.
    // Forts and jetties face the middle of the cove, where the fighting is.
    const inward = Math.atan2(-cz, -cx) + (rand() - 0.5) * 0.6;
    if (plan.hut) {
      const p = at(r * 0.25, inward + 2.3);
      b.add(PROPS.hut, place(p.x, 0.95, p.z, rand() * Math.PI * 2, 1.25));
      top = Math.max(top, 5);
    }
    if (plan.flag) {
      const p = at(r * 0.3, inward - 2.0);
      b.add(PROPS.flag, place(p.x, 0.95, p.z, rand() * Math.PI * 2, 1.3));
    }
    if (plan.treasure) {
      const p = at(r * 0.12, rand() * Math.PI * 2);
      b.add(PROPS.hole, place(p.x, 1.0, p.z, rand() * Math.PI, 1.1));
      b.add(PROPS.shovel, place(p.x + 2.2, 0.95, p.z + 0.8, 0.6, 1.1, 1.1, 1.1, 0.25, 0.3));
      b.add(PROPS.bottle, place(p.x - 2.1, 0.95, p.z - 1.2, 0, 1.2));
    }
    if (plan.dock) {
      // A jetty running from the beach out to sea, with crates and a rowboat.
      const dock = this.proto(PROPS.dock);
      if (dock) {
        const len = dock.size.z * 1.35;
        const dir = inward - 0.75;
        const endKey = this.proto(PROPS.dockSmall) ? PROPS.dockSmall : PROPS.dock;
        for (let i = 0; i < 4; i++) {
          const p = at(r * 0.72 + i * len, dir);
          const key = i === 3 ? endKey : PROPS.dock;
          b.add(key, place(p.x, 1.1 - this.proto(key)!.size.y * 1.35, p.z, toYaw(dir), 1.35));
        }
        const end = at(r * 0.72 + 3 * len, dir);
        const side = at(r * 0.72 + 2.2 * len, dir);
        const off = { x: Math.cos(dir + Math.PI / 2) * 3.4, z: Math.sin(dir + Math.PI / 2) * 3.4 };
        // Ships bump into the jetty (and the rowboat moored beside it).
        for (let d = r * 0.95; d <= r * 0.72 + 3.4 * len; d += 2.6) {
          const p = at(d, dir);
          this.shoals.push({ x: p.x, z: p.z, r: 2, top: 1.6, dock: true });
        }
        this.shoals.push({ x: side.x + off.x, z: side.z + off.z, r: 1.8, top: 1.2, dock: true });
        b.add(PROPS.flag, place(end.x, 1.1, end.z, 0, 0.9));
        this.floater(seed % 2 ? PROPS.rowboatLarge : PROPS.rowboat, side.x + off.x, side.z + off.z, toYaw(dir), 1.25, rand() * 6);
      }
    }
    if (plan.fort) {
      const p = at(r * 0.32, inward + 0.5);
      this.forts.push({ x: p.x, z: p.z, yaw: toYaw(inward + 0.5), large: plan.fort === "large" });
      // The navy's pennant flies over every fort.
      const flag = at(r * 0.45, inward - 0.4);
      b.add(PROPS.pennant, place(flag.x, 0.95, flag.z, rand() * Math.PI * 2, 1.5));
      top = Math.max(top, plan.fort === "large" ? 11 : 8);
    }
    this.chunk(b, cx, cz, r + 6);
    this.shoals.push({ x: cx, z: cz, r: r * 0.92, top });
    this.islands.push({ id: seed, x: cx, z: cz, r, treasure: !!plan.treasure, haunted: !!plan.haunted });
  }

  private floater(key: string, x: number, z: number, yaw: number, scale: number, phase: number) {
    const proto = this.proto(key) ?? this.proto(PROPS.rowboat);
    if (!proto) return;
    const obj = proto.object.clone();
    obj.scale.setScalar(scale);
    this.group.add(obj);
    this.floaters.push({ obj, x, z, yaw, phase });
  }

  /** A port town: a big island with houses, market stalls, a long jetty with cargo, and a lighthouse or castle. */
  private port(def: PortDef, seed: number) {
    const rand = rng(7000 + seed * 131);
    const { x: cx, z: cz, r } = def;
    const b = new Batches(this.protos);
    const dir = Math.PI / 2 - def.dock;
    const at = (radius: number, angle: number) => ({ x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius });
    const top = this.ground(b, cx, cz, r, rand, { clear: dir });

    // The jetty.
    const dock = this.proto(PROPS.dock);
    const pieceLen = (dock?.size.z ?? 2.5) * 1.35;
    const pieces = 7;
    const start = r * 0.7;
    const len = pieces * pieceLen;
    if (dock) {
      for (let i = 0; i < pieces; i++) {
        const p = at(start + i * pieceLen, dir);
        b.add(PROPS.dock, place(p.x, 1.1 - dock.size.y * 1.35, p.z, def.dock, 1.35));
      }
      for (let d = r * 0.95; d <= start + len - pieceLen * 0.4; d += 2.6) {
        const p = at(d, dir);
        this.shoals.push({ x: p.x, z: p.z, r: 2, top: 1.6, dock: true });
      }
    }
    const side = (d: number, off: number) => {
      const p = at(d, dir);
      return { x: p.x + Math.cos(dir + Math.PI / 2) * off, z: p.z + Math.sin(dir + Math.PI / 2) * off };
    };
    // Lanterns along the jetty, cargo stacked at its root and end.
    for (let i = 1; i < pieces; i += 2) {
      for (const s of [1, -1]) {
        const p = side(start + i * pieceLen, s * 1.45);
        b.add(TOWN.lantern, place(p.x, 1.05, p.z, def.dock, 1.8));
      }
    }
    const cargo = def.industry ? [TOWN.cargoPileA, TOWN.cargoPileB, LOOT.crate] : [LOOT.crate, LOOT.barrel, LOOT.crate, LOOT.barrel];
    for (let i = 0; i < 5; i++) {
      const d = i < 3 ? start + pieceLen * (0.2 + i * 0.35) : start + len - pieceLen * (0.5 + (i - 3) * 0.6);
      const p = side(d, (i % 2 ? 1 : -1) * (0.6 + rand() * 0.4));
      const key = cargo[Math.floor(rand() * cargo.length)];
      b.add(key, place(p.x, 1.05, p.z, rand() * Math.PI * 2, key === LOOT.barrel || key === LOOT.crate ? 0.7 : 1.1));
    }
    const endFlag = at(start + len - pieceLen * 0.5, dir);
    b.add(def.style === "pirate" ? PROPS.flag : PROPS.pennant, place(endFlag.x, 1.05, endFlag.z, 0, 1));

    // Houses clustered on the harbour side.
    const spots: { x: number; z: number; s: number }[] = [];
    const free = (x: number, z: number, s: number) => spots.every((o) => Math.hypot(o.x - x, o.z - z) > o.s + s) && Math.hypot(x - cx, z - cz) < r * 0.78;
    // The jetty root stays clear.
    spots.push({ ...at(start + 1, dir), s: 3.2 });
    const stalls = [TOWN.stallRed, TOWN.stallGreen];
    for (let i = 0; i < 2; i++) {
      const p = at(r * 0.58, dir + (i ? 0.5 : -0.5));
      if (!free(p.x, p.z, 2.4)) continue;
      spots.push({ ...p, s: 2.4 });
      if (def.style === "pirate") b.add(PROPS.hut, place(p.x, 0.95, p.z, def.dock + Math.PI, 1.1));
      else b.add(stalls[i], place(p.x, 0.92, p.z, def.dock + Math.PI, 2.3));
    }
    if (def.style !== "pirate") {
      const cart = side(start - 3, 3.2);
      b.add(TOWN.cart, place(cart.x, 0.95, cart.z, def.dock + 0.6, 2.2));
    }
    let built = 0;
    for (let tries = 0; built < def.houses && tries < 160; tries++) {
      const a = dir + (rand() - 0.5) * 3.4;
      const p = at(r * (0.18 + rand() * 0.5), a);
      if (!free(p.x, p.z, 3.4)) continue;
      spots.push({ ...p, s: 3.4 });
      const yaw = def.dock + Math.round(rand() * 3) * (Math.PI / 2) + (rand() - 0.5) * 0.3;
      if (def.style === "pirate") b.add(rand() < 0.6 ? PROPS.hut : PROPS.towerSmall, place(p.x, 0.95, p.z, yaw, rand() < 0.5 ? 1.25 : 1));
      else this.house(b, p.x, p.z, yaw, rand() < 0.35 ? 2 : 1, def.style, rand);
      built++;
    }
    // Landmarks.
    if (def.lighthouse) {
      const p = at(r * 0.55, dir + Math.PI * 0.72);
      b.add(PROPS.towerLarge, place(p.x, 0.85, p.z, rand() * Math.PI * 2, 1.1));
      const f = at(r * 0.55 + 4, dir + Math.PI * 0.72);
      b.add(PROPS.pennant, place(f.x, 0.95, f.z, 0, 1.3));
    }
    if (def.castle) {
      // A wall along the harbour front with a gate and two towers.
      for (let i = -2; i <= 2; i++) {
        const a = dir + i * 0.32;
        const p = at(r * 0.66, a);
        b.add(i === 0 ? TOWN.castleGate : TOWN.castleWall, place(p.x, 0.7, p.z, toYaw(a) + Math.PI / 2, 1.1));
      }
      for (const s of [-1, 1]) {
        const p = at(r * 0.68, dir + s * 0.95);
        b.add(PROPS.towerSmall, place(p.x, 0.85, p.z, rand() * Math.PI * 2, 1.15));
      }
    }
    if (def.style === "pirate") {
      for (const s of [-1, 1]) {
        const p = at(r * 0.45, dir + s * 1.4);
        b.add(PROPS.flag, place(p.x, 0.95, p.z, rand() * Math.PI * 2, 1.4));
      }
      const w = at(r + 10, dir + 1.1);
      b.add(PROPS.wreck, place(w.x, -2.2, w.z, rand() * Math.PI * 2, 1, 1, 1, 0.12, 0.3));
      this.shoals.push({ x: w.x, z: w.z, r: 4, top: 3 });
    }
    // Boats moored around the harbour.
    const moor = side(start + pieceLen * 1.2, -4.2);
    this.floater(PROPS.rowboatLarge, moor.x, moor.z, def.dock, 1.25, rand() * 6);
    this.shoals.push({ x: moor.x, z: moor.z, r: 1.8, top: 1.2, dock: true });
    const fish = at(r + 6, dir - 0.7);
    this.floater(def.style === "pirate" ? PROPS.rowboat : TRADE_SHIPS.fishing, fish.x, fish.z, def.dock - 1.2, def.style === "pirate" ? 1.25 : 2.1, rand() * 6);
    this.shoals.push({ x: fish.x, z: fish.z, r: 2.6, top: 2, dock: true });

    this.chunk(b, cx, cz, r + len + 8);
    this.shoals.push({ x: cx, z: cz, r: r * 0.92, top: Math.max(top, 10) });
    const jetty = at(start, dir);
    const zone = at(start + len + 10, dir);
    this.ports.push({ id: def.id, def, x: cx, z: cz, r, jx: jetty.x, jz: jetty.z, h: def.dock, len, zone: { x: zone.x, z: zone.z, r: 30 } });
  }

  /** A little house: four Fantasy Town walls (door and shuttered windows) under a pointed roof. */
  private house(b: Batches, x: number, z: number, yaw: number, floors: number, style: "wood" | "stone", rand: () => number) {
    const S = 3.2;
    const walls = style === "stone" ? [TOWN.wallStone, TOWN.wallStoneDoor, TOWN.wallStoneWindow] : [TOWN.wallWood, TOWN.wallWoodDoor, TOWN.wallWoodWindow];
    const base = 0.85;
    for (let f = 0; f < floors; f++) {
      for (let side = 0; side < 4; side++) {
        const a = yaw + (side * Math.PI) / 2;
        const key = f === 0 && side === 0 ? walls[1] : rand() < 0.6 ? walls[2] : walls[0];
        // A wall's thin axis is its local x: turn it to face outwards.
        b.add(key, place(x + Math.sin(a) * 0.45 * S, base + f * S, z + Math.cos(a) * 0.45 * S, a - Math.PI / 2, S));
      }
    }
    b.add(floors > 1 ? TOWN.roofHigh : TOWN.roof, place(x, base + floors * S, z, yaw, S));
  }

  private reef(reef: ReefPlan, seed: number) {
    const rand = rng(5000 + seed * 31);
    const b = new Batches(this.protos);
    const rocks = [ISLAND.rocksA, ISLAND.rocksB, ISLAND.rocksC];
    const count = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const d = i === 0 ? 0 : reef.r * 0.55;
      const s = i === 0 ? 1.15 + rand() * 0.3 : 0.7 + rand() * 0.3;
      b.add(rocks[Math.floor(rand() * rocks.length)], place(reef.x + Math.cos(a) * d, -1.1, reef.z + Math.sin(a) * d, rand() * Math.PI * 2, s));
    }
    if (reef.wreck) b.add(PROPS.wreck, place(reef.x + 6, -2.2, reef.z + 4, 0.8, 1, 1, 1, 0.12, 0.32));
    this.chunk(b, reef.x, reef.z, reef.r + 12);
    this.shoals.push({ x: reef.x, z: reef.z, r: reef.r, top: 2.6 });
  }

  /** Buoys (every other one with a flag) mark the edge of the cove — instanced, one draw call per part. */
  private buildBuoys(radius: number) {
    const count = 40;
    const kinds = [this.protos.get(PROPS.buoyFlag), this.protos.get(PROPS.buoy)];
    kinds.forEach((proto, kind) => {
      if (!proto) return;
      const places: { x: number; z: number; phase: number }[] = [];
      for (let i = kind; i < count; i += 2) {
        const a = (i / count) * Math.PI * 2;
        places.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius, phase: i * 1.7 });
      }
      const meshes = bake(proto).map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry.clone().applyMatrix4(part.matrix), part.material, places.length);
        mesh.castShadow = false;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        return mesh;
      });
      this.buoys.push({ meshes, places });
    });
    this.update(0);
  }

  /** Hides islands far from (x, z) — the open sea has far more than fog lets you see. */
  cull(x: number, z: number, dist: number) {
    for (const c of this.chunks) c.obj.visible = Math.hypot(c.x - x, c.z - z) < dist + c.r;
    for (const f of this.floaters) f.obj.visible = Math.hypot(f.x - x, f.z - z) < dist;
  }

  /** Bobs the floating props on the waves. */
  update(time: number) {
    for (const f of this.floaters) {
      if (!f.obj.visible) continue;
      const h = waveHeight(f.x, f.z);
      f.obj.position.set(f.x, h - 0.25, f.z);
      f.obj.rotation.set(Math.sin(time * 1.3 + f.phase) * 0.06, f.yaw + Math.sin(time * 0.4 + f.phase) * 0.15, Math.sin(time * 1.1 + f.phase) * 0.08, "YXZ");
    }
    for (const { meshes, places } of this.buoys) {
      places.forEach((b, i) => {
        const h = waveHeight(b.x, b.z);
        m4.compose(
          v3.set(b.x, h - 0.55, b.z),
          q.setFromEuler(e.set(Math.sin(time * 1.6 + b.phase) * 0.12, b.phase, Math.cos(time * 1.4 + b.phase) * 0.12, "YXZ")),
          BUOY_SCALE,
        );
        for (const mesh of meshes) mesh.setMatrixAt(i, m4);
      });
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    for (const { meshes } of this.buoys) {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
  }
}
