import type { GameEntry } from "@/lib/games";

/** Order Up! — every model it uses, from the site's own library (public/library). No three.js here. */

const R = "restaurant-bits";

/** The diner itself: floor, walls, counters, grill and furniture. */
export const M = {
  floor: `${R}/floor-kitchen`,
  wall: `${R}/wall`,
  wallWindow: `${R}/wall-window-closed`,
  wallDoorway: `${R}/wall-doorway`,
  counterA: `${R}/kitchencounter-straight-a`,
  counterB: `${R}/kitchencounter-straight-b`,
  stove: `${R}/stove-multi`,
  crateLid: `${R}/crate-lid`,
  pan: `${R}/pan-a`,
  board: `${R}/cuttingboard`,
  plate: `${R}/plate`,
  rawPatty: `${R}/food-ingredient-burger-uncooked`,
  rawVeggie: `${R}/food-ingredient-vegetableburger-uncooked`,
  burnt: `${R}/food-ingredient-burger-trash`,
  bin: "coaster-kit/trash",
  coin: "platformer-kit/coin-gold",
  fridge: `${R}/fridge-a-decorated`,
  oven: `${R}/oven`,
  table: `${R}/table-round-a-small-decorated`,
  tableBig: `${R}/table-round-a-decorated`,
  chair: `${R}/chair-a`,
  stool: `${R}/chair-stool`,
  ketchup: `${R}/ketchup`,
  mustard: `${R}/mustard`,
  menu: `${R}/menu`,
  jar: `${R}/jar-a-large`,
  register: "mini-market/cash-register",
  plant: "furniture-kit/potted-plant",
  pillar: `${R}/pillar-a`,
} as const;

/** Ingredients that end up on a burger (also the crates' contents). */
export const FOOD = [
  `${R}/food-ingredient-bun-bottom`,
  `${R}/food-ingredient-bun-top`,
  `${R}/food-ingredient-burger-cooked`,
  `${R}/food-ingredient-vegetableburger-cooked`,
  `${R}/food-ingredient-cheese-slice`,
  `${R}/food-ingredient-lettuce-slice`,
  `${R}/food-ingredient-tomato-slice`,
  `${R}/food-ingredient-onion-rings`,
];

export const CRATE_MODELS = [
  `${R}/crate-steak`,
  `${R}/crate-carrots`,
  `${R}/crate-buns`,
  `${R}/crate-cheese`,
  `${R}/crate-lettuce`,
  `${R}/crate-tomatoes`,
  `${R}/crate-onions`,
];

/** Customers (character-female-a carries blasters, so it stays out of the diner). */
export const CUSTOMERS = [
  "mini-characters/character-female-b",
  "mini-characters/character-male-a",
  "mini-characters/character-female-c",
  "mini-characters/character-male-b",
  "mini-characters/character-female-d",
  "mini-characters/character-male-c",
  "mini-characters/character-female-e",
  "mini-characters/character-male-d",
  "mini-characters/character-female-f",
  "mini-characters/character-male-e",
  "mini-characters/character-male-f",
];

/** Load order matters: the diner and the kitchen the menu shows first, then food, then customers. */
export const MODELS: string[] = [
  M.floor,
  M.counterA,
  M.counterB,
  M.stove,
  M.wall,
  M.wallWindow,
  M.wallDoorway,
  ...CRATE_MODELS,
  M.crateLid,
  M.pan,
  M.board,
  M.plate,
  M.bin,
  ...FOOD,
  M.rawPatty,
  M.rawVeggie,
  M.burnt,
  ...CUSTOMERS,
  M.coin,
  M.fridge,
  M.oven,
  M.table,
  M.tableBig,
  M.chair,
  M.stool,
  M.ketchup,
  M.mustard,
  M.menu,
  M.jar,
  M.register,
  M.plant,
  M.pillar,
];

export const GAME: GameEntry = {
  slug: "order-up",
  title: "Order Up!",
  tagline: "Grill, stack and serve burgers before the customers walk out.",
  description:
    "A 3D cooking rush. Customers walk into your diner with an order floating over their heads. Grill patties (don't burn them!), stack the burger layer by layer exactly as ordered and serve it fast for tips. Each day gets busier, with new recipes and kitchen upgrades.",
  genre: "Cooking time management",
  accent: "#f472b6",
  cover: "/games/order-up/cover.webp",
  models: MODELS,
  collections: ["Restaurant Bits", "Mini Characters", "Coaster Kit", "Platformer Kit", "Mini Market", "Furniture Kit"],
  controls: [
    { action: "Add bun / cheese / lettuce / tomato / onion", keys: ["1", "2", "3", "4", "5"], touch: "Tap a crate" },
    { action: "Put a beef patty on the grill", keys: ["G"], touch: "Tap the grill or the beef crate" },
    { action: "Put a veggie patty on the grill (day 6+)", keys: ["6"], touch: "Tap the veggie crate" },
    { action: "Take a cooked patty (or scrape a burnt one)", keys: ["C"], touch: "Tap the patty" },
    { action: "Serve the matching customer", keys: ["Enter", "Space"], touch: "Tap the plate (Serve) or the customer" },
    { action: "Bin the plate", keys: ["X", "Backspace"], touch: "Tap the bin" },
  ],
  howTo: [
    "Each customer shows the burger they want above their head — build it in exactly that order, bottom to top.",
    "The bun crate gives a bottom bun on an empty plate and a top bun once there's something on it.",
    "Patties start raw: put them on the grill and take them off when the ring turns green. Leave them too long and they burn.",
    "Serve the right burger to the right customer. The faster you serve, the bigger the tip — and serving in a row builds a combo.",
    "Customers' patience bars run down — if one empties, they leave angry and your combo is gone.",
    "Hit the day's money target to open the next day, then spend your cash on kitchen upgrades.",
    "A wrong stack? Bin it with X and start again — but wasted ingredients cost money.",
  ],
  touchHowTo: [
    "Each customer shows the burger they want above their head — tap the crates to build it in exactly that order, bottom to top.",
    "The bun crate gives a bottom bun on an empty plate and a top bun once there's something on it.",
    "Patties start raw: tap the grill to cook one, then tap the patty when the ring turns green. Leave it too long and it burns.",
    "Tap the plate (Serve) to hand the burger to the customer who ordered it. The faster you serve, the bigger the tip — and serving in a row builds a combo.",
    "Customers' patience bars run down — if one empties, they leave angry and your combo is gone.",
    "Hit the day's money target to open the next day, then spend your cash on kitchen upgrades.",
    "A wrong stack? Tap the bin and start again — but wasted ingredients cost money.",
  ],
  features: ["Real 3D burgers built layer by layer", "Grill timing — raw, cooked, burnt", "Customers with patience, tips & combos", "6 days, 11 recipes, endless rush & 6 upgrades"],
  music: "Order Up!",
};
