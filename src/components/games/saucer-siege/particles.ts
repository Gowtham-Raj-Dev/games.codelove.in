import * as THREE from "three";

/**
 * A pooled point-sprite particle system: one draw call for every spark, puff and flash of one blend
 * mode. Particles have velocity, drag, gravity, growth and a colour that fades out over their life.
 */

export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  color: THREE.Color | number;
  /** World size (tiles). */
  size: number;
  life: number;
  gravity?: number;
  drag?: number;
  /** Size multiplier reached at the end of the life. */
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
  private readonly base: Float32Array; // base colour per particle
  private readonly props: Float32Array; // life, maxLife, gravity, drag, size, grow, alpha
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
    this.points.renderOrder = additive ? 3 : 2;
  }

  /** Pixels per world unit at distance 1 — set from the camera on resize. */
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
    const c = typeof e.color === "number" ? this.tmp.setHex(e.color) : e.color;
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

  /** A burst of `n` particles from a point with random directions. */
  burst(n: number, x: number, y: number, z: number, opts: Omit<Emit, "x" | "y" | "z"> & { speed: number; up?: number; spread?: number; sizeJitter?: number }) {
    const { speed, up = 0, spread = 0, sizeJitter = 0.4 } = opts;
    for (let k = 0; k < n; k++) {
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.65);
      this.emit({
        ...opts,
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        z: z + (Math.random() - 0.5) * spread,
        vx: s * Math.cos(theta) * v,
        vy: u * v * 0.8 + up,
        vz: s * Math.sin(theta) * v,
        size: opts.size * (1 - sizeJitter / 2 + Math.random() * sizeJitter),
        life: opts.life * (0.7 + Math.random() * 0.6),
      });
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.count) {
      const p = i * 7;
      const life = (this.props[p] += dt);
      const max = this.props[p + 1];
      if (life >= max) {
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
      const t = life / max;
      this.size[i] = this.props[p + 4] * (1 + (this.props[p + 5] - 1) * t);
      // Quick fade-in, smooth fade-out.
      this.alpha[i] = this.props[p + 6] * Math.min(1, life * 30) * (1 - t * t);
      this.col[i3] = this.base[i3];
      this.col[i3 + 1] = this.base[i3 + 1];
      this.col[i3 + 2] = this.base[i3 + 2];
      i++;
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.count);
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) {
      const attr = geo.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.count * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  /** Moves the last particle into slot i. */
  private kill(i: number) {
    const last = --this.count;
    if (i === last) return;
    const i3 = i * 3;
    const l3 = last * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k];
      this.vel[i3 + k] = this.vel[l3 + k];
      this.base[i3 + k] = this.base[l3 + k];
      this.col[i3 + k] = this.col[l3 + k];
    }
    this.size[i] = this.size[last];
    this.alpha[i] = this.alpha[last];
    const p = i * 7;
    const lp = last * 7;
    for (let k = 0; k < 7; k++) this.props[p + k] = this.props[lp + k];
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
