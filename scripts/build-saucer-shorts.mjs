#!/usr/bin/env node
/**
 * Cuts YouTube Shorts (1080×1920) out of the full Saucer Siege gameplay (scripts/record-saucer-gameplay.mjs):
 *   OUT/shorts/saucer-siege-map-<n>-<map>.mp4   one map: the first towers, the first mothership, the final wave and the stars
 *   OUT/shorts/saucer-siege-all-maps.mp4         the three maps in under a minute
 *
 *   node scripts/build-saucer-shorts.mjs
 *
 * The cuts come from the gameplay's sidecar (…-full-gameplay.json: when each map, wave and victory happens), so they
 * follow the run. The whole 16:9 picture stays in view — the map is never cropped — across the middle of the frame,
 * over a blurred, darkened copy of itself, with the title above and "Play free" below (drawn here with sharp).
 * The sound is the gameplay's own mix, cut with the picture.
 *
 * Env: FFMPEG (default: the copy in %LOCALAPPDATA%/kolusu-promo-tools), OUT (default ../z-video-files/games.codelove.in/saucer-siege).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const TOOLS = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "kolusu-promo-tools");
const FFMPEG = process.env.FFMPEG ?? path.join(TOOLS, "node_modules", "ffmpeg-static", "ffmpeg.exe");
const OUT = process.env.OUT ?? path.resolve(ROOT, "..", "z-video-files", "games.codelove.in", "saucer-siege");
const VIDEO = path.join(OUT, "video", "saucer-siege-full-gameplay.mp4");
const SHORTS = path.join(OUT, "shorts");
const FPS = 30;
/** Where the 16:9 picture sits: full width, its top at this height. */
const PIC_H = 608;
const PIC_Y = 600;
/** Fades at every cut, seconds. */
const XF = 0.12;

const info = JSON.parse(fs.readFileSync(VIDEO.replace(/\.mp4$/, ".json"), "utf8"));
const { events } = info;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}

/** The banners above and below the picture, as one transparent PNG. */
async function frame(file, top, line, chips) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
  <filter id="s"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity=".75"/></filter>
  <filter id="glow"><feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#7c3aed" flood-opacity=".95"/></filter></defs>
  <rect x="300" y="196" width="480" height="56" rx="28" fill="#7c3aed"/>
  <text x="540" y="235" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="27" letter-spacing="5" fill="#fff">${esc(top)}</text>
  <g filter="url(#glow)"><text x="540" y="372" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="112" fill="#fff">SAUCER SIEGE</text></g>
  <text x="540" y="452" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="700" font-size="40" fill="#fde68a" filter="url(#s)">${esc(line)}</text>
  <text x="540" y="520" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="600" font-size="30" fill="#e9d5ff" filter="url(#s)">${esc(chips)}</text>
  <rect x="250" y="1300" width="580" height="104" rx="52" fill="url(#g)" filter="url(#s)"/>
  <text x="540" y="1370" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="50" fill="#3b1d02">▶ PLAY FREE</text>
  <text x="540" y="1480" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="52" fill="#fff" filter="url(#glow)">games.codelove.in</text>
  <text x="540" y="1546" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="600" font-size="30" fill="#e9d5ff" filter="url(#s)">Free 3D tower defense · no download</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

/** Cuts [from, to] pieces of the gameplay, joins them with short fades and lays them out vertically over `png`. */
function short(out, pieces, png) {
  const parts = pieces.map(([a, b]) => [Math.max(0, a), Math.min(info.seconds, b)]).filter(([a, b]) => b - a > 0.5);
  const graph = [];
  parts.forEach(([a, b], i) => {
    const d = b - a;
    graph.push(`[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS,fade=t=in:d=${XF},fade=t=out:st=${(d - XF).toFixed(3)}:d=${XF}[v${i}]`);
    graph.push(`[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${XF},afade=t=out:st=${(d - XF).toFixed(3)}:d=${XF}[a${i}]`);
  });
  graph.push(`${parts.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${parts.length}:v=1:a=1[cv][ca]`);
  graph.push(`[cv]split[p1][p2]`);
  graph.push(`[p1]scale=-2:1920,crop=1080:1920,boxblur=24:3,eq=brightness=-0.22:saturation=1.15[bg]`);
  graph.push(`[p2]scale=1080:${PIC_H}:flags=lanczos[fg]`);
  graph.push(`[bg][fg]overlay=0:${PIC_Y}[c]`);
  graph.push(`[c][1:v]overlay=0:0,format=yuv420p,fps=${FPS}[v]`);
  graph.push(`[ca]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`);
  ffmpeg(["-i", VIDEO, "-loop", "1", "-i", png, "-filter_complex", graph.join(";"), "-map", "[v]", "-map", "[a]", "-shortest", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-profile:v", "high", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
  const total = parts.reduce((s, [a, b]) => s + b - a, 0);
  console.log(`${path.relative(OUT, out)}  ${total.toFixed(1)} s, ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
}

fs.mkdirSync(SHORTS, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saucer-shorts-"));
try {
  const maps = events.filter((e) => e.type === "map");
  const picks = [];
  for (const [n, m] of maps.entries()) {
    const def = info.maps[m.map];
    const end = events.find((e) => (e.type === "won" || e.type === "lost") && e.map === m.map && e.t > m.t);
    const waves = events.filter((e) => e.type === "wave" && e.map === m.map && e.t > m.t && (!end || e.t < end.t));
    const boss = waves.find((e) => e.boss);
    const last = waves.at(-1);
    if (!end) continue;
    picks.push({ n, m, def, end, boss, last });
    // the first towers and wave 1, the first mothership, the final wave to the stars
    const pieces = [[m.t - 0.3, m.t + 10]];
    if (boss) pieces.push([boss.t - 0.4, boss.t + 17]);
    pieces.push([Math.max(last ? last.t - 0.4 : 0, end.t - 19), end.t + 4.6]);
    const png = path.join(tmp, `map-${n}.png`);
    await frame(png, `MAP ${n + 1} OF ${maps.length} · ${def.difficulty.toUpperCase()}`, def.name, `${def.waves} waves · 2× speed · full clear`);
    short(path.join(SHORTS, `saucer-siege-map-${n + 1}-${slug(def.name)}.mp4`), pieces, png);
  }
  // all maps: a few seconds of each map's start, mothership and victory
  if (picks.length > 1) {
    const pieces = [];
    for (const { m, boss, end } of picks) {
      pieces.push([m.t - 0.2, m.t + 4.5]);
      if (boss) pieces.push([boss.t + 1, boss.t + 8]);
      pieces.push([end.t - 4.5, end.t + 3.8]);
    }
    const png = path.join(tmp, "all.png");
    await frame(png, `ALL ${picks.length} MAPS · FULL CLEAR`, picks.map((p) => p.def.name.split(" ").pop()).join(" → "), "Easy → Medium → Hard · 2× speed");
    short(path.join(SHORTS, "saucer-siege-all-maps.mp4"), pieces, png);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
