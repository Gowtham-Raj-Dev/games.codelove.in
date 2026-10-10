import type { SkinLook } from "../skate-rush/content";
import type { EnemyKind } from "./manifest";

/**
 * Sky Hop's shop: heroes, skins and worlds, bought with the coins saved after every stage. Plain data
 * (no three.js) so the menus, the engine, the level generator and the build scripts can all read it.
 */

export type ShopKind = "hero" | "skin" | "world";

export interface ShopItem {
  id: string;
  name: string;
  /** Coins; 0 = free from the start. */
  price: number;
}

// --- Heroes ----------------------------------------------------------------------------------------

/** What a hero changes. Every field is optional: the rest stays as the classic hop. */
export interface Perks {
  /** Run speed multiplier. */
  run: number;
  /** Jump height multiplier (on the take-off speed). */
  jump: number;
  /** Hearts per life. */
  hearts: number;
  /** Extra lives at the start of every stage. */
  lives: number;
  /** Coins within this many metres fly to you. */
  magnet: number;
  /** Jumps in the air (1 = double jump, 2 = triple jump). */
  airJumps: number;
  /** Holding jump while falling glides down slowly. */
  glide: boolean;
  /** Multiplies the coins saved after a stage. */
  coinMult: number;
}

export const BASE_PERKS: Perks = { run: 1, jump: 1, hearts: 3, lives: 0, magnet: 0, airJumps: 1, glide: false, coinMult: 1 };

export interface HeroDef extends ShopItem {
  /** Model in the site's library. Every one has the same Kenney animation set (idle, sprint, jump, fall…). */
  key: string;
  /** Body colour for the HUD's lives badge. */
  tint: string;
  perk: string;
  perks: Partial<Perks>;
}

const pk = (name: string) => `platformer-kit/${name}`;

export const HEROES: readonly HeroDef[] = [
  { id: "oobi", name: "Oobi", price: 0, key: pk("character-oobi"), tint: "#a78bfa", perk: "Classic hop", perks: {} },
  { id: "oodi", name: "Oodi", price: 0, key: pk("character-oodi"), tint: "#f472b6", perk: "Classic hop", perks: {} },
  { id: "ooli", name: "Ooli", price: 0, key: pk("character-ooli"), tint: "#facc15", perk: "Classic hop", perks: {} },
  { id: "oopi", name: "Oopi", price: 0, key: pk("character-oopi"), tint: "#34d399", perk: "Classic hop", perks: {} },
  { id: "oozi", name: "Oozi", price: 0, key: pk("character-oozi"), tint: "#fdba74", perk: "Classic hop", perks: {} },
  { id: "pixel", name: "Pixel", price: 300, key: "mini-arcade/character-gamer", tint: "#60a5fa", perk: "+2 lives", perks: { lives: 2 } },
  { id: "bella", name: "Bella", price: 500, key: "mini-characters/character-female-b", tint: "#fb7185", perk: "Coin magnet", perks: { magnet: 3.2 } },
  { id: "ben", name: "Big Ben", price: 800, key: "mini-characters/character-male-b", tint: "#f59e0b", perk: "4 hearts", perks: { hearts: 4 } },
  { id: "lee", name: "Dr. Lee", price: 1100, key: "mini-characters/character-female-e", tint: "#e2e8f0", perk: "Super jump", perks: { jump: 1.1 } },
  { id: "max", name: "Officer Max", price: 1500, key: "mini-characters/character-male-c", tint: "#3b82f6", perk: "Fast runner", perks: { run: 1.15 } },
  { id: "elf", name: "Elf Ranger", price: 2000, key: "mini-forest/character-archer", tint: "#22c55e", perk: "Glides · hold jump", perks: { glide: true } },
  { id: "knight", name: "Sir Hops", price: 2500, key: "mini-arena/character-soldier", tint: "#94a3b8", perk: "4 hearts · +2 lives", perks: { hearts: 4, lives: 2 } },
  { id: "zombie", name: "Zombie", price: 3200, key: "graveyard-kit/character-zombie", tint: "#84cc16", perk: "+30% coins · magnet", perks: { coinMult: 1.3, magnet: 2.6 } },
  { id: "vampire", name: "Count Vamp", price: 4000, key: "graveyard-kit/character-vampire", tint: "#a855f7", perk: "Glides · fast runner", perks: { glide: true, run: 1.12 } },
  { id: "bones", name: "Bones", price: 5000, key: "graveyard-kit/character-skeleton", tint: "#f5f5f4", perk: "Triple jump", perks: { airJumps: 2 } },
];

export const perksOf = (hero: HeroDef): Perks => ({ ...BASE_PERKS, ...hero.perks });

// --- Skins -----------------------------------------------------------------------------------------

export interface SkinDef extends ShopItem {
  look: SkinLook;
  /** Swatch for the shop card (CSS background). */
  swatch: string;
}

export const SKINS: readonly SkinDef[] = [
  { id: "classic", name: "Classic", price: 0, look: "classic", swatch: "linear-gradient(135deg, #fde68a, #facc15 55%, #38bdf8)" },
  { id: "shadow", name: "Shadow", price: 200, look: "shadow", swatch: "radial-gradient(circle at 35% 30%, #4c1d95, #0b0614 70%)" },
  { id: "frost", name: "Frost", price: 350, look: "frost", swatch: "linear-gradient(135deg, #ffffff, #bae6fd 45%, #38bdf8)" },
  { id: "toxic", name: "Toxic", price: 500, look: "toxic", swatch: "linear-gradient(135deg, #052e16, #4ade80 60%, #bef264)" },
  { id: "neon", name: "Neon", price: 700, look: "neon", swatch: "linear-gradient(135deg, #22d3ee, #0b0b1a 50%, #e879f9)" },
  { id: "lava", name: "Lava", price: 900, look: "lava", swatch: "radial-gradient(circle at 40% 40%, #fdba74, #ea580c 35%, #1c0a05 75%)" },
  { id: "chrome", name: "Chrome", price: 1200, look: "chrome", swatch: "linear-gradient(135deg, #f8fafc, #94a3b8 45%, #e2e8f0 70%, #64748b)" },
  { id: "gold", name: "Gold", price: 1600, look: "gold", swatch: "linear-gradient(135deg, #fef08a, #f59e0b 55%, #92400e)" },
  { id: "galaxy", name: "Galaxy", price: 2200, look: "galaxy", swatch: "radial-gradient(circle at 30% 30%, #a78bfa, #3b0764 45%, #020617 80%)" },
  { id: "rainbow", name: "Rainbow", price: 3000, look: "rainbow", swatch: "linear-gradient(135deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #8b5cf6)" },
];

// --- Worlds ----------------------------------------------------------------------------------------

/** Falling (or rising) bits in the air: snow, leaves, sand, petals, embers. */
export interface Weather {
  color: string;
  /** Fall speed multiplier (negative rises). */
  fall: number;
  /** Size multiplier. */
  size: number;
  /** Sideways drift (m/s). */
  wind: number;
  /** Glows (additive). */
  glow?: boolean;
}

export interface WorldLook {
  /** Sky: zenith and horizon (the horizon is also the fog). */
  sky: [string, string];
  /**
   * Island recolour, applied to the kit's colour atlas: grass tops and earth sides of the islands, and
   * the leaves of trees and plants (so the desert can keep green trees on sandy islands). null keeps
   * the kit's own colours.
   */
  top: string | null;
  earth: string | null;
  leaves: string | null;
  sun: string;
  hemiSky: string;
  hemiGround: string;
  exposure: number;
  /** A warm glow added to the islands (the volcano's lava light), 0 = none. */
  glow: number;
  glowColor: string;
  weather: Weather | null;
}

export interface WorldDef extends ShopItem {
  /** Block set: grass islands (recoloured per world) or snowy ones (slippery). */
  theme: "grass" | "snow";
  blurb: string;
  /** Difficulty steps added to every stage. */
  tier: number;
  /** Coins saved after a stage are multiplied by this. */
  coinMult: number;
  /** Enemies the stages are built with. */
  enemies: EnemyKind[];
  /** Ten stage names. */
  stages: string[];
  look: WorldLook;
}

export const WORLDS: readonly WorldDef[] = [
  {
    id: "meadow",
    name: "Sunny Meadow",
    price: 0,
    theme: "grass",
    blurb: "Green hills, crabs and bees",
    tier: 0,
    coinMult: 1,
    enemies: ["crab", "bee", "hog"],
    stages: ["Sunny Meadow", "Breezy Hills", "Daisy Drop", "Crab Cove", "Sawmill Gorge", "Bumblebee Bluff", "Windmill Way", "Clover Climb", "Rainbow Bridge", "Meadow Summit"],
    look: { sky: ["#3f9be8", "#cbe9ff"], top: null, earth: null, leaves: null, sun: "#fff4df", hemiSky: "#e3f2ff", hemiGround: "#9a8a6a", exposure: 1.08, glow: 0, glowColor: "#000000", weather: null },
  },
  {
    id: "autumn",
    name: "Autumn Woods",
    price: 600,
    theme: "grass",
    blurb: "Falling leaves · hogs on the charge",
    tier: 1,
    coinMult: 1.2,
    enemies: ["hog", "bee", "crab"],
    stages: ["Amber Path", "Acorn Alley", "Maple Hop", "Hog Hollow", "Pumpkin Patch", "Rusty Ridge", "Harvest Heights", "Leafy Leap", "Owl Woods", "Autumn Crown"],
    look: {
      sky: ["#4c6fc4", "#d6d2ee"],
      top: "#e3892c",
      earth: "#8a4a32",
      leaves: "#d9452b",
      sun: "#ffc98a",
      hemiSky: "#ffe2c4",
      hemiGround: "#8a5a3a",
      exposure: 1.02,
      glow: 0,
      glowColor: "#000000",
      weather: { color: "#e86a2a", fall: 0.75, size: 2.1, wind: 1.6 },
    },
  },
  {
    id: "frost",
    name: "Frosty Peaks",
    price: 1200,
    theme: "snow",
    blurb: "Slippery snow · penguins and polar bears",
    tier: 2,
    coinMult: 1.4,
    enemies: ["penguin", "polar", "penguin"],
    stages: ["Frosty Peaks", "Icicle Isle", "Penguin Pass", "Blizzard Summit", "Glacier Gap", "Snowball Steps", "Polar Plaza", "Frozen Falls", "Aurora Arch", "Ice Crown"],
    look: { sky: ["#7fb6e8", "#eef6ff"], top: null, earth: null, leaves: null, sun: "#fff4df", hemiSky: "#eef5ff", hemiGround: "#7f8fa8", exposure: 0.94, glow: 0, glowColor: "#000000", weather: { color: "#ffffff", fall: 1, size: 1, wind: 1.2 } },
  },
  {
    id: "desert",
    name: "Desert Canyon",
    price: 2000,
    theme: "grass",
    blurb: "Sunbaked sand · saws and spikes",
    tier: 3,
    coinMult: 1.6,
    enemies: ["crab", "hog", "bee"],
    stages: ["Sandy Start", "Dune Dash", "Cactus Canyon", "Mirage Mesa", "Sunbaked Saws", "Oasis Isle", "Tumbleweed Trail", "Scarab Steps", "Pyramid Peak", "Desert Crown"],
    look: {
      sky: ["#4f8fd6", "#ffe7b8"],
      top: "#f2c879",
      earth: "#c4673e",
      leaves: "#6fa83c",
      sun: "#fff0c8",
      hemiSky: "#fff3d6",
      hemiGround: "#b07850",
      exposure: 1.0,
      glow: 0,
      glowColor: "#000000",
      weather: { color: "#f0cf94", fall: 0.25, size: 0.7, wind: 6 },
    },
  },
  {
    id: "candy",
    name: "Candy Clouds",
    price: 3000,
    theme: "grass",
    blurb: "Sugar islands high in a pink sky",
    tier: 4,
    coinMult: 1.8,
    enemies: ["bee", "crab", "penguin"],
    stages: ["Sugar Skies", "Gumdrop Gap", "Lollipop Lane", "Cotton Clouds", "Jelly Jump", "Marshmallow Mile", "Sprinkle Spires", "Toffee Towers", "Bonbon Bridge", "Candy Castle"],
    look: {
      sky: ["#b48cf0", "#ffd6ef"],
      top: "#ff8fc8",
      earth: "#9b7be8",
      leaves: "#5fe0c8",
      sun: "#fff0fa",
      hemiSky: "#ffe6f6",
      hemiGround: "#8a6ac8",
      exposure: 1.02,
      glow: 0,
      glowColor: "#000000",
      weather: { color: "#ffc2e4", fall: 0.45, size: 1.6, wind: 1 },
    },
  },
  {
    id: "volcano",
    name: "Volcano Peak",
    price: 4500,
    theme: "grass",
    blurb: "Ash and embers · the hardest hops · 2× coins",
    tier: 5,
    coinMult: 2,
    enemies: ["hog", "polar", "crab"],
    stages: ["Ash Approach", "Ember Edge", "Magma Moat", "Cinder Cliffs", "Obsidian Steps", "Lava Lift", "Smoke Stack", "Fire Fang", "Scorch Summit", "Volcano Crown"],
    look: {
      sky: ["#2a0f1e", "#c8502e"],
      top: "#4a4048",
      earth: "#7a2a1e",
      leaves: "#3a3436",
      sun: "#ffb27a",
      hemiSky: "#ffb08a",
      hemiGround: "#5a1a10",
      exposure: 1.05,
      glow: 0.22,
      glowColor: "#ff5a1a",
      weather: { color: "#ff9a3a", fall: -0.6, size: 0.9, wind: 0.8, glow: true },
    },
  },
];

export const ITEMS: Record<ShopKind, readonly ShopItem[]> = { hero: HEROES, skin: SKINS, world: WORLDS };

export const findItem = <T extends ShopItem>(list: readonly T[], id: string): T => list.find((i) => i.id === id) ?? list[0];

/** Stages in every world. */
export const STAGES_PER_WORLD = 10;

/** Coins saved after a stage: what was picked up, 10 per star found and 100 for the world's last stage — times the world's and the hero's multipliers. */
export const stageReward = (coins: number, stars: number, last: boolean, world: WorldDef, hero: HeroDef) =>
  Math.round((coins + stars * 10 + (last ? 100 : 0)) * world.coinMult * perksOf(hero).coinMult);

/** The five original levels (index in levels.ts LEVELS) sit at these stages. */
export const HANDCRAFTED: Record<string, Record<number, number>> = {
  meadow: { 0: 0, 1: 1, 4: 2 },
  frost: { 0: 3, 3: 4 },
};

/** Old saves (five levels): where each old level now lives. */
export const LEGACY_STAGE: [string, number][] = [
  ["meadow", 0],
  ["meadow", 1],
  ["meadow", 4],
  ["frost", 0],
  ["frost", 3],
];
