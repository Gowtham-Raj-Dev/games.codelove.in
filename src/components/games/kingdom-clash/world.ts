import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LoadedModel } from "../shared/assets";
import { BUILDINGS, GRID, type BKind } from "./data";
import { K, type ModelName } from "./manifest";
import { FOUNDATION_H, OBSTACLES, recipe, rubble, wallPost, wallSegment, type Look, type Part } from "./recipes";

/**
 * Kingdom Clash — turning recipes into meshes. Every kit shares one palette texture, so all pieces
 * of a kit get one material and a building merges into a mesh or two. "Looks" are recoloured
 * copies of those materials: gold trim, glowing elixir, crystals.
 */

export interface Piece {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Copies a (possibly quantized) geometry into plain float attributes, transformed by `matrix`. */
function bake(geo: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const out = new THREE.BufferGeometry();
  const pos = geo.getAttribute("position");
  for (const name of ["position", "normal", "uv"] as const) {
    const src = geo.getAttribute(name);
    const n = name === "uv" ? 2 : 3;
    const arr = new Float32Array(pos.count * n);
    if (src) {
      for (let i = 0; i < pos.count; i++) {
        arr[i * n] = src.getX(i);
        arr[i * n + 1] = src.getY(i);
        if (n === 3) arr[i * n + 2] = src.getZ(i);
      }
    } else if (name === "normal") for (let i = 0; i < pos.count; i++) arr[i * 3 + 1] = 1;
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  out.setIndex(index);
  out.applyMatrix4(matrix);
  return out;
}

function partMatrix(p: Part, out = new THREE.Matrix4()) {
  const s = p.s ?? 1;
  tmpP.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  tmpQ.setFromAxisAngle(UP, p.r ?? 0);
  tmpS.set(s * (p.sx ?? 1), s * (p.sy ?? 1), s * (p.sz ?? 1));
  return out.compose(tmpP, tmpQ, tmpS);
}

// --- Colour helpers -----------------------------------------------------------------------------------

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

type Recolor = (r: number, g: number, b: number) => [number, number, number];

const RECOLOR: Partial<Record<Look, Recolor>> = {
  gold: (r, g, b) => {
    const l = Math.min(1, (0.3 * r + 0.59 * g + 0.11 * b) * 1.15);
    // Dark bronze → bright gold → pale highlight.
    const t = Math.min(1, l / 0.75);
    const base: [number, number, number] = [0.45 + 0.55 * t, 0.26 + 0.55 * t, 0.02 + 0.16 * t];
    if (l > 0.75) {
      const k = (l - 0.75) / 0.25;
      return [base[0] + (1 - base[0]) * k * 0.6, base[1] + (0.95 - base[1]) * k * 0.6, base[2] + (0.6 - base[2]) * k * 0.6];
    }
    return base;
  },
  elixir: (r, g, b) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.22) return [r, g, b];
    void h;
    return hslToRgb(0.83, Math.max(0.75, s), Math.min(0.72, Math.max(0.42, l)));
  },
  red: (r, g, b) => {
    const [, s, l] = rgbToHsl(r, g, b);
    return hslToRgb(0.01, Math.max(0.65, s), Math.min(0.6, l));
  },
  // Wall and foundation materials: dark blue-grey granite, light grey stone, brown earth.
  granite: (r, g, b) => {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    return [0.2 + 0.42 * l, 0.23 + 0.42 * l, 0.29 + 0.44 * l];
  },
  stone: (r, g, b) => {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    return [0.4 + 0.42 * l, 0.41 + 0.42 * l, 0.42 + 0.42 * l];
  },
  earth: (r, g, b) => {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    return [0.33 + 0.3 * l, 0.22 + 0.24 * l, 0.12 + 0.16 * l];
  },
  frost: (r, g, b) => {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    return [0.55 + l * 0.4, 0.8 + l * 0.2, 1];
  },
};

function recolorTexture(tex: THREE.Texture, fn: Recolor) {
  const img = tex.image as { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(tex.image as CanvasImageSource, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    d[i] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    d[i + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    d[i + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
  }
  ctx.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.flipY = tex.flipY;
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.magFilter = tex.magFilter;
  out.minFilter = tex.minFilter;
  out.generateMipmaps = tex.generateMipmaps;
  out.needsUpdate = true;
  return out;
}

// --- Bank -----------------------------------------------------------------------------------------------

export class Bank {
  private readonly shared = new Map<string, THREE.MeshStandardMaterial>();
  private readonly looks = new Map<string, THREE.Material>();
  private readonly cache = new Map<string, Piece[]>();
  private readonly owned: { dispose(): void }[] = [];

  constructor(readonly models: Map<string, LoadedModel>) {
    // One material per kit palette (or per named colour for untextured kits); never metallic.
    for (const [key, m] of models) {
      const kit = key.split("/")[0];
      // Rigged characters keep their own materials (kits share one palette material each).
      let character = /character-/.test(key);
      m.scene.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) character = true;
      });
      m.scene.updateMatrixWorld(true);
      m.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        // Crisp textures at the game's slanted view (three.js caps this at what the GPU allows).
        if (src.map && src.map.anisotropy < 8) {
          src.map.anisotropy = 8;
          src.map.needsUpdate = true;
        }
        if (character) {
          src.metalness = 0;
          src.roughness = 0.85;
          return;
        }
        // Textured pieces of a kit share its palette ("colormap"); kits with several atlases
        // (Crystal Crossroads: body + glass) get one material per atlas.
        const id = src.map ? `${kit}:${src.map.name}` : `${kit}:${src.name}:${src.color.getHexString()}`;
        let mat = this.shared.get(id);
        if (!mat) {
          mat = src;
          mat.metalness = 0;
          mat.roughness = 0.88;
          mat.side = THREE.FrontSide;
          mat.shadowSide = THREE.BackSide;
          // Exported as "blend" but solid: draw it opaque (only the glass atlas stays see-through).
          if (mat.transparent && kit === "crystal-crossroads" && !/trans/i.test(src.name)) {
            mat.transparent = false;
            mat.depthWrite = true;
          }
          this.shared.set(id, mat);
        }
        mesh.material = mat;
      });
    }
  }

  model(name: ModelName) {
    return this.models.get(K[name]);
  }

  has(name: ModelName) {
    return this.models.has(K[name]);
  }

  /** A recoloured copy of a material (cached). */
  look(base: THREE.Material, look?: Look): THREE.Material {
    if (!look) return base;
    const key = `${base.uuid}:${look}`;
    const m = this.looks.get(key);
    if (m) return m;
    const src = base as THREE.MeshStandardMaterial;
    const mat = src.clone();
    const fn = RECOLOR[look];
    if (src.map && fn) {
      mat.map = recolorTexture(src.map, fn);
      this.owned.push(mat.map);
    } else if (fn) {
      const [r, g, b] = fn(src.color.r, src.color.g, src.color.b);
      mat.color.setRGB(r, g, b);
    }
    if (look === "dark") mat.color.multiplyScalar(0.42);
    if (look === "glow" || look === "elixir") {
      mat.emissive = new THREE.Color(look === "elixir" ? "#ffffff" : "#ffffff");
      mat.emissiveMap = mat.map;
      mat.emissiveIntensity = look === "elixir" ? 0.32 : 0.5;
      if (!mat.map) mat.emissive.copy(mat.color).multiplyScalar(0.6);
    }
    if (look === "gold") {
      mat.roughness = 0.55;
      mat.metalness = 0.25;
    }
    if (look === "frost") {
      mat.emissive = new THREE.Color("#3b82f6");
      mat.emissiveIntensity = 0.25;
    }
    this.owned.push(mat);
    this.looks.set(key, mat);
    return mat;
  }

  /** Bakes parts into one merged geometry per material. */
  bake(parts: Part[], key?: string): Piece[] {
    if (key) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const pm = new THREE.Matrix4();
    for (const p of parts) {
      const m = this.model(p.m);
      if (!m) continue;
      partMatrix(p, pm);
      m.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
        tmpM.multiplyMatrices(pm, mesh.matrixWorld);
        const mat = this.look(mesh.material as THREE.Material, p.look);
        let list = byMat.get(mat);
        if (!list) byMat.set(mat, (list = []));
        list.push(bake(mesh.geometry, tmpM));
      });
    }
    const out: Piece[] = [];
    for (const [mat, geos] of byMat) {
      const geo = geos.length === 1 ? geos[0] : (mergeGeometries(geos, false) ?? new THREE.BufferGeometry());
      if (geos.length > 1) geos.forEach((g) => g.dispose());
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      out.push({ geo, mat });
      this.owned.push(geo);
    }
    if (key) this.cache.set(key, out);
    return out;
  }

  /** A group of meshes for parts (shared geometry when keyed). */
  group(parts: Part[], key?: string, { cast = true, receive = true } = {}) {
    const g = new THREE.Group();
    for (const piece of this.bake(parts, key)) {
      const mesh = new THREE.Mesh(piece.geo, piece.mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      g.add(mesh);
    }
    return g;
  }

  dispose() {
    this.owned.forEach((o) => o.dispose());
    for (const m of this.shared.values()) {
      m.map?.dispose();
      m.dispose();
    }
    for (const m of this.models.values()) {
      m.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    }
  }
}

// --- Building views ---------------------------------------------------------------------------------------

export interface BuildingMesh {
  root: THREE.Group;
  body: THREE.Group;
  turret: THREE.Group | null;
  spin: THREE.Group | null;
  spinSpeed: number;
  height: number;
}

export function buildingMesh(bank: Bank, kind: BKind, level: number): BuildingMesh {
  const r = recipe(kind, level);
  const root = new THREE.Group();
  if (r.base) root.add(bank.group(r.base, `f:${kind}:${level}`));
  const body = bank.group(r.parts, `b:${kind}:${level}`);
  root.add(body);
  let turret: THREE.Group | null = null;
  if (r.turret) {
    turret = bank.group(r.turret.parts, `t:${kind}:${level}`);
    turret.position.y = r.turret.y;
    body.add(turret);
  }
  let spin: THREE.Group | null = null;
  let spinSpeed = 0;
  if (r.spin) {
    const holder = new THREE.Group();
    holder.position.set(r.spin.x, r.spin.y, r.spin.z);
    holder.rotation.y = r.spin.r;
    spin = bank.group(r.spin.parts, `s:${kind}:${level}`);
    holder.add(spin);
    body.add(holder);
    spinSpeed = r.spin.speed;
  }
  // Nothing may hang over the edge of the footprint onto a neighbour: shrink the building (about the
  // top of its foundation) until it fits.
  if (r.base) {
    const box = new THREE.Box3().setFromObject(body);
    const reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
    const limit = BUILDINGS[kind].size / 2 - 0.06;
    if (reach > limit) {
      const f = limit / reach;
      body.scale.setScalar(f);
      body.position.y = FOUNDATION_H * (1 - f);
    }
  }
  return { root, body, turret, spin, spinSpeed, height: r.height };
}

/** Scaffolding around a construction site. */
export function scaffold(bank: Bank, size: number) {
  const h = size >= 3 ? 1.3 : 1;
  const half = size / 2 - 0.15;
  const s = (size - 0.3) / 1;
  const parts: Part[] = [];
  const sides: [number, number, number][] = [
    [0, half, 0],
    [0, -half, Math.PI],
    [half, 0, -Math.PI / 2],
    [-half, 0, Math.PI / 2],
  ];
  for (const [x, z, r] of sides) parts.push({ m: "woodPart", x, z, r, sx: s, sy: h, sz: 1 });
  parts.push({ m: "planks", y: 0.02, sx: size - 0.4, sz: size - 0.4 });
  if (size >= 2) parts.push({ m: "boxLarge", x: half - 0.3, z: half - 0.45, s: 1.2 }, { m: "logs", x: -half + 0.35, z: half - 0.3, s: 0.7, r: Math.PI / 2 });
  return bank.group(parts, `sc:${size}`);
}

export function rubbleMesh(bank: Bank, size: number) {
  return bank.group(rubble(size), `r:${size}`, { cast: false });
}

export function obstacleMesh(bank: Bank, model: number) {
  return bank.group(OBSTACLES[model] ?? OBSTACLES[0], `o:${model}`);
}

// --- Walls -------------------------------------------------------------------------------------------------

export interface WallInfo {
  id: number;
  x: number;
  z: number;
  level: number;
}

/** All walls as instanced meshes: a post per tile, a segment to each wall neighbour. */
export class WallLayer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private readonly bank: Bank) {}

  rebuild(walls: WallInfo[], origin: { x: number; z: number }, lift: Map<number, number> = new Map()) {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.dispose();
    }
    this.meshes = [];
    if (!walls.length) return;
    const at = new Map<number, WallInfo>();
    const key = (x: number, z: number) => z * 1000 + x;
    for (const w of walls) at.set(key(w.x, w.z), w);
    const posts = new Map<number, THREE.Matrix4[]>();
    const segs = new Map<number, THREE.Matrix4[]>();
    const push = (map: Map<number, THREE.Matrix4[]>, level: number, m: THREE.Matrix4) => {
      let list = map.get(level);
      if (!list) map.set(level, (list = []));
      list.push(m);
    };
    for (const w of walls) {
      const cx = origin.x + w.x + 0.5;
      const cz = origin.z + w.z + 0.5;
      const y = lift.get(w.id) ?? 0;
      push(posts, w.level, new THREE.Matrix4().makeTranslation(cx, y, cz));
      const e = at.get(key(w.x + 1, w.z));
      if (e) push(segs, Math.min(w.level, e.level), new THREE.Matrix4().makeTranslation(cx, y, cz));
      const s = at.get(key(w.x, w.z + 1));
      if (s) push(segs, Math.min(w.level, s.level), new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(cx, y, cz));
    }
    const add = (pieces: Piece[], mats: THREE.Matrix4[]) => {
      for (const p of pieces) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        this.group.add(im);
        this.meshes.push(im);
      }
    };
    for (const [level, mats] of posts) add(this.bank.bake(wallPost(level), `wp:${level}`), mats);
    for (const [level, mats] of segs) add(this.bank.bake(wallSegment(level), `ws:${level}`), mats);
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    this.meshes = [];
  }
}

// --- Ground & forest -----------------------------------------------------------------------------------------

/** Grass with soft noise, and the village plateau with a faint checkerboard. */
export function makeGround(battleSize: number) {
  const group = new THREE.Group();
  const owned: { dispose(): void }[] = [];

  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#6fae4a";
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry(7);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 2 + rand() * 9;
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,210,0.05)" : "rgba(20,70,10,0.06)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const grassTex = new THREE.CanvasTexture(c);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(10, 10);
  grassTex.anisotropy = 8;
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, metalness: 0 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  group.add(grass);
  owned.push(grassTex, grassMat, grass.geometry);

  // Village plateau: checker tiles inside the build area, a soft dirt rim around it. 32 px a tile
  // keeps the tile edges sharp up close on high-density phone screens.
  const px = 32;
  const pc = document.createElement("canvas");
  const border = 2;
  const tiles = GRID + border * 2;
  pc.width = pc.height = tiles * px;
  const p = pc.getContext("2d")!;
  for (let z = 0; z < tiles; z++)
    for (let x = 0; x < tiles; x++) {
      const inside = x >= border && z >= border && x < tiles - border && z < tiles - border;
      if (inside) p.fillStyle = (x + z) % 2 ? "#86c25a" : "#7fbb54";
      else p.fillStyle = "#79b350";
      p.fillRect(x * px, z * px, px, px);
    }
  const plateauTex = new THREE.CanvasTexture(pc);
  plateauTex.colorSpace = THREE.SRGBColorSpace;
  plateauTex.magFilter = THREE.LinearFilter;
  plateauTex.anisotropy = 8;
  const plateauMat = new THREE.MeshStandardMaterial({ map: plateauTex, roughness: 1, metalness: 0, transparent: true, alphaMap: edgeFade(owned), polygonOffset: true, polygonOffsetFactor: -1 });
  const plateau = new THREE.Mesh(new THREE.PlaneGeometry(tiles, tiles), plateauMat);
  plateau.rotation.x = -Math.PI / 2;
  plateau.position.y = 0.002;
  plateau.receiveShadow = true;
  group.add(plateau);
  owned.push(plateauTex, plateauMat, plateau.geometry);
  void battleSize;

  return { group, dispose: () => owned.forEach((o) => o.dispose()) };
}

function edgeFade(owned: { dispose(): void }[]) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 26, 32, 32, 46);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 64, 64);
  const edge = ctx.createLinearGradient(0, 0, 64, 0);
  void g;
  edge.addColorStop(0, "#000");
  edge.addColorStop(0.03, "#fff");
  edge.addColorStop(0.97, "#fff");
  edge.addColorStop(1, "#000");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 64, 64);
  ctx.globalCompositeOperation = "multiply";
  const edge2 = ctx.createLinearGradient(0, 0, 0, 64);
  edge2.addColorStop(0, "#000");
  edge2.addColorStop(0.03, "#fff");
  edge2.addColorStop(0.97, "#fff");
  edge2.addColorStop(1, "#000");
  ctx.fillStyle = edge2;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  owned.push(t);
  return t;
}

export function mulberry(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ring of forest around the battlefield, merged into a few meshes. */
export function makeForest(bank: Bank, inner: number) {
  const rand = mulberry(42);
  const parts: Part[] = [];
  const trees: ModelName[] = ["treeOak", "treeDefault", "treeFat", "treeDetailed", "treePineRound", "treePineTall", "treeCone", "treeOak", "treeDefault", "treeFall"];
  const outer = inner + 26;
  for (let z = -outer; z <= outer; z += 1.6)
    for (let x = -outer; x <= outer; x += 1.6) {
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < inner) continue;
      const density = Math.min(1, (d - inner) / 4 + 0.25);
      if (rand() > density * 0.85) continue;
      const jx = x + (rand() - 0.5) * 1.3;
      const jz = z + (rand() - 0.5) * 1.3;
      const m = trees[Math.floor(rand() * trees.length)];
      parts.push({ m, x: jx, z: jz, r: rand() * Math.PI * 2, s: 1.6 + rand() * 1.1 });
    }
  // Scattered stones, bushes and flowers on the grass between village and forest.
  const deco: ModelName[] = ["bush", "flowers", "rockLarge", "mushrooms", "stump", "stoneTall", "flowers", "bush"];
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2;
    const r = GRID / 2 + 1.5 + rand() * (inner - GRID / 2 + 3);
    const x = Math.cos(a) * r * 1.15;
    const z = Math.sin(a) * r * 1.15;
    if (Math.max(Math.abs(x), Math.abs(z)) < GRID / 2 + 1) continue;
    parts.push({ m: deco[Math.floor(rand() * deco.length)], x, z, r: rand() * 6, s: 1 + rand() * 1.2 });
  }
  const g = bank.group(parts, undefined, { cast: true, receive: false });
  return g;
}

/** World position of the centre of a village footprint. */
export function footprintCenter(x: number, z: number, size: number, out = new THREE.Vector3()) {
  return out.set(x + size / 2 - GRID / 2, 0, z + size / 2 - GRID / 2);
}

export const sizeOf = (kind: BKind) => BUILDINGS[kind].size;
