/* KOLUSU — procedural canvas textures (no image files needed) */
'use strict';
window.K = window.K || {};
(function (K) {
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  K.rng = rng;

  // CPU-backed canvases: the engine copies every texture into its texture arrays, which needs cheap pixel reads
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }); return c; }
  function toTex(c, repeat = true, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  // larger canvas, same drawing coordinates: crisper lines on High graphics
  function canvasS(w, h) { const k = K.texScale || 1, c = canvas(Math.round(w * k), Math.round(h * k)); if (k !== 1) c.getContext('2d').scale(k, k); return c; }
  K.canvas = canvas; K.toTex = toTex;
  K._grime = (...a) => grime(...a); K._blotches = (...a) => blotches(...a);

  function grime(g, w, h, r, n, dark = 0.18, light = 0.05) {
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, s = 1 + r() * 3;
      g.fillStyle = r() < 0.75 ? `rgba(0,0,0,${r() * dark})` : `rgba(255,240,210,${r() * light})`;
      g.fillRect(x, y, s, s);
    }
  }
  function blotches(g, w, h, r, n, col, amax, rmin, rmax) {
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${col},${r() * amax})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  /* Athangudi tile: one tile of S px; quarter circles meet across tiles to form rings */
  function athangudiTile(g, ox, oy, S, p, r) {
    g.save(); g.translate(ox, oy);
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    g.fillStyle = p.base; g.fillRect(0, 0, S, S);
    const corners = [[0, 0], [S, 0], [0, S], [S, S]];
    if (p.style === 'rings') {
      for (const [cx, cy] of corners) {
        g.fillStyle = p.a; g.beginPath(); g.arc(cx, cy, S * 0.36, 0, 7); g.fill();
        g.fillStyle = p.base; g.beginPath(); g.arc(cx, cy, S * 0.27, 0, 7); g.fill();
        g.fillStyle = p.b; g.beginPath(); g.arc(cx, cy, S * 0.17, 0, 7); g.fill();
      }
      g.translate(S / 2, S / 2);
      g.fillStyle = p.c;
      for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.ellipse(0, -S * 0.12, S * 0.04, S * 0.1, 0, 0, 7); g.fill(); }
      g.fillStyle = p.a; g.beginPath(); g.arc(0, 0, S * 0.045, 0, 7); g.fill();
    } else if (p.style === 'diamond') {
      g.fillStyle = p.a; g.beginPath(); g.moveTo(S / 2, S * 0.06); g.lineTo(S * 0.94, S / 2); g.lineTo(S / 2, S * 0.94); g.lineTo(S * 0.06, S / 2); g.closePath(); g.fill();
      g.fillStyle = p.b; g.beginPath(); g.moveTo(S / 2, S * 0.22); g.lineTo(S * 0.78, S / 2); g.lineTo(S / 2, S * 0.78); g.lineTo(S * 0.22, S / 2); g.closePath(); g.fill();
      g.fillStyle = p.c; g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, 7); g.fill();
      g.fillStyle = p.a; for (const [cx, cy] of corners) { g.beginPath(); g.arc(cx, cy, S * 0.1, 0, 7); g.fill(); }
    } else { // checker
      g.fillStyle = p.a; g.fillRect(0, 0, S / 2, S / 2); g.fillRect(S / 2, S / 2, S / 2, S / 2);
      g.strokeStyle = p.c; g.lineWidth = S * 0.02; g.strokeRect(S * 0.08, S * 0.08, S * 0.84, S * 0.84);
    }
    g.restore();
    g.save(); g.translate(ox, oy);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
    // wear: the polish rubs off
    blotches(g, S, S, r, 5, '0,0,0', 0.18, S * 0.1, S * 0.4);
    blotches(g, S, S, r, 3, '255,235,200', 0.06, S * 0.1, S * 0.3);
    grime(g, S, S, r, 70, 0.18, 0.05);
    g.restore();
  }
  K.makeTileTex = function (p, seed) {
    const S = 256, c = canvasS(S * 2, S * 2), g = c.getContext('2d'), r = rng(seed);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) athangudiTile(g, i * S, j * S, S, p, r);
    return toTex(c);
  };

  /* Lime-plaster wall: canvas spans 2 m wide x 3.6 m tall. Red-oxide skirting, painted frieze band */
  K.makeWallTex = function (seed, tint) {
    const W = 512, H = 920, c = canvasS(W, H), g = c.getContext('2d'), r = rng(seed);
    const Y = (m) => (1 - m / 3.6) * H;
    g.fillStyle = tint || '#c8b996'; g.fillRect(0, 0, W, H);
    blotches(g, W, H, r, 22, '90,70,40', 0.16, 30, 120);
    blotches(g, W, H, r, 20, '250,240,215', 0.12, 20, 90);
    // water streaks from the ceiling
    for (let i = 0; i < 9; i++) {
      const x = r() * W, w = 6 + r() * 26, len = H * (0.15 + r() * 0.45);
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, 'rgba(60,45,25,0.35)'); gr.addColorStop(1, 'rgba(60,45,25,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, len);
    }
    grime(g, W, H, r, 900, 0.14, 0.04);
    // frieze band 2.55–2.8 m
    const fy0 = Y(2.8), fy1 = Y(2.55);
    g.fillStyle = '#3e5a3a'; g.fillRect(0, fy0, W, fy1 - fy0);
    g.fillStyle = '#b8862f';
    const n = 8, step = W / n;
    for (let i = 0; i < n; i++) {
      const cx = i * step + step / 2, cy = (fy0 + fy1) / 2, s = (fy1 - fy0) * 0.38;
      g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath(); g.fill();
      g.beginPath(); g.arc(cx + step / 2, cy, s * 0.3, 0, 7); g.fill();
    }
    g.fillStyle = '#7a2b1c'; g.fillRect(0, fy0 - 4, W, 4); g.fillRect(0, fy1, W, 4);
    blotches(g, W, fy1 - fy0, r, 8, '0,0,0', 0.25, 10, 40);
    // skirting 0–0.42 m, red oxide
    const sy = Y(0.42);
    g.fillStyle = '#6a2618'; g.fillRect(0, sy, W, H - sy);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, sy, W, 5);
    blotches(g, W, H, r, 0, '0,0,0', 0, 0, 0);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.25})`; g.fillRect(r() * W, sy + r() * (H - sy), 2, 2); }
    return toTex(c);
  };

  K.makeWoodTex = function (seed, base = '#4a2a15', w = 256, h = 512) {
    const c = canvas(w, h), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = r() * w, a = r() * 0.22;
      g.strokeStyle = r() < 0.6 ? `rgba(0,0,0,${a})` : `rgba(255,200,140,${a * 0.4})`;
      g.lineWidth = 0.5 + r() * 2;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= h; y += 16) g.lineTo(x + Math.sin(y * 0.02 + i) * 3 + (r() - 0.5) * 1.5, y);
      g.stroke();
    }
    for (let k = 0; k < 3; k++) { // knots
      const x = r() * w, y = r() * h;
      for (let j = 6; j > 0; j--) { g.strokeStyle = `rgba(20,8,2,${0.12})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, j * 3, j * 7, 0, 0, 7); g.stroke(); }
    }
    grime(g, w, h, r, 600, 0.25, 0.04);
    return toTex(c);
  };

  K.makePlankTex = function (seed) { // ceiling planks with beams
    const W = 512, H = 512, c = canvasS(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#2c1a0e'; g.fillRect(0, 0, W, H);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const y = i * H / n;
      g.fillStyle = `rgb(${40 + r() * 14},${24 + r() * 8},${12 + r() * 5})`; g.fillRect(0, y + 2, W, H / n - 4);
      for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(0,0,0,${r() * 0.3})`; g.beginPath(); const yy = y + 4 + r() * (H / n - 8); g.moveTo(0, yy); g.lineTo(W, yy + (r() - 0.5) * 4); g.stroke(); }
    }
    grime(g, W, H, r, 900, 0.3, 0.03);
    return toTex(c);
  };

  K.makeGraniteTex = function (seed) {
    const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#5d5b57'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) {
      const v = r(); g.fillStyle = v < 0.5 ? `rgba(20,20,22,${r() * 0.6})` : v < 0.85 ? `rgba(160,150,140,${r() * 0.4})` : `rgba(120,70,60,${r() * 0.4})`;
      const s = 1 + r() * 2.5; g.fillRect(r() * W, r() * H, s, s);
    }
    blotches(g, W, H, r, 14, '0,0,0', 0.25, 30, 120);
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3;
    g.strokeRect(1, 1, W - 2, H - 2); g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H / 2); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.moveTo(W * 0.3, H / 2); g.lineTo(W * 0.3, H); g.stroke();
    return toTex(c);
  };

  K.makeRoofTex = function (seed) {
    const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#5a2414'; g.fillRect(0, 0, W, H);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const x = col * 32 + (row % 2) * 16, y = row * 32;
      g.fillStyle = `rgb(${110 + r() * 40},${45 + r() * 20},${25 + r() * 10})`;
      g.beginPath(); g.ellipse(x + 16, y + 18, 14, 16, 0, 0, Math.PI); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + 30, 32, 2);
    }
    grime(g, W, H, r, 500, 0.4, 0.05);
    return toTex(c);
  };

  /* carved Chettinad door leaf */
  K.makeDoorTex = function (seed, ornate) {
    const W = 256, H = 640, c = canvas(W, H), g = c.getContext('2d'), r = rng(seed);
    const wood = K.makeWoodTex(seed + 1, '#3d2210', W, H).image;
    g.drawImage(wood, 0, 0);
    const panels = ornate ? [[0.08, 0.05, 0.84, 0.28], [0.08, 0.37, 0.84, 0.26], [0.08, 0.67, 0.84, 0.28]] : [[0.1, 0.06, 0.8, 0.4], [0.1, 0.54, 0.8, 0.4]];
    for (const [x, y, w, h] of panels) {
      const X = x * W, Y = y * H, Wd = w * W, Hd = h * H;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(X, Y, Wd, Hd);
      g.fillStyle = 'rgba(0,0,0,0.0)';
      g.strokeStyle = 'rgba(255,200,140,0.12)'; g.lineWidth = 3; g.strokeRect(X + 6, Y + 6, Wd - 12, Hd - 12);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.strokeRect(X + 12, Y + 12, Wd - 24, Hd - 24);
      if (ornate) { // carved lotus medallion
        const cx = X + Wd / 2, cy = Y + Hd / 2;
        g.save(); g.translate(cx, cy);
        for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, -Hd * 0.18, 9, Hd * 0.13, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,190,120,0.15)'; g.stroke(); }
        g.restore();
      }
    }
    // brass studs
    if (ornate) for (let i = 0; i < 5; i++) for (const yy of [0.35, 0.65]) {
      const x = W * (0.15 + i * 0.175), y = H * yy;
      const gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, 7); gr.addColorStop(0, '#f0c66a'); gr.addColorStop(1, '#5a3b10');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    }
    return toTex(c, false);
  };

  K.makeGlowTex = function (inner = 'rgba(255,220,150,1)', mid = 'rgba(255,140,40,0.5)') {
    const S = 128, c = canvas(S, S), g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return toTex(c, false);
  };
  K.makeFlameTex = function () {
    const W = 64, H = 128, c = canvas(W, H), g = c.getContext('2d');
    const gr = g.createRadialGradient(W / 2, H * 0.7, 2, W / 2, H * 0.62, H * 0.5);
    gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.2, 'rgba(255,210,90,0.95)'); gr.addColorStop(0.5, 'rgba(255,110,20,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(W / 2, 0); g.bezierCurveTo(W * 0.95, H * 0.5, W * 0.9, H * 0.95, W / 2, H * 0.97); g.bezierCurveTo(W * 0.1, H * 0.95, W * 0.05, H * 0.5, W / 2, 0); g.fill();
    return toTex(c, false);
  };

  /* symbols for the courtyard lamps */
  K.SYMBOLS = ['sun', 'moon', 'star', 'lotus'];
  K.SYMBOL_NAMES = { sun: 'Suriyan', moon: 'Nila', star: 'Natchathiram', lotus: 'Thamarai' };
  K.SYMBOL_GLYPH = { sun: '☀', moon: '☾', star: '★', lotus: '✿' };
  K.drawSymbol = function (g, type, cx, cy, R, col) {
    g.save(); g.translate(cx, cy); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = R * 0.12; g.lineCap = 'round';
    if (type === 'sun') {
      g.beginPath(); g.arc(0, 0, R * 0.42, 0, 7); g.fill();
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.58, Math.sin(a) * R * 0.58); g.lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92); g.stroke(); }
    } else if (type === 'moon') {
      g.beginPath(); g.arc(0, 0, R * 0.8, 0, 7); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(R * 0.38, -R * 0.2, R * 0.7, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    } else if (type === 'star') {
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.38 : R * 0.9; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill();
    } else { // lotus
      for (const [a, s] of [[0, 1], [-0.6, 0.85], [0.6, 0.85], [-1.15, 0.7], [1.15, 0.7]]) { g.save(); g.rotate(a); g.beginPath(); g.ellipse(0, -R * 0.35 * s, R * 0.2, R * 0.5 * s, 0, 0, 7); g.fill(); g.restore(); }
      g.fillRect(-R * 0.7, R * 0.3, R * 1.4, R * 0.1);
    }
    g.restore();
  };
  K.makeSymbolPanel = function (type) {
    const S = 128, c = canvas(S, S), g = c.getContext('2d');
    g.drawImage(K.makeWoodTex(7, '#3a200e', S, S).image, 0, 0);
    g.strokeStyle = '#a77b2b'; g.lineWidth = 4; g.strokeRect(8, 8, S - 16, S - 16);
    K.drawSymbol(g, type, S / 2, S / 2, S * 0.34, '#d9a84a');
    return toTex(c, false);
  };

  /* red kumkum digit with kolam dots underneath showing its position */
  K.drawClue = function (g, x, y, size, digit, pos, col = '#a3160d') {
    g.save(); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${size}px "Arima Madurai", Georgia, serif`;
    g.shadowColor = 'rgba(120,0,0,0.6)'; g.shadowBlur = size * 0.06;
    g.fillText(String(digit), x, y);
    g.shadowBlur = 0;
    const dy = y + size * 0.62, gap = size * 0.18;
    for (let i = 0; i < pos; i++) { g.beginPath(); g.arc(x + (i - (pos - 1) / 2) * gap, dy, size * 0.05, 0, 7); g.fill(); }
    g.restore();
  };

  K.makePortraitTex = function (digit) {
    const W = 256, H = 340, c = canvas(W, H), g = c.getContext('2d'), r = rng(44);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#3b2a1a'); bg.addColorStop(1, '#1a120b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // an old gentleman, painted plainly: shawl, round face, white moustache
    g.fillStyle = '#d8d0bf'; g.beginPath(); g.ellipse(W / 2, H * 0.92, W * 0.42, H * 0.3, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#7b5a3c'; g.beginPath(); g.ellipse(W / 2, H * 0.4, W * 0.17, H * 0.17, 0, 0, 7); g.fill();
    g.fillStyle = '#6a4a30'; g.fillRect(W / 2 - 18, H * 0.52, 36, 30);
    g.fillStyle = '#efe8da'; g.beginPath(); g.ellipse(W / 2 - 14, H * 0.47, 16, 5, -0.2, 0, 7); g.ellipse(W / 2 + 14, H * 0.47, 16, 5, 0.2, 0, 7); g.fill();
    g.fillStyle = '#1b120b'; g.beginPath(); g.arc(W / 2 - 18, H * 0.38, 4, 0, 7); g.arc(W / 2 + 18, H * 0.38, 4, 0, 7); g.fill();
    g.fillStyle = '#e9e4da'; g.fillRect(W / 2 - 20, H * 0.28, 40, 3); g.fillRect(W / 2 - 20, H * 0.3, 40, 3); g.fillRect(W / 2 - 20, H * 0.32, 40, 3);
    g.fillStyle = '#b7271d'; g.beginPath(); g.arc(W / 2, H * 0.34, 3.5, 0, 7); g.fill();
    blotches(g, W, H, r, 20, '0,0,0', 0.35, 20, 90);
    grime(g, W, H, r, 1500, 0.3, 0.06);
    // varnish crack
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1; for (let i = 0; i < 30; i++) { g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    return toTex(c, false);
  };

  K.makeCalendarTex = function (digit, pos) {
    const W = 256, H = 360, c = canvas(W, H), g = c.getContext('2d'), r = rng(9);
    g.fillStyle = '#ddd2b6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7a1d14'; g.fillRect(0, 0, W, 70);
    g.fillStyle = '#f2e6c8'; g.font = '700 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('AADI  1987', W / 2, 44);
    g.fillStyle = '#3a2a1a'; g.font = '14px Georgia, serif';
    let d = 1; for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) { if (d > 31) break; g.fillText(String(d++), 24 + col * 34, 104 + row * 30); }
    blotches(g, W, H, r, 12, '90,60,20', 0.3, 20, 70);
    if (digit !== null) K.drawClue(g, W / 2, 290, 82, digit, pos);
    return toTex(c, false);
  };
  K.makeMirrorTex = function (digit, pos) {
    const W = 256, H = 384, c = canvas(W, H), g = c.getContext('2d'), r = rng(12);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#5c6466'); gr.addColorStop(0.5, '#2c3133'); gr.addColorStop(1, '#4b5254');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    blotches(g, W, H, r, 18, '0,0,0', 0.5, 10, 70); // desilvering
    blotches(g, W, H, r, 8, '200,210,210', 0.12, 20, 60);
    if (digit !== null) { K.drawClue(g, W / 2, H * 0.45, 130, digit, pos, '#b0170e'); g.fillStyle = '#9a140c'; for (let i = 0; i < 6; i++) { const x = W / 2 - 40 + r() * 80; g.fillRect(x, H * 0.5, 3, 20 + r() * 50); } }
    return toTex(c, false);
  };
  K.makeKolamTex = function (digit, pos) {
    const S = 512, c = canvas(S, S), g = c.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(245,240,228,0.92)'; g.fillStyle = 'rgba(245,240,228,0.92)'; g.lineWidth = 6; g.lineCap = 'round';
    // dotted grid kolam with loops
    const n = 5, step = S / (n + 1);
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) { g.beginPath(); g.arc(i * step, j * step, 5, 0, 7); g.fill(); }
    for (let i = 1; i < n; i++) for (let j = 1; j < n; j++) {
      const cx = (i + 0.5) * step, cy = (j + 0.5) * step;
      g.beginPath(); g.ellipse(cx, cy, step * 0.45, step * 0.45, Math.PI / 4, 0, 7); g.stroke();
    }
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.46, 0, 7); g.stroke();
    // central clue in red kumkum
    if (digit !== null) { g.fillStyle = 'rgba(30,20,15,0.9)'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.17, 0, 7); g.fill(); K.drawClue(g, S / 2, S / 2 - 12, 120, digit, pos, '#c51b10'); }
    else { g.beginPath(); g.arc(S / 2, S / 2, S * 0.12, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.ellipse(S / 2 + Math.cos(a) * S * 0.2, S / 2 + Math.sin(a) * S * 0.2, S * 0.05, S * 0.09, a, 0, 7); g.stroke(); } }
    const t = toTex(c, false); return t;
  };
  K.makeCrackTex = function () {
    const S = 128, c = canvas(S, S), g = c.getContext('2d'), r = rng(77);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 2;
    for (let k = 0; k < 4; k++) { g.beginPath(); let x = S / 2, y = S / 2; g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(2, 2, S - 4, S - 4);
    return toTex(c, false);
  };
  K.makeNoteTex = function () {
    const W = 128, H = 160, c = canvas(W, H), g = c.getContext('2d'), r = rng(3);
    g.fillStyle = '#e4d6b4'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(60,30,10,0.55)'; g.lineWidth = 2;
    for (let y = 22; y < H - 14; y += 13) { g.beginPath(); g.moveTo(12, y); for (let x = 12; x < W - 12; x += 8) g.lineTo(x, y + (r() - 0.5) * 3); g.stroke(); }
    blotches(g, W, H, r, 6, '120,80,30', 0.3, 10, 40);
    return toTex(c, false);
  };
  K.makeLabelTex = function (text, bg = '#c9a032', fg = '#3a1408') {
    const W = 128, H = 64, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = fg; g.font = '900 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2);
    return toTex(c, false);
  };
  K.makeSkyTex = function () {
    const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rng(101);
    const gr = g.createRadialGradient(W * 0.6, H * 0.4, 10, W / 2, H / 2, W * 0.7); gr.addColorStop(0, '#1c2440'); gr.addColorStop(1, '#05070e');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    blotches(g, W, H, r, 30, '60,70,100', 0.35, 30, 140);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(230,235,255,${r() * 0.8})`; g.fillRect(r() * W, r() * H, 1.4, 1.4); }
    // moon behind thin cloud
    const mx = W * 0.62, my = H * 0.38;
    const mg = g.createRadialGradient(mx, my, 0, mx, my, 90); mg.addColorStop(0, 'rgba(230,236,255,0.9)'); mg.addColorStop(0.25, 'rgba(200,210,240,0.5)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mg; g.fillRect(mx - 90, my - 90, 180, 180);
    g.fillStyle = '#eef0ff'; g.beginPath(); g.arc(mx, my, 22, 0, 7); g.fill();
    blotches(g, W, H, r, 10, '20,24,40', 0.6, 40, 120);
    return toTex(c, false);
  };
})(window.K);

/* ---------- Paatti: painted face, grey hair, maroon silk saree with a temple border ---------- */
(function (K) {
  const rng = K.rng;
  // face texture for a sphere patch: u spans ~150° around the front, v spans brow-top to chin
  // a dead woman's face: corpse-pale skin, veins, sunken black sockets, pale eyes that catch the light, blood tears
  K.makePaattiFace = function (scream) {
    const W = 512, H = 384, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(808);
    const sk = g.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.5, W * 0.52);
    sk.addColorStop(0, '#a3a197'); sk.addColorStop(0.45, '#8a8a80'); sk.addColorStop(0.8, '#55574f'); sk.addColorStop(1, '#262823');
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const blot = (x, y, rad, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
    const line = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 4) g.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); g.stroke(); };
    // mottled, bloodless skin
    for (let i = 0; i < 90; i++) blot(W * (0.15 + r() * 0.7), H * (0.05 + r() * 0.9), 6 + r() * 22, r() < 0.6 ? `rgba(60,66,58,${0.15 + r() * 0.2})` : `rgba(120,96,104,${0.1 + r() * 0.12})`);
    blot(W * 0.3, H * 0.68, 46, 'rgba(20,22,20,0.5)'); blot(W * 0.7, H * 0.68, 46, 'rgba(20,22,20,0.5)'); // hollow cheeks
    blot(W * 0.18, H * 0.34, 54, 'rgba(15,16,15,0.55)'); blot(W * 0.82, H * 0.34, 54, 'rgba(15,16,15,0.55)'); // temples
    // veins: thin blue-black branches
    const vein = (x, y, a, len, w) => { if (len < 6 || w < 0.4) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.strokeStyle = `rgba(38,46,70,${0.25 + r() * 0.3})`; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * 10, (y + y2) / 2 + (r() - 0.5) * 10, x2, y2); g.stroke(); vein(x2, y2, a + (r() - 0.5) * 1.1, len * 0.72, w * 0.7); if (r() < 0.55) vein(x2, y2, a + (r() - 0.5) * 2, len * 0.6, w * 0.6); };
    for (const [x, y, a] of [[W * 0.16, H * 0.2, 0.6], [W * 0.84, H * 0.2, Math.PI - 0.6], [W * 0.22, H * 0.55, -0.4], [W * 0.78, H * 0.55, Math.PI + 0.4], [W * 0.5, H * 0.02, 1.5], [W * 0.36, H * 0.9, -1.2], [W * 0.64, H * 0.9, -1.9]]) vein(x, y, a, 40 + r() * 20, 2.4);
    // deep wrinkles across the brow
    for (let k = 0; k < 4; k++) { const y = H * (0.08 + k * 0.045); line([W * 0.31, y + 6, W * 0.5, y - 8, W * 0.69, y + 6], 2.6, 'rgba(22,24,20,0.6)'); }
    // vibhuti, smudged; kumkum smeared down like a wound
    g.fillStyle = 'rgba(214,212,200,0.45)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(W * 0.5 + (r() - 0.5) * 8, H * (0.125 + k * 0.042), W * 0.12, 4, (r() - 0.5) * 0.08, 0, 7); g.fill(); }
    g.fillStyle = '#6e0a06'; g.beginPath(); g.ellipse(W * 0.5, H * 0.265, 11, 13, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(110,10,6,0.85)'; g.lineWidth = 5; g.beginPath(); g.moveTo(W * 0.5, H * 0.27); g.quadraticCurveTo(W * 0.505, H * 0.33, W * 0.496, H * 0.38); g.stroke();
    // eyes: black sunken sockets, pale eyes with pinprick pupils, blood running down
    for (const s of [-1, 1]) {
      const ex = W * (0.5 + s * 0.135), ey = H * 0.375;
      blot(ex, ey, 66, 'rgba(4,4,4,0.92)'); blot(ex, ey + 20, 52, 'rgba(10,10,10,0.6)');
      line([ex - 38, ey - 32, ex + s * -6, ey - 50, ex + 38, ey - 30], 4.5, 'rgba(190,190,182,0.55)'); // thin white brows
      const ew = scream ? 32 : 26, eh = scream ? 22 : 12;
      const sc = g.createRadialGradient(ex, ey, 2, ex, ey, ew); sc.addColorStop(0, '#f4f2ea'); sc.addColorStop(0.75, '#cfccc0'); sc.addColorStop(1, '#8c2a22');
      g.fillStyle = sc; g.beginPath(); g.ellipse(ex, ey, ew, eh, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(150,20,14,0.55)'; g.lineWidth = 1; for (let k = 0; k < 7; k++) { const a = r() * Math.PI * 2; g.beginPath(); g.moveTo(ex + Math.cos(a) * ew, ey + Math.sin(a) * eh); g.lineTo(ex + Math.cos(a) * ew * 0.45, ey + Math.sin(a) * eh * 0.4); g.stroke(); }
      g.fillStyle = scream ? '#dcd9cf' : '#b9c2c4'; g.beginPath(); g.arc(ex - s * 2, ey + 1, scream ? 7 : 8, 0, 7); g.fill(); // milky iris
      g.fillStyle = '#050505'; g.beginPath(); g.arc(ex - s * 2, ey + 1, scream ? 1.6 : 2.4, 0, 7); g.fill();
      if (!scream) { g.strokeStyle = 'rgba(5,5,5,0.95)'; g.lineWidth = 7; g.beginPath(); g.ellipse(ex, ey - 3, ew + 3, eh + 3, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); } // heavy lids
      g.strokeStyle = 'rgba(160,20,14,0.85)'; g.lineWidth = 2; g.beginPath(); g.ellipse(ex, ey, ew, eh, 0, 0.15, Math.PI - 0.15); g.stroke();
      // blood tears
      for (const [ox, len] of [[-ew * 0.35, H * (0.22 + r() * 0.08)], [ew * 0.3, H * (0.12 + r() * 0.1)]]) {
        const x0 = ex + ox, y0 = ey + eh * 0.7; g.strokeStyle = 'rgba(96,6,4,0.9)'; g.lineWidth = 4 + r() * 2; g.beginPath(); g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + (r() - 0.5) * 8, y0 + len * 0.3, x0 + (r() - 0.5) * 10, y0 + len * 0.7, x0 + (r() - 0.5) * 6, y0 + len); g.stroke();
        g.fillStyle = 'rgba(96,6,4,0.95)'; g.beginPath(); g.arc(x0 + (r() - 0.5) * 6, y0 + len, 3.2, 0, 7); g.fill();
      }
      line([ex - 24, ey + 22, ex, ey + 32, ex + 24, ey + 22], 2.5, 'rgba(15,16,14,0.8)'); // bags
    }
    // nose: thin, shadowed; a dark tarnished stud
    g.fillStyle = 'rgba(20,22,20,0.55)'; g.beginPath(); g.moveTo(W * 0.488, H * 0.4); g.quadraticCurveTo(W * 0.462, H * 0.5, W * 0.445, H * 0.565); g.lineTo(W * 0.46, H * 0.57); g.quadraticCurveTo(W * 0.48, H * 0.5, W * 0.5, H * 0.42); g.fill();
    g.fillStyle = 'rgba(6,6,6,0.92)'; g.beginPath(); g.ellipse(W * 0.474, H * 0.585, 9, 5, 0.3, 0, 7); g.ellipse(W * 0.526, H * 0.585, 9, 5, -0.3, 0, 7); g.fill();
    g.fillStyle = '#6b5a2e'; g.beginPath(); g.arc(W * 0.556, H * 0.57, 6, 0, 7); g.fill();
    line([W * 0.44, H * 0.565, W * 0.39, H * 0.645, W * 0.41, H * 0.73], 3.5, 'rgba(15,16,14,0.8)'); line([W * 0.56, H * 0.565, W * 0.61, H * 0.645, W * 0.59, H * 0.73], 3.5, 'rgba(15,16,14,0.8)');
    // mouth
    if (scream) {
      g.fillStyle = '#1a0605'; g.beginPath(); g.ellipse(W * 0.5, H * 0.75, W * 0.095, H * 0.13, 0, 0, 7); g.fill();
      g.fillStyle = '#020101'; g.beginPath(); g.ellipse(W * 0.5, H * 0.76, W * 0.078, H * 0.112, 0, 0, 7); g.fill();
      g.fillStyle = '#9b8d6c'; for (const [tx, ty, tw, th] of [[-0.05, 0.64, 9, 16], [-0.015, 0.632, 8, 13], [0.02, 0.636, 8, 17], [0.05, 0.645, 9, 12], [-0.03, 0.86, 8, -12], [0.035, 0.862, 9, -14]]) { g.beginPath(); g.moveTo(W * (0.5 + tx), H * ty); g.lineTo(W * (0.5 + tx) + tw, H * ty); g.lineTo(W * (0.5 + tx) + tw / 2, H * ty + th); g.closePath(); g.fill(); }
      g.strokeStyle = 'rgba(110,8,5,0.9)'; g.lineWidth = 4; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(W * (0.5 + sx * 0.085), H * 0.79); g.quadraticCurveTo(W * (0.5 + sx * 0.09), H * 0.86, W * (0.5 + sx * 0.082), H * 0.95); g.stroke(); }
    } else {
      g.fillStyle = '#2a2220'; g.beginPath(); g.moveTo(W * 0.39, H * 0.675); g.quadraticCurveTo(W * 0.5, H * 0.648, W * 0.61, H * 0.675); g.quadraticCurveTo(W * 0.5, H * 0.72, W * 0.39, H * 0.675); g.fill();
      g.fillStyle = '#030202'; g.beginPath(); g.ellipse(W * 0.5, H * 0.68, W * 0.085, 6, 0, 0, 7); g.fill();
      for (let k = -5; k <= 5; k++) line([W * (0.5 + k * 0.019), H * 0.648, W * (0.5 + k * 0.019), H * 0.66, W * (0.5 + k * 0.02), H * 0.676], 1.3, 'rgba(12,12,10,0.7)'); // cracked lips
      g.strokeStyle = 'rgba(96,6,4,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.58, H * 0.69); g.quadraticCurveTo(W * 0.585, H * 0.76, W * 0.578, H * 0.84); g.stroke(); // a thread of blood from the corner
    }
    line([W * 0.43, H * 0.82, W * 0.5, H * 0.845, W * 0.57, H * 0.82], 2.5, 'rgba(22,24,20,0.6)');
    line([W * 0.33, H * 0.74, W * 0.35, H * 0.83, W * 0.41, H * 0.9], 2.5, 'rgba(22,24,20,0.6)'); line([W * 0.67, H * 0.74, W * 0.65, H * 0.83, W * 0.59, H * 0.9], 2.5, 'rgba(22,24,20,0.6)');
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.6 ? '10,12,10' : '180,180,170'},${r() * 0.14})`; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
    const hl = g.createLinearGradient(0, 0, 0, H * 0.07); hl.addColorStop(0, '#b4b2aa'); hl.addColorStop(1, 'rgba(180,178,170,0)'); g.fillStyle = hl; g.fillRect(0, 0, W, H * 0.07);
    return K.toTex(c, false);
  };
  // long, loose, matted grey-white hair: strands on a transparent card (alpha-tested)
  K.makeGhostHairTex = function () {
    // locks of thin tapering strands with gaps between them, so a card never shows a straight edge
    const W = 128, H = 512, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(919);
    g.clearRect(0, 0, W, H); g.lineCap = 'round';
    const locks = 11;
    for (let L = 0; L < locks; L++) {
      const x0 = W * 0.5 + (L / (locks - 1) - 0.5) * W * 0.34, xe = 10 + (L / (locks - 1)) * (W - 20) + (r() - 0.5) * 10; // from a narrow root, fanning out
      const len = H * (0.55 + r() * 0.45), wob = (r() - 0.5) * 22, n = 7 + Math.floor(r() * 8), grey = r() < 0.5;
      for (let k = 0; k < n; k++) {
        const ox = (r() - 0.5) * 7, sl = len * (0.6 + r() * 0.4), seg = 14, light = grey ? r() < 0.75 : r() < 0.3;
        const col = light ? [205 + r() * 35, 202 + r() * 32, 192 + r() * 28] : [58 + r() * 30, 54 + r() * 26, 48 + r() * 20];
        let px = x0 + ox * 0.3, py = 0;
        for (let i = 1; i <= seg; i++) {
          const t = i / seg, y = sl * t, x = x0 + (xe - x0) * Math.pow(t, 0.7) + ox * (0.3 + t) + Math.sin(t * 3.1 + L) * wob * t;
          g.strokeStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${(0.95 - t * 0.55) * (0.7 + r() * 0.3)})`; g.lineWidth = Math.max(0.5, (1.6 + r() * 0.6) * (1 - t * 0.75));
          g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); px = x; py = y;
        }
      }
    }
    for (let i = 0; i < 60; i++) { // stray single hairs
      const x = 8 + r() * (W - 16), y0 = r() * H * 0.5, l = 30 + r() * 120; g.strokeStyle = `rgba(210,206,196,${0.4 + r() * 0.4})`; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + (r() - 0.5) * 16, y0 + l / 2, x + (r() - 0.5) * 20, y0 + l); g.stroke();
    }
    return K.toTex(c);
  };
  K.makeGreyHairTex = function () {
    const W = 256, H = 256, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(909);
    g.fillStyle = '#7d7a75'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { const x = r() * W; g.strokeStyle = r() < 0.55 ? `rgba(225,222,215,${0.2 + r() * 0.4})` : `rgba(40,38,36,${0.2 + r() * 0.3})`; g.lineWidth = 0.6 + r(); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 10, H); g.stroke(); }
    g.fillStyle = 'rgba(60,40,30,0.6)'; g.fillRect(W * 0.49, 0, 3, H * 0.6); // parting
    return K.toTex(c);
  };
  K.makeGhostSareeTex = function () {
    const W = 512, H = 256, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(717);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#cfc9b8'); bg.addColorStop(0.7, '#b3ab97'); bg.addColorStop(1, '#6d6352'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3200; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,34,26' : '230,226,214'},${r() * 0.1})`; g.fillRect(r() * W, r() * H, 2, 1); }
    const blot = (x, y, rad, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
    for (let i = 0; i < 26; i++) blot(r() * W, H * (0.3 + r() * 0.7), 14 + r() * 40, `rgba(70,58,40,${0.15 + r() * 0.25})`); // mud
    for (let i = 0; i < 9; i++) { // old blood
      const x = r() * W, y = H * (0.05 + r() * 0.6), rad = 8 + r() * 26; blot(x, y, rad, `rgba(92,8,6,${0.55 + r() * 0.35})`);
      if (r() < 0.7) { g.strokeStyle = 'rgba(88,8,6,0.7)'; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 20 + r() * 60); g.stroke(); }
    }
    // a faded dark border
    g.fillStyle = 'rgba(70,14,12,0.55)'; g.fillRect(0, H * 0.83, W, H * 0.07);
    // torn hem: bite ragged holes out of the bottom edge
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, H); let x = 0; while (x < W) { const nx = x + 6 + r() * 20; g.lineTo(nx - 4, H - 4 - r() * 26); g.lineTo(nx, H); x = nx; } g.closePath(); g.fill();
    for (let i = 0; i < 10; i++) { g.beginPath(); g.ellipse(r() * W, H * (0.55 + r() * 0.35), 3 + r() * 7, 2 + r() * 5, r() * 3, 0, 7); g.fill(); } // moth holes
    g.globalCompositeOperation = 'source-over';
    return K.toTex(c);
  };
  K.makeSareeTex = function (borderSide) {
    const W = 512, H = 256, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(707);
    g.fillStyle = '#5a1416'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '160,60,50'},${r() * 0.12})`; g.fillRect(r() * W, r() * H, 2, 1); }
    // small gold buttas
    g.fillStyle = 'rgba(205,160,70,0.75)';
    for (let y = 18; y < H * 0.8; y += 34) for (let x = (y / 34 % 2) * 22 + 10; x < W; x += 44) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
    // temple border (gold band with triangles)
    const bh = H * 0.2, by = H - bh;
    if (borderSide === 'bottom') {
      g.fillStyle = '#b8862c'; g.fillRect(0, by, W, bh);
      g.fillStyle = '#5a1416'; for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, by); g.lineTo(x + 12, by + bh * 0.55); g.lineTo(x + 24, by); g.closePath(); g.fill(); }
      g.fillStyle = '#2a4a2a'; g.fillRect(0, H - 6, W, 6);
      g.fillStyle = 'rgba(255,230,160,0.35)'; for (let x = 0; x < W; x += 6) g.fillRect(x, by + bh * 0.7, 2, bh * 0.2);
    }
    return K.toTex(c);
  };
})(window.K);

/* ---------- outdoor & new-area surfaces ---------- */
(function (K) {
  const rng = K.rng;
  const speck = (g, W, H, r, n, cols) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; const s = 1 + r() * 2.5; g.fillRect(r() * W, r() * H, s, s); } };
  const soft = (g, x, y, rad, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  K.makeSoilTex = function (seed) {
    const W = 512, H = 512, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#3b2d22'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) soft(g, r() * W, r() * H, 30 + r() * 90, `rgba(${r() < 0.5 ? '25,18,12' : '70,55,40'},0.35)`);
    for (let i = 0; i < 22; i++) soft(g, r() * W, r() * H, 20 + r() * 60, 'rgba(40,70,30,0.45)'); // grass patches
    for (let i = 0; i < 700; i++) { const x = r() * W, y = r() * H; g.strokeStyle = `rgba(${60 + r() * 40},${95 + r() * 50},${40 + r() * 20},0.55)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6); g.stroke(); }
    for (let i = 0; i < 6; i++) soft(g, r() * W, r() * H, 18 + r() * 30, 'rgba(20,30,45,0.5)'); // puddles
    speck(g, W, H, r, 900, ['rgba(0,0,0,0.25)', 'rgba(120,100,80,0.18)']);
    return K.toTex(c);
  };
  K.makeSlabTex = function (seed) {
    const W = 512, H = 512, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#6d6862'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) soft(g, r() * W, r() * H, 40 + r() * 100, `rgba(${r() < 0.6 ? '30,30,28' : '140,135,128'},0.3)`);
    for (let i = 0; i < 10; i++) soft(g, r() * W, r() * H, 20 + r() * 40, 'rgba(45,70,35,0.35)'); // moss
    g.strokeStyle = 'rgba(25,25,25,0.6)'; g.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) { g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
    speck(g, W, H, r, 1200, ['rgba(0,0,0,0.2)', 'rgba(200,195,185,0.12)']);
    return K.toTex(c);
  };
  K.makeStoneTex = function (seed) {
    const W = 512, H = 512, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#2a2622'; g.fillRect(0, 0, W, H);
    const rows = 8, rh = H / rows;
    for (let j = 0; j < rows; j++) {
      let x = -r() * 60;
      while (x < W) { const w = 60 + r() * 70, v = 70 + r() * 35; g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.82})`; g.fillRect(x + 3, j * rh + 3, w - 6, rh - 6); soft(g, x + w / 2, j * rh + rh / 2, w * 0.6, 'rgba(0,0,0,0.25)'); x += w; }
    }
    for (let i = 0; i < 18; i++) soft(g, r() * W, r() * H, 20 + r() * 50, 'rgba(10,25,10,0.35)'); // damp
    speck(g, W, H, r, 1500, ['rgba(0,0,0,0.3)', 'rgba(170,160,145,0.12)']);
    return K.toTex(c);
  };
  K.makeThatchTex = function (seed) {
    const W = 256, H = 256, c = K.canvas(W, H), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#5c4a2a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { const x = r() * W, y = r() * H; g.strokeStyle = `rgba(${150 + r() * 60},${120 + r() * 50},${60 + r() * 30},${0.3 + r() * 0.4})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 14 + r() * 18); g.stroke(); }
    for (let j = 0; j < 8; j++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, j * 32 + 28, W, 4); }
    return K.toTex(c);
  };
  K.makeClueBoard = function (bg, digit, pos, w = 256, h = 256) {
    const c = K.canvas(w, h), g = c.getContext('2d'), r = rng(31 + pos);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.2})`; g.fillRect(r() * w, r() * h, 2, 2); }
    if (digit !== null && digit !== undefined) K.drawClue(g, w / 2, h * 0.42, h * 0.5, digit, pos, '#b8160c');
    return K.toTex(c, false);
  };

  /* ---------------- second wing: family portraits, the Tamil numeral chart, sack tag, Valli's drawings ---------------- */
  const T_canvas = K.canvas, T_toTex = K.toTex, T_rng = K.rng, T_grime = K._grime, T_blotches = K._blotches;
  const TN = ['௦', '௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯'];
  K.TAMIL_DIGITS = TN;
  K.tamilNum = n => String(n).split('').map(d => TN[+d] || d).join('');
  const FONT_TA = '"Hind Madurai","Noto Sans Tamil","Latha",sans-serif';
  // a painted family portrait; who: thatha | paatti | son | valli. Plain, stylised figures.
  K.makeFamilyPortrait = function (who, name, year) {
    const W = 256, H = 340, c = T_canvas(W, H), g = c.getContext('2d'), r = T_rng({ thatha: 61, paatti: 62, son: 63, valli: 64 }[who] || 60);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, who === 'valli' ? '#4a3a2c' : '#3b2a1a'); bg.addColorStop(1, '#16100a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cx = W / 2, fy = who === 'valli' ? H * 0.38 : H * 0.34, fr = who === 'valli' ? 34 : 40;
    const skin = who === 'valli' ? '#a8754e' : who === 'son' ? '#8a5f3e' : '#7d5a3e';
    // clothes
    const cloth = { thatha: '#e6e0d2', paatti: '#6e1a1c', son: '#ddd7c9', valli: '#c75d7e' }[who];
    g.fillStyle = cloth; g.beginPath(); g.ellipse(cx, H * 0.86, W * (who === 'valli' ? 0.3 : 0.4), H * 0.3, 0, Math.PI, 0); g.fill();
    if (who === 'paatti') { g.fillStyle = '#c99a3b'; g.fillRect(cx - W * 0.4, H * 0.66, W * 0.8, 6); g.fillStyle = '#2a5a3a'; g.beginPath(); g.ellipse(cx, H * 0.7, 30, 22, 0, Math.PI, 0); g.fill(); }
    if (who === 'valli') { g.fillStyle = '#e8c048'; g.fillRect(cx - W * 0.3, H * 0.8, W * 0.6, 5); }
    // neck and face
    g.fillStyle = skin; g.fillRect(cx - 12, fy + fr * 0.7, 24, 28);
    g.beginPath(); g.ellipse(cx, fy, fr * 0.86, fr, 0, 0, 7); g.fill();
    // hair
    if (who === 'thatha') { g.fillStyle = '#e9e4da'; g.beginPath(); g.ellipse(cx - fr * 0.8, fy - 4, 8, 16, 0.2, 0, 7); g.ellipse(cx + fr * 0.8, fy - 4, 8, 16, -0.2, 0, 7); g.fill(); g.fillRect(cx - 18, fy + 14, 36, 5); for (let i = 0; i < 3; i++) g.fillRect(cx - 16, fy - 22 + i * 4, 32, 2); g.fillStyle = '#b7271d'; g.beginPath(); g.arc(cx, fy - 12, 3, 0, 7); g.fill(); }
    else if (who === 'paatti') { g.fillStyle = '#b9b3a8'; g.beginPath(); g.ellipse(cx, fy - fr * 0.55, fr * 0.95, fr * 0.6, 0, Math.PI, 0); g.fill(); g.beginPath(); g.arc(cx, fy - fr * 0.95, 14, 0, 7); g.fill(); g.fillStyle = '#b3120c'; g.beginPath(); g.arc(cx, fy - 10, 4, 0, 7); g.fill(); g.fillStyle = '#e8d070'; g.beginPath(); g.arc(cx - 9, fy + 6, 2, 0, 7); g.fill(); }
    else if (who === 'son') { g.fillStyle = '#141010'; g.beginPath(); g.ellipse(cx, fy - fr * 0.6, fr * 0.9, fr * 0.5, 0, Math.PI, 0); g.fill(); g.fillRect(cx - 14, fy + 13, 28, 4); }
    else { g.fillStyle = '#120d0b'; g.beginPath(); g.ellipse(cx, fy - fr * 0.5, fr * 0.95, fr * 0.62, 0, Math.PI, 0); g.fill(); for (const s of [-1, 1]) { g.fillRect(cx + s * fr * 0.85 - 5, fy - 4, 10, fr * 1.9); g.fillStyle = '#f2eedd'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + s * fr * 0.85, fy + 8 + i * 10, 3, 0, 7); g.fill(); } g.fillStyle = '#120d0b'; } g.fillStyle = '#b3120c'; g.beginPath(); g.arc(cx, fy - 8, 3, 0, 7); g.fill(); }
    // eyes
    g.fillStyle = '#1a120c'; g.beginPath(); g.arc(cx - fr * 0.33, fy - 2, 3.2, 0, 7); g.arc(cx + fr * 0.33, fy - 2, 3.2, 0, 7); g.fill();
    // name plate with the birth year in Tamil numerals
    g.fillStyle = '#c9a046'; g.fillRect(28, H - 62, W - 56, 44); g.fillStyle = '#3a2410'; g.fillRect(31, H - 59, W - 62, 38);
    g.fillStyle = '#f0d9a0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 17px ' + FONT_TA; g.fillText(name, cx, H - 48); g.font = '700 16px ' + FONT_TA; g.fillText(K.tamilNum(year), cx, H - 29);
    T_blotches(g, W, H, r, 14, '0,0,0', 0.3, 20, 80); T_grime(g, W, H, r, 1100, 0.28, 0.05);
    return T_toTex(c, false);
  };
  // the wall chart in the accounts room: Tamil numerals and their values
  K.makeNumeralChart = function () {
    const W = 384, H = 512, c = T_canvas(W, H), g = c.getContext('2d'), r = T_rng(71);
    g.fillStyle = '#e4d5ad'; g.fillRect(0, 0, W, H); T_blotches(g, W, H, r, 18, '120,90,40', 0.12, 20, 80);
    g.fillStyle = '#7a1c12'; g.fillRect(0, 0, W, 64); g.fillStyle = '#f3e3b8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 30px ' + FONT_TA; g.fillText('தமிழ் எண்கள்', W / 2, 34);
    g.strokeStyle = 'rgba(60,30,10,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const col = i < 5 ? 0 : 1, row = i % 5, x = 40 + col * 180, y = 92 + row * 82;
      g.strokeRect(x, y, 150, 70); g.fillStyle = '#2a1608'; g.font = '700 46px ' + FONT_TA; g.fillText(TN[i], x + 45, y + 37); g.font = '700 34px Georgia, serif'; g.fillStyle = '#7a1c12'; g.fillText(String(i), x + 115, y + 37);
      g.fillStyle = 'rgba(60,30,10,0.5)'; g.fillRect(x + 76, y + 14, 2, 42);
    }
    T_grime(g, W, H, r, 1800, 0.18, 0.04);
    return T_toTex(c, false);
  };
  K.makeSackTag = function (weight) {
    const W = 192, H = 128, c = T_canvas(W, H), g = c.getContext('2d'), r = T_rng(73);
    g.fillStyle = '#d9c79a'; g.fillRect(0, 0, W, H); g.fillStyle = '#2a1608'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 24px ' + FONT_TA; g.fillText('நெல்', W / 2, 34); g.font = '700 40px ' + FONT_TA; g.fillText(K.tamilNum(weight) + ' பலம்', W / 2, 84);
    g.fillStyle = '#5a3a1a'; g.beginPath(); g.arc(16, 16, 6, 0, 7); g.fill(); T_grime(g, W, H, r, 500, 0.2, 0.05);
    return T_toTex(c, false);
  };
  K.makeChalkName = function () { // வள்ளி in a child's chalk, with a little flower, on a transparent canvas
    const W = 256, H = 154, c = T_canvas(W, H), g = c.getContext('2d'), r = T_rng(91);
    g.clearRect(0, 0, W, H); g.save(); g.translate(W / 2, H * 0.52); g.rotate(-0.06);
    g.font = '700 70px ' + FONT_TA; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(240,236,224,${0.32 - k * 0.07})`; g.fillText('வள்ளி', (r() - 0.5) * 3, (r() - 0.5) * 3); }
    g.restore();
    g.strokeStyle = 'rgba(236,230,214,0.55)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; g.beginPath(); g.ellipse(222 + Math.cos(a) * 11, 30 + Math.sin(a) * 11, 8, 5, a, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(222, 42); g.quadraticCurveTo(216, 80, 226, 120); g.stroke();
    // chalk grain: knock holes into the strokes
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; g.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5); }
    g.globalCompositeOperation = 'source-over';
    return T_toTex(c, false);
  };
  K.makeChildDrawing = function (seed) { // Valli's crayon kolam and a house
    const W = 256, H = 256, c = T_canvas(W, H), g = c.getContext('2d'), r = T_rng(seed || 81);
    g.fillStyle = '#eee4cc'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#b3203a'; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(48 + i * 52, 48 + j * 52, 16 + r() * 4, 0, 7); g.stroke(); }
    g.strokeStyle = '#2a5ab0'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(22 + i * 52, 22); g.lineTo(22 + i * 52, 234); g.stroke(); }
    g.fillStyle = '#2a1608'; g.font = '700 30px ' + FONT_TA; g.textAlign = 'center'; g.fillText('வள்ளி', W / 2, 140);
    T_grime(g, W, H, r, 400, 0.15, 0.03);
    return T_toTex(c, false);
  };
})(window.K);
