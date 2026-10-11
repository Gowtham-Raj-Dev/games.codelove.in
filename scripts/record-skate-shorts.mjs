#!/usr/bin/env node
/**
 * Records a vertical (9:16) Skate Rush trailer for YouTube Shorts, Reels and the like, from the game itself:
 *   public/games/skate-rush/shorts-trailer.mp4   1080×1920, 60 fps, under 30 seconds
 *
 *   npm run dev                                   (in another terminal)
 *   node scripts/record-skate-shorts.mjs
 *
 * The same method as the landscape trailer (scripts/record-skate-trailer.mjs in the model library's
 * project): the game runs in headless Chrome on a virtual clock — every frame is stepped by exactly
 * 1/60 s and captured — while the autopilot plays (window.__skateRush on the dev server) and captions
 * are drawn over it in the game's own font. The game's music and sound effects are rendered offline by
 * its own synthesizer, with an announcer voice-over made with Kokoro; the mix is normalised to -14 LUFS.
 * The captions keep clear of the bottom of the frame, where Shorts puts its own title and buttons.
 *
 * Env: BASE (default http://localhost:3000), CHROME, FFMPEG and KOKORO (default: the tools in the model
 * library's project, ../Models.Codelove.in/promo/tools), VOICE (Kokoro voice, default af_bella).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "games", "skate-rush");
const BASE = process.env.BASE ?? "http://localhost:3000";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TOOLS = path.resolve(import.meta.dirname, "..", "..", "Models.Codelove.in", "promo", "tools");
const FFMPEG = process.env.FFMPEG ?? path.join(TOOLS, "ff", "node_modules", "ffmpeg-static", "ffmpeg.exe");
const TAIL = false;
const KOKORO = process.env.KOKORO ?? path.join(TOOLS, "kokoro", "node_modules", "kokoro-js", "dist", "kokoro.js");
const VOICE = process.env.VOICE ?? "af_bella";
const PORT = 9366;
/** Layout size (a phone held upright; the captions are designed for it) and the pixel ratio that makes the capture 1080×1920. */
const W = 540;
const H = 960;
const DPR = 2;
const FPS = 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Shop data (names and prices for the captions) --------------------------------------------------

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
const byId = (list, id) => list.find((i) => i.id === id);
const price = (item) => (item.price ? `${item.price.toLocaleString("en-US")} coins` : "Free");

// --- Storyboard ------------------------------------------------------------------------------------

/**
 * Each shot: seconds, what the game shows (`game`, run in the page at the shot's first frame), the
 * captions (`head` section badge, `tag` item name + price + perk, `title` / `end` cards), the
 * announcer's lines (`vo`: [seconds into the shot, text]) and trailer sounds (`fx`).
 */
const shots = [];
const add = (shot) => shots.push(shot);

add({ dur: 2.6, game: { run: "city", skater: "skate-boy", board: "classic", warp: 9 }, title: true, vo: [[0.3, "Grab your board... it's Skate Rush!"]], fx: [[0.25, "impact"]] });
const stageLoadout = { docks: ["officer", "street"], snow: ["dj-mia", "ocean"], neon: ["agent", "neon"], haunted: ["vampire", "galaxy"], pirate: ["elf", "tiger"], moon: ["knight", "hover"] };
["docks", "snow", "neon", "haunted", "pirate", "moon"].forEach((id, i) => {
  const st = byId(STAGES, id);
  const [skater, board] = stageLoadout[id];
  add({
    dur: i === 0 ? 2.3 : id === "moon" ? 1.6 : 1.3,
    game: { run: id, skater, board, warp: 7 },
    head: ["7 Stages", "unlock new worlds"],
    tag: [st.name, price(st), null],
    vo: i === 0 ? [[0.1, "Seven stages to unlock!"]] : id === "moon" ? [[0.1, "Even the Moon!"]] : [],
    fx: [[-0.08, "whoosh"]],
  });
});
["skate-girl", "pixel", "officer", "knight", "vampire", "skeleton"].forEach((id, i) => {
  const sk = byId(SKATERS, id);
  add({ dur: 0.7, game: { show: "skater", stage: "pirate", skater: id, skin: "classic", board: "classic", first: i === 0 }, head: ["18 Skaters", null], tag: [sk.name, price(sk), null], vo: i === 0 ? [[0.1, "Eighteen skaters!"]] : [], fx: [i === 0 ? [-0.08, "whoosh"] : [0.02, "pop"]] });
});
["shadow", "lava", "gold", "galaxy", "rainbow"].forEach((id, i) => {
  const s = byId(SKINS, id);
  add({
    dur: 0.75,
    game: { show: "skater", stage: "snow", skater: "skate-boy", skin: id, board: "classic", first: i === 0 },
    head: ["10 Skins", null],
    tag: [s.name, price(s), null],
    vo: i === 0 ? [[0.1, "Ten epic skins!"]] : [],
    fx: [i === 0 ? [-0.08, "whoosh"] : [0.02, "sparkle"]],
  });
});
["neon", "rainbow", "hover"].forEach((id, i) => {
  const b = byId(BOARDS, id);
  add({
    dur: 0.95,
    game: { run: i === 0 ? "neon" : null, skater: "skate-girl", board: id, warp: 6, jump: 0.1 },
    head: ["13 Boards", "with glowing trails"],
    tag: [b.name, price(b), null],
    vo: i === 0 ? [[0.1, "And glowing boards!"]] : [],
    fx: [i === 0 ? [-0.08, "whoosh"] : [0.02, "pop"]],
  });
});
add({ dur: 4.3, game: { run: "moon", skater: "skate-boy", skin: "gold", board: "rainbow", warp: 8 }, end: true, vo: [[0.35, "Skate Rush. Play now... it's free!"]], fx: [[-0.08, "whoosh"], [0.15, "jingle"]] });

const starts = [];
shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
const total = shots.reduce((n, s) => n + s.dur, 0);
const frames = Math.round(total * FPS);
/** Every announcer line and trailer sound, at its time in the video. */
const voiceLines = shots.flatMap((s, i) => (s.vo ?? []).map(([at, text]) => ({ t: starts[i] + at, text })));
const trailerFx = shots.flatMap((s, i) => (s.fx ?? []).map(([at, name]) => [Math.max(0, starts[i] + at), name]));

// --- Voice-over ------------------------------------------------------------------------------------

/** Speaks every line with Kokoro in a child process (it needs ~350 MB; Chrome starts after it exits). */
function speak(dir) {
  const kokoro = fs.existsSync(KOKORO) ? pathToFileURL(path.resolve(KOKORO)).href : KOKORO;
  const script = `
    const { KokoroTTS } = await import(${JSON.stringify(kokoro)});
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
    const lines = ${JSON.stringify(voiceLines.map((l) => l.text))};
    for (let i = 0; i < lines.length; i++) {
      const audio = await tts.generate(lines[i], { voice: ${JSON.stringify(VOICE)}, speed: 1.08 });
      audio.save(${JSON.stringify(dir.split(path.sep).join("/"))} + "/vo-" + i + ".wav");
    }`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) throw new Error(`voice-over failed (is kokoro-js installed? set KOKORO):\n${r.stderr.split("\n").filter((l) => !/Warning/.test(l)).slice(-6).join("\n")}`);
}

/** Trims a clip's silent ends; returns the trimmed file and its length in seconds. */
function trimVoice(file) {
  const out = file.replace(/\.wav$/, "-trim.wav");
  ffmpeg(["-i", file, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  return { file: out, seconds: (fs.statSync(out).size - 44) / (44100 * 2) };
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

/** The caption layer, the sound-effect log and the per-frame driver (shots come in as JSON). */
const DIRECTOR = (data) => `(() => {
  const { shots, fps, frames } = ${JSON.stringify(data)};
  const sr = window.__skateRush, g = sr.game;
  const root = document.querySelector(".g-root");
  const css = document.createElement("style");
  css.textContent = \`
    .g-root > :not(canvas):not(#trailer), nextjs-portal { visibility: hidden !important; }
    #trailer { position: absolute; inset: 0; z-index: 100; pointer-events: none; font-family: var(--game-display), sans-serif; color: #fff; text-transform: uppercase; }
    #trailer .shade { position: absolute; inset: 0; }
    #trailer .title { position: absolute; left: 0; right: 0; top: 23%; text-align: center; }
    #trailer .title b { display: block; font-size: 104px; line-height: .92; font-weight: 400; text-shadow: 5px 5px 0 #111, 9px 9px 0 #f59e0b88; }
    #trailer .title b i { font-style: normal; color: #facc15; }
    #trailer .title span { display: inline-block; margin-top: 16px; padding: 0 30px; font-size: 22px; line-height: 1.25; letter-spacing: .04em; text-shadow: 3px 3px 0 #111; }
    #trailer .head { position: absolute; left: 26px; top: 120px; }
    #trailer .head b { display: inline-block; background: #facc15; color: #111; font-size: 40px; font-weight: 400; padding: 6px 18px 2px; border: 4px solid #111; border-radius: 12px; transform: skewX(-6deg); box-shadow: 5px 5px 0 #111; }
    #trailer .head span { display: block; margin-top: 12px; font-size: 19px; text-shadow: 2px 2px 0 #111; letter-spacing: .03em; }
    #trailer .tag { position: absolute; left: 26px; right: 26px; bottom: 236px; }
    #trailer .tag b { display: block; font-size: 46px; font-weight: 400; line-height: 1; text-shadow: 4px 4px 0 #111; }
    #trailer .tag span { display: inline-flex; align-items: center; gap: 10px; margin-top: 12px; padding: 7px 16px 5px 10px; background: #111111d9; border: 3px solid #ffffff55; border-radius: 12px; font-size: 22px; }
    #trailer .tag span em { font-style: normal; color: #facc15; margin-left: 6px; }
    #trailer .coin { width: 26px; height: 26px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fef08a, #f59e0b 55%, #c2410c); box-shadow: 0 0 0 3px #b45309aa; }
    #trailer .flash { position: absolute; inset: 0; background: #fff; }
    #trailer .end { position: absolute; inset: 0 0 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    #trailer .end b { font-size: 108px; font-weight: 400; line-height: .92; text-shadow: 5px 5px 0 #111, 9px 9px 0 #f59e0b88; }
    #trailer .end b i { font-style: normal; color: #facc15; }
    #trailer .play { margin-top: 34px; display: inline-flex; align-items: center; gap: 14px; background: #facc15; color: #111; font-size: 44px; padding: 16px 34px 10px; border: 5px solid #111; border-radius: 18px; box-shadow: 6px 6px 0 #111; }
    #trailer .play svg { width: 34px; height: 34px; transform: translateY(-3px); }
    #trailer .url { margin-top: 30px; font-size: 25px; letter-spacing: .03em; text-shadow: 3px 3px 0 #111; text-transform: none; }
    #trailer .small { margin-top: 10px; font-size: 17px; opacity: .9; text-shadow: 2px 2px 0 #111; }
  \`;
  document.head.append(css);
  const layer = document.createElement("div");
  layer.id = "trailer";
  root.append(layer);

  const starts = [];
  shots.reduce((t, s) => (starts.push(t), t + s.dur), 0);
  const total = shots.reduce((n, s) => n + s.dur, 0);
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  let current = -1;
  let jumpAt = -1;

  // The game's sound effects are logged (time, name) instead of played, and the rolling-wheels level per frame.
  const fxLog = [];
  const roll = new Array(frames).fill(0);
  let logging = false, tNow = 0, frameNow = 0;
  const originals = {};
  for (const name of ["coin", "jump", "land", "duck", "lane", "bump", "power", "shieldBreak", "crash", "go"]) {
    originals[name] = g.sfx[name].bind(g.sfx);
    g.sfx[name] = () => { if (logging) fxLog.push([tNow, name]); };
  }
  g.sfx.rolling = (level) => { if (logging) roll[frameNow] = level; };

  const setup = (s) => {
    const q = s.game;
    // Setting a shot up (starting runs, skipping ahead) makes no sound.
    logging = false;
    if (q.run) {
      g.toMenu();
      g.setShowcase("menu");
      g.setStage(q.run);
    }
    if (q.show && q.first) {
      g.toMenu();
      g.setStage(q.stage);
      g.setShowcase(q.show, { x: 0, y: 0 }, q.show === "skater" ? 0.72 : 0.8);
      // Start at the close-up instead of zooming in from the title screen.
      g.preset.ready = false;
      g.camPos.set(0, 0, 0);
    }
    if (q.skater && g.currentLoadout.skater !== q.skater) g.setSkater(q.skater);
    g.setSkin(q.skin ?? "classic");
    if (q.board) g.setBoard(q.board);
    if (q.run) {
      g.autopilot = true;
      g.invincible = true;
      g.start();
      g.camBlend = 1;
      g.warp(q.warp ?? 6);
      g.camPos.set(0, 0, 0);
    }
    jumpAt = q.jump != null ? q.jump : -1;
    logging = true;
  };

  const caption = (s, t, i) => {
    const local = t - starts[i];
    let html = "";
    if (s.title) {
      const k = ease(local / 0.35), out = ease((local - (s.dur - 0.35)) / 0.35);
      html += '<div class="shade" style="background:radial-gradient(ellipse at center, #0006, #0000 70%)"></div>';
      html += '<div class="title" style="opacity:' + (k * (1 - out)) + ';transform:scale(' + (0.85 + 0.15 * k) + ') translateY(' + (-40 * out) + 'px)"><b>Skate<br><i>Rush</i></b><span>The endless 3D skateboard runner</span></div>';
    }
    if (s.head) {
      // The badge stays up for the whole section; it slides in with the section's first shot.
      let first = i;
      while (first > 0 && shots[first - 1].head && shots[first - 1].head[0] === s.head[0]) first--;
      const k = ease((t - starts[first]) / 0.3);
      html += '<div class="head" style="transform:translateX(' + (-60 * (1 - k)) + 'px);opacity:' + k + '"><b>' + s.head[0] + '</b>' + (s.head[1] ? '<span>' + s.head[1] + '</span>' : "") + '</div>';
    }
    if (s.tag) {
      const k = ease(local / 0.22);
      const [name, cost, perk] = s.tag;
      html += '<div class="tag" style="transform:translateY(' + (24 * (1 - k)) + 'px);opacity:' + k + '"><b>' + name + '</b><span><i class="coin"></i>' + cost + (perk ? '<em>· ' + perk + '</em>' : "") + '</span></div>';
    }
    if (s.end) {
      const k = ease(local / 0.5);
      const pulse = 1 + Math.sin(Math.max(0, local - 0.6) * 5) * 0.035;
      html += '<div class="shade" style="background:#0a0a18;opacity:' + (0.62 * k) + '"></div>';
      html += '<div class="end" style="opacity:' + k + ';transform:scale(' + (0.9 + 0.1 * k) + ')"><b>Skate<br><i>Rush</i></b>' +
        '<div class="play" style="transform:skewX(-6deg) scale(' + pulse + ')"><svg viewBox="0 0 24 24" fill="#111"><path d="M7 4.5v15l12.5-7.5z"/></svg>Play now</div>' +
        '<div class="url">games.codelove.in/skate-rush</div><div class="small">Free · no download · phone &amp; PC</div></div>';
    }
    // A quick white flash on every cut (not inside a shop section, where items swap in place).
    const cutFlash = i > 0 && !(s.game.show && !s.game.first) && !(s.game.board && !s.game.run && !s.game.show);
    if (cutFlash && local < 0.16) html += '<div class="flash" style="opacity:' + (0.55 * (1 - local / 0.16)) + '"></div>';
    // Fade in from black at the start, and out at the very end.
    if (t < 0.3) html += '<div class="shade" style="background:#000;opacity:' + (1 - t / 0.3) + '"></div>';
    if (t > total - 0.35) html += '<div class="shade" style="background:#000;opacity:' + ((t - (total - 0.35)) / 0.35) + '"></div>';
    layer.innerHTML = html;
  };

  window.__trailer = {
    frame(n) {
      const t = n / fps;
      tNow = t;
      frameNow = n;
      let i = 0;
      while (i + 1 < shots.length && t >= starts[i + 1]) i++;
      if (i !== current) {
        current = i;
        setup(shots[i]);
      }
      const local = t - starts[i];
      if (jumpAt >= 0 && local >= jumpAt) {
        g.input("jump");
        jumpAt = -1;
      }
      window.__vt.step(1000 / fps);
      caption(shots[i], t, i);
      return true;
    },
    fx: () => fxLog,
    roll: () => roll,
    originals,
  };
  return shots.length;
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
  music.play(window.__skateRush.song, 2, { restart: true });
  window.setInterval = realSetInterval;
  for (let k = 1; k * 0.05 < ${seconds}; k++) ctx.suspend(k * 0.05).then(() => { tick && tick(); resume(); });
  tick && tick();
  const buf = await ctx.startRendering();
  ${TO_WAV(seconds)}
})()`;

/**
 * Sound effects: every effect the run logged, played at its time by the game's own Sfx, the rolling
 * wheels as a filtered-noise bed following the logged level, and the trailer's whooshes and chimes.
 */
const EFFECTS = (seconds, extra) => `(async () => {
  ${OFFLINE_HUB(seconds)}
  window.setInterval = realSetInterval;
  const t = window.__trailer, fps = ${FPS};
  const fx = t.fx().concat(${JSON.stringify(extra)});
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
  const trailer = {
    whoosh: () => audio.noise(0.42, { volume: 0.32, freq: 350, type: "bandpass", slide: 3200, q: 1.1 }),
    impact: () => { audio.tone(70, 0.9, { type: "sine", volume: 0.55, slide: -35 }); audio.noise(0.6, { volume: 0.35, freq: 1400, slide: -1200 }); },
    pop: () => { audio.tone(1175, 0.08, { type: "square", volume: 0.05 }); audio.tone(1760, 0.14, { type: "square", volume: 0.045, delay: 0.05 }); },
    sparkle: () => { audio.tone(1568, 0.12, { type: "triangle", volume: 0.09 }); audio.tone(2093, 0.18, { type: "triangle", volume: 0.07, delay: 0.06 }); },
    jingle: () => audio.jingle([72, 76, 79, 84, 88], { volume: 0.17, step: 0.08 }),
  };
  // Effects grouped by render quantum; rendering pauses at each group to start them right on time.
  const q = 128 / rate;
  const groups = new Map();
  for (const [time, name] of fx) {
    const at = Math.max(q, Math.round(time / q) * q);
    if (!groups.has(at)) groups.set(at, []);
    groups.get(at).push(name);
  }
  const realNow = performance.now;
  for (const [at, names] of groups) {
    ctx.suspend(at).then(() => {
      // Coins pitch up when collected in quick succession: give the Sfx the effect's own time.
      performance.now = () => at * 1000;
      for (const name of names) (trailer[name] ?? t.originals[name])?.();
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

if (spawnSync(FFMPEG, ["-version"]).status !== 0) {
  console.error(`ffmpeg not found (${FFMPEG}) — install it or set FFMPEG=path/to/ffmpeg`);
  process.exit(1);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "skate-trailer-"));
const profile = path.join(work, "profile");
const framesDir = path.join(work, "frames");
fs.mkdirSync(framesDir);
let chrome = null;
try {
  // 1. Voice-over: each line, trimmed, and fitted into the time before the next line (or the end).
  if (!TAIL) console.log(`Voice-over: ${voiceLines.length} lines, Kokoro voice "${VOICE}"…`);
  if (!TAIL) speak(work);
  const voice = (TAIL ? [] : voiceLines).map((line, i) => {
    const { file, seconds } = trimVoice(path.join(work, `vo-${i}.wav`));
    const room = (voiceLines[i + 1]?.t ?? total) - line.t - 0.05;
    // Too long for its slot: speed it up a little (never more than 25%).
    const tempo = seconds > room ? Math.min(1.25, seconds / room) : 1;
    console.log(`  ${line.t.toFixed(2)} s  "${line.text}"  ${seconds.toFixed(2)} s${tempo > 1 ? ` → ×${tempo.toFixed(2)}` : ""}`);
    if (seconds / tempo > room + 0.01) console.warn(`    runs ${(seconds / tempo - room).toFixed(2)} s into the next line`);
    return { ...line, file, tempo };
  });

  // 2. Picture.
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

  if (!TAIL) console.log("Music…");
  const musicWav = path.join(work, "music.wav");
  if (!TAIL) fs.writeFileSync(musicWav, Buffer.from(await page.evaluate(MUSIC(total + 0.5)), "base64"));

  console.log("Loading every stage and skater…");
  await page.evaluate(`(async () => {
    const g = __skateRush.game;
    for (const id of ${JSON.stringify(STAGES.map((s) => s.id))}) await g.setStage(id);
    for (const id of ${JSON.stringify(SKATERS.map((s) => s.id))}) await g.setSkater(id);
    // Compile every skin's shader once, so no frame waits for it.
    for (const id of ${JSON.stringify(SKINS.map((s) => s.id))}) g.setSkin(id);
    g.setSkin("classic");
    await g.setStage("city");
    await g.setSkater("skate-boy");
  })()`);
  await sleep(1500);
  await page.evaluate("__vt.start()");
  const count = await page.evaluate(DIRECTOR({ shots, fps: FPS, frames }));
  console.log(`Recording ${count} shots, ${frames} frames (${total.toFixed(1)} s at ${FPS} fps, ${W * DPR}×${H * DPR})…`);
  const t0 = Date.now();
  const from = 0;
  for (let n = from; n < frames; n++) {
    await page.evaluate(`__trailer.frame(${n})`);
    const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 95, fromSurface: true });
    fs.writeFileSync(path.join(framesDir, `${String(n).padStart(5, "0")}.jpg`), Buffer.from(data, "base64"));
    if (n % 300 === 0) console.log(`  ${n}/${frames} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }

  {
    console.log("Sound effects…");
    const fxWav = path.join(work, "fx.wav");
    fs.writeFileSync(fxWav, Buffer.from(await page.evaluate(EFFECTS(total + 0.5, trailerFx)), "base64"));
    page.close();

    // 3. Mix: the voice on top (cleaned up and compressed), the music ducking under it, the effects; -14 LUFS.
    console.log("Mixing…");
    const mixWav = path.join(work, "mix.wav");
    const graph = [
      ...voice.map((v, i) => `[${i + 2}:a]${v.tempo > 1 ? `atempo=${v.tempo.toFixed(3)},` : ""}adelay=${Math.round(v.t * 1000)}:all=1[v${i}]`),
      `${voice.map((_, i) => `[v${i}]`).join("")}amix=inputs=${voice.length}:normalize=0,highpass=f=90,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,volume=1.5,aformat=channel_layouts=stereo,apad[voice]`,
      `[voice]asplit=2[voice1][voice2]`,
      `[0:a]volume=0.9[music]`,
      `[music][voice1]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]`,
      `[1:a]volume=1.1[fx]`,
      `[ducked][fx][voice2]amix=inputs=3:normalize=0:duration=first,afade=t=in:d=0.25,afade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[mix]`,
    ].join(";");
    ffmpeg(["-i", musicWav, "-i", fxWav, ...voice.flatMap((v) => ["-i", v.file]), "-filter_complex", graph, "-map", "[mix]", "-t", total.toFixed(3), mixWav]);

    // 4. Video: 1080×1920, 60 fps.
    console.log("Encoding…");
    const out = path.join(OUT, "shorts-trailer.mp4");
    ffmpeg(["-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"), "-i", mixWav, "-map", "0:v", "-map", "1:a", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-shortest", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "192k", out]);
    console.log(`${path.relative(ROOT, out)}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB, ${total.toFixed(1)} s`);
  }
} finally {
  chrome?.kill();
  await sleep(500);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
