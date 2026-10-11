/**
 * Turbo Karts shop: what coins buy. Karts and cups are unlocked once (their prices are with them, in
 * manifest.ts and tracks.ts); each kart has its own four upgrade tracks; designs are bought once and
 * fit every kart. Pure numbers (no three.js) — the engine applies them to the player's kart.
 */

export const UPGRADES = [
  { id: "engine", name: "Engine", blurb: "Top speed" },
  { id: "accel", name: "Gearbox", blurb: "Acceleration" },
  { id: "tyres", name: "Tyres", blurb: "Steering & grip" },
  { id: "turbo", name: "Turbo", blurb: "Longer boosts" },
] as const;

export type UpgradeId = (typeof UPGRADES)[number]["id"];
/** Levels bought per upgrade, in UPGRADES order. */
export type Tune = [number, number, number, number];

export const MAX_LEVEL = 5;
/** Price of the next level (index = level you have now). */
export const UPGRADE_COST = [40, 90, 160, 250, 360];
export const NO_TUNE: Tune = [0, 0, 0, 0];

/** What each level adds to the kart's handling numbers. */
export const TUNE_STEP = { top: 0.011, accel: 0.04, turn: 0.022, boost: 0.07 };

export const upgradeCost = (level: number) => (level >= MAX_LEVEL ? null : UPGRADE_COST[level]);

export interface Skin {
  id: string;
  name: string;
  cost: number;
  /** Paint tint over the kart body (null = factory paint). */
  tint: string | null;
  /** Glow, for the fancy ones. */
  glow?: string;
  /** Boost flame colours. */
  flame?: string;
}

export const SKINS: Skin[] = [
  { id: "stock", name: "Factory", cost: 0, tint: null },
  { id: "cherry", name: "Cherry", cost: 40, tint: "#ff8f8f" },
  { id: "lime", name: "Lime", cost: 40, tint: "#b6f58a" },
  { id: "ocean", name: "Ocean", cost: 40, tint: "#8fc8ff" },
  { id: "candy", name: "Candy", cost: 60, tint: "#ff9fd6", flame: "#ff5cc8" },
  { id: "grape", name: "Grape", cost: 60, tint: "#c9a2ff" },
  { id: "sunset", name: "Sunset", cost: 80, tint: "#ffb877", flame: "#ff5c8a" },
  { id: "ice", name: "Ice", cost: 100, tint: "#d6f4ff", glow: "#3aa0c8", flame: "#7dd3fc" },
  { id: "stealth", name: "Stealth", cost: 120, tint: "#6b7280", flame: "#60a5fa" },
  { id: "toxic", name: "Toxic", cost: 160, tint: "#c8ff5a", glow: "#3f9a00", flame: "#a3e635" },
  { id: "lava", name: "Lava", cost: 200, tint: "#ff7a45", glow: "#b32400", flame: "#ff3d00" },
  { id: "neon", name: "Neon", cost: 240, tint: "#9dffe9", glow: "#12d6b0", flame: "#22d3ee" },
  { id: "royal", name: "Royal", cost: 300, tint: "#b79cff", glow: "#5b21b6", flame: "#fde047" },
  { id: "gold", name: "Gold", cost: 400, tint: "#ffd766", glow: "#b8860b", flame: "#fde047" },
];

export const skinIndex = (id: string) => Math.max(0, SKINS.findIndex((s) => s.id === id));

/** Coins paid out for a finishing place (1-based). */
export const PLACE_COINS = [30, 20, 14, 10, 6, 4];
/** Bonus for the cup trophy (overall place 1..3). */
export const CUP_COINS = [60, 35, 20];

export function raceCoins(place: number, collected: number) {
  return (PLACE_COINS[place - 1] ?? 3) + collected;
}
