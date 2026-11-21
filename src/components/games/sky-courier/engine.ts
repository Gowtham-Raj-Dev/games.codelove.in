import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AdaptiveRes } from "../shared/adaptive-res";
import { disposeTree, loadModels, makeProto, type LoadProgress, type Proto } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { AIR_WALTZ } from "../shared/songs";
import { Sfx } from "./audio";
import { findItem, FRAMES, PAINTS, shipStats, type Loadout, type ShipStats } from "./content";
import { CEILING, DAY_HOURS, DAY_START_HOUR, REGIONS, rng, SHIFT_SECONDS, WORLD_RADIUS, type RegionDef } from "./data";
import { AirColumns, Beam, CloudPuffs, CloudSea, Glows, JetTubes, makeArrow, makeHaloMaterial, newLook, Particles, SkyDome, skyLook, Stars, WindStreaks, type PuffSpec } from "./fx";
import { AERO, MODELS, PARCEL, PROP, ROCKS, SHIP, TRAFFIC } from "./manifest";
import { MISSIONS, starsFor, type MissionDef, type MissionKind, type MissionMods } from "./missions";
import { MaterialBank, World, type Island } from "./world";

// --- Tuning ---------------------------------------------------------------------------------------

/** From the balloon's centre down to the gondola's foot, and up to the fin tips. */
const BOT = 4.4;
const TOP = 2.6;
const HULL_R = 2.3;
const MIN_SPEED = 6;
const ZONE_R = 14;
const ZONE_H = 48;
const SHADOW_EXTENT = 110;
/** How far outside a ring's hole still counts, and how close picks up a mail bag. */
const RING_SLACK = 4.5;
const BAG_R = 11;
const TAU = Math.PI * 2;

/** Halo slots: the boost rings, the next two rings of a trial, the mail bags. */
const BOOST_RINGS = 80;
const TRIAL_RINGS = 64;
const MAX_BAGS = 24;
const HALO_NEXT = BOOST_RINGS;
const HALO_AFTER = BOOST_RINGS + 1;
const HALO_BAGS = BOOST_RINGS + 2;
const HALOS = HALO_BAGS + MAX_BAGS;

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
export type Mode = "mission" | "shift";

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

export interface MissionHud {
  id: number;
  kind: MissionKind;
  name: string;
  /** Seconds flown, the limit, and the times for 3 and 2 stars. */
  time: number;
  limit: number;
  t3: number;
  t2: number;
  /** Stars a finish right now would earn. */
  stars: number;
  /** Parcels delivered, rings passed or bags collected, of how many. */
  done: number;
  total: number;
  goal: string;
  /** Metres to the next beam, ring or bag. */
  dist: number;
  /** Condition of the parcel on board (0..1), or null with none. */
  cargo: number | null;
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
  heading: number;
  /** Seconds left of the 3-2-1 before a mission starts. */
  countdown: number;
  warn: string | null;
  prompt: string | null;
  toast: Toast | null;
  mission: MissionHud | null;
  // Free flight.
  coins: number;
  clock: string;
  dayFrac: number;
  carry: (JobView & { left: number; condition: number }) | null;
  offers: (JobView & { away: number })[];
  chain: number;
  delivered: number;
}

export interface MissionResult {
  kind: "mission";
  id: number;
  won: boolean;
  /** 0 when the mission was lost. */
  stars: number;
  time: number;
  reason: "done" | "time" | "hull" | "cargo";
  /** Condition of the last parcel (1 when the mission has none). */
  cargo: number;
  rings: number;
  bumps: number;
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

export type Result = MissionResult | ShiftResult;

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  result(result: Result): void;
  error(message: string): void;
}

export const EMPTY_HUD: Hud = {
  mode: "mission",
  speed: 0,
  alt: 0,
  throttle: 0.5,
  boost: 0,
  boostCap: 1,
  boosting: false,
  hull: 100,
  maxHull: 100,
  heading: 0,
  countdown: 0,
  warn: null,
  prompt: null,
  toast: null,
  mission: null,
  coins: 0,
  clock: "08:00",
  dayFrac: 0,
  carry: null,
  offers: [],
  chain: 0,
  delivered: 0,
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
  halo: number;
}

interface Bag {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  got: boolean;
  phase: number;
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

interface Jet {
  a: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
  r: number;
  speed: number;
}

interface FloatText {
  text: string;
  color: string;
  pos: THREE.Vector3;
  age: number;
  life: number;
  big: boolean;
}

interface Target {
  pos: THREE.Vector3;
  label: string;
  kind: "pickup" | "drop" | "ring" | "bag";
}

interface PaintMat {
  mat: THREE.MeshStandardMaterial;
  kind: "body" | "trim" | "glow";
  color: THREE.Color;
  emissive: THREE.Color;
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
    this.qy.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
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
const HALO_RING = new THREE.Color("#ffe9a8");
const GLOW_COOL = new THREE.Color("#5fc8ff");
const GLOW_WARM = new THREE.Color("#ffb85c");
const GLOW_BALLOON = new THREE.Color("#ff9a4a");
const GLOW_BAG = new THREE.Color("#ffd56a");

/** Headings the autopilot weighs, as offsets from the straight line to its target (radians). */
const BOT_OFFSETS = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35];

// --- Game ---------------------------------------------------------------------------------------------

export class SkyCourierGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.6, 4200);
  private readonly sun = new THREE.DirectionalLight("#fff1dc", 2.6);
  private readonly hemi = new THREE.HemisphereLight("#d9ecff", "#8d84b4", 1.2);
  private readonly lamp = new THREE.PointLight("#cfe6ff", 0, 110, 1.4);
  private readonly fog = new THREE.Fog("#d4e4f1", 320, 1700);
  private readonly look = newLook();
  private readonly sky = new SkyDome();
  private readonly sea = new CloudSea();
  private readonly stars = new Stars();
  private readonly glows = new Glows(260);
  private puffs: CloudPuffs | null = null;
  private readonly glow = new Particles(1400, { additive: true });
  private readonly smoke = new Particles(700);
  private readonly streaks = new WindStreaks();
  private readonly rainFx = new WindStreaks(110);
  private readonly arrow = makeArrow();
  private updrafts: AirColumns | null = null;
  private downdrafts: AirColumns | null = null;
  private jetTubes: JetTubes | null = null;
  private readonly protos = new Map<string, Proto>();
  private readonly bank = new MaterialBank();
  private readonly timer = new THREE.Timer();
  private readonly res: AdaptiveRes;
  private world: World | null = null;
  private reg: RegionDef = REGIONS[0];
  private raf = 0;
  private disposed = false;
  private suspended = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private overlay: CanvasRenderingContext2D | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private view = { w: 1, h: 1, dpr: 1 };
  private font = "ui-sans-serif, system-ui, sans-serif";
  private readonly coarse: boolean;

  private phase: Phase = "loading";
  private mode: Mode = "mission";
  private loadout: Loadout = { frame: FRAMES[0].id, paint: PAINTS[0].id, engine: 0, tank: 0, hull: 0 };
  private stats: ShipStats = shipStats(this.loadout);
  /** The last finished flight (the dev hook and the check script read it). */
  lastResult: Result | null = null;

  // Airship.
  private readonly shipRoot = new THREE.Group();
  private readonly shipBody = new THREE.Group();
  private readonly propSpin = new THREE.Group();
  private parcel: THREE.Object3D | null = null;
  private readonly paintMats: PaintMat[] = [];
  private trail = "#ffffff";
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
  private inDowndraft = false;
  private inJet = false;
  private inStorm = 0;
  private menuSpot = new THREE.Vector3();
  private menuYaw = 0;

  // Air: steady wind, gusts and jet streams add up to `drift`.
  private readonly wind = new THREE.Vector3();
  private readonly gust = new THREE.Vector3();
  private readonly gustDir = new THREE.Vector3(1, 0, 0);
  private readonly drift = new THREE.Vector3();
  private gustPower = 0;
  private gustState = 0;
  private gustT = 5;
  private rainBase = 0;
  private rain = 0;
  private storms: Storm[] = [];
  private jets: Jet[] = [];
  private flash = 0;

  // Input.
  private readonly keys: Record<KeyName, boolean> = { left: false, right: false, up: false, down: false, thrUp: false, thrDown: false, boost: false, look: false };
  private stickX = 0;
  private stickY = 0;
  private touchBoost = false;

  // Mission.
  private mission: MissionDef | null = null;
  private mTime = 0;
  private stopIdx = 0;
  private cargo: { condition: number; fragile: boolean } | null = null;
  private countdown = 0;
  private lastCount = 0;
  private lastTick = 0;
  private bumps = 0;
  private ringsHit = 0;
  private trialRings: Ring[] = [];
  private trialNext = 0;
  private bags: Bag[] = [];
  private bagCount = 0;
  private bagsGot = 0;

  // Free flight.
  private clock = 0;
  private coins = 0;
  private delivered = 0;
  private onTime = 0;
  private late = 0;
  private chain = 0;
  private bestChain = 0;
  private carry: Carry | null = null;
  private offers: Offer[] = [];

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
  private texts: FloatText[] = [];

  // Camera.
  private readonly camPos = new THREE.Vector3(0, 200, 200);
  private readonly camLook = new THREE.Vector3();
  private camSnap = true;
  private shake = 0;
  private fov = 62;
  private orbit = 0;
  private hurtFlash = 0;
  private showcase = false;
  private readonly showShift = { x: 0, y: 0, cx: 0, cy: 0 };

  private elapsed = 0;
  private hudT = 0;
  private miniT = 0;
  private toast: Toast | null = null;
  private toastT = 0;
  private toastId = 0;
  private warn: string | null = null;
  private readonly col = { top: 0, bottom: 0 };
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly tgt: Target = { pos: new THREE.Vector3(), label: "", kind: "pickup" };
  private readonly botSide = { off: 0, until: 0 };
  /** The autopilot flies instead of the player (the check script and the trailer recorder use it). */
  auto = false;
  /** A fixed camera for screenshots: where it stands and what it looks at. */
  debugCam: { pos: number[]; look: number[] } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
    /** In YouTube Playables the SDK pauses the game; the page visibility API must not be used. */
    { visibility = true }: { visibility?: boolean } = {},
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.res = new AdaptiveRes(this.renderer, () => this.resize(), { start: this.coarse ? 1.6 : 2, max: 2, min: 0.6 });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.setupScene();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    if (visibility) this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------------

  private setupScene() {
    const { scene } = this;
    scene.fog = this.fog;
    scene.add(this.sky.mesh, this.stars.points, this.sea.mesh, this.hemi, this.sun, this.sun.target, this.glows.mesh, this.glow.points, this.smoke.points, this.arrow, this.camera);
    this.camera.add(this.streaks.lines, this.rainFx.lines);
    // The rain falls from ahead and above, past the camera.
    this.rainFx.lines.rotation.x = 0.42;
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
    this.updateLighting(0);
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>, loadout: Loadout, region: number) {
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
      const required = [SHIP, AERO.island, AERO.ringBlue, ROCKS.a, ROCKS.c, ROCKS.d, PARCEL];
      if (!required.every((k) => this.protos.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      this.buildShip();
      this.buildRingSets();
      this.buildTraffic();
      this.buildBags();
      this.applyLoadout(loadout);
      this.enterRegion(region);
      this.placeMenuShip();
      music.play(AIR_WALTZ, 0);
      this.setPhase("menu");
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
    // The airship gets its own copies of its materials, so a paint job doesn't repaint the stations.
    const clones = new Map<THREE.Material, THREE.Material>();
    const swap = (m: THREE.Material) => {
      let c = clones.get(m);
      if (!c) {
        c = m.clone();
        clones.set(m, c);
        const std = c as THREE.MeshStandardMaterial;
        const kind = /glow/i.test(m.name) ? "glow" : /wall/i.test(m.name) ? "body" : /floor/i.test(m.name) ? "trim" : null;
        if (kind && std.isMeshStandardMaterial) this.paintMats.push({ mat: std, kind, color: std.color.clone(), emissive: std.emissive.clone() });
      }
      return c;
    };
    visual.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
    this.shipBody.add(visual);
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
      this.shipBody.add(holder);
    }
    this.shipRoot.add(this.shipBody);
    // A headlamp for the night.
    this.lamp.position.set(0, 1.5, 4);
    this.shipRoot.add(this.lamp);
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

  /** The ring models (instanced) and the glowing discs inside them. */
  private buildRingSets() {
    const blue = this.protos.get(AERO.ringBlue);
    const pink = this.protos.get(AERO.ringPink) ?? blue;
    if (!blue || !pink) return;
    this.boostSet = new RingSet(blue, BOOST_RINGS, 26 / blue.size.x, this.scene);
    this.trialSet = new RingSet(pink, TRIAL_RINGS, 34 / pink.size.x, this.scene);
    this.haloMaterial = makeHaloMaterial("#ffffff");
    this.halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.haloMaterial, HALOS);
    this.halos.count = HALOS;
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 6;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < HALOS; i++) {
      this.halos.setMatrixAt(i, zero);
      this.halos.setColorAt(i, HALO_DIM);
    }
    this.scene.add(this.halos);
  }

  /** The mail bags of a "collect" mission: parcels from the library, reused every time. */
  private buildBags() {
    const box = this.protos.get(PARCEL);
    if (!box) return;
    for (let i = 0; i < MAX_BAGS; i++) {
      const obj = box.object.clone();
      obj.scale.setScalar(4.2);
      obj.visible = false;
      this.scene.add(obj);
      this.bags.push({ obj, pos: new THREE.Vector3(), got: true, phase: i * 1.7 });
    }
  }

  private buildTraffic() {
    const red = this.protos.get(TRAFFIC.balloonRed);
    const yellow = this.protos.get(TRAFFIC.balloonYellow) ?? red;
    const r = rng(99);
    if (red && yellow) {
      for (let i = 0; i < 16; i++) {
        const proto = i % 2 ? yellow : red;
        const s = 13 / proto.size.y;
        const obj = proto.object.clone();
        obj.scale.setScalar(s);
        obj.visible = false;
        this.scene.add(obj);
        this.balloons.push({ obj, pos: new THREE.Vector3(), vel: new THREE.Vector3(), bob: r() * TAU, r: (proto.size.x * s) / 2 + 0.5, h: proto.size.y * s, spin: (r() - 0.5) * 0.3 });
      }
    }
    const crow = this.protos.get(TRAFFIC.crow);
    const tri = this.protos.get(TRAFFIC.tribird);
    for (let f = 0; f < 5; f++) {
      const flock: Flock = {
        anchor: new THREE.Vector3(),
        center: new THREE.Vector3(),
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

  // --- Regions ------------------------------------------------------------------------------------------

  /** Builds a region's world (islands, rings, beams, clouds, air currents) in place of the one that is up. */
  private enterRegion(id: number) {
    const reg = REGIONS[clamp(Math.round(id) || 0, 0, REGIONS.length - 1)];
    if (this.world && this.reg === reg) return;
    this.leaveRegion();
    this.reg = reg;
    this.bank.tint(reg.tint.rock, reg.tint.grass, reg.tint.frost);
    this.world = new World(this.protos, reg);
    this.scene.add(this.world.group);
    this.buildBoostRings();
    this.buildBeams();
    this.buildClouds();
    this.updrafts = new AirColumns(reg.updrafts, CEILING);
    this.downdrafts = new AirColumns(reg.downdrafts, CEILING, true);
    this.jetTubes = new JetTubes(reg.jets);
    this.scene.add(this.updrafts.group, this.downdrafts.group, this.jetTubes.group);
    this.storms = reg.storms.map((s, i) => ({ ...s, t: 2 + i * 1.7 }));
    this.jets = reg.jets.map((j) => {
      const a = new THREE.Vector3(...j.a);
      const dir = new THREE.Vector3(...j.b).sub(a);
      const len = dir.length();
      return { a, dir: dir.normalize(), len, r: j.r, speed: j.speed };
    });
    // Bird flocks circle between pairs of islands.
    const stations = this.world.stations;
    this.flocks.forEach((f, i) => {
      const a = stations[(i + 1) % stations.length];
      const b = stations[(i + 3) % stations.length];
      f.anchor.set((a.x + b.x) / 2, Math.max(a.top, b.top) + 34 + i * 7, (a.z + b.z) / 2);
      f.center.copy(f.anchor);
      f.cd = 0;
      f.scatter = 0;
    });
    const r = rng(reg.id * 131 + 7);
    for (const b of this.balloons) this.respawnBalloon(b, r, true);
    this.setWeather({});
  }

  private leaveRegion() {
    this.world?.dispose();
    this.world = null;
    for (const b of this.beams) {
      b?.mesh.removeFromParent();
      b?.dispose();
    }
    this.beams = [];
    for (const part of [this.updrafts, this.downdrafts, this.jetTubes]) {
      part?.group.removeFromParent();
      part?.dispose();
    }
    this.updrafts = this.downdrafts = this.jetTubes = null;
    this.puffs?.mesh.removeFromParent();
    this.puffs?.dispose();
    this.puffs = null;
    this.boostRings = [];
    this.trialRings = [];
    if (this.boostSet) this.boostSet.count = 0;
    if (this.trialSet) this.trialSet.count = 0;
  }

  /** The region's weather and traffic, as a mission changes them. */
  private setWeather(mods: MissionMods, menu = false) {
    const reg = this.reg;
    this.wind.set(reg.wind[0], 0, reg.wind[1]).multiplyScalar(mods.wind ?? 1);
    this.gustPower = menu ? 0 : reg.gusts * (mods.gusts ?? 1);
    this.gustState = 0;
    this.gustT = 5 + Math.random() * 4;
    this.gust.set(0, 0, 0);
    this.rainBase = mods.rain ?? reg.rain;
    const balloons = Math.min(this.balloons.length, mods.balloons ?? reg.balloons);
    this.balloons.forEach((b, i) => (b.obj.visible = i < (menu ? Math.min(6, balloons) : balloons)));
    const flocks = mods.flocks ?? reg.flocks;
    this.flocks.forEach((f, i) => {
      f.active = i < flocks;
      for (const b of f.birds) b.obj.visible = f.active;
    });
  }

  private buildBoostRings() {
    const world = this.world!;
    const set = this.boostSet;
    if (!set) return;
    let slot = 0;
    for (const [a, b, n] of this.reg.ringLines) {
      const A = world.islands[a];
      const B = world.islands[b];
      if (!A || !B) continue;
      const dx = B.pad.x - A.pad.x;
      const dz = B.pad.z - A.pad.z;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const side = new THREE.Vector3(-dz / len, 0, dx / len);
      for (let i = 0; i < n && slot < BOOST_RINGS; i++) {
        const t = 0.3 + (0.42 * i) / Math.max(1, n - 1);
        const p = new THREE.Vector3(A.pad.x + dx * t, lerp(A.hoopY, B.hoopY, t) + 14 + Math.sin(t * Math.PI) * 18, A.pad.z + dz * t);
        p.addScaledVector(side, Math.sin(t * Math.PI * 2 + a) * 14);
        this.clearSpot(p, 18);
        set.place(slot, p, yaw);
        this.boostRings.push({ pos: p, normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), yaw, r: set.holeR, cd: 0, halo: slot });
        slot++;
      }
    }
    set.count = slot;
  }

  /** Raises a point until a sphere of radius r around it is clear of islands and pillars. Returns how far it rose. */
  private clearSpot(p: THREE.Vector3, r: number) {
    const world = this.world!;
    const from = p.y;
    for (let k = 0; k < 50; k++) {
      let blocked = false;
      for (let a = 0; a < 9 && !blocked; a++) {
        const x = p.x + (a ? Math.cos(a * 0.785) * r : 0);
        const z = p.z + (a ? Math.sin(a * 0.785) * r : 0);
        if (world.column(x, z, this.col) && p.y - r < this.col.top && p.y + r > this.col.bottom) blocked = true;
      }
      if (!blocked) break;
      p.y += 6;
    }
    p.y = Math.min(p.y, CEILING - 8);
    return p.y - from;
  }

  private respawnBalloon(b: Balloon, r: () => number, first = false) {
    const world = this.world!;
    const pool = this.reg.islands;
    for (let tries = 0; tries < 30; tries++) {
      const A = pool[Math.floor(r() * pool.length)];
      const B = pool[Math.floor(r() * pool.length)];
      if (A === B) continue;
      const t = 0.25 + r() * 0.5;
      b.pos.set(lerp(A.x, B.x, t) + (r() - 0.5) * 120, lerp(A.y, B.y, t) + (r() - 0.3) * 50, lerp(A.z, B.z, t) + (r() - 0.5) * 120);
      // Later ones drift in from upwind.
      if (!first) b.pos.addScaledVector(this.wind, -14 * (0.5 + r()));
      this.v1.copy(b.pos);
      if (this.clearSpot(this.v1, b.r + 8) !== 0) continue;
      if (world.column(b.pos.x, b.pos.z, this.col) && Math.abs(b.pos.y - this.col.top) < 30) continue;
      break;
    }
    b.vel.copy(this.wind).multiplyScalar(0.4);
  }

  private buildClouds() {
    const reg = this.reg;
    const r = rng(4242 + reg.id * 17);
    const specs: PuffSpec[] = [];
    // A low bank over the sea of clouds.
    for (let i = 0; i < 150; i++) {
      const a = r() * TAU;
      const d = 150 + Math.sqrt(r()) * 1500;
      const w = 80 + r() * 110;
      specs.push({ x: Math.cos(a) * d, y: 8 + r() * 26, z: Math.sin(a) * d, w, h: w * (0.42 + r() * 0.15), storm: 0, alpha: 0.75 + r() * 0.2 });
    }
    // Drifting mid-level clouds between the islands (grey ones where it rains).
    const world = this.world!;
    for (let i = 0, tries = 0; i < 46 && tries < 400; tries++) {
      const a = r() * TAU;
      const d = 120 + Math.sqrt(r()) * 1150;
      const w = 45 + r() * 60;
      const p = new THREE.Vector3(Math.cos(a) * d, 60 + r() * 200, Math.sin(a) * d);
      let blocked = false;
      for (const isl of world.islands) if (Math.hypot(isl.x - p.x, isl.z - p.z) < isl.radius + w * 0.7 && p.y > isl.minY - 30 && p.y < isl.maxY + 40) blocked = true;
      if (blocked) continue;
      specs.push({ x: p.x, y: p.y, z: p.z, w, h: w * 0.5, storm: reg.rain > 0 ? 0.55 : 0, alpha: 0.55 + r() * 0.25 });
      i++;
    }
    // Storm walls.
    for (const s of reg.storms) {
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
    this.prev.copy(this.pos);
    this.yaw = this.menuYaw;
    this.speed = 0;
    this.vs = 0;
    this.camSnap = true;
  }

  // --- Public API -------------------------------------------------------------------------------------

  get currentPhase() {
    return this.phase;
  }

  get currentRegion() {
    return this.reg.id;
  }

  /** Starts mission `id` (0..39) of the career. */
  startMission(id: number, loadout: Loadout) {
    if (this.phase === "loading" || this.phase === "error") return;
    const def = MISSIONS[clamp(Math.round(id) || 0, 0, MISSIONS.length - 1)];
    audio.unlock();
    this.enterRegion(def.region);
    this.applyLoadout(loadout);
    this.mode = "mission";
    this.mission = def;
    this.resetRun();
    this.setWeather(def.mods);
    const world = this.world!;
    if (def.kind === "trial" && def.course) {
      this.buildCourse(def.course);
      if (this.boostSet) this.boostSet.count = 0;
      const first = this.trialRings[0];
      if (first) {
        this.pos.copy(first.pos).addScaledVector(first.normal, -110);
        this.yaw = first.yaw;
      }
    } else {
      const isl = world.islands[def.stops?.[0] ?? 0];
      const out = Math.atan2(isl.pad.x - isl.x, isl.pad.z - isl.z);
      if (def.kind === "collect" && def.bags) {
        this.placeBags(def.bags);
        this.pos.set(isl.pad.x + Math.sin(out) * 40, isl.hoopY + 16, isl.pad.z + Math.cos(out) * 40);
        const near = this.nearestBag();
        this.yaw = near ? Math.atan2(near.pos.x - this.pos.x, near.pos.z - this.pos.z) : out;
      } else {
        // A hundred metres off the first station, nose on its pad.
        this.pos.set(isl.pad.x + Math.sin(out) * 100, isl.hoopY + 8, isl.pad.z + Math.cos(out) * 100);
        this.yaw = out + Math.PI;
      }
    }
    this.clearSpot(this.pos, 9);
    this.prev.copy(this.pos);
    this.speed = 0;
    this.countdown = 3.2;
    this.lastCount = 4;
    this.camSnap = true;
    this.showToast({ title: def.name, lines: [def.brief], tone: "info" }, 3.4);
    music.play(AIR_WALTZ, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setPhase("playing");
  }

  /** Free flight: four minutes of jobs off the board in one region. */
  startShift(region: number, loadout: Loadout) {
    if (this.phase === "loading" || this.phase === "error") return;
    audio.unlock();
    this.enterRegion(region);
    this.applyLoadout(loadout);
    this.mode = "shift";
    this.mission = null;
    this.resetRun();
    this.setWeather({});
    // Start just off the post office, facing its pad.
    const hub = this.world!.islands[0];
    const out = Math.atan2(hub.pad.x - hub.x, hub.pad.z - hub.z);
    this.pos.set(hub.pad.x + Math.sin(out) * 80, hub.hoopY + 8, hub.pad.z + Math.cos(out) * 80);
    this.clearSpot(this.pos, 9);
    this.prev.copy(this.pos);
    this.yaw = out + Math.PI;
    this.speed = 14;
    this.countdown = 0;
    this.refreshOffers(0);
    this.camSnap = true;
    this.showToast({ title: "Shift started", lines: [this.reg.name, "Fly into a gold beam to load a parcel"], tone: "info" });
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
    this.resetRun();
    this.mission = null;
    this.setWeather({}, true);
    this.placeMenuShip();
    music.play(AIR_WALTZ, 0);
    music.setIntensity(0);
    music.duck(false);
    this.setPhase("menu");
  }

  /** Menu only: shows another region behind the menus. */
  setRegion(region: number) {
    if (this.phase !== "menu") return;
    this.enterRegion(region);
    this.setWeather({}, true);
    this.placeMenuShip();
  }

  /** Menu only: puts an airship, paint job or upgrade on (the hangar previews with it). */
  setLoadout(loadout: Loadout) {
    if (this.phase !== "menu") return;
    this.applyLoadout(loadout);
  }

  /** The hangar's close-up of the airship. `shift`: how far the panel pushes the 3D view aside (fractions of the screen). */
  setShowcase(on: boolean, shift = { x: 0, y: 0 }) {
    this.showcase = on;
    this.showShift.x = on ? shift.x : 0;
    this.showShift.y = on ? shift.y : 0;
  }

  /** A burst of sparks round the airship (something was bought). */
  celebrate() {
    this.sfx.medal(2);
    this.glow.burst(this.pos.x, this.pos.y, this.pos.z, 60, 12, { color: "#ffd56a", life: 1.3, size: 1.1, grow: 0.3, alpha: 1, drag: 1.6 });
  }

  setKey(key: KeyName, down: boolean) {
    this.keys[key] = down;
  }

  setStick(x: number, y: number) {
    this.stickX = clamp(x, -1, 1);
    this.stickY = clamp(y, -1, 1);
  }

  setThrottle(v: number) {
    if (Number.isFinite(v)) this.throttle = clamp(v, 0, 1);
  }

  setBoost(on: boolean) {
    this.touchBoost = on;
  }

  /** E: load or drop a parcel from a little further out than the beam does by itself. */
  action() {
    if (this.phase !== "playing" || this.countdown > 0) return;
    const world = this.world!;
    if (this.mode === "mission") {
      const stops = this.mission?.stops;
      const isl = stops ? world.islands[stops[this.stopIdx]] : undefined;
      if (isl && this.inZone(isl, true)) this.reachStop();
    } else if (this.carry) {
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

  /** YouTube Playables pause: no frames at all while the game is off screen. */
  setSuspended(on: boolean) {
    if (on === this.suspended || this.disposed) return;
    this.suspended = on;
    if (on) {
      cancelAnimationFrame(this.raf);
      this.sfx.silence();
    } else {
      this.timer.reset();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  /**
   * Runs the flight forward without drawing it, until it ends or `seconds` have passed (the check
   * script plays every mission this way). Returns the seconds flown.
   */
  simulate(seconds: number, step = 1 / 30) {
    let t = 0;
    while (t < seconds && this.phase === "playing") {
      this.tick(step);
      t += step;
    }
    this.emitHud();
    return t;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    this.leaveRegion();
    this.boostSet?.dispose();
    this.trialSet?.dispose();
    this.halos?.geometry.dispose();
    this.haloMaterial?.dispose();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.envTexture?.dispose();
    this.sky.dispose();
    this.sea.dispose();
    this.stars.dispose();
    this.glows.dispose();
    this.glow.dispose();
    this.smoke.dispose();
    this.streaks.dispose();
    this.rainFx.dispose();
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

  /** The airship's frame (shape and handling), paint and upgrades. */
  private applyLoadout(loadout: Loadout) {
    this.loadout = { ...loadout };
    this.stats = shipStats(this.loadout);
    const frame = findItem(FRAMES, loadout.frame);
    this.shipBody.scale.set(frame.shape[0], frame.shape[1], frame.shape[2]);
    const paint = findItem(PAINTS, loadout.paint);
    this.trail = paint.trail;
    for (const p of this.paintMats) {
      if (paint.id === PAINTS[0].id) {
        p.mat.color.copy(p.color);
        p.mat.emissive.copy(p.emissive);
      } else if (p.kind === "glow") p.mat.emissive.set(paint.glow);
      else p.mat.color.set(p.kind === "body" ? paint.body : paint.trim);
    }
    this.hull = Math.min(this.hull, this.stats.hull);
    this.boost = Math.min(this.boost, this.stats.boostCap);
  }

  /** Everything a flight leaves behind, cleared: the next one (or the menu) starts clean. */
  private resetRun() {
    this.releaseInput();
    this.showcase = false;
    this.showShift.x = this.showShift.y = 0;
    this.hull = this.stats.hull;
    this.boost = this.stats.boostCap * 0.5;
    this.throttle = 0.6;
    this.boosting = false;
    this.yawRate = 0;
    this.vs = 0;
    this.speed = 0;
    this.knock.set(0, 0, 0);
    this.roll = this.pitch = 0;
    this.bumpCd = 0;
    this.birdSlow = 0;
    this.turbV = this.turbYaw = 0;
    this.inStorm = 0;
    this.inUpdraft = this.inDowndraft = this.inJet = false;
    this.flash = 0;
    this.hurtFlash = 0;
    this.shake = 0;
    this.warn = null;
    this.toast = null;
    this.texts = [];
    this.glow.clear();
    this.smoke.clear();
    this.arrow.visible = false;
    this.hideBeams();
    if (this.parcel) this.parcel.visible = false;
    // Mission.
    this.mTime = 0;
    this.stopIdx = 0;
    this.cargo = null;
    this.countdown = 0;
    this.lastCount = 0;
    this.lastTick = 0;
    this.bumps = 0;
    this.ringsHit = 0;
    this.trialRings = [];
    this.trialNext = 0;
    if (this.trialSet) this.trialSet.count = 0;
    if (this.boostSet) this.boostSet.count = this.boostRings.length;
    for (const r of this.boostRings) r.cd = 0;
    for (const b of this.bags) {
      b.got = true;
      b.obj.visible = false;
    }
    this.bagCount = this.bagsGot = 0;
    // Free flight.
    this.clock = 0;
    this.coins = 0;
    this.delivered = this.onTime = this.late = 0;
    this.chain = this.bestChain = 0;
    this.carry = null;
    this.offers = [];
    this.botSide.until = 0;
    for (const f of this.flocks) f.cd = f.scatter = 0;
  }

  // --- Frame ------------------------------------------------------------------------------------------

  private readonly frame = (now: number) => {
    if (this.disposed || this.suspended) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(now);
    const real = Math.min(0.25, this.timer.getDelta());
    const dt = Math.min(1 / 20, real);
    if (!this.world) return;
    this.tick(dt);
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
    // (Before the render: changing the resolution clears the canvas.)
    this.res.tick(real);
    this.renderer.render(this.scene, this.camera);
  };

  /** One step of the game itself: the flight, then the world around it. */
  private tick(dt: number) {
    this.elapsed += dt;
    if (this.phase === "playing") this.updatePlay(dt);
    else if (this.phase === "menu" || this.phase === "results") this.updateIdle(dt);
    if (this.phase !== "paused") this.updateAmbient(dt);
  }

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
    this.inStorm = 0;
    this.gust.set(0, 0, 0);
    this.sfx.flight(0.25, 0, false, true);
    this.sfx.weather(this.rainBase * 0.5);
  }

  private updatePlay(dt: number) {
    // Mission countdown: hold still, then go.
    if (this.countdown > 0) {
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c !== this.lastCount) {
        this.lastCount = c;
        this.sfx.countdown(c <= 0);
        if (c <= 0) this.speed = this.stats.speed * (this.mission?.kind === "trial" ? 0.75 : 0.5);
      }
      if (this.countdown > 0) {
        this.vs = damp(this.vs, Math.sin(this.elapsed * 2) * 0.4, 3, dt);
        this.prev.copy(this.pos);
        this.pos.y += this.vs * dt;
        this.sfx.flight(this.throttle, 0, false, true);
        this.sfx.weather(this.rainBase);
        return;
      }
    }
    const stats = this.stats;

    // Input.
    let steer = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) + this.stickX;
    let climb = (this.keys.up ? 1 : 0) - (this.keys.down ? 1 : 0) + this.stickY;
    let wantBoost = this.keys.boost || this.touchBoost;
    if (this.keys.thrUp) this.throttle = clamp(this.throttle + dt * (0.6 + this.loadout.engine * 0.08), 0, 1);
    if (this.keys.thrDown) this.throttle = clamp(this.throttle - dt * 0.75, 0, 1);
    if (this.auto) {
      const a = this.autopilot();
      steer = a.steer;
      climb = a.climb;
      wantBoost = a.boost;
      this.throttle = a.throttle;
    }
    steer = clamp(steer, -1, 1);
    climb = clamp(climb, -1, 1);

    // Boost.
    if (wantBoost && this.boost > 0.02) {
      if (!this.boosting) this.sfx.boost();
      this.boosting = true;
      this.boost = Math.max(0, this.boost - dt * 0.3);
    } else this.boosting = false;
    this.boost = Math.min(stats.boostCap, this.boost + dt * stats.boostRegen);

    // Speed.
    const max = stats.speed;
    let target = MIN_SPEED + this.throttle * (max - MIN_SPEED);
    if (this.boosting) target = Math.max(target, max) * 1.55;
    if (this.birdSlow > 0) {
      this.birdSlow -= dt;
      target *= 0.55;
    }
    const inCloud = smooth(10, -4, this.pos.y);
    target *= 1 - inCloud * 0.35;
    const rate = this.boosting ? 2.4 : target > this.speed ? stats.accel : 1.2;
    this.speed = damp(this.speed, target, rate, dt);

    // Steering and climbing.
    const sp = clamp(this.speed / 50, 0, 1);
    const turn = lerp(1.3, 0.92, sp) * stats.turn;
    this.yawRate = damp(this.yawRate, -steer * turn, 4.5, dt);
    let targetV = climb * stats.climb;
    // Columns of rising and sinking air.
    let lift = 0;
    for (const u of this.reg.updrafts) {
      const d = Math.hypot(this.pos.x - u.x, this.pos.z - u.z);
      if (d < u.r + 4) lift = Math.max(lift, 1 - smooth(u.r - 4, u.r + 4, d));
    }
    if (lift > 0 && !this.inUpdraft) {
      this.sfx.updraft();
      this.floatText("Updraft!", "#fff3c4", false);
    }
    this.inUpdraft = lift > 0;
    let sink = 0;
    for (const u of this.reg.downdrafts) {
      const d = Math.hypot(this.pos.x - u.x, this.pos.z - u.z);
      if (d < u.r + 4) sink = Math.max(sink, 1 - smooth(u.r - 4, u.r + 4, d));
    }
    if (sink > 0 && !this.inDowndraft) {
      this.sfx.downdraft();
      this.floatText("Sinking air!", "#bcd4ff", false);
    }
    this.inDowndraft = sink > 0;
    targetV += lift * 20 - sink * 17;
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
    this.vs = damp(this.vs, targetV, lift + sink > 0 ? 3.5 : 2.6, dt) + this.turbV * dt * 3;
    this.yaw += (this.yawRate + this.turbYaw) * dt;

    // Wind, gusts and jet streams carry the airship along.
    this.updateGusts(dt);
    const jet = this.jetFlow(this.v3);
    if (jet > 0.3 && !this.inJet) {
      this.sfx.jet();
      this.floatText("Jet stream!", "#bdf1ff", false);
    }
    this.inJet = jet > 0.3;
    this.drift.copy(this.wind).add(this.gust).add(this.v3);

    // Move.
    this.prev.copy(this.pos);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    this.pos.x += (fx * this.speed + this.knock.x + this.drift.x) * dt;
    this.pos.z += (fz * this.speed + this.knock.z + this.drift.z) * dt;
    this.pos.y += (this.vs + this.knock.y + this.drift.y) * dt;
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
    if (!this.warn) {
      if (this.inStorm > 0.4) this.warn = "Storm! Hold on";
      else if (this.gustState === 1) this.warn = this.gustWarning();
      else if (this.gustState === 2) this.warn = "Gust!";
    }

    this.collide(dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);

    this.checkBoostRings(dt);
    this.hitBalloons();
    this.hitBirds();
    // A delicate parcel is shaken by boost and by storm air.
    if (this.cargo?.fragile) this.wearCargo((this.boosting ? 0.02 : 0) * dt + this.inStorm * 0.03 * dt, false);

    if (this.phase === "playing") {
      if (this.mode === "shift") this.updateShift(dt);
      else this.updateMission(dt);
    }

    // Sound and music.
    this.rain = Math.max(this.rainBase, this.inStorm);
    this.sfx.flight(this.throttle, this.speed, this.boosting, this.phase === "playing");
    this.sfx.weather(this.phase === "playing" ? this.rain : 0);
    const def = this.mission;
    const urgent =
      this.inStorm > 0.4 ||
      (this.mode === "shift" ? (this.carry !== null && this.carry.left < 10) || SHIFT_SECONDS - this.clock < 20 : !!def && def.times[2] - this.mTime < 12) ||
      this.hull < this.stats.hull * 0.3;
    if (this.phase === "playing") music.setIntensity(urgent ? 2 : 1);

    // Trail.
    if (this.boosting || this.speed > max * 0.95) {
      const n = this.boosting ? 3 : 1;
      for (let i = 0; i < n; i++) {
        this.glow.spawn(this.pos.x - fx * 3.2 + (Math.random() - 0.5) * 1.2, this.pos.y - 0.3 + (Math.random() - 0.5) * 1.2, this.pos.z - fz * 3.2 + (Math.random() - 0.5) * 1.2, -fx * 8, (Math.random() - 0.5) * 2, -fz * 8, {
          color: this.boosting ? "#8fd3ff" : this.trail,
          life: 0.6,
          size: this.boosting ? 1.6 : 0.8,
          grow: 0.2,
          alpha: 0.8,
          drag: 1,
        });
      }
    }
  }

  // --- Air ----------------------------------------------------------------------------------------------

  /** Gusts: a warning, then a few seconds of sideways push, then a lull. */
  private updateGusts(dt: number) {
    if (this.gustPower <= 0) {
      this.gust.set(0, 0, 0);
      this.gustState = 0;
      return;
    }
    this.gustT -= dt;
    if (this.gustState === 0) {
      if (this.gustT <= 0) {
        this.gustState = 1;
        this.gustT = 1.3;
        // Across the steady wind, from either side.
        const a = Math.atan2(this.wind.x, this.wind.z) + (Math.random() < 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.7);
        this.gustDir.set(Math.sin(a), 0, Math.cos(a));
        this.sfx.gust(false);
      }
    } else if (this.gustState === 1) {
      if (this.gustT <= 0) {
        this.gustState = 2;
        this.gustT = 2.6;
        this.sfx.gust(true);
        this.shake = Math.max(this.shake, 0.3);
      }
    } else if (this.gustT <= 0) {
      this.gustState = 0;
      this.gustT = 6 + Math.random() * 6;
    }
    const k = this.gustState === 2 ? Math.sin(Math.PI * clamp(1 - this.gustT / 2.6, 0, 1)) : 0;
    this.gust.copy(this.gustDir).multiplyScalar(this.gustPower * k);
    // Dust racing past on the gust.
    if (k > 0.15 && Math.random() < dt * 60) {
      const a = Math.random() * TAU;
      const d = 10 + Math.random() * 40;
      this.smoke.spawn(
        this.pos.x + Math.cos(a) * d - this.gustDir.x * 30,
        this.pos.y + (Math.random() - 0.5) * 24,
        this.pos.z + Math.sin(a) * d - this.gustDir.z * 30,
        this.gustDir.x * (30 + this.gustPower * 2),
        0,
        this.gustDir.z * (30 + this.gustPower * 2),
        { color: "#f2e6d2", life: 1.1, size: 0.5, grow: 0.9, alpha: 0.45, drag: 0.4 },
      );
    }
  }

  /** Which side the coming gust will hit, as the pilot sees it. */
  private gustWarning() {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const ahead = this.gustDir.x * fx + this.gustDir.z * fz;
    const right = this.gustDir.x * -fz + this.gustDir.z * fx;
    if (Math.abs(ahead) > Math.abs(right)) return ahead > 0 ? "Gust coming from behind" : "Gust coming head-on";
    return right > 0 ? "Gust coming from the left" : "Gust coming from the right";
  }

  /** The push of the jet streams at the airship (into `out`); returns how deep in one it is (0..1). */
  private jetFlow(out: THREE.Vector3) {
    out.set(0, 0, 0);
    let deep = 0;
    for (const j of this.jets) {
      const t = clamp(this.v1.copy(this.pos).sub(j.a).dot(j.dir), 0, j.len);
      const d = this.v1.copy(j.a).addScaledVector(j.dir, t).distanceTo(this.pos);
      if (d >= j.r) continue;
      const k = 1 - smooth(j.r * 0.55, j.r, d);
      out.addScaledVector(j.dir, j.speed * k);
      deep = Math.max(deep, k);
    }
    return deep;
  }

  // --- Autopilot (the check script's test pilot) ---------------------------------------------------------

  /** Something soft in the way at a point: a balloon, a bird flock or — with fragile cargo — a storm. */
  private softBlocked(x: number, y: number, z: number, fragile: boolean) {
    for (const b of this.balloons) {
      if (!b.obj.visible) continue;
      const dx = b.pos.x - x;
      const dy = b.pos.y - y;
      const dz = b.pos.z - z;
      const r = b.r + HULL_R + 6;
      if (dx * dx + dy * dy + dz * dz < r * r) return true;
    }
    for (const f of this.flocks) {
      if (!f.active) continue;
      const dx = f.center.x - x;
      const dy = f.center.y - y;
      const dz = f.center.z - z;
      if (dx * dx + dy * dy + dz * dz < 16 * 16) return true;
    }
    if (fragile) {
      for (const s of this.storms) {
        if (Math.hypot(s.x - x, s.z - z) < s.r * 0.85 && Math.abs(s.y - y) < 85) return true;
      }
    }
    return false;
  }

  /**
   * A simple pilot: heads for the next beam, ring or bag; when the straight line is blocked it takes
   * the nearest clear heading to either side, or climbs over what it can; it steers its path over the
   * ground (so wind and gusts don't carry it off) and slows down for tight turns.
   */
  private autopilot() {
    const t = this.target();
    if (!t) return { steer: 0, climb: 0, boost: false, throttle: 0.6 };
    const world = this.world!;
    const p = this.pos;
    const station = t.kind === "pickup" || t.kind === "drop";
    const dx = t.pos.x - p.x;
    const dz = t.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const sp = Math.max(14, this.speed);
    const goalY = t.pos.y;
    const reach = Math.min(Math.max(0, dist - (station ? 12 : 4)), 230);
    const fragile = !!this.cargo?.fragile;
    let best = { off: 0, score: -Infinity, lift: 0, free: 0 };
    for (const off of BOT_OFFSETS) {
      const hx = Math.sin(want + off);
      const hz = Math.cos(want + off);
      let free = reach;
      let lift = 0;
      for (let d = 8; d <= reach; d += 8) {
        const x = p.x + hx * d;
        const z = p.z + hz * d;
        const y = p.y + (goalY - p.y) * Math.min(1, d / Math.max(dist, 1));
        let stop = false;
        if (world.column(x, z, this.col) && y - BOT - 5 < this.col.top && y + TOP + 4 > this.col.bottom) {
          // Over it, if the climb is there before the airship is.
          const over = this.col.top + BOT + 9;
          const can = p.y + (this.stats.climb * 0.7 * Math.max(0, d - 8)) / sp;
          const tooHigh = station && dist - d < 90 && over > goalY + 36;
          if (over <= can && over < CEILING - 6 && !tooHigh) lift = Math.max(lift, over);
          else stop = true;
        }
        if (stop || this.softBlocked(x, y, z, fragile)) {
          free = d;
          break;
        }
      }
      const keep = off !== 0 && this.botSide.until > this.elapsed && Math.sign(off) === Math.sign(this.botSide.off) ? 25 : 0;
      const score = free - Math.abs(off) * 80 + keep;
      if (score > best.score) best = { off, score, lift, free };
      if (off === 0 && free >= reach) break;
    }
    if (best.off !== 0) {
      this.botSide.off = best.off;
      this.botSide.until = this.elapsed + 1.2;
    }
    const boxed = best.free < reach && best.free < 45;
    let ty = Math.max(goalY, best.lift);
    if (boxed) ty = Math.max(ty, p.y + 30);
    // Whatever is dead ahead right now (mid-turn, the rays above look elsewhere).
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    let wall = false;
    for (const d of [10, 22, 36, 54]) {
      if (world.column(p.x + fx * d, p.z + fz * d, this.col) && this.col.top > p.y - BOT - 5 && this.col.bottom < p.y + TOP + 4) {
        if (this.col.top + BOT + 9 < CEILING - 6) ty = Math.max(ty, this.col.top + BOT + 9);
        if (d <= 36) wall = true;
      }
    }
    // Steer the path over the ground, not the nose: wind and gusts are cancelled out.
    const track = Math.atan2(fx * sp + this.drift.x, fz * sp + this.drift.z);
    const err = wrap(want + best.off - track);
    const tight = Math.abs(err) > 0.75 && dist < 150;
    return {
      steer: clamp(-err * 2.6, -1, 1),
      climb: clamp((ty - p.y) / 9, -1, 1),
      throttle: tight || boxed || wall ? 0.25 : 1,
      boost: !fragile && !wall && best.off === 0 && dist > 150 && Math.abs(err) < 0.2 && Math.abs(ty - p.y) < 25,
    };
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
    for (const p of this.paintMats) if (p.kind === "glow") p.mat.emissiveIntensity = glow;
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
    const dmg = Math.max(0, impact - 5) * 0.85 * this.stats.armor;
    this.sfx.bump(impact / 40);
    this.shake = Math.max(this.shake, 0.4 + impact * 0.02);
    this.smoke.burst(this.pos.x, this.pos.y - 1, this.pos.z, 12, 6, { color: "#e8e1d4", life: 1.2, size: 2.5, grow: 5, alpha: 0.6, drag: 2 });
    if (dmg <= 0.5) return;
    this.damage(dmg, side ? "Bump!" : "Hard landing");
  }

  /** Hull damage; the parcel on board takes a share of it. A wrecked hull ends the flight. */
  private damage(dmg: number, label: string) {
    if (this.phase !== "playing") return;
    this.hull = Math.max(0, this.hull - dmg);
    this.hurtFlash = 1;
    this.bumps++;
    this.floatText(`${label} −${Math.round(dmg)}`, "#ffb1a1", false);
    this.wearCargo((dmg / 100) * 1.25);
    if (this.phase !== "playing" || this.hull > 0) return;
    if (this.mode === "shift") this.endShift("hull");
    else this.finishMission(false, "hull");
  }

  /** Takes `frac` (0..1) off the parcel on board; fragile cargo loses nearly twice that, and can break. */
  private wearCargo(frac: number, loud = true) {
    if (frac <= 0 || this.phase !== "playing") return;
    const worn = frac * this.stats.care;
    if (this.mode === "shift") {
      if (this.carry) this.carry.condition = Math.max(0, this.carry.condition - worn);
      return;
    }
    const c = this.cargo;
    if (!c) return;
    c.condition = Math.max(0, c.condition - worn * (c.fragile ? 1.8 : 1));
    if (!c.fragile) return;
    if (loud) this.sfx.crack();
    if (c.condition <= 0) this.finishMission(false, "cargo");
  }

  // --- Rings, traffic, beams ---------------------------------------------------------------------------

  /** True when the airship flew through the ring's hole (either way) during this step. */
  private crossed(r: Ring, slack: number) {
    const d0 = this.v1.copy(this.prev).sub(r.pos).dot(r.normal);
    const d1 = this.v2.copy(this.pos).sub(r.pos).dot(r.normal);
    if (!((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0))) return false;
    const t = d0 / (d0 - d1);
    this.v3.copy(this.prev).lerp(this.pos, t);
    return this.v3.distanceTo(r.pos) < r.r + slack;
  }

  /** The blue rings between the islands: boost for flying through them (not during a ring trial). */
  private checkBoostRings(dt: number) {
    if (this.mode === "mission" && this.mission?.kind === "trial") return;
    for (const r of this.boostRings) {
      if (r.cd > 0) {
        r.cd -= dt;
        continue;
      }
      if (Math.abs(r.pos.x - this.pos.x) > 40 || Math.abs(r.pos.z - this.pos.z) > 40) continue;
      if (this.crossed(r, 3)) {
        r.cd = 22;
        this.ringsHit++;
        this.boost = Math.min(this.stats.boostCap, this.boost + 0.24);
        this.sfx.ring();
        this.ringBurst(r, "#8fd3ff");
        if (this.mode === "shift") {
          this.coins += 2;
          this.floatText("+boost  +2", "#bfe6ff", false);
        } else this.floatText("+boost", "#bfe6ff", false);
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
      if (len < 1e-3) d.set(0, 1, 0);
      else d.multiplyScalar(1 / len);
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
          this.wearCargo(0.03);
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

  // --- Missions ---------------------------------------------------------------------------------------

  private updateMission(dt: number) {
    const def = this.mission;
    if (!def) return;
    const world = this.world!;
    this.mTime += dt;
    if (def.kind === "trial") this.updateTrial();
    else if (def.kind === "collect") this.updateBags();
    else {
      const isl = def.stops ? world.islands[def.stops[this.stopIdx]] : undefined;
      if (isl && this.inZone(isl)) this.reachStop();
    }
    if (this.phase !== "playing") return;
    const left = def.times[2] - this.mTime;
    if (left > 0 && left < 10) {
      const s = Math.ceil(left);
      if (s !== this.lastTick) {
        this.lastTick = s;
        this.sfx.tick(s <= 5);
      }
    }
    if (left <= 0) this.finishMission(false, "time");
  }

  /** The beam at the next stop: load the first parcel, or deliver and (on a round) take the next one on. */
  private reachStop() {
    const def = this.mission;
    const stops = def?.stops;
    if (!def || !stops || this.phase !== "playing") return;
    const world = this.world!;
    const isl = world.islands[stops[this.stopIdx]];
    if (!isl) return;
    const next = world.islands[stops[this.stopIdx + 1]];
    if (this.stopIdx === 0) {
      this.cargo = { condition: 1, fragile: def.kind === "fragile" };
      if (this.parcel) this.parcel.visible = true;
      this.sfx.pickup();
      this.glow.burst(isl.pad.x, isl.pad.y + 6, isl.pad.z, 30, 10, { color: "#ffd56a", life: 1, size: 1.6, grow: 0.4, alpha: 1, drag: 2 });
      this.showToast({ title: def.kind === "fragile" ? "Fragile parcel loaded" : "Parcel loaded", lines: [`To ${next?.name ?? ""}`], tone: "info" }, 2.2);
      this.stopIdx = 1;
      return;
    }
    const last = this.stopIdx >= stops.length - 1;
    this.sfx.deliver(last);
    this.glow.burst(isl.pad.x, isl.pad.y + 8, isl.pad.z, 50, 14, { color: "#8fd3ff", life: 1.2, size: 1.8, grow: 0.4, alpha: 1, drag: 1.8 });
    this.glow.burst(isl.pad.x, isl.pad.y + 8, isl.pad.z, 30, 10, { color: "#ffd56a", life: 1.4, size: 1.4, grow: 0.3, alpha: 1, drag: 1.4, gravity: 3 });
    this.floatText("Delivered!", "#ffd56a", true);
    this.stopIdx++;
    if (last) {
      this.finishMission(true, "done");
      return;
    }
    // A postal round: the next parcel comes aboard at the same pad.
    this.cargo = { condition: 1, fragile: false };
    this.showToast({ title: `Delivered to ${isl.name}`, lines: [`Next: ${next?.name ?? ""}`], tone: "good" }, 2.2);
  }

  /** Rings spaced along a smooth curve through the course's points (a loop when it is closed). */
  private buildCourse(course: NonNullable<MissionDef["course"]>) {
    const set = this.trialSet;
    this.trialRings = [];
    this.trialNext = 0;
    if (!set) return;
    const closed = !!course.closed;
    const curve = new THREE.CatmullRomCurve3(
      course.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      closed,
      "centripetal",
    );
    const n = clamp(Math.round(curve.getLength() / course.spacing), 4, TRIAL_RINGS);
    for (let i = 0; i < n; i++) {
      const u = closed ? i / n : i / (n - 1);
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const yaw = Math.atan2(t.x, t.z);
      this.clearSpot(p, 20);
      set.place(i, p, yaw);
      this.trialRings.push({ pos: p, normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), yaw, r: set.holeR, cd: 0, halo: HALO_NEXT });
    }
    set.count = n;
  }

  /** How many rings a trial counts: a closed course ends through its first ring again. */
  private get trialTotal() {
    return this.trialRings.length + (this.mission?.course?.closed ? 1 : 0);
  }

  private updateTrial() {
    const n = this.trialRings.length;
    if (!n) return;
    const ring = this.trialRings[this.trialNext % n];
    if (!this.crossed(ring, RING_SLACK)) return;
    this.trialNext++;
    this.ringsHit++;
    const finish = this.trialNext >= this.trialTotal;
    this.sfx.ring(finish);
    this.ringBurst(ring, finish ? "#ffd56a" : "#ffb4e1");
    this.boost = Math.min(this.stats.boostCap, this.boost + 0.3);
    if (finish) this.finishMission(true, "done");
  }

  private placeBags(points: [number, number, number][]) {
    this.bagCount = Math.min(points.length, this.bags.length);
    this.bagsGot = 0;
    this.bags.forEach((b, i) => {
      b.got = i >= this.bagCount;
      b.obj.visible = !b.got;
      if (b.got) return;
      b.pos.set(points[i][0], points[i][1], points[i][2]);
      this.clearSpot(b.pos, 12);
      b.obj.position.copy(b.pos);
    });
  }

  private nearestBag() {
    let best: Bag | null = null;
    let bd = Infinity;
    for (const b of this.bags) {
      if (b.got) continue;
      const d = b.pos.distanceToSquared(this.pos);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private updateBags() {
    for (const b of this.bags) {
      if (b.got || b.pos.distanceToSquared(this.pos) > BAG_R * BAG_R) continue;
      b.got = true;
      b.obj.visible = false;
      this.bagsGot++;
      this.sfx.bag(this.bagsGot);
      this.boost = Math.min(this.stats.boostCap, this.boost + 0.15);
      this.glow.burst(b.pos.x, b.pos.y, b.pos.z, 34, 11, { color: "#ffd56a", life: 1, size: 1.5, grow: 0.3, alpha: 1, drag: 2 });
      this.floatText(`${this.bagsGot} / ${this.bagCount}`, "#ffd56a", true);
      if (this.bagsGot >= this.bagCount) {
        this.finishMission(true, "done");
        return;
      }
    }
  }

  private finishMission(won: boolean, reason: MissionResult["reason"]) {
    const def = this.mission;
    if (this.phase !== "playing" || !def) return;
    const cargo = this.cargo?.condition ?? 1;
    const stars = won ? starsFor(def, this.mTime, cargo) : 0;
    this.releaseInput();
    this.boosting = false;
    this.arrow.visible = false;
    this.hideBeams();
    if (this.parcel) this.parcel.visible = false;
    music.setIntensity(0);
    if (won) this.sfx.medal(stars);
    else if (reason === "hull") this.sfx.bump(1);
    else this.sfx.fail();
    this.lastResult = { kind: "mission", id: def.id, won, stars, time: this.mTime, reason, cargo, rings: this.ringsHit, bumps: this.bumps };
    this.setPhase("results");
    this.events.result(this.lastResult);
  }

  // --- Free flight ------------------------------------------------------------------------------------

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

  private makeOffer(from: number): Offer | null {
    const region = this.reg;
    const A = region.islands[from];
    const weighted: { id: number; w: number }[] = [];
    for (const i of region.islands) {
      if (i.id === from) continue;
      const d = Math.hypot(i.x - A.x, i.z - A.z);
      if (d < 200) continue;
      weighted.push({ id: i.id, w: d > 1100 ? 0.4 : 1 });
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
    const pay = Math.round((10 + dist * 0.04 + climb * 0.06) * region.pay * (express ? 1.5 : 1));
    return { from, to, dist, pay, time: Math.ceil(time), express };
  }

  /** Two jobs on the board: one from where you are, one from somewhere nearby. */
  private refreshOffers(at: number | null) {
    const world = this.world!;
    const pool = this.reg.islands.map((i) => i.id);
    const away = (id: number) => Math.hypot(world.islands[id].x - this.pos.x, world.islands[id].z - this.pos.z);
    let first = at;
    if (first === null || !pool.includes(first)) first = pool.reduce((a, b) => (away(b) < away(a) ? b : a), pool[0]);
    const offers: Offer[] = [];
    const a = this.makeOffer(first);
    if (a) offers.push(a);
    const others = pool
      .filter((id) => id !== first && id !== a?.to)
      .sort((x, y) => away(x) - away(y))
      .slice(0, 3);
    if (others.length) {
      const b = this.makeOffer(others[Math.floor(Math.random() * others.length)]);
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
    this.lastResult = { kind: "shift", region: this.reg.id, earned: this.coins, delivered: this.delivered, onTime: this.onTime, late: this.late, bestChain: this.bestChain, rings: this.ringsHit, reason };
    this.setPhase("results");
    this.events.result(this.lastResult);
  }

  // --- Ambient world -------------------------------------------------------------------------------------

  private updateAmbient(dt: number) {
    const world = this.world!;
    world.update(dt);
    this.updrafts?.update(dt);
    this.downdrafts?.update(dt);
    this.jetTubes?.update(dt);
    for (const b of this.beams) b?.update(dt);
    if (this.haloMaterial) this.haloMaterial.uniforms.uTime.value += dt;
    this.updateBalloons(dt);
    this.updateFlocks(dt);
    this.updateStorms(dt);
    this.updateBeams();
    this.updateBagObjects(dt);
    this.updateHalos();
    // Motes rising in nearby updrafts, sinking in downdrafts, racing along jet streams.
    for (const u of this.reg.updrafts) this.columnMotes(u, dt, 1);
    for (const u of this.reg.downdrafts) this.columnMotes(u, dt, -1);
    for (const j of this.jets) {
      if (Math.random() > dt * 26) continue;
      const t = Math.random() * j.len;
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * j.r * 0.8;
      this.v1.copy(j.a).addScaledVector(j.dir, t);
      if (this.v1.distanceToSquared(this.pos) > 420 * 420) continue;
      this.glow.spawn(this.v1.x + Math.cos(a) * rr, this.v1.y + Math.sin(a) * rr, this.v1.z + Math.sin(a + 1.5) * rr, j.dir.x * 46, j.dir.y * 46, j.dir.z * 46, { color: "#bdf1ff", life: 1.6, size: 0.8, grow: 0.4, alpha: 0.7 });
    }
    this.glow.update(dt);
    this.smoke.update(dt);
    this.texts = this.texts.filter((t) => (t.age += dt) < t.life);
    if (this.toast) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast = null;
    }
  }

  private columnMotes(u: { x: number; z: number; r: number }, dt: number, dir: number) {
    if (Math.abs(u.x - this.pos.x) > 260 || Math.abs(u.z - this.pos.z) > 260) return;
    if (Math.random() > dt * 22) return;
    const a = Math.random() * TAU;
    const rr = Math.sqrt(Math.random()) * u.r;
    this.glow.spawn(u.x + Math.cos(a) * rr, clamp(this.pos.y + (Math.random() - 0.5) * 120, 10, CEILING), u.z + Math.sin(a) * rr, 0, dir * (16 + Math.random() * 8), 0, {
      color: dir > 0 ? "#fff1c9" : "#a9c8ff",
      life: 2.4,
      size: 0.9,
      grow: 0.5,
      alpha: 0.7,
    });
  }

  private updateBalloons(dt: number) {
    const world = this.world!;
    for (const b of this.balloons) {
      if (!b.obj.visible) continue;
      b.bob += dt;
      b.pos.addScaledVector(b.vel, dt);
      b.vel.lerp(this.v1.copy(this.wind).multiplyScalar(0.4), 1 - Math.exp(-0.2 * dt));
      // Keep clear of islands: bob upward if drifting into one.
      if (world.column(b.pos.x, b.pos.z, this.col) && b.pos.y + b.h > this.col.bottom - 4 && b.pos.y - b.h < this.col.top + 4) b.pos.y = Math.min(CEILING - 10, b.pos.y + 6 * dt);
      if (Math.hypot(b.pos.x, b.pos.z) > WORLD_RADIUS + 150) this.respawnBalloon(b, Math.random);
      b.obj.position.set(b.pos.x, b.pos.y - b.h / 2 + Math.sin(b.bob * 0.8) * 1.2, b.pos.z);
      b.obj.rotation.y += b.spin * dt;
    }
  }

  private updateFlocks(dt: number) {
    for (const f of this.flocks) {
      if (!f.active) continue;
      f.cd = Math.max(0, f.cd - dt);
      f.scatter = Math.max(0, f.scatter - dt);
      f.angle += (f.speed / f.radius) * f.dir * dt;
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
        if (this.phase === "playing") this.sfx.chirp(1 - smooth(30, 160, f.center.distanceTo(this.pos)));
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
      if (this.phase !== "playing" || this.countdown > 0) continue;
      this.sfx.thunder(near, Math.min(2.2, d / 340));
      if (this.inStorm > 0.5 && Math.random() < 0.35) {
        this.sfx.zap();
        this.glow.burst(this.pos.x, this.pos.y + 2, this.pos.z, 30, 16, { color: "#d8ecff", life: 0.5, size: 1.2, alpha: 1, drag: 3 });
        this.shake = Math.max(this.shake, 0.8);
        this.damage(6, "Lightning");
      }
    }
  }

  private hideBeams() {
    for (const b of this.beams) if (b) b.mesh.visible = false;
    for (const m of this.pickupMarkers) m.visible = false;
  }

  private showBeam(id: number, color: string, alpha: number, marker: number) {
    const b = this.beams[id];
    if (b) {
      b.mesh.visible = true;
      b.uniforms.uColor.value.set(color);
      b.uniforms.uAlpha.value = alpha;
    }
    const m = this.pickupMarkers[marker];
    const isl = this.world!.islands[id];
    if (m && isl) {
      m.visible = true;
      m.position.set(isl.pad.x, isl.pad.y + 7 + Math.sin(this.elapsed * 2 + marker) * 1.2, isl.pad.z);
      m.rotation.y = this.elapsed * 1.2 + marker;
    }
  }

  private updateBeams() {
    this.hideBeams();
    if (this.phase !== "playing" && this.phase !== "paused") return;
    if (this.mode === "mission") {
      const stops = this.mission?.stops;
      if (!stops || this.stopIdx >= stops.length) return;
      if (this.stopIdx === 0) this.showBeam(stops[0], "#ffd25a", 1, 0);
      else this.showBeam(stops[this.stopIdx], "#7cc4ff", 1.1, -1);
    } else if (this.carry) this.showBeam(this.carry.to, "#7cc4ff", 1.1, -1);
    else this.offers.forEach((o, i) => this.showBeam(o.from, o.express ? "#ffb347" : "#ffd25a", 1, i));
  }

  private updateBagObjects(dt: number) {
    for (const b of this.bags) {
      if (b.got) continue;
      b.phase += dt;
      b.obj.position.set(b.pos.x, b.pos.y - 1.5 + Math.sin(b.phase * 1.4) * 1.2, b.pos.z);
      b.obj.rotation.y = b.phase * 0.9;
    }
  }

  private readonly hm = new THREE.Matrix4();
  private readonly hq = new THREE.Quaternion();
  private readonly hs = new THREE.Vector3();

  private updateHalos() {
    const halos = this.halos;
    if (!halos) return;
    const zero = this.hm.makeScale(0, 0, 0);
    for (let i = 0; i < HALOS; i++) halos.setMatrixAt(i, zero);
    const put = (slot: number, pos: THREE.Vector3, yaw: number, size: number, color: THREE.Color) => {
      this.hq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      this.hs.setScalar(size);
      this.hm.compose(pos, this.hq, this.hs);
      halos.setMatrixAt(slot, this.hm);
      halos.setColorAt(slot, color);
    };
    const playing = this.phase === "playing" || this.phase === "paused";
    const trial = this.mode === "mission" && this.mission?.kind === "trial" && this.phase !== "menu";
    if (!trial) for (const r of this.boostRings) put(r.halo, r.pos, r.yaw, r.r * 2.15, r.cd > 0 ? HALO_DIM : HALO_BLUE);
    if (trial && playing) {
      const n = this.trialRings.length;
      const total = this.trialTotal;
      const next = this.trialRings[this.trialNext % n];
      const after = this.trialRings[(this.trialNext + 1) % n];
      if (after && this.trialNext + 1 < total) put(HALO_AFTER, after.pos, after.yaw, after.r * 2.15, HALO_DIM);
      if (next && this.trialNext < total) put(HALO_NEXT, next.pos, next.yaw, next.r * 2.15 * (1 + Math.sin(this.elapsed * 6) * 0.04), this.trialNext === total - 1 ? HALO_GOLD : HALO_RING);
    }
    // A gold disc behind every mail bag, turned to the camera.
    const cam = this.camera.position;
    this.bags.forEach((b, i) => {
      if (b.got) return;
      put(HALO_BAGS + i, b.pos, Math.atan2(cam.x - b.pos.x, cam.z - b.pos.z), 15 + Math.sin(b.phase * 3) * 1.2, HALO_GOLD);
    });
    halos.instanceMatrix.needsUpdate = true;
    if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
  }

  // --- Lighting and camera ---------------------------------------------------------------------------------

  private readonly stormGrey = new THREE.Color("#5d6478");

  private updateLighting(dt: number) {
    const reg = this.reg;
    const flying = this.phase === "playing" || this.phase === "paused" || this.phase === "results";
    const look =
      flying && this.mode === "mission" && this.mission
        ? skyLook(this.mission.sky, this.mission.sky, 0, this.look)
        : flying && this.mode === "shift"
          ? skyLook(reg.sky, reg.skyTo, this.clock / SHIFT_SECONDS, this.look)
          : skyLook(reg.sky, reg.sky, 0, this.look);
    this.sky.apply(look);
    this.sun.color.copy(look.sun);
    this.sun.intensity = look.sunIntensity;
    this.hemi.color.copy(look.hemiSky);
    this.hemi.groundColor.copy(look.hemiGround);
    this.hemi.intensity = look.hemiIntensity;
    this.fog.color.copy(look.horizon);
    this.lamp.intensity = look.night * 900;
    // Storms and the cloud sea close the view in.
    const storm = this.phase === "playing" ? this.inStorm : 0;
    const cloud = smooth(16, -2, this.camera.position.y);
    if (storm > 0) {
      this.fog.color.lerp(this.stormGrey, storm * 0.7);
      this.sky.uniforms.uHorizon.value.lerp(this.stormGrey, storm * 0.7);
      this.sky.uniforms.uTop.value.lerp(this.stormGrey, storm * 0.6);
      this.sun.intensity *= 1 - storm * 0.6;
    }
    this.fog.near = lerp(lerp(320 * look.haze, 60, storm), 4, cloud);
    this.fog.far = lerp(lerp(1700 * (0.3 + 0.7 * look.haze), 520, storm), 140, cloud);
    if (cloud > 0) this.fog.color.lerp(look.cloudLit, cloud * 0.8);
    this.sky.uniforms.uFlash.value = this.flash * 0.5;
    this.hemi.intensity += this.flash * 1.2;
    this.sky.mesh.position.copy(this.camera.position);
    this.stars.set(look.night * (1 - storm * 0.7), this.camera.position);
    this.sea.update(dt, this.camera.position, look, this.flash);
    this.puffs?.apply(look, this.flash);
    this.rainFx.update(dt, 60, this.phase === "playing" ? this.rain : this.phase === "paused" ? 0 : this.rainBase * 0.6);
    // Lamps, lit windows and lantern balloons at night.
    const glow = smooth(0.04, 0.6, look.night);
    this.glows.begin(glow);
    if (glow > 0.02 && this.world) {
      for (const l of this.world.lights) this.glows.add(l.pos.x, l.pos.y, l.pos.z, l.size, l.warm ? GLOW_WARM : GLOW_COOL);
      for (const b of this.balloons) if (b.obj.visible) this.glows.add(b.pos.x, b.pos.y - b.h * 0.25, b.pos.z, 16, GLOW_BALLOON);
      for (const b of this.bags) if (!b.got) this.glows.add(b.pos.x, b.pos.y, b.pos.z, 12, GLOW_BAG);
    }
    this.glows.end();
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
      if (this.world!.column(this.v1.x, this.v1.z, this.col) && this.v1.y < this.col.top + 3 && this.v1.y > this.col.bottom - 3) this.v1.y = this.col.top + 3;
      if (this.camSnap) this.camPos.copy(this.v1);
      else this.camPos.lerp(this.v1, 1 - Math.exp(-(this.keys.look ? 14 : 5.5) * dt));
      this.v2.set(this.pos.x + fx * (8 + this.speed * 0.35) * look, this.pos.y + 1.6 + clamp(this.vs * 0.25, -4, 4), this.pos.z + fz * (8 + this.speed * 0.35) * look);
      if (this.camSnap) this.camLook.copy(this.v2);
      else this.camLook.lerp(this.v2, 1 - Math.exp(-9 * dt));
      fovTarget = 60 + sp * 9 + (this.boosting ? 8 : 0);
      this.streaks.update(dt, this.speed, this.countdown > 0 ? 0 : smooth(26, 50, this.speed) + (this.boosting ? 0.6 : 0));
    } else {
      this.orbit += dt * (this.showcase ? 0.22 : 0.06);
      const hub = this.world!.islands[0];
      if (this.showcase && this.phase === "menu") {
        // The hangar: a slow turn round the airship, close in.
        this.v1.set(this.pos.x + Math.sin(this.orbit) * 15, this.pos.y + 3.2, this.pos.z + Math.cos(this.orbit) * 15);
        this.v2.set(this.pos.x, this.pos.y - 0.6, this.pos.z);
      } else {
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
    // The hangar's panel covers part of the screen: slide the view into the rest.
    const s = this.showShift;
    s.cx = damp(s.cx, s.x, 6, dt);
    s.cy = damp(s.cy, s.y, 6, dt);
    const { w, h } = this.view;
    if (Math.abs(s.cx) + Math.abs(s.cy) > 1e-3) cam.setViewOffset(w, h, -s.cx * w, s.cy * h, w, h);
    else if (cam.view) cam.clearViewOffset();
    // The route arrow floats above the airship.
    const t = playing && this.countdown <= 0 ? this.target() : null;
    if (t) {
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

  /** What the player should fly to next (one shared object: copy what you keep). */
  private target(): Target | null {
    const world = this.world!;
    const t = this.tgt;
    const station = (id: number, kind: Target["kind"], label: string) => {
      const isl = world.islands[id];
      if (!isl) return null;
      t.pos.set(isl.pad.x, isl.pad.y + 12, isl.pad.z);
      t.kind = kind;
      t.label = label || isl.name;
      return t;
    };
    if (this.mode === "mission") {
      const def = this.mission;
      if (!def) return null;
      if (def.kind === "trial") {
        const n = this.trialRings.length;
        if (!n || this.trialNext >= this.trialTotal) return null;
        t.pos.copy(this.trialRings[this.trialNext % n].pos);
        t.kind = "ring";
        t.label = this.trialNext === this.trialTotal - 1 ? "Finish" : `Ring ${this.trialNext + 1}`;
        return t;
      }
      if (def.kind === "collect") {
        const b = this.nearestBag();
        if (!b) return null;
        t.pos.copy(b.pos);
        t.kind = "bag";
        t.label = "Mail bag";
        return t;
      }
      const stops = def.stops;
      if (!stops || this.stopIdx >= stops.length) return null;
      return this.stopIdx === 0 ? station(stops[0], "pickup", `Load · ${world.islands[stops[0]]?.name ?? ""}`) : station(stops[this.stopIdx], "drop", "");
    }
    if (this.carry) return station(this.carry.to, "drop", "");
    let best: Offer | null = null;
    let bd = Infinity;
    for (const o of this.offers) {
      const d = this.distTo(o.from);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best ? station(best.from, "pickup", `Pick up · ${world.islands[best.from].name}`) : null;
  }

  // --- HUD, overlay and minimap ---------------------------------------------------------------------------

  private showToast(t: Omit<Toast, "id">, seconds = 3.2) {
    this.toast = { ...t, id: ++this.toastId };
    this.toastT = seconds;
  }

  private floatText(text: string, color: string, big: boolean) {
    if (this.texts.length > 12) this.texts.shift();
    this.texts.push({ text, color, pos: this.pos.clone().add(new THREE.Vector3(0, 5, 0)), age: 0, life: big ? 1.8 : 1.4, big });
  }

  private missionHud(): MissionHud | null {
    const def = this.mission;
    const world = this.world;
    if (this.mode !== "mission" || !def || !world) return null;
    let done = 0;
    let total = 1;
    let goal = "";
    if (def.kind === "trial") {
      total = this.trialTotal;
      done = Math.min(this.trialNext, total);
      goal = done >= total - 1 && def.course?.closed ? "Back through the first ring" : "Fly through the glowing ring";
    } else if (def.kind === "collect") {
      total = this.bagCount;
      done = this.bagsGot;
      goal = "Collect the mail bags";
    } else if (def.stops) {
      total = def.stops.length - 1;
      done = clamp(this.stopIdx - 1, 0, total);
      const name = world.islands[def.stops[Math.min(this.stopIdx, def.stops.length - 1)]]?.name ?? "";
      goal = this.stopIdx === 0 ? `Load the parcel at ${name}` : `Deliver to ${name}`;
    }
    const t = this.phase === "playing" || this.phase === "paused" ? this.target() : null;
    const cargo = this.cargo?.condition ?? 1;
    return {
      id: def.id,
      kind: def.kind,
      name: def.name,
      time: this.mTime,
      limit: def.times[2],
      t3: def.times[0],
      t2: def.times[1],
      stars: this.mTime > def.times[2] ? 0 : starsFor(def, this.mTime, cargo),
      done,
      total,
      goal,
      dist: t ? Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : 0,
      cargo: this.cargo ? this.cargo.condition : null,
    };
  }

  private emitHud() {
    const world = this.world;
    const hours = DAY_START_HOUR + clamp(this.clock / SHIFT_SECONDS, 0, 1) * DAY_HOURS;
    const hh = Math.floor(hours);
    const mm = Math.floor(((hours - hh) * 60) / 5) * 5;
    const name = (id: number) => world?.islands[id]?.name ?? "";
    let prompt: string | null = null;
    if (this.phase === "playing" && world && this.countdown <= 0) {
      if (this.mode === "mission") {
        const stops = this.mission?.stops;
        const isl = stops ? world.islands[stops[this.stopIdx]] : undefined;
        if (isl && this.inZone(isl, true)) prompt = this.stopIdx === 0 ? "Press E to load the parcel" : "Press E to drop the parcel";
      } else if (this.carry) {
        if (this.inZone(world.islands[this.carry.to], true)) prompt = "Press E to drop the parcel";
      } else if (this.offers.some((o) => this.inZone(world.islands[o.from], true))) prompt = "Press E to pick up";
    }
    this.events.hud({
      mode: this.mode,
      speed: this.speed,
      alt: Math.max(0, this.pos.y - BOT),
      throttle: this.throttle,
      boost: this.boost,
      boostCap: this.stats.boostCap,
      boosting: this.boosting,
      hull: this.hull,
      maxHull: this.stats.hull,
      heading: ((-this.yaw * 180) / Math.PI + 540) % 360,
      countdown: this.phase === "playing" || this.phase === "paused" ? Math.max(0, this.countdown) : 0,
      warn: this.warn,
      prompt,
      toast: this.toast,
      mission: this.missionHud(),
      coins: this.coins,
      clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      dayFrac: clamp(this.clock / SHIFT_SECONDS, 0, 1),
      carry: this.carry
        ? { from: name(this.carry.from), to: name(this.carry.to), dist: this.distTo(this.carry.to), pay: this.carry.pay, time: this.carry.time, express: this.carry.express, left: this.carry.left, condition: this.carry.condition }
        : null,
      offers: this.offers.map((o) => ({ from: name(o.from), to: name(o.to), dist: o.dist, pay: o.pay, time: o.time, express: o.express, away: this.distTo(o.from) })),
      chain: this.chain,
      delivered: this.delivered,
    });
  }

  private distTo(id: number) {
    const isl = this.world?.islands[id];
    if (!isl) return 0;
    return Math.hypot(isl.pad.x - this.pos.x, isl.pad.z - this.pos.z);
  }

  private drawOverlay(dt: number) {
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
    const t = this.countdown <= 0 ? this.target() : null;
    if (t) {
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
    // Storms, air columns and jet streams.
    for (const s of this.storms) {
      const [x, y] = map(s.x, s.z);
      ctx.fillStyle = "rgba(90,96,120,0.5)";
      ctx.beginPath();
      ctx.arc(x, y, s.r * k, 0, TAU);
      ctx.fill();
    }
    const columns = (list: { x: number; z: number; r: number }[], color: string) => {
      ctx.strokeStyle = color;
      for (const u of list) {
        const [x, y] = map(u.x, u.z);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, u.r * k), 0, TAU);
        ctx.stroke();
      }
    };
    columns(this.reg.updrafts, "rgba(255,241,201,0.6)");
    columns(this.reg.downdrafts, "rgba(140,180,255,0.7)");
    ctx.strokeStyle = "rgba(150,235,255,0.55)";
    ctx.lineWidth = 2;
    for (const j of this.jets) {
      const [x0, y0] = map(j.a.x, j.a.z);
      const [x1, y1] = map(j.a.x + j.dir.x * j.len, j.a.z + j.dir.z * j.len);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    // Islands, islets and rock pillars.
    const t = this.phase === "playing" || this.phase === "paused" ? this.target() : null;
    const stops = this.mode === "mission" ? this.mission?.stops : undefined;
    const carryTo = this.mode === "shift" ? this.carry?.to : stops && this.stopIdx > 0 ? stops[this.stopIdx] : undefined;
    const pickups = new Set(this.mode === "shift" ? (this.carry ? [] : this.offers.map((o) => o.from)) : stops && this.stopIdx === 0 ? [stops[0]] : []);
    world.islands.forEach((isl, i) => {
      const [x, y] = map(isl.x, isl.z);
      if (isl.name === "peak") {
        const s = Math.max(2, isl.radius * 0.75 * k);
        ctx.fillStyle = "rgba(196,148,110,0.75)";
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
        return;
      }
      const r = Math.max(isl.def ? 3 : 1.5, isl.radius * k);
      ctx.fillStyle = !isl.def ? "rgba(248,241,227,0.25)" : "rgba(248,241,227,0.7)";
      if (i === carryTo) ctx.fillStyle = "#7cc4ff";
      else if (pickups.has(i)) ctx.fillStyle = "#ffd25a";
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
    // Mail bags, and the next ring.
    ctx.fillStyle = "#ffd25a";
    for (const b of this.bags) {
      if (b.got) continue;
      const [x, y] = map(b.pos.x, b.pos.z);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.fill();
    }
    if (t && t.kind === "ring") {
      const [x, y] = map(t.pos.x, t.pos.z);
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

  // --- Resize -----------------------------------------------------------------------------------------------

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
}
