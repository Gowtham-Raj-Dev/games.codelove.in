import { M } from "./manifest";
import { STAGES } from "./stages";

/**
 * The hangar: ships, upgrades and paint jobs bought with credits, the save that holds them, and the
 * flight numbers (shield, steering, firepower…) a loadout works out to. No three.js here.
 */

export type ShopKind = "ship" | "upgrade" | "skin";

export interface ShipDef {
  id: string;
  name: string;
  /** Library model. */
  key: string;
  price: number;
  blurb: string;
  shield: number;
  /** Steering speed, 1 = the Comet. */
  agility: number;
  /** Laser damage, 1 = the Comet. */
  power: number;
  /** Fire rate, 1 = the Comet. */
  rate: number;
  locks: number;
  bombs: number;
  /** Seconds to charge a lock-on, as a multiple of the Comet's. */
  charge: number;
}

export const SHIPS: ShipDef[] = [
  { id: "comet", name: "Comet", key: M.player, price: 0, blurb: "The fleet's standard racer: balanced in every way.", shield: 100, agility: 1, power: 1, rate: 1, locks: 4, bombs: 3, charge: 1 },
  { id: "needle", name: "Needle", key: M.speederA, price: 1200, blurb: "Very quick on the stick and on the trigger, but thin-skinned.", shield: 80, agility: 1.25, power: 1, rate: 1.3, locks: 4, bombs: 2, charge: 0.9 },
  { id: "raptor", name: "Raptor", key: M.speederC, price: 3000, blurb: "A hunter: six lock-ons that charge fast.", shield: 110, agility: 1.1, power: 1.2, rate: 1, locks: 6, bombs: 3, charge: 0.65 },
  { id: "anvil", name: "Anvil", key: M.miner, price: 6000, blurb: "A converted mining rig. Slow, heavily shielded, and it hits hard.", shield: 170, agility: 0.84, power: 1.6, rate: 0.9, locks: 4, bombs: 5, charge: 1.1 },
  { id: "lance", name: "Nova Lance", key: M.speederD, price: 10000, blurb: "The prototype: strong shield, double-strength lasers, six locks.", shield: 135, agility: 1.15, power: 2, rate: 1.15, locks: 6, bombs: 4, charge: 0.8 },
];

export interface UpgradeDef {
  id: string;
  name: string;
  /** What one level adds. */
  perk: string;
  /** Price of level 1, 2 and 3. */
  prices: [number, number, number];
}

export const UPGRADE_LEVELS = 3;

export const UPGRADES: UpgradeDef[] = [
  { id: "hull", name: "Shield cells", perk: "+15 shield per level", prices: [300, 800, 1800] },
  { id: "cannon", name: "Laser coils", perk: "+25% weapon damage per level", prices: [400, 1000, 2200] },
  { id: "targeting", name: "Lock computer", perk: "+1 lock-on and a faster charge per level", prices: [300, 800, 1800] },
  { id: "bay", name: "Bomb bay", perk: "+1 nova bomb per level", prices: [250, 700, 1500] },
  { id: "thruster", name: "Thrusters", perk: "Faster steering and a longer boost per level", prices: [250, 700, 1500] },
  { id: "salvage", name: "Salvage scoop", perk: "+15% credits per level", prices: [350, 900, 2000] },
];

export interface SkinDef {
  id: string;
  name: string;
  price: number;
  /** Paint per material of the ship models (Space Kit: metal, metalDark, metalRed). Left out = stock colour. */
  hull?: string;
  trim?: string;
  accent?: string;
  /** Engine flame colour. */
  trail: string;
  /** A faint glow of the hull. */
  glow?: string;
}

export const SKINS: SkinDef[] = [
  { id: "stock", name: "Factory", price: 0, trail: "#22d3ee" },
  { id: "ember", name: "Ember", price: 400, hull: "#f1e4d8", accent: "#ff3b30", trail: "#ff8a3c" },
  { id: "viper", name: "Viper", price: 800, hull: "#b7f397", accent: "#15803d", trail: "#5dff9b" },
  { id: "royal", name: "Royal", price: 1500, hull: "#c7b8ff", trim: "#8f7fd6", accent: "#7c3aed", trail: "#a78bfa" },
  { id: "stealth", name: "Stealth", price: 2500, hull: "#3a4252", trim: "#232936", accent: "#22d3ee", trail: "#22d3ee" },
  { id: "solar", name: "Solar Gold", price: 4000, hull: "#ffd166", trim: "#c99a2e", accent: "#fff3c4", trail: "#ffd166", glow: "#ffb627" },
];

export const findShip = (id: string) => SHIPS.find((s) => s.id === id) ?? SHIPS[0];
export const findSkin = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];
export const findUpgrade = (id: string) => UPGRADES.find((u) => u.id === id) ?? UPGRADES[0];

// --- Save -------------------------------------------------------------------------------------------

export interface Save {
  /** Best medal per mission (0 = not cleared, 1 bronze, 2 silver, 3 gold). */
  medals: number[];
  /** Best score per mission. */
  best: number[];
  credits: number;
  /** Ships and paint jobs bought: "ship:needle", "skin:ember". */
  owned: string[];
  ship: string;
  skin: string;
  /** Level of each upgrade (0–3). */
  upgrades: Record<string, number>;
  invertY: boolean;
  /** Lasers fire by themselves (null: on for touch screens, off with a keyboard). */
  autoFire: boolean | null;
  plays: number;
  kills: number;
}

export const DEFAULT_SAVE: Save = {
  medals: STAGES.map(() => 0),
  best: STAGES.map(() => 0),
  credits: 0,
  owned: [],
  ship: SHIPS[0].id,
  skin: SKINS[0].id,
  upgrades: {},
  invertY: false,
  autoFire: null,
  plays: 0,
  kills: 0,
};

const whole = (v: unknown, lo: number, hi: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

export const ownedKey = (kind: "ship" | "skin", id: string) => `${kind}:${id}`;

/**
 * A save as it was read (an older version, hand-edited, half-written…) made safe to use: every field
 * is checked, and anything missing or broken falls back to a new game's value.
 */
export function cleanSave(raw: unknown): Save {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown, hi: number) => STAGES.map((_, i) => (Array.isArray(v) ? whole(v[i], 0, hi) : 0));
  const medals = list(o.medals, 3);
  // A mission can only hold a medal if the one before it was cleared.
  for (let i = 1; i < medals.length; i++) if (medals[i - 1] === 0) medals[i] = 0;
  const owned = Array.isArray(o.owned) ? [...new Set(o.owned.filter((k): k is string => typeof k === "string"))] : [];
  const has = (kind: "ship" | "skin", id: string, price: number) => price === 0 || owned.includes(ownedKey(kind, id));
  const ship = SHIPS.find((s) => s.id === o.ship && has("ship", s.id, s.price)) ?? SHIPS[0];
  const skin = SKINS.find((s) => s.id === o.skin && has("skin", s.id, s.price)) ?? SKINS[0];
  const saved = (o.upgrades && typeof o.upgrades === "object" ? o.upgrades : {}) as Record<string, unknown>;
  const upgrades: Record<string, number> = {};
  for (const u of UPGRADES) upgrades[u.id] = whole(saved[u.id], 0, UPGRADE_LEVELS);
  return {
    medals,
    best: list(o.best, 99_999_999).map((b, i) => (medals[i] > 0 ? b : 0)),
    credits: whole(o.credits, 0, 9_999_999),
    owned,
    ship: ship.id,
    skin: skin.id,
    upgrades,
    invertY: o.invertY === true,
    autoFire: typeof o.autoFire === "boolean" ? o.autoFire : null,
    plays: whole(o.plays, 0, 9_999_999),
    kills: whole(o.kills, 0, 99_999_999),
  };
}

/** Missions open one by one: the first, then each one after a cleared mission. */
export const isUnlocked = (save: Save, stage: number) => stage === 0 || (save.medals[stage - 1] ?? 0) > 0;

/** The mission to play next: the first one not cleared yet (the last one once all are). */
export const nextMission = (save: Save) => {
  const i = save.medals.findIndex((n) => n === 0);
  return i < 0 ? STAGES.length - 1 : i;
};

export const isOwned = (save: Save, kind: "ship" | "skin", item: { id: string; price: number }) => item.price === 0 || save.owned.includes(ownedKey(kind, item.id));

/** Price of an upgrade's next level (null: already at the top). */
export const upgradePrice = (save: Save, u: UpgradeDef) => {
  const level = save.upgrades[u.id] ?? 0;
  return level >= UPGRADE_LEVELS ? null : u.prices[level];
};

// --- Loadout ----------------------------------------------------------------------------------------

export interface Loadout {
  ship: string;
  skin: string;
  upgrades: Record<string, number>;
}

export const loadoutOf = (save: Save): Loadout => ({ ship: save.ship, skin: save.skin, upgrades: save.upgrades });

/** What the engine flies with. */
export interface Stats {
  shield: number;
  /** Steering speed, metres per second. */
  move: number;
  /** Damage of one laser bolt (a twin laser doubles it). */
  damage: number;
  /** Seconds between laser shots while tapping, and between shots of the auto fire. */
  fireGap: number;
  autoGap: number;
  locks: number;
  chargeTime: number;
  bombs: number;
  /** Boost meter used per second. */
  boostDrain: number;
  /** Credit multiplier. */
  salvage: number;
}

export function statsFor(l: Loadout): Stats {
  const ship = findShip(l.ship);
  const lv = (id: string) => whole(l.upgrades[id], 0, UPGRADE_LEVELS);
  return {
    shield: ship.shield + lv("hull") * 15,
    move: 17 * ship.agility * (1 + lv("thruster") * 0.06),
    damage: ship.power * (1 + lv("cannon") * 0.25),
    fireGap: 0.09 / ship.rate,
    autoGap: 0.17 / ship.rate,
    locks: ship.locks + lv("targeting"),
    chargeTime: 0.6 * ship.charge * (1 - lv("targeting") * 0.1),
    bombs: ship.bombs + lv("bay"),
    boostDrain: 0.5 / (1 + lv("thruster") * 0.25),
    salvage: 1 + lv("salvage") * 0.15,
  };
}

/** A ship's numbers as 0..1 bars for its hangar card. */
export const shipBars = (s: ShipDef) => ({
  shield: s.shield / 170,
  speed: (s.agility - 0.7) / 0.6,
  power: (s.power * s.rate) / 2.3,
  locks: s.locks / 6,
});
