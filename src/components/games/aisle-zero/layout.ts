/**
 * Aisle Zero's floor plan as plain numbers (no three.js): the store's size, its shelving, the back rooms and
 * their doors, and every place something can be put — shopping-list items, keys, fuses, coins, batteries,
 * alarm sensors, barricades and breaker boxes. world.ts builds the store from it; content.ts picks from it
 * for each night.
 *
 * Coordinates: x runs west (−) to east (+), z from the back wall (−) to the front shutters (+).
 */

export const XI = 35.7;
export const ZI = 47.7;
export const CEIL = 3.4;

/** Double-sided shelf runs (x centres); the ten aisles lie beside and between them. */
export const PAIRS: number[] = [];
for (let i = 0; i < 9; i++) PAIRS.push(-20.8 + 5.2 * i);
/** Shelf segments along z (modules of LM metres), with cross aisles between them. */
export const SEGS = [
  { z0: -22, n: 10 },
  { z0: -4, n: 10 },
  { z0: 14, n: 6 },
] as const;
export const LM = 1.3;
/** Half-width of a double shelf run. */
export const HW = 0.6;
export const BOARDS = [0.2, 0.6, 1.0, 1.4];
export const TALL_BOARDS = [0.2, 0.9, 1.6, 2.3];

const AISLE_LABELS = ["Cooking Oils", "Spices", "Rice & Flour", "Snacks", "Beverages", "Salt & Sugar", "Cleaning", "Sweets & Honey", "Baby & Pet", "Frozen"];
export const AISLES = AISLE_LABELS.map((label, i) => ({ n: i + 1, x: i === 0 ? -25 : i === 9 ? 25 : (PAIRS[i - 1] + PAIRS[i]) / 2, label, en: label.toUpperCase() }));

export const SPAWN = { x: 0, z: 44, yaw: 0 };
export const PAY_POINT = { x: 0, z: 31 };

/** The wall between the shop floor and the back rooms, and the two walls that split the back into three rooms. */
export const BACK_Z = -26;
export const PART_X = 18;
/** Tall racking: the cold room's two long racks and the stock room's two short ones. */
export const COLD_RACKS = [-30, -22];
export const STOCK_RACKS = [-16.9, 16.9];
export const STOCK_RACK_Z0 = -33.5;
export const STOCK_RACK_N = 4;

export type Zone = "store" | "stock" | "cold" | "office";
export const zoneOf = (x: number, z: number): Zone => (z > BACK_Z ? "store" : x < -PART_X ? "cold" : x > PART_X ? "office" : "stock");
export const ZONE_NAMES: Record<Zone, string> = { store: "Shop floor", stock: "Stock room", cold: "Cold storage", office: "Staff office" };

// --- Doors ---------------------------------------------------------------------------------------------

export type DoorId = "stockW" | "stockE" | "cold" | "office";

export interface DoorDef {
  /** The doorway's collision box while the shutter is down. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  name: string;
  /** The room behind it. */
  zone: Zone;
  /** Where the sign above it faces (unit vector, out of the room). */
  nx: number;
  nz: number;
}

export const DOORS: Record<DoorId, DoorDef> = {
  stockW: { x0: -16, x1: -12, z0: BACK_Z - 0.15, z1: BACK_Z + 0.15, name: "Stock room shutter", zone: "stock", nx: 0, nz: 1 },
  stockE: { x0: 12, x1: 16, z0: BACK_Z - 0.15, z1: BACK_Z + 0.15, name: "Stock room shutter", zone: "stock", nx: 0, nz: 1 },
  cold: { x0: -PART_X - 0.15, x1: -PART_X + 0.15, z0: -37.5, z1: -34.5, name: "Cold storage door", zone: "cold", nx: 1, nz: 0 },
  office: { x0: PART_X - 0.15, x1: PART_X + 0.15, z0: -37.5, z1: -34.5, name: "Staff office door", zone: "office", nx: -1, nz: 0 },
};
export const DOOR_IDS = Object.keys(DOORS) as DoorId[];
export const doorCenter = (d: DoorDef): [number, number] => [(d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2];

// --- Slots: where things sit, and the side they are reached from ---------------------------------------

export interface Slot {
  x: number;
  z: number;
  /** Height of the surface it stands on. */
  y: number;
  /** Unit vector pointing out of the shelf towards whoever picks it up. */
  nx: number;
  nz: number;
  where: string;
}

/** A shelf face in aisle `n`: its west shelf ("w") or its east shelf ("e"). */
function aisle(n: number, face: "w" | "e", z: number, board = 1): Slot {
  const pair = face === "w" ? n - 2 : n - 1;
  const side = face === "w" ? 1 : -1;
  return { x: PAIRS[pair] + side * 0.55, z, y: BOARDS[board], nx: side, nz: 0, where: `Aisle ${n} · ${AISLE_LABELS[n - 1]}` };
}
/** A face of a tall rack in a back room. */
const rack = (px: number, side: 1 | -1, z: number, where: string): Slot => ({ x: px + side * 0.55, z, y: TALL_BOARDS[1] + 0.015, nx: side, nz: 0, where });
const top = (x: number, z: number, y: number, nx: number, nz: number, where: string): Slot => ({ x, z, y, nx, nz, where });

/** Freezer-wall stands (east) and the office desks: world.ts builds a stand or desk under each. */
export const STANDS: [number, number][] = [
  [33.1, -11],
  [33.1, 9],
];
export const DESKS: [number, number][] = [
  [24, -30],
  [30, -31],
  [24.5, -42],
  [30.5, -41.5],
];

export const SLOTS = {
  // Shop floor
  a1a: aisle(1, "e", 17),
  a1b: aisle(1, "e", -14, 2),
  a2a: aisle(2, "w", 3),
  a2b: aisle(2, "e", -17, 2),
  a3a: aisle(3, "w", 0.2),
  a3b: aisle(3, "e", 16.5),
  a4a: aisle(4, "w", -12),
  a4b: aisle(4, "e", 6, 2),
  a5a: aisle(5, "w", 18),
  a5b: aisle(5, "e", -2),
  a5c: aisle(5, "w", -19, 2),
  a6a: aisle(6, "e", -15.5, 2),
  a6b: aisle(6, "w", 5),
  a7a: aisle(7, "w", 7),
  a7b: aisle(7, "e", -20),
  a8a: aisle(8, "e", 3.4),
  a8b: aisle(8, "w", -11, 2),
  a8c: aisle(8, "e", 19),
  a9a: aisle(9, "w", -3),
  a9b: aisle(9, "e", -13),
  a9c: aisle(9, "w", 15.5, 2),
  a10a: aisle(10, "w", -18),
  a10b: aisle(10, "w", 4, 2),
  freezer1: top(STANDS[0][0], STANDS[0][1], 1.05, -1, 0, "Freezer wall (east)"),
  freezer2: top(STANDS[1][0], STANDS[1][1], 1.05, -1, 0, "Freezer wall (east)"),
  bakery: top(-30.2, 6, 1.05, 1, 0, "Bakery corner (west)"),
  produce1: top(-28.8, -13.4, 0.8, 1, 0, "Produce corner (west)"),
  produce2: top(-28.8, 13, 0.8, 1, 0, "Produce corner (west)"),
  // Stock room
  stock1: rack(STOCK_RACKS[0], 1, -30, "Stock room (west rack)"),
  stock2: rack(STOCK_RACKS[0], 1, -32.5, "Stock room (west rack)"),
  stock3: rack(STOCK_RACKS[1], -1, -31.5, "Stock room (east rack)"),
  stock4: rack(STOCK_RACKS[1], -1, -29.2, "Stock room (east rack)"),
  // Cold storage
  cold1: rack(COLD_RACKS[1], -1, -38.1, "Cold storage (middle racks)"),
  cold2: rack(COLD_RACKS[0], 1, -33, "Cold storage (middle racks)"),
  cold3: rack(COLD_RACKS[1], 1, -42, "Cold storage (by the door)"),
  cold4: rack(COLD_RACKS[0], -1, -43, "Cold storage (far wall)"),
  // Staff office (desks)
  office1: top(DESKS[0][0], DESKS[0][1] - 0.2, 0.78, 0, -1, "Staff office (desk)"),
  office2: top(DESKS[1][0], DESKS[1][1] - 0.2, 0.78, 0, -1, "Staff office (desk)"),
  office3: top(DESKS[2][0], DESKS[2][1] + 0.2, 0.78, 0, 1, "Staff office (back desk)"),
  office4: top(DESKS[3][0], DESKS[3][1] + 0.2, 0.78, 0, 1, "Staff office (back desk)"),
  // Spare places for keys, fuses and the night's bonus item
  x2: aisle(2, "e", 5, 2),
  x3: aisle(3, "e", -14, 2),
  x4: aisle(4, "w", 17, 2),
  x6: aisle(6, "e", 1, 2),
  x7: aisle(7, "e", 16, 2),
  x9: aisle(9, "e", 6, 2),
  x10: aisle(10, "w", 17, 2),
  xProduce: top(-28.8, -0.2, 0.8, 1, 0, "Produce corner (west)"),
  xStock: rack(STOCK_RACKS[1], -1, -33, "Stock room (east rack)"),
  xCold: rack(COLD_RACKS[0], 1, -40, "Cold storage (middle racks)"),
  xOffice: top(DESKS[3][0], DESKS[3][1] - 0.2, 0.78, 0, -1, "Staff office (back desk)"),
} satisfies Record<string, Slot>;

export type SlotId = keyof typeof SLOTS;
export const slotZone = (s: Slot): Zone => zoneOf(s.x + s.nx * 1.2, s.z + s.nz * 1.2);
/** Where the player stands to reach a slot. */
export const slotAccess = (s: Slot, d = 1.3): [number, number] => [s.x + s.nx * d, s.z + s.nz * d];

// --- Breaker boxes -------------------------------------------------------------------------------------

export type BreakerId = "stock" | "office" | "lobby" | "cold";
export const BREAKERS: Record<BreakerId, { x: number; z: number; nx: number; nz: number; where: string }> = {
  stock: { x: 5.5, z: -ZI + 0.08, nx: 0, nz: 1, where: "Stock room, back wall" },
  office: { x: XI - 0.08, z: -44.6, nx: -1, nz: 0, where: "Staff office, east wall" },
  lobby: { x: -XI + 0.08, z: 31, nx: 1, nz: 0, where: "Lobby, west wall" },
  cold: { x: -26, z: -ZI + 0.08, nx: 0, nz: 1, where: "Cold storage, back wall" },
};
export const BREAKER_IDS = Object.keys(BREAKERS) as BreakerId[];

// --- Floor spots: coins, batteries, alarm sensors ------------------------------------------------------

/** Open floor where a coin or a battery can lie (every one can be walked to once its room is open). */
export const FLOOR_SPOTS: [number, number][] = [];
for (const a of AISLES) for (const z of [-19, -12, -1.5, 6, 16.5, 20]) FLOOR_SPOTS.push([a.x + (a.n % 2 ? 0.9 : -0.9), z]);
for (const x of [-27, -18, -9, 9, 18, 27]) FLOOR_SPOTS.push([x, -6.5], [x, 11.5], [x, 25.5], [x, -24]);
FLOOR_SPOTS.push([-24, 40], [-10, 43], [10, 43], [22, 40], [30, 30], [-27, 30], [31, 20], [31, -18]);
FLOOR_SPOTS.push([-6, -30], [6, -37], [-3, -44.5], [12, -45], [-12, -40], [0, -34.5]);
FLOOR_SPOTS.push([-26, -30], [-26, -44], [-33, -38], [-19.8, -40], [-33.5, -45.5]);
FLOOR_SPOTS.push([21, -33], [27, -36], [33, -37], [27.5, -45], [20.5, -45]);

/** Where alarm sensors can stand: the cross aisles, the lobby's edge and the back-room doorways. */
export const SENSOR_SPOTS = {
  crossBackW: [-13, -6.5],
  crossBackM: [0, -6.5],
  crossBackE: [13, -6.5],
  crossFrontW: [-13, 11.5],
  crossFrontM: [0, 11.5],
  crossFrontE: [13, 11.5],
  lobbyW: [-18, 25],
  lobbyM: [0, 25.5],
  lobbyE: [18, 25],
  backW: [-14, -23.6],
  backM: [0, -24],
  backE: [14, -23.6],
  stockMid: [0, -37],
  stockW: [-12.5, -36],
  stockE: [12.5, -36],
  coldMid: [-26, -36],
  officeMid: [27, -36.5],
  exit: [0, -43.5],
  produce: [-25, 1],
  frozen: [27, 1],
} satisfies Record<string, [number, number]>;
export type SensorId = keyof typeof SENSOR_SPOTS;
export const SENSOR_R = 2.4;

/** A barricade closes one aisle (2–9) at one of three places along it. */
export const BARRICADE_Z = { back: -15.5, mid: 2.5, front: 17.9 } as const;
export type BarricadeAt = keyof typeof BARRICADE_Z;
export type Barricade = [aisle: number, at: BarricadeAt];
export const barricadeBox = ([n, at]: Barricade) => {
  const x = AISLES[n - 1].x;
  const z = BARRICADE_Z[at];
  return { x, z, x0: x - 2.05, x1: x + 2.05, z0: z - 0.55, z1: z + 0.55 };
};

/** Lockers the player can hide in: x, z and the way the doors face. */
export const LOCKERS: [number, number, number, number][] = [
  [-35.3, -14, 1, 0],
  [-35.3, 14, 1, 0],
  [-35.3, 26, 1, 0],
  [35.3, 40, -1, 0],
  [-35.3, -31, 1, 0],
  [-35.3, -41, 1, 0],
  [35.3, -31, -1, 0],
  [35.3, -41, -1, 0],
  [-10, -47.3, 0, 1],
  [10, -47.3, 0, 1],
  [35.3, 27, -1, 0],
  [18, 47.3, 0, -1],
];

/** Patrol points for the creature (those in a closed room are skipped). */
export const WAYPOINTS: [number, number][] = [];
for (const a of AISLES) for (const z of [-13.5, -6.5, 1, 11.5, 18, -23.6]) WAYPOINTS.push([a.x, z]);
WAYPOINTS.push(
  [-24, 38],
  [-12, 38],
  [0, 38],
  [12, 38],
  [24, 38],
  [-30, 0],
  [-30, -12],
  [-30, 16],
  [30, -14],
  [30, 6],
  [0, -36],
  [-6, -44],
  [6, -44],
  [-14, -28],
  [14, -28],
  [-10, -36],
  [10, -36],
  [-19.8, -32],
  [-26, -42],
  [-26, -31],
  [-33, -38],
  [21, -34],
  [27, -36],
  [27, -45.5],
  [33, -36.5],
);

/** A small seeded generator, so a night's coins and batteries lie in the same places every time. */
export function seeded(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
