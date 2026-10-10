import * as THREE from "three";

/**
 * The island itself — a seeded heightfield (the same island every game, so saves stay valid):
 * a ring of beach, grassy lowland and forest, a rocky hill in the north-east, a freshwater pond in
 * the west and a sandy cove in the south where the wreck lies. Rendered as one flat-shaded,
 * vertex-coloured mesh; also baked into a small texture so the sea shader knows where it's shallow.
 */

export const SIZE = 168;
const RES = 168;
const CELL = SIZE / RES;
const HALF = SIZE / 2;

/** Seeded RNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D value noise with a seeded lattice. */
class Noise {
  private readonly perm = new Uint8Array(512);
  private readonly vals = new Float32Array(256);
  constructor(seed: number) {
    const r = rng(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) this.vals[i] = r() * 2 - 1;
  }
  private v(x: number, z: number) {
    return this.vals[this.perm[(this.perm[x & 255] + z) & 255]];
  }
  get(x: number, z: number) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fz = z - zi;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = this.v(xi, zi);
    const b = this.v(xi + 1, zi);
    const c = this.v(xi, zi + 1);
    const d = this.v(xi + 1, zi + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }
  fbm(x: number, z: number, octaves = 4) {
    let s = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < octaves; i++) {
      s += amp * this.get(x * f, z * f);
      amp *= 0.5;
      f *= 2.03;
    }
    return s;
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export type Biome = "deep" | "shallow" | "beach" | "grass" | "forest" | "rock" | "pond";

export const HILL = { x: 17, z: -15, r: 17, h: 7.5 };
export const POND = { x: -19, z: 4, r: 6.2, level: 0 };
/** The wreck's cove (south) and the camp clearing just inland. */
export const COVE = { x: 4, z: 0 };
export const CAMP = { x: 0, z: 0 };

const R0 = 50;

export class Island {
  readonly heights = new Float32Array((RES + 1) * (RES + 1));
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  readonly heightTexture: THREE.DataTexture;
  private readonly noise = new Noise(7);
  private readonly detail = new Noise(23);
  private readonly phases: number[];

  constructor() {
    const r = rng(1337);
    this.phases = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
    // The cove and camp spots: on the south beach, and a little inland from it.
    const south = this.coast(Math.PI / 2);
    COVE.x = 5;
    COVE.z = south - 1.5;
    CAMP.x = -2;
    CAMP.z = south - 15;
    // Pond level: just below the ground where it sits.
    POND.level = this.raw(POND.x, POND.z, false) - 0.55;
    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) this.heights[j * (RES + 1) + i] = this.raw(i * CELL - HALF, j * CELL - HALF, true);
    }
    this.mesh = this.buildMesh();
    this.heightTexture = this.buildTexture();
  }

  /** Distance from the centre to the shoreline in direction `angle` (atan2(z, x)). */
  coast(angle: number) {
    const [a, b, c, d] = this.phases;
    let r = 1 + 0.09 * Math.sin(2 * angle + a) + 0.06 * Math.sin(3 * angle + b) + 0.04 * Math.sin(5 * angle + c) + 0.025 * Math.sin(8 * angle + d);
    // A wide sandy cove bulging south, where the wreck lies.
    const toSouth = Math.cos(angle - Math.PI / 2);
    r += 0.07 * Math.pow(Math.max(0, toSouth), 6);
    return R0 * r;
  }

  private raw(x: number, z: number, pond: boolean) {
    const dist = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const d = dist / this.coast(angle) + this.noise.fbm(x * 0.05, z * 0.05, 3) * 0.035;
    let h: number;
    if (d >= 1) h = -Math.min(7.5, (d - 1) * R0 * 0.22 + (d - 1) * (d - 1) * 40);
    else if (d >= 0.84) h = ((1 - d) / 0.16) * 0.75;
    else {
      const inland = smooth(0.84, 0.55, d);
      h = 0.75 + (0.84 - d) * 3.2 + this.noise.fbm(x * 0.045 + 3, z * 0.045 - 7, 4) * 1.6 * inland;
    }
    // The rocky hill.
    const hd = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
    if (hd < 1) {
      const t = 1 - hd * hd;
      h += HILL.h * t * t * (0.85 + 0.3 * this.detail.fbm(x * 0.12, z * 0.12, 3));
    }
    if (pond) {
      const pd = Math.hypot(x - POND.x, z - POND.z);
      const R = POND.r;
      if (pd < R * 1.6) {
        const bowl = POND.level + 0.35 - 1.6 * Math.max(0, 1 - (pd / R) * (pd / R));
        const rim = POND.level + 0.3 + Math.max(0, pd - R) * 0.12;
        const s = smooth(R * 1.6, R * 0.9, pd);
        h = h * (1 - s) + Math.min(h, pd < R ? bowl : rim) * s;
      }
    }
    // A gentle, flat clearing for the first camp.
    const cd = Math.hypot(x - CAMP.x, z - CAMP.z);
    if (cd < 12) {
      const target = 0.95;
      const s = smooth(12, 5, cd) * 0.7;
      h = h * (1 - s) + target * s;
    }
    return h;
  }

  /** Exact ground height (follows the mesh's triangles). */
  height(x: number, z: number) {
    const gx = Math.min(RES - 1e-4, Math.max(0, (x + HALF) / CELL));
    const gz = Math.min(RES - 1e-4, Math.max(0, (z + HALF) / CELL));
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const W = RES + 1;
    const ha = this.heights[j * W + i];
    const hb = this.heights[j * W + i + 1];
    const hd = this.heights[(j + 1) * W + i];
    if (fx + fz <= 1) return ha + (hb - ha) * fx + (hd - ha) * fz;
    const hc = this.heights[(j + 1) * W + i + 1];
    return hc + (hd - hc) * (1 - fx) + (hb - hc) * (1 - fz);
  }

  /** Steepness 0 (flat) .. 1+ at (x, z). */
  slope(x: number, z: number) {
    const e = 0.6;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  inPond(x: number, z: number, margin = 0) {
    return Math.hypot(x - POND.x, z - POND.z) < POND.r + margin && this.height(x, z) < POND.level + 0.05 + margin * 0.1;
  }

  /** Water surface height here (sea or pond), or -Infinity on dry land. */
  waterLevel(x: number, z: number) {
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1) return POND.level;
    return 0;
  }

  biome(x: number, z: number): Biome {
    const h = this.height(x, z);
    if (this.inPond(x, z)) return "pond";
    if (h < -1.2) return "deep";
    if (h < 0.05) return "shallow";
    if (h < 0.85 && Math.hypot(x, z) > 20) return "beach";
    const hd = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
    if (hd < 0.62 || this.slope(x, z) > 0.75) return "rock";
    return this.noise.fbm(x * 0.07 + 11, z * 0.07 + 5, 2) > -0.05 && Math.hypot(x, z) < 34 ? "forest" : "grass";
  }

  private buildMesh() {
    const W = RES + 1;
    const pos = new Float32Array(W * W * 3);
    const col = new Float32Array(W * W * 3);
    const c = new THREE.Color();
    const sand = new THREE.Color("#ecd6a0");
    const wetSand = new THREE.Color("#c8ad78");
    const seabed = new THREE.Color("#b49a68");
    const deep = new THREE.Color("#5f7d74");
    const grass = new THREE.Color("#86b552");
    const grassDry = new THREE.Color("#a7b866");
    const forest = new THREE.Color("#5d9443");
    const rock = new THREE.Color("#978b7a");
    const rockDark = new THREE.Color("#7a7064");
    const mud = new THREE.Color("#8d7a55");
    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const x = i * CELL - HALF;
        const z = j * CELL - HALF;
        const h = this.heights[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const n = this.detail.get(x * 0.35, z * 0.35) * 0.5 + 0.5;
        const pondD = Math.hypot(x - POND.x, z - POND.z);
        if (pondD < POND.r + 1.4 && h < POND.level + 0.5) c.copy(mud).lerp(wetSand, smooth(POND.r - 1, POND.r + 1.4, pondD) * 0.5);
        else if (h < -2) c.copy(seabed).lerp(deep, smooth(-2, -6, h));
        else if (h < 0.12) c.copy(wetSand).lerp(seabed, smooth(0.12, -1.5, h));
        else {
          const beachEdge = Math.hypot(x, z) > 20 ? smooth(0.85, 1.25, h) : 1;
          const lowland = this.biomeColor(x, z, h, grass, grassDry, forest, rock, rockDark, n);
          c.copy(sand).lerp(lowland, beachEdge);
        }
        // A little speckle so large areas don't look flat.
        const v = 0.94 + n * 0.1;
        col[k * 3] = c.r * v;
        col[k * 3 + 1] = c.g * v;
        col[k * 3 + 2] = c.b * v;
      }
    }
    const idx = new Uint32Array(RES * RES * 6);
    let o = 0;
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const a = j * W + i;
        const b = a + 1;
        const d = a + W;
        const cc = d + 1;
        idx[o++] = a;
        idx[o++] = d;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = d;
        idx[o++] = cc;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = "island";
    return mesh;
  }

  private biomeColor(x: number, z: number, h: number, grass: THREE.Color, dry: THREE.Color, forest: THREE.Color, rock: THREE.Color, rockDark: THREE.Color, n: number) {
    const out = new THREE.Color();
    const hd = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
    const forestAmt = smooth(-0.15, 0.1, this.noise.fbm(x * 0.07 + 11, z * 0.07 + 5, 2)) * smooth(38, 28, Math.hypot(x, z));
    out.copy(grass).lerp(dry, smooth(0.3, 0.8, n) * 0.35).lerp(forest, forestAmt * 0.85);
    const rocky = Math.max(smooth(0.78, 0.5, hd), smooth(0.55, 0.95, this.slopeAt(x, z)));
    if (rocky > 0) out.lerp(rock.clone().lerp(rockDark, n), rocky);
    // Grass thins out high on the hill.
    if (h > 5) out.lerp(rockDark, smooth(5, 8, h) * 0.5);
    return out;
  }

  private slopeAt(x: number, z: number) {
    const W = RES + 1;
    const i = Math.round((x + HALF) / CELL);
    const j = Math.round((z + HALF) / CELL);
    if (i <= 0 || j <= 0 || i >= RES || j >= RES) return 0;
    const dx = this.heights[j * W + i + 1] - this.heights[j * W + i - 1];
    const dz = this.heights[(j + 1) * W + i] - this.heights[(j - 1) * W + i];
    return Math.hypot(dx, dz) / (2 * CELL);
  }

  /** Ground height baked for the water shader: (h + 10) / 14 in the red channel over the whole map. */
  private buildTexture() {
    const N = 256;
    const data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * SIZE - HALF;
        const z = (j / (N - 1)) * SIZE - HALF;
        const h = this.height(x, z);
        const v = Math.round(Math.min(1, Math.max(0, (h + 10) / 14)) * 255);
        const k = (j * N + i) * 4;
        data[k] = v;
        data[k + 1] = v;
        data[k + 2] = v;
        data[k + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.heightTexture.dispose();
  }
}

export const TERRAIN_HALF = HALF;
