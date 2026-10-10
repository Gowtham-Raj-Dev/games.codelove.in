import * as THREE from "three";

/**
 * Sky Hop's procedural extras: gradient sky with a sun glow, clouds made of soft billboards, a
 * single-draw-call particle system (dust, sparkles, confetti), snowfall and the player's blob shadow.
 */

// --- Textures ---------------------------------------------------------------------------------------

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function softDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.75})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A puffy cartoon cloud: a cluster of soft discs with a flat-ish bottom. */
function cloudTexture() {
  return canvasTexture(256, (ctx, s) => {
    const puffs = [
      [0.3, 0.6, 0.2],
      [0.5, 0.5, 0.26],
      [0.7, 0.6, 0.2],
      [0.42, 0.62, 0.2],
      [0.6, 0.66, 0.18],
      [0.22, 0.68, 0.13],
      [0.8, 0.68, 0.13],
    ];
    for (const [x, y, r] of puffs) softDisc(ctx, x * s, y * s, r * s, 1);
  });
}

function shadowTexture() {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(0.6, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

// --- Sky --------------------------------------------------------------------------------------------

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    bottom: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6).normalize() },
  };

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.uniforms,
        vertexShader:
          "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.6)) : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.5));
            float sun = max(dot(normalize(vDir), sunDir), 0.0);
            c += vec3(1.0, 0.92, 0.7) * (pow(sun, 64.0) * 0.9 + pow(sun, 6.0) * 0.18);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  set(top: string, horizon: string) {
    this.uniforms.top.value.set(top);
    this.uniforms.horizon.value.set(horizon);
    this.uniforms.bottom.value.set(horizon).lerp(new THREE.Color(top), 0.25);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// --- Clouds -----------------------------------------------------------------------------------------

const CLOUDS = 44;

/** Puffy billboard clouds, all in one instanced draw call, fading into the scene fog. */
export class Clouds {
  readonly mesh: THREE.Mesh;
  private readonly texture = cloudTexture();
  private readonly offsets = new Float32Array(CLOUDS * 3);
  private readonly base = new Float32Array(CLOUDS);
  private readonly speed = new Float32Array(CLOUDS);
  private readonly offsetAttr: THREE.InstancedBufferAttribute;
  readonly uniforms = {
    map: { value: null as THREE.Texture | null },
    fogColor: { value: new THREE.Color() },
    fogNear: { value: 60 },
    fogFar: { value: 240 },
  };

  constructor() {
    this.uniforms.map.value = this.texture;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    geo.setAttribute("uv", quad.getAttribute("uv"));
    this.offsetAttr = new THREE.InstancedBufferAttribute(this.offsets, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("offset", this.offsetAttr);
    geo.setAttribute("size", new THREE.InstancedBufferAttribute(new Float32Array(CLOUDS * 2), 2));
    geo.setAttribute("alpha", new THREE.InstancedBufferAttribute(new Float32Array(CLOUDS), 1));
    geo.instanceCount = CLOUDS;
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: this.uniforms,
        vertexShader: `
          attribute vec3 offset; attribute vec2 size; attribute float alpha;
          varying vec2 vUv; varying float vAlpha; varying float vDepth;
          void main() {
            vec4 mv = viewMatrix * vec4(offset, 1.0);
            mv.xy += position.xy * size;
            vUv = uv; vAlpha = alpha; vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform sampler2D map; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
          varying vec2 vUv; varying float vAlpha; varying float vDepth;
          void main() {
            vec4 c = texture2D(map, vUv);
            float fog = smoothstep(fogNear, fogFar, vDepth);
            vec3 col = mix(vec3(1.0), fogColor, fog * 0.85);
            float a = c.a * vAlpha * (1.0 - fog * 0.35);
            if (a < 0.01) discard;
            gl_FragColor = vec4(col, a);
          }`,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -0.5;
    quad.dispose();
  }

  /** Scatters clouds around (and below) an area: centre, half extents, floor height. */
  scatter(cx: number, cz: number, hx: number, hz: number, floor: number, seed: number) {
    let s = seed;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const geo = this.mesh.geometry as THREE.InstancedBufferGeometry;
    const size = geo.getAttribute("size") as THREE.InstancedBufferAttribute;
    const alpha = geo.getAttribute("alpha") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < CLOUDS; i++) {
      // 0: a sea of cloud below; 1: puffs around the islands; 2: big ones far away.
      const layer = i < 16 ? 0 : i < 32 ? 1 : 2;
      const w = layer === 0 ? 26 + r() * 22 : layer === 1 ? 16 + r() * 14 : 40 + r() * 30;
      size.setXY(i, w, w * 0.55);
      alpha.setX(i, [0.95, 0.85, 0.7][layer]);
      const spread = layer === 2 ? 2.4 : 1.3;
      let x = cx + (r() * 2 - 1) * (hx + 40) * spread;
      const z = cz + (r() * 2 - 1) * (hz + 40) * spread;
      const y = layer === 0 ? floor - 6 - r() * 8 : layer === 1 ? floor + 6 + r() * 26 : floor + r() * 50;
      // Keep the mid-level puffs off the play area.
      if (layer === 1 && Math.abs(x - cx) < hx + 6 && Math.abs(z - cz) < hz + 4 && y > floor + 10) x += Math.sign(x - cx || 1) * (hx + 12);
      this.offsets.set([x, y, z], i * 3);
      this.base[i] = x;
      this.speed[i] = 0.3 + r() * 0.7;
    }
    size.needsUpdate = true;
    alpha.needsUpdate = true;
    this.offsetAttr.needsUpdate = true;
  }

  setFog(color: THREE.Color, near: number, far: number) {
    this.uniforms.fogColor.value.copy(color);
    this.uniforms.fogNear.value = near;
    this.uniforms.fogFar.value = far;
  }

  update(t: number) {
    for (let i = 0; i < CLOUDS; i++) this.offsets[i * 3] = this.base[i] + Math.sin(t * 0.02 * this.speed[i] + this.base[i]) * 6;
    this.offsetAttr.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// --- Particles --------------------------------------------------------------------------------------

const MAX = 900;

interface Burst {
  count: number;
  color: THREE.ColorRepresentation | THREE.ColorRepresentation[];
  speed: number;
  up?: number;
  size: [number, number];
  life: [number, number];
  gravity?: number;
  drag?: number;
  spread?: number;
  /** 0 = soft disc, 1 = spinning confetti square, 2 = bright additive-looking sparkle. */
  shape?: number;
  /** Emit in a flat ring (shockwave). */
  ring?: boolean;
  alpha?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 4);
  private readonly size = new Float32Array(MAX);
  private readonly shape = new Float32Array(MAX);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly s0 = new Float32Array(MAX);
  private readonly s1 = new Float32Array(MAX);
  private readonly grav = new Float32Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private readonly a0 = new Float32Array(MAX);
  private readonly spin = new Float32Array(MAX);
  private next = 0;
  private alive = 0;
  readonly uniforms = { scale: { value: 600 } };
  private readonly tmp = new THREE.Color();

  constructor() {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("tint", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("shape", new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: `
        attribute vec4 tint; attribute float size; attribute float shape;
        uniform float scale; varying vec4 vTint; varying float vShape;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
          vTint = tint; vShape = shape;
        }`,
      fragmentShader: `
        varying vec4 vTint; varying float vShape;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a;
          if (vShape < 0.5) {
            a = smoothstep(0.5, 0.15, length(c));
          } else if (vShape < 2.5) {
            // Sparkle: a glow with a four-point twinkle.
            float d = length(c);
            a = smoothstep(0.35, 0.0, d) + smoothstep(0.07, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y)) + smoothstep(0.07, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x));
            a = min(a, 1.0);
          } else {
            // Confetti: a rotating, foreshortened square (angle packed into the shape value).
            float ang = (vShape - 3.0) * 6.2831;
            vec2 r = vec2(cos(ang) * c.x - sin(ang) * c.y, sin(ang) * c.x + cos(ang) * c.y);
            a = step(abs(r.x), 0.32) * step(abs(r.y), 0.08 + 0.2 * abs(sin(ang * 2.0)));
          }
          if (a < 0.02) discard;
          gl_FragColor = vec4(vTint.rgb, vTint.a * a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  burst(x: number, y: number, z: number, o: Burst) {
    const colors = Array.isArray(o.color) ? o.color : [o.color];
    for (let n = 0; n < o.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2;
      const spread = o.spread ?? 0.2;
      let vx: number;
      let vy: number;
      let vz: number;
      if (o.ring) {
        vx = Math.cos(a) * o.speed;
        vz = Math.sin(a) * o.speed;
        vy = (o.up ?? 0) * (0.6 + Math.random() * 0.4);
      } else {
        // Random direction in a sphere, biased upwards.
        const u = Math.random() * 2 - 1;
        const r = Math.sqrt(1 - u * u);
        const sp = o.speed * (0.4 + Math.random() * 0.6);
        vx = Math.cos(a) * r * sp;
        vz = Math.sin(a) * r * sp;
        vy = Math.abs(u) * sp * 0.6 + (o.up ?? 0) * (0.6 + Math.random() * 0.4);
      }
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread * 0.5;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      const life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.s0[i] = o.size[0] * (0.7 + Math.random() * 0.6);
      this.s1[i] = o.size[1] * (0.7 + Math.random() * 0.6);
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 2;
      this.a0[i] = o.alpha ?? 1;
      const shape = o.shape ?? 0;
      this.shape[i] = shape === 1 ? 3 + Math.random() : shape;
      this.spin[i] = shape === 1 ? (Math.random() - 0.5) * 3 : 0;
      this.tmp.set(colors[Math.floor(Math.random() * colors.length)]);
      this.col[i * 4] = this.tmp.r;
      this.col[i * 4 + 1] = this.tmp.g;
      this.col[i * 4 + 2] = this.tmp.b;
      this.col[i * 4 + 3] = 0;
    }
    this.alive = MAX;
  }

  update(dt: number) {
    if (!this.alive) return;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        if (this.size[i] !== 0) this.size[i] = 0;
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.life[i] > 0 ? this.s0[i] + (this.s1[i] - this.s0[i]) * t : 0;
      this.col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 8) * (1 - t * t);
      if (this.spin[i]) this.shape[i] = 3 + ((((this.shape[i] - 3 + this.spin[i] * dt) % 1) + 1) % 1);
    }
    this.alive = alive;
    for (const name of ["position", "tint", "size", "shape"]) this.geo.getAttribute(name).needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.size.fill(0);
    this.alive = MAX;
  }

  dispose() {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// --- Weather ----------------------------------------------------------------------------------------

/** Falling bits around the camera: snow, autumn leaves, blowing sand, candy petals or rising embers. */
export class Snow {
  readonly points: THREE.Points;
  private readonly uniforms = {
    time: { value: 0 },
    center: { value: new THREE.Vector3() },
    scale: { value: 600 },
    color: { value: new THREE.Color("#ffffff") },
    fall: { value: 1 },
    size: { value: 1 },
    wind: { value: 1.2 },
  };

  constructor(count = 700) {
    const geo = new THREE.BufferGeometry();
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: this.uniforms,
        vertexShader: `
          attribute vec4 seed; uniform float time; uniform vec3 center; uniform float scale; uniform float fall; uniform float size; uniform float wind; varying float vA;
          void main() {
            vec3 box = vec3(60.0, 36.0, 60.0);
            vec3 p = seed.xyz * box;
            p.y -= time * (1.6 + seed.w * 1.4) * fall;
            p.x += sin(time * 0.7 + seed.w * 20.0) * 1.5 + time * wind;
            p.z += cos(time * 0.5 + seed.x * 20.0) * 1.2;
            p = mod(p - center + box * 0.5, box) + center - box * 0.5;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (0.12 + seed.w * 0.14) * size * scale / max(0.1, -mv.z);
            vA = smoothstep(55.0, 20.0, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 color; varying float vA;
          void main() { float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(color, a * vA * 0.9); }`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  setStyle({ color, fall, size, wind, glow = false }: { color: string; fall: number; size: number; wind: number; glow?: boolean }) {
    // The shader writes the colour straight out: keep the sRGB values as they are.
    this.uniforms.color.value.setStyle(color, THREE.LinearSRGBColorSpace);
    this.uniforms.fall.value = fall;
    this.uniforms.size.value = size;
    this.uniforms.wind.value = wind;
    const material = this.points.material as THREE.ShaderMaterial;
    const blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (material.blending !== blending) {
      material.blending = blending;
      material.needsUpdate = true;
    }
  }

  update(t: number, center: THREE.Vector3, scale: number) {
    this.uniforms.time.value = t;
    this.uniforms.center.value.copy(center);
    this.uniforms.scale.value = scale;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// --- Blob shadow ------------------------------------------------------------------------------------

export function makeBlobShadow() {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}

/** A soft additive glow sprite (stars, key, checkpoint). */
export function makeGlow(color: THREE.ColorRepresentation, size: number) {
  const tex = canvasTexture(64, (ctx, s) => softDisc(ctx, s / 2, s / 2, s / 2, 1));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  sprite.scale.setScalar(size);
  return sprite;
}
