import * as CANNON from "cannon-es";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeTree, loadModels, makeProto, Pool, type Fit, type LoadProgress, type Proto } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { SIEGE_FOLK } from "../shared/songs";
import { Sfx } from "./audio";
import { DEBRIS_COLORS, Debris, Dots, Flashes, Popups, Puffs } from "./fx";
import { LEVELS, ammoTotal, layout, starsFor, type LevelDef, type Placed, type PlacedDefender } from "./levels";
import { MODELS } from "./manifest";
import { createWorld, FIXED_STEP, GRAVITY, materialFor, shapeFor, type PhysicsMaterials } from "./physics";
import {
  AMMO,
  AMMO_ORDER,
  DEFENDER_HALF,
  DEFENDER_MASS,
  DEFENDER_SCORE,
  DEFENDERS,
  MODEL,
  PIECES,
  SPLIT_MASS,
  SPLIT_RADIUS,
  type AmmoKind,
  type DefenderKind,
  type PieceDef,
  type PieceKind,
} from "./pieces";

// --- Tuning (metres, seconds) -------------------------------------------------------------------

const HILL_H = 2.4;
const TREB_HEIGHT = 4.6;
const LAUNCH_ELEVATION = 0.74;
const V_MIN = 11;
const V_MAX = 27;
const YAW_LIMIT = 0.55;
const ARM_LOADED = 0.55;
const ARM_RELEASE = -1.2;
const ARM_END = -2.5;
const ARM_REST = -1.85;
const RELOAD_TIME = 0.9;
const SHOT_BONUS = 10000;
const KO_DROP = 1.5;
const MAX_SHOTS_KEPT = 7;
const BOMB_RADIUS = 3.8;
const BOMB_POWER = 11;
const KEG_RADIUS = 3.3;
const KEG_POWER = 9;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const dampAngle = (current: number, target: number, lambda: number, dt: number) => {
  const d = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + d * (1 - Math.exp(-lambda * dt));
};
const clamp = THREE.MathUtils.clamp;
/** Deterministic pseudo-random numbers (scenery layout). */
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// --- Public types -------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "won" | "lost" | "error";
export type Stage = "intro" | "aim" | "swing" | "flight" | "settle" | "done";

export interface Hud {
  level: number;
  score: number;
  defenders: number;
  total: number;
  ammo: Record<AmmoKind, number>;
  selected: AmmoKind;
  shotsUsed: number;
  shotsLeft: number;
  stage: Stage;
  power: number;
  /** Aim in degrees left (-) / right (+) of the castle. */
  angle: number;
  aiming: boolean;
  canSplit: boolean;
}

export interface LevelResult {
  level: number;
  won: boolean;
  score: number;
  bonus: number;
  stars: number;
  shotsUsed: number;
  remaining: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  hud(hud: Hud): void;
  phase(phase: Phase): void;
  result(r: LevelResult): void;
  error(message: string): void;
}

// --- Internal types -----------------------------------------------------------------------------

interface Part {
  key: string;
  obj: THREE.Object3D;
}

interface Block {
  type: "block";
  kind: PieceKind;
  def: PieceDef;
  body: CANNON.Body;
  holder: THREE.Group;
  parts: Part[];
  hp: number;
  alive: boolean;
  wrecked: boolean;
  start: THREE.Vector3;
  toppled: boolean;
  creaked: boolean;
  /** Seconds until it explodes (powder kegs set off by a blast). */
  fuse: number;
}

interface Defender {
  type: "defender";
  kind: DefenderKind;
  body: CANNON.Body;
  holder: THREE.Group;
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  hp: number;
  state: "alive" | "ko" | "gone";
  t: number;
  startY: number;
  yaw: number;
}

interface Shot {
  type: "shot";
  kind: AmmoKind;
  body: CANNON.Body;
  part: Part;
  radius: number;
  age: number;
  impacted: boolean;
  fragment: boolean;
  dead: boolean;
}

type Entity = Block | Defender | Shot;

interface Hit {
  self: CANNON.Body;
  other: CANNON.Body;
  speed: number;
  point: THREE.Vector3;
}

interface RegionLook {
  skyTop: string;
  horizon: string;
  fog: [number, number];
  grass: string[];
  dirt: string;
  far: string;
  sun: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  exposure: number;
  trees: number;
}

const LOOKS: RegionLook[] = [
  {
    skyTop: "#4f9be0",
    horizon: "#d4ebf6",
    fog: [70, 280],
    grass: ["#7dbb57", "#6daa4c", "#8ac763", "#76b452"],
    dirt: "#c9b07c",
    far: "#93c46d",
    sun: "#fff3dc",
    sunIntensity: 2.7,
    sunPos: [-26, 42, 18],
    hemiSky: "#e3f2ff",
    hemiGround: "#6d8a4a",
    hemi: 1.15,
    exposure: 1.02,
    trees: 1,
  },
  {
    skyTop: "#587b8f",
    horizon: "#b8cbc6",
    fog: [34, 175],
    grass: ["#5f8455", "#557a4e", "#6b905d", "#4f704a"],
    dirt: "#8a7f62",
    far: "#6d8f68",
    sun: "#e6efff",
    sunIntensity: 1.9,
    sunPos: [22, 30, 26],
    hemiSky: "#cfe0e6",
    hemiGround: "#4c5e46",
    hemi: 1.25,
    exposure: 1.0,
    trees: 0.6,
  },
  {
    skyTop: "#4a5ea6",
    horizon: "#f7c88f",
    fog: [70, 270],
    grass: ["#a1b35a", "#91a64f", "#adbd64", "#98ac56"],
    dirt: "#d0a96c",
    far: "#b4b866",
    sun: "#ffcf91",
    sunIntensity: 3.0,
    sunPos: [-34, 20, -30],
    hemiSky: "#ffe2c0",
    hemiGround: "#7a6a45",
    hemi: 1.05,
    exposure: 1.04,
    trees: 0.85,
  },
];

const KEY_HOLD = new Set(["KeyA", "KeyD", "KeyW", "KeyS", "KeyQ", "KeyE", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

// --- Game ---------------------------------------------------------------------------------------

export class SiegeSmashGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.1, 700);
  private readonly sun = new THREE.DirectionalLight("#fff3e0", 2.6);
  private readonly hemi = new THREE.HemisphereLight("#dff0ff", "#7d8a66", 1.2);
  private readonly skyUniforms = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  private ground: THREE.Mesh | null = null;
  private readonly castleRoot = new THREE.Group();
  private readonly sceneryRoot = new THREE.Group();
  private readonly fxRoot = new THREE.Group();
  private readonly protos = new Map<string, Proto>();
  private readonly pool: Pool;
  private readonly timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private portrait = false;
  private readonly coarse: boolean;
  private viewW = 1;
  private viewH = 1;

  // Physics
  private readonly world: CANNON.World;
  private readonly mats: PhysicsMaterials;
  private readonly entities = new Map<CANNON.Body, Entity>();
  private hits: Hit[] = [];
  /** Bodies that woke up this step: they wake whatever touches them, so a hit structure moves as a whole. */
  private woken: CANNON.Body[] = [];

  // Effects
  private readonly debris: Debris;
  private readonly puffs: Puffs;
  private readonly flashes: Flashes;
  private readonly popups: Popups;
  private readonly aimDots: Dots;
  private readonly trailDots: Dots;
  private readonly marker: THREE.Mesh;

  // Trebuchet
  private readonly treb = new THREE.Group();
  private arm: THREE.Object3D | null = null;
  private bucket: THREE.Object3D | null = null;
  private armAngle = ARM_LOADED;
  private armVel = 0;
  private armMode: "loaded" | "swing" | "follow" | "reload" = "loaded";
  private armT = 0;
  private readonly loadedProjectile = new THREE.Group();
  private readonly release = new THREE.Vector3();
  private readonly bucketLocal = new THREE.Vector3();

  // Level state
  private phase: Phase = "loading";
  private stage: Stage = "intro";
  private stageT = 0;
  private levelIndex = 0;
  private level: LevelDef = LEVELS[0];
  private region = -1;
  private readonly origin = new THREE.Vector3();
  private blocks: Block[] = [];
  private defenders: Defender[] = [];
  private shots: Shot[] = [];
  /** Projectiles of the current throw (the splitter becomes three). */
  private active: Shot[] = [];
  private ammo: Record<AmmoKind, number> = { boulder: 0, bomb: 0, splitter: 0 };
  private selected: AmmoKind = "boulder";
  private shotsUsed = 0;
  private score = 0;
  private finished = false;
  private finishT = 0;
  private quietT = 0;
  private lastFocus = new THREE.Vector3();
  private trail: THREE.Vector3[] = [];
  private trailT = 0;
  private prevTrail: THREE.Vector3[] = [];
  private splitDone = false;
  private bigCollapseT = 0;
  private creaks = 0;

  // Aim
  private aimYaw = 0;
  private power = 0.5;
  private drag: { id: number; x: number; y: number; startYaw: number; startPower: number; moved: boolean; t: number } | null = null;
  private readonly keys = new Set<string>();
  private keyHeld = 0;

  // Camera
  private readonly camTarget = new THREE.Vector3();
  private camYaw = 0;
  private camPitch = 0.35;
  private camDist = 30;
  private readonly wantTarget = new THREE.Vector3();
  private wantYaw = 0;
  private wantPitch = 0.35;
  private wantDist = 30;
  private camLambda = 3;
  private orbit = 0;
  private zoom = 1;
  private shake = 0;
  private timeScale = 1;
  private slowmo = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; x: number; zoom: number; orbit: number } | null = null;
  private orbitDrag: { x: number; orbit: number } | null = null;
  private elapsed = 0;

  private hud: Hud | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.coarse = coarse;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.75 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const physics = createWorld();
    this.world = physics.world;
    this.mats = physics.mats;

    this.setupWorld(coarse);
    this.pool = new Pool(this.protos, this.castleRoot);
    this.scene.add(this.castleRoot, this.sceneryRoot, this.fxRoot, this.treb, this.loadedProjectile);
    this.debris = new Debris(this.fxRoot);
    this.puffs = new Puffs(this.fxRoot);
    this.flashes = new Flashes(this.fxRoot);
    this.popups = new Popups(this.fxRoot);
    this.aimDots = new Dots(this.fxRoot, 64, "#f7fee7", 1, 0.1);
    this.trailDots = new Dots(this.fxRoot, 120, "#fefce8", 0.45, 0.08);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.85, 32),
      new THREE.MeshBasicMaterial({ color: "#bef264", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.marker.renderOrder = 3;
    this.marker.visible = false;
    this.fxRoot.add(this.marker);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.fog = new THREE.Fog("#d4ebf6", 70, 280);
    scene.background = new THREE.Color("#d4ebf6");

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyUniforms,
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.5)), 1.0); }",
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.camera.add(sky);
    scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.42;

    scene.add(this.hemi);
    const { sun } = this;
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
  }

  /** Procedural terrain: flat battlefield, the trebuchet's hill, rolling hills further out. */
  private buildGround(look: RegionLook) {
    if (this.ground) {
      this.ground.geometry.dispose();
      (this.ground.material as THREE.Material).dispose();
      this.ground.removeFromParent();
    }
    const geo = new THREE.PlaneGeometry(520, 520, 130, 130);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute("position");
    const colors = new Float32Array(pos.count * 3);
    const grass = look.grass.map((c) => new THREE.Color(c));
    const dirt = new THREE.Color(look.dirt);
    const far = new THREE.Color(look.far);
    const c = new THREE.Color();
    const D = this.level.distance;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Distance from the line of fire (trebuchet → castle), which must stay flat.
      const along = clamp(-z, -6, D + 18);
      const off = Math.hypot(x, -z - along);
      const mask = THREE.MathUtils.smoothstep(off, 26, 70);
      const rolling = (Math.sin(x * 0.045) * Math.cos(z * 0.038) + Math.sin(x * 0.021 + z * 0.017) * 1.3 + 1.2) * 5.5;
      const r = Math.hypot(x, z - 2);
      const hill = HILL_H * (1 - THREE.MathUtils.smoothstep(r, 5.2, 15));
      const y = hill + rolling * mask;
      pos.setY(i, y);
      const n = Math.sin(x * 0.7) * Math.cos(z * 0.6) + Math.sin(x * 0.23 + z * 0.31);
      c.copy(grass[Math.abs(Math.floor(n * 2.3 + x * 0.05)) % grass.length]);
      // Trampled earth around the castle and on the hill top.
      const castleR = Math.hypot(x * 0.8, z + D);
      const worn = Math.max(1 - THREE.MathUtils.smoothstep(castleR, 6, 13), (1 - THREE.MathUtils.smoothstep(r, 2.5, 6)) * 0.8);
      c.lerp(dirt, worn * (0.55 + 0.25 * Math.sin(x * 1.3 + z)));
      c.lerp(far, mask * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    mesh.receiveShadow = true;
    this.ground = mesh;
    this.scene.add(mesh);
  }

  private applyRegion(region: number) {
    const look = LOOKS[region] ?? LOOKS[0];
    this.skyUniforms.top.value.set(look.skyTop);
    this.skyUniforms.horizon.value.set(look.horizon);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(look.horizon);
    fog.near = look.fog[0];
    fog.far = look.fog[1];
    (this.scene.background as THREE.Color).set(look.horizon);
    this.sun.color.set(look.sun);
    this.sun.intensity = look.sunIntensity;
    this.hemi.color.set(look.hemiSky);
    this.hemi.groundColor.set(look.hemiGround);
    this.hemi.intensity = look.hemi;
    this.renderer.toneMappingExposure = look.exposure;
    this.buildGround(look);
    this.buildScenery(region, look);
    this.region = region;
  }

  /** Shadows cover the trebuchet and the castle. */
  private aimSun() {
    const look = LOOKS[Math.max(0, this.region)];
    const D = this.level.distance;
    const mid = new THREE.Vector3(0, 0, -D * 0.55);
    const dir = new THREE.Vector3(...look.sunPos).normalize();
    this.sun.position.copy(mid).addScaledVector(dir, 60);
    this.sun.target.position.copy(mid);
    const cam = this.sun.shadow.camera;
    const half = D * 0.5 + 14;
    Object.assign(cam, { left: -half, right: half, top: half, bottom: -half, near: 5, far: 130 });
    cam.updateProjectionMatrix();
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>, firstLevel: number) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const used = new Set<string>();
      const proto = (key: string, fit: Fit, opts?: { shadows?: boolean; receive?: boolean }, protoKey = key) => {
        const m = models.get(key);
        if (!m) return;
        this.protos.set(protoKey, makeProto(used.has(key) ? m.scene.clone() : m.scene, m.animations, fit, opts));
        used.add(key);
      };

      for (const [kind, raw] of Object.entries(PIECES)) {
        const def: PieceDef = raw;
        const [x, y, z] = def.size;
        proto(def.model, { box: { x, y, z } }, { receive: true }, `piece:${kind}`);
        if (def.wreck) proto(def.wreck, { width: x * 1.05 }, { receive: true }, `wreck:${kind}`);
      }
      for (const [kind, def] of Object.entries(DEFENDERS)) proto(def.model, { height: def.height }, undefined, `def:${kind}`);
      for (const [kind, def] of Object.entries(AMMO)) proto(def.model, { width: def.radius * 2.1 }, undefined, `ammo:${kind}`);
      proto(AMMO.splitter.model, { width: SPLIT_RADIUS * 2.1 }, undefined, "ammo:fragment");
      proto(MODEL.trebuchet, { height: TREB_HEIGHT }, { receive: true });
      proto(MODEL.flag, { height: 1.5 });
      proto(MODEL.banner, { height: 1.15 });
      proto(MODEL.flagWide, { height: 2.6 });
      proto(MODEL.bannerLong, { height: 3.4 });
      proto(MODEL.treeLarge, { height: 7 }, { receive: true });
      proto(MODEL.treeSmall, { height: 5 }, { receive: true });
      proto(MODEL.rocksLarge, { width: 4 }, { receive: true });
      proto(MODEL.rocksSmall, { width: 2.6 }, { receive: true });
      proto(MODEL.trunk, { height: 1.2 }, { receive: true });
      proto(MODEL.catapult, { width: 4 }, { receive: true });
      proto(MODEL.ram, { width: 4.6 }, { receive: true });
      proto(MODEL.siegeTower, { height: 6.4 }, { receive: true });

      const required = [MODEL.trebuchet, "piece:block", "def:orc", "ammo:boulder"];
      if (!required.every((k) => this.protos.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      this.buildTrebuchet();
      this.showLevel(firstLevel);
      music.play(SIEGE_FOLK, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private buildTrebuchet() {
    const proto = this.protos.get(MODEL.trebuchet)!;
    const model = proto.object;
    this.treb.add(model);
    model.traverse((o) => {
      if (o.name === "arm") this.arm = o;
    });
    // The file carries a second, static copy of the sling and the weight beside the arm's own — hide it.
    model.traverse((o) => {
      if ((o.name.startsWith("catapult") || o.name.startsWith("weight")) && o.parent !== this.arm) o.visible = false;
    });
    this.bucket = this.arm?.children.find((c) => c.name.startsWith("catapult")) ?? null;
    // The cup's centre, in the bucket's own space.
    if (this.bucket) {
      const box = new THREE.Box3().setFromObject(this.bucket, true);
      const centre = box.getCenter(new THREE.Vector3());
      centre.y = box.max.y - (box.max.y - box.min.y) * 0.25;
      this.bucket.updateWorldMatrix(true, false);
      this.bucketLocal.copy(this.bucket.worldToLocal(centre));
    }
    this.treb.position.set(0, HILL_H, 0);
  }

  // --- Scenery ----------------------------------------------------------------------------------

  private scenery: Part[] = [];

  private buildScenery(region: number, look: RegionLook) {
    for (const p of this.scenery) this.pool.release(p.key, p.obj);
    this.scenery = [];
    const place = (key: string, x: number, z: number, rotY = 0, scale = 1) => {
      if (!this.protos.has(key)) return;
      const obj = this.pool.get(key, this.sceneryRoot);
      obj.position.set(x, this.groundHeight(x, z), z);
      obj.rotation.y = rotY;
      obj.scale.setScalar(scale);
      this.scenery.push({ key, obj });
    };
    const rnd = seeded(97 + region * 31);
    const D = this.level.distance;
    // Forest around the field, kept off the line of fire.
    const lite = this.coarse ? 0.6 : 1;
    const count = Math.round(52 * look.trees * lite);
    for (let i = 0; i < count; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * (16 + rnd() * 70);
      const z = 30 - rnd() * (D + 120);
      const tree = region === 1 && rnd() < 0.35 ? MODEL.trunk : rnd() < 0.55 ? MODEL.treeLarge : MODEL.treeSmall;
      place(tree, x, z, rnd() * 6.28, 0.8 + rnd() * 0.6);
    }
    // A backdrop of trees behind the castle.
    for (let i = 0; i < Math.round(20 * look.trees * lite); i++) {
      const x = -40 + rnd() * 80;
      const z = -D - 24 - rnd() * 40;
      place(rnd() < 0.6 ? MODEL.treeLarge : MODEL.treeSmall, x, z, rnd() * 6.28, 0.9 + rnd() * 0.7);
    }
    for (let i = 0; i < 16; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      place(rnd() < 0.5 ? MODEL.rocksLarge : MODEL.rocksSmall, side * (13 + rnd() * 40), 10 - rnd() * (D + 40), rnd() * 6.28, 0.7 + rnd() * 0.8);
    }
    // The attackers' camp around the hill.
    place(MODEL.catapult, -8.5, 3.5, 0.4 - Math.PI / 2);
    place(MODEL.ram, 9, 5, -Math.PI / 2 + 0.2);
    place(MODEL.siegeTower, -12, 10, -0.3);
    place(MODEL.flagWide, 3.6, 4.6, -Math.PI / 2);
    place(MODEL.flagWide, -3.8, 4.2, -Math.PI / 2);
    place(MODEL.rocksSmall, 5.5, 3.5, 1);
  }

  /** Terrain height (matches buildGround). */
  private groundHeight(x: number, z: number) {
    const D = this.level.distance;
    const along = clamp(-z, -6, D + 18);
    const off = Math.hypot(x, -z - along);
    const mask = THREE.MathUtils.smoothstep(off, 26, 70);
    const rolling = (Math.sin(x * 0.045) * Math.cos(z * 0.038) + Math.sin(x * 0.021 + z * 0.017) * 1.3 + 1.2) * 5.5;
    const r = Math.hypot(x, z - 2);
    return HILL_H * (1 - THREE.MathUtils.smoothstep(r, 5.2, 15)) + rolling * mask;
  }

  // --- Public API -------------------------------------------------------------------------------

  /** Builds a level's castle for the menu backdrop (no play). */
  showLevel(index: number) {
    this.buildLevel(index);
    this.stage = "done";
    this.camLambda = 2;
    this.emitHud(true);
  }

  startLevel(index: number) {
    audio.unlock();
    this.buildLevel(index);
    this.stage = "intro";
    this.stageT = 0;
    // Start close on the castle, then sweep back to the trebuchet.
    this.camTarget.set(this.origin.x, 2.5, this.origin.z);
    this.camYaw = this.orbit + 0.9;
    this.camPitch = 0.28;
    this.camDist = 15;
    this.camLambda = 1.4;
    music.play(SIEGE_FOLK, 1);
    music.duck(false);
    this.setPhase("playing");
    this.emitHud(true);
  }

  restart() {
    this.startLevel(this.levelIndex);
  }

  toMenu() {
    this.drag = null;
    this.showLevel(this.levelIndex);
    music.play(SIEGE_FOLK, 0);
    music.duck(false);
    this.setPhase("menu");
  }

  pause() {
    if (this.phase !== "playing") return;
    this.drag = null;
    this.keys.clear();
    this.sfx.flight(0);
    music.duck(true);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  get currentLevel() {
    return this.levelIndex;
  }

  selectAmmo(kind: AmmoKind) {
    if (this.phase !== "playing") return;
    if (this.ammo[kind] <= 0) {
      this.sfx.denied();
      return;
    }
    if (this.selected === kind) return;
    this.selected = kind;
    this.sfx.select();
    this.loadProjectileMesh();
    this.emitHud(true);
  }

  /** Keyboard: game keys only (M, N, H, F, P and Esc belong to the shared shortcuts). */
  key(code: string, down: boolean, repeat = false) {
    if (KEY_HOLD.has(code)) {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      return true;
    }
    if (!down || repeat || this.phase !== "playing") return false;
    if (code === "Space") {
      this.action();
      return true;
    }
    if (code === "Digit1" || code === "Digit2" || code === "Digit3") {
      const kind = AMMO_ORDER[Number(code.slice(5)) - 1];
      if (this.stage === "aim" || this.stage === "intro" || this.stage === "settle") this.selectAmmo(kind);
      return true;
    }
    return false;
  }

  /** Space / tap: fire, split, or skip the wait. */
  private action() {
    if (this.phase !== "playing") return;
    if (this.stage === "intro") this.endIntro();
    else if (this.stage === "aim") this.fire();
    else if (this.stage === "flight") this.trySplit();
    else if (this.stage === "settle" && this.stageT > 0.9 && !this.finished) this.endShot();
  }

  pointerDown(id: number, x: number, y: number, button: number) {
    audio.unlock();
    this.pointers.set(id, { x, y });
    if (this.pointers.size >= 2) {
      // Two fingers: camera gesture (cancels an aim drag).
      this.drag = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, zoom: this.zoom, orbit: this.orbit };
      return;
    }
    if (button === 2 || button === 1) {
      this.orbitDrag = { x, orbit: this.orbit };
      return;
    }
    if (this.phase !== "playing") return;
    if (this.stage === "intro") {
      this.endIntro();
      return;
    }
    if (this.stage === "aim") {
      this.drag = { id, x, y, startYaw: this.aimYaw, startPower: this.power, moved: false, t: 0 };
      this.emitHud(true);
    } else this.action();
  }

  pointerMove(id: number, x: number, y: number) {
    const p = this.pointers.get(id);
    if (p) {
      p.x = x;
      p.y = y;
    }
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      this.zoom = clamp(this.pinch.zoom * (this.pinch.dist / Math.max(20, dist)), 0.55, 1.7);
      this.orbit = this.pinch.orbit - ((mx - this.pinch.x) / this.viewW) * 3;
      return;
    }
    if (this.orbitDrag) {
      this.orbit = this.orbitDrag.orbit - ((x - this.orbitDrag.x) / this.viewW) * 3;
      return;
    }
    const d = this.drag;
    if (!d || d.id !== id || this.stage !== "aim") return;
    const dx = x - d.x;
    const dy = y - d.y;
    const unit = Math.min(this.viewW, this.viewH);
    if (!d.moved && Math.hypot(dx, dy) > 10) d.moved = true;
    if (!d.moved) return;
    // Pull back (down) for power; pull sideways to swing the aim the other way, like a sling.
    this.power = clamp(dy / (unit * 0.42), 0, 1);
    this.aimYaw = clamp(-(dx / unit) * 0.9, -YAW_LIMIT, YAW_LIMIT);
  }

  pointerUp(id: number) {
    this.pointers.delete(id);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.orbitDrag = null;
    const d = this.drag;
    if (!d || d.id !== id) return;
    this.drag = null;
    if (this.stage !== "aim" || this.phase !== "playing") return;
    if (!d.moved || this.power < 0.04) {
      // A tap, or dragged back to the start: cancel and keep the previous aim.
      if (d.moved) {
        this.aimYaw = d.startYaw;
        this.power = d.startPower;
      }
      this.emitHud(true);
      return;
    }
    this.fire();
  }

  pointerCancel(id: number) {
    this.pointers.delete(id);
    if (this.drag?.id === id) {
      this.aimYaw = this.drag.startYaw;
      this.power = this.drag.startPower;
      this.drag = null;
    }
    this.pinch = null;
    this.orbitDrag = null;
  }

  wheel(deltaY: number) {
    this.zoom = clamp(this.zoom * Math.exp(deltaY * 0.0012), 0.55, 1.7);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    this.clearLevel();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.debris.dispose();
    this.puffs.dispose();
    this.flashes.dispose();
    this.popups.dispose();
    this.aimDots.dispose();
    this.trailDots.dispose();
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.envTexture?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
  }

  // --- Level building ---------------------------------------------------------------------------

  private clearLevel() {
    for (const b of this.blocks) this.removeBlockVisual(b);
    for (const d of this.defenders) this.removeDefenderVisual(d);
    for (const s of this.shots) this.pool.release(s.part.key, s.part.obj);
    for (const body of [...this.world.bodies]) if (body.type !== CANNON.Body.STATIC) this.world.removeBody(body);
    this.entities.clear();
    this.blocks = [];
    this.defenders = [];
    this.shots = [];
    this.active = [];
    this.hits = [];
    this.woken = [];
    this.debris.clear();
    this.puffs.clear();
    this.flashes.clear();
    this.popups.clear();
  }

  private buildLevel(index: number) {
    const prev = this.levelIndex;
    this.clearLevel();
    this.levelIndex = clamp(index, 0, LEVELS.length - 1);
    const level = LEVELS[this.levelIndex];
    const sameDistance = level.distance === this.level.distance;
    this.level = level;
    this.origin.set(0, 0, -level.distance);
    if (level.region !== this.region || !sameDistance) this.applyRegion(level.region);
    this.aimSun();

    const { pieces, defenders } = layout(level);
    for (const p of pieces) this.addBlock(p);
    for (const d of defenders) this.addDefender(d);

    this.ammo = { boulder: level.ammo.boulder ?? 0, bomb: level.ammo.bomb ?? 0, splitter: level.ammo.splitter ?? 0 };
    this.selected = AMMO_ORDER.find((k) => this.ammo[k] > 0) ?? "boulder";
    this.shotsUsed = 0;
    this.score = 0;
    this.finished = false;
    this.finishT = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.trail = [];
    this.prevTrail = [];
    this.trailDots.set([]);
    this.bigCollapseT = 0;
    this.creaks = 0;
    if (prev !== this.levelIndex || this.power === 0.5) {
      this.aimYaw = 0;
      this.power = this.powerForRange(level.distance - 4.5);
    }
    this.armAngle = ARM_LOADED;
    this.armMode = "loaded";
    this.loadProjectileMesh();
    this.computeRelease();
  }

  private blockMass(def: PieceDef, h: number) {
    const [sx, , sz] = def.size;
    let vol = sx * h * sz;
    if (def.shape.type === "prism") {
      const area = def.shape.sides === 4 ? 1 : def.shape.sides === 6 ? 0.75 : 0.83;
      const t = def.shape.top;
      vol *= area * ((1 + t + t * t) / 3);
    }
    return vol * def.density;
  }

  private addBlock(p: Placed) {
    const def: PieceDef = PIECES[p.kind];
    const [sx, sy, sz] = def.size;
    const bh = def.bodyHeight ?? sy;
    const body = new CANNON.Body({
      mass: this.blockMass(def, bh),
      material: materialFor(this.mats, def.material),
      linearDamping: 0.01,
      angularDamping: 0.06,
      sleepSpeedLimit: 0.16,
      sleepTimeLimit: 0.4,
    });
    body.addShape(shapeFor(def.shape, sx, bh, sz));
    body.position.set(this.origin.x + p.x, p.y + bh / 2, this.origin.z + p.z);
    body.quaternion.setFromEuler(0, p.yaw, 0);
    this.world.addBody(body);
    body.sleep();

    const holder = new THREE.Group();
    this.castleRoot.add(holder);
    const parts: Part[] = [];
    const add = (key: string, x: number, y: number, z: number, rotY = 0) => {
      if (!this.protos.has(key)) return null;
      const obj = this.pool.get(key, holder);
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      parts.push({ key, obj });
      return obj;
    };
    add(`piece:${p.kind}`, 0, -bh / 2, 0);
    if (p.flag) add(MODEL.flag, 0, sy - bh / 2 - (def.shape.type === "prism" ? 0.15 : 0), 0, Math.PI / 2);
    if (p.banner) add(MODEL.banner, 0, sy - bh / 2 - 1.32, sz / 2 + 0.03, -Math.PI / 2);
    const block: Block = {
      type: "block",
      kind: p.kind,
      def,
      body,
      holder,
      parts,
      hp: def.hp,
      alive: true,
      wrecked: false,
      start: new THREE.Vector3(body.position.x, body.position.y, body.position.z),
      toppled: false,
      creaked: false,
      fuse: -1,
    };
    this.register(body, block);
    this.blocks.push(block);
    this.syncBody(holder, body);
  }

  private addDefender(d: PlacedDefender) {
    const def = DEFENDERS[d.kind];
    const body = new CANNON.Body({ mass: DEFENDER_MASS, material: this.mats.flesh, linearDamping: 0.05, angularDamping: 0.6, sleepSpeedLimit: 0.16, sleepTimeLimit: 0.4 });
    // Sturdy on their feet: only a real blow tips them over.
    body.angularFactor.set(0.35, 1, 0.35);
    body.addShape(new CANNON.Box(new CANNON.Vec3(DEFENDER_HALF.x, DEFENDER_HALF.y, DEFENDER_HALF.z)));
    const x = this.origin.x + d.x;
    const z = this.origin.z + d.z;
    body.position.set(x, d.y + DEFENDER_HALF.y, z);
    // Face the trebuchet.
    const yaw = Math.atan2(-x, -z);
    body.quaternion.setFromEuler(0, yaw, 0);
    this.world.addBody(body);
    body.sleep();

    const proto = this.protos.get(`def:${d.kind}`) ?? this.protos.get("def:orc")!;
    const obj = this.takeDefenderMesh(d.kind, proto);
    const holder = new THREE.Group();
    holder.add(obj);
    obj.position.set(0, -DEFENDER_HALF.y, 0);
    obj.rotation.set(0, 0, 0);
    this.castleRoot.add(holder);
    const mixer = new THREE.AnimationMixer(obj);
    const actions = new Map(proto.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const defender: Defender = {
      type: "defender",
      kind: d.kind,
      body,
      holder,
      obj,
      mixer,
      actions,
      current: null,
      hp: def.hp,
      state: "alive",
      t: 0,
      startY: body.position.y,
      yaw,
    };
    this.play(defender, "idle", { fade: 0 });
    defender.current?.setEffectiveTimeScale(rand(0.85, 1.15));
    if (defender.current) defender.current.time = rand(0, 2);
    this.register(body, defender);
    this.defenders.push(defender);
    this.syncBody(holder, body);
  }

  private readonly defenderFree = new Map<DefenderKind, THREE.Object3D[]>();

  private takeDefenderMesh(kind: DefenderKind, proto: Proto) {
    const free = this.defenderFree.get(kind);
    const obj = free?.pop() ?? cloneSkinned(proto.object);
    obj.visible = true;
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
    });
    return obj;
  }

  private removeDefenderVisual(d: Defender) {
    d.mixer.stopAllAction();
    d.mixer.uncacheRoot(d.obj);
    d.obj.removeFromParent();
    d.holder.removeFromParent();
    let free = this.defenderFree.get(d.kind);
    if (!free) this.defenderFree.set(d.kind, (free = []));
    free.push(d.obj);
  }

  private removeBlockVisual(b: Block) {
    for (const p of b.parts) this.pool.release(p.key, p.obj);
    b.parts = [];
    b.holder.removeFromParent();
  }

  private register(body: CANNON.Body, entity: Entity) {
    // Bodies drawn before the first physics step need their interpolated pose set.
    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    body.previousQuaternion.copy(body.quaternion);
    body.interpolatedQuaternion.copy(body.quaternion);
    this.entities.set(body, entity);
    body.addEventListener("wakeup", () => this.woken.push(body));
    body.addEventListener("collide", (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const c = e.contact;
      const speed = Math.abs(c.getImpactVelocityAlongNormal());
      if (speed < 0.8) return;
      const point = new THREE.Vector3(c.bi.position.x + c.ri.x, c.bi.position.y + c.ri.y, c.bi.position.z + c.ri.z);
      this.hits.push({ self: body, other: e.body, speed, point });
    });
  }

  private syncBody(obj: THREE.Object3D, body: CANNON.Body, interpolated = false) {
    const p = interpolated ? body.interpolatedPosition : body.position;
    const q = interpolated ? body.interpolatedQuaternion : body.quaternion;
    obj.position.set(p.x, p.y, p.z);
    obj.quaternion.set(q.x, q.y, q.z, q.w);
  }

  // --- Trebuchet & firing -----------------------------------------------------------------------

  private launchVelocity(power: number, yaw: number, out = new THREE.Vector3()) {
    const v = V_MIN + (V_MAX - V_MIN) * power;
    const c = Math.cos(LAUNCH_ELEVATION);
    return out.set(Math.sin(yaw) * c * v, Math.sin(LAUNCH_ELEVATION) * v, -Math.cos(yaw) * c * v);
  }

  /** World position of the sling cup when the arm is at `angle`. */
  private bucketWorld(angle: number, out: THREE.Vector3) {
    if (!this.arm || !this.bucket) return out.set(this.treb.position.x, this.treb.position.y + TREB_HEIGHT, this.treb.position.z);
    const keep = this.arm.rotation.z;
    this.arm.rotation.z = angle;
    this.treb.updateMatrixWorld(true);
    out.copy(this.bucketLocal);
    this.bucket.localToWorld(out);
    this.arm.rotation.z = keep;
    this.treb.updateMatrixWorld(true);
    return out;
  }

  private computeRelease() {
    const keep = this.treb.rotation.y;
    this.treb.rotation.y = Math.PI / 2 - this.aimYaw;
    this.bucketWorld(ARM_RELEASE, this.release);
    this.treb.rotation.y = keep;
    this.treb.updateMatrixWorld(true);
  }

  /** Power that lands a shot about `range` metres out on flat ground (straight ahead). */
  private powerForRange(range: number) {
    let lo = 0;
    let hi = 1;
    this.computeRelease();
    const v = new THREE.Vector3();
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      this.launchVelocity(mid, 0, v);
      // Time to fall to y = 0 from the release height.
      const h = this.release.y;
      const t = (v.y + Math.sqrt(v.y * v.y + 2 * GRAVITY * h)) / GRAVITY;
      const dist = -(this.release.z + v.z * t);
      if (dist < range) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  private loadProjectileMesh() {
    this.loadedProjectile.clear();
    const proto = this.protos.get(`ammo:${this.selected}`);
    if (proto) {
      const obj = proto.object.clone();
      obj.position.y = -proto.size.y / 2;
      this.loadedProjectile.add(obj);
    }
  }

  private fire() {
    if (this.stage !== "aim" || this.phase !== "playing") return;
    if (this.ammo[this.selected] <= 0) {
      const next = AMMO_ORDER.find((k) => this.ammo[k] > 0);
      if (!next) return;
      this.selected = next;
      this.loadProjectileMesh();
    }
    this.ammo[this.selected]--;
    this.shotsUsed++;
    this.computeRelease();
    this.stage = "swing";
    this.stageT = 0;
    this.armMode = "swing";
    this.armT = 0;
    this.splitDone = false;
    this.prevTrail = this.trail;
    this.trail = [];
    this.trailDots.set([]);
    this.aimDots.set([]);
    this.marker.visible = false;
    this.drag = null;
    this.sfx.launch();
    this.emitHud(true);
  }

  private launch() {
    const kind = this.selected;
    const def = AMMO[kind];
    const body = new CANNON.Body({ mass: def.mass, material: this.mats.ammo, linearDamping: 0.01, angularDamping: 0.2, sleepSpeedLimit: 0.2, sleepTimeLimit: 0.6 });
    body.addShape(new CANNON.Sphere(def.radius));
    body.position.set(this.release.x, this.release.y, this.release.z);
    const v = this.launchVelocity(this.power, this.aimYaw);
    body.velocity.set(v.x, v.y, v.z);
    body.angularVelocity.set(rand(-6, 6), rand(-2, 2), rand(-6, 6));
    this.world.addBody(body);
    const part = { key: `ammo:${kind}`, obj: this.pool.get(`ammo:${kind}`, this.castleRoot) };
    part.obj.children[0].position.y = -this.protos.get(part.key)!.size.y / 2;
    const shot: Shot = { type: "shot", kind, body, part, radius: def.radius, age: 0, impacted: false, fragment: false, dead: false };
    this.register(body, shot);
    this.shots.push(shot);
    this.active = [shot];
    this.loadedProjectile.visible = false;
    this.stage = "flight";
    this.stageT = 0;
    this.trailT = 0;
    this.lastFocus.copy(this.release);
    this.emitHud(true);
    // Keep the field tidy: old projectiles crumble away.
    const live = this.shots.filter((s) => !s.dead);
    if (live.length > MAX_SHOTS_KEPT) this.removeShot(live[0], true);
  }

  private trySplit() {
    if (this.stage !== "flight" || this.splitDone) return;
    const shot = this.shots.find((s) => !s.dead && s.kind === "splitter" && !s.fragment && !s.impacted);
    if (!shot) return;
    this.splitDone = true;
    const p = shot.body.position;
    const v = shot.body.velocity;
    const at = new THREE.Vector3(p.x, p.y, p.z);
    this.removeShot(shot, false);
    this.active = [];
    const yawStep = 0.16;
    for (let i = -1; i <= 1; i++) {
      const body = new CANNON.Body({ mass: SPLIT_MASS, material: this.mats.ammo, linearDamping: 0.01, angularDamping: 0.2, sleepSpeedLimit: 0.2, sleepTimeLimit: 0.6 });
      body.addShape(new CANNON.Sphere(SPLIT_RADIUS));
      const c = Math.cos(i * yawStep);
      const s = Math.sin(i * yawStep);
      // Fan out sideways (around the vertical axis), the middle one a touch faster.
      body.velocity.set(v.x * c - v.z * s, v.y * (1 + (i === 0 ? 0.04 : -0.03)), v.x * s + v.z * c);
      body.position.set(p.x + (v.x * c - v.z * s) * 0.03, p.y, p.z + (v.x * s + v.z * c) * 0.03);
      body.angularVelocity.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      this.world.addBody(body);
      const part = { key: "ammo:fragment", obj: this.pool.get("ammo:fragment", this.castleRoot) };
      part.obj.children[0].position.y = -this.protos.get(part.key)!.size.y / 2;
      const shot2: Shot = { type: "shot", kind: "splitter", body, part, radius: SPLIT_RADIUS, age: 0, impacted: false, fragment: true, dead: false };
      this.register(body, shot2);
      this.shots.push(shot2);
      this.active.push(shot2);
      this.syncBody(part.obj, body);
    }
    this.flashes.spawn(at, 0.9);
    this.puffs.emit(at, 8, { color: "#e7e5e4", size: 1.2, speed: 2, life: 0.8 });
    this.sfx.split();
    this.emitHud(true);
  }

  private removeShot(shot: Shot, puff: boolean) {
    if (shot.dead) return;
    shot.dead = true;
    if (puff) {
      const p = shot.body.position;
      this.puffs.emit(new THREE.Vector3(p.x, p.y, p.z), 6, { color: "#d6d3d1", size: 1.2, life: 0.9 });
    }
    this.world.removeBody(shot.body);
    this.entities.delete(shot.body);
    this.pool.release(shot.part.key, shot.part.obj);
  }

  // --- Frame ------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const realDt = Math.min(this.timer.getDelta(), 1 / 20);
    const running = this.phase === "playing" || this.phase === "won" || this.phase === "lost" || this.phase === "menu";

    if (running) {
      // Slow motion for the final knock-out.
      if (this.slowmo > 0) {
        this.slowmo -= realDt;
        this.timeScale = damp(this.timeScale, 0.28, 10, realDt);
      } else this.timeScale = damp(this.timeScale, 1, 3, realDt);
      const dt = realDt * this.timeScale;
      this.elapsed += realDt;

      if (this.phase === "menu") for (const d of this.defenders) d.mixer.update(dt);
      else {
        this.world.step(FIXED_STEP, dt, 4);
        this.propagateWake();
        this.processHits();
        this.updateBlocks(dt);
        this.updateDefenders(dt);
        this.updateShots(dt);
      }
      if (this.phase === "playing") this.updatePlay(dt, realDt);
      else if (this.phase === "won" || this.phase === "lost") this.finishT += realDt;
      this.updateArm(dt);
      this.debris.update(dt, GRAVITY);
      this.puffs.update(dt);
      this.flashes.update(dt);
      this.popups.update(realDt);
      this.syncAll();
      this.bigCollapseT = Math.max(0, this.bigCollapseT - realDt);
    }
    if (this.phase !== "loading" && this.phase !== "error") {
      this.updateCamera(this.phase === "paused" ? 0 : realDt);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updatePlay(dt: number, realDt: number) {
    this.stageT += realDt;
    this.updateAimInput(realDt);

    if (this.stage === "intro") {
      if (this.stageT > 2.6) this.endIntro();
    } else if (this.stage === "swing") {
      if (this.armAngle <= ARM_RELEASE || this.stageT > 0.6) this.launch();
    } else if (this.stage === "flight") {
      const live = this.active.filter((s) => !s.dead && !s.impacted);
      const lead = live.find((s) => !s.fragment) ?? live[Math.floor(live.length / 2)];
      if (lead) {
        const p = lead.body.position;
        this.lastFocus.set(p.x, p.y, p.z);
        const speed = lead.body.velocity.length();
        this.sfx.flight(clamp(speed / 26, 0, 1));
        this.trailT += dt;
        if (this.trailT > 0.05) {
          this.trailT = 0;
          this.trail.push(new THREE.Vector3(p.x, p.y, p.z));
        }
        if (p.y < -3 || Math.abs(p.x) > 160 || p.z < -220 || p.z > 60) lead.impacted = true;
      }
      if (!live.length || this.stageT > 9) {
        this.sfx.flight(0);
        this.stage = "settle";
        this.stageT = 0;
        this.quietT = 0;
      }
    } else if (this.stage === "settle") {
      this.sfx.flight(0);
      let moving = 0;
      for (const b of this.world.bodies) {
        if (b.type !== CANNON.Body.DYNAMIC || b.sleepState === CANNON.Body.SLEEPING) continue;
        // A shot rolling away across the field does not hold up the next one.
        if (this.entities.get(b)?.type === "shot" && Math.hypot(b.position.x - this.origin.x, b.position.z - this.origin.z) > 14) continue;
        if (b.velocity.lengthSquared() > 0.5 * 0.5 || b.angularVelocity.lengthSquared() > 0.6 * 0.6) moving++;
      }
      this.quietT = moving === 0 ? this.quietT + realDt : 0;
      if (!this.finished && ((this.quietT > 0.6 && this.stageT > 1.2) || this.stageT > 7)) this.endShot();
    }

    if (this.finished) {
      this.finishT += realDt;
      if (this.finishT > 2.6 && this.phase === "playing") this.complete(true);
    }
    this.emitHud();
  }

  private endIntro() {
    if (this.stage !== "intro") return;
    this.stage = "aim";
    this.stageT = 0;
    this.camLambda = 3.2;
    this.emitHud(true);
  }

  /** The shot has played out: next shot, or out of ammo. */
  private endShot() {
    if (this.stage !== "settle") return;
    const alive = this.defenders.filter((d) => d.state === "alive");
    if (!alive.length) return; // the win sequence takes over
    if (ammoTotal({ ...this.level, ammo: this.ammo }) <= 0) {
      this.stage = "done";
      this.complete(false);
      return;
    }
    // Survivors jeer.
    if (Math.random() < 0.8) {
      for (const d of alive) this.play(d, Math.random() < 0.5 ? "emote-yes" : "emote-no", { once: true, fade: 0.15 });
      this.sfx.taunt();
    }
    if (this.ammo[this.selected] <= 0) {
      this.selected = AMMO_ORDER.find((k) => this.ammo[k] > 0) ?? this.selected;
    }
    this.loadProjectileMesh();
    this.stage = "aim";
    this.stageT = 0;
    this.armMode = "reload";
    this.armT = 0;
    this.sfx.ratchet(6, 0.13);
    this.camLambda = 2.6;
    this.emitHud(true);
  }

  private complete(won: boolean) {
    const remaining = this.defenders.filter((d) => d.state === "alive").length;
    const left = ammoTotal({ ...this.level, ammo: this.ammo });
    const bonus = won ? left * SHOT_BONUS : 0;
    this.score += bonus;
    const stars = won ? starsFor(this.level, this.shotsUsed) : 0;
    this.stage = "done";
    this.finishT = 0;
    this.drag = null;
    this.aimDots.set([]);
    this.marker.visible = false;
    if (won) this.sfx.win();
    else this.sfx.lose();
    music.setIntensity(won ? 1 : 0);
    this.setPhase(won ? "won" : "lost");
    this.events.result({ level: this.levelIndex, won, score: this.score, bonus, stars, shotsUsed: this.shotsUsed, remaining });
    this.emitHud(true);
  }

  private updateAimInput(dt: number) {
    const k = this.keys;
    const anyAim = k.has("KeyA") || k.has("KeyD") || k.has("KeyW") || k.has("KeyS") || k.has("ArrowLeft") || k.has("ArrowRight") || k.has("ArrowUp") || k.has("ArrowDown");
    this.keyHeld = anyAim ? this.keyHeld + dt : 0;
    const accel = 0.25 + Math.min(1, this.keyHeld / 1.2) * 0.75;
    if (this.stage === "aim" && !this.drag) {
      const yawDir = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
      const powDir = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
      this.aimYaw = clamp(this.aimYaw + yawDir * dt * 0.42 * accel, -YAW_LIMIT, YAW_LIMIT);
      this.power = clamp(this.power + powDir * dt * 0.3 * accel, 0, 1);
    }
    const orbitDir = (k.has("KeyE") ? 1 : 0) - (k.has("KeyQ") ? 1 : 0);
    if (orbitDir) this.orbit += orbitDir * dt * 1.3;
  }

  // --- Trebuchet arm ------------------------------------------------------------------------------

  private updateArm(dt: number) {
    this.armT += dt;
    if (this.armMode === "swing") {
      // Counterweight drops: the arm accelerates through the release point.
      this.armVel = -2 - this.armT * 60;
      this.armAngle += this.armVel * dt;
      if (this.armAngle <= ARM_END) {
        this.armAngle = ARM_END;
        this.armMode = "follow";
        this.armVel = 0;
      }
    } else if (this.armMode === "follow") {
      // Swing back to hang, with a little wobble.
      const acc = (ARM_REST - this.armAngle) * 40 - this.armVel * 5;
      this.armVel += acc * dt;
      this.armAngle += this.armVel * dt;
    } else if (this.armMode === "reload") {
      const t = clamp(this.armT / RELOAD_TIME, 0, 1);
      const e = t * t * (3 - 2 * t);
      this.armAngle = ARM_REST + (ARM_LOADED - ARM_REST) * e;
      if (t >= 1) this.armMode = "loaded";
    } else this.armAngle = ARM_LOADED;

    const yawTarget = Math.PI / 2 - this.aimYaw;
    this.treb.rotation.y = this.armMode === "loaded" || this.armMode === "reload" ? dampAngle(this.treb.rotation.y, yawTarget, 14, dt) : this.treb.rotation.y;
    if (this.arm) this.arm.rotation.z = this.armAngle;

    // The projectile rides in the sling until release.
    const showLoaded = this.phase !== "menu" && (this.stage === "aim" || this.stage === "intro" || this.stage === "swing") && (this.armMode !== "reload" || this.armT > RELOAD_TIME * 0.6);
    this.loadedProjectile.visible = showLoaded && this.stage !== "done";
    if (this.loadedProjectile.visible && this.bucket) {
      this.treb.updateMatrixWorld(true);
      const p = this.loadedProjectile.position.copy(this.bucketLocal);
      this.bucket.localToWorld(p);
      p.y += AMMO[this.selected].radius * 0.55;
    }
  }

  // --- Collisions, damage, explosions ----------------------------------------------------------

  private processHits() {
    const hits = this.hits;
    this.hits = [];
    for (const h of hits) {
      const self = this.entities.get(h.self);
      if (!self) continue;
      const other = this.entities.get(h.other);
      const ms = h.self.mass;
      const mo = h.other.type === CANNON.Body.STATIC ? ms * 2 : h.other.mass;
      const reduced = (ms * mo) / (ms + mo);
      const strength = reduced * h.speed * clamp((h.speed - 1.5) / h.speed, 0, 1);
      const primary = !other || h.self.id < h.other.id;

      if (self.type === "shot") {
        if (!self.impacted && h.speed > 1) {
          self.impacted = true;
          // Rolling resistance from here on, so stray shots come to rest.
          self.body.linearDamping = 0.18;
          self.body.angularDamping = 0.6;
          if (self.kind === "bomb" && !self.fragment) {
            this.explode(new THREE.Vector3(h.self.position.x, h.self.position.y, h.self.position.z), BOMB_RADIUS, BOMB_POWER, "bomb");
            this.removeShot(self, false);
            continue;
          }
          if (this.stage === "flight") this.lastFocus.copy(h.point);
          this.shake = Math.max(this.shake, Math.min(0.45, h.speed * 0.018 * (self.fragment ? 0.5 : 1)));
        }
        if (primary && h.speed > 2) {
          this.sfx.impact(other?.type === "block" ? other.def.material : other?.type === "defender" ? "flesh" : "ground", self.body.mass, h.speed);
          if (h.speed > 6) this.dust(h.point, Math.min(10, h.speed * 0.6), other?.type === "block" ? other.def.material : "ground");
        }
      } else if (self.type === "block") {
        if (!self.alive) continue;
        if (primary && h.speed > 1.8) this.sfx.impact(self.def.material, ms, h.speed);
        if (h.speed > 4.5 && primary) {
          this.debris.burst(h.point, Math.min(6, Math.floor(h.speed / 2)), DEBRIS_COLORS[self.def.material], { speed: 3, size: 0.18, up: 2 });
          this.dust(h.point, 3, self.def.material);
        }
        if (strength > 0.4) this.damageBlock(self, strength);
      } else if (self.type === "defender") {
        if (self.state !== "alive") continue;
        if (primary && h.speed > 2) this.sfx.impact("flesh", ms, h.speed);
        if (strength > 0.15) {
          self.hp -= strength;
          if (self.hp <= 0) this.knockOut(self);
        }
      }
    }
  }

  private dust(at: THREE.Vector3, count: number, material: string) {
    const color = material === "wood" || material === "powder" ? "#d8c4a4" : material === "ground" ? "#cbbf9f" : "#ece2d0";
    this.puffs.emit(at, Math.round(count), { color, size: 1.3, speed: 1.4, life: 1.3, opacity: 0.6 });
  }

  private damageBlock(b: Block, amount: number) {
    if (!b.alive || b.wrecked) return;
    b.hp -= amount;
    if (b.hp > 0) return;
    if (b.def.material === "powder") {
      if (b.fuse < 0) b.fuse = 0.02;
      return;
    }
    if (b.def.wreck) this.wreckBlock(b);
    else this.shatter(b);
  }

  private blockCentre(b: Block) {
    return new THREE.Vector3(b.body.position.x, b.body.position.y, b.body.position.z);
  }

  private shatter(b: Block) {
    if (!b.alive) return;
    b.alive = false;
    const at = this.blockCentre(b);
    const [sx, sy, sz] = b.def.size;
    const vol = sx * sy * sz;
    this.debris.burst(at, Math.round(clamp(vol * 6, 8, 30)), DEBRIS_COLORS[b.def.material], { speed: 4.5, size: clamp(Math.cbrt(vol) * 0.22, 0.16, 0.4), up: 3.5, spread: Math.cbrt(vol) * 0.35 });
    this.puffs.emit(at, Math.round(clamp(vol * 3, 6, 16)), { color: b.def.material === "wood" ? "#dccaa8" : "#efe5d3", size: 1.8, speed: 2, life: 1.6, spread: Math.cbrt(vol) * 0.4 });
    this.sfx.shatter(b.def.material);
    this.addScore(b.def.score, at, b.def.score >= 400);
    this.removeBlockBody(b);
    this.removeBlockVisual(b);
  }

  private wreckBlock(b: Block) {
    b.wrecked = true;
    const at = this.blockCentre(b);
    this.debris.burst(at, 14, DEBRIS_COLORS.wood, { speed: 4, size: 0.2, up: 3 });
    this.puffs.emit(at, 10, { color: "#d6c7a8", size: 1.6, speed: 1.6, life: 1.4 });
    this.sfx.shatter("wood");
    this.addScore(b.def.score, at, true);
    const wreckKey = `wreck:${b.kind}`;
    if (this.protos.has(wreckKey)) {
      for (const p of b.parts) this.pool.release(p.key, p.obj);
      const bh = b.def.bodyHeight ?? b.def.size[1];
      const obj = this.pool.get(wreckKey, b.holder);
      obj.position.set(0, -bh / 2, 0);
      b.parts = [{ key: wreckKey, obj }];
    }
  }

  private removeBlockBody(b: Block) {
    const pos = b.body.position;
    this.world.removeBody(b.body);
    this.entities.delete(b.body);
    this.wakeAround(new THREE.Vector3(pos.x, pos.y, pos.z), 4);
  }

  private propagateWake() {
    for (let guard = 0; this.woken.length && guard < 6; guard++) {
      const list = this.woken;
      this.woken = [];
      for (const a of list) {
        if (a.aabbNeedsUpdate) a.updateAABB();
        const m = 0.08;
        const lo = a.aabb.lowerBound;
        const hi = a.aabb.upperBound;
        for (const b of this.world.bodies) {
          if (b === a || b.type !== CANNON.Body.DYNAMIC || b.sleepState !== CANNON.Body.SLEEPING) continue;
          if (b.aabbNeedsUpdate) b.updateAABB();
          const bl = b.aabb.lowerBound;
          const bh = b.aabb.upperBound;
          // Touching (boxes overlap within a small margin): wake it.
          if (lo.x - m < bh.x && hi.x + m > bl.x && lo.y - m < bh.y && hi.y + m > bl.y && lo.z - m < bh.z && hi.z + m > bl.z) b.wakeUp();
        }
      }
    }
  }

  /** Wakes every body near a point (supports vanished, blasts). */
  private wakeAround(at: THREE.Vector3, radius: number) {
    for (const body of this.world.bodies) {
      if (body.type !== CANNON.Body.DYNAMIC) continue;
      const d = Math.hypot(body.position.x - at.x, body.position.y - at.y, body.position.z - at.z);
      if (d < radius + 1.5) body.wakeUp();
    }
  }

  private explode(at: THREE.Vector3, radius: number, power: number, source: "bomb" | "keg") {
    this.flashes.spawn(at, radius * 0.5);
    this.puffs.emit(at, 18, { color: "#57534e", size: 2.6, speed: 3.2, up: 2.2, life: 2.1, opacity: 0.7, spread: 0.8 });
    this.puffs.emit(at, 12, { color: "#fb923c", size: 1.8, speed: 4, up: 1.5, life: 0.55, opacity: 0.9, spread: 0.5 });
    this.debris.burst(at, 18, DEBRIS_COLORS.powder, { speed: 8, size: 0.18, up: 5 });
    this.sfx.explosion(source === "bomb");
    this.shake = Math.max(this.shake, source === "bomb" ? 0.75 : 0.6);
    this.bigCollapseT = 4;
    const tmp = new CANNON.Vec3();
    const point = new CANNON.Vec3();
    for (const body of [...this.world.bodies]) {
      if (body.type !== CANNON.Body.DYNAMIC) continue;
      const e = this.entities.get(body);
      if (!e) continue;
      const dx = body.position.x - at.x;
      const dy = body.position.y - at.y;
      const dz = body.position.z - at.z;
      const d = Math.max(0.3, Math.hypot(dx, dy, dz) - 0.5);
      if (d > radius) continue;
      const f = 1 - d / radius;
      const f2 = f * f;
      body.wakeUp();
      const dv = Math.min(10, (power * f2) / Math.sqrt(body.mass));
      tmp.set(dx, dy + 0.6, dz);
      tmp.normalize();
      tmp.scale(dv * body.mass, tmp);
      // Push a little off-centre (relative point) so things tumble.
      point.set(-dx * 0.08, -0.2, -dz * 0.08);
      body.applyImpulse(tmp, point);
      if (e.type === "block") {
        if (e.def.material === "powder") {
          if (e.alive && e.fuse < 0 && f > 0.2) e.fuse = 0.12 + Math.random() * 0.1;
        } else this.damageBlock(e, 75 * f2 * (e.def.material === "wood" ? 1.3 : 1));
      } else if (e.type === "defender" && e.state === "alive") {
        e.hp -= 6 * f2;
        if (e.hp <= 0) this.knockOut(e);
      }
    }
  }

  // --- Per-frame entity updates -----------------------------------------------------------------

  private updateBlocks(dt: number) {
    let moving = 0;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      if (b.fuse >= 0) {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          b.alive = false;
          const at = this.blockCentre(b);
          this.removeBlockBody(b);
          this.removeBlockVisual(b);
          this.addScore(b.def.score, at, false);
          this.explode(at, KEG_RADIUS, KEG_POWER, "keg");
          continue;
        }
      }
      const body = b.body;
      if (body.sleepState === CANNON.Body.SLEEPING) continue;
      const speed = body.velocity.length();
      if (speed > 1.2) moving++;
      if (!b.toppled) {
        const up = body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
        const dist = Math.hypot(body.position.x - b.start.x, body.position.y - b.start.y, body.position.z - b.start.z);
        if (up.y < 0.75 || dist > 1.3) {
          b.toppled = true;
          this.score += 50;
        } else if (!b.creaked && up.y < 0.97 && body.angularVelocity.length() > 0.4 && this.creaks < 4) {
          b.creaked = true;
          this.creaks++;
          this.sfx.creak();
        }
      }
      // Fell off the world.
      if (body.position.y < -8) this.shatter(b);
    }
    if (moving > 8 && this.bigCollapseT < 3) {
      this.bigCollapseT = 4;
      this.shake = Math.max(this.shake, 0.25);
    }
  }

  private updateDefenders(dt: number) {
    let alive = 0;
    for (const d of this.defenders) {
      if (d.state === "gone") continue;
      d.mixer.update(dt);
      if (d.state === "alive") {
        alive++;
        const body = d.body;
        if (body.sleepState !== CANNON.Body.SLEEPING) {
          const up = body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
          if (up.y < 0.55 || body.position.y < d.startY - KO_DROP || body.position.y < -3) this.knockOut(d);
        }
        // Back to idle after an emote.
        if (d.current && d.current.loop === THREE.LoopOnce && !d.current.isRunning()) this.play(d, "idle", { fade: 0.3 });
      } else if (d.state === "ko") {
        d.t += dt;
        if (d.t > 1.35) {
          d.state = "gone";
          const p = d.body.position;
          const at = new THREE.Vector3(p.x, p.y, p.z);
          this.puffs.emit(at, 14, { color: "#f5f5f4", size: 1.5, speed: 1.8, up: 1.2, life: 1.1, opacity: 0.85 });
          this.debris.burst(at, 6, d.kind === "skeleton" ? DEBRIS_COLORS.bone : DEBRIS_COLORS.iron, { speed: 2.5, size: 0.14, up: 2.5 });
          this.world.removeBody(d.body);
          this.entities.delete(d.body);
          this.removeDefenderVisual(d);
              }
      }
    }
    if (this.phase === "playing" && !this.finished) {
      music.setIntensity(alive <= 1 && this.defenders.length > 1 ? 2 : this.bigCollapseT > 0 ? 2 : 1);
    }
  }

  private knockOut(d: Defender) {
    if (d.state !== "alive") return;
    d.state = "ko";
    d.t = 0;
    d.body.wakeUp();
    this.play(d, "die", { once: true, fade: 0.08 });
    this.sfx.ko();
    const p = d.body.position;
    const at = new THREE.Vector3(p.x, p.y + 0.6, p.z);
    this.addScore(DEFENDER_SCORE, at, true);
    this.puffs.emit(at, 6, { color: "#f5f5f4", size: 1, speed: 1.4, life: 0.8 });
    const alive = this.defenders.filter((x) => x.state === "alive").length;
    this.emitHud(true);
    if (alive === 0 && this.phase === "playing" && !this.finished) {
      // The last defender: slow motion and a close-up.
      this.finished = true;
      this.finishT = 0;
      this.slowmo = 1.3;
      this.lastFocus.copy(at);
      this.shake = Math.max(this.shake, 0.3);
    }
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      if (s.dead) continue;
      s.age += dt;
      if (s.body.position.y < -10) this.removeShot(s, false);
    }
    if (this.shots.length > 24) this.shots = this.shots.filter((s) => !s.dead);
  }

  private addScore(points: number, at: THREE.Vector3, popup: boolean) {
    this.score += points;
    if (popup) this.popups.show(at, `+${points}`, { color: points >= DEFENDER_SCORE ? "#d9f99d" : "#fefce8", big: points >= DEFENDER_SCORE });
  }

  private play(d: Defender, name: string, { once = false, fade = 0.2 } = {}) {
    const next = d.actions.get(name);
    if (!next) return;
    if (d.current === next && !once) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (d.current && d.current !== next) next.crossFadeFrom(d.current, fade, false);
    next.play();
    d.current = next;
  }

  // --- Sync & aim preview -------------------------------------------------------------------------

  private readonly upright = new THREE.Quaternion();
  private readonly tmpQ = new THREE.Quaternion();

  private syncAll() {
    for (const b of this.blocks) if (b.alive) this.syncBody(b.holder, b.body, true);
    for (const d of this.defenders) {
      if (d.state === "gone") continue;
      this.syncBody(d.holder, d.body, true);
      if (d.state === "ko") {
        // The die animation lies the body down itself; keep the mesh upright so it doesn't fall twice.
        this.upright.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.yaw);
        this.tmpQ.copy(d.holder.quaternion).slerp(this.upright, clamp(d.t * 4, 0, 1));
        d.holder.quaternion.copy(this.tmpQ);
        const k = d.t > 1.1 ? 1 - (d.t - 1.1) / 0.25 : 1;
        d.holder.scale.setScalar(Math.max(0.01, k));
      } else d.holder.scale.setScalar(1);
    }
    for (const s of this.shots) if (!s.dead) this.syncBody(s.part.obj, s.body, true);

    // Aim preview.
    const aiming = this.phase === "playing" && this.stage === "aim" && (this.armMode === "loaded" || this.armT > RELOAD_TIME * 0.5);
    if (aiming) this.updatePreview();
    else {
      if (this.aimDots.count) this.aimDots.set([]);
      this.marker.visible = false;
    }
    const showTrail = aiming && this.prevTrail.length > 1;
    if (showTrail && this.trailDots.count !== this.prevTrail.length) this.trailDots.set(this.prevTrail);
    else if (!showTrail && this.trailDots.count) this.trailDots.set([]);
  }

  private readonly rayResult = new CANNON.RaycastResult();
  private readonly previewPoints: THREE.Vector3[] = Array.from({ length: 64 }, () => new THREE.Vector3());

  private updatePreview() {
    this.computeRelease();
    const v = this.launchVelocity(this.power, this.aimYaw);
    const p0 = this.release;
    const from = new CANNON.Vec3();
    const to = new CANNON.Vec3();
    const pts: THREE.Vector3[] = [];
    const step = 0.065;
    let hit: THREE.Vector3 | null = null;
    let normal = new THREE.Vector3(0, 1, 0);
    let prev = p0.clone();
    for (let i = 1; i < 120 && pts.length < 64; i++) {
      const t = i * step;
      const cur = new THREE.Vector3(p0.x + v.x * t, p0.y + v.y * t - 0.5 * GRAVITY * t * t, p0.z + v.z * t);
      from.set(prev.x, prev.y, prev.z);
      to.set(cur.x, cur.y, cur.z);
      this.rayResult.reset();
      const blocked = t > 0.25 && this.world.raycastClosest(from, to, { skipBackfaces: true }, this.rayResult);
      if (blocked) {
        const hp = this.rayResult.hitPointWorld;
        hit = new THREE.Vector3(hp.x, hp.y, hp.z);
        const n = this.rayResult.hitNormalWorld;
        normal = new THREE.Vector3(n.x, n.y, n.z);
        break;
      }
      if (cur.y < 0 && cur.z < -6) {
        const k = prev.y / (prev.y - cur.y);
        hit = prev.clone().lerp(cur, k);
        break;
      }
      // Skip the first stretch next to the camera (the dots would look huge there).
      if (t > 0.42) {
        const slot = this.previewPoints[pts.length];
        slot.copy(cur);
        pts.push(slot);
      }
      prev = cur;
    }
    const n = pts.length;
    // Dots shrink towards the end of the arc and pulse gently.
    const pulse = (this.elapsed * 2.2) % 1;
    this.aimDots.set(pts, (i) => {
      const along = i / Math.max(1, n - 1);
      const wave = Math.max(0, 1 - Math.abs(along - pulse) * 6) * 0.35;
      return (1 + along * 0.6) * (1 + wave);
    });
    if (hit) {
      this.marker.visible = true;
      this.marker.position.copy(hit).addScaledVector(normal, 0.04);
      this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      this.marker.scale.setScalar(1 + Math.sin(this.elapsed * 6) * 0.08);
    } else this.marker.visible = false;
  }

  // --- Camera -----------------------------------------------------------------------------------

  /** Behind and beside the trebuchet, looking down the line of fire at the castle. */
  private aimView() {
    const treb = this.treb.position;
    const yaw = this.aimYaw * 0.5;
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const k = this.portrait ? 0.74 : 0.72;
    const look = this.tmpLook.set(treb.x + (this.origin.x - treb.x) * k, this.portrait ? 1 : 2, treb.z + (this.origin.z - treb.z) * k);
    const side = this.portrait ? 3 : 9.5;
    const back = this.portrait ? 12.5 : 9;
    const up = this.portrait ? 13 : 6.4;
    // Camera position relative to the trebuchet (side = to the right of the line of fire).
    const px = treb.x - fz * side - fx * back;
    const pz = treb.z + fx * side - fz * back;
    const py = treb.y + up;
    const ox = px - look.x;
    const oy = py - look.y;
    const oz = pz - look.z;
    const dist = Math.hypot(ox, oy, oz);
    this.wantTarget.copy(look);
    this.wantYaw = Math.atan2(ox, oz) + this.orbit;
    this.wantPitch = Math.asin(oy / dist);
    this.wantDist = dist * this.zoom;
  }

  private readonly tmpLook = new THREE.Vector3();

  private castleView(dist: number, yawOffset: number) {
    this.wantTarget.set(this.origin.x, 2.6, this.origin.z);
    this.wantYaw = this.orbit + yawOffset;
    this.wantPitch = 0.3;
    this.wantDist = dist * this.zoom * (this.portrait ? 1.45 : 1);
  }

  private updateCamera(dt: number) {
    const play = this.phase === "playing" || this.phase === "paused";
    if (this.phase === "menu") {
      this.castleView(22, 0.5 + Math.sin(this.elapsed * 0.12) * 0.55);
      this.wantTarget.y = this.portrait ? -2.2 : 0.4;
      this.wantPitch = 0.34;
      this.camLambda = 1.2;
    } else if (this.phase === "won" || this.phase === "lost") {
      this.castleView(21, 0.35 + this.finishT * 0.08);
      this.camLambda = 1.4;
    } else if (play) {
      if (this.finished) {
        this.wantTarget.copy(this.lastFocus);
        this.wantTarget.y = Math.max(1.5, this.lastFocus.y);
        this.wantYaw = this.orbit + 0.45;
        this.wantPitch = 0.26;
        this.wantDist = 11 * this.zoom * (this.portrait ? 1.35 : 1);
        this.camLambda = 2.4;
      } else if (this.stage === "intro") {
        this.aimView();
        this.camLambda = Math.min(3, 0.9 + this.stageT * 0.6);
      } else if (this.stage === "aim" || this.stage === "swing") {
        this.aimView();
        this.camLambda = Math.min(4, this.camLambda + dt * 2);
      } else if (this.stage === "flight") {
        // Ride alongside the shot, looking ahead towards the castle.
        const f = this.lastFocus;
        this.wantTarget.set(f.x + (this.origin.x - f.x) * 0.35, Math.max(1.5, f.y * 0.75), f.z + (this.origin.z - f.z) * 0.35);
        this.wantYaw = this.orbit + 0.62 - this.aimYaw * 0.5;
        this.wantPitch = 0.24;
        this.wantDist = 17 * this.zoom * (this.portrait ? 1.4 : 1);
        this.camLambda = 3.2;
      } else if (this.stage === "settle" || this.stage === "done") {
        this.wantTarget.lerpVectors(this.lastFocus, new THREE.Vector3(this.origin.x, 2.2, this.origin.z), 0.5);
        this.wantTarget.y = Math.max(2, this.wantTarget.y);
        this.wantYaw = this.orbit + 0.6 - this.aimYaw * 0.5;
        this.wantPitch = 0.3;
        this.wantDist = 19 * this.zoom * (this.portrait ? 1.4 : 1);
        this.camLambda = 2.2;
      }
    }

    if (dt > 0) {
      const l = this.camLambda;
      this.camTarget.x = damp(this.camTarget.x, this.wantTarget.x, l, dt);
      this.camTarget.y = damp(this.camTarget.y, this.wantTarget.y, l, dt);
      this.camTarget.z = damp(this.camTarget.z, this.wantTarget.z, l, dt);
      this.camYaw = dampAngle(this.camYaw, this.wantYaw, l * 0.8, dt);
      this.camPitch = damp(this.camPitch, this.wantPitch, l, dt);
      this.camDist = damp(this.camDist, this.wantDist, l * 0.8, dt);
    }
    const cp = Math.cos(this.camPitch);
    const pos = this.camera.position.set(
      this.camTarget.x + Math.sin(this.camYaw) * cp * this.camDist,
      this.camTarget.y + Math.sin(this.camPitch) * this.camDist,
      this.camTarget.z + Math.cos(this.camYaw) * cp * this.camDist,
    );
    // Never dip under the terrain.
    const floor = this.groundHeight(pos.x, pos.z) + 1.2;
    if (pos.y < floor) pos.y = floor;
    this.shake = damp(this.shake, 0, 5, dt);
    const s = this.shake;
    pos.x += (Math.random() - 0.5) * s;
    pos.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.camTarget);

    const fov = this.portrait ? 58 : 37;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.puffs.setScale(this.viewH * this.renderer.getPixelRatio(), fov);
    }
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.viewW = w;
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
    this.puffs.setScale(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  // --- HUD --------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  private emitHud(force = false) {
    const total = this.defenders.length;
    const alive = this.defenders.filter((d) => d.state === "alive").length;
    const next: Hud = {
      level: this.levelIndex,
      score: this.score,
      defenders: alive,
      total,
      ammo: { ...this.ammo },
      selected: this.selected,
      shotsUsed: this.shotsUsed,
      shotsLeft: this.ammo.boulder + this.ammo.bomb + this.ammo.splitter,
      stage: this.stage,
      power: Math.round(this.power * 100),
      angle: Math.round((this.aimYaw * 180) / Math.PI),
      aiming: !!this.drag?.moved,
      canSplit: this.stage === "flight" && !this.splitDone && this.shots.some((s) => !s.dead && s.kind === "splitter" && !s.fragment && !s.impacted),
    };
    const h = this.hud;
    if (
      !force &&
      h &&
      h.score === next.score &&
      h.defenders === next.defenders &&
      h.stage === next.stage &&
      h.power === next.power &&
      h.angle === next.angle &&
      h.aiming === next.aiming &&
      h.canSplit === next.canSplit &&
      h.selected === next.selected &&
      h.shotsLeft === next.shotsLeft
    )
      return;
    this.hud = next;
    this.events.hud(next);
  }
}
