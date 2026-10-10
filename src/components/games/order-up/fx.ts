import * as THREE from "three";

/**
 * Procedural extras for Order Up! — only things the library has no model for: steam and smoke
 * puffs, sparkles, progress rings, patience bars, order-bubble cards and floating money text.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function starTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.translate(32, 32);
  g.fillStyle = "#fff";
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 30 : 9;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type PuffKind = "steam" | "smoke" | "spark" | "puff" | "anger";

interface Particle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  age: number;
  vel: THREE.Vector3;
  grow: number;
  size: number;
  gravity: number;
  alpha: number;
  spin: number;
}

/** A fixed pool of camera-facing puffs and sparkles. */
export class Particles {
  readonly group = new THREE.Group();
  private readonly free: Particle[] = [];
  private readonly live: Particle[] = [];
  private readonly dot = dotTexture();
  private readonly star = starTexture();

  constructor(count = 160) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.dot, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 5;
      this.group.add(sprite);
      this.free.push({ sprite, mat, life: 1, age: 0, vel: new THREE.Vector3(), grow: 0, size: 1, gravity: 0, alpha: 1, spin: 0 });
    }
  }

  emit(kind: PuffKind, at: THREE.Vector3, count = 1, color?: THREE.ColorRepresentation) {
    for (let i = 0; i < count; i++) {
      const p = this.free.pop();
      if (!p) return;
      p.age = 0;
      p.mat.rotation = rand(0, Math.PI * 2);
      p.spin = 0;
      p.sprite.position.copy(at);
      p.sprite.visible = true;
      p.mat.map = this.dot;
      if (kind === "steam") {
        p.sprite.position.x += rand(-0.2, 0.2);
        p.sprite.position.z += rand(-0.2, 0.2);
        p.vel.set(rand(-0.1, 0.1), rand(0.6, 1.0), rand(-0.1, 0.1));
        p.life = rand(0.9, 1.4);
        p.size = rand(0.18, 0.28);
        p.grow = 0.5;
        p.gravity = 0;
        p.alpha = 0.45;
        p.mat.color.set(color ?? "#ffffff");
      } else if (kind === "smoke") {
        p.sprite.position.x += rand(-0.2, 0.2);
        p.sprite.position.z += rand(-0.2, 0.2);
        p.vel.set(rand(-0.15, 0.15), rand(0.7, 1.2), rand(-0.15, 0.15));
        p.life = rand(1.3, 2.0);
        p.size = rand(0.3, 0.45);
        p.grow = 0.8;
        p.gravity = 0;
        p.alpha = 0.7;
        p.mat.color.set(color ?? "#3b3b40");
      } else if (kind === "spark") {
        p.mat.map = this.star;
        const a = rand(0, Math.PI * 2);
        const s = rand(1.5, 3.2);
        p.vel.set(Math.cos(a) * s * 0.6, rand(2.2, 4.2), Math.sin(a) * s * 0.6);
        p.life = rand(0.6, 0.95);
        p.size = rand(0.16, 0.26);
        p.grow = -0.1;
        p.gravity = -7;
        p.alpha = 1;
        p.spin = rand(-6, 6);
        p.mat.color.set(color ?? "#ffd166");
      } else if (kind === "anger") {
        p.vel.set(rand(-0.6, 0.6), rand(0.8, 1.6), rand(-0.3, 0.3));
        p.life = rand(0.6, 0.9);
        p.size = rand(0.22, 0.34);
        p.grow = 0.6;
        p.gravity = 0;
        p.alpha = 0.85;
        p.mat.color.set(color ?? "#ef4444");
      } else {
        const a = rand(0, Math.PI * 2);
        p.vel.set(Math.cos(a) * rand(0.8, 1.6), rand(0.2, 1.0), Math.sin(a) * rand(0.8, 1.6));
        p.life = rand(0.35, 0.55);
        p.size = rand(0.18, 0.3);
        p.grow = 0.9;
        p.gravity = 0;
        p.alpha = 0.9;
        p.mat.color.set(color ?? "#ffffff");
      }
      p.sprite.scale.setScalar(p.size);
      p.mat.opacity = p.alpha;
      this.live.push(p);
    }
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.sprite.visible = false;
        this.live.splice(i, 1);
        this.free.push(p);
        continue;
      }
      p.vel.y += p.gravity * dt;
      if (p.gravity === 0) p.vel.multiplyScalar(1 - dt * 0.8);
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(Math.max(0.01, p.size * (1 + p.grow * k * 2)));
      p.mat.rotation += p.spin * dt;
      p.mat.opacity = p.alpha * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    }
  }

  clear() {
    for (const p of this.live) {
      p.sprite.visible = false;
      this.free.push(p);
    }
    this.live.length = 0;
  }

  dispose() {
    this.dot.dispose();
    this.star.dispose();
    for (const p of [...this.free, ...this.live]) p.mat.dispose();
  }
}

// --- Progress ring (patties) ------------------------------------------------------------------------

const RING_VERTEX = "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const RING_FRAGMENT = `
varying vec2 vUv;
uniform float progress;
uniform vec3 color;
uniform vec3 track;
uniform float opacity;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float aa = fwidth(r) * 1.2;
  float band = smoothstep(0.58 - aa, 0.58, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  float a = atan(p.x, p.y) / 6.2831853 + 0.5;
  a = 1.0 - a;
  float filled = step(a, progress);
  vec3 col = mix(track, color, filled);
  float alpha = band * opacity * mix(0.5, 1.0, filled);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}`;

/** A camera-facing circular progress ring. */
export class Ring {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;

  constructor(geometry: THREE.PlaneGeometry, size = 0.55) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        progress: { value: 0 },
        color: { value: new THREE.Color("#4ade80") },
        track: { value: new THREE.Color("#1f2937") },
        opacity: { value: 0.92 },
      },
    });
    this.mesh = new THREE.Mesh(geometry, this.mat);
    this.mesh.scale.setScalar(size);
    this.mesh.renderOrder = 20;
  }

  set(progress: number, color: THREE.ColorRepresentation, opacity = 0.92) {
    this.mat.uniforms.progress.value = progress;
    (this.mat.uniforms.color.value as THREE.Color).set(color);
    this.mat.uniforms.opacity.value = opacity;
  }

  dispose() {
    this.mat.dispose();
  }
}

// --- Order bubble card ------------------------------------------------------------------------------

/** Rounded card with a little tail pointing down at the customer (local origin = tail tip). */
export function bubbleGeometry(width: number, height: number, radius = 0.16, tail = 0.16) {
  const s = new THREE.Shape();
  const w = width / 2;
  const b = tail;
  const t = tail + height;
  s.moveTo(-w + radius, b);
  s.lineTo(-0.1, b);
  s.lineTo(0, 0);
  s.lineTo(0.1, b);
  s.lineTo(w - radius, b);
  s.quadraticCurveTo(w, b, w, b + radius);
  s.lineTo(w, t - radius);
  s.quadraticCurveTo(w, t, w - radius, t);
  s.lineTo(-w + radius, t);
  s.quadraticCurveTo(-w, t, -w, t - radius);
  s.lineTo(-w, b + radius);
  s.quadraticCurveTo(-w, b, -w + radius, b);
  return new THREE.ShapeGeometry(s, 6);
}

// --- Floating text ----------------------------------------------------------------------------------

export function textSprite(text: string, color: string, height = 0.42) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = "900 72px ui-rounded, 'SF Pro Rounded', system-ui, sans-serif";
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 36;
  c.width = w;
  c.height = 104;
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 14;
  g.strokeStyle = "rgba(20,12,30,0.9)";
  g.strokeText(text, w / 2, 54);
  g.fillStyle = color;
  g.fillText(text, w / 2, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((height * w) / 104, height, 1);
  sprite.renderOrder = 30;
  return sprite;
}

export function disposeSprite(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
