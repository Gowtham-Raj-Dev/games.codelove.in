#!/usr/bin/env node
/**
 * Copies the files the games need from the model library's project into public/:
 *   games/      covers, trailers, backdrops, music, the Patti Veedu app
 *   library/, models/, animations/   only the models the games load (each game's `models` list)
 *   thumbs/     the thumbnails of those models (shown on each game's page)
 *   decoders/, downloads/ (Android apps)
 * The site's own icons (public/icons/) are not copied: `npm run icons` draws them from src/app/icon.svg.
 *
 *   node scripts/sync-assets.mjs              (the library is ../Models.Codelove.in)
 *   SOURCE=path/to/Models.Codelove.in node scripts/sync-assets.mjs
 *
 * Run it after adding a model to a game or changing a game's files in the library project. Files that are
 * already here with the same size and date are skipped; nothing is deleted.
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.resolve(process.env.SOURCE ?? path.join(ROOT, "..", "Models.Codelove.in"));
const FROM = path.join(SOURCE, "public");
const TO = path.join(ROOT, "public");
if (!fs.existsSync(path.join(FROM, "library"))) {
  console.error(`model library not found at ${SOURCE} — set SOURCE=path/to/Models.Codelove.in`);
  process.exit(1);
}

let copied = 0;
let bytes = 0;
const missing = [];

function copyFile(rel) {
  const from = path.join(FROM, rel);
  const to = path.join(TO, rel);
  const stat = fs.statSync(from, { throwIfNoEntry: false });
  if (!stat?.isFile()) return void missing.push(rel);
  const have = fs.statSync(to, { throwIfNoEntry: false });
  if (have && have.size === stat.size && have.mtimeMs >= stat.mtimeMs) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
  bytes += stat.size;
}

function copyDir(rel) {
  const dir = path.join(FROM, rel);
  if (!fs.existsSync(dir)) return void missing.push(rel);
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) copyFile(path.relative(FROM, path.join(entry.parentPath, entry.name)));
  }
}

// The games' model lists and the catalog live in TypeScript: bundle them to read them here.
const bundle = path.join(ROOT, "node_modules", ".cache", "sync-assets.mjs");
await build({
  stdin: {
    contents: `import { games } from "@/lib/games"; import { gameModels } from "@/lib/game-models";
      export const list = games.map((g) => ({ models: [...new Set(g.models)], thumbs: gameModels(g).map((m) => m.thumb?.src).filter(Boolean) }));`,
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  alias: { "@": path.join(ROOT, "src") },
  loader: { ".json": "json" },
  outfile: bundle,
  logLevel: "error",
});
const { list } = await import(`${pathToFileURL(bundle).href}?${Date.now()}`);

for (const dir of ["games", "decoders", "downloads"]) copyDir(dir);
for (const game of list) {
  for (const key of game.models) copyFile(key.startsWith("/") ? `${key.slice(1)}.glb` : `library/${key}.glb`);
  for (const thumb of game.thumbs) copyFile(thumb.replace(/^\//, ""));
}

console.log(`sync-assets: copied ${copied} file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB`);
if (missing.length) console.warn(`sync-assets: ${missing.length} not found in ${FROM}:\n  ${missing.slice(0, 20).join("\n  ")}${missing.length > 20 ? "\n  …" : ""}`);
