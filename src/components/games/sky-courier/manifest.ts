import type { GameEntry } from "@/lib/games";

/** Sky Courier — every model it uses, from the site's own library (public/library). No three.js here. */

export const SHIP = "aero-system/aero-airship-01";
/** Windmill sails make the airship's wooden pusher propeller. */
export const PROP = "fantasy-town-kit/windmill";

export const AERO = {
  island: "aero-system/floating-island-01-art",
  station: "aero-system/aero-station-01-art",
  pad: "aero-system/aero-station-mini-platform-art",
  deck: "aero-system/aero-ground-hexagons-01-art",
  deck2: "aero-system/aero-ground-hexagons-02-art",
  hex: "aero-system/aero-ground-hexagon-art",
  lamp: "aero-system/aero-lampost-01",
  door: "aero-system/aero-door-01",
  ringBlue: "aero-system/aero-station-ring-art",
  ringPink: "aero-system/aero-station-pink-ring-art",
  ringGold: "aero-system/aero-station-yellow-ring-art",
  tree: "aero-system/tree-01-art",
} as const;

export const ROCKS = {
  a: "momuspark/floating-island-01-art",
  b: "momuspark/floating-island-02-art",
  c: "momuspark/floating-island-3-art",
  d: "momuspark/floating-island-4-art",
} as const;

export const WATERFALL = "momuspark/water-fall-01-art";

export const TOWN = {
  wall: "fantasy-town-kit/wall",
  wallWindow: "fantasy-town-kit/wall-window-shutters",
  wallDoor: "fantasy-town-kit/wall-door",
  wood: "fantasy-town-kit/wall-wood",
  woodWindow: "fantasy-town-kit/wall-wood-window-shutters",
  woodDoor: "fantasy-town-kit/wall-wood-door",
  roof: "fantasy-town-kit/roof-point",
  roofHigh: "fantasy-town-kit/roof-high-point",
  chimney: "fantasy-town-kit/chimney",
  lantern: "fantasy-town-kit/lantern",
  stallRed: "fantasy-town-kit/stall-red",
  stallGreen: "fantasy-town-kit/stall-green",
  cart: "fantasy-town-kit/cart",
  bannerRed: "fantasy-town-kit/banner-red",
  bannerGreen: "fantasy-town-kit/banner-green",
  fountain: "fantasy-town-kit/fountain-round-detail",
  treeRound: "fantasy-town-kit/tree-high-round",
  treeCrooked: "fantasy-town-kit/tree-crooked",
  watermill: "fantasy-town-kit/watermill",
} as const;

export const CASTLE = {
  base: "castle-kit/tower-hexagon-base",
  mid: "castle-kit/tower-hexagon-mid",
  roof: "castle-kit/tower-hexagon-roof",
  top: "castle-kit/tower-hexagon-top",
  flag: "castle-kit/flag",
  pennant: "castle-kit/flag-pennant",
} as const;

export const NATURE = {
  oak: "nature-kit/tree-oak",
  oakFall: "nature-kit/tree-oak-fall",
  fall: "nature-kit/tree-detailed-fall",
  pine: "nature-kit/tree-pine-round-a",
  tree: "nature-kit/tree-default",
  bush: "nature-kit/plant-bush-large",
  rock: "nature-kit/rock-large-a",
  rockTall: "nature-kit/rock-tall-a",
  flowerRed: "nature-kit/flower-red-a",
  flowerYellow: "nature-kit/flower-yellow-a",
  pumpkin: "nature-kit/crop-pumpkin",
} as const;

export const TRAFFIC = {
  balloonRed: "medieval-fair/balloon-interactible-red",
  balloonYellow: "medieval-fair/balloon-interactible-yellow",
  crow: "towers/love-death-bird-art",
  tribird: "xyz/026-tribird-art",
} as const;

export const PARCEL = "car-kit/box";

/** Load order matters: what the first screen needs goes first. */
export const MODELS: string[] = [
  SHIP,
  PROP,
  AERO.island,
  AERO.station,
  AERO.pad,
  AERO.lamp,
  AERO.deck,
  AERO.deck2,
  AERO.hex,
  AERO.door,
  AERO.ringGold,
  AERO.ringBlue,
  AERO.ringPink,
  ROCKS.a,
  ROCKS.b,
  ROCKS.c,
  ROCKS.d,
  PARCEL,
  ...Object.values(TOWN),
  ...Object.values(CASTLE),
  ...Object.values(NATURE),
  AERO.tree,
  WATERFALL,
  ...Object.values(TRAFFIC),
];

export const GAME: GameEntry = {
  slug: "sky-courier",
  title: "Sky Courier",
  tagline: "Fly the mail airship between floating islands. On time.",
  description:
    "A 3D flying game. Pilot a little mail airship over a sea of clouds, pick up parcels at sky stations and deliver them to floating islands before the clock runs out. Ride updrafts, thread the rings for boost, dodge balloons, birds and storm clouds, race the ring trials and spend your tips on a faster airship and new routes.",
  genre: "Flight adventure",
  accent: "#60a5fa",
  cover: "/games/sky-courier/cover.webp",
  models: MODELS,
  collections: ["Aero System", "Momus Park", "Fantasy Town Kit", "Castle Kit", "Nature Kit", "Medieval Fair", "Towers", "Xyz", "Car Kit"],
  controls: [
    { action: "Steer", keys: ["A", "D", "←", "→"], touch: "Left stick" },
    { action: "Climb / dive", keys: ["W", "S", "↑", "↓"], touch: "Left stick" },
    { action: "Throttle up", keys: ["Shift", "R"], touch: "Throttle slider" },
    { action: "Throttle down", keys: ["Ctrl", "Q"], touch: "Throttle slider" },
    { action: "Boost", keys: ["Space"], touch: "Boost button" },
    { action: "Pick up / drop parcel", keys: ["E"], touch: "Automatic — fly into the beam" },
    { action: "Look back", keys: ["C"] },
  ],
  howTo: [
    "Fly into a gold beam to pick up a parcel, then follow the arrow to the blue beam on its island.",
    "Every parcel has a timer: deliver early for bigger tips. Chain on-time deliveries for a bonus.",
    "Fly through rings to fill your boost, then hold Space. Warm updrafts lift you for free.",
    "Bumping islands or balloons dents the hull and the parcel. Birds slow you down.",
    "Spend your tips in the hangar, open new routes, and race the ring trials for medals.",
  ],
  touchHowTo: [
    "Fly into the middle of a gold beam to pick up a parcel, then follow the arrow to the blue beam on its island.",
    "Steer, climb and dive with the stick, and set your speed with the throttle slider on the right.",
    "Every parcel has a timer: deliver early for bigger tips. Chain on-time deliveries for a bonus.",
    "Fly through rings to fill your boost, then hold the Boost button. Warm updrafts lift you for free.",
    "Bumping islands or balloons dents the hull and the parcel. Birds slow you down.",
    "Spend your tips in the hangar, open new routes, and race the ring trials for medals.",
  ],
  features: ["Free flight over a sea of clouds", "Timed parcel deliveries with chains", "Rings, updrafts & boost", "Ring trials with medals", "Upgrades and three routes"],
  music: "Air Waltz",
  comingSoon: true,
};
