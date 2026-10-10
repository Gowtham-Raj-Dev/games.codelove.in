/**
 * Saucer Siege rules: maps, towers, saucers and waves. Plain data and maths — no three.js — so the
 * numbers are easy to tune in one place.
 */

// --- Maps ---------------------------------------------------------------------------------------

export type Theme = "grass" | "snow";

export interface MapDef {
  id: string;
  name: string;
  difficulty: "Easy" | "Medium" | "Hard";
  blurb: string;
  theme: Theme;
  /**
   * One string per row (z), one char per cell (x):
   *   .  grass — you can build here      #  road         S  saucer portal (road start)
   *   E  crystal keep (road end)          =  bridge (road over the river)   ~  river
   *   T  trees    R  rocks    C  crystals    H  hill    o  grass with small details (no building)
   */
  layout: string[];
  waves: number;
  gold: number;
  lives: number;
  /** Saucer health multiplier. */
  hp: number;
  /** First wave with beam saucers. */
  beamFrom: number;
}

export const MAPS: MapDef[] = [
  {
    id: "meadow",
    name: "Greenwood Meadow",
    difficulty: "Easy",
    blurb: "A long, winding road through quiet farmland. Learn the ropes.",
    theme: "grass",
    layout: [
      "TT...TT....TT.TT",
      "S###..........RT",
      "...#.......###E.",
      ".T.#..####.#....",
      "...#..#..#.#..C.",
      "...####..#.#....",
      "T...o....#.#...T",
      "TT.......###...T",
      "TTH......o.....T",
      "TTT...R....TTTTT",
    ],
    waves: 15,
    gold: 240,
    lives: 20,
    hp: 0.95,
    beamFrom: 7,
  },
  {
    id: "riverford",
    name: "Riverford",
    difficulty: "Medium",
    blurb: "The road crosses the river twice. Guard both bridges.",
    theme: "grass",
    layout: [
      "TT.....~....TTTT",
      "T......~......HT",
      "S######=####...T",
      ".R.....~...#....",
      ".......~...#..C.",
      ".E###..~...#...T",
      "....#..~.###...T",
      "T...#..~.#......",
      "TT..###=##.....T",
      "TTT....~....TTTT",
    ],
    waves: 18,
    gold: 260,
    lives: 20,
    hp: 1.08,
    beamFrom: 6,
  },
  {
    id: "frost",
    name: "Frost Pass",
    difficulty: "Hard",
    blurb: "Two portals, one frozen pass. Saucers come from both sides.",
    theme: "snow",
    layout: [
      "TTS.TTT..R..TTTT",
      "T.#..........CTT",
      "..#..####......T",
      "..#..#..#..###..",
      "..####..#..#.#..",
      "T.......#..#.#.T",
      "S###########.#..",
      "..C..R.......#.T",
      "TT...........E.T",
      "TTTT...H...TTTTT",
    ],
    waves: 20,
    gold: 300,
    lives: 20,
    hp: 1.05,
    beamFrom: 5,
  },
];

// --- Towers -------------------------------------------------------------------------------------

export type TowerKind = "ballista" | "cannon" | "catapult" | "turret";

export interface TowerLevel {
  damage: number;
  /** Shots per second. */
  rate: number;
  /** Tiles. */
  range: number;
  /** Splash radius in tiles (0 = single target). */
  splash: number;
}

export interface TowerDef {
  kind: TowerKind;
  name: string;
  hotkey: string;
  blurb: string;
  cost: number;
  /** Cost of level 2 and level 3. */
  upgrades: [number, number];
  levels: [TowerLevel, TowerLevel, TowerLevel];
  /** Projectile speed (tiles/s) for straight shots, flight time (s) for arcing ones. */
  speed: number;
  arc: number;
}

export const TOWER_KINDS: TowerKind[] = ["ballista", "cannon", "catapult", "turret"];

export const TOWERS: Record<TowerKind, TowerDef> = {
  ballista: {
    kind: "ballista",
    name: "Ballista",
    hotkey: "1",
    blurb: "Fast, accurate bolts",
    cost: 60,
    upgrades: [70, 120],
    levels: [
      { damage: 15, rate: 1.25, range: 2.7, splash: 0 },
      { damage: 27, rate: 1.4, range: 3.0, splash: 0 },
      { damage: 46, rate: 1.6, range: 3.3, splash: 0 },
    ],
    speed: 15,
    arc: 0,
  },
  cannon: {
    kind: "cannon",
    name: "Cannon",
    hotkey: "2",
    blurb: "Splash damage",
    cost: 90,
    upgrades: [100, 170],
    levels: [
      { damage: 24, rate: 0.7, range: 2.4, splash: 0.85 },
      { damage: 42, rate: 0.78, range: 2.6, splash: 0.95 },
      { damage: 70, rate: 0.86, range: 2.8, splash: 1.1 },
    ],
    speed: 0.5,
    arc: 0.9,
  },
  catapult: {
    kind: "catapult",
    name: "Catapult",
    hotkey: "3",
    blurb: "Huge range & splash",
    cost: 130,
    upgrades: [140, 220],
    levels: [
      { damage: 55, rate: 0.3, range: 4.3, splash: 1.25 },
      { damage: 95, rate: 0.34, range: 4.7, splash: 1.4 },
      { damage: 160, rate: 0.38, range: 5.1, splash: 1.6 },
    ],
    speed: 1.05,
    arc: 2.4,
  },
  turret: {
    kind: "turret",
    name: "Turret",
    hotkey: "4",
    blurb: "Rapid fire, weak vs armour",
    cost: 110,
    upgrades: [120, 190],
    levels: [
      { damage: 5, rate: 5.5, range: 2.3, splash: 0 },
      { damage: 8, rate: 6.5, range: 2.5, splash: 0 },
      { damage: 12.5, rate: 7.5, range: 2.7, splash: 0 },
    ],
    speed: 22,
    arc: 0,
  },
};

export const SELL_REFUND = 0.7;

export function invested(kind: TowerKind, level: number) {
  const d = TOWERS[kind];
  return d.cost + d.upgrades.slice(0, level).reduce((a, b) => a + b, 0);
}

export const sellValue = (kind: TowerKind, level: number) => Math.floor(invested(kind, level) * SELL_REFUND);

/** Armour soaks a flat amount per hit, but every hit does at least a quarter of its damage. */
export const applyArmor = (damage: number, armor: number) => Math.max(damage * 0.25, damage - armor);

// --- Saucers ------------------------------------------------------------------------------------

export type SaucerKind = "scout" | "standard" | "armored" | "beam" | "boss";

export interface SaucerDef {
  kind: SaucerKind;
  name: string;
  hp: number;
  /** Tiles per second. */
  speed: number;
  armor: number;
  gold: number;
  /** Lives lost when it reaches the keep. */
  leak: number;
  /** Model width in tiles. */
  size: number;
  /** Hover height above the road. */
  hover: number;
}

export const SAUCERS: Record<SaucerKind, SaucerDef> = {
  scout: { kind: "scout", name: "Scout", hp: 26, speed: 1.75, armor: 0, gold: 4, leak: 1, size: 0.56, hover: 1.0 },
  standard: { kind: "standard", name: "Saucer", hp: 60, speed: 1.05, armor: 0, gold: 6, leak: 1, size: 0.7, hover: 1.08 },
  armored: { kind: "armored", name: "Armoured saucer", hp: 160, speed: 0.72, armor: 4, gold: 13, leak: 2, size: 0.8, hover: 1.12 },
  beam: { kind: "beam", name: "Beam saucer", hp: 120, speed: 0.92, armor: 1, gold: 15, leak: 2, size: 0.74, hover: 1.4 },
  boss: { kind: "boss", name: "Mothership", hp: 640, speed: 0.42, armor: 4, gold: 120, leak: 6, size: 1.6, hover: 1.75 },
};

export const BEAM = { range: 2.6, cooldown: 6.5, charge: 0.6, freeze: 3.2 };

/** Health multiplier for wave `w` (1-based). */
export const waveHp = (map: MapDef, w: number) => map.hp * (1 + 0.1 * (w - 1) + 0.015 * (w - 1) ** 2);

// --- Waves --------------------------------------------------------------------------------------

export interface SpawnGroup {
  kind: SaucerKind;
  count: number;
  /** Seconds between saucers. */
  gap: number;
  /** Seconds before the group starts, after the previous group started. */
  delay: number;
}

/** The saucers of wave `w` (1-based). Hand-tuned openers, then a formula that mixes every type. */
export function buildWave(map: MapDef, w: number): SpawnGroup[] {
  const hard = MAPS.indexOf(map);
  const g = (kind: SaucerKind, count: number, gap: number, delay: number): SpawnGroup => ({ kind, count: Math.max(1, Math.round(count)), gap, delay });
  if (w === 1) return [g("standard", 6 + hard, 1.5, 0)];
  if (w === 2) return [g("standard", 8 + hard, 1.2, 0)];
  if (w === 3) return [g("standard", 6, 1.2, 0), g("scout", 6 + hard, 0.5, 8)];
  if (w === 4) return [g("standard", 8, 1.0, 0), g("armored", 2 + hard, 2.2, 6)];

  const waves: SpawnGroup[] = [];
  const beams = w >= map.beamFrom ? 1 + Math.floor((w - map.beamFrom) / 4) : 0;
  if (w % 5 === 0) {
    const bosses = w >= 20 ? 2 : 1;
    waves.push(g("standard", 4 + w * 0.4, 0.9, 0));
    waves.push(g("boss", bosses, 9, 3));
    waves.push(g("scout", 4 + w * 0.3, 0.45, 6));
    if (beams) waves.push(g("beam", beams, 3, 4));
    return waves;
  }
  const t = w % 3;
  waves.push(g("standard", 5 + w * 0.7, Math.max(0.55, 1.2 - w * 0.035), 0));
  if (t === 0 || w > 10) waves.push(g("scout", 5 + w * 0.6, 0.4, 5));
  waves.push(g("armored", 1 + (w - 3) * 0.38, Math.max(1.1, 2.2 - w * 0.06), t === 1 ? 2 : 6));
  if (beams) waves.push(g("beam", beams, 2.6, 4));
  if (t === 2) waves.push(g("standard", 3 + w * 0.4, 0.5, 5));
  return waves;
}

/** Gold for clearing wave `w`. */
export const waveBonus = (w: number) => 20 + w * 4;

/** Seconds before the next wave starts by itself. */
export const BREAK_FIRST = 30;
export const BREAK = 14;

/** Bonus gold for calling the next wave early, per second left on the clock. */
export const earlyBonus = (secondsLeft: number, w: number) => Math.round(secondsLeft * (0.8 + w * 0.08));

/** Stars for a won map: 3 = at most 2 lives lost, 2 = half or more left, 1 = survived. */
export const starsFor = (lives: number, max: number) => (lives >= max - 2 ? 3 : lives >= max / 2 ? 2 : 1);
