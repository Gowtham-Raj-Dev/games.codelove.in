/**
 * Siege Smash building blocks: every castle piece, defender and projectile, with the library model it
 * is drawn with and the physics it gets. Sizes are metres in the game world. No three.js here.
 */

/** Castle Kit models are 1 unit per tile; the game builds with 1.6 m tiles. */
export const TILE = 1.6;

export type Material = "stone" | "wood" | "roof" | "powder";

/** Physics shape: a box, an n-sided prism / pyramid frustum (roofs, hexagon towers, barrels). */
export type ShapeDef = { type: "box" } | { type: "prism"; sides: number; top: number };

export interface PieceDef {
  model: string;
  /** World size (x, y, z) the model is stretched to; the physics shape matches it. */
  size: [number, number, number];
  shape: ShapeDef;
  material: Material;
  /** Damage the piece takes before it shatters (impulse units, see engine). */
  hp: number;
  /** Mass per cubic metre of its bounds. */
  density: number;
  score: number;
  /** Physics box height when it differs from the drawn size (crenellated tops). */
  bodyHeight?: number;
  /** A replacement model shown (without physics) once the piece is wrecked. */
  wreck?: string;
}

export const MODEL = {
  trebuchet: "castle-kit/siege-trebuchet",
  boulder: "tower-defense-kit/weapon-ammo-boulder",
  bomb: "platformer-kit/bomb",
  splitter: "tower-defense-kit/weapon-ammo-cannonball",
  orc: "mini-dungeon/character-orc",
  skeleton: "graveyard-kit/character-skeleton",
  knight: "mini-dungeon/character-human",
  flag: "castle-kit/flag-pennant",
  flagWide: "castle-kit/flag-wide",
  banner: "castle-kit/flag-banner-short",
  bannerLong: "castle-kit/flag-banner-long",
  catapult: "castle-kit/siege-catapult",
  ram: "castle-kit/siege-ram",
  siegeTower: "castle-kit/siege-tower",
  treeLarge: "castle-kit/tree-large",
  treeSmall: "castle-kit/tree-small",
  rocksLarge: "castle-kit/rocks-large",
  rocksSmall: "castle-kit/rocks-small",
  trunk: "castle-kit/tree-trunk",
} as const;

const T = TILE;

export const PIECES = {
  /** Crenellated stone wall block. */
  block: { model: "castle-kit/wall", size: [T, T * 1.31, T], shape: { type: "box" }, material: "stone", hp: 46, density: 0.62, score: 500 },
  blockP: { model: "castle-kit/wall-pillar", size: [T, T * 1.31, T], shape: { type: "box" }, material: "stone", hp: 46, density: 0.62, score: 500 },
  /** Half-thickness wall (thin along x; turn it with r: 1). */
  slab: { model: "castle-kit/wall-narrow", size: [T / 2, T * 1.31, T], shape: { type: "box" }, material: "stone", hp: 32, density: 0.62, score: 400 },
  doorway: { model: "castle-kit/wall-doorway", size: [T / 2, T * 1.31, T], shape: { type: "box" }, material: "stone", hp: 28, density: 0.55, score: 400 },
  /** Thin stone post. */
  pillar: { model: "castle-kit/wall-stud", size: [0.42, T * 1.31, 0.42], shape: { type: "box" }, material: "stone", hp: 14, density: 0.8, score: 250 },
  /** Wooden plank (drawbridge deck), long along x. */
  plank: { model: "castle-kit/bridge-draw", size: [T * 2.1, 0.22, T * 0.8], shape: { type: "box" }, material: "wood", hp: 5, density: 0.55, score: 250 },
  plankL: { model: "castle-kit/bridge-draw", size: [T * 3.1, 0.22, T * 0.8], shape: { type: "box" }, material: "wood", hp: 5.5, density: 0.5, score: 300 },
  /** Log beam, long along x. */
  log: { model: "castle-kit/tree-log", size: [T * 2.1, 0.42, 0.42], shape: { type: "box" }, material: "wood", hp: 9, density: 0.6, score: 250 },
  tbase: { model: "castle-kit/tower-square-base", size: [T, T * 1.01, T], shape: { type: "box" }, material: "stone", hp: 50, density: 0.6, score: 500 },
  tmid: { model: "castle-kit/tower-square-mid-windows", size: [T * 0.93, T * 1.01, T * 0.93], shape: { type: "box" }, material: "stone", hp: 40, density: 0.55, score: 500 },
  tmidD: { model: "castle-kit/tower-square-mid-door", size: [T * 0.93, T * 1.01, T * 0.93], shape: { type: "box" }, material: "stone", hp: 40, density: 0.55, score: 500 },
  ttop: { model: "castle-kit/tower-square-top", size: [T, T * 0.3, T], shape: { type: "box" }, material: "stone", hp: 26, density: 0.6, score: 300, bodyHeight: T * 0.3 },
  roof: { model: "castle-kit/tower-square-top-roof", size: [T, T, T], shape: { type: "prism", sides: 4, top: 0.08 }, material: "roof", hp: 22, density: 0.7, score: 400 },
  roofH: { model: "castle-kit/tower-square-top-roof-high", size: [T, T * 1.35, T], shape: { type: "prism", sides: 4, top: 0.06 }, material: "roof", hp: 22, density: 0.7, score: 400 },
  hex: { model: "castle-kit/tower-hexagon-base", size: [T * 0.9, T * 1.31, T * 0.78], shape: { type: "prism", sides: 6, top: 1 }, material: "stone", hp: 40, density: 0.6, score: 500 },
  hexMid: { model: "castle-kit/tower-hexagon-mid", size: [T * 0.952, T * 0.46, T * 0.825], shape: { type: "prism", sides: 6, top: 1 }, material: "stone", hp: 26, density: 0.6, score: 300 },
  hexRoof: { model: "castle-kit/tower-hexagon-roof", size: [T * 0.976, T * 0.83, T * 0.846], shape: { type: "prism", sides: 6, top: 0.08 }, material: "roof", hp: 20, density: 0.7, score: 400 },
  /** Wooden scaffold cube. */
  frame: { model: "castle-kit/tower-square-mid-open", size: [T * 0.93, T * 1.01, T * 0.93], shape: { type: "box" }, material: "wood", hp: 12, density: 0.22, score: 300 },
  crate: { model: "platformer-kit/crate", size: [1, 1, 1], shape: { type: "box" }, material: "wood", hp: 5, density: 0.35, score: 150 },
  /** Powder keg: explodes when hit. */
  keg: { model: "mini-dungeon/barrel", size: [1.05, 1, 1.05], shape: { type: "prism", sides: 8, top: 1 }, material: "powder", hp: 2.5, density: 0.4, score: 300 },
  /** The defenders' own ballista — wreck it for a bonus. */
  ballista: {
    model: "castle-kit/siege-ballista",
    size: [T * 1.05, T * 0.59, T * 0.77],
    shape: { type: "box" },
    material: "wood",
    hp: 7,
    density: 0.3,
    score: 2000,
    wreck: "castle-kit/siege-ballista-demolished",
  },
} satisfies Record<string, PieceDef>;

export type PieceKind = keyof typeof PIECES;

// --- Defenders --------------------------------------------------------------------------------------

export type DefenderKind = "orc" | "skeleton" | "knight";

export interface DefenderDef {
  model: string;
  name: string;
  height: number;
  /** Hits it can take (impulse units). */
  hp: number;
}

export const DEFENDERS: Record<DefenderKind, DefenderDef> = {
  orc: { model: MODEL.orc, name: "Orc", height: 1.45, hp: 1.6 },
  skeleton: { model: MODEL.skeleton, name: "Skeleton", height: 1.45, hp: 1.2 },
  knight: { model: MODEL.knight, name: "Knight", height: 1.45, hp: 2.6 },
};

/** Physics box of a defender (half extents). */
export const DEFENDER_HALF = { x: 0.32, y: 0.69, z: 0.26 };
export const DEFENDER_MASS = 0.5;
export const DEFENDER_SCORE = 5000;

// --- Ammo -------------------------------------------------------------------------------------------

export type AmmoKind = "boulder" | "bomb" | "splitter";

export interface AmmoDef {
  model: string;
  name: string;
  hint: string;
  radius: number;
  mass: number;
}

export const AMMO: Record<AmmoKind, AmmoDef> = {
  boulder: { model: MODEL.boulder, name: "Boulder", hint: "Heavy — smashes stone", radius: 0.46, mass: 6 },
  bomb: { model: MODEL.bomb, name: "Bomb", hint: "Explodes on impact", radius: 0.44, mass: 3 },
  splitter: { model: MODEL.splitter, name: "Splitter", hint: "Tap again to split in three", radius: 0.4, mass: 4.5 },
};

export const AMMO_ORDER: AmmoKind[] = ["boulder", "bomb", "splitter"];
export const SPLIT_RADIUS = 0.28;
export const SPLIT_MASS = 2.2;
