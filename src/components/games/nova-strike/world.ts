import * as THREE from "three";
import type { Proto } from "../shared/assets";
import { RockField, ROCK_KEYS, SATELLITE_KEYS } from "./enemies";
import { Instancer, Sky } from "./fx";
import { M } from "./manifest";
import { hash, newFrame, type Rail } from "./rail";
import { TRENCH, type StageDef } from "./stages";

/**
 * Stage scenery: the sky, far backdrops (planets, a giant asteroid), and what lines the rail —
 * a decorative asteroid field, drifting dead satellites, or the station trench (floor, walls,
 * pipes and the station's superstructure, all instanced).
 */

const f = newFrame();
const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpR = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const SEG = 6;
const AHEAD = 560;
const BEHIND = 30;

interface Backdrop {
  obj: THREE.Object3D;
  dir: THREE.Vector3;
  dist: number;
  spin: number;
}

export class World {
  readonly sky = new Sky();
  readonly group = new THREE.Group();
  readonly backdrop = new THREE.Group();
  private readonly hemi = new THREE.HemisphereLight("#8888ff", "#110022", 0.8);
  private readonly sun = new THREE.DirectionalLight("#ffffff", 1.9);
  private readonly fill = new THREE.DirectionalLight("#88ccff", 0.6);
  private readonly rockField: RockField;
  private readonly trench = new Map<string, Instancer>();
  private readonly derelicts: Instancer[] = [];
  private backdrops: Backdrop[] = [];
  private stage: StageDef | null = null;

  constructor(
    private readonly protos: Map<string, Proto>,
    private readonly scene: THREE.Scene,
  ) {
    scene.add(this.sky.group, this.backdrop, this.group, this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.rockField = new RockField(protos, ROCK_KEYS.filter((k) => protos.has(k)));
    this.group.add(this.rockField.group);

    // Station trench pieces (unit-sized protos, scaled per instance).
    const trenchKeys = [M.floor, M.floorDetail, M.wall, M.wallWindow, M.wallPillar, M.pipe, M.container, M.barrier, M.display, M.structure, M.supports, M.hangarGlass, M.structureDiagonal];
    for (const k of trenchKeys) {
      const proto = protos.get(`trench:${k}`) ?? protos.get(k);
      if (!proto) continue;
      const cap = k === M.floor || k === M.floorDetail ? 300 : k.startsWith("space-station-kit/wall") ? 200 : 120;
      const inst = new Instancer(proto, cap);
      this.trench.set(k, inst);
      this.group.add(inst.group);
    }
    // Dead satellites drifting far from the rail (graveyard).
    for (const k of SATELLITE_KEYS) {
      const proto = protos.get(k);
      if (!proto) continue;
      const inst = new Instancer(proto, 40);
      this.derelicts.push(inst);
      this.group.add(inst.group);
    }
  }

  setStage(stage: StageDef) {
    this.stage = stage;
    this.sky.setColors(stage.sky);
    this.scene.fog = new THREE.Fog(stage.fog, stage.scenery === "trench" ? 220 : 240, stage.scenery === "trench" ? 520 : 560);
    this.scene.background = new THREE.Color(stage.fog);
    this.hemi.color.set(stage.ambient);
    this.hemi.groundColor.set("#0a0612");
    this.hemi.intensity = stage.scenery === "trench" ? 1.0 : 0.8;
    this.sun.color.set(stage.sun);
    this.fill.color.set(stage.sky.nebulaB).lerp(new THREE.Color("#ffffff"), 0.4);
    this.buildBackdrop(stage);
    this.rockField.group.visible = stage.scenery !== "trench";
    for (const i of this.trench.values()) i.group.visible = stage.scenery === "trench";
    for (const i of this.derelicts) i.group.visible = stage.scenery === "graveyard";
  }

  private buildBackdrop(stage: StageDef) {
    for (const b of this.backdrops) b.obj.removeFromParent();
    this.backdrops = [];
    const add = (key: string, dir: [number, number, number], dist: number, size: number, spin = 0, tilt = 0) => {
      const proto = this.protos.get(key);
      if (!proto) return;
      const obj = proto.object.clone();
      const max = Math.max(proto.size.x, proto.size.y, proto.size.z);
      obj.scale.setScalar(size / max);
      obj.rotation.set(tilt, 0, tilt * 0.5);
      this.backdrop.add(obj);
      this.backdrops.push({ obj, dir: new THREE.Vector3(...dir).normalize(), dist, spin });
    };
    if (stage.scenery === "belt") {
      add(M.ringedPlanet, [-0.55, 0.32, -1], 1500, 900, 0.004, 0.35);
      add(M.bennu, [0.85, -0.15, -1], 1200, 230, 0.03);
    } else if (stage.scenery === "graveyard") {
      add(M.pinkPlanet, [0.6, 0.35, -1], 1500, 760, 0.003, -0.3);
      add(M.bennu, [-0.8, -0.35, -1], 1100, 150, 0.04);
    } else {
      add(M.ringedPlanet, [0.2, -0.9, -1], 1500, 1300, 0.002, 0.15);
      add(M.pinkPlanet, [-0.7, 0.45, -1], 1600, 260, 0.004, 0.4);
    }
  }

  /** Lights follow the camera; scenery is rebuilt around rail distance s. */
  update(rail: Rail, s: number, camera: THREE.Camera, time: number) {
    const stage = this.stage;
    if (!stage) return;
    this.sky.update(camera, time);
    const cam = this.sky.group.position;
    this.backdrop.position.copy(cam);
    for (const b of this.backdrops) {
      b.obj.position.copy(b.dir).multiplyScalar(b.dist);
      b.obj.rotation.y = time * b.spin;
    }
    rail.frame(s, f);
    this.sun.position.copy(cam).add(tmpP.set(-0.5, 0.8, 0.4).multiplyScalar(100));
    this.sun.target.position.copy(cam);
    this.fill.position.copy(cam).add(tmpP.set(0.7, -0.4, -0.6).multiplyScalar(100));
    this.fill.target.position.copy(cam);

    if (stage.scenery === "belt") this.rockField.update(rail, s - BEHIND, s + AHEAD, time, 1);
    else if (stage.scenery === "graveyard") {
      this.rockField.update(rail, s - BEHIND, s + AHEAD, time, 0.25);
      this.updateDerelicts(rail, s, time);
    } else this.updateTrench(rail, s);
  }

  private updateDerelicts(rail: Rail, s: number, time: number) {
    if (!this.derelicts.length) return;
    for (const i of this.derelicts) i.begin();
    const step = 40;
    for (let slot = Math.floor((s - BEHIND) / step); slot * step < s + AHEAD; slot++) {
      const h = hash(slot, 7);
      if (h > 0.8) continue;
      const ss = slot * step + hash(slot, 8) * step;
      const side = hash(slot, 9) < 0.5 ? -1 : 1;
      const dist = 30 + hash(slot, 10) * 110;
      rail.frame(ss, f);
      tmpP.copy(f.pos).addScaledVector(f.right, side * dist).addScaledVector(f.up, (hash(slot, 11) - 0.5) * 70);
      const spin = (hash(slot, 12) - 0.5) * 0.3;
      tmpQ.setFromEuler(tmpE.set(hash(slot, 13) * 6 + time * spin, hash(slot, 14) * 6 + time * spin * 0.6, hash(slot, 15) * 6));
      tmpS.setScalar(10 + hash(slot, 16) * 26);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.derelicts[Math.floor(hash(slot, 17) * this.derelicts.length)].add(tmpM);
    }
    for (const i of this.derelicts) i.end();
  }

  private place(key: string, s: number, x: number, y: number, sx: number, sy: number, sz: number, rotY = 0, rotZ = 0) {
    const inst = this.trench.get(key);
    if (!inst) return;
    tmpP.copy(f.pos).addScaledVector(f.right, x).addScaledVector(f.up, y);
    tmpQ.copy(f.quat);
    if (rotY) tmpQ.multiply(tmpR.setFromAxisAngle(Y_AXIS, rotY));
    if (rotZ) tmpQ.multiply(tmpR.setFromAxisAngle(Z_AXIS, rotZ));
    tmpS.set(sx, sy, sz);
    tmpM.compose(tmpP, tmpQ, tmpS);
    inst.add(tmpM);
    void s;
  }

  private updateTrench(rail: Rail, s: number) {
    for (const i of this.trench.values()) i.begin();
    const W = TRENCH.halfWidth;
    const H = TRENCH.wallTop - TRENCH.floor + 0.5;
    const strip = (W * 2) / 3;
    for (let k = Math.floor((s - BEHIND) / SEG); k * SEG < s + AHEAD; k++) {
      const ss = k * SEG + SEG / 2;
      rail.frame(ss, f);
      // Floor: three strips (the floor tiles are 1 x 0.3 x 1, grounded).
      for (let i = 0; i < 3; i++) {
        const detail = hash(k, i) < 0.2;
        this.place(detail ? M.floorDetail : M.floor, ss, -W + strip * (i + 0.5), TRENCH.floor - 1, strip + 0.05, 1 / 0.3, SEG + 0.05);
      }
      // Walls, facing in (wall pieces are 1 x 1 x 0.3, face +Z).
      for (const side of [-1, 1]) {
        const v = k % 6 === 0 ? M.wallPillar : hash(k, side + 5) < 0.3 ? M.wallWindow : M.wall;
        this.place(v, ss, side * (W + 0.5), TRENCH.floor - 0.5, SEG + 0.05, H, 3, (-side * Math.PI) / 2);
        // A pipe running along each wall.
        this.place(M.pipe, ss, side * (W - 0.7), 1.5, 1.6, 1.6, SEG / 1 + 0.05);
        if (k % 9 === 3) this.place(M.display, ss, side * (W - 0.25), 4, 6, 6, 4, (-side * Math.PI) / 2);
        // Floor clutter along the walls (below and outside the flight box).
        const h = hash(k, side + 30);
        if (h < 0.18) this.place(M.container, ss, side * (W - 2.2), TRENCH.floor, 3.2, 3.2, 3.2);
        else if (h < 0.26) this.place(M.barrier, ss, side * (W - 2.4), TRENCH.floor, 3, 2.4, 3);
        // Station superstructure beyond the walls.
        if (k % 5 === 0) {
          const hk = hash(k, side + 50);
          const key = hk < 0.35 ? M.structure : hk < 0.6 ? M.supports : hk < 0.8 ? M.structureDiagonal : M.hangarGlass;
          const size = key === M.hangarGlass ? 7 : 6 + hash(k, side + 60) * 8;
          const tall = key === M.hangarGlass ? 1 : 1 + Math.floor(hash(k, side + 70) * 3);
          this.place(key, ss, side * (W + 6 + hash(k, side + 80) * 14), TRENCH.wallTop - 6 + hash(k, side + 90) * 4, size, size * tall, size);
        }
      }
    }
    for (const i of this.trench.values()) i.end();
  }

  dispose() {
    this.sky.dispose();
    this.rockField.dispose();
    for (const i of this.trench.values()) i.dispose();
    for (const i of this.derelicts) i.dispose();
  }
}
