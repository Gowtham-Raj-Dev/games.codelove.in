import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { recordRestPose, retarget } from "@/lib/retarget";
import { makeProto, type LoadedModel, type Proto } from "../shared/assets";
import { ARCADE, CLIPS, CROWD, DANCERS, M, clipKey, type ClipName } from "./manifest";

/**
 * The club: a light-up dance floor, arcade machines along the walls, a giant dance machine as the
 * stage with the lead dancer on it, neon frames, a lighting truss with moving spots, and a small
 * crowd either side of the note highway. Everything that moves on the music reads a Pulse.
 */

export interface Pulse {
  /** Beats since the song started (fractional). */
  beat: number;
  /** 1 on the beat, decaying to 0 before the next one. */
  hit: number;
  /** 0..1 how well the player is doing (drives light intensity and dance speed). */
  energy: number;
  fever: boolean;
  /** Seconds, frozen while paused. */
  time: number;
}

export type Mood = "menu" | "warm" | "groove" | "hype" | "fever" | "sad" | "win";

export const PALETTE = ["#ff3df2", "#22e6ff", "#8b5cf6", "#ffb020"].map((c) => new THREE.Color(c));
export const STAGE_Z = -11.4;
const FLOOR_TILE = 1.25;
const BARS = 14;

interface Rig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<ClipName, THREE.AnimationAction>;
  current: ClipName | null;
  /** Per-member variety. */
  phase: number;
  speed: number;
  /** Time not yet applied (crowd members update every other frame). */
  acc: number;
}

interface Spot {
  light: THREE.SpotLight;
  cone: THREE.Mesh;
  base: THREE.Vector3;
  color: THREE.Color;
  sweep: number;
}

const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

export class Club {
  readonly group = new THREE.Group();
  readonly dancerSpot: THREE.SpotLight;
  private floor: THREE.InstancedMesh | null = null;
  private floorCells: { x: number; z: number; d: number; lane: number }[] = [];
  private readonly neon: { mat: THREE.MeshBasicMaterial; color: THREE.Color; phase: number }[] = [];
  private readonly spinners: { obj: THREE.Object3D; speed: THREE.Vector3 }[] = [];
  private readonly spots: Spot[] = [];
  private readonly lasers: THREE.Mesh[] = [];
  private readonly laserGroup = new THREE.Group();
  private wheel: THREE.Object3D | null = null;
  private wheelSpeed = 0;
  private dancers: Rig[] = [];
  private crowd: Rig[] = [];
  private dancerIndex = 0;
  private mood: Mood = "menu";
  private readonly dancerHolder = new THREE.Group();
  private stageTop = 0;
  private pattern = 0;
  private lastBar = -1;
  private lastBeat = -1;
  private feverMix = 0;
  private frameNo = 0;
  private readonly speakers: THREE.Object3D[] = [];
  private readonly bars = new Float32Array(BARS);
  private readonly barTargets = new Float32Array(BARS);
  private readonly screenMat = new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      axisU: { value: new THREE.Vector3(1, 0, 0) },
      axisV: { value: new THREE.Vector3(0, 1, 0) },
      range: { value: new THREE.Vector4(0, 1, 0, 1) },
      bars: { value: new Float32Array(BARS) },
      hit: { value: 0 },
      fever: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: /* glsl */ `
      uniform vec3 axisU, axisV;
      uniform vec4 range;
      uniform float bars[${BARS}];
      uniform float hit, fever, time;
      varying vec3 vP;
      void main() {
        vec2 uv = vec2((dot(vP, axisU) - range.x) / range.y, (dot(vP, axisV) - range.z) / range.w);
        float side = abs(uv.x - 0.5) * 2.0;
        float fi = side * ${BARS}.0;
        int i = int(min(floor(fi), ${BARS - 1}.0));
        float fx = fract(fi);
        float h = bars[i];
        float y = uv.y;
        float bar = step(y, 0.06 + h * 0.86) * step(0.14, fx) * step(fx, 0.86) * step(0.25, fract(y * 26.0));
        vec3 pink = vec3(1.0, 0.12, 0.7);
        vec3 cyan = vec3(0.06, 0.7, 1.0);
        vec3 gold = vec3(1.0, 0.82, 0.25);
        vec3 c = mix(cyan, pink, smoothstep(0.1, 0.8, y));
        c = mix(c, gold, fever * step(0.7, y));
        float ring = (1.0 - smoothstep(0.0, 0.03, abs(length((uv - 0.5) * vec2(1.9, 1.0)) - (0.15 + fract(time * 0.5) * 0.6)))) * 0.25;
        vec3 bg = vec3(0.05, 0.01, 0.09) + vec3(0.25, 0.05, 0.35) * hit * 0.25 + pink * ring;
        bg *= 0.75 + 0.25 * step(0.5, fract(y * 120.0));
        gl_FragColor = vec4(bg + c * bar * (0.32 + hit * 0.22 + fever * 0.3), 1.0);
      }
    `,
  });

  constructor(private readonly models: Map<string, LoadedModel>) {
    this.dancerSpot = new THREE.SpotLight("#ffe4f6", 60, 22, 0.32, 0.6, 1.4);
    this.build();
  }

  private proto(key: string, fit: Parameters<typeof makeProto>[2], opts?: { shadows?: boolean; receive?: boolean }): Proto | null {
    const m = this.models.get(key);
    if (!m) return null;
    return makeProto(m.scene.clone(), m.animations, fit, { shadows: false, ...opts });
  }

  private place(key: string, fit: Parameters<typeof makeProto>[2], x: number, y: number, z: number, rotY = 0, opts?: { shadows?: boolean; receive?: boolean }) {
    const p = this.proto(key, fit, opts);
    if (!p) return null;
    p.object.position.set(x, y, z);
    p.object.rotation.y = rotY;
    this.group.add(p.object);
    return p;
  }

  // --- Build ------------------------------------------------------------------------------------------

  private build() {
    this.buildFloor();
    this.buildWalls();
    this.buildStage();
    this.buildRig();
    this.buildLasers();
    this.buildPeople();
  }

  /** The light-up floor: one instanced copy of the arcade floor tile, coloured per tile on the beat. */
  private buildFloor() {
    const p = this.proto(M.floor, { box: { x: FLOOR_TILE, z: FLOOR_TILE, y: 0.04 } }, { shadows: false, receive: true });
    if (!p) return;
    const mesh = firstMesh(p.object);
    if (!mesh) return;
    p.object.updateMatrixWorld(true);
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const src = mesh.material as THREE.MeshStandardMaterial;
    const mat = new THREE.MeshStandardMaterial({ map: src.map, color: "#2a2333", roughness: 0.32, metalness: 0.35 });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <color_fragment>", "")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor * 1.6;\n#endif");
    };
    const cols = 15;
    const rows = 17;
    const mesh2 = new THREE.InstancedMesh(geo, mat, cols * rows);
    mesh2.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * FLOOR_TILE;
        const z = 4 - r * FLOOR_TILE;
        m4.makeTranslation(x, 0, z);
        mesh2.setMatrixAt(i, m4);
        mesh2.setColorAt(i, new THREE.Color(0, 0, 0));
        this.floorCells.push({ x, z, d: Math.hypot(x, z - STAGE_Z), lane: c });
        i++;
      }
    }
    this.floor = mesh2;
    this.group.add(mesh2);
  }

  private buildWalls() {
    const h = 3.4;
    const back = STAGE_Z - 3.6;
    // Back wall: arcade wall panels scaled up, windows in between.
    for (let i = -3; i <= 3; i++) {
      const key = Math.abs(i) === 2 ? M.wallWindow : M.wall;
      this.place(key, { box: { x: 3, y: h, z: 0.9 } }, i * 3, 0, back, 0, { receive: true });
    }
    // Side walls with arcade machines in front.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const z = back + 1.5 + k * 3;
        this.place(k === 3 ? M.wallWindow : M.wall, { box: { x: 3, y: h, z: 0.9 } }, side * 10.4, 0, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, { receive: true });
      }
      this.place(M.wallCorner, { box: { x: 1.2, y: h, z: 1.2 } }, side * 10.2, 0, back, 0);
    }
    const machines = ARCADE.filter((k) => this.models.has(k));
    let n = 0;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const key = machines[n++ % machines.length];
        const z = -1.2 - k * 2.6;
        const p = this.place(key, { scale: 2.3 }, 0, 0, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, { receive: true });
        if (p) p.object.position.x = side * (9.6 - p.size.z / 2);
      }
    }
    // Pillars framing the stage.
    for (const side of [-1, 1]) this.place(M.column, { box: { x: 0.8, y: 3.2, z: 0.8 } }, side * 6.0, 0, STAGE_Z + 1.6, 0);
  }

  private buildStage() {
    // A round sci-fi podium for the dancer.
    const podium = this.place(M.podium, { width: 3.6 }, 0, 0, STAGE_Z, 0, { receive: true });
    this.stageTop = podium ? podium.size.y : 0.4;
    this.dancerHolder.position.set(0, this.stageTop, STAGE_Z);
    this.group.add(this.dancerHolder);

    // A giant LED wall behind the stage, its panel turned into a beat visualizer.
    const screen = this.place(M.screen, { width: 8.4 }, 0, 1.15, STAGE_Z - 2.9, 0, { shadows: false });
    if (screen) {
      screen.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const idx = mats.findIndex((m) => /emissive|white/i.test(m.name));
        if (idx < 0) return;
        // The panel's own axes may be rotated by the model's node: find which local axis points
        // right and which points up in the world, then map the panel to 0..1 along them.
        screen.object.updateMatrixWorld(true);
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        const rot = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld);
        const world = [0, 1, 2].map((i) => new THREE.Vector3().setComponent(i, 1).applyMatrix3(rot));
        const pick = (c: "x" | "y") => [0, 1, 2].reduce((a, b) => (Math.abs(world[b][c]) > Math.abs(world[a][c]) ? b : a), 0);
        const axis = (i: number, c: "x" | "y") => new THREE.Vector3().setComponent(i, Math.sign(world[i][c]) || 1);
        const u = axis(pick("x"), "x");
        const v = axis(pick("y"), "y");
        const span = (a: THREE.Vector3) => {
          const vals = [box.min.dot(a), box.max.dot(a)];
          return [Math.min(...vals), Math.abs(vals[1] - vals[0]) || 1];
        };
        const [u0, us] = span(u);
        const [v0, vs] = span(v);
        this.screenMat.uniforms.axisU.value.copy(u);
        this.screenMat.uniforms.axisV.value.copy(v);
        this.screenMat.uniforms.range.value.set(u0, us, v0, vs);
        const next = [...mats];
        next[idx] = this.screenMat;
        mesh.material = Array.isArray(mesh.material) ? next : this.screenMat;
      });
    }

    // Speakers.
    for (const side of [-1, 1]) {
      const p = this.place(M.speaker, { height: 2.6 }, side * 3.3, 0, STAGE_Z + 0.4, side * -0.3);
      if (p) {
        tint(p.object, "#1c1726", 0.4);
        this.speakers.push(p.object);
      }
    }

    // Neon frames: a halo over the dancer, triangles either side, spinning cubes above.
    const ring = this.place(M.ring, { width: 4.2 }, 0, 4.9, STAGE_Z);
    if (ring) this.neonify(ring.object, PALETTE[0], 0);
    for (const side of [-1, 1]) {
      const tri = this.place(M.triangle, { width: 2.4 }, side * 5.2, 0, STAGE_Z - 2.6);
      if (tri) {
        tri.object.rotation.set(Math.PI / 2, 0, side * 0.2);
        tri.object.position.y = 2.2;
        this.neonify(tri.object, PALETTE[1], side > 0 ? 0.5 : 0.25);
      }
      const cube = this.place(M.cube, { width: 1.1 }, side * 2.6, 0, STAGE_Z + 0.4);
      if (cube) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 2.6, 4.6, STAGE_Z + 0.4);
        cube.object.position.set(0, -0.55, 0);
        pivot.add(cube.object);
        this.group.add(pivot);
        this.neonify(cube.object, PALETTE[2], side > 0 ? 0.75 : 0);
        this.spinners.push({ obj: pivot, speed: new THREE.Vector3(0.4, side * 0.7, 0.25) });
      }
    }

    // Prize wheel beside the stage, spinning faster as the combo grows.
    const wheel = this.place(M.prizeWheel, { height: 2.6 }, 6.9, 0, STAGE_Z + 0.8, -0.5);
    if (wheel) this.wheel = wheel.object.getObjectByName("rotate-z") ?? null;
  }

  /** Lighting truss with studio lamps; each lamp drives a coloured spotlight and a light cone. */
  private buildRig() {
    const trussY = 6.2;
    const trussZ = STAGE_Z + 3.2;
    this.place(M.truss, { length: 16 }, 0, trussY, trussZ, Math.PI / 2);
    const coneGeo = new THREE.ConeGeometry(1, 1, 32, 1, true).translate(0, -0.5, 0);
    const xs = [-4.5, -1.5, 1.5, 4.5];
    xs.forEach((x, i) => {
      this.place(M.lamp, { height: 0.75 }, x, trussY - 0.85, trussZ, Math.PI);
      const color = PALETTE[i % PALETTE.length].clone();
      const light = new THREE.SpotLight(color, 40, 26, 0.34, 0.5, 1.2);
      light.position.set(x, trussY - 0.5, trussZ);
      // Only two of the four lamps are real lights (lights cost every lit pixel); all four get a beam.
      if (i % 2 === 0) this.group.add(light);
      this.group.add(light.target);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { color: { value: color }, strength: { value: 0.3 } },
        vertexShader:
          "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
        fragmentShader:
          "uniform vec3 color; uniform float strength; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float along = clamp(-vY, 0.0, 1.0); float rim = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 1.6); gl_FragColor = vec4(color * strength * (1.0 - along) * (1.0 - along) * rim, 1.0); }",
      });
      const cone = new THREE.Mesh(coneGeo, mat);
      cone.position.copy(light.position);
      cone.frustumCulled = false;
      cone.renderOrder = 5;
      this.group.add(cone);
      this.spots.push({ light, cone, base: new THREE.Vector3(x * 0.6, 0, -4 - i * 1.5), color, sweep: i * 1.3 });
    });

    // Key light on the dancer — the one shadow-casting light, and only the dancer casts.
    const s = this.dancerSpot;
    s.position.set(0, 7.5, STAGE_Z + 6);
    s.target.position.set(0, 1, STAGE_Z);
    s.castShadow = true;
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.bias = -0.0005;
    s.shadow.camera.near = 2;
    s.shadow.camera.far = 20;
    this.group.add(s, s.target);
  }

  private buildLasers() {
    const geo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: PALETTE[i % 2 === 0 ? 0 : 1], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const beam = new THREE.Mesh(geo, mat);
      beam.scale.set(1, 1, 30);
      beam.frustumCulled = false;
      this.lasers.push(beam);
      this.laserGroup.add(beam);
    }
    this.laserGroup.position.set(0, 3.0, STAGE_Z - 1.5);
    this.group.add(this.laserGroup);
  }

  private neonify(obj: THREE.Object3D, color: THREE.Color, phase: number) {
    const mat = new THREE.MeshBasicMaterial({ color: color.clone(), toneMapped: false, fog: false });
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = mat;
      mesh.castShadow = false;
    });
    this.neon.push({ mat, color: color.clone(), phase });
  }

  // --- People -----------------------------------------------------------------------------------------

  private clipsFor(set: "f" | "m", root: THREE.Object3D) {
    const out = new Map<ClipName, THREE.AnimationClip>();
    for (const name of CLIPS) {
      const clip = this.models.get(clipKey(set, name))?.animations[0];
      if (clip) out.set(name, retarget(clip, root));
    }
    return out;
  }

  private makeRig(key: string, set: "f" | "m", copy: boolean): Rig | null {
    const model = this.models.get(key);
    if (!model) return null;
    const base = model.scene;
    if (!base.userData.prepared) {
      base.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.alphaTest > 0) std.alphaToCoverage = true;
          std.envMapIntensity = 0.6;
        }
      });
      recordRestPose(base);
      base.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(base, true);
      base.userData.prepared = { minY: box.min.y, clips: this.clipsFor(set, base) };
    }
    const prepared = base.userData.prepared as { minY: number; clips: Map<ClipName, THREE.AnimationClip> };
    const root = copy ? cloneSkinned(base) : base;
    const holder = new THREE.Group();
    root.position.set(0, -prepared.minY, 0);
    holder.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<ClipName, THREE.AnimationAction>();
    for (const [name, clip] of prepared.clips) actions.set(name, mixer.clipAction(clip));
    return { root: holder, mixer, actions, current: null, phase: Math.random(), speed: 0.92 + Math.random() * 0.16, acc: 0 };
  }

  private buildPeople() {
    for (const d of DANCERS) {
      const rig = this.makeRig(d.key, d.set, false);
      if (!rig) continue;
      rig.speed = 1;
      this.dancers.push(rig);
    }
    // Crowd: two copies of each crowd model plus the lead who isn't dancing (shown/hidden on select).
    const spots: [number, number, number][] = [
      [-2.55, -2.6, 0.55],
      [2.6, -3.4, -0.6],
      [-3.4, -5.2, 0.45],
      [3.35, -6.0, -0.5],
      [-2.9, -8.0, 0.35],
      [2.9, -8.6, -0.35],
      [-4.4, -3.6, 0.7],
      [4.5, -4.4, -0.7],
    ];
    const members: { key: string; set: "f" | "m"; copy: boolean }[] = [];
    for (const c of CROWD) members.push({ key: c.key, set: c.set, copy: false }, { key: c.key, set: c.set, copy: true });
    for (const c of CROWD) members.push({ key: c.key, set: c.set, copy: true });
    members.splice(3, 0, { key: DANCERS[1].key, set: DANCERS[1].set, copy: true });
    members.splice(6, 0, { key: DANCERS[0].key, set: DANCERS[0].set, copy: true });
    members.forEach((m, i) => {
      const spot = spots[i];
      if (!spot) return;
      const rig = this.makeRig(m.key, m.set, m.copy);
      if (!rig) return;
      rig.root.position.set(spot[0], 0, spot[1]);
      // Face the stage, turned a little towards the camera.
      rig.root.rotation.y = Math.atan2(-spot[0], STAGE_Z - spot[1]) + Math.PI + spot[2];
      rig.root.userData.key = m.key;
      rig.root.traverse((o) => (o.castShadow = false));
      this.group.add(rig.root);
      this.crowd.push(rig);
    });
    this.selectDancer(0);
  }

  // --- Control ----------------------------------------------------------------------------------------

  selectDancer(index: number) {
    this.dancerIndex = ((index % DANCERS.length) + DANCERS.length) % DANCERS.length;
    this.dancers.forEach((d, i) => {
      if (i === this.dancerIndex) this.dancerHolder.add(d.root);
      else d.root.removeFromParent();
    });
    // The lead you picked doesn't also stand in the crowd.
    const lead = DANCERS[this.dancerIndex].key;
    for (const c of this.crowd) c.root.visible = c.root.userData.key !== lead;
    const d = this.dancers[this.dancerIndex];
    if (d) {
      d.current = null;
      this.applyMood(true);
    }
  }

  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.applyMood(false);
  }

  private applyMood(instant: boolean) {
    const lead: Record<Mood, ClipName> = { menu: "dance", warm: "clap", groove: "dance", hype: "dance", fever: "dance", sad: "idle", win: "cheer" };
    const crowd: Record<Mood, ClipName> = { menu: "clap", warm: "idle", groove: "clap", hype: "dance", fever: "cheer", sad: "idle", win: "cheer" };
    const d = this.dancers[this.dancerIndex];
    if (d) play(d, lead[this.mood], instant ? 0 : 0.45);
    this.crowd.forEach((c, i) => {
      // Not everyone does the same thing at once.
      let clip = crowd[this.mood];
      if (this.mood === "groove" && i % 3 === 1) clip = "dance";
      if (this.mood === "hype" && i % 3 === 2) clip = "cheer";
      if (this.mood === "menu" && i % 2 === 1) clip = "dance";
      if (this.mood === "warm" && i % 2 === 0) clip = "clap";
      play(c, clip, instant ? 0 : 0.5 + (i % 3) * 0.15);
    });
  }


  // --- Per frame --------------------------------------------------------------------------------------

  update(dt: number, p: Pulse) {
    const { energy } = p;
    this.feverMix = THREE.MathUtils.damp(this.feverMix, p.fever ? 1 : 0, 3, dt);
    const fever = this.feverMix;

    // People: dance speed follows the energy and the fever.
    const d = this.dancers[this.dancerIndex];
    if (d) {
      const fast = d.current === "dance" ? 0.9 + energy * 0.25 + fever * 0.15 : 1;
      d.mixer.timeScale = fast;
      d.mixer.update(dt);
    }
    // The crowd animates on alternate frames (half the cost, nobody notices at that distance).
    this.frameNo++;
    this.crowd.forEach((c, i) => {
      if (!c.root.visible) return;
      c.acc += dt;
      if ((this.frameNo + i) % 2 !== 0) return;
      c.mixer.timeScale = c.speed * (c.current === "dance" ? 0.9 + energy * 0.2 : 1);
      c.mixer.update(c.acc);
      c.acc = 0;
    });

    // Floor patterns change every bar.
    const bar = Math.floor(p.beat / 4);
    if (bar !== this.lastBar) {
      this.lastBar = bar;
      this.pattern = (this.pattern + 1 + Math.floor(Math.random() * 3)) % 4;
    }
    this.updateFloor(p, fever);

    // LED wall: equalizer bars jump on every beat and fall back.
    const beatIdx = Math.floor(p.beat);
    if (beatIdx !== this.lastBeat) {
      this.lastBeat = beatIdx;
      for (let i = 0; i < BARS; i++) this.barTargets[i] = (0.25 + Math.random() * 0.75) * (0.45 + energy * 0.45 + fever * 0.2) * (1 - (i / BARS) * 0.45);
    }
    for (let i = 0; i < BARS; i++) {
      const target = this.barTargets[i] * (0.35 + 0.65 * p.hit);
      this.bars[i] = target > this.bars[i] ? target : THREE.MathUtils.damp(this.bars[i], target, 6, dt);
    }
    const su = this.screenMat.uniforms;
    (su.bars.value as Float32Array).set(this.bars);
    su.hit.value = p.hit;
    su.fever.value = fever;
    su.time.value = p.beat * 0.25;
    for (const s of this.speakers) s.scale.setScalar(1 + p.hit * 0.025 * (0.5 + energy));

    // Neon frames pulse on the beat.
    for (const n of this.neon) {
      const k = 0.55 + 0.45 * Math.max(p.hit, 0.25 + 0.25 * Math.sin((p.beat + n.phase * 4) * Math.PI));
      n.mat.color.copy(n.color).multiplyScalar(0.6 + k * (1.1 + energy * 0.9 + fever));
    }
    for (const s of this.spinners) {
      s.obj.rotation.x += s.speed.x * dt * (1 + fever * 2);
      s.obj.rotation.y += s.speed.y * dt * (1 + fever * 2);
      s.obj.rotation.z += s.speed.z * dt;
    }
    if (this.wheel) {
      this.wheelSpeed = THREE.MathUtils.damp(this.wheelSpeed, 0.6 + energy * 3 + fever * 4, 2, dt);
      this.wheel.rotation.z -= this.wheelSpeed * dt;
    }

    // Moving spots sweep on a two-bar cycle, flashing on the beat.
    const t = p.beat * Math.PI * 0.25;
    this.spots.forEach((s, i) => {
      const sweep = Math.sin(t * 0.5 + s.sweep) * (3 + fever * 2);
      const target = tmpVec.set(s.base.x + sweep, 0, s.base.z + Math.cos(t * 0.5 + s.sweep * 1.7) * 2.5);
      if (i % 2 === 1 && fever < 0.5) target.set(0, 1.4, STAGE_Z + 0.4); // two spots stay on the dancer
      s.light.target.position.lerp(target, 1 - Math.exp(-dt * 6));
      const flash = 0.45 + 0.55 * p.hit;
      s.light.intensity = (18 + energy * 26 + fever * 30) * flash;
      if (fever > 0.01) s.light.color.copy(s.color).lerp(PALETTE[mod(i + Math.floor(p.beat), PALETTE.length)], fever);
      else s.light.color.copy(s.color);
      // Cone: from the lamp to the target.
      const from = s.light.position;
      const to = s.light.target.position;
      const len = from.distanceTo(to);
      s.cone.position.copy(from);
      s.cone.scale.set(len * Math.tan(s.light.angle), len, len * Math.tan(s.light.angle));
      s.cone.quaternion.setFromUnitVectors(UP_NEG, tmpVec.subVectors(to, from).normalize());
      const mat = s.cone.material as THREE.ShaderMaterial;
      mat.uniforms.strength.value = (0.1 + 0.16 * flash) * (0.6 + energy * 0.5 + fever * 0.6);
      mat.uniforms.color.value = s.light.color;
    });
    this.dancerSpot.intensity = 40 + energy * 40 + p.hit * 20;

    // Lasers fan out during fever.
    this.lasers.forEach((beam, i) => {
      const mat = beam.material as THREE.MeshBasicMaterial;
      mat.opacity = fever * (0.55 + 0.45 * p.hit);
      beam.visible = mat.opacity > 0.01;
      const a = (i / (this.lasers.length - 1) - 0.5) * 1.6 + Math.sin(p.time * 1.3 + i) * 0.25;
      beam.rotation.set(0.12 + Math.sin(p.time * 0.9 + i * 0.7) * 0.18, a, 0);
    });
  }

  private updateFloor(p: Pulse, fever: number) {
    const floor = this.floor;
    if (!floor) return;
    const beatIdx = Math.floor(p.beat);
    const ph = p.beat - beatIdx;
    const level = (0.18 + p.energy * 0.55 + fever * 0.5) * (0.35 + 0.65 * p.hit);
    this.floorCells.forEach((c, i) => {
      let k = 0;
      let colorIdx = 0;
      const gx = Math.round(c.x / FLOOR_TILE);
      const gz = Math.round(c.z / FLOOR_TILE);
      switch (this.pattern) {
        case 0: // checkerboard flipping every beat
          k = (gx + gz + beatIdx) % 2 === 0 ? 1 : 0.08;
          colorIdx = beatIdx % 2;
          break;
        case 1: {
          // rings rolling out from the stage
          const w = c.d * 0.35 - p.beat;
          const f = w - Math.floor(w);
          k = Math.pow(1 - Math.abs(f - 0.5) * 2, 3);
          colorIdx = Math.floor(c.d * 0.35 - p.beat) & 1 ? 0 : 2;
          break;
        }
        case 2: // columns chase
          k = (((gx % 4) + 4) % 4) === beatIdx % 4 ? 1 : 0.1;
          colorIdx = 1;
          break;
        default: // sparkle
          k = hash(i * 7 + beatIdx * 13) > 0.72 ? 1 : 0.05;
          colorIdx = (i + beatIdx) % 4;
      }
      if (fever > 0.5) colorIdx = (colorIdx + beatIdx + (i % 3)) % 4;
      const tail = 1 - ph * 0.4;
      tmpColor.copy(PALETTE[mod(colorIdx, PALETTE.length)]).multiplyScalar(k * level * tail);
      floor.setColorAt(i, tmpColor);
    });
    if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
  }

  /** Where the camera should look for the dancer. */
  dancerPosition(out: THREE.Vector3) {
    return this.dancerHolder.getWorldPosition(out);
  }
}

const UP_NEG = new THREE.Vector3(0, -1, 0);

const mod = (n: number, m: number) => ((n % m) + m) % m;

function hash(n: number) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found;
}

function tint(root: THREE.Object3D, color: string, roughness: number) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = (m as THREE.MeshStandardMaterial).clone();
      c.color = new THREE.Color(color).lerp(c.color ?? new THREE.Color(color), 0.25);
      c.roughness = roughness;
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
  });
}

function play(rig: Rig, name: ClipName, fade: number) {
  const next = rig.actions.get(name) ?? rig.actions.get("idle");
  if (!next) return;
  const prev = rig.current ? rig.actions.get(rig.current) : null;
  if (prev === next) return;
  next.reset();
  next.setLoop(THREE.LoopRepeat, Infinity);
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.setEffectiveTimeScale(1);
  // Start the long mocap clips somewhere different for every member.
  next.time = (rig.phase * next.getClip().duration) % next.getClip().duration;
  if (prev && fade > 0) next.crossFadeFrom(prev, fade, false);
  else if (prev) prev.stop();
  next.play();
  rig.current = name;
}
