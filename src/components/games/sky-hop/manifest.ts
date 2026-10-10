import type { GameEntry } from "@/lib/games";
import { HEROES } from "./content";

/** Sky Hop — every model it uses, from the site's own library (public/library). No three.js here. */

const pk = (name: string) => `platformer-kit/${name}`;

/** The five free heroes (they load with the game; the others when first picked in the shop). */
const FREE_HEROES = HEROES.filter((h) => h.price === 0).map((h) => h.key);

/** Island blocks per biome: the builder picks the largest tile that fits. */
export const BLOCKS = {
  grass: {
    large: pk("block-grass-overhang-large"),
    long: pk("block-grass-overhang-long"),
    one: pk("block-grass-overhang-corner"),
    lowLarge: pk("block-grass-overhang-low-large"),
    lowLong: pk("block-grass-overhang-low-long"),
    low: pk("block-grass-overhang-low"),
    tall: pk("block-grass-large-tall"),
    slope: pk("block-grass-large-slope"),
  },
  snow: {
    large: pk("block-snow-overhang-large"),
    long: pk("block-snow-overhang-long"),
    one: pk("block-snow-overhang-corner"),
    lowLarge: pk("block-snow-overhang-low-large"),
    lowLong: pk("block-snow-overhang-low-long"),
    low: pk("block-snow-overhang-low"),
    tall: pk("block-snow-large-tall"),
  },
} as const;

/** Gameplay pieces and decoration. */
export const M = {
  coin: pk("coin-gold"),
  star: pk("star"),
  heart: pk("heart"),
  key: pk("key"),
  lock: pk("lock"),
  chest: pk("chest"),
  flag: pk("flag"),
  spring: pk("spring"),
  spikes: pk("trap-spikes-large"),
  spikeBlock: pk("spike-block"),
  saw: pk("saw"),
  crate: pk("crate"),
  crateStrong: pk("crate-strong"),
  crateItem: pk("crate-item"),
  brick: pk("brick"),
  mover: pk("block-moving-large"),
  moverBlue: pk("block-moving-blue"),
  plank: pk("platform"),
  jewel: pk("jewel"),
  tree: pk("tree"),
  treePine: pk("tree-pine"),
  treePineSmall: pk("tree-pine-small"),
  treeSnow: pk("tree-snow"),
  treePineSnow: pk("tree-pine-snow"),
  treePineSnowSmall: pk("tree-pine-snow-small"),
  flowers: pk("flowers"),
  flowersTall: pk("flowers-tall"),
  grass: pk("grass"),
  mushrooms: pk("mushrooms"),
  rocks: pk("rocks"),
  stones: pk("stones"),
  plant: pk("plant"),
  fence: pk("fence-low-straight"),
  sign: pk("sign"),
  arrow: pk("arrow"),
  barrel: pk("barrel"),
} as const;

export const ENEMIES = {
  crab: "cube-pets/animal-crab",
  bee: "cube-pets/animal-bee",
  hog: "cube-pets/animal-hog",
  penguin: "cube-pets/animal-penguin",
  polar: "cube-pets/animal-polar",
} as const;

export type EnemyKind = keyof typeof ENEMIES;

/** What the game loads before the menu. Load order matters: the menu island (heroes, grass blocks, trees) comes first. */
export const MODELS: string[] = [
  ...FREE_HEROES,
  ...Object.values(BLOCKS.grass),
  M.tree,
  M.treePine,
  M.flowers,
  M.grass,
  ...Object.values(M).filter((k) => k !== M.tree && k !== M.treePine && k !== M.flowers && k !== M.grass),
  ...Object.values(ENEMIES),
  ...Object.values(BLOCKS.snow),
];

export const GAME: GameEntry = {
  slug: "sky-hop",
  title: "Sky Hop",
  tagline: "Run, double-jump and stomp across floating sky islands.",
  description:
    "A 3D platformer across six worlds of floating sky islands — Sunny Meadow, Autumn Woods, Frosty Peaks, Desert Canyon, Candy Clouds and Volcano Peak — with ten stages in each. Double-jump over gaps, ride moving platforms and lifts, bounce on springs, dodge spikes and saws, stomp crabs, bees, hogs, penguins and polar bears, ground-pound crates, and find the three hidden stars in every stage. Save your coins to unlock new worlds, 15 heroes with their own powers (glide, triple jump, coin magnet…) and 10 skins.",
  genre: "3D platformer",
  accent: "#facc15",
  cover: "/games/sky-hop/cover.webp",
  trailer: { src: "/games/sky-hop/trailer.mp4", hd: "/games/sky-hop/trailer-1080.mp4", poster: "/games/sky-hop/trailer-poster.webp", seconds: 41 },
  preview: "/games/sky-hop/card-loop.mp4",
  models: [...MODELS, ...HEROES.filter((h) => h.price > 0).map((h) => h.key)],
  collections: ["Platformer Kit", "Cube Pets", "Mini Characters", "Mini Arcade", "Mini Forest", "Mini Arena", "Graveyard Kit"],
  controls: [
    { action: "Move", keys: ["W", "A", "S", "D", "Arrows"], touch: "Touch & drag on the left half" },
    { action: "Jump / double jump (hold = higher)", keys: ["Space"], touch: "Jump button" },
    { action: "Ground pound (in the air)", keys: ["Shift"], touch: "Pound button" },
    { action: "Turn the camera", keys: ["Q", "E", "Mouse drag"], touch: "Drag on the right half" },
    { action: "Back to last checkpoint", keys: ["R"], touch: "Pause → Checkpoint" },
    { action: "Start / continue", keys: ["Enter"], touch: "Tap the buttons" },
    { action: "Shop", keys: ["S"], touch: "Shop button" },
  ],
  howTo: [
    "Six worlds, ten stages each. Reach the big flag at the end of a stage to open the next one. Touch the small flags on the way — they are checkpoints and refill your hearts.",
    "Coins you pick up are saved when a stage ends (more in later worlds). Spend them in the Shop on new worlds, heroes with special powers, and skins.",
    "Press jump again in mid-air for a flipping double jump. Hold jump for a higher jump, tap it for a short hop.",
    "Jump on crabs, bees, hogs and penguins to stomp them (polar bears take two). Touching them from the side costs a heart. Hogs charge when they see you!",
    "Ground pound (Shift in the air) smashes crates and every enemy around you. Wooden crates also break when you bump them from below; metal ones only break with a pound.",
    "Every stage hides three stars: one inside a metal crate, one somewhere high or out of the way, and one in the chest that the stage's key opens.",
    "Springs launch you high, moving platforms carry you, and brick blocks crumble a moment after you land on them.",
    "Coins: 100 of them earn an extra life. Falling off the islands costs a life — you restart at the last checkpoint.",
    "Snow is slippery! Start braking early in Frosty Peaks.",
  ],
  touchHowTo: [
    "Six worlds, ten stages each. Reach the big flag at the end of a stage to open the next one. Touch the small flags on the way — they are checkpoints and refill your hearts.",
    "Coins you pick up are saved when a stage ends (more in later worlds). Spend them in the Shop on new worlds, heroes with special powers, and skins.",
    "Tap Jump again in mid-air for a flipping double jump. Hold Jump for a higher jump, tap it for a short hop.",
    "Jump on crabs, bees, hogs and penguins to stomp them (polar bears take two). Touching them from the side costs a heart. Hogs charge when they see you!",
    "In the air, tap the Pound button (next to Jump) to ground pound: it smashes crates and every enemy around you. Wooden crates also break when you bump them from below; metal ones only break with a pound.",
    "Every stage hides three stars: one inside a metal crate, one somewhere high or out of the way, and one in the chest that the stage's key opens.",
    "Springs launch you high, moving platforms carry you, and brick blocks crumble a moment after you land on them.",
    "Coins: 100 of them earn an extra life. Falling off the islands costs a life — you restart at the last checkpoint (or tap Checkpoint in the pause menu).",
    "Snow is slippery! Start braking early in Frosty Peaks.",
  ],
  features: ["6 worlds, 60 stages — meadow to volcano", "15 heroes with powers & 10 skins in the shop", "Double jump, ground pound & enemy stomps", "Hidden stars, keys & treasure chests"],
  music: "Sky Hop",
};
