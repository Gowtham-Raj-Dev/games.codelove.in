import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { loadModels, type LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { Sfx } from "./audio";
import { soundtrack } from "./soundtrack";
import {
  ACHIEVEMENTS,
  BUILDINGS,
  GRID,
  HERO_ORDER,
  HEROES,
  isHero,
  levelMul,
  MARGIN,
  SPELL_ORDER,
  SPELLS,
  TROOP_ORDER,
  TROOPS,
  formatTime,
  gemsToFinish,
  levelCap,
  shortNumber,
  type BKind,
  type HeroKind,
  type SpellKind,
  type TroopKind,
  type UnitKind,
} from "./data";
import { arcLine, boltLine, groundRing, Overlay, Particles } from "./fx";
import { onlineBase, raiderArmy, searchCost, stage as stageOf, villageName, type OnlineBase } from "./layouts";
import { LATE, MODELS, K } from "./manifest";
import { N, Sim, STEP, type Projectile, type SB, type SimBuildingInput, type SU, type Zone } from "./sim";
import { altarSpot, FOUNDATION_H } from "./recipes";
import { Unit3D, UnitFactory, type CharKind } from "./units";
import * as V from "./village";
import { Bank, buildingMesh, footprintCenter, makeForest, makeGround, obstacleMesh, rubbleMesh, scaffold, WallLayer, type BuildingMesh, type WallInfo } from "./world";

// --- Public types ---------------------------------------------------------------------------------------

export type Mode = "loading" | "error" | "village" | "raid" | "defence";

/** Graphics setting: smooth (frame rate first), auto (sharpness adapts to the phone) or hd (full screen resolution). */
export type Quality = "smooth" | "auto" | "hd";

export interface Stat {
  label: string;
  value: string;
  next?: string;
}

export interface SelectedInfo {
  id: number;
  kind: BKind | "obstacle";
  name: string;
  level: number;
  maxLevel: number;
  stats: Stat[];
  desc: string;
  upgrade: { cost: number; res: "gold" | "elixir" | "gems"; time: number; can: boolean; reason?: string; label: string } | null;
  busy: { left: number; total: number; gems: number; label: string } | null;
  collect: { res: "gold" | "elixir"; amount: number } | null;
  panel: "army" | "lab" | "spells" | null;
  /** Hero altars: the hero is sleeping off its wounds. */
  heal: { left: number; gems: number } | null;
}

export interface HeroHud {
  kind: HeroKind;
  level: number;
  hp: number;
  left: number;
  upgrading: boolean;
  ready: boolean;
}

export interface VillageHud {
  rev: number;
  /** The live save (read-only for the UI; it changes in place, so re-render on every HUD update). */
  save: V.Save;
  name: string;
  th: number;
  gold: number;
  goldCap: number;
  elixir: number;
  elixirCap: number;
  gems: number;
  builders: number;
  freeBuilders: number;
  trophies: number;
  stars: number;
  army: number;
  housing: number;
  queued: number;
  trainLeft: number;
  spells: number;
  spellSlots: number;
  /** Seconds until every queued spell is brewed. */
  brewLeft: number;
  raidIn: number;
  /** `tray`: a building from the layout editor's tray (already paid for). */
  placing: { kind: BKind; valid: boolean; cost: number; res: string; tray: boolean } | null;
  selected: SelectedInfo | null;
  tutorial: number;
  research: { kind: string; left: number; total: number } | null;
  heroes: HeroHud[];
  /** Layout editor open: the buildings waiting in the tray. */
  editing: { tray: { kind: BKind; n: number }[] } | null;
}

export interface Slot {
  id: string;
  kind: UnitKind | SpellKind;
  spell: boolean;
  level: number;
  count: number;
  /** Heroes: on the field (`out`), ability still unused, health left. */
  hero?: { out: boolean; ability: boolean; hp: number };
}

export interface BattleHud {
  mode: "raid" | "defence";
  name: string;
  stage: number;
  timeLeft: number;
  started: boolean;
  percent: number;
  stars: number;
  gold: number;
  elixir: number;
  goldAvail: number;
  elixirAvail: number;
  slots: Slot[];
  selected: string | null;
  speed: number;
  raidersLeft: number;
  thDown: boolean;
  /** Online battles: the rival, the trophies at stake and what "Next" costs (while scouting). */
  online: { owner: string; th: number; win: number; lose: number; next: number } | null;
  /** Online scouting: seconds until the battle starts by itself (-1: no countdown). */
  scoutLeft: number;
  /** Your own storages (shown top-right while you attack). */
  own: { gold: number; goldCap: number; elixir: number; elixirCap: number };
}

export interface BattleResult {
  mode: "raid" | "defence";
  stage: number;
  name: string;
  stars: number;
  percent: number;
  gold: number;
  elixir: number;
  bonus: { gold: number; elixir: number; gems: number } | null;
  troops: { kind: UnitKind; n: number }[];
  spells: { kind: SpellKind; n: number }[];
  win: boolean;
  trophies: number;
  raiders: number;
  raidersKilled: number;
  newBest: boolean;
  /** Online battles: whose village it was. */
  online: { owner: string; th: number } | null;
}

export interface Events {
  progress(p: LoadProgress): void;
  mode(mode: Mode): void;
  hud(h: VillageHud): void;
  battle(h: BattleHud | null): void;
  result(r: BattleResult): void;
  toast(text: string, tone?: "info" | "good" | "bad"): void;
  error(msg: string): void;
  icons(icons: Record<string, string>): void;
}

export interface SaveStore {
  get(): unknown;
  set(save: V.Save): void;
}

// --- Internal types -------------------------------------------------------------------------------------

interface BView {
  id: number;
  kind: BKind;
  level: number;
  x: number;
  z: number;
  size: number;
  root: THREE.Group;
  mesh: BuildingMesh | null;
  scaffold: THREE.Group | null;
  rubble: THREE.Group | null;
  sb: SB | null;
  collapse: number;
  flash: number;
  spinT: number;
  hidden: boolean;
  /** Seconds since a hidden defence started springing up (-1: not rising). */
  rise: number;
}

interface OView {
  id: number;
  root: THREE.Group;
}

interface CampUnit {
  kind: TroopKind;
  u: Unit3D;
  slot: THREE.Vector3;
  walk: boolean;
  wait: number;
  emote: number;
  /** Animation time not yet applied (resting troops animate every other frame). */
  acc: number;
}

interface Worker {
  id: number;
  u: Unit3D;
  site: THREE.Vector3;
}

interface UnitView {
  u: Unit3D;
  lastSwing: number;
  gone: boolean;
  /** Seconds an intro clip (skeletons climbing out) keeps playing. */
  hold: number;
  cloaked: boolean;
  /** A swing is under way and its blow hasn't landed yet. */
  wound: boolean;
  /** Which attack of the look's combo comes next. */
  combo: number;
}

/**
 * Attack clips: started `lead` seconds before the blow (≈ the clip's impact frame at `speed`), back
 * to the hold pose `recover` seconds after it. The Kenney melee clips last 0.42 s, kicks 0.53 s.
 */
const SWING: Record<string, { lead: number; speed: number; recover: number }> = {
  default: { lead: 0.2, speed: 1, recover: 0.3 },
  "attack-melee-right": { lead: 0.19, speed: 1, recover: 0.28 },
  "attack-melee-left": { lead: 0.19, speed: 1, recover: 0.28 },
  "attack-kick-right": { lead: 0.25, speed: 1, recover: 0.32 },
  "attack-kick-left": { lead: 0.25, speed: 1, recover: 0.32 },
  "holding-right-shoot": { lead: 0.04, speed: 0.9, recover: 0.25 },
  "interact-right": { lead: 0.3, speed: 1, recover: 0.4 },
  "1H_Melee_Attack_Chop": { lead: 0.3, speed: 1.4, recover: 0.45 },
  "2H_Melee_Attack_Chop": { lead: 0.45, speed: 1.3, recover: 0.75 },
  "2H_Melee_Attack_Slice": { lead: 0.35, speed: 1.2, recover: 0.55 },
  atk01: { lead: 0.28, speed: 1.2, recover: 0.4 },
};

interface HeroFigure {
  kind: HeroKind;
  u: Unit3D;
  level: number;
  /** Altar centre and where the hero is walking to on it. */
  home: THREE.Vector3;
  goal: THREE.Vector3;
  wait: number;
  sleeping: boolean;
}

const SKY_TOP = new THREE.Color("#5aa9e6");
const SKY_HORIZON = new THREE.Color("#cfe8f3");
const PITCH = 0.92;
const YAW = Math.PI / 4;
/** Raid time limit (seconds). */
const RAID_TIME = 300;
/** Online battles: seconds to look at the rival's village before the battle starts by itself. */
const SCOUT_TIME = 30;
const clamp = THREE.MathUtils.clamp;
const RES_COLOR = { gold: "#fde047", elixir: "#f0abfc", gems: "#6ee7b7" } as const;
export const RES_ICON = {
  gold: `<span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff7c2,#fbbf24 45%,#b45309);box-shadow:0 0 0 2px #78350f"></span>`,
  elixir: `<span style="display:inline-block;width:14px;height:17px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:radial-gradient(circle at 35% 35%,#fbcfe8,#d946ef 50%,#701a75);box-shadow:0 0 0 2px #4a044e"></span>`,
  gems: `<span style="display:inline-block;width:14px;height:14px;transform:rotate(45deg);background:linear-gradient(135deg,#d1fae5,#10b981 55%,#065f46);box-shadow:0 0 0 2px #064e3b"></span>`,
};

const tileToWorld = (x: number, z: number, out = new THREE.Vector3()) => out.set(x - GRID / 2, 0, z - GRID / 2);
const simToWorld = (x: number, z: number, out = new THREE.Vector3()) => out.set(x - N / 2, 0, z - N / 2);

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * A little photo studio for portraits: renders an object against a transparent background from the
 * game's three-quarter view, `size` px with 4× MSAA, scaled down to `out` px (extra smoothing),
 * returned as a PNG blob URL.
 */
class Studio {
  readonly scene = new THREE.Scene();
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly cam = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
  private readonly pixels: Uint8Array;
  private readonly big = document.createElement("canvas");
  private readonly small = document.createElement("canvas");
  private readonly box = new THREE.Box3();
  private readonly c = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  /** The game's three-quarter view direction. */
  private static readonly DIR = new THREE.Vector3(1.05, 0.85, 1.05).normalize();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    env: THREE.Texture | null,
    private readonly size: number,
    private readonly out: number,
  ) {
    this.rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.pixels = new Uint8Array(size * size * 4);
    this.big.width = this.big.height = size;
    this.small.width = this.small.height = out;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.45;
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a9f7a", 1.3));
    const light = new THREE.DirectionalLight("#ffffff", 1.8);
    light.position.set(-2, 4, 3);
    this.scene.add(light);
  }

  /** `fill`: how much of the picture the object's outline may take (the rest is margin, nothing is cut). */
  async shoot(obj: THREE.Object3D, fill = 0.86): Promise<string> {
    const { renderer, rt, scene, cam, size, out } = this;
    scene.add(obj);
    obj.updateMatrixWorld(true);
    this.box.setFromObject(obj);
    this.frame(fill);
    const prevClear = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
    } finally {
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, prevClear);
      scene.remove(obj);
    }
    // Read the picture back without making the GPU wait (a blocking read hitches the game on phones).
    try {
      await renderer.readRenderTargetPixelsAsync(rt, 0, 0, size, size, this.pixels);
    } catch {
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, this.pixels);
    }
    const ctx = this.big.getContext("2d");
    const sctx = this.small.getContext("2d");
    if (!ctx || !sctx) return "";
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(this.pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    sctx.clearRect(0, 0, out, out);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(this.big, 0, 0, out, out);
    return new Promise<string>((resolve) => this.small.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : this.small.toDataURL("image/png")), "image/png"));
  }

  /**
   * Points the camera so the object's bounding box, as seen from the game's angle, fills `fill` of
   * the picture and sits in its middle: a few rounds of measuring the projected corners, re-centring
   * and moving closer or further.
   */
  private frame(fill: number) {
    const { cam, box, c, corners, right, up } = this;
    const { min, max } = box;
    for (let i = 0; i < 8; i++) corners[i].set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z);
    box.getCenter(c);
    let dist = Math.max(0.1, box.getSize(this.v).length() * 2);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    for (let round = 0; round < 5; round++) {
      cam.position.copy(c).addScaledVector(Studio.DIR, dist);
      cam.lookAt(c);
      cam.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of corners) {
        this.v.copy(p).project(cam);
        x0 = Math.min(x0, this.v.x);
        x1 = Math.max(x1, this.v.x);
        y0 = Math.min(y0, this.v.y);
        y1 = Math.max(y1, this.v.y);
      }
      const half = tanHalf * dist;
      right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      c.addScaledVector(right, ((x0 + x1) / 2) * half).addScaledVector(up, ((y0 + y1) / 2) * half);
      dist *= Math.max(x1 - x0, y1 - y0) / 2 / fill;
    }
    cam.position.copy(c).addScaledVector(Studio.DIR, dist);
    cam.lookAt(c);
  }

  dispose() {
    this.rt.dispose();
  }
}

// --- Engine ----------------------------------------------------------------------------------------------

export class KingdomEngine {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.5, 260);
  private readonly sun = new THREE.DirectionalLight("#fff4e0", 2.4);
  private readonly timer = new THREE.Timer();
  private readonly overlay: Overlay;
  private readonly sparks = new Particles(2500, true);
  private readonly dust = new Particles(2500, false);
  private bank: Bank | null = null;
  private units: UnitFactory | null = null;
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private readonly owned: { dispose(): void }[] = [];
  private mode: Mode = "loading";
  save: V.Save;

  // Scene groups
  private readonly villageGroup = new THREE.Group();
  private readonly battleGroup = new THREE.Group();
  private readonly unitGroup = new THREE.Group();
  private readonly fxGroup = new THREE.Group();
  private ground: { group: THREE.Group; dispose(): void } | null = null;
  private walls: WallLayer | null = null;
  private battleWalls: WallLayer | null = null;

  // Village state
  private readonly views = new Map<number, BView>();
  private readonly obstacles = new Map<number, OView>();
  private campUnits: CampUnit[] = [];
  private workers: Worker[] = [];
  private heroes = new Map<HeroKind, HeroFigure>();
  private iconCache: Record<string, string> = {};
  private iconJob: Promise<void> = Promise.resolve();
  private readonly portraitCache = new Map<string, string>();
  private pendingWalkers = 0;
  private selectedId: number | null = null;
  private placing: { kind: BKind; x: number; z: number; view: BView; valid: boolean; last?: { x: number; z: number }; trayId?: number } | null = null;
  /** Layout editor: where everything stood when it opened, and the buildings taken off the map. */
  private editing: { orig: Map<number, { x: number; z: number }>; tray: number[] } | null = null;
  /** The way the current run of walls is heading. */
  private wallDir = { dx: 1, dz: 0 };
  private moving: { id: number; x: number; z: number; ox: number; oz: number; valid: boolean } | null = null;
  private footprint: THREE.Mesh | null = null;
  private selectRing: THREE.Group | null = null;
  private rangeRing: ReturnType<typeof groundRing> | null = null;
  private gridLines: THREE.LineSegments | null = null;
  private tickT = 0;
  private hudT = 0;
  private saveT = 0;
  private dirty = false;
  private rev = 0;
  /** UI panels open: raids wait. */
  private busyUi = false;

  // Battle state
  private sim: Sim | null = null;
  private battleViews: BView[] = [];
  private unitViews = new Map<number, UnitView>();
  private projViews = new Map<number, { obj: THREE.Object3D; kind: string }>();
  private readonly projPool = new Map<string, THREE.Object3D[]>();
  private zoneViews = new Map<number, { ring: ReturnType<typeof groundRing>; zone: Zone }>();
  private bolts: { line: THREE.Line; t: number; short?: boolean }[] = [];
  private boltMat: THREE.LineBasicMaterial | null = null;
  /** Hidden Tesla arcs: a white-hot core and a blue halo. */
  private zapMats: [THREE.LineBasicMaterial, THREE.LineBasicMaterial] | null = null;
  /** The rival village of an online battle (null in the campaign and on defence). */
  private online: OnlineBase | null = null;
  private deployZone: THREE.Mesh | null = null;
  private deployFlash = 0;
  private battleStage = 0;
  private battleName = "";
  private battleSpeed = 1;
  private slot: string | null = null;
  private simAcc = 0;
  private ending = 0;
  private lootAcc = new Map<number, { g: number; e: number; t: number }>();
  private defencePlan: { used: Partial<Record<TroopKind, number>> } | null = null;
  private lastBattleHud = "";
  private battleHudT = 0;
  private campTick = 0;
  private shadowTick = 0;
  private paused = false;
  private wallsDirty = false;

  // Camera
  private readonly target = new THREE.Vector3();
  private dist = 34;
  private readonly curTarget = new THREE.Vector3();
  private curDist = 34;
  private readonly keys = new Set<string>();
  private viewW = 1;
  private viewH = 1;
  /** A new view size or pixel ratio waits for the next frame: see resize(). */
  private resizePending = false;
  private shake = 0;

  // Input
  private readonly pointers = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean; t: number }>();
  private pinch: { dist: number } | null = null;
  private drag: "pan" | "move" | "place" | "deploy" | null = null;
  private deployT = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  /**
   * Resolution (pixel ratio) scaling: starts at `start`, climbs toward `ceiling` while frames are
   * smooth and steps down as soon as they aren't. A sharpness that proved too slow is retried only
   * after `patience` smooth windows (doubling every time it fails) — no endless up/down hitching.
   */
  private readonly perf = { t: 0, frames: 0, min: 1, max: 2, ratio: 2, ceiling: 2, good: 0, patience: 15, slowFps: 45 };
  private quality: Quality = "auto";
  private readonly coarse: boolean;
  /** Last rendered frame (ms): 120 Hz screens render every other frame. */
  private lastFrame = -1e9;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    overlayEl: HTMLElement,
    private readonly events: Events,
    private readonly store: SaveStore,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.coarse = coarse;
    // Very dense phone screens render at their full resolution, where MSAA costs a lot and shows little.
    const dense = coarse && (window.devicePixelRatio || 1) >= 2.6;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !dense, powerPreference: "high-performance" });
    this.applyQuality();
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.overlay = new Overlay(overlayEl, this.camera);
    this.save = V.sanitize(store.get()) ?? V.newVillage();
    this.setupScene(coarse);
    this.resizeObserver = new ResizeObserver(() => (this.resizePending = true));
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pagehide", this.flushSave);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ---------------------------------------------------------------------------------------------

  private setupScene(coarse: boolean) {
    const { scene } = this;
    scene.background = SKY_HORIZON.clone();
    scene.fog = new THREE.Fog(SKY_HORIZON, 70, 150);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(200, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y * 1.5 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.7)), 1.0); }",
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.camera.add(sky);
    scene.add(this.camera);
    this.owned.push(sky.geometry, sky.material as THREE.Material);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.35;
    scene.add(new THREE.HemisphereLight("#fffaf0", "#6b8f4e", 1.15));
    const { sun } = this;
    sun.position.set(-16, 30, 12);
    sun.castShadow = true;
    const size = this.quality === "smooth" ? 1024 : coarse ? 2048 : 4096;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 1, far: 90 });
    scene.add(sun, sun.target);
    this.ground = makeGround(N);
    scene.add(this.ground.group, this.villageGroup, this.battleGroup, this.unitGroup, this.fxGroup, this.sparks.points, this.dust.points);
    this.boltMat = new THREE.LineBasicMaterial({ color: "#e0f2fe", transparent: true, opacity: 1 });
    this.owned.push(this.boltMat);
    this.zapMats = [new THREE.LineBasicMaterial({ color: "#f0f9ff", transparent: true, opacity: 1 }), new THREE.LineBasicMaterial({ color: "#60a5fa", transparent: true, opacity: 0.85 })];
    this.owned.push(...this.zapMats);

    // Grid lines for moving / placing.
    const pts: number[] = [];
    for (let i = 0; i <= GRID; i++) {
      pts.push(i - GRID / 2, 0.03, -GRID / 2, i - GRID / 2, 0.03, GRID / 2);
      pts.push(-GRID / 2, 0.03, i - GRID / 2, GRID / 2, 0.03, i - GRID / 2);
    }
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const gMat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.22, depthWrite: false });
    this.gridLines = new THREE.LineSegments(gGeo, gMat);
    this.gridLines.visible = false;
    scene.add(this.gridLines);
    this.owned.push(gGeo, gMat);

    const fpMat = new THREE.MeshBasicMaterial({ color: "#22c55e", transparent: true, opacity: 0.45, depthWrite: false });
    this.footprint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fpMat);
    this.footprint.rotation.x = -Math.PI / 2;
    this.footprint.position.y = 0.04;
    this.footprint.renderOrder = 2;
    this.footprint.visible = false;
    scene.add(this.footprint);
    this.owned.push(this.footprint.geometry, fpMat);
  }

  async load(sizes: Record<string, number>) {
    try {
      const first = MODELS.filter((k) => !LATE.some((n) => K[n] === k));
      const models = await loadModels(first, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const required = [K.towerBase, K.cannon, K.warrior, K.wall];
      if (!required.every((k) => models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");
      this.bank = new Bank(models);
      this.units = new UnitFactory(this.bank);
      this.walls = new WallLayer(this.bank);
      this.villageGroup.add(this.walls.group);
      this.battleWalls = new WallLayer(this.bank);
      this.battleGroup.add(this.battleWalls.group);
      this.scene.add(makeForest(this.bank, N / 2 + 1.5));
      const sel = this.bank.group([{ m: "selection", s: 1 }], "sel", { cast: false, receive: false });
      this.selectRing = sel;
      sel.visible = false;
      this.scene.add(sel);
      this.offline();
      this.buildVillage();
      this.focusVillage(true);
      soundtrack.play("village");
      // The battle song loads in the background, so an attack switches to it at once.
      setTimeout(() => !this.disposed && soundtrack.preload("battle"), 8000);
      this.setMode("village");
      this.emitHud();
      setTimeout(() => !this.disposed && this.refreshIcons(), 50);
      // Raiders load in the background.
      void loadModels(
        LATE.map((n) => K[n]),
        this.renderer,
        () => {},
        { sizes },
      ).then((late) => {
        if (this.disposed || !this.bank) return;
        const bank = this.bank;
        for (const [k, m] of late) {
          if (bank.models.has(k)) continue;
          bank.models.set(k, m);
          m.scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.metalness = 0;
              mat.roughness = 0.85;
            }
          });
        }
        // Heroes can now stand at their altars, Knights at the camps, and all of them get portraits.
        this.syncHeroes();
        if (this.mode === "village") this.syncCamp(true);
        this.refreshIcons();
      });
    } catch (err) {
      console.error(err);
      this.setMode("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private setMode(m: Mode) {
    this.mode = m;
    this.events.mode(m);
  }

  // --- Save -----------------------------------------------------------------------------------------------

  private persist(now = false) {
    this.dirty = true;
    this.rev++;
    if (now) this.flushSave();
  }

  private flushSave = () => {
    if (!this.dirty || this.editing) return;
    this.dirty = false;
    this.store.set(this.save);
  };

  /** Catch up on everything that happened while the game was closed. */
  private offline() {
    const ev = V.tick(this.save, Date.now());
    if (ev.built.length) this.events.toast(`${ev.built.length} construction${ev.built.length > 1 ? "s" : ""} finished while you were away`, "good");
    this.persist();
    this.drainAwards();
  }

  private drainAwards() {
    while (V.pendingAwards.length) {
      const id = V.pendingAwards.shift()!;
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) {
        this.events.toast(`Achievement: ${a.name} · +${a.gems} gems`, "good");
        this.sfx.gems();
      }
    }
  }

  // --- Village view ---------------------------------------------------------------------------------------

  private buildVillage() {
    for (const v of this.views.values()) this.disposeView(v);
    this.views.clear();
    for (const o of this.obstacles.values()) o.root.removeFromParent();
    this.obstacles.clear();
    for (const b of this.save.buildings) this.addView(b);
    for (const o of this.save.obstacles) this.addObstacle(o);
    this.rebuildWalls();
    this.syncCamp(true);
    this.syncWorkers();
    this.syncHeroes();
  }

  private makeView(id: number, kind: BKind, level: number, x: number, z: number, parent: THREE.Object3D): BView {
    const size = BUILDINGS[kind].size;
    const root = new THREE.Group();
    footprintCenter(x, z, size, root.position);
    parent.add(root);
    const v: BView = { id, kind, level, x, z, size, root, mesh: null, scaffold: null, rubble: null, sb: null, collapse: -1, flash: 0, spinT: Math.random() * 10, hidden: false, rise: -1 };
    this.setViewLevel(v, level, false);
    return v;
  }

  private setViewLevel(v: BView, level: number, building: boolean) {
    const bank = this.bank!;
    if (v.mesh) {
      v.mesh.root.removeFromParent();
      v.mesh = null;
    }
    v.level = level;
    if (v.kind !== "wall" && level >= 1) {
      v.mesh = buildingMesh(bank, v.kind, level);
      v.root.add(v.mesh.root);
    }
    if (building && !v.scaffold) {
      v.scaffold = scaffold(bank, v.size);
      v.root.add(v.scaffold);
    } else if (!building && v.scaffold) {
      v.scaffold.removeFromParent();
      v.scaffold = null;
    }
    if (v.scaffold && v.mesh) v.scaffold.scale.set(1, 0.75, 1);
    else if (v.scaffold) v.scaffold.scale.set(1, 1, 1);
  }

  private addView(b: V.SBuilding) {
    const v = this.makeView(b.id, b.kind, b.level, b.x, b.z, this.villageGroup);
    if (b.until) this.setViewLevel(v, b.level, true);
    this.views.set(b.id, v);
    return v;
  }

  private disposeView(v: BView) {
    v.root.removeFromParent();
  }

  private addObstacle(o: V.SObstacle) {
    if (!this.bank) return;
    const root = obstacleMesh(this.bank, o.model);
    footprintCenter(o.x, o.z, o.size, root.position);
    root.rotation.y = ((o.id * 1.7) % 4) * (Math.PI / 2);
    this.villageGroup.add(root);
    this.obstacles.set(o.id, { id: o.id, root });
  }

  private rebuildWalls() {
    const tray = this.editing?.tray ?? [];
    const list: WallInfo[] = this.save.buildings.filter((b) => b.kind === "wall" && b.id !== this.moving?.id && !tray.includes(b.id)).map((b) => ({ id: b.id, x: b.x, z: b.z, level: b.level }));
    if (this.moving) {
      const b = this.save.buildings.find((x) => x.id === this.moving!.id);
      if (b?.kind === "wall") list.push({ id: b.id, x: this.moving.x, z: this.moving.z, level: b.level });
    }
    if (this.placing?.kind === "wall") {
      const b = this.placing.trayId !== undefined ? this.building(this.placing.trayId) : null;
      list.push({ id: -1, x: this.placing.x, z: this.placing.z, level: b?.level ?? 1 });
    }
    this.walls?.rebuild(list, { x: -GRID / 2, z: -GRID / 2 });
  }

  private building(id: number) {
    return this.save.buildings.find((b) => b.id === id);
  }

  // --- Camp troops & builders -----------------------------------------------------------------------------

  /** Spots in every army camp: rings around the fire (inner first), clear of tents and flags. */
  private campLayout() {
    return V.builtOf(this.save, "camp").map((c) => {
      const center = footprintCenter(c.x, c.z, 4);
      const tents: [number, number, number][] = (
        [
          [-1.35, -1.35, 0.62],
          [1.4, -1.35, 0.62],
          [-1.35, 1.4, 0.62],
          [1.4, 1.4, 0.62],
        ] as [number, number, number][]
      ).slice(0, Math.min(4, c.level));
      const props: [number, number, number][] = [...tents];
      if (c.level >= 3) props.push([1.75, 0.1, 0.45]);
      if (c.level >= 4) props.push([-1.75, 0.1, 0.45]);
      if (c.level >= 5) props.push([0.1, 1.75, 0.45], [0.1, -1.75, 0.45]);
      const slots: THREE.Vector3[] = [];
      for (const r of [1.05, 1.5, 1.92]) {
        const n = Math.floor((Math.PI * 2 * r) / 0.52);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + r;
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          if (props.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr)) continue;
          slots.push(new THREE.Vector3(center.x + x, FOUNDATION_H, center.z + z));
        }
      }
      return { center, slots, room: BUILDINGS.camp.housing![c.level - 1] };
    });
  }

  /** Makes the figures at the camps match the army (new troops walk over from the barracks). */
  private syncCamp(instant = false) {
    if (!this.units || this.editing) return;
    const camps = this.campLayout();
    const want: TroopKind[] = [];
    for (const k of TROOP_ORDER) for (let i = 0; i < (this.save.army[k] ?? 0); i++) want.push(k);
    want.length = Math.min(want.length, Math.min(90, camps.reduce((n, c) => n + c.slots.length, 0)));
    // Remove figures that are no longer in the army.
    const counts = new Map<TroopKind, number>();
    for (const k of want) counts.set(k, (counts.get(k) ?? 0) + 1);
    const keep: CampUnit[] = [];
    for (const c of this.campUnits) {
      const n = counts.get(c.kind) ?? 0;
      if (n > 0 && c.u.level === this.save.troopLv[c.kind]) {
        counts.set(c.kind, n - 1);
        keep.push(c);
      } else this.units.release(c.u);
    }
    this.campUnits = keep;
    const barracks = V.builtOf(this.save, "barracks")[0];
    for (const [kind, n] of counts) {
      for (let i = 0; i < n; i++) {
        const u = this.units.get(kind, this.save.troopLv[kind], this.villageGroup);
        if (!u) continue;
        const walk = !instant && this.pendingWalkers > 0 && !!barracks;
        if (walk) {
          this.pendingWalkers--;
          footprintCenter(barracks.x, barracks.z, 3, u.root.position);
          u.root.position.x += 1.6;
          u.root.position.z += 1.6;
        }
        this.campUnits.push({ kind, u, slot: new THREE.Vector3(), walk, wait: Math.random() * 3, emote: 3 + Math.random() * 8, acc: 0 });
      }
    }
    this.pendingWalkers = 0;
    if (!camps.length) return;
    // Like in Clash of Clans every camp holds its own share: each troop goes to the camp with the most
    // room left. Same kinds stand together; big troops take the outer ring.
    const used = camps.map(() => 0);
    const inner = camps.map(() => 0);
    const outer = camps.map((c) => c.slots.length - 1);
    const order = [...this.campUnits].sort((a, b) => TROOPS[b.kind].housing - TROOPS[a.kind].housing || TROOP_ORDER.indexOf(a.kind) - TROOP_ORDER.indexOf(b.kind));
    for (const c of order) {
      const h = TROOPS[c.kind].housing;
      let best = 0;
      for (let i = 1; i < camps.length; i++) if (camps[i].room - used[i] > camps[best].room - used[best]) best = i;
      used[best] += h;
      const cp = camps[best];
      const free = inner[best] <= outer[best];
      const slot = !free ? null : h >= 4 ? cp.slots[outer[best]--] : cp.slots[inner[best]++];
      c.slot.copy(slot ?? cp.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)));
      if (instant) {
        c.walk = false;
        c.u.root.position.copy(c.slot);
      } else if (c.u.root.position.distanceTo(c.slot) > 0.15) c.walk = true;
    }
  }

  private updateCamp(dt: number) {
    // A camp full of resting troops is a lot of skinned characters: those standing still animate
    // every other frame (half of them each frame), walkers every frame.
    this.campTick ^= 1;
    let i = 0;
    for (const c of this.campUnits) {
      const u = c.u;
      if (c.walk) {
        const d = this.v1.copy(c.slot).sub(u.root.position);
        d.y = 0;
        const len = d.length();
        if (len < 0.08) {
          c.walk = false;
          u.play("idle");
        } else {
          const step = Math.min(len, 1.7 * dt);
          u.root.position.addScaledVector(d, step / len);
          u.root.position.y = this.onCampSlab(u.root.position) ? FOUNDATION_H : 0;
          u.root.rotation.y = Math.atan2(d.x, d.z);
          u.play(u.look.run === "sprint" ? "walk" : "walk");
        }
      } else {
        // Face the campfire, emote now and then.
        const camp = this.nearestCamp(u.root.position);
        if (camp) u.root.rotation.y = Math.atan2(camp.x - u.root.position.x, camp.z - u.root.position.z);
        c.emote -= dt;
        if (c.emote <= 0) {
          c.emote = 7 + Math.random() * 10;
          c.wait = 1.6;
          u.play(Math.random() < 0.5 ? "emote-yes" : "interact-right", { once: true });
        } else if (c.wait > 0) {
          c.wait -= dt;
          if (c.wait <= 0) u.play("idle");
        } else if (u.clip !== "idle") u.play("idle");
      }
      c.acc += dt;
      if (c.walk || (i++ & 1) === this.campTick) {
        u.update(c.acc);
        c.acc = 0;
      }
    }
  }

  /** Is this spot on an army camp's foundation? */
  private onCampSlab(p: THREE.Vector3) {
    for (const c of V.builtOf(this.save, "camp")) {
      const center = footprintCenter(c.x, c.z, 4, this.v2);
      if (Math.abs(p.x - center.x) < 1.96 && Math.abs(p.z - center.z) < 1.96) return true;
    }
    return false;
  }

  private nearestCamp(p: THREE.Vector3) {
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const c of V.builtOf(this.save, "camp")) {
      const center = footprintCenter(c.x, c.z, 4, new THREE.Vector3());
      const d = center.distanceToSquared(p);
      if (d < bd) {
        bd = d;
        best = center;
      }
    }
    return best;
  }

  private syncWorkers() {
    if (!this.units || this.editing) return;
    const sites: { id: number; pos: THREE.Vector3 }[] = [];
    for (const b of this.save.buildings) {
      if (!b.until) continue;
      const n = BUILDINGS[b.kind].size;
      sites.push({ id: b.id, pos: tileToWorld(b.x + n + 0.1, b.z + n + 0.1) });
    }
    for (const o of this.save.obstacles) if (o.until) sites.push({ id: o.id, pos: tileToWorld(o.x + o.size + 0.1, o.z + o.size + 0.1) });
    const keep: Worker[] = [];
    for (const w of this.workers) {
      if (sites.some((s) => s.id === w.id)) keep.push(w);
      else this.units.release(w.u);
    }
    this.workers = keep;
    for (const s of sites) {
      if (this.workers.some((w) => w.id === s.id)) continue;
      const u = this.units.get("builder", 1, this.villageGroup);
      if (!u) continue;
      u.root.position.copy(s.pos);
      u.root.rotation.y = -Math.PI * 0.75;
      u.play("attack-melee-right", { speed: 0.9 });
      this.workers.push({ id: s.id, u, site: s.pos });
    }
  }

  private updateWorkers(dt: number) {
    for (const w of this.workers) {
      w.u.update(dt);
      if (w.u.clip !== "attack-melee-right") w.u.play("attack-melee-right", { speed: 0.9 });
    }
    if (this.workers.length && Math.random() < dt * 2.2 * Math.min(1, this.workers.length)) {
      const w = this.workers[Math.floor(Math.random() * this.workers.length)];
      if (this.onScreen(w.site)) this.sfx.hammer();
      this.dust.burst(2, w.site.x - 0.4, 0.2, w.site.z - 0.4, { color: 0xd6c3a0, size: 0.18, life: 0.6, speed: 0.6, up: 0.6, gravity: 1 });
    }
  }

  // --- Heroes at their altars ------------------------------------------------------------------------------

  /** One figure per built altar: awake (pacing on the altar) or asleep while hurt or training. */
  private syncHeroes() {
    if (!this.units || this.editing) return;
    for (const k of HERO_ORDER) {
      const st = V.heroState(this.save, k);
      const fig = this.heroes.get(k);
      const altar = st.altar;
      if (!altar || st.level < 1 || !this.units.has(k) || this.mode !== "village") {
        if (fig) {
          this.units.release(fig.u);
          this.heroes.delete(k);
        }
        continue;
      }
      const spot = altarSpot(Math.max(1, st.level));
      const home = footprintCenter(altar.x, altar.z, 3).add(new THREE.Vector3(spot.x, spot.y, spot.z));
      if (fig && fig.level === st.level) {
        if (!fig.home.equals(home)) {
          fig.home.copy(home);
          fig.goal.copy(home);
          fig.u.root.position.copy(home);
        }
        continue;
      }
      if (fig) this.units.release(fig.u);
      const u = this.units.get(k, st.level, this.villageGroup);
      if (!u) continue;
      u.root.position.copy(home);
      u.root.rotation.y = Math.PI / 4;
      u.play("idle");
      this.heroes.set(k, { kind: k, u, level: st.level, home, goal: home.clone(), wait: 2, sleeping: false });
    }
  }

  private updateHeroes(dt: number) {
    for (const fig of this.heroes.values()) {
      const st = V.heroState(this.save, fig.kind);
      const u = fig.u;
      const asleep = st.sleeping || st.upgrading;
      if (asleep !== fig.sleeping) {
        fig.sleeping = asleep;
        fig.goal.copy(fig.home);
        u.root.position.copy(fig.home);
        u.root.rotation.y = Math.PI / 4;
        u.play(asleep ? "sleep" : "idle", { fade: 0.3 });
      }
      if (!asleep) {
        const d = this.v1.copy(fig.goal).sub(u.root.position);
        d.y = 0;
        const len = d.length();
        if (len > 0.05) {
          const step = Math.min(len, 0.9 * dt);
          u.root.position.addScaledVector(d, step / len);
          u.root.rotation.y = Math.atan2(d.x, d.z);
          if (u.clip !== "walk") u.play("walk", { speed: 0.8 });
        } else {
          if (u.clip === "walk") u.play("idle");
          fig.wait -= dt;
          if (fig.wait <= 0) {
            // Pace around the altar now and then; cheer sometimes.
            fig.wait = 3 + Math.random() * 5;
            if (Math.random() < 0.3) {
              u.root.rotation.y = Math.PI / 4;
              u.play("emote-yes", { once: true });
              fig.wait = 2.5;
            } else {
              // A few steps around the dais.
              const a = Math.random() * Math.PI * 2;
              fig.goal.set(fig.home.x + Math.cos(a) * 0.35, fig.home.y, fig.home.z + Math.sin(a) * 0.35);
            }
          } else if (u.clip !== "idle" && u.clip !== "emote-yes") u.play("idle");
        }
      }
      u.update(dt);
    }
  }

  private onScreen(p: THREE.Vector3) {
    this.v2.copy(p).project(this.camera);
    return Math.abs(this.v2.x) < 1.1 && Math.abs(this.v2.y) < 1.1;
  }

  // --- Village: per-frame ------------------------------------------------------------------------------------

  private updateVillage(dt: number) {
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT = 0.25;
      const ev = V.tick(this.save, Date.now());
      for (const b of ev.built) {
        const v = this.views.get(b.id);
        if (v) this.setViewLevel(v, b.level, false);
        const p = footprintCenter(b.x, b.z, BUILDINGS[b.kind].size);
        this.sparks.burst(40, p.x, 1.4, p.z, { color: 0xfde68a, size: 0.16, life: 1, speed: 3, up: 3, gravity: 4, drag: 1.2 });
        this.overlay.float(`${BUILDINGS[b.kind].name} ${b.level === 1 ? "built" : `level ${b.level}`}!`, p.clone().setY(2.5), "#fef3c7", { size: 20, life: 1.8 });
        this.sfx.fanfare();
        if (b.kind === "wall") this.rebuildWalls();
        if (b.kind === "camp" || b.kind === "townhall") this.syncCamp(true);
        if (BUILDINGS[b.kind].hero) this.syncHeroes();
      }
      if (ev.trained.length) {
        this.pendingWalkers += ev.trained.length;
        this.sfx.trained();
      }
      if (ev.trained.length || ev.researched.length) this.syncCamp();
      for (const k of ev.brewed) this.events.toast(`${SPELLS[k].name} spell ready`, "good");
      for (const k of ev.researched) {
        const name = k in TROOPS ? TROOPS[k as TroopKind].name : SPELLS[k as SpellKind].name;
        this.events.toast(`Research complete: ${name} level ${k in TROOPS ? this.save.troopLv[k as TroopKind] : this.save.spellLv[k as SpellKind]}`, "good");
        this.sfx.fanfare();
      }
      for (const o of ev.cleared) {
        const view = this.obstacles.get(o.id);
        if (view) view.root.removeFromParent();
        this.obstacles.delete(o.id);
        const p = footprintCenter(o.x, o.z, o.size);
        this.dust.burst(20, p.x, 0.4, p.z, { color: 0xa3a37a, size: 0.4, life: 1, speed: 1.6, up: 1, gravity: 1, grow: 2 });
        if (o.gems) {
          this.overlay.float(`+${o.gems}`, p.clone().setY(1.5), RES_COLOR.gems, { icon: RES_ICON.gems, size: 22, life: 1.6 });
          this.sfx.gems();
        }
        if (this.selectedId === o.id) this.select(null);
      }
      // New obstacles.
      for (const o of this.save.obstacles) if (!this.obstacles.has(o.id)) this.addObstacle(o);
      if (ev.built.length || ev.cleared.length) this.syncWorkers();
      if (ev.built.length || ev.trained.length || ev.brewed.length || ev.researched.length || ev.cleared.length) this.persist();
      this.drainAwards();
      // Raiders come every few minutes (after the first raid of your own).
      if (this.save.stats.raids > 0 && !this.busyUi && !this.placing && !this.moving && !this.editing) {
        this.save.raidIn -= 0.25;
        if (this.save.raidIn <= 0) this.startDefence();
      }
      this.updateLabels();
    }
    // Spinning parts, selection bounce.
    for (const v of this.views.values()) {
      if (v.mesh?.spin) {
        v.spinT += dt;
        if (v.mesh.spinSpeed) v.mesh.spin.rotation.x = v.spinT * v.mesh.spinSpeed;
        else {
          v.mesh.spin.rotation.y = v.spinT * 0.8;
          v.mesh.spin.position.y = Math.sin(v.spinT * 2) * 0.08;
        }
      }
      if (v.mesh?.turret && v.kind !== "catapult") v.mesh.turret.rotation.y += dt * 0.15 * Math.sin(v.spinT * 0.3 + v.id);
      if (v.flash > 0) {
        v.flash = Math.max(0, v.flash - dt * 3);
        const s = 1 + Math.sin(v.flash * Math.PI) * 0.06;
        v.root.scale.set(s, 1 + Math.sin(v.flash * Math.PI) * 0.1, s);
      }
    }
    this.updateCamp(dt);
    this.updateWorkers(dt);
    this.updateHeroes(dt);
    if (this.selectRing?.visible) {
      const t = performance.now() / 1000;
      this.selectRing.position.y = 0.05 + Math.abs(Math.sin(t * 3)) * 0.06;
    }
  }

  /** Collect bubbles and construction timers over buildings. */
  private updateLabels() {
    const now = Date.now();
    this.overlay.mark("v:");
    if (this.editing) {
      this.overlay.sweep("v:");
      return;
    }
    for (const b of this.save.buildings) {
      const def = BUILDINGS[b.kind];
      const v = this.views.get(b.id);
      const top = (v?.mesh?.height ?? 1.5) + 0.4;
      const pos = footprintCenter(b.x, b.z, def.size).setY(Math.min(top, 4));
      if (b.until && b.dur) {
        const left = (b.until - now) / 1000;
        const el = this.overlay.label(`v:t:${b.id}`, pos, (e) => {
          e.className = "pointer-events-none";
          e.innerHTML = `<div class="g-hud" style="padding:3px 8px 5px;min-width:86px;text-align:center"><div class="g-display" style="font-size:13px;line-height:1.1" data-t></div><div style="height:6px;border-radius:4px;background:#0006;margin-top:3px;overflow:hidden"><div data-bar style="height:100%;background:linear-gradient(90deg,#86efac,#16a34a)"></div></div></div>`;
        });
        (el.querySelector("[data-t]") as HTMLElement).textContent = formatTime(left);
        (el.querySelector("[data-bar]") as HTMLElement).style.width = `${Math.round((1 - left / b.dur) * 100)}%`;
      } else if (def.produces && b.level > 0) {
        const stored = b.stored ?? 0;
        const hold = def.hold![b.level - 1];
        if (stored >= Math.max(5, hold * 0.04)) {
          const res = def.produces;
          const full = stored >= hold - 0.5;
          const el = this.overlay.label(`v:c:${b.id}`, pos, (e) => {
            e.className = "pointer-events-auto";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.setAttribute("aria-label", `Collect ${res}`);
            btn.className = "kc-bubble";
            btn.style.cssText = "display:grid;place-items:center;width:40px;height:40px;border-radius:999px;background:radial-gradient(circle at 40% 30%,#fffdf5,#f6eedb 60%,#d6c3a0);border:3px solid #1f2937;box-shadow:0 4px 0 #1f2937;cursor:pointer;animation:kc-bob 1.4s ease-in-out infinite";
            btn.innerHTML = RES_ICON[res].replace("16px;height:16px", "20px;height:20px").replace("14px;height:17px", "17px;height:21px");
            btn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
            btn.addEventListener("click", (ev) => {
              ev.stopPropagation();
              audio.unlock();
              this.collectBuilding(b.id);
            });
            e.appendChild(btn);
          });
          el.style.filter = full ? "drop-shadow(0 0 8px #fde047)" : "";
        }
      }
    }
    // Barracks: what's training and how long the queue takes.
    const barracks = V.builtOf(this.save, "barracks").find((b) => !b.until);
    if (barracks && this.save.queue.length) {
      const pos = footprintCenter(barracks.x, barracks.z, 3).setY(Math.min((this.views.get(barracks.id)?.mesh?.height ?? 2) + 0.6, 4.2));
      const kind = this.save.queue[0];
      const el = this.overlay.label(`v:q:${barracks.id}`, pos, (e) => {
        e.className = "pointer-events-none";
        e.innerHTML = `<div class="g-hud" style="display:flex;align-items:center;gap:4px;padding:2px 8px 2px 2px"><img data-i alt="" style="width:26px;height:26px"/><span class="g-display" style="font-size:13px" data-t></span></div>`;
      });
      const img = el.querySelector("[data-i]") as HTMLImageElement;
      const src = this.iconCache[`t:${kind}`] ?? "";
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      (el.querySelector("[data-t]") as HTMLElement).textContent = `×${this.save.queue.length} · ${formatTime(this.trainLeft())}`;
    }
    // Spell Factory: the spell brewing and how long the queue takes.
    const factory = V.builtOf(this.save, "spellfactory").find((b) => !b.until);
    if (factory && this.save.brew.length) {
      const pos = footprintCenter(factory.x, factory.z, 3).setY(Math.min((this.views.get(factory.id)?.mesh?.height ?? 2) + 0.6, 4.2));
      const kind = this.save.brew[0];
      const el = this.overlay.label(`v:s:${factory.id}`, pos, (e) => {
        e.className = "pointer-events-none";
        e.innerHTML = `<div class="g-hud" style="display:flex;align-items:center;gap:5px;padding:2px 8px 2px 3px"><span data-o style="width:22px;height:22px;border-radius:999px;box-shadow:0 0 0 2px #1f2937"></span><span class="g-display" style="font-size:13px" data-t></span></div>`;
      });
      const c = SPELLS[kind].color;
      (el.querySelector("[data-o]") as HTMLElement).style.background = `radial-gradient(circle at 35% 30%,#fff,${c} 45%,#1e1b4b)`;
      (el.querySelector("[data-t]") as HTMLElement).textContent = `×${this.save.brew.length} · ${formatTime(this.brewLeft())}`;
    }
    // Sleeping heroes: Zzz and the time until they're fit again.
    for (const fig of this.heroes.values()) {
      const st = V.heroState(this.save, fig.kind);
      if (!st.sleeping || st.upgrading) continue;
      const el = this.overlay.label(`v:z:${fig.kind}`, fig.home.clone().setY(1.6), (e) => {
        e.className = "pointer-events-none";
        e.innerHTML = `<div class="g-hud g-display" style="padding:2px 8px;font-size:12px;white-space:nowrap">Zzz <span data-t></span></div>`;
      });
      (el.querySelector("[data-t]") as HTMLElement).textContent = formatTime(st.left);
    }
    for (const o of this.save.obstacles) {
      if (!o.until || !o.dur) continue;
      const left = (o.until - now) / 1000;
      const pos = footprintCenter(o.x, o.z, o.size).setY(2);
      const el = this.overlay.label(`v:t:o${o.id}`, pos, (e) => {
        e.className = "pointer-events-none";
        e.innerHTML = `<div class="g-hud" style="padding:3px 8px 5px;min-width:70px;text-align:center"><div class="g-display" style="font-size:13px;line-height:1.1" data-t></div><div style="height:6px;border-radius:4px;background:#0006;margin-top:3px;overflow:hidden"><div data-bar style="height:100%;background:linear-gradient(90deg,#fde68a,#f59e0b)"></div></div></div>`;
      });
      (el.querySelector("[data-t]") as HTMLElement).textContent = formatTime(left);
      (el.querySelector("[data-bar]") as HTMLElement).style.width = `${Math.round((1 - left / o.dur) * 100)}%`;
    }
    this.overlay.sweep("v:");
  }

  private collectBuilding(id: number) {
    const b = this.building(id);
    if (!b) return;
    const def = BUILDINGS[b.kind];
    if (!def.produces) return;
    const res = def.produces;
    const amount = V.collect(this.save, b);
    const p = footprintCenter(b.x, b.z, def.size).setY(2.2);
    if (amount > 0) {
      this.overlay.float(`+${shortNumber(amount)}`, p, RES_COLOR[res], { icon: RES_ICON[res], size: 22 });
      if (res === "gold") this.sfx.coins(amount);
      else this.sfx.elixir();
      this.sparks.burst(16, p.x, 1.6, p.z, { color: res === "gold" ? 0xfde047 : 0xe879f9, size: 0.14, life: 0.7, speed: 2, up: 3, gravity: 6 });
      this.overlay.remove(`v:c:${b.id}`);
      this.persist();
    } else {
      this.events.toast(`${res === "gold" ? "Gold" : "Elixir"} storage is full — upgrade or build storages`, "bad");
      this.sfx.denied();
    }
    this.emitHud();
  }

  collectAll() {
    if (this.mode !== "village") return;
    let any = false;
    for (const b of this.save.buildings) {
      if (BUILDINGS[b.kind].produces && (b.stored ?? 0) >= 1) {
        any = true;
        this.collectBuilding(b.id);
      }
    }
    if (!any) this.events.toast("Nothing to collect yet", "info");
  }

  // --- Selection & info ----------------------------------------------------------------------------------------

  select(id: number | null) {
    if (this.selectedId !== null && id !== this.selectedId) this.sfx.click();
    this.selectedId = id;
    const ring = this.selectRing;
    this.rangeRing?.group.removeFromParent();
    if (!ring) return;
    const b = id !== null ? this.building(id) : null;
    const o = id !== null ? this.save.obstacles.find((x) => x.id === id) : null;
    if (b || o) {
      const size = b ? BUILDINGS[b.kind].size : o!.size;
      footprintCenter(b ? b.x : o!.x, b ? b.z : o!.z, size, ring.position);
      ring.scale.set(size * 1.04, 1, size * 1.04);
      ring.visible = true;
      if (b) {
        const v = this.views.get(b.id);
        if (v) v.flash = 1;
        const atk = BUILDINGS[b.kind].attack;
        if (atk) {
          if (!this.rangeRing) {
            this.rangeRing = groundRing("#ffffff", 0.12);
            this.owned.push(this.rangeRing);
          }
          this.rangeRing.group.position.copy(ring.position);
          const r = atk.range + size / 2 - 0.5;
          this.rangeRing.group.scale.set(r, 1, r);
          this.scene.add(this.rangeRing.group);
        }
      }
    } else ring.visible = false;
    this.emitHud();
  }

  private selectedInfo(): SelectedInfo | null {
    if (this.selectedId === null) return null;
    const now = Date.now();
    const o = this.save.obstacles.find((x) => x.id === this.selectedId);
    if (o) {
      return {
        id: o.id,
        kind: "obstacle",
        name: ["Old Oaks", "Boulders", "Thicket", "Pine", "Stump", "Bush", "Mushrooms", "Rock"][o.model] ?? "Obstacle",
        level: 0,
        maxLevel: 0,
        stats: [{ label: "Reward", value: o.gems ? "Some gems" : "Clear space" }],
        desc: "Clear it away to make room. Obstacles sometimes hide gems.",
        upgrade: o.until ? null : { cost: o.cost, res: o.res, time: 5, can: V.freeBuilders(this.save) > 0 && this.save[o.res] >= o.cost, reason: V.freeBuilders(this.save) > 0 ? undefined : "All builders are busy", label: "Remove" },
        busy: o.until ? { left: (o.until - now) / 1000, total: o.dur ?? 5, gems: gemsToFinish((o.until - now) / 1000), label: "Clearing" } : null,
        collect: null,
        panel: null,
        heal: null,
      };
    }
    const b = this.building(this.selectedId);
    if (!b) return null;
    const def = BUILDINGS[b.kind];
    const th = V.thLevel(this.save);
    const lvl = Math.max(1, b.level);
    const nxt = Math.min(def.maxLevel, lvl + 1);
    const showNext = b.level < def.maxLevel && b.level > 0;
    const stats: Stat[] = [];
    const st = (label: string, cur: number | string, next?: number | string) => stats.push({ label, value: typeof cur === "number" ? shortNumber(cur) : cur, next: showNext && next !== undefined && next !== cur ? (typeof next === "number" ? shortNumber(next) : next) : undefined });
    st("Hitpoints", def.hp[lvl - 1] ?? def.hp[0], def.hp[nxt - 1]);
    if (def.rate) {
      st("Per minute", def.rate[lvl - 1], def.rate[nxt - 1]);
      st("Holds", def.hold![lvl - 1], def.hold![nxt - 1]);
    }
    if (def.capacity) st(b.kind === "townhall" ? "Stores (each)" : "Capacity", def.capacity[lvl - 1], def.capacity[nxt - 1]);
    if (def.attack) {
      st("Damage / s", Math.round((def.attack.damage[lvl - 1] / def.attack.interval) * 10) / 10, Math.round((def.attack.damage[nxt - 1] / def.attack.interval) * 10) / 10);
      st("Range", `${def.attack.minRange ? `${def.attack.minRange}–` : ""}${def.attack.range} tiles`);
      if (def.attack.splash) st("Splash", `${def.attack.splash} tiles`);
      const chain = def.attack.chain;
      if (chain) st("Shock jumps to", chain[lvl - 1] ? `${chain[lvl - 1]} more troop${chain[lvl - 1] > 1 ? "s" : ""}` : "—", chain[nxt - 1] ? `${chain[nxt - 1]} more troop${chain[nxt - 1] > 1 ? "s" : ""}` : "—");
    }
    if (def.hidden) stats.push({ label: "Hidden", value: `Springs up when troops come within ${def.hidden} tiles` });
    if (def.trap) {
      st("Damage", def.trap.damage[lvl - 1], def.trap.damage[nxt - 1]);
      st("Blast radius", `${def.trap.radius} tiles`);
    }
    if (def.housing) st("Housing", def.housing[lvl - 1], def.housing[nxt - 1]);
    if (def.slots) st("Spell slots", def.slots[lvl - 1], def.slots[nxt - 1]);
    if (b.kind === "barracks") {
      const now2 = TROOP_ORDER.filter((k) => TROOPS[k].barracks <= lvl).map((k) => TROOPS[k].name);
      const unlock = TROOP_ORDER.filter((k) => TROOPS[k].barracks === nxt).map((k) => TROOPS[k].name);
      stats.push({ label: "Trains", value: now2.join(", "), next: showNext && unlock.length ? `+ ${unlock.join(", ")}` : undefined });
    }
    if (b.kind === "spellfactory") {
      const unlock = SPELL_ORDER.filter((k) => SPELLS[k].factory === nxt).map((k) => SPELLS[k].name);
      stats.push({ label: "Spells", value: SPELL_ORDER.filter((k) => SPELLS[k].factory <= lvl).map((k) => SPELLS[k].name).join(", "), next: showNext && unlock.length ? `+ ${unlock.join(", ")}` : undefined });
    }
    if (b.kind === "lab") st("Research up to", `level ${lvl}`, `level ${nxt}`);
    let heal: SelectedInfo["heal"] = null;
    if (def.hero) {
      const h = HEROES[def.hero];
      const hs = V.heroState(this.save, def.hero);
      stats.push({ label: "Hero", value: h.name });
      st("Hero hitpoints", Math.round(h.hp * levelMul(lvl)), Math.round(h.hp * levelMul(nxt)));
      st("Hero damage / s", Math.round(((h.damage * levelMul(lvl)) / h.interval) * 10) / 10, Math.round(((h.damage * levelMul(nxt)) / h.interval) * 10) / 10);
      stats.push({ label: "Ability", value: h.ability.name });
      stats.push({ label: "Status", value: b.level < 1 ? "On the way" : hs.upgrading ? "Training" : hs.sleeping ? `Sleeping · ${formatTime(hs.left)}` : "Ready to fight" });
      if (hs.sleeping && !hs.upgrading && b.level > 0) heal = { left: hs.left, gems: gemsToFinish(hs.left) };
    }
    if (b.kind === "builder") stats.push({ label: "Builders", value: `${V.builders(this.save)}` });
    if (b.kind === "townhall") stats.push({ label: "Unlocks", value: th < 5 ? `Town Hall ${th + 1}: more buildings, new types and level ${th + 1}` : "Everything!" });
    if (def.produces) st("Ready", Math.floor(b.stored ?? 0));

    let upgrade: SelectedInfo["upgrade"] = null;
    if (!b.until) {
      const next = V.nextLevel(this.save, b);
      if ("cost" in next && next.cost !== undefined) {
        const res = next.res;
        const enough = res === "gems" ? this.save.gems >= next.cost : this.save[res] >= next.cost;
        const builderOk = next.time === 0 || V.freeBuilders(this.save) > 0;
        upgrade = { cost: next.cost, res, time: next.time, can: enough && builderOk, reason: !builderOk ? "All builders are busy" : !enough ? `Not enough ${res}` : undefined, label: `Upgrade to level ${b.level + 1}` };
      } else if (!next.max) upgrade = { cost: 0, res: "gold", time: 0, can: false, reason: next.reason, label: "Upgrade" };
    }
    const busy = b.until && b.dur ? { left: (b.until - now) / 1000, total: b.dur, gems: gemsToFinish((b.until - now) / 1000), label: b.level === 0 ? "Building" : `Upgrading to level ${b.level + 1}` } : null;
    return {
      id: b.id,
      kind: b.kind,
      name: def.name,
      level: b.level,
      maxLevel: b.kind === "townhall" ? 5 : levelCap(b.kind, 5),
      stats,
      desc: def.desc,
      upgrade,
      busy,
      collect: def.produces && (b.stored ?? 0) >= 1 ? { res: def.produces, amount: Math.floor(b.stored ?? 0) } : null,
      panel: b.kind === "barracks" || b.kind === "camp" ? "army" : b.kind === "lab" ? "lab" : b.kind === "spellfactory" ? "spells" : null,
      heal,
    };
  }

  // --- Village actions ---------------------------------------------------------------------------------------

  private fail(r: V.Fail) {
    this.events.toast(r.reason, "bad");
    this.sfx.denied();
  }

  upgradeSelected() {
    if (this.mode !== "village" || this.selectedId === null) return;
    const now = Date.now();
    const o = this.save.obstacles.find((x) => x.id === this.selectedId);
    if (o) {
      const r = V.startClearing(this.save, o, now);
      if (!r.ok) return this.fail(r);
      this.sfx.place();
      this.syncWorkers();
      this.persist();
      this.emitHud();
      return;
    }
    const b = this.building(this.selectedId);
    if (!b) return;
    const r = V.upgrade(this.save, b, now);
    if (!r.ok) return this.fail(r);
    const v = this.views.get(b.id);
    if (b.until) {
      if (v) this.setViewLevel(v, b.level, true);
      this.sfx.place();
      this.syncWorkers();
    } else {
      // Instant (walls).
      if (v) this.setViewLevel(v, b.level, false);
      if (b.kind === "wall") this.rebuildWalls();
      this.sfx.fanfare();
      const p = footprintCenter(b.x, b.z, 1);
      this.sparks.burst(16, p.x, 0.8, p.z, { color: 0xfde68a, size: 0.12, life: 0.7, speed: 2, up: 2, gravity: 4 });
    }
    this.persist(true);
    this.emitHud();
  }

  /** Upgrades every wall of the selected wall's level that you can afford (walls are instant). */
  upgradeWallRow() {
    const b = this.selectedId !== null ? this.building(this.selectedId) : null;
    if (!b || b.kind !== "wall") return;
    let n = 0;
    for (const w of this.save.buildings) {
      if (w.kind !== "wall" || w.level !== b.level) continue;
      const r = V.upgrade(this.save, w, Date.now());
      if (!r.ok) break;
      n++;
    }
    if (n) {
      this.rebuildWalls();
      this.sfx.fanfare();
      this.events.toast(`${n} wall${n > 1 ? "s" : ""} upgraded`, "good");
      this.persist(true);
    } else this.fail({ ok: false, reason: "Not enough gold" });
    this.emitHud();
  }

  finishSelected() {
    if (this.selectedId === null) return;
    const now = Date.now();
    const b = this.building(this.selectedId);
    const o = this.save.obstacles.find((x) => x.id === this.selectedId);
    const until = b?.until ?? o?.until;
    if (!until) return;
    const gems = gemsToFinish((until - now) / 1000);
    if (this.save.gems < gems) return this.fail({ ok: false, reason: "Not enough gems" });
    this.save.gems -= gems;
    if (b) b.until = now;
    if (o) o.until = now;
    this.tickT = 0;
    this.persist(true);
  }

  /** Wakes the selected altar's hero up, fully healed, for gems. */
  healSelectedHero() {
    const b = this.selectedId !== null ? this.building(this.selectedId) : null;
    const kind = b ? BUILDINGS[b.kind].hero : undefined;
    if (!kind) return;
    const st = V.heroState(this.save, kind);
    if (!st.sleeping) return;
    const gems = gemsToFinish(st.left);
    if (this.save.gems < gems) return this.fail({ ok: false, reason: "Not enough gems" });
    this.save.gems -= gems;
    this.save.heroHp[kind] = 1;
    this.sfx.fanfare();
    this.persist(true);
    this.emitHud();
  }

  finishResearch() {
    const r = this.save.research;
    if (!r) return;
    const gems = gemsToFinish((r.until - Date.now()) / 1000);
    if (this.save.gems < gems) return this.fail({ ok: false, reason: "Not enough gems" });
    this.save.gems -= gems;
    r.until = Date.now();
    this.tickT = 0;
    this.persist(true);
  }

  finishTraining() {
    const s = this.save;
    const left = this.trainLeft();
    if (left <= 0) return;
    const gems = gemsToFinish(left);
    if (s.gems < gems) return this.fail({ ok: false, reason: "Not enough gems" });
    s.gems -= gems;
    // Pretend the queue started long ago; tick() finishes everything that fits.
    s.queueT = Date.now() - 1e9;
    this.tickT = 0;
    this.persist(true);
  }

  /** Finishes every spell in the Spell Factory's queue now, for gems. */
  finishBrewing() {
    const s = this.save;
    const left = this.brewLeft();
    if (left <= 0) return;
    const gems = gemsToFinish(left);
    if (s.gems < gems) return this.fail({ ok: false, reason: "Not enough gems" });
    s.gems -= gems;
    s.brewT = Date.now() - 1e9;
    this.tickT = 0;
    this.sfx.gems();
    this.persist(true);
  }

  /** Seconds until every queued spell is brewed. */
  brewLeft() {
    const s = this.save;
    if (!s.brew.length) return 0;
    const t = s.brew.reduce((a, k) => a + SPELLS[k].brew, 0) - (Date.now() - s.brewT) / 1000;
    return Math.max(0, t);
  }

  trainLeft() {
    const s = this.save;
    if (!s.queue.length) return 0;
    const speed = V.trainSpeed(s);
    let t = s.queue.reduce((a, k) => a + TROOPS[k].train / speed, 0);
    t -= (Date.now() - s.queueT) / 1000;
    return Math.max(0, t);
  }

  train(kind: TroopKind) {
    const r = V.train(this.save, kind);
    if (!r.ok) return this.fail(r);
    this.sfx.click();
    this.persist();
    this.emitHud();
  }

  untrain(kind: TroopKind) {
    V.untrain(this.save, kind);
    this.persist();
    this.emitHud();
  }

  brew(kind: SpellKind) {
    const r = V.brew(this.save, kind);
    if (!r.ok) return this.fail(r);
    this.sfx.click();
    this.persist();
    this.emitHud();
  }

  unbrew(kind: SpellKind) {
    V.unbrew(this.save, kind);
    this.persist();
    this.emitHud();
  }

  research(kind: TroopKind | SpellKind) {
    const r = V.startResearch(this.save, kind, Date.now());
    if (!r.ok) return this.fail(r);
    this.sfx.place();
    this.persist(true);
    this.emitHud();
  }

  setName(name: string) {
    this.save.name = name.trim().slice(0, 20) || villageName();
    if (this.save.tutorial === 0) this.save.tutorial = 1;
    this.persist(true);
    this.emitHud();
  }

  setTutorial(step: number) {
    this.save.tutorial = step;
    this.persist();
    this.emitHud();
  }

  setUiBusy(busy: boolean) {
    this.busyUi = busy;
  }

  resetVillage() {
    this.save = V.newVillage();
    this.select(null);
    for (const c of this.campUnits) this.units?.release(c.u);
    this.campUnits = [];
    for (const w of this.workers) this.units?.release(w.u);
    this.workers = [];
    for (const h of this.heroes.values()) this.units?.release(h.u);
    this.heroes.clear();
    this.overlay.clear();
    this.buildVillage();
    this.persist(true);
    this.emitHud();
  }

  /** Spend gems to fill a missing resource amount. */
  buyResource(res: "gold" | "elixir", amount: number, gems: number) {
    if (this.save.gems < gems) return this.fail({ ok: false, reason: "Not enough gems" });
    const room = V.capacity(this.save, res) - this.save[res];
    if (room < amount) return this.fail({ ok: false, reason: "Not enough storage space" });
    this.save.gems -= gems;
    this.save[res] += amount;
    this.sfx.gems();
    this.persist(true);
    this.emitHud();
  }

  // --- Placing & moving ---------------------------------------------------------------------------------------

  startPlacing(kind: BKind) {
    if (this.mode !== "village" || !this.bank) return;
    const can = V.canBuild(this.save, kind);
    if (!can.ok) return this.fail(can);
    const cost = V.buildCost(this.save, kind);
    const def = BUILDINGS[kind];
    if (this.save[def.res as "gold" | "elixir"] < cost) return this.fail({ ok: false, reason: `Not enough ${def.res}` });
    if (def.time[0] > 0 && V.freeBuilders(this.save) < 1) return this.fail({ ok: false, reason: "All builders are busy" });
    this.cancelPlacing();
    this.select(null);
    const size = def.size;
    const cx = this.target.x + GRID / 2;
    const cz = this.target.z + GRID / 2;
    const spot = V.freeSpot(this.save, size, cx, cz) ?? { x: Math.floor(cx), z: Math.floor(cz) };
    const view = this.makeView(-1, kind, 1, spot.x, spot.z, this.villageGroup);
    this.placing = { kind, x: spot.x, z: spot.z, view, valid: true };
    this.updatePlacing();
    this.sfx.pickUp();
    this.emitHud();
  }

  private updatePlacing() {
    const p = this.placing;
    if (!p) return;
    const size = BUILDINGS[p.kind].size;
    p.valid = V.fits(this.save, size, p.x, p.z);
    footprintCenter(p.x, p.z, size, p.view.root.position);
    p.view.root.position.y = 0.15;
    this.showFootprint(p.x, p.z, size, p.valid);
    if (p.kind === "wall") this.rebuildWalls();
  }

  private showFootprint(x: number, z: number, size: number, valid: boolean) {
    const fp = this.footprint!;
    fp.visible = true;
    footprintCenter(x, z, size, fp.position);
    fp.position.y = 0.04;
    fp.scale.set(size, size, 1);
    (fp.material as THREE.MeshBasicMaterial).color.set(valid ? "#22c55e" : "#ef4444");
    if (this.gridLines) this.gridLines.visible = true;
  }

  private hideFootprint() {
    if (this.footprint) this.footprint.visible = false;
    if (this.gridLines) this.gridLines.visible = false;
  }

  confirmPlacing() {
    const p = this.placing;
    if (!p) return;
    if (!p.valid) {
      this.sfx.denied();
      this.events.toast("Can't build there", "bad");
      return;
    }
    if (p.trayId !== undefined) return this.confirmTray();
    const r = V.place(this.save, p.kind, p.x, p.z, Date.now());
    if (!r.ok) {
      this.fail(r);
      this.cancelPlacing();
      return;
    }
    p.view.root.removeFromParent();
    const kind = p.kind;
    const last = { x: p.x, z: p.z };
    this.placing = null;
    this.hideFootprint();
    this.addView(r.b);
    if (kind === "wall") this.rebuildWalls();
    this.sfx.place();
    const c = footprintCenter(r.b.x, r.b.z, BUILDINGS[kind].size);
    this.dust.burst(18, c.x, 0.2, c.z, { color: 0xc8b48a, size: 0.35, life: 0.8, speed: 1.6, up: 0.6, gravity: 0.5, grow: 2 });
    this.syncWorkers();
    if (kind === "camp") this.syncCamp(true);
    this.persist(true);
    // Walls: the next one waits right after this one, carrying the line on.
    if (kind === "wall" && V.canBuild(this.save, "wall").ok && this.save.gold >= BUILDINGS.wall.cost[0]) {
      this.startPlacing("wall");
      this.nextWallSpot(last);
    } else this.lastWall = null;
    this.emitHud();
  }

  /**
   * Puts the wall being placed next to the one just placed: straight on along the line (the way the
   * last two walls run), turning a corner when that tile is taken, never jumping across the map.
   */
  private nextWallSpot(last: { x: number; z: number }) {
    const prev = this.lastWall;
    if (prev && Math.abs(last.x - prev.x) + Math.abs(last.z - prev.z) === 1) this.wallDir = { dx: last.x - prev.x, dz: last.z - prev.z };
    this.lastWall = last;
    const p = this.placing;
    if (!p) return;
    const { dx, dz } = this.wallDir;
    for (const [ax, az] of [[dx, dz], [-dz, dx], [dz, -dx], [-dx, -dz]]) {
      if (V.fits(this.save, 1, last.x + ax, last.z + az)) {
        p.x = last.x + ax;
        p.z = last.z + az;
        break;
      }
    }
    this.updatePlacing();
  }

  /** The wall being placed and the run after it: as many walls as fit straight on (up to 10). */
  wallRow() {
    const p = this.placing;
    if (!p || p.kind !== "wall") return;
    const { dx, dz } = this.wallDir;
    let n = 0;
    let x = p.x;
    let z = p.z;
    while (n < 10 && this.placing?.valid) {
      const before = this.placing;
      this.confirmPlacing();
      n++;
      const next = this.placing;
      if (!next || next === before) break;
      // Stop at a corner: the row only goes straight.
      if (next.x !== x + dx || next.z !== z + dz) break;
      x = next.x;
      z = next.z;
    }
    if (n > 1) this.events.toast(`${n} walls placed`, "good");
  }

  private lastWall: { x: number; z: number } | null = null;

  cancelPlacing() {
    if (!this.placing) return;
    if (this.placing.trayId !== undefined) {
      // Back into the tray.
      this.placing.view.root.visible = false;
      this.placing = null;
      this.lastWall = null;
      this.hideFootprint();
      this.rebuildWalls();
      this.emitHud();
      return;
    }
    this.placing.view.root.removeFromParent();
    const wasWall = this.placing.kind === "wall";
    this.placing = null;
    this.lastWall = null;
    this.hideFootprint();
    if (wasWall) this.rebuildWalls();
    this.emitHud();
  }

  // --- Layout editor ---------------------------------------------------------------------------------------------

  /** Opens the layout editor: drag any building, store buildings in the tray and place them back. */
  startEditing() {
    if (this.mode !== "village" || this.editing) return;
    this.cancelPlacing();
    this.select(null);
    this.flushSave();
    this.editing = { orig: new Map(this.save.buildings.map((b) => [b.id, { x: b.x, z: b.z }])), tray: [] };
    // Troops, builders and heroes step aside while buildings move around.
    for (const c of this.campUnits) this.units?.release(c.u);
    this.campUnits = [];
    for (const w of this.workers) this.units?.release(w.u);
    this.workers = [];
    for (const h of this.heroes.values()) this.units?.release(h.u);
    this.heroes.clear();
    if (this.gridLines) this.gridLines.visible = true;
    this.sfx.pickUp();
    this.emitHud();
  }

  private trayCounts() {
    const counts = new Map<BKind, number>();
    for (const id of this.editing?.tray ?? []) {
      const b = this.building(id);
      if (b) counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
    }
    return [...counts].map(([kind, n]) => ({ kind, n }));
  }

  /** Takes a building off the map into the tray. */
  private toTray(b: V.SBuilding) {
    const ed = this.editing;
    if (!ed || ed.tray.includes(b.id)) return;
    ed.tray.push(b.id);
    // Off the map: nothing else sees it until it's placed again.
    b.x = -1000;
    b.z = -1000;
    const v = this.views.get(b.id);
    if (v) v.root.visible = false;
  }

  storeSelected() {
    const b = this.selectedId !== null ? this.building(this.selectedId) : null;
    if (!b || !this.editing) return;
    this.select(null);
    this.toTray(b);
    if (b.kind === "wall") this.rebuildWalls();
    this.sfx.pickUp();
    this.emitHud();
  }

  /** Clears the whole map into the tray (to build a new layout from scratch). */
  storeAll() {
    if (!this.editing) return;
    this.cancelPlacing();
    this.select(null);
    for (const b of this.save.buildings) this.toTray(b);
    this.rebuildWalls();
    this.sfx.place();
    this.emitHud();
  }

  /** Picks a building of a kind out of the tray to place (walls carry on in a line). */
  placeFromTray(kind: BKind) {
    const ed = this.editing;
    if (!ed) return;
    const id = ed.tray.find((i) => this.building(i)?.kind === kind);
    const b = id !== undefined ? this.building(id) : undefined;
    if (!b) return;
    const last = this.placing?.kind === "wall" && kind === "wall" ? this.lastWall : null;
    this.cancelPlacing();
    this.select(null);
    const size = BUILDINGS[kind].size;
    const spot = V.freeSpot(this.save, size, this.target.x + GRID / 2, this.target.z + GRID / 2) ?? { x: 0, z: 0 };
    const view = this.views.get(b.id)!;
    view.root.visible = true;
    this.placing = { kind, x: spot.x, z: spot.z, view, valid: true, trayId: b.id };
    if (last) this.nextWallSpot(last);
    else this.updatePlacing();
    this.sfx.pickUp();
    this.emitHud();
  }

  private confirmTray() {
    const p = this.placing!;
    const ed = this.editing;
    const b = this.building(p.trayId!);
    if (!ed || !b) return;
    b.x = p.x;
    b.z = p.z;
    ed.tray = ed.tray.filter((i) => i !== b.id);
    footprintCenter(b.x, b.z, BUILDINGS[b.kind].size, p.view.root.position);
    p.view.x = b.x;
    p.view.z = b.z;
    this.placing = null;
    this.hideFootprint();
    if (this.gridLines) this.gridLines.visible = true;
    this.sfx.place();
    const c = footprintCenter(b.x, b.z, BUILDINGS[b.kind].size);
    this.dust.burst(10, c.x, 0.2, c.z, { color: 0xc8b48a, size: 0.3, life: 0.6, speed: 1.2, up: 0.5, gravity: 0.5, grow: 2 });
    // Walls: the next one from the tray waits right after this one.
    if (b.kind === "wall" && ed.tray.some((i) => this.building(i)?.kind === "wall")) {
      this.lastWall = this.lastWall && Math.abs(this.lastWall.x - b.x) + Math.abs(this.lastWall.z - b.z) <= 1 ? this.lastWall : null;
      const last = { x: b.x, z: b.z };
      this.placeFromTray("wall");
      this.nextWallSpot(last);
    } else this.lastWall = null;
    this.rebuildWalls();
    this.emitHud();
  }

  /** Keeps the new layout (every building must be back on the map). */
  saveLayout() {
    const ed = this.editing;
    if (!ed) return;
    if (this.placing) this.cancelPlacing();
    if (ed.tray.length) return this.fail({ ok: false, reason: `Place the ${ed.tray.length} building${ed.tray.length > 1 ? "s" : ""} in the tray first` });
    this.closeEditor();
    this.persist(true);
    this.sfx.fanfare();
    this.events.toast("Layout saved", "good");
  }

  /** Puts every building back where it stood. */
  cancelLayout() {
    const ed = this.editing;
    if (!ed) return;
    if (this.placing) this.cancelPlacing();
    for (const b of this.save.buildings) {
      const o = ed.orig.get(b.id);
      if (o) {
        b.x = o.x;
        b.z = o.z;
      }
    }
    this.closeEditor();
  }

  private closeEditor() {
    this.editing = null;
    this.select(null);
    this.hideFootprint();
    for (const b of this.save.buildings) {
      const v = this.views.get(b.id);
      if (!v) continue;
      v.root.visible = true;
      v.x = b.x;
      v.z = b.z;
      footprintCenter(b.x, b.z, BUILDINGS[b.kind].size, v.root.position);
    }
    this.rebuildWalls();
    this.syncCamp(true);
    this.syncWorkers();
    this.syncHeroes();
    this.emitHud();
  }

  // --- Raids ----------------------------------------------------------------------------------------------------

  /** Your army, spells and ready heroes, as a raid takes them. */
  private raidArmy() {
    const troops = TROOP_ORDER.filter((k) => (this.save.army[k] ?? 0) > 0).map((k) => ({ kind: k as UnitKind, level: this.save.troopLv[k], count: this.save.army[k] ?? 0 }));
    const spells = SPELL_ORDER.filter((k) => (this.save.spells[k] ?? 0) > 0).map((k) => ({ kind: k, level: this.save.spellLv[k], count: this.save.spells[k] ?? 0 }));
    for (const k of [...HERO_ORDER].reverse()) {
      const hs = V.heroState(this.save, k);
      if (hs.ready) troops.unshift({ kind: k, level: hs.level, count: 1 });
    }
    return { troops, spells };
  }

  /** An enemy village (campaign stage or online rival) as battle input, with its heroes guarding their altars. */
  private enemyInput(st: { buildings: { kind: BKind; level: number; x: number; z: number; gold?: number; elixir?: number }[]; power: number }) {
    const buildings: SimBuildingInput[] = st.buildings.map((b, i) => ({ id: i + 1, kind: b.kind, level: b.level, x: b.x, z: b.z, gold: b.gold, elixir: b.elixir, power: st.power }));
    const guards = st.buildings.filter((b) => BUILDINGS[b.kind].hero).map((b) => ({ kind: BUILDINGS[b.kind].hero as UnitKind, level: b.level, x: b.x + 1.5, z: b.z + 1.5, r: 6 }));
    return { buildings, guards };
  }

  /** Starts an attack on a campaign stage. */
  startRaid(stageNo: number) {
    if (this.mode !== "village" || !this.bank) return;
    const st = stageOf(stageNo);
    const { troops, spells } = this.raidArmy();
    if (!troops.length) {
      this.events.toast("Train some troops in the Barracks first", "bad");
      this.sfx.denied();
      return;
    }
    this.cancelPlacing();
    this.select(null);
    const { buildings, guards } = this.enemyInput(st);
    this.online = null;
    this.battleStage = stageNo;
    this.battleName = st.name;
    // Raids last up to 5 minutes (time to use every troop and spell); ending early is always allowed.
    this.beginBattle(new Sim({ mode: "raid", buildings, timeLimit: RAID_TIME, troops, spells, guards }));
    this.sfx.horn();
    this.events.toast(`Attack ${st.name}! Tap outside the red zone to deploy.`, "info");
  }

  /** Online battle: pays for the search and takes you to a random rival village of your Town Hall level. */
  startOnline() {
    if (this.mode !== "village" || !this.bank) return;
    if (!this.raidArmy().troops.length) {
      this.events.toast("Train some troops in the Barracks first", "bad");
      this.sfx.denied();
      return;
    }
    const cost = searchCost(V.thLevel(this.save));
    if (this.save.gold < cost) return this.fail({ ok: false, reason: `Finding a match costs ${shortNumber(cost)} gold` });
    this.save.gold -= cost;
    this.cancelPlacing();
    this.select(null);
    this.persist();
    this.scoutOnline();
    this.sfx.horn();
  }

  /** While scouting (no troop dropped yet): skip to another rival for the search cost. */
  nextOnline() {
    const sim = this.sim;
    if (!sim || !this.online || sim.started || sim.ended) return;
    const cost = searchCost(V.thLevel(this.save));
    if (this.save.gold < cost) return this.fail({ ok: false, reason: `Next costs ${shortNumber(cost)} gold` });
    this.save.gold -= cost;
    this.persist();
    this.clearBattle();
    this.scoutOnline();
    this.sfx.pickUp();
  }

  /** Online battles: seconds spent looking at the rival before the battle starts by itself. */
  private scoutT = 0;

  private scoutOnline() {
    this.scoutT = 0;
    const { troops, spells } = this.raidArmy();
    const base = onlineBase(V.thLevel(this.save), Math.floor(Math.random() * 2 ** 31));
    const { buildings, guards } = this.enemyInput(base);
    this.online = base;
    this.battleStage = 0;
    this.battleName = base.name;
    this.beginBattle(new Sim({ mode: "raid", buildings, timeLimit: RAID_TIME, troops, spells, guards }));
    this.events.toast(`${base.owner} · Town Hall ${base.th} — attack, or tap Next for another village`, "info");
  }

  /** Raiders attack your village. */
  startDefence() {
    if (this.mode !== "village" || !this.bank || !this.units?.has("skeleton")) {
      this.save.raidIn = 30;
      return;
    }
    this.cancelPlacing();
    this.select(null);
    const s = this.save;
    s.raidIn = V.RAID_EVERY();
    const goldTotal = s.gold * 0.2;
    const elixirTotal = s.elixir * 0.2;
    const storesG = s.buildings.filter((b) => b.level > 0 && (b.kind === "goldstorage" || b.kind === "townhall"));
    const storesE = s.buildings.filter((b) => b.level > 0 && (b.kind === "elixirstorage" || b.kind === "townhall"));
    const buildings: SimBuildingInput[] = s.buildings
      .filter((b) => b.level > 0)
      .map((b) => {
        let gold = 0;
        let elixir = 0;
        if (storesG.includes(b)) gold += goldTotal / storesG.length;
        if (storesE.includes(b)) elixir += elixirTotal / storesE.length;
        if (b.kind === "goldmine") gold += (b.stored ?? 0) * 0.5;
        if (b.kind === "elixirpump") elixir += (b.stored ?? 0) * 0.5;
        return { id: b.id, kind: b.kind, level: b.level, x: b.x, z: b.z, gold, elixir, inactive: !!b.until };
      });
    const troops = TROOP_ORDER.filter((k) => (s.army[k] ?? 0) > 0).map((k) => ({ kind: k as UnitKind, level: s.troopLv[k], count: s.army[k] ?? 0 }));
    const army = raiderArmy(V.thLevel(s), s.stats.held);
    // Your heroes defend around their altars (hurt ones too — they just start weaker).
    const guards = HERO_ORDER.map((k) => ({ k, hs: V.heroState(s, k) }))
      .filter(({ hs }) => hs.altar && hs.level > 0 && !hs.upgrading)
      .map(({ k, hs }) => ({ kind: k as UnitKind, level: hs.level, x: hs.altar!.x + 1.5, z: hs.altar!.z + 1.5, r: 7, hp: Math.max(0.25, hs.hp) }));
    const sim = new Sim({ mode: "defence", buildings, timeLimit: 150, troops, spells: [], guards });
    // Raiders arrive from two or three sides in waves.
    const sides = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
    army.units.forEach((u, i) => {
      const side = sides[i % sides.length];
      const along = MARGIN + 4 + Math.random() * (GRID - 8);
      const edge = 1 + Math.random() * 1.5;
      const x = side === 0 ? edge : side === 1 ? N - edge : along;
      const z = side === 2 ? edge : side === 3 ? N - edge : along;
      sim.queueRaider(2 + Math.floor(i / 6) * 3 + Math.random() * 1.5, u.kind, u.level, x, z);
    });
    this.battleStage = 0;
    this.battleName = army.name;
    this.defencePlan = { used: {} };
    this.beginBattle(sim);
    this.sfx.alarm();
    this.events.toast(`${army.name} is attacking ${s.name || "your village"}! Tap inside your village to send defenders.`, "bad");
  }

  defendNow() {
    this.save.raidIn = 0;
    this.startDefence();
  }

  private beginBattle(sim: Sim) {
    this.sim = sim;
    this.simAcc = 0;
    this.ending = 0;
    this.battleSpeed = 1;
    this.paused = false;
    this.villageGroup.visible = false;
    this.selectRing!.visible = false;
    this.overlay.clear();
    for (const h of this.heroes.values()) this.units?.release(h.u);
    this.heroes.clear();
    this.battleViews = sim.buildings.map((sb) => {
      const v = this.makeView(sb.id, sb.kind, sb.level, sb.x - MARGIN, sb.z - MARGIN, this.battleGroup);
      v.sb = sb;
      // Traps are hidden from raiders; hidden defences (Hidden Tesla) from everyone until they spring up.
      if ((sb.isTrap && sim.mode === "raid") || sb.hidden) {
        v.root.visible = false;
        v.hidden = true;
      }
      return v;
    });
    this.rebuildBattleWalls();
    sim.events = {
      shot: (b, p) => this.onShot(b, p),
      troopShot: (u) => (u.kind === "mage" ? this.sfx.zap() : this.sfx.bow()),
      impact: (p) => this.onImpact(p),
      hit: (u, t) => this.onHit(u, t),
      damaged: (b) => {
        const v = this.battleViews[b.index];
        if (v) v.flash = 0.25;
      },
      destroyed: (b) => this.onDestroyed(b),
      died: (u) => this.onDied(u),
      trap: (b) => {
        const v = this.battleViews[b.index];
        if (v) {
          v.root.visible = true;
          v.hidden = false;
        }
        this.sfx.trap();
        if (b.kind === "skeltrap") this.overlay.float("Skeletons!", simToWorld(b.cx, b.cz).setY(1.4), "#e7e5e4", { size: 16, life: 1.2 });
      },
      loot: (b, g, e) => {
        const acc = this.lootAcc.get(b.index) ?? { g: 0, e: 0, t: 0 };
        acc.g += g;
        acc.e += e;
        this.lootAcc.set(b.index, acc);
      },
      spell: (z) => this.onSpell(z),
      bolt: (x, z) => this.onBolt(x, z),
      explode: (u) => this.onExplode(u),
      heal: (u, t) => {
        const p = simToWorld(t.x, t.z);
        this.sparks.burst(6, p.x, 0.5, p.z, { color: 0xfef08a, size: 0.12, life: 0.6, speed: 0.6, up: 1.5, gravity: -0.5 });
        void u;
        this.sfx.heal();
      },
      deployed: (u) => {
        const p = simToWorld(u.x, u.z);
        this.dust.burst(6, p.x, 0.1, p.z, { color: 0xd6d3c8, size: 0.25, life: 0.5, speed: 1, up: 0.3, grow: 2 });
        if (u.guard) return;
        if (u.side === 1 || this.sim?.mode === "raid") this.sfx.deploy();
        if (u.hero && u.side === 0) {
          this.sfx.horn();
          this.overlay.float(`${HEROES[u.kind as HeroKind].name}!`, p.clone().setY(1.8), "#fde68a", { size: 18, life: 1.4 });
        }
      },
      ability: (u) => this.onAbility(u),
      sprung: (b, u) => {
        const p = simToWorld(u.x, u.z);
        this.dust.burst(10, p.x, 0.2, p.z, { color: 0x78716c, size: 0.4, life: 0.9, speed: 1.2, up: 1.2, grow: 2 });
        void b;
      },
      reveal: (b) => this.onReveal(b),
      zap: (b, hits) => this.onZap(b, hits),
    };
    // Deploy-zone overlay.
    this.makeDeployZone(sim);
    const slots = this.slots();
    this.slot = slots[0]?.id ?? null;
    this.setMode(sim.mode === "raid" ? "raid" : "defence");
    soundtrack.play("battle");
    soundtrack.duck(false);
    this.target.set(0, 0, 0);
    this.dist = this.fitDist() * 0.92;
    this.lastBattleHud = "";
    this.emitBattle(true);
  }

  private rebuildBattleWalls() {
    if (!this.sim || !this.battleWalls) return;
    const list: WallInfo[] = this.sim.buildings.filter((b) => b.isWall && !b.dead).map((b) => ({ id: b.index, x: b.x, z: b.z, level: b.level }));
    this.battleWalls.rebuild(list, { x: -N / 2, z: -N / 2 });
  }

  /**
   * Where troops can't be dropped, drawn like in Clash of Clans: one clean border line round the
   * whole area (no tinted box round every building) with a faint red wash that lights up when you
   * tap inside it.
   */
  private makeDeployZone(sim: Sim) {
    this.deployZone?.removeFromParent();
    const px = 16;
    const c = document.createElement("canvas");
    c.width = c.height = N * px;
    const ctx = c.getContext("2d")!;
    const side = sim.mode === "raid" ? 0 : 1;
    const blocked = (x: number, z: number) => {
      if (x < 0 || z < 0 || x >= N || z >= N) return false;
      return side === 0 ? sim.noDeploy[z * N + x] === 1 : !(x >= MARGIN && z >= MARGIN && x < N - MARGIN && z < N - MARGIN);
    };
    ctx.fillStyle = side === 0 ? "rgba(239,68,68,0.16)" : "rgba(15,23,42,0.3)";
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (blocked(x, z)) ctx.fillRect(x * px, z * px, px, px);
    // The border: every edge between a blocked tile and a free one.
    ctx.strokeStyle = side === 0 ? "rgba(255,240,240,0.95)" : "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      ctx.moveTo(x0 * px, z0 * px);
      ctx.lineTo(x1 * px, z1 * px);
    };
    ctx.beginPath();
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        if (!blocked(x, z)) continue;
        if (!blocked(x - 1, z)) edge(x, z, x, z + 1);
        if (!blocked(x + 1, z)) edge(x + 1, z, x + 1, z + 1);
        if (!blocked(x, z - 1)) edge(x, z, x + 1, z);
        if (!blocked(x, z + 1)) edge(x, z + 1, x + 1, z + 1);
      }
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(N, N), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.035;
    mesh.renderOrder = 2;
    this.deployZone = mesh;
    this.battleGroup.add(mesh);
    this.deployFlash = 4;
    this.owned.push(tex, mat, mesh.geometry);
  }

  slots(): Slot[] {
    const sim = this.sim;
    if (!sim) return [];
    const out: Slot[] = [];
    for (const t of sim.troops) {
      const slot: Slot = { id: `t:${t.kind}`, kind: t.kind, spell: false, level: t.level, count: t.count };
      if (isHero(t.kind)) {
        const u = this.heroUnit(t.kind);
        slot.hero = { out: !!u, ability: !!u && !u.dead && !u.abilityUsed, hp: u ? Math.round((u.hp / u.maxHp) * 20) / 20 : 1 };
      }
      out.push(slot);
    }
    for (const s of sim.spells) out.push({ id: `s:${s.kind}`, kind: s.kind, spell: true, level: s.level, count: s.count });
    return out;
  }

  /** The player's hero of a kind on the battlefield. */
  private heroUnit(kind: UnitKind) {
    const sim = this.sim;
    if (!sim) return null;
    const side = sim.mode === "raid" ? 0 : 1;
    return sim.units.find((u) => u.kind === kind && u.side === side && !u.guard) ?? null;
  }

  pickSlot(id: string) {
    // Tapping a hero who is already fighting uses the ability.
    const kind = id.slice(2) as UnitKind;
    const hero = id.startsWith("t:") && isHero(kind) ? this.heroUnit(kind) : null;
    if (hero && this.sim) {
      if (!this.sim.ability(hero)) this.sfx.denied();
      this.emitBattle(true);
      return;
    }
    this.slot = id;
    this.sfx.click();
    this.emitBattle(true);
  }

  private onAbility(u: SU) {
    const p = simToWorld(u.x, u.z);
    if (u.kind === "king") {
      this.sparks.burst(50, p.x, 0.6, p.z, { color: 0xfbbf24, size: 0.2, life: 0.9, speed: 4, up: 2, gravity: 3 });
      this.overlay.float("War Cry!", p.clone().setY(2), "#fde047", { size: 22, life: 1.4 });
    } else {
      this.dust.burst(24, p.x, 0.5, p.z, { color: 0xa78bfa, size: 0.5, life: 1, speed: 1.4, up: 1, grow: 2.4 });
      this.sfx.spell("freeze");
      this.overlay.float("Vanish!", p.clone().setY(2), "#ddd6fe", { size: 22, life: 1.4 });
    }
  }

  pickSlotIndex(i: number) {
    const s = this.slots()[i];
    if (s) this.pickSlot(s.id);
  }

  setSpeed(speed: number) {
    this.battleSpeed = speed;
    this.emitBattle(true);
  }

  pauseBattle(on: boolean) {
    this.paused = on;
    soundtrack.duck(on);
  }

  /** Ends the battle now (surrender / finish early). */
  endBattle() {
    if (!this.sim || this.sim.ended) return;
    this.sim.end();
  }

  private deployAt(clientX: number, clientY: number) {
    const sim = this.sim;
    if (!sim || sim.ended || !this.slot) return false;
    const p = this.groundAt(clientX, clientY);
    if (!p) return false;
    const sx = p.x + N / 2;
    const sz = p.z + N / 2;
    const [type, kind] = this.slot.split(":");
    if (type === "s") {
      const z = sim.cast(kind as SpellKind, sx, sz);
      if (!z) return false;
      this.save.stats.spells++;
      V.award(this.save, "spell");
      this.emitBattle(true);
      this.advanceSlot();
      return true;
    }
    const side = sim.mode === "raid" ? 0 : 1;
    const u = sim.deploy(kind as UnitKind, sx, sz, side);
    if (!u) {
      if (!sim.canDeploy(sx, sz, side)) {
        this.deployFlash = 1.5;
        this.sfx.noDeploy();
        this.overlay.float(side === 0 ? "Can't deploy here" : "Inside your village", new THREE.Vector3(p.x, 0.5, p.z), "#fca5a5", { size: 15, life: 0.9, rise: 20 });
      }
      this.advanceSlot();
      return false;
    }
    if (side === 1 && this.defencePlan) this.defencePlan.used[kind as TroopKind] = (this.defencePlan.used[kind as TroopKind] ?? 0) + 1;
    if (isHero(kind)) this.advanceSlot();
    this.emitBattle(true);
    return true;
  }

  /** When a slot runs out, pick the next one with stock. */
  private advanceSlot() {
    const slots = this.slots();
    const cur = slots.find((s) => s.id === this.slot);
    if (cur && cur.count > 0) return;
    const next = slots.find((s) => s.count > 0 && !s.spell && !s.hero) ?? slots.find((s) => s.count > 0);
    this.slot = next?.id ?? null;
  }

  private onShot(b: SB, p: Projectile) {
    const v = this.battleViews[b.index];
    if (b.kind === "cannon") this.sfx.cannon();
    else if (b.kind === "archertower") this.sfx.arrowTower();
    else if (b.kind === "catapult") this.sfx.catapult();
    else this.sfx.zap();
    if (v?.mesh?.turret && b.kind === "cannon") {
      const c = simToWorld(p.x0, p.z0);
      this.dust.burst(5, c.x + Math.sin(b.yaw) * 0.9, 1.0, c.z + Math.cos(b.yaw) * 0.9, { color: 0xe5e7eb, size: 0.35, life: 0.6, speed: 0.6, up: 0.6, grow: 2.5 });
    }
  }

  private onImpact(p: Projectile) {
    const w = simToWorld(p.x1, p.z1);
    if (p.kind === "boulder") {
      this.dust.burst(16, w.x, 0.2, w.z, { color: 0xb8a58a, size: 0.4, life: 0.9, speed: 2, up: 1, gravity: 1.5, grow: 2.2 });
      this.sfx.boom(false);
      this.shake = Math.max(this.shake, 0.12);
    } else if (p.kind === "cannonball") {
      this.dust.burst(6, w.x, 0.3, w.z, { color: 0xd6d3d1, size: 0.25, life: 0.5, speed: 1.2, up: 0.8, grow: 2 });
    } else if (p.kind === "bolt" || p.kind === "troop-bolt") {
      this.sparks.burst(p.kind === "bolt" ? 18 : 10, w.x, 0.6, w.z, { color: p.kind === "bolt" ? 0xa78bfa : 0xf0abfc, size: 0.16, life: 0.5, speed: 2.4, up: 1, gravity: 2 });
    }
  }

  private onHit(u: SU, t: SB | SU) {
    const p = "cx" in t ? simToWorld(t.cx - (t.cx - u.x) * 0.3, t.cz - (t.cz - u.z) * 0.3) : simToWorld(t.x, t.z);
    if (u.kind === "giant" || u.kind === "zombie") this.sfx.punch();
    else this.sfx.sword();
    this.sparks.burst(3, p.x, 0.5, p.z, { color: 0xfff7d6, size: 0.1, life: 0.3, speed: 1.5, up: 1, gravity: 3 });
  }

  private onDestroyed(b: SB) {
    const v = this.battleViews[b.index];
    const w = simToWorld(b.cx, b.cz);
    if (b.isWall) {
      this.wallsDirty = true;
      this.dust.burst(10, w.x, 0.4, w.z, { color: 0xc8b48a, size: 0.3, life: 0.8, speed: 1.4, up: 1, gravity: 1, grow: 2 });
      this.sfx.wallBreak();
      return;
    }
    if (b.isTrap) {
      if (v) v.root.visible = false;
      this.sparks.burst(30, w.x, 0.4, w.z, { color: 0xfb923c, size: 0.25, life: 0.6, speed: 3, up: 2, gravity: 3 });
      this.dust.burst(20, w.x, 0.3, w.z, { color: 0x57534e, size: 0.5, life: 1.1, speed: 1.5, up: 1.2, grow: 2.5 });
      this.sfx.boom(true);
      this.shake = Math.max(this.shake, 0.25);
      return;
    }
    if (v) v.collapse = 0;
    this.dust.burst(30 + b.size * 8, w.x, 0.6, w.z, { color: 0xb8a58a, size: 0.55, life: 1.4, speed: 1.8, up: 1.2, gravity: 0.4, grow: 2.5, spread: b.size * 0.8 });
    this.sparks.burst(12, w.x, 1, w.z, { color: 0xfdba74, size: 0.12, life: 0.6, speed: 3, up: 3, gravity: 6 });
    this.sfx.collapse();
    this.shake = Math.max(this.shake, b.kind === "townhall" ? 0.4 : 0.15);
    if (b.kind === "townhall" && this.sim?.mode === "raid") {
      this.sfx.star();
      this.overlay.float("Town Hall destroyed! ★", w.clone().setY(3), "#fde047", { size: 22, life: 2 });
    }
  }

  private onDied(u: SU) {
    this.sfx.die();
    const p = simToWorld(u.x, u.z);
    this.dust.burst(6, p.x, 0.3, p.z, { color: 0xe7e5e4, size: 0.25, life: 0.7, speed: 0.6, up: 0.8, grow: 2 });
  }

  /** The Wall Breaker's bomb: fireball, smoke and flying bones. */
  private onExplode(u: SU) {
    const p = simToWorld(u.x, u.z);
    this.sparks.burst(60, p.x, 0.5, p.z, { color: 0xfdba74, size: 0.28, life: 0.7, speed: 4.2, up: 2.5, gravity: 3 });
    this.sparks.burst(24, p.x, 0.6, p.z, { color: 0xfef08a, size: 0.42, life: 0.35, speed: 2, up: 1.5, gravity: 1 });
    this.dust.burst(30, p.x, 0.4, p.z, { color: 0x44403c, size: 0.6, life: 1.3, speed: 1.8, up: 1.4, grow: 2.8, spread: 0.6 });
    this.dust.burst(10, p.x, 0.4, p.z, { color: 0xe7e5e4, size: 0.16, life: 0.9, speed: 2.6, up: 2.8, gravity: 6 });
    this.sfx.blast();
    this.shake = Math.max(this.shake, 0.32);
  }

  /** A Hidden Tesla springs out of the ground. */
  private onReveal(b: SB) {
    const v = this.battleViews[b.index];
    if (v) {
      v.root.visible = true;
      v.hidden = false;
      v.rise = 0;
      v.root.position.y = -((v.mesh?.height ?? 3) + 0.3);
    }
    const w = simToWorld(b.cx, b.cz);
    this.dust.burst(26, w.x, 0.2, w.z, { color: 0x9a8a6a, size: 0.45, life: 0.9, speed: 1.8, up: 1.4, gravity: 1, grow: 2.2, spread: 0.8 });
    this.sparks.burst(30, w.x, 1, w.z, { color: 0x93c5fd, size: 0.16, life: 0.6, speed: 3, up: 3, gravity: 4 });
    this.sfx.rise();
    this.shake = Math.max(this.shake, 0.15);
    this.overlay.float(`${BUILDINGS[b.kind].name}!`, w.clone().setY(3.2), "#bae6fd", { size: 18, life: 1.4 });
  }

  /** A Hidden Tesla's shock: arcs from its tip to the troop it hit, then on to each troop it jumped to. */
  private onZap(b: SB, hits: SU[]) {
    const v = this.battleViews[b.index];
    const mats = this.zapMats!;
    const top = simToWorld(b.cx, b.cz).setY(Math.max(1.2, (v?.mesh?.height ?? 3) - 0.3 + (v?.root.position.y ?? 0)));
    let from = top;
    for (const u of hits) {
      const to = simToWorld(u.x, u.z).setY(u.radius > 0.3 ? 0.8 : 0.45);
      for (let k = 0; k < 2; k++) {
        const line = arcLine(from, to, mats[k], k ? 0.42 : 0.24);
        this.fxGroup.add(line);
        this.bolts.push({ line, t: 0, short: true });
      }
      this.sparks.burst(10, to.x, to.y, to.z, { color: 0xbfdbfe, size: 0.14, life: 0.35, speed: 2.2, up: 1, gravity: 3 });
      from = to;
    }
    this.sparks.burst(6, top.x, top.y, top.z, { color: 0xe0f2fe, size: 0.2, life: 0.3, speed: 1.4, up: 0.5 });
    this.sfx.shock();
  }

  private onSpell(z: Zone) {
    const def = SPELLS[z.kind];
    const ring = groundRing(def.color, z.kind === "freeze" ? 0.3 : 0.2);
    const p = simToWorld(z.x, z.z);
    ring.group.position.copy(p);
    ring.group.scale.set(z.r, 1, z.r);
    this.fxGroup.add(ring.group);
    this.zoneViews.set(z.id, { ring, zone: z });
    this.sfx.spell(z.kind);
    this.sparks.burst(30, p.x, 0.3, p.z, { color: new THREE.Color(def.color).getHex(), size: 0.2, life: 0.9, speed: z.r * 1.5, up: 1, gravity: 0.5 });
  }

  private onBolt(x: number, z: number) {
    const p = simToWorld(x, z);
    const line = boltLine(p.x, p.z, this.boltMat!);
    this.fxGroup.add(line);
    this.bolts.push({ line, t: 0 });
    this.sparks.burst(24, p.x, 0.4, p.z, { color: 0xbae6fd, size: 0.2, life: 0.5, speed: 3, up: 2, gravity: 4 });
    this.sfx.thunder();
    this.shake = Math.max(this.shake, 0.15);
  }

  private projectileObject(kind: string): THREE.Object3D {
    const pool = this.projPool.get(kind);
    const obj = pool?.pop();
    if (obj) {
      obj.visible = true;
      this.fxGroup.add(obj);
      return obj;
    }
    const bank = this.bank!;
    const parts =
      kind === "cannonball"
        ? [{ m: "cannonball" as const, s: 1.3 }]
        : kind === "arrow"
          ? [{ m: "arrow" as const, s: 1.1 }]
          : kind === "troop-arrow"
            ? [{ m: "arrow" as const, s: 0.7 }]
            : kind === "boulder"
              ? [{ m: "boulder" as const, s: 2 }]
              : kind === "bolt"
                ? [{ m: "crystal" as const, s: 1, look: "glow" as const }]
                : [{ m: "crystal" as const, s: 0.7, look: "elixir" as const }];
    const g = bank.group(parts, `p:${kind}`, { cast: false, receive: false });
    const holder = new THREE.Group();
    // Centre the model on its pivot.
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3());
    g.position.sub(c);
    holder.add(g);
    this.fxGroup.add(holder);
    return holder;
  }

  private releaseProjectile(kind: string, obj: THREE.Object3D) {
    obj.removeFromParent();
    let pool = this.projPool.get(kind);
    if (!pool) this.projPool.set(kind, (pool = []));
    pool.push(obj);
  }

  private updateBattle(dt: number) {
    const sim = this.sim!;
    if (this.online && !sim.started && !sim.ended && !this.paused) {
      this.scoutT += dt;
      if (this.scoutT >= SCOUT_TIME) {
        sim.started = true;
        this.events.toast("The battle has started!", "info");
      }
    }
    if (!this.paused && !sim.ended) {
      this.simAcc += dt * this.battleSpeed;
      let steps = 0;
      while (this.simAcc >= STEP && steps < 12) {
        sim.step(STEP);
        this.simAcc -= STEP;
        steps++;
      }
      if (this.wallsDirty) {
        this.wallsDirty = false;
        this.rebuildBattleWalls();
      }
    }
    if (sim.ended) {
      this.ending += dt;
      if (this.ending > 1.6 && this.ending - dt <= 1.6) this.finishBattle();
    }
    const vdt = this.paused ? 0 : dt * this.battleSpeed;
    // Buildings.
    for (const v of this.battleViews) {
      const sb = v.sb!;
      if (v.rise >= 0) {
        // Springing up out of the ground (eases out with a little overshoot).
        v.rise += vdt;
        const k = Math.min(1, v.rise / 0.5);
        const e = 1 - Math.pow(1 - k, 3);
        v.root.position.y = -(1 - e) * ((v.mesh?.height ?? 3) + 0.3) + Math.sin(k * Math.PI) * 0.12;
        if (k < 1 && Math.random() < vdt * 30) {
          const w = simToWorld(sb.cx, sb.cz);
          this.dust.emit({ x: w.x + (Math.random() - 0.5) * 1.6, y: 0.15, z: w.z + (Math.random() - 0.5) * 1.6, vy: 0.6, color: 0x9a8a6a, size: 0.35, life: 0.7, grow: 2 });
        }
        if (k >= 1) {
          v.rise = -1;
          v.root.position.y = 0;
        }
      }
      if (v.mesh?.turret && sb.atk) {
        const target = sb.yaw + (v.kind === "catapult" ? 0 : 0);
        v.mesh.turret.rotation.y = target;
        const recoil = Math.max(0, 1 - sb.fired * 6);
        v.mesh.turret.position.x = -Math.sin(sb.yaw) * recoil * 0.12;
        v.mesh.turret.position.z = -Math.cos(sb.yaw) * recoil * 0.12;
        if (v.mesh.spin) v.mesh.spin.rotation.y += vdt;
      }
      if (v.kind === "magetower" && v.mesh?.turret) v.mesh.turret.position.y = (recipeTurretY(v) ?? v.mesh.turret.position.y) + Math.sin(performance.now() / 400) * 0.06;
      if (v.mesh?.spin) {
        v.spinT += vdt;
        if (v.mesh.spinSpeed) v.mesh.spin.rotation.x = v.spinT * v.mesh.spinSpeed;
        else v.mesh.spin.rotation.y = v.spinT * 0.8;
      }
      if (v.flash > 0) {
        v.flash = Math.max(0, v.flash - dt * 2);
        const s = 1 - v.flash * 0.12;
        if (v.mesh) v.mesh.root.scale.set(1 + v.flash * 0.05, s, 1 + v.flash * 0.05);
      }
      if (v.collapse >= 0 && v.mesh) {
        v.collapse += dt;
        const k = Math.min(1, v.collapse / 0.45);
        v.mesh.root.scale.set(1 + k * 0.15, Math.max(0.02, 1 - k), 1 + k * 0.15);
        if (k >= 1) {
          v.mesh.root.removeFromParent();
          v.mesh = null;
          if (!v.rubble) {
            v.rubble = rubbleMesh(this.bank!, v.size);
            v.root.add(v.rubble);
          }
        }
      }
      if (sb.frozen > 0 && Math.random() < dt * 8) {
        const w = simToWorld(sb.cx, sb.cz);
        this.sparks.emit({ x: w.x + (Math.random() - 0.5) * sb.size, y: 0.3 + Math.random() * 1.5, z: w.z + (Math.random() - 0.5) * sb.size, vy: 0.3, color: 0xbae6fd, size: 0.12, life: 0.8 });
      }
      // Smoke from badly damaged buildings.
      if (!sb.dead && sb.counts && sb.hp < sb.maxHp * 0.5 && Math.random() < dt * 3) {
        const w = simToWorld(sb.cx, sb.cz);
        this.dust.emit({ x: w.x + (Math.random() - 0.5), y: 1.2, z: w.z + (Math.random() - 0.5), vy: 0.8, color: 0x4b5563, size: 0.5, life: 1.6, grow: 2.5, alpha: 0.6 });
      }
    }
    // Units.
    const seen = new Set<number>();
    for (const su of sim.units) {
      seen.add(su.id);
      let uv = this.unitViews.get(su.id);
      if (!uv) {
        if (su.dead && su.deadT > 2) continue;
        const u = this.units!.get(su.kind as CharKind, su.level, this.unitGroup);
        if (!u) continue;
        uv = { u, lastSwing: 99, gone: false, hold: 0, cloaked: false, wound: false, combo: su.id };
        if (su.kind === "bones" && !su.dead) {
          u.play("enter", { once: true, fade: 0 });
          uv.hold = 0.7;
        }
        this.unitViews.set(su.id, uv);
      }
      if (uv.gone) continue;
      const u = uv.u;
      simToWorld(su.x, su.z, u.root.position);
      u.root.rotation.y = su.yaw;
      const cloaked = su.cloak > 0 && !su.dead;
      if (cloaked !== uv.cloaked) {
        uv.cloaked = cloaked;
        u.setOpacity(cloaked ? 0.3 : 1);
      }
      if (uv.hold > 0 && !su.dead) {
        uv.hold -= vdt;
        u.update(vdt);
        continue;
      }
      if (su.dead && su.def.suicide) {
        // Blown up with its bomb: nothing left to fall over.
        uv.gone = true;
        this.units!.release(u);
        continue;
      }
      if (su.kind === "breaker" && !su.dead && u.gear[0] && Math.random() < vdt * 26) {
        // The bomb's lit fuse.
        const g = u.gear[0].getWorldPosition(this.v1);
        this.sparks.emit({ x: g.x + (Math.random() - 0.5) * 0.06, y: g.y + 0.14, z: g.z + (Math.random() - 0.5) * 0.06, vy: 0.9, color: Math.random() < 0.5 ? 0xfde047 : 0xfb923c, size: 0.09, life: 0.35 });
      }
      if (su.dead) {
        if (u.clip !== "die") u.play("die", { once: true, fade: 0.08 });
        if (su.deadT > 1.2) {
          const a = Math.max(0, 1 - (su.deadT - 1.2) / 0.6);
          u.setOpacity(a);
          u.root.position.y = -(su.deadT - 1.2) * 0.3;
          if (a <= 0) {
            uv.gone = true;
            this.units!.release(u);
          }
        }
      } else {
        // The swing starts as the attack cooldown runs out, so the blow (or the shot) lands at the
        // clip's impact frame instead of before the arm even moves.
        if (su.swing < uv.lastSwing) uv.wound = false;
        const combo = u.look.combo;
        const clip = combo ? combo[uv.combo % combo.length] : u.look.attack;
        const timing = SWING[clip] ?? SWING.default;
        if (su.moving) {
          uv.wound = false;
          u.play(u.look.run, { speed: su.def.speed > 2 ? 1.1 : 1 });
        } else if (su.attacking && !uv.wound && su.cooldown <= timing.lead) {
          uv.wound = true;
          uv.combo++;
          u.play(clip, { once: true, restart: true, fade: 0.06, speed: timing.speed });
        } else if (!uv.wound && su.swing > timing.recover && u.clip !== (u.look.hold ?? "idle")) {
          u.play(u.look.hold ?? "idle", { fade: 0.2 });
        }
      }
      uv.lastSwing = su.swing;
      if (su.rage > 0 && Math.random() < vdt * 6) {
        this.sparks.emit({ x: u.root.position.x, y: 0.4, z: u.root.position.z, vy: 1.2, color: 0xd946ef, size: 0.12, life: 0.5 });
      }
      u.update(vdt);
    }
    // Projectiles.
    const live = new Set<number>();
    for (const p of sim.projectiles) {
      live.add(p.id);
      let pv = this.projViews.get(p.id);
      if (!pv) {
        pv = { obj: this.projectileObject(p.kind), kind: p.kind };
        this.projViews.set(p.id, pv);
      }
      const k = Math.min(1, p.t / p.dur);
      const a = simToWorld(p.x0, p.z0, this.v1);
      const b = simToWorld(p.x1, p.z1, this.v2);
      const arc = p.kind === "boulder" ? 3.2 : p.kind === "arrow" || p.kind === "troop-arrow" ? 0.6 : 0.2;
      const y = p.y0 + (p.y1 - p.y0) * k + Math.sin(k * Math.PI) * arc;
      const pos = pv.obj.position;
      const px = pos.x;
      const py = pos.y;
      const pz = pos.z;
      pos.set(a.x + (b.x - a.x) * k, y, a.z + (b.z - a.z) * k);
      if (p.kind === "arrow" || p.kind === "troop-arrow") pv.obj.lookAt(pos.x * 2 - px, pos.y * 2 - py, pos.z * 2 - pz);
      else pv.obj.rotation.x += dt * 8;
      if (p.kind === "bolt" || p.kind === "troop-bolt") this.sparks.emit({ x: pos.x, y: pos.y, z: pos.z, color: p.kind === "bolt" ? 0x8b5cf6 : 0xe879f9, size: 0.18, life: 0.3 });
      if (p.kind === "boulder" && Math.random() < 0.5) this.dust.emit({ x: pos.x, y: pos.y, z: pos.z, color: 0x9ca3af, size: 0.2, life: 0.4, grow: 1.5 });
    }
    for (const [id, pv] of this.projViews) {
      if (live.has(id)) continue;
      this.releaseProjectile(pv.kind, pv.obj);
      this.projViews.delete(id);
    }
    // Spell zones.
    for (const [id, zv] of this.zoneViews) {
      const z = zv.zone;
      const alive = sim.zones.includes(z);
      const k = z.t / Math.max(0.01, z.dur);
      zv.ring.ringMat.opacity = alive ? 0.9 * (1 - k * 0.5) : Math.max(0, zv.ring.ringMat.opacity - dt * 2);
      zv.ring.discMat.opacity = alive ? 0.18 + Math.sin(z.t * 6) * 0.05 : Math.max(0, zv.ring.discMat.opacity - dt);
      if (alive && Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * z.r;
        const w = simToWorld(z.x + Math.cos(a) * r, z.z + Math.sin(a) * r);
        const col = new THREE.Color(SPELLS[z.kind].color).getHex();
        this.sparks.emit({ x: w.x, y: 0.1, z: w.z, vy: z.kind === "jump" ? 2.5 : 1, color: col, size: 0.14, life: 0.9 });
      }
      if (!alive && zv.ring.ringMat.opacity <= 0) {
        zv.ring.group.removeFromParent();
        zv.ring.dispose();
        this.zoneViews.delete(id);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.line.visible = b.short ? b.t < 0.06 || (b.t > 0.09 && b.t < 0.15) : b.t < 0.08 || (b.t > 0.12 && b.t < 0.22);
      if (b.t > (b.short ? 0.16 : 0.25)) {
        b.line.removeFromParent();
        b.line.geometry.dispose();
        this.bolts.splice(i, 1);
      }
    }
    // Loot floaters.
    for (const [idx, acc] of this.lootAcc) {
      acc.t += dt;
      if (acc.t < 0.45) continue;
      const sb = sim.buildings[idx];
      const w = simToWorld(sb.cx, sb.cz).setY(2);
      if (acc.g >= 1) this.overlay.float(`+${shortNumber(acc.g)}`, w, RES_COLOR.gold, { icon: RES_ICON.gold, size: 16, life: 1 });
      if (acc.e >= 1) this.overlay.float(`+${shortNumber(acc.e)}`, w.clone().setY(2.6), RES_COLOR.elixir, { icon: RES_ICON.elixir, size: 16, life: 1 });
      this.lootAcc.delete(idx);
    }
    // Health bars.
    this.overlay.mark("hp:");
    for (const sb of sim.buildings) {
      if (sb.dead || sb.isTrap || sb.hidden || sb.hp >= sb.maxHp || sb.hitT > 3) continue;
      const v = this.battleViews[sb.index];
      const h = sb.isWall ? 1.2 : Math.min(3.6, (v?.mesh?.height ?? 2) + 0.2);
      this.hpBar(`hp:b:${sb.index}`, simToWorld(sb.cx, sb.cz).setY(h), sb.hp / sb.maxHp, sb.isWall ? 30 : 46, sim.mode === "raid" ? "#f87171" : "#4ade80");
    }
    for (const su of sim.units) {
      if (su.dead || su.hp >= su.maxHp) continue;
      const enemy = sim.mode === "defence" && su.side === 0;
      this.hpBar(`hp:u:${su.id}`, simToWorld(su.x, su.z).setY(su.def.housing >= 5 ? 1.5 : 0.95), su.hp / su.maxHp, 22, enemy ? "#f87171" : "#4ade80");
    }
    this.overlay.sweep("hp:");
    if (this.deployZone) {
      this.deployFlash = Math.max(0, this.deployFlash - dt);
      const want = sim.ended ? 0 : this.deployFlash > 0 ? 1 : this.slot?.startsWith("t:") ? 0.7 : 0.35;
      const m = this.deployZone.material as THREE.MeshBasicMaterial;
      m.opacity += (want - m.opacity) * Math.min(1, dt * 6);
    }
    this.emitBattle();
  }

  private hpBar(key: string, pos: THREE.Vector3, ratio: number, width: number, color: string) {
    const el = this.overlay.label(key, pos, (e) => {
      e.className = "pointer-events-none";
      e.innerHTML = `<div style="width:${width}px;height:6px;border-radius:3px;background:#111827cc;border:1px solid #111827;overflow:hidden"><div data-f style="height:100%;background:${color}"></div></div>`;
    });
    (el.firstElementChild!.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.round(ratio * 100))}%`;
  }

  private finishBattle() {
    const sim = this.sim!;
    const r = sim.result();
    const s = this.save;
    const troops = Object.entries(r.used).map(([kind, n]) => ({ kind: kind as UnitKind, n: n ?? 0 }));
    const spells = Object.entries(r.spellsUsed).map(([kind, n]) => ({ kind: kind as SpellKind, n: n ?? 0 }));
    let result: BattleResult;
    // The battle music fades out so the victory / defeat fanfare plays on its own.
    soundtrack.stop(1.2);
    if (sim.mode === "raid" && this.online) {
      // Online battle: the loot you took, and trophies by stars (a retreat before the first troop costs nothing).
      const base = this.online;
      V.gain(s, r.gold, r.elixir);
      V.spendArmy(s, r.used as Partial<Record<TroopKind, number>>, r.spellsUsed);
      for (const k of HERO_ORDER) if (r.heroHp[k] !== undefined) s.heroHp[k] = r.heroHp[k]!;
      const trophies = !sim.started ? 0 : r.stars > 0 ? Math.max(1, Math.round((base.trophies.win * r.stars) / 3)) : -base.trophies.lose;
      s.trophies = Math.max(0, s.trophies + trophies);
      if (sim.started) {
        s.stats.raids++;
        s.stats.online++;
      }
      if (r.stars > 0) {
        s.stats.wins++;
        s.stats.onlineWins++;
        V.award(s, "win1");
        V.award(s, "online1");
        if (s.stats.onlineWins >= 25) V.award(s, "online25");
      }
      if (r.stars === 3) V.award(s, "three");
      if (s.tutorial < 6 && sim.started) s.tutorial = 6;
      result = { mode: "raid", stage: 0, name: base.name, stars: r.stars, percent: r.percent, gold: r.gold, elixir: r.elixir, bonus: null, troops, spells, win: r.stars > 0, trophies, raiders: 0, raidersKilled: 0, newBest: false, online: { owner: base.owner, th: base.th } };
      if (r.stars > 0) this.sfx.victory();
      else this.sfx.defeat();
    } else if (sim.mode === "raid") {
      const st = stageOf(this.battleStage);
      const idx = this.battleStage - 1;
      const before = s.stars[idx] ?? 0;
      let bonus: BattleResult["bonus"] = null;
      if (r.stars > 0 && !s.bonus.includes(this.battleStage)) {
        s.bonus.push(this.battleStage);
        bonus = { gold: st.bonusGold, elixir: st.bonusElixir, gems: st.bonusGems };
        s.gems += st.bonusGems;
      }
      const gold = r.gold + (bonus?.gold ?? 0);
      const elixir = r.elixir + (bonus?.elixir ?? 0);
      V.gain(s, gold, elixir);
      V.spendArmy(s, r.used as Partial<Record<TroopKind, number>>, r.spellsUsed);
      for (const k of HERO_ORDER) if (r.heroHp[k] !== undefined) s.heroHp[k] = r.heroHp[k]!;
      s.stars[idx] = Math.max(before, r.stars);
      for (let i = 0; i < idx; i++) s.stars[i] ??= 0;
      s.stats.raids++;
      const trophies = !sim.started ? 0 : r.stars > 0 ? r.stars * 2 + Math.floor(this.battleStage / 10) : -2;
      s.trophies = Math.max(0, s.trophies + trophies);
      if (r.stars > 0) {
        s.stats.wins++;
        V.award(s, "win1");
      }
      if (r.stars === 3) V.award(s, "three");
      for (const n of [10, 25, 50, 75, 100]) if (this.battleStage >= n && r.stars > 0) V.award(s, `stage${n}`);
      if (s.tutorial < 6) s.tutorial = 6;
      result = { mode: "raid", stage: this.battleStage, name: this.battleName, stars: r.stars, percent: r.percent, gold, elixir, bonus, troops, spells, win: r.stars > 0, trophies, raiders: 0, raidersKilled: 0, newBest: r.stars > before, online: null };
      if (r.stars > 0) this.sfx.victory();
      else this.sfx.defeat();
    } else {
      // Defence: you lose what the raiders stole; defenders who survived go back to camp.
      s.gold = Math.max(0, s.gold - r.gold);
      s.elixir = Math.max(0, s.elixir - r.elixir);
      for (const b of s.buildings) if (b.kind === "goldmine" || b.kind === "elixirpump") b.stored = (b.stored ?? 0) * 0.5;
      const used = this.defencePlan?.used ?? {};
      for (const k of TROOP_ORDER) {
        const lost = (used[k] ?? 0) - (r.survivors[k] ?? 0);
        if (lost > 0) s.army[k] = Math.max(0, (s.army[k] ?? 0) - lost);
      }
      for (const k of HERO_ORDER) if (r.heroHp[k] !== undefined) s.heroHp[k] = Math.min(s.heroHp[k], r.heroHp[k]!);
      const win = r.stars === 0;
      s.stats.defences++;
      if (win) {
        s.stats.held++;
        V.award(s, "defend");
      }
      const trophies = win ? 6 : -4 * r.stars;
      s.trophies = Math.max(0, s.trophies + trophies);
      result = { mode: "defence", stage: 0, name: this.battleName, stars: r.stars, percent: r.percent, gold: r.gold, elixir: r.elixir, bonus: null, troops, spells, win, trophies, raiders: r.raiders, raidersKilled: r.raidersKilled, newBest: false, online: null };
      if (win) this.sfx.victory();
      else this.sfx.defeat();
    }
    this.persist(true);
    this.drainAwards();
    this.events.result(result);
  }

  /** Back to the village after the results screen. */
  returnHome() {
    if (!this.sim) return;
    this.clearBattle();
    this.online = null;
    this.villageGroup.visible = true;
    this.setMode("village");
    this.syncCamp(true);
    this.syncWorkers();
    this.syncHeroes();
    soundtrack.duck(false);
    soundtrack.play("village");
    this.focusVillage(false);
    this.events.battle(null);
    this.emitHud();
  }

  /** Removes the battlefield: enemy buildings, troops, shots, spells and labels. */
  private clearBattle() {
    this.sim = null;
    for (const v of this.battleViews) v.root.removeFromParent();
    this.battleViews = [];
    for (const uv of this.unitViews.values()) if (!uv.gone) this.units?.release(uv.u);
    this.unitViews.clear();
    for (const [, pv] of this.projViews) this.releaseProjectile(pv.kind, pv.obj);
    this.projViews.clear();
    for (const zv of this.zoneViews.values()) {
      zv.ring.group.removeFromParent();
      zv.ring.dispose();
    }
    this.zoneViews.clear();
    for (const b of this.bolts) {
      b.line.removeFromParent();
      b.line.geometry.dispose();
    }
    this.bolts = [];
    this.battleWalls?.rebuild([], { x: 0, z: 0 });
    this.deployZone?.removeFromParent();
    this.deployZone = null;
    this.lootAcc.clear();
    this.overlay.clear();
    this.sparks.clear();
    this.dust.clear();
    this.defencePlan = null;
  }

  // --- HUD ------------------------------------------------------------------------------------------------------

  emitHud() {
    if (this.mode === "loading" || this.mode === "error") return;
    const s = this.save;
    const p = this.placing;
    const r = s.research;
    this.events.hud({
      rev: this.rev,
      save: s,
      name: s.name,
      th: V.thLevel(s),
      gold: Math.floor(s.gold),
      goldCap: V.capacity(s, "gold"),
      elixir: Math.floor(s.elixir),
      elixirCap: V.capacity(s, "elixir"),
      gems: s.gems,
      builders: V.builders(s),
      freeBuilders: V.freeBuilders(s),
      trophies: s.trophies,
      stars: V.totalStars(s),
      army: V.armySize(s),
      housing: V.housing(s),
      queued: V.queueSize(s),
      trainLeft: this.trainLeft(),
      spells: V.spellCount(s),
      spellSlots: V.spellSlots(s),
      brewLeft: this.brewLeft(),
      raidIn: s.stats.raids > 0 ? Math.max(0, Math.ceil(s.raidIn)) : -1,
      placing: p ? { kind: p.kind, valid: p.valid, cost: V.buildCost(s, p.kind), res: BUILDINGS[p.kind].res, tray: p.trayId !== undefined } : null,
      selected: this.selectedInfo(),
      tutorial: s.tutorial,
      research: r ? { kind: r.kind, left: Math.max(0, (r.until - Date.now()) / 1000), total: r.dur } : null,
      heroes: HERO_ORDER.map((k) => ({ k, h: V.heroState(s, k) }))
        .filter(({ h }) => h.altar)
        .map(({ k, h }) => ({ kind: k, level: h.level, hp: h.hp, left: h.left, upgrading: h.upgrading, ready: h.ready })),
      editing: this.editing ? { tray: this.trayCounts() } : null,
    });
  }

  private emitBattle(force = false) {
    const sim = this.sim;
    if (!sim) return;
    const raidersLeft = sim.mode === "defence" ? sim.raiders - sim.raidersKilled : 0;
    const h: BattleHud = {
      mode: sim.mode,
      name: this.battleName,
      stage: this.battleStage,
      timeLeft: Math.max(0, Math.ceil(sim.timeLimit - sim.time)),
      started: sim.started,
      percent: sim.percent,
      stars: sim.stars,
      gold: Math.floor(sim.gold),
      elixir: Math.floor(sim.elixir),
      goldAvail: Math.floor(sim.goldTotal),
      elixirAvail: Math.floor(sim.elixirTotal),
      slots: this.slots(),
      selected: this.slot,
      speed: this.battleSpeed,
      raidersLeft,
      thDown: sim.thDown,
      online: this.online ? { owner: this.online.owner, th: this.online.th, win: this.online.trophies.win, lose: this.online.trophies.lose, next: searchCost(V.thLevel(this.save)) } : null,
      scoutLeft: this.online && !sim.started ? Math.max(0, Math.ceil(SCOUT_TIME - this.scoutT)) : -1,
      own: { gold: Math.floor(this.save.gold), goldCap: V.capacity(this.save, "gold"), elixir: Math.floor(this.save.elixir), elixirCap: V.capacity(this.save, "elixir") },
    };
    const now = performance.now();
    if (!force && now - this.battleHudT < 100) return;
    const key = JSON.stringify(h);
    if (!force && key === this.lastBattleHud) return;
    this.battleHudT = now;
    this.lastBattleHud = key;
    this.events.battle(h);
  }

  // --- Camera -----------------------------------------------------------------------------------------------------

  private fitDist() {
    // Distance at which the village fits the view (portrait screens need more).
    const aspect = this.viewW / this.viewH;
    const need = GRID * 0.95;
    const fovV = THREE.MathUtils.degToRad(this.camera.fov);
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
    const byW = need / 2 / Math.tan(fovH / 2) / 1.25;
    const byH = (need * 0.75) / 2 / Math.tan(fovV / 2);
    return clamp(Math.max(byW, byH) * 0.82, 16, 95);
  }

  private focusVillage(instant: boolean) {
    // Centre on the buildings and pull back until all of them fit between the HUD bars.
    let x0 = GRID;
    let z0 = GRID;
    let x1 = 0;
    let z1 = 0;
    for (const b of this.save.buildings) {
      const n = BUILDINGS[b.kind].size;
      x0 = Math.min(x0, b.x);
      z0 = Math.min(z0, b.z);
      x1 = Math.max(x1, b.x + n);
      z1 = Math.max(z1, b.z + n);
    }
    if (x1 <= x0) [x0, z0, x1, z1] = [0, 0, GRID, GRID];
    const c = tileToWorld((x0 + x1) / 2, (z0 + z1) / 2);
    // Fit the buildings themselves (the camera looks at the village corner-on, so the empty corners of
    // its bounding box would push a narrow phone screen far out).
    const points = this.save.buildings.filter((b) => b.kind !== "wall").map((b) => footprintCenter(b.x, b.z, BUILDINGS[b.kind].size).setY(1));
    const saved = { t: this.curTarget.clone(), d: this.curDist };
    this.curTarget.copy(c);
    let dist = 12;
    for (const max = this.fitDist() * 0.95; dist < max; dist += 0.5) {
      this.curDist = dist;
      this.placeCamera();
      if (points.every((p) => {
        this.v2.copy(p).project(this.camera);
        return Math.abs(this.v2.x) < 0.84 && this.v2.y > -0.62 && this.v2.y < 0.66;
      })) break;
    }
    this.curTarget.copy(saved.t);
    this.curDist = saved.d;
    this.placeCamera();
    this.target.copy(c);
    this.dist = dist;
    if (instant) {
      this.curTarget.copy(this.target);
      this.curDist = this.dist;
    }
  }

  private placeCamera() {
    const c = Math.cos(PITCH);
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const shakeZ = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.camera.position.set(this.curTarget.x + Math.sin(YAW) * c * this.curDist + shakeX, this.curTarget.y + Math.sin(PITCH) * this.curDist, this.curTarget.z + Math.cos(YAW) * c * this.curDist + shakeZ);
    this.camera.lookAt(this.curTarget.x + shakeX, this.curTarget.y, this.curTarget.z + shakeZ);
    this.camera.updateMatrixWorld(true);
  }

  private updateCamera(dt: number) {
    const pan = this.dist * 0.9 * dt;
    let dx = 0;
    let dz = 0;
    if (this.keys.has("up")) dz -= 1;
    if (this.keys.has("down")) dz += 1;
    if (this.keys.has("left")) dx -= 1;
    if (this.keys.has("right")) dx += 1;
    if (dx || dz) {
      // Screen-relative: rotate by the camera yaw.
      const sx = Math.cos(YAW) * dx + Math.sin(YAW) * dz;
      const sz = -Math.sin(YAW) * dx + Math.cos(YAW) * dz;
      this.target.x += sx * pan;
      this.target.z += sz * pan;
    }
    if (this.keys.has("zoomIn")) this.zoom(1, dt * 3);
    if (this.keys.has("zoomOut")) this.zoom(-1, dt * 3);
    const lim = N / 2;
    this.target.x = clamp(this.target.x, -lim, lim);
    this.target.z = clamp(this.target.z, -lim, lim);
    const k = 1 - Math.exp(-12 * dt);
    this.curTarget.lerp(this.target, k);
    this.curDist += (this.dist - this.curDist) * k;
    this.shake = Math.max(0, this.shake - dt * 1.2);
    this.placeCamera();
  }

  setKey(dir: string, down: boolean) {
    if (down) this.keys.add(dir);
    else this.keys.delete(dir);
  }

  zoom(dir: number, amount = 0.15) {
    const f = Math.pow(1 + amount, -dir);
    this.dist = clamp(this.dist * f, 9, this.fitDist() * 1.25);
  }

  /**
   * Resizing the canvas clears it, so frame() calls this right before drawing — never after a frame
   * is drawn, or the phone shows that cleared frame as a black flash.
   */
  private resize() {
    this.resizePending = false;
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    const ratio = this.perf.ratio;
    if (w === this.viewW && h === this.viewH && ratio === this.renderer.getPixelRatio()) return;
    this.viewW = w;
    this.viewH = h;
    if (ratio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.overlay.width = w;
    this.overlay.height = h;
    const scale = this.renderer.getPixelRatio() * h;
    this.sparks.setScale(scale, this.camera.fov);
    this.dust.setScale(scale, this.camera.fov);
    this.dist = clamp(this.dist, 9, this.fitDist() * 1.25);
  }

  // --- Input ------------------------------------------------------------------------------------------------------

  private groundAt(clientX: number, clientY: number, out = new THREE.Vector3()) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, out);
  }

  /** The village tile under the pointer (meshes first, so roofs pick their building). */
  private pick(clientX: number, clientY: number): { id: number | null; tx: number; tz: number } {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const p = this.raycaster.ray.intersectPlane(this.groundPlane, this.v1);
    const tx = p ? Math.floor(p.x + GRID / 2) : -1;
    const tz = p ? Math.floor(p.z + GRID / 2) : -1;
    const roots: THREE.Object3D[] = [];
    const ids = new Map<THREE.Object3D, number>();
    for (const v of this.views.values()) {
      if (!v.mesh || v.id === this.moving?.id || !v.root.visible) continue;
      roots.push(v.mesh.root);
      ids.set(v.mesh.root, v.id);
    }
    for (const o of this.obstacles.values()) {
      roots.push(o.root);
      ids.set(o.root, o.id);
    }
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !ids.has(o)) o = o.parent;
      if (o) return { id: ids.get(o)!, tx, tz };
    }
    if (tx >= 0 && tz >= 0 && tx < GRID && tz < GRID) {
      const grid = V.occupied(this.save);
      const id = grid[tz * GRID + tx];
      return { id: id || null, tx, tz };
    }
    return { id: null, tx, tz };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.mode === "loading" || this.mode === "error") return;
    audio.unlock();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      this.drag = "pan";
      return;
    }
    this.drag = null;
    if (this.mode === "village") {
      const hit = this.pick(e.clientX, e.clientY);
      if (this.placing) {
        const p = this.placing;
        const size = BUILDINGS[p.kind].size;
        if (hit.tx >= p.x - 1 && hit.tx <= p.x + size && hit.tz >= p.z - 1 && hit.tz <= p.z + size) this.drag = "place";
      } else if (this.selectedId !== null && hit.id === this.selectedId && this.building(this.selectedId)) {
        this.drag = "move";
      } else if (this.editing && hit.id !== null && this.building(hit.id)) {
        // Layout editor: grab any building and drag it.
        this.selectedId = hit.id;
        this.drag = "move";
      }
    } else if (this.mode === "raid" || this.mode === "defence") {
      this.deployT = 0;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const px = p.x;
    const py = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 8) p.moved = true;
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0 && this.pinch.dist > 0) this.dist = clamp(this.dist * (this.pinch.dist / d), 9, this.fitDist() * 1.25);
      this.pinch.dist = d;
      return;
    }
    if (!p.moved) return;
    if (this.drag === "place" && this.placing) {
      const g = this.groundAt(e.clientX, e.clientY);
      if (g) {
        const size = BUILDINGS[this.placing.kind].size;
        const nx = clamp(Math.round(g.x + GRID / 2 - size / 2), 0, GRID - size);
        const nz = clamp(Math.round(g.z + GRID / 2 - size / 2), 0, GRID - size);
        if (nx !== this.placing.x || nz !== this.placing.z) {
          this.placing.x = nx;
          this.placing.z = nz;
          this.updatePlacing();
          this.emitHud();
        }
      }
      return;
    }
    if (this.drag === "move" || (this.moving && this.drag !== "pan")) {
      const b = this.selectedId !== null ? this.building(this.selectedId) : null;
      if (!b) return;
      const size = BUILDINGS[b.kind].size;
      const g = this.groundAt(e.clientX, e.clientY);
      if (!g) return;
      if (!this.moving) {
        this.moving = { id: b.id, x: b.x, z: b.z, ox: b.x, oz: b.z, valid: true };
        this.sfx.pickUp();
      }
      const nx = clamp(Math.round(g.x + GRID / 2 - size / 2), 0, GRID - size);
      const nz = clamp(Math.round(g.z + GRID / 2 - size / 2), 0, GRID - size);
      this.moving.x = nx;
      this.moving.z = nz;
      this.moving.valid = V.fits(this.save, size, nx, nz, b.id);
      const v = this.views.get(b.id);
      if (v) {
        footprintCenter(nx, nz, size, v.root.position);
        v.root.position.y = 0.2;
      }
      if (this.selectRing) footprintCenter(nx, nz, size, this.selectRing.position);
      if (this.rangeRing) footprintCenter(nx, nz, size, this.rangeRing.group.position);
      this.showFootprint(nx, nz, size, this.moving.valid);
      if (b.kind === "wall") this.rebuildWalls();
      return;
    }
    if (this.mode !== "village" && this.drag === "deploy") {
      return;
    }
    // Pan.
    if (this.mode !== "village" && this.drag === null && performance.now() - p.t > 260) {
      this.drag = "deploy";
      return;
    }
    this.drag = "pan";
    const a = this.groundAt(px, py, this.v1);
    const b = this.groundAt(p.x, p.y, this.v2);
    if (a && b) {
      this.target.x += a.x - b.x;
      this.target.z += a.z - b.z;
      this.curTarget.x += a.x - b.x;
      this.curTarget.z += a.z - b.z;
      this.placeCamera();
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (!p) return;
    if (this.mode === "village") {
      if (this.moving) {
        const m = this.moving;
        const b = this.building(m.id);
        this.moving = null;
        this.hideFootprint();
        if (b) {
          const size = BUILDINGS[b.kind].size;
          if (m.valid && (m.x !== b.x || m.z !== b.z)) {
            b.x = m.x;
            b.z = m.z;
            this.sfx.place();
            this.persist(true);
            if (!this.editing) {
              this.syncWorkers();
              if (b.kind === "camp") this.syncCamp(true);
              if (BUILDINGS[b.kind].hero) this.syncHeroes();
            }
          } else if (!m.valid) this.sfx.denied();
          const v = this.views.get(b.id);
          if (v) {
            footprintCenter(b.x, b.z, size, v.root.position);
            v.x = b.x;
            v.z = b.z;
          }
          this.select(b.id);
          if (b.kind === "wall") this.rebuildWalls();
        }
        this.drag = null;
        return;
      }
      if (!p.moved && this.drag !== "pan") {
        const hit = this.pick(e.clientX, e.clientY);
        if (this.placing) {
          // Tap elsewhere: move the new building there.
          if (hit.tx >= 0 && this.drag !== "place") {
            const size = BUILDINGS[this.placing.kind].size;
            this.placing.x = clamp(hit.tx - Math.floor(size / 2), 0, GRID - size);
            this.placing.z = clamp(hit.tz - Math.floor(size / 2), 0, GRID - size);
            this.updatePlacing();
            this.emitHud();
          }
        } else if (hit.id !== null) {
          const b = this.building(hit.id);
          if (b && BUILDINGS[b.kind].produces && (b.stored ?? 0) >= 1 && this.selectedId !== hit.id && !b.until) this.collectBuilding(b.id);
          this.select(hit.id);
        } else this.select(null);
      }
      this.drag = null;
      return;
    }
    if ((this.mode === "raid" || this.mode === "defence") && !p.moved && this.drag !== "pan" && this.drag !== "deploy") this.deployAt(e.clientX, e.clientY);
    this.drag = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(e.deltaY < 0 ? 1 : -1, Math.min(0.3, Math.abs(e.deltaY) / 600 + 0.05));
  };

  /** Held pointer in battle: keep deploying along the finger. */
  private updateHeldDeploy(dt: number) {
    if (this.drag !== "deploy" || this.pointers.size !== 1) return;
    this.deployT -= dt;
    if (this.deployT > 0) return;
    this.deployT = 0.12;
    const p = [...this.pointers.values()][0];
    this.deployAt(p.x, p.y);
  }

  // --- Frame --------------------------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    // At most ~60 fps (a 120 Hz phone renders every other frame: steady, cooler, no throttling);
    // ~30 fps behind an open panel, where the village is only a dimmed backdrop.
    if (time - this.lastFrame < (this.busyUi ? 26 : 10)) return;
    this.lastFrame = time;
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.mode === "loading" || this.mode === "error") return;
    if (this.pointers.size === 1 && this.mode !== "village") {
      const p = [...this.pointers.values()][0];
      if (!p.moved && this.drag === null && performance.now() - p.t > 260) this.drag = "deploy";
    }
    if (this.mode === "village") this.updateVillage(dt);
    else if (this.sim) {
      this.updateHeldDeploy(dt);
      this.updateBattle(dt);
    }
    this.sparks.update(dt);
    this.dust.update(dt);
    this.updateCamera(dt);
    this.overlay.update(dt);
    this.hudT -= dt;
    if (this.hudT <= 0 && this.mode === "village") {
      this.hudT = 0.25;
      this.emitHud();
    }
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 3;
      this.flushSave();
    }
    // In the village almost nothing that casts a shadow moves: the shadow map is redrawn every other
    // frame (every frame while a building is being placed or moved, and in battle).
    const sm = this.renderer.shadowMap;
    if (this.mode === "village" && !this.placing && !this.moving) {
      sm.autoUpdate = false;
      this.shadowTick ^= 1;
      sm.needsUpdate = this.shadowTick === 0;
    } else sm.autoUpdate = true;
    this.adaptResolution(dt);
    if (this.resizePending) this.resize();
    this.renderer.render(this.scene, this.camera);
  };

  /** Graphics setting: "smooth" favours frame rate, "hd" renders at the screen's full sharpness. */
  setQuality(q: Quality) {
    if (q === this.quality) return;
    this.quality = q;
    this.applyQuality();
  }

  private applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const p = this.perf;
    const q = this.quality;
    if (q === "hd") {
      // Ultra HD: the screen's full resolution; only a struggling phone steps down, never below 2×.
      p.max = Math.min(dpr, 3);
      p.min = Math.min(p.max, this.coarse ? 2 : 1.5);
      p.slowFps = 26;
    } else if (q === "smooth") {
      p.max = Math.min(dpr, 1.25);
      p.min = Math.min(p.max, 0.75);
      p.slowFps = 50;
    } else {
      // Phones climb all the way to the screen's own resolution (ultra sharp) while frames stay smooth.
      p.max = Math.min(dpr, this.coarse ? 3 : 2);
      // Never blurrier than 1.5 on a phone (only "Smooth" goes lower).
      p.min = Math.min(p.max, this.coarse ? 1.5 : 1);
      p.slowFps = 45;
    }
    // Auto starts a little below the top and climbs there once the frames prove smooth.
    p.ratio = q === "auto" ? Math.min(p.max, 2.25) : p.max;
    p.ceiling = p.max;
    p.t = p.frames = p.good = 0;
    p.patience = 15;
    // Phones: 2048 shadows even in HD (sharp enough at phone size, and half the GPU work of 4096).
    const shadow = q === "smooth" ? 1024 : this.coarse ? 2048 : 4096;
    const { shadow: sh } = this.sun;
    if (sh.mapSize.x !== shadow) {
      sh.mapSize.set(shadow, shadow);
      sh.map?.dispose();
      sh.map = null;
    }
    // The new sharpness is applied by the next frame, just before it draws.
    this.resizePending = true;
  }

  private adaptResolution(dt: number) {
    const p = this.perf;
    p.t += dt;
    p.frames++;
    if (p.t < 2) return;
    const fps = p.frames / p.t;
    p.t = 0;
    p.frames = 0;
    let next = p.ratio;
    if (fps < p.slowFps && p.ratio > p.min) {
      next = Math.max(p.min, p.ratio - (fps < 30 ? 0.5 : 0.25));
      if (p.ceiling >= p.ratio) p.patience = Math.min(120, p.patience * 2);
      p.ceiling = Math.max(p.min, p.ratio - 0.25);
      p.good = 0;
    } else if (fps >= 55) {
      p.good++;
      if (p.ratio < p.ceiling && p.good >= 1) {
        next = Math.min(p.ceiling, p.ratio + 0.25);
        p.good = 0;
      } else if (p.ratio >= p.ceiling && p.ceiling < p.max && p.good >= p.patience) {
        p.ceiling = Math.min(p.max, p.ceiling + 0.25);
        p.good = 0;
      }
    } else p.good = 0;
    if (next === p.ratio) return;
    p.ratio = next;
    this.resizePending = true;
  }

  /**
   * Portraits of every building and troop for the shop, army and battle cards — rendered 2× larger
   * and scaled down (sharp on high-density screens), a few per frame so the game never freezes.
   * Portraits already made are kept: the second call (after the raiders and heroes load) only adds theirs.
   */
  private refreshIcons() {
    this.iconJob = this.iconJob.then(() => this.renderIcons()).catch((err) => console.warn("[kingdom-clash] portraits", err));
  }

  private async renderIcons() {
    const bank = this.bank;
    if (!bank || this.disposed) return;
    const out = this.iconCache;
    const jobs: { key: string; fill: number; make: (studio: Studio) => { obj: THREE.Object3D; done: () => void } | null }[] = [];
    for (const kind of Object.keys(BUILDINGS) as BKind[]) {
      const key = `b:${kind}`;
      if (out[key]) continue;
      jobs.push({ key, fill: 0.96, make: () => this.buildingModel(bank, kind, kind === "townhall" ? 3 : kind === "wall" ? 2 : 1) });
    }
    for (const kind of [...TROOP_ORDER, ...HERO_ORDER, "bones"] as CharKind[]) {
      const key = `t:${kind}`;
      if (out[key] || !this.units?.has(kind)) continue;
      jobs.push({
        key,
        fill: 0.97,
        make: (studio) => {
          const units = this.units;
          const u = units?.get(kind, isHero(kind) ? 3 : 1, studio.scene);
          if (!units || !u) return null;
          u.root.removeFromParent();
          u.play("idle");
          u.update(0.1);
          u.root.rotation.y = 0.35;
          return { obj: u.root, done: () => units.release(u) };
        },
      });
    }
    if (!jobs.length) return;
    // Rendered at 2× and scaled down: sharp on 3× phone screens too.
    const studio = new Studio(this.renderer, this.envTexture, 512, 256);
    try {
      for (let i = 0; i < jobs.length; i++) {
        if (this.disposed) return;
        const job = jobs[i];
        const made = job.make(studio);
        if (!made) continue;
        let url: string;
        try {
          url = await studio.shoot(made.obj, job.fill);
        } finally {
          made.done();
        }
        if (this.disposed) return URL.revokeObjectURL(url);
        out[job.key] = url;
        // One portrait per frame, handed to the HUD in batches as they're ready.
        await nextFrame();
        if (i % 6 === 5) this.events.icons({ ...out });
      }
    } finally {
      studio.dispose();
    }
    if (!this.disposed) this.events.icons({ ...out });
  }

  /** A building (or a short run of walls) at a level, for portraits. */
  private buildingModel(bank: Bank, kind: BKind, level: number) {
    if (kind === "wall") {
      const walls = new WallLayer(bank);
      walls.rebuild(
        [
          { id: 1, x: 0, z: 0, level },
          { id: 2, x: 1, z: 0, level },
          { id: 3, x: 1, z: 1, level },
        ],
        { x: -1, z: -1 },
      );
      return { obj: walls.group as THREE.Object3D, done: () => walls.dispose() };
    }
    return { obj: buildingMesh(bank, kind, level).root as THREE.Object3D, done: () => {} };
  }

  /**
   * Large portraits of a building at the given levels (the building popup shows this level and the
   * next one side by side). Rendered on demand at 512 px, kept for the session.
   */
  async portraits(kind: BKind, levels: number[]): Promise<Record<number, string>> {
    const bank = this.bank;
    const out: Record<number, string> = {};
    if (!bank) return out;
    const todo = levels.filter((l) => !this.portraitCache.has(`${kind}:${l}`));
    if (todo.length) {
      const studio = new Studio(this.renderer, this.envTexture, 800, 560);
      try {
        for (const level of todo) {
          if (this.disposed) return out;
          const made = this.buildingModel(bank, kind, level);
          try {
            this.portraitCache.set(`${kind}:${level}`, await studio.shoot(made.obj, 0.93));
          } finally {
            made.done();
          }
          await nextFrame();
        }
      } finally {
        studio.dispose();
      }
    }
    for (const l of levels) {
      const url = this.portraitCache.get(`${kind}:${l}`);
      if (url) out[l] = url;
    }
    return out;
  }

  /** Debug / bot access for headless tests. */
  debug() {
    return {
      save: this.save,
      sim: this.sim,
      mode: this.mode,
      tick: () => {
        this.tickT = 0;
      },
      rebuild: () => this.buildVillage(),
      camera: (x: number, z: number, dist: number) => {
        this.target.set(x, 0, z);
        this.dist = dist;
        this.curTarget.copy(this.target);
        this.curDist = dist;
      },
      deploy: (kind: string, x: number, z: number) => this.sim?.deploy(kind as UnitKind, x, z, this.sim.mode === "raid" ? 0 : 1),
      cast: (kind: string, x: number, z: number) => this.sim?.cast(kind as SpellKind, x, z),
      speed: (s: number) => (this.battleSpeed = s),
      online: () => this.startOnline(),
    };
  }

  dispose() {
    this.disposed = true;
    this.flushSave();
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    soundtrack.stop(0);
    for (const url of [...Object.values(this.iconCache), ...this.portraitCache.values()]) if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    window.removeEventListener("pagehide", this.flushSave);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    this.overlay.clear();
    this.units?.dispose();
    this.walls?.dispose();
    this.battleWalls?.dispose();
    this.bank?.dispose();
    this.ground?.dispose();
    this.owned.forEach((o) => o.dispose());
    this.sparks.dispose();
    this.dust.dispose();
    this.envTexture?.dispose();
    this.renderer.resetState();
    this.renderer.dispose();
  }
}

function recipeTurretY(v: BView) {
  return v.mesh?.turret ? (v.mesh.turret.userData.baseY ??= v.mesh.turret.position.y) : null;
}
