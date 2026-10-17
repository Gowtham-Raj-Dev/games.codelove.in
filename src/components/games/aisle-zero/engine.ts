import * as THREE from "three";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, type LoadProgress } from "../shared/assets";
import { Sfx } from "./audio";
import { Creatures } from "./creature";
import { MODELS } from "./manifest";
import { AISLES, ITEM_DEFS, LIGHT, PAY_POINT, SPAWN, StoreWorld, XI, ZI, type Item, type ItemDef } from "./world";

/**
 * Aisle Zero: the first-person player and their cart, objectives, input (keyboard, mouse look, touch),
 * HUD events, the store map and the main loop. The store is in world.ts, the creatures in creature.ts.
 *
 * The game was lit with three.js' old light units and light falloff (before r155): the engine multiplies
 * intensities by LIGHT and, while it runs, swaps the old distance falloff back into the shader chunk and
 * turns colour management off, so the store looks exactly as it was designed. dispose() restores both.
 */

const PI = Math.PI;
const CART_D = 1.35; // how far ahead of the player the cart centre rides
const ITEMS = ITEM_DEFS.length;

export type Phase = "loading" | "menu" | "playing" | "paused" | "over" | "error";

export interface Hud {
  collected: number;
  got: boolean[];
  paid: boolean;
  objective: string;
  /** "RUN" while it chases you, "IT IS NEAR" when it's close. */
  alert: "run" | "near" | null;
  stamina: number;
  winded: boolean;
  cans: number;
  prompt: string | null;
  hidden: boolean;
  flash: boolean;
  crouch: boolean;
  mapOpen: boolean;
  /** Desktop: the mouse is captured for looking around. */
  locked: boolean;
}

export interface Result {
  won: boolean;
  collected: number;
  time: number;
  line: string;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  /** A line of story text at the bottom of the screen. */
  message(text: string, ms: number): void;
  /** An item went into the cart. */
  picked(def: ItemDef, collected: number): void;
  result(result: Result): void;
  error(message: string): void;
}

/** Full-screen overlays the engine drives every frame (no React re-render). */
export interface Overlays {
  fear: HTMLElement | null;
  flash: HTMLElement | null;
}

const TX = {
  obj0: "Collect the 8 items on your list",
  obj1: "Pay at the register",
  obj2: "RUN! Escape through the emergency exit",
  pick: "Pick up",
  hide: "Hide inside",
  leave: "Come out",
  pay: "Pay & scan",
  start: "Push the cart. Find everything on the list.",
  sound: "Something is moving in the dark...",
  spotted: "It saw you! RUN!",
  search: "It is searching for you...",
  dark: "The lights died!",
  locked: "Locked. Collect everything and pay first.",
  paid: "BEEP. The emergency exit unlocked. It heard the alarm. RUN!",
  needPay: "Everything collected. Now pay at the register.",
  thrown: "Clink! It looks that way...",
  nocans: "Nothing left to throw.",
  hidden: "You are hiding. Hold still...",
  dead: ["The cart is standing alone now...", "It knows your name. Can you hear it?", "Nobody leaves this store.", "Next time run. Do not stop."],
} as const;
type MsgKey = Exclude<keyof typeof TX, "dead">;

/* --- the old light falloff (three.js < r155, non-physical): (1 - d/cutoff)^decay --- */
const LEGACY_FALLOFF = `float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	if ( cutoffDistance > 0.0 && decayExponent > 0.0 ) {
		return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );
	}
	return 1.0;
}`;
let chunkSaved: string | null = null;
function legacyLights(on: boolean) {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  if (on && chunkSaved === null) {
    chunkSaved = chunks.lights_pars_begin;
    chunks.lights_pars_begin = chunkSaved.replace(/float getDistanceAttenuation\([\s\S]*?return distanceFalloff;\s*\}/, LEGACY_FALLOFF);
    THREE.ColorManagement.enabled = false;
  } else if (!on && chunkSaved !== null) {
    chunks.lights_pars_begin = chunkSaved;
    chunkSaved = null;
    THREE.ColorManagement.enabled = true;
  }
}

export class AisleZeroGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly W: StoreWorld;
  private readonly sfx = new Sfx();
  private readonly cr: Creatures;
  private readonly spot: THREE.SpotLight;
  private readonly fill: THREE.PointLight;
  private readonly beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private cart: THREE.Group | null = null;
  private readonly cartItems = new THREE.Group();
  private raf = 0;
  private last = 0;
  private disposed = false;
  private built = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly res = { max: 1, min: 1, cur: 1, acc: 0, n: 0, good: 0, wait: 3 };
  private readonly touch: boolean;

  // State
  private phase: Phase = "loading";
  private caughtT = -1;
  private readonly P = { x: 0, z: 0, yaw: PI, pitch: 0, vx: 0, vz: 0, stam: 100, stamLock: 0, crouch: false, eye: 1.65, bob: 0, stepT: 0, speed: 0, flash: true, noise: 1, hidden: null as number | null, cans: 4 };
  private collected = 0;
  private paid = false;
  private phase2 = false;
  private gameTime = 0;
  private fear = 0;
  private chaseAmt = 0;
  private hbT = 0;
  private eventT = 20;
  private paT = 40;
  private blT = 60;
  private promptKind: "item" | "hide" | "pay" | "leave" | null = null;
  private promptTarget: Item | number | null = null;
  private promptText: string | null = null;
  private lastPromptKind: string | null = null;
  private mapOpen = false;
  private savedFlash = true;
  private alertState: Hud["alert"] = null;
  private hudCache = "";
  private readonly timers: number[] = [];

  // Input
  private readonly keys = new Set<string>();
  private readonly stick = { x: 0, y: 0, run: false };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: GameEvents,
    private readonly overlays: Overlays,
  ) {
    legacyLights(true);
    this.touch = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    // Sharp at the screen's own density (up to 2×); steps down a little at a time only if the device can't keep up.
    this.res.max = Math.min(window.devicePixelRatio || 1, 2);
    this.res.min = Math.min(this.res.max, 1);
    this.res.cur = this.res.max;
    this.renderer.setPixelRatio(this.res.cur);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = this.scene;
    scene.background = new THREE.Color(0x06090b);
    scene.fog = new THREE.FogExp2(0x050808, 0.038);
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 120);
    this.camera.rotation.order = "YXZ";
    scene.add(this.camera);
    scene.add(new THREE.HemisphereLight(0x566a6e, 0x1a1612, 0.3 * LIGHT));

    /* flashlight + faint fill on the camera */
    const spot = (this.spot = new THREE.SpotLight(0xfff1d6, 4.4 * LIGHT, 40, 0.5, 0.6, 1.2));
    spot.position.set(0.2, -0.15, 0);
    this.camera.add(spot);
    spot.castShadow = true;
    const sm = this.touch ? 1024 : 2048;
    spot.shadow.mapSize.set(sm, sm);
    spot.shadow.camera.near = 0.4;
    spot.shadow.camera.far = 36;
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.02;
    spot.shadow.radius = 3;
    const spotT = new THREE.Object3D();
    spotT.position.set(0.05, -0.05, -6);
    this.camera.add(spotT);
    spot.target = spotT;
    this.fill = new THREE.PointLight(0x9fb4a0, 0.22 * LIGHT, 6, 2);
    this.camera.add(this.fill);
    // visible light shaft while the torch is on
    this.beam = new THREE.Mesh(
      new THREE.ConeGeometry(5.2, 16, 40, 1, true).rotateX(PI / 2).translate(0, 0, -8),
      new THREE.MeshBasicMaterial({ color: 0xfff2d6, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.beam.position.set(0.2, -0.15, 0);
    this.camera.add(this.beam);

    this.W = new StoreWorld();
    this.cr = new Creatures(this.W, this.sfx);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onLockChange);
    canvas.addEventListener("click", this.onCanvasClick);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // --- Loading ---------------------------------------------------------------------------------------

  async load(sizes: Record<string, number>) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      this.W.build(this.renderer, this.scene);
      this.cr.build(this.scene, models);
      this.buildCart();
      this.built = true;
      this.resetGame();
      this.cr.C.mode = "dormant";
      if (this.cr.deer) this.cr.deer.holder.visible = false;
      this.renderer.compile(this.scene, this.camera);
      audio.onUnlock(() => !this.disposed && this.sfx.init());
      this.setPhase("menu");
    } catch (err) {
      console.error(err);
      this.setPhase("error");
      this.events.error(err instanceof Error ? err.message : "Could not load the store.");
    }
  }

  // --- Player cart -------------------------------------------------------------------------------------

  private buildCart() {
    const cart = (this.cart = this.W.makeCart());
    cart.add(this.cartItems);
    cart.add(this.buildHands());
    this.scene.add(cart);
  }

  /** Two first-person hands gripping the cart handle bar (cart-local space: +z points back towards the player). */
  private buildHands() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc99a7a, roughness: 0.75 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.9 });
    const limb = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, mat: THREE.Material) => {
      const v = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, v.length(), 16), mat);
      m.position.copy(a).addScaledVector(v, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
      m.castShadow = true;
      g.add(m);
      return m;
    };
    [-1, 1].forEach((s) => {
      // the shoulder sits behind/below the camera, so the arm leaves the bottom of the screen with no gap
      const wrist = new THREE.Vector3(s * 0.2, 0.9, 0.5);
      const elbow = new THREE.Vector3(s * 0.3, 1.0, 1.45);
      limb(elbow, wrist, 0.032, 0.02, sleeve); // forearm in sleeve
      limb(wrist.clone().add(new THREE.Vector3(0, -0.005, 0.01)), wrist.clone().add(new THREE.Vector3(0, 0.0, -0.01)), 0.028, 0.028, skin); // wrist cuff
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.1), skin);
      fist.position.set(s * 0.2, 0.855, 0.5);
      fist.castShadow = true;
      g.add(fist); // knuckles over the bar
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.09, 14).rotateZ(PI / 2), skin);
      wrap.position.set(s * 0.2, 0.835, 0.5);
      g.add(wrap); // fingers wrapped round the bar
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.06), skin);
      thumb.position.set(s * 0.2 - s * 0.045, 0.875, 0.5);
      thumb.rotation.z = s * 0.4;
      g.add(thumb);
    });
    return g;
  }

  private addToCart(def: ItemDef) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.09), new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 }));
    const n = this.cartItems.children.length;
    m.position.set(-0.15 + (n % 3) * 0.15, 0.43, -0.22 + Math.floor(n / 3) * 0.24);
    m.rotation.y = Math.random() * 3;
    m.castShadow = true;
    this.cartItems.add(m);
  }

  private clearCart() {
    for (const m of [...this.cartItems.children] as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.removeFromParent();
    }
  }

  private placeCart(bobY: number) {
    const cart = this.cart;
    if (!cart) return;
    const P = this.P;
    cart.scale.setScalar(1.1);
    cart.position.set(P.x - Math.sin(P.yaw) * CART_D, bobY, P.z - Math.cos(P.yaw) * CART_D);
    cart.rotation.y = P.yaw;
  }

  // --- Game flow -------------------------------------------------------------------------------------

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }
  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.length = 0;
  }

  private resetGame() {
    const W = this.W;
    W.resetItems();
    W.closeDoor();
    this.clearCart();
    this.collected = 0;
    this.paid = false;
    this.phase2 = false;
    this.gameTime = 0;
    W.blackout = 0;
    Object.assign(this.P, { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, pitch: 0, vx: 0, vz: 0, stam: 100, stamLock: 0, crouch: false, eye: 1.65, flash: true, hidden: null, cans: 4, noise: 1 });
    if (this.cart) this.cart.visible = true;
    this.cr.reset();
    this.fear = 0;
    this.chaseAmt = 0;
    this.caughtT = -1;
    this.eventT = 20;
    this.paT = 35;
    this.blT = 55;
    this.mapOpen = false;
    this.stick.x = this.stick.y = 0;
    this.stick.run = false;
  }

  start() {
    if (!this.built) return;
    this.clearTimers();
    audio.hold(false);
    this.sfx.init();
    this.sfx.uiConfirm();
    this.resetGame();
    this.setPhase("playing");
    this.lockPointer();
    this.later(() => this.phase === "playing" && this.events.message(TX.start, 5200), 700);
    this.later(() => this.phase === "playing" && this.msgKey("sound"), 11000);
    this.emitHud(true);
  }

  pause() {
    if (this.phase !== "playing" || this.caughtT >= 0) return;
    this.sfx.uiBack();
    this.clearInput();
    this.setPhase("paused");
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.later(() => this.phase === "paused" && audio.hold(true), 180);
  }

  resume() {
    if (this.phase !== "paused") return;
    audio.hold(false);
    this.sfx.uiToggle(true);
    this.setPhase("playing");
    this.lockPointer();
    this.last = performance.now();
  }

  toMenu() {
    this.clearTimers();
    audio.hold(false);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.resetGame();
    this.cr.C.mode = "dormant";
    this.setPhase("menu");
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    if (phase !== "playing" && phase !== "paused") this.sfx.update({ chase: 0, fear: 0, speed: 0, cx: 0, cz: -99, px: this.P.x, pz: this.P.z, fx: 0, fz: -1 });
  }

  private msgKey(k: MsgKey) {
    this.events.message(TX[k], k === "paid" ? 6500 : 3200);
  }

  // --- Pointer lock (desktop mouse look) ----------------------------------------------------------------

  private lockPointer() {
    if (this.touch) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Not allowed without a click: the player clicks the view.
    }
  }

  private onCanvasClick = () => {
    if (this.phase === "playing" && document.pointerLockElement !== this.canvas) this.lockPointer();
  };

  private onLockChange = () => {
    this.emitHud(true);
    // Esc releases the mouse: that is the pause key.
    if (document.pointerLockElement !== this.canvas && this.phase === "playing" && !this.touch && this.caughtT < 0) this.pause();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas || this.phase !== "playing") return;
    this.look(e.movementX, e.movementY, 0.0022);
  };

  /** Turns the view: mouse (pixels) or a swipe on a touch screen. */
  look(dx: number, dy: number, k = 0.0048) {
    const P = this.P;
    if (this.phase !== "playing" || this.caughtT >= 0) return;
    if (P.hidden != null) {
      const h = this.W.hides[P.hidden];
      const base = Math.atan2(-h.ox, -h.oz);
      P.yaw = Math.max(base - 0.9, Math.min(base + 0.9, P.yaw - dx * k));
    } else P.yaw -= dx * k;
    P.pitch = Math.max(-0.22, Math.min(0.35, P.pitch - dy * k));
  }

  // --- Keyboard & touch -----------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.code !== "ControlLeft") return;
    if (e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (this.phase !== "playing") return;
    this.keys.add(e.code);
    if (e.code === "Space" || e.code === "Tab") e.preventDefault();
    if (e.repeat) return;
    if (e.code === "KeyT") this.toggleFlash();
    if (e.code === "KeyC" || e.code === "ControlLeft") this.toggleCrouch();
    if (e.code === "KeyE") this.act();
    if (e.code === "KeyQ") this.throwCan();
    if (e.code === "Tab" || e.code === "KeyG") this.toggleMap();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private clearInput = () => {
    this.keys.clear();
    this.stick.x = this.stick.y = 0;
    this.stick.run = false;
  };

  /** Touch stick: x right, y forward, -1..1; `run` when pushed all the way. */
  setStick(x: number, y: number, run: boolean) {
    this.stick.x = x;
    this.stick.y = y;
    this.stick.run = run;
  }

  toggleFlash() {
    if (this.phase !== "playing" || this.P.hidden != null) return;
    this.P.flash = !this.P.flash;
    this.sfx.flashClick();
    this.emitHud();
  }

  toggleCrouch() {
    if (this.phase !== "playing" || this.P.hidden != null) return;
    this.P.crouch = !this.P.crouch;
    this.sfx.crouch(this.P.crouch);
    this.emitHud();
  }

  toggleMap() {
    if (this.phase !== "playing") return;
    this.mapOpen = !this.mapOpen;
    this.sfx.uiToggle(this.mapOpen);
    this.emitHud();
  }

  // --- Actions ---------------------------------------------------------------------------------------------

  act() {
    if (this.phase !== "playing" || this.caughtT >= 0) return;
    if (this.P.hidden != null) {
      this.leaveHide();
      return;
    }
    if (this.promptKind === "item") this.pickup(this.promptTarget as Item);
    else if (this.promptKind === "hide") this.enterHide(this.promptTarget as number);
    else if (this.promptKind === "pay") this.doPay();
  }

  private pickup(it: Item) {
    if (!it || it.got) return;
    const C = this.cr.C;
    it.got = true;
    it.group.visible = false;
    this.collected++;
    this.sfx.pickup();
    this.sfx.ding();
    this.later(() => this.sfx.tone("sine", 990, 990, 0.35, 0.04), 90);
    this.addToCart(it.def);
    this.events.picked(it.def, this.collected);
    if (C.mode !== "chase" && C.mode !== "dormant") {
      C.mode = "investigate";
      C.target = [this.P.x, this.P.z];
      C.fieldG = null;
      C.investT = 6;
    }
    if (this.collected === 3) this.events.message(TX.sound, 3200);
    if (this.collected === 5) {
      this.W.blackout = 3.5;
      this.msgKey("dark");
    } else if (this.collected === ITEMS) this.events.message(TX.needPay, 5500);
    this.emitHud();
  }

  private doPay() {
    if (this.paid) return;
    if (this.collected < ITEMS) {
      this.msgKey("locked");
      return;
    }
    const C = this.cr.C;
    this.paid = true;
    this.phase2 = true;
    this.sfx.beep();
    this.later(() => this.sfx.beep(), 160);
    this.later(() => this.sfx.beep(), 320);
    this.later(() => {
      this.sfx.alarm();
      this.W.openDoor();
      this.sfx.doorOpen();
    }, 500);
    this.msgKey("paid");
    C.mode = "chase";
    C.lastSeen = [this.P.x, this.P.z];
    C.loseT = -4;
    C.roarT = 0;
    C.sawHide = null;
    if (this.cr.deer) this.cr.deer.holder.visible = true;
    this.later(() => this.sfx.roar(0.9), 900);
    this.emitHud();
  }

  private enterHide(i: number) {
    const P = this.P;
    const C = this.cr.C;
    const h = this.W.hides[i];
    P.hidden = i;
    this.savedFlash = P.flash;
    P.flash = false;
    P.x = h.x;
    P.z = h.z;
    P.vx = P.vz = 0;
    P.crouch = false;
    P.yaw = Math.atan2(-h.ox, -h.oz);
    P.pitch = 0;
    if (this.cart) this.cart.visible = false;
    this.sfx.hide();
    this.events.message(TX.hidden, 2500);
    const los = this.W.hasLOS(C.x, C.z, h.x + h.ox * 2, h.z + h.oz * 2, 0);
    if (C.mode === "chase" && los && Math.hypot(h.x - C.x, h.z - C.z) < 16) C.sawHide = [h.x, h.z];
    this.emitHud();
  }

  private leaveHide() {
    const P = this.P;
    if (P.hidden == null) return;
    const h = this.W.hides[P.hidden];
    P.hidden = null;
    P.flash = this.savedFlash;
    P.x = h.x + h.ox * 2.1;
    P.z = h.z + h.oz * 2.1;
    if (this.cart) this.cart.visible = true;
    P.eye = 1.65;
    this.sfx.hide();
    this.W.collide(P, 0.5);
    this.emitHud();
  }

  throwCan() {
    const P = this.P;
    const C = this.cr.C;
    if (this.phase !== "playing" || P.hidden != null || this.caughtT >= 0) return;
    if (P.cans <= 0) {
      this.events.message(TX.nocans, 1800);
      return;
    }
    P.cans--;
    this.sfx.throwSfx();
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    let d = 0;
    let x = P.x;
    let z = P.z;
    while (d < 16) {
      const nx = P.x + fx * (d + 0.5);
      const nz = P.z + fz * (d + 0.5);
      const hit = this.W.boxes.some((b) => b.kind !== "table" && nx > b.x0 && nx < b.x1 && nz > b.z0 && nz < b.z1) || Math.abs(nx) > XI || Math.abs(nz) > ZI;
      if (hit) break;
      d += 0.5;
      x = nx;
      z = nz;
    }
    this.later(() => {
      if (this.phase !== "playing") return;
      this.sfx.clang(0.7);
      this.events.message(TX.thrown, 2200);
      if (C.mode === "patrol" || C.mode === "search" || C.mode === "investigate") {
        C.mode = "investigate";
        C.target = [x, z];
        C.fieldG = null;
        C.investT = 7;
      } else if (C.mode === "chase" && C.loseT > 0.2) {
        C.lastSeen = [x, z];
        C.sawHide = null;
      }
    }, 450);
    this.emitHud();
  }

  private caught = () => {
    if (this.phase !== "playing" || this.caughtT >= 0) return;
    const P = this.P;
    const C = this.cr.C;
    this.caughtT = 0;
    this.sfx.jump();
    if (P.hidden != null) {
      const h = this.W.hides[P.hidden];
      P.x = h.x + h.ox * 1.2;
      P.z = h.z + h.oz * 1.2;
      P.hidden = null;
      if (this.cart) this.cart.visible = false;
    }
    C.mode = "chase";
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    C.x = P.x + fx * 1.5;
    C.z = P.z + fz * 1.5;
    C.yaw = Math.atan2(-fx, -fz);
    const f = this.overlays.flash;
    if (f) {
      f.style.transition = "none";
      f.style.opacity = "1";
      this.later(() => {
        f.style.transition = "opacity .6s";
        f.style.opacity = "0";
      }, 90);
    }
    this.mapOpen = false;
    this.emitHud(true);
  };

  private endDead() {
    this.caughtT = -1;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.sfx.lose();
    this.sfx.quietChase();
    this.events.result({ won: false, collected: this.collected, time: this.gameTime, line: TX.dead[(Math.random() * TX.dead.length) | 0] });
    this.setPhase("over");
  }

  private winGame() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.sfx.win();
    this.events.result({ won: true, collected: this.collected, time: this.gameTime, line: "You escaped." });
    this.setPhase("over");
  }

  // --- Map -------------------------------------------------------------------------------------------------

  /** Draws the store map (only the outline, shelves, lockers, items left, register, exit and you). */
  drawMap(mg: CanvasRenderingContext2D, w: number, h: number) {
    const W = this.W;
    const P = this.P;
    const sc = Math.min(w / 72, h / 94);
    const X = (x: number) => w / 2 + x * sc;
    const Z = (z: number) => h / 2 + z * sc;
    const u = sc / 8; // 1 at the map's design size (576 × 752)
    mg.clearRect(0, 0, w, h);
    mg.fillStyle = "rgba(8,12,12,.92)";
    mg.fillRect(0, 0, w, h);
    mg.strokeStyle = "#5c6a5c";
    mg.lineWidth = 2 * u;
    mg.strokeRect(X(-XI), Z(-ZI), XI * 2 * sc, ZI * 2 * sc);
    W.boxes.forEach((b) => {
      mg.fillStyle = b.kind === "shelf" ? "#3a4a3e" : b.kind === "wall" ? "#6a766a" : b.kind === "door" ? "#a33" : "#4a4f46";
      mg.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
    });
    W.hides.forEach((hd) => {
      mg.fillStyle = "#46d39a";
      mg.beginPath();
      mg.arc(X(hd.x), Z(hd.z), 3 * u, 0, 7);
      mg.fill();
    });
    const font = (px: number) => `bold ${Math.round(px * u)}px sans-serif`;
    mg.font = font(13);
    mg.textAlign = "center";
    AISLES.forEach((a) => {
      mg.fillStyle = "#8a9a86";
      mg.fillText("A" + a.n, X(a.x), Z(-22.6));
    });
    W.items.forEach((it, i) => {
      if (it.got) return;
      mg.fillStyle = "#" + it.def.color.toString(16).padStart(6, "0");
      mg.beginPath();
      mg.arc(X(it.def.x), Z(it.def.z), 6 * u, 0, 7);
      mg.fill();
      mg.strokeStyle = "#000";
      mg.lineWidth = 1.5 * u;
      mg.stroke();
      mg.fillStyle = "#000";
      mg.font = font(9);
      mg.fillText(String(i + 1), X(it.def.x), Z(it.def.z) + 3 * u);
      mg.font = font(13);
    });
    mg.fillStyle = this.paid ? "#e8d27a" : "#a89a60";
    mg.fillRect(X(PAY_POINT.x) - 7 * u, Z(PAY_POINT.z) - 5 * u, 14 * u, 10 * u);
    mg.fillStyle = "#cfd8b0";
    mg.fillText("Register", X(PAY_POINT.x), Z(PAY_POINT.z) - 10 * u);
    mg.fillStyle = this.paid ? "#40ff60" : "#ff4040";
    mg.fillText("Exit", X(0), Z(-ZI) + 15 * u);
    mg.save();
    mg.translate(X(P.x), Z(P.z));
    mg.rotate(-P.yaw);
    mg.fillStyle = "#fff";
    mg.beginPath();
    mg.moveTo(0, -9 * u);
    mg.lineTo(6 * u, 6 * u);
    mg.lineTo(-6 * u, 6 * u);
    mg.closePath();
    mg.fill();
    mg.restore();
  }

  // --- Main update -------------------------------------------------------------------------------------------

  private update(dt: number) {
    const { P, W, cr, sfx, keys } = this;
    const C = cr.C;
    this.gameTime += dt;
    const caughtNow = this.caughtT >= 0;
    const playing = !caughtNow;
    if (playing && P.hidden == null) {
      const fwd = Math.max(-1, Math.min(1, (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) + this.stick.y));
      const str = Math.max(-1, Math.min(1, (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + this.stick.x));
      P.stamLock = Math.max(0, P.stamLock - dt);
      const wantSprint = (keys.has("ShiftLeft") || keys.has("ShiftRight") || this.stick.run) && fwd > 0 && !P.crouch && P.stam > 0 && P.stamLock <= 0;
      let max = P.crouch ? 1.6 : 3.1;
      if (wantSprint) {
        max = 5.2;
        P.stam -= 16 * dt;
        if (P.stam <= 0) {
          P.stam = 0;
          P.stamLock = 3;
          sfx.exhale();
        }
      } else if (P.stamLock <= 0) P.stam = Math.min(100, P.stam + (fwd || str ? 9 : 18) * dt);
      else P.stam = Math.min(100, P.stam + 6 * dt);
      let ix = str;
      let iz = -fwd;
      const il = Math.hypot(ix, iz) || 1;
      if (il > 1) {
        ix /= il;
        iz /= il;
      }
      const sy = Math.sin(P.yaw);
      const cy = Math.cos(P.yaw);
      const mv = fwd || str ? 1 : 0;
      const tvx = (ix * cy + iz * sy) * max * mv;
      const tvz = (-ix * sy + iz * cy) * max * mv;
      const k = Math.min(1, dt * (mv ? 5 : 3));
      P.vx += (tvx - P.vx) * k;
      P.vz += (tvz - P.vz) * k;
      P.x += P.vx * dt;
      P.z += P.vz * dt;
      W.collide(P, 0.6);
      {
        // the cart collides too: push the player back when it hits a shelf
        const cx0 = P.x - Math.sin(P.yaw) * CART_D;
        const cz0 = P.z - Math.cos(P.yaw) * CART_D;
        const q = { x: cx0, z: cz0 };
        W.collide(q, 0.5);
        P.x += q.x - cx0;
        P.z += q.z - cz0;
        W.collide(P, 0.6);
      }
      P.speed = Math.hypot(P.vx, P.vz);
      P.noise = P.speed < 0.3 ? 1.2 : wantSprint ? 15 : P.crouch ? 3 : 7;
      P.bob += dt * P.speed * (wantSprint ? 2.1 : 2.6);
      if (P.speed > 0.5) {
        P.stepT -= dt * P.speed;
        if (P.stepT <= 0) {
          P.stepT = 2.2;
          sfx.step(wantSprint ? 1.7 : P.crouch ? 0.4 : 1);
        }
        if (Math.random() < dt * (P.speed / 3) * 1.4) sfx.squeak();
      }
      P.eye += ((P.crouch ? 1.05 : 1.65) - P.eye) * Math.min(1, dt * 8);
    } else if (P.hidden != null) {
      P.speed = 0;
      P.noise = 0.4;
      P.eye = 1.5;
      P.vx = P.vz = 0;
      P.stam = Math.min(100, P.stam + 14 * dt);
    }
    if (caughtNow) {
      this.caughtT += dt;
      P.vx = P.vz = 0;
      P.speed = 0;
      if (this.caughtT > 2) {
        this.endDead();
        return;
      }
    }

    // camera
    const camera = this.camera;
    const bobY = Math.sin(P.bob * 2) * 0.035 * Math.min(1, P.speed / 3);
    const bobX = Math.cos(P.bob) * 0.02 * Math.min(1, P.speed / 3);
    camera.position.set(P.x + bobX, P.eye + bobY, P.z);
    camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob) * 0.004 * P.speed);
    if (caughtNow) {
      const ddx = C.x - P.x;
      const ddz = C.z - P.z;
      camera.rotation.y = Math.atan2(-ddx, -ddz);
      camera.rotation.x = Math.atan2(1.9 - P.eye, Math.hypot(ddx, ddz));
      camera.position.x += (Math.random() - 0.5) * 0.08;
      camera.position.y += (Math.random() - 0.5) * 0.08;
    }
    this.placeCart(Math.abs(Math.sin(P.bob * 2)) * 0.012 * Math.min(1, P.speed / 3));
    // flashlight (flickers when it is near)
    let fl = P.flash ? 4.4 : 0;
    const nearC = Math.hypot(C.x - P.x, C.z - P.z);
    if (P.flash && nearC < 14 && C.mode !== "dormant" && playing) {
      const f = Math.max(0, 1 - nearC / 14);
      if (Math.random() < f * 0.35) fl *= Math.random() < 0.4 ? 0 : 0.4;
    }
    this.spot.intensity = fl * LIGHT;
    this.fill.intensity = (P.hidden != null ? 0.08 : 0.22) * LIGHT;
    this.beam.visible = fl > 0;
    this.beam.material.opacity = 0.03 + 0.02 * Math.min(1, fl / 4);
    // creature
    const ctx = { P, phase2: this.phase2, caught: this.caught, msg: (k: "spotted" | "search") => this.msgKey(k), playing, caughtPose: caughtNow };
    let info = { dist: 99, sees: false };
    if (playing) info = cr.update(dt, ctx);
    cr.animate(dt, this.gameTime, P, ctx);

    // fear / chase meters
    const closeness = Math.max(0, 1 - info.dist / 24);
    const tf = C.mode === "dormant" ? 0 : closeness * (C.mode === "chase" ? 1 : 0.65);
    this.fear += (tf - this.fear) * Math.min(1, dt * (tf > this.fear ? 2 : 0.6));
    const tc = C.mode === "chase" && playing ? 1 : 0;
    this.chaseAmt += (tc - this.chaseAmt) * Math.min(1, dt * (tc > this.chaseAmt ? 3 : 0.8));
    if (caughtNow) {
      this.fear = 1;
      this.chaseAmt = 0;
    }
    if (this.overlays.fear) this.overlays.fear.style.opacity = String(Math.min(1, this.fear * 1.05 + this.chaseAmt * 0.22));
    this.alertState = C.mode === "chase" && playing ? "run" : this.fear > 0.45 ? "near" : null;

    if (playing) {
      this.hbT -= dt;
      if (this.hbT <= 0) {
        if (this.fear > 0.12) {
          sfx.heartbeat(0.35 + this.fear * 0.6);
          this.hbT = 1.05 - this.fear * 0.6;
        } else this.hbT = 0.5;
      }
      this.eventT -= dt;
      if (this.eventT <= 0) {
        this.eventT = 14 + Math.random() * 22;
        const r = Math.random();
        if (r < 0.5) sfx.clang();
        else if (r < 0.8) sfx.whisper();
        else sfx.rumble();
        if (Math.random() < 0.35) W.blackout = 0.4 + Math.random() * 0.6;
      }
      this.paT -= dt;
      if (this.paT <= 0) {
        this.paT = 55 + Math.random() * 40;
        sfx.pa();
      }
      this.blT -= dt;
      if (this.blT <= 0) {
        this.blT = 50 + Math.random() * 50;
        W.blackout = 2 + Math.random() * 2;
        if (Math.random() < 0.5) sfx.whisper();
      }
      // what can the player interact with?
      this.promptKind = null;
      this.promptTarget = null;
      let txt: string | null = null;
      if (P.hidden != null) {
        this.promptKind = "leave";
        txt = TX.leave;
      } else {
        let bd = 2.7;
        for (const it of W.items) {
          if (it.got) continue;
          const d = Math.hypot(it.def.x - P.x, it.def.z - P.z);
          if (d < bd) {
            bd = d;
            this.promptKind = "item";
            this.promptTarget = it;
          }
        }
        if (this.promptKind === "item") txt = `${TX.pick}: ${(this.promptTarget as Item).def.name}`;
        else {
          let hb = 2.8;
          W.hides.forEach((h, i) => {
            const d = Math.hypot(h.x + h.ox * 1.1 - P.x, h.z + h.oz * 1.1 - P.z);
            if (d < hb) {
              hb = d;
              this.promptKind = "hide";
              this.promptTarget = i;
            }
          });
          if (this.promptKind === "hide") txt = TX.hide;
          else if (Math.hypot(PAY_POINT.x - P.x, PAY_POINT.z + 3 - P.z) < 3.2 && !this.paid && P.z > PAY_POINT.z) {
            this.promptKind = "pay";
            txt = TX.pay + (this.collected < ITEMS ? `  (${this.collected}/${ITEMS})` : "");
          }
        }
      }
      if (this.promptKind !== this.lastPromptKind) {
        if (this.promptKind && this.promptKind !== "leave") sfx.tick();
        this.lastPromptKind = this.promptKind;
      }
      this.promptText = txt;
      if (this.paid && W.door?.open && P.z < -45.4 && Math.abs(P.x) < 1.5) {
        this.winGame();
        return;
      }
      if (!this.paid && P.z < -45.4 && Math.abs(P.x) < 1.6 && Math.random() < dt * 2) this.msgKey("locked");
    } else this.promptText = null;

    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    sfx.update({ chase: this.chaseAmt, fear: this.fear, speed: P.speed, cx: C.x, cz: C.z, px: P.x, pz: P.z, fx, fz });
    this.emitHud();
  }

  /** Behind the menu and result screens: the view from the entrance, slowly looking round. */
  private idle(dt: number) {
    this.gameTime += dt;
    const yaw = Math.sin(this.gameTime * 0.12) * 0.55;
    this.camera.position.set(SPAWN.x, 1.65, SPAWN.z);
    this.camera.rotation.set(-0.02, yaw, 0);
    this.spot.intensity = 4.4 * LIGHT;
    this.beam.visible = true;
    if (this.cart) {
      this.cart.visible = true;
      this.cart.scale.setScalar(1.1);
      this.cart.position.set(SPAWN.x, 0, SPAWN.z - CART_D);
      this.cart.rotation.y = 0;
    }
    if (this.overlays.fear) this.overlays.fear.style.opacity = "0";
    this.cr.animate(dt, this.gameTime, { x: 0, z: 99, yaw: 0 }, { playing: false, caughtPose: false });
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, Math.max(0, raw));
    if (!this.built) return;
    if (this.phase === "playing") this.update(dt);
    else if (this.phase === "menu" || this.phase === "over") this.idle(dt);
    if (this.phase !== "paused") {
      this.W.updateLights(dt, this.camera.position.x, this.camera.position.z);
      this.W.tick(dt, this.gameTime);
      this.renderer.render(this.scene, this.camera);
      if (raw > 0 && raw < 0.25) this.adaptResolution(raw);
    }
  };

  private adaptResolution(real: number) {
    const r = this.res;
    if ((r.wait -= real) > 0) return; // shaders compiling, first frames settling
    r.acc += real;
    r.n++;
    if (r.acc < 1.5) return;
    const avg = r.acc / r.n;
    r.acc = 0;
    r.n = 0;
    let next = r.cur;
    if (avg > 1 / 45 && r.cur > r.min) {
      next = Math.max(r.min, r.cur - 0.25);
      r.good = 0;
    } else if (avg < 1 / 58 && r.cur < r.max) {
      if (++r.good >= 3) {
        next = Math.min(r.max, r.cur + 0.25);
        r.good = 0;
      }
    } else r.good = 0;
    if (Math.abs(next - r.cur) > 0.01) {
      r.cur = next;
      r.wait = 1;
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
    // phones held upright see less to the sides: open the field of view a little
    this.camera.fov = w / h < 1 ? 88 : 78;
    this.camera.updateProjectionMatrix();
  }

  // --- HUD -------------------------------------------------------------------------------------------------

  private emitHud(force = false) {
    if (!this.built) return;
    const P = this.P;
    const hud: Hud = {
      collected: this.collected,
      got: this.W.items.map((it) => it.got),
      paid: this.paid,
      objective: !this.paid ? (this.collected < ITEMS ? `${TX.obj0}  (${this.collected}/${ITEMS})` : TX.obj1) : TX.obj2,
      alert: this.caughtT >= 0 ? null : this.alertState,
      stamina: Math.round(P.stam / 2) * 2,
      winded: P.stamLock > 0,
      cans: P.cans,
      prompt: this.caughtT >= 0 ? null : this.promptText,
      hidden: P.hidden != null,
      flash: P.flash,
      crouch: P.crouch,
      mapOpen: this.mapOpen,
      locked: this.touch || document.pointerLockElement === this.canvas,
    };
    const key = JSON.stringify(hud);
    if (!force && key === this.hudCache) return;
    this.hudCache = key;
    this.events.hud(hud);
  }

  // --- Disposal ---------------------------------------------------------------------------------------------

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearTimers();
    this.resizeObserver?.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.canvas.removeEventListener("click", this.onCanvasClick);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    audio.hold(false);
    this.sfx.dispose();
    this.cr.dispose();
    this.clearCart();
    disposeTree(this.scene);
    this.W.dispose();
    this.renderer.resetState();
    this.renderer.dispose();
    legacyLights(false);
  }
}
