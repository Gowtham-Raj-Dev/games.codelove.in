#!/usr/bin/env node
/**
 * Turns a game's landscape trailer into a vertical (9:16) video for YouTube Shorts, Reels and the like:
 *
 *   node scripts/build-shorts.mjs               every game below
 *   node scripts/build-shorts.mjs sky-hop       one game
 *     → public/games/<slug>/shorts-from-trailer.mp4   1080×1920, the trailer's own length and sound
 *
 * The trailer plays untouched across the middle of the frame (full width, nothing cropped), over a
 * blurred copy of itself; above it the game's title in its own typeface, below it a "Play now" button
 * and the game's address. The bottom 250 px stay empty: Shorts puts its own title and buttons there.
 * The title and button are one transparent picture, drawn by headless Chrome from the HTML below.
 *
 * Env: CHROME, FFMPEG (default: the copy in the model library's project, ../Models.Codelove.in/promo/tools).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const FONTS = path.join(ROOT, "scripts", "playables", "fonts");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? path.resolve(ROOT, "..", "Models.Codelove.in", "promo", "tools", "ff", "node_modules", "ffmpeg-static", "ffmpeg.exe");
const SITE = "games.codelove.in";

/**
 * Per game: the title's two lines and typeface, its colours (`ink` outlines everything, `accent` is the
 * second title line, the button and the address), and the line under the button.
 */
const GAMES = {
  "skate-rush": {
    lines: ["Skate", "Rush"],
    font: path.join(FONTS, "bungee-latin-400.woff2"),
    size: [190, 214],
    stroke: 14,
    tilt: -3,
    ink: "#0b1220",
    accent: "#f59e0b",
    button: ["#ffc247", "#f59e0b", "#e07c00", "#1a1205"],
    badge: "Free 3D game",
    sub: ["Dodge the traffic", "Grab every coin"],
  },
  "sky-hop": {
    lines: ["Sky", "Hop"],
    font: path.join(FONTS, "luckiest-guy-latin-400.woff2"),
    size: [250, 280],
    stroke: 16,
    tilt: -4,
    ink: "#12305a",
    accent: "#facc15",
    button: ["#fde68a", "#facc15", "#eab308", "#12305a"],
    badge: "Free 3D game",
    sub: ["Run, double-jump", "Stomp the baddies"],
  },
  "crypt-knight": {
    lines: ["Crypt", "Knight"],
    font: path.join(FONTS, "cinzel-latin-variable.woff2"),
    weight: 900,
    size: [200, 200],
    stroke: 10,
    tilt: 0,
    ink: "#12060c",
    accent: "#f43f5e",
    button: ["#fb7185", "#f43f5e", "#be123c", "#ffffff"],
    badge: "Free 3D game",
    sub: ["Sword and shield", "A crypt full of skeletons"],
  },
  "cannon-cove": {
    lines: ["Cannon", "Cove"],
    font: path.join(FONTS, "pirata-one-latin-400.woff2"),
    size: [250, 290],
    stroke: 12,
    tilt: -2,
    ink: "#07263a",
    accent: "#fbbf24",
    button: ["#fde68a", "#fbbf24", "#d97706", "#2a1a05"],
    badge: "Free 3D game",
    sub: ["Sail the open sea", "Fire the cannons"],
  },
  "patti-veedu": {
    lines: ["Patti", "Veedu"],
    font: path.join(ROOT, "public", "games", "patti-veedu", "app", "fonts", "creepster-latin-400-normal.woff2"),
    size: [250, 250],
    stroke: 10,
    tilt: -2,
    ink: "#0b0406",
    accent: "#ef4444",
    button: ["#f87171", "#dc2626", "#991b1b", "#ffffff"],
    badge: "Free 3D horror game",
    sub: ["Grandma's house", "Survive five nights"],
  },
};

const url = (file) => pathToFileURL(file).href;

/** The title, the button and the frame around the trailer: 1080×1920, transparent where the video shows. */
const overlay = (slug, g) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@font-face { font-family: "Title"; src: url("${url(g.font)}") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Rubik"; src: url("${url(path.join(FONTS, "rubik-latin-variable.woff2"))}") format("woff2"); font-weight: 300 900; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1080px; height: 1920px; overflow: hidden; background: transparent; }
.frame { position: relative; width: 1080px; height: 1920px; font-family: "Rubik", sans-serif; color: #fff; }
/* The trailer plays in the band from 656 to 1264: an outline around it. */
.band { position: absolute; left: 0; right: 0; top: 646px; height: 628px; border-top: 10px solid ${g.ink}; border-bottom: 10px solid ${g.ink}; box-shadow: 0 0 60px rgb(0 0 0 / 0.6); }
.top { position: absolute; left: 0; right: 0; top: 0; height: 646px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 40px; text-align: center; }
.badge { display: inline-block; padding: 10px 28px; border-radius: 999px; background: #fff; color: ${g.ink}; font-weight: 800; font-size: 32px; letter-spacing: 0.08em; text-transform: uppercase; box-shadow: 0 8px 0 rgb(0 0 0 / 0.35); transform: rotate(-2deg); }
h1 { margin-top: 22px; font-family: "Title", sans-serif; font-weight: ${g.weight ?? 400}; line-height: 0.92; text-transform: uppercase; transform: rotate(${g.tilt}deg); -webkit-text-stroke: ${g.stroke}px ${g.ink}; paint-order: stroke fill; text-shadow: 0 ${g.stroke}px 0 ${g.ink}, 0 30px 40px rgb(0 0 0 / 0.5); white-space: nowrap; }
h1 span { display: block; font-size: ${g.size[0]}px; }
h1 span + span { color: ${g.accent}; font-size: ${g.size[1]}px; }
.bottom { position: absolute; left: 0; right: 0; top: 1330px; text-align: center; }
.play { display: inline-flex; align-items: center; gap: 28px; padding: 36px 76px 36px 62px; border-radius: 999px; background: linear-gradient(180deg, ${g.button[0]} 0%, ${g.button[1]} 55%, ${g.button[2]} 100%); color: ${g.button[3]}; font-family: "Rubik", sans-serif; font-weight: 900; font-size: 88px; line-height: 1; letter-spacing: 0.02em; text-transform: uppercase; border: 10px solid ${g.ink}; box-shadow: 0 20px 0 ${g.ink}, 0 44px 60px rgb(0 0 0 / 0.55); }
.play i { width: 0; height: 0; border-style: solid; border-width: 40px 0 40px 66px; border-color: transparent transparent transparent ${g.button[3]}; }
.sub { margin-top: 62px; font-weight: 800; font-size: 42px; letter-spacing: 0.03em; text-shadow: 0 4px 14px rgb(0 0 0 / 0.85); }
.sub b, .site b { color: ${g.accent}; font-weight: 800; }
.site { margin-top: 16px; font-weight: 700; font-size: 36px; letter-spacing: 0.03em; text-shadow: 0 4px 14px rgb(0 0 0 / 0.85); }
</style>
</head>
<body>
<div class="frame">
  <div class="band"></div>
  <div class="top">
    <div class="badge">${g.badge}</div>
    <h1><span>${g.lines[0]}</span><span>${g.lines[1]}</span></h1>
  </div>
  <div class="bottom">
    <div class="play"><i></i>Play now</div>
    <p class="sub">${g.sub[0]} · <b>${g.sub[1]}</b></p>
    <p class="site">${SITE}<b>/${slug}</b></p>
  </div>
</div>
</body>
</html>
`;

function run(cmd, args, what) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.error || r.status !== 0) throw new Error(`${what} failed: ${r.error?.message ?? r.stderr.split("\n").filter(Boolean).slice(-4).join("\n")}`);
  return r;
}

const only = process.argv[2];
if (only && !GAMES[only]) {
  console.error(`build-shorts: no setup for "${only}" (have: ${Object.keys(GAMES).join(", ")})`);
  process.exit(1);
}
for (const tool of [CHROME, FFMPEG]) {
  if (!fs.existsSync(tool)) {
    console.error(`build-shorts: ${tool} not found — set CHROME / FFMPEG`);
    process.exit(1);
  }
}
const work = fs.mkdtempSync(path.join(os.tmpdir(), "shorts-"));
let failed = 0;
try {
  for (const [slug, g] of Object.entries(GAMES)) {
    if (only && slug !== only) continue;
    const dir = path.join(ROOT, "public", "games", slug);
    const trailer = path.join(dir, "trailer-1080.mp4");
    try {
      if (!fs.existsSync(trailer)) throw new Error(`no ${path.relative(ROOT, trailer)}`);
      for (const f of [g.font]) if (!fs.existsSync(f)) throw new Error(`missing font ${path.relative(ROOT, f)}`);
      // 1. The title / button picture.
      const html = path.join(work, `${slug}.html`);
      const png = path.join(work, `${slug}.png`);
      fs.writeFileSync(html, overlay(slug, g));
      run(
        CHROME,
        ["--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1", "--allow-file-access-from-files", "--default-background-color=00000000", `--user-data-dir=${path.join(work, "profile")}`, "--window-size=1080,1920", "--virtual-time-budget=4000", `--screenshot=${png}`, url(html)],
        "drawing the title",
      );
      if (!fs.existsSync(png)) throw new Error("Chrome made no picture");
      // 2. Blurred backdrop + the trailer across the middle + the picture on top; the sound is copied as it is.
      const out = path.join(dir, "shorts-from-trailer.mp4");
      const graph = [
        "[0:v]split=2[a][b]",
        "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:4,eq=brightness=-0.22:saturation=1.1[bg]",
        "[b]scale=1080:608:flags=lanczos[fg]",
        "[bg][fg]overlay=0:656[v0]",
        "[v0][1:v]overlay=0:0:shortest=1,format=yuv420p[v]",
      ].join(";");
      run(
        FFMPEG,
        ["-hide_banner", "-loglevel", "error", "-y", "-i", trailer, "-loop", "1", "-i", png, "-filter_complex", graph, "-map", "[v]", "-map", "0:a", "-r", "60", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-movflags", "+faststart", "-c:a", "copy", out],
        "encoding",
      );
      // A still from a third of the way in, to check the layout by eye.
      const still = path.join(work, `${slug}-still.png`);
      const probe = spawnSync(FFMPEG, ["-hide_banner", "-i", out], { encoding: "utf8" }).stderr;
      const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe) ?? [0, 0, 0, 0];
      const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
      run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(seconds / 3), "-i", out, "-frames:v", "1", "-vf", "scale=540:-1", still], "taking a still");
      if (process.env.STILLS) fs.copyFileSync(still, path.join(process.env.STILLS, `shorts-${slug}.png`));
      console.log(`${path.relative(ROOT, out)}  ${seconds.toFixed(1)} s, ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
    } catch (err) {
      failed++;
      console.error(`build-shorts: ${slug}: ${err.message}`);
    }
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
process.exit(failed ? 1 : 0);
