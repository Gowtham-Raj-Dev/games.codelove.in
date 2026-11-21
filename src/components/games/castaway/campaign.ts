import type { BuildId, CreatureKind, ItemId, RecipeId, ToolId } from "./data";
import { CHAR, ISLE, WORLD } from "./manifest";

/**
 * The campaign as plain data (no three.js): five islands, each a chapter with its own shape, plants,
 * weather, creatures and chain of eight things to do, ending with a way off the island. Plus what the
 * shells earned on the way buy between islands: castaways, perks and starting kits — and the checks
 * that keep an old or broken save from crashing the game.
 */

export type Loot = Partial<Record<ItemId, number>>;

// --- What an island is made of -----------------------------------------------------------------------

export interface Palette {
  sand: string;
  wetSand: string;
  seabed: string;
  deep: string;
  grass: string;
  grassDry: string;
  forest: string;
  rock: string;
  rockDark: string;
  mud: string;
}

export interface TerrainDef {
  seed: number;
  /** Mean distance from the middle to the shore. */
  radius: number;
  hill: { x: number; z: number; r: number; h: number };
  pond: { x: number; z: number; r: number } | null;
  /** Height of the inland bumps. */
  rough: number;
}

export interface DecoDef {
  model: string;
  n: number;
  /** Collision radius (0 = walk through). */
  r: number;
  on: "grass" | "beach" | "rock" | "land";
  scale: [number, number];
}

export interface FloraDef {
  trees: number;
  /** [tree, its stump] — picked at random. */
  treeModels: [string, string][];
  palms: number;
  rocks: number;
  sandRocks: number;
  boulders: number;
  bushes: number;
  berries: number;
  mushrooms: number;
  driftwood: number;
  pebbles: number;
  /** Grass tufts and flowers. */
  greens: number;
  deco: DecoDef[];
  fish: number;
  bottles: number;
}

export type WeatherKind = "none" | "rain" | "heat" | "blizzard" | "fog";

/** What the objectives look at. */
export interface Progress {
  day: number;
  /** Crates of the wreck / the island's cache opened. */
  opened: number;
  felled: number;
  caught: number;
  cooked: number;
  notes: number;
  faints: number;
  kills: Partial<Record<CreatureKind, number>>;
  treasure: boolean;
  ship: boolean;
  sailed: boolean;
  seen(id: ItemId): boolean;
  /** Has the tool (crafted here or brought along). */
  owns(id: ToolId): boolean;
  /** Built or crafted at least once on this island. */
  made(id: RecipeId): boolean;
  /** Buildings of these kinds standing now. */
  standing(kinds: BuildId[]): number;
}

export interface Objective {
  text: string;
  done(p: Progress): boolean;
  /** "2/3" style progress, when it helps. */
  count?(p: Progress): [number, number];
}

export interface IslandDef {
  id: string;
  name: string;
  /** One line for the chart. */
  blurb: string;
  /** What is new here (chart). */
  twist: string;
  /** Banner under "Day 1". */
  intro: string;
  terrain: TerrainDef;
  palette: Palette;
  water: { deep: string; mid: string; shallow: string };
  /** Sky colours are multiplied by `tint`; fog distances by `fog`; daylight by `light`. */
  sky: { tint: string; fog: number; light: number };
  flora: FloraDef;
  /** A shipwreck in the cove with four crates. */
  wreck: Loot[] | null;
  /** Crates somewhere inland, marked by a signpost. */
  cache: { name: string; loot: Loot[] } | null;
  /** A buried chest that shows up once every bottle note is read. */
  treasure: Loot | null;
  /** What survived the crossing: you land with this. */
  gear: Loot;
  climate: {
    /** Warmth lost per second by day, away from a fire. */
    dayCold: number;
    /** Night cold multiplier. */
    nightCold: number;
    weather: WeatherKind;
  };
  /** Who comes out of the sea on night `n` (1-based). */
  raid(n: number): CreatureKind[];
  /** Animals that roam the island by day. */
  wild: { kind: CreatureKind; count: number }[];
  /** The Drowned Captain comes for the signal fire. */
  boss: boolean;
  escape: "raft" | "ship";
  /** Cooked meals the raft must carry. */
  provisions: number;
  objectives: Objective[];
  bonus: { text: string; done(p: Progress): boolean };
  /** Leave on or before this day for the second star. */
  par: number;
  notes: string[];
  /** Crates washed up each morning. */
  flotsam: number;
}

const many = (kind: CreatureKind, n: number): CreatureKind[] => Array.from({ length: Math.max(0, Math.floor(n)) }, () => kind);
const kills = (p: Progress, kind: CreatureKind) => p.kills[kind] ?? 0;
const WALLS: BuildId[] = ["fence", "gate", "wall"];
const tally = (n: number, of: number): [number, number] => [Math.min(n, of), of];

const TROPIC: Palette = { sand: "#ecd6a0", wetSand: "#c8ad78", seabed: "#b49a68", deep: "#5f7d74", grass: "#86b552", grassDry: "#a7b866", forest: "#5d9443", rock: "#978b7a", rockDark: "#7a7064", mud: "#8d7a55" };

export const ISLANDS: IslandDef[] = [
  // 1 — the tutorial: tools, fire, food, the first raft.
  {
    id: "cove",
    name: "Wreck Cove",
    blurb: "Warm sand, tall palms and what is left of your ship.",
    twist: "Learn to gather, craft, cook and keep a fire through the night.",
    intro: "Washed ashore",
    terrain: { seed: 7, radius: 50, hill: { x: 17, z: -15, r: 17, h: 7.5 }, pond: { x: -19, z: 4, r: 6.2 }, rough: 1.6 },
    palette: TROPIC,
    water: { deep: "#0b4a72", mid: "#1b8bb0", shallow: "#4fd6c8" },
    sky: { tint: "#ffffff", fog: 1, light: 1 },
    flora: {
      trees: 84,
      treeModels: [
        [WORLD.tree, WORLD.stump],
        [WORLD.treeTall, WORLD.stump],
        [WORLD.treeAutumn, WORLD.stumpAutumn],
      ],
      palms: 38,
      rocks: 24,
      sandRocks: 8,
      boulders: 9,
      bushes: 30,
      berries: 13,
      mushrooms: 14,
      driftwood: 16,
      pebbles: 16,
      greens: 420,
      deco: [{ model: WORLD.flatRock, n: 6, r: 0, on: "grass", scale: [0.8, 1.1] }],
      fish: 5,
      bottles: 3,
    },
    wreck: [
      { planks: 3, cloth: 1, fish: 1 },
      { wood: 4, fiber: 3, planks: 2 },
      { scrap: 2, cloth: 1, coconut: 2 },
      { scrap: 3, cloth: 2, planks: 3 },
    ],
    cache: null,
    treasure: null,
    gear: {},
    climate: { dayCold: 0, nightCold: 1, weather: "none" },
    raid: (n) => [...many("crab", Math.min(6, 2 + n)), ...many("drowned", n >= 2 ? Math.min(3, n - 1) : 0)],
    wild: [],
    boss: false,
    escape: "raft",
    provisions: 0,
    objectives: [
      { text: "Search the shipwreck's crates", done: (p) => p.opened >= 3, count: (p) => tally(p.opened, 3) },
      { text: "Pick up driftwood, pebbles and bush fibre", done: (p) => p.seen("wood") && p.seen("stone") && p.seen("fiber") },
      { text: "Craft a stone axe and chop down a tree", done: (p) => p.owns("axe") && p.felled >= 1 },
      { text: "Build a campfire before nightfall", done: (p) => p.made("campfire") },
      { text: "Survive the night by your fire", done: (p) => p.day >= 2 },
      { text: "Craft a spear, catch a fish and cook it", done: (p) => p.caught >= 1 && p.cooked >= 1 },
      { text: "Build a workbench", done: (p) => p.made("workbench") },
      { text: "Build a raft on the shore and set sail", done: (p) => p.sailed },
    ],
    bonus: { text: "Read all three bottle notes", done: (p) => p.notes >= 3 },
    par: 4,
    notes: [
      "Day ?? — The crabs come out when the sun goes down. They hate the fire. Keep it fed.",
      "If you read this: the bubbling water is full of fish. A sharp spear is all you need.",
      "There are more islands to the east. A raft can make the hop — one island at a time.",
    ],
    flotsam: 1,
  },

  // 2 — rain, boars, iron tools and fences.
  {
    id: "boar",
    name: "Boar Wood",
    blurb: "A dripping forest of oak and pine, loud with wild boars.",
    twist: "Rain eats your campfire's wood. Hunt boars, forge iron tools and fence your camp.",
    intro: "Thick woods and the smell of rain",
    terrain: { seed: 31, radius: 52, hill: { x: -20, z: -18, r: 15, h: 6 }, pond: { x: 20, z: -2, r: 6.2 }, rough: 2.1 },
    palette: { ...TROPIC, sand: "#d9c79a", wetSand: "#b39f72", grass: "#6fa64a", grassDry: "#86a657", forest: "#3f7a37", rock: "#857c6e", rockDark: "#686057", mud: "#6f6046" },
    water: { deep: "#0d4460", mid: "#1f7896", shallow: "#57b9b0" },
    sky: { tint: "#dfe8ea", fog: 0.82, light: 0.92 },
    flora: {
      trees: 112,
      treeModels: [
        [ISLE.oak, WORLD.stump],
        [ISLE.pineRound, WORLD.stump],
        [ISLE.pineTall, WORLD.stump],
        [WORLD.tree, WORLD.stump],
        [WORLD.treeTall, WORLD.stump],
      ],
      palms: 10,
      rocks: 22,
      sandRocks: 5,
      boulders: 8,
      bushes: 34,
      berries: 16,
      mushrooms: 20,
      driftwood: 12,
      pebbles: 14,
      greens: 460,
      deco: [{ model: WORLD.flatRock, n: 8, r: 0, on: "grass", scale: [0.8, 1.2] }],
      fish: 4,
      bottles: 2,
    },
    wreck: null,
    cache: {
      name: "loggers' camp",
      loot: [
        { scrap: 3, cloth: 2, planks: 2 },
        { scrap: 2, cloth: 1, fiber: 4 },
        { scrap: 2, cloth: 2, planks: 4 },
      ],
    },
    treasure: null,
    gear: { axe: 1 },
    climate: { dayCold: 0, nightCold: 1.1, weather: "rain" },
    raid: (n) => [...many("crab", Math.min(6, 2 + n)), ...many("drowned", Math.min(5, n)), ...many("brute", n >= 5 ? 2 : n >= 3 ? 1 : 0)],
    wild: [{ kind: "boar", count: 5 }],
    boss: false,
    escape: "raft",
    provisions: 3,
    objectives: [
      { text: "Build a campfire and a workbench", done: (p) => p.made("campfire") && p.made("workbench") },
      { text: "Hunt two wild boars", done: (p) => kills(p, "boar") >= 2, count: (p) => tally(kills(p, "boar"), 2) },
      { text: "Cook three meals on the campfire", done: (p) => p.cooked >= 3, count: (p) => tally(p.cooked, 3) },
      { text: "Find the loggers' camp and search its crates", done: (p) => p.opened >= 3, count: (p) => tally(p.opened, 3) },
      { text: "Craft an iron axe or iron pickaxe", done: (p) => p.owns("axeIron") || p.owns("pickIron") },
      { text: "Fence your camp: six fences, gates or palisades", done: (p) => p.standing(WALLS) >= 6, count: (p) => tally(p.standing(WALLS), 6) },
      { text: "Hold out until the third morning", done: (p) => p.day >= 3 },
      { text: "Build a raft, load three cooked meals and set sail", done: (p) => p.sailed },
    ],
    bonus: { text: "Defeat a bloated brute", done: (p) => kills(p, "brute") >= 1 },
    par: 5,
    notes: [
      "The loggers left in a hurry. Their camp is still up in the trees, tools and all.",
      "Boars charge anything that comes close. They won't cross a fence — and they roast nicely.",
    ],
    flotsam: 1,
  },

  // 3 — heat, scarce wood, ghosts and a treasure hunt.
  {
    id: "dune",
    name: "Sunscorch Atoll",
    blurb: "Dunes, cactus and one green oasis under a white-hot sun.",
    twist: "Midday heat doubles your hunger unless you find shade. Wood only washes up. Ghosts walk at night — only light stops them.",
    intro: "Hot sand and no trees in sight",
    terrain: { seed: 58, radius: 48, hill: { x: 22, z: -8, r: 13, h: 4.5 }, pond: { x: -8, z: -12, r: 6.2 }, rough: 2.6 },
    palette: { sand: "#f0dca6", wetSand: "#cdb47e", seabed: "#bda570", deep: "#6a8a80", grass: "#e2c88c", grassDry: "#d8b877", forest: "#c9b27a", rock: "#c08a5c", rockDark: "#9a6a46", mud: "#8f8355" },
    water: { deep: "#0a5a84", mid: "#1fa0c0", shallow: "#6fe6d6" },
    sky: { tint: "#fff3dc", fog: 1.1, light: 1.1 },
    flora: {
      trees: 10,
      treeModels: [[WORLD.treeAutumn, WORLD.stumpAutumn]],
      palms: 22,
      rocks: 10,
      sandRocks: 26,
      boulders: 10,
      bushes: 30,
      berries: 4,
      mushrooms: 0,
      driftwood: 34,
      pebbles: 22,
      greens: 60,
      deco: [
        { model: ISLE.cactusTall, n: 34, r: 0.45, on: "land", scale: [0.85, 1.3] },
        { model: ISLE.cactusShort, n: 30, r: 0.4, on: "land", scale: [0.85, 1.25] },
      ],
      fish: 6,
      bottles: 3,
    },
    wreck: null,
    cache: null,
    treasure: { cloth: 4, scrap: 4, planks: 8, coconut: 3 },
    gear: { axe: 1, pick: 1 },
    climate: { dayCold: 0, nightCold: 1.5, weather: "heat" },
    raid: (n) => [...many("crab", 2), ...many("drowned", Math.min(4, n)), ...many("ghost", Math.min(5, 1 + n))],
    wild: [],
    boss: false,
    escape: "raft",
    provisions: 0,
    objectives: [
      { text: "Build a campfire near the oasis", done: (p) => p.made("campfire") },
      { text: "Craft a torch and stand two torch posts", done: (p) => p.owns("torch") && p.standing(["torchPost"]) >= 2, count: (p) => tally(p.standing(["torchPost"]), 2) },
      { text: "Last through a night of sea ghosts", done: (p) => p.day >= 2 },
      { text: "Find the three bottle maps on the beach", done: (p) => p.notes >= 3, count: (p) => tally(p.notes, 3) },
      { text: "Dig up the buried chest under the golden sparkle", done: (p) => p.treasure },
      { text: "Build a workbench and craft a lantern", done: (p) => p.made("workbench") && p.owns("lantern") },
      { text: "Build a tent for shade", done: (p) => p.made("tent") },
      { text: "Build a raft on the shore and set sail", done: (p) => p.sailed },
    ],
    bonus: { text: "Defeat five sea ghosts", done: (p) => kills(p, "ghost") >= 5 },
    par: 5,
    notes: [
      "MAP 1 of 3 — The captain buried his chest where the dunes end. Find all three maps and the sand will show it.",
      "MAP 2 of 3 — The white ones drift through fences like fog. Only light keeps them back.",
      "MAP 3 of 3 — At noon, stand under a palm or in the water. The sun here eats a man alive.",
    ],
    flotsam: 2,
  },

  // 4 — cold all day, blizzards, bears.
  {
    id: "frost",
    name: "Frostbite Key",
    blurb: "Snowed-in pines, an ice-bound wreck and white bears.",
    twist: "It is cold even by day: stay near fire or carry a torch. Blizzards roll in. Bears don't wait for night.",
    intro: "Snow underfoot. Light a fire, fast",
    terrain: { seed: 83, radius: 51, hill: { x: 4, z: -24, r: 18, h: 9 }, pond: { x: -22, z: -4, r: 6.2 }, rough: 1.9 },
    palette: { sand: "#e6ebf0", wetSand: "#c3ccd6", seabed: "#9aa7b4", deep: "#5a6f80", grass: "#f4f7fa", grassDry: "#e3eaf0", forest: "#dfe8ef", rock: "#9aa3ad", rockDark: "#7b8590", mud: "#aeb9c4" },
    water: { deep: "#0c3c5e", mid: "#2c7f9e", shallow: "#8fd0d8" },
    sky: { tint: "#e4eefc", fog: 0.8, light: 0.95 },
    flora: {
      trees: 78,
      treeModels: [
        [ISLE.snowA, WORLD.stump],
        [ISLE.snowB, WORLD.stump],
        [ISLE.snowC, WORLD.stump],
      ],
      palms: 0,
      rocks: 24,
      sandRocks: 0,
      boulders: 10,
      bushes: 16,
      berries: 0,
      mushrooms: 0,
      driftwood: 12,
      pebbles: 14,
      greens: 0,
      deco: [{ model: ISLE.snowPile, n: 46, r: 0, on: "land", scale: [0.9, 1.8] }],
      fish: 6,
      bottles: 2,
    },
    wreck: [
      { planks: 4, cloth: 2, fishCooked: 2 },
      { wood: 5, fiber: 6, planks: 2 },
      { scrap: 3, cloth: 1, fiber: 4 },
      { scrap: 3, cloth: 2, planks: 3 },
    ],
    cache: null,
    treasure: null,
    gear: { axe: 1, pick: 1, spear: 1 },
    climate: { dayCold: 0.45, nightCold: 1.6, weather: "blizzard" },
    raid: (n) => [...many("drowned", Math.min(6, 1 + n)), ...many("brute", n >= 2 ? Math.min(2, Math.floor(n / 2)) : 0), ...many("ghost", n >= 2 ? Math.min(3, n - 1) : 0)],
    wild: [{ kind: "bear", count: 3 }],
    boss: false,
    escape: "raft",
    provisions: 0,
    objectives: [
      { text: "Build a campfire before you freeze", done: (p) => p.made("campfire") },
      { text: "Craft a torch to carry warmth with you", done: (p) => p.owns("torch") },
      { text: "Spear three fish", done: (p) => p.caught >= 3, count: (p) => tally(p.caught, 3) },
      { text: "Search the ice-bound wreck's crates", done: (p) => p.opened >= 3, count: (p) => tally(p.opened, 3) },
      { text: "Build a workbench and a tent", done: (p) => p.made("workbench") && p.made("tent") },
      { text: "Defeat a white bear", done: (p) => kills(p, "bear") >= 1 },
      { text: "Raise four palisades around your camp", done: (p) => p.standing(["wall"]) >= 4, count: (p) => tally(p.standing(["wall"]), 4) },
      { text: "Build a raft on the shore and set sail", done: (p) => p.sailed },
    ],
    bonus: { text: "Leave without passing out once", done: (p) => p.faints === 0 },
    par: 6,
    notes: [
      "The cold never lets go here. A torch in the hand is half a fire.",
      "The bears are bigger than they look and they don't sleep. A campfire turns them away.",
    ],
    flotsam: 2,
  },

  // 5 — everything at once, the signal fire and the Drowned Captain.
  {
    id: "beacon",
    name: "Beacon Rock",
    blurb: "Black rock, dead pines and old graves, right on the shipping lane.",
    twist: "The drowned are strongest here. Build the signal fire, keep it burning through one night — their captain will come for it.",
    intro: "The last island. Ships pass here",
    terrain: { seed: 119, radius: 49, hill: { x: -6, z: -20, r: 20, h: 10 }, pond: null, rough: 2.8 },
    palette: { sand: "#8f8a84", wetSand: "#6f6a66", seabed: "#5c5955", deep: "#3d4748", grass: "#6d7b5c", grassDry: "#7d7f62", forest: "#55634c", rock: "#5b5754", rockDark: "#3f3c3b", mud: "#5a5248" },
    water: { deep: "#08283c", mid: "#17556c", shallow: "#3e8f92" },
    sky: { tint: "#c9c6d6", fog: 0.62, light: 0.85 },
    flora: {
      trees: 62,
      treeModels: [
        [ISLE.pineCrooked, WORLD.stump],
        [ISLE.pineFall, WORLD.stumpAutumn],
      ],
      palms: 0,
      rocks: 28,
      sandRocks: 0,
      boulders: 14,
      bushes: 24,
      berries: 7,
      mushrooms: 16,
      driftwood: 16,
      pebbles: 18,
      greens: 120,
      deco: [
        { model: ISLE.graveCross, n: 16, r: 0.3, on: "grass", scale: [0.9, 1.2] },
        { model: ISLE.graveRound, n: 18, r: 0.3, on: "grass", scale: [0.9, 1.2] },
      ],
      fish: 5,
      bottles: 2,
    },
    wreck: null,
    cache: {
      name: "keeper's store",
      loot: [
        { scrap: 4, cloth: 2, planks: 4 },
        { scrap: 3, cloth: 2, fiber: 5 },
        { scrap: 3, cloth: 1, planks: 6, fishCooked: 2 },
      ],
    },
    treasure: null,
    gear: { axe: 1, pick: 1, spear: 1, torch: 1 },
    climate: { dayCold: 0, nightCold: 1.25, weather: "fog" },
    raid: (n) => [...many("crab", 3), ...many("drowned", Math.min(7, 2 + n)), ...many("brute", Math.min(3, Math.ceil(n / 2))), ...many("ghost", Math.min(4, n))],
    wild: [],
    boss: true,
    escape: "ship",
    provisions: 0,
    objectives: [
      { text: "Build a campfire and a workbench", done: (p) => p.made("campfire") && p.made("workbench") },
      { text: "Find the keeper's store and search its crates", done: (p) => p.opened >= 3, count: (p) => tally(p.opened, 3) },
      { text: "Craft a war hammer", done: (p) => p.owns("hammer") },
      { text: "Wall in your camp: six fences, gates or palisades", done: (p) => p.standing(WALLS) >= 6, count: (p) => tally(p.standing(WALLS), 6) },
      { text: "Build the signal fire", done: (p) => p.made("signal") },
      { text: "Build a raft on the shore", done: (p) => p.made("raft") },
      { text: "Light the signal fire at dusk and keep it burning until dawn", done: (p) => p.ship },
      { text: "A ship! Board the raft", done: (p) => p.sailed },
    ],
    bonus: { text: "Defeat the Drowned Captain", done: (p) => kills(p, "captain") >= 1 },
    par: 6,
    notes: [
      "Ships pass this rock. One night of smoke and flame on the shore and they'll see you.",
      "Their captain can't stand a signal fire. When it burns he comes himself — and he stamps fires out.",
    ],
    flotsam: 2,
  },
];

export const islandIndex = (id: string) => ISLANDS.findIndex((i) => i.id === id);

// --- Stars & shells ----------------------------------------------------------------------------------

/** Shells for each thing ticked off the list, for leaving the island, and for every new star. */
export const REWARD = { objective: 12, escape: (island: number) => 70 + island * 30, star: 40 };

export interface Outcome {
  island: number;
  /** In-game days since landing. */
  days: number;
  /** The day you left on (1-based). */
  day: number;
  faints: number;
  bonus: boolean;
}

/**
 * The three stars of an island as bits: 1 for getting off it, 2 for leaving by the par day, 4 for its
 * bonus goal. They are kept per island as such a mask and add up over visits.
 */
export function starMask(o: Pick<Outcome, "island" | "day" | "bonus">) {
  const def = ISLANDS[o.island];
  return 1 | (o.day <= def.par ? 2 : 0) | (o.bonus ? 4 : 0);
}

export const starCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);

// --- Shop ---------------------------------------------------------------------------------------------

export interface CastawayDef {
  id: string;
  name: string;
  /** Library model. */
  model: string;
  price: number;
  perk: string;
}

export const CASTAWAYS: CastawayDef[] = [
  { id: "sam", name: "Sam", model: CHAR.player, price: 0, perk: "The deckhand. No tricks, just grit." },
  { id: "mara", name: "Mara", model: CHAR.mara, price: 180, perk: "Forager: berries, coconuts and mushrooms fill you up half as much again." },
  { id: "otto", name: "Otto", model: CHAR.otto, price: 280, perk: "Lumberjack: two more wood from every tree." },
  { id: "ines", name: "Ines", model: CHAR.ines, price: 380, perk: "Angler: the green fishing zone is much wider." },
  { id: "brom", name: "Brom", model: CHAR.brom, price: 480, perk: "Brawler: every blow hits a quarter harder." },
  { id: "yuki", name: "Yuki", model: CHAR.yuki, price: 600, perk: "Hardy: the cold takes hold a third slower." },
];

export interface PerkDef {
  id: string;
  name: string;
  /** What one level does. */
  desc: string;
  /** Price of each level. */
  prices: number[];
}

export const PERKS: PerkDef[] = [
  { id: "vigor", name: "Tough skin", desc: "+15 health per level.", prices: [100, 200, 340] },
  { id: "belly", name: "Iron stomach", desc: "Hunger drops 10% slower per level.", prices: [100, 200, 340] },
  { id: "coat", name: "Thick coat", desc: "Cold bites 15% slower per level.", prices: [100, 200, 340] },
  { id: "arm", name: "Strong arm", desc: "+12% damage per level.", prices: [120, 240, 380] },
  { id: "comber", name: "Beachcomber", desc: "One more crate washes up each morning per level.", prices: [150, 320] },
  { id: "pack", name: "Tight pack", desc: "You drop nothing when you pass out.", prices: [300] },
];

export interface KitDef {
  id: string;
  name: string;
  price: number;
  desc: string;
  items: Loot;
}

export const KITS: KitDef[] = [
  { id: "none", name: "Empty pockets", price: 0, desc: "Only what the island's crossing left you.", items: {} },
  { id: "woodcutter", name: "Woodcutter's kit", price: 140, desc: "A stone axe and 8 wood.", items: { axe: 1, wood: 8 } },
  { id: "fisher", name: "Fisher's kit", price: 200, desc: "A spear and 3 grilled fish.", items: { spear: 1, fishCooked: 3 } },
  { id: "camper", name: "Camper's kit", price: 260, desc: "A torch, and the makings of a campfire and a bedroll.", items: { torch: 1, wood: 5, stone: 4, fiber: 8, cloth: 1 } },
  { id: "builder", name: "Builder's kit", price: 360, desc: "10 planks, 3 scrap metal and 2 sailcloth.", items: { planks: 10, scrap: 3, cloth: 2 } },
  { id: "veteran", name: "Veteran's kit", price: 600, desc: "Stone axe, pickaxe, spear, torch and 4 coconuts.", items: { axe: 1, pick: 1, spear: 1, torch: 1, coconut: 4 } },
];

export type ShopTab = "castaway" | "perk" | "kit";
export const ownedKey = (tab: "castaway" | "kit", id: string) => `${tab}:${id}`;

/** What the engine needs to know about the player's purchases. */
export interface Loadout {
  castaway: string;
  kit: string;
  perks: Record<string, number>;
}

export const perkLevel = (l: Loadout, id: string) => Math.max(0, Math.min(PERKS.find((p) => p.id === id)?.prices.length ?? 0, Math.floor(l.perks[id] ?? 0)));

// --- Saved progress -----------------------------------------------------------------------------------

export const PROGRESS_DEFAULTS = {
  shells: 0,
  /** The stars of each island as a mask (see starMask; 0 = not escaped yet). */
  stars: [] as number[],
  /** Fastest escape per island, in days (0 = none). */
  best: [] as number[],
  owned: [] as string[],
  perks: {} as Record<string, number>,
  castaway: "sam",
  kit: "none",
  escapes: 0,
  kills: 0,
  achievements: [] as string[],
};

export type ProgressSave = typeof PROGRESS_DEFAULTS;

const int = (v: unknown, lo: number, hi: number, fallback = lo) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : []);

/** A save as the game can use it: whatever is missing, of the wrong type or out of range is put right. */
export function saneProgress(raw: unknown): ProgressSave {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, hi: number, float = false) =>
    ISLANDS.map((_, i) => {
      const n = Array.isArray(v) ? Number(v[i]) : NaN;
      if (!Number.isFinite(n) || n < 0) return 0;
      return float ? Math.min(hi, Math.round(n * 10) / 10) : Math.min(hi, Math.floor(n));
    });
  const owned = strings(r.owned);
  const perks: Record<string, number> = {};
  const rawPerks = (r.perks && typeof r.perks === "object" ? r.perks : {}) as Record<string, unknown>;
  for (const p of PERKS) perks[p.id] = int(rawPerks[p.id], 0, p.prices.length);
  const has = (tab: "castaway" | "kit", id: unknown, items: { id: string; price: number }[]) => {
    const item = items.find((i) => i.id === id);
    return item && (item.price === 0 || owned.includes(ownedKey(tab, item.id))) ? item.id : items[0].id;
  };
  return {
    shells: int(r.shells, 0, 9_999_999),
    // (A star mask always has the "escaped" bit when it has any.)
    stars: list(r.stars, 7).map((m) => (m > 0 ? m | 1 : 0)),
    best: list(r.best, 9999, true),
    owned,
    perks,
    castaway: has("castaway", r.castaway, CASTAWAYS),
    kit: has("kit", r.kit, KITS),
    escapes: int(r.escapes, 0, 9_999_999),
    kills: int(r.kills, 0, 9_999_999),
    achievements: strings(r.achievements),
  };
}

/** An island can be played once the one before it has been escaped. */
export const islandOpen = (save: ProgressSave, i: number) => i === 0 || (save.stars[i - 1] ?? 0) > 0;

/** The island to play next: the first one not escaped yet (the last one once all are). */
export const nextIsland = (save: ProgressSave) => {
  const i = ISLANDS.findIndex((_, n) => !(save.stars[n] > 0));
  return i < 0 ? ISLANDS.length - 1 : i;
};

export const totalStars = (save: ProgressSave) => save.stars.reduce((a, b) => a + starCount(b), 0);
