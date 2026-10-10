/** Powers offered after every cleared room (pick one of three). Kept free of three.js so the UI can import it. */

export interface Stats {
  maxHp: number;
  damage: number;
  /** Attack animation speed multiplier. */
  attackSpeed: number;
  moveSpeed: number;
  rollDistance: number;
  rollCooldown: number;
  /** Share of damage dealt returned as health. */
  lifesteal: number;
  spinRadius: number;
  spinDamage: number;
  /** Spin charge gained per hit. */
  chargeGain: number;
  /** Share of damage a block stops. */
  blockReduce: number;
  parryWindow: number;
  parryDamage: number;
  finisherMult: number;
  finisherWave: boolean;
  maxPotions: number;
  potionHeal: number;
  coinMult: number;
  crit: number;
}

export const BASE_STATS: Stats = {
  maxHp: 100,
  damage: 20,
  attackSpeed: 1,
  moveSpeed: 6.4,
  rollDistance: 5.2,
  rollCooldown: 0.75,
  lifesteal: 0,
  spinRadius: 3.6,
  spinDamage: 1.5,
  chargeGain: 0.055,
  blockReduce: 0.75,
  parryWindow: 0.2,
  parryDamage: 0,
  finisherMult: 1.6,
  finisherWave: false,
  maxPotions: 3,
  potionHeal: 0.4,
  coinMult: 1,
  crit: 0,
};

export type PowerIcon = "sword" | "zap" | "heart" | "wind" | "droplet" | "tornado" | "flame" | "shield" | "swords" | "skull" | "flask" | "coins" | "footprints" | "sparkles";

export interface Power {
  id: string;
  name: string;
  /** What one pick does. */
  desc: string;
  icon: PowerIcon;
  max: number;
  /** Changes the stats; `heal` restores health on pick. */
  apply(s: Stats): { heal?: number; potions?: number } | void;
}

export const POWERS: Power[] = [
  { id: "edge", name: "Keen Edge", desc: "+20% sword damage.", icon: "sword", max: 5, apply: (s) => void (s.damage *= 1.2) },
  { id: "haste", name: "Swift Strikes", desc: "Attack 18% faster.", icon: "zap", max: 3, apply: (s) => void (s.attackSpeed *= 1.18) },
  {
    id: "vigor",
    name: "Vitality",
    desc: "+25 max health and heal 30.",
    icon: "heart",
    max: 4,
    apply: (s) => {
      s.maxHp += 25;
      return { heal: 30 };
    },
  },
  {
    id: "step",
    name: "Shadow Step",
    desc: "Roll 25% further and recover 35% sooner.",
    icon: "wind",
    max: 2,
    apply: (s) => {
      s.rollDistance *= 1.25;
      s.rollCooldown *= 0.65;
    },
  },
  { id: "leech", name: "Vampiric Blade", desc: "Heal for 3% of the damage you deal.", icon: "droplet", max: 3, apply: (s) => void (s.lifesteal += 0.03) },
  {
    id: "whirl",
    name: "Whirlwind",
    desc: "Spin attack hits 50% harder and 25% wider.",
    icon: "tornado",
    max: 3,
    apply: (s) => {
      s.spinDamage *= 1.5;
      s.spinRadius *= 1.25;
    },
  },
  { id: "focus", name: "Battle Focus", desc: "Spin attack charges 45% faster.", icon: "flame", max: 2, apply: (s) => void (s.chargeGain *= 1.45) },
  {
    id: "bulwark",
    name: "Iron Bulwark",
    desc: "Blocks stop 92% of damage and the parry window is 60% longer.",
    icon: "shield",
    max: 1,
    apply: (s) => {
      s.blockReduce = 0.92;
      s.parryWindow *= 1.6;
    },
  },
  { id: "riposte", name: "Riposte", desc: "Parries strike back for 3× sword damage.", icon: "swords", max: 2, apply: (s) => void (s.parryDamage += 3) },
  {
    id: "execute",
    name: "Executioner",
    desc: "Combo finisher hits 50% harder and sends out a shockwave.",
    icon: "skull",
    max: 2,
    apply: (s) => {
      s.finisherMult *= 1.5;
      s.finisherWave = true;
    },
  },
  {
    id: "flask",
    name: "Deep Pockets",
    desc: "+1 potion slot, a free potion, and potions heal more.",
    icon: "flask",
    max: 3,
    apply: (s) => {
      s.maxPotions += 1;
      s.potionHeal += 0.1;
      return { potions: 1 };
    },
  },
  { id: "greed", name: "Greed", desc: "+60% coins from skeletons, chests and crates.", icon: "coins", max: 2, apply: (s) => void (s.coinMult *= 1.6) },
  { id: "fleet", name: "Fleet Foot", desc: "Move 12% faster.", icon: "footprints", max: 2, apply: (s) => void (s.moveSpeed *= 1.12) },
  { id: "luck", name: "Lucky Strike", desc: "+15% chance to land a double-damage critical hit.", icon: "sparkles", max: 3, apply: (s) => void (s.crit += 0.15) },
];

/** Three different powers that aren't maxed out yet. */
export function rollPowers(levels: Record<string, number>, count = 3): Power[] {
  const open = POWERS.filter((p) => (levels[p.id] ?? 0) < p.max);
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open.slice(0, count);
}

/** Potions bought between rooms get dearer with every purchase in a run. */
export const POTION_PRICE = 30;
export const POTION_PRICE_STEP = 15;
