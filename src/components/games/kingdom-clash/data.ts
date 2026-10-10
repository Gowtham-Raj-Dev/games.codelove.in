/**
 * Kingdom Clash — game rules: buildings, troops, spells and raiders with their stats per level,
 * Town Hall gating and costs. Pure data (no three.js, no DOM) so the economy and battle can be
 * simulated headlessly.
 */

/** The village is GRID × GRID tiles. */
export const GRID = 36;
/** Battles add a deploy margin of grass around the village. */
export const MARGIN = 4;
export const MAX_TH = 5;

export type Res = "gold" | "elixir" | "gems";

export type BKind =
  | "townhall"
  | "goldmine"
  | "elixirpump"
  | "goldstorage"
  | "elixirstorage"
  | "builder"
  | "barracks"
  | "camp"
  | "lab"
  | "spellfactory"
  | "kingaltar"
  | "queenaltar"
  | "cannon"
  | "archertower"
  | "catapult"
  | "magetower"
  | "tesla"
  | "wall"
  | "bomb"
  | "skeltrap";

export type Category = "resources" | "army" | "defence" | "walls";

export interface AttackDef {
  range: number;
  minRange?: number;
  /** Damage per shot per level. */
  damage: number[];
  /** Seconds between shots. */
  interval: number;
  /** Splash radius (tiles). */
  splash?: number;
  projectile: "cannonball" | "arrow" | "boulder" | "bolt" | "zap";
  /** Tiles per second (boulders arc). */
  speed: number;
  /** Shocks (Hidden Tesla): how many more troops the bolt jumps on to, per level (half damage each). */
  chain?: number[];
}

export interface BDef {
  kind: BKind;
  name: string;
  size: number;
  category: Category;
  /** Currency for building and upgrading. */
  res: Res;
  /** Cost per level (index 0 = build cost). */
  cost: number[];
  /** Build / upgrade seconds per level. */
  time: number[];
  hp: number[];
  /** How many you may own at Town Hall 1..5. */
  counts: number[];
  maxLevel: number;
  desc: string;
  /** Collectors: resource made per minute and how much they hold. */
  produces?: "gold" | "elixir";
  rate?: number[];
  hold?: number[];
  /** Storages (and the Town Hall): capacity per level. */
  stores?: "gold" | "elixir" | "both";
  capacity?: number[];
  housing?: number[];
  slots?: number[];
  attack?: AttackDef;
  /** Traps: a bomb (damage) or a skeleton trap (spawns skeletons that fight). */
  trap?: { damage: number[]; radius: number; trigger: number; spawn?: number[] };
  /** Hero altars: the hero who lives here (the altar's level is the hero's level). */
  hero?: HeroKind;
  /** Hidden defences (Hidden Tesla): underground in battle until a troop comes this close (tiles from its centre). */
  hidden?: number;
}

const L5 = [1, 1, 1, 1, 1];

export const BUILDINGS: Record<BKind, BDef> = {
  townhall: {
    kind: "townhall",
    name: "Town Hall",
    size: 4,
    category: "resources",
    res: "gold",
    cost: [0, 1000, 4500, 14000, 32000],
    time: [0, 20, 60, 120, 180],
    hp: [1500, 1900, 2400, 3000, 3800],
    counts: L5,
    maxLevel: 5,
    stores: "both",
    capacity: [1500, 3000, 6000, 12000, 20000],
    desc: "The heart of your village. Upgrading it unlocks new buildings, more copies and higher levels for everything else.",
  },
  goldmine: {
    kind: "goldmine",
    name: "Gold Mine",
    size: 3,
    category: "resources",
    res: "elixir",
    cost: [150, 500, 1500, 4000, 9000],
    time: [6, 20, 45, 80, 120],
    hp: [400, 460, 530, 610, 700],
    counts: [1, 2, 3, 4, 5],
    maxLevel: 5,
    produces: "gold",
    rate: [40, 70, 110, 160, 220],
    hold: [500, 1200, 2500, 4500, 8000],
    desc: "Digs gold out of the hillside. Tap it to collect.",
  },
  elixirpump: {
    kind: "elixirpump",
    name: "Elixir Collector",
    size: 3,
    category: "resources",
    res: "gold",
    cost: [150, 500, 1500, 4000, 9000],
    time: [6, 20, 45, 80, 120],
    hp: [400, 460, 530, 610, 700],
    counts: [1, 2, 3, 4, 5],
    maxLevel: 5,
    produces: "elixir",
    rate: [40, 70, 110, 160, 220],
    hold: [500, 1200, 2500, 4500, 8000],
    desc: "Pumps glowing elixir from the ley lines. Tap it to collect.",
  },
  goldstorage: {
    kind: "goldstorage",
    name: "Gold Storage",
    size: 3,
    category: "resources",
    res: "elixir",
    cost: [300, 1000, 3000, 8000, 18000],
    time: [8, 25, 50, 90, 140],
    hp: [600, 750, 900, 1100, 1350],
    counts: [1, 1, 2, 2, 3],
    maxLevel: 5,
    stores: "gold",
    capacity: [2000, 5000, 10000, 20000, 40000],
    desc: "Keeps your gold safe — and raises how much you can hold.",
  },
  elixirstorage: {
    kind: "elixirstorage",
    name: "Elixir Storage",
    size: 3,
    category: "resources",
    res: "gold",
    cost: [300, 1000, 3000, 8000, 18000],
    time: [8, 25, 50, 90, 140],
    hp: [600, 750, 900, 1100, 1350],
    counts: [1, 1, 2, 2, 3],
    maxLevel: 5,
    stores: "elixir",
    capacity: [2000, 5000, 10000, 20000, 40000],
    desc: "A giant flask of elixir. Raises how much elixir you can hold.",
  },
  builder: {
    kind: "builder",
    name: "Builder's Hut",
    size: 2,
    category: "resources",
    res: "gold",
    cost: [0],
    time: [0],
    hp: [250],
    counts: [2, 2, 3, 3, 4],
    maxLevel: 1,
    desc: "Home of a builder. Every builder works on one construction at a time.",
  },
  barracks: {
    kind: "barracks",
    name: "Barracks",
    size: 3,
    category: "army",
    res: "elixir",
    cost: [200, 800, 2500, 6000, 14000],
    time: [8, 25, 50, 90, 140],
    hp: [350, 420, 500, 600, 720],
    counts: [1, 1, 2, 2, 3],
    maxLevel: 5,
    desc: "Trains troops. Each level unlocks a new troop type; more barracks train faster.",
  },
  camp: {
    kind: "camp",
    name: "Army Camp",
    size: 4,
    category: "army",
    res: "elixir",
    cost: [250, 1000, 3000, 7000, 15000],
    time: [8, 25, 50, 90, 140],
    hp: [300, 360, 430, 510, 600],
    counts: [1, 1, 2, 2, 3],
    maxLevel: 5,
    housing: [20, 25, 30, 35, 40],
    desc: "Trained troops rest here. Each level houses more troops.",
  },
  lab: {
    kind: "lab",
    name: "Laboratory",
    size: 3,
    category: "army",
    res: "elixir",
    cost: [1500, 3000, 6500, 13000, 24000],
    time: [15, 40, 70, 110, 160],
    hp: [500, 560, 630, 710, 800],
    counts: [0, 1, 1, 1, 1],
    maxLevel: 5,
    desc: "Researches stronger troops and spells. Troops and spells can reach the Laboratory's level.",
  },
  spellfactory: {
    kind: "spellfactory",
    name: "Spell Factory",
    size: 3,
    category: "army",
    res: "elixir",
    cost: [4000, 7000, 12000, 20000, 30000],
    time: [25, 50, 80, 120, 170],
    hp: [425, 470, 520, 580, 650],
    counts: [0, 0, 1, 1, 1],
    maxLevel: 5,
    slots: [2, 3, 4, 5, 6],
    desc: "Brews battle spells. Each level holds one more spell and unlocks a new one.",
  },
  kingaltar: {
    kind: "kingaltar",
    name: "King's Altar",
    size: 3,
    category: "army",
    res: "elixir",
    cost: [5000, 9000, 15000, 23000, 33000],
    time: [30, 70, 110, 150, 180],
    hp: [700, 800, 900, 1000, 1100],
    counts: [0, 0, 1, 1, 1],
    maxLevel: 5,
    hero: "king",
    desc: "Home of the Axe King. Upgrading the altar levels up the King — while he trains he can't fight.",
  },
  queenaltar: {
    kind: "queenaltar",
    name: "Queen's Altar",
    size: 3,
    category: "army",
    res: "elixir",
    cost: [9000, 14000, 21000, 30000, 42000],
    time: [40, 80, 120, 160, 180],
    hp: [700, 800, 900, 1000, 1100],
    counts: [0, 0, 0, 1, 1],
    maxLevel: 5,
    hero: "queen",
    desc: "Home of the Elf Queen. Upgrading the altar levels up the Queen — while she trains she can't fight.",
  },
  cannon: {
    kind: "cannon",
    name: "Cannon",
    size: 3,
    category: "defence",
    res: "gold",
    cost: [250, 1000, 3000, 7000, 15000],
    time: [6, 20, 45, 80, 130],
    hp: [420, 480, 560, 650, 760],
    counts: [2, 2, 3, 3, 4],
    maxLevel: 5,
    attack: { range: 7.5, damage: [8, 11, 15, 20, 26], interval: 0.8, projectile: "cannonball", speed: 16 },
    desc: "Fires heavy cannonballs at the nearest troop on the ground.",
  },
  archertower: {
    kind: "archertower",
    name: "Archer Tower",
    size: 3,
    category: "defence",
    res: "gold",
    cost: [1000, 2500, 5500, 11000, 22000],
    time: [12, 30, 60, 100, 150],
    hp: [380, 440, 510, 600, 700],
    counts: [0, 1, 2, 3, 4],
    maxLevel: 5,
    attack: { range: 9.5, damage: [6, 8, 11, 14, 18], interval: 0.6, projectile: "arrow", speed: 22 },
    desc: "A tall tower with a long reach and a quick crossbow.",
  },
  catapult: {
    kind: "catapult",
    name: "Catapult",
    size: 3,
    category: "defence",
    res: "gold",
    cost: [5000, 9000, 15000, 24000, 36000],
    time: [30, 60, 90, 130, 170],
    hp: [400, 460, 530, 610, 700],
    counts: [0, 0, 1, 1, 2],
    maxLevel: 5,
    attack: { range: 11, minRange: 4, damage: [24, 31, 40, 50, 62], interval: 4.5, splash: 1.5, projectile: "boulder", speed: 7 },
    desc: "Lobs boulders that smash groups of troops — but it can't hit anything close by.",
  },
  magetower: {
    kind: "magetower",
    name: "Mage Tower",
    size: 3,
    category: "defence",
    res: "gold",
    cost: [11000, 17000, 25000, 34000, 46000],
    time: [50, 80, 110, 145, 180],
    hp: [620, 680, 750, 830, 920],
    counts: [0, 0, 0, 1, 2],
    maxLevel: 5,
    attack: { range: 7, damage: [14, 18, 23, 29, 36], interval: 1.3, splash: 1.1, projectile: "bolt", speed: 12 },
    desc: "Crackling arcane bolts that burst and hurt every troop nearby.",
  },
  tesla: {
    kind: "tesla",
    name: "Hidden Tesla",
    size: 2,
    category: "defence",
    res: "gold",
    cost: [9000, 14000, 20000, 28000, 38000],
    time: [40, 70, 100, 140, 175],
    hp: [480, 550, 630, 720, 830],
    counts: [0, 0, 0, 1, 2],
    maxLevel: 5,
    attack: { range: 6.5, damage: [11, 14, 18, 23, 29], interval: 0.6, projectile: "zap", speed: 60, chain: [0, 1, 1, 2, 2] },
    hidden: 5.5,
    desc: "Hides underground where raiders can't see it. When troops come close it springs up and shocks them with chain lightning.",
  },
  wall: {
    kind: "wall",
    name: "Wall",
    size: 1,
    category: "walls",
    res: "gold",
    cost: [50, 250, 700, 1600, 3500],
    time: [0, 0, 0, 0, 0],
    hp: [300, 650, 1150, 1800, 2700],
    counts: [20, 40, 60, 80, 100],
    maxLevel: 5,
    desc: "Slows attackers down. Segments join up automatically.",
  },
  bomb: {
    kind: "bomb",
    name: "Bomb Trap",
    size: 1,
    category: "defence",
    res: "gold",
    cost: [400, 1000, 2500, 5000, 9000],
    time: [4, 10, 20, 40, 60],
    hp: [1, 1, 1, 1, 1],
    counts: [0, 2, 4, 6, 8],
    maxLevel: 5,
    trap: { damage: [40, 55, 72, 92, 115], radius: 1.6, trigger: 1.1 },
    desc: "Hidden from raiders. Explodes when troops step close.",
  },
  skeltrap: {
    kind: "skeltrap",
    name: "Skeleton Trap",
    size: 1,
    category: "defence",
    res: "gold",
    cost: [3000, 6000, 10000, 15000, 22000],
    time: [10, 25, 45, 70, 100],
    hp: [1, 1, 1, 1, 1],
    counts: [0, 0, 0, 1, 2],
    maxLevel: 5,
    trap: { damage: [0, 0, 0, 0, 0], radius: 0, trigger: 2.4, spawn: [2, 3, 3, 4, 5] },
    desc: "Hidden from raiders. Springs a pack of skeletons that fight any troop nearby.",
  },
};

export const SHOP_ORDER: BKind[] = [
  "goldmine",
  "elixirpump",
  "goldstorage",
  "elixirstorage",
  "builder",
  "barracks",
  "camp",
  "lab",
  "spellfactory",
  "kingaltar",
  "queenaltar",
  "cannon",
  "archertower",
  "catapult",
  "magetower",
  "tesla",
  "bomb",
  "skeltrap",
  "wall",
];

/** Gold cost of the 3rd and 4th Builder's Hut. */
export const HUT_COST = [0, 0, 3000, 15000];

export const isDefence = (k: BKind) => !!BUILDINGS[k].attack;
export const isTrapKind = (k: BKind) => !!BUILDINGS[k].trap;
export const isResource = (k: BKind) => k === "goldmine" || k === "elixirpump" || k === "goldstorage" || k === "elixirstorage" || k === "townhall";

/** How many of a kind a Town Hall level allows. */
export const allowed = (kind: BKind, th: number) => BUILDINGS[kind].counts[Math.min(MAX_TH, Math.max(1, th)) - 1] ?? 0;
/** Highest level a building may reach at this Town Hall level. */
export const levelCap = (kind: BKind, th: number) => (kind === "townhall" ? MAX_TH : Math.min(BUILDINGS[kind].maxLevel, th));
/** Town Hall level at which a kind first becomes available. */
export const unlockTh = (kind: BKind) => {
  const i = BUILDINGS[kind].counts.findIndex((c) => c > 0);
  return i < 0 ? 99 : i + 1;
};

// --- Troops -------------------------------------------------------------------------------------

export type TroopKind = "warrior" | "archer" | "thief" | "giant" | "valkyrie" | "breaker" | "crossbow" | "mage" | "healer" | "knight";
export type RaiderKind = "skeleton" | "zombie" | "vampire" | "keeper";
export type HeroKind = "king" | "queen";
/** "bones": the skeletons a Skeleton Trap springs. */
export type UnitKind = TroopKind | RaiderKind | HeroKind | "bones";
export type Prefer = "any" | "defence" | "resource" | "wall" | "troops";

export interface UnitDef {
  kind: UnitKind;
  name: string;
  housing: number;
  /** Training seconds. */
  train: number;
  /** Elixir per troop by level. */
  cost: number[];
  hp: number;
  /** Damage per hit at level 1. */
  damage: number;
  interval: number;
  range: number;
  /** Tiles per second. */
  speed: number;
  prefer: Prefer;
  splash?: number;
  /** Damage multiplier against the preferred kind. */
  bonus?: number;
  /** Heals troops instead of attacking. */
  heals?: boolean;
  /** Explodes on contact (wall breaker). */
  suicide?: boolean;
  /** Wall breaker: blast damage to walls by level (one blast opens a wall of its own level or one above). */
  wallDamage?: number[];
  ranged?: boolean;
  barracks: number;
  /** Elixir and seconds to research levels 2..5. */
  research: number[];
  researchTime: number[];
  desc: string;
}

/** Stat growth per level (L5 ≈ 1.9×). */
export const levelMul = (level: number) => 1 + 0.22 * (level - 1);

export const TROOPS: Record<TroopKind, UnitDef> = {
  warrior: {
    kind: "warrior",
    name: "Warrior",
    housing: 1,
    train: 3,
    cost: [20, 30, 45, 60, 80],
    hp: 90,
    damage: 11,
    interval: 1,
    range: 0.55,
    speed: 1.7,
    prefer: "any",
    barracks: 1,
    research: [1500, 5000, 13000, 28000],
    researchTime: [25, 60, 110, 170],
    desc: "Sword and stubbornness. Charges the nearest building.",
  },
  archer: {
    kind: "archer",
    name: "Archer",
    housing: 1,
    train: 4,
    cost: [40, 55, 75, 100, 130],
    hp: 38,
    damage: 9,
    interval: 1,
    range: 3.6,
    speed: 1.9,
    prefer: "any",
    ranged: true,
    barracks: 2,
    research: [2500, 7000, 16000, 32000],
    researchTime: [30, 70, 120, 175],
    desc: "Shoots over walls from a safe distance. Fragile up close.",
  },
  thief: {
    kind: "thief",
    name: "Thief",
    housing: 1,
    train: 3,
    cost: [30, 45, 60, 80, 100],
    hp: 48,
    damage: 10,
    interval: 1,
    range: 0.55,
    speed: 2.6,
    prefer: "resource",
    bonus: 2,
    barracks: 2,
    research: [2500, 7000, 16000, 32000],
    researchTime: [30, 70, 120, 175],
    desc: "Fast and greedy: goes straight for mines, storages and the Town Hall, dealing double damage to them.",
  },
  giant: {
    kind: "giant",
    name: "Giant",
    housing: 5,
    train: 12,
    cost: [200, 280, 380, 500, 650],
    hp: 480,
    damage: 26,
    interval: 2,
    range: 0.8,
    speed: 1.15,
    prefer: "defence",
    barracks: 3,
    research: [4000, 10000, 22000, 42000],
    researchTime: [40, 80, 130, 180],
    desc: "A huge brute who soaks up damage and only attacks defences.",
  },
  valkyrie: {
    kind: "valkyrie",
    name: "Valkyrie",
    housing: 6,
    train: 16,
    cost: [600, 800, 1050, 1350, 1700],
    hp: 380,
    damage: 34,
    interval: 1.3,
    range: 0.6,
    speed: 1.75,
    prefer: "any",
    // Melee splash: her great axe hits every building (and enemy) around her.
    splash: 1.2,
    barracks: 3,
    research: [5000, 12000, 24000, 44000],
    researchTime: [45, 85, 135, 180],
    desc: "Swings a two-handed battle axe that hits every building and enemy around her — walls too.",
  },
  breaker: {
    kind: "breaker",
    name: "Wall Breaker",
    housing: 2,
    train: 8,
    cost: [400, 550, 700, 900, 1100],
    hp: 34,
    damage: 24,
    interval: 1,
    range: 0.5,
    speed: 2.6,
    prefer: "wall",
    splash: 1.6,
    suicide: true,
    wallDamage: [700, 1250, 1900, 2800, 3700],
    barracks: 4,
    research: [6000, 13000, 26000, 46000],
    researchTime: [45, 85, 135, 180],
    desc: "A skeleton sapper carrying a lit bomb: runs straight at the nearest wall and blasts it — and the walls beside it — apart.",
  },
  crossbow: {
    kind: "crossbow",
    name: "Crossbowman",
    housing: 3,
    train: 10,
    cost: [300, 400, 520, 660, 820],
    hp: 140,
    damage: 26,
    interval: 1.5,
    range: 5,
    speed: 1.7,
    prefer: "defence",
    bonus: 1.5,
    ranged: true,
    barracks: 4,
    research: [7000, 14000, 27000, 47000],
    researchTime: [45, 85, 135, 180],
    desc: "Goes for defences first and shoots heavy crossbow bolts from far away — half again as hard against defences.",
  },
  mage: {
    kind: "mage",
    name: "Mage",
    housing: 4,
    train: 15,
    cost: [800, 1000, 1300, 1600, 2000],
    hp: 80,
    damage: 40,
    interval: 1.5,
    range: 3.1,
    speed: 1.45,
    prefer: "any",
    splash: 1,
    ranged: true,
    barracks: 5,
    research: [9000, 18000, 34000, 58000],
    researchTime: [50, 90, 140, 180],
    desc: "Hurls crystal bolts that burst over buildings and groups.",
  },
  healer: {
    kind: "healer",
    name: "Healer",
    housing: 10,
    train: 30,
    cost: [2500, 3200, 4000, 5000, 6000],
    hp: 420,
    damage: 32,
    interval: 1,
    range: 4.5,
    speed: 1.35,
    prefer: "troops",
    splash: 2,
    heals: true,
    barracks: 5,
    research: [15000, 28000, 45000, 70000],
    researchTime: [60, 100, 150, 180],
    desc: "Follows your troops and heals everyone around the one she targets. Never attacks.",
  },
  knight: {
    kind: "knight",
    name: "Knight",
    housing: 12,
    train: 40,
    cost: [3200, 4000, 5000, 6200, 7600],
    hp: 1150,
    damage: 115,
    interval: 1.8,
    range: 0.75,
    speed: 1.1,
    prefer: "any",
    barracks: 5,
    research: [18000, 32000, 50000, 75000],
    researchTime: [70, 110, 160, 180],
    desc: "A champion in full armour with a two-handed greatsword. Slow, but every swing smashes a building.",
  },
};

export const TROOP_ORDER: TroopKind[] = ["warrior", "archer", "thief", "giant", "valkyrie", "breaker", "crossbow", "mage", "healer", "knight"];

/** Raiders attacking your village (they use the defender's Town Hall level as their level). */
export const RAIDERS: Record<RaiderKind, UnitDef> = {
  skeleton: { ...TROOPS.warrior, kind: "skeleton", name: "Skeleton", hp: 70, damage: 10, speed: 1.8, desc: "" },
  zombie: { ...TROOPS.giant, kind: "zombie", name: "Zombie", hp: 360, damage: 20, speed: 1.05, desc: "" },
  vampire: { ...TROOPS.thief, kind: "vampire", name: "Vampire", hp: 60, damage: 12, desc: "" },
  keeper: { ...TROOPS.archer, kind: "keeper", name: "Grave Keeper", hp: 40, damage: 8, desc: "" },
};

/** Skeletons sprung by a Skeleton Trap (level = the trap's level). */
export const BONES: UnitDef = { ...TROOPS.warrior, kind: "bones", name: "Skeleton", hp: 60, damage: 9, speed: 2.1, desc: "" };

// --- Heroes -------------------------------------------------------------------------------------

export interface HeroDef extends UnitDef {
  altar: BKind;
  /** Seconds to heal from 0 to full, per level. */
  regen: number[];
  ability: { name: string; desc: string };
}

export const HEROES: Record<HeroKind, HeroDef> = {
  king: {
    ...TROOPS.warrior,
    kind: "king",
    name: "Axe King",
    housing: 0,
    hp: 950,
    damage: 52,
    interval: 1.2,
    range: 0.7,
    speed: 1.65,
    prefer: "any",
    altar: "kingaltar",
    regen: [60, 75, 90, 110, 130],
    ability: { name: "War Cry", desc: "Heals the King and enrages every troop around him." },
    desc: "A mighty king with a frost axe. Fights once per battle and sleeps to heal afterwards.",
  },
  queen: {
    ...TROOPS.archer,
    kind: "queen",
    name: "Elf Queen",
    housing: 0,
    hp: 420,
    damage: 46,
    interval: 0.9,
    range: 5,
    speed: 1.75,
    prefer: "any",
    altar: "queenaltar",
    regen: [70, 85, 100, 120, 140],
    ability: { name: "Vanish", desc: "The Queen turns invisible for a few seconds and her arrows hit twice as hard." },
    desc: "An elf with a golden bow and the longest reach of any unit. Sleeps to heal after a battle.",
  },
};

export const HERO_ORDER: HeroKind[] = ["king", "queen"];
export const isHero = (k: string): k is HeroKind => k === "king" || k === "queen";

export const unitDef = (k: UnitKind): UnitDef =>
  k in TROOPS ? TROOPS[k as TroopKind] : isHero(k) ? HEROES[k] : k === "bones" ? BONES : RAIDERS[k as RaiderKind];

// --- Spells -------------------------------------------------------------------------------------

export type SpellKind = "lightning" | "heal" | "rage" | "freeze" | "jump";

export interface SpellDef {
  kind: SpellKind;
  name: string;
  cost: number[];
  brew: number;
  radius: number;
  /** Seconds the effect lasts (0 = instant). */
  duration: number[];
  /** Lightning: total damage; heal: hp per second; rage: damage bonus (0.3 = +30%). */
  power: number[];
  factory: number;
  research: number[];
  researchTime: number[];
  color: string;
  desc: string;
}

export const SPELLS: Record<SpellKind, SpellDef> = {
  lightning: {
    kind: "lightning",
    name: "Lightning",
    cost: [1200, 1500, 1800, 2200, 2600],
    brew: 15,
    radius: 2,
    duration: [0, 0, 0, 0, 0],
    power: [260, 330, 410, 500, 600],
    factory: 1,
    research: [5000, 12000, 25000, 45000],
    researchTime: [40, 80, 130, 180],
    color: "#7dd3fc",
    desc: "Calls down a storm of bolts that damage every building in the circle.",
  },
  heal: {
    kind: "heal",
    name: "Heal",
    cost: [1500, 1800, 2200, 2600, 3000],
    brew: 18,
    radius: 3,
    duration: [8, 8, 8, 8, 8],
    power: [28, 36, 44, 54, 66],
    factory: 2,
    research: [6000, 14000, 27000, 47000],
    researchTime: [40, 80, 130, 180],
    color: "#facc15",
    desc: "A ring of golden light that heals troops standing inside it.",
  },
  rage: {
    kind: "rage",
    name: "Rage",
    cost: [2000, 2400, 2800, 3300, 3800],
    brew: 20,
    radius: 3,
    duration: [10, 10, 10, 10, 10],
    power: [0.3, 0.4, 0.5, 0.6, 0.7],
    factory: 3,
    research: [8000, 16000, 30000, 50000],
    researchTime: [45, 85, 135, 180],
    color: "#c026d3",
    desc: "Troops inside hit harder and run faster.",
  },
  freeze: {
    kind: "freeze",
    name: "Freeze",
    cost: [2500, 2900, 3300, 3800, 4300],
    brew: 22,
    radius: 2.6,
    duration: [3, 3.6, 4.2, 4.8, 5.5],
    power: [0, 0, 0, 0, 0],
    factory: 4,
    research: [10000, 19000, 33000, 52000],
    researchTime: [50, 90, 140, 180],
    color: "#bae6fd",
    desc: "Freezes defences (and traps) in the circle for a few seconds.",
  },
  jump: {
    kind: "jump",
    name: "Jump",
    cost: [2500, 2900, 3300, 3800, 4300],
    brew: 22,
    radius: 3,
    duration: [8, 10, 12, 14, 16],
    power: [0, 0, 0, 0, 0],
    factory: 5,
    research: [11000, 20000, 35000, 55000],
    researchTime: [50, 90, 140, 180],
    color: "#4ade80",
    desc: "Troops hop straight over walls inside the circle.",
  },
};

export const SPELL_ORDER: SpellKind[] = ["lightning", "heal", "rage", "freeze", "jump"];

// --- Gems, timers, formatting ---------------------------------------------------------------------

/** Gems to finish a timer right now. */
export const gemsToFinish = (seconds: number) => (seconds <= 0 ? 0 : Math.max(1, Math.ceil(seconds / 25)));

/** Gems to buy missing resources. */
export const gemsForResource = (amount: number) => (amount <= 0 ? 0 : Math.max(1, Math.ceil(Math.pow(amount, 0.62) / 6)));

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function shortNumber(n: number) {
  const v = Math.round(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 10_000) return `${(v / 1000).toFixed(v >= 100_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-US").format(v);
}

// --- Achievements ---------------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  gems: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "mine", name: "Gold Rush", desc: "Build a Gold Mine", gems: 5 },
  { id: "pump", name: "Liquid Magic", desc: "Build an Elixir Collector", gems: 5 },
  { id: "train20", name: "Recruiter", desc: "Train 20 troops", gems: 10 },
  { id: "win1", name: "First Blood", desc: "Win your first raid", gems: 10 },
  { id: "three", name: "Flawless", desc: "Earn 3 stars in a raid", gems: 15 },
  { id: "walls25", name: "Stonemason", desc: "Own 25 walls", gems: 10 },
  { id: "defend", name: "Hold the Line", desc: "Win a defence", gems: 10 },
  { id: "clear5", name: "Groundskeeper", desc: "Clear 5 obstacles", gems: 10 },
  { id: "th2", name: "Growing Town", desc: "Upgrade the Town Hall to level 2", gems: 10 },
  { id: "th3", name: "Market Town", desc: "Town Hall level 3", gems: 20 },
  { id: "th4", name: "Fortress", desc: "Town Hall level 4", gems: 30 },
  { id: "th5", name: "Kingdom", desc: "Town Hall level 5", gems: 50 },
  { id: "stage10", name: "Warlord", desc: "Clear campaign stage 10", gems: 15 },
  { id: "stage25", name: "Conqueror", desc: "Clear campaign stage 25", gems: 25 },
  { id: "stage50", name: "Overlord", desc: "Clear campaign stage 50", gems: 40 },
  { id: "stage75", name: "High King", desc: "Clear campaign stage 75", gems: 60 },
  { id: "stage100", name: "Legend", desc: "Clear all 100 stages", gems: 120 },
  { id: "stars50", name: "Star Hunter", desc: "Collect 50 campaign stars", gems: 20 },
  { id: "stars150", name: "Star Hoarder", desc: "Collect 150 campaign stars", gems: 40 },
  { id: "stars300", name: "Constellation", desc: "Collect all 300 stars", gems: 100 },
  { id: "spell", name: "Spellcaster", desc: "Cast your first spell", gems: 10 },
  { id: "lab", name: "Scholar", desc: "Research a troop or spell level", gems: 10 },
  { id: "king", name: "Long Live the King", desc: "Build the King's Altar", gems: 15 },
  { id: "queen", name: "Her Majesty", desc: "Build the Queen's Altar", gems: 20 },
  { id: "hero5", name: "Legendary", desc: "Raise a hero to level 5", gems: 40 },
  { id: "online1", name: "Rival Raider", desc: "Win an online battle", gems: 10 },
  { id: "online25", name: "Warlord of the Realm", desc: "Win 25 online battles", gems: 40 },
];
