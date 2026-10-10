import type { GameEntry } from "@/lib/games";

/** Cannon Cove — every model it uses, from the site's own library (public/library). No three.js here. */

const P = (name: string) => `pirate-kit/${name}`;

export const SHIPS = {
  playerSmall: P("ship-pirate-small"),
  playerMedium: P("ship-pirate-medium"),
  playerLarge: P("ship-pirate-large"),
  sloop: P("ship-small"),
  brig: P("ship-medium"),
  frigate: P("ship-large"),
  ghost: P("ship-ghost"),
} as const;

export const ISLAND = {
  sand: P("patch-sand"),
  sandFoliage: P("patch-sand-foliage"),
  grass: P("patch-grass"),
  grassFoliage: P("patch-grass-foliage"),
  grassTuft: P("grass"),
  grassPatch: P("grass-patch"),
  grassPlant: P("grass-plant"),
  palmBend: P("palm-bend"),
  palmStraight: P("palm-straight"),
  palmDetailedBend: P("palm-detailed-bend"),
  palmDetailedStraight: P("palm-detailed-straight"),
  rocksA: P("rocks-a"),
  rocksB: P("rocks-b"),
  rocksC: P("rocks-c"),
  rocksSandA: P("rocks-sand-a"),
  rocksSandB: P("rocks-sand-b"),
  rocksSandC: P("rocks-sand-c"),
} as const;

export const PROPS = {
  towerSmall: P("tower-complete-small"),
  towerLarge: P("tower-complete-large"),
  dock: P("structure-platform-dock"),
  dockSmall: P("structure-platform-dock-small"),
  hut: P("structure-roof"),
  flag: P("flag-pirate-high"),
  pennant: P("flag-high-pennant"),
  rowboat: P("boat-row-small"),
  rowboatLarge: P("boat-row-large"),
  wreck: P("ship-wreck"),
  hole: P("hole"),
  shovel: P("tool-shovel"),
  bottle: P("bottle"),
  buoy: "watercraft-kit/buoy",
  buoyFlag: "watercraft-kit/buoy-flag",
} as const;

export const ARMS = {
  cannon: P("cannon"),
  fortCannon: P("cannon-mobile"),
  ball: P("cannon-ball"),
} as const;

export const LOOT = {
  barrel: P("barrel"),
  crate: P("crate"),
  bottles: P("crate-bottles"),
  chest: P("chest"),
} as const;

/** Open Sea: the merchant ships you can buy beyond the Pirate Kit's, and passing traffic. */
export const TRADE_SHIPS = {
  sailA: "watercraft-kit/boat-sail-a",
  sailB: "watercraft-kit/boat-sail-b",
  fishing: "watercraft-kit/boat-fishing-small",
  cargoA: "watercraft-kit/ship-cargo-a",
  cargoB: "watercraft-kit/ship-cargo-b",
  liner: "watercraft-kit/ship-ocean-liner",
} as const;

const F = (name: string) => `fantasy-town-kit/${name}`;

/** Open Sea port towns: Fantasy Town houses and stalls, Pirate Kit castles, Watercraft Kit cargo. */
export const TOWN = {
  wallWood: F("wall-wood"),
  wallWoodDoor: F("wall-wood-door"),
  wallWoodWindow: F("wall-wood-window-shutters"),
  wallStone: F("wall"),
  wallStoneDoor: F("wall-door"),
  wallStoneWindow: F("wall-window-shutters"),
  roof: F("roof-point"),
  roofHigh: F("roof-high-point"),
  stallRed: F("stall-red"),
  stallGreen: F("stall-green"),
  lantern: F("lantern"),
  cart: F("cart"),
  castleWall: P("castle-wall"),
  castleGate: P("castle-gate"),
  cargoPileA: "watercraft-kit/cargo-pile-a",
  cargoPileB: "watercraft-kit/cargo-pile-b",
} as const;

/** Load order matters: the menu needs the player's ship and the islands first. */
export const MODELS: string[] = [
  SHIPS.playerSmall,
  ...Object.values(ISLAND),
  ARMS.cannon,
  ARMS.ball,
  ...Object.values(PROPS),
  ARMS.fortCannon,
  ...Object.values(LOOT),
  SHIPS.sloop,
  SHIPS.brig,
  SHIPS.frigate,
  SHIPS.playerMedium,
  SHIPS.playerLarge,
  SHIPS.ghost,
  ...Object.values(TRADE_SHIPS),
  ...Object.values(TOWN),
];

export const GAME: GameEntry = {
  slug: "cannon-cove",
  title: "Cannon Cove",
  tagline: "Trade across the open sea, build a fleet, battle friends online.",
  description:
    "A 3D open-world sailing and trading game. Captain a merchant ship between ten island ports: buy goods cheap where they're made and sell them where they're wanted, take freight, express, bounty and salvage contracts, and follow bottled maps to buried treasure. Earn gold to buy bigger ships — from a little sailboat to galleons and steam freighters — while pirates prowl the far waters and a ghost ship haunts her sea. Auto-sail steers you to any port and docks. Online, make a room and battle friends with its code, or quick-match against captains from anywhere; the classic cove battle against waves of navy ships is still there too.",
  genre: "Naval trading & action",
  accent: "#38bdf8",
  cover: "/games/cannon-cove/cover.webp",
  trailer: { src: "/games/cannon-cove/trailer.mp4", hd: "/games/cannon-cove/trailer-1080.mp4", poster: "/games/cannon-cove/trailer-poster.webp", seconds: 39 },
  preview: "/games/cannon-cove/card-loop.mp4",
  models: MODELS,
  collections: ["Pirate Kit", "Watercraft Kit", "Fantasy Town Kit"],
  controls: [
    { action: "Steer", keys: ["A", "D", "←", "→"], touch: "Left stick" },
    { action: "Raise / lower sails", keys: ["W", "S", "↑", "↓"], touch: "Push the stick up / down" },
    { action: "Fire left broadside", keys: ["Q", "J"], touch: "◀ Left button (hold to keep firing)" },
    { action: "Fire right broadside", keys: ["E", "L"], touch: "Right ▶ button" },
    { action: "Dock at a port (inside its gold rings)", keys: ["Space", "Enter"], touch: "Dock button" },
    { action: "Sea chart", keys: ["C"], touch: "Map button" },
    { action: "Auto-sail to your course (and dock)", keys: ["G"], touch: "Auto-sail button" },
    { action: "Set sail from port", keys: ["Enter"], touch: "Set sail" },
    { action: "Pick an upgrade between waves (Battle waves)", keys: ["1", "2", "3"], touch: "Tap a card" },
    { action: "Zoom the camera", keys: ["Mouse wheel", "Z"] },
  ],
  howTo: [
    "Open Sea: you start at Port Haven with a little sailboat and 300 gold. Each port makes some goods (cheap) and wants others (it pays more) — buy low, sail, sell high.",
    "Contracts pay well: freight and express runs to other ports, orders for goods a port needs, bounties on pirate captains and salvage from wrecks. Their clocks only run while you sail.",
    "Press C for the sea chart: click a port to see what it trades, then Set course — a gold arrow points the way. Press G (Auto-sail) and the ship sails there, tacking against the wind, and docks by itself — or sail into the gold rings and press Space.",
    "Spend your gold on bigger ships (more hold, more cannons), upgrades and repairs. Guild ranks unlock bigger ships and more contracts at once — up to steam freighters that ignore the wind.",
    "Pirates prowl far from home, and more often when your hold is full. Your cannons point sideways: turn side-on, then fire left (Q) or right (E). Sunk pirates drop gold and cargo.",
    "Sailing across the wind is fastest, straight into it is painfully slow. More sail means more speed but wider turns.",
    "Pick up messages in bottles for treasure maps. In the Haunted Sea the Drowned Queen rises — sink her for a fortune and her ship.",
    "Online battle: Quick match drops you into a battle with captains online; Play with friends makes a private room — share its code or invite link. Sinks score points, sunk ships come back after 5 seconds, first to the goal wins.",
    "Battle waves: the classic mode — sink every navy ship in each wave, pick an upgrade between waves, and survive the ghost ship every 5th wave.",
  ],
  touchHowTo: [
    "Open Sea: you start at Port Haven with a little sailboat and 300 gold. Each port makes some goods (cheap) and wants others (it pays more) — buy low, sail, sell high.",
    "Contracts pay well: freight and express runs to other ports, orders for goods a port needs, bounties on pirate captains and salvage from wrecks. Their clocks only run while you sail.",
    "Tap the map button for the sea chart: tap a port to see what it trades, then Auto-sail there — the ship sails, tacks against the wind and docks by itself. Or follow the gold arrow into the gold rings and tap Dock.",
    "Spend your gold on bigger ships (more hold, more cannons), upgrades and repairs. Guild ranks unlock bigger ships and more contracts at once — up to steam freighters that ignore the wind.",
    "Pirates prowl far from home, and more often when your hold is full. Your cannons point sideways: turn side-on, then tap ◀ Left or Right ▶. Sunk pirates drop gold and cargo.",
    "Sailing across the wind is fastest, straight into it is painfully slow. Push the stick up for more sail (faster, wider turns), down to turn tight.",
    "Pick up messages in bottles for treasure maps. In the Haunted Sea the Drowned Queen rises — sink her for a fortune and her ship.",
    "Online battle: Quick match drops you into a battle with captains online; Play with friends makes a private room — share its code or invite link. Sinks score points, sunk ships come back after 5 seconds, first to the goal wins.",
    "Battle waves: the classic mode — sink every navy ship in each wave, tap an upgrade between waves, and survive the ghost ship every 5th wave.",
  ],
  features: ["Open sea with 10 trading ports", "12 goods, 5 kinds of contracts", "12 ships, from sailboat to steam freighter", "Auto-sail to any port", "Online battles: rooms with friends or quick match", "Pirates, bounties, treasure maps & a ghost ship"],
  music: "Salt & Cannon",
};
