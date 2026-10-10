import * as THREE from "three";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, type LoadedModel, type LoadProgress } from "../shared/assets";
import { music } from "../shared/music";
import { ISLAND_DRIFT } from "../shared/songs";
import { Animator, turnTowards, yawTo } from "./anim";
import { Sfx } from "./audio";
import { Creature, pushOut, type Blocker, type CreatureAssets, type CreatureCtx } from "./creatures";
import {
  BUILDS,
  DAWN,
  DAY,
  DUSK,
  FIST,
  FOOD,
  FOODS,
  isFood,
  ITEMS,
  NIGHT,
  NOTES,
  OBJECTIVES,
  raidPlan,
  RECIPE,
  RECIPES,
  RESOURCES,
  START_CLOCK,
  SURVIVAL,
  TOOLS,
  type BuildId,
  type CreatureKind,
  type FoodId,
  type ItemId,
  type RecipeId,
  type ResourceId,
  type ToolId,
} from "./data";
import { makeSkyState, seaHeight, SkyDome, skyAt, Water } from "./environment";
import { Particles, Popups, Ring, Telegraphs } from "./fx";
import { renderIcons } from "./icons";
import { BUILD, CHAR, HELD, ITEM, MODELS, WORLD } from "./manifest";
import { bake, KitMaterials, lambertize, type Baked } from "./props";
import { BUILD_FITS, buildModel, Structures, TORCH_POST_SCALE, type SavedStructure, type Structure } from "./structures";
import { CAMP, COVE, Island, POND, rng } from "./terrain";
import { SURVIVAL_SCALE, World, WORLD_FITS, type Node } from "./world";

// --- Tuning ----------------------------------------------------------------------------------------

const PLAYER_H = 1.6;
const PLAYER_R = 0.38;
const WALK = 4.6;
const RUN = 7.0;
const SAVE_KEY = "castaway:save:v1";
const MAX_CREATURES = 13;
const NIGHT_LEN = (DAWN - NIGHT) * DAY;

/** Held items, in metres. */
const HELD_FITS: Record<string, { scale: number }> = {
  [HELD.axe]: { scale: 2.6 },
  [HELD.axeIron]: { scale: 2.6 },
  [HELD.pick]: { scale: 2.6 },
  [HELD.pickIron]: { scale: 2.6 },
  [HELD.hammer]: { scale: 3.4 },
  [HELD.spear]: { scale: 2.4 },
  [HELD.torch]: { scale: 0.8 },
  [HELD.lantern]: { scale: 0.85 },
};

/** Items as they fly to the castaway (and icons). */
const ITEM_FITS: Record<string, { scale: number }> = {
  [ITEM.wood]: { scale: SURVIVAL_SCALE },
  [ITEM.stoneLarge]: { scale: SURVIVAL_SCALE * 0.8 },
  [ITEM.planks]: { scale: 1.8 },
  [ITEM.scrap]: { scale: 1.4 },
  [ITEM.cloth]: { scale: 2.6 },
  [ITEM.mushroom]: { scale: 2.5 },
  [ITEM.fish]: { scale: 3.0 },
  [ITEM.bigFish]: { scale: 3.0 },
  [ITEM.meat]: { scale: 1.2 },
  [ITEM.meatCooked]: { scale: 1.2 },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// --- Public types ----------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "book" | "dead" | "won" | "error";

export interface SlotView {
  /** Icon key (item / build id). */
  icon: string | null;
  label: string;
  count?: number;
}

export interface Prompt {
  text: string;
  ok: boolean;
  key: string;
}

export interface CraftView {
  unlocked: RecipeId[];
  crafted: RecipeId[];
  bench: boolean;
  chest: boolean;
  have: Record<ResourceId, number>;
}

export interface Hud {
  day: number;
  t: number;
  period: string;
  night: boolean;
  health: number;
  hunger: number;
  warmth: number;
  res: Record<ResourceId, number>;
  foods: [FoodId, number][];
  food: FoodId | null;
  slots: SlotView[];
  selected: number;
  prompt: Prompt | null;
  fishing: { needle: number; a: number; b: number } | null;
  cooking: number | null;
  placing: { name: string; valid: boolean; reason: string } | null;
  objective: string;
  objectiveNo: number;
  sleeping: boolean;
  ship: boolean;
  danger: number;
  craft: CraftView;
  cold: boolean;
  starving: boolean;
  home: boolean;
}

export type ToastKind = "item" | "info" | "warn" | "recipe" | "achievement" | "objective";

export interface Toast {
  id: number;
  text: string;
  icon?: string;
  kind: ToastKind;
}

export interface RunSummary {
  day: number;
  /** In-game days since the wreck. */
  days: number;
  kills: number;
  crafted: number;
  built: number;
  fish: number;
  deaths: number;
}

export interface DeathInfo {
  day: number;
  lost: string;
  home: boolean;
}

export interface SaveInfo {
  day: number;
  t: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  error(message: string): void;
  icons(icons: Record<string, string>): void;
  toast(toast: Toast): void;
  banner(title: string, sub?: string): void;
  hurt(): void;
  note(text: string, index: number): void;
  died(info: DeathInfo): void;
  won(summary: RunSummary): void;
  achieve(id: string): void;
  day(day: number): void;
  saved(info: SaveInfo | null): void;
}

type PState = "free" | "act" | "attack" | "dead" | "sleep" | "fish" | "board";
type ActKind = "chop" | "mine" | "gather" | "pick" | "open" | "shake" | "eat" | "use";

interface Act {
  kind: ActKind;
  node: Node | null;
  struct: Structure | null;
  t: number;
  dur: number;
  at: number;
  done: boolean;
  food?: FoodId;
}

interface Player {
  root: THREE.Group;
  model: THREE.Object3D;
  anim: Animator;
  hand: THREE.Object3D | null;
  held: Map<string, THREE.Object3D>;
  heldKey: string | null;
  charScale: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  vx: number;
  vz: number;
  state: PState;
  act: Act | null;
  swing: { t: number; dur: number; hitAt: number; hit: boolean; step: number; tool: ToolId | null } | null;
  combo: number;
  comboT: number;
  hp: number;
  hunger: number;
  warmth: number;
  invuln: number;
  stepT: number;
  kx: number;
  kz: number;
  deadT: number;
}

interface Pickup {
  mesh: THREE.Object3D;
  item: ItemId;
  count: number;
  t: number;
  dur: number;
  sx: number;
  sy: number;
  sz: number;
  spin: number;
}

interface Placing {
  id: BuildId;
  recipe: RecipeId;
  rot: number;
  ghost: THREE.Group;
  x: number;
  z: number;
  valid: boolean;
  reason: string;
}

interface Fishing {
  node: Node;
  t: number;
  needle: number;
  dir: number;
  speed: number;
  a: number;
  b: number;
  tries: number;
}

interface Save {
  v: 1;
  clock: number;
  p: { x: number; z: number; yaw: number; hp: number; hunger: number; warmth: number };
  inv: Partial<Record<ItemId, number>>;
  seen: string[];
  crafted: RecipeId[];
  structures: SavedStructure[];
  nodes: (number | string)[][];
  notes: number[];
  home: { x: number; z: number } | null;
  satchel: { x: number; z: number; items: Partial<Record<ItemId, number>> } | null;
  ship: { until: number } | null;
  stats: RunSummary & { cooked: number; opened: number; felled: number; caught: number };
  lastBuild: BuildId | null;
  sel: number;
  food: FoodId | null;
  nightDone: number;
}

// --- Game ------------------------------------------------------------------------------------------

export class CastawayGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
  private readonly timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly res = { max: 1, min: 0.6, cur: 1, acc: 0, n: 0, good: 0 };
  private readonly coarse: boolean;

  // Environment
  private readonly island = new Island();
  private readonly skyDome = new SkyDome();
  private readonly sea: Water;
  private readonly pond: Water;
  private readonly sky = makeSkyState();
  private readonly hemi = new THREE.HemisphereLight("#bcd9f5", "#7a6e58", 1);
  private readonly sun = new THREE.DirectionalLight("#fff6e8", 2);
  private readonly fireLights: THREE.PointLight[] = [];
  private readonly handLight = new THREE.PointLight("#ffa552", 0, 11, 1.6);
  private readonly fog = new THREE.Fog("#cde8f7", 60, 260);

  // Content
  private readonly kits = new KitMaterials();
  private readonly baked = new Map<string, Baked>();
  private models: Map<string, LoadedModel> | null = null;
  private world!: World;
  private structures!: Structures;
  private p!: Player;
  private creatureAssets = new Map<CreatureKind, CreatureAssets>();
  private readonly creatures: Creature[] = [];
  private ship: THREE.Object3D | null = null;
  private satchelMesh: THREE.Object3D | null = null;
  private readonly charMats = new Map<THREE.Material, THREE.MeshLambertMaterial>();
  private icons: Record<string, string> = {};

  // Effects
  private readonly fire = new Particles(900, true);
  private readonly dust = new Particles(900, false);
  private readonly smoke = new Particles(260, false);
  private readonly popups = new Popups(18);
  private readonly focusRing = new Ring("#fb923c", { width: 0.14, dash: 10 });
  private readonly placeRing = new Ring("#4ade80", { width: 0.1 });
  private readonly telegraphs = new Telegraphs(14);
  private readonly pickups: Pickup[] = [];

  // State
  private phase: Phase = "loading";
  private clock = START_CLOCK;
  private elapsed = 0;
  private inv: Partial<Record<ItemId, number>> = {};
  private seen = new Set<string>();
  private crafted = new Set<RecipeId>();
  private notes = new Set<number>();
  private home: { x: number; z: number } | null = null;
  private satchel: { x: number; z: number; items: Partial<Record<ItemId, number>> } | null = null;
  private shipUntil = 0;
  private selected = 0;
  private food: FoodId | null = null;
  private lastBuild: BuildId | null = null;
  private placing: Placing | null = null;
  private fishing: Fishing | null = null;
  private focus: { node: Node | null; struct: Structure | null; creature: Creature | null; satchel: boolean; prompt: Prompt | null } = { node: null, struct: null, creature: null, satchel: false, prompt: null };
  private spawnQueue: { at: number; kind: CreatureKind }[] = [];
  private nightStart = -1;
  private nightDone = 0;
  private lastT = 0;
  private stats = { day: 1, days: 0, kills: 0, crafted: 0, built: 0, fish: 0, deaths: 0, cooked: 0, opened: 0, felled: 0, caught: 0 };
  private achieved = new Set<string>();
  private objective = 0;
  private hudCache = "";
  private hudT = 0;
  private checkT = 0;
  private saveT = 0;
  private toastId = 0;
  private attackedT = 0;
  private shake = 0;
  private escapeT = -1;
  private raft: Structure | null = null;
  private menuT = 0;
  private wake = "";

  // Camera
  private camYaw = 0;
  private camPitch = 0.7;
  private camDist = 11;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private camInit = false;

  // Input
  private readonly keys = new Set<string>();
  private stick = { x: 0, y: 0 };
  private actionHeld = false;
  private actionBuf = 0;
  private drag: { id: number; x: number; y: number; moved: boolean; button: number; type: string } | null = null;
  private readonly mouse = new THREE.Vector2();
  private mouseActive = false;
  private readonly ray = new THREE.Raycaster();
  private readonly tmpV = new THREE.Vector3();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.res.max = Math.min(window.devicePixelRatio, this.coarse ? 1.5 : 2);
    this.res.cur = this.res.max;
    this.res.min = Math.min(this.res.max, 0.6);
    this.renderer.setPixelRatio(this.res.cur);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.sea = new Water(this.island.heightTexture, { size: 420, segments: 140, level: 0, amp: 1 });
    this.pond = new Water(this.island.heightTexture, { size: POND.r * 2 + 2.5, segments: 32, level: POND.level, amp: 0.15, circle: true });
    this.pond.mesh.position.set(POND.x, POND.level, POND.z);
    this.setupScene();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContext);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ---------------------------------------------------------------------------------------

  private setupScene() {
    const { scene } = this;
    scene.fog = this.fog;
    scene.add(this.skyDome.mesh, this.island.mesh, this.sea.mesh, this.pond.mesh, this.hemi);
    const sun = this.sun;
    sun.castShadow = true;
    const size = this.coarse ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -26;
    cam.right = 26;
    cam.top = 26;
    cam.bottom = -26;
    cam.near = 1;
    cam.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    scene.add(sun, sun.target);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight("#ff9a4a", 0, 18, 1.5);
      this.fireLights.push(l);
      scene.add(l);
    }
    scene.add(this.handLight);
    const ground = (x: number, z: number) => Math.max(this.island.height(x, z), this.island.waterLevel(x, z) - 0.02);
    this.dust.ground = ground;
    this.fire.ground = ground;
    scene.add(this.fire.points, this.dust.points, this.smoke.points, this.popups.group, this.focusRing.mesh, this.placeRing.mesh, this.telegraphs.group);
  }

  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      this.models = models;
      const required = [CHAR.player, WORLD.tree, WORLD.palm, WORLD.rockA, BUILD.campfire, CHAR.crab];
      if (!required.every((k) => models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");
      this.bakeAll(models);
      this.buildPlayer(models.get(CHAR.player)!);
      this.buildCreatureAssets(models);
      const shipB = this.baked.get(WORLD.ship);
      if (shipB) {
        const ship = new THREE.Mesh(shipB.geometry, shipB.material);
        ship.castShadow = true;
        ship.visible = false;
        this.ship = ship;
        this.scene.add(ship);
      }
      const satB = this.baked.get(BUILD.satchel);
      if (satB) {
        this.satchelMesh = new THREE.Mesh(satB.geometry, satB.material);
        this.satchelMesh.castShadow = true;
        this.satchelMesh.visible = false;
        this.scene.add(this.satchelMesh);
      }
      this.icons = this.makeIcons();
      this.events.icons(this.icons);
      this.structures = new Structures(this.baked, (x, z) => this.island.height(x, z));
      this.scene.add(this.structures.group);
      this.newWorld();
      // Original parsed scenes aren't needed any more (bakes and the characters keep what they use).
      for (const [key, m] of models) if (!key.startsWith("mini-characters") && !key.startsWith("graveyard-kit") && !key.startsWith("cube-pets")) disposeTree(m.scene);
      for (let i = 0; i < 4; i++) this.creature("crab");
      for (let i = 0; i < 2; i++) this.creature("drowned");
      this.creature("brute");
      this.creature("ghost");
      this.setMenuScene();
      this.renderer.compile(this.scene, this.camera);
      music.play(ISLAND_DRIFT, 0);
      this.setPhase("menu");
      this.events.saved(CastawayGame.saveInfo());
      if (process.env.NODE_ENV !== "production") (window as unknown as { __castaway?: CastawayGame }).__castaway = this;
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private bakeAll(models: Map<string, LoadedModel>) {
    const fits: Record<string, { scale: number }> = { ...WORLD_FITS, ...BUILD_FITS, ...ITEM_FITS, ...HELD_FITS };
    for (const [key, fit] of Object.entries(fits)) {
      const b = bake(models, key, fit, this.kits);
      if (b) this.baked.set(key, b);
    }
    const post = bake(models, HELD.torch, { scale: TORCH_POST_SCALE }, this.kits);
    if (post) this.baked.set(HELD.torch + "#post", post);
    const ship = bake(models, WORLD.ship, { scale: 1.15 }, this.kits);
    if (ship) this.baked.set(WORLD.ship, ship);
  }

  private makeIcons() {
    const list: { id: string; baked: Baked; tint?: string; tilt?: number }[] = [];
    for (const [id, def] of Object.entries(ITEMS)) {
      const b = this.baked.get(def.model);
      if (b) list.push({ id, baked: b, tint: def.tint });
    }
    for (const r of RECIPES) {
      if (r.id in ITEMS) continue;
      const b = r.id === "torchPost" ? this.baked.get(HELD.torch + "#post") : this.baked.get(r.icon);
      if (b) list.push({ id: r.id, baked: b });
    }
    const signal = this.baked.get(WORLD.log);
    if (signal) list.push({ id: "signal", baked: signal, tilt: 0.6 });
    const raft = this.baked.get(BUILD.raftSail);
    if (raft) list.push({ id: "raft", baked: raft });
    return renderIcons(this.renderer, list, 96);
  }

  private buildPlayer(m: LoadedModel) {
    lambertize(m.scene, this.charMats);
    const proto = makeProto(m.scene, m.animations, { height: PLAYER_H }, { shadows: true });
    const root = new THREE.Group();
    root.add(proto.object);
    this.scene.add(root);
    const charScale = (proto.object.children[0] as THREE.Object3D).scale.x;
    const hand = m.scene.getObjectByName("arm-right") ?? null;
    const held = new Map<string, THREE.Object3D>();
    if (hand) {
      for (const key of Object.values(HELD)) {
        const b = this.baked.get(key);
        if (!b) continue;
        const mesh = new THREE.Mesh(b.geometry, b.material);
        mesh.castShadow = true;
        const holder = new THREE.Group();
        holder.add(mesh);
        holder.scale.setScalar(1 / charScale);
        const len = b.size.y;
        const light = key === HELD.torch || key === HELD.lantern;
        if (light) {
          // Held upright, gripped low on the handle.
          holder.position.set(0, -0.13, 0.02);
          mesh.position.set(0, -len * 0.3, 0);
        } else {
          // Pointing forward, gripped near the end of the handle.
          holder.position.set(0.0, -0.12, 0.0);
          holder.rotation.set(Math.PI / 2 - 0.25, 0, 0);
          mesh.position.set(0, -len * 0.2, 0);
        }
        holder.visible = false;
        hand.add(holder);
        held.set(key, holder);
      }
    }
    const anim = new Animator(m.scene, m.animations);
    anim.play("idle");
    this.p = {
      root,
      model: proto.object,
      anim,
      hand,
      held,
      heldKey: null,
      charScale,
      x: 0,
      z: 0,
      y: 0,
      yaw: Math.PI,
      vx: 0,
      vz: 0,
      state: "free",
      act: null,
      swing: null,
      combo: 0,
      comboT: 0,
      hp: 100,
      hunger: 100,
      warmth: 100,
      invuln: 0,
      stepT: 0,
      kx: 0,
      kz: 0,
      deadT: 0,
    };
  }

  private buildCreatureAssets(models: Map<string, LoadedModel>) {
    const defs: [CreatureKind, string, number][] = [
      [ "crab", CHAR.crab, 0.9 ],
      [ "drowned", CHAR.drowned, 1.65 ],
      [ "brute", CHAR.brute, 2.2 ],
      [ "ghost", CHAR.ghost, 1.5 ],
    ];
    for (const [kind, key, height] of defs) {
      const m = models.get(key);
      if (!m) continue;
      lambertize(m.scene, this.charMats);
      m.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(m.scene);
      const raw = box.getSize(new THREE.Vector3()).y || 1;
      // Ground the model: its feet at y = 0.
      m.scene.position.y = -box.min.y;
      const wrap = new THREE.Group();
      wrap.add(m.scene);
      this.creatureAssets.set(kind, { scene: wrap, clips: m.animations, scale: height / raw });
    }
  }

  private creature(kind: CreatureKind) {
    let c = this.creatures.find((x) => !x.active && x.kind === kind);
    if (!c) {
      const a = this.creatureAssets.get(kind);
      if (!a) return null;
      c = new Creature(kind, a);
      this.creatures.push(c);
      this.scene.add(c.root, c.bar.group);
    }
    return c;
  }

  /** A fresh island: every node back to its starting state. */
  private newWorld() {
    if (this.world) {
      this.world.group.removeFromParent();
      this.world.dispose();
    }
    this.world = new World(this.island, this.baked);
    this.world.blocked = (n) => {
      if (n.r <= 0) return false;
      if (Math.hypot(this.p.x - n.x, this.p.z - n.z) < n.r + 1) return true;
      for (const s of this.structures.list) if (Math.hypot(s.x - n.x, s.z - n.z) < n.r + s.r + (s.wall ? s.half : 0)) return true;
      return false;
    };
    this.world.onTreeLand = (x, z) => {
      this.sfx.treeLand();
      const y = this.island.height(x, z);
      this.dust.burst(26, x, y + 0.3, z, { speed: 3.5, up: 1.5, life: 0.9, size: 0.6, endSize: 1.4, color: "#c9b48c", endColor: "#9a8a6a", alpha: 0.5, drag: 3, jitter: 1.4 });
      this.dust.burst(14, x, y + 1.2, z, { speed: 2.5, up: 2, life: 1.2, size: 0.25, color: "#4f8a3c", gravity: 4, jitter: 1.2 });
      this.shake = Math.max(this.shake, 0.25);
    };
    this.scene.add(this.world.group);
  }

  // --- Phases ---------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  /** The title screen: sunset over the camp, the castaway by a crackling fire. */
  private setMenuScene() {
    this.clearRun();
    this.newWorld();
    this.structures.add("campfire", CAMP.x, CAMP.z, 0, { fuel: 9999 });
    this.structures.add("bedroll", CAMP.x - 2.4, CAMP.z + 0.6, 1.2);
    this.structures.add("workbench", CAMP.x + 2.6, CAMP.z - 1.8, -0.5);
    this.structures.add("fence", CAMP.x - 4.5, CAMP.z - 3, 0.8);
    this.structures.add("fence", CAMP.x - 1.6, CAMP.z - 5.2, 0.2);
    this.structures.add("torchPost", CAMP.x + 4.2, CAMP.z + 1.8, 0);
    this.clock = DAY * 0.655;
    this.p.x = CAMP.x + 1.5;
    this.p.z = CAMP.z + 1.3;
    this.p.yaw = yawTo(CAMP.x - this.p.x, CAMP.z - this.p.z);
    this.p.state = "free";
    this.p.root.visible = true;
    this.p.anim.play("sit", { fade: 0 });
    this.setHeld(HELD.axe);
    this.menuT = 0;
    this.camInit = false;
  }

  private clearRun() {
    for (const c of this.creatures) if (c.active) c.despawn();
    for (const pk of this.pickups) pk.mesh.removeFromParent();
    this.pickups.length = 0;
    this.structures?.clear();
    this.telegraphs.clear();
    this.fire.clear();
    this.dust.clear();
    this.smoke.clear();
    this.popups.clear();
    this.cancelPlacing();
    this.fishing = null;
    this.spawnQueue = [];
    this.raft = null;
    this.escapeT = -1;
    if (this.ship) this.ship.visible = false;
    if (this.satchelMesh) this.satchelMesh.visible = false;
  }

  /** New game, or carry on from the save. */
  start(resume: boolean) {
    if (!this.p) return;
    audio.unlock();
    const save = resume ? CastawayGame.readSave() : null;
    this.clearRun();
    this.newWorld();
    this.inv = {};
    this.seen = new Set();
    this.crafted = new Set();
    this.notes = new Set();
    this.home = null;
    this.satchel = null;
    this.shipUntil = 0;
    this.selected = 0;
    this.food = null;
    this.lastBuild = null;
    this.achieved = new Set();
    this.stats = { day: 1, days: 0, kills: 0, crafted: 0, built: 0, fish: 0, deaths: 0, cooked: 0, opened: 0, felled: 0, caught: 0 };
    this.nightDone = 0;
    this.nightStart = -1;
    const p = this.p;
    p.state = "free";
    p.act = null;
    p.swing = null;
    p.hp = 100;
    p.hunger = 100;
    p.warmth = 100;
    p.invuln = 2;
    p.vx = p.vz = p.kx = p.kz = 0;
    p.root.rotation.set(0, 0, 0);
    if (save) this.applySave(save);
    else {
      this.clock = START_CLOCK;
      p.x = COVE.x - 5;
      p.z = COVE.z - 6.5;
      // Facing the wreck, the camera looking past the castaway out to sea.
      p.yaw = yawTo(COVE.x - p.x, COVE.z + 1.5 - p.z);
      this.events.banner("Day 1", "Washed ashore");
    }
    this.lastT = (this.clock % DAY) / DAY;
    this.camYaw = p.yaw + Math.PI;
    this.camDist = this.coarse ? 12 : 11;
    this.camPitch = 0.7;
    this.camInit = false;
    this.p.anim.play("idle", { fade: 0 });
    this.updateHeld();
    this.objective = this.computeObjective();
    this.hudCache = "";
    this.sfx.start();
    music.play(ISLAND_DRIFT, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setPhase("playing");
    this.save();
  }

  pause() {
    if (this.phase !== "playing") return;
    this.setPhase("paused");
    this.clearInput();
    music.duck(true);
    this.save();
  }

  resume() {
    if (this.phase !== "paused" && this.phase !== "book") return;
    this.setPhase("playing");
    music.duck(false);
  }

  openBook() {
    if (this.phase !== "playing" || this.p.state === "dead" || this.escapeT >= 0) return false;
    this.cancelPlacing();
    this.clearInput();
    this.setPhase("book");
    this.emitHud(true);
    return true;
  }

  closeBook() {
    if (this.phase === "book") this.setPhase("playing");
  }

  toMenu() {
    if (this.phase === "playing" || this.phase === "paused" || this.phase === "book") this.save();
    music.play(ISLAND_DRIFT, 0);
    music.setIntensity(0);
    music.duck(false);
    this.setMenuScene();
    this.setPhase("menu");
    this.events.saved(CastawayGame.saveInfo());
  }

  // --- Saving ---------------------------------------------------------------------------------------

  static readSave(): Save | null {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as Save;
      return s && s.v === 1 ? s : null;
    } catch {
      return null;
    }
  }

  static saveInfo(): SaveInfo | null {
    const s = CastawayGame.readSave();
    return s ? { day: Math.floor(s.clock / DAY) + 1, t: (s.clock % DAY) / DAY } : null;
  }

  static clearSave() {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      // Storage blocked.
    }
  }

  private save() {
    if (!this.p || this.p.state === "dead" || this.escapeT >= 0 || (this.phase !== "playing" && this.phase !== "paused" && this.phase !== "book")) return;
    const p = this.p;
    const s: Save = {
      v: 1,
      clock: Math.round(this.clock * 10) / 10,
      p: { x: round2(p.x), z: round2(p.z), yaw: round2(p.yaw), hp: round2(p.hp), hunger: round2(p.hunger), warmth: round2(p.warmth) },
      inv: this.inv,
      seen: [...this.seen],
      crafted: [...this.crafted],
      structures: this.structures.serialize(),
      nodes: this.world.serialize(),
      notes: [...this.notes],
      home: this.home,
      satchel: this.satchel,
      ship: this.shipUntil > this.clock ? { until: this.shipUntil } : null,
      stats: this.stats,
      lastBuild: this.lastBuild,
      sel: this.selected,
      food: this.food,
      nightDone: this.nightDone,
    };
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {
      // Storage full or blocked: the run just isn't saved.
    }
  }

  private applySave(s: Save) {
    this.clock = s.clock;
    const p = this.p;
    p.x = s.p.x;
    p.z = s.p.z;
    p.yaw = s.p.yaw;
    p.hp = s.p.hp;
    p.hunger = s.p.hunger;
    p.warmth = s.p.warmth;
    this.inv = { ...s.inv };
    this.seen = new Set(s.seen);
    this.crafted = new Set(s.crafted);
    this.notes = new Set(s.notes);
    this.home = s.home;
    this.satchel = s.satchel;
    this.stats = { ...this.stats, ...s.stats };
    this.lastBuild = s.lastBuild;
    this.selected = s.sel ?? 0;
    this.food = s.food;
    this.nightDone = s.nightDone ?? 0;
    this.world.restore(s.nodes);
    this.structures.restore(s.structures);
    this.raft = this.structures.list.find((x) => x.kind === "raft") ?? null;
    if (s.ship && s.ship.until > this.clock) this.showShip(s.ship.until, false);
    this.updateSatchel();
    const day = Math.floor(this.clock / DAY) + 1;
    this.events.banner(`Day ${day}`, "Back on the island");
    // A night already under way keeps raiding.
    const t = (this.clock % DAY) / DAY;
    if (t >= NIGHT && t < DAWN) this.beginNight(day, (t - NIGHT) * DAY);
  }

  // --- Commands (UI) --------------------------------------------------------------------------------

  /** Selects a hotbar slot (pressing the food slot again cycles the food; build re-enters placing). */
  select(slot: number) {
    if (this.phase !== "playing" || this.p.state === "dead") return;
    audio.unlock();
    if (slot === 4) {
      const foods = this.foodsOwned();
      if (this.selected === 4 && foods.length > 1) {
        const i = foods.indexOf(this.food ?? foods[0]);
        this.food = foods[(i + 1) % foods.length];
      } else if (!this.food || !foods.includes(this.food)) this.food = foods[0] ?? null;
    }
    if (slot === 2 && this.selected === 2 && this.has("spear") && this.has("hammer")) {
      this.preferHammer = !this.preferHammer;
    }
    if (slot === 5) {
      if (this.placing) {
        this.cancelPlacing();
        return;
      }
      const id = this.lastBuild;
      if (id && this.unlocked(id as RecipeId)) this.startPlacing(id);
      else this.openBook();
      return;
    }
    this.cancelPlacing();
    this.selected = slot;
    this.updateHeld();
    this.emitHud(true);
  }

  private preferHammer = true;

  /** Crafts a recipe from the journal. Buildings switch to placing. */
  craft(id: RecipeId) {
    const r = RECIPE[id];
    if (!r || !this.unlocked(id)) return false;
    if (r.bench && !this.benchNear()) {
      this.toast("You need a workbench nearby", "warn");
      this.sfx.denied();
      return false;
    }
    if (!this.affordable(r.cost)) {
      this.sfx.denied();
      return false;
    }
    if (r.build) {
      this.closeBook();
      this.startPlacing(r.build);
      return true;
    }
    if (id in TOOLS && this.has(id as ToolId)) return false;
    this.pay(r.cost);
    this.crafted.add(id);
    this.stats.crafted++;
    if (id === "planks") this.addItem("planks", 2, true);
    else {
      this.inv[id as ToolId] = 1;
      this.seen.add(id);
      const slot = TOOLS[id as ToolId].slot;
      if (slot === 2) this.preferHammer = id === "hammer";
      this.selected = slot;
      this.updateHeld();
      this.toast(`Crafted: ${ITEMS[id as ToolId].name}`, "item", id);
    }
    this.sfx.craft();
    if (id === "axe" || id === "pick") this.achieve("toolmaker");
    if (id === "axeIron" || id === "pickIron") this.achieve("iron");
    this.checkUnlocks();
    this.emitHud(true);
    return true;
  }

  /** The action button / Space / click. */
  press(held: boolean) {
    this.actionHeld = held;
    if (!held) return;
    if (this.phase !== "playing") return;
    audio.unlock();
    this.actionBuf = 0.3;
  }

  eat() {
    if (this.phase !== "playing" || this.p.state !== "free") return;
    const foods = this.foodsOwned();
    const id = this.food && foods.includes(this.food) ? this.food : foods[0];
    if (!id) {
      this.toast("No food — pick berries, shake palms or catch fish", "warn");
      this.sfx.denied();
      return;
    }
    this.food = id;
    this.p.state = "act";
    this.p.act = { kind: "eat", node: null, struct: null, t: 0, dur: 0.75, at: 0.45, done: false, food: id };
    this.p.anim.play("interact-left", { once: true, speed: 0.9 });
  }

  setStick(x: number, y: number) {
    this.stick.x = x;
    this.stick.y = y;
  }

  rotatePlacing(dir = 1) {
    if (this.placing) this.placing.rot += (Math.PI / 4) * dir;
  }

  cancelPlacing() {
    if (!this.placing) return;
    this.placing.ghost.removeFromParent();
    this.placing = null;
    this.placeRing.hide();
  }

  respawn() {
    if (this.phase !== "dead") return;
    const p = this.p;
    const h = this.home && this.structures.list.some((s) => (s.kind === "bedroll" || s.kind === "tent") && Math.hypot(s.x - this.home!.x, s.z - this.home!.z) < 0.5) ? this.home : null;
    const spot = h ?? { x: CAMP.x + 1, z: CAMP.z + 2 };
    p.x = spot.x + 1.2;
    p.z = spot.z + 0.8;
    p.hp = 60;
    p.hunger = Math.max(p.hunger, 45);
    p.warmth = Math.max(p.warmth, 70);
    p.state = "free";
    p.invuln = 4;
    p.root.rotation.set(0, 0, 0);
    p.anim.play("idle", { fade: 0 });
    // Creatures right on top of the spawn back off.
    for (const c of this.creatures) {
      if (!c.active) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 7) c.damage(0, (c.x - p.x) / (d || 1), (c.z - p.z) / (d || 1), 14, this.ctx);
    }
    this.camInit = false;
    this.setPhase("playing");
    music.duck(false);
    this.save();
  }

  /** The note in a bottle has been read; carry on. */
  get currentPhase() {
    return this.phase;
  }

  // --- Inventory ------------------------------------------------------------------------------------

  private has(id: ItemId) {
    return (this.inv[id] ?? 0) > 0;
  }

  private count(id: ItemId) {
    return this.inv[id] ?? 0;
  }

  private foodsOwned() {
    return FOODS.filter((f) => this.count(f) > 0);
  }

  private chestsNear() {
    return this.structures.list.filter((s) => s.kind === "chest" && Math.hypot(s.x - this.p.x, s.z - this.p.z) < 9);
  }

  private benchNear() {
    return this.structures.list.some((s) => s.kind === "workbench" && Math.hypot(s.x - this.p.x, s.z - this.p.z) < 6);
  }

  /** Resources in the pockets plus chests within reach. */
  private available(id: ResourceId) {
    let n = this.count(id);
    for (const c of this.chestsNear()) n += c.store[id] ?? 0;
    return n;
  }

  private affordable(cost: Partial<Record<ResourceId, number>>) {
    return Object.entries(cost).every(([k, v]) => this.available(k as ResourceId) >= (v ?? 0));
  }

  private pay(cost: Partial<Record<ResourceId, number>>) {
    for (const [k, v] of Object.entries(cost) as [ResourceId, number][]) {
      let need = v;
      const pocket = Math.min(need, this.count(k));
      this.inv[k] = this.count(k) - pocket;
      need -= pocket;
      for (const c of this.chestsNear()) {
        if (need <= 0) break;
        const take = Math.min(need, c.store[k] ?? 0);
        c.store[k] = (c.store[k] ?? 0) - take;
        need -= take;
      }
    }
  }

  private unlocked(id: RecipeId) {
    const r = RECIPE[id];
    if (!r) return false;
    if (r.after && !this.crafted.has(r.after) && !this.builtKinds.has(r.after as BuildId)) return false;
    return Object.keys(r.cost).every((k) => this.seen.has(k));
  }

  private get builtKinds() {
    const set = new Set<string>();
    for (const s of this.structures.list) set.add(s.kind);
    for (const c of this.crafted) set.add(c);
    return set;
  }

  private unlockedList(): RecipeId[] {
    return RECIPES.filter((r) => this.unlocked(r.id)).map((r) => r.id);
  }

  private knownRecipes = new Set<RecipeId>();

  private checkUnlocks() {
    for (const id of this.unlockedList()) {
      if (this.knownRecipes.has(id)) continue;
      this.knownRecipes.add(id);
      if (this.phase === "playing" && this.knownRecipes.size > 0 && this.elapsed > 0.5) {
        this.toast(`New recipe: ${RECIPE[id].name}`, "recipe", id);
        this.sfx.recipe();
      }
    }
  }

  private addItem(id: ItemId, n: number, quiet = false) {
    this.inv[id] = this.count(id) + n;
    if (!this.seen.has(id)) {
      this.seen.add(id);
      this.checkUnlocks();
    }
    if (isFood(id) && !this.food) this.food = id;
    if (!quiet) this.popups.show(`+${n} ${ITEMS[id].name}`, this.p.x, this.p.y + 2.1, this.p.z, "#fff7ed", 0.8);
  }

  /** Items fly from (x, y, z) to the castaway, then land in the inventory. */
  private give(id: ItemId, n: number, x: number, y: number, z: number) {
    const b = this.baked.get(ITEMS[id].model);
    if (!b) {
      this.addItem(id, n);
      return;
    }
    const mesh = new THREE.Mesh(b.geometry, b.material);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.pickups.push({ mesh, item: id, count: n, t: 0, dur: 0.55 + Math.random() * 0.15, sx: x, sy: y, sz: z, spin: rand(-8, 8) });
  }

  private toast(text: string, kind: Toast["kind"], icon?: string) {
    this.events.toast({ id: ++this.toastId, text, kind, icon });
  }

  private achieve(id: string) {
    if (this.achieved.has(id)) return;
    this.achieved.add(id);
    this.events.achieve(id);
  }

  // --- Held items -----------------------------------------------------------------------------------

  private slotItem(slot: number): ToolId | null {
    if (slot === 0) return this.has("axeIron") ? "axeIron" : this.has("axe") ? "axe" : null;
    if (slot === 1) return this.has("pickIron") ? "pickIron" : this.has("pick") ? "pick" : null;
    if (slot === 2) {
      if (this.has("hammer") && (this.preferHammer || !this.has("spear"))) return "hammer";
      return this.has("spear") ? "spear" : null;
    }
    if (slot === 3) return this.has("lantern") ? "lantern" : this.has("torch") ? "torch" : null;
    return null;
  }

  private get heldTool(): ToolId | null {
    return this.slotItem(this.selected);
  }

  private updateHeld() {
    const tool = this.heldTool;
    this.setHeld(tool ? ITEMS[tool].model : null);
  }

  private setHeld(key: string | null) {
    const p = this.p;
    if (p.heldKey === key) return;
    if (p.heldKey) {
      const o = p.held.get(p.heldKey);
      if (o) o.visible = false;
    }
    p.heldKey = key;
    if (key) {
      const o = p.held.get(key);
      if (o) o.visible = true;
    }
  }

  /** Light the castaway carries (0 = none). */
  private get carriedLight() {
    const t = this.heldTool;
    return t && TOOLS[t].light ? TOOLS[t].light! : 0;
  }

  // --- Input ----------------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const c = e.code;
    if (this.phase === "book") {
      if (c === "KeyC") {
        e.preventDefault();
        this.closeBook();
      }
      return;
    }
    if (this.phase !== "playing") return;
    const game = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyC", "KeyR", "KeyX", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].includes(c);
    if (!game) return;
    e.preventDefault();
    this.keys.add(c);
    if (e.repeat) return;
    if (c === "Space") this.press(true);
    else if (c === "KeyE") this.eat();
    else if (c === "KeyC") this.openBook();
    else if (c === "KeyR") this.rotatePlacing(e.shiftKey ? -1 : 1);
    else if (c === "KeyX") this.cancelPlacing();
    else if (c.startsWith("Digit")) this.select(Number(c.slice(5)) - 1);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === "Space") this.press(false);
  };

  private clearInput = () => {
    this.keys.clear();
    this.stick.x = this.stick.y = 0;
    this.actionHeld = false;
    this.drag = null;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.phase !== "playing") return;
    audio.unlock();
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button, type: e.pointerType };
    if (e.pointerType === "mouse") {
      this.mouseActive = true;
      this.updateMouse(e);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.target === this.canvas) {
      this.mouseActive = true;
      this.updateMouse(e);
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 7) d.moved = true;
    if (d.moved) {
      this.camYaw -= dx * 0.0065;
      this.camPitch = Math.max(0.28, Math.min(1.15, this.camPitch + dy * 0.004));
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (d.moved || this.phase !== "playing" || d.type !== "mouse") return;
    if (d.button === 2) {
      if (this.placing) this.cancelPlacing();
      return;
    }
    if (d.button === 0) {
      this.actionBuf = 0.3;
      audio.unlock();
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== "playing") return;
    e.preventDefault();
    this.camDist = Math.max(5.5, Math.min(18, this.camDist + Math.sign(e.deltaY) * 0.9));
  };

  private onContext = (e: Event) => e.preventDefault();

  private updateMouse(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** Movement input relative to the camera, length 0..1. */
  private moveInput(out: { x: number; z: number; run: boolean }) {
    let ix = 0;
    let iy = 0;
    if (this.keys.has("KeyA")) ix -= 1;
    if (this.keys.has("KeyD")) ix += 1;
    if (this.keys.has("KeyW")) iy += 1;
    if (this.keys.has("KeyS")) iy -= 1;
    ix += this.stick.x;
    iy += this.stick.y;
    const l = Math.hypot(ix, iy);
    if (l > 1) {
      ix /= l;
      iy /= l;
    }
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    out.x = fx * iy + rx * ix;
    out.z = fz * iy + rz * ix;
    out.run = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || Math.hypot(this.stick.x, this.stick.y) > 0.92;
    return out;
  }

  // --- Frame ----------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const real = Math.min(this.timer.getDelta(), 1 / 20);
    if (this.phase === "loading" || this.phase === "error" || !this.p) return;
    if (this.phase === "playing" || this.phase === "menu") this.adaptResolution(real);
    this.elapsed += real;

    if (this.phase === "playing") {
      const sleeping = this.p.state === "sleep";
      const steps = sleeping ? 4 : 1;
      for (let i = 0; i < steps; i++) this.update(sleeping ? real * 2.5 : real, real / steps);
    } else if (this.phase === "menu") this.updateMenu(real);
    else if (this.phase === "dead" || this.phase === "won") this.updateIdle(real);

    if (this.phase !== "paused" && this.phase !== "book") {
      this.fire.update(real);
      this.dust.update(real);
      this.smoke.update(real);
      this.popups.update(real);
      this.telegraphs.update(this.phase === "playing" ? real : 0);
    }
    this.updateEnvironment(real);
    this.updateCamera(this.phase === "paused" || this.phase === "book" ? 0 : real);
    this.renderer.render(this.scene, this.camera);
  };

  private get ctx(): CreatureCtx {
    return this.creatureCtx;
  }

  private readonly creatureCtx: CreatureCtx = {
    height: (x, z) => this.island.height(x, z),
    walkable: (x, z) => this.island.height(x, z) > -1.6,
    player: { x: 0, z: 0, alive: true, light: 0, lightKind: null },
    blockers: (x, z, r) => this.structures.near(x, z, r, this.blockTmp),
    solids: (x, z, r, out) => this.world.solids(x, z, r, out),
    hitPlayer: (c, dmg) => this.hurtPlayer(dmg, c.x, c.z),
    hitBlocker: (c, b, dmg) => this.hurtStructure(b as Structure, dmg, c),
    telegraph: (pos, r, dur) => this.telegraphs.show(pos, r, dur),
    cancelTelegraph: (h) => this.telegraphs.cancel(h),
    sound: (kind, c) => {
      if (Math.hypot(c.x - this.p.x, c.z - this.p.z) > 30) return;
      if (kind === "growl") this.sfx.growl(c.kind);
      else if (kind === "windup") this.sfx.windup();
      else this.sfx.emerge();
    },
    splash: (x, z) => this.splash(x, z, 1),
    dawn: false,
  };

  private readonly blockTmp: Structure[] = [];

  /** One simulation step (sleeping runs several fast ones). */
  private update(dt: number, realDt: number) {
    const p = this.p;
    this.clock += dt;
    const day = Math.floor(this.clock / DAY) + 1;
    const t = (this.clock % DAY) / DAY;
    this.dayEvents(day, t);
    this.lastT = t;

    this.world.update(dt, this.clock);
    this.structures.update(dt, { fire: this.fire, smoke: this.smoke });
    this.updatePlayer(dt);
    this.updateSurvival(dt, t);
    this.updateNight(dt, t, day);
    const ctx = this.creatureCtx;
    ctx.player.x = p.x;
    ctx.player.z = p.z;
    ctx.player.alive = p.state !== "dead" && p.invuln <= 0;
    ctx.player.light = this.carriedLight;
    const ht = this.heldTool;
    ctx.player.lightKind = ht === "torch" ? "torch" : ht === "lantern" ? "lantern" : null;
    ctx.dawn = t >= DAWN || t < NIGHT - 0.1;
    let alive = 0;
    for (const c of this.creatures) {
      if (!c.active) continue;
      c.update(dt, ctx);
      c.bar.update(dt, this.camera, c.x, c.y + c.def.height + 0.45, c.z);
      if (c.active && c.state !== "dying") alive++;
    }
    this.updatePickups(dt);
    this.updateShip(dt);
    if (this.escapeT >= 0) this.updateEscape(dt);
    if (this.placing) this.updatePlacing();
    else this.placeRing.hide();
    this.updateFocus();
    this.updateCooking();
    for (const s of this.structures.list) s.bar.update(dt, this.camera, s.x, s.root.position.y + (s.wall ? 2.2 : 1.6), s.z);

    // Music, ambience.
    this.attackedT = Math.max(0, this.attackedT - dt);
    const night = t >= NIGHT - 0.02 && t < DAWN;
    music.setIntensity(night || this.attackedT > 0 || alive > 0 ? 2 : 1);
    const shore = Math.max(0, 1 - Math.max(0, this.island.height(p.x, p.z) - 0.3) / 3);
    let fireNear = 0;
    for (const s of this.structures.list) if (s.light > 0) fireNear = Math.max(fireNear, 1 - Math.min(1, Math.hypot(s.x - p.x, s.z - p.z) / (s.kind === "signal" ? 18 : 10)));
    this.sfx.ambience(realDt, this.elapsed, { sea: shore, night: this.sky.darkness, fire: fireNear });

    this.checkT -= realDt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      this.periodicChecks(day);
    }
    this.saveT += realDt;
    if (this.saveT > 45) {
      this.saveT = 0;
      this.save();
    }
    this.hudT -= realDt;
    if (this.hudT <= 0) {
      this.hudT = 1 / 12;
      this.emitHud();
    }
  }

  // --- Day & night ---------------------------------------------------------------------------------

  private dayEvents(day: number, t: number) {
    const prev = this.lastT;
    const crossed = (mark: number) => prev < mark && t >= mark;
    if (crossed(DUSK)) {
      this.events.banner("Dusk", this.structures.count(["campfire"]) ? "Night is coming — head back to your fire" : "Night is coming — build a campfire!");
    }
    if (crossed(NIGHT)) {
      this.beginNight(day, 0);
      this.sfx.nightFalls();
      this.events.banner(`Night ${day}`, "Something stirs in the surf…");
      this.save();
    }
    if (t < prev) {
      // A new day.
      this.newDay(day);
    }
    if (this.shipUntil > 0 && this.clock > this.shipUntil && this.escapeT < 0) {
      this.shipUntil = 0;
      if (this.ship) this.ship.visible = false;
      this.events.banner("The ship sailed on", "Light the signal fire again tonight");
    }
  }

  private beginNight(day: number, elapsed: number) {
    this.nightStart = this.clock - elapsed;
    for (const s of this.structures.list) if (s.kind === "signal") s.burn = 0;
    const plan = raidPlan(day);
    const r = rng(day * 977 + 13);
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    // Spread the arrivals over the first two thirds of the night, in small groups.
    this.spawnQueue = plan.map((kind, i) => ({ at: 4 + (i / Math.max(1, plan.length)) * NIGHT_LEN * 0.62 + r() * 4, kind })).filter((s) => s.at >= elapsed);
    this.spawnQueue.sort((a, b) => a.at - b.at);
  }

  private newDay(day: number) {
    this.stats.day = day;
    this.events.day(day);
    this.sfx.dawn();
    if (day - 1 > this.nightDone) {
      this.nightDone = day - 1;
      this.achieve("night1");
    }
    if (day >= 7) this.achieve("week");
    this.events.banner(`Day ${day}`, this.dawnLine(day));
    // Signal fires that burnt through most of the night bring a ship.
    const signal = this.structures.list.find((s) => s.kind === "signal");
    if (signal && signal.lit && signal.burn >= NIGHT_LEN * 0.6) {
      this.showShip(this.clock + DAY * (DUSK + 0.02), true);
    }
    for (const s of this.structures.list) if (s.kind === "signal") s.lit = false;
    // Flotsam washes up.
    const r = rng(day * 31 + 7);
    const n = this.world.washUp(1 + (day % 2), r, () => {
      const loot: Partial<Record<ItemId, number>> = { planks: 2 + Math.floor(r() * 3), fiber: 2 };
      if (r() < 0.65) loot.scrap = 1 + Math.floor(r() * 2);
      if (r() < 0.4) loot.cloth = 1;
      if (r() < 0.4) loot.coconut = 2;
      return loot;
    });
    if (n > 0 && day > 1) this.toast(n > 1 ? "Crates washed up on the beach" : "A crate washed up on the beach", "info");
    this.save();
  }

  private dawnLine(day: number) {
    if (this.shipUntil > this.clock) return "A ship! Board your raft before dusk";
    if (day === 2) return "You made it through the night";
    return ["The tide brought something in", "Another day on the island", "Keep the fires burning"][day % 3];
  }

  private showShip(until: number, announce: boolean) {
    this.shipUntil = until;
    const ship = this.ship;
    if (!ship) return;
    const anchor = this.raft ?? this.structures.list.find((s) => s.kind === "signal") ?? { x: CAMP.x, z: CAMP.z };
    const a = Math.atan2(anchor.z, anchor.x);
    const d = this.island.coast(a) + 30;
    ship.position.set(Math.cos(a) * d, -0.3, Math.sin(a) * d);
    ship.rotation.y = -a;
    ship.visible = true;
    if (announce) {
      this.sfx.horn();
      setTimeout(() => !this.disposed && this.sfx.horn(), 2200);
      this.events.banner("A ship!", this.raft ? "Board your raft before dusk" : "Build a raft on the shore — quick, before dusk!");
    }
  }

  private updateNight(dt: number, t: number, day: number) {
    if (t < NIGHT || t >= DAWN || this.nightStart < 0) return;
    const into = this.clock - this.nightStart;
    // Signal fire burn time.
    for (const s of this.structures.list) if (s.kind === "signal" && s.lit) s.burn += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].at <= into) {
      const next = this.spawnQueue.shift()!;
      this.spawnCreature(next.kind, day);
    }
  }

  private spawnCreature(kind: CreatureKind, day: number) {
    const alive = this.creatures.filter((c) => c.active).length;
    if (alive >= MAX_CREATURES) return;
    const c = this.creature(kind);
    if (!c) return;
    const p = this.p;
    const pa = Math.atan2(p.z, p.x);
    for (let k = 0; k < 30; k++) {
      const a = pa + rand(-1.3, 1.3);
      const d = this.island.coast(a) * rand(1.04, 1.1);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = this.island.height(x, z);
      if (h > -0.5 || h < -2.6) continue;
      if (Math.hypot(x - p.x, z - p.z) < 14) continue;
      const hp = Math.round(c.def.hp * (1 + 0.08 * (day - 1)));
      c.spawn(x, z, hp, this.creatureCtx);
      c.maxHp = hp;
      return;
    }
  }

  // --- Player ---------------------------------------------------------------------------------------

  private readonly mv = { x: 0, z: 0, run: false };
  private readonly solidTmp: { x: number; z: number; r: number }[] = [];

  private updatePlayer(dt: number) {
    const p = this.p;
    p.invuln = Math.max(0, p.invuln - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    this.actionBuf = Math.max(0, this.actionBuf - dt);
    p.anim.update(dt);

    if (p.state === "dead") {
      p.deadT += dt;
      p.y = this.island.height(p.x, p.z);
      this.placeModel();
      return;
    }
    if (p.state === "board") {
      this.placeModel();
      return;
    }
    if (p.state === "sleep") {
      if (this.actionBuf > 0 || this.moveInput(this.mv).x !== 0 || this.mv.z !== 0) this.wakeUp("");
      this.placeModel();
      return;
    }

    // Movement.
    const mv = this.moveInput(this.mv);
    const busy = p.state === "act" || p.state === "fish";
    const attacking = p.state === "attack";
    const inWater = this.island.height(p.x, p.z) < this.island.waterLevel(p.x, p.z) - 0.15;
    let speed = (mv.run ? RUN : WALK) * (inWater ? 0.6 : 1);
    if (busy) speed = 0;
    if (attacking) speed *= 0.35;
    const wishX = mv.x * speed;
    const wishZ = mv.z * speed;
    const accel = 1 - Math.exp(-(busy ? 20 : 12) * dt);
    p.vx += (wishX - p.vx) * accel;
    p.vz += (wishZ - p.vz) * accel;
    // Knockback.
    let mx = p.vx + p.kx;
    let mz = p.vz + p.kz;
    const kd = Math.exp(-8 * dt);
    p.kx *= kd;
    p.kz *= kd;
    if (this.escapeT >= 0) mx = mz = 0;
    this.movePlayer(mx * dt, mz * dt);
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.3 && !busy && !attacking && Math.hypot(mv.x, mv.z) > 0.05) p.yaw = turnTowards(p.yaw, yawTo(mv.x, mv.z), 12, dt);

    // Fishing needle.
    if (p.state === "fish") this.updateFishing(dt);

    // Actions.
    if (p.state === "free" && (this.actionBuf > 0 || this.actionHeld)) {
      const repeat = this.actionBuf <= 0;
      this.actionBuf = 0;
      this.doAction(repeat);
    } else if (p.state === "attack" && this.actionBuf > 0 && p.swing && p.swing.t > p.swing.dur * 0.55) {
      this.actionBuf = 0;
      this.startSwing();
    }
    if (p.state === "act") this.updateAct(dt);
    if (p.state === "attack") this.updateSwing(dt);

    // Locomotion animation.
    if (p.state === "free") {
      if (sp > 0.4) {
        p.anim.play(sp > WALK + 0.6 ? "sprint" : "walk", { speed: sp > WALK + 0.6 ? sp / RUN : Math.max(0.6, sp / WALK) });
        p.stepT -= dt * (sp / 1.9);
        if (p.stepT <= 0) {
          p.stepT = 1;
          const h = this.island.height(p.x, p.z);
          this.sfx.step(h < 1 && Math.hypot(p.x, p.z) > 20, h < this.island.waterLevel(p.x, p.z) - 0.05);
          if (h < this.island.waterLevel(p.x, p.z) - 0.05) this.splash(p.x, p.z, 0.3);
        }
      } else p.anim.play("idle");
    }
    this.placeModel();
  }

  private placeModel() {
    const p = this.p;
    p.y = Math.max(this.island.height(p.x, p.z), this.island.waterLevel(p.x, p.z) - 0.55);
    if (p.state !== "board") p.root.position.set(p.x, p.y, p.z);
    p.root.rotation.y = p.yaw;
    // The held torch / lantern glows.
    const light = this.carriedLight;
    if (light > 0 && p.state !== "dead" && p.state !== "sleep") {
      const hand = p.hand ?? p.root;
      hand.getWorldPosition(this.tmpV);
      const flick = 0.85 + Math.sin(this.elapsed * 23) * 0.05 + Math.sin(this.elapsed * 13.7) * 0.07;
      const night = 0.35 + this.sky.darkness * 0.65;
      this.handLight.position.set(this.tmpV.x, this.tmpV.y + 0.5, this.tmpV.z);
      this.handLight.intensity = (this.heldTool === "lantern" ? 22 : 16) * flick * night;
      this.handLight.distance = light * 1.6;
      if (this.heldTool === "torch" && Math.random() < 0.6) {
        this.fire.emit({ x: this.tmpV.x + rand(-0.05, 0.05), y: this.tmpV.y + 0.42, z: this.tmpV.z + rand(-0.05, 0.05), vx: rand(-0.2, 0.2), vy: rand(0.8, 1.5), vz: rand(-0.2, 0.2), life: rand(0.25, 0.45), size: rand(0.22, 0.34), endSize: 0.05, color: "#ffd27a", endColor: "#ff3d10", alpha: 0.9, drag: 1.5 });
      }
    } else this.handLight.intensity = 0;
  }

  private movePlayer(mx: number, mz: number) {
    const p = this.p;
    let nx = p.x + mx;
    let nz = p.z + mz;
    // Deep water stops you.
    const water = this.island.waterLevel(nx, nz);
    if (this.island.height(nx, nz) < water - 0.85) {
      const tryX = this.island.height(nx, p.z) >= water - 0.85;
      const tryZ = this.island.height(p.x, nz) >= water - 0.85;
      if (tryX) nz = p.z;
      else if (tryZ) nx = p.x;
      else {
        nx = p.x;
        nz = p.z;
      }
    }
    for (const s of this.world.solids(nx, nz, PLAYER_R, this.solidTmp)) {
      const dx = nx - s.x;
      const dz = nz - s.z;
      const d = Math.hypot(dx, dz);
      const min = PLAYER_R + s.r;
      if (d < min && d > 1e-5) {
        nx = s.x + (dx / d) * min;
        nz = s.z + (dz / d) * min;
      }
    }
    for (const s of this.structures.near(nx, nz, PLAYER_R + 2.5, this.blockTmp)) {
      if (!s.solid || BUILDS[s.kind].walkable) continue;
      const hit = pushOut(nx, nz, PLAYER_R, s);
      if (hit) {
        nx = hit.x;
        nz = hit.z;
      }
    }
    // Creatures are solid too (softly).
    for (const c of this.creatures) {
      if (!c.active || c.state === "dying") continue;
      const dx = nx - c.x;
      const dz = nz - c.z;
      const d = Math.hypot(dx, dz);
      const min = PLAYER_R + c.radius;
      if (d < min && d > 1e-5) {
        nx = c.x + (dx / d) * min;
        nz = c.z + (dz / d) * min;
      }
    }
    p.x = nx;
    p.z = nz;
  }

  // --- Focus & actions -----------------------------------------------------------------------------

  private readonly nearTmp: Node[] = [];

  private updateFocus() {
    const p = this.p;
    const f = this.focus;
    f.node = null;
    f.struct = null;
    f.creature = null;
    f.satchel = false;
    f.prompt = null;
    if (p.state === "dead" || p.state === "board" || this.escapeT >= 0) {
      this.focusRing.hide();
      return;
    }
    if (p.state === "sleep") {
      f.prompt = { text: "Wake up", ok: true, key: "Space" };
      this.focusRing.hide();
      return;
    }
    if (p.state === "fish") {
      f.prompt = { text: "Strike when the marker is in the green!", ok: true, key: "Space" };
      return;
    }
    if (this.placing) {
      const pl = this.placing;
      f.prompt = { text: pl.valid ? `Place ${BUILDS[pl.id].name}` : pl.reason, ok: pl.valid, key: "Space" };
      this.focusRing.hide();
      return;
    }
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    // A creature close by takes priority.
    let bestC: Creature | null = null;
    let bestCD = 3.4;
    for (const c of this.creatures) {
      if (!c.active || c.state === "dying") continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bestCD) {
        bestCD = d;
        bestC = c;
      }
    }
    if (bestC) {
      f.creature = bestC;
      f.prompt = { text: `Attack the ${bestC.def.name.toLowerCase()}`, ok: true, key: "Space" };
      this.focusRing.color("#ef4444");
      this.focusRing.set(bestC.x, bestC.y, bestC.z, bestC.radius + 0.35, 0.9);
      return;
    }
    let best: { score: number; node?: Node; struct?: Structure; satchel?: boolean } | null = null;
    const consider = (x: number, z: number, r: number, reach: number, item: { node?: Node; struct?: Structure; satchel?: boolean }) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      const edge = d - r;
      if (edge > reach) return;
      const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      if (facing < -0.2 && edge > 0.5) return;
      const score = edge - facing * 0.9;
      if (!best || score < best.score) best = { score, ...item };
    };
    for (const n of this.world.near(p.x, p.z, 6, this.nearTmp)) {
      if (!this.actionable(n)) continue;
      consider(n.x, n.z, n.kind === "fish" ? 0 : Math.max(n.r, 0.3), 1.0 + n.reach, { node: n });
    }
    for (const s of this.structures.near(p.x, p.z, 5, this.blockTmp)) {
      if (s.wall) continue;
      consider(s.x, s.z, s.kind === "raft" ? 1.6 : s.r, 1.1, { struct: s });
    }
    if (this.satchel) consider(this.satchel.x, this.satchel.z, 0.4, 1.2, { satchel: true });
    const b = best as { node?: Node; struct?: Structure; satchel?: boolean } | null;
    if (!b) {
      this.focusRing.hide();
      return;
    }
    f.node = b.node ?? null;
    f.struct = b.struct ?? null;
    f.satchel = !!b.satchel;
    f.prompt = this.promptFor(f.node, f.struct, f.satchel);
    const x = f.node ? f.node.x : f.struct ? f.struct.x : this.satchel!.x;
    const z = f.node ? f.node.z : f.struct ? f.struct.z : this.satchel!.z;
    const r = f.node ? (f.node.kind === "fish" ? 1.3 : Math.max(0.55, f.node.r + 0.3)) : f.struct ? (f.struct.kind === "raft" ? 2 : f.struct.r + 0.45) : 0.7;
    const y = f.node?.kind === "fish" ? this.island.waterLevel(x, z) : this.island.height(x, z);
    this.focusRing.color(f.prompt?.ok ? "#fb923c" : "#94a3b8");
    this.focusRing.set(x, y, z, r, 0.95);
  }

  private actionable(n: Node) {
    if (n.kind === "boulder") return false;
    if (n.kind === "palm" || n.kind === "berry" || n.kind === "fish") return n.alive && n.charges > 0;
    return n.alive;
  }

  private promptFor(node: Node | null, s: Structure | null, satchel: boolean): Prompt {
    const k = "Space";
    if (satchel) return { text: "Pick up your satchel", ok: true, key: k };
    if (node) {
      switch (node.kind) {
        case "tree":
          return this.slotItem(0) ? { text: "Chop tree", ok: true, key: k } : { text: "You need an axe (C to craft)", ok: false, key: k };
        case "rock":
          return this.slotItem(1) ? { text: "Mine rock", ok: true, key: k } : { text: "You need a pickaxe (C to craft)", ok: false, key: k };
        case "palm":
          return { text: "Shake for coconuts", ok: true, key: k };
        case "bush":
          return { text: "Gather fibre", ok: true, key: k };
        case "berry":
          return { text: "Pick berries", ok: true, key: k };
        case "mushroom":
          return { text: "Pick mushrooms", ok: true, key: k };
        case "driftwood":
          return { text: "Take driftwood", ok: true, key: k };
        case "pebble":
          return { text: "Take stones", ok: true, key: k };
        case "crate":
          return { text: node.floating ? "Open washed-up crate" : "Search the crate", ok: true, key: k };
        case "bottle":
          return { text: "A message in a bottle!", ok: true, key: k };
        case "fish":
          return this.has("spear") ? { text: "Spear fish", ok: true, key: k } : { text: "Fish! You need a spear", ok: false, key: k };
        default:
          return { text: "", ok: false, key: k };
      }
    }
    if (s) {
      const t = (this.clock % DAY) / DAY;
      const evening = t >= DUSK - 0.04 || t < 0.02;
      switch (s.kind) {
        case "campfire": {
          const raw = this.rawFoods();
          if (s.cooking?.done) return { text: "Take the cooked food", ok: true, key: k };
          if (s.cooking) return { text: "Cooking…", ok: false, key: k };
          if (!s.lit) return this.count("wood") >= 2 ? { text: "Relight the fire (2 wood)", ok: true, key: k } : { text: "Relight: needs 2 wood", ok: false, key: k };
          if (raw.length) return { text: `Cook ${raw.reduce((a, [, n]) => a + n, 0)} raw food`, ok: true, key: k };
          if (s.fuel >= SURVIVAL.maxFuel - 10) return { text: "The fire is roaring", ok: false, key: k };
          return this.count("wood") >= 1 ? { text: `Add wood · fire ${Math.round((s.fuel / SURVIVAL.maxFuel) * 100)}%`, ok: true, key: k } : { text: "Feed it wood to keep it burning", ok: false, key: k };
        }
        case "workbench":
          return { text: "Use the workbench", ok: true, key: k };
        case "bedroll":
        case "tent":
          return evening ? { text: "Sleep until morning", ok: true, key: k } : { text: "Rest here (sets your home)", ok: true, key: k };
        case "chest": {
          const any = RESOURCES.some((r) => this.count(r) > 0);
          return any ? { text: "Stash your resources", ok: true, key: k } : { text: `Chest · ${RESOURCES.reduce((a, r) => a + (s.store[r] ?? 0), 0)} stored`, ok: false, key: k };
        }
        case "signal":
          if (s.lit) return { text: "The signal fire is burning", ok: false, key: k };
          if (!evening) return { text: "Light it at dusk or night", ok: false, key: k };
          return this.count("wood") >= 5 ? { text: "Light the signal fire (5 wood)", ok: true, key: k } : { text: "Light it: needs 5 wood", ok: false, key: k };
        case "raft":
          return this.shipUntil > this.clock ? { text: "Sail to the ship!", ok: true, key: k } : { text: "Wait for a ship (keep a signal fire lit all night)", ok: false, key: k };
        case "torchPost":
          return { text: "Torch post", ok: false, key: k };
        default:
          return { text: BUILDS[s.kind].name, ok: false, key: k };
      }
    }
    return { text: "", ok: false, key: k };
  }

  private rawFoods(): [FoodId, number][] {
    return (["fish", "bigFish", "meat"] as FoodId[]).filter((f) => this.count(f) > 0).map((f) => [f, this.count(f)]);
  }

  private doAction(repeat: boolean) {
    const p = this.p;
    if (this.placing) {
      if (!repeat) this.confirmPlacing();
      return;
    }
    const f = this.focus;
    if (f.creature || (!f.node && !f.struct && !f.satchel)) {
      if (repeat && !f.creature) return;
      this.startSwing();
      return;
    }
    if (f.satchel && this.satchel) {
      if (repeat) return;
      const s = this.satchel;
      this.satchel = null;
      this.updateSatchel();
      for (const [id, n] of Object.entries(s.items) as [ItemId, number][]) if (n > 0) this.give(id, n, s.x, this.island.height(s.x, s.z) + 0.5, s.z);
      this.p.anim.play("pick-up", { once: true, speed: 0.7 });
      this.sfx.crate();
      return;
    }
    const n = f.node;
    if (n) {
      const face = () => (p.yaw = yawTo(n.x - p.x, n.z - p.z));
      switch (n.kind) {
        case "tree":
        case "rock": {
          const slot = n.kind === "tree" ? 0 : 1;
          const tool = this.slotItem(slot);
          if (!tool) {
            if (!repeat) {
              this.toast(n.kind === "tree" ? "You need an axe — open the journal (C)" : "You need a pickaxe — open the journal (C)", "warn");
              this.sfx.denied();
            }
            return;
          }
          if (this.selected !== slot) {
            this.selected = slot;
            this.updateHeld();
          }
          face();
          const speed = TOOLS[tool].speed;
          this.beginAct(n.kind === "tree" ? "chop" : "mine", n, null, 0.62 / speed, 0.36 / speed);
          p.anim.play("attack-melee-right", { once: true, speed: 0.42 / (0.62 / speed) * 1.05, fade: 0.08 });
          return;
        }
        case "palm":
        case "bush":
        case "berry":
          if (repeat && n.kind === "palm") return;
          face();
          this.beginAct(n.kind === "palm" ? "shake" : "gather", n, null, 0.7, 0.45);
          p.anim.play("interact-right", { once: true, speed: 1, fade: 0.1 });
          return;
        case "mushroom":
        case "driftwood":
        case "pebble":
        case "bottle":
          face();
          this.beginAct("pick", n, null, 0.6, 0.38);
          p.anim.play("pick-up", { once: true, speed: 0.6, fade: 0.1 });
          return;
        case "crate":
          if (repeat) return;
          face();
          this.beginAct("open", n, null, 0.8, 0.55);
          p.anim.play("interact-right", { once: true, speed: 0.85, fade: 0.1 });
          return;
        case "fish":
          if (repeat) return;
          if (!this.has("spear")) {
            this.toast("You need a spear to catch fish", "warn");
            this.sfx.denied();
            return;
          }
          face();
          this.startFishing(n);
          return;
      }
      return;
    }
    const s = f.struct;
    if (s && !repeat) {
      p.yaw = yawTo(s.x - p.x, s.z - p.z);
      this.useStructure(s);
    }
  }

  private beginAct(kind: ActKind, node: Node | null, struct: Structure | null, dur: number, at: number) {
    this.p.state = "act";
    this.p.act = { kind, node, struct, t: 0, dur, at, done: false };
  }

  private updateAct(dt: number) {
    const p = this.p;
    const a = p.act;
    if (!a) {
      p.state = "free";
      return;
    }
    a.t += dt;
    if (!a.done && a.t >= a.at) {
      a.done = true;
      this.resolveAct(a);
    }
    if (a.t >= a.dur) {
      p.state = "free";
      p.act = null;
    }
  }

  private resolveAct(a: Act) {
    const p = this.p;
    const n = a.node;
    const hx = p.x + Math.sin(p.yaw) * 0.9;
    const hz = p.z + Math.cos(p.yaw) * 0.9;
    switch (a.kind) {
      case "chop":
      case "mine": {
        if (!n || !n.alive) return;
        const tool = this.slotItem(a.kind === "chop" ? 0 : 1);
        if (!tool) return;
        const power = a.kind === "chop" ? TOOLS[tool].chop ?? 1 : TOOLS[tool].mine ?? 1;
        const y = n.y + (a.kind === "chop" ? 1.0 : 0.6);
        const ix = n.x + (p.x - n.x) * 0.35;
        const iz = n.z + (p.z - n.z) * 0.35;
        if (a.kind === "chop") this.world.fallDir.set(n.x - p.x, 0, n.z - p.z).normalize();
        const broke = this.world.hit(n, power);
        if (a.kind === "chop") {
          this.sfx.chop(broke);
          this.dust.burst(8, ix, y, iz, { speed: 3, up: 3, life: 0.6, size: 0.14, color: "#e0b27a", gravity: 9, drag: 1, jitter: 0.2 });
          if (broke) {
            this.sfx.treeFall();
            this.stats.felled++;
            this.achieve("timber");
            const wood = 3 + (tool === "axeIron" ? 2 : 0);
            this.give("wood", wood, n.x, n.y + 1.5, n.z);
            if (Math.random() < 0.5) this.give("fiber", 1, n.x, n.y + 2, n.z);
          }
        } else {
          this.sfx.clink(broke);
          this.dust.burst(broke ? 22 : 8, ix, y, iz, { speed: broke ? 4 : 3, up: 3, life: 0.6, size: broke ? 0.2 : 0.13, color: "#b9b0a2", gravity: 9, drag: 1, jitter: broke ? 0.6 : 0.2 });
          if (broke) {
            const stone = 3 + (tool === "pickIron" ? 2 : 0);
            this.give("stone", stone, n.x, n.y + 0.6, n.z);
            if (Math.random() < 0.18) this.give("scrap", 1, n.x, n.y + 0.6, n.z);
          } else if (Math.random() < 0.5) this.give("stone", 1, n.x, n.y + 0.6, n.z);
        }
        this.shake = Math.max(this.shake, broke ? 0.18 : 0.06);
        return;
      }
      case "shake": {
        if (!n) return;
        this.sfx.rustle();
        if (this.world.take(n)) {
          const c = n.extras[n.charges] ?? n.extras[0];
          const y = c ? n.y + c.oy * n.scale : n.y + 4;
          this.give("coconut", 1, n.x, y, n.z);
          this.dust.burst(10, n.x, y + 0.6, n.z, { speed: 2, up: 1, life: 0.9, size: 0.18, color: "#3f9a50", gravity: 3, jitter: 0.8 });
        }
        return;
      }
      case "gather": {
        if (!n) return;
        this.sfx.rustle();
        this.dust.burst(8, n.x, n.y + 0.5, n.z, { speed: 2, up: 2, life: 0.7, size: 0.15, color: n.kind === "berry" ? "#d9415a" : "#4f9a46", gravity: 5, jitter: 0.4 });
        if (n.kind === "berry") {
          let got = 0;
          for (let i = 0; i < 2; i++) if (this.world.take(n)) got++;
          if (got) this.give("berries", got, n.x, n.y + 0.5, n.z);
        } else {
          this.world.deplete(n, 100, this.clock);
          this.give("fiber", 2, n.x, n.y + 0.4, n.z);
        }
        return;
      }
      case "pick": {
        if (!n || !n.alive) return;
        this.sfx.pickup();
        if (n.kind === "bottle") {
          this.world.deplete(n, 0, this.clock);
          this.notes.add(n.tag);
          this.sfx.bottle();
          this.events.note(NOTES[n.tag] ?? "", n.tag);
          if (this.notes.size >= NOTES.length) this.achieve("notes");
          return;
        }
        this.world.deplete(n, n.kind === "mushroom" ? DAY : 0, this.clock);
        const item: ItemId = n.kind === "mushroom" ? "mushroom" : n.kind === "driftwood" ? "wood" : "stone";
        this.give(item, n.kind === "mushroom" ? 1 : 2, n.x, n.y + 0.3, n.z);
        return;
      }
      case "open": {
        if (!n || !n.alive) return;
        this.sfx.crate();
        this.stats.opened++;
        const loot = n.loot ?? { wood: 2 };
        this.world.deplete(n, 0, this.clock);
        this.dust.burst(18, n.x, n.y + 0.5, n.z, { speed: 4, up: 4, life: 0.8, size: 0.2, color: "#b7834f", gravity: 9, drag: 1, jitter: 0.4 });
        for (const [id, c] of Object.entries(loot) as [ItemId, number][]) if (c > 0) this.give(id, c, n.x, n.y + 0.7, n.z);
        return;
      }
      case "eat": {
        const id = a.food;
        if (!id || this.count(id) <= 0) return;
        this.inv[id] = this.count(id) - 1;
        const fd = FOOD[id];
        p.hunger = Math.min(100, p.hunger + fd.hunger);
        p.hp = Math.max(1, Math.min(100, p.hp + fd.health));
        this.sfx.eat();
        this.popups.show(`+${fd.hunger} food`, p.x, p.y + 2.1, p.z, "#fdba74", 0.8);
        if (fd.health < 0) this.toast("Raw food upsets your stomach — cook it at a campfire", "warn");
        this.dust.burst(6, hx, p.y + 1.2, hz, { speed: 1.2, up: 1, life: 0.5, size: 0.1, color: "#f5d0a0", gravity: 6 });
        if (this.count(id) <= 0) this.food = this.foodsOwned()[0] ?? null;
        return;
      }
      default:
        return;
    }
  }

  private useStructure(s: Structure) {
    const p = this.p;
    const t = (this.clock % DAY) / DAY;
    const evening = t >= DUSK - 0.04 || t < 0.02;
    switch (s.kind) {
      case "campfire": {
        if (s.cooking?.done) {
          this.collectCooking(s);
          return;
        }
        if (s.cooking) return;
        if (!s.lit) {
          if (this.count("wood") < 2) {
            this.sfx.denied();
            this.toast("You need 2 wood to relight the fire", "warn");
            return;
          }
          this.inv.wood = this.count("wood") - 2;
          s.lit = true;
          s.fuel = Math.max(s.fuel, SURVIVAL.fuelPerWood * 2);
          this.sfx.fireLight();
          p.anim.play("interact-right", { once: true });
          return;
        }
        const raw = this.rawFoods();
        if (raw.length) {
          const items: FoodId[] = [];
          for (const [f, n] of raw) {
            for (let i = 0; i < n && items.length < 8; i++) items.push(f);
            this.inv[f] = this.count(f) - Math.min(n, 8);
          }
          s.cooking = { items, t: 0, done: false };
          this.showRack(s, true);
          this.sfx.fuel();
          p.anim.play("interact-right", { once: true });
          return;
        }
        if (this.count("wood") < 1 || s.fuel >= SURVIVAL.maxFuel - 10) {
          this.sfx.denied();
          return;
        }
        this.inv.wood = this.count("wood") - 1;
        s.fuel = Math.min(SURVIVAL.maxFuel, s.fuel + SURVIVAL.fuelPerWood);
        this.sfx.fuel();
        this.fire.burst(14, s.x, s.root.position.y + 0.4, s.z, { speed: 1.5, up: 3, life: 0.7, size: 0.2, color: "#ffd27a", endColor: "#ff4a10", drag: 1 });
        p.anim.play("interact-right", { once: true });
        return;
      }
      case "workbench":
        this.openBook();
        return;
      case "bedroll":
      case "tent": {
        this.home = { x: s.x, z: s.z };
        if (!evening) {
          this.toast("Home set: you'll wake up here", "info");
          this.sfx.pickup();
          return;
        }
        const near = this.creatures.some((c) => c.active && c.state !== "dying" && Math.hypot(c.x - p.x, c.z - p.z) < 12);
        if (near) {
          this.toast("You can't sleep with creatures nearby!", "warn");
          this.sfx.denied();
          return;
        }
        this.sleepAt(s);
        return;
      }
      case "chest": {
        let moved = 0;
        for (const r of RESOURCES) {
          const n = this.count(r);
          if (n <= 0) continue;
          s.store[r] = (s.store[r] ?? 0) + n;
          this.inv[r] = 0;
          moved += n;
        }
        if (moved) {
          this.toast(`Stashed ${moved} resources (crafting nearby still uses them)`, "info");
          this.sfx.crate();
        } else this.sfx.denied();
        return;
      }
      case "signal": {
        if (s.lit || !evening) {
          this.sfx.denied();
          return;
        }
        if (this.count("wood") < 5) {
          this.toast("You need 5 wood to light the signal fire", "warn");
          this.sfx.denied();
          return;
        }
        this.inv.wood = this.count("wood") - 5;
        s.lit = true;
        s.hp = s.maxHp;
        this.sfx.fireLight();
        this.events.banner("The signal fire is lit", "Keep it burning until dawn");
        return;
      }
      case "raft": {
        if (this.shipUntil > this.clock) this.beginEscape(s);
        else this.sfx.denied();
        return;
      }
      default:
        return;
    }
  }

  // --- Combat --------------------------------------------------------------------------------------

  private startSwing() {
    const p = this.p;
    // Fists, the held tool, or the best weapon if nothing useful is in hand.
    let tool = this.heldTool;
    if (!tool && this.selected >= 4) tool = this.slotItem(2);
    const def = tool ? TOOLS[tool] : FIST;
    const step = p.comboT > 0 ? (p.combo + 1) % 3 : 0;
    p.combo = step;
    const dur = (step === 2 ? 0.62 : 0.5) / def.speed;
    p.swing = { t: 0, dur, hitAt: dur * (step === 2 ? 0.55 : 0.45), hit: false, step, tool };
    p.state = "attack";
    // Face the nearest creature in range.
    const c = this.focus.creature;
    if (c) p.yaw = yawTo(c.x - p.x, c.z - p.z);
    const clip = step === 2 ? "attack-kick-right" : step === 1 ? "attack-melee-left" : "attack-melee-right";
    p.anim.play(clip, { once: true, speed: (p.anim.duration(clip) / dur) * 1.1, fade: 0.06 });
    this.sfx.swing();
  }

  private updateSwing(dt: number) {
    const p = this.p;
    const s = p.swing;
    if (!s) {
      p.state = "free";
      return;
    }
    s.t += dt;
    if (!s.hit && s.t >= s.hitAt) {
      s.hit = true;
      const def = s.tool ? TOOLS[s.tool] : FIST;
      const reach = def.reach + (s.step === 2 ? 0.2 : 0);
      const fx = Math.sin(p.yaw);
      const fz = Math.cos(p.yaw);
      let hits = 0;
      for (const c of this.creatures) {
        if (!c.active || c.state === "dying") continue;
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > reach + c.radius) continue;
        const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
        if (dot < 0.25 && d > c.radius + 0.5) continue;
        const dmg = Math.round(def.damage * (s.step === 2 ? 1.35 : 1) * rand(0.9, 1.1));
        const knock = def.knock * (s.step === 2 ? 1.8 : 1);
        const died = c.damage(dmg, dx / (d || 1), dz / (d || 1), knock, this.creatureCtx);
        hits++;
        this.popups.show(String(dmg), c.x, c.y + c.def.height + 0.3, c.z, s.step === 2 ? "#fdba74" : "#fff7ed", 0.9);
        this.dust.burst(10, c.x, c.y + c.def.height * 0.5, c.z, { speed: 3.5, up: 2, life: 0.45, size: 0.14, color: c.kind === "ghost" ? "#dbeafe" : c.kind === "crab" ? "#f97316" : "#d6d3d1", gravity: 6, jitter: 0.2 });
        if (died) this.onKill(c);
      }
      if (hits) {
        this.sfx.hit(s.step === 2 || s.tool === "hammer");
        this.shake = Math.max(this.shake, 0.12);
        this.attackedT = 4;
      }
      // Swinging at a tree or rock with the right tool still works.
      const n = this.focus.node;
      if (!hits && n && (n.kind === "tree" || n.kind === "rock")) {
        const ok = (n.kind === "tree" && (s.tool === "axe" || s.tool === "axeIron")) || (n.kind === "rock" && (s.tool === "pick" || s.tool === "pickIron"));
        if (ok) this.resolveAct({ kind: n.kind === "tree" ? "chop" : "mine", node: n, struct: null, t: 0, dur: 0, at: 0, done: true });
      }
    }
    if (s.t >= s.dur) {
      p.state = "free";
      p.swing = null;
      p.comboT = 0.35;
    }
  }

  private onKill(c: Creature) {
    this.stats.kills++;
    this.sfx.creatureDie();
    if (this.stats.kills >= 25) this.achieve("hunter");
    if (c.kind === "brute") this.achieve("brute");
    for (const d of c.def.drops) if (Math.random() < d.chance) this.give(d.item, d.count, c.x, c.y + 0.6, c.z);
  }

  private hurtPlayer(dmg: number, fromX: number, fromZ: number) {
    const p = this.p;
    if (p.state === "dead" || p.invuln > 0 || this.escapeT >= 0) return;
    if (p.state === "sleep") this.wakeUp("You were attacked!");
    if (p.state === "fish") this.endFishing(false, true);
    p.hp -= dmg;
    p.invuln = 0.45;
    const dx = p.x - fromX;
    const dz = p.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    p.kx += (dx / d) * 6;
    p.kz += (dz / d) * 6;
    this.attackedT = 6;
    this.shake = Math.max(this.shake, 0.3);
    this.sfx.hurt();
    this.events.hurt();
    this.popups.show(`-${dmg}`, p.x, p.y + 2, p.z, "#f87171", 0.9);
    if (p.hp <= 0) this.die("Overwhelmed by the night");
  }

  private hurtStructure(s: Structure, dmg: number, c: Creature) {
    if (!this.structures.list.includes(s)) return;
    s.hp -= dmg;
    s.shake = 0.3;
    s.bar.set(s.hp / s.maxHp);
    if (Math.hypot(s.x - this.p.x, s.z - this.p.z) < 30) this.sfx.wallHit();
    this.dust.burst(8, s.x, s.root.position.y + 0.8, s.z, { speed: 3, up: 2.5, life: 0.6, size: 0.15, color: "#b7834f", gravity: 8, jitter: 0.4 });
    if (c.def.stomps && (s.kind === "campfire" || s.kind === "signal")) {
      if (s.kind === "campfire") s.fuel = Math.max(0, s.fuel - 60);
      if (s.kind === "signal" && s.hp < s.maxHp * 0.5) s.lit = false;
      this.smoke.burst(10, s.x, s.root.position.y + 0.4, s.z, { speed: 1.5, up: 1.5, life: 1.2, size: 0.5, endSize: 1.2, color: "#6b6460", alpha: 0.4, drag: 1 });
      if (s.kind === "campfire" && s.fuel <= 0) {
        s.lit = false;
        this.toast("A brute stamped out your campfire!", "warn");
      }
    }
    if (s.hp <= 0) {
      this.sfx.wallBreak();
      this.dust.burst(26, s.x, s.root.position.y + 0.8, s.z, { speed: 5, up: 4, life: 0.9, size: 0.22, color: "#9c6b3d", gravity: 9, jitter: 0.8 });
      if (s.kind === "raft") this.raft = null;
      this.structures.remove(s);
      this.toast(`Your ${BUILDS[s.kind].name.toLowerCase()} was destroyed`, "warn");
    }
  }

  private die(reason: string) {
    const p = this.p;
    p.state = "dead";
    p.deadT = 0;
    p.act = null;
    p.swing = null;
    this.cancelPlacing();
    this.fishing = null;
    p.anim.play("die", { once: true, fade: 0.1 });
    this.sfx.die();
    this.stats.deaths++;
    // Half of the carried resources stay where you fell.
    const items: Partial<Record<ItemId, number>> = {};
    const lost: string[] = [];
    for (const r of RESOURCES) {
      const n = this.count(r);
      const drop = Math.floor(n / 2);
      if (drop <= 0) continue;
      items[r] = drop;
      this.inv[r] = n - drop;
      lost.push(`${drop} ${ITEMS[r].name.toLowerCase()}`);
    }
    if (lost.length) {
      this.satchel = { x: p.x, z: p.z, items };
      this.updateSatchel();
    }
    const day = Math.floor(this.clock / DAY) + 1;
    const hasHome = !!this.home && this.structures.list.some((s) => (s.kind === "bedroll" || s.kind === "tent") && Math.hypot(s.x - this.home!.x, s.z - this.home!.z) < 0.5);
    void reason;
    setTimeout(() => {
      if (this.disposed || this.p.state !== "dead") return;
      this.setPhase("dead");
      music.duck(true);
      this.events.died({ day, lost: lost.join(", "), home: hasHome });
      this.save();
    }, 1600);
  }

  private updateSatchel() {
    const m = this.satchelMesh;
    if (!m) return;
    if (!this.satchel) {
      m.visible = false;
      return;
    }
    m.visible = true;
    m.position.set(this.satchel.x, this.island.height(this.satchel.x, this.satchel.z), this.satchel.z);
  }

  // --- Survival -------------------------------------------------------------------------------------

  private updateSurvival(dt: number, t: number) {
    const p = this.p;
    if (p.state === "dead" || this.escapeT >= 0) return;
    const running = Math.hypot(p.vx, p.vz) > WALK + 0.5;
    const sleeping = p.state === "sleep";
    p.hunger = Math.max(0, p.hunger - (SURVIVAL.hungerDrain * (sleeping ? 0.6 : 1) + (running ? SURVIVAL.sprintHunger : 0)) * dt);
    // Warmth: nights are cold away from fire.
    const night = t >= NIGHT - 0.03 && t < DAWN + 0.01;
    let warm = false;
    for (const s of this.structures.list) {
      if (s.light <= 0) continue;
      if (Math.hypot(s.x - p.x, s.z - p.z) < s.light * 0.75) {
        warm = true;
        break;
      }
    }
    const tent = sleeping && this.sleepingIn?.kind === "tent";
    if (warm) p.warmth = Math.min(100, p.warmth + SURVIVAL.warmUp * dt);
    else if (!night) p.warmth = Math.min(100, p.warmth + 2 * dt);
    else if (tent) p.warmth = Math.max(0, p.warmth - 0.2 * dt);
    else if (this.carriedLight > 0) p.warmth = Math.max(0, p.warmth - SURVIVAL.torchColdDrain * dt);
    else p.warmth = Math.max(0, p.warmth - SURVIVAL.coldDrain * dt * (sleeping ? 0.5 : 1));
    if (p.hunger <= 0) p.hp -= SURVIVAL.starveDamage * dt;
    if (p.warmth <= 0) p.hp -= SURVIVAL.freezeDamage * dt;
    if (p.hunger > 45 && p.warmth > 25 && p.hp < 100) p.hp = Math.min(100, p.hp + (sleeping ? (tent ? SURVIVAL.tentRegen : SURVIVAL.sleepRegen) * 0.35 : SURVIVAL.regen) * dt);
    if (p.hp <= 0) {
      if (sleeping) this.wakeUp("");
      this.die(p.hunger <= 0 ? "Starved" : "Froze");
    }
  }

  // --- Sleep ----------------------------------------------------------------------------------------

  private sleepingIn: Structure | null = null;

  private sleepAt(s: Structure) {
    const p = this.p;
    p.state = "sleep";
    this.sleepingIn = s;
    p.x = s.x;
    p.z = s.z;
    p.yaw = s.rot;
    p.anim.play("idle", { fade: 0.2 });
    p.root.rotation.set(0, 0, 0);
    // Lie down on the bedroll / in the tent.
    p.model.rotation.set(-Math.PI / 2, 0, 0);
    p.model.position.set(0, 0.35, -0.7);
    this.sfx.sleep();
    this.events.banner("Sleeping…", "Time flies — you'll wake if anything comes close");
  }

  private wakeUp(reason: string) {
    const p = this.p;
    if (p.state !== "sleep") return;
    p.state = "free";
    p.model.rotation.set(0, 0, 0);
    p.model.position.set(0, 0, 0);
    if (this.sleepingIn) {
      p.x = this.sleepingIn.x + Math.cos(this.sleepingIn.rot) * 1.3;
      p.z = this.sleepingIn.z - Math.sin(this.sleepingIn.rot) * 1.3;
    }
    this.sleepingIn = null;
    if (reason) {
      this.sfx.wake();
      this.events.banner("You wake with a start", reason);
    }
  }

  private checkSleep() {
    const p = this.p;
    if (p.state !== "sleep") return;
    const t = (this.clock % DAY) / DAY;
    if (t >= 0.04 && t < DUSK - 0.05) {
      this.wakeUp("");
      this.events.banner("Good morning", "You feel rested");
      return;
    }
    for (const c of this.creatures) {
      if (c.active && c.state !== "dying" && Math.hypot(c.x - p.x, c.z - p.z) < 11) {
        this.wakeUp("Something is coming!");
        return;
      }
    }
  }

  // --- Fishing --------------------------------------------------------------------------------------

  private startFishing(n: Node) {
    const p = this.p;
    p.state = "fish";
    this.selected = 2;
    this.preferHammer = false;
    this.updateHeld();
    const w = 0.2 - Math.min(0.06, this.stats.caught * 0.01);
    const a = rand(0.2, 0.8 - w);
    this.fishing = { node: n, t: 0, needle: 0, dir: 1, speed: rand(0.9, 1.25), a, b: a + w, tries: 0 };
    p.anim.play("holding-right", { fade: 0.15 });
    this.sfx.splash(false);
  }

  private updateFishing(dt: number) {
    const f = this.fishing;
    if (!f) {
      this.p.state = "free";
      return;
    }
    f.t += dt;
    f.needle += f.dir * f.speed * dt;
    if (f.needle > 1) {
      f.needle = 1;
      f.dir = -1;
    } else if (f.needle < 0) {
      f.needle = 0;
      f.dir = 1;
    }
    this.sfx.reel();
    if (Math.random() < dt * 6) {
      const n = f.node;
      const ang = Math.random() * Math.PI * 2;
      this.dust.emit({ x: n.x + Math.cos(ang) * 0.8, y: this.island.waterLevel(n.x, n.z) + 0.05, z: n.z + Math.sin(ang) * 0.8, vy: 0.6, life: 0.6, size: 0.12, color: "#e0f2fe", alpha: 0.8 });
    }
    if (this.actionBuf > 0 && f.t > 0.15) {
      this.actionBuf = 0;
      const ok = f.needle >= f.a && f.needle <= f.b;
      this.endFishing(ok, false);
      return;
    }
    if (f.t > 7) this.endFishing(false, true);
  }

  private endFishing(caught: boolean, quiet: boolean) {
    const f = this.fishing;
    const p = this.p;
    this.fishing = null;
    p.state = "free";
    p.anim.play("attack-melee-right", { once: true, speed: 1.2, fade: 0.05 });
    if (!f) return;
    const n = f.node;
    const y = this.island.waterLevel(n.x, n.z);
    this.splash(n.x, n.z, caught ? 1.2 : 0.8);
    if (caught && this.world.take(n)) {
      const big = Math.random() < 0.25;
      this.give(big ? "bigFish" : "fish", 1, n.x, y + 0.3, n.z);
      this.stats.fish++;
      this.stats.caught++;
      this.sfx.catchFish();
      if (this.stats.caught >= 5) this.achieve("angler");
    } else if (!quiet) {
      this.sfx.missFish();
      this.toast("The fish got away", "info");
    } else this.sfx.missFish();
  }

  // --- Cooking --------------------------------------------------------------------------------------

  private showRack(s: Structure, on: boolean) {
    if (on && !s.rack) {
      const b = this.baked.get(BUILD.rack);
      const fishB = this.baked.get(ITEM.fish);
      if (!b) return;
      const g = new THREE.Group();
      const rack = new THREE.Mesh(b.geometry, b.material);
      rack.castShadow = true;
      g.add(rack);
      if (fishB) {
        for (let i = 0; i < 3; i++) {
          const fish = new THREE.Mesh(fishB.geometry, fishB.material);
          fish.position.set(-0.35 + i * 0.35, 0.55, 0);
          fish.rotation.set(0, Math.PI / 2, Math.PI / 2);
          fish.scale.setScalar(0.8);
          g.add(fish);
        }
      }
      g.position.copy(s.root.position);
      g.rotation.y = s.rot + Math.PI / 2;
      this.structures.group.add(g);
      s.rack = g;
    } else if (!on && s.rack) {
      s.rack.removeFromParent();
      s.rack = null;
    }
  }

  private updateCooking() {
    for (const s of this.structures.list) {
      if (!s.cooking) continue;
      if (!s.cooking.done && Math.random() < 0.1) this.smoke.emit({ x: s.x, y: s.root.position.y + 0.9, z: s.z, vx: 0.1, vy: 0.7, vz: 0, life: 1.4, size: 0.3, endSize: 0.7, color: "#d6d3d1", alpha: 0.35, drag: 0.5 });
      if (s.cooking.done && !s.cooking.items.length) s.cooking = null;
      else if (s.cooking.done && Math.hypot(s.x - this.p.x, s.z - this.p.z) < 6 && this.p.state !== "sleep" && this.p.state !== "dead") this.collectCooking(s);
    }
  }

  private collectCooking(s: Structure) {
    if (!s.cooking) return;
    const counts = new Map<FoodId, number>();
    for (const f of s.cooking.items) {
      const cooked = FOOD[f].cooked ?? f;
      counts.set(cooked, (counts.get(cooked) ?? 0) + 1);
    }
    for (const [f, n] of counts) this.give(f, n, s.x, s.root.position.y + 0.8, s.z);
    this.stats.cooked += s.cooking.items.length;
    if (this.stats.cooked >= 5) this.achieve("chef");
    s.cooking = null;
    this.showRack(s, false);
    this.sfx.cookDone();
  }

  // --- Placement ------------------------------------------------------------------------------------

  private ghostMat = new THREE.MeshLambertMaterial({ color: "#4ade80", transparent: true, opacity: 0.55, depthWrite: false, emissive: new THREE.Color("#14532d") });

  private startPlacing(id: BuildId) {
    this.cancelPlacing();
    const recipe = RECIPES.find((r) => r.build === id);
    if (!recipe) return;
    const ghost = buildModel(id, this.baked);
    ghost.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = this.ghostMat;
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 4;
    });
    this.scene.add(ghost);
    const p = this.p;
    const rot = this.lastRot[id] ?? Math.round((p.yaw + Math.PI / 2) / (Math.PI / 4)) * (Math.PI / 4);
    this.placing = { id, recipe: recipe.id, rot, ghost, x: p.x, z: p.z, valid: false, reason: "" };
    this.lastBuild = id;
    this.selected = 5;
    this.updateHeld();
    this.updatePlacing();
    this.emitHud(true);
  }

  private lastRot: Partial<Record<BuildId, number>> = {};

  private updatePlacing() {
    const pl = this.placing;
    if (!pl) return;
    const p = this.p;
    const def = BUILDS[pl.id];
    // Where: under the mouse (if it's near) or just in front.
    let tx = p.x + Math.sin(p.yaw) * (2.2 + def.radius);
    let tz = p.z + Math.cos(p.yaw) * (2.2 + def.radius);
    if (this.mouseActive && !this.coarse) {
      this.ray.setFromCamera(this.mouse, this.camera);
      const hit = this.raycastGround(this.ray.ray);
      if (hit && Math.hypot(hit.x - p.x, hit.z - p.z) < 11) {
        tx = hit.x;
        tz = hit.z;
      }
    }
    const snap = 0.5;
    tx = Math.round(tx / snap) * snap;
    tz = Math.round(tz / snap) * snap;
    pl.x = tx;
    pl.z = tz;
    const y = pl.id === "raft" ? Math.max(0.05, this.island.height(tx, tz)) : this.island.height(tx, tz);
    pl.ghost.position.set(tx, y, tz);
    pl.ghost.rotation.y = pl.rot;
    this.lastRot[pl.id] = pl.rot;
    // Validity.
    let reason = "";
    const h = this.island.height(tx, tz);
    const r = def.radius;
    if (Math.hypot(tx - p.x, tz - p.z) > 12) reason = "Too far away";
    else if (def.shore) {
      if (h > 0.45 || h < -0.7) reason = "Build the raft at the water's edge";
    } else if (h < 0.15 || this.island.inPond(tx, tz, 0.5)) reason = "Can't build in water";
    else if (this.island.slope(tx, tz) > 0.65 && !def.wall) reason = "Too steep here";
    if (!reason) {
      for (const n of this.world.near(tx, tz, r + 3, this.nearTmp)) {
        const nr = n.alive ? (n.r > 0 ? n.r : n.kind === "fish" || n.kind === "boulder" ? 0 : 0.35) : n.kind === "tree" ? 0.35 : 0;
        if (nr <= 0) continue;
        if (Math.hypot(n.x - tx, n.z - tz) < nr + (def.wall ? 0.3 : r * 0.8)) {
          reason = "Something is in the way";
          break;
        }
      }
    }
    if (!reason) {
      for (const s of this.world.statics) if (Math.hypot(s.x - tx, s.z - tz) < s.r + r * 0.8) reason = "Something is in the way";
    }
    if (!reason) {
      const probe: Blocker = { x: tx, z: tz, r: def.wall ? 0.2 : r * 0.75, wall: !!def.wall, rot: pl.rot, half: def.wall ? 0.85 : 0, solid: true, hp: 1, light: 0, kind: pl.id };
      for (const s of this.structures.near(tx, tz, r + 3, this.blockTmp)) {
        if (overlaps(probe, s)) {
          reason = "Overlaps another building";
          break;
        }
      }
    }
    if (!reason && def.solid && !def.walkable) {
      const probe: Blocker = { x: tx, z: tz, r: def.wall ? 0.2 : r * 0.75, wall: !!def.wall, rot: pl.rot, half: def.wall ? 0.85 : 0, solid: true, hp: 1, light: 0, kind: pl.id };
      if (pushOut(p.x, p.z, PLAYER_R, probe)) reason = "You're standing there";
    }
    const recipe = RECIPE[pl.recipe];
    if (!reason && !this.affordable(recipe.cost)) reason = `Not enough materials (${costText(recipe.cost)})`;
    if (!reason && recipe.bench && !this.benchNear() && !this.structures.list.some((s) => s.kind === "workbench" && Math.hypot(s.x - tx, s.z - tz) < 9)) reason = "Build this near your workbench";
    pl.valid = !reason;
    pl.reason = reason;
    this.ghostMat.color.set(pl.valid ? "#4ade80" : "#f87171");
    this.ghostMat.emissive.set(pl.valid ? "#14532d" : "#7f1d1d");
    this.placeRing.color(pl.valid ? "#4ade80" : "#f87171");
    this.placeRing.set(tx, y, tz, def.wall ? 1.05 : r + 0.15, 0.8, 0.15);
  }

  private raycastGround(ray: THREE.Ray) {
    // March along the ray until it dips under the terrain.
    const o = ray.origin;
    const d = ray.direction;
    let prev = 0;
    for (let t = 0.5; t < 80; t += 0.5) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      const h = Math.max(this.island.height(x, z), 0);
      if (y < h) {
        // Refine between prev and t.
        let a = prev;
        let b = t;
        for (let i = 0; i < 6; i++) {
          const m = (a + b) / 2;
          const yy = o.y + d.y * m;
          const hh = Math.max(this.island.height(o.x + d.x * m, o.z + d.z * m), 0);
          if (yy < hh) b = m;
          else a = m;
        }
        return { x: o.x + d.x * b, z: o.z + d.z * b };
      }
      prev = t;
    }
    return null;
  }

  private confirmPlacing() {
    const pl = this.placing;
    if (!pl) return;
    this.updatePlacing();
    if (!pl.valid) {
      this.sfx.denied();
      this.toast(pl.reason, "warn");
      return;
    }
    const recipe = RECIPE[pl.recipe];
    this.pay(recipe.cost);
    const s = this.structures.add(pl.id, pl.x, pl.z, pl.rot);
    this.crafted.add(pl.recipe);
    this.stats.built++;
    this.sfx.place();
    this.dust.burst(16, pl.x, s.root.position.y + 0.2, pl.z, { speed: 3, up: 1.5, life: 0.7, size: 0.35, endSize: 0.8, color: "#d6c3a0", alpha: 0.6, drag: 3, jitter: 0.5 });
    this.p.anim.play("interact-right", { once: true, speed: 1.2 });
    if (pl.id === "campfire") {
      this.achieve("firestarter");
      this.sfx.fireLight();
    }
    if (pl.id === "bedroll" || pl.id === "tent") this.home = { x: s.x, z: s.z };
    if (pl.id === "raft") this.raft = s;
    if (this.structures.count(["fence", "gate", "wall"]) >= 10) this.achieve("fortress");
    this.checkUnlocks();
    // Keep placing walls while affordable; one-off buildings end here.
    const again = BUILDS[pl.id].wall || pl.id === "torchPost";
    if (!again || !this.affordable(recipe.cost)) this.cancelPlacing();
    this.emitHud(true);
  }

  // --- Pickups & effects ----------------------------------------------------------------------------

  private updatePickups(dt: number) {
    const p = this.p;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      const u = Math.min(1, k.t / k.dur);
      const e = u * u * (3 - 2 * u);
      const tx = p.x;
      const ty = p.y + 1.0;
      const tz = p.z;
      k.mesh.position.set(k.sx + (tx - k.sx) * e, k.sy + (ty - k.sy) * e + Math.sin(u * Math.PI) * 1.4, k.sz + (tz - k.sz) * e);
      k.mesh.rotation.y += k.spin * dt;
      k.mesh.rotation.x += k.spin * 0.5 * dt;
      k.mesh.scale.setScalar(1 - Math.max(0, u - 0.8) * 3);
      if (u >= 1) {
        k.mesh.removeFromParent();
        this.pickups.splice(i, 1);
        this.addItem(k.item, k.count);
        this.sfx.pickup();
      }
    }
  }

  private splash(x: number, z: number, size: number) {
    const y = this.island.waterLevel(x, z);
    this.dust.burst(Math.round(10 * size), x, y + 0.1, z, { speed: 2.2 * size, up: 4 * size, life: 0.7, size: 0.16 * size + 0.06, color: "#e0f2fe", gravity: 10, drag: 1, alpha: 0.85, jitter: 0.3 });
  }

  // --- Escape ---------------------------------------------------------------------------------------

  private escapeFrom = new THREE.Vector3();
  private escapeTo = new THREE.Vector3();

  private beginEscape(raft: Structure) {
    if (!this.ship) return;
    const p = this.p;
    p.state = "board";
    this.cancelPlacing();
    this.escapeT = 0;
    this.raft = raft;
    this.escapeFrom.copy(raft.root.position);
    const sp = this.ship.position;
    const dir = new THREE.Vector3(sp.x - raft.x, 0, sp.z - raft.z).normalize();
    this.escapeTo.set(sp.x - dir.x * 7, 0, sp.z - dir.z * 7);
    raft.solid = false;
    p.anim.play("emote-yes", { fade: 0.2 });
    this.sfx.horn();
    this.events.banner("Set sail!", "Rowing out to the ship…");
    for (const c of this.creatures) if (c.active) c.despawn();
  }

  private updateEscape(dt: number) {
    const raft = this.raft;
    const p = this.p;
    if (!raft) return;
    this.escapeT += dt;
    const u = Math.min(1, this.escapeT / 9);
    const e = u * u * (3 - 2 * u);
    const x = this.escapeFrom.x + (this.escapeTo.x - this.escapeFrom.x) * e;
    const z = this.escapeFrom.z + (this.escapeTo.z - this.escapeFrom.z) * e;
    const y = Math.max(this.island.height(x, z), seaHeight(x, z, this.elapsed) + 0.05);
    raft.root.position.set(x, y, z);
    raft.root.rotation.y = Math.atan2(this.escapeTo.x - this.escapeFrom.x, this.escapeTo.z - this.escapeFrom.z) + Math.sin(this.elapsed * 1.3) * 0.05;
    raft.root.rotation.z = Math.sin(this.elapsed * 1.7) * 0.05;
    p.x = x;
    p.z = z;
    p.root.position.set(x, y + 0.35, z);
    p.yaw = raft.root.rotation.y;
    if (Math.random() < dt * 8) this.splash(x + rand(-1.5, 1.5), z + rand(-1.5, 1.5), 0.5);
    if (this.escapeT > 4 && this.escapeT - dt <= 4) this.sfx.fanfare();
    if (this.escapeT >= 9.5 && this.phase === "playing") {
      const summary: RunSummary = { day: Math.floor(this.clock / DAY) + 1, days: (this.clock - START_CLOCK) / DAY, kills: this.stats.kills, crafted: this.stats.crafted, built: this.stats.built, fish: this.stats.fish, deaths: this.stats.deaths };
      this.achieve("rescued");
      if (summary.day < 6) this.achieve("swift");
      CastawayGame.clearSave();
      this.setPhase("won");
      this.events.won(summary);
      this.events.saved(null);
    }
  }

  private updateShip(dt: number) {
    const ship = this.ship;
    if (!ship || !ship.visible) return;
    ship.position.y = -0.35 + Math.sin(this.elapsed * 0.8) * 0.12;
    ship.rotation.z = Math.sin(this.elapsed * 0.6) * 0.03;
    void dt;
  }

  // --- Menu & idle ---------------------------------------------------------------------------------

  private updateMenu(dt: number) {
    this.menuT += dt;
    this.p.anim.update(dt);
    this.p.root.position.set(this.p.x, this.island.height(this.p.x, this.p.z), this.p.z);
    this.p.root.rotation.y = this.p.yaw;
    this.world.update(dt, this.clock);
    this.structures.update(dt, { fire: this.fire, smoke: this.smoke });
    this.handLight.intensity = 0;
    this.sfx.ambience(dt, this.elapsed, { sea: 0.5, night: 0.2, fire: 0.6 });
  }

  private updateIdle(dt: number) {
    this.p.anim.update(dt);
    this.world.update(dt, this.clock);
    this.structures.update(dt, { fire: this.fire, smoke: this.smoke });
    for (const c of this.creatures) if (c.active) c.update(dt, this.creatureCtx);
    if (this.escapeT >= 0) this.updateEscape(dt);
  }

  // --- Environment & camera ------------------------------------------------------------------------

  private updateEnvironment(dt: number) {
    const t = (this.clock % DAY) / DAY;
    const sky = skyAt(t, this.sky);
    this.skyDome.update(sky, this.elapsed);
    this.skyDome.mesh.position.copy(this.camera.position);
    this.hemi.color.copy(sky.hemiSky);
    this.hemi.groundColor.copy(sky.hemiGround);
    this.hemi.intensity = sky.hemiIntensity;
    this.sun.color.copy(sky.light);
    this.sun.intensity = sky.lightIntensity;
    this.fog.color.copy(sky.horizon);
    this.fog.near = sky.fogNear;
    this.fog.far = sky.fogFar;
    // The shadow box follows the castaway, snapped to texels so shadows don't shimmer.
    const focus = this.phase === "menu" ? this.camLook : this.p.root.position;
    const texel = 52 / this.sun.shadow.mapSize.x;
    const cx = Math.round(focus.x / texel) * texel;
    const cz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + sky.lightDir.x * 70, sky.lightDir.y * 70, cz + sky.lightDir.z * 70);
    this.sea.setSky(sky);
    this.pond.setSky(sky, true);
    this.sea.update(this.elapsed, this.camera.position);
    this.pond.update(this.elapsed);
    // Fire lights: the four burning things nearest the camera's focus.
    const fires = this.structures ? this.structures.list.filter((s) => s.light > 0 && s.flame) : [];
    fires.sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z));
    const boost = 0.45 + sky.darkness * 0.75;
    for (let i = 0; i < this.fireLights.length; i++) {
      const l = this.fireLights[i];
      const s = fires[i];
      if (!s || !s.flame) {
        l.intensity = 0;
        continue;
      }
      const flick = 0.85 + Math.sin(this.elapsed * 17 + i * 3) * 0.07 + Math.sin(this.elapsed * 31 + i) * 0.05 + Math.random() * 0.05;
      const big = s.kind === "signal" ? 2.2 : s.kind === "torchPost" ? 0.55 : 1;
      l.position.set(s.flame.x, s.flame.y + 0.6 * big, s.flame.z);
      l.intensity = 34 * big * flick * boost * Math.min(1, s.light / 5);
      l.distance = s.light * 2.3;
    }
    void dt;
  }

  private updateCamera(dt: number) {
    const p = this.p;
    if (this.phase === "menu" || !p) {
      const a = this.menuT * 0.06 + 0.4;
      const look = this.tmpV.set(CAMP.x, this.island.height(CAMP.x, CAMP.z) + 0.8, CAMP.z);
      const pos = new THREE.Vector3(CAMP.x + Math.sin(a) * 10.5, look.y + 4.2, CAMP.z + Math.cos(a) * 10.5);
      this.camera.position.copy(pos);
      this.camLook.copy(look);
      this.camera.lookAt(look);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.keys.has("ArrowLeft")) this.camYaw += 1.9 * dt;
    if (this.keys.has("ArrowRight")) this.camYaw -= 1.9 * dt;
    if (this.keys.has("ArrowUp")) this.camDist = Math.max(5.5, this.camDist - 8 * dt);
    if (this.keys.has("ArrowDown")) this.camDist = Math.min(18, this.camDist + 8 * dt);
    const target = this.tmpV.set(p.root.position.x, p.root.position.y + 1.25, p.root.position.z);
    let dist = this.camDist;
    let pitch = this.camPitch;
    if (this.escapeT >= 0) {
      dist = 13 + this.escapeT * 1.2;
      pitch = 0.42;
      this.camYaw += dt * 0.25;
    }
    if (p.state === "sleep") pitch = Math.max(pitch, 0.8);
    const cp = Math.cos(pitch);
    const want = new THREE.Vector3(target.x + Math.sin(this.camYaw) * cp * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(this.camYaw) * cp * dist);
    // Don't end up inside the wreck's hull.
    for (let i = 1; i <= 10; i++) {
      const u = i / 10;
      const x = target.x + (want.x - target.x) * u;
      const z = target.z + (want.z - target.z) * u;
      const y = target.y + (want.y - target.y) * u;
      if (y > 9) break;
      if (this.world.statics.some((st) => (st.x - x) ** 2 + (st.z - z) ** 2 < (st.r + 0.8) ** 2)) {
        const k = Math.max(0.25, u - 0.12);
        want.set(target.x + (want.x - target.x) * k, target.y + (want.y - target.y) * k, target.z + (want.z - target.z) * k);
        break;
      }
    }
    // Keep the camera above the ground along its line of sight.
    for (let i = 1; i <= 4; i++) {
      const u = i / 4;
      const x = target.x + (want.x - target.x) * u;
      const z = target.z + (want.z - target.z) * u;
      const ground = Math.max(this.island.height(x, z), 0) + 0.7;
      const y = target.y + (want.y - target.y) * u;
      if (y < ground) want.y += (ground - y) / u;
    }
    if (!this.camInit || dt === 0) {
      if (!this.camInit) {
        this.camPos.copy(want);
        this.camLook.copy(target);
        this.camInit = true;
      }
    } else {
      const k = 1 - Math.exp(-10 * dt);
      this.camPos.lerp(want, k);
      this.camLook.lerp(target, 1 - Math.exp(-14 * dt));
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camLook);
    this.world?.updateOcclusion(this.camera.position.x, this.camera.position.z, p.root.position.x, p.root.position.z, dt);
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
    if (avg > 1 / 48 && r.cur > r.min) {
      next = Math.max(r.min, r.cur * 0.85);
      r.good = 0;
    } else if (avg < 1 / 57 && r.cur < r.max) {
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

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    const ph = this.renderer.domElement.height;
    this.fire.setScale(ph, this.camera.fov);
    this.dust.setScale(ph, this.camera.fov);
    this.smoke.setScale(ph, this.camera.fov);
  }

  // --- HUD, objectives -----------------------------------------------------------------------------

  private periodicChecks(day: number) {
    this.checkSleep();
    const next = this.computeObjective();
    if (next !== this.objective) {
      if (next > this.objective) {
        this.toast(`Done: ${OBJECTIVES[this.objective]}`, "objective");
        this.sfx.recipe();
      }
      this.objective = next;
    }
    this.focusRing.tick(this.elapsed);
    void day;
  }

  private computeObjective() {
    const wreckOpened = this.world.nodes.filter((n) => n.kind === "crate" && !n.floating && !n.alive).length;
    const day = Math.floor(this.clock / DAY) + 1;
    const walls = this.structures.count(["fence", "gate", "wall"]);
    const done = [
      wreckOpened >= 3,
      this.seen.has("wood") && this.seen.has("stone") && this.seen.has("fiber"),
      this.crafted.has("axe"),
      this.stats.felled > 0,
      this.crafted.has("campfire") || this.structures.count(["campfire"]) > 0,
      day >= 2,
      this.stats.caught > 0,
      this.crafted.has("workbench"),
      walls >= 4,
      this.crafted.has("signal"),
      this.crafted.has("raft"),
      this.shipUntil > this.clock,
      false,
    ];
    const i = done.findIndex((d) => !d);
    return i < 0 ? OBJECTIVES.length - 1 : i;
  }

  private period(t: number) {
    if (t < 0.05 || t >= DAWN) return "Dawn";
    if (t < 0.28) return "Morning";
    if (t < 0.48) return "Midday";
    if (t < DUSK) return "Afternoon";
    if (t < NIGHT) return "Dusk";
    return "Night";
  }

  private emitHud(force = false) {
    const p = this.p;
    if (!p || !this.world) return;
    const t = (this.clock % DAY) / DAY;
    const res = Object.fromEntries(RESOURCES.map((r) => [r, this.count(r)])) as Record<ResourceId, number>;
    const have = Object.fromEntries(RESOURCES.map((r) => [r, this.available(r)])) as Record<ResourceId, number>;
    const foods = this.foodsOwned().map((f) => [f, this.count(f)] as [FoodId, number]);
    if (this.food && !foods.some(([f]) => f === this.food)) this.food = foods[0]?.[0] ?? null;
    const slot = (i: number): SlotView => {
      if (i === 4) return { icon: this.food, label: this.food ? ITEMS[this.food].name : "Food", count: this.food ? this.count(this.food) : undefined };
      if (i === 5) return { icon: this.lastBuild, label: this.lastBuild ? BUILDS[this.lastBuild].name : "Build" };
      const tool = this.slotItem(i);
      return { icon: tool, label: tool ? ITEMS[tool].name : ["Axe", "Pickaxe", "Weapon", "Light"][i] };
    };
    const f = this.fishing;
    let cooking: number | null = null;
    for (const s of this.structures.list) if (s.cooking && !s.cooking.done && Math.hypot(s.x - p.x, s.z - p.z) < 8) cooking = Math.min(1, s.cooking.t / 6);
    const pl = this.placing;
    const hud: Hud = {
      day: Math.floor(this.clock / DAY) + 1,
      t: Math.round(t * 200) / 200,
      period: this.period(t),
      night: t >= NIGHT && t < DAWN,
      health: Math.max(0, Math.ceil(p.hp)),
      hunger: Math.ceil(p.hunger),
      warmth: Math.ceil(p.warmth),
      res,
      foods,
      food: this.food,
      slots: [0, 1, 2, 3, 4, 5].map(slot),
      selected: this.placing ? 5 : this.selected,
      prompt: this.focus.prompt && this.focus.prompt.text ? this.focus.prompt : null,
      fishing: f ? { needle: Math.round(f.needle * 100) / 100, a: f.a, b: f.b } : null,
      cooking: cooking === null ? null : Math.round(cooking * 20) / 20,
      placing: pl ? { name: BUILDS[pl.id].name, valid: pl.valid, reason: pl.reason } : null,
      objective: OBJECTIVES[this.objective],
      objectiveNo: this.objective,
      sleeping: p.state === "sleep",
      ship: this.shipUntil > this.clock,
      danger: this.creatures.filter((c) => c.active && c.state !== "dying").length,
      craft: { unlocked: this.unlockedList(), crafted: [...this.crafted], bench: this.benchNear(), chest: this.chestsNear().length > 0, have },
      cold: p.warmth < 25,
      starving: p.hunger < 15,
      home: !!this.home,
    };
    const key = JSON.stringify(hud);
    if (!force && key === this.hudCache) return;
    this.hudCache = key;
    this.events.hud(hud);
  }

  // --- Debug (development only) ---------------------------------------------------------------------

  /** Test hooks for automated play-throughs. */
  debug = {
    state: () => ({
      phase: this.phase,
      clock: this.clock,
      day: Math.floor(this.clock / DAY) + 1,
      t: (this.clock % DAY) / DAY,
      p: { x: this.p.x, z: this.p.z, y: this.p.y, hp: this.p.hp, hunger: this.p.hunger, warmth: this.p.warmth, state: this.p.state },
      inv: this.inv,
      creatures: this.creatures.filter((c) => c.active).map((c) => ({ kind: c.kind, x: c.x, z: c.z, hp: c.hp, state: c.state })),
      structures: this.structures.list.map((s) => ({ kind: s.kind, x: s.x, z: s.z, hp: s.hp, lit: s.lit, fuel: s.fuel, light: s.light })),
      objective: this.objective,
      focus: this.focus.prompt?.text ?? null,
      ship: this.shipUntil > this.clock,
      res: this.res.cur,
    }),
    give: (items: Partial<Record<ItemId, number>>) => {
      for (const [k, v] of Object.entries(items) as [ItemId, number][]) this.addItem(k, v, true);
      this.emitHud(true);
    },
    setTime: (t: number) => {
      const day = Math.floor(this.clock / DAY);
      this.clock = day * DAY + t * DAY;
      this.lastT = t - 0.0005;
    },
    teleport: (x: number, z: number) => {
      this.p.x = x;
      this.p.z = z;
      this.camInit = false;
    },
    nodes: (kind: string) => this.world.nodes.filter((n) => n.kind === kind && n.alive).map((n) => ({ id: n.id, x: n.x, z: n.z, charges: n.charges })),
    spawn: (kind: CreatureKind, x: number, z: number) => {
      const c = this.creature(kind);
      if (c) {
        c.spawn(x, z, c.def.hp, this.creatureCtx);
        c.maxHp = c.def.hp;
      }
    },
    place: (id: BuildId, x: number, z: number, rot = 0) => {
      const s = this.structures.add(id, x, z, rot);
      this.crafted.add(id as RecipeId);
      if (id === "raft") this.raft = s;
      return s.id;
    },
    face: (x: number, z: number) => {
      this.p.yaw = yawTo(x - this.p.x, z - this.p.z);
    },
    cam: (yaw: number, pitch: number, dist: number) => {
      this.camYaw = yaw;
      this.camPitch = pitch;
      this.camDist = dist;
    },
    ship: () => this.showShip(this.clock + DAY * 0.5, true),
  };

  // --- Teardown -------------------------------------------------------------------------------------

  dispose() {
    if (this.phase === "playing" || this.phase === "paused" || this.phase === "book") this.save();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    music.stop();
    this.sfx.stopAmbience();
    for (const c of this.creatures) c.dispose();
    this.world?.dispose();
    this.structures?.dispose();
    for (const b of this.baked.values()) b.geometry.dispose();
    this.kits.dispose();
    for (const m of this.charMats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    if (this.models) for (const m of this.models.values()) disposeTree(m.scene);
    this.island.dispose();
    this.skyDome.dispose();
    this.sea.dispose();
    this.pond.dispose();
    this.fire.dispose();
    this.dust.dispose();
    this.smoke.dispose();
    this.popups.dispose();
    this.focusRing.dispose();
    this.placeRing.dispose();
    this.telegraphs.dispose();
    this.ghostMat.dispose();
    if (process.env.NODE_ENV !== "production") delete (window as unknown as { __castaway?: CastawayGame }).__castaway;
    // The canvas (and its GL context) can be reused by the next mount: leave it in default state.
    this.renderer.resetState();
    this.renderer.dispose();
  }
}

// --- Helpers ---------------------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

export function costText(cost: Partial<Record<ResourceId, number>>) {
  return Object.entries(cost)
    .map(([k, v]) => `${v} ${ITEMS[k as ResourceId].name.toLowerCase()}`)
    .join(", ");
}

/** Two blockers overlapping (circle/segment approximations). */
function overlaps(a: Blocker, b: Blocker) {
  const pts = (x: Blocker) => {
    if (!x.wall) return [{ x: x.x, z: x.z }];
    const ux = Math.cos(x.rot);
    const uz = -Math.sin(x.rot);
    return [-1, -0.5, 0, 0.5, 1].map((k) => ({ x: x.x + ux * x.half * k, z: x.z + uz * x.half * k }));
  };
  for (const pa of pts(a)) {
    const r = a.wall ? 0.15 : a.r;
    if (pushOut(pa.x, pa.z, r, b)) return true;
  }
  for (const pb of pts(b)) {
    const r = b.wall ? 0.15 : b.r;
    if (pushOut(pb.x, pb.z, r, a)) return true;
  }
  return false;
}
