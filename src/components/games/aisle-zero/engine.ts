import * as THREE from "three";
import { AdaptiveRes } from "../shared/adaptive-res";
import { audio } from "../shared/audio";
import { disposeTree, loadModels, type LoadProgress } from "../shared/assets";
import { Sfx } from "./audio";
import { GEAR_VALUES, goalText, NIGHTS, STAR, type GearId, type ItemDef, type NightDef } from "./content";
import { Creatures, type CreatureCtx, type Prey } from "./creature";
import { AISLES, BACK_Z, BREAKERS, DOOR_IDS, DOORS, doorCenter, PART_X, PAY_POINT, SENSOR_R, SPAWN, XI, ZI, type DoorId, type Slot } from "./layout";
import { MODELS } from "./manifest";
import { LIGHT, StoreWorld, type Item, type Pickup, type Vec2 } from "./world";

/**
 * Aisle Zero: the first-person player and their cart, a night's objectives (the list, keys, fuses, the breaker,
 * paying, the exit), input (keyboard, mouse look, touch), HUD events, the store map and the main loop.
 * The store is in world.ts, the creatures in creature.ts, the nights in content.ts.
 *
 * The game was lit with three.js' old light units and light falloff (before r155): the engine multiplies
 * intensities by LIGHT and, while it runs, swaps the old distance falloff back into the shader chunk and
 * turns colour management off, so the store looks exactly as it was designed. dispose() restores both.
 */

const PI = Math.PI;
const CART_D = 1.35; // how far ahead of the player the cart centre rides
const LOOK = [0.6, 1, 1.5];

export type Phase = "loading" | "menu" | "playing" | "paused" | "over" | "error";

/** What the player takes into a night from the staff shop. */
export interface Loadout {
  gear: Record<GearId, number>;
  cart: string;
  /** Look speed: 0 slow, 1 normal, 2 fast. */
  look: number;
}

export interface ListEntry {
  id: string;
  name: string;
  where: string;
  color: number;
}

/** Something to do besides the list: fetch a key, find the fuses, throw the breaker. */
export interface Task {
  id: string;
  text: string;
  where: string;
  done: boolean;
}

/** The night that has just started (the list does not change while it runs). */
export interface NightInfo {
  index: number;
  name: string;
  list: ListEntry[];
  par: number;
  goal: string;
}

export interface Hud {
  collected: number;
  total: number;
  got: boolean[];
  tasks: Task[];
  paid: boolean;
  objective: string;
  /** "run" while it chases you, "her" while the hooded woman closes in unseen, "near" when it is close. */
  alert: "run" | "her" | "near" | null;
  stamina: number;
  winded: boolean;
  /** Torch charge, 0–100. */
  battery: number;
  /** The torch is dead for a moment (her scream). */
  torchOut: boolean;
  cans: number;
  coins: number;
  /** Whole seconds into the night. */
  time: number;
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
  night: number;
  collected: number;
  total: number;
  time: number;
  line: string;
  /** Stars won this run (bits, see STAR in content.ts) and which. */
  stars: number;
  inTime: boolean;
  unseen: boolean;
  goalDone: boolean;
  coins: number;
  by: "wendigo" | "ghost" | null;
}

export interface GameEvents {
  progress(p: LoadProgress): void;
  phase(phase: Phase): void;
  hud(hud: Hud): void;
  night(info: NightInfo): void;
  /** A line of story text at the bottom of the screen. */
  message(text: string, ms: number): void;
  /** An item went into the cart. */
  picked(def: ItemDef, collected: number, total: number): void;
  result(result: Result): void;
  error(message: string): void;
}

/** Full-screen overlays the engine drives every frame (no React re-render). */
export interface Overlays {
  fear: HTMLElement | null;
  flash: HTMLElement | null;
  /** The cold at the edge of the screen while the hooded woman is near. */
  chill: HTMLElement | null;
}

const TX = {
  pick: "Pick up",
  take: "Take",
  hide: "Hide inside",
  leave: "Come out",
  pay: "Pay & scan",
  start: "Push the cart. Find everything on the list.",
  sound: "Something is moving in the dark...",
  spotted: "It saw you! RUN!",
  search: "It is searching for you...",
  lockers: "It is opening the lockers...",
  dark: "The lights died!",
  exitLocked: "Locked. Collect everything and pay first.",
  paid: "BEEP. The emergency exit unlocked. It heard the alarm. RUN!",
  needPay: "Everything collected. Now pay at register 4.",
  needPower: "Everything collected, but the register is dead. Get the power back on.",
  noPower: "The register is dead. Throw the breaker first.",
  powerOn: "The lights are back, and it heard the breaker.",
  powerGone: "The power is gone. For good.",
  thrown: "Clink! It looks that way...",
  nocans: "Nothing left to throw.",
  hidden: "You are hiding. Hold still...",
  alarm: "A sensor went off! It is coming to look.",
  battery: "Battery in. The torch is brighter.",
  flat: "The torch is flat. Find a battery.",
  her: "She is here. Do not look away. Hold your torch on her.",
  banished: "She is gone. For now.",
  scream: "She screamed. Your torch is dead, and it is coming.",
  noCarts: "She found nothing to take.",
  dead: ["The cart is standing alone now...", "It knows your name. Can you hear it?", "Nobody leaves this store.", "Next time run. Do not stop."],
  taken: ["You looked away.", "She was right behind you.", "The hood was the last thing you saw."],
} as const;
type MsgKey = Exclude<keyof typeof TX, "dead" | "taken">;

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

type PromptKind = "item" | "pickup" | "hide" | "door" | "breaker" | "pay" | "leave";

const NO_GEAR: Record<GearId, number> = { battery: 0, lens: 0, soles: 0, pouch: 0, lungs: 0, wheels: 0 };

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
  private hands: THREE.Group | null = null;
  private showcase = false;
  private readonly cartItems = new THREE.Group();
  private raf = 0;
  private last = 0;
  private disposed = false;
  private built = false;
  private resizeObserver: ResizeObserver | null = null;
  private readonly autoRes: AdaptiveRes;
  private readonly touch: boolean;

  // The night
  private nightIndex = 0;
  private night: NightDef = NIGHTS[0];
  /** Tonight's list, in list order. */
  private list: Item[] = [];
  /** Items in the cart, in the order they went in (she takes the last one back). */
  private order: Item[] = [];
  private loadout: Loadout = { gear: NO_GEAR, cart: "steel", look: 1 };
  /** What the gear is worth tonight. */
  private readonly kit = { battery: 150, range: 40, angle: 0.5, power: 4.4, walk: 7, run: 15, cans: 3, stamina: 100, sneak: 3, squeak: 1 };

  // State
  private phase: Phase = "loading";
  private caughtT = -1;
  private caughtBy: "wendigo" | "ghost" = "wendigo";
  private readonly P = {
    x: 0,
    z: 0,
    yaw: PI,
    pitch: 0,
    vx: 0,
    vz: 0,
    stam: 100,
    stamLock: 0,
    crouch: false,
    eye: 1.65,
    bob: 0,
    stepT: 0,
    speed: 0,
    flash: true,
    /** Seconds of light left, and seconds the torch stays dead after her scream. */
    batt: 150,
    flashDead: 0,
    noise: 1,
    hidden: null as number | null,
    cans: 3,
  };
  private readonly prey: Prey = { x: 0, z: 0, yaw: 0, speed: 0, noise: 1, lit: false, beam: 20, crouch: false, hidden: null };
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
  private readonly keyring = new Set<DoorId>();
  private fuses = 0;
  /** What happened tonight, for the stars. */
  private readonly stats = { spotted: false, hid: false, cans: 0, sprinted: false, alarms: 0, torch: 0, coins: 0, banished: 0, touched: false, lured: false, bonus: false };
  private told = { her: false, flat: false };
  private promptKind: PromptKind | null = null;
  private promptTarget: Item | Pickup | DoorId | number | null = null;
  private promptText: string | null = null;
  private lastPromptKind: string | null = null;
  private mapOpen = false;
  private alertState: Hud["alert"] = null;
  private hudCache = "";
  /** Things due later on the game clock (they wait while the game is paused). */
  private readonly due: { t: number; fn: () => void }[] = [];
  private readonly timers: number[] = [];
  private readonly ctx: CreatureCtx;
  /** Test switches (set from the dev hook only): god — nothing can catch the player. */
  readonly dev = { god: false };

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
    // Starts at a safe sharpness, climbs to the screen's own (up to 2×) while frames stay smooth, steps down when they do not.
    this.autoRes = new AdaptiveRes(this.renderer, () => this.resize(), { start: this.touch ? 1.5 : 2 });
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
    this.ctx = {
      P: this.prey,
      phase2: false,
      playing: false,
      caughtPose: false,
      caught: (by) => this.caught(by),
      msg: (k) => this.msgKey(k),
      spotted: () => {
        this.stats.spotted = true;
      },
      ghostTouch: () => this.ghostTouch(),
      ghostBanished: () => {
        this.stats.banished++;
        this.msgKey("banished");
      },
      ghostAppeared: () => {
        if (this.told.her) return;
        this.told.her = true;
        this.events.message(TX.her, 5200);
      },
    };

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

  async load(sizes: Record<string, number>, loadout: Loadout) {
    try {
      const models = await loadModels(MODELS, this.renderer, (p) => !this.disposed && this.events.progress(p), { sizes });
      if (this.disposed) return;
      this.W.build(this.renderer, this.scene);
      this.cr.build(this.scene, models);
      this.buildCart();
      this.built = true;
      this.setLoadout(loadout);
      this.resetGame();
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
    cart.add((this.hands = this.buildHands()));
    this.scene.add(cart);
  }

  /** The staff shop is open: the menu's camera looks at the cart (left of centre: the shop covers the right). */
  setShowcase(on: boolean) {
    this.showcase = on;
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
    m.position.set(-0.15 + (n % 3) * 0.15, 0.43 + Math.floor(n / 9) * 0.21, -0.22 + (Math.floor(n / 3) % 3) * 0.24);
    m.rotation.y = Math.random() * 3;
    m.castShadow = true;
    this.cartItems.add(m);
  }

  private dropFromCart(m: THREE.Mesh) {
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
    m.removeFromParent();
  }

  private clearCart() {
    for (const m of [...this.cartItems.children] as THREE.Mesh[]) this.dropFromCart(m);
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

  /** Runs `fn` after `s` seconds of play (not while paused). */
  private after(s: number, fn: () => void) {
    this.due.push({ t: this.gameTime + s, fn });
  }
  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }
  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.length = 0;
    this.due.length = 0;
  }

  /** The gear and cart the player owns: applies to the cart at once, to everything else from the next night. */
  setLoadout(loadout: Loadout) {
    this.loadout = loadout;
    if (this.built) this.W.paintCart(loadout.cart);
  }

  private applyKit() {
    const g = this.loadout.gear;
    const at = <T>(list: readonly T[], level: number) => list[Math.max(0, Math.min(list.length - 1, level | 0))];
    const lens = at(GEAR_VALUES.lens, g.lens);
    const soles = at(GEAR_VALUES.soles, g.soles);
    const wheels = at(GEAR_VALUES.wheels, g.wheels);
    Object.assign(this.kit, {
      battery: at(GEAR_VALUES.battery, g.battery),
      range: lens.range,
      angle: lens.angle,
      power: lens.power,
      walk: soles.walk,
      run: soles.run,
      cans: at(GEAR_VALUES.pouch, g.pouch),
      stamina: at(GEAR_VALUES.lungs, g.lungs),
      sneak: wheels.sneak,
      squeak: wheels.squeak,
    });
    this.spot.distance = this.kit.range;
    this.spot.angle = this.kit.angle;
    const wide = Math.tan(this.kit.angle) / Math.tan(0.5);
    this.beam.scale.set(wide, wide, this.kit.range / 40);
  }

  /** Puts the store, the creatures and the player in the state the night starts in. */
  private resetGame() {
    const W = this.W;
    const night = (this.night = NIGHTS[this.nightIndex] ?? NIGHTS[0]);
    this.applyKit();
    W.paintCart(this.loadout.cart);
    W.applyNight(night, this.nightIndex);
    this.list = night.items.map((id) => W.items.find((it) => it.def.id === id)).filter((it): it is Item => !!it);
    this.order = [];
    this.clearCart();
    this.collected = 0;
    this.paid = false;
    this.phase2 = false;
    this.gameTime = 0;
    this.keyring.clear();
    this.fuses = 0;
    Object.assign(this.stats, { spotted: false, hid: false, cans: 0, sprinted: false, alarms: 0, torch: 0, coins: 0, banished: 0, touched: false, lured: false, bonus: false });
    this.told = { her: false, flat: false };
    Object.assign(this.P, { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, pitch: 0, vx: 0, vz: 0, stam: this.kit.stamina, stamLock: 0, crouch: false, eye: 1.65, flash: true, batt: this.kit.battery, flashDead: 0, hidden: null, cans: this.kit.cans, noise: 1, speed: 0 });
    if (this.cart) this.cart.visible = true;
    if (this.hands) this.hands.visible = true;
    // it sleeps in the stock room when the shutters are up, in the far corner of the shop floor when they are down
    const start: Vec2 = night.doors.stockW === "open" || night.doors.stockE === "open" ? [0, -40] : [AISLES[9].x, BACK_Z + 2.4];
    this.cr.setup(night.creature, night.ghost, start, !night.ghost && this.nightIndex >= 6);
    this.fear = 0;
    this.chaseAmt = 0;
    this.caughtT = -1;
    this.eventT = 20;
    this.paT = 35;
    this.blT = 55;
    this.mapOpen = false;
    this.promptKind = null;
    this.promptTarget = null;
    this.promptText = null;
    this.stick.x = this.stick.y = 0;
    this.stick.run = false;
    for (const o of [this.overlays.fear, this.overlays.chill]) if (o) o.style.opacity = "0";
  }

  /** Starts night `index` (0-based) with the player's gear. */
  start(index: number, loadout: Loadout = this.loadout) {
    if (!this.built) return;
    this.clearTimers();
    audio.hold(false);
    this.sfx.init();
    this.sfx.uiConfirm();
    this.nightIndex = Math.max(0, Math.min(NIGHTS.length - 1, index | 0));
    this.loadout = loadout;
    this.resetGame();
    this.events.night({
      index: this.nightIndex,
      name: this.night.name,
      list: this.list.map((it) => ({ id: it.def.id, name: it.def.name, where: it.slot.where, color: it.def.color })),
      par: this.night.par,
      goal: goalText(this.night.goal),
    });
    this.setPhase("playing");
    this.lockPointer();
    this.after(0.7, () => this.events.message(TX.start, 5200));
    if (this.night.creature.delay > 12) this.after(11, () => this.msgKey("sound"));
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
    this.setPhase("menu");
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.events.phase(phase);
    if (phase !== "playing" && phase !== "paused") this.sfx.update({ chase: 0, fear: 0, speed: 0, present: false, quiet: false, cx: 0, cz: -99, px: this.P.x, pz: this.P.z, fx: 0, fz: -1 });
  }

  private msgKey(k: MsgKey) {
    this.events.message(TX[k], k === "paid" || k === "her" ? 6500 : 3200);
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
    k *= LOOK[this.loadout.look] ?? 1;
    if (P.hidden != null) {
      const h = this.W.hides[P.hidden];
      const base = Math.atan2(-h.ox, -h.oz);
      // the shortest way round, so a locker facing "backwards" does not snap the view
      let off = P.yaw - dx * k - base;
      while (off > PI) off -= PI * 2;
      while (off < -PI) off += PI * 2;
      P.yaw = base + Math.max(-0.9, Math.min(0.9, off));
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
    const P = this.P;
    if (this.phase !== "playing" || P.hidden != null || this.caughtT >= 0) return;
    this.sfx.flashClick();
    if (!P.flash && P.batt <= 0) {
      this.msgKey("flat");
      return;
    }
    P.flash = !P.flash;
    this.emitHud();
  }

  toggleCrouch() {
    if (this.phase !== "playing" || this.P.hidden != null || this.caughtT >= 0) return;
    this.P.crouch = !this.P.crouch;
    this.sfx.crouch(this.P.crouch);
    this.emitHud();
  }

  toggleMap() {
    if (this.phase !== "playing" || this.caughtT >= 0) return;
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
    const t = this.promptTarget;
    if (this.promptKind === "item") this.pickup(t as Item);
    else if (this.promptKind === "pickup") this.takePickup(t as Pickup);
    else if (this.promptKind === "hide") this.enterHide(t as number);
    else if (this.promptKind === "door") this.tryDoor(t as DoorId);
    else if (this.promptKind === "breaker") this.throwBreaker();
    else if (this.promptKind === "pay") this.doPay();
  }

  /** The register works on mains power — or on its backup, on the nights the power cannot be fixed. */
  private canPay() {
    return this.W.power || this.W.breaker === null;
  }

  private pickup(it: Item) {
    if (!it || it.got || !it.active) return;
    const total = this.list.length;
    it.got = true;
    it.group.visible = false;
    this.collected++;
    this.order.push(it);
    this.sfx.pickup();
    this.sfx.ding();
    this.after(0.09, () => this.sfx.tone("sine", 990, 990, 0.35, 0.04));
    this.addToCart(it.def);
    this.events.picked(it.def, this.collected, total);
    // it hears things leave the shelves
    this.cr.hear(this.P.x, this.P.z);
    if (this.night.powerDiesAt === this.collected && this.W.power) {
      this.W.setPower(false);
      this.sfx.powerDown();
      this.msgKey("powerGone");
    } else if (this.collected === Math.ceil(total * 0.6) && this.collected < total && this.night.flicker > 0 && this.W.power) {
      this.W.blackout = 3.5;
      this.msgKey("dark");
    } else if (this.collected === 3 && total > 4) this.msgKey("sound");
    if (this.collected === total) this.events.message(this.canPay() ? TX.needPay : TX.needPower, 5500);
    this.emitHud();
  }

  /** A key, a fuse or the night's bonus item off a shelf. */
  private takePickup(p: Pickup) {
    if (!p || p.got || !p.active) return;
    p.got = true;
    p.group.visible = false;
    this.sfx.keyPick();
    if (p.kind === "key" && p.door) {
      this.keyring.add(p.door);
      this.events.message(`${p.name}: it opens the ${DOORS[p.door].name.toLowerCase()}.`, 3600);
    } else if (p.kind === "fuse") {
      this.fuses++;
      const need = this.night.power?.fuses?.length ?? 0;
      this.events.message(this.fuses >= need ? `All ${need} fuses. Now the breaker: ${this.W.breaker ? BREAKERS[this.W.breaker].where.toLowerCase() : ""}.` : `Fuse ${this.fuses} of ${need}.`, 3600);
    } else if (p.kind === "bonus") {
      this.stats.bonus = true;
      this.events.message(`${p.name}: take it out with you.`, 3600);
    }
    this.emitHud();
  }

  /** Coins and batteries are picked up by walking over them. */
  private sweepFloor() {
    const P = this.P;
    const cx = P.x - Math.sin(P.yaw) * CART_D;
    const cz = P.z - Math.cos(P.yaw) * CART_D;
    for (const p of this.W.pickups) {
      if (!p.active || p.got || p.slot) continue;
      if (Math.hypot(p.x - P.x, p.z - P.z) > 1.35 && Math.hypot(p.x - cx, p.z - cz) > 1.0) continue;
      if (p.kind === "battery") {
        // a full torch leaves the battery where it is
        if (P.batt >= this.kit.battery * 0.98) continue;
        P.batt = Math.min(this.kit.battery, P.batt + this.kit.battery * 0.45);
        this.told.flat = false;
        this.sfx.battery();
        this.msgKey("battery");
      } else {
        this.stats.coins++;
        this.sfx.coin();
      }
      p.got = true;
      p.group.visible = false;
    }
  }

  private tryDoor(id: DoorId) {
    const door = this.W.doors[id];
    if (!door.shut) return;
    const name = DOORS[id].name;
    if (door.rule === "key") {
      if (this.keyring.has(id)) {
        this.openGate(id);
        this.events.message(`${name}: open.`, 2600);
      } else {
        this.sfx.doorLocked();
        const key = this.W.pickups.find((p) => p.kind === "key" && p.door === id && p.active);
        this.events.message(key ? `Locked. Find the ${key.name.toLowerCase()} (${key.where}).` : "Locked.", 3600);
      }
      return;
    }
    this.sfx.doorLocked();
    this.events.message(door.rule === "power" ? "An electric shutter. It needs the power back." : door.rule === "pay" ? "It only opens with the alarm: pay first." : "Shut for the night.", 3200);
  }

  private openGate(id: DoorId) {
    if (!this.W.openGate(id)) return;
    this.sfx.shutter();
    const [x, z] = doorCenter(DOORS[id]);
    // it hears a shutter roll
    this.cr.hear(x, z);
  }

  private throwBreaker() {
    const W = this.W;
    if (W.power || !W.breaker) return;
    const need = this.night.power?.fuses?.length ?? 0;
    if (this.fuses < need) {
      this.sfx.doorLocked();
      this.events.message(`The box needs ${need} fuses. You have ${this.fuses}.`, 3200);
      return;
    }
    W.setPower(true);
    W.blackout = 0;
    this.sfx.breakerOn();
    for (const id of DOOR_IDS) if (W.doors[id].rule === "power") this.openGate(id);
    const b = BREAKERS[W.breaker];
    this.cr.hear(b.x + b.nx, b.z + b.nz, true);
    this.msgKey("powerOn");
    this.emitHud();
  }

  private doPay() {
    if (this.paid) return;
    const left = this.list.length - this.collected;
    if (left > 0) {
      this.events.message(`Not yet: ${left} more on the list.`, 3200);
      return;
    }
    if (!this.canPay()) {
      this.sfx.doorLocked();
      this.msgKey("noPower");
      return;
    }
    this.paid = true;
    this.phase2 = true;
    this.sfx.beep();
    this.after(0.16, () => this.sfx.beep());
    this.after(0.32, () => this.sfx.beep());
    this.after(0.5, () => {
      this.sfx.alarm();
      this.W.openDoor();
      this.sfx.doorOpen();
      for (const id of DOOR_IDS) if (this.W.doors[id].rule === "pay" && this.W.openGate(id)) this.sfx.shutter();
    });
    this.msgKey("paid");
    this.cr.alarm(this.P.x, this.P.z);
    this.after(0.9, () => this.sfx.roar(0.9));
    this.emitHud();
  }

  private enterHide(i: number) {
    const P = this.P;
    const C = this.cr.C;
    const h = this.W.hides[i];
    P.hidden = i;
    this.stats.hid = true;
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
    if (this.phase !== "playing" || P.hidden != null || this.caughtT >= 0) return;
    if (P.cans <= 0) {
      this.events.message(TX.nocans, 1800);
      return;
    }
    P.cans--;
    this.stats.cans++;
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
    this.after(0.45, () => {
      this.sfx.clang(0.7);
      this.events.message(TX.thrown, 2200);
      if (this.cr.hear(x, z)) this.stats.lured = true;
    });
    this.emitHud();
  }

  /** The hooded woman reached the player. */
  private ghostTouch() {
    const P = this.P;
    const kind = this.night.ghost?.touch ?? "scream";
    if (kind === "catch") {
      this.caught("ghost");
      return;
    }
    this.stats.touched = true;
    this.sfx.shriek();
    P.flashDead = 9;
    this.cr.hear(P.x, P.z, true);
    const it = kind === "steal" && !this.paid ? this.order.pop() : undefined;
    if (it) {
      it.got = false;
      it.group.visible = true;
      this.collected--;
      const last = this.cartItems.children[this.cartItems.children.length - 1] as THREE.Mesh | undefined;
      if (last) this.dropFromCart(last);
      this.events.message(`She screamed, and put the ${it.def.name.toLowerCase()} back on its shelf.`, 5200);
    } else this.msgKey("scream");
    const f = this.overlays.flash;
    if (f) {
      f.style.transition = "none";
      f.style.opacity = "0.55";
      this.later(() => {
        f.style.transition = "opacity .9s";
        f.style.opacity = "0";
      }, 60);
    }
    this.emitHud(true);
  }

  private caught(by: "wendigo" | "ghost") {
    if (this.phase !== "playing" || this.caughtT >= 0 || this.dev.god) return;
    const P = this.P;
    const C = this.cr.C;
    this.caughtT = 0;
    this.caughtBy = by;
    this.sfx.jump();
    if (P.hidden != null) {
      const h = this.W.hides[P.hidden];
      P.x = h.x + h.ox * 1.2;
      P.z = h.z + h.oz * 1.2;
      P.hidden = null;
      if (this.cart) this.cart.visible = false;
    }
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    if (by === "wendigo") {
      C.mode = "chase";
      C.x = P.x + fx * 1.5;
      C.z = P.z + fz * 1.5;
      C.yaw = Math.atan2(-fx, -fz);
    } else {
      const G = this.cr.G;
      G.active = true;
      G.burn = 0;
      G.x = P.x + fx * 1.2;
      G.z = P.z + fz * 1.2;
    }
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
  }

  private result(won: boolean): Result {
    const s = this.stats;
    const g = this.night.goal;
    const inTime = won && this.gameTime <= this.night.par;
    const unseen = won && !s.spotted;
    let goalDone = false;
    if (won)
      switch (g.kind) {
        case "coins":
          goalDone = s.coins >= g.n;
          break;
        case "lure":
          goalDone = s.lured;
          break;
        case "noHide":
          goalDone = !s.hid;
          break;
        case "noCans":
          goalDone = s.cans === 0;
          break;
        case "noSprint":
          goalDone = !s.sprinted;
          break;
        case "noAlarm":
          goalDone = s.alarms === 0;
          break;
        case "battery":
          goalDone = (this.P.batt / this.kit.battery) * 100 >= g.pct;
          break;
        case "torch":
          goalDone = s.torch < g.s;
          break;
        case "bonus":
          goalDone = s.bonus;
          break;
        case "banish":
          goalDone = s.banished >= g.n;
          break;
        case "noTouch":
          goalDone = !s.touched;
          break;
      }
    const pick = <T>(a: readonly T[]) => a[(Math.random() * a.length) | 0];
    return {
      won,
      night: this.nightIndex,
      collected: this.collected,
      total: this.list.length,
      time: this.gameTime,
      line: won ? "You pushed the cart out into the night air." : pick(this.caughtBy === "ghost" ? TX.taken : TX.dead),
      stars: (inTime ? STAR.time : 0) | (unseen ? STAR.unseen : 0) | (goalDone ? STAR.goal : 0),
      inTime,
      unseen,
      goalDone,
      coins: s.coins,
      by: won ? null : this.caughtBy,
    };
  }

  private endDead() {
    this.caughtT = -1;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.sfx.lose();
    this.sfx.quietChase();
    this.events.result(this.result(false));
    this.setPhase("over");
  }

  private winGame() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.sfx.win();
    this.events.result(this.result(true));
    this.setPhase("over");
  }

  // --- Map -------------------------------------------------------------------------------------------------

  /** Draws the store map (the outline, shelves, shutters, lockers, sensors, what is left to fetch, the register, the exit and you). */
  drawMap(mg: CanvasRenderingContext2D, w: number, h: number) {
    const W = this.W;
    const P = this.P;
    const sc = Math.min(w / 72, h / 94);
    const X = (x: number) => w / 2 + x * sc;
    const Z = (z: number) => h / 2 + z * sc;
    const u = sc / 8; // 1 at the map's design size (576 × 752)
    const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
    mg.clearRect(0, 0, w, h);
    mg.fillStyle = "rgba(8,12,12,.92)";
    mg.fillRect(0, 0, w, h);
    mg.strokeStyle = "#5c6a5c";
    mg.lineWidth = 2 * u;
    mg.strokeRect(X(-XI), Z(-ZI), XI * 2 * sc, ZI * 2 * sc);
    W.boxes.forEach((b) => {
      mg.fillStyle = b.kind === "shelf" ? "#3a4a3e" : b.kind === "wall" ? "#6a766a" : b.kind === "door" || b.kind === "gate" ? "#b33" : b.kind === "barricade" ? "#8a6a44" : "#4a4f46";
      const pad = b.kind === "gate" ? 0.25 : 0;
      mg.fillRect(X(b.x0 - pad), Z(b.z0 - pad), (b.x1 - b.x0 + pad * 2) * sc, (b.z1 - b.z0 + pad * 2) * sc);
    });
    W.sensors.forEach((s) => {
      if (!s.active) return;
      mg.strokeStyle = s.cool > 0 ? "#ffb0a0" : "#ff4a3a";
      mg.lineWidth = 1.5 * u;
      mg.beginPath();
      mg.arc(X(s.x), Z(s.z), SENSOR_R * sc, 0, 7);
      mg.stroke();
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
    mg.font = font(11);
    mg.fillStyle = "#7f8f8a";
    mg.fillText("Cold storage", X(-(XI + PART_X) / 2), Z(-ZI) + 14 * u);
    mg.fillText("Stock room", X(-9), Z(BACK_Z) - 7 * u);
    mg.fillText("Staff office", X((XI + PART_X) / 2), Z(-ZI) + 14 * u);
    const dot = (slot: { x: number; z: number }, color: string, label: string, r = 6) => {
      mg.fillStyle = color;
      mg.beginPath();
      mg.arc(X(slot.x), Z(slot.z), r * u, 0, 7);
      mg.fill();
      mg.strokeStyle = "#000";
      mg.lineWidth = 1.5 * u;
      mg.stroke();
      mg.fillStyle = "#000";
      mg.font = font(9);
      mg.fillText(label, X(slot.x), Z(slot.z) + 3 * u);
    };
    this.list.forEach((it, i) => !it.got && dot(it.slot, hex(it.def.color), String(i + 1)));
    for (const p of W.pickups) {
      if (!p.active || p.got || !p.slot || p.kind === "bonus") continue;
      dot(p.slot, p.kind === "key" ? "#6ad0ff" : "#ffb040", p.kind === "key" ? "K" : "F", 5);
    }
    if (W.breaker && !W.power) {
      const b = BREAKERS[W.breaker];
      mg.fillStyle = "#ffe14a";
      mg.fillRect(X(b.x + b.nx * 0.8) - 5 * u, Z(b.z + b.nz * 0.8) - 5 * u, 10 * u, 10 * u);
      mg.fillStyle = "#000";
      mg.font = font(9);
      mg.fillText("B", X(b.x + b.nx * 0.8), Z(b.z + b.nz * 0.8) + 3 * u);
    }
    mg.font = font(13);
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

  /** True when the player stands on the open side of a shelf slot, close enough to reach it. */
  private reaches(s: Slot) {
    const dx = this.P.x - s.x;
    const dz = this.P.z - s.z;
    return dx * dx + dz * dz < 2.6 * 2.6 && dx * s.nx + dz * s.nz > 0.15;
  }

  /** What the Use key would do right now. */
  private findPrompt() {
    const { P, W } = this;
    this.promptKind = null;
    this.promptTarget = null;
    if (P.hidden != null) {
      this.promptKind = "leave";
      return TX.leave;
    }
    let bd = Infinity;
    let text: string | null = null;
    for (const it of this.list) {
      if (it.got || !this.reaches(it.slot)) continue;
      const d = Math.hypot(it.slot.x - P.x, it.slot.z - P.z);
      if (d < bd) {
        bd = d;
        this.promptKind = "item";
        this.promptTarget = it;
        text = `${TX.pick}: ${it.def.name}`;
      }
    }
    for (const p of W.pickups) {
      if (!p.active || p.got || !p.slot || !this.reaches(p.slot)) continue;
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < bd) {
        bd = d;
        this.promptKind = "pickup";
        this.promptTarget = p;
        text = `${TX.take}: ${p.name}`;
      }
    }
    if (text) return text;
    let hb = 2.8;
    W.hides.forEach((h, i) => {
      const d = Math.hypot(h.x + h.ox * 1.1 - P.x, h.z + h.oz * 1.1 - P.z);
      if (d < hb) {
        hb = d;
        this.promptKind = "hide";
        this.promptTarget = i;
      }
    });
    if (this.promptKind === "hide") return TX.hide;
    for (const id of DOOR_IDS) {
      const door = W.doors[id];
      if (!door.shut) continue;
      const [x, z] = doorCenter(DOORS[id]);
      if (Math.hypot(x - P.x, z - P.z) > 3.1) continue;
      this.promptKind = "door";
      this.promptTarget = id;
      return door.rule === "key" && this.keyring.has(id) ? `Unlock: ${DOORS[id].name}` : `${DOORS[id].name} (locked)`;
    }
    if (W.breaker && !W.power) {
      const b = BREAKERS[W.breaker];
      if (Math.hypot(b.x - P.x, b.z - P.z) < 2.7) {
        const need = this.night.power?.fuses?.length ?? 0;
        this.promptKind = "breaker";
        return need ? `Throw the breaker  (fuses ${Math.min(this.fuses, need)}/${need})` : "Throw the breaker";
      }
    }
    if (Math.hypot(PAY_POINT.x - P.x, PAY_POINT.z + 3 - P.z) < 3.2 && !this.paid && P.z > PAY_POINT.z) {
      this.promptKind = "pay";
      const left = this.list.length - this.collected;
      return TX.pay + (left > 0 ? `  (${this.collected}/${this.list.length})` : "");
    }
    return null;
  }

  private update(dt: number) {
    const { P, W, cr, sfx, keys, kit } = this;
    const C = cr.C;
    this.gameTime += dt;
    // things due on the game clock
    for (let i = this.due.length - 1; i >= 0; i--) {
      if (this.due[i].t > this.gameTime) continue;
      const [job] = this.due.splice(i, 1);
      job.fn();
      if (this.phase !== "playing") return;
    }
    const caughtNow = this.caughtT >= 0;
    const playing = !caughtNow;
    let sprinting = false;
    if (playing && P.hidden == null) {
      const fwd = Math.max(-1, Math.min(1, (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) + this.stick.y));
      const str = Math.max(-1, Math.min(1, (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + this.stick.x));
      P.stamLock = Math.max(0, P.stamLock - dt);
      sprinting = (keys.has("ShiftLeft") || keys.has("ShiftRight") || this.stick.run) && fwd > 0 && !P.crouch && P.stam > 0 && P.stamLock <= 0;
      let max = P.crouch ? 1.6 : 3.1;
      if (sprinting) {
        max = 5.2;
        P.stam -= 16 * dt;
        if (P.stam <= 0) {
          P.stam = 0;
          P.stamLock = 3;
          sfx.exhale();
        }
      } else if (P.stamLock <= 0) P.stam = Math.min(kit.stamina, P.stam + (fwd || str ? 9 : 18) * dt);
      else P.stam = Math.min(kit.stamina, P.stam + 6 * dt);
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
      if (sprinting && P.speed > 3.6) this.stats.sprinted = true;
      P.noise = P.speed < 0.3 ? 1.2 : sprinting ? kit.run : P.crouch ? kit.sneak : kit.walk;
      P.bob += dt * P.speed * (sprinting ? 2.1 : 2.6);
      if (P.speed > 0.5) {
        P.stepT -= dt * P.speed;
        if (P.stepT <= 0) {
          P.stepT = 2.2;
          sfx.step(sprinting ? 1.7 : P.crouch ? 0.4 : 1);
        }
        if (Math.random() < dt * (P.speed / 3) * 1.4 * kit.squeak) sfx.squeak();
      }
      P.eye += ((P.crouch ? 1.05 : 1.65) - P.eye) * Math.min(1, dt * 8);
      this.sweepFloor();
      // theft sensors: anything faster than a sneak sets one off
      for (const s of W.sensors) {
        if (!s.active || s.cool > 0 || P.speed <= 1.9 || Math.hypot(s.x - P.x, s.z - P.z) > SENSOR_R) continue;
        s.cool = 14;
        this.stats.alarms++;
        sfx.sensorAlarm();
        cr.hear(s.x, s.z, true);
        this.msgKey("alarm");
      }
    } else if (P.hidden != null) {
      P.speed = 0;
      P.noise = 0.4;
      P.eye = 1.5;
      P.vx = P.vz = 0;
      P.stam = Math.min(kit.stamina, P.stam + 14 * dt);
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

    // torch: the battery drains while it shines
    P.flashDead = Math.max(0, P.flashDead - dt);
    const lit = P.flash && P.batt > 0 && P.flashDead <= 0 && P.hidden == null;
    if (lit && playing) {
      P.batt = Math.max(0, P.batt - dt * this.night.drain);
      this.stats.torch += dt;
      if (P.batt <= 0) {
        P.flash = false;
        sfx.torchDead();
        if (!this.told.flat) {
          this.told.flat = true;
          this.msgKey("flat");
        }
      }
    }

    // camera
    const camera = this.camera;
    const bobY = Math.sin(P.bob * 2) * 0.035 * Math.min(1, P.speed / 3);
    const bobX = Math.cos(P.bob) * 0.02 * Math.min(1, P.speed / 3);
    camera.position.set(P.x + bobX, P.eye + bobY, P.z);
    camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob) * 0.004 * P.speed);
    if (caughtNow) {
      const who = this.caughtBy === "ghost" ? cr.G : C;
      const ddx = who.x - P.x;
      const ddz = who.z - P.z;
      camera.rotation.y = Math.atan2(-ddx, -ddz);
      camera.rotation.x = Math.atan2((this.caughtBy === "ghost" ? 1.6 : 1.9) - P.eye, Math.hypot(ddx, ddz));
      camera.position.x += (Math.random() - 0.5) * 0.08;
      camera.position.y += (Math.random() - 0.5) * 0.08;
    }
    this.placeCart(Math.abs(Math.sin(P.bob * 2)) * 0.012 * Math.min(1, P.speed / 3));
    // flashlight (flickers when it is near, and when the battery is nearly flat)
    let fl = lit ? kit.power : 0;
    const nearC = Math.hypot(C.x - P.x, C.z - P.z);
    if (lit && nearC < 14 && C.mode !== "dormant" && playing) {
      const f = Math.max(0, 1 - nearC / 14);
      if (Math.random() < f * 0.35) fl *= Math.random() < 0.4 ? 0 : 0.4;
    }
    if (lit && P.batt < kit.battery * 0.12 && Math.random() < 0.12) fl *= 0.35;
    this.spot.intensity = fl * LIGHT;
    this.fill.intensity = (P.hidden != null ? 0.08 : 0.22) * LIGHT;
    this.beam.visible = fl > 0;
    this.beam.material.opacity = 0.03 + 0.02 * Math.min(1, fl / 4);

    // creatures
    const prey = this.prey;
    prey.x = P.x;
    prey.z = P.z;
    prey.yaw = P.yaw;
    prey.speed = P.speed;
    prey.noise = P.noise;
    prey.lit = lit;
    prey.beam = kit.range * 0.5;
    prey.crouch = P.crouch;
    prey.hidden = P.hidden;
    const ctx = this.ctx;
    ctx.phase2 = this.phase2;
    ctx.playing = playing;
    ctx.caughtPose = caughtNow;
    let info = { dist: 99, sees: false };
    if (playing) {
      info = cr.update(dt, ctx);
      if (this.caughtT < 0) cr.updateGhost(dt, ctx);
    }
    cr.animate(dt, this.gameTime, P, ctx);

    // fear / chase meters
    const closeness = Math.max(0, 1 - info.dist / 24);
    const tf = C.mode === "dormant" ? 0 : closeness * (C.mode === "chase" ? 1 : cr.lurking ? 0.3 : 0.65);
    this.fear += (tf - this.fear) * Math.min(1, dt * (tf > this.fear ? 2 : 0.6));
    const tc = C.mode === "chase" && playing ? 1 : 0;
    this.chaseAmt += (tc - this.chaseAmt) * Math.min(1, dt * (tc > this.chaseAmt ? 3 : 0.8));
    if (this.caughtT >= 0) {
      this.fear = 1;
      this.chaseAmt = 0;
    }
    if (this.overlays.fear) this.overlays.fear.style.opacity = String(Math.min(1, this.fear * 1.05 + this.chaseAmt * 0.22));
    const her = playing ? cr.ghostState : null;
    if (this.overlays.chill) this.overlays.chill.style.opacity = her ? String(Math.min(0.9, Math.max(0, 1 - her.dist / 16) * (her.watched ? 0.5 : 1))) : "0";
    this.alertState = !playing ? null : C.mode === "chase" ? "run" : her && !her.watched && her.dist < 13 ? "her" : this.fear > 0.45 ? "near" : null;

    if (playing && this.phase === "playing") {
      this.hbT -= dt;
      if (this.hbT <= 0) {
        if (this.fear > 0.12) {
          sfx.heartbeat(0.35 + this.fear * 0.6);
          this.hbT = 1.05 - this.fear * 0.6;
        } else this.hbT = 0.5;
      }
      const flicker = this.night.flicker;
      this.eventT -= dt;
      if (this.eventT <= 0) {
        this.eventT = 14 + Math.random() * 22;
        const r = Math.random();
        if (r < 0.5) sfx.clang();
        else if (r < 0.8) sfx.whisper();
        else sfx.rumble();
        if (Math.random() < 0.35 * flicker) W.blackout = 0.4 + Math.random() * 0.6;
      }
      this.paT -= dt;
      if (this.paT <= 0) {
        this.paT = 55 + Math.random() * 40;
        if (W.power) sfx.pa();
      }
      this.blT -= dt;
      if (this.blT <= 0) {
        this.blT = (50 + Math.random() * 50) / Math.max(0.4, flicker);
        if (flicker > 0 && W.power) {
          W.blackout = 2 + Math.random() * 2;
          if (Math.random() < 0.5) sfx.whisper();
        }
      }
      // what can the player interact with?
      this.promptText = this.findPrompt();
      if (this.promptKind !== this.lastPromptKind) {
        if (this.promptKind && this.promptKind !== "leave") sfx.tick();
        this.lastPromptKind = this.promptKind;
      }
      if (this.paid && W.door?.open && P.z < -45.4 && Math.abs(P.x) < 1.5) {
        this.winGame();
        return;
      }
      if (!this.paid && P.z < -45.4 && Math.abs(P.x) < 1.6 && Math.random() < dt * 2) this.msgKey("exitLocked");
    } else this.promptText = null;

    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    sfx.update({ chase: this.chaseAmt, fear: this.fear, speed: P.speed, present: C.mode !== "dormant", quiet: cr.lurking, cx: C.x, cz: C.z, px: P.x, pz: P.z, fx, fz });
    this.emitHud();
  }

  /** Behind the menu and result screens: the view from the entrance, slowly looking round. */
  private idle(dt: number) {
    this.gameTime += dt;
    if (this.showcase) {
      this.camera.position.set(SPAWN.x + 1.15, 1.5, SPAWN.z - 0.15);
      this.camera.lookAt(SPAWN.x + 0.55, 0.62, SPAWN.z - CART_D - 0.35);
    } else {
      const yaw = Math.sin(this.gameTime * 0.12) * 0.55;
      this.camera.position.set(SPAWN.x, 1.65, SPAWN.z);
      this.camera.rotation.set(-0.02, yaw, 0);
    }
    this.spot.intensity = this.kit.power * LIGHT;
    this.beam.visible = !this.showcase;
    if (this.hands) this.hands.visible = !this.showcase;
    if (this.cart) {
      this.cart.visible = true;
      this.cart.scale.setScalar(1.1);
      this.cart.position.set(SPAWN.x, 0, SPAWN.z - CART_D);
      this.cart.rotation.y = 0;
    }
    for (const o of [this.overlays.fear, this.overlays.chill]) if (o) o.style.opacity = "0";
    this.ctx.playing = false;
    this.ctx.caughtPose = false;
    this.cr.animate(dt, this.gameTime, { x: 0, z: 99, yaw: 0 }, this.ctx);
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
      // (before the render: a changed pixel ratio clears the canvas)
      if (raw > 0) this.autoRes.tick(raw);
      this.renderer.render(this.scene, this.camera);
    }
  };

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

  private tasks(): Task[] {
    const W = this.W;
    const out: Task[] = [];
    for (const p of W.pickups) {
      if (p.kind !== "key" || !p.active || !p.door) continue;
      const open = !W.doors[p.door].shut;
      out.push({ id: `key-${p.door}`, text: open ? `${DOORS[p.door].name}: open` : p.got ? `Unlock the ${DOORS[p.door].name.toLowerCase()}` : `Find the ${p.name.toLowerCase()}`, where: open || p.got ? "" : p.where, done: open });
    }
    const power = this.night.power;
    if (power?.breaker) {
      const need = power.fuses?.length ?? 0;
      if (need) out.push({ id: "fuses", text: `Find the fuses (${Math.min(this.fuses, need)}/${need})`, where: this.fuses >= need ? "" : "On the shelves: the amber glow", done: this.fuses >= need });
      out.push({ id: "breaker", text: "Throw the breaker", where: W.power ? "" : BREAKERS[power.breaker].where, done: W.power });
    }
    return out;
  }

  private objective() {
    const total = this.list.length;
    if (this.paid) return "RUN! Emergency exit at the back";
    if (this.collected < total) return `Collect the items on your list  (${this.collected}/${total})`;
    if (!this.canPay()) return "Get the power back on";
    return "Pay at register 4";
  }

  private emitHud(force = false) {
    if (!this.built) return;
    const P = this.P;
    const hud: Hud = {
      collected: this.collected,
      total: this.list.length,
      got: this.list.map((it) => it.got),
      tasks: this.tasks(),
      paid: this.paid,
      objective: this.objective(),
      alert: this.caughtT >= 0 ? null : this.alertState,
      stamina: Math.round((P.stam / this.kit.stamina) * 50) * 2,
      winded: P.stamLock > 0,
      battery: Math.ceil((P.batt / this.kit.battery) * 50) * 2,
      torchOut: P.flashDead > 0,
      cans: P.cans,
      coins: this.stats.coins,
      time: Math.floor(this.gameTime),
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
