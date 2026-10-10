import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { asset } from "@/lib/asset";
import type { GltfJson } from "@/lib/glb";

let draco: DRACOLoader | null = null;
let ktx2: KTX2Loader | null = null;

/**
 * Parses a GLB held in memory. Handles every compression the web commonly uses: meshopt (bundled),
 * Draco and KTX2/Basis (decoders in /public/decoders, fetched only when a file needs them).
 */
export function parseGltf(data: ArrayBuffer, renderer: THREE.WebGLRenderer): Promise<GLTF> {
  draco ??= new DRACOLoader().setDecoderPath(asset("/decoders/draco/"));
  ktx2 ??= new KTX2Loader().setTranscoderPath(asset("/decoders/basis/"));
  ktx2.detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(draco).setKTX2Loader(ktx2);
  return loader.parseAsync(data, "");
}

/** A parsed model, centred on the origin and standing on the ground plane. */
export interface PreparedModel {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  /** Position for the root's parent that grounds and centres the model. */
  offset: THREE.Vector3;
  size: THREE.Vector3;
}

export function prepareModel(gltf: GLTF): PreparedModel {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    // Skinned bounds don't follow animations; never cull.
    if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
  });
  const box = new THREE.Box3().setFromObject(root, true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  const center = box.getCenter(new THREE.Vector3());
  return {
    root,
    animations: gltf.animations,
    offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
    size: box.getSize(new THREE.Vector3()),
  };
}

export interface ModelInfo {
  bytes: number;
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  textures: number;
  bones: number;
  animations: { name: string; duration: number }[];
  size: [number, number, number];
  generator: string | null;
  copyright: string | null;
  extensions: string[];
}

export function inspectModel(model: PreparedModel, json: GltfJson, bytes: number): ModelInfo {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  model.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    const position = mesh.geometry.getAttribute("position");
    const count = mesh.geometry.index?.count ?? position?.count ?? 0;
    meshes++;
    vertices += (position?.count ?? 0) * instances;
    triangles += Math.floor(count / 3) * instances;
  });
  const joints = new Set<number>((json.skins ?? []).flatMap((s: GltfJson) => s.joints ?? []));
  return {
    bytes,
    triangles,
    vertices,
    meshes,
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    bones: joints.size,
    animations: model.animations.map((a, i) => ({ name: a.name || `Animation ${i + 1}`, duration: a.duration })),
    size: [model.size.x, model.size.y, model.size.z],
    generator: json.asset?.generator ?? null,
    copyright: json.asset?.copyright ?? null,
    extensions: json.extensionsUsed ?? [],
  };
}

/** Frees the GPU resources of a model that is no longer shown. */
export function disposeModel(root: THREE.Object3D) {
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
