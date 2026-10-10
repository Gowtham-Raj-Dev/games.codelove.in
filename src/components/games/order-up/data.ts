/**
 * Order Up! — gameplay data shared by the engine and the UI (no three.js here): ingredients,
 * recipes, days, upgrades and the economy.
 */

/** One layer of a burger, bottom to top. */
export type Layer = "bunBottom" | "bunTop" | "patty" | "veggie" | "cheese" | "lettuce" | "tomato" | "onion";

/** What the player can tap: the ingredient crates. */
export type CrateId = "beef" | "veggie" | "bun" | "cheese" | "lettuce" | "tomato" | "onion";

const R = "restaurant-bits";

export const LAYERS: Record<Layer, { name: string; model: string; price: number }> = {
  bunBottom: { name: "Bottom bun", model: `${R}/food-ingredient-bun-bottom`, price: 1 },
  bunTop: { name: "Top bun", model: `${R}/food-ingredient-bun-top`, price: 1 },
  patty: { name: "Beef patty", model: `${R}/food-ingredient-burger-cooked`, price: 3 },
  veggie: { name: "Veggie patty", model: `${R}/food-ingredient-vegetableburger-cooked`, price: 4 },
  cheese: { name: "Cheese", model: `${R}/food-ingredient-cheese-slice`, price: 1 },
  lettuce: { name: "Lettuce", model: `${R}/food-ingredient-lettuce-slice`, price: 1 },
  tomato: { name: "Tomato", model: `${R}/food-ingredient-tomato-slice`, price: 1 },
  onion: { name: "Onion rings", model: `${R}/food-ingredient-onion-rings`, price: 2 },
};

export interface CrateInfo {
  id: CrateId;
  /** Keyboard key (also shown on the crate's label). */
  key: string;
  label: string;
  model: string;
  /** First day this crate is open. */
  unlock: number;
  /** Plate ingredients go straight onto the burger; patties go onto the grill first. */
  grill: boolean;
}

/** Left to right on the counter. */
export const CRATES: CrateInfo[] = [
  { id: "beef", key: "G", label: "Beef", model: `${R}/crate-steak`, unlock: 1, grill: true },
  { id: "veggie", key: "6", label: "Veggie", model: `${R}/crate-carrots`, unlock: 6, grill: true },
  { id: "bun", key: "1", label: "Buns", model: `${R}/crate-buns`, unlock: 1, grill: false },
  { id: "cheese", key: "2", label: "Cheese", model: `${R}/crate-cheese`, unlock: 2, grill: false },
  { id: "lettuce", key: "3", label: "Lettuce", model: `${R}/crate-lettuce`, unlock: 3, grill: false },
  { id: "tomato", key: "4", label: "Tomato", model: `${R}/crate-tomatoes`, unlock: 3, grill: false },
  { id: "onion", key: "5", label: "Onion", model: `${R}/crate-onions`, unlock: 4, grill: false },
];

export interface Recipe {
  id: string;
  name: string;
  layers: Layer[];
  /** First day it is ordered. */
  day: number;
  weight: number;
}

const B: Layer = "bunBottom";
const T: Layer = "bunTop";

export const RECIPES: Recipe[] = [
  { id: "classic", name: "Classic", layers: [B, "patty", T], day: 1, weight: 3 },
  { id: "cheese", name: "Cheeseburger", layers: [B, "patty", "cheese", T], day: 2, weight: 3 },
  { id: "garden", name: "Garden", layers: [B, "patty", "lettuce", "tomato", T], day: 3, weight: 2 },
  { id: "deluxe", name: "Deluxe", layers: [B, "lettuce", "patty", "cheese", "tomato", T], day: 3, weight: 2 },
  { id: "crunch", name: "Onion Crunch", layers: [B, "patty", "onion", "cheese", T], day: 4, weight: 2 },
  { id: "ring", name: "Ring Stack", layers: [B, "patty", "cheese", "onion", "lettuce", T], day: 4, weight: 1.5 },
  { id: "double", name: "Double", layers: [B, "patty", "cheese", "patty", "cheese", T], day: 5, weight: 2 },
  { id: "tower", name: "Big Tower", layers: [B, "patty", "cheese", "patty", "lettuce", "tomato", T], day: 5, weight: 1.2 },
  { id: "veggie", name: "Veggie", layers: [B, "lettuce", "veggie", "tomato", T], day: 6, weight: 2.4 },
  { id: "veggie-deluxe", name: "Veggie Deluxe", layers: [B, "veggie", "cheese", "onion", "lettuce", T], day: 6, weight: 1.4 },
  { id: "monster", name: "Monster", layers: [B, "patty", "cheese", "onion", "patty", "cheese", "lettuce", "tomato", T], day: 7, weight: 0.8 },
];

/** The designed days; after the last one every day is a Rush day with everything on the menu. */
export const DESIGNED_DAYS = 6;

export interface DayPlan {
  day: number;
  rush: boolean;
  /** Seconds the diner is open. */
  length: number;
  target: number;
  /** Seconds between customers at the start and at the end of the day. */
  spawnFrom: number;
  spawnTo: number;
  /** Multiplies every customer's patience. */
  patience: number;
  /** What's new today (shown on the day intro). */
  news: string[];
}

const NEWS: Record<number, string[]> = {
  1: ["classic"],
  2: ["cheese"],
  3: ["garden", "deluxe"],
  4: ["crunch", "ring"],
  5: ["double", "tower"],
  6: ["veggie", "veggie-deluxe"],
  7: ["monster"],
};

export function dayPlan(day: number): DayPlan {
  const rush = day > DESIGNED_DAYS;
  const extra = Math.max(0, day - DESIGNED_DAYS);
  const targets = [0, 60, 95, 135, 170, 200, 230];
  return {
    day,
    rush,
    length: day === 1 ? 120 : 150,
    target: rush ? 230 + extra * 30 : targets[day],
    spawnFrom: rush ? Math.max(4.6, 5.8 - extra * 0.3) : [0, 10, 8.6, 7.6, 7.0, 6.6, 6.2][day],
    spawnTo: rush ? Math.max(3.2, 4.2 - extra * 0.25) : [0, 7.5, 6.6, 5.6, 5.1, 4.7, 4.4][day],
    patience: rush ? Math.max(0.62, 0.8 - extra * 0.04) : [1, 1.15, 1.05, 1, 0.95, 0.9, 0.85][day],
    news: NEWS[day] ?? [],
  };
}

export function recipesFor(day: number) {
  return RECIPES.filter((r) => r.day <= day);
}

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id) ?? RECIPES[0];

/** Menu price of a burger: its ingredients plus a little for the cook. */
export function recipePrice(recipe: Recipe) {
  return 2 + recipe.layers.reduce((n, l) => n + LAYERS[l].price, 0);
}

/** Seconds a customer waits at the counter for this recipe (before day and upgrade multipliers). */
export function recipePatience(recipe: Recipe) {
  return 30 + recipe.layers.length * 4;
}

// --- Upgrades ---------------------------------------------------------------------------------------

export type UpgradeId = "pans" | "grill" | "stools" | "warmer" | "tips" | "burner";

export interface UpgradeInfo {
  id: UpgradeId;
  name: string;
  /** One line per level. */
  text: string[];
  cost: number[];
  icon: string;
}

export const UPGRADES: UpgradeInfo[] = [
  {
    id: "pans",
    name: "Extra pan",
    text: ["A third pan on the grill.", "A fourth pan on the grill."],
    cost: [40, 90],
    icon: `${R}/pan-a`,
  },
  {
    id: "grill",
    name: "Hotter grill",
    text: ["Patties cook in 4.6 s instead of 6 s.", "Patties cook in 3.6 s."],
    cost: [50, 110],
    icon: `${R}/stove-single`,
  },
  {
    id: "burner",
    name: "Gentle burner",
    text: ["Cooked patties take 4 s longer to burn."],
    cost: [45],
    icon: `${R}/food-ingredient-burger-trash`,
  },
  {
    id: "stools",
    name: "Comfy stools",
    text: ["Customers wait 25% longer.", "Customers wait 50% longer."],
    cost: [45, 100],
    icon: `${R}/chair-stool`,
  },
  {
    id: "warmer",
    name: "Bun warmer",
    text: ["Every new plate starts with a bottom bun."],
    cost: [60],
    icon: `${R}/food-ingredient-bun-bottom`,
  },
  {
    id: "tips",
    name: "Tip jar",
    text: ["Tips are 30% bigger.", "Tips are 60% bigger."],
    cost: [35, 80],
    icon: `${R}/jar-a-large`,
  },
];

export type Upgrades = Record<UpgradeId, number>;

export const NO_UPGRADES: Upgrades = { pans: 0, grill: 0, stools: 0, warmer: 0, tips: 0, burner: 0 };

export const COOK_TIME = [6, 4.6, 3.6];
/** Seconds a cooked patty stays good before it burns. */
export const BURN_DELAY = [7, 11];
/** Money a binned item costs (its ingredients are wasted). */
export const wasteCost = (layers: Layer[]) => Math.max(1, Math.ceil(layers.reduce((n, l) => n + LAYERS[l].price, 0) / 2));

export const thumb = (model: string) => `/library/${model}.webp`;

/** Money needed for one, two and three stars, as multiples of the day's target. */
export const STAR_STEPS = [1, 1.5, 2];

/** Stars for a day: one for the target, two at 150 %, three at 200 %. */
export function starsFor(earned: number, target: number) {
  return STAR_STEPS.filter((k) => earned >= target * k).length;
}
