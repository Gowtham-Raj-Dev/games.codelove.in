import type { GameEntry } from "@/lib/games";

/** Castaway — every model it uses, from the site's own library (public/library). No three.js here. */

const s = (name: string) => `survival-kit/${name}`;
const p = (name: string) => `pirate-kit/${name}`;
const n = (name: string) => `nature-kit/${name}`;
const f = (name: string) => `food-kit/${name}`;

/** The castaway and the night creatures. */
export const CHAR = {
  player: "mini-characters/character-male-b",
  crab: "cube-pets/animal-crab",
  drowned: "graveyard-kit/character-skeleton",
  brute: "graveyard-kit/character-zombie",
  ghost: "graveyard-kit/character-ghost",
} as const;

/** Things held in the hand. */
export const HELD = {
  axe: s("tool-axe"),
  axeIron: s("tool-axe-upgraded"),
  pick: s("tool-pickaxe"),
  pickIron: s("tool-pickaxe-upgraded"),
  hammer: s("tool-hammer-upgraded"),
  spear: "mini-dungeon/weapon-spear",
  torch: "dungeon-remastered/torch-lit-gltf",
  lantern: "holiday-kit/lantern-hanging",
} as const;

/** The island: trees, rocks, plants and the wreck. */
export const WORLD = {
  tree: s("tree"),
  treeTall: s("tree-tall"),
  treeAutumn: s("tree-autumn"),
  stump: s("tree-trunk"),
  stumpAutumn: s("tree-autumn-trunk"),
  log: s("tree-log"),
  driftwood: s("tree-log-small"),
  palm: p("palm-straight"),
  palmBend: p("palm-bend"),
  palmDetailed: p("palm-detailed-straight"),
  palmDetailedBend: p("palm-detailed-bend"),
  rockA: s("rock-a"),
  rockB: s("rock-b"),
  rockC: s("rock-c"),
  sandRockA: s("rock-sand-a"),
  sandRockB: s("rock-sand-b"),
  sandRockC: s("rock-sand-c"),
  flatRock: s("rock-flat-grass"),
  bouldersA: p("rocks-a"),
  bouldersB: p("rocks-b"),
  bouldersC: p("rocks-c"),
  sandBouldersA: p("rocks-sand-a"),
  sandBouldersC: p("rocks-sand-c"),
  bush: p("grass-plant"),
  grassPatch: p("grass-patch"),
  grassTuft: p("grass"),
  grass: s("grass"),
  grassLarge: s("grass-large"),
  mushrooms: n("mushroom-tan-group"),
  mushroomsRed: n("mushroom-red-group"),
  flowerRed: n("flower-red-b"),
  flowerYellow: n("flower-yellow-b"),
  flowerPurple: n("flower-purple-b"),
  lily: n("lily-large"),
  wreck: p("ship-wreck"),
  crate: p("crate"),
  barrel: p("barrel"),
  treasure: p("chest"),
  bottle: p("bottle"),
  signpost: s("signpost"),
  ship: p("ship-small"),
} as const;

/** Inventory items (also their icons) and what drops on the ground. */
export const ITEM = {
  wood: s("resource-wood"),
  stone: s("resource-stone"),
  stoneLarge: s("resource-stone-large"),
  planks: s("resource-planks"),
  scrap: s("metal-panel-screws-half"),
  cloth: s("bedroll-packed"),
  berries: f("strawberry"),
  coconut: f("coconut"),
  mushroom: f("mushroom"),
  fish: s("fish"),
  bigFish: s("fish-large"),
  meat: f("meat-raw"),
  meatCooked: f("meat-cooked"),
} as const;

/** Things the castaway builds. */
export const BUILD = {
  campfire: s("campfire-pit"),
  rack: s("campfire-fishing-stand"),
  workbench: s("workbench"),
  bedroll: s("bedroll"),
  tent: s("tent-canvas"),
  fence: s("fence"),
  gate: s("fence-doorway"),
  wall: s("fence-fortified"),
  chest: s("chest"),
  raftDeck: s("floor"),
  raftSail: p("flag"),
  raftBarrel: s("barrel"),
  satchel: s("box-open"),
} as const;

/** What the menu island needs first: terrain props, the castaway and the camp. Creatures and the ship last. */
export const MODELS: string[] = [
  CHAR.player,
  ...Object.values(WORLD).filter((k) => k !== WORLD.ship),
  ...Object.values(ITEM),
  ...Object.values(HELD),
  ...Object.values(BUILD),
  CHAR.crab,
  CHAR.drowned,
  CHAR.brute,
  CHAR.ghost,
  WORLD.ship,
];

export const GAME: GameEntry = {
  slug: "castaway",
  title: "Castaway",
  tagline: "Shipwrecked. Chop, craft and survive until rescue.",
  description:
    "A 3D survival crafting game. Wash up on a wild island, loot the wreck, chop trees, mine rocks, spear fish and craft better tools, a campfire, a shelter and walls. Keep fed and keep warm — when night falls, crabs and drowned sailors crawl out of the sea. Survive, then light a signal fire and build a raft to get home.",
  genre: "Survival crafting",
  accent: "#ea580c",
  cover: "/games/castaway/cover.webp",
  models: MODELS,
  collections: ["Survival Kit", "Pirate Kit", "Nature Kit", "Food Kit", "Mini Characters", "Graveyard Kit", "Cube Pets", "Mini Dungeon", "Dungeon Remastered", "Holiday Kit"],
  controls: [
    { action: "Move / run", keys: ["W", "A", "S", "D", "Shift"], touch: "Left stick (push to the edge to run)" },
    { action: "Gather / attack / use", keys: ["Space", "Click"], touch: "Action button" },
    { action: "Crafting journal", keys: ["C"], touch: "Book button" },
    { action: "Pick hotbar item", keys: ["1–6"], touch: "Tap a slot" },
    { action: "Eat (slot 5 picks the food)", keys: ["E"], touch: "Apple button" },
    { action: "Turn / zoom the camera", keys: ["←", "→", "↑", "↓", "Drag", "Wheel"], touch: "Drag the screen (turn only)" },
    { action: "Rotate / cancel building", keys: ["R", "X", "Right-click"], touch: "Rotate / × buttons" },
  ],
  howTo: [
    "Search the wreck's crates, then pick up driftwood, pebbles and bush fibre. Open the journal (C) to craft a stone axe and pickaxe.",
    "Chop trees for wood and crack rocks for stone. Better tools from the workbench work twice as fast.",
    "Hunger drops all the time: eat berries, coconuts and mushrooms, or spear fish at the bubbling spots and cook them on a campfire.",
    "At night crabs and drowned sailors crawl out of the sea. Most of them fear firelight. Keep the campfire fed with wood, wall in your camp and fight back.",
    "Stay warm at night near a fire or with a torch. Sleep on a bedroll to speed the night up — you'll wake if something comes close.",
    "To escape, build the signal fire and a raft on the shore. Keep the signal burning through a night and a ship will come at dawn.",
  ],
  touchHowTo: [
    "Search the wreck's crates, then pick up driftwood, pebbles and bush fibre with the big action button. Tap the book button above it to open the journal and craft a stone axe and pickaxe.",
    "Chop trees for wood and crack rocks for stone — hold the action button to keep swinging. Better tools from the workbench work twice as fast.",
    "Hunger drops all the time: tap the apple button to eat berries, coconuts and mushrooms (tap slot 5 again to pick the food), or spear fish at the bubbling spots and cook them on a campfire.",
    "At night crabs and drowned sailors crawl out of the sea. Most of them fear firelight. Keep the campfire fed with wood, wall in your camp and fight back.",
    "Stay warm at night near a fire or with a torch. Sleep on a bedroll to speed the night up — you'll wake if something comes close.",
    "To build, walk to the spot, turn the building with the rotate button and tap the action button to place it. To escape, build the signal fire and a raft on the shore — keep the signal burning through a night and a ship will come at dawn.",
  ],
  features: ["Gather, craft & build a camp", "Day/night cycle with night raids", "Hunger, warmth, fishing & cooking", "Signal a ship and escape by raft"],
  music: "Island Drift",
  comingSoon: true,
};
