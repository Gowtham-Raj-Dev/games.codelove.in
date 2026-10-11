#!/usr/bin/env node
/**
 * Serves dist-playables/ the way YouTube serves a Playable: every page carries YouTube's
 * Content-Security-Policy (from the Playables test suite guide), so a request outside the bundle, or
 * anything else the sandbox forbids, fails here as it would on YouTube.
 *
 *   npm run playables:serve            http://localhost:4173/<slug>/
 *   PORT=5000 npm run playables:serve
 *
 * Give those URLs to the test suite: https://developers.google.com/youtube/gaming/playables/test_suite
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "dist-playables");
const PORT = Number(process.env.PORT) || 4173;
const CSP =
  "default-src 'none'; script-src 'report-sample' 'self' 'unsafe-eval' 'unsafe-inline' blob: https://www.youtube.com/game_api/v0 https://www.youtube.com/game_api/v0/ https://www.youtube.com/game_api/v1 https://www.youtube.com/game_api/v1/; object-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'self' blob: data:; sandbox allow-pointer-lock allow-same-origin allow-scripts; base-uri 'self'; manifest-src 'self'; worker-src 'self' blob:";
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".glb": "model/gltf-binary",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

if (!fs.existsSync(ROOT)) {
  console.error("serve-playables: nothing built yet — run `npm run playables:build -- all` first");
  process.exit(1);
}
const games = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, e.name, "index.html"))).map((e) => e.name);

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") {
      res.writeHead(200, { "Content-Type": TYPES[".html"] });
      res.end(`<!doctype html><meta charset="utf-8"><title>Playables builds</title><h1>Playables builds</h1><ul>${games.map((g) => `<li><a href="/${g}/">${g}</a></li>`).join("")}</ul>`);
      return;
    }
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      // A folder without its slash: relative paths need it.
      if (games.includes(rel.slice(1))) {
        res.writeHead(302, { Location: `${rel}/` });
        res.end();
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(file);
    const headers = { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "no-store" };
    if (ext === ".html") headers["Content-Security-Policy"] = CSP;
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`Playables builds (with YouTube's Content-Security-Policy) on http://localhost:${PORT}`);
    for (const g of games) console.log(`  http://localhost:${PORT}/${g}/`);
  });
