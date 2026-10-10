import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { HeroKind, RaiderKind, TroopKind } from "./data";
import { troopLook, type TroopLook } from "./recipes";
import type { Bank } from "./world";

/**
 * Kingdom Clash — animated characters. Every troop, raider and builder is a clone of a small
 * rigged library character with its gear (sword, bow, keg, crystal…) attached to a bone.
 */

export type CharKind = TroopKind | RaiderKind | HeroKind | "bones" | "builder";

/** glTF node names as three.js stores them ("handslot.r" → "handslotr", "Bip001 R Hand" → "Bip001_R_Hand"). */
const nodeName = (name: string) => THREE.PropertyBinding.sanitizeNodeName(name);

export class Unit3D {
  readonly root = new THREE.Group();
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  clip = "";
  readonly look: TroopLook;
  /** The gear it carries (sword, bomb…), in the look's order. */
  readonly gear: THREE.Object3D[] = [];
  /** Free for the pool once its death animation and fade finish. */
  dead = false;
  fade = 1;
  private readonly materials: THREE.Material[] = [];

  constructor(
    readonly kind: CharKind,
    readonly level: number,
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    look: TroopLook,
    scale: number,
    bank: Bank,
  ) {
    this.look = look;
    const scaler = new THREE.Group();
    scaler.scale.setScalar(scale);
    scaler.add(model);
    this.root.add(scaler);
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    });
    for (const name of look.hide ?? []) {
      const prop = model.getObjectByName(nodeName(name));
      if (prop) prop.visible = false;
    }
    for (const g of look.gear) {
      const ref = g.like ? model.getObjectByName(nodeName(g.like)) : undefined;
      const bone = ref?.parent ?? model.getObjectByName(nodeName(g.bone));
      if (!bone) continue;
      const gear = bank.group([{ m: g.m, s: g.s ?? 1, look: g.look }], `gear:${g.m}:${g.s ?? 1}:${g.look ?? ""}`, { cast: true, receive: false });
      if (ref) {
        // Same turn as the prop, centred where the prop's centre is.
        const c = new THREE.Box3().setFromObject(gear).getCenter(new THREE.Vector3()).applyQuaternion(ref.quaternion);
        gear.quaternion.copy(ref.quaternion);
        gear.position.copy(ref.position).sub(c);
        ref.visible = false;
      } else {
        gear.position.set(g.x ?? 0, g.y ?? 0, g.z ?? 0);
        gear.rotation.set(g.rx ?? 0, g.ry ?? 0, g.rz ?? 0);
      }
      bone.add(gear);
      this.gear.push(gear);
    }
    this.mixer = new THREE.AnimationMixer(model);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
  }

  play(name: string, { once = false, fade = 0.15, speed = 1, restart = false } = {}) {
    const next = this.actions.get(this.look.clips?.[name] ?? name);
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
    this.clip = name;
  }

  /** Fades the whole character (dead units sink away). */
  setOpacity(a: number) {
    if (!this.materials.length) {
      this.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = (mesh.material as THREE.Material).clone();
        m.transparent = true;
        mesh.material = m;
        this.materials.push(m);
      });
    }
    for (const m of this.materials) m.opacity = a;
  }

  resetLook() {
    if (!this.materials.length) return;
    for (const m of this.materials) m.opacity = 1;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  stop() {
    this.mixer.stopAllAction();
    this.current = null;
    this.clip = "";
  }

  dispose() {
    this.mixer.stopAllAction();
    this.materials.forEach((m) => m.dispose());
  }
}

/** Makes characters and recycles them per kind + level. */
export class UnitFactory {
  private readonly pools = new Map<string, Unit3D[]>();
  private readonly heights = new Map<string, number>();
  private readonly all: Unit3D[] = [];

  constructor(private readonly bank: Bank) {}

  has(kind: CharKind) {
    const look = troopLook(kind, 1);
    return this.bank.has(look.m) && (!look.clipSource || this.bank.has(look.clipSource));
  }

  get(kind: CharKind, level: number, parent: THREE.Object3D): Unit3D | null {
    const key = `${kind}:${level}`;
    const pooled = this.pools.get(key)?.pop();
    if (pooled) {
      pooled.dead = false;
      pooled.fade = 1;
      pooled.resetLook();
      pooled.root.visible = true;
      pooled.root.position.set(0, 0, 0);
      pooled.root.rotation.set(0, 0, 0);
      parent.add(pooled.root);
      return pooled;
    }
    const look = troopLook(kind, level);
    const src = this.bank.model(look.m);
    if (!src) return null;
    let raw = this.heights.get(look.m);
    if (raw === undefined) {
      const box = new THREE.Box3().setFromObject(src.scene, true);
      raw = Math.max(0.3, box.max.y - Math.min(0, box.min.y));
      this.heights.set(look.m, raw);
    }
    const model = cloneSkinned(src.scene);
    const u = new Unit3D(kind, level, model, this.clips(look), look, look.height / raw, this.bank);
    this.all.push(u);
    parent.add(u.root);
    return u;
  }

  private readonly borrowed = new Map<string, THREE.AnimationClip[]>();
  private readonly mixed = new Map<string, THREE.AnimationClip[]>();

  /** A look's animations; borrowed ones keep only bone rotations so the body keeps its own proportions. */
  private clips(look: TroopLook): THREE.AnimationClip[] {
    let list: THREE.AnimationClip[];
    if (!look.clipSource) list = this.bank.model(look.m)?.animations ?? [];
    else {
      const cached = this.borrowed.get(look.clipSource);
      if (cached) list = cached;
      else {
        const src = this.bank.model(look.clipSource)?.animations ?? [];
        list = src.map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter((t) => t.name.endsWith(".quaternion")).map((t) => t.clone())));
        this.borrowed.set(look.clipSource, list);
      }
    }
    if (!look.mix?.length) return list;
    // Made-up clips: one clip's legs and body with another's arms (the Wall Breaker runs holding its bomb out).
    const key = `${look.m}|${look.mix.map((m) => m.name).join(",")}`;
    const hit = this.mixed.get(key);
    if (hit) return hit;
    const byName = new Map(list.map((c) => [c.name, c]));
    const arm = (t: THREE.KeyframeTrack) => /^arm-(left|right)\./.test(t.name);
    const extra: THREE.AnimationClip[] = [];
    // A pose frozen from one moment of a clip (arms raised, holding the weapon up).
    const frozen = (t: THREE.KeyframeTrack, at: number) => {
      const interp = (t as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
      const v = Array.from(interp.evaluate(Math.min(at, t.times[t.times.length - 1])) as ArrayLike<number>);
      const Track = t.constructor as new (name: string, times: number[], values: number[]) => THREE.KeyframeTrack;
      return new Track(t.name, [0], v);
    };
    for (const mx of look.mix) {
      const base = byName.get(mx.base);
      const arms = byName.get(mx.arms);
      if (!base || !arms) continue;
      const armTracks = arms.tracks.filter(arm).map((t) => (mx.at === undefined ? t.clone() : frozen(t, mx.at)));
      extra.push(new THREE.AnimationClip(mx.name, base.duration, [...base.tracks.filter((t) => !arm(t)).map((t) => t.clone()), ...armTracks]));
    }
    const out = [...list, ...extra];
    this.mixed.set(key, out);
    return out;
  }

  release(u: Unit3D) {
    u.root.removeFromParent();
    u.stop();
    const key = `${u.kind}:${u.level}`;
    let list = this.pools.get(key);
    if (!list) this.pools.set(key, (list = []));
    list.push(u);
  }

  dispose() {
    for (const u of this.all) u.dispose();
  }
}
