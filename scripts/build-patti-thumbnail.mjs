#!/usr/bin/env node
/**
 * The cover picture for the Tamil Patti Veedu short (scripts/record-patti-shorts.mjs), for YouTube Shorts
 * and Instagram Reels:
 *   public/games/patti-veedu/shorts-ta-thumbnail.jpg   1080×1920
 *
 *   node scripts/build-patti-thumbnail.mjs             Paatti's scream
 *   node scripts/build-patti-thumbnail.mjs lantern     Paatti at the door with her lantern
 *
 * A frame of the game itself (run from public/games/patti-veedu/app on a virtual clock, as the short is),
 * with the title and a hook drawn over it in the game's own typefaces. Everything that matters sits in
 * the middle of the frame: Instagram's grid shows only the centre of a cover.
 *
 * Env: CHROME, OUT (another file to write to), AFTER (seconds after the catch, default 0.55).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "public", "games", "patti-veedu");
const GAME = pathToFileURL(path.join(DIR, "app", "index.html")).href + "?desk";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SHOT = process.argv[2] ?? "scream";
const OUT = process.env.OUT ?? path.join(DIR, SHOT === "scream" ? "shorts-ta-thumbnail.jpg" : `shorts-ta-thumbnail-${SHOT}.jpg`);
const AFTER = Number(process.env.AFTER ?? 0.55);
const PORT = 9359;
const W = 540;
const H = 960;
const DPR = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!["scream", "lantern"].includes(SHOT)) { console.error(`build-patti-thumbnail: no shot "${SHOT}" (have: scream, lantern)`); process.exit(1); }

/** Virtual clock: requestAnimationFrame and performance.now only move when stepped. */
const VIRTUAL_TIME = `(() => {
  const raf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  let on = false, now = 0, queue = [];
  window.__vt = { start() { on = true; now = realNow(); }, step(ms) { now += ms; const q = queue; queue = []; for (const cb of q) cb(now); } };
  window.requestAnimationFrame = (cb) => (on ? (queue.push(cb), queue.length) : raf(cb));
  performance.now = () => (on ? now : realNow());
  try { localStorage.setItem("kolusu.gfx2", JSON.stringify("high")); } catch (e) {}
})()`;

/** Sets the shot up, plays it to its frame, and draws the title over it. */
const STAGE = `(() => {
  const k = window.__kolusu, P = k.P, E = k.E, G = k.G;
  const st = document.createElement("style");
  st.textContent = \`.topbar,#roomLbl,#timeChip,#toast,#cross,#prompt,#stam,#joy,#joyHint,#hud .slot,#hud .acts,#deskKeys,#clickToPlay,#voiceSub,#hideTxt,#card,#rotate{display:none!important}
  #th{position:fixed;inset:0;z-index:99999;pointer-events:none;text-align:center;color:#f3e6d6;background:linear-gradient(180deg,rgba(4,1,2,.9) 0,rgba(4,1,2,.6) 24%,rgba(4,1,2,0) 40%,rgba(4,1,2,0) 58%,rgba(4,1,2,.8) 76%,rgba(4,1,2,.94) 100%)}
  canvas{filter:brightness(1.3) contrast(1.08) saturate(1.1)}
  #th .kick{position:absolute;left:0;right:0;top:214px}
  #th .kick b{display:inline-block;padding:8px 20px 6px;border-radius:999px;background:#c0160d;color:#fff;font:400 23px/1 "Special Elite",serif;letter-spacing:.14em;box-shadow:0 0 24px rgba(220,30,10,.7)}
  #th .ta{position:absolute;left:0;right:0;top:262px;white-space:nowrap;font:900 82px/1.05 "Catamaran","Noto Sans Tamil",sans-serif;color:#e21d10;-webkit-text-stroke:2px #2a0302;text-shadow:0 5px 0 #2a0302,0 0 30px rgba(230,30,10,.75),0 0 60px #000}
  #th .hook{position:absolute;left:18px;right:18px;top:628px;white-space:nowrap;font:900 47px/1.2 "Catamaran","Noto Sans Tamil",sans-serif;color:#fff;text-shadow:0 3px 0 #000,0 0 18px #000,0 0 36px #000}
  #th .hook i{font-style:normal;color:#ffd24a}
  #th .free{position:absolute;left:0;right:0;top:764px;font:400 27px/1 "Special Elite",serif;letter-spacing:.05em;color:#ffcf8a;text-shadow:0 0 12px #000}\`;
  document.head.appendChild(st);
  const th = document.createElement("div"); th.id = "th";
  th.innerHTML = '<div class="kick"><b>TAMIL HORROR GAME</b></div><div class="ta">பாட்டி வீடு</div><div class="hook"><i>5 ராத்திரி</i><br>தப்பிக்க முடியுமா?</div><div class="free">FREE · games.codelove.in</div>';
  document.body.appendChild(th);

  const reset = () => { G.state = "play"; G.timers.length = 0; G.overlay = null; P.wake = 0; P.crouch = false; const f = document.getElementById("fade"); f.style.transition = "none"; f.style.opacity = 0; };
  const paatti = (at, diff, yaw) => { k.noEnemy(false); E.reset(1, Object.assign({ speed: 1, vision: 0, ko: 28 }, diff || {}), at); E.wait = 1e9; E.yaw = yaw; E.lookBase = yaw; };
  const torch = (on) => { if (!!P.torch !== on) k.K.Game.toggleTorch(); };
  const step = () => window.__vt.step(1000 / 60);
  reset();
  if (${JSON.stringify(SHOT)} === "scream") {
    // the short's chase: she comes down the hall and catches the camera (her mind has dice in it: until she does)
    let n = 0, tries = 0;
    for (; tries < 8 && G.state !== "caught"; tries++) {
      reset(); torch(true); paatti({ x: 16.8, z: 17.2, lv: 0 }, { speed: 1.1, vision: 1 }, -Math.PI / 2); E.wait = 3; E.catchArmed = true;
      for (n = 0; n < 480 && G.state !== "caught"; n++) {
        // walking towards her, as in the short: she doesn't see someone standing still in the dark
        if (G.state === "play") { k.teleport(7.6 - 0.4 * Math.min(1, n / 180), 17.1, -Math.PI / 2, 0); P.pitch = 0.03; }
        step();
      }
    }
    if (G.state !== "caught") throw new Error("she never caught the camera: " + JSON.stringify({ state: E.state, mode: E.mode, wait: E.wait, x: E.x, z: E.z, active: E.active, noEnemy: G.noEnemy, px: P.x, pz: P.z, hidden: P.hidden }));
    for (let i = 0; i < ${Math.round(AFTER * 60)}; i++) step();
    return G.state + " after " + n + " frames";
  }
  torch(false); paatti({ x: 12, z: 21.25, lv: 0 }, null, 0);
  for (let i = 0; i < 100; i++) { k.teleport(12.25, 23.3, 0.07, 0); P.pitch = 0.06; step(); }
  return G.state;
})()`;

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
  return { send, evaluate };
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "patti-thumb-"));
let chrome = null;
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
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: VIRTUAL_TIME });
  await page.send("Page.navigate", { url: GAME });
  const deadline = Date.now() + 240_000;
  while (!(await page.evaluate(`!!(window.__kolusu && __kolusu.G.state === "menu")`).catch(() => false))) {
    if (Date.now() > deadline) throw new Error("the game did not load");
    await sleep(500);
  }
  // Start a run without the opening walk (as the game's own tests do).
  await page.evaluate(`(() => { const k = __kolusu; k.noEnemy(true); k.start(); k.G.state = "play"; k.G.timers.length = 0; document.getElementById("card").hidden = true; k.K.LampFX && k.K.LampFX.stop(); k.P.wake = 0; })()`);
  await page.evaluate(`Promise.all(['900 40px Catamaran', '30px "Special Elite"'].map((f) => document.fonts.load(f, "பாட்டி வீடு FREE")))`);
  await sleep(3000);
  await page.evaluate("__vt.start()");
  console.log(SHOT + ":", await page.evaluate(STAGE));
  const { data } = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await sharp(Buffer.from(data, "base64")).jpeg({ quality: 92, mozjpeg: true }).toFile(OUT);
  console.log(`${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
} finally {
  chrome?.kill();
  await sleep(600);
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
