import type { SkyColors } from "./fx";
import { M } from "./manifest";
import { rng, type RailShape, type Rng } from "./rail";

/**
 * The campaign: five sectors of seven missions (the seventh is the sector's boss). A mission is a
 * rail shape, its sector's sky and scenery, and a scripted list of events along the rail (`at` is
 * the rail distance where the event happens). Missions are written as a short list of "beats"
 * (a wave, a rock field, a gate…); where things sit comes from a seeded random generator, so a
 * mission plays the same every time and can be learned.
 */

export type ShipType = "speeder" | "dart" | "raider" | "gunship" | "cargo" | "miner" | "wasp" | "ace" | "layer";
export type Pattern = "swoop" | "line" | "vee" | "hover" | "chase" | "dive" | "orbit" | "snake" | "strafe";
export type Drop = "ring" | "bomb" | "laser";
export type Scenery = "belt" | "graveyard" | "nebula" | "trench" | "armada";
export type MissionType = "strike" | "rings" | "convoy" | "gauntlet" | "boss";
export type BossKind = "drill" | "warden" | "queen" | "core" | "dreadnought";
export type GateMode = "rows" | "cols" | "cross" | "blink";

export type StageEvent =
  | { at: number; kind: "wave"; type: ShipType; pattern: Pattern; count: number; x: number; y: number; side: 1 | -1 }
  | { at: number; kind: "cargo"; type: "cargo" | "miner"; x: number; y: number; side: 1 | -1; drop: Drop }
  | { at: number; kind: "rocks"; count: number; len: number; crystals: number; tight?: boolean }
  | { at: number; kind: "meteors"; count: number; side: 1 | -1 }
  | { at: number; kind: "ring"; x: number; y: number }
  | { at: number; kind: "tower"; x: number; y: number; turrets: number }
  | { at: number; kind: "satellite"; model: string; x: number; y: number; size: number }
  | { at: number; kind: "mines"; count: number; x: number; y: number }
  /** `open`: a gate out in space (between two pylons) instead of across the trench. */
  | { at: number; kind: "gate"; mode: GateMode; seed: number; open: boolean }
  | { at: number; kind: "girder"; y: number; x: number; vertical: boolean; open: boolean }
  | { at: number; kind: "wallTurret"; side: 1 | -1; y: number }
  | { at: number; kind: "sentry"; x: number; y: number }
  | { at: number; kind: "checkpoint" }
  | { at: number; kind: "message"; text: string; sub?: string };

export interface StageDef {
  /** Index in the whole campaign (0-based). */
  id: number;
  sector: number;
  /** Index inside its sector (0-based). */
  mission: number;
  type: MissionType;
  name: string;
  brief: string;
  rail: RailShape;
  length: number;
  /** Rail distance of the mid-mission checkpoint (-1: none). */
  checkpoint: number;
  sky: SkyColors;
  fog: string;
  sun: string;
  ambient: string;
  scenery: Scenery;
  boss: BossKind | null;
  bossName: string;
  /** Difficulty, 0 (first mission) to about 2.6 (last): enemy fire rate, shot speed, boss health. */
  tier: number;
  /** Cruise speed, as a multiple of the normal one (ring runs are faster). */
  speed: number;
  /** Targets the medals are counted against (ships, turrets, mines, crystals… and rings on a ring run). */
  par: number;
  /** Credits for clearing it (before the medal bonus). */
  reward: number;
  events: StageEvent[];
}

export interface SectorDef {
  id: string;
  name: string;
  short: string;
  blurb: string;
  /** Colour of its chip on the mission map. */
  color: string;
  scenery: Scenery;
  sky: SkyColors;
  fog: string;
  sun: string;
  ambient: string;
  boss: BossKind;
  bossName: string;
}

/** Box the ship can fly in (rail-local metres). */
export const BOX = { x: 8, y: 4.8 };
export const TRENCH = { halfWidth: 12.5, floor: -7.5, wallTop: 9 };
export const MISSIONS_PER_SECTOR = 7;

export const MISSION_LABEL: Record<MissionType, string> = {
  strike: "Strike",
  rings: "Ring run",
  convoy: "Convoy raid",
  gauntlet: "Gauntlet",
  boss: "Boss",
};

export const SECTORS: SectorDef[] = [
  {
    id: "belt",
    name: "Asteroid Belt",
    short: "Belt",
    blurb: "Tumbling rocks, crystal asteroids and raider patrols.",
    color: "#ffb86b",
    scenery: "belt",
    sky: { top: "#05061a", mid: "#120a2e", bottom: "#04030c", nebulaA: "#3b1a6e", nebulaB: "#0e5a7a" },
    fog: "#0d0a24",
    sun: "#ffd9a8",
    ambient: "#6a5acd",
    boss: "drill",
    bossName: "Titan Drill",
  },
  {
    id: "graveyard",
    name: "Satellite Graveyard",
    short: "Graveyard",
    blurb: "Dead satellites, minefields and derelict gun towers.",
    color: "#7dd3fc",
    scenery: "graveyard",
    sky: { top: "#020814", mid: "#0b1a2a", bottom: "#02040a", nebulaA: "#0f4c5c", nebulaB: "#5c1a4a" },
    fog: "#06121f",
    sun: "#cfe8ff",
    ambient: "#3a6b8a",
    boss: "warden",
    bossName: "Orbital Warden",
  },
  {
    id: "nebula",
    name: "Crystal Nebula",
    short: "Nebula",
    blurb: "Glowing crystal reefs, wasp swarms and prism gates.",
    color: "#5eead4",
    scenery: "nebula",
    sky: { top: "#04121c", mid: "#0c2a3a", bottom: "#03060c", nebulaA: "#0f7a6e", nebulaB: "#7a1a8a" },
    fog: "#071a24",
    sun: "#d8fff0",
    ambient: "#3aa08a",
    boss: "queen",
    bossName: "Prism Queen",
  },
  {
    id: "trench",
    name: "Station Trench",
    short: "Trench",
    blurb: "Wall turrets, crossbeams and laser grids inside the station.",
    color: "#f0abfc",
    scenery: "trench",
    sky: { top: "#0a0412", mid: "#1d0b26", bottom: "#05020a", nebulaA: "#6e1a4a", nebulaB: "#1a3a6e" },
    fog: "#120818",
    sun: "#ffc4e8",
    ambient: "#8a4a8a",
    boss: "core",
    bossName: "Station Core",
  },
  {
    id: "armada",
    name: "Nova Armada",
    short: "Armada",
    blurb: "The enemy fleet: ace pilots, sentries, minelayers and its flagship.",
    color: "#fb7185",
    scenery: "armada",
    sky: { top: "#140406", mid: "#2a0c0e", bottom: "#070203", nebulaA: "#7a2a12", nebulaB: "#5a1030" },
    fog: "#1a090b",
    sun: "#ffd0a0",
    ambient: "#a0503a",
    boss: "dreadnought",
    bossName: "Nova Dreadnought",
  },
];

const SATELLITES = [M.mgs, M.wfpc, M.mro, M.rover, M.tdrs, M.grace, M.seastar, M.jupiterC];

/** Rail a beat takes up after its `at` (so the next one starts clear of it). */
const SPAN: Record<Pattern, number> = { swoop: 150, line: 160, vee: 165, hover: 205, chase: 195, dive: 155, orbit: 225, snake: 150, strafe: 225 };

type GirderSpot = "high" | "low" | "mid" | "left" | "right" | "center";

/** Lays a mission's beats along the rail. Every call places one beat at the cursor and moves it on. */
class Track {
  readonly events: StageEvent[] = [];
  /** Rings placed (they are the targets of a ring run). */
  rings = 0;
  private at = 210;
  private readonly open: boolean;

  constructor(
    private readonly r: Rng,
    scenery: Scenery,
  ) {
    this.open = scenery !== "trench";
  }

  get cursor() {
    return this.at;
  }

  private side() {
    return this.r.sign() as 1 | -1;
  }

  private round(v: number) {
    return Math.round(v * 10) / 10;
  }

  gap(n: number) {
    this.at += n;
    return this;
  }

  /** A banner (new mechanics are introduced with one). */
  msg(text: string, sub?: string) {
    this.events.push({ at: this.at - 120, kind: "message", text, sub });
    return this;
  }

  wave(type: ShipType, pattern: Pattern, count: number) {
    this.events.push({ at: this.at, kind: "wave", type, pattern, count, x: 0, y: this.round(this.r.range(-1, 2)), side: this.side() });
    this.at += SPAN[pattern] + count * 6;
    return this;
  }

  /** A hauler that drops a pickup when destroyed. */
  cargo(drop: Drop, type: "cargo" | "miner" = "cargo") {
    this.events.push({ at: this.at, kind: "cargo", type, x: this.round(this.r.range(-4, 4)), y: this.round(this.r.range(0, 2.2)), side: this.side(), drop });
    this.at += 150;
    return this;
  }

  rocks(count: number, crystals = 0, tight = false) {
    const len = 90 + count * 10;
    this.events.push({ at: this.at, kind: "rocks", count, len, crystals, tight });
    this.at += len + 50;
    return this;
  }

  meteors(count: number) {
    this.events.push({ at: this.at, kind: "meteors", count, side: this.side() });
    this.at += count * 18 + 100;
    return this;
  }

  mines(count: number) {
    this.events.push({ at: this.at, kind: "mines", count, x: this.round(this.r.range(-2, 2)), y: this.round(this.r.range(-1, 1)) });
    this.at += count * 14 + 80;
    return this;
  }

  /** A derelict column at the edge of the flight box with turrets on its tip. */
  tower(turrets = 2) {
    const up = this.side();
    this.events.push({ at: this.at, kind: "tower", x: this.side() * this.round(this.r.range(8.6, 9.2)), y: up * this.round(this.r.range(2.5, 3.1)), turrets });
    this.at += 100;
    return this;
  }

  sat() {
    this.events.push({ at: this.at, kind: "satellite", model: this.r.pick(SATELLITES), x: this.round(this.r.range(-5, 5)), y: this.round(this.r.range(-2.6, 3)), size: this.round(this.r.range(6, 8.5)) });
    this.at += 85;
    return this;
  }

  /** A shield ring. */
  ring() {
    this.events.push({ at: this.at, kind: "ring", x: this.round(this.r.range(-3.5, 3.5)), y: this.round(this.r.range(-2.4, 2.6)) });
    this.rings++;
    this.at += 70;
    return this;
  }

  /** A line of rings weaving across the box. */
  slalom(n: number) {
    let x = this.r.range(-3, 3);
    let y = this.r.range(-1.5, 1.5);
    for (let i = 0; i < n; i++) {
      this.events.push({ at: this.at, kind: "ring", x: this.round(x), y: this.round(y) });
      this.rings++;
      this.at += 64;
      x = Math.max(-4.2, Math.min(4.2, x + this.side() * this.r.range(2.2, 4.6)));
      y = Math.max(-3, Math.min(3, y + this.side() * this.r.range(1, 2.6)));
    }
    this.at += 30;
    return this;
  }

  gate(mode: GateMode) {
    this.at += 70;
    this.events.push({ at: this.at, kind: "gate", mode, seed: this.r.int(1, 999), open: this.open });
    this.at += 90;
    return this;
  }

  girder(spot: GirderSpot) {
    const vertical = spot === "left" || spot === "right" || spot === "center";
    const x = spot === "left" ? -5 : spot === "right" ? 5 : 0;
    const y = spot === "high" ? 3 : spot === "low" ? -2.5 : 0;
    // Room to get clear of it after whatever came before.
    this.at += 40;
    this.events.push({ at: this.at, kind: "girder", x, y, vertical, open: this.open });
    this.at += 70;
    return this;
  }

  /** Trench only: turrets on the walls and the floor, on alternating sides. */
  wallTurrets(n = 2) {
    let side = this.side();
    for (let i = 0; i < n; i++) {
      this.events.push({ at: this.at, kind: "wallTurret", side, y: this.round(this.r.range(-3, 5)) });
      side = -side as 1 | -1;
      this.at += 40;
    }
    this.at += 30;
    return this;
  }

  /** A sniper platform: it aims, locks, then fires one heavy shot. */
  sentry() {
    this.events.push({ at: this.at, kind: "sentry", x: this.side() * this.round(this.r.range(4, 7)), y: this.round(this.r.range(-2.4, 3)) });
    this.at += 120;
    return this;
  }

  /** A minelayer flying ahead, dropping mines in the ship's path. */
  layer() {
    this.events.push({ at: this.at, kind: "wave", type: "layer", pattern: "hover", count: 1, x: this.round(this.r.range(-3, 3)), y: this.round(this.r.range(0, 2)), side: this.side() });
    this.at += 270;
    return this;
  }

  checkpoint() {
    this.events.push({ at: this.at, kind: "checkpoint" });
    this.at += 40;
    return this;
  }
}

interface MissionSpec {
  name: string;
  type: MissionType;
  brief: string;
  speed?: number;
  build: (t: Track) => void;
}

const m = (name: string, type: MissionType, brief: string, build: (t: Track) => void, speed?: number): MissionSpec => ({ name, type, brief, build, speed });

/** Seven missions per sector, in play order; the last one ends with the sector's boss. */
const MISSIONS: MissionSpec[][] = [
  // --- 1 · Asteroid Belt ---------------------------------------------------------------------------
  [
    m("First Flight", "strike", "A scouting run through the edge of the belt. Shoot the drones, steer round the rocks and fly through the gold rings to repair your shield.", (t) =>
      t
        .msg("Tap fire to shoot", "Steer to dodge the rocks")
        .wave("speeder", "swoop", 4)
        .rocks(5)
        .ring()
        .wave("speeder", "line", 4)
        .msg("Hold fire to lock on", "Sweep over targets, then let go")
        .wave("speeder", "swoop", 5)
        .checkpoint()
        .rocks(6, 1)
        .ring()
        .wave("dart", "vee", 3),
    ),
    m("Slipstream", "rings", "A marked channel through the rocks. Thread as many rings as you can — every ring counts towards your medal.", (t) =>
      t.msg("Ring run", "Fly through every ring").slalom(8).rocks(5).slalom(7).checkpoint().wave("speeder", "line", 3).slalom(8), 1.2),
    m("Rock Garden", "gauntlet", "The thick of the belt. Rocks drift across the lane and meteors cut through it from the side.", (t) =>
      t
        .msg("Barrel roll", "A roll knocks enemy shots away")
        .rocks(9, 1)
        .wave("dart", "swoop", 4)
        .meteors(5)
        .ring()
        .rocks(11, 2, true)
        .checkpoint()
        .meteors(6)
        .wave("speeder", "dive", 3)
        .rocks(8, 1)
        .ring(),
    ),
    m("Ore Convoy", "convoy", "Raider haulers are moving stolen ore. Destroy them for the upgrades they carry — their escorts will object.", (t) =>
      t
        .msg("Haulers", "They drop twin lasers and bombs")
        .cargo("laser")
        .wave("speeder", "swoop", 4)
        .cargo("ring")
        .rocks(6, 1)
        .checkpoint()
        .cargo("bomb")
        .wave("raider", "hover", 2)
        .cargo("ring", "miner")
        .wave("dart", "vee", 4),
    ),
    m("Raider Patrol", "strike", "A raider wing is sweeping the belt. Their heavier ships take a few hits, and the gunship takes many.", (t) =>
      t
        .wave("raider", "hover", 3)
        .rocks(7)
        .wave("dart", "vee", 5)
        .ring()
        .checkpoint()
        .wave("speeder", "chase", 3)
        .meteors(5)
        .wave("raider", "swoop", 4)
        .ring()
        .wave("gunship", "hover", 1),
    ),
    m("Meteor Storm", "gauntlet", "A storm front crosses the lane. Watch which side the warning names and get out of the way.", (t) =>
      t
        .meteors(6)
        .wave("speeder", "swoop", 4)
        .meteors(7)
        .ring()
        .rocks(10, 2, true)
        .checkpoint()
        .meteors(8)
        .wave("dart", "dive", 4)
        .cargo("bomb")
        .meteors(7)
        .ring(),
    ),
    m("Titan Drill", "boss", "The raiders' mining titan guards the way out of the belt. Break its gun pods, then its core — and stay out of the way when it rams.", (t) =>
      t
        .wave("speeder", "swoop", 5)
        .rocks(8, 2)
        .cargo("laser")
        .wave("raider", "hover", 3)
        .ring()
        .wave("dart", "vee", 5)
        .cargo("bomb")
        .ring(),
    ),
  ],
  // --- 2 · Satellite Graveyard ---------------------------------------------------------------------
  [
    m("Dead Orbit", "strike", "Old satellites drift where a fleet once died. The mines between them still work.", (t) =>
      t
        .msg("Minefield", "Mines drift towards you — shoot them early")
        .sat()
        .mines(5)
        .wave("dart", "swoop", 5)
        .sat()
        .ring()
        .tower(2)
        .wave("speeder", "line", 5)
        .checkpoint()
        .sat()
        .mines(6)
        .wave("raider", "hover", 3)
        .ring(),
    ),
    m("Scrap Run", "convoy", "Scavenger haulers are stripping the wrecks. Take them out before they jump away.", (t) =>
      t
        .cargo("laser")
        .sat()
        .wave("dart", "orbit", 5)
        .cargo("bomb", "miner")
        .tower(2)
        .checkpoint()
        .cargo("ring")
        .wave("raider", "chase", 3)
        .cargo("ring")
        .sat(),
    ),
    m("Debris Slalom", "rings", "Survey rings mark a safe path through the wreckage. Follow them at speed.", (t) => t.slalom(7).sat().slalom(7).checkpoint().mines(5).slalom(8).sat(), 1.2),
    m("Turret Row", "strike", "Derelict towers line this stretch, and their turrets never stood down. Knock them out as you pass.", (t) =>
      t
        .msg("Gun towers", "Shoot the turrets — never fly into a tower")
        .tower(2)
        .tower(2)
        .wave("speeder", "dive", 4)
        .ring()
        .tower(3)
        .sat()
        .checkpoint()
        .wave("gunship", "chase", 2)
        .tower(2)
        .mines(6)
        .tower(3)
        .ring(),
    ),
    m("Minefield", "gauntlet", "The densest field in the graveyard. Clear a path with your lasers, or with a nova bomb.", (t) =>
      t
        .mines(7)
        .sat()
        .mines(8)
        .wave("dart", "swoop", 5)
        .ring()
        .checkpoint()
        .mines(8)
        .sat()
        .meteors(5)
        .mines(7)
        .ring(),
    ),
    m("Graveyard Shift", "strike", "The scavengers have called for help. Expect every kind of ship they have.", (t) =>
      t
        .wave("dart", "orbit", 6)
        .tower(2)
        .wave("raider", "swoop", 5)
        .cargo("laser")
        .sat()
        .ring()
        .checkpoint()
        .wave("gunship", "hover", 2)
        .mines(6)
        .wave("speeder", "vee", 7)
        .tower(3)
        .ring()
        .wave("raider", "chase", 3),
    ),
    m("Orbital Warden", "boss", "Something old is waking up in the middle of the graveyard. Destroy its dishes to open the core, and keep out of its sweeping beam.", (t) =>
      t
        .sat()
        .tower(2)
        .wave("dart", "swoop", 5)
        .mines(6)
        .cargo("laser")
        .ring()
        .wave("raider", "hover", 3)
        .tower(3)
        .cargo("bomb")
        .ring(),
    ),
  ],
  // --- 3 · Crystal Nebula --------------------------------------------------------------------------
  [
    m("Prism Drift", "strike", "A reef of glowing crystal inside the nebula. Wasp drones nest here — small, quick, and never alone.", (t) =>
      t
        .msg("Wasp drones", "Small, fast and many")
        .wave("wasp", "snake", 6)
        .rocks(6, 3)
        .wave("wasp", "snake", 7)
        .ring()
        .wave("dart", "vee", 5)
        .checkpoint()
        .rocks(8, 3)
        .wave("wasp", "snake", 8)
        .wave("raider", "hover", 3)
        .ring(),
    ),
    m("Light Fences", "gauntlet", "The crystals focus light into fences across the lane. Find the gap in each one.", (t) =>
      t
        .msg("Prism gate", "Fly through the gaps between the beams")
        .gate("rows")
        .wave("wasp", "snake", 6)
        .gate("cols")
        .ring()
        .rocks(7, 2)
        .checkpoint()
        .gate("cross")
        .wave("dart", "swoop", 5)
        .gate("blink")
        .ring(),
    ),
    m("Crystal Harvest", "convoy", "Miners are cutting crystal for the fleet's weapons. Stop the haul — and crack the crystals yourself for shield rings.", (t) =>
      t
        .cargo("laser")
        .rocks(6, 4)
        .cargo("bomb", "miner")
        .wave("wasp", "snake", 7)
        .checkpoint()
        .cargo("ring")
        .gate("rows")
        .cargo("ring", "miner")
        .wave("raider", "chase", 3),
    ),
    m("Aurora Run", "rings", "A ribbon of rings through the brightest part of the nebula, with a fence or two in the way.", (t) =>
      t.slalom(8).wave("wasp", "snake", 6).slalom(7).checkpoint().gate("cols").slalom(8).rocks(6, 2), 1.2),
    m("Hive Outskirts", "strike", "The swarms get thicker near the hive. Lock-on volleys clear a whole snake of wasps at once.", (t) =>
      t
        .wave("wasp", "snake", 8)
        .wave("wasp", "snake", 8)
        .wave("gunship", "hover", 2)
        .ring()
        .gate("rows")
        .checkpoint()
        .wave("wasp", "orbit", 6)
        .wave("raider", "swoop", 5)
        .cargo("laser")
        .wave("wasp", "snake", 9)
        .ring(),
    ),
    m("Shatter Point", "gauntlet", "Crystal reefs, meteor showers and light fences, all at once. Slow down with the brake if you need the time.", (t) =>
      t
        .rocks(12, 3, true)
        .gate("cross")
        .meteors(6)
        .wave("wasp", "snake", 7)
        .ring()
        .checkpoint()
        .gate("blink")
        .rocks(10, 3)
        .gate("cols")
        .wave("dart", "dive", 5)
        .meteors(7)
        .ring(),
    ),
    m("Prism Queen", "boss", "The hive's queen is a living crystal. Shatter the shards that orbit her, then the heart — and keep ahead of her sweeping light.", (t) =>
      t
        .wave("wasp", "snake", 8)
        .rocks(8, 3)
        .gate("rows")
        .cargo("laser")
        .wave("raider", "hover", 3)
        .ring()
        .wave("wasp", "orbit", 6)
        .cargo("bomb")
        .ring(),
    ),
  ],
  // --- 4 · Station Trench --------------------------------------------------------------------------
  [
    m("Into the Trench", "strike", "Dive into the station's service trench. The walls are armed and the crossbeams don't move for anyone.", (t) =>
      t
        .msg("Station trench", "Fly over or under the crossbeams")
        .wallTurrets(2)
        .wave("speeder", "line", 5)
        .girder("high")
        .ring()
        .wallTurrets(2)
        .wave("raider", "chase", 3)
        .checkpoint()
        .girder("left")
        .girder("right")
        .wallTurrets(2)
        .wave("dart", "swoop", 6)
        .ring(),
    ),
    m("Laser Grid", "gauntlet", "The station's security grid. Moving beams, blinking beams and crossed beams — read each gate before you reach it.", (t) =>
      t
        .msg("Laser gates", "Dim beams are off — bright ones burn")
        .gate("rows")
        .wallTurrets(2)
        .gate("cols")
        .ring()
        .girder("low")
        .girder("high")
        .checkpoint()
        .gate("cross")
        .mines(6)
        .gate("blink")
        .ring(),
    ),
    m("Supply Line", "convoy", "Armed tugs run supplies down the trench. They fire back in a fan — roll through it.", (t) =>
      t
        .cargo("laser", "miner")
        .wallTurrets(2)
        .cargo("ring")
        .girder("mid")
        .checkpoint()
        .cargo("bomb", "miner")
        .wave("gunship", "hover", 2)
        .cargo("ring")
        .gate("rows"),
    ),
    m("Service Tunnel", "rings", "Maintenance rings mark the fast line through the beams. Stay on it.", (t) =>
      t.slalom(7).girder("high").slalom(6).checkpoint().girder("left").slalom(7).wallTurrets(2).slalom(6), 1.15),
    m("Kill Zone", "strike", "The most heavily defended stretch of the trench: turrets on every wall and gunships overhead.", (t) =>
      t
        .wallTurrets(4)
        .wave("gunship", "hover", 2)
        .girder("center")
        .ring()
        .wave("speeder", "dive", 5)
        .wallTurrets(2)
        .checkpoint()
        .gate("rows")
        .wave("raider", "vee", 5)
        .wallTurrets(4)
        .wave("gunship", "chase", 2)
        .ring(),
    ),
    m("Lockdown", "gauntlet", "The station has sealed the trench. Every gate is live and the beams come in pairs.", (t) =>
      t
        .gate("blink")
        .girder("low")
        .girder("high")
        .wallTurrets(2)
        .gate("cross")
        .ring()
        .checkpoint()
        .mines(7)
        .girder("left")
        .girder("right")
        .gate("cols")
        .wave("dart", "swoop", 6)
        .gate("rows")
        .ring(),
    ),
    m("Station Core", "boss", "The end of the trench: the station's core. Destroy its four emitters to drop the shield plates, and fly through the gap in its laser fences.", (t) =>
      t
        .wallTurrets(2)
        .wave("speeder", "line", 5)
        .girder("high")
        .gate("rows")
        .cargo("laser", "miner")
        .ring()
        .wave("raider", "chase", 3)
        .girder("center")
        .cargo("bomb")
        .ring(),
    ),
  ],
  // --- 5 · Nova Armada -----------------------------------------------------------------------------
  [
    m("Picket Line", "strike", "The fleet's outer guard. Sentry platforms take one aimed shot at a time, and the first ace pilots are waiting.", (t) =>
      t
        .msg("Sentry", "It aims, locks, then fires — keep moving")
        .sentry()
        .wave("dart", "swoop", 6)
        .sentry()
        .wave("ace", "strafe", 1)
        .ring()
        .checkpoint()
        .wave("raider", "hover", 3)
        .sentry()
        .sentry()
        .wave("speeder", "vee", 7)
        .ring(),
    ),
    m("Mine Layers", "convoy", "Minelayers are seeding the lane ahead of you. Destroy them quickly — every second they live is another mine.", (t) =>
      t
        .msg("Minelayer", "It drops mines in your path")
        .layer()
        .wave("dart", "swoop", 5)
        .layer()
        .ring()
        .checkpoint()
        .cargo("bomb")
        .layer()
        .wave("ace", "strafe", 2)
        .cargo("laser"),
    ),
    m("Wreck Field", "gauntlet", "What is left of the last squadron that tried this. Broken spars hang across the lane and the debris is still moving.", (t) =>
      t
        .girder("high")
        .girder("low")
        .mines(7)
        .meteors(6)
        .ring()
        .checkpoint()
        .girder("left")
        .girder("right")
        .gate("rows")
        .wave("wasp", "snake", 8)
        .girder("mid")
        .ring(),
    ),
    m("Blockade Run", "rings", "A smuggler's line straight through the blockade. It is fast, narrow and watched.", (t) =>
      t.slalom(8).sentry().slalom(7).checkpoint().girder("high").slalom(8).mines(5).slalom(6), 1.25),
    m("Ace Squadron", "strike", "The fleet's best pilots, in red. They never hold still — lead them, or lock on.", (t) =>
      t
        .wave("ace", "strafe", 2)
        .wave("gunship", "hover", 2)
        .ring()
        .wave("ace", "strafe", 2)
        .wave("wasp", "snake", 9)
        .checkpoint()
        .tower(3)
        .wave("ace", "strafe", 3)
        .cargo("laser")
        .wave("raider", "swoop", 6)
        .ring()
        .wave("ace", "strafe", 2),
    ),
    m("Last Gate", "gauntlet", "The final defence line before the flagship: sentries, minelayers, spars and security gates, back to back.", (t) =>
      t
        .sentry()
        .gate("cross")
        .layer()
        .girder("low")
        .girder("high")
        .ring()
        .checkpoint()
        .gate("blink")
        .sentry()
        .sentry()
        .meteors(8)
        .wave("ace", "strafe", 2)
        .gate("cols")
        .mines(8)
        .ring(),
    ),
    m("Nova Dreadnought", "boss", "The flagship. Strip its gun batteries, burn out both reactors, then put everything into the core. Its lance fires where you are — never stop moving.", (t) =>
      t
        .wave("ace", "strafe", 2)
        .sentry()
        .wave("wasp", "snake", 9)
        .cargo("laser")
        .ring()
        .layer()
        .wave("gunship", "hover", 2)
        .cargo("bomb")
        .ring(),
    ),
  ],
];

function countPar(events: StageEvent[], rings: boolean) {
  let n = 0;
  for (const e of events) {
    if (e.kind === "wave") n += e.count;
    else if (e.kind === "cargo") n += 1;
    else if (e.kind === "tower") n += e.turrets;
    else if (e.kind === "mines") n += e.count;
    else if (e.kind === "wallTurret") n += 1;
    else if (e.kind === "sentry") n += 1;
    else if (e.kind === "satellite") n += 1;
    else if (e.kind === "rocks") n += e.crystals;
    else if (e.kind === "ring" && rings) n += 1;
  }
  return n;
}

function railFor(scenery: Scenery, r: Rng): RailShape {
  const phase = () => r.range(0, Math.PI * 2);
  if (scenery === "trench") {
    return {
      x: [{ amp: r.range(18, 24), len: r.range(1700, 2100), phase: phase() }],
      y: [{ amp: r.range(4, 6), len: r.range(1300, 1700), phase: phase() }],
    };
  }
  return {
    x: [
      { amp: r.range(26, 36), len: r.range(1250, 1650), phase: phase() },
      { amp: r.range(8, 11), len: r.range(500, 640), phase: phase() },
    ],
    y: [
      { amp: r.range(11, 17), len: r.range(1050, 1450), phase: phase() },
      { amp: r.range(3.5, 5.5), len: r.range(360, 480), phase: phase() },
    ],
  };
}

function buildStage(sector: number, mission: number): StageDef {
  const s = SECTORS[sector];
  const spec = MISSIONS[sector][mission];
  const id = sector * MISSIONS_PER_SECTOR + mission;
  const r = rng(1009 + id * 7919);
  const rail = railFor(s.scenery, r);
  const track = new Track(r, s.scenery);
  spec.build(track);
  const boss = spec.type === "boss" ? s.boss : null;
  const events = track.events.sort((a, b) => a.at - b.at);
  const cp = events.find((e) => e.kind === "checkpoint");
  const last = SECTORS.length * MISSIONS_PER_SECTOR - 1;
  return {
    id,
    sector,
    mission,
    type: spec.type,
    name: spec.name,
    brief: spec.brief,
    rail,
    // A boss arrives 200 m before the end; other missions end shortly after their last beat.
    length: Math.round(track.cursor + (boss ? 260 : 110)),
    checkpoint: cp ? cp.at : -1,
    sky: s.sky,
    fog: s.fog,
    sun: s.sun,
    ambient: s.ambient,
    scenery: s.scenery,
    boss,
    bossName: boss ? s.bossName : "",
    tier: (id / last) * 2.6,
    speed: spec.speed ?? 1,
    par: countPar(events, spec.type === "rings"),
    reward: 150 + sector * 60 + (boss ? 300 + sector * 100 : 0),
    events,
  };
}

export const STAGES: StageDef[] = SECTORS.flatMap((_, sector) => MISSIONS[sector].map((__, mission) => buildStage(sector, mission)));

/** Share of a mission's targets needed for silver and gold. */
export const SILVER = 0.6;
export const GOLD = 0.85;

/** Targets needed for a medal tier (2 silver, 3 gold). */
export const medalTarget = (stage: StageDef, tier: number) => Math.ceil(stage.par * (tier >= 3 ? GOLD : SILVER));

/** Medal for a cleared mission: 3 gold, 2 silver, 1 bronze. */
export function medalFor(stage: StageDef, hits: number) {
  if (stage.par <= 0) return 3;
  return hits >= medalTarget(stage, 3) ? 3 : hits >= medalTarget(stage, 2) ? 2 : 1;
}

/** Credits for clearing a mission with this medal. */
export const clearReward = (stage: StageDef, medal: number) => Math.round(stage.reward * [1, 1, 1.3, 1.7][Math.max(0, Math.min(3, medal))]);

export const MEDAL_NAMES = ["None", "Bronze", "Silver", "Gold"];

/** "2-5": sector and mission number as shown to the player. */
export const stageCode = (stage: StageDef) => `${stage.sector + 1}-${stage.mission + 1}`;
