import * as THREE from "three";
import { SIZE } from "./terrain";

/**
 * Procedural surroundings (allowed extras, no models): the sky dome with sun, moon, stars and
 * clouds, the sea and pond water, and the day/night palette everything is lit by.
 */

// --- Day / night palette -----------------------------------------------------------------------------

export interface SkyState {
  top: THREE.Color;
  horizon: THREE.Color;
  light: THREE.Color;
  lightIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  stars: number;
  clouds: THREE.Color;
  /** Direction towards the sun (or the moon at night) — the shadow-casting light. */
  lightDir: THREE.Vector3;
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** 0 by day, 1 at full night (for sounds, music and fear). */
  darkness: number;
}

interface Key {
  t: number;
  top: string;
  horizon: string;
  light: string;
  li: number;
  hemiSky: string;
  hemiGround: string;
  hi: number;
  near: number;
  far: number;
  stars: number;
  clouds: string;
  dark: number;
}

const KEYS: Key[] = [
  { t: 0.0, top: "#34477e", horizon: "#f0a07a", light: "#ff9e66", li: 0.55, hemiSky: "#8a9ccc", hemiGround: "#5a4c40", hi: 0.75, near: 45, far: 160, stars: 0.2, clouds: "#f2b8a0", dark: 0.4 },
  { t: 0.06, top: "#4f8fd8", horizon: "#f5dcc0", light: "#ffe1b8", li: 1.55, hemiSky: "#a9c8ec", hemiGround: "#6d6250", hi: 1.0, near: 60, far: 230, stars: 0, clouds: "#ffffff", dark: 0 },
  { t: 0.22, top: "#3f8ee0", horizon: "#cde8f7", light: "#fff6e8", li: 2.0, hemiSky: "#bcd9f5", hemiGround: "#7a6e58", hi: 1.1, near: 70, far: 260, stars: 0, clouds: "#ffffff", dark: 0 },
  { t: 0.5, top: "#4a8fd8", horizon: "#dae8ee", light: "#fff0d8", li: 1.9, hemiSky: "#bcd5ee", hemiGround: "#7a6e58", hi: 1.05, near: 70, far: 260, stars: 0, clouds: "#ffffff", dark: 0 },
  { t: 0.6, top: "#5585c8", horizon: "#f5d2a8", light: "#ffcf96", li: 1.5, hemiSky: "#d8c4b0", hemiGround: "#6a5a48", hi: 0.95, near: 60, far: 230, stars: 0, clouds: "#ffe8d0", dark: 0.05 },
  { t: 0.665, top: "#3b4a8c", horizon: "#ff8c5a", light: "#ff7a3c", li: 0.85, hemiSky: "#c08a8a", hemiGround: "#4a3a34", hi: 0.75, near: 45, far: 170, stars: 0.1, clouds: "#ff9a70", dark: 0.3 },
  { t: 0.71, top: "#151d40", horizon: "#4a3a6a", light: "#8ea6ff", li: 0.3, hemiSky: "#3a4a80", hemiGround: "#1c1a24", hi: 0.55, near: 32, far: 125, stars: 0.75, clouds: "#3a3a5a", dark: 0.85 },
  { t: 0.8, top: "#070b1e", horizon: "#18213f", light: "#9db4ff", li: 0.5, hemiSky: "#2a3a6a", hemiGround: "#141420", hi: 0.5, near: 28, far: 105, stars: 1, clouds: "#1f2640", dark: 1 },
  { t: 0.93, top: "#0c1230", horizon: "#2a2a52", light: "#9db4ff", li: 0.4, hemiSky: "#2e3a6a", hemiGround: "#161622", hi: 0.5, near: 30, far: 115, stars: 0.9, clouds: "#2a2c4c", dark: 0.95 },
];

const ca = new THREE.Color();
const cb = new THREE.Color();
const mixHex = (out: THREE.Color, a: string, b: string, f: number) => out.copy(ca.set(a)).lerp(cb.set(b), f);

export function skyAt(t: number, out: SkyState): SkyState {
  t = ((t % 1) + 1) % 1;
  let i = KEYS.length - 1;
  while (i > 0 && KEYS[i].t > t) i--;
  const a = KEYS[i];
  const b = KEYS[(i + 1) % KEYS.length];
  const span = (b.t <= a.t ? b.t + 1 : b.t) - a.t;
  let f = (t - a.t) / span;
  f = f * f * (3 - 2 * f);
  mixHex(out.top, a.top, b.top, f);
  mixHex(out.horizon, a.horizon, b.horizon, f);
  mixHex(out.light, a.light, b.light, f);
  mixHex(out.hemiSky, a.hemiSky, b.hemiSky, f);
  mixHex(out.hemiGround, a.hemiGround, b.hemiGround, f);
  mixHex(out.clouds, a.clouds, b.clouds, f);
  out.lightIntensity = a.li + (b.li - a.li) * f;
  out.hemiIntensity = a.hi + (b.hi - a.hi) * f;
  out.fogNear = a.near + (b.near - a.near) * f;
  out.fogFar = a.far + (b.far - a.far) * f;
  out.stars = a.stars + (b.stars - a.stars) * f;
  out.darkness = a.dark + (b.dark - a.dark) * f;

  // The sun rises in the east (+x) just before t = 0 and sets at t ≈ 0.7; the moon crosses the night.
  const su = (((t + 0.04) % 1) + 1) % 1 / 0.75;
  const sa = Math.PI * Math.min(1.08, su);
  out.sunDir.set(Math.cos(sa), Math.sin(sa) * 0.85, 0.42).normalize();
  if (su > 1.08) out.sunDir.set(-1, -0.3, 0.42).normalize();
  const mu = (((t - 0.69) % 1) + 1) % 1 / 0.32;
  const ma = Math.PI * Math.min(1.05, mu);
  out.moonDir.set(Math.cos(ma) * 0.9, Math.sin(ma) * 0.75 + 0.08, -0.45).normalize();
  if (mu > 1.05) out.moonDir.set(-0.9, -0.2, -0.45).normalize();
  // Shadows come from whichever is higher.
  out.lightDir.copy(out.sunDir.y > 0.08 || out.moonDir.y < 0.1 ? out.sunDir : out.moonDir);
  if (out.lightDir.y < 0.25) out.lightDir.y = 0.25;
  out.lightDir.normalize();
  return out;
}

export function makeSkyState(): SkyState {
  return {
    top: new THREE.Color(),
    horizon: new THREE.Color(),
    light: new THREE.Color(),
    lightIntensity: 1,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 1,
    fogNear: 60,
    fogFar: 200,
    stars: 0,
    clouds: new THREE.Color(),
    lightDir: new THREE.Vector3(0, 1, 0),
    sunDir: new THREE.Vector3(0, 1, 0),
    moonDir: new THREE.Vector3(0, -1, 0),
    darkness: 0,
  };
}

// --- Sky dome ----------------------------------------------------------------------------------------

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

export class SkyDome {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  constructor() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uSunColor: { value: new THREE.Color() },
        uStars: { value: 0 },
        uClouds: { value: new THREE.Color() },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uSunColor; uniform vec3 uClouds;
        uniform float uStars; uniform float uTime;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          // Below the horizon: fade to the horizon colour (the sea covers it anyway).
          col = mix(col, uHorizon, smoothstep(0.0, -0.2, d.y));
          float s = max(dot(d, uSunDir), 0.0);
          float sunUp = smoothstep(-0.12, 0.05, uSunDir.y);
          col += uSunColor * sunUp * (pow(s, 1400.0) * 6.0 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.08);
          float m = max(dot(d, uMoonDir), 0.0);
          float moonUp = smoothstep(-0.1, 0.08, uMoonDir.y);
          col += vec3(0.85, 0.9, 1.0) * moonUp * (smoothstep(0.99955, 0.9997, m) * 1.4 + pow(m, 60.0) * 0.12);
          // Stars: one per cell of a direction grid, twinkling.
          if (uStars > 0.01 && d.y > 0.0) {
            vec2 g = d.xz / (d.y + 0.6) * 140.0;
            vec2 cell = floor(g);
            float r = hash12(cell);
            vec2 c = fract(g) - vec2(hash12(cell + 7.1), hash12(cell + 3.7)) * 0.8 - 0.1;
            float star = smoothstep(0.09, 0.0, length(c)) * step(0.82, r);
            float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
            col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * smoothstep(0.0, 0.25, d.y);
          }
          // Soft clouds on a plane overhead.
          if (d.y > 0.02) {
            vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
            float n = vnoise(uv) * 0.55 + vnoise(uv * 2.1 + 3.0) * 0.3 + vnoise(uv * 4.3 + 7.0) * 0.15;
            float cl = smoothstep(0.55, 0.82, n) * smoothstep(0.02, 0.3, d.y);
            col = mix(col, uClouds, cl * 0.75);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(sky: SkyState, time: number) {
    const u = this.mesh.material.uniforms;
    (u.uTop.value as THREE.Color).copy(sky.top);
    (u.uHorizon.value as THREE.Color).copy(sky.horizon);
    (u.uSunDir.value as THREE.Vector3).copy(sky.sunDir);
    (u.uMoonDir.value as THREE.Vector3).copy(sky.moonDir);
    (u.uSunColor.value as THREE.Color).copy(sky.light).lerp(ca.set("#ffd7a8"), 0.4);
    (u.uClouds.value as THREE.Color).copy(sky.clouds);
    u.uStars.value = sky.stars;
    u.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// --- Water -------------------------------------------------------------------------------------------

const WATER_VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
varying vec3 vWorld;
varying vec2 vGrad;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 p = wp.xz;
  float h = 0.0; vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6); float k1 = 0.32; float s1 = k1 * dot(d1, p) - 1.3 * uTime;
  vec2 d2 = vec2(-0.45, 0.9); float k2 = 0.55; float s2 = k2 * dot(d2, p) - 1.9 * uTime + 1.7;
  vec2 d3 = vec2(0.95, -0.3); float k3 = 0.9; float s3 = k3 * dot(d3, p) - 2.6 * uTime + 4.0;
  h += 0.09 * sin(s1); g += 0.09 * k1 * cos(s1) * d1;
  h += 0.05 * sin(s2); g += 0.05 * k2 * cos(s2) * d2;
  h += 0.025 * sin(s3); g += 0.025 * k3 * cos(s3) * d3;
  wp.y += h * uAmp;
  vGrad = g * uAmp;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uHalf;
uniform float uSize;
uniform sampler2D uGround;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSpec;
uniform float uNight;
varying vec3 vWorld;
varying vec2 vGrad;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main() {
  vec2 p = vWorld.xz;
  vec2 uv = (p + uHalf) / uSize;
  float ground = -10.0;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ground = texture2D(uGround, uv).r * 14.0 - 10.0;
  float depth = vWorld.y - ground;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec2 g = vGrad;
  float near = 1.0 - smoothstep(20.0, 90.0, dist);
  float n1 = vnoise(p * 0.7 + vec2(uTime * 0.25, -uTime * 0.18));
  float n2 = vnoise(p * 1.6 - vec2(uTime * 0.31, uTime * 0.22));
  g += (vec2(n1, n2) - 0.5) * 0.22 * near;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = toCam / dist;
  float ndv = max(dot(N, V), 0.0);
  float f5 = pow(1.0 - ndv, 5.0);
  float fresnel = 0.03 + 0.97 * f5;
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyHorizon, uSkyTop, sqrt(clamp(R.y, 0.0, 1.0)));

  vec3 water = mix(uShallow, uMid, smoothstep(0.2, 2.6, depth));
  water = mix(water, uDeep, smoothstep(2.5, 8.0, depth));
  vec3 col = mix(water, sky, fresnel * 0.75);
  float sun = max(dot(R, uSunDir), 0.0);
  col += uSunColor * uSpec * (pow(sun, 600.0) * 2.5 * (0.35 + 0.65 * near) + pow(sun, 40.0) * 0.12);

  // Foam: a lapping band at the shoreline plus streaks rolling in over the shallows.
  float edge = depth + (n1 - 0.5) * 0.25;
  float lap = 0.5 + 0.5 * sin(depth * 7.0 - uTime * 2.2 + n2 * 4.0);
  float foam = (1.0 - smoothstep(0.0, 0.22, edge)) * 0.9;
  foam += (1.0 - smoothstep(0.1, 0.9, edge)) * smoothstep(0.72, 0.95, lap) * 0.55;
  foam *= step(-0.05, depth);
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0));

  float alpha = mix(0.35, 0.94, smoothstep(0.0, 1.8, depth));
  alpha = max(alpha, clamp(foam, 0.0, 1.0));
  alpha *= smoothstep(-0.06, 0.04, depth);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export class Water {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly cell: number;

  constructor(ground: THREE.Texture, opts: { size: number; segments: number; level: number; amp: number; circle?: boolean }) {
    const geometry = opts.circle ? new THREE.CircleGeometry(opts.size / 2, opts.segments) : new THREE.PlaneGeometry(opts.size, opts.size, opts.segments, opts.segments);
    geometry.rotateX(-Math.PI / 2);
    this.cell = opts.size / opts.segments;
    const material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      fog: true,
      transparent: true,
      depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uAmp: { value: opts.amp },
          uLevel: { value: opts.level },
          uHalf: { value: SIZE / 2 },
          uSize: { value: SIZE },
          uGround: { value: null },
          uDeep: { value: new THREE.Color("#0b4a72") },
          uMid: { value: new THREE.Color("#1b8bb0") },
          uShallow: { value: new THREE.Color("#4fd6c8") },
          uFoam: { value: new THREE.Color("#f5fbff") },
          uSkyTop: { value: new THREE.Color() },
          uSkyHorizon: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunColor: { value: new THREE.Color() },
          uSpec: { value: 1 },
          uNight: { value: 0 },
        },
      ]),
    });
    material.uniforms.uGround.value = ground;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = opts.level;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Day/night water colours. */
  setSky(sky: SkyState, pond = false) {
    const u = this.mesh.material.uniforms;
    const night = sky.darkness;
    (u.uSkyTop.value as THREE.Color).copy(sky.top);
    (u.uSkyHorizon.value as THREE.Color).copy(sky.horizon);
    (u.uSunDir.value as THREE.Vector3).copy(sky.lightDir);
    (u.uSunColor.value as THREE.Color).copy(sky.light);
    u.uSpec.value = 0.4 + sky.lightIntensity * 0.5;
    (u.uDeep.value as THREE.Color).set(pond ? "#1d4f45" : "#0b4a72").lerp(ca.set("#04101e"), night * 0.85);
    (u.uMid.value as THREE.Color).set(pond ? "#2f7a62" : "#1b8bb0").lerp(ca.set("#0a2238"), night * 0.85);
    (u.uShallow.value as THREE.Color).set(pond ? "#5fae8a" : "#4fd6c8").lerp(ca.set("#1a4450"), night * 0.8);
    (u.uFoam.value as THREE.Color).set("#f5fbff").lerp(ca.set("#6f86a6"), night * 0.7);
  }

  /** Follows the camera in whole grid cells so the vertices never swim. */
  update(time: number, center?: THREE.Vector3) {
    if (center) {
      const c = this.cell;
      this.mesh.position.x = Math.round(center.x / c) * c;
      this.mesh.position.z = Math.round(center.z / c) * c;
    }
    this.mesh.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Sea height at (x, z) (matches the shader's waves). */
export function seaHeight(x: number, z: number, time: number, amp = 1) {
  const s1 = 0.32 * (0.8 * x + 0.6 * z) - 1.3 * time;
  const s2 = 0.55 * (-0.45 * x + 0.9 * z) - 1.9 * time + 1.7;
  const s3 = 0.9 * (0.95 * x - 0.3 * z) - 2.6 * time + 4.0;
  return (0.09 * Math.sin(s1) + 0.05 * Math.sin(s2) + 0.025 * Math.sin(s3)) * amp;
}
