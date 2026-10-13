#!/usr/bin/env node
/**
 * Records a vertical (9:16) Skate Rush gameplay video for YouTube Shorts, Reels and the like: one run on
 * one stage with one skater, skin and board, between the game's Shorts banners (shorts-frame.png), then
 * the full-screen "Play now" cover (shorts-cover.png) for the last 3 seconds.
 *   ../youtube game play/skate rush game play/<stage>-<skater>-<skin>-<board>.mp4   1080×1920, 60 fps, 30 seconds
 *
 *   npm run dev                                   (in another terminal)
 *   node scripts/record-skate-gameplay.mjs [stage] [skater] [skin] [board]
 *
 * The same method as the Shorts trailer (scripts/record-skate-shorts.mjs): the game runs in headless
 * Chrome on a virtual clock — every frame is stepped by exactly 1/60 s and captured — while the
 * autopilot plays (window.__skateRush on the dev server), with the game's own score display left on.
 * So that every video shows them, spring shoes are put in the skater's way a few seconds in, and a jetpack
 * halfway (a short run would not get that far: the game keeps the jetpack for later in a run).
 * The music and sound effects are rendered offline by the game's synthesizer and normalised to -14 LUFS.
 *
 * VOICE=ta adds a Tamil commentary (see NARRATION): what the video shows — the stage, the skater, the
 * power-ups as they turn up — in the Tamil tutorials' voice, Gemini TTS ("Achernar"), the whole commentary
 * in one request so it is one take, then cut into its lines at the pauses. The game's sound ducks under it.
 * The takes are shared: a stage's videos use the same ones, so the whole series needs a few dozen. They are
 * kept in OUT/voice takes (TAKE=2 asks for others).
 *
 * Env: BASE (default http://localhost:3000), CHROME, FFMPEG (default: the copy in the model library's
 * project, ../Models.Codelove.in/promo/tools), OUT (the folder), SECONDS (default 30, cover included),
 * VOICE, TAKE, VOICE_ONLY=1 (stops after the voice and prints each line's time), DUB=<video> (with VOICE:
 * nothing is recorded, the commentary goes over that video, into OUT/with voice), GEMINI_TTS_KEYS /
 * GEMINI_API_KEY (default: the model library's .env.development.local).
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = process.env.OUT ?? path.resolve(ROOT, "..", "youtube game play", "skate rush game play");
const FRAME = path.join(ROOT, "public", "games", "skate-rush", "shorts-frame.png");
const COVER = path.join(ROOT, "public", "games", "skate-rush", "shorts-cover.png");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const LIBRARY = path.resolve(ROOT, "..", "Models.Codelove.in");
const FFMPEG = process.env.FFMPEG ?? path.join(LIBRARY, "promo", "tools", "ff", "node_modules", "ffmpeg-static", "ffmpeg.exe");
const TAKES = path.join(OUT, "voice takes");
const PORT = 9367;
/** The window between the banners is 1080×1152, 384 px down: the game is laid out at half that and captured at twice the pixels. */
const W = 540;
const H = 576;
const DPR = 2;
const TOP = 384;
const FPS = 60;
const total = Number(process.env.SECONDS ?? 30);
/** The cover closes the video; the run dissolves into it. */
const END = 3;
const DISSOLVE = 0.3;
const run = total - END;
const frames = Math.round(run * FPS);
/** Power-ups put in the skater's lane: seconds into the run, and which. */
const POWER_UPS = [
  [4, "spring"],
  [14.5, "jetpack"],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- What to record ---------------------------------------------------------------------------------

async function content() {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "src/components/games/skate-rush/content.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const tmp = path.join(os.tmpdir(), `skate-content-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const { SKATERS, SKINS, BOARDS, STAGES } = await content();
const pick = (list, id, what) => {
  const item = id ? list.find((i) => i.id === id) : list[0];
  if (!item) {
    console.error(`record-skate-gameplay: no ${what} "${id}" (have: ${list.map((i) => i.id).join(", ")})`);
    process.exit(1);
  }
  return item.id;
};
const [, , stageArg, skaterArg, skinArg, boardArg] = process.argv;
const loadout = { stage: pick(STAGES, stageArg, "stage"), skater: pick(SKATERS, skaterArg, "skater"), skin: pick(SKINS, skinArg, "skin"), board: pick(BOARDS, boardArg, "board") };

// --- Commentary (VOICE=ta) --------------------------------------------------------------------------

const VOICE = {
  model: "gemini-3.8-flash-tts",
  name: "Achernar",
  /** The models that find the lines in a take: the next one when one has used up its day or is busy. */
  listeners: ["gemini-3.1-flash-lite", "gemini-3.8-flash"],
  // Laid out as a script with its transcript last, so that the direction is not read out with the lines.
  style: "# AUDIO PROFILE: Priya, a Tamil gaming YouTuber\n## THE SCENE: she records the live commentary for a YouTube Short of her own run in a skateboard game.\n### DIRECTOR'S NOTES\nStyle: bright, energetic, friendly; natural Chennai-style Tanglish; excited when a power-up turns up.\nPacing: fast and punchy, the same energy in every line, and a full second of silence after every paragraph.\n#### TRANSCRIPT",
  /** Said after the last line and thrown away: the end of a take is often clipped. */
  tail: "சரி, அடுத்த video-ல பாக்கலாம்!",
};
/** What is said about each stage: the opening line (it names the skater), what to watch out for, and what the stage gives. */
const STAGE_LINES = {
  city: [(who) => `City Rush traffic-ல ${who} தப்பிப்பாரா? பாக்கலாம்!`, "ஒரு lane தப்பா போனா game over!", "இன்னும் ஆறு stages இருக்கு... Moon வரைக்கும் போகலாம்!"],
  docks: [(who) => `Sunset Docks-ல பெரிய trucks நடுவுல ${who}!`, "Heavy trucks... பாத்து lane மாத்தணும்!", "இங்க coins இருபது percent அதிகம்!"],
  snow: [(who) => `Snow Village ice road-ல ${who}! வழுக்காம ஓட முடியுமா?`, "Lane மாத்தும்போது board வழுக்கும், கவனம்!", "இங்க coins நாப்பது percent அதிகம்!"],
  neon: [(who) => `Neon Night... fastest stage-ல ${who}!`, "இங்க speed பத்து percent அதிகம்!", "Coins-உம் அறுபது percent அதிகம்!"],
  haunted: [(who) => `Haunted Hollow-ல நடு ராத்திரி ${who}! பயமா இருக்கா?`, "சவப்பெட்டி எல்லாம் jump பண்ணி தாண்டணும்!", "இங்க coins எண்பது percent அதிகம்!"],
  pirate: [(who) => `Pirate Cove beach road-ல ${who}!`, "கடல் அழகா இருக்கு... ஆனா கண்ணு road மேல!", "இங்க coins ரெண்டு மடங்கு!"],
  moon: [(who) => `நிலாவுல skateboarding! Moon Base-ல ${who}.`, "Gravity கம்மி... jump பண்ணா பறக்கற மாதிரி இருக்கும்!", "இங்க coins ரெண்டரை மடங்கு!"],
};
/** How many skaters' opening lines go into one take. */
const HOOKS = 6;
/**
 * The commentary: six lines and when each is said (a line that runs long pushes the next one back). They come
 * from two takes that the stage's other videos use too — its opening lines, six skaters to a take, and its
 * other five lines — so the whole series needs a few dozen takes, not one for every video.
 */
function narration() {
  const [hook, watch, gives] = STAGE_LINES[loadout.stage] ?? [(who) => `${STAGES.find((s) => s.id === loadout.stage).name}-ல ${who}!`, "ஒரு lane தப்பா போனா game over!", "Coins எல்லாம் அள்ளிக்கோங்க!"];
  const at = SKATERS.findIndex((s) => s.id === loadout.skater);
  const first = at - (at % HOOKS);
  return {
    hooks: SKATERS.slice(first, first + HOOKS).map((s) => hook(s.name)),
    hook: at - first,
    rest: ["Spring shoes! இனி எல்லாமே super jump.", watch, "இதோ jetpack! பறந்துகிட்டே coins அள்ளலாம்.", gives, "Free game! Link bio-ல இருக்கு."],
    times: [0.4, POWER_UPS[0][0] + 2, 10.8, POWER_UPS[1][0] + 1.1, 21.4, run - 0.7],
  };
}
const story = process.env.VOICE === "ta" ? narration() : null;

/** Gemini keys in the order they are tried: GEMINI_TTS_KEYS (comma separated), then GEMINI_API_KEY. */
function geminiKeys() {
  const file = path.join(LIBRARY, ".env.development.local");
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

/**
 * Where each line is in a take, in seconds: Gemini listens to it once (the answer is kept beside the take).
 * Counting pauses is not enough: a line may have a pause of its own, and now and then the voice reads its
 * direction out before the lines.
 */
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
      // The model is slow when it is busy, and now and then it does not answer at all.
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
      // A busy model is asked again, a little later each time.
      await sleep(3000 + n * 2000);
    }
  }
  throw new Error(`Gemini could not place the lines in ${path.basename(file)}: ${why}`);
}

/** Lines said in one take (kept between runs, in the videos' folder), cut at its longest pauses: one trimmed WAV per line. */
async function speak(says, dir, tag) {
  fs.mkdirSync(TAKES, { recursive: true });
  const id = crypto.createHash("sha1").update(`${VOICE.model}|${VOICE.name}|${VOICE.style}|${VOICE.tail}|${process.env.TAKE ?? 0}|${says.join("|")}`).digest("hex").slice(0, 10);
  const file = path.join(TAKES, `take-${id}.wav`);
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

// --- Page side -------------------------------------------------------------------------------------

/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = {
    start() { on = true; now = realNow(); },
    step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); },
  };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

/** The sound-effect log and the per-frame driver. */
const DIRECTOR = (data) => `(() => {
  const { fps, frames, powerUps } = ${JSON.stringify(data)};
  const sr = window.__skateRush, g = sr.game;
  const css = document.createElement("style");
  css.textContent = "nextjs-portal { visibility: hidden !important; }";
  document.head.append(css);
  // No "how to play" hint over the run (it shows on a player's first runs).
  sr.records.set({ runs: 3 });

  // The game's sound effects are logged (time, name) instead of played, and the rolling-wheels level per frame.
  const fxLog = [];
  const roll = new Array(frames).fill(0);
  const thrust = new Array(frames).fill(0);
  let tNow = 0, frameNow = 0;
  const originals = {};
  for (const name of ["coin", "jump", "land", "duck", "lane", "bump", "power", "shieldBreak", "crash", "go", "jetStart", "jetEnd", "spring"]) {
    originals[name] = g.sfx[name].bind(g.sfx);
    g.sfx[name] = () => fxLog.push([tNow, name]);
  }
  g.sfx.rolling = (level) => { roll[frameNow] = level; };
  g.sfx.thrust = (level) => { thrust[frameNow] = level; };

  // A power-up appears a second ahead in the skater's lane; if a jump or a lane change carries the
  // skater past it, it is switched on all the same.
  const on = (kind) => (kind === "jetpack" ? g.jet > 0 : g.spring > 0);
  const queue = powerUps.map(([at, kind]) => ({ at, kind, placed: false, done: false }));
  const powers = (t) => {
    for (const p of queue) {
      if (p.done || t < p.at) continue;
      if (!p.placed) {
        g.addPickup(p.kind, (g.lane - 1) * 2.6, g.distance + Math.max(14, g.speed), 0.45);
        p.placed = true;
      } else if (on(p.kind)) p.done = true;
      else if (t > p.at + 2) {
        g.sfx.power();
        if (p.kind === "jetpack") g.startJet();
        else g.spring = 10;
        p.done = true;
      }
    }
  };

  window.__trailer = {
    begin() {
      g.autopilot = true;
      g.invincible = true;
      g.start();
    },
    frame(n) {
      tNow = n / fps;
      frameNow = n;
      powers(tNow);
      window.__vt.step(1000 / fps);
      return true;
    },
    fx: () => fxLog,
    roll: () => roll,
    thrust: () => thrust,
    originals,
  };
})()`;

/** Builds the game's audio graph on an OfflineAudioContext (swapped in for the AudioContext while the hub unlocks). */
const OFFLINE_HUB = (seconds) => `
  const { audio, music } = window.__skateRush;
  music.stop();
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(rate * (${seconds} + 0.5)), rate);
  Object.defineProperty(ctx, "state", { get: () => "running" });
  const resume = ctx.resume.bind(ctx);
  ctx.resume = () => Promise.resolve();
  let tick = null;
  const realSetInterval = window.setInterval;
  window.setInterval = (fn) => { tick = fn; return 1; };
  audio.ctx = null;
  const Real = window.AudioContext;
  window.AudioContext = function () { return ctx; };
  audio.unlock();
  window.AudioContext = Real;
`;

/** 16-bit stereo WAV (base64) of the rendered buffer; the game goes back to silence afterwards. */
const TO_WAV = (seconds) => `
  // No AudioContext again until a tap, which never comes here.
  music.stop();
  audio.ctx = null;
  const n = Math.floor(${seconds} * rate);
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const bytes = new Uint8Array(out.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
`;

/** The music, rendered in 50 ms steps so the scheduler (ticked by hand) only queues the next few notes, as in the game. */
const MUSIC = (seconds) => `(async () => {
  ${OFFLINE_HUB(seconds)}
  // The stage's own theme (the game picks it; the stage is loaded by now).
  music.play(window.__skateRush.game.song ?? window.__skateRush.song, 1, { restart: true });
  window.setInterval = realSetInterval;
  for (let k = 1; k * 0.05 < ${seconds}; k++) ctx.suspend(k * 0.05).then(() => { tick && tick(); resume(); });
  tick && tick();
  const buf = await ctx.startRendering();
  ${TO_WAV(seconds)}
})()`;

/** Sound effects: every effect the run logged, played at its time by the game's own Sfx, and the rolling wheels as a filtered-noise bed following the logged level. */
const EFFECTS = (seconds) => `(async () => {
  ${OFFLINE_HUB(seconds)}
  window.setInterval = realSetInterval;
  const t = window.__trailer, fps = ${FPS};
  // Rolling wheels.
  const src = ctx.createBufferSource();
  src.buffer = audio.noiseBuffer;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  const bed = ctx.createGain();
  bed.gain.value = 0;
  src.connect(lp).connect(bed).connect(audio.sfxBus);
  src.start(0);
  t.roll().forEach((level, i) => {
    bed.gain.setTargetAtTime(level * 0.16, i / fps, 0.03);
    lp.frequency.setTargetAtTime(350 + level * 700, i / fps, 0.03);
  });
  // The run is over: no wheels under the cover.
  bed.gain.setTargetAtTime(0, t.roll().length / fps, 0.05);
  // The jetpack's roar, as the game's Sfx makes it.
  const jetSrc = ctx.createBufferSource();
  jetSrc.buffer = audio.noiseBuffer;
  jetSrc.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  const roar = ctx.createGain();
  roar.gain.value = 0;
  jetSrc.connect(bp).connect(roar).connect(audio.sfxBus);
  jetSrc.start(0);
  t.thrust().forEach((level, i) => {
    roar.gain.setTargetAtTime(level * 0.2, i / fps, 0.06);
    bp.frequency.setTargetAtTime(700 + level * 500, i / fps, 0.1);
  });
  roar.gain.setTargetAtTime(0, t.thrust().length / fps, 0.05);
  // Effects grouped by render quantum; rendering pauses at each group to start them right on time.
  const q = 128 / rate;
  const groups = new Map();
  for (const [time, name] of t.fx()) {
    const at = Math.max(q, Math.round(time / q) * q);
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(name);
  }
  const realNow = performance.now;
  for (const [at, names] of groups) {
    ctx.suspend(at).then(() => {
      // Coins pitch up when collected in quick succession: give the Sfx the effect's own time.
      performance.now = () => at * 1000;
      for (const name of names) t.originals[name]?.();
      performance.now = realNow;
      resume();
    });
  }
  const buf = await ctx.startRendering();
  ${TO_WAV(seconds)}
})()`;

// --- Chrome & ffmpeg -------------------------------------------------------------------------------

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") console.error("  page error:", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}

for (const tool of [CHROME, FFMPEG, FRAME, COVER]) {
  if (!fs.existsSync(tool)) {
    console.error(`record-skate-gameplay: ${tool} not found — set CHROME / FFMPEG`);
    process.exit(1);
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "skate-gameplay-"));
const profile = path.join(work, "profile");
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir);
fs.mkdirSync(OUT, { recursive: true });
const started = Date.now();
let chrome = null;
try {
  // The commentary first: each line at its time, a little faster when it would run into the next one.
  const voice = [];
  if (story) {
    console.log(`Commentary: Gemini TTS "${VOICE.name}"…`);
    const clips = [(await speak(story.hooks, work, "hook"))[story.hook], ...(await speak(story.rest, work, "rest"))];
    let free = 0;
    for (const [i, clip] of clips.entries()) {
      const t = Math.max(story.times[i], free);
      const room = (story.times[i + 1] ?? total - 0.2) - t - 0.2;
      const tempo = Math.min(1.15, Math.max(1, clip.seconds / Math.max(room, 0.1)));
      free = t + clip.seconds / tempo + 0.2;
      console.log(`  ${t.toFixed(2)} s  ${clip.seconds.toFixed(2)} s${tempo > 1 ? ` ×${tempo.toFixed(2)}` : ""}  ${clip.say}`);
      voice.push({ ...clip, t, tempo });
    }
    if (free - 0.2 > total) console.warn(`  the commentary runs ${(free - 0.2 - total).toFixed(2)} s past the end`);
    if (process.env.VOICE_ONLY) {
      fs.rmSync(work, { recursive: true, force: true });
      process.exit(0);
    }
  }

  // DUB: the commentary over a video that is already made — its picture as it is, its sound ducking under the voice.
  if (process.env.DUB) {
    if (!voice.length) throw new Error("DUB needs VOICE=ta");
    const out = path.join(OUT, "with voice", path.basename(process.env.DUB));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const graph = [
      ...voice.map((v, i) => `[${i + 1}:a]${v.tempo > 1 ? `atempo=${v.tempo.toFixed(3)},` : ""}adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`),
      `${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,highpass=f=90,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.5,aformat=channel_layouts=stereo,apad[voice]`,
      `[voice]asplit=2[voice1][voice2]`,
      `[0:a][voice1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]`,
      `[ducked][voice2]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
    ].join(";");
    ffmpeg(["-i", process.env.DUB, ...voice.flatMap((v) => ["-i", v.file]), "-filter_complex", graph, "-map", "0:v", "-map", "[a]", "-t", total.toFixed(3), "-c:v", "copy", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", out]);
    console.log(`${out}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
    fs.rmSync(work, { recursive: true, force: true });
    process.exit(0);
  }

  // 1. Picture.
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null);
  }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.navigate", { url: `${BASE}/skate-rush/play/` });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!window.__skateRush && /Play/i.test(document.body.innerText)`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npm run dev` running?)");
    await sleep(500);
  }

  console.log(`Loading ${Object.values(loadout).join(", ")}…`);
  await page.evaluate(`(async () => {
    const g = __skateRush.game;
    await g.setStage(${JSON.stringify(loadout.stage)});
    await g.setSkater(${JSON.stringify(loadout.skater)});
    g.setSkin(${JSON.stringify(loadout.skin)});
    g.setBoard(${JSON.stringify(loadout.board)});
  })()`);

  const song = await page.evaluate(`(__skateRush.game.song ?? __skateRush.song).name`);
  console.log(`Music: ${song}…`);
  const musicWav = path.join(work, "music.wav");
  fs.writeFileSync(musicWav, Buffer.from(await page.evaluate(MUSIC(total + 0.5)), "base64"));
  await sleep(1500);
  await page.evaluate("__vt.start()");
  await page.evaluate(DIRECTOR({ fps: FPS, frames, powerUps: POWER_UPS }));
  await page.evaluate("__trailer.begin()");
  console.log(`Recording ${frames} frames (${run} s at ${FPS} fps, ${W * DPR}×${H * DPR})…`);
  const t0 = Date.now();
  for (let n = 0; n < frames; n++) {
    await page.evaluate(`__trailer.frame(${n})`);
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (n % 300 === 0) console.log(`  ${n}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  console.log("Sound effects…");
  const fxWav = path.join(work, "fx.wav");
  fs.writeFileSync(fxWav, Buffer.from(await page.evaluate(EFFECTS(total + 0.5)), "base64"));
  page.close();

  // 2. The run between the banners, then the cover, with the music and the effects; -14 LUFS; 1080×1920, 60 fps.
  console.log("Encoding…");
  const out = path.join(OUT, `${Object.values(loadout).join("-")}.mp4`);
  const graph = [
    `[0:v]fade=t=in:d=0.3,pad=${W * DPR}:1920:0:${TOP}[run]`,
    `[run][1:v]overlay=0:0:shortest=1,format=yuv420p,settb=AVTB,fps=${FPS}[play]`,
    `[2:v]scale=${W * DPR}:1920,format=yuv420p,settb=AVTB,fps=${FPS}[cover]`,
    `[play][cover]xfade=transition=fade:duration=${DISSOLVE}:offset=${(run - DISSOLVE).toFixed(2)},format=yuv420p[v]`,
    `[3:a]volume=0.9[music]`,
    `[4:a]volume=1.1[fx]`,
    // The commentary on top (cleaned up and compressed), the game's sound ducking under it.
    ...(voice.length
      ? [
          ...voice.map((v, i) => `[${i + 5}:a]${v.tempo > 1 ? `atempo=${v.tempo.toFixed(3)},` : ""}adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`),
          `${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,highpass=f=90,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.5,aformat=channel_layouts=stereo,apad[voice]`,
          `[voice]asplit=2[voice1][voice2]`,
          `[music][fx]amix=inputs=2:normalize=0:duration=first,afade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0[game]`,
          `[game][voice1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]`,
          `[ducked][voice2]amix=inputs=2:normalize=0:duration=first[sound]`,
        ]
      : [`[music][fx]amix=inputs=2:normalize=0:duration=first,afade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0[sound]`]),
    `[sound]afade=t=in:d=0.25,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
  ].join(";");
  ffmpeg(["-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-loop", "1", "-framerate", String(FPS), "-i", FRAME, "-loop", "1", "-framerate", String(FPS), "-t", String(END + DISSOLVE), "-i", COVER, "-i", musicWav, "-i", fxWav, ...voice.flatMap((v) => ["-i", v.file]), "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", total.toFixed(3), "-profile:v", "high", "-movflags", "+faststart", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", out]);
  console.log(`${out}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB, ${total} s — made in ${((Date.now() - started) / 1000).toFixed(0)} s`);
} finally {
  chrome?.kill();
  await sleep(500);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
