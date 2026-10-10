import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, type LoadedModel, type LoadProgress } from "../shared/assets";
import { music } from "../shared/music";
import { FAIRWAY_LOFI } from "../shared/songs";
import { Sfx } from "./audio";
import { HOLES, ISLAND_TOP, WATER_Y } from "./course";
import { Effects } from "./fx";
import { BALLS, MODELS } from "./manifest";
import { BALL_R, BallSim, CUP_R, puttSpeed } from "./physics";
import { buildWorld, makeSky, makeWater, type HoleWorld } from "./world";

// --- Tuning ---------------------------------------------------------------------------------------

export const MAX_STROKES = 10;
const PITCH = 0.52;
const PITCH_MIN = 0.06;
const PITCH_MAX = 1.35;
const ZOOM = 2.5;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 12;
const CLUB_H = 0.78;
/** The putter leans towards the player (who stands left of the line), so it never hides the ball. */
const CLUB_LEAN = 0.42;
const INTRO = { fly: 1.5, hold: 1.3, down: 1.1 };

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dampAngle = (a: number, b: number, k: number, dt: number) => a + wrap(b - a) * (1 - Math.exp(-k * dt));
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// --- Public types ---------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "intro" | "aim" | "rolling" | "holed" | "card" | "done" | "paused" | "error";

export interface Hud {
  hole: number;
  par: number;
  name: string;
  strokes: number;
  scores: (number | null)[];
  power: number;
  dragging: boolean;
  overview: boolean;
  /** Aim keys / drag available right now. */
  canPutt: boolean;
}

export interface Banner {
  id: number;
  title: string;
  sub?: string;
  tone: "intro" | "great" | "good" | "plain" | "bad";
}

export interface HoleResult {
  hole: number;
  strokes: number;
  par: number;
  holeInOne: boolean;
}

export interface RoundResult {
  scores: number[];
  total: number;
  par: number;
  holesInOne: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  banner(b: Banner | null): void;
  holeDone(r: HoleResult): void;
  roundDone(r: RoundResult): void;
  error(message: string): void;
}

interface Pose {
  t: THREE.Vector3;
  yaw: number;
  pitch: number;
  dist: number;
}

interface Drag {
  mode: "putt" | "orbit" | "pinch";
  id: number;
  x: number;
  y: number;
  dist0: number;
  angle0: number;
  zoom0: number;
  yaw0: number;
  pitch0: number;
  midY0: number;
}

/** Name for a score relative to par. */
export function scoreName(strokes: number, par: number) {
  if (strokes === 1) return "Hole in one!";
  const d = strokes - par;
  if (d <= -3) return "Albatross!";
  if (d === -2) return "Eagle!";
  if (d === -1) return "Birdie!";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double bogey";
  if (d === 3) return "Triple bogey";
  return `+${d}`;
}

export class PuttParadiseGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.02, 900);
  private readonly sun = new THREE.DirectionalLight("#fff3dc", 2.5);
  private readonly timer = new THREE.Timer();
  private readonly fx = new Effects();
  private readonly raycaster = new THREE.Raycaster();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private water: THREE.Mesh | null = null;
  private models = new Map<string, LoadedModel>();
  private holes: HoleWorld[] = [];
  private portrait = false;
  private coarse = false;

  // Ball and putter.
  private readonly ball = new THREE.Group();
  private readonly ballSpin = new THREE.Group();
  private readonly skins: THREE.Object3D[] = [];
  private readonly clubPivot = new THREE.Group();
  private readonly clubHands = new THREE.Group();
  private readonly clubSwing = new THREE.Group();
  private readonly clubs: THREE.Object3D[] = [];
  private ballIndex = 0;
  private swing = 0;
  private swingT = -1;
  private swingFrom = 0;
  /** Putter opacity: it shows while you set the power and swing, then steps aside. */
  private clubAlpha = 0;
  private clubMaterials: THREE.Material[] = [];
  private powerTouched = 9;

  // Round state.
  private phase: Phase = "loading";
  private resumeTo: Phase = "aim";
  private current = 0;
  private sim: BallSim | null = null;
  private strokes = 0;
  private scores: (number | null)[] = HOLES.map(() => null);
  private readonly lastRest = new THREE.Vector3();
  private elapsed = 0;
  private bannerId = 0;

  // Aiming.
  private aimYaw = 0;
  private power = 0.3;
  private launch = { t: -1, speed: 0, dx: 0, dz: 0 };

  // Camera.
  private camYaw = 0;
  private camPitch = PITCH;
  private zoom = ZOOM;
  private overview = false;
  private readonly camT = new THREE.Vector3(14, 0, -19);
  private readonly cam = { yaw: 0.5, pitch: 0.6, dist: 40 };
  private orbitIdle = 9;
  private introT = 0;
  private introFrom: Pose | null = null;
  private quickIntro = false;

  // Timers.
  private holedT = 0;
  private holedFrom = new THREE.Vector3();
  private offT = 0;
  private offLanded: "" | "grass" | "water" = "";
  private offLandT = 0;
  private flagLift = 0;
  private wiggle = 0;
  private boostT = 0;
  private sailQuarter = -1;
  private nearCupSpeed = 0;

  // Input.
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private drag: Drag | null = null;

  private hud: Hud = { hole: 0, par: 2, name: "", strokes: 0, scores: [], power: 0.3, dragging: false, overview: false, canPutt: false };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.coarse ? 1.75 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.setupScene();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.timer.connect(document);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------

  private setupScene() {
    const { scene } = this;
    scene.background = new THREE.Color("#cdeffa");
    scene.fog = new THREE.Fog("#cdeffa", 45, 190);
    this.camera.add(makeSky());
    scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.5;

    scene.add(new THREE.HemisphereLight("#e6f6ff", "#7fb59a", 1.15));
    const { sun } = this;
    sun.castShadow = true;
    const size = this.coarse ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    this.ball.add(this.ballSpin);
    // Pivot (at the ball, +x along the putt) → hands (up and to the left, leaning) → swing → putter.
    this.clubHands.position.set(-(BALL_R + 0.04), CLUB_H, -CLUB_H * Math.tan(CLUB_LEAN));
    this.clubHands.rotation.x = -CLUB_LEAN;
    this.clubPivot.add(this.clubHands);
    this.clubHands.add(this.clubSwing);
    scene.add(this.ball, this.clubPivot, this.fx.root);
    this.ball.visible = false;
    this.clubPivot.visible = false;
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const required = [...BALLS.map((b) => b.key), ...new Set(HOLES.flatMap((h) => h.pieces.map((p) => p.key)))];
      if (!required.every((k) => models.has(k))) throw new Error("Some course models could not be loaded. Check your connection and reload.");
      this.models = models;

      const { holes } = buildWorld(models, this.scene);
      this.holes = holes;
      this.water = makeWater(holes);
      this.scene.add(this.water);

      for (const b of BALLS) {
        const skin = models.get(b.key)!.scene.clone();
        skin.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        skin.visible = false;
        this.ballSpin.add(skin);
        this.skins.push(skin);
        const clubModel = models.get(b.club);
        const club = new THREE.Group();
        if (clubModel) {
          const c = clubModel.scene.clone();
          c.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = true;
            const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
              const copy = m.clone();
              copy.transparent = true;
              this.clubMaterials.push(copy);
              return copy;
            });
            mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
          });
          // Hang the putter from the hands: head just behind the ball, sole on the carpet.
          c.position.set(0, -CLUB_H / Math.cos(CLUB_LEAN) + 0.769 + 0.01, 0.012);
          club.add(c);
        }
        club.visible = false;
        this.clubSwing.add(club);
        this.clubs.push(club);
      }
      this.selectBall(this.ballIndex);
      this.toMenu();
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  // --- Public API -------------------------------------------------------------------------------

  selectBall(index: number) {
    this.ballIndex = ((index % BALLS.length) + BALLS.length) % BALLS.length;
    this.skins.forEach((s, i) => (s.visible = i === this.ballIndex));
    this.clubs.forEach((c, i) => (c.visible = i === this.ballIndex));
  }

  toMenu() {
    this.setPhase("menu");
    this.current = 0;
    this.placeOnTee(0);
    this.ball.visible = true;
    this.overview = false;
    this.fx.clearTrail();
    this.sfx.rolling(0);
    music.play(FAIRWAY_LOFI, 0);
    music.duck(false);
    this.emitHud(true);
  }

  startRound() {
    audio.unlock();
    this.scores = HOLES.map(() => null);
    music.play(FAIRWAY_LOFI, 1);
    music.duck(false);
    this.beginHole(0);
  }

  /** Called from the scorecard. */
  nextHole() {
    if (this.phase !== "card") return;
    if (this.current + 1 < HOLES.length) this.beginHole(this.current + 1);
    else this.finishRound();
  }

  replayHole() {
    if (!["aim", "rolling", "paused", "intro"].includes(this.phase)) return;
    music.duck(false);
    this.scores[this.current] = null;
    this.beginHole(this.current, true);
  }

  pause() {
    if (!["aim", "rolling", "intro", "holed"].includes(this.phase)) return;
    this.resumeTo = this.phase;
    this.drag = null;
    this.pointers.clear();
    this.keys.clear();
    this.sfx.quiet();
    music.duck(true);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase(this.resumeTo);
  }

  get isPaused() {
    return this.phase === "paused";
  }

  toggleOverview() {
    if (!["aim", "rolling", "holed"].includes(this.phase)) return;
    this.overview = !this.overview;
    this.sfx.tick(this.overview);
    this.emitHud(true);
  }

  /** Game keys (A/D aim, W/S power, Q/E orbit, Space putt). */
  keyDown(key: string) {
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (k === " ") {
      if (this.phase === "intro") this.skipIntro();
      else if (this.phase === "aim") {
        if (this.overview) this.overview = false;
        this.putt();
      }
      return;
    }
    this.keys.add(k);
    if (this.phase === "intro" && k !== "Shift") this.skipIntro();
  }

  keyUp(key: string) {
    this.keys.delete(key.length === 1 ? key.toLowerCase() : key);
  }

  clearKeys() {
    this.keys.clear();
  }

  skipIntro() {
    if (this.phase !== "intro") return;
    this.introT = INTRO.fly + INTRO.hold + INTRO.down;
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
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    this.fx.dispose();
    for (const m of this.models.values()) disposeTree(m.scene);
    this.envTexture?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m?.dispose());
    });
    this.renderer.dispose();
  }

  // --- Round flow -------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    this.emitHud(true);
  }

  private banner(title: string, sub: string | undefined, tone: Banner["tone"]) {
    this.events.banner({ id: ++this.bannerId, title, sub, tone });
  }

  private get hole() {
    return this.holes[this.current];
  }

  private placeOnTee(index: number) {
    const h = this.holes[index];
    if (!h) return;
    this.current = index;
    this.sim = new BallSim(h.mesh, h.def.cup, h.rotors);
    this.sim.time = this.elapsed;
    const t = h.def.tee;
    this.sim.place(t.x, t.y + BALL_R, t.z);
    this.lastRest.set(t.x, t.y + BALL_R, t.z);
    this.aimYaw = this.camYaw = (h.def.heading * Math.PI) / 2;
    this.syncBall();
  }

  private beginHole(index: number, quick = false) {
    this.placeOnTee(index);
    this.strokes = 0;
    this.camPitch = PITCH;
    this.zoom = this.portrait ? ZOOM * 1.25 : ZOOM;
    this.power = Math.min(this.power, 0.6);
    this.overview = false;
    this.flagLift = 0;
    this.wiggle = 0;
    this.ball.visible = true;
    this.ball.scale.setScalar(1);
    this.fx.clearTrail();
    this.launch.t = -1;
    this.swingT = -1;
    this.introT = 0;
    this.quickIntro = quick;
    this.introFrom = this.currentPose();
    const def = this.hole.def;
    if (!quick) {
      this.banner(`Hole ${index + 1}`, `Par ${def.par} · ${def.name}`, "intro");
      this.sfx.whoosh();
    }
    music.setIntensity(index === HOLES.length - 1 ? 2 : 1);
    this.setPhase("intro");
  }

  private finishRound() {
    const scores = this.scores.map((s) => s ?? MAX_STROKES);
    const result: RoundResult = {
      scores,
      total: scores.reduce((a, b) => a + b, 0),
      par: HOLES.reduce((a, h) => a + h.par, 0),
      holesInOne: scores.filter((s) => s === 1).length,
    };
    music.setIntensity(0);
    this.setPhase("done");
    this.events.roundDone(result);
  }

  /** Default aim: along the course centre line, a little ahead of the ball. */
  private defaultAim() {
    const h = this.hole;
    const s = this.sim!;
    const pts = [...h.def.path, h.def.cup];
    let best = Infinity;
    let seg = 0;
    let segT = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((s.px - a.x) * dx + (s.pz - a.z) * dz) / l2));
      const d = Math.hypot(s.px - (a.x + dx * t), s.pz - (a.z + dz * t));
      if (d < best) {
        best = d;
        seg = i;
        segT = t;
      }
    }
    // Walk 1.4 m along the path from the closest point.
    let left = 1.4;
    let ax = pts[seg].x + (pts[seg + 1].x - pts[seg].x) * segT;
    let az = pts[seg].z + (pts[seg + 1].z - pts[seg].z) * segT;
    for (let i = seg; i < pts.length - 1 && left > 0; i++) {
      const bx = pts[i + 1].x;
      const bz = pts[i + 1].z;
      const l = Math.hypot(bx - ax, bz - az);
      if (l >= left) {
        ax += ((bx - ax) * left) / l;
        az += ((bz - az) * left) / l;
        left = 0;
      } else {
        left -= l;
        ax = bx;
        az = bz;
      }
    }
    const dx = ax - s.px;
    const dz = az - s.pz;
    if (Math.hypot(dx, dz) > 0.05) this.aimYaw = Math.atan2(-dx, -dz);
  }

  private enterAim() {
    this.setPhase("aim");
    this.defaultAim();
    this.camYaw = this.aimYaw;
    this.orbitIdle = 9;
    this.emitHud(true);
  }

  private putt() {
    if (this.phase !== "aim" || this.power < 0.02 || !this.sim) return;
    audio.unlock();
    this.strokes++;
    this.lastRest.set(this.sim.px, this.sim.py, this.sim.pz);
    const p = this.power;
    this.launch = { t: 0.11, speed: puttSpeed(p), dx: -Math.sin(this.aimYaw), dz: -Math.cos(this.aimYaw) };
    this.swingFrom = this.swing;
    this.swingT = 0;
    this.drag = null;
    this.fx.hideAim();
    this.fx.hideMarker();
    this.fx.clearTrail();
    this.offT = 0;
    this.offLanded = "";
    this.setPhase("rolling");
  }

  private holed() {
    const s = this.sim!;
    this.setPhase("holed");
    this.holedT = 0;
    this.holedFrom.set(s.px, s.py, s.pz);
    this.sfx.rolling(0);
    this.sfx.cup();
    const par = this.hole.def.par;
    const strokes = this.strokes;
    const hio = strokes === 1;
    const diff = strokes - par;
    this.scores[this.current] = strokes;
    const name = scoreName(strokes, par);
    const tone: Banner["tone"] = hio || diff <= -1 ? "great" : diff === 0 ? "good" : "plain";
    const sub = hio ? "Incredible shot!" : `${strokes} stroke${strokes === 1 ? "" : "s"} · par ${par}`;
    this.banner(name, sub, tone);
    window.setTimeout(() => !this.disposed && this.sfx.result(diff, hio), 380);
    const cup = this.hole.origin.clone().add(new THREE.Vector3(this.hole.def.cup.x, this.hole.def.cup.y, this.hole.def.cup.z));
    if (hio || diff <= -1) {
      this.fx.confettiBurst(cup, hio ? 220 : diff <= -2 ? 170 : 110, hio ? 1.3 : 1);
      this.wiggle = 1;
      music.setIntensity(2);
      this.boostT = 4;
    } else if (diff === 0) {
      this.fx.confettiBurst(cup, 36, 0.6);
      this.wiggle = 0.6;
    } else this.wiggle = 0.3;
    this.emitHud(true);
  }

  /** Out of strokes: the hole ends with the maximum. */
  private pickUp() {
    this.scores[this.current] = MAX_STROKES;
    this.setPhase("holed");
    this.holedT = 0.6;
    this.ball.visible = false;
    this.banner("Picked up", `${MAX_STROKES} strokes is the limit`, "bad");
    this.sfx.result(3, false);
  }

  private outOfBounds() {
    this.strokes++;
    this.sfx.penalty();
    if (this.strokes >= MAX_STROKES) {
      this.pickUp();
      return;
    }
    this.banner(this.offLanded === "water" ? "Splash!" : "Out of bounds", "+1 stroke · ball returned", "bad");
    this.sim!.place(this.lastRest.x, this.lastRest.y, this.lastRest.z);
    this.ball.visible = true;
    this.ball.scale.setScalar(1);
    this.syncBall();
    this.enterAim();
  }

  // --- Frame ------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const paused = this.phase === "paused";

    if (!paused && this.phase !== "loading" && this.phase !== "error") {
      this.elapsed += dt;
      this.orbitIdle += dt;
      if (this.phase === "intro") this.updateIntro(dt);
      else if (this.phase === "aim") this.updateAim(dt);
      else if (this.phase === "rolling") this.updateRolling(dt);
      else if (this.phase === "holed") this.updateHoled(dt);
      if (this.sim && this.phase !== "rolling") this.sim.advance(dt);
      this.animateWorld(dt);
      this.updateClub(dt);
      this.fx.update(dt, this.camera);
      if (this.boostT > 0) {
        this.boostT -= dt;
        if (this.boostT <= 0 && this.phase !== "done" && this.current !== HOLES.length - 1) music.setIntensity(1);
      }
    }
    if (this.phase !== "loading" && this.phase !== "error") {
      this.updateCamera(paused ? 0 : dt);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private updateIntro(dt: number) {
    this.introT += dt;
    const total = this.quickIntro ? 0.9 : INTRO.fly + INTRO.hold + INTRO.down;
    if (this.introT >= total) {
      this.introFrom = null;
      this.enterAim();
      return;
    }
    this.updateAimVisuals(false);
    void dt;
  }

  private updateAim(dt: number) {
    const k = this.keys;
    const fine = k.has("Shift") ? 0.3 : 1;
    let turn = 0;
    if (k.has("a") || k.has("ArrowLeft")) turn += 1;
    if (k.has("d") || k.has("ArrowRight")) turn -= 1;
    if (turn) {
      const d = turn * 1.2 * fine * dt;
      this.aimYaw += d;
      this.camYaw += d;
      this.orbitIdle = 0;
    }
    let pw = 0;
    if (k.has("w") || k.has("ArrowUp")) pw += 1;
    if (k.has("s") || k.has("ArrowDown")) pw -= 1;
    if (pw || turn) this.powerTouched = 0;
    if (pw) {
      const before = Math.round(this.power * 20);
      this.power = Math.min(1, Math.max(0.02, this.power + pw * 0.55 * fine * dt));
      if (Math.round(this.power * 20) !== before) this.sfx.tick(pw > 0);
    }
    let orbit = 0;
    if (k.has("q")) orbit += 1;
    if (k.has("e")) orbit -= 1;
    if (orbit) {
      this.camYaw += orbit * 1.6 * dt;
      this.orbitIdle = 0;
    }
    this.updateAimVisuals(true);
    this.emitHud();
  }

  private readonly tmpV = new THREE.Vector3();

  private updateAimVisuals(show: boolean) {
    const s = this.sim;
    if (!s) return;
    const w = this.ballWorld(this.tmpV);
    if (show && !this.overview) {
      const dx = -Math.sin(this.aimYaw);
      const dz = -Math.cos(this.aimYaw);
      this.fx.showAim(w, dx, dz, this.power, this.elapsed, (x, z, y) => this.surfaceY(x, z, y));
    } else this.fx.hideAim();
    this.fx.showMarker(w, w.y - BALL_R, this.elapsed, !!this.drag && this.drag.mode === "putt");
  }

  /** Height of the course surface under a world point near height y (for the aim dots). */
  private surfaceY(x: number, z: number, y: number) {
    const h = this.hole;
    const lx = x - h.origin.x;
    const lz = z - h.origin.z;
    const m = h.mesh;
    let best = -Infinity;
    const top = y + 0.3;
    for (let yy = top; yy > y - 0.8; yy -= 0.25) {
      const list = m.near(lx, yy, lz);
      if (!list) continue;
      for (const t of list) {
        const o = t * 9;
        const P = m.pos;
        const ax = P[o];
        const az = P[o + 2];
        const bx = P[o + 3];
        const bz = P[o + 5];
        const cx = P[o + 6];
        const cz = P[o + 8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-9) continue;
        const l1 = ((bz - cz) * (lx - cx) + (cx - bx) * (lz - cz)) / d;
        const l2 = ((cz - az) * (lx - cx) + (ax - cx) * (lz - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const hy = l1 * P[o + 1] + l2 * P[o + 4] + l3 * P[o + 7];
        if (hy < top && hy > best) best = hy;
      }
      if (best > -Infinity) break;
    }
    return best > -Infinity ? best : y - BALL_R;
  }

  private updateRolling(dt: number) {
    const s = this.sim!;
    if (this.launch.t >= 0) {
      // The putter is still swinging down: the ball leaves when it's struck.
      this.launch.t -= dt;
      if (this.launch.t >= 0) {
        s.advance(dt);
        return;
      }
      s.putt(this.launch.dx, this.launch.dz, this.launch.speed);
      this.sfx.putt(this.power);
    }
    const beforeTravel = s.travelled;
    s.advance(dt);
    for (const hit of s.hits) this.sfx.hit(hit.kind, hit.speed);
    s.hits.length = 0;

    const speed = s.speed;
    this.sfx.rolling(s.grounded && s.state === "rolling" ? Math.min(1, speed / 3.5) * 0.85 + (speed > 0.05 ? 0.15 : 0) : 0);
    this.spinBall(s.travelled - beforeTravel);
    this.syncBall();
    if (s.state === "rolling" && speed > 0.05) this.fx.pushTrail(this.ball.position);

    // The cup: rattling over it at speed.
    const cdist = Math.hypot(s.px - s.cup.x, s.pz - s.cup.z);
    if (cdist < CUP_R + BALL_R && speed > 1.2 && this.nearCupSpeed === 0) {
      this.nearCupSpeed = speed;
      this.sfx.lip();
    } else if (cdist > CUP_R + BALL_R + 0.05) this.nearCupSpeed = 0;

    // Camera follows the ball's heading when nobody is steering it.
    const hs = Math.hypot(s.vx, s.vz);
    if (hs > 0.6 && this.orbitIdle > 1.2 && !this.overview && s.grounded && !s.onTrack && Math.abs(s.vy) < hs * 0.5) {
      this.camYaw = dampAngle(this.camYaw, Math.atan2(-s.vx, -s.vz), 0.9 * Math.min(1, hs / 2.5), dt);
    }

    if (this.offLanded) {
      // Waiting for the splash / thud to play out (tickOffTimers).
    } else if (s.state === "holed") {
      this.holed();
    } else if (s.state === "rest") {
      this.sfx.rolling(0);
      if (this.strokes >= MAX_STROKES) this.pickUp();
      else this.enterAim();
    } else if (s.state === "off") {
      this.updateOff(dt);
    } else if (this.launch.t < 0 && s.rollTime > 0) {
      this.emitHud();
    }
  }

  private overIsland(lx: number, lz: number, grow = 0) {
    return this.hole.islands.some((is) => ((lx - is.x) / (is.rx + grow)) ** 2 + ((lz - is.z) / (is.rz + grow)) ** 2 < 1);
  }

  private updateOff(dt: number) {
    const s = this.sim!;
    this.offT += dt;
    if (!this.offLanded && this.offT > 4) this.offLanded = "grass";
    if (!this.offLanded) {
      if (s.py <= ISLAND_TOP + BALL_R && this.overIsland(s.px, s.pz, -0.3)) {
        s.py = ISLAND_TOP + BALL_R;
        this.offLanded = "grass";
        this.sfx.thud();
      } else if (s.py <= ISLAND_TOP - 0.16 + BALL_R && this.overIsland(s.px, s.pz, 1)) {
        s.py = ISLAND_TOP - 0.16 + BALL_R;
        this.offLanded = "grass";
        this.sfx.thud();
      } else if (s.py <= WATER_Y + BALL_R * 0.2) {
        this.offLanded = "water";
        this.sfx.splash();
        this.fx.splash(this.ball.position, WATER_Y);
      }
      if (this.offLanded) {
        s.vx = s.vy = s.vz = 0;
        s.state = "rest";
        this.offLandT = 0;
        this.sfx.rolling(0);
        if (this.offLanded === "water") this.ball.visible = false;
        this.syncBall();
      }
    }
  }

  private updateHoled(dt: number) {
    const before = this.holedT;
    this.holedT += dt;
    const s = this.sim!;
    const cup = this.hole.def.cup;
    if (this.ball.visible && this.scores[this.current] !== MAX_STROKES) {
      // Drop into the cup.
      const k = ease(Math.min(1, this.holedT / 0.35));
      s.px = THREE.MathUtils.lerp(this.holedFrom.x, cup.x, k);
      s.pz = THREE.MathUtils.lerp(this.holedFrom.z, cup.z, k);
      s.py = THREE.MathUtils.lerp(this.holedFrom.y, cup.y - 0.09, k);
      this.syncBall();
      if (this.holedT > 0.4) this.ball.visible = false;
    }
    if (before < 2.6 && this.holedT >= 2.6) {
      this.setPhase("card");
      this.events.holeDone({ hole: this.current, strokes: this.scores[this.current] ?? MAX_STROKES, par: this.hole.def.par, holeInOne: this.scores[this.current] === 1 });
    }
  }

  /** Off the course: wait for the landing to play out, then return the ball. */
  private tickOffTimers(dt: number) {
    if (this.phase !== "rolling" || !this.sim || this.sim.state !== "rest" || !this.offLanded) return;
    this.offLandT += dt;
    if (this.offLandT > 1.0) {
      this.outOfBounds();
      this.offLanded = "";
    }
  }

  private animateWorld(dt: number) {
    // Sails: the current hole's rotors are driven by the simulation; the others just turn.
    for (const h of this.holes) {
      h.rotors.forEach((r, i) => {
        if (h !== this.hole || !this.sim) r.angle = r.omega * this.elapsed;
        h.blades[i].rotation.z = r.angle;
      });
    }
    // A soft whoosh each time a sail sweeps past the door of a windmill nearby.
    const near = this.hole;
    if (near?.rotors.length && this.camera.position.distanceTo(near.origin) < 14 && this.phase !== "menu") {
      const quarter = Math.floor(near.rotors[0].angle / (Math.PI / 2));
      if (quarter !== this.sailQuarter) {
        if (this.sailQuarter !== -1) this.sfx.sail(Math.max(0.2, 1 - this.camera.position.distanceTo(near.group.position) / 14));
        this.sailQuarter = quarter;
      }
    }
    this.sfx.waves(this.elapsed);
    if (this.water) (this.water.material as THREE.ShaderMaterial).uniforms.time.value = this.elapsed;

    // Flags: lifted out as the ball comes close, wiggling after a good score.
    const h = this.hole;
    if (h && this.sim) {
      const d = Math.hypot(this.sim.px - h.def.cup.x, this.sim.pz - h.def.cup.z);
      const lift = (this.phase === "rolling" && d < 0.9) || this.phase === "holed" || this.phase === "card" ? 0.42 : 0;
      this.flagLift = damp(this.flagLift, lift, 6, dt);
      this.wiggle = Math.max(0, this.wiggle - dt * 0.35);
      h.flag.position.y = h.def.cup.y - 0.03 + this.flagLift + (this.phase === "holed" ? Math.abs(Math.sin(this.holedT * 7)) * 0.12 * this.wiggle : 0);
      h.flag.rotation.z = Math.sin(this.elapsed * 13) * 0.3 * this.wiggle;
      h.flag.rotation.x = Math.sin(this.elapsed * 9) * 0.15 * this.wiggle;
    }
    this.tickOffTimers(dt);
  }

  // --- Ball & putter ----------------------------------------------------------------------------

  private ballWorld(out: THREE.Vector3) {
    const s = this.sim!;
    return out.set(s.px, s.py, s.pz).add(this.hole.origin);
  }

  private syncBall() {
    if (!this.sim || !this.hole) return;
    this.ballWorld(this.ball.position);
  }

  private readonly spinAxis = new THREE.Vector3();
  private readonly spinQ = new THREE.Quaternion();

  private spinBall(dist: number) {
    const s = this.sim!;
    const hs = Math.hypot(s.vx, s.vz);
    if (hs < 1e-4 || dist <= 0) return;
    this.spinAxis.set(-s.vz / hs, 0, s.vx / hs);
    this.spinQ.setFromAxisAngle(this.spinAxis, dist / BALL_R);
    this.ballSpin.quaternion.premultiply(this.spinQ);
  }

  private updateClub(dt: number) {
    this.powerTouched += dt;
    const setting = this.phase === "aim" && (this.drag?.mode === "putt" || this.powerTouched < 1.6);
    const show = setting || (this.phase === "rolling" && this.swingT >= 0 && this.swingT < 0.75);
    this.clubAlpha = damp(this.clubAlpha, show ? 1 : 0, show ? 14 : 6, dt);
    if (this.phase === "rolling" && this.swingT >= 0.75) this.clubAlpha = Math.max(0, this.clubAlpha - dt * 4);
    this.clubPivot.visible = this.clubAlpha > 0.02 && !!this.sim;
    for (const m of this.clubMaterials) {
      m.opacity = this.clubAlpha;
      m.depthWrite = this.clubAlpha > 0.95;
    }
    if (!this.clubPivot.visible) return;
    const b = this.ballWorld(this.tmpV);
    // Local +x of the pivot points along the putt.
    const dx = this.phase === "rolling" ? this.launch.dx : -Math.sin(this.aimYaw);
    const dz = this.phase === "rolling" ? this.launch.dz : -Math.cos(this.aimYaw);
    this.clubPivot.position.set(b.x, b.y - BALL_R, b.z);
    this.clubPivot.rotation.set(0, Math.atan2(-dz, dx), 0);
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = this.swingT;
      // Down through the ball in 0.11 s, follow through, then hold.
      this.swing = t < 0.11 ? THREE.MathUtils.lerp(this.swingFrom, 0, ease(t / 0.11)) : THREE.MathUtils.lerp(0, 0.32, ease(Math.min(1, (t - 0.11) / 0.18)));
    } else {
      const target = this.phase === "aim" ? -0.06 - this.power * 0.5 : this.phase === "menu" ? -0.05 + Math.sin(this.elapsed * 1.3) * 0.04 : -0.06;
      this.swing = damp(this.swing, target, 14, dt);
    }
    this.clubSwing.rotation.z = this.swing;
  }

  // --- Camera -----------------------------------------------------------------------------------

  private currentPose(): Pose {
    return { t: this.camT.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist };
  }

  private aimPose(): Pose {
    const b = this.sim ? this.ballWorld(new THREE.Vector3()) : this.camT.clone();
    b.y += 0.03;
    // Look a little past the ball while aiming, so more of the hole is in view.
    if (this.phase === "aim" || this.phase === "intro") {
      const ahead = Math.min(0.9, this.zoom * 0.22);
      b.x -= Math.sin(this.camYaw) * ahead;
      b.z -= Math.cos(this.camYaw) * ahead;
    }
    return { t: b, yaw: this.camYaw, pitch: this.camPitch, dist: this.zoom };
  }

  /** The whole hole in view, from above. */
  private overviewPose(): Pose {
    const h = this.hole;
    const b = h.bounds;
    const center = b.getCenter(new THREE.Vector3()).add(h.origin);
    center.y = h.origin.y + 0.1;
    const heading = (h.def.heading * Math.PI) / 2;
    const landscape = this.camera.aspect > 1.15;
    const size = b.getSize(new THREE.Vector3());
    const yaw = landscape && size.z > size.x * 1.2 ? heading + Math.PI / 2 : heading;
    const pitch = 0.98;
    // Fit the bounds: grow the distance until every corner is on screen.
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, 0.1, 500);
    const corners: THREE.Vector3[] = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(x, y, z).add(h.origin));
    let dist = 3;
    for (; dist < 60; dist *= 1.08) {
      cam.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      if (corners.every((c) => {
        const p = c.clone().project(cam);
        return Math.abs(p.x) < 0.86 && Math.abs(p.y) < 0.8;
      }))
        break;
    }
    return { t: center, yaw, pitch, dist };
  }

  private menuPose(): Pose {
    const b = this.sim ? this.ballWorld(new THREE.Vector3()) : new THREE.Vector3();
    const heading = this.holes[0] ? (this.holes[0].def.heading * Math.PI) / 2 : 0;
    b.y += 0.04;
    const yaw = heading + 0.42 + Math.sin(this.elapsed * 0.16) * 0.3;
    return { t: b, yaw, pitch: 0.24, dist: this.portrait ? 1.9 : 1.35 };
  }

  private updateCamera(dt: number) {
    let pose: Pose;
    let k = 7;
    const ph = this.phase === "paused" ? this.resumeTo : this.phase;
    if (ph === "menu") {
      pose = this.menuPose();
      k = 3;
    } else if (ph === "intro" && this.introFrom) {
      const t = this.introT;
      const a = this.introFrom;
      const aim = this.aimPose();
      if (this.quickIntro) pose = lerpPose(a, aim, ease(t / 0.9));
      else {
        const ov = this.overviewPose();
        ov.yaw += Math.max(0, t - INTRO.fly) * 0.06;
        if (t < INTRO.fly) pose = lerpPose(a, ov, ease(t / INTRO.fly), true);
        else if (t < INTRO.fly + INTRO.hold) pose = ov;
        else pose = lerpPose(ov, aim, ease((t - INTRO.fly - INTRO.hold) / INTRO.down));
      }
      k = 0;
    } else if (ph === "done" || ph === "card") {
      pose = this.overviewPose();
      pose.yaw += this.elapsed * 0.05;
      k = 2;
    } else if (this.overview) {
      pose = this.overviewPose();
      pose.yaw = this.camYaw + (pose.yaw - (this.hole.def.heading * Math.PI) / 2);
      k = 5;
    } else {
      pose = this.aimPose();
      if (ph === "rolling" && this.sim) pose.dist = this.zoom + Math.min(1.6, this.sim.speed * 0.28);
      if (ph === "holed") pose.dist = this.zoom * 0.85;
    }

    if (k === 0) {
      this.camT.copy(pose.t);
      this.cam.yaw = pose.yaw;
      this.cam.pitch = pose.pitch;
      this.cam.dist = pose.dist;
    } else if (dt > 0) {
      const kt = ph === "rolling" ? 9 : k;
      this.camT.lerp(pose.t, 1 - Math.exp(-kt * dt));
      this.cam.yaw = dampAngle(this.cam.yaw, pose.yaw, k, dt);
      this.cam.pitch = damp(this.cam.pitch, pose.pitch, k, dt);
      this.cam.dist = damp(this.cam.dist, pose.dist, k * 0.8, dt);
    }
    const { yaw, pitch, dist } = this.cam;
    const p = this.camera.position.set(
      this.camT.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      this.camT.y + Math.sin(pitch) * dist,
      this.camT.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    p.y = Math.max(p.y, WATER_Y + 0.3, this.camT.y + 0.05);
    this.camera.lookAt(this.camT);

    // The sun's shadow box follows what we look at.
    const half = THREE.MathUtils.clamp(dist * 0.9, 4, 24);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - half) > 0.5) {
      Object.assign(sc, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 80 });
      sc.updateProjectionMatrix();
    }
    this.sun.target.position.copy(this.camT);
    this.sun.position.copy(this.camT).add(new THREE.Vector3(14, 26, 11));
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.fov = this.portrait ? 62 : 50;
    this.camera.updateProjectionMatrix();
    this.fx.setTrailScale((h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
  }

  // --- Input ------------------------------------------------------------------------------------

  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane();
  private readonly hit = new THREE.Vector3();

  private ballScreen() {
    const r = this.canvas.getBoundingClientRect();
    const p = this.ballWorld(new THREE.Vector3()).project(this.camera);
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height, w: r.width, h: r.height, behind: p.z > 1 };
  }

  private onPointerDown = (e: PointerEvent) => {
    audio.unlock();
    if (this.phase === "intro") {
      this.skipIntro();
      return;
    }
    if (!["aim", "rolling", "holed", "card", "done"].includes(this.phase)) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = {
        mode: "pinch",
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dist0: Math.hypot(a.x - b.x, a.y - b.y),
        angle0: Math.atan2(b.y - a.y, b.x - a.x),
        zoom0: this.zoom,
        yaw0: this.camYaw,
        pitch0: this.camPitch,
        midY0: (a.y + b.y) / 2,
      };
      this.fx.hideAim();
      return;
    }
    let mode: Drag["mode"] = "orbit";
    if (this.phase === "aim" && !this.overview) {
      const s = this.ballScreen();
      const reach = Math.max(this.coarse ? 70 : 56, Math.min(s.w, s.h) * 0.07);
      if (!s.behind && Math.hypot(e.clientX - s.x, e.clientY - s.y) < reach) mode = "putt";
    }
    this.drag = { mode, id: e.pointerId, x: e.clientX, y: e.clientY, dist0: 0, angle0: 0, zoom0: this.zoom, yaw0: this.camYaw, pitch0: this.camPitch, midY0: 0 };
    if (mode === "putt") {
      this.power = 0;
      this.emitHud(true);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const d = this.drag;
    if (!d) return;
    if (d.mode === "pinch") {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      this.zoom = THREE.MathUtils.clamp((d.zoom0 * d.dist0) / Math.max(10, dist), ZOOM_MIN, ZOOM_MAX);
      this.camYaw = d.yaw0 + wrap(angle - d.angle0);
      this.camPitch = THREE.MathUtils.clamp(d.pitch0 + ((a.y + b.y) / 2 - d.midY0) * 0.005, PITCH_MIN, PITCH_MAX);
      this.orbitIdle = 0;
    } else if (d.mode === "orbit" && e.pointerId === d.id) {
      this.camYaw -= dx * 0.0075;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.005, PITCH_MIN, PITCH_MAX);
      this.orbitIdle = 0;
    } else if (d.mode === "putt" && e.pointerId === d.id && this.phase === "aim") {
      this.aimFromPointer(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!d) return;
    if (d.mode === "putt" && e.pointerId === d.id) {
      this.drag = null;
      if (this.phase === "aim" && this.power >= 0.03) this.putt();
      else {
        this.power = Math.max(this.power, 0.3);
        this.emitHud(true);
      }
    } else if (d.mode === "pinch" && this.pointers.size < 2) this.drag = null;
    else if (e.pointerId === d.id) this.drag = null;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.phase === "menu" || this.phase === "loading") return;
    this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(e.deltaY * 0.0012), ZOOM_MIN, ZOOM_MAX);
  };

  /** Slingshot: the ball flies away from the pointer; the pull length sets the power. */
  private aimFromPointer(x: number, y: number) {
    const s = this.ballScreen();
    const pull = Math.hypot(x - s.x, y - s.y);
    this.power = THREE.MathUtils.clamp((pull - 12) / Math.max(190, Math.min(s.w, s.h) * 0.4), 0, 1);
    if (pull < 12) {
      this.emitHud();
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const b = this.ballWorld(new THREE.Vector3());
    this.plane.set(new THREE.Vector3(0, 1, 0), -b.y);
    let dx: number;
    let dz: number;
    const got = this.raycaster.ray.intersectPlane(this.plane, this.hit);
    if (got && this.hit.distanceTo(b) < 60) {
      dx = b.x - this.hit.x;
      dz = b.z - this.hit.z;
    } else {
      // Pointer above the horizon: map the screen pull through the camera's yaw.
      const sx = x - s.x;
      const sy = y - s.y;
      const fx = -Math.sin(this.cam.yaw);
      const fz = -Math.cos(this.cam.yaw);
      dx = fx * sy - Math.cos(this.cam.yaw) * sx;
      dz = fz * sy + Math.sin(this.cam.yaw) * sx;
    }
    if (Math.hypot(dx, dz) > 1e-4) this.aimYaw = Math.atan2(-dx, -dz);
    this.emitHud();
  }

  // --- HUD --------------------------------------------------------------------------------------

  private emitHud(force = false) {
    const h = this.holes[this.current];
    const next: Hud = {
      hole: this.current,
      par: h?.def.par ?? 0,
      name: h?.def.name ?? "",
      strokes: this.strokes,
      scores: this.scores,
      power: Math.round(this.power * 100) / 100,
      dragging: this.drag?.mode === "putt",
      overview: this.overview,
      canPutt: this.phase === "aim",
    };
    const o = this.hud;
    if (
      !force &&
      o.hole === next.hole &&
      o.strokes === next.strokes &&
      o.power === next.power &&
      o.dragging === next.dragging &&
      o.overview === next.overview &&
      o.canPutt === next.canPutt
    )
      return;
    this.hud = next;
    this.events.hud({ ...next, scores: [...next.scores] });
  }
}

function lerpPose(a: Pose, b: Pose, k: number, arc = false): Pose {
  const t = a.t.clone().lerp(b.t, k);
  const dist = THREE.MathUtils.lerp(a.dist, b.dist, k) + (arc ? Math.sin(k * Math.PI) * Math.min(14, a.t.distanceTo(b.t) * 0.35) : 0);
  return { t, yaw: a.yaw + wrap(b.yaw - a.yaw) * k, pitch: THREE.MathUtils.lerp(a.pitch, b.pitch, k), dist };
}

