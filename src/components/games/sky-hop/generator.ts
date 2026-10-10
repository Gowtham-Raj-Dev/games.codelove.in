import { findItem, HANDCRAFTED, WORLDS, type WorldDef } from "./content";
import { Builder, LEVELS, type LevelDef } from "./levels";
import type { EnemyKind } from "./manifest";

/**
 * Sky Hop's stages: ten per world. A few are the original handcrafted levels; the rest are built here
 * from a seed, as a chain of islands joined by "connectors" (a jump, steps, planks, crumbling bricks,
 * a moving platform, sliders, a lift, a spring, pillars, stepping stones, a ramp). Each island holds
 * something (coins, enemies, spikes, a saw, spike blocks, crates, an arena), and three stars hide in
 * every stage: in a metal crate, on a sky island up a spring, and in the chest the key opens. The
 * difficulty grows with the world and the stage. Every stage also records its route for the
 * trailer's autopilot (levels.ts RouteNode).
 */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

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

/** Seed for a stage's decoration (the handcrafted levels keep the seeds they always had). */
export function stageSeed(worldId: string, stage: number) {
  const hand = HANDCRAFTED[worldId]?.[stage];
  return hand !== undefined ? 1234 + hand * 77 : (hash(worldId) + stage * 7919) >>> 0;
}

/** How hard a stage is, 0 (first meadow stages) to 1 (the volcano's last). */
export const difficulty = (world: WorldDef, stage: number) => Math.min(1, (world.tier * 10 + stage) / 55);

export function stageDef(worldId: string, stage: number): LevelDef {
  const world = findItem(WORLDS, worldId);
  const hand = HANDCRAFTED[world.id]?.[stage];
  if (hand !== undefined) return LEVELS[hand];
  const seed = stageSeed(world.id, stage);
  return {
    name: world.stages[stage] ?? `Stage ${stage + 1}`,
    theme: world.theme,
    sky: world.look.sky,
    build: (b) => new Gen(b, world, stage, rng(seed ^ 0x5bd1e995)).build(),
  };
}

// --- Generator ---------------------------------------------------------------------------------------

type Conn = "gap" | "steps" | "planks" | "bridge" | "bricks" | "mover" | "sliders" | "lift" | "spring" | "pillars" | "stones" | "ramp";
type Plat = "coins" | "enemy" | "spikes" | "saw" | "blocks" | "crates" | "arena";
/** Something extra on an island's corner (on the `side` the stage picked) or beside it. */
type Extra = "key" | "spring" | "crate" | "heart" | null;

const CONNECTORS: Record<Conn, (d: number) => number> = {
  gap: () => 3,
  steps: () => 1.4,
  planks: () => 1.1,
  bridge: () => 1,
  bricks: (d) => (d > 0.12 ? 1.3 : 0),
  mover: () => 1.4,
  sliders: (d) => (d > 0.2 ? 1.3 : 0),
  lift: () => 1.1,
  spring: () => 1,
  pillars: (d) => (d > 0.22 ? 1.1 : 0),
  stones: (d) => (d > 0.08 ? 1.1 : 0),
  ramp: () => 0.7,
};

const PLATFORMS: Record<Plat, (d: number) => number> = {
  coins: (d) => 1.8 - d,
  enemy: () => 2.2,
  spikes: (d) => 0.5 + d * 1.6,
  saw: (d) => (d > 0.08 ? 0.6 + d : 0),
  blocks: (d) => (d > 0.3 ? 0.4 + d : 0),
  crates: () => 1,
  arena: (d) => (d > 0.15 ? 1 : 0.3),
};

/** Each world leans on some pieces (multipliers on the weights above). */
const BIAS: Record<string, Partial<Record<Conn | Plat, number>>> = {
  autumn: { bridge: 1.6, bricks: 1.5, enemy: 1.3, ramp: 1.4 },
  frost: { sliders: 1.4, pillars: 1.6, stones: 0.4, blocks: 0.5 },
  desert: { saw: 1.8, spikes: 1.4, stones: 1.4, gap: 1.2 },
  candy: { spring: 2, mover: 1.5, sliders: 1.3, lift: 1.5, arena: 1.2 },
  volcano: { blocks: 1.6, saw: 1.4, spikes: 1.5, bricks: 1.5, pillars: 1.3 },
};

const SPEED: Record<EnemyKind, number> = { crab: 1.8, bee: 2, hog: 2.3, penguin: 2.8, polar: 1.5 };

class Gen {
  private readonly d: number;
  /** Current island: lane centre (x), last row (f), top (y), half width. */
  private x = 0;
  private f = 0;
  private y = 0;
  private hw = 2;
  private len = 6;
  private lastConn: Conn | null = null;
  private lastPlat: Plat | null = null;
  private enemyTurn = 0;

  constructor(
    private readonly b: Builder,
    private readonly world: WorldDef,
    private readonly stage: number,
    private readonly r: () => number,
  ) {
    this.d = difficulty(world, stage);
  }

  // --- Helpers ---------------------------------------------------------------------------------------

  private int(a: number, b: number) {
    return a + Math.floor(this.r() * (b - a + 1));
  }

  private chance(p: number) {
    return this.r() < p;
  }

  private pick<T extends string>(table: Record<T, (d: number) => number>, skip: (k: T) => boolean): T {
    const bias = BIAS[this.world.id] ?? {};
    const entries = (Object.keys(table) as T[]).map((k) => [k, skip(k) ? 0 : table[k](this.d) * ((bias as Record<string, number>)[k] ?? 1)] as const);
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let roll = this.r() * total;
    for (const [k, w] of entries) {
      roll -= w;
      if (roll <= 0 && w > 0) return k;
    }
    return entries.find(([, w]) => w > 0)![0];
  }

  private get snow() {
    return this.world.theme === "snow";
  }

  private enemyKind(): EnemyKind {
    const pool = this.world.enemies.filter((k) => k !== "polar" || this.d > 0.25);
    return pool[this.enemyTurn++ % pool.length];
  }

  /** An enemy patrolling across the island at row f. */
  private patrol(f: number, x0: number, x1: number, kind = this.enemyKind()) {
    const y = this.y + (kind === "bee" ? 0.6 : 0);
    const speed = SPEED[kind] * (0.9 + this.d * 0.5);
    if (this.chance(0.5)) this.b.enemy(kind, x0, f, y, x1, f, speed);
    else this.b.enemy(kind, x1, f, y, x0, f, speed);
  }

  private tree(x: number, f: number, y: number) {
    const kinds = this.snow ? (["pine", "pineSmall", "pine"] as const) : (["round", "pine", "round", "pineSmall"] as const);
    this.b.tree(x, f, y, kinds[this.int(0, kinds.length - 1)]);
  }

  // --- Stage ---------------------------------------------------------------------------------------------

  build() {
    const { b } = this;
    const last = this.stage === 9;
    const sections = 5 + Math.round(this.d * 3) + Math.floor(this.stage / 5) + (last ? 1 : 0);

    // Start island.
    b.start(0, 0, 0);
    b.isle(-2, 2, -1, 4, 0);
    b.fence(-1, -1.38, 2, -1.38, 0);
    this.tree(-2, -1, 0);
    this.tree(2, 0, 0);
    b.prop("sign", -1.6, 2.6, 0, 25);
    b.coins(0, 1, 0, 3.5, 0, 3);
    this.x = 0;
    this.f = 4;
    this.y = 0;
    this.hw = 2;
    this.len = 6;

    // Where the extras go (never on the same island).
    const slots = Array.from({ length: sections - 1 }, (_, i) => i + 1);
    const take = () => slots.splice(Math.floor(this.r() * slots.length), 1)[0];
    const keyAt = take();
    const springAt = take();
    const crateAt = take();
    const heartAt = this.d > 0.3 ? take() : -1;
    const side = this.chance(0.5) ? 1 : -1;
    let sinceCheckpoint = 0;
    let finale = 0;

    for (let s = 0; s < sections; s++) {
      const conn = this.pick(CONNECTORS, (k) => {
        if (k === this.lastConn) return true;
        if (k === "ramp") return this.snow || this.len < 5 || this.lastPlat === "spikes" || this.lastPlat === "saw" || this.lastPlat === "blocks";
        if (k === "spring") return this.lastPlat === "blocks";
        return false;
      });
      this.lastConn = conn;
      const next = this.connector(conn);

      // An island with an extra keeps its corners free for it.
      const extra: Extra = s === keyAt ? "key" : s === springAt ? "spring" : s === crateAt ? "crate" : s === heartAt ? "heart" : null;
      const plat = this.pick(PLATFORMS, (k) => {
        if (extra && (k === "spikes" || k === "saw" || k === "blocks")) return true;
        return (k === this.lastPlat && k !== "enemy") || (k === "blocks" && this.snow && this.d < 0.4);
      });
      this.lastPlat = plat;
      const checkpoint = sinceCheckpoint >= 2 && s < sections - 1 && plat !== "blocks";
      this.platform(next.f0, next.y, next.x, plat, checkpoint, extra);
      sinceCheckpoint = checkpoint ? 0 : sinceCheckpoint + 1;
      if (checkpoint) finale = next.f0;

      if (extra === "key") this.keyLedge(side);
      else if (extra === "spring") this.starSpring(side);
      else if (extra === "crate") b.crate(this.x + side * this.hw, this.f, this.y, "star");
      else if (extra === "heart") b.crate(this.x + side * this.hw, this.f - 1, this.y, "heart");
    }

    // Finish: one more jump to the flag island, with the chest.
    const next = this.connector(this.pick(CONNECTORS, (k) => k === this.lastConn || k === "ramp" || (k === "spring" && this.lastPlat === "blocks")));
    this.finish(next.f0, next.y, next.x);
    b.finale(finale || next.f0 - 10);
  }

  // --- Connectors: from the end of the current island to where the next one starts ---------------------

  private connector(kind: Conn): { f0: number; y: number; x: number } {
    const { b, x, f, y, d } = this;
    switch (kind) {
      case "gap": {
        const maxGap = d < 0.15 ? 2 : d < 0.6 ? 3 : 4;
        const g = this.int(1, maxGap);
        const rises = g === 1 ? [-1, -0.5, 0, 0.5, 1] : g === 2 ? [-1, -0.5, 0, 0.5] : g === 3 ? [-1, -0.5, 0, 0.5] : [-1, -0.5];
        const dy = rises[this.int(0, rises.length - 1)];
        const nx = this.lane(x + (this.chance(0.35) ? (this.chance(0.5) ? -1 : 1) : 0));
        b.go(x, f + 0.2, y, "jump");
        b.arc(x, f + 0.6, y + 0.1, nx, f + g + 0.4, y + dy + 0.1, g + 2, 0.5 + g * 0.3);
        if (g >= 3 && this.chance(0.5)) b.prop("arrow", x + (this.hw > 0 ? this.hw - 0.4 : 0.6), f - 0.3, y, 0);
        return { f0: f + g + 1, y: y + dy, x: nx };
      }
      case "steps":
      case "stones": {
        const stones = kind === "stones";
        const n = stones ? this.int(3, 4) : this.int(2, 3);
        let cf = f;
        let cy = y;
        let cx = x;
        let flip = this.chance(0.5);
        b.go(x, f + 0.2, y, "jump");
        for (let k = 0; k < n; k++) {
          const sf = cf + 2;
          flip = !flip;
          if (stones) {
            const sx = x + (flip ? 1 : -1);
            const sy = cy + [0, 0.5, -0.5, 0][this.int(0, 3)];
            b.isle(sx, sx, sf, sf, sy, { low: true, decor: 0 });
            b.arc(cx, cf + 0.5, cy + 0.1, sx, sf, sy + 0.1, 2, 0.5);
            b.go(sx, sf, sy, "jump");
            cf = sf;
            cy = sy;
            cx = sx;
          } else {
            const sx = flip ? x - 1 : x;
            const sy = cy + [0.5, 1, 0.5, -0.5][this.int(0, 3)];
            b.isle(sx, sx + 1, sf, sf + 1, sy, { low: true, decor: 0.25 });
            b.arc(cx, cf + 0.5, cy + 0.1, sx + 0.5, sf + 0.5, sy + 0.1, 3, 0.6);
            b.go(sx + 0.5, sf + 0.5, sy, "jump");
            cf = sf + 1;
            cy = sy;
            cx = sx + 0.5;
          }
        }
        return { f0: cf + 2, y: cy + (this.chance(0.4) ? 0.5 : 0), x };
      }
      case "planks": {
        const g = this.int(4, 6);
        b.go(x, f, y);
        b.plank(x, x, f + 1, f + g, y);
        b.coins(x, f + 1, x, f + g, y, g);
        if (d > 0.3 && this.chance(0.6)) {
          const yy = this.y;
          this.y = y;
          this.patrol(f + Math.ceil(g / 2), x - 2.5, x + 2.5, "bee");
          this.y = yy;
        }
        return { f0: f + g + 1, y, x };
      }
      case "bridge": {
        const n = this.int(4, 6);
        b.go(x, f, y);
        for (let k = 1; k <= n; k++) b.crumble(x, f + k, y);
        b.coins(x, f + 1, x, f + n, y + 0.1, n);
        return { f0: f + n + 1, y, x };
      }
      case "bricks": {
        const n = this.int(3, 4);
        const zig = d > 0.35 && this.chance(0.6);
        let cf = f;
        b.go(x, f + 0.2, y, "jump");
        for (let k = 0; k < n; k++) {
          const bf = cf + 2;
          const bx = zig ? x + (k % 2 === 0 ? 1 : -1) : x;
          b.crumble(bx, bf, y);
          b.coin(bx, bf, y + 0.2);
          b.go(bx, bf, y, "jump");
          cf = bf;
        }
        return { f0: cf + 2, y, x };
      }
      case "mover": {
        const t = this.int(3, 5) + (d > 0.5 ? 1 : 0);
        const rise = d > 0.3 && this.chance(0.35) ? 1 : 0;
        const af = f + 2;
        b.mover(x, af, y, 0, t, rise, { size: 2, period: 3 + t * 0.7 - d * 0.8 });
        b.ride(x, f, y, [x, af, y], [x, af + t, y + rise]);
        b.coins(x, af, x, af + t, y + 0.3 + rise / 2, t + 1);
        return { f0: af + t + 2, y: y + rise, x };
      }
      case "sliders": {
        const n = d > 0.45 && this.chance(0.6) ? 2 : 1;
        let cf = f;
        for (let k = 0; k < n; k++) {
          const sf = cf + 2.75;
          const dir = k % 2 === 0 ? 1 : -1;
          b.mover(x - 2 * dir, sf, y, 4 * dir, 0, 0, { size: 2, period: 4.4 - d * 0.8, phase: k * 0.5 });
          b.ride(x, cf, y, [x, sf, y], [x, sf, y]);
          b.coins(x - 1.5, sf, x + 1.5, sf, y + 0.3, 3);
          cf = sf;
        }
        return { f0: Math.ceil(cf + 2.5), y, x };
      }
      case "lift": {
        const h = this.int(2, d < 0.2 ? 3 : 4);
        const lf = f + 2;
        b.mover(x, lf, y, 0, 0, h, { size: 2, period: 3.5 + h * 0.6 });
        b.ride(x, f, y, [x, lf, y], [x, lf, y + h]);
        b.column(x, lf, y + 0.6, h * 2 - 1, 0.5);
        return { f0: lf + 2, y: y + h, x };
      }
      case "spring": {
        const h = this.int(2, 3) + (d > 0.4 && this.chance(0.5) ? 0.5 : 0);
        b.spring(x, f, y);
        b.go(x, f, y, "spring");
        b.column(x, f, y + 1.2, 4, 0.6);
        return { f0: f + 2, y: y + h, x };
      }
      case "pillars": {
        const n = this.int(2, 3);
        let cf = f;
        let cy = y;
        let cx = x;
        b.go(x, f + 0.2, y, "jump");
        for (let k = 0; k < n; k++) {
          const pf = cf + 2;
          const px = x - 1 + (k % 2);
          const py = cy + [0.5, 1, 0.5][this.int(0, 2)];
          b.tall(px, pf, py);
          b.arc(cx, cf + 0.5, cy + 0.1, px + 0.5, pf + 0.5, py + 0.1, 3, 0.6);
          b.go(px + 0.5, pf + 0.5, py, "jump");
          cf = pf + 1;
          cy = py;
          cx = px + 0.5;
        }
        return { f0: cf + 2, y: cy, x };
      }
      case "ramp": {
        // Up the slope on the island's last two rows to the next island, one cell higher.
        b.ramp(x, f - 1, y, "f");
        b.go(x + 0.5, f - 1.6, y);
        b.coin(x + 0.5, f - 0.9, y + 0.3);
        b.coin(x + 0.5, f - 0.1, y + 0.75);
        return { f0: f + 1, y: y + 1, x };
      }
    }
  }

  /** Keeps the path within a few cells of the middle. */
  private lane(x: number) {
    return Math.max(-3, Math.min(3, x));
  }

  // --- Islands -------------------------------------------------------------------------------------------

  private platform(f0: number, y: number, x: number, kind: Plat, checkpoint: boolean, extra: Extra) {
    const { b, d } = this;
    const narrow = kind === "blocks" || (d > 0.55 && !this.snow && kind !== "arena" && this.chance(0.25));
    const hw = kind === "arena" ? 3 : narrow ? 1 : 2;
    const len = kind === "blocks" ? this.int(8, 10) : kind === "arena" ? this.int(6, 7) : this.int(4, 7);
    const cx = kind === "arena" ? Math.max(-2, Math.min(2, x)) : x;
    const f1 = f0 + len - 1;
    b.isle(cx - hw, cx + hw, f0, f1, y, { decor: narrow ? 0.15 : 0.3 });
    b.go(x, f0 + 0.5, y);
    if (cx !== x) b.go(cx, f0 + 1.5, y);
    this.x = cx;
    this.f = f1;
    this.y = y;
    this.hw = hw;
    this.len = len;
    if (checkpoint) b.checkpoint(cx, f0 + 1, y);
    const mid = f0 + Math.floor(len / 2);
    const lane = (from: number, to: number, n: number) => b.coins(cx, from, cx, to, y, n);

    switch (kind) {
      case "coins":
        lane(f0 + 0.5, f1 - 0.5, len);
        if (hw >= 2 && !extra) {
          b.coins(cx - hw + 0.5, mid, cx - hw + 0.5, f1, y, 2);
          b.jewel(cx + hw, mid, y);
        }
        break;
      case "enemy":
        this.patrol(mid, cx - hw + 0.2, cx + hw - 0.2);
        if (len >= 6 && d > 0.35) this.patrol(mid + 2, cx - hw + 0.2, cx + hw - 0.2);
        lane(f0 + 0.5, mid - 0.6, 2);
        b.arc(cx, mid - 0.6, y, cx, mid + 0.6, y, 3, 0.7);
        lane(mid + 1, f1 - 0.5, Math.max(1, f1 - mid - 1));
        break;
      case "spikes": {
        const rows = len >= 6 && d > 0.4 ? [mid - 1, mid + 1] : [mid];
        rows.forEach((row, n) => {
          for (let i = -hw; i <= hw; i++) {
            // Easy stages: fixed spikes with the path left clear. Later: every spike pops up and down.
            if (d < 0.2) {
              if (i !== 0) b.spikes(cx + i, row, y);
            } else b.spikes(cx + i, row, y, ((i + hw + n) % 2) * 0.5);
          }
          b.arc(cx, row - 0.9, y, cx, row + 0.9, y, 3, 0.7);
        });
        lane(f0 + 0.5, rows[0] - 1.2, 2);
        break;
      }
      case "saw":
        b.saw(cx - hw, mid, y, hw * 2, 0, 3.2 - d);
        if (len >= 6 && d > 0.45) b.saw(cx + hw, mid + 2, y, -hw * 2, 0, 3 - d, 0.5);
        lane(f0 + 0.5, mid - 1, 2);
        b.arc(cx, mid - 0.8, y, cx, mid + 0.8, y, 3, 0.8);
        lane(mid + 1, f1 - 0.5, Math.max(1, f1 - mid - 1));
        break;
      case "blocks":
        b.spikeBlock(cx - hw, f0 + 2, y, hw * 2, 0, 2.6 - d * 0.6);
        b.spikeBlock(cx + hw, f0 + 5, y, -hw * 2, 0, 2.2 - d * 0.4, 0.3);
        if (len >= 9) b.spikeBlock(cx - hw, f0 + 7.5, y, hw * 2, 0, 2.4 - d * 0.5, 0.6);
        lane(f0 + 0.5, f1 - 0.5, len - 1);
        b.jewel(cx, f1, y);
        break;
      case "crates":
        b.crate(cx, mid, y);
        if (!extra) {
          b.crate(cx - hw, f0 + 1, y);
          if (hw >= 2) b.crate(cx + hw, f1 - 1, y, this.chance(0.4) ? "heart" : "coins");
        }
        lane(f0 + 0.5, mid - 1, 2);
        lane(mid + 1, f1 - 0.5, Math.max(1, f1 - mid - 1));
        break;
      case "arena": {
        const n = d > 0.5 ? 3 : 2;
        for (let k = 0; k < n; k++) this.patrol(f0 + 1.5 + k * ((len - 3) / Math.max(1, n - 1)), cx - hw + 0.3, cx + hw - 0.3);
        b.ring(cx, mid, y, 1.8, 10);
        b.coin(cx, mid, y);
        break;
      }
    }

    // Decoration on the corners away from the path.
    if (extra) return;
    if (hw >= 2 && kind !== "arena") {
      if (this.chance(0.6)) this.tree(cx - hw, f1, y);
      if (this.chance(0.5)) this.tree(cx + hw, f0, y);
    } else if (kind === "arena") {
      this.tree(cx - hw, f0, y);
      this.tree(cx + hw, f1, y);
    }
  }

  /** The key, on a little ledge off to one side: a double jump away. */
  private keyLedge(side: number) {
    const { b, x, hw, f, y } = this;
    const lf = Math.max(f - this.len + 2, f - 2);
    const lx = x + side * (hw + (this.d < 0.15 ? 2 : 3));
    const ly = y + (this.d < 0.15 ? 0.5 : 1);
    b.isle(lx, lx, lf, lf, ly, { low: true, decor: 0 });
    b.key(lx, lf, ly);
    b.arc(x + side * hw, lf, y + 0.2, lx, lf, ly + 0.2, 4, 0.8);
  }

  /** A star on a sky island beside this one, up a spring on the corner. */
  private starSpring(side: number) {
    const { b, x, hw, f, y } = this;
    const sf = f - 1;
    const sx = x + side * hw;
    b.spring(sx, sf, y);
    const ix = x + side * (hw + 2);
    const x0 = Math.min(ix, ix + side);
    b.isle(x0, x0 + 1, sf - 1, sf, y + 3, { low: true, decor: 0.4 });
    b.star(x0 + 0.5, sf - 0.5, y + 3);
    b.ring(x0 + 0.5, sf - 0.5, y + 3, 0.8, 6);
    b.column(sx, sf, y + 1.2, 3, 0.6);
  }

  private finish(f0: number, y: number, x: number) {
    const { b } = this;
    const cx = Math.max(-1, Math.min(1, x));
    const f1 = f0 + 6;
    b.isle(cx - 2, cx + 2, f0, f1, y);
    b.go(x, f0 + 0.5, y);
    b.go(cx, f1 - 2, y);
    b.chest(cx - 2, f1 - 2, y, 90);
    b.finish(cx, f1 - 2, y);
    b.coins(cx - 1, f0 + 1.5, cx + 1, f0 + 1.5, y, 3);
    b.coins(cx - 1, f0 + 3, cx + 1, f0 + 3, y, 3);
    this.tree(cx + 2, f1, y);
    this.tree(cx + 2, f0, y);
    this.tree(cx - 2, f1, y);
    if (this.stage === 9) {
      // The world's last stage: a guard at the gate.
      this.y = y;
      this.patrol(f0 + 4.5, cx - 1.7, cx + 1.7, this.world.enemies.includes("polar") ? "polar" : this.world.enemies[0]);
    }
  }
}
