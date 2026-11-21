import * as THREE from "three";
import type { IslandDef } from "./campaign";
import { DAY } from "./data";
import type { ItemId } from "./data";
import { ISLE, ITEM, WORLD } from "./manifest";
import { composeMatrix, InstanceSet, type Baked } from "./props";
import { CAMP, COVE, HILL, Island, POND, rng } from "./terrain";

/**
 * Everything that grows or lies on an island: trees, palms, rocks, bushes, berries, mushrooms,
 * driftwood, pebbles, a wreck or an old camp with its crates, a buried chest, bottles and fishing
 * spots — how much of each is the island's own (campaign.ts). Placed from the island's seed (so a
 * save only stores what changed), drawn as instanced meshes, and animated when hit, felled, cracked
 * or regrown.
 */

export type NodeKind = "tree" | "palm" | "rock" | "bush" | "berry" | "mushroom" | "driftwood" | "pebble" | "crate" | "bottle" | "fish" | "boulder";

export interface Part {
  set: InstanceSet;
  index: number;
  ox: number;
  oy: number;
  oz: number;
  rot: number;
  scale: number;
}

export interface Node {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  /** Collision radius (0 = walk-through). */
  r: number;
  /** Extra reach for interacting with it. */
  reach: number;
  main: Part | null;
  /** Fruit / decorations riding on it (berries, coconuts). */
  extras: Part[];
  stump: Part | null;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Clock time it comes back (when not alive). */
  regrowAt: number;
  /** Berries / coconuts / fish left. */
  charges: number;
  maxCharges: number;
  /** Hit shake (seconds left) and regrow pop (0..1). */
  shake: number;
  grow: number;
  loot: Partial<Record<ItemId, number>> | null;
  /** Which note (bottles) or loot set. */
  tag: number;
  /** Flotsam slots are placed fresh each morning. */
  floating: boolean;
  /** The buried chest: not there until it is revealed. */
  hidden: boolean;
  /** Camera-occlusion dither (0 = solid). */
  fade: number;
}

/** Tags of crates: 0–9 the wreck's or the cache's, 10+ flotsam, 20 the buried chest. */
export const TREASURE_TAG = 20;

export interface Collider {
  x: number;
  z: number;
  r: number;
}

interface Falling {
  mesh: THREE.Mesh;
  t: number;
  axis: THREE.Vector3;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  landed: boolean;
}

/** Common scale for the Survival Kit (its pieces are tiny) so trees, rocks, tools and walls match. */
export const SURVIVAL_SCALE = 3.6;

/** How every world model is baked (fit). */
export const WORLD_FITS: Record<string, { scale: number }> = {
  [WORLD.tree]: { scale: SURVIVAL_SCALE },
  [WORLD.treeTall]: { scale: SURVIVAL_SCALE },
  [WORLD.treeAutumn]: { scale: SURVIVAL_SCALE },
  [WORLD.stump]: { scale: SURVIVAL_SCALE },
  [WORLD.stumpAutumn]: { scale: SURVIVAL_SCALE },
  [WORLD.log]: { scale: SURVIVAL_SCALE },
  [WORLD.driftwood]: { scale: SURVIVAL_SCALE * 0.75 },
  [WORLD.palm]: { scale: 1.4 },
  [WORLD.palmBend]: { scale: 1.4 },
  [WORLD.palmDetailed]: { scale: 1.4 },
  [WORLD.palmDetailedBend]: { scale: 1.4 },
  [WORLD.rockA]: { scale: SURVIVAL_SCALE },
  [WORLD.rockB]: { scale: SURVIVAL_SCALE },
  [WORLD.rockC]: { scale: SURVIVAL_SCALE },
  [WORLD.sandRockA]: { scale: SURVIVAL_SCALE },
  [WORLD.sandRockB]: { scale: SURVIVAL_SCALE },
  [WORLD.sandRockC]: { scale: SURVIVAL_SCALE },
  [WORLD.flatRock]: { scale: SURVIVAL_SCALE * 0.9 },
  [WORLD.bouldersA]: { scale: 0.75 },
  [WORLD.bouldersB]: { scale: 0.75 },
  [WORLD.bouldersC]: { scale: 0.75 },
  [WORLD.sandBouldersA]: { scale: 0.7 },
  [WORLD.sandBouldersC]: { scale: 0.7 },
  [WORLD.bush]: { scale: 1.45 },
  [WORLD.grassPatch]: { scale: 1.0 },
  [WORLD.grassTuft]: { scale: 1.3 },
  [WORLD.grass]: { scale: SURVIVAL_SCALE },
  [WORLD.grassLarge]: { scale: SURVIVAL_SCALE },
  [WORLD.mushrooms]: { scale: 2.6 },
  [WORLD.mushroomsRed]: { scale: 2.4 },
  [WORLD.flowerRed]: { scale: 2.6 },
  [WORLD.flowerYellow]: { scale: 2.6 },
  [WORLD.flowerPurple]: { scale: 2.6 },
  [WORLD.lily]: { scale: 4 },
  [WORLD.wreck]: { scale: 1.25 },
  [WORLD.crate]: { scale: 1.0 },
  [WORLD.barrel]: { scale: 0.8 },
  [WORLD.treasure]: { scale: 0.75 },
  [WORLD.bottle]: { scale: 0.45 },
  [WORLD.signpost]: { scale: SURVIVAL_SCALE },
  [ITEM.berries]: { scale: 2.3 },
  [ITEM.coconut]: { scale: 1.5 },
  [ITEM.stone]: { scale: SURVIVAL_SCALE },
  [ITEM.stoneLarge]: { scale: SURVIVAL_SCALE * 0.8 },
  [ISLE.oak]: { scale: 4.3 },
  [ISLE.pineRound]: { scale: 4.0 },
  [ISLE.pineTall]: { scale: 4.0 },
  [ISLE.cactusTall]: { scale: 3.4 },
  [ISLE.cactusShort]: { scale: 3.4 },
  [ISLE.snowA]: { scale: 2.9 },
  [ISLE.snowB]: { scale: 2.9 },
  [ISLE.snowC]: { scale: 2.9 },
  [ISLE.snowPile]: { scale: 2.2 },
  [ISLE.pineCrooked]: { scale: 2.7 },
  [ISLE.pineFall]: { scale: 2.7 },
  [ISLE.graveCross]: { scale: 1.7 },
  [ISLE.graveRound]: { scale: 1.9 },
};

const TREE_HP = 5;
const ROCK_HP = 6;

/** How long things take to come back, in seconds of game time. */
const REGROW: Record<NodeKind, number> = {
  tree: DAY * 1.4,
  palm: DAY,
  rock: DAY * 2,
  bush: 100,
  berry: DAY * 0.8,
  mushroom: DAY,
  driftwood: 0,
  pebble: 0,
  crate: 0,
  bottle: 0,
  fish: DAY * 0.5,
  boulder: 0,
};

type Plan = {
  kind: NodeKind | "deco";
  model: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  r: number;
  extras?: string[];
  stump?: string;
  loot?: Partial<Record<ItemId, number>> | null;
  tag?: number;
  floating?: boolean;
  hidden?: boolean;
};

export class World {
  readonly nodes: Node[] = [];
  readonly sets = new Map<string, InstanceSet>();
  readonly group = new THREE.Group();
  /** Static solids that aren't nodes (the wreck's hull). */
  readonly statics: Collider[] = [];
  readonly wreck: THREE.Mesh | null = null;
  /** Beach spots for flotsam. */
  readonly beachSpots: { x: number; z: number; rot: number }[] = [];
  /** The wreck's or the cache's crates and the buried chest: they sparkle until opened. */
  readonly specials: Node[] = [];
  /** Where the island's inland cache is (null = none). */
  cacheSpot: { x: number; z: number } | null = null;
  private readonly grid = new Map<number, number[]>();
  private readonly animating = new Set<Node>();
  private readonly falling: Falling[] = [];
  private readonly baked: Map<string, Baked>;
  onTreeLand: ((x: number, z: number, dirX: number, dirZ: number) => void) | null = null;

  constructor(
    private readonly island: Island,
    baked: Map<string, Baked>,
    private readonly def: IslandDef,
  ) {
    this.baked = baked;
    const plan = this.plan();
    // One instanced mesh per model, sized to what was planned.
    const counts = new Map<string, number>();
    for (const p of plan) if (p.model) counts.set(p.model, (counts.get(p.model) ?? 0) + 1);
    for (const p of plan) for (const e of p.extras ?? []) counts.set(e, (counts.get(e) ?? 0) + 1);
    for (const p of plan) if (p.stump) counts.set(p.stump, (counts.get(p.stump) ?? 0) + 1);
    for (const [model, count] of counts) {
      const b = baked.get(model);
      if (!b) continue;
      const small = model === WORLD.grass || model === WORLD.grassLarge || model.includes("flower") || model === WORLD.lily || model === WORLD.grassTuft || model === ISLE.snowPile;
      const set = new InstanceSet(b, count, { shadows: !small });
      this.sets.set(model, set);
      this.group.add(set.mesh);
    }
    for (const p of plan) this.instantiate(p);
    // The wreck: one big mesh, half sunk and listing.
    const wb = def.wreck ? baked.get(WORLD.wreck) : undefined;
    if (wb) {
      const mesh = new THREE.Mesh(wb.geometry, wb.material);
      mesh.position.set(COVE.x, -0.9, COVE.z + 1.5);
      mesh.rotation.set(0.05, 0.75, 0.22, "YXZ");
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      (this as { wreck: THREE.Mesh | null }).wreck = mesh;
      // Hull colliders along its keel.
      const dx = Math.sin(0.75);
      const dz = Math.cos(0.75);
      for (let i = -5; i <= 5; i += 1.4) this.statics.push({ x: mesh.position.x + dx * i, z: mesh.position.z + dz * i, r: 1.9 - Math.abs(i) * 0.12 });
    }
    for (const set of this.sets.values()) set.flush();
  }

  // --- Placement -----------------------------------------------------------------------------------

  private plan() {
    const out: Plan[] = [];
    const def = this.def;
    const f = def.flora;
    // Island 1's seed (7) gives 4242, the seed its layout was tuned with.
    const r = rng(def.terrain.seed * 606);
    const isl = this.island;
    const hasPond = POND.r > 0;
    const taken: { x: number; z: number; r: number }[] = [];
    const free = (x: number, z: number, rad: number) => {
      for (const t of taken) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + rad) ** 2) return false;
      return true;
    };
    const nearPond = (x: number, z: number, margin: number) => hasPond && Math.hypot(x - POND.x, z - POND.z) < POND.r + margin;
    const keepClear = (x: number, z: number) => Math.hypot(x - CAMP.x, z - CAMP.z) < 8.5 || Math.hypot(x - (COVE.x - 2), z - (COVE.z - 2)) < 11.5 || nearPond(x, z, 0.8);
    const scatter = (count: number, tries: number, rad: number, ok: (x: number, z: number) => boolean, make: (x: number, z: number) => Plan | null) => {
      let placed = 0;
      for (let i = 0; i < tries && placed < count; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 62;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (!ok(x, z) || !free(x, z, rad) || keepClear(x, z)) continue;
        const p = make(x, z);
        if (!p) continue;
        out.push(p);
        taken.push({ x, z, r: rad });
        placed++;
      }
    };
    const biome = (x: number, z: number) => isl.biome(x, z);
    const pick = <T>(arr: T[]) => arr[Math.floor(r() * arr.length)];
    const land = (x: number, z: number) => {
      const b = biome(x, z);
      return b === "grass" || b === "forest" || (b === "beach" && isl.height(x, z) > 0.4);
    };

    // The inland cache (an old camp) and the buried chest take their spots first.
    if (def.cache) {
      for (let k = 0; k < 80 && !this.cacheSpot; k++) {
        const a = -Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.09;
        const d = isl.coast(a) * (0.5 + (k % 5) * 0.04);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const b = biome(x, z);
        if ((b !== "grass" && b !== "forest") || isl.slope(x, z) > 0.45 || keepClear(x, z) || Math.hypot(x - HILL.x, z - HILL.z) < HILL.r * 0.75) continue;
        this.cacheSpot = { x, z };
      }
      const c = this.cacheSpot ?? (this.cacheSpot = { x: CAMP.x + 14, z: CAMP.z - 14 });
      taken.push({ x: c.x, z: c.z, r: 5 });
      def.cache.loot.forEach((loot, i) => {
        const a = (i / def.cache!.loot.length) * Math.PI * 2 + 0.5;
        out.push({ kind: "crate", model: i === 1 ? WORLD.barrel : WORLD.crate, x: c.x + Math.cos(a) * 2.1, z: c.z + Math.sin(a) * 2.1, rot: r() * 6.28, scale: 1, r: i === 1 ? 0.6 : 0.7, loot, tag: i });
      });
      out.push({ kind: "deco", model: WORLD.signpost, x: c.x, z: c.z, rot: r() * 6.28, scale: 1, r: 0.2 });
      out.push({ kind: "deco", model: WORLD.log, x: c.x - 1.2, z: c.z + 3.4, rot: r() * 6.28, scale: 0.9, r: 0 });
    }
    if (def.treasure) {
      let spot: { x: number; z: number } | null = null;
      for (let k = 0; k < 80 && !spot; k++) {
        const a = -0.9 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.08;
        const d = isl.coast(a) * (0.82 - (k % 4) * 0.04);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const h = isl.height(x, z);
        if (h < 0.45 || isl.slope(x, z) > 0.5 || keepClear(x, z) || !free(x, z, 3)) continue;
        spot = { x, z };
      }
      const t = spot ?? { x: CAMP.x + 16, z: CAMP.z - 8 };
      taken.push({ x: t.x, z: t.z, r: 3 });
      out.push({ kind: "crate", model: WORLD.treasure, x: t.x, z: t.z, rot: r() * 6.28, scale: 1, r: 0.7, loot: def.treasure, tag: TREASURE_TAG, hidden: true });
    }

    // Boulders first (big), then trees, palms, rocks, plants.
    scatter(f.boulders, 400, 3.2, (x, z) => (biome(x, z) === "rock" && isl.height(x, z) > 2) || (biome(x, z) === "beach" && r() < 0.15), (x, z) => {
      const sandy = biome(x, z) === "beach";
      const model = sandy ? pick([WORLD.sandBouldersA, WORLD.sandBouldersC]) : pick([WORLD.bouldersA, WORLD.bouldersB, WORLD.bouldersC]);
      const scale = 0.7 + r() * 0.45;
      return { kind: "boulder", model, x, z, rot: r() * 6.28, scale, r: 1.7 * scale };
    });
    const hillTree = f.treeModels.length >= 3 ? f.treeModels[f.treeModels.length - 1] : null;
    const commonTrees = hillTree ? f.treeModels.slice(0, -1) : f.treeModels;
    scatter(f.trees, 3000, 2.2, (x, z) => {
      const b = biome(x, z);
      return (b === "forest" && r() < 0.95) || (b === "grass" && r() < 0.4) || (b === "rock" && isl.height(x, z) < 5 && r() < 0.25);
    }, (x, z) => {
      const nearHill = Math.hypot(x - HILL.x, z - HILL.z) < HILL.r * 1.2;
      const [model, stump] = hillTree && nearHill && r() < 0.45 ? hillTree : pick(commonTrees);
      return { kind: "tree", model, x, z, rot: r() * 6.28, scale: 0.85 + r() * 0.35, r: 0.42, stump };
    });
    // Dry islands keep their palms around the oasis.
    const oasis = f.trees < 20;
    scatter(f.palms, 3000, 2.4, (x, z) => {
      const h = isl.height(x, z);
      const b = biome(x, z);
      return (b === "beach" && h > 0.35) || (b === "grass" && Math.hypot(x, z) > 30) || (oasis && nearPond(x, z, 9) && land(x, z));
    }, (x, z) => {
      const model = pick([WORLD.palm, WORLD.palmBend, WORLD.palmDetailed, WORLD.palmDetailedBend]);
      return { kind: "palm", model, x, z, rot: r() * 6.28, scale: 0.85 + r() * 0.35, r: 0.38, extras: [ITEM.coconut, ITEM.coconut] };
    });
    scatter(f.rocks, 2000, 1.8, (x, z) => biome(x, z) === "rock" || (biome(x, z) === "grass" && r() < 0.12), (x, z) => {
      const model = pick([WORLD.rockA, WORLD.rockB, WORLD.rockC]);
      return { kind: "rock", model, x, z, rot: r() * 6.28, scale: 0.85 + r() * 0.3, r: 0.95 };
    });
    scatter(f.sandRocks, 1500, 1.8, (x, z) => (biome(x, z) === "beach" && isl.height(x, z) > 0.3) || (oasis && land(x, z) && r() < 0.2), (x, z) => {
      const model = pick([WORLD.sandRockA, WORLD.sandRockB, WORLD.sandRockC]);
      return { kind: "rock", model, x, z, rot: r() * 6.28, scale: 0.8 + r() * 0.3, r: 0.9 };
    });
    scatter(f.bushes, 2500, 1.3, (x, z) => {
      const b = biome(x, z);
      return b === "grass" || b === "forest" || (b === "beach" && isl.height(x, z) > 0.55);
    }, (x, z) => ({ kind: "bush", model: WORLD.bush, x, z, rot: r() * 6.28, scale: 0.9 + r() * 0.3, r: 0 }));
    scatter(f.berries, 2500, 1.3, (x, z) => biome(x, z) === "grass" || biome(x, z) === "forest", (x, z) => ({
      kind: "berry",
      model: WORLD.bush,
      x,
      z,
      rot: r() * 6.28,
      scale: 1.0 + r() * 0.2,
      r: 0,
      extras: [ITEM.berries, ITEM.berries, ITEM.berries, ITEM.berries],
    }));
    scatter(f.mushrooms, 2500, 1.0, (x, z) => biome(x, z) === "forest", (x, z) => ({ kind: "mushroom", model: WORLD.mushrooms, x, z, rot: r() * 6.28, scale: 0.9 + r() * 0.3, r: 0 }));
    scatter(f.driftwood, 3000, 1.6, (x, z) => biome(x, z) === "beach" && isl.height(x, z) > 0.15 && isl.height(x, z) < 0.6, (x, z) => ({ kind: "driftwood", model: WORLD.driftwood, x, z, rot: r() * 6.28, scale: 0.9 + r() * 0.2, r: 0 }));
    scatter(f.pebbles, 3000, 1.2, (x, z) => (biome(x, z) === "beach" && isl.height(x, z) > 0.2) || biome(x, z) === "rock", (x, z) => ({ kind: "pebble", model: r() < 0.5 ? ITEM.stone : ITEM.stoneLarge, x, z, rot: r() * 6.28, scale: 0.9 + r() * 0.3, r: 0 }));

    // Bottles with notes along the beach.
    for (let i = 0; i < f.bottles; i++) {
      for (let k = 0; k < 400; k++) {
        const a = (i / f.bottles) * Math.PI * 2 + 0.7 + (r() - 0.5) * 0.8;
        const d = isl.coast(a) * (0.9 + r() * 0.06);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const h = isl.height(x, z);
        if (h < 0.1 || h > 0.6 || !free(x, z, 1) || keepClear(x, z)) continue;
        out.push({ kind: "bottle", model: WORLD.bottle, x, z, rot: r() * 6.28, scale: 1, r: 0, tag: i });
        taken.push({ x, z, r: 1 });
        break;
      }
    }

    // The wreck's crates on the sand around it.
    if (def.wreck) {
      const spots: [string, number, number][] = [
        [WORLD.crate, -6.5, -2.5],
        [WORLD.crate, -4.5, -6.0],
        [WORLD.barrel, 5.5, -5.5],
        [WORLD.treasure, -1.5, -8.0],
      ];
      spots.forEach(([model, dx, dz], i) => {
        const x = COVE.x + dx;
        const z = COVE.z + dz;
        out.push({ kind: "crate", model, x, z, rot: r() * 6.28, scale: 1, r: model === WORLD.barrel ? 0.6 : 0.7, loot: def.wreck![i] ?? { wood: 2 }, tag: i });
        taken.push({ x, z, r: 1.2 });
      });
    }
    // Flotsam slots (washed up each morning).
    for (let i = 0; i < 6; i++) out.push({ kind: "crate", model: i % 2 ? WORLD.barrel : WORLD.crate, x: 0, z: 0, rot: 0, scale: 1, r: 0.7, loot: null, tag: 10 + i, floating: true });

    // Fishing spots: shallow sea around the island, and the pond.
    let spots = 0;
    for (let k = 0; k < 600 && spots < f.fish; k++) {
      const a = r() * Math.PI * 2;
      const d = isl.coast(a) * (1.02 + r() * 0.06);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = isl.height(x, z);
      if (h > -0.7 || h < -2.2 || !free(x, z, 9)) continue;
      out.push({ kind: "fish", model: "", x, z, rot: 0, scale: 1, r: 0 });
      taken.push({ x, z, r: 9 });
      spots++;
    }
    if (hasPond) out.push({ kind: "fish", model: "", x: POND.x, z: POND.z, rot: 0, scale: 1, r: 0 });

    // Decoration: grass, flowers, lilies, flat rocks, the camp signpost.
    const decoOk = (x: number, z: number) => {
      const b = biome(x, z);
      return (b === "grass" || b === "forest") && Math.hypot(x - CAMP.x, z - CAMP.z) > 5;
    };
    for (let i = 0; i < f.greens; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 50;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!decoOk(x, z) || nearPond(x, z, 0.5)) continue;
      const roll = r();
      const model = roll < 0.4 ? WORLD.grass : roll < 0.62 ? WORLD.grassLarge : roll < 0.74 ? WORLD.grassTuft : roll < 0.8 ? WORLD.flowerRed : roll < 0.86 ? WORLD.flowerYellow : roll < 0.91 ? WORLD.flowerPurple : roll < 0.95 ? WORLD.grassPatch : WORLD.mushroomsRed;
      out.push({ kind: "deco", model, x, z, rot: r() * 6.28, scale: 0.8 + r() * 0.5, r: 0 });
    }
    if (hasPond && f.greens > 0) {
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2;
        const d = POND.r * (0.3 + r() * 0.55);
        out.push({ kind: "deco", model: WORLD.lily, x: POND.x + Math.cos(a) * d, z: POND.z + Math.sin(a) * d, rot: r() * 6.28, scale: 0.8 + r() * 0.4, r: 0 });
      }
    }
    for (const d of f.deco) {
      scatter(d.n, d.n * 60, d.r > 0 ? d.r + 1 : 1.6, (x, z) => {
        const b = biome(x, z);
        if (d.on === "land") return land(x, z);
        return b === d.on;
      }, (x, z) => {
        const scale = d.scale[0] + r() * (d.scale[1] - d.scale[0]);
        // Solid decoration (cactus, gravestones) is a boulder nobody can use.
        return { kind: d.r > 0 ? "boulder" : "deco", model: d.model, x, z, rot: r() * 6.28, scale, r: d.r * scale };
      });
    }
    out.push({ kind: "deco", model: WORLD.signpost, x: CAMP.x + 3.5, z: CAMP.z + 4.5, rot: 0.4, scale: 1, r: 0.2 });

    // Beach spots for flotsam.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const d = this.island.coast(a) * 0.96;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (keepClear(x, z) || this.island.height(x, z) < 0.05) continue;
      this.beachSpots.push({ x, z, rot: a });
    }
    return out;
  }

  private instantiate(p: Plan) {
    const y = p.kind === "fish" ? 0 : p.model === WORLD.lily ? POND.level + 0.02 : this.island.height(p.x, p.z);
    const set = p.model ? this.sets.get(p.model) : undefined;
    if (p.kind === "deco") {
      set?.add(p.x, y - 0.03, p.z, p.rot, p.scale);
      return;
    }
    const main: Part | null = set ? { set, index: set.add(p.x, y, p.z, p.rot, p.scale), ox: 0, oy: 0, oz: 0, rot: p.rot, scale: p.scale } : null;
    const node: Node = {
      id: this.nodes.length,
      kind: p.kind,
      x: p.x,
      y,
      z: p.z,
      rot: p.rot,
      scale: p.scale,
      r: p.r,
      reach: p.kind === "tree" || p.kind === "palm" ? 0.9 : p.kind === "rock" ? 1.0 : p.kind === "fish" ? 2.4 : p.kind === "boulder" ? 0 : 0.6,
      main,
      extras: [],
      stump: null,
      hp: p.kind === "tree" ? TREE_HP : p.kind === "rock" ? ROCK_HP : 1,
      maxHp: p.kind === "tree" ? TREE_HP : p.kind === "rock" ? ROCK_HP : 1,
      alive: !p.floating && !p.hidden,
      regrowAt: p.hidden ? Infinity : 0,
      charges: p.kind === "palm" ? 2 : p.kind === "berry" ? 4 : p.kind === "fish" ? 3 : 1,
      maxCharges: p.kind === "palm" ? 2 : p.kind === "berry" ? 4 : p.kind === "fish" ? 3 : 1,
      shake: 0,
      grow: 1,
      loot: p.loot ?? null,
      tag: p.tag ?? 0,
      floating: !!p.floating,
      hidden: !!p.hidden,
      fade: 0,
    };
    if (p.kind === "crate" && !p.floating) this.specials.push(node);
    if (p.stump) {
      const ss = this.sets.get(p.stump);
      if (ss) {
        node.stump = { set: ss, index: ss.add(p.x, y, p.z, p.rot, p.scale), ox: 0, oy: 0, oz: 0, rot: p.rot, scale: p.scale };
        ss.hide(node.stump.index);
      }
    }
    if (p.extras) {
      p.extras.forEach((model, i) => {
        const es = this.sets.get(model);
        if (!es) return;
        let ox: number, oy: number, oz: number;
        const a = p.rot + i * 2.1 + 0.4;
        if (p.kind === "palm") {
          // Coconuts hang just under the crown (bent palms lean: follow the crown).
          const c = this.crown(p.model);
          const lx = c.x + Math.cos(a) * 0.32;
          const lz = c.z + Math.sin(a) * 0.32;
          ox = lx * Math.cos(p.rot) + lz * Math.sin(p.rot);
          oz = -lx * Math.sin(p.rot) + lz * Math.cos(p.rot);
          oy = c.y - 0.35;
        } else {
          ox = Math.cos(a) * 0.42;
          oz = Math.sin(a) * 0.42;
          oy = 0.32 + (i % 2) * 0.12;
        }
        const part: Part = { set: es, index: es.add(p.x + ox, y + oy, p.z + oz, a, 1), ox, oy, oz, rot: a, scale: 1 };
        node.extras.push(part);
      });
    }
    if (!node.alive) this.render(node);
    this.nodes.push(node);
    this.addToGrid(node);
  }

  /** The buried chest appears (once every bottle map is found). True when it showed up just now. */
  revealTreasure() {
    const n = this.nodes.find((x) => x.hidden);
    if (!n || n.alive || n.hp <= 0) return false;
    n.alive = true;
    n.grow = 0.05;
    this.animating.add(n);
    this.render(n);
    return true;
  }

  /** How many crates of the wreck / the cache have been opened; and whether the buried chest has. */
  opened() {
    let crates = 0;
    let treasure = false;
    for (const n of this.specials) {
      if (n.alive || n.hp > 0) continue;
      if (n.hidden) treasure = true;
      else crates++;
    }
    return { crates, treasure };
  }

  private readonly crowns = new Map<string, THREE.Vector3>();

  /** Centre of a palm's leaves (the top fifth of its vertices). */
  private crown(model: string) {
    let c = this.crowns.get(model);
    if (c) return c;
    c = new THREE.Vector3(0, 5, 0);
    const pos = this.baked.get(model)?.geometry.getAttribute("position");
    if (pos) {
      let maxY = -Infinity;
      for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
      let sx = 0;
      let sy = 0;
      let sz = 0;
      let k = 0;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) < maxY * 0.8) continue;
        sx += pos.getX(i);
        sy += pos.getY(i);
        sz += pos.getZ(i);
        k++;
      }
      if (k) c.set(sx / k, sy / k, sz / k);
    }
    this.crowns.set(model, c);
    return c;
  }

  // --- Spatial queries -----------------------------------------------------------------------------

  private key(cx: number, cz: number) {
    return (cx + 512) * 1024 + (cz + 512);
  }

  private addToGrid(n: Node) {
    const k = this.key(Math.floor(n.x / 4), Math.floor(n.z / 4));
    let list = this.grid.get(k);
    if (!list) this.grid.set(k, (list = []));
    list.push(n.id);
  }

  /** Moves a node (flotsam) to a new spot. */
  relocate(n: Node, x: number, z: number, rot: number) {
    const old = this.grid.get(this.key(Math.floor(n.x / 4), Math.floor(n.z / 4)));
    if (old) old.splice(old.indexOf(n.id), 1);
    n.x = x;
    n.z = z;
    n.y = this.island.height(x, z);
    n.rot = rot;
    if (n.main) n.main.rot = rot;
    this.addToGrid(n);
    this.render(n);
  }

  /** Nodes whose centre is within `radius` of (x, z). */
  near(x: number, z: number, radius: number, out: Node[] = []) {
    out.length = 0;
    const c0x = Math.floor((x - radius) / 4);
    const c1x = Math.floor((x + radius) / 4);
    const c0z = Math.floor((z - radius) / 4);
    const c1z = Math.floor((z + radius) / 4);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const list = this.grid.get(this.key(cx, cz));
        if (!list) continue;
        for (const id of list) {
          const n = this.nodes[id];
          if ((n.x - x) ** 2 + (n.z - z) ** 2 <= radius * radius) out.push(n);
        }
      }
    }
    return out;
  }

  /** Solid circles around (x, z): living trees, stumps, rocks, boulders, crates, the wreck. */
  solids(x: number, z: number, radius: number, out: Collider[]) {
    out.length = 0;
    for (const n of this.near(x, z, radius + 2.5, tmpNodes)) {
      if (n.r <= 0) continue;
      if (n.alive) out.push(n);
      else if (n.kind === "tree") out.push({ x: n.x, z: n.z, r: 0.35 });
    }
    for (const s of this.statics) if ((s.x - x) ** 2 + (s.z - z) ** 2 < (radius + s.r + 1) ** 2) out.push(s);
    return out;
  }

  // --- State changes -------------------------------------------------------------------------------

  /** A tool hit: shake, and for trees/rocks lose hp. Returns true when it broke. */
  hit(n: Node, power: number) {
    n.shake = 0.35;
    this.animating.add(n);
    if (n.kind !== "tree" && n.kind !== "rock") return false;
    n.hp -= power;
    if (n.hp > 0) return false;
    if (n.kind === "tree") this.fell(n);
    this.deplete(n, REGROW[n.kind]);
    return true;
  }

  /** Taken (or felled/broken): hidden until `delay` seconds of game time pass (0 = next dawn). */
  deplete(n: Node, delay: number, clock = this.clock) {
    n.alive = false;
    n.shake = 0;
    n.regrowAt = delay > 0 ? clock + delay : (Math.floor(clock / DAY) + 1) * DAY + 2;
    if (n.kind === "crate" || n.kind === "bottle") n.regrowAt = Infinity;
    this.render(n);
  }

  /** Takes one charge (berries, coconuts, fish); returns whether one was there. */
  take(n: Node) {
    if (n.charges <= 0) return false;
    n.charges--;
    if (n.charges <= 0) n.regrowAt = this.clock + REGROW[n.kind];
    n.shake = 0.3;
    this.animating.add(n);
    this.render(n);
    return true;
  }

  clock = 0;

  /** Regrowth and dawn respawns. */
  update(dt: number, clock: number) {
    this.clock = clock;
    for (const n of this.animating) {
      n.shake = Math.max(0, n.shake - dt);
      if (n.grow < 1) n.grow = Math.min(1, n.grow + dt * 0.8);
      this.render(n);
      if (n.shake <= 0 && n.grow >= 1) this.animating.delete(n);
    }
    // Falling trees.
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      const t = f.t;
      let angle: number;
      if (t < 1.25) angle = Math.min(Math.PI / 2 - 0.08, 0.04 + Math.pow(t / 1.25, 2.2) * (Math.PI / 2));
      else angle = Math.PI / 2 - 0.08 + Math.sin(Math.min(1, (t - 1.25) / 0.3) * Math.PI) * -0.07;
      if (t >= 1.25 && !f.landed) {
        f.landed = true;
        this.onTreeLand?.(f.x + f.axis.z * 2.6, f.z - f.axis.x * 2.6, f.axis.z, -f.axis.x);
      }
      const sink = Math.max(0, t - 2.2) * 1.2;
      f.mesh.quaternion.setFromAxisAngle(f.axis, angle).multiply(tmpQ.setFromAxisAngle(UP, f.rot));
      f.mesh.position.set(f.x, f.y - sink, f.z);
      f.mesh.scale.setScalar(f.scale * Math.max(0.01, 1 - Math.max(0, t - 2.4) * 1.4));
      if (t > 3.1) {
        f.mesh.removeFromParent();
        this.falling.splice(i, 1);
      }
    }
    // Regrowth: checked a few nodes per frame.
    for (let k = 0; k < 24; k++) {
      this.scan = (this.scan + 1) % this.nodes.length;
      const n = this.nodes[this.scan];
      if (n.floating) continue;
      if (!n.alive && clock >= n.regrowAt) this.regrow(n);
      else if (n.alive && n.charges < n.maxCharges && clock >= n.regrowAt && (n.kind === "palm" || n.kind === "berry" || n.kind === "fish")) {
        n.charges = n.maxCharges;
        this.render(n);
      }
    }
    for (const set of this.sets.values()) set.flush();
  }

  private scan = 0;

  private readonly faded = new Set<Node>();
  private readonly occluders = new Set<Node>();

  /**
   * Dithers away trees, palms and boulders standing between the camera and the castaway.
   * (ax, az) is the camera, (bx, bz) the castaway.
   */
  updateOcclusion(ax: number, az: number, bx: number, bz: number, dt: number) {
    const occ = this.occluders;
    occ.clear();
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    for (const n of this.near(mx, mz, len / 2 + 4, tmpNodes)) {
      // (Cactus and gravestones are small "boulders": too low to hide anyone.)
      if (!n.alive || !n.main || (n.kind !== "tree" && n.kind !== "palm" && n.kind !== "boulder") || (n.kind === "boulder" && n.r < 1)) continue;
      // Anything tall right next to the camera.
      if ((n.x - ax) ** 2 + (n.z - az) ** 2 < (n.kind === "palm" ? 16 : 9)) {
        occ.add(n);
        continue;
      }
      const t = ((n.x - ax) * dx + (n.z - az) * dz) / (len * len);
      if (t < 0 || t > 1) continue;
      const along = t * len;
      // Close to the castaway, only trunks in the way matter.
      if (len - along < 1.2) continue;
      const px = ax + dx * t - n.x;
      const pz = az + dz * t - n.z;
      const r = n.kind === "boulder" ? 2.2 * n.scale : n.kind === "palm" ? 2.0 : 1.7;
      if (px * px + pz * pz < r * r) occ.add(n);
    }
    for (const n of occ) this.faded.add(n);
    const k = 1 - Math.exp(-10 * dt);
    for (const n of this.faded) {
      const target = occ.has(n) ? 0.72 : 0;
      n.fade += (target - n.fade) * k;
      if (Math.abs(n.fade - target) < 0.02) n.fade = target;
      if (n.main) n.main.set.setFade(n.main.index, n.fade);
      if (n.fade === 0 && !occ.has(n)) this.faded.delete(n);
    }
  }

  /** Something the player is standing on can't pop back right there; it waits. */
  blocked: ((n: Node) => boolean) | null = null;

  private regrow(n: Node) {
    if (this.blocked?.(n)) return;
    n.alive = true;
    n.hp = n.maxHp;
    n.charges = n.maxCharges;
    n.grow = 0.05;
    this.animating.add(n);
    this.render(n);
  }

  /** Makes the floating crate slots wash up on random beaches (each morning). */
  washUp(count: number, roll: () => number, loot: () => Partial<Record<ItemId, number>>) {
    let placed = 0;
    for (const n of this.nodes) {
      if (!n.floating || n.alive || placed >= count) continue;
      const spot = this.beachSpots[Math.floor(roll() * this.beachSpots.length)];
      if (!spot) break;
      this.relocate(n, spot.x + (roll() - 0.5) * 2, spot.z + (roll() - 0.5) * 2, roll() * 6.28);
      n.alive = true;
      n.loot = loot();
      n.grow = 0.05;
      this.animating.add(n);
      this.render(n);
      placed++;
    }
    return placed;
  }

  private fell(n: Node) {
    const b = n.main ? n.main.set.baked : null;
    if (!b) return;
    const mesh = new THREE.Mesh(b.geometry, b.material);
    mesh.castShadow = true;
    // Falls away from the player (set by the engine via fallDir).
    const axis = new THREE.Vector3(this.fallDir.z, 0, -this.fallDir.x).normalize();
    this.group.add(mesh);
    this.falling.push({ mesh, t: 0, axis, x: n.x, y: n.y, z: n.z, rot: n.rot, scale: n.scale, landed: false });
  }

  /** Direction the next felled tree falls in. */
  readonly fallDir = new THREE.Vector3(1, 0, 0);

  /** Writes a node's instances (alive / gone / shaking / growing / charges). */
  render(n: Node) {
    const shake = n.shake > 0 ? Math.sin(n.shake * 60) * n.shake * 0.25 : 0;
    const growS = n.grow < 1 ? easeOutBack(n.grow) : 1;
    let s = n.scale * growS;
    if (n.kind === "rock") s *= 0.55 + 0.45 * Math.max(0, n.hp / n.maxHp);
    if (n.main) {
      if (n.alive) {
        composeMatrix(tmpM, n.x, n.y, n.z, n.rot, s, shake * 0.6, shake);
        n.main.set.set(n.main.index, tmpM);
      } else if (n.kind === "bush") {
        // Picked bushes stay as a small stub.
        composeMatrix(tmpM, n.x, n.y - 0.1, n.z, n.rot, n.scale * 0.45);
        n.main.set.set(n.main.index, tmpM);
      } else n.main.set.hide(n.main.index);
    }
    if (n.stump) {
      if (!n.alive) n.stump.set.place(n.stump.index, n.x, n.y, n.z, n.rot, n.scale);
      else n.stump.set.hide(n.stump.index);
    }
    n.extras.forEach((e, i) => {
      const visible = n.alive && i < n.charges;
      if (!visible) e.set.hide(e.index);
      else e.set.place(e.index, n.x + e.ox * s, n.y + e.oy * s + shake * 0.3, n.z + e.oz * s, e.rot, e.scale * growS);
    });
  }

  // --- Saving --------------------------------------------------------------------------------------

  serialize() {
    const out: (number | string)[][] = [];
    for (const n of this.nodes) {
      // (The buried chest starts out hidden: once revealed it differs from a fresh island too.)
      const changed = !n.alive || n.hp !== n.maxHp || n.charges !== n.maxCharges || n.floating || n.hidden;
      if (!changed) continue;
      out.push([n.id, n.alive ? 1 : 0, n.hp, n.charges, Number.isFinite(n.regrowAt) ? Math.round(n.regrowAt) : -1, n.floating ? Math.round(n.x * 10) / 10 : 0, n.floating ? Math.round(n.z * 10) / 10 : 0, n.floating && n.loot ? JSON.stringify(n.loot) : ""]);
    }
    return out;
  }

  /** Puts back what a save changed. Rows that make no sense (a broken or edited save) are skipped. */
  restore(data: unknown) {
    if (!Array.isArray(data)) return;
    const num = (v: unknown, lo: number, hi: number, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
    };
    for (const row of data) {
      if (!Array.isArray(row)) continue;
      const n = this.nodes[Number(row[0])];
      if (!n || n.kind === "boulder") continue;
      n.alive = row[1] === 1;
      n.hp = num(row[2], 0, n.maxHp, n.maxHp);
      n.charges = Math.floor(num(row[3], 0, n.maxCharges, n.maxCharges));
      const regrow = Number(row[4]);
      n.regrowAt = !Number.isFinite(regrow) || regrow < 0 ? Infinity : regrow;
      if (n.floating) {
        const x = num(row[5], -80, 80, NaN);
        const z = num(row[6], -80, 80, NaN);
        if (n.alive && Number.isFinite(x) && Number.isFinite(z)) this.relocate(n, x, z, n.rot);
        else n.alive = false;
        n.loot = saneLoot(row[7]);
        if (n.alive && !n.loot) n.loot = { wood: 2 };
      }
      this.render(n);
    }
    for (const set of this.sets.values()) set.flush();
  }

  dispose() {
    for (const f of this.falling) f.mesh.removeFromParent();
    this.falling.length = 0;
    for (const set of this.sets.values()) set.mesh.dispose();
  }
}

/** A saved crate's loot: only known items in sensible amounts. */
function saneLoot(raw: unknown): Partial<Record<ItemId, number>> | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const out: Partial<Record<ItemId, number>> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Math.floor(Number(v));
      if (LOOT_ITEMS.includes(k) && Number.isFinite(n) && n > 0) out[k as ItemId] = Math.min(20, n);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** What a crate may hold. */
const LOOT_ITEMS: string[] = ["wood", "stone", "fiber", "planks", "scrap", "cloth", "berries", "coconut", "mushroom", "fish", "fishCooked", "bigFish", "bigFishCooked", "meat", "meatCooked"];

const tmpNodes: Node[] = [];
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
