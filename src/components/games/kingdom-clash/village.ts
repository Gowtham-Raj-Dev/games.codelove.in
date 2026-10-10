/**
 * Kingdom Clash — the player's village as plain data: save format, starting layout, the economy
 * (collect, build, upgrade, train, brew, research, obstacles) and the clock that keeps everything
 * running from timestamps while the game is closed. Pure TypeScript, no three.js.
 */
import {
  ACHIEVEMENTS,
  allowed,
  BUILDINGS,
  GRID,
  HERO_ORDER,
  HEROES,
  HUT_COST,
  levelCap,
  SPELL_ORDER,
  SPELLS,
  TROOP_ORDER,
  TROOPS,
  type BKind,
  type HeroKind,
  type SpellKind,
  type TroopKind,
} from "./data";

export interface SBuilding {
  id: number;
  kind: BKind;
  /** 0 while the first construction is running. */
  level: number;
  /** Top-left tile. */
  x: number;
  z: number;
  /** A construction or upgrade finishes at this time (ms). */
  until?: number;
  /** Its total seconds (progress bars). */
  dur?: number;
  /** Collectors: amount waiting to be collected. */
  stored?: number;
}

export interface SObstacle {
  id: number;
  /** Index into the obstacle model list. */
  model: number;
  x: number;
  z: number;
  size: number;
  gems: number;
  cost: number;
  res: "gold" | "elixir";
  until?: number;
  dur?: number;
}

export interface Research {
  kind: TroopKind | SpellKind;
  until: number;
  dur: number;
}

export interface Save {
  v: 1;
  name: string;
  gold: number;
  elixir: number;
  gems: number;
  trophies: number;
  buildings: SBuilding[];
  obstacles: SObstacle[];
  nextId: number;
  army: Partial<Record<TroopKind, number>>;
  queue: TroopKind[];
  /** When the troop at the head of the queue started (ms). */
  queueT: number;
  spells: Partial<Record<SpellKind, number>>;
  brew: SpellKind[];
  brewT: number;
  troopLv: Record<TroopKind, number>;
  spellLv: Record<SpellKind, number>;
  research: Research | null;
  /** Hero health (0..1): a hurt hero sleeps at the altar until it's full again. */
  heroHp: Record<HeroKind, number>;
  /** Best stars per campaign stage. */
  stars: number[];
  /** Stages already given their first-clear bonus. */
  bonus: number[];
  tutorial: number;
  ach: string[];
  stats: { trained: number; raids: number; wins: number; defences: number; held: number; cleared: number; spells: number; online: number; onlineWins: number };
  /** Seconds of village time until raiders come. */
  raidIn: number;
  lastObstacle: number;
  seen: number;
}

export interface TickEvents {
  built: SBuilding[];
  trained: TroopKind[];
  brewed: SpellKind[];
  researched: (TroopKind | SpellKind)[];
  cleared: SObstacle[];
}

const RAID_FIRST = 240;
export const RAID_EVERY = () => 420 + Math.random() * 240;
const OBSTACLE_EVERY = 4 * 60_000;
const MAX_OBSTACLES = 22;
export const OBSTACLE_MODELS = 8;

// --- Starting village ------------------------------------------------------------------------------

function baseSave(now: number): Save {
  return {
    v: 1,
    name: "",
    gold: 1000,
    elixir: 1000,
    gems: 50,
    trophies: 0,
    buildings: [],
    obstacles: [],
    nextId: 1,
    army: {},
    queue: [],
    queueT: now,
    spells: {},
    brew: [],
    brewT: now,
    troopLv: { warrior: 1, archer: 1, thief: 1, giant: 1, valkyrie: 1, breaker: 1, crossbow: 1, mage: 1, healer: 1, knight: 1 },
    spellLv: { lightning: 1, heal: 1, rage: 1, freeze: 1, jump: 1 },
    research: null,
    heroHp: { king: 1, queen: 1 },
    stars: [],
    bonus: [],
    tutorial: 0,
    ach: [],
    stats: { trained: 0, raids: 0, wins: 0, defences: 0, held: 0, cleared: 0, spells: 0, online: 0, onlineWins: 0 },
    raidIn: RAID_FIRST,
    lastObstacle: now,
    seen: now,
  };
}

export function newVillage(now = Date.now(), rand = Math.random): Save {
  const s = baseSave(now);
  const add = (kind: BKind, x: number, z: number, level = 1) => s.buildings.push({ id: s.nextId++, kind, level, x, z });
  add("townhall", 16, 16);
  add("builder", 11, 22);
  add("builder", 23, 11);
  add("cannon", 11, 15);
  add("barracks", 21, 21);
  add("camp", 21, 25);
  add("goldstorage", 16, 21);
  add("elixirstorage", 21, 16);
  for (let i = 0; i < 16; i++) spawnObstacle(s, rand);
  return s;
}

// --- Queries ---------------------------------------------------------------------------------------

export const townHall = (s: Save) => s.buildings.find((b) => b.kind === "townhall")!;
export const thLevel = (s: Save) => Math.max(1, townHall(s).level);
export const countOf = (s: Save, kind: BKind) => s.buildings.filter((b) => b.kind === kind).length;
export const builtOf = (s: Save, kind: BKind) => s.buildings.filter((b) => b.kind === kind && b.level > 0);

export function capacity(s: Save, res: "gold" | "elixir") {
  let cap = 0;
  for (const b of s.buildings) {
    const def = BUILDINGS[b.kind];
    if (!def.capacity || b.level < 1) continue;
    if (def.stores === res || def.stores === "both") cap += def.capacity[b.level - 1];
  }
  return cap;
}

export const builders = (s: Save) => builtOf(s, "builder").length;
export const busyBuilders = (s: Save) => s.buildings.filter((b) => b.until).length + s.obstacles.filter((o) => o.until).length;
export const freeBuilders = (s: Save) => builders(s) - busyBuilders(s);

export function housing(s: Save) {
  let cap = 0;
  for (const b of builtOf(s, "camp")) cap += BUILDINGS.camp.housing![b.level - 1];
  return cap;
}

export const armySize = (s: Save) => TROOP_ORDER.reduce((n, k) => n + (s.army[k] ?? 0) * TROOPS[k].housing, 0);
export const queueSize = (s: Save) => s.queue.reduce((n, k) => n + TROOPS[k].housing, 0);

export function spellSlots(s: Save) {
  const f = builtOf(s, "spellfactory")[0];
  return f ? BUILDINGS.spellfactory.slots![f.level - 1] : 0;
}
export const spellCount = (s: Save) => SPELL_ORDER.reduce((n, k) => n + (s.spells[k] ?? 0), 0);

export const barracksLevel = (s: Save) => Math.max(0, ...builtOf(s, "barracks").map((b) => b.level));
export const factoryLevel = (s: Save) => Math.max(0, ...builtOf(s, "spellfactory").map((b) => b.level));
export const labLevel = (s: Save) => Math.max(0, ...builtOf(s, "lab").map((b) => b.level));

/** Total campaign stars and the highest stage you may attack (1-based). */
export const totalStars = (s: Save) => s.stars.reduce((a, b) => a + (b ?? 0), 0);
export function unlockedStage(s: Save) {
  let i = 0;
  while (i < 100 && (s.stars[i] ?? 0) > 0) i++;
  return Math.min(100, i + 1);
}

/** Cost and seconds of the next level (build when level is 0), or null when maxed or not allowed. */
export function nextLevel(s: Save, b: SBuilding) {
  const def = BUILDINGS[b.kind];
  if (b.level >= def.maxLevel) return { max: true as const, reason: "Max level" };
  if (b.level >= levelCap(b.kind, thLevel(s))) return { max: false as const, reason: `Needs Town Hall ${b.level + 1}`, locked: true };
  return { max: false as const, cost: def.cost[b.level], time: def.time[b.level], res: def.res };
}

export function buildCost(s: Save, kind: BKind) {
  if (kind === "builder") return HUT_COST[countOf(s, "builder")] ?? Infinity;
  return BUILDINGS[kind].cost[0];
}

// --- Heroes --------------------------------------------------------------------------------------

export function heroState(s: Save, k: HeroKind) {
  const altar = s.buildings.find((b) => b.kind === HEROES[k].altar);
  const level = altar?.level ?? 0;
  const hp = s.heroHp[k] ?? 1;
  const upgrading = !!altar?.until;
  const left = level > 0 ? (1 - hp) * HEROES[k].regen[level - 1] : 0;
  return { altar, level, hp, upgrading, sleeping: hp < 1, left, ready: level > 0 && !upgrading && hp >= 1 };
}

// --- Footprints ------------------------------------------------------------------------------------

export function occupied(s: Save, ignoreId = -1) {
  const grid = new Int32Array(GRID * GRID);
  for (const b of s.buildings) {
    if (b.id === ignoreId) continue;
    const n = BUILDINGS[b.kind].size;
    for (let z = b.z; z < b.z + n; z++) for (let x = b.x; x < b.x + n; x++) if (x >= 0 && z >= 0 && x < GRID && z < GRID) grid[z * GRID + x] = b.id;
  }
  for (const o of s.obstacles) {
    if (o.id === ignoreId) continue;
    for (let z = o.z; z < o.z + o.size; z++) for (let x = o.x; x < o.x + o.size; x++) if (x < GRID && z < GRID) grid[z * GRID + x] = o.id;
  }
  return grid;
}

export function fits(s: Save, size: number, x: number, z: number, ignoreId = -1, grid = occupied(s, ignoreId)) {
  if (x < 0 || z < 0 || x + size > GRID || z + size > GRID) return false;
  for (let zz = z; zz < z + size; zz++) for (let xx = x; xx < x + size; xx++) if (grid[zz * GRID + xx]) return false;
  return true;
}

/** A free spot for a new building, nearest to (cx, cz). */
export function freeSpot(s: Save, size: number, cx: number, cz: number) {
  const grid = occupied(s);
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (let z = 0; z + size <= GRID; z++)
    for (let x = 0; x + size <= GRID; x++) {
      const d = (x + size / 2 - cx) ** 2 + (z + size / 2 - cz) ** 2;
      if (d < bestD && fits(s, size, x, z, -1, grid)) {
        bestD = d;
        best = { x, z };
      }
    }
  return best;
}

// --- Clock -----------------------------------------------------------------------------------------

/** Every barracks trains at once: 2 barracks turn troops out twice as fast (a 10 s troop takes 5 s). */
export function trainSpeed(s: Save) {
  return Math.max(1, builtOf(s, "barracks").length);
}

/** Advances every timer to `now`. Returns what finished, so the 3D view can celebrate it. */
export function tick(s: Save, now: number): TickEvents {
  const ev: TickEvents = { built: [], trained: [], brewed: [], researched: [], cleared: [] };
  const dt = Math.max(0, Math.min(now - s.seen, 1000 * 3600 * 24 * 7)) / 1000;
  s.seen = now;

  // Production (collectors keep filling up to what they hold).
  for (const b of s.buildings) {
    const def = BUILDINGS[b.kind];
    if (!def.rate || b.level < 1) continue;
    b.stored = Math.min(def.hold![b.level - 1], (b.stored ?? 0) + (def.rate[b.level - 1] / 60) * dt);
  }

  // Builders.
  for (const b of s.buildings) {
    if (b.until && b.until <= now) {
      b.until = undefined;
      b.dur = undefined;
      b.level++;
      ev.built.push(b);
      if (b.kind === "townhall") award(s, `th${b.level}`);
      if (b.kind === "goldmine") award(s, "mine");
      if (b.kind === "elixirpump") award(s, "pump");
      if (b.kind === "kingaltar") award(s, "king");
      if (b.kind === "queenaltar") award(s, "queen");
      if (BUILDINGS[b.kind].hero && b.level >= 5) award(s, "hero5");
    }
  }

  // Sleeping heroes heal.
  for (const k of HERO_ORDER) {
    const lv = s.buildings.find((b) => b.kind === HEROES[k].altar)?.level ?? 0;
    if (lv > 0 && s.heroHp[k] < 1) s.heroHp[k] = Math.min(1, s.heroHp[k] + dt / HEROES[k].regen[lv - 1]);
  }
  for (const o of [...s.obstacles]) {
    if (o.until && o.until <= now) {
      s.obstacles.splice(s.obstacles.indexOf(o), 1);
      s.gems += o.gems;
      s.stats.cleared++;
      if (s.stats.cleared >= 5) award(s, "clear5");
      ev.cleared.push(o);
    }
  }

  // Training: troops come out one after another, as fast as the barracks allow and while camps have room.
  const speed = trainSpeed(s);
  while (s.queue.length) {
    const kind = s.queue[0];
    const done = s.queueT + (TROOPS[kind].train / speed) * 1000;
    if (done > now) break;
    if (armySize(s) + TROOPS[kind].housing > housing(s)) {
      s.queueT = now;
      break;
    }
    s.queue.shift();
    s.army[kind] = (s.army[kind] ?? 0) + 1;
    s.queueT = done;
    s.stats.trained++;
    ev.trained.push(kind);
  }
  if (!s.queue.length) s.queueT = now;
  if (s.stats.trained >= 20) award(s, "train20");

  while (s.brew.length) {
    const kind = s.brew[0];
    const done = s.brewT + SPELLS[kind].brew * 1000;
    if (done > now) break;
    if (spellCount(s) >= spellSlots(s)) {
      s.brewT = now;
      break;
    }
    s.brew.shift();
    s.spells[kind] = (s.spells[kind] ?? 0) + 1;
    s.brewT = done;
    ev.brewed.push(kind);
  }
  if (!s.brew.length) s.brewT = now;

  if (s.research && s.research.until <= now) {
    const k = s.research.kind;
    if (k in TROOPS) s.troopLv[k as TroopKind]++;
    else s.spellLv[k as SpellKind]++;
    ev.researched.push(k);
    s.research = null;
    award(s, "lab");
  }

  // New obstacles grow now and then.
  if (now - s.lastObstacle > OBSTACLE_EVERY) {
    const n = Math.min(4, Math.floor((now - s.lastObstacle) / OBSTACLE_EVERY));
    for (let i = 0; i < n && s.obstacles.length < MAX_OBSTACLES; i++) spawnObstacle(s, Math.random);
    s.lastObstacle = now;
  }

  if (countOf(s, "wall") >= 25) award(s, "walls25");
  const stars = totalStars(s);
  if (stars >= 50) award(s, "stars50");
  if (stars >= 150) award(s, "stars150");
  if (stars >= 300) award(s, "stars300");
  return ev;
}

/** Gives an achievement's gems once. Returns true the first time. */
export function award(s: Save, id: string) {
  if (s.ach.includes(id)) return false;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return false;
  s.ach.push(id);
  s.gems += a.gems;
  pendingAwards.push(a.id);
  return true;
}

/** Achievements earned since the UI last looked (drained by the engine for toasts). */
export const pendingAwards: string[] = [];

// --- Actions ---------------------------------------------------------------------------------------

export type Fail = { ok: false; reason: string; need?: { res: "gold" | "elixir"; amount: number } };
export type Ok = { ok: true };

function pay(s: Save, res: "gold" | "elixir" | "gems", amount: number): Ok | Fail {
  if (s[res] < amount) return { ok: false, reason: `Not enough ${res}`, need: res === "gems" ? undefined : { res, amount: amount - s[res] } };
  s[res] -= amount;
  return { ok: true };
}

export function canBuild(s: Save, kind: BKind): { ok: true } | Fail {
  const th = thLevel(s);
  const max = allowed(kind, th);
  if (max === 0) return { ok: false, reason: `Unlocks at Town Hall ${BUILDINGS[kind].counts.findIndex((c) => c > 0) + 1}` };
  if (countOf(s, kind) >= max) return { ok: false, reason: th < 5 ? "Upgrade the Town Hall to build more" : "Maximum reached" };
  return { ok: true };
}

export function place(s: Save, kind: BKind, x: number, z: number, now: number): (Ok & { b: SBuilding }) | Fail {
  const can = canBuild(s, kind);
  if (!can.ok) return can;
  const def = BUILDINGS[kind];
  if (!fits(s, def.size, x, z)) return { ok: false, reason: "No room there" };
  const time = def.time[0];
  if (time > 0 && freeBuilders(s) < 1) return { ok: false, reason: "All builders are busy" };
  const paid = pay(s, def.res === "gems" ? "gems" : def.res, buildCost(s, kind));
  if (!paid.ok) return paid;
  const b: SBuilding = { id: s.nextId++, kind, level: time > 0 ? 0 : 1, x, z };
  if (time > 0) {
    b.until = now + time * 1000;
    b.dur = time;
  }
  if (def.rate) b.stored = 0;
  s.buildings.push(b);
  if (kind === "goldmine") award(s, "mine");
  if (kind === "elixirpump") award(s, "pump");
  return { ok: true, b };
}

export function upgrade(s: Save, b: SBuilding, now: number): Ok | Fail {
  if (b.until) return { ok: false, reason: "Already upgrading" };
  const next = nextLevel(s, b);
  if (!("cost" in next) || next.cost === undefined) return { ok: false, reason: next.reason };
  if (next.time > 0 && freeBuilders(s) < 1) return { ok: false, reason: "All builders are busy" };
  const paid = pay(s, next.res === "gems" ? "gems" : next.res, next.cost);
  if (!paid.ok) return paid;
  if (next.time > 0) {
    b.until = now + next.time * 1000;
    b.dur = next.time;
  } else b.level++;
  return { ok: true };
}

/** Finishes a construction / upgrade / obstacle / research with gems. */
export function finishNow(s: Save, until: number | undefined, now: number) {
  const left = until ? (until - now) / 1000 : 0;
  return Math.max(0, left);
}

export function collect(s: Save, b: SBuilding) {
  const def = BUILDINGS[b.kind];
  if (!def.produces || !b.stored) return 0;
  const res = def.produces;
  const room = Math.max(0, capacity(s, res) - s[res]);
  const amount = Math.floor(Math.min(room, b.stored));
  s[res] += amount;
  b.stored -= amount;
  return amount;
}

export function train(s: Save, kind: TroopKind): Ok | Fail {
  if (barracksLevel(s) < TROOPS[kind].barracks) return { ok: false, reason: `Needs Barracks level ${TROOPS[kind].barracks}` };
  if (armySize(s) + queueSize(s) + TROOPS[kind].housing > housing(s)) return { ok: false, reason: "Army camps are full" };
  const paid = pay(s, "elixir", TROOPS[kind].cost[s.troopLv[kind] - 1]);
  if (!paid.ok) return paid;
  if (!s.queue.length) s.queueT = Date.now();
  s.queue.push(kind);
  return { ok: true };
}

export function untrain(s: Save, kind: TroopKind) {
  const i = s.queue.lastIndexOf(kind);
  if (i < 0) return;
  s.queue.splice(i, 1);
  s.elixir = Math.min(capacity(s, "elixir"), s.elixir + TROOPS[kind].cost[s.troopLv[kind] - 1]);
  if (i === 0) s.queueT = Date.now();
}

export function brew(s: Save, kind: SpellKind): Ok | Fail {
  if (factoryLevel(s) < SPELLS[kind].factory) return { ok: false, reason: `Needs Spell Factory level ${SPELLS[kind].factory}` };
  if (spellCount(s) + s.brew.length >= spellSlots(s)) return { ok: false, reason: "Spell storage is full" };
  const paid = pay(s, "elixir", SPELLS[kind].cost[s.spellLv[kind] - 1]);
  if (!paid.ok) return paid;
  if (!s.brew.length) s.brewT = Date.now();
  s.brew.push(kind);
  return { ok: true };
}

export function unbrew(s: Save, kind: SpellKind) {
  const i = s.brew.lastIndexOf(kind);
  if (i < 0) return;
  s.brew.splice(i, 1);
  s.elixir = Math.min(capacity(s, "elixir"), s.elixir + SPELLS[kind].cost[s.spellLv[kind] - 1]);
  if (i === 0) s.brewT = Date.now();
}

export function researchInfo(s: Save, kind: TroopKind | SpellKind) {
  const isTroop = kind in TROOPS;
  const level = isTroop ? s.troopLv[kind as TroopKind] : s.spellLv[kind as SpellKind];
  const def = isTroop ? TROOPS[kind as TroopKind] : SPELLS[kind as SpellKind];
  const unlocked = isTroop ? barracksLevel(s) >= TROOPS[kind as TroopKind].barracks : factoryLevel(s) >= SPELLS[kind as SpellKind].factory;
  if (level >= 5) return { level, max: true as const };
  return { level, max: false as const, cost: def.research[level - 1], time: def.researchTime[level - 1], needLab: level + 1, ready: unlocked && labLevel(s) >= level + 1, unlocked };
}

export function startResearch(s: Save, kind: TroopKind | SpellKind, now: number): Ok | Fail {
  if (s.research) return { ok: false, reason: "The Laboratory is busy" };
  const info = researchInfo(s, kind);
  if (info.max) return { ok: false, reason: "Max level" };
  if (!info.unlocked) return { ok: false, reason: "Not unlocked yet" };
  if (labLevel(s) < info.needLab) return { ok: false, reason: `Needs Laboratory level ${info.needLab}` };
  const paid = pay(s, "elixir", info.cost);
  if (!paid.ok) return paid;
  s.research = { kind, until: now + info.time * 1000, dur: info.time };
  return { ok: true };
}

export function startClearing(s: Save, o: SObstacle, now: number): Ok | Fail {
  if (o.until) return { ok: false, reason: "Already clearing" };
  if (freeBuilders(s) < 1) return { ok: false, reason: "All builders are busy" };
  const paid = pay(s, o.res, o.cost);
  if (!paid.ok) return paid;
  o.dur = 5;
  o.until = now + 5000;
  return { ok: true };
}

function spawnObstacle(s: Save, rand: () => number) {
  const grid = occupied(s);
  for (let tries = 0; tries < 60; tries++) {
    const model = Math.floor(rand() * OBSTACLE_MODELS);
    const size = model < 3 ? 2 : 1;
    const x = Math.floor(rand() * (GRID - size));
    const z = Math.floor(rand() * (GRID - size));
    // Keep the middle of the map clear.
    if (Math.abs(x - GRID / 2) < 8 && Math.abs(z - GRID / 2) < 8) continue;
    if (!fits(s, size, x, z, -1, grid)) continue;
    const gemRoll = [0, 0, 1, 1, 2, 2, 3, 4, 5, 6];
    const res = rand() < 0.5 ? "gold" : "elixir";
    s.obstacles.push({ id: s.nextId++, model, x, z, size, gems: gemRoll[Math.floor(rand() * gemRoll.length)], cost: (size === 2 ? 250 : 100) * (1 + Math.floor(rand() * 3)), res });
    return;
  }
}

/** Removes troops (and spells) used in a battle from the army. */
export function spendArmy(s: Save, troops: Partial<Record<TroopKind, number>>, spells: Partial<Record<SpellKind, number>>) {
  for (const k of TROOP_ORDER) s.army[k] = Math.max(0, (s.army[k] ?? 0) - (troops[k] ?? 0));
  for (const k of SPELL_ORDER) s.spells[k] = Math.max(0, (s.spells[k] ?? 0) - (spells[k] ?? 0));
}

/** Adds loot, capped by storage. */
export function gain(s: Save, gold: number, elixir: number) {
  s.gold = Math.min(capacity(s, "gold"), s.gold + Math.max(0, Math.round(gold)));
  s.elixir = Math.min(capacity(s, "elixir"), s.elixir + Math.max(0, Math.round(elixir)));
}

/** Validates a loaded save (falls back to a new village when it is unusable). */
export function sanitize(raw: unknown): Save | null {
  const s = raw as Save;
  if (!s || s.v !== 1 || !Array.isArray(s.buildings) || !s.buildings.some((b) => b.kind === "townhall")) return null;
  const base = baseSave(Date.now());
  const merged = { ...base, ...s, stats: { ...base.stats, ...s.stats }, troopLv: { ...base.troopLv, ...s.troopLv }, spellLv: { ...base.spellLv, ...s.spellLv }, heroHp: { ...base.heroHp, ...s.heroHp } };
  merged.buildings = merged.buildings.filter((b) => b && b.kind in BUILDINGS);
  // Repair saves where buildings overlap (or poke out of the map): move them to the nearest free spot.
  for (const b of merged.buildings) {
    const n = BUILDINGS[b.kind].size;
    if (fits(merged, n, b.x, b.z, b.id)) continue;
    const others = merged.buildings.filter((o) => o !== b);
    const spot = freeSpot({ ...merged, buildings: others }, n, b.x + n / 2, b.z + n / 2);
    if (spot) {
      b.x = spot.x;
      b.z = spot.z;
    }
  }
  return merged;
}
