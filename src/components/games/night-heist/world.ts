import * as THREE from "three";
import { makeProto, type LoadedModel, type Proto } from "../shared/assets";
import { floorGlow, LaserBeams, lightBeam, radialTexture, squareTexture } from "./fx";
import type { GemColor, LaserDef, LootKind, Parsed, PropKind } from "./levels";
import { CH, M } from "./manifest";

/** Builds the 3D museum for a parsed heist: instanced static geometry plus the things that move. */

export const WALL_H = 1.3;
export const PEDESTAL_H = 0.62;
export const PLINTH_H = 0.42;

export const GEM_COLORS: Record<GemColor, string> = { red: "#ff4d5e", green: "#4dffa0", blue: "#5cb8ff" };

/** Model yaw corrections so every prop's front faces +z. */
const FRONT: Partial<Record<string, number>> = {};

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
  /** Lights its own texture a little (museum display lighting). */
  selfLit?: number;
}

const SPECS: Record<string, ProtoSpec> = {
  thief: { key: CH.thief, fit: { height: 0.92 }, shadows: true, dim: 0.62 },
  guard: { key: CH.guard, fit: { height: 0.98 }, shadows: true },
  warden: { key: CH.warden, fit: { height: 0.98 }, shadows: true },
  wall: { key: M.wall, fit: { box: { x: 1, y: WALL_H, z: 1 } }, shadows: true, receive: true, tint: { bricks: "#b8936a", stones: "#a88d6c" } },
  exit: { key: M.exit, fit: { box: { x: 1, y: WALL_H, z: 1 } }, shadows: true, receive: true, tint: { bricks: "#b8936a", stones: "#a88d6c" } },
  floor: { key: M.floor, fit: { box: { x: 1, y: 0.05, z: 1 } }, receive: true, shadows: false, tint: "#f0cc96" },
  office: { key: M.officeFloor, fit: { box: { x: 1, y: 0.05, z: 1 } }, receive: true, shadows: false, tint: "#5f6874" },
  rug: { key: M.rug, fit: { box: { x: 3, y: 0.03, z: 2 } }, receive: true, shadows: false, tint: "#9b2433" },
  mural: { key: M.mural, fit: { box: { x: 0.94, y: 1.02 } }, receive: true, shadows: false, selfLit: 0.55 },
  column: { key: M.column, fit: { height: 1.75 }, shadows: true, receive: true },
  door: { key: M.door, fit: { box: { x: 0.3, y: WALL_H, z: 1 } }, shadows: true, receive: true },
  sconce: { key: M.sconce, fit: { height: 0.46 }, shadows: false },
  flame: { key: M.flame, fit: { height: 0.4 }, shadows: false, glow: "#ff9a3c" },
  anubis: { key: M.anubis, fit: { height: 1.55 }, shadows: true, receive: true },
  bastet: { key: M.bastet, fit: { height: 1.4 }, shadows: true, receive: true },
  ra: { key: M.ra, fit: { height: 1.7 }, shadows: true, receive: true },
  obelisk: { key: M.obelisk, fit: { height: 2.5 }, shadows: true, receive: true },
  urn: { key: M.jar, fit: { height: 1.05 }, shadows: true, receive: true },
  jarLoot: { key: M.jarSmall, fit: { height: 0.46 }, shadows: true },
  figurine: { key: M.bastet, fit: { height: 0.46 }, shadows: true },
  gemLoot: { key: M.gemBlue, fit: { width: 0.3 }, shadows: false, glow: "#6fb8ff" },
  gem_red: { key: M.gemRed, fit: { width: 0.58 }, shadows: false, glow: GEM_COLORS.red },
  gem_green: { key: M.gemGreen, fit: { width: 0.58 }, shadows: false, glow: GEM_COLORS.green },
  gem_blue: { key: M.gemBlue, fit: { width: 0.58 }, shadows: false, glow: GEM_COLORS.blue },
  coins: { key: M.coins, fit: { height: 0.32 }, shadows: true },
  plate: { key: M.plate, fit: { box: { x: 0.84, y: 0.07, z: 0.84 } }, shadows: false, receive: true, tint: "#9a6a52" },
  web: { key: M.web, fit: { width: 1.5 }, shadows: false },
  sarcophagus: { key: M.sarcophagus, fit: { box: { x: 0.9, y: 0.62, z: 1.85 } }, shadows: true, receive: true },
  pedestal: { key: M.pedestal, fit: { box: { x: 0.84, y: PEDESTAL_H, z: 0.84 } }, shadows: true, receive: true },
  plinth: { key: M.pedestal, fit: { box: { x: 0.58, y: PLINTH_H, z: 0.58 } }, shadows: true, receive: true },
  rope: { key: M.rope, fit: { box: { x: 1, y: 0.62, z: 0.22 } }, shadows: true, tint: "#d9a441" },
  laser: { key: M.laser, fit: { box: { x: 1, y: 1.1, z: 0.3 } }, shadows: true, receive: true },
  camera: { key: M.camera, fit: { height: 0.5 }, shadows: true },
  desk: { key: M.desk, fit: { width: 0.98 }, shadows: true, receive: true },
  screen: { key: M.screen, fit: { width: 0.44 }, shadows: true, glow: "#7dd3fc" },
  chair: { key: M.chair, fit: { height: 0.62 }, shadows: true },
  bookcase: { key: M.bookcase, fit: { height: 1.35 }, shadows: true, receive: true },
  console: { key: M.console, fit: { width: 0.9 }, shadows: true, receive: true },
  crate: { key: M.crate, fit: { width: 0.86 }, shadows: true, receive: true },
  key: { key: M.key, fit: { width: 0.36 }, shadows: true, glow: "#ffd76a" },
  coin: { key: M.coin, fit: { width: 0.2 }, shadows: false },
};

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
          mat.emissiveIntensity = name === "flame" ? 2.2 : name === "screen" ? 0.35 : name.startsWith("gem") ? 0.22 : 0.6;
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
    this.e.set(pitch, yaw + (FRONT[key] ?? 0), 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.setScalar(scale);
    list.push(new THREE.Matrix4().compose(this.p, this.q, this.s));
  }

  build(protos: Map<string, Proto>, parent: THREE.Object3D, skip?: (mesh: THREE.Mesh) => boolean) {
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
        if (!mesh.isMesh || (skip && skip(mesh))) return;
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

export interface LootView {
  x: number;
  z: number;
  kind: LootKind;
  obj: THREE.Object3D;
  taken: boolean;
  plinth: boolean;
}

export interface DoorView {
  x: number;
  z: number;
  obj: THREE.Object3D;
  open: number;
  opening: boolean;
}

export interface LaserView {
  def: LaserDef;
  cells: { x: number; z: number; axis: "x" | "z" }[];
  beams: LaserBeams[];
}

export interface TorchView {
  x: number;
  y: number;
  z: number;
  flame: THREE.Object3D;
  phase: number;
}

export class LevelView {
  readonly group = new THREE.Group();
  readonly loot: LootView[] = [];
  readonly doors: DoorView[] = [];
  readonly keys: { x: number; z: number; obj: THREE.Object3D; taken: boolean }[] = [];
  readonly lasers: LaserView[] = [];
  readonly torches: TorchView[] = [];
  readonly cameras: THREE.Object3D[] = [];
  readonly plates: { x: number; z: number; glow: THREE.Mesh }[] = [];
  readonly gem: THREE.Object3D;
  readonly gemGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly gemBeam: THREE.Mesh;
  readonly exitGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  readonly center: THREE.Vector3;
  private readonly instanced: THREE.InstancedMesh[] = [];
  private readonly owned: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  constructor(
    readonly level: Parsed,
    protos: Map<string, Proto>,
  ) {
    const { grid } = level;
    this.center = new THREE.Vector3((grid.w - 1) / 2, 0, (grid.h - 1) / 2);
    const batch = new Batch();
    const glowTex = radialTexture();
    const squareTex = squareTexture();
    this.owned.push(glowTex, squareTex);

    // Floors, walls, murals.
    for (const f of level.floors) batch.add(f.office ? "office" : "floor", f.x, -0.05, f.z);
    for (const w of level.walls) batch.add("wall", w.x, 0, w.z);
    for (const m of level.murals) batch.add("mural", m.x, 0.14, m.z + 0.012, m.yaw);
    for (const [x, z, rot] of level.def.rugs ?? []) batch.add("rug", x, 0.004, z, rot ? Math.PI / 2 : 0);
    for (const [x, z] of level.def.webs ?? []) batch.add("web", x - 0.12, WALL_H - 0.02, z - 0.12, Math.PI / 4);

    // Exit door, opening into the level.
    batch.add("exit", level.exit.x, 0, level.exit.z, level.exit.yaw);
    this.exitGlow = floorGlow(glowTex, 2.2, "#3dff8a", 0.25, 0.03);
    this.exitGlow.position.x = level.exit.inside.x;
    this.exitGlow.position.z = level.exit.inside.z;
    this.group.add(this.exitGlow);

    // Props.
    for (const p of level.props) this.addProp(batch, p.kind, p.x, p.z, p.yaw);

    // Torches: sconce on the wall, a flickering flame, a warm pool of light.
    level.torches.forEach((t, i) => {
      batch.add("sconce", t.mx + Math.sin(t.yaw) * 0.04, 0.62, t.mz + Math.cos(t.yaw) * 0.04, t.yaw);
      const flame = protos.get("flame")?.object.clone() ?? new THREE.Group();
      const fx = t.mx + Math.sin(t.yaw) * 0.2;
      const fz = t.mz + Math.cos(t.yaw) * 0.2;
      flame.position.set(fx, 0.98, fz);
      flame.rotation.y = Math.PI / 2;
      this.group.add(flame);
      this.torches.push({ x: fx, y: 1.15, z: fz, flame, phase: i * 1.7 });
      const pool = floorGlow(glowTex, 6.6, "#ff9a45", 0.2, 0.018 + i * 0.0004);
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
      this.group.add(glow);
      this.plates.push({ x: p.x, z: p.z, glow });
    }

    // Laser gates: frames instanced, beams separate.
    const coreMat = new THREE.MeshBasicMaterial({ color: "#ff3030", toneMapped: false });
    const glowMat = new THREE.MeshBasicMaterial({ color: "#ff2020", transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const coreGeo = new THREE.BoxGeometry(1, 0.022, 0.022);
    const glowGeo = new THREE.BoxGeometry(1, 0.1, 0.1);
    this.owned.push(coreMat, glowMat, coreGeo, glowGeo);
    for (const def of level.def.lasers ?? []) {
      const cells: LaserView["cells"] = [];
      const axis = def.axis ?? (def.z1 === def.z2 ? "x" : "z");
      const n = Math.max(Math.abs(def.x2 - def.x1), Math.abs(def.z2 - def.z1));
      for (let k = 0; k <= n; k++) {
        const x = def.x1 + Math.sign(def.x2 - def.x1) * k;
        const z = def.z1 + Math.sign(def.z2 - def.z1) * k;
        cells.push({ x, z, axis });
      }
      const beams: LaserBeams[] = [];
      for (const c of cells) {
        const yaw = c.axis === "x" ? 0 : Math.PI / 2;
        batch.add("laser", c.x, 0, c.z, yaw);
        const b = new LaserBeams(coreMat, glowMat, coreGeo, glowGeo);
        b.group.position.set(c.x, 0, c.z);
        b.group.rotation.y = yaw;
        b.group.scale.x = 0.86;
        this.group.add(b.group);
        beams.push(b);
      }
      this.lasers.push({ def, cells, beams });
    }

    // Security cameras on top of their walls.
    for (const cam of level.def.cameras ?? []) {
      const obj = protos.get("camera")?.object.clone() ?? new THREE.Group();
      obj.position.set(cam.x, WALL_H, cam.z);
      this.group.add(obj);
      this.cameras.push(obj);
    }

    // Locked doors (they sink into the floor when opened).
    for (const d of level.doors) {
      const obj = protos.get("door")?.object.clone() ?? new THREE.Group();
      obj.position.set(d.x, 0, d.z);
      obj.rotation.y = d.axis === "x" ? Math.PI / 2 : 0;
      this.group.add(obj);
      this.doors.push({ x: d.x, z: d.z, obj, open: 0, opening: false });
    }

    // Key cards.
    for (const k of level.keys) {
      const obj = protos.get("key")?.object.clone() ?? new THREE.Group();
      obj.position.set(k.x, 0.32, k.z);
      this.group.add(obj);
      const glow = floorGlow(glowTex, 1.3, "#ffcf4d", 0.35, 0.025);
      glow.position.set(k.x, 0.025, k.z);
      obj.userData.glow = glow;
      this.group.add(glow);
      this.keys.push({ x: k.x, z: k.z, obj, taken: false });
    }

    // Loot.
    for (const l of level.loot) {
      const name = l.kind === "coins" ? "coins" : l.kind === "jar" ? "jarLoot" : l.kind === "figurine" ? "figurine" : "gemLoot";
      const obj = protos.get(name)?.object.clone() ?? new THREE.Group();
      obj.position.set(l.x, l.plinth ? PLINTH_H : 0, l.z);
      if (l.kind === "gem") obj.position.y += 0.12;
      this.group.add(obj);
      const glow = floorGlow(glowTex, 1.25, "#ffd27a", 0.22, 0.026);
      glow.position.set(l.x, 0.026, l.z);
      obj.userData.glow = glow;
      this.group.add(glow);
      this.loot.push({ x: l.x, z: l.z, kind: l.kind, obj, taken: false, plinth: l.plinth });
    }

    // The target: a gem over its pedestal in a museum spotlight.
    const color = level.def.target.gem;
    this.gem = protos.get(`gem_${color}`)?.object.clone() ?? new THREE.Group();
    this.gem.position.set(level.target.x, PEDESTAL_H + 0.2, level.target.z);
    this.group.add(this.gem);
    this.gemGlow = floorGlow(glowTex, 2.6, GEM_COLORS[color], 0.4, 0.03);
    this.gemGlow.position.set(level.target.x, 0.03, level.target.z);
    this.group.add(this.gemGlow);
    this.gemBeam = lightBeam(0.18, 0.62, 5, "#fff3d6", 0.1);
    this.gemBeam.position.set(level.target.x, 2.5, level.target.z);
    this.owned.push(this.gemBeam.geometry, this.gemBeam.material as THREE.Material);
    this.group.add(this.gemBeam);

    this.instanced = batch.build(protos, this.group, (mesh) => mesh.name === "lasers" || mesh.parent?.name === "lasers");
  }

  private addProp(batch: Batch, kind: PropKind, x: number, z: number, yaw: number) {
    switch (kind) {
      case "crates":
        batch.add("crate", x, 0, z, 0);
        batch.add("crate", x + 0.04, 0.86, z - 0.03, 0.5, 0.82);
        break;
      case "desk":
        batch.add("desk", x, 0, z, yaw);
        batch.add("screen", x + Math.cos(yaw) * 0.12, 0.54, z - Math.sin(yaw) * 0.12, yaw);
        batch.add("chair", x + Math.sin(yaw) * 0.55, 0, z + Math.cos(yaw) * 0.55, yaw + Math.PI);
        break;
      case "pedestal":
        batch.add("pedestal", x, 0, z, 0);
        break;
      default:
        batch.add(kind, x, 0, z, yaw);
    }
  }

  dispose() {
    for (const inst of this.instanced) {
      inst.removeFromParent();
      inst.dispose();
    }
    for (const o of this.owned) o.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      // Floor glows own their plane geometry and material.
      if (mesh.isMesh && mesh.userData.ownGeo !== false && mesh.geometry?.type === "PlaneGeometry" && (mesh.material as THREE.Material).blending === THREE.AdditiveBlending) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.group.removeFromParent();
  }
}
