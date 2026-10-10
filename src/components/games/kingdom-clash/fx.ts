import * as THREE from "three";

/**
 * Kingdom Clash — effects: a pooled point-sprite particle system (sparks, dust, smoke, magic), and
 * the DOM overlay that follows the 3D view (collect bubbles, timers, health bars, floating numbers).
 */

export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  color: number;
  size: number;
  life: number;
  gravity?: number;
  drag?: number;
  grow?: number;
  alpha?: number;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
}`;

const FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  if (d > 1.0) discard;
  float a = vAlpha * (1.0 - smoothstep(uSoft, 1.0, d));
  gl_FragColor = vec4(vColor, a);
}`;

export class Particles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly base: Float32Array;
  private readonly props: Float32Array;
  private count = 0;
  private readonly tmp = new THREE.Color();

  constructor(
    private readonly max: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.props = new Float32Array(max * 7);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 400 }, uSoft: { value: additive ? 0.0 : 0.55 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  setScale(viewportHeight: number, fovDeg: number) {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(e: Emit) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = e.x;
    this.pos[i3 + 1] = e.y;
    this.pos[i3 + 2] = e.z;
    this.vel[i3] = e.vx ?? 0;
    this.vel[i3 + 1] = e.vy ?? 0;
    this.vel[i3 + 2] = e.vz ?? 0;
    const c = this.tmp.setHex(e.color);
    this.base[i3] = c.r;
    this.base[i3 + 1] = c.g;
    this.base[i3 + 2] = c.b;
    const p = i * 7;
    this.props[p] = 0;
    this.props[p + 1] = e.life;
    this.props[p + 2] = e.gravity ?? 0;
    this.props[p + 3] = e.drag ?? 0;
    this.props[p + 4] = e.size;
    this.props[p + 5] = e.grow ?? 1;
    this.props[p + 6] = e.alpha ?? 1;
  }

  burst(n: number, x: number, y: number, z: number, o: { color: number; size: number; life: number; speed: number; up?: number; gravity?: number; drag?: number; grow?: number; spread?: number; alpha?: number }) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = o.speed * (0.35 + Math.random() * 0.65);
      const sp = o.spread ?? 0;
      this.emit({
        x: x + (Math.random() - 0.5) * sp,
        y,
        z: z + (Math.random() - 0.5) * sp,
        vx: Math.cos(a) * s,
        vy: (o.up ?? 0) * (0.5 + Math.random()),
        vz: Math.sin(a) * s,
        color: o.color,
        size: o.size * (0.6 + Math.random() * 0.8),
        life: o.life * (0.6 + Math.random() * 0.6),
        gravity: o.gravity,
        drag: o.drag,
        grow: o.grow,
        alpha: o.alpha,
      });
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.count) {
      const p = i * 7;
      this.props[p] += dt;
      if (this.props[p] >= this.props[p + 1]) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const drag = Math.exp(-this.props[p + 3] * dt);
      this.vel[i3] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag - this.props[p + 2] * dt;
      this.vel[i3 + 2] *= drag;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.3;
      }
      const t = this.props[p] / this.props[p + 1];
      this.size[i] = this.props[p + 4] * (1 + (this.props[p + 5] - 1) * t);
      this.alpha[i] = this.props[p + 6] * (1 - t * t);
      this.col[i3] = this.base[i3];
      this.col[i3 + 1] = this.base[i3 + 1];
      this.col[i3 + 2] = this.base[i3 + 2];
      i++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) (geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  private kill(i: number) {
    const last = --this.count;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.base.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.props.copyWithin(i * 7, last * 7, last * 7 + 7);
    this.size[i] = this.size[last];
    this.alpha[i] = this.alpha[last];
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// --- DOM overlay ----------------------------------------------------------------------------------------

interface Tracked {
  el: HTMLElement;
  pos: THREE.Vector3;
  /** Pixel offset (y up). */
  dy: number;
  alive: boolean;
}

interface Floater {
  el: HTMLElement;
  pos: THREE.Vector3;
  t: number;
  life: number;
  rise: number;
}

/** Labels that follow points in the 3D view. Keyed labels persist until removed; floaters fade out. */
export class Overlay {
  private readonly tracked = new Map<string, Tracked>();
  private readonly floaters: Floater[] = [];
  private readonly floaterPool: HTMLElement[] = [];
  private readonly v = new THREE.Vector3();
  width = 1;
  height = 1;

  constructor(
    readonly el: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {}

  /** Gets (or creates) a label; `make` builds its content the first time. */
  label(key: string, pos: THREE.Vector3, make: (el: HTMLElement) => void, dy = 0) {
    let t = this.tracked.get(key);
    if (!t) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.left = "0";
      el.style.top = "0";
      el.style.willChange = "transform";
      make(el);
      this.el.appendChild(el);
      t = { el, pos: new THREE.Vector3(), dy, alive: true };
      this.tracked.set(key, t);
    }
    t.pos.copy(pos);
    t.dy = dy;
    t.alive = true;
    return t.el;
  }

  has(key: string) {
    return this.tracked.has(key);
  }

  remove(key: string) {
    const t = this.tracked.get(key);
    if (!t) return;
    t.el.remove();
    this.tracked.delete(key);
  }

  /** Marks every label stale; labels not refreshed before `sweep()` are removed. */
  mark(prefix: string) {
    for (const [k, t] of this.tracked) if (k.startsWith(prefix)) t.alive = false;
  }

  sweep(prefix: string) {
    for (const [k, t] of this.tracked)
      if (k.startsWith(prefix) && !t.alive) {
        t.el.remove();
        this.tracked.delete(k);
      }
  }

  clear(prefix = "") {
    for (const [k, t] of this.tracked)
      if (k.startsWith(prefix)) {
        t.el.remove();
        this.tracked.delete(k);
      }
    if (!prefix) {
      for (const f of this.floaters) f.el.remove();
      this.floaters.length = 0;
    }
  }

  float(text: string, pos: THREE.Vector3, color: string, { size = 18, life = 1.1, rise = 46, icon = "" } = {}) {
    if (this.floaters.length > 40) return;
    const el = this.floaterPool.pop() ?? document.createElement("div");
    el.className = "g-display pointer-events-none absolute left-0 top-0 whitespace-nowrap";
    el.style.color = color;
    el.style.fontSize = `${size}px`;
    el.style.textShadow = "0 2px 0 #1f2937, 1px 0 0 #1f2937, -1px 0 0 #1f2937, 0 -1px 0 #1f2937";
    el.innerHTML = icon ? `${icon}<span style="margin-left:3px">${text}</span>` : text;
    el.style.display = "flex";
    el.style.alignItems = "center";
    this.el.appendChild(el);
    this.floaters.push({ el, pos: pos.clone(), t: 0, life, rise });
  }

  update(dt: number) {
    const w = this.width;
    const h = this.height;
    for (const t of this.tracked.values()) {
      this.v.copy(t.pos).project(this.camera);
      const visible = this.v.z < 1 && this.v.x > -1.2 && this.v.x < 1.2 && this.v.y > -1.2 && this.v.y < 1.2;
      t.el.style.display = visible ? "" : "none";
      if (!visible) continue;
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h - t.dy;
      t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t += dt;
      if (f.t >= f.life) {
        f.el.remove();
        this.floaterPool.push(f.el);
        this.floaters.splice(i, 1);
        continue;
      }
      this.v.copy(f.pos).project(this.camera);
      const k = f.t / f.life;
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h - f.rise * Math.sqrt(k);
      const s = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.4);
      f.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
    }
  }
}

// --- Small procedural meshes ----------------------------------------------------------------------------

/** A flat ring + disc on the ground (range rings, spell areas). */
export function groundRing(color: string, opacity = 0.18) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false });
  const discMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), ringMat);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), discMat);
  ring.rotation.x = disc.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  disc.position.y = 0.05;
  ring.renderOrder = disc.renderOrder = 3;
  g.add(disc, ring);
  return {
    group: g,
    ringMat,
    discMat,
    dispose() {
      ring.geometry.dispose();
      disc.geometry.dispose();
      ringMat.dispose();
      discMat.dispose();
    },
  };
}

/** A jagged lightning bolt from the sky to (x, z). */
export function boltLine(x: number, z: number, material: THREE.LineBasicMaterial) {
  const pts: THREE.Vector3[] = [];
  let px = x + (Math.random() - 0.5) * 2;
  let pz = z + (Math.random() - 0.5) * 2;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = 14 * (1 - t);
    if (i === 10) {
      px = x;
      pz = z;
    } else {
      px += (x - px) * 0.25 + (Math.random() - 0.5) * 0.9;
      pz += (z - pz) * 0.25 + (Math.random() - 0.5) * 0.9;
    }
    pts.push(new THREE.Vector3(px, y, pz));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, material);
  line.renderOrder = 7;
  line.frustumCulled = false;
  return line;
}

/** A jagged electric arc between two points (Hidden Tesla shocks), with a little sag. */
export function arcLine(a: THREE.Vector3, b: THREE.Vector3, material: THREE.LineBasicMaterial, jitter = 0.28) {
  const pts: THREE.Vector3[] = [];
  const n = Math.max(6, Math.round(a.distanceTo(b) * 2.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    if (i > 0 && i < n) {
      const k = Math.sin(t * Math.PI);
      p.x += (Math.random() - 0.5) * jitter * 2 * k;
      p.y += (Math.random() - 0.5) * jitter * 2 * k - k * 0.25;
      p.z += (Math.random() - 0.5) * jitter * 2 * k;
    }
    pts.push(p);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, material);
  line.renderOrder = 7;
  line.frustumCulled = false;
  return line;
}
