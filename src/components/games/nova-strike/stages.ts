import type { SkyColors } from "./fx";
import { M } from "./manifest";
import { rng, type RailShape, type Rng } from "./rail";

/**
 * The three stages: rail shape, sky, and a scripted list of events along the rail (`at` is the
 * rail distance where the event happens). Layouts come from a seeded random generator, so every
 * run of a stage plays the same and can be learned.
 */

export type ShipType = "speeder" | "dart" | "raider" | "gunship" | "cargo" | "miner";
export type Pattern = "swoop" | "line" | "vee" | "hover" | "chase" | "dive" | "orbit";
export type Drop = "ring" | "bomb" | "laser";

export type StageEvent =
  | { at: number; kind: "wave"; type: ShipType; pattern: Pattern; count: number; x: number; y: number; side: 1 | -1 }
  | { at: number; kind: "cargo"; type: "cargo" | "miner"; x: number; y: number; side: 1 | -1; drop: Drop }
  | { at: number; kind: "rocks"; count: number; len: number; crystals: number; tight?: boolean }
  | { at: number; kind: "meteors"; count: number; side: 1 | -1 }
  | { at: number; kind: "ring"; x: number; y: number }
  | { at: number; kind: "tower"; x: number; y: number; turrets: number }
  | { at: number; kind: "satellite"; model: string; x: number; y: number; size: number }
  | { at: number; kind: "mines"; count: number; x: number; y: number }
  | { at: number; kind: "gate"; mode: "rows" | "cols" | "cross" | "blink"; seed: number }
  | { at: number; kind: "girder"; y: number; x: number; vertical: boolean }
  | { at: number; kind: "wallTurret"; side: 1 | -1; y: number }
  | { at: number; kind: "checkpoint" }
  | { at: number; kind: "message"; text: string };

export type BossKind = "drill" | "warden" | "core";

export interface StageDef {
  id: number;
  name: string;
  /** Short name for HUD chips (display font is wide). */
  short: string;
  brief: string;
  rail: RailShape;
  length: number;
  checkpoint: number;
  sky: SkyColors;
  fog: string;
  sun: string;
  ambient: string;
  scenery: "belt" | "graveyard" | "trench";
  boss: BossKind;
  bossName: string;
  /** Ships, turrets and other targets the medals are counted against. */
  par: number;
  events: StageEvent[];
}

/** Box the ship can fly in (rail-local metres). */
export const BOX = { x: 8, y: 4.8 };
export const TRENCH = { halfWidth: 12.5, floor: -7.5, wallTop: 9 };

function countPar(events: StageEvent[]) {
  let n = 0;
  for (const e of events) {
    if (e.kind === "wave") n += e.count;
    else if (e.kind === "cargo") n += 1;
    else if (e.kind === "tower") n += e.turrets;
    else if (e.kind === "mines") n += e.count;
    else if (e.kind === "wallTurret") n += 1;
    else if (e.kind === "satellite") n += 1;
    else if (e.kind === "rocks") n += e.crystals;
  }
  return n;
}

const SATELLITES = [M.mgs, M.wfpc, M.mro, M.rover, M.tdrs, M.grace, M.seastar, M.jupiterC];

function belt(r: Rng): StageEvent[] {
  const ev: StageEvent[] = [];
  const side = () => r.sign() as 1 | -1;
  ev.push({ at: 60, kind: "message", text: "Asteroid Belt" });
  ev.push({ at: 230, kind: "rocks", count: 7, len: 160, crystals: 1 });
  ev.push({ at: 420, kind: "wave", type: "speeder", pattern: "swoop", count: 5, x: 0, y: 1.5, side: 1 });
  ev.push({ at: 560, kind: "ring", x: -3, y: 1 });
  ev.push({ at: 640, kind: "wave", type: "speeder", pattern: "swoop", count: 5, x: 0, y: -1, side: -1 });
  ev.push({ at: 800, kind: "rocks", count: 11, len: 200, crystals: 2 });
  ev.push({ at: 960, kind: "wave", type: "dart", pattern: "vee", count: 5, x: 0, y: 1, side: 1 });
  ev.push({ at: 1120, kind: "cargo", type: "cargo", x: 4, y: 2, side: side(), drop: "laser" });
  ev.push({ at: 1260, kind: "meteors", count: 6, side: -1 });
  ev.push({ at: 1420, kind: "wave", type: "raider", pattern: "hover", count: 3, x: 0, y: 1, side: 1 });
  ev.push({ at: 1560, kind: "ring", x: 2.5, y: -1.5 });
  ev.push({ at: 1660, kind: "checkpoint" });
  ev.push({ at: 1760, kind: "rocks", count: 15, len: 240, crystals: 3, tight: true });
  ev.push({ at: 1960, kind: "wave", type: "speeder", pattern: "chase", count: 4, x: 0, y: 2, side: side() });
  ev.push({ at: 2140, kind: "wave", type: "dart", pattern: "swoop", count: 6, x: 0, y: 0, side: 1 });
  ev.push({ at: 2280, kind: "meteors", count: 7, side: 1 });
  ev.push({ at: 2380, kind: "ring", x: 0, y: 2.5 });
  ev.push({ at: 2470, kind: "wave", type: "gunship", pattern: "hover", count: 2, x: 0, y: 0, side: 1 });
  ev.push({ at: 2640, kind: "rocks", count: 13, len: 220, crystals: 2 });
  ev.push({ at: 2780, kind: "cargo", type: "cargo", x: -4, y: -1, side: 1, drop: "bomb" });
  ev.push({ at: 2830, kind: "wave", type: "speeder", pattern: "line", count: 5, x: 0, y: 1, side: 1 });
  ev.push({ at: 3000, kind: "wave", type: "raider", pattern: "swoop", count: 4, x: 0, y: -1, side: -1 });
  ev.push({ at: 3120, kind: "ring", x: -2, y: 0 });
  ev.push({ at: 3220, kind: "rocks", count: 6, len: 120, crystals: 1 });
  return ev;
}

function graveyard(r: Rng): StageEvent[] {
  const ev: StageEvent[] = [];
  const sat = (at: number, x: number, y: number) => ev.push({ at, kind: "satellite", model: r.pick(SATELLITES), x, y, size: r.range(6, 8.5) });
  ev.push({ at: 60, kind: "message", text: "Satellite Graveyard" });
  sat(260, -4, 2);
  ev.push({ at: 360, kind: "tower", x: 9, y: -3, turrets: 2 });
  ev.push({ at: 470, kind: "wave", type: "dart", pattern: "swoop", count: 5, x: 0, y: 1, side: -1 });
  sat(600, 5, -1);
  ev.push({ at: 680, kind: "ring", x: -3, y: 2 });
  ev.push({ at: 760, kind: "mines", count: 6, x: 0, y: 0 });
  ev.push({ at: 900, kind: "tower", x: -9, y: -2.5, turrets: 2 });
  ev.push({ at: 980, kind: "wave", type: "raider", pattern: "hover", count: 3, x: 0, y: 1, side: 1 });
  sat(1100, -2, -2);
  ev.push({ at: 1180, kind: "cargo", type: "cargo", x: -3, y: 2, side: 1, drop: "laser" });
  ev.push({ at: 1300, kind: "wave", type: "speeder", pattern: "dive", count: 4, x: 0, y: 0, side: 1 });
  ev.push({ at: 1440, kind: "tower", x: 8.5, y: 3, turrets: 2 });
  ev.push({ at: 1520, kind: "ring", x: 2, y: -2 });
  sat(1600, 4, 3);
  ev.push({ at: 1700, kind: "checkpoint" });
  ev.push({ at: 1800, kind: "mines", count: 8, x: 0, y: 0 });
  ev.push({ at: 1920, kind: "wave", type: "gunship", pattern: "chase", count: 2, x: 0, y: 1, side: -1 });
  sat(2040, -5, 0);
  ev.push({ at: 2120, kind: "tower", x: -9, y: 2.5, turrets: 3 });
  ev.push({ at: 2240, kind: "wave", type: "dart", pattern: "orbit", count: 6, x: 0, y: 0, side: 1 });
  ev.push({ at: 2380, kind: "ring", x: 0, y: -2.5 });
  sat(2460, 3, -2);
  sat(2520, -4, 3);
  ev.push({ at: 2600, kind: "wave", type: "raider", pattern: "swoop", count: 5, x: 0, y: 2, side: 1 });
  ev.push({ at: 2740, kind: "tower", x: 9, y: -2.5, turrets: 2 });
  ev.push({ at: 2800, kind: "cargo", type: "miner", x: 3, y: -2, side: -1, drop: "bomb" });
  ev.push({ at: 2940, kind: "mines", count: 6, x: 0, y: 1 });
  ev.push({ at: 3080, kind: "wave", type: "speeder", pattern: "vee", count: 7, x: 0, y: 0, side: 1 });
  ev.push({ at: 3200, kind: "ring", x: 3, y: 1 });
  sat(3300, 0, -1);
  ev.push({ at: 3400, kind: "wave", type: "gunship", pattern: "hover", count: 2, x: 0, y: 1, side: 1 });
  return ev;
}

function trench(r: Rng): StageEvent[] {
  const ev: StageEvent[] = [];
  const wt = (at: number, side: 1 | -1, y = r.range(-3, 5)) => ev.push({ at, kind: "wallTurret", side, y });
  ev.push({ at: 60, kind: "message", text: "Station Trench" });
  wt(260, 1);
  wt(300, -1);
  ev.push({ at: 380, kind: "wave", type: "speeder", pattern: "line", count: 5, x: 0, y: 1, side: 1 });
  ev.push({ at: 520, kind: "girder", y: 3, x: 0, vertical: false });
  ev.push({ at: 600, kind: "ring", x: 0, y: -3 });
  wt(660, -1);
  wt(700, 1);
  ev.push({ at: 780, kind: "gate", mode: "rows", seed: 1 });
  ev.push({ at: 880, kind: "wave", type: "raider", pattern: "chase", count: 3, x: 0, y: 1, side: 1 });
  ev.push({ at: 1000, kind: "girder", y: 0, x: -5, vertical: true });
  ev.push({ at: 1060, kind: "girder", y: 0, x: 5, vertical: true });
  wt(1120, 1);
  ev.push({ at: 1180, kind: "cargo", type: "miner", x: 0, y: 2, side: 1, drop: "laser" });
  ev.push({ at: 1300, kind: "gate", mode: "cols", seed: 2 });
  ev.push({ at: 1400, kind: "mines", count: 6, x: 0, y: 0 });
  ev.push({ at: 1500, kind: "ring", x: -4, y: 2 });
  wt(1560, -1);
  wt(1600, 1);
  ev.push({ at: 1700, kind: "checkpoint" });
  ev.push({ at: 1780, kind: "wave", type: "dart", pattern: "swoop", count: 6, x: 0, y: 0, side: -1 });
  ev.push({ at: 1900, kind: "girder", y: -2.5, x: 0, vertical: false });
  ev.push({ at: 1960, kind: "girder", y: 3, x: 0, vertical: false });
  ev.push({ at: 2060, kind: "gate", mode: "cross", seed: 3 });
  wt(2140, 1);
  wt(2160, -1);
  ev.push({ at: 2240, kind: "wave", type: "gunship", pattern: "hover", count: 2, x: 0, y: 1, side: 1 });
  ev.push({ at: 2360, kind: "ring", x: 3, y: -2 });
  ev.push({ at: 2440, kind: "gate", mode: "blink", seed: 4 });
  ev.push({ at: 2540, kind: "wave", type: "speeder", pattern: "dive", count: 5, x: 0, y: 0, side: 1 });
  ev.push({ at: 2660, kind: "cargo", type: "cargo", x: -3, y: 1, side: -1, drop: "bomb" });
  wt(2720, -1);
  wt(2760, 1);
  ev.push({ at: 2840, kind: "girder", y: 0, x: 0, vertical: true });
  ev.push({ at: 2920, kind: "gate", mode: "rows", seed: 5 });
  ev.push({ at: 3020, kind: "wave", type: "raider", pattern: "vee", count: 5, x: 0, y: 1, side: 1 });
  ev.push({ at: 3150, kind: "ring", x: 0, y: 0 });
  wt(3220, 1);
  wt(3240, -1);
  ev.push({ at: 3320, kind: "gate", mode: "cross", seed: 6 });
  ev.push({ at: 3420, kind: "wave", type: "gunship", pattern: "chase", count: 2, x: 0, y: 0, side: 1 });
  ev.push({ at: 3560, kind: "ring", x: -2, y: 2 });
  return ev;
}

function make(def: Omit<StageDef, "events" | "par">, build: (r: Rng) => StageEvent[], seed: number): StageDef {
  const events = build(rng(seed)).sort((a, b) => a.at - b.at);
  return { ...def, events, par: countPar(events) };
}

export const STAGES: StageDef[] = [
  make(
    {
      id: 0,
      name: "Asteroid Belt",
      short: "Belt",
      brief: "Tumbling rocks, crystal asteroids and drone swarms guard the way out of the belt. A mining titan waits at the end.",
      rail: {
        x: [
          { amp: 34, len: 1500, phase: 0 },
          { amp: 10, len: 520, phase: 1.3 },
        ],
        y: [
          { amp: 12, len: 1100, phase: 0.6 },
          { amp: 4, len: 380, phase: 2.1 },
        ],
      },
      length: 3400,
      checkpoint: 1660,
      sky: { top: "#05061a", mid: "#120a2e", bottom: "#04030c", nebulaA: "#3b1a6e", nebulaB: "#0e5a7a" },
      fog: "#0d0a24",
      sun: "#ffd9a8",
      ambient: "#6a5acd",
      scenery: "belt",
      boss: "drill",
      bossName: "Titan Drill",
    },
    belt,
    11,
  ),
  make(
    {
      id: 1,
      name: "Satellite Graveyard",
      short: "Graveyard",
      brief: "Dead satellites drift in a minefield. Derelict towers still have working turrets — and something old is waking up.",
      rail: {
        x: [
          { amp: 28, len: 1300, phase: 0.8 },
          { amp: 9, len: 610, phase: 0.2 },
        ],
        y: [
          { amp: 16, len: 1400, phase: 1.9 },
          { amp: 5, len: 460, phase: 0.4 },
        ],
      },
      length: 3600,
      checkpoint: 1700,
      sky: { top: "#020814", mid: "#0b1a2a", bottom: "#02040a", nebulaA: "#0f4c5c", nebulaB: "#5c1a4a" },
      fog: "#06121f",
      sun: "#cfe8ff",
      ambient: "#3a6b8a",
      scenery: "graveyard",
      boss: "warden",
      bossName: "Orbital Warden",
    },
    graveyard,
    23,
  ),
  make(
    {
      id: 2,
      name: "Station Trench",
      short: "Trench",
      brief: "Dive into the station trench. Wall turrets, crossbeams and laser gates — fly through the gaps and destroy the station core.",
      rail: {
        x: [{ amp: 22, len: 1900, phase: 0.3 }],
        y: [{ amp: 5, len: 1500, phase: 1.1 }],
      },
      length: 3700,
      checkpoint: 1700,
      sky: { top: "#0a0412", mid: "#1d0b26", bottom: "#05020a", nebulaA: "#6e1a4a", nebulaB: "#1a3a6e" },
      fog: "#120818",
      sun: "#ffc4e8",
      ambient: "#8a4a8a",
      scenery: "trench",
      boss: "core",
      bossName: "Station Core",
    },
    trench,
    37,
  ),
];

/** Medal for a cleared stage: 3 gold, 2 silver, 1 bronze. */
export function medalFor(stage: StageDef, hits: number) {
  const r = hits / Math.max(1, stage.par);
  return r >= 1 ? 3 : r >= 0.7 ? 2 : 1;
}

export const MEDAL_NAMES = ["None", "Bronze", "Silver", "Gold"];
