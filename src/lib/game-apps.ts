import fs from "node:fs";
import path from "node:path";

/** A game's Android app: the APK in public/downloads/, described by the JSON scripts/build-android.mjs writes next to it. */
export interface AndroidApp {
  /** Public URL of the APK. */
  apk: string;
  version: string;
  bytes: number;
  sha256: string;
  /** Oldest Android version it installs on, e.g. "7.0". */
  minAndroid: string;
}

/** Read at build time; null when the game has no APK yet. */
export function androidApp(slug: string): AndroidApp | null {
  const dir = path.join(process.cwd(), "public", "downloads");
  try {
    const info = JSON.parse(fs.readFileSync(path.join(dir, `${slug}.json`), "utf8"));
    if (!fs.existsSync(path.join(dir, `${slug}.apk`))) return null;
    return { apk: `/downloads/${slug}.apk`, version: info.version, bytes: info.bytes, sha256: info.sha256, minAndroid: info.minAndroid };
  } catch {
    return null;
  }
}
