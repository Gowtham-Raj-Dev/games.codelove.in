import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, Pool, type LoadedModel, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { CRYPT_EPIC } from "../shared/songs";
import { Animator, angleDiff, damp, turnTowards, yawTo } from "./anim";
import { applySkin, shaderTime } from "../skate-rush/looks";
import { Sfx } from "./audio";
import { findItem, HEROES, SKINS, WORLDS, type HeroDef, type WorldDef } from "./content";
import { ENEMIES, Enemy, type AttackDef, type EnemyAssets, type EnemyCtx } from "./enemies";
import { Decal, Decals, Glows, Particles, Popups, Slashes } from "./fx";
import { Room, worldRooms, type Breakable, type Chest, type EnemyKind, type RoomPlan } from "./level";
import { C, D, FIRST_MODELS, LATER_MODELS } from "./manifest";
import { BASE_STATS, POTION_PRICE, POTION_PRICE_STEP, POWERS, rollPowers, type Power, type Stats } from "./powers";

// --- Tuning ----------------------------------------------------------------------------------------

const KNIGHT_R = 0.55;
const ROLL_TIME = 0.42;
const IFRAME_END = 0.36;
const SPIN_TIME = 1.0;
const MAX_ALIVE = 10;

interface Swing {
  clip: string;
  /** Clip seconds: start, contact, earliest chain into the next swing, end. */
  from: number;
  hit: number;
  chain: number;
  end: number;
  speed: number;
  range: number;
  arc: number;
  dmg: number;
  knock: number;
  lunge: number;
  finisher: boolean;
  /** Slash look: tilt around the facing axis and sweep direction. */
  roll: number;
  dir: number;
}

const COMBO: Swing[] = [
  { clip: "1H_Melee_Attack_Chop", from: 0.26, hit: 0.6, chain: 0.66, end: 0.9, speed: 1.75, range: 2.7, arc: 1.0, dmg: 1, knock: 3.2, lunge: 3.4, finisher: false, roll: 0.42, dir: 1 },
  { clip: "1H_Melee_Attack_Slice_Diagonal", from: 0.24, hit: 0.45, chain: 0.5, end: 0.76, speed: 1.5, range: 2.8, arc: 1.3, dmg: 1.1, knock: 3.2, lunge: 3.2, finisher: false, roll: -0.38, dir: -1 },
  { clip: "1H_Melee_Attack_Stab", from: 0.22, hit: 0.41, chain: 0.62, end: 0.92, speed: 1.4, range: 3.3, arc: 0.62, dmg: 1, knock: 9, lunge: 6, finisher: true, roll: 0, dir: 1 },
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => t * t * (3 - 2 * t);

// --- Public types ----------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "choosing" | "over" | "error";

export interface Hud {
  hp: number;
  maxHp: number;
  potions: number;
  maxPotions: number;
  coins: number;
  /** Spin attack charge 0..1. */
  charge: number;
  /** Roll readiness 0..1. */
  roll: number;
  room: number;
  rooms: number;
  enemies: number;
  boss: { name: string; hp: number; max: number; enraged: boolean } | null;
  /** The door to the next room is open. */
  doorOpen: boolean;
  potionPrice: number;
}

export interface RunSummary {
  won: boolean;
  /** Room reached (1-based). */
  depth: number;
  /** The stage played (0-based) and the stars earned (0 when lost). */
  stage: number;
  stars: number;
  cleared: number;
  kills: number;
  time: number;
  coins: number;
  powers: { name: string; level: number }[];
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  /** Background loading of the later skeletons, 0..1. */
  later(ratio: number): void;
  hud(hud: Hud): void;
  phase(phase: Phase): void;
  choose(options: Offer[]): void;
  banner(title: string, sub?: string): void;
  hurt(): void;
  over(summary: RunSummary): void;
  error(message: string): void;
}

export type Action = "attack" | "roll" | "spin" | "potion";

/** What the shop has equipped (ids from content.ts). */
export interface Loadout {
  hero: string;
  skin: string;
  world: string;
}

/** A power on offer, with how many times it was already taken this run. */
export interface Offer {
  power: Power;
  level: number;
}

type KState = "idle" | "attack" | "block" | "roll" | "spin" | "potion" | "hurt" | "dead" | "cheer";
type Stage = "menu" | "intro" | "enter" | "fight" | "cleared" | "exit" | "transition" | "boss-intro" | "victory" | "dying" | "done";

interface Knight {
  root: THREE.Group;
  anim: Animator;
  mats: THREE.MeshStandardMaterial[];
  shield: THREE.Object3D | null;
  x: number;
  z: number;
  yaw: number;
  targetYaw: number;
  vx: number;
  vz: number;
  mx: number;
  mz: number;
  state: KState;
  t: number;
  combo: number;
  hitDone: boolean;
  whoosh: boolean;
  swing: number;
  blockT: number;
  rollX: number;
  rollZ: number;
  rollCd: number;
  iframes: number;
  healed: boolean;
  spinTicks: number;
  flash: number;
}

/** A hero's model, built once and swapped in and out of the knight's place. */
interface Rig {
  root: THREE.Group;
  model: THREE.Object3D;
  anim: Animator;
  shield: THREE.Object3D | null;
  /** Skin id it wears now. */
  skin: string;
}

interface Bolt {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  active: boolean;
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  speed: number;
  t: number;
  dmg: number;
  owner: Enemy | null;
  reflected: boolean;
  homing: number;
}

interface Pickup {
  kind: "coin" | "potion";
  key: string;
  obj: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  spin: number;
}

// --- Game ------------------------------------------------------------------------------------------

export class CryptKnightGame implements EnemyCtx {
  readonly sfx = new Sfx();
  readonly sparks = new Particles(1600, true);
  readonly dust = new Particles(600, false);
  readonly decals = new Decals(40);
  private readonly slashes = new Slashes(6);
  private readonly popups = new Popups(28);
  private readonly glows = new Glows();
  room!: Room;
  enemies: Enemy[] = [];
  tokens = { melee: 2, cast: 2 };
  depth = 0;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private readonly timer = new THREE.Timer();
  private readonly protos = new Map<string, Proto>();
  private pool!: Pool;
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private readonly moon = new THREE.DirectionalLight("#9fb2ff", 0.75);
  private readonly hemi = new THREE.HemisphereLight("#7d8fe0", "#2a1c17", 0.5);
  private readonly torchLights: THREE.PointLight[] = [];
  private readonly heroLight = new THREE.PointLight("#ffb27a", 10, 12, 2);
  private readonly fade: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly chargeRing: Decal;
  private doorMarker: Decal | null = null;
  private readonly barMats = {
    bg: new THREE.MeshBasicMaterial({ color: "#12080c", transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }),
    lag: new THREE.MeshBasicMaterial({ color: "#ffd2d9", transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }),
  };

  private k!: Knight;
  private assets = new Map<EnemyKind, EnemyAssets>();
  private readonly enemyPool: Enemy[] = [];
  private bolts: Bolt[] = [];
  private readonly boltGeo = new THREE.IcosahedronGeometry(0.2, 1);
  private roomMat: THREE.MeshLambertMaterial | null = null;
  /** Adaptive resolution: drops the pixel ratio when frames run long, restores it when there is headroom. */
  private readonly res = { max: 1, min: 0.75, cur: 1, acc: 0, n: 0, good: 0 };
  private pickups: Pickup[] = [];
  private pickupPool!: Pool;

  private phase: Phase = "loading";
  private stage: Stage = "menu";
  private stageT = 0;
  /** One-shot marker for the current stage. */
  private stageFlag = false;
  private wave = 0;
  private elapsed = 0;
  private runTime = 0;
  private kills = 0;
  private cleared = 0;
  private hp = 100;
  private potions = 2;
  private coins = 0;
  private potionsBought = 0;
  private charge = 0;
  stats: Stats = { ...BASE_STATS };
  private levels: Record<string, number> = {};
  private boss: Enemy | null = null;
  private laterReady = false;

  // Loadout
  private world: WorldDef = WORLDS[0];
  private plans: RoomPlan[] = worldRooms(WORLDS[0]);
  private hero: HeroDef = HEROES[0];
  private skin = SKINS[0].id;
  private readonly rigs = new Map<string, Rig>();
  private readonly heroModels = new Map<string, Promise<LoadedModel | null>>();
  private heroTicket = 0;
  private sizes: Record<string, number> = {};
  /** Skin patterns move with the hero. */
  private readonly skinOrigin = { value: new THREE.Vector3() };
  /** Shop open: the hero turns to show off, and the picture slides clear of the panel (fractions of the view). */
  private showcase = false;
  private readonly shift = { x: 0, y: 0, cx: 0, cy: 0 };
  private view = { w: 1, h: 1 };
  /** Trailer only: the hero fights on its own and never falls. */
  autopilot = false;
  invincible = false;
  /** Trailer only: brings the gameplay camera closer (1 = normal). */
  cinema = 1;
  /** Trailer only: a low camera in front of this enemy, slowly pushing in (the king's entrance). */
  closeUp: { enemy: Enemy; t: number } | null = null;

  // Feel
  private hitStopT = 0;
  private slowT = 0;
  private slowScale = 1;
  private shakeAmt = 0;
  private fadeTarget = 0;
  private camBlend = 0;
  private focus: { x: number; z: number; t: number } | null = null;
  private portrait = false;
  private readonly camPos = new THREE.Vector3();
  private readonly lean = { x: 0, z: 0 };
  private zoom = 0;
  private readonly camLook = new THREE.Vector3();

  // Input
  private readonly keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private touchBlock = false;
  private mouseBlock = false;
  private attackBuf = 0;
  private rollBuf = 0;
  private spinBuf = 0;
  private potionBuf = 0;
  private aimYaw: number | null = null;
  private readonly ndc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hudCache = "";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.res.max = Math.min(window.devicePixelRatio, coarse ? 1.5 : 2);
    this.res.cur = this.res.max;
    this.res.min = Math.min(this.res.max, 0.75);
    this.renderer.setPixelRatio(this.res.cur);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.setupWorld(coarse);
    this.fade = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    this.fade.position.z = -0.3;
    this.fade.renderOrder = 999;
    this.camera.add(this.fade);
    this.scene.add(this.camera);
    // Own decal (outside the pool, so clearing a room never hands it to something else).
    this.chargeRing = new Decal().set("rune", 0, 0, 1.3, "#ff3d6e", { opacity: 0 });
    this.scene.add(this.chargeRing.holder);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ---------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    const bg = new THREE.Color("#07050b");
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 24, 58);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.12;

    scene.add(this.hemi);
    const { moon } = this;
    moon.position.set(-7, 22, 9);
    moon.castShadow = true;
    moon.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.035;
    scene.add(moon, moon.target);

    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight("#ff8a3d", 34, 17, 2);
      this.torchLights.push(l);
      scene.add(l);
    }
    scene.add(this.heroLight);
    scene.add(this.sparks.points, this.dust.points, this.decals.group, this.slashes.group, this.popups.group);
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>, loadout: Loadout) {
    this.sizes = sizes;
    this.hero = findItem(HEROES, loadout.hero);
    this.skin = findItem(SKINS, loadout.skin).id;
    this.world = findItem(WORLDS, loadout.world);
    this.plans = worldRooms(this.world);
    try {
      // The equipped hero loads in the knight's place.
      const first = FIRST_MODELS.map((key) => (key === C.knight ? this.hero.key : key));
      const models = await loadModels(first, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const required = [this.hero.key, C.minion, D.floor, D.wall, D.doorway, D.torch];
      if (!required.every((k) => models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      // Every dungeon piece embeds the same texture atlas: share one cheap Lambert material across all of
      // them (the floor and walls fill the screen, so their shading cost is what matters).
      for (const key of Object.values(D)) {
        models.get(key)?.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const src = mesh.material as THREE.MeshStandardMaterial;
          if (!this.roomMat) {
            this.roomMat = new THREE.MeshLambertMaterial({ map: src.map ?? null });
            this.roomMat.name = "crypt";
          }
          mesh.material = this.roomMat;
          if (src.map && src.map !== this.roomMat.map) src.map.dispose();
          src.dispose();
        });
      }
      for (const key of Object.values(D)) {
        const m = models.get(key);
        if (!m) continue;
        const floor = key.includes("floor-");
        this.protos.set(key, makeProto(m.scene, [], { scale: 1 }, { shadows: !floor && key !== D.torch && key !== D.candles, receive: true }));
      }
      const coin = models.get(D.coin);
      if (coin) this.protos.set("coin-pickup", makeProto(coin.scene.clone(), [], { width: 0.62 }, { shadows: false }));
      const potion = models.get(D.potion);
      if (potion) this.protos.set("potion-pickup", makeProto(potion.scene.clone(), [], { height: 0.85 }, { shadows: true }));

      this.pool = new Pool(this.protos, this.scene);
      this.pickupPool = new Pool(this.protos, this.scene);
      this.room = new Room(this.protos, this.pool, this.decals, this.glows);
      this.scene.add(this.room.group);
      const heroModel = models.get(this.hero.key)!;
      this.heroModels.set(this.hero.key, Promise.resolve(heroModel));
      this.buildKnight(this.buildRig(heroModel, this.hero));
      this.applyWorld();
      this.assets.set("minion", this.enemyAssets(models.get(C.minion)!, models.get(C.blade)));

      // Warm the pools (and shaders) up front so the first fight doesn't hitch.
      for (let i = 0; i < 6; i++) this.makeEnemy("minion");
      for (let i = 0; i < 6; i++) this.makeBolt();
      this.toMenu();
      this.renderer.compile(this.scene, this.camera);
      music.play(CRYPT_EPIC, 0);
      this.setPhase("menu");
      void this.loadLater(sizes);
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  /** Warriors, mages and the Bone King stream in while the first rooms are played. */
  private async loadLater(sizes: Record<string, number>) {
    const models = await loadModels(LATER_MODELS, this.renderer, (p) => !this.disposed && this.events.later(p.ratio), { sizes });
    if (this.disposed) return;
    const warrior = models.get(C.warrior);
    const mage = models.get(C.mage);
    if (warrior) {
      const a = this.enemyAssets(warrior, models.get(C.axe), models.get(C.shieldLarge));
      this.assets.set("warrior", a);
      this.assets.set("boss", a);
    }
    if (mage) this.assets.set("mage", this.enemyAssets(mage, models.get(C.staff)));
    const rogue = models.get(C.rogue);
    if (rogue) {
      this.assets.set("rogue", this.enemyAssets(rogue, models.get(C.blade)));
      this.assets.set("archer", this.enemyAssets(rogue, models.get(C.crossbow)));
    }
    for (const kind of ["warrior", "warrior", "mage", "mage", "rogue", "archer"] as const) if (this.assets.has(kind)) this.makeEnemy(kind);
    this.renderer.compile(this.scene, this.camera);
    this.laterReady = true;
    this.events.later(1);
  }

  private enemyAssets(m: LoadedModel, right?: LoadedModel, left?: LoadedModel): EnemyAssets {
    return { scene: m.scene, clips: m.animations, right: right?.scene, left: left?.scene };
  }

  private buildRig(m: LoadedModel, hero: HeroDef): Rig {
    const model = m.scene;
    for (const name of hero.hide) {
      const o = model.getObjectByName(name);
      if (o) o.visible = false;
    }
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    });
    const root = new THREE.Group();
    root.add(model);
    const rig: Rig = { root, model, anim: new Animator(model, m.animations), shield: hero.shield ? (model.getObjectByName(hero.shield) ?? null) : null, skin: "classic" };
    this.rigs.set(hero.id, rig);
    return rig;
  }

  private buildKnight(rig: Rig) {
    this.k = {
      root: rig.root,
      anim: rig.anim,
      mats: [],
      shield: rig.shield,
      x: 0,
      z: 0,
      yaw: 0,
      targetYaw: 0,
      vx: 0,
      vz: 0,
      mx: 0,
      mz: 0,
      state: "idle",
      t: 0,
      combo: 0,
      hitDone: false,
      whoosh: false,
      swing: 0,
      blockT: 0,
      rollX: 0,
      rollZ: 1,
      rollCd: 0,
      iframes: 0,
      healed: false,
      spinTicks: 0,
      flash: 0,
    };
    this.useRig(rig);
  }

  /** Puts a hero's rig in the knight's place, wearing the equipped skin. */
  private useRig(rig: Rig) {
    const k = this.k;
    if (k.root !== rig.root) k.root.removeFromParent();
    this.scene.add(rig.root);
    if (rig.skin !== this.skin) {
      applySkin(rig.model, findItem(SKINS, this.skin).look, this.skinOrigin);
      rig.skin = this.skin;
    }
    // Hurt flashes light up the (possibly new) materials.
    const mats: THREE.MeshStandardMaterial[] = [];
    rig.model.traverse((o) => {
      const mat = (o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material as THREE.MeshStandardMaterial) : null;
      if (mat && "emissive" in mat && !mats.includes(mat)) mats.push(mat);
    });
    k.root = rig.root;
    k.anim = rig.anim;
    k.mats = mats;
    k.shield = rig.shield;
    k.anim.play("Idle", { fade: 0 });
    this.syncKnight();
  }

  /** Bones and eyes in the world's colours. */
  private dress(e: Enemy) {
    const look = this.world.look;
    if (e.kind === "boss") e.dress(look.king, look.kingEyes);
    else e.dress(look.bones);
  }

  /** Lights, fog, stone and torches in the world's colours. */
  private applyWorld() {
    const look = this.world.look;
    (this.scene.background as THREE.Color).set(look.bg);
    this.scene.fog?.color.set(look.bg);
    this.hemi.color.set(look.sky);
    this.hemi.groundColor.set(look.ground);
    this.moon.color.set(look.moon);
    for (const l of this.torchLights) l.color.set(look.torch);
    this.roomMat?.color.set(look.tint);
    this.room.flame = { flame: look.torch, core: look.core };
    for (const e of this.enemyPool) this.dress(e);
  }

  private makeEnemy(kind: EnemyKind) {
    const assets = this.assets.get(kind) ?? this.assets.get("minion")!;
    const e = new Enemy(kind, assets, this.barMats);
    e.root.visible = false;
    this.dress(e);
    this.scene.add(e.root, e.bar.group);
    this.enemyPool.push(e);
    return e;
  }

  private acquireEnemy(kind: EnemyKind) {
    return this.enemyPool.find((e) => !e.active && e.kind === kind) ?? this.makeEnemy(kind);
  }

  private makeBolt() {
    const mesh = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({ color: "#f3d6ff", toneMapped: false }));
    const glow = this.glows.make("#a24dff", 1.5, 0.9);
    mesh.visible = false;
    glow.visible = false;
    this.scene.add(mesh, glow);
    const b: Bolt = { mesh, glow, active: false, x: 0, y: 0, z: 0, dx: 0, dz: 1, speed: 6, t: 0, dmg: 10, owner: null, reflected: false, homing: 0 };
    this.bolts.push(b);
    return b;
  }

  // --- Public API ----------------------------------------------------------------------------------

  /** Back to the title screen: room one with dormant skeletons, the knight idling. */
  toMenu() {
    this.clearWorld();
    this.depth = 0;
    this.buildRoom(0);
    const k = this.k;
    k.x = 0;
    k.z = 2.6;
    k.yaw = 0;
    k.targetYaw = 0;
    k.state = "idle";
    k.anim.play("Idle", { fade: 0 });
    this.syncKnight();
    // Sleepers: the first room's skeletons lie on the floor until the run starts.
    const spots = [
      { x: -4.6, z: -1.6, yaw: 0.6 },
      { x: 4.2, z: -3.8, yaw: -2.2 },
      { x: -1.2, z: -5.8, yaw: 2.6 },
    ];
    for (const s of spots) this.acquireEnemy("minion").spawn(s.x, s.z, s.yaw, 0, "dormant");
    this.refreshEnemies();
    this.stage = "menu";
    this.camBlend = 0;
    this.fadeTarget = 0;
    this.fade.material.opacity = 1;
    this.focus = null;
    music.play(CRYPT_EPIC, 0);
    music.duck(false);
    if (this.phase !== "loading") this.setPhase("menu");
  }

  /** Starts stage `index` (0-based) of the current world: one room, blessed with a random power for every stage before it. */
  start(index = 0) {
    audio.unlock();
    if (this.stage !== "menu") this.toMenu();
    this.setShowcase(false);
    this.stats = { ...BASE_STATS, ...this.hero.stats };
    this.levels = {};
    this.potions = 2;
    for (let i = 0; i < index; i++) {
      const [p] = rollPowers(this.levels, 1);
      if (!p) break;
      const res = p.apply(this.stats) ?? {};
      this.levels[p.id] = (this.levels[p.id] ?? 0) + 1;
      if (res.potions) this.potions = Math.min(this.stats.maxPotions, this.potions + res.potions);
    }
    this.hp = this.stats.maxHp;
    this.coins = 0;
    this.potionsBought = 0;
    this.charge = 0;
    this.kills = 0;
    this.cleared = 0;
    this.runTime = 0;
    this.wave = 0;
    this.depth = 0;
    this.tokens = { melee: 2, cast: 2 };
    const k = this.k;
    k.state = "idle";
    k.rollCd = 0;
    k.iframes = 0;
    k.flash = 0;
    this.sfx.start();
    music.play(CRYPT_EPIC, 1);
    music.duck(false);
    if (index === 0) {
      // Stage 1 is the title room: the camera swings round and the sleepers get up.
      this.stage = "intro";
      this.stageT = 0;
      this.stageFlag = false;
      this.events.banner(this.world.name, "Stage 1 · wake the dead, then put them back");
    } else {
      this.fade.material.opacity = 1;
      this.enterRoom(index);
    }
    this.setPhase("playing");
    this.emitHud(true);
  }

  /** Shop: swaps the hero, loading its model the first time. False if it could not be shown. */
  async setHero(id: string, progress?: (ratio: number) => void) {
    const hero = findItem(HEROES, id);
    const ticket = ++this.heroTicket;
    let rig = this.rigs.get(hero.id);
    if (!rig) {
      let model = this.heroModels.get(hero.key);
      if (!model) {
        model = loadModels([hero.key], this.renderer, (p) => progress?.(p.ratio), { sizes: this.sizes }).then(
          (m) => m.get(hero.key) ?? null,
          () => null,
        );
        this.heroModels.set(hero.key, model);
      }
      const m = await model;
      if (!m || this.disposed) return false;
      rig = this.rigs.get(hero.id) ?? this.buildRig(m, hero);
    }
    // Another hero was picked meanwhile, or a run started.
    if (ticket !== this.heroTicket || this.stage !== "menu") return false;
    this.hero = hero;
    this.useRig(rig);
    return true;
  }

  setSkin(id: string) {
    this.skin = findItem(SKINS, id).id;
    const rig = this.rigs.get(this.hero.id);
    if (rig) this.useRig(rig);
  }

  /** Shop: moves to another world (rebuilds the title room in its colours). */
  setWorld(id: string) {
    const world = findItem(WORLDS, id);
    if (world === this.world || this.stage !== "menu") return;
    this.world = world;
    this.plans = worldRooms(world);
    this.applyWorld();
    this.toMenu();
  }

  /** Shop open or closed; `shift` is how far to slide the picture (fractions of the view). */
  setShowcase(on: boolean, shift = { x: 0, y: 0 }) {
    this.showcase = on;
    this.shift.x = on ? shift.x : 0;
    this.shift.y = on ? shift.y : 0;
    if (!on && this.stage === "menu") {
      this.k.yaw = 0;
      this.syncKnight();
    }
  }

  /** The hero cheers (bought something). */
  celebrate() {
    if (this.stage !== "menu") return;
    audio.unlock();
    this.k.anim.play("Cheer", { once: true, fade: 0.15 });
    this.sfx.powerUp();
    this.sparks.burst(40, this.k.x, 1.4, this.k.z, { speed: 3.5, up: 4.5, life: 1, size: 0.4, color: "#fff3b0", endColor: "#f59e0b", gravity: 4 });
  }

  /** Trailer only: starts a run straight in room `index` of the current world. */
  jumpTo(index: number) {
    this.start(index);
    this.camBlend = 1;
    this.fade.material.opacity = 0;
  }

  /** Trailer only: runs the game ahead without drawing. */
  warp(seconds: number) {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      if (this.phase === "playing") this.update(dt);
      else if (this.phase === "menu") this.updateMenu(dt);
      this.elapsed += dt;
      this.room.update(dt, this.elapsed);
      this.sparks.update(dt);
      this.dust.update(dt);
      this.decals.update(dt);
      this.slashes.update(dt);
      this.popups.update(dt);
      this.updateCamera(dt);
    }
  }

  pause() {
    if (this.phase !== "playing") return;
    music.duck(true);
    this.clearInput();
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.timer.reset();
    this.setPhase("playing");
  }

  /** Power picked after a cleared room. */
  choosePower(id: string) {
    if (this.phase !== "choosing") return;
    const p = POWERS.find((x) => x.id === id);
    if (p) {
      const res = p.apply(this.stats) ?? {};
      this.levels[id] = (this.levels[id] ?? 0) + 1;
      if (res.heal) this.heal(res.heal);
      if (res.potions) this.potions = Math.min(this.stats.maxPotions, this.potions + res.potions);
      this.hp = Math.min(this.hp, this.stats.maxHp);
      this.sfx.powerUp();
      this.sparks.burst(40, this.k.x, 1.2, this.k.z, { speed: 4, up: 4, life: 0.9, size: 0.4, color: "#ffd1dc", endColor: "#f43f5e", gravity: 3 });
      this.decals.wave(this.k.x, this.k.z, 3.5, "#f43f5e", 0.6);
    }
    this.stage = "exit";
    this.stageT = 0;
    this.room.openDoor();
    this.sfx.door();
    this.doorMarker = this.decals.get().set("rune", 0, -this.room.hd - 1.2, 1.6, "#ffcf6e", { opacity: 0.9 });
    this.events.banner("The door is open", "Head through the far door");
    this.timer.reset();
    this.setPhase("playing");
    this.emitHud(true);
  }

  /** Buys a potion between rooms. */
  buyPotion() {
    const price = this.potionPrice;
    if (this.coins < price || this.potions >= this.stats.maxPotions) {
      this.sfx.denied();
      return false;
    }
    this.coins -= price;
    this.potionsBought++;
    this.potions++;
    this.sfx.buy();
    this.emitHud(true);
    return true;
  }

  get canBuyPotion() {
    return this.coins >= this.potionPrice && this.potions < this.stats.maxPotions;
  }

  get potionPrice() {
    return POTION_PRICE + POTION_PRICE_STEP * this.potionsBought;
  }

  /** Touch / on-screen buttons. */
  press(action: Action) {
    if (this.phase !== "playing") return;
    audio.unlock();
    if (action === "attack") {
      this.attackBuf = 0.35;
      this.aimYaw = null;
    } else if (action === "roll") this.rollBuf = 0.25;
    else if (action === "spin") this.spinBuf = 0.25;
    else this.potionBuf = 0.25;
  }

  setStick(x: number, y: number) {
    this.stick.x = x;
    this.stick.y = y;
  }

  setTouchBlock(on: boolean) {
    this.touchBlock = on;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    music.stop();
    for (const e of this.enemyPool) e.dispose();
    for (const rig of this.rigs.values()) disposeTree(rig.root);
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.sparks.dispose();
    this.dust.dispose();
    this.decals.dispose();
    this.slashes.dispose();
    this.popups.dispose();
    this.glows.dispose();
    this.boltGeo.dispose();
    this.roomMat?.map?.dispose();
    this.roomMat?.dispose();
    this.barMats.bg.dispose();
    this.barMats.lag.dispose();
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

  // --- Input ---------------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.phase !== "playing") return;
    const c = e.code;
    const gameKey = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyJ", "KeyK", "KeyL", "KeyE", "KeyQ", "Space", "ShiftLeft", "ShiftRight"].includes(c);
    if (!gameKey) return;
    e.preventDefault();
    this.keys.add(c);
    if (e.repeat) return;
    if (c === "KeyJ") {
      this.attackBuf = 0.35;
      this.aimYaw = null;
    } else if (c === "Space" || c === "ShiftLeft" || c === "ShiftRight") this.rollBuf = 0.25;
    else if (c === "KeyL" || c === "KeyE") this.spinBuf = 0.25;
    else if (c === "KeyQ") this.potionBuf = 0.25;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clearInput = () => {
    this.keys.clear();
    this.mouseBlock = false;
    this.touchBlock = false;
    this.stick.x = this.stick.y = 0;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || this.phase !== "playing") return;
    if (e.button === 0) {
      this.attackBuf = 0.35;
      this.aimYaw = this.cursorYaw(e);
    }
    this.mouseBlock = (e.buttons & 2) !== 0;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    this.mouseBlock = (e.buttons & 2) !== 0;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    this.mouseBlock = (e.buttons & 2) !== 0;
  };

  /** Direction from the knight to the floor point under the cursor. */
  private cursorYaw(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    const dx = hit.x - this.k.x;
    const dz = hit.z - this.k.z;
    if (Math.hypot(dx, dz) < 0.4) return null;
    return yawTo(dx, dz);
  }

  private get blockHeld() {
    return this.keys.has("KeyK") || this.mouseBlock || this.touchBlock;
  }

  /** Movement input in world space (camera looks north), length 0..1. */
  private moveInput(out: { x: number; z: number }) {
    let x = 0;
    let z = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) z -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) z += 1;
    x += this.stick.x;
    z -= this.stick.y;
    const l = Math.hypot(x, z);
    if (l > 1) {
      x /= l;
      z /= l;
    }
    out.x = x;
    out.z = z;
    return out;
  }

  // --- Frame ---------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const real = Math.min(this.timer.getDelta(), 1 / 20);
    let scale = 1;
    if (this.hitStopT > 0) {
      this.hitStopT -= real;
      scale = 0.03;
    } else if (this.slowT > 0) {
      this.slowT -= real;
      scale = this.slowScale;
    }
    const dt = real * scale;
    const live = this.phase !== "paused" && this.phase !== "loading" && this.phase !== "error";
    if (this.phase === "playing" || this.phase === "menu") this.adaptResolution(real);

    if (this.phase === "playing") this.update(dt);
    else if (this.phase === "menu") this.updateMenu(dt);
    else if (this.phase === "choosing" || this.phase === "over") this.updateAmbient(dt);

    if (live) {
      this.elapsed += dt;
      shaderTime.value = this.elapsed;
      this.room.update(dt, this.elapsed);
      this.updateLights();
      this.sparks.update(dt);
      this.dust.update(dt);
      this.decals.update(dt);
      this.slashes.update(dt);
      this.popups.update(dt);
      for (const e of this.enemyPool) if (e.active) e.bar.update(dt, this.camera);
      this.updateChargeRing();
    }
    if (this.phase !== "loading" && this.phase !== "error") {
      this.updateCamera(this.phase === "paused" ? 0 : real);
      const f = this.fade.material;
      f.opacity = damp(f.opacity, this.fadeTarget, this.fadeTarget > f.opacity ? 9 : 4, real);
      this.fade.visible = f.opacity > 0.003;
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updateMenu(dt: number) {
    const k = this.k;
    k.anim.update(dt);
    if (k.anim.name === "Cheer" && k.anim.finished) k.anim.play("Idle", { fade: 0.3 });
    if (this.showcase) {
      k.yaw = Math.sin(this.elapsed * 0.6) * 0.65;
      this.syncKnight();
    }
    for (const e of this.enemies) e.update(this, dt);
  }

  /** Between rooms (power choice) and after the run: the world keeps breathing, nothing attacks. */
  private updateAmbient(dt: number) {
    const k = this.k;
    k.anim.update(dt);
    this.updateEnemies(dt);
    this.updatePickups(dt);
    if (k.state === "idle") k.anim.play("Idle", { fade: 0.25 });
  }

  private update(dt: number) {
    this.stageT += dt;
    if (this.stage !== "menu" && this.stage !== "victory" && this.stage !== "dying") this.runTime += dt;
    this.attackBuf = Math.max(0, this.attackBuf - dt);
    this.rollBuf = Math.max(0, this.rollBuf - dt);
    this.spinBuf = Math.max(0, this.spinBuf - dt);
    this.potionBuf = Math.max(0, this.potionBuf - dt);
    if (this.autopilot) this.drive();
    if (this.invincible) this.hp = Math.max(this.hp, this.stats.maxHp * 0.9);
    this.updateStage(dt);
    this.updateKnight(dt);
    this.updateEnemies(dt);
    this.updateBolts(dt);
    this.updatePickups(dt);
    this.updateSpikes(dt);
    this.emitHud();
  }

  // --- Rooms ---------------------------------------------------------------------------------------

  private clearWorld() {
    for (const e of this.enemyPool) {
      if (e.active) e.interrupt(this);
      e.active = false;
      e.root.visible = false;
      e.bar.group.visible = false;
    }
    this.enemies = [];
    this.boss = null;
    for (const b of this.bolts) this.killBolt(b);
    for (const p of this.pickups) this.pickupPool.release(p.key, p.obj);
    this.pickups = [];
    this.decals.clear();
    this.sparks.clear();
    this.dust.clear();
    this.slashes.clear();
    this.popups.clear();
    this.doorMarker = null;
    this.tokens = { melee: 2, cast: 2 };
  }

  private buildRoom(index: number) {
    this.clearWorld();
    const plan = this.plans[index];
    this.room.build(plan);
    const { hw, hd } = this.room;
    // Shadow frustum fitted to the room.
    const cam = this.moon.shadow.camera;
    const r = Math.max(hw, hd) + 4;
    Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 70 });
    cam.updateProjectionMatrix();
    this.moon.target.position.set(0, 0, 0);
    this.moon.position.set(-7, 22, 9);
    this.tokens = { melee: index >= 5 ? 4 : index >= 2 ? 3 : 2, cast: index >= 6 ? 3 : 2 };
  }

  private kindReady(kind: EnemyKind) {
    return kind === "minion" || this.assets.has(kind);
  }

  private spawnWave(kinds: EnemyKind[], first = false) {
    const taken: { x: number; z: number }[] = [];
    let delay = first ? 0.2 : 0;
    let alive = this.aliveCount();
    for (const raw of kinds) {
      if (alive++ >= MAX_ALIVE) break;
      const kind = this.kindReady(raw) ? raw : "minion";
      const spot = this.room.freeSpot(this.k.x, this.k.z, 5.5, taken);
      taken.push(spot);
      const e = this.acquireEnemy(kind);
      e.spawn(spot.x, spot.z, yawTo(this.k.x - spot.x, this.k.z - spot.z), this.depth + this.world.tier, "rise", delay);
      e.wave = this.wave;
      const rune = this.decals.get().set("rune", spot.x, spot.z, 1.5, kind === "mage" ? "#b46bff" : kind === "warrior" ? "#ffb347" : kind === "archer" ? "#ffd27a" : "#5fe3ff", { opacity: 1 });
      this.decals.fade(rune, 2.4 + delay);
      delay += 0.28;
    }
    this.refreshEnemies();
    this.sfx.rise();
  }

  private refreshEnemies() {
    this.enemies = this.enemyPool.filter((e) => e.active);
  }

  private aliveCount() {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  private updateStage(dt: number) {
    const plan = this.plans[this.depth];
    const k = this.k;
    switch (this.stage) {
      case "intro": {
        // From the menu: the camera swings round and the sleepers get up.
        if (!this.stageFlag) {
          this.stageFlag = true;
          let i = 0;
          for (const e of this.enemies) {
            e.wake(0.5 + i * 0.45);
            i++;
          }
          this.sfx.rise();
        }
        if (this.stageT > 0.9) {
          this.stage = "fight";
          this.stageT = 0;
          this.wave = 0;
        }
        break;
      }
      case "enter": {
        if (this.stageT > 1.0) {
          this.stage = plan.boss ? "boss-intro" : "fight";
          this.stageT = 0;
          this.wave = 0;
          if (plan.boss) {
            const b = this.boss;
            b?.wake(0.7);
            this.focus = b ? { x: b.x, z: b.z, t: 2.6 } : null;
          } else this.spawnWave(plan.waves[0], true);
        }
        break;
      }
      case "boss-intro": {
        if (this.stageT > 0.8 && this.stageT - dt <= 0.8) {
          this.sfx.roar();
          this.shake(0.7);
          this.events.banner(this.world.boss, `Ruler of ${this.world.name}`);
          music.setIntensity(2);
        }
        if (this.stageT > 2.4) {
          this.stage = "fight";
          this.stageT = 0;
        }
        break;
      }
      case "fight": {
        const alive = this.aliveCount();
        const last = this.wave >= plan.waves.length - 1;
        if (!last && alive <= 1 && this.stageT > 1.5) {
          this.wave++;
          this.spawnWave(plan.waves[this.wave]);
          this.events.banner(`Wave ${this.wave + 1}`, "More bones rise");
        } else if (last && alive === 0 && this.stageT > 0.5 && !plan.boss) this.roomCleared();
        music.setIntensity(plan.boss || alive >= 6 ? 2 : 1);
        break;
      }
      case "cleared": {
        // A stage is one room: once the loose coins are in, it's won.
        if (this.stageT > 1.8) this.finish(true);
        break;
      }
      case "exit": {
        const { hd } = this.room;
        // With the room safe, walking up to a chest is enough to open it.
        for (const c of this.room.chests) if (!c.opened && Math.hypot(c.x - k.x, c.z - k.z) < c.r + 1.1) this.openChest(c);
        if (k.z < -hd - 0.4 && Math.abs(k.x) < 1.5) {
          this.stage = "transition";
          this.stageT = 0;
          this.fadeTarget = 1;
        }
        break;
      }
      case "transition": {
        if (this.stageT > 0.45) this.enterRoom(this.depth + 1);
        break;
      }
      case "victory": {
        if (this.stageT > 1.6 && k.state !== "cheer") {
          k.state = "cheer";
          k.anim.play("Cheer", { fade: 0.3 });
          this.sfx.victory();
        }
        if (this.stageT > 4.2) this.finish(true);
        break;
      }
      case "dying": {
        if (this.stageT > 2.6) this.finish(false);
        break;
      }
      default:
        break;
    }
  }

  private roomCleared() {
    this.stage = "cleared";
    this.stageT = 0;
    this.cleared++;
    this.sfx.roomClear();
    music.setIntensity(0);
    this.heal(this.stats.maxHp * 0.05);
    this.events.banner("Stage cleared", `${this.depth + 1} of ${this.plans.length}`);
    // Loose coins fly to the knight.
    for (const p of this.pickups) p.t = Math.max(p.t, 0.6);
  }

  private enterRoom(index: number) {
    this.depth = index;
    this.buildRoom(index);
    const k = this.k;
    k.x = 0;
    k.z = this.room.hd + 2.6;
    k.yaw = Math.PI;
    k.targetYaw = Math.PI;
    k.vx = k.vz = 0;
    k.state = "idle";
    this.syncKnight();
    this.camPos.set(0, 0, 0);
    const plan = this.plans[index];
    if (plan.boss) {
      const b = this.acquireEnemy("boss");
      b.def = { ...ENEMIES.boss, name: this.world.boss, hp: Math.round(ENEMIES.boss.hp * this.world.bossHp) };
      b.spawn(0, -this.room.hd + 4.5, 0, index, "dormant");
      b.dmgMult = this.world.bossDamage;
      this.boss = b;
      this.refreshEnemies();
      music.setIntensity(1);
    } else music.setIntensity(1);
    this.stage = "enter";
    this.stageT = 0;
    this.fadeTarget = 0;
    const blessed = Object.values(this.levels).reduce((a, b) => a + b, 0);
    this.events.banner(plan.boss ? "The Throne Room" : `Stage ${index + 1}`, blessed ? `Blessed with ${blessed} power${blessed > 1 ? "s" : ""}` : undefined);
    this.emitHud(true);
  }

  private finish(won: boolean) {
    if (this.stage === "done") return;
    this.stage = "done";
    const health = this.hp / this.stats.maxHp;
    const summary: RunSummary = {
      won,
      depth: this.depth + 1,
      stage: this.depth,
      stars: won ? (health >= 0.7 ? 3 : health >= 0.35 ? 2 : 1) : 0,
      cleared: this.cleared,
      kills: this.kills,
      time: Math.round(this.runTime),
      coins: this.coins,
      powers: Object.entries(this.levels).map(([id, level]) => ({ name: POWERS.find((p) => p.id === id)?.name ?? id, level })),
    };
    music.setIntensity(0);
    this.setPhase("over");
    this.events.over(summary);
  }

  // --- Knight --------------------------------------------------------------------------------------

  private readonly mv = { x: 0, z: 0 };
  private stepT = 0;
  /** Brief camera zoom on big hits. */
  private punch = 0;

  private syncKnight() {
    const k = this.k;
    k.root.position.set(k.x, 0, k.z);
    k.root.rotation.y = k.yaw;
    this.skinOrigin.value.set(k.x, 0, k.z);
    this.heroLight.position.set(k.x, 3.6, k.z + 1.2);
  }

  private toIdle(fade = 0.18) {
    const k = this.k;
    k.state = "idle";
    k.t = 0;
    k.anim.play(Math.hypot(k.mx, k.mz) > 0.6 ? "Running_A" : "Idle", { fade });
  }

  private updateKnight(dt: number) {
    const k = this.k;
    k.t += dt;
    k.anim.update(dt);
    k.rollCd = Math.max(0, k.rollCd - dt);
    k.iframes = Math.max(0, k.iframes - dt);
    k.flash = Math.max(0, k.flash - dt * 4);
    const glow = k.flash + (k.iframes > 0 && Math.floor(this.elapsed * 16) % 2 === 0 ? 0.25 : 0);
    for (const m of k.mats) m.emissive.setRGB(glow * 0.55, glow * 0.12, glow * 0.14);

    if (k.state === "dead" || k.state === "cheer") return;
    const auto = this.stage === "enter" || this.stage === "intro" || this.stage === "transition" || this.stage === "victory";
    const move = this.moveInput(this.mv);
    if (this.stage === "enter") {
      move.x = 0;
      move.z = -1;
    } else if (auto) {
      move.x = 0;
      move.z = this.stage === "transition" ? -1 : 0;
    }
    const moving = Math.hypot(move.x, move.z) > 0.08;
    const canAct = !auto && (k.state === "idle" || k.state === "block" || (k.state === "attack" && k.t > 0.05) || (k.state === "hurt" && k.t > 0.22));

    if (canAct && this.rollBuf > 0 && k.rollCd <= 0) this.startRoll(move);
    else if (canAct && this.spinBuf > 0 && this.charge >= 1) this.startSpin();
    else if (canAct && this.potionBuf > 0 && k.state !== "attack" && this.potions > 0 && this.hp < this.stats.maxHp) this.startPotion();
    else if (this.potionBuf > 0 && canAct && k.state !== "attack") {
      this.potionBuf = 0;
      this.popups.show(this.potions <= 0 ? "No potions" : "Health full", k.x, 3, k.z, "#cbd5e1", 0.8);
      this.sfx.denied();
    }

    let speed = 0;
    switch (k.state) {
      case "idle": {
        if (!auto && this.blockHeld) {
          this.startBlock();
          break;
        }
        if (!auto && this.attackBuf > 0) {
          this.startAttack(0, move);
          break;
        }
        speed = this.stats.moveSpeed * (this.stage === "enter" ? 0.75 : 1);
        if (moving) k.yaw = turnTowards(k.yaw, yawTo(move.x, move.z), 15, dt);
        const s = Math.hypot(k.mx, k.mz);
        if (s > 0.6) {
          k.anim.play("Running_A", { fade: 0.15, speed: THREE.MathUtils.clamp(s / 5.6, 0.6, 1.35) });
          // Little puffs of crypt dust at the heels.
          this.stepT -= dt * s;
          if (this.stepT <= 0) {
            this.stepT = 1.9;
            this.dust.emit({ x: k.x - (k.mx / s) * 0.3 + rand(-0.2, 0.2), y: 0.12, z: k.z - (k.mz / s) * 0.3 + rand(-0.2, 0.2), vy: 0.35, vx: -k.mx * 0.05, vz: -k.mz * 0.05, life: 0.7, size: 0.55, endSize: 1.1, color: "#6e5d50", alpha: 0.3, drag: 3 });
          }
        } else k.anim.play("Idle", { fade: 0.2 });
        break;
      }
      case "block": {
        k.blockT += dt;
        if (!this.blockHeld) {
          this.toIdle(0.15);
          break;
        }
        if (this.attackBuf > 0) {
          this.startAttack(0, move);
          break;
        }
        speed = 2.3;
        // Turn towards the way you walk, or towards whoever is winding up an attack.
        if (moving) k.yaw = turnTowards(k.yaw, yawTo(move.x, move.z), 7, dt);
        else {
          const threat = this.nearestThreat();
          if (threat) k.yaw = turnTowards(k.yaw, yawTo(threat.x - k.x, threat.z - k.z), 6, dt);
        }
        if ((k.anim.name === "Block" || k.anim.name === "Block_Hit") && k.anim.finished) k.anim.play("Blocking", { fade: 0.12 });
        break;
      }
      case "attack":
        this.updateAttack(dt, move);
        break;
      case "roll": {
        const p = k.t / ROLL_TIME;
        const v = ((1.5 * this.stats.rollDistance) / ROLL_TIME) * Math.sqrt(Math.max(0, 1 - p));
        k.x += k.rollX * v * dt;
        k.z += k.rollZ * v * dt;
        k.mx = k.rollX * 3;
        k.mz = k.rollZ * 3;
        if (k.t >= ROLL_TIME) {
          k.rollCd = this.stats.rollCooldown;
          this.dust.burst(5, k.x, 0.2, k.z, { speed: 1.2, up: 0.4, life: 0.6, size: 0.8, endSize: 1.4, color: "#6e5d50", alpha: 0.45 });
          this.toIdle(0.12);
        }
        break;
      }
      case "spin":
        this.updateSpin(dt, move);
        speed = 3.4;
        break;
      case "potion": {
        speed = 1.6;
        if (!k.healed && k.t > 0.32) {
          k.healed = true;
          this.potions--;
          const amount = this.stats.maxHp * this.stats.potionHeal;
          this.heal(amount);
          this.popups.show(`+${Math.round(amount)}`, k.x, 3.1, k.z, "#4ade80", 1.1);
          this.sfx.potion();
          this.sparks.burst(30, k.x, 1.2, k.z, { speed: 2.2, up: 3.5, life: 1, size: 0.35, color: "#bbf7d0", endColor: "#16a34a", gravity: -0.5 });
          this.decals.wave(k.x, k.z, 2.2, "#4ade80", 0.5, 0.7);
        }
        if (k.t > 0.72) this.toIdle(0.2);
        break;
      }
      case "hurt":
        if (k.t > 0.34) this.toIdle(0.2);
        break;
      default:
        break;
    }

    // Steering velocity (smoothed), plus knockback.
    const tx = move.x * speed;
    const tz = move.z * speed;
    const accel = k.state === "idle" ? 14 : 9;
    if (k.state !== "roll" && k.state !== "attack") {
      k.mx = damp(k.mx, tx, accel, dt);
      k.mz = damp(k.mz, tz, accel, dt);
      k.x += k.mx * dt;
      k.z += k.mz * dt;
    }
    if (k.vx || k.vz) {
      k.x += k.vx * dt;
      k.z += k.vz * dt;
      const f = Math.exp(-8 * dt);
      k.vx *= f;
      k.vz *= f;
      if (Math.abs(k.vx) + Math.abs(k.vz) < 0.02) k.vx = k.vz = 0;
    }
    this.collideKnight();
    this.syncKnight();
  }

  private collideKnight() {
    const k = this.k;
    const { hw, hd } = this.room;
    if (this.stage !== "enter") {
      for (const c of this.room.colliders) {
        const dx = k.x - c.x;
        const dz = k.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + KNIGHT_R;
        if (d < min && d > 1e-4) {
          k.x = c.x + (dx / d) * min;
          k.z = c.z + (dz / d) * min;
        }
      }
      if (k.state !== "roll" && k.state !== "spin") {
        for (const e of this.enemies) {
          if (!e.alive || e.state === "dormant" || e.y < -0.5) continue;
          const dx = k.x - e.x;
          const dz = k.z - e.z;
          const d = Math.hypot(dx, dz);
          const min = e.radius + KNIGHT_R;
          if (d < min && d > 1e-4) {
            // Mostly the knight gives way to big skeletons, small ones get shoved.
            const share = e.def.mass / (e.def.mass + 1.4);
            const push = min - d;
            k.x += (dx / d) * push * share;
            k.z += (dz / d) * push * share;
            e.x -= (dx / d) * push * (1 - share);
            e.z -= (dz / d) * push * (1 - share);
          }
        }
      }
      const doorway = this.room.doorReady && Math.abs(k.x) < 1.4;
      k.x = THREE.MathUtils.clamp(k.x, doorway && k.z < -hd ? -1.2 : -hw + KNIGHT_R, doorway && k.z < -hd ? 1.2 : hw - KNIGHT_R);
      k.z = THREE.MathUtils.clamp(k.z, doorway ? -hd - 3 : -hd + KNIGHT_R, hd - KNIGHT_R);
    }
  }

  private nearestThreat() {
    let best: Enemy | null = null;
    let bd = 9;
    for (const e of this.enemies) {
      if (!e.alive || (e.state !== "windup" && e.state !== "chase")) continue;
      const d = Math.hypot(e.x - this.k.x, e.z - this.k.z) - (e.state === "windup" ? 3 : 0);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** Soft lock: the enemy that best matches the direction you are pushing (or facing). */
  private pickTarget(dirYaw: number, range = 6.5) {
    let best: Enemy | null = null;
    let score = Infinity;
    for (const e of this.enemies) {
      if (!e.hittable) continue;
      const dx = e.x - this.k.x;
      const dz = e.z - this.k.z;
      const d = Math.hypot(dx, dz) - e.radius;
      if (d > range) continue;
      const a = Math.abs(angleDiff(dirYaw, yawTo(dx, dz)));
      if (a > 1.9 && d > 1.4) continue;
      const s = d + a * 2.2;
      if (s < score) {
        score = s;
        best = e;
      }
    }
    return best;
  }

  private startAttack(step: number, move: { x: number; z: number }) {
    const k = this.k;
    const a = COMBO[step];
    k.state = "attack";
    k.t = 0;
    k.combo = step;
    k.hitDone = false;
    k.whoosh = false;
    k.swing++;
    this.attackBuf = 0;
    const moving = Math.hypot(move.x, move.z) > 0.2;
    const want = this.aimYaw ?? (moving ? yawTo(move.x, move.z) : k.yaw);
    const target = this.aimYaw === null ? this.pickTarget(want) : this.pickTarget(want, 4);
    k.targetYaw = target ? yawTo(target.x - k.x, target.z - k.z) : want;
    this.aimYaw = null;
    k.anim.play(a.clip, { once: true, fade: 0.07, speed: a.speed * this.stats.attackSpeed, from: a.from });
    k.mx = k.mz = 0;
  }

  private updateAttack(dt: number, move: { x: number; z: number }) {
    const k = this.k;
    const a = COMBO[k.combo];
    const time = k.anim.time;
    k.yaw = turnTowards(k.yaw, k.targetYaw, 24, dt);
    if (time < a.hit) {
      // Lunge into the swing unless someone is already in your face.
      const fx = Math.sin(k.yaw);
      const fz = Math.cos(k.yaw);
      const crowded = this.enemies.some((e) => e.hittable && Math.hypot(e.x - k.x, e.z - k.z) < e.radius + 1.2 && (e.x - k.x) * fx + (e.z - k.z) * fz > 0);
      if (!crowded) {
        const p = (time - a.from) / Math.max(0.01, a.hit - a.from);
        const v = a.lunge * Math.max(0, 1 - p);
        k.x += fx * v * dt;
        k.z += fz * v * dt;
      }
    }
    if (!k.whoosh && time >= a.hit - 0.1) {
      k.whoosh = true;
      this.sfx.swing(k.combo);
    }
    if (!k.hitDone && time >= a.hit) {
      k.hitDone = true;
      this.swingHit(a);
    }
    if (!k.hitDone) return;
    if (this.attackBuf > 0 && time >= a.chain) {
      this.startAttack(k.combo < 2 ? k.combo + 1 : 0, move);
      return;
    }
    if (this.blockHeld && time >= a.chain) {
      this.startBlock();
      return;
    }
    if (Math.hypot(move.x, move.z) > 0.3 && time >= a.chain + 0.05) {
      this.toIdle(0.2);
      return;
    }
    if (time >= a.end) this.toIdle(0.25);
  }

  private swingHit(a: Swing) {
    const k = this.k;
    const fx = Math.sin(k.yaw);
    const fz = Math.cos(k.yaw);
    const dmg = this.stats.damage * a.dmg * (a.finisher ? this.stats.finisherMult : 1);
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.hittable || e.lastSwing === k.swing) continue;
      const dx = e.x - k.x;
      const dz = e.z - k.z;
      const d = Math.hypot(dx, dz);
      if (d - e.radius > a.range) continue;
      if (d > 1.3 + e.radius && Math.abs(angleDiff(k.yaw, yawTo(dx, dz))) > a.arc) continue;
      e.lastSwing = k.swing;
      this.damageEnemy(e, dmg, { heavy: a.finisher, knock: a.knock, fromX: k.x, fromZ: k.z, sword: true });
      hits++;
    }
    this.hitProps(k.x, k.z, a.range, a.arc, k.yaw);
    // Swords swat bolts out of the air.
    for (const b of this.bolts) {
      if (!b.active || b.reflected) continue;
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      if (Math.hypot(dx, dz) < a.range + 0.3 && Math.abs(angleDiff(k.yaw, yawTo(dx, dz))) < a.arc + 0.3) {
        this.sparks.burst(14, b.x, b.y, b.z, { speed: 5, up: 2, life: 0.4, size: 0.3, color: "#f0d0ff", endColor: "#7c3aed" });
        this.sfx.fizzle();
        this.killBolt(b);
      }
    }
    const roll = a.roll;
    this.slashes.spawn(k.x - fx * 0.2, 1.25, k.z - fz * 0.2, k.yaw, { roll, scale: a.range / 2.45, dir: a.dir, dur: 0.2, color: a.finisher ? "#ffb4c4" : "#ff5c80", pitch: a.finisher ? 0 : 0.12 });
    if (a.finisher) this.sparks.burst(10, k.x + fx * 2.4, 1.2, k.z + fz * 2.4, { speed: 3, life: 0.3, size: 0.28, color: "#ffffff", endColor: "#f43f5e", dirX: fx, dirZ: fz });
    if (a.finisher && this.stats.finisherWave) {
      const wx = k.x + fx * 1.6;
      const wz = k.z + fz * 1.6;
      this.decals.wave(wx, wz, 3.6, "#ff4d6d", 0.45);
      for (const e of this.enemies) {
        if (!e.hittable || e.lastSwing === k.swing) continue;
        if (Math.hypot(e.x - wx, e.z - wz) - e.radius < 3.4) {
          e.lastSwing = k.swing;
          this.damageEnemy(e, dmg * 0.5, { heavy: true, knock: 6, fromX: wx, fromZ: wz, sword: false });
          hits++;
        }
      }
    }
    if (hits) {
      this.hitStop(a.finisher ? 0.1 : 0.06);
      this.shake(a.finisher ? 0.32 : 0.15);
      if (a.finisher) this.punch = 1;
    }
  }

  /** Crates, barrels and chests in front of a swing. */
  private hitProps(x: number, z: number, range: number, arc: number, yaw: number) {
    for (const b of this.room.breakables) {
      if (b.broken) continue;
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.hypot(dx, dz);
      if (d - b.r > range) continue;
      if (arc < Math.PI && d > 1.2 && Math.abs(angleDiff(yaw, yawTo(dx, dz))) > arc) continue;
      this.breakProp(b);
    }
    for (const c of this.room.chests) {
      if (c.opened) continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const d = Math.hypot(dx, dz);
      if (d - c.r > range) continue;
      if (arc < Math.PI && d > 1.4 && Math.abs(angleDiff(yaw, yawTo(dx, dz))) > arc) continue;
      this.openChest(c);
    }
  }

  private damageEnemy(e: Enemy, amount: number, o: { heavy: boolean; knock: number; fromX: number; fromZ: number; sword: boolean; spin?: boolean }) {
    let dmg = amount * rand(0.9, 1.1);
    const crit = Math.random() < this.stats.crit;
    if (crit) dmg *= 2;
    if (e.state === "stun") dmg *= 1.5;
    if (e.kind === "boss" && e.attack?.kind === "summon") dmg *= 1.4;
    const dx = e.x - o.fromX;
    const dz = e.z - o.fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;
    const hy = e.def.height * 0.5;
    // Warriors raise their shield against plain hits from the front.
    const facing = Math.abs(angleDiff(e.yaw, yawTo(-dx, -dz))) < 1.0;
    if (o.sword && !o.heavy && e.def.blockChance > 0 && facing && (e.state === "chase" || e.state === "block") && Math.random() < e.def.blockChance) {
      e.block(this);
      dmg *= 0.15;
      this.sfx.clang();
      this.sparks.burst(16, e.x - nx * 0.6, hy, e.z - nz * 0.6, { speed: 6, up: 2, life: 0.35, size: 0.22, color: "#fff7d6", endColor: "#ff9f1c", dirX: -nx, dirZ: -nz });
      this.popups.show("Block", e.x, e.topY + 0.4, e.z, "#cbd5e1", 0.8);
      e.hp -= dmg;
      e.vx += nx * 1.5;
      e.vz += nz * 1.5;
      this.k.vx -= nx * 2;
      this.k.vz -= nz * 2;
      this.updateBar(e);
      if (e.hp <= 0) this.killEnemy(e);
      return;
    }
    e.hp -= dmg;
    e.flash = 1;
    this.updateBar(e);
    this.sfx.hit(o.heavy);
    this.sparks.burst(o.heavy ? 22 : 12, e.x - nx * 0.3, hy, e.z - nz * 0.3, { speed: o.heavy ? 8 : 6, up: 2.5, life: 0.35, size: 0.24, color: "#ffffff", endColor: "#ff4d6d", dirX: nx, dirZ: nz, spread: 0.9 });
    this.dust.burst(o.heavy ? 6 : 3, e.x, hy, e.z, { speed: 2.5, up: 2, life: 0.6, size: 0.3, endSize: 0.15, color: "#efe4cf", alpha: 0.9, gravity: 9, dirX: nx, dirZ: nz });
    this.popups.show(`${Math.round(dmg)}${crit ? "!" : ""}`, e.x + rand(-0.3, 0.3), e.topY + 0.3, e.z, crit ? "#fde047" : o.heavy ? "#ffd1dc" : "#ffffff", crit || o.heavy ? 1.25 : 0.95);
    const kb = o.knock / e.def.mass;
    e.vx += nx * kb;
    e.vz += nz * kb;
    if (o.sword || o.spin) this.charge = Math.min(1, this.charge + this.stats.chargeGain * (o.spin ? 0 : 1));
    if (this.stats.lifesteal > 0) this.heal(dmg * this.stats.lifesteal);
    if (e.hp <= 0) this.killEnemy(e);
    else e.hurt(this, o.heavy);
  }

  private updateBar(e: Enemy) {
    e.bar.set(e.hp / e.maxHp);
    if (e.kind !== "boss") e.bar.group.visible = e.hp > 0;
  }

  private killEnemy(e: Enemy) {
    if (e.state === "dead") return;
    e.die(this);
    this.kills++;
    this.sfx.boneBreak();
    this.dust.burst(10, e.x, 1, e.z, { speed: 3.5, up: 3, life: 0.8, size: 0.3, endSize: 0.12, color: "#efe4cf", alpha: 0.9, gravity: 10 });
    this.sparks.burst(10, e.x, 1.4, e.z, { speed: 3, up: 2, life: 0.5, size: 0.35, color: "#7cf7ff", endColor: "#1e3a8a" });
    const [lo, hi] = e.def.coins;
    this.dropCoins(e.x, e.z, Math.round(rand(lo, hi + 0.99) * this.stats.coinMult));
    if (e.kind !== "boss" && Math.random() < 0.03) this.dropPotion(e.x, e.z);
    if (e.kind === "boss") this.bossDefeated(e);
  }

  private bossDefeated(e: Enemy) {
    this.stage = "victory";
    this.stageT = 0;
    this.slowMo(0.25, 1.4);
    this.shake(1);
    this.sfx.slam();
    this.decals.wave(e.x, e.z, 9, "#ff2346", 1.2);
    this.sparks.burst(80, e.x, 2.5, e.z, { speed: 9, up: 6, life: 1.4, size: 0.45, color: "#ffd1dc", endColor: "#f43f5e", gravity: 4 });
    for (const o of this.enemies) if (o !== e && o.alive) this.killEnemy(o);
    for (const b of this.bolts) this.killBolt(b);
    this.cleared++;
    this.events.banner("Victory!", `${this.world.boss} falls`);
    music.setIntensity(0);
  }

  private startBlock() {
    const k = this.k;
    k.state = "block";
    k.t = 0;
    k.blockT = 0;
    k.anim.play("Block", { once: true, fade: 0.06, speed: 2.4, from: 0.1 });
  }

  private startRoll(move: { x: number; z: number }) {
    const k = this.k;
    this.rollBuf = 0;
    const l = Math.hypot(move.x, move.z);
    if (l > 0.15) {
      k.rollX = move.x / l;
      k.rollZ = move.z / l;
    } else {
      k.rollX = Math.sin(k.yaw);
      k.rollZ = Math.cos(k.yaw);
    }
    k.yaw = yawTo(k.rollX, k.rollZ);
    k.state = "roll";
    k.t = 0;
    k.anim.play("Dodge_Forward", { once: true, fade: 0.05, speed: 0.4 / ROLL_TIME });
    this.sfx.roll();
    this.dust.burst(6, k.x, 0.2, k.z, { speed: 1.5, up: 0.5, life: 0.6, size: 0.9, endSize: 1.6, color: "#6e5d50", alpha: 0.5 });
  }

  private startSpin() {
    const k = this.k;
    this.spinBuf = 0;
    this.charge = 0;
    k.state = "spin";
    k.t = 0;
    k.spinTicks = 0;
    k.anim.play("2H_Melee_Attack_Spinning", { fade: 0.08, speed: 1.55 });
    this.sfx.spin();
    this.decals.wave(k.x, k.z, this.stats.spinRadius * 1.2, "#ff3d6e", 0.5);
  }

  private updateSpin(dt: number, move: { x: number; z: number }) {
    const k = this.k;
    void move;
    void dt;
    const ticks = [0.12, 0.45, 0.78];
    if (k.spinTicks < ticks.length && k.t >= ticks[k.spinTicks]) {
      k.spinTicks++;
      k.swing++;
      const r = this.stats.spinRadius;
      let hits = 0;
      for (const e of this.enemies) {
        if (!e.hittable) continue;
        if (Math.hypot(e.x - k.x, e.z - k.z) - e.radius > r) continue;
        this.damageEnemy(e, this.stats.damage * this.stats.spinDamage * 0.75, { heavy: true, knock: 7, fromX: k.x, fromZ: k.z, sword: false, spin: true });
        hits++;
      }
      this.hitProps(k.x, k.z, r, Math.PI, 0);
      for (const b of this.bolts) {
        if (b.active && !b.reflected && Math.hypot(b.x - k.x, b.z - k.z) < r + 0.3) {
          this.sparks.burst(10, b.x, b.y, b.z, { speed: 4, life: 0.35, size: 0.3, color: "#f0d0ff", endColor: "#7c3aed" });
          this.killBolt(b);
        }
      }
      this.slashes.spawn(k.x, 1.05, k.z, k.yaw, { ring: true, scale: r / 3.2, dur: 0.28, color: "#ff3d6e" });
      this.dust.burst(10, k.x, 0.2, k.z, { speed: 6, up: 0.4, life: 0.5, size: 0.9, endSize: 1.6, color: "#6e5d50", alpha: 0.45, drag: 4 });
      if (hits) {
        this.hitStop(0.05);
        this.shake(0.25);
      }
    }
    if (Math.random() < dt * 60) {
      const a = Math.random() * Math.PI * 2;
      const r = this.stats.spinRadius * rand(0.5, 1);
      this.sparks.emit({ x: k.x + Math.cos(a) * r, y: rand(0.6, 1.6), z: k.z + Math.sin(a) * r, vx: -Math.sin(a) * 6, vz: Math.cos(a) * 6, life: 0.25, size: 0.3, color: "#ffc2d0", endColor: "#e11d48" });
    }
    if (k.t >= SPIN_TIME) this.toIdle(0.2);
  }

  private startPotion() {
    const k = this.k;
    this.potionBuf = 0;
    k.state = "potion";
    k.t = 0;
    k.healed = false;
    k.anim.play("Use_Item", { once: true, fade: 0.1, speed: 2.1, from: 0.25 });
  }

  private heal(amount: number) {
    this.hp = Math.min(this.stats.maxHp, this.hp + amount);
  }

  /** Something tries to hurt the knight. */
  private hitKnight(dmg: number, fromX: number, fromZ: number, o: { blockable: boolean; knock: number; source?: Enemy | null; bolt?: Bolt }): "dodged" | "blocked" | "parried" | "hit" {
    const k = this.k;
    if (k.state === "dead" || this.stage === "victory" || this.stage === "dying" || this.stage === "done") return "dodged";
    if ((k.state === "roll" && k.t < IFRAME_END) || k.state === "spin" || k.iframes > 0) {
      if (k.state === "roll" && !o.bolt) this.popups.show("Dodge", k.x, 2.9, k.z, "#a5f3fc", 0.75);
      return "dodged";
    }
    const dx = fromX - k.x;
    const dz = fromZ - k.z;
    const d = Math.hypot(dx, dz) || 1;
    const facing = Math.abs(angleDiff(k.yaw, yawTo(dx, dz))) < 1.5;
    const sp = new THREE.Vector3();
    if (k.shield) k.shield.getWorldPosition(sp);
    else sp.set(k.x + (dx / d) * 0.6, 1.2, k.z + (dz / d) * 0.6);
    if (k.state === "block" && o.blockable && facing) {
      if (k.blockT <= this.stats.parryWindow) {
        // Parry!
        this.sfx.parry();
        this.sparks.burst(36, sp.x, sp.y, sp.z, { speed: 9, up: 3, life: 0.45, size: 0.3, color: "#ffffff", endColor: "#fbbf24" });
        this.decals.wave(k.x, k.z, 3, "#fde68a", 0.4);
        this.popups.show("Parry!", k.x, 3.2, k.z, "#fde047", 1.3);
        this.slowMo(0.25, 0.32);
        this.shake(0.3);
        this.punch = 1.3;
        this.charge = Math.min(1, this.charge + 0.25);
        k.anim.play("Block_Hit", { once: true, fade: 0.04, speed: 1.6 });
        k.blockT = this.stats.parryWindow + 0.01;
        if (o.source) {
          o.source.stun(this, o.source.kind === "boss" ? 2.0 : 1.7);
          if (this.stats.parryDamage > 0) this.damageEnemy(o.source, this.stats.damage * this.stats.parryDamage, { heavy: true, knock: 6, fromX: k.x, fromZ: k.z, sword: false });
        }
        return "parried";
      }
      const taken = dmg * (1 - this.stats.blockReduce);
      this.hp -= taken;
      this.sfx.clang();
      this.sparks.burst(14, sp.x, sp.y, sp.z, { speed: 6, up: 2, life: 0.3, size: 0.24, color: "#fff7d6", endColor: "#ff9f1c" });
      if (taken >= 1) this.popups.show(`${Math.round(taken)}`, k.x, 3, k.z, "#fca5a5", 0.8);
      k.anim.play("Block_Hit", { once: true, fade: 0.04, speed: 1.6 });
      k.vx -= (dx / d) * o.knock * 0.4;
      k.vz -= (dz / d) * o.knock * 0.4;
      this.shake(0.12);
      if (this.hp <= 0) this.knightDies();
      return "blocked";
    }
    this.hp -= dmg;
    k.flash = 1;
    k.iframes = 0.55;
    k.vx -= (dx / d) * o.knock;
    k.vz -= (dz / d) * o.knock;
    this.sfx.hurt();
    this.shake(0.38);
    this.hitStop(0.05);
    this.events.hurt();
    this.popups.show(`-${Math.round(dmg)}`, k.x, 3.1, k.z, "#f87171", 1.05);
    this.sparks.burst(10, k.x, 1.3, k.z, { speed: 4, up: 2, life: 0.35, size: 0.25, color: "#ffffff", endColor: "#ef4444" });
    if (this.hp <= 0) {
      this.knightDies();
      return "hit";
    }
    k.state = "hurt";
    k.t = 0;
    k.anim.play(Math.random() < 0.5 ? "Hit_A" : "Hit_B", { once: true, fade: 0.05, speed: 1.3 });
    return "hit";
  }

  private knightDies() {
    const k = this.k;
    this.hp = 0;
    k.state = "dead";
    k.anim.play("Death_A", { once: true, fade: 0.1, speed: 0.8 });
    this.stage = "dying";
    this.stageT = 0;
    this.slowMo(0.3, 1.2);
    this.sfx.playerDeath();
    music.setIntensity(0);
    for (const e of this.enemies) e.interrupt(this);
  }

  // --- EnemyCtx ------------------------------------------------------------------------------------

  get px() {
    return this.k.x;
  }

  get pz() {
    return this.k.z;
  }

  get playerDown() {
    return this.k.state === "dead" || this.stage === "victory" || this.stage === "done";
  }

  meleeStrike(e: Enemy, atk: AttackDef) {
    const k = this.k;
    const dx = k.x - e.x;
    const dz = k.z - e.z;
    const d = Math.hypot(dx, dz);
    const dmg = e.def.damage * atk.damage * e.dmgMult;
    if (d <= atk.range + KNIGHT_R * 0.5 && (d < e.radius + 0.6 || Math.abs(angleDiff(e.yaw, yawTo(dx, dz))) <= atk.arc + 0.12)) {
      this.hitKnight(dmg, e.x, e.z, { blockable: atk.blockable, knock: atk.knock, source: e });
    }
    if (e.kind === "boss" || atk.heavy) this.shake(e.kind === "boss" ? 0.35 : 0.15);
    // Their swings also smash crates in the way.
    this.hitProps(e.x, e.z, atk.range * 0.8, atk.arc, e.yaw);
  }

  areaStrike(e: Enemy, x: number, z: number, radius: number, damage: number, knock: number, blockable: boolean) {
    const k = this.k;
    if (Math.hypot(k.x - x, k.z - z) <= radius + KNIGHT_R * 0.5) this.hitKnight(damage, x, z, { blockable, knock, source: blockable ? e : null });
  }

  spawnBolt(e: Enemy, x: number, y: number, z: number, yaw: number, speed: number, damage: number) {
    const b = this.bolts.find((x) => !x.active) ?? this.makeBolt();
    b.active = true;
    b.x = x;
    b.y = y;
    b.z = z;
    b.dx = Math.sin(yaw);
    b.dz = Math.cos(yaw);
    b.speed = speed;
    b.t = 0;
    b.dmg = damage;
    b.owner = e;
    b.reflected = false;
    b.homing = e.kind === "mage" ? 1.1 : 0;
    b.mesh.visible = true;
    b.glow.visible = true;
    (b.mesh.material as THREE.MeshBasicMaterial).color.set(e.kind === "archer" ? "#fff1c9" : "#f3d6ff");
    (b.glow.material as THREE.SpriteMaterial).color.set(e.kind === "boss" ? "#ff2d55" : e.kind === "archer" ? "#ff9a1f" : "#a24dff");
  }

  summon(kinds: EnemyKind[], near: { x: number; z: number }) {
    const taken: { x: number; z: number }[] = [];
    let delay = 0;
    let alive = this.aliveCount();
    for (const raw of kinds) {
      if (alive++ >= MAX_ALIVE) break;
      const kind = this.kindReady(raw) ? raw : "minion";
      let spot = { x: near.x, z: near.z };
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = rand(3, 6);
        const c = { x: near.x + Math.cos(a) * r, z: near.z + Math.sin(a) * r };
        if (Math.abs(c.x) > this.room.hw - 1.5 || Math.abs(c.z) > this.room.hd - 1.5) continue;
        if (this.room.blocked(c.x, c.z, 1) || taken.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 2)) continue;
        if (Math.hypot(c.x - this.k.x, c.z - this.k.z) < 2.5) continue;
        spot = c;
        break;
      }
      taken.push(spot);
      const e = this.acquireEnemy(kind);
      e.spawn(spot.x, spot.z, yawTo(this.k.x - spot.x, this.k.z - spot.z), this.depth - 2 + this.world.tier, "rise", delay);
      const rune = this.decals.get().set("rune", spot.x, spot.z, 1.5, "#b46bff", { opacity: 1 });
      this.decals.fade(rune, 2.4 + delay);
      delay += 0.3;
    }
    this.refreshEnemies();
    this.sfx.rise();
  }

  shake(n: number) {
    this.shakeAmt = Math.max(this.shakeAmt, n);
  }

  bossRoar(e: Enemy) {
    this.sfx.roar();
    this.shake(0.8);
    this.decals.wave(e.x, e.z, 8, "#ff2346", 0.8);
    this.events.banner(`${this.world.boss} is enraged!`, "Watch for bone shards");
    const k = this.k;
    const dx = k.x - e.x;
    const dz = k.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < 7) {
      k.vx += (dx / d) * 9;
      k.vz += (dz / d) * 9;
    }
  }

  private hitStop(s: number) {
    this.hitStopT = Math.max(this.hitStopT, s);
  }

  private slowMo(scale: number, s: number) {
    this.slowScale = scale;
    this.slowT = Math.max(this.slowT, s);
  }

  // --- Enemies, bolts, pickups, traps -------------------------------------------------------------

  private updateEnemies(dt: number) {
    let changed = false;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (!e.update(this, dt)) changed = true;
      // Dust while clawing out of the floor.
      if (e.state === "rise" && e.risen && e.t < 1.3 && Math.random() < dt * 22) {
        const a = Math.random() * Math.PI * 2;
        this.dust.emit({ x: e.x + Math.cos(a) * 0.8, y: 0.15, z: e.z + Math.sin(a) * 0.8, vx: Math.cos(a) * 1.2, vy: rand(0.4, 1.4), vz: Math.sin(a) * 1.2, life: 0.9, size: 0.9, endSize: 1.7, color: "#5c4d43", alpha: 0.5 });
      }
      if (e.bar.group.visible) e.bar.group.position.set(e.x, e.topY + 0.35, e.z);
    }
    if (changed) this.refreshEnemies();
  }

  private killBolt(b: Bolt) {
    b.active = false;
    b.mesh.visible = false;
    b.glow.visible = false;
  }

  private updateBolts(dt: number) {
    const k = this.k;
    const { hw, hd } = this.room;
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.t += dt;
      if (!b.reflected && b.homing > 0 && b.t < 1.0 && k.state !== "dead") {
        const cur = yawTo(b.dx, b.dz);
        const want = yawTo(k.x - b.x, k.z - b.z);
        const next = turnTowards(cur, want, b.homing, dt);
        b.dx = Math.sin(next);
        b.dz = Math.cos(next);
      }
      b.x += b.dx * b.speed * dt;
      b.z += b.dz * b.speed * dt;
      const pulse = 1 + Math.sin(b.t * 30) * 0.12;
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.scale.setScalar(pulse);
      b.glow.position.set(b.x, b.y, b.z);
      b.glow.scale.setScalar(1.6 * pulse);
      if (Math.random() < dt * 50)
        this.sparks.emit({ x: b.x + rand(-0.1, 0.1), y: b.y + rand(-0.1, 0.1), z: b.z + rand(-0.1, 0.1), vx: -b.dx, vz: -b.dz, life: 0.4, size: 0.32, color: b.reflected ? "#fde68a" : "#d8b4fe", endColor: b.reflected ? "#f59e0b" : "#5b21b6" });

      let dead = b.t > 5 || Math.abs(b.x) > hw + 0.3 || Math.abs(b.z) > hd + 0.6;
      if (!dead) for (const c of this.room.colliders) if (Math.hypot(b.x - c.x, b.z - c.z) < c.r * 0.85) dead = true;
      if (dead) {
        this.sparks.burst(8, b.x, b.y, b.z, { speed: 3, life: 0.3, size: 0.3, color: "#e9d5ff", endColor: "#6d28d9" });
        this.killBolt(b);
        continue;
      }
      if (b.reflected) {
        for (const e of this.enemies) {
          if (!e.hittable || Math.hypot(e.x - b.x, e.z - b.z) > e.radius + 0.45) continue;
          this.damageEnemy(e, Math.max(b.dmg, this.stats.damage) * 2, { heavy: true, knock: 5, fromX: b.x - b.dx, fromZ: b.z - b.dz, sword: false });
          this.killBolt(b);
          break;
        }
        continue;
      }
      if (Math.hypot(k.x - b.x, k.z - b.z) < KNIGHT_R + 0.3) {
        const res = this.hitKnight(b.dmg, b.x - b.dx, b.z - b.dz, { blockable: true, knock: 3, bolt: b });
        if (res === "dodged") continue;
        if (res === "parried") {
          // Sent back where it came from.
          const o = b.owner && b.owner.alive ? b.owner : null;
          const yaw = o ? yawTo(o.x - b.x, o.z - b.z) : yawTo(-b.dx, -b.dz);
          b.dx = Math.sin(yaw);
          b.dz = Math.cos(yaw);
          b.speed *= 1.7;
          b.reflected = true;
          b.t = 0;
          (b.mesh.material as THREE.MeshBasicMaterial).color.set("#fff1c1");
          (b.glow.material as THREE.SpriteMaterial).color.set("#fbbf24");
          continue;
        }
        this.sfx.fizzle();
        this.sparks.burst(12, b.x, b.y, b.z, { speed: 4, life: 0.35, size: 0.3, color: "#f5d0fe", endColor: "#7c3aed" });
        this.killBolt(b);
      }
    }
  }

  private dropCoins(x: number, z: number, n: number) {
    for (let i = 0; i < n; i++) this.addPickup("coin", x, 1.2, z);
  }

  private dropPotion(x: number, z: number) {
    this.addPickup("potion", x, 1.2, z);
  }

  private addPickup(kind: "coin" | "potion", x: number, y: number, z: number) {
    const key = kind === "coin" ? "coin-pickup" : "potion-pickup";
    if (!this.protos.has(key)) return;
    const obj = this.pickupPool.get(key);
    obj.rotation.order = "YXZ";
    const a = Math.random() * Math.PI * 2;
    const s = rand(1.5, 3.5);
    this.pickups.push({ kind, key, obj, x, y, z, vx: Math.cos(a) * s, vy: rand(4, 7), vz: Math.sin(a) * s, t: 0, spin: Math.random() * 6 });
    obj.position.set(x, y, z);
  }

  private updatePickups(dt: number) {
    const k = this.k;
    const { hw, hd } = this.room;
    this.pickups = this.pickups.filter((p) => {
      p.t += dt;
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      const d = Math.hypot(dx, dz);
      const wantsPotion = p.kind === "potion" && this.potions < this.stats.maxPotions;
      const magnet = k.state !== "dead" && p.t > 0.7 && (p.kind === "coin" ? d < 7 || this.stage !== "fight" : wantsPotion && d < 3.5);
      if (magnet) {
        const pull = 14 + p.t * 6;
        p.vx = damp(p.vx, (dx / (d || 1)) * pull, 6, dt);
        p.vz = damp(p.vz, (dz / (d || 1)) * pull, 6, dt);
        p.vy = damp(p.vy, (1.2 - p.y) * 6, 6, dt);
      } else {
        p.vy -= 22 * dt;
        p.vx *= Math.exp(-1.5 * dt);
        p.vz *= Math.exp(-1.5 * dt);
      }
      p.x = THREE.MathUtils.clamp(p.x + p.vx * dt, -hw + 0.4, hw - 0.4);
      p.z = THREE.MathUtils.clamp(p.z + p.vz * dt, -hd + 0.4, hd - 0.4);
      p.y += p.vy * dt;
      const rest = p.kind === "coin" ? 0.38 : 0;
      if (p.y < rest) {
        p.y = rest;
        p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.4 : 0;
      }
      p.spin += dt * (p.kind === "coin" ? 5 : 1.6);
      p.obj.position.set(p.x, p.y + (p.kind === "potion" && !magnet && p.y <= 0.01 ? 0.15 + Math.sin(this.elapsed * 3 + p.spin) * 0.1 : 0), p.z);
      p.obj.rotation.set(p.kind === "coin" ? Math.PI / 2 : 0, p.spin, 0);
      if (d < 0.9 && p.t > 0.35 && (p.kind === "coin" || wantsPotion) && k.state !== "dead") {
        if (p.kind === "coin") {
          this.coins++;
          this.sfx.coin();
          this.sparks.emit({ x: p.x, y: p.y + 0.2, z: p.z, vy: 1.5, life: 0.35, size: 0.5, color: "#fff3b0", endColor: "#f59e0b" });
        } else {
          this.potions++;
          this.sfx.pickupPotion();
          this.popups.show("+1 Potion", k.x, 3, k.z, "#fda4af", 0.85);
        }
        this.pickupPool.release(p.key, p.obj);
        return false;
      }
      return true;
    });
  }

  breakProp(b: Breakable) {
    if (b.broken) return;
    b.broken = true;
    this.room.removeCollider(b);
    this.room.releasePart(b.obj);
    this.sfx.breakWood();
    this.dust.burst(12, b.x, 0.6, b.z, { speed: 4, up: 4, life: 0.8, size: 0.28, endSize: 0.18, color: "#b9653f", alpha: 1, gravity: 14 });
    this.dust.burst(6, b.x, 0.4, b.z, { speed: 1.5, up: 1, life: 0.8, size: 1, endSize: 1.8, color: "#6e5d50", alpha: 0.45 });
    const r = Math.random();
    if (r < 0.06) this.dropPotion(b.x, b.z);
    else if (r < 0.7) this.dropCoins(b.x, b.z, Math.round(rand(1, 3) * this.stats.coinMult));
  }

  openChest(c: Chest) {
    if (c.opened) return;
    c.opened = true;
    this.sfx.chest();
    this.sparks.burst(40, c.x, 1.2, c.z, { speed: 3, up: 6, life: 1.1, size: 0.35, color: "#fff3b0", endColor: "#f59e0b", gravity: 6 });
    this.decals.wave(c.x, c.z, 3, "#fbbf24", 0.6);
    this.dropCoins(c.x, c.z + 0.6, Math.round(rand(8, 13) * this.stats.coinMult));
    if (Math.random() < 0.45 || this.potions === 0) this.dropPotion(c.x, c.z + 0.8);
  }

  private updateSpikes(dt: number) {
    const k = this.k;
    for (const s of this.room.spikes) {
      s.t += dt;
      const warnAt = s.period - 1.3;
      const upAt = s.period - 0.6;
      let target = s.baseY - 2;
      if (s.t >= warnAt && s.state === "down") {
        s.state = "warn";
        s.warnDecal = this.decals.get().set("telegraph", s.x, s.z, 2.7, "#ff9a1f", { arc: Math.PI, opacity: 0.8 });
      }
      if (s.state === "warn") {
        target = s.baseY - 1.72;
        if (s.warnDecal) s.warnDecal.mat.uniforms.uProgress.value = (s.t - warnAt) / (upAt - warnAt);
        if (s.t >= upAt) {
          s.state = "up";
          s.hit.clear();
          this.sfx.spikes();
          this.decals.fade(s.warnDecal, 0.2);
          s.warnDecal = null;
          this.dust.burst(6, s.x, 0.3, s.z, { speed: 2.5, up: 1, life: 0.5, size: 0.8, endSize: 1.4, color: "#6e5d50", alpha: 0.4 });
        }
      }
      if (s.state === "up") {
        target = s.baseY - 0.75;
        const inside = (x: number, z: number) => Math.abs(x - s.x) < 1.95 && Math.abs(z - s.z) < 1.95;
        if (!s.hit.has(k) && inside(k.x, k.z) && this.stage !== "enter") {
          s.hit.add(k);
          this.hitKnight(14 + this.depth, s.x, s.z, { blockable: false, knock: 5 });
        }
        for (const e of this.enemies) {
          if (!e.hittable || s.hit.has(e) || !inside(e.x, e.z)) continue;
          s.hit.add(e);
          this.damageEnemy(e, 32, { heavy: true, knock: 2, fromX: s.x, fromZ: s.z, sword: false });
        }
        if (s.t >= s.period) {
          s.state = "down";
          s.t = 0;
        }
      }
      const speed = s.state === "up" ? 40 : 6;
      s.node.position.y = damp(s.node.position.y, target, speed, dt);
    }
  }

  // --- Lights, camera ------------------------------------------------------------------------------

  private updateLights() {
    const spots = this.room.lightSpots;
    const torches = this.room.torches;
    for (let i = 0; i < this.torchLights.length; i++) {
      const l = this.torchLights[i];
      const p = spots[i];
      if (!p) {
        l.intensity = 0;
        continue;
      }
      l.position.copy(p);
      const t = torches.find((x) => x.light === i);
      const s = t ? t.seed : i;
      const f = 0.85 + Math.sin(this.elapsed * 9 + s) * 0.07 + Math.sin(this.elapsed * 23 + s * 2) * 0.05 + Math.sin(this.elapsed * 3.1 + s) * 0.04;
      l.intensity = 36 * f;
    }
  }

  private updateChargeRing() {
    const ready = this.charge >= 1 && (this.phase === "playing" || this.phase === "paused") && this.k.state !== "dead";
    const d = this.chargeRing;
    d.holder.visible = ready;
    if (ready) {
      d.holder.position.set(this.k.x, 0.05, this.k.z);
      d.mat.uniforms.uTime.value = this.elapsed;
      d.mat.uniforms.uOpacity.value = 0.55 + Math.sin(this.elapsed * 6) * 0.25;
    }
  }

  private updateCamera(dt: number) {
    const k = this.k;
    if (this.closeUp) {
      const c = this.closeUp;
      c.t += dt;
      const d = 9.5 - Math.min(2.5, c.t * 0.7);
      const s = this.shakeAmt * 0.5;
      this.shakeAmt = damp(this.shakeAmt, 0, 7, dt);
      this.camera.position.set(c.enemy.x + 2.2 + (Math.random() - 0.5) * s, 3.6 + (Math.random() - 0.5) * s, c.enemy.z + d);
      this.camera.lookAt(c.enemy.x, 2.4, c.enemy.z);
      return;
    }
    const inRun = this.phase !== "menu";
    this.camBlend = THREE.MathUtils.clamp(this.camBlend + (inRun ? dt : -dt) * 0.9, 0, 1);
    const blend = ease(this.camBlend);
    const { hw, hd } = this.room;

    // Gameplay: high and angled, a little ahead of where the knight is heading.
    let tx = k.x + THREE.MathUtils.clamp(k.mx, -6, 6) * 0.22;
    let tz = k.z + THREE.MathUtils.clamp(k.mz, -6, 6) * 0.18;
    // Frame the fight: lean towards the skeletons and pull back when they spread out.
    let cx = 0;
    let cz = 0;
    let n = 0;
    let spread = 0;
    if (inRun) {
      for (const e of this.enemies) {
        if (!e.alive || e.state === "dormant") continue;
        cx += e.x;
        cz += e.z;
        n++;
        spread = Math.max(spread, Math.hypot(e.x - k.x, (e.z - k.z) * 1.3));
      }
    }
    if (n) {
      const dx = cx / n - k.x;
      const dz = cz / n - k.z;
      const l = Math.hypot(dx, dz) || 1;
      const m = Math.min(l * 0.3, 3.5) / l;
      this.lean.x = damp(this.lean.x, dx * m, 2.5, dt);
      this.lean.z = damp(this.lean.z, dz * m, 2.5, dt);
    } else {
      this.lean.x = damp(this.lean.x, 0, 2.5, dt);
      this.lean.z = damp(this.lean.z, 0, 2.5, dt);
    }
    tx += this.lean.x;
    tz += this.lean.z;
    this.zoom = damp(this.zoom, THREE.MathUtils.clamp((spread - 7) / 9, 0, 1), 1.6, dt);
    if (this.focus) {
      this.focus.t -= dt;
      const w = Math.min(1, this.focus.t * 1.5) * 0.65;
      tx += (this.focus.x - tx) * w;
      tz += (this.focus.z - tz) * w;
      if (this.focus.t <= 0) this.focus = null;
    }
    const mx = Math.max(0, hw - (this.portrait ? 5 : 8));
    tx = THREE.MathUtils.clamp(tx, -mx, mx);
    // Keep the void beyond the near balustrade mostly out of shot.
    tz = THREE.MathUtils.clamp(tz, -hd + 1.5, Math.max(-hd + 1.5, hd - (this.portrait ? 5 : 3.2)));
    const high = ((this.portrait ? 21 : 15.5) + this.zoom * (this.portrait ? 4 : 4.5)) * this.cinema;
    const back = ((this.portrait ? 12.5 : 10.2) + this.zoom * 3) * this.cinema;
    const gx = tx;
    const gy = high;
    const gz = tz + back;
    const lx = tx;
    const ly = 0.6;
    const lz = tz - 0.6;

    // Menu: close on the knight, slowly swaying.
    const sway = Math.sin(this.elapsed * 0.3) * 0.5;
    const mxp = k.x + 2.2 + sway;
    const myp = 3.4;
    const mzp = k.z + 9.4;
    const mlx = k.x - 0.4;
    const mly = 1.2;
    const mlz = k.z - 2.2;

    const px = mxp + (gx - mxp) * blend;
    const py = myp + (gy - myp) * blend + Math.sin(blend * Math.PI) * 2;
    const pz = mzp + (gz - mzp) * blend;
    const qx = mlx + (lx - mlx) * blend;
    const qy = mly + (ly - mly) * blend;
    const qz = mlz + (lz - mlz) * blend;

    if (dt === 0 || this.camPos.lengthSq() === 0) {
      this.camPos.set(px, py, pz);
      this.camLook.set(qx, qy, qz);
    } else {
      const f = 1 - Math.exp(-(blend > 0.99 ? 7 : 12) * dt);
      this.camPos.x += (px - this.camPos.x) * f;
      this.camPos.y += (py - this.camPos.y) * f;
      this.camPos.z += (pz - this.camPos.z) * f;
      this.camLook.x += (qx - this.camLook.x) * f;
      this.camLook.y += (qy - this.camLook.y) * f;
      this.camLook.z += (qz - this.camLook.z) * f;
    }
    this.shakeAmt = damp(this.shakeAmt, 0, 7, dt);
    const s = this.shakeAmt * 0.6;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z + (Math.random() - 0.5) * s * 0.5);
    this.camera.lookAt(this.camLook);
    this.punch = Math.max(0, this.punch - dt * 6);
    const fov = (this.portrait ? 50 : 42) + (1 - blend) * 6 - this.punch * 1.6;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
      this.updatePointScale();
    }
    // The shop covers part of the screen: slide the picture into the rest.
    const sh = this.shift;
    const menu = this.phase === "menu";
    if (dt > 0) {
      sh.cx = damp(sh.cx, menu ? sh.x : 0, 6, dt);
      sh.cy = damp(sh.cy, menu ? sh.y : 0, 6, dt);
    }
    const { w, h } = this.view;
    if (Math.abs(sh.cx) + Math.abs(sh.cy) > 1e-3) this.camera.setViewOffset(w, h, -sh.cx * w, sh.cy * h, w, h);
    else if (this.camera.view) this.camera.clearViewOffset();
  }

  /** Trailer autopilot: run at the nearest skeleton and swing; spin when crowded, roll now and then. */
  private drive() {
    const k = this.k;
    this.stick.x = this.stick.y = 0;
    if (this.stage === "exit") {
      const dx = -k.x;
      const dz = -this.room.hd - 1.5 - k.z;
      const l = Math.hypot(dx, dz) || 1;
      this.stick.x = dx / l;
      this.stick.y = -dz / l;
      return;
    }
    let target: Enemy | null = null;
    let best = Infinity;
    let near = 0;
    for (const e of this.enemies) {
      if (!e.hittable) continue;
      const d = Math.hypot(e.x - k.x, e.z - k.z);
      if (d < 4) near++;
      if (d < best) {
        best = d;
        target = e;
      }
    }
    if (!target) return;
    const dx = target.x - k.x;
    const dz = target.z - k.z;
    if (best > target.radius + 1.9) {
      this.stick.x = dx / best;
      this.stick.y = -dz / best;
    } else {
      this.attackBuf = 0.35;
      this.aimYaw = yawTo(dx, dz);
    }
    if (this.charge >= 1 && near >= 2) this.spinBuf = 0.25;
    else if (target.state === "windup" && best < 3.2 && k.rollCd <= 0 && Math.random() < 0.03) this.rollBuf = 0.25;
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
      // Only climb back after a few smooth windows in a row.
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

  private updatePointScale() {
    const h = this.renderer.domElement.height;
    this.sparks.setScale(h, this.camera.fov);
    this.dust.setScale(h, this.camera.fov);
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.view = { w, h };
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
    this.updatePointScale();
  }

  // --- HUD -----------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  private emitHud(force = false) {
    const boss = this.boss && this.boss.active && this.stage !== "enter" && this.stage !== "menu" ? this.boss : null;
    const hud: Hud = {
      hp: Math.max(0, Math.ceil(this.hp)),
      maxHp: Math.round(this.stats.maxHp),
      potions: this.potions,
      maxPotions: this.stats.maxPotions,
      coins: this.coins,
      charge: Math.round(this.charge * 50) / 50,
      roll: this.k.rollCd > 0 ? Math.round((1 - this.k.rollCd / this.stats.rollCooldown) * 20) / 20 : 1,
      room: this.depth + 1,
      rooms: this.plans.length,
      enemies: this.remainingEnemies(),
      boss: boss ? { name: boss.def.name, hp: Math.max(0, Math.ceil(boss.hp)), max: boss.maxHp, enraged: boss.phase2 } : null,
      doorOpen: this.stage === "exit",
      potionPrice: this.potionPrice,
    };
    const key = JSON.stringify(hud);
    if (!force && key === this.hudCache) return;
    this.hudCache = key;
    this.events.hud(hud);
  }

  /** Skeletons still standing plus the ones yet to rise this room. */
  private remainingEnemies() {
    if (this.stage === "menu" || this.stage === "cleared" || this.stage === "exit" || this.stage === "transition") return 0;
    const plan = this.plans[this.depth];
    let n = this.aliveCount();
    for (let w = this.wave + 1; w < plan.waves.length; w++) n += plan.waves[w].length;
    return n;
  }
}
