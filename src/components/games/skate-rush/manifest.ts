import type { GameEntry } from "@/lib/games";
import { SKATERS, STAGES, stageModels } from "./content";

/** Skate Rush — every model it uses, from the site's own library (public/library). No three.js here. */

/** Models every stage uses (the stages swap in their own buildings, props and traffic). */
export const M = {
  board: "mini-skate/skateboard",
  road: "racing-kit/road-straight-long",
  sidewalk: "city-kit-roads/tile-high",
  barrier: "racing-kit/barrier-wall",
  fence: "city-kit-roads/construction-fence",
  cone: "car-kit/cone",
  gate: "racing-kit/overhead",
  coin: "platformer-kit/coin-gold",
  heart: "platformer-kit/heart",
  star: "platformer-kit/star",
  jewel: "platformer-kit/jewel",
  trafficLight: "city-kit-roads/traffic-light",
} as const;

/** Loaded before the menu: the first skater, the shared models and the first stage. */
export const BASE_MODELS = [SKATERS[0].key, ...Object.values(M), ...stageModels(STAGES[0])];

/** Everything the game can load (skaters and stages beyond the first load when picked). */
export const MODELS = [...new Set([...BASE_MODELS, ...SKATERS.map((s) => s.key), ...STAGES.flatMap(stageModels)])];

export const GAME: GameEntry = {
  slug: "skate-rush",
  title: "Skate Rush",
  tagline: "Skate through the city, dodge the traffic, grab every coin.",
  description:
    "An endless 3D skateboard runner. Switch lanes past taxis and fire trucks, kickflip over barriers, duck under gates and collect coins, shields, magnets and score boosters — then spend your coins on 18 skaters, 10 skins, 13 boards and 7 stages, from Snow Village to a low-gravity Moon Base.",
  genre: "Endless runner",
  accent: "#f59e0b",
  cover: "/games/skate-rush/cover.webp",
  trailer: { src: "/games/skate-rush/trailer.mp4", hd: "/games/skate-rush/trailer-1080.mp4", poster: "/games/skate-rush/trailer-poster.webp", seconds: 37 },
  preview: "/games/skate-rush/card-loop.mp4",
  models: MODELS,
  collections: [
    "Mini Skate",
    "Mini Characters",
    "Mini Arcade",
    "Mini Arena",
    "Mini Dungeon",
    "Mini Forest",
    "Car Kit",
    "City Kit Commercial",
    "City Kit Suburban",
    "City Kit Industrial",
    "City Kit Roads",
    "City Builder Bits",
    "Racing Kit",
    "Platformer Kit",
    "Holiday Kit",
    "Graveyard Kit",
    "Halloween Bits",
    "Pirate Kit",
    "Space Base Bits",
  ],
  controls: [
    { action: "Change lane", keys: ["←", "→", "A", "D"], touch: "Swipe left / right" },
    { action: "Jump (kickflip!)", keys: ["↑", "W", "Space"], touch: "Swipe up" },
    { action: "Duck", keys: ["↓", "S"], touch: "Swipe down" },
    { action: "Start / play again", keys: ["Enter"], touch: "Tap Play" },
    { action: "Shop (skaters, skins, boards, stages)", keys: ["B"], touch: "Tap Shop" },
  ],
  howTo: [
    "Run as far as you can — your score grows with distance, and every coin adds 10 points.",
    "Cars block a lane completely: change lanes before you reach them. Watch for oncoming traffic!",
    "Jump over red-and-white barriers, cones and fences. Duck under the gates with a striped bar.",
    "Follow the coin trails — they always lead to a safe lane.",
    "Heart = shield (survives one crash), star = coin magnet, jewel = double score for 10 seconds.",
    "Press ↓ in mid-air to slam down fast and slide straight under a gate.",
    "Spend your coins in the Shop: new skaters, skins, boards with trails, and stages. Later stages pay more coins per run.",
  ],
  touchHowTo: [
    "Run as far as you can — your score grows with distance, and every coin adds 10 points.",
    "Swipe left or right anywhere on the screen to change lanes — a long swipe moves two. Cars block a lane completely: move before you reach them, and watch for oncoming traffic!",
    "Swipe up to jump over red-and-white barriers, cones and fences. Swipe down to duck under the gates with a striped bar.",
    "Follow the coin trails — they always lead to a safe lane.",
    "Heart = shield (survives one crash), star = coin magnet, jewel = double score for 10 seconds.",
    "Swipe down in mid-air to slam down fast and slide straight under a gate.",
    "Spend your coins in the Shop: new skaters, skins, boards with trails, and stages. Later stages pay more coins per run.",
  ],
  features: ["7 stages to unlock", "18 skaters & 10 skins", "13 boards with trails", "Kickflips, shields & magnets"],
  music: "City Rush",
};
