import * as THREE from "three";
import { asset } from "@/lib/asset";
import { parseGltf } from "@/lib/gltf-load";

/**
 * Model loading shared by every game. Models are library keys ("mini-skate/skateboard" →
 * /library/mini-skate/skateboard.glb) or, for the rigged Rocketbox characters and their clips,
 * absolute paths without the extension ("/models/sports-female-01", "/animations/f_dancing_neutral"). Downloads are streamed so the progress bar moves with every
 * byte (not only when whole files finish), run a few at a time in the order given (put the models
 * the first screen needs first), and are kept in memory so reopening a game is instant.
 */

export interface LoadProgress {
  /** 0..1 — bytes downloaded, plus a small share for parsing. */
  ratio: number;
  loadedBytes: number;
  totalBytes: number;
  filesDone: number;
  filesTotal: number;
}

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const buffers = new Map<string, Promise<ArrayBuffer>>();

/** Public URL of a model key. */
export const modelUrl = (key: string) => (key.startsWith("/") ? `${key}.glb` : `/library/${key}.glb`);
const FALLBACK_BYTES = 60_000;

async function download(key: string, onBytes: (loaded: number, total: number | null) => void): Promise<ArrayBuffer> {
  const res = await fetch(asset(modelUrl(key)));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${key}`);
  const length = Number(res.headers.get("content-length")) || null;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength, buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, length);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  onBytes(loaded, loaded);
  return out.buffer;
}

/**
 * Loads models with byte-accurate progress. `sizes` (bytes per key, from the catalog) makes the bar
 * exact from the first frame; without it, Content-Length headers are used as they arrive. A model
 * that fails twice is skipped — check the returned map for the ones you can't do without.
 */
export async function loadModels(
  keys: readonly string[],
  renderer: THREE.WebGLRenderer,
  onProgress: (p: LoadProgress) => void,
  { sizes = {}, concurrency = 6 }: { sizes?: Record<string, number>; concurrency?: number } = {},
): Promise<Map<string, LoadedModel>> {
  const unique = [...new Set(keys)];
  const total = new Map(unique.map((k) => [k, sizes[k] ?? FALLBACK_BYTES]));
  const loaded = new Map(unique.map((k) => [k, 0]));
  const out = new Map<string, LoadedModel>();
  let parsed = 0;
  let lastReport = 0;

  const report = (force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < 60) return;
    lastReport = now;
    let t = 0;
    let l = 0;
    for (const k of unique) {
      t += total.get(k)!;
      l += Math.min(loaded.get(k)!, total.get(k)!);
    }
    const ratio = unique.length ? (l / Math.max(1, t)) * 0.9 + (parsed / unique.length) * 0.1 : 1;
    onProgress({ ratio: Math.min(1, ratio), loadedBytes: l, totalBytes: t, filesDone: parsed, filesTotal: unique.length });
  };

  const fetchOne = (key: string) => {
    let promise = buffers.get(key);
    if (!promise) {
      const attempt = () =>
        download(key, (l, t) => {
          loaded.set(key, l);
          if (t) total.set(key, t);
          report();
        });
      promise = attempt().catch(() => attempt());
      buffers.set(key, promise);
      promise.catch(() => buffers.delete(key));
    } else {
      // Already downloaded (or downloading) in this tab.
      void promise.then((b) => {
        total.set(key, b.byteLength);
        loaded.set(key, b.byteLength);
      });
    }
    return promise;
  };

  const queue = [...unique];
  const worker = async () => {
    for (let key = queue.shift(); key; key = queue.shift()) {
      try {
        const buf = await fetchOne(key);
        loaded.set(key, total.get(key)!);
        const gltf = await parseGltf(buf.slice(0), renderer);
        out.set(key, { scene: gltf.scene, animations: gltf.animations });
      } catch (err) {
        console.warn("[games] model failed to load", key, err);
      } finally {
        parsed++;
        report(true);
      }
    }
  };
  report(true);
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}

// --- Prototypes & pooling -------------------------------------------------------------------------

export interface Proto {
  /** Grounded, x/z-centred and scaled model; clone it to place copies (geometry and materials are shared). */
  object: THREE.Object3D;
  /** Size after scaling. */
  size: THREE.Vector3;
  animations: THREE.AnimationClip[];
}

export type Fit =
  | { scale: number }
  | { width: number }
  | { height: number }
  | { length: number }
  /** Non-uniform: stretch to an exact box (any axis left out keeps the uniform scale of the others). */
  | { box: { x?: number; y?: number; z?: number } };

/** Wraps a loaded scene so it stands on y=0, centred on x/z, at the requested size. */
export function makeProto(scene: THREE.Object3D, animations: THREE.AnimationClip[], fit: Fit, { shadows = true, receive = false } = {}): Proto {
  // A clone of an already-prepared scene carries the previous offset; measure from the origin.
  scene.position.set(0, 0, 0);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  const raw = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  scene.position.set(-center.x, -box.min.y, -center.z);

  const scale = new THREE.Vector3(1, 1, 1);
  if ("scale" in fit) scale.setScalar(fit.scale);
  else if ("width" in fit) scale.setScalar(fit.width / raw.x);
  else if ("height" in fit) scale.setScalar(fit.height / raw.y);
  else if ("length" in fit) scale.setScalar(fit.length / raw.z);
  else {
    const { x, y, z } = fit.box;
    const ref = x !== undefined ? x / raw.x : y !== undefined ? y / raw.y : z !== undefined ? z / raw.z : 1;
    scale.set(x !== undefined ? x / raw.x : ref, y !== undefined ? y / raw.y : ref, z !== undefined ? z / raw.z : ref);
  }

  const wrapper = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.copy(scale);
  scaled.add(scene);
  wrapper.add(scaled);
  wrapper.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows;
    mesh.receiveShadow = receive;
  });
  return { object: wrapper, size: raw.clone().multiply(scale), animations };
}

/** Builds a proto from a loaded model; for a second proto of the same model the scene is cloned. */
export function protoFrom(models: Map<string, LoadedModel>, key: string, fit: Fit, opts?: { shadows?: boolean; receive?: boolean; copy?: boolean }) {
  const m = models.get(key);
  if (!m) return undefined;
  return makeProto(opts?.copy ? m.scene.clone() : m.scene, m.animations, fit, opts);
}

/** Recycles clones per prototype so games never allocate meshes mid-play. */
export class Pool {
  private free = new Map<string, THREE.Object3D[]>();
  constructor(
    private readonly protos: Map<string, Proto>,
    private readonly parent: THREE.Object3D,
  ) {}

  get(key: string, parent: THREE.Object3D = this.parent): THREE.Object3D {
    const list = this.free.get(key);
    const obj = list?.pop() ?? this.protos.get(key)!.object.clone();
    obj.visible = true;
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    parent.add(obj);
    return obj;
  }

  release(key: string, obj: THREE.Object3D) {
    obj.removeFromParent();
    let list = this.free.get(key);
    if (!list) this.free.set(key, (list = []));
    list.push(obj);
  }
}

/** Frees the GPU side of everything under `root` (geometries, materials, textures). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.geometry) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
