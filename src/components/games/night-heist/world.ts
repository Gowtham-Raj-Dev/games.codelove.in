import * as THREE from "three";
import { makeProto, type LoadedModel, type Proto } from "../shared/assets";
import { DISTRICTS, THIEVES } from "./content";
import { floorGlow, gravelTexture, LaserBeams, lightBeam, plankTexture, radialTexture, squareTexture } from "./fx";
import type { GemColor, LootKind, Parsed, PropKind } from "./levels";
import { CH, M } from "./manifest";
import type { HeistSim } from "./sim";

/** Builds the 3D building for a heist: instanced static geometry plus the things that move, dressed for its district. */

export const WALL_H = 1.3;
export const PEDESTAL_H = 0.62;
export const PLINTH_H = 0.42;

export const GEM_COLORS: Record<GemColor, string> = { red: "#ff4d5e", green: "#4dffa0", blue: "#5cb8ff" };

type Tint = Record<string, string> | string;

interface ProtoSpec {
  key: string;
  fit: Parameters<typeof makeProto>[2];
  shadows?: boolean;
  receive?: boolean;
  tint?: Tint;
  /** Darken (multiply) every material colour. */
  dim?: number;
  /** Emissive boost for glowing things. */
  glow?: string;
  glowLevel?: number;
  /** Lights its own texture a little (museum display lighting). */
  selfLit?: number;
}

// --- Districts -------------------------------------------------------------------------------------------

export interface Theme {
  /** Background / fog. */
  bg: string;
  /** Hemisphere light: sky and ground. */
  sky: string;
  ground: string;
  moon: string;
  /** Lamp colour (the pools on the floor and the light they throw). */
  lamp: string;
  /** Torches with a flame (the museum) or electric wall lamps. */
  flame: boolean;
  wall: Tint;
  floor: string;
  /** The second floor finish (the `office` rectangles of a heist). */
  office: string;
  /** Which model stands in for each prop here (default: the museum's). */
  props: Partial<Record<PropKind, string>>;
  loot: Record<LootKind, string>;
  /** Tint of the coin stacks. */
  coins: string;
  /** Creaky boards or gravel. */
  noisy: { look: "planks" | "gravel"; color: string };
  murals: boolean;
}

const THEMES: Record<string, Theme> = {
  museum: {
    bg: "#06070c",
    sky: "#5d6fa8",
    ground: "#2a2018",
    moon: "#a9bdff",
    lamp: "#ff9a4a",
    flame: true,
    wall: { bricks: "#b8936a", stones: "#a88d6c" },
    floor: "#f0cc96",
    office: "#5f6874",
    props: {},
    loot: { coins: "coins", jar: "jarLoot", figurine: "figurine", gem: "gemLoot", safe: "safe" },
    coins: "#ffffff",
    noisy: { look: "planks", color: "#d8b98a" },
    murals: true,
  },
  manor: {
    bg: "#07060a",
    sky: "#6a5f9e",
    ground: "#22160f",
    moon: "#b9b2ff",
    lamp: "#ffc97a",
    flame: false,
    wall: { bricks: "#7d5a44", stones: "#6b4c3a" },
    floor: "#b08660",
    office: "#6d2f3a",
    props: { anubis: "statue", bastet: "statue", ra: "statue", obelisk: "floorLamp", urn: "plant", crates: "bookcase", sarcophagus: "sofa" },
    loot: { coins: "coins", jar: "vase", figurine: "portrait", gem: "gemLoot", safe: "safe" },
    coins: "#d9e2f0",
    noisy: { look: "planks", color: "#e8cfa6" },
    murals: false,
  },
  harbor: {
    bg: "#04070b",
    sky: "#4f6f96",
    ground: "#171c22",
    moon: "#a8c8ff",
    lamp: "#d6e6ff",
    flame: false,
    wall: { bricks: "#5c6876", stones: "#515c69" },
    floor: "#7a828c",
    office: "#4a5560",
    props: { anubis: "containerRed", bastet: "containerBlue", ra: "containerGreen", obelisk: "barrel", urn: "barrel", bookcase: "crates" },
    loot: { coins: "coins", jar: "parcel", figurine: "figurine", gem: "gemLoot", safe: "safe" },
    coins: "#9be7a8",
    noisy: { look: "gravel", color: "#c9cdd2" },
    murals: false,
  },
  casino: {
    bg: "#0a0508",
    sky: "#9a5f86",
    ground: "#24101a",
    moon: "#ffb8dc",
    lamp: "#ffb36a",
    flame: false,
    wall: { bricks: "#5a2f44", stones: "#4a2638" },
    floor: "#8a2338",
    office: "#2c2a3c",
    props: { anubis: "slots", bastet: "slots", ra: "slots", obelisk: "wheel", urn: "plant", crates: "arcade", bookcase: "vending", sarcophagus: "cardTable" },
    loot: { coins: "coins", jar: "register", figurine: "trophy", gem: "gemLoot", safe: "safe" },
    coins: "#ff8fa3",
    noisy: { look: "gravel", color: "#f1c6d2" },
    murals: false,
  },
  tower: {
    bg: "#03060a",
    sky: "#5f8fb0",
    ground: "#101820",
    moon: "#a8e4ff",
    lamp: "#9fe8ff",
    flame: false,
    wall: { bricks: "#3c4d68", stones: "#34445c" },
    floor: "#a7b4c4",
    office: "#56657a",
    props: { anubis: "rack", bastet: "rack", ra: "rack", obelisk: "rack", urn: "canister", crates: "canisters", bookcase: "rack", sarcophagus: "display" },
    loot: { coins: "coins", jar: "chip", figurine: "hologram", gem: "gemLoot", safe: "safe" },
    coins: "#bfe9ff",
    noisy: { look: "gravel", color: "#bcd4e6" },
    murals: false,
  },
};

export const themeOf = (districtId: string) => THEMES[districtId] ?? THEMES.museum;

const SPECS: Record<string, ProtoSpec> = {
  guard: { key: CH.guard, fit: { height: 0.98 }, shadows: true },
  warden: { key: CH.warden, fit: { height: 0.98 }, shadows: true },
  sentry: { key: CH.sentry, fit: { height: 0.98 }, shadows: true, tint: "#ffe680" },
  captain: { key: CH.captain, fit: { height: 1.04 }, shadows: true, tint: "#ff9a8f" },
  dog: { key: CH.dog, fit: { height: 0.56 }, shadows: true },
  drone: { key: CH.drone, fit: { width: 0.95 }, shadows: false, glow: "#7df2ff", glowLevel: 0.25 },
  rug: { key: M.rug, fit: { box: { x: 3, y: 0.03, z: 2 } }, receive: true, shadows: false, tint: "#9b2433" },
  mural: { key: M.mural, fit: { box: { x: 0.94, y: 1.02 } }, receive: true, shadows: false, selfLit: 0.55 },
  column: { key: M.column, fit: { height: 1.75 }, shadows: true, receive: true },
  door: { key: M.door, fit: { box: { x: 0.3, y: WALL_H, z: 1 } }, shadows: true, receive: true },
  sconce: { key: M.sconce, fit: { height: 0.46 }, shadows: false },
  flame: { key: M.flame, fit: { height: 0.4 }, shadows: false, glow: "#ff9a3c", glowLevel: 2.2 },
  wallLamp: { key: M.wallLamp, fit: { width: 0.5 }, shadows: false, glow: "#fff1cf", glowLevel: 1.4 },
  anubis: { key: M.anubis, fit: { height: 1.55 }, shadows: true, receive: true },
  bastet: { key: M.bastet, fit: { height: 1.4 }, shadows: true, receive: true },
  ra: { key: M.ra, fit: { height: 1.7 }, shadows: true, receive: true },
  obelisk: { key: M.obelisk, fit: { height: 2.5 }, shadows: true, receive: true },
  urn: { key: M.jar, fit: { height: 1.05 }, shadows: true, receive: true },
  jarLoot: { key: M.jarSmall, fit: { height: 0.46 }, shadows: true },
  vase: { key: M.jarSmall, fit: { height: 0.5 }, shadows: true, tint: "#cfe4ff" },
  chip: { key: M.screen, fit: { height: 0.4 }, shadows: true, glow: "#7dd3fc", glowLevel: 0.6 },
  figurine: { key: M.bastet, fit: { height: 0.46 }, shadows: true },
  portrait: { key: M.portrait, fit: { height: 0.52 }, shadows: true },
  trophy: { key: M.trophy, fit: { height: 0.46 }, shadows: true },
  hologram: { key: M.hologram, fit: { height: 0.44 }, shadows: true, glow: "#7df2ff", glowLevel: 0.5 },
  parcel: { key: M.crate, fit: { width: 0.42 }, shadows: true, tint: "#d9b98a" },
  register: { key: M.register, fit: { width: 0.5 }, shadows: true },
  gemLoot: { key: M.gemBlue, fit: { width: 0.3 }, shadows: false, glow: "#6fb8ff", glowLevel: 0.22 },
  gem_red: { key: M.gemRed, fit: { width: 0.58 }, shadows: false, glow: GEM_COLORS.red, glowLevel: 0.22 },
  gem_green: { key: M.gemGreen, fit: { width: 0.58 }, shadows: false, glow: GEM_COLORS.green, glowLevel: 0.22 },
  gem_blue: { key: M.gemBlue, fit: { width: 0.58 }, shadows: false, glow: GEM_COLORS.blue, glowLevel: 0.22 },
  plate: { key: M.plate, fit: { box: { x: 0.84, y: 0.07, z: 0.84 } }, shadows: false, receive: true, tint: "#9a6a52" },
  web: { key: M.web, fit: { width: 1.5 }, shadows: false },
  sarcophagus: { key: M.sarcophagus, fit: { box: { x: 0.9, y: 0.62, z: 1.85 } }, shadows: true, receive: true },
  pedestal: { key: M.pedestal, fit: { box: { x: 0.84, y: PEDESTAL_H, z: 0.84 } }, shadows: true, receive: true },
  plinth: { key: M.pedestal, fit: { box: { x: 0.58, y: PLINTH_H, z: 0.58 } }, shadows: true, receive: true },
  safe: { key: M.safe, fit: { box: { x: 0.82, y: 0.7, z: 0.82 } }, shadows: true, receive: true, tint: "#9aa7b8" },
  rope: { key: M.rope, fit: { box: { x: 1, y: 0.62, z: 0.22 } }, shadows: true, tint: "#d9a441" },
  laser: { key: M.laser, fit: { box: { x: 1, y: 1.1, z: 0.3 } }, shadows: true, receive: true },
  camera: { key: M.camera, fit: { height: 0.5 }, shadows: true },
  desk: { key: M.desk, fit: { width: 0.98 }, shadows: true, receive: true },
  screen: { key: M.screen, fit: { width: 0.44 }, shadows: true, glow: "#7dd3fc", glowLevel: 0.35 },
  chair: { key: M.chair, fit: { height: 0.62 }, shadows: true },
  bookcase: { key: M.bookcase, fit: { box: { x: 0.92, y: 1.45, z: 0.6 } }, shadows: true, receive: true },
  console: { key: M.console, fit: { width: 0.9 }, shadows: true, receive: true },
  crate: { key: M.crate, fit: { width: 0.86 }, shadows: true, receive: true },
  key: { key: M.key, fit: { width: 0.36 }, shadows: true, glow: "#ffd76a", glowLevel: 0.6 },
  coin: { key: M.coin, fit: { width: 0.2 }, shadows: false },
  // Hillcrest Manor
  statue: { key: M.statue, fit: { height: 1.6 }, shadows: true, receive: true },
  plant: { key: M.plant, fit: { height: 1.25 }, shadows: true, receive: true },
  floorLamp: { key: M.floorLamp, fit: { height: 1.5 }, shadows: true },
  sofa: { key: M.sofa, fit: { box: { x: 0.8, y: 0.6, z: 1.8 } }, shadows: true, receive: true, tint: "#8f3b4a" },
  // Harbor Depot
  containerRed: { key: M.container, fit: { box: { x: 0.94, y: 1.5, z: 0.94 } }, shadows: true, receive: true, tint: "#d86a5a" },
  containerBlue: { key: M.container, fit: { box: { x: 0.94, y: 1.5, z: 0.94 } }, shadows: true, receive: true, tint: "#6a9be0" },
  containerGreen: { key: M.container, fit: { box: { x: 0.94, y: 1.5, z: 0.94 } }, shadows: true, receive: true, tint: "#6fc48a" },
  barrel: { key: M.barrel, fit: { height: 1.05 }, shadows: true, receive: true },
  // Grand Meridian
  slots: { key: M.slots, fit: { height: 1.5 }, shadows: true, receive: true },
  arcade: { key: M.arcade, fit: { height: 1.5 }, shadows: true, receive: true },
  vending: { key: M.vending, fit: { height: 1.5 }, shadows: true, receive: true },
  wheel: { key: M.wheel, fit: { height: 1.7 }, shadows: true, receive: true },
  cardTable: { key: M.cardTable, fit: { box: { x: 0.86, y: 0.6, z: 1.8 } }, shadows: true, receive: true, tint: "#3f8f5a" },
  // Apex Tower
  rack: { key: M.rack, fit: { box: { x: 0.9, y: 1.6, z: 0.9 } }, shadows: true, receive: true, tint: "#9db4d6" },
  canister: { key: M.canister, fit: { height: 0.9 }, shadows: true, receive: true },
  display: { key: M.display, fit: { box: { x: 0.9, y: 0.6, z: 1.8 } }, shadows: true, receive: true },
};

// Walls, floors and coin stacks in every district's colours; every thief on the crew.
for (const d of DISTRICTS) {
  const t = themeOf(d.id);
  SPECS[`wall_${d.id}`] = { key: M.wall, fit: { box: { x: 1, y: WALL_H, z: 1 } }, shadows: true, receive: true, tint: t.wall };
  SPECS[`exit_${d.id}`] = { key: M.exit, fit: { box: { x: 1, y: WALL_H, z: 1 } }, shadows: true, receive: true, tint: t.wall };
  SPECS[`floor_${d.id}`] = { key: d.id === "museum" || d.id === "harbor" ? M.floor : M.officeFloor, fit: { box: { x: 1, y: 0.05, z: 1 } }, receive: true, shadows: false, tint: t.floor };
  SPECS[`office_${d.id}`] = { key: M.officeFloor, fit: { box: { x: 1, y: 0.05, z: 1 } }, receive: true, shadows: false, tint: t.office };
  SPECS[`coins_${d.id}`] = { key: M.coins, fit: { height: 0.32 }, shadows: true, tint: t.coins };
}
for (const thief of THIEVES) SPECS[`thief_${thief.id}`] = { key: thief.key, fit: { height: 0.92 }, shadows: true };

/** Builds every prototype (scaled, grounded, tinted) from the loaded models. */
export function buildProtos(models: Map<string, LoadedModel>) {
  const protos = new Map<string, Proto>();
  const used = new Set<string>();
  for (const [name, spec] of Object.entries(SPECS)) {
    const m = models.get(spec.key);
    if (!m) continue;
    const copy = used.has(spec.key);
    used.add(spec.key);
    const scene = copy ? m.scene.clone() : m.scene;
    // Materials are per proto so tints never leak between them.
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((src) => {
        const mat = (copy ? src.clone() : src) as THREE.MeshStandardMaterial;
        if (spec.tint) {
          const t = typeof spec.tint === "string" ? spec.tint : spec.tint[mat.name];
          if (t) mat.color = new THREE.Color(t);
        }
        if (spec.dim) mat.color = (mat.color ?? new THREE.Color(1, 1, 1)).clone().multiplyScalar(spec.dim);
        if (spec.glow && "emissive" in mat) {
          mat.emissive = new THREE.Color(spec.glow);
          mat.emissiveIntensity = spec.glowLevel ?? 0.6;
        }
        if (spec.selfLit && "emissive" in mat) {
          mat.emissive = new THREE.Color("#ffe2b8");
          mat.emissiveMap = mat.map;
          mat.emissiveIntensity = spec.selfLit;
        }
        if (name === "flame") {
          mat.toneMapped = false;
          mat.depthWrite = false;
        }
        return mat;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
    });
    protos.set(name, makeProto(scene, m.animations, spec.fit, { shadows: spec.shadows ?? false, receive: spec.receive ?? false }));
  }
  return protos;
}

// --- Instancing ------------------------------------------------------------------------------------------

/** Collects placements and turns each proto's meshes into one InstancedMesh each. */
class Batch {
  private readonly items = new Map<string, THREE.Matrix4[]>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  add(key: string, x: number, y: number, z: number, yaw = 0, scale = 1, pitch = 0) {
    let list = this.items.get(key);
    if (!list) this.items.set(key, (list = []));
    this.e.set(pitch, yaw, 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.setScalar(scale);
    list.push(new THREE.Matrix4().compose(this.p, this.q, this.s));
  }

  build(protos: Map<string, Proto>, parent: THREE.Object3D) {
    const out: THREE.InstancedMesh[] = [];
    const inv = new THREE.Matrix4();
    for (const [key, mats] of this.items) {
      const proto = protos.get(key);
      if (!proto) continue;
      const root = proto.object;
      root.updateMatrixWorld(true);
      inv.copy(root.matrixWorld).invert();
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const rel = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
        mats.forEach((mm, i) => inst.setMatrixAt(i, this.m.multiplyMatrices(mm, rel)));
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = mesh.castShadow;
        inst.receiveShadow = mesh.receiveShadow;
        inst.computeBoundingSphere();
        parent.add(inst);
        out.push(inst);
      });
    }
    return out;
  }
}

// --- Level view --------------------------------------------------------------------------------------------

export interface TorchView {
  x: number;
  y: number;
  z: number;
  flame: THREE.Object3D | null;
  phase: number;
}

interface LaserGate {
  /** Frames and beams together: slides with a sweeping gate. */
  group: THREE.Group;
  beams: LaserBeams[];
}

export class LevelView {
  readonly group = new THREE.Group();
  readonly theme: Theme;
  readonly torches: TorchView[] = [];
  readonly cameras: THREE.Object3D[] = [];
  readonly gem: THREE.Object3D;
  readonly gemGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly gemBeam: THREE.Mesh;
  readonly exitGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly center: THREE.Vector3;
  private readonly loot: { obj: THREE.Object3D; glow: THREE.Object3D; spin: boolean }[] = [];
  private readonly keys: { obj: THREE.Object3D; glow: THREE.Object3D }[] = [];
  private readonly doors: THREE.Object3D[] = [];
  private readonly plateGlows: THREE.Mesh[] = [];
  private readonly lasers: LaserGate[] = [];
  private readonly instanced: THREE.InstancedMesh[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  constructor(
    readonly level: Parsed,
    districtId: string,
    protos: Map<string, Proto>,
  ) {
    const { grid } = level;
    const theme = (this.theme = themeOf(districtId));
    this.center = new THREE.Vector3((grid.w - 1) / 2, 0, (grid.h - 1) / 2);
    const batch = new Batch();
    const glowTex = radialTexture();
    const squareTex = squareTexture();
    this.owned.push(glowTex, squareTex);
    const has = (name: string) => protos.has(name);
    const clone = (name: string) => protos.get(name)?.object.clone() ?? new THREE.Group();

    // Floors, walls, murals.
    for (const f of level.floors) batch.add(f.office ? `office_${districtId}` : `floor_${districtId}`, f.x, -0.05, f.z);
    for (const w of level.walls) batch.add(`wall_${districtId}`, w.x, 0, w.z);
    if (theme.murals) for (const m of level.murals) batch.add("mural", m.x, 0.14, m.z + 0.012, m.yaw);
    for (const [x, z, rot] of level.def.rugs ?? []) batch.add("rug", x, 0.004, z, rot ? Math.PI / 2 : 0);
    for (const [x, z] of level.def.webs ?? []) batch.add("web", x - 0.12, WALL_H - 0.02, z - 0.12, Math.PI / 4);

    // Noisy floor: pale planks or a patch of gravel over the floor tile.
    if (level.noisy.length) {
      const tex = theme.noisy.look === "planks" ? plankTexture() : gravelTexture();
      const geo = new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ map: tex, color: theme.noisy.color, roughness: 0.95, metalness: 0, transparent: true, depthWrite: false });
      this.owned.push(tex, geo, mat);
      const inst = new THREE.InstancedMesh(geo, mat, level.noisy.length);
      const m4 = new THREE.Matrix4();
      level.noisy.forEach((c, i) => inst.setMatrixAt(i, m4.makeRotationY(((c.x * 7 + c.z * 13) % 4) * (Math.PI / 2) * (theme.noisy.look === "gravel" ? 1 : 0)).setPosition(c.x, 0.012, c.z)));
      inst.instanceMatrix.needsUpdate = true;
      inst.receiveShadow = true;
      inst.renderOrder = 1;
      inst.computeBoundingSphere();
      this.group.add(inst);
      this.instanced.push(inst);
    }

    // Exit door, opening into the level.
    batch.add(`exit_${districtId}`, level.exit.x, 0, level.exit.z, level.exit.yaw);
    this.exitGlow = floorGlow(glowTex, 2.2, "#3dff8a", 0.25, 0.03);
    this.exitGlow.position.x = level.exit.inside.x;
    this.exitGlow.position.z = level.exit.inside.z;
    this.group.add(this.exitGlow);

    // Props.
    for (const p of level.props) this.addProp(batch, theme, has, p.kind, p.x, p.z, p.yaw);

    // Lamps: a torch with a flame (the museum) or a wall lamp, and a pool of light on the floor.
    level.torches.forEach((t, i) => {
      const fx = t.mx + Math.sin(t.yaw) * 0.2;
      const fz = t.mz + Math.cos(t.yaw) * 0.2;
      let flame: THREE.Object3D | null = null;
      if (theme.flame || !has("wallLamp")) {
        batch.add("sconce", t.mx + Math.sin(t.yaw) * 0.04, 0.62, t.mz + Math.cos(t.yaw) * 0.04, t.yaw);
        flame = clone("flame");
        flame.position.set(fx, 0.98, fz);
        flame.rotation.y = Math.PI / 2;
        this.group.add(flame);
      } else batch.add("wallLamp", t.mx + Math.sin(t.yaw) * 0.08, 1.0, t.mz + Math.cos(t.yaw) * 0.08, t.yaw);
      this.torches.push({ x: fx, y: 1.15, z: fz, flame, phase: i * 1.7 });
      const pool = floorGlow(glowTex, 6.6, theme.lamp, 0.2, 0.018 + i * 0.0004);
      pool.position.x = t.x * 0.7 + fx * 0.3;
      pool.position.z = t.z * 0.7 + fz * 0.3;
      this.group.add(pool);
    });

    // Moonlight through skylights.
    const moonMat = new THREE.MeshBasicMaterial({ map: squareTex, color: "#9fc4ff", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const moonGeo = new THREE.PlaneGeometry(1.35, 1.35).rotateX(-Math.PI / 2);
    this.owned.push(moonMat, moonGeo);
    for (const m of level.moons) {
      const patch = new THREE.Mesh(moonGeo, moonMat);
      patch.position.set(m.x, 0.022, m.z);
      patch.renderOrder = 1;
      patch.userData.shared = true;
      this.group.add(patch);
      const beam = lightBeam(0.55, 0.75, 7, "#8fb4ff", 0.07);
      beam.position.set(m.x - 0.9, 3.5, m.z - 1.4);
      beam.rotation.set(0.38, 0, -0.25);
      this.owned.push(beam.geometry, beam.material as THREE.Material);
      this.group.add(beam);
    }

    // Pressure plates (instanced) with a hidden red glow for when one is stepped on.
    const plateGlowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: "#ff2a2a", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const plateGlowGeo = new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2);
    this.owned.push(plateGlowMat, plateGlowGeo);
    for (const p of level.plates) {
      batch.add("plate", p.x, 0.0, p.z);
      const glow = new THREE.Mesh(plateGlowGeo, plateGlowMat);
      glow.position.set(p.x, 0.06, p.z);
      glow.visible = false;
      glow.userData.shared = true;
      this.group.add(glow);
      this.plateGlows.push(glow);
    }

    // Laser gates: a frame per cell with its beams, in one group per gate so a sweeping gate can slide.
    const coreMat = new THREE.MeshBasicMaterial({ color: "#ff3030", toneMapped: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: "#ff2020", transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const coreGeo = new THREE.BoxGeometry(1, 0.022, 0.022);
    const glowGeo = new THREE.BoxGeometry(1, 0.1, 0.1);
    this.owned.push(coreMat, glowMat, coreGeo, glowGeo);
    for (const def of level.def.lasers ?? []) {
      const axis = def.axis ?? (def.z1 === def.z2 ? "x" : "z");
      const group = new THREE.Group();
      const beams: LaserBeams[] = [];
      const n = Math.max(Math.abs(def.x2 - def.x1), Math.abs(def.z2 - def.z1));
      for (let k = 0; k <= n; k++) {
        const x = def.x1 + Math.sign(def.x2 - def.x1) * k;
        const z = def.z1 + Math.sign(def.z2 - def.z1) * k;
        const yaw = axis === "x" ? 0 : Math.PI / 2;
        const frame = clone("laser");
        // The model's own beams are replaced by ours (they switch on and off).
        frame.traverse((o) => {
          if (o.name === "lasers" || o.parent?.name === "lasers") o.visible = false;
        });
        frame.position.set(x, 0, z);
        frame.rotation.y = yaw;
        const b = new LaserBeams(coreMat, glowMat, coreGeo, glowGeo);
        b.group.position.set(x, 0, z);
        b.group.rotation.y = yaw;
        b.group.scale.x = 0.86;
        group.add(frame, b.group);
        beams.push(b);
      }
      this.group.add(group);
      this.lasers.push({ group, beams });
    }

    // Security cameras on top of their walls.
    for (const cam of level.def.cameras ?? []) {
      const obj = clone("camera");
      obj.position.set(cam.x, WALL_H, cam.z);
      this.group.add(obj);
      this.cameras.push(obj);
    }

    // Locked doors (they sink into the floor when opened).
    for (const d of level.doors) {
      const obj = clone("door");
      obj.position.set(d.x, 0, d.z);
      obj.rotation.y = d.axis === "x" ? Math.PI / 2 : 0;
      this.group.add(obj);
      this.doors.push(obj);
    }

    // Key cards.
    for (const k of level.keys) {
      const obj = clone("key");
      obj.position.set(k.x, 0.32, k.z);
      this.group.add(obj);
      const glow = floorGlow(glowTex, 1.3, "#ffcf4d", 0.35, 0.025);
      glow.position.set(k.x, 0.025, k.z);
      this.group.add(glow);
      this.keys.push({ obj, glow });
    }

    // Loot (a safe is its own box: the loot is inside).
    for (const l of level.loot) {
      const name = l.kind === "coins" ? `coins_${districtId}` : theme.loot[l.kind];
      const obj = l.kind === "safe" ? new THREE.Group() : clone(has(name) ? name : l.kind === "coins" ? "coins_museum" : "gemLoot");
      obj.position.set(l.x, l.plinth ? PLINTH_H : 0, l.z);
      if (l.kind === "gem") obj.position.y += 0.12;
      this.group.add(obj);
      const glow = floorGlow(glowTex, l.kind === "safe" ? 1.7 : 1.25, l.kind === "safe" ? "#9fd0ff" : "#ffd27a", 0.22, 0.026);
      glow.position.set(l.x, 0.026, l.z);
      this.group.add(glow);
      this.loot.push({ obj, glow, spin: l.kind !== "coins" && l.kind !== "safe" });
    }

    // The target: a gem over its pedestal in a spotlight.
    const color = level.def.target.gem;
    this.gem = clone(`gem_${color}`);
    this.gem.position.set(level.target.x, PEDESTAL_H + 0.2, level.target.z);
    this.group.add(this.gem);
    this.gemGlow = floorGlow(glowTex, 2.6, GEM_COLORS[color], 0.4, 0.03);
    this.gemGlow.position.set(level.target.x, 0.03, level.target.z);
    this.group.add(this.gemGlow);
    this.gemBeam = lightBeam(0.18, 0.62, 5, "#fff3d6", 0.1);
    this.gemBeam.position.set(level.target.x, 2.5, level.target.z);
    this.owned.push(this.gemBeam.geometry, this.gemBeam.material as THREE.Material);
    this.group.add(this.gemBeam);

    this.instanced.push(...batch.build(protos, this.group));
  }

  private addProp(batch: Batch, theme: Theme, has: (name: string) => boolean, kind: PropKind, x: number, z: number, yaw: number) {
    const mapped = theme.props[kind];
    const name = mapped && (mapped === "crates" || mapped === "canisters" || has(mapped)) ? mapped : kind;
    switch (name) {
      case "crates":
        batch.add("crate", x, 0, z, 0);
        batch.add("crate", x + 0.04, 0.86, z - 0.03, 0.5, 0.82);
        break;
      case "canisters":
        batch.add("canister", x - 0.18, 0, z + 0.14, 0.3, 0.72);
        batch.add("canister", x + 0.2, 0, z - 0.16, 1.1, 0.86);
        break;
      case "desk":
        batch.add("desk", x, 0, z, yaw);
        batch.add("screen", x + Math.cos(yaw) * 0.12, 0.54, z - Math.sin(yaw) * 0.12, yaw);
        batch.add("chair", x + Math.sin(yaw) * 0.55, 0, z + Math.cos(yaw) * 0.55, yaw + Math.PI);
        break;
      case "containerRed":
      case "containerBlue":
      case "containerGreen":
        // Containers come in every colour, whatever letter the map used.
        batch.add(["containerRed", "containerBlue", "containerGreen"][(x * 3 + z * 5) % 3], x, 0, z, 0);
        break;
      default:
        batch.add(name, x, 0, z, yaw + (name === "statue" || name === "slots" || name === "arcade" || name === "vending" ? ((x + z) % 2 ? Math.PI : 0) : 0));
    }
  }

  /** Shows the heist as it stands: what has been taken, opened, tripped; where the lasers are. */
  sync(sim: HeistSim, dt: number, now: number) {
    sim.loot.forEach((l, i) => {
      const v = this.loot[i];
      v.obj.visible = !l.taken;
      v.glow.visible = !l.taken;
      if (!l.taken && v.spin) v.obj.rotation.y += dt * 0.6;
    });
    sim.keys.forEach((k, i) => {
      const v = this.keys[i];
      v.obj.visible = v.glow.visible = !k.taken;
      if (!k.taken) v.obj.rotation.y += dt * 2;
    });
    sim.doors.forEach((d, i) => {
      const obj = this.doors[i];
      obj.visible = d.open < 1;
      obj.position.y = -WALL_H * d.open;
    });
    sim.plates.forEach((p, i) => (this.plateGlows[i].visible = p.hit));
    sim.lasers.forEach((l, i) => {
      const gate = this.lasers[i];
      gate.group.position.set(l.off.x, 0, l.off.z);
      const level = l.jamT > 0 ? 0 : l.active ? 1 : l.warn ? 0.5 : 0;
      for (const b of gate.beams) b.set(level, now);
    });
    this.gem.visible = this.gemGlow.visible = this.gemBeam.visible = !sim.hasGem;
    if (!sim.hasGem) {
      this.gem.rotation.y += dt * 1.2;
      this.gem.position.y = PEDESTAL_H + 0.22 + Math.sin(now * 2) * 0.04;
    }
    for (const tr of this.torches) {
      if (!tr.flame) continue;
      const f = 1 + Math.sin(now * 13 + tr.phase) * 0.08 + Math.sin(now * 7.3 + tr.phase * 2) * 0.06;
      tr.flame.scale.set(1, f, 1);
    }
    this.exitGlow.material.opacity = sim.hasGem ? 0.5 + Math.sin(now * 4) * 0.2 : 0.12;
  }

  dispose() {
    for (const inst of this.instanced) {
      inst.removeFromParent();
      inst.dispose();
    }
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // Floor glows own their plane geometry and material (the shared ones are in `owned`).
      if (mesh.isMesh && !mesh.userData.shared && mesh.geometry?.type === "PlaneGeometry" && (mesh.material as THREE.Material).blending === THREE.AdditiveBlending) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    for (const o of this.owned) o.dispose();
    this.group.removeFromParent();
  }
}
