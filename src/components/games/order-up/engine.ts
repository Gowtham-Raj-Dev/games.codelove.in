import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, Pool, type Fit, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { KITCHEN_BOSSA } from "../shared/songs";
import { Sfx } from "./audio";
import {
  BURN_DELAY,
  COOK_TIME,
  CRATES,
  dayPlan,
  LAYERS,
  NO_UPGRADES,
  recipeById,
  recipePatience,
  recipePrice,
  recipesFor,
  starsFor,
  wasteCost,
  type CrateId,
  type DayPlan,
  type Layer,
  type Recipe,
  type Upgrades,
} from "./data";
import { bubbleGeometry, disposeSprite, Particles, Ring, textSprite } from "./fx";
import { CUSTOMERS, M, MODELS } from "./manifest";

// --- Layout (restaurant-bits units: a counter is 2 wide and 1 tall) ---------------------------------

const TOP = 1;
const BACK_Z = 0;
const FRONT_Z = 2.06;
const CRATE_W = 1.04;
const DOOR_IN_X = -6;
const DOOR_OUT_X = 6;
const WALL_Z = -6.25;
const AISLE_Z = -3.15;
const CUSTOMER_H = 1.95;
const PI = Math.PI;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Where the kitchen's pieces go. Landscape screens get one long line of crates; portrait screens a
 * narrower kitchen with the crates in two rows, closer counter slots and the bin on the counter.
 */
interface Layout {
  kind: "wide" | "tall";
  slotX: number[];
  /** Where customers stand behind the counter. */
  slotZ: number;
  /** Crate positions on the back counter, in CRATES order. */
  crates: THREE.Vector3[];
  backCounters: number[];
  frontCounters: number[];
  stoveX: number;
  plate: THREE.Vector3;
  bin: THREE.Vector3;
  binScale: number;
  queue: THREE.Vector3[];
  fit: THREE.Vector3[];
  decor: [string, number, number, number, number][];
  stools: number[];
  jar: THREE.Vector3;
  pitch: number;
  fov: number;
}

function wideLayout(): Layout {
  return {
    kind: "wide",
    slotX: [-3.15, -1.05, 1.05, 3.15],
    slotZ: -1.8,
    crates: [0, 1, 2, 3, 4, 5, 6].map((i) => V((i - 3) * 1.1, TOP, 0.14)),
    backCounters: [-3, -1, 1, 3],
    frontCounters: [-1, 1, 3],
    stoveX: -3,
    plate: V(0.35, TOP + 0.15, FRONT_Z + 0.1),
    bin: V(4.75, 0, 2.15),
    binScale: 1,
    queue: [V(-5.25, 0, -2.2), V(-5.9, 0, -3.25), V(-6.45, 0, -4.3)],
    fit: [V(-4.2, 0.95, 3.2), V(4.2, 0.95, 3.2), V(-3.9, CUSTOMER_H + 1.75, -1.8), V(3.9, CUSTOMER_H + 1.75, -1.8), V(5.3, 1.5, 2.2)],
    decor: [
      [M.fridge, -5.6, 0, 0.1, 0],
      [M.counterB, -5, 0, FRONT_Z, 0],
      [M.counterA, -7, 0, FRONT_Z, 0],
      [M.counterA, -7.6, 0, BACK_Z, PI],
      [M.oven, 6.4, 0, 0.1, 0],
      [M.counterB, 5, 0, BACK_Z, PI],
      [M.counterA, 7, 0, FRONT_Z, 0],
      [M.register, 5, TOP, BACK_Z - 0.1, PI],
      [M.menu, 5.55, TOP, BACK_Z + 0.55, PI + 0.3],
      [M.ketchup, 1.75, TOP, FRONT_Z - 0.45, 0],
      [M.mustard, 2.05, TOP, FRONT_Z - 0.6, 0],
    ],
    stools: [-4.2, -2.1, 0, 2.1, 4.2],
    jar: V(2.75, TOP, FRONT_Z - 0.45),
    pitch: 49,
    fov: 34,
  };
}

function tallLayout(): Layout {
  return {
    kind: "tall",
    slotX: [-2.4, -0.8, 0.8, 2.4],
    slotZ: -2.3,
    crates: [0, 1, 2, 3, 4, 5, 6].map((i) => (i < 4 ? V((i - 1.5) * 1.12, TOP, 0.5) : V((i - 5) * 1.12, TOP, -0.52))),
    backCounters: [-2, 0, 2],
    frontCounters: [0, 2],
    stoveX: -2,
    plate: V(0.1, TOP + 0.15, FRONT_Z + 0.1),
    bin: V(2.2, TOP, FRONT_Z + 0.05),
    binScale: 0.72,
    queue: [V(-3.8, 0, -2.9), V(-4.4, 0, -3.8), V(-4.9, 0, -4.7)],
    fit: [V(-3.0, 0.95, 3.2), V(3.0, 0.95, 3.2), V(-3.05, CUSTOMER_H + 1.75, -2.3), V(3.05, CUSTOMER_H + 1.75, -2.3)],
    decor: [
      [M.fridge, -4.1, 0, 0.1, 0],
      [M.counterB, -4, 0, FRONT_Z, 0],
      [M.counterA, 4, 0, FRONT_Z, 0],
      [M.counterB, 4, 0, BACK_Z, PI],
      [M.register, 4, TOP, BACK_Z - 0.1, PI],
      [M.ketchup, 1.2, TOP, FRONT_Z - 0.62, 0],
      [M.mustard, 1.45, TOP, FRONT_Z - 0.4, 0],
    ],
    stools: [-3.2, -1.6, 0, 1.6, 3.2],
    jar: V(3.4, TOP, FRONT_Z - 0.4),
    pitch: 60,
    fov: 42,
  };
}
const WALK_SPEED = 1.75;
/** Burners on the stove (relative to its centre), in the order pans are added. */
const BURNERS = [
  new THREE.Vector2(-0.48, 0.42),
  new THREE.Vector2(0.48, 0.42),
  new THREE.Vector2(-0.48, -0.56),
  new THREE.Vector2(0.48, -0.56),
];
const GRILL_Y = 1.25;
const MAX_LAYERS = 10;

/** How each ingredient sits on the one below it (models are grounded at y = 0). */
const STACK: Record<Layer, { lift: number; adv: number }> = {
  bunBottom: { lift: 0, adv: 0.17 },
  patty: { lift: -0.01, adv: 0.17 },
  veggie: { lift: -0.01, adv: 0.19 },
  cheese: { lift: -0.075, adv: 0.03 },
  lettuce: { lift: -0.02, adv: 0.05 },
  tomato: { lift: -0.005, adv: 0.085 },
  onion: { lift: -0.015, adv: 0.07 },
  bunTop: { lift: -0.015, adv: 0.29 },
};
const PITCH: Record<Layer, number> = { bunBottom: 0, bunTop: 1, patty: -2, veggie: -1, cheese: 3, lettuce: 5, tomato: 4, onion: 6 };

/** Bubble: exploded mini stack. */
const MINI = 0.8;
const MINI_GAP = 0.17;
const BUBBLE_W = 1.3;
const TAIL = 0.14;

const ACCENT = new THREE.Color("#f472b6");
const GREEN = new THREE.Color("#22c55e");
const WHITE = new THREE.Color("#ffffff");

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const backOut = (t: number) => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const angleLerp = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};

// --- Public types -----------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "dayover" | "error";

/** Keyboard / button actions. */
export type Action = CrateId | "take" | "serve" | "bin";

export type PlateState = "empty" | "building" | "ready" | "wrong";

export interface Hud {
  day: number;
  rush: boolean;
  timeLeft: number;
  dayLength: number;
  closing: boolean;
  earned: number;
  target: number;
  combo: number;
  served: number;
  lost: number;
  plate: Layer[];
  plateState: PlateState;
  /** Recipes of the customers waiting in line (not yet at the counter). */
  queue: string[];
  hint: string | null;
}

export interface Label {
  id: string;
  x: number;
  y: number;
  text: string;
  key: string;
  /** Day it unlocks (0 = open). */
  locked: number;
}

export interface DayResult {
  day: number;
  target: number;
  earned: number;
  sales: number;
  tips: number;
  waste: number;
  served: number;
  lost: number;
  bestCombo: number;
  stars: number;
  passed: boolean;
}

export type Tone = "info" | "good" | "bad";

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  labels(labels: Label[]): void;
  toast(text: string, tone: Tone): void;
  dayOver(result: DayResult): void;
  error(message: string): void;
}

// --- Internal types ---------------------------------------------------------------------------------

type TargetKind = "crate" | "grill" | "pan" | "plate" | "bin" | "customer";

interface Target {
  kind: TargetKind;
  id: string;
  index: number;
  hit: THREE.Mesh;
  root: THREE.Object3D;
  mats: THREE.MeshStandardMaterial[];
  glow: number;
  bounce: number;
  baseScale: THREE.Vector3;
}

interface Actor {
  key: string;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  /** Seconds until a one-shot clip hands back to the base animation. */
  onceT: number;
  target: Target;
}

interface Bubble {
  group: THREE.Group;
  border: THREE.Mesh;
  borderMat: THREE.MeshBasicMaterial;
  card: THREE.Mesh;
  stack: THREE.Group;
  items: { key: string; obj: THREE.Object3D }[];
  bar: THREE.Mesh;
  barMat: THREE.MeshBasicMaterial;
  barBg: THREE.Mesh;
  height: number;
  pop: number;
  shake: number;
}

type CState = "enter" | "queue" | "toSlot" | "wait" | "served" | "angry" | "leave";

interface Customer {
  id: number;
  actor: Actor;
  recipe: Recipe;
  state: CState;
  slot: number;
  path: THREE.Vector3[];
  speed: number;
  patience: number;
  patienceMax: number;
  stateT: number;
  yaw: number;
  bubble: Bubble | null;
  fidget: number;
  match: "none" | "partial" | "full";
  /** Menu crowd: no order, just visits. */
  demo: boolean;
  stay: number;
}

type PattyKind = "beef" | "veggie";

interface Patty {
  kind: PattyKind;
  state: "raw" | "cooked" | "burnt";
  t: number;
  key: string;
  obj: THREE.Object3D;
  beeps: number;
  landing: number;
}

interface Pan {
  index: number;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  ring: Ring;
  target: Target;
  patty: Patty | null;
  open: boolean;
}

interface PlateLayer {
  kind: Layer;
  key: string;
  obj: THREE.Object3D;
}

interface Plate {
  group: THREE.Group;
  base: THREE.Object3D;
  layers: PlateLayer[];
  top: number;
}

interface Tween {
  t: number;
  dur: number;
  step(k: number): void;
  done?(): void;
}

interface Popup {
  sprite: THREE.Sprite;
  t: number;
  life: number;
  from: THREE.Vector3;
  base: THREE.Vector2;
}

// --- Game -------------------------------------------------------------------------------------------

export class OrderUpGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  private readonly timer = new THREE.Timer();
  private readonly sfx = new Sfx();
  private readonly protos = new Map<string, Proto>();
  private readonly pool: Pool;
  private readonly world = new THREE.Group();
  private readonly kitchen = new THREE.Group();
  private L: Layout = wideLayout();
  private readonly dynamic = new THREE.Group();
  private readonly particles = new Particles();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly ringGeo = new THREE.PlaneGeometry(1, 1);
  private readonly hitGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly hitMat = new THREE.MeshBasicMaterial({ visible: false });
  private readonly cardMat = new THREE.MeshBasicMaterial({ color: "#fffaf2", transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false });
  private readonly barBgMat = new THREE.MeshBasicMaterial({ color: "#2b2333", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  private readonly barGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  private readonly bubbleGeos = new Map<number, THREE.ShapeGeometry>();
  private raf = 0;
  /** Longest step simulated in one frame (after a hitch the game slows down instead of jumping). */
  private maxDt = 1 / 20;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private readonly sun = new THREE.DirectionalLight("#fff1dd", 2.3);

  private phase: Phase = "loading";
  private elapsed = 0;
  private viewW = 1;
  private viewH = 1;
  private portrait = false;
  private readonly camTarget = new THREE.Vector3(0, 1.4, 0.6);
  private camDist = 16;
  private camPitch = 0.86;
  private shake = 0;

  // Kitchen
  private readonly targets: Target[] = [];
  private readonly crateTargets: Target[] = [];
  private readonly lids: THREE.Object3D[] = [];
  private readonly pans: Pan[] = [];
  private plate: Plate = null!;
  private binTarget!: Target;
  private grillTarget!: Target;
  private plateTarget!: Target;
  private hovered: Target | null = null;
  private readonly stools: THREE.Object3D[] = [];
  private tipJar: THREE.Object3D | null = null;

  // People
  private readonly actorPool = new Map<string, Actor[]>();
  private customers: Customer[] = [];
  private readonly slots: (Customer | null)[] = [null, null, null, null];
  private nextId = 1;
  private readonly tweens: Tween[] = [];
  private readonly popups: Popup[] = [];
  private readonly bubblePool: Bubble[] = [];

  // Day
  private plan: DayPlan = dayPlan(1);
  private upgrades: Upgrades = { ...NO_UPGRADES };
  private dayT = 0;
  private closing = false;
  private closedT = 0;
  private spawnT = 0;
  private menuSpawnT = 0;
  private earned = 0;
  private sales = 0;
  private tips = 0;
  private waste = 0;
  private served = 0;
  private lost = 0;
  private combo = 0;
  private bestCombo = 0;
  private intensity = 0;
  private lastTick = -1;
  private hud: Hud = this.emptyHud();
  private hudDirty = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.75 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.setupWorld(coarse);
    this.pool = new Pool(this.protos, this.dynamic);
    this.scene.add(this.world, this.kitchen, this.dynamic, this.particles.group);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ----------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.background = new THREE.Color("#3a2a3f");
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.5;

    scene.add(new THREE.HemisphereLight("#fff4e6", "#a8857a", 0.95));
    const { sun } = this;
    sun.intensity = 2.7;
    sun.position.set(5, 14, 9);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -11.5, right: 11.5, top: 8.5, bottom: -9.5, near: 4, far: 32 });
    scene.add(sun, sun.target);
    // A soft warm fill from the dining room so faces aren't flat.
    const fill = new THREE.DirectionalLight("#ffd6e8", 0.55);
    fill.position.set(-6, 6, -8);
    scene.add(fill);
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const proto = (key: string, fit: Fit, opts?: { shadows?: boolean; receive?: boolean }) => {
        const m = models.get(key);
        if (m) this.protos.set(key, makeProto(m.scene, m.animations, fit, opts));
      };
      proto(M.floor, { scale: 1 }, { shadows: false, receive: true });
      for (const k of [M.wall, M.wallWindow, M.wallDoorway]) proto(k, { scale: 1 }, { receive: true });
      for (const k of [M.counterA, M.counterB]) proto(k, { scale: 1 }, { receive: true });
      proto(M.stove, { scale: 1 }, { receive: true });
      proto(M.crateLid, { width: CRATE_W });
      proto(M.pan, { scale: 0.95 }, { receive: true });
      proto(M.board, { scale: 1 }, { receive: true });
      proto(M.plate, { scale: 1 }, { receive: true });
      proto(M.bin, { height: 1.35 });
      for (const c of CRATES) proto(c.model, { width: CRATE_W }, { receive: true });
      for (const l of Object.values(LAYERS)) proto(l.model, { scale: 1 }, { receive: true });
      proto(M.rawPatty, { scale: 1 }, { receive: true });
      proto(M.rawVeggie, { scale: 1 }, { receive: true });
      proto(M.burnt, { scale: 1 }, { receive: true });
      proto(M.coin, { height: 0.34 }, { shadows: false });
      for (const k of CUSTOMERS) proto(k, { height: CUSTOMER_H });
      proto(M.fridge, { scale: 1 }, { receive: true });
      proto(M.oven, { scale: 1 }, { receive: true });
      proto(M.table, { scale: 1 }, { receive: true });
      proto(M.tableBig, { scale: 1 }, { receive: true });
      proto(M.chair, { scale: 1 }, { receive: true });
      proto(M.stool, { scale: 1.05 }, { receive: true });
      proto(M.ketchup, { scale: 0.62 });
      proto(M.mustard, { scale: 0.62 });
      proto(M.menu, { scale: 0.8 });
      proto(M.jar, { scale: 0.8 });
      proto(M.register, { height: 0.75 });
      proto(M.plant, { height: 1.9 });
      proto(M.pillar, { scale: 1 }, { receive: true });

      const required = [M.floor, M.counterA, M.stove, M.pan, M.plate, M.rawPatty, M.burnt, ...CRATES.map((c) => c.model), ...Object.values(LAYERS).map((l) => l.model)];
      const missing = required.filter((k) => !this.protos.has(k));
      if (missing.length || !CUSTOMERS.some((k) => this.protos.has(k))) {
        throw new Error("Some game models could not be loaded. Check your connection and reload.");
      }

      this.buildDiner();
      this.L = this.portrait ? tallLayout() : wideLayout();
      this.buildKitchen();
      this.resetKitchen();
      this.setupMenuScene();
      this.fitCamera();
      music.play(KITCHEN_BOSSA, 0);
      this.setPhase("menu");
      this.emitLabels();
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private place(key: string, x: number, y: number, z: number, rotY = 0, parent: THREE.Object3D = this.world) {
    const p = this.protos.get(key);
    if (!p) return null;
    const obj = p.object.clone();
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    parent.add(obj);
    return obj;
  }

  /** Floor, walls and dining room — everything that never changes. */
  private buildDiner() {
    const tiles: [number, number, number, number][] = [];
    for (let x = -14; x <= 14; x += 4) for (let z = -6; z <= 10; z += 4) tiles.push([x, -0.5, z, 0]);
    this.instanced(M.floor, tiles, false);

    // Back wall: entrance door on the left, exit on the right, windows between.
    const back: [number, string][] = [
      [-14, M.wall],
      [-10, M.wallWindow],
      [DOOR_IN_X, M.wallDoorway],
      [-2, M.wallWindow],
      [2, M.wallWindow],
      [DOOR_OUT_X, M.wallDoorway],
      [10, M.wallWindow],
      [14, M.wall],
    ];
    for (const key of new Set(back.map((b) => b[1]))) {
      this.instanced(
        key,
        back.filter((b) => b[1] === key).map(([x]) => [x, 0, WALL_Z, 0]),
        true,
      );
    }

    // Dining room.
    this.place(M.table, -2.1, 0, -4.75);
    this.place(M.table, 2.1, 0, -4.75);
    this.place(M.chair, -3.2, 0, -4.75, PI / 2);
    this.place(M.chair, -1.0, 0, -4.75, -PI / 2);
    this.place(M.chair, 1.0, 0, -4.75, PI / 2);
    this.place(M.chair, 3.2, 0, -4.75, -PI / 2);
    this.place(M.tableBig, -10, 0, -3.2);
    this.place(M.tableBig, 10, 0, -3.2);
    this.place(M.plant, -8.4, 0, -5.4);
    this.place(M.plant, 8.4, 0, -5.4);
    this.place(M.plant, -12.6, 0, -5.4);
    this.place(M.pillar, -4.6, 0, -5.7);
    this.place(M.pillar, 4.6, 0, -5.7);
  }

  /** Many copies of one model in a single draw call per mesh (floor tiles, walls). */
  private instanced(key: string, at: [number, number, number, number][], cast: boolean) {
    const proto = this.protos.get(key);
    if (!proto) return;
    proto.object.updateMatrixWorld(true);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = V(1, 1, 1);
    proto.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, at.length);
      at.forEach(([x, y, z, r], i) => {
        m.compose(V(x, y, z), q.setFromAxisAngle(V(0, 1, 0), r), one).multiply(mesh.matrixWorld);
        inst.setMatrixAt(i, m);
      });
      inst.castShadow = cast;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      this.world.add(inst);
    });
  }

  /** Counters, crates, grill, pans, plate and bin — the things you tap — laid out for the screen shape. */
  private buildKitchen() {
    const L = this.L;
    const k = this.kitchen;
    // Tear down a previous layout.
    for (const pan of this.pans) {
      if (pan.patty) this.pool.release(pan.patty.key, pan.patty.obj);
      pan.ring.mesh.removeFromParent();
      pan.ring.dispose();
    }
    this.pans.length = 0;
    if (this.plate) {
      this.releasePlate(this.plate);
      this.plate = null!;
    }
    for (const t of this.targets) t.hit.removeFromParent();
    this.targets.length = 0;
    this.crateTargets.length = 0;
    this.lids.length = 0;
    this.stools.length = 0;
    this.hovered = null;
    const old = [...k.children];
    k.clear();
    for (const o of old) {
      o.traverse((c) => {
        const mesh = c as THREE.Mesh;
        // Kitchen objects own cloned materials (for the hover glow); geometry stays with the protos.
        if (mesh.isMesh && mesh.material !== this.hitMat) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
    }

    // Back counter (faces the customers) carries the crates; the front counter is the work line.
    L.backCounters.forEach((x, i) => this.place(i % 2 ? M.counterB : M.counterA, x, 0, BACK_Z, PI, k));
    L.frontCounters.forEach((x, i) => this.place(i % 2 ? M.counterA : M.counterB, x, 0, FRONT_Z, 0, k));
    for (const [key, x, y, z, r] of L.decor) this.place(key, x, y, z, r, k);
    this.place(M.board, L.plate.x, TOP, L.plate.z, 0, k);
    for (const x of L.stools) {
      const s = this.place(M.stool, x, 0, L.slotZ - 0.05, 0, k);
      if (s) this.stools.push(s);
    }
    this.tipJar = this.place(M.jar, L.jar.x, L.jar.y, L.jar.z, 0, k);

    CRATES.forEach((c, i) => {
      const at = L.crates[i];
      const tilt = i % 2 ? 0.05 : -0.05;
      const crate = this.place(c.model, at.x, at.y, at.z, tilt, k);
      if (!crate) return;
      const t = this.makeTarget("crate", c.id, i, crate, V(1.1, 1.3, L.kind === "tall" ? 1.1 : 1.6), V(at.x, at.y + 0.5, at.z + (L.kind === "tall" ? 0.05 : 0.25)));
      this.crateTargets.push(t);
      const lid = this.place(M.crateLid, at.x, at.y + 0.45, at.z, tilt, k);
      if (lid) {
        lid.visible = false;
        this.lids.push(lid);
      }
    });

    const stove = this.place(M.stove, L.stoveX, 0, FRONT_Z, 0, k)!;
    this.grillTarget = this.makeTarget("grill", "grill", 0, stove, V(2.1, 1.2, 2.4), V(L.stoveX, 0.7, FRONT_Z + 0.1));

    BURNERS.forEach((b, i) => {
      const pos = V(L.stoveX + b.x, GRILL_Y, FRONT_Z + b.y);
      const pan = this.place(M.pan, pos.x, GRILL_Y - 0.06, pos.z, b.x < 0 ? -PI / 2 : PI / 2, k)!;
      // The model's handle end is on one side: shift so the pan's bowl sits on the burner.
      pan.position.x += b.x < 0 ? -0.17 : 0.17;
      const ring = new Ring(this.ringGeo, 0.5);
      ring.mesh.position.set(pos.x, pos.y + 0.75, pos.z);
      ring.mesh.visible = false;
      this.dynamic.add(ring.mesh);
      const target = this.makeTarget("pan", `pan${i}`, i, pan, V(0.98, 0.7, 0.98), V(pos.x, pos.y + 0.32, pos.z));
      this.pans.push({ index: i, obj: pan, pos: V(pos.x, pos.y + 0.035, pos.z), ring, target, patty: null, open: true });
    });

    const bin = this.place(M.bin, L.bin.x, L.bin.y, L.bin.z, 0, k)!;
    bin.scale.setScalar(L.binScale);
    this.binTarget = this.makeTarget("bin", "bin", 0, bin, V(1.25, 1.9, 1.3).multiplyScalar(L.binScale), V(L.bin.x, L.bin.y + 0.95 * L.binScale, L.bin.z));

    const plateHolder = new THREE.Group();
    this.plateTarget = this.makeTarget("plate", "plate", 0, plateHolder, V(1.5, 1.6, 1.4), V(L.plate.x, TOP + 0.75, L.plate.z));
    this.plate = this.newPlate(false);
    this.applyUpgrades();
  }

  /** Switches between the landscape and portrait kitchens (only between days). */
  private relayout() {
    const kind = this.portrait ? "tall" : "wide";
    if (kind === this.L.kind || !this.protos.size) return false;
    this.L = kind === "tall" ? tallLayout() : wideLayout();
    this.buildKitchen();
    return true;
  }

  private makeTarget(kind: TargetKind, id: string, index: number, root: THREE.Object3D, size: THREE.Vector3, center: THREE.Vector3, parent: THREE.Object3D = this.kitchen): Target {
    const hit = new THREE.Mesh(this.hitGeo, this.hitMat);
    hit.scale.copy(size);
    hit.position.copy(center);
    parent.add(hit);
    const target: Target = { kind, id, index, hit, root, mats: ownMaterials(root), glow: 0, bounce: 0, baseScale: root.scale.clone() };
    hit.userData.target = target;
    if (kind !== "customer") this.targets.push(target);
    return target;
  }

  // --- Public API ------------------------------------------------------------------------------------

  /** Starts (or restarts) a day with the given upgrades. */
  startDay(day: number, upgrades: Upgrades) {
    audio.unlock();
    this.clearPeople();
    this.upgrades = { ...upgrades };
    this.plan = dayPlan(day);
    this.phase = "playing";
    this.resetKitchen();
    this.dayT = 0;
    this.closing = false;
    this.closedT = 0;
    this.spawnT = 1.2;
    this.earned = this.sales = this.tips = this.waste = 0;
    this.served = this.lost = this.combo = this.bestCombo = 0;
    this.lastTick = -1;
    this.intensity = 1;
    music.play(KITCHEN_BOSSA, 1);
    music.duck(false);
    this.sfx.newDay();
    this.setPhase("playing");
    this.emitLabels();
    this.emitHud(true);
  }

  buySound() {
    this.sfx.buy();
  }

  pause() {
    if (this.phase !== "playing") return;
    music.duck(true);
    this.sfx.silence();
    this.setHover(null);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.clearPeople();
    this.upgrades = { ...NO_UPGRADES };
    this.plan = dayPlan(1);
    this.resetKitchen();
    this.setupMenuScene();
    music.play(KITCHEN_BOSSA, 0);
    music.duck(false);
    this.sfx.silence();
    this.setPhase("menu");
    this.applyUpgrades();
    this.emitLabels();
  }

  /** Shows bought upgrades in the kitchen right away (from the shop). */
  previewUpgrades(upgrades: Upgrades) {
    this.upgrades = { ...upgrades };
    this.applyUpgrades();
  }

  action(a: Action) {
    if (this.phase !== "playing") return;
    audio.unlock();
    if (a === "take") this.takePatty(null);
    else if (a === "serve") this.serve(null);
    else if (a === "bin") this.binPlate();
    else this.useCrate(a);
  }

  pointerDown(clientX: number, clientY: number) {
    if (this.phase !== "playing") return;
    const target = this.pick(clientX, clientY);
    if (!target) return;
    audio.unlock();
    target.bounce = 1;
    if (target.kind === "crate") this.useCrate(target.id as CrateId);
    else if (target.kind === "grill") this.useCrate("beef");
    else if (target.kind === "pan") this.tapPan(this.pans[target.index]);
    else if (target.kind === "plate") this.serve(null);
    else if (target.kind === "bin") this.binPlate();
    else if (target.kind === "customer") {
      const c = this.customers.find((x) => x.actor.target === target);
      if (c) this.serve(c);
    }
  }

  /** Mouse hover: highlights what a click would use. Returns whether something is under the pointer. */
  pointerMove(clientX: number, clientY: number) {
    if (this.phase !== "playing") {
      this.setHover(null);
      return false;
    }
    const t = this.pick(clientX, clientY);
    this.setHover(t);
    return !!t;
  }

  pointerLeave() {
    this.setHover(null);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    for (const p of this.popups) disposeSprite(p.sprite);
    this.particles.dispose();
    for (const pan of this.pans) pan.ring.dispose();
    for (const b of this.bubblePool) {
      b.borderMat.dispose();
      b.barMat.dispose();
      b.barBg.geometry.dispose();
    }
    // Customers waiting in the pool own cloned materials (for their hover glow).
    for (const list of this.actorPool.values()) for (const a of list) a.target.mats.forEach((m) => m.dispose());
    for (const g of this.bubbleGeos.values()) g.dispose();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.envTexture?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      }
    });
    for (const m of [this.hitMat, this.cardMat, this.barBgMat]) m.dispose();
    for (const g of [this.ringGeo, this.hitGeo, this.barGeo]) g.dispose();
    this.renderer.dispose();
  }

  // --- State -----------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  private emptyHud(): Hud {
    return {
      day: 1,
      rush: false,
      timeLeft: 0,
      dayLength: 1,
      closing: false,
      earned: 0,
      target: 1,
      combo: 0,
      served: 0,
      lost: 0,
      plate: [],
      plateState: "empty",
      queue: [],
      hint: null,
    };
  }

  private applyUpgrades() {
    const open = 2 + this.upgrades.pans;
    for (const pan of this.pans) {
      pan.open = pan.index < open;
      pan.obj.visible = pan.open;
    }
    this.stools.forEach((s) => (s.visible = this.upgrades.stools > 0));
    if (this.tipJar) this.tipJar.visible = this.upgrades.tips > 0;
    CRATES.forEach((c, i) => {
      if (this.lids[i]) this.lids[i].visible = c.unlock > this.plan.day && this.phase !== "menu" && this.phase !== "loading";
    });
  }

  /** Empty grill, fresh plate. */
  private resetKitchen() {
    this.relayout();
    for (const pan of this.pans) {
      if (pan.patty) this.pool.release(pan.patty.key, pan.patty.obj);
      pan.patty = null;
      pan.ring.mesh.visible = false;
    }
    if (this.plate) this.releasePlate(this.plate);
    this.plate = this.newPlate(false);
    this.applyUpgrades();
    if (this.upgrades.warmer && this.phase !== "menu") this.addLayer("bunBottom", null);
    this.particles.clear();
    this.sfx.silence();
  }

  private clearPeople() {
    for (const c of this.customers) this.releaseCustomer(c);
    this.customers = [];
    this.slots.fill(null);
    // Finish every running animation (a finished tween may start another, so repeat a few times).
    for (let i = 0; i < 4 && this.tweens.length; i++) for (const t of this.tweens.splice(0)) t.done?.();
    this.tweens.length = 0;
    for (const p of this.popups.splice(0)) {
      p.sprite.removeFromParent();
      disposeSprite(p.sprite);
    }
    this.setHover(null);
  }

  /** The menu shows a working diner: a finished burger, patties on the grill and a few visitors. */
  private setupMenuScene() {
    for (const l of ["bunBottom", "lettuce", "patty", "cheese", "tomato", "onion", "bunTop"] as Layer[]) this.addLayer(l, null, true);
    const now = this.phase;
    this.phase = "menu";
    this.putPatty(this.pans[0], "beef", true).t = COOK_TIME[0] + 1;
    this.putPatty(this.pans[1], "beef", true).t = 2;
    this.phase = now;
    for (const pan of this.pans) {
      if (pan.patty && pan.patty.t > COOK_TIME[0]) this.setPattyState(pan, "cooked", true);
    }
    this.menuSpawnT = 0.4;
  }

  // --- Plate ------------------------------------------------------------------------------------------

  private newPlate(pop: boolean): Plate {
    const group = new THREE.Group();
    group.position.copy(this.L.plate);
    this.dynamic.add(group);
    const base = this.pool.get(M.plate, group);
    const plate: Plate = { group, base, layers: [], top: 0.055 };
    if (pop) {
      group.scale.setScalar(0.01);
      this.tween(0.3, (k) => group.scale.setScalar(Math.max(0.01, backOut(k))));
    }
    this.plateTarget.root = group;
    this.plateTarget.baseScale.set(1, 1, 1);
    this.plateTarget.mats = [];
    return plate;
  }

  private releasePlate(plate: Plate) {
    for (const l of plate.layers) this.pool.release(l.key, l.obj);
    this.pool.release(M.plate, plate.base);
    plate.group.removeFromParent();
  }

  private plateKinds() {
    return this.plate.layers.map((l) => l.kind);
  }

  private plateClosed() {
    const l = this.plate.layers;
    return l.length > 0 && l[l.length - 1].kind === "bunTop";
  }

  /** Puts a layer on the plate, flying in from `from` (world) if given. */
  private addLayer(kind: Layer, from: THREE.Vector3 | null, instant = false) {
    const plate = this.plate;
    const key = LAYERS[kind].model;
    const obj = this.pool.get(key, plate.group);
    setShadows(obj, true);
    const st = STACK[kind];
    const y = plate.top + st.lift;
    plate.top += st.adv + Math.max(0, st.lift);
    obj.rotation.y = rand(-0.5, 0.5);
    plate.layers.push({ kind, key, obj });
    if (instant || !from) {
      obj.position.set(0, y, 0);
      if (!instant) this.squash(obj, 0.25);
    } else {
      const start = from.clone().sub(plate.group.position);
      const end = new THREE.Vector3(0, y, 0);
      const spin = rand(-4, 4);
      const rot0 = obj.rotation.y;
      obj.position.copy(start);
      this.tween(0.3, (k) => {
        const e = easeOut(k);
        obj.position.lerpVectors(start, end, e);
        obj.position.y += Math.sin(k * Math.PI) * 1.1;
        obj.rotation.y = rot0 + spin * (1 - e);
      }, () => {
        obj.position.copy(end);
        obj.rotation.y = rot0;
        this.squash(obj, 0.3);
        this.sfx.plop(PITCH[kind]);
        if (this.plate === plate) this.particles.emit("puff", plate.group.position.clone().add(end), 3, "#fff3e0");
      });
    }
    this.hudDirty = true;
  }

  private squash(obj: THREE.Object3D, amount: number) {
    this.tween(0.32, (k) => {
      const s = 1 - amount * Math.sin(k * Math.PI) * (1 - k);
      obj.scale.set(1 + (1 - s) * 0.6, s, 1 + (1 - s) * 0.6);
    }, () => obj.scale.set(1, 1, 1));
  }

  // --- Actions ----------------------------------------------------------------------------------------

  private useCrate(id: CrateId) {
    const index = CRATES.findIndex((c) => c.id === id);
    const crate = CRATES[index];
    const target = this.crateTargets[index];
    if (target) target.bounce = 1;
    if (crate.unlock > this.plan.day) {
      this.nope(`${crate.label} opens on day ${crate.unlock}`);
      return;
    }
    const from = this.L.crates[index].clone().setY(TOP + 0.5);
    if (crate.grill) {
      const pan = this.pans.find((p) => p.open && !p.patty);
      if (!pan) {
        this.nope("The grill is full");
        return;
      }
      this.putPatty(pan, id === "veggie" ? "veggie" : "beef", false, from);
      return;
    }
    const kinds = this.plateKinds();
    if (this.plateClosed()) {
      this.nope("This burger is done — serve it or bin it");
      return;
    }
    if (kinds.length >= MAX_LAYERS) {
      this.nope("That's tall enough!");
      return;
    }
    let layer: Layer;
    if (id === "bun") layer = kinds.length === 0 ? "bunBottom" : "bunTop";
    else {
      if (kinds.length === 0) {
        this.nope("Start with a bun (1)");
        return;
      }
      layer = id as Layer;
    }
    this.addLayer(layer, from);
  }

  private putPatty(pan: Pan, kind: PattyKind, instant: boolean, from?: THREE.Vector3): Patty {
    const key = kind === "veggie" ? M.rawVeggie : M.rawPatty;
    const obj = this.pool.get(key);
    setShadows(obj, true);
    obj.rotation.y = rand(0, Math.PI * 2);
    const patty: Patty = { kind, state: "raw", t: 0, key, obj, beeps: 0, landing: 0 };
    pan.patty = patty;
    if (instant || !from) obj.position.copy(pan.pos);
    else {
      const start = from.clone();
      patty.landing = 1;
      obj.position.copy(start);
      this.tween(0.32, (k) => {
        obj.position.lerpVectors(start, pan.pos, easeOut(k));
        obj.position.y += Math.sin(k * Math.PI) * 1.0;
        obj.rotation.x = (1 - k) * 2.5;
      }, () => {
        obj.position.copy(pan.pos);
        obj.rotation.x = 0;
        patty.landing = 0;
        if (pan.patty === patty) {
          this.squash(obj, 0.3);
          this.sfx.pattyOn();
          this.particles.emit("steam", pan.pos.clone().setY(pan.pos.y + 0.2), 4);
        }
      });
    }
    pan.target.bounce = 1;
    return patty;
  }

  private setPattyState(pan: Pan, state: "cooked" | "burnt", quiet = false) {
    const p = pan.patty;
    if (!p) return;
    const key = state === "burnt" ? M.burnt : LAYERS[p.kind === "veggie" ? "veggie" : "patty"].model;
    const obj = this.pool.get(key);
    setShadows(obj, true);
    obj.position.copy(p.obj.position);
    obj.rotation.copy(p.obj.rotation);
    this.pool.release(p.key, p.obj);
    p.obj = obj;
    p.key = key;
    p.state = state;
    if (quiet) return;
    this.squash(obj, 0.35);
    if (state === "cooked") {
      this.sfx.pattyReady();
      this.particles.emit("steam", pan.pos.clone().setY(pan.pos.y + 0.25), 6);
    } else {
      this.sfx.burnt();
      this.particles.emit("smoke", pan.pos.clone().setY(pan.pos.y + 0.25), 8);
      this.toast("A patty burnt! Scrape it off (C or tap it)", "bad");
    }
  }

  private tapPan(pan: Pan) {
    if (!pan.open) return;
    if (!pan.patty) {
      this.useCrate("beef");
      return;
    }
    this.takePatty(pan);
  }

  /** Takes a cooked patty to the plate (the given pan's, or the most urgent one); scrapes burnt ones. */
  private takePatty(only: Pan | null) {
    let pan = only;
    if (!pan) {
      const want = this.neededPatty();
      const cooked = this.pans.filter((p) => p.patty?.state === "cooked" && !p.patty.landing);
      cooked.sort((a, b) => {
        const wa = want && a.patty!.kind === want ? 1 : 0;
        const wb = want && b.patty!.kind === want ? 1 : 0;
        return wb - wa || b.patty!.t - a.patty!.t;
      });
      pan = cooked[0] ?? this.pans.find((p) => p.patty?.state === "burnt") ?? null;
      if (!pan) {
        if (this.pans.some((p) => p.patty)) this.nope("Still cooking — wait for the green ring");
        else this.nope("The grill is empty — press G to cook a patty");
        return;
      }
    }
    const patty = pan.patty;
    if (!patty || patty.landing) return;
    if (patty.state === "raw") {
      this.nope("Still raw — wait for the green ring");
      return;
    }
    if (patty.state === "burnt") {
      this.scrape(pan);
      return;
    }
    if (this.plate.layers.length === 0) {
      this.nope("Put a bottom bun down first (1)");
      return;
    }
    if (this.plateClosed()) {
      this.nope("This burger is done — serve it or bin it");
      return;
    }
    if (this.plate.layers.length >= MAX_LAYERS) {
      this.nope("That's tall enough!");
      return;
    }
    pan.patty = null;
    pan.ring.mesh.visible = false;
    const from = patty.obj.position.clone();
    this.pool.release(patty.key, patty.obj);
    this.sfx.pattyTake();
    this.addLayer(patty.kind === "veggie" ? "veggie" : "patty", from);
  }

  private scrape(pan: Pan) {
    const patty = pan.patty!;
    pan.patty = null;
    pan.ring.mesh.visible = false;
    const obj = patty.obj;
    const start = obj.position.clone();
    const end = this.L.bin.clone().setY(this.L.bin.y + 1.4 * this.L.binScale);
    this.tween(0.45, (k) => {
      obj.position.lerpVectors(start, end, k);
      obj.position.y += Math.sin(k * Math.PI) * 1.6;
      obj.rotation.z = k * 6;
    }, () => {
      this.pool.release(patty.key, obj);
      this.sfx.bin();
      this.binTarget.bounce = 1;
      this.particles.emit("smoke", end, 3);
    });
    this.loseMoney(1, end);
  }

  /** The patty kind the most urgent order needs next (if the plate is heading its way). */
  private neededPatty(): PattyKind | null {
    const focus = this.focusCustomer();
    if (!focus) return null;
    const kinds = this.plateKinds();
    for (let i = kinds.length; i < focus.recipe.layers.length; i++) {
      const l = focus.recipe.layers[i];
      if (l === "patty") return "beef";
      if (l === "veggie") return "veggie";
    }
    return null;
  }

  private serve(target: Customer | null) {
    const kinds = this.plateKinds();
    if (!kinds.length) {
      this.nope("Build a burger first!");
      return;
    }
    const matches = (c: Customer) => c.state === "wait" && !c.demo && sameStack(kinds, c.recipe.layers);
    let customer = target;
    if (!customer) {
      const ready = this.customers.filter(matches).sort((a, b) => a.patience / a.patienceMax - b.patience / b.patienceMax);
      customer = ready[0] ?? null;
      if (!customer) {
        if (this.plateClosed()) {
          this.nope("Nobody ordered that one — check the bubbles");
          this.flashPlate();
        } else this.nope("Not finished yet — it needs a top bun");
        return;
      }
    } else if (customer.state !== "wait" || customer.demo) return;
    if (!matches(customer)) {
      if (!this.plateClosed()) {
        this.nope("Not finished yet — it needs a top bun");
        return;
      }
      this.refuse(customer);
      return;
    }
    this.deliver(customer);
  }

  private refuse(c: Customer) {
    this.sfx.wrong();
    this.play(c.actor, "emote-no", { once: true, fade: 0.1 });
    c.patience = Math.max(0.5, c.patience - c.patienceMax * 0.12);
    if (c.bubble) c.bubble.shake = 0.6;
    this.flashPlate();
    this.breakCombo();
    this.toast("That's not what I ordered!", "bad");
  }

  private flashPlate() {
    const g = this.plate.group;
    this.tween(0.4, (k) => (g.position.x = this.L.plate.x + Math.sin(k * Math.PI * 6) * 0.08 * (1 - k)), () => (g.position.x = this.L.plate.x));
  }

  private deliver(c: Customer) {
    const plate = this.plate;
    this.plate = this.newPlate(true);
    if (this.upgrades.warmer) this.addLayer("bunBottom", null);
    c.state = "served";
    c.stateT = 0;
    this.slots[c.slot] = null;
    const frac = clamp01(c.patience / c.patienceMax);
    const price = recipePrice(c.recipe);
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const tipMult = 1 + 0.3 * this.upgrades.tips;
    const tip = Math.round(price * 0.55 * frac * tipMult) + Math.min(4, Math.floor(this.combo / 2));
    this.sales += price;
    this.tips += tip;
    this.earned += price + tip;
    this.served++;
    this.hudDirty = true;

    // The burger slides over to the customer's hands and is gone with a pop.
    const start = plate.group.position.clone();
    const end = new THREE.Vector3(c.actor.root.position.x, TOP + 0.35, c.actor.root.position.z + 0.55);
    this.sfx.ding();
    this.tween(0.42, (k) => {
      plate.group.position.lerpVectors(start, end, easeOut(k));
      plate.group.position.y += Math.sin(k * Math.PI) * 1.2;
    }, () => {
      this.play(c.actor, "interact-right", { once: true, fade: 0.1 });
      this.tween(0.25, (k) => plate.group.scale.setScalar(Math.max(0.01, 1 - k)), () => this.releasePlate(plate));
      const head = c.actor.root.position.clone().setY(CUSTOMER_H + 0.3);
      this.particles.emit("spark", head, 14, "#ffd166");
      this.particles.emit("spark", head, 6, "#f472b6");
      this.popup(`+$${price + tip}`, "#ffd166", head.clone().setY(head.y + 0.6));
      if (this.combo >= 2) {
        this.popup(`Combo ×${this.combo}`, "#f9a8d4", head.clone().setY(head.y + 1.15), 0.34);
        this.sfx.combo(this.combo);
      }
      this.coins(head, Math.min(8, 3 + Math.floor(tip / 2)));
      this.sfx.coins(3);
      this.tween(0.45, () => {}, () => this.play(c.actor, "emote-yes", { once: true, fade: 0.15 }));
    });
    this.hideBubble(c);
  }

  private binPlate() {
    const kinds = this.plateKinds();
    if (!kinds.length) {
      this.nope("The plate is already empty");
      return;
    }
    if (this.upgrades.warmer && kinds.length === 1 && kinds[0] === "bunBottom") {
      this.nope("The plate is already empty");
      return;
    }
    const plate = this.plate;
    this.plate = this.newPlate(true);
    if (this.upgrades.warmer) this.addLayer("bunBottom", null);
    const cost = wasteCost(this.upgrades.warmer ? kinds.slice(1) : kinds);
    const start = plate.group.position.clone();
    const end = this.L.bin.clone().setY(this.L.bin.y + 1.45 * this.L.binScale);
    this.sfx.bin();
    this.tween(0.45, (k) => {
      plate.group.position.lerpVectors(start, end, k);
      plate.group.position.y += Math.sin(k * Math.PI) * 1.5;
      plate.group.rotation.z = -k * 1.8;
      plate.group.scale.setScalar(Math.max(0.01, 1 - k * 0.6));
    }, () => {
      this.releasePlate(plate);
      this.binTarget.bounce = 1;
      this.particles.emit("puff", end, 6, "#d1fae5");
    });
    this.loseMoney(cost, end);
  }

  private loseMoney(amount: number, at: THREE.Vector3) {
    this.waste += amount;
    this.earned -= amount;
    this.hudDirty = true;
    this.popup(`−$${amount}`, "#fb7185", at.clone().setY(at.y + 0.5), 0.36);
  }

  private nope(text: string) {
    this.sfx.nope();
    this.toast(text, "info");
  }

  private lastToast = "";
  private lastToastT = -10;
  private toast(text: string, tone: Tone) {
    if (text === this.lastToast && this.elapsed - this.lastToastT < 1.2) return;
    this.lastToast = text;
    this.lastToastT = this.elapsed;
    this.events.toast(text, tone);
  }

  private breakCombo() {
    if (this.combo >= 3) this.toast(`Combo lost (×${this.combo})`, "bad");
    this.combo = 0;
    this.hudDirty = true;
  }

  // --- Customers --------------------------------------------------------------------------------------

  private getActor(): Actor {
    const present = new Set(this.customers.map((c) => c.actor.key));
    const keys = CUSTOMERS.filter((k) => this.protos.has(k));
    const fresh = keys.filter((k) => !present.has(k));
    const key = pick(fresh.length ? fresh : keys);
    const free = this.actorPool.get(key);
    let actor = free?.pop();
    if (!actor) {
      const proto = this.protos.get(key)!;
      const root = cloneSkinned(proto.object);
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
      });
      const mixer = new THREE.AnimationMixer(root);
      const actions = new Map(proto.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
      const target = this.makeTarget("customer", key, 0, root, new THREE.Vector3(1.25, 3.9, 1.1), new THREE.Vector3(0, 1.95, 0), root);
      target.hit.scale.divide(root.scale);
      actor = { key, root, mixer, actions, current: null, onceT: 0, target };
    }
    actor.root.visible = true;
    actor.mixer.stopAllAction();
    actor.current = null;
    actor.onceT = 0;
    this.dynamic.add(actor.root);
    return actor;
  }

  private spawnCustomer(demo: boolean) {
    const actor = this.getActor();
    let recipe: Recipe;
    if (demo) recipe = recipeById("classic");
    else {
      const list = recipesFor(this.plan.day);
      const weights = list.map((r) => r.weight * (r.day === this.plan.day ? 2.2 : 1) * (this.plan.rush && r.layers.length > 7 ? 1.4 : 1));
      let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      recipe = list[list.length - 1];
      for (let i = 0; i < list.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          recipe = list[i];
          break;
        }
      }
    }
    const patienceMax = recipePatience(recipe) * this.plan.patience * (1 + 0.25 * this.upgrades.stools);
    const c: Customer = {
      id: this.nextId++,
      actor,
      recipe,
      state: "enter",
      slot: -1,
      path: [],
      speed: WALK_SPEED * rand(0.95, 1.1),
      patience: patienceMax,
      patienceMax,
      stateT: 0,
      yaw: 0,
      bubble: null,
      fidget: rand(3, 5),
      match: "none",
      demo,
      stay: rand(3, 6),
    };
    actor.root.position.set(DOOR_IN_X, 0, WALL_Z - 1.4);
    c.yaw = 0;
    actor.root.rotation.y = 0;
    this.customers.push(c);
    this.routeIn(c);
    this.play(actor, "walk", { fade: 0 });
    if (!demo) this.sfx.doorBell();
    this.hudDirty = true;
  }

  /** Sends a customer to a free counter slot, or to the line by the door. */
  private routeIn(c: Customer) {
    const pos = c.actor.root.position;
    const free = this.slots.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
    const queued = this.customers.filter((x) => x !== c && (x.state === "queue" || (x.state === "enter" && x.slot < 0)));
    const entry = new THREE.Vector3(DOOR_IN_X, 0, WALL_Z + 1.3);
    const path: THREE.Vector3[] = [];
    if (pos.z < WALL_Z + 0.5) path.push(entry);
    if (free.length && !queued.length) {
      // Prefer the free slot nearest to the door so paths don't cross much, with a little variety.
      const slot = free.length > 1 && Math.random() < 0.5 ? free[1] : free[0];
      c.slot = slot;
      this.slots[slot] = c;
      path.push(new THREE.Vector3(this.L.slotX[slot], 0, AISLE_Z), new THREE.Vector3(this.L.slotX[slot], 0, this.L.slotZ));
      c.state = pos.z < WALL_Z + 0.5 ? "enter" : "toSlot";
    } else {
      const spot = Math.min(this.L.queue.length - 1, queued.length);
      path.push(this.L.queue[spot].clone());
      c.state = "enter";
    }
    c.path = path;
  }

  private queueLength() {
    return this.customers.filter((c) => !c.demo && c.slot < 0 && (c.state === "queue" || c.state === "enter")).length;
  }

  private leave(c: Customer, angry: boolean) {
    if (c.slot >= 0 && this.slots[c.slot] === c) this.slots[c.slot] = null;
    const from = c.actor.root.position;
    c.path = [];
    if (from.z > AISLE_Z) c.path.push(new THREE.Vector3(from.x, 0, AISLE_Z));
    c.path.push(new THREE.Vector3(DOOR_OUT_X, 0, WALL_Z + 1.3), new THREE.Vector3(DOOR_OUT_X, 0, WALL_Z - 1.6));
    c.state = "leave";
    c.speed = WALK_SPEED * (angry ? 1.35 : 1.05);
    this.play(c.actor, "walk", { fade: 0.25, timeScale: angry ? 1.3 : 1 });
  }

  private releaseCustomer(c: Customer) {
    if (c.bubble) this.releaseBubble(c.bubble);
    c.bubble = null;
    if (c.slot >= 0 && this.slots[c.slot] === c) this.slots[c.slot] = null;
    const a = c.actor;
    a.mixer.stopAllAction();
    a.root.removeFromParent();
    if (this.hovered === a.target) this.setHover(null);
    let list = this.actorPool.get(a.key);
    if (!list) this.actorPool.set(a.key, (list = []));
    list.push(a);
  }

  private play(a: Actor, name: string, { once = false, fade = 0.2, timeScale = 1 } = {}) {
    const next = a.actions.get(name);
    if (!next) return;
    if (a.current === next && !once) {
      next.timeScale = timeScale;
      return;
    }
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = timeScale;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (a.current && a.current !== next) next.crossFadeFrom(a.current, fade, false);
    next.play();
    a.current = next;
    a.onceT = once ? next.getClip().duration / timeScale - 0.15 : 0;
  }

  private baseAnim(c: Customer) {
    if (c.state === "enter" || c.state === "toSlot" || c.state === "leave") return "walk";
    return "idle";
  }

  private updateCustomers(dt: number, live: boolean) {
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      const a = c.actor;
      c.stateT += dt;
      a.mixer.update(dt);
      if (a.onceT > 0) {
        a.onceT -= dt;
        if (a.onceT <= 0) this.play(a, this.baseAnim(c), { fade: 0.25, timeScale: c.state === "leave" && c.speed > WALK_SPEED * 1.2 ? 1.3 : 1 });
      }

      // Walking along the path.
      const pos = a.root.position;
      if (c.path.length) {
        const to = c.path[0];
        const dx = to.x - pos.x;
        const dz = to.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const step = c.speed * dt;
        if (dist <= step) {
          pos.x = to.x;
          pos.z = to.z;
          c.path.shift();
        } else {
          pos.x += (dx / dist) * step;
          pos.z += (dz / dist) * step;
        }
        if (dist > 0.05) c.yaw = angleLerp(c.yaw, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
        if (!c.path.length) this.arrive(c);
      } else if (c.state === "wait" || c.state === "served" || c.state === "angry") {
        c.yaw = angleLerp(c.yaw, 0, 1 - Math.exp(-8 * dt));
      } else if (c.state === "queue") {
        c.yaw = angleLerp(c.yaw, Math.atan2(this.L.slotX[0] - pos.x, this.L.slotZ - pos.z), 1 - Math.exp(-6 * dt));
      }
      a.root.rotation.y = c.yaw;

      if (c.state === "leave" && !c.path.length) {
        this.releaseCustomer(c);
        this.customers.splice(i, 1);
        this.hudDirty = true;
        continue;
      }

      if (c.state === "wait") {
        if (c.demo) {
          c.stay -= dt;
          if (c.stay <= 0) {
            c.state = "served";
            c.stateT = 0;
            this.play(a, "emote-yes", { once: true });
          }
        } else if (live) {
          c.patience -= dt;
          const frac = c.patience / c.patienceMax;
          if (frac < 0.4) {
            c.fidget -= dt;
            if (c.fidget <= 0) {
              c.fidget = rand(3.5, 5.5) * (frac < 0.2 ? 0.6 : 1);
              this.play(a, "emote-no", { once: true, fade: 0.15 });
            }
          }
          if (c.patience <= 0) this.storm(c);
        }
      } else if (c.state === "served" && c.stateT > (c.demo ? 1.2 : 1.6)) this.leave(c, false);
      else if (c.state === "angry" && c.stateT > 1.0) this.leave(c, true);

      if (c.bubble) this.updateBubble(c, dt);
    }
    if (live) this.promoteQueue();
  }

  private arrive(c: Customer) {
    if (c.state === "enter" || c.state === "toSlot") {
      if (c.slot >= 0) {
        c.state = "wait";
        c.stateT = 0;
        this.play(c.actor, "idle", { fade: 0.25 });
        if (!c.demo) {
          c.bubble = this.makeBubble(c);
          this.refreshMatches();
        }
      } else {
        c.state = "queue";
        this.play(c.actor, "idle", { fade: 0.25 });
      }
      this.hudDirty = true;
    }
  }

  /** Waiting customers step up to the counter as soon as a slot frees. */
  private promoteQueue() {
    if (this.closing) return;
    const free = this.slots.findIndex((s) => !s);
    if (free < 0) return;
    const line = this.customers.filter((c) => !c.demo && c.slot < 0 && (c.state === "queue" || c.state === "enter"));
    const first = line.find((c) => c.state === "queue") ?? null;
    if (!first) return;
    first.slot = free;
    this.slots[free] = first;
    first.state = "toSlot";
    first.path = [new THREE.Vector3(this.L.slotX[free], 0, AISLE_Z), new THREE.Vector3(this.L.slotX[free], 0, this.L.slotZ)];
    this.play(first.actor, "walk", { fade: 0.2 });
    // Everyone behind shuffles forward.
    let spot = 0;
    for (const c of line) {
      if (c === first) continue;
      c.path = [this.L.queue[Math.min(spot, this.L.queue.length - 1)].clone()];
      if (c.state === "queue") {
        c.state = "enter";
        this.play(c.actor, "walk", { fade: 0.2 });
      }
      spot++;
    }
  }

  /** Out of patience: they leave angry. */
  private storm(c: Customer) {
    c.state = "angry";
    c.stateT = 0;
    if (c.slot >= 0 && this.slots[c.slot] === c) this.slots[c.slot] = null;
    this.play(c.actor, "emote-no", { once: true, fade: 0.1 });
    this.sfx.grumble();
    const head = c.actor.root.position.clone().setY(CUSTOMER_H + 0.25);
    this.particles.emit("anger", head, 8);
    this.popup("Too slow!", "#fb7185", head.clone().setY(head.y + 0.7), 0.36);
    this.hideBubble(c);
    this.lost++;
    this.breakCombo();
    this.shake = 0.25;
    this.hudDirty = true;
  }

  // --- Order bubbles ----------------------------------------------------------------------------------

  private bubbleGeo(n: number) {
    let g = this.bubbleGeos.get(n);
    if (!g) {
      g = bubbleGeometry(BUBBLE_W, 0.4 + n * MINI_GAP, 0.18, TAIL);
      this.bubbleGeos.set(n, g);
    }
    return g;
  }

  private makeBubble(c: Customer): Bubble {
    let b = this.bubblePool.pop();
    if (!b) {
      const group = new THREE.Group();
      const borderMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
      const border = new THREE.Mesh(this.bubbleGeo(3), borderMat);
      border.renderOrder = 10;
      const card = new THREE.Mesh(this.bubbleGeo(3), this.cardMat);
      card.renderOrder = 11;
      card.position.z = 0.005;
      const stack = new THREE.Group();
      const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.11), this.barBgMat);
      barBg.renderOrder = 12;
      const barMat = new THREE.MeshBasicMaterial({ color: "#22c55e", toneMapped: false, depthWrite: false, transparent: true });
      const bar = new THREE.Mesh(this.barGeo, barMat);
      bar.renderOrder = 13;
      bar.scale.set(1.0, 0.07, 1);
      group.add(border, card, stack, barBg, bar);
      b = { group, border, borderMat, card, stack, items: [], bar, barMat, barBg, height: 0, pop: 0, shake: 0 };
    }
    const n = c.recipe.layers.length;
    const h = 0.4 + n * MINI_GAP;
    b.height = h;
    b.card.geometry = this.bubbleGeo(n);
    b.border.geometry = this.bubbleGeo(n);
    b.border.scale.set(1.07, 1.04, 1);
    b.border.position.set(0, -0.02, -0.002);
    b.barBg.position.set(0, TAIL + 0.1, 0.01);
    b.bar.position.set(-0.5, TAIL + 0.1, 0.02);
    b.stack.position.set(0, TAIL + 0.26, 0.15);
    b.stack.rotation.set(0.5, 0, 0);
    b.stack.scale.setScalar(MINI);
    let y = 0;
    for (const layer of c.recipe.layers) {
      const key = LAYERS[layer].model;
      const obj = this.pool.get(key, b.stack);
      setShadows(obj, false);
      obj.position.y = y / MINI;
      obj.rotation.y = rand(-0.4, 0.4);
      b.items.push({ key, obj });
      y += MINI_GAP;
    }
    b.pop = 0;
    b.shake = 0;
    b.group.scale.setScalar(0.01);
    b.group.visible = true;
    this.dynamic.add(b.group);
    return b;
  }

  private hideBubble(c: Customer) {
    const b = c.bubble;
    if (!b) return;
    c.bubble = null;
    const s0 = b.group.scale.x;
    this.tween(0.2, (k) => b.group.scale.setScalar(Math.max(0.01, s0 * (1 - k))), () => this.releaseBubble(b));
  }

  private releaseBubble(b: Bubble) {
    for (const it of b.items) this.pool.release(it.key, it.obj);
    b.items = [];
    b.group.removeFromParent();
    this.bubblePool.push(b);
  }

  private updateBubble(c: Customer, dt: number) {
    const b = c.bubble!;
    b.pop = Math.min(1, b.pop + dt * 3.2);
    const frac = clamp01(c.patience / c.patienceMax);
    let s = backOut(b.pop);
    if (c.match === "full") s *= 1 + Math.sin(this.elapsed * 7) * 0.04;
    b.group.scale.setScalar(Math.max(0.01, s));
    const pos = c.actor.root.position;
    b.group.position.set(pos.x, CUSTOMER_H + 0.22, pos.z);
    if (b.shake > 0) {
      b.shake -= dt;
      b.group.position.x += Math.sin(this.elapsed * 50) * 0.06 * Math.min(1, b.shake * 3);
    } else if (frac < 0.2) b.group.position.x += Math.sin(this.elapsed * 30) * 0.025;
    b.group.quaternion.copy(this.camera.quaternion);
    b.bar.scale.x = Math.max(0.001, 1.0 * frac);
    const col = frac > 0.5 ? "#22c55e" : frac > 0.25 ? "#f59e0b" : "#ef4444";
    b.barMat.color.set(col);
    b.barMat.opacity = frac < 0.2 ? 0.6 + 0.4 * Math.abs(Math.sin(this.elapsed * 8)) : 1;
    const target = c.match === "full" ? GREEN : c.match === "partial" ? ACCENT : WHITE;
    b.borderMat.color.lerp(target, 1 - Math.exp(-12 * dt));
    const hover = this.hovered === c.actor.target;
    b.border.scale.set(hover ? 1.11 : 1.07, hover ? 1.06 : 1.04, 1);
    for (const it of b.items) it.obj.rotation.y += dt * 0.5;
  }

  /** Which orders the plate is heading towards (pink) or matches exactly (green). */
  private refreshMatches() {
    const kinds = this.plateKinds();
    for (const c of this.customers) {
      if (c.state !== "wait" || c.demo) {
        c.match = "none";
        continue;
      }
      const r = c.recipe.layers;
      if (!kinds.length) c.match = "none";
      else if (sameStack(kinds, r)) c.match = "full";
      else if (kinds.length < r.length && kinds.every((k, i) => r[i] === k)) c.match = "partial";
      else c.match = "none";
    }
  }

  private focusCustomer(): Customer | null {
    const kinds = this.plateKinds();
    const waiting = this.customers.filter((c) => c.state === "wait" && !c.demo);
    waiting.sort((a, b) => a.patience - b.patience);
    return waiting.find((c) => kinds.length <= c.recipe.layers.length && kinds.every((k, i) => c.recipe.layers[i] === k)) ?? null;
  }

  // --- Grill ------------------------------------------------------------------------------------------

  private updatePans(dt: number, live: boolean) {
    const cook = COOK_TIME[Math.min(this.upgrades.grill, COOK_TIME.length - 1)];
    const burnDelay = BURN_DELAY[Math.min(this.upgrades.burner, BURN_DELAY.length - 1)];
    let cooking = 0;
    for (const pan of this.pans) {
      const p = pan.patty;
      const ring = pan.ring;
      if (!p) {
        ring.mesh.visible = false;
        continue;
      }
      if (live && !p.landing) {
        p.t += dt;
        if (p.state === "raw" && p.t >= cook) this.setPattyState(pan, "cooked");
        else if (p.state === "cooked" && p.t >= cook + burnDelay) this.setPattyState(pan, "burnt");
      }
      if (p.state !== "burnt") cooking++;
      // Sizzle wobble and puffs.
      if (!p.landing) {
        const wob = p.state === "burnt" ? 0 : Math.sin(this.elapsed * 18 + pan.index) * 0.012;
        p.obj.position.y = pan.pos.y + Math.max(0, wob);
        if (Math.random() < dt * (p.state === "burnt" ? 5 : 2.4)) {
          this.particles.emit(p.state === "burnt" ? "smoke" : "steam", pan.pos.clone().setY(pan.pos.y + 0.2), 1);
        }
      }
      ring.mesh.visible = this.phase !== "menu" && !p.landing;
      ring.mesh.quaternion.copy(this.camera.quaternion);
      if (p.state === "raw") {
        const k = clamp01(p.t / cook);
        ring.set(k, k > 0.85 ? "#a3e635" : "#fbbf24");
      } else if (p.state === "cooked") {
        const left = 1 - clamp01((p.t - cook) / burnDelay);
        const danger = left < 0.36;
        const flash = danger && Math.sin(this.elapsed * 16) > 0;
        ring.set(left, danger ? (flash ? "#ef4444" : "#f97316") : "#22c55e");
        if (live && danger) {
          const beat = Math.floor((p.t - cook) * 2);
          if (beat !== p.beeps) {
            p.beeps = beat;
            this.sfx.burnWarn();
          }
        }
        ring.mesh.scale.setScalar(0.5 * (1 + Math.sin(this.elapsed * 6) * 0.06));
      } else {
        ring.set(1, Math.sin(this.elapsed * 10) > 0 ? "#ef4444" : "#7f1d1d");
        ring.mesh.scale.setScalar(0.5);
      }
    }
    this.sfx.sizzle(this.phase === "menu" ? 0 : cooking, dt);
  }

  // --- Day flow ---------------------------------------------------------------------------------------

  private updateDay(dt: number) {
    this.dayT += dt;
    const left = this.plan.length - this.dayT;
    if (!this.closing) {
      if (left <= 0) {
        this.closing = true;
        this.sfx.closing();
        this.toast("Closing time — serve the last orders!", "info");
        // The line by the door goes home.
        for (const c of this.customers) if (c.slot < 0 && (c.state === "queue" || c.state === "enter")) this.leave(c, false);
      } else {
        const sec = Math.ceil(left);
        if (sec <= 5 && sec !== this.lastTick) {
          this.lastTick = sec;
          this.sfx.tick();
        }
        this.spawnT -= dt;
        const atCounter = this.slots.filter(Boolean).length;
        if (atCounter === 0 && this.queueLength() === 0) this.spawnT = Math.min(this.spawnT, 1.5);
        if (this.spawnT <= 0 && left > 6) {
          if (this.queueLength() < this.L.queue.length) this.spawnCustomer(false);
          const k = clamp01(this.dayT / this.plan.length);
          this.spawnT = (this.plan.spawnFrom + (this.plan.spawnTo - this.plan.spawnFrom) * k) * rand(0.8, 1.2);
        }
      }
    } else {
      const remaining = this.customers.some((c) => !c.demo && (c.state === "wait" || c.state === "toSlot" || (c.state === "enter" && c.slot >= 0)));
      if (!remaining) {
        this.closedT += dt;
        if (this.closedT > 1.4) {
          this.endDay();
          return;
        }
      }
    }

    const waiting = this.slots.filter((s) => s && s.state === "wait").length;
    const rush = waiting >= 3 || (left < 30 && left > 0);
    const intensity = rush ? 2 : 1;
    if (intensity !== this.intensity) {
      this.intensity = intensity;
      music.setIntensity(intensity);
    }
    this.sfx.murmur(Math.min(1, this.customers.length / 5));
  }

  private endDay() {
    this.sfx.silence();
    for (const c of this.customers) if (c.state !== "leave") this.leave(c, false);
    for (const pan of this.pans) {
      if (pan.patty) this.pool.release(pan.patty.key, pan.patty.obj);
      pan.patty = null;
      pan.ring.mesh.visible = false;
    }
    const earned = this.earned;
    const target = this.plan.target;
    const stars = starsFor(earned, target);
    const passed = earned >= target;
    if (passed) this.sfx.success();
    else this.sfx.fail();
    music.setIntensity(0);
    this.intensity = 0;
    this.setHover(null);
    this.setPhase("dayover");
    this.events.dayOver({
      day: this.plan.day,
      target,
      earned,
      sales: this.sales,
      tips: this.tips,
      waste: this.waste,
      served: this.served,
      lost: this.lost,
      bestCombo: this.bestCombo,
      stars,
      passed,
    });
  }

  private updateMenu(dt: number) {
    this.menuSpawnT -= dt;
    const demo = this.customers.length;
    if (this.menuSpawnT <= 0 && demo < 4 && this.slots.some((s) => !s)) {
      this.spawnCustomer(true);
      this.menuSpawnT = rand(2.2, 4);
    }
  }

  // --- Hover & picking --------------------------------------------------------------------------------

  private pick(clientX: number, clientY: number): Target | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits: THREE.Mesh[] = [];
    for (const t of this.targets) {
      if (t.kind === "pan" && !this.pans[t.index].open) continue;
      hits.push(t.hit);
    }
    for (const c of this.customers) if (c.state === "wait" && !c.demo) hits.push(c.actor.target.hit);
    const found = this.raycaster.intersectObjects(hits, false);
    // Pans sit on the grill: prefer the pan when both are under the pointer.
    const first = found[0]?.object.userData.target as Target | undefined;
    if (first?.kind === "grill") {
      const pan = found.find((f) => (f.object.userData.target as Target).kind === "pan");
      if (pan) return pan.object.userData.target as Target;
    }
    return first ?? null;
  }

  private setHover(t: Target | null) {
    if (this.hovered === t) return;
    this.hovered = t;
  }

  private updateGlow(dt: number) {
    // A customer who has been served (or left) is no longer something to click.
    if (this.hovered?.kind === "customer" && !this.customers.some((c) => c.actor.target === this.hovered && c.state === "wait")) this.hovered = null;
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 6);
    const all = [...this.targets, ...this.customers.map((c) => c.actor.target)];
    const hoverColor = this.hovered?.kind === "customer" && this.customers.some((c) => c.actor.target === this.hovered && c.match === "full") ? GREEN : ACCENT;
    for (const t of all) {
      const want = this.hovered === t ? 0.28 + pulse * 0.12 : 0;
      t.glow = damp(t.glow, want, 14, dt);
      for (const m of t.mats) m.emissive.copy(this.hovered === t ? hoverColor : ACCENT).multiplyScalar(t.glow);
      if (t.bounce > 0) {
        t.bounce = Math.max(0, t.bounce - dt * 4);
        const k = 1 - t.bounce;
        const s = 1 + Math.sin(k * Math.PI) * 0.07 * t.bounce;
        if (t.kind !== "customer" && t.kind !== "plate") t.root.scale.set(t.baseScale.x * s, t.baseScale.y * (2 - s), t.baseScale.z * s);
      }
    }
  }

  // --- Effects ----------------------------------------------------------------------------------------

  private tween(dur: number, step: (k: number) => void, done?: () => void) {
    this.tweens.push({ t: 0, dur, step, done });
  }

  private updateTweens(dt: number) {
    for (let i = 0; i < this.tweens.length; i++) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        i--;
        tw.done?.();
      }
    }
  }

  private popup(text: string, color: string, at: THREE.Vector3, height = 0.46) {
    const sprite = textSprite(text, color, height);
    sprite.position.copy(at);
    this.dynamic.add(sprite);
    this.popups.push({ sprite, t: 0, life: 1.3, from: at.clone(), base: new THREE.Vector2(sprite.scale.x, sprite.scale.y) });
  }

  private updatePopups(dt: number) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.sprite.removeFromParent();
        disposeSprite(p.sprite);
        this.popups.splice(i, 1);
        continue;
      }
      p.sprite.position.copy(p.from);
      p.sprite.position.y += easeOut(k) * 0.9;
      const s = Math.max(0.01, k < 0.15 ? backOut(k / 0.15) : 1);
      p.sprite.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      p.sprite.scale.set(p.base.x * s, p.base.y * s, 1);
    }
  }

  /** Coins fly from the customer up towards the money counter. */
  private coins(from: THREE.Vector3, count: number) {
    if (!this.protos.has(M.coin)) return;
    // Towards the money chip in the top-left corner.
    const rect = { x: 150 / this.viewW, y: this.portrait ? 70 / this.viewH : 36 / this.viewH };
    const dest = this.screenPoint(rect.x * 2 - 1, 1 - rect.y * 2, 9);
    for (let i = 0; i < count; i++) {
      const coin = this.pool.get(M.coin);
      const start = from.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(0, 0.3), rand(-0.2, 0.2)));
      const mid = start.clone().add(new THREE.Vector3(rand(-0.8, 0.8), rand(1.0, 1.8), rand(0, 0.5)));
      coin.position.copy(start);
      const delay = i * 0.06;
      const spin = rand(8, 14);
      this.tween(0.95 + delay, (k) => {
        const t = clamp01((k * (0.95 + delay) - delay) / 0.95);
        const e = t * t;
        // Up in a burst, then off to the money counter.
        const a = start.clone().lerp(mid, easeOut(Math.min(1, t * 2)));
        coin.position.copy(a.lerp(dest, Math.max(0, e * 1.2 - 0.2)));
        coin.rotation.y = t * spin;
        coin.scale.setScalar(t < 0.1 ? t * 10 : 1 - Math.max(0, t - 0.8) * 4);
      }, () => this.pool.release(M.coin, coin));
    }
  }

  private screenPoint(ndcX: number, ndcY: number, dist: number) {
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    return this.camera.position.clone().add(v.sub(this.camera.position).normalize().multiplyScalar(dist));
  }

  // --- HUD --------------------------------------------------------------------------------------------

  private plateState(): PlateState {
    const kinds = this.plateKinds();
    if (!kinds.length) return "empty";
    if (this.customers.some((c) => c.match === "full")) return "ready";
    if (this.customers.some((c) => c.match === "partial")) return "building";
    return this.customers.some((c) => c.state === "wait" && !c.demo) ? "wrong" : "building";
  }

  private hint(): string | null {
    if (this.plan.day > 1 || this.closing) return null;
    const waiting = this.customers.filter((c) => c.state === "wait" && !c.demo);
    const kinds = this.plateKinds();
    if (!waiting.length) return kinds.length ? null : "Customers are on their way…";
    const focus = this.focusCustomer();
    if (!focus) return "That stack isn't anyone's order — bin it (X or tap the bin)";
    const order = focus.recipe.layers;
    const next = order[kinds.length];
    if (!next) return "Burger ready! Tap the customer (Enter) to serve";
    const needsPatty = order.slice(kinds.length).includes("patty");
    const onGrill = this.pans.filter((p) => p.patty && p.patty.state !== "burnt");
    const cooked = onGrill.some((p) => p.patty!.state === "cooked");
    if (!cooked && this.pans.some((p) => p.patty?.state === "burnt")) return "Burnt patty! Tap it (C) to scrape it off";
    if (next === "patty") {
      if (cooked) return "Patty's done! Tap it on the grill (C)";
      if (onGrill.length) return "Cooking… wait for the ring to turn green";
      return "Tap the grill (G) to cook a patty";
    }
    if (needsPatty && !onGrill.length) return "Tap the grill (G) — patties take a few seconds";
    if (next === "bunBottom") return "Tap the bun crate (1) for a bottom bun";
    if (next === "bunTop") return "Tap the buns again (1) to close the burger";
    const crate = CRATES.find((c) => c.id === next);
    return crate ? `Add ${LAYERS[next].name.toLowerCase()} (${crate.key})` : null;
  }

  private emitHud(force = false) {
    if (!force && !this.hudDirty && Math.ceil(this.plan.length - this.dayT) === Math.ceil(this.hud.timeLeft)) return;
    this.hudDirty = false;
    this.refreshMatches();
    const queue = this.customers
      .filter((c) => !c.demo && c.slot < 0 && (c.state === "queue" || c.state === "enter"))
      .map((c) => c.recipe.id);
    this.hud = {
      day: this.plan.day,
      rush: this.plan.rush,
      timeLeft: Math.max(0, Math.ceil(this.plan.length - this.dayT)),
      dayLength: this.plan.length,
      closing: this.closing,
      earned: this.earned,
      target: this.plan.target,
      combo: this.combo,
      served: this.served,
      lost: this.lost,
      plate: this.plateKinds(),
      plateState: this.plateState(),
      queue,
      hint: this.hint(),
    };
    this.events.hud(this.hud);
  }

  /** Screen positions of the crate / grill / bin labels (CSS pixels within the canvas). */
  private emitLabels() {
    if (this.phase === "loading" || this.phase === "error" || !this.pans.length) return;
    this.camera.updateMatrixWorld();
    const out: Label[] = [];
    const project = (v: THREE.Vector3) => {
      const p = v.clone().project(this.camera);
      return { x: ((p.x + 1) / 2) * this.viewW, y: ((1 - p.y) / 2) * this.viewH };
    };
    CRATES.forEach((c, i) => {
      const p = project(this.L.crates[i].clone().add(V(0, 0.95, 0.15)));
      out.push({ id: c.id, ...p, text: c.label, key: c.key, locked: c.unlock > this.plan.day ? c.unlock : 0 });
    });
    const L = this.L;
    out.push({ id: "grill", ...project(V(L.stoveX, 0.62, FRONT_Z + 1.3)), text: "Grill", key: "G", locked: 0 });
    out.push({ id: "bin", ...project(V(L.bin.x, L.bin.y + 1.75 * L.binScale, L.bin.z)), text: "Bin", key: "X", locked: 0 });
    out.push({ id: "plate", ...project(V(L.plate.x, TOP + 0.02, L.plate.z + 0.9)), text: "Serve", key: "Enter", locked: 0 });
    this.events.labels(out);
  }

  // --- Camera -----------------------------------------------------------------------------------------

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    this.viewW = Math.max(1, el.clientWidth);
    this.viewH = Math.max(1, el.clientHeight);
    this.renderer.setSize(this.viewW, this.viewH, false);
    this.camera.aspect = this.viewW / this.viewH;
    this.portrait = this.camera.aspect < 0.9;
    if (this.phase === "menu" && this.relayout()) {
      this.clearPeople();
      this.resetKitchen();
      this.setupMenuScene();
    } else if (this.phase === "dayover") this.relayout();
    this.fitCamera();
    this.emitLabels();
  }

  /** Frames the kitchen and the customers' order bubbles, leaving room for the HUD. */
  private fitCamera() {
    const cam = this.camera;
    const portrait = this.portrait;
    cam.fov = this.L.fov;
    cam.updateProjectionMatrix();
    this.camPitch = THREE.MathUtils.degToRad(this.L.pitch);
    const pts = this.L.fit;
    const h = this.viewH;
    const w = this.viewW;
    // Room for the HUD; on phones the kitchen sits low, near the thumbs.
    const top = 1 - (2 * (portrait ? 175 : 78)) / h;
    const bottom = -1 + (2 * (portrait ? 112 : 104)) / h;
    const side = 1 - (2 * (portrait ? 6 : 24)) / w;
    const target = new THREE.Vector3(0.4, 1.6, 0.6);
    const dir = new THREE.Vector3(0, Math.sin(this.camPitch), Math.cos(this.camPitch));
    const bounds = (d: number) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        const v = p.clone().project(cam);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      return { minX, maxX, minY, maxY };
    };
    let d = 16;
    for (let iter = 0; iter < 5; iter++) {
      let lo = 4;
      let hi = 90;
      for (let i = 0; i < 28; i++) {
        const mid = (lo + hi) / 2;
        const b = bounds(mid);
        const fits = b.maxX <= side && b.minX >= -side && b.maxY <= top && b.minY >= bottom;
        if (fits) hi = mid;
        else lo = mid;
      }
      d = hi;
      const b = bounds(d);
      const halfH = d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const halfW = halfH * cam.aspect;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2 - (top + bottom) / 2;
      const right = new THREE.Vector3(1, 0, 0);
      const up = new THREE.Vector3(0, Math.cos(this.camPitch), -Math.sin(this.camPitch));
      target.addScaledVector(right, cx * halfW * 0.9).addScaledVector(up, cy * halfH * 0.9);
    }
    this.camTarget.copy(target);
    this.camDist = d;
    this.placeCamera(0);
  }

  private placeCamera(sway: number) {
    const cam = this.camera;
    const yaw = sway;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(yaw) * Math.cos(this.camPitch));
    cam.position.copy(this.camTarget).addScaledVector(dir, this.camDist);
    if (this.shake > 0) cam.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(this.shake * 0.12));
    cam.lookAt(this.camTarget);
  }

  // --- Frame ------------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), this.maxDt);
    if (this.phase === "loading" || this.phase === "error") return;

    const live = this.phase === "playing";
    if (live) this.updateDay(dt);
    else if (this.phase === "menu") this.updateMenu(dt);

    if (this.phase !== "paused") {
      this.elapsed += dt;
      this.updateCustomers(dt, live);
      this.updatePans(dt, live);
      this.updateTweens(dt);
      this.updatePopups(dt);
      this.particles.update(dt);
      this.updateGlow(dt);
      this.shake = Math.max(0, this.shake - dt);
      if (this.hudDirty) this.refreshMatches();
    }
    this.placeCamera(this.phase === "menu" ? Math.sin(this.elapsed * 0.15) * 0.06 : 0);
    if (live) this.emitHud();
    this.renderer.render(this.scene, this.camera);
  };
}

// --- Helpers ----------------------------------------------------------------------------------------

function sameStack(a: readonly Layer[], b: readonly Layer[]) {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

/** Gives an object its own copies of its materials (so it can glow on its own). */
function ownMaterials(root: THREE.Object3D) {
  const mats: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const own = list.map((m) => {
      const c = m.clone() as THREE.MeshStandardMaterial;
      if (c.emissive) mats.push(c);
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? own : own[0];
  });
  return mats;
}

function setShadows(obj: THREE.Object3D, on: boolean) {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = on;
  });
}
