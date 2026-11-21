/**
 * Sky Courier — the five regions of the sky: their islands, rock pillars, weather and air currents.
 * Plain data (no three.js) so the UI can draw the maps from the same numbers.
 * Units are metres; y is up; north is −z. The sea of clouds sits at y = 0.
 */

export type IslandKind = "hub" | "windmill" | "market" | "orchard" | "village" | "watermill" | "castle" | "lighthouse";
export type IslandModel = "aero" | "a" | "b" | "c";
/** Sky and light presets (fx.ts). */
export type LookId = "dawn" | "morning" | "noon" | "afternoon" | "sunset" | "dusk" | "overcast" | "storm" | "night";
/** What grows on a region's islands (world.ts). */
export type Flora = "meadow" | "autumn" | "dry" | "pine" | "night";

export interface IslandDef {
  /** Index in its region's list; 0 is the region's post office (hub). */
  id: number;
  name: string;
  x: number;
  z: number;
  /** Height of the grass top. */
  y: number;
  model: IslandModel;
  /** Width of the island (m). */
  size: number;
  yaw: number;
  kind: IslandKind;
}

/** A small rock drifting between the big islands (scenery you can bump into). */
export interface IsletDef {
  x: number;
  z: number;
  y: number;
  size: number;
  model: "a" | "b" | "c" | "d";
  yaw: number;
}

/** A rock pillar standing in the cloud sea: `r` is half its width, `h` the height of its top. */
export interface PeakDef {
  x: number;
  z: number;
  r: number;
  h: number;
  yaw: number;
}

export interface ColumnDef {
  x: number;
  z: number;
  r: number;
}

export interface StormDef {
  x: number;
  z: number;
  y: number;
  r: number;
}

/** A ribbon of fast air from `a` to `b`: flying along it pushes the airship on by `speed` m/s. */
export interface JetDef {
  a: [number, number, number];
  b: [number, number, number];
  r: number;
  speed: number;
}

export interface RegionDef {
  id: number;
  name: string;
  blurb: string;
  /** What is new here, in a few words (shown on the flight board). */
  hazards: string;
  /** Sky for free flight: it drifts from `sky` to `skyTo` over a shift. Missions pick their own. */
  sky: LookId;
  skyTo: LookId;
  /** Steady wind (m/s) along x and z: everything in the air drifts with it. */
  wind: [number, number];
  /** Strength of the gusts (m/s sideways); 0 = none. */
  gusts: number;
  balloons: number;
  flocks: number;
  /** 0..1: rain everywhere (storm cells bring their own). */
  rain: number;
  /** Free flight: tip multiplier and the timer's reference speed (m/s; higher = tighter timers). */
  pay: number;
  pace: number;
  flora: Flora;
  /** Colours the rock and grass are multiplied by, and how frosted the grass is (0..1). */
  tint: { rock: string; grass: string; frost: number };
  /** Colour of the dots on the flight board's map. */
  color: string;
  islands: IslandDef[];
  islets: IsletDef[];
  peaks: PeakDef[];
  /** Warm columns of rising air, and cold ones that push down. */
  updrafts: ColumnDef[];
  downdrafts: ColumnDef[];
  /** Storm cells: turbulence, lightning and dark cloud walls. */
  storms: StormDef[];
  jets: JetDef[];
  /** Chains of boost rings between islands: from island, to island, ring count. */
  ringLines: [number, number, number][];
}

// --- Seeded random (shared with the world builder) ---------------------------------------------------

export type Rng = () => number;
export function rng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Canyons -------------------------------------------------------------------------------------------

type Path = [number, number][];

function distToPath(x: number, z: number, path: Path) {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/**
 * Two rows of rock pillars either side of a winding line: a canyon `gap` metres wide to fly through.
 * Pillars that would stand in the gap (inside a bend) or on an island are left out.
 */
function canyon(path: Path, gap: number, seed: number, heights: [number, number], keepClear: { x: number; z: number; size: number }[]): PeakDef[] {
  const r = rng(seed);
  const out: PeakDef[] = [];
  const step = 74;
  let carry = 20;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    let d = carry;
    for (; d < len; d += step) {
      for (const side of [-1, 1]) {
        const rad = 27 + r() * 13;
        // The pillars are blocky: their corners reach about 1.3 × their half-width.
        const off = gap / 2 + rad * 1.3 + r() * 12;
        const peak: PeakDef = {
          x: Math.round(ax + dx * d - dz * off * side + (r() - 0.5) * 10),
          z: Math.round(az + dz * d + dx * off * side + (r() - 0.5) * 10),
          r: Math.round(rad),
          h: Math.round(heights[0] + r() * (heights[1] - heights[0])),
          yaw: Math.round(r() * 628) / 100,
        };
        if (distToPath(peak.x, peak.z, path) < gap / 2 + peak.r * 1.3) continue;
        if (keepClear.some((k) => Math.hypot(k.x - peak.x, k.z - peak.z) < k.size / 2 + peak.r * 1.4 + 40)) continue;
        if (out.some((o) => Math.hypot(o.x - peak.x, o.z - peak.z) < (o.r + peak.r) * 0.9)) continue;
        out.push(peak);
      }
    }
    carry = d - len;
  }
  return out;
}

// --- Region 1: Meadow Isles ----------------------------------------------------------------------------

const MEADOW_ISLANDS: IslandDef[] = [
  { id: 0, name: "Courier Central", x: 0, z: 0, y: 110, model: "aero", size: 104, yaw: 0.4, kind: "hub" },
  { id: 1, name: "Millbrook", x: -340, z: 160, y: 92, model: "a", size: 84, yaw: 1.1, kind: "windmill" },
  { id: 2, name: "Fountain Square", x: 270, z: -250, y: 124, model: "c", size: 78, yaw: 0.3, kind: "market" },
  { id: 3, name: "Orchard Hollow", x: 300, z: 290, y: 84, model: "a", size: 84, yaw: 2.2, kind: "orchard" },
  { id: 4, name: "Lantern Rock", x: -170, z: -390, y: 146, model: "c", size: 70, yaw: 2.6, kind: "village" },
  { id: 5, name: "Kite Hill", x: 620, z: 60, y: 104, model: "c", size: 80, yaw: 0.9, kind: "watermill" },
];

// --- Region 2: Lantern Reach ---------------------------------------------------------------------------

const LANTERN_ISLANDS: IslandDef[] = [
  { id: 0, name: "Bellhaven Exchange", x: 0, z: 0, y: 120, model: "aero", size: 100, yaw: 1.3, kind: "hub" },
  { id: 1, name: "Watermill Ward", x: 420, z: -180, y: 104, model: "c", size: 84, yaw: 0.9, kind: "watermill" },
  { id: 2, name: "Gull Roost", x: -380, z: -300, y: 136, model: "a", size: 84, yaw: 0.2, kind: "village" },
  { id: 3, name: "Pennant Point", x: 120, z: 520, y: 118, model: "c", size: 74, yaw: 1.2, kind: "castle" },
  { id: 4, name: "Amber Steps", x: -460, z: 300, y: 96, model: "a", size: 80, yaw: 1.7, kind: "market" },
  { id: 5, name: "Candlewick", x: 640, z: 360, y: 150, model: "a", size: 82, yaw: 2.4, kind: "village" },
  { id: 6, name: "Farthing Light", x: -80, z: -640, y: 170, model: "c", size: 72, yaw: 1.9, kind: "lighthouse" },
];

// --- Region 3: Windscar Canyons ------------------------------------------------------------------------

const CANYON_ISLANDS: IslandDef[] = [
  { id: 0, name: "Gatepost", x: -640, z: 20, y: 120, model: "aero", size: 96, yaw: 2.1, kind: "hub" },
  { id: 1, name: "Dusthollow", x: -220, z: 360, y: 100, model: "a", size: 80, yaw: 0.7, kind: "village" },
  { id: 2, name: "Needle's Eye", x: -40, z: -350, y: 150, model: "c", size: 68, yaw: 2.9, kind: "windmill" },
  { id: 3, name: "Red Mesa", x: 360, z: -360, y: 170, model: "a", size: 84, yaw: 0.6, kind: "castle" },
  { id: 4, name: "Echo Ledge", x: 680, z: 90, y: 130, model: "c", size: 76, yaw: 1.4, kind: "market" },
  { id: 5, name: "Farwatch", x: 300, z: 460, y: 185, model: "a", size: 78, yaw: 0.1, kind: "lighthouse" },
];

/** The middle of the great canyon, west to east (ring courses and mail bags follow it). */
export const CANYON_PATH: Path = [
  [-500, 10],
  [-360, -80],
  [-220, -20],
  [-90, 80],
  [50, 70],
  [180, -40],
  [320, -50],
  [440, 40],
  [540, 70],
];

// --- Region 4: Storm Peaks -----------------------------------------------------------------------------

const STORM_ISLANDS: IslandDef[] = [
  { id: 0, name: "Ironcloud Station", x: 0, z: 0, y: 190, model: "aero", size: 100, yaw: 0.8, kind: "hub" },
  { id: 1, name: "Castle Crag", x: -520, z: -300, y: 178, model: "a", size: 92, yaw: 0.6, kind: "castle" },
  { id: 2, name: "High Watch", x: -600, z: 320, y: 230, model: "c", size: 76, yaw: 2.9, kind: "castle" },
  { id: 3, name: "Thunder Spire", x: -60, z: 640, y: 204, model: "a", size: 88, yaw: 0.1, kind: "village" },
  { id: 4, name: "Frostfall", x: 480, z: 380, y: 160, model: "c", size: 80, yaw: 1.5, kind: "watermill" },
  { id: 5, name: "Gale Shelf", x: 560, z: -260, y: 214, model: "a", size: 84, yaw: 2.3, kind: "windmill" },
  { id: 6, name: "The Aerie", x: 60, z: -620, y: 246, model: "c", size: 70, yaw: 1.0, kind: "lighthouse" },
];

// --- Region 5: Starfall Deep ---------------------------------------------------------------------------

const STARFALL_ISLANDS: IslandDef[] = [
  { id: 0, name: "Moonharbour", x: 0, z: 0, y: 140, model: "aero", size: 100, yaw: 2.6, kind: "hub" },
  { id: 1, name: "Last Light", x: 440, z: 430, y: 168, model: "c", size: 72, yaw: 1.9, kind: "lighthouse" },
  { id: 2, name: "Silver Stair", x: -430, z: 270, y: 120, model: "a", size: 84, yaw: 1.1, kind: "windmill" },
  { id: 3, name: "Comet's Rest", x: -540, z: -250, y: 190, model: "a", size: 88, yaw: 0.4, kind: "castle" },
  { id: 4, name: "Nightbloom", x: 70, z: -540, y: 150, model: "c", size: 78, yaw: 2.2, kind: "orchard" },
  { id: 5, name: "Lantern Court", x: 540, z: -190, y: 110, model: "a", size: 84, yaw: 0.9, kind: "market" },
  { id: 6, name: "Polestar", x: -70, z: 720, y: 220, model: "c", size: 70, yaw: 0.3, kind: "village" },
];

/** The Teeth: a short canyon west of Moonharbour, south to north. */
export const TEETH_PATH: Path = [
  [-240, 130],
  [-280, 0],
  [-230, -140],
  [-290, -280],
  [-250, -420],
];

export const REGIONS: RegionDef[] = [
  {
    id: 0,
    name: "Meadow Isles",
    blurb: "Short hops around Courier Central in calm morning air.",
    hazards: "Beams, boost rings and updrafts",
    sky: "morning",
    skyTo: "afternoon",
    wind: [0.8, 0.3],
    gusts: 0,
    balloons: 4,
    flocks: 1,
    rain: 0,
    pay: 1,
    pace: 21,
    flora: "meadow",
    tint: { rock: "#ffffff", grass: "#ffffff", frost: 0 },
    color: "#7cc4ff",
    islands: MEADOW_ISLANDS,
    islets: [
      { x: 150, z: 130, y: 70, size: 22, model: "b", yaw: 0.3 },
      { x: -120, z: 210, y: 150, size: 18, model: "a", yaw: 1.2 },
      { x: 120, z: -380, y: 90, size: 20, model: "c", yaw: 2.1 },
      { x: -420, z: -120, y: 60, size: 26, model: "d", yaw: 0.8 },
      { x: 450, z: -90, y: 160, size: 30, model: "d", yaw: 2.4 },
      { x: 480, z: -400, y: 70, size: 22, model: "a", yaw: 0.2 },
      { x: -560, z: 40, y: 130, size: 20, model: "b", yaw: 1.6 },
      { x: 40, z: 560, y: 130, size: 24, model: "c", yaw: 1.4 },
      { x: 560, z: 380, y: 150, size: 22, model: "b", yaw: 0.9 },
    ],
    peaks: [],
    updrafts: [
      { x: -150, z: 110, r: 15 },
      { x: 160, z: -110, r: 15 },
      { x: 470, z: 300, r: 16 },
      { x: -470, z: -190, r: 16 },
      { x: 60, z: -300, r: 15 },
    ],
    downdrafts: [],
    storms: [],
    jets: [],
    ringLines: [
      [0, 1, 4],
      [0, 2, 4],
      [0, 3, 4],
      [0, 4, 4],
      [2, 5, 4],
      [3, 5, 4],
    ],
  },
  {
    id: 1,
    name: "Lantern Reach",
    blurb: "Long runs between the lantern towns in a golden evening wind.",
    hazards: "Balloon traffic, bird flocks and a steady crosswind",
    sky: "afternoon",
    skyTo: "sunset",
    wind: [4.2, 1.8],
    gusts: 0,
    balloons: 11,
    flocks: 3,
    rain: 0,
    pay: 1.4,
    pace: 22,
    flora: "autumn",
    tint: { rock: "#ffd9c4", grass: "#ffc79a", frost: 0 },
    color: "#ffd25a",
    islands: LANTERN_ISLANDS,
    islets: [
      { x: 210, z: 150, y: 80, size: 24, model: "b", yaw: 0.3 },
      { x: -200, z: 90, y: 165, size: 20, model: "a", yaw: 1.2 },
      { x: 180, z: -420, y: 95, size: 22, model: "c", yaw: 2.1 },
      { x: -620, z: -40, y: 70, size: 28, model: "d", yaw: 0.8 },
      { x: 700, z: 60, y: 175, size: 30, model: "d", yaw: 2.4 },
      { x: 380, z: 620, y: 90, size: 22, model: "a", yaw: 0.2 },
      { x: -230, z: 560, y: 140, size: 24, model: "b", yaw: 1.6 },
      { x: -520, z: -560, y: 190, size: 24, model: "c", yaw: 1.4 },
      { x: 330, z: -560, y: 150, size: 22, model: "a", yaw: 2.7 },
    ],
    peaks: [],
    updrafts: [
      { x: -190, z: -150, r: 16 },
      { x: 210, z: -90, r: 15 },
      { x: 380, z: 440, r: 16 },
      { x: -170, z: 400, r: 16 },
      { x: -230, z: -480, r: 17 },
      { x: 60, z: 260, r: 15 },
    ],
    downdrafts: [],
    storms: [],
    jets: [],
    ringLines: [
      [0, 1, 4],
      [0, 2, 4],
      [0, 3, 5],
      [0, 4, 5],
      [1, 5, 5],
      [2, 6, 4],
      [3, 5, 5],
    ],
  },
  {
    id: 2,
    name: "Windscar Canyons",
    blurb: "A maze of rock pillars cut by a hot, gusting wind.",
    hazards: "Narrow canyons, sudden gusts and sinking air",
    sky: "noon",
    skyTo: "dusk",
    wind: [3.2, -1.6],
    gusts: 11,
    balloons: 5,
    flocks: 2,
    rain: 0,
    pay: 1.8,
    pace: 22,
    flora: "dry",
    tint: { rock: "#ffb27a", grass: "#f2e08a", frost: 0 },
    color: "#ff9a5c",
    islands: CANYON_ISLANDS,
    islets: [
      { x: -420, z: 250, y: 150, size: 24, model: "d", yaw: 0.3 },
      { x: -330, z: -300, y: 110, size: 22, model: "b", yaw: 1.2 },
      { x: 150, z: -520, y: 190, size: 24, model: "d", yaw: 2.1 },
      { x: 560, z: -230, y: 100, size: 26, model: "c", yaw: 0.8 },
      { x: 520, z: 330, y: 160, size: 22, model: "d", yaw: 2.4 },
      { x: 40, z: 420, y: 130, size: 24, model: "a", yaw: 0.2 },
      { x: -820, z: -220, y: 150, size: 22, model: "d", yaw: 1.6 },
    ],
    peaks: [
      ...canyon(CANYON_PATH, 62, 31, [205, 275], CANYON_ISLANDS),
      // Lone needles on the plateaus either side.
      { x: -40, z: -170, r: 24, h: 230, yaw: 0.4 },
      { x: 160, z: 260, r: 26, h: 250, yaw: 1.3 },
      { x: -420, z: -260, r: 22, h: 215, yaw: 2.2 },
      { x: 520, z: -140, r: 24, h: 240, yaw: 0.9 },
      { x: 110, z: -230, r: 20, h: 200, yaw: 1.9 },
    ],
    updrafts: [
      { x: -560, z: 190, r: 16 },
      { x: 130, z: 20, r: 14 },
      { x: 250, z: -250, r: 16 },
      { x: 500, z: 250, r: 16 },
    ],
    downdrafts: [
      { x: -150, z: 200, r: 20 },
      { x: 130, z: -150, r: 20 },
      { x: 420, z: 240, r: 20 },
      { x: -300, z: -200, r: 20 },
    ],
    storms: [],
    jets: [],
    ringLines: [
      [0, 1, 4],
      [1, 5, 4],
      [5, 4, 4],
      [3, 4, 4],
      [2, 3, 4],
    ],
  },
  {
    id: 3,
    name: "Storm Peaks",
    blurb: "High, cold and loud: thunderheads between the mountain stations.",
    hazards: "Storm cells, lightning, rain and jet streams",
    sky: "overcast",
    skyTo: "storm",
    wind: [4.4, 2.6],
    gusts: 7,
    balloons: 6,
    flocks: 2,
    rain: 0.45,
    pay: 2.3,
    pace: 23,
    flora: "pine",
    tint: { rock: "#aebfdc", grass: "#dfeaff", frost: 0.55 },
    color: "#b9c8e6",
    islands: STORM_ISLANDS,
    islets: [
      { x: 230, z: 130, y: 150, size: 24, model: "d", yaw: 0.3 },
      { x: -160, z: -220, y: 240, size: 22, model: "d", yaw: 1.2 },
      { x: 300, z: -120, y: 180, size: 22, model: "b", yaw: 2.1 },
      { x: -780, z: 40, y: 190, size: 26, model: "d", yaw: 0.8 },
      { x: 720, z: 90, y: 230, size: 26, model: "d", yaw: 2.4 },
      { x: 250, z: 760, y: 170, size: 22, model: "c", yaw: 0.2 },
      { x: -330, z: -620, y: 220, size: 24, model: "d", yaw: 1.6 },
    ],
    peaks: [
      { x: -260, z: -420, r: 34, h: 250, yaw: 0.4 },
      { x: 330, z: 130, r: 30, h: 150, yaw: 1.1 },
      { x: 760, z: 420, r: 36, h: 215, yaw: 2.0 },
      { x: -820, z: -40, r: 34, h: 205, yaw: 0.7 },
      { x: 310, z: -700, r: 32, h: 285, yaw: 2.6 },
      { x: -330, z: 840, r: 36, h: 240, yaw: 1.5 },
      { x: 250, z: -260, r: 26, h: 170, yaw: 0.2 },
    ],
    updrafts: [
      { x: -180, z: -160, r: 16 },
      { x: 200, z: 260, r: 16 },
      { x: 400, z: -80, r: 16 },
      { x: -420, z: 60, r: 17 },
      { x: -60, z: -400, r: 16 },
    ],
    downdrafts: [
      { x: 150, z: -330, r: 22 },
      { x: -200, z: 380, r: 22 },
      { x: 380, z: 150, r: 20 },
    ],
    storms: [
      { x: -300, z: 170, y: 210, r: 105 },
      { x: 230, z: 520, y: 185, r: 100 },
      { x: 130, z: -500, y: 240, r: 100 },
      { x: -340, z: 540, y: 215, r: 90 },
    ],
    jets: [
      { a: [-430, 240, -160], b: [390, 240, -160], r: 20, speed: 15 },
      { a: [640, 205, 300], b: [640, 230, -180], r: 20, speed: 15 },
    ],
    ringLines: [
      [0, 1, 5],
      [0, 3, 5],
      [0, 4, 5],
      [0, 5, 5],
      [1, 2, 5],
      [5, 6, 4],
    ],
  },
  {
    id: 4,
    name: "Starfall Deep",
    blurb: "The far isles at night: beacons, lantern balloons and every trick of the sky.",
    hazards: "Night flying, with everything you have met so far",
    sky: "night",
    skyTo: "night",
    wind: [3.0, -2.0],
    gusts: 9,
    balloons: 12,
    flocks: 2,
    rain: 0,
    pay: 2.9,
    pace: 24,
    flora: "night",
    tint: { rock: "#b8b4ff", grass: "#8fe6e0", frost: 0 },
    color: "#c9a7ff",
    islands: STARFALL_ISLANDS,
    islets: [
      { x: 220, z: 170, y: 100, size: 24, model: "b", yaw: 0.3 },
      { x: 250, z: -150, y: 185, size: 22, model: "d", yaw: 1.2 },
      { x: -120, z: 400, y: 150, size: 22, model: "c", yaw: 2.1 },
      { x: 700, z: 150, y: 160, size: 28, model: "d", yaw: 0.8 },
      { x: -700, z: 30, y: 130, size: 24, model: "d", yaw: 2.4 },
      { x: 230, z: 700, y: 140, size: 22, model: "a", yaw: 0.2 },
      { x: -330, z: -620, y: 210, size: 24, model: "b", yaw: 1.6 },
      { x: 420, z: -620, y: 180, size: 22, model: "c", yaw: 1.4 },
    ],
    peaks: [
      ...canyon(TEETH_PATH, 58, 77, [190, 250], STARFALL_ISLANDS),
      { x: 300, z: 60, r: 22, h: 190, yaw: 0.6 },
      { x: 150, z: 520, r: 26, h: 230, yaw: 1.8 },
      { x: 660, z: -430, r: 28, h: 200, yaw: 2.5 },
    ],
    updrafts: [
      { x: 180, z: -200, r: 15 },
      { x: -110, z: 250, r: 16 },
      { x: 300, z: 300, r: 16 },
      { x: -420, z: -60, r: 16 },
      { x: 330, z: -40, r: 15 },
    ],
    downdrafts: [
      { x: 230, z: 460, r: 20 },
      { x: -330, z: 420, r: 20 },
      { x: 360, z: -230, r: 20 },
    ],
    storms: [
      { x: 290, z: -400, y: 145, r: 95 },
      { x: -260, z: 520, y: 180, r: 100 },
    ],
    jets: [
      { a: [200, 195, 640], b: [570, 165, 60], r: 20, speed: 15 },
      { a: [-580, 225, 80], b: [-150, 240, 680], r: 20, speed: 15 },
    ],
    ringLines: [
      [0, 1, 5],
      [0, 2, 4],
      [0, 4, 5],
      [0, 5, 5],
      [2, 6, 5],
      [1, 6, 5],
      [3, 4, 5],
    ],
  },
];

export type UpgradeId = "engine" | "tank" | "hull";

export const UPGRADES: { id: UpgradeId; name: string; text: string; costs: number[] }[] = [
  { id: "engine", name: "Engine", text: "+3 m/s top speed and quicker throttle per level.", costs: [150, 350, 700, 1200] },
  { id: "tank", name: "Boost tank", text: "+25% boost and faster refills per level.", costs: [120, 300, 600, 1000] },
  { id: "hull", name: "Hull plating", text: "+25 hull per level, and bumps dent parcels less.", costs: [130, 320, 640, 1100] },
];

/** Free flight: a shift lasts four minutes; the HUD clock runs 08:00 → 18:00 over it. */
export const SHIFT_SECONDS = 240;
export const DAY_START_HOUR = 8;
export const DAY_HOURS = 10;

export const WORLD_RADIUS = 1250;
export const CEILING = 330;
