#!/usr/bin/env node
/**
 * Cuts the full Saucer Siege gameplay (scripts/record-saucer-gameplay.mjs) into a series of 30-second YouTube Shorts,
 * laid out like the Skate Rush gameplay Shorts: the run between two banners (384 px above, 384 px below, 1080×1152
 * between), then a full-screen "Play now" cover for the last 3 seconds, with a Tamil commentary over it.
 *   OUT/shorts/<number> - <title>.mp4   1080×1920, 30 fps, 30 seconds
 *   OUT/shorts/PROGRESS.md              the list, rewritten after every video
 *
 *   node scripts/build-saucer-gameplay-shorts.mjs          all that are not made yet
 *   node scripts/build-saucer-gameplay-shorts.mjs 2 5      only those numbers
 *   node scripts/build-saucer-gameplay-shorts.mjs 0        only rewrite PROGRESS.md
 *
 * Each map is cut, start to stars, into pieces of 27 seconds (the last one ends on the victory, so neighbours may
 * overlap by a few seconds). The picture is the middle of the 16:9 gameplay (the path and the HUD's map name stay in
 * view) over a blurred copy of it. The sound is the gameplay's own mix, ducking under the commentary.
 *
 * The commentary (VOICE=off leaves it out) is Gemini TTS ("Achernar", as in the Skate Rush videos): what the piece
 * shows — the map, the wave, a mothership, the victory — one take a video, kept in OUT/shorts/voice takes.
 *
 * Env: FFMPEG (default: the copy in %LOCALAPPDATA%/kolusu-promo-tools), OUT (default ../z-video-files/games.codelove.in/saucer-siege),
 * VOICE, TAKE (asks for other takes), GEMINI_TTS_KEYS / GEMINI_API_KEY (default: games.codelove.in/.env.local).
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
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
const LIST = path.join(SHORTS, "PROGRESS.md");
const TAKES = path.join(SHORTS, "voice takes");
const BACKDROP = path.join(ROOT, "public", "games", "saucer-siege", "backdrop-tall-1170.webp");
const FPS = 30;
/** The window between the banners. */
const TOP = 384;
const WIN_H = 1152;
/** The part of the 1920×1080 gameplay in the window: the middle 1300 px, full height, scaled to the window's width. */
const CROP_W = 1300;
const PIC_H = Math.round((1080 * 1080) / CROP_W / 2) * 2;
const PIC_Y = TOP + (WIN_H - PIC_H) / 2;
const total = 30;
/** The cover closes the video; the run dissolves into it. */
const END = 3;
const DISSOLVE = 0.3;
const run = total - END;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const info = JSON.parse(fs.readFileSync(VIDEO.replace(/\.mp4$/, ".json"), "utf8"));
const { events } = info;

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}

// --- The pieces --------------------------------------------------------------------------------------

/** What is said about each map: the opening of its first piece, and a line of its own for the quiet stretches. */
const MAP_LINES = [
  { open: "Saucer Siege! Greenwood Meadow, easy map... towers வெச்சு saucers-அ நிறுத்தலாம்!", tip: "Green காடு நடுவுல ஒரே ஒரு path... saucers எல்லாம் இது வழியா தான் வரும்!" },
  { open: "Map ரெண்டு, Riverford! இது medium... பதினெட்டு waves!", tip: "நடுவுல ஆறு ஓடுது... path ரெண்டு தடவ அத cross பண்ணுது!" },
  { open: "கடைசி map, Frost Pass! Hard mode, இருபது waves!", tip: "Frost Pass-ல saucers fast-ஆ வரும்... towers நிறைய வேணும்!" },
];
/** For the quiet stretches, in turn. */
const TIPS = [
  "Cannon-ஓட splash damage... கூட்டமா வர saucers-க்கு best!",
  "2x speed-ல ஓடுது... ஆனா ஒரு life கூட போகல!",
  "Catapult range அதிகம்... தூரத்துலயே அடிச்சிடும்!",
  "Turret fast-ஆ சுடும், ஆனா armour-க்கு கொஞ்சம் weak.",
  "Coins சேர சேர towers-அ upgrade பண்ணிட்டே இருக்கணும்!",
  "இருபது lives-உம் இன்னும் safe!",
  "Ballista accurate-ஆ அடிக்கும்... ஒவ்வொரு saucer-ஐயும் target பண்ணும்!",
  "Scouts ரொம்ப fast-ஆ வருவாங்க... miss பண்ணாம அடிக்கணும்!",
  "Armoured saucers-க்கு cannon தான் சரியான answer!",
  "Beam saucers வந்தா கவனமா இருக்கணும்!",
  "ஒரு saucer கூட கடைசி வரைக்கும் போகக்கூடாது!",
  "Gold சேர்த்து இன்னும் towers வாங்கலாம்!",
];
/** A map's last wave with a mothership in it: said when it starts, or to open a piece that starts in it. */
const FINAL = "Final wave-ல mothership! இது தான் கடைசி fight!";
/** The longest a stretch without a line may run, from one line's start to the next. */
const QUIET = 9.5;
/** What a title opens with, by what the piece shows. No characters a file's name can't have. */
const HOOK = {
  open: ["Tower Defense Game Start", "Towers Vechu UFO-va Stop Pannalaam"],
  boss: ["Mothership Varudhu - Towers Ready-ya", "Giant Mothership Attack", "Mothership-a Stop Panna Mudiyuma"],
  won: ["Map Clear - 20 Lives Safe 3 Stars", "Full Clear - Oru Life Kooda Pogala"],
  last: ["Final Wave Saucers Attack", "Last Wave Varaikkum Vandhachu"],
  waves: ["UFO Saucers Attack", "Saucers Thadukka Mudiyuma", "Tower Defense 2x Speed Run", "Saucers vs Towers Battle"],
};
const TAILS = ["Saucer Siege Tamil Gameplay - Free 3D Tower Defense #shorts", "Saucer Siege Tamil Gameplay - Free 3D Game #shorts", "Saucer Siege Tamil Gameplay #shorts", "Saucer Siege Tamil #shorts", "Saucer Siege #shorts"];
const LIMIT = 99;

const videos = [];
for (const m of events.filter((e) => e.type === "map")) {
  const def = info.maps[m.map];
  const won = events.find((e) => e.type === "won" && e.map === m.map);
  if (!won) continue;
  const from = m.t - 0.3, to = won.t + 4.5;
  const count = Math.ceil((to - from) / run);
  const step = count > 1 ? (to - run - from) / (count - 1) : 0;
  for (let part = 0; part < count; part++) {
    const a = from + part * step;
    const inside = events.filter((e) => e.t > a + 3 && e.t < a + run - 4 && (e.type === "won" || (e.type === "wave" && e.map === m.map)));
    const boss = inside.find((e) => e.boss);
    const last = inside.find((e) => e.type === "wave" && e.wave === e.waves && !e.boss);
    const kind = part === 0 ? "open" : inside.some((e) => e.type === "won") ? "won" : boss ? "boss" : last ? "last" : "waves";
    videos.push({ map: m.map, def, part: part + 1, parts: count, a, b: a + run, kind });
  }
}
videos.forEach((v, n) => {
  v.no = String(n + 1).padStart(2, "0");
  const hooks = HOOK[v.kind];
  const hook = `${hooks[n % hooks.length]} - ${v.def.name} Part ${v.part}`;
  v.title = TAILS.map((tail) => `${hook} - ${tail}`).find((t) => t.length <= LIMIT) ?? hook.slice(0, LIMIT);
  v.file = `${v.no} - ${v.title}.mp4`;
});

/** The commentary of a piece: its lines and when each is said, in seconds into the piece. */
function narration(v, n) {
  const at = (e) => e.t - v.a;
  const wave = [...events].reverse().find((e) => e.type === "wave" && e.map === v.map && e.t <= v.a + 3);
  const open = v.part === 1 ? MAP_LINES[v.map].open : wave?.boss && wave.wave === wave.waves ? FINAL : `${v.def.name}, part ${v.part}! ${wave ? `Wave ${wave.wave}-ல இருக்கோம்.` : "ஆரம்பிக்கலாம்!"}`;
  const lines = [[0.4, open]];
  // What happens in the piece, the mothership and the victory first.
  const said = [];
  for (const e of events) {
    // The victory is 22.5 s into a map's last piece: it may come later than a wave.
    if (e.t < v.a + 4 || e.t > v.a + run - (e.type === "won" ? 3 : 5) || e.map !== v.map) continue;
    if (e.type === "won") said.push([at(e) + 0.3, "Map clear! இருபது lives-உம் safe... மூணு stars!", 3]);
    else if (e.type === "wave" && e.boss) said.push([at(e) + 0.3, e.wave === e.waves ? FINAL : "Mothership வருது! எல்லா towers-உம் சுடுங்க!", 2]);
    else if (e.type === "wave" && e.wave === e.waves) said.push([at(e) + 0.3, "Last wave! இது தான் final!", 1]);
    else if (e.type === "wave") said.push([at(e) + 0.3, `Wave ${e.wave}! ${e.waves - e.wave === 1 ? "இன்னும் ஒரே ஒரு wave தான்!" : `இன்னும் ${e.waves - e.wave} waves தான்.`}`, 0]);
  }
  const mid = [];
  for (const line of said.sort((x, y) => y[2] - x[2])) if (mid.length < 3 && [...lines, ...mid].every(([t]) => Math.abs(t - line[0]) > 5.5)) mid.push(line);
  const all = [...lines, ...mid.map(([t, say]) => [t, say]), [run - 0.7, "Free game! Link bio-ல இருக்கு."]].sort((x, y) => x[0] - y[0]);
  // A quiet stretch gets a tip: halfway through it, or 5 s in when it is long (and then the rest is looked at again).
  const tips = [...(n % 3 === 0 ? [MAP_LINES[v.map].tip] : []), ...TIPS.slice(n % TIPS.length), ...TIPS.slice(0, n % TIPS.length)];
  for (let i = 0; i < all.length - 1 && tips.length; ) {
    const gap = all[i + 1][0] - all[i][0];
    if (gap <= QUIET) { i++; continue; }
    all.splice(i + 1, 0, [all[i][0] + Math.min(gap / 2, 5), tips.shift()]);
  }
  return all;
}

// --- Banners and cover -------------------------------------------------------------------------------

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const STRIPES = `<pattern id="st" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="28" height="56" fill="#ffffff" opacity=".045"/></pattern>
  <linearGradient id="band" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2e1065"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
  <filter id="s"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".6"/></filter>`;
/** One line: the two words placed apart (the renderer drops the space between two spans). */
const TITLE = (y, size) => `<g filter="url(#s)" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="${size}" stroke="#0f0a2e" stroke-width="${size / 9}" paint-order="stroke">
    <text x="${540 + size * 0.38}" y="${y}" text-anchor="end" fill="#fff">SAUCER</text><text x="${540 + size * 0.62}" y="${y}" text-anchor="start" fill="#fbbf24">SIEGE</text></g>`;
const PLAY = (y, w, h, size) => `<g filter="url(#s)"><rect x="${540 - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#0f0a2e"/>
    <rect x="${540 - w / 2 + 8}" y="${y + 6}" width="${w - 16}" height="${h - 20}" rx="${(h - 20) / 2}" fill="url(#gold)"/></g>
  <text x="540" y="${y + h / 2 + size * 0.3}" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="${size}" fill="#1c1003">▶ PLAY NOW</text>`;
const LINKS = (y) => `<text x="540" y="${y}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="40" fill="#fff" filter="url(#s)">Build towers • <tspan fill="#fbbf24">Stop the saucers</tspan></text>
  <text x="540" y="${y + 56}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="38" fill="#fff" filter="url(#s)">games.codelove.in<tspan fill="#fbbf24">/saucer-siege</tspan></text>`;

/** The banners above and below the window, as one PNG that is clear in between. */
async function frame(file, pill) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs>${STRIPES}</defs>
  <rect width="1080" height="${TOP}" fill="url(#band)"/><rect width="1080" height="${TOP}" fill="url(#st)"/><rect y="${TOP - 12}" width="1080" height="12" fill="#f59e0b"/>
  <rect y="${TOP + WIN_H}" width="1080" height="${1920 - TOP - WIN_H}" fill="url(#band)"/><rect y="${TOP + WIN_H}" width="1080" height="${1920 - TOP - WIN_H}" fill="url(#st)"/><rect y="${TOP + WIN_H}" width="1080" height="12" fill="#f59e0b"/>
  <rect x="${540 - pill.length * 11 - 40}" y="84" width="${pill.length * 22 + 80}" height="60" rx="30" fill="#fff" filter="url(#s)"/>
  <text x="540" y="125" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="30" letter-spacing="2" fill="#1e1b4b">${esc(pill)}</text>
  ${TITLE(290, 118)}
  ${PLAY(1600, 580, 124, 66)}
  ${LINKS(1800)}
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

/** The closing card: the game's tall backdrop, the title and "Play now". */
async function cover(file) {
  const art = await sharp(BACKDROP).resize(1080, 1920, { fit: "cover", position: "centre" }).toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs>${STRIPES}
  <linearGradient id="dim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b4b" stop-opacity=".75"/><stop offset=".4" stop-color="#1e1b4b" stop-opacity=".15"/><stop offset=".62" stop-color="#1e1b4b" stop-opacity=".2"/><stop offset="1" stop-color="#0f0a2e" stop-opacity=".92"/></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#dim)"/>
  <rect x="345" y="120" width="390" height="70" rx="35" fill="#fff" filter="url(#s)"/>
  <text x="540" y="168" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="34" letter-spacing="2" fill="#1e1b4b">FREE 3D GAME</text>
  <g filter="url(#s)" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" text-anchor="middle" stroke="#0f0a2e" stroke-width="18" paint-order="stroke">
    <text x="540" y="400" font-size="190" fill="#fff">SAUCER</text><text x="540" y="590" font-size="190" fill="#fbbf24">SIEGE</text></g>
  ${PLAY(1290, 840, 190, 100)}
  ${LINKS(1600)}
</svg>`;
  await sharp(art).composite([{ input: Buffer.from(svg) }]).png().toFile(file);
}

// --- Commentary (one take a video) -------------------------------------------------------------------

const VOICE = {
  model: "gemini-3.8-flash-tts",
  name: "Achernar",
  /** The models that find the lines in a take: the next one when one has used up its day or is busy. */
  listeners: ["gemini-3.1-flash-lite", "gemini-3.8-flash"],
  style: "# AUDIO PROFILE: Priya, a Tamil gaming YouTuber\n## THE SCENE: she records the live commentary for a YouTube Short of her own run in a tower defense game, where towers shoot down flying saucers.\n### DIRECTOR'S NOTES\nStyle: bright, energetic, friendly; natural Chennai-style Tanglish; excited when a mothership turns up or a map is cleared.\nPacing: fast and punchy, the same energy in every line, and a full second of silence after every paragraph.\n#### TRANSCRIPT",
  /** Said after the last line and thrown away: the end of a take is often clipped. */
  tail: "சரி, அடுத்த video-ல பாக்கலாம்!",
};

/** Gemini keys in the order they are tried: GEMINI_TTS_KEYS (comma separated), then GEMINI_API_KEY. */
function geminiKeys() {
  const file = path.join(ROOT, ".env.local");
  const env = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const read = (name) => process.env[name] ?? new RegExp("^" + name + "=(.+)$", "m").exec(env)?.[1] ?? "";
  const keys = [read("GEMINI_TTS_KEYS"), read("GEMINI_API_KEY"), read("NEXT_PUBLIC_GEMINI_API_KEY")].join(",").split(",").map((k) => k.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  if (!keys.length) throw new Error("no Gemini API key: set GEMINI_TTS_KEYS or GEMINI_API_KEY");
  return [...new Set(keys)];
}

const wavOf = (pcm, rate) => {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVEfmt ", 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
};

/** Where each line is in a take, in seconds: Gemini listens to it once (the answer is kept beside the take). */
async function lineTimes(file, says) {
  const side = file.replace(/\.wav$/, ".json");
  if (fs.existsSync(side)) return JSON.parse(fs.readFileSync(side, "utf8"));
  const text = `This recording has these ${says.length} lines, spoken in this order (other speech may come before the first and after the last):\n${says.map((say, i) => `${i + 1}. ${say}`).join("\n")}\nFor each line, give the second it starts at and the second it ends at. If a line is not spoken in the recording, give -1 for both.`;
  const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { line: { type: "INTEGER" }, start: { type: "NUMBER" }, end: { type: "NUMBER" } }, required: ["line", "start", "end"] } };
  const keys = geminiKeys();
  let why = "";
  for (let n = 0; n < keys.length * 6; n++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VOICE.listeners[Math.floor(n / keys.length) % VOICE.listeners.length]}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: { "x-goog-api-key": keys[n % keys.length], "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text }, { inlineData: { mimeType: "audio/wav", data: fs.readFileSync(file).toString("base64") } }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema } }),
    }).then((res) => res.json(), (e) => ({ error: { message: String(e) } }));
    try {
      const times = JSON.parse(r.candidates[0].content.parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("")).map((t) => [t.start, t.end]);
      const missing = times.some(([a]) => a < 0);
      if (times.length !== says.length || (!missing && times.some(([a, b], i) => !(b > a) || (i && a < times[i - 1][1] - 0.3)))) throw new Error("the times are out of order");
      fs.writeFileSync(side, JSON.stringify(times));
      return times;
    } catch (e) {
      why = (r.error?.message ?? String(e)).slice(0, 160);
      await sleep(3000 + n * 2000);
    }
  }
  throw new Error(`Gemini could not place the lines in ${path.basename(file)}: ${why}`);
}

/** The file a take of these lines is kept in. */
const takeFile = (says) => path.join(TAKES, `take-${crypto.createHash("sha1").update(`${VOICE.model}|${VOICE.name}|${VOICE.style}|${VOICE.tail}|${process.env.TAKE ?? 0}|${says.join("|")}`).digest("hex").slice(0, 10)}.wav`);

/** REUSE=1, when Gemini has no quota left: each line from another video's kept take that has it (line → that take's lines). */
function keptLines() {
  const kept = new Map();
  for (const [n, v] of videos.entries()) {
    const says = narration(v, n).map(([, say]) => say);
    if (fs.existsSync(takeFile(says).replace(/\.wav$/, ".json"))) for (const say of says) if (!kept.has(say)) kept.set(say, says);
  }
  return kept;
}

/** Lines said in one take (kept between runs), cut at its pauses: one trimmed WAV per line. */
async function speak(says, dir, tag) {
  fs.mkdirSync(TAKES, { recursive: true });
  const file = takeFile(says);
  // Now and then the voice leaves a line out: such a take is thrown away, and another is asked for.
  let times = null;
  for (let tries = 0; !times; tries++) {
    if (fs.existsSync(file)) {
      times = await lineTimes(file, says);
      if (times.every(([at]) => at >= 0)) break;
      if (tries === 3) throw new Error(`the voice keeps leaving out line ${times.findIndex(([at]) => at < 0) + 1} of ${says.length}: ${says[0]} …`);
      console.warn(`  a take without line ${times.findIndex(([at]) => at < 0) + 1} — asking again`);
      for (const old of [file, file.replace(/\.wav$/, ".json")]) fs.rmSync(old, { force: true });
      times = null;
    }
    const keys = geminiKeys();
    let audio = null, why = "";
    for (let busy = 0; !audio && keys.length; ) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VOICE.model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": keys[0], "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${VOICE.style}\n\n${[...says, VOICE.tail].join("\n\n")}` }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE.name } } } } }),
      }).then((res) => res.json(), (e) => ({ error: { message: String(e) } }));
      audio = r.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData ?? null;
      if (audio) break;
      why = (r.error?.message ?? JSON.stringify(r)).slice(0, 160);
      // A key that has used up its day (or can't be used) hands over to the next one; a busy model is asked again.
      if (/PerDay/.test(JSON.stringify(r.error?.details ?? "")) || [400, 401, 403].includes(r.error?.code)) {
        keys.shift();
        console.warn(`  a key can't be used (${why.slice(0, 90)}) — ${keys.length} key(s) left`);
      } else if (++busy > 6) break;
      else await sleep(15_000 * busy);
    }
    if (!audio) throw new Error(`Gemini gave no audio: ${why}`);
    fs.writeFileSync(file, wavOf(Buffer.from(audio.data, "base64"), Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] ?? 24000)));
  }
  // The take's pauses: runs of quiet 10 ms frames.
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24);
  const pcm = new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + 44 + ((b.length - 44) & ~1)));
  const hop = rate / 100;
  const level = [];
  for (let i = 0; i + hop <= pcm.length; i += hop) {
    let sum = 0;
    for (let j = i; j < i + hop; j++) sum += pcm[j] * pcm[j];
    level.push(Math.sqrt(sum / hop));
  }
  const quiet = [...level].sort((x, y) => x - y)[Math.floor(level.length * 0.95)] * 0.04;
  const pauses = [];
  for (let i = 0; i < level.length; ) {
    if (level[i] > quiet) { i++; continue; }
    let e = i;
    while (e < level.length && level[e] <= quiet) e++;
    if (e - i >= 12) pauses.push({ from: i, to: e });
    i = e;
  }
  // A line is cut out in the pauses around it: the one nearest to where the line before ends and it starts.
  const edges = Array.from({ length: says.length + 1 }, (_, i) => {
    const at = (i === 0 ? times[0][0] : i === says.length ? times.at(-1)[1] : (times[i - 1][1] + times[i][0]) / 2) * 100;
    const away = (p) => (at < p.from ? p.from - at : at > p.to ? at - p.to : 0);
    const pause = pauses.reduce((best, p) => (!best || away(p) < away(best) ? p : best), null);
    if (pause && away(pause) < 100) return Math.round(((pause.from + pause.to) / 2) * hop);
    if (i === 0 || i === says.length) return i === 0 ? 0 : pcm.length;
    throw new Error(`no pause between lines ${i} and ${i + 1} of ${path.basename(file)} — give it another take (TAKE=${Number(process.env.TAKE ?? 0) + 1})`);
  });
  if (edges.some((e, i) => i && e <= edges[i - 1])) throw new Error(`two lines of ${path.basename(file)} run together — give it another take (TAKE=${Number(process.env.TAKE ?? 0) + 1})`);
  return says.map((say, n) => {
    const part = pcm.slice(edges[n], edges[n + 1]);
    const raw = path.join(dir, `vo-${tag}-${n}.raw.wav`), out = path.join(dir, `vo-${tag}-${n}.wav`);
    fs.writeFileSync(raw, wavOf(Buffer.from(part.buffer, part.byteOffset, part.byteLength), rate));
    // Trimmed to the speech, with a short fade at both ends (a cut in a breath would click).
    ffmpeg(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,afade=t=in:d=0.01,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.12,afade=t=in:d=0.06,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
    return { say, file: out, seconds: (fs.statSync(out).size - 44) / (44100 * 2) };
  });
}

// --- One video ---------------------------------------------------------------------------------------

async function make(v, n, work) {
  const voice = [];
  if (process.env.VOICE !== "off") {
    let lines = narration(v, n);
    let clips;
    if (process.env.REUSE && !fs.existsSync(takeFile(lines.map(([, say]) => say)))) {
      const kept = keptLines();
      const missing = lines.filter(([, say]) => !kept.has(say));
      if (missing.length) console.warn(`  not in a kept take, left out: ${missing.map(([, say]) => say).join(" / ")}`);
      lines = lines.filter(([, say]) => kept.has(say));
      clips = [];
      for (const [i, [, say]] of lines.entries()) {
        const says = kept.get(say);
        clips.push((await speak(says, work, `${v.no}-${i}`))[says.indexOf(say)]);
      }
    } else clips = await speak(lines.map(([, say]) => say), work, v.no);
    // Each line at its time, a little faster when it would run into the next one.
    let free = 0;
    for (const [i, clip] of clips.entries()) {
      const t = Math.max(lines[i][0], free);
      const room = (lines[i + 1]?.[0] ?? total - 0.2) - t - 0.2;
      const tempo = Math.min(1.15, Math.max(1, clip.seconds / Math.max(room, 0.1)));
      free = t + clip.seconds / tempo + 0.2;
      console.log(`  ${t.toFixed(2)} s  ${clip.seconds.toFixed(2)} s${tempo > 1 ? ` ×${tempo.toFixed(2)}` : ""}  ${clip.say}`);
      voice.push({ ...clip, t, tempo });
    }
    if (free - 0.2 > total) console.warn(`  the commentary runs ${(free - 0.2 - total).toFixed(2)} s past the end`);
  }
  const png = path.join(work, `frame-${v.no}.png`);
  await frame(png, `MAP ${v.map + 1}/${info.maps.length} · ${v.def.name.toUpperCase()} · PART ${v.part}`);
  const graph = [
    `[0:v]split[p1][p2]`,
    `[p1]scale=-2:${WIN_H},crop=1080:${WIN_H},boxblur=20:2,eq=brightness=-0.22:saturation=1.1,pad=1080:1920:0:${TOP}[bg]`,
    `[p2]crop=${CROP_W}:1080:${(1920 - CROP_W) / 2}:0,scale=1080:${PIC_H}:flags=lanczos[fg]`,
    `[bg][fg]overlay=0:${PIC_Y}[c]`,
    `[c][1:v]overlay=0:0:shortest=1,fade=t=in:d=0.3,format=yuv420p,settb=AVTB,fps=${FPS}[play]`,
    `[2:v]format=yuv420p,settb=AVTB,fps=${FPS}[cover]`,
    `[play][cover]xfade=transition=fade:duration=${DISSOLVE}:offset=${(run - DISSOLVE).toFixed(2)},format=yuv420p[v]`,
    `[0:a]afade=t=in:d=0.25,afade=t=out:st=${(run - 1.2).toFixed(2)}:d=1.2,apad=whole_dur=${total}[game]`,
    // The commentary on top (cleaned up and compressed), the game's sound ducking under it.
    ...(voice.length
      ? [
          ...voice.map((c, i) => `[${i + 3}:a]${c.tempo > 1 ? `atempo=${c.tempo.toFixed(3)},` : ""}adelay=${Math.round(c.t * 1000)}:all=1[v${i}]`),
          `${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,highpass=f=90,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.5,aformat=channel_layouts=stereo,aresample=48000,apad[voice]`,
          `[voice]asplit=2[voice1][voice2]`,
          `[game]aresample=48000,aformat=channel_layouts=stereo[g]`,
          `[g][voice1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]`,
          `[ducked][voice2]amix=inputs=2:normalize=0:duration=first[sound]`,
        ]
      : [`[game]anull[sound]`]),
    `[sound]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
  ].join(";");
  const out = path.join(SHORTS, v.file);
  ffmpeg(["-ss", v.a.toFixed(3), "-t", run.toFixed(3), "-i", VIDEO, "-loop", "1", "-framerate", String(FPS), "-i", png, "-loop", "1", "-framerate", String(FPS), "-t", String(END + DISSOLVE), "-i", path.join(work, "cover.png"), ...voice.flatMap((c) => ["-i", c.file]), "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", String(total), "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-profile:v", "high", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
  console.log(`  ${path.relative(OUT, out)}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
}

// --- The batch ---------------------------------------------------------------------------------------

const done = (v) => fs.existsSync(path.join(SHORTS, v.file)) || fs.existsSync(path.join(SHORTS, "posted", v.file));
function writeList() {
  const lines = [
    "# Saucer Siege gameplay Shorts",
    "",
    `**${videos.filter(done).length} of ${videos.length} done** — updated ${new Date().toLocaleString("en-IN")}.`,
    "",
    "Made by `node scripts/build-saucer-gameplay-shorts.mjs [numbers]` in games.codelove.in, from `video/saucer-siege-full-gameplay.mp4`. It skips the videos that are already here (or in `posted`).",
    "",
    "| # | Done | Map | Part | Gameplay | Title (the file's name, without the number and .mp4) | Length |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...videos.map((v) => `| ${v.no} | ${done(v) ? "yes" : ""} | ${v.def.name} | ${v.part}/${v.parts} | ${v.a.toFixed(1)}–${v.b.toFixed(1)} s | ${v.title} | ${v.title.length} |`),
    "",
  ];
  fs.writeFileSync(LIST, lines.join("\n"));
}

// DRY=1: only print each video's commentary (no voice, no video).
if (process.env.DRY) {
  for (const [n, v] of videos.entries()) console.log(`${v.no}\n${narration(v, n).map(([t, say]) => `  ${t.toFixed(1).padStart(5)} s  ${say}`).join("\n")}`);
  process.exit(0);
}
fs.mkdirSync(SHORTS, { recursive: true });
writeList();
const asked = process.argv.slice(2).map(Number);
const todo = asked.length ? videos.filter((v) => asked.includes(Number(v.no)) && !done(v)) : videos.filter((v) => !done(v));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "saucer-gameplay-shorts-"));
try {
  if (todo.length) await cover(path.join(work, "cover.png"));
  for (const [i, v] of todo.entries()) {
    console.log(`\n[${i + 1}/${todo.length}] ${v.no}: ${v.def.name} part ${v.part}/${v.parts} (${v.a.toFixed(1)}–${v.b.toFixed(1)} s)`);
    await make(v, videos.indexOf(v), work);
    writeList();
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
console.log(`\n${videos.filter(done).length} of ${videos.length} done — ${path.relative(ROOT, LIST)}`);
