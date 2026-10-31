#!/usr/bin/env node
/**
 * Checks the Playables builds (dist-playables/) against YouTube's certification requirements
 * (https://developers.google.com/youtube/gaming/playables/certification/requirements) — a stand-in
 * for YouTube's own test suite, which only opens from the Developer Portal after onboarding.
 *
 *   npm run playables:check                 every built game
 *   npm run playables:check -- skate-rush   one game
 *     → dist-playables/_check/<slug>/*.png  the game in each aspect ratio, to look over by eye
 *
 * Each game is served with YouTube's Content-Security-Policy (scripts/serve-playables.mjs) and runs in
 * headless Chrome with a stand-in for YouTube's SDK that records every call. Three loads per game:
 *   1. new player, 1280×720 desktop: SDK order and timing, network, storage, pause / resume / mute, Esc
 *   2. the save from load 1, a phone held upright (touch): an old save must load without errors
 *   3. a broken save, desktop: must start clean, not crash
 * then the aspect ratios YouTube names (9:32 … 32:9) on load 1's page, resized without a reload.
 *
 * Not covered (play it yourself): every interaction works by mouse and by touch, text is readable,
 * the end of the content is announced.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist-playables");
const OUT = path.join(DIST, "_check");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SERVE_PORT = 4199;
const CDP_PORT = 9341;
const BASE = `http://localhost:${SERVE_PORT}`;
const SDK = "https://www.youtube.com/game_api/v1";
const MiB = 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** YouTube's SDK, stood in: every call goes to Node at once (the __yt binding) and into window.__ytLog. */
const MOCK_SDK = `(() => {
  const t0 = performance.now();
  const log = window.__ytLog = [];
  const note = (name, extra) => { const e = { name, t: Math.round(performance.now() - t0), ...extra }; log.push(e); try { __yt(JSON.stringify(e)); } catch (_) {} };
  const subs = { pause: [], resume: [], audio: [] };
  const sub = (k) => (fn) => { subs[k].push(fn); note("on" + k); return () => { subs[k] = subs[k].filter((f) => f !== fn); }; };
  let loaded = false;
  window.__ytFire = (k, arg) => subs[k].forEach((fn) => fn(arg));
  window.ytgame = {
    IN_PLAYABLES_ENV: true,
    SDK_VERSION: "check",
    game: {
      firstFrameReady: () => note("firstFrameReady"),
      gameReady: () => note("gameReady"),
      loadData: () => { note("loadData"); return new Promise((r) => setTimeout(() => { loaded = true; note("loadDataDone"); r(window.__ytSave ?? ""); }, 250)); },
      saveData: (s) => { note("saveData", { bytes: new Blob([s]).size, early: !loaded }); if (!loaded) return Promise.reject(new Error("saveData before loadData")); window.__ytSaved = s; return Promise.resolve(); },
    },
    system: {
      isAudioEnabled: () => true,
      onAudioEnabledChange: sub("audio"),
      onPause: sub("pause"),
      onResume: sub("resume"),
      getLanguage: () => Promise.resolve("en-US"),
    },
    engagement: { sendScore: (s) => { note("sendScore", { value: s && s.value }); return Promise.resolve(); } },
    health: { logError: () => note("logError"), logWarning: () => note("logWarning") },
  };
})();`;

/** Runs before the page: counts drawing, audio, storage, forbidden listeners and preventDefault on Esc. */
const PROBE = (save) => `(() => {
  window.__ytSave = ${JSON.stringify(save)};
  const P = window.__probe = { draws: 0, storage: [], listeners: [], escPrevented: 0, csp: [], contexts: [], media: [] };
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    for (const m of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
      const f = C.prototype[m]; if (!f) continue;
      C.prototype[m] = function () { P.draws++; return f.apply(this, arguments); };
    }
  }
  for (const m of ["drawImage", "fillRect", "fill", "stroke", "fillText", "putImageData"]) {
    const f = CanvasRenderingContext2D.prototype[m];
    CanvasRenderingContext2D.prototype[m] = function () { P.draws++; return f.apply(this, arguments); };
  }
  for (const k of ["localStorage", "sessionStorage"]) {
    try { const s = window[k]; for (const m of ["getItem", "setItem", "removeItem", "clear"]) { const f = s[m].bind(s); s[m] = (...a) => { P.storage.push(k + "." + m + "(" + String(a[0] ?? "") + ")"); return f(...a); }; } } catch (_) {}
  }
  try { const o = indexedDB.open.bind(indexedDB); indexedDB.open = (...a) => { P.storage.push("indexedDB.open(" + a[0] + ")"); return o(...a); }; } catch (_) {}
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opt) {
    if (type === "visibilitychange" || type === "pagehide" || type === "pageshow" || type === "freeze") P.listeners.push(type);
    return add.call(this, type, fn, opt);
  };
  for (const [obj, prop] of [[Document.prototype, "hidden"], [Document.prototype, "visibilityState"]]) {
    const d = Object.getOwnPropertyDescriptor(obj, prop);
    if (d && d.get) Object.defineProperty(obj, prop, { ...d, get() { P.listeners.push("document." + prop); return d.get.call(this); } });
  }
  const pd = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () { if (this.key === "Escape") P.escPrevented++; return pd.call(this); };
  document.addEventListener("securitypolicyviolation", (e) => P.csp.push(e.violatedDirective + " " + e.blockedURI));
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const A = window[name]; if (!A) continue;
    window[name] = class extends A { constructor(...a) { super(...a); P.contexts.push(this); } };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (!P.media.includes(this)) P.media.push(this); return play.apply(this, arguments); };
  window.__sound = () => ({ running: P.contexts.filter((c) => c.state === "running").length, contexts: P.contexts.length, media: P.media.filter((m) => !m.paused && !m.muted && m.volume > 0).length });
})();`;

async function connect(url, onEvent) {
  const ws = new WebSocket(url);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); if (d.error) p.rej(new Error(d.error.message)); else p.res(d.result); }
    else if (d.method) onEvent(d.method, d.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

/** One page load of a game. Returns the page (still open) and what was recorded. */
async function load(target, slug, { save = "", mobile = false, width = 1280, height = 720 } = {}) {
  const rec = { calls: [], requests: [], outside: [], errors: [], bytes: 0, bytesAtReady: null, readyAt: null, failedLoads: [] };
  const sizes = new Map();
  const started = Date.now();
  const page = await connect(target, (method, p) => {
    if (method === "Runtime.bindingCalled" && p.name === "__yt") {
      const e = JSON.parse(p.payload);
      rec.calls.push(e);
      if (e.name === "gameReady" && rec.readyAt === null) { rec.readyAt = Date.now() - started; rec.bytesAtReady = rec.bytes; }
    } else if (method === "Runtime.exceptionThrown") rec.errors.push(p.exceptionDetails.exception?.description?.split("\n")[0] ?? p.exceptionDetails.text);
    else if (method === "Runtime.consoleAPICalled" && p.type === "error") rec.errors.push("console.error: " + p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    else if (method === "Log.entryAdded" && p.entry.level === "error") rec.errors.push(`${p.entry.source}: ${p.entry.text.slice(0, 200)}`);
    else if (method === "Network.requestWillBeSent") {
      const u = p.request.url;
      rec.requests.push(u);
      if (!u.startsWith(BASE) && !u.startsWith(SDK) && !/^(data|blob):/.test(u)) rec.outside.push(u);
    } else if (method === "Network.loadingFinished") { rec.bytes += p.encodedDataLength; sizes.set(p.requestId, p.encodedDataLength); }
    else if (method === "Network.loadingFailed" && !p.canceled) rec.failedLoads.push(p.errorText);
    else if (method === "Fetch.requestPaused") {
      // The SDK request: answered with the stand-in.
      page.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/javascript" }], body: Buffer.from(MOCK_SDK).toString("base64") });
    }
  });
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Performance.enable");
  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.send("Fetch.enable", { patterns: [{ urlPattern: `${SDK}*` }] });
  await page.send("Runtime.addBinding", { name: "__yt" });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await page.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await page.send("Emulation.setEmitTouchEventsForMouse", { enabled: mobile, configuration: mobile ? "mobile" : "desktop" });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE(save) });
  await page.send("Page.navigate", { url: `${BASE}/${slug}/` });
  const deadline = Date.now() + 45_000;
  while (rec.readyAt === null && Date.now() < deadline) await sleep(250);
  await sleep(2000); // let the menu settle
  return { page, rec };
}

const results = [];
function report(slug, level, text) {
  results.push({ slug, level, text });
  console.log(`  ${level === "fail" ? "✗ FAIL" : level === "warn" ? "! warn" : "✓ ok  "}  ${text}`);
}

/** Bundle files: forbidden APIs that show in the code, whether or not this run reached them. */
function scanBundle(slug) {
  const dir = path.join(DIST, slug);
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const a = path.join(d, e.name); if (e.isDirectory()) walk(a); else files.push(a); } };
  walk(dir);
  const total = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  const big = files.filter((f) => fs.statSync(f).size > 512 * 1024).map((f) => `${path.relative(dir, f)} ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
  report(slug, total < 250 * MiB ? "ok" : "fail", `total bundle ${(total / MiB).toFixed(1)} MiB (limit 250), ${files.length} files (limit 8000)`);
  if (big.length) report(slug, "warn", `files over 512 KiB (YouTube: should be smaller): ${big.join(", ")}`);
  const PATTERNS = [
    // three.js's Timer carries it too (unused unless connect(document) is called): the runtime check decides.
    [/visibilitychange|document\.hidden|visibilityState/, "Page Visibility API in the code (YouTube: MUST NOT use; see the runtime check)", "warn"],
    [/\b(localStorage|sessionStorage|indexedDB)\b/, "browser storage in the code (only saveData may keep progress)", "warn"],
    [/\bWebAssembly\b|\.wasm\b/, "WebAssembly (YouTube may decline games it can't scan)", "warn"],
    [/\bnew Worker\(|\bnew SharedWorker\(/, "web workers (YouTube may decline games it can't scan)", "warn"],
    [/\beval\(/, "eval() (YouTube may decline games it can't scan)", "warn"],
    [/navigator\.clipboard|execCommand\(["']copy/, "clipboard", "warn"],
    [/window\.open\(|requestFullscreen|orientation\.lock\(/, "window.open / full screen / orientation lock", "warn"],
  ];
  for (const [re, what, level] of PATTERNS) {
    const hits = files.filter((f) => /\.(js|html)$/.test(f) && re.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(dir, f));
    if (hits.length) report(slug, level, `${what}: ${hits.join(", ")}`);
  }
}

async function checkGame(slug, target) {
  console.log(`\n${slug}`);
  fs.mkdirSync(path.join(OUT, slug), { recursive: true });
  scanBundle(slug);

  // 1. New player, desktop.
  const { page, rec } = await load(target, slug);
  const names = rec.calls.map((c) => c.name);
  const at = (n) => rec.calls.find((c) => c.name === n)?.t;
  if (at("firstFrameReady") === undefined) report(slug, "fail", "firstFrameReady never called");
  else report(slug, "ok", `firstFrameReady at ${at("firstFrameReady")} ms`);
  if (at("gameReady") === undefined) report(slug, "fail", "gameReady never called (45 s)");
  else {
    if (names.indexOf("gameReady") < names.indexOf("firstFrameReady")) report(slug, "fail", "gameReady came before firstFrameReady");
    report(slug, rec.readyAt < 5000 ? "ok" : "warn", `gameReady ${(rec.readyAt / 1000).toFixed(1)} s after the page opened (YouTube: should be < 5 s; headless Chrome draws in software, so real devices are faster)`);
    report(slug, rec.bytesAtReady < 15 * MiB ? "ok" : rec.bytesAtReady < 30 * MiB ? "warn" : "fail", `initial download (to gameReady) ${(rec.bytesAtReady / MiB).toFixed(2)} MiB (MUST < 30, should < 15)`);
  }
  if (names.filter((n) => n === "gameReady").length > 1) report(slug, "warn", "gameReady called more than once");
  for (const k of ["onpause", "onresume", "onaudio"]) if (!names.includes(k)) report(slug, "fail", `never subscribed to ${k === "onaudio" ? "onAudioEnabledChange" : k === "onpause" ? "onPause" : "onResume"}`);
  if (!names.includes("loadData")) report(slug, "warn", "loadData not called before the menu (cloud save not read)");
  const early = rec.calls.filter((c) => c.name === "saveData" && c.early);
  if (early.length) report(slug, "fail", `saveData called ${early.length}× before loadData finished (YouTube rejects these)`);
  // A click in a corner: the player's first gesture, which starts the game's audio.
  for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x: 4, y: 4, button: "left", clickCount: 1 });
  await sleep(800);
  if (rec.outside.length) report(slug, "fail", `requests outside the bundle: ${[...new Set(rec.outside)].slice(0, 5).join(", ")}`);
  else report(slug, "ok", `${rec.requests.length} requests, all inside the bundle`);
  if (rec.failedLoads.length) report(slug, "fail", `failed loads: ${[...new Set(rec.failedLoads)].slice(0, 5).join(", ")}`);
  const probe = await page.evaluate("({ storage: __probe.storage, listeners: [...new Set(__probe.listeners)], csp: __probe.csp })");
  if (probe.storage.length) report(slug, "fail", `browser storage used: ${[...new Set(probe.storage)].slice(0, 5).join(", ")}`);
  if (probe.listeners.length) report(slug, "fail", `Page Visibility / lifecycle API used: ${probe.listeners.join(", ")}`);
  if (probe.csp.length) report(slug, "fail", `blocked by YouTube's CSP: ${[...new Set(probe.csp)].slice(0, 5).join(", ")}`);

  // Pause / resume / mute.
  const draws = () => page.evaluate("__probe.draws");
  let d = await draws(); await sleep(1000); const running = (await draws()) - d;
  await page.evaluate("__ytFire('pause')"); await sleep(400);
  d = await draws(); await sleep(1500); const paused = (await draws()) - d;
  const soundPaused = await page.evaluate("__sound()");
  await page.evaluate("__ytFire('resume')"); await sleep(400);
  d = await draws(); await sleep(1000); const resumed = (await draws()) - d;
  if (!running) report(slug, "warn", "the menu draws nothing on its own, so pause could not be measured");
  else report(slug, paused === 0 ? "ok" : "fail", `pause: ${running} draws/s while running → ${paused} in 1.5 s paused → ${resumed}/s after resume`);
  if (running && !resumed) report(slug, "fail", "nothing drawn after onResume");
  if (soundPaused.running || soundPaused.media) report(slug, "fail", `sound still running while paused (${soundPaused.running} audio contexts, ${soundPaused.media} media)`);
  await page.evaluate("__ytFire('audio', false)"); await sleep(400);
  const soundMuted = await page.evaluate("__sound()");
  await page.evaluate("__ytFire('audio', true)");
  if (soundMuted.running || soundMuted.media) report(slug, "fail", `sound still running while YouTube is muted (${soundMuted.running} audio contexts, ${soundMuted.media} media)`);
  else report(slug, "ok", `mute & pause silence the game (${soundMuted.contexts} audio contexts made)`);

  // Esc must reach the browser.
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  const esc = await page.evaluate("__probe.escPrevented");
  report(slug, esc ? "fail" : "ok", esc ? "preventDefault() called on Esc" : "Esc not blocked");

  // Aspect ratios, resized in place (the game must keep its state).
  const RATIOS = [["9x32", 9, 32], ["9x21", 9, 21], ["9x16", 9, 16], ["3x4", 3, 4], ["1x1", 1, 1], ["4x3", 4, 3], ["16x9", 16, 9], ["21x9", 21, 9], ["32x9", 32, 9]];
  const errorsBefore = rec.errors.length;
  const layout = [];
  for (const [name, a, b] of RATIOS) {
    const w = a >= b ? 1280 : Math.round((720 * a) / b), h = a >= b ? Math.round((1280 * b) / a) : 720;
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(900);
    const shot = await page.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, slug, `${name}.png`), Buffer.from(shot.data, "base64"));
    const m = await page.evaluate(`(() => { const d = document.documentElement; const c = [...document.querySelectorAll("canvas")].map((e) => e.getBoundingClientRect()).sort((x, y) => y.width * y.height - x.width * x.height)[0]; return { sx: d.scrollWidth > innerWidth + 1, sy: d.scrollHeight > innerHeight + 1, c: c ? [Math.round(c.width), Math.round(c.height)] : null }; })()`);
    if (m.sx || m.sy) layout.push(`${name} scrolls`);
    if (m.c && (m.c[0] < w * 0.95 && m.c[1] < h * 0.95)) layout.push(`${name} canvas ${m.c[0]}×${m.c[1]} in ${w}×${h}`);
  }
  report(slug, layout.length ? "warn" : "ok", layout.length ? `layout: ${layout.join("; ")}` : `all 9 aspect ratios fill the screen (screenshots in dist-playables/_check/${slug})`);
  if (rec.errors.length > errorsBefore) report(slug, "fail", `errors while resizing: ${rec.errors.slice(errorsBefore, errorsBefore + 3).join(" | ")}`);
  const heap = (await page.send("Performance.getMetrics").catch(() => null))?.metrics?.find((m) => m.name === "JSHeapUsedSize")?.value;
  const saved = await page.evaluate("window.__ytSaved ?? ''");
  if (heap) report(slug, heap < 512 * MiB ? "ok" : "fail", `JS heap ${(heap / MiB).toFixed(0)} MB (limit 512)`);
  if (rec.errors.length) report(slug, "fail", `errors on load 1: ${[...new Set(rec.errors)].slice(0, 4).join(" | ")}`);
  if (saved && new Blob([saved]).size > 3 * MiB) report(slug, "fail", "save over 3 MiB");
  page.close();

  // 2. The save from load 1 (or a made-up one), on an upright phone with touch.
  const old = saved || JSON.stringify({ version: 0, best: 12, coins: 40 });
  const two = await load(target, slug, { save: old, mobile: true, width: 390, height: 844 });
  if (two.rec.readyAt === null) report(slug, "fail", "with an earlier save on a phone: gameReady never came");
  else if (two.rec.errors.length) report(slug, "fail", `with an earlier save on a phone: ${[...new Set(two.rec.errors)].slice(0, 3).join(" | ")}`);
  else report(slug, "ok", `loads an earlier save on a touch phone (${saved ? `${new Blob([saved]).size} B save from load 1` : "made-up save"})`);
  const shot = await two.page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, slug, "phone-touch.png"), Buffer.from(shot.data, "base64"));
  two.page.close();

  // 3. A broken save.
  const three = await load(target, slug, { save: "{broken" });
  if (three.rec.readyAt === null || three.rec.errors.length) report(slug, "fail", `a broken save breaks the game: ${three.rec.errors.slice(0, 2).join(" | ") || "no gameReady"}`);
  else report(slug, "ok", "a broken save starts clean");
  three.page.close();
}

// --- Run --------------------------------------------------------------------------------------------

if (!fs.existsSync(DIST)) { console.error("check-playables: nothing built — run `npm run playables:build -- all` first"); process.exit(1); }
const built = fs.readdirSync(DIST, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("_") && fs.existsSync(path.join(DIST, e.name, "index.html"))).map((e) => e.name);
const arg = process.argv[2];
const slugs = arg ? [arg] : built;
if (slugs.some((s) => !built.includes(s))) { console.error(`check-playables: "${arg}" is not built (have: ${built.join(", ")})`); process.exit(1); }

const server = spawn(process.execPath, [path.join(import.meta.dirname, "serve-playables.mjs")], { env: { ...process.env, PORT: String(SERVE_PORT) }, stdio: "ignore" });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "playables-check-"));
const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--no-first-run", "--hide-scrollbars", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
try {
  let targets;
  for (let i = 0; i < 100 && !targets; i++) { await sleep(200); targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json(), () => null); }
  if (!targets) throw new Error(`Chrome did not start (${CHROME})`);
  for (let i = 0; i < 50 && !(await fetch(BASE).then((r) => r.ok, () => false)); i++) await sleep(200);
  for (const slug of slugs) {
    // A fresh tab per game.
    const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
    try {
      await checkGame(slug, tab.webSocketDebuggerUrl);
    } catch (err) {
      report(slug, "fail", `checker crashed: ${err.message}`);
    }
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`).catch(() => {});
  }
} finally {
  chrome.kill();
  server.kill();
  await sleep(1500);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* Chrome still holds it on Windows; the temp folder clears later */ }
}

console.log("\nSummary");
for (const slug of slugs) {
  const f = results.filter((r) => r.slug === slug && r.level === "fail").length;
  const w = results.filter((r) => r.slug === slug && r.level === "warn").length;
  console.log(`  ${f ? "✗" : "✓"} ${slug.padEnd(14)} ${f} fail, ${w} warn`);
}
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.level === "fail") ? 1 : 0);
