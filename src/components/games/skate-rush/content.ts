/**
 * Skate Rush's shop: skaters, skins (finishes for any skater), boards and stages, with their prices
 * in coins. No three.js here — the menus, the engine and the build scripts all read it.
 */

export type ShopKind = "skater" | "skin" | "board" | "stage";

export interface ShopItem {
  id: string;
  name: string;
  /** Coins; 0 = free from the start. */
  price: number;
}

// --- Skaters ---------------------------------------------------------------------------------------

export interface SkaterDef extends ShopItem {
  /** Library model (every one shares the Mini Skate rig, so the skate animations fit). */
  key: string;
}

export const SKATERS: readonly SkaterDef[] = [
  { id: "skate-boy", name: "Skate Boy", price: 0, key: "mini-skate/character-skate-boy" },
  { id: "skate-girl", name: "Skate Girl", price: 0, key: "mini-skate/character-skate-girl" },
  { id: "pixel", name: "Pixel", price: 500, key: "mini-arcade/character-gamer" },
  { id: "bella", name: "Bella", price: 1000, key: "mini-characters/character-female-b" },
  { id: "dj-mia", name: "DJ Mia", price: 1500, key: "mini-characters/character-female-c" },
  { id: "big-ben", name: "Big Ben", price: 1500, key: "mini-characters/character-male-b" },
  { id: "dr-lee", name: "Dr. Lee", price: 2000, key: "mini-characters/character-female-e" },
  { id: "officer", name: "Officer Max", price: 2500, key: "mini-characters/character-male-c" },
  { id: "professor", name: "Professor", price: 3000, key: "mini-characters/character-male-e" },
  { id: "agent", name: "Agent Zero", price: 4000, key: "mini-characters/character-male-d" },
  { id: "keeper", name: "Gravekeeper", price: 4000, key: "graveyard-kit/character-keeper" },
  { id: "knight", name: "Knight", price: 5000, key: "mini-arena/character-soldier" },
  { id: "elf", name: "Elf Ranger", price: 6000, key: "mini-forest/character-archer" },
  { id: "warrior", name: "Warrior", price: 6000, key: "mini-dungeon/character-human" },
  { id: "orc", name: "Orc Brute", price: 8000, key: "mini-dungeon/character-orc" },
  { id: "zombie", name: "Zombie", price: 8000, key: "graveyard-kit/character-zombie" },
  { id: "vampire", name: "Count Vamp", price: 10000, key: "graveyard-kit/character-vampire" },
  { id: "skeleton", name: "Bones", price: 12000, key: "graveyard-kit/character-skeleton" },
];

/** The skate animations come from this model; it is always loaded. */
export const RIG_KEY = SKATERS[0].key;

// --- Skins -----------------------------------------------------------------------------------------

export type SkinLook = "classic" | "shadow" | "frost" | "toxic" | "neon" | "lava" | "chrome" | "gold" | "galaxy" | "rainbow";

export interface SkinDef extends ShopItem {
  look: SkinLook;
  /** Swatch for the shop card (CSS background). */
  swatch: string;
}

export const SKINS: readonly SkinDef[] = [
  { id: "classic", name: "Classic", price: 0, look: "classic", swatch: "linear-gradient(135deg, #f8b26a, #e0533d 55%, #3b82f6)" },
  { id: "shadow", name: "Shadow", price: 1500, look: "shadow", swatch: "radial-gradient(circle at 35% 30%, #4c1d95, #0b0614 70%)" },
  { id: "frost", name: "Frost", price: 2500, look: "frost", swatch: "linear-gradient(135deg, #ffffff, #bae6fd 45%, #38bdf8)" },
  { id: "toxic", name: "Toxic", price: 3500, look: "toxic", swatch: "repeating-linear-gradient(0deg, #14532d 0 6px, #4ade80 6px 8px)" },
  { id: "neon", name: "Neon", price: 5000, look: "neon", swatch: "linear-gradient(135deg, #0f0f1a 30%, #22d3ee 50%, #e879f9 70%, #0f0f1a)" },
  { id: "lava", name: "Lava", price: 6500, look: "lava", swatch: "radial-gradient(circle at 30% 70%, #fde047, #f97316 25%, #7c2d12 55%, #1c0a05)" },
  { id: "chrome", name: "Chrome", price: 8000, look: "chrome", swatch: "linear-gradient(160deg, #f8fafc, #94a3b8 40%, #f1f5f9 55%, #475569)" },
  { id: "gold", name: "Gold", price: 9000, look: "gold", swatch: "linear-gradient(150deg, #fff7c2, #f5c542 35%, #b7791f 65%, #fde68a)" },
  { id: "galaxy", name: "Galaxy", price: 10000, look: "galaxy", swatch: "radial-gradient(circle at 70% 30%, #f0abfc 0 2px, transparent 3px), radial-gradient(circle at 30% 60%, #fff 0 1.5px, transparent 2.5px), linear-gradient(135deg, #1e1b4b, #6d28d9 50%, #0c0a2a)" },
  { id: "rainbow", name: "Rainbow", price: 12000, look: "rainbow", swatch: "linear-gradient(135deg, #ef4444, #f59e0b, #facc15, #22c55e, #3b82f6, #a855f7)" },
];

// --- Boards ----------------------------------------------------------------------------------------

export type DeckArt = "classic" | "solid" | "waves" | "checker" | "camo" | "tiger" | "hearts" | "flames" | "galaxy" | "neon" | "gold" | "rainbow" | "hover";
export type Trail = "fire" | "stars" | "neon" | "gold" | "rainbow" | "hover";

export interface BoardDef extends ShopItem {
  art: DeckArt;
  /** Deck colours the art is painted with (art-specific order). */
  colors: string[];
  grip: string;
  wheels: string;
  trucks: string;
  /** Wheels light up. */
  glow?: boolean;
  /** Metallic deck (gold). */
  metal?: boolean;
  /** Particles behind the board while riding. */
  trail?: Trail;
}

export const BOARDS: readonly BoardDef[] = [
  { id: "classic", name: "Classic", price: 0, art: "classic", colors: [], grip: "#3a3a44", wheels: "#f4f4f8", trucks: "#a7afd0" },
  { id: "street", name: "Street Red", price: 500, art: "solid", colors: ["#dc2626", "#7f1d1d"], grip: "#18181b", wheels: "#fafafa", trucks: "#9ca3af" },
  { id: "ocean", name: "Ocean", price: 1000, art: "waves", colors: ["#0ea5e9", "#1e3a8a", "#e0f2fe"], grip: "#1f2937", wheels: "#67e8f9", trucks: "#cbd5e1" },
  { id: "checker", name: "Checker", price: 1500, art: "checker", colors: ["#111111", "#f5f5f5"], grip: "#27272a", wheels: "#ef4444", trucks: "#d4d4d8" },
  { id: "camo", name: "Camo", price: 2000, art: "camo", colors: ["#4d5d2b", "#2f3a1c", "#7a7a46", "#1a2010"], grip: "#262a1c", wheels: "#a3a36b", trucks: "#6b7058" },
  { id: "tiger", name: "Tiger", price: 2500, art: "tiger", colors: ["#f97316", "#111111", "#fed7aa"], grip: "#1c1917", wheels: "#fde68a", trucks: "#a8a29e" },
  { id: "bubblegum", name: "Bubblegum", price: 3000, art: "hearts", colors: ["#f472b6", "#fdf2f8", "#be185d"], grip: "#831843", wheels: "#6ee7b7", trucks: "#fbcfe8" },
  { id: "flames", name: "Hot Rod", price: 4000, art: "flames", colors: ["#111111", "#f97316", "#facc15", "#dc2626"], grip: "#18181b", wheels: "#fb923c", trucks: "#52525b", glow: true, trail: "fire" },
  { id: "galaxy", name: "Galaxy", price: 6000, art: "galaxy", colors: ["#1e1b4b", "#7c3aed", "#f0abfc"], grip: "#0f0a2a", wheels: "#c084fc", trucks: "#6366f1", glow: true, trail: "stars" },
  { id: "neon", name: "Neon Rider", price: 8000, art: "neon", colors: ["#0b0b14", "#22d3ee", "#e879f9"], grip: "#0b0b14", wheels: "#22d3ee", trucks: "#1f2937", glow: true, trail: "neon" },
  { id: "gold", name: "Gold Rush", price: 10000, art: "gold", colors: ["#f5c542", "#b7791f", "#fff3b0"], grip: "#3b2f12", wheels: "#fff7d6", trucks: "#d4a017", metal: true, glow: true, trail: "gold" },
  { id: "rainbow", name: "Rainbow", price: 15000, art: "rainbow", colors: [], grip: "#1f1f2e", wheels: "#ffffff", trucks: "#e5e7eb", glow: true, trail: "rainbow" },
  { id: "hover", name: "Hoverboard", price: 20000, art: "hover", colors: ["#0f172a", "#38bdf8", "#e2e8f0"], grip: "#0f172a", wheels: "#38bdf8", trucks: "#334155", glow: true, trail: "hover" },
];

// --- Stages ----------------------------------------------------------------------------------------

/** How a library model is sized when placed (same meaning as the engine's Fit). */
export type ModelFit = { scale: number } | { height: number } | { width: number } | { length: number } | { box: { x?: number; y?: number; z?: number } };

export interface Placed {
  key: string;
  fit: ModelFit;
}

/** One stretch of the street (a stage cycles through its zones every ~480 m). */
export interface ZoneDef {
  /** Buildings beside the road, one after another. */
  buildings: Placed[];
  /** Space between buildings (m) and extra set-back from the pavement. */
  gap: [number, number];
  setback?: number;
  /** Taller things a row further back (towers, chimneys…), placed with this chance per building. */
  back?: { items: Placed[]; chance: number; from: number; to: number };
  /** Things in the gaps between buildings (trees, gravestones…). */
  gapFill?: Placed[];
  /** Pavement extras placed every few metres. */
  extras: Placed[];
}

export interface StageLook {
  skyTop: string;
  horizon: string;
  ground: string;
  fogNear: number;
  fogFar: number;
  sun: string;
  sunIntensity: number;
  /** Direction the light comes from (unit-ish vector, scaled by the engine). */
  sunDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  env: number;
  exposure: number;
  /** Tints multiplied into the road and pavement models. */
  road?: string;
  walk?: string;
  /** Night: glowing lamps. */
  night?: boolean;
  /** Glass in buildings lights up (city buildings at night). */
  litWindows?: boolean;
  stars?: boolean;
  snow?: boolean;
  fireflies?: boolean;
  /** Snow settles on every upward face. */
  snowCover?: boolean;
  /** Glowing strips along both kerbs. */
  neonKerbs?: [string, string];
  /** Colour of the glow around street lamps (night stages). */
  lampGlow?: string;
  moon?: { color: string; size: number; dir: [number, number, number] };
  planet?: { size: number; dir: [number, number, number] };
  /** Sea beyond the beach, from this distance from the road's centre. */
  water?: { color: string; from: number; ships?: Placed[] };
}

export interface StageRules {
  /** Run speed multiplier. */
  speed: number;
  /** Gravity multiplier (below 1 = floaty, higher jumps). */
  gravity: number;
  /** How quickly the board reaches the new lane (1 = normal, lower = icy). */
  grip: number;
  /** Coins banked at the end of a run are multiplied by this. */
  coins: number;
}

export interface StageDef extends ShopItem {
  blurb: string;
  /** What's different here, for the shop card. */
  perks: string[];
  look: StageLook;
  rules: StageRules;
  zones: ZoneDef[];
  /** Street lamp model (null: none). */
  lamp: Placed | null;
  trafficLights?: boolean;
  /** Oncoming / parked traffic. */
  traffic: Placed[];
  /** Replacements for the jump obstacles (default: red-and-white barrier, cones, construction fence). */
  obstacles?: { barrier?: Placed; cones?: Placed; fence?: Placed };
}

const letters = (from: string, to: string) =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) => String.fromCharCode(from.charCodeAt(0) + i));
const all = (keys: string[], fit: ModelFit): Placed[] => keys.map((key) => ({ key, fit }));

export const DOWNTOWN = letters("a", "n").map((l) => `city-kit-commercial/building-${l}`);
export const SKYSCRAPERS = letters("a", "e").map((l) => `city-kit-commercial/building-skyscraper-${l}`);
export const SUBURB = letters("a", "u").map((l) => `city-kit-suburban/building-type-${l}`);
const INDUSTRIAL = ["a", "b", "c", "d", "e", "f", "g", "k", "l", "m", "n", "o", "q", "r"].map((l) => `city-kit-industrial/building-${l}`);

export const CARS = [
  "car-kit/taxi",
  "car-kit/sedan",
  "car-kit/sedan-sports",
  "car-kit/police",
  "car-kit/suv",
  "car-kit/suv-luxury",
  "car-kit/van",
  "car-kit/hatchback-sports",
  "car-kit/delivery",
  "car-kit/truck",
  "car-kit/garbage-truck",
  "car-kit/ambulance",
  "car-kit/firetruck",
];
const CAR_FIT: ModelFit = { scale: 1.5 };
const TREE_LARGE: Placed = { key: "city-kit-suburban/tree-large", fit: { height: 6.4 } };
const TREE_SMALL: Placed = { key: "city-kit-suburban/tree-small", fit: { height: 4.6 } };
const STREET_LIGHT: Placed = { key: "city-kit-roads/light-curved", fit: { height: 5.4 } };
const HYDRANT: Placed = { key: "city-builder-bits/firehydrant", fit: { height: 0.75 } };
const BENCH: Placed = { key: "city-builder-bits/bench", fit: { width: 1.9 } };
const PLANTER: Placed = { key: "city-kit-suburban/planter", fit: { width: 1.7 } };

const DOWNTOWN_ZONE: ZoneDef = {
  buildings: all(DOWNTOWN, { scale: 7.5 }),
  gap: [0.3, 1.4],
  back: { items: all(SKYSCRAPERS, { scale: 8.5 }), chance: 0.6, from: 20, to: 36 },
  extras: [HYDRANT, BENCH, PLANTER, PLANTER],
};
const SUBURB_ZONE: ZoneDef = {
  buildings: all(SUBURB, { scale: 6.5 }),
  gap: [3, 7],
  setback: 1.5,
  gapFill: [TREE_LARGE, TREE_SMALL],
  extras: [TREE_SMALL, TREE_LARGE, HYDRANT],
};

const DAY: Omit<StageLook, "skyTop" | "horizon" | "ground"> = {
  fogNear: 55,
  fogFar: 160,
  sun: "#fff3e0",
  sunIntensity: 2.6,
  sunDir: [14, 30, 8],
  hemiSky: "#dff0ff",
  hemiGround: "#7d8a66",
  hemiIntensity: 1.25,
  env: 0.45,
  exposure: 1.05,
};

export const STAGES: readonly StageDef[] = [
  {
    id: "city",
    name: "City Rush",
    price: 0,
    blurb: "Downtown towers and leafy suburbs on a sunny day.",
    perks: ["The classic"],
    look: { ...DAY, skyTop: "#5fa8e8", horizon: "#cde3f4", ground: "#8fbf72" },
    rules: { speed: 1, gravity: 1, grip: 1, coins: 1 },
    zones: [DOWNTOWN_ZONE, SUBURB_ZONE],
    lamp: STREET_LIGHT,
    trafficLights: true,
    traffic: all(CARS, CAR_FIT),
  },
  {
    id: "docks",
    name: "Sunset Docks",
    price: 1500,
    blurb: "Warehouses, smoke stacks and big trucks under a burning sky.",
    perks: ["Coins ×1.2", "Heavy trucks"],
    look: {
      ...DAY,
      skyTop: "#4b3f8f",
      horizon: "#ffb38a",
      ground: "#8f8a7e",
      fogNear: 45,
      sun: "#ffad66",
      sunIntensity: 3,
      sunDir: [-22, 13, -26],
      hemiSky: "#ffd2b0",
      hemiGround: "#5a4a5e",
      hemiIntensity: 1.05,
      env: 0.35,
      exposure: 1.08,
      road: "#c8bfb6",
      water: { color: "#3f5f8a", from: 30 },
    },
    rules: { speed: 1, gravity: 1, grip: 1, coins: 1.2 },
    zones: [
      {
        buildings: all(INDUSTRIAL, { scale: 5.5 }),
        gap: [1, 3.5],
        back: {
          items: [
            { key: "city-kit-industrial/chimney-large", fit: { scale: 5.5 } },
            { key: "city-kit-industrial/water-tower", fit: { scale: 5.5 } },
            { key: "city-kit-industrial/detail-tank-large", fit: { scale: 5.5 } },
          ],
          chance: 0.55,
          from: 18,
          to: 30,
        },
        gapFill: [
          { key: "city-kit-industrial/shipping-container-a", fit: { scale: 7 } },
          { key: "city-kit-industrial/shipping-container-b", fit: { scale: 7 } },
          { key: "city-kit-industrial/shipping-container-c", fit: { scale: 7 } },
        ],
        extras: [HYDRANT, { key: "city-kit-industrial/shipping-container-b", fit: { scale: 3.4 } }, { key: "car-kit/cone", fit: { height: 0.7 } }],
      },
    ],
    lamp: STREET_LIGHT,
    traffic: all(["car-kit/truck", "car-kit/delivery", "car-kit/garbage-truck", "car-kit/van", "car-kit/firetruck", "car-kit/suv", "car-kit/taxi"], CAR_FIT),
  },
  {
    id: "snow",
    name: "Snow Village",
    price: 3000,
    blurb: "A snowy holiday village — snowmen, presents and icy roads.",
    perks: ["Coins ×1.4", "Slippery ice"],
    look: {
      ...DAY,
      skyTop: "#8fb1d9",
      horizon: "#e9eff6",
      ground: "#f3f6fa",
      fogNear: 40,
      fogFar: 150,
      sun: "#ffffff",
      sunIntensity: 2.1,
      hemiSky: "#eef4ff",
      hemiGround: "#b8c6d8",
      hemiIntensity: 1.35,
      env: 0.5,
      exposure: 1.02,
      walk: "#e8eef6",
      snow: true,
      snowCover: true,
    },
    rules: { speed: 1, gravity: 1, grip: 0.55, coins: 1.4 },
    zones: [
      {
        buildings: all(SUBURB, { scale: 6.5 }),
        gap: [3, 7],
        setback: 1.5,
        gapFill: [
          { key: "holiday-kit/tree-snow-a", fit: { height: 6 } },
          { key: "holiday-kit/tree-snow-b", fit: { height: 5.2 } },
          { key: "holiday-kit/tree-decorated-snow", fit: { height: 5.6 } },
          { key: "holiday-kit/tree-snow-c", fit: { height: 6.4 } },
        ],
        extras: [
          { key: "holiday-kit/snowman-hat", fit: { height: 1.9 } },
          { key: "holiday-kit/present-a-cube", fit: { height: 0.8 } },
          { key: "holiday-kit/reindeer", fit: { height: 1.6 } },
          { key: "holiday-kit/snow-pile", fit: { width: 2.6 } },
          { key: "holiday-kit/tree-snow-b", fit: { height: 3.6 } },
        ],
      },
    ],
    lamp: { key: "holiday-kit/lantern", fit: { height: 4.2 } },
    traffic: all(CARS.filter((k) => !/garbage|firetruck/.test(k)), CAR_FIT),
    obstacles: {
      barrier: { key: "holiday-kit/snow-bunker", fit: { box: { x: 2.4, y: 0.9, z: 1.2 } } },
      cones: { key: "holiday-kit/present-a-cube", fit: { height: 0.85 } },
    },
  },
  {
    id: "neon",
    name: "Neon Night",
    price: 4000,
    blurb: "Downtown after dark: lit windows, glowing kerbs, faster traffic.",
    perks: ["Coins ×1.6", "+10% speed"],
    look: {
      skyTop: "#04030d",
      horizon: "#2a0f4d",
      ground: "#15112a",
      fogNear: 35,
      fogFar: 155,
      sun: "#8fa3ff",
      sunIntensity: 1.1,
      sunDir: [10, 30, 12],
      hemiSky: "#7b6cff",
      hemiGround: "#2a1640",
      hemiIntensity: 1.05,
      env: 0.3,
      exposure: 1.15,
      road: "#8f88b0",
      walk: "#9a94bb",
      night: true,
      litWindows: true,
      stars: true,
      neonKerbs: ["#22d3ee", "#e879f9"],
      lampGlow: "#ffd6a0",
      moon: { color: "#e0e7ff", size: 18, dir: [-0.5, 0.45, -1] },
    },
    rules: { speed: 1.1, gravity: 1, grip: 1, coins: 1.6 },
    zones: [DOWNTOWN_ZONE],
    lamp: STREET_LIGHT,
    trafficLights: true,
    traffic: all(CARS, CAR_FIT),
  },
  {
    id: "haunted",
    name: "Haunted Hollow",
    price: 6000,
    blurb: "Crypts, crooked pines and jack-o'-lanterns under a full moon.",
    perks: ["Coins ×1.8", "Coffins to jump"],
    look: {
      skyTop: "#140c2b",
      horizon: "#5a4878",
      ground: "#2f3527",
      fogNear: 28,
      fogFar: 145,
      sun: "#b9c6ff",
      sunIntensity: 1.5,
      sunDir: [-12, 26, -18],
      hemiSky: "#8a78c0",
      hemiGround: "#22301c",
      hemiIntensity: 1.0,
      env: 0.3,
      exposure: 1.12,
      road: "#9d97a8",
      walk: "#8f8a99",
      night: true,
      stars: true,
      fireflies: true,
      lampGlow: "#9dff9a",
      moon: { color: "#f4f1d0", size: 26, dir: [0.35, 0.4, -1] },
    },
    rules: { speed: 1, gravity: 1, grip: 1, coins: 1.8 },
    zones: [
      {
        buildings: [
          { key: "graveyard-kit/crypt-large", fit: { scale: 5 } },
          { key: "graveyard-kit/crypt-small", fit: { scale: 5 } },
          { key: "graveyard-kit/crypt", fit: { scale: 5.5 } },
          { key: "graveyard-kit/crypt-large", fit: { scale: 5 } },
        ],
        gap: [2, 5],
        setback: 1,
        back: {
          items: [
            { key: "halloween-bits/tree-dead-large", fit: { height: 9 } },
            { key: "graveyard-kit/pine-crooked", fit: { height: 8 } },
            { key: "graveyard-kit/pine-fall-crooked", fit: { height: 7.5 } },
          ],
          chance: 0.8,
          from: 12,
          to: 26,
        },
        gapFill: [
          { key: "graveyard-kit/gravestone-cross-large", fit: { height: 2 } },
          { key: "graveyard-kit/gravestone-round", fit: { height: 1.3 } },
          { key: "graveyard-kit/pine-crooked", fit: { height: 6.5 } },
        ],
        extras: [
          { key: "halloween-bits/pumpkin-orange-jackolantern", fit: { height: 0.9 } },
          { key: "graveyard-kit/gravestone-round", fit: { height: 1.1 } },
          { key: "halloween-bits/post-lantern", fit: { height: 3.4 } },
        ],
      },
    ],
    lamp: { key: "graveyard-kit/lightpost-double", fit: { height: 4.6 } },
    traffic: all(["car-kit/sedan", "car-kit/suv", "car-kit/van", "car-kit/police", "car-kit/ambulance", "car-kit/hatchback-sports"], CAR_FIT),
    obstacles: {
      barrier: { key: "graveyard-kit/coffin", fit: { box: { x: 2.1, y: 0.8, z: 1.2 } } },
      cones: { key: "halloween-bits/pumpkin-orange-jackolantern", fit: { height: 0.85 } },
    },
  },
  {
    id: "pirate",
    name: "Pirate Cove",
    price: 8000,
    blurb: "A sunny beach road with palm trees, lookout towers and pirate ships.",
    perks: ["Coins ×2", "Sea views"],
    look: {
      ...DAY,
      skyTop: "#2196e3",
      horizon: "#c4ecff",
      ground: "#ead39b",
      fogNear: 60,
      fogFar: 175,
      sun: "#fff1d6",
      sunIntensity: 2.9,
      hemiSky: "#e3f7ff",
      hemiGround: "#d8c18a",
      hemiIntensity: 1.25,
      road: "#d7c7a3",
      walk: "#f0ddb0",
      water: {
        color: "#1aa6c9",
        from: 21,
        ships: [
          { key: "pirate-kit/ship-pirate-medium", fit: { height: 15 } },
          { key: "pirate-kit/ship-small", fit: { height: 13 } },
          { key: "pirate-kit/ship-wreck", fit: { height: 9 } },
        ],
      },
    },
    rules: { speed: 1, gravity: 1, grip: 1, coins: 2 },
    zones: [
      {
        buildings: [
          { key: "pirate-kit/tower-complete-large", fit: { height: 13 } },
          { key: "pirate-kit/structure", fit: { height: 4.2 } },
          { key: "pirate-kit/tower-complete-small", fit: { height: 9 } },
          { key: "pirate-kit/structure", fit: { height: 4.2 } },
        ],
        gap: [4, 9],
        setback: 0.5,
        gapFill: [
          { key: "pirate-kit/palm-straight", fit: { height: 7.5 } },
          { key: "pirate-kit/palm-bend", fit: { height: 7 } },
          { key: "pirate-kit/rocks-sand-a", fit: { height: 3 } },
        ],
        extras: [
          { key: "pirate-kit/palm-bend", fit: { height: 6.5 } },
          { key: "pirate-kit/chest", fit: { height: 0.8 } },
          { key: "pirate-kit/cannon", fit: { height: 1.1 } },
          { key: "pirate-kit/barrel", fit: { height: 0.9 } },
          { key: "pirate-kit/palm-straight", fit: { height: 6.8 } },
        ],
      },
    ],
    lamp: { key: "pirate-kit/flag-pirate-high", fit: { height: 4.6 } },
    traffic: all(["car-kit/taxi", "car-kit/suv", "car-kit/van", "car-kit/hatchback-sports", "car-kit/sedan-sports", "car-kit/delivery"], CAR_FIT),
    obstacles: {
      barrier: { key: "pirate-kit/crate", fit: { box: { x: 2.2, y: 0.9, z: 1.1 } } },
      cones: { key: "pirate-kit/barrel", fit: { height: 0.85 } },
    },
  },
  {
    id: "moon",
    name: "Moon Base",
    price: 10000,
    blurb: "Skate past domes, landers and moon trucks — with low gravity!",
    perks: ["Coins ×2.5", "Low gravity"],
    look: {
      skyTop: "#010208",
      horizon: "#1b2238",
      ground: "#8c8984",
      fogNear: 60,
      fogFar: 175,
      sun: "#ffffff",
      sunIntensity: 3.2,
      sunDir: [20, 24, 10],
      hemiSky: "#a9b8e0",
      hemiGround: "#3b3632",
      hemiIntensity: 0.75,
      env: 0.35,
      exposure: 1.05,
      road: "#77736e",
      walk: "#b3afa8",
      stars: true,
      lampGlow: "#7dd3fc",
      planet: { size: 46, dir: [-0.45, 0.32, -1] },
    },
    rules: { speed: 1, gravity: 0.7, grip: 1, coins: 2.5 },
    zones: [
      {
        buildings: [
          ...all(
            ["a", "b", "c", "d", "e"].map((l) => `space-base-bits/basemodule-${l}`),
            { scale: 5 },
          ),
          { key: "space-base-bits/basemodule-garage", fit: { scale: 5 } },
          { key: "space-base-bits/cargodepot-a", fit: { scale: 5 } },
          { key: "space-base-bits/cargodepot-b", fit: { scale: 5 } },
        ],
        gap: [2, 6],
        setback: 0.5,
        back: {
          items: [
            { key: "space-base-bits/drill-structure", fit: { scale: 5 } },
            { key: "space-base-bits/windturbine-tall", fit: { scale: 4.5 } },
            { key: "space-base-bits/landingpad-large", fit: { scale: 4.5 } },
            { key: "space-base-bits/lander-a", fit: { scale: 4 } },
            { key: "space-base-bits/structure-tall", fit: { scale: 5 } },
          ],
          chance: 0.7,
          from: 14,
          to: 30,
        },
        gapFill: [
          { key: "space-base-bits/rocks-a", fit: { scale: 4 } },
          { key: "space-base-bits/solarpanel", fit: { scale: 4.5 } },
        ],
        extras: [
          { key: "space-base-bits/rock-a", fit: { scale: 3.5 } },
          { key: "space-base-bits/containers-a", fit: { scale: 3.5 } },
          { key: "space-base-bits/solarpanel", fit: { scale: 3 } },
        ],
      },
    ],
    lamp: { key: "space-base-bits/lights", fit: { height: 4.5 } },
    traffic: [
      { key: "space-base-bits/spacetruck", fit: { length: 4.6 } },
      { key: "space-base-bits/spacetruck-large", fit: { length: 5.4 } },
    ],
    obstacles: {
      barrier: { key: "space-base-bits/containers-a", fit: { box: { x: 2.3, y: 0.9, z: 2.0 } } },
      cones: { key: "space-base-bits/rock-a", fit: { height: 0.8 } },
    },
  },
];

export const ITEMS: Record<ShopKind, readonly ShopItem[]> = { skater: SKATERS, skin: SKINS, board: BOARDS, stage: STAGES };

export const findItem = <T extends ShopItem>(list: readonly T[], id: string): T => list.find((i) => i.id === id) ?? list[0];

/** Every library model a stage needs (beyond the base set every stage uses). */
export function stageModels(stage: StageDef): string[] {
  const keys = new Set<string>();
  const add = (p?: Placed | null) => p && keys.add(p.key);
  for (const zone of stage.zones) {
    zone.buildings.forEach(add);
    zone.back?.items.forEach(add);
    zone.gapFill?.forEach(add);
    zone.extras.forEach(add);
  }
  add(stage.lamp);
  stage.traffic.forEach(add);
  stage.look.water?.ships?.forEach(add);
  if (stage.obstacles) Object.values(stage.obstacles).forEach(add);
  return [...keys];
}
