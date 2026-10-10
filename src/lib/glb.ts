/**
 * Minimal GLB (binary glTF 2.0) reader/writer used to save recolored models. Edits are applied to
 * the original file's JSON, and the binary chunk is copied byte for byte (only replaced images are
 * re-laid out), so compression, animations, skins and the embedded license all survive untouched.
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

/* eslint-disable @typescript-eslint/no-explicit-any -- glTF JSON is open-ended (extensions, extras). */
export type GltfJson = Record<string, any>;

export interface Glb {
  json: GltfJson;
  /** The BIN chunk (glTF buffer 0), or null when the file has none. */
  bin: Uint8Array | null;
}

export function isGlb(data: ArrayBuffer): boolean {
  return data.byteLength >= 20 && new DataView(data).getUint32(0, true) === GLB_MAGIC;
}

export function readGlb(data: ArrayBuffer): Glb {
  if (!isGlb(data)) throw new Error("Not a .glb file (binary glTF).");
  const view = new DataView(data);
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported glTF version ${version} — only glTF 2.0 is supported.`);
  const length = Math.min(view.getUint32(8, true), data.byteLength);
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= length; ) {
    const size = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const body = new Uint8Array(data, offset + 8, Math.min(size, length - offset - 8));
    if (type === CHUNK_JSON && !json) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === CHUNK_BIN && !bin) bin = body;
    offset += 8 + size;
  }
  if (!json) throw new Error("The .glb file has no JSON chunk.");
  return { json, bin };
}

export function writeGlb({ json, bin }: Glb): Uint8Array<ArrayBuffer> {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(text.length);
  const binLength = bin ? align4(bin.length) : 0;
  const total = 12 + 8 + jsonLength + (bin ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + jsonLength); // JSON chunk is padded with spaces
  if (bin) {
    const at = 20 + jsonLength;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, CHUNK_BIN, true);
    out.set(bin, at + 8); // BIN chunk is padded with zeros
  }
  return out;
}

export interface GlbEdits {
  /** glTF material index → new linear RGB base color. */
  materials: Map<number, [number, number, number]>;
  /** glTF image index → new encoded image. */
  images: Map<number, { data: Uint8Array; mimeType: string }>;
}

/** Returns a copy of `original` with the edits applied. */
export function applyGlbEdits(original: ArrayBuffer, edits: GlbEdits): Uint8Array<ArrayBuffer> {
  const { json: source, bin: sourceBin } = readGlb(original);
  const json: GltfJson = structuredClone(source);
  let bin = sourceBin;

  for (const [index, rgb] of edits.materials) {
    const material = json.materials?.[index];
    if (!material) continue;
    const color = rgb.map(round) as [number, number, number];
    const pbr = (material.pbrMetallicRoughness ??= {});
    pbr.baseColorFactor = [...color, pbr.baseColorFactor?.[3] ?? 1];
    const specGloss = material.extensions?.KHR_materials_pbrSpecularGlossiness;
    if (specGloss) specGloss.diffuseFactor = [...color, specGloss.diffuseFactor?.[3] ?? 1];
  }

  if (edits.images.size) {
    bin = replaceImages(json, sourceBin, edits.images);
    pointTexturesAtCoreSource(json, new Set(edits.images.keys()));
  }

  return writeGlb({ json, bin });
}

const align4 = (n: number) => (n + 3) & ~3;
const round = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * Rebuilds the BIN chunk with new bytes for the given images. Every other byte range that the file
 * references (buffer views and EXT_meshopt_compression streams) is copied unchanged, keeping its
 * 4-byte alignment; the replaced images' old bytes are dropped.
 */
function replaceImages(json: GltfJson, bin: Uint8Array | null, images: GlbEdits["images"]): Uint8Array {
  json.buffers ??= [];
  if (json.buffers.length === 0) json.buffers.push({ byteLength: 0 });
  if (json.buffers[0].uri !== undefined) throw new Error("This file keeps its data in external files, so it can't be re-saved as a .glb.");
  json.bufferViews ??= [];
  const views: GltfJson[] = json.bufferViews;

  // Images get new bytes in their own buffer view (reused when nothing else points at it).
  const fresh = new Map<number, Uint8Array>();
  for (const [index, image] of images) {
    const def = json.images[index];
    let viewIndex: number | undefined = def.bufferView;
    if (viewIndex === undefined || !ownsView(json, viewIndex, index)) {
      viewIndex = views.length;
      views.push({ buffer: 0, byteOffset: 0, byteLength: 0 });
    }
    def.bufferView = viewIndex;
    def.mimeType = image.mimeType;
    delete def.uri;
    fresh.set(viewIndex, image.data);
  }

  interface Range {
    start: number;
    end: number;
    move: (offset: number) => void;
  }
  const ranges: Range[] = [];
  views.forEach((view, i) => {
    if (view.buffer === 0 && !fresh.has(i)) {
      const start = view.byteOffset ?? 0;
      ranges.push({ start, end: start + view.byteLength, move: (o) => (view.byteOffset = o) });
    }
    const meshopt = view.extensions?.EXT_meshopt_compression;
    if (meshopt && meshopt.buffer === 0) {
      const start = meshopt.byteOffset ?? 0;
      ranges.push({ start, end: start + meshopt.byteLength, move: (o) => (meshopt.byteOffset = o) });
    }
  });
  ranges.sort((a, b) => a.start - b.start);

  // Group overlapping ranges into blocks that move together.
  const blocks: { start: number; end: number; members: Range[] }[] = [];
  for (const range of ranges) {
    const last = blocks.at(-1);
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
      last.members.push(range);
    } else {
      blocks.push({ start: range.start, end: range.end, members: [range] });
    }
  }

  let size = 0;
  const placed: { from: number; to: number; length: number }[] = [];
  for (const block of blocks) {
    const at = align4(size) + (block.start % 4);
    for (const member of block.members) member.move(at + (member.start - block.start));
    placed.push({ from: block.start, to: at, length: block.end - block.start });
    size = at + block.end - block.start;
  }
  const appended: { data: Uint8Array; to: number }[] = [];
  for (const [viewIndex, data] of fresh) {
    const at = align4(size);
    views[viewIndex] = { buffer: 0, byteOffset: at, byteLength: data.length };
    appended.push({ data, to: at });
    size = at + data.length;
  }

  const out = new Uint8Array(size);
  for (const p of placed) {
    if (!bin || p.from + p.length > bin.length) throw new Error("The file's binary data is truncated.");
    out.set(bin.subarray(p.from, p.from + p.length), p.to);
  }
  for (const a of appended) out.set(a.data, a.to);
  json.buffers[0].byteLength = size;
  return out;
}

/** True when buffer view `view` holds image `image` and nothing else refers to it. */
function ownsView(json: GltfJson, view: number, image: number): boolean {
  const accessors: GltfJson[] = json.accessors ?? [];
  if (accessors.some((a) => a.bufferView === view || a.sparse?.indices?.bufferView === view || a.sparse?.values?.bufferView === view)) return false;
  if ((json.images ?? []).some((img: GltfJson, i: number) => i !== image && img.bufferView === view)) return false;
  const primitives = (json.meshes ?? []).flatMap((m: GltfJson) => m.primitives ?? []);
  return !primitives.some((p: GltfJson) => p.extensions?.KHR_draco_mesh_compression?.bufferView === view);
}

/** Replaced images are PNGs, so textures that loaded them through EXT_texture_webp/avif now use the core `source`. */
function pointTexturesAtCoreSource(json: GltfJson, replaced: Set<number>) {
  const formats = ["EXT_texture_webp", "EXT_texture_avif"];
  for (const texture of json.textures ?? []) {
    for (const name of formats) {
      const ext = texture.extensions?.[name];
      if (!ext || !replaced.has(ext.source)) continue;
      texture.source = ext.source;
      delete texture.extensions[name];
      if (Object.keys(texture.extensions).length === 0) delete texture.extensions;
    }
  }
  for (const name of formats) {
    if ((json.textures ?? []).some((t: GltfJson) => t.extensions?.[name])) continue;
    for (const list of ["extensionsUsed", "extensionsRequired"]) {
      if (!json[list]) continue;
      json[list] = json[list].filter((e: string) => e !== name);
      if (json[list].length === 0) delete json[list];
    }
  }
}
