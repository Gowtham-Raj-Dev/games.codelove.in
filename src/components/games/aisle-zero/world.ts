import * as THREE from "three";

/**
 * Aisle Zero's abandoned supermarket. Everything here is built in code with generated textures: layout,
 * collision boxes, navigation grid, lights, shelving with thousands of instanced products, props and
 * pickups. Light intensities are in the old (pre-r155) units, multiplied by LIGHT — see engine.ts.
 */

const PI = Math.PI;
/** Old three.js light units → current ones (the engine also restores the old distance falloff). */
export const LIGHT = Math.PI;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];

export const XI = 35.7;
export const ZI = 47.7;
export const CEIL = 3.4;
const X0 = -36;
const Z0 = -48;
const CS = 0.5;
export const GW = 144;
export const GH = 192;

export type BoxKind = "shelf" | "wall" | "door" | "table" | "counter" | "freezer" | "cart" | "machine" | "locker" | "crate";
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: BoxKind;
}

/* ---------------- layout ---------------- */
const PAIRS: number[] = [];
for (let i = 0; i < 9; i++) PAIRS.push(-20.8 + 5.2 * i); // double-sided shelf runs (x centres)
const SEGS = [
  { z0: -22, n: 10 },
  { z0: -4, n: 10 },
  { z0: 14, n: 6 },
]; // modules of 1.3 m along z; cross aisles between
const LM = 1.3;
const HW = 0.6; // module length, half-width of a double run
const BOARDS = [0.2, 0.6, 1.0, 1.4]; // shelf board heights
const AISLE_NAMES = ["COOKING OILS", "SPICES", "RICE & FLOUR", "SNACKS", "BEVERAGES", "SALT & SUGAR", "CLEANING", "SWEETS & HONEY", "BABY & PET", "FROZEN"];
export const AISLES = AISLE_NAMES.map((en, i) => ({ n: i + 1, x: i === 0 ? -25 : i === 9 ? 25 : (PAIRS[i - 1] + PAIRS[i]) / 2, en }));
export const SPAWN = { x: 0, z: 44, yaw: 0 };
export const PAY_POINT = { x: 0, z: 31 };
export const CREATURE_START: [number, number] = [0, -40];

const shelfFace = (pairIdx: number, side: number) => PAIRS[pairIdx] + side * 0.55; // x where items sit on a shelf face

export interface ItemDef {
  id: string;
  kind: "bottle" | "bag" | "salt" | "jar" | "carton" | "loaf" | "flat" | "can";
  label: string;
  x: number;
  z: number;
  y: number;
  color: number;
  bg: string;
  name: string;
  where: string;
}

export const ITEM_DEFS: ItemDef[] = [
  { id: "oil", kind: "bottle", label: "OIL", x: shelfFace(0, -1), z: 17, y: BOARDS[1], color: 0x7dff9a, bg: "#7a8a2a", name: "Cooking oil", where: "Aisle 1 · Cooking Oils" },
  { id: "rice", kind: "bag", label: "RICE", x: shelfFace(1, 1), z: 0.2, y: BOARDS[1], color: 0xffe9a0, bg: "#b8a46a", name: "Rice bag", where: "Aisle 3 · Rice & Flour" },
  { id: "salt", kind: "salt", label: "SALT", x: shelfFace(5, -1), z: -15.5, y: BOARDS[2], color: 0xffffff, bg: "#cfd4d8", name: "Salt", where: "Aisle 6 · Salt & Sugar" },
  { id: "honey", kind: "jar", label: "HONEY", x: shelfFace(7, -1), z: 3.4, y: BOARDS[1], color: 0xffc23a, bg: "#c8861c", name: "Honey", where: "Aisle 8 · Sweets & Honey" },
  { id: "milk", kind: "carton", label: "MILK", x: 33.1, z: -11, y: 1.05, color: 0xcfe8ff, bg: "#dfe6ee", name: "Milk packet", where: "Freezer wall (east)" },
  { id: "bread", kind: "loaf", label: "BREAD", x: -30.2, z: 6, y: 1.05, color: 0xffb870, bg: "#a8743a", name: "Bread", where: "Bakery corner (west)" },
  { id: "biscuit", kind: "flat", label: "BISCUITS", x: -22.55, z: -38.1, y: 0.915, color: 0xff9ad0, bg: "#b04a6a", name: "Biscuits", where: "Stock room (west rack)" },
  { id: "tin", kind: "can", label: "TINS", x: 22.55, z: -38.1, y: 0.915, color: 0xff7a5a, bg: "#b8402a", name: "Tinned food", where: "Stock room (east rack)" },
];

export interface Item {
  def: ItemDef;
  group: THREE.Group;
  mesh: THREE.Mesh;
  sp: THREE.Sprite;
  beam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  got: boolean;
  t: number;
  baseY: number;
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
  broken: boolean;
  flick: number;
  base: number;
  v: number;
}

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
/** Low things (counters, tables, carts, crates) don't block sight unless a padding is asked for. */
const LOW: Partial<Record<BoxKind, boolean>> = { table: true, counter: true, cart: true, crate: true };
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
  boxes: Box[] = [];
  items: Item[] = [];
  hides: Hide[] = [];
  waypoints: Vec2[] = [];
  blocked = new Uint8Array(GW * GH);
  /** Seconds left of a power cut (every ceiling light nearly dark). */
  blackout = 0;
  private readonly panels: Panel[] = [];
  private panelMesh!: THREE.InstancedMesh;
  private pool: THREE.PointLight[] = [];
  private freezerLights: THREE.PointLight[] = [];
  private vendLight: THREE.PointLight | null = null;
  private exitLight!: THREE.PointLight;
  private exitSignMesh!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private exitTex: [THREE.Texture, THREE.Texture] | null = null;
  private payLamp: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | null = null;
  door: { hinge: THREE.Group; open: boolean; t: number } | null = null;
  private exitBlock!: Omit<Box, "kind">;
  private dist: Int16Array | null = null;
  private queue: Int32Array | null = null;
  private cartFrameGeo: THREE.BufferGeometry | null = null;
  private cartBasketGeo: THREE.BufferGeometry | null = null;
  private gridMat: THREE.MeshStandardMaterial | null = null;
  private readonly metal = new THREE.MeshStandardMaterial({ color: 0xb4b8ba, metalness: 0.85, roughness: 0.38, envMapIntensity: 0.9 });
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
    const gt = gridAlpha();
    gt.repeat.set(6, 6);
    this.gridMat = new THREE.MeshStandardMaterial({ color: 0xc4c8ca, metalness: 0.8, roughness: 0.4, alphaMap: gt, alphaTest: 0.5, side: THREE.DoubleSide, map: gt });
  }
  makeCart() {
    this.cartGeos();
    const g = new THREE.Group();
    const f = new THREE.Mesh(this.cartFrameGeo!, this.metal);
    const b = new THREE.Mesh(this.cartBasketGeo!, this.gridMat!);
    f.castShadow = b.castShadow = true;
    g.add(f, b);
    return g;
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
    const product = (px: number, side: number, z: number, board: number) => {
      const r = Math.random();
      const base = BOARDS[board] + 0.015;
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
      const boards = tall ? [0.2, 0.9, 1.6, 2.3] : BOARDS;
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
            const w = product(px, side, z + 0.08, tall ? 0 : bi);
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
    // stock room: taller pallet racking
    [-30, -22, 22, 30].forEach((px) => shelfRun(px, -45.5, 12, { tall: true, noCaps: true }));
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
      root.add(instanced(bx(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), glow));
      this.addBox(HX - 1.0, HX, -22.9, 22.9, "freezer");
      const stand = new THREE.Mesh(bx(0.7, 1.0, 0.7), new THREE.MeshStandardMaterial({ color: 0x3d4140, roughness: 0.5, metalness: 0.3 }));
      stand.position.set(33.1, 0.5, -11);
      stand.castShadow = true;
      root.add(stand);
      this.addC(33.1, -11, 0.45, 0.45, "table");
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
      const scr = new THREE.MeshBasicMaterial({ color: 0x1c4a3a });
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
      const vg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0xbfe8ff }));
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
      const spots = [
        [-35.3, -14, 1, 0],
        [-35.3, 14, 1, 0],
        [-35.3, 26, 1, 0],
        [35.3, 40, -1, 0],
        [-35.3, -31, 1, 0],
        [-35.3, -41, 1, 0],
        [35.3, -31, -1, 0],
        [35.3, -41, -1, 0],
        [-10, -47.3, 0, 1],
        [10, -47.3, 0, 1],
      ];
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
          [33.5, -35.5, 3],
        ] as const
      ).forEach(([x, z, h]) => {
        pals.push({ x, y: 0.08, z, sx: 1.2, sy: 0.16, sz: 1.2 });
        for (let k = 0; k < h; k++) cards.push({ x: x + rnd(-0.05, 0.05), y: 0.16 + 0.42 + k * 0.84, z: z + rnd(-0.05, 0.05), sx: 1.1, sy: 0.82, sz: 1.1, ry: rnd(-0.06, 0.06) });
        this.addC(x, z, 0.65, 0.65, "crate");
      });
      root.add(instanced(bx(1, 1, 1), palM, pals, { cast: true }));
      root.add(instanced(bx(1, 1, 1), cardMat, cards, { cast: true }));
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
      this.addBox(-1.1, 1.1, -HZ - 0.2, -HZ + 0.5, "door");
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
        g.fillStyle = `rgba(60,5,5,${0.3 + Math.random() * 0.5})`;
        g.beginPath();
        g.arc(x, y, r, 0, 7);
        g.fill();
      }
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = "rgba(50,4,4,.6)";
        g.lineWidth = 3 + Math.random() * 5;
        g.beginPath();
        g.moveTo(64, 64);
        g.lineTo(64 + (Math.random() - 0.5) * 130, 64 + (Math.random() - 0.5) * 130);
        g.stroke();
      }
      const bloodMat = new THREE.MeshStandardMaterial({ map: tex(c), transparent: true, depthWrite: false, roughness: 0.25, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
      const bloodGeo = new THREE.PlaneGeometry(2.4, 2.4);
      for (let i = 0; i < 24; i++) {
        const d = new THREE.Mesh(bloodGeo, bloodMat);
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
      g.fillStyle = "rgba(110,8,8,.92)";
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
    pts.forEach(([x, z]) => this.panels.push({ x, z, phase: Math.random() * 100, broken: Math.random() < 0.38, flick: 0, base: 0.8 + Math.random() * 0.2, v: 1 }));
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
    this.items = ITEM_DEFS.map((def) => {
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
        new THREE.CylinderGeometry(0.05, 0.05, 3.3, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.y = 1.65;
      g.add(beam);
      g.position.set(def.x, def.y, def.z);
      g.rotation.y = def.kind === "bag" ? 0.2 : 0;
      root.add(g);
      return { def, group: g, mesh, sp, beam, got: false, t: Math.random() * 6, baseY: def.y };
    });

    /* ---------- navigation + patrol waypoints ---------- */
    this.finalizeNav();
    this.waypoints = [];
    const wp = (x: number, z: number) => {
      const [i, j] = this.toCell(x, z);
      if (!this.blocked[j * GW + i]) this.waypoints.push([x, z]);
    };
    AISLES.forEach((a) => [-13.5, -6.5, 1, 11.5, 18, -22.6].forEach((z) => wp(a.x, z)));
    (
      [
        [-24, 38],
        [-12, 38],
        [0, 38],
        [12, 38],
        [24, 38],
        [-30, 0],
        [-30, -12],
        [-30, 16],
        [30, -14],
        [30, 6],
        [-20, -32],
        [20, -32],
        [0, -36],
        [-6, -44],
        [6, -44],
        [-26, -42],
        [26, -44],
        [-14, -27.5],
        [14, -27.5],
      ] as const
    ).forEach(([x, z]) => wp(x, z));
  }

  resetItems() {
    this.items.forEach((it) => {
      it.got = false;
      it.group.visible = true;
    });
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
      if (this.blackout > 0) v *= 0.02;
      p.v = v;
      _c.setRGB(0.8 * v, 0.9 * v, 0.72 * v);
      this.panelMesh.setColorAt(i, _c);
    }
    this.panelMesh.instanceColor!.needsUpdate = true;
    const best: [number, number][] = [];
    for (let i = 0; i < ps.length; i++) {
      const d = (ps[i].x - px) ** 2 + (ps[i].z - pz) ** 2;
      if (best.length < 6) {
        best.push([d, i]);
        best.sort((a, b) => a[0] - b[0]);
      } else if (d < best[5][0]) {
        best[5] = [d, i];
        best.sort((a, b) => a[0] - b[0]);
      }
    }
    for (let i = 0; i < this.pool.length; i++) {
      const p = ps[best[i][1]];
      this.pool[i].position.set(p.x, CEIL - 0.4, p.z);
      this.pool[i].intensity = p.v * 2.0 * LIGHT;
    }
  }

  tick(dt: number, t: number) {
    this.items.forEach((it) => {
      if (it.got) return;
      it.t += dt;
      it.group.position.y = it.baseY + Math.sin(it.t * 1.6) * 0.012;
      (it.sp.material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(it.t * 2.5) * 0.18;
      it.beam.material.opacity = 0.17 + Math.sin(it.t * 1.7) * 0.05;
    });
    const d = this.door;
    if (d) {
      if (d.open && d.t < 1) d.t = Math.min(1, d.t + dt / 1.3);
      if (!d.open && d.t > 0) d.t = 0;
      d.hinge.rotation.y = -d.t * 1.95;
    }
    this.freezerLights.forEach((l, i) => (l.intensity = (0.6 + Math.sin(t * 7 + i) * 0.05 * (Math.random() < 0.02 ? 6 : 1)) * LIGHT));
    if (this.vendLight) this.vendLight.intensity = (0.7 + (Math.random() < 0.03 ? -0.5 : 0)) * LIGHT;
  }

  openDoor() {
    if (!this.door || this.door.open) return;
    this.door.open = true;
    const i = this.boxes.findIndex((b) => b.kind === "door");
    if (i >= 0) this.boxes.splice(i, 1);
    this.exitSignMesh.material.map = this.exitTex![1];
    this.exitSignMesh.material.needsUpdate = true;
    this.exitLight.color.setHex(0x30ff50);
    if (this.payLamp) this.payLamp.material.color.setHex(0x333333);
  }

  closeDoor() {
    if (this.door) {
      this.door.open = false;
      this.door.t = 0;
      this.door.hinge.rotation.y = 0;
    }
    if (!this.boxes.some((b) => b.kind === "door")) this.boxes.push({ ...this.exitBlock, kind: "door" });
    this.exitSignMesh.material.map = this.exitTex![0];
    this.exitSignMesh.material.needsUpdate = true;
    this.exitLight.color.setHex(0xff2020);
    if (this.payLamp) this.payLamp.material.color.setHex(0xffffff);
  }

  /* ---------------- navigation grid ---------------- */
  private finalizeNav() {
    this.blocked = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++)
      for (let i = 0; i < GW; i++) {
        const cx = X0 + (i + 0.5) * CS;
        const cz = Z0 + (j + 0.5) * CS;
        let b = 0;
        if (cx < -XI + 0.8 || cx > XI - 0.8 || cz < -ZI + 0.8 || cz > ZI - 0.8) b = 1;
        if (!b)
          for (const box of this.boxes) {
            if (box.kind === "door") continue;
            if (cx > box.x0 - 0.55 && cx < box.x1 + 0.55 && cz > box.z0 - 0.55 && cz < box.z1 + 0.55) {
              b = 1;
              break;
            }
          }
        this.blocked[j * GW + i] = b;
      }
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
  /** Breadth-first distance field to (tx, tz) over the navigation grid. */
  buildField(tx: number, tz: number) {
    if (!this.dist || !this.queue) {
      this.dist = new Int16Array(GW * GH);
      this.queue = new Int32Array(GW * GH);
    }
    const dist = this.dist;
    const queue = this.queue;
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
  nextStep(x: number, z: number): Vec2 | null {
    const dist = this.dist;
    if (!dist) return null;
    const [ci, cj] = this.toCell(x, z);
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
  randomFree(nx?: number, nz?: number, radius = 10): Vec2 {
    for (let k = 0; k < 120; k++) {
      let x: number;
      let z: number;
      if (nx !== undefined && nz !== undefined) {
        x = nx + (Math.random() - 0.5) * 2 * radius;
        z = nz + (Math.random() - 0.5) * 2 * radius;
      } else {
        x = -XI + 2 + Math.random() * (2 * XI - 4);
        z = -ZI + 2 + Math.random() * (2 * ZI - 4);
      }
      const [i, j] = this.toCell(x, z);
      if (!this.blocked[j * GW + i]) return this.cellCenter(i, j);
    }
    return [0, 10];
  }

  dispose() {
    this.envTexture?.dispose();
    this.exitTex?.forEach((t) => t.dispose());
    this.cartFrameGeo?.dispose();
    this.cartBasketGeo?.dispose();
    this.gridMat?.dispose();
    this.metal.dispose();
  }
}
