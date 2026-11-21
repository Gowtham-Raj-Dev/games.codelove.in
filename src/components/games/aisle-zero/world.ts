import * as THREE from "three";
import { findCart, ITEM_DEFS, type ItemDef, type NightDef } from "./content";
import {
  AISLES,
  barricadeBox,
  BACK_Z,
  BOARDS,
  BREAKER_IDS,
  BREAKERS,
  CEIL,
  COLD_RACKS,
  DESKS,
  DOOR_IDS,
  DOORS,
  doorCenter,
  FLOOR_SPOTS,
  HW,
  LM,
  LOCKERS,
  PAIRS,
  PART_X,
  seeded,
  SEGS,
  SENSOR_R,
  SENSOR_SPOTS,
  SLOTS,
  STANDS,
  STOCK_RACK_N,
  STOCK_RACK_Z0,
  STOCK_RACKS,
  TALL_BOARDS,
  WAYPOINTS,
  XI,
  ZI,
  zoneOf,
  type BreakerId,
  type DoorId,
  type Slot,
  type Zone,
} from "./layout";

/**
 * Aisle Zero's abandoned supermarket. Everything here is built in code with generated textures: the shop
 * floor, the three back rooms and their shutters, collision boxes, the navigation grid, lights, shelving
 * with thousands of instanced products, props and everything that can be picked up. The store is built
 * once; applyNight() then sets it up for a night (which items are out, which doors are down, the power,
 * sensors, barricades, coins, batteries, keys and fuses). Light intensities are in the old (pre-r155)
 * units, multiplied by LIGHT — see engine.ts. The floor plan's numbers are in layout.ts.
 */

const PI = Math.PI;
/** Old three.js light units → current ones (the engine also restores the old distance falloff). */
export const LIGHT = Math.PI;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];

const X0 = -36;
const Z0 = -48;
const CS = 0.5;
export const GW = 144;
export const GH = 192;

export type BoxKind = "shelf" | "wall" | "door" | "gate" | "barricade" | "table" | "counter" | "freezer" | "cart" | "machine" | "locker" | "crate";
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: BoxKind;
}

/** A shopping-list item on its shelf. */
export interface Item {
  def: ItemDef;
  slot: Slot;
  group: THREE.Group;
  mesh: THREE.Mesh;
  sp: THREE.Sprite;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  /** On tonight's list. */
  active: boolean;
  got: boolean;
  t: number;
}

export type PickupKind = "coin" | "battery" | "key" | "fuse" | "bonus";
/** Anything else that can be picked up: coins and batteries lie on the floor, keys, fuses and the bonus item sit on shelves. */
export interface Pickup {
  kind: PickupKind;
  group: THREE.Group;
  x: number;
  z: number;
  /** Shelf pickups: the side they are reached from. */
  slot: Slot | null;
  /** Keys: the door they open. */
  door: DoorId | null;
  name: string;
  where: string;
  active: boolean;
  got: boolean;
  t: number;
  baseY: number;
}

export interface Door {
  id: DoorId;
  /** Shutter down. */
  shut: boolean;
  /** 0 down … 1 rolled up. */
  t: number;
  rule: NightDef["doors"][DoorId];
  panel: THREE.Mesh;
  lamp: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  height: number;
}

export interface Sensor {
  x: number;
  z: number;
  active: boolean;
  /** Seconds until it is armed again. */
  cool: number;
  group: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
}

export interface Hide {
  x: number;
  z: number;
  ox: number;
  oz: number;
}

interface Panel {
  x: number;
  z: number;
  phase: number;
  /** Fixed 0–1: the panel is dead on nights whose `dim` is above it. */
  roll: number;
  broken: boolean;
  flick: number;
  base: number;
  v: number;
  /** Light colour of the room it hangs in. */
  tint: [number, number, number];
}

const ZONE_TINT: Record<Zone, [number, number, number]> = { store: [0.8, 0.9, 0.72], stock: [0.82, 0.84, 0.7], cold: [0.5, 0.8, 1.0], office: [1.0, 0.82, 0.56] };
const ZONE_LIGHT: Record<Zone, number> = { store: 0xdbe6cf, stock: 0xd8dcc0, cold: 0x9fd4ff, office: 0xffd9a0 };

/** One instance: position, rotation, scale, optional colour and atlas cell. */
interface Inst {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  c?: number;
  cu?: number;
  cv?: number;
}

/* ---------------- generated textures ---------------- */
let maxAniso = 8;
function cv(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d")!;
function tex(c: HTMLCanvasElement, rx?: number, ry?: number, color = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rx) t.repeat.set(rx, ry ?? rx);
  t.anisotropy = maxAniso;
  return t;
}
function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, dark: boolean) {
  for (let i = 0; i < n; i++) {
    const v = dark ? Math.random() * 60 : 150 + Math.random() * 100;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
}
function stains(g: CanvasRenderingContext2D, w: number, h: number, n: number, rmax: number, col: string) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 8 + Math.random() * rmax;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${col},${0.18 + Math.random() * 0.3})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function floorMaps() {
  const S = 512;
  const map = cv(S, S);
  const rough = cv(S, S);
  const bump = cv(S, S);
  const g = ctx2d(map);
  const r = ctx2d(rough);
  const b = ctx2d(bump);
  const shades = ["#4d4c47", "#53514b", "#484742", "#504e48"];
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) {
      g.fillStyle = shades[(x + y * 2) % 4];
      g.fillRect(x * 256, y * 256, 256, 256);
      const v = 90 + Math.random() * 40;
      r.fillStyle = `rgb(${v},${v},${v})`;
      r.fillRect(x * 256, y * 256, 256, 256);
      b.fillStyle = "#999";
      b.fillRect(x * 256, y * 256, 256, 256);
    }
  for (const c of [g, r, b]) {
    c.strokeStyle = c === r ? "#e0e0e0" : "#1a1a18";
    c.lineWidth = 6;
    for (let k = 0; k < 2; k++) {
      c.beginPath();
      c.moveTo(k * 256, 0);
      c.lineTo(k * 256, S);
      c.moveTo(0, k * 256);
      c.lineTo(S, k * 256);
      c.stroke();
    }
  }
  noise(g, S, S, 700, 0.12, true);
  noise(g, S, S, 300, 0.05, false);
  stains(g, S, S, 22, 60, "20,18,12");
  stains(r, S, S, 22, 70, "230,230,230");
  stains(r, S, S, 8, 90, "40,40,40");
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(200,200,190,${Math.random() * 0.1})`;
    g.lineWidth = 1 + Math.random() * 2;
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rnd(-60, 60), y + rnd(-40, 40));
    g.stroke();
  }
  noise(b, S, S, 1500, 0.12, true);
  return { map: tex(map, 60, 80), rough: tex(rough, 60, 80, false), bump: tex(bump, 60, 80, false) };
}
function wallMap() {
  const w = 512;
  const h = 512;
  const c = cv(w, h);
  const g = ctx2d(c);
  g.fillStyle = "#6a6c63";
  g.fillRect(0, 0, w, h);
  stains(g, w, h, 20, 80, "30,34,26");
  noise(g, w, h, 1500, 0.18, true);
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * w;
    const l = 60 + Math.random() * 300;
    const gr = g.createLinearGradient(0, 0, 0, l);
    gr.addColorStop(0, "rgba(20,26,16,.45)");
    gr.addColorStop(1, "rgba(20,26,16,0)");
    g.fillStyle = gr;
    g.fillRect(x, 0, 4 + Math.random() * 14, l);
  }
  const gb = g.createLinearGradient(0, h * 0.62, 0, h);
  gb.addColorStop(0, "#2d4743");
  gb.addColorStop(1, "#1d2e2c");
  g.fillStyle = gb;
  g.fillRect(0, h * 0.64, w, h * 0.36);
  g.fillStyle = "#c9cbbf";
  g.fillRect(0, h * 0.635, w, 5);
  stains(g, w, h * 0.4, 8, 50, "10,10,8");
  noise(g, w, h, 1500, 0.4, true);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = "rgba(110,110,100,.45)";
    g.fillRect(Math.random() * w, h * 0.64 + Math.random() * h * 0.35, 3 + Math.random() * 10, 2 + Math.random() * 6);
  }
  return tex(c, 18, 1);
}
function ceilMap() {
  const S = 256;
  const c = cv(S, S);
  const g = ctx2d(c);
  g.fillStyle = "#3a3c3b";
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 900, 0.2, true);
  stains(g, S, S, 6, 50, "40,30,10");
  g.strokeStyle = "#1c1d1d";
  g.lineWidth = 5;
  g.strokeRect(0, 0, S, S);
  g.beginPath();
  g.moveTo(S / 2, 0);
  g.lineTo(S / 2, S);
  g.moveTo(0, S / 2);
  g.lineTo(S, S / 2);
  g.stroke();
  return tex(c, 60, 80);
}
const BRANDS = ["CRUNCHIES", "OAT BITES", "SUNRISE", "GOLDEN", "FRESHA", "CHOCO", "TEA TIME", "SPICY", "DAIRY", "PURE", "MAGIC", "JOLLY", "VITA", "NUTRI", "SOFT", "ZEST", "HERO", "BRIGHT", "MAXX", "HOMEY"];
function atlasMap() {
  const S = 1024;
  const C = 8;
  const cs = S / C;
  const c = cv(S, S);
  const g = ctx2d(c);
  for (let j = 0; j < C; j++)
    for (let i = 0; i < C; i++) {
      const x = i * cs;
      const y = j * cs;
      const hue = (Math.random() * 360) | 0;
      const sat = 25 + Math.random() * 35;
      const lum = 28 + Math.random() * 28;
      g.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
      g.fillRect(x, y, cs, cs);
      g.fillStyle = `hsl(${(hue + 160) % 360},${sat + 10}%,${lum + 18}%)`;
      const style = (Math.random() * 3) | 0;
      if (style === 0) g.fillRect(x, y + cs * 0.12, cs, cs * 0.22);
      else if (style === 1) {
        g.beginPath();
        g.arc(x + cs / 2, y + cs * 0.38, cs * 0.3, 0, 7);
        g.fill();
      } else {
        g.fillRect(x, y + cs * 0.55, cs, cs * 0.14);
        g.fillRect(x, y + cs * 0.1, cs, cs * 0.06);
      }
      g.fillStyle = "rgba(255,255,255,.85)";
      g.font = `bold ${(cs * 0.17) | 0}px Arial`;
      g.textAlign = "center";
      g.fillText(pick(BRANDS), x + cs / 2, y + cs * 0.48);
      g.font = `${(cs * 0.09) | 0}px Arial`;
      g.fillStyle = "rgba(255,255,255,.55)";
      g.fillText(pick(["500g", "1kg", "250g", "FAMILY PACK", "NEW", "2 for 1", "ORIGINAL"]), x + cs / 2, y + cs * 0.65);
      g.fillStyle = "rgba(240,240,240,.8)";
      g.fillRect(x + cs * 0.3, y + cs * 0.8, cs * 0.4, cs * 0.12);
      g.fillStyle = "#111";
      for (let k = 0; k < 14; k++) g.fillRect(x + cs * 0.32 + k * 3.4, y + cs * 0.82, 1 + (k % 3), cs * 0.08);
      const gr = g.createLinearGradient(x, y, x + cs, y);
      gr.addColorStop(0, "rgba(0,0,0,.35)");
      gr.addColorStop(0.5, "rgba(0,0,0,0)");
      gr.addColorStop(1, "rgba(0,0,0,.35)");
      g.fillStyle = gr;
      g.fillRect(x, y, cs, cs);
      g.strokeStyle = "rgba(0,0,0,.4)";
      g.lineWidth = 3;
      g.strokeRect(x, y, cs, cs);
    }
  noise(g, S, S, 6000, 0.22, true);
  stains(g, S, S, 40, 40, "40,35,25");
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
function gridAlpha() {
  const c = cv(64, 64);
  const g = ctx2d(c);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = "#fff";
  g.lineWidth = 4;
  g.strokeRect(0, 0, 64, 64);
  g.beginPath();
  g.moveTo(32, 0);
  g.lineTo(32, 64);
  g.moveTo(0, 32);
  g.lineTo(64, 32);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  return t;
}
function signTex(lines: { t: string; font: string; y: number }[], w: number, h: number, bg: string, fg: string, border?: string) {
  const c = cv(w, h);
  const g = ctx2d(c);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = border || fg;
  g.lineWidth = 6;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach((ln) => {
    g.font = ln.font;
    g.fillText(ln.t, w / 2, ln.y * h);
  });
  noise(g, w, h, 600, 0.35, true);
  return tex(c);
}
function labelTex(text: string, bg: string) {
  const c = cv(128, 128);
  const g = ctx2d(c);
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgba(255,255,255,.9)";
  g.fillRect(0, 40, 128, 48);
  g.fillStyle = "#1a1a1a";
  g.font = `bold ${text.length > 5 ? 20 : 28}px Arial`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 64);
  g.fillStyle = "rgba(255,255,255,.4)";
  g.fillRect(0, 100, 128, 6);
  noise(g, 128, 128, 400, 0.3, true);
  return tex(c);
}
function lockerTex() {
  const c = cv(128, 256);
  const g = ctx2d(c);
  g.fillStyle = "#4b5b59";
  g.fillRect(0, 0, 128, 256);
  noise(g, 128, 256, 1400, 0.5, true);
  stains(g, 128, 256, 6, 40, "50,30,10");
  g.fillStyle = "#222";
  for (let i = 0; i < 6; i++) g.fillRect(24, 22 + i * 7, 80, 3);
  for (let i = 0; i < 6; i++) g.fillRect(24, 200 + i * 7, 80, 3);
  g.fillStyle = "#a8aaa6";
  g.fillRect(96, 110, 8, 30);
  g.strokeStyle = "#2a2f2e";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 252);
  g.fillStyle = "rgba(120,50,20,.35)";
  g.fillRect(10, 230, 108, 20);
  return tex(c);
}
const exitSign = (open: boolean) => signTex([{ t: "EXIT", font: "bold 66px Arial", y: 0.52 }], 256, 96, open ? "#021a05" : "#200505", open ? "#40ff60" : "#ff3030");

/* ---------------- instancing helpers ---------------- */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], o: { cells?: boolean; cast?: boolean } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  const cells = o.cells ? new Float32Array(list.length * 2) : null;
  list.forEach((t, i) => {
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    _q.setFromEuler(_e);
    _p.set(t.x, t.y, t.z);
    _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    _m.compose(_p, _q, _s);
    im.setMatrixAt(i, _m);
    if (t.c !== undefined) im.setColorAt(i, _c.set(t.c));
    if (cells) {
      cells[i * 2] = t.cu ?? 0;
      cells[i * 2 + 1] = t.cv ?? 0;
    }
  });
  if (cells) geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cells, 2));
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false;
  im.castShadow = !!o.cast;
  im.receiveShadow = true;
  return im;
}
interface Part {
  geo: THREE.BufferGeometry;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}
function mergeGeos(parts: Part[]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let off = 0;
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  parts.forEach(({ geo, x, y, z, rx, ry, rz }) => {
    m.compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1));
    nm.getNormalMatrix(m);
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const u = geo.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
      uv.push(u.getX(i), u.getY(i));
    }
    const index = geo.index!;
    for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + off);
    off += p.count;
    geo.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
const bx = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const gray = (v: number) => {
  const k = Math.round(v * 255);
  return (k << 16) | (k << 8) | k;
};

/* ---------------- collision / line of sight helpers ---------------- */
function segHitsBox(ax: number, az: number, bx2: number, bz: number, b: Box, pad: number) {
  let t0 = 0;
  let t1 = 1;
  const d = [bx2 - ax, bz - az];
  const mn = [b.x0 - pad, b.z0 - pad];
  const mx = [b.x1 + pad, b.z1 + pad];
  const o = [ax, az];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return false;
    } else {
      let ta = (mn[k] - o[k]) / d[k];
      let tb = (mx[k] - o[k]) / d[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}
/** Low things (counters, tables, parked carts) don't block sight unless a padding is asked for. */
const LOW: Partial<Record<BoxKind, boolean>> = { table: true, counter: true, cart: true };
const NB = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export type Vec2 = [number, number];

export class StoreWorld {
  readonly root = new THREE.Group();
  /** Everything solid right now: the store itself plus tonight's closed shutters and barricades. */
  boxes: Box[] = [];
  private fixed: Box[] = [];
  items: Item[] = [];
  pickups: Pickup[] = [];
  doors!: Record<DoorId, Door>;
  sensors: Sensor[] = [];
  hides: Hide[] = [];
  blocked = new Uint8Array(GW * GH);
  /** Connected walkable areas: cells with the same number can reach each other. */
  private region = new Int16Array(GW * GH);
  /** Goes up whenever a shutter opens or the night changes: walkers then plan their routes again. */
  navVersion = 0;
  /** Seconds left of a power cut (every ceiling light nearly dark). */
  blackout = 0;
  /** The mains: off on blackout nights until the breaker is thrown. */
  power = true;
  /** Tonight's breaker box (null: none works). */
  breaker: BreakerId | null = null;
  /** Share of dead ceiling lights tonight. */
  private dim = 0.3;
  private readonly panels: Panel[] = [];
  private panelMesh!: THREE.InstancedMesh;
  private pool: THREE.PointLight[] = [];
  private freezerLights: THREE.PointLight[] = [];
  private freezerGlow: THREE.MeshBasicMaterial | null = null;
  private screens: THREE.MeshBasicMaterial | null = null;
  private vendGlass: THREE.MeshBasicMaterial | null = null;
  private vendLight: THREE.PointLight | null = null;
  private exitLight!: THREE.PointLight;
  private exitSignMesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private exitTex: [THREE.Texture, THREE.Texture] | null = null;
  private payLamp: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | null = null;
  door: { hinge: THREE.Group; open: boolean; t: number } | null = null;
  private exitBlock!: Omit<Box, "kind">;
  private breakerLamps = {} as Record<BreakerId, THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>>;
  private breakerLevers = {} as Record<BreakerId, THREE.Mesh>;
  private barricades: { group: THREE.Group; box: Box | null }[] = [];
  private queue: Int32Array | null = null;
  /** Scratch for updateLights: [distance², panel index] of the six nearest panels. */
  private readonly near = new Float64Array(12);
  private cartFrameGeo: THREE.BufferGeometry | null = null;
  private cartBasketGeo: THREE.BufferGeometry | null = null;
  private gridTex: THREE.Texture | null = null;
  private gridMat: THREE.MeshStandardMaterial | null = null;
  private readonly metal = new THREE.MeshStandardMaterial({ color: 0xb4b8ba, metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9 });
  /** The player's own cart: its paint comes from the staff shop. */
  private readonly cartPaint = {
    frame: new THREE.MeshStandardMaterial({ color: 0xb4b8ba, metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9 }),
    basket: null as THREE.MeshStandardMaterial | null,
    grip: new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.6 }),
  };
  envTexture: THREE.Texture | null = null;

  private addBox(x0: number, x1: number, z0: number, z1: number, kind: BoxKind) {
    this.boxes.push({ x0, x1, z0, z1, kind });
  }
  private addC(cx: number, cz: number, hw: number, hd: number, kind: BoxKind) {
    this.addBox(cx - hw, cx + hw, cz - hd, cz + hd, kind);
  }

  /* ---------------- shopping cart (the player's cart and the scattered ones) ---------------- */
  private cartGeos() {
    if (this.cartFrameGeo) return;
    const parts: Part[] = [];
    [-0.27, 0.27].forEach((sx) => {
      parts.push({ geo: bx(0.025, 0.025, 0.9), x: sx, y: 0.14, z: 0 });
      parts.push({ geo: bx(0.025, 0.7, 0.025), x: sx * 0.95, y: 0.5, z: 0.45, rx: -0.12 });
      parts.push({ geo: bx(0.025, 0.025, 0.05), x: sx, y: 0.14, z: -0.43 });
      parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.035, 10).rotateZ(PI / 2), x: sx * 1.05, y: 0.05, z: 0.38 });
      parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.035, 10).rotateZ(PI / 2), x: sx * 1.05, y: 0.05, z: -0.38 });
    });
    parts.push({ geo: bx(0.58, 0.03, 0.03), x: 0, y: 0.84, z: 0.5 });
    parts.push({ geo: bx(0.54, 0.025, 0.025), x: 0, y: 0.14, z: 0.38 });
    this.cartFrameGeo = mergeGeos(parts);
    this.cartBasketGeo = mergeGeos([
      { geo: new THREE.PlaneGeometry(0.54, 0.86).rotateX(-PI / 2), x: 0, y: 0.32, z: 0 },
      { geo: new THREE.PlaneGeometry(0.86, 0.34), x: -0.28, y: 0.5, z: 0, ry: -PI / 2 },
      { geo: new THREE.PlaneGeometry(0.86, 0.34), x: 0.28, y: 0.5, z: 0, ry: PI / 2 },
      { geo: new THREE.PlaneGeometry(0.56, 0.34), x: 0, y: 0.5, z: -0.43 },
      { geo: new THREE.PlaneGeometry(0.58, 0.34), x: 0, y: 0.5, z: 0.43, ry: PI },
    ]);
    const gt = (this.gridTex = gridAlpha());
    gt.repeat.set(6, 6);
    this.gridMat = new THREE.MeshStandardMaterial({ color: 0xc4c8ca, metalness: 0.8, roughness: 0.4, alphaMap: gt, alphaTest: 0.5, side: THREE.DoubleSide, map: gt });
  }
  /** The player's cart, in its own paint (see paintCart). */
  makeCart() {
    this.cartGeos();
    const paint = this.cartPaint;
    paint.basket ??= this.gridMat!.clone();
    const g = new THREE.Group();
    const f = new THREE.Mesh(this.cartFrameGeo!, paint.frame);
    const b = new THREE.Mesh(this.cartBasketGeo!, paint.basket);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.5, 12).rotateZ(PI / 2), paint.grip);
    grip.position.set(0, 0.84, 0.5);
    f.castShadow = b.castShadow = true;
    g.add(f, b, grip);
    return g;
  }
  /** Paints the player's cart with one of the shop's finishes. */
  paintCart(id: string) {
    const look = findCart(id);
    const { frame, basket, grip } = this.cartPaint;
    frame.color.setHex(look.frame);
    frame.emissive.setHex(look.frame).multiplyScalar(look.glow);
    basket?.color.setHex(look.basket);
    basket?.emissive.setHex(look.basket).multiplyScalar(look.glow * 0.6);
    grip.color.setHex(look.grip);
  }

  /* ---------------- build ---------------- */
  build(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    const root = this.root;
    scene.add(root);
    const HX = XI;
    const HZ = ZI;

    // environment map: a dark room with a few strip lights, so wet floors and metal pick up soft reflections
    {
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.BoxGeometry(60, 12, 60), new THREE.MeshBasicMaterial({ color: 0x07090a, side: THREE.BackSide })));
      const strip = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (let i = -3; i <= 3; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 40), strip);
        m.position.set(i * 8, 5.6, 0);
        envScene.add(m);
      }
      const pm = new THREE.PMREMGenerator(renderer);
      this.envTexture = pm.fromScene(envScene, 0.03).texture;
      scene.environment = this.envTexture;
      pm.dispose();
      envScene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
    }

    /* floor */
    const fm = floorMaps();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HX * 2 + 0.6, HZ * 2 + 0.6),
      new THREE.MeshStandardMaterial({ map: fm.map, roughnessMap: fm.rough, bumpMap: fm.bump, bumpScale: 1.2, roughness: 1, metalness: 0.12, envMapIntensity: 0.55 }),
    );
    floor.rotation.x = -PI / 2;
    floor.receiveShadow = true;
    root.add(floor);
    /* ceiling */
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 0.6, HZ * 2 + 0.6), new THREE.MeshStandardMaterial({ map: ceilMap(), roughness: 1 }));
    ceil.rotation.x = PI / 2;
    ceil.position.y = CEIL;
    root.add(ceil);
    /* walls */
    const wt = wallMap();
    const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.95 });
    const wall = (len: number, x: number, z: number, ry: number) => {
      const mat = wallMat.clone();
      mat.map = wt.clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(len / 4, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, CEIL), mat);
      m.position.set(x, CEIL / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      root.add(m);
      return m;
    };
    wall(HX * 2, 0, -HZ, 0);
    wall(HZ * 2, -HX, 0, PI / 2);
    wall(HZ * 2, HX, 0, -PI / 2);
    // front wall: rolled-down steel shutters over the shop windows, with dead glass doors
    {
      const c = cv(512, 256);
      const g = ctx2d(c);
      g.fillStyle = "#58605f";
      g.fillRect(0, 0, 512, 256);
      for (let y = 0; y < 256; y += 10) {
        const gr = g.createLinearGradient(0, y, 0, y + 10);
        gr.addColorStop(0, "#7a8381");
        gr.addColorStop(1, "#3c4342");
        g.fillStyle = gr;
        g.fillRect(0, y, 512, 9);
      }
      noise(g, 512, 256, 3000, 0.5, true);
      stains(g, 512, 256, 14, 50, "60,35,10");
      const m = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, CEIL), new THREE.MeshStandardMaterial({ map: tex(c, 4, 1), metalness: 0.5, roughness: 0.55 }));
      m.position.set(0, CEIL / 2, HZ);
      m.rotation.y = PI;
      root.add(m);
      const sg = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 1.4),
        new THREE.MeshBasicMaterial({
          map: signTex(
            [
              { t: "SRI VELAN SUPER MARKET", font: "bold 54px Arial", y: 0.38 },
              { t: "CLOSED SINCE 1998", font: "bold 34px Arial", y: 0.78 },
            ],
            800,
            112,
            "#1a1410",
            "#b9a97a",
            "#6a1a1a",
          ),
          color: 0x9a9a9a,
        }),
      );
      sg.position.set(0, 2.35, HZ - 0.05);
      sg.rotation.y = PI;
      root.add(sg);
    }
    // baseboards + wall pilasters
    const dark = new THREE.MeshStandardMaterial({ color: 0x26302f, roughness: 0.8 });
    (
      [
        [0, -HZ + 0.06, HX * 2, 0.12, 0.12],
        [0, HZ - 0.06, HX * 2, 0.12, 0.12],
        [-HX + 0.06, 0, 0.12, 0.12, HZ * 2],
        [HX - 0.06, 0, 0.12, 0.12, HZ * 2],
      ] as const
    ).forEach(([x, z, w, h, d]) => {
      const m = new THREE.Mesh(bx(w, h, d), dark);
      m.position.set(x, 0.06, z);
      root.add(m);
    });
    const pil: Inst[] = [];
    for (let z = -36; z <= 36; z += 12) {
      pil.push({ x: -HX + 0.25, y: CEIL / 2, z, sx: 0.5, sy: CEIL, sz: 0.5 });
      pil.push({ x: HX - 0.25, y: CEIL / 2, z, sx: 0.5, sy: CEIL, sz: 0.5 });
    }
    root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x777a72, roughness: 0.9 }), pil));

    /* ---------- stock-room dividing wall (z = -26) with two wide doorways ---------- */
    {
      const parts = [
        [-HX, -16],
        [-12, 12],
        [16, HX],
      ];
      const wm = new THREE.MeshStandardMaterial({ map: wt.clone(), roughness: 0.95 });
      parts.forEach(([a, b]) => {
        const len = b - a;
        const mat = wm.clone();
        mat.map = wt.clone();
        mat.map.needsUpdate = true;
        mat.map.repeat.set(len / 4, 1);
        const m = new THREE.Mesh(bx(len, CEIL, 0.3), mat);
        m.position.set((a + b) / 2, CEIL / 2, -26);
        m.castShadow = m.receiveShadow = true;
        root.add(m);
        this.addBox(a, b, -26.15, -25.85, "wall");
      });
      const lintel = new THREE.Mesh(bx(4, 0.7, 0.3), dark);
      [-14, 14].forEach((x) => {
        const l = lintel.clone();
        l.position.set(x, CEIL - 0.35, -26);
        root.add(l);
      });
      // the back is three rooms: cold storage (west), the stock room, the staff office (east)
      const gap = [DOORS.cold.z0, DOORS.cold.z1];
      [-PART_X, PART_X].forEach((x) => {
        (
          [
            [-HZ, gap[0]],
            [gap[1], BACK_Z],
          ] as const
        ).forEach(([a, b]) => {
          const len = b - a;
          const mat = wm.clone();
          mat.map = wt.clone();
          mat.map.needsUpdate = true;
          mat.map.repeat.set(len / 4, 1);
          const m = new THREE.Mesh(bx(0.3, CEIL, len), mat);
          m.position.set(x, CEIL / 2, (a + b) / 2);
          m.castShadow = m.receiveShadow = true;
          root.add(m);
          this.addBox(x - 0.15, x + 0.15, a, b, "wall");
        });
        const l = new THREE.Mesh(bx(0.3, 0.7, gap[1] - gap[0]), dark);
        l.position.set(x, CEIL - 0.35, (gap[0] + gap[1]) / 2);
        root.add(l);
      });
      wm.map?.dispose();
      wm.dispose();
    }

    /* ---------- roller shutters on the four back doorways ---------- */
    {
      const c = cv(256, 256);
      const g = ctx2d(c);
      for (let y = 0; y < 256; y += 16) {
        const gr = g.createLinearGradient(0, y, 0, y + 16);
        gr.addColorStop(0, "#c8cdcc");
        gr.addColorStop(1, "#6a7170");
        g.fillStyle = gr;
        g.fillRect(0, y, 256, 15);
        g.fillStyle = "#30353488";
        g.fillRect(0, y + 15, 256, 1);
      }
      noise(g, 256, 256, 1600, 0.4, true);
      stains(g, 256, 256, 6, 40, "50,30,10");
      const slats = tex(c, 1, 2);
      const tints: Record<DoorId, number> = { stockW: 0x8f9896, stockE: 0x8f9896, cold: 0xcfe2ee, office: 0x9a7f5a };
      const labels: Record<DoorId, string> = { stockW: "STOCK ROOM", stockE: "STOCK ROOM", cold: "COLD STORAGE", office: "STAFF ONLY" };
      const height = CEIL - 0.7;
      const doors = {} as Record<DoorId, Door>;
      for (const id of DOOR_IDS) {
        const d = DOORS[id];
        const [cx, cz] = doorCenter(d);
        const along = d.nz ? d.x1 - d.x0 : d.z1 - d.z0;
        const panel = new THREE.Mesh(d.nz ? bx(along, height, 0.1) : bx(0.1, height, along), new THREE.MeshStandardMaterial({ map: slats, color: tints[id], metalness: 0.55, roughness: 0.5 }));
        panel.position.set(cx, height / 2, cz);
        panel.castShadow = panel.receiveShadow = true;
        root.add(panel);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(2.2, 0.42),
          new THREE.MeshBasicMaterial({ map: signTex([{ t: labels[id], font: "bold 40px Arial", y: 0.54 }], 384, 72, "#141a18", "#cfd8b0"), color: 0xb0b0b0 }),
        );
        sign.position.set(cx + d.nx * 0.17, CEIL - 0.35, cz + d.nz * 0.17);
        sign.rotation.y = Math.atan2(d.nx, d.nz);
        root.add(sign);
        const lamp = new THREE.Mesh(bx(d.nz ? 0.22 : 0.06, 0.12, d.nz ? 0.06 : 0.22), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
        lamp.position.set(cx + d.nx * 0.18 + (d.nz ? along / 2 - 0.3 : 0), CEIL - 0.82, cz + d.nz * 0.18 + (d.nx ? along / 2 - 0.3 : 0));
        root.add(lamp);
        doors[id] = { id, shut: false, t: 1, rule: "open", panel, lamp, height };
      }
      this.doors = doors;
    }

    /* ---------- shelving ---------- */
    const structList: Inst[] = [];
    const railList: Inst[] = [];
    const bins: Inst[] = [];
    const prodBoxes: Inst[] = [];
    const prodCyl: Inst[] = [];
    const atlas = atlasMap();
    const structMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.5, envMapIntensity: 0.7 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const cell = () => {
      const i = (Math.random() * 64) | 0;
      return { cu: (i % 8) / 8, cv: (7 - ((i / 8) | 0)) / 8 };
    };
    const product = (px: number, side: number, z: number, boardY: number) => {
      const r = Math.random();
      const base = boardY + 0.015;
      if (r < 0.6) {
        const w = rnd(0.12, 0.3);
        const h = rnd(0.16, 0.36);
        const d = rnd(0.1, 0.28);
        prodBoxes.push({ x: px + side * (0.1 + d / 2 + rnd(0, 0.04)), y: base + h / 2, z, sx: d, sy: h, sz: w, ry: rnd(-0.08, 0.08), rz: Math.random() < 0.05 ? rnd(-1.3, 1.3) : 0, c: gray(0.55 + Math.random() * 0.45), ...cell() });
        return w;
      }
      const rad = r < 0.85 ? rnd(0.035, 0.05) : rnd(0.045, 0.06);
      const h = r < 0.85 ? rnd(0.09, 0.16) : rnd(0.2, 0.3);
      const cl = cell();
      const rows = r < 0.85 ? 3 : 1;
      for (let k = 0; k < rows; k++) prodCyl.push({ x: px + side * (0.12 + rad + k * rad * 2.05), y: base + h / 2, z, sx: rad * 2, sy: h, sz: rad * 2, c: gray(0.55 + Math.random() * 0.45), ...cl });
      return rad * 2 + 0.01;
    };
    const shelfRun = (px: number, z0: number, n: number, opts: { tall?: boolean; noCaps?: boolean } = {}) => {
      const len = n * LM;
      const zc = z0 + len / 2;
      const tall = opts.tall;
      const H = tall ? 3.0 : 1.8;
      structList.push({ x: px, y: H / 2, z: zc, sx: 0.04, sy: H, sz: len, c: 0x444a4b }); // spine
      structList.push({ x: px, y: 0.06, z: zc, sx: HW * 2, sy: 0.12, sz: len, c: 0x2a2e2f }); // kick plate
      structList.push({ x: px, y: H + 0.02, z: zc, sx: HW * 2, sy: 0.04, sz: len, c: 0x555b5c }); // top cap
      for (let i = 0; i <= n; i++) structList.push({ x: px, y: H / 2, z: z0 + i * LM, sx: HW * 2, sy: H, sz: 0.05, c: 0x5c6264 });
      const boards = tall ? TALL_BOARDS : BOARDS;
      [-1, 1].forEach((side) => {
        boards.forEach((by) => {
          structList.push({ x: px + side * 0.31, y: by, z: zc, sx: 0.52, sy: 0.03, sz: len, c: 0x72797b });
          railList.push({ x: px + side * 0.575, y: by + 0.02, z: zc, sx: 0.015, sy: 0.05, sz: len, c: pick([0xbfbfb0, 0xd0c070, 0xc8c8c8, 0xaa4a3a]) });
        });
        // products
        const empties = Math.random() < 0.5;
        for (let bi = 0; bi < 4; bi++) {
          let z = z0 + 0.05;
          const dens = rnd(0.55, 0.95);
          while (z < z0 + len - 0.1) {
            if (Math.random() > dens) {
              z += rnd(0.2, 0.6);
              continue;
            }
            const w = product(px, side, z + 0.08, boards[bi]);
            z += w + rnd(0.005, 0.03);
          }
        }
        // ransacked: a few knocked-over products on the floor
        if (empties)
          for (let k = 0; k < 3; k++) prodBoxes.push({ x: px + side * rnd(0.8, 1.6), y: 0.07, z: z0 + rnd(0, len), sx: 0.2, sy: 0.14, sz: 0.26, ry: rnd(0, 6), rz: rnd(-0.3, 0.3), c: gray(0.5), ...cell() });
      });
      if (!opts.noCaps)
        [z0 - 0.35, z0 + len + 0.35].forEach((zz) => {
          bins.push({ x: px, y: 0.45, z: zz, sx: HW * 2, sy: 0.9, sz: 0.55, c: pick([0x6a5a40, 0x5a4a36, 0x6a6a68]) });
          for (let k = 0; k < 7; k++)
            prodBoxes.push({
              x: px + rnd(-0.45, 0.45),
              y: 0.9 + rnd(0.05, 0.22),
              z: zz + rnd(-0.2, 0.2),
              sx: rnd(0.16, 0.26),
              sy: rnd(0.14, 0.3),
              sz: rnd(0.14, 0.26),
              ry: rnd(0, 6),
              rz: Math.random() < 0.2 ? rnd(-0.5, 0.5) : 0,
              c: gray(0.6),
              ...cell(),
            });
        });
      this.addBox(px - HW - 0.02, px + HW + 0.02, z0 - (opts.noCaps ? 0.05 : 0.7), z0 + len + (opts.noCaps ? 0.05 : 0.7), "shelf");
    };
    PAIRS.forEach((px) => SEGS.forEach((s) => shelfRun(px, s.z0, s.n)));
    // back rooms: taller pallet racking (two long racks in cold storage, two short ones in the stock room)
    COLD_RACKS.forEach((px) => shelfRun(px, -45.5, 12, { tall: true, noCaps: true }));
    STOCK_RACKS.forEach((px) => shelfRun(px, STOCK_RACK_Z0, STOCK_RACK_N, { tall: true, noCaps: true }));
    const prodMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.75, metalness: 0.02, envMapIntensity: 0.3 });
    // each instance shows its own cell of the 8×8 label atlas
    prodMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.125 + aCell;\n#endif");
    };
    root.add(instanced(bx(1, 1, 1), structMat, structList, { cast: true }));
    root.add(instanced(bx(1, 1, 1), railMat, railList));
    root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), bins, { cast: true }));
    root.add(instanced(bx(1, 1, 1), prodMat, prodBoxes, { cells: true }));
    root.add(instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 12), prodMat, prodCyl, { cells: true }));

    /* ---------- produce & bakery corner (west) ---------- */
    {
      const c = cv(128, 128);
      const g = ctx2d(c);
      g.fillStyle = "#6a5638";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#4a3a24";
      for (let i = 0; i < 5; i++) g.fillRect(0, i * 26, 128, 4);
      noise(g, 128, 128, 250, 0.25, true);
      const crateMat = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.9 });
      const produce: Inst[] = [];
      const crates: Inst[] = [];
      for (let i = 0; i < 9; i++)
        [-31.5, -28.8].forEach((x, k) => {
          const z = -19 + i * 4.4 + k * 1.2;
          crates.push({ x, y: 0.38, z, sx: 1.6, sy: 0.76, sz: 1.2, ry: 0 });
          this.addC(x, z, 0.85, 0.65, "table");
          for (let j = 0; j < 22; j++)
            produce.push({
              x: x + rnd(-0.7, 0.7),
              y: 0.8 + rnd(0, 0.1),
              z: z + rnd(-0.5, 0.5),
              sx: rnd(0.1, 0.17),
              sy: rnd(0.08, 0.15),
              sz: rnd(0.1, 0.17),
              c: pick([0x4a5a2a, 0x6a2a1a, 0x7a6a2a, 0x3a4a1a, 0x5a3a1a, 0x2a3a1a]),
            });
        });
      root.add(instanced(bx(1, 1, 1), crateMat, crates, { cast: true }));
      root.add(instanced(new THREE.SphereGeometry(0.5, 7, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), produce));
    }
    // bakery counter with a glass case
    {
      const m = new THREE.Mesh(bx(1.1, 1.0, 5.2), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.6 }));
      m.position.set(-30.4, 0.5, 6);
      m.castShadow = true;
      root.add(m);
      const gl = new THREE.Mesh(bx(0.95, 0.5, 5.0), new THREE.MeshStandardMaterial({ color: 0x9fb4b0, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 }));
      gl.position.set(-30.4, 1.25, 6);
      root.add(gl);
      this.addBox(-31, -29.8, 3.3, 8.7, "counter");
    }

    /* ---------- east freezer wall (glass-door units, cold light inside) ---------- */
    {
      const bodies: Inst[] = [];
      const doors: Inst[] = [];
      const glow: Inst[] = [];
      for (let k = 0; k < 17; k++) {
        const z = -21.6 + k * 2.6;
        bodies.push({ x: HX - 0.45, y: 1.1, z, sx: 0.9, sy: 2.2, sz: 2.5, c: 0x9aa09f });
        doors.push({ x: HX - 0.93, y: 1.05, z, sx: 0.05, sy: 1.9, sz: 2.2 });
        glow.push({ x: HX - 0.91, y: 1.05, z, sx: 0.02, sy: 1.8, sz: 2.1, c: k % 5 === 3 ? 0x151a1c : 0x9ec8dc });
      }
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.5 }), bodies, { cast: true }));
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0c1012, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.42 }), doors));
      this.freezerGlow = new THREE.MeshBasicMaterial({ color: 0xffffff });
      root.add(instanced(bx(1, 1, 1), this.freezerGlow, glow));
      this.addBox(HX - 1.0, HX, -22.9, 22.9, "freezer");
      const standMat = new THREE.MeshStandardMaterial({ color: 0x3d4140, roughness: 0.5, metalness: 0.3 });
      STANDS.forEach(([x, z]) => {
        const stand = new THREE.Mesh(bx(0.7, 1.0, 0.7), standMat);
        stand.position.set(x, 0.5, z);
        stand.castShadow = true;
        root.add(stand);
        this.addC(x, z, 0.45, 0.45, "table");
      });
      const fl = new THREE.PointLight(0x9fd0e8, 0.8 * LIGHT, 9, 1);
      fl.position.set(HX - 2, 2, -6);
      root.add(fl);
      const fl2 = fl.clone();
      fl2.position.set(HX - 2, 2, 12);
      root.add(fl2);
      this.freezerLights = [fl, fl2];
    }

    /* ---------- lobby: checkout lanes, carts, vending ---------- */
    {
      const counterM = new THREE.MeshStandardMaterial({ color: 0x3d4140, roughness: 0.45, metalness: 0.3, envMapIntensity: 0.5 });
      const belt = new THREE.MeshStandardMaterial({ color: 0x111313, roughness: 0.9 });
      const reg = new THREE.MeshStandardMaterial({ color: 0x1d2222, roughness: 0.5 });
      const scr = (this.screens = new THREE.MeshBasicMaterial({ color: 0x1c4a3a }));
      const lanes = [-21, -14, -7, 0, 7, 14, 21];
      lanes.forEach((x, i) => {
        const g = new THREE.Group();
        const c1 = new THREE.Mesh(bx(1.0, 1.0, 3.0), counterM);
        c1.position.set(0, 0.5, 0);
        const bl = new THREE.Mesh(bx(0.7, 0.04, 2.0), belt);
        bl.position.set(-0.05, 1.02, -0.5);
        const rg = new THREE.Mesh(bx(0.4, 0.3, 0.45), reg);
        rg.position.set(0.15, 1.15, 1.0);
        const sc = new THREE.Mesh(bx(0.28, 0.2, 0.02), scr);
        sc.position.set(0.15, 1.34, 0.8);
        sc.rotation.x = -0.3;
        g.add(c1, bl, rg, sc);
        c1.castShadow = rg.castShadow = true;
        g.position.set(x, 0, 31 + 0.5);
        root.add(g);
        this.addC(x, 31.5, 0.55, 1.5, "counter");
        const lamp = new THREE.Mesh(
          bx(0.5, 0.35, 0.1),
          new THREE.MeshBasicMaterial({ map: signTex([{ t: String(i + 1), font: "bold 90px Arial", y: 0.55 }], 128, 96, i === 3 ? "#0a2a10" : "#1a0808", i === 3 ? "#40ff70" : "#6a2020") }),
        );
        lamp.position.set(x, 2.5, 31.5);
        lamp.rotation.y = PI;
        root.add(lamp);
        if (i === 3) this.payLamp = lamp;
      });
      // shopping carts + vending machine
      const carts: Inst[] = [];
      for (let i = 0; i < 9; i++) carts.push({ x: -31.4 + (i % 3) * 0.05, y: 0.0, z: 36 + i * 1.0, ry: PI / 2 + rnd(-0.1, 0.1) });
      (
        [
          [-9, 22, 0.7],
          [11, -6, 2.0],
          [-22, 12, 4],
          [3, 14, 1.0],
          [27, -14, 5],
          [-12, 40, 3],
        ] as const
      ).forEach(([x, z, r]) => carts.push({ x, z, ry: r, y: 0, rz: Math.random() < 0.2 ? PI / 2 : 0 }));
      this.cartGeos();
      const placed = carts.map((c) => ({ ...c, y: c.rz ? 0.3 : 0 }));
      root.add(instanced(this.cartFrameGeo!, this.metal, placed, { cast: true }));
      root.add(instanced(this.cartBasketGeo!, this.gridMat!, placed, { cast: true }));
      this.addBox(-32.5, -30.2, 35.4, 45, "cart");
      const vend = new THREE.Mesh(bx(1.0, 1.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.4, metalness: 0.3 }));
      vend.position.set(HX - 0.6, 0.95, 36);
      vend.castShadow = true;
      root.add(vend);
      const vg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), (this.vendGlass = new THREE.MeshBasicMaterial({ color: 0xbfe8ff })));
      vg.position.set(HX - 1.01, 1.15, 36);
      vg.rotation.y = -PI / 2;
      root.add(vg);
      this.addC(HX - 0.6, 36, 0.55, 0.5, "machine");
      const vl = new THREE.PointLight(0xaee0ff, 0.8 * LIGHT, 7, 1);
      vl.position.set(HX - 2, 1.4, 36);
      root.add(vl);
      this.vendLight = vl;
      // wet-floor sign
      const ws = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.65, 4), new THREE.MeshStandardMaterial({ color: 0xd8c010, roughness: 0.6 }));
      ws.position.set(6, 0.33, 24);
      ws.rotation.y = 0.7;
      ws.castShadow = true;
      root.add(ws);
    }

    /* ---------- lockers (hiding places) ---------- */
    {
      const lt = lockerTex();
      const side = new THREE.MeshStandardMaterial({ color: 0x3e4c4a, roughness: 0.6, metalness: 0.4 });
      const front = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.55, metalness: 0.45 });
      const mats = [side, side, side, side, front, side];
      const spots = LOCKERS;
      const hideSign = new THREE.MeshBasicMaterial({ map: signTex([{ t: "HIDE", font: "bold 64px Arial", y: 0.52 }], 256, 112, "#06180c", "#46d39a"), transparent: true, opacity: 0.7 });
      const lockerGeo = bx(0.5, 2.0, 0.75);
      spots.forEach(([x, z, ox, oz]) => {
        const along = [-oz, ox];
        [-1, 0, 1].forEach((k) => {
          const m = new THREE.Mesh(lockerGeo, mats);
          m.position.set(x + along[0] * k * 0.52, 1.0, z + along[1] * k * 0.52);
          m.rotation.y = Math.atan2(ox, oz);
          m.castShadow = m.receiveShadow = true;
          root.add(m);
        });
        this.addBox(x - (ox ? 0.45 : 1.0), x + (ox ? 0.45 : 1.0), z - (oz ? 0.45 : 1.0), z + (oz ? 0.45 : 1.0), "locker");
        const sg = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), hideSign);
        sg.position.set(x + ox * 0.4, 2.15, z + oz * 0.4);
        sg.rotation.y = Math.atan2(ox, oz);
        root.add(sg);
        this.hides.push({ x, z, ox, oz });
      });
    }

    /* ---------- stock room clutter: pallets, cardboard stacks ---------- */
    {
      const c = cv(128, 128);
      const g = ctx2d(c);
      g.fillStyle = "#8a6a44";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#6a4e30";
      g.fillRect(0, 60, 128, 8);
      g.fillStyle = "#c8c0a8";
      g.fillRect(8, 8, 40, 20);
      noise(g, 128, 128, 250, 0.22, true);
      stains(g, 128, 128, 3, 30, "40,30,10");
      const cardMat = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.95 });
      const palM = new THREE.MeshStandardMaterial({ color: 0x6a5436, roughness: 0.95 });
      const cards: Inst[] = [];
      const pals: Inst[] = [];
      (
        [
          [-12, -33, 3],
          [12, -34, 4],
          [-6, -41, 2],
          [7, -42.5, 3],
          [0, -31, 2],
          [-17, -43, 3],
          [17, -42, 2],
          [-34, -35, 2],
        ] as const
      ).forEach(([x, z, h]) => {
        pals.push({ x, y: 0.08, z, sx: 1.2, sy: 0.16, sz: 1.2 });
        for (let k = 0; k < h; k++) cards.push({ x: x + rnd(-0.05, 0.05), y: 0.16 + 0.42 + k * 0.84, z: z + rnd(-0.05, 0.05), sx: 1.1, sy: 0.82, sz: 1.1, ry: rnd(-0.06, 0.06) });
        this.addC(x, z, 0.65, 0.65, "crate");
      });
      root.add(instanced(bx(1, 1, 1), palM, pals, { cast: true }));
      root.add(instanced(bx(1, 1, 1), cardMat, cards, { cast: true }));

      // barricades: a row of stacked cartons that closes an aisle on delivery nights
      const stackGeo = bx(1.25, 0.84, 1.0);
      for (let i = 0; i < 6; i++) {
        const group = new THREE.Group();
        for (let k = 0; k < 3; k++)
          for (let j = 0; j < 2; j++) {
            const m = new THREE.Mesh(stackGeo, cardMat);
            m.position.set((k - 1) * 1.36 + rnd(-0.03, 0.03), 0.42 + j * 0.85, rnd(-0.04, 0.04));
            m.rotation.y = rnd(-0.05, 0.05);
            m.castShadow = m.receiveShadow = true;
            group.add(m);
          }
        group.visible = false;
        root.add(group);
        this.barricades.push({ group, box: null });
      }
    }

    /* ---------- staff office (east back room): desks, filing cabinets, a safe ---------- */
    {
      const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.7 });
      const paper = new THREE.MeshStandardMaterial({ color: 0xcfc8b0, roughness: 0.9 });
      const tops: Inst[] = [];
      const legs: Inst[] = [];
      const sheets: Inst[] = [];
      DESKS.forEach(([x, z]) => {
        tops.push({ x, y: 0.74, z, sx: 1.8, sy: 0.06, sz: 0.9 });
        legs.push({ x: x - 0.8, y: 0.36, z, sx: 0.08, sy: 0.72, sz: 0.8 }, { x: x + 0.8, y: 0.36, z, sx: 0.08, sy: 0.72, sz: 0.8 }, { x: x + 0.45, y: 0.45, z, sx: 0.5, sy: 0.5, sz: 0.7 });
        for (let k = 0; k < 3; k++) sheets.push({ x: x + rnd(-0.7, 0.1), y: 0.775, z: z + rnd(-0.25, 0.25), sx: 0.21, sy: 0.006, sz: 0.3, ry: rnd(0, 3) });
        this.addC(x, z, 0.9, 0.45, "table");
      });
      const cabinets: Inst[] = [];
      for (let k = 0; k < 7; k++) cabinets.push({ x: 20 + k * 0.95, y: 0.7, z: BACK_Z - 0.5, sx: 0.9, sy: 1.4, sz: 0.6, c: k % 3 === 1 ? 0x55605c : 0x6f7775 });
      this.addBox(19.5, 26.2, BACK_Z - 0.85, BACK_Z - 0.15, "machine");
      // the safe, in the far corner
      cabinets.push({ x: 34.6, y: 0.55, z: -46.6, sx: 1.1, sy: 1.1, sz: 1.1, c: 0x2c3230 });
      this.addC(34.6, -46.6, 0.6, 0.6, "machine");
      root.add(instanced(bx(1, 1, 1), wood, tops, { cast: true }));
      root.add(instanced(bx(1, 1, 1), wood, legs, { cast: true }));
      root.add(instanced(bx(1, 1, 1), paper, sheets));
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.5 }), cabinets, { cast: true }));
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 1.3),
        new THREE.MeshBasicMaterial({
          map: signTex(
            [
              { t: "NIGHT SHIFT ROTA", font: "bold 34px Arial", y: 0.26 },
              { t: "NOBODY SIGNED OUT", font: "bold 26px Arial", y: 0.66 },
            ],
            512,
            208,
            "#2a2418",
            "#cfc8b0",
            "#5a4632",
          ),
          color: 0x8a8a8a,
        }),
      );
      board.position.set(29, 1.75, -HZ + 0.06);
      root.add(board);
    }

    /* ---------- breaker boxes (one of them is live on a blackout night) ---------- */
    {
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x59605e, roughness: 0.55, metalness: 0.5 });
      const leverMat = new THREE.MeshStandardMaterial({ color: 0xb02018, roughness: 0.5 });
      for (const id of BREAKER_IDS) {
        const b = BREAKERS[id];
        const g = new THREE.Group();
        const body = new THREE.Mesh(bx(0.7, 0.9, 0.16), boxMat);
        const lever = new THREE.Mesh(bx(0.08, 0.34, 0.08), leverMat);
        lever.position.set(0.16, -0.1, 0.12);
        const lamp = new THREE.Mesh(bx(0.12, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: 0x202020 }));
        lamp.position.set(-0.16, 0.22, 0.09);
        g.add(body, lever, lamp);
        g.position.set(b.x, 1.35, b.z);
        g.rotation.y = Math.atan2(b.nx, b.nz);
        root.add(g);
        this.breakerLamps[id] = lamp;
        this.breakerLevers[id] = lever;
      }
    }

    /* ---------- theft sensors: a post with a red lamp and the ring it watches ---------- */
    {
      const postGeo = new THREE.CylinderGeometry(0.035, 0.05, 1.15, 8);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2e2f, roughness: 0.6, metalness: 0.4 });
      const lampGeo = new THREE.SphereGeometry(0.075, 10, 8);
      const ringGeo = new THREE.RingGeometry(SENSOR_R - 0.09, SENSOR_R, 48);
      for (let i = 0; i < 8; i++) {
        const group = new THREE.Group();
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.y = 0.575;
        const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
        lamp.position.y = 1.2;
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -PI / 2;
        ring.position.y = 0.03;
        group.add(post, lamp, ring);
        group.visible = false;
        root.add(group);
        this.sensors.push({ x: 0, z: 0, active: false, cool: 0, group, ring, lamp });
      }
    }

    /* ---------- emergency exit door (back wall) ---------- */
    {
      const hinge = new THREE.Group();
      hinge.position.set(-1.0, 0, -HZ + 0.12);
      const leaf = new THREE.Mesh(bx(2.0, 2.3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a3a32, roughness: 0.5, metalness: 0.5 }));
      leaf.position.set(1.0, 1.15, 0);
      leaf.castShadow = true;
      const bar = new THREE.Mesh(bx(1.5, 0.06, 0.07), this.metal);
      bar.position.set(1.0, 1.05, 0.08);
      hinge.add(leaf, bar);
      root.add(hinge);
      const frame = new THREE.Mesh(bx(2.4, 2.5, 0.2), dark);
      frame.position.set(0, 1.25, -HZ - 0.04);
      root.add(frame);
      const outside = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.3), new THREE.MeshBasicMaterial({ color: 0xa8c4ff }));
      outside.position.set(0, 1.15, -HZ + 0.02);
      root.add(outside);
      this.door = { hinge, open: false, t: 0 };
      this.exitBlock = { x0: -1.1, x1: 1.1, z0: -HZ - 0.2, z1: -HZ + 0.5 };
      this.exitTex = [exitSign(false), exitSign(true)];
      const es = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), new THREE.MeshBasicMaterial({ map: this.exitTex[0] }));
      es.position.set(0, 2.75, -HZ + 0.1);
      root.add(es);
      this.exitSignMesh = es;
      this.exitLight = new THREE.PointLight(0xff2020, 1.4 * LIGHT, 14, 1);
      this.exitLight.position.set(0, 2.3, -HZ + 1.5);
      root.add(this.exitLight);
    }

    /* ---------- aisle signs, wall writing, blood, puddles ---------- */
    AISLES.forEach((a) => {
      const mat = new THREE.MeshBasicMaterial({
        map: signTex(
          [
            { t: "AISLE " + a.n, font: "bold 46px Arial", y: 0.34 },
            { t: a.en, font: "bold 24px Arial", y: 0.74 },
          ],
          384,
          140,
          "#162016",
          "#cfd8b0",
        ),
        color: 0xb0b0b0,
      });
      const signGeo = new THREE.PlaneGeometry(2.0, 0.73);
      [-22.4, -6.5, 11.5, 22.6].forEach((z) => {
        for (let s = 0; s < 2; s++) {
          const m = new THREE.Mesh(signGeo, mat);
          m.position.set(a.x, 2.8, z + (s ? 0.02 : -0.02));
          m.rotation.y = s ? 0 : PI;
          root.add(m);
        }
        const rod = new THREE.Mesh(bx(0.03, 0.6, 0.03), dark);
        rod.position.set(a.x, 3.15, z);
        root.add(rod);
      });
    });
    {
      const c = cv(128, 128);
      const g = ctx2d(c);
      for (let i = 0; i < 60; i++) {
        const x = 64 + (Math.random() - 0.5) * 90;
        const y = 64 + (Math.random() - 0.5) * 90;
        const r = 2 + Math.random() * 14;
        g.fillStyle = `rgba(16,14,10,${0.25 + Math.random() * 0.45})`;
        g.beginPath();
        g.arc(x, y, r, 0, 7);
        g.fill();
      }
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = "rgba(12,11,8,.5)";
        g.lineWidth = 3 + Math.random() * 5;
        g.beginPath();
        g.moveTo(64, 64);
        g.lineTo(64 + (Math.random() - 0.5) * 130, 64 + (Math.random() - 0.5) * 130);
        g.stroke();
      }
      // old spills and drag marks (dark, oily: no blood)
      const spillMat = new THREE.MeshStandardMaterial({ map: tex(c), transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
      const spillGeo = new THREE.PlaneGeometry(2.4, 2.4);
      for (let i = 0; i < 24; i++) {
        const d = new THREE.Mesh(spillGeo, spillMat);
        d.rotation.x = -PI / 2;
        d.rotation.z = rnd(0, 6.28);
        const a = pick(AISLES);
        d.position.set(a.x + rnd(-1.2, 1.2), 0.012, rnd(-42, 40));
        d.receiveShadow = true;
        root.add(d);
      }
    }
    {
      const pud = new THREE.MeshStandardMaterial({ color: 0x050707, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.85, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3 });
      const pudGeo = new THREE.CircleGeometry(1, 24);
      for (let i = 0; i < 14; i++) {
        const p = new THREE.Mesh(pudGeo, pud);
        p.rotation.x = -PI / 2;
        p.scale.set(rnd(0.7, 2.2), rnd(0.6, 1.6), 1);
        const a = pick(AISLES);
        p.position.set(a.x + rnd(-1.3, 1.3), 0.015, rnd(-44, 42));
        root.add(p);
      }
    }
    const msg = (text: string, x: number, y: number, z: number, ry: number, w: number) => {
      const c = cv(512, 128);
      const g = ctx2d(c);
      g.fillStyle = "rgba(96,14,10,.9)";
      g.font = 'bold 56px "Segoe Script","Brush Script MT",cursive';
      g.textAlign = "center";
      g.fillText(text, 256, 74);
      for (let i = 0; i < 30; i++) g.fillRect(60 + Math.random() * 390, 84 + Math.random() * 20, 2, 8 + Math.random() * 28);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      root.add(m);
    };
    msg("RUN", -14, 1.6, -HZ + 0.05, 0, 5);
    msg("IT WATCHES", -HX + 0.05, 1.6, -14, PI / 2, 5);
    msg("DON'T LOOK BACK", HX - 0.05, 1.6, 26, -PI / 2, 6);
    msg("NO WAY OUT", 0, 1.7, -25.8, 0, 5);

    /* ---------- ducts, pipes, light fixtures ---------- */
    {
      const ducts: Inst[] = [];
      for (let x = -30; x <= 30; x += 10) ducts.push({ x: x + 2, y: CEIL - 0.28, z: 0, sx: 0.5, sy: 0.3, sz: 90, c: 0x363b3e });
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.55 }), ducts));
      const pipes: Inst[] = [];
      for (let z = -40; z <= 40; z += 20) pipes.push({ x: 0, y: CEIL - 0.1, z, sx: 70, sy: 0.12, sz: 0.12, c: 0x5a4a3a });
      root.add(instanced(bx(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.6 }), pipes));
    }
    const pts: Vec2[] = [];
    AISLES.forEach((a) => {
      for (let z = -23; z <= 22; z += 5.8) pts.push([a.x, z]);
    });
    for (let z = 25; z <= 45; z += 5) for (let x = -30; x <= 30; x += 6) pts.push([x, z]);
    for (let z = -44; z <= -28; z += 5.3) for (let x = -34; x <= 34; x += 6.8) pts.push([x, z]);
    for (let z = -20; z <= 20; z += 6) [-31, 30].forEach((x) => pts.push([x, z]));
    pts.forEach(([x, z]) => {
      const roll = Math.random();
      this.panels.push({ x, z, phase: Math.random() * 100, roll, broken: roll < this.dim, flick: 0, base: 0.8 + Math.random() * 0.2, v: 1, tint: ZONE_TINT[zoneOf(x, z)] });
    });
    root.add(instanced(bx(0.34, 0.07, 1.3), new THREE.MeshStandardMaterial({ color: 0x8a8f90, roughness: 0.5 }), pts.map(([x, z]) => ({ x, y: CEIL - 0.035, z }))));
    this.panelMesh = instanced(
      bx(0.22, 0.02, 1.15),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      pts.map(([x, z]) => ({ x, y: CEIL - 0.08, z, c: 0xffffff })),
    );
    root.add(this.panelMesh);
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xdbe6cf, 0, 16, 2);
      l.position.set(0, CEIL - 0.4, 0);
      root.add(l);
      this.pool.push(l);
    }
    this.blackout = 0;

    /* ---------- pickups: real-looking packages with a soft glow so the player can find them ---------- */
    const haloTex = (() => {
      const c = cv(64, 64);
      const g = ctx2d(c);
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.35, "rgba(255,255,255,.3)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return tex(c);
    })();
    const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.3, 8, 1, true);
    this.items = ITEM_DEFS.map((def) => {
      const slot: Slot = SLOTS[def.slot];
      const lt = labelTex(def.label, def.bg);
      const mt = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.55, emissive: new THREE.Color(def.color).multiplyScalar(0.18), emissiveMap: lt });
      const geo: THREE.BoxGeometry | THREE.CylinderGeometry =
        def.kind === "carton"
          ? bx(0.1, 0.22, 0.075)
          : def.kind === "bag"
            ? bx(0.3, 0.44, 0.11)
            : def.kind === "salt"
              ? bx(0.1, 0.16, 0.07)
              : def.kind === "loaf"
                ? bx(0.36, 0.13, 0.12)
                : def.kind === "flat"
                  ? bx(0.3, 0.05, 0.2)
                  : def.kind === "jar"
                    ? new THREE.CylinderGeometry(0.06, 0.06, 0.12, 20)
                    : def.kind === "can"
                      ? new THREE.CylinderGeometry(0.05, 0.05, 0.1, 20)
                      : new THREE.CylinderGeometry(0.04, 0.045, 0.3, 20);
      const mesh = new THREE.Mesh(geo, mt);
      const hgt = geo.parameters.height || 0.2;
      mesh.position.y = hgt / 2;
      mesh.castShadow = true;
      const g = new THREE.Group();
      g.add(mesh);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: def.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.set(1.9, 1.9, 1);
      sp.position.y = hgt / 2;
      g.add(sp);
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.y = 1.65 - slot.y;
      g.add(beam);
      g.position.set(slot.x, slot.y, slot.z);
      g.rotation.y = def.kind === "bag" ? 0.2 : 0;
      g.visible = false;
      root.add(g);
      return { def, slot, group: g, mesh, sp, beam, active: false, got: false, t: Math.random() * 6 };
    });

    /* ---------- coins, batteries, keys, fuses and the bonus item (pools: a night puts out what it needs) ---------- */
    {
      const halo = (color: number, size: number, opacity = 0.5) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
        sp.scale.set(size, size, 1);
        return sp;
      };
      const pillar = (color: number) => {
        const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.name = "beam";
        return m;
      };
      const add = (kind: PickupKind, group: THREE.Group) => {
        group.visible = false;
        root.add(group);
        this.pickups.push({ kind, group, x: 0, z: 0, slot: null, door: null, name: "", where: "", active: false, got: false, t: Math.random() * 6, baseY: 0 });
      };
      const coinGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.016, 18).rotateX(PI / 2);
      const coinMat = new THREE.MeshStandardMaterial({ color: 0xe8b83a, metalness: 0.9, roughness: 0.3, emissive: 0x4a3200 });
      for (let i = 0; i < 14; i++) {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(coinGeo, coinMat), halo(0xffc840, 0.7, 0.35));
        add("coin", g);
      }
      const cellGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.2, 14);
      const cellMat = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, metalness: 0.4, roughness: 0.4, emissive: 0x0f4a18 });
      const capGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10);
      for (let i = 0; i < 5; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(cellGeo, cellMat);
        const cap = new THREE.Mesh(capGeo, this.metal);
        body.rotation.z = cap.rotation.z = 0.5;
        cap.position.set(-Math.sin(0.5) * 0.115, Math.cos(0.5) * 0.115, 0);
        g.add(body, cap, halo(0x6aff7a, 1.0, 0.45));
        add("battery", g);
      }
      const cardGeo = bx(0.2, 0.012, 0.13);
      for (const color of [0x6ad0ff, 0xffb040]) {
        const g = new THREE.Group();
        const card = new THREE.Mesh(cardGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: new THREE.Color(color).multiplyScalar(0.35) }));
        card.position.y = 0.05;
        card.rotation.z = 0.25;
        const p = pillar(color);
        g.add(card, halo(color, 1.5), p);
        add("key", g);
      }
      const fuseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12).rotateZ(PI / 2);
      const fuseMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.3, emissive: 0x6a4a10 });
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const f = new THREE.Mesh(fuseGeo, fuseMat);
        f.position.y = 0.04;
        g.add(f, halo(0xffb040, 1.4), pillar(0xffb040));
        add("fuse", g);
      }
      {
        const g = new THREE.Group();
        const b = new THREE.Mesh(bx(0.24, 0.1, 0.16), new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.7, roughness: 0.35, emissive: 0x5a3c08 }));
        b.position.y = 0.05;
        g.add(b, halo(0xffd870, 1.3, 0.4));
        add("bonus", g);
      }
    }

    /* ---------- navigation ---------- */
    this.fixed = this.boxes;
    this.rebuildBoxes();
  }

  /* ---------------- a night's set-up ---------------- */

  /** Solid things right now = the store + shutters that are down + barricades + the exit until it opens. */
  private rebuildBoxes() {
    const boxes = this.fixed.slice();
    for (const id of DOOR_IDS) if (this.doors[id].shut) boxes.push({ ...DOORS[id], kind: "gate" });
    for (const b of this.barricades) if (b.box) boxes.push(b.box);
    if (!this.door?.open) boxes.push({ ...this.exitBlock, kind: "door" });
    this.boxes = boxes;
    this.finalizeNav();
    this.navVersion++;
  }

  /** Puts the store in the state a night starts in. */
  applyNight(night: NightDef, index: number) {
    const rand = seeded(index + 1);
    // lights and power
    this.dim = night.dim;
    this.panels.forEach((p) => {
      p.broken = p.roll < night.dim;
      p.flick = 0;
    });
    this.blackout = 0;
    this.breaker = night.power?.breaker ?? null;
    this.setPower(!night.power);
    // doors
    for (const id of DOOR_IDS) {
      const d = this.doors[id];
      d.rule = night.doors[id];
      d.shut = d.rule !== "open";
      d.t = d.shut ? 0 : 1;
      this.poseDoor(d);
    }
    if (this.door) {
      this.door.open = false;
      this.door.t = 0;
      this.door.hinge.rotation.y = 0;
    }
    this.exitSignMesh.material.map = this.exitTex![0];
    this.exitSignMesh.material.needsUpdate = true;
    this.exitLight.color.setHex(0xff2020);
    // barricades
    this.barricades.forEach((b, i) => {
      const spot = night.barricades?.[i];
      b.group.visible = !!spot;
      b.box = null;
      if (!spot) return;
      const at = barricadeBox(spot);
      b.group.position.set(at.x, 0, at.z);
      b.box = { x0: at.x0, x1: at.x1, z0: at.z0, z1: at.z1, kind: "barricade" };
    });
    this.rebuildBoxes();
    // sensors
    this.sensors.forEach((s, i) => {
      const id = night.sensors?.[i];
      s.active = !!id;
      s.cool = 0;
      s.group.visible = s.active;
      if (!id) return;
      [s.x, s.z] = SENSOR_SPOTS[id];
      s.group.position.set(s.x, 0, s.z);
    });
    // the list
    this.items.forEach((it) => {
      it.active = (night.items as string[]).includes(it.def.id);
      it.got = false;
      it.group.visible = it.active;
    });
    // everything else that can be picked up
    this.pickups.forEach((p) => {
      p.active = p.got = false;
      p.group.visible = false;
      p.slot = null;
      p.door = null;
    });
    const take = (kind: PickupKind) => this.pickups.find((p) => p.kind === kind && !p.active);
    const onShelf = (kind: PickupKind, slot: Slot, name: string, door: DoorId | null = null) => {
      const p = take(kind);
      if (!p) return;
      Object.assign(p, { active: true, slot, door, name, where: slot.where, x: slot.x, z: slot.z, baseY: slot.y });
      p.group.position.set(slot.x, slot.y, slot.z);
      p.group.rotation.y = Math.atan2(slot.nx, slot.nz);
      const beam = p.group.getObjectByName("beam");
      if (beam) beam.position.y = 1.65 - slot.y;
      p.group.visible = true;
    };
    for (const id of DOOR_IDS) {
      const slot = night.keys?.[id];
      if (slot && night.doors[id] === "key") onShelf("key", SLOTS[slot], id === "cold" ? "Cold-room keycard" : id === "office" ? "Office key" : "Stock room key", id);
    }
    night.power?.fuses?.forEach((slot) => onShelf("fuse", SLOTS[slot], "Fuse"));
    if (night.goal.kind === "bonus") onShelf("bonus", SLOTS[night.goal.slot], night.goal.name);
    // coins and batteries lie on open floor in the rooms that can be reached before the alarm
    const opens = (id: DoorId) => night.doors[id] !== "shut" && night.doors[id] !== "pay";
    const stockOpens = opens("stockW") || opens("stockE");
    const beforeAlarm = (zone: Zone) => zone === "store" || (stockOpens && (zone === "stock" || opens(zone)));
    const spots = FLOOR_SPOTS.filter(([x, z]) => beforeAlarm(zoneOf(x, z)) && !this.isBlocked(x, z));
    const onFloor = (kind: PickupKind, y: number, name: string) => {
      const p = take(kind);
      if (!p || !spots.length) return;
      const [x, z] = spots.splice(Math.floor(rand() * spots.length), 1)[0];
      Object.assign(p, { active: true, name, where: "", x, z, baseY: y });
      p.group.position.set(x, y, z);
      p.group.visible = true;
    };
    for (let i = 0; i < night.batteries; i++) onFloor("battery", 0.16, "Battery");
    for (let i = 0; i < night.coins; i++) onFloor("coin", 0.28, "Coin");
  }

  /** Mains on / off: ceiling lights, freezers, the vending machine, the register screens and lamp. */
  setPower(on: boolean) {
    this.power = on;
    this.freezerGlow?.color.setScalar(on ? 1 : 0.06);
    this.screens?.color.setHex(on ? 0x1c4a3a : 0x040807);
    this.vendGlass?.color.setHex(on ? 0xbfe8ff : 0x10181c);
    this.payLamp?.material.color.setHex(on ? 0xffffff : 0x2a2a2a);
    for (const id of BREAKER_IDS) {
      const live = id === this.breaker;
      this.breakerLamps[id].material.color.setHex(live ? (on ? 0x30ff50 : 0xff3030) : 0x202020);
      this.breakerLevers[id].position.y = live && !on ? -0.1 : 0.1;
    }
  }

  private poseDoor(d: Door) {
    const s = 1 - d.t * 0.93;
    d.panel.scale.y = s;
    d.panel.position.y = d.height - (d.height * s) / 2;
    d.lamp.material.color.setHex(d.shut ? 0xff3030 : 0x30ff50);
  }

  /** Rolls a shutter up for good. */
  openGate(id: DoorId) {
    const d = this.doors[id];
    if (!d.shut) return false;
    d.shut = false;
    d.lamp.material.color.setHex(0x30ff50);
    this.rebuildBoxes();
    return true;
  }

  /* ---------------- per-frame ---------------- */
  /** Flickering ceiling panels; the six nearest the camera carry real lights. */
  updateLights(dt: number, px: number, pz: number) {
    this.blackout = Math.max(0, this.blackout - dt);
    const ps = this.panels;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.phase += dt;
      let v = p.base;
      if (p.broken) {
        v = Math.sin(p.phase * 17) * Math.sin(p.phase * 5.3) > 0.82 ? 0.9 : 0.03;
        if (Math.random() < dt * 0.5) p.phase += Math.random() * 10;
      } else if (p.flick > 0) {
        p.flick -= dt;
        v = Math.random() < 0.5 ? 0.08 : 0.9;
      } else if (Math.random() < dt * 0.04) p.flick = 0.1 + Math.random() * 0.5;
      if (this.blackout > 0 || !this.power) v *= 0.02;
      p.v = v;
      _c.setRGB(p.tint[0] * v, p.tint[1] * v, p.tint[2] * v);
      this.panelMesh.setColorAt(i, _c);
    }
    this.panelMesh.instanceColor!.needsUpdate = true;
    // the nearest panels carry the real lights (no allocation: a small insertion sort into `near`)
    const near = this.near;
    const n = this.pool.length;
    for (let k = 0; k < n; k++) near[k * 2] = Infinity;
    for (let i = 0; i < ps.length; i++) {
      const d = (ps[i].x - px) ** 2 + (ps[i].z - pz) ** 2;
      if (d >= near[(n - 1) * 2]) continue;
      let k = n - 1;
      while (k > 0 && near[(k - 1) * 2] > d) {
        near[k * 2] = near[(k - 1) * 2];
        near[k * 2 + 1] = near[(k - 1) * 2 + 1];
        k--;
      }
      near[k * 2] = d;
      near[k * 2 + 1] = i;
    }
    for (let i = 0; i < n; i++) {
      const p = ps[near[i * 2 + 1]];
      const light = this.pool[i];
      light.position.set(p.x, CEIL - 0.4, p.z);
      light.intensity = p.v * 2.0 * LIGHT;
      light.color.setHex(ZONE_LIGHT[zoneOf(p.x, p.z)]);
    }
  }

  tick(dt: number, t: number) {
    for (const it of this.items) {
      if (!it.active || it.got) continue;
      it.t += dt;
      it.group.position.y = it.slot.y + Math.sin(it.t * 1.6) * 0.012;
      (it.sp.material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(it.t * 2.5) * 0.18;
      it.beam.material.opacity = 0.17 + Math.sin(it.t * 1.7) * 0.05;
    }
    for (const p of this.pickups) {
      if (!p.active || p.got) continue;
      p.t += dt;
      p.group.position.y = p.baseY + Math.sin(p.t * 1.9) * (p.slot ? 0.012 : 0.05);
      if (p.kind === "coin") p.group.rotation.y = p.t * 2.2;
    }
    for (const id of DOOR_IDS) {
      const g = this.doors[id];
      const target = g.shut ? 0 : 1;
      if (g.t === target) continue;
      g.t = target ? Math.min(1, g.t + dt / 1.6) : 0;
      this.poseDoor(g);
    }
    for (const s of this.sensors) {
      if (!s.active) continue;
      s.cool = Math.max(0, s.cool - dt);
      const tripped = s.cool > 0;
      const blink = tripped ? (Math.sin(t * 22) > 0 ? 1 : 0.15) : 0.55 + Math.sin(t * 3.1 + s.x) * 0.25;
      s.ring.material.opacity = (tripped ? 0.75 : 0.42) * blink;
      s.lamp.material.color.setRGB(blink, tripped ? 0.3 * blink : 0.08 * blink, 0.05 * blink);
    }
    const d = this.door;
    if (d) {
      if (d.open && d.t < 1) d.t = Math.min(1, d.t + dt / 1.3);
      if (!d.open && d.t > 0) d.t = 0;
      d.hinge.rotation.y = -d.t * 1.95;
    }
    const on = this.power ? 1 : 0;
    this.freezerLights.forEach((l, i) => (l.intensity = on * (0.6 + Math.sin(t * 7 + i) * 0.05 * (Math.random() < 0.02 ? 6 : 1)) * LIGHT));
    if (this.vendLight) this.vendLight.intensity = on * (0.7 + (Math.random() < 0.03 ? -0.5 : 0)) * LIGHT;
  }

  /** The emergency exit swings open (the alarm has gone off). */
  openDoor() {
    if (!this.door || this.door.open) return;
    this.door.open = true;
    this.rebuildBoxes();
    this.exitSignMesh.material.map = this.exitTex![1];
    this.exitSignMesh.material.needsUpdate = true;
    this.exitLight.color.setHex(0x30ff50);
    if (this.payLamp) this.payLamp.material.color.setHex(0x333333);
  }

  /* ---------------- navigation grid ---------------- */
  private finalizeNav() {
    const blocked = this.blocked;
    const boxes = this.boxes;
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const cx = X0 + (i + 0.5) * CS;
        const cz = Z0 + (j + 0.5) * CS;
        let b = 0;
        if (cx < -XI + 0.8 || cx > XI - 0.8 || cz < -ZI + 0.8 || cz > ZI - 0.8) b = 1;
        if (!b)
          for (let k = 0; k < boxes.length; k++) {
            const box = boxes[k];
            if (cx > box.x0 - 0.55 && cx < box.x1 + 0.55 && cz > box.z0 - 0.55 && cz < box.z1 + 0.55) {
              b = 1;
              break;
            }
          }
        blocked[j * GW + i] = b;
      }
    // label the connected walkable areas (a closed shutter cuts a room off)
    const region = this.region;
    const queue = (this.queue ??= new Int32Array(GW * GH));
    region.fill(0);
    let label = 0;
    for (let s = 0; s < GW * GH; s++) {
      if (blocked[s] || region[s]) continue;
      label++;
      let qh = 0;
      let qt = 0;
      queue[qt++] = s;
      region[s] = label;
      while (qh < qt) {
        const c = queue[qh++];
        const ci = c % GW;
        const cj = (c / GW) | 0;
        for (let k = 0; k < 4; k++) {
          const a = ci + NB[k][0];
          const b = cj + NB[k][1];
          if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
          const n = b * GW + a;
          if (blocked[n] || region[n]) continue;
          region[n] = label;
          queue[qt++] = n;
        }
      }
    }
  }

  /** True when a walker can get from one point to the other (each snapped to the nearest free cell). */
  connected(ax: number, az: number, bx2: number, bz: number) {
    const a = this.nearestFree(...this.toCell(ax, az));
    const b = this.nearestFree(...this.toCell(bx2, bz));
    const ra = this.region[a[1] * GW + a[0]];
    return ra !== 0 && ra === this.region[b[1] * GW + b[0]];
  }

  /* ---------------- collision / line of sight ---------------- */
  collide(p: { x: number; z: number }, r: number) {
    p.x = Math.max(-XI + r, Math.min(XI - r, p.x));
    p.z = Math.max(-ZI + r, Math.min(ZI - r, p.z));
    for (let k = 0; k < 2; k++)
      for (const b of this.boxes) {
        const cx = Math.max(b.x0, Math.min(p.x, b.x1));
        const cz = Math.max(b.z0, Math.min(p.z, b.z1));
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = cx + (dx / d) * r;
            p.z = cz + (dz / d) * r;
          } else {
            const l = p.x - b.x0;
            const rr = b.x1 - p.x;
            const t = p.z - b.z0;
            const bt = b.z1 - p.z;
            const m = Math.min(l, rr, t, bt);
            if (m === l) p.x = b.x0 - r;
            else if (m === rr) p.x = b.x1 + r;
            else if (m === t) p.z = b.z0 - r;
            else p.z = b.z1 + r;
          }
        }
      }
  }

  hasLOS(ax: number, az: number, bx2: number, bz: number, pad = 0) {
    for (const b of this.boxes) {
      if (LOW[b.kind] && !(pad > 0)) continue;
      if (segHitsBox(ax, az, bx2, bz, b, pad)) return false;
    }
    return true;
  }

  toCell(x: number, z: number): Vec2 {
    return [Math.max(0, Math.min(GW - 1, Math.floor((x - X0) / CS))), Math.max(0, Math.min(GH - 1, Math.floor((z - Z0) / CS)))];
  }
  cellCenter(i: number, j: number): Vec2 {
    return [X0 + (i + 0.5) * CS, Z0 + (j + 0.5) * CS];
  }
  isBlocked(x: number, z: number) {
    const [i, j] = this.toCell(x, z);
    return !!this.blocked[j * GW + i];
  }
  private nearestFree(i: number, j: number): Vec2 {
    if (!this.blocked[j * GW + i]) return [i, j];
    for (let r = 1; r < 14; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const a = i + di;
          const b = j + dj;
          if (a >= 0 && b >= 0 && a < GW && b < GH && !this.blocked[b * GW + a]) return [a, b];
        }
    return [i, j];
  }
  /** A walker's own distance field (the Wendigo and the hooded woman each keep one). */
  makeField() {
    return new Int16Array(GW * GH).fill(-1);
  }
  /** Breadth-first distance field to (tx, tz) over the navigation grid, written into `dist`. */
  buildField(dist: Int16Array, tx: number, tz: number) {
    const queue = (this.queue ??= new Int32Array(GW * GH));
    const blocked = this.blocked;
    let [ti, tj] = this.toCell(tx, tz);
    [ti, tj] = this.nearestFree(ti, tj);
    dist.fill(-1);
    let qh = 0;
    let qt = 0;
    queue[qt++] = tj * GW + ti;
    dist[tj * GW + ti] = 0;
    while (qh < qt) {
      const c = queue[qh++];
      const ci = c % GW;
      const cj = (c / GW) | 0;
      const cd = dist[c];
      for (const [di, dj] of NB) {
        const a = ci + di;
        const b = cj + dj;
        if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
        const n = b * GW + a;
        if (blocked[n] || dist[n] !== -1) continue;
        if (di && dj && (blocked[cj * GW + a] || blocked[b * GW + ci])) continue;
        dist[n] = cd + 1;
        queue[qt++] = n;
      }
    }
  }
  /** The next cell towards the field's target, or null when there is no way (a closed shutter between). */
  nextStep(dist: Int16Array, x: number, z: number): Vec2 | null {
    let [ci, cj] = this.toCell(x, z);
    // standing in a blocked cell (pressed against a shelf): step from the nearest free one
    if (this.blocked[cj * GW + ci]) [ci, cj] = this.nearestFree(ci, cj);
    const cur = dist[cj * GW + ci];
    let best: Vec2 | null = null;
    let bd = cur < 0 ? 1e9 : cur;
    for (const [di, dj] of NB) {
      const a = ci + di;
      const b = cj + dj;
      if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
      const d = dist[b * GW + a];
      if (d < 0 || d >= bd) continue;
      if (di && dj && (this.blocked[cj * GW + a] || this.blocked[b * GW + ci])) continue;
      bd = d;
      best = [a, b];
    }
    return best ? this.cellCenter(best[0], best[1]) : null;
  }
  /** A free spot within `radius` of (nx, nz) that can be walked to from there. */
  randomFree(nx: number, nz: number, radius = 10): Vec2 {
    const [oi, oj] = this.nearestFree(...this.toCell(nx, nz));
    const home = this.region[oj * GW + oi];
    for (let k = 0; k < 120; k++) {
      const x = nx + (Math.random() - 0.5) * 2 * radius;
      const z = nz + (Math.random() - 0.5) * 2 * radius;
      if (Math.abs(x) > XI - 1 || Math.abs(z) > ZI - 1) continue;
      const [i, j] = this.toCell(x, z);
      if (!this.blocked[j * GW + i] && this.region[j * GW + i] === home) return this.cellCenter(i, j);
    }
    return this.cellCenter(oi, oj);
  }
  /** Patrol points that can be walked to from (x, z) tonight. */
  waypointsFrom(x: number, z: number): Vec2[] {
    return WAYPOINTS.filter(([wx, wz]) => !this.isBlocked(wx, wz) && this.connected(x, z, wx, wz));
  }

  dispose() {
    this.envTexture?.dispose();
    this.exitTex?.forEach((t) => t.dispose());
    this.cartFrameGeo?.dispose();
    this.cartBasketGeo?.dispose();
    this.gridTex?.dispose();
    this.gridMat?.dispose();
    this.metal.dispose();
    this.cartPaint.frame.dispose();
    this.cartPaint.basket?.dispose();
    this.cartPaint.grip.dispose();
  }
}
