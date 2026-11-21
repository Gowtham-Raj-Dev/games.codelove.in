#!/usr/bin/env node
/**
 * Cuts the best parts of the full Crypt Knight gameplay (scripts/record-crypt-gameplay.mjs) into 30-second YouTube
 * Shorts, laid out like the Saucer Siege gameplay Shorts: the run between two banners (384 px above, 384 px below,
 * 1080×1152 between), then a full-screen "Play now" cover for the last 3 seconds, with a Tamil commentary over it.
 *   OUT/shorts/<number> - <title>.mp4   1080×1920, 30 fps, 30 seconds
 *   OUT/shorts/PROGRESS.md              the list, rewritten after every video
 *
 *   node scripts/build-crypt-gameplay-shorts.mjs          all that are not made yet
 *   node scripts/build-crypt-gameplay-shorts.mjs 2 5      only those numbers
 *   node scripts/build-crypt-gameplay-shorts.mjs 0        only rewrite PROGRESS.md
 *
 * Not every 27 s of the 22-minute run: per world its opening (the world card and first stages), one stage fight
 * from the middle, and the whole king fight (start to "world clear", in pieces of 27 s that may overlap a little).
 *
 * The commentary (VOICE=off leaves it out) is Gemini TTS ("Achernar", as in the Saucer Siege videos), one take a
 * video, kept in OUT/shorts/voice takes. REUSE=1 builds from lines already in kept takes when the day's quota is gone.
 *
 * Env: FFMPEG (default: the copy in %LOCALAPPDATA%/kolusu-promo-tools), OUT (default ../z-video-files/games.codelove.in/crypt-knight),
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
const OUT = process.env.OUT ?? path.resolve(ROOT, "..", "z-video-files", "games.codelove.in", "crypt-knight");
const VIDEO = path.join(OUT, "video", "crypt-knight-full-gameplay.mp4");
const SHORTS = path.join(OUT, "shorts");
const LIST = path.join(SHORTS, "PROGRESS.md");
const TAKES = path.join(SHORTS, "voice takes");
const BACKDROP = path.join(ROOT, "public", "games", "crypt-knight", "backdrop-tall-1170.webp");
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
const WORLDS = info.worlds; // { name, boss, hero }

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}

// --- The pieces --------------------------------------------------------------------------------------

/** What is said about each world: the opening of its first piece, and a line of its own for the quiet stretches. */
const WORLD_LINES = [
  { open: "Crypt Knight! முதல் world, The Crypt... Knight-ஓட ஆரம்பிக்கலாம்!", tip: "Skeletons கூட்டமா வருவாங்க... dodge பண்ணிட்டே அடிக்கணும்!", king: "The Bone King வந்துட்டான்! இது தான் boss fight!", kingWon: "Bone King காலி! முதல் world clear!" },
  { open: "World ரெண்டு, Frozen Crypt! இந்த தடவ Barbarian!", tip: "Frozen Crypt-ல எல்லாமே ice... கவனமா move பண்ணணும்!", king: "Frost King வந்தாச்சு! Barbarian ready-ஆ?", kingWon: "Frost King-ஐ ஜெயிச்சாச்சு! World ரெண்டு clear!" },
  { open: "World மூணு, Poison Catacombs! இப்போ Rogue!", tip: "Green poison மேல நிக்காதீங்க... health குறையும்!", king: "Plague King! இவன் கிட்ட poison அதிகம்!", kingWon: "Plague King காலி! மூணாவது world clear!" },
  { open: "World நாலு, Lava Depths! Mage-ஓட magic பாக்கலாம்!", tip: "Lava பக்கத்துல போகவே கூடாது!", king: "Ember King வந்துட்டான்! Fire boss!", kingWon: "Ember King-ஐ முடிச்சாச்சு! World நாலு clear!" },
  { open: "கடைசி world, Gold Vault! Hooded Rogue!", tip: "Gold Vault... எல்லா பக்கமும் தங்கம்!", king: "கடைசி boss, Gold King! இது தான் final fight!", kingWon: "Gold King காலி! எல்லா worlds-உம் clear!" },
];
/** For the quiet stretches, in turn. */
const TIPS = [
  "Parry சரியா பண்ணா, enemy-ஓட அடி நமக்கு வராது!",
  "Roll பண்ணி அடிய escape பண்ணலாம்!",
  "Health குறைஞ்சா potion குடிச்சிடணும்!",
  "2x speed-ல ஓடுது... ஆனாலும் எல்லா stages-உம் clear!",
  "தூரத்துல இருந்து அடிக்கிறவங்கள முதல்ல முடிக்கணும்!",
  "ஒவ்வொரு world-க்கும் ஒரு புது hero!",
  "Boss-ஓட attack-அ பாத்து dodge பண்ணணும்!",
  "Corner-ல மாட்டிக்கக் கூடாது... move பண்ணிட்டே இருக்கணும்!",
  "ஒவ்வொரு world-லயும் பத்து stages, கடைசில ஒரு King!",
  "Combo-வா அடிச்சா damage அதிகம்!",
];
const TAMIL_NUM = ["", "ஒரு", "ரெண்டு", "மூணு"];
/** The longest a stretch without a line may run, from one line's start to the next. */
const QUIET = 9.5;
/** What a title opens with, by what the piece shows. No characters a file's name can't have. */
const HOOK = {
  open: ["Pudhu World Pudhu Hero", "Dungeon Adventure Start"],
  stages: ["Skeletons Attack 2x Speed", "Dungeon Fight - Stage Clear", "Hero vs Monsters"],
  king: ["Boss Fight", "King Vandhachu - Boss Fight", "Indha Boss-a Jeikka Mudiyuma"],
  won: ["Boss Defeated - World Clear", "King Kaali - World Clear"],
};
const TAILS = ["Crypt Knight Tamil Gameplay - Free 3D Game #shorts", "Crypt Knight Tamil Gameplay #shorts", "Crypt Knight Tamil #shorts", "Crypt Knight #shorts"];
const LIMIT = 99;

const videos = [];
for (const w of events.filter((e) => e.type === "world")) {
  const def = WORLDS[w.world];
  const stages = events.filter((e) => e.type === "stage" && e.world === w.world);
  const kingStage = stages.find((e) => e.king);
  const won = events.find((e) => e.type === "won" && e.world === w.world && e.stage === 9);
  if (!kingStage || !won) continue;
  const pieces = [];
  // the opening: world card and the first stages
  pieces.push({ a: w.t - 0.3, kind: "open" });
  // one stage fight from the middle (stage 6 — longer fights by then)
  const mid = stages.find((e) => e.stage === 6) ?? stages[Math.floor(stages.length / 2)];
  pieces.push({ a: mid.t - 0.5, kind: "stages" });
  // the whole king fight
  const from = kingStage.t - 0.3, to = won.t + 4.5;
  const count = Math.ceil((to - from) / run);
  const step = count > 1 ? (to - run - from) / (count - 1) : 0;
  for (let k = 0; k < count; k++) pieces.push({ a: from + k * step, kind: k === count - 1 ? "won" : "king" });
  pieces.forEach((p, i) => videos.push({ world: w.world, def, part: i + 1, parts: pieces.length, a: p.a, b: p.a + run, kind: p.kind }));
}
videos.forEach((v, n) => {
  v.no = String(n + 1).padStart(2, "0");
  const hooks = HOOK[v.kind];
  const base = v.kind === "king" || v.kind === "won" ? `${hooks[n % hooks.length]} - ${v.def.boss}` : `${hooks[n % hooks.length]} - ${v.def.name}`;
  const hook = `${base} Part ${v.part}`;
  v.title = TAILS.map((tail) => `${hook} - ${tail}`).find((t) => t.length <= LIMIT) ?? hook.slice(0, LIMIT);
  v.file = `${v.no} - ${v.title}.mp4`;
});

/** The commentary of a piece: its lines and when each is said, in seconds into the piece. */
function narration(v, n) {
  const at = (e) => e.t - v.a;
  const W = WORLD_LINES[v.world];
  const stageNow = [...events].reverse().find((e) => e.type === "stage" && e.world === v.world && e.t <= v.a + 3);
  const open =
    v.kind === "open" ? W.open
    : v.kind === "king" || v.kind === "won" ? (v.part === 3 ? W.king : `${v.def.boss.replace(/^The /, "")} கூட fight தொடருது!`)
    : `${v.def.name}, stage ${(stageNow?.stage ?? 5) + 1}! ${v.def.hero} அடிச்சு தூக்குறாரு!`;
  const lines = [[0.4, open]];
  // What happens in the piece: the king turning up and the victories.
  const said = [];
  for (const e of events) {
    if (e.t < v.a + 4 || e.t > v.a + run - (e.type === "won" ? 3 : 5)) continue;
    if (e.type === "won" && e.world === v.world && e.stage === 9) said.push([at(e) + 0.3, W.kingWon, 3]);
    else if (e.type === "won" && e.world === v.world) said.push([at(e) + 0.3, e.stars === 1 ? "Stage clear! ஒரு star!" : `Stage clear! ${TAMIL_NUM[e.stars] ?? "மூணு"} stars!`, 1]);
    else if (e.type === "king" && v.part !== 3) said.push([at(e) + 0.3, W.king, 2]);
    else if (e.type === "stage" && e.world === v.world && !e.king && e.stage > 0) said.push([at(e) + 0.3, `Stage ${e.stage + 1}! ${e.stage === 8 ? "அடுத்தது King தான்!" : `இன்னும் ${9 - e.stage} stages.`}`, 0]);
  }
  const mid = [];
  for (const line of said.sort((x, y) => y[2] - x[2])) if (mid.length < 3 && [...lines, ...mid].every(([t]) => Math.abs(t - line[0]) > 5.5)) mid.push(line);
  const all = [...lines, ...mid.map(([t, say]) => [t, say]), [run - 0.7, "Free game! Link bio-ல இருக்கு."]].sort((x, y) => x[0] - y[0]);
  // A quiet stretch gets a tip: halfway through it, or 5 s in when it is long (and then the rest is looked at again).
  const tips = [...(n % 3 === 0 ? [W.tip] : []), ...TIPS.slice(n % TIPS.length), ...TIPS.slice(0, n % TIPS.length)];
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
  <linearGradient id="band" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4c0a12"/><stop offset="1" stop-color="#1a0508"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
  <filter id="s"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".6"/></filter>`;
/** One line: the two words placed apart (the renderer drops the space between two spans). */
const TITLE = (y, size) => `<g filter="url(#s)" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="${size}" stroke="#1a0508" stroke-width="${size / 9}" paint-order="stroke">
    <text x="${540 - size * 0.27}" y="${y}" text-anchor="end" fill="#fff">CRYPT</text><text x="${540 - size * 0.03}" y="${y}" text-anchor="start" fill="#f87171">KNIGHT</text></g>`;
const PLAY = (y, w, h, size) => `<g filter="url(#s)"><rect x="${540 - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#1a0508"/>
    <rect x="${540 - w / 2 + 8}" y="${y + 6}" width="${w - 16}" height="${h - 20}" rx="${(h - 20) / 2}" fill="url(#gold)"/></g>
  <text x="540" y="${y + h / 2 + size * 0.3}" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="${size}" fill="#1c1003">▶ PLAY NOW</text>`;
const LINKS = (y) => `<text x="540" y="${y}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="40" fill="#fff" filter="url(#s)">5 worlds • <tspan fill="#fbbf24">5 kings to beat</tspan></text>
  <text x="540" y="${y + 56}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="800" font-size="38" fill="#fff" filter="url(#s)">games.codelove.in<tspan fill="#fbbf24">/crypt-knight</tspan></text>`;

/** The banners above and below the window, as one PNG that is clear in between. */
async function frame(file, pill) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs>${STRIPES}</defs>
  <rect width="1080" height="${TOP}" fill="url(#band)"/><rect width="1080" height="${TOP}" fill="url(#st)"/><rect y="${TOP - 12}" width="1080" height="12" fill="#f59e0b"/>
  <rect y="${TOP + WIN_H}" width="1080" height="${1920 - TOP - WIN_H}" fill="url(#band)"/><rect y="${TOP + WIN_H}" width="1080" height="${1920 - TOP - WIN_H}" fill="url(#st)"/><rect y="${TOP + WIN_H}" width="1080" height="12" fill="#f59e0b"/>
  <rect x="${540 - pill.length * 11 - 40}" y="84" width="${pill.length * 22 + 80}" height="60" rx="30" fill="#fff" filter="url(#s)"/>
  <text x="540" y="125" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="30" letter-spacing="2" fill="#4c0a12">${esc(pill)}</text>
  ${TITLE(290, 108)}
  ${PLAY(1600, 580, 124, 66)}
  ${LINKS(1800)}
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

/** The closing card: the game's tall backdrop, the title and "Play now". */
async function cover(file) {
  const art = await sharp(BACKDROP).resize(1080, 1920, { fit: "cover", position: "centre" }).toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><defs>${STRIPES}
  <linearGradient id="dim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0508" stop-opacity=".8"/><stop offset=".4" stop-color="#1a0508" stop-opacity=".15"/><stop offset=".62" stop-color="#1a0508" stop-opacity=".2"/><stop offset="1" stop-color="#0d0204" stop-opacity=".92"/></linearGradient></defs>
  <rect width="1080" height="1920" fill="url(#dim)"/>
  <rect x="345" y="120" width="390" height="70" rx="35" fill="#fff" filter="url(#s)"/>
  <text x="540" y="168" text-anchor="middle" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" font-size="34" letter-spacing="2" fill="#4c0a12">FREE 3D GAME</text>
  <g filter="url(#s)" font-family="Arial Black, Segoe UI Black, Arial" font-weight="900" text-anchor="middle" stroke="#1a0508" stroke-width="18" paint-order="stroke">
    <text x="540" y="400" font-size="190" fill="#fff">CRYPT</text><text x="540" y="590" font-size="170" fill="#f87171">KNIGHT</text></g>
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
  style: "# AUDIO PROFILE: Priya, a Tamil gaming YouTuber\n## THE SCENE: she records the live commentary for a YouTube Short of her own run in a 3D dungeon action game, where a hero fights skeletons and big boss kings.\n### DIRECTOR'S NOTES\nStyle: bright, energetic, friendly; natural Chennai-style Tanglish; excited when a boss king turns up or a world is cleared.\nPacing: fast and punchy, the same energy in every line, and a full second of silence after every paragraph.\n#### TRANSCRIPT",
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
  await frame(png, `WORLD ${v.world + 1}/${WORLDS.length} · ${v.def.name.toUpperCase()} · PART ${v.part}`);
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
    "# Crypt Knight gameplay Shorts",
    "",
    `**${videos.filter(done).length} of ${videos.length} done** — updated ${new Date().toLocaleString("en-IN")}.`,
    "",
    "Made by `node scripts/build-crypt-gameplay-shorts.mjs [numbers]` in games.codelove.in, from `video/crypt-knight-full-gameplay.mp4`. It skips the videos that are already here (or in `posted`).",
    "",
    "| # | Done | World | Part | Gameplay | Title (the file's name, without the number and .mp4) | Length |",
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
const work = fs.mkdtempSync(path.join(os.tmpdir(), "crypt-gameplay-shorts-"));
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
