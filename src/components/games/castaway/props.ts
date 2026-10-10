import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeProto, type Fit, type LoadedModel } from "../shared/assets";

/**
 * Turns library models into cheap, shareable pieces: every kit's models share one texture atlas,
 * so each kit gets ONE Lambert material and each model is baked into ONE geometry (sub-meshes
 * merged, scaled and grounded). Hundreds of trees, rocks and plants then draw as a handful of
 * instanced meshes.
 */

export interface Baked {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Size after fitting. */
  size: THREE.Vector3;
}

const kitOf = (key: string) => key.split("/")[0];

/** One shared material per kit (textured kits keep their atlas; colour-only kits use vertex colours). */
export class KitMaterials {
  private readonly mats = new Map<string, THREE.MeshLambertMaterial>();

  get(kit: string, map: THREE.Texture | null) {
    let m = this.mats.get(kit);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ map, vertexColors: true, side: THREE.DoubleSide });
      m.name = kit;
      addFade(m);
      this.mats.set(kit, m);
    }
    return m;
  }

  all() {
    return [...this.mats.values()];
  }

  dispose() {
    for (const m of this.mats.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.mats.clear();
  }
}

/**
 * Instanced props can be dithered away (per-instance `aFade`, 0..1) — trees between the camera and
 * the castaway fade out instead of blocking the view. Non-instanced meshes sharing the material
 * compile without it.
 */
const NL = String.fromCharCode(10);

function addFade(m: THREE.Material) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", ["#include <common>", "varying float vFade;", "#ifdef USE_INSTANCING", "attribute float aFade;", "#endif"].join(NL))
      .replace("#include <begin_vertex>", ["#include <begin_vertex>", "#ifdef USE_INSTANCING", "vFade = aFade;", "#else", "vFade = 0.0;", "#endif"].join(NL));
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", ["#include <common>", "varying float vFade;", "float cwBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }"].join(NL))
      .replace("void main() {", ["void main() {", "  if (vFade > 0.01) { vec2 q = gl_FragCoord.xy; float d = cwBayer2(0.5 * q) * 0.25 + cwBayer2(q); if (d < vFade) discard; }"].join(NL));
  };
  m.customProgramCacheKey = () => "castaway-fade";
}

/** Copies an attribute (possibly quantized / interleaved) into plain floats. */
function floats(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, itemSize: number) {
  const out = new Float32Array(attr.count * itemSize);
  for (let i = 0; i < attr.count; i++) {
    out[i * itemSize] = attr.getX(i);
    if (itemSize > 1) out[i * itemSize + 1] = attr.getY(i);
    if (itemSize > 2) out[i * itemSize + 2] = attr.getZ(i);
  }
  return new THREE.BufferAttribute(out, itemSize);
}

/** Bakes a loaded model into one geometry + its kit's material, grounded and fitted like makeProto. */
export function bake(models: Map<string, LoadedModel>, key: string, fit: Fit, kits: KitMaterials): Baked | null {
  const m = models.get(key);
  if (!m) return null;
  const proto = makeProto(m.scene.clone(), [], fit, { shadows: false });
  proto.object.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let map: THREE.Texture | null = null;
  const color = new THREE.Color();
  proto.object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    const pos = src.getAttribute("position");
    g.setAttribute("position", floats(pos, 3));
    const nrm = src.getAttribute("normal");
    if (nrm) g.setAttribute("normal", floats(nrm, 3));
    const uv = src.getAttribute("uv");
    g.setAttribute("uv", uv ? floats(uv, 2) : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
    else g.setIndex(Array.from({ length: pos.count }, (_, i) => i));
    // Texture transforms (KHR_texture_transform) are baked into the UVs.
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const mat = mats[0] as THREE.MeshStandardMaterial;
    if (mat.map) {
      map ??= mat.map;
      if (mat.map.matrixAutoUpdate) mat.map.updateMatrix();
      const uvA = g.getAttribute("uv") as THREE.BufferAttribute;
      const v = new THREE.Vector2();
      for (let i = 0; i < uvA.count; i++) {
        v.set(uvA.getX(i), uvA.getY(i)).applyMatrix3(mat.map.matrix);
        uvA.setXY(i, v.x, v.y);
      }
    }
    color.copy(mat.color ?? new THREE.Color(1, 1, 1));
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      cols[i * 3] = color.r;
      cols[i * 3 + 1] = color.g;
      cols[i * 3 + 2] = color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.applyMatrix4(mesh.matrixWorld);
    if (!nrm) g.computeVertexNormals();
    parts.push(g);
  });
  if (!parts.length) return null;
  const geometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) parts.forEach((p) => p.dispose());
  if (!geometry) return null;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // Kits without textures (Nature Kit) take their colours from the vertex colours alone.
  const material = kits.get(map ? kitOf(key) : `${kitOf(key)}:flat`, map ? cloneMap(map) : null);
  return { geometry, material, size: proto.size.clone() };
}

/** The atlas outlives the parsed model (which is disposed after baking). */
function cloneMap(map: THREE.Texture) {
  const t = map.clone();
  // Any texture transform is already baked into the UVs.
  t.offset.set(0, 0);
  t.repeat.set(1, 1);
  t.rotation = 0;
  t.center.set(0, 0);
  t.needsUpdate = true;
  return t;
}

// --- Instancing ---------------------------------------------------------------------------------------

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export function composeMatrix(out: THREE.Matrix4, x: number, y: number, z: number, rotY: number, scale: number, tiltX = 0, tiltZ = 0) {
  tmpE.set(tiltX, rotY, tiltZ, "YXZ");
  tmpQ.setFromEuler(tmpE);
  tmpP.set(x, y, z);
  tmpS.set(scale, scale, scale);
  return out.compose(tmpP, tmpQ, tmpS);
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** One instanced mesh per baked model; instances are shown, moved and hidden by index. */
export class InstanceSet {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  private dirty = false;
  private readonly fade: THREE.InstancedBufferAttribute;
  private fadeDirty = false;

  constructor(
    readonly baked: Baked,
    capacity: number,
    { shadows = true }: { shadows?: boolean } = {},
  ) {
    this.mesh = new THREE.InstancedMesh(baked.geometry, baked.material, Math.max(1, capacity));
    this.mesh.count = 0;
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, capacity)), 1);
    this.fade.setUsage(THREE.DynamicDrawUsage);
    baked.geometry.setAttribute("aFade", this.fade);
  }

  /** Dithers instance `i` away (0 = solid, 1 = gone). */
  setFade(i: number, v: number) {
    if (this.fade.getX(i) === v) return;
    this.fade.setX(i, v);
    this.fadeDirty = true;
  }

  add(x: number, y: number, z: number, rotY: number, scale: number, tiltX = 0, tiltZ = 0) {
    const i = this.count++;
    composeMatrix(tmpM, x, y, z, rotY, scale, tiltX, tiltZ);
    this.mesh.setMatrixAt(i, tmpM);
    this.mesh.count = this.count;
    this.dirty = true;
    return i;
  }

  set(i: number, m: THREE.Matrix4) {
    this.mesh.setMatrixAt(i, m);
    this.dirty = true;
  }

  place(i: number, x: number, y: number, z: number, rotY: number, scale: number, tiltX = 0, tiltZ = 0) {
    composeMatrix(tmpM, x, y, z, rotY, scale, tiltX, tiltZ);
    this.set(i, tmpM);
  }

  hide(i: number) {
    this.set(i, HIDDEN);
  }

  flush() {
    if (this.fadeDirty) {
      this.fadeDirty = false;
      this.fade.needsUpdate = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Swaps every material under a loaded character for a Lambert one with the same atlas. */
export function lambertize(root: THREE.Object3D, cache = new Map<THREE.Material, THREE.MeshLambertMaterial>()) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material) => {
      let l = cache.get(m);
      if (!l) {
        const src = m as THREE.MeshStandardMaterial;
        l = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.color?.clone() ?? new THREE.Color(1, 1, 1), side: src.side, transparent: src.transparent, opacity: src.opacity });
        cache.set(m, l);
      }
      return l;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  });
  return cache;
}
