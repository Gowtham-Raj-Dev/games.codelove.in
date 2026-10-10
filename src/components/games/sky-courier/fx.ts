import * as THREE from "three";

/**
 * Procedural extras for Sky Courier: the sky dome and sun, the sea of clouds, billboard cloud puffs,
 * station beams, updraft columns, particles, wind streaks and the route arrow. Every solid object
 * in the game is a library model — these are light, air and glow only.
 */

// --- Palette over the working day -------------------------------------------------------------------

export interface SkyLook {
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  sunDir: THREE.Vector3;
}

const KEYS: { t: number; top: string; horizon: string; sun: string; si: number; hs: string; hg: string; hi: number; lit: string; shade: string; az: number; el: number }[] = [
  { t: 0, top: "#4a86d0", horizon: "#d4e4f1", sun: "#fff0d8", si: 2.7, hs: "#d4e6ff", hg: "#8d84b4", hi: 1.25, lit: "#ffffff", shade: "#a9b8d6", az: -0.35, el: 0.42 },
  { t: 0.45, top: "#2f6fd0", horizon: "#cfe4f6", sun: "#fffaf0", si: 3.0, hs: "#dcecff", hg: "#9088b8", hi: 1.3, lit: "#ffffff", shade: "#b3c2de", az: 1.2, el: 1.05 },
  { t: 0.75, top: "#3d6ab6", horizon: "#efd8ba", sun: "#ffe0ae", si: 2.8, hs: "#e4e4f4", hg: "#9a84a8", hi: 1.2, lit: "#fff4e4", shade: "#a8a6c8", az: 2.6, el: 0.55 },
  { t: 1, top: "#33508f", horizon: "#f4b47c", sun: "#ffa85a", si: 2.6, hs: "#f2d2c0", hg: "#8a6c9c", hi: 1.1, lit: "#ffd4a0", shade: "#8e7aa8", az: 3.25, el: 0.2 },
];

const parsed = KEYS.map((k) => ({
  ...k,
  cTop: new THREE.Color(k.top),
  cHorizon: new THREE.Color(k.horizon),
  cSun: new THREE.Color(k.sun),
  cHs: new THREE.Color(k.hs),
  cHg: new THREE.Color(k.hg),
  cLit: new THREE.Color(k.lit),
  cShade: new THREE.Color(k.shade),
}));

export function skyLook(t: number, out: SkyLook) {
  t = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < parsed.length - 2 && t > parsed[i + 1].t) i++;
  const a = parsed[i];
  const b = parsed[i + 1];
  const k = (t - a.t) / (b.t - a.t);
  out.top.copy(a.cTop).lerp(b.cTop, k);
  out.horizon.copy(a.cHorizon).lerp(b.cHorizon, k);
  out.sun.copy(a.cSun).lerp(b.cSun, k);
  out.hemiSky.copy(a.cHs).lerp(b.cHs, k);
  out.hemiGround.copy(a.cHg).lerp(b.cHg, k);
  out.cloudLit.copy(a.cLit).lerp(b.cLit, k);
  out.cloudShade.copy(a.cShade).lerp(b.cShade, k);
  out.sunIntensity = a.si + (b.si - a.si) * k;
  out.hemiIntensity = a.hi + (b.hi - a.hi) * k;
  const az = a.az + (b.az - a.az) * k;
  const el = a.el + (b.el - a.el) * k;
  out.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
  return out;
}

export const newLook = (): SkyLook => ({
  top: new THREE.Color(),
  horizon: new THREE.Color(),
  sun: new THREE.Color(),
  sunIntensity: 1,
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  hemiIntensity: 1,
  cloudLit: new THREE.Color(),
  cloudShade: new THREE.Color(),
  sunDir: new THREE.Vector3(0, 1, 0),
});

// --- Sky dome -----------------------------------------------------------------------------------------

export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uFlash: { value: 0 },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uFlash;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.5));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSun * (pow(s, 1400.0) * 9.0 + pow(s, 60.0) * 0.5 + pow(s, 6.0) * 0.18) ;
          col = mix(col, uHorizon, smoothstep(0.02, -0.12, d.y));
          col += vec3(0.85, 0.9, 1.0) * uFlash;
          gl_FragColor = vec4(col, 1.0);
          // No tone mapping: the horizon must match the fog colour exactly.
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(2800, 32, 16), material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  apply(look: SkyLook) {
    this.uniforms.uTop.value.copy(look.top);
    this.uniforms.uHorizon.value.copy(look.horizon);
    this.uniforms.uSun.value.copy(look.sun);
    this.uniforms.uSunDir.value.copy(look.sunDir);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// --- Tileable noise texture (shared by the cloud sea and puffs) -------------------------------------------

function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const grid = (n: number, seed: number) => {
    const g = new Float32Array(n * n);
    let s = seed;
    for (let i = 0; i < g.length; i++) {
      s = (s * 16807) % 2147483647;
      g[i] = s / 2147483647;
    }
    return g;
  };
  const octaves = [4, 8, 16, 32, 64].map((n, i) => ({ n, g: grid(n, 1234 + i * 977), w: Math.pow(0.55, i) }));
  const smooth = (t: number) => t * t * (3 - 2 * t);
  let wsum = 0;
  for (const o of octaves) wsum += o.w;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const { n, g, w } of octaves) {
        const fx = (x / size) * n;
        const fy = (y / size) * n;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = smooth(fx - x0);
        const ty = smooth(fy - y0);
        const a = g[(y0 % n) * n + (x0 % n)];
        const b = g[(y0 % n) * n + ((x0 + 1) % n)];
        const c = g[((y0 + 1) % n) * n + (x0 % n)];
        const d = g[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * w;
      }
      v /= wsum;
      const i = (y * size + x) * 4;
      const byte = Math.round(Math.min(1, Math.max(0, v)) * 255);
      data[i] = data[i + 1] = data[i + 2] = byte;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// --- Sea of clouds ----------------------------------------------------------------------------------------

export class CloudSea {
  readonly mesh: THREE.Mesh;
  private readonly noise = makeNoiseTexture();
  readonly uniforms = {
    uNoise: { value: this.noise as THREE.Texture },
    uTime: { value: 0 },
    uLit: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSun: { value: new THREE.Color() },
    uFlash: { value: 0 },
  };

  constructor() {
    const material = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise; uniform float uTime; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uFlash;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float field(vec2 p) {
          float a = texture2D(uNoise, p * 0.00055 + vec2(uTime * 0.0021, uTime * 0.0006)).r;
          float b = texture2D(uNoise, p * 0.0019 + vec2(-uTime * 0.0035, uTime * 0.0019)).r;
          float c = texture2D(uNoise, p * 0.0062 + vec2(uTime * 0.006, -uTime * 0.004)).r;
          return a * 0.58 + b * 0.3 + c * 0.12;
        }
        void main() {
          vec2 p = vWorld.xz;
          float h = field(p);
          float e = 6.0;
          float hx = field(p + vec2(e, 0.0));
          float hz = field(p + vec2(0.0, e));
          vec3 n = normalize(vec3((h - hx) * 160.0, 1.0, (h - hz) * 160.0));
          float lambert = clamp(dot(n, normalize(uSunDir)) * 0.6 + 0.45, 0.0, 1.0);
          float puff = smoothstep(0.25, 0.75, h);
          vec3 col = mix(uShade, uLit, clamp(lambert * 0.75 + puff * 0.45, 0.0, 1.0));
          col += uSun * pow(max(dot(n, normalize(uSunDir)), 0.0), 8.0) * 0.08 * puff;
          col += vec3(0.8, 0.85, 1.0) * uFlash * 0.4;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    Object.assign(material.uniforms, this.uniforms);
    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.renderOrder = -5;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
  }

  get texture() {
    return this.noise;
  }

  update(dt: number, cam: THREE.Vector3, look: SkyLook, flash: number) {
    this.uniforms.uTime.value += dt;
    this.mesh.position.set(Math.round(cam.x / 50) * 50, 0, Math.round(cam.z / 50) * 50);
    this.uniforms.uLit.value.copy(look.cloudLit);
    this.uniforms.uShade.value.copy(look.cloudShade);
    this.uniforms.uSunDir.value.copy(look.sunDir);
    this.uniforms.uSun.value.copy(look.sun);
    this.uniforms.uFlash.value = flash;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.noise.dispose();
  }
}

// --- Billboard cloud puffs ---------------------------------------------------------------------------------

function makePuffTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // A flat-bottomed heap of soft blobs.
  for (let i = 0; i < 26; i++) {
    const t = rnd();
    const x = size * (0.22 + 0.56 * rnd());
    const r = size * (0.1 + 0.13 * rnd()) * (1 - Math.abs(x / size - 0.5) * 0.9);
    const y = size * (0.62 - 0.22 * t * (1 - Math.abs(x / size - 0.5) * 1.6));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.32)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export interface PuffSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** 0 = white cloud, 1 = storm cloud. */
  storm: number;
  alpha: number;
}

/** Many cloud billboards in one draw call; positions are fixed in the world. */
export class CloudPuffs {
  readonly mesh: THREE.Mesh;
  private readonly texture = makePuffTexture();
  readonly uniforms = {
    uMap: { value: this.texture as THREE.Texture },
    uLit: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uStorm: { value: new THREE.Color("#4a4f66") },
    uFlash: { value: 0 },
  };

  constructor(specs: PuffSpec[]) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.attributes.position);
    geo.setAttribute("uv", base.attributes.uv);
    const n = specs.length;
    const off = new Float32Array(n * 3);
    const size = new Float32Array(n * 2);
    const extra = new Float32Array(n * 3);
    specs.forEach((s, i) => {
      off.set([s.x, s.y, s.z], i * 3);
      size.set([s.w, s.h], i * 2);
      extra.set([s.storm, s.alpha, Math.random()], i * 3);
    });
    geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 2));
    geo.setAttribute("aExtra", new THREE.InstancedBufferAttribute(extra, 3));
    geo.instanceCount = n;
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; attribute vec2 aSize; attribute vec3 aExtra;
        varying vec2 vUv; varying float vStorm; varying float vAlpha;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          if (aExtra.z > 0.5) vUv.x = 1.0 - vUv.x;
          vStorm = aExtra.x;
          vec4 mvPosition = viewMatrix * vec4(aOffset, 1.0);
          mvPosition.xy += position.xy * aSize;
          float d = -mvPosition.z;
          vAlpha = aExtra.y * smoothstep(8.0, 70.0, d);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uStorm; uniform float uFlash;
        varying vec2 vUv; varying float vStorm; varying float vAlpha;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = t.a * vAlpha;
          if (a < 0.01) discard;
          vec3 lit = mix(uLit, uStorm * 1.25, vStorm);
          vec3 shade = mix(uShade, uStorm * 0.7, vStorm);
          vec3 col = mix(shade, lit, smoothstep(0.25, 0.85, vUv.y));
          col += vec3(0.9, 0.92, 1.0) * uFlash * (0.25 + vStorm * 0.9);
          gl_FragColor = vec4(col, min(1.0, a * 1.6));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    Object.assign(material.uniforms, this.uniforms);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    base.dispose();
  }

  apply(look: SkyLook, flash: number) {
    this.uniforms.uLit.value.copy(look.cloudLit);
    this.uniforms.uShade.value.copy(look.cloudShade);
    this.uniforms.uFlash.value = flash;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}

// --- Beams (pickup / delivery) and updraft columns ---------------------------------------------------------

const beamGeometry = () => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
  g.translate(0, 0.5, 0);
  return g;
};

export class Beam {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uAlpha: { value: 1 } };

  constructor(color: string, radius: number, height: number) {
    this.uniforms.uColor.value.set(color);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vEdge;
        void main() {
          vUv = uv;
          vec3 n = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vEdge = 1.0 - abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
        varying vec2 vUv; varying float vEdge;
        void main() {
          float fade = pow(1.0 - vUv.y, 1.4);
          float bands = 0.55 + 0.45 * smoothstep(0.3, 0.7, fract(vUv.y * 9.0 - uTime * 0.8));
          float a = fade * bands * (0.18 + 0.5 * pow(vEdge, 2.0)) * uAlpha;
          gl_FragColor = vec4(uColor * a * 1.6, a);
        }`,
    });
    this.mesh = new THREE.Mesh(beamGeometry(), material);
    this.mesh.scale.set(radius, height, radius);
    this.mesh.renderOrder = 6;
  }

  update(dt: number) {
    this.uniforms.uTime.value += dt;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** One shared material for every updraft column. */
export class UpdraftColumns {
  readonly group = new THREE.Group();
  private readonly geometry = beamGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms = { uTime: { value: 0 } };

  constructor(columns: { x: number; z: number; r: number }[], height: number) {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vEdge;
        void main() {
          vUv = uv;
          vec3 n = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vEdge = 1.0 - abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv; varying float vEdge;
        void main() {
          float swirl = smoothstep(0.42, 0.5, fract(vUv.x * 5.0 + vUv.y * 7.0 - uTime * 0.45)) * smoothstep(0.62, 0.5, fract(vUv.x * 5.0 + vUv.y * 7.0 - uTime * 0.45));
          float fade = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          float a = (0.05 + swirl * 0.22) * fade * (0.35 + 0.65 * vEdge);
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.86) * a, a);
        }`,
    });
    for (const c of columns) {
      const m = new THREE.Mesh(this.geometry, this.material);
      m.scale.set(c.r, height, c.r);
      m.position.set(c.x, 0, c.z);
      m.renderOrder = 6;
      this.group.add(m);
    }
  }

  update(dt: number) {
    this.uniforms.uTime.value += dt;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --- Halo (glowing disc inside rings) ------------------------------------------------------------------------

export function makeHaloMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vTint;
      void main() {
        vUv = uv;
        vTint = vec3(1.0);
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; uniform float uTime;
      varying vec2 vUv; varying vec3 vTint;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        if (r > 1.0) discard;
        float rim = smoothstep(0.62, 0.93, r) * smoothstep(1.0, 0.93, r);
        float wave = smoothstep(0.06, 0.0, abs(r - fract(uTime * 0.7))) * 0.6 * (1.0 - r);
        float a = (rim * 0.85 + 0.07 * (1.0 - r) + wave) * uAlpha;
        gl_FragColor = vec4(uColor * vTint * a, a);
      }`,
  });
}

// --- Particles -----------------------------------------------------------------------------------------------

export interface ParticleOptions {
  color?: string | THREE.Color;
  life?: number;
  size?: number;
  grow?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const tmpColor = new THREE.Color();

export class Particles {
  readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly data: Float32Array;
  private next = 0;
  private alive = 0;

  constructor(
    private readonly capacity: number,
    { additive = false } = {},
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
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 } }]),
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSize; uniform float uScale;
        varying vec4 vColor;
        #include <fog_pars_vertex>
        void main() {
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(1.0, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        #include <fog_pars_fragment>
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.35, d) * vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
  }

  setScale(viewportHeight: number, fovDeg: number) {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, o: ParticleOptions = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    tmpColor.set(o.color ?? "#ffffff");
    this.col[i * 4] = tmpColor.r;
    this.col[i * 4 + 1] = tmpColor.g;
    this.col[i * 4 + 2] = tmpColor.b;
    this.col[i * 4 + 3] = 0;
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

  burst(x: number, y: number, z: number, n: number, speed: number, o: ParticleOptions = {}) {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.6);
      this.spawn(x, y, z, Math.cos(a) * s * v, u * v, Math.sin(a) * s * v, o);
    }
  }

  update(dt: number) {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < this.capacity; i++) {
      const d = i * 8;
      const life = this.data[d + 1];
      if (life < 0) continue;
      const age = (this.data[d] += dt);
      if (age >= life) {
        this.data[d + 1] = -1;
        this.col[i * 4 + 3] = 0;
        this.size[i] = 0;
        continue;
      }
      any++;
      const k = age / life;
      const drag = Math.exp(-this.data[d + 6] * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.data[d + 5] * dt;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.data[d + 2] + (this.data[d + 3] - this.data[d + 2]) * k;
      this.col[i * 4 + 3] = this.data[d + 4] * Math.min(1, k * 8) * (1 - k * k);
    }
    this.alive = any;
    this.geometry.attributes.position.needsUpdate = true;
    (this.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      this.data[i * 8 + 1] = -1;
      this.col[i * 4 + 3] = 0;
      this.size[i] = 0;
    }
    this.alive = 1;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// --- Wind streaks (camera space) -------------------------------------------------------------------------------

export class WindStreaks {
  readonly lines: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly seeds: { x: number; y: number; z: number; len: number }[] = [];

  constructor(private readonly count = 70) {
    this.pos = new Float32Array(count * 6);
    this.col = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) this.seeds.push(this.seed({ x: 0, y: 0, z: 0, len: 1 }, -Math.random() * 90));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.lines = new THREE.LineSegments(geo, material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 8;
  }

  private seed(s: { x: number; y: number; z: number; len: number }, z: number) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 14;
    s.x = Math.cos(a) * r;
    s.y = Math.sin(a) * r * 0.7;
    s.z = z;
    s.len = 0.6 + Math.random() * 0.8;
    return s;
  }

  /** speed: forward speed (m/s); amount: 0..1 visibility. */
  update(dt: number, speed: number, amount: number) {
    for (let i = 0; i < this.count; i++) {
      const s = this.seeds[i];
      s.z += speed * 1.3 * dt;
      if (s.z > 2) this.seed(s, -90 - Math.random() * 10);
      const len = s.len * (2 + speed * 0.22);
      this.pos.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6);
      const fade = Math.min(1, (s.z + 90) / 30) * Math.min(1, (2 - s.z) / 10) * amount * 0.5;
      this.col.set([1, 1, 1, fade, 1, 1, 1, 0], i * 8);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    this.lines.visible = amount > 0.01;
  }

  dispose() {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

// --- Route arrow --------------------------------------------------------------------------------------------------

export function makeArrow() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.4);
  shape.lineTo(1.1, 0);
  shape.lineTo(0.42, 0);
  shape.lineTo(0.42, -1.1);
  shape.lineTo(-0.42, -1.1);
  shape.lineTo(-0.42, 0);
  shape.lineTo(-1.1, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 });
  geo.translate(0, 0, -0.16);
  // Lay it flat, pointing along +z.
  geo.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: "#f3c64a", emissive: "#d4af37", emissiveIntensity: 0.65, roughness: 0.35, metalness: 0.3 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  return mesh;
}
