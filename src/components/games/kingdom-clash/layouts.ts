/**
 * Kingdom Clash — enemy villages. Each of the 100 campaign stages is generated from its stage
 * number (seeded), so a stage always looks the same: Town Hall in the middle, storages and
 * defences packed around it behind walls, collectors and army buildings outside. Pure TypeScript.
 */
import { allowed, BUILDINGS, GRID, type BKind, type RaiderKind } from "./data";

export function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRE = ["Thorn", "Mud", "Crag", "Ash", "Iron", "Raven", "Oak", "Stone", "Frost", "Ember", "Gold", "Moss", "Wolf", "Briar", "Storm", "Copper", "Shadow", "Bramble", "Hollow", "Grim", "Willow", "Amber", "Dusk", "Red", "Black", "Silver", "High", "Elder", "Bright", "Fox"];
const SUF = ["wick", "ford", "hold", "moor", "vale", "stead", "burg", "haven", "gate", "fell", "watch", "crest", "mere", "keep", "reach", "brook", "field", "hollow", "spire", "rock"];

export function villageName(rand: () => number = Math.random) {
  const a = PRE[Math.floor(rand() * PRE.length)];
  let b = SUF[Math.floor(rand() * SUF.length)];
  if (a.toLowerCase().endsWith(b[0])) b = SUF[(SUF.indexOf(b) + 3) % SUF.length];
  return a + b;
}

export interface EnemyBuilding {
  kind: BKind;
  level: number;
  x: number;
  z: number;
  gold?: number;
  elixir?: number;
}

export interface Stage {
  stage: number;
  name: string;
  th: number;
  buildings: EnemyBuilding[];
  /** Total loot on offer (gold, elixir). */
  gold: number;
  elixir: number;
  /** One-off bonus for the first clear. */
  bonusGold: number;
  bonusElixir: number;
  bonusGems: number;
  difficulty: string;
  /** Elite bases late in each Town Hall band: hitpoints and damage multiplier. */
  power: number;
}

/** Loot on offer per resource at a stage. */
export const stageLoot = (s: number) => Math.round((1400 * Math.pow(1.042, s - 1)) / 10) * 10;

/** The last stages of every Town Hall band are "elite": up to +45% strength at stage 100. */
export function elitePower(s: number) {
  const band = ((s - 1) % 20) / 19;
  const k = Math.max(0, band - 0.4) / 0.6;
  return Math.round((1 + k * (0.15 + 0.06 * stageTh(s))) * 100) / 100;
}

export function stageTh(s: number) {
  return Math.min(5, 1 + Math.floor((s - 1) / 20));
}

const cache = new Map<number, Stage>();

export function stage(s: number): Stage {
  let st = cache.get(s);
  if (!st) {
    st = makeStage(s);
    cache.set(s, st);
  }
  return st;
}

function makeStage(s: number): Stage {
  const rand = seeded(s * 7919 + 13);
  const th = stageTh(s);
  const band = ((s - 1) % 20) / 19;
  // Early stages are gentle; each band climbs from "Town Hall just reached" to "maxed for its TH".
  const fill = s <= 3 ? 0.3 : 0.45 + 0.55 * band;
  const list = layout(rand, th, band, fill, { oneDefence: s <= 2, walls: s >= 5 });

  // Loot: storages hold most of it, collectors and the Town Hall the rest.
  const total = stageLoot(s);
  shareLoot(list, total, total);

  const nameRand = seeded(s * 104729 + 7);
  const difficulty = s <= 3 ? "Very easy" : band < 0.3 ? "Easy" : band < 0.6 ? "Medium" : band < 0.85 ? "Hard" : "Very hard";
  return {
    stage: s,
    name: villageName(nameRand),
    th,
    buildings: list,
    gold: total,
    elixir: total,
    bonusGold: Math.round(total * 0.5),
    bonusElixir: Math.round(total * 0.5),
    bonusGems: s % 5 === 0 ? 5 + Math.floor(s / 10) : 1,
    difficulty,
    power: elitePower(s),
  };
}

/**
 * An enemy village of Town Hall `th`: `band` (0..1) is how far it has grown within its Town Hall
 * level (building levels), `fill` how many of the allowed buildings it has.
 */
function layout(rand: () => number, th: number, band: number, fill: number, opts: { oneDefence?: boolean; walls: boolean }): EnemyBuilding[] {
  const lvl = (kind: BKind) => {
    const cap = Math.min(BUILDINGS[kind].maxLevel, th);
    const v = Math.round(th - 1.3 + band * 1.5 + (rand() - 0.5) * 0.9);
    return Math.max(1, Math.min(cap, v));
  };
  const count = (kind: BKind, min = 0) => Math.max(min, Math.round(allowed(kind, th) * fill));

  const list: EnemyBuilding[] = [];
  const storages: BKind[] = [];
  for (let i = 0; i < count("goldstorage", 1); i++) storages.push("goldstorage");
  for (let i = 0; i < count("elixirstorage", 1); i++) storages.push("elixirstorage");
  // Hero altars sit in the core, so their heroes guard it.
  for (const k of ["kingaltar", "queenaltar"] as BKind[]) if (allowed(k, th) && (band > 0.25 || rand() < 0.5)) storages.splice(1, 0, k);
  const defences: BKind[] = [];
  for (let i = 0; i < count("magetower"); i++) defences.push("magetower");
  for (let i = 0; i < count("tesla"); i++) defences.push("tesla");
  for (let i = 0; i < count("catapult"); i++) defences.push("catapult");
  for (let i = 0; i < count("cannon", 1); i++) defences.push("cannon");
  for (let i = 0; i < count("archertower"); i++) defences.push("archertower");
  if (opts.oneDefence) defences.length = 1;
  // Interleave storages and defences so defences cover the core.
  const core: BKind[] = [];
  while (storages.length || defences.length) {
    if (defences.length) core.push(defences.shift()!);
    if (storages.length) core.push(storages.shift()!);
  }
  const outer: BKind[] = [];
  for (let i = 0; i < count("goldmine", 1); i++) outer.push("goldmine");
  for (let i = 0; i < count("elixirpump", 1); i++) outer.push("elixirpump");
  for (let i = 0; i < count("barracks", 1); i++) outer.push("barracks");
  for (let i = 0; i < count("camp", 1); i++) outer.push("camp");
  for (let i = 0; i < Math.max(2, count("builder")); i++) outer.push("builder");
  if (allowed("lab", th) && rand() < 0.4 + band) outer.push("lab");
  if (allowed("spellfactory", th) && rand() < 0.3 + band) outer.push("spellfactory");
  // Shuffle the outer ring a little.
  for (let i = outer.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [outer[i], outer[j]] = [outer[j], outer[i]];
  }

  const grid = new Uint8Array(GRID * GRID);
  const free = (x: number, z: number, n: number, pad: number) => {
    if (x - pad < 0 || z - pad < 0 || x + n + pad > GRID || z + n + pad > GRID) return false;
    for (let zz = z - pad; zz < z + n + pad; zz++) for (let xx = x - pad; xx < x + n + pad; xx++) if (grid[zz * GRID + xx]) return false;
    return true;
  };
  const put = (kind: BKind, x: number, z: number, level = lvl(kind)) => {
    const n = BUILDINGS[kind].size;
    for (let zz = z; zz < z + n; zz++) for (let xx = x; xx < x + n; xx++) grid[zz * GRID + xx] = kind === "wall" ? 2 : 1;
    const b: EnemyBuilding = { kind, level, x, z };
    list.push(b);
    return b;
  };

  // Town Hall near the middle.
  const half = GRID / 2;
  const cx = half - 2 + Math.floor(rand() * 3) - 1;
  const cz = half - 2 + Math.floor(rand() * 3) - 1;
  const thB = put("townhall", cx, cz, th);
  const mid = { x: cx + 2, z: cz + 2 };

  // Candidate spots sorted by distance (with a little noise for variety).
  const spots = (n: number, minR: number, maxR: number, noise: number) => {
    const out: { x: number; z: number; d: number }[] = [];
    for (let z = 0; z + n <= GRID; z++)
      for (let x = 0; x + n <= GRID; x++) {
        const d = Math.max(Math.abs(x + n / 2 - mid.x), Math.abs(z + n / 2 - mid.z)) * 0.7 + Math.hypot(x + n / 2 - mid.x, z + n / 2 - mid.z) * 0.3;
        if (d >= minR && d <= maxR) out.push({ x, z, d: d + rand() * noise });
      }
    return out.sort((a, b) => a.d - b.d);
  };
  const corePlaced: EnemyBuilding[] = [thB];
  for (const kind of core) {
    const n = BUILDINGS[kind].size;
    const spot = spots(n, 2, 16, 0.9).find((p) => free(p.x, p.z, n, 1));
    if (spot) corePlaced.push(put(kind, spot.x, spot.z));
  }

  // Walls: a closed ring around as much of the core as the walls allow (from stage 5 on); leftover
  // walls make a second, outer ring or split the inside into compartments.
  let walls = !opts.walls ? 0 : Math.round(allowed("wall", th) * Math.min(1, fill + 0.15));
  const wallLvl = lvl("wall");
  const box = (bs: EnemyBuilding[], m = 1) => {
    let x0 = GRID;
    let z0 = GRID;
    let x1 = 0;
    let z1 = 0;
    for (const b of bs) {
      const n = BUILDINGS[b.kind].size;
      x0 = Math.min(x0, b.x);
      z0 = Math.min(z0, b.z);
      x1 = Math.max(x1, b.x + n - 1);
      z1 = Math.max(z1, b.z + n - 1);
    }
    return { x0: Math.max(0, x0 - m), z0: Math.max(0, z0 - m), x1: Math.min(GRID - 1, x1 + m), z1: Math.min(GRID - 1, z1 + m) };
  };
  const ringTiles = (r: { x0: number; z0: number; x1: number; z1: number }) => {
    const out: { x: number; z: number }[] = [];
    for (let x = r.x0; x <= r.x1; x++) out.push({ x, z: r.z0 }, { x, z: r.z1 });
    for (let z = r.z0 + 1; z < r.z1; z++) out.push({ x: r.x0, z }, { x: r.x1, z });
    return out.filter((p) => !grid[p.z * GRID + p.x]);
  };
  const byDist = [...corePlaced].sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  let inner: ReturnType<typeof box> | null = null;
  if (walls > 0) {
    // Enclose as many core buildings as the walls allow — with a tile of space between the walls and
    // the buildings when there are walls enough, so nothing touches.
    outer: for (let k = byDist.length; k >= 1; k--) {
      for (const m of [2, 1]) {
        const r = box(byDist.slice(0, k), m);
        const tiles = ringTiles(r);
        if (tiles.length <= walls) {
          for (const p of tiles) put("wall", p.x, p.z, wallLvl);
          walls -= tiles.length;
          inner = r;
          break outer;
        }
      }
    }
  }
  const allBox = box(corePlaced);
  if (inner && walls > 0) {
    const outerRing = { x0: Math.max(0, allBox.x0 - 1), z0: Math.max(0, allBox.z0 - 1), x1: Math.min(GRID - 1, allBox.x1 + 1), z1: Math.min(GRID - 1, allBox.z1 + 1) };
    const tiles = ringTiles(outerRing);
    if (tiles.length <= walls && (outerRing.x1 - outerRing.x0 > inner.x1 - inner.x0 + 3)) {
      for (const p of tiles) put("wall", p.x, p.z, wallLvl);
      walls -= tiles.length;
    }
    if (walls > 0) {
      // Compartments: a cross through the inner ring.
      const mx = Math.round((inner.x0 + inner.x1) / 2 + (rand() - 0.5) * 2);
      const mz = Math.round((inner.z0 + inner.z1) / 2 + (rand() - 0.5) * 2);
      const cross: { x: number; z: number }[] = [];
      for (let z = inner.z0 + 1; z < inner.z1; z++) cross.push({ x: mx, z });
      for (let x = inner.x0 + 1; x < inner.x1; x++) if (x !== mx) cross.push({ x, z: mz });
      for (const p of cross) {
        if (walls <= 0) break;
        if (grid[p.z * GRID + p.x]) continue;
        put("wall", p.x, p.z, wallLvl);
        walls--;
      }
    }
  }

  // Traps between the defences.
  const trapBox = inner ?? allBox;
  const bombs = count("bomb");
  for (let i = 0, tries = 0; i < bombs && tries < 300; tries++) {
    const x = trapBox.x0 + 1 + Math.floor(rand() * Math.max(1, trapBox.x1 - trapBox.x0 - 1));
    const z = trapBox.z0 + 1 + Math.floor(rand() * Math.max(1, trapBox.z1 - trapBox.z0 - 1));
    if (grid[z * GRID + x]) continue;
    put("bomb", x, z);
    i++;
  }

  const skelTraps = count("skeltrap");
  for (let i = 0, tries = 0; i < skelTraps && tries < 300; tries++) {
    const x = trapBox.x0 + 1 + Math.floor(rand() * Math.max(1, trapBox.x1 - trapBox.x0 - 1));
    const z = trapBox.z0 + 1 + Math.floor(rand() * Math.max(1, trapBox.z1 - trapBox.z0 - 1));
    if (grid[z * GRID + x]) continue;
    put("skeltrap", x, z);
    i++;
  }

  // Everything else around the outside.
  const reach = Math.max(allBox.x1 - mid.x, mid.x - allBox.x0, allBox.z1 - mid.z, mid.z - allBox.z0);
  for (const kind of outer) {
    const n = BUILDINGS[kind].size;
    const spot =
      spots(n, reach + 0.5, 30, 2.5).find((p) => free(p.x, p.z, n, 1)) ?? spots(n, 0, 30, 0).find((p) => free(p.x, p.z, n, 1));
    if (spot) put(kind, spot.x, spot.z);
  }
  return list;
}

/** Puts loot in a village: storages hold most of it, collectors and the Town Hall the rest. */
function shareLoot(list: EnemyBuilding[], gold: number, elixir: number) {
  const share = (kinds: BKind[], res: "gold" | "elixir", amount: number) => {
    const holders = list.filter((b) => kinds.includes(b.kind));
    for (const b of holders) b[res] = (b[res] ?? 0) + Math.round(amount / holders.length);
  };
  share(["goldstorage"], "gold", gold * 0.6);
  share(["elixirstorage"], "elixir", elixir * 0.6);
  share(["goldmine"], "gold", gold * 0.25);
  share(["elixirpump"], "elixir", elixir * 0.25);
  share(["townhall"], "gold", gold * 0.15);
  share(["townhall"], "elixir", elixir * 0.15);
}

// --- Online battles: random rival villages at your Town Hall level --------------------------------------

/** Typical loot per resource in an online village, by its Town Hall level (each rival has 0.7–1.5× this). */
export const ONLINE_LOOT = [4000, 9000, 22000, 45000, 90000];

/** Gold it costs to look for a rival (and to skip to the next one). */
export const searchCost = (th: number) => 25 + 25 * th * th;

export interface OnlineBase extends Stage {
  /** The rival chief's name. */
  owner: string;
  /** Trophies for a 3-star win, and lost on a defeat. */
  trophies: { win: number; lose: number };
}

const CHIEF_A = ["Shadow", "Iron", "Storm", "Dragon", "Night", "Fire", "Frost", "Thunder", "Golden", "Royal", "Wild", "Silent", "Brave", "Lucky", "Mighty", "Swift", "Dark", "Crimson", "Steel", "Mystic", "Red", "Stone", "Silver", "Rune"];
const CHIEF_B = ["Wolf", "King", "Hunter", "Slayer", "Knight", "Raider", "Warrior", "Lord", "Queen", "Blade", "Archer", "Titan", "Fox", "Hawk", "Rider", "Viking", "Chief", "Tiger", "Lion", "Bear", "Giant", "Mage"];
const CHIEF_NAMES = ["Arun", "Karthik", "Priya", "Vijay", "Surya", "Deepa", "Rahul", "Meena", "Ravi", "Anjali", "Siva", "Kavya", "Ajith", "Nila", "Bala", "Divya", "Hari", "Lakshmi"];

function chiefName(rand: () => number) {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const num = rand() < 0.55 ? String(1 + Math.floor(rand() * (rand() < 0.5 ? 99 : 999))) : "";
  if (rand() < 0.3) return `${pick(CHIEF_NAMES)}${rand() < 0.5 ? "_" : ""}${num || pick(CHIEF_B)}`;
  return `${pick(CHIEF_A)}${pick(CHIEF_B)}${num}`;
}

/**
 * A random rival village for an online battle: mostly your own Town Hall level (sometimes one above
 * or below), anywhere from freshly upgraded to maxed out, walled, with plenty of loot.
 */
export function onlineBase(playerTh: number, seed: number): OnlineBase {
  const rand = seeded(seed);
  const r = rand();
  const th = Math.max(1, Math.min(5, playerTh + (r < 0.15 ? -1 : r > 0.85 ? 1 : 0)));
  const band = 0.1 + rand() * 0.9;
  const fill = 0.45 + 0.55 * band;
  const list = layout(rand, th, band, fill, { walls: true });
  const rich = 0.7 + rand() * 0.8;
  const round = (n: number) => Math.round(n / 10) * 10;
  const gold = round(ONLINE_LOOT[th - 1] * rich * (0.8 + rand() * 0.4));
  const elixir = round(ONLINE_LOOT[th - 1] * rich * (0.8 + rand() * 0.4));
  shareLoot(list, gold, elixir);
  const diff = th - playerTh;
  return {
    stage: 0,
    name: villageName(rand),
    owner: chiefName(rand),
    th,
    buildings: list,
    gold,
    elixir,
    bonusGold: 0,
    bonusElixir: 0,
    bonusGems: 0,
    difficulty: diff > 0 ? "Stronger" : diff < 0 ? "Weaker" : band > 0.7 ? "Tough" : "Even",
    power: 1,
    trophies: { win: Math.max(8, Math.round(18 + diff * 6 + rand() * 10)), lose: Math.max(4, Math.round(11 - diff * 4 + rand() * 6)) },
  };
}

// --- Raiders on your village ------------------------------------------------------------------------

export interface RaidArmy {
  units: { kind: RaiderKind; level: number }[];
  name: string;
}

/** A raider army scaled to your Town Hall (and how many defences you've held before). */
export function raiderArmy(th: number, held: number, rand: () => number = Math.random): RaidArmy {
  const level = Math.max(1, Math.min(5, th));
  let budget = 10 + th * 9 + Math.min(20, held * 2);
  const units: { kind: RaiderKind; level: number }[] = [];
  const zombies = Math.min(Math.floor(budget / 18), th);
  for (let i = 0; i < zombies; i++) units.push({ kind: "zombie", level });
  budget -= zombies * 5;
  while (budget > 0) {
    const r = rand();
    const kind: RaiderKind = r < 0.5 ? "skeleton" : r < 0.75 ? "keeper" : "vampire";
    units.push({ kind, level });
    budget -= 1;
  }
  return { units, name: `The ${["Bone", "Grave", "Night", "Crypt", "Ashen"][Math.floor(rand() * 5)]} Horde` };
}
