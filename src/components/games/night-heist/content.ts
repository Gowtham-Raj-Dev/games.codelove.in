import type { LootKind } from "./levels";

/**
 * Night Heist's campaign and shop as plain data (no three.js): the five districts, the crew, their
 * outfits, gadgets and upgrades, what a heist pays, and the save — read back through `readSave`, so
 * an old or broken save can never crash the game.
 */

export const HEISTS_PER_DISTRICT = 8;

export interface DistrictDef {
  id: string;
  name: string;
  /** One line under the name. */
  blurb: string;
  /** What is new here (shown on the district tab). */
  security: string;
  /** Value of every target gem here, and what the other valuables are worth compared with the museum. */
  targetValue: number;
  lootMult: number;
  loot: Record<LootKind, string>;
  /** Tab colour. */
  color: string;
}

export const DISTRICTS: readonly DistrictDef[] = [
  {
    id: "museum",
    name: "Museum Row",
    blurb: "The Egyptian wing after closing time",
    security: "Night guards, cameras, laser gates, pressure plates",
    targetValue: 2000,
    lootMult: 1,
    loot: { coins: "Gold coins", jar: "Canopic jar", figurine: "Bastet figurine", gem: "Loose gem", safe: "Curator's safe" },
    color: "#f59e0b",
  },
  {
    id: "manor",
    name: "Hillcrest Manor",
    blurb: "Old money, creaky floors and light sleepers",
    security: "Guard dogs, creaky floorboards, wall safes",
    targetValue: 2600,
    lootMult: 1.25,
    loot: { coins: "Silver coins", jar: "Porcelain vase", figurine: "Gilded portrait", gem: "Heirloom brooch", safe: "Wall safe" },
    color: "#a78bfa",
  },
  {
    id: "harbor",
    name: "Harbor Depot",
    blurb: "Crates in, crates out, nobody asks",
    security: "Flashlight sentries, gravel yards, dog patrols",
    targetValue: 3200,
    lootMult: 1.5,
    loot: { coins: "Cash roll", jar: "Sealed parcel", figurine: "Smuggled idol", gem: "Uncut stone", safe: "Strongbox" },
    color: "#38bdf8",
  },
  {
    id: "casino",
    name: "Grand Meridian",
    blurb: "The house always wins. Not tonight",
    security: "Captains, vault timers, sweeping laser gates",
    targetValue: 3800,
    lootMult: 1.75,
    loot: { coins: "Chip stack", jar: "Cash drawer", figurine: "High-roller trophy", gem: "Jackpot jewel", safe: "Cage safe" },
    color: "#f472b6",
  },
  {
    id: "tower",
    name: "Apex Tower",
    blurb: "Forty floors of glass and paranoia",
    security: "Patrol drones and everything that came before",
    targetValue: 4500,
    lootMult: 2,
    loot: { coins: "Bearer bonds", jar: "Prototype chip", figurine: "Data core", gem: "Lab crystal", safe: "Server vault" },
    color: "#34d399",
  },
];

export const TOTAL_HEISTS = DISTRICTS.length * HEISTS_PER_DISTRICT;

export const districtIndex = (heist: number) => Math.max(0, Math.min(DISTRICTS.length - 1, Math.floor(heist / HEISTS_PER_DISTRICT)));
export const districtOf = (heist: number) => DISTRICTS[districtIndex(heist)];

// --- What the thief brings ------------------------------------------------------------------------------

export type GadgetId = "smoke" | "jammer" | "lockpick";

/** Everything a crew member, a gadget and the upgrades change about a heist. */
export interface Mods {
  /** Speed multipliers. */
  sneak: number;
  run: number;
  /** Walking-noise radius multiplier. */
  walkNoise: number;
  /** How fast guards, cameras and drones notice the thief. */
  notice: number;
  koTime: number;
  koReach: number;
  /** Cash multiplier on the haul. */
  cash: number;
  /** Extra throwing coins. */
  coins: number;
  /** Time multiplier for cracking safes and picking things up. */
  hands: number;
  gadget: GadgetId | null;
  charges: number;
  /** Key cards in the pocket at the start. */
  keys: number;
}

export const BASE_MODS: Mods = { sneak: 1, run: 1, walkNoise: 1, notice: 1, koTime: 1, koReach: 0, cash: 1, coins: 0, hands: 1, gadget: null, charges: 0, keys: 0 };

// --- Shop ------------------------------------------------------------------------------------------------

export type ShopKind = "thief" | "outfit" | "gadget" | "upgrade";

export interface ShopItem {
  id: string;
  name: string;
  /** Cash; 0 = free from the start. */
  price: number;
  /** One line: what it does. */
  perk: string;
}

export interface ThiefDef extends ShopItem {
  /** Model in the site's library (Mini Characters — everyone shares the same rig and moves). */
  key: string;
  mods: Partial<Mods>;
}

export const THIEVES: readonly ThiefDef[] = [
  { id: "shade", name: "Shade", price: 0, key: "mini-characters/character-male-d", perk: "The original — no tricks, no weak spots", mods: {} },
  { id: "tiptoe", name: "Tiptoe", price: 6000, key: "mini-characters/character-female-b", perk: "Sneaks 25% faster", mods: { sneak: 1.25 } },
  { id: "dash", name: "Dash", price: 9000, key: "mini-characters/character-male-a", perk: "Runs 15% faster · quieter footsteps", mods: { run: 1.15, walkNoise: 0.7 } },
  { id: "lucky", name: "Lucky", price: 14000, key: "mini-characters/character-female-e", perk: "+20% cash from every heist", mods: { cash: 1.2 } },
  { id: "knuckles", name: "Knuckles", price: 20000, key: "mini-characters/character-male-f", perk: "Knockouts last twice as long · longer reach", mods: { koTime: 2, koReach: 0.35 } },
  { id: "ghost", name: "Ghost", price: 30000, key: "mini-characters/character-female-f", perk: "Everyone notices you 30% slower", mods: { notice: 0.7 } },
];

export interface OutfitDef extends ShopItem {
  /** Multiplies the model's colours (the dark night suit is the base). */
  tint: string;
  /** A soft glow in this colour (the flashy ones). */
  glow?: string;
  /** Swatch for the shop card (CSS background). */
  swatch: string;
}

export const OUTFITS: readonly OutfitDef[] = [
  { id: "night", name: "Night Suit", price: 0, perk: "Classic black", tint: "#9e9e9e", swatch: "linear-gradient(135deg, #475569, #0f172a)" },
  { id: "crimson", name: "Crimson", price: 2000, perk: "For the bold", tint: "#e0505a", swatch: "linear-gradient(135deg, #fca5a5, #b91c1c)" },
  { id: "cobalt", name: "Cobalt", price: 3000, perk: "Cool under pressure", tint: "#5a8cf0", swatch: "linear-gradient(135deg, #93c5fd, #1d4ed8)" },
  { id: "jade", name: "Jade", price: 4000, perk: "Smooth operator", tint: "#4fd08a", swatch: "linear-gradient(135deg, #86efac, #15803d)" },
  { id: "violet", name: "Violet", price: 6000, perk: "After-hours velvet", tint: "#a070f0", swatch: "linear-gradient(135deg, #d8b4fe, #6d28d9)" },
  { id: "arctic", name: "Arctic", price: 8000, perk: "Bright white. Show-off", tint: "#f4f8ff", swatch: "linear-gradient(135deg, #ffffff, #bae6fd)" },
  { id: "gold", name: "Gold", price: 12000, perk: "You earned it", tint: "#ffcc4a", glow: "#ffb300", swatch: "linear-gradient(135deg, #fef08a, #d97706)" },
  { id: "neon", name: "Neon", price: 16000, perk: "Glows in the dark (guards see you just the same)", tint: "#6ef2ff", glow: "#22d3ee", swatch: "linear-gradient(135deg, #22d3ee, #0b0b1a 50%, #e879f9)" },
];

export interface GadgetDef extends ShopItem {
  id: GadgetId;
  /** Uses per heist (0 = works by itself). */
  charges: number;
}

export const GADGETS: readonly GadgetDef[] = [
  { id: "smoke", name: "Smoke Bomb", price: 8000, charges: 2, perk: "Vanish in a cloud for 6 seconds — eyes and lenses can't see in (noses can)" },
  { id: "lockpick", name: "Lockpick", price: 10000, charges: 0, perk: "Opens one locked door per heist without a key card" },
  { id: "jammer", name: "Jammer", price: 14000, charges: 2, perk: "Blinds cameras, lasers and drones around you for 8 seconds" },
];

export interface UpgradeDef {
  id: string;
  name: string;
  /** Price of each level. */
  prices: number[];
  /** What each level does, in words. */
  levels: string[];
  apply(mods: Mods, level: number): void;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: "pouch", name: "Coin Pouch", prices: [3000, 7000, 12000], levels: ["+1 throwing coin", "+2 throwing coins", "+3 throwing coins"], apply: (m, l) => void (m.coins += l) },
  { id: "soles", name: "Soft Soles", prices: [5000, 12000], levels: ["Walking is 30% quieter", "Walking is 60% quieter"], apply: (m, l) => void (m.walkNoise *= 1 - 0.3 * l) },
  { id: "hands", name: "Quick Hands", prices: [4000, 10000], levels: ["Safes and grabs 25% faster", "Safes and grabs 50% faster"], apply: (m, l) => void (m.hands *= 1 - 0.25 * l) },
  { id: "belt", name: "Gadget Belt", prices: [8000, 16000], levels: ["+1 gadget use per heist", "+2 gadget uses per heist"], apply: (m, l) => void (m.charges += l) },
  { id: "fence", name: "Fence Contact", prices: [10000, 22000], levels: ["+10% cash from every heist", "+20% cash from every heist"], apply: (m, l) => void (m.cash *= 1 + 0.1 * l) },
];

export const findItem = <T extends { id: string }>(list: readonly T[], id: string): T => list.find((i) => i.id === id) ?? list[0];

export const ownedKey = (kind: ShopKind, id: string) => `${kind}:${id}`;

// --- Save ------------------------------------------------------------------------------------------------

export interface HeistRecord {
  stars: number;
  /** Best time in seconds. */
  time: number;
  /** Best haul in cash. */
  value: number;
  loot: number;
  clean: boolean;
}

export interface Save {
  /** Best result per heist, by its number (0-based) as a string. */
  heists: Record<string, HeistRecord>;
  bank: number;
  owned: string[];
  upgrades: Record<string, number>;
  thief: string;
  outfit: string;
  /** "" = none. */
  gadget: string;
  /** The heist opened last. */
  last: number;
  runs: number;
}

export const SAVE_DEFAULTS: Save = { heists: {}, bank: 0, owned: [], upgrades: {}, thief: THIEVES[0].id, outfit: OUTFITS[0].id, gadget: "", last: 0, runs: 0 };

const num = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function readRecord(v: unknown): HeistRecord | null {
  const r = obj(v);
  const stars = Math.floor(num(r.stars, 0, 3, 0));
  if (stars < 1) return null;
  return { stars, time: num(r.time, 0, 86400, 0), value: Math.floor(num(r.value, 0, 1e7, 0)), loot: Math.floor(num(r.loot, 0, 99, 0)), clean: r.clean === true };
}

const isOwnedIn = (owned: string[], kind: ShopKind, item: ShopItem) => item.price === 0 || owned.includes(ownedKey(kind, item.id));

/**
 * A save as the game may trust it: whatever was stored (an older version, a half-written or
 * hand-edited one, another game's data) comes out as a complete, valid save — anything unreadable is dropped.
 */
export function readSave(raw: unknown): Save {
  const s = obj(raw);
  const heists: Record<string, HeistRecord> = {};
  // The first version of the game kept its eight museum cases under `cases`.
  for (const source of [obj(s.cases), obj(s.heists)]) {
    for (const [k, v] of Object.entries(source)) {
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= TOTAL_HEISTS) continue;
      const rec = readRecord(v);
      if (rec) heists[String(i)] = rec;
    }
  }
  const known = new Set([...THIEVES.map((t) => ownedKey("thief", t.id)), ...OUTFITS.map((o) => ownedKey("outfit", o.id)), ...GADGETS.map((g) => ownedKey("gadget", g.id))]);
  const owned = Array.isArray(s.owned) ? [...new Set(s.owned.filter((k): k is string => typeof k === "string" && known.has(k)))] : [];
  const upgrades: Record<string, number> = {};
  for (const u of UPGRADES) {
    const level = Math.floor(num(obj(s.upgrades)[u.id], 0, u.prices.length, 0));
    if (level > 0) upgrades[u.id] = level;
  }
  const pick = <T extends ShopItem>(kind: ShopKind, list: readonly T[], id: unknown, fallback: string) => {
    const item = typeof id === "string" ? list.find((i) => i.id === id) : undefined;
    return item && isOwnedIn(owned, kind, item) ? item.id : fallback;
  };
  // A save from before the shop: the loot already carried out is paid now.
  const legacyBank = s.bank === undefined && s.cases !== undefined ? Object.values(heists).reduce((n, r) => n + r.value, 0) : 0;
  // The heist opened last, if it is (still) open: otherwise the first one not yet pulled off.
  let last = Math.floor(num(s.last, 0, TOTAL_HEISTS - 1, 0));
  if (last > 0 && !heists[String(last - 1)]) {
    last = 0;
    while (last < TOTAL_HEISTS - 1 && heists[String(last)]) last++;
  }
  return {
    heists,
    bank: Math.floor(num(s.bank, 0, 1e9, legacyBank)),
    owned,
    upgrades,
    thief: pick("thief", THIEVES, s.thief, THIEVES[0].id),
    outfit: pick("outfit", OUTFITS, s.outfit, OUTFITS[0].id),
    gadget: pick("gadget", GADGETS, s.gadget, ""),
    last,
    runs: Math.floor(num(s.runs, 0, 1e9, 0)),
  };
}

export const isOwned = (save: Save, kind: ShopKind, item: ShopItem) => isOwnedIn(save.owned, kind, item);

/** A heist opens once the one before it has been pulled off. */
export const isUnlocked = (heist: number, save: Save) => heist === 0 || !!save.heists[String(heist - 1)];

/** The first heist not yet pulled off (the last one when all are). */
export function nextHeist(save: Save) {
  for (let i = 0; i < TOTAL_HEISTS; i++) if (!save.heists[String(i)]) return i;
  return TOTAL_HEISTS - 1;
}

export const totalStars = (save: Save) => Object.values(save.heists).reduce((n, r) => n + r.stars, 0);
export const districtStars = (save: Save, d: number) => {
  let n = 0;
  for (let i = d * HEISTS_PER_DISTRICT; i < (d + 1) * HEISTS_PER_DISTRICT; i++) n += save.heists[String(i)]?.stars ?? 0;
  return n;
};
export const districtOpen = (save: Save, d: number) => isUnlocked(d * HEISTS_PER_DISTRICT, save);

/** What the thief brings to a heist: the crew member's perk, the equipped gadget and every upgrade. */
export function modsOf(save: Save): Mods {
  const mods: Mods = { ...BASE_MODS, ...findItem(THIEVES, save.thief).mods };
  for (const u of UPGRADES) {
    const level = save.upgrades[u.id] ?? 0;
    if (level > 0) u.apply(mods, level);
  }
  const gadget = GADGETS.find((g) => g.id === save.gadget);
  if (gadget) {
    mods.gadget = gadget.id;
    if (gadget.id === "lockpick") {
      // The lockpick opens doors instead of having uses: each Gadget Belt level adds one more pick.
      mods.keys += 1 + (save.upgrades.belt ?? 0);
      mods.charges = 0;
    } else mods.charges += gadget.charges;
  } else mods.charges = 0;
  return mods;
}

/**
 * Cash banked for a haul: loot never sold before pays in full; a haul no bigger than the best one
 * for that heist pays a quarter again (the fence has seen it before).
 */
export function payout(value: number, bestBefore: number, cash: number) {
  const fresh = Math.max(0, value - bestBefore);
  const repeat = Math.min(value, bestBefore);
  return Math.round(((fresh + repeat * 0.25) * cash) / 10) * 10;
}
