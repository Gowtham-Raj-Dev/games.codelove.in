import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Proto } from "../shared/assets";
import { ISLANDS, ISLETS, type IslandDef } from "./data";
import { AERO, CASTLE, NATURE, PARCEL, PROP, ROCKS, TOWN, WATERFALL } from "./manifest";

/**
 * Builds the archipelago from library models: floating rocks, villages, castles, mills and the
 * hub station. Static scenery is merged per island and material (few draw calls). Every island
 * also gets a column heightfield (top / bottom per 2 m cell) for cheap, robust collisions.
 */

const CELL = 2;
const EMPTY_TOP = -1e9;
const EMPTY_BOTTOM = 1e9;
/** Fantasy Town Kit unit → metres. */
const U = 4.6;

export type Rng = () => number;
export function rng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Heightfield --------------------------------------------------------------------------------------

const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();

export class Heightfield {
  readonly nx: number;
  readonly nz: number;
  readonly top: Float32Array;
  readonly bottom: Float32Array;
  ground: Float32Array | null = null;

  constructor(
    readonly x0: number,
    readonly z0: number,
    x1: number,
    z1: number,
  ) {
    this.nx = Math.max(1, Math.ceil((x1 - x0) / CELL));
    this.nz = Math.max(1, Math.ceil((z1 - z0) / CELL));
    this.top = new Float32Array(this.nx * this.nz).fill(EMPTY_TOP);
    this.bottom = new Float32Array(this.nx * this.nz).fill(EMPTY_BOTTOM);
  }

  get x1() {
    return this.x0 + this.nx * CELL;
  }

  get z1() {
    return this.z0 + this.nz * CELL;
  }

  index(x: number, z: number) {
    const i = Math.floor((x - this.x0) / CELL);
    const j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  private put(i: number, j: number, y: number) {
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return;
    const k = j * this.nx + i;
    if (y > this.top[k]) this.top[k] = y;
    if (y < this.bottom[k]) this.bottom[k] = y;
  }

  private putPoint(x: number, y: number, z: number) {
    this.put(Math.floor((x - this.x0) / CELL), Math.floor((z - this.z0) / CELL), y);
  }

  private tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    const minX = Math.min(a.x, b.x, c.x);
    const maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z);
    const maxZ = Math.max(a.z, b.z, c.z);
    const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(area) > 1e-6) {
      const i0 = Math.max(0, Math.floor((minX - this.x0) / CELL));
      const i1 = Math.min(this.nx - 1, Math.floor((maxX - this.x0) / CELL));
      const j0 = Math.max(0, Math.floor((minZ - this.z0) / CELL));
      const j1 = Math.min(this.nz - 1, Math.floor((maxZ - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) {
        const pz = this.z0 + (j + 0.5) * CELL;
        for (let i = i0; i <= i1; i++) {
          const px = this.x0 + (i + 0.5) * CELL;
          const w0 = ((b.x - px) * (c.z - pz) - (c.x - px) * (b.z - pz)) / area;
          const w1 = ((c.x - px) * (a.z - pz) - (a.x - px) * (c.z - pz)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
          this.put(i, j, w0 * a.y + w1 * b.y + w2 * c.y);
        }
      }
    }
    // Edges too, so walls and other near-vertical faces register.
    this.edge(a, b);
    this.edge(b, c);
    this.edge(c, a);
  }

  private edge(p: THREE.Vector3, q: THREE.Vector3) {
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const steps = Math.ceil(len / (CELL * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = steps ? s / steps : 0;
      this.putPoint(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, p.z + (q.z - p.z) * t);
    }
    if (!steps) this.putPoint(q.x, q.y, q.z);
  }

  rasterize(geo: THREE.BufferGeometry, matrix: THREE.Matrix4) {
    const pos = geo.attributes.position;
    const index = geo.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const ia = index ? index.getX(t) : t;
      const ib = index ? index.getX(t + 1) : t + 1;
      const ic = index ? index.getX(t + 2) : t + 2;
      va.fromBufferAttribute(pos, ia).applyMatrix4(matrix);
      vb.fromBufferAttribute(pos, ib).applyMatrix4(matrix);
      vc.fromBufferAttribute(pos, ic).applyMatrix4(matrix);
      this.tri(va, vb, vc);
    }
  }

  shift(dy: number) {
    for (let k = 0; k < this.top.length; k++) {
      if (this.top[k] > EMPTY_TOP) this.top[k] += dy;
      if (this.bottom[k] < EMPTY_BOTTOM) this.bottom[k] += dy;
    }
  }

  snapshotGround() {
    this.ground = this.top.slice();
  }

  groundAt(x: number, z: number) {
    const k = this.index(x, z);
    if (k < 0 || !this.ground) return EMPTY_TOP;
    return this.ground[k];
  }
}

// --- Static merging -------------------------------------------------------------------------------------

function bake(src: THREE.BufferGeometry, matrix: THREE.Matrix4, withUv: boolean, withColor: boolean) {
  const out = new THREE.BufferGeometry();
  const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number) => {
    const arr = new Float32Array(attr.count * size);
    for (let i = 0; i < attr.count; i++) {
      arr[i * size] = attr.getX(i);
      arr[i * size + 1] = attr.getY(i);
      if (size > 2) arr[i * size + 2] = attr.getZ(i);
      if (size > 3) arr[i * size + 3] = attr.getW(i);
    }
    return new THREE.BufferAttribute(arr, size);
  };
  const pos = src.attributes.position;
  out.setAttribute("position", copy(pos, 3));
  if (src.attributes.normal) out.setAttribute("normal", copy(src.attributes.normal, 3));
  if (withUv) {
    if (src.attributes.uv) out.setAttribute("uv", copy(src.attributes.uv, 2));
    else out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  if (withColor) {
    const c = src.attributes.color;
    if (c) out.setAttribute("color", copy(c, c.itemSize === 4 ? 4 : 3));
    else out.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  }
  if (src.index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array as ArrayLike<number>), 1));
  else out.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: pos.count }, (_, i) => i), 1));
  out.applyMatrix4(matrix);
  if (!src.attributes.normal) out.computeVertexNormals();
  return out;
}

class StaticBuilder {
  private readonly groups = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, cast: boolean, receive: boolean) {
    const m = material as THREE.MeshStandardMaterial;
    const withUv = !!(m.map || m.emissiveMap || m.normalMap || m.roughnessMap || m.alphaMap);
    const withColor = !!m.vertexColors;
    const key = `${material.uuid}|${cast}|${receive}`;
    let group = this.groups.get(key);
    if (!group) this.groups.set(key, (group = { material, parts: [], cast, receive }));
    group.parts.push(bake(geometry, matrix, withUv, withColor));
  }

  build(parent: THREE.Object3D) {
    for (const g of this.groups.values()) {
      const merged = mergeGeometries(g.parts, false);
      g.parts.forEach((p) => p.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, g.material);
      mesh.castShadow = g.cast;
      mesh.receiveShadow = g.receive;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

// --- Materials shared across a kit (each GLB carries its own copy) --------------------------------------------

const SHARED_KITS = new Set(["fantasy-town-kit", "castle-kit", "nature-kit", "momuspark", "aero-system", "car-kit"]);

export class MaterialBank {
  private readonly bank = new Map<string, THREE.Material>();

  /** Makes every model of a kit use one material per name, so merged scenery collapses to few draws. */
  unify(key: string, root: THREE.Object3D) {
    const kit = key.split("/")[0];
    if (!SHARED_KITS.has(kit)) return;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material) => {
        const id = `${kit}|${m.name}|${(m as THREE.MeshStandardMaterial).map ? "t" : "c"}`;
        const found = this.bank.get(id);
        if (found) return found;
        this.bank.set(id, m);
        return m;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }
}

// --- Islands ------------------------------------------------------------------------------------------------

export interface Spinner {
  obj: THREE.Object3D;
  speed: number;
}

export interface Island {
  def: IslandDef | null;
  name: string;
  x: number;
  z: number;
  /** Grass height. */
  top: number;
  /** Highest solid point (incl. buildings). */
  maxY: number;
  minY: number;
  radius: number;
  /** Centre of the landing pad's top. */
  pad: THREE.Vector3;
  /** Height of the station hoop above the pad. */
  hoopY: number;
  hf: Heightfield;
  group: THREE.Group;
}

interface Occupied {
  x: number;
  z: number;
  r: number;
}

const m4 = new THREE.Matrix4();
const m4b = new THREE.Matrix4();
const q = new THREE.Quaternion();
const yAxis = new THREE.Vector3(0, 1, 0);
const sv = new THREE.Vector3();
const pv = new THREE.Vector3();

export class World {
  readonly group = new THREE.Group();
  readonly islands: Island[] = [];
  readonly spinners: Spinner[] = [];
  readonly waterfalls: THREE.Object3D[] = [];
  private waterMaterial: THREE.Material | null = null;

  constructor(private readonly protos: Map<string, Proto>) {
    this.group.name = "world";
    ISLANDS.forEach((def) => this.islands.push(this.buildIsland(def)));
    ISLETS.forEach((s, i) => this.islands.push(this.buildIslet(s, i)));
    for (const isl of this.islands) this.group.add(isl.group);
  }

  get stations() {
    return this.islands.filter((i) => i.def);
  }

  /** Animates windmills, water wheels and waterfalls. */
  update(dt: number) {
    for (const s of this.spinners) s.obj.rotation.x += s.speed * dt;
    const map = (this.waterMaterial as THREE.MeshStandardMaterial | null)?.map;
    if (map) map.offset.y = (map.offset.y + dt * 0.35) % 1;
  }

  /** Solid column at (x, z): the highest top and lowest bottom over all islands there. */
  column(x: number, z: number, out: { top: number; bottom: number }) {
    out.top = EMPTY_TOP;
    out.bottom = EMPTY_BOTTOM;
    for (const isl of this.islands) {
      const hf = isl.hf;
      if (x < hf.x0 || z < hf.z0 || x >= hf.x1 || z >= hf.z1) continue;
      const k = hf.index(x, z);
      if (k < 0) continue;
      if (hf.top[k] > out.top) out.top = hf.top[k];
      if (hf.bottom[k] < out.bottom) out.bottom = hf.bottom[k];
    }
    return out.top > EMPTY_TOP;
  }

  /** Islands whose bounds contain (x, z) within a margin. */
  near(x: number, z: number, margin: number) {
    return this.islands.filter((i) => x > i.hf.x0 - margin && x < i.hf.x1 + margin && z > i.hf.z0 - margin && z < i.hf.z1 + margin);
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // Merged geometry is ours; clones share the prototypes' geometry (disposed with the protos).
      if (mesh.isMesh && mesh.userData.merged !== false && !mesh.userData.clone) mesh.geometry.dispose();
    });
  }

  // --- Building ---------------------------------------------------------------------------------------------

  private buildIsland(def: IslandDef): Island {
    const key = def.model === "aero" ? AERO.island : ROCKS[def.model];
    const proto = this.protos.get(key);
    const group = new THREE.Group();
    group.name = def.name;
    const scale = proto ? def.size / Math.max(proto.size.x, proto.size.z) : 1;
    const half = def.size * 0.5 + 40;
    const hf = new Heightfield(def.x - half, def.z - half, def.x + half, def.z + half);
    const builder = new StaticBuilder();
    const isl: Island = {
      def,
      name: def.name,
      x: def.x,
      z: def.z,
      top: def.y,
      maxY: def.y,
      minY: def.y - 40,
      radius: def.size * 0.5,
      pad: new THREE.Vector3(def.x, def.y, def.z),
      hoopY: def.y + 16,
      hf,
      group,
    };
    if (!proto) return isl;

    // The rock itself, measured first so the grass sits at def.y.
    const rockParts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4 }[] = [];
    q.setFromAxisAngle(yAxis, def.yaw);
    m4.compose(sv.set(def.x, 0, def.z), q, pv.setScalar(scale));
    proto.object.updateMatrixWorld(true);
    proto.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || /collider/i.test(mesh.name)) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(m4, mesh.matrixWorld);
      hf.rasterize(mesh.geometry, matrix);
      rockParts.push({ geo: mesh.geometry, mat: mesh.material, matrix });
    });
    const localTop = this.surface(hf, def.x, def.z, def.size * 0.32);
    const dy = def.y - localTop;
    hf.shift(dy);
    hf.snapshotGround();
    const lift = new THREE.Matrix4().makeTranslation(0, dy, 0);
    for (const p of rockParts) {
      const matrix = new THREE.Matrix4().multiplyMatrices(lift, p.matrix);
      for (const mat of Array.isArray(p.mat) ? p.mat : [p.mat]) builder.add(p.geo, mat, matrix, true, true);
    }
    let minY = EMPTY_BOTTOM;
    for (let k = 0; k < hf.bottom.length; k++) if (hf.bottom[k] < minY) minY = hf.bottom[k];
    isl.minY = minY;
    isl.radius = this.measureRadius(hf, def.x, def.z, def.y);

    const deco = new Decorator(this, isl, builder, rng(def.id * 7919 + 13));
    deco.pad();
    switch (def.kind) {
      case "hub":
        deco.hub();
        break;
      case "windmill":
        deco.windmillVillage();
        break;
      case "market":
        deco.market();
        break;
      case "orchard":
        deco.orchard();
        break;
      case "watermill":
        deco.watermill();
        break;
      case "castle":
        deco.castle();
        break;
      case "lighthouse":
        deco.lighthouse();
        break;
      default:
        deco.village();
    }
    deco.filler();

    builder.build(group);
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.clone) o.userData.merged = true;
    });
    let maxY = EMPTY_TOP;
    for (let k = 0; k < hf.top.length; k++) if (hf.top[k] > maxY) maxY = hf.top[k];
    isl.maxY = maxY;
    return isl;
  }

  private buildIslet(s: (typeof ISLETS)[number], i: number): Island {
    const key = ROCKS[s.model];
    const proto = this.protos.get(key);
    const group = new THREE.Group();
    const half = s.size * 0.5 + 16;
    const hf = new Heightfield(s.x - half, s.z - half, s.x + half, s.z + half);
    const isl: Island = {
      def: null,
      name: "islet",
      x: s.x,
      z: s.z,
      top: s.y,
      maxY: s.y,
      minY: s.y - 10,
      radius: s.size * 0.5,
      pad: new THREE.Vector3(s.x, s.y, s.z),
      hoopY: s.y,
      hf,
      group,
    };
    if (!proto) return isl;
    const builder = new StaticBuilder();
    const scale = s.size / Math.max(proto.size.x, proto.size.z);
    q.setFromAxisAngle(yAxis, s.yaw);
    m4.compose(sv.set(s.x, 0, s.z), q, pv.setScalar(scale));
    const parts: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[]; matrix: THREE.Matrix4 }[] = [];
    proto.object.updateMatrixWorld(true);
    proto.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || /collider/i.test(mesh.name)) return;
      const matrix = new THREE.Matrix4().multiplyMatrices(m4, mesh.matrixWorld);
      hf.rasterize(mesh.geometry, matrix);
      parts.push({ geo: mesh.geometry, mat: mesh.material, matrix });
    });
    const localTop = this.surface(hf, s.x, s.z, s.size * 0.3);
    const dy = s.y - localTop;
    hf.shift(dy);
    hf.snapshotGround();
    const lift = new THREE.Matrix4().makeTranslation(0, dy, 0);
    for (const p of parts) {
      const matrix = new THREE.Matrix4().multiplyMatrices(lift, p.matrix);
      for (const mat of Array.isArray(p.mat) ? p.mat : [p.mat]) builder.add(p.geo, mat, matrix, true, true);
    }
    // A tree or two on the bigger rocks.
    if (s.model !== "d" && s.size >= 20) {
      const deco = new Decorator(this, isl, builder, rng(500 + i * 31));
      deco.scatterTrees(s.size >= 24 ? 2 : 1);
    }
    builder.build(group);
    let minY = EMPTY_BOTTOM;
    let maxY = EMPTY_TOP;
    for (let k = 0; k < hf.top.length; k++) {
      if (hf.top[k] > maxY) maxY = hf.top[k];
      if (hf.bottom[k] < minY) minY = hf.bottom[k];
    }
    isl.maxY = maxY;
    isl.minY = minY;
    return isl;
  }

  /** Typical grass height near the centre (60th percentile of the tops within r). */
  private surface(hf: Heightfield, cx: number, cz: number, r: number) {
    const values: number[] = [];
    for (let j = 0; j < hf.nz; j++) {
      for (let i = 0; i < hf.nx; i++) {
        const x = hf.x0 + (i + 0.5) * CELL;
        const z = hf.z0 + (j + 0.5) * CELL;
        if (Math.hypot(x - cx, z - cz) > r) continue;
        const t = hf.top[j * hf.nx + i];
        if (t > EMPTY_TOP) values.push(t);
      }
    }
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length * 0.6)];
  }

  private measureRadius(hf: Heightfield, cx: number, cz: number, top: number) {
    let r = 0;
    for (let j = 0; j < hf.nz; j++) {
      for (let i = 0; i < hf.nx; i++) {
        const t = hf.top[j * hf.nx + i];
        if (t < top - 6) continue;
        const d = Math.hypot(hf.x0 + (i + 0.5) * CELL - cx, hf.z0 + (j + 0.5) * CELL - cz);
        if (d > r) r = d;
      }
    }
    return r || 20;
  }

  // --- Used by the decorator ----------------------------------------------------------------------------------

  proto(key: string) {
    return this.protos.get(key);
  }

  addSpinner(obj: THREE.Object3D, speed: number) {
    this.spinners.push({ obj, speed });
  }

  addWaterfall(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!this.waterMaterial) {
        mat.side = THREE.DoubleSide;
        mat.transparent = true;
        mat.depthWrite = false;
        mat.alphaTest = 0.05;
        if (mat.map) {
          mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
          mat.map.needsUpdate = true;
        }
        this.waterMaterial = mat;
      }
      mesh.material = this.waterMaterial;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    this.waterfalls.push(obj);
  }
}

// --- Decoration -----------------------------------------------------------------------------------------------

class Decorator {
  private readonly occupied: Occupied[] = [];
  private readonly cx: number;
  private readonly cz: number;
  private readonly R: number;

  constructor(
    private readonly world: World,
    private readonly isl: Island,
    private readonly builder: StaticBuilder,
    private readonly rand: Rng,
  ) {
    this.cx = isl.x;
    this.cz = isl.z;
    this.R = isl.radius;
  }

  private pick<T>(list: readonly T[]) {
    return list[Math.floor(this.rand() * list.length)];
  }

  /** Ground height under a footprint (lowest sample, so nothing floats). */
  private groundUnder(x: number, z: number, r: number) {
    const hf = this.isl.hf;
    let lo = hf.groundAt(x, z);
    let hi = lo;
    for (let a = 0; a < 6; a++) {
      const g = hf.groundAt(x + Math.cos(a * 1.047) * r, z + Math.sin(a * 1.047) * r);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    return { lo, hi };
  }

  private free(x: number, z: number, r: number) {
    for (const o of this.occupied) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
    return true;
  }

  private claim(x: number, z: number, r: number) {
    this.occupied.push({ x, z, r });
  }

  /** A flat, free spot of radius r between minF·R and maxF·R from the centre. */
  spot(r: number, minF: number, maxF: number, tries = 60, flat = 1.6): { x: number; z: number; y: number } | null {
    const top = this.isl.top;
    for (let t = 0; t < tries; t++) {
      const a = this.rand() * Math.PI * 2;
      const d = this.R * (minF + (maxF - minF) * Math.sqrt(this.rand()));
      const x = this.cx + Math.cos(a) * d;
      const z = this.cz + Math.sin(a) * d;
      if (!this.free(x, z, r)) continue;
      const { lo, hi } = this.groundUnder(x, z, r);
      if (lo < top - 3 || hi > top + 4 || hi - lo > flat * (1 + r / 8)) continue;
      return { x, z, y: lo };
    }
    return null;
  }

  /** Places a prototype; solid things are added to the collision heightfield. */
  put(key: string, x: number, y: number, z: number, yaw: number, scale: number, { solid = true, cast = true, pitch = 0 } = {}) {
    const proto = this.world.proto(key);
    if (!proto) return null;
    q.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
    m4.compose(sv.set(x, y, z), q, pv.setScalar(scale));
    proto.object.updateMatrixWorld(true);
    proto.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      m4b.multiplyMatrices(m4, mesh.matrixWorld);
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.builder.add(mesh.geometry, mat, m4b, cast, true);
      // See-through parts (light rays, holograms) are not solid.
      const see = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every((m) => m.transparent);
      if (solid && !see) this.isl.hf.rasterize(mesh.geometry, m4b);
    });
    return proto;
  }

  /** A clone that stays a separate object (animated). */
  private clone(key: string, x: number, y: number, z: number, yaw: number, scale: number) {
    const proto = this.world.proto(key);
    if (!proto) return null;
    const obj = proto.object.clone();
    obj.position.set(x, y, z);
    obj.rotation.set(0, yaw, 0);
    obj.scale.setScalar(scale);
    obj.traverse((o) => (o.userData.clone = true));
    this.isl.group.add(obj);
    return obj;
  }

  private faceCentre(x: number, z: number) {
    return Math.atan2(this.cx - x, this.cz - z);
  }

  // --- Pieces ---------------------------------------------------------------------------------------------------

  pad() {
    const isl = this.isl;
    // Face the hub (or, for the hub, the open sky to the south-east).
    const toward = isl.def?.kind === "hub" ? Math.atan2(0.75, -0.66) : Math.atan2(-isl.x, -isl.z);
    let best: { x: number; z: number; y: number } | null = null;
    for (let t = 0; t < 24 && !best; t++) {
      const a = toward + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.32;
      for (const f of [0.5, 0.42, 0.58, 0.34]) {
        const x = this.cx + Math.sin(a) * this.R * f;
        const z = this.cz + Math.cos(a) * this.R * f;
        const { lo, hi } = this.groundUnder(x, z, 8);
        if (lo > isl.top - 3 && hi - lo < 3.2) {
          best = { x, z, y: lo };
          break;
        }
      }
    }
    if (!best) best = { x: this.cx, z: this.cz, y: isl.top };
    const pad = this.world.proto(AERO.pad);
    const padScale = pad ? 17 / pad.size.x : 1;
    this.put(AERO.pad, best.x, best.y - 0.4, best.z, 0, padScale);
    const padTop = best.y - 0.4 + (pad ? pad.size.y * padScale : 1);
    isl.pad.set(best.x, padTop, best.z);
    // The station hoop floating above the pad.
    const hoop = this.world.proto(AERO.ringGold);
    if (hoop) {
      const hs = 22 / hoop.size.x;
      isl.hoopY = padTop + 15;
      this.put(AERO.ringGold, best.x, isl.hoopY, best.z, 0.3, hs, { solid: false, cast: false });
    }
    // Lamps either side.
    const side = Math.atan2(best.x - this.cx, best.z - this.cz) + Math.PI / 2;
    for (const s of [-1, 1]) {
      const lx = best.x + Math.sin(side) * 12 * s;
      const lz = best.z + Math.cos(side) * 12 * s;
      const g = this.isl.hf.groundAt(lx, lz);
      if (g > isl.top - 4) this.put(AERO.lamp, lx, g - 0.3, lz, side, 1.1);
    }
    // A few parcels waiting on the pad's edge.
    const pk = this.world.proto(PARCEL);
    if (pk) {
      for (let i = 0; i < 3; i++) {
        const a = side + Math.PI / 2 + (i - 1) * 0.35;
        this.put(PARCEL, best.x + Math.sin(a) * 9.5, padTop - 0.1, best.z + Math.cos(a) * 9.5, a + i, 2.2 + (i % 2) * 0.4, { solid: false });
      }
    }
    this.claim(best.x, best.z, 15);
  }

  house(x: number, z: number, yaw: number, y: number, floors: number, wood: boolean) {
    const plain = wood ? TOWN.wood : TOWN.wall;
    const window = wood ? TOWN.woodWindow : TOWN.wallWindow;
    const door = wood ? TOWN.woodDoor : TOWN.wallDoor;
    const sides = [
      { nx: 0, nz: 1 },
      { nx: -1, nz: 0 },
      { nx: 0, nz: -1 },
      { nx: 1, nz: 0 },
    ];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (let f = 0; f < floors; f++) {
      sides.forEach((s, i) => {
        const key = f === 0 && i === 0 ? door : this.rand() < 0.6 ? window : plain;
        const proto = this.world.proto(key);
        if (!proto) return;
        const off = 0.4 * U + (proto.size.x * U) / 2;
        const lx = s.nx * off;
        const lz = s.nz * off;
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        const pieceYaw = Math.atan2(s.nz, -s.nx);
        this.put(key, wx, y + f * U, wz, yaw + pieceYaw, U);
      });
    }
    const roof = floors > 1 || this.rand() < 0.5 ? TOWN.roofHigh : TOWN.roof;
    this.put(roof, x, y + floors * U, z, yaw, U);
    this.claim(x, z, U * 0.85);
  }

  tower(x: number, z: number, y: number, mids: number, s: number, flag = true) {
    const base = this.world.proto(CASTLE.base);
    const mid = this.world.proto(CASTLE.mid);
    if (!base || !mid) return y;
    this.put(CASTLE.base, x, y, z, 0, s);
    let h = y + base.size.y * s;
    for (let i = 0; i < mids; i++) {
      this.put(CASTLE.mid, x, h, z, 0, s);
      h += mid.size.y * s;
    }
    const roof = this.world.proto(CASTLE.roof);
    this.put(CASTLE.roof, x, h, z, 0, s);
    const apex = h + (roof?.size.y ?? 1) * s;
    if (flag) this.put(this.rand() < 0.5 ? CASTLE.flag : CASTLE.pennant, x, apex - 0.15 * s, z, this.rand() * 6, s * 0.8);
    this.claim(x, z, s * 0.55);
    return h;
  }

  tree(x: number, z: number, y: number) {
    const r = this.rand();
    if (r < 0.25) this.put(NATURE.oak, x, y - 0.2, z, this.rand() * 6, 7 + this.rand() * 3);
    else if (r < 0.45) this.put(NATURE.fall, x, y - 0.2, z, this.rand() * 6, 7 + this.rand() * 3);
    else if (r < 0.6) this.put(NATURE.pine, x, y - 0.2, z, this.rand() * 6, 6 + this.rand() * 3);
    else if (r < 0.75) this.put(TOWN.treeRound, x, y - 0.2, z, this.rand() * 6, 3.6 + this.rand() * 1.2);
    else if (r < 0.88) this.put(NATURE.oakFall, x, y - 0.2, z, this.rand() * 6, 7 + this.rand() * 3);
    else this.put(TOWN.treeCrooked, x, y - 0.2, z, this.rand() * 6, 3.8 + this.rand());
    this.claim(x, z, 3.2);
  }

  scatterTrees(n: number, minF = 0.1, maxF = 0.75) {
    for (let i = 0; i < n; i++) {
      const s = this.spot(3, minF, maxF, 30, 2.4);
      if (s) this.tree(s.x, s.z, s.y);
    }
  }

  houses(n: number, minF: number, maxF: number, tall = 0.3) {
    for (let i = 0; i < n; i++) {
      const s = this.spot(U * 0.8, minF, maxF, 50);
      if (!s) continue;
      const yaw = this.faceCentre(s.x, s.z) + (this.rand() - 0.5) * 0.5;
      this.house(s.x, s.z, yaw, s.y - 0.25, this.rand() < tall ? 2 : 1, this.rand() < 0.4);
    }
  }

  lanterns(n: number, minF: number, maxF: number) {
    for (let i = 0; i < n; i++) {
      const s = this.spot(1.2, minF, maxF, 30, 3);
      if (!s) continue;
      this.put(TOWN.lantern, s.x, s.y - 0.1, s.z, this.rand() * 6, 3.6);
      this.claim(s.x, s.z, 1.5);
    }
  }

  props(keys: string[], n: number, scale: number, minF: number, maxF: number, r = 3) {
    for (let i = 0; i < n; i++) {
      const s = this.spot(r, minF, maxF, 30, 2);
      if (!s) continue;
      this.put(this.pick(keys), s.x, s.y - 0.1, s.z, this.faceCentre(s.x, s.z) + (this.rand() - 0.5), scale);
      this.claim(s.x, s.z, r);
    }
  }

  /** Small things on the grass: flowers, bushes, rocks (not solid). */
  filler() {
    const n = Math.round(this.R / 3);
    for (let i = 0; i < n; i++) {
      const s = this.spot(1, 0.05, 0.86, 12, 3);
      if (!s) continue;
      const r = this.rand();
      if (r < 0.35) this.put(this.rand() < 0.5 ? NATURE.flowerRed : NATURE.flowerYellow, s.x, s.y - 0.05, s.z, this.rand() * 6, 5 + this.rand() * 3, { solid: false, cast: false });
      else if (r < 0.7) this.put(NATURE.bush, s.x, s.y - 0.2, s.z, this.rand() * 6, 4 + this.rand() * 2, { solid: false });
      else if (r < 0.85) this.put(NATURE.rock, s.x, s.y - 0.3, s.z, this.rand() * 6, 4 + this.rand() * 3, { solid: false });
      else this.put(NATURE.pumpkin, s.x, s.y - 0.05, s.z, this.rand() * 6, 3.5, { solid: false });
      this.claim(s.x, s.z, 1);
    }
  }

  // --- Island kinds ------------------------------------------------------------------------------------------------

  hub() {
    const isl = this.isl;
    // The big spiral station on the far side from the pad.
    const padAngle = Math.atan2(isl.pad.x - this.cx, isl.pad.z - this.cz);
    const a = padAngle + Math.PI;
    const sx = this.cx + Math.sin(a) * this.R * 0.3;
    const sz = this.cz + Math.cos(a) * this.R * 0.3;
    const station = this.world.proto(AERO.station);
    if (station) {
      const s = 54 / station.size.y;
      const g = this.groundUnder(sx, sz, 10).lo;
      this.put(AERO.station, sx, g - 0.5, sz, a + Math.PI, s);
      this.claim(sx, sz, 22);
    }
    // Decks either side.
    for (const d of [-1, 1]) {
      const da = padAngle + d * 1.5;
      const x = this.cx + Math.sin(da) * this.R * 0.48;
      const z = this.cz + Math.cos(da) * this.R * 0.48;
      const g = this.groundUnder(x, z, 9).lo;
      this.put(d < 0 ? AERO.deck : AERO.deck2, x, g - 0.6, z, da, 1.4, { solid: true });
      this.claim(x, z, 13);
    }
    // Gate between the pad and the station.
    const gx = this.cx + Math.sin(padAngle) * this.R * 0.05;
    const gz = this.cz + Math.cos(padAngle) * this.R * 0.05;
    this.put(AERO.door, gx, this.groundUnder(gx, gz, 4).lo - 0.3, gz, padAngle, 0.9);
    this.claim(gx, gz, 9);
    // Lamps round the rim and two crystal trees.
    for (let i = 0; i < 7; i++) {
      const la = padAngle + 0.6 + i * 0.72;
      const x = this.cx + Math.sin(la) * this.R * 0.8;
      const z = this.cz + Math.cos(la) * this.R * 0.8;
      if (!this.free(x, z, 3)) continue;
      const g = this.groundUnder(x, z, 2);
      if (g.lo < isl.top - 3) continue;
      this.put(AERO.lamp, x, g.lo - 0.3, z, la, 1.1);
      this.claim(x, z, 3);
    }
    for (let i = 0; i < 2; i++) {
      const s = this.spot(7, 0.4, 0.75, 40, 3);
      if (s) {
        this.put(AERO.tree, s.x, s.y - 0.4, s.z, this.rand() * 6, 0.9);
        this.claim(s.x, s.z, 8);
      }
    }
    this.props([PARCEL], 6, 2.4, 0.15, 0.7, 2);
  }

  windmillVillage() {
    const s = this.spot(6, 0.0, 0.35, 60, 3) ?? { x: this.cx, z: this.cz, y: this.isl.top };
    const ts = 6.5;
    const h = this.tower(s.x, s.z, s.y - 0.3, 2, ts, false);
    // Sails on the side facing the hub.
    const sails = this.world.proto(PROP);
    if (sails) {
      const dir = Math.atan2(-s.x, -s.z);
      const dx = Math.sin(dir);
      const dz = Math.cos(dir);
      const holder = new THREE.Group();
      holder.position.set(s.x + dx * 4.6, h - 2, s.z + dz * 4.6);
      holder.rotation.y = Math.atan2(-dz, dx);
      const blades = sails.object.clone();
      blades.scale.setScalar(5.4);
      blades.position.y = -(sails.size.y * 5.4) / 2;
      const spin = new THREE.Group();
      spin.add(blades);
      blades.traverse((o) => (o.userData.clone = true));
      holder.add(spin);
      this.isl.group.add(holder);
      this.world.addSpinner(spin, 0.9);
    }
    this.houses(6, 0.3, 0.82);
    this.scatterTrees(7, 0.25, 0.85);
    this.props([TOWN.cart], 2, 4.4, 0.3, 0.8, 4);
    this.lanterns(3, 0.2, 0.7);
  }

  market() {
    const g = this.groundUnder(this.cx, this.cz, 6);
    const fx = this.free(this.cx, this.cz, 7) ? this.cx : this.cx + 10;
    this.put(TOWN.fountain, fx, g.lo - 0.1, this.cz, 0, 5.5);
    this.claim(fx, this.cz, 7);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.257 + this.rand() * 0.3;
      const x = fx + Math.sin(a) * 13;
      const z = this.cz + Math.cos(a) * 13;
      if (!this.free(x, z, 3)) continue;
      const gg = this.groundUnder(x, z, 2.5);
      if (gg.lo < this.isl.top - 3) continue;
      this.put(i % 2 ? TOWN.stallRed : TOWN.stallGreen, x, gg.lo - 0.1, z, a + Math.PI, 4.4);
      this.claim(x, z, 3.2);
    }
    this.houses(6, 0.42, 0.85, 0.45);
    this.lanterns(4, 0.2, 0.6);
    this.props([TOWN.cart], 2, 4.4, 0.25, 0.75, 4);
    this.scatterTrees(4, 0.5, 0.85);
  }

  orchard() {
    const rows = 5;
    for (let r = -rows; r <= rows; r++) {
      for (let c = -rows; c <= rows; c++) {
        const x = this.cx + r * 9 + (this.rand() - 0.5) * 2;
        const z = this.cz + c * 9 + (this.rand() - 0.5) * 2;
        if (Math.hypot(x - this.cx, z - this.cz) > this.R * 0.72 || !this.free(x, z, 3.5)) continue;
        if (this.rand() < 0.25) continue;
        const g = this.groundUnder(x, z, 2);
        if (g.lo < this.isl.top - 3 || g.hi - g.lo > 3) continue;
        const k = this.rand();
        this.put(k < 0.45 ? NATURE.fall : k < 0.8 ? NATURE.oak : NATURE.oakFall, x, g.lo - 0.2, z, this.rand() * 6, 6.5 + this.rand() * 2);
        this.claim(x, z, 3.5);
      }
    }
    this.houses(2, 0.55, 0.85);
    this.props([TOWN.cart], 1, 4.4, 0.3, 0.8, 4);
  }

  village() {
    this.houses(8, 0.12, 0.85, 0.4);
    this.lanterns(4, 0.1, 0.75);
    this.scatterTrees(5, 0.3, 0.85);
    if (this.rand() < 0.6) this.props([TOWN.stallRed, TOWN.cart], 2, 4.4, 0.1, 0.6, 3.5);
  }

  watermill() {
    // Wheel and waterfall on the edge facing away from the hub.
    const out = Math.atan2(this.cx, this.cz);
    let ex = this.cx;
    let ez = this.cz;
    let ey = this.isl.top;
    for (let d = this.R * 0.5; d < this.R * 1.2; d += 1.5) {
      const x = this.cx + Math.sin(out) * d;
      const z = this.cz + Math.cos(out) * d;
      const g = this.isl.hf.groundAt(x, z);
      if (g < this.isl.top - 4) break;
      ex = x;
      ez = z;
      ey = g;
    }
    const wheel = this.world.proto(TOWN.watermill);
    if (wheel) {
      const s = 7;
      const r = (wheel.size.y * s) / 2;
      const holder = new THREE.Group();
      const tx = Math.cos(out);
      const tz = -Math.sin(out);
      holder.position.set(ex - Math.sin(out) * 1.5, ey + r * 0.55, ez - Math.cos(out) * 1.5);
      holder.rotation.y = Math.atan2(-tz, tx);
      const spin = new THREE.Group();
      const w = wheel.object.clone();
      w.scale.setScalar(s);
      w.position.y = -r;
      w.traverse((o) => (o.userData.clone = true));
      spin.add(w);
      holder.add(spin);
      this.isl.group.add(holder);
      this.world.addSpinner(spin, -0.6);
      this.claim(ex, ez, 8);
    }
    const fall = this.world.proto(WATERFALL);
    if (fall) {
      const s = 2.6;
      const obj = this.clone(WATERFALL, ex + Math.sin(out) * 1.2, ey - fall.size.y * s + 2, ez + Math.cos(out) * 1.2, out, s);
      if (obj) this.world.addWaterfall(obj);
    }
    this.houses(5, 0.2, 0.8, 0.3);
    this.scatterTrees(5, 0.2, 0.85);
    this.lanterns(2, 0.2, 0.6);
  }

  castle() {
    const n = this.R > 40 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = this.spot(5, i === 0 ? 0 : 0.35, i === 0 ? 0.3 : 0.75, 60, 3);
      if (s) this.tower(s.x, s.z, s.y - 0.3, i === 0 ? 3 : 1 + Math.floor(this.rand() * 2), 7.5 - i * 0.6);
    }
    this.houses(3, 0.3, 0.85);
    this.scatterTrees(4, 0.3, 0.85);
    this.lanterns(2, 0.1, 0.6);
  }

  lighthouse() {
    const out = Math.atan2(this.cx, this.cz);
    const x = this.cx + Math.sin(out) * this.R * 0.45;
    const z = this.cz + Math.cos(out) * this.R * 0.45;
    const g = this.groundUnder(x, z, 4);
    const top = this.tower(x, z, g.lo - 0.3, 5, 6.2, false);
    void top;
    this.houses(3, 0.2, 0.85);
    this.scatterTrees(4, 0.3, 0.85);
    this.lanterns(3, 0.1, 0.7);
  }
}
