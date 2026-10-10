import * as THREE from "three";
import { BUILDS, SURVIVAL, type BuildId, type FoodId, type ResourceId } from "./data";
import type { Blocker } from "./creatures";
import { Bar, type Particles } from "./fx";
import { BUILD, HELD, WORLD } from "./manifest";
import type { Baked } from "./props";

/**
 * Everything the castaway builds: campfires (fuel, cooking rack, light), workbench, bedroll, tent,
 * fences / gates / palisades, torch posts, a storage chest, the signal fire and the raft. Each is
 * one library model (the signal fire and raft are put together from a few) plus fire particles.
 */

export interface Structure extends Blocker {
  id: number;
  kind: BuildId;
  root: THREE.Group;
  maxHp: number;
  /** Campfire fuel in seconds. */
  fuel: number;
  lit: boolean;
  cooking: { items: FoodId[]; t: number; done: boolean } | null;
  rack: THREE.Object3D | null;
  bar: Bar;
  /** Hit shake. */
  shake: number;
  /** Signal fire: seconds burnt tonight. */
  burn: number;
  /** Chest contents. */
  store: Partial<Record<ResourceId, number>>;
  flame: { x: number; y: number; z: number; size: number } | null;
}

export interface SavedStructure {
  k: BuildId;
  x: number;
  z: number;
  r: number;
  hp: number;
  f?: number;
  l?: number;
  s?: Partial<Record<ResourceId, number>>;
}

/** How each build model is scaled. */
export const BUILD_FITS: Record<string, { scale: number }> = {
  [BUILD.campfire]: { scale: 3.6 },
  [BUILD.rack]: { scale: 3.6 },
  [BUILD.workbench]: { scale: 3.6 },
  [BUILD.bedroll]: { scale: 3.0 },
  [BUILD.tent]: { scale: 4.4 },
  [BUILD.fence]: { scale: 3.6 },
  [BUILD.gate]: { scale: 3.6 },
  [BUILD.wall]: { scale: 3.6 },
  [BUILD.chest]: { scale: 3.6 },
  [BUILD.raftDeck]: { scale: 6.6 },
  [BUILD.raftSail]: { scale: 1.15 },
  [BUILD.raftBarrel]: { scale: 2.6 },
  [BUILD.satchel]: { scale: 3.2 },
};

export const TORCH_POST_SCALE = 1.6;
export const SIGNAL_PIT_SCALE = 2.6;

const mesh = (b: Baked | undefined) => {
  if (!b) return new THREE.Group();
  const m = new THREE.Mesh(b.geometry, b.material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/** The model(s) for a building, unplaced. */
export function buildModel(kind: BuildId, baked: Map<string, Baked>): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case "signal": {
      const pit = mesh(baked.get(BUILD.campfire));
      pit.scale.setScalar(SIGNAL_PIT_SCALE);
      g.add(pit);
      // A teepee of logs over the pit.
      for (let i = 0; i < 5; i++) {
        const log = mesh(baked.get(WORLD.log));
        const a = (i / 5) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.position.set(Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95);
        holder.rotation.y = -a + Math.PI / 2;
        log.rotation.x = -1.05;
        log.position.set(0, 0, -0.2);
        log.scale.setScalar(0.85);
        holder.add(log);
        g.add(holder);
      }
      break;
    }
    case "raft": {
      const deck = mesh(baked.get(BUILD.raftDeck));
      g.add(deck);
      const sail = mesh(baked.get(BUILD.raftSail));
      sail.position.set(0, 0.3, 0.2);
      g.add(sail);
      const barrel = mesh(baked.get(BUILD.raftBarrel));
      barrel.position.set(1.0, 0.3, -1.0);
      g.add(barrel);
      const crate = mesh(baked.get(BUILD.chest));
      crate.position.set(-1.0, 0.3, -1.0);
      crate.scale.setScalar(0.8);
      g.add(crate);
      break;
    }
    case "torchPost": {
      const t = mesh(baked.get(HELD.torch + "#post"));
      g.add(t);
      break;
    }
    default:
      g.add(mesh(baked.get(BUILDS[kind].model)));
  }
  return g;
}

let nextId = 1;

export class Structures {
  readonly list: Structure[] = [];
  readonly group = new THREE.Group();

  constructor(
    private readonly baked: Map<string, Baked>,
    private readonly height: (x: number, z: number) => number,
  ) {}

  add(kind: BuildId, x: number, z: number, rot: number, opts: { hp?: number; fuel?: number; lit?: boolean; store?: Partial<Record<ResourceId, number>> } = {}): Structure {
    const def = BUILDS[kind];
    const root = buildModel(kind, this.baked);
    const y = kind === "raft" ? Math.max(0.05, this.height(x, z)) : this.height(x, z);
    root.position.set(x, y, z);
    root.rotation.y = rot;
    this.group.add(root);
    const s: Structure = {
      id: nextId++,
      kind,
      root,
      x,
      z,
      r: def.wall ? 0.2 : def.radius * (kind === "bedroll" ? 0.5 : 0.75),
      wall: !!def.wall,
      rot,
      half: def.wall ? 0.88 : 0,
      solid: def.solid,
      hp: opts.hp ?? def.hp,
      maxHp: def.hp,
      light: 0,
      fuel: opts.fuel ?? (kind === "campfire" ? SURVIVAL.startFuel : 0),
      lit: opts.lit ?? (kind === "campfire" || kind === "torchPost"),
      cooking: null,
      rack: null,
      bar: new Bar(kind === "campfire" ? "#f59e0b" : "#84cc16", def.wall ? 1.4 : 1),
      shake: 0,
      burn: 0,
      store: opts.store ?? {},
      flame: null,
    };
    if (kind === "campfire") s.flame = { x, y: y + 0.25, z, size: 1 };
    else if (kind === "torchPost") s.flame = { x, y: y + 1.75, z, size: 0.45 };
    else if (kind === "signal") s.flame = { x, y: y + 0.9, z, size: 2.2 };
    this.group.add(s.bar.group);
    this.list.push(s);
    this.updateLight(s);
    return s;
  }

  remove(s: Structure) {
    const i = this.list.indexOf(s);
    if (i >= 0) this.list.splice(i, 1);
    s.root.removeFromParent();
    s.bar.group.removeFromParent();
    s.bar.dispose();
    s.hp = 0;
    s.light = 0;
  }

  clear() {
    for (const s of [...this.list]) this.remove(s);
  }

  /** Fear / light radius of a burning thing. */
  updateLight(s: Structure) {
    const def = BUILDS[s.kind];
    if (s.kind === "campfire") s.light = s.lit && s.fuel > 0 ? (def.light ?? 6) * (0.65 + 0.35 * Math.min(1, s.fuel / 60)) : 0;
    else if (s.kind === "torchPost" || s.kind === "signal") s.light = s.lit ? (def.light ?? 5) : 0;
  }

  near(x: number, z: number, r: number, out: Structure[] = []) {
    out.length = 0;
    for (const s of this.list) if ((s.x - x) ** 2 + (s.z - z) ** 2 <= (r + (s.wall ? s.half : 0)) ** 2) out.push(s);
    return out;
  }

  count(kinds: BuildId[]) {
    let n = 0;
    for (const s of this.list) if (kinds.includes(s.kind)) n++;
    return n;
  }

  /** Burns fuel, cooks food, emits flames. */
  update(dt: number, fx: { fire: Particles; smoke: Particles }) {
    for (const s of this.list) {
      if (s.shake > 0) {
        s.shake = Math.max(0, s.shake - dt);
        const k = Math.sin(s.shake * 70) * s.shake * 0.12;
        s.root.rotation.z = k;
      }
      if (s.kind === "campfire" && s.lit) {
        s.fuel = Math.max(0, s.fuel - dt);
        if (s.fuel <= 0) s.lit = false;
      }
      this.updateLight(s);
      if (s.cooking && !s.cooking.done) {
        s.cooking.t += dt;
        if (s.cooking.t >= 6) s.cooking.done = true;
      }
      const f = s.flame;
      if (!f) continue;
      const burning = s.light > 0;
      if (burning) {
        const n = s.kind === "signal" ? 3 : 1;
        for (let k = 0; k < n; k++) {
          if (Math.random() > dt * (s.kind === "torchPost" ? 40 : 60) * (s.kind === "signal" ? 1.3 : 1)) continue;
          const sz = f.size * (s.kind === "campfire" ? 0.6 + 0.4 * Math.min(1, s.fuel / 60) : 1);
          const spread = 0.28 * sz;
          fx.fire.emit({
            x: f.x + (Math.random() - 0.5) * spread,
            y: f.y + Math.random() * 0.1,
            z: f.z + (Math.random() - 0.5) * spread,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 1.1 + Math.random() * 1.2 * sz,
            vz: (Math.random() - 0.5) * 0.3,
            life: 0.45 + Math.random() * 0.4 * sz,
            size: 0.55 * sz + Math.random() * 0.25 * sz,
            endSize: 0.08,
            color: "#ffd27a",
            endColor: "#ff3d10",
            alpha: 0.9,
            drag: 1.5,
          });
        }
        if (Math.random() < dt * 4) fx.fire.emit({ x: f.x, y: f.y + 0.3, z: f.z, vx: (Math.random() - 0.5) * 1.2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.2, life: 1.2, size: 0.07, endSize: 0.02, color: "#ffcf6a", endColor: "#ff5a1f", drag: 0.6 });
        if (s.kind !== "torchPost" && Math.random() < dt * 3 * f.size) fx.smoke.emit({ x: f.x, y: f.y + 0.9 * f.size, z: f.z, vx: 0.2, vy: 0.8, vz: 0.1, life: 2.6, size: 0.6 * f.size, endSize: 1.6 * f.size, color: "#a39a92", endColor: "#7d756f", alpha: 0.16, drag: 0.4 });
      } else if (s.kind === "campfire" && Math.random() < dt * 1.5) {
        // Embers smoke after the fire dies.
        fx.smoke.emit({ x: f.x, y: f.y, z: f.z, vx: 0.1, vy: 0.6, vz: 0.05, life: 2, size: 0.35, endSize: 0.9, color: "#5d5753", endColor: "#2e2a28", alpha: 0.22, drag: 0.4 });
      }
    }
  }

  serialize(): SavedStructure[] {
    return this.list.map((s) => ({
      k: s.kind,
      x: Math.round(s.x * 100) / 100,
      z: Math.round(s.z * 100) / 100,
      r: Math.round(s.rot * 1000) / 1000,
      hp: Math.round(s.hp),
      f: s.kind === "campfire" ? Math.round(s.fuel) : undefined,
      l: s.kind === "signal" || s.kind === "campfire" ? (s.lit ? 1 : 0) : undefined,
      s: s.kind === "chest" ? s.store : undefined,
    }));
  }

  restore(data: SavedStructure[]) {
    this.clear();
    for (const d of data) {
      if (!BUILDS[d.k]) continue;
      this.add(d.k, d.x, d.z, d.r, { hp: d.hp, fuel: d.f, lit: d.l === undefined ? undefined : d.l === 1, store: d.s });
    }
  }

  dispose() {
    for (const s of this.list) s.bar.dispose();
  }
}
