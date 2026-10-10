import { SHIPS, TRADE_SHIPS } from "./manifest";

/**
 * Open Sea, the trading career: goods, the ten ports and their markets, ships for sale, contracts,
 * guild ranks and the logbook. Pure rules and numbers (no three.js) — the engine sails the ship, this
 * keeps the books. Everything here is saved (see CareerSave).
 */

// --- Helpers --------------------------------------------------------------------------------------

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const D = (deg: number) => (deg * Math.PI) / 180;

/** Deterministic random numbers (same as world.ts). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (...parts: (number | string)[]) => {
  let h = 2166136261;
  for (const p of parts.join("|")) h = Math.imul(h ^ p.charCodeAt(0), 16777619);
  return h >>> 0;
};

/** "2:05" */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Distances are in metres on the chart (one world unit = one metre). */
export const metres = (d: number) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`);

/** Compass point from one place to another (north is up the chart: -z). */
export const compass = (dx: number, dz: number) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round((Math.atan2(dx, -dz) / (Math.PI * 2)) * 8 + 8) % 8];

// --- Goods ----------------------------------------------------------------------------------------

export type GoodId = "fish" | "grain" | "timber" | "sugar" | "cloth" | "rum" | "tools" | "tea" | "spices" | "medicine" | "silk" | "gems";

export interface Good {
  id: GoodId;
  name: string;
  icon: string;
  base: number;
}

export const GOODS: Record<GoodId, Good> = {
  fish: { id: "fish", name: "Fish", icon: "🐟", base: 10 },
  grain: { id: "grain", name: "Grain", icon: "🌾", base: 12 },
  timber: { id: "timber", name: "Timber", icon: "🪵", base: 18 },
  sugar: { id: "sugar", name: "Sugar", icon: "🍬", base: 24 },
  cloth: { id: "cloth", name: "Cloth", icon: "🧶", base: 34 },
  rum: { id: "rum", name: "Rum", icon: "🍾", base: 40 },
  tools: { id: "tools", name: "Tools", icon: "🔨", base: 52 },
  tea: { id: "tea", name: "Tea", icon: "🍵", base: 60 },
  spices: { id: "spices", name: "Spices", icon: "🌶️", base: 75 },
  medicine: { id: "medicine", name: "Medicine", icon: "💊", base: 90 },
  silk: { id: "silk", name: "Silk", icon: "🧣", base: 120 },
  gems: { id: "gems", name: "Gems", icon: "💎", base: 220 },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];

/** What a contract's cargo is: a good, or mail / passengers for express runs. */
export type Load = GoodId | "mail" | "passengers";

export function loadInfo(load: Load) {
  if (load === "mail") return { name: "Mail sacks", icon: "📜" };
  if (load === "passengers") return { name: "Passengers", icon: "🧳" };
  return GOODS[load];
}

// --- Ships ----------------------------------------------------------------------------------------

export type ShipId = "skiff" | "cutter" | "sloop" | "brig" | "corsair" | "galleon" | "indiaman" | "dread" | "steamer" | "freighter" | "liner" | "queen";

export interface ShipDef {
  id: ShipId;
  name: string;
  /** Kind of vessel, shown under the name. */
  kind: string;
  model: string;
  scale: number;
  /** Height of the waterline above the keel, in model units (before `scale`). */
  waterline: number;
  /** Hull width in metres (collisions, cannon ports). */
  beam: number;
  hull: number;
  cargo: number;
  /** Cannons per side. */
  guns: number;
  /** Top speed (m/s) at full sail on a beam reach. */
  speed: number;
  turn: number;
  price: number;
  /** Guild rank needed to buy it. */
  rank: number;
  /** Engines: the wind doesn't matter. */
  steam?: boolean;
  ghost?: boolean;
  blurb: string;
}

export const SHIP_DEFS: Record<ShipId, ShipDef> = {
  skiff: { id: "skiff", name: "Sea Sparrow", kind: "Sailboat", model: TRADE_SHIPS.sailA, scale: 2.0, waterline: 0.3, beam: 2.7, hull: 80, cargo: 12, guns: 2, speed: 12.2, turn: 1.05, price: 0, rank: 0, blurb: "Your first boat: quick and nimble, with room for a dozen crates." },
  cutter: { id: "cutter", name: "Tidewalker", kind: "Cutter", model: TRADE_SHIPS.sailB, scale: 2.15, waterline: 0.3, beam: 2.9, hull: 110, cargo: 24, guns: 2, speed: 12.0, turn: 0.98, price: 2400, rank: 1, blurb: "Twice the hold of a sailboat and a second cannon each side." },
  sloop: { id: "sloop", name: "Merchant Sloop", kind: "Sloop", model: SHIPS.sloop, scale: 1, waterline: 0.95, beam: 3.8, hull: 150, cargo: 40, guns: 3, speed: 11.6, turn: 0.86, price: 7500, rank: 2, blurb: "A proper ship: forty crates, three guns a side, fast on a reach." },
  brig: { id: "brig", name: "Trade Brig", kind: "Brig", model: SHIPS.brig, scale: 1, waterline: 0.95, beam: 3.8, hull: 210, cargo: 65, guns: 4, speed: 11.0, turn: 0.76, price: 18000, rank: 3, blurb: "Two masts and a deep hold — the workhorse of the trade routes." },
  corsair: { id: "corsair", name: "Corsair", kind: "Pirate brig", model: SHIPS.playerMedium, scale: 1.05, waterline: 0.95, beam: 4.0, hull: 260, cargo: 45, guns: 6, speed: 12.4, turn: 0.84, price: 30000, rank: 3, blurb: "Built for a fight: six guns a side and the fastest hull at sea. Small hold." },
  galleon: { id: "galleon", name: "Galleon", kind: "Galleon", model: SHIPS.frigate, scale: 1, waterline: 0.95, beam: 3.8, hull: 290, cargo: 100, guns: 5, speed: 10.5, turn: 0.66, price: 42000, rank: 4, blurb: "A hundred crates and five guns a side. Slower to turn." },
  indiaman: { id: "indiaman", name: "East Indiaman", kind: "Great galleon", model: SHIPS.frigate, scale: 1.3, waterline: 0.95, beam: 4.9, hull: 380, cargo: 160, guns: 6, speed: 10.2, turn: 0.58, price: 90000, rank: 5, blurb: "The biggest sailing ship afloat — a floating warehouse." },
  dread: { id: "dread", name: "Dread Galleon", kind: "Pirate galleon", model: SHIPS.playerLarge, scale: 1.25, waterline: 0.95, beam: 4.75, hull: 480, cargo: 90, guns: 8, speed: 10.8, turn: 0.62, price: 120000, rank: 6, blurb: "Eight guns a side. Pirates think twice." },
  steamer: { id: "steamer", name: "Steam Freighter", kind: "Steamship", model: TRADE_SHIPS.cargoB, scale: 1.7, waterline: 0.55, beam: 6.2, hull: 420, cargo: 240, guns: 3, speed: 10.0, turn: 0.52, price: 170000, rank: 6, steam: true, blurb: "Coal and iron: no sails, so the wind never slows you down." },
  freighter: { id: "freighter", name: "Grand Freighter", kind: "Container ship", model: TRADE_SHIPS.cargoA, scale: 2.1, waterline: 0.55, beam: 7.6, hull: 540, cargo: 380, guns: 4, speed: 9.8, turn: 0.46, price: 320000, rank: 7, steam: true, blurb: "Stacks of containers from bow to bridge." },
  liner: { id: "liner", name: "Ocean Queen", kind: "Ocean liner", model: TRADE_SHIPS.liner, scale: 1.2, waterline: 1.25, beam: 5.4, hull: 650, cargo: 560, guns: 4, speed: 10.8, turn: 0.42, price: 600000, rank: 8, steam: true, blurb: "The grandest ship on any sea. The mark of a Sea Lord." },
  queen: { id: "queen", name: "The Drowned Queen", kind: "Ghost ship", model: SHIPS.ghost, scale: 1.25, waterline: 0.95, beam: 4.75, hull: 520, cargo: 140, guns: 7, speed: 12.6, turn: 0.74, price: 75000, rank: 0, ghost: true, blurb: "Raised from the deep. Only for the captain who sank her." },
};

export const SHIP_ORDER: ShipId[] = ["skiff", "cutter", "sloop", "brig", "corsair", "galleon", "indiaman", "dread", "steamer", "freighter", "liner", "queen"];

// --- Ports ----------------------------------------------------------------------------------------

export type PortId = "haven" | "coral" | "palm" | "sugar" | "iron" | "spice" | "silk" | "gold" | "fort" | "skull";

export interface PortDef {
  id: PortId;
  name: string;
  x: number;
  z: number;
  /** Island radius. */
  r: number;
  /** Heading of the jetty, from the island out to sea. */
  dock: number;
  style: "wood" | "stone" | "pirate";
  houses: number;
  produces: GoodId[];
  wants: GoodId[];
  /** Ships the shipyard builds (empty: no shipyard). */
  yard: ShipId[];
  lighthouse?: boolean;
  castle?: boolean;
  industry?: boolean;
  blurb: string;
}

export const PORTS: PortDef[] = [
  { id: "haven", name: "Port Haven", x: 0, z: 0, r: 26, dock: D(150), style: "wood", houses: 8, produces: ["fish", "grain"], wants: ["tools", "cloth", "rum", "gems"], yard: ["skiff", "cutter", "sloop"], lighthouse: true, blurb: "Your home port and the guild's hall." },
  { id: "coral", name: "Coral Bay", x: -430, z: 300, r: 22, dock: D(60), style: "wood", houses: 6, produces: ["fish", "sugar"], wants: ["timber", "tools", "medicine"], yard: [], blurb: "A fishing town on a coral reef." },
  { id: "palm", name: "Palmwood", x: 420, z: 280, r: 23, dock: D(250), style: "wood", houses: 6, produces: ["timber", "grain"], wants: ["rum", "cloth", "tea"], yard: [], blurb: "Lumber mills under the palms." },
  { id: "sugar", name: "Sugarcane Key", x: -60, z: 700, r: 22, dock: D(0), style: "wood", houses: 5, produces: ["sugar", "rum"], wants: ["timber", "grain", "tools"], yard: [], blurb: "Cane fields and the best distillery in the isles." },
  { id: "iron", name: "Ironcliff", x: 60, z: -640, r: 25, dock: D(175), style: "stone", houses: 7, produces: ["tools", "timber"], wants: ["fish", "grain", "rum", "medicine"], yard: ["cutter", "sloop", "brig", "galleon", "indiaman"], lighthouse: true, industry: true, blurb: "Forges, mines and the biggest shipyard of sail." },
  { id: "spice", name: "Spice Harbor", x: 820, z: -80, r: 23, dock: D(265), style: "stone", houses: 6, produces: ["spices", "tea"], wants: ["tools", "cloth", "timber", "sugar"], yard: [], blurb: "Warehouses that smell of pepper and cinnamon." },
  { id: "silk", name: "Silkwind", x: 880, z: 720, r: 24, dock: D(300), style: "stone", houses: 7, produces: ["silk", "tea"], wants: ["medicine", "tools", "rum", "grain"], yard: ["brig", "galleon", "indiaman"], lighthouse: true, blurb: "Far-off weavers trade silk for a fortune." },
  { id: "gold", name: "Goldcrest", x: 700, z: -760, r: 25, dock: D(220), style: "stone", houses: 7, produces: ["gems"], wants: ["fish", "grain", "cloth", "silk"], yard: ["steamer", "freighter", "liner"], industry: true, blurb: "Gem mines — and the brass works that build steamships." },
  { id: "fort", name: "Fort Royal", x: -760, z: -120, r: 25, dock: D(95), style: "stone", houses: 6, produces: ["cloth", "medicine"], wants: ["rum", "sugar", "spices", "tea"], yard: ["sloop", "brig", "galleon"], castle: true, blurb: "The navy's stronghold. Safe harbour, strict prices." },
  { id: "skull", name: "Skull Cove", x: -820, z: 760, r: 23, dock: D(40), style: "pirate", houses: 5, produces: ["rum"], wants: ["gems", "silk", "medicine", "spices"], yard: ["corsair", "dread", "queen"], blurb: "A pirate haven. Pays anything for luxuries — no questions asked." },
];

export const PORT = Object.fromEntries(PORTS.map((p) => [p.id, p])) as Record<PortId, PortDef>;

/** Chart edge: the map runs from -BOUNDS to BOUNDS on both axes. */
export const BOUNDS = 1150;
/** The Haunted Sea, where the Drowned Queen sails. */
export const HAUNTED_SEA = { x: -820, z: -820, r: 380 };
const SKULL = PORT.skull;

export const portDistance = (a: PortId, b: PortId) => Math.hypot(PORT[a].x - PORT[b].x, PORT[a].z - PORT[b].z);

/** 0 (safe) … 1 (deadly): how likely pirates are here. */
export function danger(x: number, z: number) {
  let d = clamp((Math.hypot(x, z) - 280) / 900, 0, 1) * 0.72;
  d += clamp(1 - Math.hypot(x - SKULL.x, z - SKULL.z) / 650, 0, 1) * 0.55;
  if (Math.hypot(x - HAUNTED_SEA.x, z - HAUNTED_SEA.z) < HAUNTED_SEA.r) d = Math.max(d, 0.7);
  // Harbour guns keep the pirates away from every port.
  for (const p of PORTS) {
    const dp = Math.hypot(x - p.x, z - p.z);
    if (dp < 200) d *= clamp((dp - 80) / 120, 0, 1);
  }
  return clamp(d, 0, 1);
}

export function inHauntedSea(x: number, z: number) {
  return Math.hypot(x - HAUNTED_SEA.x, z - HAUNTED_SEA.z) < HAUNTED_SEA.r;
}

export function zoneName(x: number, z: number) {
  if (inHauntedSea(x, z)) return "Haunted Sea";
  const d = danger(x, z);
  return d < 0.12 ? "Safe waters" : d < 0.4 ? "Open sea" : d < 0.7 ? "Pirate waters" : "Deadly waters";
}

// --- Ranks & upgrades -----------------------------------------------------------------------------

export const RANKS: { name: string; xp: number }[] = [
  { name: "Deckhand", xp: 0 },
  { name: "Boatswain", xp: 200 },
  { name: "Trader", xp: 700 },
  { name: "Merchant", xp: 1800 },
  { name: "Captain", xp: 4000 },
  { name: "Master Trader", xp: 8000 },
  { name: "Commodore", xp: 15000 },
  { name: "Trade Baron", xp: 27000 },
  { name: "Merchant Prince", xp: 45000 },
  { name: "Sea Lord", xp: 75000 },
];

export type TradeUpgradeId = "hold" | "hull" | "sails" | "reload" | "guns" | "shot" | "range" | "haggle" | "carpenter" | "spyglass";

export const TRADE_UPGRADES: Record<TradeUpgradeId, { title: string; text: string; costs: number[] }> = {
  hold: { title: "Bigger Hold", text: "+10% cargo space on every ship.", costs: [600, 1500, 3500, 8000, 16000] },
  hull: { title: "Oak Planking", text: "+15% hull on every ship.", costs: [500, 1200, 3000, 7000, 15000] },
  sails: { title: "Better Rigging", text: "+5% speed and sharper turns.", costs: [700, 2000, 5000, 12000] },
  haggle: { title: "Silver Tongue", text: "Buy 4% cheaper and sell 4% dearer.", costs: [1500, 6000, 20000] },
  reload: { title: "Quick Hands", text: "Cannons reload 15% faster.", costs: [400, 1000, 2500, 6000, 12000] },
  guns: { title: "Extra Cannons", text: "+1 cannon on each side.", costs: [900, 4000, 12000] },
  shot: { title: "Heavy Shot", text: "Cannonballs hit 20% harder.", costs: [500, 1500, 4000, 10000] },
  range: { title: "Long Guns", text: "Cannons reach 15% further.", costs: [600, 2500, 8000] },
  carpenter: { title: "Ship's Carpenter", text: "Slowly repairs the hull when no one is shooting at you.", costs: [3000] },
  spyglass: { title: "Trade Network", text: "The sea chart shows live prices of every port you have visited.", costs: [5000] },
};

export const TRADE_UPGRADE_ORDER = Object.keys(TRADE_UPGRADES) as TradeUpgradeId[];

// --- Contracts ------------------------------------------------------------------------------------

export type ContractKind = "freight" | "express" | "order" | "bounty" | "salvage";
export type PirateClass = "sloop" | "brig" | "frigate";

export interface Contract {
  id: string;
  kind: ContractKind;
  from: PortId;
  to: PortId;
  load: Load | null;
  qty: number;
  /** Units of this contract's cargo in the hold now. */
  loaded: number;
  reward: number;
  /** Seconds allowed / left (ticks only at sea). */
  time: number;
  left: number;
  site?: { x: number; z: number };
  captain?: string;
  pirate?: PirateClass;
}

const CAPTAINS = ["Redbeard", "One-Eyed Mary", "Barnacle Bill", "Black Bess", "Iron Hook", "Mad Morgan", "Salty Sal", "Grim Jack", "The Viper", "Captain Cutlass", "Bloody Anne", "Old Scratch"];

export function contractText(c: Contract) {
  const to = PORT[c.to].name;
  const load = c.load ? loadInfo(c.load) : null;
  switch (c.kind) {
    case "freight":
      return { title: `Deliver ${c.qty} ${load!.name}`, line: `${load!.icon} ${c.qty} ${load!.name} → ${to}`, detail: `Cargo is loaded here. Bring it to ${to}.` };
    case "express":
      return {
        title: c.load === "passengers" ? `Ferry ${c.qty} passengers` : `Rush ${c.qty} mail sacks`,
        line: `${load!.icon} ${c.qty} ${c.load === "passengers" ? "passengers" : "mail"} → ${to}`,
        detail: `Fast run to ${to} — they pay well if you're quick.`,
      };
    case "order":
      return { title: `Order: ${c.qty} ${load!.name}`, line: `${load!.icon} ${c.qty} ${load!.name} → ${to}`, detail: `${to} needs ${load!.name.toLowerCase()} — buy it anywhere, bring it there.` };
    case "bounty":
      return { title: `Bounty: ${c.captain}`, line: `☠ Sink ${c.captain}`, detail: `${c.captain}'s ${c.pirate} was seen at the marked spot. Sink it for the reward.` };
    case "salvage":
      return {
        title: `Salvage ${c.qty} ${load!.name}`,
        line: c.loaded >= c.qty ? `${load!.icon} ${c.qty} ${load!.name} → ${to}` : `⚓ Salvage ${c.loaded}/${c.qty} ${load!.name}`,
        detail: `A merchant sank at the marked spot. Fish ${c.qty} crates of ${load!.name.toLowerCase()} out of the sea and bring them to ${to}.`,
      };
  }
}

// --- Logbook (achievements) -----------------------------------------------------------------------

export interface CareerStats {
  contracts: number;
  bounties: number;
  pirates: number;
  treasures: number;
  /** Units of goods sold. */
  sold: number;
  /** All gold earned. */
  earned: number;
  /** Metres sailed. */
  sailed: number;
  queens: number;
  played: number;
}

interface Goal {
  id: string;
  title: string;
  text: string;
  reward: number;
  progress: (c: Career) => [number, number];
}

const GOALS: Goal[] = [
  { id: "first", title: "First cargo", text: "Complete a contract", reward: 150, progress: (c) => [c.stats.contracts, 1] },
  { id: "legs", title: "Sea legs", text: "Sail 5 km", reward: 300, progress: (c) => [Math.floor(c.stats.sailed / 1000), 5] },
  { id: "boat", title: "Bigger boat", text: "Buy a new ship", reward: 500, progress: (c) => [c.fleet.length - 1, 1] },
  { id: "explorer", title: "Explorer", text: "Visit 5 ports", reward: 600, progress: (c) => [c.visited.length, 5] },
  { id: "hunter", title: "Pirate hunter", text: "Sink 10 pirate ships", reward: 1500, progress: (c) => [c.stats.pirates, 10] },
  { id: "hauler", title: "Big hauler", text: "Sell 1,000 goods", reward: 2500, progress: (c) => [c.stats.sold, 1000] },
  { id: "merchant", title: "Merchant", text: "Earn 25,000 gold", reward: 2500, progress: (c) => [c.stats.earned, 25000] },
  { id: "chart", title: "Cartographer", text: "Visit all 10 ports", reward: 4000, progress: (c) => [c.visited.length, PORTS.length] },
  { id: "contractor", title: "Contractor", text: "Complete 25 contracts", reward: 4000, progress: (c) => [c.stats.contracts, 25] },
  { id: "treasure", title: "Treasure hunter", text: "Dig up 3 treasures", reward: 3000, progress: (c) => [c.stats.treasures, 3] },
  { id: "bounties", title: "Bounty hunter", text: "Complete 5 bounties", reward: 4000, progress: (c) => [c.stats.bounties, 5] },
  { id: "fleet", title: "Fleet owner", text: "Own 4 ships", reward: 6000, progress: (c) => [c.fleet.length, 4] },
  { id: "scourge", title: "Scourge of pirates", text: "Sink 50 pirate ships", reward: 10000, progress: (c) => [c.stats.pirates, 50] },
  { id: "ghost", title: "Ghost breaker", text: "Sink the Drowned Queen", reward: 15000, progress: (c) => [c.stats.queens, 1] },
  { id: "steam", title: "Age of steam", text: "Own a steamship", reward: 20000, progress: (c) => [c.fleet.some((s) => SHIP_DEFS[s].steam) ? 1 : 0, 1] },
  { id: "tycoon", title: "Tycoon", text: "Earn 250,000 gold", reward: 25000, progress: (c) => [c.stats.earned, 250000] },
  { id: "lord", title: "Sea Lord", text: "Reach the top guild rank", reward: 50000, progress: (c) => [c.rank, RANKS.length - 1] },
  { id: "million", title: "Millionaire", text: "Earn 1,000,000 gold", reward: 100000, progress: (c) => [c.stats.earned, 1000000] },
];

// --- Save -----------------------------------------------------------------------------------------

interface Board {
  window: number;
  offers: Contract[];
}

export interface KnownPrices {
  /** Game time of the visit. */
  t: number;
  buy: Partial<Record<GoodId, number>>;
  sell: Partial<Record<GoodId, number>>;
}

export interface CareerSave {
  v: 1;
  seed: number;
  gold: number;
  xp: number;
  ship: ShipId;
  fleet: ShipId[];
  /** Hull left on the active ship (0..1). */
  hull: number;
  up: Partial<Record<TradeUpgradeId, number>>;
  cargo: Partial<Record<GoodId, number>>;
  /** Average price paid per unit, for the profit shown when selling. */
  basis: Partial<Record<GoodId, number>>;
  contracts: Contract[];
  boards: Partial<Record<PortId, Board>>;
  /** Market pressure per "port:good" from your own buying and selling, and when it was set. */
  pressure: Record<string, [number, number]>;
  known: Partial<Record<PortId, KnownPrices>>;
  /** Game clock (seconds at sea). */
  time: number;
  port: PortId;
  /** Where the ship is when the game was left at sea. */
  sea: { x: number; z: number; h: number } | null;
  visited: PortId[];
  /** Treasure islands on the maps you hold / have dug up. */
  maps: number[];
  dug: number[];
  stats: CareerStats;
  goals: string[];
  /** Game time when the Drowned Queen may rise again. */
  queenAt: number;
  nextId: number;
  waypoint: { x: number; z: number; label: string } | null;
  /** The captain's guide was dismissed. */
  guideOff?: boolean;
}

function freshSave(): CareerSave {
  return {
    v: 1,
    seed: Math.floor(Math.random() * 1e9),
    gold: 300,
    xp: 0,
    ship: "skiff",
    fleet: ["skiff"],
    hull: 1,
    up: {},
    cargo: {},
    basis: {},
    contracts: [],
    boards: {},
    pressure: {},
    known: {},
    time: 0,
    port: "haven",
    sea: null,
    visited: ["haven"],
    maps: [],
    dug: [],
    stats: { contracts: 0, bounties: 0, pirates: 0, treasures: 0, sold: 0, earned: 0, sailed: 0, queens: 0, played: 0 },
    goals: [],
    queenAt: 0,
    nextId: 1,
    waypoint: null,
  };
}

// --- Career ---------------------------------------------------------------------------------------

export interface Notice {
  title: string;
  text: string;
  tone: "good" | "bad" | "info";
}

/** Contract offers depend on the ship's hold and speed when the board is drawn up. */
export interface BoardContext {
  /** Is (x, z) open water, clear of islands? */
  openSea: (x: number, z: number) => boolean;
}

const BOARD_WINDOW = 240;

export class Career {
  readonly s: CareerSave;
  /** Achievements and rank-ups since the UI last asked. */
  private pending: Notice[] = [];

  constructor(save: CareerSave | null) {
    const fresh = freshSave();
    this.s = save && save.v === 1 ? { ...fresh, ...save, stats: { ...fresh.stats, ...save.stats } } : fresh;
    if (!this.s.fleet.includes(this.s.ship)) this.s.fleet.push(this.s.ship);
  }

  get gold() {
    return this.s.gold;
  }

  get stats() {
    return this.s.stats;
  }

  get fleet() {
    return this.s.fleet;
  }

  get visited() {
    return this.s.visited;
  }

  get time() {
    return this.s.time;
  }

  get rank() {
    let r = 0;
    while (r + 1 < RANKS.length && this.s.xp >= RANKS[r + 1].xp) r++;
    return r;
  }

  rankInfo() {
    const r = this.rank;
    const next = RANKS[r + 1];
    const cur = RANKS[r].xp;
    return { rank: r, name: RANKS[r].name, xp: this.s.xp, next: next ? next.xp : null, nextName: next?.name ?? null, frac: next ? (this.s.xp - cur) / (next.xp - cur) : 1 };
  }

  level(id: TradeUpgradeId) {
    return this.s.up[id] ?? 0;
  }

  get ship(): ShipDef {
    return SHIP_DEFS[this.s.ship];
  }

  cap(ship: ShipDef = this.ship) {
    return Math.round(ship.cargo * (1 + 0.1 * this.level("hold")));
  }

  maxHull(ship: ShipDef = this.ship) {
    return Math.round(ship.hull * (1 + 0.15 * this.level("hull")));
  }

  guns(ship: ShipDef = this.ship) {
    return Math.min(9, ship.guns + this.level("guns"));
  }

  /** Cargo units in the hold: your own goods plus contract cargo. */
  used() {
    let n = 0;
    for (const g of GOOD_IDS) n += this.s.cargo[g] ?? 0;
    for (const c of this.s.contracts) n += c.loaded;
    return n;
  }

  free() {
    return Math.max(0, this.cap() - this.used());
  }

  have(g: GoodId) {
    return this.s.cargo[g] ?? 0;
  }

  maxContracts() {
    return 2 + Math.floor(this.rank / 3);
  }

  /** Value of your own cargo at its average purchase price. */
  cargoValue() {
    let v = 0;
    for (const g of GOOD_IDS) v += (this.s.cargo[g] ?? 0) * (this.s.basis[g] ?? GOODS[g].base);
    return v;
  }

  // --- Markets ----------------------------------------------------------------------------------

  private factor(port: PortDef, g: GoodId) {
    const made = port.produces.indexOf(g);
    if (made >= 0) return 0.58 + made * 0.05;
    if (port.wants.includes(g)) {
      // The further away the nearest supplier, the more they pay.
      let near = Infinity;
      for (const p of PORTS) if (p.produces.includes(g)) near = Math.min(near, Math.hypot(p.x - port.x, p.z - port.z));
      return 1.28 + 0.5 * clamp(near / 1500, 0, 1);
    }
    return 0.92;
  }

  private drift(port: PortDef, g: GoodId) {
    const h = hash(port.id, g);
    const t = this.s.time;
    return 1 + 0.1 * Math.sin(t / 211 + (h % 628) / 100) + 0.05 * Math.sin(t / 67 + ((h >> 10) % 628) / 100);
  }

  private pressure(port: PortId, g: GoodId) {
    const p = this.s.pressure[`${port}:${g}`];
    if (!p) return 0;
    return p[0] * Math.exp(-(this.s.time - p[1]) / 240);
  }

  private push(port: PortId, g: GoodId, delta: number) {
    const v = clamp(this.pressure(port, g) + delta, -0.5, 0.6);
    this.s.pressure[`${port}:${g}`] = [v, this.s.time];
  }

  private price(port: PortId, g: GoodId, extra = 0) {
    const def = PORT[port];
    return GOODS[g].base * this.factor(def, g) * this.drift(def, g) * (1 + clamp(this.pressure(port, g) + extra, -0.5, 0.6));
  }

  canBuy(port: PortId, g: GoodId) {
    return PORT[port].produces.includes(g);
  }

  buyPrice(port: PortId, g: GoodId, extra = 0) {
    return Math.max(1, Math.ceil(this.price(port, g, extra) * (1 - 0.04 * this.level("haggle"))));
  }

  sellPrice(port: PortId, g: GoodId, extra = 0) {
    return Math.max(1, Math.floor(this.price(port, g, extra) * 0.94 * (1 + 0.04 * this.level("haggle"))));
  }

  /** Total cost of buying `qty` here (prices creep up as you buy). */
  quoteBuy(port: PortId, g: GoodId, qty: number) {
    let sum = 0;
    for (let i = 0; i < qty; i++) sum += this.buyPrice(port, g, i * 0.004);
    return sum;
  }

  quoteSell(port: PortId, g: GoodId, qty: number) {
    let sum = 0;
    for (let i = 0; i < qty; i++) sum += this.sellPrice(port, g, -i * 0.003);
    return sum;
  }

  /** How many you can afford and fit. */
  maxBuy(port: PortId, g: GoodId) {
    let n = 0;
    let spent = 0;
    const room = this.free();
    while (n < room) {
      const p = this.buyPrice(port, g, n * 0.004);
      if (spent + p > this.s.gold) break;
      spent += p;
      n++;
    }
    return n;
  }

  buy(port: PortId, g: GoodId, qty: number) {
    const n = Math.min(qty, this.maxBuy(port, g));
    if (n <= 0 || !this.canBuy(port, g)) return 0;
    const cost = this.quoteBuy(port, g, n);
    const had = this.have(g);
    const basis = this.s.basis[g] ?? 0;
    this.s.cargo[g] = had + n;
    this.s.basis[g] = (had * basis + cost) / (had + n);
    this.s.gold -= cost;
    this.push(port, g, n * 0.004);
    return n;
  }

  sell(port: PortId, g: GoodId, qty: number) {
    const n = Math.min(qty, this.have(g));
    if (n <= 0) return { n: 0, income: 0, profit: 0 };
    const income = this.quoteSell(port, g, n);
    const profit = income - n * (this.s.basis[g] ?? 0);
    this.s.cargo[g] = this.have(g) - n;
    if (!this.s.cargo[g]) {
      delete this.s.cargo[g];
      delete this.s.basis[g];
    }
    this.push(port, g, -n * 0.003);
    this.s.stats.sold += n;
    this.earn(income);
    if (profit > 0) this.addXp(profit / 12);
    return { n, income, profit };
  }

  /** Remembers today's prices here (shown on the chart). */
  private note(port: PortId) {
    const buy: Partial<Record<GoodId, number>> = {};
    const sell: Partial<Record<GoodId, number>> = {};
    for (const g of GOOD_IDS) {
      if (this.canBuy(port, g)) buy[g] = this.buyPrice(port, g);
      sell[g] = this.sellPrice(port, g);
    }
    this.s.known[port] = { t: this.s.time, buy, sell };
  }

  /** Prices the chart may show for a port: live with the Trade Network, else the last visit's. */
  pricesFor(port: PortId): KnownPrices | null {
    if (this.level("spyglass") && this.s.visited.includes(port)) {
      this.note(port);
      return this.s.known[port] ?? null;
    }
    return this.s.known[port] ?? null;
  }

  // --- Gold, xp, goals --------------------------------------------------------------------------

  earn(amount: number) {
    const v = Math.round(amount);
    this.s.gold += v;
    this.s.stats.earned += v;
    this.checkGoals();
  }

  addXp(amount: number) {
    const before = this.rank;
    this.s.xp += Math.round(amount);
    const after = this.rank;
    if (after > before) this.pending.push({ title: "Guild rank up!", text: `You are now a ${RANKS[after].name}${after === RANKS.length - 1 ? "" : " — new ships and more contracts"}`, tone: "good" });
    this.checkGoals();
  }

  goals() {
    return GOALS.map((g) => {
      const [cur, max] = g.progress(this);
      return { id: g.id, title: g.title, text: g.text, reward: g.reward, cur: Math.min(cur, max), max, done: this.s.goals.includes(g.id) };
    });
  }

  private checkGoals() {
    for (const g of GOALS) {
      if (this.s.goals.includes(g.id)) continue;
      const [cur, max] = g.progress(this);
      if (cur < max) continue;
      this.s.goals.push(g.id);
      this.s.gold += g.reward;
      this.s.xp += Math.round(g.reward / 20);
      this.pending.push({ title: `Logbook: ${g.title}`, text: `${g.text} — +${g.reward.toLocaleString("en-US")} gold`, tone: "good" });
    }
  }

  /** Rank-ups and finished goals since last asked. */
  takeNotices() {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  // --- Contracts --------------------------------------------------------------------------------

  board(port: PortId, ctx: BoardContext) {
    const window = Math.floor(this.s.time / BOARD_WINDOW);
    let b = this.s.boards[port];
    if (!b || b.window !== window) {
      b = { window, offers: this.makeOffers(port, window, ctx) };
      this.s.boards[port] = b;
    }
    return b.offers;
  }

  /** Seconds (at sea) until this port posts new contracts. */
  boardRefreshIn() {
    return BOARD_WINDOW - (this.s.time % BOARD_WINDOW);
  }

  private makeOffers(port: PortId, window: number, ctx: BoardContext): Contract[] {
    const r = rng(hash(this.s.seed, port, window));
    const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
    const here = PORT[port];
    const rank = this.rank;
    const rankMul = 1 + 0.06 * rank;
    const cap = this.cap();
    const speed = this.ship.speed;
    const others = PORTS.filter((p) => p.id !== port);
    // Prefer destinations a fair sail away.
    const destination = (wanting?: GoodId) => {
      const pool = wanting ? others.filter((p) => p.wants.includes(wanting)) : others;
      const list = pool.length ? pool : others;
      const weighted = list.map((p) => ({ p, w: 1 / (1 + Math.abs(Math.hypot(p.x - here.x, p.z - here.z) - 650) / 350) }));
      let t = r() * weighted.reduce((s, x) => s + x.w, 0);
      for (const x of weighted) if ((t -= x.w) <= 0) return x.p;
      return weighted[0].p;
    };
    const site = (min: number, max: number) => {
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2;
        const d = min + r() * (max - min);
        const x = here.x + Math.sin(a) * d;
        const z = here.z + Math.cos(a) * d;
        if (Math.abs(x) > BOUNDS - 80 || Math.abs(z) > BOUNDS - 80) continue;
        if (inHauntedSea(x, z)) continue;
        if (PORTS.some((p) => Math.hypot(p.x - x, p.z - z) < 160)) continue;
        if (!ctx.openSea(x, z)) continue;
        return { x, z };
      }
      return null;
    };
    const offers: Contract[] = [];
    const kinds: ContractKind[] = rank >= 1 ? ["freight", "freight", "order", "express", "bounty", "salvage", "freight", "order"] : ["freight", "freight", "express", "order"];
    for (let i = 0; i < 4; i++) {
      const kind = i === 0 ? "freight" : pick(kinds);
      const id = `${port}-${window}-${i}`;
      if (kind === "freight") {
        const g = pick(here.produces);
        const to = destination(g);
        const d = Math.hypot(to.x - here.x, to.z - here.z);
        const qty = Math.max(3, Math.round(cap * (0.35 + r() * 0.45)));
        const reward = Math.round((qty * (GOODS[g].base * 0.45 + 6) * (0.7 + d / 450) + 60) * rankMul);
        const time = Math.round((d / 6.5) * 1.7 + 60);
        offers.push({ id, kind, from: port, to: to.id, load: g, qty, loaded: 0, reward, time, left: time });
      } else if (kind === "express") {
        const to = destination();
        const d = Math.hypot(to.x - here.x, to.z - here.z);
        const qty = Math.max(1, Math.min(cap, 2 + Math.floor(r() * 5)));
        const reward = Math.round((50 + d * 0.25) * (1 + qty * 0.08) * rankMul);
        const time = Math.round(d / (speed * 0.55) + 40);
        offers.push({ id, kind, from: port, to: to.id, load: r() < 0.5 ? "mail" : "passengers", qty, loaded: 0, reward, time, left: time });
      } else if (kind === "order") {
        const to = here;
        const g = pick(here.wants);
        const qty = Math.max(4, Math.round(cap * (0.5 + r() * 0.5)));
        const reward = Math.round((qty * GOODS[g].base * 1.9 + 60) * rankMul);
        const time = 600;
        offers.push({ id, kind, from: port, to: to.id, load: g, qty, loaded: 0, reward, time, left: time });
      } else if (kind === "bounty") {
        const at = site(260, 620);
        if (!at) continue;
        const pirate: PirateClass = rank >= 5 && r() < 0.6 ? "frigate" : rank >= 2 && r() < 0.7 ? "brig" : "sloop";
        const reward = Math.round((350 + (pirate === "frigate" ? 2 : pirate === "brig" ? 1 : 0) * 260) * rankMul);
        offers.push({ id, kind, from: port, to: port, load: null, qty: 1, loaded: 0, reward, time: 720, left: 720, site: at, captain: pick(CAPTAINS), pirate });
      } else {
        const at = site(220, 560);
        if (!at) continue;
        const g = pick<GoodId>(["silk", "gems", "spices", "medicine", "tea"]);
        const to = destination(g);
        const qty = Math.max(2, Math.min(cap, 3 + Math.floor(r() * 6)));
        const d = Math.hypot(at.x - here.x, at.z - here.z) + Math.hypot(to.x - at.x, to.z - at.z);
        const reward = Math.round((qty * GOODS[g].base * 0.7 + 120) * rankMul);
        const time = Math.round((d / 6.5) * 1.8 + 120);
        offers.push({ id, kind, from: port, to: to.id, load: g, qty, loaded: 0, reward, time, left: time, site: at });
      }
    }
    return offers;
  }

  /** Why an offer can't be taken (null = it can). */
  blocked(c: Contract) {
    if (this.s.contracts.length >= this.maxContracts()) return `Your guild rank allows ${this.maxContracts()} contracts at a time`;
    const needs = c.kind === "freight" || c.kind === "express" ? c.qty : 0;
    if (needs > this.free()) return `Needs ${needs} free cargo space (you have ${this.free()})`;
    return null;
  }

  accept(port: PortId, id: string) {
    const b = this.s.boards[port];
    const c = b?.offers.find((o) => o.id === id);
    if (!b || !c || this.blocked(c)) return null;
    b.offers = b.offers.filter((o) => o !== c);
    if (c.kind === "freight" || c.kind === "express") c.loaded = c.qty;
    this.s.contracts.push(c);
    return c;
  }

  abandon(id: string) {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c) return;
    this.s.contracts = this.s.contracts.filter((x) => x !== c);
  }

  private complete(c: Contract, notices: Notice[], bonus = 0) {
    this.s.contracts = this.s.contracts.filter((x) => x !== c);
    const pay = c.reward + bonus;
    this.earn(pay);
    this.addXp(pay / 5);
    this.s.stats.contracts++;
    if (c.kind === "bounty") this.s.stats.bounties++;
    this.checkGoals();
    notices.push({ title: "Contract complete", text: `${contractText(c).title} — +${pay.toLocaleString("en-US")} gold${bonus ? " (with a tip for speed)" : ""}`, tone: "good" });
  }

  /** Docking: deliveries due here are paid, the market is noted, the port is logged. */
  arrive(port: PortId) {
    const notices: Notice[] = [];
    this.s.port = port;
    this.s.sea = null;
    if (!this.s.visited.includes(port)) {
      this.s.visited.push(port);
      notices.push({ title: "New port charted", text: `${PORT[port].name}: ${PORT[port].blurb}`, tone: "info" });
      this.addXp(40);
    }
    for (const c of [...this.s.contracts]) {
      if (c.to !== port) continue;
      if (c.kind === "freight" || c.kind === "express") {
        // Quick express runs earn a tip.
        const bonus = c.kind === "express" && c.left > c.time * 0.35 ? Math.round(c.reward * 0.25) : 0;
        this.complete(c, notices, bonus);
      } else if (c.kind === "salvage" && c.loaded >= c.qty) this.complete(c, notices);
      else if (c.kind === "order" && c.load && c.load !== "mail" && c.load !== "passengers" && this.have(c.load) >= c.qty) {
        const g = c.load;
        this.s.cargo[g] = this.have(g) - c.qty;
        if (!this.s.cargo[g]) {
          delete this.s.cargo[g];
          delete this.s.basis[g];
        }
        this.s.stats.sold += c.qty;
        this.complete(c, notices);
      }
    }
    this.note(port);
    this.checkGoals();
    return notices;
  }

  /** Time passes at sea: contract clocks run down. Returns the contracts that just failed. */
  tick(dt: number, sailed: number) {
    this.s.time += dt;
    this.s.stats.played += dt;
    this.s.stats.sailed += sailed;
    const failed: Contract[] = [];
    for (const c of this.s.contracts) {
      c.left -= dt;
      if (c.left <= 0) failed.push(c);
    }
    if (failed.length) this.s.contracts = this.s.contracts.filter((c) => !failed.includes(c));
    return failed;
  }

  /** A bounty's pirate went down. */
  bountyDone(id: string) {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c) return [];
    const notices: Notice[] = [];
    this.complete(c, notices);
    return notices;
  }

  /** One salvage crate fished out. False when the hold is full. */
  salvage(id: string) {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c || c.loaded >= c.qty) return false;
    if (this.free() <= 0) return false;
    c.loaded++;
    return true;
  }

  /** Floating cargo from a sunk pirate: as much as fits. */
  pickUp(g: GoodId, qty: number) {
    const n = Math.min(qty, this.free());
    if (n > 0) {
      const had = this.have(g);
      this.s.basis[g] = (had * (this.s.basis[g] ?? 0)) / (had + n);
      this.s.cargo[g] = had + n;
    }
    return n;
  }

  // --- Ships & upgrades -------------------------------------------------------------------------

  shipBlocked(id: ShipId, port: PortId) {
    const def = SHIP_DEFS[id];
    if (this.s.fleet.includes(id)) return null;
    if (!PORT[port].yard.includes(id)) return "Not built here";
    if (def.ghost && !this.s.stats.queens) return "Sink the Drowned Queen first";
    if (this.rank < def.rank) return `Needs guild rank: ${RANKS[def.rank].name}`;
    if (this.s.gold < def.price) return "Not enough gold";
    return null;
  }

  buyShip(id: ShipId, port: PortId) {
    if (this.shipBlocked(id, port) || this.s.fleet.includes(id)) return false;
    this.s.gold -= SHIP_DEFS[id].price;
    this.s.fleet.push(id);
    this.checkGoals();
    return this.switchShip(id) || true;
  }

  switchBlocked(id: ShipId) {
    if (!this.s.fleet.includes(id)) return "Not in your fleet";
    if (this.used() > this.cap(SHIP_DEFS[id])) return `Too much cargo for her hold (${this.used()} / ${this.cap(SHIP_DEFS[id])})`;
    return null;
  }

  switchShip(id: ShipId) {
    if (this.switchBlocked(id)) return false;
    this.s.ship = id;
    // Ships in the fleet are kept in good repair while moored.
    this.s.hull = 1;
    return true;
  }

  upgradeCost(id: TradeUpgradeId) {
    return TRADE_UPGRADES[id].costs[this.level(id)] ?? null;
  }

  buyUpgrade(id: TradeUpgradeId) {
    const cost = this.upgradeCost(id);
    if (cost === null || this.s.gold < cost) return false;
    this.s.gold -= cost;
    this.s.up[id] = this.level(id) + 1;
    return true;
  }

  /** Gold to patch the whole hull here. */
  repairCost() {
    const missing = (1 - this.s.hull) * this.maxHull();
    return Math.ceil(missing * (0.6 + 0.08 * this.rank));
  }

  repair() {
    const cost = this.repairCost();
    if (cost <= 0) return false;
    if (this.s.gold >= cost) {
      this.s.gold -= cost;
      this.s.hull = 1;
      return true;
    }
    // Patch what you can afford.
    const per = 0.6 + 0.08 * this.rank;
    const hp = Math.floor(this.s.gold / per);
    if (hp <= 0) return false;
    this.s.gold -= Math.ceil(hp * per);
    this.s.hull = Math.min(1, this.s.hull + hp / this.maxHull());
    return true;
  }

  // --- Disasters & treasure ---------------------------------------------------------------------

  /** Sunk: cargo and carried contracts are lost, the guild tows you home for a fee. */
  wrecked() {
    const lostGoods = GOOD_IDS.reduce((n, g) => n + this.have(g), 0);
    const lostValue = Math.round(this.cargoValue());
    const failed = this.s.contracts.filter((c) => c.loaded > 0 && c.kind !== "bounty");
    this.s.contracts = this.s.contracts.filter((c) => !failed.includes(c));
    this.s.cargo = {};
    this.s.basis = {};
    const fee = Math.min(this.s.gold, Math.round(this.s.gold * 0.1), 1500 + this.rank * 500);
    this.s.gold -= fee;
    this.s.hull = 0.5;
    this.s.sea = null;
    return { lostGoods, lostValue, failed: failed.length, fee, port: this.s.port };
  }

  addMap(island: number) {
    if (this.s.maps.includes(island) || this.s.dug.includes(island) || this.s.maps.length >= 3) return false;
    this.s.maps.push(island);
    return true;
  }

  dig(island: number) {
    if (!this.s.maps.includes(island)) return 0;
    this.s.maps = this.s.maps.filter((i) => i !== island);
    this.s.dug.push(island);
    this.s.stats.treasures++;
    const gold = Math.round((900 + this.rank * 450) * (0.8 + Math.random() * 0.6));
    this.earn(gold);
    this.addXp(gold / 8);
    return gold;
  }

  queenSunk() {
    this.s.stats.queens++;
    this.s.queenAt = this.s.time + 900;
    const gold = 12000 + this.rank * 1500;
    this.earn(gold);
    this.addXp(1500);
    return gold;
  }

  pirateSunk(kind: PirateClass | "ghost") {
    if (kind !== "ghost") this.s.stats.pirates++;
    this.addXp(kind === "frigate" ? 60 : kind === "brig" ? 35 : 20);
    this.checkGoals();
  }

  toSave(): CareerSave {
    return JSON.parse(JSON.stringify(this.s));
  }
}
