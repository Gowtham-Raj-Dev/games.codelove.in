import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, makeProto, Pool, type Fit, type LoadedModel, type LoadProgress, type Proto } from "../shared/assets";
import { music } from "../shared/music";
import { CITY_RUSH } from "../shared/songs";
import { Sfx } from "./audio";
import { BOARDS, findItem, RIG_KEY, SKATERS, SKINS, STAGES, stageModels, type Placed, type SkinLook, type StageDef, type StageRules } from "./content";
import { applySkin, BoardRig, glowTexture, makeSkyDisc, makeStars, makeWeather, shaderDistance, shaderTime, TrailFx, variantMaterial, type Variant } from "./looks";
import { BASE_MODELS, M } from "./manifest";

// --- Tuning (metres, seconds) -------------------------------------------------------------------

const LANE_W = 2.6;
const ROAD_W = 9.4;
const ROAD_TILE = 18;
const WALK_W = 4.4;
const WALK_H = 0.3;
const BUILD_X = ROAD_W / 2 + WALK_W + 0.8;
/** The track is built this far ahead of the player (hidden by fog) and kept this far behind. */
const AHEAD = 165;
const BEHIND = 25;
/** City built behind the start line, seen by the menu camera. */
const PREBUILD = 150;
const FIRST_ROW = 70;
const BASE_SPEED = 15;
const MAX_SPEED = 34;
const GRAVITY = 36;
const JUMP_V = 12.4; // ≈ 2.1 m high, ≈ 0.69 s in the air
const SLAM_V = -26;
const DUCK_TIME = 0.8;
const STAND_H = 1.6;
const DUCK_H = 0.8;
const POWER_TIME = 10;
const COIN_POINTS = 10;
const ZONE_LEN = 480;

const laneX = (lane: number) => (lane - 1) * LANE_W;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const ease = (t: number) => t * t * (3 - 2 * t);
const baseSpeedAt = (s: number) => BASE_SPEED + (MAX_SPEED - BASE_SPEED) * (1 - Math.exp(-Math.max(0, s) / 2600));
/** Proto key of a placed model (the same model can be placed at several sizes). */
const placedKey = (p: Placed) => `${p.key}@${JSON.stringify(p.fit)}`;

// --- Public types -------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "crashed" | "over" | "error";

export interface Hud {
  score: number;
  coins: number;
  distance: number;
  shield: boolean;
  /** Seconds left on the magnet / x2 booster. */
  magnet: number;
  boost: number;
}

export interface RunResult {
  score: number;
  coins: number;
  distance: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  hud(hud: Hud): void;
  phase(phase: Phase): void;
  over(result: RunResult): void;
  error(message: string): void;
  /** A skater or stage is downloading (ratio 0..1), or null when done. */
  busy?(state: { label: string; ratio: number } | null): void;
}

export type Move = "left" | "right" | "jump" | "duck";

/** What the menu camera frames: the title screen, or a shop tab's item. */
export type Showcase = "menu" | "skater" | "board" | "stage";

export interface Loadout {
  skater: string;
  skin: string;
  board: string;
  stage: string;
}

// --- Internal types -----------------------------------------------------------------------------

interface Part {
  key: string;
  obj: THREE.Object3D;
}

interface Scenery {
  end: number;
  parts: Part[];
}

type Action = "jump" | "duck" | "block";
type ObKind = "barrier" | "fence" | "cones" | "gate" | "car";

interface Obstacle {
  holder: THREE.Group;
  parts: Part[];
  action: Action;
  lane: number;
  x: number;
  /** Track distance of the obstacle's centre. */
  s: number;
  halfLen: number;
  halfW: number;
  yMin: number;
  yMax: number;
  /** Own speed towards the player (oncoming traffic). */
  speed: number;
  fly: { t: number; vy: number; vx: number; spin: THREE.Vector3 } | null;
}

type PickupKind = "coin" | "shield" | "magnet" | "boost";

interface Pickup {
  part: Part;
  kind: PickupKind;
  s: number;
  x: number;
  y: number;
  attract: boolean;
  taken: number; // seconds since collected, -1 while on the track
}

interface Row {
  s: number;
  end: number;
  passable: boolean[];
}

interface Rider {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current: THREE.AnimationAction | null;
  /** Feeds the skin shaders the skater's position. */
  origin: { value: THREE.Vector3 };
  skin: SkinLook | null;
}

// --- Game ---------------------------------------------------------------------------------------

export class SkateRushGame {
  readonly sfx = new Sfx();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 600);
  private readonly sun = new THREE.DirectionalLight("#fff3e0", 2.6);
  private readonly hemi = new THREE.HemisphereLight("#dff0ff", "#7d8a66", 1.25);
  private readonly track = new THREE.Group();
  private readonly protos = new Map<string, Proto>();
  private readonly models = new Map<string, LoadedModel>();
  private readonly pool: Pool;
  private readonly timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private suspended = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;

  // Sky & weather.
  private readonly skyUniforms = { top: { value: new THREE.Color("#5fa8e8") }, horizon: { value: new THREE.Color("#cde3f4") } };
  private readonly skyAnchor = new THREE.Group();
  private readonly ground: THREE.Mesh;
  private stars: THREE.Points | null = null;
  private snow: THREE.Points | null = null;
  private fireflies: THREE.Points | null = null;
  private moon: THREE.Sprite | null = null;
  private planet: THREE.Sprite | null = null;
  private readonly water: THREE.Mesh[] = [];

  // Player rig: player (lane x, jump y) → body (facing, lean, spin) → board pivot (kickflip) + riders.
  private readonly player = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly boardPivot = new THREE.Group();
  private board: BoardRig | null = null;
  private readonly trail = new TrailFx();
  private readonly riders = new Map<string, Rider>();
  private readonly orbs = { shield: new THREE.Group(), magnet: new THREE.Group(), boost: new THREE.Group() };
  private boardHeight = 0.16;
  /** Node positions of the rig model before any animation moved them. */
  private rigRest = new Map<string, THREE.Vector3>();

  private loadout: Loadout = { skater: SKATERS[0].id, skin: SKINS[0].id, board: BOARDS[0].id, stage: STAGES[0].id };
  private stage: StageDef = STAGES[0];
  private rules: StageRules = STAGES[0].rules;
  private readonly builtStages = new Set<string>();
  /** Bumped by every skater / stage change, so a slow download can't apply an older choice. */
  private request = { skater: 0, stage: 0 };

  private phase: Phase = "loading";
  private distance = 0;
  private speed = 0;
  private runTime = 0;
  private lane = 1;
  private x = 0;
  private y = 0;
  private vy = 0;
  private grounded = true;
  private airTime = 0;
  private duckT = 0;
  private duckQueued = false;
  private trick: "flip" | "spin" = "flip";
  private wobble = 0;
  private points = 0;
  private coins = 0;
  private shield = false;
  private magnet = 0;
  private boost = 0;
  private invulnerable = 0;
  private crashT = 0;
  private boardFly = { vy: 0, vz: 0 };
  private shake = 0;
  private camBlend = 0;
  /** Seconds until the menu rider goes back to idle after a character-select emote. */
  private queueIdle = 0;
  /** Seconds since load, frozen while paused (drives spins, bobbing and the menu camera). */
  private elapsed = 0;
  private portrait = false;
  private showcase: Showcase = "menu";
  private zoom = 1;
  private readonly viewShift = { x: 0, y: 0, tx: 0, ty: 0 };
  private readonly preset = { pos: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };

  /** Plays itself (trailer recording). */
  autopilot = false;
  /** Obstacles bounce off instead of ending the run (trailer recording). */
  invincible = false;
  private botCooldown = 0;

  private obstacles: Obstacle[] = [];
  private pickups: Pickup[] = [];
  private scenery: Scenery[] = [];
  private rows: Row[] = [];
  private cursor = { road: 0, left: 0, right: 0, props: 0, row: 0, power: 0, ship: 0 };
  private lastRowEnd = 0;

  // Model lists for the current stage, filtered to what actually loaded.
  private cars: string[] = [];

  private hud: Hud = { score: 0, coins: 0, distance: 0, shield: false, magnet: 0, boost: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
    /** In YouTube Playables the SDK pauses the game; the page visibility API must not be used. */
    { visibility = true }: { visibility?: boolean } = {},
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.75 : 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: "#8fbf72", roughness: 1 }));
    this.setupWorld(coarse);
    this.pool = new Pool(this.protos, this.track);
    this.scene.add(this.track, this.player, this.skyAnchor, this.trail.points);
    this.player.add(this.body);
    this.body.add(this.boardPivot);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    if (visibility) this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.fog = new THREE.Fog("#cde3f4", 55, AHEAD - 5);
    scene.background = new THREE.Color("#cde3f4");

    // Gradient sky dome whose horizon matches the fog, so distant buildings melt into the sky.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyUniforms,
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0); }",
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -2;
    this.camera.add(sky);
    scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.45;

    scene.add(this.hemi);
    const { sun } = this;
    sun.position.set(14, 30, 8);
    sun.target.position.set(0, 0, -16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 30, bottom: -30, near: 1, far: 90 });
    scene.add(sun, sun.target);

    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.12;
    this.ground.receiveShadow = true;
    scene.add(this.ground);
  }

  /**
   * Loads the shared models, the chosen skater and stage, then opens the menu.
   * sizes: bytes per model (from the catalog) so the loading bar is exact.
   */
  async load(sizes: Record<string, number>, loadout: Loadout) {
    try {
      this.loadout = { ...loadout };
      this.stage = findItem(STAGES, loadout.stage);
      const skater = findItem(SKATERS, loadout.skater);
      const keys = [...new Set([...BASE_MODELS, skater.key, ...stageModels(this.stage)])];
      const models = await loadModels(keys, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      models.forEach((m, k) => this.models.set(k, m));
      const required = [M.board, M.road, M.sidewalk, M.barrier, M.coin, RIG_KEY];
      if (!required.every((k) => this.models.has(k))) throw new Error("Some game models could not be loaded. Check your connection and reload.");

      this.rigRest = restPose(this.models.get(RIG_KEY)!.scene);
      this.buildShared();
      this.buildStage(this.stage);
      this.applyStage(this.stage);
      this.buildPlayer();
      this.showSkater(this.models.has(skater.key) ? skater.id : SKATERS[0].id);
      this.setBoard(loadout.board);
      this.resetWorld();
      this.resetRun();
      music.play(CITY_RUSH, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private proto(key: string, fit: Fit, opts?: { shadows?: boolean; receive?: boolean }, protoKey = key, variant?: Variant) {
    const m = this.models.get(key);
    if (!m) return;
    const scene = m.scene.clone(true);
    if (variant && (variant.tint || variant.snow || variant.windows)) {
      const cache = new Map<THREE.Material, THREE.Material>();
      const swap = (mat: THREE.Material) => {
        let v = cache.get(mat);
        if (!v) cache.set(mat, (v = variantMaterial(mat, variant)));
        return v;
      };
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      });
    }
    this.protos.set(protoKey, makeProto(scene, m.animations, fit, opts));
  }

  /** Pickups and power-up orbs: the same in every stage. */
  private buildShared() {
    this.proto(M.coin, { height: 0.75 }, { shadows: false });
    this.proto(M.heart, { height: 0.95 });
    this.proto(M.star, { height: 1.0 });
    this.proto(M.jewel, { height: 1.0 });
    this.proto(M.heart, { height: 0.4 }, { shadows: false }, "orb-heart");
    this.proto(M.star, { height: 0.42 }, { shadows: false }, "orb-star");
    this.proto(M.jewel, { height: 0.45 }, { shadows: false }, "orb-jewel");

    // Glowing kerb strip and lamp glows (night stages), made here rather than loaded.
    const kerb = (color: string) => {
      const group = new THREE.Group();
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, ROAD_TILE), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      line.position.y = 0.03;
      const spill = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, ROAD_TILE),
        new THREE.MeshBasicMaterial({ map: stripeTexture(), color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      spill.rotation.x = -Math.PI / 2;
      spill.position.y = 0.02;
      group.add(line, spill);
      return group;
    };
    const glow = () => {
      const group = new THREE.Group();
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(3.2);
      halo.name = "halo";
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 6),
        new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      pool.rotation.x = -Math.PI / 2;
      pool.name = "pool";
      group.add(halo, pool);
      return group;
    };
    const made = (key: string, object: THREE.Object3D) => this.protos.set(key, { object, size: new THREE.Vector3(1, 1, 1), animations: [] });
    made("kerb-a", kerb("#22d3ee"));
    made("kerb-b", kerb("#e879f9"));
    made("lamp-glow", glow());
  }

  /** Every model of a stage, in the stage's own materials (tint, snow, lit windows). */
  private buildStage(stage: StageDef) {
    if (this.builtStages.has(stage.id)) return;
    const look = stage.look;
    const sk = (k: string) => `${stage.id}|${k}`;
    const v = (role: "road" | "walk" | "thing" | "building"): Variant => ({
      tint: role === "road" ? look.road : role === "walk" ? look.walk : undefined,
      snow: look.snowCover && role !== "road",
      windows: look.litWindows && role === "building",
    });
    const flat = { shadows: false, receive: true };
    // Kept thin: the asphalt sits a little below the kerbs, and a tall tile would sink it under the ground plane.
    this.proto(M.road, { box: { x: ROAD_W, y: 0.04, z: ROAD_TILE } }, flat, sk("road"), v("road"));
    this.proto(M.sidewalk, { box: { x: WALK_W, y: 0.6, z: ROAD_TILE } }, flat, sk("walk"), v("walk"));
    this.proto(M.barrier, { box: { x: 2.5, y: 0.5, z: 0.32 } }, undefined, sk("gate-bar"), v("thing"));
    this.proto(M.gate, { box: { x: 2.6, y: 3.2, z: 0.4 } }, undefined, sk("gate"), v("thing"));
    this.proto(M.fence, { box: { z: 2.3, y: 1.0, x: 0.35 } }, undefined, sk("fence"), v("thing"));
    this.proto(M.trafficLight, { height: 4.4 }, undefined, sk("traffic-light"), v("thing"));
    const barrier = stage.obstacles?.barrier ?? { key: M.barrier, fit: { box: { x: 2.3, y: 0.9, z: 0.55 } } };
    const cone = stage.obstacles?.cones ?? { key: M.cone, fit: { height: 0.85 } };
    this.proto(barrier.key, barrier.fit as Fit, undefined, sk("barrier"), v("thing"));
    this.proto(cone.key, cone.fit as Fit, undefined, sk("cone"), v("thing"));
    if (stage.lamp) this.proto(stage.lamp.key, stage.lamp.fit as Fit, undefined, sk("lamp"), v("thing"));

    const things = new Map<string, { p: Placed; role: "thing" | "building"; receive: boolean }>();
    for (const zone of stage.zones) {
      for (const p of zone.buildings) things.set(placedKey(p), { p, role: "building", receive: true });
      for (const p of zone.back?.items ?? []) things.set(placedKey(p), { p, role: "building", receive: true });
      for (const p of [...(zone.gapFill ?? []), ...zone.extras]) if (!things.has(placedKey(p))) things.set(placedKey(p), { p, role: "thing", receive: false });
    }
    for (const p of look.water?.ships ?? []) things.set(placedKey(p), { p, role: "thing", receive: false });
    for (const p of stage.traffic) things.set(placedKey(p), { p, role: "thing", receive: false });
    for (const [k, { p, role, receive }] of things) this.proto(p.key, p.fit as Fit, { receive }, sk(k), v(role));
    this.builtStages.add(stage.id);
  }

  /** Sky, light, fog, ground and weather of a stage. */
  private applyStage(stage: StageDef) {
    this.stage = stage;
    this.rules = stage.rules;
    const look = stage.look;
    const { scene } = this;
    const fog = scene.fog as THREE.Fog;
    fog.color.set(look.horizon);
    fog.near = look.fogNear;
    fog.far = Math.min(look.fogFar, AHEAD - 5);
    (scene.background as THREE.Color).set(look.horizon);
    this.skyUniforms.top.value.set(look.skyTop);
    this.skyUniforms.horizon.value.set(look.horizon);
    (this.ground.material as THREE.MeshStandardMaterial).color.set(look.ground);
    this.sun.color.set(look.sun);
    this.sun.intensity = look.sunIntensity;
    this.sun.position.set(...look.sunDir);
    this.hemi.color.set(look.hemiSky);
    this.hemi.groundColor.set(look.hemiGround);
    this.hemi.intensity = look.hemiIntensity;
    scene.environmentIntensity = look.env;
    this.renderer.toneMappingExposure = look.exposure;

    const toggle = <T extends THREE.Object3D>(current: T | null, want: boolean, make: () => T, parent: THREE.Object3D): T | null => {
      if (want && !current) {
        current = make();
        parent.add(current);
      }
      if (current) current.visible = want;
      return current;
    };
    this.stars = toggle(this.stars, !!look.stars, makeStars, this.skyAnchor);
    this.snow = toggle(this.snow, !!look.snow, () => makeWeather("snow"), scene);
    this.fireflies = toggle(this.fireflies, !!look.fireflies, () => makeWeather("fireflies"), scene);
    this.moon = toggle(this.moon, !!look.moon, () => makeSkyDisc("moon", look.moon?.color), this.skyAnchor);
    this.planet = toggle(this.planet, !!look.planet, () => makeSkyDisc("planet"), this.skyAnchor);
    if (this.moon && look.moon) {
      this.moon.position.set(...look.moon.dir).normalize().multiplyScalar(380);
      this.moon.scale.setScalar(look.moon.size * 2.2);
    }
    if (this.planet && look.planet) {
      this.planet.position.set(...look.planet.dir).normalize().multiplyScalar(380);
      this.planet.scale.setScalar(look.planet.size * 2.2);
    }

    // The sea: two wide strips beyond the beach.
    if (!this.water.length) {
      for (const side of [-1, 1]) {
        const material = new THREE.MeshStandardMaterial({ color: "#1aa6c9", roughness: 0.12, metalness: 0.1 });
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = shaderTime;
          shader.uniforms.uDist = shaderDistance;
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vSrWorld;")
            .replace("#include <project_vertex>", "#include <project_vertex>\nvSrWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uDist; varying vec3 vSrWorld;")
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
              vec2 wp = vec2(vSrWorld.x, vSrWorld.z - uDist) * 0.35;
              float wave = sin(wp.x * 2.1 + uTime * 1.3) * sin(wp.y * 1.7 - uTime * 0.9);
              totalEmissiveRadiance += vec3(0.75, 0.95, 1.0) * smoothstep(0.82, 1.0, wave) * 0.35;`,
            );
        };
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 900), material);
        sea.rotation.x = -Math.PI / 2;
        sea.receiveShadow = true;
        sea.userData.side = side;
        this.water.push(sea);
        scene.add(sea);
      }
    }
    for (const sea of this.water) {
      sea.visible = !!look.water;
      if (!look.water) continue;
      (sea.material as THREE.MeshStandardMaterial).color.set(look.water.color);
      sea.position.set(sea.userData.side * (look.water.from + 250), -0.07, -300);
    }
    this.cars = stage.traffic.map((p) => `${stage.id}|${placedKey(p)}`).filter((k) => this.protos.has(k));
  }

  private buildPlayer() {
    const board = this.models.get(M.board)!;
    const proto = makeProto(board.scene.clone(true), [], { length: 1.25 });
    this.boardHeight = proto.size.y;
    const boardObj = proto.object;
    boardObj.position.y = -proto.size.y / 2;
    this.boardPivot.position.y = proto.size.y / 2;
    this.boardPivot.add(boardObj);
    this.board = new BoardRig(boardObj);
    this.board.attachGlow(this.boardPivot, -proto.size.y / 2 - 0.12);

    const orb = (group: THREE.Group, key: string) => {
      if (this.protos.has(key)) group.add(this.protos.get(key)!.object.clone());
      group.visible = false;
      this.player.add(group);
    };
    orb(this.orbs.shield, "orb-heart");
    orb(this.orbs.magnet, "orb-star");
    orb(this.orbs.boost, "orb-jewel");
  }

  /** Builds a skater once its model is loaded: the shared skate animations, fitted to its body. */
  private makeRider(id: string): Rider | null {
    const def = findItem(SKATERS, id);
    const model = this.models.get(def.key);
    const rig = this.models.get(RIG_KEY);
    if (!model || !rig) return null;
    const p = makeProto(model.scene, [], { height: 1.55 });
    const root = p.object; // one rider per skater, no cloning needed
    root.position.y = this.boardHeight * 0.55;
    root.visible = false;
    root.traverse((o) => {
      // Skinned bounds don't follow the animation.
      if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
    });
    // The clips move legs and torso to the Skate Boy's rest positions: shift them to this body's own.
    const rigRest = this.rigRest;
    const ownRest = def.key === RIG_KEY ? rigRest : restPose(model.scene);
    const torsoScale = (ownRest.get("torso")?.y ?? 1) / (rigRest.get("torso")?.y ?? 1);
    const clips = rig.animations.map((clip) => {
      if (ownRest === rigRest) return clip;
      const copy = clip.clone();
      for (const track of copy.tracks) {
        const [node, prop] = track.name.split(".");
        if (prop !== "position") continue;
        const from = rigRest.get(node);
        const to = ownRest.get(node);
        if (!from || !to) continue;
        const v = track.values;
        for (let i = 0; i < v.length; i += 3) {
          v[i] = to.x + (v[i] - from.x) * torsoScale;
          v[i + 1] = to.y + (v[i + 1] - from.y) * torsoScale;
          v[i + 2] = to.z + (v[i + 2] - from.z) * torsoScale;
        }
      }
      return copy;
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
    this.body.add(root);
    const rider: Rider = { root, mixer, actions, current: null, origin: { value: new THREE.Vector3() }, skin: null };
    this.riders.set(id, rider);
    return rider;
  }

  // --- Public API -------------------------------------------------------------------------------

  /** Shows a skater (downloading it first if needed). Used for the equipped one and shop previews. */
  async setSkater(id: string) {
    const def = findItem(SKATERS, id);
    this.loadout.skater = def.id;
    const ticket = ++this.request.skater;
    if (!this.models.has(def.key)) {
      this.events.busy?.({ label: def.name, ratio: 0 });
      const loaded = await loadModels([def.key], this.renderer, (p) => this.request.skater === ticket && this.events.busy?.({ label: def.name, ratio: p.ratio }));
      if (this.disposed) return;
      loaded.forEach((m, k) => this.models.set(k, m));
      if (this.request.skater === ticket) this.events.busy?.(null);
    }
    if (this.request.skater !== ticket || this.phase === "loading") return;
    this.showSkater(def.id);
  }

  private showSkater(id: string) {
    const rider = this.riders.get(id) ?? this.makeRider(id);
    if (!rider) return;
    this.loadout.skater = id;
    for (const [rid, r] of this.riders) r.root.visible = rid === id;
    this.applySkinTo(rider);
    rider.root.scale.set(1 + (1 - this.squash) * 0.25, this.squash, 1 + (1 - this.squash) * 0.25);
    if (this.phase === "menu" || this.phase === "loading") {
      this.play("emote-yes", { once: true, fade: 0.15 });
      this.queueIdle = 1.1;
    } else {
      // Mid-run (trailer): pick up the current move.
      this.play(this.grounded ? (this.duckT > 0 ? "crouch" : "skate") : "skate-air", { fade: 0 });
    }
  }

  setSkin(id: string) {
    this.loadout.skin = findItem(SKINS, id).id;
    const rider = this.riders.get(this.loadout.skater);
    if (rider) this.applySkinTo(rider);
  }

  private applySkinTo(rider: Rider) {
    const look = findItem(SKINS, this.loadout.skin).look;
    if (rider.skin === look) return;
    applySkin(rider.root, look, rider.origin);
    rider.skin = look;
  }

  setBoard(id: string) {
    const def = findItem(BOARDS, id);
    this.loadout.board = def.id;
    this.board?.setSkin(def);
    this.trail.kind = def.trail ?? null;
    this.trail.clear();
  }

  /** Switches the world to a stage (downloading its models first). Only from the menu. */
  async setStage(id: string) {
    const def = findItem(STAGES, id);
    this.loadout.stage = def.id;
    const ticket = ++this.request.stage;
    const missing = stageModels(def).filter((k) => !this.models.has(k));
    if (missing.length) {
      this.events.busy?.({ label: def.name, ratio: 0 });
      const loaded = await loadModels(missing, this.renderer, (p) => this.request.stage === ticket && this.events.busy?.({ label: def.name, ratio: p.ratio }));
      if (this.disposed) return;
      loaded.forEach((m, k) => this.models.set(k, m));
      if (this.request.stage === ticket) this.events.busy?.(null);
    }
    if (this.request.stage !== ticket || this.phase === "loading") return;
    if (def.id === this.stage.id && this.builtStages.has(def.id)) return;
    this.buildStage(def);
    this.applyStage(def);
    const inRun = this.phase !== "menu";
    this.resetWorld(inRun ? this.distance : 0);
  }

  get currentLoadout(): Loadout {
    return { ...this.loadout };
  }

  /**
   * What the menu camera frames, how far the 3D view is pushed aside for a panel (fractions of the
   * view) and how close the camera comes (below 1 = closer).
   */
  setShowcase(showcase: Showcase, shift: { x: number; y: number } = { x: 0, y: 0 }, zoom = 1) {
    this.showcase = showcase;
    this.zoom = zoom;
    this.viewShift.tx = shift.x;
    this.viewShift.ty = shift.y;
  }

  /** Stops every frame (YouTube's pause) — nothing runs until resumed. */
  setSuspended(on: boolean) {
    if (on === this.suspended || this.disposed) return;
    this.suspended = on;
    if (on) {
      cancelAnimationFrame(this.raf);
      this.sfx.rolling(0);
    } else {
      this.timer.reset();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  /** Starts a run (from the menu or after a game over). */
  start() {
    audio.unlock();
    if (this.phase === "over" || this.phase === "crashed" || this.phase === "paused") {
      this.resetWorld();
      this.camBlend = 1;
    }
    this.resetRun();
    this.play("skate", { fade: 0.3 });
    this.sfx.go();
    music.play(CITY_RUSH, 1);
    music.duck(false);
    this.setPhase("playing");
  }

  pause() {
    if (this.phase !== "playing") return;
    this.sfx.rolling(0);
    music.duck(true);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.resetWorld();
    this.resetRun();
    this.camBlend = 0;
    this.sfx.rolling(0);
    music.play(CITY_RUSH, 0);
    music.duck(false);
    this.play("idle", { fade: 0.2 });
    this.setPhase("menu");
  }

  input(move: Move) {
    if (this.phase !== "playing") return;
    if (move === "left" || move === "right") this.changeLane(move === "left" ? -1 : 1);
    else if (move === "jump") this.jump();
    else this.duck();
  }

  /** Runs the game this many seconds without drawing (trailer: skip ahead to busy traffic). */
  warp(seconds: number) {
    const step = 1 / 60;
    for (let t = 0; t < seconds && this.phase === "playing"; t += step) {
      this.updateRun(step);
      this.animatePickups(step);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    for (const proto of this.protos.values()) disposeTree(proto.object);
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

  // --- State ------------------------------------------------------------------------------------

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
  }

  private resetRun() {
    this.distance = 0;
    this.speed = 0;
    this.runTime = 0;
    this.lane = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.duckT = 0;
    this.duckQueued = false;
    this.points = 0;
    this.coins = 0;
    this.shield = false;
    this.magnet = 0;
    this.boost = 0;
    this.invulnerable = 0;
    this.crashT = 0;
    this.wobble = 0;
    this.track.position.z = 0;
    this.body.rotation.set(0, Math.PI, 0);
    this.boardPivot.position.set(0, this.boardHeight / 2, 0);
    this.boardPivot.rotation.set(0, 0, 0);
    this.player.position.set(0, 0, 0);
    this.trail.clear();
    this.setSquash(1);
    this.emitHud(true);
  }

  /** Clears the street and builds it again from `from` metres (0 = the start line). */
  private resetWorld(from = 0) {
    for (const s of this.scenery) s.parts.forEach((p) => this.pool.release(p.key, p.obj));
    for (const o of this.obstacles) this.releaseObstacle(o);
    for (const p of this.pickups) this.pool.release(p.part.key, p.part.obj);
    this.scenery = [];
    this.obstacles = [];
    this.pickups = [];
    this.rows = [];
    this.distance = from;
    this.track.position.z = from;
    const back = from - PREBUILD;
    const tile = Math.floor(back / ROAD_TILE) * ROAD_TILE;
    this.cursor = { road: tile, left: back, right: back, props: tile, row: from + FIRST_ROW, power: from + 320, ship: back };
    this.lastRowEnd = from + FIRST_ROW - 30;
    this.spawnAhead();
  }

  // --- Animation --------------------------------------------------------------------------------

  private play(name: string, { once = false, fade = 0.2, timeScale = 1 } = {}) {
    for (const rider of this.riders.values()) {
      const next = rider.actions.get(name);
      if (!next) continue;
      if (rider.current === next && !once) continue;
      next.reset();
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.timeScale = timeScale;
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (rider.current && rider.current !== next && fade > 0) next.crossFadeFrom(rider.current, fade, false);
      else if (rider.current && rider.current !== next) rider.current.stop();
      next.play();
      rider.current = next;
    }
  }

  // --- Controls ---------------------------------------------------------------------------------

  private blocked(lane: number) {
    const top = this.y + (this.duckT > 0 ? DUCK_H : STAND_H);
    return this.obstacles.some(
      (o) => !o.fly && o.lane === lane && Math.abs(this.distance - o.s) < o.halfLen + 0.5 && this.y + 0.08 < o.yMax && top > o.yMin,
    );
  }

  private changeLane(dir: -1 | 1) {
    const target = this.lane + dir;
    if (target < 0 || target > 2) {
      this.wobble = dir * 0.5;
      return;
    }
    if (this.blocked(target)) {
      // Side-swiping a car just bounces you back.
      this.wobble = dir * 0.9;
      this.shake = Math.max(this.shake, 0.25);
      this.sfx.bump();
      return;
    }
    this.lane = target;
    this.sfx.lane();
  }

  private get gravity() {
    return GRAVITY * this.rules.gravity;
  }

  private get jumpV() {
    return this.rules.gravity < 1 ? JUMP_V * 0.9 : JUMP_V;
  }

  private jump() {
    if (!this.grounded) return;
    this.grounded = false;
    this.vy = this.jumpV;
    this.airTime = 0;
    this.duckT = 0;
    this.duckQueued = false;
    this.trick = Math.random() < 0.6 ? "flip" : "spin";
    this.play(this.trick === "flip" ? "skate-air" : "skate-grab", { once: true, fade: 0.08 });
    this.sfx.jump();
  }

  private duck() {
    if (!this.grounded) {
      this.vy = Math.min(this.vy, SLAM_V);
      this.duckQueued = true;
      return;
    }
    if (this.duckT <= 0) this.sfx.duck();
    this.duckT = DUCK_TIME;
    this.play("crouch", { fade: 0.08 });
  }

  /** Autopilot: jump, duck or change lanes for what's coming, and follow the coins. */
  private drive(dt: number) {
    this.botCooldown -= dt;
    const v = Math.max(1, this.speed);
    const next = (lane: number) => {
      let best: { o: Obstacle; t: number } | null = null;
      for (const o of this.obstacles) {
        if (o.fly || o.lane !== lane) continue;
        const gap = o.s - o.halfLen - this.distance;
        if (gap < -o.halfLen * 2 - 0.5) continue;
        const t = Math.max(0, gap) / (v + o.speed);
        if (t < 3 && (!best || t < best.t)) best = { o, t };
      }
      return best;
    };
    const here = next(this.lane);
    if (here) {
      if (here.o.action === "jump" && this.grounded && here.t < 0.26) return this.jump();
      if (here.o.action === "duck" && this.grounded && here.t < 0.36 && this.duckT < 0.25) return this.duck();
    }
    if (this.botCooldown > 0) return;
    // Danger per lane: seconds until a blocking obstacle (more is better), then coins ahead.
    const danger = (lane: number) => {
      const n = next(lane);
      return n && n.o.action === "block" ? n.t : n && n.t < 0.12 ? 0.5 : 9;
    };
    const coinsIn = (lane: number) => this.pickups.filter((p) => p.taken < 0 && Math.abs(p.x - laneX(lane)) < 0.5 && p.s > this.distance && p.s < this.distance + 30).length;
    let target = this.lane;
    let bestScore = -Infinity;
    for (let lane = 0; lane <= 2; lane++) {
      const steps = Math.abs(lane - this.lane);
      // Two lanes over means passing through the middle one: only if it stays clear long enough.
      if (steps === 2 && danger(1) < 0.55) continue;
      const d = Math.min(danger(lane), 2.5);
      const score = d * 10 + coinsIn(lane) * 0.4 - steps * 0.6;
      if (score > bestScore) {
        bestScore = score;
        target = lane;
      }
    }
    if (target !== this.lane && !this.blocked(target)) {
      this.changeLane(target < this.lane ? -1 : 1);
      this.botCooldown = 0.18;
    }
  }

  // --- Frame ------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed || this.suspended) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);

    if (this.phase === "playing") this.updateRun(dt);
    else if (this.phase === "crashed") this.updateCrash(dt);
    else if (this.phase === "menu") this.updateMenu(dt);

    if (this.phase !== "paused") {
      this.elapsed += dt;
      shaderTime.value = this.elapsed;
      shaderDistance.value = this.distance;
      const rider = this.riders.get(this.loadout.skater);
      rider?.mixer.update(dt);
      rider?.root.getWorldPosition(rider.origin.value);
      this.board?.update(dt);
      this.updateBoardShowcase(dt);
      this.animatePickups(dt);
      this.animateOrbs(dt);
      this.updateTrail(dt);
    }
    if (this.phase !== "loading" && this.phase !== "error") {
      this.updateCamera(this.phase === "paused" ? 0 : dt);
      this.skyAnchor.position.copy(this.camera.position);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private readonly tail = new THREE.Vector3();
  /** 0..1: the Boards tab lifts the board up on its own, turning and tilted towards the camera. */
  private boardShow = 0;

  private updateBoardShowcase(dt: number) {
    const menu = this.phase === "menu";
    this.boardShow = damp(this.boardShow, menu && this.showcase === "board" ? 1 : 0, 6, dt);
    const k = menu ? this.boardShow : 0;
    const rider = this.riders.get(this.loadout.skater);
    if (rider) rider.root.visible = k < 0.5;
    if (!menu) return;
    this.boardPivot.position.set(0, this.boardHeight / 2 + ease(k) * 0.8, 0);
    this.boardPivot.rotation.set(ease(k) * 1.05, k > 0.01 ? this.elapsed * 0.9 : 0, 0);
  }

  private updateTrail(dt: number) {
    const hover = this.board?.board?.art === "hover";
    // Hoverboards float a little above the street.
    const lift = hover ? 0.22 + Math.sin(this.elapsed * 3) * 0.04 : 0;
    this.body.position.y = damp(this.body.position.y, lift, 10, dt);
    const riding = this.phase === "playing" || (this.phase === "menu" && this.showcase === "board");
    this.boardPivot.localToWorld(this.tail.set(0, -0.02, -0.6));
    this.trail.update(dt, this.tail, riding && this.trail.kind !== null, this.phase === "playing" ? this.speed : this.phase === "menu" ? 3 : 0);
  }

  private updateMenu(dt: number) {
    if (this.queueIdle > 0) {
      this.queueIdle -= dt;
      if (this.queueIdle <= 0) this.play("idle", { fade: 0.3 });
    } else if (!this.riders.get(this.loadout.skater)?.current) {
      this.play("idle", { fade: 0 });
    }
  }

  private speedAt(s: number) {
    return baseSpeedAt(s) * this.rules.speed;
  }

  private updateRun(dt: number) {
    if (this.autopilot) this.drive(dt);
    this.runTime += dt;
    const target = this.speedAt(this.distance);
    this.speed = Math.min(target, this.speed + dt * 30);
    this.distance += this.speed * dt;
    this.track.position.z = this.distance;
    const multiplier = this.boost > 0 ? 2 : 1;
    this.points += this.speed * dt * 0.5 * multiplier;

    // Vertical motion.
    if (!this.grounded) {
      this.airTime += dt;
      this.vy -= this.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.sfx.land();
        this.shake = Math.max(this.shake, 0.08);
        if (this.duckQueued) {
          this.duckQueued = false;
          this.duck();
        } else this.play("skate", { fade: 0.12 });
      }
    }
    if (this.duckT > 0) {
      this.duckT -= dt;
      if (this.duckT <= 0 && this.grounded) this.play("skate", { fade: 0.15 });
    }

    // Lane position and body lean (icy stages: less grip, the board slides over).
    const tx = laneX(this.lane);
    this.x = damp(this.x, tx, 15 * this.rules.grip, dt);
    this.wobble = damp(this.wobble, 0, 8, dt);
    this.player.position.set(this.x + this.wobble * 0.35, this.y, 0);
    const lean = THREE.MathUtils.clamp((tx - this.x) * 0.16 + this.wobble * 0.25, -0.35, 0.35);
    this.body.rotation.z = damp(this.body.rotation.z, lean, 14, dt);

    // Tricks: kickflip (board rolls) or a 360 spin (whole body).
    const airProgress = this.grounded ? 1 : Math.min(1, this.airTime / ((2 * this.jumpV) / this.gravity));
    const t = ease(airProgress);
    this.boardPivot.rotation.z = !this.grounded && this.trick === "flip" ? t * Math.PI * 2 : 0;
    this.body.rotation.y = Math.PI + (!this.grounded && this.trick === "spin" ? t * Math.PI * 2 : 0);

    // Ducking squashes the rider on top of the crouch animation, so it clearly fits under a gate bar.
    this.setSquash(damp(this.squash, this.duckT > 0 ? 0.62 : 1, 22, dt));

    // Power-up timers.
    this.magnet = Math.max(0, this.magnet - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    this.updateObstacles(dt);
    this.collectPickups(dt);
    this.spawnAhead();
    this.cleanup();
    this.sfx.rolling(this.grounded ? 0.35 + (0.65 * this.speed) / MAX_SPEED : 0);
    music.setIntensity(this.speed > 25 ? 2 : 1);
    this.emitHud();
  }

  private updateCrash(dt: number) {
    this.crashT += dt;
    this.speed = damp(this.speed, 0, 5, dt);
    this.distance += this.speed * dt;
    this.track.position.z = this.distance;
    if (!this.grounded || this.y > 0) {
      this.vy -= this.gravity * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.grounded = true;
    }
    this.player.position.y = this.y;
    // The board shoots forward and tumbles.
    const b = this.boardPivot;
    this.boardFly.vy -= GRAVITY * dt;
    b.position.y += this.boardFly.vy * dt;
    b.position.z += this.boardFly.vz * dt;
    this.boardFly.vz = damp(this.boardFly.vz, 0, 2, dt);
    if (b.position.y < this.boardHeight / 2) {
      b.position.y = this.boardHeight / 2;
      this.boardFly.vy = Math.abs(this.boardFly.vy) * 0.35;
    } else {
      b.rotation.x += dt * 9;
      b.rotation.z += dt * 5;
    }
    this.updateObstacles(dt);
    if (this.crashT > 1.5 && this.phase === "crashed") {
      this.setPhase("over");
      this.events.over({ score: Math.floor(this.points), coins: this.coins, distance: Math.floor(this.distance) });
    }
  }

  private squash = 1;

  private setSquash(value: number) {
    this.squash = value;
    for (const r of this.riders.values()) r.root.scale.set(1 + (1 - value) * 0.25, value, 1 + (1 - value) * 0.25);
  }

  private crash() {
    this.setPhase("crashed");
    this.crashT = 0;
    this.shake = 0.7;
    this.duckT = 0;
    this.sfx.crash();
    this.sfx.rolling(0);
    music.setIntensity(0);
    this.body.rotation.y = Math.PI;
    this.boardPivot.rotation.set(0, 0, 0);
    this.boardFly = { vy: 7, vz: 9 };
    this.setSquash(1);
    this.play("die", { once: true, fade: 0.08 });
    this.emitHud(true);
  }

  // --- Camera -----------------------------------------------------------------------------------

  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly gamePos = new THREE.Vector3();
  private readonly gameLook = new THREE.Vector3();

  private updateCamera(dt: number) {
    const inRun = this.phase !== "menu";
    this.camBlend = THREE.MathUtils.clamp(this.camBlend + (inRun ? dt : -dt) * 1.1, 0, 1);
    const k = ease(this.camBlend);
    const speedT = this.speed / MAX_SPEED;

    // Menu: a slow swing in front of the rider (closer in the shop). Run: chase cam behind and above.
    const a = Math.sin(this.elapsed * 0.35) * 0.45 + 0.35;
    const preset = this.preset;
    const want = this.tmpPos;
    const wantLook = this.tmpLook;
    if (this.showcase === "stage") {
      want.set(3.2 + Math.sin(this.elapsed * 0.2) * 1.2, 4.6, 7.5);
      wantLook.set(0, 1.6, -24);
    } else if (this.showcase === "board") {
      const r = (this.portrait ? 4 : 3.1) * this.zoom;
      want.set(Math.sin(a) * r, 1.3, -Math.cos(a) * r);
      wantLook.set(0, 0.8, 0);
    } else if (this.showcase === "skater") {
      const r = (this.portrait ? 4.9 : 3.4) * this.zoom;
      want.set(Math.sin(a) * r, 0.9 + 0.3 * this.zoom, -Math.cos(a) * r);
      wantLook.set(0, 0.78, 0);
    } else {
      want.set(Math.sin(a) * 4.4, 1.3, -Math.cos(a) * 4.4);
      wantLook.set(0, 0.7, 0);
    }
    if (!preset.ready || dt === 0) {
      preset.pos.copy(want);
      preset.look.copy(wantLook);
      preset.ready = true;
    } else {
      preset.pos.lerp(want, 1 - Math.exp(-3.5 * dt));
      preset.look.lerp(wantLook, 1 - Math.exp(-3.5 * dt));
    }
    const menuPos = this.tmpPos.copy(preset.pos);
    const menuLook = this.tmpLook.copy(preset.look);
    const back = this.portrait ? 8.6 : 6.6;
    this.gamePos.set(this.x * 0.55, (this.portrait ? 4.2 : 3.5) + this.y * 0.35, back + speedT * 0.8);
    this.gameLook.set(this.x * 0.7, 1.15 + this.y * 0.25, -8);
    menuPos.lerp(this.gamePos, k);
    menuLook.lerp(this.gameLook, k);
    // Swing out to the side on the way between the two, instead of passing through the rider.
    const arc = Math.sin(k * Math.PI);
    menuPos.x += arc * 4.5;
    menuPos.y += arc * 0.9;
    if (dt === 0 || this.camPos.lengthSq() === 0) {
      this.camPos.copy(menuPos);
      this.camLook.copy(menuLook);
    } else {
      this.camPos.lerp(menuPos, 1 - Math.exp(-12 * dt));
      this.camLook.lerp(menuLook, 1 - Math.exp(-12 * dt));
    }

    this.shake = damp(this.shake, 0, 6, dt);
    const s = this.shake;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * s, this.camPos.y + (Math.random() - 0.5) * s, this.camPos.z);
    this.camera.lookAt(this.camLook);
    const fov = (this.portrait ? 72 : 58) + k * speedT * 8;
    let dirty = false;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      dirty = true;
    }
    // Shop panels cover part of the screen: slide the 3D view so the item stays in the open part.
    const vs = this.viewShift;
    const menu = this.phase === "menu" ? 1 : 0;
    const sx = damp(vs.x, vs.tx * menu, 6, dt || 1);
    const sy = damp(vs.y, vs.ty * menu, 6, dt || 1);
    if (Math.abs(sx - vs.x) > 1e-5 || Math.abs(sy - vs.y) > 1e-5 || dirty) {
      vs.x = sx;
      vs.y = sy;
      const { width, height } = this.renderer.domElement;
      if (Math.abs(sx) < 1e-4 && Math.abs(sy) < 1e-4) this.camera.clearViewOffset();
      else this.camera.setViewOffset(width, height, -sx * width, sy * height, width, height);
      this.camera.updateProjectionMatrix();
    }
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.85;
    if (this.camera.view?.enabled) {
      const { width, height } = this.renderer.domElement;
      this.camera.setViewOffset(width, height, -this.viewShift.x * width, this.viewShift.y * height, width, height);
    }
    this.camera.updateProjectionMatrix();
  }

  // --- Track generation -------------------------------------------------------------------------

  private sk(key: string) {
    return `${this.stage.id}|${key}`;
  }

  private size(key: string) {
    return this.protos.get(key)!.size;
  }

  private place(key: string, x: number, s: number, y = 0, rotY = 0): Part {
    const obj = this.pool.get(key);
    obj.position.set(x, y, -s);
    obj.rotation.y = rotY;
    return { key, obj };
  }

  private zoneAt(s: number) {
    const zones = this.stage.zones;
    return zones[Math.floor((s + PREBUILD + 60) / ZONE_LEN) % zones.length];
  }

  private spawnAhead() {
    const limit = this.distance + AHEAD;
    while (this.cursor.road < limit) this.spawnRoad();
    while (this.cursor.left < limit) this.spawnBuilding(-1);
    while (this.cursor.right < limit) this.spawnBuilding(1);
    while (this.cursor.props < limit) this.spawnProps();
    while (this.cursor.row < limit) this.spawnRow();
    if (this.stage.look.water?.ships) while (this.cursor.ship < limit) this.spawnShip();
  }

  private cleanup() {
    const behind = this.distance - BEHIND;
    this.scenery = this.scenery.filter((s) => {
      if (s.end >= behind) return true;
      s.parts.forEach((p) => this.pool.release(p.key, p.obj));
      return false;
    });
    this.obstacles = this.obstacles.filter((o) => {
      if (o.s + o.halfLen >= behind && (!o.fly || o.fly.t < 1.2)) return true;
      this.releaseObstacle(o);
      return false;
    });
    this.rows = this.rows.filter((r) => r.end > this.distance - 60);
  }

  private spawnRoad() {
    const s = this.cursor.road;
    const mid = s + ROAD_TILE / 2;
    const walkX = ROAD_W / 2 + WALK_W / 2;
    const road = this.sk("road");
    const walk = this.sk("walk");
    const walkY = WALK_H - this.size(walk).y;
    const parts = [this.place(road, 0, mid, -this.size(road).y), this.place(walk, -walkX, mid, walkY), this.place(walk, walkX, mid, walkY)];
    if (this.stage.look.neonKerbs) {
      parts.push(this.place("kerb-a", -ROAD_W / 2 + 0.2, mid, 0.01), this.place("kerb-b", ROAD_W / 2 - 0.2, mid, 0.01));
    }
    this.scenery.push({ end: s + ROAD_TILE, parts });
    this.cursor.road += ROAD_TILE;
  }

  private spawnBuilding(side: -1 | 1) {
    const which = side < 0 ? "left" : "right";
    const s0 = this.cursor[which];
    const face = side < 0 ? Math.PI / 2 : -Math.PI / 2; // front (+z) turned towards the road
    const zone = this.zoneAt(s0);
    const parts: Part[] = [];
    const key = this.sk(placedKey(pick(zone.buildings)));
    if (!this.protos.has(key)) {
      this.cursor[which] = s0 + 6;
      return;
    }
    const size = this.size(key);
    const len = size.x;
    const gap = rand(zone.gap[0], zone.gap[1]);
    parts.push(this.place(key, side * (BUILD_X + (zone.setback ?? 0) + size.z / 2), s0 + len / 2, 0, face));
    if (zone.back && Math.random() < zone.back.chance) {
      const tower = this.sk(placedKey(pick(zone.back.items)));
      if (this.protos.has(tower)) parts.push(this.place(tower, side * (BUILD_X + rand(zone.back.from, zone.back.to)), s0 + rand(0, len), 0, face));
    }
    if (zone.gapFill && gap > 2.5) {
      const fill = this.sk(placedKey(pick(zone.gapFill)));
      if (this.protos.has(fill)) parts.push(this.place(fill, side * (BUILD_X + rand(0.5, 6)), s0 + len + gap / 2, 0, rand(0, Math.PI * 2)));
    }
    this.scenery.push({ end: s0 + len + gap + 40, parts });
    this.cursor[which] = s0 + len + gap;
  }

  private spawnProps() {
    const s = this.cursor.props;
    const step = 26;
    const parts: Part[] = [];
    const edge = ROAD_W / 2 + 0.6;
    const inner = ROAD_W / 2 + WALK_W - 1.1;
    const zone = this.zoneAt(s);
    const look = this.stage.look;
    const lamp = this.sk("lamp");
    for (const side of [-1, 1] as const) {
      const at = s + (side < 0 ? 0 : step / 2);
      if (this.stage.lamp && this.protos.has(lamp)) {
        parts.push(this.place(lamp, side * edge, at, WALK_H, side < 0 ? 0 : Math.PI));
        if (look.lampGlow) {
          const glow = this.place("lamp-glow", side * (edge - 0.7), at, 0, 0);
          const h = this.size(lamp).y;
          const halo = glow.obj.getObjectByName("halo") as THREE.Sprite;
          const pool = glow.obj.getObjectByName("pool") as THREE.Mesh;
          halo.position.set(0, WALK_H + h - 0.45, 0);
          (halo.material as THREE.SpriteMaterial).color.set(look.lampGlow);
          pool.position.set(-side * 1.4, 0.03, 0);
          (pool.material as THREE.MeshBasicMaterial).color.set(look.lampGlow);
          parts.push(glow);
        }
      }
      if (Math.random() < 0.7 && zone.extras.length) {
        const p = pick(zone.extras);
        const extra = this.sk(placedKey(p));
        if (this.protos.has(extra)) {
          const bench = p.key.endsWith("/bench");
          const rot = bench ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : rand(0, Math.PI * 2);
          parts.push(this.place(extra, side * (bench ? inner + 0.4 : inner), at + rand(5, 9), WALK_H, rot));
        }
      }
    }
    const light = this.sk("traffic-light");
    if (this.stage.trafficLights && Math.floor(s / step) % 9 === 4 && this.protos.has(light)) {
      parts.push(this.place(light, -edge, s + 6, WALK_H, 0));
      parts.push(this.place(light, edge, s + 6, WALK_H, Math.PI));
    }
    this.scenery.push({ end: s + step, parts });
    this.cursor.props += step;
  }

  /** Ships out at sea (beach stages). */
  private spawnShip() {
    const s = this.cursor.ship;
    const water = this.stage.look.water!;
    const ship = this.sk(placedKey(pick(water.ships!)));
    if (this.protos.has(ship)) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const part = this.place(ship, side * (water.from + rand(16, 42)), s, -0.6, rand(0, Math.PI * 2));
      this.scenery.push({ end: s + 60, parts: [part] });
    }
    this.cursor.ship = s + rand(70, 140);
  }

  /** Builds one obstacle; `s` is its near edge. Returns it so the caller knows its length. */
  private addObstacle(kind: ObKind, lane: number, s: number, opts: { car?: string; speed?: number } = {}): Obstacle {
    const holder = new THREE.Group();
    this.track.add(holder);
    const parts: Part[] = [];
    const add = (key: string, x = 0, y = 0, z = 0, rotY = 0) => {
      const obj = this.pool.get(key, holder);
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      parts.push({ key, obj });
      return obj;
    };
    const barrier = this.sk("barrier");
    const fence = this.sk("fence");
    const cone = this.sk("cone");
    const gate = this.sk("gate");
    let halfLen = 0.3;
    let halfW = 1.1;
    let yMin = 0;
    let yMax = 0.9;
    let action: Action = "jump";
    if (kind === "fence" && this.protos.has(fence)) {
      add(fence, 0, 0, 0, Math.PI / 2);
      yMax = this.size(fence).y;
    } else if (kind === "cones" && this.protos.has(cone)) {
      // Wide pieces (rocks, barrels) come in twos.
      const w = this.size(cone).x;
      const xs = w > 1.0 ? [-0.6, 0.6] : [-0.8, 0, 0.8];
      for (const dx of xs) add(cone, dx, 0, rand(-0.15, 0.15), rand(0, Math.PI));
      yMax = Math.max(0.8, this.size(cone).y);
    } else if (kind === "gate" && this.protos.has(gate)) {
      add(gate);
      add(this.sk("gate-bar"), 0, 1.12, 0);
      action = "duck";
      halfW = 1.25;
      halfLen = 0.25;
      yMin = 1.08;
      yMax = 6;
    } else if (kind === "car" && this.cars.length) {
      const key = opts.car ?? pick(this.cars);
      const size = this.size(key);
      // Oncoming traffic faces the player; parked cars face either way.
      add(key, 0, 0, 0, opts.speed || Math.random() < 0.5 ? 0 : Math.PI);
      action = "block";
      halfLen = size.z / 2 - 0.15;
      halfW = size.x / 2 - 0.1;
      yMax = size.y;
    } else {
      // The barrier (or a missing optional model's stand-in).
      add(barrier);
      halfLen = this.size(barrier).z / 2;
      yMax = this.size(barrier).y;
    }
    const ob: Obstacle = { holder, parts, action, lane, x: laneX(lane), s: s + halfLen, halfLen, halfW, yMin, yMax, speed: opts.speed ?? 0, fly: null };
    holder.position.set(ob.x, 0, -ob.s);
    this.obstacles.push(ob);
    return ob;
  }

  private releaseObstacle(o: Obstacle) {
    o.parts.forEach((p) => this.pool.release(p.key, p.obj));
    o.holder.removeFromParent();
    o.holder.position.set(0, 0, 0);
    o.holder.rotation.set(0, 0, 0);
  }

  private addPickup(kind: PickupKind, x: number, s: number, y: number) {
    const key = kind === "coin" ? M.coin : kind === "shield" ? M.heart : kind === "magnet" ? M.star : M.jewel;
    if (!this.protos.has(key)) return;
    const part = this.place(key, x, s, y);
    part.obj.rotation.y = s * 0.35; // coins in a line spin in a wave
    this.pickups.push({ part, kind, s, x, y, attract: false, taken: -1 });
  }

  private coinLine(lane: number, from: number, to: number) {
    for (let s = from; s <= to; s += 2.6) this.addPickup("coin", laneX(lane), s, 0.5);
  }

  private canSendTraffic(lane: number, sCar: number, carSpeed: number) {
    if (this.obstacles.some((o) => o.lane === lane && o.s + o.halfLen > this.distance - 2 && o.s - o.halfLen < sCar + 8)) return false;
    // Where the car will meet the player: make sure nothing there forces the player into its lane.
    const v = this.speedAt(this.distance);
    const meet = this.distance + (v * (sCar - this.distance)) / (v + carSpeed);
    return !this.rows.some((r) => r.end > meet - 30 && r.s < meet + 30 && !r.passable.some((p, i) => p && i !== lane));
  }

  private spawnRow() {
    const s = this.cursor.row;
    const d = Math.min(1, s / 3200);
    const placed: (Obstacle[] | null)[] = [null, null, null];
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const passableKind = (): ObKind => pick(["barrier", "barrier", "fence", "cones", "gate", "gate"] as const);
    const anyKind = (): ObKind => (Math.random() < 0.45 + d * 0.15 ? "car" : passableKind());
    let breather = false;

    const weights: [string, number][] = [
      ["single", 1.1 - d * 0.6],
      ["double", 0.9 + d * 0.4],
      ["triple", 0.15 + d * 0.7],
      ["train", 0.35 + d * 0.35],
      ["traffic", s > 250 ? 0.3 + d * 0.4 : 0],
      ["breather", 0.3 - d * 0.15],
    ];
    let r = Math.random() * weights.reduce((n, [, w]) => n + w, 0);
    const pattern = weights.find(([, w]) => (r -= w) < 0)?.[0] ?? "single";

    if (pattern === "single") {
      placed[lanes[0]] = [this.addObstacle(anyKind(), lanes[0], s)];
    } else if (pattern === "double") {
      placed[lanes[0]] = [this.addObstacle(anyKind(), lanes[0], s)];
      placed[lanes[1]] = [this.addObstacle(anyKind(), lanes[1], s)];
    } else if (pattern === "triple") {
      placed[lanes[0]] = [this.addObstacle(passableKind(), lanes[0], s)];
      placed[lanes[1]] = [this.addObstacle(anyKind(), lanes[1], s)];
      placed[lanes[2]] = [this.addObstacle(Math.random() < 0.7 ? "car" : passableKind(), lanes[2], s)];
    } else if (pattern === "train") {
      const count = 2 + Math.floor(Math.random() * (1 + d * 2));
      const train: Obstacle[] = [];
      let at = s;
      for (let i = 0; i < count; i++) {
        const car = this.addObstacle("car", lanes[0], at);
        train.push(car);
        at += car.halfLen * 2 + 1.4;
      }
      placed[lanes[0]] = train;
      if (Math.random() < 0.3 + d * 0.5) placed[lanes[1]] = [this.addObstacle(passableKind(), lanes[1], s + rand(0, at - s))];
    } else if (pattern === "traffic") {
      const carSpeed = rand(7, 11 + d * 5);
      if (this.canSendTraffic(lanes[0], s, carSpeed)) {
        placed[lanes[0]] = [this.addObstacle("car", lanes[0], s, { speed: carSpeed })];
        if (Math.random() < 0.5) placed[lanes[1]] = [this.addObstacle(passableKind(), lanes[1], s)];
      } else placed[lanes[0]] = [this.addObstacle(passableKind(), lanes[0], s)];
    } else breather = true;

    const end = Math.max(s + 1, ...placed.flatMap((list) => (list ?? []).filter((o) => !o.speed).map((o) => o.s + o.halfLen)));
    const passable = placed.map((list) => !list || list.every((o) => o.action !== "block"));
    this.rows.push({ s, end, passable });

    // Coins: a trail leading into a safe lane, arcing over jump obstacles and sliding under gates.
    const from = Math.max(this.lastRowEnd + 4, s - 34);
    if (breather) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        const lanePos = 1 + dir * Math.sin(t * Math.PI * 2) * 1;
        this.addPickup("coin", (lanePos - 1) * LANE_W, s + i * 2.4, 0.5);
      }
    } else {
      const options = [0, 1, 2].filter((l) => passable[l] && !placed[l]?.some((o) => o.speed));
      const coinLane = options.length ? pick(options) : 1;
      const obstacle = placed[coinLane]?.[0];
      const powerHere = s > this.cursor.power;
      const trailEnd = obstacle ? obstacle.s - 5 : end + 4;
      if (powerHere) {
        const mid = (from + trailEnd) / 2;
        this.coinLine(coinLane, from, mid - 4);
        this.addPickup(pick(["shield", "magnet", "boost"] as const), laneX(coinLane), mid, 0.45);
        this.coinLine(coinLane, mid + 4, trailEnd);
        this.cursor.power = s + rand(420, 720);
      } else if (trailEnd - from > 4) this.coinLine(coinLane, from, trailEnd);
      if (obstacle?.action === "jump") {
        const peak = 1.7 * (this.jumpV * this.jumpV) / (JUMP_V * JUMP_V) / this.rules.gravity;
        for (let i = -2; i <= 2; i++) {
          const u = i / 2.5;
          this.addPickup("coin", laneX(coinLane), obstacle.s + i * 2.2, 0.5 + peak * (1 - u * u));
        }
      } else if (obstacle?.action === "duck") {
        for (const ds of [-1.6, 0, 1.6]) this.addPickup("coin", laneX(coinLane), obstacle.s + ds, 0.12);
      }
    }

    const gap = Math.max(15, this.speedAt(s) * (1.45 - d * 0.6));
    this.lastRowEnd = breather ? s + 34 : end;
    this.cursor.row = this.lastRowEnd + gap;
  }

  // --- Per-frame entity updates -----------------------------------------------------------------

  private updateObstacles(dt: number) {
    const top = this.y + (this.duckT > 0 ? DUCK_H : STAND_H);
    for (const o of this.obstacles) {
      if (o.fly) {
        // Smashed by the shield: tumble away.
        o.fly.t += dt;
        o.fly.vy -= GRAVITY * 0.6 * dt;
        o.s += (this.speed + 6) * dt;
        o.holder.position.set(o.holder.position.x + o.fly.vx * dt, o.holder.position.y + o.fly.vy * dt, -o.s);
        o.holder.rotation.x += o.fly.spin.x * dt;
        o.holder.rotation.z += o.fly.spin.z * dt;
        continue;
      }
      if (o.speed) {
        o.s -= o.speed * dt;
        o.holder.position.z = -o.s;
        // Oncoming cars sweep up coins in their lane.
        for (const p of this.pickups) {
          if (p.taken < 0 && !p.attract && Math.abs(p.x - o.x) < 1 && Math.abs(p.s - o.s) < o.halfLen) {
            p.taken = 0.2;
            p.part.obj.visible = false;
          }
        }
      }
      if (this.phase !== "playing") continue;
      const dz = Math.abs(this.distance - o.s);
      if (dz > o.halfLen + 0.45 || Math.abs(o.x - this.x) > o.halfW + 0.38) continue;
      if (this.y + 0.08 > o.yMax || top < o.yMin) continue;
      if (this.invulnerable > 0) continue;
      if (this.shield || this.invincible) {
        if (!this.invincible) this.shield = false;
        this.invulnerable = 1.2;
        this.shake = 0.4;
        this.sfx.shieldBreak();
        o.fly = { t: 0, vy: 9, vx: rand(-4, 4), spin: new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6)) };
        continue;
      }
      this.crash();
      return;
    }
  }

  private collectPickups(dt: number) {
    const top = this.y + (this.duckT > 0 ? DUCK_H : STAND_H);
    for (const p of this.pickups) {
      if (p.taken >= 0) continue;
      const ahead = p.s - this.distance;
      if (this.magnet > 0 && p.kind === "coin" && ahead < 22 && ahead > -1) p.attract = true;
      if (p.attract) {
        p.s = damp(p.s, this.distance, 10, dt);
        p.x = damp(p.x, this.x, 10, dt);
        p.y = damp(p.y, this.y + 0.5, 10, dt);
        p.part.obj.position.set(p.x, p.y, -p.s);
      }
      if (Math.abs(ahead) > 1 || Math.abs(p.x - this.x) > 1.05 || p.y > top + 0.1 || p.y + 0.75 < this.y) continue;
      p.taken = 0;
      if (p.kind === "coin") {
        this.coins++;
        this.points += COIN_POINTS * (this.boost > 0 ? 2 : 1);
        this.sfx.coin();
      } else {
        this.sfx.power();
        if (p.kind === "shield") this.shield = true;
        else if (p.kind === "magnet") this.magnet = POWER_TIME;
        else this.boost = POWER_TIME;
      }
    }
  }

  private animatePickups(dt: number) {
    const behind = this.distance - 8;
    this.pickups = this.pickups.filter((p) => {
      const obj = p.part.obj;
      if (p.taken >= 0) {
        p.taken += dt;
        const k = Math.max(0, 1 - p.taken / 0.18);
        obj.scale.setScalar(k * (1 + p.taken * 4));
        obj.position.y += dt * 6;
        if (p.taken < 0.18) return true;
      } else if (p.s >= behind) {
        obj.rotation.y += dt * (p.kind === "coin" ? 4 : 2);
        if (p.kind !== "coin") obj.position.y = p.y + Math.sin(this.elapsed * 3 + p.s) * 0.15;
        return true;
      }
      this.pool.release(p.part.key, obj);
      return false;
    });
  }

  private animateOrbs(dt: number) {
    const t = this.elapsed;
    const { shield, magnet, boost } = this.orbs;
    const running = this.phase === "playing" || this.phase === "paused";
    shield.visible = running && this.shield && (this.invulnerable <= 0 || Math.floor(t * 12) % 2 === 0);
    magnet.visible = running && this.magnet > 0 && (this.magnet > 2 || Math.floor(t * 8) % 2 === 0);
    boost.visible = running && this.boost > 0 && (this.boost > 2 || Math.floor(t * 8) % 2 === 0);
    shield.position.set(Math.cos(t * 3) * 0.9, 1.0, Math.sin(t * 3) * 0.9);
    magnet.position.set(Math.cos(t * 3 + Math.PI) * 0.9, 1.3, Math.sin(t * 3 + Math.PI) * 0.9);
    boost.position.set(0, 2.05 + Math.sin(t * 4) * 0.08, 0);
    shield.rotation.y += dt * 3;
    magnet.rotation.y += dt * 3;
    boost.rotation.y += dt * 2;
  }

  private emitHud(force = false) {
    const next: Hud = {
      score: Math.floor(this.points),
      coins: this.coins,
      distance: Math.floor(this.distance),
      shield: this.shield,
      magnet: Math.ceil(this.magnet * 10) / 10,
      boost: Math.ceil(this.boost * 10) / 10,
    };
    const h = this.hud;
    if (
      !force &&
      h.score === next.score &&
      h.coins === next.coins &&
      h.distance === next.distance &&
      h.shield === next.shield &&
      h.magnet === next.magnet &&
      h.boost === next.boost
    )
      return;
    this.hud = next;
    this.events.hud(next);
  }
}

function restPose(scene: THREE.Object3D) {
  const map = new Map<string, THREE.Vector3>();
  scene.traverse((o) => map.set(o.name, o.position.clone()));
  return map;
}

let stripeTex: THREE.Texture | null = null;

/** Horizontal fade (bright in the middle) for the light a neon kerb spills on the road. */
function stripeTexture() {
  if (stripeTex) return stripeTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 4;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 4);
  stripeTex = new THREE.CanvasTexture(c);
  return stripeTex;
}
