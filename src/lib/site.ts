/** Brand and SEO settings — change these to rename the site or move it to another domain. */
export const SITE = {
  /** Site name in page titles, credits and metadata — all lowercase, like the domain. */
  name: "games.codelove.in",
  /** Short name in the header logo and on the installed app's home-screen icon. */
  shortName: "3D Games",
  /** Publisher name shown in credits, Open Graph and structured data. */
  brand: "games.codelove.in",
  /** Who made the site and its games. */
  author: "Gowtham",
  /** Contact address. */
  email: "support@codelove.in",
  /** Production origin, no trailing slash. Override with NEXT_PUBLIC_SITE_URL. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://games.codelove.in").replace(/\/$/, ""),
  tagline: "Free 3D games",
  description:
    "Free 3D games you play in the browser — kart racing, skating, tower defense, a dungeon crawler, cooking, mini golf, puzzles and strategy. No download, no sign-up, on PC or phone.",
  keywords: [
    "free 3D games online",
    "free 3D games",
    "3D games",
    "free games online",
    "free online games no download",
    "browser games",
    "three.js games",
    "games.codelove.in",
  ],
  locale: "en_US",
  themeColor: "#1b1425",
};

/**
 * The 3D model library the games are built from: a CodeLove site of its own. Model pages, the scene builder and
 * the policies live there, so links to them leave this site.
 */
export const MODELS_SITE = { name: "models.codelove.in", url: "https://models.codelove.in" };

/** Absolute URL of a page on the model library, e.g. modelsUrl("/models/"). */
export const modelsUrl = (path = "/") => `${MODELS_SITE.url}${path}`;

/**
 * CodeLove, the network this site is part of: its main site and its other tools, linked from the footer.
 * These are all the CodeLove sites there are — don't link any other codelove.in subdomain.
 */
export const CODELOVE = {
  name: "CodeLove",
  url: "https://codelove.in",
  tools: [
    { name: "Free 3D Models", url: MODELS_SITE.url },
    { name: "Instagram & Pinterest Downloader", url: "https://downloader.codelove.in" },
    { name: "Link in Bio", url: "https://linkinbio.codelove.in" },
    { name: "Video to GIF", url: "https://videotogif.codelove.in" },
    { name: "Video to Images", url: "https://videotoimages.codelove.in" },
    { name: "Free YouTube Automation", url: "https://utubeflow.codelove.in" },
    { name: "Free Java Games", url: "https://javaplay.codelove.in" },
  ],
  /** Guides on the main site about the games and the models they are built from (footer "Guides"). */
  guides: [
    { name: "CodeLove Games", url: "https://codelove.in/products/games" },
    { name: "How to use free 3D models", url: "https://codelove.in/learn/guide/how-to-use-free-3d-models" },
  ],
};

/** Credit line on every game: in the game itself, on its page and in its metadata. */
export const GAME_CREDIT = `Created by ${SITE.author} · Published by ${SITE.brand}`;

/** Absolute URL on the production origin (for canonical links, Open Graph, sitemap, JSON-LD). */
export function absoluteUrl(path = "/"): string {
  return new URL(path, `${SITE.url}/`).toString();
}
