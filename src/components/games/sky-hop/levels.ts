import type { EnemyKind } from "./manifest";

/**
 * Sky Hop's levels, written with a small builder in grid cells: x to the right, f forward (away
 * from the start camera), y up. One cell is U metres; island tops sit on whole or half cells.
 * The builder turns them into plain records in metres (world: x right, y up, -z forward).
 */

export const U = 2;

export type Theme = "grass" | "snow";
export type CrateContent = "coins" | "heart" | "star";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Piece extends V3 {
  /** Prototype id (a model key or a derived id like "ramp:grass"). */
  id: string;
  rot: number;
  scale?: number;
}

export interface StaticBox {
  min: V3;
  max: V3;
  oneWay?: boolean;
  slippery?: boolean;
  camera?: boolean;
  ramp?: { axis: "x" | "z"; c0: number; c1: number; y0: number; y1: number };
}

export interface Path {
  a: V3;
  b: V3;
  period: number;
  phase: number;
}

/**
 * The way through a stage, for the trailer's autopilot: walk to each point in turn, then do its act —
 * `jump` to the next point, `spring` (bounce up to it), or `ride` a moving platform from `enter` to
 * `exit` before jumping on. Only generated stages have one.
 */
export type RouteAct = "run" | "jump" | "spring" | "ride";

export interface RouteNode extends V3 {
  act: RouteAct;
  /** `ride`: index in movers, and where the platform must be to get on and off. */
  mover?: number;
  enter?: V3;
  exit?: V3;
}

export interface LevelData {
  theme: Theme;
  start: V3 & { yaw: number };
  killY: number;
  pieces: Piece[];
  boxes: StaticBox[];
  coins: V3[];
  jewels: V3[];
  stars: (V3 & { index: number })[];
  hearts: V3[];
  keys: V3[];
  chests: (V3 & { rot: number; star: number })[];
  crates: (V3 & { strong: boolean; content: CrateContent; star: number })[];
  springs: V3[];
  spikes: (V3 & { timed: boolean; phase: number })[];
  movers: (Path & { size: number; lift: boolean })[];
  crumbles: V3[];
  saws: (Path & { axis: "x" | "z" })[];
  spikeBlocks: Path[];
  enemies: { kind: EnemyKind; a: V3; b: V3; speed: number }[];
  checkpoints: (V3 & { yaw: number })[];
  finish: V3;
  /** Forward distance (metres, -z) after which the music goes to full intensity. */
  finale: number;
  route: RouteNode[];
}

export interface LevelDef {
  name: string;
  theme: Theme;
  /** Sky colours: zenith and horizon. */
  sky: [string, string];
  build: (b: Builder) => void;
}

// --- Builder ----------------------------------------------------------------------------------------

/** Deterministic random numbers so decoration is the same on every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const deg = (d: number) => (d * Math.PI) / 180;
const W = (x: number, f: number, y: number): V3 => ({ x: x * U, y: y * U, z: -f * U });

type TreeKind = "round" | "pine" | "pineSmall";
type Dir = "f" | "b" | "l" | "r";

export class Builder {
  readonly data: LevelData;
  private readonly rand: () => number;
  private starCount = 0;

  constructor(
    readonly theme: Theme,
    seed: number,
  ) {
    this.rand = rng(seed);
    this.data = {
      theme,
      start: { x: 0, y: 0, z: 0, yaw: 0 },
      killY: 0,
      pieces: [],
      boxes: [],
      coins: [],
      jewels: [],
      stars: [],
      hearts: [],
      keys: [],
      chests: [],
      crates: [],
      springs: [],
      spikes: [],
      movers: [],
      crumbles: [],
      saws: [],
      spikeBlocks: [],
      enemies: [],
      checkpoints: [],
      finish: { x: 0, y: 0, z: 0 },
      finale: Infinity,
      route: [],
    };
  }

  private piece(id: string, x: number, f: number, y: number, rot = 0, scale?: number) {
    this.data.pieces.push({ id, ...W(x, f, y), rot, scale });
  }

  private block(kind: string) {
    return `${this.theme}:${kind}`;
  }

  start(x: number, f: number, y: number, yawDeg = 0) {
    this.data.start = { ...W(x, f, y), yaw: deg(yawDeg) };
  }

  /**
   * A floating island covering cells x0..x1 × f0..f1 with its top at y. `low` islands are half a
   * cell thick. `decor` (0..1) scatters grass, flowers and rocks along the edges.
   */
  isle(x0: number, x1: number, f0: number, f1: number, y: number, { low = false, decor = 0.35 }: { low?: boolean; decor?: number } = {}) {
    const w = x1 - x0 + 1;
    const d = f1 - f0 + 1;
    const used = Array.from({ length: w }, () => new Array<boolean>(d).fill(false));
    const thick = low ? 0.5 : 1;
    const big = low ? "lowLarge" : "large";
    const long = low ? "lowLong" : "long";
    const one = low ? "low" : "one";
    for (let j = 0; j < d; j++) {
      for (let i = 0; i < w; i++) {
        if (used[i][j]) continue;
        const free = (a: number, b: number) => a < w && b < d && !used[a][b];
        if (free(i + 1, j) && free(i, j + 1) && free(i + 1, j + 1)) {
          used[i][j] = used[i + 1][j] = used[i][j + 1] = used[i + 1][j + 1] = true;
          this.piece(this.block(big), x0 + i + 0.5, f0 + j + 0.5, y - thick);
        } else if (free(i + 1, j)) {
          used[i][j] = used[i + 1][j] = true;
          this.piece(this.block(long), x0 + i + 0.5, f0 + j, y - thick);
        } else if (free(i, j + 1)) {
          used[i][j] = used[i][j + 1] = true;
          this.piece(this.block(long), x0 + i, f0 + j + 0.5, y - thick, Math.PI / 2);
        } else {
          used[i][j] = true;
          this.piece(this.block(one), x0 + i, f0 + j, y - thick, Math.floor(this.rand() * 4) * (Math.PI / 2));
        }
      }
    }
    this.solid(x0 - 0.5, x1 + 0.5, f0 - 0.5, f1 + 0.5, y - thick, y, { camera: true });

    // Edge decoration.
    if (decor > 0) {
      const kinds = this.theme === "grass" ? ["grass", "grass", "flowers", "flowersTall", "mushrooms", "rocks", "plant", "stones"] : ["rocks", "stones", "rocks", "stones"];
      for (let i = 0; i < w; i++) {
        for (let j = 0; j < d; j++) {
          const edge = i === 0 || j === 0 || i === w - 1 || j === d - 1;
          if (!edge || this.rand() > decor) continue;
          const kind = kinds[Math.floor(this.rand() * kinds.length)];
          // Push towards the outer side of the cell, away from the walking line.
          const ox = i === 0 ? -0.25 : i === w - 1 ? 0.25 : (this.rand() - 0.5) * 0.4;
          const of = j === 0 ? -0.25 : j === d - 1 ? 0.25 : (this.rand() - 0.5) * 0.4;
          this.piece(`deco:${kind}`, x0 + i + ox, f0 + j + of, y, this.rand() * Math.PI * 2, 0.75 + this.rand() * 0.4);
        }
      }
    }
  }

  /** A solid collider in cell units (x/f bounds, y bottom and top). */
  private solid(xa: number, xb: number, fa: number, fb: number, ya: number, yb: number, opts: Partial<StaticBox> = {}) {
    this.data.boxes.push({ min: { x: xa * U, y: ya * U, z: -fb * U }, max: { x: xb * U, y: yb * U, z: -fa * U }, ...opts, slippery: this.theme === "snow" });
  }

  /** A 2×2-cell pillar two cells tall, top at y (cells x0..x0+1, f0..f0+1). */
  tall(x0: number, f0: number, y: number) {
    this.piece(this.block("tall"), x0 + 0.5, f0 + 0.5, y - 2);
    this.solid(x0 - 0.5, x0 + 1.5, f0 - 0.5, f0 + 1.5, y - 2, y, { camera: true });
  }

  /** A 2×2-cell ramp on cells x0..x0+1, f0..f0+1 rising one cell from y towards `dir`. */
  ramp(x0: number, f0: number, y: number, dir: Dir) {
    const cx = x0 + 0.5;
    const cf = f0 + 0.5;
    const rot = dir === "f" ? 0 : dir === "b" ? Math.PI : dir === "r" ? -Math.PI / 2 : Math.PI / 2;
    this.data.pieces.push({ id: `ramp:${this.theme}`, x: cx * U, y: y * U - 0.96, z: -cf * U, rot });
    const axis = dir === "f" || dir === "b" ? "z" : "x";
    // World coordinates of the low and high edges.
    const lowW = dir === "f" ? -(cf - 1) * U : dir === "b" ? -(cf + 1) * U : dir === "r" ? (cx - 1) * U : (cx + 1) * U;
    const highW = dir === "f" ? -(cf + 1) * U : dir === "b" ? -(cf - 1) * U : dir === "r" ? (cx + 1) * U : (cx - 1) * U;
    this.data.boxes.push({
      min: { x: (cx - 1) * U, y: y * U - 0.96, z: -(cf + 1) * U },
      max: { x: (cx + 1) * U, y: (y + 1) * U, z: -(cf - 1) * U },
      slippery: this.theme === "snow",
      ramp: { axis, c0: lowW, c1: highW, y0: y * U, y1: (y + 1) * U },
    });
  }

  /** Wooden planks (you can jump up through them) on cells x0..x1 × f0..f1, top at y. */
  plank(x0: number, x1: number, f0: number, f1: number, y: number) {
    for (let i = x0; i <= x1; i++) for (let j = f0; j <= f1; j++) this.piece("plank", i, j, y - 0.195);
    this.data.boxes.push({ min: { x: (x0 - 0.5) * U, y: (y - 0.195) * U, z: -(f1 + 0.5) * U }, max: { x: (x1 + 0.5) * U, y: y * U, z: -(f0 - 0.5) * U }, oneWay: true });
  }

  tree(x: number, f: number, y: number, kind: TreeKind = "round") {
    this.piece(`tree:${kind}`, x, f, y, this.rand() * Math.PI * 2, 0.9 + this.rand() * 0.25);
    const r = kind === "pineSmall" ? 0.25 : 0.32;
    this.solid(x - r, x + r, f - r, f + r, y, y + 1.6);
  }

  /** Decoration without collision (sign, arrow, barrel…), facing `rotDeg` (0 = towards the start). */
  prop(name: string, x: number, f: number, y: number, rotDeg = 0, scale?: number, solid = false) {
    this.piece(`deco:${name}`, x, f, y, deg(rotDeg), scale);
    if (solid) this.solid(x - 0.3, x + 0.3, f - 0.3, f + 0.3, y, y + 0.55);
  }

  /** A straight run of low fence between two cell positions along x or f (collides, can be jumped). */
  fence(x0: number, f0: number, x1: number, f1: number, y: number) {
    const alongX = f0 === f1;
    const n = Math.round(Math.abs(alongX ? x1 - x0 : f1 - f0)) + 1;
    for (let k = 0; k < n; k++) {
      const x = alongX ? Math.min(x0, x1) + k : x0;
      const f = alongX ? f0 : Math.min(f0, f1) + k;
      this.piece("fence", x, f, y, alongX ? 0 : Math.PI / 2);
    }
    const t = 0.1;
    if (alongX) this.solid(Math.min(x0, x1) - 0.5, Math.max(x0, x1) + 0.5, f0 - t, f0 + t, y, y + 0.3);
    else this.solid(x0 - t, x0 + t, Math.min(f0, f1) - 0.5, Math.max(f0, f1) + 0.5, y, y + 0.3);
  }

  coin(x: number, f: number, y: number) {
    this.data.coins.push(W(x, f, y + 0.18));
  }

  /** n coins in a line on the surface at height y. */
  coins(x0: number, f0: number, x1: number, f1: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.coin(x0 + (x1 - x0) * t, f0 + (f1 - f0) * t, y);
    }
  }

  /** n coins along a jump arc from (x0,f0,y0) to (x1,f1,y1) peaking h cells above the straight line. */
  arc(x0: number, f0: number, y0: number, x1: number, f1: number, y1: number, n: number, h: number) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.coin(x0 + (x1 - x0) * t, f0 + (f1 - f0) * t, y0 + (y1 - y0) * t + 4 * h * t * (1 - t));
    }
  }

  /** A flat ring of n coins of radius r cells. */
  ring(x: number, f: number, y: number, r: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.coin(x + Math.cos(a) * r, f + Math.sin(a) * r, y);
    }
  }

  /** A vertical column of n coins above (x, f) starting at y. */
  column(x: number, f: number, y: number, n: number, gap = 0.45) {
    for (let i = 0; i < n; i++) this.coin(x, f, y + i * gap);
  }

  /** A jewel is worth 5 coins. */
  jewel(x: number, f: number, y: number) {
    this.data.jewels.push(W(x, f, y + 0.2));
  }

  star(x: number, f: number, y: number) {
    this.data.stars.push({ ...W(x, f, y + 0.25), index: this.starCount++ });
  }

  heart(x: number, f: number, y: number) {
    this.data.hearts.push(W(x, f, y + 0.2));
  }

  key(x: number, f: number, y: number) {
    this.data.keys.push(W(x, f, y + 0.3));
  }

  /** The level's chest, holding a star; opens with the key. Faces `rotDeg` (0 = towards the start). */
  chest(x: number, f: number, y: number, rotDeg = 0) {
    this.data.chests.push({ ...W(x, f, y), rot: deg(rotDeg), star: this.starCount++ });
    this.solid(x - 0.33, x + 0.33, f - 0.33, f + 0.33, y, y + 0.55);
  }

  crate(x: number, f: number, y: number, content: CrateContent = "coins", strong = content === "star") {
    this.data.crates.push({ ...W(x, f, y), strong, content, star: content === "star" ? this.starCount++ : -1 });
  }

  spring(x: number, f: number, y: number) {
    this.data.springs.push(W(x, f, y));
  }

  /** Floor spikes on a cell; timed ones pop up and down (phase 0..1 offsets the cycle). */
  spikes(x: number, f: number, y: number, timed: number | false = false) {
    this.data.spikes.push({ ...W(x, f, y), timed: timed !== false, phase: timed === false ? 0 : timed });
  }

  /**
   * A moving platform (size in cells) whose top is at y, travelling by (dx, df, dy) cells and back
   * every `period` seconds. Platforms that only move up and down are blue lifts.
   */
  mover(x: number, f: number, y: number, dx: number, df: number, dy: number, { size = 2, period = 5, phase = 0 }: { size?: number; period?: number; phase?: number } = {}) {
    this.data.movers.push({ a: W(x, f, y), b: W(x + dx, f + df, y + dy), period, phase, size, lift: dx === 0 && df === 0 });
  }

  /** A brick slab that crumbles shortly after you land on it (top at y). */
  crumble(x: number, f: number, y: number) {
    this.data.crumbles.push(W(x, f, y));
  }

  /** A saw blade rolling along the floor at height y between two points. */
  saw(x: number, f: number, y: number, dx: number, df: number, period = 3, phase = 0) {
    this.data.saws.push({ a: W(x, f, y), b: W(x + dx, f + df, y), period, phase, axis: Math.abs(dx) > Math.abs(df) ? "x" : "z" });
  }

  /** A spiked block sliding between two points on the floor at height y. */
  spikeBlock(x: number, f: number, y: number, dx: number, df: number, period = 2.5, phase = 0) {
    this.data.spikeBlocks.push({ a: W(x, f, y), b: W(x + dx, f + df, y), period, phase });
  }

  /** An enemy patrolling between (x, f) and (x2, f2) on the surface at y. */
  enemy(kind: EnemyKind, x: number, f: number, y: number, x2: number, f2: number, speed = 2) {
    this.data.enemies.push({ kind, a: W(x, f, y), b: W(x2, f2, y), speed });
  }

  checkpoint(x: number, f: number, y: number, yawDeg = 0) {
    this.data.checkpoints.push({ ...W(x, f, y), yaw: deg(yawDeg) });
  }

  finish(x: number, f: number, y: number) {
    this.data.finish = W(x, f, y);
  }

  /** Route (autopilot): walk to this point, then `act`. */
  go(x: number, f: number, y: number, act: RouteAct = "run") {
    this.data.route.push({ ...W(x, f, y), act });
  }

  /** Route (autopilot): from this point, board the moving platform added last when it is at `enter`, and leave it at `exit` (cells). */
  ride(x: number, f: number, y: number, enter: [number, number, number], exit: [number, number, number]) {
    this.data.route.push({ ...W(x, f, y), act: "ride", mover: this.data.movers.length - 1, enter: W(...enter), exit: W(...exit) });
  }

  /** Music turns up for the last stretch once the player passes this forward position. */
  finale(f: number) {
    this.data.finale = f * U;
  }

  done() {
    const tops = this.data.boxes.map((b) => b.max.y);
    this.data.killY = Math.min(...tops, this.data.start.y) - 16;
    return this.data;
  }
}

/** Every coin a level holds: loose coins, jewels (5), coin crates (4) and enemies (1 each). */
export function coinTotal(d: LevelData) {
  return d.coins.length + d.jewels.length * 5 + d.crates.filter((c) => c.content === "coins").length * 4 + d.enemies.length;
}

export function buildLevel(def: LevelDef, seed: number) {
  const b = new Builder(def.theme, seed);
  def.build(b);
  return b.done();
}

// --- Menu island ------------------------------------------------------------------------------------

export const MENU: LevelDef = {
  name: "Menu",
  theme: "grass",
  sky: ["#3f9be8", "#cbe9ff"],
  build(b) {
    b.start(0, 0, 0, 180);
    b.isle(-2, 2, -2, 2, 0, { decor: 0.5 });
    b.tree(-2, 2, 0);
    b.tree(2, 1, 0, "pine");
    b.tree(1.6, 2.2, 0, "pineSmall");
    b.prop("sign", -1.7, -1.4, 0, 30);
    // Islands in the distance.
    b.isle(-9, -6, 4, 7, 2, { decor: 0.6 });
    b.tree(-8, 6, 2);
    b.isle(6, 8, -6, -4, -2, { decor: 0.6 });
    b.tree(7, -5, -2, "pine");
    b.isle(5, 7, 8, 9, 4, { low: true });
    b.isle(-6, -5, -6, -5, -3, { low: true });
    b.spring(6, 8.5, 4);
  },
};

// --- Levels -----------------------------------------------------------------------------------------

export const LEVELS: LevelDef[] = [
  {
    name: "Sunny Meadow",
    theme: "grass",
    sky: ["#3f9be8", "#cbe9ff"],
    build(b) {
      b.start(0, 0, 0);
      b.isle(-2, 2, -1, 5, 0);
      b.fence(-1, -1.38, 2, -1.38, 0);
      b.tree(-2, -1, 0);
      b.tree(2, 0, 0, "pine");
      b.prop("sign", -1.6, 3, 0, 25);
      b.coins(0, 2, 0, 5, 0, 4);
      b.arc(0, 5.6, 0, 0, 7.6, 0, 3, 0.6);

      // Meet the crab: stomp it.
      b.isle(-2, 3, 7, 12, 0);
      b.enemy("crab", -1.5, 10, 0, 2.5, 10, 1.6);
      b.crate(2.6, 8, 0);
      b.coins(-1.5, 8.5, 0.5, 8.5, 0, 3);
      b.coins(-1.5, 11.5, 2.5, 11.5, 0, 5);
      b.tree(3, 12, 0);
      b.tree(-2, 12, 0, "pineSmall");

      // Steps up.
      b.isle(-1, 1, 13, 14, 1);
      b.coin(0, 13.5, 1);
      b.isle(-2, 3, 15, 20, 2);
      b.checkpoint(0, 17, 2);
      b.crate(-2, 16, 2);
      b.crate(-2, 19, 2, "heart");
      b.crate(3, 20, 2, "star");
      b.prop("arrow", 2.2, 18.6, 2, -60);
      b.coins(1.5, 16, 1.5, 19, 2, 4);
      b.tree(-2, 20, 2, "pine");

      // Plank bridge.
      b.plank(0, 0, 21, 26, 2);
      b.coins(0, 21, 0, 26, 2, 6);
      b.isle(-3, 3, 27, 33, 2);
      b.enemy("crab", -2.5, 29, 2, 2, 29, 1.8);
      b.enemy("crab", 2.5, 32, 2, -1.5, 32, 2.1);
      b.tree(-3, 33, 2);
      b.tree(-3, 27, 2, "pineSmall");

      // A spring up to a sky island with a star.
      b.spring(3, 30, 2);
      b.column(3, 30, 3, 4);
      b.isle(5, 6, 29, 31, 5);
      b.star(5.5, 30, 5);
      b.ring(5.5, 30, 5, 0.9, 6);

      // Moving platform across the gap.
      b.mover(0, 35, 2, 0, 5, 0, { size: 2, period: 6 });
      b.coins(0, 35.5, 0, 39.5, 2.4, 4);
      b.isle(-2, 2, 42, 47, 2);
      b.checkpoint(0, 43, 2);
      b.heart(-2, 46, 2);
      b.coins(-1.5, 44.5, 1.5, 44.5, 2, 4);
      b.tree(-2, 42, 2, "pineSmall");

      // The key waits on a pillar: double jump!
      b.isle(5, 5, 45, 45, 3);
      b.arc(2.6, 45, 2.2, 5, 45, 3.2, 4, 0.8);
      b.key(5, 45, 3);

      // Finish.
      b.isle(-2, 2, 49, 55, 1);
      b.arc(0, 47.4, 2.1, 0, 49.6, 1.1, 3, 0.5);
      b.chest(-2, 54, 1, 90);
      b.finish(0, 54, 1);
      b.tree(2, 55, 1);
      b.tree(2, 49, 1, "pine");
      b.coins(-1, 51, 1, 51, 1, 3);
      b.finale(42);
    },
  },
  {
    name: "Breezy Hills",
    theme: "grass",
    sky: ["#4aa3f0", "#d7f0ff"],
    build(b) {
      b.start(0, 0, 0);
      b.isle(-2, 2, -1, 8, 0);
      b.fence(-2, -1.38, 1, -1.38, 0);
      b.tree(2, -1, 0);
      b.tree(-2, 3, 0, "pine");
      b.ramp(-2, 7, 0, "f");
      b.coins(-1.5, 3, -1.5, 6, 0, 4);
      b.arc(-1.5, 7, 0.2, -1.5, 8.5, 1, 2, 0.1);

      b.isle(-2, 2, 9, 13, 1);
      b.enemy("hog", -1.5, 11, 1, 2, 11, 2.2);
      for (let x = -2; x <= 2; x++) b.spikes(x, 13, 1, (x + 2) % 2 === 0 ? 0 : 0.5);
      b.coins(0, 9.5, 0, 10.5, 1, 2);
      b.ring(0, 11, 1, 1.3, 8);

      // Crumbling bricks.
      b.crumble(0, 15, 1);
      b.crumble(0, 17, 1);
      b.crumble(0, 19, 1);
      b.coins(0, 15, 0, 19, 1, 3);
      b.isle(-2, 2, 21, 26, 1);
      b.checkpoint(0, 22, 1);
      b.enemy("bee", -2, 24.5, 1.6, 2, 24.5, 2);
      b.crate(-2, 26, 1);
      b.crate(2, 21, 1, "heart");
      b.tree(-2, 21, 1, "pineSmall");
      b.coins(-1.5, 23, 1.5, 23, 1, 4);
      b.arc(0, 25.6, 1, 0, 27.6, 1.3, 3, 0.4);

      // A secret ledge below the island, with a spring back up.
      b.isle(4, 5, 23, 25, -1, { decor: 0.5 });
      b.crate(5, 24, -1, "star");
      b.spring(4, 23, -1);
      b.arc(2.5, 24, 1, 4.2, 24, -0.6, 3, 0.4);
      b.jewel(4.5, 25, -1);

      // Lift up.
      b.mover(0, 28, 1, 0, 0, 3, { size: 2, period: 5 });
      b.column(0, 28, 1.6, 4, 0.6);
      b.isle(-2, 2, 31, 36, 4);
      b.coins(-1.5, 31.5, 1.5, 31.5, 4, 4);
      b.arc(0, 34, 4, 0, 36, 4, 3, 0.6);
      b.enemy("hog", -2, 33, 4, 1.5, 33, 2.4);
      for (let x = -2; x <= 2; x++) b.spikes(x, 35, 4, x % 2 === 0 ? 0.25 : 0.75);
      b.spring(2, 32, 4);
      b.isle(5, 5, 33, 34, 6, { low: true });
      b.key(5, 33.5, 6);
      b.coins(5, 34, 5, 34, 6, 1);
      b.tree(-2, 31, 4);

      // Crumbling bridge.
      for (let f = 37; f <= 41; f++) b.crumble(0, f, 4);
      b.coins(0, 37, 0, 41, 4, 5);
      b.isle(-3, 3, 42, 47, 4);
      b.checkpoint(0, 43, 4);
      b.enemy("bee", -3, 45, 4.6, 0, 45, 2.2);
      b.enemy("bee", 3, 46.5, 4.6, 0, 46.5, 1.8);
      b.tree(3, 42, 4, "pine");
      b.ring(0, 45, 4, 1.6, 10);

      // A star up the planks.
      b.plank(-1, -1, 47, 47, 5);
      b.isle(-3, -3, 49, 49, 6, { low: true });
      b.star(-3, 49, 6);
      b.coin(-1, 47, 5);

      b.isle(-2, 2, 50, 56, 3);
      b.arc(0, 47.6, 4.1, 0, 50.4, 3.1, 3, 0.5);
      b.chest(2, 55, 3, -90);
      b.finish(0, 55, 3);
      b.tree(-2, 56, 3);
      b.tree(2, 50, 3, "pineSmall");
      b.coins(-1.5, 51.5, 1.5, 51.5, 3, 4);
      b.coins(-1.5, 53.5, 1.5, 53.5, 3, 4);
      b.finale(42);
    },
  },
  {
    name: "Sawmill Gorge",
    theme: "grass",
    sky: ["#6f8fe0", "#ffcf9e"],
    build(b) {
      b.start(0, 0, 0);
      b.isle(-2, 2, -1, 4, 0);
      b.tree(-2, -1, 0, "pine");
      b.tree(2, 0, 0);
      b.fence(-1, -1.38, 2, -1.38, 0);
      b.prop("barrel", 2, 3, 0, 0, undefined, true);
      b.coins(0, 1, 0, 3.5, 0, 3);

      // Two sliding platforms.
      b.mover(-2, 7, 0, 4, 0, 0, { size: 2, period: 4 });
      b.mover(2, 10.5, 0, -4, 0, 0, { size: 2, period: 4, phase: 0.25 });
      b.coins(0, 7, 0, 10.5, 0.6, 3);
      b.isle(-2, 2, 13, 19, 0);
      b.saw(-2, 16, 0, 4, 0, 3);
      b.coins(-1.5, 15, 1.5, 15, 0, 4);
      b.arc(0, 15.2, 0, 0, 16.8, 0, 3, 0.7);
      b.checkpoint(0, 18, 0);
      b.crate(2, 19, 0);

      // Spike-block corridor.
      b.isle(-1, 1, 20, 31, 0, { decor: 0.15 });
      b.spikeBlock(-1, 23, 0, 2, 0, 2.4);
      b.spikeBlock(1, 27, 0, -2, 0, 2.0, 0.3);
      b.coins(0, 21, 0, 30, 0, 8);
      b.jewel(1, 31, 0);
      b.isle(3, 4, 25, 26, 0);
      b.crate(4, 26, 0, "star");
      b.enemy("crab", 3, 25, 0, 4, 25, 1.2);

      // Lift up.
      b.mover(0, 33, 0, 0, 0, 3, { size: 2, period: 5 });
      b.column(0, 33, 0.6, 5, 0.5);
      b.isle(-3, 3, 36, 41, 3);
      b.ring(0, 39.6, 3, 1.8, 10);
      b.checkpoint(0, 37, 3);
      b.enemy("hog", -3, 39, 3, 0, 39, 2.6);
      b.enemy("hog", 3, 40.5, 3, 0, 40.5, 2.6);
      b.heart(3, 37, 3);
      b.tree(-3, 41, 3);

      // Crumbling zig-zag.
      b.crumble(0, 43, 3);
      b.crumble(1.5, 45, 3);
      b.crumble(0, 47, 3);
      b.crumble(-1.5, 49, 3);
      b.coins(0, 43, -1.5, 49, 3.3, 4);
      b.isle(-3, 3, 51, 57, 3);
      b.checkpoint(0, 52, 3);
      b.saw(-3, 54, 3, 6, 0, 3.4);
      b.saw(3, 55.5, 3, -6, 0, 3.4, 0.5);
      b.coins(-2, 53, 2, 53, 3, 5);
      b.coins(-2, 56.5, 2, 56.5, 3, 5);
      b.spring(3, 57, 3);
      b.isle(6, 6, 55, 55, 6, { low: true });
      b.key(6, 55, 6);
      b.tree(-3, 57, 3, "pine");

      // Secret: drop off the left side to a hidden ledge.
      b.isle(-6, -5, 52, 54, 0, { decor: 0.5 });
      b.star(-5.5, 53.5, 0);
      b.spring(-5, 52, 0);
      b.coins(-6, 52, -6, 54, 0, 3);

      b.mover(0, 60, 3, 0, 4, 0, { size: 2, period: 5 });
      b.coins(0, 60.5, 0, 63.5, 3.6, 4);
      b.isle(-2, 2, 66, 71, 3);
      b.chest(-2, 70, 3, 90);
      b.finish(0, 70, 3);
      b.tree(2, 71, 3);
      b.coins(-1, 67, 1, 67, 3, 3);
      b.coins(-1, 68.5, 1, 68.5, 3, 3);
      b.finale(51);
    },
  },
  {
    name: "Frosty Peaks",
    theme: "snow",
    sky: ["#7fb6e8", "#eef6ff"],
    build(b) {
      b.start(0, 0, 0);
      b.isle(-2, 2, -1, 6, 0);
      b.fence(-1, -1.38, 2, -1.38, 0);
      b.tree(-2, -1, 0, "pine");
      b.tree(2, 1, 0, "pineSmall");
      b.enemy("penguin", -2, 4, 0, 2, 4, 2.6);
      b.coins(0, 1, 0, 3, 0, 3);
      b.coins(1.5, 3, 1.5, 5, 0, 3);

      b.isle(-2, 2, 9, 13, 1);
      b.coins(1.5, 10, 1.5, 11, 1, 2);
      b.coins(-1.5, 12, -1.5, 13, 1, 2);
      b.arc(0, 6.6, 0.2, 0, 9.4, 1.2, 4, 0.8);
      for (let x = -2; x <= 0; x++) b.spikes(x, 11, 1);
      for (let x = 1; x <= 2; x++) b.spikes(x, 12, 1);
      b.spring(0, 13, 1);
      b.column(0, 13, 2, 3);
      b.isle(-1, 1, 16, 17, 3.5);
      b.checkpoint(-1, 16, 3.5);
      b.coins(1, 16, 1, 17, 3.5, 2);

      // Sliding platforms over the chasm.
      b.mover(-2, 20, 4, 4, 0, 0, { size: 2, period: 4 });
      b.mover(2, 23.5, 4, -4, 0, 0, { size: 2, period: 4, phase: 0.5 });
      b.coins(0, 20, 0, 23.5, 4.6, 3);
      b.isle(-3, 3, 26, 33, 4);
      b.checkpoint(0, 28, 4);
      b.enemy("polar", -3, 30, 4, 3, 30, 1.5);
      b.enemy("penguin", 3, 32.5, 4, -2, 32.5, 3);
      b.crate(-3, 33, 4, "star");
      b.crate(3, 28, 4, "heart");
      b.tree(3, 33, 4, "pine");
      b.ring(0, 30.5, 4, 2, 10);
      b.coins(-2.5, 31.5, -2.5, 32.5, 4, 2);

      // Pillar climb.
      b.tall(-1, 35, 5);
      b.tall(1, 38, 6);
      b.tall(-1, 41, 7);
      b.coin(-0.5, 35.5, 5);
      b.coin(1.5, 38.5, 6);
      b.coin(-0.5, 41.5, 7);
      b.isle(-2, 2, 44, 49, 7);
      b.checkpoint(0, 45, 7);
      b.enemy("penguin", -2, 47, 7, 2, 47, 2.8);
      b.tree(2, 44, 7, "pineSmall");
      b.coins(1.5, 45.5, 1.5, 48.5, 7, 4);

      // Key on crumbling bricks.
      b.crumble(4, 47, 7);
      b.crumble(6, 47, 7);
      b.key(4, 47, 7);
      b.jewel(6, 47, 7.2);

      // Star high above, via a spring.
      b.spring(-2, 49, 7);
      b.isle(-5, -4, 50, 51, 10, { low: true });
      b.star(-4.5, 50.5, 10);
      b.ring(-4.5, 50.5, 10, 0.7, 6);

      b.isle(-2, 2, 52, 58, 6);
      b.arc(0, 49.6, 7.1, 0, 52.4, 6.1, 3, 0.5);
      b.enemy("penguin", -2, 54, 6, 2, 54, 2.4);
      b.coins(-1.5, 53, 1.5, 53, 6, 4);
      b.coins(-1.5, 55.5, -1.5, 57.5, 6, 3);
      b.chest(2, 57, 6, -90);
      b.finish(0, 57, 6);
      b.tree(-2, 58, 6, "pine");
      b.finale(44);
    },
  },
  {
    name: "Blizzard Summit",
    theme: "snow",
    sky: ["#5d7fae", "#d9e6f5"],
    build(b) {
      b.start(0, 0, 0);
      b.isle(-2, 2, -1, 4, 0);
      b.tree(-2, -1, 0, "pine");
      b.tree(2, -1, 0, "pine");
      b.fence(-1, -1.38, 1, -1.38, 0);
      b.coins(0, 1, 0, 3, 0, 3);

      // Zig-zag bricks.
      b.crumble(0, 6, 0);
      b.crumble(2, 8, 0);
      b.crumble(0, 10, 0);
      b.crumble(-2, 12, 0);
      b.coins(0, 6, -2, 12, 0.3, 4);
      b.isle(-2, 2, 14, 20, 0);
      b.checkpoint(0, 15, 0);
      b.saw(-2, 16.5, 0, 4, 0, 2.6);
      b.coins(-1.5, 15.6, 1.5, 15.6, 0, 4);
      b.arc(0, 15.7, 0, 0, 17.3, 0, 3, 0.7);
      for (let x = -2; x <= 2; x++) b.spikes(x, 18, 0, x % 2 === 0 ? 0 : 0.5);
      b.coins(-1, 19.5, 1, 19.5, 0, 3);

      // Lift, then spike blocks.
      b.mover(0, 22, 0, 0, 0, 4, { size: 2, period: 6 });
      b.column(0, 22, 0.6, 6, 0.6);
      b.isle(-2, 2, 25, 31, 4);
      b.checkpoint(0, 26, 4);
      b.spikeBlock(-2, 27.6, 4, 4, 0, 3.2);
      b.spikeBlock(2, 29.6, 4, -4, 0, 3.6, 0.5);
      b.coins(0, 26.5, 0, 30.5, 4, 5);
      b.jewel(4, 26, 3);
      b.isle(4, 5, 26, 27, 3, { low: true });
      b.crate(5, 27, 3, "star");

      // Small sliding platforms.
      b.mover(-2, 33, 4, 4, 0, 0, { size: 1.5, period: 4 });
      b.mover(2, 36, 4, -4, 0, 0, { size: 1.5, period: 4, phase: 0.3 });
      b.mover(-2, 39, 4, 4, 0, 0, { size: 1.5, period: 4, phase: 0.6 });
      b.coins(0, 33, 0, 39, 4.5, 3);
      b.isle(-3, 3, 42, 47, 4);
      b.checkpoint(0, 43, 4);
      b.enemy("polar", -3, 45, 4, 3, 45, 1.7);
      b.enemy("penguin", 3, 47, 4, -3, 47, 3.2);
      b.heart(-3, 43, 4);
      b.ring(0, 45, 4, 2, 10);
      b.crumble(5, 44, 4);
      b.crumble(7, 44, 4);
      b.key(5, 44, 4);
      b.jewel(7, 44, 4.2);

      // Final climb.
      b.spring(0, 47, 4);
      b.isle(-1, 1, 50, 51, 6.5);
      b.coins(-1, 50.5, 1, 50.5, 6.5, 3);
      b.plank(2, 3, 53, 53, 7.5);
      b.plank(-1, 0, 55, 55, 8.5);
      b.coin(2.5, 53, 7.5);
      b.coin(-0.5, 55, 8.5);
      b.isle(-3, 3, 57, 63, 9.5);
      b.checkpoint(0, 58, 9.5);
      b.saw(-3, 60, 9.5, 6, 0, 2.8);
      b.enemy("penguin", 3, 61.5, 9.5, -3, 61.5, 3.4);
      b.coins(-2, 58.5, 2, 58.5, 9.5, 5);
      b.coins(-2, 62.5, 2, 62.5, 9.5, 5);
      b.spring(-3, 63, 9.5);
      b.isle(-6, -5, 64, 65, 12.5, { low: true });
      b.star(-5.5, 64.5, 12.5);
      b.ring(-5.5, 64.5, 12.5, 0.7, 6);
      b.isle(-2, 2, 64, 68, 9.5);
      b.chest(2, 67, 9.5, -90);
      b.coins(-1, 65, 1, 65, 9.5, 3);
      b.finish(0, 67, 9.5);
      b.tree(-2, 68, 9.5, "pine");
      b.tree(2, 64, 9.5, "pineSmall");
      b.finale(57);
    },
  },
];
