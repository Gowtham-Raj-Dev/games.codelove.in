import * as THREE from "three";
import { Pool, type Proto } from "../shared/assets";

/**
 * Procedural effects: drift sparks / boost flames (one pooled additive point cloud), tyre marks
 * (one ring-buffer mesh), smoke puffs (the Toy Car Kit smoke model, pooled) and shield bubbles.
 */

const MAX_SPARKS = 900;

export class Sparks {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX_SPARKS * 3);
  private readonly col = new Float32Array(MAX_SPARKS * 3);
  private readonly size = new Float32Array(MAX_SPARKS);
  private readonly alpha = new Float32Array(MAX_SPARKS);
  private readonly vel = new Float32Array(MAX_SPARKS * 3);
  private readonly life = new Float32Array(MAX_SPARKS);
  private readonly maxLife = new Float32Array(MAX_SPARKS);
  private readonly baseSize = new Float32Array(MAX_SPARKS);
  private readonly drag = new Float32Array(MAX_SPARKS);
  private readonly gravity = new Float32Array(MAX_SPARKS);
  private next = 0;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: 400 } },
      vertexShader: `
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
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float core = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * (core * core * 1.6 + core * 0.4) * vAlpha, 1.0);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Point size scale: viewport height / (2 tan(fov / 2)). */
  setScale(viewportHeight: number, fovDeg: number) {
    this.material.uniforms.scale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, drag = 2, gravity = 0) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_SPARKS;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= damp;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * damp - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= damp;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = k;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

const MAX_MARKS = 900;

/** Dark tyre marks laid while drifting, in a ring buffer. */
export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private readonly pos = new Float32Array(MAX_MARKS * 4 * 3);
  private next = 0;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let q = 0; q < MAX_MARKS; q++) {
      const b = q * 4;
      index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: "#1d1d22", transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** A strip from (ax, az) to (bx, bz) at height y, `w` wide. */
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.01 || len > 4) return;
    const nx = (-dz / len) * w * 0.5;
    const nz = (dx / len) * w * 0.5;
    const o = this.next * 12;
    this.next = (this.next + 1) % MAX_MARKS;
    const p = this.pos;
    p[o] = ax + nx;
    p[o + 1] = ay + 0.03;
    p[o + 2] = az + nz;
    p[o + 3] = ax - nx;
    p[o + 4] = ay + 0.03;
    p[o + 5] = az - nz;
    p[o + 6] = bx + nx;
    p[o + 7] = by + 0.03;
    p[o + 8] = bz + nz;
    p[o + 9] = bx - nx;
    p[o + 10] = by + 0.03;
    p[o + 11] = bz - nz;
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  clear() {
    this.pos.fill(0);
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

interface Puff {
  obj: THREE.Object3D;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  s0: number;
  s1: number;
  spin: number;
}

/** Smoke / dust puffs made of the library smoke model. */
export class Puffs {
  private readonly pool: Pool;
  private puffs: Puff[] = [];
  constructor(
    protos: Map<string, Proto>,
    parent: THREE.Object3D,
    private readonly key: string,
  ) {
    this.pool = new Pool(protos, parent);
  }

  emit(x: number, y: number, z: number, size: number, life = 0.7, vx = 0, vy = 1.5, vz = 0) {
    if (this.puffs.length > 70) return;
    const obj = this.pool.get(this.key);
    obj.position.set(x, y, z);
    obj.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    obj.scale.setScalar(size * 0.4);
    this.puffs.push({ obj, life, max: life, vx, vy, vz, s0: size * 0.5, s1: size * 1.3, spin: (Math.random() - 0.5) * 3 });
  }

  update(dt: number) {
    this.puffs = this.puffs.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.release(this.key, p.obj);
        return false;
      }
      const t = 1 - p.life / p.max;
      p.obj.position.x += p.vx * dt;
      p.obj.position.y += p.vy * dt;
      p.obj.position.z += p.vz * dt;
      p.vx *= Math.exp(-2 * dt);
      p.vz *= Math.exp(-2 * dt);
      p.obj.rotation.y += p.spin * dt;
      // Grow, then shrink away (the shared material can't fade).
      const grow = p.s0 + (p.s1 - p.s0) * Math.min(1, t * 2.2);
      p.obj.scale.setScalar(grow * (t > 0.55 ? Math.max(0, 1 - (t - 0.55) / 0.45) : 1));
      return true;
    });
  }

  clear() {
    for (const p of this.puffs) this.pool.release(this.key, p.obj);
    this.puffs = [];
  }
}

/** The shield bubble's material (shared by every kart's bubble). */
export function makeBubbleMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 }, strength: { value: 1 } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vP = position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float strength;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.2);
        float bands = 0.5 + 0.5 * sin(vP.y * 9.0 - time * 5.0);
        float a = (f * 0.95 + bands * 0.07) * strength;
        gl_FragColor = vec4(color * a, 1.0);
      }`,
  });
}

/** A glowing chevron decal for the boost pads (canvas texture, additive). */
export function makeChevronTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 256);
  for (let k = 0; k < 3; k++) {
    const y = 40 + k * 70;
    g.beginPath();
    g.moveTo(14, y + 44);
    g.lineTo(64, y);
    g.lineTo(114, y + 44);
    g.lineTo(114, y + 70);
    g.lineTo(64, y + 26);
    g.lineTo(14, y + 70);
    g.closePath();
    g.fillStyle = "#fff";
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Checkered finish-line paint (canvas texture). */
export function makeCheckerTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? "#141414" : "#f5f5f5";
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
