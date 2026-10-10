import fs from "node:fs";
import path from "node:path";
import { models, type ModelEntry } from "@/lib/catalog";
import type { GameEntry } from "@/lib/games";

/** Server-side helpers linking a game's model keys to the catalog (sizes for the loader, cards for the games page). */

const byGlb = new Map(models.map((m) => [m.glb, m]));

/** Library keys ("kit/name") or absolute paths without extension ("/models/name", "/animations/name"). */
export function libraryModel(key: string): ModelEntry | undefined {
  return byGlb.get(key.startsWith("/") ? `${key}.glb` : `/library/${key}.glb`);
}

/** Bytes per model key, so a game's loading bar is exact from the first frame. */
export function modelSizes(keys: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const m = libraryModel(key);
    if (m) out[key] = m.glbBytes;
    else {
      // Not in the catalog (e.g. animation clips): read the size from the file itself.
      const url = key.startsWith("/") ? `${key}.glb` : `/library/${key}.glb`;
      try {
        out[key] = fs.statSync(path.join(process.cwd(), "public", url)).size;
      } catch {
        // Unknown file: the loader falls back to Content-Length.
      }
    }
  }
  return out;
}

/** The catalog entries of every model a game uses (unknown keys skipped). */
export function gameModels(game: GameEntry): ModelEntry[] {
  return [...new Set(game.models)].map(libraryModel).filter((m): m is ModelEntry => !!m);
}

/** Everything the game downloads, including files outside the catalog (animation clips). */
export function gameDownloadBytes(game: GameEntry): number {
  return Object.values(modelSizes(game.models)).reduce((n, b) => n + b, 0);
}
