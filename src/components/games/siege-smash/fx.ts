import * as THREE from "three";

/**
 * Procedural effects: debris chips, dust and smoke puffs, explosion flashes, floating score text and
 * the aiming dots. Everything is pooled — nothing is allocated while playing.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const DEBRIS_COLORS = {
  stone: ["#e8c7a0", "#d9ae86", "#c99a74", "#f1d6b4"],
  wood: ["#c9733f", "#b5612f", "#de8a52"],
  roof: ["#5b6fd6", "#7183e6", "#e8c7a0"],
  powder: ["#c9733f", "#3b3b46", "#f59e0b"],
  iron: ["#3f4552", "#5a6170"],
  bone: ["#f2ead8", "#d8ccb4"],
} as const;

// --- Debris -----------------------------------------------------------------------------------------

const MAX_DEBRIS = 420;

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(MAX_DEBRIS * 3);
  private readonly vel = new Float32Array(MAX_DEBRIS * 3);
  private readonly rot = new Float32Array(MAX_DEBRIS * 3);
  private readonly spin = new Float32Array(MAX_DEBRIS * 3);
  private readonly size = new Float32Array(MAX_DEBRIS);
  private readonly life = new Float32Array(MAX_DEBRIS);
  private readonly maxLife = new Float32Array(MAX_DEBRIS);
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(parent: THREE.Object3D) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX_DEBRIS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = MAX_DEBRIS;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DEBRIS; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.c.set("#ffffff"));
    }
    parent.add(this.mesh);
  }

  /** Bursts `count` chips from a point. */
  burst(at: THREE.Vector3, count: number, palette: readonly string[], { speed = 5, size = 0.22, up = 3, spread = 0.4 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_DEBRIS;
      this.pos[i * 3] = at.x + rand(-spread, spread);
      this.pos[i * 3 + 1] = at.y + rand(-spread, spread);
      this.pos[i * 3 + 2] = at.z + rand(-spread, spread);
      const a = Math.random() * Math.PI * 2;
      const sp = rand(0.3, 1) * speed;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = rand(0.3, 1) * up + rand(0, speed * 0.4);
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      for (let k = 0; k < 3; k++) {
        this.rot[i * 3 + k] = Math.random() * 6;
        this.spin[i * 3 + k] = rand(-9, 9);
      }
      this.size[i] = size * rand(0.5, 1.3);
      this.maxLife[i] = this.life[i] = rand(1.4, 2.6);
      this.mesh.setColorAt(i, this.c.set(palette[Math.floor(Math.random() * palette.length)]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, gravity: number) {
    const { pos, vel, rot, spin } = this;
    for (let i = 0; i < MAX_DEBRIS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      vel[i * 3 + 1] -= gravity * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const half = this.size[i] * 0.5;
      if (pos[i * 3 + 1] < half) {
        pos[i * 3 + 1] = half;
        vel[i * 3 + 1] *= -0.3;
        vel[i * 3] *= 0.6;
        vel[i * 3 + 2] *= 0.6;
        for (let k = 0; k < 3; k++) spin[i * 3 + k] *= 0.6;
      }
      for (let k = 0; k < 3; k++) rot[i * 3 + k] += spin[i * 3 + k] * dt;
      const fade = Math.min(1, this.life[i] / 0.5);
      const sc = this.life[i] > 0 ? this.size[i] * fade : 0;
      this.q.setFromEuler(this.e.set(rot[i * 3], rot[i * 3 + 1], rot[i * 3 + 2]));
      this.m.compose(this.v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), this.q, this.s.set(sc, sc * 0.8, sc));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.update(0, 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// --- Puffs (dust, smoke, fire) -----------------------------------------------------------------------

const MAX_PUFFS = 260;

function puffTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Puffs {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(MAX_PUFFS * 3);
  private readonly col = new Float32Array(MAX_PUFFS * 3);
  private readonly sizeAttr = new Float32Array(MAX_PUFFS);
  private readonly alphaAttr = new Float32Array(MAX_PUFFS);
  private readonly vel = new Float32Array(MAX_PUFFS * 3);
  private readonly life = new Float32Array(MAX_PUFFS);
  private readonly maxLife = new Float32Array(MAX_PUFFS);
  private readonly grow = new Float32Array(MAX_PUFFS);
  private readonly base = new Float32Array(MAX_PUFFS);
  private readonly opacity = new Float32Array(MAX_PUFFS);
  private next = 0;
  private readonly tex = puffTexture();
  private readonly c = new THREE.Color();
  readonly material: THREE.ShaderMaterial;

  constructor(parent: THREE.Object3D) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("size", new THREE.BufferAttribute(this.sizeAttr, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("alpha", new THREE.BufferAttribute(this.alphaAttr, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: this.tex }, scale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor; uniform float scale;
        void main() {
          vAlpha = alpha; vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * vAlpha);
          if (gl_FragColor.a < 0.01) discard;
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    parent.add(this.points);
  }

  /** Pixels per metre at 1 m — call on resize. */
  setScale(heightPx: number, fovDeg: number) {
    this.material.uniforms.scale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(at: THREE.Vector3, count: number, { color = "#e9dcc8", size = 1.6, grow = 1.6, speed = 1.6, up = 0.8, life = 1.4, opacity = 0.75, spread = 0.5 } = {}) {
    this.c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_PUFFS;
      this.pos[i * 3] = at.x + rand(-spread, spread);
      this.pos[i * 3 + 1] = at.y + rand(-spread, spread) * 0.6;
      this.pos[i * 3 + 2] = at.z + rand(-spread, spread);
      const a = Math.random() * Math.PI * 2;
      const sp = rand(0.3, 1) * speed;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = rand(0.2, 1) * up;
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      const shade = rand(0.88, 1.06);
      this.col[i * 3] = Math.min(1, this.c.r * shade);
      this.col[i * 3 + 1] = Math.min(1, this.c.g * shade);
      this.col[i * 3 + 2] = Math.min(1, this.c.b * shade);
      this.base[i] = size * rand(0.7, 1.2);
      this.grow[i] = grow;
      this.maxLife[i] = this.life[i] = life * rand(0.75, 1.25);
      this.opacity[i] = opacity;
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PUFFS; i++) {
      if (this.life[i] <= 0) {
        this.alphaAttr[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const drag = Math.exp(-2.2 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + 0.25 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.sizeAttr[i] = this.base[i] * (1 + t * this.grow[i]);
      this.alphaAttr[i] = this.opacity[i] * Math.min(1, t * 8) * (1 - t) * (1 - t);
    }
    for (const name of ["position", "color", "size", "alpha"]) this.geo.getAttribute(name).needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.update(0);
  }

  dispose() {
    this.geo.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}

// --- Explosion flashes ------------------------------------------------------------------------------

export class Flashes {
  private readonly items: { mesh: THREE.Mesh; light: THREE.PointLight; t: number; size: number }[] = [];

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.visible = false;
      const light = new THREE.PointLight("#ffb347", 0, 18, 1.8);
      parent.add(mesh, light);
      this.items.push({ mesh, light, t: 1, size: 1 });
    }
  }

  spawn(at: THREE.Vector3, size: number) {
    const item = this.items.reduce((a, b) => (a.t > b.t ? a : b));
    item.t = 0;
    item.size = size;
    item.mesh.position.copy(at);
    item.light.position.copy(at);
    item.mesh.visible = true;
  }

  update(dt: number) {
    for (const it of this.items) {
      if (it.t >= 1) continue;
      it.t = Math.min(1, it.t + dt / 0.38);
      const k = it.t;
      it.mesh.scale.setScalar(it.size * (0.3 + Math.pow(k, 0.35) * 0.9));
      const mat = it.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.pow(1 - k, 2.2) * 0.95;
      mat.color.setRGB(1, 0.78 - k * 0.5, 0.32 - k * 0.3);
      it.light.intensity = (1 - k) * (1 - k) * 140;
      if (it.t >= 1) {
        it.mesh.visible = false;
        it.light.intensity = 0;
      }
    }
  }

  clear() {
    for (const it of this.items) {
      it.t = 1;
      it.mesh.visible = false;
      it.light.intensity = 0;
    }
  }

  dispose() {
    this.items[0]?.mesh.geometry.dispose();
    for (const it of this.items) (it.mesh.material as THREE.Material).dispose();
  }
}

// --- Floating score text ----------------------------------------------------------------------------

export class Popups {
  private readonly items: { sprite: THREE.Sprite; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; t: number; base: THREE.Vector3; w: number; h: number }[] = [];

  constructor(parent: THREE.Object3D) {
    for (let i = 0; i < 10; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 112;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      sprite.visible = false;
      sprite.renderOrder = 10;
      parent.add(sprite);
      this.items.push({ sprite, canvas, tex, t: 1, base: new THREE.Vector3(), w: 1, h: 1 });
    }
  }

  show(at: THREE.Vector3, text: string, { color = "#d9f99d", big = false } = {}) {
    const item = this.items.reduce((a, b) => (a.t > b.t ? a : b));
    const g = item.canvas.getContext("2d")!;
    g.clearRect(0, 0, 320, 112);
    g.font = `${big ? 64 : 52}px MedievalSharp, Georgia, serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 12;
    g.strokeStyle = "#1a2e05";
    g.strokeText(text, 160, 58);
    g.fillStyle = color;
    g.fillText(text, 160, 58);
    item.tex.needsUpdate = true;
    item.t = 0;
    item.base.copy(at);
    item.sprite.visible = true;
    item.w = big ? 3.6 : 2.9;
    item.h = big ? 1.26 : 1.02;
    item.sprite.scale.set(item.w * 0.5, item.h * 0.5, 1);
  }

  update(dt: number) {
    for (const it of this.items) {
      if (it.t >= 1) continue;
      it.t = Math.min(1, it.t + dt / 1.5);
      const k = it.t;
      it.sprite.position.set(it.base.x, it.base.y + 0.6 + k * 1.6, it.base.z);
      const pop = k < 0.12 ? 0.5 + (k / 0.12) * 0.6 : k < 0.2 ? 1.1 - ((k - 0.12) / 0.08) * 0.1 : 1;
      it.sprite.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
      it.sprite.scale.set(it.w * pop, it.h * pop, 1);
      if (it.t >= 1) it.sprite.visible = false;
    }
  }

  clear() {
    for (const it of this.items) {
      it.t = 1;
      it.sprite.visible = false;
    }
  }

  dispose() {
    for (const it of this.items) {
      it.tex.dispose();
      it.sprite.material.dispose();
    }
  }
}

// --- Aiming dots ------------------------------------------------------------------------------------

export class Dots {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  count = 0;

  constructor(parent: THREE.Object3D, max: number, color: string, opacity: number, radius: number) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(radius, 10, 8),
      new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }),
      max,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  set(points: THREE.Vector3[], scaleFn?: (i: number) => number) {
    const max = this.mesh.instanceMatrix.count;
    this.count = Math.min(points.length, max);
    for (let i = 0; i < this.count; i++) {
      const s = scaleFn ? scaleFn(i) : 1;
      this.m.makeScale(s, s, s).setPosition(points[i]);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
