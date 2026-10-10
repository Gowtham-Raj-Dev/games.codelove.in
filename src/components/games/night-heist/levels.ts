import { FLOOR, Grid, VOID, WALL, type Vec2 } from "./grid";

/**
 * The eight heists. Each map is ASCII, one character per cell, north at the top (the camera looks
 * north). Legend:
 *
 *   #  wall                 .  floor               (space) outside
 *   S  thief start          X  exit door (in a wall line)
 *   G  target gem on its pedestal
 *   $  coin stack (floor)   j  small jar   b  Bastet figurine   g  loose gem   (the last three on plinths)
 *   A  Anubis   T  Bastet   R  Ra   O  obelisk   C  column   J  great urn   c  crates   B  bookcase
 *      — all of these block sight: hide behind them
 *   d  desk   K  security console   P  sarcophagus (two cells)   =  rope barrier   — low: guards see over them
 *   D  locked door (needs a key card)   k  key card
 *   p  pressure plate       i  torch (lights the cell; the sconce goes on a neighbouring wall)
 *   w  moonlight
 */

export type LootKind = "coins" | "jar" | "figurine" | "gem";
export const LOOT_VALUE: Record<LootKind, number> = { coins: 150, jar: 250, figurine: 400, gem: 600 };
export const LOOT_NAME: Record<LootKind, string> = { coins: "Gold coins", jar: "Canopic jar", figurine: "Bastet figurine", gem: "Loose gem" };
export const TARGET_VALUE = 2000;

export type GemColor = "red" | "green" | "blue";

/** Waypoint: [x, z, seconds to stand and look around, direction to face while standing (degrees: 0 south, 90 east, 180 north, 270 west)]. */
export type Waypoint = [number, number] | [number, number, number] | [number, number, number, number];

export interface GuardDef {
  /** Loops through the points (two points = back and forth). One point = a fixed post. */
  route: Waypoint[];
  kind?: "guard" | "warden";
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
  on: number;
  off: number;
  phase?: number;
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
  /** Rugs: centre x, z and 0 (3 wide) or 1 (turned, 3 deep). */
  rugs?: [number, number, number][];
  /** Office-floor rectangles [x1, z1, x2, z2]. */
  office?: [number, number, number, number][];
  webs?: [number, number][];
  /** Throwing coins at the start. */
  coins: number;
  /** Par time in seconds. */
  par: number;
  /** Total loot value (best of every heist) needed to open this case. */
  unlock: number;
  /** Debug only: a scripted route the test bot follows. */
  solution?: string[];
}

export type PropKind =
  | "anubis"
  | "bastet"
  | "ra"
  | "obelisk"
  | "column"
  | "urn"
  | "crates"
  | "bookcase"
  | "desk"
  | "console"
  | "sarcophagus"
  | "rope"
  | "pedestal"
  | "plinth";

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
  doors: (Vec2 & { axis: "x" | "z" })[];
  keys: Vec2[];
  consoles: Vec2[];
  murals: (Vec2 & { yaw: number })[];
  lootTotal: number;
  valueTotal: number;
}

const OPAQUE_PROPS: Record<string, PropKind> = { A: "anubis", T: "bastet", R: "ra", O: "obelisk", C: "column", J: "urn", c: "crates", B: "bookcase" };
const LOW_PROPS: Record<string, PropKind> = { d: "desk", K: "console", "=": "rope" };
const LOOT_CHARS: Record<string, LootKind> = { $: "coins", j: "jar", b: "figurine", g: "gem" };

export const deg = (d: number) => (d * Math.PI) / 180;

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
    doors: [],
    keys: [],
    consoles: [],
    murals: [],
    lootTotal: 0,
    valueTotal: TARGET_VALUE,
  };
  const inOffice = (x: number, z: number) => (def.office ?? []).some(([x1, z1, x2, z2]) => x >= x1 && x <= x2 && z >= z1 && z <= z2);
  const usedPair = new Set<string>();

  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const c = ch(x, z);
      const i = grid.idx(x, z);
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
        for (const [dx, dz] of dirs) {
          const n = ch(x + dx, z + dz);
          if (n !== " " && !isWallCh(n)) {
            out.exit = { x, z, yaw: Math.atan2(dx, dz), inside: { x: x + dx, z: z + dz } };
            break;
          }
        }
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
      } else if (c === "S") out.start = { x, z };
      else if (c === "G") {
        out.target = { x, z };
        grid.solid[i] = 1;
        out.props.push({ x, z, kind: "pedestal", yaw: 0 });
      } else if (LOOT_CHARS[c]) {
        const kind = LOOT_CHARS[c];
        const plinth = kind !== "coins";
        out.loot.push({ x, z, kind, plinth });
        out.lootTotal++;
        out.valueTotal += LOOT_VALUE[kind];
        if (plinth) {
          grid.solid[i] = 1;
          out.props.push({ x, z, kind: "plinth", yaw: 0 });
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
      } else if (c === "i") {
        const mounts: [number, number, number][] = [
          [0, -1, 0],
          [-1, 0, Math.PI / 2],
          [1, 0, -Math.PI / 2],
          [0, 1, Math.PI],
        ];
        for (const [dx, dz, yaw] of mounts) {
          if (ch(x + dx, z + dz) === "#") {
            out.torches.push({ x, z, mx: x + dx * 0.5, mz: z + dz * 0.5, yaw });
            break;
          }
        }
      } else if (c === "w") out.moons.push({ x, z });
    }
  }

  // The exit is solid until the thief carries the gem (the engine opens it); guards never use it.
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

  computeLight(out);
  return out;
}

/** Brightness per cell: dark by default, torch pools, moonlight, the museum spotlight on the target. */
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

export const TORCH_RADIUS = 3.6;
const smooth = (t: number) => t * t * (3 - 2 * t);

// --- The heists -------------------------------------------------------------------------------------

export const LEVELS: LevelDef[] = [
  {
    name: "Closing Time",
    place: "Main gallery",
    target: { name: "Scarab Emerald", gem: "green" },
    brief: "The museum just closed. Two night guards walk their rounds. Lift the Scarab Emerald from the main gallery and leave through the side door.",
    intro: [
      "Guards see along their torch beams — stay out of the cones.",
      "Columns block their view: wait behind one while a guard passes.",
      "Hold Shift to sneak: slow, but silent.",
    ],
    map: [
      "########################",
      "#i....#i....G....i#...i#",
      "#.....#...........#....#",
      "#..$..#..C.....C..#..j.#",
      "#.....#...........#....#",
      "###.###...........###.##",
      "#......................#",
      "#i...C...........C....i#",
      "#......................#",
      "####.####.....####.#####",
      "#..w....#.....#........#",
      "#.......#..S..#....$...#",
      "#.......#.....#........#",
      "####X####.....##########",
      "########################",
    ],
    guards: [
      { route: [[2, 8, 2], [21, 8, 2]] },
      { route: [[8, 2, 2], [8, 4], [16, 4], [16, 2, 2]] },
    ],
    rugs: [[11, 11.5, 1], [12, 3, 0]],
    coins: 3,
    par: 75,
    unlock: 0,
  },
  {
    name: "Hall of Anubis",
    place: "Jackal hall",
    target: { name: "Eye of Anubis", gem: "red" },
    brief: "A guard stands at the sanctum door all night. Toss a coin to send him off, then slip past the jackal statues into the dark.",
    intro: ["Click a spot to throw a coin — guards go and check the noise.", "Shadows hide you: in the dark, guards only spot you up close."],
    map: [
      "############################",
      "#..i#....i....G....i...#i..#",
      "#...#........===.......#...#",
      "#.$.#..A...T.....T...A.#.b.#",
      "#...#..................#...#",
      "##.##########.#########.##.#",
      "#.......i...........i......#",
      "#...A.....A......A.....A...#",
      "#..........................#",
      "#..........................#",
      "###.####################.###",
      "#.....#             #......#",
      "#..S..#             #..j...#",
      "#..w..#             #......#",
      "#######             ###X####",
    ],
    guards: [
      { route: [[14, 6, 0, 0]] },
      { route: [[6, 2, 2], [6, 4], [22, 4], [22, 2, 2]] },
    ],
    rugs: [[14, 8, 0]],
    coins: 4,
    par: 100,
    unlock: 1500,
  },
  {
    name: "Gallery of Bastet",
    place: "Cat gallery",
    target: { name: "Moon of Bastet", gem: "blue" },
    brief: "New security: cameras sweep the cat gallery and a laser gate seals the vault. Watch the rhythm, then move.",
    intro: ["Cameras sweep back and forth — their cones work like a guard's.", "Laser gates switch on and off. Cross while they are dark.", "Statues block cameras too."],
    map: [
      "##########################",
      "#..i..#i.....G....i#.i...#",
      "#.$...#.....===....#..j..#",
      "#.....#.g..........#.....#",
      "###.#########.########.###",
      "#.......i.........i......#",
      "#........................#",
      "#...T....T.....T....T....#",
      "#........................#",
      "#...........$............X",
      "#...T....T.....T....T....#",
      "#........................#",
      "###.######################",
      "#.....#                   ",
      "#..S..#                   ",
      "#..w..#                   ",
      "#######                   ",
    ],
    guards: [{ route: [[2, 6, 1.5], [23, 6, 1.5], [23, 11, 1.5], [2, 11, 1.5]] }],
    cameras: [
      { x: 6, z: 4, dir: 20, sweep: 80, period: 9 },
      { x: 20, z: 4, dir: -20, sweep: 80, period: 9, phase: 0.5 },
    ],
    lasers: [
      { x1: 3, z1: 12, x2: 3, z2: 12, axis: "x", on: 1.6, off: 1.6 },
      { x1: 13, z1: 4, x2: 13, z2: 4, axis: "x", on: 2.4, off: 1.8, phase: 0.3 },
    ],
    rugs: [[13, 8.5, 0]],
    coins: 4,
    par: 110,
    unlock: 4000,
  },
  {
    name: "Treasury of Ra",
    place: "Sun treasury",
    target: { name: "Heart of Ra", gem: "red" },
    brief: "The treasury floor is laid with pressure plates. One safe path winds through, and moonlight falls on part of it.",
    intro: ["Pressure plates (the dark wooden slabs) ring the alarm. Find the safe path.", "Moonlight is as bright as a torch — cross it quickly."],
    map: [
      "##########################",
      "#.i.#i....R.G.R.....i#.i.#",
      "#.$.#................#.b.#",
      "#...#ppppp...pppppppp#...#",
      "#...#ppp...ppp..$pppp#...#",
      "#...#ppp.ppppp.pppppp#...#",
      "#...#ppp....ww...pppp#...#",
      "#...#ppp.ppppppp.pppp#...#",
      "#...#ppppppp.....pppp#...#",
      "#...#i..............i#...#",
      "##.#########.##########.##",
      "#......i.........i.......#",
      "X........................#",
      "#........................#",
      "###########...############",
      "###########.S.############",
      "##########################",
    ],
    guards: [
      { route: [[6, 2, 2], [19, 2, 2]] },
      { route: [[2, 12, 1.5], [23, 12, 1.5]] },
      { route: [[2, 9, 2, 0], [2, 4, 2]], kind: "warden" },
    ],
    coins: 4,
    par: 120,
    unlock: 6500,
  },
  {
    name: "Security Wing",
    place: "Offices & vault",
    target: { name: "Pharaoh's Seal", gem: "green" },
    brief: "The vault sits behind a locked door. A key card lies in one of the offices, and the console in the guard room can blind the cameras.",
    intro: ["Pick up a key card (E) to open a locked vault door.", "Use the security console to switch off every camera.", "Sneak up behind a guard and press E to knock him out."],
    map: [
      "############################",
      "#i..B#B..i...B#..i.#.i...i.#",
      "#.d..#..d.k.d.#.d..#.......#",
      "#....#........#....#..g....#",
      "#....#........#....#.......#",
      "##.####.#######.####.......#",
      "#..................D.......#",
      "#..................#...G...#",
      "#..................#.......#",
      "####.########.######.......#",
      "#........#.....c...#.......#",
      "#.K.d....#..c....c.#...j...#",
      "#........#.....c...#.......#",
      "#i.......#c........#i.....i#",
      "####X###############.......#",
      "                   #########",
    ],
    guards: [
      { route: [[2, 7, 1.5], [17, 7, 1.5]] },
      { route: [[5, 11, 0, 270]], kind: "warden" },
      { route: [[21, 4, 1.5], [26, 4], [26, 12, 1.5], [21, 12]] },
      { route: [[11, 11, 2], [18, 11, 2]] },
    ],
    cameras: [
      { x: 10, z: 5, dir: 0, sweep: 90, period: 8 },
      { x: 17, z: 5, dir: 0, sweep: 90, period: 8, phase: 0.5 },
    ],
    office: [
      [1, 1, 19, 13],
      [20, 1, 26, 14],
    ],
    coins: 4,
    par: 140,
    unlock: 9500,
  },
  {
    name: "The Storerooms",
    place: "Crate maze",
    target: { name: "Tear of Isis", gem: "blue" },
    brief: "Below the galleries, crates stand in tall rows and four guards walk the aisles. It is dark down here — use it.",
    intro: ["Crate stacks hide you completely.", "Wardens (grey suits) walk faster."],
    map: [
      "############################",
      "#i.....#..........#.......i#",
      "#.c.c..#.cc.cc.cc.#..c.c...#",
      "#......#..........#........#",
      "#.c.c..#.cc.cc.cc.#..c.c.$.#",
      "#..................G.......#",
      "#.c.c..#.cc.cc.cc.#..c.c...#",
      "#.$....#..........#........#",
      "####.###.cc.cc.cc.###.######",
      "#.......................i..#",
      "#.cc.cc.cc.cc.cc.cc.cc.cc..#",
      "#..........j...............#",
      "#.cc.cc.cc.cc.cc.cc.cc.cc..#",
      "#i.........................#",
      "##X#####################S###",
      "############################",
    ],
    guards: [
      { route: [[1, 9, 1.5], [26, 9, 1.5]] },
      { route: [[26, 13, 1], [1, 13, 1]], kind: "warden", speed: 1.8 },
      { route: [[8, 1, 1.5], [17, 1], [17, 7, 1.5], [8, 7]] },
      { route: [[19, 3, 1.5], [26, 3], [26, 6, 1.5], [19, 6]], kind: "warden", speed: 1.8 },
    ],
    webs: [[1, 1], [26, 1], [1, 13]],
    coins: 5,
    par: 150,
    unlock: 12500,
  },
  {
    name: "Obelisk Court",
    place: "Moonlit courtyard",
    target: { name: "Star of Thoth", gem: "green" },
    brief: "An open courtyard under the full moon. Obelisks cast the only shadows, cameras watch from the walls and laser gates guard the shrine.",
    intro: ["Out in the moonlight you are seen from far away. Hop from shadow to shadow."],
    map: [
      "############################",
      "#i.....#....i.G.i....#....i#",
      "#..j...#.....===.....#..$..#",
      "#......#.............#.....#",
      "###.#######.....#######.####",
      "#..........#.....#.........#",
      "#..ww..O...#.....#...O..ww.#",
      "#..ww......#.....#......ww.#",
      "#......O.................O.#",
      "#.....................b....#",
      "#..ww..O.......O.......ww..#",
      "#..ww...................ww.#",
      "#......O.....w.w.......O...#",
      "#..........................#",
      "#####X########S#############",
      "############################",
    ],
    guards: [
      { route: [[1, 13, 1.5], [26, 13, 1.5]] },
      { route: [[13, 5, 2], [13, 13, 2]], kind: "warden" },
      { route: [[9, 1, 2], [19, 1, 2]] },
    ],
    cameras: [
      { x: 0, z: 9, dir: 90, sweep: 70, period: 8 },
      { x: 27, z: 9, dir: 270, sweep: 70, period: 8, phase: 0.5 },
    ],
    lasers: [
      { x1: 12, z1: 4, x2: 16, z2: 4, on: 2.2, off: 2.0 },
      { x1: 3, z1: 4, x2: 3, z2: 4, axis: "x", on: 1.6, off: 1.8, phase: 0.5 },
      { x1: 24, z1: 4, x2: 24, z2: 4, axis: "x", on: 1.6, off: 1.8 },
    ],
    coins: 5,
    par: 150,
    unlock: 15500,
  },
  {
    name: "Pharaoh's Vault",
    place: "The inner vault",
    target: { name: "Crown Jewel of Khufu", gem: "red" },
    brief: "The final job. Key cards, lasers, plates, cameras and the best guards in the museum stand between you and the Crown Jewel.",
    intro: ["Everything you have learned. Plan from the overview (Q) before you move."],
    map: [
      "##############################",
      "#i...B#..i....R.G.R....i#B..i#",
      "#.d.k.#.........=.......#.d..#",
      "#.....#..A...........A..#..b.#",
      "#.....#.....pppppppp....#....#",
      "##.####...C.p......p.C..####D#",
      "#.......D...p.pppp.p.........#",
      "#.......#...p.p..p.p...#.....#",
      "#.......#.C.....P.p..C.#.....#",
      "#.......#.......P.p....#..$..#",
      "#.c.c...###.########.###.....#",
      "#.......#...i........i......K#",
      "#.c.c...#....................#",
      "#.....j.#..A....T.....A......#",
      "#.......#....................#",
      "####X####.........S..........#",
      "##############################",
    ],
    guards: [
      { route: [[10, 2, 2], [22, 2, 2]] },
      { route: [[9, 11, 1.5], [27, 11, 1], [27, 14, 1.5], [9, 14, 1]], kind: "warden", speed: 1.7 },
      { route: [[2, 6, 1.5], [6, 6], [6, 14, 1.5], [2, 14]] },
      { route: [[26, 6, 1.5], [26, 9, 1.5]] },
      { route: [[10, 6, 2, 180], [10, 9, 1.5]], kind: "warden" },
    ],
    cameras: [
      { x: 8, z: 10, dir: 0, sweep: 90, period: 9 },
      { x: 23, z: 10, dir: 0, sweep: 90, period: 9, phase: 0.5 },
      { x: 13, z: 0, dir: 0, sweep: 60, period: 7 },
    ],
    lasers: [
      { x1: 9, z1: 10, x2: 10, z2: 10, on: 2, off: 2 },
      { x1: 15, z1: 10, x2: 15, z2: 10, axis: "x", on: 1.8, off: 2.2, phase: 0.4 },
    ],
    office: [
      [1, 1, 5, 4],
      [25, 1, 28, 4],
    ],
    coins: 5,
    par: 200,
    unlock: 19000,
  },
];
