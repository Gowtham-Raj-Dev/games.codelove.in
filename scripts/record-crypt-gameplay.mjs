#!/usr/bin/env node
/**
 * Records a full Crypt Knight playthrough — all five worlds, all fifty stages, every king — as a 16:9 YouTube
 * video at 2× speed, with the game's own music (kept soft) and sound effects. Each world is played with a
 * different hero from the shop:
 *   OUT/video/crypt-knight-full-gameplay.mp4    1920×1080, 30 fps
 *   OUT/video/crypt-knight-full-gameplay.json   when each world and stage starts and ends, and its stars (for Shorts)
 *
 *   npx next dev -p 3005                          (in another terminal; 3000 is often another project's)
 *   node scripts/record-crypt-gameplay.mjs
 *   SIM=1 …   plays the run without filming it (nothing is drawn) and prints how each stage went — to check the bot
 *
 * The same method as the Saucer Siege gameplay (scripts/record-saucer-gameplay.mjs): headless Chrome on a virtual
 * clock, one screenshot per frame straight into ffmpeg, the sound logged and made afterwards on the game's own synth.
 * At 2× the clock steps twice per frame and only the second step is drawn. A visible cursor works the game's own
 * menus (Play, the stage map, the world chips, Next stage).
 *
 * The fighting is the game's trailer autopilot replaced by a better player (BOT below, on window.__cryptKnight from
 * the dev server): it rolls out of heavy and unblockable attacks, blocks the rest and the bolts, keeps off rising
 * spikes, drinks potions, goes for the casters and spins into crowds. Two helpers keep a long run going: a hit can't
 * take the hero below 20% health (damage and stars still show), and the corner clutter's colliders are trimmed so a
 * knockback can't shut the hero in behind them (the props look the same).
 *
 * Env: BASE (default http://localhost:3005), CHROME, FFMPEG (default: the copy in %LOCALAPPDATA%/kolusu-promo-tools),
 * OUT (default ../z-video-files/games.codelove.in/crypt-knight), SEED, FPS (default 30), SPEED (default 2),
 * WORLDS (default 0,1,2,3,4), MUSIC (music level in the mix), STOP (a test: stop after this many seconds of video).
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
const OUT = process.env.OUT ?? path.resolve(ROOT, "..", "z-video-files", "games.codelove.in", "crypt-knight");
const VIDEO = path.join(OUT, "video", "crypt-knight-full-gameplay.mp4");
const SIM = !!process.env.SIM;
const PORT = 9373;
/** Layout size and the pixel ratio that makes the capture 1920×1080. */
const W = 1280;
const H = 720;
const DPR = 1.5;
const FPS = Number(process.env.FPS ?? 30);
const SPEED = Number(process.env.SPEED ?? 2);
const SEED = Number(process.env.SEED ?? 7);
const STOP = Number(process.env.STOP ?? Infinity);
const MUSIC = Number(process.env.MUSIC ?? 0.5);
const PLAY_WORLDS = (process.env.WORLDS ?? "0,1,2,3,4").split(",").map(Number);
/** The hero for each world, in turn. */
const HERO_ORDER = ["knight", "barbarian", "rogue", "mage", "shadow"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The shop's worlds and heroes, bundled from the source. */
async function content() {
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "src/components/games/crypt-knight/content.ts")], bundle: true, format: "esm", platform: "node", write: false });
  const tmp = path.join(os.tmpdir(), `crypt-content-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
const { WORLDS, HEROES } = await content();

// --- Page side: set up before the game loads -------------------------------------------------------

/** Virtual clock: requestAnimationFrame and performance.now only move when the recorder steps them. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = { start() { on = true; now = realNow(); }, step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); } };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
})()`;

// --- The player (put on the game in the page) ------------------------------------------------------

/** A hit can't take the hero below `floor` of full health (it still shows, and counts for the stars). */
function NET(g, floor) {
  const hit = g.hitKnight.bind(g);
  g.hitKnight = (dmg, fx, fz, o) => {
    const before = g.hp;
    g.hp += 1e6;
    const r = hit(dmg, fx, fz, o);
    const taken = before + 1e6 - g.hp;
    g.hp = Math.max(Math.min(before, g.stats.maxHp * floor), before - taken);
    return r;
  };
}

/**
 * Corner clutter's colliders reach the walls, so a knockback into the gap behind it shuts the hero in for good.
 * After every room is built they are trimmed to leave a way out along the walls.
 */
function CORNERS(g) {
  const build = g.room.build.bind(g.room);
  g.room.build = (plan) => {
    const r = build(plan);
    const { hw, hd } = g.room;
    for (const c of g.room.colliders) if (Math.abs(c.x) > hw - 2.6 && Math.abs(c.z) > hd - 2.8) c.r = Math.min(c.r, 0.6);
    return r;
  };
}

/** Replaces the engine's drive(): runs with the game as `this`. */
function BOT() {
  const k = this.k;
  this.stick.x = this.stick.y = 0;
  this.touchBlock = false;
  const go = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; this.stick.x = dx / l; this.stick.y = -dz / l; };
  if (this.stage === "exit") return go(-k.x, -this.room.hd - 1.5 - k.z);
  const P = { parry: 0.2, safe: 3.2, potion: 0.5, roll: 0.38, spike: 2.5 };
  // Pinned in a pocket for four seconds without hurting anyone: out along the wall, then to the middle of the room.
  const health = this.enemies.reduce((s, e) => s + (e.alive ? e.hp : 0), 0) + this.kills * 1e4;
  const E = (window.__botE ??= { x: k.x, z: k.z, t: this.elapsed, h: health, until: 0, dir: 0 });
  if (E.until > this.elapsed) {
    const { hw, hd } = this.room;
    if (Math.abs(k.x) > hw - 3 && Math.abs(k.z) > hd - 3) return go(E.dir * -Math.sign(k.x), E.dir ? 0 : -Math.sign(k.z));
    return go(-k.x, -k.z);
  }
  if (this.elapsed - E.t > 4) {
    if (Math.hypot(k.x - E.x, k.z - E.z) < 1.5 && Math.abs(health - E.h) < 1 && Math.hypot(k.x, k.z) > 5) {
      E.until = this.elapsed + 2.2;
      E.dir = E.dir === 1 ? 0 : 1;
    }
    E.x = k.x; E.z = k.z; E.t = this.elapsed; E.h = health;
  }

  // Spikes about to rise (or up) under the hero: step off the shorter way.
  const spikeAt = (x, z) => this.room.spikes.find((s) => s.state !== "down" && Math.abs(x - s.x) < P.spike && Math.abs(z - s.z) < P.spike);
  const under = spikeAt(k.x, k.z);
  if (under) {
    const ox = k.x - under.x, oz = k.z - under.z;
    if (Math.abs(ox) > Math.abs(oz)) go(Math.sign(ox) || 1, 0);
    else go(0, Math.sign(oz) || 1);
    if (under.state === "warn" && k.rollCd <= 0 && under.t > under.period - 0.85) this.rollBuf = 0.25;
    return;
  }

  let threat = null, tBest = Infinity, target = null, best = Infinity, near = 0, close = 0;
  for (const e of this.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - k.x, e.z - k.z);
    if (e.hittable) {
      if (d < 4) near++;
      if (d < best) { best = d; target = e; }
    }
    if (d < P.safe) close++;
    const a = e.attack;
    if (a && (e.state === "windup" || e.state === "strike") && a.kind !== "summon" && a.kind !== "bolt") {
      const reach = a.kind === "leap" ? (a.maxDist ?? 8) + 1 : a.kind === "nova" ? 5 : a.range + 1.6;
      if (d < reach && d < tBest) { tBest = d; threat = e; }
    }
  }
  let bolt = null;
  for (const b of this.bolts) {
    if (!b.active || b.reflected) continue;
    const dx = k.x - b.x, dz = k.z - b.z, d = Math.hypot(dx, dz) || 1;
    if (d < 6 && (dx * b.dx + dz * b.dz) / (d * (Math.hypot(b.dx, b.dz) || 1)) > 0.6 && (!bolt || d < bolt.d)) bolt = { d, b };
  }

  if (threat) {
    const a = threat.attack;
    const left = threat.state === "windup" ? a.windup * (threat.phase2 ? 0.82 : 1) - threat.t : 0;
    const away = () => go(k.x - threat.x, k.z - threat.z);
    if (!a.blockable || a.heavy || a.kind === "leap") {
      // Too big to stand in: roll out (i-frames), or walk away while the roll recharges.
      if (left < P.roll) {
        away();
        if (k.rollCd <= 0) this.rollBuf = 0.25;
        return;
      }
      if (left < 0.9) return away();
    } else if (left < P.parry) {
      // Up just before it lands: often a parry.
      this.touchBlock = true;
      return;
    }
  }
  if (bolt && bolt.d < 4.5) { this.touchBlock = true; return; }
  if (this.hp / this.stats.maxHp < P.potion && this.potions > 0 && close === 0 && k.state === "idle") { this.potionBuf = 0.25; return; }
  if (!target) return;
  // Nothing in sword reach: the casters first, they keep the bolts coming.
  if (best > 4) {
    let caster = null, cBest = Infinity;
    for (const e of this.enemies) {
      if (!e.hittable || (e.kind !== "mage" && e.kind !== "archer")) continue;
      const d = Math.hypot(e.x - k.x, e.z - k.z);
      if (d < cBest) { cBest = d; caster = e; }
    }
    if (caster) { target = caster; best = cBest; }
  }
  const dx = target.x - k.x, dz = target.z - k.z;
  if (best > target.radius + 1.9) {
    // Stuck on a pillar (hardly moved for a second while walking): sideways for a bit.
    const S = (window.__botS ??= { x: k.x, z: k.z, t: 0, side: 0, dir: 1 });
    const now = this.elapsed;
    if (S.side > now) return go(-dz * S.dir + dx * 0.3, dx * S.dir + dz * 0.3);
    if (now - S.t > 1) {
      if (Math.hypot(k.x - S.x, k.z - S.z) < 0.5 && k.state === "idle") { S.side = now + 0.9; S.dir = -S.dir; }
      S.x = k.x; S.z = k.z; S.t = now;
    }
    // Round a rising spike tile rather than across it.
    const sx = k.x + (dx / best) * 1.2, sz = k.z + (dz / best) * 1.2;
    if (spikeAt(sx, sz)) go(-dz, dx);
    else go(dx, dz);
  } else if (!(bolt && bolt.d < 3.5)) {
    this.attackBuf = 0.35;
    this.aimYaw = Math.atan2(dx, dz);
  }
  if (this.charge >= 1 && (near >= 2 || target.kind === "boss") && best < 3.5) this.spinBuf = 0.25;
}

/** Every sound call and music change is logged with the video time it happened at; nothing plays while filming. */
function logger(owned) {
  const { game: g, audio, music, records } = window.__cryptKnight;
  const R = (window.__rec = { vt: 0, sfx: [], music: [[0, 0]], orig: {}, level: 0 });
  audio.unlock = () => {};
  const proto = Object.getPrototypeOf(g.sfx);
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor" || typeof proto[name] !== "function") continue;
    R.orig[name] = proto[name];
    g.sfx[name] = (...args) => { R.sfx.push([R.vt, name, args]); };
  }
  // The music's intensity is set every frame: only the changes are kept.
  R.setIntensity = music.setIntensity.bind(music);
  music.setIntensity = (v) => { if (v !== R.level) { R.level = v; R.music.push([R.vt, v]); } R.setIntensity(v); };
  const play = music.play.bind(music);
  music.play = (song, intensity, o) => { if (intensity !== undefined && intensity !== R.level) { R.level = intensity; R.music.push([R.vt, intensity]); } return play(song, intensity, o); };
  // Every world and hero owned (so the stage map lets the run move on), past the first-run hints; steady resolution.
  records.set({ owned, runs: 5 });
  g.adaptResolution = () => {};
}

/** The run, the overlays and the cursor. Runs in the page; one plan step per frame. */
function director(D) {
  const { game: g, records } = window.__cryptKnight, R = window.__rec;
  const dt = 1 / D.fps;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const warns = [], notes = [], events = [];
  const note = (s) => notes.push(`${R.vt.toFixed(1).padStart(7)} s  ${s}`);
  const warn = (s) => { warns.push(`${R.vt.toFixed(1)} s  ${s}`); note("!! " + s); };
  const event = (type, o = {}) => events.push({ t: Math.round(R.vt * 100) / 100, type, ...o });
  if (D.sim) g.renderer.render = () => {};
  const realRender = g.renderer.render;

  // The player.
  g.autopilot = true;
  g.drive = BOT;
  NET(g, 0.2);
  CORNERS(g);
  let last = null;
  const over = g.events.over;
  g.events.over = (s) => { last = s; over(s); };

  // --- overlays: title and end cards, the world card, the stage chip, the cursor
  const font = getComputedStyle(document.body).getPropertyValue("--game-display").trim() || "system-ui";
  const st = document.createElement("style");
  st.textContent = `nextjs-portal{visibility:hidden!important}
  #ck{position:fixed;inset:0;z-index:99999;pointer-events:none;color:#fff;font-family:${font},system-ui,sans-serif}
  #ck .blk{position:absolute;inset:0;background:#000;opacity:0}
  #ck .scrim{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(30,8,8,.78),rgba(6,3,8,.95));opacity:0}
  #ck .card{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;opacity:0}
  #ck .kick{display:inline-block;padding:8px 20px 7px;border-radius:999px;background:linear-gradient(180deg,#f87171,#b91c1c);font-weight:800;font-size:19px;letter-spacing:.2em;box-shadow:0 0 26px rgba(239,68,68,.6)}
  #ck .big{margin-top:18px;font-weight:900;font-size:100px;line-height:1;letter-spacing:.03em;color:#fff;text-shadow:0 0 30px #b91c1c,0 5px 0 #450a0a,0 0 60px rgba(0,0,0,.8)}
  #ck .sub{margin-top:18px;font-weight:700;font-size:26px;color:#fde68a;text-shadow:0 2px 8px #000}
  #ck .row{margin-top:26px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;padding:0 40px}
  #ck .row span{padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);font-weight:700;font-size:17px}
  #ck .play{display:inline-block;margin-top:30px;padding:16px 38px 14px;border-radius:999px;background:linear-gradient(180deg,#fde047,#f59e0b);color:#3b1d02;font-weight:900;font-size:34px;letter-spacing:.08em;box-shadow:0 7px 0 #92400e,0 0 34px rgba(250,204,21,.55)}
  #ck .url{margin-top:24px;font-weight:800;font-size:36px;color:#fff;text-shadow:0 0 18px #b91c1c}
  #ck .tip{margin-top:12px;font-weight:600;font-size:21px;color:#fecaca}
  #ck .wcard{position:absolute;left:50%;top:13%;transform:translateX(-50%);text-align:center;opacity:0;white-space:nowrap}
  #ck .wcard .w1{font-weight:800;font-size:18px;letter-spacing:.25em;color:#fecaca;text-shadow:0 2px 8px #000}
  #ck .wcard .w2{margin-top:8px;font-weight:900;font-size:58px;line-height:1;text-shadow:0 0 24px #b91c1c,0 4px 0 #450a0a}
  #ck .wcard .w3{margin-top:12px;display:inline-block;padding:7px 16px;border-radius:12px;background:rgba(10,6,14,.75);border:1px solid rgba(253,230,138,.5);font-weight:700;font-size:19px;color:#fde68a}
  #ck .chip{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:7px 16px 6px;border-radius:12px;background:rgba(14,8,18,.72);border:1px solid rgba(252,165,165,.45);font-weight:800;font-size:15px;letter-spacing:.12em;white-space:nowrap;opacity:0}
  #ck .chip b{color:#fde68a}
  #ck .cur{position:absolute;left:0;top:0;width:30px;height:30px;opacity:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,.8))}
  #ck .cur svg{width:100%;height:100%;transform-origin:4px 3px}
  #ck .cur.down svg{transform:scale(.82)}`;
  document.head.appendChild(st);
  const ck = document.createElement("div");
  ck.id = "ck";
  const chips = D.play.map((w, n) => `<span>${D.worlds[w].name} · ${D.heroes[n].name}</span>`).join("");
  ck.innerHTML = '<div class="scrim"></div>'
    + `<div class="card" id="ckTitle"><div class="kick">FULL GAMEPLAY · ${D.play.length} WORLDS · ${D.play.length * 10} STAGES</div><div class="big">CRYPT KNIGHT</div><div class="sub">3D Action · ${D.speed}× speed · every stage, every king</div><div class="row">${chips}</div></div>`
    + `<div class="card" id="ckEnd"><div class="big">CRYPT KNIGHT</div><div class="play">PLAY FREE</div><div class="url">games.codelove.in</div><div class="tip">Which king was the hardest for you? Comment below!</div></div>`
    + '<div class="wcard"><div class="w1"></div><div class="w2"></div><div class="w3"></div></div>'
    + '<div class="chip"></div><div class="blk"></div>'
    + '<div class="cur"><svg viewBox="0 0 24 24"><path d="M4 3l14 8.5-6.2 1.3 3.6 6.9-2.6 1.3-3.6-6.9L4 18.5z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></div>';
  document.body.appendChild(ck);
  const $ = (s) => ck.querySelector(s);
  const blk = $(".blk"), scrim = $(".scrim"), titleEl = $("#ckTitle"), endEl = $("#ckEnd"), wcard = $(".wcard"), chip = $(".chip"), cur = $(".cur");
  let black = 1, scrimA = 0, titleA = 0, endA = 0, wcardA = 0, chipA = 0, curA = 0, curIdle = 99;
  let cx = window.innerWidth * 0.5, cy = window.innerHeight * 0.7;

  // --- small steps (generators: one yield = one frame)
  function* wait(s) { for (let t = 0; t < s - 1e-6; t += dt) yield; }
  function* waitFor(cond, s, label) { for (let t = 0; t < s; t += dt) { if (cond()) return true; yield; } if (label) warn("timed out: " + label); return false; }
  function* tween(set, from, to, s) { for (let t = dt; t <= s + 1e-6; t += dt) { set(from + (to - from) * ease(t / s)); yield; } set(to); }
  function* glide(x, y, s) {
    const sx = cx, sy = cy, d = Math.hypot(x - sx, y - sy);
    s = s ?? Math.min(0.45, Math.max(0.18, d / 1400));
    curIdle = 0;
    for (let t = dt; t <= s + 1e-6; t += dt) { const e = ease(t / s); cx = sx + (x - sx) * e; cy = sy + (y - sy) * e; curIdle = 0; yield; }
    cx = x; cy = y;
  }
  /** Glide to a button and click it. */
  function* click(el, s) {
    if (!el) { warn("no button to click"); return false; }
    const r = el.getBoundingClientRect();
    yield* glide(r.left + r.width * 0.5, r.top + r.height * 0.55, s);
    cur.classList.add("down"); el.click(); curIdle = 0; yield* wait(0.08); cur.classList.remove("down");
    return true;
  }
  const buttons = () => [...document.querySelectorAll("button")];
  const byText = (re) => buttons().find((b) => re.test(b.textContent.trim()));
  const stageButton = (i) => buttons().find((b) => (b.getAttribute("aria-label") ?? "").replace(/ \(king\)$/, "") === `Stage ${i + 1}`);
  const worldChip = (name) => document.querySelector(`button[title="${name}"]`);

  /** The hero for a world, put on in the menu (the stage map stays open). */
  function* equip(heroId) {
    if (records.get().hero === heroId && g.hero.id === heroId) return;
    records.set({ hero: heroId });
    let ok = null;
    g.setHero(heroId).then((v) => (ok = v), () => (ok = false));
    yield* waitFor(() => ok !== null, 60, "hero " + heroId);
    if (!ok) warn("could not put on " + heroId);
  }

  function* playStage(n, w, s) {
    last = null;
    window.__botE = window.__botS = undefined;
    event("stage", { world: w, stage: s, king: s === 9 });
    chip.innerHTML = `WORLD <b>${n + 1}/${D.play.length}</b> · ${D.worlds[w].name.toUpperCase()} · STAGE <b>${s + 1}/10</b>${s === 9 ? " · <b>KING</b>" : ""} · ${D.heroes[n].name.toUpperCase()} · <b>${D.speed}×</b>`;
    yield* waitFor(() => g.phase === "playing", 5, "stage start");
    yield* tween((v) => (chipA = v), chipA, 1, 0.4);
    yield* waitFor(() => last !== null, 900, `world ${w + 1} stage ${s + 1}`);
    yield* tween((v) => (chipA = v), 1, 0, 0.3);
    const r = last ?? { won: false, stars: 0, kills: 0, time: 0 };
    event(r.won ? "won" : "lost", { world: w, stage: s, stars: r.stars, kills: r.kills, time: r.time });
    note(`${r.won ? "WON " : "LOST"} ${D.worlds[w].name} stage ${s + 1}: ${r.stars}★, ${r.kills} kills, ${r.time} s, hp ${Math.round(g.hp)}/${g.stats.maxHp}`);
    if (!r.won) warn(`lost ${D.worlds[w].name} stage ${s + 1}`);
    return r.won;
  }

  // --- the playthrough
  function* main() {
    scrimA = 1;
    yield* tween((v) => (black = v), 1, 0, 0.8);
    yield* tween((v) => (titleA = v), 0, 1, 0.7);
    yield* wait(4.5);
    yield* tween((v) => { titleA = v; scrimA = v; }, 1, 0, 0.6);
    yield* wait(0.5);
    for (const [n, w] of D.play.entries()) {
      const world = D.worlds[w], hero = D.heroes[n];
      // To the stage map: Play from the title screen, Stages from the last result.
      if (n === 0) yield* click(document.querySelector("[data-ck-play]")?.closest("button"), 0.5);
      else yield* click(byText(/^Stages$/), 0.5);
      yield* waitFor(() => worldChip(world.name), 5, "stage map");
      yield* wait(0.4);
      if (records.get().world !== world.id) {
        yield* click(worldChip(world.name), 0.45);
        yield* waitFor(() => g.world.id === world.id, 5, "world " + world.id);
      }
      yield* equip(hero.id);
      event("world", { world: w, name: world.name, hero: hero.name });
      note(`world ${n + 1}: ${world.name} · ${hero.name}`);
      // The world card over the stage map.
      wcard.querySelector(".w1").textContent = `WORLD ${n + 1} OF ${D.play.length}`;
      wcard.querySelector(".w2").textContent = world.name.toUpperCase();
      wcard.querySelector(".w3").textContent = `Hero: ${hero.name} · ${hero.perk} · King: ${world.boss}`;
      yield* tween((v) => (wcardA = v), 0, 1, 0.5);
      yield* wait(2.6);
      yield* tween((v) => (wcardA = v), 1, 0, 0.4);
      for (let s = 0; s < 10; s++) {
        if (s === 0) {
          yield* click(stageButton(0), 0.4);
          // The menu has drawn on Math.random in real time: seed it now so every run deals the same game.
          if (n === 0) { let a = D.seed >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
        }
        let won = yield* playStage(n, w, s);
        // A stage lost (it shouldn't be) is tried again, as a player would.
        for (let retry = 0; !won && retry < 3; retry++) {
          yield* wait(2.2);
          yield* click(byText(/^Retry$/) ?? byText(/Retry/), 0.4);
          won = yield* playStage(n, w, s);
        }
        // The result screen: stars and coins.
        yield* wait(s === 9 ? 4.8 : 2.8);
        if (s < 9) {
          yield* click(byText(/Next stage/), 0.4);
          yield* waitFor(() => g.phase === "playing", 5, "next stage");
        }
      }
    }
    event("end");
    yield* tween((v) => { scrimA = v; endA = v; }, 0, 1, 0.8);
    yield* wait(6);
    yield* tween((v) => (black = v), 0, 1, 1);
  }

  const plan = main();
  let done = false, sent = 0, boss = false;
  window.__ck = {
    warns: () => warns,
    events: () => events,
    frame() {
      if (!done) { const r = plan.next(); if (r.done) done = true; }
      // The king's entrance, for the Shorts.
      const nowBoss = g.stage === "boss-intro";
      if (nowBoss && !boss) event("king", { world: g.world.id });
      boss = nowBoss;
      curIdle += dt;
      curA = curIdle < 1.2 ? Math.min(1, curA + dt * 8) : Math.max(0, curA - dt * 3);
      blk.style.opacity = black;
      scrim.style.opacity = scrimA;
      titleEl.style.opacity = titleA;
      endEl.style.opacity = endA;
      wcard.style.opacity = wcardA;
      chip.style.opacity = chipA;
      cur.style.opacity = curA;
      cur.style.transform = `translate(${cx - 4}px, ${cy - 3}px)`;
      // SPEED steps of the game per frame; only the last one is drawn.
      for (let i = 0; i < D.speed; i++) {
        if (!D.sim) g.renderer.render = i < D.speed - 1 ? () => {} : realRender;
        window.__vt.step(1000 / D.fps);
      }
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
  const { audio, music, song, game: g } = window.__cryptKnight, R = window.__rec;
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "crypt-gameplay-"));
let chrome = null, enc = null;
try {
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json(), () => null); }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Animation.enable");
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.navigate", { url: `${BASE}/crypt-knight/play/` });
  const deadline = Date.now() + 300_000;
  while (!(await page.evaluate(`!!(window.__cryptKnight && __cryptKnight.game.phase === "menu" && __cryptKnight.game.laterReady)`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load (is `npx next dev -p 3005` running?)");
    await sleep(500);
  }
  const owned = [...WORLDS.map((w) => `world:${w.id}`), ...HEROES.map((h) => `hero:${h.id}`)];
  await page.evaluate(`(${logger})(${JSON.stringify(owned)})`);
  await sleep(2500);
  await page.evaluate("__vt.start()");
  const heroes = PLAY_WORLDS.map((_, n) => HEROES.find((h) => h.id === HERO_ORDER[n % HERO_ORDER.length]));
  const D = { fps: FPS, speed: SPEED, seed: SEED, sim: SIM, play: PLAY_WORLDS, worlds: WORLDS.map((w) => ({ id: w.id, name: w.name, boss: w.boss })), heroes: heroes.map((h) => ({ id: h.id, name: h.name, perk: h.perk })) };
  await page.evaluate(`${NET}; ${CORNERS}; ${BOT}; (${director})(${JSON.stringify(D)})`);

  if (!SIM) {
    enc = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high", "-g", String(FPS * 2), path.join(work, "picture.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
  }
  console.log(SIM ? `Simulating (seed ${SEED}, ${SPEED}×)…` : `Recording (seed ${SEED}, ${SPEED}×, ${W * DPR}×${H * DPR}, ${FPS} fps)…`);
  const t0 = Date.now();
  let vt = 0, frames = 0, mark = { at: Date.now(), vt: 0 };
  for (;;) {
    const r = await page.evaluate("__ck.frame()");
    for (const s of r.notes) console.log("  " + s);
    if (!SIM) {
      const { data } = await page.send("Page.captureScreenshot", { format: "jpeg", quality: 92, fromSurface: true });
      if (!enc.stdin.write(Buffer.from(data, "base64"))) await new Promise((res) => enc.stdin.once("drain", res));
      // CSS animations (the game's banners, its result card) run on the wall clock: keep them in step with the video.
      if (frames % 15 === 0 && frames > 0) {
        const rate = (SPEED * (r.vt - mark.vt)) / Math.max(0.001, (Date.now() - mark.at) / 1000);
        await page.send("Animation.setPlaybackRate", { playbackRate: Math.min(4, Math.max(0.02, rate)) });
        mark = { at: Date.now(), vt: r.vt };
      }
    }
    frames++;
    vt = r.vt;
    if (frames % (FPS * 30) === 0) console.log(`  — ${mmss(vt)} of video, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    if (r.done || vt >= STOP) break;
  }
  const warns = await page.evaluate("__ck.warns()");
  const events = await page.evaluate("__ck.events()");
  console.log(`Run: ${mmss(vt)} (${vt.toFixed(1)} s), ${frames} frames in ${((Date.now() - t0) / 60000).toFixed(1)} min, ${warns.length} warning(s)${warns.length ? ":\n  " + warns.join("\n  ") : ""}`);
  for (const e of events.filter((e) => e.type === "world" || e.type === "king" || (e.type === "won" && e.stage === 9))) console.log(`  ${mmss(e.t)}  ${e.type}${e.name ? " " + e.name : ""}${e.hero ? " · " + e.hero : ""}${e.stars !== undefined ? ` ${e.stars}★` : ""}`);

  if (!SIM) {
    enc.stdin.end();
    await new Promise((res, rej) => enc.on("close", (c) => (c === 0 ? res() : rej(new Error("the video encoder failed")))));
    enc = null;
    fs.writeFileSync(VIDEO.replace(/\.mp4$/, ".json"), JSON.stringify({ seconds: vt, fps: FPS, speed: SPEED, worlds: PLAY_WORLDS.map((w, n) => ({ name: WORLDS[w].name, boss: WORLDS[w].boss, hero: heroes[n].name })), events }, null, 1));
    for (const part of ["music", "sfx"]) {
      console.log(`Sound: ${part}…`);
      // A long run's sound takes many minutes to make: asked after every few seconds, as one evaluate that long
      // can lose its answer (the first full run stalled here with the music already made).
      await page.evaluate(`window.__made = null; (${soundtrack})(${JSON.stringify(part)}, ${vt + 0.5}).then((b) => (window.__made = b), (e) => (window.__made = String(e))); 0`);
      let bytes = null;
      while (bytes === null) {
        await sleep(5000);
        bytes = await page.evaluate("window.__made");
      }
      if (typeof bytes === "string") throw new Error(`the ${part} could not be made: ${bytes}`);
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
