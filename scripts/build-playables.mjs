#!/usr/bin/env node
/**
 * Builds a game for YouTube Playables (https://developers.google.com/youtube/gaming/playables):
 *
 *   npm run playables:build -- skate-rush   one game
 *   npm run playables:build -- all          every game below
 *     → dist-playables/<slug>/              index.html, game.js, game.css, fonts, models, pictures
 *     → dist-playables/<slug>-playables.zip the same, zipped for upload
 *
 * A stand-alone page (no Next.js): every path is relative and nothing is fetched from outside the
 * bundle except YouTube's SDK, which index.html loads before the game. The games follow the SDK's
 * rules (src/components/games/shared/playables.ts): cloud saves instead of localStorage, pause /
 * resume and mute from YouTube, firstFrameReady / gameReady, sendScore for the best score, and no
 * online rooms (the Firebase SDK is left out of the bundle).
 *
 * Patti Veedu is not a React game: its own page (public/games/patti-veedu/app) is copied and adapted
 * here (scripts/playables/patti-veedu.js is its link to the SDK).
 *
 * Test: `npm run playables:serve`, then give http://localhost:4173/<slug>/ to YouTube's test suite
 * (https://developers.google.com/youtube/gaming/playables/test_suite). The server sends YouTube's
 * Content-Security-Policy, so anything the bundle may not do fails here first.
 *
 * A React game needs an entry (scripts/playables/<slug>.tsx), a stylesheet with its fonts (<slug>.css,
 * fonts in ./fonts) and a line in GAMES below.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { zipSync } from "fflate";

const G = "./src/components/games";
/**
 * Per React game: what to read from its code (the manifest's GAME and the models loaded before the
 * menu, plus its shop lists) and the pictures its menus show.
 */
const GAMES = {
  "skate-rush": {
    data: `export { GAME, BASE_MODELS } from "${G}/skate-rush/manifest";\nexport { SKATERS, STAGES } from "${G}/skate-rush/content";`,
    pictures: ({ SKATERS, STAGES }) => [...SKATERS.map((s) => `library/${s.key}.webp`), ...STAGES.map((st) => `games/skate-rush/stages/${st.id}.webp`)],
  },
  "sky-hop": {
    data: `export { GAME, MODELS as BASE_MODELS } from "${G}/sky-hop/manifest";\nexport { HEROES } from "${G}/sky-hop/content";`,
    pictures: ({ HEROES }) => HEROES.map((h) => `library/${h.key}.webp`),
  },
  "crypt-knight": {
    data: `export { GAME, FIRST_MODELS as BASE_MODELS } from "${G}/crypt-knight/manifest";\nexport { HEROES } from "${G}/crypt-knight/content";`,
    pictures: ({ HEROES }) => HEROES.map((h) => `library/${h.key}.webp`),
  },
  "cannon-cove": {
    data: `export { GAME, MODELS as BASE_MODELS } from "${G}/cannon-cove/manifest";`,
    pictures: () => [],
  },
  "turbo-karts": {
    data: `export { GAME, MODELS as BASE_MODELS } from "${G}/turbo-karts/manifest";`,
    pictures: () => [],
  },
};
const STANDALONE = ["patti-veedu"];
const ALL = [...Object.keys(GAMES), ...STANDALONE];

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SRC = path.join(ROOT, "scripts", "playables");
const OUT_ROOT = path.join(ROOT, "dist-playables");
const SDK = "https://www.youtube.com/game_api/v1";
/** YouTube's limits: initial bundle < 30 MiB (should be < 15), every file < 30 MiB, at most 8000 files. */
const LIMITS = { initial: 30 * 1024 * 1024, file: 30 * 1024 * 1024, files: 8000 };

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

class BuildError extends Error {}
function fail(message) {
  throw new BuildError(message);
}

function copy(from, to) {
  if (!fs.existsSync(from)) fail(`missing ${path.relative(ROOT, from)} (run \`npm run assets:sync\`?)`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return fs.statSync(to).size;
}

/** The game's manifest and shop lists (bundled on the fly; they have no browser-only code). */
async function gameData(slug) {
  const result = await esbuild.build({
    stdin: { contents: GAMES[slug].data, resolveDir: ROOT, loader: "ts" },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmp = path.join(OUT_ROOT, `.manifest-${process.pid}.mjs`);
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(tmp, result.outputFiles[0].text);
  try {
    return await import(`${pathToFileURL(tmp).href}?${slug}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** glTF extensions a .glb needs (to ship the Draco / Basis decoders only when a model uses them). */
function glbExtensions(file) {
  const buf = fs.readFileSync(file);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString("utf8")).extensionsUsed ?? [];
}

/** Online rooms are switched off in Playables; this keeps the Firebase SDK out of the bundle altogether. */
const noFirebase = {
  name: "no-firebase",
  setup(build) {
    build.onResolve({ filter: /^(firebase\/|@\/lib\/firebase$)/ }, (args) => ({ path: args.path, namespace: "no-firebase" }));
    build.onLoad({ filter: /.*/, namespace: "no-firebase" }, (args) => ({ contents: args.path.startsWith("@/") ? "export const FIREBASE_CONFIG = {};" : "export {};", loader: "js" }));
  },
};

/**
 * `early`: a script that runs right after the SDK, before the stylesheet and the game — it starts the
 * download of the first screen's models while the browser is still reading the game's code.
 */
const page = (title, head, body, early = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>${title}</title>
<link rel="icon" href="data:,">
<script src="${SDK}"></script>${early ? `\n<script>${early}</script>` : ""}
${head}
</head>
<body>
${body}
</body>
</html>
`;

/** Checks YouTube's limits and zips the folder. `initial` = bytes downloaded before the menu. */
function finish(slug, out, initialOf) {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else files.push({ rel: path.relative(out, abs).split(path.sep).join("/"), bytes: fs.statSync(abs).size });
    }
  };
  walk(out);
  // YouTube: file names may only have letters, digits, "_", "-" and ".".
  const badNames = files.filter((f) => !/^[A-Za-z0-9_.\-/]+$/.test(f.rel));
  if (badNames.length) fail(`file names YouTube won't take: ${badNames.slice(0, 5).map((f) => f.rel).join(", ")}`);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  const largest = files.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  const initial = initialOf(files);
  if (files.length > LIMITS.files) fail(`${files.length} files (YouTube allows ${LIMITS.files})`);
  if (largest.bytes > LIMITS.file) fail(`${largest.rel} is ${mb(largest.bytes)} (YouTube allows 30 MiB per file)`);
  if (initial > LIMITS.initial) fail(`initial download ${mb(initial)} (YouTube allows 30 MiB)`);
  // Nothing in the bundle may point at another site (YouTube's CSP blocks it).
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  const outside = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => u !== SDK);
  if (outside.length) fail(`index.html loads from outside the bundle: ${outside.join(", ")}`);
  if (html.indexOf(`<script src="${SDK}">`) < 0 || html.indexOf(`<script src="${SDK}">`) > html.search(/<script(?! src="https:\/\/www\.youtube\.com)/)) fail("YouTube's SDK is not the first script of index.html");

  const zip = zipSync(Object.fromEntries(files.map((f) => [f.rel, [fs.readFileSync(path.join(out, f.rel)), { level: /\.(glb|pack|webp|woff2|jpg|png)$/.test(f.rel) ? 0 : 9 }]])));
  const zipFile = path.join(OUT_ROOT, `${slug}-playables.zip`);
  fs.writeFileSync(zipFile, zip);
  console.log(`  ${files.length} files, ${mb(total)} in all; first load (to the menu) ≈ ${mb(initial)}${initial > LIMITS.initial / 2 ? " (YouTube recommends < 15 MiB)" : ""}; largest file ${largest.rel} ${kb(largest.bytes)}`);
  console.log(`  zip: ${path.relative(ROOT, zipFile)} (${mb(zip.length)})`);
}

// --- React games ------------------------------------------------------------------------------------

async function buildReact(slug) {
  const out = path.join(OUT_ROOT, slug);
  const data = await gameData(slug);
  const { GAME, BASE_MODELS } = data;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  // 1. Models (and the pictures the menus show). The ones loaded before the menu go into one file,
  //    models.pack, that index.html starts downloading at once; the rest stay separate files.
  const models = [...new Set(GAME.models)];
  const first = new Set(BASE_MODELS);
  const sizes = {};
  const extensions = new Set();
  const packIndex = {};
  const packParts = [];
  let packBytes = 0;
  let modelBytes = 0;
  for (const key of models) {
    const rel = key.startsWith("/") ? `${key.slice(1)}.glb` : `library/${key}.glb`;
    const from = path.join(PUBLIC, rel);
    if (!fs.existsSync(from)) fail(`missing ${path.relative(ROOT, from)} (run \`npm run assets:sync\`?)`);
    let bytes;
    if (first.has(key)) {
      const buf = fs.readFileSync(from);
      bytes = buf.length;
      packIndex[key] = [packBytes, bytes];
      packParts.push(buf);
      packBytes += bytes;
    } else bytes = copy(from, path.join(out, rel));
    sizes[key] = bytes;
    modelBytes += bytes;
    for (const ext of glbExtensions(from)) extensions.add(ext);
  }
  fs.writeFileSync(path.join(out, "models.pack"), Buffer.concat(packParts));
  const early = `window.__MODEL_PACK__={index:${JSON.stringify(packIndex)},data:fetch("./models.pack").then(function(r){if(!r.ok)throw new Error("models.pack "+r.status);return r.arrayBuffer()})};`;
  let pictureBytes = 0;
  for (const rel of new Set(GAMES[slug].pictures(data))) pictureBytes += copy(path.join(PUBLIC, rel), path.join(out, rel));
  // The loading screen: the game's backdrops (if captured) over its cover.
  for (const f of fs.readdirSync(path.join(PUBLIC, "games", slug))) {
    if (/^(cover|backdrop-.*)\.webp$/.test(f)) pictureBytes += copy(path.join(PUBLIC, "games", slug, f), path.join(out, "games", slug, f));
  }
  for (const d of [extensions.has("KHR_draco_mesh_compression") && "draco", extensions.has("KHR_texture_basisu") && "basis"].filter(Boolean)) {
    for (const f of fs.readdirSync(path.join(PUBLIC, "decoders", d))) copy(path.join(PUBLIC, "decoders", d, f), path.join(out, "decoders", d, f));
  }

  // 2. Script: the game alone, every asset path relative to index.html.
  const js = await esbuild.build({
    entryPoints: [path.join(SRC, `${slug}.tsx`)],
    outfile: path.join(out, "game.js"),
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2020", "chrome90", "safari15", "firefox90"],
    jsx: "automatic",
    legalComments: "none",
    metafile: true,
    plugins: [noFirebase],
    logOverride: { "module-level-directive": "silent" },
    // Some three.js loaders resolve default paths against import.meta.url, which a single script doesn't have.
    banner: { js: "var process={env:{}},__importMetaUrl=document.baseURI;" },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_BASE_PATH": '"."',
      __MODEL_SIZES__: JSON.stringify(sizes),
      "import.meta.url": "__importMetaUrl",
    },
  });
  const external = Object.keys(js.metafile.inputs).filter((f) => /(^|\/)node_modules\/(next|firebase|@firebase)\//.test(f));
  if (external.length) fail(`the game pulled in site-only code:\n  ${external.slice(0, 8).join("\n  ")}`);
  const code = fs.readFileSync(path.join(out, "game.js"), "utf8");
  for (const bad of ["localStorage.setItem(\"games:", "firebaseio.com", "firebasedatabase.app"]) if (code.includes(bad)) console.warn(`  note: game.js still mentions ${bad}`);

  // 3. Styles: Tailwind + the game UI classes, and the fonts the stylesheet names.
  const cssEntry = path.join(SRC, `${slug}.css`);
  const css = await postcss([tailwind({ optimize: { minify: true } })]).process(fs.readFileSync(cssEntry, "utf8"), { from: cssEntry, to: path.join(out, "game.css") });
  fs.writeFileSync(path.join(out, "game.css"), css.css);
  const fonts = [...new Set([...css.css.matchAll(/url\(\s*["']?\.\/fonts\/([^"')]+)/g)].map((m) => m[1]))];
  for (const f of fonts) copy(path.join(SRC, "fonts", f), path.join(out, "fonts", f));
  const absolute = [...css.css.matchAll(/url\(\s*["']?((?:\/|https?:)[^"')]+)/g)].map((m) => m[1]);
  if (absolute.length) fail(`game.css points outside the bundle: ${absolute.join(", ")}`);

  // 4. The page. YouTube's SDK must load before any game code.
  fs.writeFileSync(path.join(out, "index.html"), page(GAME.title, '<link rel="stylesheet" href="./game.css">', '<div id="game"></div>\n<script src="./game.js"></script>', early));

  console.log(`${GAME.title} for YouTube Playables → ${path.relative(ROOT, out)}`);
  finish(slug, out, (files) => {
    const byName = new Map(files.map((f) => [f.rel, f.bytes]));
    console.log(`  game.js ${kb(byName.get("game.js"))} · game.css ${kb(byName.get("game.css"))} · ${models.length} models ${mb(modelBytes)} · pictures ${mb(pictureBytes)}`);
    return ["index.html", "game.js", "game.css", "models.pack"].reduce((n, f) => n + (byName.get(f) ?? 0), 0) + files.filter((f) => f.rel.startsWith("fonts/")).reduce((n, f) => n + f.bytes, 0);
  });
}

// --- Patti Veedu (its own page) -----------------------------------------------------------------------

/** Replaces `from` (which must be there exactly once) in a file of the copied game. */
function patch(file, from, to) {
  const text = fs.readFileSync(file, "utf8");
  const n = text.split(from).length - 1;
  if (n !== 1) fail(`patti-veedu: expected one "${from.slice(0, 60)}…" in ${path.basename(file)}, found ${n} — the game changed; update scripts/build-playables.mjs`);
  fs.writeFileSync(file, text.replace(from, () => to));
}

/**
 * Patti Veedu's stylesheet, pointed at PV's box instead of the viewport: vw / vh become --vw / --vh,
 * and each size rule (@media max-height / max-width) becomes a class PV sets on <html> for the box's
 * size. The "turn your phone" screen goes: upright, the game plays in a letterbox (YouTube: playable
 * in every aspect ratio, no orientation lock).
 */
function pattiStyles(html) {
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
  if (!m || html.indexOf("<style", m.index + 1) >= 0) fail("patti-veedu: expected one <style> in index.html");
  let css = m[1];
  if (/url\(\s*["']?data:/.test(css)) fail("patti-veedu: the stylesheet has data: URLs now — check the vw / vh rewrite in scripts/build-playables.mjs");
  let out = "";
  let i = 0;
  const media = /@media\s*\(\s*(max-height|max-width|orientation)\s*:\s*([a-z0-9]+)\s*\)\s*\{/g;
  for (let hit = media.exec(css); hit; hit = media.exec(css)) {
    let depth = 1;
    let j = media.lastIndex;
    for (; depth && j < css.length; j++) depth += css[j] === "{" ? 1 : css[j] === "}" ? -1 : 0;
    const body = css.slice(media.lastIndex, j - 1);
    out += css.slice(i, hit.index);
    if (hit[1] !== "orientation") {
      const px = Number.parseInt(hit[2], 10);
      const cls = `${hit[1] === "max-height" ? "mh" : "mw"}-${px}`;
      if (![340, 380, 400, 420, 560].includes(px)) fail(`patti-veedu: a new size rule (${hit[1]}: ${hit[2]}) — add it to SIZES in scripts/playables/patti-veedu.js`);
      out += body.replace(/(^|\})([^{}]+)\{/g, (_, close, selectors) => {
        const scoped = selectors.split(",").map((sel) => {
          const s = sel.trim();
          return s.startsWith("html") ? `html.${cls}${s.slice(4)}` : `html.${cls} ${s}`;
        });
        return `${close}${scoped.join(",")}{`;
      });
    }
    i = j;
    media.lastIndex = j;
  }
  css = out + css.slice(i);
  if (/@media\s*\(\s*(max-|min-|orientation)/.test(css)) fail("patti-veedu: a size rule was not converted — update pattiStyles in scripts/build-playables.mjs");
  css = css.replace(/(\d*\.?\d+)v([wh])\b/g, (_, n, axis) => `calc(var(--v${axis}) * ${n})`);
  // The canvas and every "fixed" layer sit inside the body, which PV sizes; nothing shows around the box but black.
  css += "\nhtml{background:#000}\n#rotate{display:none!important}\n";
  return html.slice(0, m.index) + m[0].replace(m[1], () => css) + html.slice(m.index + m[0].length);
}

function buildPatti() {
  const slug = "patti-veedu";
  const app = path.join(PUBLIC, "games", slug, "app");
  const out = path.join(OUT_ROOT, slug);
  if (!fs.existsSync(path.join(app, "index.html"))) fail(`missing ${path.relative(ROOT, app)} (run \`npm run assets:sync\`?)`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(app, "three.min.js"), path.join(out, "three.min.js"));
  for (const dir of ["js", "fonts"]) fs.cpSync(path.join(app, dir), path.join(out, dir), { recursive: true });
  fs.copyFileSync(path.join(SRC, "patti-veedu.js"), path.join(out, "js", "playables.js"));
  const js = (f) => path.join(out, "js", f);

  // Saves: YouTube's cloud save (through window.PV) instead of the browser's storage.
  patch(js("game.js"), "const v = localStorage.getItem('kolusu.' + k);", "const v = PV.getItem(k);");
  patch(js("game.js"), "localStorage.setItem('kolusu.' + k, JSON.stringify(v));", "PV.setItem(k, JSON.stringify(v));");
  patch(js("game.js"), "localStorage.removeItem('kolusu.' + SAVE_KEY);", "PV.removeItem(SAVE_KEY);");
  // The language comes from YouTube and is not saved.
  patch(js("i18n.js"), "const v = JSON.parse(localStorage.getItem('kolusu.lang'));", "const v = PV.lang;");
  patch(js("i18n.js"), "try { localStorage.setItem('kolusu.lang', JSON.stringify(l)); } catch (e) { /* storage unavailable */ }", "");
  // Pause and resume only through the SDK: no window blur, page visibility or pagehide.
  patch(js("game.js"), "if (G.state === 'play' && !G.overlay) openPause(); });", "});");
  patch(
    js("game.js"),
    "document.addEventListener('visibilitychange', () => { if (document.hidden) { openPause(); A.suspend(); } else A.resume(); });",
    "PV.onPause = () => { openPause(); if (G.state === 'play') saveGame(); A.suspend(); }; PV.onResume = () => A.resume();",
  );
  patch(js("game.js"), "window.addEventListener('pagehide', () => { if (G.state === 'play') saveGame(); });", "");
  // gameReady once the loading screen has faded and the menu takes input.
  patch(js("game.js"), "if (sp) { sp.style.opacity = 0; setTimeout(() => sp.remove(), 650); }", "if (sp) { sp.style.opacity = 0; setTimeout(() => { sp.remove(); PV.ready(); }, 650); } else PV.ready();");
  // The score YouTube shows: escapes, counted on the win screen and shown with the best time.
  patch(js("game.js"), "clearSave(); G.state = 'end'; A.ambient(false); A.music('end');", "clearSave(); G.state = 'end'; A.ambient(false); A.music('end'); PV.escaped();");
  patch(js("game.js"), "t('best', { d: t('d_' + G.diffKey), t: fmt(b) }); }", "t('best', { d: t('d_' + G.diffKey), t: fmt(b) }); PV.showEscapes($('bestTime')); }");
  // Sound follows YouTube's mute and pause.
  patch(js("audio.js"), "ctx.state === 'suspended' && !document.hidden) ctx.resume();", "ctx.state === 'suspended' && !PV.silent()) ctx.resume();");
  // Esc must reach the browser (YouTube forbids preventDefault on it): the number pad's blanket preventDefault spares it.
  patch(js("game.js"), "else if (k === 'Escape') closeOverlay();\n    e.preventDefault();", "else if (k === 'Escape') { closeOverlay(); return; }\n    e.preventDefault();");
  // Sizes come from PV's box (the whole screen, or a letterbox when the screen is upright), not the window.
  for (const f of ["game.js", "touch.js"]) {
    const text = fs.readFileSync(js(f), "utf8");
    if (!/window\.inner(Width|Height)/.test(text)) fail(`patti-veedu: js/${f} no longer reads the window size — update scripts/build-playables.mjs`);
    fs.writeFileSync(js(f), text.replace(/window\.innerWidth/g, "PV.w()").replace(/window\.innerHeight/g, "PV.h()"));
  }
  // YouTube owns the screen: no full screen or rotate buttons, no automatic full screen.
  patch(js("screen.js"), "const app = !!(", "const app = true || !!(");

  // The page: the SDK first, then PV; every game script waits for the cloud save (PV.boot loads them in order).
  let html = fs.readFileSync(path.join(app, "index.html"), "utf8");
  html = pattiStyles(html);
  const start = html.indexOf("<script>window.KOLUSU_MOBILE");
  const end = html.lastIndexOf("</script>") + "</script>".length;
  if (start < 0 || /<script/.test(html.slice(0, start))) fail("patti-veedu: index.html's scripts moved — update scripts/build-playables.mjs");
  const block = html.slice(start, end);
  const list = [];
  let inline = 0;
  const rest = block.replace(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g, (_, src, body) => {
    if (src) list.push(src);
    else {
      const name = `js/inline-${++inline}.js`;
      fs.writeFileSync(path.join(out, name), body.replace("/[?&]desk\\b/.test(location.search)", "PV.desk"));
      list.push(name);
    }
    if (src === "js/audio.js") list.push("js/playables-audio.js");
    return "";
  });
  if (rest.trim()) fail(`patti-veedu: unexpected markup between the scripts: ${rest.trim().slice(0, 80)}`);
  if (!fs.readFileSync(path.join(out, "js/inline-1.js"), "utf8").includes("PV.desk")) fail("patti-veedu: the desktop / touch check moved — update scripts/build-playables.mjs");
  fs.writeFileSync(js("playables-audio.js"), "(function (A) { var init = A.init; A.init = function () { var r = init.apply(this, arguments); if (PV.silent()) A.suspend(); return r; }; })(K.Audio);\n");
  html = html.slice(0, start) + `<script>PV.boot(${JSON.stringify(list)});</script>` + html.slice(end);
  html = html.replace(/<meta name="robots"[^>]*>\n?/, "");
  const head = html.indexOf("<meta charset");
  if (head < 0) fail("patti-veedu: no <meta charset> in index.html");
  const after = html.indexOf(">", head) + 1;
  html = `${html.slice(0, after)}\n<script src="${SDK}"></script>\n<script src="js/playables.js"></script>${html.slice(after)}`;
  fs.writeFileSync(path.join(out, "index.html"), html);
  for (const f of fs.readdirSync(path.join(out, "js"))) {
    const text = fs.readFileSync(js(f), "utf8");
    for (const bad of ["localStorage", "sessionStorage", "visibilitychange", "document.hidden"]) if (text.includes(bad)) fail(`patti-veedu: js/${f} still uses ${bad}`);
  }

  console.log(`Patti Veedu for YouTube Playables → ${path.relative(ROOT, out)}`);
  // Everything is loaded before the menu.
  finish(slug, out, (files) => files.reduce((n, f) => n + f.bytes, 0));
}

// --- Run --------------------------------------------------------------------------------------------

const arg = process.argv[2] ?? "skate-rush";
const slugs = arg === "all" ? ALL : [arg];
if (slugs.some((s) => !ALL.includes(s))) {
  console.error(`build-playables: no Playables setup for "${arg}" (have: ${ALL.join(", ")}, or "all")`);
  process.exit(1);
}
let failed = 0;
for (const slug of slugs) {
  try {
    if (STANDALONE.includes(slug)) buildPatti();
    else await buildReact(slug);
  } catch (err) {
    failed++;
    if (err instanceof BuildError) console.error(`\nbuild-playables: ${slug}: ${err.message}\n`);
    else {
      console.error(`\nbuild-playables: ${slug} failed`);
      console.error(err);
    }
  }
}
process.exit(failed ? 1 : 0);
