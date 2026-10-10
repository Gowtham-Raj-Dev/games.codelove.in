/**
 * Putt Paradise — the nine holes, built from Minigolf Kit grid pieces (1 unit = one tile). Pure data,
 * no three.js: the engine and the physics both read it.
 *
 * Holes are laid out by a small "turtle": it walks the tile grid, dropping pieces in the direction
 * it is heading. Headings: 0 = north (-z), 1 = west (-x), 2 = south (+z), 3 = east (+x). A piece's
 * `rot` turns it by rot × 90° around +y (three.js `rotation.y`), which maps heading h → h + rot.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Placement {
  key: string;
  x: number;
  y: number;
  z: number;
  /** Quarter turns around +y. */
  rot: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** Decorative only (supports): no collision. */
  deco?: boolean;
}

export interface Island {
  /** Centre and size of the flat top the island must cover (hole-local). */
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface HoleDef {
  name: string;
  par: number;
  /** One line shown on the hole intro card. */
  tip: string;
  pieces: Placement[];
  tee: V3;
  /** Centre of the cup at rim level. */
  cup: V3;
  /** Centre line from tee to cup (tile centres), for the default aim and the camera. */
  path: V3[];
  islands: Island[];
  /** Where the hole sits in the world. */
  origin: { x: number; z: number };
  flag: "red" | "blue" | "green";
  /** The heading from the tee (yaw used by the camera at the start). */
  heading: number;
}

/** Floor height of a tile above its base. */
export const FLOOR = 0.063;
/** Top of the walls above a tile's base. */
export const WALL_TOP = 0.147;
/** The islands' grass, just under the course. */
export const ISLAND_TOP = -0.015;
export const WATER_Y = -0.42;

/** Loop scale (height and length; the width stays one tile). */
export const LOOP_SCALE = 0.5;
/** Windmill sails are scaled up so they sweep across the doorway. */
export const BLADE_SCALE = 1.42;
/** Sail speed (rad/s). */
export const BLADE_OMEGA = 1.3;

const DX = [0, -1, 0, 1];
const DZ = [-1, 0, 1, 0];

const RISE: Record<string, number> = { ramp: 0.5, "ramp-high": 0.5, "ramp-medium": 0.25, "ramp-low": 0.1, "ramp-large": 0.5 };
/** Pieces two tiles long. */
const LONG = new Set(["ramp-large"]);

class Builder {
  i: number;
  j: number;
  h: number;
  y = 0;
  pieces: Placement[] = [];
  path: V3[] = [];
  /** Cells that sit over open water (no island under them). */
  water = new Set<string>();
  cells = new Set<string>();
  overWater = false;
  /** Offset applied to everything placed from now on (to pull a section off the grid). */
  sx = 0;
  sz = 0;
  private shifts = new Map<string, [number, number]>();
  tee: V3 = { x: 0, y: 0, z: 0 };
  cup: V3 = { x: 0, y: 0, z: 0 };
  heading: number;

  constructor(i: number, j: number, h: number) {
    this.i = i;
    this.j = j;
    this.h = h;
    this.heading = h;
  }

  /** Places `key` on the current tile, turned `rel` quarter turns from the heading. */
  put(key: string, rel = 0, extra: Partial<Placement> = {}) {
    this.pieces.push({ key, x: this.i + this.sx, y: this.y, z: this.j + this.sz, rot: (this.h + rel) & 3, ...extra });
    this.mark(this.i, this.j);
    this.path.push({ x: this.i + this.sx, y: this.y + FLOOR, z: this.j + this.sz });
    return this;
  }

  mark(i: number, j: number) {
    const k = `${i},${j}`;
    this.cells.add(k);
    this.shifts.set(k, [this.sx, this.sz]);
    if (this.overWater) this.water.add(k);
    const x = i + this.sx;
    const z = j + this.sz;
    if (this.y > 0.01) {
      // Stilts under raised tiles.
      this.pieces.push({ key: this.y > 0.6 ? "minigolf-kit/supports" : "minigolf-kit/supports-low", x, y: 0, z, rot: 0, deco: true, sy: this.y / (this.y > 0.6 ? 1 : 0.5) });
    } else if (this.overWater) {
      this.pieces.push({ key: "minigolf-kit/supports", x, y: -1, z, rot: 0, deco: true });
    }
  }

  step(n = 1) {
    this.i += DX[this.h] * n;
    this.j += DZ[this.h] * n;
    return this;
  }

  /**
   * The tee: a closed-back tile, so a ball rolling back down a ramp can't drop off behind it.
   * `side` moves the ball off the centre line (to the left of the heading), so the straight line
   * isn't always the answer.
   */
  start(side = 0) {
    this.put("minigolf-kit/end");
    const rx = -DZ[this.h];
    const rz = DX[this.h];
    this.tee = { x: this.i + DX[this.h] * 0.08 - rx * side, y: this.y + FLOOR, z: this.j + DZ[this.h] * 0.08 - rz * side };
    return this.step();
  }

  /** Pieces that run straight through (symmetric front to back). */
  go(key = "straight", n = 1) {
    for (let k = 0; k < n; k++) this.put(`minigolf-kit/${key}`).step();
    return this;
  }

  /** Pieces whose "front" must face the incoming ball (windmill sails, kickers, split starts). */
  facing(key: string) {
    return this.put(`minigolf-kit/${key}`, 2).step();
  }

  left(key = "corner") {
    this.put(`minigolf-kit/${key}`, 1);
    this.h = (this.h + 1) & 3;
    return this.step();
  }

  right(key = "corner") {
    this.put(`minigolf-kit/${key}`, 2);
    this.h = (this.h + 3) & 3;
    return this.step();
  }

  up(key = "ramp") {
    this.ramp(key, 2);
    this.y += RISE[key];
    return this;
  }

  down(key = "ramp") {
    this.y -= RISE[key];
    return this.ramp(key, 0);
  }

  private ramp(key: string, rel: number) {
    if (!LONG.has(key)) return this.put(`minigolf-kit/${key}`, rel).step();
    const { i, j } = this;
    this.pieces.push({ key: `minigolf-kit/${key}`, x: i + DX[this.h] * 0.5, y: this.y, z: j + DZ[this.h] * 0.5, rot: (this.h + rel) & 3 });
    this.mark(i, j);
    this.path.push({ x: i, y: this.y + FLOOR, z: j });
    this.step();
    this.mark(this.i, this.j);
    this.path.push({ x: this.i, y: this.y + FLOOR, z: this.j });
    return this.step();
  }

  /** Leaves the tile empty (open water). */
  skip() {
    this.water.add(`${this.i},${this.j}`);
    return this.step();
  }

  hole(key = "hole-round") {
    this.put(`minigolf-kit/${key}`, key === "hole-open" ? 0 : 2);
    this.cup = { x: this.i + this.sx, y: this.y + FLOOR, z: this.j + this.sz };
    return this;
  }

  /** A piece at an explicit tile (for wide greens), not on the turtle's path. */
  at(key: string, i: number, j: number, rot: number) {
    this.pieces.push({ key: `minigolf-kit/${key}`, x: i, y: this.y, z: j, rot: rot & 3 });
    this.mark(i, j);
    return this;
  }

  islands(margin = 2): Island[] {
    // One island per group of touching dry tiles.
    const dry = [...this.cells].filter((c) => !this.water.has(c));
    const seen = new Set<string>();
    const out: Island[] = [];
    for (const c of dry) {
      if (seen.has(c)) continue;
      const stack = [c];
      seen.add(c);
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      while (stack.length) {
        const cur = stack.pop()!;
        const [i, j] = cur.split(",").map(Number);
        x0 = Math.min(x0, i);
        x1 = Math.max(x1, i);
        z0 = Math.min(z0, j);
        z1 = Math.max(z1, j);
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const n = `${i + di},${j + dj}`;
          if (!seen.has(n) && this.cells.has(n) && !this.water.has(n)) {
            seen.add(n);
            stack.push(n);
          }
        }
      }
      // Grow by the margin, but keep clear of water tiles (bridges, gaps).
      let ax = x0 - 0.5 - margin;
      let bx = x1 + 0.5 + margin;
      let az = z0 - 0.5 - margin;
      let bz = z1 + 0.5 + margin;
      for (const wc of this.water) {
        const [i, j] = wc.split(",").map(Number);
        if (i + 0.5 <= ax || i - 0.5 >= bx || j + 0.5 <= az || j - 0.5 >= bz) continue;
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        if (Math.abs(j - cz) >= Math.abs(i - cx)) {
          if (j > cz) bz = Math.min(bz, j - 0.7);
          else az = Math.max(az, j + 0.7);
        } else if (i > cx) bx = Math.min(bx, i - 0.7);
        else ax = Math.max(ax, i + 0.7);
      }
      const [ox, oz] = this.shifts.get(c) ?? [0, 0];
      out.push({ x: (ax + bx) / 2 + ox, z: (az + bz) / 2 + oz, w: bx - ax, d: bz - az });
    }
    return out;
  }
}

type HoleSpec = Omit<HoleDef, "pieces" | "tee" | "cup" | "path" | "islands" | "heading"> & { islands?: Island[] };

function finish(b: Builder, spec: HoleSpec): HoleDef {
  return {
    ...spec,
    pieces: b.pieces,
    tee: b.tee,
    cup: b.cup,
    path: [b.tee, ...b.path.slice(1)],
    islands: spec.islands ?? b.islands(),
    heading: b.heading,
  };
}

// --- The nine holes --------------------------------------------------------------------------------

function welcome() {
  const b = new Builder(0, 3, 0);
  b.start(0.14).go("straight", 2).go("bump-walls").go("straight", 2).hole("hole-round");
  return finish(b, { name: "Welcome Green", par: 2, tip: "A gentle warm-up. Mind the bump in the middle.", origin: { x: 0, z: 0 }, flag: "red" });
}

function lagoonBend() {
  const b = new Builder(-1, 3, 0);
  b.start(-0.18).go("straight").go("hill-round").go("straight").right("round-corner-a").go("straight").left("round-corner-a").go("straight").hole("hole-square");
  return finish(b, { name: "Lagoon Bend", par: 3, tip: "Two bends: bank it off the walls.", origin: { x: 14, z: -1 }, flag: "blue" });
}

function castleKeep() {
  const b = new Builder(0, 4, 0);
  b.start(0.24).go("straight").go("crest").go("straight").go("castle").go("straight", 2).hole("hole-round");
  return finish(b, { name: "Castle Keep", par: 3, tip: "Thread the ball through the castle gate.", origin: { x: 28, z: 1 }, flag: "green" });
}

function rampRidge() {
  const b = new Builder(0, 4, 0);
  b.start(-0.2).go("straight").up("ramp").go("straight").go("bump-walls").down("ramp").go("straight").hole("hole-round");
  return finish(b, { name: "Ramp Ridge", par: 3, tip: "Hit it firmly enough to climb the ridge.", origin: { x: 29, z: -19 }, flag: "red" });
}

function windmillWay() {
  const b = new Builder(0, 3, 0);
  b.start(0.2).go("straight").facing("windmill").go("straight").right("corner").go("straight").hole("hole-square");
  return finish(b, { name: "Windmill Way", par: 3, tip: "Time your putt between the sails.", origin: { x: 14, z: -21 }, flag: "blue" });
}

function bumpBridge() {
  const b = new Builder(0, 4, 0);
  b.start(0.22).go("straight");
  b.overWater = true;
  b.go("open").go("bump").go("open").go("bump");
  b.overWater = false;
  b.go("straight").hole("hole-round");
  return finish(b, { name: "Bridge of Bumps", par: 3, tip: "No walls on the bridge — stay on the straight and narrow.", origin: { x: 0, z: -19 }, flag: "green" });
}

function skyJump() {
  const b = new Builder(0, 4, 0);
  b.start().go("straight").up("ramp-high");
  b.overWater = true;
  b.skip();
  b.overWater = false;
  b.y = 0;
  // The landing pad sits a little closer than a full tile, with a closed back towards the gap.
  b.sz = 0.35;
  b.go("end").go("straight", 2).hole("hole-round");
  return finish(b, { name: "Sky Jump", par: 3, tip: "Launch off the ramp and fly the gap. Too soft and it's a splash!", origin: { x: 1, z: -39 }, flag: "red" });
}

function tunnelGarden() {
  const b = new Builder(0, 3, 0);
  b.start(-0.22).go("straight").go("tunnel-wide").go("straight");
  // A walled 3×4 garden with a diamond in front of the cup.
  b.at("corner", -1, -1, 3).at("open", 0, -1, 0).at("corner", 1, -1, 0);
  b.at("side", -1, -2, 2).at("obstacle-diamond", 0, -2, 0).at("side", 1, -2, 0);
  b.at("side", -1, -3, 2).at("side", 1, -3, 0);
  b.at("corner", -1, -4, 2).at("side", 0, -4, 1).at("corner", 1, -4, 1);
  b.path.push({ x: 0, y: FLOOR, z: -1 }, { x: 0.7, y: FLOOR, z: -2 }, { x: 0, y: FLOOR, z: -3 });
  b.i = 0;
  b.j = -3;
  b.h = 0;
  b.hole("hole-open");
  return finish(b, { name: "Tunnel Garden", par: 3, tip: "Through the tunnel, then around the diamond.", origin: { x: 14, z: -40 }, flag: "blue" });
}

function loopDeLoop() {
  const b = new Builder(0, 5, 0);
  b.y = 0.5;
  b.start();
  b.down("ramp-large").go("straight", 2);
  // The loop: enters heading north at the tile edge, comes out one tile to the east, still heading north.
  const s = LOOP_SCALE;
  b.pieces.push({ key: "minigolf-kit/spline-default-looping", x: 0, y: b.y + FLOOR + 0.937 * s, z: b.j + 0.5, rot: 2, sx: 1, sy: s, sz: s });
  b.mark(0, b.j);
  b.mark(1, b.j + 1);
  b.path.push({ x: 0, y: 1.9 * s, z: b.j - 0.5 + 0.5 }, { x: 1, y: FLOOR, z: b.j });
  b.i = 1;
  b.go("straight", 2).right("round-corner-a").go("straight").hole("hole-square");
  return finish(b, { name: "Loop-de-Loop", par: 4, tip: "Full power to make the loop!", origin: { x: 27, z: -39 }, flag: "green" });
}

export const HOLES: HoleDef[] = [welcome(), lagoonBend(), castleKeep(), rampRidge(), windmillWay(), bumpBridge(), skyJump(), tunnelGarden(), loopDeLoop()];

/** Every Minigolf Kit piece the holes use. */
export const COURSE_KEYS = [...new Set(HOLES.flatMap((h) => h.pieces.map((p) => p.key)))];
