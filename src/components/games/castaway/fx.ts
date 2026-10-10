import * as THREE from "three";

/**
 * Procedural effects (the only non-library visuals besides terrain, water and sky): particles for
 * fire, chips, splashes and dust; floating numbers; ground rings for focus and attack telegraphs;
 * small health bars. All pooled.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// --- Particles ---------------------------------------------------------------------------------------

export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  endSize?: number;
  color: THREE.ColorRepresentation;
  endColor?: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

export interface BurstOpts {
  speed: number;
  up?: number;
  life: number;
  size: number;
  color: THREE.ColorRepresentation;
  endColor?: THREE.ColorRepresentation;
  gravity?: number;
  drag?: number;
  spread?: number;
  dirX?: number;
  dirZ?: number;
  endSize?: number;
  alpha?: number;
  jitter?: number;
}

const c1 = new THREE.Color();
const c2 = new THREE.Color();

export class Particles {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly col0: Float32Array;
  private readonly col1: Float32Array;
  private readonly a0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  private alive = 0;
  /** Ground height for bouncing particles. */
  ground: (x: number, z: number) => number = () => 0;

  constructor(
    private readonly capacity: number,
    additive: boolean,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.s0 = new Float32Array(capacity);
    this.s1 = new Float32Array(capacity);
    this.col0 = new Float32Array(capacity * 3);
    this.col1 = new Float32Array(capacity * 3);
    this.a0 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color4", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec4 color4;
        uniform float scale;
        varying vec4 vColor;
        void main() {
          vColor = color4;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive
        ? /* glsl */ `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = clamp(1.0 - d, 0.0, 1.0);
          a = a * a * vColor.a;
          gl_FragColor = vec4(vColor.rgb * a, a);
        }`
        : /* glsl */ `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.55, d) * vColor.a;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor.rgb, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 7 : 6;
  }

  setScale(viewportHeight: number, fov: number) {
    this.mat.uniforms.scale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  emit(e: Emit) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const i3 = i * 3;
    this.pos[i3] = e.x;
    this.pos[i3 + 1] = e.y;
    this.pos[i3 + 2] = e.z;
    this.vel[i3] = e.vx ?? 0;
    this.vel[i3 + 1] = e.vy ?? 0;
    this.vel[i3 + 2] = e.vz ?? 0;
    this.life[i] = e.life;
    this.maxLife[i] = e.life;
    this.s0[i] = e.size;
    this.s1[i] = e.endSize ?? e.size * 0.3;
    c1.set(e.color);
    c2.set(e.endColor ?? e.color);
    this.col0[i3] = c1.r;
    this.col0[i3 + 1] = c1.g;
    this.col0[i3 + 2] = c1.b;
    this.col1[i3] = c2.r;
    this.col1[i3 + 1] = c2.g;
    this.col1[i3 + 2] = c2.b;
    this.a0[i] = e.alpha ?? 1;
    this.grav[i] = e.gravity ?? 0;
    this.drag[i] = e.drag ?? 0;
    this.alive = 1;
  }

  burst(n: number, x: number, y: number, z: number, o: BurstOpts) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = o.speed * rand(0.35, 1);
      let vx = Math.cos(a) * s;
      let vz = Math.sin(a) * s;
      if (o.dirX !== undefined && o.dirZ !== undefined) {
        const spread = o.spread ?? 0.6;
        vx = vx * spread + o.dirX * s;
        vz = vz * spread + o.dirZ * s;
      }
      const j = o.jitter ?? 0.1;
      this.emit({
        x: x + rand(-j, j),
        y: y + rand(-j, j),
        z: z + rand(-j, j),
        vx,
        vy: (o.up ?? 0) * rand(0.4, 1.2),
        vz,
        life: o.life * rand(0.6, 1.2),
        size: o.size * rand(0.7, 1.3),
        endSize: o.endSize,
        color: o.color,
        endColor: o.endColor,
        gravity: o.gravity,
        drag: o.drag ?? 2,
        alpha: o.alpha,
      });
    }
  }

  update(dt: number) {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < this.capacity; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      if (this.life[i] <= 0) {
        if (this.size[i] !== 0) {
          this.size[i] = 0;
          this.col[i4 + 3] = 0;
        }
        continue;
      }
      any++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= drag;
      this.vel[i3 + 2] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.grav[i] > 0) {
        const g = this.ground(this.pos[i3], this.pos[i3 + 2]) + 0.04;
        if (this.pos[i3 + 1] < g) {
          this.pos[i3 + 1] = g;
          this.vel[i3 + 1] *= -0.3;
          this.vel[i3] *= 0.6;
          this.vel[i3 + 2] *= 0.6;
        }
      }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i4] = this.col0[i3] + (this.col1[i3] - this.col0[i3]) * t;
      this.col[i4 + 1] = this.col0[i3 + 1] + (this.col1[i3 + 1] - this.col0[i3 + 1]) * t;
      this.col[i4 + 2] = this.col0[i3 + 2] + (this.col1[i3 + 2] - this.col0[i3 + 2]) * t;
      this.col[i4 + 3] = this.a0[i] * Math.min(1, t * 10) * (1 - t * t);
    }
    this.alive = any;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color4.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alive = 1;
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// --- Floating text -----------------------------------------------------------------------------------

interface Popup {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  t: number;
  vy: number;
  vx: number;
  base: number;
}

export class Popups {
  readonly group = new THREE.Group();
  private readonly list: Popup[] = [];
  private next = 0;
  font = "system-ui, sans-serif";

  constructor(count = 20) {
    for (let i = 0; i < count; i++) {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 72;
      const ctx = c.getContext("2d")!;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 20;
      sprite.visible = false;
      this.group.add(sprite);
      this.list.push({ sprite, ctx, tex, t: 1, vy: 0, vx: 0, base: 1 });
    }
  }

  show(text: string, x: number, y: number, z: number, color: string, size = 1) {
    const p = this.list[this.next];
    this.next = (this.next + 1) % this.list.length;
    const { ctx } = p;
    ctx.clearRect(0, 0, 256, 72);
    ctx.font = `700 ${text.length > 6 ? 40 : 50}px ${this.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(43,33,24,0.92)";
    ctx.strokeText(text, 128, 38);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 38);
    p.tex.needsUpdate = true;
    p.t = 0;
    p.vy = 2.4;
    p.vx = rand(-0.6, 0.6);
    p.base = size;
    p.sprite.visible = true;
    p.sprite.position.set(x, y, z);
    p.sprite.material.opacity = 1;
  }

  update(dt: number) {
    for (const p of this.list) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      p.vy -= dt * 4;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.x += p.vx * dt;
      const pop = p.t < 0.1 ? 0.6 + (p.t / 0.1) * 0.5 : 1.1 - Math.min(0.15, (p.t - 0.1) * 1.2);
      p.sprite.scale.set(2.2 * p.base * pop, 0.62 * p.base * pop, 1);
      p.sprite.material.opacity = p.t < 0.7 ? 1 : Math.max(0, 1 - (p.t - 0.7) / 0.35);
      if (p.t > 1.05) p.sprite.visible = false;
    }
  }

  clear() {
    for (const p of this.list) p.sprite.visible = false;
  }

  dispose() {
    for (const p of this.list) {
      p.tex.dispose();
      p.sprite.material.dispose();
    }
  }
}

// --- Ground rings (focus marker, attack telegraphs, placement footprint) -------------------------------

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uFill; uniform float uWidth; uniform float uTime; uniform float uDash;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ring = smoothstep(1.0 - uWidth - 0.04, 1.0 - uWidth, r) * (1.0 - smoothstep(0.96, 1.0, r));
  if (uDash > 0.0) {
    float a = atan(vUv.y, vUv.x);
    ring *= step(0.0, sin(a * uDash + uTime * 2.0));
  }
  float fill = uFill * step(r, 1.0) * (0.35 + 0.65 * smoothstep(0.0, 1.0, r));
  float a = max(ring, fill) * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class Ring {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(color: THREE.ColorRepresentation, { width = 0.12, dash = 0 } = {}) {
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: 1 },
          uFill: { value: 0 },
          uWidth: { value: width },
          uTime: { value: 0 },
          uDash: { value: dash },
        },
      }),
    );
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  set(x: number, y: number, z: number, radius: number, opacity = 1, fill = 0) {
    this.mesh.visible = opacity > 0.01;
    this.mesh.position.set(x, y + 0.06, z);
    this.mesh.scale.set(radius, 1, radius);
    const u = this.mesh.material.uniforms;
    u.uOpacity.value = opacity;
    u.uFill.value = fill;
  }

  color(c: THREE.ColorRepresentation) {
    (this.mesh.material.uniforms.uColor.value as THREE.Color).set(c);
  }

  tick(time: number) {
    this.mesh.material.uniforms.uTime.value = time;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Pool of telegraph rings (red discs filling up as an attack winds up). */
export class Telegraphs {
  readonly group = new THREE.Group();
  private readonly rings: { ring: Ring; t: number; dur: number; active: boolean; follow: { x: number; y: number; z: number } | null; r: number }[] = [];

  constructor(count = 12) {
    for (let i = 0; i < count; i++) {
      const ring = new Ring("#ef4444", { width: 0.1 });
      this.group.add(ring.mesh);
      this.rings.push({ ring, t: 0, dur: 1, active: false, follow: null, r: 1 });
    }
  }

  /** Shows a filling red disc at `pos` for `dur` seconds. Returns a handle to cancel it. */
  show(pos: { x: number; y: number; z: number }, radius: number, dur: number) {
    const slot = this.rings.find((r) => !r.active) ?? this.rings[0];
    slot.active = true;
    slot.t = 0;
    slot.dur = dur;
    slot.follow = pos;
    slot.r = radius;
    return slot;
  }

  cancel(handle: unknown) {
    const slot = handle as (typeof this.rings)[number];
    if (slot) {
      slot.active = false;
      slot.ring.hide();
    }
  }

  update(dt: number) {
    for (const s of this.rings) {
      if (!s.active || !s.follow) continue;
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      s.ring.set(s.follow.x, s.follow.y, s.follow.z, s.r, 0.85, k * 0.55);
      if (s.t >= s.dur + 0.08) {
        s.active = false;
        s.ring.hide();
      }
    }
  }

  clear() {
    for (const s of this.rings) {
      s.active = false;
      s.ring.hide();
    }
  }

  dispose() {
    for (const s of this.rings) s.ring.dispose();
  }
}

// --- Health bars -------------------------------------------------------------------------------------

const barGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);

export class Bar {
  readonly group = new THREE.Group();
  private readonly fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly bg: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private shown = 0;

  constructor(color: string, width = 1) {
    this.bg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: "#2b2118", transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
    this.fill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false }));
    this.bg.scale.set(width + 0.08, 0.16, 1);
    this.bg.position.x = -(width + 0.08) / 2;
    this.fill.scale.set(width, 0.1, 1);
    this.fill.position.set(-width / 2, 0, 0.001);
    this.bg.renderOrder = 18;
    this.fill.renderOrder = 19;
    this.group.add(this.bg, this.fill);
    this.group.visible = false;
    this.width = width;
  }

  private readonly width: number;

  /** Shows the bar for a few seconds at `value` (0..1). */
  set(value: number, show = 2.5) {
    this.fill.scale.x = Math.max(0.001, this.width * Math.max(0, Math.min(1, value)));
    this.shown = show;
    this.group.visible = true;
  }

  update(dt: number, camera: THREE.Camera, x: number, y: number, z: number) {
    if (this.shown <= 0) return;
    this.shown -= dt;
    this.group.position.set(x, y, z);
    this.group.quaternion.copy(camera.quaternion);
    const fade = Math.min(1, this.shown * 2);
    this.bg.material.opacity = 0.8 * fade;
    this.fill.material.opacity = fade;
    if (this.shown <= 0) this.group.visible = false;
  }

  dispose() {
    this.bg.material.dispose();
    this.fill.material.dispose();
  }
}
