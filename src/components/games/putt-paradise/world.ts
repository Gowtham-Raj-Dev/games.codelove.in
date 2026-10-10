import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LoadedModel } from "../shared/assets";
import { BLADE_OMEGA, BLADE_SCALE, HOLES, ISLAND_TOP, WATER_Y, type HoleDef, type Placement } from "./course";
import { CollisionMesh, KIND_COURSE, KIND_TRACK, Rotor } from "./physics";
import { DECO } from "./manifest";

/**
 * Builds the archipelago: every hole's course merged into one mesh per material (one draw call),
 * its collision triangles (taken from the very same geometry), grassy islands with sandy beaches,
 * and the palms, bushes, flowers and rocks around them as instanced meshes.
 */

export interface HoleWorld {
  index: number;
  def: HoleDef;
  group: THREE.Group;
  origin: THREE.Vector3;
  mesh: CollisionMesh;
  rotors: Rotor[];
  /** Visual sails, one per rotor (rotation.z follows the rotor angle). */
  blades: THREE.Object3D[];
  flag: THREE.Object3D;
  /** Course bounds in hole-local space. */
  bounds: THREE.Box3;
  /** Island footprints (hole-local ellipses) — where a ball falling off lands on grass. */
  islands: { x: number; z: number; rx: number; rz: number }[];
}

type Models = Map<string, LoadedModel>;

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** A copy of a mesh's geometry in plain float attributes (position, normal, uv), transformed. */
function plainGeometry(src: THREE.BufferGeometry, matrix: THREE.Matrix4) {
  const g = new THREE.BufferGeometry();
  const pos = src.getAttribute("position");
  const n = pos.count;
  const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, size: number) => {
    const out = new Float32Array(n * size);
    if (!attr) return out;
    for (let i = 0; i < n; i++) {
      out[i * size] = attr.getX(i);
      out[i * size + 1] = attr.getY(i);
      if (size > 2) out[i * size + 2] = attr.getZ(i);
    }
    return out;
  };
  g.setAttribute("position", new THREE.BufferAttribute(copy(pos, 3), 3));
  const normal = src.getAttribute("normal");
  g.setAttribute("normal", new THREE.BufferAttribute(copy(normal, 3), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(copy(src.getAttribute("uv"), 2), 2));
  const index = src.index ? Array.from(src.index.array) : Array.from({ length: n }, (_, i) => i);
  g.setIndex(index);
  if (!normal) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  return g;
}

function pushTriangles(g: THREE.BufferGeometry, tris: number[], kinds: number[], kind: number) {
  const p = g.getAttribute("position");
  const idx = g.index!.array;
  for (let i = 0; i < idx.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = idx[i + k];
      tris.push(p.getX(v), p.getY(v), p.getZ(v));
    }
    kinds.push(kind);
  }
}

function placeObject(models: Models, p: Placement) {
  const m = models.get(p.key);
  if (!m) return null;
  const wrap = new THREE.Group();
  wrap.add(m.scene.clone());
  wrap.position.set(p.x, p.y, p.z);
  wrap.rotation.y = (p.rot * Math.PI) / 2;
  wrap.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
  return wrap;
}

const isUnder = (o: THREE.Object3D, name: string) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name === name) return true;
  return false;
};

function buildHole(models: Models, def: HoleDef, index: number, scene: THREE.Scene): HoleWorld {
  const group = new THREE.Group();
  group.name = `hole-${index + 1}`;
  const root = new THREE.Group();
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const tris: number[] = [];
  const kinds: number[] = [];
  const rotors: Rotor[] = [];
  const blades: THREE.Object3D[] = [];

  for (const p of def.pieces) {
    const obj = placeObject(models, p);
    if (!obj) continue;
    root.add(obj);
    root.updateMatrixWorld(true);
    const kind = p.key.includes("spline") ? KIND_TRACK : KIND_COURSE;
    const sails = obj.getObjectByName("blades");
    if (sails) {
      // The windmill stays its own object: its sails turn.
      sails.scale.multiplyScalar(BLADE_SCALE);
      obj.updateMatrixWorld(true);
      const bt: number[] = [];
      const bk: number[] = [];
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const g = plainGeometry(mesh.geometry, mesh.matrixWorld);
        if (isUnder(mesh, "blades")) pushTriangles(g, bt, bk, KIND_COURSE);
        else pushTriangles(g, tris, kinds, kind);
        g.dispose();
      });
      const hub = new THREE.Vector3().setFromMatrixPosition(sails.matrixWorld);
      const axis = new THREE.Vector3(0, 0, 1).transformDirection(sails.matrixWorld);
      rotors.push(new Rotor(new CollisionMesh(bt, bk), [hub.x, hub.y, hub.z], [axis.x, axis.y, axis.z], BLADE_OMEGA));
      blades.push(sails);
      group.add(obj);
      continue;
    }
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = plainGeometry(mesh.geometry, mesh.matrixWorld);
      if (!p.deco) pushTriangles(g, tris, kinds, kind);
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      let list = byMaterial.get(mat);
      if (!list) {
        // Every kit piece carries its own copy of the same colour map: share the first one.
        const same = [...byMaterial.keys()].find((m) => m.name === mat.name);
        if (same) list = byMaterial.get(same);
        else byMaterial.set(mat, (list = []));
      }
      list!.push(g);
    });
    obj.removeFromParent();
  }

  for (const [mat, list] of byMaterial) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  const bounds = new THREE.Box3();
  for (let i = 0; i < tris.length; i += 3) bounds.expandByPoint(new THREE.Vector3(tris[i], tris[i + 1], tris[i + 2]));

  // The flag in the cup (lifted out when the ball comes close).
  const flagKey = `minigolf-kit/flag-${def.flag}`;
  const flag = new THREE.Group();
  const fm = models.get(flagKey);
  if (fm) {
    const f = fm.scene.clone();
    f.scale.setScalar(0.85);
    f.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    flag.add(f);
  }
  flag.position.set(def.cup.x, def.cup.y - 0.03, def.cup.z);
  flag.rotation.y = def.heading * (Math.PI / 2) + 0.6;
  group.add(flag);

  const origin = new THREE.Vector3(def.origin.x, 0, def.origin.z);
  group.position.copy(origin);
  scene.add(group);

  return {
    index,
    def,
    group,
    origin,
    mesh: new CollisionMesh(tris, kinds),
    rotors,
    blades,
    flag,
    bounds,
    islands: def.islands.map((is) => ({ x: is.x, z: is.z, rx: is.w * 0.5, rz: is.d * 0.5 })),
  };
}

// --- Islands, decoration and water ---------------------------------------------------------------

/** platform-grass / -beach: flat top spans about x −0.36…0.30, z −0.27…0.23 of a 0.89 × 0.72 blob. */
const TOP = { cx: -0.03, cz: -0.02, w: 0.66, d: 0.5, y: 0.033, h: 0.083 };

interface Instance {
  key: string;
  m: THREE.Matrix4;
}

function islandInstances(world: HoleWorld[], out: Instance[]) {
  const thick = 0.9;
  for (const h of world) {
    for (const is of h.def.islands) {
      const add = (key: string, grow: number, top: number) => {
        const sx = (is.w + grow) / TOP.w;
        const sz = (is.d + grow) / TOP.d;
        const sy = thick / TOP.h;
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(h.origin.x + is.x - TOP.cx * sx, top - TOP.y * sy, h.origin.z + is.z - TOP.cz * sz),
          new THREE.Quaternion(),
          new THREE.Vector3(sx, sy, sz),
        );
        out.push({ key, m });
      };
      add(DECO.island, 0, ISLAND_TOP);
      add(DECO.beach, 2.4, ISLAND_TOP - 0.16);
    }
  }
}

/** Where on an island something can stand (outside the course, inside the grass). */
function scatter(world: HoleWorld[], out: Instance[]) {
  const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length) % list.length];
  const tmpQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const put = (key: string, x: number, y: number, z: number, scale: number, rot: number) => {
    out.push({ key, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), tmpQ.setFromAxisAngle(Y, rot).clone(), new THREE.Vector3(scale, scale, scale)) });
  };

  for (const h of world) {
    const r = rng(1000 + h.index * 77);
    const cells = new Set(h.def.pieces.filter((p) => !p.deco).map((p) => `${Math.round(p.x)},${Math.round(p.z)}`));
    // The loop spans two tiles; keep everything off both.
    const clearance = (x: number, z: number) => {
      let best = Infinity;
      for (const c of cells) {
        const [i, j] = c.split(",").map(Number);
        const dx = Math.max(0, Math.abs(x - i) - 0.5);
        const dz = Math.max(0, Math.abs(z - j) - 0.5);
        best = Math.min(best, Math.hypot(dx, dz));
      }
      return best;
    };
    const taken: [number, number, number][] = [];
    // Tall things grow west or north of the course: the cameras look from the south (behind the
    // tee) and the east (the overview), so trees there would hide the play.
    let minX = Infinity;
    let minZ = Infinity;
    for (const c of cells) {
      const [i, j] = c.split(",").map(Number);
      minX = Math.min(minX, i);
      minZ = Math.min(minZ, j);
    }
    const tee = h.def.tee;
    const tallOk = (x: number, z: number) => (x < minX - 1.3 || z < minZ - 1.4) && Math.hypot(x - tee.x, z - tee.z) > 3.4;
    const free = (x: number, z: number, rad: number) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > tr + rad);

    for (const is of h.def.islands) {
      const area = is.w * is.d;
      const tries = Math.round(area * 5.5);
      for (let t = 0; t < tries; t++) {
        // Points inside the island's grass (an inset ellipse), biased towards the shore.
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(0.2 + r() * 0.8) * 0.9;
        const x = is.x + Math.cos(a) * rr * is.w * 0.5;
        const z = is.z + Math.sin(a) * rr * is.d * 0.5;
        const cl = clearance(x, z);
        const wx = h.origin.x + x;
        const wz = h.origin.z + z;
        const roll = r();
        if (roll < 0.12 && cl > 1.6 && tallOk(x, z) && free(x, z, 1)) {
          put(pick(r, DECO.palms), wx, ISLAND_TOP, wz, 2.2 + r() * 0.7, r() * Math.PI * 2);
          taken.push([x, z, 1]);
        } else if (roll < 0.17 && cl > 1.6 && tallOk(x, z) && free(x, z, 1)) {
          put(pick(r, DECO.trees), wx, ISLAND_TOP, wz, 1.6 + r() * 0.5, r() * Math.PI * 2);
          taken.push([x, z, 1]);
        } else if (roll < 0.4 && cl > 0.45 && free(x, z, 0.3)) {
          put(pick(r, DECO.bushes), wx, ISLAND_TOP, wz, 1.1 + r() * 0.6, r() * Math.PI * 2);
          taken.push([x, z, 0.3]);
        } else if (roll < 0.66 && cl > 0.3 && free(x, z, 0.14)) {
          put(pick(r, DECO.flowers), wx, ISLAND_TOP, wz, 0.8 + r() * 0.45, r() * Math.PI * 2);
          taken.push([x, z, 0.14]);
        } else if (roll < 0.85 && cl > 0.3 && free(x, z, 0.16)) {
          put(pick(r, DECO.grass), wx, ISLAND_TOP, wz, 0.8 + r() * 0.5, r() * Math.PI * 2);
          taken.push([x, z, 0.16]);
        } else if (cl > 0.6 && free(x, z, 0.45)) {
          put(pick(r, DECO.rocks), wx, ISLAND_TOP - 0.04, wz, 0.7 + r() * 0.7, r() * Math.PI * 2);
          taken.push([x, z, 0.45]);
        }
      }
    }
  }

  // Things in the lagoon: rocks, lily pads and a canoe or two, away from the islands.
  const r = rng(4242);
  const onIsland = (x: number, z: number, pad: number) =>
    world.some((h) => h.def.islands.some((is) => Math.abs(x - h.origin.x - is.x) < is.w / 2 + pad && Math.abs(z - h.origin.z - is.z) < is.d / 2 + pad));
  let placed = 0;
  for (let t = 0; t < 600 && placed < 70; t++) {
    const x = -14 + r() * 58;
    const z = -56 + r() * 70;
    if (onIsland(x, z, 1.8)) continue;
    const roll = r();
    if (roll < 0.22) put(pick(r, DECO.seaRocks), x, WATER_Y - 0.6, z, 1.6 + r() * 2.2, r() * Math.PI * 2);
    else if (roll < 0.9) put(pick(r, DECO.lilies), x, WATER_Y + 0.07, z, 2 + r() * 1.5, r() * Math.PI * 2);
    else put(DECO.canoe, x, WATER_Y - 0.03, z, 2.1, r() * Math.PI * 2);
    placed++;
  }
}

/** All instances of each model become one InstancedMesh per sub-mesh. */
function instanced(models: Models, items: Instance[], scene: THREE.Scene) {
  const byKey = new Map<string, THREE.Matrix4[]>();
  for (const it of items) {
    let list = byKey.get(it.key);
    if (!list) byKey.set(it.key, (list = []));
    list.push(it.m);
  }
  const groups: THREE.Object3D[] = [];
  for (const [key, mats] of byKey) {
    const m = models.get(key);
    if (!m) continue;
    const src = m.scene;
    src.updateMatrixWorld(true);
    const island = key === DECO.island || key === DECO.beach;
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
      const tmp = new THREE.Matrix4();
      mats.forEach((mm, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(mm, mesh.matrixWorld)));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = !island && !key.includes("lily");
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      scene.add(inst);
      groups.push(inst);
    });
  }
  return groups;
}

export function buildWorld(models: Models, scene: THREE.Scene) {
  const holes = HOLES.map((def, i) => buildHole(models, def, i, scene));
  const items: Instance[] = [];
  islandInstances(holes, items);
  scatter(holes, items);
  const instances = instanced(models, items, scene);
  return { holes, instances };
}

// --- Water -------------------------------------------------------------------------------------------

export function makeWater(holes: HoleWorld[]) {
  const spots = holes.flatMap((h) => h.def.islands.map((is) => new THREE.Vector4(h.origin.x + is.x, h.origin.z + is.z, is.w * 0.5 + 0.9, is.d * 0.5 + 0.9)));
  while (spots.length < 24) spots.push(new THREE.Vector4(9999, 9999, 1, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      deep: { value: new THREE.Color("#1f8fb8") },
      shallow: { value: new THREE.Color("#5fe0d0") },
      foam: { value: new THREE.Color("#f4fffb") },
      sky: { value: new THREE.Color("#bfe9ff") },
      sunDir: { value: new THREE.Vector3(0.45, 0.75, 0.35).normalize() },
      islands: { value: spots.slice(0, 24) },
      fogColor: { value: new THREE.Color("#cdeffa") },
      fogNear: { value: 40 },
      fogFar: { value: 170 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDist;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 deep, shallow, foam, sky, sunDir, fogColor;
      uniform vec4 islands[24];
      uniform float fogNear, fogFar;
      varying vec3 vWorld;
      varying float vDist;
      float wave(vec2 p) {
        return sin(p.x * 0.9 + time * 1.1) * 0.5 + sin(p.y * 1.3 - time * 0.9) * 0.5
          + sin((p.x + p.y) * 2.1 + time * 1.7) * 0.25 + sin((p.x - p.y) * 3.3 - time * 2.3) * 0.12;
      }
      void main() {
        vec2 p = vWorld.xz;
        float e = 0.05;
        float h = wave(p);
        vec3 n = normalize(vec3(-(wave(p + vec2(e, 0.0)) - h) / e * 0.06, 1.0, -(wave(p + vec2(0.0, e)) - h) / e * 0.06));
        // Distance to the nearest island (in units of its size): shallow lagoon colour and a foam line.
        float d = 99.0;
        for (int i = 0; i < 24; i++) {
          vec2 q = (p - islands[i].xy) / islands[i].zw;
          d = min(d, (length(q) - 1.0) * min(islands[i].z, islands[i].w));
        }
        float shore = 1.0 - smoothstep(0.0, 5.0, d);
        vec3 col = mix(deep, shallow, shore * 0.85);
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        col = mix(col, sky, fres * 0.55);
        vec3 H = normalize(sunDir + V);
        col += vec3(1.0, 0.97, 0.88) * pow(max(dot(n, H), 0.0), 180.0) * 1.4;
        float ripple = sin(d * 6.0 - time * 2.2) * 0.5 + 0.5;
        float f = (1.0 - smoothstep(-0.4, 0.9, d)) * (0.55 + 0.45 * ripple) + smoothstep(0.92, 1.0, sin(p.x * 0.7 + p.y * 0.4 + time * 0.6 + h)) * 0.08;
        col = mix(col, foam, clamp(f, 0.0, 1.0) * 0.8);
        float fog = smoothstep(fogNear, fogFar, vDist);
        gl_FragColor = vec4(mix(col, fogColor, fog), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 1, 1), material);
  water.rotation.x = -Math.PI / 2;
  water.position.set(14, WATER_Y, -20);
  return water;
}

export function makeSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color("#4fa8e6") },
        horizon: { value: new THREE.Color("#cdeffa") },
        sunDir: { value: new THREE.Vector3(0.45, 0.42, 0.35).normalize() },
      },
      vertexShader:
        "varying vec3 vDir; void main() { vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform vec3 top, horizon, sunDir; varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.5));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(1.0, 0.93, 0.75) * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
