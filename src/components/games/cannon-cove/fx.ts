import * as THREE from "three";
import { waveHeight } from "./ocean";

/** Procedural effects: soft particles (smoke, spray, splinters, sparks), water rings and ship wakes. */

export interface ParticleOptions {
  life?: number;
  size?: number;
  /** Size at the end of life. */
  grow?: number;
  color?: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  /** Velocity damping per second (0 = none). */
  drag?: number;
  /** Rising (negative gravity) smoke etc. */
  spread?: number;
}

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  vColor = aColor;
  #include <fog_vertex>
}`;

const PARTICLE_FRAG = /* glsl */ `
varying vec4 vColor;
uniform float uSoft;
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vColor.a <= 0.0) discard;
  float a = mix(1.0 - step(0.5, d), smoothstep(0.5, 0.05, d), uSoft);
  float shade = 1.0 - c.y * 0.45 * uSoft;
  gl_FragColor = vec4(vColor.rgb * shade, vColor.a * a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const tmpColor = new THREE.Color();

export class Particles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly data: Float32Array; // age, life, size0, size1, alpha, gravity, drag, unused
  private next = 0;
  private alive = 0;

  constructor(
    private readonly capacity: number,
    { additive = false, soft = true } = {},
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.data = new Float32Array(capacity * 8);
    for (let i = 0; i < capacity; i++) this.data[i * 8 + 1] = -1;
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 }, uSoft: { value: soft ? 1 : 0 } }]),
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setScale(viewportHeight: number, fovDeg: number) {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: ParticleOptions = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    tmpColor.set(o.color ?? "#ffffff");
    this.col.set([tmpColor.r, tmpColor.g, tmpColor.b, 0], i * 4);
    const d = i * 8;
    this.data[d] = 0;
    this.data[d + 1] = o.life ?? 1;
    this.data[d + 2] = o.size ?? 1;
    this.data[d + 3] = o.grow ?? o.size ?? 1;
    this.data[d + 4] = o.alpha ?? 1;
    this.data[d + 5] = o.gravity ?? 0;
    this.data[d + 6] = o.drag ?? 0;
    this.alive = this.capacity;
  }

  /** A burst of `count` particles around a point with random velocities. */
  burst(p: THREE.Vector3, count: number, speed: number, up: number, o: ParticleOptions, dir?: THREE.Vector3, cone = 1) {
    for (let k = 0; k < count; k++) {
      let vx = (Math.random() * 2 - 1) * speed;
      let vy = up * (0.5 + Math.random() * 0.8);
      let vz = (Math.random() * 2 - 1) * speed;
      if (dir) {
        const s = speed * (0.4 + Math.random() * 0.8);
        vx = dir.x * s + vx * cone * 0.5;
        vy = dir.y * s + vy;
        vz = dir.z * s + vz * cone * 0.5;
      }
      const spread = o.spread ?? 0.3;
      this.spawn(
        p.x + (Math.random() - 0.5) * spread,
        p.y + (Math.random() - 0.5) * spread,
        p.z + (Math.random() - 0.5) * spread,
        vx,
        vy,
        vz,
        { ...o, life: (o.life ?? 1) * (0.7 + Math.random() * 0.6), size: (o.size ?? 1) * (0.75 + Math.random() * 0.5) },
      );
    }
  }

  update(dt: number) {
    if (!this.alive) return;
    let any = 0;
    const { pos, vel, col, size, data } = this;
    for (let i = 0; i < this.capacity; i++) {
      const d = i * 8;
      const life = data[d + 1];
      if (life < 0) continue;
      const age = (data[d] += dt);
      if (age >= life) {
        data[d + 1] = -1;
        size[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      any++;
      const t = age / life;
      const drag = Math.exp(-data[d + 6] * dt);
      const p = i * 3;
      vel[p] *= drag;
      vel[p + 1] = vel[p + 1] * drag - data[d + 5] * dt;
      vel[p + 2] *= drag;
      pos[p] += vel[p] * dt;
      pos[p + 1] += vel[p + 1] * dt;
      pos[p + 2] += vel[p + 2] * dt;
      size[i] = data[d + 2] + (data[d + 3] - data[d + 2]) * t;
      // Quick fade in, long fade out.
      const fade = Math.min(1, t * 12) * (1 - t) * (1 - t * 0.3);
      col[i * 4 + 3] = data[d + 4] * fade;
    }
    this.alive = any;
    const g = this.geometry.attributes;
    g.position.needsUpdate = true;
    g.aColor.needsUpdate = true;
    g.aSize.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.data[i * 8 + 1] = -1;
      this.size[i] = 0;
      this.col[i * 4 + 3] = 0;
    }
    this.alive = 1;
    this.update(0);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --- Rings on the water (splash rings, impact markers) ----------------------------------------------

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  r0: number;
  r1: number;
  alpha: number;
  pulse: boolean;
  x: number;
  z: number;
}

export class Rings {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.RingGeometry(0.82, 1, 48);
  /** Bold rings for impact warnings. */
  private readonly thick = new THREE.RingGeometry(0.62, 1, 48);
  private readonly rings: Ring[] = [];

  constructor(count = 40) {
    this.geometry.rotateX(-Math.PI / 2);
    this.thick.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, opacity: 0, fog: true });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, material, age: 0, life: 0, r0: 1, r1: 1, alpha: 1, pulse: false, x: 0, z: 0 });
    }
  }

  spawn(x: number, z: number, { r0 = 0.5, r1 = 4, life = 1, color = "#ffffff" as THREE.ColorRepresentation, alpha = 0.8, pulse = false } = {}) {
    const ring = this.rings.find((r) => !r.mesh.visible) ?? this.rings.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    Object.assign(ring, { age: 0, life, r0, r1, alpha, pulse, x, z });
    ring.material.color.set(color);
    ring.mesh.geometry = pulse ? this.thick : this.geometry;
    ring.mesh.visible = true;
    return ring;
  }

  update(dt: number) {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      let s: number;
      let a: number;
      if (r.pulse) {
        // Impact warning: shrinks onto the target while blinking faster.
        s = r.r0 + (r.r1 - r.r0) * t;
        a = r.alpha * (0.55 + 0.45 * Math.sin(r.age * (10 + t * 22)));
      } else {
        s = r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t));
        a = r.alpha * (1 - t);
      }
      r.mesh.scale.setScalar(s);
      r.material.opacity = a;
      r.mesh.position.set(r.x, waveHeight(r.x, r.z) + 0.08, r.z);
    }
  }

  clear() {
    for (const r of this.rings) r.mesh.visible = false;
  }

  dispose() {
    this.geometry.dispose();
    this.thick.dispose();
    for (const r of this.rings) r.material.dispose();
  }
}

// --- Wakes ------------------------------------------------------------------------------------------

const WAKE_POINTS = 44;
const WAKE_LIFE = 5.5;
const WAKE_STEP = 0.12;

const WAKE_VERT = /* glsl */ `
attribute vec3 aWake; // across (0..1), age (0..1), strength
varying vec3 vWake;
varying vec2 vXZ;
#include <fog_pars_vertex>
void main() {
  vWake = aWake;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WAKE_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vWake;
varying vec2 vXZ;
#include <fog_pars_fragment>
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float across = abs(vWake.x * 2.0 - 1.0);
  float age = vWake.y;
  // Two foam lines along the edges, churned water right behind the stern, broken up by noise.
  float edge = smoothstep(0.5, 0.88, across) * (1.0 - smoothstep(0.9, 1.0, across));
  float churn = (1.0 - smoothstep(0.0, 0.75, across)) * (1.0 - smoothstep(0.0, 0.3, age));
  float n = noise(vXZ * 1.3 + vec2(uTime * 0.25, 0.0)) * 0.55 + noise(vXZ * 3.4 - vec2(0.0, uTime * 0.4)) * 0.45;
  float foam = (edge + churn * 0.9) * smoothstep(0.32 + age * 0.3, 0.72 + age * 0.15, n);
  float a = foam * (1.0 - age) * vWake.z;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.97, 0.99, 1.0), min(1.0, a * 1.1));
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createWakeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: WAKE_VERT,
    fragmentShader: WAKE_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
  });
}

interface WakePoint {
  x: number;
  z: number;
  /** Seconds since the point was dropped. */
  age: number;
  strength: number;
  width: number;
}

/** A foam ribbon trailing a ship's stern, widening and fading with age. */
export class Wake {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(WAKE_POINTS * 2 * 3);
  private readonly attr = new Float32Array(WAKE_POINTS * 2 * 3);
  private readonly points: WakePoint[] = [];
  private since = 0;

  constructor(material: THREE.Material) {
    const index: number[] = [];
    for (let i = 0; i < WAKE_POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aWake", new THREE.BufferAttribute(this.attr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  reset() {
    this.points.length = 0;
    this.geometry.setDrawRange(0, 0);
  }

  /** Call every frame with the stern position; strength 0..1 (by speed). */
  update(dt: number, x: number, z: number, strength: number, width: number) {
    for (const p of this.points) p.age += dt;
    while (this.points.length && this.points[this.points.length - 1].age > WAKE_LIFE) this.points.pop();
    this.since += dt;
    const head = this.points[0];
    if (!head || this.since >= WAKE_STEP) {
      this.since = 0;
      this.points.unshift({ x, z, age: 0, strength, width });
      if (this.points.length > WAKE_POINTS) this.points.length = WAKE_POINTS;
    } else {
      head.x = x;
      head.z = z;
      head.strength = strength;
    }
    const n = this.points.length;
    if (n < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const a = this.points[Math.max(0, i - 1)];
      const b = this.points[Math.min(n - 1, i + 1)];
      let dx = a.x - b.x;
      let dz = a.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const t = Math.min(1, p.age / WAKE_LIFE);
      const half = p.width * 0.5 + t * 4.5;
      const y = waveHeight(p.x, p.z) + 0.07;
      const v = i * 6;
      this.pos[v] = p.x - dz * half;
      this.pos[v + 1] = y;
      this.pos[v + 2] = p.z + dx * half;
      this.pos[v + 3] = p.x + dz * half;
      this.pos[v + 4] = y;
      this.pos[v + 5] = p.z - dx * half;
      const s = i === n - 1 ? 0 : p.strength;
      this.attr.set([0, t, s, 1, t, s], v);
    }
    this.geometry.setDrawRange(0, (n - 1) * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aWake.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
  }
}
