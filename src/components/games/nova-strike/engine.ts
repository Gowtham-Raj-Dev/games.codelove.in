import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, Pool, type Fit, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { NOVA_RUSH } from "../shared/songs";
import { createBoss, type Boss } from "./bosses";
import { CRYSTAL_KEYS, Enemies, ROCK_KEYS, SATELLITE_KEYS, SHIPS, type BoltOpts, type Ctx, type Enemy, type KillInfo } from "./enemies";
import { Beams, Flashes, Glows, makeShieldBubble, Particles } from "./fx";
import { Hazards } from "./hazards";
import { M, MODELS } from "./manifest";
import { clamp, damp, newFrame, Rail, smooth } from "./rail";
import { Sfx } from "./sfx";
import { BOX, medalFor, STAGES, type Drop, type StageDef, type StageEvent } from "./stages";
import { World } from "./world";

// --- Public types ---------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "briefing" | "playing" | "paused" | "results" | "over" | "victory" | "error";

export interface Banner {
  id: number;
  text: string;
  sub?: string;
  tone: "info" | "warn" | "good";
}

export interface Hud {
  score: number;
  mult: number;
  combo: number;
  comboT: number;
  hits: number;
  shield: number;
  lives: number;
  bombs: number;
  boost: number;
  charge: number;
  locks: number;
  laser: number;
  stage: number;
  progress: number;
  checkpoint: number;
  boss: { name: string; hp: number } | null;
  banner: Banner | null;
  danger: boolean;
  hurt: number;
  bombFlash: number;
}

export interface StageResult {
  stage: number;
  name: string;
  hits: number;
  par: number;
  accuracy: number;
  shield: number;
  bonus: number;
  medal: number;
  score: number;
  last: boolean;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  error(message: string): void;
  results(r: StageResult): void;
  over(score: number, stage: number): void;
  victory(score: number): void;
}

export interface TouchInput {
  x: number;
  y: number;
}

// --- Tuning ---------------------------------------------------------------------------------------

const SPEED = 42;
const BOOST_SPEED = 70;
const BRAKE_SPEED = 24;
const MOVE = 17;
const LASER_SPEED = 280;
const LASER_LIFE = 0.85;
const FIRE_GAP = 0.09;
const CHARGE_DELAY = 0.26;
const CHARGE_TIME = 0.6;
const MAX_LOCKS = 4;
const LOCK_CONE = Math.cos(THREE.MathUtils.degToRad(11));
const ROLL_TIME = 0.55;
const ROLL_GAP = 0.8;
const INV_TIME = 1.0;
const CAM_BACK = 9.5;
const CAM_FOLLOW = 0.55;

const CYAN = new THREE.Color("#22d3ee");
const CYAN_HOT = new THREE.Color("#7df9ff");
const GREEN = new THREE.Color("#5dff9b");
const BLUE = new THREE.Color("#5b8cff");
const MAGENTA = new THREE.Color("#ff4fd8");
const RED = new THREE.Color("#ff2d55");
const ORANGE = new THREE.Color("#ff8a3c");
const YELLOW = new THREE.Color("#ffd166");
const WHITE = new THREE.Color("#ffffff");
const FIRE = new THREE.Color("#ff6a1f");

interface Shot {
  kind: "laser" | "homing" | "charge" | "bomb";
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  dir: THREE.Vector3;
  life: number;
  age: number;
  damage: number;
  target: Enemy | null;
  volley: number;
  alive: boolean;
}

interface Bolt {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  damage: number;
  size: number;
  color: THREE.Color;
  deflected: boolean;
  homing: number;
  alive: boolean;
}

interface SpeedLine {
  p: THREE.Vector3;
}

interface Snapshot {
  s: number;
  score: number;
  hits: number;
  fired: number;
  landed: number;
}

const f = newFrame();
const fa = newFrame();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, "YXZ");

const emptyHud = (): Hud => ({
  score: 0,
  mult: 1,
  combo: 0,
  comboT: 0,
  hits: 0,
  shield: 1,
  lives: 3,
  bombs: 3,
  boost: 1,
  charge: 0,
  locks: 0,
  laser: 1,
  stage: 0,
  progress: 0,
  checkpoint: 0.5,
  boss: null,
  banner: null,
  danger: false,
  hurt: 0,
  bombFlash: 0,
});

export class NovaStrikeGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(64, 1, 0.3, 3200);
  private readonly timer = new THREE.Timer();
  private readonly protos = new Map<string, Proto>();
  private readonly root = new THREE.Group();
  private pool!: Pool;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private envTexture: THREE.Texture | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private raf = 0;
  private disposed = false;
  private readonly coarse: boolean;
  private readonly maxRatio: number;
  private perf = { time: 0, frames: 0, good: 0, bloomOff: false };
  private portrait = false;
  private viewH = 720;

  readonly sfx = new Sfx();
  private readonly particles = new Particles(2600);
  private readonly glows = new Glows(1000);
  private readonly beams = new Beams(1600);
  private readonly flashes = new Flashes();
  private readonly bubble = makeShieldBubble();
  private world!: World;
  private enemies!: Enemies;
  private hazards!: Hazards;
  private ctx!: Ctx;
  private boss: Boss | null = null;

  // Ship.
  private readonly ship = new THREE.Group();
  private readonly shipBody = new THREE.Group();
  private readonly shipPos = new THREE.Vector3();
  private readonly aim = new THREE.Vector3(0, 0, -1);
  private readonly railVel = new THREE.Vector3();

  // State.
  private phase: Phase = "loading";
  private stage: StageDef = STAGES[0];
  private stageIndex = 0;
  private rail = new Rail(STAGES[0].rail);
  private s = 0;
  private prevS = 0;
  private speed = SPEED;
  private time = 0;
  private script: (StageEvent & { trigger: number })[] = [];
  private eventIdx = 0;
  private checkpoint: Snapshot = { s: 0, score: 0, hits: 0, fired: 0, landed: 0 };
  private bossStarted = false;
  private outro = -1;
  private deadT = -1;
  private introT = 0;

  private px = 0;
  private py = 0;
  private vx = 0;
  private vy = 0;
  private roll = { t: -1, dir: 1 };
  private rollGap = 0;
  private inv = 0;
  private shield = 100;
  private lives = 3;
  private bombs = 3;
  private laser = 1;
  private boostMeter = 1;
  private boostLock = false;
  private score = 0;
  private stageStartScore = 0;
  private hits = 0;
  private fired = 0;
  private landed = 0;
  private combo = 0;
  private comboT = 0;
  private shake = 0;
  private hurtCount = 0;
  private bombFlash = 0;

  // Weapons.
  private shots: Shot[] = [];
  private bolts: Bolt[] = [];
  private fireGap = 0;
  private fireHeld = false;
  private holdT = 0;
  private charge = 0;
  private charging = false;
  private locks: Enemy[] = [];
  private volley = 0;
  private volleyKills = new Map<number, number>();

  // Input.
  private readonly keys = new Set<string>();
  private touch: TouchInput = { x: 0, y: 0 };
  private touchActive = false;
  private touchBoost = false;
  private mouse: { x: number; y: number } | null = null;
  private invertY = false;

  // Camera.
  private camX = 0;
  private camY = 0;
  private camBack = CAM_BACK;
  private camRoll = 0;
  private fov = 64;
  private readonly camPos = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private menuAngle = 0;

  private readonly speedLines: SpeedLine[] = [];
  private banner: Banner | null = null;
  private bannerT = 0;
  private bannerId = 0;
  private hudT = 0;
  private hud = emptyHud();

  // Debug autopilot (temporary, for testing).
  autopilot = false;
  godMode = false;
  qualityLock = false;
  private fpsAvg = 60;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.maxRatio = Math.min(window.devicePixelRatio, this.coarse ? 1.5 : 1.75);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.maxRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.info.autoReset = false;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.32;
    this.scene.background = new THREE.Color("#05040f");
    this.scene.add(this.camera, this.root, this.ship, this.particles.points, this.glows.points, this.beams.mesh, this.flashes.group);
    this.ship.add(this.shipBody);
    this.ship.visible = false;
    this.bubble.mesh.scale.set(1.9, 1.3, 2.4);
    this.ship.add(this.bubble.mesh);
    for (let i = 0; i < 46; i++) this.speedLines.push({ p: new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, -Math.random() * 160) });

    this.setupComposer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  private setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: this.coarse ? 0 : 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.72, 0.42, 0.86);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  // --- Loading --------------------------------------------------------------------------------------

  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const proto = (key: string, fit: Fit, centered = true) => {
        const m = models.get(key);
        if (!m) return;
        const p = makeProto(m.scene, m.animations, fit, { shadows: false });
        if (centered) p.object.children[0].position.y -= p.size.y / 2;
        this.protos.set(key, p);
      };
      const unit = (key: string, centered = true) => {
        const m = models.get(key);
        if (!m) return;
        m.scene.position.set(0, 0, 0);
        m.scene.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(m.scene, true).getSize(new THREE.Vector3());
        proto(key, { scale: 1 / Math.max(size.x, size.y, size.z, 1e-6) }, centered);
      };

      proto(M.player, { length: 2.5 });
      for (const def of Object.values(SHIPS)) if (!this.protos.has(def.key)) proto(def.key, { length: def.length });
      proto(M.cargoB, { length: SHIPS.cargo.length });
      for (const k of [...ROCK_KEYS, ...CRYSTAL_KEYS, ...SATELLITE_KEYS]) unit(k);
      proto(M.drone, { width: 3.2 });
      proto(M.turretSingle, { height: 2.8 }, false);
      proto(M.turretDouble, { height: 2.6 }, false);
      proto(M.stardust, { width: 7.6 });
      proto(M.rocketTop, { height: 2.2 });
      proto(M.rifle, { length: 3.2 });
      for (const k of [M.structure, M.structureClosed, M.structureDiagonal, M.supports, M.platformHigh, M.pipe, M.floor, M.floorDetail, M.wall, M.wallWindow, M.wallPillar, M.container, M.barrier, M.display, M.hangarGlass, M.laserGate]) proto(k, { scale: 1 }, false);
      for (const k of [M.generator, M.gateComplex, M.dish, M.mir, M.miner]) if (!this.protos.has(k)) unit(k);
      for (const k of [M.ringedPlanet, M.pinkPlanet, M.bennu]) unit(k);

      const required = [M.player, M.speederA, M.meteor, M.stardust];
      if (!required.every((k) => this.protos.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      // Rings glow gold; backdrops ignore the fog.
      this.protos.get(M.stardust)!.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = (mesh.material as THREE.MeshStandardMaterial).clone();
        m.color.set("#ffe08a");
        m.emissive = new THREE.Color("#ffb627");
        m.emissiveIntensity = 1.4;
        m.side = THREE.DoubleSide;
        mesh.material = m;
      });
      for (const k of [M.ringedPlanet, M.pinkPlanet, M.bennu]) {
        this.protos.get(k)?.object.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const std = m as THREE.MeshStandardMaterial;
            std.fog = false;
            // The giant asteroid reads better dark, lit from one side.
            if (k === M.bennu) std.color.multiplyScalar(0.45);
          }
        });
      }

      this.pool = new Pool(this.protos, this.root);
      const body = this.protos.get(M.player)!.object.clone();
      this.shipBody.add(body);
      this.world = new World(this.protos, this.scene);
      this.setupCtx();
      this.enemies = new Enemies(this.ctx);
      this.enemies.onKill = (k) => this.onKill(k);
      this.enemies.onDrop = (d, e) => this.hazards.drop(d, e.s, e.x, e.y);
      this.hazards = new Hazards(this.ctx, this.enemies);
      this.hazards.onRing = () => this.onRing();
      this.hazards.onPickup = (k) => this.onPickup(k);
      this.setStage(0);
      this.toMenu();
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private setupCtx() {
    const live = {} as Pick<Ctx, "rail" | "s" | "speed" | "time" | "stage" | "px" | "py" | "pvx" | "pvy">;
    Object.defineProperties(live, {
      rail: { get: () => this.rail },
      s: { get: () => this.s },
      speed: { get: () => this.speed / this.rail.stretch(this.s) },
      time: { get: () => this.time },
      stage: { get: () => this.stageIndex },
      px: { get: () => this.px },
      py: { get: () => this.py },
      pvx: { get: () => this.vx },
      pvy: { get: () => this.vy },
    });
    this.ctx = Object.assign(live, {
      player: this.shipPos,
      pool: this.pool,
      protos: this.protos,
      root: this.root,
      particles: this.particles,
      glows: this.glows,
      beams: this.beams,
      flashes: this.flashes,
      sfx: this.sfx,
      fire: (from, opts) => this.enemyFire(from, opts),
      explode: (pos, size, color) => this.explode(pos, size, color),
      shake: (a) => (this.shake = Math.max(this.shake, a)),
      hurt: (dmg, from) => this.hurt(dmg, from),
      bolts: () => this.bolts.length,
      railVel: this.railVel,
    } satisfies Omit<Ctx, keyof typeof live>);
  }

  // --- Public API -----------------------------------------------------------------------------------

  setInvertY(on: boolean) {
    this.invertY = on;
  }

  /** Attract mode: the ship idles along the first stage. */
  toMenu() {
    this.clearPlay();
    this.setStage(0);
    this.s = 0;
    this.ship.visible = true;
    this.px = this.py = this.vx = this.vy = 0;
    this.sfx.silence();
    music.play(NOVA_RUSH, 0);
    music.duck(false);
    this.setPhase("menu");
  }

  /** New run from a stage (stage select starts later stages fresh). */
  newRun(stageIndex: number) {
    audio.unlock();
    this.score = 0;
    this.lives = 3;
    this.bombs = 3;
    this.laser = 1;
    this.brief(stageIndex);
  }

  /** Shows the briefing for a stage (scenery preview behind the card). */
  brief(stageIndex: number) {
    this.clearPlay();
    this.setStage(stageIndex);
    this.s = 0;
    this.ship.visible = true;
    this.px = this.py = 0;
    music.play(NOVA_RUSH, 0);
    music.duck(false);
    this.setPhase("briefing");
  }

  /** Launches the briefed stage. */
  launch() {
    audio.unlock();
    this.clearPlay();
    this.stageStartScore = this.score;
    this.hits = 0;
    this.fired = 0;
    this.landed = 0;
    this.checkpoint = { s: 0, score: this.score, hits: 0, fired: 0, landed: 0 };
    this.startAt(0);
    this.introT = 0;
    this.showBanner(`Stage ${this.stageIndex + 1}`, this.stage.name, "info", 3);
    this.sfx.start();
    music.play(NOVA_RUSH, 1);
    music.duck(false);
    this.setPhase("playing");
  }

  /** After a game over: lives refilled, score reset, back to the last checkpoint. */
  continueRun() {
    audio.unlock();
    this.lives = 3;
    this.bombs = Math.max(this.bombs, 3);
    this.score = 0;
    this.stageStartScore = 0;
    this.checkpoint.score = 0;
    this.respawn();
    music.play(NOVA_RUSH, this.bossStarted ? 2 : 1);
    music.duck(false);
    this.setPhase("playing");
  }

  nextStage() {
    if (this.stageIndex >= STAGES.length - 1) return;
    this.brief(this.stageIndex + 1);
  }

  pause() {
    if (this.phase !== "playing") return;
    this.sfx.silence();
    this.releaseFire(false);
    music.duck(true);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.keys.clear();
    this.setPhase("playing");
  }

  get currentPhase() {
    return this.phase;
  }

  get runScore() {
    return this.score;
  }

  get stageNumber() {
    return this.stageIndex;
  }

  // Input -----------------------------------------------------------------------------------------

  keyDown(code: string) {
    if (this.phase !== "playing") return;
    this.keys.add(code);
    this.mouse = null;
    if (code === "Space" || code === "KeyJ") this.pressFire();
    else if (code === "KeyQ") this.startRoll(-1);
    else if (code === "KeyE") this.startRoll(1);
    else if (code === "KeyB") this.dropBomb();
    else if (code === "ShiftLeft" || code === "ShiftRight") this.sfx.boost();
    else if (code === "KeyC" || code === "KeyX") this.sfx.brake();
  }

  keyUp(code: string) {
    this.keys.delete(code);
    if ((code === "Space" || code === "KeyJ") && !this.keys.has("Space") && !this.keys.has("KeyJ")) this.releaseFire(true);
  }

  clearKeys() {
    this.keys.clear();
    this.releaseFire(false);
  }

  /** Mouse steering: normalised screen position (-1..1). */
  mouseMove(x: number, y: number) {
    if (this.phase !== "playing") return;
    this.mouse = { x, y };
  }

  pointerFire(down: boolean) {
    if (this.phase !== "playing") return;
    if (down) this.pressFire();
    else this.releaseFire(true);
  }

  setTouch(t: TouchInput | null) {
    this.touchActive = !!t;
    this.touch = t ?? { x: 0, y: 0 };
    if (t) this.mouse = null;
  }

  setBoost(on: boolean) {
    this.touchBoost = on;
    if (on) this.sfx.boost();
  }

  touchRoll() {
    this.startRoll(this.vx < -2 ? -1 : 1);
  }

  touchBomb() {
    this.dropBomb();
  }

  // --- Stage setup ------------------------------------------------------------------------------------

  private setStage(index: number) {
    this.stageIndex = index;
    this.stage = STAGES[index];
    this.rail = new Rail(this.stage.rail);
    this.world.setStage(this.stage);
    this.script = this.stage.events
      .map((e) => ({ ...e, trigger: e.kind === "wave" || e.kind === "cargo" ? e.at - 150 : e.kind === "meteors" ? e.at - 210 : e.kind === "message" || e.kind === "checkpoint" ? e.at : e.at - 330 }))
      .sort((a, b) => a.trigger - b.trigger);
  }

  private clearPlay() {
    this.enemies?.clear();
    this.hazards?.clear();
    this.boss?.dispose();
    this.boss = null;
    this.bossStarted = false;
    this.shots = [];
    this.bolts = [];
    this.locks = [];
    this.particles.clear();
    this.flashes.clear();
    this.outro = -1;
    this.deadT = -1;
    this.charge = 0;
    this.charging = false;
    this.fireHeld = false;
    this.holdT = 0;
    this.sfx.silence();
    this.banner = null;
    this.combo = 0;
    this.comboT = 0;
    this.inv = 0;
    this.roll.t = -1;
  }

  /** Puts the ship at rail distance s with a fresh shield; events after s are re-armed. */
  private startAt(s: number) {
    this.s = this.prevS = s;
    this.px = this.py = this.vx = this.vy = 0;
    this.camX = this.camY = 0;
    this.shield = 100;
    this.boostMeter = 1;
    this.speed = SPEED;
    this.inv = 1.5;
    this.ship.visible = true;
    this.eventIdx = 0;
    while (this.eventIdx < this.script.length && this.script[this.eventIdx].at < s + 20) this.eventIdx++;
  }

  private respawn() {
    const cp = this.checkpoint;
    this.clearPlay();
    this.score = cp.score;
    this.hits = cp.hits;
    this.fired = cp.fired;
    this.landed = cp.landed;
    this.laser = 1;
    const atBoss = cp.s >= this.stage.length;
    this.startAt(atBoss ? this.stage.length - 220 : Math.max(0, cp.s - 40));
    if (atBoss) {
      // Straight back into the boss fight.
      this.eventIdx = this.script.length;
    }
    this.showBanner(atBoss ? "Boss" : cp.s > 0 ? "Checkpoint" : `Stage ${this.stageIndex + 1}`, this.stage.name, "info", 2.2);
  }

  // --- Events -------------------------------------------------------------------------------------------

  private runEvents() {
    while (this.eventIdx < this.script.length && this.s >= this.script[this.eventIdx].trigger) {
      const ev = this.script[this.eventIdx++];
      if (ev.kind === "message") continue;
      if (ev.kind === "checkpoint") {
        this.checkpoint = { s: ev.at, score: this.score, hits: this.hits, fired: this.fired, landed: this.landed };
        this.showBanner("Checkpoint", "Progress saved", "good", 2);
        this.sfx.checkpoint();
        continue;
      }
      if (ev.kind === "meteors") this.showBanner("Meteors!", ev.side > 0 ? "Incoming from the right" : "Incoming from the left", "warn", 1.6);
      this.enemies.spawnEvent(ev);
      this.hazards.spawnEvent(ev);
    }
    if (!this.bossStarted && this.s >= this.stage.length - 200) this.startBoss();
  }

  private startBoss() {
    this.bossStarted = true;
    this.checkpoint = { s: this.stage.length, score: this.score, hits: this.hits, fired: this.fired, landed: this.landed };
    this.boss = createBoss(this.stage.boss, this.ctx, this.enemies);
    this.sfx.siren();
    this.showBanner("Warning", this.stage.bossName + " approaching", "warn", 3.2);
    music.play(NOVA_RUSH, 2);
  }

  // --- Frame ----------------------------------------------------------------------------------------------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(now);
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 1 / 20);
    if (this.phase === "loading" || this.phase === "error") return;
    this.renderer.info.reset();
    this.adaptQuality(raw);
    const frozen = this.phase === "paused";
    if (!frozen) this.time += dt;
    this.beams.begin(this.camera);

    if (this.phase === "playing") this.updatePlay(dt);
    else if (this.phase === "menu" || this.phase === "briefing" || this.phase === "results" || this.phase === "victory" || this.phase === "over") this.updateIdle(dt);

    if (!frozen) {
      this.enemies.render();
      this.particles.update(dt);
      this.flashes.update(dt);
    } else {
      // Keep drawing what was on screen.
      this.enemies.render();
    }
    this.updateShipVisual(frozen ? 0 : dt);
    this.updateCamera(frozen ? 0 : dt);
    this.world.update(this.rail, this.s, this.camera, this.time);
    this.drawSpeedLines(frozen ? 0 : dt);
    this.glows.flush();
    this.beams.flush();
    if (this.composer && !this.perf.bloomOff) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.emitHud(dt);
  };

  /** Menus, briefing, results: the ship cruises along the rail. */
  private updateIdle(dt: number) {
    const cruise = this.phase === "results" || this.phase === "victory" ? 30 : 16;
    this.speed = damp(this.speed, cruise, 2, dt);
    this.advance(dt);
    this.px = damp(this.px, Math.sin(this.time * 0.4) * 1.5, 1, dt);
    this.py = damp(this.py, Math.sin(this.time * 0.6) * 0.6, 1, dt);
    this.vx = Math.cos(this.time * 0.4) * 0.6 * 1.5;
    this.vy = 0;
    if (this.phase === "results" || this.phase === "victory") {
      this.enemies.update(dt);
      this.updateShots(dt);
    }
    this.sfx.engineHum(this.phase === "over" ? 0 : 0.5, 0);
  }

  private advance(dt: number) {
    this.prevS = this.s;
    this.s += (this.speed / this.rail.stretch(this.s)) * dt;
    this.rail.frame(this.s, f);
    this.railVel.copy(f.fwd).multiplyScalar(this.speed);
    this.shipPos.copy(f.pos).addScaledVector(f.right, this.px).addScaledVector(f.up, this.py);
  }

  private updatePlay(dt: number) {
    this.introT += dt;
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = null;
    }
    if (this.deadT >= 0) {
      this.updateDead(dt);
      return;
    }
    if (this.autopilot) this.autoPilot();
    this.updateFlight(dt);
    this.advance(dt);
    if (this.outro < 0) this.runEvents();

    this.enemies.update(dt);
    if (this.boss) {
      this.boss.update(dt);
      if (this.boss.dead && this.outro < 0) this.stageClear();
    }
    this.hazards.update(dt, this.prevS);
    this.updateWeapons(dt);
    this.updateShots(dt);
    this.updateBolts(dt);
    this.collide();
    this.drawReticle();

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (this.inv > 0) this.inv -= dt;
    if (this.outro >= 0) {
      this.outro += dt;
      if (this.outro > 3.2) this.finishStage();
    }
    if (this.hazards.gateAhead(160) && Math.floor(this.time * 2) % 2 === 0) this.sfx.alert();
  }

  // --- Flight ---------------------------------------------------------------------------------------------

  private box() {
    return this.portrait ? { x: 5, y: 5.4 } : BOX;
  }

  private updateFlight(dt: number) {
    const k = this.keys;
    let ix = 0;
    let iy = 0;
    if (k.has("ArrowLeft") || k.has("KeyA")) ix -= 1;
    if (k.has("ArrowRight") || k.has("KeyD")) ix += 1;
    if (k.has("ArrowUp") || k.has("KeyW")) iy += 1;
    if (k.has("ArrowDown") || k.has("KeyS")) iy -= 1;
    if (this.invertY) iy = -iy;
    const box = this.box();
    let tx = ix * MOVE;
    let ty = iy * MOVE;
    if (this.touchActive) {
      tx = this.touch.x * MOVE;
      ty = this.touch.y * MOVE * (this.invertY ? -1 : 1);
    } else if (this.mouse && !ix && !iy) {
      tx = clamp((this.mouse.x * box.x - this.px) * 5, -MOVE * 1.2, MOVE * 1.2);
      ty = clamp((this.mouse.y * box.y - this.py) * 5, -MOVE * 1.2, MOVE * 1.2);
    }
    if (this.outro >= 0) {
      tx = -this.px * 2;
      ty = (2 - this.py) * 2;
    }
    this.vx = damp(this.vx, tx, 9, dt);
    this.vy = damp(this.vy, ty, 9, dt);
    // Barrel roll.
    if (this.roll.t >= 0) {
      this.roll.t += dt;
      if (this.roll.t >= ROLL_TIME) this.roll.t = -1;
    }
    if (this.rollGap > 0) this.rollGap -= dt;
    this.px += this.vx * dt;
    this.py += this.vy * dt;
    if (Math.abs(this.px) > box.x) {
      this.px = Math.sign(this.px) * box.x;
      this.vx *= 0.3;
    }
    if (Math.abs(this.py) > box.y) {
      this.py = Math.sign(this.py) * box.y;
      this.vy *= 0.3;
    }
    // Boost / brake.
    const wantBoost = k.has("ShiftLeft") || k.has("ShiftRight") || this.touchBoost || this.outro > 0.5;
    const wantBrake = k.has("KeyC") || k.has("KeyX");
    let target = SPEED;
    if (this.boostMeter <= 0.01) this.boostLock = true;
    if (this.boostLock && this.boostMeter > 0.35) this.boostLock = false;
    if (wantBoost && !this.boostLock) {
      target = BOOST_SPEED;
      if (this.outro < 0) this.boostMeter = Math.max(0, this.boostMeter - dt * 0.5);
    } else if (wantBrake && !this.boostLock) {
      target = BRAKE_SPEED;
      this.boostMeter = Math.max(0, this.boostMeter - dt * 0.35);
    } else this.boostMeter = Math.min(1, this.boostMeter + dt * 0.22);
    if (this.introT < 1.2) target = SPEED + 30 * (1 - this.introT / 1.2);
    this.speed = damp(this.speed, target, 3, dt);
    const boostAmt = clamp((this.speed - SPEED) / (BOOST_SPEED - SPEED), -1, 1);
    this.sfx.engineHum(1, Math.max(0, boostAmt));
  }

  private startRoll(dir: number) {
    if (this.phase !== "playing" || this.deadT >= 0 || this.rollGap > 0) return;
    this.roll = { t: 0, dir };
    this.rollGap = ROLL_GAP;
    this.vx += dir * 12;
    this.sfx.roll();
  }

  private updateShipVisual(dt: number) {
    if (!this.ship.visible) return;
    this.rail.frame(this.s, f);
    this.shipPos.copy(f.pos).addScaledVector(f.right, this.px).addScaledVector(f.up, this.py);
    this.ship.position.copy(this.shipPos);
    const nx = this.vx / MOVE;
    const ny = this.vy / MOVE;
    let rollAngle = 0;
    if (this.roll.t >= 0) rollAngle = -this.roll.dir * Math.PI * 2 * smooth(this.roll.t / ROLL_TIME);
    const idle = this.phase !== "playing";
    tmpE.set(ny * 0.32 + (idle ? Math.sin(this.time * 1.3) * 0.04 : 0), -nx * 0.3, -nx * 0.8 + rollAngle + (idle ? Math.sin(this.time * 0.9) * 0.12 : 0));
    this.ship.quaternion.copy(f.quat).multiply(tmpQ.setFromEuler(tmpE));
    // Aim follows the nose a little.
    this.aim.copy(f.fwd).addScaledVector(f.right, nx * 0.17).addScaledVector(f.up, ny * 0.17).normalize();

    // Engine flames: a short beam out of each nozzle plus a hot glow.
    const boost = clamp((this.speed - SPEED) / (BOOST_SPEED - SPEED), -1, 1);
    const col = boost > 0.2 ? CYAN_HOT : CYAN;
    const flame = 0.55 + Math.max(0, boost) * 1.1 + (boost < 0 ? boost * 0.3 : 0) + Math.random() * 0.15;
    for (const side of [-1, 1]) {
      tmpV.set(side * 0.3, 0.02, 1.1).applyQuaternion(this.ship.quaternion).add(this.shipPos);
      tmpV2.set(side * 0.3, 0.02, 1.1 + flame).applyQuaternion(this.ship.quaternion).add(this.shipPos);
      this.beams.add(tmpV, tmpV2, 0.24 + Math.max(0, boost) * 0.08, col, 1.1);
      this.glows.add(tmpV, col, 0.5 + Math.max(0, boost) * 0.3, 1);
      if (dt > 0 && this.deadT < 0 && Math.random() < 0.5) this.particles.emit(tmpV2, this.railVel.x * 0.3, this.railVel.y * 0.3, this.railVel.z * 0.3, col, 0.22, 0.25, 1, -0.5);
    }
    // Shield bubble: on hits and during rolls.
    const rolling = this.roll.t >= 0;
    const hitGlow = this.inv > 0 && this.deadT < 0 ? Math.max(0, this.inv - INV_TIME + 0.4) * 2.5 : 0;
    const strength = Math.max(rolling ? 0.9 : 0, hitGlow);
    this.bubble.mesh.visible = strength > 0.02;
    this.bubble.material.uniforms.strength.value = strength;
    this.bubble.material.uniforms.time.value = this.time;
    this.bubble.material.uniforms.color.value.copy(hitGlow > 0.1 ? RED : CYAN);
    // Blink while invulnerable after respawn.
    this.shipBody.visible = !(this.inv > 0 && this.inv < 1.5 && this.introT > 0.2 && hitGlow <= 0 && Math.floor(this.time * 16) % 2 === 0 && this.phase === "playing");
  }

  // --- Weapons ----------------------------------------------------------------------------------------------

  private pressFire() {
    if (this.phase !== "playing" || this.deadT >= 0 || this.outro >= 0) return;
    this.fireHeld = true;
    this.holdT = 0;
    if (this.fireGap <= 0) this.fireLaser();
  }

  private releaseFire(shoot: boolean) {
    if (!this.fireHeld) return;
    this.fireHeld = false;
    if (this.charging) this.sfx.chargeStop();
    if (shoot && this.charge >= 1 && this.phase === "playing" && this.deadT < 0) {
      const live = this.locks.filter((e) => e.alive);
      if (live.length) {
        this.volley++;
        this.volleyKills.set(this.volley, 0);
        live.forEach((e, i) => this.spawnShot("homing", e, i));
        this.sfx.homing(live.length);
      } else {
        this.spawnShot("charge", null, 0);
        this.sfx.chargeShot();
      }
      this.fired++;
    }
    this.charging = false;
    this.charge = 0;
    this.holdT = 0;
    this.locks = [];
  }

  private fireLaser() {
    this.fireGap = FIRE_GAP;
    this.fired++;
    this.spawnShot("laser", null, -1);
    this.spawnShot("laser", null, 1);
    this.sfx.laser(this.laser);
  }

  private spawnShot(kind: Shot["kind"], target: Enemy | null, side: number) {
    this.rail.frame(this.s, f);
    const dir = this.aim.clone();
    // Aim assist: bend lasers towards a target close to the reticle.
    if (kind === "laser" || kind === "charge") {
      let best: Enemy | null = null;
      let bestDot = Math.cos(THREE.MathUtils.degToRad(kind === "charge" ? 6 : 3.5));
      this.enemies.forEachAlive((e) => {
        if (e.armored || e.d > 380) return;
        tmpV.subVectors(e.pos, this.shipPos);
        const dist = tmpV.length();
        if (dist < 8 || dist > 240) return;
        const dot = tmpV.dot(dir) / dist;
        if (dot > bestDot) {
          bestDot = dot;
          best = e;
        }
      });
      if (best) dir.copy((best as Enemy).pos).sub(this.shipPos).normalize();
    }
    const offset = tmpV.set(side * 0.75, -0.05, -0.6).applyQuaternion(this.ship.quaternion);
    const pos = this.shipPos.clone().add(kind === "laser" ? offset : tmpV.set(0, 0, 0));
    const speed = kind === "laser" ? LASER_SPEED : kind === "charge" ? 190 : kind === "bomb" ? 110 : 70;
    const shot: Shot = {
      kind,
      pos,
      prev: pos.clone(),
      vel: dir.clone().multiplyScalar(speed).add(this.railVel),
      dir,
      life: kind === "laser" ? LASER_LIFE : kind === "bomb" ? 0.75 : 3,
      age: 0,
      damage: kind === "laser" ? (this.laser > 1 ? 2 : 1) : kind === "charge" ? 6 : 5,
      target,
      volley: kind === "homing" ? this.volley : 0,
      alive: true,
    };
    if (kind === "homing") {
      // Fan out before curving in.
      shot.vel.copy(this.railVel).addScaledVector(f.up, 18).addScaledVector(f.right, (side - 1.5) * 14).addScaledVector(dir, 40);
    }
    this.shots.push(shot);
  }

  private dropBomb() {
    if (this.phase !== "playing" || this.deadT >= 0 || this.outro >= 0) return;
    if (this.bombs <= 0 || this.shots.some((s) => s.kind === "bomb")) return;
    this.bombs--;
    this.spawnShot("bomb", null, 0);
    this.sfx.bombLaunch();
  }

  private detonate(at: THREE.Vector3) {
    this.flashes.spawn(at, 70, WHITE, 0.6);
    this.flashes.spawn(at, 60, MAGENTA, 1.1, true, this.ship.quaternion);
    this.flashes.spawn(at, 35, MAGENTA, 0.8);
    this.particles.burst(at, 120, 70, MAGENTA, 2.2, 1.1, this.railVel, 1.2, 1);
    this.particles.burst(at, 60, 40, WHITE, 1.4, 0.7, this.railVel, 1.5);
    this.sfx.bomb();
    this.shake = Math.max(this.shake, 1.2);
    this.bombFlash++;
    // Clear the sky.
    for (const b of this.bolts) {
      if (!b.deflected) {
        b.alive = false;
        this.particles.burst(b.pos, 3, 6, b.color, 0.5, 0.3);
      }
    }
    this.enemies.forEachAlive((e) => {
      if (e.pos.distanceTo(at) > 75 || e.s < this.s - 5) return;
      if (e.boss && e.armored) return;
      this.enemies.damage(e, e.boss ? 10 : 14, e.pos);
    });
  }

  private updateWeapons(dt: number) {
    if (this.fireGap > 0) this.fireGap -= dt;
    if (!this.fireHeld) return;
    this.holdT += dt;
    if (this.holdT > CHARGE_DELAY) {
      if (!this.charging) {
        this.charging = true;
        this.sfx.chargeStart();
      }
      const before = this.charge;
      this.charge = Math.min(1, (this.holdT - CHARGE_DELAY) / CHARGE_TIME);
      if (before < 1 && this.charge >= 1) this.sfx.charged();
    }
    if (this.charge >= 1 && this.locks.length < MAX_LOCKS) {
      // Sweep: lock whatever passes under the reticle.
      let best: Enemy | null = null;
      let bestDot = LOCK_CONE;
      this.enemies.forEachAlive((e) => {
        if (!e.lockable || e.armored || e.locked || e.d > 380) return;
        tmpV.subVectors(e.pos, this.shipPos);
        const dist = tmpV.length();
        if (dist < 10 || dist > 260) return;
        const dot = tmpV.dot(this.aim) / dist;
        if (dot > bestDot) {
          bestDot = dot;
          best = e;
        }
      });
      if (best) {
        (best as Enemy).locked = true;
        this.locks.push(best);
        this.sfx.lock(this.locks.length);
      }
    }
    this.locks = this.locks.filter((e) => {
      if (!e.alive) return false;
      return true;
    });
  }

  private updateShots(dt: number) {
    for (const sh of this.shots) {
      if (!sh.alive) continue;
      sh.age += dt;
      sh.life -= dt;
      sh.prev.copy(sh.pos);
      if (sh.kind === "homing") {
        const t = sh.target;
        if (!t || !t.alive) sh.target = null;
        const speed = Math.min(230, 70 + sh.age * 260);
        if (sh.target) {
          tmpV.subVectors(sh.target.pos, sh.pos).normalize().multiplyScalar(speed).add(this.railVel);
          sh.vel.lerp(tmpV, 1 - Math.exp(-(4 + sh.age * 14) * dt));
        } else sh.vel.addScaledVector(sh.dir, 200 * dt);
        sh.dir.copy(sh.vel).sub(this.railVel).normalize();
      }
      sh.pos.addScaledVector(sh.vel, dt);
      if (sh.kind === "bomb") {
        if (sh.life <= 0 || this.enemies.hitSegment(sh.prev, sh.pos, 1.5)) {
          sh.alive = false;
          this.detonate(sh.pos);
        }
        continue;
      }
      const hit = this.enemies.hitSegment(sh.prev, sh.pos, sh.kind === "laser" ? (this.laser > 1 ? 0.5 : 0.3) : 1.2);
      if (hit) {
        sh.alive = false;
        if (sh.kind === "charge") {
          this.chargeBlast(sh.pos);
        } else {
          const wasArmored = hit.armored;
          if (!wasArmored && sh.kind === "laser") this.landed++;
          if (!wasArmored && sh.kind === "homing") this.landed++;
          const died = this.enemies.damage(hit, sh.damage, sh.pos);
          if (died && sh.kind === "homing") this.volleyKills.set(sh.volley, (this.volleyKills.get(sh.volley) ?? 0) + 1);
          this.particles.burst(sh.pos, 4, 10, this.laser > 1 ? BLUE : GREEN, 0.5, 0.2);
        }
        continue;
      }
      if (sh.life <= 0) {
        if (sh.kind === "charge") this.chargeBlast(sh.pos);
        sh.alive = false;
      }
    }
    this.shots = this.shots.filter((s) => s.alive);
    // Lock-on volley bonus once its shots are spent.
    for (const [v, kills] of this.volleyKills) {
      if (this.shots.some((s) => s.volley === v)) continue;
      this.volleyKills.delete(v);
      if (kills >= 2) {
        const bonus = 150 * kills * kills;
        this.score += bonus;
        this.showBanner(`${kills}x Lock`, `+${bonus}`, "good", 1.4);
        this.sfx.combo(kills * 2);
      }
    }
    // Draw.
    for (const sh of this.shots) {
      if (sh.kind === "laser") {
        const col = this.laser > 1 ? BLUE : GREEN;
        tmpV.copy(sh.pos).addScaledVector(sh.dir, -6);
        this.beams.add(tmpV, sh.pos, this.laser > 1 ? 0.55 : 0.38, col, 1.6);
      } else if (sh.kind === "homing") {
        this.glows.add(sh.pos, MAGENTA, 2.2, 1.4);
        this.particles.emit(sh.pos, 0, 0, 0, MAGENTA, 0.9, 0.35, 1, -0.5);
      } else if (sh.kind === "charge") {
        this.glows.add(sh.pos, CYAN_HOT, 4.5, 1.6);
        this.particles.emit(sh.pos, 0, 0, 0, CYAN, 1.6, 0.3, 1, -0.6);
      } else {
        this.glows.add(sh.pos, MAGENTA, 3.5 + Math.sin(this.time * 40) * 0.8, 1.5);
        this.particles.emit(sh.pos, 0, 0, 0, MAGENTA, 1.2, 0.4, 1, -0.4);
      }
    }
  }

  private chargeBlast(at: THREE.Vector3) {
    this.flashes.spawn(at, 9, CYAN, 0.35);
    this.particles.burst(at, 40, 22, CYAN, 1.1, 0.5, this.railVel);
    this.sfx.explosion(1);
    let hitAny = false;
    this.enemies.forEachAlive((e) => {
      if (e.pos.distanceTo(at) < 10 + e.radius) {
        if (!e.armored) hitAny = true;
        this.enemies.damage(e, 6, e.pos);
      }
    });
    if (hitAny) this.landed++;
  }

  // --- Enemy fire ---------------------------------------------------------------------------------------------

  private enemyFire(from: THREE.Vector3, o: BoltOpts = {}) {
    const speed = o.speed ?? 50;
    const dir = new THREE.Vector3();
    this.rail.frame(this.s, f);
    if (o.dir) dir.copy(o.dir).normalize();
    else {
      // Aim at the player (in the moving rail frame), leading a little.
      tmpV.copy(this.shipPos);
      const dist = from.distanceTo(this.shipPos);
      if (o.lead) {
        const t = dist / speed;
        tmpV.addScaledVector(f.right, this.vx * t * 0.6).addScaledVector(f.up, this.vy * t * 0.6);
      }
      dir.subVectors(tmpV, from).normalize();
      if (o.spread) dir.applyAxisAngle(f.up, o.spread);
    }
    this.bolts.push({
      pos: from.clone(),
      prev: from.clone(),
      vel: dir.multiplyScalar(speed).add(this.railVel),
      life: 4,
      damage: o.damage ?? 10,
      size: o.size ?? 1.1,
      color: o.color ?? RED,
      deflected: false,
      homing: o.homing ?? 0,
      alive: true,
    });
    this.glows.add(from, o.color ?? RED, 3, 1.4);
  }

  private updateBolts(dt: number) {
    this.rail.frame(this.s, f);
    const rolling = this.roll.t >= 0;
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.life -= dt;
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      if (b.life <= 0) {
        b.alive = false;
        continue;
      }
      // Behind the player: gone.
      tmpV.subVectors(b.pos, this.shipPos);
      if (tmpV.dot(f.fwd) < -12) {
        b.alive = false;
        continue;
      }
      if (b.deflected) {
        const hit = this.enemies.hitSegment(b.prev, b.pos, 0.6);
        if (hit) {
          b.alive = false;
          this.enemies.damage(hit, 3, b.pos);
        }
        continue;
      }
      if (this.deadT >= 0 || this.outro >= 0) continue;
      // Segment vs the ship.
      tmpV2.subVectors(b.pos, b.prev);
      const len2 = tmpV2.lengthSq();
      const t = len2 > 0 ? clamp(tmpV3.subVectors(this.shipPos, b.prev).dot(tmpV2) / len2, 0, 1) : 0;
      tmpV3.copy(b.prev).addScaledVector(tmpV2, t);
      const r = rolling ? 2.0 : 1.0;
      if (tmpV3.distanceTo(this.shipPos) < r + b.size * 0.3) {
        if (rolling) {
          // Deflected: bounce forward, now dangerous to enemies.
          b.deflected = true;
          b.life = 1.2;
          b.vel.copy(f.fwd).multiplyScalar(160).addScaledVector(f.right, (Math.random() - 0.5) * 40).addScaledVector(f.up, (Math.random() - 0.5) * 30).add(this.railVel);
          b.color = CYAN_HOT;
          this.particles.burst(b.pos, 8, 16, CYAN, 0.6, 0.25, this.railVel);
          this.sfx.deflect();
        } else {
          b.alive = false;
          this.hurt(b.damage, b.pos);
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.alive);
    for (const b of this.bolts) {
      this.glows.add(b.pos, b.color, b.size * 2.2, 1.3);
      tmpV.subVectors(b.vel, this.railVel).normalize();
      tmpV2.copy(b.pos).addScaledVector(tmpV, -2.2);
      this.beams.add(tmpV2, b.pos, b.size * 0.55, b.color, 1.2);
    }
  }

  // --- Collisions & damage --------------------------------------------------------------------------------------

  private collide() {
    if (this.deadT >= 0 || this.outro >= 0) return;
    this.enemies.forEachAlive((e) => {
      if (!e.collide || e.boss) return;
      if (e.kind === "ship" && e.d > 300) return;
      const r = e.radius + 0.8;
      if (e.pos.distanceToSquared(this.shipPos) > r * r) return;
      if (this.inv > 0) return;
      this.hurt(e.collide, e.pos);
      if (e.kind === "satellite" || e.ship === "cargo" || e.ship === "miner" || e.ship === "gunship") this.enemies.damage(e, 3, e.pos, false);
      else this.enemies.kill(e, false);
      this.shake = Math.max(this.shake, 0.7);
    });
  }

  private hurt(damage: number, from: THREE.Vector3) {
    if (this.phase !== "playing" || this.deadT >= 0 || this.outro >= 0 || this.inv > 0) return;
    if (this.godMode) damage = 0;
    this.shield -= damage;
    this.inv = INV_TIME;
    this.combo = 0;
    this.comboT = 0;
    this.hurtCount++;
    this.shake = Math.max(this.shake, 0.5 + damage / 40);
    this.sfx.shieldHit(damage >= 20);
    this.particles.burst(this.shipPos, 16, 14, ORANGE, 0.6, 0.4, this.railVel);
    void from;
    if (this.shield <= 0) this.die();
    else if (this.shield < 30) this.showBanner("Shield low", "Find a gold ring", "warn", 1.6);
  }

  private die() {
    this.shield = 0;
    this.deadT = 0;
    this.releaseFire(false);
    this.explode(this.shipPos, 6, ORANGE);
    this.flashes.spawn(this.shipPos, 14, WHITE, 0.5);
    this.sfx.explosion(2);
    this.sfx.lifeLost();
    this.sfx.engineHum(0, 0);
    this.ship.visible = false;
    this.lives--;
    this.shake = 1.4;
  }

  private updateDead(dt: number) {
    this.deadT += dt;
    // The world keeps drifting while the wreck burns.
    this.speed = damp(this.speed, 10, 2, dt);
    this.advance(dt);
    this.enemies.update(dt);
    this.boss?.update(dt);
    this.updateShots(dt);
    this.updateBolts(dt);
    if (this.deadT > 2.4) {
      if (this.lives > 0) {
        this.respawn();
        this.sfx.start();
      } else {
        this.deadT = -1;
        this.sfx.silence();
        music.play(NOVA_RUSH, 0);
        this.setPhase("over");
        this.events.over(this.score, this.stageIndex);
      }
    }
  }

  private explode(pos: THREE.Vector3, size: number, color?: THREE.Color) {
    this.flashes.spawn(pos, size * 1.3, color ?? YELLOW, 0.3 + size * 0.02);
    this.particles.burst(pos, Math.min(60, 10 + size * 6), size * 4, color ?? FIRE, size * 0.55, 0.65, this.railVel, 2.5, 1.4);
    this.particles.burst(pos, Math.min(50, 8 + size * 5), size * 10, YELLOW, 0.45, 0.45, this.railVel, 3);
    if (size > 5) this.flashes.spawn(pos, size * 2.4, color ?? ORANGE, 0.5, true, this.ship.quaternion);
  }

  // --- Scoring --------------------------------------------------------------------------------------------------

  private onKill({ enemy: e, byPlayer }: KillInfo) {
    if (!byPlayer || this.phase !== "playing") return;
    if (!e.noHit) this.hits++;
    this.combo++;
    this.comboT = 2.4;
    const mult = this.mult();
    this.score += e.score * mult;
    if (this.combo > 1 && this.combo % 4 === 0) this.sfx.combo(mult);
  }

  private mult() {
    return Math.min(8, 1 + Math.floor(this.combo / 4));
  }

  private onRing() {
    this.shield = Math.min(100, this.shield + 25);
    this.score += 200;
    this.sfx.ring();
  }

  private onPickup(kind: Drop) {
    if (kind === "bomb") {
      this.bombs = Math.min(6, this.bombs + 1);
      this.showBanner("Bomb +1", `${this.bombs} nova bombs`, "good", 1.5);
    } else if (kind === "laser") {
      this.laser = 2;
      this.showBanner("Twin laser", "Double damage", "good", 1.5);
    }
    this.score += 500;
    this.sfx.pickup();
  }

  private stageClear() {
    this.outro = 0;
    this.score += 5000 * (this.stageIndex + 1);
    this.showBanner("Stage clear", this.stage.bossName + " destroyed", "good", 3);
    this.sfx.medal(3);
    this.releaseFire(false);
    this.bolts = [];
  }

  private finishStage() {
    this.outro = -1;
    const medal = medalFor(this.stage, this.hits);
    const accuracy = this.fired ? Math.min(1, this.landed / this.fired) : 0;
    const shieldPct = this.shield / 100;
    const bonus = Math.round(shieldPct * 3000 + accuracy * 4000 + [0, 1000, 2500, 5000][medal]);
    this.score += bonus;
    this.sfx.silence();
    const last = this.stageIndex >= STAGES.length - 1;
    music.play(NOVA_RUSH, 0);
    this.setPhase(last ? "victory" : "results");
    this.events.results({ stage: this.stageIndex, name: this.stage.name, hits: this.hits, par: this.stage.par, accuracy, shield: shieldPct, bonus, medal, score: this.score, last });
    if (last) this.events.victory(this.score);
    this.sfx.medal(medal);
  }

  private showBanner(text: string, sub: string | undefined, tone: Banner["tone"], seconds: number) {
    this.banner = { id: ++this.bannerId, text, sub, tone };
    this.bannerT = seconds;
  }

  // --- Reticle & lines -----------------------------------------------------------------------------------------

  private drawReticle() {
    if (this.deadT >= 0 || this.outro >= 0) return;
    this.rail.frame(this.s, f);
    const charged = this.charge >= 1;
    const col = charged ? MAGENTA : this.charge > 0 ? CYAN_HOT : CYAN;
    const sq = (dist: number, size: number, alpha: number) => {
      const c = tmpV.copy(this.shipPos).addScaledVector(this.aim, dist);
      const h = size / 2;
      const pts = [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
      ];
      for (let i = 0; i < 4; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % 4];
        // Corner brackets only.
        for (const [p, q] of [
          [a, [a[0] + (b[0] - a[0]) * 0.3, a[1] + (b[1] - a[1]) * 0.3]],
          [b, [b[0] + (a[0] - b[0]) * 0.3, b[1] + (a[1] - b[1]) * 0.3]],
        ]) {
          tmpV2.copy(c).addScaledVector(f.right, p[0]).addScaledVector(f.up, p[1]);
          tmpV3.copy(c).addScaledVector(f.right, q[0]).addScaledVector(f.up, q[1]);
          this.beams.add(tmpV2, tmpV3, size * 0.07, col, alpha);
        }
      }
    };
    sq(28, 1.6, 0.9);
    sq(56, 3.4 + (charged ? Math.sin(this.time * 12) * 0.4 : 0), 0.75);
    if (this.charge > 0 && this.charge < 1) {
      // Charge ring: a growing diamond.
      const c = tmpV.copy(this.shipPos).addScaledVector(this.aim, 56);
      const r = 2.6 * this.charge;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + this.time * 3;
        const b = ((i + 1) / 4) * Math.PI * 2 + this.time * 3;
        tmpV2.copy(c).addScaledVector(f.right, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r);
        tmpV3.copy(c).addScaledVector(f.right, Math.cos(b) * r).addScaledVector(f.up, Math.sin(b) * r);
        this.beams.add(tmpV2, tmpV3, 0.16, CYAN_HOT, 1);
      }
    }
    // Lock-on brackets.
    for (const e of this.locks) {
      if (!e.alive) continue;
      const r = Math.max(2, e.radius * 1.4) * (1 + Math.sin(this.time * 10) * 0.08);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + this.time * 2 + Math.PI / 4;
        const b = a + Math.PI / 2;
        tmpV2.copy(e.pos).addScaledVector(f.right, Math.cos(a) * r).addScaledVector(f.up, Math.sin(a) * r);
        tmpV3.copy(e.pos).addScaledVector(f.right, Math.cos(b) * r).addScaledVector(f.up, Math.sin(b) * r);
        this.beams.add(tmpV2, tmpV3, 0.28, MAGENTA, 1.4);
      }
    }
  }

  private drawSpeedLines(dt: number) {
    const boost = clamp((this.speed - SPEED) / (BOOST_SPEED - SPEED), 0, 1);
    const alpha = this.phase === "playing" ? 0.12 + boost * 0.35 : 0.06;
    const len = 2 + (this.speed / SPEED) * 3 + boost * 10;
    const m = this.camera.matrixWorld;
    for (const l of this.speedLines) {
      l.p.z += this.speed * 1.4 * dt;
      if (l.p.z > 2) {
        l.p.set((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 44, -120 - Math.random() * 60);
        if (Math.abs(l.p.x) < 4 && Math.abs(l.p.y) < 3) l.p.x += 8 * Math.sign(l.p.x || 1);
      }
      tmpV.copy(l.p).applyMatrix4(m);
      tmpV2.set(l.p.x, l.p.y, l.p.z - len).applyMatrix4(m);
      this.beams.add(tmpV, tmpV2, 0.08, CYAN, alpha);
    }
  }

  // --- Camera ---------------------------------------------------------------------------------------------------------

  private updateCamera(dt: number) {
    const cam = this.camera;
    this.rail.frame(this.s, f);
    const menu = this.phase === "menu" || this.phase === "briefing" || this.phase === "results" || this.phase === "victory" || this.phase === "over";
    if (menu) {
      // Slow orbit around the idling ship.
      this.menuAngle += dt * (this.phase === "menu" ? 0.12 : 0.07);
      const a = this.menuAngle + (this.phase === "briefing" ? 2.4 : 0.6);
      const r = this.phase === "menu" ? 7.5 : 9;
      tmpV.copy(this.shipPos).addScaledVector(f.right, Math.sin(a) * r).addScaledVector(f.up, 1.6 + Math.sin(a * 0.7) * 0.8).addScaledVector(f.fwd, -Math.cos(a) * r);
      if (dt === 0 || this.camPos.lengthSq() === 0) this.camPos.copy(tmpV);
      else this.camPos.lerp(tmpV, 1 - Math.exp(-3 * dt));
      cam.position.copy(this.camPos);
      this.lookAt.copy(this.shipPos).addScaledVector(f.fwd, this.portrait ? 2 : 0).addScaledVector(f.right, this.portrait ? 0 : this.phase === "menu" ? -2.6 : 0);
      cam.up.copy(f.up);
      cam.lookAt(this.lookAt);
      this.setFov(this.portrait ? 72 : 50, dt);
      return;
    }
    const boost = clamp((this.speed - SPEED) / (BOOST_SPEED - SPEED), -1, 1);
    if (this.outro >= 0) {
      // Stage clear: swing round to the front of the ship.
      const k = smooth(this.outro / 2);
      tmpV.copy(this.shipPos).addScaledVector(f.fwd, -CAM_BACK + k * (CAM_BACK + 8)).addScaledVector(f.right, k * 5).addScaledVector(f.up, 1.4 + k * 0.5);
      this.camPos.lerp(tmpV, 1 - Math.exp(-4 * dt));
      cam.position.copy(this.camPos);
      cam.up.copy(f.up);
      cam.lookAt(this.shipPos);
      this.setFov(60, dt);
      return;
    }
    this.camX = damp(this.camX, this.px * CAM_FOLLOW, 5, dt);
    this.camY = damp(this.camY, this.py * 0.68, 5, dt);
    this.camBack = damp(this.camBack, CAM_BACK + boost * 2.2, 3, dt);
    this.camRoll = damp(this.camRoll, -this.vx * 0.006 - f.bend * 600, 3, dt);
    this.camPos.copy(f.pos).addScaledVector(f.right, this.camX).addScaledVector(f.up, this.camY + 1.3).addScaledVector(f.fwd, -this.camBack);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const a = this.shake * this.shake * 0.6;
      this.camPos.x += (Math.random() - 0.5) * a;
      this.camPos.y += (Math.random() - 0.5) * a;
      this.camPos.z += (Math.random() - 0.5) * a;
    }
    cam.position.copy(this.camPos);
    this.rail.frame(this.s + 30, fa);
    this.lookAt.copy(fa.pos).addScaledVector(fa.right, this.camX * 0.6).addScaledVector(fa.up, this.camY * 0.6 + 0.6);
    cam.up.copy(f.up).applyAxisAngle(f.fwd, clamp(this.camRoll, -0.25, 0.25));
    cam.lookAt(this.lookAt);
    const base = this.portrait ? 78 : 64;
    this.setFov(base + boost * (boost > 0 ? 12 : 6), dt);
  }

  private setFov(target: number, dt: number) {
    this.fov = dt > 0 ? damp(this.fov, target, 4, dt) : target;
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
      this.updatePointScale();
    }
  }

  private updatePointScale() {
    const h = this.viewH * this.renderer.getPixelRatio();
    this.particles.setScale(h, this.camera.fov);
    this.glows.setScale(h, this.camera.fov);
    this.world?.sky.setScale(h, this.camera.fov);
  }

  // --- HUD ----------------------------------------------------------------------------------------------------------------

  private emitHud(dt: number) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.05;
    if (this.bannerT > 0 && this.phase !== "playing") {
      this.bannerT -= 0.05;
      if (this.bannerT <= 0) this.banner = null;
    }
    const h = this.hud;
    h.score = this.score;
    h.mult = this.mult();
    h.combo = this.combo;
    h.comboT = clamp(this.comboT / 2.4, 0, 1);
    h.hits = this.hits;
    h.shield = clamp(this.shield / 100, 0, 1);
    h.lives = this.lives;
    h.bombs = this.bombs;
    h.boost = this.boostMeter;
    h.charge = this.charge;
    h.locks = this.locks.length;
    h.laser = this.laser;
    h.stage = this.stageIndex;
    h.progress = clamp(this.s / this.stage.length, 0, 1);
    h.checkpoint = this.stage.checkpoint / this.stage.length;
    h.boss = this.boss && !this.boss.dead && this.boss.state !== "enter" ? { name: this.boss.name, hp: clamp(this.boss.hp(), 0, 1) } : null;
    h.banner = this.banner;
    h.danger = this.shield < 30 && this.deadT < 0;
    h.hurt = this.hurtCount;
    h.bombFlash = this.bombFlash;
    this.events.hud({ ...h });
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    if (phase !== "playing" && phase !== "paused") this.ship.visible = phase !== "over";
    this.events.phase(phase);
  }

  // --- Quality & resize --------------------------------------------------------------------------------------------------

  private adaptQuality(raw: number) {
    if (raw > 0) this.fpsAvg = this.fpsAvg * 0.97 + (1 / raw) * 0.03;
    if (document.hidden || raw > 0.5 || this.qualityLock) return;
    const p = this.perf;
    p.time += raw;
    p.frames++;
    if (p.time < 1.5) return;
    const fps = p.frames / p.time;
    p.time = 0;
    p.frames = 0;
    const ratio = this.renderer.getPixelRatio();
    if (fps < 45) {
      p.good = 0;
      if (ratio > 0.75) {
        this.renderer.setPixelRatio(Math.max(0.75, ratio - 0.25));
        this.resize();
      } else if (!p.bloomOff) p.bloomOff = true;
    } else if (fps > 58) {
      if (++p.good >= 4) {
        p.good = 0;
        if (p.bloomOff) p.bloomOff = false;
        else if (ratio < this.maxRatio) {
          this.renderer.setPixelRatio(Math.min(this.maxRatio, ratio + 0.25));
          this.resize();
        }
      }
    } else p.good = 0;
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.viewH = h;
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(Math.round(w / 2), Math.round(h / 2));
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
    this.updatePointScale();
  }

  // --- Debug autopilot (temporary) -------------------------------------------------------------------------------------------

  private autoPilot() {
    // Steer towards the nearest target ahead, dodge incoming bolts, fire constantly.
    const box = this.box();
    let tx = 0;
    let ty = 0;
    let best = Infinity;
    this.rail.frame(this.s, f);
    this.enemies.forEachAlive((e) => {
      if (e.armored || e.d > 300) return;
      const ahead = e.s - this.s;
      if (ahead < 15 || ahead > 160) return;
      tmpV.subVectors(e.pos, f.pos);
      const ex = tmpV.dot(f.right);
      const ey = tmpV.dot(f.up);
      const score = ahead + Math.abs(ex) * 2;
      if (score < best) {
        best = score;
        tx = ex;
        ty = ey;
      }
    });
    // Dodge: bolts heading for the ship.
    let dodgeX = 0;
    let dodgeY = 0;
    for (const b of this.bolts) {
      if (b.deflected) continue;
      tmpV.subVectors(b.pos, this.shipPos);
      const ahead = tmpV.dot(f.fwd);
      if (ahead < 0 || ahead > 45) continue;
      const bx = tmpV.dot(f.right);
      const by = tmpV.dot(f.up);
      if (Math.abs(bx) < 2.5 && Math.abs(by) < 2.5) {
        dodgeX -= Math.sign(bx || 1) * 4;
        dodgeY -= Math.sign(by || 1) * 3;
        if (ahead < 14 && this.rollGap <= 0) this.startRoll(bx > 0 ? -1 : 1);
      }
    }
    // Rocks / obstacles directly ahead.
    this.enemies.forEachAlive((e) => {
      if (!e.collide || e.boss) return;
      const ahead = e.s - this.s;
      if (ahead < 0 || ahead > 40) return;
      tmpV.subVectors(e.pos, this.shipPos);
      const bx = tmpV.dot(f.right);
      const by = tmpV.dot(f.up);
      if (Math.abs(bx) < e.radius + 1.6 && Math.abs(by) < e.radius + 1.6) {
        dodgeX -= Math.sign(bx || 1) * 5;
        dodgeY -= Math.sign(by || 1) * 3;
      }
    });
    const gx = clamp(tx * 0.9 + dodgeX, -box.x, box.x);
    const gy = clamp(ty * 0.9 + dodgeY, -box.y, box.y);
    this.mouse = { x: gx / box.x, y: gy / box.y };
    if (this.shield < 60 && this.bombs > 0 && this.boss && this.boss.state !== "enter") this.dropBomb();
    // Human-ish trigger finger: about 7 taps a second.
    if (this.fireGap <= 0 && !this.fireHeld && Math.random() < 0.45) {
      this.pressFire();
      this.releaseFire(false);
    }
  }

  // --- Debug info (temporary) -----------------------------------------------------------------------------------------------

  debugInfo() {
    return {
      phase: this.phase,
      stage: this.stageIndex,
      s: Math.round(this.s),
      len: this.stage.length,
      shield: Math.round(this.shield),
      lives: this.lives,
      score: this.score,
      hits: this.hits,
      par: this.stage.par,
      enemies: this.enemies.list.filter((e) => e.alive).length,
      bolts: this.bolts.length,
      boss: this.boss ? { state: this.boss.state, hp: this.boss.hp(), phase: this.boss.phase, dead: this.boss.dead } : null,
      calls: this.renderer.info.render.calls,
      tris: this.renderer.info.render.triangles,
      ratio: this.renderer.getPixelRatio(),
      bloomOff: this.perf.bloomOff,
      fps: Math.round(this.fpsAvg),
      autopilot: this.autopilot,
    };
  }

  debugQuality(ratio: number, bloom: boolean) {
    this.qualityLock = true;
    this.renderer.setPixelRatio(ratio);
    this.perf.bloomOff = !bloom;
    this.resize();
  }

  debugJump(s: number) {
    this.enemies.clear();
    this.hazards.clear();
    this.startAt(s);
  }

  // --- Dispose -------------------------------------------------------------------------------------------------------------------

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    this.boss?.dispose();
    this.enemies?.clear();
    this.enemies?.dispose();
    this.hazards?.clear();
    this.world?.dispose();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.particles.dispose();
    this.glows.dispose();
    this.beams.dispose();
    this.flashes.dispose();
    this.bubble.mesh.geometry.dispose();
    this.bubble.material.dispose();
    this.envTexture?.dispose();
    this.composer?.dispose();
    this.renderer.resetState();
    this.renderer.dispose();
  }
}
