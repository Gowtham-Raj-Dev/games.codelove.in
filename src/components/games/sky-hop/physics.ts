/**
 * Sky Hop's collision world: axis-aligned boxes (islands, crates, moving platforms…) and ramps,
 * queried by a kinematic character controller. Plain numbers, no three.js, no allocation per query.
 */

export interface Ramp {
  /** Axis the surface rises along. */
  axis: "x" | "z";
  /** Coordinate on that axis where the surface is at y0, and where it reaches y1. */
  c0: number;
  c1: number;
  y0: number;
  y1: number;
}

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Disabled boxes are ignored (broken crates, fallen bricks). */
  enabled: boolean;
  /** Only stops things falling onto it from above (planks, moving platforms). */
  oneWay: boolean;
  /** Low-friction surface (snow and ice). */
  slippery: boolean;
  /** Blocks the camera (large static pieces). */
  camera: boolean;
  /** Ramp surface: the top follows the ramp instead of maxY; never blocks sideways. */
  ramp: Ramp | null;
  /** How far the box moved this frame (moving platforms carry what stands on them). */
  dx: number;
  dy: number;
  dz: number;
  /** What the box belongs to (crate, spring, brick…), for gameplay reactions. */
  tag: unknown;
}

export function makeBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, opts: Partial<Box> = {}): Box {
  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    enabled: true,
    oneWay: false,
    slippery: false,
    camera: false,
    ramp: null,
    dx: 0,
    dy: 0,
    dz: 0,
    tag: null,
    ...opts,
  };
}

/** Moves a box to a new centre, recording the delta so riders follow it. */
export function moveBoxTo(b: Box, cx: number, cy: number, cz: number) {
  const hx = (b.maxX - b.minX) / 2;
  const hy = (b.maxY - b.minY) / 2;
  const hz = (b.maxZ - b.minZ) / 2;
  const ox = (b.maxX + b.minX) / 2;
  const oy = (b.maxY + b.minY) / 2;
  const oz = (b.maxZ + b.minZ) / 2;
  b.dx = cx - ox;
  b.dy = cy - oy;
  b.dz = cz - oz;
  b.minX = cx - hx;
  b.maxX = cx + hx;
  b.minY = cy - hy;
  b.maxY = cy + hy;
  b.minZ = cz - hz;
  b.maxZ = cz + hz;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Height of a box's walkable top at (x, z). */
export function topAt(b: Box, x: number, z: number) {
  const r = b.ramp;
  if (!r) return b.maxY;
  const c = r.axis === "x" ? x : z;
  const t = clamp((c - r.c0) / (r.c1 - r.c0), 0, 1);
  return r.y0 + (r.y1 - r.y0) * t;
}

/** Squared distance from (x, z) to the box's footprint. */
function dist2(b: Box, x: number, z: number) {
  const dx = x - clamp(x, b.minX, b.maxX);
  const dz = z - clamp(z, b.minZ, b.maxZ);
  return dx * dx + dz * dz;
}

export interface Hit {
  y: number;
  box: Box | null;
}

export class World {
  boxes: Box[] = [];

  add(b: Box) {
    this.boxes.push(b);
    return b;
  }

  clear() {
    this.boxes = [];
  }

  /**
   * Highest walkable top under a circular footprint with a top between `low` and `high`. One-way
   * boxes count only if the feet were above them before the move (`prevFeet`).
   */
  ground(x: number, z: number, r: number, low: number, high: number, prevFeet: number, out: Hit): boolean {
    let best = -Infinity;
    let box: Box | null = null;
    const r2 = r * r;
    for (const b of this.boxes) {
      if (!b.enabled) continue;
      let top: number;
      if (b.ramp) {
        // Ramps use the centre point so you don't hover beside them.
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        top = topAt(b, x, z);
      } else {
        if (dist2(b, x, z) > r2) continue;
        top = b.maxY;
      }
      if (top < low || top > high || top <= best) continue;
      if (b.oneWay && prevFeet < top - 0.12) continue;
      best = top;
      box = b;
    }
    if (!box) return false;
    out.y = best;
    out.box = box;
    return true;
  }

  /** Lowest ceiling between `from` and `to` (head heights) above a footprint. */
  ceiling(x: number, z: number, r: number, from: number, to: number, out: Hit): boolean {
    let best = Infinity;
    let box: Box | null = null;
    const r2 = r * r;
    for (const b of this.boxes) {
      if (!b.enabled || b.oneWay || b.ramp) continue;
      if (b.minY < from - 0.05 || b.minY > to || b.minY >= best) continue;
      if (dist2(b, x, z) > r2) continue;
      best = b.minY;
      box = b;
    }
    if (!box) return false;
    out.y = best;
    out.box = box;
    return true;
  }

  /**
   * Pushes a vertical cylinder (feet y, height h, radius r) out of solid boxes on the x/z plane.
   * Boxes whose top is within `step` of the feet are left alone (the caller steps up onto them).
   * Writes the corrected position into `pos` and the summed push normal into `normal`.
   */
  pushOut(pos: { x: number; y: number; z: number }, r: number, h: number, step: number, normal: { x: number; z: number }) {
    normal.x = 0;
    normal.z = 0;
    let hit: Box | null = null;
    for (let pass = 0; pass < 2; pass++) {
      for (const b of this.boxes) {
        if (!b.enabled || b.oneWay || b.ramp) continue;
        if (b.maxY <= pos.y + step || b.minY >= pos.y + h) continue;
        const cx = clamp(pos.x, b.minX, b.maxX);
        const cz = clamp(pos.z, b.minZ, b.maxZ);
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let push: number;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          push = r - d;
        } else {
          // Centre inside the box: leave by the nearest side.
          const l = pos.x - b.minX;
          const rr = b.maxX - pos.x;
          const n = pos.z - b.minZ;
          const f = b.maxZ - pos.z;
          const m = Math.min(l, rr, n, f);
          dx = m === l ? -1 : m === rr ? 1 : 0;
          dz = m === n ? -1 : m === f ? 1 : 0;
          if (dx && dz) dz = 0;
          push = m + r;
        }
        pos.x += dx * push;
        pos.z += dz * push;
        normal.x += dx;
        normal.z += dz;
        hit = b;
      }
    }
    return hit;
  }

  /** Distance along a ray to the first camera-blocking box (Infinity if none). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
    let best = max;
    for (const b of this.boxes) {
      if (!b.enabled || !b.camera) continue;
      let t0 = 0;
      let t1 = best;
      // Slab test per axis.
      const slab = (o: number, d: number, mn: number, mx: number) => {
        if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
        let a = (mn - o) / d;
        let c = (mx - o) / d;
        if (a > c) [a, c] = [c, a];
        if (a > t0) t0 = a;
        if (c < t1) t1 = c;
        return t0 <= t1;
      };
      if (!slab(ox, dx, b.minX, b.maxX) || !slab(oy, dy, b.minY, b.maxY) || !slab(oz, dz, b.minZ, b.maxZ)) continue;
      if (t0 < best) best = t0;
    }
    return best;
  }
}
