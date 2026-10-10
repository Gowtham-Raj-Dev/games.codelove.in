import * as THREE from "three";

/**
 * The sea: a sum of directional sine waves evaluated identically on the GPU (water mesh) and the
 * CPU (ships, loot and wakes float on the very same surface), plus the sky dome.
 */

interface Wave {
  dx: number;
  dz: number;
  k: number;
  amp: number;
  omega: number;
  phase: number;
}

const wave = (angle: number, length: number, amp: number, phase: number): Wave => {
  const k = (Math.PI * 2) / length;
  return { dx: Math.sin(angle), dz: Math.cos(angle), k, amp, omega: Math.sqrt(9.8 * k) * 0.9, phase };
};

const WAVES: Wave[] = [wave(0.35, 44, 0.36, 0), wave(1.95, 25, 0.21, 1.7), wave(-1.15, 15.5, 0.12, 4.1), wave(2.8, 9.5, 0.06, 2.3)];

/** Global wave strength (calm menu sea = 0.8, normal = 1, ghost storm = 1.35). */
export const sea = { amp: 1, time: 0 };

/** Water height at (x, z). */
export function waveHeight(x: number, z: number, t = sea.time) {
  let h = 0;
  for (const w of WAVES) h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase);
  return h * sea.amp;
}

const f = (n: number) => n.toFixed(5);
const GLSL_WAVES = `
float waveH(vec2 p, out vec2 grad) {
  float h = 0.0; grad = vec2(0.0); float a; vec2 d; float k; float s;
${WAVES.map(
  (w) => `  d = vec2(${f(w.dx)}, ${f(w.dz)}); k = ${f(w.k)}; a = ${f(w.amp)} * uAmp;
  s = k * dot(d, p) - ${f(w.omega)} * uTime + ${f(w.phase)};
  h += a * sin(s); grad += a * k * cos(s) * d;`,
).join("\n")}
  return h;
}`;

export const MAX_SHOALS = 24;

const VERT = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec4 uShoals[${MAX_SHOALS}];
uniform int uShoalCount;
varying vec3 vWorld;
varying float vH;
varying vec2 vGrad;
varying float vShoal;
#include <fog_pars_vertex>
${GLSL_WAVES}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 g;
  float h = waveH(wp.xz, g);
  wp.y += h;
  vWorld = wp.xyz;
  vH = h;
  vGrad = g;
  // Distance to the nearest shoal edge (islands, reefs) — smooth enough to interpolate.
  float d = 1e5;
  for (int i = 0; i < ${MAX_SHOALS}; i++) {
    if (i >= uShoalCount) break;
    vec4 s = uShoals[i];
    d = min(d, length(wp.xz - s.xy) - s.z);
  }
  vShoal = d;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vWorld;
varying float vH;
varying vec2 vGrad;
varying float vShoal;
#include <fog_pars_fragment>

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 ripple(vec2 p, vec2 d, float k, float w, float a) {
  return a * k * cos(k * dot(d, p) - w * uTime) * d;
}

void main() {
  vec2 p = vWorld.xz;
  vec2 g = vGrad;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  // Small ripples only bend the normal (sun glitter); they fade with distance so they never alias.
  float near = 1.0 - smoothstep(25.0, 110.0, dist);
  if (near > 0.0) {
    vec2 r = ripple(p, vec2(0.89, 0.45), 1.3, 2.6, 0.03);
    r += ripple(p, vec2(-0.35, 0.94), 1.9, 3.3, 0.02);
    r += ripple(p, vec2(-0.8, -0.6), 2.9, 4.1, 0.012);
    g += r * near;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = toCam / dist;
  float ndv = max(dot(N, V), 0.0);
  float f5 = 1.0 - ndv;
  float fresnel = 0.02 + 0.98 * f5 * f5 * f5 * f5 * f5;
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uSkyHorizon, uSkyTop, sqrt(clamp(R.y, 0.0, 1.0)));

  float d = vShoal;
  float n1 = noise(p * 0.32 + vec2(uTime * 0.05, -uTime * 0.04));
  float crest = clamp(vH / (0.75 * uAmp) * 0.5 + 0.5, 0.0, 1.0);
  vec3 water = mix(uDeep, uMid, smoothstep(0.15, 0.95, crest));
  float shallow = 1.0 - smoothstep(0.0, 18.0, d + (n1 - 0.5) * 4.0);
  water = mix(water, uShallow, shallow * 0.9);
  water += uShallow * 0.12 * smoothstep(0.55, 1.0, crest) * f5;

  vec3 col = mix(water, sky, fresnel * 0.85);
  float sun = max(dot(R, uSunDir), 0.0);
  float s8 = sun * sun * sun * sun * sun * sun * sun * sun;
  col += uSunColor * (pow(sun, 900.0) * 2.4 * (0.4 + 0.6 * near) + pow(s8, 7.5) * 0.18 + s8 * 0.05);

  float foam = 0.0;
  if (d < 7.0 || crest > 0.7) {
    float n2 = noise(p * 1.1 - vec2(uTime * 0.12, uTime * 0.09));
    float edge = d + (n1 - 0.5) * 2.6;
    float lap = 0.5 + 0.5 * sin(d * 1.5 - uTime * 1.7 + n1 * 3.0);
    foam = (1.0 - smoothstep(0.0, 3.2, edge)) * (0.45 + 0.55 * lap);
    foam += (1.0 - smoothstep(3.0, 7.0, edge)) * smoothstep(0.62, 0.8, n2) * 0.6;
    // Whitecaps: thin specks on the highest crests.
    float n3 = noise(p * 2.6 + vec2(uTime * 0.3, 0.0));
    foam += smoothstep(0.86, 1.0, crest + (n2 - 0.5) * 0.3) * smoothstep(0.5, 0.75, n3) * 0.4;
  }
  col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.9);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface SeaPalette {
  deep: string;
  mid: string;
  shallow: string;
  skyTop: string;
  horizon: string;
}

export const SUNNY: SeaPalette = { deep: "#0b4c78", mid: "#1d86b4", shallow: "#34d1c7", skyTop: "#4f9fe0", horizon: "#cfe9f6" };
export const HAUNTED: SeaPalette = { deep: "#08262b", mid: "#13514f", shallow: "#2b8f78", skyTop: "#1a3138", horizon: "#6f9a8e" };

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly cell: number;

  constructor(size = 640, segments = 220) {
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    this.cell = size / segments;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uAmp: { value: 1 },
          uDeep: { value: new THREE.Color() },
          uMid: { value: new THREE.Color() },
          uShallow: { value: new THREE.Color() },
          uFoam: { value: new THREE.Color("#f3fbff") },
          uSkyTop: { value: new THREE.Color() },
          uSkyHorizon: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
          uSunColor: { value: new THREE.Color("#fff2d6") },
          uShoals: { value: Array.from({ length: MAX_SHOALS }, () => new THREE.Vector4(0, 0, 0, 0)) },
          uShoalCount: { value: 0 },
        },
      ]),
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    // Drawn after the islands and ships, so the hidden water is never shaded.
    this.mesh.renderOrder = 1;
  }

  setShoals(list: { x: number; z: number; r: number }[]) {
    const u = this.material.uniforms;
    const arr = u.uShoals.value as THREE.Vector4[];
    list.slice(0, MAX_SHOALS).forEach((s, i) => arr[i].set(s.x, s.z, s.r, 0));
    u.uShoalCount.value = Math.min(MAX_SHOALS, list.length);
  }

  setSun(dir: THREE.Vector3, color?: THREE.Color) {
    (this.material.uniforms.uSunDir.value as THREE.Vector3).copy(dir).normalize();
    if (color) (this.material.uniforms.uSunColor.value as THREE.Color).copy(color);
  }

  /** Blends between two palettes (0 = a, 1 = b). */
  setPalette(a: SeaPalette, b: SeaPalette, t: number) {
    const u = this.material.uniforms;
    const mix = (target: THREE.Color, ca: string, cb: string) => target.set(ca).lerp(tmp.set(cb), t);
    mix(u.uDeep.value, a.deep, b.deep);
    mix(u.uMid.value, a.mid, b.mid);
    mix(u.uShallow.value, a.shallow, b.shallow);
    mix(u.uSkyTop.value, a.skyTop, b.skyTop);
    mix(u.uSkyHorizon.value, a.horizon, b.horizon);
  }

  /** Follows the camera in whole grid cells so the vertices never swim. */
  update(center: THREE.Vector3) {
    const c = this.cell;
    this.mesh.position.set(Math.round(center.x / c) * c, 0, Math.round(center.z / c) * c);
    const u = this.material.uniforms;
    u.uTime.value = sea.time;
    u.uAmp.value = sea.amp;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

const tmp = new THREE.Color();

/** Gradient sky dome with a soft sun, attached to the camera. */
export class Sky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() },
        sunColor: { value: new THREE.Color("#fff4dc") },
      },
      vertexShader:
        "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.5));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 900.0) * 2.0 + pow(s, 12.0) * 0.18);
          // Not tone mapped, like the fog it has to meet at the horizon.
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
  }

  set(top: THREE.Color, horizon: THREE.Color, sunDir: THREE.Vector3, sunColor?: THREE.Color) {
    const u = this.material.uniforms;
    (u.top.value as THREE.Color).copy(top);
    (u.horizon.value as THREE.Color).copy(horizon);
    (u.sunDir.value as THREE.Vector3).copy(sunDir).normalize();
    if (sunColor) (u.sunColor.value as THREE.Color).copy(sunColor);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
