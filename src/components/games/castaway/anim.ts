import * as THREE from "three";

/** AnimationMixer wrapper: lazily created actions and cross-faded switches by clip name. */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  current: THREE.AnimationAction | null = null;
  name = "";

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) this.clips.set(c.name, c);
  }

  has(name: string) {
    return this.clips.has(name);
  }

  duration(name: string) {
    return this.clips.get(name)?.duration ?? 1;
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

  play(name: string, { once = false, fade = 0.15, speed = 1, restart = false } = {}) {
    const next = this.action(name);
    if (!next) return;
    if (this.current === next && !once && !restart) {
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

  get time() {
    return this.current?.time ?? 0;
  }

  /** 0..1 progress through the current clip. */
  get progress() {
    const a = this.current;
    if (!a) return 1;
    return Math.min(1, a.time / Math.max(1e-3, a.getClip().duration));
  }

  get finished() {
    const a = this.current;
    return !a || (a.loop === THREE.LoopOnce && a.time >= a.getClip().duration - 1e-3);
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  stopAll() {
    this.mixer.stopAllAction();
    this.current = null;
    this.name = "";
  }
}

export const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz);

export function angleDiff(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function turnTowards(from: number, to: number, rate: number, dt: number) {
  const d = angleDiff(from, to);
  const step = rate * dt;
  return from + (Math.abs(d) <= step ? d : Math.sign(d) * step);
}

export const damp = (current: number, target: number, lambda: number, dt: number) => current + (target - current) * (1 - Math.exp(-lambda * dt));
