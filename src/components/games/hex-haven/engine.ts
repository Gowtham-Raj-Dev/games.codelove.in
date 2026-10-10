import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, type LoadedModel, type LoadProgress } from "../shared/assets";
import { music } from "../shared/music";
import { HEX_AMBIENT } from "../shared/songs";
import { Sfx } from "./audio";
import { HexLogic, type Fit, type PlaceResult, type Quest, type QuestSpec } from "./logic";
import { MODELS } from "./manifest";
import { CATEGORY_LABEL, KINDS, PROPS, cellToWorld, neighbor, worldToCell, type Category } from "./tiles";

// --- Tuning (1 unit = one tile across the flats) ------------------------------------------------

/** Top of a meadow tile. */
const TILE_TOP = 0.2;
const SEA_Y = -0.07;
const GHOST_LIFT = 0.34;
const DROP_FALL = 0.24;
const MIN_DIST = 3.2;
const MAX_DIST = 26;
const MAX_SPOTS = 400;
const DEMO_TILES = 34;

const SKY_TOP = new THREE.Color("#6fb6e6");
const HORIZON = new THREE.Color("#d4ecf3");
const SEA = new THREE.Color("#4aa8d8");
const EMERALD = new THREE.Color("#34d399");

export const CATEGORY_COLOR: Record<Category, string> = {
  forest: "#22c55e",
  village: "#f59e0b",
  lake: "#38bdf8",
  river: "#3b82f6",
  road: "#f97316",
  field: "#eab308",
  stone: "#a5b4fc",
  sand: "#fbbf24",
};

const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// --- Public types -------------------------------------------------------------------------------

export type Phase = "loading" | "menu" | "playing" | "paused" | "over" | "error";

export interface HandView {
  kind: string;
  name: string;
  quest: QuestSpec | null;
}

export interface QuestView {
  id: number;
  cat: Category;
  target: number;
  progress: number;
  rewardTiles: number;
}

export interface Hud {
  score: number;
  remaining: number;
  placed: number;
  hand: HandView[];
  /** Rotation of the tile preview on screen, degrees clockwise (continuous, so CSS can animate). */
  angle: number;
  quests: QuestView[];
  canUndo: boolean;
  /** Touch: a spot is selected and can be confirmed. */
  selected: boolean;
  preview: { points: number; valid: boolean; perfect: boolean; flawless: boolean } | null;
}

export type PopupTone = "points" | "perfect" | "quest" | "fail" | "info";

export interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  sub?: string;
  tone: PopupTone;
}

export interface GameResult {
  score: number;
  placed: number;
  perfects: number;
  quests: number;
  forest: number;
  village: number;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  error(message: string): void;
  over(result: GameResult): void;
  popup(p: Popup): void;
  thumbs(images: Record<string, string>): void;
}

// --- Internal types -----------------------------------------------------------------------------

interface Ship {
  obj: THREE.Object3D;
  angle: number;
  radius: number;
  speed: number;
  bob: number;
}

interface TileObj {
  cell: number;
  kind: number;
  root: THREE.Group;
  /** Model holder (squash on landing). */
  body: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  ships: Ship[];
  /** Seconds since the drop started (negative = waiting); null once landed. */
  drop: number | null;
  dropFrom: number;
  turnFrom: number;
  turnTo: number;
  landed: boolean;
  onLand: (() => void) | null;
  hop: number;
}

interface Marker {
  quest: Quest;
  root: THREE.Group;
  flag: THREE.Object3D | null;
  label: THREE.Sprite;
  texture: THREE.CanvasTexture;
  text: string;
  baseY: number;
  /** Leaving: seconds into the exit animation. */
  exit: number | null;
  done: boolean;
}

interface Pointer {
  x: number;
  y: number;
  sx: number;
  sy: number;
  type: string;
  button: number;
}

// --- Particles ----------------------------------------------------------------------------------

class Particles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly grow: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly gravity: Float32Array;
  private next = 0;
  private readonly geometry = new THREE.BufferGeometry();
  readonly material: THREE.ShaderMaterial;

  constructor(
    private readonly max: number,
    texture: THREE.Texture,
    additive: boolean,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max).fill(1);
    this.maxLife = new Float32Array(max).fill(1);
    this.grow = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("pcolor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("psize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("palpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 400 } },
      vertexShader: `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        uniform float scale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vColor = pcolor; vAlpha = palpha;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, vAlpha * t.a);
          if (gl_FragColor.a < 0.01) discard;
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, size: number, life: number, { grow = 0, gravity = 0 } = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.baseSize[i] = size;
    this.size[i] = size;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.gravity[i] = gravity;
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] >= this.maxLife[i]) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      const drag = Math.exp(-2.2 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * t);
      this.alpha[i] = Math.min(1, t * 8) * (1 - t * t);
    }
    for (const name of ["position", "pcolor", "psize", "palpha"]) this.geometry.attributes[name].needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --- Game ---------------------------------------------------------------------------------------

export class HexHavenGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
  private readonly sun = new THREE.DirectionalLight("#fff4e2", 2.3);
  private readonly timer = new THREE.Timer();
  private readonly sfx = new Sfx();
  private readonly logic = new HexLogic();
  private raf = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;
  private envTexture: THREE.Texture | null = null;
  private phase: Phase = "loading";
  private elapsed = 0;

  // Assets.
  private tileMat!: THREE.MeshStandardMaterial;
  private foliageMat!: THREE.MeshStandardMaterial;
  private ghostMat!: THREE.MeshStandardMaterial;
  private ghostBadMat!: THREE.MeshStandardMaterial;
  private readonly windUniform = { value: 0 };
  private readonly seaUniform = { value: 0 };
  private kindProtos: THREE.Group[] = [];
  private kindHeights: number[] = [];
  private props = new Map<string, THREE.Object3D>();
  private clips = new Map<number, THREE.AnimationClip>();
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  // World.
  private readonly board = new THREE.Group();
  private readonly tiles = new Map<number, TileObj>();
  private sea!: THREE.Mesh;
  private foam!: THREE.InstancedMesh;
  private spotRings!: THREE.InstancedMesh;
  private spotFill!: THREE.InstancedMesh;
  private hoverRing!: THREE.Mesh;
  private flashRings!: THREE.InstancedMesh;
  private flashT = 9;
  private readonly ghost = new THREE.Group();
  private readonly ghostBody = new THREE.Group();
  private ghostKind = -1;
  private ghostFlag: THREE.Object3D | null = null;
  private ghostShake = 0;
  private readonly edgeMarks: THREE.Mesh[] = [];
  private markMats: Record<"match" | "neutral" | "conflict", THREE.MeshBasicMaterial> | null = null;
  private dust!: Particles;
  private sparkles!: Particles;
  private readonly markers = new Map<number, Marker>();
  private shadowDirty = true;
  private boardRadius = 3;
  private readonly boardCenter = new THREE.Vector3();

  // Turn state.
  private rot = 0;
  /** Continuous rotation (radians) the ghost and preview animate towards. */
  private angleGoal = 0;
  private angle = 0;
  private spots = new Set<number>();
  private hoverCell: number | null = null;
  private selectedCell: number | null = null;
  private lastFit: Fit | null = null;
  private lastPlacedCell: number | null = null;
  private overTimer = 0;
  private intensityTimer = 0;
  private popupId = 0;
  /** Bumped on every new board so delayed effects of an old one are dropped. */
  private gen = 0;

  // Camera.
  private readonly camTarget = new THREE.Vector3();
  private readonly camGoal = new THREE.Vector3();
  private dist = 10;
  private distGoal = 10;
  private yaw = 0;
  private yawGoal = 0;
  private portrait = false;
  /** Once the player zooms, the camera stops zooming out on its own as the island grows. */
  private userZoomed = false;
  private readonly keys = new Set<string>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TILE_TOP);
  private readonly pointers = new Map<number, Pointer>();
  private dragging = false;
  private grab: THREE.Vector3 | null = null;
  private pinch: { dist: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
  ) {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.setupWorld(coarse);
    this.scene.add(this.board, this.ghost);
    this.ghost.add(this.ghostBody);
    this.ghost.visible = false;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.timer.connect(document);
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Setup ------------------------------------------------------------------------------------

  private setupWorld(coarse: boolean) {
    const { scene } = this;
    scene.background = HORIZON.clone();
    scene.fog = new THREE.Fog(HORIZON, 30, 90);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: SKY_TOP }, horizon: { value: HORIZON } },
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 horizon; varying vec3 vDir; void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0); }",
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
    scene.environmentIntensity = 0.55;

    scene.add(new THREE.HemisphereLight("#e8f6ff", "#8fb8a0", 1.25));
    const { sun } = this;
    sun.position.set(-6, 14, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);

    // Calm sea with slow glints, receiving the island's shadow.
    // Lambert keeps the sea (most of the screen) cheap to shade.
    const seaMat = new THREE.MeshLambertMaterial({ color: SEA });
    seaMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.seaUniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSeaPos;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvSeaPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vSeaPos;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          vec2 sp = vSeaPos.xz;
          float w = sin(sp.x * 1.3 + uTime * 0.5 + sin(sp.y * 0.6 + uTime * 0.25) * 1.8) * sin(sp.y * 1.1 - uTime * 0.4 + sin(sp.x * 0.5) * 1.5);
          float w2 = sin((sp.x - sp.y) * 6.1 + uTime * 1.4 + w * 2.0) * sin((sp.x + sp.y) * 5.3 - uTime * 1.1);
          diffuseColor.rgb += smoothstep(0.9, 1.05, w2 * 0.6 + w * 0.5) * 0.09;
          diffuseColor.rgb *= 0.95 + 0.05 * w;`,
        );
    };
    this.ownedMaterials.push(seaMat);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = SEA_Y;
    this.sea.receiveShadow = true;
    scene.add(this.sea);

    // Soft foam rim under every tile (only the island's outline shows).
    const foamTex = this.radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.82, "rgba(255,255,255,0.85)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    const foamMat = new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
    this.ownedMaterials.push(foamMat);
    const foamGeo = this.hexGeometry(0.74, 0, 6);
    this.foam = new THREE.InstancedMesh(foamGeo, foamMat, 1024);
    this.foam.count = 0;
    this.foam.position.y = SEA_Y + 0.004;
    this.foam.frustumCulled = false;
    scene.add(this.foam);

    // Spot highlights.
    const ringGeo = this.hexGeometry(0.52, 0.47);
    const fillGeo = this.hexGeometry(0.47, 0);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#d1fae5", transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const fillMat = new THREE.MeshBasicMaterial({ color: EMERALD, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
    this.ownedMaterials.push(ringMat, fillMat);
    this.spotRings = new THREE.InstancedMesh(ringGeo, ringMat, MAX_SPOTS);
    this.spotFill = new THREE.InstancedMesh(fillGeo, fillMat, MAX_SPOTS);
    for (const m of [this.spotRings, this.spotFill]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 2;
      m.position.y = SEA_Y + 0.012;
      scene.add(m);
    }
    const hoverMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    this.ownedMaterials.push(hoverMat);
    this.hoverRing = new THREE.Mesh(this.hexGeometry(0.575, 0.5), hoverMat);
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 3;
    scene.add(this.hoverRing);

    const flashMat = new THREE.MeshBasicMaterial({ color: "#fff7c2", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.ownedMaterials.push(flashMat);
    this.flashRings = new THREE.InstancedMesh(this.hexGeometry(0.56, 0.4), flashMat, 256);
    this.flashRings.count = 0;
    this.flashRings.frustumCulled = false;
    this.flashRings.renderOrder = 4;
    scene.add(this.flashRings);

    // Ghost edge markers.
    const markGeo = new THREE.BoxGeometry(0.5, 0.035, 0.075);
    this.ownedGeometries.push(markGeo);
    this.markMats = {
      match: new THREE.MeshBasicMaterial({ color: "#34d399", toneMapped: false }),
      neutral: new THREE.MeshBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.75, toneMapped: false }),
      conflict: new THREE.MeshBasicMaterial({ color: "#f43f5e", toneMapped: false }),
    };
    this.ownedMaterials.push(...Object.values(this.markMats));
    for (let d = 0; d < 6; d++) {
      const m = new THREE.Mesh(markGeo, this.markMats.neutral);
      const a = (d * Math.PI) / 3;
      m.position.set(Math.cos(a) * 0.535, TILE_TOP + 0.02, -Math.sin(a) * 0.535);
      m.rotation.y = a + Math.PI / 2;
      m.visible = false;
      m.renderOrder = 6;
      this.ghost.add(m);
      this.edgeMarks.push(m);
    }

    const soft = this.radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.4, "rgba(255,255,255,0.7)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    this.dust = new Particles(500, soft, false);
    const star = this.radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.22, "rgba(255,255,255,1)"],
      [0.42, "rgba(255,255,255,0.45)"],
      [1, "rgba(255,255,255,0)"],
    ]);
    this.sparkles = new Particles(900, star, false);
    scene.add(this.dust.points, this.sparkles.points);
  }

  private radialTexture(stops: [number, string][]) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.ownedTextures.push(tex);
    return tex;
  }

  /** Flat pointy-top hexagon (or hex ring when inner > 0), lying on y = 0, radius = circumradius. */
  private hexGeometry(outer: number, inner: number, uvRings = 0) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const [x, y] = [Math.cos(a) * outer, Math.sin(a) * outer];
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    if (inner > 0) {
      const hole = new THREE.Path();
      for (let i = 0; i <= 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const [x, y] = [Math.cos(a) * inner, Math.sin(a) * inner];
        if (i === 0) hole.moveTo(x, y);
        else hole.lineTo(x, y);
      }
      shape.holes.push(hole);
    }
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    if (uvRings) {
      // UVs centred on the hexagon so a radial texture fades towards its rim.
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + (pos.getX(i) / outer) * 0.5, 0.5 + (pos.getZ(i) / outer) * 0.5);
    }
    this.ownedGeometries.push(geo);
    return geo;
  }

  /** sizes: bytes per model (from the catalog) so the loading bar is exact. */
  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      this.buildProtos(models);
      this.events.thumbs(this.renderThumbs());
      this.buildDemo();
      // Quest labels use the game's web font: redraw them once it has loaded.
      void document.fonts?.ready.then(() => {
        if (this.disposed) return;
        for (const m of this.markers.values()) {
          const text = m.text;
          m.text = "";
          this.setMarkerText(m, text, m.quest);
        }
      });
      music.play(HEX_AMBIENT, 0);
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the game.");
    }
  }

  private buildProtos(models: Map<string, LoadedModel>) {
    const missing = MODELS.filter((k) => !models.has(k) && k.startsWith("hexagon-kit/"));
    if (missing.length) throw new Error("Some game models could not be loaded. Check your connection and reload.");

    // Every Hexagon Kit model uses the same 5 KB colour map: one shared material for all of them.
    let map: THREE.Texture | null = null;
    models.get("hexagon-kit/grass")!.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !map) map = (mesh.material as THREE.MeshStandardMaterial).map;
    });
    this.tileMat = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    this.foliageMat = this.tileMat.clone();
    // Lakes and rivers (the colour map's light blue) shimmer gently.
    this.tileMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.seaUniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vTilePos;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvTilePos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vTilePos;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
          vec3 waterRef = vec3(0.29, 0.73, 1.0);
          float isWater = 1.0 - smoothstep(0.04, 0.09, distance(diffuseColor.rgb, waterRef));
          if (isWater > 0.0) {
            vec2 tp = vTilePos.xz * 5.0;
            float ripple = sin(tp.x * 1.3 + uTime * 1.1 + sin(tp.y * 0.9 + uTime * 0.6) * 1.7) * sin(tp.y * 1.1 - uTime * 0.8 + sin(tp.x * 0.7) * 1.3);
            diffuseColor.rgb += isWater * (smoothstep(0.55, 0.95, ripple) * 0.22 - 0.03);
          }`,
        );
    };
    this.foliageMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = this.windUniform;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uWind;").replace(
        "#include <project_vertex>",
        `vec4 swayWp = modelMatrix * vec4(transformed, 1.0);
        float swayH = max(0.0, swayWp.y - 0.24);
        swayWp.x += sin(uWind * 1.7 + swayWp.x * 2.1 + swayWp.z * 1.3) * swayH * 0.045;
        swayWp.z += cos(uWind * 1.3 + swayWp.z * 1.9 - swayWp.x * 0.7) * swayH * 0.03;
        vec4 mvPosition = viewMatrix * swayWp;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    };
    this.ghostMat = this.tileMat.clone();
    this.ghostMat.transparent = true;
    this.ghostMat.opacity = 0.86;
    this.ghostMat.emissive = new THREE.Color("#1f6f55");
    this.ghostMat.emissiveIntensity = 0.25;
    this.ghostBadMat = this.ghostMat.clone();
    this.ghostBadMat.color = new THREE.Color("#ffc4c4");
    this.ghostBadMat.emissive = new THREE.Color("#e11d48");
    this.ghostBadMat.emissiveIntensity = 0.35;
    this.ownedMaterials.push(this.tileMat, this.foliageMat, this.ghostMat, this.ghostBadMat);

    const prepared = new Set<string>();
    const prep = (key: string, material: THREE.Material = this.tileMat) => {
      const m = models.get(key)!;
      if (!prepared.has(key)) {
        prepared.add(key);
        m.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const old = mesh.material as THREE.MeshStandardMaterial;
          if (key.startsWith("hexagon-kit/")) {
            if (old !== this.tileMat && old !== this.foliageMat) {
              if (old.map && old.map !== map) old.map.dispose();
              old.dispose();
            }
            mesh.material = material;
          }
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        m.scene.position.set(0, 0, 0);
      }
      return m.scene;
    };

    this.kindProtos = KINDS.map((kind, i) => {
      const g = new THREE.Group();
      if (kind.base) {
        g.add(prep(kind.base).clone());
        const decal = prep(kind.model).clone();
        decal.position.y = TILE_TOP + 0.002;
        decal.traverse((o) => (o.castShadow = false));
        g.add(decal);
      } else {
        g.add(prep(kind.model, kind.id === "grass-forest" ? this.foliageMat : this.tileMat).clone());
      }
      if (kind.props === "trees") g.add(this.makeGrove(prep(PROPS.tree, this.foliageMat), i));
      const clip = models.get(kind.model)?.animations[0];
      if (clip) this.clips.set(i, clip);
      // Moving parts would leave frozen shadows behind (shadows are only redrawn when the board changes).
      g.traverse((o) => {
        if (o.name.startsWith("rotate-")) o.traverse((c) => (c.castShadow = false));
      });
      const box = new THREE.Box3().setFromObject(g);
      this.kindHeights[i] = box.max.y;
      return g;
    });

    const ship = prep(PROPS.ship).clone();
    ship.traverse((o) => (o.castShadow = false));
    this.props.set("ship", ship);
    const flag = models.get(PROPS.flag);
    if (flag) {
      const wrap = new THREE.Group();
      flag.scene.position.set(0, 0, 0);
      flag.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(flag.scene);
      const s = 0.62 / Math.max(0.01, box.max.y - box.min.y);
      flag.scene.scale.setScalar(s);
      flag.scene.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
      flag.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = false;
      });
      wrap.add(flag.scene);
      this.props.set("flag", wrap);
    }
  }

  /** A small wood of library trees on a meadow tile. */
  private makeGrove(tree: THREE.Object3D, seed: number) {
    const rand = mulberry(seed * 977 + 13);
    const group = new THREE.Group();
    group.name = "grove";
    const spots: [number, number][] = [];
    for (let tries = 0; spots.length < 7 && tries < 200; tries++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 0.36;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 0.19)) continue;
      spots.push([x, z]);
      const t = tree.clone();
      t.position.set(x, TILE_TOP, z);
      t.rotation.y = rand() * Math.PI * 2;
      t.scale.setScalar(0.9 + rand() * 0.55);
      group.add(t);
    }
    return group;
  }

  /** Top-down pictures of every tile for the HUD (north up), rendered once. */
  private renderThumbs(): Record<string, string> {
    const S = 160;
    const out: Record<string, string> = {};
    const scene = new THREE.Scene();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight("#ffffff", "#9fb8aa", 1.6));
    const light = new THREE.DirectionalLight("#fff4e2", 1.6);
    light.position.set(-1, 3, 1.5);
    scene.add(light);
    const cam = new THREE.OrthographicCamera(-0.6, 0.6, 0.6, -0.6, 0.1, 10);
    cam.position.set(0, 5, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    const c2 = document.createElement("canvas");
    c2.width = c2.height = S;
    const ctx = c2.getContext("2d");
    const gl = this.renderer.domElement;
    if (!ctx || gl.width < S || gl.height < S) return out;
    const pr = this.renderer.getPixelRatio();
    const prevClear = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, S / pr, S / pr);
    this.renderer.setScissor(0, 0, S / pr, S / pr);
    KINDS.forEach((kind, i) => {
      const obj = this.kindProtos[i].clone();
      scene.add(obj);
      this.renderer.render(scene, cam);
      ctx.clearRect(0, 0, S, S);
      ctx.drawImage(gl, 0, gl.height - S, S, S, 0, 0, S, S);
      out[kind.id] = c2.toDataURL("image/png");
      scene.remove(obj);
    });
    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000, prevClear);
    this.resize();
    return out;
  }

  // --- Public API -------------------------------------------------------------------------------

  start() {
    audio.unlock();
    this.logic.reset(Date.now());
    this.rebuildBoard(true);
    this.rot = 0;
    this.angle = this.angleGoal = 0;
    this.selectedCell = null;
    this.hoverCell = null;
    this.lastPlacedCell = null;
    this.overTimer = 0;
    this.userZoomed = false;
    this.yawGoal = Math.round(this.yaw / (Math.PI / 3)) * (Math.PI / 3);
    this.frameBoard(true);
    this.refreshTurn();
    this.sfx.start();
    music.play(HEX_AMBIENT, 1);
    music.setIntensity(1);
    music.duck(false);
    this.setPhase("playing");
  }

  pause() {
    if (this.phase !== "playing") return;
    this.keys.clear();
    music.duck(true);
    this.sfx.surf(0);
    this.setPhase("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.unlock();
    music.duck(false);
    this.setPhase("playing");
  }

  toMenu() {
    this.buildDemo();
    music.play(HEX_AMBIENT, 0);
    music.setIntensity(0);
    music.duck(false);
    this.setPhase("menu");
  }

  /** dir 1 = clockwise on screen, -1 = counter-clockwise. */
  rotate(dir: 1 | -1) {
    if (this.phase !== "playing" || !this.logic.current) return;
    this.rot = (this.rot - dir + 6) % 6;
    this.angleGoal -= (dir * Math.PI) / 3;
    this.sfx.rotate();
    this.updateGhost(true);
  }

  /** Turns the camera around the island in 60° steps. */
  rotateView(dir: 1 | -1) {
    if (this.phase !== "playing" && this.phase !== "over") return;
    this.yawGoal += (dir * Math.PI) / 3;
    this.emitHud();
  }

  zoom(factor: number) {
    if (this.phase !== "playing" && this.phase !== "over") return;
    this.userZoomed = true;
    this.distGoal = THREE.MathUtils.clamp(this.distGoal * factor, MIN_DIST, MAX_DIST);
  }

  /** Held movement keys (WASD / arrows). */
  holdKey(key: "up" | "down" | "left" | "right", down: boolean) {
    if (down && this.phase === "playing") this.keys.add(key);
    else this.keys.delete(key);
  }

  undo() {
    if (this.phase !== "playing") return;
    const cell = this.lastPlacedCell;
    if (!this.logic.canUndo || cell === null) {
      this.sfx.invalid();
      return;
    }
    this.logic.undo();
    const t = this.tiles.get(cell);
    if (t) {
      const p = cellToWorld(cell);
      this.puff(p.x, p.z, 10, new THREE.Color("#ffffff"));
      this.removeTile(t);
    }
    this.lastPlacedCell = null;
    this.overTimer = 0;
    this.rot = 0;
    this.angle = this.angleGoal = 0;
    this.selectedCell = null;
    this.syncMarkers(true);
    this.updateFoam();
    this.refreshTurn();
    this.sfx.undo();
    this.shadowDirty = true;
  }

  /** Places the tile at the selected (touch) or hovered spot. */
  confirm() {
    if (this.phase !== "playing") return;
    const cell = this.selectedCell ?? this.hoverCell;
    if (cell !== null) this.tryPlace(cell);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerCancel);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
    this.timer.dispose();
    this.sfx.dispose();
    music.stop();
    for (const m of this.markers.values()) m.texture.dispose();
    for (const proto of this.kindProtos) disposeTree(proto);
    for (const p of this.props.values()) disposeTree(p);
    this.dust.dispose();
    this.sparkles.dispose();
    this.ownedTextures.forEach((t) => t.dispose());
    this.ownedGeometries.forEach((g) => g.dispose());
    this.ownedMaterials.forEach((m) => m.dispose());
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
    this.hoverRing.visible = false;
    if (phase !== "playing") this.ghost.visible = false;
    this.updateSpotsVisual();
    this.events.phase(phase);
    if (phase === "playing" || phase === "paused") this.emitHud();
  }

  /** A pretty island for the menu: the seed plus a few dozen tiles laid by the solver. */
  private buildDemo() {
    this.logic.reset(Math.floor(Math.random() * 1e9), DEMO_TILES + 4);
    for (let i = 0; i < DEMO_TILES && this.logic.current; i++) {
      this.logic.ensurePlayable();
      const m = this.logic.bestMove();
      if (!m) break;
      this.logic.place(m.cell, m.rot);
    }
    this.rebuildBoard(false);
    this.spots.clear();
    this.frameBoard(true);
    // Landscape menus have room to spare at the sides: show the island a little larger.
    if (!this.portrait) this.distGoal *= 0.82;
    this.dist = this.distGoal;
  }

  private rebuildBoard(intro: boolean) {
    this.gen++;
    for (const t of [...this.tiles.values()]) this.removeTile(t);
    for (const m of this.markers.values()) this.disposeMarker(m);
    this.markers.clear();
    let i = 0;
    const cells = [...this.logic.cells.entries()].sort((a, b) => a[1].order - b[1].order);
    for (const [cell, placed] of cells) {
      const t = this.addTile(cell, placed.kind, placed.rot);
      if (intro) {
        t.drop = -0.15 - i * 0.09;
        t.dropFrom = 1.3;
        t.root.visible = false;
      } else {
        t.drop = null;
        t.landed = true;
        t.root.position.y = 0;
      }
      i++;
    }
    this.updateFoam();
    this.syncMarkers(true);
    this.shadowDirty = true;
  }

  private addTile(cell: number, kind: number, rot: number): TileObj {
    const root = new THREE.Group();
    const body = new THREE.Group();
    const model = this.kindProtos[kind].clone();
    body.add(model);
    root.add(body);
    const p = cellToWorld(cell);
    root.position.set(p.x, 0, p.z);
    root.rotation.y = (rot * Math.PI) / 3;
    const rand = mulberry(cell * 7919 + kind * 31);
    const k = KINDS[kind];
    // Groves differ a little from tile to tile.
    const grove = model.getObjectByName("grove");
    if (grove) grove.rotation.y = Math.floor(rand() * 6) * (Math.PI / 3) + rand() * 0.5;
    const ships: Ship[] = [];
    if (k.id === "water" && rand() < 0.35) {
      const ship = this.props.get("ship")!.clone();
      ship.scale.setScalar(0.42);
      root.add(ship);
      ships.push({ obj: ship, angle: rand() * Math.PI * 2, radius: 0.12 + rand() * 0.1, speed: (rand() < 0.5 ? -1 : 1) * (0.12 + rand() * 0.1), bob: rand() * 6 });
    }
    let mixer: THREE.AnimationMixer | null = null;
    const clip = this.clips.get(kind);
    if (clip) {
      mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(clip);
      action.timeScale = 0.6 + rand() * 0.3;
      action.time = rand() * clip.duration;
      action.play();
    }
    this.board.add(root);
    const t: TileObj = { cell, kind, root, body, mixer, ships, drop: null, dropFrom: 0, turnFrom: root.rotation.y, turnTo: root.rotation.y, landed: true, onLand: null, hop: 0 };
    this.tiles.set(cell, t);
    return t;
  }

  private removeTile(t: TileObj) {
    t.mixer?.stopAllAction();
    t.root.removeFromParent();
    this.tiles.delete(t.cell);
  }

  /** Frames the camera on the board. */
  private frameBoard(instant: boolean) {
    this.updateBounds();
    this.camGoal.set(this.boardCenter.x, 0, this.boardCenter.z);
    this.distGoal = this.fitDistance(this.boardRadius);
    if (instant) {
      this.camTarget.copy(this.camGoal);
      this.dist = this.distGoal;
    }
  }

  /** Camera distance that shows a circle of `radius` around the target (narrowest field of view). */
  private fitDistance(radius: number) {
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const need = (radius * 1.05) / Math.tan(Math.min(vfov, hfov) / 2);
    return THREE.MathUtils.clamp(Math.max(5, need), MIN_DIST, MAX_DIST);
  }

  private updateBounds() {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const cell of this.logic.cells.keys()) {
      const p = cellToWorld(cell);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    if (!Number.isFinite(minX)) minX = maxX = minZ = maxZ = 0;
    this.boardCenter.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.boardRadius = Math.max(1.5, Math.hypot(maxX - minX, maxZ - minZ) / 2 + 1);
    // The sun's shadow camera covers the whole board.
    const r = this.boardRadius + 2;
    const cam = this.sun.shadow.camera;
    Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: 60 });
    cam.updateProjectionMatrix();
    this.sun.target.position.copy(this.boardCenter);
    this.sun.position.copy(this.boardCenter).add(new THREE.Vector3(-7, 16, 8));
    this.shadowDirty = true;
  }

  private updateFoam() {
    const m = new THREE.Matrix4();
    let i = 0;
    for (const cell of this.logic.cells.keys()) {
      const p = cellToWorld(cell);
      m.makeTranslation(p.x, 0, p.z);
      this.foam.setMatrixAt(i++, m);
      if (i >= 1024) break;
    }
    this.foam.count = i;
    this.foam.instanceMatrix.needsUpdate = true;
  }

  // --- Turn ---------------------------------------------------------------------------------------

  /** After every change of the tile in hand: find spots, rebuild the ghost, tell the HUD. */
  private refreshTurn() {
    const draw = this.logic.current;
    if (draw && !this.logic.ensurePlayable()) {
      // Nowhere at all to put any tile — the landscape is finished.
      this.logic.remaining = 0;
    }
    const cur = this.logic.current;
    this.spots = new Set(cur && !this.logic.over ? this.logic.spots(cur.kind) : []);
    if (this.selectedCell !== null && !this.spots.has(this.selectedCell)) this.selectedCell = null;
    this.buildGhost();
    this.updateSpotsVisual();
    this.updateGhost(false);
    this.emitHud();
  }

  private updateSpotsVisual() {
    const show = this.phase === "playing";
    const m = new THREE.Matrix4();
    let i = 0;
    if (show) {
      for (const cell of this.spots) {
        if (i >= MAX_SPOTS) break;
        const p = cellToWorld(cell);
        m.makeTranslation(p.x, 0, p.z);
        this.spotRings.setMatrixAt(i, m);
        this.spotFill.setMatrixAt(i, m);
        i++;
      }
    }
    this.spotRings.count = i;
    this.spotFill.count = i;
    this.spotRings.instanceMatrix.needsUpdate = true;
    this.spotFill.instanceMatrix.needsUpdate = true;
  }

  private buildGhost() {
    const draw = this.logic.current;
    const kind = draw?.kind ?? -1;
    if (kind !== this.ghostKind) {
      this.ghostBody.clear();
      this.ghostKind = kind;
      if (kind >= 0) {
        const g = this.kindProtos[kind].clone();
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.material = this.ghostMat;
        });
        this.ghostBody.add(g);
      }
    }
    if (this.ghostFlag) {
      this.ghostFlag.removeFromParent();
      this.ghostFlag = null;
    }
    const flag = this.props.get("flag");
    if (draw?.quest && flag) {
      this.ghostFlag = flag.clone();
      this.ghostFlag.position.set(0, this.kindHeights[kind] + 0.05, 0);
      this.ghost.add(this.ghostFlag);
    }
  }

  private ghostCell() {
    const c = this.selectedCell ?? this.hoverCell;
    return c !== null && this.spots.has(c) ? c : null;
  }

  /** Re-evaluates the fit under the ghost; `sound` when the player changed something. */
  private updateGhost(sound: boolean) {
    const cell = this.phase === "playing" ? this.ghostCell() : null;
    const draw = this.logic.current;
    if (cell === null || !draw) {
      this.ghost.visible = false;
      this.hoverRing.visible = false;
      if (this.lastFit) {
        this.lastFit = null;
        this.emitHud();
      }
      return;
    }
    const p = cellToWorld(cell);
    const moved = !this.ghost.visible || Math.abs(this.ghost.position.x - p.x) > 0.01 || Math.abs(this.ghost.position.z - p.z) > 0.01;
    this.ghost.visible = true;
    this.ghost.position.x = p.x;
    this.ghost.position.z = p.z;
    this.hoverRing.visible = true;
    this.hoverRing.position.set(p.x, SEA_Y + 0.016, p.z);
    const fit = this.logic.fit(cell, draw.kind, this.rot);
    this.lastFit = fit;
    const mats = this.markMats!;
    for (let d = 0; d < 6; d++) {
      const f = fit.edges[d];
      const mark = this.edgeMarks[d];
      mark.visible = f !== null;
      if (f) mark.material = mats[f];
    }
    const bad = !fit.valid;
    this.ghostBody.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = bad ? this.ghostBadMat : this.ghostMat;
    });
    (this.hoverRing.material as THREE.MeshBasicMaterial).color.set(bad ? "#fda4af" : fit.perfect ? "#fde68a" : "#ffffff");
    if (sound && moved) this.sfx.hover();
    this.emitHud();
  }

  private tryPlace(cell: number) {
    const draw = this.logic.current;
    if (!draw || this.phase !== "playing") return;
    if (!this.spots.has(cell)) return;
    const from = { y: this.ghost.visible ? this.ghost.position.y : GHOST_LIFT, angle: this.ghost.visible ? this.ghostBody.rotation.y : (this.rot * Math.PI) / 3 };
    const result = this.logic.place(cell, this.rot);
    if (!result) {
      this.sfx.invalid();
      this.ghostShake = 0.35;
      const p = cellToWorld(cell);
      this.popupAt(p.x, 0.5, p.z, "Doesn't fit", "Rivers and roads must connect", "fail");
      return;
    }
    this.lastPlacedCell = cell;
    const t = this.addTile(cell, draw.kind, this.rot);
    // Continue from where the ghost was (height and rotation), then drop with a bounce.
    t.drop = 0;
    t.dropFrom = from.y;
    const target = (this.rot * Math.PI) / 3;
    let a = from.angle;
    while (a - target > Math.PI) a -= Math.PI * 2;
    while (target - a > Math.PI) a += Math.PI * 2;
    t.turnFrom = a;
    t.turnTo = target;
    t.root.rotation.y = a;
    t.landed = false;
    t.onLand = () => this.landed(result);
    this.selectedCell = null;
    this.hoverCell = null;
    this.rot = 0;
    this.angle = this.angleGoal = 0;
    this.updateFoam();
    this.updateBounds();
    // Drift the view a little towards the action.
    const at = cellToWorld(cell);
    this.camGoal.x += (at.x - this.camGoal.x) * 0.18;
    this.camGoal.z += (at.z - this.camGoal.z) * 0.18;
    this.clampGoal();
    if (!this.userZoomed) {
      // Follow the growing island, but stay close enough to see the tiles.
      const want = Math.min(this.fitDistance(this.boardRadius * 0.8), this.portrait ? 20 : 15);
      if (this.distGoal < want) this.distGoal = want;
    }
    this.sfx.draw();
    this.refreshTurn();
    if (this.logic.over) this.overTimer = 2.2;
  }

  /** Feedback once a tile hits the board. */
  private landed(r: PlaceResult) {
    const p = cellToWorld(r.cell);
    this.sfx.place();
    this.puff(p.x, p.z, 16, new THREE.Color("#fff3e4"));
    this.shadowDirty = true;
    // Matching neighbours hop and chime.
    let i = 0;
    for (let d = 0; d < 6; d++) {
      if (r.fit.edges[d] !== "match") continue;
      const n = this.tiles.get(neighbor(r.cell, d));
      if (n) n.hop = -0.08 - i++ * 0.075;
    }
    this.sfx.matches(r.fit.matches);
    const matches = r.fit.matches === 1 ? "1 match" : `${r.fit.matches} matches`;
    if (r.fit.perfect) {
      this.burst(p.x, p.z, r.fit.flawless ? 110 : 70);
      this.sfx.perfect(r.fit.flawless);
      const tiles = r.fit.flawless ? 2 : 1;
      this.popupAt(p.x, 1.1, p.z, r.fit.flawless ? "Flawless!" : "Perfect!", `+${r.fit.points} · ${matches} · +${tiles} tile${tiles > 1 ? "s" : ""}`, "perfect");
    } else if (r.fit.points > 0) this.popupAt(p.x, 0.9, p.z, `+${r.fit.points}`, matches, "points");
    if (r.started) this.sfx.questStarted();
    r.completed.forEach((q, k) => this.later(0.65 + k * 0.7, () => this.celebrate(q)));
    for (const q of r.failed) {
      const qp = cellToWorld(q.cell);
      this.popupAt(qp.x, 1.2, qp.z, "Quest closed", `${CATEGORY_LABEL[q.cat]} of ${q.target} can't grow`, "fail");
      this.sfx.questFailed();
    }
    this.syncMarkers(false);
  }

  private later(seconds: number, fn: () => void) {
    const gen = this.gen;
    setTimeout(() => {
      if (!this.disposed && gen === this.gen) fn();
    }, seconds * 1000);
  }

  private celebrate(q: Quest) {
    const group = this.logic.group(q.cell, q.cat).cells;
    const m = new THREE.Matrix4();
    let i = 0;
    for (const cell of group.slice(0, 256)) {
      const p = cellToWorld(cell);
      const h = this.kindHeights[this.tiles.get(cell)?.kind ?? 0] ?? TILE_TOP;
      m.makeTranslation(p.x, h + 0.06, p.z);
      this.flashRings.setMatrixAt(i++, m);
      for (let k = 0; k < 5; k++) {
        this.sparkles.spawn(
          new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.7, h + Math.random() * 0.25, p.z + (Math.random() - 0.5) * 0.7),
          new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3),
          k % 3 === 0 ? new THREE.Color(CATEGORY_COLOR[q.cat]) : k % 3 === 1 ? new THREE.Color("#fbbf24") : new THREE.Color("#ffffff"),
          0.17 + Math.random() * 0.12,
          1.2 + Math.random() * 0.6,
        );
      }
    }
    this.flashRings.count = i;
    this.flashRings.instanceMatrix.needsUpdate = true;
    this.flashT = 0;
    const p = cellToWorld(q.cell);
    this.popupAt(p.x, 1.5, p.z, `${CATEGORY_LABEL[q.cat]} of ${q.target}!`, `Quest complete · +${q.rewardTiles} tiles · +${q.rewardPoints}`, "quest");
    this.sfx.quest();
    music.setIntensity(2);
    this.intensityTimer = 12;
  }

  // --- Quest markers ------------------------------------------------------------------------------

  private syncMarkers(instant: boolean) {
    const active = new Map(this.logic.quests.filter((q) => q.state === "active").map((q) => [q.id, q]));
    const all = new Map(this.logic.quests.map((q) => [q.id, q]));
    for (const [id, m] of this.markers) {
      if (active.has(id)) continue;
      const q = all.get(id);
      if (!q || instant) {
        this.disposeMarker(m);
        this.markers.delete(id);
      } else if (m.exit === null) {
        m.exit = 0;
        m.done = q.state === "done";
        this.setMarkerText(m, q.state === "done" ? `${q.target}/${q.target}` : `${q.progress}/${q.target}`, q);
      }
    }
    for (const q of active.values()) {
      const existing = this.markers.get(q.id);
      if (existing) {
        existing.quest = q;
        this.setMarkerText(existing, `${q.progress}/${q.target}`, q);
        continue;
      }
      const t = this.tiles.get(q.cell);
      const p = cellToWorld(q.cell);
      const root = new THREE.Group();
      const baseY = (this.kindHeights[t?.kind ?? 0] ?? 0.3) + 0.08;
      root.position.set(p.x, baseY, p.z);
      const flagProto = this.props.get("flag");
      const flag = flagProto ? flagProto.clone() : null;
      if (flag) root.add(flag);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 96;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, toneMapped: false }));
      label.scale.set(0.5, 0.19, 1);
      label.position.y = 0.78;
      label.renderOrder = 10;
      root.add(label);
      this.scene.add(root);
      const m: Marker = { quest: q, root, flag, label, texture, text: "", baseY, exit: null, done: false };
      this.setMarkerText(m, `${q.progress}/${q.target}`, q);
      if (!instant) root.scale.setScalar(0.01);
      this.markers.set(q.id, m);
    }
  }

  private setMarkerText(m: Marker, text: string, q: Quest) {
    if (m.text === text) return;
    m.text = text;
    const c = m.texture.image as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = "rgba(248,250,245,0.95)";
    roundRect(ctx, 4, 8, w - 8, h - 16, (h - 16) / 2);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(31,59,45,0.25)";
    ctx.stroke();
    ctx.fillStyle = CATEGORY_COLOR[q.cat];
    ctx.beginPath();
    ctx.arc(46, h / 2, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1f3b2d";
    ctx.font = `600 48px ${this.displayFont()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2 + 26, h / 2 + 2);
    m.texture.needsUpdate = true;
  }

  /** The game's display face (set by the play route), for canvas labels. */
  private displayFont() {
    const v = getComputedStyle(this.canvas).getPropertyValue("--game-display").trim();
    return `${v ? `${v}, ` : ""}system-ui, sans-serif`;
  }

  private disposeMarker(m: Marker) {
    m.root.removeFromParent();
    m.texture.dispose();
    (m.label.material as THREE.SpriteMaterial).dispose();
  }

  // --- Effects ------------------------------------------------------------------------------------

  private puff(x: number, z: number, n: number, color: THREE.Color) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = 0.42 + Math.random() * 0.12;
      this.dust.spawn(
        new THREE.Vector3(x + Math.cos(a) * r, TILE_TOP * 0.6, z + Math.sin(a) * r),
        new THREE.Vector3(Math.cos(a) * (0.5 + Math.random() * 0.5), 0.15 + Math.random() * 0.25, Math.sin(a) * (0.5 + Math.random() * 0.5)),
        color,
        0.16 + Math.random() * 0.1,
        0.55 + Math.random() * 0.3,
        { grow: 1.6 },
      );
    }
  }

  private burst(x: number, z: number, n: number) {
    const gold = new THREE.Color("#fbbf24");
    const white = new THREE.Color("#ffffff");
    const mint = new THREE.Color("#34d399");
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.4;
      this.sparkles.spawn(
        new THREE.Vector3(x, 0.45, z),
        new THREE.Vector3(Math.cos(a) * s, 1.0 + Math.random() * 1.3, Math.sin(a) * s),
        [gold, white, mint][i % 3],
        0.14 + Math.random() * 0.16,
        0.9 + Math.random() * 0.7,
        { gravity: 2.4 },
      );
    }
  }

  private popupAt(x: number, y: number, z: number, text: string, sub: string | undefined, tone: PopupTone) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const el = this.canvas.parentElement ?? this.canvas;
    // Kept on screen, clear of the top bar and the tile tray.
    const sx = THREE.MathUtils.clamp(((v.x + 1) / 2) * el.clientWidth, 90, Math.max(90, el.clientWidth - 90));
    const sy = THREE.MathUtils.clamp(((1 - v.y) / 2) * el.clientHeight, 120, Math.max(120, el.clientHeight - 190));
    this.events.popup({ id: ++this.popupId, x: sx, y: sy, text, sub, tone });
  }

  // --- HUD ----------------------------------------------------------------------------------------

  private emitHud() {
    const L = this.logic;
    const fit = this.lastFit;
    this.events.hud({
      score: L.score,
      remaining: L.remaining,
      placed: L.placed,
      hand: L.hand.map((d) => ({ kind: KINDS[d.kind].id, name: KINDS[d.kind].name, quest: d.quest })),
      angle: THREE.MathUtils.radToDeg(-this.angleGoal + this.yawGoal),
      quests: L.quests.filter((q) => q.state === "active").map((q) => ({ id: q.id, cat: q.cat, target: q.target, progress: q.progress, rewardTiles: q.rewardTiles })),
      canUndo: L.canUndo && this.lastPlacedCell !== null,
      selected: this.selectedCell !== null,
      preview: fit ? { points: fit.points, valid: fit.valid, perfect: fit.perfect, flawless: fit.flawless } : null,
    });
  }

  private finish() {
    const L = this.logic;
    this.ghost.visible = false;
    this.spots.clear();
    this.updateSpotsVisual();
    this.frameBoard(false);
    this.distGoal = Math.min(MAX_DIST, this.distGoal * 1.1);
    this.sfx.gameOver();
    music.setIntensity(0);
    this.setPhase("over");
    this.events.over({ score: L.score, placed: L.placed, perfects: L.perfects, quests: L.questsDone, forest: L.largest("forest"), village: L.largest("village") });
  }

  // --- Input --------------------------------------------------------------------------------------

  private pick(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }

  private cellAt(clientX: number, clientY: number): number | null {
    const hit = this.pick(clientX, clientY);
    return hit ? worldToCell(hit.x, hit.z) : null;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.phase !== "playing" && this.phase !== "over") return;
    audio.unlock();
    if (e.button === 2) {
      this.rotate(1);
      return;
    }
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, type: e.pointerType, button: e.button });
    if (this.pointers.size === 1) {
      this.dragging = false;
      this.grab = null;
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      this.dragging = true;
      this.grab = this.pick((a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      // Mouse hover.
      if (e.pointerType === "mouse" && this.phase === "playing") {
        const cell = this.cellAt(e.clientX, e.clientY);
        const next = cell !== null && this.spots.has(cell) ? cell : null;
        if (next !== this.hoverCell) {
          this.hoverCell = next;
          this.updateGhost(true);
        }
      }
      return;
    }
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const ratio = this.pinch.dist / d;
      this.userZoomed = true;
      this.pinch.dist = d;
      this.distGoal = this.dist = THREE.MathUtils.clamp(this.dist * ratio, MIN_DIST, MAX_DIST);
      this.applyCamera();
      this.dragTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const threshold = ptr.type === "mouse" ? 5 : 10;
    if (!this.dragging && Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > threshold) {
      this.dragging = true;
      this.grab = this.pick(ptr.sx, ptr.sy);
    }
    if (this.dragging) this.dragTo(ptr.x, ptr.y);
  };

  private dragTo(x: number, y: number) {
    if (!this.grab) {
      this.grab = this.pick(x, y);
      return;
    }
    const now = this.pick(x, y);
    if (!now) return;
    const dx = this.grab.x - now.x;
    const dz = this.grab.z - now.z;
    this.camGoal.x += dx;
    this.camGoal.z += dz;
    this.clampGoal();
    this.camTarget.copy(this.camGoal);
    this.applyCamera();
  }

  private onPointerUp = (e: PointerEvent) => {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);
    if (this.pointers.size > 0) return;
    const wasDrag = this.dragging;
    this.dragging = false;
    this.grab = null;
    this.pinch = null;
    if (wasDrag || this.phase !== "playing" || ptr.button !== 0) return;
    const cell = this.cellAt(e.clientX, e.clientY);
    if (ptr.type === "mouse") {
      if (cell !== null && this.spots.has(cell)) this.tryPlace(cell);
      return;
    }
    // Touch / pen: first tap shows the ghost, a second tap on the same spot places it.
    if (cell !== null && this.spots.has(cell)) {
      if (this.selectedCell === cell) this.tryPlace(cell);
      else {
        this.selectedCell = cell;
        this.updateGhost(true);
      }
    } else if (this.selectedCell !== null) {
      this.selectedCell = null;
      this.updateGhost(false);
    }
  };

  private onPointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      this.dragging = false;
      this.grab = null;
      this.pinch = null;
    }
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    if (this.hoverCell !== null) {
      this.hoverCell = null;
      this.updateGhost(false);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.phase !== "playing" && this.phase !== "over") return;
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    this.userZoomed = true;
    this.distGoal = THREE.MathUtils.clamp(this.distGoal * Math.exp(delta * 0.0012), MIN_DIST, MAX_DIST);
  };

  private clampGoal() {
    const r = this.boardRadius + 1.5;
    const dx = this.camGoal.x - this.boardCenter.x;
    const dz = this.camGoal.z - this.boardCenter.z;
    const d = Math.hypot(dx, dz);
    if (d > r) {
      this.camGoal.x = this.boardCenter.x + (dx / d) * r;
      this.camGoal.z = this.boardCenter.z + (dz / d) * r;
    }
  }

  // --- Frame ------------------------------------------------------------------------------------

  private frame = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    const live = this.phase !== "paused" && this.phase !== "loading" && this.phase !== "error";
    if (!live) {
      if (this.phase === "paused") this.renderer.render(this.scene, this.camera);
      return;
    }
    this.elapsed += dt;
    this.windUniform.value = this.elapsed;
    this.seaUniform.value = this.elapsed;

    if (this.phase === "playing") this.updatePlaying(dt);
    else if (this.phase === "menu") this.yawGoal += dt * 0.07;
    else if (this.phase === "over") this.yawGoal += dt * 0.05;

    this.updateTiles(dt);
    this.updateGhostMotion(dt);
    this.updateMarkers(dt);
    this.dust.update(dt);
    this.sparkles.update(dt);
    this.updateCamera(dt);

    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3);
    (this.spotRings.material as THREE.MeshBasicMaterial).opacity = 0.45 + pulse * 0.35;
    (this.spotFill.material as THREE.MeshBasicMaterial).opacity = 0.12 + pulse * 0.1;
    (this.hoverRing.material as THREE.MeshBasicMaterial).opacity = 0.75 + pulse * 0.25;
    if (this.flashT < 2) {
      this.flashT += dt;
      (this.flashRings.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - this.flashT / 1.6) * (0.6 + 0.4 * Math.sin(this.flashT * 18));
      if (this.flashT >= 2) this.flashRings.count = 0;
    }
    this.sfx.surf(this.phase === "playing" || this.phase === "menu" ? 1 : 0.5);

    if (this.shadowDirty) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
  };

  private updatePlaying(dt: number) {
    // Keyboard panning, relative to the view.
    let mx = 0;
    let mz = 0;
    if (this.keys.has("left")) mx -= 1;
    if (this.keys.has("right")) mx += 1;
    if (this.keys.has("up")) mz -= 1;
    if (this.keys.has("down")) mz += 1;
    if (mx || mz) {
      const speed = this.dist * 0.5 * dt;
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      this.camGoal.x += (mx * c + mz * s) * speed;
      this.camGoal.z += (-mx * s + mz * c) * speed;
      this.clampGoal();
    }
    if (this.intensityTimer > 0) {
      this.intensityTimer -= dt;
      if (this.intensityTimer <= 0) music.setIntensity(1);
    }
    if (this.overTimer > 0) {
      this.overTimer -= dt;
      if (this.overTimer <= 0) this.finish();
    }
  }

  private updateTiles(dt: number) {
    let dropping = false;
    for (const t of this.tiles.values()) {
      t.mixer?.update(dt);
      for (const s of t.ships) {
        s.angle += s.speed * dt;
        s.bob += dt;
        s.obj.position.set(Math.cos(s.angle) * s.radius, 0.1 + Math.sin(s.bob * 1.6) * 0.008, Math.sin(s.angle) * s.radius);
        s.obj.rotation.set(Math.sin(s.bob * 1.3) * 0.05, -s.angle + (s.speed > 0 ? Math.PI : 0), Math.sin(s.bob * 1.1) * 0.04);
      }
      if (t.drop !== null) {
        dropping = true;
        t.drop += dt;
        if (t.drop < 0) continue;
        t.root.visible = true;
        const u = Math.min(1, t.drop / DROP_FALL);
        if (u < 1) {
          t.root.position.y = t.dropFrom * (1 - u * u);
          t.root.rotation.y = t.turnFrom + (t.turnTo - t.turnFrom) * easeOut(u * 1.4);
        } else {
          if (!t.landed) {
            t.landed = true;
            t.root.rotation.y = t.turnTo;
            const cb = t.onLand;
            t.onLand = null;
            if (cb) cb();
            else {
              this.sfx.place();
              const p = cellToWorld(t.cell);
              this.puff(p.x, p.z, 10, new THREE.Color("#fff3e4"));
            }
          }
          const v = t.drop - DROP_FALL;
          t.root.position.y = Math.abs(Math.sin(v * 13)) * 0.07 * Math.exp(-v * 8);
          const squash = Math.exp(-v * 10) * 0.12;
          t.body.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
          if (v > 0.7) {
            t.drop = null;
            t.root.position.y = 0;
            t.body.scale.set(1, 1, 1);
            this.shadowDirty = true;
          }
        }
      } else if (t.hop !== 0) {
        t.hop += dt;
        if (t.hop > 0) {
          const h = t.hop / 0.32;
          t.root.position.y = h < 1 ? Math.sin(h * Math.PI) * 0.06 : 0;
          if (h >= 1) {
            t.hop = 0;
            this.shadowDirty = true;
          }
          dropping = true;
        }
      }
    }
    if (dropping) this.shadowDirty = true;
  }

  private updateGhostMotion(dt: number) {
    this.angle = damp(this.angle, this.angleGoal, 16, dt);
    if (!this.ghost.visible) return;
    this.ghostBody.rotation.y = this.angle;
    let shake = 0;
    if (this.ghostShake > 0) {
      this.ghostShake = Math.max(0, this.ghostShake - dt);
      shake = Math.sin(this.ghostShake * 60) * this.ghostShake * 0.25;
    }
    this.ghostBody.position.x = shake;
    this.ghost.position.y = GHOST_LIFT + Math.sin(this.elapsed * 2.4) * 0.03;
    if (this.ghostFlag) this.ghostFlag.rotation.y = this.angle;
  }

  private updateMarkers(dt: number) {
    for (const [id, m] of this.markers) {
      const s = m.root.scale.x;
      if (m.exit === null) {
        m.root.scale.setScalar(damp(s, 1, 9, dt));
        m.root.position.y = m.baseY + Math.sin(this.elapsed * 1.8 + id) * 0.04;
        if (m.flag) m.flag.rotation.y = Math.sin(this.elapsed * 0.9 + id) * 0.5;
      } else {
        m.exit += dt;
        if (m.done) {
          m.root.position.y = m.baseY + m.exit * m.exit * 3;
          if (m.flag) m.flag.rotation.y += dt * 14;
        } else {
          m.root.position.y = m.baseY - m.exit * 0.8;
        }
        m.root.scale.setScalar(Math.max(0.01, 1 - m.exit * 0.8));
        if (m.exit > 1.2) {
          this.disposeMarker(m);
          this.markers.delete(id);
        }
      }
    }
  }

  private updateCamera(dt: number) {
    this.camTarget.x = damp(this.camTarget.x, this.camGoal.x, 7, dt);
    this.camTarget.z = damp(this.camTarget.z, this.camGoal.z, 7, dt);
    this.dist = damp(this.dist, this.distGoal, 8, dt);
    this.yaw = damp(this.yaw, this.yawGoal, 6, dt);
    this.applyCamera();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.dist * 1.6 + 6;
    fog.far = this.dist * 4.5 + 30;
  }

  private applyCamera() {
    const t = (this.dist - MIN_DIST) / (MAX_DIST - MIN_DIST);
    const pitch = THREE.MathUtils.lerp(0.72, 1.05, Math.sqrt(Math.max(0, t)));
    const h = Math.cos(pitch) * this.dist;
    this.camera.position.set(this.camTarget.x + Math.sin(this.yaw) * h, TILE_TOP + Math.sin(pitch) * this.dist, this.camTarget.z + Math.cos(this.yaw) * h);
    this.camera.lookAt(this.camTarget.x, TILE_TOP, this.camTarget.z);
    this.camera.updateMatrixWorld();
  }

  private resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const wasPortrait = this.portrait;
    this.portrait = w / h < 0.85;
    this.camera.fov = this.portrait ? 50 : 36;
    this.camera.updateProjectionMatrix();
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.dust.material.uniforms.scale.value = scale;
    this.sparkles.material.uniforms.scale.value = scale;
    if (wasPortrait !== this.portrait && this.phase !== "loading") this.frameBoard(false);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mulberry(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
