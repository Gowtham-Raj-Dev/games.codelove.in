import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, type Fit, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { SEA_SHANTY } from "../shared/songs";
import { Sfx } from "./audio";
import { createWakeMaterial, Particles, Rings } from "./fx";
import { ARMS, ISLAND, LOOT, MODELS, PROPS, SHIPS, TOWN, TRADE_SHIPS } from "./manifest";
import { HAUNTED, MAX_SHOALS, Ocean, sea, Sky, SUNNY, waveHeight } from "./ocean";
import { ENEMY_STATS, PLAYER_STATS, pointOfSail, polar, Ship, type DeckSlot, type ShipClass, type ShipStats, type Side, type Wind } from "./ships";
import {
  BOUNDS,
  Career,
  compass,
  contractText,
  danger,
  GOOD_IDS,
  GOODS,
  HAUNTED_SEA,
  inHauntedSea,
  metres,
  PORT,
  PORTS,
  RANKS,
  SHIP_DEFS,
  SHIP_ORDER,
  TRADE_UPGRADE_ORDER,
  TRADE_UPGRADES,
  zoneName,
  type CareerSave,
  type Contract,
  type GoodId,
  type KnownPrices,
  type Notice,
  type PirateClass,
  type PortId,
  type ShipDef,
  type ShipId,
  type TradeUpgradeId,
} from "./trade";
import { ARENA, COVE, openSeaLayout, World, type FortSite, type PortSite } from "./world";
import { ONLINE_SHIPS, PLAYER_COLORS, type NetEvent } from "./online";

// --- Tuning ---------------------------------------------------------------------------------------

const G = 22;
const FORT_RANGE = 60;
const MAX_ACTIVE = 5;
const COMBAT_RANGE = 90;
const SUN_DIR = new THREE.Vector3(0.5, 0.58, 0.42).normalize();
const SHADOW_EXTENT = 70;
const SHIP_MODELS = [SHIPS.playerSmall, SHIPS.playerMedium, SHIPS.playerLarge];
const SHIP_NAMES = ["Sloop", "Brigantine", "Galleon"];
const GHOST_TINT = new THREE.Color("#0d4a33");
const TAU = Math.PI * 2;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dampAngle = (c: number, t: number, l: number, dt: number) => c + wrap(t - c) * (1 - Math.exp(-l * dt));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// --- Public types ---------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "upgrade" | "sinking" | "over" | "error" | "port" | "chart" | "wrecked";

/** "waves": the cove battle. "trade": the Open Sea trading career. "online": battles against other players. */
export type Mode = "waves" | "trade" | "online";

export type UpgradeId = "reload" | "guns" | "hull" | "sails" | "shot" | "range" | "ship" | "carpenter" | "plunder";

export interface Card {
  id: UpgradeId;
  title: string;
  text: string;
  level: number;
  max: number;
  rare: boolean;
}

export interface Offer {
  wave: number;
  cards: Card[];
  gold: number;
  repairCost: number;
  repairAmount: number;
  hull: number;
  maxHull: number;
}

export interface Banner {
  id: number;
  title: string;
  sub: string;
  tone: "info" | "good" | "boss" | "bad";
}

export interface Hud {
  hull: number;
  maxHull: number;
  gold: number;
  wave: number;
  enemies: number;
  sunk: number;
  sail: number;
  speed: number;
  /** Wind arrow rotation on screen (degrees, clockwise from up). */
  wind: number;
  windStrength: number;
  trim: string;
  trimEff: number;
  reloadL: number;
  reloadR: number;
  guns: number;
  ship: string;
  boss: { name: string; hp: number; max: number } | null;
  banner: Banner | null;
  warn: string | null;
  combat: boolean;
  mode: Mode;
  trade: TradeHud | null;
  online: OnlineHud | null;
}

export interface OnlineHud {
  /** Seconds left in the round (and to its start, while counting down). */
  left: number;
  countdown: number;
  goal: number;
  scores: { id: string; name: string; color: string; k: number; d: number; me: boolean }[];
  feed: { id: number; text: string }[];
  /** Seconds until you're back on the water after sinking. */
  respawn: number | null;
}

/** Another player in the battle, as the engine needs to show them. */
export interface OnlinePeer {
  id: string;
  name: string;
  ship: number;
  color: number;
}

/** Setting up a battle: who you are, the round's clock, and how to reach the other players. */
export interface OnlineSetup {
  me: string;
  name: string;
  ship: number;
  color: number;
  start: number;
  end: number;
  goal: number;
  seed: number;
  peers: OnlinePeer[];
  now: () => number;
  send: (state: number[]) => void;
  emit: (e: NetEvent) => void;
}

interface Snap {
  t: number;
  x: number;
  z: number;
  h: number;
  s: number;
  sl: number;
  hp: number;
  mx: number;
  al: boolean;
  k: number;
  d: number;
}

interface Remote {
  id: string;
  name: string;
  color: number;
  cls: number;
  ship: Ship;
  buf: Snap[];
  k: number;
  d: number;
  /** When they last sank (database clock): older "afloat" reports are ignored. */
  sunkAt: number;
}

/** One objective in the contract tracker. */
export interface TrackLine {
  id: string;
  text: string;
  /** Seconds left (null: no hurry shown). */
  left: number | null;
  dist: number | null;
  urgent: boolean;
}

export interface TradeHud {
  cargo: number;
  cap: number;
  zone: string;
  danger: number;
  /** Port you can dock at right now. */
  dock: string | null;
  /** Why you can't dock yet. */
  dockBlocked: string | null;
  track: TrackLine[];
  rank: string;
  waypoint: { label: string; dist: number } | null;
  steam: boolean;
  /** Auto-sail is steering towards the course. */
  auto: boolean;
}

export interface MarketRow {
  id: GoodId;
  name: string;
  icon: string;
  buy: number | null;
  sell: number;
  have: number;
  /** Average price paid for what you carry. */
  paid: number | null;
  wanted: boolean;
  local: boolean;
  maxBuy: number;
}

export interface OfferRow {
  c: Contract;
  title: string;
  line: string;
  detail: string;
  dist: number;
  blocked: string | null;
}

export interface ShipRow {
  def: ShipDef;
  owned: boolean;
  active: boolean;
  sold: boolean;
  blocked: string | null;
  cap: number;
  hull: number;
  guns: number;
}

export interface UpgradeRow {
  id: TradeUpgradeId;
  title: string;
  text: string;
  level: number;
  max: number;
  cost: number | null;
}

export interface PortView {
  id: PortId;
  name: string;
  blurb: string;
  produces: GoodId[];
  wants: GoodId[];
  yard: boolean;
  gold: number;
  cargo: number;
  cap: number;
  hull: number;
  maxHull: number;
  repairCost: number;
  ship: ShipDef;
  rank: ReturnType<Career["rankInfo"]>;
  market: MarketRow[];
  offers: OfferRow[];
  active: OfferRow[];
  maxContracts: number;
  refresh: number;
  ships: ShipRow[];
  upgrades: UpgradeRow[];
  goals: ReturnType<Career["goals"]>;
  stats: Career["stats"];
  notices: Notice[];
  maps: number;
  visited: number;
  fleet: number;
  /** The captain's guide is switched off. */
  guideOff: boolean;
  /** Exact totals for buying / selling `qty` here (prices creep as you trade). */
  quote: (g: GoodId, qty: number) => { buy: number | null; sell: number };
  /** Ports that want a good, nearest first, with the price last seen there. */
  wantedAt: (g: GoodId) => { name: string; dist: number; price: number | null }[];
}

export interface ChartPort {
  id: PortId;
  name: string;
  x: number;
  z: number;
  visited: boolean;
  produces: GoodId[];
  wants: GoodId[];
  prices: KnownPrices | null;
  yard: boolean;
  here: boolean;
}

export interface ChartView {
  bounds: number;
  islands: { x: number; z: number; r: number; treasure: boolean }[];
  ports: ChartPort[];
  player: { x: number; z: number; h: number };
  targets: { x: number; z: number; label: string; kind: "port" | "bounty" | "salvage" | "treasure" }[];
  waypoint: { x: number; z: number; label: string } | null;
  haunted: { x: number; z: number; r: number };
  time: number;
  live: boolean;
}

export interface WreckReport {
  lostGoods: number;
  lostValue: number;
  failed: number;
  fee: number;
  port: string;
}

export interface VoyageResult {
  wave: number;
  sunk: number;
  gold: number;
  forts: number;
  seconds: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  offer(offer: Offer | null): void;
  over(result: VoyageResult): void;
  error(message: string): void;
  /** Open Sea: the port screen's contents (null when you set sail). */
  port(view: PortView | null): void;
  /** Open Sea: save the career. */
  save(data: CareerSave): void;
  /** Open Sea: your ship sank. */
  wrecked(report: WreckReport): void;
}

export const EMPTY_HUD: Hud = {
  hull: 100,
  maxHull: 100,
  gold: 0,
  wave: 0,
  enemies: 0,
  sunk: 0,
  sail: 2,
  speed: 0,
  wind: 0,
  windStrength: 1,
  trim: "Beam reach",
  trimEff: 1,
  reloadL: 1,
  reloadR: 1,
  guns: 3,
  ship: "Sloop",
  boss: null,
  banner: null,
  warn: null,
  combat: false,
  mode: "waves",
  trade: null,
  online: null,
};

// --- Upgrades -------------------------------------------------------------------------------------

const UPGRADES: Record<UpgradeId, { title: string; text: (level: number) => string; max: number; rare?: boolean }> = {
  reload: { title: "Quick Hands", text: () => "Both broadsides reload 18% faster.", max: 5 },
  guns: { title: "Extra Cannons", text: () => "+1 cannon on each side of the ship.", max: 3 },
  hull: { title: "Oak Planking", text: () => "+25 max hull, and the hull is fully repaired.", max: 5 },
  sails: { title: "Bigger Sails", text: () => "+10% top speed and sharper turns.", max: 4 },
  shot: { title: "Heavy Shot", text: () => "Cannonballs hit 25% harder.", max: 4 },
  range: { title: "Long Guns", text: () => "Your cannons reach 18% further.", max: 3 },
  ship: {
    title: "New Ship",
    text: (level) =>
      level === 0 ? "Refit as a Brigantine: +40 hull, +1 cannon each side, full repair." : "Refit as a Galleon: +50 hull, +1 cannon each side, full repair.",
    max: 2,
    rare: true,
  },
  carpenter: { title: "Ship's Carpenter", text: () => "Repairs the hull slowly whenever you're out of the fight.", max: 1 },
  plunder: { title: "Plunderer", text: () => "+50% gold from loot and bounties.", max: 1 },
};

type Upgrades = Record<UpgradeId, number>;
const NO_UPGRADES: Upgrades = { reload: 0, guns: 0, hull: 0, sails: 0, shot: 0, range: 0, ship: 0, carpenter: 0, plunder: 0 };

// --- Waves ----------------------------------------------------------------------------------------

function roster(n: number): ShipClass[] {
  if (n % 5 === 0) {
    const escorts = Math.min(4, Math.floor(n / 5));
    return ["ghost", ...Array.from({ length: escorts }, (_, i): ShipClass => (n >= 10 && i % 2 === 1 ? "brig" : "sloop"))];
  }
  const fixed: Record<number, ShipClass[]> = {
    1: ["sloop", "sloop"],
    2: ["sloop", "sloop", "sloop"],
    3: ["sloop", "brig", "sloop"],
    4: ["brig", "sloop", "brig", "sloop"],
  };
  if (fixed[n]) return fixed[n];
  const out: ShipClass[] = [];
  let budget = 3 + n * 0.85;
  const frigates = Math.min(0.4, (n - 5) * 0.07);
  while (budget > 0.9 && out.length < 9) {
    const r = Math.random();
    const kind: ShipClass = r < frigates && budget >= 3 ? "frigate" : r < frigates + 0.42 && budget >= 2 ? "brig" : "sloop";
    out.push(kind);
    budget -= kind === "frigate" ? 3 : kind === "brig" ? 2 : 1.1;
  }
  return out;
}

function describe(list: ShipClass[]) {
  if (list.includes("ghost")) {
    const escorts = list.length - 1;
    return escorts ? `The Drowned Queen and ${escorts} escort${escorts > 1 ? "s" : ""} — mind the green rings!` : "The Drowned Queen — mind the green rings!";
  }
  const count = (k: ShipClass) => list.filter((s) => s === k).length;
  const words = (["frigate", "brig", "sloop"] as const)
    .map((k) => [count(k), k] as const)
    .filter(([c]) => c > 0)
    .map(([c, k]) => `${c} ${k}${c > 1 ? "s" : ""}`);
  return `${words.join(", ")} on the horizon`;
}

// --- Internal types -------------------------------------------------------------------------------

interface Fort {
  site: FortSite;
  tower: THREE.Object3D;
  gun: THREE.Object3D;
  x: number;
  z: number;
  gx: number;
  gz: number;
  height: number;
  hp: number;
  maxHp: number;
  reload: number;
  aimT: number;
  gunYaw: number;
  down: boolean;
  downWave: number;
  fallT: number;
}

interface Ball {
  obj: THREE.Object3D;
  mesh: THREE.Mesh | null;
  active: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  hostile: boolean;
  damage: number;
  ghost: boolean;
  trailT: number;
  age: number;
  /** Online: the player who fired it. */
  owner: string | null;
}

interface Shot {
  t: number;
  ship: Ship | null;
  fort: Fort | null;
  side: Side;
  i: number;
  n: number;
  tx: number;
  /** Height to arrive at (0 = the water line, more for fort towers). */
  ty: number;
  tz: number;
  T: number;
  hostile: boolean;
  damage: number;
  ghost: boolean;
  quiet: boolean;
  owner?: string | null;
}

type LootKind = "barrel" | "crate" | "bottles" | "chest" | "bottle";

interface Loot {
  kind: LootKind;
  /** Open Sea: goods in a crate, the salvage contract it belongs to, a treasure map in a bottle. */
  good?: GoodId;
  qty?: number;
  contract?: string;
  keep?: boolean;
  scale: number;
  obj: THREE.Object3D;
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  phase: number;
  yaw: number;
  spin: number;
  taken: number;
  size: number;
}

interface FloatText {
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  big: boolean;
}

interface Target {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  len: number;
  heading: number;
}

const LOOT_KEYS: Record<LootKind, string> = { barrel: LOOT.barrel, crate: LOOT.crate, bottles: LOOT.bottles, chest: LOOT.chest, bottle: PROPS.bottle };
const LOOT_SCALE: Partial<Record<LootKind, number>> = { bottle: 2.6 };

/** Open Sea pirates fly the skull: the Pirate Kit's black-sailed ships. */
const PIRATE_MODELS: Record<Exclude<ShipClass, "player">, string[]> = {
  sloop: [SHIPS.playerSmall, SHIPS.sloop],
  brig: [SHIPS.playerMedium, SHIPS.brig],
  frigate: [SHIPS.playerLarge, SHIPS.frigate],
  ghost: [SHIPS.ghost, SHIPS.frigate],
};
const PIRATE_NAMES: Record<Exclude<ShipClass, "player" | "ghost">, string> = { sloop: "Pirate sloop", brig: "Pirate brig", frigate: "Pirate frigate" };
/** Merchant traffic on the open sea (ship looks borrowed from the shipyard). */
const TRAFFIC: ShipId[] = ["skiff", "cutter", "sloop", "brig", "galleon", "skiff", "sloop"];
const BIG_TRAFFIC: ShipId[] = ["steamer", "indiaman"];

interface Traffic {
  ship: Ship;
  to: PortId;
  def: ShipId;
}

// --- Game -----------------------------------------------------------------------------------------

export class CannonCoveGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1200);
  private readonly sun = new THREE.DirectionalLight("#fff1dc", 2.5);
  private readonly hemi = new THREE.HemisphereLight("#d9f0ff", "#4a7d8c", 1.1);
  private readonly fog = new THREE.Fog("#cfe9f6", 90, 300);
  private readonly ocean = new Ocean();
  private readonly sky = new Sky();
  private readonly smoke = new Particles(2000);
  private readonly glow = new Particles(700, { additive: true });
  private readonly rings = new Rings(48);
  private readonly wakeMaterial = createWakeMaterial();
  private readonly protos = new Map<string, Proto>();
  private readonly timer = new THREE.Timer();
  private world: World | null = null;
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private overlay: CanvasRenderingContext2D | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private view = { w: 1, h: 1, dpr: 1 };
  private portrait = false;
  private font = "ui-sans-serif, system-ui, sans-serif";

  private phase: Phase = "loading";
  private player!: Ship;
  private enemies: Ship[] = [];
  private readonly shipPool = new Map<string, Ship[]>();
  private forts: Fort[] = [];
  private balls: Ball[] = [];
  private shots: Shot[] = [];
  private loot: Loot[] = [];
  private readonly lootPool = new Map<LootKind, THREE.Object3D[]>();
  private texts: FloatText[] = [];
  private ghostBallMaterial: THREE.MeshStandardMaterial | null = null;
  private ballMaterial: THREE.Material | null = null;

  private readonly wind: Wind = { angle: -1.05, x: 0, z: 0, strength: 1 };
  private windTarget = -1.05;
  private windStrengthTarget = 1;
  private windTimer = 25;

  private wave = 0;
  private waveState: "intro" | "cleared" = "intro";
  private waveT = 0;
  private clearT = 0;
  private spawnQueue: ShipClass[] = [];
  private spawnT = 0;
  private spawnAngle = 0;
  private gold = 0;
  private totalGold = 0;
  private sunk = 0;
  private fortsDown = 0;
  private runTime = 0;
  private up: Upgrades = { ...NO_UPGRADES };
  private offerCards: Card[] = [];
  private banner: Banner | null = null;
  private bannerT = 0;
  private bannerId = 0;
  private haunt = 0;
  private hauntShown = -1;
  private deathT = 0;
  private warn: string | null = null;

  private readonly keys = { left: false, right: false };
  private stick = 0;
  private readonly fireHeld: Record<Side, boolean> = { 1: false, [-1]: false } as Record<Side, boolean>;

  private camYaw = 0;
  private readonly camPos = new THREE.Vector3(0, 10, -30);
  private readonly camLook = new THREE.Vector3();
  private camSnap = true;
  /** Combat framing: 0..1 zoom-out and a yaw bias towards the nearest enemy. */
  private frameK = 0;
  private frameBias = 0;
  private shake = 0;
  private zoom = 1;
  private elapsed = 0;
  private hudT = 0;
  private miniT = 0;
  private hud: Hud = { ...EMPTY_HUD };
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private combat = false;
  private readonly circleBuf: number[] = [0, 0, 0, 0, 0, 0];
  private readonly circleBuf2: number[] = [0, 0, 0, 0, 0, 0];
  private readonly slotCache = new Map<string, DeckSlot[]>();

  // Open Sea.
  private mode: Mode = "waves";
  private cove: World | null = null;
  private sea: World | null = null;
  private coveForts: Fort[] = [];
  private career: Career | null = null;
  /** Port you are moored at (port phase), and the one whose harbour you're in (playing). */
  private docked: PortSite | null = null;
  private dockable: PortSite | null = null;
  private dockBlocked: string | null = null;
  private traffic: Traffic[] = [];
  private readonly trafficPool = new Map<ShipId, Ship[]>();
  private trafficT = 2;
  private encounterT = 25;
  private flotsamT = 20;
  private saveT = 10;
  private shoalT = 0;
  private ringT = 0;
  private threat = 1;
  private readonly bounties = new Map<Ship, string>();
  private readonly salvageOut = new Set<string>();
  private queen: Ship | null = null;
  private bannerQueue: { title: string; sub: string; tone: Banner["tone"]; seconds: number }[] = [];
  private portNotices: Notice[] = [];
  private lastX = 0;
  private lastZ = 0;
  /** Port screen open: slide the picture left (or up) so the ship isn't under the panel. */
  private showcase = 0;
  private showcaseY = 0;
  private portAngle = 0;
  private fullT = -10;
  /** Open Sea auto-sail: steers to the course, tacking upwind, and docks on arrival. */
  private autopilot = false;
  private tackSide = 0;
  private tackT = 0;
  // Online battles.
  private net: OnlineSetup | null = null;
  private readonly remotes = new Map<string, Remote>();
  private readonly remotePool = new Map<string, Ship[]>();
  private kills = 0;
  private deaths = 0;
  private lastBy: string | null = null;
  private respawnT = 0;
  private invulnT = 0;
  private sendT = 0;
  private feed: { id: number; text: string; t: number }[] = [];
  private feedId = 0;
  private startShown = false;
  /** Columns of gold light over every harbour's docking ring. */
  private readonly beacons = new THREE.Group();
  private beaconMaterial: THREE.ShaderMaterial | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.setupWorld(coarse);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup --------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.fog = this.fog;
    scene.background = this.fog.color;
    this.camera.add(this.sky.mesh);
    scene.add(this.camera);
    scene.add(this.ocean.mesh);
    this.ocean.setSun(SUN_DIR);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.4;

    scene.add(this.hemi);
    const { sun } = this;
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    Object.assign(sun.shadow.camera, { left: -SHADOW_EXTENT, right: SHADOW_EXTENT, top: SHADOW_EXTENT, bottom: -SHADOW_EXTENT, near: 1, far: 260 });
    scene.add(sun, sun.target);

    scene.add(this.smoke.points, this.glow.points, this.rings.group);
    this.applyAtmosphere(true);
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
      for (const key of Object.values(SHIPS)) proto(key, { scale: 1 });
      for (const key of Object.values(TRADE_SHIPS)) proto(key, { scale: 1 });
      for (const key of Object.values(ISLAND)) proto(key, { scale: 1 }, { receive: true });
      for (const key of Object.values(PROPS)) proto(key, { scale: 1 }, { receive: true });
      for (const key of Object.values(TOWN)) proto(key, { scale: 1 }, { receive: true });
      proto(ARMS.cannon, { scale: 0.6 });
      proto(ARMS.fortCannon, { scale: 1.3 });
      proto(ARMS.ball, { height: 0.62 }, { shadows: false });
      proto(LOOT.barrel, { height: 1.9 }, { shadows: false });
      proto(LOOT.crate, { width: 2.1 }, { shadows: false });
      proto(LOOT.bottles, { width: 2.1 }, { shadows: false });
      proto(LOOT.chest, { width: 2.3 }, { shadows: false });

      const required = [SHIPS.playerSmall, SHIPS.sloop, ARMS.ball, ISLAND.sand];
      if (!required.every((k) => this.protos.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      this.buildWorld();
      this.buildArms();
      this.player = new Ship("player", { ...PLAYER_STATS }, this.wakeMaterial);
      this.scene.add(this.player.root, this.player.wake.mesh);
      this.resetRun();
      music.play(SEA_SHANTY, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private buildWorld() {
    const world = new World(this.protos, COVE);
    this.world = world;
    this.cove = world;
    this.scene.add(world.group);
    this.ocean.setShoals(world.shoals.filter((s) => !s.dock).map((s) => ({ x: s.x, z: s.z, r: s.r * 0.88 })));
    const towerSmall = this.protos.get(PROPS.towerSmall);
    const towerLarge = this.protos.get(PROPS.towerLarge) ?? towerSmall;
    const gun = this.protos.get(ARMS.fortCannon) ?? this.protos.get(ARMS.cannon);
    for (const site of world.forts) {
      const proto = site.large ? towerLarge : towerSmall;
      if (!proto || !gun) continue;
      const tower = proto.object.clone();
      const s = site.large ? 1.1 : 1.15;
      tower.scale.setScalar(s);
      tower.position.set(site.x, 0.85, site.z);
      tower.rotation.y = site.yaw + Math.PI;
      const g = gun.object.clone();
      const gx = site.x + Math.sin(site.yaw) * 4.2;
      const gz = site.z + Math.cos(site.yaw) * 4.2;
      g.position.set(gx, 0.9, gz);
      g.rotation.y = site.yaw;
      this.scene.add(tower, g);
      this.forts.push({ site, tower, gun: g, x: site.x, z: site.z, gx, gz, height: proto.size.y * s + 0.85, hp: 90, maxHp: 90, reload: 3, aimT: -1, gunYaw: site.yaw, down: false, downWave: 0, fallT: 0 });
    }
    this.coveForts = this.forts;
  }

  /** Builds the open sea ahead of time (hidden), so starting a voyage is instant. */
  warmSea() {
    if (this.sea || this.disposed || !this.protos.size) return;
    this.buildSea();
    this.sea!.group.visible = this.mode === "trade";
    this.beacons.visible = this.mode === "trade";
  }

  private buildSea() {
    const sea = new World(this.protos, openSeaLayout());
    this.sea = sea;
    this.scene.add(sea.group);
    // A soft column of light marks where to dock, seen from across the water.
    this.beaconMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: "varying float vY; void main() { vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: [
        "uniform float uTime; varying float vY;",
        "void main() {",
        "  float k = clamp(vY / 70.0, 0.0, 1.0);",
        "  float a = (1.0 - k) * (1.0 - k) * (0.16 + 0.05 * sin(uTime * 2.0 - vY * 0.15));",
        "  gl_FragColor = vec4(1.0, 0.85, 0.4, a);",
        "}",
      ].join("\n"),
    });
    const geometry = new THREE.CylinderGeometry(2.6, 3.4, 70, 24, 1, true);
    geometry.translate(0, 35, 0);
    for (const site of sea.ports) {
      const m = new THREE.Mesh(geometry, this.beaconMaterial);
      m.position.set(site.zone.x, -1, site.zone.z);
      m.renderOrder = 3;
      this.beacons.add(m);
    }
    this.scene.add(this.beacons);
  }

  /** Shows the cove (wave battles, title screen) or the open sea (trading), building the sea the first time. */
  private useWorld(mode: Mode) {
    if (mode === "trade" && !this.sea) this.buildSea();
    this.mode = mode;
    const trade = mode === "trade";
    if (this.cove) this.cove.group.visible = !trade;
    if (this.sea) this.sea.group.visible = trade;
    this.beacons.visible = trade;
    // Forts only fight in the wave battles (online, every player would see a different one fall).
    const forts = mode === "waves";
    for (const f of this.coveForts) f.tower.visible = f.gun.visible = forts;
    this.forts = forts ? this.coveForts : [];
    this.world = trade ? this.sea : this.cove;
    if (!trade && this.cove) this.ocean.setShoals(this.cove.shoals.filter((s) => !s.dock).map((s) => ({ x: s.x, z: s.z, r: s.r * 0.88 })));
    this.shoalT = 0;
  }

  private buildArms() {
    const ball = this.protos.get(ARMS.ball)!;
    let mesh: THREE.Mesh | null = null;
    ball.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh;
    });
    const base = (mesh as THREE.Mesh | null)?.material as THREE.MeshStandardMaterial | undefined;
    if (base) {
      this.ballMaterial = base;
      this.ghostBallMaterial = base.clone();
      this.ghostBallMaterial.emissive.set("#3dffa8");
      this.ghostBallMaterial.emissiveIntensity = 1.6;
    }
    for (let i = 0; i < 90; i++) {
      const obj = ball.object.clone();
      obj.visible = false;
      let m: THREE.Mesh | null = null;
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !m) m = o as THREE.Mesh;
      });
      this.scene.add(obj);
      this.balls.push({ obj, mesh: m, active: false, p: new THREE.Vector3(), v: new THREE.Vector3(), hostile: false, damage: 0, ghost: false, trailT: 0, age: 0, owner: null });
    }
  }

  // --- Public API ---------------------------------------------------------------------------------

  start() {
    audio.unlock();
    this.career = null;
    this.net = null;
    this.useWorld("waves");
    this.resetRun();
    this.player.sail = 2;
    this.player.sailVis = 2 / 3;
    this.player.speed = 4;
    this.camSnap = true;
    music.play(SEA_SHANTY, 1);
    music.duck(false);
    this.setPhase("playing");
    this.nextWave();
  }

  pause() {
    if (this.phase !== "playing") return;
    this.releaseInput();
    music.duck(true);
    this.sfx.ambience(0, 0, 0);
    this.setPhase("paused");
    this.save();
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.save();
    this.career = null;
    this.net = null;
    this.docked = null;
    this.events.port(null);
    this.useWorld("waves");
    this.resetRun();
    this.camSnap = true;
    music.play(SEA_SHANTY, 0);
    music.setIntensity(0);
    music.duck(false);
    this.events.offer(null);
    this.setPhase("menu");
  }

  get currentPhase() {
    return this.phase;
  }

  setOverlay(canvas: HTMLCanvasElement | null) {
    this.overlay = canvas?.getContext("2d") ?? null;
    this.resize();
  }

  /** Display font family for texts drawn over the 3D view. */
  setFont(family: string) {
    if (family.trim()) this.font = `${family.trim()}, ui-sans-serif, system-ui, sans-serif`;
  }

  setMinimap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas;
    this.miniT = 0;
  }

  setSteerKey(dir: "left" | "right", down: boolean) {
    this.keys[dir] = down;
  }

  /** Touch stick: -1 (left) … 1 (right). */
  setStick(x: number) {
    this.stick = clamp(x, -1, 1);
  }

  sailStep(dir: 1 | -1) {
    if (this.phase !== "playing" || !this.player.alive) return;
    const next = clamp(this.player.sail + dir, 0, 3);
    if (next === this.player.sail) return;
    this.player.sail = next;
    this.sfx.sail(dir > 0);
    this.emitHud(true);
  }

  setFire(side: Side, down: boolean) {
    this.fireHeld[side] = down;
    if (down && this.phase === "playing") {
      if (this.player.reload[side] > 0) this.sfx.empty();
      else this.firePlayer(side);
    }
  }

  zoomStep() {
    this.zoom = this.zoom < 0.9 ? 1 : this.zoom < 1.2 ? 1.35 : 0.8;
  }

  zoomBy(delta: number) {
    this.zoom = clamp(this.zoom * (1 + delta), 0.7, 1.6);
  }

  releaseInput() {
    this.keys.left = this.keys.right = false;
    this.stick = 0;
    this.fireHeld[1] = this.fireHeld[-1] = false;
  }

  choose(index: number) {
    if (this.phase !== "upgrade") return;
    const card = this.offerCards[index];
    if (!card) return;
    this.applyUpgrade(card.id);
    this.sfx.pick();
    this.events.offer(null);
    this.setPhase("playing");
    this.nextWave();
  }

  repair() {
    if (this.phase !== "upgrade") return;
    const p = this.player;
    const cost = this.repairCost();
    if (this.gold < cost || p.hp >= p.maxHp) return;
    this.gold -= cost;
    p.hp = Math.min(p.maxHp, p.hp + this.repairAmount());
    this.sfx.repair();
    this.emitOffer();
    this.emitHud(true);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    this.cove?.dispose();
    this.sea?.dispose();
    (this.beacons.children[0] as THREE.Mesh | undefined)?.geometry.dispose();
    this.beaconMaterial?.dispose();
    for (const t of this.traffic) t.ship.dispose();
    for (const list of this.trafficPool.values()) for (const s of list) s.dispose();
    for (const r of this.remotes.values()) r.ship.dispose();
    for (const list of this.remotePool.values()) for (const s of list) s.dispose();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.envTexture?.dispose();
    this.ocean.dispose();
    this.sky.dispose();
    this.smoke.dispose();
    this.glow.dispose();
    this.rings.dispose();
    this.wakeMaterial.dispose();
    this.ghostBallMaterial?.dispose();
    this.player?.dispose();
    for (const s of this.enemies) s.dispose();
    for (const list of this.shipPool.values()) for (const s of list) s.dispose();
    this.renderer.dispose();
  }

  // --- State --------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    this.emitHud(true);
  }

  private resetRun() {
    for (const e of this.enemies) this.releaseShip(e);
    this.enemies = [];
    for (const t of this.traffic) this.releaseTraffic(t);
    this.traffic = [];
    this.bounties.clear();
    this.salvageOut.clear();
    this.queen = null;
    this.autopilot = false;
    for (const r of this.remotes.values()) this.releaseRemote(r);
    this.remotes.clear();
    this.feed = [];
    this.kills = this.deaths = 0;
    this.respawnT = 0;
    this.bannerQueue = [];
    this.dockable = null;
    this.dockBlocked = null;
    this.encounterT = 25;
    this.flotsamT = 20;
    this.trafficT = 2;
    for (const b of this.balls) {
      b.active = false;
      b.obj.visible = false;
    }
    this.shots = [];
    for (const l of this.loot) this.releaseLoot(l);
    this.loot = [];
    this.texts = [];
    this.smoke.clear();
    this.glow.clear();
    this.rings.clear();
    this.up = { ...NO_UPGRADES };
    this.wave = 0;
    this.waveState = "intro";
    this.spawnQueue = [];
    this.gold = 0;
    this.totalGold = 0;
    this.sunk = 0;
    this.fortsDown = 0;
    this.runTime = 0;
    this.banner = null;
    this.haunt = 0;
    this.deathT = 0;
    this.warn = null;
    this.releaseInput();
    this.wind.angle = this.windTarget = -1.05 + rand(-0.2, 0.2);
    this.wind.strength = this.windStrengthTarget = 1;
    this.windTimer = 25;
    this.updateWindVector();

    const p = this.player;
    if (this.mode === "trade" && this.career) this.applyTradeShip();
    else if (this.mode === "online" && this.net) this.applyOnlineShip();
    else {
      p.stats = { ...PLAYER_STATS };
      p.setModel(this.protos.get(SHIP_MODELS[0])!, 1);
      this.mountGuns();
    }
    p.reset(0, 0, 0.35);
    p.maxHp = this.maxHull();
    p.hp = this.mode === "trade" && this.career ? Math.max(1, p.maxHp * this.career.s.hull) : p.maxHp;
    p.sail = 1;
    p.sailVis = 1 / 3;
    p.speed = 2;
    p.lastHit = -10;
    for (const f of this.forts) this.rebuildFort(f);
    this.applyAtmosphere(true);
    this.emitHud(true);
  }

  // --- Derived player stats -------------------------------------------------------------------

  /** The trading career, when sailing the open sea. */
  private get trade() {
    return this.mode === "trade" ? this.career : null;
  }

  /** Your ship's class in an online battle. */
  private get onlineShip() {
    return this.mode === "online" && this.net ? ONLINE_SHIPS[this.net.ship] ?? ONLINE_SHIPS[0] : null;
  }

  private maxHull() {
    if (this.onlineShip) return this.onlineShip.hull;
    if (this.trade) return this.trade.maxHull();
    return 100 + this.up.hull * 25 + [0, 40, 90][this.up.ship];
  }

  private guns() {
    if (this.onlineShip) return this.onlineShip.guns;
    if (this.trade) return this.trade.guns();
    return 3 + this.up.guns + this.up.ship;
  }

  private reloadTime() {
    if (this.onlineShip) return this.onlineShip.reload;
    if (this.trade) return 3.2 * Math.pow(0.85, this.trade.level("reload"));
    return 3.2 * Math.pow(0.82, this.up.reload);
  }

  private range() {
    if (this.onlineShip) return 50;
    if (this.trade) return 46 * (1 + 0.15 * this.trade.level("range"));
    return 46 * (1 + 0.18 * this.up.range);
  }

  private damage() {
    if (this.trade) return 10 * (1 + 0.2 * this.trade.level("shot"));
    return 10 * (1 + 0.25 * this.up.shot);
  }

  private speedMul() {
    if (this.onlineShip) return 1;
    if (this.trade) return 1 + 0.05 * this.trade.level("sails");
    return (1 + 0.1 * this.up.sails) * (1 - 0.03 * this.up.ship);
  }

  private turnMul() {
    if (this.onlineShip) return 1;
    if (this.trade) return 1 + 0.06 * this.trade.level("sails");
    return (1 + 0.08 * this.up.sails) * (1 - 0.06 * this.up.ship);
  }

  private goldMul() {
    if (this.trade) return 1;
    return 1 + 0.5 * this.up.plunder;
  }

  /** Combat difficulty: the wave number in the cove, the local threat on the open sea. */
  private lvl() {
    return this.mode === "trade" ? this.threat : this.wave;
  }

  private repairCost() {
    return 30 + this.wave * 2;
  }

  private repairAmount() {
    return Math.round(this.player.maxHp * 0.3);
  }

  private applyUpgrade(id: UpgradeId) {
    this.up[id]++;
    const p = this.player;
    if (id === "hull") {
      p.maxHp = this.maxHull();
      p.hp = p.maxHp;
    } else if (id === "ship") {
      const proto = this.protos.get(SHIP_MODELS[this.up.ship]);
      if (proto) p.setModel(proto, 1);
      p.maxHp = this.maxHull();
      p.hp = p.maxHp;
    }
    p.maxHp = this.maxHull();
    this.mountGuns();
    this.emitHud(true);
  }

  /** Shows the player's cannons on deck — one per gun, so upgrades are visible. */
  private mountGuns() {
    const key = this.onlineShip ? this.onlineShip.model : this.trade ? this.trade.ship.model : SHIP_MODELS[this.up.ship];
    this.player.setDeckGuns(this.protos.get(ARMS.cannon), this.deckSlots(key), this.guns());
  }

  /** Free spots along the main deck's rail of a ship model (found by casting rays down onto it). */
  private deckSlots(key: string): DeckSlot[] {
    const cached = this.slotCache.get(key);
    if (cached) return cached;
    const proto = this.protos.get(key);
    const slots: DeckSlot[] = [];
    if (proto) {
      const obj = proto.object;
      obj.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      const down = new THREE.Vector3(0, -1, 0);
      const solid = (hits: THREE.Intersection[]) => hits.find((h) => !/sail|flag/i.test(h.object.name + h.object.parent?.name));
      const free: DeckSlot[] = [];
      for (let z = -proto.size.z / 2; z <= proto.size.z / 2; z += 0.2) {
        ray.set(this.v1.set(1.45, 30, z), down);
        const deck = solid(ray.intersectObject(obj, true));
        ray.set(this.v1.set(1.9, 30, z), down);
        const rail = solid(ray.intersectObject(obj, true));
        if (deck && rail && deck.point.y > 1.9 && deck.point.y < 2.95 && rail.point.y > deck.point.y + 0.3) free.push({ z, y: deck.point.y });
      }
      // Most central spots first, at least a cannon's length apart.
      const mid = free.length ? (free[0].z + free[free.length - 1].z) / 2 : 0;
      free.sort((a, b) => Math.abs(a.z - mid) - Math.abs(b.z - mid));
      for (const s of free) if (slots.every((o) => Math.abs(o.z - s.z) >= 1.15)) slots.push(s);
    }
    this.slotCache.set(key, slots);
    return slots;
  }

  private offerUpgrades() {
    const available = (Object.keys(UPGRADES) as UpgradeId[]).filter((id) => {
      if (this.up[id] >= UPGRADES[id].max) return false;
      if (id === "ship") return this.wave >= (this.up.ship === 0 ? 2 : 5);
      if (id === "guns") return this.guns() < 8;
      return true;
    });
    const picks: UpgradeId[] = [];
    // A new ship is too good to hide: offer it whenever it unlocks.
    if (available.includes("ship") && Math.random() < 0.75) picks.push("ship");
    const rest = available.filter((id) => !picks.includes(id));
    while (picks.length < 3 && rest.length) picks.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    this.offerCards = picks.map((id) => ({
      id,
      title: id === "ship" ? `New Ship: ${SHIP_NAMES[this.up.ship + 1]}` : UPGRADES[id].title,
      text: UPGRADES[id].text(this.up[id]),
      level: this.up[id],
      max: UPGRADES[id].max,
      rare: !!UPGRADES[id].rare,
    }));
    this.emitOffer();
  }

  private emitOffer() {
    this.events.offer({
      wave: this.wave,
      cards: this.offerCards,
      gold: this.gold,
      repairCost: this.repairCost(),
      repairAmount: this.repairAmount(),
      hull: Math.ceil(this.player.hp),
      maxHull: this.player.maxHp,
    });
  }

  // --- Waves --------------------------------------------------------------------------------------

  private nextWave() {
    this.wave++;
    const list = roster(this.wave);
    this.spawnQueue = [...list];
    this.waveState = "intro";
    this.waveT = 0;
    this.spawnT = 1.8;
    this.spawnAngle = this.player.heading + rand(-1.2, 1.2);
    for (const f of this.forts) if (f.down && this.wave - f.downWave >= 3) this.rebuildFort(f);
    const boss = list.includes("ghost");
    this.showBanner(boss ? "The ghost ship rises!" : `Wave ${this.wave}`, describe(list), boss ? "boss" : "info", 4.2);
    if (boss) this.sfx.boss();
    else this.sfx.waveStart();
  }

  private updateWaves(dt: number) {
    this.waveT += dt;
    if (this.spawnQueue.length) {
      this.spawnT -= dt;
      const active = this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
      if (this.spawnT <= 0 && active < MAX_ACTIVE) {
        this.spawnEnemy(this.spawnQueue.shift()!);
        this.spawnT = 1.4;
      }
    }
    if (this.waveState !== "cleared" && !this.spawnQueue.length && this.waveT > 3 && !this.enemies.some((e) => e.alive)) {
      this.waveState = "cleared";
      this.clearT = 5;
      this.showBanner(`Wave ${this.wave} cleared!`, "Sail through the loot — upgrades in a moment", "good", 4);
      this.sfx.waveClear();
    }
    if (this.waveState === "cleared") {
      this.clearT -= dt;
      const lootNear = this.loot.some((l) => l.taken < 0 && Math.hypot(l.x - this.player.x, l.z - this.player.z) < 30);
      if (this.clearT <= 0 || (this.clearT < 3.5 && !lootNear && this.loot.every((l) => l.taken >= 0))) {
        this.clearT = 0;
        this.releaseInput();
        this.setPhase("upgrade");
        this.offerUpgrades();
      }
    }
  }

  private scaledStats(kind: Exclude<ShipClass, "player">): ShipStats {
    const base = ENEMY_STATS[kind];
    const n = this.lvl() - 1;
    const hp = kind === "ghost" ? (this.trade ? base.hp + 120 * this.trade.rank : base.hp + 150 * (Math.floor(this.wave / 5) - 1)) : base.hp * (1 + 0.07 * n);
    return {
      ...base,
      hp: Math.round(hp),
      damage: base.damage * (1 + 0.045 * n),
      reload: base.reload * Math.max(0.72, 1 - 0.022 * n),
      speed: base.speed * Math.min(1.15, 1 + 0.012 * n),
    };
  }

  private shipKey(kind: ShipClass) {
    if (this.mode === "trade" && kind !== "player") return PIRATE_MODELS[kind].find((k) => this.protos.has(k))!;
    const map: Record<ShipClass, string[]> = {
      player: [SHIPS.playerSmall],
      sloop: [SHIPS.sloop],
      brig: [SHIPS.brig, SHIPS.sloop],
      frigate: [SHIPS.frigate, SHIPS.brig, SHIPS.sloop],
      ghost: [SHIPS.ghost, SHIPS.frigate, SHIPS.sloop],
    };
    return map[kind].find((k) => this.protos.has(k))!;
  }

  private spawnEnemy(kind: ShipClass) {
    if (kind === "player") return;
    const stats = this.scaledStats(kind);
    const ship = this.takeShip(kind, stats);
    const p = this.player;
    const shoals = this.world?.shoals ?? [];
    let x = 0;
    let z = 0;
    let found = false;
    for (let attempt = 0; attempt < 60 && !found; attempt++) {
      const a = this.spawnAngle + rand(-0.7, 0.7) + (attempt > 30 ? rand(-2, 2) : 0);
      const d = kind === "ghost" ? rand(80, 95) : rand(95, 135);
      x = p.x + Math.sin(a) * d;
      z = p.z + Math.cos(a) * d;
      if (Math.hypot(x, z) > ARENA - 18) continue;
      if (shoals.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 12)) continue;
      if (this.enemies.some((e) => Math.hypot(x - e.x, z - e.z) < 22)) continue;
      found = true;
    }
    if (!found) {
      const a = Math.atan2(-p.x, -p.z) + rand(-0.8, 0.8);
      x = Math.sin(a) * (ARENA - 30);
      z = Math.cos(a) * (ARENA - 30);
    }
    this.launchEnemy(ship, x, z);
    if (kind === "ghost") {
      // It rises from the deep in a burst of green fire.
      this.glow.burst(this.v1.set(x, 1, z), 40, 6, 6, { color: "#58ffb8", size: 2.4, grow: 0.4, life: 1.4, gravity: -2, drag: 1.5, alpha: 0.9, spread: 6 });
      this.smoke.burst(this.v1.set(x, 1, z), 30, 4, 3, { color: "#4c6b62", size: 4, grow: 10, life: 3, gravity: -1.5, drag: 1.2, alpha: 0.6, spread: 8 });
    }
  }

  /** A pooled enemy ship of this class (the model depends on the mode). */
  private takeShip(kind: ShipClass, stats: ShipStats) {
    const key = this.shipKey(kind);
    const ship = this.shipPool.get(key)?.pop() ?? this.createShip(kind, stats, key);
    ship.stats = stats;
    return ship;
  }

  /** Puts an enemy on the water at (x, z), turned towards the player and ready to fight. */
  private launchEnemy(ship: Ship, x: number, z: number) {
    const p = this.player;
    ship.reset(x, z, Math.atan2(p.x - x, p.z - z) + rand(-0.4, 0.4));
    ship.maxHp = ship.hp = ship.stats.hp;
    ship.sail = 3;
    ship.sailVis = 1;
    ship.speed = ship.stats.speed * 0.6;
    ship.reload[1] = rand(1, 3);
    ship.reload[-1] = rand(1, 3);
    ship.side = Math.random() < 0.5 ? 1 : -1;
    ship.sideTimer = rand(8, 16);
    ship.barrageT = 6;
    ship.lastHit = -10;
    this.enemies.push(ship);
    this.scene.add(ship.root, ship.wake.mesh);
    ship.pose(0, this.elapsed, this.wind);
  }

  private createShip(kind: ShipClass, stats: ShipStats, key: string) {
    const ship = new Ship(kind, stats, this.wakeMaterial);
    ship.setModel(this.protos.get(key)!, stats.scale, kind === "ghost" ? GHOST_TINT : undefined);
    ship.pool = key;
    return ship;
  }

  private releaseShip(ship: Ship) {
    this.scene.remove(ship.root, ship.wake.mesh);
    ship.wake.reset();
    if (ship === this.queen) this.queen = null;
    this.bounties.delete(ship);
    let list = this.shipPool.get(ship.pool);
    if (!list) this.shipPool.set(ship.pool, (list = []));
    list.push(ship);
  }

  // --- Frame --------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    if (this.phase === "loading" || this.phase === "error") return;

    const live = this.phase !== "paused" && this.phase !== "chart";
    if (live) {
      this.elapsed += dt;
      sea.time += dt;
      if (this.phase === "playing") this.updatePlaying(dt);
      else if (this.phase === "menu") this.updateMenu(dt);
      else if (this.phase === "port") this.updatePort(dt);
      else if (this.phase === "sinking" || this.phase === "over" || this.phase === "wrecked") this.updateSinking(dt);
      this.updateVisuals(dt);
    }
    if (this.mode === "trade") this.updateSeaView(dt);
    this.updateCamera(live ? dt : 0);
    this.ocean.update(this.camLook);
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay();
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 1 / 12;
      this.drawMinimap();
    }
    this.hudT -= dt;
    if (this.hudT <= 0) this.emitHud();
  };

  private updateMenu(dt: number) {
    // The ship idles along on a slow circle while the camera orbits.
    const p = this.player;
    this.updateWind(dt);
    p.sail = 1;
    p.steerIn = -0.35;
    p.physics(dt, this.wind, 0.7, 0.5, 0.5);
    if (Math.hypot(p.x, p.z) > 40) p.steerIn = -1;
  }

  private updatePlaying(dt: number) {
    this.runTime += dt;
    this.updateWind(dt);
    this.controlPlayer(dt);
    const p = this.player;
    p.physics(dt, this.wind, this.speedMul(), this.turnMul());
    for (const e of this.enemies) {
      this.updateEnemy(e, dt);
      e.physics(dt, this.wind, 1, 1, 0.45);
    }
    this.collide();
    this.updateForts(dt);
    this.updateShots(dt);
    this.updateBalls(dt);
    this.updateLoot(dt);
    if (this.mode === "trade") this.updateTrade(dt);
    else if (this.mode === "online") this.updateOnline(dt);
    else this.updateWaves(dt);
    // Ship's carpenter (online: everyone mends slowly out of the fight).
    const carpenter = this.mode === "online" ? 1 : this.trade ? this.trade.level("carpenter") : this.up.carpenter;
    if (carpenter && p.alive && this.runTime - p.lastHit > 5 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + (this.trade ? p.maxHp * 0.012 : 1.6) * dt);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) {
        this.banner = null;
        const next = this.bannerQueue.shift();
        if (next) this.showBanner(next.title, next.sub, next.tone, next.seconds);
        this.emitHud(true);
      }
    }
    const combat = this.foes().some((e) => e.alive && (e.kind === "ghost" || Math.hypot(e.x - p.x, e.z - p.z) < COMBAT_RANGE));
    music.setIntensity(combat ? 2 : 1);
    this.combat = combat;
  }

  private updateSinking(dt: number) {
    this.deathT += dt;
    for (const e of this.enemies) {
      this.updateEnemy(e, dt);
      e.physics(dt, this.wind, 0.8, 1, 0.45);
    }
    this.player.physics(dt, this.wind);
    this.player.sinkT += dt;
    this.updateShots(dt);
    this.updateBalls(dt);
    this.updateLoot(dt);
    for (const e of this.enemies) if (e.sinkT >= 0) e.sinkT += dt;
    if (this.phase === "sinking" && this.deathT > 3.6 && this.mode === "trade") {
      this.wreck();
      return;
    }
    if (this.phase === "sinking" && this.deathT > 3.6) {
      this.setPhase("over");
      this.sfx.gameOver();
      music.setIntensity(0);
      this.events.over({ wave: this.wave, sunk: this.sunk, gold: Math.round(this.totalGold), forts: this.fortsDown, seconds: Math.round(this.runTime) });
    }
  }

  /** Waves, bobbing, particles, wakes and atmosphere: runs in every live phase. */
  private updateVisuals(dt: number) {
    const t = this.elapsed;
    const p = this.player;
    p.pose(dt, t, this.wind);
    this.shipFx(p, dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.sinkT >= 0 && this.phase !== "sinking" && this.phase !== "over") e.sinkT += dt;
      e.pose(dt, t, this.wind);
      this.shipFx(e, dt);
      if (e.sinkT > 9) {
        this.releaseShip(e);
        this.enemies.splice(i, 1);
      }
    }
    for (const tr of this.traffic) {
      tr.ship.pose(dt, t, this.wind);
      this.shipFx(tr.ship, dt);
    }
    for (const r of this.remotes.values()) {
      if (!r.ship.root.visible) continue;
      if (r.ship.sinkT >= 0) r.ship.sinkT += dt;
      r.ship.pose(dt, t, this.wind);
      this.shipFx(r.ship, dt);
    }
    for (const f of this.forts) this.fortVisual(f, dt);
    this.updateTexts(dt);
    this.world?.update(t);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.rings.update(dt);
    (this.wakeMaterial.uniforms.uTime as { value: number }).value = t;
    this.applyAtmosphere(false, dt);
    if (this.phase === "upgrade" || this.phase === "port") {
      // Loot keeps bobbing behind the upgrade cards and the port screen.
      for (const l of this.loot) this.poseLoot(l, dt);
    }
    const speedK = clamp(p.speed / 12, 0, 1);
    const playing = this.phase === "playing" || this.phase === "upgrade" || this.phase === "menu" || this.phase === "port";
    this.sfx.ambience(playing ? 0.8 + this.haunt * 0.5 : 0.5, playing ? this.wind.strength * (0.4 + p.sailVis * 0.6) : 0.2, playing ? speedK : 0);
    this.shake = Math.max(0, this.shake - dt * 1.6);
  }

  // --- Wind ---------------------------------------------------------------------------------------

  private updateWind(dt: number) {
    if (this.net) {
      // Every player sees the same wind: it follows the round's seed and clock.
      const t = (this.net.now() - this.net.start) / 1000;
      const base = ((this.net.seed % 628) / 100) * 1;
      this.wind.angle = base + 0.5 * Math.sin(t / 45) + 0.25 * Math.sin(t / 17 + 1);
      this.wind.strength = 1 + 0.1 * Math.sin(t / 31);
      this.updateWindVector();
      return;
    }
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTimer = rand(20, 34);
      this.windTarget = this.wind.angle + rand(0.35, 1.1) * (Math.random() < 0.5 ? -1 : 1);
      this.windStrengthTarget = rand(0.8, 1.18);
    }
    this.wind.angle = dampAngle(this.wind.angle, this.windTarget, 0.1, dt);
    this.wind.strength = damp(this.wind.strength, this.windStrengthTarget, 0.12, dt);
    this.updateWindVector();
  }

  private updateWindVector() {
    this.wind.x = Math.sin(this.wind.angle);
    this.wind.z = Math.cos(this.wind.angle);
  }

  // --- Player -------------------------------------------------------------------------------------

  private controlPlayer(dt: number) {
    const p = this.player;
    if (!p.alive) return;
    const k = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    const manual = clamp(k + this.stick, -1, 1);
    // Touching the helm takes back control from auto-sail.
    if (this.autopilot && manual !== 0) this.setAutopilot(false);
    p.steerIn = this.autopilot ? this.autoSteer(dt) : manual;
    for (const side of [1, -1] as Side[]) {
      const before = p.reload[side];
      p.reload[side] = Math.max(0, before - dt);
      if (before > 0 && p.reload[side] === 0) this.sfx.reloaded();
      if (this.fireHeld[side] && p.reload[side] === 0) this.firePlayer(side);
    }
    if (this.mode === "trade") this.warn = Math.max(Math.abs(p.x), Math.abs(p.z)) > BOUNDS - 30 ? "Uncharted waters — turn back" : null;
    else this.warn = Math.hypot(p.x, p.z) > ARENA - 14 ? "Turn back — you're leaving the cove" : null;
  }

  private firePlayer(side: Side) {
    const p = this.player;
    if (p.reload[side] > 0 || !p.alive) return;
    if (this.net && this.net.now() < this.net.start) return;
    p.reload[side] = this.reloadTime();
    const first = this.shots.length;
    this.broadside(p, side, this.pickTarget(side), false, this.guns(), this.range(), this.damage());
    if (this.net) {
      const mine = this.shots.slice(first);
      for (const s of mine) s.owner = this.net.me;
      const r1 = (v: number) => Math.round(v * 10) / 10;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      this.net.emit({ k: "f", sd: side, n: mine.length, sh: mine.map((s) => [r1(s.tx), r2(s.ty), r1(s.tz), r2(s.T), r2(s.t)]), dmg: this.damage() });
    }
    this.shake = Math.max(this.shake, 0.18);
    this.emitHud(true);
  }

  /** The best target on a side: the nearest enemy (or fort) roughly abeam and in range. */
  private pickTarget(side: Side): Target | null {
    const p = this.player;
    const sx = p.sideX(side);
    const sz = p.sideZ(side);
    const range = this.range() * 1.15;
    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (x: number, z: number, t: Target) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 1) return;
      const cos = (dx * sx + dz * sz) / d;
      if (cos < 0.72) return;
      const score = d * (1.8 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    };
    for (const e of this.foes()) {
      if (!e.alive) continue;
      consider(e.x, e.z, { x: e.x, y: 0, z: e.z, vx: e.fx * e.speed, vz: e.fz * e.speed, len: e.length, heading: e.heading });
    }
    for (const f of this.forts) {
      if (f.down) continue;
      consider(f.x, f.z, { x: f.x, y: f.height * 0.45, z: f.z, vx: 0, vz: 0, len: 1.5, heading: 0 });
    }
    return best;
  }

  private damagePlayer(amount: number, at: THREE.Vector3 | null, by: string | null = null) {
    const p = this.player;
    if (!p.alive || this.phase !== "playing") return;
    if (this.net) {
      if (this.invulnT > 0) return;
      if (by) this.lastBy = by;
    }
    p.hp -= amount;
    p.hitFlash = 1;
    p.lastHit = this.runTime;
    this.shake = Math.max(this.shake, 0.45);
    this.sfx.hurt();
    if (at) this.splinters(at, 1.2);
    if (p.hp <= 0 && this.net) {
      // Online: you sink, the others hear who did it, and you're back in a few seconds.
      p.hp = 0;
      this.sinkShip(p);
      this.releaseInput();
      this.deaths++;
      const by = this.lastBy && this.remotes.has(this.lastBy) ? this.lastBy : null;
      this.net.emit({ k: "s", by });
      this.addFeed(by ? `${this.remotes.get(by)!.name} sank you` : "You ran aground");
      this.respawnT = 5;
      this.bannerQueue = [];
      this.showBanner("Sunk!", by ? `${this.remotes.get(by)!.name} got you — back in 5 seconds` : "Back in 5 seconds", "bad", 3);
      this.sendState();
    } else if (p.hp <= 0) {
      p.hp = 0;
      this.sinkShip(p);
      this.releaseInput();
      this.deathT = 0;
      this.bannerQueue = [];
      this.showBanner("Your ship is going down!", this.trade ? "The cargo is lost to the sea" : `Wave ${this.wave} · ${this.sunk} ships sunk`, "bad", 5);
      this.setPhase("sinking");
    }
    this.emitHud(true);
  }

  // --- Enemy AI -----------------------------------------------------------------------------------

  private updateEnemy(e: Ship, dt: number) {
    e.reload[1] = Math.max(0, e.reload[1] - dt);
    e.reload[-1] = Math.max(0, e.reload[-1] - dt);
    if (!e.alive) {
      e.steerIn = 0;
      return;
    }
    const p = this.player;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const bearing = Math.atan2(dx, dz);
    const range = e.stats.range;
    const pref = range * 0.62;
    const hunting = p.alive && this.phase === "playing";

    e.sideTimer -= dt;
    if (e.sideTimer <= 0) {
      e.sideTimer = rand(12, 22);
      // Engage with whichever side currently faces the player.
      e.side = wrap(bearing - e.heading) > 0 ? 1 : -1;
    }
    let desired: number;
    if (!hunting) desired = e.heading + 0.4;
    else if (dist > pref * 1.75) desired = bearing - e.side * 0.3;
    else {
      const k = clamp((dist - pref * 0.5) / (pref * 0.75), 0, 1);
      desired = bearing - e.side * lerp(2.1, 1.0, k);
    }
    // Never point straight into the wind.
    const from = this.wind.angle + Math.PI;
    const rel = wrap(desired - from);
    if (Math.abs(rel) < 0.6) desired = from + (rel >= 0 ? 0.6 : -0.6);
    desired = this.avoid(e, desired);
    const diff = wrap(desired - e.heading);
    e.steerIn = clamp(-diff * 1.8, -1, 1);
    e.sail = !hunting ? 1 : dist > pref * 1.4 ? 3 : 2;

    if (!hunting) {
      e.aimT = -1;
      return;
    }
    if (e.aimT >= 0) {
      e.aimT -= dt;
      // Fuse sparks along the gun ports.
      if (Math.random() < dt * 30) {
        e.muzzle(e.aimSide, Math.floor(Math.random() * e.stats.guns), e.stats.guns, this.v1);
        this.glow.spawn(this.v1.x, this.v1.y + 0.3, this.v1.z, rand(-1, 1), rand(1, 3), rand(-1, 1), { color: "#ffb347", size: 0.7, grow: 0.2, life: 0.35, gravity: 6 });
      }
      if (e.aimT < 0) {
        const target: Target = { x: p.x, y: 0, z: p.z, vx: p.fx * p.speed, vz: p.fz * p.speed, len: p.length, heading: p.heading };
        e.reload[e.aimSide] = e.stats.reload;
        this.broadside(e, e.aimSide, target, true, e.stats.guns, e.stats.range, e.stats.damage);
      }
      return;
    }
    if (dist < range * 1.05) {
      for (const side of [1, -1] as Side[]) {
        if (e.reload[side] > 0) continue;
        const cos = (dx * e.sideX(side) + dz * e.sideZ(side)) / dist;
        if (cos > 0.84) {
          e.aimT = Math.max(0.6, 1.05 - this.lvl() * 0.025);
          e.aimSide = side;
          this.sfx.fuse(this.near(e.x, e.z));
          break;
        }
      }
    }
    if (e.kind === "ghost") {
      e.barrageT -= dt;
      if (e.barrageT <= 0 && dist < 90) {
        e.barrageT = rand(8.5, 11.5);
        this.barrage(e);
      }
    }
  }

  /** Steers around islands, reefs, other ships and the edge of the cove. */
  private avoid(e: Ship, desired: number) {
    let out = desired;
    const shoals = this.world?.shoals ?? [];
    for (const probe of [11, 22, 34]) {
      const px = e.x + Math.sin(out) * probe;
      const pz = e.z + Math.cos(out) * probe;
      for (const s of shoals) {
        if (Math.abs(px - s.x) > s.r + 7 || Math.abs(pz - s.z) > s.r + 7) continue;
        if (Math.hypot(px - s.x, pz - s.z) < s.r + 7) {
          const toShoal = Math.atan2(s.x - e.x, s.z - e.z);
          const a = wrap(out - toShoal);
          out = toShoal + (a >= 0 ? 1 : -1) * (Math.PI / 2 + 0.3);
        }
      }
    }
    for (const o of this.enemies) {
      if (o === e || !o.alive) continue;
      const dx = o.x - e.x;
      const dz = o.z - e.z;
      const d = Math.hypot(dx, dz);
      if (d < 16) {
        const to = Math.atan2(dx, dz);
        const a = wrap(out - to);
        if (Math.abs(a) < 1.2) out = to + (a >= 0 ? 1.2 : -1.2);
      }
    }
    const trade = this.mode === "trade";
    const r = trade ? Math.max(Math.abs(e.x), Math.abs(e.z)) : Math.hypot(e.x, e.z);
    const edge = trade ? BOUNDS - 60 : ARENA - 35;
    if (r > edge) {
      const home = Math.atan2(-e.x, -e.z);
      out += wrap(home - out) * clamp((r - edge) / 20, 0, 1);
    }
    return out;
  }

  /** The ghost ship lobs a ring of shots onto (and around) where you're heading. */
  private barrage(e: Ship) {
    const p = this.player;
    const T = 1.6;
    const cx = p.x + p.fx * p.speed * T * 0.9;
    const cz = p.z + p.fz * p.speed * T * 0.9;
    const points: [number, number][] = [[cx, cz]];
    const rot = rand(0, TAU);
    for (let i = 0; i < 6; i++) points.push([cx + Math.cos(rot + (i * TAU) / 6) * 8, cz + Math.sin(rot + (i * TAU) / 6) * 8]);
    points.forEach(([x, z], i) => {
      const delay = 0.12 + i * 0.04;
      this.rings.spawn(x, z, { r0: 5, r1: 2.2, life: T + 0.1, color: "#6dffc4", alpha: 0.95, pulse: true });
      this.shots.push({ t: delay, ship: e, fort: null, side: i % 2 ? 1 : -1, i: i % 5, n: 5, tx: x, ty: 0, tz: z, T: T - delay, hostile: true, damage: 9, ghost: true, quiet: i > 1 });
    });
    this.sfx.wail();
  }

  // --- Cannons ------------------------------------------------------------------------------------

  private broadside(s: Ship, side: Side, target: Target | null, hostile: boolean, n: number, range: number, damage: number) {
    const m = this.v1;
    const sx = s.sideX(side);
    const sz = s.sideZ(side);
    for (let i = 0; i < n; i++) {
      s.muzzle(side, i, n, m);
      let tx: number;
      let tz: number;
      if (target) {
        const d0 = Math.hypot(target.x - m.x, target.z - m.z);
        const T0 = 0.45 + Math.min(d0, range) / 60;
        const lead = hostile ? rand(0.55, 1.05) : 1;
        const along = (n <= 1 ? 0 : i / (n - 1) - 0.5) * target.len * 0.75;
        tx = target.x + target.vx * T0 * lead + Math.sin(target.heading) * along;
        tz = target.z + target.vz * T0 * lead + Math.cos(target.heading) * along;
        const err = hostile ? (1.6 + d0 * 0.05) * Math.max(0.7, 1 - this.lvl() * 0.02) : 0.7 + d0 * 0.022;
        tx += gauss() * err;
        tz += gauss() * err;
      } else {
        const R = range * rand(0.82, 0.94);
        tx = m.x + sx * R + s.fx * s.speed * 0.9 + gauss() * 1.2;
        tz = m.z + sz * R + s.fz * s.speed * 0.9 + gauss() * 1.2;
      }
      const dx = tx - m.x;
      const dz = tz - m.z;
      const dd = Math.hypot(dx, dz) || 1;
      if (dd > range) {
        tx = m.x + (dx / dd) * range;
        tz = m.z + (dz / dd) * range;
      }
      const T = 0.45 + Math.min(dd, range) / 60;
      const ty = target && dd <= range ? target.y : 0;
      this.shots.push({ t: i * 0.08 + rand(0, 0.03), ship: s, fort: null, side, i, n, tx, ty, tz, T, hostile, damage, ghost: s.kind === "ghost", quiet: false });
    }
  }

  private updateShots(dt: number) {
    if (!this.shots.length) return;
    const m = this.v2;
    this.shots = this.shots.filter((shot) => {
      shot.t -= dt;
      if (shot.t > 0) return true;
      let dirX = 0;
      let dirZ = 0;
      if (shot.ship) {
        if (!shot.ship.alive && shot.ship !== this.player) return false;
        shot.ship.muzzle(shot.side, shot.i, shot.n, m);
        dirX = shot.ship.sideX(shot.side);
        dirZ = shot.ship.sideZ(shot.side);
      } else if (shot.fort) {
        if (shot.fort.down) return false;
        const f = shot.fort;
        dirX = Math.sin(f.gunYaw);
        dirZ = Math.cos(f.gunYaw);
        m.set(f.gx + dirX * 1.4, 2.1, f.gz + dirZ * 1.4);
      }
      this.launch(m, shot.tx, shot.ty, shot.tz, Math.max(0.3, shot.T), shot.hostile, shot.damage, shot.ghost, shot.owner ?? null);
      this.muzzleFx(m, dirX, dirZ, shot.ghost);
      if (!shot.quiet) this.sfx.cannon(shot.hostile ? this.near(m.x, m.z) * 0.85 : 1);
      return false;
    });
  }

  private launch(from: THREE.Vector3, tx: number, ty: number, tz: number, T: number, hostile: boolean, damage: number, ghost: boolean, owner: string | null = null) {
    const b = this.balls.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.owner = owner;
    b.hostile = hostile;
    b.damage = damage;
    b.ghost = ghost;
    b.age = 0;
    b.trailT = 0;
    b.p.copy(from);
    b.v.set((tx - from.x) / T, (ty - from.y) / T + 0.5 * G * T, (tz - from.z) / T);
    b.obj.position.copy(from);
    b.obj.visible = true;
    if (b.mesh) b.mesh.material = (ghost ? this.ghostBallMaterial : this.ballMaterial) ?? b.mesh.material;
  }

  private updateBalls(dt: number) {
    const steps = dt > 0.02 ? 2 : 1;
    const h = dt / steps;
    for (const b of this.balls) {
      if (!b.active) continue;
      b.age += dt;
      for (let s = 0; s < steps && b.active; s++) {
        b.v.y -= G * h;
        b.p.addScaledVector(b.v, h);
        this.ballCollide(b);
      }
      if (!b.active) continue;
      if (b.age > 6) {
        this.killBall(b);
        continue;
      }
      b.obj.position.copy(b.p);
      b.trailT -= dt;
      if (b.trailT <= 0) {
        b.trailT = 0.03;
        if (b.ghost) this.glow.spawn(b.p.x, b.p.y, b.p.z, 0, 0.4, 0, { color: "#4dffae", size: 1.1, grow: 0.3, life: 0.45, alpha: 0.8 });
        else this.smoke.spawn(b.p.x, b.p.y, b.p.z, 0, 0.3, 0, { color: "#e8e4dc", size: 0.45, grow: 1.3, life: 0.55, alpha: 0.3 });
      }
    }
  }

  private ballCollide(b: Ball) {
    const { p } = b;
    if (this.net) {
      // Online: each player decides the hits on their own ship; hits on others are only for show.
      const pl = this.player;
      if (b.owner !== this.net.me && pl.alive && pl.contains(p.x, p.y, p.z)) {
        this.killBall(b);
        if (this.invulnT > 0) this.splinters(p, 0.6);
        else this.damagePlayer(b.damage, p, b.owner);
        return;
      }
      for (const r of this.remotes.values()) {
        if (r.id === b.owner || !r.ship.alive || !r.ship.root.visible || !r.ship.contains(p.x, p.y, p.z)) continue;
        this.killBall(b);
        this.splinters(p, 1);
        r.ship.hitFlash = 1;
        this.sfx.hit(this.near(p.x, p.z));
        return;
      }
    } else if (b.hostile) {
      const pl = this.player;
      if (pl.alive && pl.contains(p.x, p.y, p.z)) {
        this.killBall(b);
        this.damagePlayer(b.damage, p);
        return;
      }
    } else {
      for (const e of this.enemies) {
        if (!e.alive || !e.contains(p.x, p.y, p.z)) continue;
        this.killBall(b);
        this.damageShip(e, b.damage, p);
        return;
      }
      for (const f of this.forts) {
        if (f.down) continue;
        const towerHit = Math.hypot(p.x - f.x, p.z - f.z) < 2.6 && p.y < f.height + 0.5;
        const gunHit = Math.hypot(p.x - f.gx, p.z - f.gz) < 1.8 && p.y < 3;
        if (!towerHit && !gunHit) continue;
        this.killBall(b);
        this.damageFort(f, b.damage, p);
        return;
      }
    }
    for (const s of this.world?.shoals ?? []) {
      // Balls fly over beaches and palms, and stop on the sand (or a reef's rocks).
      if (p.y < (s.r > 6 ? 1.4 : s.top * 0.8) && Math.hypot(p.x - s.x, p.z - s.z) < s.r * 0.85) {
        this.killBall(b);
        this.smoke.burst(p, 10, 3, 4, { color: "#e9c99a", size: 0.9, grow: 2.4, life: 1.1, gravity: 4, drag: 1.5, alpha: 0.7 });
        this.sfx.hit(this.near(p.x, p.z) * 0.6);
        return;
      }
    }
    const water = waveHeight(p.x, p.z);
    if (p.y < water) {
      this.killBall(b);
      this.splash(p.x, water, p.z, b.ghost);
    }
  }

  private killBall(b: Ball) {
    b.active = false;
    b.obj.visible = false;
  }

  private damageShip(e: Ship, amount: number, at: THREE.Vector3) {
    e.hp -= amount;
    e.hitFlash = 1;
    e.lastHit = this.runTime;
    this.splinters(at, 1);
    this.sfx.hit(this.near(at.x, at.z), e.kind === "ghost");
    if (e.hp <= 0) {
      e.hp = 0;
      this.sinkShip(e);
    }
  }

  private sinkShip(s: Ship) {
    s.sinkT = 0;
    s.aimT = -1;
    s.listSide = Math.random() < 0.5 ? 1 : -1;
    s.sail = 0;
    const near = s === this.player ? 1 : this.near(s.x, s.z);
    this.sfx.explode(near);
    this.sfx.sink(near);
    const at = this.v1.set(s.x, s.y + 2.5 * s.scale, s.z);
    this.glow.burst(at, 26, 7, 6, { color: s.kind === "ghost" ? "#5dffb8" : "#ffa040", size: 2.2, grow: 0.5, life: 0.7, gravity: 3, drag: 2, alpha: 1, spread: 3 });
    this.smoke.burst(at, 22, 4, 5, { color: "#4a4440", size: 2.5, grow: 8, life: 3.2, gravity: -1.5, drag: 1.4, alpha: 0.65, spread: 3 });
    this.splinters(at, 2.2);
    if (s === this.player || this.mode === "online") return;
    this.sunk++;
    if (this.mode === "trade") {
      this.pirateDown(s);
      return;
    }
    this.addGold(s.stats.bounty, s.x, s.y + 9 * s.scale, s.z);
    const boss = s.kind === "ghost";
    for (let i = 0; i < s.stats.loot; i++) {
      const r = Math.random();
      const kind: LootKind = boss ? (r < 0.6 ? "chest" : r < 0.8 ? "bottles" : "barrel") : r < 0.34 ? "barrel" : r < 0.62 ? "crate" : r < 0.8 ? "bottles" : "chest";
      const a = rand(0, TAU);
      this.spawnLoot(kind, s.x + Math.sin(a) * rand(1, 4), s.z + Math.cos(a) * rand(1, 4), Math.sin(a) * rand(2, 4.5), Math.cos(a) * rand(2, 4.5));
    }
    if (boss) this.showBanner("The Drowned Queen is sunk!", "Her treasure floats free — grab it", "good", 4);
  }

  // --- Forts --------------------------------------------------------------------------------------

  private updateForts(dt: number) {
    const p = this.player;
    for (const f of this.forts) {
      if (f.down || this.wave < 2 || !p.alive) {
        f.aimT = -1;
        continue;
      }
      const dx = p.x - f.gx;
      const dz = p.z - f.gz;
      const d = Math.hypot(dx, dz);
      f.reload -= dt;
      if (d > FORT_RANGE) {
        f.aimT = -1;
        continue;
      }
      f.gunYaw = dampAngle(f.gunYaw, Math.atan2(dx, dz), 2.5, dt);
      f.gun.rotation.y = f.gunYaw;
      if (f.aimT >= 0) {
        f.aimT -= dt;
        if (Math.random() < dt * 25) this.glow.spawn(f.gx, 2.2, f.gz, rand(-1, 1), rand(1, 3), rand(-1, 1), { color: "#ffb347", size: 0.8, grow: 0.2, life: 0.35, gravity: 6 });
        if (f.aimT < 0) this.fortFire(f);
      } else if (f.reload <= 0) {
        f.aimT = 1.1;
        this.sfx.fuse(this.near(f.x, f.z));
      }
    }
  }

  private fortFire(f: Fort) {
    const p = this.player;
    f.reload = 4.8 - Math.min(1.6, this.wave * 0.09);
    const count = this.wave >= 7 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(p.x - f.gx, p.z - f.gz);
      const T = 0.7 + d / 55;
      const lead = rand(0.6, 1.05);
      const tx = p.x + p.fx * p.speed * T * lead + gauss() * 2.6;
      const tz = p.z + p.fz * p.speed * T * lead + gauss() * 2.6;
      this.shots.push({ t: i * 0.35, ship: null, fort: f, side: 1, i: 0, n: 1, tx, ty: 0, tz, T, hostile: true, damage: 7 + this.wave * 0.3, ghost: false, quiet: false });
    }
  }

  private damageFort(f: Fort, amount: number, at: THREE.Vector3) {
    f.hp -= amount;
    this.smoke.burst(at, 10, 4, 4, { color: "#c9ccd6", size: 0.8, grow: 2.5, life: 1.2, gravity: 6, drag: 1, alpha: 0.8 });
    this.sfx.hit(this.near(at.x, at.z) * 0.8, true);
    if (f.hp > 0) return;
    f.down = true;
    f.downWave = this.wave;
    f.fallT = 0;
    f.aimT = -1;
    this.fortsDown++;
    this.sfx.explode(this.near(f.x, f.z));
    this.glow.burst(this.v1.set(f.x, f.height * 0.6, f.z), 30, 7, 7, { color: "#ffa040", size: 2.4, grow: 0.5, life: 0.8, gravity: 3, drag: 2, spread: 3 });
    this.smoke.burst(this.v1, 26, 4, 5, { color: "#7b7670", size: 3, grow: 9, life: 3.5, gravity: -1.4, drag: 1.3, alpha: 0.6, spread: 4 });
    this.addGold(50, f.x, f.height + 2, f.z);
    // Supplies spill into the sea on the side facing the cove.
    const shoal = this.world?.shoals.find((s) => Math.hypot(s.x - f.x, s.z - f.z) < s.r);
    if (shoal) {
      const a = Math.atan2(this.player.x - shoal.x, this.player.z - shoal.z);
      for (let i = 0; i < 3; i++) {
        const b = a + rand(-0.5, 0.5);
        const r = shoal.r + 3 + rand(0, 3);
        this.spawnLoot(i === 0 ? "chest" : Math.random() < 0.5 ? "barrel" : "crate", shoal.x + Math.sin(b) * r, shoal.z + Math.cos(b) * r, Math.sin(b), Math.cos(b));
      }
    }
    this.showBanner("Fort destroyed!", "+50 gold bounty", "good", 2.5);
  }

  private rebuildFort(f: Fort) {
    f.down = false;
    f.hp = f.maxHp = 90 + this.wave * 6;
    f.fallT = 0;
    f.reload = rand(2, 4);
    f.aimT = -1;
    f.tower.position.y = 0.85;
    f.tower.rotation.set(0, f.site.yaw + Math.PI, 0);
    f.gun.position.y = 0.9;
    f.gun.rotation.set(0, f.gunYaw, 0);
  }

  private fortVisual(f: Fort, dt: number) {
    if (!f.down) return;
    f.fallT += dt;
    const k = Math.min(1, f.fallT / 2.4);
    const e = k * k;
    f.tower.position.y = 0.85 - e * (f.height - 0.85) * 0.62;
    f.tower.rotation.set(e * 0.22, f.site.yaw + Math.PI, e * 0.3);
    f.gun.rotation.set(e * 0.9, f.gunYaw, e * 0.5);
    f.gun.position.y = 0.9 - e * 0.5;
    if (f.fallT < 12 && Math.random() < dt * (f.fallT < 3 ? 25 : 5)) {
      this.smoke.spawn(f.x + rand(-1.5, 1.5), 2 + f.height * 0.35 * (1 - e), f.z + rand(-1.5, 1.5), rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4), {
        color: "#5a5550",
        size: 2,
        grow: 6,
        life: 3,
        alpha: 0.5,
        gravity: -0.3,
      });
    }
  }

  // --- Loot ---------------------------------------------------------------------------------------

  private spawnLoot(kind: LootKind, x: number, z: number, vx: number, vz: number, extra: Pick<Loot, "good" | "qty" | "contract" | "keep"> = {}) {
    const proto = this.protos.get(LOOT_KEYS[kind]);
    if (!proto) return;
    const obj = this.lootPool.get(kind)?.pop() ?? proto.object.clone();
    const scale = LOOT_SCALE[kind] ?? 1;
    obj.visible = true;
    obj.scale.setScalar(scale);
    this.scene.add(obj);
    this.loot.push({ kind, obj, x, z, vx, vz, age: 0, phase: rand(0, TAU), yaw: rand(0, TAU), spin: rand(-0.6, 0.6), taken: -1, size: proto.size.y * scale, scale, ...extra });
  }

  private releaseLoot(l: Loot) {
    this.scene.remove(l.obj);
    let list = this.lootPool.get(l.kind);
    if (!list) this.lootPool.set(l.kind, (list = []));
    list.push(l.obj);
  }

  private updateLoot(dt: number) {
    const p = this.player;
    this.loot = this.loot.filter((l) => {
      l.age += dt;
      if (l.taken >= 0) {
        l.taken += dt;
        const k = l.taken / 0.35;
        l.obj.scale.setScalar(Math.max(0.01, (1 - k) * (1 + k)) * l.scale);
        l.obj.position.y += dt * 5;
        if (k < 1) return true;
        this.releaseLoot(l);
        return false;
      }
      const drag = Math.exp(-0.7 * dt);
      l.vx *= drag;
      l.vz *= drag;
      if (p.alive) {
        const dx = p.x - l.x;
        const dz = p.z - l.z;
        const d = Math.hypot(dx, dz);
        if (d < 11) {
          const pull = (1 - d / 11) * 9 + 2;
          l.x += (dx / d) * pull * dt;
          l.z += (dz / d) * pull * dt;
        }
        if ((d < p.beam * 0.5 + 2.6 || p.contains(l.x, p.y + 0.5, l.z, 1.4)) && this.collect(l)) return true;
      }
      l.x += l.vx * dt;
      l.z += l.vz * dt;
      this.poseLoot(l, dt);
      // Sparkles so loot is easy to spot on the water.
      if (Math.random() < dt * 5) {
        const gold = l.kind === "crate" || l.kind === "chest";
        this.glow.spawn(l.x + rand(-0.8, 0.8), l.obj.position.y + l.size + rand(0, 0.8), l.z + rand(-0.8, 0.8), 0, rand(0.8, 1.6), 0, {
          color: gold ? "#ffd34d" : "#86efac",
          size: 0.9,
          grow: 0.1,
          life: 0.9,
          alpha: 0.9,
        });
      }
      if (l.keep) return true;
      if (l.age > 50) {
        this.releaseLoot(l);
        return false;
      }
      l.obj.visible = l.age < 42 || Math.floor(l.age * 6) % 2 === 0;
      return true;
    });
  }

  private poseLoot(l: Loot, dt: number) {
    if (l.taken >= 0) return;
    l.yaw += l.spin * dt;
    const t = this.elapsed;
    l.obj.position.set(l.x, waveHeight(l.x, l.z) - l.size * 0.38, l.z);
    l.obj.rotation.set(Math.sin(t * 1.7 + l.phase) * 0.18, l.yaw, Math.cos(t * 1.3 + l.phase) * 0.2);
  }

  /** Sailing through floating loot. False when it can't be taken (a full hold). */
  private collect(l: Loot): boolean {
    if (this.trade) return this.collectTrade(l);
    l.taken = 0;
    const p = this.player;
    const at = this.v1.set(l.x, waveHeight(l.x, l.z) + 1, l.z);
    if (l.kind === "barrel" || l.kind === "bottles") {
      const amount = l.kind === "barrel" ? 10 : 18;
      const healed = Math.min(amount, p.maxHp - p.hp);
      p.hp = Math.min(p.maxHp, p.hp + amount);
      this.text(healed > 0 ? `+${Math.round(healed)} hull` : "Hull full", "#86efac", at.x, at.y + 2, at.z);
      this.sfx.repair();
      this.glow.burst(at, 14, 3, 4, { color: "#7dffa0", size: 0.9, grow: 0.2, life: 0.7, gravity: -1, drag: 2 });
    } else {
      const amount = l.kind === "chest" ? 30 : 12;
      this.addGold(amount, at.x, at.y + 2, at.z);
      this.sfx.coin(l.kind === "chest");
      this.glow.burst(at, l.kind === "chest" ? 24 : 12, 3.5, 5, { color: "#ffd34d", size: 0.9, grow: 0.2, life: 0.8, gravity: 3, drag: 1.5 });
    }
    this.emitHud(true);
    return true;
  }

  private addGold(amount: number, x: number, y: number, z: number) {
    const value = Math.round(amount * this.goldMul());
    if (this.trade) this.trade.earn(value);
    else {
      this.gold += value;
      this.totalGold += value;
    }
    this.text(`+${value.toLocaleString("en-US")} gold`, "#fcd34d", x, y, z, value >= 50);
  }

  // --- Collisions ---------------------------------------------------------------------------------

  private collide() {
    const remotes = [...this.remotes.values()].map((r) => r.ship).filter((s) => s.root.visible);
    const ships = [this.player, ...this.enemies, ...this.traffic.map((t) => t.ship), ...remotes].filter((s) => s.alive);
    const shoals = this.world?.shoals ?? [];
    const trade = this.mode === "trade";
    for (const s of ships) {
      const c = s.circles(this.circleBuf);
      const r = s.radius * 0.9;
      const reach = s.length * 0.3 + r + 2;
      for (let k = 0; k < 3; k++) {
        for (const sh of shoals) {
          if (Math.abs(s.x - sh.x) > sh.r + reach || Math.abs(s.z - sh.z) > sh.r + reach) continue;
          const dx = c[k * 2] - sh.x;
          const dz = c[k * 2 + 1] - sh.z;
          const d = Math.hypot(dx, dz) || 1;
          const min = sh.r + r;
          if (d >= min) continue;
          const push = min - d;
          const nx = dx / d;
          const nz = dz / d;
          s.x += nx * push;
          s.z += nz * push;
          c[k * 2] += nx * push;
          c[k * 2 + 1] += nz * push;
          const into = -(s.fx * nx + s.fz * nz);
          if (s.bumpCd <= 0 && s.speed > 1.5 && into > 0.15) {
            s.bumpCd = 0.9;
            const hitSpeed = s.speed * into;
            s.speed *= 0.35;
            const at = this.v1.set(c[k * 2] - nx * r, 0.6, c[k * 2 + 1] - nz * r);
            this.smoke.burst(at, 12, 3, 3, { color: "#e9d3a8", size: 1, grow: 3, life: 1.2, gravity: 3, drag: 1.5, alpha: 0.7 });
            if (s === this.player) {
              this.sfx.bump();
              this.damagePlayer(2 + hitSpeed * 0.6, null);
              this.shake = Math.max(this.shake, 0.5);
            }
          }
        }
      }
      if (trade) {
        const lim = BOUNDS + 10;
        if (Math.abs(s.x) > lim || Math.abs(s.z) > lim) {
          s.x = clamp(s.x, -lim, lim);
          s.z = clamp(s.z, -lim, lim);
          s.speed *= 0.97;
        }
      } else {
        const rr = Math.hypot(s.x, s.z);
        if (rr > ARENA + 10) {
          s.x *= (ARENA + 10) / rr;
          s.z *= (ARENA + 10) / rr;
          s.speed *= 0.97;
        }
      }
    }
    // Ship against ship: push apart, ramming hurts both.
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i];
        const b = ships[j];
        if (Math.abs(a.x - b.x) > 20 || Math.abs(a.z - b.z) > 20) continue;
        const ca = a.circles(this.circleBuf);
        const cb = b.circles(this.circleBuf2);
        const min = a.radius + b.radius;
        let hit = false;
        for (let k = 0; k < 3 && !hit; k++) {
          for (let l = 0; l < 3 && !hit; l++) {
            const dx = ca[k * 2] - cb[l * 2];
            const dz = ca[k * 2 + 1] - cb[l * 2 + 1];
            const d = Math.hypot(dx, dz) || 1;
            if (d >= min) continue;
            hit = true;
            const push = (min - d) * 0.5;
            a.x += (dx / d) * push;
            a.z += (dz / d) * push;
            b.x -= (dx / d) * push;
            b.z -= (dz / d) * push;
            const rel = Math.hypot(a.fx * a.speed - b.fx * b.speed, a.fz * a.speed - b.fz * b.speed);
            // Merchant traffic just bumps and slows.
            const friendly = this.traffic.some((t) => t.ship === a || t.ship === b) || remotes.includes(a) || remotes.includes(b);
            if (friendly && rel > 3 && a.bumpCd <= 0 && b.bumpCd <= 0) {
              a.bumpCd = b.bumpCd = 1;
              a.speed *= 0.6;
              b.speed *= 0.6;
              if (a === this.player || b === this.player) this.sfx.bump();
            } else if (rel > 3 && a.bumpCd <= 0 && b.bumpCd <= 0) {
              a.bumpCd = b.bumpCd = 1;
              const dmg = 2 + rel * 0.7;
              a.speed *= 0.5;
              b.speed *= 0.5;
              const at = this.v1.set((ca[k * 2] + cb[l * 2]) / 2, 1.5, (ca[k * 2 + 1] + cb[l * 2 + 1]) / 2);
              this.splinters(at, 1.2);
              for (const s of [a, b]) {
                if (s === this.player) {
                  this.sfx.bump();
                  this.damagePlayer(dmg, null);
                } else this.damageShip(s, dmg * 1.5, at);
              }
            }
          }
        }
      }
    }
  }

  // --- Effects ------------------------------------------------------------------------------------

  private near(x: number, z: number) {
    return clamp(1 - Math.hypot(x - this.player.x, z - this.player.z) / 170, 0, 1);
  }

  private muzzleFx(m: THREE.Vector3, dx: number, dz: number, ghost: boolean) {
    this.glow.burst(m, 4, 2, 0.5, { color: ghost ? "#5dffb8" : "#ffb04a", size: 2.4, grow: 0.8, life: 0.14, alpha: 1, spread: 0.4 }, this.v3.set(dx * 4, 0.2, dz * 4), 0.3);
    for (let i = 0; i < 8; i++) {
      const s = rand(2.5, 10);
      this.smoke.spawn(m.x + dx * 0.6, m.y, m.z + dz * 0.6, dx * s + rand(-0.8, 0.8), rand(0.2, 1.4), dz * s + rand(-0.8, 0.8), {
        color: ghost ? "#a9d8c4" : "#ece8e0",
        size: 1.4,
        grow: rand(5.5, 8),
        life: rand(1.8, 2.9),
        alpha: 0.62,
        drag: 2.2,
        gravity: -0.5,
      });
    }
  }

  private splash(x: number, y: number, z: number, ghost: boolean) {
    const at = this.v2.set(x, y, z);
    this.smoke.burst(at, 16, 2.2, 10, { color: ghost ? "#c4ffe6" : "#f0f8ff", size: 0.65, grow: 1.1, life: 0.95, gravity: 22, alpha: 0.95, spread: 0.6 });
    this.smoke.burst(at, 5, 1.2, 1.5, { color: "#e8f4fb", size: 1.6, grow: 3.8, life: 1.3, alpha: 0.45, drag: 1.5, spread: 0.8 });
    this.rings.spawn(x, z, { r0: 0.6, r1: 4.8, life: 1.3, alpha: 0.75 });
    this.sfx.splash(this.near(x, z));
  }

  private splinters(at: THREE.Vector3, power: number) {
    this.smoke.burst(at, Math.round(14 * power), 6 * power, 7, { color: "#8a5634", size: 0.42, grow: 0.3, life: 1, gravity: 20, alpha: 1, spread: 0.6 });
    this.smoke.burst(at, Math.round(6 * power), 4 * power, 6, { color: "#d9a066", size: 0.32, grow: 0.25, life: 0.9, gravity: 20, alpha: 1, spread: 0.6 });
    this.glow.burst(at, 3, 1, 1, { color: "#ffb04a", size: 2.2, grow: 0.8, life: 0.15, alpha: 0.9, spread: 0.4 });
    this.smoke.burst(at, 4, 1.5, 2, { color: "#5a524c", size: 1.2, grow: 4, life: 1.6, alpha: 0.5, drag: 1.5, gravity: -1 });
  }

  /** Per-ship ambient effects: bow spray, damage smoke, sinking bubbles, wake. */
  private shipFx(s: Ship, dt: number) {
    const sternX = s.x - s.fx * s.length * 0.46;
    const sternZ = s.z - s.fz * s.length * 0.46;
    const strength = s.sinkT >= 0 ? Math.max(0, 1 - s.sinkT / 2) : clamp((s.speed - 0.8) / 7, 0, 1);
    s.wake.update(dt, sternX, sternZ, strength, s.beam * 0.7);
    if (this.phase === "menu" && s !== this.player) return;
    if (s.alive && s.speed > 3.5) {
      s.sprayT -= dt * s.speed;
      while (s.sprayT <= 0) {
        s.sprayT += 3.2;
        const side = Math.random() < 0.5 ? 1 : -1;
        const bx = s.x + s.fx * s.length * 0.44 + s.sideX(side) * 0.6;
        const bz = s.z + s.fz * s.length * 0.44 + s.sideZ(side) * 0.6;
        const out = rand(1.5, 3.5);
        this.smoke.spawn(bx, waveHeight(bx, bz) + 0.2, bz, s.sideX(side) * out + s.fx * s.speed * 0.3, rand(1.5, 3), s.sideZ(side) * out + s.fz * s.speed * 0.3, {
          color: "#f4fbff",
          size: 0.6,
          grow: 1.6,
          life: 0.7,
          gravity: 9,
          alpha: 0.75,
        });
      }
    }
    const hurt = s.alive && s.hp < s.maxHp * 0.4;
    if (hurt || (s.sinkT >= 0 && s.sinkT < 4)) {
      s.smokeT -= dt;
      if (s.smokeT <= 0) {
        s.smokeT = hurt ? 0.11 : 0.05;
        const along = rand(-0.3, 0.3) * s.length;
        const x = s.x + s.fx * along;
        const z = s.z + s.fz * along;
        this.smoke.spawn(x, s.y + 2.5 * s.scale, z, rand(-0.3, 0.3) + this.wind.x * 1.5, rand(1.8, 3), rand(-0.3, 0.3) + this.wind.z * 1.5, {
          color: s.kind === "ghost" ? "#3f6d5c" : "#3b3633",
          size: 1.4,
          grow: 6,
          life: 2.6,
          alpha: 0.55,
          drag: 0.4,
        });
        if (Math.random() < 0.35) this.glow.spawn(x, s.y + 2.2 * s.scale, z, rand(-0.5, 0.5), rand(1, 2.5), rand(-0.5, 0.5), { color: "#ff8a3a", size: 1.1, grow: 0.3, life: 0.5, gravity: -1 });
      }
    }
    if (s.sinkT >= 0 && s.sinkT < 7) {
      for (let i = 0; i < 2; i++) {
        const along = rand(-0.45, 0.45) * s.length;
        const x = s.x + s.fx * along + rand(-1.5, 1.5);
        const z = s.z + s.fz * along + rand(-1.5, 1.5);
        this.smoke.spawn(x, waveHeight(x, z) + 0.1, z, rand(-0.3, 0.3), rand(0.8, 2.5), rand(-0.3, 0.3), { color: "#eaf6ff", size: 0.4, grow: 0.9, life: 0.7, alpha: 0.85, gravity: -1 });
      }
    }
  }

  private text(text: string, color: string, x: number, y: number, z: number, big = false) {
    this.texts.push({ text, color, x, y, z, age: 0, life: big ? 2 : 1.5, big });
    if (this.texts.length > 14) this.texts.shift();
  }

  private updateTexts(dt: number) {
    this.texts = this.texts.filter((t) => {
      t.age += dt;
      t.y += dt * 2.2;
      return t.age < t.life;
    });
  }

  private showBanner(title: string, sub: string, tone: Banner["tone"], seconds: number) {
    this.banner = { id: ++this.bannerId, title, sub, tone };
    this.bannerT = seconds;
    this.emitHud(true);
  }

  // --- Online battles -----------------------------------------------------------------------------

  /** Starts (or restarts) an online round in the cove. */
  startOnline(setup: OnlineSetup) {
    audio.unlock();
    this.career = null;
    this.net = setup;
    this.useWorld("online");
    this.resetRun();
    this.setOnlinePeers(setup.peers);
    this.respawn(true);
    this.invulnT = Math.max(0, (setup.start - setup.now()) / 1000) + 3;
    this.startShown = false;
    this.camSnap = true;
    music.play(SEA_SHANTY, 1);
    music.duck(false);
    this.setPhase("playing");
    const wait = Math.ceil((setup.start - setup.now()) / 1000);
    this.showBanner(wait > 0 ? "Get ready!" : "Battle on!", wait > 0 ? "Cannons are cold until the start" : `First to ${setup.goal} sinks wins`, "info", Math.max(2.5, wait));
  }

  /** Leaves the battle: back to the title screen's cove. */
  stopOnline() {
    if (!this.net) return;
    this.net = null;
    this.useWorld("waves");
    this.resetRun();
    this.camSnap = true;
    music.setIntensity(0);
    this.setPhase("menu");
  }

  get onlineActive() {
    return !!this.net;
  }

  /** Everyone's score now: yours, and the others' as their ships report them. */
  onlineResults() {
    const net = this.net;
    if (!net) return [];
    return [{ id: net.me, name: net.name, k: this.kills, d: this.deaths }, ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, k: r.k, d: r.d }))].sort((a, b) => b.k - a.k || a.d - b.d);
  }

  /** The players in the room changed (joined, left, picked another ship). */
  setOnlinePeers(peers: OnlinePeer[]) {
    const net = this.net;
    if (!net) return;
    const ids = new Set(peers.map((p) => p.id));
    for (const [id, r] of this.remotes) {
      if (ids.has(id)) continue;
      this.releaseRemote(r);
      this.remotes.delete(id);
      this.addFeed(`${r.name} left`);
    }
    for (const peer of peers) {
      if (peer.id === net.me) continue;
      const cls = Math.min(ONLINE_SHIPS.length - 1, Math.max(0, peer.ship | 0));
      const cur = this.remotes.get(peer.id);
      if (cur && cur.cls === cls) {
        cur.name = peer.name;
        cur.color = peer.color;
        continue;
      }
      if (cur) this.releaseRemote(cur);
      else if (this.phase === "playing") this.addFeed(`${peer.name} joined`);
      const ship = this.takeRemote(cls);
      ship.root.visible = false;
      this.remotes.set(peer.id, { id: peer.id, name: peer.name, color: peer.color, cls, ship, buf: [], k: cur?.k ?? 0, d: cur?.d ?? 0, sunkAt: 0 });
    }
  }

  /** A position report from another player: [time, x, z, heading, speed, sail, hull, max hull, afloat, sinks, sunk, ship]. */
  onlineState(id: string, a: number[]) {
    const r = this.remotes.get(id);
    if (!r || a.length < 11) return;
    const snap: Snap = { t: a[0], x: a[1], z: a[2], h: a[3], s: a[4], sl: a[5], hp: a[6], mx: a[7], al: a[8] === 1, k: a[9], d: a[10] };
    if (r.buf.length && snap.t <= r.buf[r.buf.length - 1].t) return;
    r.buf.push(snap);
    if (r.buf.length > 30) r.buf.shift();
    r.k = snap.k;
    r.d = snap.d;
  }

  onlineEvent(id: string, e: NetEvent) {
    const r = this.remotes.get(id);
    const net = this.net;
    if (!r || !net) return;
    if (e.k === "f") {
      // Their broadside, replayed from their ship as we see it.
      e.sh.slice(0, 12).forEach(([tx, ty, tz, T, t], i) => {
        this.shots.push({ t: t ?? i * 0.08, ship: r.ship, fort: null, side: e.sd, i, n: e.n, tx, ty: ty ?? 0, tz, T, hostile: true, damage: Math.min(20, e.dmg || 10), ghost: false, quiet: i > 1, owner: id });
      });
    } else if (e.k === "s") {
      r.sunkAt = net.now();
      if (r.ship.alive && r.ship.root.visible) {
        r.ship.hp = 0;
        this.sinkShip(r.ship);
      }
      if (e.by === net.me) {
        this.kills++;
        this.addFeed(`You sank ${r.name}!`);
        this.text("Sunk!", "#fcd34d", r.ship.x, r.ship.y + 10, r.ship.z, true);
        this.queueBanner(`You sank ${r.name}!`, `${this.kills} of ${net.goal} sinks`, "good", 2.4);
        this.sfx.waveClear();
      } else {
        const killer = e.by ? this.remotes.get(e.by)?.name : null;
        this.addFeed(killer ? `${killer} sank ${r.name}` : `${r.name} sank`);
      }
    }
  }

  private takeRemote(cls: number) {
    const def = ONLINE_SHIPS[cls];
    const ship = this.remotePool.get(def.model)?.pop() ?? new Ship("sloop", { ...PLAYER_STATS }, this.wakeMaterial);
    if (!ship.model) {
      ship.setModel(this.protos.get(def.model) ?? this.protos.get(SHIPS.playerSmall)!, 1);
      ship.setDeckGuns(this.protos.get(ARMS.cannon), this.deckSlots(def.model), def.guns);
    }
    ship.pool = def.model;
    ship.stats = { ...PLAYER_STATS, hp: def.hull, guns: def.guns, speed: def.speed, turn: def.turn };
    ship.maxHp = ship.hp = def.hull;
    ship.sinkT = -1;
    this.scene.add(ship.root, ship.wake.mesh);
    return ship;
  }

  private releaseRemote(r: Remote) {
    this.scene.remove(r.ship.root, r.ship.wake.mesh);
    r.ship.wake.reset();
    let list = this.remotePool.get(r.ship.pool);
    if (!list) this.remotePool.set(r.ship.pool, (list = []));
    list.push(r.ship);
  }

  private applyOnlineShip() {
    const def = this.onlineShip;
    if (!def) return;
    const p = this.player;
    p.stats = { ...PLAYER_STATS, name: def.name, hp: def.hull, speed: def.speed, turn: def.turn, guns: def.guns, reload: def.reload };
    p.setModel(this.protos.get(def.model) ?? this.protos.get(SHIPS.playerSmall)!, 1);
    this.mountGuns();
  }

  /** Back on the water at the spawn point furthest from everyone else. */
  private respawn(first = false) {
    const p = this.player;
    let best = { x: 0, z: 0, d: -1 };
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + (first ? rand(0, 0.5) : 0);
      const x = Math.sin(a) * 150;
      const z = Math.cos(a) * 150;
      if ((this.world?.shoals ?? []).some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 14)) continue;
      let d = Infinity;
      for (const r of this.remotes.values()) if (r.ship.root.visible) d = Math.min(d, Math.hypot(r.ship.x - x, r.ship.z - z));
      if (d === Infinity) d = rand(0, 100);
      if (d > best.d) best = { x, z, d };
    }
    p.reset(best.x, best.z, Math.atan2(-best.x, -best.z));
    p.maxHp = p.hp = this.maxHull();
    p.sail = 2;
    p.sailVis = 2 / 3;
    p.speed = 4;
    p.lastHit = -10;
    this.lastBy = null;
    this.invulnT = 3;
    this.camSnap = true;
  }

  private addFeed(text: string) {
    this.feed.push({ id: ++this.feedId, text, t: this.elapsed });
    if (this.feed.length > 4) this.feed.shift();
    this.emitHud(true);
  }

  private sendState() {
    const net = this.net;
    if (!net) return;
    const p = this.player;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    net.send([Math.round(net.now()), r1(p.x), r1(p.z), Math.round(p.heading * 1000) / 1000, r1(p.speed), p.sail, Math.ceil(p.hp), p.maxHp, p.alive ? 1 : 0, this.kills, this.deaths, net.ship]);
  }

  private updateOnline(dt: number) {
    const net = this.net!;
    const p = this.player;
    this.invulnT = Math.max(0, this.invulnT - dt);
    if (!this.startShown && net.now() >= net.start) {
      this.startShown = true;
      this.queueBanner("Battle on!", `First to ${net.goal} sinks wins`, "boss", 2.5);
      this.sfx.boss();
    }
    if (!p.alive) {
      p.sinkT += dt;
      this.respawnT -= dt;
      if (this.respawnT <= 0 && p.sinkT > 2) this.respawn();
    }
    // Others' ships glide between their reports, a moment in the past.
    const t = net.now() - 140;
    for (const r of this.remotes.values()) {
      const buf = r.buf;
      const s = r.ship;
      if (!buf.length) continue;
      let a = buf[0];
      let b = buf[0];
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i].t <= t) {
          a = buf[i];
          b = buf[i + 1] ?? buf[i];
          break;
        }
      }
      while (buf.length > 3 && buf[1].t < t - 500) buf.shift();
      const newest = buf[buf.length - 1];
      // Back afloat after a sinking (or seen for the first time): jump straight there.
      if (newest.al && newest.t > r.sunkAt + 1500 && (!s.alive || !s.root.visible)) {
        s.reset(newest.x, newest.z, newest.h);
        s.root.visible = true;
        s.sail = newest.sl;
        s.sailVis = newest.sl / 3;
        buf.splice(0, buf.length - 1);
        continue;
      }
      if (!newest.al && s.alive && s.root.visible) {
        // Sunk (in case the message about it went missing).
        r.sunkAt = Math.max(r.sunkAt, newest.t);
        s.hp = 0;
        this.sinkShip(s);
      }
      if (!s.alive) continue;
      const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
      let x = lerp(a.x, b.x, k);
      let z = lerp(a.z, b.z, k);
      const h = a.h + wrap(b.h - a.h) * k;
      if (t > newest.t) {
        // Late report: carry on a little along the last heading.
        const ahead = Math.min(0.35, (t - newest.t) / 1000);
        x = newest.x + Math.sin(newest.h) * newest.s * ahead;
        z = newest.z + Math.cos(newest.h) * newest.s * ahead;
      }
      s.yawRate = b.t > a.t ? (wrap(b.h - a.h) / (b.t - a.t)) * 1000 : 0;
      s.x = x;
      s.z = z;
      s.heading = h;
      s.speed = lerp(a.s, b.s, k);
      s.sail = b.sl;
      s.sailVis = damp(s.sailVis, s.sail / 3, 1.5, dt);
      s.hp = b.hp;
      s.maxHp = b.mx;
      s.steer = 0;
      const from = -(s.fx * this.wind.x + s.fz * this.wind.z);
      s.alpha = Math.acos(clamp(from, -1, 1));
    }
    // Invulnerable just after (re)spawning: the ship blinks.
    p.root.visible = this.invulnT <= 0 || Math.floor(this.elapsed * 8) % 2 === 0 || !p.alive;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.1;
      this.sendState();
    }
    if (this.feed.length && this.elapsed - this.feed[0].t > 7) {
      this.feed.shift();
      this.emitHud(true);
    }
    this.warn = Math.hypot(p.x, p.z) > ARENA - 14 && p.alive ? "Turn back — you're leaving the cove" : null;
  }

  private onlineHud(): OnlineHud {
    const net = this.net!;
    const now = net.now();
    const scores = [
      { id: net.me, name: net.name, color: PLAYER_COLORS[net.color % PLAYER_COLORS.length], k: this.kills, d: this.deaths, me: true },
      ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, color: PLAYER_COLORS[r.color % PLAYER_COLORS.length], k: r.k, d: r.d, me: false })),
    ].sort((a, b) => b.k - a.k || a.d - b.d);
    return {
      left: Math.max(0, Math.ceil((net.end - Math.max(now, net.start)) / 1000)),
      countdown: Math.max(0, Math.ceil((net.start - now) / 1000)),
      goal: net.goal,
      scores,
      feed: this.feed.map((f) => ({ id: f.id, text: f.text })),
      respawn: this.player.alive ? null : Math.max(0, Math.ceil(this.respawnT)),
    };
  }

  /** The ships to aim at: the other players online, the AI everywhere else. */
  private foes(): Ship[] {
    if (!this.net) return this.enemies;
    const out: Ship[] = [];
    for (const r of this.remotes.values()) if (r.ship.root.visible) out.push(r.ship);
    return out;
  }

  // --- Open Sea -----------------------------------------------------------------------------------

  /** Open Sea: start a new trading career (null) or continue a saved one. */
  startTrade(save: CareerSave | null) {
    audio.unlock();
    this.net = null;
    this.career = new Career(save);
    this.useWorld("trade");
    this.resetRun();
    this.events.offer(null);
    music.play(SEA_SHANTY, 1);
    music.setIntensity(1);
    music.duck(false);
    this.camSnap = true;
    const c = this.career;
    const p = this.player;
    const at = c.s.sea;
    if (at) {
      p.reset(at.x, at.z, at.h);
      p.sail = 2;
      p.sailVis = 2 / 3;
      p.speed = 3;
      this.lastX = p.x;
      this.lastZ = p.z;
      this.setPhase("playing");
      this.showBanner("Back at sea", zoneName(p.x, p.z), "info", 3);
    } else {
      this.moor(c.s.port);
      this.snapToBerth();

    }
  }

  get isTrade() {
    return this.mode === "trade";
  }

  /** Sail into a harbour's ring, then dock. */
  dock() {
    if (!this.trade || this.phase !== "playing" || !this.dockable) return;
    if (this.dockBlocked) {
      this.sfx.empty();
      return;
    }
    this.sfx.pick();
    this.moor(this.dockable.id);
  }

  setSail() {
    const c = this.career;
    if (this.phase !== "port" || !this.docked || !c) return;
    const p = this.player;
    const b = this.berth(this.docked);
    p.x = b.x;
    p.z = b.z;
    p.heading = b.h;
    p.speed = 3;
    p.sail = 2;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.docked = null;
    this.portNotices = [];
    this.events.port(null);
    this.saveT = 12;
    this.sfx.sail(true);
    this.setPhase("playing");
    this.save();
  }

  tradeBuy(g: GoodId, qty: number) {
    const c = this.career;
    const site = this.docked;
    if (!c || !site || this.phase !== "port") return;
    const n = c.buy(site.id, g, qty);
    if (n) this.sfx.coin();
    else this.sfx.empty();
    this.portAct(n > 0);
  }

  tradeSell(g: GoodId, qty: number) {
    const c = this.career;
    const site = this.docked;
    if (!c || !site || this.phase !== "port") return;
    const r = c.sell(site.id, g, qty);
    if (r.n) this.sfx.coin(r.income >= 500);
    else this.sfx.empty();
    this.portAct(r.n > 0);
  }

  acceptContract(id: string) {
    const c = this.career;
    const site = this.docked;
    if (!c || !site || this.phase !== "port") return;
    const ct = c.accept(site.id, id);
    if (ct) {
      this.sfx.pick();
      const tgt = this.contractTarget(ct);
      if (tgt && ct.to !== site.id) c.s.waypoint = { x: tgt.x, z: tgt.z, label: ct.kind === "bounty" ? ct.captain ?? "Bounty" : ct.kind === "salvage" ? "Wreck" : PORT[ct.to].name };
    } else this.sfx.empty();
    this.portAct(!!ct);
  }

  abandonContract(id: string) {
    const c = this.career;
    if (!c || this.phase !== "port") return;
    c.abandon(id);
    this.portAct(true);
  }

  buyShip(id: ShipId) {
    const c = this.career;
    const site = this.docked;
    if (!c || !site || this.phase !== "port") return;
    const ok = c.buyShip(id, site.id);
    if (ok) {
      this.applyTradeShip();
      this.sfx.waveClear();
    } else this.sfx.empty();
    this.portAct(ok);
  }

  switchShip(id: ShipId) {
    const c = this.career;
    if (!c || this.phase !== "port") return;
    const ok = c.switchShip(id);
    if (ok) {
      this.applyTradeShip();
      this.sfx.sail(true);
    } else this.sfx.empty();
    this.portAct(ok);
  }

  buyUpgrade(id: TradeUpgradeId) {
    const c = this.career;
    if (!c || this.phase !== "port") return;
    c.s.hull = clamp(this.player.hp / this.player.maxHp, 0.01, 1);
    const ok = c.buyUpgrade(id);
    if (ok) {
      this.applyTradeShip();
      this.sfx.repair();
    } else this.sfx.empty();
    this.portAct(ok);
  }

  portRepair() {
    const c = this.career;
    if (!c || this.phase !== "port") return;
    const ok = c.repair();
    if (ok) {
      this.player.hp = this.player.maxHp * c.s.hull;
      this.sfx.repair();
    } else this.sfx.empty();
    this.portAct(ok);
  }

  /** Auto-sail on / off (needs a course set on the chart). */
  setAutopilot(on: boolean) {
    const c = this.trade;
    const next = on && !!c?.s.waypoint && this.phase === "playing" && this.player.alive;
    if (next === this.autopilot) {
      if (on && !next) this.queueBanner("No course set", "Open the chart, pick a port and press Set course", "info", 3);
      return;
    }
    this.autopilot = next;
    this.tackSide = 0;
    if (next) {
      this.player.sail = 3;
      this.sfx.sail(true);
    } else if (on) this.queueBanner("No course set", "Open the chart, pick a port and press Set course", "info", 3);
    this.emitHud(true);
  }

  toggleAutopilot() {
    this.setAutopilot(!this.autopilot);
  }

  /** Steering for auto-sail: head for the course, tack when it lies upwind, steer round islands. */
  private autoSteer(dt: number) {
    const c = this.trade;
    const p = this.player;
    const wp = c?.s.waypoint;
    if (!wp) {
      this.setAutopilot(false);
      return 0;
    }
    const d = Math.hypot(wp.x - p.x, wp.z - p.z);
    let desired = Math.atan2(wp.x - p.x, wp.z - p.z);
    if (!p.steam) {
      const from = this.wind.angle + Math.PI;
      const rel = wrap(desired - from);
      // Short tacks close in, so it doesn't stall head to wind next to the harbour.
      const tack = d < 90 ? 0.95 : 0.82;
      this.tackT -= dt;
      if (Math.abs(rel) < tack) {
        // The course lies upwind: zig-zag, switching tack once the course has crossed to the other side.
        if (this.tackSide === 0) this.tackSide = rel >= 0 ? 1 : -1;
        else if (rel * this.tackSide < -0.22 && this.tackT <= 0) {
          this.tackSide = -this.tackSide as 1 | -1;
          this.tackT = d < 90 ? 3 : 6;
        }
        desired = from + this.tackSide * tack;
      } else this.tackSide = 0;
    }
    desired = this.avoid(p, desired);
    p.sail = d < 35 ? 2 : 3;
    return clamp(-wrap(desired - p.heading) * 1.8, -1, 1);
  }

  /** The sea chart (pauses the voyage when opened at sea). */
  openChart() {
    if (!this.trade || this.phase !== "playing") return;
    this.releaseInput();
    music.duck(true);
    this.setPhase("chart");
    this.save();
  }

  closeChart() {
    if (this.phase !== "chart") return;
    music.duck(false);
    this.setPhase("playing");
  }

  chart(): ChartView | null {
    const c = this.career;
    const sea = this.sea;
    if (!c || !sea || !this.trade) return null;
    const p = this.player;
    const targets: ChartView["targets"] = [];
    for (const ct of c.s.contracts) {
      const tgt = this.contractTarget(ct);
      if (!tgt) continue;
      const kind = ct.kind === "bounty" ? "bounty" : ct.kind === "salvage" && ct.loaded < ct.qty ? "salvage" : "port";
      targets.push({ x: tgt.x, z: tgt.z, label: contractText(ct).line, kind });
    }
    for (const id of c.s.maps) {
      const isl = sea.islands[id];
      if (isl) targets.push({ x: isl.x, z: isl.z, label: "Treasure", kind: "treasure" });
    }
    return {
      bounds: BOUNDS,
      islands: sea.islands.map((i) => ({ x: i.x, z: i.z, r: i.r, treasure: c.s.maps.includes(i.id) })),
      ports: PORTS.map((pt) => ({
        id: pt.id,
        name: pt.name,
        x: pt.x,
        z: pt.z,
        visited: c.visited.includes(pt.id),
        produces: pt.produces,
        wants: pt.wants,
        prices: c.pricesFor(pt.id),
        yard: pt.yard.length > 0,
        here: this.docked?.id === pt.id,
      })),
      player: { x: p.x, z: p.z, h: p.heading },
      targets,
      waypoint: c.s.waypoint,
      haunted: HAUNTED_SEA,
      time: c.time,
      live: c.level("spyglass") > 0,
    };
  }

  setWaypoint(w: { x: number; z: number; label: string } | null) {
    const c = this.career;
    if (!c) return;
    c.s.waypoint = w;
    if (!w) this.autopilot = false;
    this.emitHud(true);
    this.save();
  }

  /** Switches the captain's guide on the port screen off (or on). */
  setGuide(on: boolean) {
    const c = this.career;
    if (!c) return;
    c.s.guideOff = !on;
    this.portAct(true);
  }

  /** Sells every good in the hold that this port wants. */
  sellWanted() {
    const c = this.career;
    const site = this.docked;
    if (!c || !site || this.phase !== "port") return;
    let income = 0;
    for (const g of site.def.wants) income += c.sell(site.id, g, c.have(g)).income;
    if (income) this.sfx.coin(true);
    else this.sfx.empty();
    this.portAct(income > 0);
  }

  /** After a wreck: towed back to the last port. */
  recover() {
    const c = this.career;
    if (this.phase !== "wrecked" || !c) return;
    const p = this.player;
    p.reset(p.x, p.z, p.heading);
    this.applyTradeShip();
    this.moor(c.s.port);
    this.snapToBerth();
    music.setIntensity(1);
  }

  /** Port screen open: how many pixels it covers on the right, or at the bottom (the 3D picture slides away from it). */
  setShowcase(px: number, py = 0) {
    if (Math.abs(px - this.showcase) < 1 && Math.abs(py - this.showcaseY) < 1) return;
    this.showcase = px;
    this.showcaseY = py;
    this.resize();
  }

  private snapToBerth() {
    if (!this.docked) return;
    const p = this.player;
    const b = this.berth(this.docked);
    p.x = b.x;
    p.z = b.z;
    p.heading = b.h;
    p.sailVis = 0;
    this.camSnap = true;
  }

  /** Where a ship lies alongside a port's jetty (on its starboard side, bow out to sea). */
  private berth(site: PortSite) {
    const p = this.player;
    const L = p.length;
    const d = Math.max(site.r * 0.25 + L / 2 + 1, site.len - L / 2 - 1);
    const off = 2.4 + p.beam / 2;
    return { x: site.jx + Math.sin(site.h) * d - Math.cos(site.h) * off, z: site.jz + Math.cos(site.h) * d + Math.sin(site.h) * off, h: site.h };
  }

  private moor(id: PortId) {
    const c = this.career;
    const site = this.sea?.ports.find((s) => s.id === id);
    if (!c || !site) return;
    const p = this.player;
    // Pirates give up at the harbour mouth.
    for (const e of this.enemies) this.releaseShip(e);
    this.enemies = [];
    this.shots = [];
    for (const b of this.balls) {
      b.active = false;
      b.obj.visible = false;
    }
    this.releaseInput();
    if (p.alive) c.s.hull = clamp(p.hp / p.maxHp, 0.01, 1);
    this.docked = site;
    this.dockable = null;
    this.dockBlocked = null;
    this.autopilot = false;
    this.bannerQueue = [];
    this.banner = null;
    this.warn = null;
    this.portNotices = [...c.arrive(id), ...c.takeNotices()];
    const wp = c.s.waypoint;
    if (wp && Math.hypot(wp.x - site.x, wp.z - site.z) < 140) c.s.waypoint = null;
    this.portAngle = site.h + 0.75;
    p.sail = 0;
    p.speed = 0;
    p.setCargo(c.used() / c.cap());
    this.setPhase("port");
    this.emitPort();
    this.save();
  }

  /** After a port action: refresh the port screen and save. */
  private portAct(changed: boolean) {
    const c = this.career;
    if (!c) return;
    if (changed) {
      this.portNotices = [...this.portNotices, ...c.takeNotices()].slice(-5);
      this.player.setCargo(c.used() / c.cap());
      this.save();
    }
    this.emitPort();
    this.emitHud(true);
  }

  /** Puts the career's current ship on the water: its model, stats and deck guns. */
  private applyTradeShip() {
    const c = this.career;
    if (!c) return;
    const def = c.ship;
    const p = this.player;
    const proto = this.protos.get(def.model) ?? this.protos.get(SHIPS.playerSmall)!;
    p.stats = { ...PLAYER_STATS, name: def.name, hp: def.hull, speed: def.speed, turn: def.turn, guns: def.guns };
    p.setModel(proto, def.scale, def.ghost ? GHOST_TINT : undefined, { waterline: def.waterline, beam: def.beam, steam: def.steam });
    this.mountGuns();
    p.maxHp = this.maxHull();
    p.hp = Math.max(1, p.maxHp * c.s.hull);
    p.setCargo(c.used() / c.cap());
    this.emitHud(true);
  }

  private save() {
    const c = this.trade;
    if (!c) return;
    const p = this.player;
    const atSea = !this.docked && p.alive && (this.phase === "playing" || this.phase === "paused" || this.phase === "chart");
    if (atSea) {
      c.s.sea = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, h: Math.round(p.heading * 1000) / 1000 };
      c.s.hull = clamp(p.hp / p.maxHp, 0.05, 1);
    }
    this.events.save(c.toSave());
  }

  private wreck() {
    const c = this.career;
    if (!c) return;
    const r = c.wrecked();
    for (const id of this.salvageOut) this.dropSalvage(id);
    this.setPhase("wrecked");
    this.sfx.gameOver();
    music.setIntensity(0);
    this.events.wrecked({ ...r, port: PORT[r.port].name });
    this.save();
  }

  private notify(notices: Notice[]) {
    for (const n of notices) this.queueBanner(n.title, n.text, n.tone === "bad" ? "bad" : n.tone === "good" ? "good" : "info", 3.6);
  }

  private queueBanner(title: string, sub: string, tone: Banner["tone"], seconds: number) {
    if (this.banner && this.bannerT > 0) {
      if (this.bannerQueue.length < 5) this.bannerQueue.push({ title, sub, tone, seconds });
    } else this.showBanner(title, sub, tone, seconds);
  }

  /** At sea: contract clocks, pirates, merchants, flotsam, salvage, treasure, the harbour rings, autosave. */
  private updateTrade(dt: number) {
    const c = this.career;
    const sea = this.sea;
    if (!c || !sea) return;
    const p = this.player;
    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.lastX = p.x;
    this.lastZ = p.z;
    const failed = c.tick(dt, moved < 50 ? moved : 0);
    for (const f of failed) {
      this.queueBanner("Contract failed", `${contractText(f).title} — out of time`, "bad", 3.6);
      this.dropSalvage(f.id);
    }
    if (failed.length) {
      this.sfx.empty();
      p.setCargo(c.used() / c.cap());
    }
    const dz = danger(p.x, p.z);
    this.threat = 1 + c.rank * 0.8 + dz * 5;
    this.updateEncounters(dt, dz);
    this.updateBounties();
    this.updateSalvage();
    this.updateTreasure();
    this.updateTraffic(dt);
    this.updateFlotsam(dt);

    // Docking.
    this.dockable = null;
    this.dockBlocked = null;
    for (const site of sea.ports) {
      if (Math.hypot(p.x - site.zone.x, p.z - site.zone.z) < site.zone.r + p.length * 0.3) {
        this.dockable = site;
        break;
      }
    }
    if (this.dockable && this.enemies.some((e) => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 75)) this.dockBlocked = "Shake off the pirates first!";
    const wp = c.s.waypoint;
    // Auto-sail docks by itself when it brings you near the harbour it was heading for.
    const target = this.autopilot && wp ? sea.ports.find((s) => Math.hypot(wp.x - s.zone.x, wp.z - s.zone.z) < 120) : undefined;
    if (target && Math.hypot(p.x - target.zone.x, p.z - target.zone.z) < target.zone.r + 22 && !this.enemies.some((e) => e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 75)) {
      this.autopilot = false;
      this.dockable = target;
      this.dockBlocked = null;
      this.dock();
      return;
    }
    if (wp && !target && Math.hypot(wp.x - p.x, wp.z - p.z) < 30) {
      c.s.waypoint = null;
      if (this.autopilot) {
        this.autopilot = false;
        this.queueBanner("Arrived", "Auto-sail brought you to the marked spot", "info", 2.5);
      }
    }
    // Gold rings pulse on the water where you can dock.
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = 1.1;
      for (const site of sea.ports) {
        if (Math.hypot(site.zone.x - p.x, site.zone.z - p.z) > 260) continue;
        this.rings.spawn(site.zone.x, site.zone.z, { r0: site.zone.r * 0.3, r1: site.zone.r * 0.85, life: 2.2, color: "#ffe9a3", alpha: 0.38 });
      }
    }
    this.notify(c.takeNotices());
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 12;
      this.save();
    }
  }

  /** Moored: the ship eases alongside the jetty while merchants sail past. */
  private updatePort(dt: number) {
    this.updateWind(dt);
    const site = this.docked;
    if (!site) return;
    const p = this.player;
    const b = this.berth(site);
    p.x = damp(p.x, b.x, 1.6, dt);
    p.z = damp(p.z, b.z, 1.6, dt);
    p.heading = dampAngle(p.heading, b.h, 1.6, dt);
    p.speed = 0;
    p.yawRate = 0;
    p.sailVis = damp(p.sailVis, 0, 1.5, dt);
    this.updateTraffic(dt);
  }

  /** Every frame on the open sea: only nearby islands are drawn, and the water's shallows follow the camera. */
  private updateSeaView(dt: number) {
    this.shoalT -= dt;
    const sea = this.sea;
    if (this.shoalT > 0 || !sea) return;
    this.shoalT = 0.3;
    const cx = this.camLook.x;
    const cz = this.camLook.z;
    sea.cull(cx, cz, 420);
    // Seen from afar only: up close (and from the port screen) the column would fill the view.
    const cam = this.camera.position;
    for (const b of this.beacons.children) {
      const d = Math.hypot(b.position.x - cam.x, b.position.z - cam.z);
      b.visible = this.phase !== "port" && d < 480 && d > 60;
    }
    if (this.beaconMaterial) (this.beaconMaterial.uniforms.uTime as { value: number }).value = this.elapsed;
    const near = sea.shoals
      .filter((s) => !s.dock && Math.abs(s.x - cx) < 380 && Math.abs(s.z - cz) < 380)
      .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))
      .slice(0, MAX_SHOALS);
    this.ocean.setShoals(near.map((s) => ({ x: s.x, z: s.z, r: s.r * 0.88 })));
  }

  private updateEncounters(dt: number, dz: number) {
    const c = this.career!;
    const p = this.player;
    // Pirates left far behind give up the chase.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      const far = e === this.queen ? Math.hypot(p.x - HAUNTED_SEA.x, p.z - HAUNTED_SEA.z) > HAUNTED_SEA.r + 160 : Math.hypot(e.x - p.x, e.z - p.z) > (this.bounties.has(e) ? 460 : 340);
      if (!far) continue;
      this.releaseShip(e);
      this.enemies.splice(i, 1);
    }
    // The Drowned Queen rises in her sea.
    if (!this.queen && c.time >= c.s.queenAt && Math.hypot(p.x - HAUNTED_SEA.x, p.z - HAUNTED_SEA.z) < HAUNTED_SEA.r - 70) {
      const a = p.heading + rand(-0.8, 0.8);
      const x = p.x + Math.sin(a) * 85;
      const z = p.z + Math.cos(a) * 85;
      if (!(this.world?.shoals ?? []).some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 14)) {
        const ship = this.takeShip("ghost", this.scaledStats("ghost"));
        this.launchEnemy(ship, x, z);
        this.queen = ship;
        // She rises from the deep in a burst of green fire.
        this.glow.burst(this.v1.set(x, 1, z), 40, 6, 6, { color: "#58ffb8", size: 2.4, grow: 0.4, life: 1.4, gravity: -2, drag: 1.5, alpha: 0.9, spread: 6 });
        this.smoke.burst(this.v1.set(x, 1, z), 30, 4, 3, { color: "#4c6b62", size: 4, grow: 10, life: 3, gravity: -1.5, drag: 1.2, alpha: 0.6, spread: 8 });
        this.queueBanner("The Drowned Queen rises!", "Sail out of the green rings before her shots land", "boss", 4.2);
        this.sfx.boss();
      }
    }
    // Pirates roam where the guild's ships don't — more often when your hold is full of riches.
    const riches = Math.min(1, c.cargoValue() / 5000);
    this.encounterT -= dt * (0.35 + dz * 1.8) * (1 + riches * 0.6);
    if (this.encounterT > 0) return;
    this.encounterT = rand(30, 50);
    if (dz < 0.08) return;
    const hostile = this.enemies.filter((e) => e.alive && e !== this.queen).length;
    const cap = Math.min(3, 1 + Math.floor(dz * 2.6));
    if (hostile >= cap) return;
    const n = Math.min(cap - hostile, 1 + (Math.random() < dz * 0.7 ? 1 : 0) + (Math.random() < dz * 0.3 ? 1 : 0));
    const a0 = p.heading + Math.PI + rand(-1.5, 1.5);
    let spawned = 0;
    for (let i = 0; i < n; i++) if (this.spawnPirate(this.pirateClass(), a0 + i * 0.4, 175, 215, null)) spawned++;
    if (!spawned) return;
    this.queueBanner(spawned > 1 ? "Pirates!" : "A pirate sail!", spawned > 1 ? `${spawned} ships flying the skull — run or fight` : "Flying the skull and closing in — run or fight", "bad", 3.4);
    this.sfx.waveStart();
  }

  private pirateClass(): PirateClass {
    const L = this.threat;
    const r = Math.random();
    const frigate = clamp((L - 5) * 0.07, 0, 0.45);
    const brig = clamp((L - 1.5) * 0.14, 0, 0.55);
    return r < frigate ? "frigate" : r < frigate + brig ? "brig" : "sloop";
  }

  /** A pirate around the player (or at a bounty site), out of the way of islands and harbours. */
  private spawnPirate(kind: PirateClass, angle: number, dMin: number, dMax: number, at: { x: number; z: number } | null) {
    const p = this.player;
    const shoals = this.world?.shoals ?? [];
    const cx = at ? at.x : p.x;
    const cz = at ? at.z : p.z;
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = angle + rand(-0.5, 0.5) * (1 + attempt * 0.15);
      const d = rand(dMin, dMax);
      const x = cx + Math.sin(a) * d;
      const z = cz + Math.cos(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > BOUNDS - 40) continue;
      if (shoals.some((s) => Math.abs(s.x - x) < s.r + 12 && Math.abs(s.z - z) < s.r + 12 && Math.hypot(s.x - x, s.z - z) < s.r + 12)) continue;
      if (PORTS.some((pt) => Math.hypot(pt.x - x, pt.z - z) < 150)) continue;
      if (this.enemies.some((e) => Math.hypot(e.x - x, e.z - z) < 22)) continue;
      const stats = this.scaledStats(kind);
      stats.name = PIRATE_NAMES[kind];
      stats.bounty = Math.round(stats.bounty * (2.5 + this.threat * 0.4));
      const ship = this.takeShip(kind, stats);
      this.launchEnemy(ship, x, z);
      return ship;
    }
    return null;
  }

  /** Bounty targets appear when you sail near the spot they were seen. */
  private updateBounties() {
    const c = this.career!;
    const p = this.player;
    const hunted = new Set(this.bounties.values());
    for (const ct of c.s.contracts) {
      if (ct.kind !== "bounty" || !ct.site || hunted.has(ct.id)) continue;
      if (Math.hypot(ct.site.x - p.x, ct.site.z - p.z) > 300) continue;
      const ship = this.spawnPirate(ct.pirate ?? "sloop", rand(0, TAU), 0, 30, ct.site);
      if (!ship) continue;
      ship.stats.name = `${ct.captain}'s ${ct.pirate}`;
      ship.maxHp = ship.hp = Math.round(ship.hp * 1.6);
      ship.stats.damage *= 1.15;
      ship.stats.bounty = Math.round(ship.stats.bounty * 1.5);
      this.bounties.set(ship, ct.id);
      this.queueBanner(`${ct.captain}!`, "The bounty target is in sight — sink that ship", "boss", 3.6);
      this.sfx.boss();
    }
  }

  /** Salvage crates float at the wreck site while you're near it. */
  private updateSalvage() {
    const c = this.career!;
    const p = this.player;
    for (const id of [...this.salvageOut]) if (!c.s.contracts.some((ct) => ct.id === id)) this.dropSalvage(id);
    for (const ct of c.s.contracts) {
      if (ct.kind !== "salvage" || !ct.site || !ct.load || ct.load === "mail" || ct.load === "passengers") continue;
      const d = Math.hypot(ct.site.x - p.x, ct.site.z - p.z);
      if (!this.salvageOut.has(ct.id) && ct.loaded < ct.qty && d < 230) {
        this.salvageOut.add(ct.id);
        for (let i = ct.loaded; i < ct.qty; i++) {
          const a = rand(0, TAU);
          const r = rand(3, 13);
          this.spawnLoot("crate", ct.site.x + Math.sin(a) * r, ct.site.z + Math.cos(a) * r, 0, 0, { good: ct.load, qty: 1, contract: ct.id, keep: true });
        }
        if (d > 60) this.queueBanner("Wreckage ahead", `Crates of ${GOODS[ct.load].name.toLowerCase()} float at the marked spot`, "info", 3);
      } else if (this.salvageOut.has(ct.id) && d > 520) this.dropSalvage(ct.id);
    }
  }

  private dropSalvage(id: string) {
    this.salvageOut.delete(id);
    this.loot = this.loot.filter((l) => {
      if (l.contract !== id || l.taken >= 0) return true;
      this.releaseLoot(l);
      return false;
    });
  }

  /** Sail close to the island on a treasure map and the crew digs it up. */
  private updateTreasure() {
    const c = this.career!;
    const sea = this.sea!;
    const p = this.player;
    for (const id of [...c.s.maps]) {
      const isl = sea.islands[id];
      if (!isl || Math.hypot(isl.x - p.x, isl.z - p.z) > isl.r + 24) continue;
      const gold = c.dig(id);
      if (!gold) continue;
      const at = this.v1.set(p.x, p.y + 4, p.z);
      this.text(`+${gold.toLocaleString("en-US")} gold`, "#fcd34d", at.x, at.y + 6, at.z, true);
      this.glow.burst(at, 40, 5, 7, { color: "#ffd34d", size: 1.2, grow: 0.2, life: 1.1, gravity: 4, drag: 1.2 });
      this.sfx.coin(true);
      this.sfx.waveClear();
      this.queueBanner("Treasure!", `The crew digs up ${gold.toLocaleString("en-US")} gold — and a chest washes out to sea`, "good", 4);
      const a = Math.atan2(p.x - isl.x, p.z - isl.z);
      this.spawnLoot("chest", isl.x + Math.sin(a) * (isl.r + 6), isl.z + Math.cos(a) * (isl.r + 6), Math.sin(a) * 2, Math.cos(a) * 2);
      const wp = c.s.waypoint;
      if (wp && Math.hypot(wp.x - isl.x, wp.z - isl.z) < 60) c.s.waypoint = null;
      this.save();
    }
  }

  /** Barrels, crates and the odd message in a bottle drift across your bow. */
  private updateFlotsam(dt: number) {
    this.flotsamT -= dt;
    if (this.flotsamT > 0) return;
    this.flotsamT = rand(22, 38);
    const c = this.career!;
    const p = this.player;
    const a = p.heading + rand(-0.6, 0.6);
    const d = rand(70, 110);
    const x = p.x + Math.sin(a) * d;
    const z = p.z + Math.cos(a) * d;
    if ((this.world?.shoals ?? []).some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 6)) return;
    const maps = c.s.maps.length < 3 && (this.sea?.islands ?? []).some((i) => i.treasure && !c.s.dug.includes(i.id) && !c.s.maps.includes(i.id));
    const r = Math.random();
    if (maps && r < 0.24) this.spawnLoot("bottle", x, z, 0, 0);
    else if (r < 0.58) this.spawnLoot("crate", x, z, 0, 0, { good: this.lootGood(), qty: 1 + Math.floor(Math.random() * 3) });
    else if (r < 0.86) this.spawnLoot("barrel", x, z, 0, 0);
    else this.spawnLoot("chest", x, z, 0, 0);
  }

  /** A good worth fishing out of the sea (finer goods as your rank grows). */
  private lootGood(): GoodId {
    const n = Math.min(GOOD_IDS.length, 5 + (this.career?.rank ?? 0));
    return GOOD_IDS[Math.floor(Math.random() * n)];
  }

  private pirateDown(s: Ship) {
    const c = this.career!;
    const boss = s.kind === "ghost";
    const id = this.bounties.get(s);
    this.addGold(s.stats.bounty, s.x, s.y + 9 * s.scale, s.z);
    c.pirateSunk(boss ? "ghost" : (s.kind as PirateClass));
    const n = s.stats.loot + (id ? 2 : 0) + (boss ? 4 : 0);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const a = rand(0, TAU);
      const x = s.x + Math.sin(a) * rand(1, 4);
      const z = s.z + Math.cos(a) * rand(1, 4);
      const vx = Math.sin(a) * rand(2, 4.5);
      const vz = Math.cos(a) * rand(2, 4.5);
      if (boss || r < 0.22) this.spawnLoot("chest", x, z, vx, vz);
      else if (r < 0.7) this.spawnLoot("crate", x, z, vx, vz, { good: this.lootGood(), qty: 1 + Math.floor(Math.random() * (2 + c.rank * 0.6)) });
      else this.spawnLoot("barrel", x, z, vx, vz);
    }
    if (id) {
      this.bounties.delete(s);
      this.notify(c.bountyDone(id));
    }
    if (boss) {
      const gold = c.queenSunk();
      this.queen = null;
      this.queueBanner("The Drowned Queen is sunk!", `+${gold.toLocaleString("en-US")} gold — and her hull is for sale at Skull Cove`, "good", 5);
    }
    this.notify(c.takeNotices());
  }

  private collectTrade(l: Loot): boolean {
    const c = this.career!;
    const p = this.player;
    const at = this.v1.set(l.x, waveHeight(l.x, l.z) + 1, l.z);
    if (l.contract && l.good) {
      if (!c.salvage(l.contract)) {
        this.holdFull(at);
        return false;
      }
      this.text(`+1 ${GOODS[l.good].name}`, "#fde68a", at.x, at.y + 2, at.z);
      this.sfx.coin();
      this.glow.burst(at, 12, 3, 4, { color: "#ffe58a", size: 0.9, grow: 0.2, life: 0.8, gravity: 3, drag: 1.5 });
    } else if (l.kind === "crate" && l.good) {
      const qty = l.qty ?? 1;
      const n = c.pickUp(l.good, qty);
      const g = GOODS[l.good];
      if (n > 0) this.text(`+${n} ${g.name}`, "#fde68a", at.x, at.y + 2, at.z);
      // What doesn't fit in the hold is worth a few coins to the crew.
      if (n < qty) this.addGold(g.base * (qty - n) * 0.4, at.x, at.y + (n > 0 ? 4 : 2), at.z);
      this.sfx.coin();
      this.glow.burst(at, 12, 3, 4, { color: "#ffe58a", size: 0.9, grow: 0.2, life: 0.8, gravity: 3, drag: 1.5 });
    } else if (l.kind === "bottle") {
      this.readBottle();
      this.sfx.pick();
      this.glow.burst(at, 18, 3, 4, { color: "#bae6fd", size: 1, grow: 0.2, life: 0.9, gravity: -1, drag: 2 });
    } else if (l.kind === "barrel" || l.kind === "bottles") {
      const amount = p.maxHp * (l.kind === "barrel" ? 0.08 : 0.14);
      const healed = Math.min(amount, p.maxHp - p.hp);
      p.hp = Math.min(p.maxHp, p.hp + amount);
      this.text(healed > 0 ? `+${Math.round(healed)} hull` : "Hull full", "#86efac", at.x, at.y + 2, at.z);
      this.sfx.repair();
      this.glow.burst(at, 14, 3, 4, { color: "#7dffa0", size: 0.9, grow: 0.2, life: 0.7, gravity: -1, drag: 2 });
    } else {
      this.addGold(30 + c.rank * 25, at.x, at.y + 2, at.z);
      this.sfx.coin(true);
      this.glow.burst(at, 24, 3.5, 5, { color: "#ffd34d", size: 0.9, grow: 0.2, life: 0.8, gravity: 3, drag: 1.5 });
    }
    l.taken = 0;
    p.setCargo(c.used() / c.cap());
    this.emitHud(true);
    return true;
  }

  private holdFull(at: THREE.Vector3) {
    if (this.elapsed - this.fullT < 1.5) return;
    this.fullT = this.elapsed;
    this.text("Hold full!", "#fca5a5", at.x, at.y + 2, at.z);
    this.sfx.empty();
  }

  /** A message in a bottle: usually a treasure map to an island on the chart. */
  private readBottle() {
    const c = this.career!;
    const sea = this.sea!;
    const p = this.player;
    const options = sea.islands.filter((i) => i.treasure && !c.s.dug.includes(i.id) && !c.s.maps.includes(i.id));
    if (!options.length || c.s.maps.length >= 3) {
      this.addGold(40, p.x, p.y + 6, p.z);
      this.queueBanner("A message in a bottle", "Just an old love letter… and a few coins", "info", 3);
      return;
    }
    options.sort((a, b) => Math.abs(Math.hypot(a.x - p.x, a.z - p.z) - 450) - Math.abs(Math.hypot(b.x - p.x, b.z - p.z) - 450));
    const isl = options[Math.floor(Math.random() * Math.min(3, options.length))];
    c.addMap(isl.id);
    if (!c.s.waypoint) c.s.waypoint = { x: isl.x, z: isl.z, label: "Treasure" };
    const d = Math.hypot(isl.x - p.x, isl.z - p.z);
    this.queueBanner("A treasure map!", `X marks an island ${metres(d)} to the ${compass(isl.x - p.x, isl.z - p.z)} — it's on your chart`, "good", 4.5);
    this.save();
  }

  // --- Merchant traffic ---------------------------------------------------------------------------

  private updateTraffic(dt: number) {
    const c = this.career;
    if (!c || !this.sea) return;
    const p = this.player;
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const tr = this.traffic[i];
      const s = tr.ship;
      const dest = PORT[tr.to];
      if (Math.hypot(s.x - p.x, s.z - p.z) > 470 || Math.hypot(s.x - dest.x, s.z - dest.z) < dest.r + 34) {
        this.releaseTraffic(tr);
        this.traffic.splice(i, 1);
      }
    }
    this.trafficT -= dt;
    if (this.trafficT <= 0) {
      this.trafficT = rand(4, 9);
      if (this.traffic.length < 4) this.spawnTraffic();
    }
    for (const tr of this.traffic) {
      const s = tr.ship;
      const dest = PORT[tr.to];
      let desired = Math.atan2(dest.x - s.x, dest.z - s.z);
      if (!s.steam) {
        const from = this.wind.angle + Math.PI;
        const rel = wrap(desired - from);
        if (Math.abs(rel) < 0.7) desired = from + (rel >= 0 ? 0.7 : -0.7);
      }
      desired = this.avoid(s, desired);
      s.steerIn = clamp(-wrap(desired - s.heading) * 1.6, -1, 1);
      s.sail = 2;
      s.physics(dt, this.wind, 1, 1, 0.45);
    }
  }

  private spawnTraffic() {
    const c = this.career!;
    const p = this.player;
    const shoals = this.sea!.shoals;
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = rand(0, TAU);
      const d = rand(240, 300);
      const x = p.x + Math.sin(a) * d;
      const z = p.z + Math.cos(a) * d;
      if (Math.max(Math.abs(x), Math.abs(z)) > BOUNDS - 40) continue;
      if (shoals.some((s) => Math.abs(s.x - x) < s.r + 14 && Math.abs(s.z - z) < s.r + 14 && Math.hypot(s.x - x, s.z - z) < s.r + 14)) continue;
      // Bound for a port on the far side, so it crosses your path.
      const options = PORTS.filter((pt) => Math.hypot(pt.x - x, pt.z - z) > 300);
      const to = options[Math.floor(Math.random() * options.length)];
      if (!to) return;
      const list = c.rank >= 4 && Math.random() < 0.25 ? BIG_TRAFFIC : TRAFFIC;
      const id = list[Math.floor(Math.random() * list.length)];
      const ship = this.takeTraffic(id);
      ship.reset(x, z, Math.atan2(to.x - x, to.z - z));
      ship.sail = 2;
      ship.sailVis = 2 / 3;
      ship.speed = ship.stats.speed * 0.5;
      ship.setCargo(Math.random());
      this.traffic.push({ ship, to: to.id, def: id });
      return;
    }
  }

  private takeTraffic(id: ShipId) {
    const def = SHIP_DEFS[id];
    let ship = this.trafficPool.get(id)?.pop();
    if (!ship) {
      ship = new Ship("sloop", { ...PLAYER_STATS, name: def.name, hp: def.hull, speed: def.speed * 0.72, turn: def.turn }, this.wakeMaterial);
      ship.setModel(this.protos.get(def.model) ?? this.protos.get(SHIPS.sloop)!, def.scale, undefined, { waterline: def.waterline, beam: def.beam, steam: def.steam });
      ship.pool = id;
    }
    this.scene.add(ship.root, ship.wake.mesh);
    return ship;
  }

  private releaseTraffic(tr: Traffic) {
    this.scene.remove(tr.ship.root, tr.ship.wake.mesh);
    tr.ship.wake.reset();
    let list = this.trafficPool.get(tr.def);
    if (!list) this.trafficPool.set(tr.def, (list = []));
    list.push(tr.ship);
  }

  // --- Open Sea HUD, port screen, markers ---------------------------------------------------------

  private contractTarget(ct: Contract): { x: number; z: number } | null {
    if (ct.site && (ct.kind === "bounty" || (ct.kind === "salvage" && ct.loaded < ct.qty))) return ct.site;
    const site = this.sea?.ports.find((s) => s.id === ct.to);
    return site ? site.zone : null;
  }

  private openSea(x: number, z: number) {
    return !(this.sea?.shoals ?? []).some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 25);
  }

  private tradeHud(): TradeHud {
    const c = this.career!;
    const p = this.player;
    const track: TrackLine[] = c.s.contracts.slice(0, 5).map((ct) => {
      const tgt = this.contractTarget(ct);
      const timed = ct.kind === "freight" || ct.kind === "express" || ct.kind === "salvage" || ct.left < 120;
      return {
        id: ct.id,
        text: contractText(ct).line,
        left: timed ? Math.ceil(ct.left) : null,
        dist: tgt ? Math.round(Math.hypot(tgt.x - p.x, tgt.z - p.z) / 10) * 10 : null,
        urgent: ct.left < 30,
      };
    });
    const wp = c.s.waypoint;
    return {
      cargo: c.used(),
      cap: c.cap(),
      zone: zoneName(p.x, p.z),
      danger: Math.round(danger(p.x, p.z) * 10) / 10,
      dock: this.dockable && this.phase === "playing" ? this.dockable.def.name : null,
      dockBlocked: this.dockBlocked,
      track,
      rank: RANKS[c.rank].name,
      waypoint: wp ? { label: wp.label, dist: Math.round(Math.hypot(wp.x - p.x, wp.z - p.z) / 10) * 10 } : null,
      steam: !!c.ship.steam,
      auto: this.autopilot,
    };
  }

  private emitPort() {
    const c = this.career;
    const site = this.docked;
    if (!c || !site || this.phase !== "port") return;
    const id = site.id;
    const def = site.def;
    const ctx = { openSea: (x: number, z: number) => this.openSea(x, z) };
    const row = (o: Contract, active: boolean): OfferRow => {
      const tgt = this.contractTarget(o);
      return { c: { ...o }, ...contractText(o), dist: tgt ? Math.round(Math.hypot(tgt.x - site.x, tgt.z - site.z)) : 0, blocked: active ? null : c.blocked(o) };
    };
    const market: MarketRow[] = GOOD_IDS.map((g) => ({
      id: g,
      name: GOODS[g].name,
      icon: GOODS[g].icon,
      buy: c.canBuy(id, g) ? c.buyPrice(id, g) : null,
      sell: c.sellPrice(id, g),
      have: c.have(g),
      paid: c.have(g) && c.s.basis[g] !== undefined ? Math.round(c.s.basis[g]!) : null,
      wanted: def.wants.includes(g),
      local: def.produces.includes(g),
      maxBuy: c.canBuy(id, g) ? c.maxBuy(id, g) : 0,
    }));
    const p = this.player;
    this.events.port({
      id,
      name: def.name,
      blurb: def.blurb,
      produces: def.produces,
      wants: def.wants,
      yard: def.yard.length > 0,
      gold: c.gold,
      cargo: c.used(),
      cap: c.cap(),
      hull: Math.ceil(p.hp),
      maxHull: p.maxHp,
      repairCost: c.repairCost(),
      ship: c.ship,
      rank: c.rankInfo(),
      market,
      offers: c.board(id, ctx).map((o) => row(o, false)),
      active: c.s.contracts.map((o) => row(o, true)),
      maxContracts: c.maxContracts(),
      refresh: Math.ceil(c.boardRefreshIn()),
      ships: SHIP_ORDER.map((sid) => {
        const d = SHIP_DEFS[sid];
        const owned = c.fleet.includes(sid);
        return { def: d, owned, active: c.s.ship === sid, sold: def.yard.includes(sid), blocked: owned ? c.switchBlocked(sid) : c.shipBlocked(sid, id), cap: c.cap(d), hull: c.maxHull(d), guns: c.guns(d) };
      }),
      upgrades: TRADE_UPGRADE_ORDER.map((u) => ({ id: u, title: TRADE_UPGRADES[u].title, text: TRADE_UPGRADES[u].text, level: c.level(u), max: TRADE_UPGRADES[u].costs.length, cost: c.upgradeCost(u) })),
      goals: c.goals(),
      stats: { ...c.stats },
      notices: this.portNotices,
      maps: c.s.maps.length,
      visited: c.visited.length,
      fleet: c.fleet.length,
      guideOff: !!c.s.guideOff,
      quote: (g, qty) => ({ buy: c.canBuy(id, g) ? c.quoteBuy(id, g, qty) : null, sell: c.quoteSell(id, g, qty) }),
      wantedAt: (g) =>
        PORTS.filter((pt) => pt.id !== id && pt.wants.includes(g))
          .map((pt) => ({ name: pt.name, dist: Math.hypot(pt.x - site.x, pt.z - site.z), price: c.s.known[pt.id]?.sell[g] ?? null }))
          .sort((a, b) => a.dist - b.dist),
    });
  }

  /** Port names, the waypoint, treasure marks and bounty sites over the 3D view. */
  private drawSeaMarks(ctx: CanvasRenderingContext2D, margin: number) {
    const c = this.career!;
    const sea = this.sea!;
    const p = this.player;
    const { w, h } = this.view;
    for (const site of sea.ports) {
      const d = Math.hypot(site.x - p.x, site.z - p.z);
      if (d > 330) continue;
      const s = this.project(site.x, 17, site.z);
      if (!s.front || s.x < -60 || s.x > w + 60 || s.y < -20 || s.y > h + 20) continue;
      this.label(ctx, `⚓ ${site.def.name}`, s.x, s.y, "#fde68a", 15);
      if (d > 70) this.label(ctx, metres(d), s.x, s.y + 16, "#e2e8f0", 11);
    }
    for (const id of c.s.maps) {
      const isl = sea.islands[id];
      if (!isl || Math.hypot(isl.x - p.x, isl.z - p.z) > 340) continue;
      const s = this.project(isl.x, 4, isl.z);
      if (s.front) this.label(ctx, "✕", s.x, s.y, "#ef4444", 28);
    }
    for (const ct of c.s.contracts) {
      if (!ct.site || ct.kind === "freight" || (ct.kind === "salvage" && ct.loaded >= ct.qty)) continue;
      const d = Math.hypot(ct.site.x - p.x, ct.site.z - p.z);
      if (d > 340 || d < 30) continue;
      const s = this.project(ct.site.x, 3, ct.site.z);
      if (s.front && s.x > 0 && s.x < w && s.y > 0 && s.y < h) this.label(ctx, ct.kind === "bounty" ? "☠" : "⚓ Wreck", s.x, s.y, ct.kind === "bounty" ? "#fca5a5" : "#bae6fd", ct.kind === "bounty" ? 24 : 13);
    }
    const wp = c.s.waypoint;
    if (!wp) return;
    const d = Math.hypot(wp.x - p.x, wp.z - p.z);
    const s = this.project(wp.x, 9, wp.z);
    if (s.front && s.x > margin && s.x < w - margin && s.y > margin && s.y < h - margin) {
      // Far off it sits on the horizon: keep it below the HUD.
      const y = clamp(s.y, 120, h - 170) - 8 + Math.sin(this.elapsed * 3) * 3;
      ctx.save();
      ctx.translate(s.x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 2.5;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
      this.label(ctx, `${wp.label} · ${metres(d)}`, s.x, y - 20, "#fde68a", 12);
    } else this.edgeArrow(ctx, wp.x, wp.z, "#fbbf24", margin, Math.min(d, 200), `${wp.label} ${metres(d)}`);
  }

  private miniSeaMarks(ctx: CanvasRenderingContext2D, map: (x: number, z: number) => readonly [number, number], R: number, d: number) {
    const c = this.career!;
    const sea = this.sea!;
    for (const site of sea.ports) {
      const [x, y] = map(site.x, site.z);
      if (Math.hypot(x - R, y - R) > R + 10) continue;
      ctx.beginPath();
      ctx.arc(x, y, 4.5 * d, 0, TAU);
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
      ctx.lineWidth = 1.5 * d;
      ctx.strokeStyle = "#3b2412";
      ctx.stroke();
    }
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2 * d;
    for (const id of c.s.maps) {
      const isl = sea.islands[id];
      if (!isl) continue;
      const [x, y] = map(isl.x, isl.z);
      if (Math.hypot(x - R, y - R) > R) continue;
      ctx.beginPath();
      ctx.moveTo(x - 3.5 * d, y - 3.5 * d);
      ctx.lineTo(x + 3.5 * d, y + 3.5 * d);
      ctx.moveTo(x + 3.5 * d, y - 3.5 * d);
      ctx.lineTo(x - 3.5 * d, y + 3.5 * d);
      ctx.stroke();
    }
    const wp = c.s.waypoint;
    if (!wp) return;
    let [x, y] = map(wp.x, wp.z);
    const dx = x - R;
    const dy = y - R;
    const len = Math.hypot(dx, dy);
    const max = R - 7 * d;
    if (len > max) {
      x = R + (dx / len) * max;
      y = R + (dy / len) * max;
    }
    ctx.beginPath();
    ctx.arc(x, y, 4 * d, 0, TAU);
    ctx.fillStyle = "#fde047";
    ctx.fill();
    ctx.lineWidth = 1.5 * d;
    ctx.strokeStyle = "#78350f";
    ctx.stroke();
  }

  // --- Atmosphere & camera ------------------------------------------------------------------------

  private applyAtmosphere(force: boolean, dt = 0) {
    const p = this.player;
    const haunted = this.mode === "trade" && !!p && inHauntedSea(p.x, p.z);
    const boss = this.enemies.some((e) => e.kind === "ghost" && e.sinkT < 2.5) || haunted;
    this.haunt = force ? (boss ? 1 : 0) : damp(this.haunt, boss ? 1 : 0, 0.7, dt);
    const h = this.haunt;
    sea.amp = lerp(this.phase === "menu" ? 0.85 : 1, 1.4, h);
    if (!force && Math.abs(h - this.hauntShown) < 0.002) return;
    this.hauntShown = h;
    this.ocean.setPalette(SUNNY, HAUNTED, h);
    const u = this.ocean.material.uniforms;
    const sunColor = TMP_COLOR.set("#fff2d6").lerp(TMP_COLOR2.set("#7fbfa8"), h * 0.85);
    this.ocean.setSun(SUN_DIR, sunColor);
    this.sky.set(u.uSkyTop.value, u.uSkyHorizon.value, SUN_DIR, sunColor);
    this.fog.color.copy(u.uSkyHorizon.value);
    this.fog.near = lerp(100, 40, h);
    this.fog.far = lerp(300, 190, h);
    this.sun.intensity = lerp(2.5, 0.8, h);
    this.sun.color.set("#fff1dc").lerp(TMP_COLOR.set("#9fffd6"), h);
    this.hemi.intensity = lerp(1.1, 0.75, h);
    this.renderer.toneMappingExposure = lerp(1.05, 0.95, h);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    if (!p) return;
    const look = this.v1;
    const pos = this.v2;
    const portrait = this.portrait;
    if (this.phase === "menu") {
      const a = this.elapsed * 0.06 + 2.4;
      const R = portrait ? 46 : 36;
      look.set(p.x + p.fx * 3, 3.2, p.z + p.fz * 3);
      pos.set(p.x + Math.sin(a) * R, portrait ? 15 : 9.5, p.z + Math.cos(a) * R);
      this.camYaw = Math.atan2(look.x - pos.x, look.z - pos.z);
    } else if (this.phase === "port" && this.docked) {
      // Moored: a slow orbit over the harbour, the ship in front of the town.
      const site = this.docked;
      const b = this.berth(site);
      const a = this.portAngle + this.elapsed * 0.03;
      const R = (portrait ? 74 : 50) + p.length * 1.3;
      const cx = b.x * 0.65 + site.x * 0.35;
      const cz = b.z * 0.65 + site.z * 0.35;
      look.set(cx, 3, cz);
      pos.set(cx + Math.sin(a) * R, portrait ? 36 : 21 + p.length * 0.3, cz + Math.cos(a) * R);
      this.camYaw = Math.atan2(look.x - pos.x, look.z - pos.z);
    } else if (this.phase === "sinking" || this.phase === "over" || this.phase === "wrecked") {
      this.camYaw += dt * 0.12;
      const R = 30 + this.deathT * 1.5;
      look.set(p.x, 1, p.z);
      pos.set(p.x - Math.sin(this.camYaw) * R, 14 + this.deathT * 1.2, p.z - Math.cos(this.camYaw) * R);
    } else {
      // Combat framing: pull back and turn part-way towards the nearest enemy, so a ship you are
      // about to broadside (abeam, off to the side) stays in view.
      let nearest: { x: number; z: number } | null = null;
      let nd = Infinity;
      for (const e of this.foes()) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < nd) {
          nd = d;
          nearest = e;
        }
      }
      if (this.wave >= 2) {
        // A fort in range counts too (with a little less priority than ships).
        for (const f of this.forts) {
          if (f.down) continue;
          const d = Math.hypot(f.x - p.x, f.z - p.z) + 12;
          if (d < nd && d < FORT_RANGE + 12) {
            nd = d;
            nearest = f;
          }
        }
      }
      const engage = nearest && this.phase === "playing" ? clamp(1 - (nd - 45) / 45, 0, 1) : 0;
      this.frameK = damp(this.frameK, engage, 1.1, dt);
      const rel = nearest ? wrap(Math.atan2(nearest.x - p.x, nearest.z - p.z) - p.heading) : 0;
      const bias = clamp(rel, -1.7, 1.7) * (portrait ? 0.62 : 0.5) * engage;
      this.frameBias = damp(this.frameBias, bias, 1.3, dt);
      const yaw = p.heading + this.frameBias;
      this.camYaw = this.camSnap ? yaw : dampAngle(this.camYaw, yaw, 1.8, dt);
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      // Big ships need the camera further back.
      const z = this.zoom * (1 + 0.28 * this.frameK) * Math.pow(Math.max(1, p.length / 10), 0.85);
      const dist = (portrait ? 44 : 30) * z + p.speed * 0.3;
      const height = (portrait ? 34 : 18) * z;
      const ahead = (4 + p.speed * 0.4) * (1 - this.frameK * 0.5);
      // Centre the action: lean the view a little towards the target.
      const lean = nearest ? 0.2 * this.frameK : 0;
      const lx = nearest ? (nearest.x - p.x) * lean : 0;
      const lz = nearest ? (nearest.z - p.z) * lean : 0;
      look.set(p.x + p.fx * ahead + lx, 2, p.z + p.fz * ahead + lz);
      pos.set(p.x - fx * dist + lx, height, p.z - fz * dist + lz);
    }
    if (this.camSnap) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
      this.camSnap = false;
    } else {
      this.camPos.x = damp(this.camPos.x, pos.x, 5, dt);
      this.camPos.y = damp(this.camPos.y, pos.y, 5, dt);
      this.camPos.z = damp(this.camPos.z, pos.z, 5, dt);
      this.camLook.x = damp(this.camLook.x, look.x, 7, dt);
      this.camLook.y = damp(this.camLook.y, look.y, 7, dt);
      this.camLook.z = damp(this.camLook.z, look.z, 7, dt);
    }
    const s = this.shake * this.shake;
    const cam = this.camera;
    cam.position.set(this.camPos.x + rand(-1, 1) * s * 0.8, this.camPos.y + rand(-1, 1) * s * 0.6, this.camPos.z + rand(-1, 1) * s * 0.8);
    cam.position.y = Math.max(cam.position.y, waveHeight(cam.position.x, cam.position.z) + 1.5);
    cam.lookAt(this.camLook);

    // Shadows follow the action, snapped to texels so they don't shimmer.
    const texel = (SHADOW_EXTENT * 2) / this.sun.shadow.mapSize.x;
    const cx = Math.round((this.camLook.x - this.camYawX() * 10) / texel) * texel;
    const cz = Math.round((this.camLook.z - this.camYawZ() * 10) / texel) * texel;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + SUN_DIR.x * 120, SUN_DIR.y * 120, cz + SUN_DIR.z * 120);
  }

  private camYawX() {
    return Math.sin(this.camYaw);
  }

  private camYawZ() {
    return Math.cos(this.camYaw);
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.portrait = w / h < 0.85;
    this.camera.fov = this.portrait ? 62 : 50;
    this.camera.aspect = w / h;
    if (this.showcase > 0 || this.showcaseY > 0) this.camera.setViewOffset(w, h, this.showcase / 2, this.showcaseY / 2, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const dpr = this.renderer.getPixelRatio();
    this.smoke.setScale(h * dpr, this.camera.fov);
    this.glow.setScale(h * dpr, this.camera.fov);
    this.view = { w, h, dpr: Math.min(2, window.devicePixelRatio || 1) };
    const ctx = this.overlay;
    if (ctx) {
      ctx.canvas.width = Math.round(w * this.view.dpr);
      ctx.canvas.height = Math.round(h * this.view.dpr);
    }
  }

  // --- HUD, overlay & minimap ---------------------------------------------------------------------

  private emitHud(force = false) {
    if (!this.player) return;
    this.hudT = 1 / 15;
    const p = this.player;
    const boss = this.enemies.find((e) => e.kind === "ghost" && e.alive);
    const windRel = wrap(this.wind.angle - this.camYaw);
    const reloadTime = this.reloadTime();
    const next: Hud = {
      hull: Math.ceil(p.hp),
      maxHull: p.maxHp,
      gold: this.trade ? this.trade.gold : this.gold,
      wave: this.wave,
      enemies: this.enemies.filter((e) => e.alive).length + this.spawnQueue.length,
      sunk: this.sunk,
      sail: p.sail,
      speed: Math.round(p.speed * 1.6),
      wind: Math.round((-windRel * 180) / Math.PI),
      windStrength: this.wind.strength,
      trim: p.steam ? "Full steam" : pointOfSail(p.alpha),
      trimEff: p.steam ? 1 : polar(p.alpha),
      reloadL: 1 - p.reload[1] / reloadTime,
      reloadR: 1 - p.reload[-1] / reloadTime,
      guns: this.guns(),
      ship: this.onlineShip ? this.onlineShip.name : this.trade ? this.trade.ship.name : SHIP_NAMES[this.up.ship],
      boss: boss ? { name: boss.stats.name, hp: Math.ceil(boss.hp), max: boss.maxHp } : null,
      banner: this.banner,
      warn: this.warn,
      combat: this.combat,
      mode: this.mode,
      trade: this.trade ? this.tradeHud() : null,
      online: this.net ? this.onlineHud() : null,
    };
    if (!force && JSON.stringify(next) === JSON.stringify(this.hud)) return;
    this.hud = next;
    this.events.hud(next);
  }

  private project(x: number, y: number, z: number) {
    const v = this.v2.set(x, y, z).project(this.camera);
    const { w, h } = this.view;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, front: v.z < 1 };
  }

  private drawOverlay() {
    const ctx = this.overlay;
    if (!ctx) return;
    const { w, h, dpr } = this.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ph = this.phase;
    if (ph !== "playing" && ph !== "paused" && ph !== "upgrade" && ph !== "sinking") return;
    const p = this.player;
    const t = this.elapsed;
    const margin = 34;
    // Ships: health bars, fire warnings, and arrows towards those off screen.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      const s = this.project(e.x, e.y + 10.6 * e.scale, e.z);
      const on = s.front && s.x > -20 && s.x < w + 20 && s.y > -20 && s.y < h + 20;
      const ghost = e.kind === "ghost";
      if (on) {
        if (!ghost && d < 160) this.bar(ctx, s.x, s.y, 56, e.hp / e.maxHp);
        if (this.bounties.has(e) && d < 220) this.label(ctx, `☠ ${e.stats.name}`, s.x, s.y - 16, "#fca5a5", 13);
        if (e.aimT >= 0) this.alert(ctx, s.x, s.y - 20, t);
      } else if (ph === "playing" && (!this.trade || d < 260)) {
        this.edgeArrow(ctx, e.x, e.z, ghost ? "#5dffb8" : e.aimT >= 0 ? "#fbbf24" : "#f87171", margin, d);
      }
    }
    for (const f of this.forts) {
      if (f.down || this.wave < 2) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d > 120) continue;
      const s = this.project(f.x, f.height + 1.5, f.z);
      if (!s.front || s.x < 0 || s.x > w || s.y < 0 || s.y > h) continue;
      if (f.hp < f.maxHp || d < FORT_RANGE) this.bar(ctx, s.x, s.y, 44, f.hp / f.maxHp, d < FORT_RANGE ? "#f97316" : "#94a3b8");
      if (f.aimT >= 0) this.alert(ctx, s.x, s.y - 20, t);
    }
    if (this.trade && ph === "playing") this.drawSeaMarks(ctx, margin);
    if (this.net) {
      for (const r of this.remotes.values()) {
        const sh = r.ship;
        if (!sh.root.visible || !sh.alive) continue;
        const d = Math.hypot(sh.x - p.x, sh.z - p.z);
        const color = PLAYER_COLORS[r.color % PLAYER_COLORS.length];
        const s = this.project(sh.x, sh.y + 10.6 * sh.scale, sh.z);
        const on = s.front && s.x > -20 && s.x < w + 20 && s.y > -20 && s.y < h + 20;
        if (on) {
          this.bar(ctx, s.x, s.y, 56, sh.hp / Math.max(1, sh.maxHp));
          this.label(ctx, r.name, s.x, s.y - 15, color, 13);
        } else if (ph === "playing" && d < 260) this.edgeArrow(ctx, sh.x, sh.z, color, margin, d);
      }
    }
    // Floating gold / repair texts.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const ft of this.texts) {
      const s = this.project(ft.x, ft.y, ft.z);
      if (!s.front) continue;
      const a = Math.min(1, (ft.life - ft.age) / 0.5) * Math.min(1, ft.age * 8);
      ctx.globalAlpha = a;
      ctx.font = `${ft.big ? 30 : 23}px ${this.font}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(ft.text, s.x, s.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, frac: number, color?: string) {
    const f = clamp(frac, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    this.roundRect(ctx, x - width / 2 - 2, y - 5, width + 4, 10, 5);
    ctx.fill();
    ctx.fillStyle = color ?? (f > 0.6 ? "#4ade80" : f > 0.3 ? "#facc15" : "#f87171");
    this.roundRect(ctx, x - width / 2, y - 3, width * f, 6, 3);
    ctx.fill();
  }

  private alert(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const s = 1 + Math.sin(t * 18) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `900 17px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 0, 1);
    ctx.restore();
  }

  private edgeArrow(ctx: CanvasRenderingContext2D, x: number, z: number, color: string, margin: number, dist: number, label?: string) {
    const p = this.player;
    const dx = x - p.x;
    const dz = z - p.z;
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const fwd = dx * fx + dz * fz;
    const right = dx * -fz + dz * fx;
    const ang = Math.atan2(right, -fwd);
    const { w, h } = this.view;
    const cx = w / 2;
    const cy = h * 0.55;
    const ux = Math.sin(ang);
    const uy = Math.cos(ang);
    const kx = ux !== 0 ? (w / 2 - margin) / Math.abs(ux) : Infinity;
    const ky = uy !== 0 ? (uy > 0 ? h - cy - margin - 70 : cy - margin - 50) / Math.abs(uy) : Infinity;
    const k = Math.min(kx, ky);
    const ax = cx + ux * k;
    const ay = cy + uy * k;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.globalAlpha = clamp(1.4 - dist / 220, 0.45, 1);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, TAU);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    ctx.rotate(Math.atan2(uy, ux));
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-5, -7);
    ctx.lineTo(-5, 7);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    if (label) {
      // Pushed in from the edge, towards the middle of the screen.
      const lx = clamp(ax - ux * 30, 60, w - 60);
      const ly = clamp(ay - uy * 26, 40, h - 40);
      this.label(ctx, label, lx, ly, color, 12);
    }
  }

  /** A small outlined label over the 3D view. */
  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 14) {
    ctx.save();
    ctx.font = `${size}px ${this.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(0, w), h, Math.min(r, w / 2));
  }

  private drawMinimap() {
    const canvas = this.minimap;
    if (!canvas || !this.player || !this.world) return;
    const size = Math.round(canvas.clientWidth * this.view.dpr);
    if (!size) return;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = this.player;
    const R = size / 2;
    const trade = this.mode === "trade";
    const scale = R / (trade ? 230 : 150);
    const view = (trade ? 230 : 150) + 30;
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const map = (x: number, z: number) => {
      const dx = x - p.x;
      const dz = z - p.z;
      return [R + (dx * -fz + dz * fx) * scale, R - (dx * fx + dz * fz) * scale] as const;
    };
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.clip();
    ctx.fillStyle = this.haunt > 0.5 ? "rgba(6,40,36,0.78)" : "rgba(8,47,73,0.72)";
    ctx.fillRect(0, 0, size, size);
    if (!trade) {
      // Edge of the cove.
      const [ox, oy] = map(0, 0);
      ctx.beginPath();
      ctx.arc(ox, oy, ARENA * scale, 0, TAU);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5 * this.view.dpr;
      ctx.setLineDash([4 * this.view.dpr, 4 * this.view.dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const s of this.world.shoals) {
      if (Math.abs(s.x - p.x) > view + s.r || Math.abs(s.z - p.z) > view + s.r) continue;
      const [x, y] = map(s.x, s.z);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, s.r * scale), 0, TAU);
      ctx.fillStyle = s.dock ? "#8a5634" : s.r > 6 ? "#e9cf9b" : "#94a3b8";
      ctx.fill();
    }
    const dot = (x: number, y: number, r: number, color: string) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = color;
      ctx.fill();
    };
    const d = this.view.dpr;
    for (const f of this.forts) {
      if (f.down) continue;
      const [x, y] = map(f.x, f.z);
      ctx.fillStyle = this.wave >= 2 ? "#f97316" : "#cbd5e1";
      ctx.fillRect(x - 3 * d, y - 3 * d, 6 * d, 6 * d);
    }
    for (const l of this.loot) {
      if (l.taken >= 0) continue;
      const [x, y] = map(l.x, l.z);
      dot(x, y, 2.2 * d, "#fcd34d");
    }
    const ship = (s: Ship, color: string, size: number) => {
      const [x, y] = map(s.x, s.z);
      const rel = s.heading - this.camYaw;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-rel);
      ctx.beginPath();
      ctx.moveTo(0, -size * d);
      ctx.lineTo(size * 0.6 * d, size * 0.7 * d);
      ctx.lineTo(-size * 0.6 * d, size * 0.7 * d);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    };
    if (trade) this.miniSeaMarks(ctx, map, R, d);
    for (const tr of this.traffic) ship(tr.ship, "rgba(255,255,255,0.75)", 3.5);
    for (const e of this.enemies) if (e.alive) ship(e, e.kind === "ghost" ? "#5dffb8" : "#f87171", e.kind === "ghost" ? 7 : 5);
    for (const r of this.remotes.values()) if (r.ship.alive && r.ship.root.visible) ship(r.ship, PLAYER_COLORS[r.color % PLAYER_COLORS.length], 5.5);
    // Range ring.
    ctx.beginPath();
    ctx.arc(R, R, this.range() * scale, 0, TAU);
    ctx.strokeStyle = "rgba(56,189,248,0.35)";
    ctx.lineWidth = 1 * d;
    ctx.stroke();
    ship(p, "#ffffff", 6);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, TAU);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2 * d;
    ctx.stroke();
  }
}

const TMP_COLOR = new THREE.Color();
const TMP_COLOR2 = new THREE.Color();
