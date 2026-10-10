import type { GameEntry } from "@/lib/games";

/** Turbo Karts — every model it uses, from the site's own library (public/library). No three.js here. */

export interface Driver {
  key: string;
  name: string;
  /** HUD / minimap colour. */
  color: string;
  /** 1..5 bars on the driver card; each step is a few percent in the handling model. */
  speed: number;
  accel: number;
  handling: number;
}

export const DRIVERS: Driver[] = [
  { key: "car-kit/kart-oobi", name: "Oobi", color: "#a78bfa", speed: 3, accel: 3, handling: 3 },
  { key: "car-kit/kart-oodi", name: "Oodi", color: "#f472b6", speed: 2, accel: 4, handling: 4 },
  { key: "car-kit/kart-ooli", name: "Ooli", color: "#fbbf24", speed: 4, accel: 2, handling: 3 },
  { key: "car-kit/kart-oopi", name: "Oopi", color: "#2dd4bf", speed: 3, accel: 2, handling: 4 },
  { key: "car-kit/kart-oozi", name: "Oozi", color: "#fdba74", speed: 4, accel: 3, handling: 2 },
];

const R = (name: string) => `racing-kit/${name}`;

/** Road tiles (Racing Kit, 1×1 grid tiles). */
export const ROAD = {
  straight: R("road-straight"),
  long: R("road-straight-long"),
  longMid: R("road-straight-long-mid"),
  arrow: R("road-straight-arrow"),
  grid: R("road-start-positions"),
  ramp: R("road-ramp"),
  rampLong: R("road-ramp-long-wall"),
  deckStart: R("road-straight-bridge-start"),
  deck: R("road-straight-bridge-mid"),
  corner1: R("road-corner-small"),
  corner2: R("road-corner-large"),
  corner3: R("road-corner-larger"),
} as const;

/** Kerbs, sand traps and low walls that line the corners (same footprint as the corner tiles). */
export const CORNER_DECOR = {
  border: { 1: [R("road-corner-small-border")], 2: [R("road-corner-large-border"), R("road-corner-large-border-inner")], 3: [R("road-corner-larger-border"), R("road-corner-larger-border-inner")] },
  sand: { 1: [R("road-corner-small-sand")], 2: [R("road-corner-large-sand"), R("road-corner-large-sand-inner")], 3: [R("road-corner-larger-sand"), R("road-corner-larger-sand-inner")] },
  wall: { 1: [R("road-corner-small-wall")], 2: [R("road-corner-large-wall"), R("road-corner-large-wall-inner")], 3: [R("road-corner-larger-wall"), R("road-corner-larger-wall-inner")] },
} as const;

/** Trackside walls. */
export const WALLS = {
  barrier: R("barrier-wall"),
  red: R("barrier-red"),
  white: R("barrier-white"),
  rail: R("rail"),
  railDouble: R("rail-double"),
  fence: R("fence-straight"),
} as const;

/** Scenery. */
export const PROPS = {
  grandStand: R("grand-stand"),
  grandStandCovered: R("grand-stand-covered"),
  grandStandAwning: R("grand-stand-awning"),
  grandStandRound: R("grand-stand-covered-round"),
  pitsGarage: R("pits-garage"),
  pitsGarageClosed: R("pits-garage-closed"),
  pitsOffice: R("pits-office-roof"),
  overheadLights: R("overhead-lights"),
  overhead: R("overhead"),
  overheadRound: R("overhead-round-colored"),
  lightColored: R("light-colored"),
  lightPost: R("light-post-large"),
  lightPostModern: R("light-post-modern"),
  flagCheckers: R("flag-checkers"),
  flagRed: R("flag-red"),
  flagGreen: R("flag-green"),
  flagTankco: R("flag-tankco"),
  bannerRed: R("banner-tower-red"),
  bannerGreen: R("banner-tower-green"),
  billboard: R("billboard"),
  billboardLow: R("billboard-low"),
  billboardDouble: R("billboard-double-exclusive"),
  camera: R("camera-exclusive"),
  radar: R("radar-equipment"),
  pylon: R("pylon"),
  tent: R("tent"),
  tentLong: R("tent-long"),
  tentClosed: R("tent-closed"),
  tentRoof: R("tent-roof-double"),
  treeLarge: R("tree-large"),
  treeSmall: R("tree-small"),
  woodRamp: R("ramp"),
  raceCarRed: R("race-car-red"),
  raceCarGreen: R("race-car-green"),
  raceCarOrange: R("race-car-orange"),
  raceCarWhite: R("race-car-white"),
  cactusTall: "nature-kit/cactus-tall",
  cactusShort: "nature-kit/cactus-short",
  rockTallA: "nature-kit/rock-tall-a",
  rockTallB: "nature-kit/rock-tall-b",
  rockTallE: "nature-kit/rock-tall-e",
  rockLargeC: "nature-kit/rock-large-c",
  rockLargeF: "nature-kit/rock-large-f",
  bush: "nature-kit/plant-bush-large",
} as const;

/** Pickups and effects (Toy Car Kit). */
export const ITEMS = {
  box: "toy-car-kit/item-box",
  banana: "toy-car-kit/item-banana",
  coin: "toy-car-kit/item-coin-gold",
  smoke: "toy-car-kit/smoke",
} as const;

/** Load order matters: the menu shows the karts on the first circuit's start straight. */
export const MODELS: string[] = [
  ...DRIVERS.map((d) => d.key),
  ...Object.values(ROAD),
  ...Object.values(ITEMS),
  ...Object.values(WALLS),
  ...Object.values(CORNER_DECOR).flatMap((sizes) => Object.values(sizes).flat()),
  ...Object.values(PROPS),
].filter((key, i, all) => all.indexOf(key) === i);

export const GAME: GameEntry = {
  slug: "turbo-karts",
  title: "Turbo Karts",
  tagline: "Drift, boost and banana-slip your way to the podium.",
  description:
    "A 3D kart racer. Pick one of five drivers and race four rivals over three laps on three circuits — a grandstand Grand Prix park, a desert track with a big ramp jump, and a figure-eight with a bridge overpass. Drift through corners to charge blue, orange and purple mini-turbos, hit boost pads, grab item boxes for boosts, shields and banana peels, collect coins for extra speed, win the three-race cup or chase your best lap in Time Trial.",
  genre: "Kart racing",
  accent: "#f97316",
  cover: "/games/turbo-karts/cover.webp",
  models: MODELS,
  collections: ["Car Kit", "Racing Kit", "Toy Car Kit", "Nature Kit"],
  controls: [
    { action: "Accelerate", keys: ["W", "↑"], touch: "Automatic (GAS button if Auto-accelerate is off)" },
    { action: "Brake / reverse", keys: ["S", "↓"], touch: "BRAKE button" },
    { action: "Steer", keys: ["A", "D", "←", "→"], touch: "◀ ▶ buttons (left thumb)" },
    { action: "Drift / hop (hold in a turn)", keys: ["Space", "Shift"], touch: "DRIFT button (hold)" },
    { action: "Use item", keys: ["E", "K", "Enter"], touch: "ITEM button" },
    { action: "Look behind", keys: ["Q"] },
  ],
  howTo: [
    "Finish three laps ahead of the other four karts. In the Cup, points (10-8-6-4-2) over three races decide the trophy.",
    "Hold drift while turning: sparks go blue, then orange, then purple — let go for a mini-turbo. Longer drifts give bigger boosts.",
    "Drive through the ? boxes for an item: turbo, triple turbo, shield, banana or a bag of coins. Use it with E.",
    "Bananas spin out whoever touches them — drop one behind you when a rival is right on your tail. A shield blocks one hit.",
    "Coins make your kart a little faster (up to 10). You lose a few when you spin out.",
    "Orange arrow pads give a free boost. Grass slows you down — stay on the asphalt and take the racing line.",
    "Hold the gas just before GO for a rocket start. Press drift in mid-air off the big ramp for a trick boost.",
  ],
  touchHowTo: [
    "Finish three laps ahead of the other four karts. In the Cup, points (10-8-6-4-2) over three races decide the trophy.",
    "Your kart speeds up by itself: steer with the ◀ ▶ buttons under your left thumb, and tap BRAKE to slow down or reverse.",
    "Hold DRIFT while steering into a turn: sparks go blue, then orange, then purple — let go for a mini-turbo. Longer drifts give bigger boosts.",
    "Drive through the ? boxes for an item: turbo, triple turbo, shield, banana or a bag of coins. Tap ITEM to use it.",
    "Bananas spin out whoever touches them — drop one behind you when a rival is right on your tail. A shield blocks one hit.",
    "Coins make your kart a little faster (up to 10). You lose a few when you spin out.",
    "Orange arrow pads give a free boost. Grass slows you down — stay on the asphalt and take the racing line.",
    "Rocket start: turn Auto-accelerate off in the pause menu, then press GAS as the 1 appears and hold it through GO. Tap DRIFT in mid-air off the big ramp for a trick boost.",
  ],
  features: ["3 circuits: Grand Prix, desert jump & figure-eight overpass", "Drift mini-turbos & rocket starts", "4 AI rivals with items", "3-race Cup and Time Trial with saved records"],
  music: "Turbo Lap",
};
