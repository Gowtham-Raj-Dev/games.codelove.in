import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { disposeTree, loadModels, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { NOIR_HEIST } from "../shared/songs";
import { Animator, CharView, Guard, SecurityCamera, type Thief, type WatchCtx } from "./actors";
import { Sfx } from "./audio";
import { chevronGeometry, iconAtlas, makeRingTexture, Rings, Sparkles } from "./fx";
import { angleDiff, damp, rng, turnTowards, type Vec2 } from "./grid";
import { LEVELS, LOOT_NAME, LOOT_VALUE, parseLevel, TARGET_VALUE, type Parsed } from "./levels";
import { MODELS } from "./manifest";
import { buildProtos, LevelView, PEDESTAL_H, WALL_H } from "./world";

// --- Tuning ----------------------------------------------------------------------------------------------

const THIEF_R = 0.27;
const SPEED = { sneak: 1.55, walk: 2.7, run: 4.4 };
const STEP_LEN = { sneak: 0.55, walk: 0.72, run: 1.05 };
const NOISE = { walk: 1.7, run: 4.6, coin: 5.2, thud: 2.2 };
const THROW_RANGE = 8;
const ALARM_TIME = 16;
const REACH = { pedestal: 1.55, plinth: 1.45, door: 1.35, console: 1.5, ko: 1.1 };

export type Phase = "loading" | "menu" | "briefing" | "playing" | "paused" | "result" | "error";
export type Stance = "still" | "sneak" | "walk" | "run";

export interface Hud {
  level: number;
  gem: boolean;
  loot: number;
  lootTotal: number;
  value: number;
  coins: number;
  keys: number;
  alarm: boolean;
  /** Seconds until the alarm calms down (while it is on). */
  alarmLeft: number;
  /** Highest awareness among guards and cameras, 0..1. */
  suspicion: number;
  /** 0..1 how lit the thief is. */
  light: number;
  stance: Stance;
  sneakLock: boolean;
  prompt: string | null;
  objective: string;
  time: number;
  overview: boolean;
  camerasOff: boolean;
  hasCameras: boolean;
}

export interface Result {
  level: number;
  escaped: boolean;
  reason: string;
  time: number;
  loot: number;
  lootTotal: number;
  value: number;
  alarm: boolean;
  knockouts: number;
  stars: number;
  par: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  toast(text: string, tone?: "info" | "good" | "bad"): void;
  result(result: Result): void;
  error(message: string): void;
}

interface Coin {
  obj: THREE.Object3D;
  from: Vec2;
  to: Vec2;
  t: number;
  dur: number;
  landed: boolean;
  life: number;
}

type Busy = { kind: "pickup" | "throw" | "knock"; t: number } | null;

export class NightHeistGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private readonly timer = new THREE.Timer();
  private readonly sfx = new Sfx();
  private protos = new Map<string, Proto>();
  private envTexture: THREE.Texture | null = null;
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly res = { max: 1, min: 0.7, cur: 1, acc: 0, n: 0, good: 0 };
  private portrait = false;

  // Lighting
  private readonly hemi = new THREE.HemisphereLight("#5d6fa8", "#2a2018", 1.15);
  private readonly moon = new THREE.DirectionalLight("#a9bdff", 0.6);
  private readonly torchLights: THREE.PointLight[] = [];
  private readonly gemLight = new THREE.PointLight("#ffffff", 4, 3.6, 1.6);
  private torchAssignT = 0;

  // Effects
  private readonly rings = new Rings(20);
  private readonly sparkles = new Sparkles(180);
  private readonly atlas = iconAtlas();
  private readonly ringTex = makeRingTexture();
  private readonly marker: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly reticle: THREE.Group;
  private readonly reticleRange: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly chevron: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Drawn only where something else hides the thief (stencil marks his visible pixels). */
  private readonly silhouetteMat = new THREE.MeshBasicMaterial({
    color: "#f87171",
    transparent: true,
    opacity: 0.42,
    depthFunc: THREE.GreaterDepth,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp,
  });
  private readonly fade: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private fadeTarget = 1;

  // Level
  private levelIndex = 0;
  private level: Parsed | null = null;
  private view: LevelView | null = null;
  private guards: Guard[] = [];
  private cams: SecurityCamera[] = [];
  private thiefView: CharView | null = null;
  private readonly coins: Coin[] = [];
  private random = rng(1);

  // State
  private phase: Phase = "loading";
  private stage: "play" | "caught" | "escape" = "play";
  private stageT = 0;
  private time = 0;
  private realTime = 0;
  private readonly thief: Thief & { yaw: number; vx: number; vz: number } = { x: 0, z: 0, yaw: Math.PI, vx: 0, vz: 0, sneaking: false, running: false, moving: false };
  private stance: Stance = "still";
  private stepAcc = 0;
  private busy: Busy = null;
  private hasGem = false;
  private lootTaken = 0;
  private value = 0;
  private coinsLeft = 0;
  private keysHeld = 0;
  private knockouts = 0;
  private alarm = false;
  private alarmEver = false;
  private alarmQuiet = 0;
  private alarmReason = "";
  private readonly lastKnown: Vec2 = { x: 0, z: 0 };
  private camerasOff = false;
  private throwCd = 0;
  private overview = false;
  private zoom = 1;
  private readonly focus = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private menuT = 0;
  private hudCache = "";
  private exitDenyT = 0;
  private alarmFlash = 0;

  // Input
  private readonly keys = new Set<string>();
  private readonly stick = { x: 0, y: 0 };
  private sneakLock = false;
  private touchRun = false;
  private useQueued = false;
  private mouse: { x: number; y: number; t: number } | null = null;
  private readonly ndc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** Debug/test: scripted input that replaces the keyboard. */
  botInput: { x: number; z: number; sneak: boolean; run: boolean } | null = null;

  private readonly ctx: WatchCtx;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: "high-performance" });
    this.res.max = Math.min(window.devicePixelRatio, coarse ? 1.5 : 2);
    this.res.cur = this.res.max;
    this.res.min = Math.min(this.res.max, 0.7);
    this.renderer.setPixelRatio(this.res.cur);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = this.scene;
    scene.background = new THREE.Color("#06070c");
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.16;
    scene.add(this.hemi);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.03;
    scene.add(this.moon, this.moon.target);
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight("#ff9a4a", 0, 6.5, 1.5);
      this.torchLights.push(l);
      scene.add(l);
    }
    scene.add(this.gemLight);
    scene.add(this.rings.group, this.sparkles.points);

    // Thief marker ring, throw reticle, objective chevron.
    this.marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.ringTex, color: "#f87171", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.marker.renderOrder = 3;
    scene.add(this.marker);
    this.reticle = new THREE.Group();
    const dot = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.ringTex, color: "#ffd27a", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.reticleRange = new THREE.Mesh(
      new THREE.PlaneGeometry(NOISE.coin * 2, NOISE.coin * 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.ringTex, color: "#ffd27a", transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.reticle.add(dot, this.reticleRange);
    this.reticle.position.y = 0.06;
    this.reticle.visible = false;
    this.reticle.renderOrder = 3;
    scene.add(this.reticle);
    this.chevron = new THREE.Mesh(chevronGeometry(), new THREE.MeshBasicMaterial({ color: "#ffe6a8", transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.chevron.renderOrder = 4;
    scene.add(this.chevron);

    this.fade = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    this.fade.position.z = -0.3;
    this.fade.renderOrder = 999;
    this.camera.add(this.fade);
    scene.add(this.camera);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const game = this;
    this.ctx = {
      get grid() {
        return game.level!.grid;
      },
      player: this.thief,
      get alarm() {
        return game.alarm;
      },
      lastKnown: this.lastKnown,
      get guards() {
        return game.guards;
      },
      get time() {
        return game.time;
      },
      rand: () => this.random(),
      raiseAlarm: (x, z, by) => this.raiseAlarm(x, z, by),
      spotted: (x, z) => {
        this.lastKnown.x = x;
        this.lastKnown.z = z;
        this.alarmQuiet = 0;
      },
      caught: (by) => this.caught(by),
      voice: (kind, pitch) => {
        if (this.phase !== "playing") return;
        if (kind === "huh") this.sfx.huh(pitch);
        else if (kind === "hey") this.sfx.hey(pitch);
        else if (kind === "shrug") this.sfx.shrug(pitch);
        else if (kind === "wake") this.sfx.wake();
        else this.sfx.cameraLock();
      },
      pickCoin: (x, z) => {
        const c = this.coins.find((k) => k.landed && Math.hypot(k.to.x - x, k.to.z - z) < 1.5);
        if (c) c.life = 0;
      },
    };

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Loading -------------------------------------------------------------------------------------------

  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const required = MODELS.slice(0, 6);
      if (!required.every((k) => models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");
      this.protos = buildProtos(models);
      // The thief: dark suit, plus a faint silhouette that shows through walls.
      this.thiefView = new CharView(this.protos.get("thief")!);
      this.addSilhouette(this.thiefView);
      this.scene.add(this.thiefView.root);
      this.preview(0);
      this.renderer.compile(this.scene, this.camera);
      music.play(NOIR_HEIST, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private addSilhouette(view: CharView) {
    const extras: THREE.Object3D[] = [];
    view.model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        mat.stencilWrite = true;
        mat.stencilRef = 1;
        mat.stencilFunc = THREE.AlwaysStencilFunc;
        mat.stencilZPass = THREE.ReplaceStencilOp;
      }
      let sil: THREE.Mesh;
      if (mesh.isSkinnedMesh) {
        const s = new THREE.SkinnedMesh(mesh.geometry, this.silhouetteMat);
        s.bind(mesh.skeleton, mesh.bindMatrix);
        sil = s;
      } else sil = new THREE.Mesh(mesh.geometry, this.silhouetteMat);
      sil.position.copy(mesh.position);
      sil.quaternion.copy(mesh.quaternion);
      sil.scale.copy(mesh.scale);
      sil.renderOrder = 10;
      sil.castShadow = false;
      sil.frustumCulled = false;
      extras.push(sil);
      (sil as THREE.Object3D).userData.parent = mesh.parent;
    });
    for (const s of extras) (s.userData.parent as THREE.Object3D).add(s);
  }

  // --- Level lifecycle ----------------------------------------------------------------------------------

  private buildLevel(index: number) {
    this.clearLevel();
    this.levelIndex = index;
    const level = parseLevel(LEVELS[index], index);
    this.level = level;
    this.view = new LevelView(level, this.protos);
    this.scene.add(this.view.group);
    this.guards = LEVELS[index].guards.map((def, i) => {
      const g = new Guard(def, this.protos.get(def.kind === "warden" ? "warden" : "guard")!, this.atlas, i, level.grid);
      this.scene.add(g.view.root, g.cone.mesh, g.badge.mesh);
      return g;
    });
    this.cams = (LEVELS[index].cameras ?? []).map((def) => {
      const c = new SecurityCamera(def, this.atlas);
      this.scene.add(c.cone.mesh, c.badge.mesh);
      return c;
    });
    // Moonlight shadows cover the level.
    const { grid } = level;
    const c = this.view.center;
    this.moon.position.set(c.x - 9, 16, c.z - 5);
    this.moon.target.position.copy(c);
    const sc = this.moon.shadow.camera;
    const half = Math.max(grid.w, grid.h) * 0.62 + 2;
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.near = 1;
    sc.far = 60;
    sc.updateProjectionMatrix();
    const color = new THREE.Color(LEVELS[index].target.gem === "red" ? "#ff6b7a" : LEVELS[index].target.gem === "green" ? "#6bffb0" : "#7cc4ff");
    this.gemLight.color.copy(color);
    this.gemLight.position.set(level.target.x, PEDESTAL_H + 0.9, level.target.z);
    this.random = rng(1234 + index * 77);
    this.time = 0;
    this.torchAssignT = 0;
  }

  private clearLevel() {
    for (const g of this.guards) {
      g.view.root.removeFromParent();
      g.cone.mesh.removeFromParent();
      g.badge.mesh.removeFromParent();
      g.view.anim.stopAll();
      g.dispose();
    }
    this.guards = [];
    for (const c of this.cams) {
      c.cone.mesh.removeFromParent();
      c.badge.mesh.removeFromParent();
      c.dispose();
    }
    this.cams = [];
    for (const c of this.coins) c.obj.removeFromParent();
    this.coins.length = 0;
    this.view?.dispose();
    this.view = null;
    this.rings.clear();
    this.sparkles.clear();
  }

  /** Menu / briefing backdrop: the chosen heist seen from above with its guards on their rounds. */
  preview(index: number) {
    if (!this.protos.size) return;
    const browsing = this.phase === "menu" || this.phase === "briefing";
    if (this.level?.index !== index || !browsing) this.buildLevel(index);
    this.resetRun(false);
    this.thief.x = -100;
    this.thief.z = -100;
    if (this.thiefView) this.thiefView.root.visible = false;
    this.overview = true;
    this.fadeTarget = 0;
    this.menuT = 0;
  }

  private resetRun(full: boolean) {
    const level = this.level!;
    this.stage = "play";
    this.stageT = 0;
    this.time = 0;
    this.thief.x = level.start.x;
    this.thief.z = level.start.z;
    this.thief.vx = this.thief.vz = 0;
    this.thief.yaw = Math.PI;
    this.thief.sneaking = this.thief.running = this.thief.moving = false;
    this.stance = "still";
    this.busy = null;
    this.hasGem = false;
    this.lootTaken = 0;
    this.value = 0;
    this.coinsLeft = LEVELS[level.index].coins;
    this.keysHeld = 0;
    this.knockouts = 0;
    this.alarm = false;
    this.alarmEver = false;
    this.alarmQuiet = 0;
    this.camerasOff = false;
    this.throwCd = 0;
    this.useQueued = false;
    this.sneakLock = false;
    this.exitDenyT = 0;
    if (full && this.thiefView) {
      this.thiefView.root.visible = true;
      this.thiefView.anim.stopAll();
      this.thiefView.anim.play("idle", { fade: 0 });
    }
  }

  start(index: number) {
    if (!this.protos.size) return;
    this.buildLevel(index);
    this.resetRun(true);
    this.overview = false;
    this.zoom = 1;
    this.snapCamera();
    this.fadeTarget = 0;
    this.fade.material.opacity = 1;
    music.play(NOIR_HEIST, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setPhase("playing");
    this.emitHud(true);
  }

  restart() {
    this.start(this.levelIndex);
  }

  pause() {
    if (this.phase !== "playing") return;
    this.clearInput();
    music.duck(true);
    this.sfx.stopLoops();
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    music.duck(false);
    music.play(NOIR_HEIST, 0);
    music.setIntensity(0);
    this.sfx.stopLoops();
    this.preview(this.levelIndex);
    this.setPhase("menu");
  }

  briefing(index: number) {
    this.preview(index);
    this.setPhase("briefing");
  }

  get currentLevel() {
    return this.levelIndex;
  }

  // --- Touch / UI input ------------------------------------------------------------------------------------

  setStick(x: number, y: number) {
    this.stick.x = x;
    this.stick.y = y;
  }

  toggleSneak() {
    this.sneakLock = !this.sneakLock;
    this.emitHud();
  }

  setRun(on: boolean) {
    this.touchRun = on;
  }

  use() {
    this.useQueued = true;
  }

  toggleOverview() {
    this.overview = !this.overview;
    this.emitHud();
  }

  /** Throw at a screen point (touch taps, mouse clicks). */
  throwAtScreen(clientX: number, clientY: number) {
    const p = this.floorPoint(clientX, clientY);
    if (p) this.throwCoin(p.x, p.z);
  }

  // --- Disposal ------------------------------------------------------------------------------------------

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
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
    music.stop();
    this.sfx.dispose();
    this.clearLevel();
    this.thiefView?.anim.stopAll();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.rings.dispose();
    this.sparkles.dispose();
    this.atlas.dispose();
    this.ringTex.dispose();
    this.silhouetteMat.dispose();
    this.envTexture?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m?.dispose());
    });
    this.renderer.resetState();
    this.renderer.dispose();
  }

  // --- Keyboard & mouse ------------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.phase !== "playing") return;
    const c = e.code;
    const gameKey = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyQ", "KeyR", "KeyC"].includes(c);
    if (!gameKey) return;
    e.preventDefault();
    this.keys.add(c);
    if (e.repeat) return;
    if (c === "KeyE") this.useQueued = true;
    else if (c === "KeyQ") this.toggleOverview();
    else if (c === "KeyC") this.toggleSneak();
    else if (c === "KeyR") this.restart();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clearInput = () => {
    this.keys.clear();
    this.stick.x = this.stick.y = 0;
    this.touchRun = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.phase !== "playing") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.throwAtScreen(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    this.mouse = { x: e.clientX, y: e.clientY, t: this.realTime };
  };

  private onPointerLeave = () => {
    this.mouse = null;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.phase !== "playing") return;
    e.preventDefault();
    this.zoom = Math.max(0.75, Math.min(1.7, this.zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
  };

  private floorPoint(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  /** Movement input in world space (the camera looks north), length 0..1. */
  private moveInput() {
    if (this.botInput) return { x: this.botInput.x, z: this.botInput.z };
    let x = 0;
    let z = 0;
    const k = this.keys;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) z -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) z += 1;
    x += this.stick.x;
    z -= this.stick.y;
    const l = Math.hypot(x, z);
    if (l > 1) {
      x /= l;
      z /= l;
    }
    return { x, z };
  }

  // --- Frame -----------------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const real = Math.min(this.timer.getDelta(), 1 / 20);
    this.realTime += real;
    if (this.phase === "loading" || this.phase === "error") return;
    if (this.phase === "playing" || this.phase === "menu" || this.phase === "briefing") this.adaptResolution(real);

    if (this.phase === "playing") this.step(real);
    else if (this.phase === "menu" || this.phase === "briefing") this.stepAmbient(real);
    this.visuals(this.phase === "paused" ? 0 : real);
    this.updateCamera(this.phase === "paused" ? 0 : real);
    const f = this.fade.material;
    f.opacity = damp(f.opacity, this.fadeTarget, this.fadeTarget > f.opacity ? 6 : 3.5, real);
    this.fade.visible = f.opacity > 0.003;
    this.renderer.render(this.scene, this.camera);
  };

  /** Guards walk their rounds behind the menus. */
  private stepAmbient(dt: number) {
    if (!this.level) return;
    this.time += dt;
    this.menuT += dt;
    for (const g of this.guards) g.update(dt, this.ctx);
    for (const c of this.cams) c.update(dt, this.ctx, this.sfx);
  }

  /** One simulation step of the heist (also driven directly by the test bot). */
  step(dt: number) {
    const level = this.level;
    if (!level || !this.thiefView) return;
    this.time += dt;
    if (this.stage !== "play") {
      this.stageT += dt;
      if (this.stage === "caught") {
        for (const g of this.guards) if (g.alive && g.state === "hunt") g.yaw = turnTowards(g.yaw, Math.atan2(this.thief.x - g.x, this.thief.z - g.z), 6, dt);
        if (this.stageT > 1.6) this.finish(false);
      } else if (this.stage === "escape") {
        const ex = level.exit;
        this.thief.x += Math.sin(ex.yaw + Math.PI) * 1.4 * dt;
        this.thief.z += Math.cos(ex.yaw + Math.PI) * 1.4 * dt;
        if (this.stageT > 1.3) this.finish(true);
      }
      return;
    }

    this.updateThief(dt);
    this.updateSecurity(dt);
    for (const c of this.cams) c.update(dt, this.ctx, this.sfx);
    for (const g of this.guards) g.update(dt, this.ctx);
    if (this.stage !== "play") return;
    this.updateCoins(dt);
    this.updateDoors(dt);
    this.updateAlarm(dt);
    this.handleUse();
    this.emitHud();
  }

  private updateThief(dt: number) {
    const t = this.thief;
    const level = this.level!;
    const grid = level.grid;
    this.throwCd -= dt;
    if (this.busy) {
      this.busy.t -= dt;
      if (this.busy.t <= 0) this.busy = null;
    }
    const input = this.moveInput();
    const len = Math.hypot(input.x, input.z);
    const sneakHeld = this.botInput ? this.botInput.sneak : this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.sneakLock;
    const runHeld = this.botInput ? this.botInput.run : this.keys.has("Space") || this.touchRun;
    let stance: Stance = "still";
    if (len > 0.05 && !this.busy) stance = runHeld ? "run" : sneakHeld ? "sneak" : "walk";
    // A light push on the stick walks; it never runs by itself.
    const speed = stance === "still" ? 0 : SPEED[stance] * (stance === "run" ? 1 : Math.min(1, 0.35 + len));
    const tx = len > 0.05 ? (input.x / len) * speed : 0;
    const tz = len > 0.05 ? (input.z / len) * speed : 0;
    const accel = stance === "still" ? 16 : 12;
    t.vx = damp(t.vx, this.busy ? 0 : tx, accel, dt);
    t.vz = damp(t.vz, this.busy ? 0 : tz, accel, dt);
    const ox = t.x;
    const oz = t.z;
    t.x += t.vx * dt;
    t.z += t.vz * dt;
    // The exit counts as a wall until you have the gem.
    grid.collide(t, THIEF_R);
    const moved = Math.hypot(t.x - ox, t.z - oz);
    t.moving = moved > 0.002;
    t.sneaking = stance === "sneak" || (sneakHeld && !runHeld);
    t.running = stance === "run" && moved / dt > 3;
    this.stance = t.moving ? stance : "still";
    if (len > 0.05 && !this.busy) t.yaw = turnTowards(t.yaw, Math.atan2(input.x, input.z), 12, dt);

    // Footsteps: soft and silent when sneaking, a ring of noise when walking, loud when running.
    if (t.moving) {
      this.stepAcc += moved;
      const kind = this.stance === "run" ? "run" : this.stance === "sneak" ? "sneak" : "walk";
      if (this.stepAcc >= STEP_LEN[kind]) {
        this.stepAcc = 0;
        this.sfx.step(kind);
        if (kind === "walk") this.makeNoise(t.x, t.z, NOISE.walk, "step");
        else if (kind === "run") this.makeNoise(t.x, t.z, NOISE.run, "step");
      }
    }

    // Exit.
    const ex = level.exit;
    const dExit = Math.hypot(t.x - ex.x, t.z - ex.z);
    this.exitDenyT -= dt;
    if (dExit < 0.98) {
      if (this.hasGem) {
        this.stage = "escape";
        this.stageT = 0;
        this.sfx.escape();
        this.fadeTarget = 1;
        this.thiefView!.anim.play("walk");
        return;
      } else if (this.exitDenyT <= 0) {
        this.exitDenyT = 3;
        this.sfx.denyExit();
        this.events.toast(`Not without the ${LEVELS[level.index].target.name}!`, "info");
      }
    }

    // Pick-ups you just walk over: coin stacks and key cards.
    const view = this.view!;
    for (const l of view.loot) {
      if (l.taken || l.plinth) continue;
      if (Math.hypot(t.x - l.x, t.z - l.z) < 0.55) this.takeLoot(l);
    }
    for (const k of view.keys) {
      if (k.taken || Math.hypot(t.x - k.x, t.z - k.z) > 0.6) continue;
      k.taken = true;
      k.obj.visible = false;
      (k.obj.userData.glow as THREE.Object3D).visible = false;
      this.keysHeld++;
      this.sfx.key();
      this.sparkles.burst(k.x, 0.4, k.z, "#ffd76a", 18);
      this.events.toast("Key card — opens one locked door", "good");
    }
  }

  private takeLoot(l: LevelView["loot"][number]) {
    l.taken = true;
    l.obj.visible = false;
    (l.obj.userData.glow as THREE.Object3D).visible = false;
    this.lootTaken++;
    this.value += LOOT_VALUE[l.kind];
    if (l.kind === "coins") this.coinsLeft += 2;
    this.sfx.pickup();
    this.sparkles.burst(l.x, l.plinth ? 0.6 : 0.3, l.z, "#ffd27a", 22);
    this.events.toast(`${LOOT_NAME[l.kind]} +$${LOOT_VALUE[l.kind]}${l.kind === "coins" ? " · +2 coins to throw" : ""}`, "good");
  }

  /** Lasers and pressure plates. */
  private updateSecurity(dt: number) {
    const view = this.view!;
    const t = this.thief;
    let hum = 0;
    for (const laser of view.lasers) {
      const { on, off, phase = 0 } = laser.def;
      const period = on + off;
      const k = (((this.time + phase * period) % period) + period) % period;
      const active = k < on;
      const warn = !active && k > period - 0.55;
      laser.beams.forEach((b) => b.set(active ? 1 : warn ? 0.5 : 0, this.time));
      if (!active) continue;
      for (const c of laser.cells) {
        const d = Math.hypot(t.x - c.x, t.z - c.z);
        hum = Math.max(hum, 1 - d / 5);
        const across = c.axis === "x" ? Math.abs(t.z - c.z) : Math.abs(t.x - c.x);
        const along = c.axis === "x" ? Math.abs(t.x - c.x) : Math.abs(t.z - c.z);
        if (across < THIEF_R * 0.8 && along < 0.5) {
          this.sfx.zap();
          this.raiseAlarm(t.x, t.z, "laser");
          return;
        }
      }
    }
    this.sfx.laserHum(Math.max(0, hum));
    for (const p of view.plates) {
      if (p.glow.visible) continue;
      if (Math.abs(t.x - p.x) < 0.42 && Math.abs(t.z - p.z) < 0.42) {
        p.glow.visible = true;
        this.sfx.plateClick();
        this.raiseAlarm(t.x, t.z, "plate");
      }
    }
    void dt;
  }

  private makeNoise(x: number, z: number, r: number, kind: "step" | "coin" | "thud") {
    const grid = this.level!.grid;
    const color = kind === "coin" ? "#ffcf6a" : kind === "thud" ? "#ff8a6a" : r > 3 ? "#ffb08a" : "#cfd8ff";
    this.rings.spawn(x, z, r, color, kind === "step" && r < 3 ? 0.35 : 0.75, kind === "step" ? 0.5 : 0.8);
    for (const g of this.guards) {
      if (!g.alive) continue;
      let d = Math.hypot(g.x - x, g.z - z);
      if (!grid.los(g.x, g.z, x, z)) d *= 1.6;
      if (d > r) continue;
      if (kind === "step" && this.alarm) this.ctx.spotted(x, z);
      g.notice(x, z, this.ctx, { coin: kind === "coin" });
    }
  }

  private throwCoin(x: number, z: number) {
    if (this.phase !== "playing" || this.stage !== "play" || this.throwCd > 0 || this.busy) return;
    if (this.coinsLeft <= 0) {
      this.events.toast("No coins left to throw", "info");
      return;
    }
    const t = this.thief;
    let dx = x - t.x;
    let dz = z - t.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) return;
    if (d > THROW_RANGE) {
      dx *= THROW_RANGE / d;
      dz *= THROW_RANGE / d;
    }
    const target = this.level!.grid.nearestWalkable(t.x + dx, t.z + dz);
    if (!target) return;
    // Land where the cursor pointed when that spot is open floor.
    const tx = Math.abs(t.x + dx - target.x) < 0.5 && Math.abs(t.z + dz - target.z) < 0.5 ? t.x + dx : target.x;
    const tz = Math.abs(t.x + dx - target.x) < 0.5 && Math.abs(t.z + dz - target.z) < 0.5 ? t.z + dz : target.z;
    this.coinsLeft--;
    this.throwCd = 0.7;
    this.busy = { kind: "throw", t: 0.28 };
    t.yaw = Math.atan2(dx, dz);
    this.thiefView!.anim.play("interact-right", { once: true, fade: 0.06, speed: 1.6, restart: true });
    const obj = this.protos.get("coin")?.object.clone() ?? new THREE.Group();
    this.scene.add(obj);
    const dist = Math.hypot(tx - t.x, tz - t.z);
    this.coins.push({ obj, from: { x: t.x, z: t.z }, to: { x: tx, z: tz }, t: 0, dur: 0.35 + dist * 0.05, landed: false, life: 14 });
    this.sfx.coinThrow();
    this.emitHud();
  }

  private updateCoins(dt: number) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (!c.landed) {
        c.t += dt;
        const k = Math.min(1, c.t / c.dur);
        const dist = Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z);
        c.obj.position.set(c.from.x + (c.to.x - c.from.x) * k, 0.7 * (1 - k) + 0.03 + Math.sin(k * Math.PI) * (0.8 + dist * 0.12), c.from.z + (c.to.z - c.from.z) * k);
        c.obj.rotation.x += dt * 18;
        if (k >= 1) {
          c.landed = true;
          c.obj.rotation.set(Math.PI / 2, 0, this.random() * 6);
          c.obj.position.y = 0.03;
          this.sfx.coinClink();
          this.sparkles.burst(c.to.x, 0.1, c.to.z, "#ffd27a", 8, 1.2);
          this.makeNoise(c.to.x, c.to.z, NOISE.coin, "coin");
        }
      } else {
        c.life -= dt;
        if (c.life <= 0) {
          c.obj.removeFromParent();
          this.coins.splice(i, 1);
        }
      }
    }
  }

  /** Opened doors sink into the floor, then stop blocking. */
  private updateDoors(dt: number) {
    const level = this.level!;
    for (const d of this.view!.doors) {
      if (!d.opening || d.open >= 1) continue;
      d.open = Math.min(1, d.open + dt * 1.3);
      d.obj.position.y = -WALL_H * d.open;
      if (d.open >= 1) {
        d.obj.visible = false;
        const i = level.grid.idx(d.x, d.z);
        level.grid.solid[i] = 0;
        level.grid.opaque[i] = 0;
      }
    }
  }

  private raiseAlarm(x: number, z: number, by: string) {
    this.lastKnown.x = x;
    this.lastKnown.z = z;
    this.alarmQuiet = 0;
    if (this.alarm) return;
    this.alarm = true;
    this.alarmEver = true;
    this.alarmReason = by;
    this.alarmFlash = 1;
    for (const g of this.guards) g.hunt(this.ctx);
    this.sfx.alarmStart();
    music.setIntensity(2);
    const why = by === "laser" ? "You tripped a laser!" : by === "plate" ? "A pressure plate clicked!" : by === "camera" ? "A camera spotted you!" : "A guard spotted you!";
    this.events.toast(`ALARM — ${why} Break line of sight and hide.`, "bad");
  }

  private updateAlarm(dt: number) {
    if (!this.alarm) return;
    this.sfx.siren(dt);
    this.alarmQuiet += dt;
    if (this.alarmQuiet >= ALARM_TIME) {
      this.alarm = false;
      for (const g of this.guards) g.standDown(this.ctx);
      for (const c of this.cams) c.awareness = 0;
      music.setIntensity(1);
      this.sfx.allClear();
      this.events.toast("The alarm stopped. They lost you… for now.", "info");
    }
  }

  private caught(by: Guard) {
    if (this.stage !== "play") return;
    this.stage = "caught";
    this.stageT = 0;
    this.alarmReason = "caught";
    this.sfx.caught();
    by.yaw = Math.atan2(this.thief.x - by.x, this.thief.z - by.z);
    by.view.anim.play("interact-right", { once: true, fade: 0.08 });
    this.thiefView!.anim.play("die", { once: true, fade: 0.1, speed: 0.5 });
    this.thief.vx = this.thief.vz = 0;
    this.sfx.stopLoops();
  }

  private finish(escaped: boolean) {
    if (this.phase !== "playing") return;
    const level = this.level!;
    const def = LEVELS[level.index];
    let stars = 0;
    if (escaped) {
      stars = 1;
      if (!this.alarmEver) stars++;
      if (this.lootTaken >= level.lootTotal) stars++;
    }
    this.sfx.stopLoops();
    music.setIntensity(0);
    this.events.result({
      level: level.index,
      escaped,
      reason: escaped ? "" : this.alarmReason,
      time: this.time,
      loot: this.lootTaken,
      lootTotal: level.lootTotal,
      value: escaped ? this.value + TARGET_VALUE : 0,
      alarm: this.alarmEver,
      knockouts: this.knockouts,
      stars,
      par: def.par,
    });
    this.setPhase("result");
  }

  /** What E would do right now (also drives the prompt). */
  private useTarget(): { label: string; run: () => void } | null {
    const t = this.thief;
    const view = this.view!;
    const level = this.level!;
    // Knock out an unaware guard from behind.
    for (const g of this.guards) {
      if (!g.alive || g.state === "hunt" || g.awareness > 0.75) continue;
      const d = Math.hypot(g.x - t.x, g.z - t.z);
      if (d > REACH.ko) continue;
      const behind = Math.abs(angleDiff(g.yaw, Math.atan2(t.x - g.x, t.z - g.z))) > 1.75;
      if (!behind) continue;
      return {
        label: "Knock out",
        run: () => {
          g.knockOut();
          this.knockouts++;
          t.yaw = Math.atan2(g.x - t.x, g.z - t.z);
          this.busy = { kind: "knock", t: 0.45 };
          this.thiefView!.anim.play("attack-melee-right", { once: true, fade: 0.05, speed: 1.3, restart: true });
          this.sfx.knockout();
          this.makeNoise(g.x, g.z, NOISE.thud, "thud");
        },
      };
    }
    if (!this.hasGem && Math.hypot(level.target.x - t.x, level.target.z - t.z) < REACH.pedestal) {
      return {
        label: `Steal the ${LEVELS[level.index].target.name}`,
        run: () => {
          this.hasGem = true;
          view.gem.visible = false;
          view.gemGlow.visible = false;
          this.busy = { kind: "pickup", t: 0.5 };
          t.yaw = Math.atan2(level.target.x - t.x, level.target.z - t.z);
          this.thiefView!.anim.play("pick-up", { once: true, fade: 0.06, speed: 0.7, restart: true });
          this.sfx.gem();
          this.sparkles.burst(level.target.x, PEDESTAL_H + 0.2, level.target.z, view.gemGlow.material.color.getStyle(), 36, 2.6);
          this.events.toast(`You have the ${LEVELS[level.index].target.name}. Now get out!`, "good");
        },
      };
    }
    for (const l of view.loot) {
      if (l.taken || !l.plinth) continue;
      if (Math.hypot(l.x - t.x, l.z - t.z) > REACH.plinth) continue;
      return {
        label: `Take the ${LOOT_NAME[l.kind].toLowerCase()} ($${LOOT_VALUE[l.kind]})`,
        run: () => {
          this.busy = { kind: "pickup", t: 0.45 };
          t.yaw = Math.atan2(l.x - t.x, l.z - t.z);
          this.thiefView!.anim.play("pick-up", { once: true, fade: 0.06, speed: 0.7, restart: true });
          this.takeLoot(l);
        },
      };
    }
    for (const d of view.doors) {
      if (d.opening || Math.hypot(d.x - t.x, d.z - t.z) > REACH.door) continue;
      if (this.alarm) return { label: "Locked down during the alarm", run: () => this.sfx.denied() };
      if (this.keysHeld <= 0) return { label: "Locked — find a key card", run: () => this.sfx.denied() };
      return {
        label: "Open with the key card",
        run: () => {
          this.keysHeld--;
          d.opening = true;
          this.sfx.unlock();
          this.busy = { kind: "pickup", t: 0.35 };
          this.thiefView!.anim.play("interact-right", { once: true, fade: 0.06, restart: true });
        },
      };
    }
    if (!this.camerasOff && this.cams.length) {
      for (const c of level.consoles) {
        if (Math.hypot(c.x - t.x, c.z - t.z) > REACH.console) continue;
        return {
          label: "Switch off the cameras",
          run: () => {
            this.camerasOff = true;
            for (const cam of this.cams) cam.disabled = true;
            this.sfx.console();
            this.busy = { kind: "pickup", t: 0.6 };
            this.thiefView!.anim.play("interact-right", { once: true, fade: 0.06, restart: true });
            this.events.toast("Cameras offline", "good");
          },
        };
      }
    }
    return null;
  }

  private handleUse() {
    if (!this.useQueued) return;
    this.useQueued = false;
    if (this.busy) return;
    this.useTarget()?.run();
  }

  // --- Visuals ----------------------------------------------------------------------------------------------

  private readonly prevGuard = new Map<Guard, Vec2>();

  private visuals(dt: number) {
    const view = this.view;
    const level = this.level;
    if (!view || !level) return;
    const t = this.thief;
    const now = this.realTime;

    // Thief.
    const tv = this.thiefView;
    if (tv && tv.root.visible) {
      tv.place(t.x, t.z, t.yaw);
      if (this.stage === "play" && !this.busy) {
        const sp = Math.hypot(t.vx, t.vz);
        if (this.stance === "run") tv.anim.play("sprint", { speed: Math.max(0.8, sp / 4.2) });
        else if (sp > 0.25) tv.anim.play("walk", { speed: Math.max(0.55, sp / (this.stance === "sneak" ? 1.6 : 2.4)) });
        else tv.anim.play("idle");
      } else if (this.stage === "escape") tv.anim.play("walk", { speed: 0.9 });
      const crouchTarget = this.stage === "play" && (t.sneaking || this.stance === "sneak") && !this.busy ? 0.6 : this.stage === "caught" ? 0 : 0;
      tv.anim.crouch = damp(tv.anim.crouch, crouchTarget, 10, dt);
      tv.anim.update(dt);
    }

    // Guards.
    for (const g of this.guards) {
      const prev = this.prevGuard.get(g) ?? { x: g.x, z: g.z };
      const moved = Math.hypot(g.x - prev.x, g.z - prev.z);
      this.prevGuard.set(g, { x: g.x, z: g.z });
      g.sync(dt, this.ctx, this.camera, dt > 0 ? moved : 0);
    }
    for (let i = 0; i < this.cams.length; i++) {
      const c = this.cams[i];
      c.sync(this.ctx, this.camera);
      const obj = view.cameras[i];
      if (obj) obj.rotation.y = c.yaw;
    }


    // Spin the valuables, flicker the flames.
    view.gem.rotation.y += dt * 1.2;
    view.gem.position.y = PEDESTAL_H + 0.22 + Math.sin(now * 2) * 0.04;
    view.gemBeam.visible = !this.hasGem;
    this.gemLight.intensity = this.hasGem ? 0 : 3.2 + Math.sin(now * 3) * 0.4;
    for (const k of view.keys) if (!k.taken) k.obj.rotation.y += dt * 2;
    for (const l of view.loot) if (!l.taken && l.kind !== "coins") l.obj.rotation.y += dt * 0.6;
    for (const tr of view.torches) {
      const f = 1 + Math.sin(now * 13 + tr.phase) * 0.08 + Math.sin(now * 7.3 + tr.phase * 2) * 0.06;
      tr.flame.scale.set(1, f, 1);
    }
    this.assignTorchLights(dt, now);

    // Exit glows green once you hold the gem.
    const ex = view.exitGlow.material;
    ex.opacity = this.hasGem ? 0.5 + Math.sin(now * 4) * 0.2 : 0.12;

    // Alarm: the hall goes red and pulses.
    const alarmPulse = this.alarm ? 0.5 + 0.5 * Math.sin(now * 7) : 0;
    this.alarmFlash = damp(this.alarmFlash, this.alarm ? 1 : 0, 3, dt || 0.016);
    this.hemi.color.setRGB(0.36 + alarmPulse * 0.22 * this.alarmFlash, 0.43 - this.alarmFlash * 0.1, 0.66 - this.alarmFlash * 0.2);
    this.hemi.intensity = 1.15 + this.alarmFlash * alarmPulse * 0.25;

    // Thief marker, objective chevron, throw reticle.
    const playing = this.phase === "playing" || this.phase === "paused";
    this.marker.visible = playing && this.stage === "play";
    if (this.marker.visible) {
      this.marker.position.set(t.x, 0.045, t.z);
      const light = level.grid.lightAt(t.x, t.z);
      this.marker.material.color.set(light > 0.55 ? "#ffd27a" : "#f87171");
      this.marker.material.opacity = 0.35 + light * 0.35;
    }
    const goal = this.hasGem ? level.exit.inside : level.target;
    const gd = Math.hypot(goal.x - t.x, goal.z - t.z);
    this.chevron.visible = playing && this.stage === "play" && gd > 3 && !this.overview;
    if (this.chevron.visible) {
      const a = Math.atan2(goal.x - t.x, goal.z - t.z);
      this.chevron.position.set(t.x + Math.sin(a) * 0.85, 0.06, t.z + Math.cos(a) * 0.85);
      this.chevron.rotation.y = a;
      this.chevron.material.color.set(this.hasGem ? "#7dffb0" : "#ffe6a8");
      this.chevron.material.opacity = 0.55 + Math.sin(now * 4) * 0.25;
    }
    const m = this.mouse;
    this.reticle.visible = !!m && this.phase === "playing" && this.stage === "play" && this.coinsLeft > 0 && now - m.t < 4;
    if (this.reticle.visible && m) {
      const p = this.floorPoint(m.x, m.y);
      if (p) {
        let dx = p.x - t.x;
        let dz = p.z - t.z;
        const d = Math.hypot(dx, dz);
        if (d > THROW_RANGE) {
          dx *= THROW_RANGE / d;
          dz *= THROW_RANGE / d;
        }
        this.reticle.position.set(t.x + dx, 0.06, t.z + dz);
        this.reticleRange.material.opacity = 0.16;
      } else this.reticle.visible = false;
    }

    this.rings.update(dt);
    this.sparkles.update(dt);
  }

  /** A handful of real point lights follow the torches nearest the camera. */
  private assignTorchLights(dt: number, now: number) {
    const view = this.view!;
    this.torchAssignT -= dt;
    if (this.torchAssignT <= 0) {
      this.torchAssignT = 0.25;
      const fx = this.focus.x;
      const fz = this.focus.z;
      const sorted = [...view.torches].sort((a, b) => Math.hypot(a.x - fx, a.z - fz) - Math.hypot(b.x - fx, b.z - fz));
      this.torchLights.forEach((l, i) => {
        const tr = sorted[i];
        l.userData.torch = tr ?? null;
        if (tr) l.position.set(tr.x, tr.y, tr.z);
      });
    }
    for (const l of this.torchLights) {
      const tr = l.userData.torch as LevelView["torches"][number] | null;
      if (!tr) {
        l.intensity = 0;
        continue;
      }
      const flick = 1 + Math.sin(now * 11 + tr.phase) * 0.08 + Math.sin(now * 23 + tr.phase * 3) * 0.05;
      l.intensity = damp(l.intensity, 7.5 * flick, 8, dt || 0.016);
    }
  }

  // --- Camera -----------------------------------------------------------------------------------------------

  private cameraGoal(out: THREE.Vector3, focus: THREE.Vector3) {
    const level = this.level;
    if (!level) return;
    const aspect = this.camera.aspect;
    const over = this.overview || this.phase === "menu" || this.phase === "briefing";
    let dist: number;
    let pitch: number;
    if (over) {
      const vFov = THREE.MathUtils.degToRad(this.camera.fov);
      const needH = (level.grid.h + 2) / (2 * Math.tan(vFov / 2)) * 0.92;
      const needW = (level.grid.w + 2) / (2 * Math.tan(vFov / 2) * aspect);
      dist = Math.max(needH, needW) * (this.phase === "briefing" ? 1.25 : 1.05);
      pitch = THREE.MathUtils.degToRad(64);
      focus.copy(this.view!.center);
      if (this.phase === "briefing" && !this.portrait) focus.x -= (dist * Math.tan(vFov / 2) * aspect) * 0.38;
      if (this.phase === "briefing" && this.portrait) focus.z += dist * 0.18;
      if (this.phase === "menu") {
        focus.x += Math.sin(this.menuT * 0.12) * 2;
        focus.z += Math.cos(this.menuT * 0.1) * 1.2;
      }
    } else {
      dist = (this.portrait ? 17 : 12.5) * this.zoom;
      pitch = THREE.MathUtils.degToRad(58);
      const t = this.thief;
      focus.set(t.x + t.vx * 0.25, 0, t.z + t.vz * 0.25 + (this.portrait ? 0.6 : 0.3));
    }
    out.set(focus.x, Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
  }

  private snapCamera() {
    this.cameraGoal(this.camPos, this.focus);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.focus);
  }

  private readonly goalPos = new THREE.Vector3();
  private readonly goalFocus = new THREE.Vector3();

  private updateCamera(dt: number) {
    if (!this.level) return;
    this.cameraGoal(this.goalPos, this.goalFocus);
    const k = this.overview || this.phase !== "playing" ? 3 : 6;
    this.camPos.x = damp(this.camPos.x, this.goalPos.x, k, dt);
    this.camPos.y = damp(this.camPos.y, this.goalPos.y, k, dt);
    this.camPos.z = damp(this.camPos.z, this.goalPos.z, k, dt);
    this.focus.x = damp(this.focus.x, this.goalFocus.x, k, dt);
    this.focus.z = damp(this.focus.z, this.goalFocus.z, k, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
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
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
  }

  // --- HUD -----------------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    if (phase !== "playing") this.reticle.visible = false;
  }

  private emitHud(force = false) {
    const level = this.level;
    if (!level) return;
    const def = LEVELS[level.index];
    let suspicion = 0;
    for (const g of this.guards) if (g.alive) suspicion = Math.max(suspicion, g.awareness);
    for (const c of this.cams) if (!c.disabled) suspicion = Math.max(suspicion, c.awareness);
    const target = this.stage === "play" && this.phase === "playing" ? this.useTarget() : null;
    const hud: Hud = {
      level: level.index,
      gem: this.hasGem,
      loot: this.lootTaken,
      lootTotal: level.lootTotal,
      value: this.value + (this.hasGem ? TARGET_VALUE : 0),
      coins: this.coinsLeft,
      keys: this.keysHeld,
      alarm: this.alarm,
      alarmLeft: this.alarm ? Math.ceil(ALARM_TIME - this.alarmQuiet) : 0,
      suspicion: Math.round(suspicion * 20) / 20,
      light: Math.round(level.grid.lightAt(this.thief.x, this.thief.z) * 10) / 10,
      stance: this.stance,
      sneakLock: this.sneakLock,
      prompt: target?.label ?? null,
      objective: this.hasGem ? "Escape through the exit door" : `Steal the ${def.target.name}`,
      time: Math.floor(this.time),
      overview: this.overview,
      camerasOff: this.camerasOff,
      hasCameras: this.cams.length > 0,
    };
    const key = JSON.stringify(hud);
    if (!force && key === this.hudCache) return;
    this.hudCache = key;
    this.events.hud(hud);
  }

  // --- Debug (test bot) ---------------------------------------------------------------------------------------

  /** Read-only snapshot for tests. */
  debugState() {
    const level = this.level;
    return {
      phase: this.phase,
      stage: this.stage,
      level: level?.index ?? -1,
      thief: { x: this.thief.x, z: this.thief.z },
      gem: this.hasGem,
      loot: this.lootTaken,
      lootTotal: level?.lootTotal ?? 0,
      alarm: this.alarm,
      alarmEver: this.alarmEver,
      time: this.time,
      keys: this.keysHeld,
      coins: this.coinsLeft,
      guards: this.guards.map((g) => ({ x: g.x, z: g.z, yaw: g.yaw, state: g.state, a: g.awareness })),
    };
  }

  /** Test hooks. */
  get debug() {
    return { level: this.level, guards: this.guards, cams: this.cams, view: this.view, thief: this.thief, Animator };
  }

  debugUse() {
    this.useQueued = true;
  }

  debugThrow(x: number, z: number) {
    this.throwCoin(x, z);
  }
}
