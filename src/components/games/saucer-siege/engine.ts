import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, Pool, type LoadedModel, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { SAUCER_MARCH } from "../shared/songs";
import { Sfx } from "./audio";
import { FX, KEEP, MODELS, RIVER, SAUCER_MODELS, TILES, TOWER_MODELS } from "./manifest";
import { Particles } from "./particles";
import {
  applyArmor,
  BEAM,
  BREAK,
  BREAK_FIRST,
  buildWave,
  earlyBonus,
  MAPS,
  SAUCERS,
  sellValue,
  starsFor,
  TOWER_KINDS,
  TOWERS,
  waveBonus,
  waveHp,
  type MapDef,
  type SaucerDef,
  type SaucerKind,
  type TowerKind,
} from "./rules";

// --- Tuning ---------------------------------------------------------------------------------------

/** Height of a tile's grass surface. Everything stands on it. */
const TILE_TOP = 0.2;
/** Tower parts and weapons are scaled down a little so neighbours don't touch. */
const TS = 0.8;
/** Decorative ring of tiles around the playable grid. */
const BORDER = 4;
const SIM_STEP = 1 / 50;
const PITCH = 0.98;
/** Screen space (px) the HUD covers at the top and bottom; the camera fits the map between them. */
const hudMargins = (w: number) => (w < 640 ? { top: 60, bottom: 215 } : { top: 70, bottom: 135 });

const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];
const MASK_N = 1;
const MASK_E = 2;
const MASK_S = 4;
const MASK_W = 8;

const SKY_TOP = new THREE.Color("#7a6fd8");
const SKY_HORIZON = new THREE.Color("#d8d0f4");

const clamp = THREE.MathUtils.clamp;
const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotating a tile by k quarter turns maps direction d to d - k (rotation.y = k·π/2). */
function rotateMask(mask: number, k: number) {
  let out = 0;
  for (let d = 0; d < 4; d++) if (mask & (1 << d)) out |= 1 << ((d - k + 4) % 4);
  return out;
}

function quarterTurns(base: number, mask: number) {
  for (let k = 0; k < 4; k++) if (rotateMask(base, k) === mask) return k;
  return 0;
}

// --- Public types ---------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "won" | "lost" | "error";

export interface TowerInfo {
  kind: TowerKind;
  level: number;
  damage: number;
  rate: number;
  range: number;
  splash: number;
  upgrade: number | null;
  sell: number;
  kills: number;
  frozen: boolean;
}

export interface Hud {
  gold: number;
  lives: number;
  maxLives: number;
  wave: number;
  waves: number;
  /** Whole seconds until the next wave starts by itself; -1 while a wave is still arriving. */
  countdown: number;
  /** Gold for calling the next wave now. */
  bonus: number;
  speed: number;
  alive: number;
  armed: TowerKind | null;
  /** An empty tile is selected: the build bar builds there. */
  cell: boolean;
  tower: TowerInfo | null;
  /** Mothership health 0..1 while one is alive. */
  boss: number | null;
  /** What the next wave brings, e.g. "Mothership · 8 saucers · 2 armoured". */
  next: string | null;
  towers: number;
}

export interface Result {
  won: boolean;
  map: number;
  wave: number;
  waves: number;
  lives: number;
  maxLives: number;
  stars: number;
  kills: number;
  gold: number;
  built: number;
  leaked: number;
  time: number;
}

export interface Banner {
  id: number;
  title: string;
  sub?: string;
  tone: "info" | "boss" | "good" | "bad";
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  error(message: string): void;
  result(result: Result): void;
  banner(banner: Banner): void;
  icons(icons: Record<TowerKind, string>): void;
}

// --- Internal types -------------------------------------------------------------------------------

interface Cell {
  x: number;
  z: number;
  kind: "build" | "road" | "blocked";
  tower: Tower | null;
}

interface Placement {
  key: string;
  x: number;
  z: number;
  rot: number;
  y?: number;
  s?: number;
}

interface Part {
  obj: THREE.Object3D;
  h: number;
  grow: number;
  vel: number;
  delay: number;
}

interface Tower {
  kind: TowerKind;
  level: number;
  cell: Cell;
  root: THREE.Group;
  floors: Part[];
  top: Part;
  floorH: number;
  pivot: THREE.Group;
  sub: THREE.Object3D | null;
  subRest: THREE.Vector3;
  yaw: number;
  cooldown: number;
  target: Saucer | null;
  frozen: number;
  kills: number;
  recoil: number;
  selling: number;
  burst: THREE.Object3D | null;
  demo: boolean;
}

interface Rig {
  root: THREE.Group;
  tilt: THREE.Group;
  model: THREE.Object3D;
}

interface Saucer {
  def: SaucerDef;
  rig: Rig;
  hp: number;
  maxHp: number;
  path: Path;
  dist: number;
  offset: number;
  speed: number;
  pos: THREE.Vector3;
  heading: number;
  bank: number;
  spinRate: number;
  spawnT: number;
  bob: number;
  punch: number;
  dying: { t: number; v: THREE.Vector3; spin: number } | null;
  bar: Bar | null;
  beam: Beam | null;
  demo: boolean;
}

interface Beam {
  cd: number;
  state: "idle" | "charge" | "hold";
  t: number;
  target: Tower | null;
  obj: THREE.Object3D | null;
}

interface Bar {
  bg: THREE.Sprite;
  fill: THREE.Sprite;
}

interface Shot {
  kind: TowerKind;
  key: string;
  obj: THREE.Object3D;
  target: Saucer | null;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  T: number;
  arc: number;
  damage: number;
  splash: number;
  speed: number;
  tower: Tower;
}

interface Floater {
  sprite: THREE.Sprite;
  t: number;
}

interface Spawn {
  at: number;
  kind: SaucerKind;
  path: number;
}

// --- Path -----------------------------------------------------------------------------------------

class Path {
  readonly cum: number[] = [0];
  readonly length: number;

  readonly pts: THREE.Vector3[];

  constructor(points: THREE.Vector3[]) {
    const pts = points.filter((p, i) => i === 0 || p.distanceToSquared(points[i - 1]) > 1e-6);
    this.pts = pts;
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
  }

  at(d: number, out: THREE.Vector3, tangent?: THREE.Vector3) {
    const dd = clamp(d, 0, this.length);
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= dd) lo = mid;
      else hi = mid;
    }
    const seg = this.cum[hi] - this.cum[lo];
    const t = seg > 0 ? (dd - this.cum[lo]) / seg : 0;
    out.lerpVectors(this.pts[lo], this.pts[hi], t);
    if (tangent) tangent.subVectors(this.pts[hi], this.pts[lo]).normalize();
    return out;
  }
}

// --- Geometry helpers -----------------------------------------------------------------------------

/** Copies a (possibly quantized) geometry into plain float attributes, transformed by `matrix`. */
function bake(geo: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const out = new THREE.BufferGeometry();
  const pos = geo.getAttribute("position");
  for (const name of ["position", "normal", "uv"]) {
    const src = geo.getAttribute(name);
    const n = name === "uv" ? 2 : 3;
    const arr = new Float32Array(pos.count * n);
    if (src) {
      for (let i = 0; i < pos.count; i++) {
        arr[i * n] = src.getX(i);
        arr[i * n + 1] = src.getY(i);
        if (n === 3) arr[i * n + 2] = src.getZ(i);
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  out.setIndex(index);
  out.applyMatrix4(matrix);
  return out;
}

/** Wraps a model keeping its own origin (tiles, tower parts and weapons are authored centred). */
function originProto(scene: THREE.Object3D, scale: number, { shadows = true, receive = false } = {}): Proto {
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  scene.position.y = -box.min.y;
  const wrapper = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.setScalar(scale);
  scaled.add(scene);
  wrapper.add(scaled);
  wrapper.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows;
    mesh.receiveShadow = receive;
  });
  return { object: wrapper, size: box.getSize(new THREE.Vector3()).multiplyScalar(scale), animations: [] };
}

/** Wraps a model centred on its bounding box in all three axes (projectiles). */
function centredProto(scene: THREE.Object3D, fit: { width?: number; length?: number }): Proto {
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  scene.position.copy(c).multiplyScalar(-1);
  const s = fit.length ? fit.length / size.z : (fit.width ?? 1) / size.x;
  const wrapper = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.setScalar(s);
  scaled.add(scene);
  wrapper.add(scaled);
  return { object: wrapper, size: size.multiplyScalar(s), animations: [] };
}

// --- Game -----------------------------------------------------------------------------------------

export class SaucerSiegeGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 220);
  private readonly sun = new THREE.DirectionalLight("#fff1dc", 2.6);
  private readonly timer = new THREE.Timer();
  private readonly protos = new Map<string, Proto>();
  private readonly world = new THREE.Group();
  private readonly actors = new THREE.Group();
  private readonly overlay = new THREE.Group();
  private readonly sparks = new Particles(3500, true);
  private readonly smoke = new Particles(2500, false);
  private readonly pool: Pool;
  private readonly floorHeights = new Map<string, number>();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private readonly owned: { dispose(): void }[] = [];

  // Map
  private mapIndex = -1;
  private map: MapDef = MAPS[0];
  private cols = 16;
  private rows = 10;
  private cells: Cell[] = [];
  private paths: Path[] = [];
  private spawnCells: THREE.Vector3[] = [];
  private keepPos = new THREE.Vector3();
  private board: THREE.Mesh | null = null;
  private outer: THREE.Mesh | null = null;
  private boardMat: THREE.Material | null = null;
  private island: THREE.Mesh | null = null;
  private keep: { root: THREE.Group; crystal: THREE.Object3D | null; flash: number } | null = null;

  // State
  private phase: Phase = "loading";
  private towers: Tower[] = [];
  private saucers: Saucer[] = [];
  private shots: Shot[] = [];
  private floaters: Floater[] = [];
  private queue: Spawn[] = [];
  private gold = 0;
  private lives = 20;
  private wave = 0;
  private cleared = 0;
  private clock = 0;
  private countdown = -1;
  private speed = 1;
  private armed: TowerKind | null = null;
  private hoverKind: TowerKind | null = null;
  private preview: { wave: number; text: string | null } = { wave: -1, text: null };
  private selCell: Cell | null = null;
  private selTower: Tower | null = null;
  private hoverCell: Cell | null = null;
  private focus: Saucer | null = null;
  private ending: { t: number; won: boolean } | null = null;
  private stats = { kills: 0, gold: 0, built: 0, leaked: 0, time: 0 };
  private demoT = 0;
  private elapsed = 0;
  private shake = 0;
  private bannerId = 0;
  private lastHud = "";
  private dangerMusic = false;
  /** The theme's display font (set by the play route), for floating numbers in the world. */
  private font = "system-ui";
  /** Adaptive resolution: drops the pixel ratio on GPUs that can't keep up, raises it back with headroom. */
  private readonly perf = { t: 0, frames: 0, max: 2, ratio: 2 };

  // Rigs and pools
  private readonly rigPool = new Map<SaucerKind, Rig[]>();
  private readonly barPool: Bar[] = [];
  private readonly beamPool: THREE.Object3D[] = [];
  private readonly textCache = new Map<string, THREE.SpriteMaterial>();
  private readonly floaterPool: THREE.Sprite[] = [];
  private barMats!: { bg: THREE.SpriteMaterial; hi: THREE.SpriteMaterial; mid: THREE.SpriteMaterial; lo: THREE.SpriteMaterial; boss: THREE.SpriteMaterial };
  private hoverMarker: THREE.Object3D | null = null;
  private selectMarker: THREE.Object3D | null = null;
  private focusMarker: THREE.Object3D | null = null;
  private ring!: THREE.Group;
  private ringRadius = 1;

  // Camera
  private portrait = false;
  private yaw = 0;
  private fit = 20;
  private readonly camTarget = new THREE.Vector3();
  private camDist = 20;
  private readonly curTarget = new THREE.Vector3();
  private curDist = 20;
  private curYaw = 0;
  private readonly keys = new Set<string>();
  private viewH = 1;
  private viewW = 1;

  // Input
  private readonly pointers = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean; button: number }>();
  private pinch: { dist: number; mid: { x: number; y: number } } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_TOP);

  // Scratch
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly tan = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly ndc = new THREE.Vector2();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly camRight = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.perf.max = this.perf.ratio = Math.min(window.devicePixelRatio, coarse ? 1.75 : 2);
    this.renderer.setPixelRatio(this.perf.ratio);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.setupWorld(coarse);
    this.pool = new Pool(this.protos, this.actors);
    this.scene.add(this.world, this.actors, this.overlay, this.sparks.points, this.smoke.points);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);

    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup --------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.background = SKY_HORIZON.clone();
    scene.fog = new THREE.Fog(SKY_HORIZON, 30, 75);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y * 1.4 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.8)), 1.0); }",
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.camera.add(sky);
    scene.add(this.camera);
    this.owned.push(sky.geometry, sky.material);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.4;

    scene.add(new THREE.HemisphereLight("#f1ecff", "#5d6a52", 0.9));
    const { sun } = this;
    sun.position.set(-9, 16, 7);
    sun.castShadow = true;
    const size = coarse ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.004;
    sun.shadow.normalBias = 0.05;
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 13, bottom: -13, near: 1, far: 50 });
    scene.add(sun, sun.target);

    // Range ring: an outline and a faint disc.
    this.ring = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false });
    const discMat = new THREE.MeshBasicMaterial({ color: "#c4b5fd", transparent: true, opacity: 0.16, depthWrite: false });
    const ringGeo = new THREE.RingGeometry(0.97, 1, 96);
    const discGeo = new THREE.CircleGeometry(1, 96);
    const outline = new THREE.Mesh(ringGeo, ringMat);
    const disc = new THREE.Mesh(discGeo, discMat);
    outline.rotation.x = disc.rotation.x = -Math.PI / 2;
    outline.renderOrder = disc.renderOrder = 4;
    this.ring.add(disc, outline);
    this.ring.visible = false;
    this.overlay.add(this.ring);
    this.owned.push(ringMat, discMat, ringGeo, discGeo);

    const barMat = (color: string, opacity = 1) => {
      const m = new THREE.SpriteMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
      this.owned.push(m);
      return m;
    };
    this.barMats = { bg: barMat("#120d24", 0.7), hi: barMat("#6ee7a0"), mid: barMat("#facc15"), lo: barMat("#f87171"), boss: barMat("#c084fc") };
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>, mapIndex = 0) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      this.makeProtos(models);
      const family = getComputedStyle(this.canvas).getPropertyValue("--game-display").trim();
      if (family) {
        this.font = family;
        await document.fonts?.load(`700 60px ${family}`).catch(() => undefined);
        if (this.disposed) return;
      }
      const required = [...Object.values(TILES.grass), ...Object.values(SAUCER_MODELS), ...TOWER_KINDS.map((k) => TOWER_MODELS[k].weapon)];
      if (!required.every((k) => this.protos.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");
      this.makeMarkers();
      this.events.icons(this.renderIcons());
      this.setMap(mapIndex);
      music.play(SAUCER_MARCH, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private makeProtos(models: Map<string, LoadedModel>) {
    const add = (key: string, make: (scene: THREE.Group) => Proto, protoKey = key) => {
      const m = models.get(key);
      if (!m) return;
      this.protos.set(protoKey, make(protoKey === key ? m.scene : m.scene.clone()));
    };
    for (const set of [TILES.grass, TILES.snow]) for (const key of Object.values(set)) add(key, (s) => originProto(s, 1, { receive: true }));
    for (const key of Object.values(RIVER)) add(key, (s) => originProto(s, 1, { receive: true }));
    add(KEEP.base, (s) => originProto(s, 0.92, { receive: true }), "keep:base");
    add(KEEP.middle, (s) => originProto(s, 0.92, { receive: true }), "keep:middle");
    add(KEEP.crystals, (s) => originProto(s, 1.05, { receive: true }), "keep:crystals");
    for (const kind of TOWER_KINDS) {
      const t = TOWER_MODELS[kind];
      for (const key of [...t.floors, t.top]) if (!this.protos.has(key)) add(key, (s) => originProto(s, TS, { receive: true }));
      add(t.weapon, (s) => originProto(s, TS * 1.08));
    }
    add(TOWER_MODELS.ballista.ammo, (s) => centredProto(s, { length: 0.42 }));
    add(TOWER_MODELS.cannon.ammo, (s) => centredProto(s, { width: 0.2 }));
    add(TOWER_MODELS.catapult.ammo, (s) => centredProto(s, { width: 0.3 }));
    add(TOWER_MODELS.turret.ammo, (s) => centredProto(s, { length: 0.16 }));
    for (const kind of Object.keys(SAUCER_MODELS) as SaucerKind[]) {
      add(SAUCER_MODELS[kind], (s) => {
        const p = originProto(s, 1);
        const raw = p.size.x;
        const f = SAUCERS[kind].size / raw;
        (p.object.children[0] as THREE.Object3D).scale.setScalar(f);
        p.size.multiplyScalar(f);
        return p;
      });
    }
    add(FX.hover, (s) => originProto(s, 1, { shadows: false }));
    add(FX.select, (s) => originProto(s, 1, { shadows: false }));
    add(FX.hover, (s) => originProto(s, 1, { shadows: false }), "focus");
    add(FX.beam, (s) => originProto(s, 1, { shadows: false }));
    add(FX.burst, (s) => originProto(s, 1, { shadows: false }));

    // Beam and burst become glowing, see-through light.
    for (const key of [FX.beam, FX.burst]) {
      this.protos.get(key)?.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = (mesh.material as THREE.MeshStandardMaterial).clone();
        m.transparent = true;
        m.opacity = key === FX.beam ? 0.5 : 0.65;
        m.depthWrite = false;
        m.emissive = new THREE.Color("#f0abfc");
        m.emissiveIntensity = 0.7;
        mesh.material = m;
        mesh.renderOrder = 5;
        this.owned.push(m);
      });
    }
    // The focus brackets are red.
    this.protos.get("focus")?.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      m.color = new THREE.Color("#ff4d6d");
      m.emissive = new THREE.Color("#ff1744");
      m.emissiveIntensity = 0.6;
      mesh.material = m;
      this.owned.push(m);
    });

    for (const kind of TOWER_KINDS) this.floorHeights.set(kind, this.floorHeight(TOWER_MODELS[kind].top));

    // The kit's materials are double-sided; casting with back faces only keeps flat tops free of shadow acne.
    for (const proto of this.protos.values()) {
      proto.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).shadowSide = THREE.BackSide;
      });
    }
  }

  /** Height of the floor inside a crenellated top piece, found by casting a ray down its middle. */
  private floorHeight(key: string) {
    const p = this.protos.get(key);
    if (!p) return 0.3;
    p.object.updateMatrixWorld(true);
    const from = new THREE.Vector3(0, p.size.y + 1, 0);
    const hit = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0)).intersectObject(p.object, true)[0];
    return hit ? from.y - hit.distance : p.size.y * 0.5;
  }

  private makeMarkers() {
    const get = (key: string) => {
      const p = this.protos.get(key);
      if (!p) return null;
      const o = p.object.clone();
      o.visible = false;
      this.overlay.add(o);
      return o;
    };
    this.hoverMarker = get(FX.hover);
    this.selectMarker = get(FX.select);
    this.focusMarker = get("focus");
  }

  /** Renders a little portrait of every tower for the build bar. */
  private renderIcons(): Record<TowerKind, string> {
    const out = {} as Record<TowerKind, string>;
    const size = 256;
    const rt = new THREE.WebGLRenderTarget(size, size);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.45;
    scene.add(new THREE.HemisphereLight("#ffffff", "#8a7fb5", 1.1));
    const light = new THREE.DirectionalLight("#ffffff", 1.6);
    light.position.set(-2, 4, 3);
    scene.add(light);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
    const pixels = new Uint8Array(size * size * 4);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const small = document.createElement("canvas");
    small.width = small.height = 128;
    const sctx = small.getContext("2d");
    const prevClear = this.renderer.getClearAlpha();
    for (const kind of TOWER_KINDS) {
      const t = this.makeTower(kind, 0, null);
      t.yaw = 0.6;
      t.pivot.rotation.y = 0.6;
      scene.add(t.root);
      const box = new THREE.Box3().setFromObject(t.root);
      const c = box.getCenter(new THREE.Vector3());
      const h = box.getSize(new THREE.Vector3()).length();
      cam.position.set(c.x + h * 1.25, c.y + h * 0.9, c.z + h * 1.7);
      cam.lookAt(c);
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      this.renderer.render(scene, cam);
      this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
      scene.remove(t.root);
      if (!ctx || !sctx) continue;
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      ctx.putImageData(img, 0, 0);
      sctx.clearRect(0, 0, 128, 128);
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(canvas, 0, 0, 128, 128);
      out[kind] = small.toDataURL("image/png");
    }
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, prevClear);
    rt.dispose();
    return out;
  }

  // --- Public API ---------------------------------------------------------------------------------

  /** Shows a map (menu preview) — rebuilds the board if it changed. */
  setMap(index: number) {
    if (index !== this.mapIndex) this.buildMap(index);
    if (this.phase === "menu" || this.phase === "loading") this.setupDemo();
  }

  start(index: number) {
    audio.unlock();
    if (index !== this.mapIndex) this.buildMap(index);
    else this.clearActors();
    this.resetRun();
    music.play(SAUCER_MARCH, 1);
    music.duck(false);
    this.setPhase("playing");
    this.flashBanner(this.map.name, this.map.difficulty === "Easy" ? "Build towers along the road, then call the first wave" : `${this.map.waves} waves · ${this.map.difficulty}`, "info");
  }

  restart() {
    this.start(this.mapIndex);
  }

  pause() {
    if (this.phase !== "playing") return;
    music.duck(true);
    this.sfx.engines(0);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.setupDemo();
    music.play(SAUCER_MARCH, 0);
    music.duck(false);
    this.sfx.engines(0);
    this.setPhase("menu");
  }

  /** Build bar / number keys: builds on the selected tile, or arms the type for quick building. */
  pickKind(kind: TowerKind) {
    if (this.phase !== "playing") return;
    if (this.selCell && !this.selCell.tower) {
      const cell = this.selCell;
      if (this.build(kind, cell)) this.select(null);
      return;
    }
    this.selTower = null;
    this.armed = this.armed === kind ? null : kind;
    this.sfx.click();
  }

  /** Range preview while hovering a build button. */
  previewKind(kind: TowerKind | null) {
    this.hoverKind = kind;
  }

  upgrade() {
    const t = this.selTower;
    if (!t || this.phase !== "playing" || t.selling > 0) return;
    if (t.level >= 2) return;
    const cost = TOWERS[t.kind].upgrades[t.level];
    if (this.gold < cost) {
      this.sfx.denied();
      return;
    }
    this.gold -= cost;
    t.level++;
    const part = this.part(TOWER_MODELS[t.kind].floors[t.level]);
    part.grow = 0;
    t.floors.push(part);
    t.root.add(part.obj);
    this.sfx.upgrade();
    const p = t.root.position;
    this.dust(p.x, p.z, 1.2);
    this.sparks.burst(24, p.x, p.y + 1.2, p.z, { color: 0xc4b5fd, size: 0.09, life: 0.8, speed: 2.4, up: 1.6, gravity: 2.5, drag: 1.5 });
  }

  sell() {
    const t = this.selTower;
    if (!t || this.phase !== "playing" || t.selling > 0) return;
    const value = sellValue(t.kind, t.level);
    this.gold += value;
    t.selling = 0.001;
    t.cell.tower = null;
    this.releaseFrozen(t);
    this.select(null);
    this.sfx.sell();
    const p = t.root.position;
    this.dust(p.x, p.z, 1.4);
    this.floatText(`+${value}`, p.x, p.y + 1.2, p.z, "#fde047");
  }

  deselect() {
    this.select(null);
    this.armed = null;
  }

  callWave() {
    if (this.phase !== "playing" || this.ending) return;
    if (this.countdown < 0 || this.wave >= this.map.waves) return;
    const bonus = earlyBonus(this.countdown, this.wave + 1);
    if (bonus > 0) {
      this.gold += bonus;
      this.stats.gold += bonus;
      this.sfx.bonus();
    }
    this.startWave(bonus);
  }

  cycleSpeed() {
    this.speed = this.speed >= 3 ? 1 : this.speed + 1;
    this.sfx.click();
  }

  /** Held camera keys: "up" | "down" | "left" | "right". */
  setKey(dir: string, down: boolean) {
    if (down) this.keys.add(dir);
    else this.keys.delete(dir);
  }

  zoom(dir: number) {
    this.camDist = clamp(this.camDist * (dir > 0 ? 0.85 : 1 / 0.85), this.fit * 0.42, this.fit * 1.15);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerCancel);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.onContextMenu);
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.board?.geometry.dispose();
    this.outer?.geometry.dispose();
    this.boardMat?.dispose();
    this.island?.geometry.dispose();
    (this.island?.material as THREE.Material | undefined)?.dispose();
    for (const m of this.textCache.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.owned.forEach((o) => o.dispose());
    this.sparks.dispose();
    this.smoke.dispose();
    this.envTexture?.dispose();
    this.renderer.dispose();
  }

  // --- State --------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    this.lastHud = "";
  }

  private resetRun() {
    this.gold = this.map.gold;
    this.lives = this.map.lives;
    this.wave = 0;
    this.cleared = 0;
    this.clock = 0;
    this.countdown = BREAK_FIRST;
    this.queue = [];
    this.armed = null;
    this.select(null);
    this.focus = null;
    this.ending = null;
    this.speed = 1;
    this.stats = { kills: 0, gold: 0, built: 0, leaked: 0, time: 0 };
    this.dangerMusic = false;
    this.camTarget.set(0, 0, 0);
    this.camDist = this.fit;
  }

  private clearActors() {
    for (const s of [...this.saucers]) this.releaseSaucer(s);
    for (const sh of this.shots) this.pool.release(sh.key, sh.obj);
    for (const t of this.towers) t.root.removeFromParent();
    for (const f of this.floaters) {
      f.sprite.visible = false;
      this.floaterPool.push(f.sprite);
    }
    this.saucers = [];
    this.shots = [];
    this.towers = [];
    this.floaters = [];
    for (const c of this.cells) c.tower = null;
    this.sparks.clear();
    this.smoke.clear();
    this.select(null);
    this.focus = null;
  }

  // --- Map ----------------------------------------------------------------------------------------

  private cellAt(x: number, z: number): Cell | null {
    if (x < 0 || z < 0 || x >= this.cols || z >= this.rows) return null;
    return this.cells[z * this.cols + x];
  }

  private center(x: number, z: number, out = new THREE.Vector3()) {
    return out.set(x - this.cols / 2 + 0.5, TILE_TOP, z - this.rows / 2 + 0.5);
  }

  private buildMap(index: number) {
    this.clearActors();
    for (const mesh of [this.board, this.outer]) {
      mesh?.geometry.dispose();
      mesh?.removeFromParent();
    }
    this.board = this.outer = null;
    if (this.island) {
      this.island.geometry.dispose();
      (this.island.material as THREE.Material).dispose();
      this.island.removeFromParent();
      this.island = null;
    }
    this.keep?.root.removeFromParent();
    this.keep = null;

    const map = MAPS[index];
    this.mapIndex = index;
    this.map = map;
    const rows = map.layout.length;
    const cols = map.layout[0].length;
    this.rows = rows;
    this.cols = cols;
    const set = TILES[map.theme];
    const rnd = seeded(index * 7919 + 13);
    const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
    const ch = (x: number, z: number) => (x < 0 || z < 0 || x >= cols || z >= rows ? " " : map.layout[z][x]);
    const isRoad = (c: string) => c === "#" || c === "S" || c === "E" || c === "=";
    const isWater = (c: string) => c === "~" || c === "=";
    const items: Placement[] = [];
    const outer: Placement[] = [];
    const turn = () => Math.floor(rnd() * 4) * (Math.PI / 2);

    this.cells = [];
    this.spawnCells = [];
    const spawnXZ: [number, number][] = [];
    let endXZ: [number, number] = [0, 0];
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const c = ch(x, z);
        this.cells.push({ x, z, kind: c === "." ? "build" : isRoad(c) ? "road" : "blocked", tower: null });
        const p = this.center(x, z);
        if (isRoad(c)) {
          let mask = 0;
          for (let d = 0; d < 4; d++) if (isRoad(ch(x + DX[d], z + DZ[d]))) mask |= 1 << d;
          let key: string = set.straight;
          let base = MASK_N | MASK_S;
          const count = [0, 1, 2, 3].filter((d) => mask & (1 << d)).length;
          if (c === "S") {
            key = set.spawn;
            base = MASK_S;
            spawnXZ.push([x, z]);
          } else if (c === "E") {
            key = set.end;
            base = MASK_S;
            endXZ = [x, z];
          } else if (c === "=") {
            key = RIVER.bridge;
            base = MASK_E | MASK_W;
          } else if (count >= 3) {
            key = set.split;
            base = MASK_W | MASK_E | MASK_S;
          } else if (count === 2 && mask !== (MASK_N | MASK_S) && mask !== (MASK_E | MASK_W)) {
            key = set.corner;
            base = MASK_E | MASK_S;
          } else if (count <= 1) {
            key = set.end;
            base = MASK_S;
          }
          items.push({ key, x: p.x, z: p.z, rot: quarterTurns(base, mask) * (Math.PI / 2) });
        } else if (c === "~") {
          const vertical = isWater(ch(x, z - 1)) || isWater(ch(x, z + 1)) || z === 0 || z === rows - 1;
          items.push({ key: RIVER.straight, x: p.x, z: p.z, rot: vertical ? 0 : Math.PI / 2 });
        } else if (c === "T") items.push({ key: pick([set.tree, set.tree2, set.tree4, set.tree2]), x: p.x, z: p.z, rot: turn() });
        else if (c === "R") items.push({ key: set.rock, x: p.x, z: p.z, rot: turn() });
        else if (c === "C") items.push({ key: set.crystal, x: p.x, z: p.z, rot: turn() });
        else if (c === "H") items.push({ key: set.hill, x: p.x, z: p.z, rot: turn() });
        else {
          items.push({ key: set.tile, x: p.x, z: p.z, rot: 0 });
          if (c === "o") {
            items.push({ key: pick([set.detailTree, set.detailRocks, set.detailTree]), x: p.x + (rnd() - 0.5) * 0.3, z: p.z + (rnd() - 0.5) * 0.3, y: TILE_TOP, rot: turn() });
          }
        }
      }
    }

    // Decorative border: forest and rocks, thicker further out; rivers run on to the edge.
    for (let z = -BORDER; z < rows + BORDER; z++) {
      for (let x = -BORDER; x < cols + BORDER; x++) {
        if (x >= 0 && z >= 0 && x < cols && z < rows) continue;
        const p = this.center(x, z);
        const cx = clamp(x, 0, cols - 1);
        const cz = clamp(z, 0, rows - 1);
        const edgeChar = ch(cx, cz);
        const outward = (z < 0 || z >= rows) && !(x < 0 || x >= cols) ? "v" : (x < 0 || x >= cols) && !(z < 0 || z >= rows) ? "h" : "";
        if (edgeChar === "~" && outward) {
          items.push({ key: RIVER.straight, x: p.x, z: p.z, rot: outward === "v" ? 0 : Math.PI / 2 });
          continue;
        }
        const ring = Math.max(x < 0 ? -x : x >= cols ? x - cols + 1 : 0, z < 0 ? -z : z >= rows ? z - rows + 1 : 0);
        // Only the ring next to the play area casts shadows; further out, lighter tree tiles.
        const list = ring <= 1 ? items : outer;
        const trees = ring <= 1 ? [set.tree, set.tree2, set.tree4, set.tree2] : [set.tree, set.tree2, set.tree2, set.tree];
        const r = rnd();
        const treeChance = 0.32 + ring * 0.18;
        if (r < treeChance) list.push({ key: pick(trees), x: p.x, z: p.z, rot: turn() });
        else if (r < treeChance + 0.07) list.push({ key: set.rock, x: p.x, z: p.z, rot: turn() });
        else if (r < treeChance + 0.13) list.push({ key: set.hill, x: p.x, z: p.z, rot: turn() });
        else if (r < treeChance + 0.16) list.push({ key: set.crystal, x: p.x, z: p.z, rot: turn() });
        else {
          list.push({ key: set.tile, x: p.x, z: p.z, rot: 0 });
          if (rnd() < 0.55) {
            list.push({ key: pick([set.detailTree, set.detailRocks, set.detailTree, set.detailCrystal]), x: p.x + (rnd() - 0.5) * 0.4, z: p.z + (rnd() - 0.5) * 0.4, y: TILE_TOP, rot: turn() });
          }
        }
      }
    }

    // One material for the whole valley: the kit's palette with a warm tint that takes the edge off
    // its mint greens — late-afternoon light.
    let source: THREE.MeshStandardMaterial | null = null;
    this.protos.get(set.tile)?.object.traverse((o) => {
      if (!source && (o as THREE.Mesh).isMesh) source = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
    });
    const tinted = (source as THREE.MeshStandardMaterial | null)?.clone() ?? new THREE.MeshStandardMaterial();
    tinted.color.set(map.theme === "snow" ? "#eef0ff" : "#f3eed2");
    tinted.shadowSide = THREE.BackSide;
    this.boardMat?.dispose();
    this.boardMat = tinted;
    this.board = this.bakeBoard(items, tinted, true);
    this.outer = this.bakeBoard(outer, tinted, false);
    this.world.add(this.board, this.outer);

    // The valley floor beyond the tiles, in the grass colour of the tiles themselves, fading into the haze.
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    groundGeo.rotateX(-Math.PI / 2);
    const groundColor = this.sampleColor(set.tile) ?? new THREE.Color(map.theme === "snow" ? "#f4f6ff" : "#7fd99a");
    groundColor.multiply((this.boardMat as THREE.MeshStandardMaterial).color);
    const groundMat = new THREE.MeshStandardMaterial({ color: groundColor, roughness: 1 });
    this.island = new THREE.Mesh(groundGeo, groundMat);
    this.island.position.y = -0.002;
    this.island.receiveShadow = true;
    this.world.add(this.island);

    // Paths from every portal to the keep.
    const keyOf = (x: number, z: number) => z * cols + x;
    this.paths = spawnXZ.map(([sx, sz]) => {
      const prev = new Map<number, number>([[keyOf(sx, sz), -1]]);
      const queue: [number, number][] = [[sx, sz]];
      while (queue.length) {
        const [x, z] = queue.shift()!;
        if (x === endXZ[0] && z === endXZ[1]) break;
        for (let dd = 0; dd < 4; dd++) {
          const nx = x + DX[dd];
          const nz = z + DZ[dd];
          if (!isRoad(ch(nx, nz)) || prev.has(keyOf(nx, nz))) continue;
          prev.set(keyOf(nx, nz), keyOf(x, z));
          queue.push([nx, nz]);
        }
      }
      const cellsOnPath: [number, number][] = [];
      for (let k = keyOf(endXZ[0], endXZ[1]); k !== -1 && k !== undefined; k = prev.get(k) ?? -1) cellsOnPath.unshift([k % cols, Math.floor(k / cols)]);
      return this.makePath(cellsOnPath);
    });
    this.spawnCells = spawnXZ.map(([x, z]) => this.center(x, z));
    this.center(endXZ[0], endXZ[1], this.keepPos);

    // The crystal keep.
    const root = new THREE.Group();
    root.position.copy(this.keepPos);
    let y = 0;
    for (const key of ["keep:base", "keep:middle", "keep:crystals"]) {
      const proto = this.protos.get(key);
      if (!proto) continue;
      const o = proto.object.clone();
      o.position.y = y;
      root.add(o);
      y += proto.size.y;
    }
    const crystal = root.getObjectByName("crystal") ?? null;
    this.world.add(root);
    this.keep = { root, crystal, flash: 0 };

    this.updateFit();
    this.camTarget.set(0, 0, 0);
    this.camDist = this.fit;
    this.curTarget.copy(this.camTarget);
    this.curDist = this.fit;
  }

  /** Centre line through the road tiles; quarter circles on corners, like the tiles themselves. */
  private makePath(cellsOnPath: [number, number][]) {
    const pts: THREE.Vector3[] = [];
    const c = (i: number) => this.center(cellsOnPath[i][0], cellsOnPath[i][1]).setY(0);
    pts.push(c(0));
    for (let i = 1; i < cellsOnPath.length - 1; i++) {
      const a = c(i - 1);
      const b = c(i);
      const n = c(i + 1);
      const din = b.clone().sub(a);
      const dout = n.clone().sub(b);
      if (din.dot(dout) > 0.5) {
        pts.push(b);
        continue;
      }
      const mIn = b.clone().addScaledVector(din, -0.5);
      const mOut = b.clone().addScaledVector(dout, 0.5);
      const pivot = mIn.clone().addScaledVector(dout, 0.5);
      const a0 = Math.atan2(mIn.z - pivot.z, mIn.x - pivot.x);
      const a1 = Math.atan2(mOut.z - pivot.z, mOut.x - pivot.x);
      const delta = angleDiff(a0, a1);
      for (let k = 0; k <= 8; k++) {
        const ang = a0 + (delta * k) / 8;
        pts.push(new THREE.Vector3(pivot.x + Math.cos(ang) * 0.5, 0, pivot.z + Math.sin(ang) * 0.5));
      }
    }
    // Stop short of the keep's centre: saucers dive into its wall.
    const last = c(cellsOnPath.length - 1);
    const prev = pts[pts.length - 1];
    pts.push(prev.clone().lerp(last, 0.55));
    return new Path(pts);
  }

  /** Merges every static tile and decoration into one mesh — one draw call for the whole valley. */
  private bakeBoard(items: Placement[], material: THREE.Material, castShadow: boolean) {
    const geos: THREE.BufferGeometry[] = [];
    for (const it of items) {
      const proto = this.protos.get(it.key);
      if (!proto) continue;
      const obj = proto.object;
      obj.position.set(it.x, it.y ?? 0, it.z);
      obj.rotation.set(0, it.rot, 0);
      obj.scale.setScalar(it.s ?? 1);
      obj.updateMatrixWorld(true);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        geos.push(bake(mesh.geometry, mesh.matrixWorld));
      });
      obj.position.set(0, 0, 0);
      obj.rotation.set(0, 0, 0);
      obj.scale.setScalar(1);
      obj.updateMatrixWorld(true);
    }
    const merged = mergeGeometries(geos, false) ?? new THREE.BufferGeometry();
    geos.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Colour of a tile's top face, read from the kit's palette texture. */
  private sampleColor(key: string): THREE.Color | null {
    const proto = this.protos.get(key);
    let mesh: THREE.Mesh | null = null;
    proto?.object.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) return null;
    const { geometry, material } = mesh as THREE.Mesh;
    const map = (material as THREE.MeshStandardMaterial).map;
    const image = map?.image as CanvasImageSource & { width: number; height: number } | undefined;
    const pos = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    if (!image || !uv) return null;
    let best = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(best)) best = i;
    try {
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
      const x = clamp(Math.floor(uv.getX(best) * image.width), 0, image.width - 1);
      const y = clamp(Math.floor(uv.getY(best) * image.height), 0, image.height - 1);
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    } catch {
      return null;
    }
  }

  // --- Demo (menu background) ---------------------------------------------------------------------

  private setupDemo() {
    this.clearActors();
    this.camTarget.set(0, 0, 0);
    this.camDist = this.fit;
    this.ending = null;
    this.lives = this.map.lives;
    // A few towers on the best spots so the menu has a little battle going on.
    const scored = this.cells
      .filter((c) => c.kind === "build")
      .map((c) => {
        const p = this.center(c.x, c.z);
        let score = 0;
        for (const path of this.paths) for (let i = 0; i < path.pts.length; i += 2) if (path.pts[i].distanceToSquared(p.setY(0)) < 2.2 * 2.2) score++;
        return { c, score };
      })
      .sort((a, b) => b.score - a.score);
    const chosen: Cell[] = [];
    for (const { c } of scored) {
      if (chosen.length >= 4) break;
      if (chosen.some((o) => Math.abs(o.x - c.x) + Math.abs(o.z - c.z) < 4)) continue;
      chosen.push(c);
    }
    chosen.forEach((c, i) => {
      const t = this.placeTower(TOWER_KINDS[i % 4], c, true);
      t.level = i % 3 === 2 ? 1 : 0;
      if (t.level === 1) {
        const part = this.part(TOWER_MODELS[t.kind].floors[1]);
        t.floors.push(part);
        t.root.add(part.obj);
      }
    });
    this.demoT = 0.5;
  }

  private updateDemo(dt: number) {
    this.demoT -= dt;
    if (this.demoT <= 0 && this.saucers.length < 9) {
      this.demoT = rand(1.1, 2.2);
      const r = Math.random();
      const kind: SaucerKind = r < 0.45 ? "standard" : r < 0.75 ? "scout" : r < 0.9 ? "armored" : "beam";
      this.spawnSaucer(kind, Math.floor(Math.random() * this.paths.length), true);
    }
  }

  // --- Towers -------------------------------------------------------------------------------------

  private part(key: string): Part {
    const p = this.protos.get(key)!;
    return { obj: p.object.clone(), h: p.size.y, grow: 1, vel: 0, delay: 0 };
  }

  private makeTower(kind: TowerKind, level: number, cell: Cell | null): Tower {
    const spec = TOWER_MODELS[kind];
    const root = new THREE.Group();
    const floors: Part[] = [];
    for (let i = 0; i <= level; i++) floors.push(this.part(spec.floors[i]));
    const top = this.part(spec.top);
    const pivot = new THREE.Group();
    const weapon = this.protos.get(spec.weapon)!.object.clone();
    pivot.add(weapon);
    root.add(...floors.map((f) => f.obj), top.obj, pivot);
    const sub = weapon.getObjectByName(kind === "ballista" ? "arrow" : kind === "catapult" ? "catapult" : "barrel") ?? null;
    const t: Tower = {
      kind,
      level,
      cell: cell ?? { x: 0, z: 0, kind: "build", tower: null },
      root,
      floors,
      top,
      floorH: this.floorHeights.get(kind) ?? 0.3,
      pivot,
      sub,
      subRest: sub ? sub.position.clone() : new THREE.Vector3(),
      yaw: 0,
      cooldown: 0.4,
      target: null,
      frozen: 0,
      kills: 0,
      recoil: 0,
      selling: 0,
      burst: null,
      demo: false,
    };
    this.layoutTower(t);
    return t;
  }

  private layoutTower(t: Tower) {
    let y = 0;
    for (const p of [...t.floors, t.top]) {
      const g = Math.max(0.001, p.grow);
      const squash = 1 + (1 - Math.min(1, g)) * 0.25;
      p.obj.position.y = y;
      p.obj.scale.set(squash, g, squash);
      p.obj.visible = p.grow > 0.002;
      y += p.h * g;
    }
    const g = Math.max(0.001, t.top.grow);
    t.pivot.position.y = y - t.top.h * g + t.floorH * g;
    t.pivot.scale.setScalar(clamp(g, 0.001, 1.2));
    t.pivot.visible = t.top.grow > 0.01;
  }

  private placeTower(kind: TowerKind, cell: Cell, demo = false) {
    const t = this.makeTower(kind, 0, cell);
    t.demo = demo;
    this.center(cell.x, cell.z, t.root.position);
    t.yaw = t.pivot.rotation.y = Math.atan2(-t.root.position.x, -t.root.position.z);
    cell.tower = t;
    this.actors.add(t.root);
    this.towers.push(t);
    return t;
  }

  private build(kind: TowerKind, cell: Cell) {
    if (cell.kind !== "build" || cell.tower) return false;
    const cost = TOWERS[kind].cost;
    if (this.gold < cost) {
      this.sfx.denied();
      this.flashBanner("Not enough gold", `${TOWERS[kind].name} costs ${cost}`, "bad");
      return false;
    }
    this.gold -= cost;
    const t = this.placeTower(kind, cell);
    // Floors pop up one after another.
    [...t.floors, t.top].forEach((p, i) => {
      p.grow = 0;
      p.delay = i * 0.09;
    });
    this.layoutTower(t);
    this.stats.built++;
    this.sfx.build();
    this.dust(t.root.position.x, t.root.position.z, 1);
    return true;
  }

  private releaseFrozen(t: Tower) {
    for (const s of this.saucers) {
      if (s.beam?.target === t) this.endBeam(s);
    }
    t.frozen = 0;
  }

  private updateTowers(dt: number) {
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const t = this.towers[i];
      // Build / upgrade springs.
      let animating = false;
      for (const p of [...t.floors, t.top]) {
        if (p.delay > 0) {
          p.delay -= dt;
          animating = true;
          continue;
        }
        if (Math.abs(1 - p.grow) > 0.001 || Math.abs(p.vel) > 0.001) {
          p.vel += ((1 - p.grow) * 260 - p.vel * 16) * dt;
          p.grow += p.vel * dt;
          animating = true;
        } else {
          p.grow = 1;
          p.vel = 0;
        }
      }
      if (animating) this.layoutTower(t);

      if (t.selling > 0) {
        t.selling += dt;
        const k = Math.min(1, t.selling / 0.35);
        t.root.scale.set(1 + k * 0.2, 1 - k, 1 + k * 0.2);
        if (k >= 1) {
          t.root.removeFromParent();
          this.towers.splice(i, 1);
        }
        continue;
      }

      const def = TOWERS[t.kind];
      const lv = def.levels[t.level];

      // Frozen by a tractor beam: sparkle and do nothing.
      if (t.frozen > 0) {
        t.frozen -= dt;
        if (Math.random() < dt * 20) {
          const p = t.root.position;
          this.sparks.emit({ x: p.x + rand(-0.35, 0.35), y: p.y + t.pivot.position.y + rand(-0.2, 0.4), z: p.z + rand(-0.35, 0.35), vy: 0.4, color: 0xa5f3fc, size: 0.1, life: 0.6 });
        }
        if (!t.burst && this.protos.has(FX.burst)) {
          t.burst = this.protos.get(FX.burst)!.object.clone();
          t.burst.scale.set(0.95, 0.75, 0.95);
          t.root.add(t.burst);
        }
        if (t.burst) {
          t.burst.position.y = t.pivot.position.y - 0.25;
          t.burst.rotation.y += dt * 2;
          const pulse = 0.9 + Math.sin(this.elapsed * 12) * 0.06;
          t.burst.scale.set(0.95 * pulse, 0.75, 0.95 * pulse);
        }
        continue;
      } else if (t.burst) {
        t.burst.removeFromParent();
        t.burst = null;
        t.frozen = 0;
      }

      if (t.sub && t.kind === "ballista") t.sub.visible = t.cooldown < (1 / lv.rate) * 0.55;
      t.recoil = Math.max(0, t.recoil - dt * 5);
      if (t.sub && (t.kind === "cannon" || t.kind === "turret")) t.sub.position.z = t.subRest.z - t.recoil * 0.25;
      if (t.sub && t.kind === "catapult") {
        // The arm flings forward, then winds back.
        t.sub.rotation.x = t.recoil > 0.6 ? -(1 - t.recoil) * 3.2 : -t.recoil * 2.1;
      }

      t.cooldown -= dt;
      t.target = this.pickTarget(t, lv.range);
      const target = t.target;
      if (!target) {
        // Idle: the crew slowly scans the sky.
        t.yaw += Math.sin(this.elapsed * 0.45 + t.cell.x * 1.7 + t.cell.z) * dt * 0.5;
        t.pivot.rotation.y = t.yaw;
        continue;
      }
      const p = t.root.position;
      const aim = this.aimPoint(t, target);
      const want = Math.atan2(aim.x - p.x, aim.z - p.z);
      const turnSpeed = t.kind === "catapult" ? 4 : 9;
      const diff = angleDiff(t.yaw, want);
      t.yaw += clamp(diff, -turnSpeed * dt, turnSpeed * dt);
      t.pivot.rotation.y = t.yaw;
      if (t.cooldown <= 0 && Math.abs(diff) < 0.3) {
        t.cooldown = 1 / lv.rate;
        this.fire(t, target, aim);
      }
    }
  }

  private targetable(s: Saucer, t: Tower, range: number) {
    if (s.dying || s.spawnT < 0.5) return false;
    const dx = s.pos.x - t.root.position.x;
    const dz = s.pos.z - t.root.position.z;
    return dx * dx + dz * dz <= range * range;
  }

  /** Focused saucer first, then whichever is closest to the keep. */
  private pickTarget(t: Tower, range: number): Saucer | null {
    if (this.focus && !t.demo && this.targetable(this.focus, t, range)) return this.focus;
    let best: Saucer | null = null;
    let bestLeft = Infinity;
    for (const s of this.saucers) {
      if (!this.targetable(s, t, range)) continue;
      const left = s.path.length - s.dist;
      if (left < bestLeft) {
        bestLeft = left;
        best = s;
      }
    }
    return best;
  }

  /** Where to shoot: arcing shots lead the target along its path. */
  private aimPoint(t: Tower, s: Saucer) {
    const def = TOWERS[t.kind];
    if (def.arc <= 0) return this.v3.copy(s.pos);
    return this.saucerPosAt(s, s.dist + s.speed * def.speed, this.v3);
  }

  private muzzle(t: Tower, out: THREE.Vector3) {
    const m = t.kind === "catapult" ? [0, 0.42, -0.12] : t.kind === "turret" ? [0, 0.3, 0.32] : [0, 0.32, 0.3];
    const s = Math.sin(t.yaw);
    const c = Math.cos(t.yaw);
    const p = t.root.position;
    return out.set(p.x + m[2] * s * TS, p.y + t.pivot.position.y + m[1] * TS, p.z + m[2] * c * TS);
  }

  private fire(t: Tower, target: Saucer, aim: THREE.Vector3) {
    const def = TOWERS[t.kind];
    const lv = def.levels[t.level];
    const key = TOWER_MODELS[t.kind].ammo;
    if (!this.protos.has(key)) return;
    const from = this.muzzle(t, new THREE.Vector3());
    const obj = this.pool.get(key);
    obj.position.copy(from);
    const shot: Shot = {
      kind: t.kind,
      key,
      obj,
      target,
      pos: from.clone(),
      from,
      to: aim.clone(),
      t: 0,
      T: def.arc > 0 ? def.speed : 0,
      arc: def.arc,
      damage: lv.damage,
      splash: lv.splash,
      speed: def.speed,
      tower: t,
    };
    if (def.arc <= 0) obj.lookAt(target.pos);
    this.shots.push(shot);
    t.recoil = 1;
    if (!t.demo || Math.random() < 0.5) this.sfx.shoot(t.kind);

    // Muzzle flash.
    const flashColor = t.kind === "turret" ? 0xffe08a : t.kind === "cannon" ? 0xffb35c : 0xfff1c9;
    if (t.kind === "cannon" || t.kind === "turret") {
      this.sparks.emit({ x: from.x, y: from.y, z: from.z, color: flashColor, size: t.kind === "cannon" ? 0.55 : 0.3, life: 0.08 });
      this.sparks.burst(t.kind === "cannon" ? 6 : 2, from.x, from.y, from.z, { color: flashColor, size: 0.07, life: 0.2, speed: 2.5, drag: 4 });
    }
    if (t.kind === "cannon") this.smoke.burst(5, from.x, from.y, from.z, { color: 0xd8d4e8, size: 0.28, grow: 2.2, life: 0.7, speed: 0.6, up: 0.4, drag: 3, alpha: 0.7 });
    if (t.kind === "catapult") this.smoke.burst(4, from.x, from.y - 0.2, from.z, { color: 0xcbb89a, size: 0.2, grow: 2, life: 0.5, speed: 0.6, drag: 3, alpha: 0.6 });
  }

  private updateShots(dt: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      let done = false;
      if (sh.arc > 0) {
        sh.t += dt;
        const k = Math.min(1, sh.t / sh.T);
        sh.pos.lerpVectors(sh.from, sh.to, k);
        sh.pos.y += sh.arc * 4 * k * (1 - k);
        sh.obj.position.copy(sh.pos);
        sh.obj.rotation.x += dt * 9;
        sh.obj.rotation.z += dt * 5;
        if (sh.kind === "catapult" && Math.random() < dt * 30) this.smoke.emit({ x: sh.pos.x, y: sh.pos.y, z: sh.pos.z, color: 0xc9b79c, size: 0.12, grow: 1.8, life: 0.35, alpha: 0.5 });
        if (k >= 1) {
          this.splash(sh);
          done = true;
        }
      } else {
        const target = sh.target && !sh.target.dying && this.saucers.includes(sh.target) ? sh.target : null;
        if (target) sh.to.copy(target.pos);
        else sh.target = null;
        const dir = this.v1.subVectors(sh.to, sh.pos);
        const dist = dir.length();
        const step = sh.speed * dt;
        if (dist <= step + 0.05) {
          if (target) this.hit(target, sh.damage, sh.tower, sh.pos);
          done = true;
        } else {
          sh.pos.addScaledVector(dir, step / dist);
          sh.obj.position.copy(sh.pos);
          sh.obj.lookAt(sh.to);
          if (sh.kind === "turret" && Math.random() < 0.5) this.sparks.emit({ x: sh.pos.x, y: sh.pos.y, z: sh.pos.z, color: 0xffd36b, size: 0.07, life: 0.08 });
        }
      }
      if (done) {
        this.pool.release(sh.key, sh.obj);
        this.shots.splice(i, 1);
      }
    }
  }

  private hit(s: Saucer, damage: number, tower: Tower, at: THREE.Vector3) {
    this.sparks.burst(4, at.x, at.y, at.z, { color: tower.kind === "turret" ? 0xffd36b : 0xfff3d6, size: 0.06, life: 0.25, speed: 2.2, drag: 3 });
    if (!tower.demo) this.sfx.hit();
    this.damage(s, damage, tower);
  }

  private splash(sh: Shot) {
    const p = sh.pos;
    const big = sh.kind === "catapult";
    this.explosion(p.x, p.y, p.z, big ? 1.1 : 0.75, false);
    if (!sh.tower.demo || Math.random() < 0.4) this.sfx.explosion(false);
    const r2 = sh.splash * sh.splash;
    for (const s of this.saucers) {
      if (s.dying) continue;
      const dx = s.pos.x - p.x;
      const dy = (s.pos.y - p.y) * 0.6;
      const dz = s.pos.z - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      // Full damage in the middle, half at the edge.
      this.damage(s, sh.damage * (1 - 0.5 * Math.sqrt(d2 / r2)), sh.tower);
    }
  }

  // --- Saucers ------------------------------------------------------------------------------------

  private getRig(kind: SaucerKind): Rig {
    const free = this.rigPool.get(kind)?.pop();
    if (free) {
      this.actors.add(free.root);
      free.root.visible = true;
      return free;
    }
    const proto = this.protos.get(SAUCER_MODELS[kind])!;
    const root = new THREE.Group();
    const tilt = new THREE.Group();
    const model = proto.object.clone();
    model.position.y = -proto.size.y * 0.45;
    tilt.add(model);
    root.add(tilt);
    this.actors.add(root);
    return { root, tilt, model };
  }

  private getBar(): Bar {
    const bar = this.barPool.pop();
    if (bar) {
      bar.bg.visible = bar.fill.visible = true;
      return bar;
    }
    const bg = new THREE.Sprite(this.barMats.bg);
    const fill = new THREE.Sprite(this.barMats.hi);
    bg.center.set(0, 0.5);
    fill.center.set(0, 0.5);
    bg.renderOrder = 10;
    fill.renderOrder = 11;
    this.overlay.add(bg, fill);
    return { bg, fill };
  }

  private spawnSaucer(kind: SaucerKind, pathIndex: number, demo = false) {
    const def = SAUCERS[kind];
    const path = this.paths[pathIndex] ?? this.paths[0];
    if (!path) return;
    const rig = this.getRig(kind);
    const hp = def.hp * (demo ? 1 : waveHp(this.map, Math.max(1, this.wave)));
    const s: Saucer = {
      def,
      rig,
      hp,
      maxHp: hp,
      path,
      dist: 0,
      offset: kind === "boss" ? 0 : rand(-0.12, 0.12),
      speed: def.speed * (kind === "scout" ? rand(0.95, 1.08) : 1),
      pos: new THREE.Vector3(),
      heading: 0,
      bank: 0,
      spinRate: kind === "boss" ? 0.6 : rand(1.2, 2.4) * (Math.random() < 0.5 ? -1 : 1),
      spawnT: 0,
      bob: Math.random() * Math.PI * 2,
      punch: 0,
      dying: null,
      bar: null,
      beam: kind === "beam" ? { cd: rand(1.5, 3), state: "idle", t: 0, target: null, obj: null } : null,
      demo,
    };
    this.saucerPosAt(s, 0, s.pos);
    rig.root.position.copy(s.pos);
    rig.root.scale.setScalar(0.01);
    rig.tilt.quaternion.identity();
    rig.model.rotation.set(0, Math.random() * 6, 0);
    this.saucers.push(s);
    const sp = path.pts[0];
    this.sparks.burst(kind === "boss" ? 30 : 12, sp.x, TILE_TOP + 0.3, sp.z, { color: 0xc084fc, size: 0.1, life: 0.6, speed: 1.6, up: 1.2, drag: 2 });
  }

  /** Hover position along the path at distance `d` (with the saucer's own lane offset). */
  private saucerPosAt(s: Saucer, d: number, out: THREE.Vector3) {
    s.path.at(d, out, this.tan);
    out.x += -this.tan.z * s.offset;
    out.z += this.tan.x * s.offset;
    out.y = TILE_TOP + s.def.hover;
    return out;
  }

  private damage(s: Saucer, amount: number, tower: Tower | null) {
    if (s.dying) return;
    const dmg = applyArmor(amount, s.def.armor);
    s.hp -= dmg;
    s.punch = 1;
    if (s.hp <= 0) this.kill(s, tower);
  }

  private kill(s: Saucer, tower: Tower | null) {
    s.hp = 0;
    const tan = new THREE.Vector3();
    s.path.at(s.dist, new THREE.Vector3(), tan);
    this.tan.copy(tan);
    s.dying = { t: 0, v: new THREE.Vector3(this.tan.x * s.speed * 0.7 + rand(-0.4, 0.4), 1.4, this.tan.z * s.speed * 0.7 + rand(-0.4, 0.4)), spin: rand(9, 14) * Math.sign(s.spinRate || 1) };
    if (s.beam) this.endBeam(s);
    if (this.focus === s) this.focus = null;
    this.hideBar(s);
    if (s.demo) {
      this.sparks.burst(10, s.pos.x, s.pos.y, s.pos.z, { color: 0xfff1c4, size: 0.1, life: 0.4, speed: 2.5, drag: 2 });
      return;
    }
    const gold = s.def.gold;
    this.gold += gold;
    this.stats.gold += gold;
    this.stats.kills++;
    if (tower) tower.kills++;
    this.floatText(`+${gold}`, s.pos.x, s.pos.y + 0.35, s.pos.z, "#fde047");
    this.sparks.burst(s.def.kind === "boss" ? 50 : 8, s.pos.x, s.pos.y, s.pos.z, { color: 0xfacc15, size: 0.08, life: 0.7, speed: 2.4, up: 1.5, gravity: 4, drag: 1 });
    this.sfx.saucerDown();
    this.sfx.coin();
    if (s.def.kind === "boss") {
      this.shake = Math.max(this.shake, 0.55);
      this.explosion(s.pos.x, s.pos.y, s.pos.z, 1.8, true);
      this.sfx.explosion(true);
      this.flashBanner("Mothership down!", `+${gold} gold`, "good");
    }
  }

  private releaseSaucer(s: Saucer) {
    if (s.beam) this.endBeam(s);
    this.hideBar(s);
    s.rig.root.removeFromParent();
    let list = this.rigPool.get(s.def.kind);
    if (!list) this.rigPool.set(s.def.kind, (list = []));
    list.push(s.rig);
    const i = this.saucers.indexOf(s);
    if (i >= 0) this.saucers.splice(i, 1);
    if (this.focus === s) this.focus = null;
    for (const t of this.towers) if (t.target === s) t.target = null;
  }

  private hideBar(s: Saucer) {
    if (!s.bar) return;
    s.bar.bg.visible = s.bar.fill.visible = false;
    this.barPool.push(s.bar);
    s.bar = null;
  }

  private updateSaucers(dt: number) {
    const camRight = this.camRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    for (let i = this.saucers.length - 1; i >= 0; i--) {
      const s = this.saucers[i];
      const { rig } = s;
      if (s.dying) {
        const d = s.dying;
        d.t += dt;
        d.v.y -= 7.5 * dt;
        s.pos.addScaledVector(d.v, dt);
        rig.root.position.copy(s.pos);
        rig.model.rotation.y += d.spin * dt;
        rig.tilt.rotation.z = Math.min(1.1, rig.tilt.rotation.z + dt * 1.6);
        if (Math.random() < dt * 40) {
          this.smoke.emit({ x: s.pos.x, y: s.pos.y, z: s.pos.z, vy: 0.3, color: 0x8a8299, size: 0.2 * s.def.size * 2, grow: 2.4, life: 0.8, alpha: 0.55, drag: 1 });
          this.sparks.emit({ x: s.pos.x, y: s.pos.y, z: s.pos.z, color: 0xff9a3c, size: 0.2 * s.def.size * 2, life: 0.18 });
        }
        if (s.pos.y <= TILE_TOP + 0.08 || d.t > 2.2) {
          this.explosion(s.pos.x, Math.max(s.pos.y, TILE_TOP + 0.1), s.pos.z, s.def.kind === "boss" ? 2.2 : 0.6 + s.def.size * 0.6, s.def.kind === "boss");
          if (!s.demo || Math.random() < 0.5) this.sfx.explosion(s.def.kind === "boss");
          if (s.def.kind === "boss") this.shake = Math.max(this.shake, 0.8);
          this.releaseSaucer(s);
        }
        continue;
      }

      s.spawnT += dt;
      s.dist += s.speed * dt * Math.min(1, 0.3 + s.spawnT);
      if (s.dist >= s.path.length) {
        this.leak(s);
        continue;
      }
      this.saucerPosAt(s, s.dist, s.pos);
      // Rise out of the portal.
      const rise = Math.min(1, s.spawnT / 0.7);
      const e = 1 - (1 - rise) * (1 - rise);
      s.bob += dt * 2.6;
      s.pos.y = TILE_TOP + 0.05 + (s.def.hover - 0.05) * e + Math.sin(s.bob) * 0.05;
      rig.root.position.copy(s.pos);
      s.punch = Math.max(0, s.punch - dt * 7);
      rig.root.scale.setScalar((0.3 + 0.7 * e) * (1 + s.punch * 0.12));

      // Spin, lean into the direction of travel and bank in turns.
      const heading = Math.atan2(this.tan.x, this.tan.z);
      const turn = angleDiff(s.heading, heading);
      s.heading = heading;
      s.bank = damp(s.bank, clamp((turn / Math.max(dt, 1e-4)) * 0.05, -0.45, 0.45), 6, dt);
      this.q1.setFromAxisAngle(this.v1.set(this.tan.z, 0, -this.tan.x), 0.16);
      this.q2.setFromAxisAngle(this.tan, -s.bank);
      rig.tilt.quaternion.multiplyQuaternions(this.q2, this.q1);
      rig.model.rotation.y += s.spinRate * dt;

      if (s.beam) this.updateBeam(s, dt);
      // Engine glow under the hull.
      if (Math.random() < dt * 14) {
        const glow = s.def.kind === "beam" ? 0xe879f9 : s.def.kind === "boss" ? 0xf0abfc : 0x93c5fd;
        this.sparks.emit({ x: s.pos.x + rand(-0.1, 0.1) * s.def.size, y: s.pos.y - s.def.size * 0.22, z: s.pos.z + rand(-0.1, 0.1) * s.def.size, vy: -0.5, color: glow, size: 0.16 * s.def.size * 2, life: 0.35, alpha: 0.6 });
      }

      // Health bar while damaged (always for the mothership).
      if (!s.demo && (s.hp < s.maxHp || s.def.kind === "boss")) {
        s.bar ??= this.getBar();
        const w = s.def.kind === "boss" ? 1.3 : 0.55;
        const ratio = clamp(s.hp / s.maxHp, 0, 1);
        const y = s.pos.y + s.def.size * 0.55 + 0.12;
        s.bar.bg.position.set(s.pos.x - camRight.x * w * 0.5, y, s.pos.z - camRight.z * w * 0.5);
        s.bar.fill.position.copy(s.bar.bg.position);
        s.bar.bg.scale.set(w, 0.085, 1);
        s.bar.fill.scale.set(Math.max(0.001, w * ratio), 0.085, 1);
        s.bar.fill.material = s.def.kind === "boss" ? this.barMats.boss : ratio > 0.6 ? this.barMats.hi : ratio > 0.3 ? this.barMats.mid : this.barMats.lo;
      }
    }
  }

  private leak(s: Saucer) {
    const p = this.keepPos;
    this.explosion(s.pos.x, s.pos.y, s.pos.z, 0.6, false);
    this.sparks.burst(30, p.x, p.y + 1.4, p.z, { color: 0xe879f9, size: 0.12, life: 0.7, speed: 3, drag: 2 });
    if (this.keep) this.keep.flash = 1;
    if (s.demo || this.ending) {
      this.releaseSaucer(s);
      return;
    }
    const before = this.lives;
    this.lives = Math.max(0, this.lives - s.def.leak);
    if (before > 5 && this.lives <= 5 && this.lives > 0) this.flashBanner("The keep is failing!", `Only ${this.lives} lives left`, "bad");
    this.stats.leaked += s.def.leak;
    this.shake = Math.max(this.shake, s.def.kind === "boss" ? 0.7 : 0.25);
    this.sfx.leak();
    this.floatText(`−${s.def.leak} ♥`, p.x, p.y + 2, p.z, "#fb7185");
    this.releaseSaucer(s);
    if (this.lives <= 0 && !this.ending) this.lose();
  }

  // --- Tractor beams ------------------------------------------------------------------------------

  private updateBeam(s: Saucer, dt: number) {
    const b = s.beam!;
    if (b.state === "idle") {
      b.cd -= dt;
      if (b.cd > 0 || s.spawnT < 1) return;
      let best: Tower | null = null;
      let bestD = BEAM.range * BEAM.range;
      for (const t of this.towers) {
        if (t.frozen > 0 || t.selling > 0) continue;
        const dx = t.root.position.x - s.pos.x;
        const dz = t.root.position.z - s.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD && !this.saucers.some((o) => o !== s && o.beam?.target === t)) {
          bestD = d2;
          best = t;
        }
      }
      if (!best) {
        b.cd = 0.4;
        return;
      }
      b.state = "charge";
      b.t = 0;
      b.target = best;
      b.obj = this.beamPool.pop() ?? this.protos.get(FX.beam)?.object.clone() ?? null;
      if (b.obj) this.overlay.add(b.obj);
      if (!s.demo) this.sfx.beam();
      return;
    }
    const t = b.target;
    if (!t || t.selling > 0) {
      this.endBeam(s);
      return;
    }
    b.t += dt;
    if (b.state === "charge" && b.t >= BEAM.charge) {
      b.state = "hold";
      b.t = 0;
      t.frozen = BEAM.freeze;
      if (!s.demo) this.sfx.freeze();
      if (!s.demo && !t.demo) this.floatText("Frozen!", t.root.position.x, t.root.position.y + 1.6, t.root.position.z, "#a5f3fc");
    } else if (b.state === "hold") {
      t.frozen = Math.max(t.frozen, 0.05);
      if (b.t >= BEAM.freeze) {
        this.endBeam(s);
        return;
      }
    }
    // Stretch the cone from the tower's top up to the saucer.
    if (b.obj) {
      const from = this.v1.set(t.root.position.x, t.root.position.y + t.pivot.position.y - 0.15, t.root.position.z);
      const dir = this.v3.subVectors(s.pos, from);
      const len = Math.max(0.1, dir.length() - 0.1);
      dir.normalize();
      b.obj.position.copy(from);
      b.obj.quaternion.setFromUnitVectors(this.up, dir);
      const flicker = b.state === "charge" ? 0.25 + Math.random() * 0.25 : 0.6 + Math.sin(this.elapsed * 30) * 0.06;
      b.obj.scale.set(flicker, len, flicker);
    }
  }

  private endBeam(s: Saucer) {
    const b = s.beam;
    if (!b) return;
    if (b.target && b.state === "hold") {
      b.target.frozen = 0;
      const p = b.target.root.position;
      this.sparks.burst(14, p.x, p.y + b.target.pivot.position.y, p.z, { color: 0xa5f3fc, size: 0.08, life: 0.5, speed: 2, drag: 2 });
    }
    if (b.obj) {
      b.obj.removeFromParent();
      this.beamPool.push(b.obj);
    }
    b.obj = null;
    b.target = null;
    b.state = "idle";
    b.t = 0;
    b.cd = BEAM.cooldown;
  }

  // --- Waves --------------------------------------------------------------------------------------

  private startWave(bonus = 0) {
    if (this.wave >= this.map.waves) return;
    this.wave++;
    const groups = buildWave(this.map, this.wave);
    let start = 0;
    let n = 0;
    for (const g of groups) {
      start += g.delay;
      for (let i = 0; i < g.count; i++) {
        this.queue.push({ at: this.clock + start + i * g.gap, kind: g.kind, path: g.kind === "boss" ? 0 : n++ % Math.max(1, this.paths.length) });
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
    this.countdown = -1;
    const boss = groups.some((g) => g.kind === "boss");
    const final = this.wave === this.map.waves;
    const beams = this.wave === this.map.beamFrom;
    this.flashBanner(
      final ? "Final wave!" : `Wave ${this.wave}`,
      boss ? "A mothership approaches!" : beams ? "Beam saucers freeze towers — shoot them first!" : bonus ? `Called early · +${bonus} gold` : this.wave === 3 ? "Fast scouts incoming" : this.wave === 4 ? "Armoured saucers shrug off turret fire" : undefined,
      boss ? "boss" : "info",
    );
    this.sfx.waveStart(boss);
  }

  private updateWaves(dt: number) {
    this.clock += dt;
    while (this.queue.length && this.queue[0].at <= this.clock) {
      const sp = this.queue.shift()!;
      this.spawnSaucer(sp.kind, sp.path);
    }
    if (this.queue.length === 0) {
      const alive = this.saucers.length;
      if (alive === 0 && this.cleared < this.wave) {
        this.cleared = this.wave;
        if (this.wave >= this.map.waves) {
          this.win();
          return;
        }
        const bonus = waveBonus(this.wave);
        this.gold += bonus;
        this.stats.gold += bonus;
        this.flashBanner(`Wave ${this.wave} cleared`, `+${bonus} gold`, "good");
        this.sfx.bonus();
      }
      if (this.countdown < 0 && this.wave < this.map.waves) this.countdown = BREAK;
    }
    if (this.countdown >= 0) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && before <= 3 && before > 0) this.sfx.tick(before);
      if (this.countdown <= 0) this.startWave();
    }
  }

  private lose() {
    this.ending = { t: 0, won: false };
    this.sfx.defeat();
    const p = this.keepPos;
    this.explosion(p.x, p.y + 0.8, p.z, 2.4, true);
    this.shake = 1;
    if (this.keep) this.keep.flash = 1;
    music.setIntensity(0);
  }

  private win() {
    this.ending = { t: 0, won: true };
    this.sfx.victory();
    this.flashBanner("Victory!", `${this.map.name} is safe`, "good");
    music.setIntensity(0);
  }

  private finish() {
    const won = !!this.ending?.won;
    const result: Result = {
      won,
      map: this.mapIndex,
      wave: won ? this.map.waves : this.wave,
      waves: this.map.waves,
      lives: this.lives,
      maxLives: this.map.lives,
      stars: won ? starsFor(this.lives, this.map.lives) : 0,
      kills: this.stats.kills,
      gold: this.stats.gold,
      built: this.stats.built,
      leaked: this.stats.leaked,
      time: this.stats.time,
    };
    this.sfx.engines(0);
    this.setPhase(won ? "won" : "lost");
    this.events.result(result);
  }

  // --- Effects ------------------------------------------------------------------------------------

  private explosion(x: number, y: number, z: number, scale: number, big: boolean) {
    this.sparks.emit({ x, y, z, color: 0xfff4d6, size: 0.9 * scale, life: 0.12 });
    this.sparks.emit({ x, y, z, color: 0xffa94d, size: 1.3 * scale, grow: 1.4, life: 0.22, alpha: 0.7 });
    this.sparks.burst(Math.round(12 * scale), x, y, z, { color: 0xffb347, size: 0.11 * Math.sqrt(scale), life: 0.55, speed: 3.2 * scale, gravity: 5, drag: 1.5 });
    this.sparks.burst(Math.round(6 * scale), x, y, z, { color: 0xd8b4fe, size: 0.09, life: 0.5, speed: 2.4 * scale, drag: 2 });
    this.smoke.burst(Math.round(8 * scale), x, y, z, { color: 0x9a92aa, size: 0.32 * scale, grow: 2.3, life: 1.0, speed: 0.9 * scale, up: 0.5, drag: 2.5, alpha: 0.6, spread: 0.2 * scale });
    if (big) {
      this.sparks.burst(40, x, y, z, { color: 0xffe08a, size: 0.13, life: 1.1, speed: 6, gravity: 4, drag: 1 });
      this.smoke.burst(16, x, y, z, { color: 0x6f6680, size: 0.7, grow: 2.6, life: 1.8, speed: 1.6, up: 0.8, drag: 1.5, alpha: 0.65, spread: 0.6 });
    }
  }

  private dust(x: number, z: number, scale: number) {
    const color = this.map.theme === "snow" ? 0xf1f5ff : 0xd9c8a5;
    for (let i = 0; i < 18 * scale; i++) {
      const a = (i / (18 * scale)) * Math.PI * 2 + Math.random() * 0.3;
      const v = rand(1.2, 2.2);
      this.smoke.emit({ x: x + Math.cos(a) * 0.35, y: TILE_TOP + 0.08, z: z + Math.sin(a) * 0.35, vx: Math.cos(a) * v, vy: rand(0.2, 0.6), vz: Math.sin(a) * v, color, size: rand(0.18, 0.3), grow: 2, life: rand(0.5, 0.8), drag: 4, alpha: 0.85 });
    }
  }

  private floatText(text: string, x: number, y: number, z: number, color: string) {
    const key = `${text}|${color}`;
    let mat = this.textCache.get(key);
    if (!mat) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 96;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.font = `800 58px ${this.font}, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 12;
        ctx.strokeStyle = "rgba(20,10,40,0.85)";
        ctx.strokeText(text, 128, 50);
        ctx.fillStyle = color;
        ctx.fillText(text, 128, 50);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
      this.textCache.set(key, mat);
    }
    const sprite = this.floaterPool.pop() ?? new THREE.Sprite(mat);
    sprite.material = mat;
    sprite.visible = true;
    sprite.renderOrder = 12;
    sprite.position.set(x, y, z);
    sprite.scale.set(0.8, 0.3, 1);
    this.overlay.add(sprite);
    this.floaters.push({ sprite, t: 0 });
  }

  private updateFloaters(dt: number) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      f.sprite.position.y += dt * 0.8;
      const k = f.t / 1.1;
      (f.sprite.material as THREE.SpriteMaterial).opacity = 1;
      const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1;
      f.sprite.scale.set(0.8 * s, 0.3 * s, 1);
      f.sprite.visible = k < 1 && (k < 0.75 || Math.floor(f.t * 20) % 2 === 0);
      if (k >= 1) {
        f.sprite.removeFromParent();
        this.floaterPool.push(f.sprite);
        this.floaters.splice(i, 1);
      }
    }
  }

  private flashBanner(title: string, sub: string | undefined, tone: Banner["tone"]) {
    this.events.banner({ id: ++this.bannerId, title, sub, tone });
  }

  private ambient(dt: number) {
    // Portal swirl.
    for (const p of this.spawnCells) {
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        this.sparks.emit({ x: p.x + Math.cos(a) * 0.28, y: TILE_TOP + 0.05, z: p.z + Math.sin(a) * 0.28, vx: -Math.sin(a) * 0.6, vy: rand(0.5, 1.1), vz: Math.cos(a) * 0.6, color: 0xb794f6, size: 0.08, life: 0.9, drag: 1 });
      }
    }
    // Keep crystals glow and spin.
    if (this.keep) {
      const k = this.keep;
      k.flash = Math.max(0, k.flash - dt * 2.5);
      if (k.crystal) {
        k.crystal.rotation.y += dt * 0.6;
        k.crystal.position.y = 0.544 + Math.sin(this.elapsed * 2) * 0.03;
      }
      const lost = this.phase === "lost" || (this.ending && !this.ending.won);
      k.root.visible = !lost || (this.ending?.t ?? 1) < 0.2;
      const shake = k.flash * 0.06;
      k.root.position.set(this.keepPos.x + (Math.random() - 0.5) * shake, this.keepPos.y, this.keepPos.z + (Math.random() - 0.5) * shake);
      if (Math.random() < dt * 6) {
        const p = this.keepPos;
        this.sparks.emit({ x: p.x + rand(-0.3, 0.3), y: p.y + rand(1.2, 1.9), z: p.z + rand(-0.3, 0.3), vy: 0.35, color: 0xe9d5ff, size: 0.07, life: 1.2 });
      }
    }
  }

  // --- Frame --------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.phase === "loading" || this.phase === "error") return;

    const running = this.phase === "playing" || this.phase === "menu" || this.phase === "won" || this.phase === "lost";
    if (running) {
      const scale = this.phase === "playing" ? this.speed : 1;
      let left = dt * scale;
      while (left > 1e-6) {
        const step = Math.min(SIM_STEP, left);
        this.step(step);
        left -= step;
      }
      this.elapsed += dt;
      this.sparks.update(dt);
      this.smoke.update(dt);
      this.updateFloaters(dt);
    }
    this.updateCamera(this.phase === "paused" ? 0 : dt);
    this.updateMarkers(dt);
    this.emitHud();
    this.renderer.render(this.scene, this.camera);
    this.adaptResolution(dt);
  };

  private adaptResolution(dt: number) {
    const p = this.perf;
    p.t += dt;
    p.frames++;
    if (p.t < 2.5) return;
    const fps = p.frames / p.t;
    p.t = 0;
    p.frames = 0;
    let next = p.ratio;
    if (fps < 42 && p.ratio > 1) next = Math.max(1, p.ratio - 0.25);
    else if (fps > 58 && p.ratio < p.max) next = Math.min(p.max, p.ratio + 0.25);
    if (next === p.ratio) return;
    p.ratio = next;
    this.renderer.setPixelRatio(next);
    this.resize();
  }

  private step(dt: number) {
    if (this.phase === "menu") this.updateDemo(dt);
    if (this.phase === "playing" && !this.ending) {
      this.stats.time += dt;
      this.updateWaves(dt);
    }
    this.updateTowers(dt);
    this.updateShots(dt);
    this.updateSaucers(dt);
    this.ambient(dt);
    if (this.ending && this.phase === "playing") {
      this.ending.t += dt;
      if (this.ending.won && Math.random() < dt * 6) {
        const x = rand(-this.cols / 2, this.cols / 2);
        const z = rand(-this.rows / 2, this.rows / 2);
        const colors = [0xc084fc, 0xfacc15, 0x6ee7b7, 0xf472b6, 0x93c5fd];
        this.sparks.burst(40, x, rand(2.5, 4), z, { color: colors[Math.floor(Math.random() * colors.length)], size: 0.1, life: 1.2, speed: 3.5, gravity: 2.5, drag: 1.2 });
        this.sfx.explosion(false);
      }
      if (this.ending.t > (this.ending.won ? 2.6 : 2.2)) this.finish();
    }
    if (this.phase === "playing") {
      const boss = this.saucers.some((s) => s.def.kind === "boss" && !s.dying);
      const danger = boss || this.lives <= 5;
      if (danger !== this.dangerMusic && !this.ending) {
        this.dangerMusic = danger;
        music.setIntensity(danger ? 2 : 1);
      }
      this.sfx.engines(Math.min(1, this.saucers.length / 12));
    }
  }

  // --- Camera -------------------------------------------------------------------------------------

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const portrait = w / h < 0.9;
    if (portrait !== this.portrait) {
      this.portrait = portrait;
      this.curYaw = this.yaw = portrait ? Math.PI / 2 : 0;
    }
    const scale = this.renderer.getPixelRatio() * h;
    this.sparks.setScale(scale, this.camera.fov);
    this.smoke.setScale(scale, this.camera.fov);
    const prevFit = this.fit;
    this.updateFit();
    this.camDist = clamp(this.camDist * (this.fit / prevFit), this.fit * 0.42, this.fit * 1.15);
    this.curDist = this.camDist;
  }

  private placeCamera(target: THREE.Vector3, dist: number, yaw: number, pitch: number) {
    const c = Math.cos(pitch);
    this.camera.position.set(target.x + Math.sin(yaw) * c * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * c * dist);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);
  }

  /** Distance at which the whole playable grid fits between the HUD bars. */
  private updateFit() {
    const hud = hudMargins(this.viewW);
    const top = 1 - (2 * hud.top) / this.viewH;
    const bottom = -1 + (2 * hud.bottom) / this.viewH;
    const side = 0.97;
    const hw = this.cols / 2 + 0.1;
    const hd = this.rows / 2 + 0.1;
    const corners = [
      [-hw, 0, -hd],
      [hw, 0, -hd],
      [-hw, 0, hd],
      [hw, 0, hd],
      [-hw, 1.2, -hd],
      [hw, 1.2, -hd],
    ];
    const target = new THREE.Vector3();
    // The target sits between the two bars, so shift it to keep the map centred in the free space.
    let lo = 4;
    let hi = 120;
    for (let it = 0; it < 26; it++) {
      const mid = (lo + hi) / 2;
      this.placeCamera(target, mid, this.yaw, PITCH);
      let minY = Infinity;
      let maxY = -Infinity;
      let ok = true;
      for (const [x, y, z] of corners) {
        const p = this.v1.set(x, y + TILE_TOP, z).project(this.camera);
        if (Math.abs(p.x) > side) ok = false;
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      if (maxY - minY > top - bottom) ok = false;
      if (ok) hi = mid;
      else lo = mid;
    }
    this.fit = hi;
  }

  private updateCamera(dt: number) {
    const menu = this.phase === "menu";
    // Keyboard panning.
    if (dt > 0 && this.keys.size && !menu) {
      const speed = this.camDist * 0.9 * dt;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      let mx = 0;
      let mz = 0;
      const dirs: [string, number, number][] = [
        ["up", fx, fz],
        ["down", -fx, -fz],
        ["right", rx, rz],
        ["left", -rx, -rz],
      ];
      for (const [key, x, z] of dirs) {
        if (!this.keys.has(key)) continue;
        mx += x;
        mz += z;
      }
      this.camTarget.x += mx * speed;
      this.camTarget.z += mz * speed;
    }
    this.clampTarget();

    // The free space between the HUD bars isn't centred: nudge the look-at so the map is.
    const fovT = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const hud = hudMargins(this.viewW);
    const offset = menu ? 0 : (((hud.bottom - hud.top) / this.viewH) * this.curDist * fovT) / Math.sin(PITCH);
    const ox = Math.sin(this.yaw) * offset;
    const oz = Math.cos(this.yaw) * offset;
    const k = dt > 0 ? 1 - Math.exp(-10 * dt) : 1;
    this.curTarget.x += (this.camTarget.x + ox - this.curTarget.x) * k;
    this.curTarget.z += (this.camTarget.z + oz - this.curTarget.z) * k;
    this.curDist += (this.camDist - this.curDist) * k;
    let yaw = this.yaw;
    let pitch = PITCH;
    let dist = this.curDist;
    if (menu) {
      yaw += Math.sin(this.elapsed * 0.12) * 0.32;
      pitch = 0.86 + Math.sin(this.elapsed * 0.09) * 0.05;
      dist = this.fit * 0.98;
    }
    this.curYaw += angleDiff(this.curYaw, yaw) * (dt > 0 ? 1 - Math.exp(-3 * dt) : 1);
    this.placeCamera(this.curTarget, dist, this.curYaw, pitch);
    this.shake = damp(this.shake, 0, 5, dt);
    if (this.shake > 0.01) {
      const s = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
  }

  private clampTarget() {
    const hw = this.cols / 2;
    const hd = this.rows / 2;
    this.camTarget.x = clamp(this.camTarget.x, -hw, hw);
    this.camTarget.z = clamp(this.camTarget.z, -hd, hd);
    this.camTarget.y = 0;
  }

  // --- Input --------------------------------------------------------------------------------------

  private groundAt(x: number, y: number, out: THREE.Vector3) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, out);
  }

  private cellAtScreen(x: number, y: number): Cell | null {
    const p = this.groundAt(x, y, this.v1);
    if (!p) return null;
    return this.cellAt(Math.floor(p.x + this.cols / 2), Math.floor(p.z + this.rows / 2));
  }

  private onPointerDown = (e: PointerEvent) => {
    audio.unlock();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Not every pointer can be captured (synthetic events); dragging still works without it.
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, button: e.button });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      for (const p of this.pointers.values()) p.moved = true;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse") this.hoverCell = this.phase === "playing" ? this.cellAtScreen(e.clientX, e.clientY) : null;
      return;
    }
    if (this.phase !== "playing") {
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    if (this.pointers.size >= 2 && this.pinch) {
      p.x = e.clientX;
      p.y = e.clientY;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (dist > 10) this.camDist = clamp(this.camDist * (this.pinch.dist / dist), this.fit * 0.42, this.fit * 1.15);
      this.panScreen(this.pinch.mid.x, this.pinch.mid.y, mid.x, mid.y);
      this.pinch = { dist, mid };
      return;
    }
    if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.moved = true;
    if (p.moved) {
      this.panScreen(p.x, p.y, e.clientX, e.clientY);
      this.hoverCell = null;
    } else if (e.pointerType === "mouse") this.hoverCell = this.cellAtScreen(e.clientX, e.clientY);
    p.x = e.clientX;
    p.y = e.clientY;
  };

  /** Drags the ground so the point under (x0, y0) ends up under (x1, y1). */
  private panScreen(x0: number, y0: number, x1: number, y1: number) {
    const a = this.groundAt(x0, y0, this.v1);
    const b = this.groundAt(x1, y1, this.v2);
    if (!a || !b) return;
    this.camTarget.x -= b.x - a.x;
    this.camTarget.z -= b.z - a.z;
    this.clampTarget();
    // Move instantly so the ground sticks to the finger.
    this.curTarget.x -= b.x - a.x;
    this.curTarget.z -= b.z - a.z;
  }

  private onPointerUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p || p.moved || this.pointers.size > 0) return;
    if (p.button === 2) {
      this.deselect();
      return;
    }
    this.tap(e.clientX, e.clientY);
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.pinch = null;
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.hoverCell = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.phase !== "playing") return;
    this.camDist = clamp(this.camDist * Math.exp(e.deltaY * 0.0012), this.fit * 0.42, this.fit * 1.15);
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  /** Click / tap: focus a saucer, select a tower, or build / select an empty tile. */
  private tap(x: number, y: number) {
    if (this.phase !== "playing" || this.ending) return;
    const rect = this.canvas.getBoundingClientRect();
    // Saucers: nearest on screen within a finger's width.
    let best: Saucer | null = null;
    let bestD = Infinity;
    const pxPerUnit = rect.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    for (const s of this.armed ? [] : this.saucers) {
      if (s.dying) continue;
      const depth = this.v1.copy(s.pos).distanceTo(this.camera.position);
      const p = this.v1.copy(s.pos).project(this.camera);
      const sx = rect.left + ((p.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - p.y) / 2) * rect.height;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      const r = Math.max(14, (s.def.size * 0.65 * pxPerUnit) / depth);
      if (d < r * r && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) {
      this.focus = this.focus === best ? null : best;
      this.sfx.click();
      return;
    }
    // Towers (their tops overlap the tiles behind them).
    this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    let hitTower: Tower | null = null;
    let hitDist = Infinity;
    for (const t of this.towers) {
      if (t.selling > 0) continue;
      const hit = this.raycaster.intersectObject(t.root, true)[0];
      if (hit && hit.distance < hitDist) {
        hitDist = hit.distance;
        hitTower = t;
      }
    }
    if (hitTower) {
      this.armed = null;
      this.select(this.selTower === hitTower ? null : hitTower);
      this.sfx.click();
      return;
    }
    const cell = this.cellAtScreen(x, y);
    if (!cell || cell.kind !== "build") {
      this.deselect();
      return;
    }
    if (cell.tower) {
      this.armed = null;
      this.select(cell.tower);
      this.sfx.click();
      return;
    }
    if (this.armed) {
      this.build(this.armed, cell);
      return;
    }
    this.select(this.selCell === cell ? null : cell);
    this.sfx.click();
  }

  private select(what: Cell | Tower | null) {
    this.selCell = null;
    this.selTower = null;
    if (!what) return;
    if ("root" in what) this.selTower = what;
    else this.selCell = what;
  }

  private updateMarkers(dt: number) {
    const playing = this.phase === "playing" || this.phase === "paused";
    const hm = this.hoverMarker;
    if (hm) {
      const c = playing && !this.ending ? this.hoverCell : null;
      const show = !!c && c.kind === "build" && c !== this.selCell && (!c.tower || c.tower !== this.selTower);
      hm.visible = show;
      if (show && c) {
        this.center(c.x, c.z, hm.position);
        hm.position.y = TILE_TOP + 0.02 + Math.sin(this.elapsed * 6) * 0.015;
        const s = c.tower ? 0.92 : 0.86;
        hm.scale.set(s, 1, s);
      }
    }
    const sm = this.selectMarker;
    if (sm) {
      const c = this.selTower?.cell ?? this.selCell;
      sm.visible = playing && !!c;
      if (c) {
        this.center(c.x, c.z, sm.position);
        sm.position.y = TILE_TOP + 0.005;
        const pulse = 0.94 + Math.sin(this.elapsed * 5) * 0.03;
        sm.scale.set(pulse, 0.6, pulse);
      }
    }
    const fm = this.focusMarker;
    if (fm) {
      const f = playing ? this.focus : null;
      fm.visible = !!f;
      if (f) {
        fm.position.set(f.pos.x, f.pos.y - f.def.size * 0.15, f.pos.z);
        const s = f.def.size * 1.5;
        fm.scale.set(s, 1, s);
        fm.rotation.y += dt * 2.5;
      }
    }
    // Range ring: selected tower, or the type you're about to build.
    let ringAt: THREE.Vector3 | null = null;
    let radius = 0;
    if (playing && this.selTower) {
      ringAt = this.selTower.root.position;
      radius = TOWERS[this.selTower.kind].levels[this.selTower.level].range;
    } else if (playing) {
      const kind = this.hoverKind ?? this.armed;
      const c = this.selCell ?? (this.armed ? this.hoverCell : null);
      if (kind && c && c.kind === "build" && !c.tower) {
        ringAt = this.center(c.x, c.z, this.v3);
        radius = TOWERS[kind].levels[0].range;
      }
    }
    this.ring.visible = !!ringAt;
    if (ringAt) {
      this.ringRadius = damp(this.ringRadius, radius, 18, dt || 1);
      this.ring.position.set(ringAt.x, TILE_TOP + 0.04, ringAt.z);
      this.ring.scale.setScalar(this.ringRadius);
    }
  }

  // --- HUD ----------------------------------------------------------------------------------------

  private describeWave(w: number) {
    const counts = new Map<SaucerKind, number>();
    for (const g of buildWave(this.map, w)) counts.set(g.kind, (counts.get(g.kind) ?? 0) + g.count);
    const names: Record<SaucerKind, [string, string]> = {
      boss: ["Mothership", "Motherships"],
      standard: ["saucer", "saucers"],
      scout: ["scout", "scouts"],
      armored: ["armoured", "armoured"],
      beam: ["beam saucer", "beam saucers"],
    };
    const order: SaucerKind[] = ["boss", "standard", "scout", "armored", "beam"];
    return order
      .filter((k) => counts.has(k))
      .map((k) => {
        const n = counts.get(k)!;
        return k === "boss" && n === 1 ? names.boss[0] : `${n} ${names[k][n === 1 ? 0 : 1]}`;
      })
      .join(" · ");
  }

  private emitHud() {
    if (this.phase !== "playing" && this.phase !== "paused") return;
    const t = this.selTower;
    let tower: TowerInfo | null = null;
    if (t) {
      const lv = TOWERS[t.kind].levels[t.level];
      tower = {
        kind: t.kind,
        level: t.level,
        damage: lv.damage,
        rate: lv.rate,
        range: lv.range,
        splash: lv.splash,
        upgrade: t.level < 2 ? TOWERS[t.kind].upgrades[t.level] : null,
        sell: sellValue(t.kind, t.level),
        kills: t.kills,
        frozen: t.frozen > 0,
      };
    }
    const boss = this.saucers.find((s) => s.def.kind === "boss" && !s.dying);
    const upcoming = this.countdown >= 0 && this.wave < this.map.waves ? this.wave + 1 : 0;
    if (upcoming !== this.preview.wave) this.preview = { wave: upcoming, text: upcoming ? this.describeWave(upcoming) : null };
    const hud: Hud = {
      gold: this.gold,
      lives: this.lives,
      maxLives: this.map.lives,
      wave: this.wave,
      waves: this.map.waves,
      countdown: this.countdown >= 0 ? Math.ceil(this.countdown) : -1,
      bonus: this.countdown >= 0 ? earlyBonus(this.countdown, this.wave + 1) : 0,
      speed: this.speed,
      alive: this.saucers.length + this.queue.length,
      armed: this.armed,
      cell: !!this.selCell,
      tower,
      boss: boss ? Math.round((boss.hp / boss.maxHp) * 100) / 100 : null,
      next: this.preview.text,
      towers: this.towers.length,
    };
    const json = JSON.stringify(hud);
    if (json === this.lastHud) return;
    this.lastHud = json;
    this.events.hud(hud);
  }
}
