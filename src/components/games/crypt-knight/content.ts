import type { SkinLook } from "../skate-rush/content";
import type { Stats } from "./powers";

/**
 * Crypt Knight's shop: heroes, skins and worlds, bought with the coins saved after every run.
 * Plain data (no three.js) so the menu and shop can import it.
 */

export type ShopKind = "hero" | "skin" | "world";

export interface ShopItem {
  id: string;
  name: string;
  /** Coins; 0 = free from the start. */
  price: number;
}

export interface HeroDef extends ShopItem {
  /** Model in the site's library (Character Pack Adventures — every hero shares the knight's rig and moves). */
  key: string;
  /** Spare weapons in the model to hide. */
  hide: string[];
  /** The off-hand piece that blocks (sparks fly from it). */
  shield: string | null;
  perk: string;
  /** Changes to the starting stats. */
  stats: Partial<Stats>;
}

export interface SkinDef extends ShopItem {
  look: SkinLook;
  /** Swatch for the shop card (CSS background). */
  swatch: string;
}

export interface WorldLook {
  /** Background and fog. */
  bg: string;
  /** Hemisphere light: sky and ground colours. */
  sky: string;
  ground: string;
  moon: string;
  /** Multiplies the dungeon pieces' texture. */
  tint: string;
  /** Torch flame, flame core and the light it throws. */
  torch: string;
  core: string;
  /** Bone tint for every skeleton (null = natural bone) and the king's own tint and eyes. */
  bones: string | null;
  king: string;
  kingEyes: string;
}

export interface WorldDef extends ShopItem {
  boss: string;
  blurb: string;
  /** Extra difficulty steps added to every room's depth. */
  tier: number;
  /** Coins saved at the end of a run are multiplied by this. */
  coinMult: number;
  bossHp: number;
  bossDamage: number;
  /** Every n-th skeleton of a wave becomes a rogue / every n-th mage an archer (0 = never). */
  rogues: number;
  archers: number;
  /** Extra skeleton added to the last wave of every room from room 3. */
  extra: "rogue" | "archer" | "warrior" | null;
  look: WorldLook;
}

export const HEROES: readonly HeroDef[] = [
  {
    id: "knight",
    name: "Knight",
    price: 0,
    key: "character-pack-adventures/knight",
    hide: ["1H_Sword_Offhand", "2H_Sword", "Rectangle_Shield", "Round_Shield", "Spike_Shield"],
    shield: "Badge_Shield",
    perk: "Balanced · best parry",
    stats: { parryWindow: 0.24 },
  },
  {
    id: "barbarian",
    name: "Barbarian",
    price: 500,
    key: "character-pack-adventures/barbarian",
    hide: ["1H_Axe_Offhand", "2H_Axe", "Mug"],
    shield: "Barbarian_Round_Shield",
    perk: "+40 health · heavy axe",
    stats: { maxHp: 140, damage: 24, moveSpeed: 6.0, attackSpeed: 0.92 },
  },
  {
    id: "rogue",
    name: "Rogue",
    price: 1000,
    key: "character-pack-adventures/rogue",
    hide: ["1H_Crossbow", "2H_Crossbow", "Throwable"],
    shield: "Knife_Offhand",
    perk: "Fast attacks · quick rolls",
    stats: { maxHp: 85, damage: 18, moveSpeed: 7.2, attackSpeed: 1.18, rollCooldown: 0.5 },
  },
  {
    id: "mage",
    name: "Mage",
    price: 1800,
    key: "character-pack-adventures/mage",
    hide: ["Spellbook_open", "2H_Staff"],
    shield: "Spellbook",
    perk: "Spin charges 2× · bigger spin",
    stats: { maxHp: 90, chargeGain: 0.1, spinRadius: 4.5, spinDamage: 1.8 },
  },
  {
    id: "shadow",
    name: "Hooded Rogue",
    price: 3000,
    key: "character-pack-adventures/rogue-hooded",
    hide: ["1H_Crossbow", "2H_Crossbow", "Throwable"],
    shield: "Knife_Offhand",
    perk: "20% critical hits · +30% coins",
    stats: { maxHp: 95, crit: 0.2, coinMult: 1.3, moveSpeed: 6.9, rollCooldown: 0.6 },
  },
];

export const SKINS: readonly SkinDef[] = [
  { id: "classic", name: "Classic", price: 0, look: "classic", swatch: "linear-gradient(135deg, #cbd5e1, #64748b 55%, #b91c1c)" },
  { id: "shadow", name: "Shadow", price: 300, look: "shadow", swatch: "radial-gradient(circle at 35% 30%, #4c1d95, #0b0614 70%)" },
  { id: "frost", name: "Frost", price: 500, look: "frost", swatch: "linear-gradient(135deg, #ffffff, #bae6fd 45%, #38bdf8)" },
  { id: "toxic", name: "Toxic", price: 700, look: "toxic", swatch: "linear-gradient(135deg, #052e16, #4ade80 60%, #bef264)" },
  { id: "neon", name: "Neon", price: 900, look: "neon", swatch: "linear-gradient(135deg, #22d3ee, #0b0b1a 50%, #e879f9)" },
  { id: "lava", name: "Lava", price: 1200, look: "lava", swatch: "radial-gradient(circle at 40% 40%, #fdba74, #ea580c 35%, #1c0a05 75%)" },
  { id: "chrome", name: "Chrome", price: 1600, look: "chrome", swatch: "linear-gradient(135deg, #f8fafc, #94a3b8 45%, #e2e8f0 70%, #64748b)" },
  { id: "gold", name: "Gold", price: 2200, look: "gold", swatch: "linear-gradient(135deg, #fef08a, #f59e0b 55%, #92400e)" },
  { id: "galaxy", name: "Galaxy", price: 3000, look: "galaxy", swatch: "radial-gradient(circle at 30% 30%, #a78bfa, #3b0764 45%, #020617 80%)" },
  { id: "rainbow", name: "Rainbow", price: 4000, look: "rainbow", swatch: "linear-gradient(135deg, #f43f5e, #f59e0b, #84cc16, #06b6d4, #8b5cf6)" },
];

export const WORLDS: readonly WorldDef[] = [
  {
    id: "crypt",
    name: "The Crypt",
    price: 0,
    boss: "The Bone King",
    blurb: "Torch-lit halls full of restless bones",
    tier: 0,
    coinMult: 1,
    bossHp: 1,
    bossDamage: 1,
    rogues: 0,
    archers: 0,
    extra: null,
    look: { bg: "#07050b", sky: "#7d8fe0", ground: "#2a1c17", moon: "#9fb2ff", tint: "#ffffff", torch: "#ff8a3d", core: "#ffd38a", bones: null, king: "#ebebeb", kingEyes: "#ff2346" },
  },
  {
    id: "frozen",
    name: "Frozen Crypt",
    price: 800,
    boss: "The Frost King",
    blurb: "Ice-cold tombs · fast skeleton rogues",
    tier: 1,
    coinMult: 1.25,
    bossHp: 1.15,
    bossDamage: 1.1,
    rogues: 3,
    archers: 0,
    extra: null,
    look: { bg: "#050a16", sky: "#a8c8ff", ground: "#1c2638", moon: "#cfe0ff", tint: "#c9dcff", torch: "#5fb8ff", core: "#d6f0ff", bones: "#cfe6ff", king: "#8ec5ff", kingEyes: "#7df9ff" },
  },
  {
    id: "poison",
    name: "Poison Catacombs",
    price: 1600,
    boss: "The Plague King",
    blurb: "Toxic tunnels · archers in the dark",
    tier: 2,
    coinMult: 1.5,
    bossHp: 1.3,
    bossDamage: 1.2,
    rogues: 3,
    archers: 2,
    extra: "rogue",
    look: { bg: "#040b06", sky: "#8fe3a0", ground: "#14261a", moon: "#b5ffc4", tint: "#c3e6b0", torch: "#6dff4a", core: "#e0ffc0", bones: "#d2f5bf", king: "#8fdc7a", kingEyes: "#b6ff3d" },
  },
  {
    id: "lava",
    name: "Lava Depths",
    price: 2600,
    boss: "The Ember King",
    blurb: "Burning deep halls · double the danger",
    tier: 3,
    coinMult: 1.75,
    bossHp: 1.45,
    bossDamage: 1.3,
    rogues: 2,
    archers: 2,
    extra: "archer",
    look: { bg: "#120403", sky: "#ff9a6b", ground: "#2e0d06", moon: "#ffb38a", tint: "#ffc0a0", torch: "#ff4a1a", core: "#ffd27a", bones: "#ffd0b8", king: "#ff8a5c", kingEyes: "#ffcc00" },
  },
  {
    id: "vault",
    name: "Gold Vault",
    price: 4000,
    boss: "The Gold King",
    blurb: "The king's treasure · the toughest bones · 2× coins",
    tier: 4,
    coinMult: 2,
    bossHp: 1.6,
    bossDamage: 1.4,
    rogues: 2,
    archers: 1,
    extra: "warrior",
    look: { bg: "#0d0903", sky: "#ffe0a0", ground: "#2a1d08", moon: "#ffe6b0", tint: "#ffe2a8", torch: "#ffc43d", core: "#fff1c0", bones: "#ffe3a0", king: "#ffc94d", kingEyes: "#ffffff" },
  },
];

export const ITEMS: Record<ShopKind, readonly ShopItem[]> = { hero: HEROES, skin: SKINS, world: WORLDS };

export const findItem = <T extends ShopItem>(list: readonly T[], id: string): T => list.find((i) => i.id === id) ?? list[0];

/** Rooms in every world (the last one is the king's throne room). */
export const ROOMS_PER_WORLD = 10;

/** Coins saved after a stage: what was picked up, 10 per star and 150 for beating the king — times the world's multiplier. */
export const stageReward = (coins: number, stars: number, king: boolean, world: WorldDef) => Math.round((coins + stars * 10 + (king ? 150 : 0)) * world.coinMult);
