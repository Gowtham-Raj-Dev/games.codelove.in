import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AdaptiveRes } from "../shared/adaptive-res";
import { disposeTree, loadModels, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { NOIR_HEIST } from "../shared/songs";
import { CameraView, CharView, DroneView, GuardView } from "./actors";
import { Sfx } from "./audio";
import { LEVELS } from "./campaign";
import { BASE_MODS, districtOf, findItem, OUTFITS, THIEVES, type GadgetId, type Mods } from "./content";
import { chevronGeometry, iconAtlas, makeRingTexture, radialTexture, Rings, Sparkles } from "./fx";
import { damp } from "./grid";
import { MODELS } from "./manifest";
import { ALARM_TIME, HeistSim, NO_FX, NOISE, SMOKE, THROW_RANGE, type Result, type SimFx, type SimInput, type SoundName, type Stance } from "./sim";
import type { Voice } from "./watchers";
import { buildProtos, GEM_COLORS, LevelView, type TorchView } from "./world";

export type { Result, Stance } from "./sim";

export type Phase = "loading" | "menu" | "briefing" | "playing" | "paused" | "result" | "error";

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
  /** Highest awareness among guards, cameras and drones, 0..1. */
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
  /** Seconds left on the vault timer (-1: none running). */
  timer: number;
  gadget: GadgetId | null;
  charges: number;
  /** 0..1 progress on a safe (0: not cracking). */
  crack: number;
  /** Standing in smoke. */
  cloaked: boolean;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  toast(text: string, tone?: "info" | "good" | "bad"): void;
  result(result: Result): void;
  error(message: string): void;
}

const SOUNDS: Record<SoundName, (s: Sfx) => void> = {
  stepSneak: (s) => s.step("sneak"),
  stepWalk: (s) => s.step("walk"),
  stepRun: (s) => s.step("run"),
  creak: (s) => s.creak(),
  zap: (s) => s.zap(),
  plate: (s) => s.plateClick(),
  alarm: (s) => s.alarmStart(),
  allClear: (s) => s.allClear(),
  coinThrow: (s) => s.coinThrow(),
  coinClink: (s) => s.coinClink(),
  pickup: (s) => s.pickup(),
  gem: (s) => s.gem(),
  key: (s) => s.key(),
  unlock: (s) => s.unlock(),
  denied: (s) => s.denied(),
  console: (s) => s.console(),
  knockout: (s) => s.knockout(),
  escape: (s) => s.escape(),
  caught: (s) => s.caught(),
  denyExit: (s) => s.denyExit(),
  crack: (s) => s.crack(),
  safeOpen: (s) => s.safeOpen(),
  smoke: (s) => s.smoke(),
  jam: (s) => s.jam(),
  timer: (s) => s.timerTick(),
  timerOut: (s) => s.timerOut(),
};

const CLIPS = {
  pickup: ["pick-up", 0.7],
  throw: ["interact-right", 1.6],
  knock: ["attack-melee-right", 1.3],
  use: ["interact-right", 1],
  crack: ["interact-right", 0.45],
  die: ["die", 0.5],
} as const;

export class NightHeistGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private readonly timer = new THREE.Timer();
  private readonly sfx = new Sfx();
  private readonly res: AdaptiveRes;
  private protos = new Map<string, Proto>();
  private envTexture: THREE.Texture | null = null;
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private portrait = false;

  // Lighting
  private readonly hemi = new THREE.HemisphereLight("#5d6fa8", "#2a2018", 1.15);
  private readonly moon = new THREE.DirectionalLight("#a9bdff", 0.6);
  private readonly torchLights: THREE.PointLight[] = [];
  private readonly gemLight = new THREE.PointLight("#ffffff", 4, 3.6, 1.6);
  private readonly skyColor = new THREE.Color();
  private torchAssignT = 0;

  // Effects
  private readonly rings = new Rings(20);
  private readonly sparkles = new Sparkles(180);
  private readonly atlas = iconAtlas();
  private readonly ringTex = makeRingTexture();
  private readonly glowTex = radialTexture();
  private readonly marker: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly reticle: THREE.Group;
  private readonly chevron: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly clouds: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly coinViews = new Map<number, THREE.Object3D>();
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

  // The heist
  /** The heist being played (or shown behind the menus). */
  sim: HeistSim | null = null;
  private view: LevelView | null = null;
  private guardViews: GuardView[] = [];
  private camViews: CameraView[] = [];
  private droneViews: DroneView[] = [];
  private levelIndex = 0;
  /** The heist on screen is only a backdrop for the menus. */
  private ambient = false;
  private mods: Mods = BASE_MODS;
  private readonly thieves = new Map<string, CharView>();
  private thiefView: CharView | null = null;
  private look = { thief: THIEVES[0].id, outfit: OUTFITS[0].id };

  // State
  private phase: Phase = "loading";
  private realTime = 0;
  private overview = false;
  private zoom = 1;
  private showcase = false;
  private readonly shift = { x: 0, y: 0 };
  private showcaseYaw = 0;
  private readonly focus = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly goalPos = new THREE.Vector3();
  private readonly goalFocus = new THREE.Vector3();
  private menuT = 0;
  private hudCache = "";
  private alarmFlash = 0;
  private escaping = false;

  // Input
  private readonly keys = new Set<string>();
  private readonly stick = { x: 0, y: 0 };
  private sneakLock = false;
  private touchRun = false;
  private useQueued = false;
  private gadgetQueued = false;
  private throwQueued: [number, number] | null = null;
  private mouse: { x: number; y: number; t: number } | null = null;
  private readonly ndc = new THREE.Vector2();
  private readonly ray = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** Tests: the game stops stepping the heist itself; `autoStep` does it with scripted input. */
  auto = false;

  /** What the heist reports while it is played: sounds, sparkles, messages, the thief's moves. */
  private readonly fx: SimFx = {
    sound: (name) => SOUNDS[name](this.sfx),
    voice: (kind, pitch) => this.voice(kind, pitch),
    ring: (x, z, r, color, alpha, life) => this.rings.spawn(x, z, r, color, alpha, life),
    burst: (x, y, z, color, n, speed) => this.sparkles.burst(x, y, z, color === "gem" ? GEM_COLORS[LEVELS[this.levelIndex].target.gem] : color, n, speed),
    toast: (text, tone) => this.events.toast(text, tone),
    thiefClip: (clip) => {
      const [name, speed] = CLIPS[clip];
      this.thiefView?.anim.play(name, { once: true, fade: 0.06, speed, restart: true });
    },
    guardCatch: (i) => this.guardViews[i]?.grab(),
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: "high-performance" });
    this.res = new AdaptiveRes(this.renderer, () => this.resize(), { start: coarse ? 1.5 : 2, max: 2, min: 0.7 });
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
    const range = new THREE.Mesh(
      new THREE.PlaneGeometry(NOISE.coin * 2, NOISE.coin * 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.ringTex, color: "#ffd27a", transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    this.reticle.add(dot, range);
    this.reticle.position.y = 0.06;
    this.reticle.visible = false;
    this.reticle.renderOrder = 3;
    scene.add(this.reticle);
    this.chevron = new THREE.Mesh(chevronGeometry(), new THREE.MeshBasicMaterial({ color: "#ffe6a8", transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.chevron.renderOrder = 4;
    scene.add(this.chevron);
    // Smoke clouds: soft grey discs, a low one and a higher one each.
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(SMOKE.radius * 2.6, SMOKE.radius * 2.6).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: this.glowTex, color: "#cbd5e1", transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      );
      cloud.visible = false;
      cloud.renderOrder = 7;
      this.clouds.push(cloud);
      scene.add(cloud);
    }

    this.fade = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 1, depthTest: false, depthWrite: false }));
    this.fade.position.z = -0.3;
    this.fade.renderOrder = 999;
    this.camera.add(this.fade);
    scene.add(this.camera);

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

  async load(sizes: Record<string, number>, look: { thief: string; outfit: string }, first = 0) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const required = MODELS.slice(0, 6);
      if (!required.every((k) => models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");
      this.protos = buildProtos(models);
      this.setLook(look.thief, look.outfit);
      this.preview(first);
      this.renderer.compile(this.scene, this.camera);
      music.play(NOIR_HEIST, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  /** Puts a crew member and an outfit on screen (the shop previews them this way too). */
  setLook(thiefId: string, outfitId: string) {
    const thief = findItem(THIEVES, thiefId);
    const outfit = findItem(OUTFITS, outfitId);
    this.look = { thief: thief.id, outfit: outfit.id };
    let view = this.thieves.get(thief.id);
    if (!view) {
      const proto = this.protos.get(`thief_${thief.id}`) ?? this.protos.get(`thief_${THIEVES[0].id}`);
      if (!proto) return;
      view = new CharView(proto);
      this.addSilhouette(view);
      view.root.visible = false;
      this.scene.add(view.root);
      this.thieves.set(thief.id, view);
    }
    if (this.thiefView !== view) {
      const was = this.thiefView;
      view.root.visible = was ? was.root.visible : false;
      if (was) {
        view.root.position.copy(was.root.position);
        view.root.rotation.copy(was.root.rotation);
        was.root.visible = false;
        was.anim.stopAll();
      }
      view.anim.stopAll();
      view.anim.play("idle", { fade: 0 });
      this.thiefView = view;
    }
    // The outfit: the suit's colour over the model's own shading, a glow for the flashy ones.
    const tint = new THREE.Color("#ffffff").lerp(new THREE.Color(outfit.tint), 0.6).multiplyScalar(0.72);
    view.model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mat = m as THREE.MeshStandardMaterial;
        if (mat === (this.silhouetteMat as THREE.Material) || !mat.color) continue;
        mat.color.copy(tint);
        if (mat.emissive) {
          mat.emissive.set(outfit.glow ?? "#000000");
          mat.emissiveMap = outfit.glow ? mat.map : null;
          mat.emissiveIntensity = outfit.glow ? 0.55 : 0;
          mat.needsUpdate = true;
        }
      }
    });
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

  private buildLevel(index: number, mods: Mods, live: boolean) {
    this.clearLevel();
    this.levelIndex = index;
    this.mods = mods;
    this.ambient = !live;
    const def = LEVELS[index];
    const district = districtOf(index);
    const sim = (this.sim = new HeistSim(def, index, mods, live ? this.fx : NO_FX));
    const level = sim.level;
    const view = (this.view = new LevelView(level, district.id, this.protos));
    this.scene.add(view.group);
    this.guardViews = sim.guards.map((g) => {
      const v = new GuardView(g, this.protos.get(g.kind) ?? this.protos.get("guard")!, this.atlas);
      v.addTo(this.scene);
      return v;
    });
    this.camViews = sim.cams.map((c) => {
      const v = new CameraView(c, this.atlas);
      v.addTo(this.scene);
      return v;
    });
    this.droneViews = sim.drones.map((d) => {
      const v = new DroneView(d, this.protos.get("drone"), this.atlas, this.glowTex);
      v.addTo(this.scene);
      return v;
    });
    // The district's light.
    const theme = view.theme;
    (this.scene.background as THREE.Color).set(theme.bg);
    this.skyColor.set(theme.sky);
    this.hemi.color.copy(this.skyColor);
    this.hemi.groundColor.set(theme.ground);
    this.moon.color.set(theme.moon);
    for (const l of this.torchLights) l.color.set(theme.lamp);
    // Moonlight shadows cover the level.
    const { grid } = level;
    const c = view.center;
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
    this.gemLight.color.set(GEM_COLORS[def.target.gem]);
    this.gemLight.position.set(level.target.x, PEDESTAL_TOP, level.target.z);
    this.torchAssignT = 0;
    this.escaping = false;
    this.hudCache = "";
  }

  private clearLevel() {
    for (const v of this.guardViews) v.dispose();
    for (const v of this.camViews) v.dispose();
    for (const v of this.droneViews) v.dispose();
    this.guardViews = [];
    this.camViews = [];
    this.droneViews = [];
    for (const obj of this.coinViews.values()) obj.removeFromParent();
    this.coinViews.clear();
    for (const c of this.clouds) c.visible = false;
    this.view?.dispose();
    this.view = null;
    this.sim = null;
    this.rings.clear();
    this.sparkles.clear();
    this.sfx.stopLoops();
  }

  /** Menu / briefing backdrop: the chosen heist seen from above with its guards on their rounds. */
  preview(index: number) {
    if (!this.protos.size) return;
    const i = Math.max(0, Math.min(LEVELS.length - 1, index));
    const browsing = this.phase === "menu" || this.phase === "briefing";
    // (A heist that was just played is rebuilt: its guards go back to their rounds.)
    if (this.levelIndex !== i || !this.sim || !this.ambient || !browsing) this.buildLevel(i, BASE_MODS, false);
    if (this.thiefView) this.thiefView.root.visible = this.showcase;
    this.overview = true;
    this.fadeTarget = 0;
    this.menuT = 0;
  }

  start(index: number, mods: Mods = BASE_MODS) {
    if (!this.protos.size) return;
    const i = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.setShowcase(false);
    this.buildLevel(i, mods, true);
    this.clearInput();
    this.useQueued = this.gadgetQueued = false;
    this.throwQueued = null;
    this.sneakLock = false;
    const tv = this.thiefView;
    if (tv) {
      tv.root.visible = true;
      tv.anim.stopAll();
      tv.anim.play("idle", { fade: 0 });
      tv.anim.crouch = 0;
    }
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
    this.start(this.levelIndex, this.mods);
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
    this.setPhase("menu");
    this.preview(this.levelIndex);
  }

  briefing(index: number) {
    this.setShowcase(false);
    this.preview(index);
    this.setPhase("briefing");
  }

  get currentLevel() {
    return this.levelIndex;
  }

  /** The shop: the camera comes down to the thief; `shift` is how much of the screen the shop panel covers. */
  setShowcase(on: boolean, shift?: { x: number; y: number }) {
    this.showcase = on;
    if (shift) {
      this.shift.x = shift.x;
      this.shift.y = shift.y;
    }
    if (this.thiefView && (this.phase === "menu" || this.phase === "briefing")) this.thiefView.root.visible = on;
    this.applyShift();
  }

  private applyShift() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    if (this.showcase && (this.shift.x || this.shift.y)) this.camera.setViewOffset(w, h, -this.shift.x * w, this.shift.y * h, w, h);
    else this.camera.clearViewOffset();
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
    if (this.phase === "playing") this.useQueued = true;
  }

  gadget() {
    if (this.phase === "playing") this.gadgetQueued = true;
  }

  toggleOverview() {
    this.overview = !this.overview;
    this.emitHud();
  }

  /** Throw at a screen point (touch taps, mouse clicks). */
  throwAtScreen(clientX: number, clientY: number) {
    const p = this.floorPoint(clientX, clientY);
    if (p && this.phase === "playing") this.throwQueued = [p.x, p.z];
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
    this.clearLevel();
    this.sfx.dispose();
    for (const v of this.thieves.values()) v.anim.stopAll();
    for (const proto of this.protos.values()) disposeTree(proto.object);
    this.rings.dispose();
    this.sparkles.dispose();
    this.atlas.dispose();
    this.ringTex.dispose();
    this.glowTex.dispose();
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
    const gameKey = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyE", "KeyQ", "KeyR", "KeyC", "KeyG"].includes(c);
    if (!gameKey) return;
    e.preventDefault();
    this.keys.add(c);
    if (e.repeat) return;
    if (c === "KeyE") this.useQueued = true;
    else if (c === "KeyG") this.gadgetQueued = true;
    else if (c === "KeyQ") this.toggleOverview();
    else if (c === "KeyC") this.toggleSneak();
    // R (restart) is handled by the React shell, so its messages and hints reset with the run.
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
    if (!(rect.width > 0 && rect.height > 0)) return null;
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  /** This frame's input (the camera looks north, so the stick maps straight onto the floor). */
  private readInput(): SimInput {
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
    const input: SimInput = {
      x,
      z,
      sneak: k.has("ShiftLeft") || k.has("ShiftRight") || this.sneakLock,
      run: k.has("Space") || this.touchRun,
      use: this.useQueued,
      gadget: this.gadgetQueued,
      throwAt: this.throwQueued,
    };
    this.useQueued = this.gadgetQueued = false;
    this.throwQueued = null;
    return input;
  }

  // --- Frame -----------------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const raw = this.timer.getDelta();
    const real = Math.min(raw, 1 / 20);
    this.realTime += real;
    if (this.phase === "loading" || this.phase === "error") return;

    if (this.phase === "playing" && !this.auto) this.step(real, this.readInput());
    else if (this.phase === "menu" || this.phase === "briefing") this.stepAmbient(real);
    const dt = this.phase === "paused" ? 0 : real;
    this.visuals(dt);
    this.updateCamera(dt);
    const f = this.fade.material;
    f.opacity = damp(f.opacity, this.fadeTarget, this.fadeTarget > f.opacity ? 6 : 3.5, real);
    this.fade.visible = f.opacity > 0.003;
    if (this.phase === "playing" || this.phase === "menu" || this.phase === "briefing") this.res.tick(raw); // uncapped, so the scaler can skip load hitches
    this.renderer.render(this.scene, this.camera);
  };

  /** Guards walk their rounds behind the menus (nobody there to see). */
  private stepAmbient(dt: number) {
    const sim = this.sim;
    if (!sim) return;
    this.menuT += dt;
    sim.thief.x = sim.thief.z = -100;
    sim.thief.vx = sim.thief.vz = 0;
    sim.step(dt, { x: 0, z: 0, sneak: true, run: false });
  }

  /** One step of the heist. */
  private step(dt: number, input: SimInput) {
    const sim = this.sim;
    if (!sim || this.phase !== "playing") return;
    sim.step(dt, input);
    if (sim.alarm && sim.stage === "play") this.sfx.siren(dt);
    this.sfx.laserHum(sim.stage === "play" ? sim.hum : 0);
    if (sim.stage === "escape" && !this.escaping) {
      this.escaping = true;
      this.fadeTarget = 1;
    }
    if (sim.result) {
      this.sfx.stopLoops();
      music.setIntensity(0);
      this.setPhase("result");
      this.events.result(sim.result);
      return;
    }
    this.emitHud();
  }

  /** Tests: one fixed step with scripted input (set `auto` first). */
  autoStep(dt: number, input: SimInput) {
    this.step(dt, input);
  }

  private voice(kind: Voice, pitch: number) {
    if (this.phase !== "playing") return;
    const s = this.sfx;
    if (kind === "huh") s.huh(pitch);
    else if (kind === "hey") s.hey(pitch);
    else if (kind === "shrug") s.shrug(pitch);
    else if (kind === "wake") s.wake();
    else if (kind === "lock") s.cameraLock();
    else if (kind === "bark") s.bark();
    else if (kind === "growl") s.growl();
    else if (kind === "servo") s.servo();
    else s.drone(pitch);
  }

  // --- Visuals ----------------------------------------------------------------------------------------------

  private visuals(dt: number) {
    const view = this.view;
    const sim = this.sim;
    if (!view || !sim) return;
    const t = sim.thief;
    const now = this.realTime;
    const level = sim.level;
    const playing = this.phase === "playing" || this.phase === "paused" || this.phase === "result";

    // Thief.
    const tv = this.thiefView;
    if (tv && tv.root.visible) {
      if (playing) {
        tv.place(t.x, t.z, t.yaw);
        if (sim.stage === "play" && !sim.busy) {
          const sp = Math.hypot(t.vx, t.vz);
          if (sim.stance === "run") tv.anim.play("sprint", { speed: Math.max(0.8, sp / 4.2) });
          else if (sp > 0.25) tv.anim.play("walk", { speed: Math.max(0.55, sp / (sim.stance === "sneak" ? 1.6 : 2.4)) });
          else tv.anim.play("idle");
        } else if (sim.stage === "escape") tv.anim.play("walk", { speed: 0.9 });
        const crouch = sim.stage === "play" && (t.sneaking || sim.stance === "sneak") && !sim.busy ? 0.6 : 0;
        tv.anim.crouch = damp(tv.anim.crouch, crouch, 10, dt);
      } else {
        // The shop: standing at the way in, turning slowly.
        this.showcaseYaw += dt * 0.5;
        tv.place(level.start.x, level.start.z, Math.PI * 0.15 + Math.sin(this.showcaseYaw) * 0.6);
        tv.anim.play("idle");
        tv.anim.crouch = 0;
      }
      tv.anim.update(dt);
    }

    // Everyone who watches.
    for (const g of this.guardViews) g.sync(dt, level.grid, sim.alarm, sim.time, this.camera);
    for (let i = 0; i < this.camViews.length; i++) {
      this.camViews[i].sync(level.grid, sim.alarm, this.camera);
      const obj = view.cameras[i];
      if (obj) obj.rotation.y = sim.cams[i].yaw;
    }
    for (const d of this.droneViews) d.sync(dt, sim.alarm, now, this.camera);

    view.sync(sim, dt, now);
    this.gemLight.intensity = sim.hasGem ? 0 : 3.2 + Math.sin(now * 3) * 0.4;
    this.assignTorchLights(dt, now, view.torches);
    this.syncCoins(sim, dt);

    // Smoke.
    for (let i = 0; i < this.clouds.length; i++) {
      const mesh = this.clouds[i];
      const c = sim.clouds[i >> 1];
      mesh.visible = !!c;
      if (!c) continue;
      const k = Math.min(1, c.t / 1.2) * Math.min(1, (SMOKE.time - c.t) / 0.35 + 0.2);
      mesh.position.set(c.x, i & 1 ? 0.9 : 0.12, c.z);
      mesh.rotation.y = now * (i & 1 ? 0.25 : -0.18);
      mesh.material.opacity = (i & 1 ? 0.55 : 0.8) * Math.max(0, Math.min(1, k));
    }

    // Alarm: the place goes red and pulses.
    const alarmPulse = sim.alarm ? 0.5 + 0.5 * Math.sin(now * 7) : 0;
    this.alarmFlash = damp(this.alarmFlash, sim.alarm ? 1 : 0, 3, dt || 0.016);
    const sky = this.skyColor;
    this.hemi.color.setRGB(sky.r + alarmPulse * 0.22 * this.alarmFlash, sky.g - this.alarmFlash * 0.1 * sky.g, sky.b - this.alarmFlash * 0.3 * sky.b);
    this.hemi.intensity = 1.15 + this.alarmFlash * alarmPulse * 0.25;

    // Thief marker, objective chevron, throw reticle.
    const active = (this.phase === "playing" || this.phase === "paused") && sim.stage === "play";
    this.marker.visible = active;
    if (active) {
      this.marker.position.set(t.x, 0.045, t.z);
      const light = level.grid.lightAt(t.x, t.z);
      this.marker.material.color.set(sim.cloaked ? "#cbd5e1" : light > 0.55 ? "#ffd27a" : "#f87171");
      this.marker.material.opacity = 0.35 + light * 0.35;
    }
    const goal = sim.hasGem ? level.exit.inside : level.target;
    const gd = Math.hypot(goal.x - t.x, goal.z - t.z);
    this.chevron.visible = active && gd > 3 && !this.overview;
    if (this.chevron.visible) {
      const a = Math.atan2(goal.x - t.x, goal.z - t.z);
      this.chevron.position.set(t.x + Math.sin(a) * 0.85, 0.06, t.z + Math.cos(a) * 0.85);
      this.chevron.rotation.y = a;
      this.chevron.material.color.set(sim.hasGem ? "#7dffb0" : "#ffe6a8");
      this.chevron.material.opacity = 0.55 + Math.sin(now * 4) * 0.25;
    }
    const m = this.mouse;
    this.reticle.visible = !!m && this.phase === "playing" && sim.stage === "play" && sim.coinsLeft > 0 && now - m.t < 4;
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
      } else this.reticle.visible = false;
    }

    this.rings.update(dt);
    this.sparkles.update(dt);
  }

  /** Thrown coins: in the air along an arc, then lying where they landed. */
  private syncCoins(sim: HeistSim, dt: number) {
    const live = new Set<number>();
    for (const c of sim.coins) {
      live.add(c.id);
      let obj = this.coinViews.get(c.id);
      if (!obj) {
        obj = this.protos.get("coin")?.object.clone() ?? new THREE.Group();
        this.scene.add(obj);
        this.coinViews.set(c.id, obj);
      }
      if (c.landed) {
        if (!obj.userData.landed) {
          obj.userData.landed = true;
          obj.rotation.set(Math.PI / 2, 0, c.id * 1.7);
        }
        obj.position.set(c.to.x, 0.03, c.to.z);
      } else {
        const k = Math.min(1, c.t / c.dur);
        const dist = Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z);
        obj.position.set(c.from.x + (c.to.x - c.from.x) * k, 0.7 * (1 - k) + 0.03 + Math.sin(k * Math.PI) * (0.8 + dist * 0.12), c.from.z + (c.to.z - c.from.z) * k);
        obj.rotation.x += dt * 18;
      }
    }
    for (const [id, obj] of this.coinViews) {
      if (live.has(id)) continue;
      obj.removeFromParent();
      this.coinViews.delete(id);
    }
  }

  /** A handful of real point lights follow the lamps nearest the camera. */
  private assignTorchLights(dt: number, now: number, torches: TorchView[]) {
    this.torchAssignT -= dt || 0.016;
    if (this.torchAssignT <= 0) {
      this.torchAssignT = 0.25;
      const fx = this.focus.x;
      const fz = this.focus.z;
      const sorted = [...torches].sort((a, b) => Math.hypot(a.x - fx, a.z - fz) - Math.hypot(b.x - fx, b.z - fz));
      this.torchLights.forEach((l, i) => {
        const tr = sorted[i];
        l.userData.torch = tr ?? null;
        if (tr) l.position.set(tr.x, tr.y, tr.z);
      });
    }
    for (const l of this.torchLights) {
      const tr = l.userData.torch as TorchView | null;
      if (!tr) {
        l.intensity = 0;
        continue;
      }
      const flick = tr.flame ? 1 + Math.sin(now * 11 + tr.phase) * 0.08 + Math.sin(now * 23 + tr.phase * 3) * 0.05 : 1;
      l.intensity = damp(l.intensity, 7.5 * flick, 8, dt || 0.016);
    }
  }

  // --- Camera -----------------------------------------------------------------------------------------------

  private cameraGoal(out: THREE.Vector3, focus: THREE.Vector3) {
    const sim = this.sim;
    const view = this.view;
    if (!sim || !view) return;
    const level = sim.level;
    const aspect = this.camera.aspect;
    const browsing = this.phase === "menu" || this.phase === "briefing";
    let dist: number;
    let pitch: number;
    if (browsing && this.showcase) {
      // The shop: down beside the thief.
      dist = this.portrait ? 6.2 : 4.6;
      pitch = THREE.MathUtils.degToRad(22);
      focus.set(level.start.x, 0, level.start.z);
      out.set(focus.x + Math.sin(0.35) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + 0.55, focus.z + Math.cos(0.35) * Math.cos(pitch) * dist);
      return;
    }
    if (this.overview || browsing) {
      const vFov = THREE.MathUtils.degToRad(this.camera.fov);
      const needH = ((level.grid.h + 2) / (2 * Math.tan(vFov / 2))) * 0.92;
      const needW = (level.grid.w + 2) / (2 * Math.tan(vFov / 2) * aspect);
      dist = Math.max(needH, needW) * (this.phase === "briefing" ? 1.25 : 1.05);
      pitch = THREE.MathUtils.degToRad(64);
      focus.copy(view.center);
      if (this.phase === "briefing" && !this.portrait) focus.x -= dist * Math.tan(vFov / 2) * aspect * 0.38;
      if (this.phase === "briefing" && this.portrait) focus.z += dist * 0.18;
      if (this.phase === "menu") {
        focus.x += Math.sin(this.menuT * 0.12) * 2;
        focus.z += Math.cos(this.menuT * 0.1) * 1.2;
      }
    } else {
      dist = (this.portrait ? 17 : 12.5) * this.zoom;
      pitch = THREE.MathUtils.degToRad(58);
      const t = sim.thief;
      focus.set(t.x + t.vx * 0.25, 0, t.z + t.vz * 0.25 + (this.portrait ? 0.6 : 0.3));
    }
    out.set(focus.x, Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
  }

  private snapCamera() {
    this.cameraGoal(this.camPos, this.focus);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.focus.x, this.showcase ? 0.55 : 0, this.focus.z);
  }

  private updateCamera(dt: number) {
    if (!this.sim) return;
    this.cameraGoal(this.goalPos, this.goalFocus);
    const k = this.overview || this.phase !== "playing" ? 3 : 6;
    this.camPos.x = damp(this.camPos.x, this.goalPos.x, k, dt);
    this.camPos.y = damp(this.camPos.y, this.goalPos.y, k, dt);
    this.camPos.z = damp(this.camPos.z, this.goalPos.z, k, dt);
    this.focus.x = damp(this.focus.x, this.goalFocus.x, k, dt);
    this.focus.z = damp(this.focus.z, this.goalFocus.z, k, dt);
    this.focus.y = damp(this.focus.y, this.showcase && this.phase !== "playing" ? 0.55 : 0, k, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
    this.applyShift();
  }

  // --- HUD -----------------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    if (phase !== "playing") this.reticle.visible = false;
  }

  private emitHud(force = false) {
    const sim = this.sim;
    if (!sim) return;
    const target = sim.stage === "play" && this.phase === "playing" ? sim.useTarget() : null;
    const hud: Hud = {
      level: sim.index,
      gem: sim.hasGem,
      loot: sim.lootTaken,
      lootTotal: sim.lootTotal,
      value: sim.value + (sim.hasGem ? sim.targetValue : 0),
      coins: sim.coinsLeft,
      keys: sim.keysHeld,
      alarm: sim.alarm,
      alarmLeft: sim.alarm ? Math.ceil(ALARM_TIME - sim.alarmQuiet) : 0,
      suspicion: Math.round(sim.suspicion * 20) / 20,
      light: Math.round(sim.level.grid.lightAt(sim.thief.x, sim.thief.z) * 10) / 10,
      stance: sim.stance,
      sneakLock: this.sneakLock,
      prompt: sim.crack > 0 ? "Cracking… hold still" : (target?.label ?? null),
      objective: sim.hasGem ? "Escape through the exit door" : `Steal the ${sim.targetName}`,
      time: Math.floor(sim.time),
      overview: this.overview,
      camerasOff: sim.camerasOff,
      timer: sim.timerLeft < 0 || sim.alarmEver ? -1 : Math.ceil(sim.timerLeft),
      gadget: sim.mods.gadget,
      charges: sim.charges,
      crack: Math.round(sim.crack * 20) / 20,
      cloaked: sim.cloaked,
    };
    const key = JSON.stringify(hud);
    if (!force && key === this.hudCache) return;
    this.hudCache = key;
    this.events.hud(hud);
  }
}

/** Height of the light over the target's pedestal. */
const PEDESTAL_TOP = 1.52;
