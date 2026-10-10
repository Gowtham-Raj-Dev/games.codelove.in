import * as THREE from "three";

/**
 * Procedural extras that aren't 3D objects: the aim line, the ball marker, the ball trail, confetti
 * and splashes. Everything is pre-allocated; nothing is created mid-play.
 */

const DOTS = 22;
const TRAIL = 48;
const CONFETTI = 220;
const DROPS = 48;

const LOW = new THREE.Color("#0f766e");
const MID = new THREE.Color("#0d9488");
const HIGH = new THREE.Color("#f59e0b");
const MAX = new THREE.Color("#e11d48");
const TAIL = new THREE.Color("#ffffff");

/** Colour of the aim line for a power of 0..1. */
export function powerColor(p: number, out = new THREE.Color()) {
  if (p < 0.45) return out.copy(LOW).lerp(MID, p / 0.45);
  if (p < 0.85) return out.copy(MID).lerp(HIGH, (p - 0.45) / 0.4);
  return out.copy(HIGH).lerp(MAX, (p - 0.85) / 0.15);
}

export class Effects {
  readonly root = new THREE.Group();
  private readonly dots: THREE.InstancedMesh;
  private readonly arrow: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  private readonly trail: THREE.Points;
  private readonly trailPos = new Float32Array(TRAIL * 3);
  private readonly trailAlpha = new Float32Array(TRAIL);
  private trailCount = 0;
  private trailFade = 0;
  private readonly confetti: THREE.InstancedMesh;
  private readonly bits: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; life: number }[] = [];
  private readonly drops: THREE.InstancedMesh;
  private readonly dropBits: { p: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  private readonly ring: THREE.Mesh;
  private ringT = -1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor() {
    const dotGeo = new THREE.CircleGeometry(0.021, 16).rotateX(-Math.PI / 2);
    this.dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }), DOTS);
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < DOTS; i++) this.dots.setColorAt(i, LOW);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;

    const tri = new THREE.Shape();
    tri.moveTo(0, 0.085);
    tri.lineTo(-0.055, 0);
    tri.lineTo(0.055, 0);
    tri.closePath();
    this.arrow = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.arrow.renderOrder = 3;

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.075, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
    );
    this.marker.renderOrder = 2;

    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute("alpha", new THREE.BufferAttribute(this.trailAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.trail = new THREE.Points(
      tg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { color: { value: new THREE.Color("#ffffff") }, scale: { value: 600 } },
        vertexShader: /* glsl */ `
          attribute float alpha; varying float vA; uniform float scale;
          void main() { vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = scale * 0.06 * (0.35 + 0.65 * alpha) / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 color; varying float vA;
          void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(color, vA * 0.55 * (1.0 - r * 4.0)); }`,
      }),
    );
    this.trail.frustumCulled = false;

    const bit = new THREE.PlaneGeometry(0.045, 0.026);
    this.confetti = new THREE.InstancedMesh(bit, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONFETTI);
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const palette = ["#f43f5e", "#facc15", "#22d3ee", "#a78bfa", "#34d399", "#fb923c", "#ffffff"].map((h) => new THREE.Color(h));
    for (let i = 0; i < CONFETTI; i++) {
      this.confetti.setColorAt(i, palette[i % palette.length]);
      this.bits.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
    }
    this.confetti.frustumCulled = false;
    this.confetti.count = 0;

    this.drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.022, 0), new THREE.MeshBasicMaterial({ color: "#e0fbff", transparent: true, opacity: 0.9 }), DROPS);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < DROPS; i++) this.dropBits.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 });
    this.drops.frustumCulled = false;
    this.drops.count = 0;

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
    this.ring.visible = false;

    this.root.add(this.dots, this.arrow, this.marker, this.trail, this.confetti, this.drops, this.ring);
    this.hideAim();
  }

  // --- Aim line ---------------------------------------------------------------------------------

  /** Dots from the ball along (dx, dz); `height(x, z)` gives the surface under each dot. */
  showAim(ball: THREE.Vector3, dx: number, dz: number, power: number, time: number, height: (x: number, z: number, y: number) => number) {
    const len = 0.25 + power * 2.1;
    const count = Math.max(3, Math.round((len / 2.35) * DOTS));
    const col = powerColor(power, this.c);
    let y = ball.y;
    const flow = (time * 1.6) % 1;
    for (let i = 0; i < DOTS; i++) {
      if (i >= count) {
        this.m.makeScale(0, 0, 0);
        this.dots.setMatrixAt(i, this.m);
        continue;
      }
      const t = (i + 0.4 + flow) / count;
      const d = 0.09 + t * len;
      const x = ball.x + dx * d;
      const z = ball.z + dz * d;
      y = height(x, z, y);
      const sc = 1 - t * 0.45;
      this.m.compose(this.s.set(x, y + 0.004, z), this.q.identity(), new THREE.Vector3(sc, 1, sc));
      this.dots.setMatrixAt(i, this.m);
      this.dots.setColorAt(i, this.c.copy(col).lerp(TAIL, t * 0.35));
    }
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
    this.dots.visible = true;
    const ex = ball.x + dx * (len + 0.14);
    const ez = ball.z + dz * (len + 0.14);
    this.arrow.position.set(ex, height(ex, ez, y) + 0.005, ez);
    this.arrow.rotation.y = Math.atan2(dx, dz);
    (this.arrow.material as THREE.MeshBasicMaterial).color.copy(col);
    this.arrow.visible = true;
  }

  hideAim() {
    this.dots.visible = false;
    this.arrow.visible = false;
  }

  /** A soft pulsing ring that makes the ball easy to find (and shows where to grab it). */
  showMarker(ball: THREE.Vector3, floorY: number, time: number, active: boolean) {
    this.marker.visible = true;
    this.marker.position.set(ball.x, floorY + 0.003, ball.z);
    const pulse = active ? 1.35 : 1 + Math.sin(time * 4) * 0.12;
    this.marker.scale.setScalar(pulse);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = active ? 0.95 : 0.55 + Math.sin(time * 4) * 0.2;
  }

  hideMarker() {
    this.marker.visible = false;
  }

  // --- Trail ------------------------------------------------------------------------------------

  /** Pixels per world unit at distance 1 (viewport height / (2 tan(fov / 2))). */
  setTrailScale(px: number) {
    (this.trail.material as THREE.ShaderMaterial).uniforms.scale.value = px;
  }

  pushTrail(p: THREE.Vector3) {
    if (this.trailCount < TRAIL) this.trailCount++;
    this.trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
    this.trailPos[0] = p.x;
    this.trailPos[1] = p.y;
    this.trailPos[2] = p.z;
    this.trailFade = 1;
  }

  clearTrail() {
    this.trailCount = 0;
    this.trailFade = 0;
  }

  // --- Celebrations -------------------------------------------------------------------------------

  /** A burst of confetti from a point (world). */
  confettiBurst(at: THREE.Vector3, amount = CONFETTI, power = 1) {
    let n = 0;
    for (const b of this.bits) {
      if (n >= amount) break;
      if (b.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const up = 2.2 + Math.random() * 2.6 * power;
      const out = 0.4 + Math.random() * 1.4 * power;
      b.p.copy(at);
      b.v.set(Math.cos(a) * out, up, Math.sin(a) * out);
      b.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      b.life = 2.6 + Math.random() * 1.6;
      n++;
    }
    this.confetti.count = CONFETTI;
  }

  splash(at: THREE.Vector3, waterY: number) {
    for (const d of this.dropBits) {
      const a = Math.random() * Math.PI * 2;
      const out = 0.3 + Math.random() * 1.1;
      d.p.set(at.x, waterY, at.z);
      d.v.set(Math.cos(a) * out, 1.6 + Math.random() * 2.4, Math.sin(a) * out);
      d.life = 1;
    }
    this.drops.count = DROPS;
    this.ring.position.set(at.x, waterY + 0.02, at.z);
    this.ring.visible = true;
    this.ringT = 0;
  }

  update(dt: number, camera: THREE.Camera) {
    // Trail fades once the ball stops adding to it.
    this.trailFade = Math.max(0, this.trailFade - dt * 0.6);
    for (let i = 0; i < TRAIL; i++) this.trailAlpha[i] = i < this.trailCount ? (1 - i / TRAIL) * this.trailFade : 0;
    const tg = this.trail.geometry;
    tg.attributes.position.needsUpdate = true;
    tg.attributes.alpha.needsUpdate = true;
    tg.setDrawRange(0, this.trailCount);

    if (this.confetti.count > 0) {
      let alive = 0;
      this.bits.forEach((b, i) => {
        if (b.life <= 0) {
          this.m.makeScale(0, 0, 0);
          this.confetti.setMatrixAt(i, this.m);
          return;
        }
        alive++;
        b.life -= dt;
        b.v.y -= 4.2 * dt;
        b.v.multiplyScalar(Math.exp(-1.6 * dt));
        b.v.x += Math.sin(b.life * 3 + i) * 0.6 * dt;
        b.p.addScaledVector(b.v, dt);
        b.r.x += b.w.x * dt;
        b.r.y += b.w.y * dt;
        b.r.z += b.w.z * dt;
        const sc = Math.min(1, b.life * 2);
        this.m.compose(b.p, this.q.setFromEuler(b.r), this.s.setScalar(sc));
        this.confetti.setMatrixAt(i, this.m);
      });
      this.confetti.instanceMatrix.needsUpdate = true;
      if (!alive) this.confetti.count = 0;
    }

    if (this.drops.count > 0) {
      let alive = 0;
      this.dropBits.forEach((d, i) => {
        if (d.life > 0) {
          alive++;
          d.life -= dt * 1.3;
          d.v.y -= 9.81 * dt;
          d.p.addScaledVector(d.v, dt);
        }
        this.m.compose(d.p, this.q.identity(), this.s.setScalar(d.life > 0 ? 0.6 + d.life * 0.6 : 0));
        this.drops.setMatrixAt(i, this.m);
      });
      this.drops.instanceMatrix.needsUpdate = true;
      if (!alive) this.drops.count = 0;
    }

    if (this.ringT >= 0) {
      this.ringT += dt;
      const k = this.ringT / 1.1;
      this.ring.scale.setScalar(0.1 + k * 0.9);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - k));
      if (k >= 1) {
        this.ringT = -1;
        this.ring.visible = false;
      }
    }
    void camera;
  }

  dispose() {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.geometry) return;
      mesh.geometry.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
    });
  }
}
