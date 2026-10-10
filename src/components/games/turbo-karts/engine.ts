import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, type LoadedModel, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { TURBO_LAP } from "../shared/songs";
import { AiDriver, speedProfile, type Hazard } from "./ai";
import { Sfx } from "./audio";
import { makeBubbleMaterial, makeCheckerTexture, makeChevronTexture, Puffs, SkidMarks, Sparks } from "./fx";
import { Kart, KART_R, MAX_COINS, type ItemKind, type KartEvents, type KartInput } from "./kart";
import { DRIVERS, ITEMS, MODELS, PROPS, ROAD, WALLS } from "./manifest";
import { buildTrack, clearance, DECK_HALF, indexAt, LAPS, locate, pointAt, ROAD_HALF, TILE, TRACKS, WALL_HALF, type Track } from "./tracks";

// --- Public types -----------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "intro" | "countdown" | "racing" | "paused" | "finished" | "results" | "podium" | "error";
export type Mode = "cup" | "time";

export const CLASSES = [
  { name: "Rookie", top: 22.5, skill: [0.9, 0.95] },
  { name: "Pro", top: 26, skill: [0.93, 0.985] },
  { name: "Turbo", top: 29.5, skill: [0.955, 1.0] },
] as const;

export const POINTS = [10, 8, 6, 4, 2];

export interface RaceConfig {
  mode: Mode;
  driver: number;
  cls: number;
  track: number;
}

export interface Hud {
  place: number;
  racers: number;
  lap: number;
  laps: number;
  time: number;
  lapTime: number;
  lastLap: number | null;
  bestLap: number | null;
  item: ItemKind | null;
  itemCount: number;
  rolling: boolean;
  coins: number;
  speed: number;
  drift: number;
  boost: boolean;
  shield: boolean;
  /** 3, 2, 1, 0 = GO, null otherwise. */
  countdown: number | null;
  wrongWay: boolean;
  toast: string | null;
  toastId: number;
  order: number[];
  track: number;
  race: number;
  mode: Mode;
}

export interface Standing {
  driver: number;
  place: number;
  time: number | null;
  bestLap: number | null;
  points: number;
  total: number;
  player: boolean;
}

export interface RaceResult {
  mode: Mode;
  track: number;
  race: number;
  standings: Standing[];
  cup: Standing[];
  cupOver: boolean;
  time: number;
  lapTimes: number[];
  bestLap: number;
  place: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  result(result: RaceResult): void;
  error(message: string): void;
}

// --- Helpers ----------------------------------------------------------------------------------------

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const ease = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const KART_WIDTH = 2.0;
const SPARK_COLORS = [new THREE.Color("#fff3c4"), new THREE.Color("#4fb3ff"), new THREE.Color("#ff8a1c"), new THREE.Color("#e15cff")];
const FLAME = [new THREE.Color("#ffd166"), new THREE.Color("#ff7b1c"), new THREE.Color("#ff4d1c")];
const WALL_SPARK = new THREE.Color("#ffd27a");
const CONFETTI = ["#f97316", "#facc15", "#22d3ee", "#a78bfa", "#f472b6", "#4ade80"].map((c) => new THREE.Color(c));
const ITEM_TABLE: [ItemKind, number][][] = [
  [
    ["banana", 0.45],
    ["coins", 0.3],
    ["shield", 0.25],
  ],
  [
    ["banana", 0.35],
    ["boost", 0.25],
    ["shield", 0.2],
    ["coins", 0.2],
  ],
  [
    ["boost", 0.35],
    ["banana", 0.25],
    ["shield", 0.2],
    ["triple", 0.1],
    ["coins", 0.1],
  ],
  [
    ["boost", 0.4],
    ["triple", 0.25],
    ["shield", 0.2],
    ["banana", 0.15],
  ],
  [
    ["triple", 0.45],
    ["boost", 0.35],
    ["shield", 0.2],
  ],
];

/** Racing Kit models are unlit; give them shading and shadows (one lit copy per material). */
const litCache = new Map<string, THREE.Material>();
function lit(material: THREE.Material): THREE.Material {
  const m = material as THREE.MeshBasicMaterial;
  if (!m.isMeshBasicMaterial) return material;
  let out = litCache.get(m.uuid);
  if (!out) {
    out = new THREE.MeshStandardMaterial({ color: m.color.clone(), map: m.map, roughness: 0.82, metalness: 0, transparent: m.transparent, opacity: m.opacity, side: m.side });
    out.name = m.name;
    litCache.set(m.uuid, out);
  }
  return out;
}

/** Copies a mesh's geometry into plain float attributes and bakes a transform into it. */
function bake(src: THREE.BufferGeometry, matrix: THREE.Matrix4, withUv: boolean) {
  const out = new THREE.BufferGeometry();
  const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number) => {
    const arr = new Float32Array(attr.count * size);
    for (let i = 0; i < attr.count; i++) {
      arr[i * size] = attr.getX(i);
      arr[i * size + 1] = attr.getY(i);
      if (size > 2) arr[i * size + 2] = attr.getZ(i);
    }
    return new THREE.BufferAttribute(arr, size);
  };
  const pos = src.attributes.position;
  out.setAttribute("position", copy(pos, 3));
  if (src.attributes.normal) out.setAttribute("normal", copy(src.attributes.normal, 3));
  if (withUv) {
    if (src.attributes.uv) out.setAttribute("uv", copy(src.attributes.uv, 2));
    else out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  if (src.index) out.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array as ArrayLike<number>), 1));
  else out.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: pos.count }, (_, i) => i), 1));
  out.applyMatrix4(matrix);
  if (!src.attributes.normal) out.computeVertexNormals();
  return out;
}

/** Collects the static scenery and merges it per material and map chunk (few draw calls). */
class StaticBuilder {
  private readonly groups = new Map<string, { material: THREE.Material; parts: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  private readonly tmp = new THREE.Matrix4();

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, cast: boolean, receive: boolean) {
    const e = matrix.elements;
    const chunk = `${Math.floor(e[12] / 80)},${Math.floor(e[14] / 80)}`;
    const withUv = !!(material as THREE.MeshStandardMaterial).map;
    const key = `${material.uuid}|${cast}|${receive}|${chunk}|${withUv}`;
    let group = this.groups.get(key);
    if (!group) this.groups.set(key, (group = { material, parts: [], cast, receive }));
    group.parts.push(bake(geometry, matrix, withUv));
  }

  addScene(scene: THREE.Object3D, matrix: THREE.Matrix4, mat: (m: THREE.Material) => THREE.Material, cast: boolean, receive: boolean) {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.tmp.multiplyMatrices(matrix, mesh.matrixWorld);
      this.add(mesh.geometry, mat(mesh.material as THREE.Material), this.tmp, cast, receive);
    });
  }

  build(parent: THREE.Object3D) {
    for (const g of this.groups.values()) {
      const merged = mergeGeometries(g.parts, false);
      g.parts.forEach((p) => p.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, g.material);
      mesh.castShadow = g.cast;
      mesh.receiveShadow = g.receive;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

interface Pickup {
  obj: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  /** Seconds until it is back (0 = present). */
  away: number;
  phase: number;
}

interface Banana {
  obj: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  s: number;
  d: number;
  age: number;
}

interface Racer {
  kart: Kart;
  ai: AiDriver;
  bubble: THREE.Mesh;
  pendingItem: ItemKind | null;
  lastPad: number;
  stuck: number;
  dust: number;
  sparkAcc: number;
  /** Seconds spent in another kart's slipstream. */
  slip: number;
}

// --- Game -------------------------------------------------------------------------------------------

export class TurboKartsGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  private readonly sun = new THREE.DirectionalLight("#fff2dc", 2.4);
  private readonly hemi = new THREE.HemisphereLight("#e3f2ff", "#6f8f6a", 1.2);
  private readonly ground: THREE.Mesh;
  private readonly sky: THREE.Mesh;
  private readonly circuit = new THREE.Group();
  private readonly dynamic = new THREE.Group();
  private readonly timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private coarse = false;
  private portrait = false;
  private viewH = 1;

  private models = new Map<string, LoadedModel>();
  private readonly protos = new Map<string, Proto>();
  private readonly rawBoxes = new Map<string, THREE.Box3>();
  private readonly sparks = new Sparks();
  private readonly skids = new SkidMarks();
  private puffs: Puffs | null = null;
  private readonly circuitMaterials: THREE.Material[] = [];
  private readonly circuitTextures: THREE.Texture[] = [];
  private readonly bubbleGeometry = new THREE.SphereGeometry(1.9, 28, 18);
  private readonly bubbleMaterial = makeBubbleMaterial("#7dd3fc");
  private readonly chevron: THREE.Texture;
  private readonly checker: THREE.Texture;
  private gantryLamps: THREE.MeshStandardMaterial | null = null;
  private padDecals: THREE.Mesh[] = [];

  private track: Track | null = null;
  private trackIndex = -1;
  private vmax = new Float32Array(0);
  private boostRanges: [number, number][] = [];
  private karts: Kart[] = [];
  private racers: Racer[] = [];
  private player: Racer | null = null;
  private boxes: Pickup[] = [];
  private coins: Pickup[] = [];
  private bananas: Banana[] = [];
  private bananaPool: THREE.Object3D[] = [];

  private phase: Phase = "loading";
  private pausedFrom: Phase = "racing";
  private config: RaceConfig = { mode: "cup", driver: 0, cls: 1, track: 0 };
  private race = 0;
  private cupPoints = [0, 0, 0, 0, 0];
  private lastPlaces: number[] = [];
  private podiumBlocks: THREE.Object3D[] = [];
  private readonly podiumGround = new Map<Kart, number>();
  private gridOrder: number[] = [];
  private raceTime = 0;
  private phaseT = 0;
  private countdownShown = -1;
  private throttleDownAt = -10;
  private throttleWasDown = false;
  private finishPlace = 0;
  private resultSent = false;
  private elapsed = 0;
  private menuDriver = 0;
  private menuSpin = 0;

  // Input
  private readonly keys = new Set<string>();
  private readonly touch = { steer: 0, gas: false, brake: false, drift: false };
  autoGas = false;
  private itemQueued = false;
  private lookBack = false;

  // Camera
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private camYaw = 0;
  private camInit = false;
  private shake = 0;
  private fovKick = 0;

  // HUD
  private hud: Hud = {
    place: 1,
    racers: 5,
    lap: 1,
    laps: LAPS,
    time: 0,
    lapTime: 0,
    lastLap: null,
    bestLap: null,
    item: null,
    itemCount: 0,
    rolling: false,
    coins: 0,
    speed: 0,
    drift: 0,
    boost: false,
    shield: false,
    countdown: null,
    wrongWay: false,
    toast: null,
    toastId: 0,
    order: [],
    track: 0,
    race: 0,
    mode: "cup",
  };
  private hudAt = 0;
  private toast: string | null = null;
  private toastT = 0;
  private toastId = 0;
  private wrongWasOn = false;
  private minimap: { canvas: HTMLCanvasElement; base: HTMLCanvasElement | null; at: number } | null = null;

  private readonly kartEvents: KartEvents = {
    wall: (k, impact) => {
      if (impact > 3) {
        const n = Math.min(14, Math.round(impact));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          this.sparks.emit(k.x + Math.sin(k.heading) * 1.2, k.y + 0.6, k.z + Math.cos(k.heading) * 1.2, Math.cos(a) * 6, 2 + Math.random() * 4, Math.sin(a) * 6, WALL_SPARK, 0.35, 0.35, 3, 14);
        }
      }
      if (k === this.player?.kart) {
        this.sfx.wall(impact);
        this.shake = Math.max(this.shake, Math.min(0.5, impact * 0.03));
      }
    },
    land: (k, hard) => {
      if (this.near(k)) this.sfx.land(hard);
      for (let i = 0; i < 3; i++) this.puffs?.emit(k.x + (Math.random() - 0.5) * 2, k.y + 0.3, k.z + (Math.random() - 0.5) * 2, 1.4 + hard, 0.6, 0, 1, 0);
      if (k === this.player?.kart) this.shake = Math.max(this.shake, hard * 0.35);
    },
    hop: (k) => {
      if (k === this.player?.kart) this.sfx.hop();
    },
    driftLevel: (k, level) => {
      if (k === this.player?.kart) this.sfx.driftLevel(level);
    },
    miniTurbo: (k, level) => {
      if (this.near(k)) this.sfx.miniTurbo(level);
      const c = SPARK_COLORS[Math.min(3, level)];
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        this.sparks.emit(k.x - Math.sin(k.heading) * 1.4, k.y + 0.5, k.z - Math.cos(k.heading) * 1.4, Math.cos(a) * 5, Math.random() * 4, Math.sin(a) * 5, c, 0.5, 0.45, 3, 6);
      }
      if (k === this.player?.kart) {
        this.fovKick = Math.max(this.fovKick, 5);
        if (level >= 2 && !k.trick) this.say(level === 3 ? "Ultra mini-turbo!" : "Mini-turbo!");
      }
    },
    trick: (k) => {
      if (k === this.player?.kart) {
        this.sfx.trick();
        this.say("Trick!");
      }
    },
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.autoGas = this.coarse;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.coarse ? 1.6 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const { scene } = this;
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(800, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color("#3d8fe0") }, horizon: { value: new THREE.Color("#cfe8f7") } },
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0); }",
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.camera.add(this.sky);
    scene.add(this.camera);
    scene.fog = new THREE.Fog("#cfe8f7", 140, 420);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.35;

    scene.add(this.hemi);
    const { sun } = this;
    sun.castShadow = true;
    const map = this.coarse ? 1024 : 2048;
    sun.shadow.mapSize.set(map, map);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
    scene.add(sun, sun.target);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshStandardMaterial({ color: "#79bf93", roughness: 1 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.03;
    this.ground.receiveShadow = true;
    scene.add(this.ground, this.circuit, this.dynamic, this.sparks.points, this.skids.mesh);

    this.chevron = makeChevronTexture();
    this.checker = makeCheckerTexture();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Loading -----------------------------------------------------------------------------------

  async load(sizes: Record<string, number>) {
    try {
      this.models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const missing = MODELS.filter((k) => !this.models.has(k));
      const required = [...DRIVERS.map((d) => d.key), ITEMS.box, ITEMS.banana, ITEMS.coin, ...TRACKS.flatMap((t) => [t.roadLong])];
      if (required.some((k) => !this.models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");
      if (missing.length) console.warn("[turbo-karts] missing models", missing);

      for (const m of this.models.values()) {
        m.scene.updateMatrixWorld(true);
        m.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.material = lit(mesh.material as THREE.Material);
        });
      }

      const proto = (key: string, fit: Parameters<typeof makeProto>[2], opts?: { shadows?: boolean; receive?: boolean }, protoKey = key) => {
        const m = this.models.get(key);
        if (!m) return;
        this.protos.set(protoKey, makeProto(m.scene.clone(), m.animations, fit, opts));
      };
      for (const d of DRIVERS) proto(d.key, { width: KART_WIDTH });
      proto(ITEMS.box, { height: 1.9 });
      proto(ITEMS.banana, { width: 1.5 });
      proto(ITEMS.coin, { height: 1.15 }, { shadows: false });
      proto(ITEMS.smoke, { height: 1 }, { shadows: false });
      this.puffs = new Puffs(this.protos, this.dynamic, ITEMS.smoke);

      // One kart per driver for the whole session.
      this.karts = DRIVERS.map((d, i) => {
        const obj = this.protos.get(d.key)!.object;
        const kart = new Kart(i, d, false, obj);
        this.dynamic.add(kart.root);
        return kart;
      });

      this.buildCircuit(0);
      this.warmUp();
      this.toMenu();
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  /** Compiles the shaders of things that only appear mid-race (bananas, smoke, shields, podium). */
  private warmUp() {
    const group = new THREE.Group();
    const add = (o: THREE.Object3D | undefined) => o && group.add(o);
    add(this.protos.get(ITEMS.banana)?.object.clone());
    add(this.protos.get(ITEMS.smoke)?.object.clone());
    const bubble = new THREE.Mesh(this.bubbleGeometry, this.bubbleMaterial);
    add(bubble);
    const deck = this.models.get(ROAD.deck);
    if (deck) add(makeProto(deck.scene.clone(), [], { box: { x: 3, y: 1, z: 3 } }, { shadows: true, receive: true }).object);
    group.position.copy(this.camera.position);
    this.scene.add(group);
    try {
      this.renderer.compile(this.scene, this.camera);
    } finally {
      group.removeFromParent();
    }
  }

  private rawBox(key: string) {
    let box = this.rawBoxes.get(key);
    if (!box) {
      const m = this.models.get(key);
      box = m ? new THREE.Box3().setFromObject(m.scene, true) : new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
      this.rawBoxes.set(key, box);
    }
    return box;
  }

  // --- Circuit ------------------------------------------------------------------------------------

  private clearCircuit() {
    for (const child of [...this.circuit.children]) {
      child.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.userData.ownGeometry !== false) mesh.geometry.dispose();
      });
      child.removeFromParent();
    }
    this.circuitMaterials.forEach((m) => m.dispose());
    this.circuitMaterials.length = 0;
    this.circuitTextures.forEach((t) => t.dispose());
    this.circuitTextures.length = 0;
    this.gantryLamps = null;
    this.padDecals = [];
    for (const p of [...this.boxes, ...this.coins]) p.obj.removeFromParent();
    this.boxes = [];
    this.coins = [];
    this.clearBananas();
  }

  private buildCircuit(index: number) {
    if (index === this.trackIndex) return;
    this.clearCircuit();
    this.trackIndex = index;
    const def = TRACKS[index];
    const track = buildTrack(def);
    this.track = track;
    const { theme } = def;
    const { samples } = track;
    const n = samples.length;

    // Sky, light and ground.
    const skyMat = this.sky.material as THREE.ShaderMaterial;
    skyMat.uniforms.top.value.set(theme.skyTop);
    skyMat.uniforms.horizon.value.set(theme.skyHorizon);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(theme.skyHorizon);
    fog.near = theme.fogNear;
    fog.far = theme.fogFar;
    this.scene.background = new THREE.Color(theme.skyHorizon);
    (this.ground.material as THREE.MeshStandardMaterial).color.set(theme.ground);
    this.sun.color.set(theme.sun);
    this.sun.intensity = theme.sunIntensity;
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.hemi.intensity = theme.hemiIntensity;
    this.renderer.toneMappingExposure = theme.exposure;

    // Track-tinted copies of the grass material.
    const tinted = new Map<string, THREE.Material>();
    const mat = (m: THREE.Material) => {
      if (m.name !== "grass") return m;
      let t = tinted.get(m.uuid);
      if (!t) {
        const c = (m as THREE.MeshStandardMaterial).clone();
        c.color.set(theme.grass);
        tinted.set(m.uuid, c);
        this.circuitMaterials.push(c);
        t = c;
      }
      return t;
    };

    const builder = new StaticBuilder();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const addModel = (key: string, matrix: THREE.Matrix4, cast = true, receive = false) => {
      const model = this.models.get(key);
      if (model) builder.addScene(model.scene, matrix, mat, cast, receive);
    };

    // Road tiles and corner kerbs.
    for (const piece of track.pieces) {
      m4.compose(v.set(piece.x, 0, piece.z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, piece.rot), sc.setScalar(TILE));
      piece.keys.forEach((key, i) => addModel(key, m4, i === 0 && piece.kind.startsWith("deck"), true));
    }

    /** A model grounded and centred on (x, z), scaled to a height (or the kit scale), turned by yaw. */
    const prop = (key: string, x: number, z: number, yaw: number, opts: { height?: number; scale?: number; y?: number; cast?: boolean; box?: THREE.Vector3 } = {}) => {
      if (!this.models.has(key)) return 0;
      const box = this.rawBox(key);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = opts.scale ?? (opts.height ? opts.height / size.y : TILE);
      const scale = opts.box ?? new THREE.Vector3(s, s, s);
      const inner = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
      m4.compose(v.set(x, opts.y ?? 0, z), q.setFromEuler(e.set(0, yaw, 0)), scale).multiply(inner);
      addModel(key, m4, opts.cast ?? true, false);
      return Math.max(size.x * scale.x, size.z * scale.z) / 2;
    };

    /** A wall piece stretched from a to b. */
    const segment = (key: string, ax: number, ay: number, az: number, bx: number, by: number, bz: number, height: number, thick: number) => {
      if (!this.models.has(key)) return;
      const box = this.rawBox(key);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      const yaw = Math.atan2(-(bz - az), bx - ax);
      const pitch = Math.atan2(by - ay, Math.hypot(bx - ax, bz - az));
      const inner = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
      e.set(0, yaw, pitch, "YZX");
      m4.compose(v.set((ax + bx) / 2, Math.min(ay, by) + Math.abs(by - ay) / 2 - 0.05, (az + bz) / 2), q.setFromEuler(e), sc.set(len / size.x + 0.02, height / size.y, thick / size.z)).multiply(inner);
      addModel(key, m4, true, true);
      e.set(0, 0, 0, "XYZ");
    };

    // Walls along both sides, following the wall lines (and rails on ramps and the bridge).
    const wallStyle = def.walls;
    for (const side of [1, -1] as const) {
      const step = wallStyle === "blocks" ? 3 : 6;
      let toggle = 0;
      for (let i = 0; i < n; i += step) {
        const a = samples[i];
        const j = Math.min(i + step, n) % n;
        const b = samples[j];
        const elevated = a.elevated || b.elevated;
        const jump = a.kind === "jump" || b.kind === "jump" || a.kind === "jumpDown" || b.kind === "jumpDown";
        const wa = elevated ? DECK_HALF : jump ? 0.5 * TILE : side > 0 ? a.wallL : a.wallR;
        const wb = elevated ? DECK_HALF : jump ? 0.5 * TILE : side > 0 ? b.wallL : b.wallR;
        const thick = elevated ? 0.3 : wallStyle === "rail" ? 0.4 : 0.9;
        const off = elevated ? -0.15 : thick / 2;
        const ax = a.x + a.tz * (wa + off) * side;
        const az = a.z - a.tx * (wa + off) * side;
        const bx = b.x + b.tz * (wb + off) * side;
        const bz = b.z - b.tx * (wb + off) * side;
        const centre = Math.hypot(b.x - a.x, b.z - a.z);
        if (Math.hypot(bx - ax, bz - az) < centre * 0.4) continue;
        if (a.kind === "under" || b.kind === "under") continue;
        if (!elevated) {
          const clear = Math.min(clearance(track, ax, az, a.s, 36), clearance(track, bx, bz, b.s, 36), clearance(track, (ax + bx) / 2, (az + bz) / 2, a.s, 36));
          if (clear < WALL_HALF + 0.6) continue;
        }
        if (elevated) segment(WALLS.rail, ax, a.y, az, bx, b.y, bz, 1.4, 0.3);
        else if (jump) segment(WALLS.fence, ax, 0, az, bx, 0, bz, 4.2, 0.35);
        else if (wallStyle === "barrier") segment(WALLS.barrier, ax, 0, az, bx, 0, bz, 1.15, thick);
        else if (wallStyle === "blocks") segment(toggle++ % 2 ? WALLS.white : WALLS.red, ax, 0, az, bx, 0, bz, 1.15, thick);
        else segment(WALLS.railDouble, ax, 0, az, bx, 0, bz, 1.45, thick);
      }
    }

    // Occupied spots so scenery doesn't overlap.
    const spots: { x: number; z: number; r: number }[] = [];
    const free = (x: number, z: number, r: number) => spots.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + r);
    const roadClear = (x: number, z: number, r: number) => clearance(track, x, z) > WALL_HALF + 1 + r;

    // Arches across the road.
    for (const arch of def.arches) {
      const p = pointAt(track, arch.at * track.length, 0);
      prop(arch.key, p.x, p.z, p.heading, { height: arch.key === PROPS.overheadRound ? 10 : 8.5, box: undefined });
    }

    // Start / finish: gantry with lamps (kept separate so the lamps can light up), checkered line, flags.
    {
      const p = pointAt(track, 0, 0);
      const gantry = this.models.get(PROPS.overheadLights);
      if (gantry) {
        const obj = gantry.scene.clone();
        const box = this.rawBox(PROPS.overheadLights);
        const center = box.getCenter(new THREE.Vector3());
        const s = 16.5 / box.getSize(new THREE.Vector3()).x;
        const holder = new THREE.Group();
        obj.position.set(-center.x, -box.min.y, -center.z);
        const scaled = new THREE.Group();
        scaled.scale.setScalar(s);
        scaled.add(obj);
        holder.add(scaled);
        holder.position.set(p.x, 0, p.z);
        holder.rotation.y = p.heading;
        const lamps = new THREE.MeshStandardMaterial({ color: "#3a1010", emissive: "#ff2a1a", emissiveIntensity: 0.2, roughness: 0.4 });
        this.circuitMaterials.push(lamps);
        obj.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.userData.ownGeometry = false;
          mesh.castShadow = true;
          if ((mesh.material as THREE.Material).name === "red") mesh.material = lamps;
        });
        this.gantryLamps = lamps;
        this.circuit.add(holder);
      }
      const checkerMat = new THREE.MeshStandardMaterial({ map: this.checker, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
      this.circuitMaterials.push(checkerMat);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 1.6), checkerMat);
      line.rotation.set(-Math.PI / 2, 0, 0);
      const holder = new THREE.Group();
      holder.position.set(p.x, 0.025, p.z);
      holder.rotation.y = p.heading;
      line.receiveShadow = true;
      holder.add(line);
      this.circuit.add(holder);
      for (const side of [1, -1]) {
        const f = pointAt(track, 2, (WALL_HALF + 2.2) * side);
        prop(PROPS.flagCheckers, f.x, f.z, f.heading + Math.PI / 2, { height: 9 });
        spots.push({ x: f.x, z: f.z, r: 2 });
        // Starting lights beside the grid.
        const l = pointAt(track, track.length - 4, (WALL_HALF + 1.6) * side);
        prop(PROPS.lightColored, l.x, l.z, l.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2), { height: 6.5 });
        spots.push({ x: l.x, z: l.z, r: 1.5 });
      }
    }

    // Boost pads: glowing chevrons over the arrow tiles.
    this.boostRanges = [];
    {
      let start = -1;
      for (let i = 0; i <= n; i++) {
        const isPad = i < n && samples[i].kind === "boost";
        if (isPad && start < 0) start = i;
        if (!isPad && start >= 0) {
          const s0 = samples[start].s;
          const s1 = samples[i - 1].s;
          this.boostRanges.push([s0, s1]);
          const mid = pointAt(track, (s0 + s1) / 2, 0);
          const decalMat = new THREE.MeshBasicMaterial({ map: this.chevron, color: "#ff8a1c", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
          this.circuitMaterials.push(decalMat);
          const decal = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 10.4), decalMat);
          decal.rotation.set(-Math.PI / 2, 0, 0);
          const holder = new THREE.Group();
          holder.position.set(mid.x, mid.y + 0.04, mid.z);
          // The chevrons point along the driving direction.
          holder.rotation.y = mid.heading + Math.PI;
          holder.add(decal);
          this.circuit.add(holder);
          this.padDecals.push(decal);
          start = -1;
        }
      }
    }

    // Rows of scenery along the track.
    const random = rng(def.seed);
    for (const row of def.along) {
      let k = 0;
      for (let s = row.from * track.length; s <= row.to * track.length; s += row.every) {
        const key = row.keys[k++ % row.keys.length];
        if (!this.models.has(key)) continue;
        const box = this.rawBox(key);
        const size = box.getSize(new THREE.Vector3());
        const scale = row.height ? row.height / size.y : TILE;
        const depth = (row.face ? size.z : size.x) * scale;
        const i = indexAt(track, s);
        const sample = samples[i];
        const wall = row.side > 0 ? sample.wallL : sample.wallR;
        if (sample.elevated || sample.kind === "under" || sample.kind === "jump" || sample.kind === "jumpDown") continue;
        const d = (Math.max(wall, WALL_HALF) + row.offset + depth / 2) * row.side;
        const p = pointAt(track, s, d);
        const r = Math.max(size.x, size.z) * scale * 0.5;
        if (!free(p.x, p.z, r * 0.8) || clearance(track, p.x, p.z) < WALL_HALF + 0.4 + (row.face ? depth / 2 : r) * 0.85) continue;
        // Facing the track: the models' fronts are +z.
        const yaw = row.face ? p.heading + (row.side > 0 ? -Math.PI / 2 : Math.PI / 2) : p.heading + Math.PI / 2;
        prop(key, p.x, p.z, yaw, { scale });
        spots.push({ x: p.x, z: p.z, r: r * 0.9 });
      }
    }

    // Scattered trees, rocks and tents.
    const { minX, maxX, minZ, maxZ } = track.bounds;
    for (const sc2 of def.scatter) {
      let placed = 0;
      for (let tries = 0; tries < sc2.count * 12 && placed < sc2.count; tries++) {
        const x = minX - sc2.far + random() * (maxX - minX + sc2.far * 2);
        const z = minZ - sc2.far + random() * (maxZ - minZ + sc2.far * 2);
        const c = clearance(track, x, z);
        if (c < WALL_HALF + sc2.near || c > WALL_HALF + sc2.far) continue;
        const key = sc2.keys[Math.floor(random() * sc2.keys.length)];
        if (!this.models.has(key)) continue;
        const box = this.rawBox(key);
        const size = box.getSize(new THREE.Vector3());
        const h = sc2.height[0] === 0 ? size.y * TILE : sc2.height[0] + random() * (sc2.height[1] - sc2.height[0]);
        const scale = h / size.y;
        const r = Math.max(size.x, size.z) * scale * 0.5;
        if (!free(x, z, r) || !roadClear(x, z, r * 0.6)) continue;
        prop(key, x, z, random() * Math.PI * 2, { scale });
        spots.push({ x, z, r });
        placed++;
      }
    }

    builder.build(this.circuit);

    // Item boxes: rows of four across the road.
    const boxProto = this.protos.get(ITEMS.box)!;
    for (const f of def.items) {
      for (const d of [-3.1, -1.05, 1.05, 3.1]) {
        const p = pointAt(track, f * track.length, d);
        const obj = boxProto.object.clone();
        obj.position.set(p.x, p.y + 0.6, p.z);
        this.dynamic.add(obj);
        this.boxes.push({ obj, x: p.x, y: p.y + 0.6, z: p.z, away: 0, phase: Math.random() * 6 });
      }
    }
    // Coin lines.
    const coinProto = this.protos.get(ITEMS.coin)!;
    for (const c of def.coins) {
      for (let k = 0; k < 5; k++) {
        const p = pointAt(track, c.at * track.length + k * 3.4, c.d);
        const obj = coinProto.object.clone();
        obj.position.set(p.x, p.y + 0.35, p.z);
        this.dynamic.add(obj);
        this.coins.push({ obj, x: p.x, y: p.y + 0.35, z: p.z, away: 0, phase: k * 0.5 });
      }
    }

    this.vmax = speedProfile(track, CLASSES[this.config.cls].top);
    if (this.minimap) this.minimap.base = null;
    this.events.hud({ ...this.hud, track: index });
  }

  // --- Public API ---------------------------------------------------------------------------------

  setDriver(index: number) {
    this.menuDriver = ((index % DRIVERS.length) + DRIVERS.length) % DRIVERS.length;
    this.config.driver = this.menuDriver;
    if (this.phase === "menu") {
      this.arrangeMenu();
      const k = this.karts[this.menuDriver];
      k.vy = 6;
      k.grounded = false;
      k.hopping = true;
      this.sfx.rev();
    }
  }

  /** Shows a circuit behind the menu (time-trial track picker). */
  previewTrack(index: number) {
    if (this.phase !== "menu") return;
    this.buildCircuit(index);
    this.arrangeMenu();
  }

  startCup(driver: number, cls: number) {
    this.config = { mode: "cup", driver, cls, track: 0 };
    this.race = 0;
    this.cupPoints = [0, 0, 0, 0, 0];
    this.gridOrder = [];
    this.startRace();
  }

  startTimeTrial(driver: number, cls: number, track: number) {
    this.config = { mode: "time", driver, cls, track };
    this.race = 0;
    this.startRace();
  }

  nextRace() {
    if (this.config.mode !== "cup" || this.race >= TRACKS.length - 1) return;
    this.race++;
    this.config.track = this.race;
    this.startRace();
  }

  restartRace() {
    if (this.config.mode === "cup") {
      // Undo nothing: points are only added when a race result is sent.
    }
    this.startRace();
  }

  showPodium() {
    this.setPhase("podium");
    this.phaseT = 0;
    this.sparks.clear();
    this.puffs?.clear();
    this.clearBananas();
    const order = this.cupOrder();
    const track = this.track!;
    // Winner in the middle on the tallest block, second and third either side.
    const spots = [
      [0, 0, 1.8],
      [-0.4, 3.9, 1.1],
      [-0.4, -3.9, 0.6],
    ];
    this.karts.forEach((k) => (k.root.visible = false));
    this.racers.forEach((r) => (r.bubble.visible = false));
    for (const b of this.podiumBlocks) b.removeFromParent();
    this.podiumBlocks = [];
    this.podiumGround.clear();
    const base = track.length - 14;
    order.slice(0, 3).forEach((driver, i) => {
      const k = this.karts[driver];
      const [ds, d, h] = spots[i];
      const p = pointAt(track, base + ds, d);
      // Facing back down the grid, towards the camera.
      k.place0(track, p.x, p.z, p.heading + Math.PI, p.i);
      k.y = h;
      k.root.visible = true;
      this.podiumGround.set(k, h);
      const deck = this.models.get(ROAD.deck);
      if (deck) {
        const block = makeProto(deck.scene.clone(), [], { box: { x: 3.3, y: h, z: 3.3 } }, { shadows: true, receive: true }).object;
        block.position.set(p.x, 0, p.z);
        block.rotation.y = p.heading;
        this.dynamic.add(block);
        this.podiumBlocks.push(block);
      }
    });
    music.play(TURBO_LAP, 2);
    this.sfx.finish(order[0] === this.config.driver ? 1 : 3);
  }

  private clearPodium() {
    for (const b of this.podiumBlocks) b.removeFromParent();
    this.podiumBlocks = [];
    this.podiumGround.clear();
  }

  toMenu() {
    this.clearPodium();
    this.sparks.clear();
    this.skids.clear();
    this.puffs?.clear();
    this.clearBananas();
    this.buildCircuit(this.config.mode === "time" ? this.config.track : 0);
    this.resetPickups();
    this.player = null;
    this.racers = [];
    this.keys.clear();
    this.sfx.idle(0.03);
    music.play(TURBO_LAP, 0);
    music.duck(false);
    this.setPhase("menu");
    this.arrangeMenu();
    this.camInit = false;
  }

  pause() {
    if (this.phase !== "racing" && this.phase !== "countdown" && this.phase !== "intro" && this.phase !== "finished") return;
    this.pausedFrom = this.phase;
    this.keys.clear();
    this.sfx.quiet();
    music.duck(true);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase(this.pausedFrom);
  }

  /** Skips the intro fly-by. */
  skipIntro() {
    if (this.phase === "intro") this.phaseT = 99;
  }

  get currentPhase() {
    return this.phase;
  }

  key(code: string, down: boolean) {
    if (down) {
      if (!this.keys.has(code) && (code === "KeyE" || code === "KeyK" || code === "Enter" || code === "NumpadEnter")) this.itemQueued = true;
      this.keys.add(code);
    } else this.keys.delete(code);
    this.lookBack = this.keys.has("KeyQ");
  }

  setTouch(patch: Partial<{ steer: number; gas: boolean; brake: boolean; drift: boolean }>) {
    Object.assign(this.touch, patch);
  }

  touchItem() {
    this.itemQueued = true;
  }

  releaseAll() {
    this.keys.clear();
    Object.assign(this.touch, { steer: 0, gas: false, brake: false, drift: false });
    this.lookBack = false;
  }

  setAutoGas(on: boolean) {
    this.autoGas = on;
  }

  setMinimap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas ? { canvas, base: null, at: 0 } : null;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    this.clearCircuit();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    for (const m of this.models.values()) disposeTree(m.scene);
    litCache.forEach((m) => m.dispose());
    litCache.clear();
    this.sparks.dispose();
    this.skids.dispose();
    this.chevron.dispose();
    this.checker.dispose();
    this.envTexture?.dispose();
    this.bubbleGeometry.dispose();
    this.bubbleMaterial.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    // The canvas (and its GL context) can be reused by the next mount: leave it in default state.
    this.renderer.resetState();
    this.renderer.dispose();
  }

  // --- Race setup ---------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  private arrangeMenu() {
    const track = this.track!;
    this.karts.forEach((k) => (k.root.visible = true));
    // The chosen kart in front of the start line; the others parked on the grid behind.
    const front = this.karts[this.menuDriver];
    const p = pointAt(track, track.length - 9, 0);
    front.place0(track, p.x, p.z, p.heading, p.i);
    let slot = 0;
    this.karts.forEach((k) => {
      if (k === front) return;
      const g = this.gridSlot(slot++ + 1);
      k.place0(track, g.x, g.z, g.heading, g.i);
    });
  }

  /** Grid slot k (0 = pole) — staggered pairs behind the line. */
  private gridSlot(k: number) {
    const track = this.track!;
    const s = track.length - 6 - k * 6.4;
    const d = (k % 2 === 0 ? 1 : -1) * 2.1;
    return pointAt(track, s, d);
  }

  /** Cup standings: points, then the latest race's finish breaks ties. */
  private cupOrder() {
    return DRIVERS.map((_, i) => i).sort((a, b) => this.cupPoints[b] - this.cupPoints[a] || (this.lastPlaces[a] ?? 9) - (this.lastPlaces[b] ?? 9) || a - b);
  }

  private startRace() {
    audio.unlock();
    this.clearPodium();
    const cfg = this.config;
    this.buildCircuit(cfg.track);
    this.vmax = speedProfile(this.track!, CLASSES[cfg.cls].top);
    const track = this.track!;
    this.sparks.clear();
    this.skids.clear();
    this.puffs?.clear();
    this.clearBananas();
    this.resetPickups(cfg.mode === "time");
    this.racers.forEach((r) => r.bubble.removeFromParent());

    // Grid: the player starts at the back of the first race; later races line up in reverse cup order.
    const others = DRIVERS.map((_, i) => i).filter((i) => i !== cfg.driver);
    let order: number[];
    if (cfg.mode === "time") order = [cfg.driver];
    else if (this.race === 0) {
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      order = [...others, cfg.driver];
    } else order = this.cupOrder().reverse();
    this.gridOrder = order;

    const [lo, hi] = CLASSES[cfg.cls].skill;
    this.karts.forEach((k) => (k.root.visible = false));
    this.racers = order.map((driver, slot) => {
      const kart = this.karts[driver];
      kart.root.visible = true;
      const g = cfg.mode === "time" ? pointAt(track, track.length - 8, 0) : this.gridSlot(slot);
      kart.place0(track, g.x, g.z, g.heading, g.i);
      kart.isPlayer = driver === cfg.driver;
      // Rivals: the further back they start, the a little sharper they drive.
      const skill = lo + (hi - lo) * (0.35 + 0.65 * (slot / Math.max(1, order.length - 1))) + (Math.random() - 0.5) * 0.01;
      const ai = new AiDriver(kart, driver === cfg.driver ? 0.98 : skill);
      ai.reaction = 0.05 + Math.random() * 0.35;
      ai.rocket = Math.random() < 0.45;
      const bubble = new THREE.Mesh(this.bubbleGeometry, this.bubbleMaterial);
      bubble.renderOrder = 6;
      bubble.visible = false;
      bubble.position.y = 1.2;
      kart.root.add(bubble);
      return { kart, ai, bubble, pendingItem: null, lastPad: -10, stuck: 0, dust: 0, sparkAcc: 0, slip: 0 };
    });
    this.racers.forEach((r, i) => (r.kart.place = i + 1));
    this.player = this.racers.find((r) => r.kart.driver === DRIVERS[cfg.driver]) ?? null;
    if (cfg.mode === "time" && this.player) {
      this.player.kart.item = "triple";
      this.player.kart.itemCount = 3;
    }
    this.raceTime = 0;
    this.phaseT = 0;
    this.countdownShown = -1;
    this.throttleDownAt = -10;
    this.throttleWasDown = false;
    this.finishPlace = 0;
    this.resultSent = false;
    this.itemQueued = false;
    this.keys.clear();
    this.toast = null;
    this.camInit = false;
    this.hud = { ...this.hud, lastLap: null, bestLap: null, toast: null, track: cfg.track, race: this.race, mode: cfg.mode, racers: this.racers.length };
    music.play(TURBO_LAP, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setPhase("intro");
    this.emitHud(true);
  }

  // --- Frame --------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const phase = this.phase;
    if (phase === "loading" || phase === "error") return;
    if (phase !== "paused") {
      this.elapsed += dt;
      this.phaseT += dt;
    }

    if (phase === "menu") this.updateMenu(dt);
    else if (phase === "intro") {
      this.idleKarts(dt);
      if (this.phaseT > 3.4) {
        this.phaseT = 0;
        this.setPhase("countdown");
      }
    } else if (phase === "countdown") this.updateCountdown(dt);
    else if (phase === "racing" || phase === "finished") this.updateRace(dt);
    else if (phase === "results") this.updateRace(dt);
    else if (phase === "podium") this.updatePodium(dt);

    if (phase !== "paused") {
      if (this.toastT > 0) {
        this.toastT -= dt;
        if (this.toastT <= 0) {
          this.toast = null;
          this.emitHud(true);
        }
      }
      this.animatePickups(dt);
      this.sparks.update(dt);
      this.puffs?.update(dt);
      this.bubbleMaterial.uniforms.time.value = this.elapsed;
      for (const d of this.padDecals) {
        const m = d.material as THREE.MeshBasicMaterial;
        if (m.map) m.map.offset.y = (this.elapsed * 1.2) % 1;
        m.opacity = 0.75 + Math.sin(this.elapsed * 8) * 0.25;
      }
    }
    this.updateCamera(phase === "paused" ? 0 : dt);
    this.updateSun();
    this.renderer.render(this.scene, this.camera);
    this.drawMinimap();
  };

  private idleKarts(dt: number) {
    const track = this.track!;
    for (const r of this.racers) r.kart.syncVisual(dt, track);
    this.sfx.idle(0.05);
  }

  private updateMenu(dt: number) {
    const track = this.track!;
    this.menuSpin += dt * 0.5;
    for (const k of this.karts) {
      if (!k.grounded) {
        k.vy -= 28 * dt;
        k.y += k.vy * dt;
        if (k.y <= k.pos.y) {
          k.y = k.pos.y;
          k.grounded = true;
          k.hopping = false;
        }
      }
      k.syncVisual(dt, track);
    }
  }

  private updateCountdown(dt: number) {
    const t = this.phaseT;
    const step = Math.floor(t);
    if (step !== this.countdownShown && step <= 3) {
      this.countdownShown = step;
      this.sfx.beep(step === 3);
      if (this.gantryLamps) {
        this.gantryLamps.emissive.set(step === 3 ? "#2bff6a" : "#ff2a1a");
        this.gantryLamps.emissiveIntensity = step === 3 ? 3 : 0.8 + step * 0.9;
      }
      this.emitHud(true);
    }
    // Rocket start: press the gas between "2" and GO.
    const gas = this.playerInput().throttle > 0;
    if (gas && !this.throttleWasDown) this.throttleDownAt = t;
    this.throttleWasDown = gas;
    for (const r of this.racers) {
      r.kart.syncVisual(dt, this.track!);
      if (gas && r === this.player) r.kart.body.position.y = Math.sin(this.elapsed * 60) * 0.02;
    }
    this.sfx.idle(gas ? 0.09 : 0.05);
    if (t >= 3) {
      this.phaseT = 0;
      this.raceTime = 0;
      for (const r of this.racers) {
        r.kart.lapStart = 0;
        r.kart.body.position.y = 0;
        if (r === this.player) {
          if (gas && this.throttleDownAt > 1.9 && this.throttleDownAt < 2.85) {
            r.kart.startBoost(1.1);
            this.sfx.boost(0.6);
            this.say("Rocket start!");
          }
        } else if (r.ai.rocket) {
          r.kart.startBoost(0.9);
          r.ai.reaction = 0;
        }
      }
      this.setPhase("racing");
    }
  }

  private playerInput(): KartInput & { item: boolean } {
    const k = this.keys;
    const left = k.has("KeyA") || k.has("ArrowLeft");
    const right = k.has("KeyD") || k.has("ArrowRight");
    let steer = (left ? 1 : 0) - (right ? 1 : 0);
    if (this.touch.steer) steer = this.touch.steer;
    const up = k.has("KeyW") || k.has("ArrowUp") || this.touch.gas;
    const down = k.has("KeyS") || k.has("ArrowDown") || this.touch.brake;
    const throttle = (up || (this.autoGas && !down)) && !down ? 1 : 0;
    return {
      throttle,
      brake: down ? 1 : 0,
      steer,
      drift: k.has("Space") || k.has("ShiftLeft") || k.has("ShiftRight") || this.touch.drift,
      item: this.itemQueued,
    };
  }

  private updateRace(dt: number) {
    const track = this.track!;
    const env = { top: CLASSES[this.config.cls].top, events: this.kartEvents };
    this.raceTime += dt;
    const hazards: Hazard[] = this.bananas.map((b) => ({ s: b.s, d: b.d }));
    const player = this.player;
    const world = {
      track,
      karts: this.racers.map((r) => r.kart),
      hazards,
      vmax: this.vmax,
      playerTotal: player && !player.kart.finished ? player.kart.total : null,
      top: env.top,
      time: this.elapsed,
    };

    for (const r of this.racers) {
      const k = r.kart;
      const human = r === player && !k.finished && this.phase === "racing";
      let input: KartInput;
      let useItem = false;
      if (human) {
        const pi = this.playerInput();
        input = pi;
        useItem = pi.item;
        this.itemQueued = false;
      } else {
        input = r.ai.think(dt, world);
        useItem = r.ai.useItem;
        if (k.finished) {
          input.throttle = Math.min(input.throttle, 0.6);
          input.drift = false;
        }
      }
      k.update(dt, input, track, env);

      // Laps.
      const laps = Math.floor(k.total / track.length);
      if (laps > k.lapsDone && !k.finished) {
        const lapTime = this.raceTime - k.lapStart;
        k.lapTimes.push(lapTime);
        k.lapStart = this.raceTime;
        k.lapsDone = laps;
        if (laps >= LAPS) {
          k.finished = true;
          k.finishTime = this.raceTime;
          if (r === player) this.onPlayerFinish();
        } else if (r === player) {
          if (laps === LAPS - 1) {
            this.sfx.finalLap();
            this.say("Final lap!");
            music.setIntensity(2);
          } else {
            this.sfx.lap();
            this.say(`Lap ${laps + 1}`);
          }
        }
      }

      // Items.
      if (k.rollT > 0) {
        k.rollT -= dt;
        if (r === player && Math.floor(k.rollT * 14) !== Math.floor((k.rollT + dt) * 14)) this.sfx.rouletteTick();
        if (k.rollT <= 0) {
          k.item = r.pendingItem;
          k.itemCount = k.item === "triple" ? 3 : 1;
          if (r === player) this.sfx.itemReady();
        }
      } else if (useItem && k.item && !k.spinning) this.useItem(r);

      this.slipstream(r, dt);
      this.kartEffects(r, dt);
      // Boost pads.
      if (k.grounded && Math.abs(k.pos.d) < 2.9 && this.raceTime - r.lastPad > 0.6) {
        for (const [a, b] of this.boostRanges) {
          if (k.pos.s >= a && k.pos.s <= b) {
            r.lastPad = this.raceTime;
            k.startBoost(1.25);
            if (this.near(k)) this.sfx.boost(0.8);
            if (r === player) this.fovKick = Math.max(this.fovKick, 6);
          }
        }
      }
      // Stuck AI: put it back on the road.
      if (!human && this.phase !== "results" && Math.abs(k.speed) < 2 && !k.spinning) r.stuck += dt;
      else r.stuck = 0;
      if (r.stuck > 3.5) this.respawn(r);
      // Shared material: the last two seconds flicker by hiding the bubble every other beat.
      r.bubble.visible = k.shieldT > 0 && (k.shieldT > 2 || Math.sin(this.elapsed * 22) > -0.3);
    }

    this.collideKarts();
    this.collectPickups();
    this.updateBananas(dt);

    // Places: finished karts by finish time, then by distance.
    const sorted = [...this.racers].sort((a, b) => {
      const ka = a.kart;
      const kb = b.kart;
      if (ka.finished && kb.finished) return ka.finishTime - kb.finishTime;
      if (ka.finished) return -1;
      if (kb.finished) return 1;
      return kb.total - ka.total;
    });
    sorted.forEach((r, i) => (r.kart.place = i + 1));

    for (const r of this.racers) r.kart.syncVisual(dt, track);

    // Engine sound follows the player's kart.
    if (player) {
      const k = player.kart;
      const top = env.top * k.stats.top;
      this.sfx.drive(Math.abs(k.speed) / top, k.throttle, !!k.drift, k.drift?.level ?? 0, k.offroad, k.boosting, !k.grounded && !k.hopping);
      const wrong = k.wrongT > 0.8 && !k.finished;
      if (wrong && !this.wrongWasOn) this.sfx.wrongWay();
      this.wrongWasOn = wrong;
    }

    if (this.phase === "finished" && !this.resultSent && (this.phaseT > 4.5 || this.racers.every((r) => r.kart.finished))) this.sendResult();
    this.emitHud();
  }

  private onPlayerFinish() {
    const k = this.player!.kart;
    const place = 1 + this.racers.filter((r) => r !== this.player && r.kart.finished).length;
    this.finishPlace = place;
    this.sfx.finish(this.config.mode === "time" ? 1 : place);
    this.say(this.config.mode === "time" ? "Finish!" : place === 1 ? "You win!" : `Finished ${ordinal(place)}`);
    music.setIntensity(1);
    this.phaseT = 0;
    k.drift = null;
    this.setPhase("finished");
  }

  private sendResult() {
    this.resultSent = true;
    const track = this.track!;
    // Karts still racing get a projected time from their remaining distance.
    const avg = CLASSES[this.config.cls].top * 0.9;
    for (const r of this.racers) {
      const k = r.kart;
      if (!k.finished) {
        k.finishTime = this.raceTime + Math.max(0, LAPS * track.length - k.total) / avg;
        k.finished = true;
      }
    }
    const byTime = [...this.racers].sort((a, b) => a.kart.finishTime - b.kart.finishTime);
    const standings: Standing[] = byTime.map((r, i) => ({
      driver: r.kart.index,
      place: i + 1,
      time: r.kart.finishTime,
      bestLap: r.kart.lapTimes.length ? Math.min(...r.kart.lapTimes) : null,
      points: this.config.mode === "cup" ? POINTS[i] ?? 0 : 0,
      total: 0,
      player: r === this.player,
    }));
    if (this.config.mode === "cup") for (const s of standings) this.cupPoints[s.driver] += s.points;
    this.lastPlaces = [];
    for (const s of standings) this.lastPlaces[s.driver] = s.place;
    for (const s of standings) s.total = this.cupPoints[s.driver];
    const cup = this.cupOrder().map((driver, i) => ({
      driver,
      place: i + 1,
      time: null,
      bestLap: null,
      points: standings.find((s) => s.driver === driver)?.points ?? 0,
      total: this.cupPoints[driver],
      player: driver === this.config.driver,
    }));
    const pk = this.player!.kart;
    const result: RaceResult = {
      mode: this.config.mode,
      track: this.config.track,
      race: this.race,
      standings,
      cup,
      cupOver: this.config.mode === "cup" && this.race >= TRACKS.length - 1,
      time: pk.finishTime,
      lapTimes: pk.lapTimes.slice(),
      bestLap: pk.lapTimes.length ? Math.min(...pk.lapTimes) : 0,
      place: standings.find((s) => s.player)?.place ?? 1,
    };
    this.setPhase("results");
    this.events.result(result);
  }

  private updatePodium(dt: number) {
    const track = this.track!;
    for (const k of this.karts) if (k.root.visible) k.syncVisual(dt, track);
    // Confetti over the top three.
    const p = pointAt(track, track.length - 14, 0);
    for (let i = 0; i < 3; i++) {
      const c = CONFETTI[Math.floor(Math.random() * CONFETTI.length)];
      this.sparks.emit(p.x + (Math.random() - 0.5) * 16, 12 + Math.random() * 4, p.z + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2, c, 0.45, 3.5, 0.6, 1.5);
    }
    // A little celebratory hop now and then.
    if (Math.random() < dt * 0.8) {
      const k = this.karts[this.cupOrder()[Math.floor(Math.random() * 3)]];
      if (k.grounded) {
        k.vy = 6;
        k.grounded = false;
        k.hopping = true;
      }
    }
    for (const k of this.karts) {
      if (!k.root.visible || k.grounded) continue;
      k.vy -= 28 * dt;
      k.y += k.vy * dt;
      const ground = this.podiumGround.get(k) ?? k.pos.y;
      if (k.y <= ground) {
        k.y = ground;
        k.grounded = true;
        k.hopping = false;
      }
    }
  }

  // --- Items & pickups ----------------------------------------------------------------------------

  /** Puts every coin and item box back (no item boxes in Time Trial). */
  private resetPickups(noBoxes = false) {
    for (const p of this.coins) {
      p.away = 0;
      p.obj.visible = true;
    }
    for (const b of this.boxes) {
      b.away = noBoxes ? Infinity : 0;
      b.obj.visible = !noBoxes;
    }
  }

  private rollItem(r: Racer) {
    const table = ITEM_TABLE[Math.min(ITEM_TABLE.length - 1, Math.round(((r.kart.place - 1) / Math.max(1, this.racers.length - 1)) * (ITEM_TABLE.length - 1)))];
    let x = Math.random();
    for (const [kind, w] of table) {
      x -= w;
      if (x <= 0) return kind;
    }
    return table[0][0];
  }

  private useItem(r: Racer) {
    const k = r.kart;
    const item = k.item;
    if (!item) return;
    const isPlayer = r === this.player;
    if (item === "boost" || item === "triple") {
      k.startBoost(1.3);
      if (this.near(k)) this.sfx.boost(1);
      if (isPlayer) this.fovKick = Math.max(this.fovKick, 7);
    } else if (item === "shield") {
      k.shieldT = 10;
      if (this.near(k)) this.sfx.shield();
    } else if (item === "banana") {
      this.dropBanana(k);
      if (this.near(k)) this.sfx.banana();
    } else if (item === "coins") {
      k.coins = Math.min(MAX_COINS, k.coins + 3);
      if (isPlayer) {
        this.sfx.coin();
        this.say("+3 coins");
      }
    }
    k.itemCount--;
    if (k.itemCount <= 0) {
      k.item = null;
      k.itemCount = 0;
    }
  }

  private dropBanana(k: Kart) {
    const track = this.track!;
    if (this.bananas.length >= 14) this.removeBanana(this.bananas[0]);
    const x = k.x - Math.sin(k.heading) * 2.6;
    const z = k.z - Math.cos(k.heading) * 2.6;
    const pos = { i: k.pos.i, s: 0, d: 0, y: 0 };
    locate(track, x, z, k.pos.i, pos);
    const obj = this.bananaPool.pop() ?? this.protos.get(ITEMS.banana)!.object.clone();
    obj.visible = true;
    obj.position.set(x, pos.y, z);
    obj.rotation.set(0, Math.random() * 6, 0);
    this.dynamic.add(obj);
    this.bananas.push({ obj, x, y: pos.y, z, s: pos.s, d: pos.d, age: 0 });
  }

  private removeBanana(b: Banana) {
    b.obj.removeFromParent();
    this.bananaPool.push(b.obj);
    this.bananas = this.bananas.filter((o) => o !== b);
  }

  private clearBananas() {
    for (const b of [...this.bananas]) this.removeBanana(b);
  }

  private updateBananas(dt: number) {
    for (const b of [...this.bananas]) {
      b.age += dt;
      b.obj.rotation.z = Math.sin(this.elapsed * 3 + b.x) * 0.08;
      for (const r of this.racers) {
        const k = r.kart;
        if (b.age < 0.4 && Math.hypot(k.x - b.x, k.z - b.z) < 3) continue;
        if (Math.hypot(k.x - b.x, k.z - b.z) > KART_R + 0.7 || Math.abs(k.y - b.y) > 1.5) continue;
        this.removeBanana(b);
        if (k.shieldT > 0) {
          k.shieldT = 0;
          if (this.near(k)) this.sfx.shieldBreak();
        } else if (k.spinOut()) {
          if (this.near(k)) this.sfx.spin();
          if (r === this.player) {
            this.say("Spun out!");
            this.shake = Math.max(this.shake, 0.35);
          }
          for (let i = 0; i < 4; i++) this.puffs?.emit(k.x + (Math.random() - 0.5) * 2, k.y + 0.4, k.z + (Math.random() - 0.5) * 2, 1.6, 0.8, 0, 1.2, 0);
        }
        break;
      }
    }
  }

  private collectPickups() {
    for (const r of this.racers) {
      const k = r.kart;
      for (const b of this.boxes) {
        if (b.away > 0 || Math.abs(k.y + 0.6 - b.y) > 2.5) continue;
        if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 > 2.1 * 2.1) continue;
        b.away = 2.4;
        b.obj.visible = false;
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2;
          this.sparks.emit(b.x, b.y + 1, b.z, Math.cos(a) * 5, Math.random() * 5, Math.sin(a) * 5, CONFETTI[i % CONFETTI.length], 0.45, 0.5, 3, 5);
        }
        if (this.near(k)) this.sfx.itemBox();
        if (!k.item && k.rollT <= 0 && this.config.mode !== "time") {
          r.pendingItem = this.rollItem(r);
          k.rollT = r === this.player ? 1.2 : 0.9;
        }
      }
      for (const c of this.coins) {
        if (c.away > 0 || Math.abs(k.y - c.y) > 2.5) continue;
        if ((k.x - c.x) ** 2 + (k.z - c.z) ** 2 > 1.9 * 1.9) continue;
        c.away = 10;
        c.obj.visible = false;
        k.coins = Math.min(MAX_COINS, k.coins + 1);
        if (r === this.player) this.sfx.coin();
        for (let i = 0; i < 5; i++) this.sparks.emit(c.x, c.y + 0.6, c.z, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, SPARK_COLORS[0], 0.35, 0.4, 2, 6);
      }
    }
  }

  private animatePickups(dt: number) {
    const t = this.elapsed;
    for (const b of this.boxes) {
      if (b.away > 0) {
        b.away -= dt;
        if (b.away <= 0) b.obj.visible = true;
      }
      const grow = b.away > 0 ? 0 : Math.min(1, -b.away * 4 + 1);
      b.obj.scale.setScalar(Math.max(0.01, grow));
      b.obj.position.y = b.y + Math.sin(t * 2.2 + b.phase) * 0.22;
      b.obj.rotation.set(Math.sin(t * 0.9 + b.phase) * 0.25, t * 1.2 + b.phase, 0);
    }
    for (const c of this.coins) {
      if (c.away > 0) {
        c.away -= dt;
        if (c.away <= 0) c.obj.visible = true;
      }
      c.obj.rotation.y = t * 3 + c.phase;
      c.obj.position.y = c.y + Math.sin(t * 3 + c.phase) * 0.12;
    }
  }

  private collideKarts() {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i].kart;
        const b = rs[j].kart;
        if (Math.abs(a.y - b.y) > 1.8) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const min = KART_R * 2;
        if (dist >= min || dist < 1e-4) continue;
        const nx = dx / dist;
        const nz = dz / dist;
        const push = (min - dist) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const vax = Math.sin(a.heading) * a.speed + a.extX;
        const vaz = Math.cos(a.heading) * a.speed + a.extZ;
        const vbx = Math.sin(b.heading) * b.speed + b.extX;
        const vbz = Math.cos(b.heading) * b.speed + b.extZ;
        const rel = (vax - vbx) * nx + (vaz - vbz) * nz;
        if (rel <= 0) continue;
        const wa = b.boosting && !a.boosting ? 1.6 : 1;
        const wb = a.boosting && !b.boosting ? 1.6 : 1;
        const imp = rel * 0.75 + 2;
        a.extX -= nx * imp * wa;
        a.extZ -= nz * imp * wa;
        b.extX += nx * imp * wb;
        b.extZ += nz * imp * wb;
        // The kart behind loses a little speed.
        const aBehind = a.total < b.total;
        (aBehind ? a : b).speed *= 0.93;
        if (a === this.player?.kart || b === this.player?.kart) {
          this.sfx.bump();
          this.shake = Math.max(this.shake, 0.15);
        }
      }
    }
  }

  private respawn(r: Racer) {
    const track = this.track!;
    const k = r.kart;
    const s = Math.max(0, k.pos.s - 4);
    const p = pointAt(track, s, track.line[indexAt(track, s)]);
    const total = k.total;
    const laps = k.lapsDone;
    const lapStart = k.lapStart;
    const lapTimes = k.lapTimes;
    const coins = k.coins;
    const item = k.item;
    const count = k.itemCount;
    k.place0(track, p.x, p.z, p.heading, p.i);
    Object.assign(k, { total, lapsDone: laps, lapStart, lapTimes, coins, item, itemCount: count });
    k.invulnT = 2;
    r.stuck = 0;
    this.puffs?.emit(k.x, k.y + 0.5, k.z, 2.2, 0.8);
  }

  // --- Effects ------------------------------------------------------------------------------------

  private near(k: Kart) {
    return k === this.player?.kart || this.camera.position.distanceToSquared(k.root.position) < 30 * 30;
  }

  private kartEffects(r: Racer, dt: number) {
    const k = r.kart;
    const sin = Math.sin(k.heading);
    const cos = Math.cos(k.heading);
    const drawing = k.drift && k.grounded;
    // Rear wheels: tyre marks and drift sparks.
    for (let w = 0; w < 2; w++) {
      const side = w === 0 ? 1 : -1;
      const lx = 0.78 * side;
      const lz = -0.95;
      const x = k.x + cos * lx + sin * lz;
      const z = k.z - sin * lx + cos * lz;
      const mark = k.marks[w];
      const marking = (drawing || (k.spinning && k.grounded)) && Math.abs(k.speed) > 4;
      if (marking && mark.on) this.skids.add(mark.x, mark.y, mark.z, x, k.y, z, 0.38);
      mark.on = marking;
      mark.x = x;
      mark.y = k.y;
      mark.z = z;
      if (drawing && k.drift) {
        const level = k.drift.level;
        r.sparkAcc += dt * (level ? 70 : 25);
        while (r.sparkAcc > 1) {
          r.sparkAcc -= 1;
          const c = SPARK_COLORS[level];
          this.sparks.emit(x, k.y + 0.25, z, -sin * 3 + (Math.random() - 0.5) * 5 + side * k.drift.dir * 2, 1.5 + Math.random() * 3, -cos * 3 + (Math.random() - 0.5) * 5, c, level ? 0.32 + level * 0.05 : 0.18, 0.22 + Math.random() * 0.15, 4, 12);
        }
      }
    }
    // Boost flames.
    if (k.boosting) {
      for (let i = 0; i < 3; i++) {
        const c = FLAME[Math.floor(Math.random() * FLAME.length)];
        const lx = (Math.random() - 0.5) * 0.7;
        this.sparks.emit(
          k.x - sin * 1.5 + cos * lx,
          k.y + 0.7 + Math.random() * 0.2,
          k.z - cos * 1.5 - sin * lx,
          -sin * (6 + Math.random() * 4) + (Math.random() - 0.5),
          0.5 + Math.random(),
          -cos * (6 + Math.random() * 4) + (Math.random() - 0.5),
          c,
          0.5 + Math.random() * 0.3,
          0.18 + Math.random() * 0.1,
          3,
          -2,
        );
      }
    }
    // Grass dust.
    if (k.offroad && Math.abs(k.speed) > 6) {
      r.dust += dt * Math.abs(k.speed) * 0.25;
      if (r.dust > 1) {
        r.dust = 0;
        this.puffs?.emit(k.x - sin * 1.4 + (Math.random() - 0.5), k.y + 0.3, k.z - cos * 1.4 + (Math.random() - 0.5), 0.9, 0.5, -sin * 2, 1, -cos * 2);
      }
    }
    if (k.spinning && Math.random() < dt * 10) this.puffs?.emit(k.x, k.y + 0.4, k.z, 1, 0.5);
  }

  /** Tucked in close behind another kart at speed, the slipstream builds into a small boost. */
  private slipstream(r: Racer, dt: number) {
    const k = r.kart;
    let tucked = false;
    if (k.speed > 18 && k.grounded && !k.boosting && !k.drift) {
      for (const o of this.racers) {
        if (o === r) continue;
        const gap = o.kart.total - k.total;
        if (gap > 2.5 && gap < 13 && Math.abs(o.kart.pos.d - k.pos.d) < 1.7 && Math.abs(o.kart.y - k.y) < 1.5) {
          tucked = true;
          break;
        }
      }
    }
    r.slip = tucked ? r.slip + dt : Math.max(0, r.slip - dt * 2);
    if (tucked && r.slip > 0.35 && Math.random() < dt * 30) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const sin = Math.sin(k.heading);
      const cos = Math.cos(k.heading);
      this.sparks.emit(k.x + cos * side * 1.3 + sin * 2, k.y + 0.6 + Math.random() * 1.4, k.z - sin * side * 1.3 + cos * 2, -sin * 22, 0, -cos * 22, SPARK_COLORS[0], 0.22, 0.25, 0.5, 0);
    }
    if (r.slip > 1.5) {
      r.slip = 0;
      k.startBoost(0.85, 1.25);
      if (r === this.player) {
        this.sfx.boost(0.4);
        this.say("Slipstream!");
      }
    }
  }

  private say(text: string) {
    this.toast = text;
    this.toastT = 1.6;
    this.toastId++;
    this.emitHud(true);
  }

  private emitHud(force = false) {
    const p = this.player;
    if (!p) return;
    const k = p.kart;
    const now = this.elapsed;
    if (!force && now - this.hudAt < 1 / 15) return;
    this.hudAt = now;
    const top = CLASSES[this.config.cls].top;
    const order = [...this.racers].sort((a, b) => a.kart.place - b.kart.place).map((r) => r.kart.index);
    const countdown = this.phase === "countdown" ? Math.max(0, 3 - Math.floor(this.phaseT)) : this.phase === "racing" && this.raceTime < 0.8 ? 0 : null;
    const lapTimes = k.lapTimes;
    this.hud = {
      place: k.place,
      racers: this.racers.length,
      lap: k.finished ? LAPS : k.lap,
      laps: LAPS,
      time: k.finished ? k.finishTime : this.phase === "racing" || this.phase === "finished" ? this.raceTime : 0,
      lapTime: k.finished ? lapTimes[lapTimes.length - 1] ?? 0 : this.raceTime - k.lapStart,
      lastLap: lapTimes.length ? lapTimes[lapTimes.length - 1] : null,
      bestLap: lapTimes.length ? Math.min(...lapTimes) : null,
      item: k.rollT > 0 ? null : k.item,
      itemCount: k.itemCount,
      rolling: k.rollT > 0,
      coins: k.coins,
      speed: Math.round((Math.abs(k.speed) / top) * 120),
      drift: k.drift?.level ?? 0,
      boost: k.boosting,
      shield: k.shieldT > 0,
      countdown,
      wrongWay: k.wrongT > 0.8 && !k.finished,
      toast: this.toast,
      toastId: this.toastId,
      order,
      track: this.config.track,
      race: this.race,
      mode: this.config.mode,
    };
    this.events.hud(this.hud);
  }

  // --- Camera -------------------------------------------------------------------------------------

  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  private updateCamera(dt: number) {
    const track = this.track;
    if (!track) return;
    const phase = this.phase === "paused" ? this.pausedFrom : this.phase;
    const pos = this.tmpA;
    const look = this.tmpB;
    let fov = this.portrait ? 74 : 62;
    let lag = 7;

    if (phase === "menu") {
      const k = this.karts[this.menuDriver];
      const a = k.heading + 0.62 + Math.sin(this.menuSpin * 0.6) * 0.3;
      const r = this.portrait ? 9 : 7.2;
      pos.set(k.x + Math.sin(a) * r, k.y + (this.portrait ? 2.6 : 2.3), k.z + Math.cos(a) * r);
      look.set(k.x, k.y + 1.1, k.z);
      if (!this.portrait) {
        // Keep the kart right of centre, clear of the menu panel.
        const right = this.tmpB.clone().sub(pos).cross(THREE.Object3D.DEFAULT_UP).normalize();
        look.addScaledVector(right, -2.6);
      } else look.y -= 2.4;
      lag = 3;
    } else if (phase === "podium") {
      const p = pointAt(track, track.length - 14, 0);
      const t = this.phaseT;
      const a = p.heading + Math.PI + Math.sin(t * 0.3) * 0.3;
      const r = this.portrait ? 14 : 12.5;
      pos.set(p.x + Math.sin(a) * r, this.portrait ? 5.2 : 4.2, p.z + Math.cos(a) * r);
      look.set(p.x, 2.2, p.z);
      // Portrait: the standings sheet covers the bottom half, so the karts sit higher in frame.
      if (this.portrait) look.y = -2.8;
      else {
        // Keep the podium left of centre, clear of the standings panel.
        const right = new THREE.Vector3().subVectors(look, pos).cross(THREE.Object3D.DEFAULT_UP).normalize();
        look.addScaledVector(right, 4.2);
      }
      lag = 2;
    } else if (phase === "intro" && this.player) {
      // Sweep from high over the track down behind the player's kart.
      const k = this.player.kart;
      const t = ease(Math.min(1, this.phaseT / 3.2));
      const start = pointAt(track, 40, 0);
      const behind = this.chasePose(k);
      pos.set(start.x + Math.sin(this.phaseT * 0.2) * 20, 38, start.z).lerp(behind.pos, t);
      look.set(k.x, k.y + 1, k.z).lerp(behind.look, t);
      lag = 4;
    } else if (this.player) {
      const k = this.player.kart;
      if (phase === "finished" || phase === "results") {
        const a = this.elapsed * 0.4;
        pos.set(k.x + Math.sin(a) * 9, k.y + 3.2, k.z + Math.cos(a) * 9);
        look.set(k.x, k.y + 1, k.z);
        lag = 3;
      } else {
        const pose = this.chasePose(k, dt);
        pos.copy(pose.pos);
        look.copy(pose.look);
        lag = 12;
        const top = CLASSES[this.config.cls].top;
        fov += Math.min(1.3, Math.abs(k.speed) / top) * 9 + (k.boosting ? 4 : 0);
      }
    }

    if (!this.camInit || dt === 0) {
      if (!this.camInit) {
        this.camPos.copy(pos);
        this.camLook.copy(look);
        this.camInit = true;
      }
    } else {
      this.camPos.lerp(pos, 1 - Math.exp(-lag * dt));
      this.camLook.lerp(look, 1 - Math.exp(-lag * 1.4 * dt));
    }
    // The smoothed camera lags behind; never let it sink into a ramp or the bridge.
    if (this.player && (phase === "racing" || phase === "countdown" || phase === "intro")) {
      const ground = this.groundAt(this.camPos.x, this.camPos.z, this.player.kart);
      if (this.camPos.y < ground + 1.6) this.camPos.y = ground + 1.6;
    }
    this.shake = damp(this.shake, 0, 5, dt);
    this.fovKick = damp(this.fovKick, 0, 3, dt);
    const s = this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z + (Math.random() - 0.5) * s);
    this.camera.lookAt(this.camLook);
    fov += this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 6, dt || 1);
      this.camera.updateProjectionMatrix();
      this.sparks.setScale(this.viewH, this.camera.fov);
    }
  }

  /** Chase camera behind the kart: lags its heading, swings out in drifts, looks back with Q. */
  private chasePose(k: Kart, dt = 0) {
    if (dt > 0) {
      const target = k.heading - (k.drift ? k.drift.dir * 0.2 : 0);
      this.camYaw += wrapAngle(target - this.camYaw) * (1 - Math.exp(-5 * dt));
    } else this.camYaw = k.heading;
    const back = this.lookBack && this.phase === "racing";
    const dist = (this.portrait ? 9.4 : 7.4) + Math.min(1, Math.abs(k.speed) / 30) * 1.4;
    const height = this.portrait ? 4.4 : 3.5;
    const dir = back ? -1 : 1;
    const yaw = back ? k.heading : this.camYaw;
    const pos = new THREE.Vector3(k.x - Math.sin(yaw) * dist * dir, Math.max(k.y, k.pos.y) + height, k.z - Math.cos(yaw) * dist * dir);
    // Never dip below the road (ramps) or poke through the bridge deck from below.
    const ground = this.groundAt(pos.x, pos.z, k);
    pos.y = Math.max(pos.y, ground + 1.2);
    const look = new THREE.Vector3(k.x + Math.sin(yaw) * 6 * dir, k.y + 1.5, k.z + Math.cos(yaw) * 6 * dir);
    return { pos, look };
  }

  private groundAt(x: number, z: number, k: Kart) {
    const track = this.track!;
    const pos = { i: k.pos.i, s: 0, d: 0, y: 0 };
    locate(track, x, z, k.pos.i, pos, 30);
    return Math.abs(pos.d) < DECK_HALF + 1 ? pos.y : 0;
  }

  private updateSun() {
    const focus = this.player?.kart.root.position ?? this.karts[this.menuDriver]?.root.position;
    if (!focus) return;
    this.sun.position.set(focus.x + 30, focus.y + 60, focus.z + 18);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
    this.viewH = h * this.renderer.getPixelRatio();
    this.sparks.setScale(this.viewH, this.camera.fov);
  }

  // --- Minimap ------------------------------------------------------------------------------------

  private drawMinimap() {
    const mm = this.minimap;
    const track = this.track;
    if (!mm || !track || !this.player) return;
    if (this.elapsed - mm.at < 1 / 30) return;
    mm.at = this.elapsed;
    const { canvas } = mm;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      mm.base = null;
    }
    const { minX, maxX, minZ, maxZ } = track.bounds;
    const pad = 10 * dpr;
    const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
    const ox = w / 2 - ((minX + maxX) / 2) * scale;
    const oz = h / 2 - ((minZ + maxZ) / 2) * scale;
    const X = (x: number) => ox + x * scale;
    const Z = (z: number) => oz + z * scale;
    if (!mm.base) {
      const base = document.createElement("canvas");
      base.width = w;
      base.height = h;
      const g = base.getContext("2d")!;
      g.lineJoin = "round";
      g.lineCap = "round";
      const path = () => {
        g.beginPath();
        track.samples.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))));
        g.closePath();
      };
      path();
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 9 * dpr;
      g.stroke();
      path();
      g.strokeStyle = "rgba(255,255,255,0.92)";
      g.lineWidth = 4.5 * dpr;
      g.stroke();
      // The bridge on top.
      g.beginPath();
      let on = false;
      track.samples.forEach((p) => {
        if (p.elevated && !on) {
          g.moveTo(X(p.x), Z(p.z));
          on = true;
        } else if (p.elevated) g.lineTo(X(p.x), Z(p.z));
        else on = false;
      });
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.lineWidth = 9 * dpr;
      g.stroke();
      g.strokeStyle = "#fde68a";
      g.lineWidth = 4.5 * dpr;
      g.stroke();
      const f = track.samples[0];
      g.save();
      g.translate(X(f.x), Z(f.z));
      g.rotate(-Math.atan2(f.tz, f.tx));
      g.fillStyle = "#111";
      g.fillRect(-1.5 * dpr, -6 * dpr, 3 * dpr, 12 * dpr);
      g.fillStyle = "#fff";
      g.fillRect(-1.5 * dpr, -6 * dpr, 3 * dpr, 4 * dpr);
      g.fillRect(-1.5 * dpr, 2 * dpr, 3 * dpr, 4 * dpr);
      g.restore();
      mm.base = base;
    }
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, w, h);
    g.drawImage(mm.base, 0, 0);
    const draw = (k: Kart, player: boolean) => {
      g.beginPath();
      g.arc(X(k.x), Z(k.z), (player ? 6 : 4.5) * dpr, 0, Math.PI * 2);
      g.fillStyle = k.driver.color;
      g.fill();
      g.lineWidth = (player ? 2.5 : 1.5) * dpr;
      g.strokeStyle = player ? "#fff" : "#111";
      g.stroke();
    };
    for (const b of this.bananas) {
      g.fillStyle = "#facc15";
      g.fillRect(X(b.x) - 2 * dpr, Z(b.z) - 2 * dpr, 4 * dpr, 4 * dpr);
    }
    for (const r of this.racers) if (r !== this.player) draw(r.kart, false);
    draw(this.player.kart, true);
  }
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
