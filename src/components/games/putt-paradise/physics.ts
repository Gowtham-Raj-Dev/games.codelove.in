/**
 * Putt Paradise ball physics — a sphere rolling on the course pieces' own triangles, so ramps, bumps,
 * walls, tunnels and cups behave exactly like they look. No three.js here (the same code runs in the
 * game and in offline test bots).
 *
 * Fixed 1/600 s substeps keep the ball (3.5 cm radius) from moving more than a third of its radius
 * per step at full speed, so it can't tunnel through the 10 cm walls. Contacts are resolved deepest
 * first and re-measured, which keeps seams between tiles smooth. Rolling is modelled the classic way:
 * on a surface the slope pulls with 5/7 g (a rolling solid sphere) and a rolling resistance slows it.
 */

export const BALL_R = 0.035;
export const CUP_R = 0.0666;
export const GRAVITY = 9.81;
/** Launch speed of a full-power putt (m/s). */
export const MAX_PUTT = 8.2;

/** Putt speed for a power of 0..1: a curve, so short putts get fine control and full power still flies. */
export const puttSpeed = (power: number) => 0.15 + (MAX_PUTT - 0.15) * Math.pow(Math.min(1, Math.max(0, power)), 1.5);

const STEP = 1 / 600;
/** Rolling resistance: a constant part plus a little per m/s. */
const ROLL = 0.52;
const ROLL_K = 0.05;
const WALL_E = 0.62;
const FLOOR_E = 0.25;
/** Contacts within this distance of the surface count as "on the ground". */
const SUPPORT_EPS = 0.004;
const MAX_SPEED = 12;

/** Triangle kinds: ordinary course surface, or a smooth track (loop) that the ball follows at speed. */
export const KIND_COURSE = 0;
export const KIND_TRACK = 1;

/** Static triangles in a 3D spatial hash. */
export class CollisionMesh {
  readonly pos: Float64Array;
  readonly nrm: Float64Array;
  readonly kind: Uint8Array;
  /** Per-triangle bounds grown by the ball radius: min x, y, z, max x, y, z. */
  readonly box: Float64Array;
  readonly count: number;
  private readonly cells = new Map<number, number[]>();
  private readonly inv: number;

  /** `tris`: 9 numbers per triangle (a, b, c); `kinds`: one per triangle. */
  constructor(tris: ArrayLike<number>, kinds: ArrayLike<number>, cellSize = 0.25) {
    this.count = Math.floor(tris.length / 9);
    this.pos = Float64Array.from(tris);
    this.kind = Uint8Array.from(kinds);
    this.nrm = new Float64Array(this.count * 3);
    this.box = new Float64Array(this.count * 6);
    this.inv = 1 / cellSize;
    const pad = BALL_R + 0.02;
    const p = this.pos;
    for (let t = 0; t < this.count; t++) {
      const o = t * 9;
      const ux = p[o + 3] - p[o];
      const uy = p[o + 4] - p[o + 1];
      const uz = p[o + 5] - p[o + 2];
      const vx = p[o + 6] - p[o];
      const vy = p[o + 7] - p[o + 1];
      const vz = p[o + 8] - p[o + 2];
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      this.nrm[t * 3] = nx;
      this.nrm[t * 3 + 1] = ny;
      this.nrm[t * 3 + 2] = nz;
      const b = t * 6;
      const r = BALL_R + SUPPORT_EPS + 0.001;
      this.box[b] = Math.min(p[o], p[o + 3], p[o + 6]) - r;
      this.box[b + 1] = Math.min(p[o + 1], p[o + 4], p[o + 7]) - r;
      this.box[b + 2] = Math.min(p[o + 2], p[o + 5], p[o + 8]) - r;
      this.box[b + 3] = Math.max(p[o], p[o + 3], p[o + 6]) + r;
      this.box[b + 4] = Math.max(p[o + 1], p[o + 4], p[o + 7]) + r;
      this.box[b + 5] = Math.max(p[o + 2], p[o + 5], p[o + 8]) + r;
      const x0 = Math.floor((Math.min(p[o], p[o + 3], p[o + 6]) - pad) * this.inv);
      const x1 = Math.floor((Math.max(p[o], p[o + 3], p[o + 6]) + pad) * this.inv);
      const y0 = Math.floor((Math.min(p[o + 1], p[o + 4], p[o + 7]) - pad) * this.inv);
      const y1 = Math.floor((Math.max(p[o + 1], p[o + 4], p[o + 7]) + pad) * this.inv);
      const z0 = Math.floor((Math.min(p[o + 2], p[o + 5], p[o + 8]) - pad) * this.inv);
      const z1 = Math.floor((Math.max(p[o + 2], p[o + 5], p[o + 8]) + pad) * this.inv);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++)
          for (let z = z0; z <= z1; z++) {
            const key = cellKey(x, y, z);
            let list = this.cells.get(key);
            if (!list) this.cells.set(key, (list = []));
            list.push(t);
          }
    }
  }

  /** Triangles that may touch a ball centred at (x, y, z). */
  near(x: number, y: number, z: number) {
    return this.cells.get(cellKey(Math.floor(x * this.inv), Math.floor(y * this.inv), Math.floor(z * this.inv)));
  }
}

const cellKey = (x: number, y: number, z: number) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);

/** Something that spins around a fixed axis (windmill sails). Its triangles are given at angle 0. */
export class Rotor {
  readonly mesh: CollisionMesh;
  readonly hub: [number, number, number];
  readonly axis: [number, number, number];
  readonly omega: number;
  readonly reach: number;
  angle = 0;

  constructor(mesh: CollisionMesh, hub: [number, number, number], axis: [number, number, number], omega: number) {
    this.mesh = mesh;
    this.hub = hub;
    const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    this.axis = [axis[0] / l, axis[1] / l, axis[2] / l];
    this.omega = omega;
    let reach = 0;
    for (let i = 0; i < mesh.pos.length; i += 3) reach = Math.max(reach, Math.hypot(mesh.pos[i] - hub[0], mesh.pos[i + 1] - hub[1], mesh.pos[i + 2] - hub[2]));
    this.reach = reach;
  }
}

/** Rotates v around the unit axis k by an angle with the given cos / sin (Rodrigues). */
function rotate(out: number[], vx: number, vy: number, vz: number, k: readonly number[], c: number, s: number) {
  const kx = k[0];
  const ky = k[1];
  const kz = k[2];
  const dot = (kx * vx + ky * vy + kz * vz) * (1 - c);
  out[0] = vx * c + (ky * vz - kz * vy) * s + kx * dot;
  out[1] = vy * c + (kz * vx - kx * vz) * s + ky * dot;
  out[2] = vz * c + (kx * vy - ky * vx) * s + kz * dot;
}

/** Closest point on triangle t of `m` to p (Ericson, Real-Time Collision Detection 5.1.5). */
function closest(out: number[], m: CollisionMesh, t: number, px: number, py: number, pz: number) {
  const P = m.pos;
  const o = t * 9;
  const ax = P[o];
  const ay = P[o + 1];
  const az = P[o + 2];
  const abx = P[o + 3] - ax;
  const aby = P[o + 4] - ay;
  const abz = P[o + 5] - az;
  const acx = P[o + 6] - ax;
  const acy = P[o + 7] - ay;
  const acz = P[o + 8] - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) {
    out[0] = ax;
    out[1] = ay;
    out[2] = az;
    return;
  }
  const bpx = px - P[o + 3];
  const bpy = py - P[o + 4];
  const bpz = pz - P[o + 5];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    out[0] = P[o + 3];
    out[1] = P[o + 4];
    out[2] = P[o + 5];
    return;
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + abx * v;
    out[1] = ay + aby * v;
    out[2] = az + abz * v;
    return;
  }
  const cpx = px - P[o + 6];
  const cpy = py - P[o + 7];
  const cpz = pz - P[o + 8];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    out[0] = P[o + 6];
    out[1] = P[o + 7];
    out[2] = P[o + 8];
    return;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + acx * w;
    out[1] = ay + acy * w;
    out[2] = az + acz * w;
    return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    out[0] = P[o + 3] + (P[o + 6] - P[o + 3]) * w;
    out[1] = P[o + 4] + (P[o + 7] - P[o + 4]) * w;
    out[2] = P[o + 5] + (P[o + 8] - P[o + 5]) * w;
    return;
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den;
  const w = vc * den;
  out[0] = ax + abx * v + acx * w;
  out[1] = ay + aby * v + acy * w;
  out[2] = az + abz * v + acz * w;
}

export type BallState = "rest" | "rolling" | "off" | "holed";
export type HitKind = "wall" | "floor" | "blade";

export interface Hit {
  kind: HitKind;
  speed: number;
}

interface Contact {
  depth: number;
  nx: number;
  ny: number;
  nz: number;
  kind: number;
  /** Surface velocity at the contact (moving sails). */
  sx: number;
  sy: number;
  sz: number;
  rotor: boolean;
}

export class BallSim {
  px = 0;
  py = 0;
  pz = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  state: BallState = "rest";
  grounded = false;
  /** Ground normal while grounded, and whether that ground is smooth track. */
  onTrack = false;
  gx = 0;
  gy = 1;
  gz = 0;
  /** Seconds since the putt. */
  rollTime = 0;
  /** Sim clock (drives the rotors). */
  time = 0;
  /** Below this height the ball has left the course. */
  offY = 0.035;
  /** Collisions since the last read (for sounds). */
  hits: Hit[] = [];
  /** Distance rolled since the putt (for the ball's spin). */
  travelled = 0;

  private restTime = 0;
  private acc = 0;
  private readonly q = [0, 0, 0];
  private readonly r = [0, 0, 0];
  private readonly best: Contact = { depth: 0, nx: 0, ny: 0, nz: 0, kind: 0, sx: 0, sy: 0, sz: 0, rotor: false };

  mesh: CollisionMesh;
  cup: { x: number; y: number; z: number };
  rotors: Rotor[];

  constructor(mesh: CollisionMesh, cup: { x: number; y: number; z: number }, rotors: Rotor[] = []) {
    this.mesh = mesh;
    this.cup = cup;
    this.rotors = rotors;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }

  place(x: number, y: number, z: number) {
    this.px = x;
    this.py = y;
    this.pz = z;
    this.vx = this.vy = this.vz = 0;
    this.state = "rest";
    this.grounded = true;
    this.gx = 0;
    this.gy = 1;
    this.gz = 0;
    this.restTime = 0;
    this.hits.length = 0;
  }

  /** Strikes the ball horizontally along (dx, dz) at `speed` m/s. */
  putt(dx: number, dz: number, speed: number) {
    const l = Math.hypot(dx, dz) || 1;
    this.vx = (dx / l) * speed;
    this.vz = (dz / l) * speed;
    this.vy = 0;
    this.state = "rolling";
    this.rollTime = 0;
    this.restTime = 0;
    this.travelled = 0;
  }

  /** Advances the simulation by dt seconds (fixed substeps; the rotors always turn). */
  advance(dt: number) {
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.time += STEP;
      for (const r of this.rotors) r.angle = r.omega * this.time;
      if (this.state === "rolling" || this.state === "off") this.substep(STEP);
    }
  }

  private substep(h: number) {
    // Gravity: along a surface a rolling ball feels 5/7 of the slope.
    if (this.grounded) {
      const gn = -GRAVITY * this.gy;
      const tx = -gn * this.gx;
      const ty = -GRAVITY - gn * this.gy;
      const tz = -gn * this.gz;
      this.vx += ((5 / 7) * tx + gn * this.gx) * h;
      this.vy += ((5 / 7) * ty + gn * this.gy) * h;
      this.vz += ((5 / 7) * tz + gn * this.gz) * h;

      // Rolling resistance, along the surface only.
      const vn = this.vx * this.gx + this.vy * this.gy + this.vz * this.gz;
      let ux = this.vx - vn * this.gx;
      let uy = this.vy - vn * this.gy;
      let uz = this.vz - vn * this.gz;
      const s = Math.hypot(ux, uy, uz);
      const dec = (ROLL + ROLL_K * s) * (this.onTrack ? 0.35 : 1) * h;
      const k = s <= dec ? 0 : 1 - dec / s;
      ux *= k;
      uy *= k;
      uz *= k;
      this.vx = ux + vn * this.gx;
      this.vy = uy + vn * this.gy;
      this.vz = uz + vn * this.gz;

      // The cup's lip: a slow ball right at the edge tips in.
      const cx = this.cup.x - this.px;
      const cz = this.cup.z - this.pz;
      const dh = Math.hypot(cx, cz);
      if (dh < CUP_R + 0.015 && dh > 1e-4 && s < 0.7 && Math.abs(this.py - this.cup.y - BALL_R) < 0.03) {
        const pull = 1.6 * (1 - s / 0.7) * h;
        this.vx += (cx / dh) * pull;
        this.vz += (cz / dh) * pull;
      }
    } else {
      this.vy -= GRAVITY * h;
    }

    const sp = this.speed;
    if (sp > MAX_SPEED) {
      const k = MAX_SPEED / sp;
      this.vx *= k;
      this.vy *= k;
      this.vz *= k;
    }
    const ox = this.px;
    const oz = this.pz;
    this.px += this.vx * h;
    this.py += this.vy * h;
    this.pz += this.vz * h;

    // Resolve the deepest contact, re-measure, repeat.
    this.grounded = false;
    for (let it = 0; it < 4; it++) {
      if (!this.deepest()) break;
      const c = this.best;
      this.px += c.nx * c.depth;
      this.py += c.ny * c.depth;
      this.pz += c.nz * c.depth;
      this.respond(c);
    }
    this.findSupport();
    this.travelled += Math.hypot(this.px - ox, this.pz - oz);

    // Cup: the ball has dropped below the rim, over the hole, slowly enough to stay in.
    const dx = this.px - this.cup.x;
    const dz = this.pz - this.cup.z;
    const hs = Math.hypot(this.vx, this.vz);
    if (dx * dx + dz * dz < (CUP_R - 0.01) ** 2 && this.py < this.cup.y + BALL_R - 0.005 && this.py > this.cup.y - 0.05 && hs < 1.7) {
      this.state = "holed";
      return;
    }

    if (this.state === "rolling" && this.py < this.offY) this.state = "off";

    this.rollTime += h;
    if (this.state === "rolling") {
      if (this.grounded && this.speed < 0.04) {
        this.restTime += h;
        if (this.restTime > 0.2) this.stop();
      } else this.restTime = 0;
      if (this.rollTime > 40) this.stop();
    }
  }

  private stop() {
    this.vx = this.vy = this.vz = 0;
    this.state = "rest";
  }

  /** Finds the deepest penetrating contact into this.best; false if none. */
  private deepest() {
    const best = this.best;
    best.depth = 0;
    let found = false;
    const R2 = BALL_R * BALL_R;
    const q = this.q;
    const list = this.mesh.near(this.px, this.py, this.pz);
    if (list) {
      const m = this.mesh;
      const B = m.box;
      const px = this.px;
      const py = this.py;
      const pz = this.pz;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const b = t * 6;
        if (px < B[b] || py < B[b + 1] || pz < B[b + 2] || px > B[b + 3] || py > B[b + 4] || pz > B[b + 5]) continue;
        closest(q, m, t, px, py, pz);
        const dx = px - q[0];
        const dy = py - q[1];
        const dz = pz - q[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R2) continue;
        const d = Math.sqrt(d2);
        const depth = BALL_R - d;
        if (depth <= best.depth) continue;
        found = true;
        best.depth = depth;
        if (d > 1e-7) {
          best.nx = dx / d;
          best.ny = dy / d;
          best.nz = dz / d;
        } else {
          const s = m.nrm[t * 3] * this.vx + m.nrm[t * 3 + 1] * this.vy + m.nrm[t * 3 + 2] * this.vz > 0 ? -1 : 1;
          best.nx = m.nrm[t * 3] * s;
          best.ny = m.nrm[t * 3 + 1] * s;
          best.nz = m.nrm[t * 3 + 2] * s;
        }
        best.kind = m.kind[t];
        best.sx = best.sy = best.sz = 0;
        best.rotor = false;
      }
    }
    for (const r of this.rotors) {
      const hx = this.px - r.hub[0];
      const hy = this.py - r.hub[1];
      const hz = this.pz - r.hub[2];
      if (hx * hx + hy * hy + hz * hz > (r.reach + BALL_R) ** 2) continue;
      const c = Math.cos(r.angle);
      const s = Math.sin(r.angle);
      // Ball centre in the rotor's rest frame.
      rotate(this.r, hx, hy, hz, r.axis, c, -s);
      const lx = this.r[0] + r.hub[0];
      const ly = this.r[1] + r.hub[1];
      const lz = this.r[2] + r.hub[2];
      const rl = r.mesh.near(lx, ly, lz);
      if (!rl) continue;
      for (let i = 0; i < rl.length; i++) {
        closest(q, r.mesh, rl[i], lx, ly, lz);
        const dx = lx - q[0];
        const dy = ly - q[1];
        const dz = lz - q[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R2 || d2 < 1e-14) continue;
        const d = Math.sqrt(d2);
        const depth = BALL_R - d;
        if (depth <= best.depth) continue;
        found = true;
        best.depth = depth;
        rotate(this.r, dx / d, dy / d, dz / d, r.axis, c, s);
        best.nx = this.r[0];
        best.ny = this.r[1];
        best.nz = this.r[2];
        // Surface velocity ω × (contact − hub), in world space.
        rotate(this.r, q[0] - r.hub[0], q[1] - r.hub[1], q[2] - r.hub[2], r.axis, c, s);
        const w = r.omega;
        best.sx = w * (r.axis[1] * this.r[2] - r.axis[2] * this.r[1]);
        best.sy = w * (r.axis[2] * this.r[0] - r.axis[0] * this.r[2]);
        best.sz = w * (r.axis[0] * this.r[1] - r.axis[1] * this.r[0]);
        best.kind = KIND_COURSE;
        best.rotor = true;
      }
    }
    return found;
  }

  private respond(c: Contact) {
    let rx = this.vx - c.sx;
    let ry = this.vy - c.sy;
    let rz = this.vz - c.sz;
    const vn = rx * c.nx + ry * c.ny + rz * c.nz;
    if (vn >= 0) return;
    const impact = -vn;
    const speed = Math.hypot(rx, ry, rz);
    const ratio = impact / Math.max(speed, 1e-6);
    const track = c.kind === KIND_TRACK && !c.rotor;
    const floorish = !c.rotor && (c.ny > 0.45 || track);
    if (floorish && (impact < 0.05 || ratio < (track ? 0.6 : 0.36))) {
      // Rolling on, or over a gentle crease: follow the surface. Over a crease keep most of the speed.
      rx -= vn * c.nx;
      ry -= vn * c.ny;
      rz -= vn * c.nz;
      if (impact >= 0.05) {
        const s = Math.hypot(rx, ry, rz);
        if (s > 1e-6) {
          const k = Math.max(0, speed - (track ? 0.04 : 0.12) * impact) / s;
          rx *= k;
          ry *= k;
          rz *= k;
        }
      }
    } else if (floorish) {
      // A sharp edge or a real landing (off a jump): the carpet soaks it up, with a small bounce.
      const e = impact > 1 ? FLOOR_E : 0;
      rx -= (1 + e) * vn * c.nx;
      ry -= (1 + e) * vn * c.ny;
      rz -= (1 + e) * vn * c.nz;
      const vn2 = rx * c.nx + ry * c.ny + rz * c.nz;
      rx = (rx - vn2 * c.nx) * 0.94 + vn2 * c.nx;
      ry = (ry - vn2 * c.ny) * 0.94 + vn2 * c.ny;
      rz = (rz - vn2 * c.nz) * 0.94 + vn2 * c.nz;
      if (impact > 0.5) this.hits.push({ kind: "floor", speed: impact });
    } else {
      // Walls and sails: a lively rebound with a little scrub along the wall.
      const e = impact > 0.1 ? WALL_E : 0;
      rx -= (1 + e) * vn * c.nx;
      ry -= (1 + e) * vn * c.ny;
      rz -= (1 + e) * vn * c.nz;
      if (impact > 0.1) {
        const vn2 = rx * c.nx + ry * c.ny + rz * c.nz;
        rx = (rx - vn2 * c.nx) * 0.93 + vn2 * c.nx;
        ry = (ry - vn2 * c.ny) * 0.93 + vn2 * c.ny;
        rz = (rz - vn2 * c.nz) * 0.93 + vn2 * c.nz;
      }
      if (impact > 0.06) this.hits.push({ kind: c.rotor ? "blade" : "wall", speed: impact });
    }
    // The cup's rim knocks a fast ball up a little — never into orbit.
    if (ry + c.sy > 0.3 && Math.hypot(this.px - this.cup.x, this.pz - this.cup.z) < CUP_R + BALL_R) ry = 0.3 - c.sy;
    this.vx = rx + c.sx;
    this.vy = ry + c.sy;
    this.vz = rz + c.sz;
  }

  /** Is the ball resting on (or rolling along) a surface? Sets the ground normal. */
  private findSupport() {
    const list = this.mesh.near(this.px, this.py, this.pz);
    if (!list) return;
    const m = this.mesh;
    const q = this.q;
    const lim = (BALL_R + SUPPORT_EPS) ** 2;
    let bestD = lim;
    const B = m.box;
    const px = this.px;
    const py = this.py;
    const pz = this.pz;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const b = t * 6;
      if (px < B[b] || py < B[b + 1] || pz < B[b + 2] || px > B[b + 3] || py > B[b + 4] || pz > B[b + 5]) continue;
      closest(q, m, t, this.px, this.py, this.pz);
      const dx = this.px - q[0];
      const dy = this.py - q[1];
      const dz = this.pz - q[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= bestD || d2 < 1e-14) continue;
      const d = Math.sqrt(d2);
      const ny = dy / d;
      if (ny < 0.3 && m.kind[t] !== KIND_TRACK) continue;
      bestD = d2;
      this.grounded = true;
      this.onTrack = m.kind[t] === KIND_TRACK;
      this.gx = dx / d;
      this.gy = ny;
      this.gz = dz / d;
    }
  }
}
