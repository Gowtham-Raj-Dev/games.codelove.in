/* AZ — player, objectives, HUD, input (keyboard / mouse / touch), map and the main loop. */
(function () {
  const K = window.K, W = K.world, C = K.brain;
  const $ = (id) => document.getElementById(id);
  const PI = Math.PI;
  const touchMode = matchMedia("(pointer: coarse)").matches || /[?&]touch/.test(location.search);
  if (touchMode) document.documentElement.classList.add("touch");

  /* ---------------- language ---------------- */
  const TX = {
    en: {
      listTitle: "SHOPPING LIST", obj0: "Collect the 8 items on your list", obj1: "Pay at the register", obj2: "RUN! Escape through the emergency exit",
      pick: "Pick up", hide: "Hide inside", leave: "Come out", pay: "Pay & scan", aisle: "Aisle", cans: "Throwables",
      start: "Push the cart. Find everything on the list.", sound: "Something is moving in the dark...", spotted: "It saw you! RUN!", search: "It is searching for you...",
      dark: "The lights died!", locked: "Locked. Collect everything and pay first.", paid: "BEEP. The emergency exit unlocked. It heard the alarm. RUN!", got: "Got it",
      needPay: "Everything collected. Now pay at the register.", thrown: "Clink! It looks that way...", nocans: "Nothing left to throw.", hidden: "You are hiding. Hold still...",
      dead1: "The cart is standing alone now...", dead2: "It knows your name. Can you hear it?", dead3: "Nobody leaves this store.", dead4: "Next time run. Do not stop.",
      tip: "Tip: hide in a locker marked HIDE when it hunts you.", pausedT: "PAUSED", resume: "RESUME", retry: "TRY AGAIN", again: "PLAY AGAIN",
      time: "Time", items: "items", ldg: "Loading the store...", map: "STORE MAP", you: "You", exit: "Exit", reg: "Register",
    },
  };
  const lang = "en";
  const t = (k) => (TX[lang] && TX[lang][k]) || TX.en[k] || k;
  function applyLang() {
    document.documentElement.lang = lang; document.documentElement.dataset.lang = lang;
    $("listTitle").textContent = t("listTitle");
    buildList(); updateObjective();
  }
  

  /* ---------------- renderer / scene ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  // Sharp on phones too: render at the screen's own density (up to 2x). If a device can't keep up, the
  // resolution steps down a little at a time (see fitQuality) instead of starting low and looking blocky.
  const DPR = window.devicePixelRatio || 1, PR_MAX = Math.min(DPR, 2), PR_MIN = Math.min(DPR, touchMode ? 1.3 : 1);
  let pixelRatio = PR_MAX;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  K.maxAniso = renderer.capabilities.getMaxAnisotropy();
  let qT = 0, qN = 0, qWait = 4;
  function fitQuality(dt) {
    if (state !== "play") return;
    if ((qWait -= dt) > 0) return; // let shaders compile and the first frames settle
    qT += dt; qN++;
    if (qT < 2.5) return;
    const fps = qN / qT; qT = 0; qN = 0;
    let next = pixelRatio;
    if (fps < 42 && pixelRatio > PR_MIN) next = Math.max(PR_MIN, pixelRatio - 0.25);
    else if (fps > 57 && pixelRatio < PR_MAX) next = Math.min(PR_MAX, pixelRatio + 0.25);
    if (next !== pixelRatio) { pixelRatio = next; renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight); qWait = 2; }
  }
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; K.renderer = renderer;
  $("game").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06090b);
  scene.fog = new THREE.FogExp2(0x050808, 0.038);
  const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 120);
  camera.rotation.order = "YXZ"; scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x566a6e, 0x1a1612, 0.3));
  addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

  /* flashlight + faint fill on the camera */
  const spot = new THREE.SpotLight(0xfff1d6, 4.4, 40, 0.5, 0.6, 1.2);
  spot.position.set(0.2, -0.15, 0); camera.add(spot);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.4; spot.shadow.camera.far = 36; spot.shadow.bias = -0.0006; spot.shadow.radius = 3;
  const spotT = new THREE.Object3D(); spotT.position.set(0.05, -0.05, -6); camera.add(spotT); spot.target = spotT;
  const fill = new THREE.PointLight(0x9fb4a0, 0.22, 6, 2); camera.add(fill);
  // visible light shaft + floating dust, only while the torch is on
  const beam = new THREE.Mesh(new THREE.ConeGeometry(5.2, 16, 28, 1, true).rotateX(PI / 2).translate(0, 0, -8), new THREE.MeshBasicMaterial({ color: 0xfff2d6, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.set(0.2, -0.15, 0); camera.add(beam);
  const DUST = 420, dustPos = new Float32Array(DUST * 3); for (let i = 0; i < DUST; i++) { dustPos[i * 3] = (Math.random() - 0.5) * 16; dustPos[i * 3 + 1] = Math.random() * 3.2; dustPos[i * 3 + 2] = (Math.random() - 0.5) * 16; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.03, color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })); dust.frustumCulled = false; dust.visible = false; /* floating dust removed: looked like flying specks */
  function updateDust(dt, on) { dust.visible = on; if (!on) return; const a = dustGeo.attributes.position.array; for (let i = 0; i < DUST; i++) { a[i * 3] += Math.sin(gameTime * 0.3 + i) * 0.04 * dt; a[i * 3 + 1] += (Math.cos(gameTime * 0.4 + i * 1.7) * 0.03 - 0.01) * dt; a[i * 3 + 2] += Math.cos(gameTime * 0.25 + i * 0.7) * 0.04 * dt; if (a[i * 3 + 1] < 0) a[i * 3 + 1] = 3.2; for (const k of [0, 2]) { if (a[i * 3 + k] > 8) a[i * 3 + k] -= 16; else if (a[i * 3 + k] < -8) a[i * 3 + k] += 16; } } dustGeo.attributes.position.needsUpdate = true; dust.position.set(camera.position.x, 0, camera.position.z); }

  /* ---------------- state ---------------- */
  const P = { x: 0, z: 0, yaw: PI, pitch: 0, vx: 0, vz: 0, stam: 100, stamLock: 0, crouch: false, eye: 1.65, bob: 0, stepT: 0, speed: 0, flash: true, noise: 1, hidden: null, cans: 4 };
  const keys = {};
  const IN = { fwd: 0, str: 0, run: false };
  let state = "loading"; // loading | menu | play | caught | dead | win
  let M = null, collected = 0, paid = false, phase2 = false, gameTime = 0, fear = 0, chaseAmt = 0, hbT = 0, eventT = 20, paT = 40, blT = 60, jumpT = 0, msgTimer = null, promptKind = null, promptTarget = null, mapOpen = false;
  let cart = null, cartItems = null, savedFlash = true, lastPromptKind = null;

  /* ---------------- HUD helpers ---------------- */
  function showMsg(text, ms) { const m = $("msg"); m.textContent = text; m.style.opacity = 1; clearTimeout(msgTimer); msgTimer = setTimeout(() => (m.style.opacity = 0), ms || 4200); }
  const msgKey = (k) => showMsg(t(k), k === "paid" ? 6500 : 3200);
  function buildList() {
    const el = $("itemsIn"); el.innerHTML = "";
    (W.items || []).forEach((it, i) => {
      const d = document.createElement("div"); d.className = "it" + (it.got ? " done" : ""); d.id = "it" + i;
      const nm = it.def.en, h = it.def.hEn;
      d.innerHTML = '<b></b><small></small>'; d.firstChild.textContent = nm; d.lastChild.textContent = h; el.appendChild(d);
    });
  }
  function updateObjective() { $("listCount").textContent = collected + "/8"; $("obj").textContent = !paid ? (collected < 8 ? t("obj0") + "  (" + collected + "/8)" : t("obj1")) : t("obj2"); $("cans").textContent = t("cans") + ": " + P.cans; }

  /* ---------------- player cart ---------------- */
  const CART_D = 1.35; // how far ahead of the player the cart centre rides
  function buildCart() {
    cart = W.makeCart(); cartItems = new THREE.Group(); cart.add(cartItems); cart.add(buildHands()); scene.add(cart);
  }
  // two first-person hands gripping the cart handle bar (cart-local space: +z points back towards the player)
  function buildHands() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc99a7a, roughness: 0.75 }), sleeve = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.9 });
    const limb = (a, b, r0, r1, mat) => {
      const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, v.length(), 12), mat);
      m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = true; g.add(m); return m;
    };
    [-1, 1].forEach((s) => {
      // shoulder sits behind/below the camera (player is ~1.23 local units behind cart centre), so the arm leaves the bottom of the screen with no gap
      const wrist = new THREE.Vector3(s * 0.2, 0.9, 0.5), elbow = new THREE.Vector3(s * 0.3, 1.0, 1.45);
      limb(elbow, wrist, 0.032, 0.02, sleeve);                                                 // forearm in sleeve
      limb(wrist.clone().add(new THREE.Vector3(0, -0.005, 0.01)), wrist.clone().add(new THREE.Vector3(0, 0.0, -0.01)), 0.028, 0.028, skin); // wrist cuff
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.1), skin); fist.position.set(s * 0.2, 0.855, 0.5); fist.castShadow = true; g.add(fist); // knuckles over the bar
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.09, 10).rotateZ(PI / 2), skin); wrap.position.set(s * 0.2, 0.835, 0.5); g.add(wrap); // fingers wrapped round the bar
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.06), skin); thumb.position.set(s * 0.2 - s * 0.045, 0.875, 0.5); thumb.rotation.z = s * 0.4; g.add(thumb);
    });
    return g;
  }
  function addToCart(def) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.09), new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 }));
    const n = cartItems.children.length; m.position.set(-0.15 + (n % 3) * 0.15, 0.43, -0.22 + Math.floor(n / 3) * 0.24); m.rotation.y = Math.random() * 3; m.castShadow = true; cartItems.add(m);
  }
  function placeCart(bobY) { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); cart.scale.setScalar(1.1); cart.position.set(P.x + fx * CART_D, bobY, P.z + fz * CART_D); cart.rotation.y = P.yaw; }

  /* ---------------- game flow ---------------- */
  function resetGame() {
    W.resetItems(); W.closeDoor(); cartItems.clear(); collected = 0; paid = false; phase2 = false; gameTime = 0; W.blackout = 0;
    Object.assign(P, { x: W.spawn.x, z: W.spawn.z, yaw: W.spawn.yaw, pitch: 0, vx: 0, vz: 0, stam: 100, stamLock: 0, crouch: false, eye: 1.65, flash: true, hidden: null, cans: 4, noise: 1 });
    cart.visible = true; K.resetCreature(); fear = 0; chaseAmt = 0; jumpT = 0; eventT = 20; paT = 35; blT = 55; mapOpen = false; $("mapWrap").classList.remove("on");
    buildList(); updateObjective();
  }
  function hideAll() { ["menu", "pause", "dead", "win"].forEach((id) => $(id).classList.add("hidden")); }
  function lock() { if (!touchMode && renderer.domElement.requestPointerLock) { try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }
  // Phones: full screen + lock to landscape (browsers only allow that from a tap, on a full screen page).
  // Where the browser can't lock (iPhone Safari), the page around the game turns it sideways instead.
  function goLandscape() {
    if (!touchMode) return;
    let doc = document; try { if (parent !== window && parent.document) doc = parent.document; } catch (e) {}
    const root = doc.documentElement, isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock("landscape").catch(() => {}); } catch (e) {} };
    if (isFs) { lock(); return; }
    const full = (el, onFail) => {
      try {
        const req = el.requestFullscreen ? el.requestFullscreen({ navigationUI: "hide" }) : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
        if (req && req.then) req.then(lock, onFail); else lock();
      } catch (e) { onFail(); }
    };
    full(root, () => { if (root !== document.documentElement) full(document.documentElement, () => {}); });
  }
  function startGame() {
    goLandscape(); SFX.init(); SFX.resume(); SFX.uiConfirm(); resetGame(); hideAll(); $("hud").style.display = "block"; state = "play"; lock();
    setTimeout(() => state === "play" && showMsg(t("start"), 5200), 700);
    setTimeout(() => state === "play" && msgKey("sound"), 11000);
  }
  function pauseGame() { if (state !== "play") return; $("pause").classList.remove("hidden"); SFX.uiBack(); setTimeout(() => $("pause").classList.contains("hidden") || SFX.suspend(), 180); IN.fwd = IN.str = 0; }
  function resumeGame() { if (state !== "play") return; goLandscape(); $("pause").classList.add("hidden"); SFX.resume(); SFX.uiToggle(true); lock(); }
  $("startBtn").onclick = startGame; $("retryBtn").onclick = startGame; $("againBtn").onclick = startGame; $("resumeBtn").onclick = resumeGame;
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (!locked && state === "play" && !touchMode) pauseGame();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== renderer.domElement || state !== "play") return;
    look(e.movementX, e.movementY, 0.0022);
  });
  function look(dx, dy, k) {
    if (P.hidden != null) { const h = W.hides[P.hidden], base = Math.atan2(-h.ox, -h.oz); P.yaw = Math.max(base - 0.9, Math.min(base + 0.9, P.yaw - dx * k)); }
    else P.yaw -= dx * k;
    P.pitch = Math.max(-0.22, Math.min(0.35, P.pitch - dy * k));
  }
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (state !== "play") return;
    if (e.code === "Space" || e.code === "Tab") e.preventDefault();
    if (e.code === "KeyF" && P.hidden == null) toggleFlash();
    if (e.code === "KeyC" || e.code === "ControlLeft") { P.crouch = !P.crouch; SFX.tone("sine", P.crouch ? 210 : 150, P.crouch ? 130 : 220, 0.09, 0.035); }
    if (e.code === "KeyE") act();
    if (e.code === "KeyQ") throwCan();
    if (e.code === "KeyM" || e.code === "Tab") toggleMap();
    if (e.code === "KeyL") toggleList();
    if (e.code === "KeyN") SFX.setMuted(!SFX.muted);
    if (e.code === "KeyP") (document.pointerLockElement ? document.exitPointerLock() : pauseGame());
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  /* ---- shopping list: expand / collapse ---- */
  let listOpen = true; try { listOpen = localStorage.getItem("aisle-zero-list") !== "0"; } catch (e) {}
  function setList(v, snd) { listOpen = v; $("list").classList.toggle("closed", !v); $("listHead").setAttribute("aria-expanded", String(v)); try { localStorage.setItem("aisle-zero-list", v ? "1" : "0"); } catch (e) {} if (snd) SFX.uiToggle(v); }
  function toggleList() { setList(!listOpen, true); }
  $("listHead").addEventListener("click", toggleList); $("listHead").title = "Show / hide the list (L)";
  setList(listOpen, false);
  /* ---- pickup feedback: toast, screen glow and a pulse on the list row ---- */
  let toastT = null;
  function pickFx(it) {
    const tt = $("toast"); tt.textContent = "+ " + it.def.en + "   " + collected + "/8"; tt.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => tt.classList.remove("on"), 2000);
    const pf = $("pickflash"); pf.style.transition = "none"; pf.style.opacity = 1; requestAnimationFrame(() => { pf.style.transition = "opacity .7s"; pf.style.opacity = 0; });
    const row = $("it" + W.items.indexOf(it)); if (row) { row.classList.remove("just"); void row.offsetWidth; row.classList.add("just"); }
    const lc = $("listCount"); lc.style.color = "#ffe08a"; setTimeout(() => (lc.style.color = ""), 700);
    SFX.ding(); setTimeout(() => SFX.tone("sine", 990, 990, 0.35, 0.04), 90);
  }
  /* ---- click sounds, hover ticks and ripple on every button ---- */
  let lastHover = null;
  document.addEventListener("pointerdown", (e) => {
    SFX.init(); SFX.resume();
    const b = e.target.closest && e.target.closest("button"); if (!b) return;
    SFX.uiClick();
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement("span"); s.className = "rip";
    s.style.width = s.style.height = d + "px"; s.style.left = e.clientX - r.left - d / 2 + "px"; s.style.top = e.clientY - r.top - d / 2 + "px"; b.appendChild(s); setTimeout(() => s.remove(), 600);
  }, true);
  document.addEventListener("pointerover", (e) => { const b = e.target.closest && e.target.closest("button"); if (b && b !== lastHover) { lastHover = b; if (SFX.ready) SFX.uiHover(); } else if (!b) lastHover = null; });
  addEventListener("keydown", () => SFX.init(), { once: true });
  $("ctrlBtn").addEventListener("click", () => { const o = $("keysBox").classList.toggle("open"); $("ctrlBtn").setAttribute("aria-expanded", String(o)); SFX.uiToggle(o); });

  function toggleFlash() { P.flash = !P.flash; SFX.tone("square", 1200, 900, 0.04, 0.05); }
  function toggleMap() { mapOpen = !mapOpen; $("mapWrap").classList.toggle("on", mapOpen); SFX.uiToggle(mapOpen); }

  /* ---------------- actions ---------------- */
  function act() {
    if (state !== "play") return;
    if (P.hidden != null) { leaveHide(); return; }
    if (promptKind === "item") pickup(promptTarget);
    else if (promptKind === "hide") enterHide(promptTarget);
    else if (promptKind === "pay") doPay();
  }
  function pickup(it) {
    if (!it || it.got) return;
    it.got = true; it.group.visible = false; collected++;
    const e = $("it" + W.items.indexOf(it)); if (e) e.classList.add("done");
    SFX.pickup(); pickFx(it); addToCart(it.def);
    if (C.mode !== "chase" && C.mode !== "dormant") { C.mode = "investigate"; C.target = [P.x, P.z]; C.fieldG = null; C.investT = 6; }
    if (collected === 3) showMsg(t("sound"), 3200);
    if (collected === 5) { W.blackout = 3.5; msgKey("dark"); }
    else if (collected === 8) showMsg(t("needPay"), 5500);
    updateObjective();
  }
  function doPay() {
    if (paid) return;
    if (collected < 8) { msgKey("locked"); return; }
    paid = true; phase2 = true; SFX.beep(); setTimeout(() => SFX.beep(), 160); setTimeout(() => SFX.beep(), 320);
    setTimeout(() => { SFX.alarm(); W.openDoor(); SFX.doorOpen(); }, 500);
    msgKey("paid"); updateObjective();
    C.mode = "chase"; C.lastSeen = [P.x, P.z]; C.loseT = -4; C.roarT = 0; C.sawHide = null;
    setTimeout(() => SFX.roar(SFX.cp, 0.9), 900);
  }
  function enterHide(i) {
    const h = W.hides[i]; P.hidden = i; savedFlash = P.flash; P.flash = false; P.x = h.x; P.z = h.z; P.vx = P.vz = 0; P.crouch = false;
    P.yaw = Math.atan2(-h.ox, -h.oz); P.pitch = 0; cart.visible = false; SFX.hide(); showMsg(t("hidden"), 2500);
    const los = W.hasLOS(C.x, C.z, h.x + h.ox * 2, h.z + h.oz * 2, 0);
    if (C.mode === "chase" && los && Math.hypot(h.x - C.x, h.z - C.z) < 16) C.sawHide = [h.x, h.z];
  }
  function leaveHide() {
    const h = W.hides[P.hidden]; P.hidden = null; P.flash = savedFlash; P.x = h.x + h.ox * 2.1; P.z = h.z + h.oz * 2.1; cart.visible = true; P.eye = 1.65; SFX.hide(); W.collide(P, 0.5);
  }
  function throwCan() {
    if (P.hidden != null) return;
    if (P.cans <= 0) { showMsg(t("nocans"), 1800); return; }
    P.cans--; updateObjective(); SFX.throwSfx();
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let d = 0, x = P.x, z = P.z;
    while (d < 16) { const nx = P.x + fx * (d + 0.5), nz = P.z + fz * (d + 0.5); const hit = W.boxes.some((b) => b.kind !== "table" && nx > b.x0 && nx < b.x1 && nz > b.z0 && nz < b.z1) || Math.abs(nx) > W.XI || Math.abs(nz) > W.ZI; if (hit) break; d += 0.5; x = nx; z = nz; }
    setTimeout(() => {
      SFX.clang(0.7); showMsg(t("thrown"), 2200);
      if (C.mode === "patrol" || C.mode === "search" || C.mode === "investigate") { C.mode = "investigate"; C.target = [x, z]; C.fieldG = null; C.investT = 7; }
      else if (C.mode === "chase" && C.loseT > 0.2) { C.lastSeen = [x, z]; C.sawHide = null; }
    }, 450);
  }
  function caught() {
    if (state !== "play") return;
    state = "caught"; jumpT = 0; SFX.jump(); if (P.hidden != null) { const h = W.hides[P.hidden]; P.x = h.x + h.ox * 1.2; P.z = h.z + h.oz * 1.2; P.hidden = null; cart.visible = false; }
    C.mode = "chase";
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); C.x = P.x + fx * 1.5; C.z = P.z + fz * 1.5; C.yaw = Math.atan2(-fx, -fz);
    const f = $("flash"); f.style.transition = "none"; f.style.opacity = 1; setTimeout(() => { f.style.transition = "opacity .6s"; f.style.opacity = 0; }, 90);
    $("prompt").style.opacity = 0;
  }
  function endDead() {
    state = "dead"; document.exitPointerLock && document.exitPointerLock(); $("hud").style.display = "none";
    const lines = ["dead1", "dead2", "dead3", "dead4"]; $("deadTxt").textContent = t(lines[(Math.random() * 4) | 0]) + "  (" + collected + "/8 " + t("items") + ")"; $("deadTip").textContent = t("tip");
    $("dead").classList.remove("hidden"); SFX.lose(); if (SFX.ready) SFX.chaseG.gain.value = 0;
  }
  function winGame() {
    state = "win"; document.exitPointerLock && document.exitPointerLock(); $("hud").style.display = "none";
    const m = Math.floor(gameTime / 60), s = Math.floor(gameTime % 60); $("winStats").textContent = t("time") + ": " + m + "m " + s + "s";
    $("win").classList.remove("hidden"); SFX.win();
  }

  /* ---------------- map ---------------- */
  const mapC = $("map"), mg = mapC.getContext("2d");
  function drawMap() {
    const w = mapC.width, h = mapC.height, sc = Math.min(w / 72, h / 94);
    const X = (x) => w / 2 + x * sc, Z = (z) => h / 2 + z * sc;
    mg.clearRect(0, 0, w, h); mg.fillStyle = "rgba(8,12,12,.92)"; mg.fillRect(0, 0, w, h);
    mg.strokeStyle = "#5c6a5c"; mg.lineWidth = 2; mg.strokeRect(X(-W.XI), Z(-W.ZI), W.XI * 2 * sc, W.ZI * 2 * sc);
    W.boxes.forEach((b) => { mg.fillStyle = b.kind === "shelf" ? "#3a4a3e" : b.kind === "wall" ? "#6a766a" : b.kind === "door" ? "#a33" : "#4a4f46"; mg.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc); });
    W.hides.forEach((hd) => { mg.fillStyle = "#46d39a"; mg.beginPath(); mg.arc(X(hd.x), Z(hd.z), 3, 0, 7); mg.fill(); });
    mg.font = "bold 13px sans-serif"; mg.textAlign = "center";
    W.AISLES.forEach((a) => { mg.fillStyle = "#8a9a86"; mg.fillText("A" + a.n, X(a.x), Z(-22.6)); });
    W.items.forEach((it, i) => { if (it.got) return; mg.fillStyle = "#" + it.def.color.toString(16).padStart(6, "0"); mg.beginPath(); mg.arc(X(it.def.x), Z(it.def.z), 6, 0, 7); mg.fill(); mg.strokeStyle = "#000"; mg.lineWidth = 1.5; mg.stroke(); mg.fillStyle = "#000"; mg.font = "bold 9px sans-serif"; mg.fillText(String(i + 1), X(it.def.x), Z(it.def.z) + 3); mg.font = "bold 13px sans-serif"; });
    mg.fillStyle = paid ? "#e8d27a" : "#a89a60"; mg.fillRect(X(W.payPoint.x) - 7, Z(W.payPoint.z) - 5, 14, 10); mg.fillStyle = "#cfd8b0"; mg.fillText(t("reg"), X(W.payPoint.x), Z(W.payPoint.z) - 10);
    mg.fillStyle = paid ? "#40ff60" : "#ff4040"; mg.fillText(t("exit"), X(0), Z(-W.ZI) + 15);
    mg.save(); mg.translate(X(P.x), Z(P.z)); mg.rotate(-P.yaw); mg.fillStyle = "#fff"; mg.beginPath(); mg.moveTo(0, -9); mg.lineTo(6, 6); mg.lineTo(-6, 6); mg.closePath(); mg.fill(); mg.restore();
    mg.fillStyle = "#cfd8b0"; mg.textAlign = "left"; mg.fillText(t("map"), 14, 22);
  }

  /* ---------------- touch controls ---------------- */
  if (touchMode) {
    const stick = $("stick"), knob = $("knob"); let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
    addEventListener("touchstart", (e) => {
      if (state !== "play") return;
      for (const tc of e.changedTouches) {
        if (e.target.closest && e.target.closest(".tbtn")) continue;
        if (tc.clientX < innerWidth * 0.45 && sid == null) { sid = tc.identifier; sx = tc.clientX; sy = tc.clientY; stick.style.left = sx - 55 + "px"; stick.style.top = sy - 55 + "px"; stick.style.display = "block"; knob.style.transform = "translate(0,0)"; }
        else if (tc.clientX >= innerWidth * 0.45 && lid == null) { lid = tc.identifier; lx = tc.clientX; ly = tc.clientY; }
      }
    }, { passive: true });
    addEventListener("touchmove", (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === sid) { let dx = tc.clientX - sx, dy = tc.clientY - sy; const d = Math.hypot(dx, dy), m = 55; if (d > m) { dx = (dx / d) * m; dy = (dy / d) * m; } knob.style.transform = "translate(" + dx + "px," + dy + "px)"; IN.str = dx / m; IN.fwd = -dy / m; IN.run = d > m * 0.98; }
        else if (tc.identifier === lid) { look(tc.clientX - lx, tc.clientY - ly, 0.0048); lx = tc.clientX; ly = tc.clientY; }
      }
      if (state === "play") e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const tc of e.changedTouches) { if (tc.identifier === sid) { sid = null; IN.fwd = IN.str = 0; IN.run = false; stick.style.display = "none"; } if (tc.identifier === lid) lid = null; } };
    addEventListener("touchend", end); addEventListener("touchcancel", end);
    const bind = (id, fn) => { const b = $(id); b.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false }); b.addEventListener("click", fn); };
    bind("tAct", act); bind("tCrouch", () => (P.crouch = !P.crouch)); bind("tFlash", () => P.hidden == null && toggleFlash()); bind("tThrow", throwCan); bind("tMap", toggleMap); bind("tPause", pauseGame);
  }

  /* ---------------- main update ---------------- */
  function update(dt) {
    gameTime += dt;
    const playing = state === "play";
    if (playing && P.hidden == null) {
      const fwd = Math.max(-1, Math.min(1, (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + IN.fwd));
      const str = Math.max(-1, Math.min(1, (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + IN.str));
      P.stamLock = Math.max(0, P.stamLock - dt);
      const wantSprint = (keys.ShiftLeft || keys.ShiftRight || IN.run) && fwd > 0 && !P.crouch && P.stam > 0 && P.stamLock <= 0;
      let max = P.crouch ? 1.6 : 3.1;
      if (wantSprint) { max = 5.2; P.stam -= 16 * dt; if (P.stam <= 0) { P.stam = 0; P.stamLock = 3; SFX.exhale(); } }
      else if (P.stamLock <= 0) P.stam = Math.min(100, P.stam + (fwd || str ? 9 : 18) * dt); else P.stam = Math.min(100, P.stam + 6 * dt);
      let ix = str, iz = -fwd; const il = Math.hypot(ix, iz) || 1; if (il > 1) { ix /= il; iz /= il; }
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), mv = fwd || str ? 1 : 0;
      const tvx = (ix * cy + iz * sy) * max * mv, tvz = (-ix * sy + iz * cy) * max * mv, k = Math.min(1, dt * (mv ? 5 : 3));
      P.vx += (tvx - P.vx) * k; P.vz += (tvz - P.vz) * k; P.x += P.vx * dt; P.z += P.vz * dt;
      W.collide(P, 0.6); { const cx0 = P.x - Math.sin(P.yaw) * CART_D, cz0 = P.z - Math.cos(P.yaw) * CART_D, q = { x: cx0, z: cz0 }; W.collide(q, 0.5); P.x += q.x - cx0; P.z += q.z - cz0; W.collide(P, 0.6); } P.speed = Math.hypot(P.vx, P.vz);
      P.noise = P.speed < 0.3 ? 1.2 : wantSprint ? 15 : P.crouch ? 3 : 7;
      P.bob += dt * P.speed * (wantSprint ? 2.1 : 2.6);
      if (P.speed > 0.5) { P.stepT -= dt * P.speed; if (P.stepT <= 0) { P.stepT = 2.2; SFX.step(wantSprint ? 1.7 : P.crouch ? 0.4 : 1); } if (Math.random() < dt * (P.speed / 3) * 1.4) SFX.squeak(); }
      P.eye += ((P.crouch ? 1.05 : 1.65) - P.eye) * Math.min(1, dt * 8);
    } else if (P.hidden != null) { P.speed = 0; P.noise = 0.4; P.eye = 1.5; P.vx = P.vz = 0; P.stam = Math.min(100, P.stam + 14 * dt); }
    if (state === "caught") { jumpT += dt; P.vx = P.vz = 0; P.speed = 0; if (jumpT > 2) endDead(); }

    // camera
    const bobY = Math.sin(P.bob * 2) * 0.035 * Math.min(1, P.speed / 3), bobX = Math.cos(P.bob) * 0.02 * Math.min(1, P.speed / 3);
    camera.position.set(P.x + bobX, P.eye + bobY, P.z); camera.rotation.set(P.pitch, P.yaw, Math.sin(P.bob) * 0.004 * P.speed);
    if (state === "caught") {
      const ddx = C.x - P.x, ddz = C.z - P.z; camera.rotation.y = Math.atan2(-ddx, -ddz); camera.rotation.x = Math.atan2(1.9 - P.eye, Math.hypot(ddx, ddz));
      camera.position.x += (Math.random() - 0.5) * 0.08; camera.position.y += (Math.random() - 0.5) * 0.08;
    }
    placeCart(Math.abs(Math.sin(P.bob * 2)) * 0.012 * Math.min(1, P.speed / 3));
    if (window.AZ && window.AZ.camOverride) { const o = window.AZ.camOverride; camera.position.set(o.x, o.y, o.z); camera.lookAt(o.tx, o.ty, o.tz); }
    // flashlight (flickers when it is near)
    let fl = P.flash ? 4.4 : 0; const nearC = Math.hypot(C.x - P.x, C.z - P.z);
    if (P.flash && nearC < 14 && C.mode !== "dormant" && playing) { const f = Math.max(0, 1 - nearC / 14); if (Math.random() < f * 0.35) fl *= Math.random() < 0.4 ? 0 : 0.4; }
    spot.intensity = fl; fill.intensity = P.hidden != null ? 0.08 : 0.22; beam.visible = fl > 0; beam.material.opacity = 0.03 + 0.02 * Math.min(1, fl / 4); 
    // creature
    const ctx = { P, phase2, caught, msg: msgKey, playing, caughtPose: state === "caught" };
    let info = { dist: 99, sees: false };
    if (playing) info = K.creatureUpdate(dt, ctx);
    K.animateCreatures(dt, gameTime, P, ctx);

    // fear / chase meters
    const closeness = Math.max(0, 1 - info.dist / 24);
    const tf = C.mode === "dormant" ? 0 : closeness * (C.mode === "chase" ? 1 : 0.65);
    fear += (tf - fear) * Math.min(1, dt * (tf > fear ? 2 : 0.6));
    const tc = C.mode === "chase" && playing ? 1 : 0; chaseAmt += (tc - chaseAmt) * Math.min(1, dt * (tc > chaseAmt ? 3 : 0.8));
    if (state === "caught") { fear = 1; chaseAmt = 0; }
    $("fear").style.opacity = Math.min(1, fear * 1.05 + chaseAmt * 0.22);
    $("state").textContent = C.mode === "chase" && playing ? "RUN" : fear > 0.45 ? "IT IS NEAR" : ""; $("state").style.color = C.mode === "chase" ? "#e33" : "#a9a48f";
    $("stamI").style.width = P.stam + "%"; $("stamI").style.background = P.stamLock > 0 ? "#7a2a2a" : "#b4b49c";

    if (playing) {
      hbT -= dt; if (hbT <= 0) { if (fear > 0.12) { SFX.heartbeat(0.35 + fear * 0.6); hbT = 1.05 - fear * 0.6; } else hbT = 0.5; }
      eventT -= dt; if (eventT <= 0) { eventT = 14 + Math.random() * 22; const r = Math.random(); if (r < 0.5) SFX.clang(); else if (r < 0.8) SFX.whisper(); else SFX.noise(1.2, 0.1, "lowpass", 500, 80, 1); if (Math.random() < 0.35) W.blackout = 0.4 + Math.random() * 0.6; }
      paT -= dt; if (paT <= 0) { paT = 55 + Math.random() * 40; SFX.pa(); }
      blT -= dt; if (blT <= 0) { blT = 50 + Math.random() * 50; W.blackout = 2 + Math.random() * 2; if (Math.random() < 0.5) SFX.whisper(); }
      // what can the player interact with?
      promptKind = null; promptTarget = null; let txt = "";
      if (P.hidden != null) { promptKind = "leave"; txt = "[E]  " + t("leave"); }
      else {
        let bd = 2.7;
        W.items.forEach((it) => { if (it.got) return; const d = Math.hypot(it.def.x - P.x, it.def.z - P.z); if (d < bd) { bd = d; promptKind = "item"; promptTarget = it; } });
        if (promptKind === "item") txt = "[E]  " + t("pick") + ": " + (promptTarget.def.en);
        else {
          let hb = 2.8; W.hides.forEach((h, i) => { const d = Math.hypot(h.x + h.ox * 1.1 - P.x, h.z + h.oz * 1.1 - P.z); if (d < hb) { hb = d; promptKind = "hide"; promptTarget = i; } });
          if (promptKind === "hide") txt = "[E]  " + t("hide");
          else if (Math.hypot(W.payPoint.x - P.x, W.payPoint.z + 3 - P.z) < 3.2 && !paid && P.z > W.payPoint.z) { promptKind = "pay"; txt = "[E]  " + t("pay") + (collected < 8 ? "  (" + collected + "/8)" : ""); }
        }
      }
      if (promptKind !== lastPromptKind) { if (promptKind && promptKind !== "leave") SFX.tick(); lastPromptKind = promptKind; }
      const pr = $("prompt"); pr.textContent = txt.replace("[E]", touchMode ? "" : "[E]"); pr.style.opacity = promptKind ? 1 : 0;
      if (touchMode) $("tAct").classList.toggle("hot", !!promptKind);
      if (paid && W.door.open && P.z < -45.4 && Math.abs(P.x) < 1.5) winGame();
      if (!paid && P.z < -45.4 && Math.abs(P.x) < 1.6 && Math.random() < dt * 2) msgKey("locked");
      if (mapOpen) drawMap();
    }

    if (SFX.ready) { const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); SFX.update(dt, { chase: chaseAmt, fear, speed: P.speed, cx: C.x, cz: C.z, px: P.x, pz: P.z, fx, fz }); }
  }

  /* ---------------- boot + loop ---------------- */
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
    if (rawDt < 0.25 && $("pause").classList.contains("hidden")) fitQuality(rawDt);
    if (state === "play") { if (!$("pause").classList.contains("hidden")) { /* paused */ } else update(dt); }
    else if (state === "caught") update(dt);
    else if (state === "menu" || state === "dead" || state === "win") {
      gameTime += dt; const yaw = Math.sin(gameTime * 0.12) * 0.55;
      camera.position.set(W.spawn.x, 1.65, W.spawn.z); camera.rotation.set(-0.02, yaw, 0); spot.intensity = 4.4; cart.scale.setScalar(1.1); cart.position.set(W.spawn.x, 0, W.spawn.z - CART_D); cart.rotation.y = 0;
      K.animateCreatures(dt, gameTime, { x: 0, z: 99, yaw: 0 }, { playing: false });
    }
    if (W.panelMesh) { W.updateLights(dt, camera.position.x, camera.position.z); W.tick(dt, gameTime); }
    drawGrain();
    renderer.render(scene, camera);
    if (window.AZ) window.AZ.frames = (window.AZ.frames || 0) + 1;
  }

  // film grain: a few fine noise tiles, repeated at screen-pixel size (not one tiny image blown up into blocks)
  const grainEl = $("grain"), GRAIN = [];
  for (let n = 0; n < 4; n++) {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d"), img = g.createImageData(256, 256), dd = img.data;
    for (let i = 0; i < dd.length; i += 4) { const v = Math.random() * 255; dd[i] = dd[i + 1] = dd[i + 2] = v; dd[i + 3] = 255; }
    g.putImageData(img, 0, 0); GRAIN.push("url(" + c.toDataURL("image/png") + ")");
  }
  grainEl.style.backgroundSize = 256 / DPR + "px " + 256 / DPR + "px";
  let gframe = 0;
  function drawGrain() { if (gframe++ % 4) return; grainEl.style.backgroundImage = GRAIN[(gframe >> 2) % 4]; grainEl.style.backgroundPosition = ((Math.random() * 256) | 0) + "px " + ((Math.random() * 256) | 0) + "px"; }

  async function boot() {
    $("loadTxt").textContent = t("ldg");
    try {
      M = await K.loadAll((p) => { $("loadBar").style.width = Math.round(p * 100) + "%"; });
      W.build(scene, M); K.buildCreatures(scene, M); buildCart(); resetGame();
      C.mode = "dormant"; K.deer.holder.visible = false;
      state = "menu"; $("loading").classList.add("hidden"); $("menu").classList.remove("hidden"); applyLang();
      document.body.dataset.ready = "1";
    } catch (e) { console.error(e); $("loadTxt").textContent = "Could not load the store: " + (e && e.message ? e.message : e); }
  }
  applyLang();
  requestAnimationFrame(frame);
  boot();

  /* test / debug hooks */
  window.AZ = {
    scene, camera, renderer, P, C, W, K,
    start: startGame,
    setPose(x, z, yaw, pitch) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch || 0; },
    creatureAt(x, z, yaw) { C.x = x; C.z = z; C.yaw = yaw; C.mode = "dormant"; C.spawnDelay = 1e9; K.forceShow = true; K.deer.holder.visible = true; },
    get state() { return state; },
  };
})();




