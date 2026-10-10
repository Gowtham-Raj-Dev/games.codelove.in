import {
  BAG,
  CATEGORY_EDGE,
  KIND_INDEX,
  KINDS,
  QUEST_RANGE,
  cellKey,
  cellQ,
  cellR,
  edgeAt,
  edgeFit,
  neighbor,
  opposite,
  questCategoryFor,
  type Category,
  type EdgeFit,
  type Family,
} from "./tiles";

/**
 * Rules of Hex Haven, kept free of rendering so they are easy to reason about: the board, the tile
 * stack, scoring, quests and the one-step undo.
 */

export const START_TILES = 40;
export const EDGE_POINTS = 10;
export const PERFECT_POINTS = 30;
export const FLAWLESS_POINTS = 100;
/** A perfect fit must touch at least this many tiles (and match all of them). */
export const PERFECT_MIN = 3;
const HAND = 4;
const MAX_QUESTS = 3;

export interface QuestSpec {
  cat: Category;
  target: number;
}

export interface Draw {
  kind: number;
  quest: QuestSpec | null;
}

export interface Placed {
  kind: number;
  rot: number;
  /** Placement number (seed tiles are 0). */
  order: number;
}

export interface Quest extends QuestSpec {
  id: number;
  cell: number;
  progress: number;
  state: "active" | "done" | "failed";
  rewardTiles: number;
  rewardPoints: number;
}

export interface Fit {
  valid: boolean;
  /** Per world edge: null when no neighbour. */
  edges: (EdgeFit | null)[];
  matches: number;
  neighbors: number;
  /** Every touching edge matches (and it touches at least PERFECT_MIN tiles). */
  perfect: boolean;
  /** Perfect on all six sides. */
  flawless: boolean;
  points: number;
}

export interface PlaceResult {
  cell: number;
  fit: Fit;
  points: number;
  bonusTiles: number;
  completed: Quest[];
  failed: Quest[];
  started: Quest | null;
}

interface Snapshot {
  cells: Map<number, Placed>;
  hand: Draw[];
  remaining: number;
  score: number;
  placed: number;
  perfects: number;
  questsDone: number;
  quests: Quest[];
  rng: number;
  bag: Family[];
  sinceQuest: number;
  nextQuestId: number;
}

/** The seed landscape: a windmill hamlet between two woods, a lake feeding a river and a road out. */
const SEED: [number, number, string, number][] = [
  [0, 0, "building-mill", 0],
  [1, 0, "path-start", 3],
  [1, -1, "grass-forest", 0],
  [0, -1, "grass-forest", 2],
  [-1, 0, "water", 0],
  [-1, 1, "river-straight", 2],
  [0, 1, "grass", 0],
];

export class HexLogic {
  cells = new Map<number, Placed>();
  hand: Draw[] = [];
  /** Tiles left to place, including the one in hand. */
  remaining = 0;
  score = 0;
  placed = 0;
  perfects = 0;
  questsDone = 0;
  quests: Quest[] = [];
  private rng = 1;
  private bag: Family[] = [];
  private sinceQuest = 0;
  private nextQuestId = 1;
  private undoState: Snapshot | null = null;

  constructor(seed = Date.now()) {
    this.reset(seed);
  }

  reset(seed = Date.now(), tiles = START_TILES) {
    this.cells = new Map();
    this.hand = [];
    this.remaining = tiles;
    this.score = 0;
    this.placed = 0;
    this.perfects = 0;
    this.questsDone = 0;
    this.quests = [];
    this.rng = seed >>> 0 || 1;
    this.bag = [];
    this.sinceQuest = 0;
    this.nextQuestId = 1;
    this.undoState = null;
    for (const [q, r, id, rot] of SEED) this.cells.set(cellKey(q, r), { kind: KIND_INDEX.get(id)!, rot, order: 0 });
    // A first, easy quest on the northern wood teaches how quests work.
    this.quests.push(this.makeQuest({ cat: "forest", target: 4 }, cellKey(0, -1)));
    this.updateQuests();
    this.fill();
  }

  get current(): Draw | null {
    return this.hand[0] ?? null;
  }

  get canUndo() {
    return this.undoState !== null;
  }

  get over() {
    return this.remaining <= 0;
  }

  // --- Random ---------------------------------------------------------------------------------------

  private random() {
    // mulberry32
    let t = (this.rng = (this.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private int(lo: number, hi: number) {
    return lo + Math.floor(this.random() * (hi - lo + 1));
  }

  // --- Stack ----------------------------------------------------------------------------------------

  private fill() {
    while (this.hand.length < Math.min(HAND, this.remaining)) this.hand.push(this.draw());
  }

  private draw(): Draw {
    if (!this.bag.length) {
      for (const [family, n] of BAG) for (let i = 0; i < n; i++) this.bag.push(family);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    const family = this.bag.pop()!;
    const options = KINDS.map((kind, i) => ({ kind, i })).filter((o) => o.kind.family === family);
    let roll = this.random() * options.reduce((s, o) => s + o.kind.weight, 0);
    let pick = options[0];
    for (const o of options) {
      roll -= o.kind.weight;
      if (roll <= 0) {
        pick = o;
        break;
      }
    }
    this.sinceQuest++;
    let quest: QuestSpec | null = null;
    const cat = questCategoryFor(pick.kind);
    const pending = this.quests.filter((q) => q.state === "active").length + this.hand.filter((d) => d.quest).length;
    if (cat && pending < MAX_QUESTS && this.sinceQuest >= 3 && this.random() < 0.45) {
      const [lo, hi] = QUEST_RANGE[cat];
      const grow = Math.min(4, Math.floor(this.placed / 30));
      quest = { cat, target: this.int(lo, hi) + grow };
      this.sinceQuest = 0;
    }
    return { kind: pick.i, quest };
  }

  private makeQuest(spec: QuestSpec, cell: number): Quest {
    return {
      ...spec,
      id: this.nextQuestId++,
      cell,
      progress: 0,
      state: "active",
      rewardTiles: Math.max(2, Math.ceil(spec.target / 2)),
      rewardPoints: spec.target * 10 + 40,
    };
  }

  // --- Board ----------------------------------------------------------------------------------------

  /** Empty cells next to the landscape. */
  frontier(): number[] {
    const out = new Set<number>();
    for (const key of this.cells.keys()) {
      for (let d = 0; d < 6; d++) {
        const n = neighbor(key, d);
        if (!this.cells.has(n)) out.add(n);
      }
    }
    return [...out];
  }

  fit(cell: number, kindIndex: number, rot: number): Fit {
    const kind = KINDS[kindIndex];
    const edges: (EdgeFit | null)[] = [];
    let matches = 0;
    let neighbors = 0;
    let valid = !this.cells.has(cell);
    for (let d = 0; d < 6; d++) {
      const other = this.cells.get(neighbor(cell, d));
      if (!other) {
        edges.push(null);
        continue;
      }
      neighbors++;
      const f = edgeFit(edgeAt(kind, rot, d), edgeAt(KINDS[other.kind], other.rot, opposite(d)));
      edges.push(f);
      if (f === "match") matches++;
      else if (f === "conflict") valid = false;
    }
    if (neighbors === 0) valid = false;
    const perfect = valid && neighbors >= PERFECT_MIN && matches === neighbors;
    const flawless = perfect && neighbors === 6;
    const points = valid ? matches * EDGE_POINTS + (flawless ? FLAWLESS_POINTS : perfect ? PERFECT_POINTS : 0) : 0;
    return { valid, edges, matches, neighbors, perfect, flawless, points };
  }

  /** Rotations of the tile that fit at the cell. */
  validRotations(cell: number, kindIndex: number): number[] {
    const out: number[] = [];
    for (let rot = 0; rot < 6; rot++) if (this.fit(cell, kindIndex, rot).valid) out.push(rot);
    return out;
  }

  /** Frontier cells where the tile fits in some rotation. */
  spots(kindIndex: number): number[] {
    return this.frontier().filter((cell) => this.validRotations(cell, kindIndex).length > 0);
  }

  /** Swaps the tile in hand if it fits nowhere (rare: every open cell blocked by a road or river). */
  ensurePlayable(): boolean {
    for (let tries = 0; tries < 24 && this.current; tries++) {
      if (this.spots(this.current.kind).length) return true;
      this.hand[0] = this.draw();
    }
    return !!this.current && this.spots(this.current.kind).length > 0;
  }

  place(cell: number, rot: number): PlaceResult | null {
    const draw = this.current;
    if (!draw) return null;
    const fit = this.fit(cell, draw.kind, rot);
    if (!fit.valid) return null;
    this.undoState = this.snapshot();

    this.hand.shift();
    this.remaining--;
    this.placed++;
    this.cells.set(cell, { kind: draw.kind, rot, order: this.placed });
    let points = fit.points;
    let bonusTiles = 0;
    if (fit.perfect) {
      this.perfects++;
      bonusTiles += fit.flawless ? 2 : 1;
    }
    let started: Quest | null = null;
    if (draw.quest) {
      started = this.makeQuest(draw.quest, cell);
      this.quests.push(started);
    }
    const { completed, failed } = this.updateQuests();
    for (const q of completed) {
      bonusTiles += q.rewardTiles;
      points += q.rewardPoints;
      this.questsDone++;
    }
    this.score += points;
    this.remaining += bonusTiles;
    this.fill();
    return { cell, fit, points, bonusTiles, completed, failed, started };
  }

  undo(): boolean {
    const s = this.undoState;
    if (!s) return false;
    this.cells = s.cells;
    this.hand = s.hand;
    this.remaining = s.remaining;
    this.score = s.score;
    this.placed = s.placed;
    this.perfects = s.perfects;
    this.questsDone = s.questsDone;
    this.quests = s.quests;
    this.rng = s.rng;
    this.bag = s.bag;
    this.sinceQuest = s.sinceQuest;
    this.nextQuestId = s.nextQuestId;
    this.undoState = null;
    return true;
  }

  private snapshot(): Snapshot {
    return {
      cells: new Map(this.cells),
      hand: [...this.hand],
      remaining: this.remaining,
      score: this.score,
      placed: this.placed,
      perfects: this.perfects,
      questsDone: this.questsDone,
      quests: this.quests.map((q) => ({ ...q })),
      rng: this.rng,
      bag: [...this.bag],
      sinceQuest: this.sinceQuest,
      nextQuestId: this.nextQuestId,
    };
  }

  // --- Groups & quests ------------------------------------------------------------------------------

  private inCategory(cell: number, cat: Category) {
    const p = this.cells.get(cell);
    if (!p) return false;
    const kind = KINDS[p.kind];
    return cat === "village" ? !!kind.village : kind.edges.includes(CATEGORY_EDGE[cat]);
  }

  /** Connected tiles of a category around `cell`, and whether the group can still grow. */
  group(cell: number, cat: Category): { cells: number[]; open: boolean } {
    if (!this.inCategory(cell, cat)) return { cells: [], open: false };
    const seen = new Set([cell]);
    const stack = [cell];
    let open = false;
    const edge = cat === "village" ? null : CATEGORY_EDGE[cat];
    while (stack.length) {
      const c = stack.pop()!;
      const p = this.cells.get(c)!;
      const kind = KINDS[p.kind];
      for (let d = 0; d < 6; d++) {
        if (edge && edgeAt(kind, p.rot, d) !== edge) continue;
        const n = neighbor(c, d);
        const other = this.cells.get(n);
        if (!other) {
          open = true;
          continue;
        }
        if (seen.has(n)) continue;
        const linked = edge ? edgeAt(KINDS[other.kind], other.rot, opposite(d)) === edge : !!KINDS[other.kind].village;
        if (linked) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    return { cells: [...seen], open };
  }

  private updateQuests() {
    const completed: Quest[] = [];
    const failed: Quest[] = [];
    for (const q of this.quests) {
      if (q.state !== "active") continue;
      const g = this.group(q.cell, q.cat);
      q.progress = g.cells.length;
      if (q.progress >= q.target) {
        q.state = "done";
        completed.push(q);
      } else if (!g.open) {
        q.state = "failed";
        failed.push(q);
      }
    }
    return { completed, failed };
  }

  /** Best placement for the tile in hand (used by the demo island and tests). */
  bestMove(): { cell: number; rot: number; score: number } | null {
    const draw = this.current;
    if (!draw) return null;
    let best: { cell: number; rot: number; score: number } | null = null;
    for (const cell of this.frontier()) {
      for (let rot = 0; rot < 6; rot++) {
        const f = this.fit(cell, draw.kind, rot);
        if (!f.valid) continue;
        // Prefer compact islands: more neighbours, more matches, and a little randomness.
        const q = cellQ(cell);
        const r = cellR(cell);
        const dist = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
        const score = f.points + f.neighbors * 4 - dist * 1.5 + this.random() * 6;
        if (!best || score > best.score) best = { cell, rot, score };
      }
    }
    return best;
  }

  /** Largest group of a category on the board (for the end-of-game summary). */
  largest(cat: Category): number {
    let best = 0;
    const seen = new Set<number>();
    for (const cell of this.cells.keys()) {
      if (seen.has(cell) || !this.inCategory(cell, cat)) continue;
      const g = this.group(cell, cat).cells;
      g.forEach((c) => seen.add(c));
      best = Math.max(best, g.length);
    }
    return best;
  }
}

