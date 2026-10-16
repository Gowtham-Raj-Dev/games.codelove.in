#!/usr/bin/env node
/**
 * Records a vertical (9:16) Patti Veedu overview for YouTube Shorts, Reels and the like, narrated in Tamil:
 *   public/games/patti-veedu/shorts-ta.mp4   1080×1920, under a minute
 *
 *   node scripts/record-patti-shorts.mjs
 *   PREVIEW=1 …   a quick contact sheet (one small frame every half second, no sound, no voice) to check the shots
 *
 * The same method as the landscape trailer (scripts/record-patti-trailer.mjs in the model library's project):
 * the game runs from public/games/patti-veedu/app straight off the disk, on a virtual clock, one screenshot per
 * frame, the camera and Paatti directed shot by shot; everything the game plays while filming is logged and
 * replayed with its own synth, music box and rain on an OfflineAudioContext.
 *
 * The voice is the Tamil tutorials' one: Gemini TTS ("Achernar"), the whole narration in one request so it is
 * one take, then cut into its lines at the pauses. The video paces itself by the lines: every shot lasts as
 * long as what is said over it. The take is kept in node_modules/.cache/patti-shorts (TAKE=2 asks for another).
 * The captions keep clear of the bottom of the frame, where Shorts puts its own title and buttons.
 *
 * VOICE_ONLY=1 stops after the voice and prints each line's length (to check the cuts).
 * Env: CHROME, FFMPEG (default: the copy in the model library's project), GEMINI_TTS_KEYS / GEMINI_API_KEY
 * (default: the model library's .env.development.local), FPS (default 30), FOV, KEEP=1 keeps the frames.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "patti-veedu");
const GAME = pathToFileURL(path.join(OUT, "app", "index.html")).href + "?desk";
const TOOLS = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "kolusu-promo-tools");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? path.join(TOOLS, "node_modules", "ffmpeg-static", "ffmpeg.exe");
const CACHE = path.join(ROOT, "node_modules", ".cache", "patti-promo");
const PREVIEW = !!process.env.PREVIEW;
const PORT = 9358;
/** Layout size (a phone held upright) and the pixel ratio that makes the capture 1080×1920. */
const W = 540;
const H = 960;
const DPR = PREVIEW ? 0.5 : 2;
const FPS = Number(process.env.FPS ?? 30);
/** The game's view is made for a wide screen: upright, it needs a taller field of view to show as much of a room. */
const FOV = Number(process.env.FOV ?? 0);
const LIMIT = 58.5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VOICE = {
  model: "gemini-3.8-flash-tts",
  name: "Achernar",
  style: "Read this in a warm, smooth, friendly female voice, like a Tamil YouTuber showing her followers a horror game in natural Chennai-style Tanglish. A little hushed and suspenseful in the scary lines, bright and inviting at the end. Lively pace. Keep the same voice and energy from start to finish, and stop for a full second of silence after every paragraph:",
};

// --- Shots -----------------------------------------------------------------------------------------
// Each shot: the lines said over it ([spoken, caption]), min seconds, lead (silence before the first line),
// and page-side code (see DIRECTOR): setup(), cam(t, dur) → [x, z, yaw, pitch].
const shots = [
  { id: "gate", lead: 0.5, vo: [
    ["நள்ளிரவு. மழை. ஒரு பழைய செட்டிநாட்டு வீடு.", "Nalliravu. Mazhai. Oru pazhaiya Chettinad veedu."],
    ["இது... பாட்டி வீடு. ஒரு Tamil horror game.", "Ithu... Patti Veedu. Oru Tamil horror game."],
  ] },
  { id: "door", vo: [["ஒவ்வொரு ராத்திரியும், பாட்டி லாந்தர் எடுத்துக்கிட்டு வீடு முழுக்க சுத்துவாங்க.", "Ovvoru raathiriyum, Paatti laanthar eduthukkittu veedu muzhukka suthuvaanga."]] },
  { id: "sky", vo: [["வெளியே பாருங்க... நிலா, நட்சத்திரம், மொட்டை மாடி, தென்னை மரம்... எல்லாமே real-ஆ இருக்கும்.", "Veliye paarunga... nila, natchathiram, mottai maadi, thennai maram... ellame real-aa irukkum."]] },
  { id: "locks", vo: [["அஞ்சு ராத்திரிக்குள்ள தப்பிக்கணும். ஆனா வாசல்ல நாலு பூட்டு.", "Anju raathirikulla thappikkanum. Aana vaasalla naalu poottu."]] },
  { id: "rooms", vo: [["சமையலறை, படுக்கையறை, பூஜை அறை, இரண்டாவது கட்டு... வீடு முழுக்க explore பண்ணலாம்.", "Samayalarai, padukkaiyarai, pooja arai, irandaavathu kattu... veedu muzhukka explore pannalaam."]] },
  { id: "puzzles", vo: [["Keys தேடுங்க, diary படிங்க, puzzles solve பண்ணுங்க. ஒவ்வொரு clue-யும் ஒரு பூட்டைத் திறக்கும்.", "Keys thedunga, diary padinga, puzzles solve pannunga. Ovvoru clue-um oru poottai thirakkum."]] },
  { id: "hide", min: 6.6, lead: 0.5, vo: [["கொலுசு சத்தம் கேட்டா... உடனே ஒளிஞ்சுக்கோங்க.", "Kolusu satham kettaa... udane olinjukkonga."]] },
  { id: "chase", min: 5.4, lead: 0.3, vo: [["பாட்டி உங்கள பாத்துட்டா... ஓடுங்க!", "Paatti ungala paaththuttaa... odunga!"]] },
  { id: "black", min: 0.5 },
  { id: "end", tail: 1.3, vo: [
    ["அஞ்சு ராத்திரி தப்பிக்க முடியுமா? Free-ஆ games dot codelove dot in-ல play பண்ணுங்க. Android APK-உம் இருக்கு!", "Anju raathiri thappikka mudiyumaa? Free-aa games.codelove.in-la play pannunga. Android APK-um irukku!"],
    ["Comment-ல உங்க best time சொல்லுங்க!", "Comment-la unga best time sollunga!"],
  ] },
];const GAP = 0.3;
const says = shots.flatMap((s) => (s.vo ?? []).map(([say]) => say));

// --- Voice-over (Gemini TTS: one request, cut into its lines) ---------------------------------------
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}

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

/** The whole narration as one take (kept between runs), cut at its longest pauses: one trimmed WAV per line. */
async function speak(dir) {
  fs.mkdirSync(CACHE, { recursive: true });
  const id = crypto.createHash("sha1").update(`${VOICE.model}|${VOICE.name}|${VOICE.style}|${process.env.TAKE ?? 0}|${says.join("|")}`).digest("hex").slice(0, 10);
  const file = path.join(CACHE, `take-${id}.wav`);
  if (!fs.existsSync(file)) {
    const keys = geminiKeys();
    let audio = null, why = "";
    for (let busy = 0; !audio && keys.length; ) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${VOICE.model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": keys[0], "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${VOICE.style}\n\n${says.join("\n\n")}` }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE.name } } } } }),
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
    if (i > 20 && e < level.length - 20 && e - i >= 18) pauses.push({ at: (i + e) / 2, len: e - i });
    i = e;
  }
  // Which pauses end the lines: the set that keeps every line as long as its share of the text says,
  // preferring the longer pauses — found by dynamic programming. A line's length is counted in speech
  // only (the frames that aren't quiet): short lines are mostly pauses, so the clock misleads.
  const spoken = [0];
  for (const l of level) spoken.push(spoken.at(-1) + (l > quiet ? 1 : 0));
  const voiced = (frame) => spoken[Math.round(frame)];
  const chars = says.map((s) => s.replace(/[s.,?!…-]+/g, "").length), all = chars.reduce((x, y) => x + y, 0);
  const N = says.length;
  if (pauses.length < N - 1) throw new Error(`only ${pauses.length} pauses for ${N} lines — give it another take (TAKE=${Number(process.env.TAKE ?? 0) + 1})`);
  const cost = (from, to, i) => ((voiced(to) - voiced(from)) / voiced(level.length) - chars[i] / all) ** 2 * 400;
  let best = pauses.map((p) => ({ c: cost(0, p.at, 0) - p.len / 60, prev: -1 }));
  const back = [best];
  for (let i = 1; i < N - 1; i++) {
    const next = pauses.map((p, j) => {
      let c = Infinity, prev = -1;
      for (let q = 0; q < j; q++) {
        const v = best[q].c + cost(pauses[q].at, p.at, i);
        if (v < c) [c, prev] = [v, q];
      }
      return { c: c - p.len / 60, prev };
    });
    back.push(next);
    best = next;
  }
  let end = 0;
  best.forEach((x, j) => {
    if (x.c + cost(pauses[j].at, level.length, N - 1) < best[end].c + cost(pauses[end].at, level.length, N - 1)) end = j;
  });
  const cuts = [];
  for (let i = N - 2, j = end; i >= 0; j = back[i][j].prev, i--) cuts.unshift(pauses[j]);
  const edges = [0, ...cuts.map((c) => Math.round(c.at * hop)), pcm.length];
  return says.map((say, i) => {
    const part = pcm.slice(edges[i], edges[i + 1]);
    const raw = path.join(dir, `vo-${i}.raw.wav`), out = path.join(dir, `vo-${i}.wav`);
    fs.writeFileSync(raw, wavOf(Buffer.from(part.buffer, part.byteOffset, part.byteLength), rate));
    ffmpeg(["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.08,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
    return { say, file: out, seconds: (fs.statSync(out).size - 44) / (44100 * 2) };
  });
}

// --- Page side -------------------------------------------------------------------------------------
/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = { start() { on = true; now = realNow(); }, step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); }, get on() { return on; } };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

/** The game's AudioContext is an OfflineAudioContext from the start; its music clock (a 100 ms interval) is ticked by hand. */
const AUDIO_HOOK = (seconds) => `(() => {
  const rate = 44100, off = new OfflineAudioContext(2, Math.ceil(rate * ${seconds}), rate);
  const realResume = off.resume.bind(off), realSuspend = off.suspend.bind(off);
  Object.defineProperty(off, "state", { get: () => "running" });
  off.resume = () => Promise.resolve();
  off.suspend = (t) => (t === undefined ? Promise.resolve() : realSuspend(t));
  window.__off = { ctx: off, rate, resume: realResume, musTick: null };
  window.AudioContext = window.webkitAudioContext = function () { return off; };
  const si = window.setInterval;
  window.setInterval = function (fn, ms, ...a) { if (fn && fn.name === "musTick") { window.__off.musTick = fn; return 0; } return si(fn, ms, ...a); };
  try { localStorage.setItem("kolusu.gfx2", JSON.stringify("high")); } catch (e) {}
})()`;

/** Sounds the game makes while filming: logged with their arguments, replayed into the soundtrack. */
const LOGGED = ["anklet", "footstep", "paattiStep", "creak", "thud", "clink", "clang", "pickup", "match", "whoosh", "unlock", "bell", "sting", "scream", "thunder", "hum", "gong", "whisper", "voice", "setChase", "setHeart", "setOutdoor", "listener"];

/** Overlays, the per-frame driver and the shots. */
const DIRECTOR = (data) => `(() => {
  const D = ${JSON.stringify(data)};
  const k = window.__kolusu, A = k.K.Audio, P = k.P, E = k.E, W = k.W, G = k.G;
  if (D.fov) { k.camera.fov = D.fov; k.camera.updateProjectionMatrix(); }
  // only the 3D view, Paatti's danger vignette and the wardrobe slats: no buttons, chips or prompts
  const st = document.createElement("style");
  st.textContent = \`.topbar,#roomLbl,#timeChip,#toast,#cross,#prompt,#stam,#joy,#joyHint,#hud .slot,#hud .acts,#deskKeys,#clickToPlay,#voiceSub,#hideTxt,#card,#rotate{display:none!important}
  #tr{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:"Hind Madurai","Noto Sans Tamil",sans-serif;color:#f3e6d6}
  #tr .blk{position:absolute;inset:0;background:#000;opacity:0}
  #tr .cap{position:absolute;left:28px;right:28px;bottom:205px;text-align:center;font:800 33px/1.32 "Catamaran","Hind Madurai",sans-serif;letter-spacing:.01em;text-shadow:0 2px 4px #000,0 0 14px #000,0 0 26px #000;opacity:0}
  #tr .cap span{background:rgba(8,3,4,.62);padding:5px 12px 3px;border-radius:9px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  #tr .kick{position:absolute;left:0;right:0;top:92px;text-align:center;opacity:0}
  #tr .kick b{display:inline-block;padding:7px 18px 5px;border-radius:999px;background:#c0160d;color:#fff;font:400 21px/1 "Special Elite",serif;letter-spacing:.14em;box-shadow:0 0 22px rgba(220,30,10,.6)}
  #tr .title{position:absolute;left:0;right:0;top:27%;text-align:center;opacity:0}
  #tr .ta{font:900 84px/1.05 "Catamaran","Noto Sans Tamil",sans-serif;color:#d51c11;text-shadow:0 0 26px rgba(220,30,10,.6),0 4px 0 #3a0503,0 0 40px #000}
  #tr .en{margin-top:10px;font:400 50px/1 "Creepster",serif;letter-spacing:.08em;color:#e8d7c2;text-shadow:0 0 18px #000,0 2px 4px #000}
  #tr .sub{margin-top:12px;font:400 19px/1 "Special Elite",serif;letter-spacing:.4em;color:#d3bfa8;text-shadow:0 0 10px #000}
  #tr #trEnd{top:20%}
  #tr .play{display:inline-block;margin-top:40px;padding:15px 30px 11px;border-radius:999px;background:linear-gradient(180deg,#f87171,#dc2626 55%,#991b1b);color:#fff;font:400 34px/1 "Creepster",serif;letter-spacing:.1em;border:3px solid #0b0406;box-shadow:0 7px 0 #0b0406,0 0 34px rgba(220,30,10,.55)}
  #tr .url{margin-top:30px;font:400 31px/1 "Special Elite",serif;letter-spacing:.03em;color:#ffcf8a;text-shadow:0 0 12px #000}
  #tr .tip{margin-top:14px;font:600 22px/1.3 "Hind Madurai",sans-serif;color:#e8d7c2;text-shadow:0 0 10px #000}\`;
  document.head.appendChild(st);
  const tr = document.createElement("div"); tr.id = "tr";
  tr.innerHTML = '<div class="blk"></div><div class="kick"><b>TAMIL HORROR GAME</b></div>'
    + '<div class="title" id="trTitle"><div class="ta">பாட்டி வீடு</div><div class="en">PATTI VEEDU</div><div class="sub">GRANDMA\\'S HOUSE</div></div>'
    + '<div class="title" id="trEnd"><div class="ta">பாட்டி வீடு</div><div class="en">PATTI VEEDU</div><div class="play">PLAY FREE</div><div class="url">games.codelove.in</div><div class="tip">Link bio-la irukku · Comment pannunga</div></div><div class="cap"><span></span></div>';
  document.body.appendChild(tr);
  const blk = tr.querySelector(".blk"), cap = tr.querySelector(".cap"), capText = cap.firstChild, tag = tr.querySelector(".kick"), tTitle = tr.querySelector("#trTitle"), tEnd = tr.querySelector("#trEnd");
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x)), lerp = (a, b, x) => a + (b - a) * x;
  const fade = (t, a, b, f = 0.5) => Math.min(ease((t - a) / f), ease((b - t) / f));

  // the sound log
  const log = []; let now = 0;
  for (const name of D.logged) A[name] = (...args) => { log.push([now, name, JSON.parse(JSON.stringify(args))]); };
  A.music = () => {}; A.update = () => {}; // the soundtrack has its own music and heartbeat clock

  const torch = (on) => { if (!!P.torch !== on) k.K.Game.toggleTorch(); };
  const paatti = (at, diff, yaw) => { k.noEnemy(false); E.reset(1, Object.assign({ speed: 1, vision: 0, ko: 28 }, diff || {}), at); E.wait = 1e9; if (yaw !== undefined) { E.yaw = yaw; E.lookBase = yaw; } };
  const away = () => paatti({ x: 30, z: 10, lv: 0 });
  const reset = () => { G.state = "play"; G.timers.length = 0; G.overlay = null; if (P.hidden) k.unhide(); P.wake = 0; P.crouch = false; const f = document.getElementById("fade"); if (f) { f.style.transition = "none"; f.style.opacity = 0; } A.setHeart(0); };
  // a montage shot: cuts between camera spots (each [from, to, camFn]) with a quick dip to black at every cut
  const cuts = (list) => (t, d) => { const x = t / d; for (const [a, b, fn] of list) if (x < b || b === 1) return fn(Math.max(0, Math.min(1, (x - a) / (b - a)))); return list.at(-1)[2](1); };
  const dipAt = (edges) => (t, d) => { const x = t / d; let m = 0; for (const e of edges) m = Math.max(m, 1 - Math.min(1, Math.abs(x - e) * d / 0.22)); return m; };
  const S = {
    gate: { setup() { reset(); away(); torch(false); }, cam: (t, d) => { const x = ease(t / d); return [12, lerp(27.6, 24.4, x), 0, lerp(0.2, 0.08, x)]; } },
    door: { setup() { reset(); torch(false); paatti({ x: 12, z: 21.25, lv: 0 }, null, 0); }, cam: (t, d) => { const x = ease(t / d); return [lerp(12.9, 12.4, x), lerp(24.9, 23.2, x), lerp(0.2, 0.12, x), lerp(0.12, 0.1, x)]; } },
    // outside: the moon over the back yard, then the roof terrace with the tree line behind its parapet
    sky: {
      setup() { reset(); away(); torch(false); },
      cam: cuts([
        [0, 0.5, (x) => [11, -4, lerp(-0.9, -2.1, ease(x)), lerp(0.12, 1.1, ease(x))]],
        [0.5, 1, (x) => [lerp(11, 12.5, x), 16, lerp(0.7, -0.5, ease(x)), lerp(0.12, 0.2, x), 1]],
      ]),
      dip: dipAt([0.5]),
    },
    locks: { setup() { reset(); away(); torch(true); }, cam: (t, d) => { const x = ease(t / d); return [12, lerp(16.4, 18.6, x), Math.PI, lerp(0.02, 0.05, x)]; } },
    rooms: {
      setup() { reset(); away(); torch(true); },
      cam: cuts([
        [0, 0.26, (x) => [lerp(3, 3.5, x), 3, lerp(0.8, 0.95, x), 0.05]],
        [0.26, 0.52, (x) => [21, lerp(3, 3.6, x), lerp(-1.57, -1.45, x), 0.05]],
        [0.52, 0.76, (x) => [lerp(16.2, 16.5, x), lerp(3.8, 2.7, x), lerp(0.12, 0, x), -0.12]],
        [0.76, 1, (x) => [28.5, lerp(16.4, 17.2, x), lerp(1.57, 1.45, x), 0.1]],
      ]),
      dip: dipAt([0.26, 0.52, 0.76]),
    },
    puzzles: {
      setup() { reset(); away(); torch(false); for (const l of W.lamps) { l.lit = true; l.flames.forEach((f) => (f.visible = true)); } },
      cam: cuts([
        [0, 0.55, (x) => [lerp(12.9, 12.4, x), lerp(14.8, 13.4, x), lerp(0.19, 0.12, x), -0.18]],
        [0.55, 1, (x) => [12, lerp(15, 12.4, ease(x)), 0, 0.05]],
      ]),
      dip: dipAt([0.55]),
    },
    hide: {
      setup() { reset(); torch(false); const s = W.hideSpots.find((h) => h.id === "study-wardrobe"); P.x = s.exit.x; P.z = s.exit.z; k.hide(s); paatti({ x: 16.6, z: 10.2, lv: 0 }, { speed: 1 }, Math.PI / 2); },
      at: [[0.5, () => { E.wait = 0; E.hear(22.3, 11.8, 99, 0); }]],
      cam: null,
    },
    chase: {
      setup() { reset(); torch(true); paatti({ x: 16.8, z: 17.2, lv: 0 }, { speed: 1.1, vision: 1 }, -Math.PI / 2); E.wait = 3; E.catchArmed = true; },
      cam: (t) => [lerp(7.6, 7.2, ease(t / 3)), 17.1, -Math.PI / 2, 0.03],
    },
    black: { setup() { reset(); away(); A.setChase(false); }, cam: () => [12, 24.7, 0, 0.06] },
    end: { setup() { reset(); torch(false); paatti({ x: 12, z: 21.25, lv: 0 }, null, 0); }, cam: (t, d) => [lerp(12.5, 12.15, ease(t / d)), lerp(24.9, 23.5, ease(t / d)), 0.07, 0.1] },
  };
  let cur = -1, done = new Set();
  window.__trailer = {
    log: () => log,
    frame(n) {
      now = n / D.fps;
      let i = D.starts.length - 1; while (i > 0 && D.starts[i] > now) i--;
      const shot = D.shots[i], def = S[shot.id], t = now - D.starts[i];
      if (i !== cur) { cur = i; def.setup(); done = new Set(); }
      for (const [j, [at, fn]] of (def.at || []).entries()) if (t >= at && !done.has(j)) { done.add(j); fn(); }
      if (def.cam && G.state === "play") { const [x, z, yaw, pitch, lv = 0] = def.cam(t, shot.dur); k.teleport(x, z, yaw, lv); P.pitch = pitch; }
      // overlays: the title with the gate shot's second line, black for the cut after the scream, the end card, captions
      tag.style.opacity = shot.id === "gate" ? fade(t, 0.5, D.titleAt - 0.2, 0.4) : 0;
      tTitle.style.opacity = shot.id === "gate" ? fade(t, D.titleAt + 0.5, shot.dur - 0.1, 0.6) : 0;
      const card = shot.id === "end" ? ease((now - D.cardAt + 0.3) / 0.8) : 0;
      tEnd.style.opacity = card;
      let b = 0;
      if (now < 0.5) b = 1 - now / 0.5;
      if (shot.id === "chase" && G.state === "caught") b = ease((t - (def.caughtAt ??= t) - 1.3) / 0.15);
      if (shot.id === "black") b = 1;
      if (def.dip) b = Math.max(b, def.dip(t, shot.dur));
      if (shot.id === "end") b = 0.6 * card + (now > D.total - 0.7 ? (now - (D.total - 0.7)) / 0.7 * 0.4 : 0);
      if (t > shot.dur - 0.22 && ["gate", "door", "sky", "locks", "rooms", "puzzles"].includes(shot.id)) b = Math.max(b, (t - (shot.dur - 0.22)) / 0.22 * 0.85);
      if (t < 0.18 && ["door", "sky", "locks", "rooms", "puzzles", "end"].includes(shot.id)) b = Math.max(b, (1 - t / 0.18) * 0.85);
      blk.style.opacity = Math.min(1, b);
      const line = D.subs.findLast((v) => now >= v.t - 0.05 && now < v.end);
      capText.textContent = line ? line.text : "";
      cap.style.opacity = line ? fade(now, line.t - 0.05, line.end, 0.14) : 0;
      window.__vt.step(1000 / D.fps);
    },
  };
  return D.shots.length;
})()`;

/** Replays the sound log on the game's OfflineAudioContext with its music box and rain, and returns a WAV (base64). */
const SOUNDTRACK = (seconds, cues) => `(async () => {
  const { ctx, rate, resume, musTick } = window.__off, A = window.__kolusu.K.Audio;
  const fx = window.__trailer.log().concat(${JSON.stringify(cues)});
  const q = 128 / rate, groups = new Map();
  const put = (time, item) => { const at = Math.max(q, Math.round(time / q) * q); if (!groups.has(at)) groups.set(at, []); groups.get(at).push(item); };
  for (const e of fx) put(e[0], e);
  for (let t = 0.05; t < ${seconds}; t += 0.1) put(t, [t, "_tick", []]);
  const orig = window.__trailerOrig;
  for (const [at, list] of [...groups].sort((a, b) => a[0] - b[0])) {
    ctx.suspend(at).then(() => {
      for (const [, name, args] of list) {
        try {
          if (name === "_tick") { musTick && musTick(); orig.update(); }
          else if (name === "_music") orig.music(...args);
          else orig[name](...args);
        } catch (e) {}
      }
      resume();
    });
  }
  for (const name in orig) A[name] = orig[name]; // the music box's own anklet bells must sound, not be logged
  const buf = await ctx.startRendering();
  const n = Math.floor(${seconds} * rate), out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  const bytes = new Uint8Array(out.buffer); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
})()`;

// --- Chrome ----------------------------------------------------------------------------------------
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); if (d.error) p.rej(new Error(d.error.message)); else p.res(d.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

if (spawnSync(FFMPEG, ["-version"]).status !== 0) { console.error(`ffmpeg not found (${FFMPEG}) — set FFMPEG=path/to/ffmpeg`); process.exit(1); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), "patti-promo-"));
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir);
let chrome = null;
try {
  // 1. Voice-over, then the timing: every shot lasts as long as its lines (the whole voice a little faster when the video would pass a minute).
  let clips;
  if (PREVIEW) clips = says.map((say) => ({ say, seconds: say.length * 0.062 }));
  else {
    console.log(`Voice-over: ${says.length} lines, Gemini TTS "${VOICE.name}"…`);
    clips = await speak(work);
    if (process.env.VOICE_ONLY) { for (const c of clips) console.log(`  ${c.seconds.toFixed(2)} s  ${c.say}`); process.exit(0); }
  }
  const layout = (tempo) => {
    let n = 0, t = 0;
    const lines = [];
    const timed = shots.map((s) => {
      let at = s.lead ?? 0.2;
      for (const [, sub] of s.vo ?? []) {
        const len = clips[n].seconds / tempo;
        lines.push({ ...clips[n++], shot: s.id, t: t + at, len, sub });
        at += len + GAP;
      }
      const dur = Math.max(s.min ?? 0, s.vo ? at - GAP + (s.tail ?? 0.25) : 0);
      const start = t;
      t += dur;
      return { id: s.id, dur, start };
    });
    return { timed, lines, total: t };
  };
  let tempo = 1;
  for (let i = 0; i < 8 && layout(tempo).total > LIMIT && tempo < 1.2; i++) tempo = Math.min(1.2, tempo * (layout(tempo).total / LIMIT) ** 1.3);
  const { timed, lines, total } = layout(tempo);
  if (total > 60) console.warn(`!! ${total.toFixed(1)} s — over a minute even at ×${tempo.toFixed(2)}: shorten the lines`);
  const frames = Math.round(total * FPS);
  for (const l of lines) console.log(`  ${l.t.toFixed(2).padStart(5)} s  ${l.len.toFixed(2)} s  ${l.shot.padEnd(6)} ${l.say}`);
  if (tempo > 1) console.log(`  voice ×${tempo.toFixed(2)}`);
  // Captions: a line's sentences one at a time, each for its share of the line.
  const subs = lines.flatMap((l) => {
    // sentences end at . ? ! … followed by a space (so "games.codelove.in" stays in one piece)
    const parts = l.sub.match(/.+?(?:[.?!…]+(?=\s|$)|$)\s*/g)?.map((p) => p.trim()).filter(Boolean) ?? [];
    const all = parts.reduce((n, p) => n + p.length, 0);
    let t = l.t;
    return parts.map((text, i) => {
      const len = (l.len * text.length) / all, from = t;
      t += len;
      return { t: from, end: i === parts.length - 1 ? from + len + 0.25 : from + len, text };
    });
  });
  const titleAt = lines[1].t - timed[0].start;
  const cardAt = lines.at(-1).t;

  // 2. Picture.
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(work, "profile")}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null); }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_HOOK(total + 1) });
  await page.send("Page.navigate", { url: GAME });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!(window.__kolusu && __kolusu.G.state === "menu")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load");
    await sleep(500);
  }
  // Start a run without the opening walk (as the game's own tests do), let the samples and voices decode.
  await page.evaluate(`(() => { const k = __kolusu; k.noEnemy(true); k.start(); k.G.state = "play"; k.G.timers.length = 0; document.getElementById("card").hidden = true; k.K.LampFX && k.K.LampFX.stop(); const f = document.getElementById("fade"); f.style.transition = "none"; f.style.opacity = 0; k.P.wake = 0;
    const A = k.K.Audio; window.__trailerOrig = {}; for (const n of ${JSON.stringify(LOGGED)}.concat(["music", "update", "ambient"])) window.__trailerOrig[n] = A[n]; })()`);
  await page.evaluate(`Promise.all(['900 40px Catamaran', '40px Creepster', '30px "Special Elite"', '600 30px "Hind Madurai"'].map((f) => document.fonts.load(f, "பாட்டி வீடு PATTI")))`);
  await sleep(4000);
  await page.evaluate("__vt.start()");
  await page.evaluate(DIRECTOR({ shots: timed, starts: timed.map((s) => s.start), fps: FPS, total, fov: FOV, logged: LOGGED, subs, titleAt, cardAt }));
  const step = PREVIEW ? FPS / 2 : 1;
  console.log(`Recording ${shots.length} shots, ${frames} frames (${total.toFixed(1)} s at ${FPS} fps, ${W * DPR}×${H * DPR})…`);
  const t0 = Date.now();
  for (let n = 0; n < frames; n++) {
    await page.evaluate(`__trailer.frame(${n})`);
    if (n % step) continue;
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: PREVIEW ? 80 : 94, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(PREVIEW ? n / step : n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (n % 300 === 0) console.log(`  ${n}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  if (PREVIEW) {
    const files = fs.readdirSync(framesDir).sort(), cols = 12, tw = 180, th = 320;
    const sheet = sharp({ create: { width: cols * tw, height: Math.ceil(files.length / cols) * th, channels: 3, background: "#000" } });
    const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(path.join(framesDir, f)).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th })));
    const out = path.join(process.env.STILLS ?? os.tmpdir(), "patti-promo-preview.jpg");
    await sheet.composite(comp).jpeg({ quality: 82 }).toFile(out);
    console.log("preview sheet:", out);
  } else {
    // 3. Soundtrack: the logged game sounds on the game's own synth, with its music box (menu theme, the ending phrase at the end card).
    console.log("Soundtrack…");
    const cues = [[0, "_music", ["menu"]], [0, "ambient", [true]], [cardAt - 0.3, "_music", ["end"]]];
    const gameWav = path.join(work, "game.wav");
    fs.writeFileSync(gameWav, Buffer.from(await page.evaluate(SOUNDTRACK(total + 0.5, cues)), "base64"));
    page.close();

    // 4. Mix: voice on top, the game's sound ducking under it; -14 LUFS.
    console.log("Mixing…");
    const mixWav = path.join(work, "mix.wav");
    const graph = [
      ...lines.map((v, i) => `[${i + 1}:a]${tempo > 1 ? `atempo=${tempo.toFixed(3)},` : ""}adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`),
      `${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,highpass=f=80,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.5,aformat=channel_layouts=stereo,apad[voice]`,
      `[voice]asplit=2[voice1][voice2]`,
      `[0:a]volume=2.0[game]`,
      `[game][voice1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=400[ducked]`,
      `[ducked][voice2]amix=inputs=2:normalize=0:duration=first,afade=t=in:d=0.3,afade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`,
    ].join(";");
    ffmpeg(["-i", gameWav, ...lines.flatMap((v) => ["-i", v.file]), "-filter_complex", graph, "-map", "[mix]", "-t", total.toFixed(3), mixWav]);

    // 5. Video: 1080×1920.
    console.log("Encoding…");
    const out = path.join(OUT, "promo-ta.mp4");
    ffmpeg(["-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-i", mixWav, "-map", "0:v", "-map", "1:a", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", out]);
    console.log(`${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB, ${total.toFixed(1)} s`);
  }
} finally {
  chrome?.kill();
  await sleep(600);
  if (!process.env.KEEP) fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  else console.log("frames kept in", work);
}
