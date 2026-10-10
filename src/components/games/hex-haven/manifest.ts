import type { GameEntry } from "@/lib/games";
import { KINDS, PROPS } from "./tiles";

/** Hex Haven — every model it uses, from the site's own library (public/library). No three.js here. */

/** Load order matters: plain terrain first (the menu island is mostly terrain), then the rest. */
export const MODELS: string[] = [
  ...new Set([
    ...KINDS.filter((k) => !k.base && !k.village && k.family !== "river").map((k) => k.model),
    ...KINDS.filter((k) => k.family === "river").map((k) => k.model),
    ...KINDS.flatMap((k) => (k.base ? [k.base, k.model] : [])),
    ...KINDS.filter((k) => k.village).map((k) => k.model),
    PROPS.tree,
    PROPS.ship,
    PROPS.flag,
  ]),
];

export const GAME: GameEntry = {
  slug: "hex-haven",
  title: "Hex Haven",
  tagline: "Lay hex tiles, match the edges, grow a tiny kingdom.",
  description:
    "A relaxing 3D tile-laying puzzle. Draw hexagon tiles — meadows, forests, lakes, rivers, roads and villages — and fit them into your growing island. Matching edges score points, perfect fits and finished quests earn more tiles, and the game lasts as long as your stack does.",
  genre: "Puzzle",
  accent: "#34d399",
  cover: "/games/hex-haven/cover.webp",
  models: MODELS,
  collections: ["Hexagon Kit", "Castle Kit"],
  controls: [
    { action: "Place tile", keys: ["Click", "Space"], touch: "Tap a glowing spot, tap again (or Place)" },
    { action: "Rotate tile", keys: ["R", "E", "Q", "Right-click"], touch: "Rotate buttons" },
    { action: "Undo last tile", keys: ["Z"], touch: "Undo button" },
    { action: "Move camera", keys: ["W A S D", "Arrows", "Drag"], touch: "Drag" },
    { action: "Zoom", keys: ["Wheel", "+", "−"], touch: "Pinch" },
    { action: "Turn the view", keys: ["Shift + Q", "Shift + E"] },
  ],
  howTo: [
    "Place the tile in your hand on a glowing spot next to your island. You can see the next three tiles below it.",
    "Rotate it so its sides match the neighbours: every matching side scores 10 points. Green marks match, white marks don't, red marks block.",
    "Rivers must flow into rivers or lakes, and roads must meet roads (or open space). Sand next to a lake counts as a beach match.",
    "Perfect fit: touch 3 or more tiles and match every side for a bonus tile (match all 6 for two).",
    "Tiles with a flag carry a quest such as \"Forest of 8\": grow that connected area to the size shown to win more tiles and points.",
    "The game ends when your stack runs out, so chase perfect fits and quests to keep building.",
  ],
  touchHowTo: [
    "Tap a glowing spot next to your island to try the tile in your hand there, then tap the same spot again (or tap Place) to put it down. The next three tiles wait beside it in the tray.",
    "Turn it with the rotate buttons on either side of the tile so its sides match the neighbours: every matching side scores 10 points. Green marks match, white marks don't, red marks block.",
    "Rivers must flow into rivers or lakes, and roads must meet roads (or open space). Sand next to a lake counts as a beach match.",
    "Perfect fit: touch 3 or more tiles and match every side for a bonus tile (match all 6 for two).",
    "Tiles with a flag carry a quest such as \"Forest of 8\": grow that connected area to the size shown to win more tiles and points.",
    "The game ends when your stack runs out, so chase perfect fits and quests to keep building. Drag to look around, pinch to zoom.",
  ],
  features: ["Relaxing, no timer", "Perfect fits earn extra tiles", "Forest, village, lake, river & road quests", "Animated windmills, boats and swaying trees"],
  music: "Hex Haven",
};
