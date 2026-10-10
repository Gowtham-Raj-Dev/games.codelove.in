import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeTree, loadModels, makeProto, type LoadProgress, type Proto } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { AIR_WALTZ } from "../shared/songs";
import { Sfx } from "./audio";
import { CEILING, COURSES, DAY_HOURS, DAY_START_HOUR, ISLANDS, REGIONS, RING_LINES, SHIFT_SECONDS, STORMS, UPDRAFTS, WORLD_RADIUS } from "./data";
import { Beam, CloudPuffs, CloudSea, makeArrow, makeHaloMaterial, newLook, Particles, SkyDome, skyLook, UpdraftColumns, WindStreaks, type PuffSpec } from "./fx";
import { AERO, MODELS, PARCEL, PROP, ROCKS, SHIP, TRAFFIC } from "./manifest";
import { MaterialBank, rng, World, type Island } from "./world";

// --- Tuning ---------------------------------------------------------------------------------------

/** From the balloon's centre down to the gondola's foot, and up to the fin tips. */
const BOT = 4.4;
const TOP = 2.6;
const HULL_R = 2.3;
const MIN_SPEED = 6;
const BASE_SPEED = 30;
const CLIMB = 14;
const ZONE_R = 14;
const ZONE_H = 48;
const SHADOW_EXTENT = 110;
const WIND = new THREE.Vector3(1.2, 0, 0.45);
const TAU = Math.PI * 2;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// --- Public types ---------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "results" | "error";
export type Mode = "shift" | "trial";
export type MenuView = "ship" | "map";

export interface Upgrades {
  engine: number;
  tank: number;
  hull: number;
}

export interface JobView {
  from: string;
  to: string;
  dist: number;
  pay: number;
  time: number;
  express: boolean;
}

export interface Toast {
  id: number;
  title: string;
  lines: string[];
  tone: "good" | "bad" | "info" | "gold";
}

export interface Hud {
  mode: Mode;
  speed: number;
  alt: number;
  throttle: number;
  boost: number;
  boostCap: number;
  boosting: boolean;
  hull: number;
  maxHull: number;
  coins: number;
  clock: string;
  dayFrac: number;
  carry: (JobView & { left: number; condition: number }) | null;
  offers: (JobView & { away: number })[];
  chain: number;
  delivered: number;
  trial: { name: string; ring: number; total: number; time: number; countdown: number; best: number } | null;
  warn: string | null;
  prompt: string | null;
  toast: Toast | null;
  heading: number;
}

export interface ShiftResult {
  kind: "shift";
  region: number;
  earned: number;
  delivered: number;
  onTime: number;
  late: number;
  bestChain: number;
  rings: number;
  reason: "time" | "hull";
}

export interface TrialResult {
  kind: "trial";
  course: number;
  /** Seconds, or 0 when the trial was not finished. */
  time: number;
  /** 0 none, 1 bronze, 2 silver, 3 gold. */
  medal: number;
}

export type Result = ShiftResult | TrialResult;

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  result(result: Result): void;
  error(message: string): void;
}

export const EMPTY_HUD: Hud = {
  mode: "shift",
  speed: 0,
  alt: 0,
  throttle: 0.5,
  boost: 0,
  boostCap: 1,
  boosting: false,
  hull: 100,
  maxHull: 100,
  coins: 0,
  clock: "08:00",
  dayFrac: 0,
  carry: null,
  offers: [],
  chain: 0,
  delivered: 0,
  trial: null,
  warn: null,
  prompt: null,
  toast: null,
  heading: 0,
};

export type KeyName = "left" | "right" | "up" | "down" | "thrUp" | "thrDown" | "boost" | "look";

// --- Internal types ---------------------------------------------------------------------------------

interface Offer {
  from: number;
  to: number;
  dist: number;
  pay: number;
  time: number;
  express: boolean;
}

interface Carry extends Offer {
  left: number;
  condition: number;
  lateShown: boolean;
}

interface Ring {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  yaw: number;
  r: number;
  cd: number;
  set: RingSet;
  slot: number;
  halo: number;
}

interface Balloon {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  bob: number;
  r: number;
  h: number;
  spin: number;
}

interface Bird {
  obj: THREE.Object3D;
  off: THREE.Vector3;
  flap: number;
  wings: { bone: THREE.Object3D; rest: THREE.Euler; side: number }[];
  crow: boolean;
  scatter: THREE.Vector3;
}

interface Flock {
  anchor: THREE.Vector3;
  center: THREE.Vector3;
  radius: number;
  angle: number;
  speed: number;
  dir: number;
  birds: Bird[];
  scatter: number;
  cd: number;
  chirp: number;
  active: boolean;
}

interface Storm {
  x: number;
  z: number;
  y: number;
  r: number;
  t: number;
}

interface FloatText {
  text: string;
  color: string;
  pos: THREE.Vector3;
  age: number;
  life: number;
  big: boolean;
}

/** All copies of one ring model as instanced meshes (one draw per sub-mesh for every ring). */
class RingSet {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly parts: THREE.Matrix4[] = [];
  readonly holeR: number;
  private readonly height: number;
  private readonly m = new THREE.Matrix4();
  private readonly m2 = new THREE.Matrix4();
  private readonly qy = new THREE.Quaternion();
  private readonly tilt = new THREE.Matrix4().makeRotationX(Math.PI / 2);

  constructor(
    proto: Proto,
    capacity: number,
    readonly scale: number,
    parent: THREE.Object3D,
  ) {
    proto.object.updateMatrixWorld(true);
    let inner = Infinity;
    const outer = Math.max(proto.size.x, proto.size.z) / 2;
    const v = new THREE.Vector3();
    proto.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, capacity);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = false;
      im.receiveShadow = false;
      this.meshes.push(im);
      this.parts.push(mesh.matrixWorld.clone());
      parent.add(im);
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const r = Math.hypot(v.x, v.z);
        if (r > outer * 0.2 && r < inner) inner = r;
      }
    });
    this.holeR = (Number.isFinite(inner) ? inner : outer * 0.5) * scale;
    this.height = proto.size.y;
  }

  set count(n: number) {
    for (const im of this.meshes) im.count = n;
  }

  place(i: number, pos: THREE.Vector3, yaw: number) {
    this.qy.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.m.compose(pos, this.qy, new THREE.Vector3(1, 1, 1));
    this.m.multiply(this.tilt);
    this.m2.makeTranslation(0, (-this.height * this.scale) / 2, 0);
    this.m.multiply(this.m2);
    this.m2.makeScale(this.scale, this.scale, this.scale);
    this.m.multiply(this.m2);
    this.meshes.forEach((im, j) => {
      im.setMatrixAt(i, this.m2.multiplyMatrices(this.m, this.parts[j]));
      im.instanceMatrix.needsUpdate = true;
    });
  }

  dispose() {
    for (const im of this.meshes) {
      im.removeFromParent();
      im.dispose();
    }
  }
}

const HALO_GOLD = new THREE.Color("#ffc94a");
const HALO_BLUE = new THREE.Color("#6fc3ff");
const HALO_DIM = new THREE.Color("#1b2a3c");
const HALO_NEXT = new THREE.Color("#ffe9a8");

// --- Game ---------------------------------------------------------------------------------------------

export class SkyCourierGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.6, 4200);
  private readonly sun = new THREE.DirectionalLight("#fff1dc", 2.6);
  private readonly hemi = new THREE.HemisphereLight("#d9ecff", "#8d84b4", 1.2);
  private readonly fog = new THREE.Fog("#d4e4f1", 320, 1700);
  private readonly look = newLook();
  private readonly sky = new SkyDome();
  private readonly sea = new CloudSea();
  private puffs: CloudPuffs | null = null;
  private readonly glow = new Particles(1400, { additive: true });
  private readonly smoke = new Particles(700);
  private readonly streaks = new WindStreaks();
  private readonly arrow = makeArrow();
  private readonly updrafts = new UpdraftColumns(UPDRAFTS, CEILING);
  private readonly protos = new Map<string, Proto>();
  private readonly bank = new MaterialBank();
  private readonly timer = new THREE.Timer();
  private world: World | null = null;
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private overlay: CanvasRenderingContext2D | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private view = { w: 1, h: 1, dpr: 1 };
  private font = "ui-sans-serif, system-ui, sans-serif";
  private readonly coarse: boolean;
  private readonly res = { cur: 1, max: 1, min: 0.6, acc: 0, n: 0, good: 0 };

  private phase: Phase = "loading";
  private mode: Mode = "shift";
  private menuView: MenuView = "ship";
  private up: Upgrades = { engine: 0, tank: 0, hull: 0 };
  private region = 0;

  // Airship.
  private readonly shipRoot = new THREE.Group();
  private readonly propSpin = new THREE.Group();
  private parcel: THREE.Object3D | null = null;
  private readonly glowMats: THREE.MeshStandardMaterial[] = [];
  private readonly pos = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  private readonly knock = new THREE.Vector3();
  private yaw = 0;
  private yawRate = 0;
  private speed = 0;
  private vs = 0;
  private throttle = 0.55;
  private boost = 0.5;
  private boosting = false;
  private hull = 100;
  private roll = 0;
  private pitch = 0;
  private bumpCd = 0;
  private birdSlow = 0;
  private turbV = 0;
  private turbYaw = 0;
  private inUpdraft = false;
  private inStorm = 0;
  private menuSpot = new THREE.Vector3();
  private menuYaw = 0;

  // Input.
  private readonly keys: Record<KeyName, boolean> = { left: false, right: false, up: false, down: false, thrUp: false, thrDown: false, boost: false, look: false };
  private stickX = 0;
  private stickY = 0;
  private touchBoost = false;
  private touchThrottle: number | null = null;

  // Shift.
  private clock = 0;
  private coins = 0;
  private delivered = 0;
  private onTime = 0;
  private late = 0;
  private chain = 0;
  private bestChain = 0;
  private ringsHit = 0;
  private carry: Carry | null = null;
  private offers: Offer[] = [];
  private lastTick = 0;

  // Trial.
  private course = 0;
  private trialRings: Ring[] = [];
  private trialNext = 0;
  private trialTime = 0;
  private countdown = 0;
  private lastCount = 0;

  // World objects.
  private beams: (Beam | null)[] = [];
  private readonly pickupMarkers: THREE.Object3D[] = [];
  private boostRings: Ring[] = [];
  private boostSet: RingSet | null = null;
  private trialSet: RingSet | null = null;
  private halos: THREE.InstancedMesh | null = null;
  private haloMaterial: THREE.ShaderMaterial | null = null;
  private balloons: Balloon[] = [];
  private flocks: Flock[] = [];
  private readonly storms: Storm[] = STORMS.map((s, i) => ({ ...s, t: 2 + i * 1.7 }));
  private flash = 0;
  private texts: FloatText[] = [];

  // Camera.
  private readonly camPos = new THREE.Vector3(0, 200, 200);
  private readonly camLook = new THREE.Vector3();
  private camSnap = true;
  private shake = 0;
  private fov = 62;
  private orbit = 0;
  private hurtFlash = 0;

  private elapsed = 0;
  private hudT = 0;
  private miniT = 0;
  private toast: Toast | null = null;
  private toastT = 0;
  private toastId = 0;
  private warn: string | null = null;
  private warnT = 0;
  private readonly col = { top: 0, bottom: 0 };
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  /** Temporary: autopilot and camera override used by the automated tests. */
  auto = false;
  debugCam: { pos: number[]; look: number[] } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.res.max = Math.min(window.devicePixelRatio || 1, this.coarse ? 1.6 : 2);
    this.res.cur = this.res.max;
    this.renderer.setPixelRatio(this.res.cur);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.setupScene();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------------

  private setupScene() {
    const { scene } = this;
    scene.fog = this.fog;
    scene.add(this.sky.mesh, this.sea.mesh, this.hemi, this.sun, this.sun.target, this.glow.points, this.smoke.points, this.updrafts.group, this.arrow, this.camera);
    this.camera.add(this.streaks.lines);
    this.arrow.visible = false;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.35;
    const { sun } = this;
    sun.castShadow = true;
    const size = this.coarse ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.25;
    Object.assign(sun.shadow.camera, { left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT, near: 1, far: 900 });
    this.applyLook(0.86);
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      for (const [key, m] of models) {
        // Collision helpers inside some rocks would render as grey blocks.
        const drop: THREE.Object3D[] = [];
        m.scene.traverse((o) => {
          if (/collider/i.test(o.name)) drop.push(o);
        });
        drop.forEach((o) => o.removeFromParent());
        this.bank.unify(key, m.scene);
        const fit = key === SHIP ? { height: 7 } : { scale: 1 };
        this.protos.set(key, makeProto(m.scene, m.animations, fit, { shadows: true, receive: key !== SHIP }));
      }
      const required = [SHIP, AERO.island, ROCKS.a, ROCKS.c];
      if (!required.every((k) => this.protos.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      this.world = new World(this.protos);
      this.scene.add(this.world.group);
      this.buildShip();
      this.buildRings();
      this.buildTraffic();
      this.buildClouds();
      this.buildBeams();
      this.placeMenuShip();
      music.play(AIR_WALTZ, 0);
      this.setPhase("menu");
      if (typeof window !== "undefined") (window as unknown as { __sky?: SkyCourierGame }).__sky = this;
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private buildShip() {
    const proto = this.protos.get(SHIP)!;
    const visual = proto.object;
    visual.position.y = -BOT;
    visual.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      const swap = (m: THREE.Material) => {
        if (!/glow/i.test(m.name)) return m;
        const c = (m as THREE.MeshStandardMaterial).clone();
        this.glowMats.push(c);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    this.shipRoot.add(visual);
    // A wooden pusher propeller (windmill sails) at the stern.
    const prop = this.protos.get(PROP);
    if (prop) {
      const s = 3.6 / prop.size.y;
      const holder = new THREE.Group();
      holder.position.set(0, -0.3, -proto.size.z / 2 - 0.15);
      holder.rotation.y = Math.PI / 2;
      const blades = prop.object.clone();
      blades.scale.setScalar(s);
      blades.position.y = (-prop.size.y * s) / 2;
      this.propSpin.add(blades);
      holder.add(this.propSpin);
      this.shipRoot.add(holder);
    }
    const box = this.protos.get(PARCEL);
    if (box) {
      this.parcel = box.object.clone();
      this.parcel.scale.setScalar(1.5);
      this.parcel.position.set(0, -BOT + 0.55, 0);
      this.parcel.visible = false;
      this.shipRoot.add(this.parcel);
      for (let i = 0; i < 2; i++) {
        const m = box.object.clone();
        m.scale.setScalar(3.2);
        m.visible = false;
        this.scene.add(m);
        this.pickupMarkers.push(m);
      }
    }
    this.scene.add(this.shipRoot);
  }

  private buildRings() {
    const world = this.world!;
    const blue = this.protos.get(AERO.ringBlue);
    const pink = this.protos.get(AERO.ringPink) ?? blue;
    if (!blue || !pink) return;
    this.boostSet = new RingSet(blue, 80, 26 / blue.size.x, this.scene);
    this.trialSet = new RingSet(pink, 40, 30 / pink.size.x, this.scene);
    this.haloMaterial = makeHaloMaterial("#ffffff");
    const plane = new THREE.PlaneGeometry(1, 1);
    this.halos = new THREE.InstancedMesh(plane, this.haloMaterial, 120);
    this.halos.count = 120;
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 6;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 120; i++) {
      this.halos.setMatrixAt(i, zero);
      this.halos.setColorAt(i, HALO_DIM);
    }
    this.scene.add(this.halos);

    let slot = 0;
    for (const [a, b, n] of RING_LINES) {
      const A = world.islands[a];
      const B = world.islands[b];
      const dx = B.pad.x - A.pad.x;
      const dz = B.pad.z - A.pad.z;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const side = new THREE.Vector3(-dz / len, 0, dx / len);
      for (let i = 0; i < n; i++) {
        const t = 0.3 + (0.42 * i) / Math.max(1, n - 1);
        const p = new THREE.Vector3(A.pad.x + dx * t, lerp(A.hoopY, B.hoopY, t) + 14 + Math.sin(t * Math.PI) * 18, A.pad.z + dz * t);
        p.addScaledVector(side, Math.sin(t * Math.PI * 2 + a) * 14);
        this.clearSpot(p, 18);
        const ring: Ring = { pos: p, normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), yaw, r: this.boostSet.holeR, cd: 0, set: this.boostSet, slot, halo: slot };
        this.boostSet.place(slot, p, yaw);
        this.boostRings.push(ring);
        slot++;
      }
    }
    this.boostSet.count = slot;
    this.trialSet.count = 0;
  }

  /** Raises a point until a sphere of radius r around it is clear of islands. */
  private clearSpot(p: THREE.Vector3, r: number) {
    const world = this.world!;
    for (let k = 0; k < 40; k++) {
      let blocked = false;
      for (let a = 0; a < 9 && !blocked; a++) {
        const x = p.x + (a ? Math.cos(a * 0.785) * r : 0);
        const z = p.z + (a ? Math.sin(a * 0.785) * r : 0);
        if (world.column(x, z, this.col) && p.y - r < this.col.top && p.y + r > this.col.bottom) blocked = true;
      }
      if (!blocked) return;
      p.y += 6;
    }
  }

  private buildTraffic() {
    const red = this.protos.get(TRAFFIC.balloonRed);
    const yellow = this.protos.get(TRAFFIC.balloonYellow) ?? red;
    const r = rng(99);
    if (red && yellow) {
      for (let i = 0; i < 14; i++) {
        const proto = i % 2 ? yellow : red;
        const s = 13 / proto.size.y;
        const obj = proto.object.clone();
        obj.scale.setScalar(s);
        obj.visible = false;
        this.scene.add(obj);
        const b: Balloon = { obj, pos: new THREE.Vector3(), vel: new THREE.Vector3(), bob: r() * TAU, r: (proto.size.x * s) / 2 + 0.5, h: proto.size.y * s, spin: (r() - 0.5) * 0.3 };
        this.respawnBalloon(b, r, true);
        this.balloons.push(b);
      }
    }
    const crow = this.protos.get(TRAFFIC.crow);
    const tri = this.protos.get(TRAFFIC.tribird);
    for (let f = 0; f < 5; f++) {
      const isl = ISLANDS[[1, 6, 9, 11, 7][f]];
      const next = ISLANDS[[3, 2, 4, 10, 5][f]];
      const anchor = new THREE.Vector3((isl.x + next.x) / 2, Math.max(isl.y, next.y) + 30 + r() * 30, (isl.z + next.z) / 2);
      const flock: Flock = {
        anchor,
        center: anchor.clone(),
        radius: 70 + r() * 60,
        angle: r() * TAU,
        speed: 11 + r() * 4,
        dir: r() < 0.5 ? -1 : 1,
        birds: [],
        scatter: 0,
        cd: 0,
        chirp: r() * 3,
        active: false,
      };
      const useTri = f % 2 === 1 && !!tri;
      for (let i = 0; i < 6; i++) {
        let obj: THREE.Object3D | null = null;
        const wings: Bird["wings"] = [];
        if (useTri && tri) {
          obj = new THREE.Group();
          const inner = cloneSkinned(tri.object);
          inner.scale.setScalar(1.6);
          obj.add(inner);
          inner.traverse((o) => {
            if (/wing\.?001/i.test(o.name)) wings.push({ bone: o, rest: o.rotation.clone(), side: /L$/i.test(o.name) ? 1 : -1 });
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.frustumCulled = false;
              m.castShadow = true;
            }
          });
        } else if (crow) {
          obj = crow.object.clone();
          obj.scale.setScalar(0.85);
        }
        if (!obj) continue;
        obj.visible = false;
        this.scene.add(obj);
        const row = Math.ceil(i / 2);
        const off = new THREE.Vector3((i % 2 ? 1 : -1) * row * 3.2 * (i ? 1 : 0), (r() - 0.5) * 2, -row * 3.4);
        flock.birds.push({ obj, off, flap: r() * TAU, wings, crow: !useTri, scatter: new THREE.Vector3() });
      }
      this.flocks.push(flock);
    }
  }

  private respawnBalloon(b: Balloon, r: () => number, first = false) {
    const world = this.world!;
    const pool = ISLANDS.filter((i) => i.region <= Math.max(1, this.region));
    for (let tries = 0; tries < 30; tries++) {
      const A = pool[Math.floor(r() * pool.length)];
      const B = pool[Math.floor(r() * pool.length)];
      if (A === B) continue;
      const t = 0.25 + r() * 0.5;
      b.pos.set(lerp(A.x, B.x, t) + (r() - 0.5) * 120, lerp(A.y, B.y, t) + (r() - 0.3) * 50, lerp(A.z, B.z, t) + (r() - 0.5) * 120);
      if (!first) {
        // Drift in from upwind.
        b.pos.addScaledVector(WIND, -60 * (0.5 + r()));
      }
      this.v1.copy(b.pos);
      this.clearSpot(this.v1, b.r + 8);
      if (this.v1.y !== b.pos.y) continue;
      if (world.column(b.pos.x, b.pos.z, this.col) && Math.abs(b.pos.y - this.col.top) < 30) continue;
      break;
    }
    b.vel.copy(WIND).normalize().multiplyScalar(1.5 + r() * 2);
  }

  private buildClouds() {
    const r = rng(4242);
    const specs: PuffSpec[] = [];
    // A low bank over the sea of clouds.
    for (let i = 0; i < 150; i++) {
      const a = r() * TAU;
      const d = 150 + Math.sqrt(r()) * 1500;
      const w = 80 + r() * 110;
      specs.push({ x: Math.cos(a) * d, y: 8 + r() * 26, z: Math.sin(a) * d, w, h: w * (0.42 + r() * 0.15), storm: 0, alpha: 0.75 + r() * 0.2 });
    }
    // Drifting mid-level clouds between the islands.
    const world = this.world!;
    for (let i = 0, tries = 0; i < 46 && tries < 400; tries++) {
      const a = r() * TAU;
      const d = 120 + Math.sqrt(r()) * 1150;
      const w = 45 + r() * 60;
      const p = new THREE.Vector3(Math.cos(a) * d, 60 + r() * 200, Math.sin(a) * d);
      let blocked = false;
      for (const isl of world.islands) if (Math.hypot(isl.x - p.x, isl.z - p.z) < isl.radius + w * 0.7 && p.y > isl.minY - 30 && p.y < isl.maxY + 40) blocked = true;
      if (blocked) continue;
      specs.push({ x: p.x, y: p.y, z: p.z, w, h: w * 0.5, storm: 0, alpha: 0.55 + r() * 0.25 });
      i++;
    }
    // Storm walls.
    for (const s of STORMS) {
      for (let i = 0; i < 30; i++) {
        const a = r() * TAU;
        const d = s.r * (0.55 + r() * 0.5);
        const w = 70 + r() * 70;
        specs.push({ x: s.x + Math.cos(a) * d, y: s.y + (r() - 0.4) * 90, z: s.z + Math.sin(a) * d, w, h: w * 0.6, storm: 1, alpha: 0.8 + r() * 0.15 });
      }
    }
    this.puffs = new CloudPuffs(specs);
    this.scene.add(this.puffs.mesh);
  }

  private buildBeams() {
    const world = this.world!;
    this.beams = world.islands.map((isl) => {
      if (!isl.def) return null;
      const beam = new Beam("#ffcf5a", ZONE_R, ZONE_H);
      beam.mesh.position.copy(isl.pad);
      beam.mesh.visible = false;
      this.scene.add(beam.mesh);
      return beam;
    });
  }

  private placeMenuShip() {
    const hub = this.world!.islands[0];
    const a = Math.atan2(hub.pad.x - hub.x, hub.pad.z - hub.z) + 0.5;
    this.menuSpot.set(hub.x + Math.sin(a) * (hub.radius + 34), hub.top + 26, hub.z + Math.cos(a) * (hub.radius + 34));
    this.menuYaw = a + Math.PI / 2;
    this.pos.copy(this.menuSpot);
    this.yaw = this.menuYaw;
    this.speed = 0;
    this.vs = 0;
    this.camSnap = true;
  }

  // --- Public API -------------------------------------------------------------------------------------

  get currentPhase() {
    return this.phase;
  }

  startShift(region: number, up: Upgrades) {
    if (!this.world) return;
    audio.unlock();
    this.mode = "shift";
    this.region = clamp(region, 0, REGIONS.length - 1);
    this.up = { ...up };
    this.resetFlight();
    this.clock = 0;
    this.coins = 0;
    this.delivered = 0;
    this.onTime = 0;
    this.late = 0;
    this.chain = 0;
    this.bestChain = 0;
    this.ringsHit = 0;
    this.carry = null;
    this.toast = null;
    this.texts = [];
    if (this.trialSet) this.trialSet.count = 0;
    for (const r of this.boostRings) r.cd = 0;
    this.activateTraffic();
    // Start just off Courier Central, facing its pad.
    const hub = this.world.islands[0];
    const out = Math.atan2(hub.pad.x - hub.x, hub.pad.z - hub.z);
    this.pos.set(hub.pad.x + Math.sin(out) * 80, hub.hoopY + 8, hub.pad.z + Math.cos(out) * 80);
    this.yaw = out + Math.PI;
    this.speed = 14;
    this.offers = [];
    this.refreshOffers(0);
    this.camSnap = true;
    this.showToast({ title: "Shift started", lines: [`${REGIONS[this.region].name} route`, "Fly into a gold beam to load a parcel"], tone: "info" });
    music.play(AIR_WALTZ, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setPhase("playing");
  }

  startTrial(course: number, up: Upgrades) {
    if (!this.world) return;
    audio.unlock();
    this.mode = "trial";
    this.course = clamp(course, 0, COURSES.length - 1);
    this.region = COURSES[this.course].region;
    this.up = { ...up };
    this.resetFlight();
    this.carry = null;
    this.offers = [];
    this.toast = null;
    this.texts = [];
    this.activateTraffic(true);
    this.buildCourse();
    const first = this.trialRings[0];
    this.pos.copy(first.pos).addScaledVector(first.normal, -110);
    this.pos.y = first.pos.y;
    this.clearSpot(this.pos, 8);
    this.yaw = first.yaw;
    this.speed = 0;
    this.trialNext = 0;
    this.trialTime = 0;
    this.countdown = 3.2;
    this.lastCount = 4;
    this.camSnap = true;
    music.play(AIR_WALTZ, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setPhase("playing");
  }

  pause() {
    if (this.phase !== "playing") return;
    this.releaseInput();
    music.duck(true);
    this.sfx.silence();
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    if (!this.world) return;
    this.releaseInput();
    this.carry = null;
    this.offers = [];
    if (this.trialSet) this.trialSet.count = 0;
    this.region = 0;
    this.activateTraffic();
    this.placeMenuShip();
    this.arrow.visible = false;
    this.hideBeams();
    if (this.parcel) this.parcel.visible = false;
    music.play(AIR_WALTZ, 0);
    music.setIntensity(0);
    music.duck(false);
    this.setPhase("menu");
  }

  setMenuView(view: MenuView) {
    this.menuView = view;
  }

  setKey(key: KeyName, down: boolean) {
    this.keys[key] = down;
  }

  setStick(x: number, y: number) {
    this.stickX = clamp(x, -1, 1);
    this.stickY = clamp(y, -1, 1);
  }

  setThrottle(v: number | null) {
    this.touchThrottle = v === null ? null : clamp(v, 0, 1);
    if (v !== null) this.throttle = clamp(v, 0, 1);
  }

  setBoost(on: boolean) {
    this.touchBoost = on;
  }

  /** E: pick up or drop a parcel when close to a beam. */
  action() {
    if (this.phase !== "playing" || this.mode !== "shift") return;
    const world = this.world!;
    if (this.carry) {
      if (this.inZone(world.islands[this.carry.to], true)) this.deliver();
    } else {
      const offer = this.offers.find((o) => this.inZone(world.islands[o.from], true));
      if (offer) this.pickup(offer);
    }
  }

  releaseInput() {
    for (const k of Object.keys(this.keys) as KeyName[]) this.keys[k] = false;
    this.stickX = this.stickY = 0;
    this.touchBoost = false;
  }

  setOverlay(canvas: HTMLCanvasElement | null) {
    this.overlay = canvas?.getContext("2d") ?? null;
    this.resize();
  }

  setMinimap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas;
    this.miniT = 0;
  }

  setFont(family: string) {
    if (family.trim()) this.font = `${family.trim()}, ui-sans-serif, system-ui, sans-serif`;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    if (typeof window !== "undefined") delete (window as unknown as { __sky?: SkyCourierGame }).__sky;
    this.world?.dispose();
    this.boostSet?.dispose();
    this.trialSet?.dispose();
    this.halos?.geometry.dispose();
    this.haloMaterial?.dispose();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    for (const m of this.glowMats) m.dispose();
    for (const b of this.beams) b?.dispose();
    this.envTexture?.dispose();
    this.sky.dispose();
    this.sea.dispose();
    this.puffs?.dispose();
    this.glow.dispose();
    this.smoke.dispose();
    this.streaks.dispose();
    this.updrafts.dispose();
    this.arrow.geometry.dispose();
    (this.arrow.material as THREE.Material).dispose();
    // The canvas (and its GL context) can be reused by the next mount: leave it in default state.
    this.renderer.resetState();
    this.renderer.dispose();
  }

  // --- State ------------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    this.emitHud();
  }

  private get boostCap() {
    return 1 + 0.25 * this.up.tank;
  }

  private get maxHull() {
    return 100 + 25 * this.up.hull;
  }

  private get maxSpeed() {
    return BASE_SPEED + 4 * this.up.engine;
  }

  private resetFlight() {
    this.releaseInput();
    this.hull = this.maxHull;
    this.boost = this.boostCap * 0.5;
    this.throttle = 0.6;
    this.touchThrottle = null;
    this.boosting = false;
    this.yawRate = 0;
    this.vs = 0;
    this.knock.set(0, 0, 0);
    this.roll = this.pitch = 0;
    this.bumpCd = 0;
    this.birdSlow = 0;
    this.flash = 0;
    this.hurtFlash = 0;
    this.warn = null;
    this.glow.clear();
    this.smoke.clear();
    if (this.parcel) this.parcel.visible = false;
  }

  private activateTraffic(trial = false) {
    const reg = REGIONS[this.region];
    const nB = trial ? 4 : this.phase === "loading" ? 6 : reg.balloons;
    this.balloons.forEach((b, i) => (b.obj.visible = i < nB));
    this.flocks.forEach((f, i) => {
      f.active = i < (trial ? 2 : reg.flocks);
      for (const b of f.birds) b.obj.visible = f.active;
    });
  }

  // --- Frame ------------------------------------------------------------------------------------------

  private readonly frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(now);
    const real = Math.min(0.25, this.timer.getDelta());
    const dt = Math.min(1 / 20, real);
    if (!this.world) return;
    this.elapsed += dt;
    if (this.phase === "playing") this.updatePlay(dt);
    else if (this.phase === "menu" || this.phase === "results") this.updateIdle(dt);
    if (this.phase !== "paused") this.updateAmbient(dt);
    this.updateShip(dt);
    this.updateLighting(dt);
    this.updateCamera(dt);
    this.drawOverlay(dt);
    this.miniT -= dt;
    if (this.miniT <= 0 && this.minimap) {
      this.miniT = 1 / 15;
      this.drawMinimap();
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.emitHud();
    }
    this.renderer.render(this.scene, this.camera);
    this.adaptResolution(real);
  };

  private updateIdle(dt: number) {
    // Hover in place with a lazy drift.
    this.speed = damp(this.speed, 0, 1.2, dt);
    this.vs = damp(this.vs, Math.sin(this.elapsed * 0.7) * 0.6, 2, dt);
    this.yawRate = damp(this.yawRate, this.phase === "menu" ? 0.02 : 0.05, 1, dt);
    this.yaw += this.yawRate * dt;
    this.prev.copy(this.pos);
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    this.pos.y += this.vs * dt;
    if (this.phase === "menu") {
      this.pos.lerp(this.menuSpot, 1 - Math.exp(-0.5 * dt));
      this.throttle = 0.3;
    } else {
      this.collide(dt);
    }
    this.boosting = false;
    this.sfx.flight(0.25, 0, false, true);
  }

  private updatePlay(dt: number) {
    // Trial countdown: hold still, then go.
    if (this.mode === "trial" && this.countdown > 0) {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c !== this.lastCount) {
        this.lastCount = c;
        this.sfx.countdown(c <= 0);
        if (c <= 0) {
          this.speed = this.maxSpeed * 0.75;
          this.showToast({ title: "Go!", lines: [COURSES[this.course].name], tone: "gold" });
        }
      }
      if (this.countdown > 0) {
        this.vs = damp(this.vs, Math.sin(this.elapsed * 2) * 0.4, 3, dt);
        this.pos.y += this.vs * dt;
        this.prev.copy(this.pos);
        this.sfx.flight(this.throttle, 0, false, true);
        return;
      }
    }

    // Input.
    let steer = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) + this.stickX;
    let climb = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0) + this.stickY;
    let wantBoost = this.keys.boost || this.touchBoost;
    if (this.keys.thrUp) this.throttle = clamp(this.throttle + dt * (0.6 + this.up.engine * 0.08), 0, 1);
    if (this.keys.thrDown) this.throttle = clamp(this.throttle - dt * 0.75, 0, 1);
    if (this.auto) {
      const a = this.autopilot();
      steer = a.steer;
      climb = a.climb;
      wantBoost = a.boost;
      this.throttle = 1;
    }
    steer = clamp(steer, -1, 1);
    climb = clamp(climb, -1, 1);

    // Boost.
    if (wantBoost && this.boost > 0.02) {
      if (!this.boosting) this.sfx.boost();
      this.boosting = true;
      this.boost = Math.max(0, this.boost - dt * 0.3);
    } else this.boosting = false;
    this.boost = Math.min(this.boostCap, this.boost + dt * (0.012 + 0.006 * this.up.tank));

    // Speed.
    const max = this.maxSpeed;
    let target = MIN_SPEED + this.throttle * (max - MIN_SPEED);
    if (this.boosting) target = Math.max(target, max) * 1.55;
    if (this.birdSlow > 0) {
      this.birdSlow -= dt;
      target *= 0.55;
    }
    const inCloud = smooth(10, -4, this.pos.y);
    target *= 1 - inCloud * 0.35;
    const rate = this.boosting ? 2.4 : target > this.speed ? 0.7 + 0.08 * this.up.engine : 1.2;
    this.speed = damp(this.speed, target, rate, dt);

    // Steering and climbing.
    const sp = clamp(this.speed / 50, 0, 1);
    const turn = lerp(1.3, 0.92, sp);
    this.yawRate = damp(this.yawRate, -steer * turn, 4.5, dt);
    let targetV = climb * CLIMB;
    // Updrafts.
    let lift = 0;
    for (const u of UPDRAFTS) {
      const d = Math.hypot(this.pos.x - u.x, this.pos.z - u.z);
      if (d < u.r + 4) lift = Math.max(lift, 1 - smooth(u.r - 4, u.r + 4, d));
    }
    if (lift > 0 && !this.inUpdraft) {
      this.sfx.updraft();
      if (this.mode === "shift" && this.delivered + this.onTime < 2) this.floatText("Updraft!", "#fff3c4", false);
    }
    this.inUpdraft = lift > 0.3;
    targetV += lift * 20;
    // Turbulence: a little everywhere, a lot in storms.
    this.inStorm = 0;
    for (const s of this.storms) {
      const d = Math.hypot(this.pos.x - s.x, this.pos.z - s.z);
      const k = (1 - smooth(s.r * 0.6, s.r, d)) * (1 - smooth(55, 90, Math.abs(this.pos.y - s.y)));
      this.inStorm = Math.max(this.inStorm, k);
    }
    const amp = 0.8 + this.inStorm * 9;
    this.turbV = damp(this.turbV, (Math.random() * 2 - 1) * amp, 2.5, dt);
    this.turbYaw = damp(this.turbYaw, (Math.random() * 2 - 1) * (0.04 + this.inStorm * 0.5), 2, dt);
    if (this.inStorm > 0.3) this.shake = Math.max(this.shake, this.inStorm * 0.35);
    this.vs = damp(this.vs, targetV, lift > 0 ? 3.5 : 2.6, dt) + this.turbV * dt * 3;
    this.yaw += (this.yawRate + this.turbYaw) * dt;

    // Move.
    this.prev.copy(this.pos);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.pos.x += (fx * this.speed + this.knock.x + WIND.x * 0.6) * dt;
    this.pos.z += (fz * this.speed + this.knock.z + WIND.z * 0.6) * dt;
    this.pos.y += (this.vs + this.knock.y) * dt;
    this.knock.multiplyScalar(Math.exp(-2.6 * dt));

    // Limits: the cloud sea, the thin air, the edge of the map.
    this.warn = null;
    if (this.pos.y < 12) {
      this.vs += (12 - this.pos.y) * 1.8 * dt;
      if (this.pos.y < -25) this.pos.y = -25;
      this.warn = "In the cloud sea — climb!";
    }
    if (this.pos.y > CEILING) {
      this.pos.y = CEILING;
      this.vs = Math.min(this.vs, 0);
      this.warn = "Air too thin — descend";
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD_RADIUS) {
      const back = Math.atan2(-this.pos.x, -this.pos.z);
      this.yaw += clamp(wrap(back - this.yaw), -1, 1) * dt * 0.9;
      if (r > WORLD_RADIUS + 120) {
        this.pos.x *= (WORLD_RADIUS + 120) / r;
        this.pos.z *= (WORLD_RADIUS + 120) / r;
      }
      this.warn = "Open sky ahead — turn back";
    }
    if (this.inStorm > 0.4 && !this.warn) this.warn = "Storm! Hold on";

    this.collide(dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);

    // Rings.
    this.checkRings(dt);
    // Traffic.
    this.hitBalloons();
    this.hitBirds();

    if (this.mode === "shift") this.updateShift(dt);
    else this.updateTrial(dt);

    // Sound and music.
    this.sfx.flight(this.throttle, this.speed, this.boosting, true);
    const urgent = (this.carry && this.carry.left < 10) || this.inStorm > 0.4 || (this.mode === "shift" && SHIFT_SECONDS - this.clock < 20);
    music.setIntensity(urgent ? 2 : 1);

    // Trail and streaks.
    if (this.boosting || this.speed > max * 0.95) {
      const back = this.v1.set(-fx, 0, -fz);
      const n = this.boosting ? 3 : 1;
      for (let i = 0; i < n; i++) {
        this.glow.spawn(
          this.pos.x + back.x * 3.2 + (Math.random() - 0.5) * 1.2,
          this.pos.y - 0.3 + (Math.random() - 0.5) * 1.2,
          this.pos.z + back.z * 3.2 + (Math.random() - 0.5) * 1.2,
          back.x * 8,
          (Math.random() - 0.5) * 2,
          back.z * 8,
          { color: this.boosting ? "#8fd3ff" : "#ffffff", life: 0.6, size: this.boosting ? 1.6 : 0.8, grow: 0.2, alpha: 0.8, drag: 1 },
        );
      }
    }
  }

  /** Temporary test autopilot: steer to the current target, climb over what's ahead. */
  private autopilot() {
    const t = this.target();
    if (!t) return { steer: 0, climb: 0, boost: false };
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const want = Math.atan2(dx, dz);
    const err = wrap(want - this.yaw);
    let ty = t.pos.y + (t.kind === "ring" ? 0 : 6);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (const d of [20, 40, 70]) {
      if (this.world!.column(this.pos.x + fx * d, this.pos.z + fz * d, this.col) && this.col.top > this.pos.y - BOT - 6 && this.col.bottom < this.pos.y + TOP + 4) ty = Math.max(ty, this.col.top + BOT + 10);
    }
    const dist = Math.hypot(dx, dz);
    return { steer: clamp(-err * 2.5, -1, 1), climb: clamp((ty - this.pos.y) / 12, -1, 1), boost: dist > 220 && Math.abs(err) < 0.3 };
  }

  private updateShip(dt: number) {
    // Visual attitude: bank into turns, pitch with the climb.
    const targetRoll = clamp(-this.yawRate * 0.42, -0.5, 0.5) + Math.sin(this.elapsed * 1.3) * 0.02;
    const targetPitch = clamp(-this.vs * 0.022, -0.32, 0.32) + Math.sin(this.elapsed * 0.9) * 0.015;
    this.roll = damp(this.roll, targetRoll, 3, dt);
    this.pitch = damp(this.pitch, targetPitch, 3, dt);
    this.shipRoot.position.copy(this.pos);
    this.shipRoot.position.y += Math.sin(this.elapsed * 1.6) * 0.12;
    this.shipRoot.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");
    const spin = 3 + this.throttle * 22 + (this.boosting ? 18 : 0);
    this.propSpin.rotation.x += spin * dt;
    const glow = 0.8 + this.throttle * 0.8 + (this.boosting ? 1.6 : 0) + Math.sin(this.elapsed * 6) * 0.1;
    for (const m of this.glowMats) m.emissiveIntensity = glow;
    if (this.parcel?.visible) this.parcel.rotation.y += dt * 0.6;
  }

  // --- Collisions --------------------------------------------------------------------------------------

  /** The highest top / lowest bottom of solid columns overlapping the hull at p, or null. */
  private probe(p: THREE.Vector3) {
    const world = this.world!;
    let top = -Infinity;
    let bottom = Infinity;
    let hit = false;
    for (let i = 0; i < 7; i++) {
      const a = (i - 1) * 1.047;
      const x = p.x + (i ? Math.cos(a) * HULL_R : 0);
      const z = p.z + (i ? Math.sin(a) * HULL_R : 0);
      if (!world.column(x, z, this.col)) continue;
      if (p.y - BOT < this.col.top && p.y + TOP > this.col.bottom) {
        hit = true;
        top = Math.max(top, this.col.top);
        bottom = Math.min(bottom, this.col.bottom);
      }
    }
    return hit ? { top, bottom } : null;
  }

  private collide(dt: number) {
    const hit = this.probe(this.pos);
    if (!hit) return;
    if (this.prev.y - BOT >= hit.top - 0.8) {
      // Settling onto a roof or the grass.
      if (this.vs < -9) this.bump(Math.abs(this.vs) * 0.5, false);
      this.pos.y = hit.top + BOT;
      this.vs = Math.max(0, this.vs);
      return;
    }
    if (this.prev.y + TOP <= hit.bottom + 0.8) {
      this.pos.y = hit.bottom - TOP;
      this.vs = Math.min(-1, this.vs);
      return;
    }
    // From the side: back off and bounce.
    const impact = Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) / Math.max(dt, 1e-3);
    this.pos.x = this.prev.x;
    this.pos.z = this.prev.z;
    if (this.probe(this.pos)) this.pos.y = this.prev.y;
    if (this.probe(this.pos)) this.pos.y += 8 * dt;
    if (this.phase === "playing") {
      this.v1.set(-Math.sin(this.yaw), 0.25, -Math.cos(this.yaw));
      this.knock.copy(this.v1).multiplyScalar(5 + impact * 0.35);
      this.speed *= 0.3;
      this.bump(impact, true);
    }
  }

  private bump(impact: number, side: boolean) {
    if (this.bumpCd > 0) return;
    this.bumpCd = 0.5;
    const dmg = Math.max(0, impact - 5) * 0.85 * (1 - 0.1 * this.up.hull);
    this.sfx.bump(impact / 40);
    this.shake = Math.max(this.shake, 0.4 + impact * 0.02);
    this.smoke.burst(this.pos.x, this.pos.y - 1, this.pos.z, 12, 6, { color: "#e8e1d4", life: 1.2, size: 2.5, grow: 5, alpha: 0.6, drag: 2 });
    if (dmg <= 0.5) return;
    this.damage(dmg, side ? "Bump!" : "Hard landing");
  }

  private damage(dmg: number, label: string) {
    if (this.mode === "trial") {
      this.floatText(label, "#ffb1a1", false);
      return;
    }
    this.hull = Math.max(0, this.hull - dmg);
    this.hurtFlash = 1;
    if (this.carry) {
      this.carry.condition = Math.max(0, this.carry.condition - (dmg / 100) * (1.25 - 0.08 * this.up.hull));
      this.floatText(`${label} −${Math.round(dmg)}`, "#ffb1a1", false);
    } else this.floatText(`${label} −${Math.round(dmg)}`, "#ffb1a1", false);
    if (this.hull <= 0) this.endShift("hull");
  }

  // --- Rings, traffic, beams ---------------------------------------------------------------------------

  private crossed(r: Ring, slack: number, forwardOnly: boolean) {
    const d0 = this.v1.copy(this.prev).sub(r.pos).dot(r.normal);
    const d1 = this.v2.copy(this.pos).sub(r.pos).dot(r.normal);
    const through = forwardOnly ? d0 < 0 && d1 >= 0 : (d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0);
    if (!through) return false;
    const t = d0 / (d0 - d1);
    this.v3.copy(this.prev).lerp(this.pos, t);
    return this.v3.distanceTo(r.pos) < r.r + slack;
  }

  private checkRings(dt: number) {
    if (this.mode === "shift") {
      for (const r of this.boostRings) {
        if (r.cd > 0) {
          r.cd -= dt;
          continue;
        }
        if (Math.abs(r.pos.x - this.pos.x) > 40 || Math.abs(r.pos.z - this.pos.z) > 40) continue;
        if (this.crossed(r, 3, false)) {
          r.cd = 22;
          this.ringsHit++;
          this.boost = Math.min(this.boostCap, this.boost + 0.24);
          this.coins += 2;
          this.sfx.ring();
          this.ringBurst(r, "#8fd3ff");
          this.floatText("+boost  +2", "#bfe6ff", false);
        }
      }
    }
  }

  private ringBurst(r: Ring, color: string) {
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      const side = this.v1.set(r.normal.z, 0, -r.normal.x);
      const x = r.pos.x + side.x * Math.cos(a) * r.r;
      const y = r.pos.y + Math.sin(a) * r.r;
      const z = r.pos.z + side.z * Math.cos(a) * r.r;
      this.glow.spawn(x, y, z, side.x * Math.cos(a) * 6 + r.normal.x * 4, Math.sin(a) * 6, side.z * Math.cos(a) * 6 + r.normal.z * 4, { color, life: 0.8, size: 1.6, grow: 0.3, alpha: 1, drag: 2.5 });
    }
  }

  private hitBalloons() {
    for (const b of this.balloons) {
      if (!b.obj.visible) continue;
      const d = this.v1.copy(this.pos).sub(b.pos);
      const len = d.length();
      if (len > b.r + HULL_R + 1) continue;
      d.normalize();
      this.pos.copy(b.pos).addScaledVector(d, b.r + HULL_R + 1.05);
      this.knock.copy(d).multiplyScalar(10);
      this.speed *= 0.55;
      b.vel.addScaledVector(d, -4);
      this.sfx.balloon();
      if (this.bumpCd <= 0) {
        this.bumpCd = 0.6;
        this.shake = Math.max(this.shake, 0.35);
        this.damage(5, "Balloon!");
      }
    }
  }

  private hitBirds() {
    for (const f of this.flocks) {
      if (!f.active || f.cd > 0) continue;
      if (this.v1.copy(this.pos).sub(f.center).lengthSq() > 30 * 30) continue;
      for (const b of f.birds) {
        if (b.obj.position.distanceToSquared(this.pos) < 4.2 * 4.2) {
          f.cd = 4;
          f.scatter = 3;
          for (const bb of f.birds) bb.scatter.set((Math.random() - 0.5) * 30, 8 + Math.random() * 12, (Math.random() - 0.5) * 30);
          this.birdSlow = 1.6;
          this.speed *= 0.6;
          this.sfx.birds();
          this.smoke.burst(this.pos.x, this.pos.y + 1, this.pos.z, 18, 7, { color: f.birds[0].crow ? "#2b2b33" : "#ff6f91", life: 1.4, size: 0.8, grow: 0.6, alpha: 0.9, gravity: 2, drag: 1.5 });
          this.floatText("Birds! Slowed", "#ffe2a8", false);
          if (this.carry) this.carry.condition = Math.max(0, this.carry.condition - 0.03);
          break;
        }
      }
    }
  }

  private inZone(isl: Island, generous = false) {
    const dx = this.pos.x - isl.pad.x;
    const dz = this.pos.z - isl.pad.z;
    const r = ZONE_R + (generous ? 14 : 0);
    if (dx * dx + dz * dz > r * r) return false;
    const y = this.pos.y - BOT;
    return y > isl.pad.y - (generous ? 10 : 3) && y < isl.pad.y + ZONE_H + (generous ? 20 : 0);
  }

  // --- Shift ------------------------------------------------------------------------------------------

  private updateShift(dt: number) {
    const world = this.world!;
    this.clock += dt;
    if (this.carry) {
      const c = this.carry;
      c.left -= dt;
      if (c.left > 0 && c.left < 10) {
        const s = Math.ceil(c.left);
        if (s !== this.lastTick) {
          this.lastTick = s;
          this.sfx.tick(s <= 5);
        }
      }
      if (c.left <= 0 && !c.lateShown) {
        c.lateShown = true;
        this.sfx.late();
        this.showToast({ title: "Running late", lines: ["Still deliver it — late parcels pay less"], tone: "bad" });
      }
      if (this.inZone(world.islands[c.to])) this.deliver();
    } else {
      for (const o of this.offers) {
        if (this.inZone(world.islands[o.from])) {
          this.pickup(o);
          break;
        }
      }
    }
    if (this.clock >= SHIFT_SECONDS) this.endShift("time");
  }

  private makeOffer(from: number, exclude: number[]): Offer | null {
    const region = REGIONS[this.region];
    const pool = ISLANDS.filter((i) => i.region <= this.region && i.id !== from && !exclude.includes(i.id));
    const A = ISLANDS[from];
    const weighted: { id: number; w: number }[] = [];
    for (const i of pool) {
      const d = Math.hypot(i.x - A.x, i.z - A.z);
      if (d < 200) continue;
      let w = 1;
      if (this.region > 0 && i.region === this.region) w *= 2.5;
      if (d > 1100) w *= 0.4;
      weighted.push({ id: i.id, w });
    }
    if (!weighted.length) return null;
    let total = 0;
    for (const c of weighted) total += c.w;
    let pick = Math.random() * total;
    let to = weighted[0].id;
    for (const c of weighted) {
      pick -= c.w;
      if (pick <= 0) {
        to = c.id;
        break;
      }
    }
    const isA = this.world!.islands[from];
    const isB = this.world!.islands[to];
    const dist = Math.hypot(isB.pad.x - isA.pad.x, isB.pad.z - isA.pad.z);
    const climb = Math.max(0, isB.pad.y - isA.pad.y);
    const express = Math.random() < 0.22 && dist > 320;
    let time = dist / region.pace + 9 + climb / 7;
    if (express) time *= 0.78;
    const pay = Math.round((22 + dist * 0.085 + climb * 0.12) * region.pay * (express ? 1.5 : 1));
    return { from, to, dist, pay, time: Math.ceil(time), express };
  }

  /** Two jobs on the board: one from where you are, one from somewhere nearby. */
  private refreshOffers(at: number | null) {
    const world = this.world!;
    const pool = ISLANDS.filter((i) => i.region <= this.region).map((i) => i.id);
    let first = at;
    if (first === null || !pool.includes(first)) {
      let best = Infinity;
      for (const id of pool) {
        const d = Math.hypot(world.islands[id].x - this.pos.x, world.islands[id].z - this.pos.z);
        if (d < best) {
          best = d;
          first = id;
        }
      }
    }
    const offers: Offer[] = [];
    const a = this.makeOffer(first!, []);
    if (a) offers.push(a);
    const others = pool
      .filter((id) => id !== first && id !== a?.to)
      .sort((x, y) => Math.hypot(world.islands[x].x - this.pos.x, world.islands[x].z - this.pos.z) - Math.hypot(world.islands[y].x - this.pos.x, world.islands[y].z - this.pos.z))
      .slice(0, 3);
    if (others.length) {
      const b = this.makeOffer(others[Math.floor(Math.random() * others.length)], []);
      if (b) offers.push(b);
    }
    this.offers = offers;
  }

  private pickup(o: Offer) {
    const world = this.world!;
    this.carry = { ...o, left: o.time, condition: 1, lateShown: false };
    this.offers = [];
    if (this.parcel) this.parcel.visible = true;
    this.sfx.pickup();
    const isl = world.islands[o.from];
    this.glow.burst(isl.pad.x, isl.pad.y + 6, isl.pad.z, 30, 10, { color: "#ffd56a", life: 1, size: 1.6, grow: 0.4, alpha: 1, drag: 2 });
    this.showToast({
      title: o.express ? "Express parcel!" : "Parcel loaded",
      lines: [`To ${world.islands[o.to].name}`, `${Math.round(o.dist)} m · ${o.time} s · ${o.pay} coins`],
      tone: o.express ? "gold" : "info",
    });
    this.lastTick = 0;
  }

  private deliver() {
    const world = this.world!;
    const c = this.carry;
    if (!c) return;
    const onTime = c.left >= 0;
    const timeK = onTime ? 0.75 + 0.5 * clamp(c.left / c.time, 0, 1) : 0.4;
    const condK = 0.45 + 0.55 * c.condition;
    const chainK = onTime ? 1 + 0.1 * Math.min(10, this.chain) : 1;
    const earned = Math.max(1, Math.round(c.pay * timeK * condK * chainK));
    this.coins += earned;
    this.delivered++;
    if (onTime) {
      this.onTime++;
      this.chain++;
      this.bestChain = Math.max(this.bestChain, this.chain);
    } else {
      this.late++;
      this.chain = 0;
    }
    this.carry = null;
    if (this.parcel) this.parcel.visible = false;
    this.sfx.deliver(onTime && timeK > 1);
    const isl = world.islands[c.to];
    this.glow.burst(isl.pad.x, isl.pad.y + 8, isl.pad.z, 50, 14, { color: "#8fd3ff", life: 1.2, size: 1.8, grow: 0.4, alpha: 1, drag: 1.8 });
    this.glow.burst(isl.pad.x, isl.pad.y + 8, isl.pad.z, 30, 10, { color: "#ffd56a", life: 1.4, size: 1.4, grow: 0.3, alpha: 1, drag: 1.4, gravity: 3 });
    this.floatText(`+${earned}`, "#ffd56a", true);
    const lines = [`+${earned} coins`, onTime ? `${Math.ceil(c.left)} s early · tip ×${timeK.toFixed(2)}` : "Late · tip ×0.40", `Parcel ${Math.round(c.condition * 100)}%`];
    if (onTime && this.chain > 1) lines.push(`Chain ${this.chain} · ×${chainK.toFixed(1)}`);
    this.showToast({ title: onTime ? `Delivered to ${isl.name}` : "Delivered late", lines, tone: onTime ? "good" : "bad" });
    this.refreshOffers(c.to);
  }

  private endShift(reason: "time" | "hull") {
    if (this.phase !== "playing") return;
    this.releaseInput();
    this.carry = null;
    this.offers = [];
    this.hideBeams();
    this.arrow.visible = false;
    if (this.parcel) this.parcel.visible = false;
    this.boosting = false;
    music.setIntensity(0);
    if (reason === "hull") this.sfx.bump(1);
    else this.sfx.medal(1);
    this.setPhase("results");
    this.events.result({ kind: "shift", region: this.region, earned: this.coins, delivered: this.delivered, onTime: this.onTime, late: this.late, bestChain: this.bestChain, rings: this.ringsHit, reason });
  }

  // --- Trial ------------------------------------------------------------------------------------------

  private buildCourse() {
    const set = this.trialSet;
    if (!set) return;
    const def = COURSES[this.course];
    const curve = new THREE.CatmullRomCurve3(
      def.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true,
      "centripetal",
    );
    const n = Math.max(6, Math.round(curve.getLength() / def.spacing));
    this.trialRings = [];
    for (let i = 0; i < n; i++) {
      const p = curve.getPointAt(i / n);
      const t = curve.getTangentAt(i / n);
      const yaw = Math.atan2(t.x, t.z);
      this.clearSpot(p, 20);
      set.place(i, p, yaw);
      this.trialRings.push({ pos: p, normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), yaw, r: set.holeR, cd: 0, set, slot: i, halo: 80 + i });
    }
    set.count = n;
  }

  private updateTrial(dt: number) {
    if (this.countdown > 0) return;
    this.trialTime += dt;
    const n = this.trialRings.length;
    const ring = this.trialRings[this.trialNext % n];
    if (ring && this.crossed(ring, 4, true)) {
      this.trialNext++;
      const finish = this.trialNext >= n + 1;
      this.sfx.ring(finish);
      this.ringBurst(ring, finish ? "#ffd56a" : "#ffb4e1");
      this.boost = Math.min(this.boostCap, this.boost + 0.3);
      if (finish) this.finishTrial(true);
    }
    const def = COURSES[this.course];
    if (this.trialTime > def.medals[2] * 2.2) this.finishTrial(false);
  }

  private finishTrial(done: boolean) {
    if (this.phase !== "playing") return;
    const def = COURSES[this.course];
    const time = done ? this.trialTime : 0;
    const medal = !done ? 0 : time <= def.medals[0] ? 3 : time <= def.medals[1] ? 2 : time <= def.medals[2] ? 1 : 0;
    this.releaseInput();
    this.boosting = false;
    this.sfx.medal(medal);
    music.setIntensity(0);
    this.setPhase("results");
    this.events.result({ kind: "trial", course: this.course, time, medal });
  }

  // --- Ambient world -------------------------------------------------------------------------------------

  private updateAmbient(dt: number) {
    const world = this.world!;
    world.update(dt);
    this.updrafts.update(dt);
    for (const b of this.beams) b?.update(dt);
    if (this.haloMaterial) this.haloMaterial.uniforms.uTime.value += dt;
    this.updateBalloons(dt);
    this.updateFlocks(dt);
    this.updateStorms(dt);
    this.updateBeams();
    this.updateHalos();
    // Motes rising in nearby updrafts.
    for (const u of UPDRAFTS) {
      if (Math.abs(u.x - this.pos.x) > 260 || Math.abs(u.z - this.pos.z) > 260) continue;
      if (Math.random() < dt * 22) {
        const a = Math.random() * TAU;
        const rr = Math.sqrt(Math.random()) * u.r;
        this.glow.spawn(u.x + Math.cos(a) * rr, clamp(this.pos.y + (Math.random() - 0.5) * 120, 10, CEILING), u.z + Math.sin(a) * rr, 0, 16 + Math.random() * 8, 0, {
          color: "#fff1c9",
          life: 2.4,
          size: 0.9,
          grow: 0.5,
          alpha: 0.7,
        });
      }
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    this.texts = this.texts.filter((t) => (t.age += dt) < t.life);
    if (this.toast) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast = null;
    }
  }

  private updateBalloons(dt: number) {
    const world = this.world!;
    const r = Math.random;
    for (const b of this.balloons) {
      if (!b.obj.visible) continue;
      b.bob += dt;
      b.pos.addScaledVector(b.vel, dt);
      b.vel.lerp(this.v1.copy(WIND).normalize().multiplyScalar(2.2), 1 - Math.exp(-0.2 * dt));
      // Keep clear of islands: bob upward if drifting into one.
      if (world.column(b.pos.x, b.pos.z, this.col) && b.pos.y + b.h > this.col.bottom - 4 && b.pos.y - b.h < this.col.top + 4) b.pos.y += 6 * dt;
      if (Math.hypot(b.pos.x, b.pos.z) > WORLD_RADIUS + 150) this.respawnBalloon(b, r);
      b.obj.position.set(b.pos.x, b.pos.y - b.h / 2 + Math.sin(b.bob * 0.8) * 1.2, b.pos.z);
      b.obj.rotation.y += b.spin * dt;
    }
  }

  private updateFlocks(dt: number) {
    for (const f of this.flocks) {
      if (!f.active) continue;
      f.cd = Math.max(0, f.cd - dt);
      f.scatter = Math.max(0, f.scatter - dt);
      f.angle += ((f.speed / f.radius) * f.dir) * dt;
      f.center.set(f.anchor.x + Math.cos(f.angle) * f.radius, f.anchor.y + Math.sin(f.angle * 2.3) * 8, f.anchor.z + Math.sin(f.angle) * f.radius);
      // Heading: the tangent of the circle.
      const hx = -Math.sin(f.angle) * f.dir;
      const hz = Math.cos(f.angle) * f.dir;
      const heading = Math.atan2(hx, hz);
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      const k = f.scatter > 0 ? smooth(0, 3, f.scatter) : 0;
      for (const b of f.birds) {
        b.flap += dt * (b.crow ? 9 : 11);
        const ox = b.off.x * c + b.off.z * s;
        const oz = -b.off.x * s + b.off.z * c;
        b.obj.position.set(f.center.x + ox + b.scatter.x * k, f.center.y + b.off.y + Math.sin(b.flap * 0.3) * 0.6 + b.scatter.y * k, f.center.z + oz + b.scatter.z * k);
        b.obj.rotation.set(0, heading, -f.dir * 0.25);
        if (b.crow) b.obj.scale.set(0.85, 0.85 * (1 + Math.sin(b.flap) * 0.35), 0.85);
        else for (const w of b.wings) w.bone.rotation.set(w.rest.x, w.rest.y, w.rest.z + Math.sin(b.flap) * 0.7 * w.side);
      }
      f.chirp -= dt;
      if (f.chirp <= 0) {
        f.chirp = 2 + Math.random() * 3;
        const d = f.center.distanceTo(this.pos);
        if (this.phase === "playing") this.sfx.chirp(1 - smooth(30, 160, d));
      }
    }
  }

  private updateStorms(dt: number) {
    this.flash = Math.max(0, this.flash - dt * 3.5);
    for (const s of this.storms) {
      s.t -= dt;
      if (s.t > 0) continue;
      s.t = 2.5 + Math.random() * 5.5;
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      if (d > 1100) continue;
      const near = 1 - smooth(s.r * 0.6, 1100, d);
      this.flash = Math.max(this.flash, 0.25 + near * 0.75);
      if (this.phase === "playing") {
        this.sfx.thunder(near, Math.min(2.2, d / 340));
        if (this.inStorm > 0.5 && Math.random() < 0.35) {
          this.sfx.zap();
          this.glow.burst(this.pos.x, this.pos.y + 2, this.pos.z, 30, 16, { color: "#d8ecff", life: 0.5, size: 1.2, alpha: 1, drag: 3 });
          this.shake = Math.max(this.shake, 0.8);
          this.damage(6, "Lightning");
        }
      }
    }
  }

  private hideBeams() {
    for (const b of this.beams) if (b) b.mesh.visible = false;
    for (const m of this.pickupMarkers) m.visible = false;
  }

  private updateBeams() {
    const world = this.world!;
    this.hideBeams();
    if (this.phase !== "playing" && this.phase !== "paused") return;
    if (this.mode !== "shift") return;
    if (this.carry) {
      const b = this.beams[this.carry.to];
      if (b) {
        b.mesh.visible = true;
        b.uniforms.uColor.value.set("#7cc4ff");
        b.uniforms.uAlpha.value = 1.1;
      }
    } else {
      this.offers.forEach((o, i) => {
        const b = this.beams[o.from];
        if (b) {
          b.mesh.visible = true;
          b.uniforms.uColor.value.set(o.express ? "#ffb347" : "#ffd25a");
          b.uniforms.uAlpha.value = 1;
        }
        const m = this.pickupMarkers[i];
        if (m) {
          const isl = world.islands[o.from];
          m.visible = true;
          m.position.set(isl.pad.x, isl.pad.y + 7 + Math.sin(this.elapsed * 2 + i) * 1.2, isl.pad.z);
          m.rotation.y = this.elapsed * 1.2 + i;
        }
      });
    }
  }

  private readonly hm = new THREE.Matrix4();
  private readonly hq = new THREE.Quaternion();
  private readonly hs = new THREE.Vector3();

  private updateHalos() {
    const halos = this.halos;
    if (!halos) return;
    const zero = this.hm.makeScale(0, 0, 0);
    for (let i = 0; i < 120; i++) halos.setMatrixAt(i, zero);
    const put = (r: Ring, color: THREE.Color, scale = 1) => {
      this.hq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r.yaw);
      this.hs.setScalar(r.r * 2.15 * scale);
      this.hm.compose(r.pos, this.hq, this.hs);
      halos.setMatrixAt(r.halo, this.hm);
      halos.setColorAt(r.halo, color);
    };
    const playing = this.phase === "playing" || this.phase === "paused";
    if (this.mode === "shift" || !playing) {
      for (const r of this.boostRings) put(r, r.cd > 0 ? HALO_DIM : HALO_BLUE);
    }
    if (this.mode === "trial" && playing) {
      const n = this.trialRings.length;
      const next = this.trialRings[this.trialNext % n];
      const after = this.trialRings[(this.trialNext + 1) % n];
      if (after && this.trialNext + 1 <= n) put(after, HALO_DIM, 1);
      if (next) put(next, this.trialNext >= n ? HALO_GOLD : HALO_NEXT, 1 + Math.sin(this.elapsed * 6) * 0.04);
    }
    halos.instanceMatrix.needsUpdate = true;
    if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
  }

  // --- Lighting and camera ---------------------------------------------------------------------------------

  private tod() {
    if (this.phase === "menu" || this.phase === "loading") return 0.86;
    if (this.mode === "trial") return [0.4, 0.7, 0.93][this.course] ?? 0.5;
    return clamp(this.clock / SHIFT_SECONDS, 0, 1);
  }

  private applyLook(t: number) {
    const look = skyLook(t, this.look);
    this.sky.apply(look);
    this.sun.color.copy(look.sun);
    this.sun.intensity = look.sunIntensity;
    this.hemi.color.copy(look.hemiSky);
    this.hemi.groundColor.copy(look.hemiGround);
    this.hemi.intensity = look.hemiIntensity;
    this.fog.color.copy(look.horizon);
  }

  private readonly stormGrey = new THREE.Color("#5d6478");

  private updateLighting(dt: number) {
    this.applyLook(this.tod());
    const look = this.look;
    // Storms and the cloud sea close the view in.
    const storm = this.phase === "playing" ? this.inStorm : 0;
    const cloud = smooth(16, -2, this.camera.position.y);
    if (storm > 0) {
      this.fog.color.lerp(this.stormGrey, storm * 0.7);
      this.sky.uniforms.uHorizon.value.lerp(this.stormGrey, storm * 0.7);
      this.sky.uniforms.uTop.value.lerp(this.stormGrey, storm * 0.6);
      this.sun.intensity *= 1 - storm * 0.6;
    }
    this.fog.near = lerp(lerp(320, 60, storm), 4, cloud);
    this.fog.far = lerp(lerp(1700, 520, storm), 140, cloud);
    if (cloud > 0) this.fog.color.lerp(look.cloudLit, cloud * 0.8);
    this.sky.uniforms.uFlash.value = this.flash * 0.5;
    this.hemi.intensity += this.flash * 1.2;
    this.sky.mesh.position.copy(this.camera.position);
    this.sea.update(dt, this.camera.position, look, this.flash);
    this.puffs?.apply(look, this.flash);
    // The sun's shadow box follows the airship.
    this.sun.target.position.copy(this.pos);
    this.sun.position.copy(this.pos).addScaledVector(look.sunDir, 420);
  }

  private updateCamera(dt: number) {
    const cam = this.camera;
    const playing = this.phase === "playing" || this.phase === "paused";
    let fovTarget = 62;
    if (playing) {
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const sp = clamp((this.speed - 10) / 45, 0, 1);
      const portrait = this.view.w / this.view.h < 0.8;
      const back = (portrait ? 22 : 17) + sp * 7 + (this.boosting ? 3 : 0);
      const upOff = (portrait ? 6.5 : 5.2) + sp * 1.5 - clamp(this.vs * 0.14, -3, 3);
      const look = this.keys.look ? -1 : 1;
      this.v1.set(this.pos.x - fx * back * look, this.pos.y + upOff, this.pos.z - fz * back * look);
      // Never inside an island.
      for (let i = 0; i < 3; i++) {
        if (this.world!.column(this.v1.x, this.v1.z, this.col) && this.v1.y < this.col.top + 3 && this.v1.y > this.col.bottom - 3) this.v1.y = this.col.top + 3;
      }
      if (this.camSnap) this.camPos.copy(this.v1);
      else this.camPos.lerp(this.v1, 1 - Math.exp(-(this.keys.look ? 14 : 5.5) * dt));
      this.v2.set(this.pos.x + fx * (8 + this.speed * 0.35) * look, this.pos.y + 1.6 + clamp(this.vs * 0.25, -4, 4), this.pos.z + fz * (8 + this.speed * 0.35) * look);
      if (this.camSnap) this.camLook.copy(this.v2);
      else this.camLook.lerp(this.v2, 1 - Math.exp(-9 * dt));
      fovTarget = 60 + sp * 9 + (this.boosting ? 8 : 0);
      this.streaks.update(dt, this.speed, smooth(26, 50, this.speed) + (this.boosting ? 0.6 : 0));
    } else {
      this.orbit += dt * (this.menuView === "map" ? 0.02 : 0.06);
      if (this.menuView === "map" && this.phase === "menu") {
        this.v1.set(Math.sin(this.orbit * 0.5) * 180, 820, 760);
        this.v2.set(0, 80, 40);
      } else {
        const hub = this.world!.islands[0];
        const away = Math.atan2(this.pos.x - hub.x, this.pos.z - hub.z);
        const a = away + 0.35 + Math.sin(this.orbit) * 0.55;
        this.v1.set(this.pos.x + Math.sin(a) * 26, this.pos.y + 4 + Math.sin(this.orbit * 0.7) * 2.5, this.pos.z + Math.cos(a) * 26);
        this.v2.set(lerp(this.pos.x, hub.x, 0.22), this.pos.y + 4, lerp(this.pos.z, hub.z, 0.22));
      }
      if (this.camSnap) {
        this.camPos.copy(this.v1);
        this.camLook.copy(this.v2);
      } else {
        this.camPos.lerp(this.v1, 1 - Math.exp(-1.6 * dt));
        this.camLook.lerp(this.v2, 1 - Math.exp(-2.2 * dt));
      }
      this.streaks.update(dt, 0, 0);
    }
    this.camSnap = false;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake;
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z + (Math.random() - 0.5) * sh);
    cam.lookAt(this.camLook);
    if (this.debugCam) {
      cam.position.fromArray(this.debugCam.pos);
      cam.lookAt(this.v1.fromArray(this.debugCam.look));
    }
    this.fov = damp(this.fov, fovTarget, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    // The route arrow floats above the airship.
    const t = playing ? this.target() : null;
    if (t && this.countdown <= 0) {
      const dx = t.pos.x - this.pos.x;
      const dz = t.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      this.arrow.visible = d > 45;
      this.arrow.position.set(this.pos.x, this.pos.y + TOP + 2.2 + Math.sin(this.elapsed * 3) * 0.2, this.pos.z);
      const dy = t.pos.y - this.pos.y;
      this.arrow.rotation.set(-clamp(Math.atan2(dy, d), -0.6, 0.6), Math.atan2(dx, dz), 0, "YXZ");
      const mat = this.arrow.material as THREE.MeshStandardMaterial;
      mat.color.set(t.kind === "drop" ? "#8fd0ff" : "#f3c64a");
      mat.emissive.set(t.kind === "drop" ? "#3c8fd8" : "#d4af37");
    } else this.arrow.visible = false;
  }

  /** What the player should fly to next. */
  private target(): { pos: THREE.Vector3; label: string; kind: "pickup" | "drop" | "ring" } | null {
    const world = this.world!;
    if (this.mode === "trial") {
      const n = this.trialRings.length;
      const r = this.trialRings[this.trialNext % Math.max(1, n)];
      if (!r) return null;
      return { pos: r.pos, label: this.trialNext >= n ? "Finish" : `Ring ${this.trialNext + 1}`, kind: "ring" };
    }
    if (this.carry) {
      const isl = world.islands[this.carry.to];
      return { pos: this.v3.set(isl.pad.x, isl.pad.y + 12, isl.pad.z).clone(), label: isl.name, kind: "drop" };
    }
    let best: Offer | null = null;
    let bd = Infinity;
    for (const o of this.offers) {
      const isl = world.islands[o.from];
      const d = Math.hypot(isl.pad.x - this.pos.x, isl.pad.z - this.pos.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best) return null;
    const isl = world.islands[best.from];
    return { pos: new THREE.Vector3(isl.pad.x, isl.pad.y + 12, isl.pad.z), label: `Pick up · ${isl.name}`, kind: "pickup" };
  }

  // --- HUD, overlay and minimap ---------------------------------------------------------------------------

  private showToast(t: Omit<Toast, "id">) {
    this.toast = { ...t, id: ++this.toastId };
    this.toastT = 3.2;
  }

  private floatText(text: string, color: string, big: boolean) {
    this.texts.push({ text, color, pos: this.pos.clone().add(new THREE.Vector3(0, 5, 0)), age: 0, life: big ? 1.8 : 1.4, big });
  }

  private emitHud() {
    const world = this.world;
    const hours = DAY_START_HOUR + (clamp(this.clock / SHIFT_SECONDS, 0, 1) * DAY_HOURS);
    const hh = Math.floor(hours);
    const mm = Math.floor((hours - hh) * 60 / 5) * 5;
    const name = (id: number) => world?.islands[id]?.name ?? "";
    let prompt: string | null = null;
    if (this.phase === "playing" && this.mode === "shift" && world) {
      if (this.carry) {
        if (this.inZone(world.islands[this.carry.to], true)) prompt = "Press E to drop the parcel";
      } else if (this.offers.some((o) => this.inZone(world.islands[o.from], true))) prompt = "Press E to pick up";
    }
    const trialDef = COURSES[this.course];
    this.events.hud({
      mode: this.mode,
      speed: this.speed,
      alt: Math.max(0, this.pos.y - BOT),
      throttle: this.throttle,
      boost: this.boost,
      boostCap: this.boostCap,
      boosting: this.boosting,
      hull: this.hull,
      maxHull: this.maxHull,
      coins: this.coins,
      clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      dayFrac: clamp(this.clock / SHIFT_SECONDS, 0, 1),
      carry: this.carry
        ? { from: name(this.carry.from), to: name(this.carry.to), dist: this.distTo(this.carry.to), pay: this.carry.pay, time: this.carry.time, express: this.carry.express, left: this.carry.left, condition: this.carry.condition }
        : null,
      offers: this.offers.map((o) => ({ from: name(o.from), to: name(o.to), dist: o.dist, pay: o.pay, time: o.time, express: o.express, away: this.distTo(o.from) })),
      chain: this.chain,
      delivered: this.delivered,
      trial:
        this.mode === "trial"
          ? { name: trialDef.name, ring: Math.min(this.trialNext, this.trialRings.length + 1), total: this.trialRings.length + 1, time: this.trialTime, countdown: Math.max(0, this.countdown), best: 0 }
          : null,
      warn: this.warn,
      prompt,
      toast: this.toast,
      heading: ((-this.yaw * 180) / Math.PI + 540) % 360,
    });
  }

  private distTo(id: number) {
    const isl = this.world?.islands[id];
    if (!isl) return 0;
    return Math.hypot(isl.pad.x - this.pos.x, isl.pad.z - this.pos.z);
  }

  private drawOverlay(dt: number) {
    void dt;
    const ctx = this.overlay;
    if (!ctx) return;
    const { w, h, dpr } = this.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Damage vignette and lightning.
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    if (this.hurtFlash > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, "rgba(200,40,30,0)");
      g.addColorStop(1, `rgba(200,40,30,${0.45 * this.hurtFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.flash > 0.05 && this.inStorm > 0.2) {
      ctx.fillStyle = `rgba(235,242,255,${this.flash * 0.35 * this.inStorm})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.phase !== "playing" && this.phase !== "paused") return;
    const cam = this.camera;
    // Target marker / edge arrow.
    const t = this.target();
    if (t && this.countdown <= 0) {
      const p = this.v1.copy(t.pos).project(cam);
      const behind = this.v2.copy(t.pos).applyMatrix4(cam.matrixWorldInverse).z > 0;
      let sx = (p.x * 0.5 + 0.5) * w;
      let sy = (-p.y * 0.5 + 0.5) * h;
      const dist = t.pos.distanceTo(this.pos);
      const color = t.kind === "drop" ? "#8fd0ff" : t.kind === "ring" ? "#ffe9a8" : "#ffd25a";
      const margin = 46;
      const on = !behind && sx > margin && sx < w - margin && sy > margin + 40 && sy < h - margin;
      ctx.font = `600 13px ${this.font}`;
      ctx.textAlign = "center";
      if (on) {
        const s = 9;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#0b1d33";
        ctx.strokeRect(-s, -s, s * 2, s * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(-s, -s, s * 2, s * 2);
        ctx.restore();
        this.label(ctx, `${t.label.toUpperCase()} · ${Math.round(dist)} M`, sx, sy - 22, color);
      } else {
        let dx = sx - w / 2;
        let dy = sy - h / 2;
        if (behind) {
          dx = -dx;
          dy = -dy;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
        }
        const k = Math.min((w / 2 - margin) / Math.max(1e-3, Math.abs(dx)), (h / 2 - margin) / Math.max(1e-3, Math.abs(dy)));
        sx = w / 2 + dx * k;
        sy = h / 2 + dy * k;
        const a = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-8, -11);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-8, 11);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.strokeStyle = "#0b1d33";
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        this.label(ctx, `${Math.round(dist)} M`, sx - Math.cos(a) * 30, sy - Math.sin(a) * 30 + 4, color);
      }
    }
    // Floating texts.
    for (const ft of this.texts) {
      const k = ft.age / ft.life;
      const p = this.v1.copy(ft.pos);
      p.y += k * 6;
      if (this.v2.copy(p).applyMatrix4(cam.matrixWorldInverse).z > 0) continue;
      p.project(cam);
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-p.y * 0.5 + 0.5) * h;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `${ft.big ? 30 : 17}px ${this.font}`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(11,29,51,0.85)";
      ctx.strokeText(ft.text, x, y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, x, y);
      ctx.globalAlpha = 1;
    }
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    const wTxt = ctx.measureText(text).width + 16;
    ctx.fillStyle = "rgba(11,29,51,0.82)";
    ctx.fillRect(x - wTxt / 2, y - 14, wTxt, 20);
    ctx.strokeStyle = "rgba(212,175,55,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - wTxt / 2 + 0.5, y - 13.5, wTxt - 1, 19);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + 1);
  }

  private drawMinimap() {
    const canvas = this.minimap!;
    const world = this.world!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = canvas.clientWidth || 128;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = canvas.height = Math.round(size * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "rgba(11,29,51,0.88)";
    ctx.fillRect(0, 0, size, size);
    const range = 750;
    const k = (R - 6) / range;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    // Map with the airship's heading pointing up.
    const map = (x: number, z: number): [number, number] => {
      const dx = x - this.pos.x;
      const dz = z - this.pos.z;
      return [R + (dx * rx + dz * rz) * -k, R - (dx * fx + dz * fz) * k];
    };
    // Range rings.
    ctx.strokeStyle = "rgba(212,175,55,0.18)";
    ctx.lineWidth = 1;
    for (const rr of [250, 500]) {
      ctx.beginPath();
      ctx.arc(R, R, rr * k, 0, TAU);
      ctx.stroke();
    }
    // Storms and updrafts.
    for (const s of this.storms) {
      const [x, y] = map(s.x, s.z);
      ctx.fillStyle = "rgba(90,96,120,0.45)";
      ctx.beginPath();
      ctx.arc(x, y, s.r * k, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,241,201,0.55)";
    for (const u of UPDRAFTS) {
      const [x, y] = map(u.x, u.z);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, u.r * k), 0, TAU);
      ctx.stroke();
    }
    // Islands.
    const carryTo = this.mode === "shift" ? this.carry?.to : undefined;
    const offerFrom = new Set(this.mode === "shift" && !this.carry ? this.offers.map((o) => o.from) : []);
    world.islands.forEach((isl, i) => {
      const [x, y] = map(isl.x, isl.z);
      const r = Math.max(isl.def ? 3 : 1.5, isl.radius * k);
      const locked = isl.def ? isl.def.region > this.region && this.phase === "playing" && this.mode === "shift" : false;
      ctx.fillStyle = !isl.def ? "rgba(248,241,227,0.25)" : locked ? "rgba(248,241,227,0.3)" : "rgba(248,241,227,0.7)";
      if (i === carryTo) ctx.fillStyle = "#7cc4ff";
      else if (offerFrom.has(i)) ctx.fillStyle = "#ffd25a";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    });
    // Balloons.
    ctx.fillStyle = "#ff8a6b";
    for (const b of this.balloons) {
      if (!b.obj.visible) continue;
      const [x, y] = map(b.pos.x, b.pos.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Next trial ring.
    if (this.mode === "trial" && this.trialRings.length) {
      const r = this.trialRings[this.trialNext % this.trialRings.length];
      const [x, y] = map(r.pos.x, r.pos.z);
      ctx.strokeStyle = "#ffe9a8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.stroke();
    }
    // North marker.
    const [nx, ny] = map(this.pos.x, this.pos.z - 10000);
    const na = Math.atan2(ny - R, nx - R);
    ctx.fillStyle = "#d4af37";
    ctx.font = `700 11px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillText("N", R + Math.cos(na) * (R - 10), R + Math.sin(na) * (R - 10) + 4);
    ctx.restore();
    // The airship.
    ctx.fillStyle = "#f8f1e3";
    ctx.strokeStyle = "#0b1d33";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(R, R - 7);
    ctx.lineTo(R + 5, R + 5);
    ctx.lineTo(R, R + 2);
    ctx.lineTo(R - 5, R + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(212,175,55,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.stroke();
  }

  // --- Resize / performance -------------------------------------------------------------------------------

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.view = { w, h, dpr };
    const o = this.overlay?.canvas;
    if (o) {
      o.width = Math.round(w * dpr);
      o.height = Math.round(h * dpr);
    }
    const ph = this.renderer.domElement.height;
    this.glow.setScale(ph, this.camera.fov);
    this.smoke.setScale(ph, this.camera.fov);
  }

  private adaptResolution(real: number) {
    const r = this.res;
    r.acc += real;
    r.n++;
    if (r.acc < 1.5) return;
    const avg = r.acc / r.n;
    r.acc = 0;
    r.n = 0;
    let next = r.cur;
    if (avg > 1 / 50 && r.cur > r.min) {
      next = Math.max(r.min, r.cur * 0.85);
      r.good = 0;
    } else if (avg < 1 / 58 && r.cur < r.max) {
      if (++r.good >= 3) {
        next = Math.min(r.max, r.cur * 1.12);
        r.good = 0;
      }
    } else r.good = 0;
    if (Math.abs(next - r.cur) > 0.01) {
      r.cur = next;
      this.renderer.setPixelRatio(next);
      this.resize();
    }
  }
}
