import * as THREE from "three";
import { paintDeck } from "./board-art";
import type { BoardDef, SkinLook, Trail } from "./content";

/**
 * Skate Rush's visual extras: skins (shader finishes on any skater), board skins, board trails,
 * stage material variants (tints, settled snow, lit windows) and sky / weather effects.
 */

/** Seconds, shared by every animated shader. */
export const shaderTime = { value: 0 };
/** Track distance (m): weather particles stream past at the run speed. */
export const shaderDistance = { value: 0 };

const NOISE_GLSL = /* glsl */ `
float sr_hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sr_noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sr_hash(i), sr_hash(i + vec3(1, 0, 0)), f.x), mix(sr_hash(i + vec3(0, 1, 0)), sr_hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sr_hash(i + vec3(0, 0, 1)), sr_hash(i + vec3(1, 0, 1)), f.x), mix(sr_hash(i + vec3(0, 1, 1)), sr_hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 sr_hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

// --- Skins ---------------------------------------------------------------------------------------

/**
 * Per look: GLSL run after the colour map is sampled (may set diffuseColor; `sp` is the point in the
 * skater's own space, 0..1 from feet to head, `lum` the original brightness) and GLSL that adds glow
 * (`fres` = rim factor, 1 at silhouette edges).
 */
const SKIN_SHADERS: Record<Exclude<SkinLook, "classic">, { diffuse: string; emissive: string; metal: number; rough: number; env?: number }> = {
  shadow: {
    diffuse: `diffuseColor.rgb = vec3(0.05, 0.04, 0.09) + lum * vec3(0.2, 0.13, 0.34);`,
    emissive: `totalEmissiveRadiance += vec3(0.55, 0.2, 1.0) * pow(fres, 2.0) * 2.4;`,
    metal: 0,
    rough: 0.6,
  },
  frost: {
    diffuse: `diffuseColor.rgb = mix(vec3(0.55, 0.78, 1.0), vec3(0.97, 0.99, 1.0), smoothstep(0.15, 0.75, lum)) * (0.6 + 0.45 * lum);`,
    emissive: `totalEmissiveRadiance += vec3(0.45, 0.8, 1.0) * pow(fres, 2.4) * 1.3 + vec3(1.0) * step(0.993, sr_hash(floor(sp * 60.0) + floor(uTime * 3.0))) * 2.0;`,
    metal: 0.15,
    rough: 0.22,
  },
  toxic: {
    diffuse: `diffuseColor.rgb = mix(vec3(0.03, 0.12, 0.04), vec3(0.4, 1.0, 0.28), lum);`,
    emissive: `totalEmissiveRadiance += vec3(0.25, 1.0, 0.2) * (smoothstep(0.86, 1.0, sin(sp.y * 26.0 - uTime * 5.0)) * 1.1 + pow(fres, 2.0) * 0.9);`,
    metal: 0,
    rough: 0.45,
  },
  neon: {
    diffuse: `diffuseColor.rgb = vec3(0.02, 0.02, 0.05) + lum * 0.1;`,
    emissive: `vec3 nc = mix(vec3(0.13, 0.83, 0.93), vec3(0.91, 0.47, 0.98), 0.5 + 0.5 * sin(sp.y * 7.0 + uTime * 2.5));
      totalEmissiveRadiance += nc * (pow(fres, 2.6) * 3.2 + smoothstep(0.9, 1.0, sin(sp.y * 40.0 - uTime * 3.0)) * 0.8);`,
    metal: 0.2,
    rough: 0.35,
  },
  lava: {
    diffuse: `diffuseColor.rgb = vec3(0.14, 0.07, 0.05) * (0.55 + lum);
      float ln = sr_noise(sp * 9.0 + vec3(0.0, -uTime * 0.7, 0.0));
      float ln2 = sr_noise(sp * 19.0 - vec3(uTime * 0.3));`,
    emissive: `float crack = 1.0 - smoothstep(0.0, 0.07, abs(ln - 0.5));
      totalEmissiveRadiance += vec3(1.0, 0.38, 0.05) * (crack * 2.8 + smoothstep(0.64, 0.82, ln2) * 0.9) + vec3(1.0, 0.3, 0.0) * pow(fres, 2.0) * 0.5;`,
    metal: 0,
    rough: 0.85,
  },
  chrome: {
    diffuse: `diffuseColor.rgb = vec3(0.95) * (0.55 + 0.45 * lum);`,
    emissive: `totalEmissiveRadiance += vec3(0.75, 0.8, 0.9) * pow(fres, 3.0) * 0.6;`,
    metal: 1,
    rough: 0.16,
    env: 2.4,
  },
  gold: {
    diffuse: `diffuseColor.rgb = vec3(1.0, 0.76, 0.28) * (0.5 + 0.7 * lum);`,
    emissive: `totalEmissiveRadiance += vec3(1.0, 0.9, 0.6) * step(0.992, sr_hash(floor(sp * 50.0) + floor(uTime * 4.0))) * 3.0;`,
    metal: 1,
    rough: 0.26,
  },
  galaxy: {
    diffuse: `float neb = sr_noise(sp * 5.0 + vec3(0.0, 0.0, uTime * 0.08));
      diffuseColor.rgb = mix(vec3(0.04, 0.02, 0.14), vec3(0.42, 0.16, 0.75), neb) * (0.55 + 0.6 * lum);`,
    emissive: `float gs = sr_hash(floor(sp * 70.0));
      totalEmissiveRadiance += vec3(0.25, 0.12, 0.55) * neb * 0.6 + vec3(1.0) * step(0.965, gs) * (0.6 + 0.4 * sin(uTime * 4.0 + gs * 60.0)) * 2.2 + vec3(0.6, 0.4, 1.0) * pow(fres, 2.0) * 0.7;`,
    metal: 0.1,
    rough: 0.4,
  },
  rainbow: {
    diffuse: `vec3 rb = sr_hue(fract(sp.y * 0.9 + sp.x * 0.3 - uTime * 0.35));
      diffuseColor.rgb = rb * (0.35 + 0.75 * lum);`,
    emissive: `totalEmissiveRadiance += rb * 0.28 + rb * pow(fres, 2.0) * 0.6;`,
    metal: 0.1,
    rough: 0.35,
  },
};

const ORIGINAL = "srOriginalMaterial";

/**
 * Gives a skater a skin. `origin` is the skater's position (updated by the caller each frame), so
 * patterns move with the body instead of sliding over it.
 */
export function applySkin(root: THREE.Object3D, look: SkinLook, origin: { value: THREE.Vector3 }) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = (mesh.userData[ORIGINAL] ??= mesh.material) as THREE.Material;
    const previous = mesh.material as THREE.Material;
    if (look === "classic") {
      mesh.material = original;
    } else {
      const spec = SKIN_SHADERS[look];
      const material = (original as THREE.MeshStandardMaterial).clone();
      material.metalness = spec.metal;
      material.roughness = spec.rough;
      material.envMapIntensity = spec.env ?? (spec.metal > 0.5 ? 1.8 : 1);
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = shaderTime;
        shader.uniforms.uOrigin = origin;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vSrWorld;")
          .replace("#include <project_vertex>", "#include <project_vertex>\nvSrWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>\nuniform float uTime;\nuniform vec3 uOrigin;\nvarying vec3 vSrWorld;\n${NOISE_GLSL}`)
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            vec3 sp = (vSrWorld - uOrigin) / 1.55;
            float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            ${spec.diffuse}`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
            float fres = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            ${spec.emissive}`,
          );
      };
      material.customProgramCacheKey = () => `sr-skin-${look}`;
      mesh.material = material;
    }
    if (previous !== original && previous !== mesh.material) previous.dispose();
  });
}

// --- Boards --------------------------------------------------------------------------------------

type Part = "deck" | "grip" | "wheels" | "accent" | "trucks" | "other";
const PARTS: Part[] = ["deck", "grip", "wheels", "accent", "trucks", "other"];

/** Which part of the Mini Skate board a triangle belongs to, from the colour swatch its UV points at. */
function partOf(u: number, v: number): Part {
  if (Math.abs(u - 0.594) < 0.04) return "deck";
  if (Math.abs(u - 0.094) < 0.04) return "grip";
  if (Math.abs(u - 0.469) < 0.04) return v < 0.75 ? "accent" : "wheels";
  if (Math.abs(u - 0.344) < 0.04) return "trucks";
  return "other";
}

/** The board model split into parts that each board skin paints its own way. */
export class BoardRig {
  private readonly mesh: THREE.Mesh | null;
  private readonly original: THREE.Material | null;
  private materials: THREE.Material[] = [];
  private deckTexture: THREE.CanvasTexture | null = null;
  private readonly underglow: THREE.Mesh;
  board: BoardDef | null = null;

  constructor(model: THREE.Object3D) {
    let found: THREE.Mesh | null = null;
    model.traverse((o) => {
      if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
    });
    this.mesh = found;
    this.original = found ? ((found as THREE.Mesh).material as THREE.Material) : null;
    if (found) (found as THREE.Mesh).geometry = splitBoard((found as THREE.Mesh).geometry);
    // Hoverboard: a soft light under the deck instead of wheels.
    this.underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#38bdf8", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.underglow.rotation.x = -Math.PI / 2;
    this.underglow.visible = false;
  }

  /** Sits the underglow below the board (call once the board is in its pivot). */
  attachGlow(parent: THREE.Object3D, y: number) {
    this.underglow.position.y = y;
    this.underglow.scale.set(1.1, 1.9, 1);
    parent.add(this.underglow);
  }

  setSkin(board: BoardDef) {
    this.board = board;
    const mesh = this.mesh;
    if (!mesh || !this.original) return;
    this.materials.forEach((m) => m.dispose());
    this.deckTexture?.dispose();
    this.materials = [];
    this.deckTexture = null;
    this.underglow.visible = board.art === "hover";
    (this.underglow.material as THREE.MeshBasicMaterial).color.set(board.colors[1] ?? "#38bdf8");
    if (board.art === "classic") {
      mesh.material = PARTS.map(() => this.original!);
      return;
    }
    const canvas = document.createElement("canvas");
    paintDeck(canvas, board);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.channel = 1;
    if (board.art === "rainbow") texture.wrapT = THREE.RepeatWrapping;
    this.deckTexture = texture;
    const glowDeck = board.art === "neon" || board.art === "galaxy" || board.art === "hover" || board.art === "rainbow" || board.art === "flames";
    const deck = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: board.metal ? 0.28 : 0.55,
      metalness: board.metal ? 0.85 : 0.05,
      emissive: glowDeck ? "#ffffff" : "#000000",
      emissiveMap: glowDeck ? texture : null,
      emissiveIntensity: board.art === "neon" || board.art === "hover" ? 0.9 : 0.35,
    });
    const wheels = new THREE.MeshStandardMaterial({
      color: board.wheels,
      roughness: 0.45,
      emissive: board.glow ? board.wheels : "#000000",
      emissiveIntensity: board.glow ? 0.9 : 0,
    });
    const trucks = new THREE.MeshStandardMaterial({ color: board.trucks, roughness: 0.32, metalness: 0.7 });
    const accent = new THREE.MeshStandardMaterial({ color: board.colors[1] ?? board.wheels, roughness: 0.5 });
    // Wheels and trucks vanish on the hoverboard.
    if (board.art === "hover") wheels.visible = trucks.visible = false;
    this.materials = [deck, wheels, trucks, accent];
    mesh.material = [deck, deck, wheels, accent, trucks, this.original];
  }

  update(dt: number) {
    if (this.board?.art === "rainbow" && this.deckTexture) this.deckTexture.offset.y = (this.deckTexture.offset.y + dt * 0.25) % 1;
    if (this.underglow.visible) {
      const m = this.underglow.material as THREE.MeshBasicMaterial;
      m.opacity = 0.75 + Math.sin(shaderTime.value * 6) * 0.2;
    }
  }
}

/** Re-orders the board's triangles into one group per part, plus a flat top-down UV set for the deck art. */
function splitBoard(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source.clone();
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const normal = geo.getAttribute("normal");
  if (!uv) return geo;
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const tris: Record<Part, number[]> = { deck: [], grip: [], wheels: [], accent: [], trucks: [], other: [] };
  for (let t = 0; t < pos.count / 3; t++) tris[partOf(uv.getX(t * 3), uv.getY(t * 3))].push(t);

  const out = new THREE.BufferGeometry();
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  /** Second UV set: the deck seen from above (0..1 across, 0..1 tail to nose) for the deck art. */
  const D: number[] = [];
  let start = 0;
  PARTS.forEach((part, index) => {
    const list = tris[part];
    for (const t of list) {
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        const x = pos.getX(i);
        const z = pos.getZ(i);
        P.push(x, pos.getY(i), z);
        if (normal) N.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        U.push(uv.getX(i), uv.getY(i));
        D.push((x - box.min.x) / (box.max.x - box.min.x), (z - box.min.z) / (box.max.z - box.min.z));
      }
    }
    out.addGroup(start, list.length * 3, index);
    start += list.length * 3;
  });
  out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  if (N.length) out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  else out.computeVertexNormals();
  out.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
  out.setAttribute("uv1", new THREE.Float32BufferAttribute(D, 2));
  return out;
}

// --- Particles -----------------------------------------------------------------------------------

let glowTex: THREE.Texture | null = null;

/** A soft round glow (white; tint with the material colour). */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.65)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const POINTS_VERTEX = /* glsl */ `
attribute float size;
attribute vec4 tint;
varying vec4 vTint;
void main() {
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const POINTS_FRAGMENT = /* glsl */ `
varying vec4 vTint;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vTint.rgb * a * vTint.a, 1.0);
}`;

/** Sparks / flames / stars streaming off the back of the board. */
export class TrailFx {
  readonly points: THREE.Points;
  private readonly max = 220;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly age: Float32Array;
  private readonly base: Float32Array;
  private readonly size: Float32Array;
  private readonly tint: Float32Array;
  private next = 0;
  private carry = 0;
  kind: Trail | null = null;
  private readonly color = new THREE.Color();

  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max).fill(1);
    this.age = new Float32Array(this.max).fill(9);
    this.base = new Float32Array(this.max);
    this.size = new Float32Array(this.max);
    this.tint = new Float32Array(this.max * 4);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    g.setAttribute("tint", new THREE.BufferAttribute(this.tint, 4));
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({ vertexShader: POINTS_VERTEX, fragmentShader: POINTS_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.points.frustumCulled = false;
  }

  /** `from`: emitter position (board tail, world); `speed`: run speed (the world moves +z past the player). */
  update(dt: number, from: THREE.Vector3, emitting: boolean, speed: number) {
    const kind = this.kind;
    if (kind && emitting) {
      this.carry += dt * (kind === "neon" || kind === "hover" ? 90 : 60);
      while (this.carry >= 1) {
        this.carry--;
        this.spawn(kind, from);
      }
    }
    const t = shaderTime.value;
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) {
        this.tint[i * 4 + 3] = 0;
        continue;
      }
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + speed) * dt;
      let alpha = 1 - k;
      if (kind === "stars" || kind === "gold") alpha *= 0.6 + 0.4 * Math.sin(t * 20 + i);
      this.tint[i * 4 + 3] = Math.max(0, alpha);
      this.size[i] = this.base[i] * (kind === "fire" ? 1 - k * 0.6 : kind === "hover" ? 1 + k : 1);
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.tint.needsUpdate = true;
  }

  clear() {
    this.age.fill(9);
    this.tint.fill(0);
    this.points.geometry.attributes.tint.needsUpdate = true;
  }

  private spawn(kind: Trail, from: THREE.Vector3) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const r = () => Math.random() - 0.5;
    this.pos.set([from.x + r() * 0.35, from.y + r() * 0.1, from.z + r() * 0.2], i * 3);
    this.age[i] = 0;
    let vx = r() * 0.6;
    let vy = 0;
    const vz = 0;
    let life = 0.5;
    let size = 0.16;
    const c = this.color;
    if (kind === "fire") {
      vy = 1.2 + Math.random() * 1.4;
      c.setHSL(0.02 + Math.random() * 0.1, 1, 0.55);
      size = 0.22 + Math.random() * 0.14;
      life = 0.45;
    } else if (kind === "stars") {
      vy = r() * 1.2;
      vx = r() * 1.6;
      c.setHSL(0.72 + Math.random() * 0.15, 0.9, 0.75 + Math.random() * 0.25);
      size = 0.1 + Math.random() * 0.12;
      life = 0.7;
    } else if (kind === "neon") {
      vx = r() * 0.1;
      c.set(this.next % 2 ? "#22d3ee" : "#e879f9");
      size = 0.16;
      life = 0.35;
    } else if (kind === "gold") {
      vy = Math.random() * 1.5;
      vx = r() * 1.2;
      c.setHSL(0.12 + Math.random() * 0.03, 1, 0.6 + Math.random() * 0.3);
      size = 0.09 + Math.random() * 0.1;
      life = 0.65;
    } else if (kind === "rainbow") {
      vx = r() * 0.15;
      c.setHSL((shaderTime.value * 0.6) % 1, 1, 0.6);
      size = 0.2;
      life = 0.42;
    } else {
      vy = -0.6;
      c.set("#7dd3fc");
      size = 0.18;
      life = 0.3;
    }
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.base[i] = size;
    this.size[i] = size;
    this.tint.set([c.r, c.g, c.b, 1], i * 4);
  }
}

// --- Sky & weather -------------------------------------------------------------------------------

/** Falling snow (stage "snow") or drifting fireflies (night): GPU-animated, streams past at run speed. */
export function makeWeather(kind: "snow" | "fireflies") {
  const count = kind === "snow" ? 1400 : 160;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * (kind === "snow" ? 60 : 36);
    pos[i * 3 + 1] = Math.random() * (kind === "snow" ? 22 : 5);
    pos[i * 3 + 2] = Math.random() * 80;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const snow = kind === "snow";
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: shaderTime, uDist: shaderDistance },
    transparent: true,
    depthWrite: false,
    blending: snow ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uDist;
      attribute float seed; varying float vSeed;
      void main() {
        vSeed = seed;
        vec3 p = position;
        ${
          snow
            ? `p.y = mod(p.y - uTime * (1.4 + seed * 1.2), 22.0) - 1.0;
               p.x += sin(uTime * 0.8 + seed * 20.0) * 0.6;`
            : `p.y = 0.6 + p.y + sin(uTime * (0.7 + seed) + seed * 30.0) * 0.6;
               p.x += sin(uTime * 0.5 + seed * 13.0) * 1.2;`
        }
        p.z = mod(p.z + uDist, 80.0) - 70.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = ${snow ? "(0.09 + seed * 0.07)" : "0.14"} * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying float vSeed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        ${
          snow
            ? `gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.15, d) * 0.9);`
            : `float blink = 0.4 + 0.6 * sin(uTime * 3.0 + vSeed * 40.0);
               gl_FragColor = vec4(vec3(0.6, 1.0, 0.45) * smoothstep(0.5, 0.0, d) * max(0.0, blink), 1.0);`
        }
      }`,
  });
  const points = new THREE.Points(g, material);
  points.frustumCulled = false;
  return points;
}

/** Twinkling stars on the inside of the sky dome (child of the camera). */
export function makeStars() {
  const count = 900;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.04, Math.random() - 0.5).normalize().multiplyScalar(420);
    pos.set([v.x, v.y, v.z], i * 3);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: { uTime: shaderTime },
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float seed; varying float vA; uniform float uTime;
        void main() {
          vA = (0.45 + 0.55 * seed) * (0.7 + 0.3 * sin(uTime * (1.0 + seed * 3.0) + seed * 50.0));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 1.5 + seed * 2.2;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0) * smoothstep(0.5, 0.1, d) * vA, 1.0); }`,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
}

/** A moon (craters + halo) or a blue planet, painted once, shown as a sprite in the sky. */
export function makeSkyDisc(kind: "moon" | "planet", color = "#f4f1d0") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const halo = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  halo.addColorStop(0, kind === "moon" ? "rgba(255,255,230,0.35)" : "rgba(120,190,255,0.45)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, 256, 256);
  g.save();
  g.beginPath();
  g.arc(128, 128, 72, 0, Math.PI * 2);
  g.clip();
  if (kind === "moon") {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(120,120,100,0.22)";
    for (const [x, y, r] of [
      [100, 110, 16],
      [150, 140, 22],
      [120, 170, 10],
      [160, 95, 9],
      [90, 150, 8],
    ])
      circle(g, x, y, r);
  } else {
    g.fillStyle = "#1d5fbf";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#3fa34d";
    for (const [x, y, rx, ry] of [
      [100, 100, 34, 22],
      [160, 150, 28, 36],
      [92, 168, 18, 12],
    ])
      blob(g, x, y, rx, ry, 0.5);
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (const [x, y, rx, ry] of [
      [120, 80, 40, 7],
      [150, 120, 30, 6],
      [96, 140, 26, 5],
      [140, 182, 34, 6],
    ])
      blob(g, x, y, rx, ry, -0.2);
    // Night side.
    const shade = g.createLinearGradient(60, 60, 200, 200);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(0.55, "rgba(0,0,0,0.1)");
    shade.addColorStop(1, "rgba(0,0,10,0.75)");
    g.fillStyle = shade;
    g.fillRect(0, 0, 256, 256);
  }
  g.restore();
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: false, depthWrite: false, transparent: true }));
  sprite.renderOrder = -1;
  return sprite;
}

// --- Stage material variants ---------------------------------------------------------------------

export interface Variant {
  tint?: string;
  snow?: boolean;
  windows?: boolean;
}

/** A stage's version of a model's material: tinted, snow on every upward face, and/or lit windows. */
export function variantMaterial(source: THREE.Material, v: Variant): THREE.Material {
  const m = source.clone() as THREE.MeshStandardMaterial;
  if (v.tint) m.color.multiply(new THREE.Color(v.tint));
  if (v.snow || v.windows) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = shaderTime;
      // Model space: the street moves past the camera, so world-space window patterns would flicker.
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vSrLocal;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvSrLocal = transformed;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float uTime;\nvarying vec3 vSrLocal;\n${NOISE_GLSL}`)
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          ${
            v.snow
              ? `vec3 srUp = inverseTransformDirection(normal, viewMatrix);
                 float srSnow = smoothstep(0.55, 0.8, srUp.y);
                 diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), srSnow * 0.92);`
              : ""
          }`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          ${
            v.windows
              ? `float srLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                 float srGlass = step(diffuseColor.r + 0.1, diffuseColor.b) * step(0.35, srLum);
                 float srCell = sr_hash(floor(vSrLocal * vec3(6.0, 4.0, 6.0)));
                 vec3 srLit = mix(vec3(1.0, 0.78, 0.42), vec3(0.55, 0.85, 1.0), step(0.75, srCell));
                 totalEmissiveRadiance += srGlass * step(0.35, srCell) * srLit * 1.6;`
              : ""
          }`,
        );
    };
    m.customProgramCacheKey = () => `sr-var-${v.snow ? "s" : ""}${v.windows ? "w" : ""}`;
  }
  return m;
}
