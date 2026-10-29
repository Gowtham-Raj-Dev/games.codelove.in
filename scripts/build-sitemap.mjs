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

/**
 * A game's trailer, read from its manifest (src/components/games/<slug>/manifest.ts), so its page gets a
 * <video:video> entry and the trailer can show in Google's Videos tab. Titles name CodeLove, so a search for
 * "codelove" finds them. Same upload date as the VideoObject on the game's page.
 */
const UPLOADED = "2026-10-07";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function trailerOf(slug) {
  const file = path.join(ROOT, "src", "components", "games", slug, "manifest.ts");
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8");
  if (/comingSoon:\s*true/.test(src)) return null;
  const t = /trailer:\s*\{([^}]*)\}/.exec(src)?.[1];
  if (!t) return null;
  const str = (key, from = src) => new RegExp(`${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from)?.[1];
  return {
    title: str("title"),
    tagline: str("tagline") ?? "",
    description: str("description") ?? "",
    video: str("hd", t) ?? str("src", t),
    poster: str("poster", t),
    seconds: Number(/seconds:\s*(\d+)/.exec(t)?.[1] ?? 0),
  };
}
const videoXml = (slug) => {
  const v = trailerOf(slug);
  if (!v?.title || !v.video || !v.poster) return "";
  const desc = `${v.tagline} ${v.description} Play it free in your browser on games.codelove.in, part of CodeLove.`.slice(0, 2048);
  return `
    <video:video>
      <video:thumbnail_loc>${SITE}${v.poster}</video:thumbnail_loc>
      <video:title>${esc(`${v.title} — free 3D game by CodeLove (gameplay trailer)`)}</video:title>
      <video:description>${esc(desc)}</video:description>
      <video:content_loc>${SITE}${v.video}</video:content_loc>
      <video:player_loc>${SITE}/${slug}/</video:player_loc>
      ${v.seconds ? `<video:duration>${v.seconds}</video:duration>` : ""}
      <video:publication_date>${UPLOADED}</video:publication_date>
      <video:tag>CodeLove</video:tag>
      <video:tag>free 3D games</video:tag>
      <video:tag>${esc(v.title)}</video:tag>
    </video:video>`;
};
let videos = 0;
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${paths
  .map((p) => {
    const slug = /^\/([^/]+)\/$/.exec(p)?.[1];
    const video = slug && games.includes(slug) ? videoXml(slug) : "";
    if (video) videos++;
    return `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>${video}\n  </url>`;
  })
  .join("\n")}
</urlset>
`;
fs.mkdirSync(path.join(ROOT, "public"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "public", "sitemap.xml"), xml);
console.log(`build-sitemap: ${paths.length} URLs (${games.length} games, ${pages.length} other pages), ${videos} trailers`);
