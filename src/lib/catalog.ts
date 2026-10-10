import rocketboxData from "@/data/catalog.json";
import libraryData from "@/data/library.json";
import { COPYRIGHT_LINE, creditLine, type Credit } from "@/lib/attribution";
import { formatBytes, formatNumber } from "@/lib/format";
import { refineCategory } from "@/lib/refine-category.mjs";

export { COPYRIGHT_LINE, creditLine, type Credit };
export { formatBytes, formatNumber };

// --- Taxonomy & sources -----------------------------------------------------------------------

export type Category =
  | "Characters"
  | "Animals"
  | "Vehicles"
  | "Buildings"
  | "Furniture"
  | "Food"
  | "Nature"
  | "Trees"
  | "Space"
  | "Weapons"
  | "God of War"
  | "Skeletons"
  | "Bikes"
  | "Gaming"
  | "Hair"
  | "Props";
export type Gender = "female" | "male";
/** License group. "mit" is the rigged character library (Biped humans, rigged animals, animation clips). */
export type SourceKey = "mit" | "cc0" | "public-domain" | "cc-by" | "cc-by-nd";

export const CATEGORIES: Category[] = [
  "Characters",
  "Animals",
  "Vehicles",
  "Buildings",
  "Furniture",
  "Food",
  "Nature",
  "Trees",
  "Space",
  "Weapons",
  "Skeletons",
  "Bikes",
  "Gaming",
  "Hair",
  "God of War",
  "Props",
];

export const CATEGORY_INFO: Record<Category, { singular: string; blurb: string; keywords: string[] }> = {
  Hair: {
    singular: "hairstyle",
    blurb: "Long, bob, bun and anime hairstyles by Sketchfab artists (credit the author)",
    keywords: ["3D hair model", "free hair 3D model", "anime hair 3D model", "hairstyle GLB", "3D hairstyles for avatars"],
  },
  "God of War": {
    singular: "God of War character / warrior",
    blurb: "Kratos, Spartan champions, archers and mythological deities",
    keywords: ["Kratos 3D model", "God of War 3D model", "Spartan warrior 3D model", "Leviathan Axe 3D model", "Blades of Chaos 3D model", "Greek warrior 3D model"],
  },
  Skeletons: {
    singular: "skeleton",
    blurb: "Undead skeleton warriors, mages, rogues and dungeon armaments",
    keywords: ["skeleton 3D model", "rigged skeleton warrior", "undead 3D model", "skeleton mage 3D model", "free skeleton GLB"],
  },
  Bikes: {
    singular: "bike",
    blurb: "Motorcycles, racing road bikes, choppers, and urban cycles",
    keywords: ["motorcycle 3D model", "bike 3D model free", "chopper 3D model", "cyberpunk motorbike 3D model", "bicycle 3D model"],
  },
  Gaming: {
    singular: "game asset",
    blurb: "Arcade machines, combat soldiers, battle arenas and RPG loot",
    keywords: ["game assets 3D", "arcade machine 3D model", "soldier 3D model", "battle arena 3D model", "free game assets GLB"],
  },
  Characters: {
    singular: "character",
    blurb: "Rigged people, professions and stylized characters",
    keywords: ["free rigged 3D characters", "3D people models", "3D human model", "rigged character GLB", "3D avatar free", "animated 3D character"],
  },
  Animals: {
    singular: "animal",
    blurb: "Farm animals, pets, birds and creatures",
    keywords: ["animal 3D models free", "rigged animal 3D model", "dog 3D model", "horse 3D model", "farm animals 3D", "low poly animals"],
  },
  Vehicles: {
    singular: "vehicle",
    blurb: "Cars, trucks, trains, boats and karts",
    keywords: ["free car 3D models", "vehicle 3D models", "police car 3D model", "truck 3D model", "train 3D model", "low poly car GLB"],
  },
  Buildings: {
    singular: "building",
    blurb: "Houses, city blocks, castles and roads",
    keywords: ["free building 3D models", "house 3D model", "city 3D model", "castle 3D model", "road tiles 3D", "low poly buildings"],
  },
  Furniture: {
    singular: "furniture",
    blurb: "Home, kitchen, office and outdoor furniture",
    keywords: ["free furniture 3D models", "sofa 3D model", "chair 3D model", "bed 3D model", "kitchen 3D model", "interior 3D models"],
  },
  Food: {
    singular: "food",
    blurb: "Meals, fruit, drinks and restaurant props",
    keywords: ["food 3D models free", "burger 3D model", "pizza 3D model", "fruit 3D model", "cake 3D model", "low poly food"],
  },
  Nature: {
    singular: "nature",
    blurb: "Plants, flowers, rocks and terrain",
    keywords: ["nature 3D models free", "plant 3D model", "rock 3D model", "flower 3D model", "grass 3D model", "low poly nature"],
  },
  Trees: {
    singular: "tree",
    blurb: "Oaks, pines, palms, autumn and snowy trees",
    keywords: ["free tree 3D models", "palm tree 3D model", "pine tree 3D model", "low poly tree", "tree GLB"],
  },
  Space: {
    singular: "space",
    blurb: "Spacecraft, rovers, planets and space bases",
    keywords: ["space 3D models free", "NASA 3D models", "spacecraft 3D model", "satellite 3D model", "rocket 3D model", "planet 3D model"],
  },
  Weapons: {
    singular: "weapon",
    blurb: "Swords, shields, bows, blasters and siege engines",
    keywords: ["weapon 3D models free", "sword 3D model", "gun 3D model", "shield 3D model", "bow 3D model", "low poly weapons"],
  },
  Props: {
    singular: "prop",
    blurb: "Game kits, dungeons, tools and decorations",
    keywords: ["3D props free", "dungeon 3D models", "game kit 3D", "modular 3D kit", "low poly props", "treasure chest 3D model"],
  },
};

/** URL segment of a category's landing page: "God of War" → "god-of-war". */
export function categorySlug(category: Category): string {
  return category.toLowerCase().replace(/\s+/g, "-");
}

export function categoryFromSlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => categorySlug(c) === slug);
}

export interface SourceInfo {
  key: SourceKey;
  license: string;
  licenseName: string;
  /** Compact label for badges and pack cards. */
  licenseShort: string;
  /** What reuse asks of you — shown on model pages and in ATTRIBUTION.txt. */
  terms: string;
  /** Notice for exported files (glTF asset.copyright). */
  copyright: string;
  licenseUrl: string;
  /** License text shipped in zips (public path). */
  licenseFile: string;
}

export const SOURCES: Record<SourceKey, SourceInfo> = {
  mit: {
    key: "mit",
    license: "MIT",
    licenseName: "MIT License",
    licenseShort: "MIT",
    terms: "Keep the included license file with the model when you ship or share it",
    // MIT requires the copyright notice to travel with every copy.
    copyright: `${COPYRIGHT_LINE}. MIT License.`,
    licenseUrl: "https://opensource.org/licenses/MIT",
    licenseFile: "/licenses/MIT.txt",
  },
  cc0: {
    key: "cc0",
    license: "CC0-1.0",
    licenseName: "CC0 1.0 — public domain",
    licenseShort: "CC0",
    terms: "No attribution required",
    copyright: "CC0 1.0 (public domain).",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    licenseFile: "/licenses/CC0-1.0.txt",
  },
  "public-domain": {
    key: "public-domain",
    license: "Public domain",
    licenseName: "Public domain",
    licenseShort: "Public domain",
    terms: "No attribution required; don't use insignia or logos shown on the model to imply endorsement",
    copyright: "Public domain.",
    licenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
    licenseFile: "/licenses/PUBLIC-DOMAIN.txt",
  },
  "cc-by": {
    key: "cc-by",
    license: "CC-BY-4.0",
    licenseName: "CC BY 4.0",
    licenseShort: "CC BY",
    terms: "Credit the author (named on the model page, in the file and in ATTRIBUTION.txt) when you use or share it",
    copyright: "CC BY 4.0 — credit the author named in each model.",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    licenseFile: "/licenses/CC-BY-4.0.txt",
  },
  "cc-by-nd": {
    key: "cc-by-nd",
    license: "CC-BY-ND-4.0",
    licenseName: "CC BY-ND 4.0",
    licenseShort: "CC BY-ND",
    terms: "Credit the author (named on the model page, in the file and in ATTRIBUTION.txt) when you use or share it, and share only unmodified copies",
    copyright: "CC BY-ND 4.0 — credit the author named in each model; share only unmodified copies.",
    licenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/",
    licenseFile: "/licenses/CC-BY-ND-4.0.txt",
  },
};

// --- Models -----------------------------------------------------------------------------------

export interface ModelStats {
  triangles: number;
  vertices: number;
  bones: number | null;
  materials: number;
  textures: number;
  /** Bounding box size in metres: [x, y, z]. */
  size: [number, number, number];
}

export interface ModelEntry {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  category: Category;
  collection: string;
  collectionKey: string;
  source: SourceKey;
  kind: "human" | "animal" | "object";
  /** Character-library group (Adults / Professions / Children / Animals); null for the imported library. */
  group: string | null;
  gender: Gender | null;
  role: string | null;
  species: string | null;
  animationSet: "f" | "m" | null;
  rigged: boolean;
  glb: string;
  glbBytes: number;
  thumb: { src: string; width: number; height: number } | null;
  stats: ModelStats;
  /** Open Graph image (public path). */
  og: string;
  /** The original author, for licenses that require credit (CC BY). */
  credit: Credit | null;
}

export interface AnimationEntry {
  id: string;
  label: string;
  set: "f" | "m";
  file: string;
  duration: number;
  bytes: number;
}

interface RocketboxCatalog {
  license: { spdx: string; holder: string; year: number; text: string };
  textureSize: number;
  animations: AnimationEntry[];
  models: (Omit<ModelEntry, "category" | "collection" | "collectionKey" | "source" | "group" | "rigged" | "og"> & { category: string })[];
}

interface LibraryCatalog {
  models: {
    id: string;
    slug: string;
    title: string;
    source: SourceKey;
    collection: string;
    collectionKey: string;
    category: Category;
    glb: string;
    glbBytes: number;
    thumb: ModelEntry["thumb"];
    stats: { triangles: number; vertices: number; materials: number; textures: number; animations?: number; rigged: boolean; size: [number, number, number] };
    credit?: Credit;
  }[];
}

const rocketbox = rocketboxData as unknown as RocketboxCatalog;
const library = libraryData as unknown as LibraryCatalog;

/** Legacy export: character-library license + animation data. */
export const catalog = { license: rocketbox.license, textureSize: rocketbox.textureSize, animations: rocketbox.animations };

const rocketboxModels: ModelEntry[] = rocketbox.models.map((m) => ({
  ...m,
  category: m.kind === "animal" ? "Animals" : "Characters",
  group: m.category,
  collection: `Rigged ${m.category}`,
  collectionKey: `rigged-${m.category.toLowerCase()}`,
  source: "mit",
  rigged: true,
  og: `/og/${m.slug}.jpg`,
  credit: null,
}));

const libraryModels: ModelEntry[] = library.models
  .filter((m) => m.thumb)
  .map((m) => {
    const collection = m.collection;
    const category = refineCategory({ title: m.title, category: m.category, collectionKey: m.collectionKey, rigged: m.stats.rigged }) as Category;
    const isGodOfWarCharacter = category === "God of War" && (m.stats.rigged || /kratos|spartan/i.test(m.title));
    return {
      id: m.id,
      slug: m.slug,
      title: m.title,
      subtitle: `${collection}`,
      category,
      collection,
      collectionKey: m.collectionKey,
      source: m.source,
      kind: category === "Characters" || category === "God of War" || category === "Skeletons" ? "human" : category === "Animals" ? "animal" : "object",
      group: null,
      gender: isGodOfWarCharacter ? "male" : null,
      role: isGodOfWarCharacter ? "Warrior" : null,
      species: null,
      animationSet: isGodOfWarCharacter || (m.stats.animations ?? 0) > 0 || (m.stats.rigged && category === "Characters") ? "m" : null,
      rigged: m.stats.rigged || isGodOfWarCharacter,
      glb: m.glb,
      glbBytes: m.glbBytes,
      thumb: m.thumb,
      stats: { triangles: m.stats.triangles, vertices: m.stats.vertices, bones: null, materials: m.stats.materials, textures: m.stats.textures, size: m.stats.size },
      og: `/og/category-${categorySlug(category)}.jpg`,
      credit: m.credit ?? null,
    };
  });

/** Every model on the site: rigged characters first, then the imported library. */
export const models: ModelEntry[] = [...rocketboxModels, ...libraryModels];
export const riggedCount = models.filter((m) => m.rigged).length;

const bySlug = new Map(models.map((m) => [m.slug, m]));
const byId = new Map(models.map((m) => [m.id, m]));

export function getModel(slug: string): ModelEntry | undefined {
  return bySlug.get(slug);
}

export function getModelById(id: string): ModelEntry | undefined {
  return byId.get(id);
}

export function countBy(category: Category): number {
  return models.filter((m) => m.category === category).length;
}

export function countByGroup(group: string): number {
  return rocketboxModels.filter((m) => m.group === group).length;
}

export function sourceOf(m: ModelEntry): SourceInfo {
  return SOURCES[m.source];
}

// --- Animations (Biped) -----------------------------------------------------------------------

/** A clip available in both a female (f_) and male (m_) version. */
export interface ClipGroup {
  key: string;
  label: string;
  female: AnimationEntry | null;
  male: AnimationEntry | null;
}

export function animationsFor(model: ModelEntry): AnimationEntry[] {
  if (model.id === "god-of-war-spartan-warrior") {
    return [
      { id: "embedded:idle", label: "Combat Idle", set: "m", file: "embedded:idle", duration: 1.5, bytes: 0 },
      { id: "embedded:atk01", label: "Sword Attack", set: "m", file: "embedded:atk01", duration: 1.2, bytes: 0 },
      { id: "embedded:win", label: "Victory Shout", set: "m", file: "embedded:win", duration: 2.0, bytes: 0 },
      { id: "embedded:hurt", label: "Battle Hurt", set: "m", file: "embedded:hurt", duration: 0.8, bytes: 0 },
      { id: "embedded:mv_tar21", label: "Shield Charge", set: "m", file: "embedded:mv_tar21", duration: 1.0, bytes: 0 },
      { id: "embedded:enter", label: "Battle Stance", set: "m", file: "embedded:enter", duration: 1.5, bytes: 0 },
      ...catalog.animations.filter((a) => a.set === "m"),
    ];
  }
  if (!model.animationSet) return [];
  return catalog.animations.filter((a) => a.set === model.animationSet);
}

export function clipGroups(): ClipGroup[] {
  const groups = new Map<string, ClipGroup>();
  for (const a of catalog.animations) {
    const key = a.id.slice(2);
    const group = groups.get(key) ?? { key, label: a.label, female: null, male: null };
    if (a.set === "f") group.female = a;
    else group.male = a;
    groups.set(key, group);
  }
  return [...groups.values()];
}

// --- Cards & collections ----------------------------------------------------------------------

/** The subset of a model the gallery cards need (keeps the client payload small). */
export interface CardModel {
  slug: string;
  title: string;
  subtitle: string;
  category: Category;
  collection: string;
  source: SourceKey;
  gender: Gender | null;
  role: string | null;
  thumb: ModelEntry["thumb"];
  triangles: number;
  glbBytes: number;
}

export function toCard(m: ModelEntry): CardModel {
  return {
    slug: m.slug,
    title: m.title,
    subtitle: m.subtitle,
    category: m.category,
    collection: m.collection,
    source: m.source,
    gender: m.gender,
    role: m.role,
    thumb: m.thumb,
    triangles: m.stats.triangles,
    glbBytes: m.glbBytes,
  };
}

/** Cards as JSON for the gallery's static data files (null fields dropped to keep them small). */
export function cardsJson(list: ModelEntry[]): string {
  return JSON.stringify(list.map(toCard), (_key, value) => (value === null ? undefined : value));
}

export interface CollectionInfo {
  key: string;
  name: string;
  category: Category;
  /** The license of most of its models. */
  source: SourceKey;
  /** Every license in it (a collection can mix them, e.g. CC BY and CC BY-ND hair). */
  sources: SourceKey[];
  count: number;
  bytes: number;
  models: ModelEntry[];
}

let collectionCache: CollectionInfo[] | null = null;

export function allCollections(): CollectionInfo[] {
  if (collectionCache) return collectionCache;
  const map = new Map<string, CollectionInfo>();
  for (const m of models) {
    const c = map.get(m.collectionKey) ?? { key: m.collectionKey, name: m.collection, category: m.category, source: m.source, sources: [], count: 0, bytes: 0, models: [] };
    c.count++;
    c.bytes += m.glbBytes;
    c.models.push(m);
    map.set(m.collectionKey, c);
  }
  // A collection's category and license are the ones most of its models have.
  const mostCommon = <T,>(values: T[]) => {
    const tally = new Map<T, number>();
    for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  };
  for (const c of map.values()) {
    c.category = mostCommon(c.models.map((m) => m.category))[0];
    c.sources = mostCommon(c.models.map((m) => m.source));
    c.source = c.sources[0];
  }
  collectionCache = [...map.values()].sort(
    (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name),
  );
  return collectionCache;
}

export function getCollection(key: string): CollectionInfo | undefined {
  return allCollections().find((c) => c.key === key);
}

/** Representative models for a category tile (prefers ones with thumbnails, varied collections). */
export function categoryShowcase(category: Category, count = 3): ModelEntry[] {
  const picks = SHOWCASE[category].map(getModelById).filter((m): m is ModelEntry => !!m);
  if (picks.length >= count) return picks.slice(0, count);
  // Prefer substantial models (skip the heaviest 5% and small kit parts), from different collections.
  const candidates = models.filter((m) => m.category === category && m.thumb && !picks.includes(m)).sort((a, b) => b.stats.triangles - a.stats.triangles);
  const rest = candidates.slice(Math.floor(candidates.length * 0.05));
  const seen = new Set(picks.map((m) => m.collectionKey));
  for (const m of rest) {
    if (picks.length >= count) break;
    if (!seen.has(m.collectionKey)) {
      picks.push(m);
      seen.add(m.collectionKey);
    }
  }
  for (const m of rest) if (picks.length < count && !picks.includes(m)) picks.push(m);
  return picks.slice(0, count);
}

const SHOWCASE: Record<Category, string[]> = {
  Hair: ["hair-side-swept-bob", "hair-stylized-hair", "hair-honoka-hair"],
  "God of War": ["god-of-war-kratos", "god-of-war-spartan-warrior", "god-of-war-spartan-archer"],
  Skeletons: ["character-pack-skeletons-Skeleton_Warrior", "character-pack-skeletons-Skeleton_Mage", "character-pack-skeletons-Skeleton_Rogue"],
  Bikes: ["bikes-cyberpunk-motorbike", "bikes-chopper-motorcycle", "bikes-carbon-racing-bike"],
  Gaming: ["gaming-combat-soldier", "mini-arcade-arcade-machine", "gaming-dungeon-war-arena"],
  Characters: ["Business_Male_01", "Female_Adult_01", "Police_Female_01"],
  Animals: ["Horse_Brown_Saddle_01", "Dog_Beagle_01", "Bird_Rooster_Brown_01"],
  Vehicles: ["car-kit-police", "car-kit-firetruck", "car-kit-taxi"],
  Buildings: ["city-kit-suburban-building-type-b", "city-kit-suburban-building-type-d", "city-kit-suburban-building-type-e"],
  Furniture: ["furniture-kit-loungeSofa", "furniture-bits-bed_double_A", "furniture-kit-kitchenFridgeLarge"],
  Food: ["food-kit-burger-cheese-double", "food-kit-cake-birthday", "food-kit-pizza"],
  Nature: ["nature-kit-cactus_tall", "nature-kit-mushroom_redGroup", "nature-kit-flower_redA"],
  Trees: ["avatar-garden-Tree01", "nature-kit-tree_palmDetailedTall", "holiday-kit-tree-decorated"],
  Space: ["space-base-bits-lander_A", "Apollo Lunar Module", "Space Shuttle (C)"],
  Weapons: ["blaster-kit-blaster-g", "character-pack-adventures-sword_2handed_color", "castle-kit-siege-catapult"],
  Props: ["dungeon-remastered-chest_gold", "mini-arcade-arcade-machine", "pirate-kit-cannon"],
};

// --- Descriptions -----------------------------------------------------------------------------

export function describeModel(m: ModelEntry): string {
  const tris = formatNumber(m.stats.triangles);
  if (m.source === "mit") {
    if (m.kind === "animal") {
      return `Rigged, textured 3D ${m.title.toLowerCase()}: ${tris} triangles and ${m.stats.bones} bones, optimized for real-time engines and the web.`;
    }
    const who = m.role ? `${m.role.toLowerCase()} character` : m.group === "Children" ? "child character" : "adult character";
    return `Fully rigged ${m.gender} ${who}: ${tris} triangles, ${m.stats.bones}-bone Biped skeleton and ${m.stats.textures} PBR textures. Animation-ready and optimized for real-time engines and the web.`;
  }
  const what = `${m.rigged ? "rigged " : ""}3D ${CATEGORY_INFO[m.category].singular} model`;
  return `Free ${what} “${m.title}” from the ${m.collection} collection: ${tris} triangles${m.stats.textures ? `, ${m.stats.textures} texture${m.stats.textures === 1 ? "" : "s"}` : ""}. Single-file GLB, optimized for games, AR/VR and the web.`;
}

// --- Download packs ---------------------------------------------------------------------------

export interface PackFile {
  url: string;
  /** Path inside the zip. */
  path: string;
}

export interface DownloadPack {
  key: string;
  title: string;
  description: string;
  filename: string;
  files: PackFile[];
  /** License texts to include (public path → path inside the zip). */
  licenses: PackFile[];
  /** License lines for ATTRIBUTION.txt. */
  notice: string[];
  /** Listed in ATTRIBUTION.txt. */
  credits: { title: string; id: string; credit?: string }[];
  bytes: number;
  readme?: string;
}

const PACK_PREFIX = "3d-models";

function licensesFor(sources: SourceKey[]): { licenses: PackFile[]; notice: string[] } {
  const unique = [...new Set(sources)];
  const files = new Map<string, PackFile>();
  for (const key of unique) {
    const s = SOURCES[key];
    if (!files.has(s.licenseFile)) {
      files.set(s.licenseFile, { url: s.licenseFile, path: unique.length === 1 ? "LICENSE.txt" : `LICENSE-${s.license.replace(/\W+/g, "-")}.txt` });
    }
  }
  return {
    licenses: [...files.values()],
    notice: unique.map((key) => `License: ${SOURCES[key].licenseName}. ${SOURCES[key].terms}.`),
  };
}

function clipFiles(clips: AnimationEntry[], folder: (a: AnimationEntry) => string): PackFile[] {
  return clips.map((a) => ({ url: a.file, path: `${folder(a)}${a.id}.glb` }));
}

function clipCredits(clips: AnimationEntry[]) {
  return clips.map((a) => ({ title: `${a.label} animation (${a.set === "f" ? "female" : "male"})`, id: a.id }));
}

function modelCredit(m: ModelEntry): DownloadPack["credits"][number] {
  return { title: m.title, id: m.id, ...(m.credit ? { credit: creditLine(m.credit) } : {}) };
}

/** One model plus (for Biped humans) every animation clip made for its skeleton. */
export function completePack(m: ModelEntry): DownloadPack {
  const clips = animationsFor(m);
  const readme = [
    `${m.title} (${m.id}) — complete pack`,
    "",
    `${m.id}.glb`,
    `  ${m.rigged ? "Rigged 3D model" : "3D model"}, glTF 2.0 binary: geometry${m.stats.textures ? " and textures" : ""} in one file.`,
    ...(clips.length
      ? [
          "",
          "animations/*.glb",
          "  Skeleton-only animation clips for the same Biped rig. Load the model and a clip, then play the",
          "  clip on the model — the bone names match." +
            (m.group === "Children" ? ' This child model names its root "Bip02"; clips use "Bip01".' : ""),
        ]
      : []),
    "",
    "The files use the EXT_meshopt_compression and EXT_texture_webp glTF extensions",
    "(three.js: GLTFLoader with MeshoptDecoder; Babylon.js supports both out of the box).",
    "",
  ].join("\n");
  return {
    key: `complete-${m.slug}`,
    title: `${m.title} — complete pack`,
    description: clips.length ? `Model + ${clips.length} animations + license` : "Model + license + readme",
    filename: `${m.id}-complete.zip`,
    files: [{ url: m.glb, path: `${m.id}.glb` }, ...clipFiles(clips, () => "animations/")],
    ...licensesFor([m.source]),
    credits: [modelCredit(m), ...clipCredits(clips)],
    bytes: m.glbBytes + clips.reduce((n, a) => n + a.bytes, 0),
    readme,
  };
}

export function collectionPack(key: string): DownloadPack | null {
  const c = getCollection(key);
  if (!c) return null;
  return {
    key: `collection-${key}`,
    title: `${c.name} pack`,
    description: `All ${c.count} models in ${c.name}`,
    filename: `${PACK_PREFIX}-${key}.zip`,
    files: c.models.map((m) => ({ url: m.glb, path: `${key}/${m.id}.glb` })),
    ...licensesFor(c.sources),
    credits: c.models.map(modelCredit),
    bytes: c.bytes,
  };
}

export function animationsPack(): DownloadPack {
  const clips = catalog.animations;
  return {
    key: "animations",
    title: "Animations pack",
    description: `All ${clips.length} clips, female + male`,
    filename: `${PACK_PREFIX}-animations.zip`,
    files: clipFiles(clips, (a) => `animations/${a.set === "f" ? "female" : "male"}/`),
    ...licensesFor(["mit"]),
    credits: clipCredits(clips),
    bytes: clips.reduce((n, a) => n + a.bytes, 0),
  };
}

/** What a pack card needs; the full file list is loaded from `manifest` on click. */
export interface PackSummary {
  key: string;
  title: string;
  description: string;
  count: number;
  bytes: number;
  manifest: string;
  source: SourceKey;
}

export function collectionPackSummary(c: CollectionInfo): PackSummary {
  return {
    key: c.key,
    title: c.name,
    description: `${c.count} model${c.count === 1 ? "" : "s"} · ${c.sources.map((s) => SOURCES[s].licenseShort).join(" / ")}`,
    count: c.count,
    bytes: c.bytes,
    manifest: `/data/packs/${c.key}.json`,
    source: c.source,
  };
}

export function animationsPackSummary(): PackSummary {
  const clips = catalog.animations;
  return {
    key: "animations",
    title: "Character animations",
    description: `${clips.length} clips, female + male · ${SOURCES.mit.licenseShort}`,
    count: clips.length,
    bytes: clips.reduce((n, a) => n + a.bytes, 0),
    manifest: "/data/packs/animations.json",
    source: "mit",
  };
}

/** Packs highlighted on the home page; everything else lives on /packs/. */
export function featuredPacks(): PackSummary[] {
  const keys = ["rigged-professions", "rigged-adults", "car-kit", "city-kit-suburban", "furniture-kit"];
  const picks = keys.map(getCollection).filter((c): c is CollectionInfo => !!c).map(collectionPackSummary);
  return [...picks, animationsPackSummary()];
}

/** Every pack, grouped by category, for /packs/. */
export function packsByCategory(): { category: Category; packs: PackSummary[] }[] {
  return CATEGORIES.map((category) => ({
    category,
    packs: [
      ...allCollections().filter((c) => c.category === category).map(collectionPackSummary),
      ...(category === "Characters" ? [animationsPackSummary()] : []),
    ],
  })).filter((g) => g.packs.length > 0);
}
