/**
 * Hex Haven tile data — no three.js here.
 *
 * Hexagon Kit tiles are pointy-top hexes, 1 unit across the flats (x) and 1.155 point to point (z),
 * standing on y = 0 with their origin in the centre. Edges are numbered counter-clockwise seen from
 * above, starting east, with north = -z:
 *
 *        2 /\ 1          0 = E   (+x)
 *       3 |  | 0         1 = NE, 2 = NW
 *        4 \/ 5          3 = W, 4 = SW, 5 = SE
 *
 * Rotating a tile by `rot` steps (object.rotation.y = rot · 60°) moves its edge k to world edge
 * k + rot. The edge strings below were measured from top-down renders of every model (colour sampled
 * just inside each edge midpoint) and checked by eye. Path pieces are decals that keep their
 * position inside the hex, so they must not be re-centred (no makeProto for them).
 */

export type Edge = "grass" | "forest" | "water" | "river" | "road" | "sand" | "stone" | "field";

/** Groups that quests (and the stats) count. "village" is a tile tag, the rest are edge types. */
export type Category = "forest" | "village" | "lake" | "river" | "road" | "field" | "stone" | "sand";

/** Bag families — the stack is dealt from shuffled bags of these so it never streaks too much. */
export type Family = "grass" | "forest" | "water" | "sand" | "stone" | "field" | "river" | "road" | "village";

const CODE: Record<string, Edge> = { G: "grass", F: "forest", W: "water", R: "river", P: "road", S: "sand", M: "stone", D: "field" };

export interface Kind {
  id: string;
  name: string;
  /** Library key of the tile model. */
  model: string;
  /** Path pieces are thin decals laid on top of this base tile. */
  base?: string;
  /** Edge types at rotation 0, indexed by edge (0 = E, counter-clockwise). */
  edges: Edge[];
  family: Family;
  village?: boolean;
  /** Relative chance inside its family. */
  weight: number;
  /** Extra library props scattered on the tile. */
  props?: "trees";
}

const k = (id: string, name: string, model: string, code: string, family: Family, weight: number, extra: Partial<Kind> = {}): Kind => ({
  id,
  name,
  model: `hexagon-kit/${model}`,
  edges: [...code].map((c) => CODE[c]),
  family,
  weight,
  ...extra,
});

const HK = (name: string) => `hexagon-kit/${name}`;
const path = (id: string, name: string, code: string, weight: number) => k(id, name, id, code, "road", weight, { base: HK("grass") });

export const KINDS: Kind[] = [
  // Plain terrain.
  k("grass", "Meadow", "grass", "GGGGGG", "grass", 5),
  k("grass-hill", "Hill", "grass-hill", "GGGGGG", "grass", 2),
  k("grass-forest", "Forest", "grass-forest", "FFFFFF", "forest", 4),
  k("grove", "Grove", "grass", "FFFFFF", "forest", 2, { props: "trees" }),
  k("water", "Lake", "water", "WWWWWW", "water", 5),
  k("water-rocks", "Rocky lake", "water-rocks", "WWWWWW", "water", 1.5),
  k("water-island", "Island", "water-island", "WWWWWW", "water", 1),
  k("sand", "Sand", "sand", "SSSSSS", "sand", 2),
  k("sand-rocks", "Dunes", "sand-rocks", "SSSSSS", "sand", 1.5),
  k("sand-desert", "Desert", "sand-desert", "SSSSSS", "sand", 1.5),
  k("stone", "Stone", "stone", "MMMMMM", "stone", 1.5),
  k("stone-rocks", "Rocks", "stone-rocks", "MMMMMM", "stone", 1.5),
  k("stone-hill", "Stone hill", "stone-hill", "MMMMMM", "stone", 1.5),
  k("stone-mountain", "Mountain", "stone-mountain", "MMMMMM", "stone", 1),
  k("dirt", "Field", "dirt", "DDDDDD", "field", 2),
  k("dirt-lumber", "Lumber camp", "dirt-lumber", "DDDDDD", "field", 1.5),

  // Rivers (full tiles; river on the listed edges, meadow elsewhere).
  k("river-straight", "River", "river-straight", "RGGRGG", "river", 4),
  k("river-corner", "River bend", "river-corner", "GRGRGG", "river", 3),
  k("river-corner-sharp", "Sharp bend", "river-corner-sharp", "GGRRGG", "river", 1.5),
  k("river-end", "River end", "river-end", "GGGRGG", "river", 1),
  k("river-start", "Spring", "river-start", "GGGRGG", "river", 1),
  k("bridge", "Bridge", "bridge", "RGGRGG", "river", 1),
  k("river-intersection-a", "River fork", "river-intersection-a", "GRRRGG", "river", 0.35),
  k("river-intersection-b", "River fork", "river-intersection-b", "RRGRGG", "river", 0.35),
  k("river-intersection-c", "River fork", "river-intersection-c", "RGGRGR", "river", 0.35),
  k("river-intersection-d", "River delta", "river-intersection-d", "RRGRGR", "river", 0.3),
  k("river-intersection-e", "River delta", "river-intersection-e", "RGRRGR", "river", 0.3),
  k("river-intersection-f", "River fork", "river-intersection-f", "GRGRGR", "river", 0.35),
  k("river-intersection-g", "River delta", "river-intersection-g", "RRRRGR", "river", 0.2),
  k("river-intersection-h", "River delta", "river-intersection-h", "RRRRGG", "river", 0.25),
  k("river-crossing", "River cross", "river-crossing", "RRRRRR", "river", 0.12),
  k("building-watermill", "Watermill", "building-watermill", "RGGRGG", "river", 1, { village: true }),

  // Roads (decals on a meadow tile).
  path("path-straight", "Road", "PGGPGG", 4),
  path("path-corner", "Road bend", "GPGPGG", 3),
  path("path-corner-sharp", "Sharp bend", "GGPPGG", 1.5),
  path("path-end", "Road end", "GGGPGG", 1),
  path("path-start", "Road end", "GGGPGG", 0.8),
  path("path-square", "Square", "PGGPGG", 0.6),
  path("path-square-end", "Plaza", "GGGPGG", 0.6),
  path("path-intersection-a", "Junction", "GPPPGG", 0.35),
  path("path-intersection-b", "Junction", "PPGPGG", 0.35),
  path("path-intersection-c", "Junction", "PGGPGP", 0.35),
  path("path-intersection-d", "Crossroads", "PPGPGP", 0.3),
  path("path-intersection-e", "Crossroads", "PGPPGP", 0.3),
  path("path-intersection-f", "Junction", "GPGPGP", 0.35),
  path("path-intersection-g", "Crossroads", "PPPPGP", 0.2),
  path("path-intersection-h", "Crossroads", "PPPPGG", 0.25),
  path("path-crossing", "Star crossing", "PPPPPP", 0.12),

  // Villages (count as their base terrain plus "village").
  k("building-house", "House", "building-house", "GGGGGG", "village", 2, { village: true }),
  k("building-village", "Village", "building-village", "GGGGGG", "village", 2, { village: true }),
  k("building-farm", "Farm", "building-farm", "GGGGGG", "village", 1.5, { village: true }),
  k("building-mill", "Windmill", "building-mill", "GGGGGG", "village", 1.5, { village: true }),
  k("building-sheep", "Sheep pen", "building-sheep", "GGGGGG", "village", 1.2, { village: true }),
  k("building-market", "Market", "building-market", "GGGGGG", "village", 1, { village: true }),
  k("building-tower", "Tower", "building-tower", "GGGGGG", "village", 0.8, { village: true }),
  k("building-archery", "Archery", "building-archery", "GGGGGG", "village", 0.8, { village: true }),
  k("building-mine", "Mine", "building-mine", "GGGGGG", "village", 0.8, { village: true }),
  k("building-smelter", "Smelter", "building-smelter", "GGGGGG", "village", 0.6, { village: true }),
  k("building-castle", "Castle", "building-castle", "GGGGGG", "village", 0.6, { village: true }),
  k("building-wall", "Wall", "building-wall", "GGGGGG", "village", 0.5, { village: true }),
  k("building-walls", "Fort", "building-walls", "GGGGGG", "village", 0.4, { village: true }),
  k("building-wizard-tower", "Wizard tower", "building-wizard-tower", "GGGGGG", "village", 0.4, { village: true }),
  k("building-cabin", "Mountain cabin", "building-cabin", "MMMMMM", "village", 0.6, { village: true }),
  k("building-port", "Port", "building-port", "GGWWWG", "village", 0.8, { village: true }),
  k("building-dock", "Dock", "building-dock", "GGWWWG", "village", 0.8, { village: true }),
];

export const KIND_INDEX = new Map(KINDS.map((kind, i) => [kind.id, i]));

/** Props and markers used besides the tiles. */
export const PROPS = {
  tree: HK("unit-tree"),
  ship: HK("unit-ship-large"),
  flag: "castle-kit/flag-pennant",
} as const;

/** One deal of the stack: how many tiles of each family. */
export const BAG: [Family, number][] = [
  ["grass", 4],
  ["forest", 4],
  ["water", 2],
  ["river", 2],
  ["road", 2],
  ["village", 3],
  ["field", 1],
  ["sand", 1],
  ["stone", 1],
];

// --- Hex grid (axial q, r) ------------------------------------------------------------------------

export const SQRT3_2 = Math.sqrt(3) / 2;
/** Axial step for each edge direction. */
export const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const OFFSET = 1024;
export const cellKey = (q: number, r: number) => (q + OFFSET) * 4096 + (r + OFFSET);
export const cellQ = (key: number) => Math.floor(key / 4096) - OFFSET;
export const cellR = (key: number) => (key % 4096) - OFFSET;
export const neighbor = (key: number, dir: number) => cellKey(cellQ(key) + DIRS[dir][0], cellR(key) + DIRS[dir][1]);
export const opposite = (dir: number) => (dir + 3) % 6;

export function cellToWorld(key: number): { x: number; z: number } {
  const q = cellQ(key);
  const r = cellR(key);
  return { x: q + r / 2, z: r * SQRT3_2 };
}

export function worldToCell(x: number, z: number): number {
  const r = z / SQRT3_2;
  const q = x - r / 2;
  // Cube rounding.
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return cellKey(rq, rr);
}

/** Edge type a tile shows on world edge `dir` when rotated `rot` steps. */
export const edgeAt = (kind: Kind, rot: number, dir: number) => kind.edges[(dir - rot + 12) % 6];

// --- Matching -------------------------------------------------------------------------------------

export type EdgeFit = "match" | "neutral" | "conflict";

/**
 * Roads only meet roads, rivers only meet rivers or lakes. Everything else may touch anything, but
 * only the same terrain (or a river flowing into a lake, or a sandy beach on a lake) scores.
 */
export function edgeFit(a: Edge, b: Edge): EdgeFit {
  if (a === b) return "match";
  if (a === "road" || b === "road") return "conflict";
  const water = (e: Edge) => e === "water" || e === "river";
  if (a === "river" || b === "river") return water(a) && water(b) ? "match" : "conflict";
  if ((a === "water" && b === "sand") || (a === "sand" && b === "water")) return "match";
  return "neutral";
}

/** Edge type that links tiles of a quest category (village is a tile tag instead). */
export const CATEGORY_EDGE: Record<Exclude<Category, "village">, Edge> = {
  forest: "forest",
  lake: "water",
  river: "river",
  road: "road",
  field: "field",
  stone: "stone",
  sand: "sand",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  forest: "Forest",
  village: "Village",
  lake: "Lake",
  river: "River",
  road: "Road",
  field: "Fields",
  stone: "Mountains",
  sand: "Desert",
};

/** Quest sizes per category (inclusive range, before the slow late-game growth). */
export const QUEST_RANGE: Record<Category, [number, number]> = {
  forest: [5, 9],
  village: [3, 6],
  lake: [4, 8],
  river: [4, 7],
  road: [4, 7],
  field: [3, 5],
  stone: [3, 5],
  sand: [3, 5],
};

/** The quest category a drawn tile can carry, if any. */
export function questCategoryFor(kind: Kind): Category | null {
  if (kind.village) return "village";
  switch (kind.family) {
    case "forest":
      return "forest";
    case "water":
      return "lake";
    case "river":
      return "river";
    case "road":
      return "road";
    case "field":
      return "field";
    case "stone":
      return "stone";
    case "sand":
      return "sand";
    default:
      return null;
  }
}
