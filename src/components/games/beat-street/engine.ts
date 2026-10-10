import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { audio } from "../shared/audio";
import { loadModels, type LoadProgress } from "../shared/assets";
import { music, type SongTiming } from "../shared/music";
import { buildChart, type Chart, type Difficulty } from "./chart";
import { HIGHWAY_LEN, Highway, LANE_W, laneX, type PlayNote } from "./highway";
import { CLIPS, DANCERS, M, MODELS, clipKey } from "./manifest";
import { Sfx } from "./sfx";
import { sectionAt, TRACKS, type Track } from "./songs";
import { Club, STAGE_Z, type Mood, type Pulse } from "./stage";

// --- Tuning -------------------------------------------------------------------------------------------

/** Hit windows (seconds either side of the note). */
export const WINDOWS = { perfect: 0.045, great: 0.09, good: 0.135 };
/** A hold released this close to its end still counts as complete. */
const HOLD_GRACE = 0.16;
/** Seconds a note is on the highway before it reaches the line, per difficulty (at speed ×1). */
const LOOKAHEAD = [2.1, 1.85, 1.6, 1.4];
const POINTS = { perfect: 300, great: 200, good: 100 };
const HOLD_POINTS = 150;
const FEVER_BEATS = 16;
const FEVER_GAIN = { perfect: 0.055, great: 0.02, good: 0, hold: 0.03 };

export type Phase = "loading" | "menu" | "calibrate" | "playing" | "paused" | "countin" | "results" | "error";
export type Judgement = "perfect" | "great" | "good" | "miss";

export interface Hud {
  /** Track index and difficulty being played. */
  track: number;
  difficulty: Difficulty;
  score: number;
  combo: number;
  multiplier: number;
  accuracy: number;
  fever: number;
  feverOn: boolean;
  progress: number;
  section: string;
  /** Last judgement (id changes on every new one). */
  judge: { kind: Judgement | "hold" | "drop"; id: number; timing: "early" | "late" | "" } | null;
  /** Count-in text ("3", "2", "1", "GO!") or null. */
  count: string | null;
}

export interface RunResult {
  track: number;
  difficulty: Difficulty;
  score: number;
  accuracy: number;
  grade: Grade;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  holds: number;
  holdsTotal: number;
  fullCombo: boolean;
}

export type Grade = "S" | "A" | "B" | "C" | "D";
export const gradeFor = (acc: number): Grade => (acc >= 95 ? "S" : acc >= 90 ? "A" : acc >= 80 ? "B" : acc >= 70 ? "C" : "D");
export const CLEAR_ACCURACY = 70;

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  results(r: RunResult): void;
  /** Screen position (CSS px) of each lane's receptor and the lane width there. */
  lanes(spots: { x: number; y: number; w: number }[]): void;
  error(message: string): void;
}

export interface RunSettings {
  /** Calibration (ms): positive when your taps land late. */
  offsetMs: number;
  /** Note speed multiplier. */
  speed: number;
}

export interface Calibration {
  beat: number;
  taps: number;
  offsetMs: number | null;
}

interface Run {
  track: Track;
  trackIndex: number;
  difficulty: Difficulty;
  chart: Chart;
  notes: PlayNote[];
  cursor: number;
  renderFrom: number;
  lookahead: number;
  timing: SongTiming | null;
  offset: number;
  score: number;
  combo: number;
  maxCombo: number;
  fever: number;
  feverEnd: number;
  counts: Record<Judgement, number>;
  holdsDone: number;
  holdsTotal: number;
  judged: number;
  accSum: number;
  items: number;
  holding: (PlayNote | null)[];
  missStreak: number;
  energy: number;
  finished: boolean;
  judgeId: number;
  lastJudge: Hud["judge"];
  unsub: () => void;
}

const KEY_LANES: Record<string, number> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
export const laneForKey = (e: KeyboardEvent) => KEY_LANES[e.code] ?? KEY_LANES[e.key];

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class BeatStreetGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private readonly timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private club: Club | null = null;
  private highway: Highway | null = null;
  private readonly highwayRoot = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly coarse: boolean;
  private maxRatio = 1;
  private perf = { time: 0, frames: 0, good: 0 };

  private phase: Phase = "loading";
  private run: Run | null = null;
  private previewTrack = 0;
  private elapsed = 0;
  private portrait = false;
  private keysDown = [0, 0, 0, 0];
  private camBlend = 0;
  private resultsT = 0;
  private hud: Hud = emptyHud();
  private lastHudJson = "";
  private mood: Mood = "menu";
  private boos = 0;
  private lanesKey = "";

  // Audio clock: audio time (heard at the speakers) = performance time / 1000 + offset.
  private clockOffset = 0;
  private clockReady = false;
  private frozenSongTime = 0;
  private countEnd = 0;
  private countBeat = 0.5;

  // Calibration.
  private cal: { start: number; beat: number; next: number; offsets: number[] } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.maxRatio = Math.min(window.devicePixelRatio, this.coarse ? 1.5 : 1.75);
    this.renderer.setPixelRatio(this.maxRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const { scene } = this;
    scene.background = new THREE.Color("#07020d");
    scene.fog = new THREE.Fog("#07020d", 16, 34);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.16;
    scene.add(new THREE.HemisphereLight("#6d3fa8", "#120818", 0.55));
    const fill = new THREE.DirectionalLight("#9fb4ff", 0.35);
    fill.position.set(-3, 6, 8);
    scene.add(fill);
    this.highwayRoot.position.y = 0.06;
    scene.add(this.camera, this.highwayRoot);

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
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.0);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  // --- Loading --------------------------------------------------------------------------------------

  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      const required = [M.receptor, M.note, M.floor, DANCERS[0].key, ...CLIPS.map((c) => clipKey("f", c))];
      if (!required.every((k) => models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");
      this.club = new Club(models);
      this.scene.add(this.club.group);
      this.highway = new Highway(models);
      this.highwayRoot.add(this.highway.group);
      this.highway.setViewport(this.canvas.clientHeight || 720);
      this.resize();
      this.setPhase("menu");
      this.preview(this.previewTrack);
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  // --- Public API -----------------------------------------------------------------------------------

  selectDancer(index: number) {
    this.club?.selectDancer(index);
  }

  /** Menu: plays the track's calm loop (intensity 0). */
  preview(trackIndex: number) {
    this.previewTrack = trackIndex;
    if (this.phase !== "menu" && this.phase !== "loading") return;
    const track = TRACKS[trackIndex];
    if (!track) return;
    music.play(track.song, 0);
    music.duck(false);
  }

  start(trackIndex: number, difficulty: Difficulty, settings: RunSettings) {
    const track = TRACKS[trackIndex];
    if (!track || !this.highway || !this.club) return;
    this.stopCalibration();
    this.endRun();
    audio.hold(false);
    audio.unlock();
    const chart = buildChart(track, difficulty);
    const notes: PlayNote[] = chart.notes.map((n) => ({ ...n, status: "pending", cut: 0 }));
    const lookahead = LOOKAHEAD[difficulty] / Math.max(0.5, settings.speed);
    const run: Run = {
      track,
      trackIndex,
      difficulty,
      chart,
      notes,
      cursor: 0,
      renderFrom: 0,
      lookahead,
      timing: null,
      offset: settings.offsetMs / 1000,
      score: 0,
      combo: 0,
      maxCombo: 0,
      fever: 0,
      feverEnd: -1,
      counts: { perfect: 0, great: 0, good: 0, miss: 0 },
      holdsDone: 0,
      holdsTotal: notes.filter((n) => n.hold).length,
      judged: 0,
      accSum: 0,
      items: notes.length + notes.filter((n) => n.hold).length,
      holding: [null, null, null, null],
      missStreak: 0,
      energy: 0.15,
      finished: false,
      judgeId: 0,
      lastJudge: null,
      unsub: () => {},
    };
    run.unsub = music.onStart((t) => {
      if (t.song === track.song && this.run === run) run.timing = t;
    });
    this.run = run;
    this.highway.clear();
    this.highway.setSpeed(HIGHWAY_LEN / lookahead, chart.beat);
    this.keysDown = [0, 0, 0, 0];
    this.boos = 0;
    music.play(track.song, sectionAt(track, 0).intensity, { restart: true });
    music.duck(false);
    this.setMood("warm");
    this.setPhase("playing");
    this.emitHud(true);
  }

  pause() {
    if (this.phase === "countin") {
      this.setPhase("paused");
      return;
    }
    if (this.phase !== "playing" || !this.run) return;
    this.frozenSongTime = this.songTime();
    audio.hold(true);
    this.clockReady = false;
    for (let l = 0; l < 4; l++) this.highway?.press(l, false);
    this.setPhase("paused");
    this.emitHud(true);
  }

  /** Resumes after a 3-2-1 count-in on the song's beat; the music clock stays frozen until then. */
  resume() {
    if (this.phase !== "paused" || !this.run) return;
    const beat = this.run.chart.beat;
    this.countBeat = Math.max(0.42, beat);
    this.countEnd = performance.now() / 1000 + this.countBeat * 3;
    this.setPhase("countin");
  }


  toMenu() {
    this.stopCalibration();
    this.endRun();
    audio.hold(false);
    audio.unlock();
    this.highway?.clear();
    this.keysDown = [0, 0, 0, 0];
    this.setPhase("menu");
    this.setMood("menu");
    this.preview(this.previewTrack);
    this.emitHud(true);
  }

  private endRun() {
    if (this.run) this.run.unsub();
    this.run = null;
  }

  /** Lane key pressed (timeStamp from the event, same clock as performance.now()). */
  keyDown(lane: number, timeStamp: number) {
    this.keysDown[lane]++;
    this.highway?.press(lane, true);
    if (this.phase === "calibrate") {
      this.calibrationTap(timeStamp);
      return;
    }
    const run = this.run;
    if (this.phase !== "playing" || !run || !run.timing || !this.clockReady) return;
    const t = this.audioAt(timeStamp) - run.timing.start - run.offset;
    this.judgePress(run, lane, t);
  }

  keyUp(lane: number, timeStamp: number) {
    this.keysDown[lane] = Math.max(0, this.keysDown[lane] - 1);
    if (this.keysDown[lane] > 0) return;
    this.highway?.press(lane, false);
    const run = this.run;
    if (this.phase !== "playing" || !run || !run.timing || !this.clockReady) return;
    const t = this.audioAt(timeStamp) - run.timing.start - run.offset;
    this.releaseHold(run, lane, t);
  }

  /** Lane under a screen point (touch): the lane on the highway at that spot, or nearest at the hit line. */
  laneAt(clientX: number, clientY: number): number {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.highwayRoot.position.y);
    let x: number | null = null;
    const hit = this.raycaster.ray.intersectPlane(plane, tmpV);
    if (hit && hit.z < 1.5 && hit.z > -HIGHWAY_LEN) {
      x = hit.x;
    } else {
      // Above the horizon or behind the line: use the screen x across the hit line.
      const left = tmpV.set(laneX(0) - LANE_W / 2, 0, 0).project(this.camera).x;
      const right = tmpV2.set(laneX(3) + LANE_W / 2, 0, 0).project(this.camera).x;
      const u = (ndc.x - left) / (right - left);
      x = laneX(0) - LANE_W / 2 + u * LANE_W * 4;
    }
    return THREE.MathUtils.clamp(Math.floor(x / LANE_W + 2), 0, 3);
  }

  // --- Calibration ------------------------------------------------------------------------------------

  startCalibration() {
    if (this.phase !== "menu") return;
    audio.hold(false);
    audio.unlock();
    music.stop(0.4);
    const ctx = audio.ctx;
    const beat = 60 / 100;
    const start = (ctx?.currentTime ?? 0) + 0.8;
    this.cal = { start, beat, next: 0, offsets: [] };
    this.setPhase("calibrate");
  }

  calibration(): Calibration | null {
    const c = this.cal;
    if (!c) return null;
    const heard = this.clockReady ? this.audioAt(performance.now()) : 0;
    const offsets = [...c.offsets].sort((a, b) => a - b);
    const trimmed = offsets.length >= 5 ? offsets.slice(1, -1) : offsets;
    const median = trimmed.length >= 4 ? trimmed[Math.floor(trimmed.length / 2)] : null;
    return { beat: (heard - c.start) / c.beat, taps: c.offsets.length, offsetMs: median === null ? null : Math.round(median * 1000) };
  }

  private calibrationTap(timeStamp: number) {
    const c = this.cal;
    if (!c || !this.clockReady) return;
    const t = this.audioAt(timeStamp);
    const k = Math.round((t - c.start) / c.beat);
    if (k < 0) return;
    const off = t - (c.start + k * c.beat);
    if (Math.abs(off) > c.beat * 0.4) return;
    c.offsets.push(off);
    if (c.offsets.length > 16) c.offsets.shift();
  }

  stopCalibration() {
    if (!this.cal) return;
    this.cal = null;
    if (this.phase === "calibrate") {
      this.setPhase("menu");
      this.preview(this.previewTrack);
    }
  }

  private updateCalibration() {
    const c = this.cal;
    const ctx = audio.ctx;
    if (!c || !ctx || ctx.state !== "running") return;
    // Schedule the metronome a little ahead on the audio clock (sample-accurate).
    while (c.start + c.next * c.beat < ctx.currentTime + 0.25) {
      const at = c.start + c.next * c.beat;
      if (at >= ctx.currentTime) this.sfx.click(c.next % 4 === 0, at - ctx.currentTime);
      c.next++;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.endRun();
    audio.hold(false);
    music.stop();
    this.envTexture?.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m?.dispose());
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }

  // --- Clock ------------------------------------------------------------------------------------------

  /** Keeps a smooth mapping from performance.now() to the audio clock (as heard at the speakers). */
  private syncClock(perfMs: number) {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== "running") {
      this.clockReady = false;
      return;
    }
    let heard: number;
    const ts = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime && ts.performanceTime && ts.contextTime > 0) heard = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    else heard = ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
    const target = heard - perfMs / 1000;
    if (!this.clockReady || Math.abs(target - this.clockOffset) > 0.04) this.clockOffset = target;
    else this.clockOffset += (target - this.clockOffset) * 0.05;
    this.clockReady = true;
  }

  private audioAt(perfMs: number) {
    return perfMs / 1000 + this.clockOffset;
  }

  /** Seconds since the song's bar 0 (calibration applied), frozen while paused. */
  private songTime(): number {
    const run = this.run;
    if (!run) return 0;
    if (this.phase === "paused" || this.phase === "countin" || !this.clockReady) return this.frozenSongTime;
    if (!run.timing) return -0.4;
    return this.audioAt(performance.now()) - run.timing.start - run.offset;
  }

  // --- Judgement --------------------------------------------------------------------------------------

  private judgePress(run: Run, lane: number, t: number) {
    let best: PlayNote | null = null;
    for (let i = run.cursor; i < run.notes.length; i++) {
      const n = run.notes[i];
      if (n.time > t + WINDOWS.good) break;
      if (n.lane !== lane || n.status !== "pending") continue;
      if (n.time < t - WINDOWS.good) continue;
      best = n;
      break;
    }
    if (!best) return;
    const dt = t - best.time;
    const err = Math.abs(dt);
    const kind: Judgement = err <= WINDOWS.perfect ? "perfect" : err <= WINDOWS.great ? "great" : "good";
    if (best.hold) {
      best.status = "holding";
      run.holding[lane] = best;
    } else best.status = "done";
    this.award(run, kind, kind === "perfect" ? "" : dt < 0 ? "early" : "late");
    this.highway?.burst(lane, kind === "perfect" ? 1 : kind === "great" ? 0.7 : 0.4);
  }

  private releaseHold(run: Run, lane: number, t: number) {
    const n = run.holding[lane];
    if (!n) return;
    run.holding[lane] = null;
    if (t >= n.end - HOLD_GRACE) this.completeHold(run, n);
    else {
      n.status = "dropped";
      n.cut = t;
      this.breakCombo(run, "drop");
      this.sfx.drop();
    }
  }

  private completeHold(run: Run, n: PlayNote) {
    n.status = "done";
    run.holdsDone++;
    run.judged++;
    run.accSum += 1;
    run.combo++;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    run.score += HOLD_POINTS * this.multiplier(run) * (this.feverOn(run) ? 2 : 1);
    this.chargeFever(run, FEVER_GAIN.hold);
    this.judgeEvent(run, "hold", "");
    this.highway?.burst(n.lane, 0.8);
    this.sfx.holdDone();
  }

  private award(run: Run, kind: Exclude<Judgement, "miss">, timing: "early" | "late" | "") {
    run.counts[kind]++;
    run.judged++;
    run.accSum += kind === "perfect" ? 1 : kind === "great" ? 0.7 : 0.4;
    run.combo++;
    run.missStreak = 0;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    run.score += POINTS[kind] * this.multiplier(run) * (this.feverOn(run) ? 2 : 1);
    this.chargeFever(run, FEVER_GAIN[kind]);
    run.energy = Math.min(1, run.energy + (kind === "perfect" ? 0.035 : 0.02));
    this.judgeEvent(run, kind, timing);
    if (run.combo > 0 && run.combo % 50 === 0) {
      this.sfx.combo(run.combo / 50);
      this.sfx.cheer(0.6);
    }
  }

  private miss(run: Run, n: PlayNote) {
    n.status = "missed";
    run.counts.miss++;
    run.judged++;
    if (n.hold) run.judged++; // its tail is lost too
    this.breakCombo(run, "miss");
    this.sfx.miss();
  }

  private breakCombo(run: Run, kind: "miss" | "drop") {
    if (kind === "drop") run.judged++;
    run.combo = 0;
    run.missStreak++;
    run.energy = Math.max(0, run.energy - 0.18);
    if (!this.feverOn(run)) run.fever = Math.max(0, run.fever - 0.08);
    this.judgeEvent(run, kind, "");
  }

  private judgeEvent(run: Run, kind: NonNullable<Hud["judge"]>["kind"], timing: "early" | "late" | "") {
    run.lastJudge = { kind, id: ++run.judgeId, timing };
  }

  private multiplier(run: Run) {
    return Math.min(4, 1 + Math.floor(run.combo / 10));
  }

  private feverOn(run: Run) {
    return run.feverEnd > this.songTime();
  }

  private chargeFever(run: Run, amount: number) {
    if (this.feverOn(run) || amount <= 0) return;
    run.fever = Math.min(1, run.fever + amount);
    if (run.fever >= 1) {
      run.feverEnd = this.songTime() + FEVER_BEATS * run.chart.beat;
      this.sfx.fever();
    }
  }

  // --- Frame ------------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 1 / 20);
    this.adaptQuality(raw);
    this.syncClock(performance.now());
    if (this.phase === "loading" || this.phase === "error") return;

    if (this.phase === "countin") this.updateCountIn();
    if (this.phase === "playing") this.updateRun();
    if (this.phase === "calibrate") this.updateCalibration();
    const frozen = this.phase === "paused" || this.phase === "countin";
    if (!frozen) this.elapsed += dt;

    const pulse = this.pulse();
    if (!frozen) this.club?.update(dt, pulse);
    const run = this.run;
    if (this.highway) {
      const st = run ? this.songTime() : 0;
      if (run) this.highway.sync(run.notes, run.renderFrom, st, run.lookahead);
      this.highway.update(frozen ? 0 : dt, st, pulse.hit, pulse.fever ? 1 : 0);
    }
    if (this.phase === "results") this.resultsT += dt;
    this.updateCamera(frozen ? 0 : dt, pulse);
    if (this.bloom) this.bloom.strength = 0.55 + pulse.hit * 0.15 + (pulse.fever ? 0.2 : 0);
    this.composer?.render();
    if (this.run) this.emitLanes();
  };

  /** Dynamic resolution: drop the pixel ratio when frames run slow, raise it again when there is headroom. */
  private adaptQuality(raw: number) {
    if (this.phase === "loading" || document.hidden || raw > 0.5) return;
    const p = this.perf;
    p.time += raw;
    p.frames++;
    if (p.time < 1.5) return;
    const fps = p.frames / p.time;
    p.time = 0;
    p.frames = 0;
    const ratio = this.renderer.getPixelRatio();
    if (fps < 45 && ratio > 0.75) {
      this.renderer.setPixelRatio(Math.max(0.75, ratio - 0.25));
      p.good = 0;
      this.resize();
    } else if (fps > 58 && ratio < this.maxRatio) {
      if (++p.good >= 4) {
        this.renderer.setPixelRatio(Math.min(this.maxRatio, ratio + 0.25));
        p.good = 0;
        this.resize();
      }
    } else p.good = 0;
  }

  private emitLanes() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const spots = [0, 1, 2, 3].map((l) => {
      const c = tmpV.set(laneX(l), 0, 0).project(this.camera);
      const a = tmpV2.set(laneX(l) - LANE_W / 2, 0, 0).project(this.camera).x;
      const b = tmpV2.set(laneX(l) + LANE_W / 2, 0, 0).project(this.camera).x;
      return { x: Math.round(((c.x + 1) / 2) * w), y: Math.round(((1 - c.y) / 2) * h), w: Math.round(((b - a) / 2) * w) };
    });
    const key = JSON.stringify(spots);
    if (key === this.lanesKey) return;
    this.lanesKey = key;
    this.events.lanes(spots);
  }

  /** Beat and energy for the lights, from the song clock (menu loop included). */
  private pulse(): Pulse {
    const run = this.run;
    let beat = this.elapsed * 2;
    let beatDur = 0.5;
    const timing = run?.timing ?? music.timing();
    if (timing) {
      beatDur = (timing.stepDur * timing.steps) / 4;
      const t = run && this.phase !== "results" ? this.songTime() : this.clockReady ? this.audioAt(performance.now()) - timing.start : this.elapsed;
      beat = t / beatDur;
    }
    const phase = beat - Math.floor(beat);
    const hit = Math.exp(-phase * 5.5);
    const playing = run && (this.phase === "playing" || this.phase === "paused" || this.phase === "countin");
    const energy = playing ? run.energy : this.phase === "results" ? 0.8 : 0.45;
    return { beat, hit, energy, fever: !!(playing && run && this.feverOn(run)), time: this.elapsed };
  }

  private updateCountIn() {
    const left = this.countEnd - performance.now() / 1000;
    if (left <= 0) {
      audio.hold(false);
      audio.unlock();
      this.clockReady = false;
      this.setPhase("playing");
      return;
    }
    const n = Math.ceil(left / this.countBeat);
    if (this.hud.count !== String(n)) this.emitHud(true);
  }

  private updateRun() {
    const run = this.run;
    if (!run) return;
    const t = this.songTime();
    // Misses: pending notes past the window.
    for (let i = run.cursor; i < run.notes.length; i++) {
      const n = run.notes[i];
      if (n.time > t - WINDOWS.good) break;
      if (n.status === "pending") this.miss(run, n);
    }
    while (run.cursor < run.notes.length && run.notes[run.cursor].status !== "pending" && run.notes[run.cursor].time < t - WINDOWS.good) run.cursor++;
    while (run.renderFrom < run.notes.length) {
      const n = run.notes[run.renderFrom];
      const gone = n.status !== "holding" && (n.hold ? n.end : n.time) < t - 0.8;
      if (!gone) break;
      run.renderFrom++;
    }
    // Holds: complete at their end, drop if the key came up while paused.
    for (let lane = 0; lane < 4; lane++) {
      const n = run.holding[lane];
      if (!n) continue;
      if (t >= n.end) {
        run.holding[lane] = null;
        this.completeHold(run, n);
      } else if (this.keysDown[lane] === 0) this.releaseHold(run, lane, t);
      else if (Math.random() < 0.5) this.highway?.spark(lane, 1, 0.6);
    }
    // Fever.
    if (run.feverEnd > 0) {
      const left = run.feverEnd - t;
      if (left > 0) run.fever = left / (FEVER_BEATS * run.chart.beat);
      else {
        run.feverEnd = -1;
        run.fever = 0;
        this.sfx.feverEnd();
      }
    }
    run.energy = Math.max(0.1, run.energy - 0.0004);
    this.updateMusicIntensity(run);
    this.updateMood(run);
    // The end: a bar after the last note (or the end of the outro).
    if (!run.finished && run.timing && t > Math.min(run.chart.length, run.chart.last + run.chart.bar) && run.holding.every((h) => !h)) this.finish(run);
    this.emitHud();
  }

  /** Sets the music's intensity for the next bar it prepares (arrangement, or 2 in fever). */
  private updateMusicIntensity(run: Run) {
    const timing = run.timing;
    if (!timing) return;
    const barDur = timing.stepDur * timing.steps;
    const next = Math.round((music.scheduledUntil() - timing.start) / barDur);
    const section = sectionAt(run.track, next);
    const fever = this.feverOn(run) && section.intensity > 0;
    music.setIntensity(fever ? Math.max(2, section.intensity) : section.intensity);
  }

  private updateMood(run: Run) {
    let mood: Mood = "warm";
    if (this.feverOn(run)) mood = "fever";
    else if (run.missStreak >= 4) mood = "sad";
    else if (run.combo >= 30) mood = "hype";
    else if (run.combo >= 8) mood = "groove";
    if (mood === "sad" && this.mood !== "sad" && this.boos < 3) {
      this.boos++;
      this.sfx.boo();
    }
    if (mood === "hype" && this.mood === "groove") this.sfx.cheer(0.5);
    this.setMood(mood);
  }

  private setMood(mood: Mood) {
    this.mood = mood;
    this.club?.setMood(mood);
  }

  private finish(run: Run) {
    run.finished = true;
    const items = Math.max(1, run.items);
    const accuracy = Math.round((run.accSum / items) * 1000) / 10;
    const grade = gradeFor(accuracy);
    const result: RunResult = {
      track: run.trackIndex,
      difficulty: run.difficulty,
      score: Math.round(run.score),
      accuracy,
      grade,
      maxCombo: run.maxCombo,
      perfect: run.counts.perfect,
      great: run.counts.great,
      good: run.counts.good,
      miss: run.counts.miss,
      holds: run.holdsDone,
      holdsTotal: run.holdsTotal,
      fullCombo: run.counts.miss === 0 && run.holdsDone === run.holdsTotal,
    };
    music.setIntensity(0);
    this.resultsT = 0;
    this.setMood(accuracy >= CLEAR_ACCURACY ? "win" : "sad");
    this.sfx.results(accuracy >= CLEAR_ACCURACY);
    for (let l = 0; l < 4; l++) this.highway?.press(l, false);
    this.highway?.clear();
    run.renderFrom = run.notes.length;
    this.setPhase("results");
    this.events.results(result);
  }

  // --- HUD --------------------------------------------------------------------------------------------

  private emitHud(force = false) {
    const run = this.run;
    let next: Hud;
    if (!run) next = emptyHud();
    else {
      const t = this.songTime();
      const feverOn = this.feverOn(run);
      const bar = run.timing ? Math.floor(t / run.chart.bar) : 0;
      let count: string | null = null;
      if (this.phase === "countin") count = String(Math.max(1, Math.ceil((this.countEnd - performance.now() / 1000) / this.countBeat)));
      else if (this.phase === "playing" && run.timing && t < run.chart.bar && t > -0.2) {
        const beat = Math.floor(t / run.chart.beat);
        count = beat >= 3 ? "GO!" : String(3 - Math.max(0, beat));
      }
      next = {
        track: run.trackIndex,
        difficulty: run.difficulty,
        score: Math.round(run.score),
        combo: run.combo,
        multiplier: this.multiplier(run),
        accuracy: run.judged ? Math.round((run.accSum / run.judged) * 1000) / 10 : 100,
        fever: Math.round(run.fever * 100) / 100,
        feverOn,
        progress: Math.round(Math.min(1, Math.max(0, t / run.chart.last)) * 200) / 200,
        section: sectionAt(run.track, Math.max(0, bar)).label,
        judge: run.lastJudge,
        count,
      };
    }
    const json = JSON.stringify(next);
    if (!force && json === this.lastHudJson) return;
    this.lastHudJson = json;
    this.hud = next;
    this.events.hud(next);
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  // --- Camera ---------------------------------------------------------------------------------------

  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();

  private updateCamera(dt: number, p: Pulse) {
    const inRun = this.phase === "playing" || this.phase === "paused" || this.phase === "countin";
    this.camBlend = THREE.MathUtils.clamp(this.camBlend + (inRun ? dt : -dt) * 1.3, 0, 1);
    const k = this.camBlend * this.camBlend * (3 - 2 * this.camBlend);
    const a = this.elapsed * 0.12;
    const dancer = this.club?.dancerPosition(tmpV2) ?? tmpV2.set(0, 0, STAGE_Z);
    // Menu / results: an orbit in front of the stage. Run: behind the hit line, looking down the highway.
    const orbit = this.phase === "results" ? 0.35 + this.resultsT * 0.08 : Math.sin(a) * 0.5;
    const menuPos = tmpV.set(dancer.x + Math.sin(orbit) * 6.2, 2.1, dancer.z + Math.cos(orbit) * 6.2);
    const menuLook = new THREE.Vector3(dancer.x, 1.45, dancer.z);
    if (this.portrait) {
      menuPos.set(dancer.x + Math.sin(orbit) * 6.2, 2.0, dancer.z + Math.cos(orbit) * 6.2);
      menuLook.y = 0.64;
    }
    const runPos = this.portrait ? new THREE.Vector3(0, 3.4, 4.2) : new THREE.Vector3(0, 2.6, 3.0);
    const runLook = this.portrait ? new THREE.Vector3(0, -0.9, -6) : new THREE.Vector3(0, -1.04, -7);
    const pos = menuPos.clone().lerp(runPos, k);
    const look = menuLook.lerp(runLook, k);
    if (dt === 0 || this.camPos.lengthSq() === 0) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
    } else {
      this.camPos.lerp(pos, 1 - Math.exp(-6 * dt));
      this.camLook.lerp(look, 1 - Math.exp(-6 * dt));
    }
    const bump = inRun ? p.hit * 0.012 * (p.fever ? 2 : 1) : 0;
    this.camera.position.set(this.camPos.x, this.camPos.y + bump, this.camPos.z);
    this.camera.lookAt(this.camLook);
    const fov = THREE.MathUtils.lerp(this.portrait ? 60 : 45, this.portrait ? 70 : 52, k);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.bloom?.resolution.set(Math.round(w / 2), Math.round(h / 2));
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    this.camera.updateProjectionMatrix();
    this.highway?.setViewport(h * this.renderer.getPixelRatio());
  }
}

function emptyHud(): Hud {
  return { track: 0, difficulty: 0, score: 0, combo: 0, multiplier: 1, accuracy: 100, fever: 0, feverOn: false, progress: 0, section: "", judge: null, count: null };
}
