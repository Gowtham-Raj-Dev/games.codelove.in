import { PIECES, TILE, DEFENDER_HALF, type AmmoKind, type DefenderKind, type PieceKind } from "./pieces";

/**
 * The castles. Each level is written in tiles (1 tile = 1.6 m) in castle space: x to the right as seen
 * from the trebuchet, z towards the trebuchet. Pieces are dropped in order and stack automatically on
 * whatever is already under them, so a tower is just its storeys listed bottom to top.
 */

export interface Region {
  name: string;
  /** Stars needed (over all levels) to open it. */
  stars: number;
  blurb: string;
}

export const REGIONS: Region[] = [
  { name: "Greenvale", stars: 0, blurb: "Orc outposts in the green hills" },
  { name: "Bone Marsh", stars: 8, blurb: "Skeleton forts in the misty fen" },
  { name: "Crown Citadel", stars: 18, blurb: "The king's stronghold at sunset" },
];

interface PieceOpts {
  /** Quarter turns around the vertical axis. */
  r?: number;
  flag?: boolean;
  banner?: boolean;
}

type PieceSpec = [kind: PieceKind, x: number, z: number, opts?: PieceOpts];
/** Defenders stand on the highest piece under them (below `maxY` tiles when given). */
type DefenderSpec = [kind: DefenderKind, x: number, z: number, maxY?: number];

export interface LevelDef {
  name: string;
  region: number;
  /** Metres from the trebuchet to the castle's origin. */
  distance: number;
  ammo: Partial<Record<AmmoKind, number>>;
  /** Shots for three stars. */
  par: number;
  tip?: string;
  pieces: PieceSpec[];
  defenders: DefenderSpec[];
}

/** A placed piece in metres (castle space; y is the bottom of the piece). */
export interface Placed {
  kind: PieceKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  flag: boolean;
  banner: boolean;
}

export interface PlacedDefender {
  kind: DefenderKind;
  x: number;
  y: number;
  z: number;
}

// --- Building helpers (tiles) ----------------------------------------------------------------------

const P = (kind: PieceKind, x: number, z: number, opts?: PieceOpts): PieceSpec => [kind, x, z, opts];

/** A square tower: base, `mids` middle storeys, then a cap. */
function tower(x: number, z: number, mids: number, cap: "roof" | "roofH" | "top" | "none" = "roof", flag = false): PieceSpec[] {
  const out: PieceSpec[] = [P("tbase", x, z)];
  for (let i = 0; i < mids; i++) out.push(P(i % 2 === 1 ? "tmidD" : "tmid", x, z));
  if (cap === "top") out.push(P("ttop", x, z, { flag }));
  else if (cap !== "none") out.push(P(cap, x, z, { flag }));
  return out;
}

/** A hexagon tower: `levels` bases, an optional battlement ring and roof. */
function hexTower(x: number, z: number, levels: number, cap: "roof" | "ring" | "both" = "ring"): PieceSpec[] {
  const out: PieceSpec[] = [];
  for (let i = 0; i < levels; i++) out.push(P("hex", x, z));
  if (cap === "ring" || cap === "both") out.push(P("hexMid", x, z));
  if (cap === "roof" || cap === "both") out.push(P("hexRoof", x, z));
  return out;
}

/** A row of wall blocks from x0 to x1 (whole tiles), `rows` high. */
function wallRow(x0: number, x1: number, z: number, rows = 1, banners = false): PieceSpec[] {
  const out: PieceSpec[] = [];
  for (let r = 0; r < rows; r++) {
    for (let x = x0; x <= x1; x++) out.push(P((x + r) % 3 === 0 ? "blockP" : "block", x, z, { banner: banners && r === rows - 1 && (x - x0) % 2 === 0 }));
  }
  return out;
}

/** A thin wall of slabs facing the trebuchet. */
function slabRow(x0: number, x1: number, z: number, rows = 1): PieceSpec[] {
  const out: PieceSpec[] = [];
  for (let r = 0; r < rows; r++) for (let x = x0; x <= x1; x++) out.push(P("slab", x, z, { r: 1 }));
  return out;
}

const D = (kind: DefenderKind, x: number, z: number, maxY?: number): DefenderSpec => [kind, x, z, maxY];

// --- Levels -----------------------------------------------------------------------------------------

export const LEVELS: LevelDef[] = [
  // Greenvale — orcs. -------------------------------------------------------------------------------
  {
    name: "Watchpost",
    region: 0,
    distance: 30,
    ammo: { boulder: 3 },
    par: 1,
    tip: "Drag back from the trebuchet and let go. Knock the orc off his perch!",
    pieces: [P("pillar", -0.95, 0), P("pillar", 0.95, 0), P("plank", 0, 0), P("crate", 2.1, 0.2), P("crate", -2.2, -0.4)],
    defenders: [D("orc", 0, 0)],
  },
  {
    name: "Stone Wall",
    region: 0,
    distance: 31,
    ammo: { boulder: 4 },
    par: 2,
    tip: "Walls topple backwards — crush whoever hides behind them.",
    pieces: [...wallRow(-1, 1, 0, 1, true), P("crate", -2.3, 0.15), P("pillar", 1.3, -1.8), P("pillar", 3.1, -1.8), P("plank", 2.2, -1.8)],
    defenders: [D("orc", 0, 0), D("orc", -0.4, -1.3), D("orc", 2.2, -1.8, 0.5)],
  },
  {
    name: "Twin Towers",
    region: 0,
    distance: 32,
    ammo: { boulder: 2, bomb: 2 },
    par: 2,
    tip: "Bombs explode on impact — press 2 (or tap the bomb) to load one.",
    pieces: [...tower(-1.6, 0, 1, "top", true), ...tower(1.6, 0, 1, "top", true), P("plankL", 0, 0), P("crate", 0.6, -0.8)],
    defenders: [D("orc", 0, 0), D("orc", -1.85, 0.05), D("orc", 1.85, 0.05), D("orc", -0.3, -0.7, 0.1)],
  },
  {
    name: "Gatehouse",
    region: 0,
    distance: 33,
    ammo: { boulder: 3, bomb: 2 },
    par: 3,
    tip: "Lob over the wall to reach the courtyard.",
    pieces: [
      ...wallRow(-2, -1, 0.6, 1, true),
      ...wallRow(1, 2, 0.6, 1, true),
      P("plank", 0, 0.6),
      P("crate", 0, 0.6),
      ...tower(0, -2.2, 1, "top", true),
      P("crate", -1.8, -1),
    ],
    defenders: [D("orc", -1.5, -0.9), D("orc", 1.5, -0.9), D("orc", 0, -2.2), D("orc", 2, 0.6)],
  },
  {
    name: "Greenvale Keep",
    region: 0,
    distance: 34,
    ammo: { boulder: 3, bomb: 2 },
    par: 2,
    tip: "Big towers fall far — aim high to topple them onto the guards.",
    pieces: [
      ...wallRow(-0.5, 0.5, -0.5, 2),
      ...wallRow(-0.5, 0.5, 0.5, 1),
      ...tower(0, -0.5, 1, "roofH", true),
      P("frame", -2.4, 0.2),
      P("frame", 2.4, 0.2),
      P("plank", -2.4, 0.2),
      P("plank", 2.4, 0.2),
      ...tower(-2.6, -2, 0, "roof", true),
      ...tower(2.6, -2, 0, "roof", true),
    ],
    defenders: [D("orc", -0.4, 0.5), D("orc", 0.5, 0.5), D("orc", -2.4, 0.2), D("orc", 2.4, 0.2), D("orc", 0.9, -0.5), D("orc", -1.5, -2.1)],
  },

  // Bone Marsh — skeletons, splitters and powder kegs. --------------------------------------------
  {
    name: "Powder Store",
    region: 1,
    distance: 31,
    ammo: { boulder: 3 },
    par: 1,
    tip: "Powder kegs blow up when hit — and set each other off.",
    pieces: [...wallRow(-2, 2, 1, 1), P("keg", -1.5, -0.4), P("keg", 0.4, -0.5), P("keg", 2.1, -0.3), P("keg", -0.4, -1.3)],
    defenders: [D("skeleton", -0.6, -0.4), D("skeleton", 1.3, -0.4), D("skeleton", 0, 1), D("skeleton", 0.6, -1.4)],
  },
  {
    name: "Three Spires",
    region: 1,
    distance: 32,
    ammo: { splitter: 2, boulder: 2 },
    par: 2,
    tip: "Splitter: tap again (or Space) in mid-air to split it into three.",
    pieces: [...hexTower(-2, 0, 1), ...hexTower(0, -0.4, 2), ...hexTower(2, 0, 1), P("crate", -1, 0.6), P("crate", 1.1, 0.7)],
    defenders: [D("skeleton", -2, 0), D("skeleton", 0, -0.4), D("skeleton", 2, 0)],
  },
  {
    name: "Crypt Rampart",
    region: 1,
    distance: 33,
    ammo: { splitter: 2, bomb: 1, boulder: 2 },
    par: 3,
    pieces: [
      ...wallRow(-3, 3, 0, 1, true),
      P("block", -1, 0),
      P("block", 0, 0),
      P("block", 1, 0),
      P("keg", 0, -1.2),
      P("crate", -2.2, -1.1),
      P("crate", 2.3, -1.2),
    ],
    defenders: [D("skeleton", -2.6, 0), D("skeleton", 0, 0), D("skeleton", 2.6, 0), D("skeleton", -1, -1.3), D("skeleton", 1.1, -1.3)],
  },
  {
    name: "Bone Bridge",
    region: 1,
    distance: 34,
    ammo: { boulder: 1, splitter: 1, bomb: 1 },
    par: 1,
    pieces: [
      P("pillar", -0.6, -0.1),
      P("pillar", 0.6, -0.1),
      P("plank", 0, -0.1),
      ...tower(-1.6, 0, 2, "top", true),
      ...tower(1.6, 0, 2, "top", true),
      P("plankL", 0, 0),
      P("keg", -0.45, 0),
    ],
    defenders: [D("skeleton", 0.5, 0), D("skeleton", -1.85, 0), D("skeleton", 1.85, 0), D("skeleton", 0, -0.1, 2)],
  },
  {
    name: "Marsh Fortress",
    region: 1,
    distance: 35,
    ammo: { boulder: 2, bomb: 2, splitter: 2 },
    par: 4,
    tip: "Knock the corner towers inwards onto the courtyard.",
    pieces: [
      ...slabRow(-2, 2, 1.6, 1),
      ...hexTower(-3.1, 1.6, 2, "ring"),
      ...hexTower(3.1, 1.6, 2, "ring"),
      ...tower(0, -1.6, 2, "top", true),
      ...wallRow(-3, -2, -1.6, 1),
      ...wallRow(2, 3, -1.6, 1),
      P("keg", -1.3, 0.2),
      P("keg", 1.2, 0),
      P("frame", -2.2, -0.4),
      P("frame", 2.2, -0.4),
    ],
    defenders: [
      D("skeleton", 0, -1.6),
      D("skeleton", -0.6, 0.2),
      D("skeleton", 0.8, 0.1),
      D("skeleton", -2.2, -0.4),
      D("skeleton", 2.2, -0.4),
      D("skeleton", -3.1, 1.6),
      D("skeleton", 3.1, 1.6),
      D("skeleton", -2.5, -1.6),
    ],
  },

  // Crown Citadel — knights (tougher) and orcs. ------------------------------------------------------
  {
    name: "Outer Bailey",
    region: 2,
    distance: 35,
    ammo: { boulder: 3, bomb: 2, splitter: 1 },
    par: 4,
    tip: "Knights wear armour — they take a harder hit.",
    pieces: [
      ...wallRow(-2, 2, 1.5, 1, true),
      ...wallRow(-2, 2, -1.5, 2),
      ...tower(-3.1, -1.5, 2, "roof", true),
      ...tower(3.1, -1.5, 2, "roof", true),
      ...tower(-3.1, 1.5, 0, "roof"),
      ...tower(3.1, 1.5, 0, "roof"),
      P("ballista", -1, -1.5),
      P("ballista", 1.2, -1.5),
      P("crate", 0, 0),
    ],
    defenders: [D("knight", -1.2, 0.1), D("knight", 1.2, 0.1), D("orc", 0, -1.5), D("knight", 2, -1.5), D("orc", 0.8, 1.5)],
  },
  {
    name: "High Tower",
    region: 2,
    distance: 35,
    ammo: { boulder: 3, bomb: 2 },
    par: 3,
    tip: "Hit a tall tower near the top and it falls like a tree.",
    pieces: [
      ...tower(0, -0.5, 3, "top", true),
      ...tower(-2.1, 0.2, 1, "top"),
      ...tower(2.1, 0.2, 1, "top"),
      P("crate", -1.05, 0.9),
      P("crate", 1.05, 0.9),
      P("keg", 0, -1.8),
    ],
    defenders: [D("knight", 0, -0.5), D("orc", -2.1, 0.2), D("orc", 2.1, 0.2), D("knight", -1, -1.4), D("knight", 1.1, -1.5)],
  },
  {
    name: "Ballista Ramparts",
    region: 2,
    distance: 36,
    ammo: { boulder: 3, splitter: 2, bomb: 1 },
    par: 4,
    pieces: [
      ...wallRow(-3, 3, 0, 1, true),
      ...hexTower(-4.2, 0, 2, "both"),
      ...hexTower(4.2, 0, 2, "both"),
      P("ballista", -2, 0),
      P("ballista", 0, 0),
      P("ballista", 2, 0),
      P("keg", -1, -1.2),
      P("keg", 1.2, -1.3),
      ...tower(0, -2.6, 1, "roofH", true),
    ],
    defenders: [D("knight", -1, 0), D("knight", 1, 0), D("orc", -2.2, -1.3), D("orc", 0, -1.4), D("orc", 2.3, -1.4), D("knight", 0.95, -2.6)],
  },
  {
    name: "Crown Citadel",
    region: 2,
    distance: 38,
    ammo: { boulder: 3, bomb: 3, splitter: 2 },
    par: 5,
    tip: "The king's keep. Bring it all down!",
    pieces: [
      // Front wall with a gate, corner towers.
      ...wallRow(-3, -1, 2.2, 1, true),
      ...wallRow(1, 3, 2.2, 1, true),
      P("plank", 0, 2.2),
      P("crate", 0, 2.2),
      ...tower(-4.1, 2.2, 1, "roof", true),
      ...tower(4.1, 2.2, 1, "roof", true),
      // Side walls and the back wall with tall towers.
      ...[1.2, 0.2, -0.8].flatMap((z) => [P("block", -4.1, z), P("block", 4.1, z)]),
      ...tower(-4.1, -1.8, 2, "roofH", true),
      ...tower(4.1, -1.8, 2, "roofH", true),
      ...wallRow(-3, 3, -1.8, 1),
      // The keep.
      ...wallRow(-0.5, 0.5, -0.9, 2),
      ...wallRow(-0.5, 0.5, 0.1, 2),
      ...tower(0, -0.4, 1, "roofH", true),
      // Courtyard.
      P("keg", -2.2, 0.9),
      P("keg", 2.3, 0.8),
      P("frame", -2.4, -0.6),
      P("frame", 2.4, -0.6),
      P("plank", -2.4, -0.6),
      P("plank", 2.4, -0.6),
    ],
    defenders: [
      D("knight", -0.75, 0.35),
      D("knight", 0.75, 0.35),
      D("knight", -2, 2.2),
      D("knight", 2, 2.2),
      D("orc", -2.4, -0.6),
      D("orc", 2.4, -0.6),
      D("orc", -1.5, 1.1),
      D("orc", 1.6, 1.2),
      D("orc", -2, -1.8),
      D("orc", 2, -1.8),
    ],
  },
];

export const ammoTotal = (level: LevelDef) => Object.values(level.ammo).reduce((n, c) => n + (c ?? 0), 0);

/** Stars for clearing a level having fired `used` shots. */
export const starsFor = (level: LevelDef, used: number) => (used <= level.par ? 3 : used <= level.par + 1 ? 2 : 1);

// --- Layout (auto stacking) -----------------------------------------------------------------------

interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
}

function footprint(kind: PieceKind, x: number, z: number, quarter: number) {
  const [sx, , sz] = PIECES[kind].size;
  const turned = quarter % 2 === 1;
  const hx = (turned ? sz : sx) / 2;
  const hz = (turned ? sx : sz) / 2;
  return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
}

function supportAt(stack: Footprint[], f: { x0: number; x1: number; z0: number; z1: number }, maxY = Infinity) {
  const e = 0.03;
  let y = 0;
  for (const s of stack) {
    if (s.top <= maxY && f.x1 - e > s.x0 && f.x0 + e < s.x1 && f.z1 - e > s.z0 && f.z0 + e < s.z1) y = Math.max(y, s.top);
  }
  return y;
}

/** Turns a level into placed pieces and defenders (metres, castle space). */
export function layout(level: LevelDef): { pieces: Placed[]; defenders: PlacedDefender[] } {
  const stack: Footprint[] = [];
  const pieces: Placed[] = [];
  for (const [kind, tx, tz, opts] of level.pieces) {
    const x = tx * TILE;
    const z = tz * TILE;
    const quarter = opts?.r ?? 0;
    const f = footprint(kind, x, z, quarter);
    const y = supportAt(stack, f);
    const def = PIECES[kind];
    const h = "bodyHeight" in def && def.bodyHeight ? def.bodyHeight : def.size[1];
    stack.push({ ...f, top: y + h });
    pieces.push({ kind, x, y, z, yaw: (quarter * Math.PI) / 2, flag: !!opts?.flag, banner: !!opts?.banner });
  }
  const defenders = level.defenders.map(([kind, tx, tz, maxY]) => {
    const x = tx * TILE;
    const z = tz * TILE;
    const f = { x0: x - DEFENDER_HALF.x, x1: x + DEFENDER_HALF.x, z0: z - DEFENDER_HALF.z, z1: z + DEFENDER_HALF.z };
    const y = supportAt(stack, f, maxY === undefined ? Infinity : maxY * TILE);
    return { kind, x, y, z };
  });
  return { pieces, defenders };
}
