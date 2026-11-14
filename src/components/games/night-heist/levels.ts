import { FLOOR, Grid, VOID, WALL, type Vec2 } from "./grid";

/**
 * Heist maps and their parser (the forty heists themselves live in heists-1.ts … heists-5.ts).
 * Each map is ASCII, one character per cell, north at the top (the camera looks north). Legend:
 *
 *   #  wall                 .  floor               (space) outside
 *   S  thief start          X  exit door (in a wall line)
 *   G  target gem on its pedestal
 *   $  coin stack (floor)   j  small valuable   b  bigger valuable   g  loose gem   (the last three on plinths)
 *   s  safe (takes a few seconds to crack)
 *   A  T  R  O  C  J  c  B  tall things that block sight — statues, pillars, urns, crates, shelves…
 *      (what they look like depends on the district): hide behind them
 *   d  desk   K  security console   P  a long low thing (two cells)   =  low barrier   — guards see over them
 *   D  locked door (needs a key card)   k  key card
 *   p  pressure plate       i  lamp / torch (lights the cell; the fitting goes on a neighbouring wall)
 *   w  moonlight            ~  noisy floor (creaky boards, gravel, loose grating)
 */

export type LootKind = "coins" | "jar" | "figurine" | "gem" | "safe";
export const LOOT_VALUE: Record<LootKind, number> = { coins: 150, jar: 250, figurine: 400, gem: 600, safe: 900 };

export type GemColor = "red" | "green" | "blue";

/** Waypoint: [x, z, seconds to stand and look around, direction to face while standing (degrees: 0 south, 90 east, 180 north, 270 west)]. */
export type Waypoint = [number, number] | [number, number, number] | [number, number, number, number];

export type GuardKind = "guard" | "warden" | "sentry" | "captain" | "dog";

export interface GuardDef {
  /** Loops through the points (two points = back and forth). One point = a fixed post. */
  route: Waypoint[];
  kind?: GuardKind;
  speed?: number;
}

export interface CameraDef {
  /** The wall cell it is mounted on. */
  x: number;
  z: number;
  /** Centre of the sweep in degrees (0 south, 90 east, 180 north, 270 west). */
  dir: number;
  /** Total sweep in degrees. */
  sweep: number;
  /** Seconds for a full back-and-forth. */
  period: number;
  phase?: number;
  range?: number;
}

export interface LaserDef {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** Direction the beams run ("x" = east–west). Defaults to the line's own direction. */
  axis?: "x" | "z";
  /** Seconds on / off. `off: 0` never switches off. */
  on: number;
  off: number;
  phase?: number;
  /** A sweeping gate: it slides by (dx, dz) cells and back, once every `period` seconds. */
  move?: { dx: number; dz: number; period: number; phase?: number };
}

export interface DroneDef {
  /** Flies straight between the points (over walls), looping. [x, z, seconds to hover]. */
  route: ([number, number] | [number, number, number])[];
  speed?: number;
}

export interface LevelDef {
  name: string;
  /** Short line under the name on the case card. */
  place: string;
  target: { name: string; gem: GemColor };
  brief: string;
  /** New tricks this heist introduces (shown on the briefing). */
  intro?: string[];
  map: string[];
  guards: GuardDef[];
  cameras?: CameraDef[];
  lasers?: LaserDef[];
  drones?: DroneDef[];
  /** Rugs: centre x, z and 0 (3 wide) or 1 (turned, 3 deep). */
  rugs?: [number, number, number][];
  /** Second-floor-style rectangles [x1, z1, x2, z2] (offices, carpet, deck plates — per district). */
  office?: [number, number, number, number][];
  webs?: [number, number][];
  /** Throwing coins at the start. */
  coins: number;
  /** Par time in seconds. */
  par: number;
  /** Seconds to get out once the target is lifted, before a silent alarm trips. */
  timer?: number;
  /** A scripted route for the solver, when "auto" is not enough (see bot.ts). */
  solution?: string[];
}

export type PropKind = "anubis" | "bastet" | "ra" | "obelisk" | "column" | "urn" | "crates" | "bookcase" | "desk" | "console" | "sarcophagus" | "rope" | "pedestal" | "plinth" | "safe";

export interface Prop {
  x: number;
  z: number;
  kind: PropKind;
  /** Yaw in radians (0 faces south). */
  yaw: number;
}

export interface Torch {
  /** The lit floor cell. */
  x: number;
  z: number;
  /** Mount point on the wall face. */
  mx: number;
  mz: number;
  /** Direction the sconce faces (away from the wall). */
  yaw: number;
}

export interface Parsed {
  def: LevelDef;
  index: number;
  grid: Grid;
  start: Vec2;
  exit: Vec2 & { yaw: number; inside: Vec2 };
  target: Vec2;
  loot: (Vec2 & { kind: LootKind; plinth: boolean })[];
  props: Prop[];
  walls: Vec2[];
  floors: (Vec2 & { office: boolean })[];
  torches: Torch[];
  moons: Vec2[];
  plates: Vec2[];
  noisy: Vec2[];
  doors: (Vec2 & { axis: "x" | "z" })[];
  keys: Vec2[];
  consoles: Vec2[];
  murals: (Vec2 & { yaw: number })[];
  lootTotal: number;
  /** What went wrong while reading the map (empty for a good one). */
  problems: string[];
}

const OPAQUE_PROPS: Record<string, PropKind> = { A: "anubis", T: "bastet", R: "ra", O: "obelisk", C: "column", J: "urn", c: "crates", B: "bookcase" };
const LOW_PROPS: Record<string, PropKind> = { d: "desk", K: "console", "=": "rope" };
const LOOT_CHARS: Record<string, LootKind> = { $: "coins", j: "jar", b: "figurine", g: "gem", s: "safe" };
const KNOWN = new Set([..."#. SXG~DkpiwP", ...Object.keys(OPAQUE_PROPS), ...Object.keys(LOW_PROPS), ...Object.keys(LOOT_CHARS)]);

export const deg = (d: number) => (d * Math.PI) / 180;

/** Which way a laser's beams run. */
export const laserAxis = (l: LaserDef): "x" | "z" => l.axis ?? (l.z1 === l.z2 ? "x" : "z");

/** The cells a laser gate covers (at rest). */
export function laserCells(l: LaserDef) {
  const cells: Vec2[] = [];
  const n = Math.max(Math.abs(l.x2 - l.x1), Math.abs(l.z2 - l.z1));
  for (let k = 0; k <= n; k++) cells.push({ x: l.x1 + Math.sign(l.x2 - l.x1) * k, z: l.z1 + Math.sign(l.z2 - l.z1) * k });
  return cells;
}

/** Is the gate on at `time`? (`warn`: about to switch on.) */
export function laserState(l: LaserDef, time: number) {
  if (l.off <= 0) return { active: true, warn: false };
  const period = l.on + l.off;
  const k = (((time + (l.phase ?? 0) * period) % period) + period) % period;
  return { active: k < l.on, warn: k >= l.on && k > period - 0.55 };
}

/** How far a sweeping gate has slid at `time`, in cells. */
export function laserOffset(l: LaserDef, time: number): Vec2 {
  const m = l.move;
  if (!m) return { x: 0, z: 0 };
  const u = (((time / m.period + (m.phase ?? 0)) % 1) + 1) % 1;
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  // Ease in and out at the ends, so the turn-around reads clearly.
  const k = tri * tri * (3 - 2 * tri);
  return { x: m.dx * k, z: m.dz * k };
}

export function parseLevel(def: LevelDef, index: number): Parsed {
  const h = def.map.length;
  const w = Math.max(...def.map.map((r) => r.length));
  const grid = new Grid(w, h);
  const ch = (x: number, z: number) => (z >= 0 && z < h ? (def.map[z][x] ?? " ") : " ");
  const isWallCh = (c: string) => c === "#" || c === "X" || c === "D";
  const out: Parsed = {
    def,
    index,
    grid,
    start: { x: 1, z: 1 },
    exit: { x: 0, z: 0, yaw: 0, inside: { x: 1, z: 1 } },
    target: { x: 1, z: 1 },
    loot: [],
    props: [],
    walls: [],
    floors: [],
    torches: [],
    moons: [],
    plates: [],
    noisy: [],
    doors: [],
    keys: [],
    consoles: [],
    murals: [],
    lootTotal: 0,
    problems: [],
  };
  def.map.forEach((row, z) => {
    if (row.length !== w) out.problems.push(`map row ${z} is ${row.length} wide, the map is ${w}`);
  });
  const inOffice = (x: number, z: number) => (def.office ?? []).some(([x1, z1, x2, z2]) => x >= x1 && x <= x2 && z >= z1 && z <= z2);
  const usedPair = new Set<string>();
  const count = { S: 0, X: 0, G: 0 };

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const c = ch(x, z);
      const i = grid.idx(x, z);
      if (!KNOWN.has(c)) out.problems.push(`unknown map character "${c}" at ${x},${z}`);
      if (c === " ") {
        grid.kind[i] = VOID;
        grid.solid[i] = 1;
        grid.opaque[i] = 1;
        continue;
      }
      if (c === "#") {
        grid.kind[i] = WALL;
        grid.solid[i] = 1;
        grid.opaque[i] = 1;
        out.walls.push({ x, z });
        continue;
      }
      if (c === "X") {
        count.X++;
        grid.kind[i] = WALL;
        grid.solid[i] = 1;
        grid.opaque[i] = 1;
        // The exit opens onto its one floor neighbour.
        const dirs: [number, number][] = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ];
        let found = false;
        for (const [dx, dz] of dirs) {
          const n = ch(x + dx, z + dz);
          if (n !== " " && !isWallCh(n)) {
            out.exit = { x, z, yaw: Math.atan2(dx, dz), inside: { x: x + dx, z: z + dz } };
            found = true;
            break;
          }
        }
        if (!found) out.problems.push("the exit has no floor next to it");
        continue;
      }
      // Everything else stands on floor.
      grid.kind[i] = FLOOR;
      out.floors.push({ x, z, office: inOffice(x, z) });
      if (c === "D") {
        grid.solid[i] = 1;
        grid.opaque[i] = 1;
        const axis = isWallCh(ch(x - 1, z)) || isWallCh(ch(x + 1, z)) ? "x" : "z";
        out.doors.push({ x, z, axis });
      } else if (c === "S") {
        count.S++;
        out.start = { x, z };
      } else if (c === "G") {
        count.G++;
        out.target = { x, z };
        grid.solid[i] = 1;
        out.props.push({ x, z, kind: "pedestal", yaw: 0 });
      } else if (LOOT_CHARS[c]) {
        const kind = LOOT_CHARS[c];
        const plinth = kind !== "coins";
        out.loot.push({ x, z, kind, plinth });
        out.lootTotal++;
        if (plinth) {
          grid.solid[i] = 1;
          out.props.push({ x, z, kind: kind === "safe" ? "safe" : "plinth", yaw: 0 });
        }
      } else if (OPAQUE_PROPS[c]) {
        grid.solid[i] = 1;
        grid.opaque[i] = 1;
        out.props.push({ x, z, kind: OPAQUE_PROPS[c], yaw: 0 });
      } else if (LOW_PROPS[c]) {
        grid.solid[i] = 1;
        const kind = LOW_PROPS[c];
        let yaw = 0;
        if (kind === "rope") {
          const along = (n: string) => n === "=" || isWallCh(n);
          if (!(along(ch(x - 1, z)) || along(ch(x + 1, z))) && (along(ch(x, z - 1)) || along(ch(x, z + 1)))) yaw = Math.PI / 2;
        } else if (kind === "desk" || kind === "console") {
          // Face away from the nearest wall.
          if (isWallCh(ch(x, z - 1))) yaw = 0;
          else if (isWallCh(ch(x, z + 1))) yaw = Math.PI;
          else if (isWallCh(ch(x - 1, z))) yaw = Math.PI / 2;
          else if (isWallCh(ch(x + 1, z))) yaw = -Math.PI / 2;
        }
        out.props.push({ x, z, kind, yaw });
        if (kind === "console") out.consoles.push({ x, z });
      } else if (c === "P") {
        grid.solid[i] = 1;
        const key = `${x},${z}`;
        if (!usedPair.has(key)) {
          if (ch(x + 1, z) === "P") {
            usedPair.add(`${x + 1},${z}`);
            out.props.push({ x: x + 0.5, z, kind: "sarcophagus", yaw: Math.PI / 2 });
          } else {
            if (ch(x, z + 1) === "P") usedPair.add(`${x},${z + 1}`);
            out.props.push({ x, z: ch(x, z + 1) === "P" ? z + 0.5 : z, kind: "sarcophagus", yaw: 0 });
          }
        }
      } else if (c === "k") out.keys.push({ x, z });
      else if (c === "p") {
        out.plates.push({ x, z });
        grid.avoid[i] = 1;
      } else if (c === "~") {
        out.noisy.push({ x, z });
        grid.noisy[i] = 1;
      } else if (c === "i") {
        const mounts: [number, number, number][] = [
          [0, -1, 0],
          [-1, 0, Math.PI / 2],
          [1, 0, -Math.PI / 2],
          [0, 1, Math.PI],
        ];
        let mounted = false;
        for (const [dx, dz, yaw] of mounts) {
          if (ch(x + dx, z + dz) === "#") {
            out.torches.push({ x, z, mx: x + dx * 0.5, mz: z + dz * 0.5, yaw });
            mounted = true;
            break;
          }
        }
        if (!mounted) out.problems.push(`lamp at ${x},${z} has no wall to hang on`);
      } else if (c === "w") out.moons.push({ x, z });
    }
  }
  for (const k of ["S", "X", "G"] as const) if (count[k] !== 1) out.problems.push(`the map needs exactly one ${k} (found ${count[k]})`);

  // The exit is solid until the thief carries the gem (the game opens it); guards never use it.
  grid.avoid[grid.idx(out.exit.x, out.exit.z)] = 1;

  // Murals on the camera-facing side of walls that close a room's north side.
  const torchMounts = new Set(out.torches.map((t) => `${t.mx},${t.mz}`));
  for (const wl of out.walls) {
    const below = ch(wl.x, wl.z + 1);
    if (below === " " || isWallCh(below)) continue;
    if ((wl.x * 7 + wl.z * 3) % 5 !== 0) continue;
    if (torchMounts.has(`${wl.x},${wl.z + 0.5}`)) continue;
    out.murals.push({ x: wl.x, z: wl.z + 0.5, yaw: 0 });
  }

  // Everything a level file can get wrong, caught here rather than in play.
  const walkable = (x: number, z: number) => grid.walkable(Math.round(x), Math.round(z));
  def.guards.forEach((g, gi) => {
    if (!g.route.length) out.problems.push(`guard ${gi} has no route`);
    g.route.forEach(([x, z]) => {
      if (!walkable(x, z)) out.problems.push(`guard ${gi} waypoint ${x},${z} is not open floor`);
      if (grid.inside(x, z) && grid.avoid[grid.idx(x, z)]) out.problems.push(`guard ${gi} waypoint ${x},${z} is on a pressure plate`);
    });
  });
  for (const c of def.cameras ?? []) if (!grid.inside(c.x, c.z) || grid.kind[grid.idx(c.x, c.z)] !== WALL) out.problems.push(`camera at ${c.x},${c.z} is not on a wall`);
  for (const l of def.lasers ?? []) {
    for (const c of laserCells(l)) {
      for (const k of l.move ? [0, 1] : [0]) {
        const x = c.x + (l.move?.dx ?? 0) * k;
        const z = c.z + (l.move?.dz ?? 0) * k;
        if (!walkable(x, z)) out.problems.push(`laser cell ${x},${z} is not open floor`);
      }
    }
  }
  for (const d of def.drones ?? []) {
    if (d.route.length < 2) out.problems.push("a drone needs at least two points");
    for (const [x, z] of d.route) if (!grid.inside(x, z)) out.problems.push(`drone waypoint ${x},${z} is off the map`);
  }

  computeLight(out);
  return out;
}

export const TORCH_RADIUS = 3.6;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Brightness per cell: dark by default, lamp pools, moonlight, the spotlight on the target. */
function computeLight(p: Parsed) {
  const { grid } = p;
  for (let z = 0; z < grid.h; z++) {
    for (let x = 0; x < grid.w; x++) {
      let l = 0.12;
      for (const t of p.torches) {
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < TORCH_RADIUS) l += 0.95 * smooth(1 - d / TORCH_RADIUS);
      }
      for (const m of p.moons) {
        const d = Math.max(Math.abs(x - m.x), Math.abs(z - m.z));
        if (d === 0) l += 0.75;
        else if (d === 1) l += 0.12;
      }
      const dt = Math.hypot(x - p.target.x, z - p.target.z);
      if (dt < 2.2) l += 0.45 * smooth(1 - dt / 2.2);
      grid.light[grid.idx(x, z)] = Math.min(1, l);
    }
  }
}
