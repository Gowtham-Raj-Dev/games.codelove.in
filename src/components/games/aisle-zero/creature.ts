import * as THREE from "three";
import type { LoadedModel } from "../shared/assets";
import type { Sfx } from "./audio";
import { CREATURE_START, GW, LIGHT, XI, ZI, type StoreWorld, type Vec2 } from "./world";

/** The Wendigo (library model ghosts/human-deer): its roaming AI, and the hooded apparition (ghosts/hooded-horror-woman). */

const PI = Math.PI;
const DEER = { height: 2.75, yaw: PI };
const WOMAN = { height: 1.95, yaw: 0 };

export type Mode = "dormant" | "patrol" | "investigate" | "search" | "chase";

/** What the creature knows and wants. The engine reads and nudges it (thrown cans, pickups, paying). */
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
}

/** The player as the creature sees them. */
export interface Prey {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  noise: number;
  flash: boolean;
  crouch: boolean;
  hidden: number | null;
}

export interface CreatureCtx {
  P: Prey;
  phase2: boolean;
  playing: boolean;
  caughtPose: boolean;
  caught(): void;
  msg(key: "spotted" | "search"): void;
}

interface Rig {
  holder: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  walk: THREE.AnimationAction | null;
}

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
  };
  deer: (Rig & { eye: THREE.PointLight }) | null = null;
  private woman: (Rig & { active: boolean; t: number; timer: number; count: number; seenT: number }) | null = null;
  /** Debug: keep the Wendigo visible while dormant. */
  forceShow = false;

  constructor(
    private readonly W: StoreWorld,
    private readonly sfx: Sfx,
  ) {}

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
      this.woman = { holder: wh, mixer: mx, walk: run, active: false, t: 0, timer: 50 + Math.random() * 20, count: 0, seenT: 0 };
    }
  }

  reset() {
    const C = this.C;
    Object.assign(C, {
      x: CREATURE_START[0],
      z: CREATURE_START[1],
      mode: "dormant",
      spawnDelay: 25,
      target: null,
      lastSeen: null,
      loseT: 0,
      wait: 0,
      speed: 0,
      sniff: 0,
      sawHide: null,
      roarT: 0,
      fieldG: null,
      notice: 0,
      calm: 0,
      look: 0,
    } satisfies Partial<Brain>);
    if (this.deer) {
      this.deer.holder.visible = false;
      this.deer.holder.position.set(C.x, 0, C.z);
    }
    const w = this.woman;
    if (w) {
      w.holder.visible = false;
      w.active = false;
      w.timer = 50 + Math.random() * 20;
      w.count = 0;
    }
  }

  /** Next patrol destination: a roaming route through the whole store, not a beeline to the player. */
  private pickWaypoint(P: Prey): Vec2 {
    const C = this.C;
    const wps = this.W.waypoints;
    let best: Vec2 | null = null;
    // long time without a close encounter: sweep through the player's part of the store (but never straight at them)
    const pressure = C.calm > 70;
    for (let k = 0; k < 12; k++) {
      const w = wps[(Math.random() * wps.length) | 0];
      const d = Math.hypot(w[0] - P.x, w[1] - P.z);
      const far = Math.hypot(w[0] - C.x, w[1] - C.z);
      if (far < 8) continue;
      if (pressure) {
        if (d > 12 && d < 28) {
          best = w;
          break;
        }
      } else if (d > 14) {
        best = w;
        break;
      }
      best = best || w;
    }
    if (pressure && best) C.calm = 30;
    return best || wps[0];
  }

  /** AI tick: returns how far it is and whether it sees the player. */
  update(dt: number, ctx: CreatureCtx): { dist: number; sees: boolean } {
    const { C, W, sfx } = this;
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
    const hidden = P.hidden != null;
    const los = !hidden && W.hasLOS(C.x, C.z, P.x, P.z, 0);
    const fx = Math.sin(C.yaw);
    const fz = Math.cos(C.yaw);
    const dot = dist > 0.01 ? (fx * dx + fz * dz) / dist : 1;
    let range = (P.flash ? 15 : 7) * (P.crouch ? 0.72 : 1);
    if (P.speed < 0.3 && !P.flash) range = Math.min(range, 4.5);
    if (ctx.phase2) range *= 1.35;
    const sees = !hidden && los && dist < range && (dot > 0.3 || dist < 3.5);
    const hears = !hidden && dist < P.noise * (los ? 1 : 0.55);
    C.calm = dist < 24 ? 0 : C.calm + dt;

    if (C.mode === "chase") {
      if (sees) {
        C.lastSeen = [P.x, P.z];
        C.loseT = 0;
      } else C.loseT += dt;
      if (C.loseT > (ctx.phase2 ? 9 : 6) && !C.sawHide) {
        C.mode = "search";
        C.searchT = 10;
        C.target = C.lastSeen;
        C.fieldG = null;
        ctx.msg("search");
      }
    } else if (sees) {
      // it notices you: stops, turns towards you, and only then charges — a moment to react
      C.notice += dt * (dist < 8 ? 2.6 : 1.3);
      if (C.notice >= 1) {
        C.mode = "chase";
        C.loseT = 0;
        C.lastSeen = [P.x, P.z];
        C.sawHide = null;
        C.notice = 0;
        sfx.roar(0.6);
        ctx.msg("spotted");
      }
    } else {
      C.notice = Math.max(0, C.notice - dt * 0.6);
      if (hears && (C.mode === "patrol" || C.mode === "search")) {
        C.mode = "investigate";
        C.target = [P.x, P.z];
        C.fieldG = null;
        C.investT = 7;
      }
    }

    // hiding: it may sniff you out
    if (hidden) {
      if (C.sawHide) C.target = C.sawHide;
      else if (dist < 4.2) {
        C.sniff += dt * (C.mode === "patrol" ? 0.14 : 0.5);
        if (C.sniff > 1) {
          ctx.caught();
          return { dist, sees: false };
        }
      } else C.sniff = Math.max(0, C.sniff - dt * 0.3);
    } else C.sniff = 0;

    let speed = 0;
    let goal: Vec2 | null = null;
    if (C.notice > 0.05 && C.mode !== "chase") {
      // frozen, staring at you
      let dy = Math.atan2(dx, dz) - C.yaw;
      while (dy > PI) dy -= PI * 2;
      while (dy < -PI) dy += PI * 2;
      C.yaw += dy * Math.min(1, dt * 7);
    } else
      switch (C.mode) {
        case "patrol":
          speed = 1.9;
          if (C.wait > 0) {
            C.wait -= dt;
            speed = 0;
            C.look += dt;
            C.yaw += Math.sin(C.look * 1.1) * dt * 1.1;
          } else {
            if (!C.target || Math.hypot(C.target[0] - C.x, C.target[1] - C.z) < 1.8) {
              C.wait = 2 + Math.random() * 3.5;
              C.target = this.pickWaypoint(P);
              C.fieldG = null;
            }
            goal = C.target;
          }
          break;
        case "investigate":
          speed = 2.9;
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
          speed = 2.4;
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
        case "chase":
          speed = ctx.phase2 ? 4.6 : 4.2;
          goal = C.sawHide ? C.sawHide : sees || C.loseT < 1.2 ? [P.x, P.z] : C.lastSeen;
          if (goal && !sees && !C.sawHide && C.loseT >= 1.2 && Math.hypot(goal[0] - C.x, goal[1] - C.z) < 1.6) speed = 1.2;
          break;
      }
    C.speed = speed;
    if (goal && speed > 0) {
      let tx: number;
      let tz: number;
      const gd = Math.hypot(goal[0] - C.x, goal[1] - C.z);
      if (gd > 0.05 && W.hasLOS(C.x, C.z, goal[0], goal[1], 0.8)) {
        tx = goal[0];
        tz = goal[1];
      } else {
        C.fieldT -= dt;
        if (C.fieldT <= 0 || !C.fieldG || Math.hypot(C.fieldG[0] - goal[0], C.fieldG[1] - goal[1]) > 1.5) {
          W.buildField(goal[0], goal[1]);
          C.fieldG = [goal[0], goal[1]];
          C.fieldT = 0.4;
        }
        const ns = W.nextStep(C.x, C.z);
        if (ns) {
          tx = ns[0];
          tz = ns[1];
        } else {
          tx = goal[0];
          tz = goal[1];
        }
      }
      const vx = tx - C.x;
      const vz = tz - C.z;
      const vl = Math.hypot(vx, vz) || 1;
      const step = Math.min(speed * dt, vl);
      C.x += (vx / vl) * step;
      C.z += (vz / vl) * step;
      let dy = Math.atan2(vx, vz) - C.yaw;
      while (dy > PI) dy -= PI * 2;
      while (dy < -PI) dy += PI * 2;
      C.yaw += dy * Math.min(1, dt * (C.mode === "chase" ? 9 : 4));
    }
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
      if (reach) ctx.caught();
    }
    return { dist, sees };
  }

  /** Pose + animate the creatures. `t` is the game clock. */
  animate(dt: number, t: number, P: { x: number; z: number; yaw: number }, ctx: { playing: boolean; caughtPose: boolean }) {
    const { C, W, sfx } = this;
    const deer = this.deer;
    if (deer) {
      deer.holder.position.set(C.x, 0, C.z);
      deer.holder.rotation.y = C.yaw;
      const chasing = C.mode === "chase" || ctx.caughtPose;
      if (deer.mixer && deer.walk) {
        deer.walk.timeScale = ctx.caughtPose ? 0.5 : Math.max(0.12, Math.min(2.5, C.speed / 2.3));
        deer.mixer.update(dt);
      }
      deer.eye.intensity = (chasing ? 2.2 + Math.sin(t * 20) * 0.4 : 0.7 + Math.sin(t * 3) * 0.2) * LIGHT;
      deer.holder.visible = C.mode !== "dormant" || this.forceShow;
    }
    const woman = this.woman;
    if (!woman) return;
    woman.timer -= dt;
    if (!woman.active) {
      if (woman.timer <= 0 && woman.count < 5 && C.mode !== "chase" && ctx.playing) {
        const fx = -Math.sin(P.yaw);
        const fz = -Math.cos(P.yaw);
        const d = 14 + Math.random() * 6;
        const x = P.x + fx * d;
        const z = P.z + fz * d;
        const [i, j] = W.toCell(x, z);
        if (Math.abs(x) < XI - 2 && Math.abs(z) < ZI - 2 && !W.blocked[j * GW + i] && W.hasLOS(P.x, P.z, x, z, 0)) {
          woman.holder.position.set(x, 0, z);
          woman.holder.rotation.y = Math.atan2(P.x - x, P.z - z);
          woman.holder.visible = true;
          woman.active = true;
          woman.t = 0;
          woman.seenT = 0;
          woman.count++;
          sfx.stinger();
          sfx.whisper();
        } else woman.timer = 3;
      }
    } else {
      woman.t += dt;
      const dx = P.x - woman.holder.position.x;
      const dz = P.z - woman.holder.position.z;
      const d = Math.hypot(dx, dz);
      const dot = (-Math.sin(P.yaw) * -dx + -Math.cos(P.yaw) * -dz) / (d || 1);
      if (dot > 0.9) woman.seenT += dt;
      if (woman.seenT > 1.4 || d < 6 || woman.t > 9 || !ctx.playing) {
        woman.active = false;
        woman.holder.visible = false;
        woman.timer = 55 + Math.random() * 40;
        if (ctx.playing && woman.seenT > 1.4) sfx.hiss();
      }
    }
  }

  dispose() {
    this.deer?.mixer?.stopAllAction();
    this.woman?.mixer?.stopAllAction();
  }
}
