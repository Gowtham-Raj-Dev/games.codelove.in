/**
 * The level grid: one cell per world unit, cell (x, z) centred on world (x, z). Pure logic — no
 * three.js — so the same code answers "can I walk here", "can the guard see me", "how bright is
 * it" and "how do I get there".
 */

export const VOID = 0;
export const FLOOR = 1;
export const WALL = 2;

export interface Vec2 {
  x: number;
  z: number;
}

/** Small binary heap keyed by a float array (A* open set). */
class Heap {
  private items: number[] = [];
  constructor(private readonly score: Float32Array) {}
  get size() {
    return this.items.length;
  }
  clear() {
    this.items.length = 0;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[n]]) break;
      [a[p], a[n]] = [a[n], a[p]];
      n = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n], a[m]];
        n = m;
      }
    }
    return top;
  }
}

export class Grid {
  readonly kind: Uint8Array;
  /** Blocks movement. */
  readonly solid: Uint8Array;
  /** Blocks sight. */
  readonly opaque: Uint8Array;
  /** Blocks only the thief (pressure plates for the bot, the exit before the gem…). */
  readonly avoid: Uint8Array;
  /** 0..1 brightness per cell (torches, moonlight). */
  readonly light: Float32Array;
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly from: Int32Array;
  private readonly closed: Uint8Array;
  private readonly heap: Heap;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    const n = w * h;
    this.kind = new Uint8Array(n);
    this.solid = new Uint8Array(n);
    this.opaque = new Uint8Array(n);
    this.avoid = new Uint8Array(n);
    this.light = new Float32Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.from = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.heap = new Heap(this.f);
  }

  idx(x: number, z: number) {
    return z * this.w + x;
  }

  inside(x: number, z: number) {
    return x >= 0 && z >= 0 && x < this.w && z < this.h;
  }

  isSolid(x: number, z: number) {
    return !this.inside(x, z) || this.solid[this.idx(x, z)] === 1;
  }

  isOpaque(x: number, z: number) {
    return !this.inside(x, z) || this.opaque[this.idx(x, z)] === 1;
  }

  walkable(x: number, z: number, thief = false) {
    if (!this.inside(x, z)) return false;
    const i = this.idx(x, z);
    return this.solid[i] === 0 && this.kind[i] === FLOOR && (!thief || this.avoid[i] === 0);
  }

  /** Bilinear brightness at a world point. */
  lightAt(x: number, z: number) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fz = z - z0;
    const at = (cx: number, cz: number) => (this.inside(cx, cz) ? this.light[this.idx(cx, cz)] : 0);
    const a = at(x0, z0) * (1 - fx) + at(x0 + 1, z0) * fx;
    const b = at(x0, z0 + 1) * (1 - fx) + at(x0 + 1, z0 + 1) * fx;
    return a * (1 - fz) + b * fz;
  }

  /**
   * Distance along a unit direction to the first opaque cell (cells centred on integers), capped
   * at maxD. The start cell never blocks (cameras sit on walls).
   */
  ray(ox: number, oz: number, dx: number, dz: number, maxD: number) {
    const u = ox + 0.5;
    const v = oz + 0.5;
    let cx = Math.floor(u);
    let cz = Math.floor(v);
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx > 0 ? (cx + 1 - u) * tdx : dx < 0 ? (u - cx) * tdx : Infinity;
    let tmz = dz > 0 ? (cz + 1 - v) * tdz : dz < 0 ? (v - cz) * tdz : Infinity;
    for (let guard = 0; guard < 256; guard++) {
      let t: number;
      if (tmx < tmz) {
        cx += stepX;
        t = tmx;
        tmx += tdx;
      } else {
        cz += stepZ;
        t = tmz;
        tmz += tdz;
      }
      if (t >= maxD) return maxD;
      if (this.isOpaque(cx, cz)) return t;
    }
    return maxD;
  }

  /** Clear line of sight between two points. */
  los(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax;
    const dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return true;
    return this.ray(ax, az, dx / d, dz / d, d) >= d - 1e-3;
  }

  /** Pushes a circle out of solid cells (in place). Returns true when it touched something. */
  collide(p: Vec2, r: number, thief = false) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = Math.round(p.x - r - 0.5);
      const x1 = Math.round(p.x + r + 0.5);
      const z0 = Math.round(p.z - r - 0.5);
      const z1 = Math.round(p.z + r + 0.5);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (!this.blocks(cx, cz, thief)) continue;
          const nx = Math.max(cx - 0.5, Math.min(p.x, cx + 0.5));
          const nz = Math.max(cz - 0.5, Math.min(p.z, cz + 0.5));
          let dx = p.x - nx;
          let dz = p.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          hit = true;
          if (d2 < 1e-8) {
            // Centre inside the cell: push out along the shallowest axis.
            const ox = p.x - cx;
            const oz = p.z - cz;
            if (Math.abs(ox) > Math.abs(oz)) p.x = cx + Math.sign(ox || 1) * (0.5 + r);
            else p.z = cz + Math.sign(oz || 1) * (0.5 + r);
            continue;
          }
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          p.x = nx + dx * r;
          p.z = nz + dz * r;
        }
      }
    }
    return hit;
  }

  private blocks(cx: number, cz: number, thief: boolean) {
    if (!this.inside(cx, cz)) return true;
    const i = this.idx(cx, cz);
    return this.solid[i] === 1 || this.kind[i] !== FLOOR || (thief && this.avoid[i] === 1);
  }

  /** Whether a circle of radius r can slide straight from a to b. */
  clearLine(ax: number, az: number, bx: number, bz: number, r: number, thief = false) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.2));
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n;
      const z = az + ((bz - az) * s) / n;
      const x0 = Math.round(x - r);
      const x1 = Math.round(x + r);
      const z0 = Math.round(z - r);
      const z1 = Math.round(z + r);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (!this.blocks(cx, cz, thief)) continue;
          const nx = Math.max(cx - 0.5, Math.min(x, cx + 0.5));
          const nz = Math.max(cz - 0.5, Math.min(z, cz + 0.5));
          if ((x - nx) ** 2 + (z - nz) ** 2 < r * r - 1e-6) return false;
        }
      }
    }
    return true;
  }

  /** Nearest walkable cell to a world point (spiral search). */
  nearestWalkable(x: number, z: number, thief = false): Vec2 | null {
    const cx = Math.round(x);
    const cz = Math.round(z);
    if (this.walkable(cx, cz, thief)) return { x: cx, z: cz };
    for (let r = 1; r < 8; r++) {
      let best: Vec2 | null = null;
      let bd = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!this.walkable(cx + dx, cz + dz, thief)) continue;
          const d = (cx + dx - x) ** 2 + (cz + dz - z) ** 2;
          if (d < bd) {
            bd = d;
            best = { x: cx + dx, z: cz + dz };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A* over walkable cells (8 directions, no corner cutting), then string-pulled so paths run
   * straight where they can. Returns world points excluding the start, or null.
   */
  path(sx: number, sz: number, tx: number, tz: number, { thief = false, radius = 0.3, extraCost }: { thief?: boolean; radius?: number; extraCost?: (x: number, z: number) => number } = {}): Vec2[] | null {
    const start = this.nearestWalkable(sx, sz, thief);
    const goal = this.nearestWalkable(tx, tz, thief);
    if (!start || !goal) return null;
    const { w, g, f, from, closed, heap } = this;
    g.fill(Infinity);
    closed.fill(0);
    heap.clear();
    const si = this.idx(start.x, start.z);
    const gi = this.idx(goal.x, goal.z);
    const hFn = (x: number, z: number) => {
      const dx = Math.abs(x - goal.x);
      const dz = Math.abs(z - goal.z);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    g[si] = 0;
    f[si] = hFn(start.x, start.z);
    from[si] = -1;
    heap.push(si);
    let found = false;
    while (heap.size) {
      const i = heap.pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === gi) {
        found = true;
        break;
      }
      const x = i % w;
      const z = (i - x) / w;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx;
          const nz = z + dz;
          if (!this.walkable(nx, nz, thief)) continue;
          if (dx && dz && (!this.walkable(x + dx, z, thief) || !this.walkable(x, z + dz, thief))) continue;
          const ni = this.idx(nx, nz);
          if (closed[ni]) continue;
          const cost = g[i] + (dx && dz ? Math.SQRT2 : 1) + (extraCost ? extraCost(nx, nz) : 0);
          if (cost < g[ni]) {
            g[ni] = cost;
            f[ni] = cost + hFn(nx, nz);
            from[ni] = i;
            heap.push(ni);
          }
        }
      }
    }
    if (!found) return null;
    const cells: Vec2[] = [];
    for (let i = gi; i !== -1; i = from[i]) {
      const x = i % w;
      cells.push({ x, z: (i - x) / w });
    }
    cells.reverse();
    // String-pull from the actual start point.
    const out: Vec2[] = [];
    let ax = sx;
    let az = sz;
    let k = 0;
    while (k < cells.length - 1) {
      let j = cells.length - 1;
      while (j > k + 1 && !this.clearLine(ax, az, cells[j].x, cells[j].z, radius, thief)) j--;
      out.push(cells[j]);
      ax = cells[j].x;
      az = cells[j].z;
      k = j;
    }
    if (!out.length) out.push(cells[cells.length - 1]);
    // Land exactly on the requested point when it is reachable from the last cell.
    const last = out[out.length - 1];
    if ((last.x !== tx || last.z !== tz) && Math.round(tx) === goal.x && Math.round(tz) === goal.z) out.push({ x: tx, z: tz });
    return out;
  }
}

// --- Angles ----------------------------------------------------------------------------------------

/** Yaw convention: 0 faces +z (south, towards the camera), π/2 faces +x (east). */
export const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz);

export function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnTowards(from: number, to: number, rate: number, dt: number) {
  const d = angleDiff(from, to);
  const step = rate * dt;
  return from + (Math.abs(d) <= step ? d : Math.sign(d) * step);
}

export const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));

/** Deterministic random numbers (mulberry32) so a heist plays the same every time. */
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
