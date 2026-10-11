/* Patti Veedu in YouTube Playables: the game's link to YouTube's SDK (window.ytgame, loaded just before this).
   scripts/build-playables.mjs copies this in as js/playables.js and points the game at window.PV:
   - saves go to YouTube's cloud save (one JSON document), never the browser's storage;
   - the game's scripts start only after the cloud save has loaded (PV.boot);
   - pause, resume and mute come from YouTube; while paused nothing runs and nothing sounds;
   - firstFrameReady when the loading screen is up, gameReady when the menu takes input;
   - the language follows YouTube's and is not saved;
   - the score YouTube shows is the number of escapes (kept in the save, shown under the best time). */
'use strict';
(function () {
  var yt = window.ytgame || null;
  var PV = window.PV = {
    doc: {}, loaded: false, paused: false, muted: false, onPause: null, onResume: null,
    lang: 'en', // YouTube's language arrives in boot(); the browser's own language APIs are off limits
    // mouse-and-keyboard computers get the desktop layout
    desk: window.matchMedia('(hover: hover) and (pointer: fine)').matches && !navigator.maxTouchPoints
  };
  /* While YouTube has the game paused nothing may run. The game has several animation loops (the house, the
     menu's lamp, the touch buttons) and a music timer: frames asked for while paused wait for the resume, and
     timers skip their turns. */
  var raf = window.requestAnimationFrame.bind(window), waiting = [];
  window.requestAnimationFrame = function (fn) {
    if (!PV.paused) return raf(fn);
    waiting.push(fn); return 0;
  };
  var every = window.setInterval.bind(window);
  window.setInterval = function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2);
    return every(function () { if (!PV.paused) fn.apply(null, args); }, ms);
  };
  function wake() { var list = waiting; waiting = []; list.forEach(function (fn) { raf(fn); }); }
  /* The house is built for a wide screen. Upright (a phone held in portrait) it plays in a 3:2 box in the
     middle of the screen — a letterbox — instead of asking the player to turn the phone. The build
     (scripts/build-playables.mjs) points the game's sizes at this box: PV.w() / PV.h() for the script,
     --vw / --vh for the stylesheet, and the classes mh-N / mw-N on <html> for its size rules. */
  var box = { w: 1, h: 1 };
  PV.w = function () { return box.w; };
  PV.h = function () { return box.h; };
  var SIZES = { mh: [340, 380, 400, 420], mw: [560] };
  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    if (!W || !H) return; // YouTube first loads the game in a hidden, zero-sized view: wait for a real one
    var h = W / H < 1.3 ? Math.min(H, Math.round(W / 1.5)) : H;
    box.w = W; box.h = h;
    var root = document.documentElement, b = document.body;
    root.style.setProperty('--vw', W / 100 + 'px');
    root.style.setProperty('--vh', h / 100 + 'px');
    SIZES.mh.forEach(function (n) { root.classList.toggle('mh-' + n, h <= n); });
    SIZES.mw.forEach(function (n) { root.classList.toggle('mw-' + n, W <= n); });
    if (b) {
      // a transform makes the body the frame of everything "fixed" inside it
      b.style.cssText = 'position:fixed;left:0;top:' + Math.round((H - h) / 2) + 'px;width:' + W + 'px;height:' + h + 'px;transform:translateZ(0);overflow:hidden;margin:0';
    }
  }
  layout();
  window.addEventListener('resize', layout);
  document.addEventListener('DOMContentLoaded', layout);
  PV.layout = layout;
  var saving = Promise.resolve();
  function push() {
    if (!yt || !PV.loaded) return; // YouTube rejects saves made before the load has come back
    var text = JSON.stringify(PV.doc);
    saving = saving.then(function () { return yt.game.saveData(text); }).catch(function () { /* try again with the next save */ });
  }
  PV.getItem = function (k) { return typeof PV.doc[k] === 'string' ? PV.doc[k] : null; };
  PV.setItem = function (k, v) { if (PV.doc[k] === v) return; PV.doc[k] = v; push(); };
  PV.removeItem = function (k) { if (!(k in PV.doc)) return; delete PV.doc[k]; push(); };
  PV.silent = function () { return PV.paused || PV.muted; };
  PV.escapes = function () { return Math.max(0, Math.floor(+PV.getItem('escapes') || 0)); };
  function score() { if (yt) yt.engagement.sendScore({ value: PV.escapes() }).catch(function () { /* next time */ }); }
  /* The house let you go: one more escape. */
  PV.escaped = function () { PV.setItem('escapes', String(PV.escapes() + 1)); score(); };
  /* The menu's best line (the best time of this difficulty) also carries the escapes. */
  PV.showEscapes = function (el) {
    var n = PV.escapes(); if (!el || !n) return;
    var ta = document.documentElement.dataset.lang === 'ta';
    el.textContent += (el.textContent ? ' · ' : '') + (ta ? 'தப்பியது: ' : 'Escapes: ') + n;
  };
  var ready = false;
  PV.ready = function () { if (ready) return; ready = true; if (yt) yt.game.gameReady(); };
  function sound() { var A = window.K && window.K.Audio; if (!A) return; if (PV.silent()) A.suspend(); else A.resume(); }
  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      // YouTube's CSP wants its nonce on scripts added by code (it puts one on the page's own scripts)
      var own = document.querySelector('script[nonce]'); if (own && own.nonce) s.nonce = own.nonce;
      s.onload = resolve; s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.body.appendChild(s);
    });
  }
  /* Called from index.html, after the loading screen's markup, with the game's scripts in order. */
  PV.boot = async function (scripts) {
    layout();
    if (yt) {
      yt.game.firstFrameReady();
      PV.muted = !yt.system.isAudioEnabled();
      yt.system.onAudioEnabledChange(function (on) { PV.muted = !on; sound(); });
      yt.system.onPause(function () { if (PV.onPause) PV.onPause(); PV.paused = true; sound(); });
      yt.system.onResume(function () {
        PV.paused = false;
        wake();
        if (PV.onResume) PV.onResume();
        sound();
      });
      /* The save and the language come first, but only briefly: a slow answer must not hold the loading
         screen up (YouTube wants gameReady within five seconds); a late save still joins what is here. */
      var cloud = yt.game.loadData().then(function (text) {
        var d = text ? JSON.parse(text) : {};
        if (d && typeof d === 'object' && !Array.isArray(d)) PV.doc = Object.assign(d, PV.doc); // anything else: a fresh start
      }).catch(function () { /* a fresh start */ }).then(function () {
        PV.loaded = true;
        score(); // YouTube's best score stays in step with the save
      });
      var lang = yt.system.getLanguage().then(function (l) { if (l) PV.lang = /^ta\b/i.test(l) ? 'ta' : 'en'; }).catch(function () { /* keep the browser's */ });
      await Promise.race([Promise.all([cloud, lang]), new Promise(function (r) { setTimeout(r, 1200); })]);
    } else PV.loaded = true;
    for (var i = 0; i < scripts.length; i++) await load(scripts[i]);
  };
})();
