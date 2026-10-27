#!/usr/bin/env node
/**
 * Records a full Saucer Siege playthrough — all three maps, start to victory — as a 16:9 YouTube video, at the
 * game's 2× speed, with the game's own music (kept soft) and sound effects:
 *   OUT/video/saucer-siege-full-gameplay.mp4    1920×1080, 30 fps
 *   OUT/video/saucer-siege-full-gameplay.json   when each map, wave and victory happens (for build-saucer-shorts.mjs)
 *
 *   npx next dev -p 3005                          (in another terminal; 3000 is often another project's)
 *   node scripts/record-saucer-gameplay.mjs
 *   SIM=1 …   plays the run without filming it (nothing is drawn) and prints how each map went — to check the bot
 *
 * The same method as the Patti Veedu gameplay (scripts/record-patti-gameplay.mjs): the game runs in headless Chrome
 * on a virtual clock, one screenshot per frame, frames straight into ffmpeg. A scripted player plays the real game
 * through its own HUD: a visible cursor picks the map, sets 2× speed, taps tiles and the build bar's buttons,
 * upgrades towers and calls waves early when the road is clear. Where to build and what to upgrade is decided as it
 * goes: the most damage along the road for the gold (window.__saucerSiege on the dev server).
 *
 * Math.random is seeded (SEED, default 11) when the first map starts, so SIM and the real run play the same game.
 * Every sound the game makes is logged and replayed afterwards on its own synth on an OfflineAudioContext — the
 * music and the effects separately, so the music can sit under the action (MUSIC, default 0.55).
 *
 * Env: BASE (default http://localhost:3005), CHROME, FFMPEG (default: the copy in %LOCALAPPDATA%/kolusu-promo-tools),
 * OUT (default ../z-video-files/games.codelove.in/saucer-siege), SEED, FPS (default 30), MAPS (default 0,1,2),
 * MUSIC (music level in the mix), CAP (longest run in seconds of video, default 1500), STOP (a test: stop after
 * this many seconds of video).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = process.env.BASE ?? "http://localhost:3005";
const TOOLS = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "kolusu-promo-tools");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? path.join(TOOLS, "node_modules", "ffmpeg-static", "ffmpeg.exe");
const OUT = process.env.OUT ?? path.resolve(ROOT, "..", "z-video-files", "games.codelove.in", "saucer-siege");
const VIDEO = path.join(OUT, "video", "saucer-siege-full-gameplay.mp4");
const SIM = !!process.env.SIM;
const PORT = 9371;
/** Layout size and the pixel ratio that makes the capture 1920×1080. */
const W = 1280;
const H = 720;
const DPR = 1.5;
const FPS = Number(process.env.FPS ?? 30);
const SEED = Number(process.env.SEED ?? 11);
const CAP = Number(process.env.CAP ?? 1500);
/** A test: stop after this many seconds of video (and still make the sound and the mp4). */
const STOP = Number(process.env.STOP ?? Infinity);
const MUSIC = Number(process.env.MUSIC ?? 0.55);
const PLAY_MAPS = (process.env.MAPS ?? "0,1,2").split(",").map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The game's rules (towers, maps), bundled from the source so the bot reads the same numbers as the game. */
async function rules() {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "src/components/games/saucer-siege/rules.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const tmp = path.join(os.tmpdir(), `saucer-rules-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const { TOWERS, MAPS } = await rules();

// --- Page side: set up before the game loads -------------------------------------------------------

/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = { start() { on = true; now = realNow(); }, step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); } };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

/** Every sound call and music change is logged with the video time it happened at; nothing plays while filming. */
function logger() {
  const { game: g, audio, music } = window.__saucerSiege;
  const R = (window.__rec = { vt: 0, sfx: [], music: [[0, 0]], orig: {}, engines: -1 });
  // No AudioContext while filming: the sound is made afterwards, offline.
  audio.unlock = () => {};
  const proto = Object.getPrototypeOf(g.sfx);
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor" || name === "ok" || name === "dispose" || typeof proto[name] !== "function") continue;
    R.orig[name] = proto[name];
    g.sfx[name] = (...args) => {
      if (name === "engines") {
        const lv = Math.round(args[0] * 100) / 100;
        if (lv === R.engines) return;
        R.engines = lv;
      }
      R.sfx.push([R.vt, name, args]);
    };
  }
  R.setIntensity = music.setIntensity.bind(music);
  music.setIntensity = (v) => { R.music.push([R.vt, v]); R.setIntensity(v); };
  const play = music.play.bind(music);
  music.play = (song, intensity, o) => { if (intensity !== undefined) R.music.push([R.vt, intensity]); return play(song, intensity, o); };
  // The bar's hint for first-timers stays off; the resolution stays put (the virtual clock reads as a slow GPU).
  window.__saucerSiege.records.set({ plays: 5, map: 0 });
  g.adaptResolution = () => {};
}

/** The player, the plan and the overlays. Runs in the page; one plan step per frame. */
function director(D) {
  const { game: g } = window.__saucerSiege, R = window.__rec, T = D.towers;
  const dt = 1 / D.fps;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const warns = [], notes = [], events = [];
  const note = (s) => notes.push(`${R.vt.toFixed(1).padStart(7)} s  ${s}`);
  const warn = (s) => { warns.push(`${R.vt.toFixed(1)} s  ${s}`); note("!! " + s); };
  const event = (type, o = {}) => events.push({ t: Math.round(R.vt * 100) / 100, type, ...o });
  if (D.sim) g.renderer.render = () => {};

  // --- overlays: title and end cards, the map chip, the cursor
  const font = getComputedStyle(g.canvas).getPropertyValue("--game-display").trim() || "system-ui";
  const st = document.createElement("style");
  st.textContent = `nextjs-portal{visibility:hidden!important}
  #ss{position:fixed;inset:0;z-index:99999;pointer-events:none;color:#fff;font-family:${font},system-ui,sans-serif}
  #ss .blk{position:absolute;inset:0;background:#000;opacity:0}
  #ss .scrim{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(20,10,48,.8),rgba(8,4,22,.95));opacity:0}
  #ss .card{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0}
  #ss .kick{display:inline-block;padding:8px 20px 7px;border-radius:999px;background:linear-gradient(180deg,#a78bfa,#7c3aed);font-weight:800;font-size:19px;letter-spacing:.2em;box-shadow:0 0 26px rgba(139,92,246,.7)}
  #ss .big{margin-top:18px;font-weight:900;font-size:96px;line-height:1;letter-spacing:.02em;color:#fff;text-shadow:0 0 30px #7c3aed,0 5px 0 #3b1d8f,0 0 60px rgba(0,0,0,.8)}
  #ss .sub{margin-top:18px;font-weight:700;font-size:26px;color:#fde68a;text-shadow:0 2px 8px #000}
  #ss .maps{margin-top:26px;display:flex;gap:14px;justify-content:center}
  #ss .maps span{padding:8px 16px;border-radius:12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-weight:700;font-size:18px}
  #ss .play{display:inline-block;margin-top:30px;padding:16px 38px 14px;border-radius:999px;background:linear-gradient(180deg,#fde047,#f59e0b);color:#3b1d02;font-weight:900;font-size:34px;letter-spacing:.08em;box-shadow:0 7px 0 #92400e,0 0 34px rgba(250,204,21,.55)}
  #ss .url{margin-top:24px;font-weight:800;font-size:36px;color:#fff;text-shadow:0 0 18px #7c3aed}
  #ss .tip{margin-top:12px;font-weight:600;font-size:21px;color:#e9d5ff}
  #ss .chip{position:absolute;left:50%;top:14px;transform:translateX(-50%);padding:7px 16px 6px;border-radius:12px;background:rgba(18,10,40,.72);border:1px solid rgba(196,181,253,.45);font-weight:800;font-size:15px;letter-spacing:.12em;white-space:nowrap;opacity:0}
  #ss .chip b{color:#fde68a}
  #ss .cur{position:absolute;left:0;top:0;width:30px;height:30px;opacity:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.8))}
  #ss .cur svg{width:100%;height:100%;transform-origin:4px 3px}
  #ss .cur.down svg{transform:scale(.82)}`;
  document.head.appendChild(st);
  const ss = document.createElement("div");
  ss.id = "ss";
  const chips = D.maps.map((m) => `<span>${m.name} · ${m.difficulty}</span>`).join("");
  ss.innerHTML = '<div class="scrim"></div>'
    + `<div class="card" id="ssTitle"><div class="kick">FULL GAMEPLAY · ALL ${D.play.length} MAPS</div><div class="big">SAUCER SIEGE</div><div class="sub">3D Tower Defense · 2× speed · start to victory</div><div class="maps">${chips}</div></div>`
    + '<div class="card" id="ssEnd"><div class="big">SAUCER SIEGE</div><div class="play">PLAY FREE</div><div class="url">games.codelove.in</div><div class="tip">Which map was the hardest for you? Comment below!</div></div>'
    + '<div class="chip"></div><div class="blk"></div>'
    + '<div class="cur"><svg viewBox="0 0 24 24"><path d="M4 3l14 8.5-6.2 1.3 3.6 6.9-2.6 1.3-3.6-6.9L4 18.5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></div>';
  document.body.appendChild(ss);
  const $ = (s) => ss.querySelector(s);
  const blk = $(".blk"), scrim = $(".scrim"), titleEl = $("#ssTitle"), endEl = $("#ssEnd"), chip = $(".chip"), cur = $(".cur");
  let black = 1, scrimA = 0, titleA = 0, endA = 0, chipA = 0, curA = 0, curIdle = 99;
  let cx = W0() * 0.5, cy = H0() * 0.7;
  function W0() { return window.innerWidth; }
  function H0() { return window.innerHeight; }

  // --- small steps (generators: one yield = one frame)
  function* wait(s) { for (let t = 0; t < s - 1e-6; t += dt) yield; }
  function* waitFor(cond, s, label) { for (let t = 0; t < s; t += dt) { if (cond()) return true; yield; } if (label) warn("timed out: " + label); return false; }
  function* tween(set, from, to, s) { for (let t = dt; t <= s + 1e-6; t += dt) { set(from + (to - from) * ease(t / s)); yield; } set(to); }
  /** The cursor glides to a screen point. */
  function* glide(x, y, s) {
    const sx = cx, sy = cy, d = Math.hypot(x - sx, y - sy);
    s = s ?? Math.min(0.42, Math.max(0.16, d / 1500));
    curIdle = 0;
    for (let t = dt; t <= s + 1e-6; t += dt) { const e = ease(t / s); cx = sx + (x - sx) * e; cy = sy + (y - sy) * e; curIdle = 0; yield; }
    cx = x; cy = y;
  }
  function* press() { cur.classList.add("down"); curIdle = 0; yield* wait(0.07); cur.classList.remove("down"); }
  /** Glide to a button and click it. */
  function* click(el, s) {
    if (!el) { warn("no button to click"); return false; }
    const r = el.getBoundingClientRect();
    yield* glide(r.left + r.width * 0.5, r.top + r.height * 0.58, s);
    cur.classList.add("down"); el.click(); curIdle = 0; yield* wait(0.08); cur.classList.remove("down");
    return true;
  }
  const buttons = () => [...document.querySelectorAll("button")];
  const byText = (re) => buttons().find((b) => re.test(b.textContent.trim()));
  const screenOf = (x, y, z) => {
    const v = g.v1.set(x, y, z).project(g.camera), r = g.canvas.getBoundingClientRect();
    return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
  };

  // --- the bot: the most damage along the road for the gold, where the road is least covered
  const ARMOR = 1.5;
  const dps = (kind, lv) => { const L = T[kind].levels[lv]; return Math.max(L.damage * 0.25, L.damage - ARMOR) * L.rate * (L.splash > 0 ? 1 + L.splash * (kind === "catapult" ? 0.7 : 1) : 1); };
  let samples = [], covCache = new Map();
  function prepare() {
    samples = []; covCache = new Map();
    const v = g.v2.clone();
    for (const p of g.paths) for (let d = 0.4; d < p.length; d += 0.2) { p.at(d, v); samples.push([v.x, v.z]); }
  }
  /** The road samples a tile reaches at range r. */
  const cov = (cell, r) => {
    const key = cell.x + "," + cell.z + "," + r;
    let c = covCache.get(key);
    if (c === undefined) {
      const p = g.center(cell.x, cell.z);
      c = [];
      samples.forEach(([x, z], i) => { if ((x - p.x) ** 2 + (z - p.z) ** 2 <= r * r) c.push(i); });
      covCache.set(key, c);
    }
    return c;
  };
  function best() {
    const live = g.towers.filter((t) => t.selling <= 0);
    const count = (k) => live.filter((t) => t.kind === k).length;
    const free = g.cells.filter((c) => c.kind === "build" && !c.tower);
    // Damage already on each bit of road, and what the coming waves need there: more damage where there is little
    // is worth more than piling it where there is plenty.
    const field = new Float32Array(samples.length);
    for (const t of live) { const d = dps(t.kind, t.level); for (const i of cov(t.cell, T[t.kind].levels[t.level].range)) field[i] += d; }
    const w = g.wave + 2, need = 24 * g.map.hp * (1 + 0.1 * (w - 1) + 0.015 * (w - 1) ** 2);
    const f = (d) => Math.log(1 + d / need);
    const gain = (add, sub) => { let v = 0; const delta = new Map(); for (const i of sub) delta.set(i, -sub.d); for (const i of add) delta.set(i, (delta.get(i) ?? 0) + add.d); for (const [i, x] of delta) v += f(field[i] + x) - f(field[i]); return v; };
    const opts = [];
    for (const kind of Object.keys(T)) {
      const L = T[kind].levels[0], d = dps(kind, 0);
      let cell = null, value = 0;
      for (const c of free) { const s = Object.assign(cov(c, L.range).slice(), { d }); const v = gain(s, Object.assign([], { d: 0 })); if (v > value) { value = v; cell = c; } }
      if (!cell) continue;
      // A mix of towers (it shows the game better); turrets earn their place on the scouts.
      const mix = (1 / (1 + 0.3 * count(kind))) * (kind === "turret" ? (g.wave >= 2 ? 1.1 : 0.5) : 1);
      opts.push({ type: "build", kind, cell, cost: T[kind].cost, value: value * mix });
    }
    for (const t of live) {
      if (t.level >= 2) continue;
      const a = T[t.kind].levels[t.level], b = T[t.kind].levels[t.level + 1];
      const v = gain(Object.assign(cov(t.cell, b.range).slice(), { d: dps(t.kind, t.level + 1) }), Object.assign(cov(t.cell, a.range).slice(), { d: dps(t.kind, t.level) }));
      opts.push({ type: "upgrade", tower: t, cost: T[t.kind].upgrades[t.level], value: v });
    }
    const ratio = (o) => o.value / o.cost;
    let top = null, cheap = null;
    for (const o of opts) {
      if (o.value <= 0) continue;
      if (!top || ratio(o) > ratio(top)) top = o;
      if (o.cost <= g.gold && (!cheap || ratio(o) > ratio(cheap))) cheap = o;
    }
    // Save up only for something clearly better that is nearly paid for, and never while saucers get through.
    if (!cheap) return top;
    const hurt = leakT < 6;
    return ratio(cheap) >= 0.65 * ratio(top) || (top.cost - g.gold > 60 && ratio(cheap) >= 0.4 * ratio(top)) || hurt ? cheap : top;
  }
  function* build(a) {
    g.deselect();
    const p = g.center(a.cell.x, a.cell.z);
    const [x, y] = screenOf(p.x, p.y, p.z);
    yield* glide(x, y);
    g.tap(x, y);
    yield* press();
    if (g.selCell !== a.cell) { g.focus = null; g.armed = null; g.select(a.cell); }
    yield* wait(0.12);
    const name = T[a.kind].name;
    yield* click(buttons().find((b) => b.title.startsWith(name + " —")));
    if (a.cell.tower) note(`build ${a.kind} at ${a.cell.x},${a.cell.z}  (gold ${g.gold}, wave ${g.wave})`);
    else { warn(`could not build ${a.kind} at ${a.cell.x},${a.cell.z}`); g.deselect(); }
  }
  function* upgrade(a) {
    g.deselect();
    const t = a.tower, p = t.root.position;
    const [x, y] = screenOf(p.x, p.y + 0.55, p.z);
    yield* glide(x, y);
    g.tap(x, y);
    yield* press();
    if (g.selTower !== t) { g.focus = null; g.armed = null; g.select(t); }
    yield* wait(0.18);
    const lv = t.level;
    yield* click(document.querySelector('button[title="Upgrade (U)"]'));
    if (t.level === lv) warn(`could not upgrade ${t.kind}`);
    else note(`upgrade ${t.kind} → ${t.level + 1}  (gold ${g.gold}, wave ${g.wave})`);
    yield* wait(0.22);
    yield* click(document.querySelector('button[aria-label="Close (Q)"]'));
    g.deselect();
  }

  // --- one map, played to the end
  let lastWave = 0, breakT = 0, leakT = 99, lastLives = 0;
  function* playMap(i) {
    yield* waitFor(() => g.phase === "playing" && g.mapIndex === i, 10, "map start");
    prepare();
    lastWave = 0;
    event("map", { map: i, name: D.maps[i].name });
    note(`map ${i + 1}: ${D.maps[i].name}`);
    chip.innerHTML = `MAP <b>${D.play.indexOf(i) + 1}/${D.play.length}</b> · ${D.maps[i].name.toUpperCase()} · <b>${D.maps[i].difficulty.toUpperCase()}</b>`;
    yield* wait(1.4);
    if (g.speed !== 2) { yield* click(document.querySelector('button[title="Game speed (T)"]')); if (g.speed !== 2) g.speed = 2; }
    yield* wait(0.3);
    while (g.phase === "playing") {
      if (g.ending) { yield; continue; }
      const a = best();
      if (a && g.gold >= a.cost) {
        if (a.type === "build") yield* build(a);
        else yield* upgrade(a);
        yield* wait(0.2);
        continue;
      }
      // A clear road and nothing to buy: the next wave now, for the bonus.
      const ready = g.countdown >= 0 && g.wave < g.map.waves && g.saucers.length <= 2 && g.lives >= g.map.lives - 6 && breakT > 1.4 && (g.wave > 0 || g.towers.length >= 2);
      if (ready) {
        const btn = buttons().find((b) => /call it early|Call the next wave/.test(b.title));
        yield* click(btn);
        if (g.countdown >= 0) g.callWave();
        yield* wait(0.3);
        continue;
      }
      yield;
    }
  }

  // --- the playthrough
  function* main() {
    // title over the menu
    scrimA = 1; titleA = 0;
    yield* tween((v) => (black = v), 1, 0, 0.8);
    yield* tween((v) => (titleA = v), 0, 1, 0.7);
    yield* wait(4.2);
    yield* tween((v) => { titleA = v; scrimA = v; }, 1, 0, 0.6);
    yield* wait(0.6);
    for (const [n, i] of D.play.entries()) {
      if (n === 0) {
        yield* click([...document.querySelectorAll('[role="radio"]')][i], 0.5);
        yield* wait(0.5);
        // the menu has drawn on Math.random in real time: seed it now so every run deals the same game
        { let a = D.seed >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
        yield* click(byText(/^Defend/), 0.45);
      } else {
        const next = byText(/^Next:/);
        if (next && D.play[n - 1] + 1 === i) yield* click(next, 0.5);
        else { yield* click(byText(/^Menu$/), 0.5); yield* wait(1); yield* click([...document.querySelectorAll('[role="radio"]')][i], 0.5); yield* click(byText(/^Defend/), 0.45); }
      }
      yield* tween((v) => (chipA = v), 0, 1, 0.5);
      yield* playMap(i);
      yield* tween((v) => (chipA = v), 1, 0, 0.4);
      const won = g.phase === "won";
      event(won ? "won" : "lost", { map: i, lives: g.lives });
      note(`${won ? "WON" : "LOST"} ${D.maps[i].name}: wave ${g.wave}/${g.map.waves}, lives ${g.lives}/${g.map.lives}`);
      if (!won) warn(`lost ${D.maps[i].name} at wave ${g.wave}`);
      yield* wait(n === D.play.length - 1 ? 4.5 : 3.6);
    }
    event("end");
    yield* tween((v) => { scrimA = v; endA = v; }, 0, 1, 0.8);
    yield* wait(6);
    yield* tween((v) => (black = v), 0, 1, 1);
  }

  const plan = main();
  let done = false, sent = 0;
  window.__ss = {
    warns: () => warns,
    events: () => events,
    frame() {
      if (!done) { const r = plan.next(); if (r.done) done = true; }
      // waves, for the shorts
      if (g.phase === "playing" && g.wave !== lastWave && g.wave > 0) {
        lastWave = g.wave;
        const boss = g.queue.some((q) => q.kind === "boss");
        event("wave", { map: g.mapIndex, wave: g.wave, waves: g.map.waves, boss });
        note(`wave ${g.wave}${boss ? " (mothership)" : ""}: gold ${g.gold}, lives ${g.lives}, towers ${g.towers.map((t) => t.kind[0] + (t.level + 1)).join(" ")}`);
      }
      breakT = g.countdown >= 0 ? breakT + dt : 0;
      leakT = g.phase === "playing" && g.lives < lastLives ? 0 : leakT + dt;
      lastLives = g.lives;
      curIdle += dt;
      curA = curIdle < 1.2 ? Math.min(1, curA + dt * 8) : Math.max(0, curA - dt * 3);
      blk.style.opacity = black;
      scrim.style.opacity = scrimA;
      titleEl.style.opacity = titleA;
      endEl.style.opacity = endA;
      chip.style.opacity = chipA;
      cur.style.opacity = curA;
      cur.style.transform = `translate(${cx - 4}px, ${cy - 3}px)`;
      window.__vt.step(1000 / D.fps);
      R.vt += dt;
      const out = notes.slice(sent); sent = notes.length;
      return { done, vt: R.vt, notes: out };
    },
  };
}

/**
 * Replays the log on an OfflineAudioContext built like the game's audio hub: the music (part "music") or every
 * sound effect at its time (part "sfx"). Keeps the PCM in the page; returns its size in bytes.
 */
async function soundtrack(part, seconds) {
  const { audio, music, song, game: g } = window.__saucerSiege, R = window.__rec;
  const rate = 44100, ctx = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
  Object.defineProperty(ctx, "state", { get: () => "running" });
  const resume = ctx.resume.bind(ctx);
  ctx.resume = () => Promise.resolve();
  music.stop(0);
  delete audio.unlock;
  audio.ctx = null;
  const Real = window.AudioContext, realInterval = window.setInterval;
  let tick = null;
  window.AudioContext = function () { return ctx; };
  audio.unlock();
  window.AudioContext = Real;
  audio.unlock = () => {};
  const q = 128 / rate, groups = new Map();
  const put = (time, fn) => { const at = Math.max(q, Math.round(time / q) * q); if (!groups.has(at)) groups.set(at, []); groups.get(at).push(fn); };
  if (part === "music") {
    const changes = R.music.slice();
    window.setInterval = (fn) => { tick = fn; return 1; };
    music.play(song, changes[0][1], { restart: true });
    window.setInterval = realInterval;
    for (const [t, v] of changes.slice(1)) put(t, () => R.setIntensity(v));
    for (let t = 0.05; t < seconds; t += 0.05) put(t, () => tick && tick());
  } else {
    const sfx = g.sfx;
    for (const [t, name, args] of R.sfx) put(t, () => R.orig[name].apply(sfx, args));
  }
  const realNow = performance.now;
  for (const [at, list] of groups) {
    ctx.suspend(at).then(() => {
      performance.now = () => at * 1000;
      for (const fn of list) { try { fn(); } catch (e) { /* a sound that can't replay */ } }
      performance.now = realNow;
      resume();
    });
  }
  const buf = await ctx.startRendering();
  music.stop(0);
  audio.ctx = null;
  const n = buf.length, L = buf.getChannelData(0), Rt = buf.getChannelData(1), pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, Rt[i])) * 32767; }
  window.__pcm = pcm;
  return pcm.byteLength;
}
const PCM_CHUNK = (off, len) => `(() => { const b = new Uint8Array(window.__pcm.buffer, ${off}, ${len}); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); })()`;

// --- Chrome & ffmpeg -------------------------------------------------------------------------------

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") console.error("  page error:", d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); if (d.error) p.rej(new Error(d.error.message)); else p.res(d.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}

if (spawnSync(FFMPEG, ["-version"]).status !== 0) { console.error(`ffmpeg not found (${FFMPEG}) — set FFMPEG=path/to/ffmpeg`); process.exit(1); }
// The silent picture and the sound parts are kept next to the video until the end: a long run is not lost to a late error.
const work = path.join(OUT, "video", ".work");
fs.mkdirSync(work, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "saucer-gameplay-"));
let chrome = null, enc = null;
try {
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null); }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.navigate", { url: `${BASE}/saucer-siege/play/` });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!(window.__saucerSiege && __saucerSiege.game.phase === "menu")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npm run dev` running?)");
    await sleep(500);
  }
  await page.evaluate(`(${logger})()`);
  await sleep(2500);
  await page.evaluate("__vt.start()");
  await page.evaluate(`(${director})(${JSON.stringify({ fps: FPS, seed: SEED, sim: SIM, towers: TOWERS, maps: MAPS.map((m) => ({ name: m.name, difficulty: m.difficulty })), play: PLAY_MAPS })})`);

  if (!SIM) {
    enc = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", String(FPS * 2), path.join(work, "picture.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  }
  console.log(SIM ? `Simulating (seed ${SEED})…` : `Recording (seed ${SEED}, ${W * DPR}×${H * DPR}, ${FPS} fps)…`);
  const t0 = Date.now();
  let vt = 0, frames = 0;
  for (;;) {
    const r = await page.evaluate("__ss.frame()");
    for (const s of r.notes) console.log("  " + s);
    if (!SIM) {
      const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true });
      if (!enc.stdin.write(Buffer.from(data, "base64"))) await new Promise((res) => enc.stdin.once("drain", res));
    }
    frames++;
    vt = r.vt;
    if (frames % (FPS * 30) === 0) console.log(`  — ${mmss(vt)} of video, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (r.done || vt >= STOP) break;
    if (vt > CAP) throw new Error(`the run passed ${CAP} s — raise CAP`);
  }
  const warns = await page.evaluate("__ss.warns()");
  const events = await page.evaluate("__ss.events()");
  console.log(`Run: ${mmss(vt)} (${vt.toFixed(1)} s), ${frames} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min, ${warns.length} warning(s)${warns.length ? ":\n  " + warns.join("\n  ") : ""}`);
  for (const e of events.filter((e) => e.type !== "wave" || e.boss)) console.log(`  ${mmss(e.t)}  ${e.type}${e.name ? " " + e.name : ""}${e.wave ? ` wave ${e.wave}/${e.waves}` : ""}${e.boss ? " (mothership)" : ""}${e.lives !== undefined ? ` lives ${e.lives}` : ""}`);

  if (!SIM) {
    enc.stdin.end();
    await new Promise((res, rej) => enc.on("close", (c) => (c === 0 ? res() : rej(new Error("the video encoder failed")))));
    enc = null;
    fs.writeFileSync(VIDEO.replace(/\.mp4$/, ".json"), JSON.stringify({ seconds: vt, fps: FPS, maps: MAPS.map((m) => ({ name: m.name, difficulty: m.difficulty, waves: m.waves })), events }, null, 1));
    for (const part of ["music", "sfx"]) {
      console.log(`Sound: ${part}…`);
      const bytes = await page.evaluate(`(${soundtrack})(${JSON.stringify(part)}, ${vt + 0.5})`);
      const fd = fs.openSync(path.join(work, `${part}.pcm`), "w");
      for (let off = 0; off < bytes; off += 6 << 20) fs.writeSync(fd, Buffer.from(await page.evaluate(PCM_CHUNK(off, Math.min(6 << 20, bytes - off))), "base64"));
      fs.closeSync(fd);
      await page.evaluate("window.__pcm = null");
    }
    page.close();
    console.log("Mixing and muxing…");
    const pcm = (f) => ["-f", "s16le", "-ar", "44100", "-ac", "2", "-i", path.join(work, f)];
    ffmpeg([
      "-i", path.join(work, "picture.mp4"), ...pcm("music.pcm"), ...pcm("sfx.pcm"),
      "-filter_complex", `[1:a]volume=${MUSIC}[m];[2:a]volume=1.0[s];[m][s]amix=inputs=2:normalize=0:duration=first,afade=t=in:d=0.8,afade=t=out:st=${(vt - 1.5).toFixed(2)}:d=1.5,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
      "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", vt.toFixed(3), "-movflags", "+faststart", VIDEO,
    ]);
    console.log(`${VIDEO}  ${(fs.statSync(VIDEO).size / 1024 / 1024).toFixed(1)} MB, ${mmss(vt)}`);
    fs.rmSync(work, { recursive: true, force: true });
  }
} finally {
  if (enc) enc.kill();
  chrome?.kill();
  await sleep(800);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Chrome still holds it */ }
}
