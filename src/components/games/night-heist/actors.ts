import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Proto } from "../shared/assets";
import { Badge, Cone, floorGlow, lightBeam } from "./fx";
import type { Grid } from "./grid";
import { CAM_DARK, CAM_HALF, type Drone, type Guard, type SecurityCamera } from "./watchers";

/** What the watchers of watchers.ts look like: animated models, vision cones, awareness badges. */

// --- Animation -------------------------------------------------------------------------------------------

/** Cross-faded clips plus a crouch pose that can be blended over anything (sneaking). */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private crouchAction: THREE.AnimationAction | null = null;
  current: THREE.AnimationAction | null = null;
  name = "";
  crouch = 0;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.clips.set(c.name, c);
    const crouch = this.action("crouch");
    if (crouch) {
      crouch.setLoop(THREE.LoopRepeat, Infinity);
      crouch.play();
      crouch.weight = 0;
      this.crouchAction = crouch;
    }
  }

  has(name: string) {
    return this.clips.has(name);
  }

  private action(name: string) {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      this.actions.set(name, a);
    }
    return a;
  }

  play(name: string, { once = false, fade = 0.18, speed = 1, restart = false } = {}) {
    const next = this.action(name);
    if (!next) return;
    if (this.current === next && !restart) {
      next.timeScale = speed;
      return;
    }
    const prev = this.current;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = speed;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (prev && prev !== next && fade > 0) next.crossFadeFrom(prev, fade, false);
    else if (prev && prev !== next) prev.stop();
    next.play();
    this.current = next;
    this.name = name;
  }

  update(dt: number) {
    if (this.crouchAction) {
      this.crouchAction.weight = this.crouch;
      if (this.current) this.current.weight = 1 - this.crouch * 0.85;
    }
    this.mixer.update(dt);
  }

  stopAll() {
    this.mixer.stopAllAction();
    this.current = null;
    this.name = "";
    if (this.crouchAction) {
      this.crouchAction.play();
      this.crouchAction.weight = 0;
    }
  }
}

/** A posed, animated copy of a character model. */
export class CharView {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly anim: Animator;

  constructor(proto: Proto) {
    this.model = cloneSkinned(proto.object);
    this.root.add(this.model);
    this.anim = new Animator(this.model, proto.animations);
    this.anim.play("idle", { fade: 0 });
  }

  place(x: number, z: number, yaw: number) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
  }
}

// --- Guards and dogs -----------------------------------------------------------------------------------------

const CONE_COLOR = { guard: "#ffe7a3", warden: "#ffe7a3", sentry: "#fff6c2", captain: "#ffc2b0", dog: "#c9b0ff" } as const;

export class GuardView {
  readonly view: CharView;
  readonly cone: Cone;
  readonly badge: Badge;
  private wasDown = false;
  private lastX: number;
  private lastZ: number;

  constructor(
    readonly guard: Guard,
    proto: Proto,
    atlas: THREE.Texture,
  ) {
    this.view = new CharView(proto);
    this.cone = new Cone(guard.kind === "dog" ? 48 : 34);
    this.badge = new Badge(atlas, 0.56);
    this.lastX = guard.x;
    this.lastZ = guard.z;
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.view.root, this.cone.mesh, this.badge.mesh);
  }

  /** The guard who grabbed the thief reaches out. */
  grab() {
    this.view.anim.play("interact-right", { once: true, fade: 0.08 });
  }

  /** Animation, model, cone and badge. `dt` 0 while paused. */
  sync(dt: number, grid: Grid, alarm: boolean, time: number, camera: THREE.Camera) {
    const g = this.guard;
    const v = this.view;
    const spec = g.spec;
    v.place(g.x, g.z, g.yaw);
    const moved = Math.hypot(g.x - this.lastX, g.z - this.lastZ);
    this.lastX = g.x;
    this.lastZ = g.z;
    const down = g.state === "ko" || g.state === "wake";
    if (g.state === "ko" && !this.wasDown) v.anim.play("die", { once: true, fade: 0.08, speed: 0.8 });
    else if (g.state === "wake" && v.anim.name === "die") v.anim.play("idle", { fade: 0.6 });
    this.wasDown = down;
    if (!down && dt > 0 && v.anim.name !== "interact-right") {
      const speed = moved / dt;
      const run = v.anim.has("sprint") ? "sprint" : "run";
      if (speed > 2.6) v.anim.play(run, { speed: speed / 4 });
      else if (speed > 0.15) v.anim.play("walk", { speed: Math.max(0.6, speed / 1.9) });
      else v.anim.play("idle");
    }
    v.anim.update(dt);

    const cone = this.cone;
    cone.mesh.visible = g.alive;
    if (g.alive) {
      cone.update(grid, g.x, g.z, g.yaw, spec.half, spec.range);
      const base = g.kind === "dog" ? 0.13 : g.kind === "sentry" ? 0.3 : 0.24;
      if (g.state === "hunt") cone.style("#ff3b3b", base + 0.1, alarm ? 1 : spec.dark);
      else if (g.curious || g.awareness > 0.05) cone.style(g.awareness > 0.6 ? "#ff6a3d" : "#ffad42", base + 0.06, spec.dark);
      else cone.style(CONE_COLOR[g.kind], base, spec.dark);
    }

    const b = this.badge;
    const top = g.kind === "dog" ? 0.95 : 1.55;
    b.mesh.position.set(g.x, top, g.z);
    b.mesh.quaternion.copy(camera.quaternion);
    if (g.state === "ko") {
      b.mesh.visible = true;
      b.set(2, g.koT / g.koTotal, "#a5b4fc", 0.85);
    } else if (g.state === "hunt") {
      b.mesh.visible = true;
      b.set(1, 1, "#ff3b3b");
      b.mesh.position.y = top + Math.abs(Math.sin(time * 9)) * 0.08;
    } else if (g.awareness > 0.04 || g.curious) {
      b.mesh.visible = true;
      b.set(0, g.awareness, g.awareness > 0.6 ? "#ff6a3d" : "#ffc14d");
    } else b.mesh.visible = false;
  }

  dispose() {
    this.view.root.removeFromParent();
    this.cone.mesh.removeFromParent();
    this.badge.mesh.removeFromParent();
    this.view.anim.stopAll();
    // Each skinned clone gets its own bone texture on first draw: free it with the guard.
    this.view.model.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && (o as THREE.SkinnedMesh).skeleton.dispose());
    this.cone.dispose();
    this.badge.dispose();
  }
}

// --- Security cameras --------------------------------------------------------------------------------------

export class CameraView {
  readonly cone = new Cone(26);
  readonly badge: Badge;

  constructor(
    readonly cam: SecurityCamera,
    atlas: THREE.Texture,
  ) {
    this.badge = new Badge(atlas, 0.48);
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.cone.mesh, this.badge.mesh);
  }

  sync(grid: Grid, alarm: boolean, camera: THREE.Camera) {
    const c = this.cam;
    const cone = this.cone;
    cone.mesh.visible = !c.off;
    if (!c.off) {
      cone.update(grid, c.x, c.z, c.yaw, CAM_HALF, c.range);
      if (c.awareness > 0.02 || alarm) cone.style(c.awareness > 0.6 || alarm ? "#ff4d4d" : "#ffad42", 0.3, CAM_DARK);
      else cone.style("#7cc6ff", 0.22, CAM_DARK);
    }
    const b = this.badge;
    b.mesh.visible = !c.off && c.awareness > 0.03;
    if (b.mesh.visible) {
      b.mesh.position.set(c.def.x, 1.95, c.def.z + 0.2);
      b.mesh.quaternion.copy(camera.quaternion);
      b.set(c.awareness >= 1 ? 1 : 0, c.awareness, c.awareness > 0.6 ? "#ff4d4d" : "#ffc14d");
    }
  }

  dispose() {
    this.cone.mesh.removeFromParent();
    this.badge.mesh.removeFromParent();
    this.cone.dispose();
    this.badge.dispose();
  }
}

// --- Drones -------------------------------------------------------------------------------------------------

const DRONE_Y = 1.95;

export class DroneView {
  readonly root = new THREE.Group();
  readonly badge: Badge;
  private readonly model: THREE.Object3D;
  private readonly disc: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly beam: THREE.Mesh;

  constructor(
    readonly drone: Drone,
    proto: Proto | undefined,
    atlas: THREE.Texture,
    glowTex: THREE.Texture,
  ) {
    this.model = proto?.object.clone() ?? new THREE.Group();
    this.model.position.y = DRONE_Y;
    // The floor the drone scans: a lit disc, and a faint cone of light down to it.
    this.disc = floorGlow(glowTex, drone.radius * 2.5, "#7df2ff", 0.5, 0.04);
    this.disc.renderOrder = 2;
    this.beam = lightBeam(0.12, drone.radius * 0.95, DRONE_Y - 0.1, "#7df2ff", 0.09);
    this.root.add(this.model, this.disc, this.beam);
    this.badge = new Badge(atlas, 0.48);
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.root, this.badge.mesh);
  }

  sync(dt: number, alarm: boolean, time: number, camera: THREE.Camera) {
    const d = this.drone;
    this.root.position.set(d.x, 0, d.z);
    this.model.rotation.y = d.yaw;
    this.model.position.y = DRONE_Y + (d.off ? -0.25 : Math.sin(time * 2.4 + d.x) * 0.06);
    this.model.rotation.z = d.off ? 0.25 : 0;
    void dt;
    const hot = d.awareness > 0.6 || alarm;
    const color = d.off ? "#64748b" : hot ? "#ff4d4d" : d.awareness > 0.02 ? "#ffad42" : "#7df2ff";
    this.disc.visible = this.beam.visible = !d.off;
    this.disc.material.color.set(color);
    this.disc.material.opacity = 0.42 + Math.sin(time * 5) * 0.06;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uColor.value.set(color);
    const b = this.badge;
    b.mesh.visible = !d.off && d.awareness > 0.03;
    if (b.mesh.visible) {
      b.mesh.position.set(d.x, DRONE_Y + 0.6, d.z);
      b.mesh.quaternion.copy(camera.quaternion);
      b.set(d.awareness >= 1 ? 1 : 0, d.awareness, hot ? "#ff4d4d" : "#ffc14d");
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.badge.mesh.removeFromParent();
    this.badge.dispose();
    this.disc.geometry.dispose();
    this.disc.material.dispose();
    this.beam.geometry.dispose();
    (this.beam.material as THREE.Material).dispose();
  }
}
