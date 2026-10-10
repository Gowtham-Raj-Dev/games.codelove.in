/**
 * Kingdom Clash — battle simulation. Pure TypeScript (no three.js) so raids can run headlessly for
 * balancing. The 3D view reads positions from here every frame and listens to the events for
 * effects and sounds.
 *
 * Coordinates are tiles of the battle grid: the village (GRID × GRID) plus a deploy margin on every
 * side. Troops find their way with flow fields (Dijkstra from their target over the grid) in which
 * walls cost extra, so they walk around walls when that's shorter and break through when it isn't.
 */
import {
  BUILDINGS,
  GRID,
  isDefence,
  isHero,
  isResource,
  levelMul,
  MARGIN,
  SPELLS,
  unitDef,
  type AttackDef,
  type BKind,
  type HeroKind,
  type SpellKind,
  type UnitDef,
  type UnitKind,
} from "./data";

export const N = GRID + 2 * MARGIN;
export const STEP = 1 / 30;
const WALL_COST = 9;
/** A unit that starts fighting winds up this long before its first blow (the view swings meanwhile). */
const WINDUP = 0.3;
const SQRT2 = Math.SQRT2;

export interface SimBuildingInput {
  id: number;
  kind: BKind;
  level: number;
  /** Village tile (top-left). */
  x: number;
  z: number;
  gold?: number;
  elixir?: number;
  /** Being upgraded: doesn't fight back. */
  inactive?: boolean;
  /** Campaign "elite" bases: hitpoints and damage multiplier. */
  power?: number;
}

export class SB {
  readonly size: number;
  readonly cx: number;
  readonly cz: number;
  hp: number;
  readonly maxHp: number;
  dead = false;
  gold: number;
  elixir: number;
  readonly gold0: number;
  readonly elixir0: number;
  readonly atk: AttackDef | null;
  readonly damage: number;
  cooldown = 0.6;
  target: SU | null = null;
  yaw = 0;
  frozen = 0;
  /** Seconds since it last fired (recoil animation). */
  fired = 9;
  /** Seconds since it was last hit (health bar). */
  hitT = 99;
  /** Traps: seconds until the bomb goes off once triggered (-1 = armed). */
  fuse = -1;
  readonly counts: boolean;
  readonly isWall: boolean;
  readonly isTrap: boolean;
  readonly inactive: boolean;
  /** Hidden defences (Hidden Tesla) stay underground — unseen, untargetable, unhurt — until a troop comes close. */
  hidden: boolean;

  constructor(
    readonly index: number,
    readonly id: number,
    readonly kind: BKind,
    readonly level: number,
    /** Battle-grid tile of the top-left corner. */
    readonly x: number,
    readonly z: number,
    gold = 0,
    elixir = 0,
    inactive = false,
    power = 1,
  ) {
    const def = BUILDINGS[kind];
    this.size = def.size;
    this.cx = x + this.size / 2;
    this.cz = z + this.size / 2;
    this.maxHp = this.hp = Math.round((def.hp[Math.max(0, level - 1)] ?? def.hp[0]) * (def.trap ? 1 : power));
    this.gold = this.gold0 = gold;
    this.elixir = this.elixir0 = elixir;
    this.atk = def.attack ?? null;
    this.damage = (def.attack ? def.attack.damage[level - 1] : def.trap ? def.trap.damage[level - 1] : 0) * power;
    this.isWall = kind === "wall";
    this.isTrap = !!def.trap;
    this.counts = !this.isWall && !this.isTrap;
    this.inactive = inactive;
    this.hidden = !!def.hidden;
  }
}

export class SU {
  hp: number;
  readonly maxHp: number;
  readonly dmg: number;
  readonly def: UnitDef;
  dead = false;
  /** Seconds since death (the view plays the fall). */
  deadT = 0;
  target: SB | null = null;
  tUnit: SU | null = null;
  wall: SB | null = null;
  cooldown = 0.3;
  yaw = 0;
  moving = false;
  /** Fighting this step (the view winds a swing up as `cooldown` runs out). */
  attacking = false;
  private wasAttacking = false;
  /** Seconds since its last attack swing / shot (animation). */
  swing = 9;
  rage = 0;
  healT = 0;
  retarget = 0;
  /** Seconds left invisible (Elf Queen's Vanish): defences and defenders ignore it. */
  cloak = 0;
  /** Heroes: the ability has been used this battle. */
  abilityUsed = false;
  /** Guards (defending heroes, trap skeletons) stay near this point. */
  guard: { x: number; z: number; r: number } | null = null;
  readonly hero: boolean;
  beginStep() {
    this.wasAttacking = this.attacking;
    this.attacking = false;
  }

  /** Called while fighting: a fresh engagement winds up, so the first blow lands mid-swing. */
  engage() {
    if (!this.wasAttacking) this.cooldown = Math.max(this.cooldown, WINDUP);
    this.attacking = true;
  }

  /** Personal offset so a crowd doesn't walk in single file. */
  readonly ox: number;
  readonly oz: number;
  readonly radius: number;

  constructor(
    readonly id: number,
    readonly kind: UnitKind,
    readonly level: number,
    /** 0 = attacker, 1 = defender (your troops guarding your village). */
    readonly side: 0 | 1,
    public x: number,
    public z: number,
    rand: () => number,
  ) {
    this.def = unitDef(kind);
    this.maxHp = this.hp = Math.round(this.def.hp * levelMul(level));
    this.dmg = this.def.damage * levelMul(level);
    this.ox = (rand() - 0.5) * 0.5;
    this.oz = (rand() - 0.5) * 0.5;
    this.hero = isHero(kind);
    this.radius = this.def.housing >= 5 || this.hero ? 0.42 : 0.24;
  }
}

export type ProjectileKind = "cannonball" | "arrow" | "boulder" | "bolt" | "troop-arrow" | "troop-bolt";

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x0: number;
  z0: number;
  y0: number;
  x1: number;
  z1: number;
  y1: number;
  t: number;
  dur: number;
  dmg: number;
  splash: number;
  /** Who fired it: 0 hits buildings/defenders' side... see `hitsSide`. */
  hitsSide: 0 | 1 | -1;
  tU: SU | null;
  tB: SB | null;
  source: SU | SB | null;
  done: boolean;
}

export interface Zone {
  id: number;
  kind: SpellKind;
  level: number;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
  power: number;
  bolts: number;
}

export interface SimEvents {
  shot?(b: SB, p: Projectile): void;
  troopShot?(u: SU, p: Projectile): void;
  impact?(p: Projectile): void;
  hit?(u: SU, target: SB | SU): void;
  damaged?(b: SB, dmg: number): void;
  destroyed?(b: SB): void;
  died?(u: SU): void;
  trap?(b: SB): void;
  loot?(b: SB, gold: number, elixir: number): void;
  spell?(z: Zone): void;
  bolt?(x: number, z: number): void;
  explode?(u: SU): void;
  heal?(u: SU, target: SU): void;
  deployed?(u: SU): void;
  ability?(u: SU): void;
  sprung?(b: SB, u: SU): void;
  /** A hidden defence springs up. */
  reveal?(b: SB): void;
  /** A Hidden Tesla's shock: the troop it hit first, then the ones it jumped to. */
  zap?(b: SB, hits: SU[]): void;
}

export interface SimSetup {
  mode: "raid" | "defence";
  buildings: SimBuildingInput[];
  /** Seconds. */
  timeLimit: number;
  /** Troops you can deploy, by kind with their level. */
  troops: { kind: UnitKind; level: number; count: number }[];
  spells: { kind: SpellKind; level: number; count: number }[];
  /** Units defending from the start (heroes at their altars), village tiles; hp is a 0..1 share. */
  guards?: { kind: UnitKind; level: number; x: number; z: number; r: number; hp?: number }[];
  seed?: number;
}

export interface SimResult {
  stars: number;
  percent: number;
  gold: number;
  elixir: number;
  thDown: boolean;
  time: number;
  used: Partial<Record<UnitKind, number>>;
  spellsUsed: Partial<Record<SpellKind, number>>;
  /** Defence: defenders still standing (they go back to the camps). */
  survivors: Partial<Record<UnitKind, number>>;
  raidersKilled: number;
  raiders: number;
  /** The player's heroes that fought: health left (0..1). */
  heroHp: Partial<Record<HeroKind, number>>;
}

class Heap {
  idx: number[] = [];
  pri: number[] = [];
  push(i: number, p: number) {
    const { idx, pri } = this;
    let k = idx.length;
    idx.push(i);
    pri.push(p);
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (pri[parent] <= p) break;
      idx[k] = idx[parent];
      pri[k] = pri[parent];
      k = parent;
    }
    idx[k] = i;
    pri[k] = p;
  }
  pop(): [number, number] | null {
    const { idx, pri } = this;
    if (!idx.length) return null;
    const top: [number, number] = [idx[0], pri[0]];
    const li = idx.pop()!;
    const lp = pri.pop()!;
    if (idx.length) {
      let k = 0;
      const n = idx.length;
      for (;;) {
        const l = 2 * k + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && pri[r] < pri[l] ? r : l;
        if (pri[c] >= lp) break;
        idx[k] = idx[c];
        pri[k] = pri[c];
        k = c;
      }
      idx[k] = li;
      pri[k] = lp;
    }
    return top;
  }
  clear() {
    this.idx.length = 0;
    this.pri.length = 0;
  }
}

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance from a point to a building's footprint (0 inside). */
export function rectDist(x: number, z: number, b: SB) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.size));
  const dz = Math.max(b.z - z, 0, z - (b.z + b.size));
  return Math.hypot(dx, dz);
}

export class Sim {
  readonly mode: "raid" | "defence";
  readonly buildings: SB[] = [];
  readonly units: SU[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: Zone[] = [];
  readonly timeLimit: number;
  readonly troops: { kind: UnitKind; level: number; count: number }[];
  readonly spells: { kind: SpellKind; level: number; count: number }[];
  /** Tiles where attackers may not be dropped (1) — around every building. */
  readonly noDeploy = new Uint8Array(N * N);
  time = 0;
  gold = 0;
  elixir = 0;
  goldTotal = 0;
  elixirTotal = 0;
  destroyed = 0;
  counted = 0;
  thDown = false;
  ended = false;
  started = false;
  /** Seconds the battle has had nothing left to do (ends it). */
  private idle = 0;
  readonly used: Partial<Record<UnitKind, number>> = {};
  readonly spellsUsed: Partial<Record<SpellKind, number>> = {};
  raiders = 0;
  raidersKilled = 0;
  /** Living defender-side units (heroes, skeletons, your troops at home) — attackers fight them. */
  private defenders = 0;
  private readonly occ = new Int32Array(N * N);
  private readonly wallAt = new Int32Array(N * N);
  private readonly jumpAt = new Uint8Array(N * N);
  private ver = 1;
  private occVer = 0;
  private readonly fields = new Map<number, { ver: number; f: Float32Array }>();
  private readonly heap = new Heap();
  private nextId = 1;
  private readonly rand: () => number;
  private pendingSpawns: { t: number; kind: UnitKind; level: number; x: number; z: number; side: 0 | 1 }[] = [];
  events: SimEvents = {};

  constructor(setup: SimSetup) {
    this.mode = setup.mode;
    this.timeLimit = setup.timeLimit;
    this.troops = setup.troops.map((t) => ({ ...t }));
    this.spells = setup.spells.map((s) => ({ ...s }));
    this.rand = seeded(setup.seed ?? Math.floor(Math.random() * 1e9));
    setup.buildings.forEach((b, i) => {
      const sb = new SB(i, b.id, b.kind, b.level, b.x + MARGIN, b.z + MARGIN, b.gold, b.elixir, b.inactive, b.power);
      this.buildings.push(sb);
      if (sb.counts) this.counted++;
      this.goldTotal += sb.gold;
      this.elixirTotal += sb.elixir;
    });
    for (const b of this.buildings) {
      if (b.isTrap || b.hidden) continue;
      for (let z = b.z - 1; z <= b.z + b.size; z++)
        for (let x = b.x - 1; x <= b.x + b.size; x++) if (x >= 0 && z >= 0 && x < N && z < N) this.noDeploy[z * N + x] = 1;
    }
    for (const g of setup.guards ?? []) {
      const u = this.spawn(g.kind, g.level, g.x + MARGIN, g.z + MARGIN, 1);
      u.guard = { x: g.x + MARGIN, z: g.z + MARGIN, r: g.r };
      if (g.hp !== undefined) u.hp = Math.max(1, Math.round(u.maxHp * g.hp));
    }
  }

  get percent() {
    return this.counted ? Math.round((this.destroyed / this.counted) * 100) : 0;
  }

  get stars() {
    return (this.percent >= 50 ? 1 : 0) + (this.thDown ? 1 : 0) + (this.percent >= 100 ? 1 : 0);
  }

  troopsLeft() {
    return this.troops.reduce((n, t) => n + t.count, 0);
  }

  alive(side: 0 | 1) {
    let n = 0;
    for (const u of this.units) if (!u.dead && u.side === side) n++;
    return n;
  }

  // --- Deploying --------------------------------------------------------------------------------

  canDeploy(x: number, z: number, side: 0 | 1 = 0) {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    if (tx < 0 || tz < 0 || tx >= N || tz >= N) return false;
    if (side === 0) return !this.noDeploy[tz * N + tx];
    // Defenders: anywhere in the village that isn't under a building.
    if (tx < MARGIN || tz < MARGIN || tx >= N - MARGIN || tz >= N - MARGIN) return false;
    this.refreshOcc();
    return !this.occ[tz * N + tx] && !this.wallAt[tz * N + tx];
  }

  /** Drops one troop of `kind` (from the hotbar stock). Returns the unit or null. */
  deploy(kind: UnitKind, x: number, z: number, side: 0 | 1 = 0): SU | null {
    const stock = this.troops.find((t) => t.kind === kind && t.count > 0);
    if (!stock || this.ended) return null;
    if (!this.canDeploy(x, z, side)) return null;
    stock.count--;
    this.used[kind] = (this.used[kind] ?? 0) + 1;
    this.started = true;
    return this.spawn(kind, stock.level, x, z, side);
  }

  spawn(kind: UnitKind, level: number, x: number, z: number, side: 0 | 1) {
    const u = new SU(this.nextId++, kind, level, side, x, z, this.rand);
    u.yaw = Math.atan2(N / 2 - x, N / 2 - z);
    this.units.push(u);
    this.events.deployed?.(u);
    return u;
  }

  /** Raiders arriving over time (defence mode). */
  queueRaider(t: number, kind: UnitKind, level: number, x: number, z: number) {
    this.pendingSpawns.push({ t, kind, level, x, z, side: 0 });
    this.raiders++;
  }

  /** A deployed hero's once-per-battle ability. */
  ability(u: SU) {
    if (!u.hero || u.dead || u.abilityUsed || this.ended) return false;
    u.abilityUsed = true;
    if (u.kind === "king") {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * (0.35 + u.level * 0.03));
      const zone: Zone = { id: this.nextId++, kind: "rage", level: u.level, x: u.x, z: u.z, r: 3.5, t: 0, dur: 5 + u.level, power: 0.35 + u.level * 0.07, bolts: 0 };
      this.zones.push(zone);
      this.events.spell?.(zone);
    } else {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.2);
      u.cloak = 3 + u.level * 0.5;
    }
    this.events.ability?.(u);
    return true;
  }

  cast(kind: SpellKind, x: number, z: number): Zone | null {
    const stock = this.spells.find((s) => s.kind === kind && s.count > 0);
    if (!stock || this.ended) return null;
    if (x < 0 || z < 0 || x > N || z > N) return null;
    stock.count--;
    this.spellsUsed[kind] = (this.spellsUsed[kind] ?? 0) + 1;
    this.started = true;
    const def = SPELLS[kind];
    const zone: Zone = {
      id: this.nextId++,
      kind,
      level: stock.level,
      x,
      z,
      r: def.radius,
      t: 0,
      dur: kind === "lightning" ? 1.2 : def.duration[stock.level - 1],
      power: def.power[stock.level - 1],
      bolts: 0,
    };
    this.zones.push(zone);
    if (kind === "jump") this.ver++;
    if (kind === "freeze") {
      for (const b of this.buildings) if (!b.dead && !b.hidden && (b.atk || b.isTrap) && rectDist(x, z, b) <= zone.r) b.frozen = Math.max(b.frozen, zone.dur);
    }
    this.events.spell?.(zone);
    return zone;
  }

  // --- Main step --------------------------------------------------------------------------------

  step(dt = STEP) {
    if (this.ended) return;
    if (this.started || this.mode === "defence") this.time += dt;
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      const s = this.pendingSpawns[i];
      if (s.t <= this.time) {
        this.spawn(s.kind, s.level, s.x, s.z, s.side);
        this.pendingSpawns.splice(i, 1);
      }
    }
    this.updateZones(dt);
    this.defenders = this.alive(1);
    for (const u of this.units) {
      if (u.dead) {
        u.deadT += dt;
        continue;
      }
      u.swing += dt;
      u.retarget -= dt;
      u.beginStep();
      if (u.cloak > 0) u.cloak = Math.max(0, u.cloak - dt);
      if (u.side === 0) this.updateAttacker(u, dt);
      else this.updateDefender(u, dt);
    }
    this.separate();
    for (const b of this.buildings) {
      b.hitT += dt;
      b.fired += dt;
      if (b.dead) continue;
      if (b.frozen > 0) {
        b.frozen -= dt;
        continue;
      }
      if (b.atk && !b.inactive) this.updateDefence(b, dt);
      else if (b.isTrap) this.updateTrap(b, dt);
    }
    this.updateProjectiles(dt);
    this.checkEnd(dt);
  }

  private checkEnd(dt: number) {
    if (this.destroyed >= this.counted && this.counted > 0) return this.end();
    if (this.time >= this.timeLimit) return this.end();
    if (this.mode === "raid") {
      const nothing = this.started && this.alive(0) === 0 && this.troopsLeft() === 0 && !this.projectiles.length && !this.zones.length;
      this.idle = nothing ? this.idle + dt : 0;
      if (this.idle > 1.2) this.end();
    } else {
      const over = this.pendingSpawns.length === 0 && this.alive(0) === 0;
      this.idle = over ? this.idle + dt : 0;
      if (this.idle > 1.5) this.end();
    }
  }

  end() {
    if (this.ended) return;
    this.ended = true;
  }

  result(): SimResult {
    const survivors: Partial<Record<UnitKind, number>> = {};
    for (const u of this.units) if (!u.dead && u.side === 1) survivors[u.kind] = (survivors[u.kind] ?? 0) + 1;
    // Your heroes are the attackers in a raid and the guards at home.
    const mine = this.mode === "raid" ? 0 : 1;
    const heroHp: Partial<Record<HeroKind, number>> = {};
    for (const u of this.units) if (u.hero && u.side === mine) heroHp[u.kind as HeroKind] = u.dead ? 0 : u.hp / u.maxHp;
    return {
      stars: this.stars,
      percent: this.percent,
      gold: Math.round(this.gold),
      elixir: Math.round(this.elixir),
      thDown: this.thDown,
      time: this.time,
      used: { ...this.used },
      spellsUsed: { ...this.spellsUsed },
      survivors,
      raidersKilled: this.raidersKilled,
      raiders: this.raiders,
      heroHp,
    };
  }

  // --- Grid & flow fields -----------------------------------------------------------------------

  private refreshOcc() {
    if (this.occVer === this.ver) return;
    this.occVer = this.ver;
    this.occ.fill(0);
    this.wallAt.fill(0);
    this.jumpAt.fill(0);
    for (const b of this.buildings) {
      if (b.dead || b.isTrap || b.hidden) continue;
      const arr = b.isWall ? this.wallAt : this.occ;
      for (let z = b.z; z < b.z + b.size; z++) for (let x = b.x; x < b.x + b.size; x++) arr[z * N + x] = b.index + 1;
    }
    for (const zn of this.zones) {
      if (zn.kind !== "jump") continue;
      const r = zn.r;
      for (let z = Math.floor(zn.z - r); z <= zn.z + r; z++)
        for (let x = Math.floor(zn.x - r); x <= zn.x + r; x++) {
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          if (Math.hypot(x + 0.5 - zn.x, z + 0.5 - zn.z) <= r) this.jumpAt[z * N + x] = 1;
        }
    }
  }

  /** True when the wall at tile index i is in a Jump zone (troops hop it). */
  private hopped(i: number) {
    return this.jumpAt[i] === 1;
  }

  private field(target: SB): Float32Array {
    this.refreshOcc();
    let c = this.fields.get(target.index);
    if (c && c.ver === this.ver) return c.f;
    if (!c) {
      c = { ver: 0, f: new Float32Array(N * N) };
      this.fields.set(target.index, c);
    }
    c.ver = this.ver;
    const f = c.f;
    f.fill(Infinity);
    const heap = this.heap;
    heap.clear();
    const self = target.index + 1;
    for (let z = target.z; z < target.z + target.size; z++)
      for (let x = target.x; x < target.x + target.size; x++) {
        f[z * N + x] = 0;
        heap.push(z * N + x, 0);
      }
    const { occ, wallAt } = this;
    for (let top = heap.pop(); top; top = heap.pop()) {
      const [i, d] = top;
      if (d > f[i]) continue;
      const x = i % N;
      const z = (i - x) / N;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const j = nz * N + nx;
          if (occ[j] && occ[j] !== self) continue;
          let step = 1;
          if (dx && dz) {
            const a = z * N + nx;
            const b = nz * N + x;
            if ((occ[a] && occ[a] !== self) || (occ[b] && occ[b] !== self) || (wallAt[a] && !this.hopped(a)) || (wallAt[b] && !this.hopped(b))) continue;
            step = SQRT2;
          }
          if (wallAt[j] && wallAt[j] !== self && !this.hopped(j)) step += WALL_COST;
          const nd = d + step;
          if (nd < f[j]) {
            f[j] = nd;
            heap.push(j, nd);
          }
        }
    }
    return f;
  }

  // --- Targets ----------------------------------------------------------------------------------

  private pickTarget(u: SU): SB | null {
    const pref = u.def.prefer;
    let best: SB | null = null;
    let bestD = Infinity;
    let fallback: SB | null = null;
    let fallbackD = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.isTrap || b.hidden) continue;
      const d = rectDist(u.x, u.z, b);
      if (b.isWall) {
        if (pref === "wall" && d < bestD) {
          bestD = d;
          best = b;
        }
        continue;
      }
      const match = (pref === "defence" && !!b.atk) || (pref === "resource" && isResource(b.kind));
      if (match && d < bestD) {
        bestD = d;
        best = b;
      }
      if (d < fallbackD) {
        fallbackD = d;
        fallback = b;
      }
    }
    if (pref === "any" || pref === "troops") return fallback;
    return best ?? fallback;
  }

  private nearestUnit(x: number, z: number, side: 0 | 1, maxD: number, minD = 0): SU | null {
    let best: SU | null = null;
    let bestD = maxD;
    for (const o of this.units) {
      if (o.dead || o.side !== side || o.cloak > 0) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bestD && d >= minD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // --- Units ------------------------------------------------------------------------------------

  private speedOf(u: SU) {
    return u.def.speed * (1 + u.rage * 0.5);
  }

  private moveTowards(u: SU, tx: number, tz: number, dt: number, collide = false) {
    const dx = tx - u.x;
    const dz = tz - u.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    const step = Math.min(d, this.speedOf(u) * dt);
    let nx = u.x + (dx / d) * step;
    let nz = u.z + (dz / d) * step;
    if (collide) {
      this.refreshOcc();
      const blocked = (x: number, z: number) => {
        const tx2 = Math.floor(x);
        const tz2 = Math.floor(z);
        if (tx2 < 0 || tz2 < 0 || tx2 >= N || tz2 >= N) return true;
        const i = tz2 * N + tx2;
        return !!this.occ[i] || !!this.wallAt[i];
      };
      // Units standing on a building (heroes start on their altar) may always step off it.
      if (!blocked(u.x, u.z) && blocked(nx, nz)) {
        if (!blocked(nx, u.z)) nz = u.z;
        else if (!blocked(u.x, nz)) nx = u.x;
        else {
          nx = u.x;
          nz = u.z;
        }
      }
    }
    u.x = nx;
    u.z = nz;
    u.yaw = turn(u.yaw, Math.atan2(dx, dz), 10 * dt);
    u.moving = true;
  }

  private face(u: SU, x: number, z: number, dt: number) {
    u.yaw = turn(u.yaw, Math.atan2(x - u.x, z - u.z), 12 * dt);
  }

  private updateAttacker(u: SU, dt: number) {
    u.moving = false;
    if (u.def.heals) return this.updateHealer(u, dt);
    // Defenders nearby (heroes, trap skeletons, troops at home)? Melee troops turn to fight them; ranged ones shoot them.
    if (this.defenders > 0 && !u.def.suicide) {
      if (u.tUnit && (u.tUnit.dead || Math.hypot(u.tUnit.x - u.x, u.tUnit.z - u.z) > u.def.range + 1.5)) u.tUnit = null;
      if (!u.tUnit && u.retarget <= 0) u.tUnit = this.nearestUnit(u.x, u.z, 1, u.def.range + 0.9);
      if (u.tUnit) {
        const o = u.tUnit;
        const d = Math.hypot(o.x - u.x, o.z - u.z);
        if (d <= u.def.range + o.radius + 0.1) this.attackUnit(u, o, dt);
        else this.moveTowards(u, o.x, o.z, dt, true);
        return;
      }
    }
    if (!u.target || u.target.dead || (u.retarget <= 0 && !u.wall && u.def.prefer === "wall")) {
      u.target = this.pickTarget(u);
      u.retarget = 1.5;
      u.wall = null;
    }
    const t = u.target;
    if (!t) return;
    const range = u.def.range + u.radius;
    if (rectDist(u.x, u.z, t) <= range) {
      this.attackBuilding(u, t, dt);
      return;
    }
    if (u.wall && !u.wall.dead && rectDist(u.x, u.z, u.wall) <= range + 0.15) {
      this.attackBuilding(u, u.wall, dt);
      return;
    }
    u.wall = null;
    const f = this.field(t);
    const tx = Math.floor(u.x);
    const tz = Math.floor(u.z);
    const here = tz * N + tx;
    let bestJ = -1;
    let bestV = tx >= 0 && tz >= 0 && tx < N && tz < N ? f[here] : Infinity;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = tx + dx;
        const nz = tz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const j = nz * N + nx;
        if (dx && dz) {
          const a = tz * N + nx;
          const b = nz * N + tx;
          if (this.occ[a] || this.occ[b] || (this.wallAt[a] && !this.hopped(a)) || (this.wallAt[b] && !this.hopped(b))) continue;
        }
        if (f[j] < bestV) {
          bestV = f[j];
          bestJ = j;
        }
      }
    if (bestJ < 0) {
      // Out of the grid or boxed in: walk straight at the target.
      this.moveTowards(u, t.cx, t.cz, dt);
      return;
    }
    const wi = this.wallAt[bestJ];
    if (wi && !this.hopped(bestJ) && this.buildings[wi - 1] !== t) {
      u.wall = this.buildings[wi - 1];
      this.attackBuilding(u, u.wall, dt);
      return;
    }
    const jx = bestJ % N;
    const jz = (bestJ - jx) / N;
    // Aim a little past the next tile (with a personal offset) so crowds spread out.
    this.moveTowards(u, jx + 0.5 + u.ox, jz + 0.5 + u.oz, dt);
  }

  private updateHealer(u: SU, dt: number) {
    let t = u.tUnit;
    if (!t || t.dead || u.retarget <= 0) {
      u.retarget = 1;
      t = null;
      let best = Infinity;
      for (const o of this.units) {
        if (o.dead || o.side !== u.side || o === u || o.def.heals) continue;
        const d = Math.hypot(o.x - u.x, o.z - u.z);
        const score = d - (1 - o.hp / o.maxHp) * 8;
        if (score < best) {
          best = score;
          t = o;
        }
      }
      u.tUnit = t;
    }
    if (!t) return;
    const d = Math.hypot(t.x - u.x, t.z - u.z);
    if (d > u.def.range * 0.8) this.moveTowards(u, t.x, t.z, dt, u.side === 1);
    else this.face(u, t.x, t.z, dt);
    if (d <= u.def.range) u.engage();
    u.cooldown -= dt;
    if (u.cooldown <= 0 && d <= u.def.range) {
      u.cooldown = u.def.interval;
      u.swing = 0;
      const amount = u.dmg * (1 + u.rage);
      for (const o of this.units) {
        if (o.dead || o.side !== u.side || o.def.heals) continue;
        if (Math.hypot(o.x - t.x, o.z - t.z) <= (u.def.splash ?? 2)) o.hp = Math.min(o.maxHp, o.hp + amount);
      }
      this.events.heal?.(u, t);
    }
  }

  private updateDefender(u: SU, dt: number) {
    u.moving = false;
    if (u.def.heals) return this.updateHealer(u, dt);
    const g = u.guard;
    if (!u.tUnit || u.tUnit.dead || u.tUnit.cloak > 0 || u.retarget <= 0) {
      // Guards only chase what comes near their post.
      u.tUnit = g ? this.nearestUnit(g.x, g.z, 0, g.r + u.def.range) : this.nearestUnit(u.x, u.z, 0, 60);
      u.retarget = 0.6;
    }
    const o = u.tUnit;
    if (!o) {
      // Back to the post (heroes stop at the edge of their altar).
      if (g && Math.hypot(g.x - u.x, g.z - u.z) > (u.hero ? 1.9 : 0.6)) this.moveTowards(u, g.x, g.z, dt, true);
      return;
    }
    const d = Math.hypot(o.x - u.x, o.z - u.z);
    if (d <= u.def.range + o.radius + 0.1) this.attackUnit(u, o, dt);
    else this.moveTowards(u, o.x, o.z, dt, true);
  }

  private attackBuilding(u: SU, b: SB, dt: number) {
    this.face(u, b.cx, b.cz, dt);
    u.engage();
    u.cooldown -= dt;
    if (u.cooldown > 0) return;
    u.cooldown = u.def.interval;
    u.swing = 0;
    const mult = (u.def.bonus && ((u.def.prefer === "resource" && isResource(b.kind)) || (u.def.prefer === "wall" && b.isWall) || (u.def.prefer === "defence" && !!b.atk)) ? u.def.bonus : 1) * (1 + u.rage) * (u.cloak > 0 ? 2 : 1);
    if (u.def.suicide) {
      // Wall breaker: one big blast that opens the wall it reached and the segments beside it.
      const r = u.def.splash ?? 1.4;
      const wallDmg = (u.def.wallDamage?.[u.level - 1] ?? u.dmg) * (1 + u.rage);
      for (const o of this.buildings) {
        if (o.dead || o.isTrap || o.hidden) continue;
        if (rectDist(u.x, u.z, o) <= r) this.hurt(o, o.isWall ? wallDmg : u.dmg * (1 + u.rage));
      }
      this.events.explode?.(u);
      this.kill(u);
      return;
    }
    if (u.def.ranged) {
      const p = this.projectile(u.kind === "mage" ? "troop-bolt" : "troop-arrow", u.x, u.z, 0.6, b.cx, b.cz, 0.8, u.dmg * mult, u.def.splash ?? 0, -1, null, b, u);
      p.dur = Math.max(0.12, Math.hypot(b.cx - u.x, b.cz - u.z) / (u.kind === "mage" ? 11 : 16));
      this.events.troopShot?.(u, p);
    } else {
      this.hurt(b, u.dmg * mult);
      // Sweeping weapons (the Valkyrie's axe) hit everything else around too.
      if (u.def.splash) for (const o of this.buildings) if (o !== b && !o.dead && !o.isTrap && !o.hidden && rectDist(u.x, u.z, o) <= u.def.splash) this.hurt(o, u.dmg * (1 + u.rage));
      this.events.hit?.(u, b);
    }
  }

  private attackUnit(u: SU, o: SU, dt: number) {
    this.face(u, o.x, o.z, dt);
    u.engage();
    u.cooldown -= dt;
    if (u.cooldown > 0) return;
    u.cooldown = u.def.interval;
    u.swing = 0;
    const dmg = u.dmg * (1 + u.rage) * (u.cloak > 0 ? 2 : 1);
    if (u.def.ranged) {
      const p = this.projectile(u.kind === "mage" ? "troop-bolt" : "troop-arrow", u.x, u.z, 0.6, o.x, o.z, 0.4, dmg, u.def.splash ?? 0, o.side, o, null, u);
      p.dur = Math.max(0.12, Math.hypot(o.x - u.x, o.z - u.z) / 15);
      this.events.troopShot?.(u, p);
    } else {
      this.hurtUnit(o, dmg);
      if (u.def.splash && !u.def.suicide) for (const e of this.units) if (e !== o && !e.dead && e.side !== u.side && Math.hypot(e.x - u.x, e.z - u.z) <= u.def.splash) this.hurtUnit(e, dmg);
      this.events.hit?.(u, o);
      if (u.def.suicide) {
        this.events.explode?.(u);
        this.kill(u);
      }
    }
  }

  private separate() {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const min = (a.radius + b.radius) * 0.8;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.35;
        const nx = dx / d;
        const nz = dz / d;
        const wa = a.moving ? 1 : 0.25;
        const wb = b.moving ? 1 : 0.25;
        a.x -= nx * push * wa;
        a.z -= nz * push * wa;
        b.x += nx * push * wb;
        b.z += nz * push * wb;
      }
    }
  }

  hurtUnit(u: SU, dmg: number) {
    if (u.dead) return;
    u.hp -= dmg;
    if (u.hp <= 0) this.kill(u);
  }

  private kill(u: SU) {
    if (u.dead) return;
    u.dead = true;
    u.hp = 0;
    u.deadT = 0;
    if (u.side === 0 && this.mode === "defence") this.raidersKilled++;
    this.events.died?.(u);
  }

  // --- Buildings --------------------------------------------------------------------------------

  hurt(b: SB, dmg: number) {
    if (b.dead || dmg <= 0) return;
    const real = Math.min(b.hp, dmg);
    b.hp -= dmg;
    b.hitT = 0;
    if (b.gold0 || b.elixir0) {
      const g = Math.min(b.gold, (b.gold0 * real) / b.maxHp);
      const e = Math.min(b.elixir, (b.elixir0 * real) / b.maxHp);
      this.takeLoot(b, g, e);
    }
    this.events.damaged?.(b, real);
    if (b.hp <= 0) this.destroy(b);
  }

  private takeLoot(b: SB, g: number, e: number) {
    if (g <= 0 && e <= 0) return;
    b.gold -= g;
    b.elixir -= e;
    this.gold += g;
    this.elixir += e;
    this.events.loot?.(b, g, e);
  }

  private destroy(b: SB) {
    b.dead = true;
    b.hp = 0;
    this.takeLoot(b, b.gold, b.elixir);
    if (b.counts) this.destroyed++;
    if (b.kind === "townhall") this.thDown = true;
    this.ver++;
    this.events.destroyed?.(b);
    // Only hidden defences left: they show themselves, so the raid can still reach 100%.
    if (this.buildings.every((o) => o.dead || !o.counts || o.hidden)) for (const o of this.buildings) if (o.hidden && !o.dead) this.reveal(o);
  }

  /** A hidden defence springs up: from now on it can be seen, targeted and hit. */
  private reveal(b: SB) {
    if (!b.hidden) return;
    b.hidden = false;
    // It takes a moment to rise before the first shock.
    b.cooldown = Math.max(b.cooldown, 0.55);
    this.ver++;
    this.events.reveal?.(b);
  }

  private updateDefence(b: SB, dt: number) {
    const atk = b.atk!;
    if (b.hidden) {
      // Underground: springs up as soon as a troop comes close.
      const r = BUILDINGS[b.kind].hidden ?? 0;
      for (const u of this.units) {
        if (!u.dead && u.side === 0 && u.cloak <= 0 && Math.hypot(u.x - b.cx, u.z - b.cz) <= r) {
          this.reveal(b);
          break;
        }
      }
      return;
    }
    b.cooldown -= dt;
    const t = b.target;
    const valid = (u: SU | null) => {
      if (!u || u.dead || u.side !== 0 || u.cloak > 0) return false;
      const d = Math.hypot(u.x - b.cx, u.z - b.cz);
      return d <= atk.range + b.size / 2 - 0.5 && d >= (atk.minRange ?? 0);
    };
    if (!valid(t)) {
      b.target = null;
      let best = Infinity;
      for (const u of this.units) {
        if (u.dead || u.side !== 0 || u.cloak > 0) continue;
        const d = Math.hypot(u.x - b.cx, u.z - b.cz);
        if (d < best && d <= atk.range + b.size / 2 - 0.5 && d >= (atk.minRange ?? 0)) {
          best = d;
          b.target = u;
        }
      }
    }
    const u = b.target;
    if (!u) return;
    b.yaw = turn(b.yaw, Math.atan2(u.x - b.cx, u.z - b.cz), 7 * dt);
    if (b.cooldown > 0) return;
    b.cooldown = atk.interval;
    b.fired = 0;
    if (atk.projectile === "zap") {
      // A shock hits at once and jumps on to the nearest other troops (half damage each).
      const hits: SU[] = [u];
      let from = u;
      for (let i = atk.chain?.[b.level - 1] ?? 0; i > 0; i--) {
        let next: SU | null = null;
        let bd = 2.4;
        for (const o of this.units) {
          if (o.dead || o.side !== 0 || o.cloak > 0 || hits.includes(o)) continue;
          const d = Math.hypot(o.x - from.x, o.z - from.z);
          if (d < bd) {
            bd = d;
            next = o;
          }
        }
        if (!next) break;
        hits.push(next);
        from = next;
      }
      hits.forEach((o, i) => this.hurtUnit(o, i === 0 ? b.damage : b.damage * 0.5));
      this.events.zap?.(b, hits);
      return;
    }
    const homing = atk.projectile !== "boulder";
    // Boulders aim where the troop will be (roughly) — fast troops can still dodge.
    const lead = homing ? 0 : 0.35;
    const tx = u.x + (u.moving ? Math.sin(u.yaw) * u.def.speed * lead : 0);
    const tz = u.z + (u.moving ? Math.cos(u.yaw) * u.def.speed * lead : 0);
    const height = b.kind === "archertower" ? 2.6 : b.kind === "magetower" ? 3.2 : b.kind === "catapult" ? 1.2 : 0.9;
    const p = this.projectile(atk.projectile, b.cx, b.cz, height, tx, tz, 0.4, b.damage, atk.splash ?? 0, 0, homing ? u : null, null, b);
    p.dur = Math.max(0.15, Math.hypot(tx - b.cx, tz - b.cz) / atk.speed + (atk.projectile === "boulder" ? 0.5 : 0));
    this.events.shot?.(b, p);
  }

  private updateTrap(b: SB, dt: number) {
    const trap = BUILDINGS[b.kind].trap!;
    if (b.fuse < 0) {
      for (const u of this.units) {
        if (u.dead || u.side !== 0) continue;
        if (Math.hypot(u.x - b.cx, u.z - b.cz) <= trap.trigger) {
          b.fuse = 0.35;
          this.events.trap?.(b);
          break;
        }
      }
      return;
    }
    b.fuse -= dt;
    if (b.fuse > 0) return;
    b.dead = true;
    if (trap.spawn) {
      // Skeleton trap: a pack of skeletons climbs out and guards the spot.
      const n = trap.spawn[b.level - 1] ?? 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.rand();
        const u = this.spawn("bones", b.level, b.cx + Math.cos(a) * 0.6, b.cz + Math.sin(a) * 0.6, 1);
        u.guard = { x: b.cx, z: b.cz, r: 7 };
        u.cooldown = 0.8;
        this.events.sprung?.(b, u);
      }
      this.events.destroyed?.(b);
      return;
    }
    for (const u of this.units) {
      if (u.dead || u.side !== 0) continue;
      if (Math.hypot(u.x - b.cx, u.z - b.cz) <= trap.radius) this.hurtUnit(u, b.damage);
    }
    this.events.destroyed?.(b);
  }

  // --- Projectiles ------------------------------------------------------------------------------

  private projectile(
    kind: ProjectileKind,
    x0: number,
    z0: number,
    y0: number,
    x1: number,
    z1: number,
    y1: number,
    dmg: number,
    splash: number,
    hitsSide: 0 | 1 | -1,
    tU: SU | null,
    tB: SB | null,
    source: SU | SB | null,
  ) {
    const p: Projectile = { id: this.nextId++, kind, x0, z0, y0, x1, z1, y1, t: 0, dur: 0.5, dmg, splash, hitsSide, tU, tB, source, done: false };
    this.projectiles.push(p);
    return p;
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.tU && !p.tU.dead) {
        p.x1 = p.tU.x;
        p.z1 = p.tU.z;
      }
      if (p.t < p.dur) continue;
      p.done = true;
      this.projectiles.splice(i, 1);
      if (p.hitsSide === -1) {
        // Troop shot at a building (with splash for the mage).
        if (p.splash > 0) {
          for (const o of this.buildings) if (!o.dead && !o.isTrap && !o.hidden && rectDist(p.x1, p.z1, o) <= p.splash * 0.5) this.hurt(o, p.dmg);
        } else if (p.tB) this.hurt(p.tB, p.dmg);
      } else if (p.splash > 0) {
        for (const u of this.units) if (!u.dead && u.side === p.hitsSide && Math.hypot(u.x - p.x1, u.z - p.z1) <= p.splash) this.hurtUnit(u, p.dmg);
      } else if (p.tU) this.hurtUnit(p.tU, p.dmg);
      this.events.impact?.(p);
    }
  }

  // --- Spells -----------------------------------------------------------------------------------

  private updateZones(dt: number) {
    for (const u of this.units) u.rage = 0;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zn = this.zones[i];
      zn.t += dt;
      if (zn.kind === "lightning") {
        const want = Math.min(6, Math.floor(zn.t / 0.18) + 1);
        while (zn.bolts < want) {
          zn.bolts++;
          const a = this.rand() * Math.PI * 2;
          const r = Math.sqrt(this.rand()) * zn.r * 0.8;
          this.events.bolt?.(zn.x + Math.cos(a) * r, zn.z + Math.sin(a) * r);
          for (const b of this.buildings) {
            if (b.dead || b.isTrap || b.hidden) continue;
            if (rectDist(zn.x, zn.z, b) <= zn.r) this.hurt(b, (zn.power / 6) * (b.isWall ? 0.25 : 1));
          }
        }
      } else if (zn.kind === "heal" || zn.kind === "rage") {
        for (const u of this.units) {
          if (u.dead || u.side !== 0) continue;
          if (Math.hypot(u.x - zn.x, u.z - zn.z) > zn.r) continue;
          if (zn.kind === "heal") u.hp = Math.min(u.maxHp, u.hp + zn.power * dt);
          else u.rage = Math.max(u.rage, zn.power);
        }
      }
      if (zn.t >= zn.dur) {
        this.zones.splice(i, 1);
        if (zn.kind === "jump") this.ver++;
      }
    }
  }
}

function turn(from: number, to: number, max: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}

/** Pairs every defence with a nearby building for quick lookups in the view. */
export const defenceKinds = (k: BKind) => isDefence(k);
