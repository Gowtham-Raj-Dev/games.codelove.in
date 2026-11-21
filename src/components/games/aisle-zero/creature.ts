import * as THREE from "three";
import type { LoadedModel } from "../shared/assets";
import type { Sfx } from "./audio";
import type { CreatureCfg, GhostCfg, Trait } from "./content";
import { XI, ZI } from "./layout";
import { LIGHT, type StoreWorld, type Vec2 } from "./world";

/**
 * The Wendigo (library model ghosts/human-deer) and its roaming AI, and the hooded woman (ghosts/hooded-horror-woman)
 * who walks towards the player while nobody looks at her. How each behaves on a night comes from content.ts.
 */

const PI = Math.PI;
const DEER = { height: 2.75, yaw: PI };
const WOMAN = { height: 1.95, yaw: 0 };

/** check: walking to a locker to open it (the lockerChecker trait). */
export type Mode = "dormant" | "patrol" | "investigate" | "search" | "check" | "chase";

/** What the creature knows and wants. */
export interface Brain {
  x: number;
  z: number;
  yaw: number;
  mode: Mode;
  speed: number;
  target: Vec2 | null;
  wait: number;
  lastSeen: Vec2 | null;
  loseT: number;
  fieldT: number;
  notice: number;
  spawnDelay: number;
  stepT: number;
  searchT: number;
  investT: number;
  roarT: number;
  sniff: number;
  sawHide: Vec2 | null;
  fieldG: Vec2 | null;
  calm: number;
  look: number;
  /** Seconds left of hurrying to a loud noise. */
  rush: number;
  /** Sprinter: where it is in its charge / tire cycle. */
  burst: number;
  /** Ambusher: standing dark and silent. */
  lurk: boolean;
  /** Lockers it is about to open (indexes into the world's hides). */
  lockers: number[];
}

/** The player as the creatures see them. */
export interface Prey {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  noise: number;
  /** The torch is on and shining. */
  lit: boolean;
  /** How far the beam reaches. */
  beam: number;
  crouch: boolean;
  hidden: number | null;
}

export interface CreatureCtx {
  P: Prey;
  /** The alarm has gone off. */
  phase2: boolean;
  playing: boolean;
  caughtPose: boolean;
  caught(by: "wendigo" | "ghost"): void;
  msg(key: "spotted" | "search" | "lockers"): void;
  /** It has seen the player and gives chase (not the chase the alarm starts). */
  spotted(): void;
  ghostTouch(): void;
  ghostBanished(): void;
  ghostAppeared(): void;
}

interface Rig {
  holder: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
}

/** The hooded woman's state. */
interface Ghost {
  active: boolean;
  x: number;
  z: number;
  /** Seconds until she appears next. */
  timer: number;
  /** How long the torch has been held on her. */
  burn: number;
  watched: boolean;
  life: number;
  whisperT: number;
  fieldT: number;
  fieldG: Vec2 | null;
  navV: number;
  /** Harmless apparitions (before she matters): how many so far, and how long she has been stared at. */
  count: number;
  seenT: number;
}

const DEFAULT_CFG: CreatureCfg = { delay: 25, patrol: 1.9, invest: 2.9, search: 2.4, chase: 4.2, chase2: 4.6, sight: 1, hearing: 1, notice: 1, lose: 6, calm: 70, sniff: 1, traits: [] };

const turn = (from: number, to: number, k: number) => {
  let dy = to - from;
  while (dy > PI) dy -= PI * 2;
  while (dy < -PI) dy += PI * 2;
  return from + dy * Math.min(1, k);
};

/**
 * The library GLBs are Sketchfab exports in arbitrary units and origins: scale/offset a skinned model from
 * its bones so it stands on the floor, centred, `height` metres tall.
 */
function fitSkinned(model: THREE.Object3D, mixer: THREE.AnimationMixer, action: THREE.AnimationAction, height: number, yaw: number, sink = 0) {
  action.play();
  action.time = 0;
  action.paused = true;
  mixer.update(0);
  model.updateMatrixWorld(true);
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) {
      o.getWorldPosition(v);
      b.expandByPoint(v);
    }
  });
  if (b.isEmpty()) b.setFromObject(model);
  const h = Math.max(0.01, b.max.y - b.min.y);
  const s = height / h;
  model.scale.setScalar(s);
  model.position.set(-((b.min.x + b.max.x) / 2) * s, -b.min.y * s - sink, -((b.min.z + b.max.z) / 2) * s);
  const pivot = new THREE.Group();
  pivot.rotation.y = yaw;
  model.parent!.add(pivot);
  pivot.add(model);
  action.paused = false;
}

export class Creatures {
  readonly C: Brain = {
    x: 0,
    z: -40,
    yaw: 0,
    mode: "dormant",
    speed: 0,
    target: null,
    wait: 0,
    lastSeen: null,
    loseT: 0,
    fieldT: 0,
    notice: 0,
    spawnDelay: 25,
    stepT: 0,
    searchT: 0,
    investT: 0,
    roarT: 0,
    sniff: 0,
    sawHide: null,
    fieldG: null,
    calm: 0,
    look: 0,
    rush: 0,
    burst: 0,
    lurk: false,
    lockers: [],
  };
  readonly G: Ghost = { active: false, x: 0, z: 0, timer: 60, burn: 0, watched: false, life: 0, whisperT: 0, fieldT: 0, fieldG: null, navV: -1, count: 0, seenT: 0 };
  deer: (Rig & { eye: THREE.PointLight }) | null = null;
  private woman: Rig | null = null;
  private cfg: CreatureCfg = DEFAULT_CFG;
  private ghostCfg: GhostCfg | null = null;
  /** Before she matters she only stands at the end of an aisle now and then. */
  private cameo = false;
  private start: Vec2 = [0, -40];
  private readonly field: Int16Array;
  private readonly ghostField: Int16Array;
  private navV = -1;
  private wps: Vec2[] = [];
  private wpsV = -1;

  constructor(
    private readonly W: StoreWorld,
    private readonly sfx: Sfx,
  ) {
    this.field = W.makeField();
    this.ghostField = W.makeField();
  }

  private has(t: Trait) {
    return this.cfg.traits.includes(t);
  }

  build(scene: THREE.Scene, models: Map<string, LoadedModel>) {
    const dg = models.get("ghosts/human-deer");
    const holder = new THREE.Group();
    scene.add(holder);
    let mixer: THREE.AnimationMixer | null = null;
    let walk: THREE.AnimationAction | null = null;
    if (dg) {
      const model = dg.scene;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.frustumCulled = false;
        m.castShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && "emissive" in mat) mat.emissive = new THREE.Color(0x120505);
      });
      holder.add(model);
      mixer = new THREE.AnimationMixer(model);
      if (dg.animations[0]) {
        walk = mixer.clipAction(dg.animations[0]);
        fitSkinned(model, mixer, walk, DEER.height, DEER.yaw, 0.12);
      }
    }
    const eye = new THREE.PointLight(0xff2a10, 0.8 * LIGHT, 8, 2);
    eye.position.set(0, 2.5, 0.6);
    holder.add(eye);
    this.deer = { holder, mixer, walk, eye };
    holder.visible = false;

    const wg = models.get("ghosts/hooded-horror-woman");
    if (wg) {
      const wh = new THREE.Group();
      const m = wg.scene;
      m.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
      });
      wh.add(m);
      wh.visible = false;
      scene.add(wh);
      const mx = new THREE.AnimationMixer(m);
      let run: THREE.AnimationAction | null = null;
      if (wg.animations[0]) {
        run = mx.clipAction(wg.animations[0]);
        fitSkinned(m, mx, run, WOMAN.height, WOMAN.yaw);
        run.time = 0.2;
        mx.update(0);
        run.paused = true;
      }
      this.woman = { holder: wh, mixer: mx, walk: run };
    }
  }

  /** Sets both creatures up for a night. */
  setup(cfg: CreatureCfg | null, ghost: GhostCfg | null, start: Vec2, cameo: boolean) {
    this.cfg = cfg ?? DEFAULT_CFG;
    this.ghostCfg = ghost;
    this.cameo = cameo;
    this.start = start;
    this.reset();
  }

  reset() {
    const C = this.C;
    Object.assign(C, {
      x: this.start[0],
      z: this.start[1],
      yaw: 0,
      mode: "dormant",
      spawnDelay: this.cfg.delay,
      target: null,
      lastSeen: null,
      loseT: 0,
      wait: 0,
      speed: 0,
      sniff: 0,
      sawHide: null,
      roarT: 0,
      fieldG: null,
      fieldT: 0,
      notice: 0,
      calm: 0,
      look: 0,
      rush: 0,
      burst: 0,
      lurk: false,
      lockers: [],
    } satisfies Partial<Brain>);
    this.navV = -1;
    this.wpsV = -1;
    if (this.deer) {
      this.deer.holder.visible = false;
      this.deer.holder.position.set(C.x, 0, C.z);
    }
    const G = this.G;
    Object.assign(G, { active: false, burn: 0, watched: false, life: 0, whisperT: 0, fieldG: null, fieldT: 0, navV: -1, count: 0, seenT: 0 } satisfies Partial<Ghost>);
    G.timer = this.ghostCfg ? this.ghostCfg.first : 50 + Math.random() * 20;
    if (this.woman) this.woman.holder.visible = false;
  }

  /** Whether the Wendigo is standing dark and silent (the engine quiets its breathing). */
  get lurking() {
    return this.C.lurk;
  }

  /** How far the hooded woman is, while she is out and matters (for the HUD and the cold at the screen's edge). */
  get ghostState(): { dist: number; watched: boolean } | null {
    return this.G.active && this.ghostCfg ? { dist: this.ghostDist, watched: this.G.watched } : null;
  }
  private ghostDist = 99;

  /**
   * A noise somewhere in the store (a thrown can, a tripped sensor, a breaker, a scream). `loud` makes it hurry
   * and wakes it if it still sleeps. Returns true when it goes to look.
   */
  hear(x: number, z: number, loud = false): boolean {
    const C = this.C;
    if (C.mode === "dormant") {
      if (loud) C.spawnDelay = Math.min(C.spawnDelay, 1.5);
      return false;
    }
    if (!this.W.connected(C.x, C.z, x, z)) return false;
    if (C.mode === "chase") {
      // only when it has lost sight of you: it runs to the noise instead
      if (C.loseT <= 0.2) return false;
      C.lastSeen = [x, z];
      C.sawHide = null;
      return true;
    }
    C.mode = "investigate";
    C.target = [x, z];
    C.fieldG = null;
    C.investT = 7;
    C.lockers = [];
    C.lurk = false;
    C.wait = 0;
    if (loud) C.rush = 7;
    return true;
  }

  /** The alarm: it knows where the player is and comes. */
  alarm(x: number, z: number) {
    const C = this.C;
    C.mode = "chase";
    C.lastSeen = [x, z];
    C.loseT = -4;
    C.roarT = 0;
    C.sawHide = null;
    C.lurk = false;
    C.lockers = [];
    if (this.deer) this.deer.holder.visible = true;
  }

  /** Next patrol destination: a roaming route through the whole store, not a beeline to the player. */
  private pickWaypoint(P: Prey): Vec2 {
    const C = this.C;
    if (this.wpsV !== this.W.navVersion) {
      this.wps = this.W.waypointsFrom(C.x, C.z);
      this.wpsV = this.W.navVersion;
    }
    const wps = this.wps;
    if (!wps.length) return this.W.randomFree(C.x, C.z, 12);
    let best: Vec2 | null = null;
    // a stalker (and an ambusher) always works the player's part of the store; the others only after a long quiet spell
    const close = this.has("stalker") || this.has("ambusher");
    const pressure = close || C.calm > this.cfg.calm;
    const near = close ? 10 : 12;
    const far = close ? 24 : 28;
    for (let k = 0; k < 14; k++) {
      const w = wps[(Math.random() * wps.length) | 0];
      const d = Math.hypot(w[0] - P.x, w[1] - P.z);
      if (Math.hypot(w[0] - C.x, w[1] - C.z) < 8) continue;
      if (pressure) {
        if (d > near && d < far) {
          best = w;
          break;
        }
      } else if (d > 14) {
        best = w;
        break;
      }
      best = best || w;
    }
    if (pressure && best && !close) C.calm = this.cfg.calm * 0.4;
    return best || wps[0];
  }

  /** AI tick: returns how far it is and whether it sees the player. */
  update(dt: number, ctx: CreatureCtx): { dist: number; sees: boolean } {
    const { C, W, sfx, cfg } = this;
    const P = ctx.P;
    const dx = P.x - C.x;
    const dz = P.z - C.z;
    const dist = Math.hypot(dx, dz);
    if (C.mode === "dormant") {
      C.spawnDelay -= dt;
      if (C.spawnDelay <= 0) {
        C.mode = "patrol";
        C.target = null;
        C.wait = 0;
        if (this.deer) this.deer.holder.visible = true;
      }
      return { dist: 99, sees: false };
    }
    const listener = this.has("listener");
    const hidden = P.hidden != null;
    const los = !hidden && W.hasLOS(C.x, C.z, P.x, P.z, 0);
    const fx = Math.sin(C.yaw);
    const fz = Math.cos(C.yaw);
    const dot = dist > 0.01 ? (fx * dx + fz * dz) / dist : 1;
    let range = (P.lit ? 15 : 7) * (P.crouch ? 0.72 : 1);
    if (P.speed < 0.3 && !P.lit) range = Math.min(range, 4.5);
    range *= cfg.sight;
    let cone = 0.3;
    if (listener) range *= 0.45;
    if (this.has("lightHunter")) {
      if (P.lit) {
        // the torch draws it from across the store, whichever way it faces
        range = 30 * cfg.sight;
        cone = -1;
      } else range = Math.min(range, 3.5);
    }
    if (ctx.phase2) range *= 1.35;
    const sees = !hidden && los && dist < range && (dot > cone || dist < 3.5);
    let noise = P.noise * cfg.hearing;
    if (listener) noise *= C.wait > 0 ? 2.6 : 2;
    const hears = !hidden && dist < noise * (los ? 1 : 0.55);
    C.calm = dist < 24 ? 0 : C.calm + dt;
    C.rush = Math.max(0, C.rush - dt);

    if (C.mode === "chase") {
      if (sees) {
        C.lastSeen = [P.x, P.z];
        C.loseT = 0;
      } else C.loseT += dt;
      const hold = cfg.lose * (ctx.phase2 ? 1.5 : 1) * (this.has("relentless") ? 1.8 : 1);
      if (C.loseT > hold && !C.sawHide) {
        C.fieldG = null;
        C.lockers = this.has("lockerChecker") && C.lastSeen ? this.lockersNear(C.lastSeen) : [];
        if (C.lockers.length) {
          C.mode = "check";
          C.wait = 0;
          ctx.msg("lockers");
        } else {
          C.mode = "search";
          C.searchT = 10;
          C.target = C.lastSeen;
          ctx.msg("search");
        }
      }
    } else if (sees) {
      // it notices you: stops, turns towards you, and only then charges — a moment to react
      C.notice += dt * (dist < 8 ? 2.6 : 1.3) * cfg.notice * (C.lurk ? 2 : 1);
      if (C.notice >= 1) {
        C.mode = "chase";
        C.loseT = 0;
        C.lastSeen = [P.x, P.z];
        C.sawHide = null;
        C.notice = 0;
        C.lurk = false;
        C.lockers = [];
        C.burst = 0;
        sfx.roar(0.6);
        ctx.spotted();
        ctx.msg("spotted");
      }
    } else {
      C.notice = Math.max(0, C.notice - dt * 0.6);
      if (hears && (C.mode === "patrol" || C.mode === "search" || C.mode === "check")) {
        C.mode = "investigate";
        C.target = [P.x, P.z];
        C.fieldG = null;
        C.investT = 7;
        C.lurk = false;
        C.lockers = [];
        C.wait = 0;
      }
    }

    // hiding: it may sniff you out
    if (hidden) {
      if (C.sawHide) C.target = C.sawHide;
      else if (dist < 4.2) {
        C.sniff += dt * (C.mode === "patrol" ? 0.14 : 0.5) * cfg.sniff;
        if (C.sniff > 1) {
          ctx.caught("wendigo");
          return { dist, sees: false };
        }
      } else C.sniff = Math.max(0, C.sniff - dt * 0.3);
    } else C.sniff = 0;

    let speed = 0;
    let goal: Vec2 | null = null;
    if (C.notice > 0.05 && C.mode !== "chase") {
      // frozen, staring at you
      C.yaw = turn(C.yaw, Math.atan2(dx, dz), dt * 7);
    } else
      switch (C.mode) {
        case "patrol":
          speed = cfg.patrol;
          if (C.wait > 0) {
            C.wait -= dt;
            speed = 0;
            C.look += dt;
            // a lurking ambusher stands dead still; the others look about
            if (!C.lurk) C.yaw += Math.sin(C.look * 1.1) * dt * 1.1;
            if (C.wait <= 0) C.lurk = false;
          } else {
            if (!C.target || Math.hypot(C.target[0] - C.x, C.target[1] - C.z) < 1.8) {
              if (C.target && this.has("ambusher")) {
                C.wait = 9 + Math.random() * 8;
                C.lurk = true;
              } else C.wait = 2 + Math.random() * 3.5;
              C.target = this.pickWaypoint(P);
              C.fieldG = null;
            }
            goal = C.target;
          }
          break;
        case "investigate":
          speed = cfg.invest * (C.rush > 0 ? 1.35 : 1);
          C.investT -= dt;
          goal = C.target;
          if (!goal || Math.hypot(goal[0] - C.x, goal[1] - C.z) < 1.8 || C.investT < -8) {
            C.mode = "search";
            C.searchT = 8;
            C.target = W.randomFree(C.x, C.z, 9);
            C.fieldG = null;
          }
          break;
        case "search":
          speed = cfg.search;
          C.searchT -= dt;
          goal = C.target;
          if (!goal || Math.hypot(goal[0] - C.x, goal[1] - C.z) < 1.5) {
            C.target = W.randomFree(C.x, C.z, 10);
            C.fieldG = null;
          }
          if (C.searchT <= 0) {
            C.mode = "patrol";
            C.target = null;
            C.wait = 1.5;
          }
          break;
        case "check": {
          // to the next locker, a pause in front of it, then the door comes open
          const h = W.hides[C.lockers[0]];
          if (!h) {
            C.mode = "search";
            C.searchT = 6;
            C.target = W.randomFree(C.x, C.z, 9);
            C.fieldG = null;
            break;
          }
          speed = cfg.invest;
          goal = [h.x + h.ox * 1.4, h.z + h.oz * 1.4];
          if (Math.hypot(goal[0] - C.x, goal[1] - C.z) < 1.3) {
            speed = 0;
            goal = null;
            C.yaw = turn(C.yaw, Math.atan2(-h.ox, -h.oz), dt * 6);
            if (C.wait <= 0) {
              C.wait = 1.4;
              sfx.lockerRattle();
            }
            C.wait -= dt;
            if (C.wait <= 0) {
              if (P.hidden === C.lockers[0]) {
                ctx.caught("wendigo");
                return { dist, sees: false };
              }
              C.lockers.shift();
              C.fieldG = null;
            }
          }
          break;
        }
        case "chase": {
          speed = ctx.phase2 ? cfg.chase2 : cfg.chase;
          if (this.has("sprinter")) {
            // charge for 1.6 s, tire for 2.6 s
            const before = C.burst;
            C.burst = (C.burst + dt) % 4.2;
            if (C.burst < before) sfx.roar(0.35);
            speed *= C.burst < 1.6 ? 1.5 : 0.82;
          }
          goal = C.sawHide ? C.sawHide : sees || C.loseT < 1.2 ? [P.x, P.z] : C.lastSeen;
          if (goal && !sees && !C.sawHide && C.loseT >= 1.2 && Math.hypot(goal[0] - C.x, goal[1] - C.z) < 1.6) speed = 1.2;
          break;
        }
      }
    if (goal && speed > 0) {
      let tx = goal[0];
      let tz = goal[1];
      let way = true;
      const gd = Math.hypot(goal[0] - C.x, goal[1] - C.z);
      if (!(gd > 0.05 && W.hasLOS(C.x, C.z, goal[0], goal[1], 0.8))) {
        C.fieldT -= dt;
        if (C.fieldT <= 0 || !C.fieldG || this.navV !== W.navVersion || Math.hypot(C.fieldG[0] - goal[0], C.fieldG[1] - goal[1]) > 1.5) {
          W.buildField(this.field, goal[0], goal[1]);
          C.fieldG = [goal[0], goal[1]];
          C.fieldT = 0.4;
          this.navV = W.navVersion;
        }
        const ns = W.nextStep(this.field, C.x, C.z);
        if (ns) [tx, tz] = ns;
        else way = false;
      }
      if (way) {
        const vx = tx - C.x;
        const vz = tz - C.z;
        const vl = Math.hypot(vx, vz) || 1;
        const step = Math.min(speed * dt, vl);
        C.x += (vx / vl) * step;
        C.z += (vz / vl) * step;
        C.yaw = turn(C.yaw, Math.atan2(vx, vz), dt * (C.mode === "chase" ? 9 : 4));
      } else {
        // no way there (a shutter is down between): give the place up rather than walk through a wall
        speed = 0;
        C.fieldG = null;
        if (C.mode === "chase") {
          C.mode = "search";
          C.searchT = 6;
          C.sawHide = null;
        } else if (C.mode === "check") C.lockers.shift();
        C.target = C.mode === "patrol" ? null : W.randomFree(C.x, C.z, 9);
      }
    }
    C.speed = speed;
    if (speed > 0) {
      C.stepT -= dt * (speed / 1.9);
      if (C.stepT <= 0) {
        C.stepT = 0.75;
        sfx.creatureStep();
      }
    }
    if (C.mode === "chase") {
      C.roarT -= dt;
      if (C.roarT <= 0) {
        C.roarT = 6 + Math.random() * 5;
        sfx.roar(0.45);
      }
      const reach = hidden ? (C.sawHide ? Math.hypot(C.sawHide[0] - C.x, C.sawHide[1] - C.z) < 1.9 : false) : dist < 1.8 && los;
      if (reach) ctx.caught("wendigo");
    }
    return { dist, sees };
  }

  /** The lockers it will open after losing the player near `at`: the closest three it can walk to. */
  private lockersNear(at: Vec2): number[] {
    const { C, W } = this;
    return W.hides
      .map((h, i) => ({ i, d: Math.hypot(h.x - at[0], h.z - at[1]), ok: W.connected(C.x, C.z, h.x + h.ox * 1.4, h.z + h.oz * 1.4) }))
      .filter((h) => h.ok && h.d < 26)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((h) => h.i);
  }

  // --- The hooded woman ----------------------------------------------------------------------------

  /** A place for her to appear: 11–18 m from the player, in the open, preferably where they can see her. */
  private ghostSpot(P: Prey): Vec2 | null {
    const W = this.W;
    const fx = -Math.sin(P.yaw);
    const fz = -Math.cos(P.yaw);
    let fallback: Vec2 | null = null;
    for (let k = 0; k < 18; k++) {
      // the first tries are in front of the player, the rest anywhere around
      const a = k < 8 ? (Math.random() - 0.5) * 1.2 : Math.random() * PI * 2;
      const d = 11 + Math.random() * 7;
      const x = P.x + (fx * Math.cos(a) - fz * Math.sin(a)) * d;
      const z = P.z + (fz * Math.cos(a) + fx * Math.sin(a)) * d;
      if (Math.abs(x) > XI - 2 || Math.abs(z) > ZI - 2 || W.isBlocked(x, z) || !W.connected(P.x, P.z, x, z)) continue;
      if (W.hasLOS(P.x, P.z, x, z, 0)) return [x, z];
      fallback ??= [x, z];
    }
    return fallback;
  }

  private ghostLeave(next: number) {
    const G = this.G;
    G.active = false;
    G.burn = 0;
    G.watched = false;
    G.timer = next;
    if (this.woman) this.woman.holder.visible = false;
  }

  /** Her turn: appears, walks towards the player while unwatched, leaves for the torch, touches. */
  updateGhost(dt: number, ctx: CreatureCtx) {
    const { G, W, sfx, C } = this;
    const cfg = this.ghostCfg;
    const P = ctx.P;
    if (!this.woman || (!cfg && !this.cameo)) return;
    const between = () => (cfg ? cfg.every[0] + Math.random() * (cfg.every[1] - cfg.every[0]) : 55 + Math.random() * 40);
    if (!G.active) {
      G.timer -= dt;
      if (G.timer > 0 || C.mode === "chase" || P.hidden != null || (!cfg && G.count >= 4)) return;
      const spot = this.ghostSpot(P);
      // before she matters she only shows herself where she can be seen
      if (!spot || (!cfg && !W.hasLOS(P.x, P.z, spot[0], spot[1], 0))) {
        G.timer = 3;
        return;
      }
      Object.assign(G, { active: true, x: spot[0], z: spot[1], burn: 0, life: 0, whisperT: 1.5, fieldG: null, fieldT: 0, seenT: 0 } satisfies Partial<Ghost>);
      G.count++;
      sfx.stinger();
      sfx.whisper();
      if (cfg) ctx.ghostAppeared();
      return;
    }
    G.life += dt;
    const dx = P.x - G.x;
    const dz = P.z - G.z;
    const d = Math.hypot(dx, dz);
    this.ghostDist = d;
    const los = W.hasLOS(P.x, P.z, G.x, G.z, 0);
    const facing = d > 0.01 ? (-Math.sin(P.yaw) * -dx + -Math.cos(P.yaw) * -dz) / d : 1;
    G.watched = los && facing > 0.78 && d < 34;
    if (!cfg) {
      // the old harmless apparition: gone when stared at, approached or after a while
      if (facing > 0.9 && los) G.seenT += dt;
      if (G.seenT > 1.4 || d < 6 || G.life > 9) {
        if (G.seenT > 1.4) sfx.hiss();
        this.ghostLeave(between());
      }
      return;
    }
    // a Wendigo chase or a locker door between them: she lets go for now
    if (C.mode === "chase" || P.hidden != null || G.life > 55) {
      this.ghostLeave(12 + Math.random() * 12);
      return;
    }
    if (G.watched && P.lit && facing > 0.9 && d < P.beam) {
      G.burn += dt;
      if (G.burn > 1.1) {
        sfx.hiss();
        sfx.banish();
        this.ghostLeave(between());
        ctx.ghostBanished();
        return;
      }
    } else G.burn = Math.max(0, G.burn - dt * 0.6);
    if (!G.watched) {
      // she is quicker in the dark
      const speed = cfg.speed * (!W.power || W.blackout > 0 ? 1.25 : 1);
      let tx = P.x;
      let tz = P.z;
      let way = true;
      if (!W.hasLOS(G.x, G.z, P.x, P.z, 0.5)) {
        G.fieldT -= dt;
        if (G.fieldT <= 0 || !G.fieldG || G.navV !== W.navVersion || Math.hypot(G.fieldG[0] - P.x, G.fieldG[1] - P.z) > 1.5) {
          W.buildField(this.ghostField, P.x, P.z);
          G.fieldG = [P.x, P.z];
          G.fieldT = 0.5;
          G.navV = W.navVersion;
        }
        const ns = W.nextStep(this.ghostField, G.x, G.z);
        if (ns) [tx, tz] = ns;
        else way = false;
      }
      if (way) {
        const vx = tx - G.x;
        const vz = tz - G.z;
        const vl = Math.hypot(vx, vz) || 1;
        const step = Math.min(speed * dt, vl);
        G.x += (vx / vl) * step;
        G.z += (vz / vl) * step;
      }
      G.whisperT -= dt;
      if (G.whisperT <= 0 && d < 16) {
        G.whisperT = 2 + Math.random() * 1.6;
        sfx.whisper();
      }
    }
    if (d < 1.5 && los) {
      this.ghostLeave(between());
      ctx.ghostTouch();
    }
  }

  /** Pose + animate the creatures. `t` is the game clock. */
  animate(dt: number, t: number, P: { x: number; z: number; yaw: number }, ctx: { playing: boolean; caughtPose: boolean }) {
    const { C, G } = this;
    const deer = this.deer;
    if (deer) {
      deer.holder.position.set(C.x, 0, C.z);
      deer.holder.rotation.y = C.yaw;
      const chasing = C.mode === "chase" || ctx.caughtPose;
      if (deer.mixer && deer.walk) {
        deer.walk.timeScale = ctx.caughtPose ? 0.5 : Math.max(C.lurk ? 0.02 : 0.12, Math.min(2.5, C.speed / 2.3));
        deer.mixer.update(dt);
      }
      deer.eye.intensity = C.lurk ? 0 : (chasing ? 2.2 + Math.sin(t * 20) * 0.4 : 0.7 + Math.sin(t * 3) * 0.2) * LIGHT;
      deer.holder.visible = C.mode !== "dormant";
    }
    const woman = this.woman;
    if (!woman) return;
    if (!ctx.playing && !ctx.caughtPose && G.active) this.ghostLeave(30);
    if (!G.active) {
      woman.holder.visible = false;
      return;
    }
    woman.holder.position.set(G.x, Math.sin(t * 1.3) * 0.03, G.z);
    woman.holder.rotation.y = Math.atan2(P.x - G.x, P.z - G.z);
    // she breaks up under the torch
    woman.holder.visible = G.burn <= 0 || Math.random() > G.burn * 0.75;
  }

  dispose() {
    this.deer?.mixer?.stopAllAction();
    this.woman?.mixer?.stopAllAction();
  }
}
