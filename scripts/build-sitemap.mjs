#!/usr/bin/env node
/**
 * Writes public/sitemap.xml before every build: the home page, every game's page and its player (coming-soon games
 * too — every page is open to search engines), then every other fixed page (about / contact / privacy …, found from
 * the folders in src/app that have a page.tsx). A game is a folder in src/app with a play/ route.
 * Every URL gets today's date as <lastmod> (set at build time), changefreq "daily" and priority 1.0. Paths end in a
 * slash, like the canonical URLs (next.config trailingSlash).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "src", "app");
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://games.codelove.in").replace(/\/$/, "");

const folders = fs.readdirSync(APP, { withFileTypes: true }).filter((d) => d.isDirectory());
const isGame = (name) => fs.existsSync(path.join(APP, name, "play", "page.tsx"));

const games = folders
  .filter((d) => isGame(d.name))
  .map((d) => d.name)
  .sort();

/** Fixed pages: src/app/<name>/page.tsx that isn't a game, a [dynamic] route, a (group) or a _private folder. */
const pages = folders
  .map((d) => d.name)
  .filter((name) => !isGame(name) && !/^[[(_]/.test(name) && fs.existsSync(path.join(APP, name, "page.tsx")))
  .sort();

const lastmod = new Date().toISOString().slice(0, 10);
const paths = ["/", ...games.flatMap((slug) => [`/${slug}/`, `/${slug}/play/`]), ...pages.map((name) => `/${name}/`)];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
  .map(
    (p) =>
      `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;
fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "public", "sitemap.xml"), xml);
console.log(`build-sitemap: ${paths.length} URLs (${games.length} games, ${pages.length} other pages)`);
