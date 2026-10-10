import * as THREE from "three";
import { makeProto, type LoadedModel } from "../shared/assets";
import type { Note } from "./chart";
import { M } from "./manifest";

/**
 * The note highway: a glowing four-lane glass runway whose beat lines scroll with the music, the
 * receptor buttons on the hit line (the Prototype Kit floor button — it really presses down), note
 * pucks (the Prototype Kit cylinder, recoloured per lane), hold tails, hit bursts and light columns.
 */

export const LANE_W = 0.62;
export const HIGHWAY_LEN = 9.5;
const WIDTH = LANE_W * 4 + 0.3;
const NOTE_Y = 0.07;

export const LANE_COLORS = ["#ff3dd5", "#9b6bff", "#2ee6ff", "#3dffb0"].map((c) => new THREE.Color(c));

export const laneX = (lane: number) => (lane - 1.5) * LANE_W;

export type NoteStatus = "pending" | "holding" | "done" | "missed" | "dropped";

export interface PlayNote extends Note {
  status: NoteStatus;
  /** Hold progress for holds released early (song time of the release). */
  cut: number;
}

interface View {
  note: PlayNote;
  head: THREE.Object3D;
  tail: THREE.Mesh | null;
  lane: number;
}

interface Particle {
  life: number;
  max: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  size: number;
}

const PARTICLES = 420;

export class Highway {
  readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private readonly receptors: { root: THREE.Object3D; button: THREE.Object3D | null; restY: number; mat: THREE.MeshStandardMaterial; press: number; flash: number }[] = [];
  private readonly notePools: THREE.Object3D[][] = [[], [], [], []];
  private readonly noteProtos: THREE.Object3D[] = [];
  private readonly tailGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
  private readonly tailMats: { idle: THREE.MeshBasicMaterial; held: THREE.MeshBasicMaterial }[] = [];
  private readonly deadTail = new THREE.MeshBasicMaterial({ color: "#3a3346", transparent: true, opacity: 0.55, depthWrite: false });
  private readonly tailPool: THREE.Mesh[] = [];
  private readonly views = new Map<number, View>();
  private readonly beams: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly pressed = [0, 0, 0, 0];
  private readonly particles: Particle[] = [];
  private readonly points: THREE.Points;
  private readonly pGeo = new THREE.BufferGeometry();
  private speed = 6;
  private noteHeight = 0.12;

  constructor(models: Map<string, LoadedModel>) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 6 },
        uBeat: { value: 0.5 },
        uLen: { value: HIGHWAY_LEN },
        uLane: { value: LANE_W },
        uPress: { value: new THREE.Vector4() },
        uHit: { value: 0 },
        uFever: { value: 0 },
        uColors: { value: LANE_COLORS },
      },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform float uTime, uSpeed, uBeat, uLen, uLane, uHit, uFever;
        uniform vec4 uPress;
        uniform vec3 uColors[4];
        varying vec2 vP;
        void main() {
          float d = -vP.y;
          float x = vP.x;
          float halfW = uLane * 2.0;
          // Glass body.
          vec3 col = mix(vec3(0.03, 0.01, 0.06), vec3(0.08, 0.02, 0.12), clamp(d / uLen, 0.0, 1.0));
          float alpha = 0.94;
          // Lane dividers.
          float lx = x / uLane + 2.0;
          float div = abs(fract(lx + 0.5) - 0.5) * uLane;
          col += vec3(0.6, 0.4, 1.0) * (1.0 - smoothstep(0.0, 0.016, div)) * 0.8 * step(abs(x), halfW - 0.01);
          // Side rails, pink and cyan.
          float edge = abs(x) - halfW;
          float rail = 1.0 - smoothstep(0.0, 0.05, abs(edge - 0.06));
          col += mix(vec3(1.0, 0.24, 0.84), vec3(0.18, 0.9, 1.0), step(0.0, x)) * rail * (1.6 + uHit * 1.4 + uFever);
          // Beat lines scroll with the music; bar lines are brighter.
          float t = uTime + d / max(uSpeed, 0.01);
          float b = t / uBeat;
          float f = fract(b);
          float dm = min(f, 1.0 - f) * uBeat * uSpeed;
          float isBar = step(mod(floor(b + 0.5), 4.0), 0.5);
          float line = (1.0 - smoothstep(0.0, mix(0.018, 0.03, isBar), dm)) * step(0.0, t) * step(edge, 0.0);
          col += mix(vec3(0.35, 0.2, 0.6), vec3(0.9, 0.5, 1.0), isBar) * line * (0.5 + 0.5 * isBar);
          // Pressed lanes light up from the hit line.
          int lane = int(clamp(floor(lx), 0.0, 3.0));
          float p = lane == 0 ? uPress.x : lane == 1 ? uPress.y : lane == 2 ? uPress.z : uPress.w;
          col += uColors[lane] * p * 0.55 * exp(-max(d, 0.0) * 0.45) * step(edge, 0.0);
          // Hit line.
          float hl = 1.0 - smoothstep(0.0, 0.035, abs(d));
          col += vec3(1.0, 0.85, 1.0) * hl * (1.2 + uHit) * step(edge, 0.0);
          // Fade out far away and just behind the line.
          alpha *= (1.0 - smoothstep(uLen - 2.6, uLen + 0.2, d)) * smoothstep(-0.9, -0.3, d);
          alpha = max(alpha, rail * 0.9 * (1.0 - smoothstep(uLen - 2.6, uLen + 0.2, d)));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH + 0.3, HIGHWAY_LEN + 1.2).rotateX(-Math.PI / 2).translate(0, 0, -(HIGHWAY_LEN + 1.2) / 2 + 0.9), this.mat);
    plane.renderOrder = 1;
    plane.frustumCulled = false;
    this.group.add(plane);

    this.buildReceptors(models);
    this.buildNotes(models);

    // Light columns and hit rings.
    const beamGeo = new THREE.PlaneGeometry(LANE_W * 0.9, 2.4).translate(0, 1.2, 0);
    const ringGeo = new THREE.RingGeometry(0.2, 0.3, 40).rotateX(-Math.PI / 2);
    for (let l = 0; l < 4; l++) {
      const beam = new THREE.Mesh(
        beamGeo,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { color: { value: LANE_COLORS[l] }, k: { value: 0 } },
          vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader:
            "uniform vec3 color; uniform float k; varying vec2 vUv; void main(){ float side = 1.0 - min(1.0, (vUv.x - 0.5) * (vUv.x - 0.5) * 4.0); gl_FragColor = vec4(color * k * max(side, 0.0) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6), 1.0); }",
        }),
      );
      beam.position.set(laneX(l), 0, 0);
      beam.renderOrder = 6;
      this.beams.push(beam);
      this.group.add(beam);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: LANE_COLORS[l], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ring.position.set(laneX(l), 0.06, 0);
      ring.renderOrder = 6;
      this.rings.push(ring);
      this.group.add(ring);
      this.tailMats.push({
        idle: new THREE.MeshBasicMaterial({ color: LANE_COLORS[l].clone().multiplyScalar(0.55), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
        held: new THREE.MeshBasicMaterial({ color: LANE_COLORS[l].clone().multiplyScalar(1.6), transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }),
      });
    }

    // Spark particles.
    const pos = new Float32Array(PARTICLES * 3);
    const col = new Float32Array(PARTICLES * 3);
    const size = new Float32Array(PARTICLES);
    this.pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.pGeo.setAttribute("size", new THREE.BufferAttribute(size, 1));
    this.points = new THREE.Points(
      this.pGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
        uniforms: { scale: { value: 300 } },
        vertexShader:
          "attribute float size; varying vec3 vC; uniform float scale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float a = 1.0 - smoothstep(0.0, 0.5, length(c)); gl_FragColor = vec4(vC * a * a, 1.0); }",
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.group.add(this.points);
    for (let i = 0; i < PARTICLES; i++) this.particles.push({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(), size: 0 });
  }

  private buildReceptors(models: Map<string, LoadedModel>) {
    const m = models.get(M.receptor);
    for (let l = 0; l < 4; l++) {
      if (!m) break;
      const proto = makeProto(m.scene.clone(), m.animations, { width: LANE_W * 0.86 }, { shadows: false, receive: false });
      const root = proto.object;
      root.position.set(laneX(l), -proto.size.y * 0.55, 0);
      const mat = new THREE.MeshStandardMaterial({ color: LANE_COLORS[l], emissive: LANE_COLORS[l], emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1 });
      const body = new THREE.MeshStandardMaterial({ color: "#2b2238", roughness: 0.5, metalness: 0.4 });
      const button = root.getObjectByName("button") ?? null;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        let inButton = false;
        for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (p === button) inButton = true;
        mesh.material = inButton ? mat : body;
      });
      this.group.add(root);
      this.receptors.push({ root, button, restY: button?.position.y ?? 0, mat, press: 0, flash: 0 });
    }
  }

  private buildNotes(models: Map<string, LoadedModel>) {
    const m = models.get(M.note);
    const gem = models.get(M.gem);
    for (let l = 0; l < 4; l++) {
      const holder = new THREE.Group();
      if (m) {
        const puck = makeProto(m.scene.clone(), [], { box: { x: LANE_W * 0.82, y: 0.13, z: 0.3 } }, { shadows: false });
        this.noteHeight = puck.size.y;
        const mat = new THREE.MeshStandardMaterial({ color: LANE_COLORS[l], emissive: LANE_COLORS[l], emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.2 });
        puck.object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
        });
        holder.add(puck.object);
      }
      if (gem) {
        const g = makeProto(gem.scene.clone(), [], { height: 0.2 }, { shadows: false });
        const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: LANE_COLORS[l].clone().lerp(new THREE.Color("#ffffff"), 0.6), emissiveIntensity: 0.9, roughness: 0.15 });
        g.object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
        });
        g.object.position.y = this.noteHeight - 0.02;
        g.object.scale.y = 0.55;
        g.object.name = "gem";
        holder.add(g.object);
      }
      this.noteProtos.push(holder);
    }
  }

  setSpeed(speed: number, beat: number) {
    this.speed = speed;
    this.mat.uniforms.uSpeed.value = speed;
    this.mat.uniforms.uBeat.value = beat;
  }

  /** Visual press state for a lane (0..1). */
  press(lane: number, down: boolean) {
    this.pressed[lane] = down ? 1 : 0;
  }

  /** A note was hit: flash, ring, light column and sparks. */
  burst(lane: number, strength: number) {
    const r = this.receptors[lane];
    if (r) r.flash = 1;
    const ring = this.rings[lane];
    ring.scale.setScalar(0.6);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * strength + 0.1;
    (this.beams[lane].material as THREE.ShaderMaterial).uniforms.k.value = 0.6 + strength * 0.6;
    this.spark(lane, Math.round(10 + strength * 14), strength);
  }

  spark(lane: number, count: number, strength = 1) {
    const color = LANE_COLORS[lane];
    for (let i = 0; i < count; i++) {
      const p = this.particles.find((q) => q.life <= 0);
      if (!p) return;
      p.max = p.life = 0.35 + Math.random() * 0.4;
      p.pos.set(laneX(lane) + (Math.random() - 0.5) * LANE_W * 0.6, 0.12, (Math.random() - 0.5) * 0.15);
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 2.2 * strength;
      p.vel.set(Math.cos(a) * s * 0.6, 1.5 + Math.random() * 3 * strength, Math.sin(a) * s * 0.4 - 0.4);
      p.color.copy(color).lerp(WHITE, Math.random() * 0.5);
      p.size = 0.05 + Math.random() * 0.07;
    }
  }

  // --- Notes ------------------------------------------------------------------------------------------

  private acquire(lane: number) {
    const obj = this.notePools[lane].pop() ?? this.noteProtos[lane].clone();
    obj.visible = true;
    this.group.add(obj);
    return obj;
  }

  private acquireTail() {
    const t = this.tailPool.pop() ?? new THREE.Mesh(this.tailGeo, this.deadTail);
    t.renderOrder = 2;
    t.frustumCulled = false;
    this.group.add(t);
    return t;
  }

  private releaseView(v: View) {
    v.head.removeFromParent();
    this.notePools[v.lane].push(v.head);
    if (v.tail) {
      v.tail.removeFromParent();
      this.tailPool.push(v.tail);
    }
    this.views.delete(v.note.id);
  }

  /** Places every note between the hit line and the far end of the highway. */
  sync(notes: PlayNote[], from: number, songTime: number, lookahead: number) {
    const seen = new Set<number>();
    for (let i = from; i < notes.length; i++) {
      const n = notes[i];
      if (n.time - songTime > lookahead) break;
      const finished = n.status === "done" || ((n.status === "missed" || n.status === "dropped") && (n.hold ? n.end : n.time) < songTime - 0.6);
      if (finished) continue;
      seen.add(n.id);
      let v = this.views.get(n.id);
      if (!v) {
        v = { note: n, head: this.acquire(n.lane), tail: n.hold ? this.acquireTail() : null, lane: n.lane };
        this.views.set(n.id, v);
      }
      const holding = n.status === "holding";
      const headTime = holding ? songTime : n.status === "dropped" ? Math.max(n.time, n.cut) : n.time;
      const d = (headTime - songTime) * this.speed;
      v.head.position.set(laneX(n.lane), NOTE_Y, -d);
      const dim = n.status === "missed" || n.status === "dropped";
      v.head.visible = n.status !== "dropped";
      v.head.scale.setScalar(holding ? 1.08 + Math.sin(songTime * 40) * 0.04 : dim ? 0.85 : 1);
      const gemObj = v.head.getObjectByName("gem");
      if (gemObj) gemObj.rotation.y = songTime * 3 + n.lane;
      if (v.tail) {
        const startD = Math.max(d, holding ? 0 : d);
        const endD = Math.min((n.end - songTime) * this.speed, HIGHWAY_LEN + 1);
        const len = Math.max(0.001, endD - startD);
        v.tail.position.set(laneX(n.lane), NOTE_Y * 0.5, -startD);
        v.tail.scale.set(LANE_W * 0.32, 1, len);
        v.tail.material = dim ? this.deadTail : holding ? this.tailMats[n.lane].held : this.tailMats[n.lane].idle;
        v.tail.visible = endD > startD;
      }
      setDim(v.head, dim);
    }
    for (const v of [...this.views.values()]) if (!seen.has(v.note.id)) this.releaseView(v);
  }

  clear() {
    for (const v of [...this.views.values()]) this.releaseView(v);
    for (const p of this.particles) p.life = 0;
  }

  update(dt: number, songTime: number, hit: number, fever: number) {
    const u = this.mat.uniforms;
    u.uTime.value = songTime;
    u.uHit.value = hit;
    u.uFever.value = fever;
    for (let l = 0; l < 4; l++) {
      const r = this.receptors[l];
      const target = this.pressed[l];
      const cur = (u.uPress.value as THREE.Vector4).getComponent(l);
      (u.uPress.value as THREE.Vector4).setComponent(l, THREE.MathUtils.damp(cur, target, target > cur ? 40 : 12, dt));
      if (r) {
        r.press = THREE.MathUtils.damp(r.press, target, 30, dt);
        r.flash = Math.max(0, r.flash - dt * 4);
        if (r.button) r.button.position.y = r.restY - r.press * 0.06;
        r.mat.emissiveIntensity = 0.35 + r.press * 0.8 + r.flash * 2.2 + hit * 0.25;
      }
      const ring = this.rings[l];
      const rm = ring.material as THREE.MeshBasicMaterial;
      if (rm.opacity > 0) {
        ring.scale.multiplyScalar(1 + dt * 5);
        rm.opacity = Math.max(0, rm.opacity - dt * 3.2);
      }
      const bu = (this.beams[l].material as THREE.ShaderMaterial).uniforms.k;
      bu.value = Math.max(this.pressed[l] * 0.18, bu.value - dt * 3);
    }
    // Particles.
    const pos = this.pGeo.attributes.position as THREE.BufferAttribute;
    const col = this.pGeo.attributes.color as THREE.BufferAttribute;
    const size = this.pGeo.attributes.size as THREE.BufferAttribute;
    this.particles.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 7 * dt;
        p.pos.addScaledVector(p.vel, dt);
      }
      const k = Math.max(0, p.life / p.max);
      pos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
      col.setXYZ(i, p.color.r * k, p.color.g * k, p.color.b * k);
      size.setX(i, p.life > 0 ? p.size : 0);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    size.needsUpdate = true;
  }

  /** Point size scale for the current viewport height. */
  setViewport(height: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = height * 0.9;
  }

}

const WHITE = new THREE.Color("#ffffff");

function setDim(obj: THREE.Object3D, dim: boolean) {
  if (obj.userData.dim === dim) return;
  obj.userData.dim = dim;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (dim) {
      mesh.userData.mat ??= mesh.material;
      mesh.material = DIM;
    } else if (mesh.userData.mat) mesh.material = mesh.userData.mat;
  });
}

const DIM = new THREE.MeshStandardMaterial({ color: "#3b3546", roughness: 0.6 });
