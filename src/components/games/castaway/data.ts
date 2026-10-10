import { BUILD, HELD, ITEM, WORLD } from "./manifest";

/**
 * Castaway's rules as plain data: items, tools, recipes, buildings, creatures, achievements and
 * the clock. No three.js here, so the UI can import it freely.
 */

// --- Clock -------------------------------------------------------------------------------------------

/** Seconds per in-game day. */
export const DAY = 300;
/** Fractions of the day: dusk starts, night starts, night ends (dawn). */
export const DUSK = 0.62;
export const NIGHT = 0.7;
export const DAWN = 0.97;
/** A new game starts early on day 1. */
export const START_CLOCK = DAY * 0.03;

export const isNight = (t: number) => t >= NIGHT && t < DAWN;

// --- Items ------------------------------------------------------------------------------------------

export type ResourceId = "wood" | "stone" | "fiber" | "planks" | "scrap" | "cloth";
export type FoodId = "berries" | "coconut" | "mushroom" | "fish" | "fishCooked" | "bigFish" | "bigFishCooked" | "meat" | "meatCooked";
export type ToolId = "axe" | "axeIron" | "pick" | "pickIron" | "spear" | "hammer" | "torch" | "lantern";
export type ItemId = ResourceId | FoodId | ToolId;

export interface ItemDef {
  name: string;
  /** Library model used for its icon (and in the hand / on the ground). */
  model: string;
  /** Icon tint (cooked food). */
  tint?: string;
  plural?: string;
}

export const RESOURCES: ResourceId[] = ["wood", "stone", "fiber", "planks", "scrap", "cloth"];
export const FOODS: FoodId[] = ["fishCooked", "bigFishCooked", "meatCooked", "coconut", "berries", "mushroom", "fish", "bigFish", "meat"];

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: { name: "Wood", model: ITEM.wood },
  stone: { name: "Stone", model: ITEM.stone },
  fiber: { name: "Fibre", model: WORLD.grass },
  planks: { name: "Planks", model: ITEM.planks },
  scrap: { name: "Scrap metal", model: ITEM.scrap },
  cloth: { name: "Sailcloth", model: ITEM.cloth },
  berries: { name: "Berries", model: ITEM.berries },
  coconut: { name: "Coconut", model: ITEM.coconut, plural: "Coconuts" },
  mushroom: { name: "Mushroom", model: ITEM.mushroom, plural: "Mushrooms" },
  fish: { name: "Raw fish", model: ITEM.fish },
  fishCooked: { name: "Grilled fish", model: ITEM.fish, tint: "#8a5a32" },
  bigFish: { name: "Raw tuna", model: ITEM.bigFish },
  bigFishCooked: { name: "Grilled tuna", model: ITEM.bigFish, tint: "#8a5a32" },
  meat: { name: "Crab meat", model: ITEM.meat },
  meatCooked: { name: "Crab steak", model: ITEM.meatCooked },
  axe: { name: "Stone axe", model: HELD.axe },
  axeIron: { name: "Iron axe", model: HELD.axeIron },
  pick: { name: "Stone pickaxe", model: HELD.pick },
  pickIron: { name: "Iron pickaxe", model: HELD.pickIron },
  spear: { name: "Spear", model: HELD.spear },
  hammer: { name: "War hammer", model: HELD.hammer },
  torch: { name: "Torch", model: HELD.torch },
  lantern: { name: "Lantern", model: HELD.lantern },
};

export interface FoodDef {
  hunger: number;
  health: number;
  /** Cooking turns it into this. */
  cooked?: FoodId;
}

export const FOOD: Record<FoodId, FoodDef> = {
  berries: { hunger: 9, health: 1 },
  coconut: { hunger: 14, health: 2 },
  mushroom: { hunger: 10, health: 0 },
  fish: { hunger: 10, health: -4, cooked: "fishCooked" },
  fishCooked: { hunger: 32, health: 8 },
  bigFish: { hunger: 16, health: -6, cooked: "bigFishCooked" },
  bigFishCooked: { hunger: 48, health: 14 },
  meat: { hunger: 8, health: -6, cooked: "meatCooked" },
  meatCooked: { hunger: 36, health: 12 },
};

export const isFood = (id: ItemId): id is FoodId => id in FOOD;

// --- Tools & weapons -------------------------------------------------------------------------------

export type Slot = 0 | 1 | 2 | 3 | 4 | 5;

export interface ToolDef {
  slot: Slot;
  /** Hits on trees / rocks count this much. */
  chop?: number;
  mine?: number;
  /** Melee damage and reach. */
  damage: number;
  reach: number;
  knock: number;
  /** Swing speed multiplier. */
  speed: number;
  /** Light radius when held. */
  light?: number;
  /** Rank within its slot (the best one is picked automatically). */
  rank: number;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  axe: { slot: 0, chop: 1, damage: 12, reach: 2.0, knock: 3, speed: 1, rank: 1 },
  axeIron: { slot: 0, chop: 2, damage: 18, reach: 2.1, knock: 4, speed: 1.15, rank: 2 },
  pick: { slot: 1, mine: 1, damage: 10, reach: 2.0, knock: 3, speed: 1, rank: 1 },
  pickIron: { slot: 1, mine: 2, damage: 15, reach: 2.1, knock: 4, speed: 1.15, rank: 2 },
  spear: { slot: 2, damage: 24, reach: 2.7, knock: 5, speed: 1.2, rank: 1 },
  hammer: { slot: 2, damage: 42, reach: 2.3, knock: 10, speed: 0.78, rank: 2 },
  torch: { slot: 3, damage: 8, reach: 1.9, knock: 4, speed: 1, light: 7, rank: 1 },
  lantern: { slot: 3, damage: 6, reach: 1.8, knock: 3, speed: 1, light: 10, rank: 2 },
};

export const FIST = { damage: 6, reach: 1.6, knock: 2.5, speed: 1.1 };

export const SLOT_NAMES = ["Axe", "Pickaxe", "Weapon", "Light", "Food", "Build"] as const;

// --- Buildings -------------------------------------------------------------------------------------

export type BuildId = "campfire" | "workbench" | "bedroll" | "tent" | "fence" | "gate" | "wall" | "torchPost" | "chest" | "signal" | "raft";

export interface BuildDef {
  name: string;
  model: string;
  /** Footprint radius (round things) or half length (walls). */
  radius: number;
  /** Blocks creatures (and the player, unless `walkable`). */
  solid: boolean;
  /** The player can pass (gates, bedrolls). */
  walkable?: boolean;
  wall?: boolean;
  hp: number;
  /** Light / fear radius when burning. */
  light?: number;
  /** Must stand on the water's edge (raft). */
  shore?: boolean;
}

export const BUILDS: Record<BuildId, BuildDef> = {
  campfire: { name: "Campfire", model: BUILD.campfire, radius: 0.9, solid: true, hp: 80, light: 7.5 },
  workbench: { name: "Workbench", model: BUILD.workbench, radius: 0.85, solid: true, hp: 120 },
  bedroll: { name: "Bedroll", model: BUILD.bedroll, radius: 0.8, solid: false, walkable: true, hp: 60 },
  tent: { name: "Tent", model: BUILD.tent, radius: 1.3, solid: true, hp: 140 },
  fence: { name: "Fence", model: BUILD.fence, radius: 1.0, solid: true, wall: true, hp: 90 },
  gate: { name: "Gate", model: BUILD.gate, radius: 1.0, solid: true, walkable: true, wall: true, hp: 90 },
  wall: { name: "Palisade", model: BUILD.wall, radius: 1.0, solid: true, wall: true, hp: 260 },
  torchPost: { name: "Torch post", model: HELD.torch, radius: 0.35, solid: true, hp: 50, light: 5.5 },
  chest: { name: "Storage chest", model: BUILD.chest, radius: 0.7, solid: true, hp: 120 },
  signal: { name: "Signal fire", model: BUILD.campfire, radius: 1.7, solid: true, hp: 200, light: 12 },
  raft: { name: "Raft", model: BUILD.raftDeck, radius: 1.6, solid: true, hp: 300, shore: true },
};

// --- Recipes ---------------------------------------------------------------------------------------

export type RecipeId = ToolId | BuildId | "planks";
export type Tab = "tools" | "camp" | "defense" | "escape";

export interface Recipe {
  id: RecipeId;
  tab: Tab;
  name: string;
  desc: string;
  cost: Partial<Record<ResourceId, number>>;
  /** Needs a workbench within reach. */
  bench?: boolean;
  /** Placed in the world instead of going to the inventory. */
  build?: BuildId;
  /** Unlock hint while locked. */
  hint: string;
  /** Extra unlock condition: another recipe crafted first. */
  after?: RecipeId;
  /** Icon model. */
  icon: string;
}

export const RECIPES: Recipe[] = [
  { id: "axe", tab: "tools", name: "Stone axe", desc: "Chops trees for wood.", cost: { wood: 3, stone: 2, fiber: 2 }, hint: "Find wood, stone and fibre", icon: HELD.axe },
  { id: "pick", tab: "tools", name: "Stone pickaxe", desc: "Cracks rocks for stone.", cost: { wood: 3, stone: 3, fiber: 2 }, hint: "Find wood, stone and fibre", icon: HELD.pick },
  { id: "spear", tab: "tools", name: "Spear", desc: "Long reach. Fight, and spear fish at bubbling spots.", cost: { wood: 4, stone: 2, fiber: 3 }, hint: "Find wood, stone and fibre", icon: HELD.spear },
  { id: "torch", tab: "tools", name: "Torch", desc: "Light and warmth in your hand. Crabs keep away.", cost: { wood: 2, fiber: 3 }, hint: "Find wood and fibre", icon: HELD.torch },
  { id: "axeIron", tab: "tools", name: "Iron axe", desc: "Chops twice as fast. Hits harder.", cost: { wood: 4, scrap: 3 }, bench: true, hint: "Build a workbench and find scrap", after: "workbench", icon: HELD.axeIron },
  { id: "pickIron", tab: "tools", name: "Iron pickaxe", desc: "Mines twice as fast.", cost: { wood: 4, scrap: 3 }, bench: true, hint: "Build a workbench and find scrap", after: "workbench", icon: HELD.pickIron },
  { id: "hammer", tab: "tools", name: "War hammer", desc: "Slow, crushing blows that send creatures flying.", cost: { planks: 3, scrap: 4 }, bench: true, hint: "Build a workbench and find scrap", after: "workbench", icon: HELD.hammer },
  { id: "lantern", tab: "tools", name: "Lantern", desc: "A wide, warm light. Most creatures keep away.", cost: { scrap: 2, planks: 1, fiber: 3 }, bench: true, hint: "Craft a torch, then build a workbench", after: "workbench", icon: HELD.lantern },
  { id: "campfire", tab: "camp", name: "Campfire", desc: "Light, warmth and cooking. Keeps most creatures away. Feed it wood.", cost: { wood: 5, stone: 4 }, build: "campfire", hint: "Find wood and stone", icon: BUILD.campfire },
  { id: "workbench", tab: "camp", name: "Workbench", desc: "Unlocks iron tools, planks, walls and the way home.", cost: { wood: 10, stone: 6 }, build: "workbench", hint: "Craft a stone axe first", after: "axe", icon: BUILD.workbench },
  { id: "planks", tab: "camp", name: "Planks ×2", desc: "Sawn from wood at the workbench.", cost: { wood: 3 }, bench: true, hint: "Build a workbench", after: "workbench", icon: ITEM.planks },
  { id: "bedroll", tab: "camp", name: "Bedroll", desc: "Sleep to speed up the night. You wake up where you sleep.", cost: { fiber: 8, cloth: 1 }, build: "bedroll", hint: "Find sailcloth in the wreck", icon: BUILD.bedroll },
  { id: "tent", tab: "camp", name: "Tent", desc: "A better bed: heals you while you sleep.", cost: { planks: 4, cloth: 3, fiber: 4 }, build: "tent", bench: true, hint: "Build a workbench and find sailcloth", after: "workbench", icon: BUILD.tent },
  { id: "chest", tab: "camp", name: "Storage chest", desc: "Stash resources. Crafting nearby uses them, and they're safe if you fall.", cost: { planks: 5, scrap: 1 }, build: "chest", bench: true, hint: "Build a workbench", after: "workbench", icon: BUILD.chest },
  { id: "torchPost", tab: "camp", name: "Torch post", desc: "A standing torch that lights your camp all night.", cost: { wood: 3, fiber: 2, stone: 1 }, build: "torchPost", hint: "Craft a torch first", after: "torch", icon: HELD.torch },
  { id: "fence", tab: "defense", name: "Fence", desc: "Blocks creatures until they break it.", cost: { wood: 4, fiber: 1 }, build: "fence", hint: "Find wood and fibre", icon: BUILD.fence },
  { id: "gate", tab: "defense", name: "Gate", desc: "A fence you can walk through. Creatures can't.", cost: { wood: 5, fiber: 2 }, build: "gate", hint: "Build a fence first", after: "fence", icon: BUILD.gate },
  { id: "wall", tab: "defense", name: "Palisade", desc: "A sturdy wall. Takes ages to break.", cost: { planks: 3, stone: 2 }, build: "wall", bench: true, hint: "Build a workbench", after: "workbench", icon: BUILD.wall },
  { id: "signal", tab: "escape", name: "Signal fire", desc: "Light it at night. If it burns until dawn, a ship will come.", cost: { wood: 20, stone: 10, planks: 4 }, build: "signal", bench: true, hint: "Build a workbench", after: "workbench", icon: BUILD.campfire },
  { id: "raft", tab: "escape", name: "Raft", desc: "Build it on the shore. Your way out to the ship.", cost: { planks: 14, wood: 8, fiber: 10, cloth: 3 }, build: "raft", bench: true, hint: "Build a workbench", after: "workbench", icon: BUILD.raftDeck },
];

export const RECIPE = Object.fromEntries(RECIPES.map((r) => [r.id, r])) as Record<RecipeId, Recipe>;

export const TABS: { id: Tab; name: string }[] = [
  { id: "tools", name: "Tools" },
  { id: "camp", name: "Camp" },
  { id: "defense", name: "Defence" },
  { id: "escape", name: "Escape" },
];

// --- Creatures -------------------------------------------------------------------------------------

export type CreatureKind = "crab" | "drowned" | "brute" | "ghost";

export interface CreatureDef {
  name: string;
  hp: number;
  speed: number;
  damage: number;
  /** Damage to buildings per hit. */
  wallDamage: number;
  reach: number;
  windup: number;
  cooldown: number;
  /** Body radius. */
  radius: number;
  /** Model height. */
  height: number;
  /** Keeps out of firelight (bigger number = wider berth). 0 = not afraid. */
  fear: number;
  /** Passes through walls. */
  phase?: boolean;
  /** Stomps campfires out. */
  stomps?: boolean;
  drops: { item: ItemId; chance: number; count: number }[];
}

export const CREATURES: Record<CreatureKind, CreatureDef> = {
  crab: { name: "Reef crab", hp: 26, speed: 3.3, damage: 7, wallDamage: 7, reach: 1.25, windup: 0.42, cooldown: 1.1, radius: 0.55, height: 0.9, fear: 1, drops: [{ item: "meat", chance: 0.7, count: 1 }] },
  drowned: {
    name: "Drowned sailor",
    hp: 60,
    speed: 2.6,
    damage: 13,
    wallDamage: 16,
    reach: 1.55,
    windup: 0.6,
    cooldown: 1.3,
    radius: 0.5,
    height: 1.65,
    fear: 1,
    drops: [
      { item: "scrap", chance: 0.45, count: 1 },
      { item: "cloth", chance: 0.25, count: 1 },
    ],
  },
  brute: {
    name: "Bloated brute",
    hp: 140,
    speed: 2.05,
    damage: 24,
    wallDamage: 40,
    reach: 1.9,
    windup: 0.9,
    cooldown: 1.7,
    radius: 0.75,
    height: 2.2,
    fear: 0,
    stomps: true,
    drops: [
      { item: "scrap", chance: 0.9, count: 2 },
      { item: "cloth", chance: 0.4, count: 1 },
    ],
  },
  ghost: { name: "Sea ghost", hp: 40, speed: 3.0, damage: 10, wallDamage: 0, reach: 1.4, windup: 0.5, cooldown: 1.2, radius: 0.45, height: 1.6, fear: 1.6, phase: true, drops: [{ item: "cloth", chance: 0.5, count: 1 }] },
};

/** Who comes out of the sea on a given night (1-based). */
export function raidPlan(night: number): CreatureKind[] {
  const out: CreatureKind[] = [];
  const crabs = Math.min(9, 3 + night);
  const drowned = night >= 2 ? Math.min(8, 1 + Math.floor(night * 0.9)) : 0;
  const brutes = night >= 3 ? Math.min(4, Math.floor((night - 1) / 2)) : 0;
  const ghosts = night >= 4 ? Math.min(5, night - 2) : 0;
  for (let i = 0; i < crabs; i++) out.push("crab");
  for (let i = 0; i < drowned; i++) out.push("drowned");
  for (let i = 0; i < brutes; i++) out.push("brute");
  for (let i = 0; i < ghosts; i++) out.push("ghost");
  return out;
}

// --- Survival tuning -------------------------------------------------------------------------------

export const SURVIVAL = {
  maxHealth: 100,
  /** Hunger lost per second (sprinting costs extra). */
  hungerDrain: 0.22,
  sprintHunger: 0.18,
  starveDamage: 0.9,
  regen: 0.45,
  sleepRegen: 1.6,
  tentRegen: 3.2,
  coldDrain: 1.35,
  torchColdDrain: 0.25,
  warmUp: 7,
  freezeDamage: 1.0,
  /** Campfire fuel (seconds) per wood, starting fuel and cap. */
  fuelPerWood: 45,
  startFuel: 120,
  maxFuel: 240,
};

// --- Achievements ----------------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "timber", name: "Timber!", desc: "Fell your first tree." },
  { id: "toolmaker", name: "Toolmaker", desc: "Craft a stone axe or pickaxe." },
  { id: "firestarter", name: "Fire starter", desc: "Build a campfire." },
  { id: "night1", name: "First night", desc: "Survive a night on the island." },
  { id: "chef", name: "Island chef", desc: "Cook five meals." },
  { id: "angler", name: "Angler", desc: "Spear five fish." },
  { id: "iron", name: "Iron age", desc: "Craft an iron tool." },
  { id: "fortress", name: "Fortress", desc: "Have ten walls standing." },
  { id: "hunter", name: "Crab cracker", desc: "Defeat 25 night creatures." },
  { id: "brute", name: "Giant slayer", desc: "Defeat a bloated brute." },
  { id: "week", name: "One week in", desc: "See the dawn of day 7." },
  { id: "notes", name: "Message in a bottle", desc: "Find every bottle note." },
  { id: "rescued", name: "Rescued", desc: "Escape the island." },
  { id: "swift", name: "Swift escape", desc: "Escape before day 6." },
];

/** Notes in bottles washed up on the beach: lore plus tips. */
export const NOTES = [
  "Day ?? — The crabs come out when the sun goes down. They hate the fire. Keep it fed.",
  "If you read this: the bubbling water is full of fish. A sharp spear is all you need.",
  "The big grey ones don't care about fire. They stamp it out. Build walls around your flame.",
  "Ships pass this island. One night of smoke and flame on the shore and they'll see you.",
  "The white ones drift through fences like fog. Only light keeps them back.",
];

// --- Objectives (the journal's to-do list) ---------------------------------------------------------

export const OBJECTIVES = [
  "Search the shipwreck's crates",
  "Pick up driftwood, pebbles and bush fibre",
  "Craft a stone axe (C)",
  "Chop down a tree",
  "Build a campfire before nightfall",
  "Survive the night by the fire",
  "Craft a spear and catch a fish",
  "Build a workbench",
  "Wall in your camp (4 walls)",
  "Build the signal fire",
  "Build a raft on the shore",
  "Light the signal fire at night and keep it burning",
  "A ship! Board the raft",
] as const;
