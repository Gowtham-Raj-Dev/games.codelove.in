#!/usr/bin/env node
/**
 * Cuts the full Patti Veedu gameplay video (scripts/record-patti-gameplay.mjs) into upright parts for
 * Instagram Reels and YouTube Shorts:
 *   recordings/reels/patti-veedu-part-1.mp4 … part-7.mp4   1080×1920, about a minute each
 *
 *   node scripts/build-patti-gameplay-reels.mjs
 *
 * Each part starts where a chapter or a moment starts. The middle 4:3 of the gameplay (where the puzzles, the
 * captions and Paatti are) fills the width, over a blurred copy of itself; the title and part number sit above,
 * the "full gameplay" line below, clear of the app's own buttons at the bottom. Every part but the last ends on
 * its last frame held for a moment under "தொடரும்… Part N+1".
 * The overlays are drawn by headless Chrome with the game's own fonts.
 *
 * Env: CHROME, FFMPEG (default: the copy in %LOCALAPPDATA%/kolusu-promo-tools), SRC (the full video).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = process.env.SRC ?? path.join(ROOT, "recordings", "patti-veedu-gameplay-ta.mp4");
const OUT = path.join(ROOT, "recordings", "reels");
const FONTS = pathToFileURL(path.join(ROOT, "public", "games", "patti-veedu", "app", "fonts")).href;
const TOOLS = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "kolusu-promo-tools");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? path.join(TOOLS, "node_modules", "ffmpeg-static", "ffmpeg.exe");
const PORT = 9363;
const HOLD = 1.6; // the "next part" card
const FG_TOP = 520; // where the gameplay band starts (1080×810)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The parts: [from, to] in seconds of the full video, and the line under the part number.
const PARTS = [
  { from: 0, to: 77.6, line: "முதல் பூட்டு" },
  { from: 77.6, to: 147.1, line: "கொலுசும் மொட்டை மாடியும்" },
  { from: 147.1, to: 243.6, line: "நாலு விளக்கு · பாட்டி வர்றாங்க!" },
  { from: 243.6, to: 304.2, line: "நிலவறை · ஊசி vs பாட்டி" },
  { from: 304.2, to: 387.6, line: "இரண்டாம் கட்டு" },
  { from: 387.6, to: 468.5, line: "வள்ளியின் அறை · பெட்டகம்" },
  { from: 468.5, to: null, line: "True Ending" },
];

const FACES = `
@font-face{font-family:Catamaran;font-weight:900;src:url(${FONTS}/catamaran-tamil-900-normal.woff2)}
@font-face{font-family:Catamaran;font-weight:800;src:url(${FONTS}/catamaran-tamil-800-normal.woff2)}
@font-face{font-family:Creepster;src:url(${FONTS}/creepster-latin-400-normal.woff2)}
@font-face{font-family:"Special Elite";src:url(${FONTS}/special-elite-latin-400-normal.woff2)}
@font-face{font-family:"Hind Madurai";font-weight:600;src:url(${FONTS}/hind-madurai-tamil-600-normal.woff2)}
@font-face{font-family:"Hind Madurai";font-weight:600;src:url(${FONTS}/hind-madurai-latin-600-normal.woff2)}`;
const BASE = `html,body{margin:0;width:1080px;height:1920px;background:transparent;overflow:hidden}
body{position:relative;font-family:"Hind Madurai",sans-serif;color:#f3e6d6}`;

/** Title and part number above the gameplay, the full-gameplay line and progress below. */
const bandPage = (n, total, line) => `<!doctype html><meta charset="utf-8"><style>${FACES}${BASE}
.top{position:absolute;left:0;right:0;top:120px;text-align:center}
.pill{display:inline-block;padding:12px 30px 9px;border-radius:999px;background:#c0160d;color:#fff;font:400 34px/1 "Special Elite",serif;letter-spacing:.18em;box-shadow:0 0 30px rgba(220,30,10,.6)}
.ta{margin-top:22px;font:900 104px/1.05 Catamaran,sans-serif;color:#d51c11;text-shadow:0 0 30px rgba(220,30,10,.55),0 5px 0 #3a0503,0 0 50px #000}
.line{margin-top:14px;font:800 46px/1.2 Catamaran,sans-serif;color:#efe0c8;text-shadow:0 0 18px #000,0 3px 0 #000}
.bot{position:absolute;left:0;right:0;top:${FG_TOP + 810 + 46}px;text-align:center}
.full{font:400 34px/1 "Special Elite",serif;letter-spacing:.08em;color:#ffcf8a;text-shadow:0 0 14px #000}
.dots{margin-top:26px;display:flex;justify-content:center;gap:14px}
.dots i{width:46px;height:9px;border-radius:9px;background:rgba(255,255,255,.22)}
.dots i.on{background:#e3261a;box-shadow:0 0 14px rgba(227,38,26,.8)}
</style><div class="top"><div class="pill">PART ${n} / ${total}</div><div class="ta">பாட்டி வீடு</div><div class="line">${line}</div></div>
<div class="bot"><div class="full">FULL GAMEPLAY · TRUE ENDING</div><div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div></div>`;

/** The held last frame: dimmed, "to be continued", the next part. */
const nextPage = (n) => `<!doctype html><meta charset="utf-8"><style>${FACES}${BASE}
body{background:rgba(0,0,0,.6)}
.c{position:absolute;left:0;right:0;top:760px;text-align:center}
.t{font:900 92px/1.1 Catamaran,sans-serif;color:#efe0c8;text-shadow:0 0 26px #000,0 4px 0 #2a0402}
.n{display:inline-block;margin-top:34px;padding:18px 44px 14px;border-radius:999px;background:linear-gradient(180deg,#f87171,#dc2626 55%,#991b1b);color:#fff;font:400 64px/1 Creepster,serif;letter-spacing:.08em;border:4px solid #0b0406;box-shadow:0 8px 0 #0b0406,0 0 40px rgba(220,30,10,.6)}
</style><div class="c"><div class="t">தொடரும்…</div><div class="n">PART ${n} →</div></div>`;

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); if (d.error) p.rej(new Error(d.error.message)); else p.res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, close: () => ws.close() };
}
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}
function duration(file) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr);
  if (!m) throw new Error(`can't read the length of ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

if (!fs.existsSync(SRC)) { console.error(`no video at ${SRC} — record it first (scripts/record-patti-gameplay.mjs)`); process.exit(1); }
const total = duration(SRC);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "patti-reels-"));
fs.mkdirSync(OUT, { recursive: true });
let chrome = null;
try {
  // 1. The overlays, as transparent PNGs.
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--allow-file-access-from-files", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(work, "profile")}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null); }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });
  await page.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const shoot = async (html, file) => {
    const src = path.join(work, path.basename(file, ".png") + ".html");
    fs.writeFileSync(src, html);
    await page.send("Page.navigate", { url: pathToFileURL(src).href });
    await sleep(700);
    await page.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    const { data } = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  };
  for (const [i, p] of PARTS.entries()) {
    await shoot(bandPage(i + 1, PARTS.length, p.line), path.join(work, `band-${i + 1}.png`));
    if (i < PARTS.length - 1) await shoot(nextPage(i + 2), path.join(work, `next-${i + 1}.png`));
  }
  page.close();
  chrome.kill(); chrome = null;

  // 2. The parts.
  for (const [i, p] of PARTS.entries()) {
    const n = i + 1, last = i === PARTS.length - 1, d = (p.to ?? total) - p.from, len = d + (last ? 0 : HOLD);
    const out = path.join(OUT, `patti-veedu-part-${n}.mp4`);
    console.log(`Part ${n}: ${p.from.toFixed(1)}–${(p.to ?? total).toFixed(1)} s (${len.toFixed(1)} s)  ${p.line}`);
    const graph = [
      "[0:v]split[a][b]",
      "[a]scale=-2:480,crop=270:480,boxblur=10:2,scale=1080:1920,eq=brightness=-0.16:saturation=0.75[bg]",
      `[b]crop=1440:1080:240:0,scale=1080:810[fg]`,
      `[bg][fg]overlay=0:${FG_TOP}[v1]`,
      "[v1][1:v]overlay=0:0:shortest=1[v2]",
      last ? "[v2]null[v]" : `[v2]tpad=stop_mode=clone:stop_duration=${HOLD}[v3];[v3][2:v]overlay=0:0:enable='gte(t,${d.toFixed(3)})'[v]`,
      `[0:a]afade=t=in:d=${i ? 0.25 : 0.05},afade=t=out:st=${(d - 0.45).toFixed(3)}:d=0.45${last ? "" : `,apad=pad_dur=${HOLD}`}[a]`,
    ].join(";");
    ffmpeg([
      "-ss", p.from.toFixed(3), "-t", d.toFixed(3), "-i", SRC,
      "-loop", "1", "-t", len.toFixed(3), "-i", path.join(work, `band-${n}.png`),
      ...(last ? [] : ["-loop", "1", "-t", len.toFixed(3), "-i", path.join(work, `next-${n}.png`)]),
      "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", len.toFixed(3),
      "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
    ]);
    console.log(`  ${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
  }
} finally {
  chrome?.kill();
  await sleep(600);
  try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) { console.warn("could not remove", work); }
}
