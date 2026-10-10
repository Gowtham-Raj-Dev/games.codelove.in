/* Patti Veedu — full screen and screen rotation for mobile browsers (as the other games on Models.codelove.in have).
   When the game runs inside the website's play page (an iframe on the same site), the page around it goes full
   screen and turns, so the browser's bars disappear too. On phones the first tap does it by itself: even the site
   opened from the Home Screen keeps Android's status bar and a black strip by the camera cutout until it is full
   screen. Where the browser can't (Safari on iPhone) a short tip explains what to do instead. Hidden in the Android
   and Windows apps, which are full screen already. */
'use strict';
(function (K) {
  const $ = id => document.getElementById(id);
  const host = (() => { try { if (window.parent !== window && window.parent.document) return window.parent; } catch (e) { /* another site: our own page */ } return window; })();
  const hd = host.document;
  const app = !!(window.KolusuNative || window.KOLUSU_DESKTOP || /\bKingdomClashApp\//.test(navigator.userAgent));
  const standalone = () => host.matchMedia('(display-mode: standalone)').matches || !!host.navigator.standalone;
  const fsElement = () => hd.fullscreenElement || hd.webkitFullscreenElement || null;
  const fsSupported = () => !!(hd.fullscreenEnabled || hd.webkitFullscreenEnabled);
  const touch = () => window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const S = K.Screen = { host, app };

  async function enterFs() {
    const r = hd.documentElement;
    if (r.requestFullscreen) await r.requestFullscreen({ navigationUI: 'hide' });
    else if (r.webkitRequestFullscreen) r.webkitRequestFullscreen();
  }
  let optOut = false; // left full screen with the button: no automatic full screen until it is pressed again
  S.toggleFullscreen = function () {
    if (fsElement()) { optOut = true; if (hd.exitFullscreen) hd.exitFullscreen().catch(() => {}); else if (hd.webkitExitFullscreen) hd.webkitExitFullscreen(); return; }
    if (!fsSupported()) { tip('tip_fs_t', 'tip_fs'); return; }
    optOut = false;
    if (phone) S.landscape(true); else enterFs().catch(() => {});
  };
  /* Browsers lock the orientation only of a full screen page: full screen first (the Home Screen app too, or
     Android keeps its status bar). quiet: no tip when the browser can't (the automatic first-tap call). */
  S.landscape = async function (quiet) {
    const o = host.screen && host.screen.orientation;
    try { if (!fsElement() && fsSupported()) await enterFs(); } catch (e) { /* not allowed here */ }
    if (o && o.lock) { try { await o.lock('landscape'); return; } catch (e) { /* not allowed here */ } }
    if (!quiet && !fsElement()) tip('tip_rot_t', 'tip_rot');
  };

  function tip(title, text) {
    const t = $('tipSheet'); if (!t) return;
    $('tipTitle').innerHTML = K.t(title); $('tipText').innerHTML = K.t(text); t.hidden = false;
    if (K.Audio && K.Audio.click) K.Audio.click();
  }
  function sync() {
    const on = !!fsElement();
    document.querySelectorAll('.fsBtn').forEach(b => {
      b.innerHTML = on ? '<svg class="st" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>' : '<svg class="st" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
      b.dataset.i18nAria = on ? 'fs_exit' : 'fs'; b.setAttribute('aria-label', K.t(b.dataset.i18nAria)); b.title = K.t(b.dataset.i18nAria);
    });
  }

  // phones and tablets in the browser or the Home Screen app (not the game's own apps, not the desktop layout)
  const phone = !app && !document.documentElement.classList.contains('desk') && touch();
  // a touch's activation comes with pointerup (pointerdown only counts for a mouse)
  const auto = e => { if (phone && !optOut && !fsElement() && fsSupported() && !(e.target.closest && e.target.closest('.fsBtn,#rotBtn,#tipSheet'))) S.landscape(true); };
  document.addEventListener('pointerup', auto, true);
  // Home Screen apps on Android can still go full screen; on iPhone (no full screen) they already fill the screen
  const show = !app && (fsSupported() || !standalone());
  document.querySelectorAll('.fsBtn').forEach(b => { b.hidden = !show; b.onclick = e => { e.stopPropagation(); S.toggleFullscreen(); if (K.Audio && K.Audio.click) K.Audio.click(); }; });
  const rb = $('rotBtn'); if (rb) { rb.hidden = app || !touch(); rb.onclick = e => { e.stopPropagation(); S.landscape(); }; }
  const ok = $('tipOk'); if (ok) ok.onclick = () => { $('tipSheet').hidden = true; if (K.Audio && K.Audio.click) K.Audio.click(); };
  const ts = $('tipSheet'); if (ts) ts.onclick = e => { if (e.target === ts) ts.hidden = true; };
  hd.addEventListener('fullscreenchange', sync); hd.addEventListener('webkitfullscreenchange', sync);
  sync();
})(window.K = window.K || {});
