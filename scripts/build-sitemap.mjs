#!/usr/bin/env node
/**
 * Writes public/sitemap.xml before every build: the home page, for each game that can be played its page
 * and its player, then the about / contact / privacy pages (PAGES below — add a new fixed page there). A game is a folder in src/app with a play/ route; "coming soon" ones are left out (noindex).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "src", "app");
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://games.codelove.in").replace(/\/$/, "");

const games = fs
  .readdirSync(APP, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(APP, d.name, "play", "page.tsx")))
  .filter((d) => !fs.readFileSync(path.join(APP, d.name, "play", "page.tsx"), "utf8").includes("<ComingSoonPlay"))
  .map((d) => d.name)
  .sort();

const today = new Date().toISOString().slice(0, 10);
const PAGES = ["/about/", "/contact/", "/privacy/"];
const urls = ["/", ...games.flatMap((slug) => [`/${slug}/`, `/${slug}/play/`]), ...PAGES];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join("\n")}
</urlset>
`;
fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "public", "sitemap.xml"), xml);
console.log(`build-sitemap: ${urls.length} URLs (${games.length} games)`);
