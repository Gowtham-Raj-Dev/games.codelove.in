import * as THREE from "three";

/**
 * The rail every stage is flown along: a smooth, endless curve made of a few sine waves, heading
 * down -Z. `s` is the distance along Z. A frame at `s` gives the rail-local axes: right, up and
 * forward (no roll), so "rail coordinates" (s, x, y) map to world space as
 * point(s) + right * x + up * y.
 */

export interface Wave {
  amp: number;
  len: number;
  phase: number;
}

export interface RailShape {
  x: Wave[];
  y: Wave[];
}

export interface Frame {
  pos: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  fwd: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Sideways curvature (for camera banking). */
  bend: number;
}

const TAU = Math.PI * 2;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const basis = new THREE.Matrix4();
const back = new THREE.Vector3();

export const newFrame = (): Frame => ({
  pos: new THREE.Vector3(),
  right: new THREE.Vector3(1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
  fwd: new THREE.Vector3(0, 0, -1),
  quat: new THREE.Quaternion(),
  bend: 0,
});

export class Rail {
  constructor(private readonly shape: RailShape) {}

  private sum(waves: Wave[], s: number, d: 0 | 1 | 2) {
    let v = 0;
    for (const w of waves) {
      const k = TAU / w.len;
      const a = k * s + w.phase;
      if (d === 0) v += w.amp * Math.sin(a);
      else if (d === 1) v += w.amp * k * Math.cos(a);
      else v -= w.amp * k * k * Math.sin(a);
    }
    return v;
  }

  point(s: number, out: THREE.Vector3) {
    return out.set(this.sum(this.shape.x, s, 0), this.sum(this.shape.y, s, 0), -s);
  }

  /** How much world distance one unit of s covers (to keep the flight speed constant). */
  stretch(s: number) {
    const dx = this.sum(this.shape.x, s, 1);
    const dy = this.sum(this.shape.y, s, 1);
    return Math.sqrt(1 + dx * dx + dy * dy);
  }

  frame(s: number, f: Frame) {
    this.point(s, f.pos);
    f.fwd.set(this.sum(this.shape.x, s, 1), this.sum(this.shape.y, s, 1), -1).normalize();
    f.right.crossVectors(f.fwd, WORLD_UP).normalize();
    f.up.crossVectors(f.right, f.fwd).normalize();
    back.copy(f.fwd).negate();
    basis.makeBasis(f.right, f.up, back);
    f.quat.setFromRotationMatrix(basis);
    f.bend = this.sum(this.shape.x, s, 2);
    return f;
  }

  /** World position of rail coordinates (s, x, y). */
  local(s: number, x: number, y: number, out: THREE.Vector3, f: Frame) {
    this.frame(s, f);
    return out.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y);
  }
}

// --- Small helpers --------------------------------------------------------------------------------

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Deterministic random numbers, so a stage is laid out the same way every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + next() * (hi - lo),
    int: (lo: number, hi: number) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
  };
}

export type Rng = ReturnType<typeof rng>;

/** Hash of an integer to 0..1 (stateless randomness for scenery slots). */
export function hash(n: number, salt = 0) {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
