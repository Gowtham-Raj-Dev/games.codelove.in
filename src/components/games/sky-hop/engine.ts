import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, type Fit, type LoadedModel, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { SKY_HOP } from "../shared/songs";
import { applySkin, shaderTime } from "../skate-rush/looks";
import { Sfx } from "./audio";
import { BASE_PERKS, findItem, HEROES, perksOf, SKINS, WORLDS, type Perks, type WorldDef } from "./content";
import { Clouds, makeBlobShadow, makeGlow, Particles, Sky, Snow } from "./fx";
import { stageDef, stageSeed } from "./generator";
import { buildLevel, coinTotal, MENU, U, type LevelData, type LevelDef, type Path, type RouteNode, type V3 } from "./levels";
import { BLOCKS, ENEMIES, M, MODELS, type EnemyKind } from "./manifest";
import { makeBox, moveBoxTo, World, type Box, type Hit } from "./physics";

// --- Tuning (metres, seconds) -------------------------------------------------------------------

const RADIUS = 0.42;
const HEIGHT = 1.3;
const FOOT = 0.3;
const RUN_SPEED = 7.6;
const ACCEL = 46;
const DECEL = 58;
const AIR_ACCEL = 30;
const AIR_DECEL = 5;
/** Accel / decel multipliers on snow. */
const ICE_ACCEL = 0.35;
const ICE_DECEL = 0.18;
const GRAVITY = 34;
const FALL_MULT = 1.35;
const CUT_MULT = 2.6;
const MAX_FALL = 26;
const JUMP_SPEED = 12.6;
const DOUBLE_SPEED = 11.4;
/** Gliding (perk): the slowest fall while jump is held. */
const GLIDE_FALL = 3.2;
const COYOTE = 0.12;
const BUFFER = 0.14;
const STEP = 0.45;
const SNAP = 0.4;
const FLIP_TIME = 0.42;
const POUND_HANG = 0.2;
const POUND_V = 28;
const POUND_RADIUS = 2.6;
const SPRING_V = 23;
const STOMP_V = 11;
const STOMP_HELD_V = 14.5;
const INVULNERABLE = 1.6;
export const START_LIVES = 5;
const SPIKE_PERIOD = 2.6;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const ease = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dampAngle = (current: number, target: number, lambda: number, dt: number) => current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));
/** 0 → 1 → 0 over a period, eased at both ends (with a short rest). */
const pingPong = (t: number, period: number, phase: number) => {
  const u = (((t / period + phase) % 1) + 1) % 1;
  const s = u < 0.5 ? u * 2 : 2 - u * 2;
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (s - 0.06) / 0.88)));
};
const lerpV = (out: THREE.Vector3, a: V3, b: V3, t: number) => out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

// --- Public types -------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "dying" | "complete" | "over" | "error";
export type ToastKind = "info" | "star" | "life" | "key" | "checkpoint";

export interface Hud {
  level: number;
  coins: number;
  maxHp: number;
  levelCoins: number;
  lives: number;
  hp: number;
  stars: boolean[];
  key: boolean;
  chest: boolean;
  time: number;
}

/** Which stage: a world and its stage number (0-based). */
export interface StageRef {
  world: string;
  stage: number;
}

/** What the player has on: hero, skin and the world shown on the menu. */
export interface Loadout {
  hero: string;
  skin: string;
  world: string;
}

export interface LevelResult extends StageRef {
  time: number;
  coins: number;
  totalCoins: number;
  stars: boolean[];
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  toast(text: string, kind: ToastKind): void;
  fade(alpha: number): void;
  complete(result: LevelResult): void;
  /** Out of lives: the coins picked up on the way are still saved. */
  over(stage: StageRef, coins: number): void;
  error(message: string): void;
  /** Downloading a hero picked in the shop (0..1), null when done. */
  busy?(ratio: number | null): void;
}

// --- Internal types -----------------------------------------------------------------------------

interface Rig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  /** Skin applied to it. */
  skin: string;
}

interface Coin {
  x: number;
  y: number;
  z: number;
  /** 0 waiting, 1 collected (sparkle-out animation), 2 gone, 3 popping out of a crate. */
  state: number;
  t: number;
  vx: number;
  vy: number;
  vz: number;
  value: number;
}

interface Pickup {
  kind: "star" | "heart" | "key" | "jewel";
  obj: THREE.Object3D;
  glow: THREE.Sprite | null;
  pos: THREE.Vector3;
  star: number;
  taken: boolean;
  t: number;
  /** Rising out of a chest / crate. */
  rise: number;
  /** Flying to the player after rising. */
  homing?: boolean;
}

interface Crate {
  obj: THREE.Object3D;
  box: Box;
  strong: boolean;
  content: "coins" | "heart" | "star";
  star: number;
  broken: boolean;
  pos: THREE.Vector3;
}

interface Spring {
  obj: THREE.Object3D;
  box: Box;
  t: number;
}

interface Spikes {
  obj: THREE.Object3D;
  node: THREE.Object3D | null;
  restY: number;
  timed: boolean;
  phase: number;
  pos: THREE.Vector3;
  up: number;
}

interface Mover {
  obj: THREE.Object3D;
  box: Box;
  path: Path;
  thick: number;
  pos: THREE.Vector3;
}

interface Crumble {
  obj: THREE.Object3D;
  box: Box;
  pos: THREE.Vector3;
  state: "idle" | "shake" | "fall" | "gone" | "back";
  t: number;
  vy: number;
}

interface Saw {
  holder: THREE.Object3D;
  blade: THREE.Object3D;
  path: Path;
  pos: THREE.Vector3;
}

interface SpikeBlock {
  obj: THREE.Object3D;
  path: Path;
  pos: THREE.Vector3;
}

interface Enemy {
  kind: EnemyKind;
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  a: V3;
  b: V3;
  /** Position along the patrol line, 0..1, and its direction. */
  s: number;
  dir: number;
  speed: number;
  len: number;
  pos: THREE.Vector3;
  height: number;
  radius: number;
  hp: number;
  state: "walk" | "turn" | "charge" | "squash" | "dead";
  t: number;
  facing: number;
  flash: number;
}

interface Checkpoint {
  obj: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  pos: THREE.Vector3;
  yaw: number;
  active: boolean;
  t: number;
}

interface Chest {
  obj: THREE.Object3D;
  lock: THREE.Object3D | null;
  mixer: THREE.AnimationMixer;
  open: THREE.AnimationAction | null;
  pos: THREE.Vector3;
  rot: number;
  star: number;
  opened: boolean;
}

/** Instanced copies of one prototype (every mesh inside it), placed by matrix. */
class Instanced {
  readonly meshes: { mesh: THREE.InstancedMesh; rel: THREE.Matrix4 }[] = [];
  private readonly tmp = new THREE.Matrix4();

  constructor(proto: Proto, readonly count: number, parent: THREE.Object3D) {
    proto.object.updateMatrixWorld(true);
    proto.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mesh = new THREE.InstancedMesh(m.geometry, m.material, count);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(mesh);
      this.meshes.push({ mesh, rel: m.matrixWorld.clone() });
    });
  }

  set(i: number, matrix: THREE.Matrix4) {
    for (const { mesh, rel } of this.meshes) mesh.setMatrixAt(i, this.tmp.multiplyMatrices(matrix, rel));
  }

  commit() {
    for (const { mesh } of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const { mesh } of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
  }
}

/** Merges many placed prototypes into one mesh (all Platformer Kit models share one texture). */
function mergeStatic(parts: { proto: Proto; matrix: THREE.Matrix4 }[], material: THREE.Material) {
  const items: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  let vertices = 0;
  let indices = 0;
  for (const { proto, matrix } of parts) {
    proto.object.updateMatrixWorld(true);
    proto.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const geo = m.geometry;
      const n = geo.attributes.position.count;
      vertices += n;
      indices += geo.index ? geo.index.count : n;
      items.push({ geo, matrix: new THREE.Matrix4().multiplyMatrices(matrix, m.matrixWorld) });
    });
  }
  const pos = new Float32Array(vertices * 3);
  const nor = new Float32Array(vertices * 3);
  const uv = new Float32Array(vertices * 2);
  const index = new Uint32Array(indices);
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let vo = 0;
  let io = 0;
  for (const { geo, matrix } of items) {
    const p = geo.attributes.position;
    const nAttr = geo.attributes.normal;
    const uAttr = geo.attributes.uv;
    nm.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(matrix);
      pos.set([v.x, v.y, v.z], (vo + i) * 3);
      if (nAttr) {
        v.set(nAttr.getX(i), nAttr.getY(i), nAttr.getZ(i)).applyMatrix3(nm).normalize();
        nor.set([v.x, v.y, v.z], (vo + i) * 3);
      }
      if (uAttr) uv.set([uAttr.getX(i), uAttr.getY(i)], (vo + i) * 2);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) index[io + i] = geo.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) index[io + i] = vo + i;
    io += geo.index ? geo.index.count : p.count;
    vo += p.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A copy of a material that dissolves (screen-door dither) within a few metres of the camera, so
 * trees and island edges between the camera and the player never block the view.
 */
function fadeNearCamera(source: THREE.Material) {
  const mat = source.clone();
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      {
        float camDist = length(vViewPosition);
        if (camDist < 4.0) {
          // Interleaved gradient noise as the dither threshold.
          float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (smoothstep(1.2, 4.0, camDist) < noise) discard;
        }
      }`,
    );
  };
  mat.customProgramCacheKey = () => "skyhop-fade";
  return mat;
}

/** sRGB bytes → hue (degrees), saturation and lightness (0..1). */
function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number, out: Uint8ClampedArray, i: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  out[i] = f(0) * 255;
  out[i + 1] = f(8) * 255;
  out[i + 2] = f(4) * 255;
}

const hexHsl = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return toHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/**
 * A copy of the kit's colour atlas with its greens (grass, leaves) and earthy browns swapped for a
 * world's colours. Each texel keeps its own light and shade, so the atlas gradients survive.
 */
function recolourAtlas(source: THREE.Texture, green: string | null, earth: string | null) {
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const tex = source.clone();
  if (!ctx) return tex;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = pixels.data;
  const g = green ? hexHsl(green) : null;
  const e = earth ? hexHsl(earth) : null;
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, l] = toHsl(px[i], px[i + 1], px[i + 2]);
    let to: [number, number, number] | null = null;
    let ref = 0.5;
    if (g && s > 0.18 && h >= 75 && h <= 172) {
      to = g;
      ref = 0.55;
    } else if (e && s > 0.15 && s < 0.8 && l > 0.18 && l < 0.78 && (h <= 35 || h >= 345)) {
      to = e;
      ref = 0.5;
    }
    if (to) fromHsl(to[0], to[1], Math.min(0.97, Math.max(0.03, to[2] + (l - ref) * 0.9)), px, i);
  }
  ctx.putImageData(pixels, 0, 0);
  // A clone shares its image source with the original: give the copy its own.
  tex.source = new THREE.TextureSource(canvas);
  tex.needsUpdate = true;
  return tex;
}

const SPIKE_HIDE = -0.26;

// --- Game ---------------------------------------------------------------------------------------

export class SkyHopGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
  private readonly sun = new THREE.DirectionalLight("#fff4df", 2.5);
  private readonly hemi = new THREE.HemisphereLight("#e3f2ff", "#9a8a6a", 1.3);
  private readonly sky = new Sky();
  private readonly clouds = new Clouds();
  private readonly particles = new Particles();
  private readonly snow = new Snow();
  private readonly blob = makeBlobShadow();
  private readonly protos = new Map<string, Proto>();
  private readonly world = new World();
  private readonly levelRoot = new THREE.Group();
  private readonly timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private kitMaterial: THREE.Material | null = null;
  /** The kit material with a dithered fade near the camera, for the merged level. */
  private staticMaterial: THREE.Material | null = null;
  private portrait = false;
  private coarse = false;

  // Player rig: player (feet) → facing (yaw) → squash → flip pivot (mid-height) → holder → characters.
  private readonly player = new THREE.Group();
  private readonly facingNode = new THREE.Group();
  private readonly squashNode = new THREE.Group();
  private readonly flipNode = new THREE.Group();
  private readonly holder = new THREE.Group();
  /** Heroes built so far (each downloaded when first picked), by hero id. */
  private readonly rigs = new Map<string, Rig>();
  private rig: Rig | null = null;
  private readonly models = new Map<string, LoadedModel>();
  private sizes: Record<string, number> = {};
  private heroTicket = 0;
  private readonly keyBadge = new THREE.Group();
  private readonly loadout: Loadout = { hero: HEROES[0].id, skin: SKINS[0].id, world: WORLDS[0].id };
  /** The world being shown (the equipped one on the menu, the stage's own in a stage). */
  private worldDef: WorldDef = WORLDS[0];
  private readonly worldMaterials = new Map<string, { solid: THREE.MeshStandardMaterial; decor: THREE.Material; maps: THREE.Texture[] }>();
  private perks: Perks = BASE_PERKS;
  private maxHp = BASE_PERKS.hearts;
  /** Skin patterns are drawn relative to the hero's feet. */
  private readonly skinOrigin = { value: new THREE.Vector3() };
  /** YouTube's pause: no frames at all. */
  private suspended = false;
  /** The shop covers part of the screen: the menu picture slides into the rest (fractions of the view). */
  private showcase = false;
  private readonly shift = { x: 0, y: 0, cx: 0, cy: 0 };

  /** Trailer: plays itself along the stage's route. */
  autopilot = false;
  /** Trailer: nothing hurts, and a fall puts the hero back on the route. */
  invincible = false;
  /** Trailer: camera distance (below 1 = closer). */
  cinema = 1;
  /** Trailer: times the autopilot had to be put back on its route. */
  rescues = 0;
  private readonly ap = {
    /** Next route point. */
    i: 0,
    wish: new THREE.Vector3(),
    /** Something to land on first: an enemy to stomp, a crate to smash or a spring. */
    aim: null as { kind: "enemy"; enemy: Enemy } | { kind: "crate"; crate: Crate } | { kind: "spring"; spring: Spring } | null,
    rideT: 0,
    lastI: -1,
    stuckT: 0,
  };

  // State.
  private phase: Phase = "loading";
  /** The stage being played: its world and number. */
  private stageWorld = WORLDS[0].id;
  private levelIndex = 0;
  private def: LevelDef = MENU;
  private data: LevelData | null = null;
  private lt = 0;
  private elapsed = 0;
  private lives = START_LIVES;
  private hp = BASE_PERKS.hearts;
  private coinCounter = 0;
  private levelCoins = 0;
  private stars = [false, false, false];
  private hasKey = false;
  private chestOpened = false;
  private respawn = { pos: new THREE.Vector3(), yaw: 0 };
  private dieT = 0;
  private dieCause: "fall" | "hurt" = "fall";
  private completeT = 0;
  private completeSent = false;
  private finaleOn = false;
  private lockedToastT = 0;
  private hud: Hud = { level: 0, coins: 0, maxHp: BASE_PERKS.hearts, levelCoins: 0, lives: START_LIVES, hp: BASE_PERKS.hearts, stars: [false, false, false], key: false, chest: false, time: 0 };
  private fadeValue = 0;

  // Player physics.
  private readonly p = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    grounded: false,
    ground: null as Box | null,
    coyote: 0,
    buffer: 0,
    airJumps: 0,
    jumping: false,
    airT: 0,
    flipT: 0,
    pound: 0,
    poundT: 0,
    landLag: 0,
    hurtT: 0,
    facing: 0,
    sq: 1,
    sqV: 0,
    dustT: 0,
    stepT: 0,
    lastAnim: "",
  };
  private readonly hit: Hit = { y: 0, box: null };
  private readonly normal = { x: 0, z: 0 };

  // Input.
  private readonly keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private jumpHeld = false;
  private touchJumpHeld = false;
  private jumpQueued = false;
  private poundQueued = false;

  // Camera.
  private camYaw = 0;
  private camPitch = 0.4;
  private camDist = 9.5;
  private readonly camTarget = new THREE.Vector3();
  private camRefY = 0;
  /** Height of the ground under the player (null over the void). */
  private groundBelow: number | null = 0;
  private lastManualCam = -10;
  private introT = 1;
  private shake = 0;
  private readonly camPos = new THREE.Vector3();

  // Level entities.
  private staticMesh: THREE.Mesh | null = null;
  private propMesh: THREE.Mesh | null = null;
  private decorMesh: THREE.Mesh | null = null;
  private coinInst: Instanced | null = null;
  private coins: Coin[] = [];
  private pickups: Pickup[] = [];
  private crates: Crate[] = [];
  private springs: Spring[] = [];
  private spikes: Spikes[] = [];
  private movers: Mover[] = [];
  private crumbles: Crumble[] = [];
  private saws: Saw[] = [];
  private spikeBlocks: SpikeBlock[] = [];
  private enemies: Enemy[] = [];
  private checkpoints: Checkpoint[] = [];
  private chests: Chest[] = [];
  private finishObj: THREE.Object3D | null = null;
  private finishPos = new THREE.Vector3();
  private glows: THREE.Sprite[] = [];
  private clonedMaterials: THREE.Material[] = [];
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
    /** In YouTube Playables the SDK pauses the game; the page visibility API must not be used. */
    { visibility = true }: { visibility?: boolean } = {},
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.coarse ? 1.75 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.setupWorld();
    this.scene.add(this.levelRoot, this.player);
    this.player.add(this.facingNode);
    this.facingNode.add(this.squashNode);
    this.squashNode.add(this.flipNode);
    this.flipNode.position.y = HEIGHT / 2;
    this.flipNode.add(this.holder);
    this.holder.position.y = -HEIGHT / 2;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    if (visibility) this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------

  private setupWorld() {
    const { scene } = this;
    scene.fog = new THREE.Fog("#cfe8fb", 70, 260);
    scene.background = new THREE.Color("#cfe8fb");
    this.camera.add(this.sky.mesh);
    scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.4;

    scene.add(this.hemi);
    const { sun } = this;
    sun.castShadow = true;
    const size = this.coarse ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
    scene.add(sun, sun.target);

    scene.add(this.clouds.mesh, this.particles.points, this.snow.points, this.blob);
    this.snow.points.visible = false;
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact; loadout: the equipped hero, skin and world. */
  async load(sizes: Record<string, number>, loadout: Loadout) {
    this.sizes = sizes;
    Object.assign(this.loadout, loadout);
    this.worldDef = findItem(WORLDS, loadout.world);
    // The equipped hero comes with the first load; the others when first picked in the shop.
    let hero = findItem(HEROES, loadout.hero);
    try {
      const models = await loadModels(MODELS.includes(hero.key) ? MODELS : [...MODELS, hero.key], this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      models.forEach((m, k) => this.models.set(k, m));
      if (!models.has(hero.key)) hero = HEROES[0];
      const used = new Set<string>();
      const proto = (id: string, key: string, fit: Fit, opts: { shadows?: boolean; receive?: boolean } = {}) => {
        const m = models.get(key);
        if (!m) return;
        this.protos.set(id, makeProto(used.has(key) ? m.scene.clone() : m.scene, m.animations, fit, opts));
        used.add(key);
      };

      for (const theme of ["grass", "snow"] as const) {
        const set = BLOCKS[theme];
        for (const kind of ["large", "long", "one", "lowLarge", "lowLong", "low", "tall"] as const) proto(`${theme}:${kind}`, set[kind], { scale: U }, { receive: true });
        const trees = theme === "grass" ? [M.tree, M.treePine, M.treePineSmall] : [M.treeSnow, M.treePineSnow, M.treePineSnowSmall];
        proto(`tree:round:${theme}`, trees[0], { scale: U * 1.25 });
        proto(`tree:pine:${theme}`, trees[1], { scale: U * 1.25 });
        proto(`tree:pineSmall:${theme}`, trees[2], { scale: U * 1.25 });
      }
      // Ramps only appear on grass islands.
      proto("ramp:grass", BLOCKS.grass.slope, { box: { x: 2.082 * U, y: 0.759 * 2 * U } }, { receive: true });
      proto("plank", M.plank, { scale: U }, { receive: true });
      proto("fence", M.fence, { scale: U });
      for (const name of ["grass", "flowers", "flowersTall", "mushrooms", "rocks", "stones", "plant", "sign", "arrow", "barrel"] as const) {
        proto(`deco:${name}`, M[name], { scale: U });
      }

      proto("coin", M.coin, { height: 0.75 });
      proto("jewel", M.jewel, { height: 0.8 });
      proto("star", M.star, { height: 1.05 });
      proto("heart", M.heart, { height: 0.8 });
      proto("key", M.key, { width: 1.05 });
      proto("keyBadge", M.key, { width: 0.5 }, { shadows: false });
      proto("lock", M.lock, { height: 0.75 });
      proto("chest", M.chest, { scale: 2.6 });
      proto("flag", M.flag, { height: 2.6 });
      proto("flagBig", M.flag, { height: 4.6 });
      proto("spring", M.spring, { scale: U * 0.95 }, { receive: true });
      proto("spikes", M.spikes, { scale: 2.45 }, { receive: true });
      proto("spikeBlock", M.spikeBlock, { scale: 1.9 });
      proto("saw", M.saw, { height: 1.7 });
      proto("crate", M.crate, { scale: 2.4 }, { receive: true });
      proto("crateItem", M.crateItem, { scale: 2.4 }, { receive: true });
      proto("crateStrong", M.crateStrong, { scale: 2.3 }, { receive: true });
      proto("crumble", M.brick, { box: { x: U, y: U * 0.5, z: U } }, { receive: true });
      proto("mover-2", M.mover, { box: { x: 2 * U, y: 0.7, z: 2 * U } }, { receive: true });
      proto("mover-1", M.mover, { box: { x: U, y: 0.7, z: U } }, { receive: true });
      proto("lift", M.moverBlue, { box: { x: 2 * U, y: 0.8, z: 2 * U } }, { receive: true });
      const enemyHeight: Record<EnemyKind, number> = { crab: 1.2, bee: 1.25, hog: 1.35, penguin: 1.35, polar: 2.0 };
      for (const kind of Object.keys(ENEMIES) as EnemyKind[]) proto(`enemy:${kind}`, ENEMIES[kind], { height: enemyHeight[kind] });

      // The flag model's pole sits off-centre: put the pole on the origin.
      for (const id of ["flag", "flagBig"]) {
        const inner = this.protos.get(id)?.object.children[0]?.children[0];
        if (inner) inner.position.x = 0.056;
      }

      const required = ["grass:large", "grass:long", "grass:one", "coin", "star", "flag", "flagBig"];
      if (!required.every((k) => this.protos.has(k)) || !this.models.has(hero.key)) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      // All Platformer Kit pieces share one texture atlas: the static level is one merged mesh.
      this.protos.get("grass:large")!.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !this.kitMaterial) this.kitMaterial = (o as THREE.Mesh).material as THREE.Material;
      });

      this.buildPlayer();
      this.showHero(hero.id);
      this.loadMenu();
      music.play(SKY_HOP, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private buildPlayer() {
    const badge = this.protos.get("keyBadge");
    if (badge) this.keyBadge.add(badge.object);
    this.keyBadge.add(makeGlow("#ffe680", 0.9));
    this.keyBadge.visible = false;
    this.player.add(this.keyBadge);
  }

  /** One rig per hero, from its own model (every hero has the same set of animations). */
  private makeRig(id: string): Rig | null {
    const def = findItem(HEROES, id);
    const m = this.models.get(def.key);
    if (!m) return null;
    const p = makeProto(m.scene, m.animations, { height: HEIGHT });
    const root = p.object;
    root.visible = false;
    root.traverse((o) => {
      // Skinned bounds don't follow the animation.
      if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map(p.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    this.holder.add(root);
    const rig: Rig = { root, mixer, actions, current: null, skin: "classic" };
    this.rigs.set(def.id, rig);
    return rig;
  }

  private showHero(id: string) {
    const rig = this.rigs.get(id) ?? this.makeRig(id);
    if (!rig) return;
    const was = this.rig?.current?.getClip().name ?? "idle";
    this.loadout.hero = id;
    this.perks = perksOf(findItem(HEROES, id));
    for (const [rid, r] of this.rigs) r.root.visible = rid === id;
    this.rig = rig;
    rig.current = null;
    this.applySkinTo(rig);
    if (this.phase === "menu" || this.phase === "loading") {
      this.play("emote-yes", { once: true, fade: 0.1 });
      this.menuEmoteT = 0.9;
      if (this.phase === "menu") this.sfx.jump();
    } else this.play(was === "emote-yes" ? "idle" : was, { fade: 0 });
  }

  private applySkinTo(rig: Rig) {
    const look = findItem(SKINS, this.loadout.skin).look;
    if (rig.skin === look) return;
    applySkin(rig.root, look, this.skinOrigin);
    rig.skin = look;
  }

  /** The kit's island and leaf materials recoloured for a world (made once per world). */
  private materialsFor(world: WorldDef) {
    const kit = this.kitMaterial as THREE.MeshStandardMaterial;
    const { top, earth, leaves, glow, glowColor } = world.look;
    if (!top && !earth && !leaves) return { solid: kit as THREE.Material, decor: (this.staticMaterial ??= fadeNearCamera(kit)) };
    let made = this.worldMaterials.get(world.id);
    if (!made) {
      const solid = kit.clone();
      const decor = kit.clone();
      if (kit.map) {
        solid.map = recolourAtlas(kit.map, top, earth);
        decor.map = recolourAtlas(kit.map, leaves, null);
      }
      if (glow > 0) {
        // Lava light: the islands glow in their own (recoloured) colours.
        solid.emissive.set(glowColor);
        solid.emissiveIntensity = glow;
        solid.emissiveMap = solid.map;
      }
      made = { solid, decor: fadeNearCamera(decor), maps: [solid.map, decor.map].filter((t): t is THREE.Texture => !!t && t !== kit.map) };
      decor.dispose();
      this.worldMaterials.set(world.id, made);
    }
    return made;
  }

  // --- Public API -------------------------------------------------------------------------------

  /** Shows a hero (downloading it first if needed): the equipped one and shop previews. */
  async setHero(id: string) {
    const def = findItem(HEROES, id);
    const ticket = ++this.heroTicket;
    if (!this.models.has(def.key)) {
      this.events.busy?.(0);
      const loaded = await loadModels([def.key], this.renderer, (p) => this.heroTicket === ticket && this.events.busy?.(p.ratio), { sizes: this.sizes });
      if (this.disposed) return;
      loaded.forEach((m, k) => this.models.set(k, m));
      if (this.heroTicket === ticket) this.events.busy?.(null);
    }
    if (this.heroTicket !== ticket || this.phase === "loading" || !this.models.has(def.key)) return;
    this.showHero(def.id);
  }

  setSkin(id: string) {
    this.loadout.skin = findItem(SKINS, id).id;
    if (this.rig) this.applySkinTo(this.rig);
  }

  /** The world shown on the menu (its colours, sky and weather). */
  setWorld(id: string) {
    const world = findItem(WORLDS, id);
    this.loadout.world = world.id;
    if (world === this.worldDef) return;
    this.worldDef = world;
    if (this.phase === "menu") this.loadMenu();
  }

  /** Shop open or closed; `shift` is how far to slide the picture (fractions of the view). */
  setShowcase(on: boolean, shift = { x: 0, y: 0 }) {
    this.showcase = on;
    this.shift.x = on ? shift.x : 0;
    this.shift.y = on ? shift.y : 0;
  }

  /** The hero cheers (something was bought). */
  celebrate() {
    if (this.phase !== "menu") return;
    audio.unlock();
    this.play("emote-yes", { once: true, fade: 0.1 });
    this.menuEmoteT = 1.1;
    this.sfx.star();
    const p = this.p.pos;
    this.confetti(p.x, p.y + 3, p.z, 70);
  }

  /** Stops every frame (YouTube's pause): nothing runs until it is resumed. */
  setSuspended(on: boolean) {
    if (on === this.suspended || this.disposed) return;
    this.suspended = on;
    if (on) cancelAnimationFrame(this.raf);
    else {
      this.timer.reset();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private menuEmoteT = 0;
  private found = [false, false, false];
  private ghostMaterial: THREE.Material | null = null;

  /** Stars found on an earlier visit are drawn see-through. */
  private ghostStar(obj: THREE.Object3D, index: number) {
    if (!this.found[index]) return;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!this.ghostMaterial) {
        const g = (m.material as THREE.MeshStandardMaterial).clone();
        g.transparent = true;
        g.opacity = 0.42;
        g.depthWrite = false;
        this.ghostMaterial = g;
      }
      m.material = this.ghostMaterial;
      m.castShadow = false;
    });
  }

  /**
   * Starts a stage. `freshLives` resets the lives (starting from the stage map); `found` marks
   * stars collected on earlier visits, which show as see-through ghosts.
   */
  startStage(ref: StageRef, freshLives: boolean, found: boolean[] = [false, false, false]) {
    audio.unlock();
    this.found = found;
    this.worldDef = findItem(WORLDS, ref.world);
    this.stageWorld = this.worldDef.id;
    this.levelIndex = ref.stage;
    if (freshLives) {
      this.lives = START_LIVES + this.perks.lives;
      this.coinCounter = 0;
    }
    this.loadLevel(stageDef(ref.world, ref.stage), stageSeed(ref.world, ref.stage), false);
    this.introT = 0;
    this.sfx.go();
    music.play(SKY_HOP, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setFade(0);
    this.setPhase("playing");
  }

  restartLevel() {
    this.startStage({ world: this.stageWorld, stage: this.levelIndex }, false, this.found);
  }

  /** Back to the last checkpoint without losing a life. */
  toCheckpoint() {
    if (this.phase !== "playing" && this.phase !== "paused") return;
    this.respawnPlayer();
    music.duck(false);
    this.setPhase("playing");
  }

  pause() {
    if (this.phase !== "playing") return;
    this.releaseInput();
    music.duck(true);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    this.releaseInput();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.autopilot = false;
    this.invincible = false;
    this.cinema = 1;
    this.worldDef = findItem(WORLDS, this.loadout.world);
    this.loadMenu();
    music.play(SKY_HOP, 0);
    music.setIntensity(0);
    music.duck(false);
    this.setFade(0);
    this.setPhase("menu");
  }

  setKey(code: string, down: boolean) {
    if (down) {
      if (this.keys.has(code)) return;
      this.keys.add(code);
      if (code === "Space") {
        this.jumpQueued = true;
        this.jumpHeld = true;
      } else if (code === "ShiftLeft" || code === "ShiftRight") this.poundQueued = true;
      else if (code === "KeyR") this.toCheckpoint();
    } else {
      this.keys.delete(code);
      if (code === "Space") this.jumpHeld = false;
    }
  }

  setStick(x: number, y: number) {
    this.stick.x = x;
    this.stick.y = y;
  }

  touchJump(down: boolean) {
    if (down && !this.touchJumpHeld) this.jumpQueued = true;
    this.touchJumpHeld = down;
  }

  touchPound() {
    this.poundQueued = true;
  }

  orbit(dx: number, dy: number) {
    this.camYaw -= dx * 0.0065;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.004, 0.05, 1.15);
    this.lastManualCam = this.elapsed;
  }

  releaseInput() {
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.jumpHeld = false;
    this.touchJumpHeld = false;
    this.jumpQueued = false;
    this.poundQueued = false;
  }

  // --- Trailer ----------------------------------------------------------------------------------

  /**
   * Trailer only: starts a stage straight away (no swoop-in) with the hero at route point `at` (its
   * index — negative counts from the end — or the first point with that act) and the autopilot
   * driving from there.
   */
  jumpTo(ref: StageRef, at: number | RouteNode["act"] = 0) {
    this.startStage(ref, true);
    this.introT = 1;
    const route = this.data?.route ?? [];
    const i = typeof at === "number" ? (at < 0 ? route.length + at : at) : Math.max(0, route.findIndex((n) => n.act === at));
    this.ap.i = Math.min(i, Math.max(0, route.length - 1));
    if (this.ap.i > 0) this.backOnRoute(false);
  }

  /** Trailer only: runs the game this many seconds without drawing. */
  warp(seconds: number) {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      this.elapsed += dt;
      if (this.phase === "playing") this.updatePlaying(dt);
      else if (this.phase === "complete") this.updateComplete(dt);
      if (this.phase !== "playing") this.updateWorld(dt, this.phase !== "menu");
      this.rig?.mixer.update(dt);
      this.updateRig(dt);
      this.particles.update(dt);
      this.updateCamera(dt);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    music.stop();
    this.clearLevel();
    this.keyBadge.traverse((o) => {
      const sprite = o as THREE.Sprite;
      if (!sprite.isSprite) return;
      sprite.material.map?.dispose();
      sprite.material.dispose();
    });
    for (const proto of this.protos.values()) disposeTree(proto.object);
    for (const rig of this.rigs.values()) {
      rig.mixer.stopAllAction();
      disposeTree(rig.root);
    }
    for (const m of this.worldMaterials.values()) {
      m.solid.dispose();
      m.decor.dispose();
      m.maps.forEach((t) => t.dispose());
    }
    this.envTexture?.dispose();
    this.staticMaterial?.dispose();
    this.ghostMaterial?.dispose();
    this.sky.dispose();
    this.clouds.dispose();
    this.particles.dispose();
    this.snow.dispose();
    this.blob.geometry.dispose();
    const blobMat = this.blob.material as THREE.MeshBasicMaterial;
    blobMat.map?.dispose();
    blobMat.dispose();
    this.renderer.dispose();
  }

  // --- State ------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  private setFade(v: number) {
    const q = Math.round(v * 50) / 50;
    if (q === this.fadeValue) return;
    this.fadeValue = q;
    this.events.fade(q);
  }

  // --- Level construction -----------------------------------------------------------------------

  private clearLevel() {
    for (const mesh of [this.staticMesh, this.propMesh, this.decorMesh]) {
      mesh?.geometry.dispose();
      mesh?.removeFromParent();
    }
    this.staticMesh = null;
    this.propMesh = null;
    this.decorMesh = null;
    this.coinInst?.dispose();
    this.coinInst = null;
    for (const g of this.glows) {
      g.material.map?.dispose();
      g.material.dispose();
    }
    this.glows = [];
    for (const m of this.clonedMaterials) m.dispose();
    this.clonedMaterials = [];
    for (const e of this.enemies) e.mixer.stopAllAction();
    for (const c of this.chests) c.mixer.stopAllAction();
    this.levelRoot.clear();
    this.world.clear();
    this.coins = [];
    this.pickups = [];
    this.crates = [];
    this.springs = [];
    this.spikes = [];
    this.movers = [];
    this.crumbles = [];
    this.saws = [];
    this.spikeBlocks = [];
    this.enemies = [];
    this.checkpoints = [];
    this.chests = [];
    this.finishObj = null;
    this.particles.clear();
  }

  private clone(id: string) {
    const proto = this.protos.get(id);
    return proto ? proto.object.clone() : new THREE.Group();
  }

  private glow(color: THREE.ColorRepresentation, size: number) {
    const g = makeGlow(color, size);
    this.glows.push(g);
    return g;
  }

  /** The menu island, in the equipped world's colours. */
  private loadMenu() {
    const world = this.worldDef;
    this.loadLevel({ ...MENU, theme: world.theme, sky: world.look.sky }, 1157, true);
  }

  private loadLevel(def: LevelDef, seed: number, menu: boolean) {
    this.clearLevel();
    this.def = def;
    const data = buildLevel(def, seed);
    this.data = data;
    const theme = data.theme;
    const look = this.worldDef.look;

    // Look: the world's light and weather (the handcrafted levels keep their own skies).
    this.sky.set(def.sky[0], def.sky[1]);
    const fog = new THREE.Color(def.sky[1]);
    (this.scene.fog as THREE.Fog).color.copy(fog);
    (this.scene.background as THREE.Color).copy(fog);
    this.hemi.color.set(look.hemiSky);
    this.hemi.groundColor.set(look.hemiGround);
    this.sun.color.set(def.name === "Sawmill Gorge" ? "#ffd9a8" : look.sun);
    const weather = look.weather ?? (theme === "snow" ? { color: "#ffffff", fall: 1, size: 1, wind: 1.2 } : null);
    this.snow.points.visible = !!weather;
    if (weather) this.snow.setStyle(weather);
    // Snow is bright: a touch less exposure and cooler fill light keep it from washing out.
    this.renderer.toneMappingExposure = theme === "snow" ? Math.min(look.exposure, 0.94) : look.exposure;
    this.hemi.intensity = theme === "snow" ? 1.05 : 1.3;

    // Static pieces → three merged meshes: islands (in the world's colours), wooden planks and
    // fences, and decoration that dissolves near the camera.
    const solid: { proto: Proto; matrix: THREE.Matrix4 }[] = [];
    const props: { proto: Proto; matrix: THREE.Matrix4 }[] = [];
    const decor: { proto: Proto; matrix: THREE.Matrix4 }[] = [];
    for (const pc of data.pieces) {
      const id = pc.id.startsWith("tree:") ? `${pc.id}:${theme}` : pc.id;
      const proto = this.protos.get(id);
      if (!proto) continue;
      this.tmpQ.setFromAxisAngle(this.up, pc.rot);
      this.tmpS.setScalar(pc.scale ?? 1);
      const part = { proto, matrix: new THREE.Matrix4().compose(this.tmpV.set(pc.x, pc.y, pc.z), this.tmpQ, this.tmpS) };
      (pc.id.startsWith("tree:") || pc.id.startsWith("deco:") ? decor : pc.id === "plank" || pc.id === "fence" ? props : solid).push(part);
    }
    if (this.kitMaterial) {
      const mats = this.materialsFor(this.worldDef);
      if (solid.length) {
        this.staticMesh = mergeStatic(solid, mats.solid);
        this.levelRoot.add(this.staticMesh);
      }
      if (props.length) {
        this.propMesh = mergeStatic(props, this.kitMaterial);
        this.levelRoot.add(this.propMesh);
      }
      if (decor.length) {
        this.decorMesh = mergeStatic(decor, mats.decor);
        this.levelRoot.add(this.decorMesh);
      }
    }
    for (const b of data.boxes) {
      this.world.add(
        makeBox(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, { oneWay: !!b.oneWay, slippery: !!b.slippery, camera: !!b.camera, ramp: b.ramp ?? null }),
      );
    }

    // Coins (instanced) with spare slots for coins popping out of crates and enemies.
    const coinProto = this.protos.get("coin");
    const spare = 48;
    if (coinProto) {
      this.coinInst = new Instanced(coinProto, data.coins.length + spare, this.levelRoot);
      this.coins = data.coins.map((c) => ({ x: c.x, y: c.y, z: c.z, state: 0, t: 0, vx: 0, vy: 0, vz: 0, value: 1 }));
      for (let i = 0; i < spare; i++) this.coins.push({ x: 0, y: -999, z: 0, state: 2, t: 0, vx: 0, vy: 0, vz: 0, value: 1 });
    }

    const addPickup = (kind: Pickup["kind"], v: V3, star = -1, rise = 0) => {
      const obj = this.clone(kind);
      obj.position.set(v.x, v.y, v.z);
      this.levelRoot.add(obj);
      let glow: THREE.Sprite | null = null;
      if (kind === "star" || kind === "key") {
        glow = this.glow(kind === "star" ? "#ffd84a" : "#ffe9a0", kind === "star" ? 2.4 : 1.8);
        this.levelRoot.add(glow);
      }
      const p: Pickup = { kind, obj, glow, pos: new THREE.Vector3(v.x, v.y, v.z), star, taken: false, t: Math.random() * 6, rise };
      this.pickups.push(p);
      return p;
    };
    for (const s of data.stars) this.ghostStar(addPickup("star", s, s.index).obj, s.index);
    for (const h of data.hearts) addPickup("heart", h);
    for (const k of data.keys) addPickup("key", k);
    for (const j of data.jewels) addPickup("jewel", j);

    for (const c of data.crates) {
      const id = c.strong ? "crateStrong" : c.content === "heart" ? "crateItem" : "crate";
      const obj = this.clone(id);
      obj.position.set(c.x, c.y, c.z);
      obj.rotation.y = Math.round(Math.random() * 3) * (Math.PI / 2);
      this.levelRoot.add(obj);
      const size = this.protos.get(id)?.size ?? new THREE.Vector3(1.2, 1.2, 1.2);
      const box = this.world.add(makeBox(c.x - size.x / 2, c.y, c.z - size.z / 2, c.x + size.x / 2, c.y + size.y, c.z + size.z / 2));
      const crate: Crate = { obj, box, strong: c.strong, content: c.content, star: c.star, broken: false, pos: new THREE.Vector3(c.x, c.y, c.z) };
      box.tag = crate;
      this.crates.push(crate);
    }

    for (const s of data.springs) {
      const obj = this.clone("spring");
      obj.position.set(s.x, s.y, s.z);
      this.levelRoot.add(obj);
      const size = this.protos.get("spring")?.size ?? new THREE.Vector3(1.4, 0.9, 1.4);
      const box = this.world.add(makeBox(s.x - size.x * 0.42, s.y, s.z - size.z * 0.42, s.x + size.x * 0.42, s.y + size.y * 0.92, s.z + size.z * 0.42));
      const spring: Spring = { obj, box, t: 10 };
      box.tag = spring;
      this.springs.push(spring);
    }

    for (const s of data.spikes) {
      const obj = this.clone("spikes");
      obj.position.set(s.x, s.y + 0.01, s.z);
      this.levelRoot.add(obj);
      let node: THREE.Object3D | null = null;
      obj.traverse((o) => {
        if (o.name === "spikes") node = o;
      });
      const n = node as THREE.Object3D | null;
      this.spikes.push({ obj, node: n, restY: n ? n.position.y : 0, timed: s.timed, phase: s.phase, pos: new THREE.Vector3(s.x, s.y, s.z), up: 1 });
    }

    for (const mv of data.movers) {
      const id = mv.lift ? "lift" : mv.size >= 1.5 ? "mover-2" : "mover-1";
      const obj = this.clone(id);
      this.levelRoot.add(obj);
      const size = this.protos.get(id)?.size ?? new THREE.Vector3(mv.size * U, 0.7, mv.size * U);
      // Stretch the platform model to the requested footprint.
      obj.scale.set((mv.size * U) / size.x, 1, (mv.size * U) / size.z);
      const hx = (mv.size * U) / 2;
      const box = this.world.add(makeBox(-hx, -size.y, -hx, hx, 0, hx, { oneWay: true }));
      const mover: Mover = { obj, box, path: mv, thick: size.y, pos: new THREE.Vector3() };
      box.tag = mover;
      this.movers.push(mover);
    }

    for (const c of data.crumbles) {
      const obj = this.clone("crumble");
      obj.position.set(c.x, c.y - U * 0.5, c.z);
      this.levelRoot.add(obj);
      const box = this.world.add(makeBox(c.x - U / 2, c.y - U * 0.5, c.z - U / 2, c.x + U / 2, c.y, c.z + U / 2, { camera: false }));
      const crumble: Crumble = { obj, box, pos: new THREE.Vector3(c.x, c.y, c.z), state: "idle", t: 0, vy: 0 };
      box.tag = crumble;
      this.crumbles.push(crumble);
    }

    for (const s of data.saws) {
      const holder = new THREE.Group();
      const blade = this.clone("saw");
      // Centre the blade on its holder so it spins in place.
      const h = this.protos.get("saw")?.size.y ?? 1.7;
      const pivot = new THREE.Group();
      blade.position.y = -h / 2;
      pivot.add(blade);
      holder.add(pivot);
      holder.rotation.y = s.axis === "x" ? 0 : Math.PI / 2;
      this.levelRoot.add(holder);
      this.saws.push({ holder, blade: pivot, path: s, pos: new THREE.Vector3() });
    }

    for (const s of data.spikeBlocks) {
      const obj = this.clone("spikeBlock");
      this.levelRoot.add(obj);
      this.spikeBlocks.push({ obj, path: s, pos: new THREE.Vector3() });
    }

    for (const e of data.enemies) {
      const id = `enemy:${e.kind}`;
      const proto = this.protos.get(id);
      if (!proto) continue;
      const obj = proto.object.clone();
      this.levelRoot.add(obj);
      const mixer = new THREE.AnimationMixer(obj);
      const actions = new Map(proto.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
      const len = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
      const enemy: Enemy = {
        kind: e.kind,
        obj,
        mixer,
        actions,
        current: null,
        a: e.a,
        b: e.b,
        s: Math.random() * 0.3,
        dir: 1,
        speed: e.speed,
        len: Math.max(0.01, len),
        pos: new THREE.Vector3(e.a.x, e.a.y, e.a.z),
        height: proto.size.y,
        radius: Math.max(proto.size.x, proto.size.z) * 0.42,
        hp: e.kind === "polar" ? 2 : 1,
        state: "walk",
        t: 0,
        facing: 0,
        flash: 0,
      };
      this.playEnemy(enemy, "walk");
      this.enemies.push(enemy);
    }

    for (const c of data.checkpoints) {
      const obj = this.clone("flag");
      obj.position.set(c.x, c.y, c.z);
      obj.rotation.y = c.yaw + 0.35;
      const materials: THREE.MeshStandardMaterial[] = [];
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.color.set("#7d8796");
        m.material = mat;
        materials.push(mat);
        this.clonedMaterials.push(mat);
      });
      this.levelRoot.add(obj);
      this.checkpoints.push({ obj, materials, pos: new THREE.Vector3(c.x, c.y, c.z), yaw: c.yaw, active: false, t: 10 });
    }

    for (const c of data.chests) {
      const obj = this.clone("chest");
      obj.position.set(c.x, c.y, c.z);
      obj.rotation.y = c.rot;
      this.levelRoot.add(obj);
      const mixer = new THREE.AnimationMixer(obj);
      const clip = this.protos.get("chest")?.animations.find((a) => a.name === "open");
      const open = clip ? mixer.clipAction(clip) : null;
      let lock: THREE.Object3D | null = null;
      if (this.protos.has("lock")) {
        lock = this.clone("lock");
        lock.position.set(c.x, c.y + 1.7, c.z);
        this.levelRoot.add(lock);
      }
      this.chests.push({ obj, lock, mixer, open, pos: new THREE.Vector3(c.x, c.y, c.z), rot: c.rot, star: c.star, opened: false });
    }

    if (!menu) {
      const f = data.finish;
      this.finishPos.set(f.x, f.y, f.z);
      this.finishObj = this.clone("flagBig");
      this.finishObj.position.copy(this.finishPos);
      this.finishObj.rotation.y = 0.35;
      this.levelRoot.add(this.finishObj);
      const g = this.glow("#fff3a0", 3.6);
      g.material.opacity = 0.35;
      g.position.set(f.x, f.y + 2.2, f.z);
      this.levelRoot.add(g);
    }

    // Clouds around the level's extent.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const b of data.boxes) {
      minX = Math.min(minX, b.min.x);
      maxX = Math.max(maxX, b.max.x);
      minZ = Math.min(minZ, b.min.z);
      maxZ = Math.max(maxZ, b.max.z);
    }
    this.clouds.scatter((minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2, data.killY + 6, 1 + (seed % 9973));
    (this.scene.fog as THREE.Fog).near = menu ? 40 : 60;
    (this.scene.fog as THREE.Fog).far = menu ? 200 : 240;
    this.clouds.setFog(fog, menu ? 40 : 60, menu ? 200 : 240);

    // Run state.
    this.lt = 0;
    this.maxHp = this.perks.hearts;
    this.hp = this.maxHp;
    this.ap.i = 0;
    this.ap.aim = null;
    this.ap.rideT = 0;
    this.ap.lastI = -1;
    this.levelCoins = 0;
    this.stars = [false, false, false];
    this.hasKey = false;
    this.chestOpened = false;
    this.finaleOn = false;
    this.completeSent = false;
    this.keyBadge.visible = false;
    this.respawn.pos.set(data.start.x, data.start.y, data.start.z);
    this.respawn.yaw = data.start.yaw;
    this.placePlayer(this.respawn.pos, this.respawn.yaw);
    if (menu) {
      this.p.facing = Math.PI * 0.15;
      this.play("idle", { fade: 0 });
    }
    this.updateMovers(0);
    this.emitHud(true);
  }

  private placePlayer(pos: THREE.Vector3, yaw: number) {
    const p = this.p;
    p.pos.copy(pos);
    p.vel.set(0, 0, 0);
    p.grounded = true;
    p.ground = null;
    p.coyote = 0;
    p.buffer = 0;
    p.airJumps = 0;
    p.jumping = false;
    p.flipT = 0;
    p.pound = 0;
    p.landLag = 0;
    p.facing = yaw + Math.PI;
    p.sq = 1;
    p.sqV = 0;
    this.flipNode.rotation.x = 0;
    this.camYaw = yaw;
    this.camPitch = 0.4;
    this.camTarget.copy(pos);
    this.camRefY = pos.y;
    this.camPos.set(0, 0, 0);
    this.player.visible = true;
    this.play("idle", { fade: 0.1 });
  }

  // --- Animation --------------------------------------------------------------------------------

  private play(name: string, { once = false, fade = 0.15, timeScale = 1 } = {}) {
    const rig = this.rig;
    const next = rig?.actions.get(name);
    if (!rig || !next) return;
    next.timeScale = timeScale;
    if (rig.current === next && !once) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (rig.current && rig.current !== next) next.crossFadeFrom(rig.current, fade, false);
    else if (!rig.current) rig.mixer.stopAllAction();
    next.play();
    rig.current = next;
  }

  private playEnemy(e: Enemy, name: string, timeScale = 1) {
    const next = e.actions.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (e.current === next) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (e.current) next.crossFadeFrom(e.current, 0.15, false);
    next.play();
    e.current = next;
  }

  // --- Frame ------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed || this.suspended) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const live = this.phase !== "paused" && this.phase !== "loading" && this.phase !== "error";

    if (live) {
      this.elapsed += dt;
      if (this.phase === "playing") this.updatePlaying(dt);
      else if (this.phase === "dying") this.updateDying(dt);
      else if (this.phase === "complete") this.updateComplete(dt);
      else if (this.phase === "menu" || this.phase === "over") this.updateMenu(dt);
      if (this.phase !== "playing") this.updateWorld(dt, this.phase !== "menu" && this.phase !== "over");
      this.rig?.mixer.update(dt);
      this.updateRig(dt);
      this.particles.update(dt);
      this.clouds.update(this.elapsed);
    }
    if (this.phase !== "loading" && this.phase !== "error") {
      this.updateCamera(live ? dt : 0);
      this.updateShadowCamera();
      const scale = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
      this.particles.uniforms.scale.value = scale;
      if (this.snow.points.visible) this.snow.update(this.elapsed, this.camera.position, scale);
      shaderTime.value = this.elapsed;
      this.skinOrigin.value.copy(this.player.position);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updateMenu(dt: number) {
    if (this.menuEmoteT > 0) {
      this.menuEmoteT -= dt;
      if (this.menuEmoteT <= 0) this.play("idle", { fade: 0.3 });
    }
    // Face the orbiting camera, glancing a little to the side.
    this.facingNode.rotation.y = this.elapsed * 0.1 + 0.6 - 0.35;
    this.player.position.copy(this.p.pos);
  }

  private updatePlaying(dt: number) {
    this.lt += dt;
    if (this.introT < 1) this.introT = Math.min(1, this.introT + dt / 1.6);
    this.updateWorld(dt, true);
    this.updatePlayer(dt);
    if (this.phase !== "playing") return;
    this.interact();
    if (this.phase !== "playing") return;
    if (this.p.pos.y < (this.data?.killY ?? -50)) this.die("fall");
    if (!this.finaleOn && this.data && -this.p.pos.z > this.data.finale) {
      this.finaleOn = true;
      music.setIntensity(2);
    }
    this.emitHud();
  }

  /** Moving platforms, hazards, enemies, pickups — everything but the player. */
  private updateWorld(dt: number, active: boolean) {
    this.updateMovers(dt);
    this.updateCrumbles(dt);
    this.updateHazards(dt);
    this.updateEnemies(dt, active);
    this.updateCoins(dt);
    this.updatePickups(dt);
    for (const s of this.springs) {
      s.t += dt;
      const k = s.t < 0.5 ? Math.exp(-s.t * 7) * Math.cos(s.t * 30) : 0;
      s.obj.scale.set(1 - k * 0.12, 1 + k * 0.35, 1 - k * 0.12);
    }
    for (const c of this.checkpoints) {
      c.t += dt;
      const k = c.t < 1 ? Math.exp(-c.t * 4) : 0;
      c.obj.scale.setScalar(1 + k * 0.4 * Math.sin(c.t * 18));
      if (c.active) c.obj.rotation.y = c.yaw + 0.35 + Math.sin(this.elapsed * 2.5) * 0.12 + k * Math.PI * 2;
    }
    for (const c of this.chests) {
      c.mixer.update(dt);
      if (c.lock && c.lock.visible) {
        c.lock.position.y = c.pos.y + 1.7 + Math.sin(this.elapsed * 2.5) * 0.12;
        c.lock.rotation.y += dt * 1.5;
      }
    }
    if (this.finishObj) this.finishObj.rotation.y = 0.35 + Math.sin(this.elapsed * 1.8) * 0.15;
  }

  // --- Player -----------------------------------------------------------------------------------

  private moveInput(out: THREE.Vector3) {
    if (this.autopilot) return out.copy(this.ap.wish);
    let ix = this.stick.x;
    let iy = this.stick.y;
    const k = this.keys;
    if (k.has("KeyW") || k.has("ArrowUp")) iy += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) iy -= 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) ix -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) ix += 1;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    const s = Math.sin(this.camYaw);
    const c = Math.cos(this.camYaw);
    // Forward is away from the camera.
    return out.set(ix * c - iy * s, 0, -ix * s - iy * c);
  }

  private jump(v: number, double: boolean) {
    const p = this.p;
    p.vel.y = v;
    p.grounded = false;
    p.ground = null;
    p.coyote = 0;
    p.buffer = 0;
    p.jumping = true;
    p.airT = 0;
    p.sq = 1.28;
    p.sqV = 0;
    if (double) {
      p.airJumps++;
      p.flipT = FLIP_TIME;
      this.sfx.doubleJump();
      this.particles.burst(p.pos.x, p.pos.y + 0.1, p.pos.z, { count: 12, color: "#ffffff", speed: 3.5, ring: true, size: [0.35, 0.8], life: [0.3, 0.5], drag: 5, alpha: 0.8 });
      this.play("jump", { once: true, fade: 0.05 });
    } else {
      this.sfx.jump();
      this.dust(5, 0.6);
      this.play("jump", { once: true, fade: 0.05 });
    }
  }

  private dust(count: number, speed: number) {
    const p = this.p.pos;
    const snow = this.data?.theme === "snow";
    this.particles.burst(p.x, p.y + 0.12, p.z, {
      count,
      color: snow ? ["#ffffff", "#e4ecf7"] : ["#f3e3c3", "#e9d3a8", "#ffffff"],
      speed: speed * 3,
      up: 1.2,
      size: [0.3, 0.75],
      life: [0.35, 0.6],
      drag: 4,
      gravity: -0.5,
      alpha: 0.85,
    });
  }

  private updatePlayer(dt: number) {
    const p = this.p;
    const world = this.world;
    if (this.autopilot) this.drive(dt);
    p.coyote -= dt;
    p.buffer -= dt;
    p.hurtT -= dt;
    p.landLag -= dt;
    p.flipT = Math.max(0, p.flipT - dt);

    // Ride whatever we stand on.
    if (p.grounded && p.ground && p.ground.enabled) {
      p.pos.x += p.ground.dx;
      p.pos.y += p.ground.dy;
      p.pos.z += p.ground.dz;
    }

    // Input → horizontal velocity.
    const wish = this.moveInput(this.tmpV);
    const wishLen = Math.min(1, wish.length());
    const icy = p.grounded && !!p.ground?.slippery;
    const run = RUN_SPEED * this.perks.run;
    if (p.pound) {
      p.vel.x = 0;
      p.vel.z = 0;
    } else if (this.autopilot && !p.grounded) {
      /* the autopilot sets its air speed itself (steerAir) */
    } else {
      let accel: number;
      if (p.grounded) {
        const turning = wishLen > 0.1 && p.vel.x * wish.x + p.vel.z * wish.z < 0;
        accel = wishLen > 0.1 ? ACCEL * (turning ? 1.6 : 1) * (icy ? ICE_ACCEL : 1) : DECEL * (icy ? ICE_DECEL : 1);
        if (p.landLag > 0) accel *= 0.3;
      } else {
        accel = wishLen > 0.1 ? AIR_ACCEL : AIR_DECEL;
      }
      const tx = wish.x * run;
      const tz = wish.z * run;
      const dx = tx - p.vel.x;
      const dz = tz - p.vel.z;
      const d = Math.hypot(dx, dz);
      const step = accel * dt;
      if (d <= step) {
        p.vel.x = tx;
        p.vel.z = tz;
      } else {
        p.vel.x += (dx / d) * step;
        p.vel.z += (dz / d) * step;
      }
    }

    // Jump: ground (with coyote time), double jump, or buffered for the landing.
    if (this.jumpQueued) {
      this.jumpQueued = false;
      if (!p.pound) {
        if (p.grounded || p.coyote > 0) this.jump(JUMP_SPEED * this.perks.jump, false);
        else if (p.airJumps < this.perks.airJumps) this.jump(DOUBLE_SPEED * this.perks.jump, true);
        else p.buffer = BUFFER;
      }
    }
    if (p.buffer > 0 && p.grounded && !p.pound) this.jump(JUMP_SPEED * this.perks.jump, false);

    // Ground pound.
    if (this.poundQueued) {
      this.poundQueued = false;
      if (!p.grounded && !p.pound && p.airT > 0.06) {
        p.pound = 1;
        p.poundT = 0;
        p.vel.set(0, 0, 0);
        p.flipT = 0;
        this.sfx.poundStart();
        this.play("crouch", { fade: 0.05 });
      }
    }

    // Gravity.
    const held = this.jumpHeld || this.touchJumpHeld;
    if (p.pound === 1) {
      p.poundT += dt;
      p.vel.y = 0;
      if (p.poundT >= POUND_HANG) {
        p.pound = 2;
        p.vel.y = -POUND_V;
      }
    } else if (p.pound === 2) {
      p.vel.y = -POUND_V;
    } else if (!p.grounded) {
      let g = GRAVITY;
      if (p.vel.y < 0) g *= FALL_MULT;
      else if (p.jumping && !held) g *= CUT_MULT;
      p.vel.y = Math.max(p.vel.y - g * dt, -MAX_FALL);
      // Gliders (a hero's perk) float down while jump is held.
      if (this.perks.glide && held && p.vel.y < -GLIDE_FALL && p.airT > 0.25) {
        p.vel.y = Math.min(-GLIDE_FALL, p.vel.y + 60 * dt);
        if (Math.random() < dt * 14) this.particles.burst(p.pos.x, p.pos.y + 0.4, p.pos.z, { count: 1, color: ["#ffffff", "#fff6c0"], speed: 0.6, size: [0.25, 0.1], life: [0.3, 0.5], shape: 2 });
      }
    }
    if (!p.grounded) p.airT += dt;

    // Horizontal move in small steps, pushed out of walls.
    const steps = Math.max(1, Math.ceil((Math.max(Math.abs(p.vel.x), Math.abs(p.vel.z)) * dt) / 0.2));
    const stepUp = p.grounded ? STEP : p.vel.y <= 3 ? 0.3 : 0.02;
    for (let i = 0; i < steps; i++) {
      p.pos.x += (p.vel.x * dt) / steps;
      p.pos.z += (p.vel.z * dt) / steps;
      if (world.pushOut(p.pos, RADIUS, HEIGHT, stepUp, this.normal)) {
        const n = Math.hypot(this.normal.x, this.normal.z);
        if (n > 0) {
          const nx = this.normal.x / n;
          const nz = this.normal.z / n;
          const into = p.vel.x * nx + p.vel.z * nz;
          if (into < 0) {
            p.vel.x -= into * nx;
            p.vel.z -= into * nz;
          }
        }
      }
    }

    // Vertical move.
    const prevY = p.pos.y;
    const wasGrounded = p.grounded;
    p.pos.y += p.vel.y * dt;
    if (p.vel.y <= 0) {
      const low = wasGrounded ? p.pos.y - SNAP : p.pos.y - 0.001;
      const high = prevY + (wasGrounded ? STEP : 0.3);
      let found = world.ground(p.pos.x, p.pos.z, FOOT, low, high, prevY, this.hit);
      // Ledge assist: the body just brushed a ledge top while falling towards it — pull up onto it.
      // (Only after a moment in the air and only when moving at the ledge, so you can still step off edges.)
      if (!found && !wasGrounded && !p.pound && p.airT > 0.2 && world.ground(p.pos.x, p.pos.z, RADIUS + 0.15, p.pos.y - 0.001, p.pos.y + 0.5, prevY + 0.5, this.hit) && this.hit.box && !this.hit.box.ramp) {
        const b = this.hit.box;
        const cx = Math.min(Math.max(p.pos.x, b.minX + FOOT), b.maxX - FOOT);
        const cz = Math.min(Math.max(p.pos.z, b.minZ + FOOT), b.maxZ - FOOT);
        const dx = cx - p.pos.x;
        const dz = cz - p.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.01 && (p.vel.x * dx + p.vel.z * dz) / dist > 0.5) {
          const move = Math.min(dist, RADIUS + 0.2);
          p.pos.x += (dx / dist) * move;
          p.pos.z += (dz / dist) * move;
          found = true;
        }
      }
      if (found) {
        const box = this.hit.box;
        const fallSpeed = -p.vel.y;
        p.pos.y = this.hit.y;
        if (!wasGrounded) this.land(box, fallSpeed);
        else {
          p.ground = box;
          p.vel.y = 0;
        }
      } else if (wasGrounded) {
        p.grounded = false;
        p.ground = null;
        p.coyote = COYOTE;
        p.jumping = false;
        p.airT = 0;
      }
    } else {
      p.grounded = false;
      if (world.ceiling(p.pos.x, p.pos.z, FOOT, prevY + HEIGHT, p.pos.y + HEIGHT, this.hit)) {
        p.pos.y = this.hit.y - HEIGHT;
        p.vel.y = 0;
        const crate = this.hit.box?.tag;
        if (crate && this.crates.includes(crate as Crate) && !(crate as Crate).strong) this.breakCrate(crate as Crate);
        else this.sfx.bonk();
      }
    }

    // Bricks start crumbling as soon as you stand on them (landing or walking on).
    const under = p.grounded ? p.ground?.tag : null;
    if (under && this.crumbles.includes(under as Crumble) && (under as Crumble).state === "idle") {
      const c = under as Crumble;
      c.state = "shake";
      c.t = 0;
      this.sfx.crumbleWarn();
    }

    // Footsteps and running dust.
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (p.grounded && speed > 2) {
      p.stepT -= dt * (speed / RUN_SPEED);
      if (p.stepT <= 0) {
        p.stepT = 0.17;
        this.sfx.step();
        if (speed > 5.5) this.dust(2, 0.25);
      }
    }
  }

  private land(box: Box | null, fallSpeed: number) {
    const p = this.p;
    const tag = box?.tag;
    // Ground pound smashes crates and keeps going.
    if (p.pound === 2 && tag && this.crates.includes(tag as Crate)) {
      this.breakCrate(tag as Crate);
      p.vel.y = -POUND_V;
      return;
    }
    if (tag && this.springs.includes(tag as Spring)) {
      const spring = tag as Spring;
      spring.t = 0;
      p.vel.y = SPRING_V;
      p.grounded = false;
      p.ground = null;
      p.jumping = false;
      p.airJumps = 0;
      p.pound = 0;
      p.airT = 0;
      p.sq = 1.35;
      if (this.autopilot && this.data?.route[this.ap.i]?.act === "spring") {
        this.ap.i++;
        this.ap.aim = null;
      }
      this.sfx.spring();
      this.play("jump", { once: true, fade: 0.05 });
      this.particles.burst(p.pos.x, p.pos.y, p.pos.z, { count: 10, color: ["#ffd84a", "#ffffff"], speed: 4, ring: true, size: [0.3, 0.6], life: [0.3, 0.5], shape: 2 });
      return;
    }
    p.grounded = true;
    p.ground = box;
    p.vel.y = 0;
    p.airJumps = 0;
    p.jumping = false;
    p.flipT = 0;
    if (p.pound === 2) {
      p.pound = 0;
      p.landLag = 0.22;
      p.sq = 0.55;
      this.shake = Math.max(this.shake, 0.45);
      this.sfx.pound();
      const snow = this.data?.theme === "snow";
      this.particles.burst(p.pos.x, p.pos.y + 0.1, p.pos.z, {
        count: 26,
        color: snow ? ["#ffffff", "#dbe7f5"] : ["#f3e3c3", "#ffffff", "#d9c49a"],
        speed: 9,
        ring: true,
        up: 1.5,
        size: [0.5, 1.2],
        life: [0.4, 0.7],
        drag: 4,
        alpha: 0.9,
      });
      // Shockwave: stomps enemies nearby.
      for (const e of this.enemies) {
        if (e.state === "dead" || e.state === "squash") continue;
        if (e.pos.distanceTo(p.pos) < POUND_RADIUS + e.radius && Math.abs(e.pos.y - p.pos.y) < 1.5) this.hitEnemy(e, true);
      }
      this.play("idle", { fade: 0.1 });
    } else {
      const hard = Math.min(1, fallSpeed / 22);
      p.sq = 1 - 0.1 - hard * 0.25;
      p.sqV = 0;
      if (fallSpeed > 6) {
        this.sfx.land(hard);
        this.dust(Math.round(4 + hard * 8), 0.5 + hard);
      }
    }
    if (p.buffer > 0) this.jump(JUMP_SPEED * this.perks.jump, false);
  }

  private hurt(fromX: number, fromZ: number) {
    const p = this.p;
    if (p.hurtT > 0 || this.phase !== "playing" || this.invincible) return;
    this.hp--;
    this.sfx.hurt();
    this.shake = Math.max(this.shake, 0.35);
    this.emitHud(true);
    if (this.hp <= 0) {
      this.die("hurt");
      return;
    }
    p.hurtT = INVULNERABLE;
    let dx = p.pos.x - fromX;
    let dz = p.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    p.vel.set(dx * 7, 9, dz * 7);
    p.grounded = false;
    p.ground = null;
    p.pound = 0;
    p.jumping = false;
    p.airJumps = 1;
    this.particles.burst(p.pos.x, p.pos.y + 0.8, p.pos.z, { count: 10, color: ["#ff5a5a", "#ffffff"], speed: 4, size: [0.25, 0.5], life: [0.3, 0.5], shape: 2 });
  }

  private die(cause: "fall" | "hurt") {
    if (this.phase !== "playing") return;
    if (this.invincible) {
      this.backOnRoute(true);
      return;
    }
    this.dieCause = cause;
    this.dieT = 0;
    this.releaseInput();
    if (cause === "hurt") {
      this.play("die", { once: true, fade: 0.05 });
      this.p.vel.set(0, 9, 0);
      this.p.grounded = false;
    } else this.sfx.fall();
    this.sfx.lose();
    music.setIntensity(0);
    this.setPhase("dying");
  }

  private updateDying(dt: number) {
    this.dieT += dt;
    const p = this.p;
    if (this.dieCause === "hurt") {
      // Hop up, then drop through the floor.
      p.vel.y -= GRAVITY * dt;
      if (this.dieT > 0.35) p.pos.y += p.vel.y * dt;
    } else {
      p.vel.y = Math.max(p.vel.y - GRAVITY * dt, -MAX_FALL);
      p.pos.addScaledVector(p.vel, dt);
    }
    this.setFade(Math.min(1, Math.max(0, (this.dieT - 0.6) / 0.5)));
    if (this.dieT > 1.25) {
      this.lives--;
      if (this.lives <= 0) {
        this.lives = 0;
        this.emitHud(true);
        this.setPhase("over");
        this.events.over({ world: this.stageWorld, stage: this.levelIndex }, this.levelCoins);
        this.setFade(0);
        this.p.pos.copy(this.respawn.pos);
        music.play(SKY_HOP, 0);
        music.setIntensity(0);
        this.player.visible = false;
        return;
      }
      this.respawnPlayer();
      this.setPhase("playing");
    }
  }

  private respawnPlayer() {
    this.hp = this.maxHp;
    this.placePlayer(this.respawn.pos, this.respawn.yaw);
    this.p.hurtT = 1;
    this.introT = 0.55;
    // Crumbled bricks come back.
    for (const c of this.crumbles) this.resetCrumble(c);
    music.setIntensity(this.finaleOn ? 2 : 1);
    this.setFade(0);
    this.emitHud(true);
    this.dust(8, 0.6);
  }

  private complete() {
    if (this.phase !== "playing") return;
    this.completeT = 0;
    this.completeSent = false;
    this.releaseInput();
    this.p.vel.set(0, 0, 0);
    this.p.flipT = 0;
    this.p.pound = 0;
    this.sfx.complete();
    music.setIntensity(0);
    this.play("emote-yes", { fade: 0.1 });
    this.setPhase("complete");
    this.confetti(this.finishPos.x, this.finishPos.y + 4.5, this.finishPos.z, 90);
  }

  private confetti(x: number, y: number, z: number, count: number) {
    this.particles.burst(x, y, z, {
      count,
      color: ["#facc15", "#f472b6", "#60a5fa", "#4ade80", "#fb923c", "#ffffff", "#a78bfa"],
      speed: 9,
      up: 6,
      size: [0.32, 0.32],
      life: [1.8, 2.8],
      gravity: 7,
      drag: 1.6,
      shape: 1,
      spread: 1.5,
    });
  }

  private updateComplete(dt: number) {
    this.completeT += dt;
    const p = this.p;
    // Settle onto the ground, face the camera and cheer.
    if (!p.grounded) {
      p.vel.y = Math.max(p.vel.y - GRAVITY * dt, -MAX_FALL);
      p.pos.y += p.vel.y * dt;
      if (this.world.ground(p.pos.x, p.pos.z, FOOT, p.pos.y - 0.01, p.pos.y + 0.5, p.pos.y + 0.5, this.hit)) {
        p.pos.y = this.hit.y;
        p.grounded = true;
        p.vel.y = 0;
      }
    }
    if (Math.floor((this.completeT - dt) / 0.7) !== Math.floor(this.completeT / 0.7) && this.completeT < 3) {
      this.confetti(p.pos.x + rand(-3, 3), p.pos.y + 4 + rand(0, 2), p.pos.z + rand(-3, 3), 40);
    }
    if (this.completeT > 1.5 && !this.completeSent) {
      this.completeSent = true;
      this.events.complete({
        world: this.stageWorld,
        stage: this.levelIndex,
        time: Math.round(this.lt * 10) / 10,
        coins: this.levelCoins,
        totalCoins: this.data ? coinTotal(this.data) : 0,
        stars: [...this.stars],
      });
    }
  }

  // --- Interactions -----------------------------------------------------------------------------

  private interact() {
    const p = this.p;
    const cx = p.pos.x;
    const cy = p.pos.y + HEIGHT / 2;
    const cz = p.pos.z;

    // Coins (a magnet hero pulls in the ones nearby).
    const magnet = this.perks.magnet * this.perks.magnet;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (c.state !== 0) continue;
      const dx = c.x - cx;
      const dy = c.y + 0.37 - cy;
      const dz = c.z - cz;
      if (dx * dx + dz * dz < 1.3 && Math.abs(dy) < 1.15) this.collectCoin(c);
      else if (dx * dx + dy * dy + dz * dz < magnet) {
        c.state = 3;
        c.t = 0.45;
        c.vx = c.vy = c.vz = 0;
      }
    }

    // Pickups.
    for (const k of this.pickups) {
      if (k.taken || k.rise > 0) continue;
      const dy = k.pos.y + 0.4 - cy;
      const dx = k.pos.x - cx;
      const dz = k.pos.z - cz;
      if (dx * dx + dz * dz > 1.4 || Math.abs(dy) > 1.3) continue;
      this.collectPickup(k);
    }

    // Checkpoints.
    for (const c of this.checkpoints) {
      if (c.active) continue;
      if (Math.hypot(c.pos.x - cx, c.pos.z - cz) < 1.7 && Math.abs(c.pos.y - p.pos.y) < 2.5) {
        c.active = true;
        c.t = 0;
        c.materials.forEach((m) => m.color.set("#ffffff"));
        this.respawn.pos.copy(c.pos);
        this.respawn.yaw = c.yaw;
        this.sfx.checkpoint();
        this.events.toast("Checkpoint!", "checkpoint");
        this.particles.burst(c.pos.x, c.pos.y + 2.4, c.pos.z, { count: 30, color: ["#facc15", "#ffffff", "#4ade80"], speed: 5, up: 3, size: [0.25, 0.25], life: [0.8, 1.4], gravity: 6, shape: 1 });
        if (this.hp < this.maxHp) {
          this.hp = this.maxHp;
          this.emitHud(true);
        }
      }
    }

    // Chest.
    for (const c of this.chests) {
      if (c.opened) continue;
      if (Math.hypot(c.pos.x - cx, c.pos.z - cz) > 2.1 || Math.abs(c.pos.y - p.pos.y) > 1.5) continue;
      if (this.hasKey) this.openChest(c);
      else if (this.elapsed - this.lockedToastT > 4) {
        this.lockedToastT = this.elapsed;
        this.sfx.locked();
        this.events.toast("Locked! Find this level's key", "key");
      }
    }

    // Finish.
    if (this.finishObj && Math.hypot(this.finishPos.x - cx, this.finishPos.z - cz) < 1.9 && p.pos.y > this.finishPos.y - 0.5 && p.pos.y < this.finishPos.y + 4.5) {
      this.complete();
      return;
    }

    // Hazards.
    if (p.hurtT <= 0) {
      for (const s of this.spikes) {
        if (s.up < 0.5) continue;
        if (Math.abs(s.pos.x - cx) < 0.78 + RADIUS * 0.4 && Math.abs(s.pos.z - cz) < 0.78 + RADIUS * 0.4 && p.pos.y < s.pos.y + 0.42 && p.pos.y + HEIGHT > s.pos.y) {
          this.hurt(s.pos.x + (cx - s.pos.x) * 0.2, s.pos.z + (cz - s.pos.z) * 0.2 - 0.01);
          return;
        }
      }
      for (const s of this.saws) {
        const dy = Math.max(p.pos.y - s.pos.y, 0, s.pos.y - (p.pos.y + HEIGHT));
        const d = Math.hypot(s.pos.x - cx, s.pos.z - cz, dy);
        if (d < 0.78 + RADIUS * 0.6) {
          this.hurt(s.pos.x, s.pos.z);
          return;
        }
      }
      for (const s of this.spikeBlocks) {
        if (Math.abs(s.pos.x - cx) < 0.95 + RADIUS * 0.6 && Math.abs(s.pos.z - cz) < 0.95 + RADIUS * 0.6 && p.pos.y < s.pos.y + 1.0 && p.pos.y + HEIGHT > s.pos.y - 0.9) {
          this.hurt(s.pos.x, s.pos.z);
          return;
        }
      }
    }

    // Enemies.
    for (const e of this.enemies) {
      if (e.state === "dead" || e.state === "squash") continue;
      const dx = e.pos.x - cx;
      const dz = e.pos.z - cz;
      const reach = e.radius + RADIUS * 0.8;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (p.pos.y > e.pos.y + e.height || p.pos.y + HEIGHT < e.pos.y) continue;
      if ((p.vel.y < 0 && p.pos.y > e.pos.y + e.height * 0.4) || p.pound === 2) {
        this.hitEnemy(e, p.pound === 2);
        if (p.pound !== 2) {
          p.vel.y = this.jumpHeld || this.touchJumpHeld ? STOMP_HELD_V : STOMP_V;
          p.jumping = false;
          p.airJumps = 0;
          p.sq = 1.25;
          p.pos.y = Math.max(p.pos.y, e.pos.y + e.height * 0.6);
        }
      } else if (p.hurtT <= 0) {
        this.hurt(e.pos.x, e.pos.z);
        return;
      }
    }
  }

  private collectCoin(c: Coin) {
    c.state = 1;
    c.t = 0;
    this.addCoins(c.value);
    this.sfx.coin();
    this.particles.burst(c.x, c.y + 0.4, c.z, { count: 5, color: ["#fff6a0", "#ffd84a"], speed: 2.5, size: [0.35, 0.1], life: [0.25, 0.4], shape: 2 });
  }

  private addCoins(n: number) {
    this.levelCoins += n;
    this.coinCounter += n;
    while (this.coinCounter >= 100) {
      this.coinCounter -= 100;
      this.lives++;
      this.sfx.oneUp();
      this.events.toast("1-UP! 100 coins", "life");
    }
    this.emitHud(true);
  }

  private collectPickup(k: Pickup) {
    k.taken = true;
    k.t = 0;
    const p = k.pos;
    if (k.kind === "star") {
      this.stars[k.star] = true;
      this.sfx.star();
      const n = this.stars.filter(Boolean).length;
      this.events.toast(`Star ${n} of 3!`, "star");
      this.particles.burst(p.x, p.y + 0.5, p.z, { count: 26, color: ["#ffd84a", "#fff6c0", "#ffffff"], speed: 6, up: 2, size: [0.5, 0.15], life: [0.5, 0.9], drag: 3, shape: 2 });
    } else if (k.kind === "heart") {
      if (this.hp < this.maxHp) this.hp++;
      else this.addCoins(5);
      this.sfx.heart();
      this.particles.burst(p.x, p.y + 0.4, p.z, { count: 14, color: ["#ff6b81", "#ffffff"], speed: 4, size: [0.4, 0.1], life: [0.4, 0.7], shape: 2 });
    } else if (k.kind === "key") {
      this.hasKey = true;
      this.keyBadge.visible = true;
      this.sfx.key();
      this.events.toast("Key found! Open the chest", "key");
      this.particles.burst(p.x, p.y + 0.4, p.z, { count: 18, color: ["#ffe680", "#ffffff"], speed: 5, size: [0.4, 0.1], life: [0.4, 0.8], shape: 2 });
    } else {
      this.addCoins(5);
      this.sfx.coin();
      this.sfx.heart();
      this.particles.burst(p.x, p.y + 0.4, p.z, { count: 16, color: ["#7aa2ff", "#ffffff"], speed: 5, size: [0.4, 0.1], life: [0.4, 0.7], shape: 2 });
    }
    if (k.glow) k.glow.visible = false;
    this.emitHud(true);
  }

  private openChest(c: Chest) {
    c.opened = true;
    this.chestOpened = true;
    this.hasKey = false;
    this.keyBadge.visible = false;
    this.sfx.chest();
    if (c.open) {
      c.open.reset();
      c.open.setLoop(THREE.LoopOnce, 1);
      c.open.clampWhenFinished = true;
      c.open.play();
    }
    if (c.lock) {
      this.particles.burst(c.lock.position.x, c.lock.position.y, c.lock.position.z, { count: 14, color: ["#ffd84a", "#ffffff"], speed: 4, size: [0.35, 0.1], life: [0.3, 0.6], shape: 2 });
      c.lock.visible = false;
    }
    const star = this.addStarPickup(c.pos.x, c.pos.y + 0.5, c.pos.z, c.star);
    star.rise = 1;
    this.emitHud(true);
  }

  private addStarPickup(x: number, y: number, z: number, index: number) {
    const obj = this.clone("star");
    obj.position.set(x, y, z);
    this.levelRoot.add(obj);
    const glow = this.glow("#ffd84a", 2.4);
    this.levelRoot.add(glow);
    const k: Pickup = { kind: "star", obj, glow, pos: new THREE.Vector3(x, y, z), star: index, taken: false, t: 0, rise: 0 };
    this.pickups.push(k);
    this.ghostStar(obj, index);
    return k;
  }

  private breakCrate(c: Crate) {
    if (c.broken) return;
    c.broken = true;
    c.box.enabled = false;
    c.obj.visible = false;
    this.sfx.crate();
    const { x, y, z } = c.pos;
    const color = c.strong ? ["#9aa3b5", "#d4a373", "#6b7280"] : ["#d4a373", "#b07a48", "#e9c59a"];
    this.particles.burst(x, y + 0.6, z, { count: 22, color, speed: 7, up: 4, size: [0.35, 0.25], life: [0.5, 0.9], gravity: 18, drag: 1.5, shape: 1, spread: 0.8 });
    this.shake = Math.max(this.shake, 0.2);
    if (c.content === "coins") this.popCoins(x, y + 0.8, z, 4);
    else if (c.content === "heart") {
      const obj = this.clone("heart");
      obj.position.set(x, y + 0.3, z);
      this.levelRoot.add(obj);
      this.pickups.push({ kind: "heart", obj, glow: null, pos: new THREE.Vector3(x, y + 0.3, z), star: -1, taken: false, t: 0, rise: 0.6 });
    } else if (c.content === "star") {
      const k = this.addStarPickup(x, y + 0.2, z, c.star);
      k.rise = 1;
    }
  }

  /** Coins that burst out and fly to the player. */
  private popCoins(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const c = this.coins.find((k) => k.state === 2 && k.y === -999) ?? this.coins.find((k) => k.state === 2);
      if (!c) return;
      const a = (i / n) * Math.PI * 2 + Math.random();
      c.x = x;
      c.y = y;
      c.z = z;
      c.vx = Math.cos(a) * 2.5;
      c.vz = Math.sin(a) * 2.5;
      c.vy = 7 + Math.random() * 2;
      c.state = 3;
      c.t = 0;
    }
  }

  private hitEnemy(e: Enemy, pound: boolean) {
    e.hp -= pound ? 2 : 1;
    this.sfx.stomp();
    this.shake = Math.max(this.shake, 0.15);
    if (e.hp > 0) {
      // Big enemies flinch, then get angry.
      e.flash = 0.6;
      e.speed *= 1.6;
      e.obj.scale.set(1.25, 0.6, 1.25);
      this.particles.burst(e.pos.x, e.pos.y + e.height, e.pos.z, { count: 8, color: "#ffffff", speed: 3, size: [0.3, 0.6], life: [0.3, 0.5] });
      return;
    }
    e.state = "squash";
    e.t = 0;
    this.playEnemy(e, "static");
    this.particles.burst(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z, { count: 12, color: ["#ffffff", "#ffe9a0"], speed: 5, size: [0.4, 0.15], life: [0.3, 0.6], shape: 2 });
  }

  // --- Entities ---------------------------------------------------------------------------------

  private updateMovers(dt: number) {
    for (const m of this.movers) {
      const t = pingPong(this.lt, m.path.period, m.path.phase);
      lerpV(m.pos, m.path.a, m.path.b, t);
      moveBoxTo(m.box, m.pos.x, m.pos.y - m.thick / 2, m.pos.z);
      if (dt === 0) {
        m.box.dx = 0;
        m.box.dy = 0;
        m.box.dz = 0;
      }
      m.obj.position.set(m.pos.x, m.pos.y - m.thick, m.pos.z);
    }
  }

  private resetCrumble(c: Crumble) {
    c.state = "idle";
    c.t = 0;
    c.vy = 0;
    c.box.enabled = true;
    c.obj.visible = true;
    c.obj.position.set(c.pos.x, c.pos.y - U * 0.5, c.pos.z);
    c.obj.rotation.set(0, 0, 0);
    c.obj.scale.setScalar(1);
  }

  private updateCrumbles(dt: number) {
    for (const c of this.crumbles) {
      c.t += dt;
      if (c.state === "shake") {
        const k = c.t * 1.6;
        c.obj.position.set(c.pos.x + (Math.random() - 0.5) * 0.12 * k, c.pos.y - U * 0.5, c.pos.z + (Math.random() - 0.5) * 0.12 * k);
        if (c.t > 0.55) {
          c.state = "fall";
          c.t = 0;
          c.box.enabled = false;
          this.sfx.crumble();
          this.particles.burst(c.pos.x, c.pos.y - 0.3, c.pos.z, { count: 16, color: ["#e07a4f", "#c4623d", "#f2a27c"], speed: 4, size: [0.3, 0.25], life: [0.5, 0.9], gravity: 16, shape: 1, spread: 1.6 });
        }
      } else if (c.state === "fall") {
        c.vy -= 30 * dt;
        c.obj.position.y += c.vy * dt;
        c.obj.rotation.x += dt * 1.5;
        c.obj.rotation.z += dt * 0.8;
        if (c.t > 1.2) {
          c.state = "gone";
          c.t = 0;
          c.obj.visible = false;
        }
      } else if (c.state === "gone" && c.t > 2.4) {
        // Pop back in, unless the player is standing in its spot.
        const p = this.p.pos;
        const inside = Math.abs(p.x - c.pos.x) < U / 2 + RADIUS && Math.abs(p.z - c.pos.z) < U / 2 + RADIUS && p.y < c.pos.y + 0.1 && p.y + HEIGHT > c.pos.y - U * 0.5;
        if (!inside) {
          this.resetCrumble(c);
          c.state = "back";
          c.obj.scale.setScalar(0.01);
        }
      } else if (c.state === "back") {
        const k = Math.min(1, c.t / 0.3);
        c.obj.scale.setScalar(0.01 + ease(k) * 0.99);
        if (k >= 1) c.state = "idle";
      }
    }
  }

  private updateHazards(dt: number) {
    for (const s of this.spikes) {
      let up = 1;
      if (s.timed) {
        const u = (((this.lt / SPIKE_PERIOD + s.phase) % 1) + 1) % 1;
        // Up for the first half, with quick transitions and a little warning wiggle.
        up = u < 0.45 ? 1 : u < 0.5 ? 1 - (u - 0.45) / 0.05 : u < 0.92 ? 0 : (u - 0.92) / 0.08;
        if (u > 0.85 && u < 0.92 && s.node) s.node.position.x = Math.sin(this.lt * 60) * 0.01;
      }
      s.up = up;
      if (s.node) s.node.position.y = s.restY + SPIKE_HIDE * (1 - ease(up));
    }
    for (const s of this.saws) {
      const t = pingPong(this.lt, s.path.period, s.path.phase);
      lerpV(s.pos, s.path.a, s.path.b, t);
      s.pos.y += 0.45;
      s.holder.position.copy(s.pos);
      s.blade.rotation.z -= dt * 14;
    }
    for (const s of this.spikeBlocks) {
      const t = pingPong(this.lt, s.path.period, s.path.phase);
      lerpV(s.pos, s.path.a, s.path.b, t);
      s.pos.y += 0.95;
      s.obj.position.set(s.pos.x, s.pos.y - 0.95, s.pos.z);
      s.obj.rotation.y += dt * 1.2;
    }
  }

  private updateEnemies(dt: number, active: boolean) {
    for (const e of this.enemies) {
      e.mixer.update(dt);
      if (e.state === "dead") continue;
      e.t += dt;
      if (e.state === "squash") {
        const k = Math.min(1, e.t / 0.12);
        e.obj.scale.set(1 + k * 0.4, 1 - k * 0.75, 1 + k * 0.4);
        if (e.t > 0.45) {
          e.state = "dead";
          e.obj.visible = false;
          this.particles.burst(e.pos.x, e.pos.y + 0.3, e.pos.z, { count: 14, color: ["#ffffff", "#f3f4f6"], speed: 4, up: 1, size: [0.6, 1.1], life: [0.4, 0.6], drag: 4 });
          this.popCoins(e.pos.x, e.pos.y + 0.6, e.pos.z, 1);
        }
        continue;
      }
      if (!active) continue;
      // Polar bears flash after the first hit.
      e.flash = Math.max(0, e.flash - dt);
      const sq = e.obj.scale;
      sq.x = damp(sq.x, 1, 10, dt);
      sq.y = damp(sq.y, 1, 10, dt);
      sq.z = damp(sq.z, 1, 10, dt);

      const ax = e.b.x - e.a.x;
      const az = e.b.z - e.a.z;
      let speed = e.speed;
      // Hogs charge when you are in front of them on their patrol line.
      if (e.kind === "hog") {
        const px = this.p.pos.x - e.pos.x;
        const pz = this.p.pos.z - e.pos.z;
        const ahead = (px * ax + pz * az) / e.len * e.dir;
        const side = Math.abs((px * az - pz * ax) / e.len);
        const charging = ahead > 0 && ahead < 8 && side < 1.6 && Math.abs(this.p.pos.y - e.pos.y) < 1.5;
        if (charging && e.state !== "charge") {
          e.state = "charge";
          this.playEnemy(e, "run", 1.3);
        } else if (!charging && e.state === "charge") {
          e.state = "walk";
          this.playEnemy(e, "walk");
        }
        if (e.state === "charge") speed *= 2.6;
      }
      if (e.state === "turn") {
        if (e.t > 0.45) {
          e.state = "walk";
          this.playEnemy(e, e.kind === "penguin" ? "run" : "walk");
        }
      } else {
        e.s += (speed * dt * e.dir) / e.len;
        if (e.s >= 1 || e.s <= 0) {
          e.s = Math.min(1, Math.max(0, e.s));
          e.dir *= -1;
          e.state = "turn";
          e.t = 0;
          this.playEnemy(e, "idle");
        }
      }
      e.pos.set(e.a.x + ax * e.s, e.a.y, e.a.z + az * e.s);
      if (e.kind === "bee") e.pos.y += Math.sin(this.elapsed * 2.4 + e.a.x) * 0.4;
      const face = Math.atan2(ax * e.dir, az * e.dir);
      e.facing = dampAngle(e.facing, face, 8, dt);
      e.obj.position.copy(e.pos);
      e.obj.rotation.y = e.facing;
      e.obj.visible = e.flash <= 0 || Math.floor(e.flash * 16) % 2 === 0;
    }
  }

  private updateCoins(dt: number) {
    const inst = this.coinInst;
    if (!inst) return;
    const spin = this.elapsed * 3;
    const p = this.p.pos;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      let s = 1;
      let y = c.y;
      let rot = spin + c.x * 0.25 + c.z * 0.25;
      if (c.state === 1) {
        c.t += dt;
        const k = c.t / 0.25;
        if (k >= 1) {
          c.state = 2;
          s = 0;
        } else {
          s = 1 - k * 0.6;
          y += k * 1.2;
          rot += k * 12;
        }
      } else if (c.state === 2) s = 0;
      else if (c.state === 3) {
        c.t += dt;
        if (c.t < 0.45) {
          c.vy -= 22 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
        } else {
          // Home in on the player.
          const k = 1 - Math.exp(-dt * (6 + c.t * 14));
          c.x += (p.x - c.x) * k;
          c.y += (p.y + 0.5 - c.y) * k;
          c.z += (p.z - c.z) * k;
          if (c.t > 0.9 || Math.hypot(p.x - c.x, p.y + 0.5 - c.y, p.z - c.z) < 0.6) {
            if (this.phase === "playing" || this.phase === "complete") this.collectCoin(c);
            else c.state = 2;
          }
        }
        y = c.y;
        rot = spin * 3;
      }
      this.tmpQ.setFromAxisAngle(this.up, rot);
      this.tmpM.compose(this.tmpV.set(c.x, y, c.z), this.tmpQ, this.tmpS.setScalar(s));
      inst.set(i, this.tmpM);
    }
    inst.commit();
  }

  private updatePickups(dt: number) {
    for (const k of this.pickups) {
      k.t += dt;
      if (k.taken) {
        const a = Math.min(1, k.t / 0.35);
        k.obj.scale.setScalar(Math.max(0.001, (1 - a) * (1 + a)));
        k.obj.position.y = k.pos.y + a * 1.5;
        k.obj.rotation.y += dt * 20;
        if (a >= 1) k.obj.visible = false;
        continue;
      }
      if (k.rise > 0) {
        k.rise = Math.max(0, k.rise - dt * 1.4);
        k.pos.y += dt * 2.2 * (k.rise + 0.2);
        if (k.rise === 0 && k.kind === "star") k.homing = true;
      } else if (k.homing && this.phase === "playing") {
        // Stars from chests and crates fly to you after popping out.
        const p = this.p.pos;
        const f = 1 - Math.exp(-dt * (3 + k.t * 4));
        k.pos.x += (p.x - k.pos.x) * f;
        k.pos.y += (p.y + 0.3 - k.pos.y) * f;
        k.pos.z += (p.z - k.pos.z) * f;
      }
      const bob = Math.sin(k.t * 2.6) * 0.15;
      k.obj.position.set(k.pos.x, k.pos.y + bob, k.pos.z);
      k.obj.rotation.y += dt * (k.kind === "star" ? 2.2 : 1.6);
      if (k.glow) {
        k.glow.position.set(k.pos.x, k.pos.y + bob + 0.5, k.pos.z);
        k.glow.material.opacity = 0.45 + Math.sin(k.t * 4) * 0.12;
      }
    }
  }

  // --- Player visuals ---------------------------------------------------------------------------

  private updateRig(dt: number) {
    const p = this.p;
    this.player.position.copy(p.pos);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (this.phase === "playing" || this.phase === "dying") {
      if (speed > 0.4 && !p.pound) p.facing = dampAngle(p.facing, Math.atan2(p.vel.x, p.vel.z), 14, dt);
    } else if (this.phase === "complete") {
      // Turn to the camera to celebrate.
      p.facing = dampAngle(p.facing, this.camYaw, 6, dt);
    }
    if (this.phase !== "menu" && this.phase !== "over") this.facingNode.rotation.y = p.facing;

    // Squash & stretch spring.
    p.sqV += (1 - p.sq) * 260 * dt;
    p.sqV *= Math.exp(-16 * dt);
    p.sq += p.sqV * dt;
    const sq = THREE.MathUtils.clamp(p.sq, 0.5, 1.5);
    const w = 1 / Math.sqrt(sq);
    this.squashNode.scale.set(w, sq, w);

    // Flips: double jump (front flip) and the ground-pound wind-up.
    if (p.pound === 1) this.flipNode.rotation.x = ease(Math.min(1, p.poundT / POUND_HANG)) * Math.PI * 2;
    else if (p.flipT > 0) this.flipNode.rotation.x = ease(1 - p.flipT / FLIP_TIME) * Math.PI * 2;
    else this.flipNode.rotation.x = 0;

    // Animation state.
    if (this.phase === "playing") {
      let anim: string;
      if (p.pound) anim = "crouch";
      else if (p.grounded) anim = speed < 0.5 ? "idle" : speed < 4.8 ? "walk" : "sprint";
      else anim = p.vel.y > 0 ? "jump" : "fall";
      if (anim === "walk") this.play("walk", { timeScale: Math.max(0.6, speed / 3.2) });
      else if (anim === "sprint") this.play("sprint", { timeScale: Math.max(0.8, speed / 6.5) });
      else if (anim !== p.lastAnim) {
        if (anim === "jump") {
          /* jump is started by jump() */
        } else this.play(anim, { fade: anim === "fall" ? 0.25 : 0.12 });
      }
      p.lastAnim = anim;
    }

    // Hurt flicker.
    const flicker = this.phase === "playing" && p.hurtT > 0 && Math.floor(p.hurtT * 14) % 2 === 0;
    this.holder.visible = !flicker;

    // Key carried above the head.
    if (this.keyBadge.visible) {
      this.keyBadge.position.set(Math.sin(this.elapsed * 2) * 0.15, HEIGHT + 0.55 + Math.sin(this.elapsed * 3) * 0.06, 0);
      this.keyBadge.rotation.y += dt * 2;
    }

    // Blob shadow on the ground below.
    const showBlob = this.player.visible && (this.phase === "playing" || this.phase === "complete" || this.phase === "paused" || this.phase === "menu");
    this.groundBelow = this.world.ground(p.pos.x, p.pos.z, 0.05, -Infinity, p.pos.y + 0.05, p.pos.y + 0.05, this.hit) ? this.hit.y : null;
    if (showBlob && this.groundBelow !== null) {
      const h = p.pos.y - this.hit.y;
      const k = THREE.MathUtils.clamp(1 - h / 10, 0.35, 1);
      this.blob.visible = true;
      this.blob.position.set(p.pos.x, this.hit.y + 0.03, p.pos.z);
      this.blob.scale.setScalar(1.15 * k);
      (this.blob.material as THREE.MeshBasicMaterial).opacity = 0.9 * k;
    } else this.blob.visible = false;
  }

  // --- Camera -----------------------------------------------------------------------------------

  private readonly look = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();

  private updateCamera(dt: number) {
    const p = this.p;
    const portrait = this.portrait;
    const cam = this.camera;
    let yaw = this.camYaw;
    let pitch = this.camPitch;
    let dist = (portrait ? 11 : this.camDist) * this.cinema;
    let fov = portrait ? 70 : 58;
    const target = this.camTarget;

    if (this.phase === "menu" || this.phase === "over") {
      yaw = this.elapsed * 0.1 + 0.6;
      pitch = 0.22;
      dist = portrait ? 9.5 : 6.2;
      // The shop: closer, with the hero in the middle of the picture (the view itself slides aside).
      if (this.showcase) dist = portrait ? 7 : 5.2;
      dist *= this.cinema;
      target.set(p.pos.x, p.pos.y, p.pos.z);
      this.look.set(target.x, target.y + (portrait ? 1.5 : 1.0) - (this.showcase && portrait ? 0.5 : 0), target.z);
      // On wide screens, frame the character to the right of the menu.
      if (!portrait && !this.showcase) {
        const s = Math.sin(yaw);
        const c = Math.cos(yaw);
        this.look.x -= c * 1.6;
        this.look.z += s * 1.6;
      }
      this.desired.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + 0.6 + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
      if (dt === 0 || this.camPos.lengthSq() === 0) this.camPos.copy(this.desired);
      else this.camPos.lerp(this.desired, 1 - Math.exp(-4 * dt));
      cam.position.copy(this.camPos);
      cam.lookAt(this.look);
      this.setFov(fov);
      this.applyShift(dt);
      return;
    }

    // Manual turning (Q / E).
    if (dt > 0 && this.phase === "playing") {
      const turn = (this.keys.has("KeyQ") ? 1 : 0) - (this.keys.has("KeyE") ? 1 : 0);
      if (turn) {
        this.camYaw += turn * 2.3 * dt;
        this.lastManualCam = this.elapsed;
      }
      // Gently swing behind the player while running, unless the camera was just turned by hand.
      const speed = Math.hypot(p.vel.x, p.vel.z);
      if (this.elapsed - this.lastManualCam > 1.4 && p.grounded && speed > 3) {
        const vx = p.vel.x / speed;
        const vz = p.vel.z / speed;
        const fx = -Math.sin(this.camYaw);
        const fz = -Math.cos(this.camYaw);
        const along = fx * vx + fz * vz;
        const want = Math.atan2(-vx, -vz);
        const rate = (this.autopilot ? 2.2 : 1.1) * Math.min(1, speed / RUN_SPEED) * THREE.MathUtils.clamp(along + 0.35, 0, 1);
        this.camYaw = dampAngle(this.camYaw, want, rate, dt);
      }
      yaw = this.camYaw;
    }

    // Follow: x/z tightly; height follows the ground the player stands on (so jumps don't bob).
    if (this.phase !== "dying" || this.dieCause === "hurt") {
      // Falling into the void: hold the camera up so you watch yourself drop away.
      const floorY = this.groundBelow ?? -Infinity;
      const followDown = p.grounded || this.phase === "complete" || floorY > this.camRefY - 30;
      if (p.grounded || this.phase === "complete") this.camRefY = damp(this.camRefY, p.pos.y, 6, dt);
      else if (p.pos.y < this.camRefY - 0.3 && followDown) this.camRefY = damp(this.camRefY, Math.max(p.pos.y, floorY), 6, dt);
      target.x = damp(target.x, p.pos.x, 12, dt);
      target.z = damp(target.z, p.pos.z, 12, dt);
      // Normal jumps leave the camera height alone; springs and big falls pull it along.
      const wantY = Math.max(this.camRefY, p.pos.y - 1.8);
      target.y = damp(target.y, Math.min(wantY, p.pos.y + 0.5), wantY > this.camRefY ? 6 : 8, dt);
    }

    if (this.phase === "complete") {
      const k = ease(Math.min(1, this.completeT / 1.2));
      dist = dist * (1 - 0.35 * k);
      pitch = pitch * (1 - k) + 0.18 * k;
    }
    const intro = 1 - ease(this.introT);
    dist += intro * 14;
    pitch += intro * 0.5;

    const lookY = target.y + 1.3;
    this.look.set(target.x, lookY, target.z);
    const cp = Math.cos(pitch);
    const dirX = Math.sin(yaw) * cp;
    const dirY = Math.sin(pitch);
    const dirZ = Math.cos(yaw) * cp;
    // Pull in when an island is in the way.
    const hitT = this.world.raycast(this.look.x, this.look.y, this.look.z, dirX, dirY, dirZ, dist);
    const d = hitT < dist ? Math.max(1.6, hitT - 0.5) : dist;
    this.desired.set(this.look.x + dirX * d, this.look.y + dirY * d, this.look.z + dirZ * d);
    if (dt === 0 && this.camPos.lengthSq() > 0) {
      /* paused: hold still */
    } else if (this.camPos.lengthSq() === 0) this.camPos.copy(this.desired);
    else this.camPos.lerp(this.desired, 1 - Math.exp(-(hitT < dist ? 18 : 10) * dt));

    this.shake = damp(this.shake, 0, 7, dt);
    const s = this.shake;
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z + (Math.random() - 0.5) * s);
    cam.lookAt(this.look);
    if (this.phase === "complete") fov -= 4;
    this.setFov(fov);
    this.applyShift(dt);
  }

  /** The shop covers part of the screen: slide the picture into the rest. */
  private applyShift(dt: number) {
    const sh = this.shift;
    const menu = this.phase === "menu";
    if (dt > 0) {
      sh.cx = damp(sh.cx, menu ? sh.x : 0, 6, dt);
      sh.cy = damp(sh.cy, menu ? sh.y : 0, 6, dt);
    } else if (!menu) sh.cx = sh.cy = 0;
    const el = this.renderer.domElement;
    const w = el.width;
    const h = el.height;
    if (Math.abs(sh.cx) + Math.abs(sh.cy) > 1e-3) this.camera.setViewOffset(w, h, -sh.cx * w, sh.cy * h, w, h);
    else if (this.camera.view) this.camera.clearViewOffset();
  }

  private setFov(fov: number) {
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 6, 1 / 60);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateShadowCamera() {
    const t = this.p.pos;
    // Snap to whole texels so the shadows don't shimmer.
    const texel = 48 / this.sun.shadow.mapSize.x;
    const x = Math.round(t.x / texel) * texel;
    const z = Math.round(t.z / texel) * texel;
    this.sun.target.position.set(x, t.y, z);
    this.sun.position.set(x + 18, t.y + 34, z + 12);
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
  }

  // --- Trailer autopilot ------------------------------------------------------------------------

  /** Walks towards a point (slowing down to stop on it when `stop`). */
  private steerTo(x: number, z: number, stop = false) {
    const p = this.p.pos;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return this.ap.wish.set(0, 0, 0);
    const m = stop ? Math.min(1, d / 1.4) : 1;
    return this.ap.wish.set((dx / d) * m, 0, (dz / d) * m);
  }

  /** Where the autopilot wants to land: what it aims at, the platform it boards, or the route point. */
  private apTarget(out: THREE.Vector3) {
    const ap = this.ap;
    const aim = ap.aim;
    if (aim?.kind === "enemy" && aim.enemy.state !== "dead" && aim.enemy.state !== "squash") return out.set(aim.enemy.pos.x, aim.enemy.pos.y + aim.enemy.height * 0.55, aim.enemy.pos.z);
    if (aim?.kind === "crate" && !aim.crate.broken) return out.set(aim.crate.pos.x, aim.crate.box.maxY, aim.crate.pos.z);
    if (aim?.kind === "spring") return out.set(aim.spring.box.minX / 2 + aim.spring.box.maxX / 2, aim.spring.box.maxY, aim.spring.box.minZ / 2 + aim.spring.box.maxZ / 2);
    ap.aim = null;
    const node = this.data?.route[ap.i];
    if (!node) return null;
    if (node.act === "ride") {
      const m = this.movers[node.mover ?? -1];
      if (m) return out.set(m.pos.x, m.pos.y, m.pos.z);
    }
    return out.set(node.x, node.y, node.z);
  }

  /** In the air: picks the speed that lands on the target, double-jumping when it is too far or too high. */
  private steerAir(dt: number) {
    const p = this.p;
    const t = this.apTarget(this.tmpV);
    if (!t) return;
    const dx = t.x - p.pos.x;
    const dz = t.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    const vy = p.vel.y;
    const canDouble = p.airJumps < this.perks.airJumps && !p.pound && vy < 2.5 && vy > -6;
    const apex = vy > 0 ? p.pos.y + (vy * vy) / (2 * GRAVITY) : p.pos.y;
    let left: number;
    if (apex < t.y + 0.15) {
      if (canDouble) this.jumpQueued = true;
      left = Math.max(0.05, vy > 0 ? vy / GRAVITY : 0.05);
    } else left = (vy > 0 ? vy / GRAVITY : 0) + Math.sqrt((2 * (apex - t.y)) / (GRAVITY * FALL_MULT));
    const run = RUN_SPEED * this.perks.run;
    // A long way to go: double jump near the top for the extra air time (and the flip).
    if (dist / Math.max(left, 0.05) > run * 1.2 && canDouble && vy < 1.5) this.jumpQueued = true;
    const speed = Math.min(dist / Math.max(left, 0.08), run * 1.6);
    const k = 1 - Math.exp(-14 * dt);
    const vx = dist > 0.05 ? (dx / dist) * speed : 0;
    const vz = dist > 0.05 ? (dz / dist) * speed : 0;
    p.vel.x += (vx - p.vel.x) * k;
    p.vel.z += (vz - p.vel.z) * k;
    if (this.ap.aim?.kind === "crate" && dist < 0.4 && vy < 2 && p.airT > 0.15 && !p.pound) this.poundQueued = true;
  }

  /** Something worth landing on just ahead: an enemy to stomp or a crate to smash. */
  private aimAhead(toX: number, toZ: number) {
    const p = this.p.pos;
    const fx = toX - p.x;
    const fz = toZ - p.z;
    const fl = Math.hypot(fx, fz) || 1;
    const ahead = (x: number, z: number, reach: number) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      return d < reach && (d < 1.6 || (dx * fx + dz * fz) / (d * fl) > 0.35);
    };
    for (const e of this.enemies) {
      if (e.state === "dead" || e.state === "squash" || Math.abs(e.pos.y - p.y) > 1.2) continue;
      if (ahead(e.pos.x, e.pos.z, 4.4)) {
        this.ap.aim = { kind: "enemy", enemy: e };
        return true;
      }
    }
    for (const c of this.crates) {
      if (c.broken || Math.abs(c.pos.y - p.y) > 0.4) continue;
      if (ahead(c.pos.x, c.pos.z, 3.2)) {
        this.ap.aim = { kind: "crate", crate: c };
        return true;
      }
    }
    return false;
  }

  /** The trailer's autopilot: follows the stage's route, stomping enemies and smashing crates on the way. */
  private drive(dt: number) {
    const p = this.p;
    const ap = this.ap;
    const route = this.data?.route;
    ap.wish.set(0, 0, 0);
    // Jump held: full-height jumps.
    this.jumpHeld = true;
    if (!route?.length || ap.i >= route.length) return;
    if (ap.i !== ap.lastI) {
      ap.lastI = ap.i;
      ap.stuckT = 0;
    } else ap.stuckT += dt;
    const node = route[ap.i];
    // Waiting for a slow platform and riding it take a while.
    const patience = node.act === "ride" ? 6 + (this.movers[node.mover ?? -1]?.path.period ?? 4) * 2 : 8;
    if (ap.stuckT > patience || (!p.grounded && p.vel.y < 0 && p.pos.y < Math.min(node.y, this.respawn.pos.y) - 7)) {
      this.backOnRoute(true);
      return;
    }
    if (!p.grounded) {
      this.steerAir(dt);
      return;
    }
    ap.aim = ap.aim?.kind === "spring" ? ap.aim : null;
    const mover = node.act === "ride" ? this.movers[node.mover ?? -1] : undefined;
    const d = Math.hypot(node.x - p.pos.x, node.z - p.pos.z);

    if (mover && p.ground === mover.box) {
      // Riding: stay in the middle until the platform reaches its far end (and the next one is ready).
      ap.rideT += dt;
      this.steerTo(mover.pos.x, mover.pos.z, true);
      const next = route[ap.i + 1];
      const nextMover = next?.act === "ride" ? this.movers[next.mover ?? -1] : undefined;
      const exit = node.exit ?? node;
      const atExit = Math.hypot(mover.pos.x - exit.x, mover.pos.y - exit.y, mover.pos.z - exit.z) < 0.9;
      const ready = !nextMover || !next.enter || Math.hypot(nextMover.pos.x - next.enter.x, nextMover.pos.y - next.enter.y, nextMover.pos.z - next.enter.z) < 1.4;
      if (ap.rideT > 0.5 && atExit && ready) {
        ap.i++;
        ap.rideT = 0;
        this.jumpQueued = true;
      }
      return;
    }
    ap.rideT = 0;

    switch (node.act) {
      case "run":
      case "jump": {
        if (this.aimAhead(node.x, node.z)) {
          this.jumpQueued = true;
          return;
        }
        this.steerTo(node.x, node.z, node.act === "jump");
        if (d < (node.act === "jump" ? 0.6 : 0.9)) {
          ap.i++;
          if (node.act === "jump") this.jumpQueued = true;
        }
        break;
      }
      case "spring": {
        if (d > 3 && this.aimAhead(node.x, node.z)) {
          this.jumpQueued = true;
          return;
        }
        const spring = this.springs.find((s) => Math.hypot((s.box.minX + s.box.maxX) / 2 - node.x, (s.box.minZ + s.box.maxZ) / 2 - node.z) < 1);
        this.steerTo(node.x, node.z, true);
        if (spring && d < 2.6) {
          ap.aim = { kind: "spring", spring };
          this.jumpQueued = true;
        } else if (!spring) ap.i++;
        break;
      }
      case "ride": {
        if (!mover) {
          ap.i++;
          break;
        }
        if (d > 1.5 && this.aimAhead(node.x, node.z)) {
          this.jumpQueued = true;
          return;
        }
        // Wait at the edge until the platform comes, then hop on.
        this.steerTo(node.x, node.z, true);
        const enter = node.enter ?? node;
        const here = Math.hypot(mover.pos.x - enter.x, mover.pos.y - enter.y, mover.pos.z - enter.z) < 0.9;
        if (here && d < 1.2) this.jumpQueued = true;
        break;
      }
    }
  }

  /**
   * Puts the hero back on the route (the autopilot fell or got stuck, or a trailer shot starts part-way):
   * on the last route point that stands on solid ground, facing the next one.
   */
  private backOnRoute(rescue: boolean) {
    const route = this.data?.route;
    if (!route?.length) {
      if (rescue) this.respawnPlayer();
      return;
    }
    let i = Math.min(this.ap.i, route.length - 1);
    while (i > 0 && (route[i].act === "ride" || (i > 0 && route[i - 1].act === "ride" && route[i].act !== "run"))) i--;
    const at = route[i];
    const next = route[Math.min(i + 1, route.length - 1)];
    const yaw = Math.atan2(-(next.x - at.x), -(next.z - at.z)) || 0;
    this.placePlayer(this.tmpS.set(at.x, at.y, at.z), next === at ? this.respawn.yaw : yaw);
    this.p.hurtT = 0;
    this.ap.i = i;
    this.ap.aim = null;
    this.ap.rideT = 0;
    this.ap.stuckT = 0;
    if (rescue) {
      this.rescues++;
      this.dust(10, 0.7);
    }
  }

  // --- HUD --------------------------------------------------------------------------------------

  private emitHud(force = false) {
    const next: Hud = {
      level: this.levelIndex,
      coins: this.coinCounter,
      maxHp: this.maxHp,
      levelCoins: this.levelCoins,
      lives: this.lives,
      hp: this.hp,
      stars: this.stars,
      key: this.hasKey,
      chest: this.chestOpened,
      time: Math.floor(this.lt * 10) / 10,
    };
    const h = this.hud;
    if (
      !force &&
      h.time === next.time &&
      h.coins === next.coins &&
      h.lives === next.lives &&
      h.hp === next.hp &&
      h.maxHp === next.maxHp &&
      h.key === next.key &&
      h.level === next.level &&
      h.chest === next.chest
    )
      return;
    next.stars = [...this.stars];
    this.hud = next;
    this.events.hud(next);
  }
}
