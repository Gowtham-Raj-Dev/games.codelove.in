import * as THREE from "three";
import type { Proto } from "../shared/assets";

/**
 * Procedural effects (the only non-library geometry in the game): additive particles, glow points,
 * camera-facing beams (lasers, reticles, speed lines, telegraph lines), flash spheres, the shield
 * bubble and the starfield / nebula sky. Plus an instancer that draws many copies of a library
 * model in one draw call per material.
 */

const POINT_VERTEX = `
  uniform float scale;
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(size * scale / max(0.1, -mv.z), 384.0);
    gl_Position = projectionMatrix * mv;
  }`;

const POINT_FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    vec3 c = vColor * (core * core * 1.7 + core * 0.35) * vAlpha;
    gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
  }`;

function pointMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { scale: { value: 400 } },
    vertexShader: POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
  });
}

const pointScale = (viewportHeight: number, fovDeg: number) => viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));

// --- Particles ------------------------------------------------------------------------------------

/** Pooled, life-limited glowing points: sparks, fireballs, engine trails, debris dust. */
export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly grow: Float32Array;
  private readonly drag: Float32Array;
  private readonly baseCol: Float32Array;
  private next = 0;
  private readonly material = pointMaterial();

  constructor(max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.baseSize = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseCol = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  setScale(viewportHeight: number, fovDeg: number) {
    this.material.uniforms.scale.value = pointScale(viewportHeight, fovDeg);
  }

  emit(p: THREE.Vector3, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, drag = 2, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.baseCol[i3] = color.r;
    this.baseCol[i3 + 1] = color.g;
    this.baseCol[i3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.grow[i] = grow;
    this.drag[i] = drag;
  }

  /** A burst of `n` particles flying out in random directions. */
  burst(p: THREE.Vector3, n: number, speed: number, color: THREE.Color, size: number, life: number, base?: THREE.Vector3, drag = 2.5, grow = 0) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.65);
      this.emit(p, r * Math.cos(a) * v + (base?.x ?? 0), u * v + (base?.y ?? 0), r * Math.sin(a) * v + (base?.z ?? 0), color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), drag, grow);
    }
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.size.fill(0);
    (this.points.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) {
    const { pos, vel, life, maxLife, size, alpha, col, baseCol, baseSize, grow, drag } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) {
          alpha[i] = 0;
          size[i] = 0;
        }
        continue;
      }
      life[i] -= dt;
      const i3 = i * 3;
      const k = Math.exp(-drag[i] * dt);
      vel[i3] *= k;
      vel[i3 + 1] *= k;
      vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const t = 1 - Math.max(0, life[i]) / maxLife[i];
      size[i] = baseSize[i] * (1 + grow[i] * t);
      alpha[i] = (1 - t) * (1 - t * 0.3);
      // Hot particles cool from white towards their colour.
      const heat = Math.max(0, 1 - t * 4) * 0.6;
      col[i3] = baseCol[i3] + (1 - baseCol[i3]) * heat;
      col[i3 + 1] = baseCol[i3 + 1] + (1 - baseCol[i3 + 1]) * heat;
      col[i3 + 2] = baseCol[i3 + 2] + (1 - baseCol[i3 + 2]) * heat;
    }
    const a = this.points.geometry.attributes;
    (a.position as THREE.BufferAttribute).needsUpdate = true;
    (a.color as THREE.BufferAttribute).needsUpdate = true;
    (a.size as THREE.BufferAttribute).needsUpdate = true;
    (a.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// --- Glows (immediate mode) ------------------------------------------------------------------------

/** Glowing points re-submitted every frame: shot halos, engine glows, weak points, pickups. */
export class Glows {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private count = 0;
  private readonly material = pointMaterial();

  constructor(private readonly max = 900) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
  }

  setScale(viewportHeight: number, fovDeg: number) {
    this.material.uniforms.scale.value = pointScale(viewportHeight, fovDeg);
  }

  add(p: THREE.Vector3, color: THREE.Color, size: number, alpha = 1) {
    if (this.count >= this.max || !(size > 0) || !(alpha > 0)) return;
    const i = this.count++;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.size[i] = size;
    this.alpha[i] = Math.min(alpha, 4);
  }

  flush() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    for (const name of ["position", "color", "size", "alpha"]) (g.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
    this.count = 0;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// --- Beams (immediate mode) ------------------------------------------------------------------------

const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tD = new THREE.Vector3();
const tS = new THREE.Vector3();
const tE = new THREE.Vector3();

/**
 * Camera-facing glowing ribbons between two points, re-submitted every frame: lasers, boss beams,
 * reticles, lock-on brackets, telegraph lines and speed lines — all in one draw call.
 */
export class Beams {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly across: Float32Array;
  private count = 0;
  private readonly material: THREE.ShaderMaterial;
  private readonly eye = new THREE.Vector3();

  constructor(private readonly max = 1400) {
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    this.across = new Float32Array(max * 4);
    const index = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) {
      const v = i * 4;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("across", new THREE.BufferAttribute(this.across, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    for (let i = 0; i < max; i++) this.across.set([-1, 1, -1, 1], i * 4);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
      vertexShader: `
        attribute vec4 color;
        attribute float across;
        varying vec4 vColor;
        varying float vAcross;
        void main() {
          vColor = color;
          vAcross = across;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec4 vColor;
        varying float vAcross;
        void main() {
          float d = abs(vAcross);
          float glow = pow(max(0.0, 1.0 - d), 1.6);
          float core = smoothstep(0.42, 0.0, d);
          vec3 c = vColor.rgb * glow + vec3(core) * 0.8 * vColor.rgb;
          gl_FragColor = vec4(max(c * vColor.a, vec3(0.0)), 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  /** Call once per frame before adding beams. */
  begin(camera: THREE.Camera) {
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.count = 0;
  }

  add(a: THREE.Vector3, b: THREE.Vector3, width: number, color: THREE.Color, alpha = 1) {
    if (this.count >= this.max || !(alpha > 0)) return;
    tD.subVectors(b, a);
    const len = tD.length();
    if (!(len > 1e-4)) return;
    tE.subVectors(this.eye, a);
    tS.crossVectors(tD, tE);
    const sl = tS.length();
    if (!(sl > 1e-6)) return;
    tS.multiplyScalar(width / 2 / sl);
    // Extend each end by half a width so short beams read as capsules.
    tD.multiplyScalar(width / 2 / len);
    tA.copy(a).sub(tD);
    tB.copy(b).add(tD);
    const i = this.count++;
    const p = this.pos;
    let o = i * 12;
    p[o++] = tA.x - tS.x;
    p[o++] = tA.y - tS.y;
    p[o++] = tA.z - tS.z;
    p[o++] = tA.x + tS.x;
    p[o++] = tA.y + tS.y;
    p[o++] = tA.z + tS.z;
    p[o++] = tB.x - tS.x;
    p[o++] = tB.y - tS.y;
    p[o++] = tB.z - tS.z;
    p[o++] = tB.x + tS.x;
    p[o++] = tB.y + tS.y;
    p[o] = tB.z + tS.z;
    const c = this.col;
    const a4 = Math.min(alpha, 4);
    for (let k = 0; k < 4; k++) {
      const q = (i * 4 + k) * 4;
      c[q] = color.r;
      c[q + 1] = color.g;
      c[q + 2] = color.b;
      c[q + 3] = a4;
    }
  }

  flush() {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.count * 6);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// --- Flash spheres & shock rings ---------------------------------------------------------------------

interface Flash {
  mesh: THREE.Mesh;
  t: number;
  life: number;
  size: number;
  ring: boolean;
}

/** Expanding additive spheres (explosion flashes) and rings (shockwaves). */
export class Flashes {
  readonly group = new THREE.Group();
  private readonly sphere = new THREE.SphereGeometry(1, 20, 14);
  private readonly torus = new THREE.TorusGeometry(1, 0.06, 6, 48);
  private readonly items: Flash[] = [];

  spawn(p: THREE.Vector3, size: number, color: THREE.Color, life = 0.35, ring = false, quat?: THREE.Quaternion) {
    let f = this.items.find((x) => !x.mesh.visible && x.ring === ring);
    if (!f) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
      const mesh = new THREE.Mesh(ring ? this.torus : this.sphere, material);
      mesh.renderOrder = 9;
      this.group.add(mesh);
      f = { mesh, t: 0, life, size, ring };
      this.items.push(f);
    }
    f.mesh.visible = true;
    f.mesh.position.copy(p);
    if (quat) f.mesh.quaternion.copy(quat);
    (f.mesh.material as THREE.MeshBasicMaterial).color.copy(color);
    f.t = 0;
    f.life = life;
    f.size = size;
  }

  update(dt: number) {
    for (const f of this.items) {
      if (!f.mesh.visible) continue;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        f.mesh.visible = false;
        continue;
      }
      const s = f.size * (f.ring ? 0.2 + k * 1.1 : 0.35 + Math.sqrt(k) * 0.9);
      f.mesh.scale.setScalar(s);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * (f.ring ? 1 : 0.9);
    }
  }

  clear() {
    for (const f of this.items) f.mesh.visible = false;
  }

  dispose() {
    this.sphere.dispose();
    this.torus.dispose();
    for (const f of this.items) (f.mesh.material as THREE.Material).dispose();
  }
}

/** Fresnel bubble around the ship that lights up on hits and during barrel rolls. */
export function makeShieldBubble() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { color: { value: new THREE.Color("#22d3ee") }, strength: { value: 0 }, time: { value: 0 } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float strength;
      uniform float time;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float hex = 0.6 + 0.4 * sin(vP.x * 9.0 + time * 6.0) * sin(vP.y * 9.0 - time * 4.0) * sin(vP.z * 9.0);
        gl_FragColor = vec4(color * (f * 1.6 + 0.08) * hex * strength, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  mesh.renderOrder = 9;
  mesh.visible = false;
  return { mesh, material };
}

// --- Sky -------------------------------------------------------------------------------------------

export interface SkyColors {
  top: string;
  mid: string;
  bottom: string;
  nebulaA: string;
  nebulaB: string;
}

/** Nebula sphere + starfield that follow the camera (no fog, always behind everything). */
export class Sky {
  readonly group = new THREE.Group();
  private readonly nebula: THREE.Mesh;
  private readonly nebulaMat: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly starMat: THREE.ShaderMaterial;

  constructor() {
    this.nebulaMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        top: { value: new THREE.Color() },
        mid: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() },
        neb1: { value: new THREE.Color() },
        neb2: { value: new THREE.Color() },
        time: { value: 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 neb1; uniform vec3 neb2; uniform float time;
        varying vec3 vDir;
        float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float n3(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.03; a *= 0.5; } return v; }
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 base = y > 0.0 ? mix(mid, top, pow(y, 0.7)) : mix(mid, bottom, pow(-y, 0.7));
          float n = fbm(d * 2.2 + vec3(0.0, 0.0, time * 0.004));
          float m = fbm(d * 4.1 + vec3(5.2, 1.3, 0.0));
          float band = exp(-pow((d.y + d.x * 0.35) * 2.6, 2.0));
          vec3 col = base + neb1 * smoothstep(0.45, 0.85, n) * (0.5 + band) + neb2 * smoothstep(0.5, 0.9, m) * band * 0.9;
          gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
        }`,
    });
    this.nebula = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), this.nebulaMat);
    this.nebula.renderOrder = -10;
    this.nebula.frustumCulled = false;

    const n = 2600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const alpha = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const R = 2000;
      pos.set([r * Math.cos(a) * R, u * R, r * Math.sin(a) * R], i * 3);
      const tint = Math.random();
      c.setHSL(tint < 0.6 ? 0.58 : tint < 0.85 ? 0.1 : 0.85, 0.5, 0.8);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = Math.random() < 0.04 ? 9 + Math.random() * 6 : 2.5 + Math.random() * 4;
      alpha[i] = 0.35 + Math.random() * 0.65;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    geo.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
    this.starMat = pointMaterial();
    this.starMat.depthTest = false;
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.group.add(this.nebula, this.stars);
  }

  setColors(c: SkyColors) {
    const u = this.nebulaMat.uniforms;
    u.top.value.set(c.top);
    u.mid.value.set(c.mid);
    u.bottom.value.set(c.bottom);
    u.neb1.value.set(c.nebulaA);
    u.neb2.value.set(c.nebulaB);
  }

  setScale(viewportHeight: number, fovDeg: number) {
    // Stars are a fixed pixel size: scale by distance so they stay crisp.
    this.starMat.uniforms.scale.value = pointScale(viewportHeight, fovDeg) * 2.2;
  }

  update(camera: THREE.Camera, time: number) {
    this.group.position.setFromMatrixPosition(camera.matrixWorld);
    this.nebulaMat.uniforms.time.value = time;
  }

  dispose() {
    this.nebula.geometry.dispose();
    this.nebulaMat.dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
  }
}

// --- Instancer -------------------------------------------------------------------------------------

const tmpM = new THREE.Matrix4();

/** Draws many copies of a library model with one InstancedMesh per material; refilled every frame. */
export class Instancer {
  readonly group = new THREE.Group();
  private readonly parts: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = [];
  private count = 0;
  private readonly white = new THREE.Color(1, 1, 1);

  constructor(
    proto: Proto,
    readonly capacity: number,
    { colors = false }: { colors?: boolean } = {},
  ) {
    const root = proto.object;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mesh = new THREE.InstancedMesh(m.geometry, m.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      if (colors) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      this.parts.push({ mesh, local: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
      this.group.add(mesh);
    });
  }

  begin() {
    this.count = 0;
  }

  add(matrix: THREE.Matrix4, color?: THREE.Color) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    for (const p of this.parts) {
      tmpM.multiplyMatrices(matrix, p.local);
      p.mesh.setMatrixAt(i, tmpM);
      if (p.mesh.instanceColor) p.mesh.setColorAt(i, color ?? this.white);
    }
  }

  end() {
    for (const p of this.parts) {
      p.mesh.count = this.count;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const p of this.parts) p.mesh.dispose();
  }
}
