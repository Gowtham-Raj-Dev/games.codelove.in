import type { GameEntry } from "@/lib/games";

/** Putt Paradise — every model it uses, from the site's own library (public/library). No three.js here. */

/** The three balls, each with its matching putter. */
export const BALLS = [
  { key: "minigolf-kit/ball-red", club: "minigolf-kit/club-red", name: "Coral", color: "#f87171" },
  { key: "minigolf-kit/ball-blue", club: "minigolf-kit/club-blue", name: "Lagoon", color: "#818cf8" },
  { key: "minigolf-kit/ball-green", club: "minigolf-kit/club-green", name: "Fairway", color: "#34d399" },
] as const;

/** Course pieces, in the order the holes first use them (see course.ts). */
export const COURSE = [
  "minigolf-kit/end",
  "minigolf-kit/straight",
  "minigolf-kit/bump-walls",
  "minigolf-kit/hole-round",
  "minigolf-kit/hill-round",
  "minigolf-kit/round-corner-a",
  "minigolf-kit/hole-square",
  "minigolf-kit/crest",
  "minigolf-kit/castle",
  "minigolf-kit/ramp",
  "minigolf-kit/supports-low",
  "minigolf-kit/windmill",
  "minigolf-kit/corner",
  "minigolf-kit/open",
  "minigolf-kit/supports",
  "minigolf-kit/bump",
  "minigolf-kit/ramp-high",
  "minigolf-kit/tunnel-wide",
  "minigolf-kit/side",
  "minigolf-kit/obstacle-diamond",
  "minigolf-kit/hole-open",
  "minigolf-kit/ramp-large",
  "minigolf-kit/spline-default-looping",
];

export const FLAGS = ["minigolf-kit/flag-red", "minigolf-kit/flag-blue", "minigolf-kit/flag-green"];

/** Islands and everything growing on them or floating around them. */
export const DECO = {
  island: "nature-kit/platform-grass",
  beach: "nature-kit/platform-beach",
  palms: ["nature-kit/tree-palm", "nature-kit/tree-palm-bend", "nature-kit/tree-palm-detailed-tall", "nature-kit/tree-palm-short", "nature-kit/tree-palm-tall"],
  trees: ["nature-kit/tree-default", "nature-kit/tree-oak", "nature-kit/tree-fat"],
  bushes: ["nature-kit/plant-bush", "nature-kit/plant-bush-large", "nature-kit/plant-bush-detailed", "nature-kit/plant-bush-small"],
  flowers: ["nature-kit/flower-purple-a", "nature-kit/flower-red-a", "nature-kit/flower-yellow-a", "nature-kit/flower-red-b", "nature-kit/flower-purple-b", "nature-kit/flower-yellow-b"],
  grass: ["nature-kit/grass", "nature-kit/grass-large", "nature-kit/grass-leafs"],
  rocks: ["nature-kit/rock-large-a", "nature-kit/rock-large-b", "nature-kit/rock-small-a", "nature-kit/rock-small-b"],
  seaRocks: ["nature-kit/rock-tall-a", "nature-kit/rock-tall-c"],
  lilies: ["nature-kit/lily-large", "nature-kit/lily-small"],
  canoe: "nature-kit/canoe",
} as const;

const DECO_KEYS = [
  DECO.island,
  DECO.beach,
  ...DECO.palms,
  ...DECO.trees,
  ...DECO.bushes,
  ...DECO.flowers,
  ...DECO.grass,
  ...DECO.rocks,
  ...DECO.seaRocks,
  ...DECO.lilies,
  DECO.canoe,
];

/** Load order matters: the course and the balls first, then the islands, then the greenery. */
export const MODELS: string[] = [...COURSE, ...BALLS.map((b) => b.key), ...FLAGS, ...BALLS.map((b) => b.club), ...DECO_KEYS];

export const GAME: GameEntry = {
  slug: "putt-paradise",
  title: "Putt Paradise",
  tagline: "Nine dreamy mini-golf holes. Ramps, loops and windmills.",
  description:
    "A 3D mini-golf game with real ball physics on a tropical archipelago. Pull back to putt and roll through ramps, bumps, a castle gate, a windmill, a bridge over the lagoon, a sky jump and a loop-de-loop on nine handcrafted holes. Beat par, chase holes-in-one and post your best round.",
  genre: "Mini golf",
  accent: "#2dd4bf",
  cover: "/games/putt-paradise/cover.webp",
  models: MODELS,
  collections: ["Minigolf Kit", "Nature Kit"],
  controls: [
    { action: "Aim and set power", keys: ["Drag back", "A", "D", "W", "S"], touch: "Drag back from the ball" },
    { action: "Putt", keys: ["Release", "Space"], touch: "Let go" },
    { action: "Orbit / zoom camera", keys: ["Q", "E", "Drag", "Wheel"], touch: "Drag away from the ball · pinch · twist" },
    { action: "Overview of the hole", keys: ["Tab"], touch: "Map button (flag to go back)" },
    { action: "Replay the hole", keys: ["R"], touch: "Pause → Replay" },
  ],
  howTo: [
    "Get the ball in the cup in as few strokes as you can. Each hole shows its par.",
    "Drag back from the ball like a slingshot: the dotted line shows the direction, its length and colour the power. Release to putt.",
    "Bank shots off the walls to get round corners.",
    "Ramps and the loop need speed; bumps and hills nudge the ball.",
    "Off the course or into the lagoon costs a stroke and puts the ball back. After 10 strokes the hole ends.",
  ],
  touchHowTo: [
    "Get the ball in the cup in as few strokes as you can. Each hole shows its par.",
    "Put your finger on the ball and drag back like a slingshot: the dotted line shows the direction, its length and colour the power. Let go to putt — a very short pull cancels.",
    "Bank shots off the walls to get round corners.",
    "Ramps and the loop need speed; bumps and hills nudge the ball.",
    "Off the course or into the lagoon costs a stroke and puts the ball back. After 10 strokes the hole ends.",
    "Drag anywhere away from the ball to look around. With two fingers, pinch to zoom and twist to turn. The map button shows the whole hole.",
  ],
  features: ["Real rolling physics", "9 handcrafted island holes", "Windmill, castle, sky jump & loop", "Best round & holes-in-one saved"],
  music: "Fairway Breeze",
};
