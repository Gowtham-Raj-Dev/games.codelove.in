import { CANYON_PATH, REGIONS, TEETH_PATH, type LookId } from "./data";

/**
 * Sky Courier's career: forty missions, eight in each of the five regions. Plain data (no three.js).
 *
 * Five kinds of job:
 *   delivery  one parcel from the first stop to the second, against the clock
 *   round     a postal round: a parcel to every stop in order
 *   trial     fly through every ring of a course
 *   collect   pick up the lost mail bags floating in the sky, in any order
 *   fragile   a delicate parcel: the stars come from how whole it arrives, not from the clock
 */

export type MissionKind = "delivery" | "round" | "trial" | "collect" | "fragile";

export interface MissionMods {
  /** Balloons and bird flocks in the air (default: the region's). */
  balloons?: number;
  flocks?: number;
  /** Multiplies the region's steady wind and its gusts. */
  wind?: number;
  gusts?: number;
  rain?: number;
}

type P3 = [number, number, number];

export interface MissionDef {
  /** 0..39 over the whole career. */
  id: number;
  region: number;
  /** 0..7 within its region. */
  slot: number;
  name: string;
  kind: MissionKind;
  brief: string;
  /** delivery / round / fragile: island ids — load at the first, deliver to each of the others in order. */
  stops?: number[];
  /** trial: the points the ring course runs through (a loop when `closed`). */
  course?: { points: P3[]; spacing: number; closed?: boolean };
  /** collect: where the mail bags float. */
  bags?: P3[];
  sky: LookId;
  /** Seconds for 3 stars, for 2 stars, and the limit (the mission fails after it). */
  times: [number, number, number];
  /** Coins for a first 3-star finish. */
  pay: number;
  mods: MissionMods;
}

export const MISSIONS_PER_REGION = 8;
/** Fragile cargo: parcel condition needed for 3 and for 2 stars. */
export const FRAGILE_STARS: [number, number] = [0.85, 0.6];

const along = (path: [number, number][], ys: number[]): P3[] => path.map(([x, z], i) => [x, ys[i % ys.length], z]);
const mid = (path: [number, number][], ys: number[]): P3[] => path.slice(1).map(([x, z], i) => [(x + path[i][0]) / 2, ys[i % ys.length], (z + path[i][1]) / 2]);

type Draft = Omit<MissionDef, "id" | "region" | "slot" | "times" | "mods"> & { mods?: MissionMods };

const CAREER: Draft[][] = [
  // --- Meadow Isles ---------------------------------------------------------------------------------
  [
    { name: "First Post", kind: "delivery", brief: "Load a parcel at Courier Central and fly it to Millbrook.", stops: [0, 1], sky: "morning", pay: 60, mods: { balloons: 0, flocks: 0 } },
    {
      name: "Ring School",
      kind: "trial",
      brief: "Thread the practice rings east of the post office.",
      course: {
        spacing: 82,
        points: [
          [90, 138, 120],
          [230, 132, 80],
          [360, 128, -10],
          [400, 140, -140],
          [330, 160, -330],
        ],
      },
      sky: "morning",
      pay: 70,
      mods: { balloons: 0, flocks: 0 },
    },
    { name: "Market Day", kind: "round", brief: "Two parcels: Fountain Square, then Orchard Hollow.", stops: [0, 2, 3], sky: "morning", pay: 85, mods: { balloons: 2, flocks: 0 } },
    {
      name: "Lost Mail",
      kind: "collect",
      brief: "A sack split open over the western isles. Gather the six mail bags.",
      bags: [
        [-120, 130, 60],
        [-240, 120, 110],
        [-330, 150, -40],
        [-300, 165, -200],
        [-150, 175, -260],
        [-40, 150, -150],
      ],
      sky: "noon",
      pay: 90,
      mods: { balloons: 2 },
    },
    { name: "Hill Climb", kind: "delivery", brief: "Orchard Hollow to Lantern Rock: far, and all uphill. Use the rings and updrafts.", stops: [3, 4], sky: "noon", pay: 100 },
    { name: "Handle With Care", kind: "fragile", brief: "A crate of eggs for Fountain Square. Bumps and boost crack them: fly smoothly.", stops: [1, 2], sky: "noon", pay: 110 },
    {
      name: "Meadow Loop",
      kind: "trial",
      brief: "A full lap of the home isles. Gentle turns, one long dive.",
      course: {
        spacing: 118,
        closed: true,
        points: [
          [0, 165, -100],
          [150, 150, -150],
          [360, 152, -130],
          [450, 128, 90],
          [440, 112, 330],
          [250, 104, 440],
          [0, 122, 340],
          [-200, 112, 310],
          [-430, 116, 40],
          [-340, 150, -160],
          [-150, 172, -240],
        ],
      },
      sky: "afternoon",
      pay: 120,
    },
    { name: "The Morning Round", kind: "round", brief: "Every island of the Meadow Isles on one tank of patience.", stops: [0, 1, 4, 2, 5, 3], sky: "afternoon", pay: 150 },
  ],
  // --- Lantern Reach --------------------------------------------------------------------------------
  [
    { name: "Trade Wind", kind: "delivery", brief: "Bellhaven to Candlewick across the evening wind. Aim upwind of the beam.", stops: [0, 5], sky: "afternoon", pay: 130, mods: { balloons: 6, flocks: 1 } },
    {
      name: "Balloon Alley",
      kind: "trial",
      brief: "A slalom through the fair's balloon traffic.",
      course: {
        spacing: 76,
        points: [
          [80, 150, -40],
          [190, 136, -130],
          [310, 150, -50],
          [430, 132, -20],
          [540, 146, 80],
          [600, 160, 200],
        ],
      },
      sky: "afternoon",
      pay: 140,
      mods: { balloons: 14, flocks: 1 },
    },
    {
      name: "Fair Day",
      kind: "collect",
      brief: "Eight bags of fair-day post are adrift over the southern isles.",
      bags: [
        [-100, 140, 160],
        [-250, 125, 220],
        [-330, 120, 420],
        [-180, 135, 520],
        [-20, 150, 420],
        [40, 140, 300],
        [230, 135, 380],
        [300, 150, 560],
      ],
      sky: "afternoon",
      pay: 160,
    },
    { name: "Glass Lanterns", kind: "fragile", brief: "Lantern glass from Amber Steps to Watermill Ward, through the birds and balloons.", stops: [4, 1], sky: "sunset", pay: 180, mods: { balloons: 12, flocks: 3 } },
    { name: "Three Bells", kind: "round", brief: "Gull Roost, Farthing Light, Watermill Ward: three bells before dark.", stops: [0, 2, 6, 1], sky: "afternoon", pay: 190 },
    {
      name: "Lantern Slalom",
      kind: "trial",
      brief: "Weave the eastern towns. Tight, low and fast.",
      course: {
        spacing: 96,
        closed: true,
        points: [
          [200, 150, 60],
          [330, 135, -60],
          [520, 150, -60],
          [660, 140, 120],
          [760, 150, 300],
          [640, 172, 500],
          [440, 132, 520],
          [290, 128, 400],
          [240, 140, 220],
        ],
      },
      sky: "sunset",
      pay: 200,
    },
    { name: "Sunset Express", kind: "delivery", brief: "The lighthouse's mail must reach Pennant Point before the sun is gone.", stops: [6, 3], sky: "sunset", pay: 210, mods: { wind: 1.3 } },
    { name: "The Evening Round", kind: "round", brief: "Six towns as the lanterns are lit.", stops: [0, 4, 3, 5, 1, 6, 2], sky: "sunset", pay: 260 },
  ],
  // --- Windscar Canyons -----------------------------------------------------------------------------
  [
    { name: "Through the Gap", kind: "delivery", brief: "Echo Ledge lies beyond the great canyon. Follow it through.", stops: [0, 4], sky: "noon", pay: 200, mods: { gusts: 0 } },
    {
      name: "Needle Run",
      kind: "trial",
      brief: "Rings down the middle of the canyon, wall to wall.",
      course: { spacing: 84, points: along(CANYON_PATH, [140, 120, 135, 110, 125, 140, 115, 130, 140]) },
      sky: "noon",
      pay: 220,
      mods: { gusts: 0 },
    },
    { name: "Gust Front", kind: "round", brief: "Dusthollow to Farwatch to Red Mesa. The gusts come from the side: lean into them.", stops: [1, 5, 3], sky: "afternoon", pay: 240 },
    {
      name: "Canyon Sweep",
      kind: "collect",
      brief: "A gust emptied a mail cart into the canyon. Eight bags, high and low.",
      bags: mid(CANYON_PATH, [120, 150, 100, 170, 110, 180, 130, 150]),
      sky: "afternoon",
      pay: 250,
    },
    { name: "Thin Air", kind: "fragile", brief: "Clockwork for Dusthollow. Cross the canyon without letting a gust throw you on the rocks.", stops: [3, 1], sky: "afternoon", pay: 270 },
    {
      name: "Echo Dash",
      kind: "trial",
      brief: "East through the canyon, home along the southern rim.",
      course: {
        spacing: 104,
        closed: true,
        points: [
          ...along(CANYON_PATH, [130, 115, 130, 110, 125, 135, 115, 130, 145]),
          [600, 160, 230],
          [420, 205, 330],
          [150, 170, 400],
          [-60, 150, 300],
          [-330, 150, 230],
          [-470, 140, 150],
        ],
      },
      sky: "dusk",
      pay: 290,
    },
    { name: "Dust Devil", kind: "delivery", brief: "Farwatch to Needle's Eye, straight across the canyon and into the wind.", stops: [5, 2], sky: "dusk", pay: 300, mods: { wind: 1.5 } },
    { name: "The Canyon Round", kind: "round", brief: "All six stations of the Windscar in one flight.", stops: [0, 1, 5, 4, 3, 2], sky: "dusk", pay: 360 },
  ],
  // --- Storm Peaks ----------------------------------------------------------------------------------
  [
    { name: "Storm Warning", kind: "delivery", brief: "A thunderhead sits between Ironcloud and High Watch. Go round it, or hold on tight.", stops: [0, 2], sky: "overcast", pay: 290 },
    {
      name: "Jet Stream",
      kind: "trial",
      brief: "Ride the ribbon of fast air east, then dive for Frostfall.",
      course: {
        spacing: 96,
        points: [
          [-470, 236, -150],
          [-250, 240, -160],
          [0, 246, -160],
          [250, 240, -160],
          [420, 226, -110],
          [530, 205, 40],
          [540, 190, 210],
        ],
      },
      sky: "overcast",
      pay: 310,
    },
    { name: "Lightning Post", kind: "round", brief: "Gale Shelf, the Aerie, Castle Crag. The second leg cuts through a storm.", stops: [0, 5, 6, 1], sky: "storm", pay: 340 },
    {
      name: "Hail Mary",
      kind: "collect",
      brief: "Seven mail bags blown to the storm's edge. Snatch them before they are gone.",
      bags: [
        [-60, 225, 200],
        [60, 215, 300],
        [-250, 230, 330],
        [-280, 220, 470],
        [120, 200, 460],
        [200, 192, 430],
        [330, 182, 600],
      ],
      sky: "storm",
      pay: 350,
    },
    { name: "Barometer", kind: "fragile", brief: "A glass barometer for Gale Shelf. Storm air shakes it apart: find the calm way round.", stops: [2, 5], sky: "overcast", pay: 380 },
    {
      name: "Thunder Road",
      kind: "trial",
      brief: "A lap through the southern thunderheads.",
      course: {
        spacing: 96,
        closed: true,
        points: [
          [-80, 222, 150],
          [-190, 226, 320],
          [-240, 228, 470],
          [-200, 224, 640],
          [20, 232, 770],
          [200, 216, 640],
          [300, 198, 470],
          [240, 196, 300],
          [100, 210, 180],
        ],
      },
      sky: "storm",
      pay: 400,
    },
    { name: "Eye of the Storm", kind: "delivery", brief: "Frostfall to the Aerie, the highest station there is, with a storm on its doorstep.", stops: [4, 6], sky: "storm", pay: 420 },
    { name: "The Storm Round", kind: "round", brief: "Six mountain stations and four thunderheads.", stops: [0, 3, 2, 1, 6, 5, 4], sky: "storm", pay: 500 },
  ],
  // --- Starfall Deep --------------------------------------------------------------------------------
  [
    { name: "Night Mail", kind: "delivery", brief: "Moonharbour to Last Light, by starlight. Follow the beacons.", stops: [0, 1], sky: "night", pay: 400, mods: { gusts: 0, balloons: 6 } },
    {
      name: "Star Rings",
      kind: "trial",
      brief: "Glowing rings over the eastern isles.",
      course: {
        spacing: 90,
        points: [
          [80, 172, -80],
          [240, 152, -150],
          [400, 142, -80],
          [500, 160, 60],
          [520, 182, 240],
          [380, 202, 300],
        ],
      },
      sky: "night",
      pay: 420,
      mods: { gusts: 0 },
    },
    {
      name: "Lamplighter",
      kind: "collect",
      brief: "Seven lantern-lit mail bags, two of them down in the Teeth.",
      bags: [
        [-60, 162, -150],
        [-262, 150, -210],
        [-255, 142, -60],
        [-120, 166, -380],
        [0, 172, -420],
        [180, 162, -330],
        [150, 152, -180],
      ],
      sky: "night",
      pay: 440,
    },
    { name: "Moon Glass", kind: "fragile", brief: "A telescope mirror from Comet's Rest to Lantern Court, past the Teeth in a gusty dark.", stops: [3, 5], sky: "night", pay: 480 },
    { name: "Midnight Round", kind: "round", brief: "Silver Stair, Polestar, Last Light, Lantern Court.", stops: [0, 2, 6, 1, 5], sky: "night", pay: 500 },
    {
      name: "Comet Chase",
      kind: "trial",
      brief: "Up the Teeth, round Nightbloom and home: the longest course in the sky.",
      course: {
        spacing: 100,
        closed: true,
        points: [
          ...along(TEETH_PATH, [152, 148, 156, 150, 158]),
          [-120, 176, -520],
          [60, 190, -690],
          [260, 172, -570],
          [430, 152, -380],
          [380, 152, -150],
          [220, 166, 20],
          [60, 176, 140],
          [-100, 172, 200],
        ],
      },
      sky: "dawn",
      pay: 540,
    },
    { name: "Last Light Express", kind: "delivery", brief: "Comet's Rest to the lighthouse, clear across the Deep, before the lamp goes out.", stops: [3, 1], sky: "night", pay: 560, mods: { wind: 1.3 } },
    { name: "The Grand Tour", kind: "round", brief: "Every island of Starfall Deep. The last round of the career.", stops: [0, 4, 5, 1, 6, 2, 3], sky: "dawn", pay: 700 },
  ],
];

/**
 * Seconds for 3 stars, 2 stars and the limit, per mission (measured with the game's own autopilot: see
 * scripts/check-sky-courier.mjs, CALIBRATE=1). Missing entries fall back to an estimate from the route's length.
 */
const TIMES: Record<number, [number, number, number]> = {};

function routeLength(d: Draft, region: number) {
  const isl = REGIONS[region].islands;
  let len = 0;
  let legs = 1;
  if (d.stops) {
    for (let i = 1; i < d.stops.length; i++) len += Math.hypot(isl[d.stops[i]].x - isl[d.stops[i - 1]].x, isl[d.stops[i]].z - isl[d.stops[i - 1]].z);
    len += 100;
    legs = d.stops.length;
  } else if (d.course) {
    const p = d.course.points;
    for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][2] - p[i - 1][2]);
    if (d.course.closed) len += Math.hypot(p[0][0] - p[p.length - 1][0], p[0][2] - p[p.length - 1][2]);
    len += 110;
  } else if (d.bags) {
    // The bags in a greedy chain from the post office.
    const left = d.bags.map((b) => [b[0], b[2]]);
    let x = isl[0].x;
    let z = isl[0].z;
    while (left.length) {
      let best = 0;
      for (let i = 1; i < left.length; i++) if (Math.hypot(left[i][0] - x, left[i][1] - z) < Math.hypot(left[best][0] - x, left[best][1] - z)) best = i;
      len += Math.hypot(left[best][0] - x, left[best][1] - z);
      [x, z] = left[best];
      left.splice(best, 1);
    }
    legs = d.bags.length;
  }
  return { len, legs };
}

function estimate(d: Draft, region: number): [number, number, number] {
  const { len, legs } = routeLength(d, region);
  const par = len / 26 + legs * 3 + 6;
  return [Math.round(par), Math.round(par * 1.18), Math.round(par * 1.6 + 12)];
}

export const MISSIONS: MissionDef[] = CAREER.flatMap((list, region) =>
  list.map((d, slot) => {
    const id = region * MISSIONS_PER_REGION + slot;
    return { ...d, id, region, slot, times: TIMES[id] ?? estimate(d, region), mods: d.mods ?? {} };
  }),
);

export const TOTAL_STARS = MISSIONS.length * 3;

/** Stars for a finished mission: from the clock, or — fragile cargo — from the parcel's condition. */
export function starsFor(def: MissionDef, time: number, cargo: number) {
  if (def.kind === "fragile") return cargo >= FRAGILE_STARS[0] ? 3 : cargo >= FRAGILE_STARS[1] ? 2 : 1;
  return time <= def.times[0] ? 3 : time <= def.times[1] ? 2 : 1;
}

/** Coins for a finish: 60 / 80 / 100% of the mission's pay by stars; a repeat that earns no new star pays 40% of that. */
export function missionReward(def: MissionDef, stars: number, before: number) {
  if (stars <= 0) return 0;
  const base = def.pay * [0.6, 0.8, 1][Math.min(3, stars) - 1];
  return Math.round(stars > before ? base : base * 0.4);
}

/** Missions open one after another over the whole career; a region opens with its first mission. */
export const missionOpen = (stars: readonly number[], id: number) => id <= 0 || (stars[id - 1] ?? 0) > 0;
export const regionOpen = (stars: readonly number[], region: number) => missionOpen(stars, region * MISSIONS_PER_REGION);

/** The first mission not yet cleared (the last one when all are). */
export function nextMission(stars: readonly number[]) {
  const i = MISSIONS.findIndex((m) => (stars[m.id] ?? 0) === 0);
  return i < 0 ? MISSIONS.length - 1 : i;
}

export const KIND_LABEL: Record<MissionKind, string> = { delivery: "Delivery", round: "Postal round", trial: "Ring trial", collect: "Mail hunt", fragile: "Fragile cargo" };

export const formatTime = (s: number) => {
  const t = Math.max(0, s);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
};
