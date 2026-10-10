import * as THREE from "three";

/**
 * Procedural effects (the only non-library visuals): particles, floor telegraphs, sword slashes,
 * glows, damage numbers and health bars. Everything is pooled — nothing is allocated mid-fight.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A soft round dot texture (white centre fading out), shared by particles and glow sprites. */
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.65)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.16)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Particles -------------------------------------------------------------------------------------

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
  /** Colour at the end of life (defaults to `color`). */
  endColor?: THREE.ColorRepresentation;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();

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
  private readonly startSize: Float32Array;
  private readonly endSize: Float32Array;
  private readonly startCol: Float32Array;
  private readonly endCol: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  private alive = 0;

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
    this.startSize = new Float32Array(capacity);
    this.endSize = new Float32Array(capacity);
    this.startCol = new Float32Array(capacity * 3);
    this.endCol = new Float32Array(capacity * 3);
    this.alpha0 = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
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
          a = a * a * (0.6 + 0.4 * a) * vColor.a;
          gl_FragColor = vec4(vColor.rgb * a, a);
        }`
        : /* glsl */ `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.35, d) * vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
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
    this.startSize[i] = e.size;
    this.endSize[i] = e.endSize ?? e.size * 0.3;
    tmpColor.set(e.color);
    tmpColor2.set(e.endColor ?? e.color);
    this.startCol[i3] = tmpColor.r;
    this.startCol[i3 + 1] = tmpColor.g;
    this.startCol[i3 + 2] = tmpColor.b;
    this.endCol[i3] = tmpColor2.r;
    this.endCol[i3 + 1] = tmpColor2.g;
    this.endCol[i3 + 2] = tmpColor2.b;
    this.alpha0[i] = e.alpha ?? 1;
    this.gravity[i] = e.gravity ?? 0;
    this.drag[i] = e.drag ?? 0;
    this.alive = Math.max(this.alive, 1);
  }

  /** A burst of `n` particles flying out from a point. */
  burst(n: number, x: number, y: number, z: number, opts: { speed: number; up?: number; life: number; size: number; color: THREE.ColorRepresentation; endColor?: THREE.ColorRepresentation; gravity?: number; drag?: number; spread?: number; dirX?: number; dirZ?: number; endSize?: number; alpha?: number }) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = opts.speed * rand(0.35, 1);
      let vx = Math.cos(a) * s;
      let vz = Math.sin(a) * s;
      if (opts.dirX !== undefined && opts.dirZ !== undefined) {
        // Biased cone towards a direction.
        const spread = opts.spread ?? 0.6;
        vx = vx * spread + opts.dirX * s;
        vz = vz * spread + opts.dirZ * s;
      }
      this.emit({
        x: x + rand(-0.1, 0.1),
        y: y + rand(-0.1, 0.1),
        z: z + rand(-0.1, 0.1),
        vx,
        vy: (opts.up ?? 0) * rand(0.4, 1.2),
        vz,
        life: opts.life * rand(0.6, 1.2),
        size: opts.size * rand(0.7, 1.3),
        endSize: opts.endSize,
        color: opts.color,
        endColor: opts.endColor,
        gravity: opts.gravity,
        drag: opts.drag ?? 2,
        alpha: opts.alpha,
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
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag - this.gravity[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.gravity[i] > 0) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.35;
      }
      this.size[i] = this.startSize[i] + (this.endSize[i] - this.startSize[i]) * t;
      this.col[i4] = this.startCol[i3] + (this.endCol[i3] - this.startCol[i3]) * t;
      this.col[i4 + 1] = this.startCol[i3 + 1] + (this.endCol[i3 + 1] - this.startCol[i3 + 1]) * t;
      this.col[i4 + 2] = this.startCol[i3 + 2] + (this.endCol[i3 + 2] - this.startCol[i3 + 2]) * t;
      // Quick fade-in, slow fade-out.
      this.col[i4 + 3] = this.alpha0[i] * Math.min(1, t * 12) * (1 - t * t);
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

// --- Floor decals (attack telegraphs, rune circles, light pools, shockwaves) ------------------------

export type DecalMode = "telegraph" | "rune" | "pool" | "wave";
const MODE_ID: Record<DecalMode, number> = { telegraph: 0, rune: 1, pool: 2, wave: 3 };

const decalVertex = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const decalFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uProgress;
  uniform float uArc;
  uniform float uTime;
  uniform int uMode;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float a = 0.0;
    if (uMode == 0) {
      // Attack telegraph: a sector in front (+forward = -vP.y), filling outwards as the wind-up runs.
      float ang = abs(atan(vP.x, -vP.y));
      float side = 1.0 - smoothstep(uArc - 0.03, uArc + 0.01, ang);
      if (side <= 0.0) discard;
      float rim = smoothstep(0.88, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
      float edges = uArc < 3.1 ? (1.0 - smoothstep(0.0, 0.05, abs(ang - uArc) * r)) : 0.0;
      float fill = 1.0 - smoothstep(uProgress - 0.02, uProgress, r);
      float front = smoothstep(uProgress - 0.09, uProgress, r) * fill;
      a = side * (0.16 + fill * 0.26 + front * 0.6 + rim * 0.7 + edges * 0.55);
    } else if (uMode == 1) {
      // Summoning rune: a turning ring of ticks.
      float ang = atan(vP.y, vP.x);
      float band = smoothstep(0.62, 0.68, r) * (1.0 - smoothstep(0.92, 0.98, r));
      float ticks = 0.5 + 0.5 * sin(ang * 9.0 + uTime * 3.0);
      float inner = smoothstep(0.35, 0.4, r) * (1.0 - smoothstep(0.44, 0.48, r));
      float glow = (1.0 - r) * 0.35;
      a = band * (0.35 + 0.65 * ticks) + inner * 0.8 + glow;
    } else if (uMode == 2) {
      // Soft light pool.
      a = pow(1.0 - r, 2.2);
    } else {
      // Shockwave: a ring travelling outwards.
      float w = 0.13;
      a = smoothstep(uProgress - w, uProgress, r) * (1.0 - smoothstep(uProgress, uProgress + 0.04, r));
      a += (1.0 - smoothstep(0.0, uProgress, r)) * 0.15 * (1.0 - uProgress);
    }
    a *= uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }`;

const planeGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

export class Decal {
  readonly holder = new THREE.Group();
  readonly mat: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  active = false;
  /** Seconds left for timed decals (shockwaves / fading telegraphs); -1 = manual. */
  ttl = -1;
  dur = 1;
  fadeOnly = false;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color("#ff2d55") },
        uOpacity: { value: 1 },
        uProgress: { value: 0 },
        uArc: { value: Math.PI },
        uTime: { value: 0 },
        uMode: { value: 0 },
      },
      vertexShader: decalVertex,
      fragmentShader: decalFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(planeGeo, this.mat);
    this.mesh.renderOrder = 2;
    this.holder.add(this.mesh);
    this.holder.visible = false;
  }

  set(mode: DecalMode, x: number, z: number, radius: number, color: THREE.ColorRepresentation, { yaw = 0, arc = Math.PI, opacity = 1, progress = 0, y = 0.04 } = {}) {
    this.active = true;
    this.ttl = -1;
    this.fadeOnly = false;
    this.holder.visible = true;
    this.holder.position.set(x, y, z);
    this.holder.rotation.y = yaw;
    this.holder.scale.setScalar(radius);
    const u = this.mat.uniforms;
    u.uMode.value = MODE_ID[mode];
    u.uColor.value.set(color);
    u.uArc.value = arc;
    u.uOpacity.value = opacity;
    u.uProgress.value = progress;
    return this;
  }
}

export class Decals {
  readonly group = new THREE.Group();
  private readonly list: Decal[] = [];
  private time = 0;

  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const d = new Decal();
      this.list.push(d);
      this.group.add(d.holder);
    }
  }

  get(): Decal {
    let d = this.list.find((x) => !x.active);
    if (!d) {
      d = new Decal();
      this.list.push(d);
      this.group.add(d.holder);
    }
    return d;
  }

  release(d: Decal | null | undefined) {
    if (!d) return;
    d.active = false;
    d.holder.visible = false;
  }

  /** Fades a decal out over `dur` seconds, then frees it. */
  fade(d: Decal | null | undefined, dur = 0.25) {
    if (!d || !d.active) return;
    d.ttl = dur;
    d.dur = dur;
    d.fadeOnly = true;
  }

  /** An expanding shockwave ring. */
  wave(x: number, z: number, radius: number, color: THREE.ColorRepresentation, dur = 0.45, opacity = 1) {
    const d = this.get().set("wave", x, z, radius, color, { opacity, progress: 0.05 });
    d.ttl = dur;
    d.dur = dur;
    return d;
  }

  update(dt: number) {
    this.time += dt;
    for (const d of this.list) {
      if (!d.active) continue;
      const u = d.mat.uniforms;
      u.uTime.value = this.time;
      if (d.ttl < 0) continue;
      d.ttl -= dt;
      const k = Math.max(0, d.ttl / d.dur);
      if (d.fadeOnly) u.uOpacity.value = Math.min(u.uOpacity.value, k);
      else {
        u.uProgress.value = 1 - k * k;
        u.uOpacity.value = Math.min(1, k * 2.2);
      }
      if (d.ttl <= 0) this.release(d);
    }
  }

  clear() {
    for (const d of this.list) this.release(d);
  }

  dispose() {
    for (const d of this.list) d.mat.dispose();
  }
}

// --- Sword slashes ---------------------------------------------------------------------------------

/** An arc ribbon around +z (forward), `arc` radians wide, uv.x along the arc, uv.y across. */
function arcGeometry(inner: number, outer: number, arc: number, segments = 28) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = -arc / 2 + arc * t;
    const s = Math.sin(a);
    const c = Math.cos(a);
    pos.push(s * inner, 0, c * inner, s * outer, 0, c * outer);
    uv.push(t, 0, t, 1);
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

interface Slash {
  holder: THREE.Group;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  dir: number;
}

export class Slashes {
  readonly group = new THREE.Group();
  private readonly list: Slash[] = [];
  private readonly arc = arcGeometry(1.05, 2.45, Math.PI * 0.95);
  private readonly ring = arcGeometry(1.2, 3.2, Math.PI * 2 - 0.01, 56);

  constructor(count = 6) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uHead: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color("#ff6b86") }, uDir: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uHead;
          uniform float uFade;
          uniform float uDir;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float x = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
            float trail = smoothstep(uHead - 0.75, uHead, x) * (1.0 - smoothstep(uHead, uHead + 0.02, x));
            float across = smoothstep(0.0, 0.55, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
            float core = smoothstep(0.55, 0.85, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
            float a = trail * across * uFade;
            vec3 col = mix(uColor, vec3(1.0, 0.95, 0.9), core * 0.8);
            gl_FragColor = vec4(col * a, a);
          }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.arc, mat);
      mesh.renderOrder = 7;
      const holder = new THREE.Group();
      holder.add(mesh);
      holder.visible = false;
      this.group.add(holder);
      this.list.push({ holder, mesh, mat, t: 1, dur: 0.2, dir: 1 });
    }
  }

  /**
   * A slash at (x, y, z) facing `yaw`; `roll` tilts the arc around the facing axis (0 = flat sweep,
   * ±π/2 = vertical chop); `scale` grows it; `ring` makes a full circle (spin).
   */
  spawn(x: number, y: number, z: number, yaw: number, { roll = 0, scale = 1, dir = 1, dur = 0.2, color = "#ff6b86" as THREE.ColorRepresentation, ring = false, pitch = 0 } = {}) {
    const s = this.list.reduce((best, cur) => (cur.t / cur.dur > best.t / best.dur ? cur : best), this.list[0]);
    s.t = 0;
    s.dur = dur;
    s.dir = dir;
    s.mesh.geometry = ring ? this.ring : this.arc;
    s.holder.visible = true;
    s.holder.position.set(x, y, z);
    s.holder.rotation.set(0, 0, 0);
    s.holder.rotation.order = "YXZ";
    s.holder.rotation.y = yaw;
    s.holder.rotation.x = pitch;
    s.holder.rotation.z = roll;
    s.holder.scale.setScalar(scale);
    s.mat.uniforms.uColor.value.set(color);
    s.mat.uniforms.uDir.value = dir;
  }

  update(dt: number) {
    for (const s of this.list) {
      if (!s.holder.visible) continue;
      s.t += dt;
      const k = s.t / s.dur;
      s.mat.uniforms.uHead.value = Math.min(1.3, k * 1.6);
      s.mat.uniforms.uFade.value = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
      if (k >= 1) s.holder.visible = false;
    }
  }

  clear() {
    for (const s of this.list) s.holder.visible = false;
  }

  dispose() {
    this.arc.dispose();
    this.ring.dispose();
    for (const s of this.list) s.mat.dispose();
  }
}

// --- Glow sprites ----------------------------------------------------------------------------------

export class Glows {
  readonly texture = glowTexture();
  private readonly mats: THREE.SpriteMaterial[] = [];

  make(color: THREE.ColorRepresentation, size: number, opacity = 1) {
    const mat = new THREE.SpriteMaterial({ map: this.texture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mats.push(mat);
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    s.renderOrder = 4;
    return s;
  }

  dispose() {
    this.texture.dispose();
    this.mats.forEach((m) => m.dispose());
  }
}

// --- Damage numbers --------------------------------------------------------------------------------

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

  constructor(count = 24) {
    for (let i = 0; i < count; i++) {
      const c = document.createElement("canvas");
      c.width = 192;
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
    ctx.clearRect(0, 0, 192, 72);
    ctx.font = `900 ${text.length > 4 ? 40 : 52}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(10,6,12,0.9)";
    ctx.strokeText(text, 96, 38);
    ctx.fillStyle = color;
    ctx.fillText(text, 96, 38);
    p.tex.needsUpdate = true;
    p.t = 0;
    p.vy = 2.6;
    p.vx = rand(-0.8, 0.8);
    p.base = size;
    p.sprite.visible = true;
    p.sprite.position.set(x, y, z);
    (p.sprite.material as THREE.SpriteMaterial).opacity = 1;
  }

  update(dt: number) {
    for (const p of this.list) {
      if (!p.sprite.visible) continue;
      p.t += dt;
      p.vy -= dt * 5;
      p.sprite.position.y += p.vy * dt;
      p.sprite.position.x += p.vx * dt;
      const pop = p.t < 0.1 ? 0.6 + (p.t / 0.1) * 0.6 : 1.2 - Math.min(0.2, (p.t - 0.1) * 1.5);
      p.sprite.scale.set(1.6 * p.base * pop, 0.6 * p.base * pop, 1);
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.t < 0.55 ? 1 : Math.max(0, 1 - (p.t - 0.55) / 0.3);
      if (p.t > 0.85) p.sprite.visible = false;
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

// --- Health bars -----------------------------------------------------------------------------------

const barGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);

export class HealthBar {
  readonly group = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly lag: THREE.Mesh;
  private lagValue = 1;
  private value = 1;

  constructor(width: number, color: THREE.ColorRepresentation, mats: { bg: THREE.Material; lag: THREE.Material }) {
    const h = 0.16;
    const bg = new THREE.Mesh(barGeo, mats.bg);
    bg.scale.set(width + 0.08, h + 0.08, 1);
    bg.position.x = -(width + 0.08) / 2;
    bg.position.z = -0.002;
    this.lag = new THREE.Mesh(barGeo, mats.lag);
    this.lag.scale.set(width, h, 1);
    this.lag.position.x = -width / 2;
    this.lag.position.z = -0.001;
    this.fill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true }));
    this.fill.scale.set(width, h, 1);
    this.fill.position.x = -width / 2;
    for (const m of [bg, this.lag, this.fill]) m.renderOrder = 15;
    this.group.add(bg, this.lag, this.fill);
    this.group.visible = false;
    this.width = width;
  }

  private readonly width: number;

  set(ratio: number) {
    this.value = Math.max(0, Math.min(1, ratio));
    this.fill.scale.x = Math.max(0.0001, this.width * this.value);
  }

  reset() {
    this.value = 1;
    this.lagValue = 1;
    this.fill.scale.x = this.width;
    this.lag.scale.x = this.width;
    this.group.visible = false;
  }

  update(dt: number, camera: THREE.Camera) {
    if (!this.group.visible) return;
    this.lagValue = Math.max(this.value, this.lagValue - dt * 0.8);
    this.lag.scale.x = Math.max(0.0001, this.width * this.lagValue);
    this.group.quaternion.copy(camera.quaternion);
  }

  dispose() {
    (this.fill.material as THREE.Material).dispose();
  }
}
