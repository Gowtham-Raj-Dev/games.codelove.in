import * as THREE from "three";
import type { Grid } from "./grid";

/**
 * Procedural effects only — light on the floor, vision cones, noise rings, laser beams, sparkles and
 * the little markers that make a dark museum readable. Every solid object in the game is a library
 * model; these are light and UI.
 */

// --- Textures ------------------------------------------------------------------------------------------

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft round light pool, white (tinted by the material). */
export function radialTexture() {
  return canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(0.7, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

/** A soft-edged square (moonlight through a skylight). */
export function squareTexture() {
  return canvasTexture(128, 128, (c) => {
    for (let i = 0; i < 18; i++) {
      const inset = 6 + i * 2.2;
      c.fillStyle = `rgba(255,255,255,${0.06})`;
      c.fillRect(inset, inset, 128 - inset * 2, 128 - inset * 2);
    }
    // Window bars.
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.fillRect(61, 0, 6, 128);
    c.fillRect(0, 61, 128, 6);
  });
}

/** Ring with soft edges (noise rings, markers). */
function ringTexture() {
  return canvasTexture(128, 128, (c) => {
    c.strokeStyle = "white";
    for (let i = 0; i < 4; i++) {
      c.globalAlpha = [0.18, 0.35, 1, 0.35][i];
      c.lineWidth = [10, 6, 3, 6][i];
      c.beginPath();
      c.arc(64, 64, 58 - (i === 3 ? 4 : 0), 0, Math.PI * 2);
      c.stroke();
    }
  });
}

// --- Vision cones --------------------------------------------------------------------------------------

const CONE_VERT = /* glsl */ `
attribute float aF;
varying float vF;
void main() {
  vF = aF;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const CONE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uInner;
varying float vF;
void main() {
  float core = vF < uInner ? 1.0 : 0.42;
  float fade = 1.0 - smoothstep(0.15, 1.0, vF) * 0.7;
  float edge = smoothstep(uInner - 0.025, uInner, vF) * (1.0 - smoothstep(uInner, uInner + 0.025, vF));
  float a = uAlpha * (core * fade + edge * 0.6);
  gl_FragColor = vec4(uColor, a);
}`;

/** A guard's (or camera's) field of view, cut by walls: a fan of rays rebuilt every frame. */
export class Cone {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly frac: Float32Array;
  private readonly color: THREE.Color;

  constructor(
    private readonly rays = 34,
    private readonly y = 0.035,
  ) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array((rays + 2) * 3);
    this.frac = new Float32Array(rays + 2);
    const index: number[] = [];
    for (let i = 0; i < rays; i++) index.push(0, i + 2, i + 1);
    geo.setIndex(index);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aF", new THREE.BufferAttribute(this.frac, 1).setUsage(THREE.DynamicDrawUsage));
    this.color = new THREE.Color();
    const mat = new THREE.ShaderMaterial({
      vertexShader: CONE_VERT,
      fragmentShader: CONE_FRAG,
      uniforms: { uColor: { value: this.color }, uAlpha: { value: 0.3 }, uInner: { value: 0.56 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(grid: Grid, x: number, z: number, yaw: number, half: number, range: number) {
    const { pos, frac, rays, y } = this;
    pos[0] = x;
    pos[1] = y;
    pos[2] = z;
    frac[0] = 0;
    for (let i = 0; i <= rays; i++) {
      const a = yaw - half + (2 * half * i) / rays;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const d = grid.ray(x, z, dx, dz, range);
      const o = (i + 1) * 3;
      pos[o] = x + dx * d;
      pos[o + 1] = y;
      pos[o + 2] = z + dz * d;
      frac[i + 1] = d / range;
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aF.needsUpdate = true;
  }

  style(color: THREE.ColorRepresentation, alpha: number, inner: number) {
    this.color.set(color);
    const u = this.mesh.material.uniforms;
    u.uAlpha.value = alpha;
    u.uInner.value = inner;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// --- Awareness badges ("?" / "!") ------------------------------------------------------------------------

const BADGE_FRAG = /* glsl */ `
uniform sampler2D uIcons;
uniform float uFill;
uniform float uIcon;
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.x, p.y) / 6.2831853;
  ang = fract(ang + 1.0);
  float ring = smoothstep(1.0, 0.94, r) * smoothstep(0.7, 0.76, r);
  float filled = step(ang, uFill);
  float disc = smoothstep(0.78, 0.72, r);
  vec4 ic = texture2D(uIcons, vec2((vUv.x - 0.5) * 1.1 + 0.5 + uIcon, vUv.y) * vec2(1.0 / 3.0, 1.0));
  vec3 col = vec3(0.04, 0.05, 0.08);
  col = mix(col, uColor, ic.a);
  vec3 ringCol = mix(vec3(0.22), uColor, filled);
  col = mix(col, ringCol, ring);
  float a = max(disc * 0.92, ring) * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

export function iconAtlas() {
  return canvasTexture(384, 128, (c) => {
    c.fillStyle = "white";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "bold 92px Georgia, 'Times New Roman', serif";
    c.fillText("?", 64, 70);
    c.fillText("!", 192, 70);
    c.font = "bold 64px Georgia, serif";
    c.fillText("z", 300, 80);
    c.font = "bold 46px Georgia, serif";
    c.fillText("z", 340, 44);
  });
}

/** A round badge over a guard's head: icon + awareness ring. Always faces the camera. */
export class Badge {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly color = new THREE.Color();

  constructor(atlas: THREE.Texture, size = 0.6) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: BADGE_FRAG,
        uniforms: { uIcons: { value: atlas }, uFill: { value: 0 }, uIcon: { value: 0 }, uColor: { value: this.color }, uOpacity: { value: 1 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.renderOrder = 20;
    this.mesh.frustumCulled = false;
  }

  /** icon: 0 "?", 1 "!", 2 "zz". */
  set(icon: number, fill: number, color: THREE.ColorRepresentation, opacity = 1) {
    const u = this.mesh.material.uniforms;
    u.uIcon.value = icon;
    u.uFill.value = fill;
    u.uOpacity.value = opacity;
    this.color.set(color);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// --- Noise rings -----------------------------------------------------------------------------------------

interface Ring {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  t: number;
  life: number;
  r: number;
  alpha: number;
}

/** Expanding rings on the floor: how far a sound carries. */
export class Rings {
  readonly group = new THREE.Group();
  private readonly rings: Ring[] = [];
  private readonly tex = ringTexture();
  private readonly geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

  constructor(count = 18) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.rings.push({ mesh, t: 0, life: 0, r: 1, alpha: 1 });
    }
  }

  spawn(x: number, z: number, r: number, color: THREE.ColorRepresentation, alpha = 0.8, life = 0.55) {
    let ring = this.rings.find((rg) => !rg.mesh.visible);
    if (!ring) ring = this.rings.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
    ring.t = 0;
    ring.life = life;
    ring.r = r;
    ring.alpha = alpha;
    ring.mesh.visible = true;
    ring.mesh.position.set(x, 0.05, z);
    ring.mesh.material.color.set(color);
  }

  update(dt: number) {
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      ring.t += dt;
      const k = ring.t / ring.life;
      if (k >= 1) {
        ring.mesh.visible = false;
        continue;
      }
      const s = ring.r * (0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
      ring.mesh.scale.setScalar(s);
      ring.mesh.material.opacity = ring.alpha * (1 - k) * (1 - k * 0.3);
    }
  }

  clear() {
    for (const ring of this.rings) ring.mesh.visible = false;
  }

  dispose() {
    this.tex.dispose();
    this.geo.dispose();
    for (const r of this.rings) r.mesh.material.dispose();
  }
}

// --- Floor decals & beams ---------------------------------------------------------------------------------

/** A flat additive light patch on the floor. */
export function floorGlow(tex: THREE.Texture, size: number, color: THREE.ColorRepresentation, opacity: number, y = 0.02) {
  const mesh = new THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  mesh.position.y = y;
  mesh.renderOrder = 1;
  return mesh;
}

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vLocal;
varying vec3 vNormalV;
void main() {
  float h = clamp(vLocal.y + 0.5, 0.0, 1.0);
  float a = uOpacity * (1.0 - h) * (0.35 + 0.65 * (1.0 - h));
  float facing = abs(vNormalV.z);
  a *= mix(0.25, 1.0, facing);
  gl_FragColor = vec4(uColor, a);
}`;

/** A soft shaft of light from above (moonlight through a skylight, the spotlight on the target). */
export function lightBeam(radiusTop: number, radiusBottom: number, height: number, color: THREE.ColorRepresentation, opacity: number) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, 1, 20, 1, true);
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vNormalV;
      void main() { vLocal = position; vNormalV = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: BEAM_FRAG,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(1, height, 1);
  mesh.position.y = height / 2;
  mesh.renderOrder = 4;
  return mesh;
}

// --- Laser beams -----------------------------------------------------------------------------------------

export const LASER_HEIGHTS = [0.2, 0.42, 0.64, 0.86];

/** The beams of one laser gate cell: thin hot cores plus soft glow. */
export class LaserBeams {
  readonly group = new THREE.Group();
  private readonly cores: THREE.Mesh[] = [];
  private readonly glows: THREE.Mesh[] = [];

  constructor(
    coreMat: THREE.MeshBasicMaterial,
    glowMat: THREE.MeshBasicMaterial,
    coreGeo: THREE.BufferGeometry,
    glowGeo: THREE.BufferGeometry,
  ) {
    for (const y of LASER_HEIGHTS) {
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = y;
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = y;
      glow.renderOrder = 5;
      this.cores.push(core);
      this.glows.push(glow);
      this.group.add(core, glow);
    }
  }

  /** 0 off, 1 on; values between flicker as a warning. */
  set(level: number, t: number) {
    const on = level >= 1;
    const warn = level > 0 && level < 1;
    const flick = warn ? (Math.sin(t * 40) > 0.2 ? 0.45 : 0.08) : on ? 1 : 0;
    for (let i = 0; i < this.cores.length; i++) {
      this.cores[i].visible = flick > 0.3;
      this.glows[i].visible = flick > 0;
      this.glows[i].scale.y = this.glows[i].scale.z = on ? 1 + Math.sin(t * 13 + i) * 0.12 : 0.6;
    }
  }
}

// --- Sparkles ---------------------------------------------------------------------------------------------

/** A small burst of glinting points (loot pickups, coin landings). */
export class Sparkles {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly base: Float32Array;
  private next = 0;
  private readonly tex: THREE.Texture;

  constructor(private readonly count = 160) {
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.tex = radialTexture();
    const mat = new THREE.PointsMaterial({ size: 0.22, map: this.tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  burst(x: number, y: number, z: number, color: THREE.ColorRepresentation, n = 24, speed = 2.2) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const a = Math.random() * Math.PI * 2;
      const up = 0.4 + Math.random() * 1.2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * s;
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.base[i * 3] = c.r;
      this.base[i * 3 + 1] = c.g;
      this.base[i * 3 + 2] = c.b;
      this.life[i] = 0.6 + Math.random() * 0.5;
    }
  }

  update(dt: number) {
    const { pos, vel, life, col, base } = this;
    for (let i = 0; i < this.count; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        pos[i * 3 + 1] = -100;
        continue;
      }
      vel[i * 3 + 1] -= 4.5 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] = Math.max(0.03, pos[i * 3 + 1] + vel[i * 3 + 1] * dt);
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = Math.min(1, life[i] * 2) * (0.6 + Math.random() * 0.4);
      col[i * 3] = base[i * 3] * f;
      col[i * 3 + 1] = base[i * 3 + 1] * f;
      col[i * 3 + 2] = base[i * 3 + 2] * f;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.count; i++) this.pos[i * 3 + 1] = -100;
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

// --- Markers ---------------------------------------------------------------------------------------------

/** Floor ring texture for the reticle / thief marker. */
export const makeRingTexture = ringTexture;

/** A flat chevron pointing along +z (rotate to aim). */
export function chevronGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.2);
  shape.lineTo(0.17, -0.06);
  shape.lineTo(0.07, -0.06);
  shape.lineTo(0, 0.06);
  shape.lineTo(-0.07, -0.06);
  shape.lineTo(-0.17, -0.06);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  // Shape is in XY with the tip at +y: lay it on the floor with the tip towards +z.
  geo.rotateX(Math.PI / 2);
  return geo;
}
