import { REGIONS, UPGRADES, type UpgradeId } from "./data";
import { MISSIONS } from "./missions";

/**
 * Sky Courier's hangar — airships, paint and upgrades, bought with the coins missions pay — and the
 * saved game. Plain data (no three.js) so the menus can import it.
 */

export type ShopKind = "frame" | "paint";

export interface ShopItem {
  id: string;
  name: string;
  /** Coins; 0 = yours from the start. */
  price: number;
}

/** How an airship flies, before upgrades. */
export interface FrameDef extends ShopItem {
  perk: string;
  /** Top speed (m/s). */
  speed: number;
  /** Multiplies how fast it turns. */
  turn: number;
  /** Climb and dive rate (m/s). */
  climb: number;
  /** Boost tank size (1 = the Sloop's). */
  boost: number;
  hull: number;
  /** Multiplies the damage a bump does to the parcel on board (lower = gentler). */
  care: number;
  /** Stretch of the model along x, y, z: every frame is the one airship in the library, reshaped. */
  shape: [number, number, number];
}

export const FRAMES: readonly FrameDef[] = [
  { id: "sloop", name: "Postal Sloop", price: 0, perk: "Balanced · the service airship", speed: 30, turn: 1, climb: 14, boost: 1, hull: 100, care: 1, shape: [1, 1, 1] },
  { id: "kestrel", name: "Kestrel", price: 600, perk: "Tight turns, quick climbs · light hull", speed: 31, turn: 1.28, climb: 18, boost: 0.85, hull: 80, care: 1.1, shape: [0.88, 0.9, 0.96] },
  { id: "hauler", name: "Brass Hauler", price: 1400, perk: "Thick hull · parcels ride soft · slow to turn", speed: 28.5, turn: 0.9, climb: 13, boost: 1, hull: 160, care: 0.5, shape: [1.2, 1.04, 1.08] },
  { id: "clipper", name: "Gale Clipper", price: 2600, perk: "Fastest · big boost tank · wide turns", speed: 35, turn: 0.92, climb: 14, boost: 1.35, hull: 95, care: 1, shape: [0.92, 0.94, 1.26] },
  { id: "royal", name: "Aurora Royal", price: 4500, perk: "Fast, agile and tough: the pride of the service", speed: 34, turn: 1.16, climb: 17, boost: 1.25, hull: 130, care: 0.75, shape: [1.06, 1.06, 1.12] },
];

/** A paint job: the hull, the trim and the colour of the glowing panels. */
export interface PaintDef extends ShopItem {
  body: string;
  trim: string;
  glow: string;
  /** Trail left at full speed. */
  trail: string;
}

export const PAINTS: readonly PaintDef[] = [
  { id: "classic", name: "Service Blue", price: 0, body: "#1c2836", trim: "#16303c", glow: "#34c8ff", trail: "#ffffff" },
  { id: "postal", name: "Postal Red", price: 250, body: "#b3261e", trim: "#f3e3c0", glow: "#ffd9a0", trail: "#ffe1c4" },
  { id: "meadow", name: "Meadow", price: 400, body: "#2f7d46", trim: "#e9d9a6", glow: "#c8ff8a", trail: "#d8ffb0" },
  { id: "brass", name: "Brass", price: 600, body: "#b8862b", trim: "#4a3110", glow: "#ffe08a", trail: "#fff0b8" },
  { id: "sunset", name: "Sunset", price: 800, body: "#e8663a", trim: "#7a2a52", glow: "#ffb1d8", trail: "#ffc6a0" },
  { id: "snow", name: "Snowbird", price: 1000, body: "#e9eef5", trim: "#7aa7d8", glow: "#8fd8ff", trail: "#ffffff" },
  { id: "royal", name: "Royal Purple", price: 1300, body: "#5b2d91", trim: "#d4af37", glow: "#f0c8ff", trail: "#e3c4ff" },
  { id: "candy", name: "Candy Floss", price: 1600, body: "#f48fb1", trim: "#fff3f8", glow: "#a8fff2", trail: "#ffd0e4" },
  { id: "midnight", name: "Midnight", price: 2000, body: "#0c0d18", trim: "#2a1846", glow: "#ff4fd8", trail: "#ff9be8" },
  { id: "gold", name: "Gold Leaf", price: 3000, body: "#e6b422", trim: "#fff4c2", glow: "#ffffff", trail: "#fff2a8" },
];

export const ITEMS: Record<ShopKind, readonly ShopItem[]> = { frame: FRAMES, paint: PAINTS };

export const findItem = <T extends ShopItem>(list: readonly T[], id: string): T => list.find((i) => i.id === id) ?? list[0];

export const ownedKey = (kind: ShopKind, id: string) => `${kind}:${id}`;

export const MAX_UPGRADE = UPGRADES[0].costs.length;
export const upgradeCost = (id: UpgradeId, level: number): number | null => UPGRADES.find((u) => u.id === id)?.costs[level] ?? null;

// --- What the engine flies ------------------------------------------------------------------------------

export interface Loadout {
  frame: string;
  paint: string;
  engine: number;
  tank: number;
  hull: number;
}

export interface ShipStats {
  speed: number;
  /** How fast the airship picks up speed (1/s). */
  accel: number;
  turn: number;
  climb: number;
  boostCap: number;
  /** Boost refilled per second. */
  boostRegen: number;
  hull: number;
  /** Multiplies hull damage from bumps, and the damage to the parcel on board. */
  armor: number;
  care: number;
}

export function shipStats(l: Loadout): ShipStats {
  const f = findItem(FRAMES, l.frame);
  return {
    speed: f.speed + 3 * l.engine,
    accel: 0.7 + 0.09 * l.engine,
    turn: f.turn,
    climb: f.climb,
    boostCap: f.boost * (1 + 0.25 * l.tank),
    boostRegen: 0.012 + 0.006 * l.tank,
    hull: f.hull + 25 * l.hull,
    armor: 1 - 0.1 * l.hull,
    care: f.care * (1 - 0.08 * l.hull),
  };
}

// --- The saved game -------------------------------------------------------------------------------------

export interface Save {
  bank: number;
  /** Stars per mission (0 = not cleared). */
  stars: number[];
  /** Best time per mission in seconds (0 = none). */
  best: number[];
  owned: string[];
  frame: string;
  paint: string;
  engine: number;
  tank: number;
  hull: number;
  /** The region last looked at on the flight board. */
  region: number;
  /** Free flight: the best day's tips per region. */
  bestDay: number[];
  deliveries: number;
  flights: number;
}

export const DEFAULT_SAVE: Save = {
  bank: 0,
  stars: [],
  best: [],
  owned: [],
  frame: FRAMES[0].id,
  paint: PAINTS[0].id,
  engine: 0,
  tank: 0,
  hull: 0,
  region: 0,
  bestDay: [],
  deliveries: 0,
  flights: 0,
};

const int = (v: unknown, lo: number, hi: number, fallback = lo) => {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

const list = (v: unknown, length: number, lo: number, hi: number, round = true) =>
  Array.from({ length }, (_, i) => {
    const n = Array.isArray(v) && typeof v[i] === "number" && Number.isFinite(v[i]) ? (v[i] as number) : lo;
    return Math.min(hi, Math.max(lo, round ? Math.round(n) : n));
  });

/**
 * A valid save from whatever was stored: an older version's, a half-written one, anything hand-edited.
 * Every field is checked and clamped; what can't be read starts fresh.
 */
export function sanitizeSave(raw: unknown): Save {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((k): k is string => typeof k === "string" && (Object.keys(ITEMS) as ShopKind[]).some((kind) => ITEMS[kind].some((it) => ownedKey(kind, it.id) === k))))] : [];
  const has = (kind: ShopKind, id: unknown): id is string => typeof id === "string" && ITEMS[kind].some((it) => it.id === id && (it.price === 0 || owned.includes(ownedKey(kind, it.id))));
  const stars = list(r.stars, MISSIONS.length, 0, 3);
  // Stars only count up to the first mission not cleared: the career opens in order.
  const firstGap = stars.findIndex((s) => s === 0);
  if (firstGap >= 0) for (let i = firstGap; i < stars.length; i++) stars[i] = 0;
  return {
    bank: int(r.bank, 0, 99_999_999),
    stars,
    best: list(r.best, MISSIONS.length, 0, 36_000, false).map((t, i) => (stars[i] > 0 ? t : 0)),
    owned,
    frame: has("frame", r.frame) ? r.frame : FRAMES[0].id,
    paint: has("paint", r.paint) ? r.paint : PAINTS[0].id,
    engine: int(r.engine, 0, MAX_UPGRADE),
    tank: int(r.tank, 0, MAX_UPGRADE),
    hull: int(r.hull, 0, MAX_UPGRADE),
    region: int(r.region, 0, REGIONS.length - 1),
    bestDay: list(r.bestDay, REGIONS.length, 0, 99_999_999),
    deliveries: int(r.deliveries, 0, 99_999_999),
    flights: int(r.flights, 0, 99_999_999),
  };
}

export const loadoutOf = (s: Save): Loadout => ({ frame: s.frame, paint: s.paint, engine: s.engine, tank: s.tank, hull: s.hull });

export const isOwned = (s: Save, kind: ShopKind, item: ShopItem) => item.price === 0 || s.owned.includes(ownedKey(kind, item.id));

export const totalStars = (stars: readonly number[]) => stars.reduce((a, b) => a + b, 0);
