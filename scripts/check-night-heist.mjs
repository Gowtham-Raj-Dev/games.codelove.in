#!/usr/bin/env node
/**
 * Checks Night Heist.
 *
 *   node scripts/check-night-heist.mjs --sim [from-to] [--verbose]
 *       No browser: bundles the game's logic (sim.ts, bot.ts, the heists) and lets the solver pull off every
 *       heist with no alarm and all the loot. One line per heist. Fast — use it while editing heists.
 *
 *   node scripts/check-night-heist.mjs [from-to]
 *       The real game in headless Chrome (dev server on BASE, default http://localhost:3005): see the second
 *       half of this file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
const GAME = path.join(ROOT, "src/components/games/night-heist");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const range = args.find((a) => /^\d+(-\d+)?$/.test(a));

/** The game's logic, bundled from the source (no three.js in it). */
async function logic() {
  const r = await esbuild.build({
    stdin: {
      contents: `export { solve } from "./bot"; export { LEVELS } from "./campaign"; export { parseLevel } from "./levels"; export { DISTRICTS, districtOf, readSave, modsOf, payout, TOTAL_HEISTS } from "./content";`,
      resolveDir: GAME,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const tmp = path.join(os.tmpdir(), `night-heist-logic-${process.pid}.mjs`);
  fs.writeFileSync(tmp, r.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function span(total) {
  if (!range) return [0, total - 1];
  const [a, b] = range.split("-").map(Number);
  return [Math.max(0, a), Math.min(total - 1, b ?? a)];
}

/** Things a map can get wrong that only show once you walk it: loot, the target or the exit walled off. */
function unreachable(level) {
  const { grid } = level;
  const doors = new Set(level.doors.map((d) => grid.idx(d.x, d.z)));
  const open = (x, z) => grid.inside(x, z) && (grid.walkable(x, z, true) || doors.has(grid.idx(x, z)));
  const seen = new Set([grid.idx(level.start.x, level.start.z)]);
  const queue = [[level.start.x, level.start.z]];
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = grid.idx(x + dx, z + dz);
      if (!open(x + dx, z + dz) || seen.has(i)) continue;
      seen.add(i);
      queue.push([x + dx, z + dz]);
    }
  }
  const at = (x, z) => grid.inside(x, z) && seen.has(grid.idx(x, z));
  const beside = (x, z) => at(x + 1, z) || at(x - 1, z) || at(x, z + 1) || at(x, z - 1);
  const out = [];
  for (const l of level.loot) if (!(l.plinth ? beside(l.x, l.z) : at(l.x, l.z))) out.push(`loot at ${l.x},${l.z} cannot be reached`);
  for (const k of level.keys) if (!at(k.x, k.z)) out.push(`key card at ${k.x},${k.z} cannot be reached`);
  if (!beside(level.target.x, level.target.z)) out.push("the target cannot be reached");
  if (!at(level.exit.inside.x, level.exit.inside.z)) out.push("the exit cannot be reached");
  if (level.doors.length > level.keys.length) out.push(`${level.doors.length} locked doors but only ${level.keys.length} key cards`);
  return out;
}

async function simulate() {
  const { solve, LEVELS, parseLevel, districtOf } = await logic();
  const [from, to] = span(LEVELS.length);
  let bad = 0;
  for (let i = from; i <= to; i++) {
    const def = LEVELS[i];
    const level = parseLevel(def, i);
    const problems = [...level.problems, ...unreachable(level)];
    const t0 = Date.now();
    let line;
    if (problems.length) {
      bad++;
      line = `MAP ERROR: ${problems.join("; ")}`;
    } else {
      const cells = args.find((a) => a.startsWith("--cells="))?.slice(8).split(";").map((c) => ({ x: Number(c.split(",")[0]), z: Number(c.split(",")[1]) }));
      const r = solve(def, i, flag("--diag") ? { diag: true, margin: 0.45, cells } : {});
      if (!r.ok) bad++;
      line = `${r.ok ? "ok  " : "FAIL"} ${r.stars}★ ${r.why.padEnd(16)} time ${String(r.time).padStart(3)}s (par ${def.par}) getaway ${String(r.getaway).padStart(2)}s${def.timer ? ` (timer ${def.timer})` : ""} loot ${r.loot} margin ${r.margin} · ${((Date.now() - t0) / 1000).toFixed(1)}s`;
      if (flag("--verbose") || flag("--diag") || !r.ok) line += "\n      " + r.steps.join("\n      ");
    }
    console.log(`${String(i + 1).padStart(2)} ${districtOf(i).name.padEnd(16)} ${def.name.padEnd(22)} ${line}`);
  }
  console.log(bad ? `${bad} heist(s) not solved` : `all ${to - from + 1} heist(s) solved with three stars`);
  return bad;
}

/** --map from-to: prints the maps with coordinates (for writing guard routes). */
async function maps() {
  const { LEVELS } = await logic();
  const [from, to] = span(LEVELS.length);
  for (let i = from; i <= to; i++) {
    const def = LEVELS[i];
    const w = Math.max(...def.map.map((r) => r.length));
    console.log(`\n${i + 1} ${def.name}`);
    console.log("    " + Array.from({ length: w }, (_, x) => (x % 10 === 0 ? String((x / 10) % 10) : " ")).join(""));
    console.log("    " + Array.from({ length: w }, (_, x) => String(x % 10)).join(""));
    def.map.forEach((row, z) => console.log(String(z).padStart(3) + " " + row));
  }
}

if (flag("--map")) {
  await maps();
  process.exit(0);
}
if (flag("--sim")) process.exit((await simulate()) ? 1 : 0);

// --- The real game, in headless Chrome ---------------------------------------------------------------
//
//   node scripts/check-night-heist.mjs [from-to] [--ui] [--shots=dir]
//
// Loads /night-heist/play/ from the dev server and fails on any console error, uncaught exception or failed
// request. For every heist in the range it opens the briefing and starts the heist through the game's own UI
// functions, lets the solver (the dev-only window.__nightHeist hook) find a route, plays those inputs in the
// real game and checks the result card and the save: three stars. Heists before the range count as done.
// With --ui it also checks: getting caught → Try again, pause / resume, the shop (buy, equip, upgrade), save →
// reload, corrupted saves, a phone (touch, portrait and landscape) and resizing — and takes screenshots.

const { spawn } = await import("node:child_process");
const BASE = process.env.BASE ?? "http://localhost:3005";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9391;
const SHOTS = args.find((a) => a.startsWith("--shots="))?.slice(8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const notices = new Set();
const fail = (msg) => {
  problems.push(msg);
  console.log(`  !! ${msg}`);
};

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pend = new Map();
  const urls = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") fail(`uncaught exception: ${d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text}`);
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") {
      const text = d.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      // The site's own <head> scripts (ads, analytics) change their attributes before React hydrates: a notice
      // from the site's layout on every page in development, not from the game.
      if (text.includes("A tree hydrated") && /<head>\s*(<link>\s*)*(<script>\s*)*<script\s*[+-]?\s*$/.test(text.trimEnd()) && !text.includes("GameRoot")) notices.add("hydration notice from the site layout's <head> scripts (not the game)");
      else fail(`console.error: ${text.slice(0, 1800)}`);
    }
    else if (d.method === "Log.entryAdded" && d.params.entry.level === "error") fail(`browser error: ${d.params.entry.text} ${d.params.entry.url ?? ""}`);
    else if (d.method === "Network.requestWillBeSent") urls.set(d.params.requestId, d.params.request.url);
    else if (d.method === "Network.responseReceived" && d.params.response.status >= 400) fail(`HTTP ${d.params.response.status}: ${d.params.response.url}`);
    else if (d.method === "Network.loadingFailed" && !d.params.canceled && d.params.blockedReason !== "inspector") fail(`request failed (${d.params.errorText}): ${urls.get(d.params.requestId) ?? "?"}`);
    if (d.id && pend.has(d.id)) {
      const p = pend.get(d.id);
      pend.delete(d.id);
      if (d.error) p.rej(new Error(d.error.message));
      else p.res(d.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pend.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

const H = "window.__nightHeist";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "night-heist-check-"));
let chrome = null;
try {
  chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--enable-unsafe-swiftshader", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(
      (r) => r.json(),
      () => null,
    );
  }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  const page = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  await page.send("Log.enable");
  // The check is about the game: the site's ads and analytics are kept off the network.
  await page.send("Network.setBlockedURLs", { urls: ["*googlesyndication*", "*admin.codelove.in*", "*google-analytics*", "*googletagmanager*", "*doubleclick*", "*googleapis.com*"] });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });

  const desktop = (w = 1280, h = 720) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const waitFor = async (expr, what, ms = 60_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await page.evaluate(expr).catch(() => false)) return true;
      await sleep(150);
    }
    fail(`timed out waiting for ${what}`);
    return false;
  };
  const phase = (p) => `${H} && ${H}.game.phase === "${p}"`;
  const load = async () => {
    await page.send("Page.navigate", { url: `${BASE}/night-heist/play/` });
    if (!(await waitFor(phase("menu"), "the game to load (is `npx next dev -p 3005` running?)", 300_000))) throw new Error("the game did not load");
    await sleep(400);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await sleep(900);
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
  };
  const key = async (k, code = k) => {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 });
    await sleep(250);
  };
  /** Clicks the button that holds an element matching `sel` (or the element itself). */
  const click = async (sel) => {
    const ok = await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const b = el && (el.closest("button") ?? el); if (!b) return false; b.click(); return true; })()`);
    if (!ok) fail(`no button ${sel}`);
    await sleep(300);
    return ok;
  };

  await desktop();
  await load();
  const total = await page.evaluate(`${H}.heists`);
  const [from, to] = span(total);
  // Heists before the range count as pulled off (one star), so the range is unlocked like in a real save.
  const seed = Object.fromEntries(Array.from({ length: from }, (_, i) => [i, { stars: 1, time: 100, value: 2000, loot: 0, clean: false }]));
  await page.evaluate(`localStorage.setItem("night-heist:v1", ${JSON.stringify(JSON.stringify({ heists: seed, bank: 0 }))})`);
  await load();
  await shot("menu");
  if (flag("--ui")) {
    await click('button[aria-label="Heists"]');
    await shot("heists");
    await page.evaluate(`${H}.ui().pause()`);
  }

  // --capture=dir [--at=0.3,0.5] [--final]: pictures of the heist `from` under way with the HUD hidden — the
  // cover and the loading-screen backdrops are made from these (with --final, straight into public/games/).
  const CAPTURE = args.find((a) => a.startsWith("--capture="))?.slice(10);
  if (CAPTURE) {
    const sharp = (await import("sharp")).default;
    fs.mkdirSync(CAPTURE, { recursive: true });
    const at = (args.find((a) => a.startsWith("--at="))?.slice(5) ?? "0.5").split(",").map(Number);
    await page.evaluate(`${H}.ui().open(${from})`);
    await waitFor(phase("briefing"), "the briefing", 15_000);
    await page.evaluate(`${H}.game.auto = true; ${H}.ui().start(${from})`);
    await waitFor(phase("playing"), "the heist to start", 15_000);
    await page.evaluate(`(() => { window.__route = ${H}.solve(${from}).inputs; window.__done = 0; const st = document.createElement("style"); st.textContent = ".g-root > :not(canvas) { display: none !important } nextjs-portal { display: none !important }"; document.head.appendChild(st); ${H}.game.zoom = ${Number(args.find((a) => a.startsWith("--zoom="))?.slice(7) ?? 0.8)}; })()`);
    const grab = async (w, h) => {
      await desktop(w, h);
      await sleep(2500);
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      return Buffer.from(data, "base64");
    };
    for (const f of at) {
      await page.evaluate(`(() => { const n = Math.floor(window.__route.length * ${f}); ${H}.play(window.__route.slice(window.__done, n), false, true); window.__done = n; })()`);
      if (flag("--final")) {
        for (const [name, w, h, q] of [["cover", 1200, 630, 82], ["backdrop-wide-1920", 1920, 1080, 72], ["backdrop-wide-2560", 2560, 1440, 66], ["backdrop-tall-1170", 1170, 2532, 70]]) {
          const file = path.join(CAPTURE, `${name}.webp`);
          await sharp(await grab(w, h)).webp({ quality: q }).toFile(file);
          console.log(`${file} ${w}×${h} ${Math.round(fs.statSync(file).size / 1024)} kB`);
        }
      } else {
        fs.writeFileSync(path.join(CAPTURE, `shot-${from + 1}-${f}.png`), await grab(1200, 630));
        fs.writeFileSync(path.join(CAPTURE, `tall-${from + 1}-${f}.png`), await sharp(await grab(585, 1266)).png().toBuffer());
        console.log(`captured heist ${from + 1} at ${f}`);
      }
    }
    await page.evaluate(`${H}.game.auto = false`);
  }

  if (!CAPTURE) console.log(`Night Heist in Chrome: heists ${from + 1}–${to + 1} of ${total}`);
  for (let i = from; i <= to && !CAPTURE; i++) {
    const t0 = Date.now();
    await page.evaluate(`${H}.ui().open(${i})`);
    if (!(await waitFor(phase("briefing"), `the briefing of heist ${i + 1}`, 15_000))) continue;
    if (i === from) await shot("briefing");
    // From its first step the heist is driven by the solver's inputs alone (not by the frame loop).
    await page.evaluate(`${H}.game.auto = true`);
    if (i === from && flag("--ui")) await click("[data-nh-begin]");
    else await page.evaluate(`${H}.ui().start(${i})`);
    if (!(await waitFor(phase("playing"), `heist ${i + 1} to start`, 15_000))) continue;
    const info = await page.evaluate(`(() => { const r = ${H}.solve(${i}); window.__route = r.inputs; return { ok: r.ok, why: r.why, stars: r.stars, n: r.inputs.length, margin: r.margin }; })()`);
    if (SHOTS && (i === from || i % 8 === 4)) {
      // A look at the heist under way: early on, and well into it.
      await page.evaluate(`${H}.play(window.__route.slice(0, 240), false, true)`);
      await shot(`heist-${i + 1}-early`);
      const mid = Math.floor(info.n * 0.6);
      await page.evaluate(`${H}.play(window.__route.slice(240, ${mid}), false, true)`);
      await shot(`heist-${i + 1}-late`);
      await page.evaluate(`window.__route = window.__route.slice(${Math.max(240, mid)})`);
    }
    const r = await page.evaluate(`${H}.play(window.__route)`);
    await waitFor(phase("result"), `the result of heist ${i + 1}`, 10_000);
    await sleep(200);
    const card = await page.evaluate(`!!document.querySelector(${i === total - 1 ? '"[data-nh-retry]"' : '"[data-nh-next]"'})`);
    const rec = await page.evaluate(`${H}.save().heists[${i}] ?? null`);
    const won = !!r && r.escaped && r.stars === 3 && !!rec && rec.stars === 3 && card;
    console.log(`${String(i + 1).padStart(2)} ${won ? "ok  " : "FAIL"} ${r ? `${r.escaped ? "escaped" : `caught (${r.reason})`} ${r.stars}★ loot ${r.loot}/${r.lootTotal} time ${Math.round(r.time)}s haul $${r.value}` : "no result"} · solver ${info.why}, margin ${info.margin} · saved ${rec ? rec.stars + "★" : "nothing"}${card ? "" : " · no result card"} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (!won) fail(`heist ${i + 1} was not won with three stars in the real game`);
    if (i === from) await shot("win");
  }

  if (flag("--ui")) {
    console.log("UI checks");
    const save = () => page.evaluate(`${H}.save()`);
    // Caught → Try again.
    await page.evaluate(`${H}.ui().start(${from})`);
    await waitFor(phase("playing"), "the heist to start", 15_000);
    const lost = await page.evaluate(`${H}.getCaught()`);
    await waitFor(phase("result"), "the caught screen", 10_000);
    if (!lost || lost.escaped) fail("running at a guard did not end in being caught");
    else console.log(`   caught (${lost.reason}) after ${Math.round(lost.time)}s`);
    await shot("caught");
    await click("[data-nh-retry]");
    if (await waitFor(phase("playing"), "Try again to restart the heist", 10_000)) console.log("   Try again restarts the heist");
    if ((await page.evaluate(`${H}.game.sim.time`)) > 2) fail("the heist did not start from the beginning after Try again");
    // Pause / resume: the heist's clock stands still while paused.
    await key("Escape");
    if (!(await page.evaluate(phase("paused")))) fail("Esc did not pause");
    const t1 = await page.evaluate(`${H}.game.sim.time`);
    await shot("paused");
    await sleep(600);
    if ((await page.evaluate(`${H}.game.sim.time`)) !== t1) fail("the heist kept running while paused");
    await key("Escape");
    if (!(await page.evaluate(phase("playing")))) fail("Esc did not resume");
    await sleep(500);
    if (!((await page.evaluate(`${H}.game.sim.time`)) > t1)) fail("the heist did not run again after resume");
    else console.log("   pause / resume");
    // Resize while playing.
    for (const [w, h] of [[800, 600], [1600, 900], [1280, 720]]) {
      await desktop(w, h);
      await sleep(500);
      const size = await page.evaluate(`(() => { const c = document.querySelector("canvas"); return [c.clientWidth, c.clientHeight, c.width, c.height]; })()`);
      if (size[0] !== w || size[1] !== h || size[2] < w * 0.5) fail(`after resizing to ${w}×${h} the canvas is ${size.join("×")}`);
    }
    console.log("   resize");
    // The shop.
    await page.evaluate(`${H}.ui().files()`);
    await waitFor(phase("menu"), "the menu", 10_000);
    await page.evaluate(`${H}.records.set({ bank: 100000 })`);
    await page.evaluate(`${H}.ui().shop("thief")`);
    await sleep(600);
    await shot("shop");
    // A card and the action button, clicked like a player would.
    await page.evaluate(`[...document.querySelectorAll('[aria-label="Shop"] li button')].find((b) => b.textContent.includes("Tiptoe")).click()`);
    await sleep(300);
    await click("[data-nh-shop-action]");
    let s = await save();
    if (!s.owned.includes("thief:tiptoe") || s.thief !== "tiptoe" || s.bank !== 94000) fail(`buying Tiptoe: owned ${s.owned}, thief ${s.thief}, bank ${s.bank}`);
    await shot("shop-bought");
    await page.evaluate(`${H}.ui().equip("thief", "shade")`);
    await page.evaluate(`${H}.ui().buy("outfit", "crimson"); ${H}.ui().buy("gadget", "smoke"); ${H}.ui().buy("upgrade", "pouch"); ${H}.ui().buy("upgrade", "pouch"); ${H}.ui().buy("thief", "ghost"); ${H}.ui().buy("thief", "ghost")`);
    s = await save();
    const want = { thief: "ghost", outfit: "crimson", gadget: "smoke", bank: 94000 - 2000 - 8000 - 3000 - 7000 - 30000 };
    for (const [k, v] of Object.entries(want)) if (s[k] !== v) fail(`shop: ${k} is ${s[k]}, expected ${v}`);
    if (s.upgrades.pouch !== 2) fail(`shop: Coin Pouch level ${s.upgrades.pouch}, expected 2`);
    await page.evaluate(`${H}.records.set({ bank: 10 }); ${H}.ui().buy("thief", "lucky")`);
    if ((await save()).owned.includes("thief:lucky")) fail("shop: bought a thief without the cash");
    await page.evaluate(`${H}.records.set({ bank: 44000 })`);
    await key("Escape");
    console.log("   shop: buy, equip, upgrade, no cash no sale");
    // A heist with the new thief, gadget and upgrade: the smoke bomb works and the coins are there.
    await page.evaluate(`${H}.ui().start(${from})`);
    await waitFor(phase("playing"), "the heist to start", 15_000);
    const kit = await page.evaluate(`(() => { const g = ${H}.game; g.gadget(); const before = g.sim.charges; return new Promise((res) => setTimeout(() => res({ before, after: g.sim.charges, clouds: g.sim.clouds.length, coins: g.sim.coinsLeft, notice: g.sim.mods.notice }), 500)); })()`);
    if (kit.before !== 2 || kit.after !== 1 || kit.clouds !== 1 || kit.notice !== 0.7) fail(`gadget / perks in play: ${JSON.stringify(kit)}`);
    else console.log(`   in play: smoke bomb used (${kit.after} left), ${kit.coins} coins, Ghost's perk on`);
    await shot("smoke");
    // Save → reload → still there.
    const before = await save();
    await load();
    const after = await save();
    if (JSON.stringify(before) !== JSON.stringify(after)) fail(`the save changed over a reload:\n${JSON.stringify(before)}\n${JSON.stringify(after)}`);
    else console.log(`   save survives a reload (${Object.keys(after.heists).length} heists, $${after.bank}, ${after.owned.length} things owned)`);
    // Corrupted saves: every one must load to the menu, and a heist must still start.
    const broken = ["{not json", "null", "[1,2,3]", '"text"', "12", '{"heists":{"0":{"stars":"x"},"zz":5,"7":{"stars":9,"time":"-","value":-4}},"bank":"NaN","owned":"nope","thief":42,"outfit":"gold","gadget":{},"upgrades":[1,2],"last":999,"runs":-3}', '{"cases":{"0":{"stars":2,"time":80,"value":2400,"loot":2,"clean":true}},"last":1}'];
    for (const b of broken) {
      await page.evaluate(`localStorage.setItem("night-heist:v1", ${JSON.stringify(b)})`);
      await load();
      const got = await save();
      await page.evaluate(`${H}.ui().start(0)`);
      const ok = await waitFor(phase("playing"), `a heist to start with the save ${b.slice(0, 30)}`, 15_000);
      await page.evaluate(`${H}.ui().files()`);
      console.log(`   broken save ${b.slice(0, 34).padEnd(34)} → ${ok ? "plays" : "FAILS"}: ${Object.keys(got.heists).length} heists, $${got.bank}, thief ${got.thief}, outfit ${got.outfit}, last ${got.last}`);
    }
    // A phone: touch, portrait then landscape.
    await page.evaluate(`localStorage.setItem("night-heist:v1", ${JSON.stringify(JSON.stringify(before))})`);
    for (const [name, w, h] of [["portrait", 390, 844], ["landscape", 844, 390]]) {
      await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await page.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
      await load();
      await shot(`phone-${name}-menu`);
      await click('button[aria-label="Heists"]');
      await shot(`phone-${name}-heists`);
      await page.evaluate(`${H}.ui().open(${from})`);
      await waitFor(phase("briefing"), "the briefing", 10_000);
      await shot(`phone-${name}-briefing`);
      await page.evaluate(`${H}.ui().start(${from})`);
      await waitFor(phase("playing"), "the heist to start", 15_000);
      await sleep(600);
      const spots = await page.evaluate(`(() => { const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width, b.height]; }; return { use: r('button[aria-label="Use"]'), sneak: r('button[aria-label="Sneak"]'), run: r('button[aria-label="Run"]'), gadget: r('button[aria-label="Gadget"]'), stick: r('[aria-label="Move"]') }; })()`);
      if (!spots.use || !spots.sneak || !spots.run || !spots.stick) fail(`phone ${name}: touch controls missing: ${JSON.stringify(spots)}`);
      else {
        // Drag the stick up: the thief walks north. Tap Sneak: the toggle shows in the HUD.
        const p0 = await page.evaluate(`[${H}.game.sim.thief.x, ${H}.game.sim.thief.z]`);
        const [sx, sy] = spots.stick;
        await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy, id: 1 }] });
        for (let k = 1; k <= 6; k++) await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx, y: sy - k * 9, id: 1 }] });
        await sleep(900);
        await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        const p1 = await page.evaluate(`[${H}.game.sim.thief.x, ${H}.game.sim.thief.z]`);
        if (!(p1[1] < p0[1] - 0.3)) fail(`phone ${name}: dragging the stick up did not move the thief north (${p0} → ${p1})`);
        await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: spots.sneak[0], y: spots.sneak[1], id: 2 }] });
        await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await sleep(300);
        const sneak = await page.evaluate(`document.querySelector('button[aria-label="Sneak"]').textContent`);
        if (!/on/i.test(sneak)) fail(`phone ${name}: tapping Sneak did not switch it on`);
        // No two controls overlap each other.
        const boxes = Object.entries(spots).filter(([k, v]) => v && k !== "stick");
        for (let a = 0; a < boxes.length; a++)
          for (let b = a + 1; b < boxes.length; b++) {
            const [ax, ay, aw, ah] = boxes[a][1];
            const [bx, by, bw, bh] = boxes[b][1];
            if (Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2) fail(`phone ${name}: ${boxes[a][0]} and ${boxes[b][0]} overlap`);
          }
        console.log(`   phone ${name} ${w}×${h}: stick moves the thief, Sneak toggles, ${boxes.length} buttons clear of each other`);
      }
      await shot(`phone-${name}-play`);
      await page.evaluate(`${H}.ui().files()`);
      await waitFor(phase("menu"), "the menu", 10_000);
      await sleep(300);
      await page.evaluate(`${H}.ui().shop("thief")`);
      await sleep(600);
      await shot(`phone-${name}-shop`);
    }
  }
  page.close();
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  chrome?.kill();
  await sleep(800);
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  } catch {
    /* Chrome still holds it */
  }
}
for (const n of notices) console.log(`note: ${n}`);
console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.join("\n  ")}` : "\nNo problems: no console errors, no failed requests, every heist in the range won with three stars.");
process.exit(problems.length ? 1 : 0);
