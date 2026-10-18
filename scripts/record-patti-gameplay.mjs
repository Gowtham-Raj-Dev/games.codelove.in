#!/usr/bin/env node
/**
 * Records a full Patti Veedu playthrough to the true ending as a 16:9 YouTube video, with the game's own sound
 * and Tamil captions:
 *   recordings/patti-veedu-gameplay-ta.mp4   1920×1080, about ten minutes
 *
 *   node scripts/record-patti-gameplay.mjs
 *   PREVIEW=1 …   contact sheets (one small frame every two seconds, no sound) and the step log, to check the run
 *
 * The same method as the trailer and the Shorts (scripts/record-patti-shorts.mjs): the game runs from
 * public/games/patti-veedu/app off the disk on a virtual clock, one screenshot per frame. Here nothing is staged
 * shot by shot: a scripted player plays the real game. It walks the house on the game's own physics along
 * Paatti's navigation grid, opens the doors on its way, picks things up, reads the letters and solves every
 * puzzle through the puzzles' own buttons (with a visible cursor), following the route of game/tests/play10.js.
 * Paatti is kept out of the way except for two scenes: hiding in the study wardrobe and the syringe.
 * Long trips back across the house are cut (the player still walks them, unfilmed).
 *
 * Math.random is seeded (SEED, default 7), so a preview and the final run play the same game. Every sound the
 * game makes is logged and replayed on its own synth on an OfflineAudioContext. Frames go straight into ffmpeg.
 *
 * Env: CHROME, FFMPEG (default: the copy in %LOCALAPPDATA%/kolusu-promo-tools), SEED, FPS (default 30),
 * OUT (the mp4), STILLS (where the preview sheets go), CAP (longest run in seconds, default 780),
 * SNAPS (preview only: video times in seconds, comma separated, to also save as full-size frames).
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const GAME = pathToFileURL(path.join(ROOT, "public", "games", "patti-veedu", "app", "index.html")).href + "?desk";
const TOOLS = path.join(process.env.LOCALAPPDATA ?? os.homedir(), "kolusu-promo-tools");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG ?? path.join(TOOLS, "node_modules", "ffmpeg-static", "ffmpeg.exe");
const OUT = process.env.OUT ?? path.join(ROOT, "recordings", "patti-veedu-gameplay-ta.mp4");
const PREVIEW = !!process.env.PREVIEW;
const PORT = 9359;
/** Layout size and the pixel ratio that makes the capture 1920×1080. */
const W = 1280;
const H = 720;
const DPR = PREVIEW ? 0.5 : 1.5;
const FPS = Number(process.env.FPS ?? 30);
const SEED = Number(process.env.SEED ?? 7);
const CAP = Number(process.env.CAP ?? 780);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Page side: set up before the game loads -------------------------------------------------------
/** A seeded Math.random, so every run deals the same clock time, code, lamp order and years. */
const SEEDED = (seed) => `(() => { let a = ${seed} >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`;

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

/** Every sound call is logged with the video time it happened at (none while a trip is being cut, but the state ones). */
function logger() {
  const A = window.__kolusu.K.Audio;
  const R = (window.__rec = { on: false, skip: false, vt: 0, log: [], orig: {} });
  const SKIP = new Set(["init", "resume", "suspend", "ready", "ctxReady", "voiceReady", "setVolume", "setAmbience", "setMusic", "update", "_tap"]);
  const STATE = new Set(["setChase", "setHeart", "setOutdoor", "ambient", "music", "musicDuck", "listener"]);
  for (const name of Object.keys(A)) {
    const f = A[name];
    if (typeof f !== "function" || SKIP.has(name)) continue;
    R.orig[name] = f;
    A[name] = (...args) => {
      if (R.on && (!R.skip || STATE.has(name))) { try { R.log.push([R.vt, name, JSON.parse(JSON.stringify(args))]); } catch (e) { /* not cloneable: leave it out */ } }
      return name === "voice" ? 3.5 : name === "radio" ? { stop() {} } : undefined;
    };
  }
  R.orig.update = A.update;
  A.update = () => {};
}

/** The player, the plan and the overlays. Runs in the page; one plan step per frame. */
function director(D) {
  const k = window.__kolusu, K = k.K, A = K.Audio, P = k.P, E = k.E, W = k.W, G = k.G, N = K.Nav, T = K.Touch, R = window.__rec;
  const $ = (id) => document.getElementById(id);
  const dt = 1 / D.fps;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const warns = [], notes = [];
  const note = (s) => notes.push(`${R.vt.toFixed(1).padStart(6)} s  ${s}`);
  const warn = (s) => { warns.push(`${R.vt.toFixed(1)} s  ${s}`); note("!! " + s); };

  // --- overlays: the game's HUD minus its buttons and key hints; captions, chapter titles, title and end cards, cursor
  const st = document.createElement("style");
  st.textContent = `.tbtns .rbtn,#joy,#joyHint,.acts,#deskKeys,#clickToPlay{display:none!important}
  body.gpTitle #menu{display:none!important}
  #gp{position:fixed;inset:0;z-index:99999;pointer-events:none;font-family:"Hind Madurai","Noto Sans Tamil",sans-serif;color:#f3e6d6}
  #gp .blk{position:absolute;inset:0;background:#000;opacity:0}
  #gp .cap{position:absolute;left:14%;right:14%;bottom:${D.capBottom}px;text-align:center;font:600 22px/1.5 "Hind Madurai","Noto Sans Tamil",sans-serif;text-shadow:0 2px 4px #000,0 0 12px #000;opacity:0}
  #gp .cap span{background:rgba(8,3,4,.7);padding:5px 14px 3px;border-radius:9px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  #gp .chap{position:absolute;left:0;right:0;top:30%;text-align:center;opacity:0}
  #gp .chap small{display:inline-block;padding:6px 16px 4px;border-radius:999px;background:#c0160d;color:#fff;font:400 15px/1 "Special Elite",serif;letter-spacing:.28em;box-shadow:0 0 20px rgba(220,30,10,.55)}
  #gp .chap b{display:block;margin-top:14px;font:900 50px/1.15 "Catamaran","Noto Sans Tamil",sans-serif;color:#efe0c8;text-shadow:0 0 24px #000,0 3px 0 #2a0402,0 0 50px #000}
  #gp .title{position:absolute;left:0;right:0;top:24%;text-align:center;opacity:0}
  #gp .kick b{display:inline-block;padding:7px 18px 5px;border-radius:999px;background:#c0160d;color:#fff;font:400 18px/1 "Special Elite",serif;letter-spacing:.16em;box-shadow:0 0 22px rgba(220,30,10,.6)}
  #gp .ta{margin-top:18px;font:900 92px/1.05 "Catamaran","Noto Sans Tamil",sans-serif;color:#d51c11;text-shadow:0 0 26px rgba(220,30,10,.6),0 4px 0 #3a0503,0 0 40px #000}
  #gp .en{margin-top:8px;font:400 52px/1 "Creepster",serif;letter-spacing:.08em;color:#e8d7c2;text-shadow:0 0 18px #000,0 2px 4px #000}
  #gp .sub{margin-top:16px;font:600 24px/1.3 "Hind Madurai",sans-serif;color:#ffcf8a;text-shadow:0 0 12px #000}
  #gp .play{display:inline-block;margin-top:34px;padding:14px 30px 10px;border-radius:999px;background:linear-gradient(180deg,#f87171,#dc2626 55%,#991b1b);color:#fff;font:400 32px/1 "Creepster",serif;letter-spacing:.1em;border:3px solid #0b0406;box-shadow:0 7px 0 #0b0406,0 0 34px rgba(220,30,10,.55)}
  #gp .url{margin-top:26px;font:400 34px/1 "Special Elite",serif;color:#ffcf8a;text-shadow:0 0 12px #000}
  #gp .tip{margin-top:14px;font:600 22px/1.3 "Hind Madurai",sans-serif;color:#e8d7c2;text-shadow:0 0 10px #000}
  #gp .cur{position:absolute;left:0;top:0;width:30px;height:30px;opacity:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.8))}
  #gp .cur svg{width:100%;height:100%;transform-origin:4px 3px}
  #gp .cur.down svg{transform:scale(.82)}`;
  document.head.appendChild(st);
  for (const id of ["clickToPlay", "deskKeys", "joy", "joyHint"]) { const el = $(id); if (el) el.style.setProperty("display", "none", "important"); }
  const gp = document.createElement("div");
  gp.id = "gp";
  gp.innerHTML = '<div class="blk"></div>'
    + '<div class="title" id="gpTitle"><div class="kick"><b>FULL GAMEPLAY · TRUE ENDING</b></div><div class="ta">பாட்டி வீடு</div><div class="en">PATTI VEEDU</div><div class="sub">தமிழ் Horror Game · முழு விளையாட்டு</div></div>'
    + '<div class="title" id="gpEnd"><div class="ta">பாட்டி வீடு</div><div class="en">PATTI VEEDU</div><div class="play">PLAY FREE</div><div class="url">games.codelove.in</div><div class="tip">உங்க best time-ஐ comment பண்ணுங்க · Android APK-உம் இருக்கு</div></div>'
    + '<div class="chap"><small></small><b></b></div><div class="cap"><span></span></div>'
    + '<div class="cur"><svg viewBox="0 0 24 24"><path d="M4 3l14 8.5-6.2 1.3 3.6 6.9-2.6 1.3-3.6-6.9L4 18.5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></div>';
  document.body.appendChild(gp);
  const blk = gp.querySelector(".blk"), capEl = gp.querySelector(".cap"), capText = capEl.firstChild, chapEl = gp.querySelector(".chap"), titleEl = $("gpTitle"), endEl = $("gpEnd"), cur = gp.querySelector(".cur");
  let black = 0, caption = null, chapter = null, cx = W0(), cy = H0();
  function W0() { return window.innerWidth * 0.5; }
  function H0() { return window.innerHeight * 0.82; }
  const fadeIn = (t, a, b, f = 0.4) => Math.min(ease((t - a) / f), ease((b - t) / f));
  /** A caption for sec seconds of video. */
  const say = (text, sec = 4) => { caption = { text, t0: R.vt, t1: R.vt + sec }; };
  const chap = (tag, text, sec = 3.6) => { chapter = { tag, text, t0: R.vt, t1: R.vt + sec }; chapEl.querySelector("small").textContent = tag; chapEl.querySelector("b").textContent = text; };

  // --- small steps (generators: one yield = one frame)
  function* wait(s) { for (let t = 0; t < s - 1e-6; t += dt) yield; }
  function* waitFor(cond, s, label) { for (let t = 0; t < s; t += dt) { if (cond()) return true; yield; } if (label) warn("timed out: " + label); return false; }
  function* fade(to, s = 0.4) { const from = black; for (let t = dt; t <= s + 1e-6; t += dt) { black = from + (to - from) * ease(t / s); yield; } black = to; }
  const stop = () => { T.x = 0; T.y = 0; T.run = false; };
  const setCam = () => { const ey = P.feet + P.y; k.camera.position.set(P.x, ey, P.z); k.camera.rotation.set(P.pitch, P.yaw, 0, "YXZ"); k.camera.updateMatrixWorld(true); };
  const describe = (t) => (t ? t.kind + (t.item ? ":" + t.item.id : "") + (t.door ? ":" + t.door.id : "") + (t.lamp ? ":" + t.lamp.sym : "") + (t.pos ? ":" + t.pos : "") : "NONE");
  /** Turn the view onto a point, eased. */
  function* look(aim, min = 0.35) {
    const ey = P.feet + P.y, dx = aim[0] - P.x, dz = aim[2] - P.z;
    const y0 = P.yaw, p0 = P.pitch, dy = angle(Math.atan2(-dx, -dz) - y0), p1 = Math.atan2(aim[1] - ey, Math.hypot(dx, dz));
    const s = Math.max(min, Math.min(1.1, Math.abs(dy) / 2.6 + Math.abs(p1 - p0) / 2));
    for (let t = dt; t <= s + 1e-6; t += dt) { const e = ease(t / s); P.yaw = y0 + dy * e; P.pitch = p0 + (p1 - p0) * e; G.lookT = performance.now(); yield; }
    P.yaw = y0 + dy; P.pitch = p1;
  }
  /** Doors a path passes through, in order. */
  function doorsOn(path) {
    const out = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      if (a.lv !== b.lv) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
      for (let s = 0; s <= n; s++) {
        const x = a.x + ((b.x - a.x) * s) / n, z = a.z + ((b.z - a.z) * s) / n;
        for (const d of W.doors) if ((d.lv || 0) === a.lv && !out.includes(d) && x > d.box.minX - 0.2 && x < d.box.maxX + 0.2 && z > d.box.minZ - 0.2 && z < d.box.maxZ + 0.2) out.push(d);
      }
    }
    return out;
  }
  function* openDoor(d) {
    const y = W.FLOOR[d.lv || 0] + 1.1;
    yield* look([d.center.x, y, d.center.z], 0.3);
    setCam(); k.findTarget(); const t = k.target();
    if (t && t.kind === "door" && t.door === d) k.interact();
    else { d.setOpen(true); A.creak({ x: d.center.x, y, z: d.center.z }, 0.7, 0.6); }
    yield* wait(0.5);
  }
  // Paatti's grid keeps a 0.3 m body margin, which closes the 1 m doors (the pooja room, the upstairs rooms):
  // where it finds no way, go through such doors explicitly, one side to the other (the main door too, once open).
  function portals() {
    const out = W.doors.filter((d) => !d.locked).map((d) => {
      const b = d.box, alongZ = b.maxX - b.minX < b.maxZ - b.minZ, c = d.center, lv = d.lv || 0;
      // a stand outside the pooja door leaves only its west half free
      if (d.id === "pooja") return { d, lv, s: [{ x: 16.3, z: 5.3 }, { x: 16.27, z: 7.0 }] };
      // a small table just inside the library door: in, then round it to the north
      if (d.id === "library") return { d, lv, s: [{ x: 41.3, z: 10 }, { x: 42.65, z: 9.0 }], via: [{ x: 42.4, z: 10 }] };
      // each side: the nearest spot straight out from the door that the grid has free (furniture can stand close)
      const side = (sg) => {
        for (const o of [0.6, 0.8, 1.0, 1.25, 1.5]) {
          const p = alongZ ? { x: c.x + sg * o, z: c.z } : { x: c.x, z: c.z + sg * o };
          if (N.passAt(p.x, p.z, lv)) return p;
        }
        return alongZ ? { x: c.x + sg * 0.6, z: c.z } : { x: c.x, z: c.z + sg * 0.6 };
      };
      return { d, lv, s: [side(-1), side(1)] };
    });
    if (G.flags.doorOpen) out.push({ d: null, lv: 0, s: [{ x: 12, z: 19.2 }, { x: 12, z: 20.7 }] });
    return out;
  }
  function route(a, b, depth, used = []) {
    const p = N.find(a.x, a.z, a.lv, b.x, b.z, b.lv);
    if (p || depth <= 0) return p;
    for (const q of portals()) {
      if (used.includes(q)) continue;
      const via = q.via || [];
      for (const [s1, s2, mid] of [[q.s[0], q.s[1], via], [q.s[1], q.s[0], via.slice().reverse()]]) {
        const p1 = N.find(a.x, a.z, a.lv, s1.x, s1.z, q.lv);
        if (!p1) continue;
        const p2 = route({ x: s2.x, z: s2.z, lv: q.lv }, b, depth - 1, [...used, q]);
        if (p2) return p1.concat([s1, ...mid, s2].map((s) => ({ x: s.x, z: s.z, lv: q.lv, tight: true })), p2);
      }
    }
    return null;
  }
  const findWay = (x, z, lv) => { for (let d = 0; d <= 3; d++) { const p = route({ x: P.x, z: P.z, lv: P.lv }, { x, z, lv }, d); if (p) return p; } return null; };
  /** Walk to a spot on the game's own physics, along Paatti's navigation grid; doors on the way get opened. */
  function* walk(x, z, lv = 0, o = {}) {
    // o.direct: straight there (the front yard is not on the grid)
    const path = o.direct ? [{ x: P.x, z: P.z, lv: P.lv }] : findWay(x, z, lv);
    if (!path) { warn(`no path to ${x},${z} L${lv} — teleported`); k.teleport(x, z, undefined, lv); return; }
    path.push({ x, z, lv });
    const doors = doorsOn(path);
    let len = 0; for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    const run = o.run ?? len > 10;
    let i = 1, best = Infinity, still = 0, spent = 0;
    while (i < path.length && G.state === "play") {
      const wp = path[i], last = i === path.length - 1;
      const dr = doors.find((d) => !d.open && !d.locked && (d.lv || 0) === P.lv && Math.hypot(d.center.x - P.x, d.center.z - P.z) < 1.45);
      if (dr) { stop(); yield* wait(0.15); yield* openDoor(dr); best = Infinity; still = 0; continue; }
      const dx = wp.x - P.x, dz = wp.z - P.z, dist = Math.hypot(dx, dz);
      if (dist < (last ? 0.12 : wp.tight ? 0.18 : 0.45) && (last || wp.lv === P.lv)) { i++; best = Infinity; still = 0; continue; }
      if (last && still > 0.5) break; // as close as it gets
      const err = angle(Math.atan2(-dx, -dz) - P.yaw);
      P.yaw += err * Math.min(1, dt * (Math.abs(err) > 1 ? 9 : 6));
      T.x = 0;
      T.y = Math.abs(err) > 1.1 ? 0.12 : (last || wp.tight) && dist < 0.9 ? Math.max(0.36, dist) : 1;
      T.run = run && !last && !wp.tight && Math.abs(err) < 0.45 && dist > 1.2;
      if (T.run) P.stamina = 1;
      P.pitch += ((o.pitch ?? -0.04) - P.pitch) * Math.min(1, dt * 3);
      G.lookT = performance.now();
      if (dist < best - 0.04) { best = dist; still = 0; } else still += dt;
      // wedged on a corner: step onto the waypoint and go on
      if (still > 1.0 && !last) { note(`(stuck near ${P.x.toFixed(1)},${P.z.toFixed(1)} L${P.lv}: stepped on)`); if (wp.lv === P.lv) k.teleport(wp.x, wp.z); i++; best = Infinity; still = 0; continue; }
      if ((spent += dt) > 90) { warn("walk took too long"); break; }
      yield;
    }
    stop();
    yield* waitFor(() => Math.hypot(P.vx, P.vz) < 0.15, 0.6);
  }
  /** A trip across the house that is cut: a dip to black, the walk unfilmed, back in. */
  function* trip(x, z, lv = 0, o = {}) {
    yield* fade(1, 0.35);
    R.skip = true; yield* walk(x, z, lv, { ...o, run: true }); R.skip = false;
    if (o.aim) { const ey = P.feet + P.y, dx = o.aim[0] - P.x, dz = o.aim[2] - P.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(o.aim[1] - ey, Math.hypot(dx, dz)); }
    yield* wait(0.1);
    yield* fade(0, 0.4);
  }
  /** Walk to a spot, look at a thing, use it (as the game's E key does). */
  function* act(label, stand, aim, lv = 0, o = {}) {
    if (o.trip) yield* trip(stand[0], stand[1], lv, { aim });
    else yield* walk(stand[0], stand[1], lv, o);
    yield* look(aim);
    yield* wait(o.pause ?? 0.25);
    setCam(); k.findTarget(); const t = k.target();
    note(`${label.padEnd(16)} → ${describe(t)}`);
    if (!t) warn("nothing to use: " + label);
    else if (o.expect && !describe(t).startsWith(o.expect)) warn(`${label}: expected ${o.expect}, got ${describe(t)}`);
    if (t) k.interact();
    yield* wait(o.after ?? 0.9);
  }
  /** The cursor glides to a button and clicks it. */
  function* click(el, s = 0.35) {
    if (!el) { warn("no button to click"); return; }
    const r = el.getBoundingClientRect(), tx = r.left + r.width * 0.55, ty = r.top + r.height * 0.6, sx = cx, sy = cy;
    for (let t = dt; t <= s + 1e-6; t += dt) { const e = ease(t / s); cx = sx + (tx - sx) * e; cy = sy + (ty - sy) * e; yield; }
    cur.classList.add("down"); el.click(); yield* wait(0.1); cur.classList.remove("down");
  }
  function* read(sec = 4.5) {
    if (G.overlay !== "note") { warn("no letter open"); return; }
    yield;
    const n = Math.max(1, Number(($("notePage").textContent.split("/")[1] || "1").trim()) || 1);
    for (let p = 0; p < n; p++) { yield* wait(sec / n); if (p < n - 1) yield* click($("noteNext")); }
    yield* click($("noteClose"), 0.4);
    yield* wait(0.3);
  }
  const all = (sel) => [...document.querySelectorAll(sel)];

  // --- the puzzles, through their own buttons
  function* clockPuzzle() {
    const c = G.run.clock, now = () => $("ckTime").textContent.split(":").map(Number);
    let first = true;
    const tap = function* (id) { yield* click($(id), first ? 0.5 : 0.17); first = false; yield* wait(0.05); };
    yield* wait(0.8);
    const ms = (((c.m - now()[1]) / 5) % 12 + 12) % 12;
    for (let i = 0; i < (ms <= 6 ? ms : 12 - ms); i++) yield* tap(ms <= 6 ? "ckMp" : "ckMm");
    const hs = ((c.h - now()[0]) % 12 + 12) % 12;
    for (let i = 0; i < (hs <= 6 ? hs : 12 - hs); i++) yield* tap(hs <= 6 ? "ckHp" : "ckHm");
    yield* wait(0.5);
    yield* click($("ckSet"), 0.4);
  }
  function* pallPuzzle() {
    const pa = W.pall; let first = true;
    yield* wait(0.8);
    for (let i = 0; i < 4; i++) {
      const want = G.run.order.indexOf(pa.syms[i]) + 1;
      for (let n = 0; pa.counts[i] !== want && n < 6; n++) { yield* click(all("#plBoard .plCup.mark")[i], first ? 0.5 : 0.2); first = false; yield* wait(0.07); }
      yield* wait(0.15);
    }
    yield* wait(0.4);
    yield* click($("plTry"), 0.4);
  }
  function* scalePuzzle() {
    const vals = W.wing.scale.weights.map((m) => m.userData.wv), pick = [];
    let r = W.wing.sack;
    for (const [v, i] of vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])) if (r >= v) { pick.push(i); r -= v; }
    yield* wait(0.8);
    let first = true;
    for (const i of pick) { yield* click(all("#scWeights button")[i], first ? 0.5 : 0.32); first = false; yield* wait(0.4); }
    yield* waitFor(() => G.overlay !== "scalePad", 3, "scale");
  }
  function* keypad(code) {
    yield* wait(0.7);
    let first = true;
    for (const ch of String(code)) { yield* click(all("#numpad button").find((b) => b.textContent === ch), first ? 0.5 : 0.26); first = false; yield* wait(0.12); }
    yield* wait(0.35);
    yield* click(document.querySelector("#numpad .ok"), 0.35);
  }
  function* portraitPuzzle() {
    const y = G.run.years; let first = true;
    yield* wait(1.2);
    for (let i = 0; i < 4; i++) {
      const por = W.wing.por; let m = i;
      for (let q = i + 1; q < 4; q++) if (y[por[q]] < y[por[m]]) m = q;
      if (m === i) continue;
      yield* click(all("#poRow button")[i], first ? 0.5 : 0.32); first = false; yield* wait(0.25);
      yield* click(all("#poRow button")[m], 0.32); yield* wait(0.45);
    }
    yield* wait(0.3);
    yield* click($("poHang"), 0.4);
  }
  function* letterPuzzle() {
    const want = ["வ", "ள்", "ளி"], L = W.LETTERS, n = L.length;
    yield* wait(0.8);
    for (let i = 0; i < 3; i++) {
      const down = (L.indexOf(want[i]) - W.wing.letters[i] + n) % n, useDown = down <= n / 2;
      for (let c = 0; c < (useDown ? down : n - down); c++) {
        const w = all("#ltWheels .wheel")[i];
        yield* click(useDown ? w.querySelector("button:last-child") : w.querySelector("button"), c ? 0.15 : 0.4);
        yield* wait(0.05);
      }
      yield* wait(0.2);
    }
    yield* wait(0.4);
    yield* click($("ltTry"), 0.4);
  }

  // --- Paatti: away (and out of sight) unless a scene wants her
  const park = () => { k.noEnemy(true); E.state = "wait"; E.pos.set(-40, 0, -40); E.model.position.set(-40, -30, -40); A.setChase(false); A.setHeart(0); };
  const paatti = (at, diff, yaw) => { k.noEnemy(false); E.reset(1, Object.assign({ speed: 1, vision: 0, ko: 28 }, diff || {}), at); if (yaw !== undefined) { E.yaw = yaw; E.lookBase = yaw; } };
  const hooks = [];
  const roomOf = (x, z, lv) => (W.roomAt(x, z, lv) || {}).id;

  function* hideScene() {
    A.anklet({ x: 16.6, y: 0.3, z: 10.2 }, 0.9);
    say("கொலுசு சத்தம்… பாட்டி இந்தப் பக்கம் வர்றாங்க! உடனே ஒளிஞ்சுக்கணும்.", 4.2);
    yield* wait(0.6);
    yield* act("hide: wardrobe", [22.85, 12.2], [23.78, 1.2, 12.2], 0, { expect: "hide", after: 0.3 });
    if (!P.hidden) { warn("not hidden"); return; }
    paatti({ x: 16.6, z: 10.2, lv: 0 }, { speed: 1 }, Math.PI / 2); E.wait = 1e9;
    yield* wait(0.8);
    E.wait = 0; E.hear(22.3, 11.8, 99, 0);
    say("மூச்சு கூட விடாதீங்க…", 3.5);
    yield* wait(5);
    yield* waitFor(() => E.state === "patrol" || E.state === "wait", 14);
    yield* waitFor(() => roomOf(E.pos.x, E.pos.z, E.lv) !== "study" || Math.hypot(E.pos.x - P.x, E.pos.z - P.z) > 7.5, 12, "Paatti leaving the study");
    yield* wait(1);
    park();
    say("போயிட்டாங்க… இப்போ வெளியே வரலாம்.", 3);
    yield* wait(1.2);
    k.interact(); // out of the wardrobe
    yield* wait(0.8);
  }
  function* syringeScene() {
    // she comes through the kitchen door into the dining hall; the syringe in hand
    paatti({ x: 3, z: 3.2, lv: 0 }, { speed: 0.95, vision: 1 }, 0); E.wait = 1e9; E.catchArmed = false;
    yield* wait(0.5);
    E.wait = 0; E.hear(P.x, P.z, 99, 0);
    A.anklet({ x: 3, y: 0.3, z: 4 }, 0.9);
    say("கொலுசு சத்தம்… சமையலறைப் பக்கத்துல இருந்து!", 3.5);
    let stabbed = false;
    for (let t = 0; t < 12 && !stabbed; t += dt) {
      const dx = E.pos.x - P.x, dz = E.pos.z - P.z, want = Math.atan2(-dx, -dz);
      P.yaw += angle(want - P.yaw) * Math.min(1, dt * 5);
      P.pitch += (Math.atan2(E.y + 1.3 - (P.feet + P.y), Math.max(0.5, Math.hypot(dx, dz))) - P.pitch) * Math.min(1, dt * 4);
      G.lookT = performance.now();
      setCam(); k.findTarget();
      if (k.target() && k.target().kind === "oosi" && Math.hypot(dx, dz) < 1.7) { k.interact(); stabbed = true; note("stab → Paatti down"); }
      yield;
    }
    if (!stabbed) { warn("no stab: knocked out by hand"); E.knockout(28); }
    say("ஊசியால குத்திட்டோம்! கொஞ்ச நேரம் பாட்டி எழுந்திருக்க மாட்டாங்க.", 4.5);
    yield* wait(2.6);
    hooks.push(() => { if (roomOf(P.x, P.z, P.lv) !== "dining" && Math.hypot(E.pos.x - P.x, E.pos.z - P.z) > 6) { park(); return true; } return false; });
  }

  // --- the playthrough
  const L = { sun: [12, 7.35, [12, 6.6]], moon: [15.65, 10, [16.5, 10]], star: [12, 12.65, [12, 13.4]], lotus: [8.35, 10, [7.5, 10]] };
  const T4 = W.FLOOR[1];
  function* main() {
    R.on = true;
    // title over the house at night
    document.body.classList.add("gpTitle");
    black = 1;
    yield* fade(0, 0.8);
    yield* wait(5);
    yield* fade(1, 0.6);
    document.body.classList.remove("gpTitle");
    // the menu has drawn on Math.random in real time: seed it again so every run deals the same game
    { let a = D.seed >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    k.noEnemy(true); k.start(); park();
    black = 0;
    yield* waitFor(() => G.state === "play", 8, "night 1");
    note(`run: code ${G.run.code.join("")}, lamps ${G.run.order.join(" ")}, clock ${G.run.clock.h}:${G.run.clock.m}, valli ${G.run.years.valli}, sack ${G.run.sack}`);
    yield* wait(1.6);
    say("நள்ளிரவு. பாட்டி வீட்டுக்குள்ள மாட்டிக்கிட்டோம். வாசல் கதவுல நாலு பூட்டு… எல்லாத்தையும் திறந்து தப்பிக்கணும்.", 6);
    yield* wait(1.5);

    chap("பகுதி 1", "முதல் பூட்டு");
    yield* act("intro note", [12.5, 2.1], [12.5, 0.58, 2.95], 0, { expect: "note", after: 0.3 });
    yield* read(5);
    say("பாட்டியோட அறைக்குப் போவோம்.", 3);
    yield* act("clock page", [22.6, 2.72], [23.52, 0.83, 2.72], 0, { expect: "note", after: 0.3 });
    yield* read(4.5);
    say("கடிகாரம் நின்ன நேரம் இதுதான். அந்த நேரத்தை வளவுல இருக்கிற பெரிய கடிகாரத்துல வைக்கணும்.", 5);
    yield* act("clock", [17.65, 18.4], [17.65, 1.2, 19.45], 0, { expect: "clock", after: 0.2 });
    yield* clockPuzzle();
    yield* wait(1.6);
    yield* act("small key", [17.65, 18.5], [17.65, 0.3, 19.52], 0, { expect: "item:smallkey", after: 0.6 });
    say("சின்ன சாவி கிடைச்சுது. இது விருந்தினர் அறைக்கானது.", 3.5);
    yield* act("guest door", [17.1, 17], [18, 1.1, 17], 0, { expect: "door:guest", after: 1.2 });
    yield* act("bucket", [19.05, 18.4], [19.05, 0.15, 19.35], 0, { expect: "item:bucket", after: 0.6 });
    say("ஒரு வாளி… முற்றத்துல இருக்கிற கிணத்துக்கு எடுத்துட்டுப் போவோம்.", 3.5);
    yield* act("well", [12, 8.45], [12, 0.6, 10], 0, { expect: "well", after: 0.4 });
    yield* look([12, 1.2, 10], 0.6);
    yield* waitFor(() => W.well.used, 6, "well");
    yield* wait(0.6);
    say("கிணத்துக்குள்ள இருந்து ஒரு பித்தளைச் சாவி… கூடவே ஒரு கொலுசும்!", 4);
    yield* act("brass key", [12, 8.35], [12, 0.93, 9.05], 0, { expect: "item:brasskey", after: 0.5 });
    yield* act("main: padlock", [12, 19.0], [12, 1.0, 19.88], 0, { expect: "main", after: 1.2 });
    say("முதல் பூட்டு திறந்தாச்சு! இன்னும் மூணு இருக்கு.", 3.5);
    yield* act("kolusu", [12.4, 8.2], [12.4, 0.93, 9.12], 0, { expect: "item:kolusu", after: 0.5 });
    say("இந்தக் கொலுசு வள்ளியோடது. பாட்டி அறையில இருக்கிற தொட்டில்ல வைப்போம்.", 4);
    yield* act("cradle", [23.0, 3.2], [23.0, 1.15, 4.4], 0, { expect: "cradle", after: 1.5 });
    say("ஒரு கொலுசு தொட்டில்ல. இன்னொன்னு இந்த வீட்டுக்குள்ள எங்கயோ இருக்கு.", 4);
    yield* act("note cradle", [7.2, 16.15], [6.45, 0.47, 16.15], 0, { expect: "note", after: 0.3 });
    yield* read(4.5);

    chap("பகுதி 2", "கொல்லைப்புறமும் மொட்டை மாடியும்");
    say("சமையலறைக் கதவு வழியா கொல்லைப்புறத்துக்குப் போவோம்.", 3.5);
    yield* walk(6.5, 1.0, 0);
    yield* walk(8.5, -3.5, 0);
    yield* act("note night", [16.1, -8.5], [16.1, 0.52, -9.45], 0, { expect: "note", after: 0.3 });
    yield* read(4.5);
    yield* act("matchbox", [17.95, -8.7], [17.95, 1.05, -9.7], 0, { expect: "item:matchbox", after: 0.6 });
    say("தீப்பெட்டி! விளக்கு ஏத்த இது தேவைப்படும். இப்போ மாடிக்கு.", 3.5);
    yield* walk(21.4, -0.75, 1);
    yield* look([10, T4 + 1.6, 6], 1.1);
    yield* wait(0.8);
    say("மொட்டை மாடி. நிலா வெளிச்சத்துல தென்னை மரம், மழை…", 3.5);
    yield* act("clue 2: tank", [17.9, 3.2], [19.02, 5.05, 3.2], 1, { expect: "clue", after: 1.2 });
    say("தொட்டியில ஒரு எண் — வாசல் code-ஓட இரண்டாவது எண்.", 3.5);
    yield* act("note valli", [4.35, 18.0], [4.35, 4.52, 19.0], 1, { expect: "note", after: 0.3 });
    yield* read(5);

    chap("பகுதி 3", "நாலு விளக்கு");
    yield* walk(12.5, -0.75, 0);
    yield* act("lamps note", [22.6, 8.75], [23.45, 0.8, 8.75], 0, { expect: "note", after: 0.3 });
    yield* read(5);
    yield* hideScene();
    say("முற்றத்துல நாலு விளக்கு. கடிதத்துல சொன்ன வரிசையில ஏத்தணும்.", 4);
    for (const s of G.run.order) { const [x, z, at] = L[s]; yield* act("lamp " + s, at, [x, 0.9, z], 0, { expect: "lamp", after: 0.7 }); }
    yield* waitFor(() => !W.doorById.pooja.locked, 3, "pooja door");
    yield* look([16.5, 1.2, 6], 0.6);
    say("நாலும் எரியுது… பூஜை அறைக் கதவு தானா திறந்துச்சு!", 3.5);
    yield* wait(1.2);
    yield* act("almirah key", [16.5, 2.3], [16.5, 0.38, 1.35], 0, { expect: "item:almirahkey", after: 0.5 });
    yield* act("clue 4: kolam", [16.5, 4.7], [16.5, 0.01, 3.4], 0, { expect: "clue", after: 1.2 });
    say("கோலத்துக்குள்ள நாலாவது எண். இந்தச் சாவி குளியலறை அலமாரிக்கு.", 4);
    yield* act("bath almirah", [1.6, 16.2], [0.7, 1.0, 16.2], 0, { expect: "almirah", after: 1.4 });
    yield* act("bolt cutter", [1.5, 16.2], [0.38, 0.985, 16.2], 0, { expect: "item:boltcutter", after: 0.5 });
    say("Bolt cutter — வாசல் சங்கிலிக்கு.", 3);
    yield* act("main: chain", [12, 19.0], [12, 1.4, 19.88], 0, { expect: "main", after: 1.2 });
    say("இரண்டாவது பூட்டு — சங்கிலி வெட்டியாச்சு!", 3.2);

    chap("பகுதி 4", "நிலவறை");
    yield* walk(0.9, 6.55, 0);
    yield* walk(4.2, 9.3, -1);
    yield* act("clue 3: cellar", [4.6, 9.3], [5.885, -0.9, 9.3], -1, { expect: "clue", after: 1.2 });
    say("நிலவறைச் சுவத்துல மூணாவது எண்.", 3);
    yield* act("note search", [2.55, 12.6], [2.55, -2.48, 13.55], -1, { expect: "note", after: 0.3 });
    yield* read(4.5);
    yield* act("syringe", [3.55, 8.3], [3.55, -2.24, 7.1], -1, { expect: "item:oosi", after: 0.6 });
    say("ஊசி! பாட்டி கிட்ட வந்தா இதால குத்தலாம்.", 3.2);
    yield* walk(3.0, 10.2, 0);
    yield* syringeScene();
    yield* act("pallanguzhi", [8.2, 15.5], [8.2, 0.16, 14.55], 0, { expect: "pall", after: 0.2 });
    say("பல்லாங்குழி. விளக்கு வரிசைப்படி ஒவ்வொரு குழியிலும் விதை வைக்கணும்.", 4.5);
    yield* pallPuzzle();
    yield* waitFor(() => W.pall.open >= 1, 4, "pall drawer");
    yield* wait(1.2);
    yield* act("wing key", [8.25, 15.55], [8.25, 0.06, 14.73], 0, { expect: "item:wingkey", after: 0.5 });
    yield* act("clue 1: drawer", [8.2, 15.55], [8.2, 0.06, 14.8], 0, { expect: "clue", after: 1.2 });
    say("முதல் எண்ணும் கிடைச்சுது, கூடவே ஒரு பழைய இரும்புச் சாவி. இப்போ நாலு எண்ணும் கையில!", 4.5);
    yield* act("main: number lock", [12, 19.0], [12.3, 1.8, 19.88], 0, { expect: "main", after: 0.2 });
    yield* keypad(G.run.code.join(""));
    yield* wait(1);
    say("மூணாவது பூட்டும் திறந்தாச்சு! கடைசி — பெரிய தாழ்ப்பாள். அதுக்கு ஒரு பெரிய சாவி வேணும்.", 4.5);

    chap("பகுதி 5", "இரண்டாம் கட்டு");
    yield* act("wing door", [23.0, 10], [24, 1.1, 10], 0, { expect: "door:wing", after: 1.5 });
    say("வீட்டோட இரண்டாம் கட்டு. பெரிய சாவி இங்கேதான் எங்கயோ.", 3.5);
    yield* act("sickle", [42.6, 6.4], [42.55, 0.52, 5.5], 0, { expect: "item:sickle", after: 0.5 });
    say("அரிவாள். நெல் களஞ்சியக் கதவுல கட்டியிருக்கிற கயிறை வெட்டலாம்.", 3.5);
    yield* act("granary rope", [26, 5.9], [26, 1.1, 5], 0, { expect: "door:granary", after: 1.2 });
    yield* act("fuse 1", [28.3, 4.1], [28.75, 1.36, 4.82], 0, { expect: "item:fuse", after: 0.5 });
    say("ஒரு fuse. கல்யாணக் கூடத்துல fuse box இருக்கு — மூணு fuse போட்டா current வரும்.", 4.5);
    yield* act("fuse box +1", [25.0, 16.4], [24.16, 1.65, 16.4], 0, { expect: "fusebox", after: 1 });
    yield* walk(31.9, 19.2, 1);
    yield* act("ledger", [29.3, 3.95], [30.1, T4 + 0.76, 3.95], 1, { expect: "note", after: 0.3 });
    yield* read(5.5);
    say("தாத்தாவோட கணக்குப் புத்தகம். வள்ளி பிறந்த வருஷம் இதுல தமிழ் எண்ணுல இருக்கு.", 4.5);
    yield* act("portraits note", [43.8, 11.0], [43.85, T4 + 0.76, 10.1], 1, { expect: "note", after: 0.3 });
    yield* read(4.5);
    yield* act("portraits", [33.5, 17.6], [34.885, T4 + 1.85, 17.6], 1, { expect: "portraits", after: 0.2 });
    say("குடும்பப் படங்கள். பெரியவங்கள்ல இருந்து சின்னவங்க வரைக்கும் வரிசையா மாட்டணும்.", 4.5);
    yield* portraitPuzzle();
    yield* wait(1.2);
    yield* act("fuse 2", [34.0, 17.62], [34.78, T4 + 0.76, 17.62], 1, { expect: "item:fuse", after: 0.5 });
    yield* walk(26.1, 19.2, 0);
    yield* act("fuse box +2", [25.0, 16.4], [24.16, 1.65, 16.4], 0, { expect: "fusebox", after: 0.8 });
    yield* walk(31.9, 19.2, 1);
    yield* act("valli door", [34.5, 5.9], [34.5, T4 + 1.1, 5], 1, { expect: "door:valli", after: 0.2 });
    say("வள்ளியோட அறை. மூணு எழுத்துப் பூட்டு… அவ பேரு: வ · ள் · ளி.", 4.5);
    yield* letterPuzzle();
    yield* wait(1.4);
    yield* act("valli note", [33.6, 3.5], [33.6, T4 + 0.51, 4.3], 1, { expect: "note", after: 0.3 });
    yield* read(5);
    yield* act("fuse 3", [32.1, 1.4], [32.1, T4 + 0.43, 0.5], 1, { expect: "item:fuse", after: 0.5 });
    yield* walk(26.1, 19.2, 0);
    yield* act("fuse box +3", [25.0, 16.4], [24.16, 1.65, 16.4], 0, { expect: "fusebox", after: 0.8 });
    yield* act("main switch", [25.0, 16.4], [24.16, 1.65, 16.4], 0, { expect: "fusebox", after: 2.2 });
    say("Current வந்துடுச்சு!", 2.6);
    yield* act("chart", [32.2, 2.6], [31.13, 1.65, 2.6], 0, { expect: "chart", after: 0.3 });
    yield* read(4.5);
    say("தமிழ் எண் அட்டவணை — இதை வச்சு வருஷத்தைப் படிக்கலாம்.", 3.5);
    yield* act("scale", [32.0, 3.3], [32.0, 0.95, 4.2], 0, { expect: "scale", after: 0.2 });
    say("தராசு. நெல் மூட்டையோட எடைக்குச் சரியா எடைக்கல் வைக்கணும்.", 4);
    yield* scalePuzzle();
    yield* wait(0.8);
    yield* act("safe knob", [32.0, 3.25], [32.0, 0.72, 4.03], 0, { expect: "item:safeknob", after: 0.5 });
    yield* act("fit knob", [37.3, 1.3], [38.17, 0.8, 1.3], 0, { expect: "safe", after: 0.8 });
    yield* act("safe code", [37.3, 1.3], [38.17, 0.8, 1.3], 0, { expect: "safe", after: 0.2 });
    say("பெட்டகத்தோட code — வள்ளி பிறந்த வருஷம்.", 3.5);
    yield* keypad(G.run.years.valli);
    yield* waitFor(() => G.overlay === "note", 4, "safe letter");
    yield* read(5);
    yield* look([38.55, 0.76, 1.3], 0.5);
    say("பெரிய சாவி! ஆனா முதல்ல வள்ளியோட இரண்டாவது கொலுசைத் தேடுவோம்.", 4);
    yield* wait(1.4);

    chap("பகுதி 6", "வள்ளியின் கொலுசு");
    yield* act("motor", [39.7, 3.5], [39.7, 0.3, 4.4], 0, { expect: "motor", after: 1.2 });
    say("Motor ஓடுது… முற்றத்துல இருக்கிற தொட்டி நிரம்பட்டும்.", 3.5);
    yield* walk(37.9, 8.65, 0);
    yield* look([37.9, 0.9, 10], 0.5);
    yield* wait(2.5);
    yield* fade(1, 0.35); R.skip = true;
    yield* waitFor(() => W.wing.tankFull, 30, "tank");
    yield* wait(0.5); R.skip = false; yield* fade(0, 0.4);
    yield* act("tank box", [37.9, 8.65], [37.9, 0.9, 10], 0, { expect: "tank", after: 0.2 });
    yield* waitFor(() => G.overlay === "note", 3, "tank letter");
    yield* read(5);
    yield* act("kolusu 2", [37.55, 8.65], [37.55, 1.06, 9.37], 0, { expect: "item:kolusu2", after: 0.6 });
    say("இரண்டாவது கொலுசு! தொட்டிலுக்கு எடுத்துட்டுப் போவோம்.", 3.5);
    yield* act("cradle 2", [23.0, 3.2], [23.0, 1.15, 4.4], 0, { expect: "cradle", after: 2.2, trip: true });
    say("ரெண்டு கொலுசும் தொட்டில்ல. வள்ளி அமைதியானா… பாட்டியும் அமைதி. இதுதான் true ending வழி.", 5);
    yield* wait(1.5);

    chap("கடைசி", "தப்பிச்சு ஓடு!");
    yield* act("big key", [37.4, 1.3], [38.55, 0.76, 1.3], 0, { expect: "item:bigkey", after: 0.6, trip: true });
    yield* act("main: crossbar", [12, 19.0], [12, 0.72, 19.85], 0, { expect: "main", after: 1.6, trip: true });
    say("நாலு பூட்டும் திறந்தாச்சு!", 2.8);
    yield* act("main: open", [12, 19.0], [12, 1.2, 19.88], 0, { expect: "main", after: 1.8 });
    say("கதவு திறந்துடுச்சு… ஓடுங்க!", 2.6);
    yield* walk(12, 28.4, 0, { run: true, direct: true });
    yield* waitFor(() => G.state === "end", 8, "the end screen");
    note("end: " + $("endEyebrow").textContent + " | " + $("endTitle").textContent);
    yield* wait(7);
    yield* fade(0.62, 0.8);
    endOn = R.vt;
    yield* wait(6);
    yield* fade(1, 1);
  }

  let endOn = -1;
  const plan = main();
  let done = false, sent = 0;
  window.__gp = {
    warns: () => warns,
    frame() {
      if (!done) { const r = plan.next(); if (r.done) done = true; }
      for (let i = hooks.length - 1; i >= 0; i--) if (hooks[i]()) hooks.splice(i, 1);
      const t = R.vt;
      blk.style.opacity = black;
      titleEl.style.opacity = document.body.classList.contains("gpTitle") ? Math.min(1, ease((t - 0.6) / 0.8)) : 0;
      endEl.style.opacity = endOn >= 0 ? ease((t - endOn) / 0.8) : 0;
      if (caption && t < caption.t1 + 0.3) { capText.textContent = caption.text; capEl.style.opacity = fadeIn(t, caption.t0, caption.t1, 0.25); } else capEl.style.opacity = 0;
      chapEl.style.opacity = chapter && t < chapter.t1 + 0.5 ? fadeIn(t, chapter.t0, chapter.t1, 0.45) : 0;
      const puzzle = G.overlay && G.overlay !== "pause";
      if (!puzzle) { cx = W0(); cy = H0(); }
      cur.style.opacity = puzzle ? 1 : 0;
      cur.style.transform = `translate(${cx - 4}px, ${cy - 3}px)`;
      const cap = !R.skip;
      window.__vt.step(1000 / D.fps);
      if (cap) R.vt += dt;
      const out = notes.slice(sent); sent = notes.length;
      return { cap, done, vt: R.vt, notes: out };
    },
  };
}

/** Replays the sound log on the game's OfflineAudioContext, with its music box and rain; keeps the PCM in the page. */
async function soundtrack(seconds) {
  const { ctx, rate, resume, musTick } = window.__off, A = window.__kolusu.K.Audio, R = window.__rec, orig = R.orig;
  const q = 128 / rate, groups = new Map();
  const put = (time, item) => { const at = Math.max(q, Math.round(time / q) * q); if (!groups.has(at)) groups.set(at, []); groups.get(at).push(item); };
  for (const e of R.log) if (e[0] < seconds) put(e[0], e);
  for (let t = 0.05; t < seconds; t += 0.1) put(t, [t, "_tick", []]);
  for (const [at, list] of [...groups].sort((a, b) => a[0] - b[0])) {
    ctx.suspend(at).then(() => {
      for (const [, name, args] of list) {
        try { if (name === "_tick") { musTick && musTick(); orig.update(); } else orig[name](...args); } catch (e) { /* a sound that can't replay */ }
      }
      resume();
    });
  }
  for (const name in orig) A[name] = orig[name];
  const buf = await ctx.startRendering();
  const n = Math.min(buf.length, Math.floor(seconds * rate)), L = buf.getChannelData(0), Rt = buf.getChannelData(1), pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { pcm[i * 2] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, Rt[i])) * 32767; }
  window.__pcm = pcm;
  return pcm.byteLength;
}
const PCM_CHUNK = (off, len) => `(() => { const b = new Uint8Array(window.__pcm.buffer, ${off}, ${len}); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); })()`;

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
function ffmpeg(args) {
  const r = spawnSync(FFMPEG, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ").slice(0, 200)}`);
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

if (spawnSync(FFMPEG, ["-version"]).status !== 0) { console.error(`ffmpeg not found (${FFMPEG}) — set FFMPEG=path/to/ffmpeg`); process.exit(1); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), "patti-gameplay-"));
const stills = process.env.STILLS ?? work;
let chrome = null, enc = null;
try {
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(work, "profile")}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null); }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: SEEDED(SEED) });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_HOOK(CAP + 2) });
  await page.send("Page.navigate", { url: GAME });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!(window.__kolusu && __kolusu.G.state === "menu")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load");
    await sleep(500);
  }
  await page.evaluate(`(${logger})()`);
  await page.evaluate(`Promise.all(['900 40px Catamaran', '40px Creepster', '30px "Special Elite"', '600 30px "Hind Madurai"'].map((f) => document.fonts.load(f, "பாட்டி வீடு PATTI")))`);
  await sleep(3000);
  await page.evaluate("__vt.start()");
  // the caption sits above the game's own prompt and toast
  await page.evaluate(`(${director})(${JSON.stringify({ fps: FPS, capBottom: 150, seed: SEED })})`);

  if (!PREVIEW) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    enc = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", String(FPS * 2), path.join(work, "video.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  }
  const every = PREVIEW ? FPS * 2 : 1, sheet = [];
  const snaps = (process.env.SNAPS ?? "").split(",").filter(Boolean).map(Number).sort((a, b) => a - b);
  let captured = 0, sheets = 0, vt = 0;
  const flush = async () => {
    if (!sheet.length) return;
    const cols = 8, tw = 320, th = 180;
    const comp = await Promise.all(sheet.map(async ({ buf, t }, i) => [
      { input: await sharp(buf).resize(tw, th).toBuffer(), left: (i % cols) * tw, top: Math.floor(i / cols) * th },
      { input: Buffer.from(`<svg width="64" height="22"><rect width="64" height="22" fill="#000" opacity=".7"/><text x="6" y="16" font-family="Consolas" font-size="15" fill="#ffd27a">${mmss(t)}</text></svg>`), left: (i % cols) * tw, top: Math.floor(i / cols) * th },
    ])).then((x) => x.flat());
    const out = path.join(stills, `gameplay-sheet-${String(++sheets).padStart(2, "0")}.jpg`);
    await sharp({ create: { width: cols * tw, height: Math.ceil(sheet.length / cols) * th, channels: 3, background: "#000" } }).composite(comp).jpeg({ quality: 80 }).toFile(out);
    console.log("  sheet:", out);
    sheet.length = 0;
  };
  console.log(`Recording (seed ${SEED}, ${W * DPR}×${H * DPR}, ${FPS} fps)…`);
  const t0 = Date.now();
  for (let n = 0; ; n++) {
    const r = await page.evaluate("__gp.frame()");
    for (const s of r.notes) console.log("  " + s);
    if (r.cap) {
      if (PREVIEW && snaps.length && r.vt >= snaps[0]) {
        const at = snaps.shift(), { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 88, fromSurface: true, clip: { x: 0, y: 0, width: W, height: H, scale: 3 } });
        const out = path.join(stills, `gameplay-snap-${String(Math.round(at)).padStart(3, "0")}.jpg`);
        fs.writeFileSync(out, Buffer.from(data, "base64"));
        console.log("  snap:", out);
      }
      if (captured % every === 0) {
        const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: PREVIEW ? 80 : 92, fromSurface: true });
        const buf = Buffer.from(data, "base64");
        if (PREVIEW) { sheet.push({ buf, t: vt }); if (sheet.length >= 80) await flush(); }
        else if (!enc.stdin.write(buf)) await new Promise((res) => enc.stdin.once("drain", res));
      }
      captured++;
      vt = r.vt;
      if (captured % (FPS * 30) === 0) console.log(`  — ${mmss(vt)} of video, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    }
    if (r.done) break;
    if (vt > CAP) throw new Error(`the run passed ${CAP} s — raise CAP or shorten the plan`);
  }
  if (PREVIEW) await flush();
  const warns = await page.evaluate("__gp.warns()");
  console.log(`Run: ${mmss(vt)} (${vt.toFixed(1)} s), ${captured} frames, ${warns.length} warning(s)${warns.length ? ":\n  " + warns.join("\n  ") : ""}`);

  if (!PREVIEW) {
    enc.stdin.end();
    await new Promise((res, rej) => enc.on("close", (c) => (c === 0 ? res() : rej(new Error("the video encoder failed")))));
    enc = null;
    console.log("Soundtrack…");
    const bytes = await page.evaluate(`(${soundtrack})(${vt + 0.2})`);
    const pcmFile = path.join(work, "game.pcm"), fd = fs.openSync(pcmFile, "w");
    for (let off = 0; off < bytes; off += 6 << 20) fs.writeSync(fd, Buffer.from(await page.evaluate(PCM_CHUNK(off, Math.min(6 << 20, bytes - off))), "base64"));
    fs.closeSync(fd);
    page.close();
    console.log("Mixing and muxing…");
    const mix = path.join(work, "mix.wav");
    ffmpeg(["-f", "s16le", "-ar", "44100", "-ac", "2", "-i", pcmFile, "-af", `volume=2.0,afade=t=in:d=0.6,afade=t=out:st=${(vt - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000`, "-t", vt.toFixed(3), mix]);
    ffmpeg(["-i", path.join(work, "video.mp4"), "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]);
    console.log(`${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB, ${mmss(vt)}`);
  }
} finally {
  if (enc) enc.kill();
  chrome?.kill();
  await sleep(800);
  try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch (e) { console.warn("could not remove", work); }
}
