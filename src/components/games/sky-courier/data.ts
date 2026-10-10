/**
 * Sky Courier — the archipelago, regions (routes), ring-trial courses and upgrade tables.
 * Plain data (no three.js) so the UI can draw the route map from the same numbers.
 * Units are metres; y is up. The sea of clouds sits at y = 0.
 */

export type IslandKind = "hub" | "windmill" | "market" | "orchard" | "village" | "watermill" | "castle" | "lighthouse";
export type IslandModel = "aero" | "a" | "b" | "c";

export interface IslandDef {
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
  /** Route (region) the island belongs to. */
  region: number;
  kind: IslandKind;
}

export const ISLANDS: IslandDef[] = [
  { id: 0, name: "Courier Central", x: 0, z: 0, y: 110, model: "aero", size: 104, yaw: 0.4, region: 0, kind: "hub" },
  { id: 1, name: "Millbrook", x: -340, z: 160, y: 92, model: "a", size: 84, yaw: 1.1, region: 0, kind: "windmill" },
  { id: 2, name: "Fountain Square", x: 270, z: -250, y: 124, model: "c", size: 78, yaw: 0.3, region: 0, kind: "market" },
  { id: 3, name: "Orchard Hollow", x: 300, z: 290, y: 84, model: "a", size: 84, yaw: 2.2, region: 0, kind: "orchard" },
  { id: 4, name: "Lantern Rock", x: -170, z: -390, y: 146, model: "c", size: 70, yaw: 2.6, region: 0, kind: "village" },
  { id: 5, name: "Watermill Ward", x: 740, z: -40, y: 104, model: "c", size: 84, yaw: 0.9, region: 1, kind: "watermill" },
  { id: 6, name: "Bellhaven", x: 560, z: -620, y: 136, model: "a", size: 84, yaw: 0.2, region: 1, kind: "village" },
  { id: 7, name: "Kite Hill", x: 640, z: 560, y: 88, model: "a", size: 80, yaw: 1.7, region: 1, kind: "market" },
  { id: 8, name: "Pennant Point", x: 60, z: -860, y: 118, model: "c", size: 74, yaw: 1.2, region: 1, kind: "castle" },
  { id: 9, name: "Castle Crag", x: -720, z: -420, y: 178, model: "a", size: 92, yaw: 0.6, region: 2, kind: "castle" },
  { id: 10, name: "High Watch", x: -860, z: 360, y: 214, model: "c", size: 76, yaw: 2.9, region: 2, kind: "castle" },
  { id: 11, name: "Thunder Spire", x: -300, z: 820, y: 196, model: "a", size: 88, yaw: 0.1, region: 2, kind: "village" },
  { id: 12, name: "Last Light", x: 260, z: 980, y: 168, model: "c", size: 72, yaw: 1.9, region: 2, kind: "lighthouse" },
];

/** Small rocks drifting between the big islands (scenery only). */
export const ISLETS: { x: number; z: number; y: number; size: number; model: "a" | "b" | "c" | "d"; yaw: number }[] = [
  { x: 150, z: 130, y: 70, size: 22, model: "b", yaw: 0.3 },
  { x: -120, z: 210, y: 150, size: 18, model: "a", yaw: 1.2 },
  { x: 120, z: -380, y: 90, size: 20, model: "c", yaw: 2.1 },
  { x: -420, z: -120, y: 60, size: 26, model: "d", yaw: 0.8 },
  { x: 470, z: 20, y: 150, size: 34, model: "d", yaw: 2.4 },
  { x: 430, z: -420, y: 70, size: 22, model: "a", yaw: 0.2 },
  { x: -560, z: 40, y: 130, size: 20, model: "b", yaw: 1.6 },
  { x: 880, z: 300, y: 70, size: 24, model: "c", yaw: 0.9 },
  { x: 330, z: -760, y: 180, size: 20, model: "a", yaw: 2.7 },
  { x: -380, z: -720, y: 120, size: 30, model: "d", yaw: 1.1 },
  { x: -560, z: 600, y: 120, size: 22, model: "a", yaw: 0.5 },
  { x: -1000, z: -120, y: 160, size: 26, model: "b", yaw: 2.2 },
  { x: 40, z: 560, y: 130, size: 24, model: "c", yaw: 1.4 },
  { x: 480, z: 860, y: 110, size: 20, model: "a", yaw: 0.7 },
  { x: -620, z: 980, y: 160, size: 26, model: "d", yaw: 2.0 },
  { x: 980, z: -520, y: 140, size: 22, model: "b", yaw: 1.0 },
  { x: -880, z: -760, y: 200, size: 24, model: "c", yaw: 0.4 },
  { x: 1050, z: 120, y: 120, size: 28, model: "d", yaw: 2.8 },
];

export interface RegionDef {
  id: number;
  name: string;
  blurb: string;
  cost: number;
  pay: number;
  /** Timer speed reference (m/s): higher = tighter timers. */
  pace: number;
  balloons: number;
  flocks: number;
  storms: boolean;
}

export const REGIONS: RegionDef[] = [
  { id: 0, name: "Meadow Isles", blurb: "Short hops around Courier Central. Calm air, a few stray balloons.", cost: 0, pay: 1, pace: 21, balloons: 5, flocks: 1, storms: false },
  { id: 1, name: "Lantern Reach", blurb: "Long runs to the eastern isles. Balloon traffic and bird flocks.", cost: 450, pay: 1.45, pace: 23, balloons: 11, flocks: 3, storms: false },
  { id: 2, name: "Storm Peaks", blurb: "High, far and windy. Storm clouds shake the hull — big tips.", cost: 1200, pay: 2, pace: 25, balloons: 14, flocks: 5, storms: true },
];

/** Warm columns of rising air. */
export const UPDRAFTS: { x: number; z: number; r: number }[] = [
  { x: -150, z: 110, r: 15 },
  { x: 160, z: -110, r: 15 },
  { x: 470, z: 300, r: 16 },
  { x: 520, z: -330, r: 16 },
  { x: -470, z: -190, r: 16 },
  { x: -580, z: 520, r: 17 },
  { x: 90, z: 640, r: 16 },
  { x: -110, z: -640, r: 16 },
  { x: 900, z: -330, r: 16 },
  { x: -880, z: 80, r: 17 },
];

/** Storm cells: turbulence, lightning and dark cloud walls. */
export const STORMS: { x: number; z: number; y: number; r: number }[] = [
  { x: -560, z: 700, y: 200, r: 115 },
  { x: -930, z: -80, y: 190, r: 120 },
  { x: 440, z: 820, y: 170, r: 105 },
  { x: -430, z: -620, y: 175, r: 100 },
];

/** Chains of boost rings between islands (shift mode). Each: from island, to island, ring count. */
export const RING_LINES: [number, number, number][] = [
  [0, 1, 4],
  [0, 2, 4],
  [0, 3, 4],
  [0, 4, 4],
  [2, 5, 5],
  [3, 7, 5],
  [4, 8, 5],
  [2, 6, 4],
  [1, 9, 5],
  [1, 11, 5],
  [3, 12, 5],
  [1, 10, 5],
];

export interface CourseDef {
  id: number;
  name: string;
  region: number;
  blurb: string;
  /** Closed loop of waypoints (x, y, z); rings are spaced along a smooth curve through them. */
  points: [number, number, number][];
  spacing: number;
  /** Medal times (s): gold, silver, bronze. */
  medals: [number, number, number];
}

export const COURSES: CourseDef[] = [
  {
    id: 0,
    name: "Meadow Loop",
    region: 0,
    blurb: "A lap of the home isles. Gentle turns, one long dive.",
    spacing: 120,
    medals: [72, 84, 100],
    points: [
      [0, 150, -90],
      [150, 140, -150],
      [360, 150, -140],
      [440, 125, 90],
      [440, 110, 330],
      [250, 100, 440],
      [0, 120, 340],
      [-200, 108, 300],
      [-430, 112, 40],
      [-340, 150, -160],
      [-150, 170, -240],
    ],
  },
  {
    id: 1,
    name: "Lantern Slalom",
    region: 1,
    blurb: "Weave the eastern isles. Tight, low and fast.",
    spacing: 110,
    medals: [70, 82, 98],
    points: [
      [300, 150, -60],
      [560, 125, -210],
      [730, 150, -300],
      [880, 130, -120],
      [900, 112, 130],
      [790, 100, 340],
      [600, 92, 390],
      [500, 120, 190],
      [420, 140, 10],
    ],
  },
  {
    id: 2,
    name: "Storm Run",
    region: 2,
    blurb: "Through the thunderheads of the north-west. Hold on tight.",
    spacing: 115,
    medals: [80, 94, 112],
    points: [
      [-300, 190, 200],
      [-530, 220, 250],
      [-700, 240, 460],
      [-640, 230, 700],
      [-430, 215, 900],
      [-160, 200, 700],
      [-150, 175, 450],
    ],
  },
];

export type UpgradeId = "engine" | "tank" | "hull";

export const UPGRADES: { id: UpgradeId; name: string; text: string; costs: number[] }[] = [
  { id: "engine", name: "Engine", text: "+4 m/s top speed and quicker throttle.", costs: [120, 280, 520, 900] },
  { id: "tank", name: "Boost tank", text: "+25% boost capacity, faster refills.", costs: [100, 240, 460, 800] },
  { id: "hull", name: "Hull plating", text: "+25 hull, and bumps dent parcels less.", costs: [110, 260, 480, 850] },
];

export const SHIFT_SECONDS = 240;
/** Day clock shown in the HUD: 08:00 → 18:00 over a shift. */
export const DAY_START_HOUR = 8;
export const DAY_HOURS = 10;

export const WORLD_RADIUS = 1250;
export const CEILING = 320;
