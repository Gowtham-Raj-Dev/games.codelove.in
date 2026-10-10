/* Patti Veedu — mobile render engine.
   Every static surface is merged per room into one or two draw calls that share a single shader and a
   texture array. Lamp, moon and window light plus ambient occlusion are baked into the vertices at load,
   so at run time the shader lights only the torch and Paatti's lamp. Rooms are drawn only when they can
   be seen through an open door or opening (portal culling). */
'use strict';
(function (K) {
  const R = K.R = { cells: new Map(), portals: [], lights: [], dyn: [], ready: false, gl2: false, stats: {} };
  const V3 = THREE.Vector3;
  let renderer, scene, camera;

  /* ======================= texture layers ======================= */
  const S0 = 512, S1 = 256;            // array 0: big surfaces and detailed textures, array 1: small ones
  const lay = [[], []];                // {img, cut}
  const layerCache = new Map();
  lay[1].push({ img: null, white: true }); // code 128 = plain white (untextured materials)
  function imgOf(tex) { const im = tex && tex.image; if (!im) return null; if (im.width && im.height) return im; return null; }
  R.layer = function (tex) {
    const im = imgOf(tex); if (!im) return 128;
    const key = tex.uuid; if (layerCache.has(key)) return layerCache.get(key);
    if (R.arraysBuilt) { console.warn('[R] texture after arrays were built', im.width, im.height); layerCache.set(key, 128); return 128; }
    const big = Math.max(im.width, im.height) >= 360, arr = big ? 0 : 1;
    if (lay[arr].length >= 127) { layerCache.set(key, 128); return 128; }
    lay[arr].push({ img: im, tex });
    const code = arr * 128 + lay[arr].length - 1; layerCache.set(key, code); return code;
  };
  function hasAlpha(d) { for (let i = 3; i < d.length; i += 16) if (d[i] < 245) return true; return false; }
  function fillArray(list, S) {
    const n = Math.max(1, list.length), data = new Uint8Array(S * S * 4 * n);
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d', { willReadFrequently: true });
    const tt = R.stats.fillT || (R.stats.fillT = { draw: 0, read: 0, loop: 0, n: 0 });
    list.forEach((L, i) => {
      const q0 = performance.now();
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
      if (L.white) { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); }
      else { g.translate(0, S); g.scale(1, -1); g.drawImage(L.img, 0, 0, S, S); } // rows bottom-up, like three's flipY
      const q1 = performance.now();
      const d = g.getImageData(0, 0, S, S).data, cut = !L.white && hasAlpha(d); L.cut = cut;
      const q2 = performance.now(); tt.draw += q1 - q0; tt.read += q2 - q1; tt.n++;
      if (!cut) { // height for bump lighting: luminance averaged over 4x4 texels, then smoothly upsampled (sharp noise would sparkle in the torch)
        if (L.white) { for (let p = 3; p < d.length; p += 4) d[p] = 128; }
        else {
          const s4 = S >> 2, lo = new Float32Array(s4 * s4);
          for (let y = 0; y < S; y++) { const ry = (y >> 2) * s4, row = y * S * 4; for (let x = 0; x < S; x++) { const p = row + x * 4; lo[ry + (x >> 2)] += d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29; } }
          const k = 1 / (16 * 256);
          for (let y = 0; y < S; y++) {
            const fy = (y + 0.5) / 4 - 0.5, y0 = Math.floor(fy), ty = fy - y0, ya = ((y0 % s4) + s4) % s4, yb = (ya + 1) % s4;
            for (let x = 0; x < S; x++) {
              const fx = (x + 0.5) / 4 - 0.5, x0 = Math.floor(fx), tx = fx - x0, xa = ((x0 % s4) + s4) % s4, xb = (xa + 1) % s4;
              const v = (lo[ya * s4 + xa] * (1 - tx) + lo[ya * s4 + xb] * tx) * (1 - ty) + (lo[yb * s4 + xa] * (1 - tx) + lo[yb * s4 + xb] * tx) * ty;
              d[(y * S + x) * 4 + 3] = v * k;
            }
          }
        }
      }
      data.set(d, i * S * S * 4); tt.loop += performance.now() - q2;
    });
    const t = new THREE.DataTexture2DArray(data, S, S, n);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true;
    return t;
  }
  R.isCut = code => { const L = code >= 128 ? lay[1][code - 128] : lay[0][code]; return !!(L && L.cut); };

  /* ======================= small helper textures ======================= */
  function cvs(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
  function detailTex() { // tileable grain for close-up crispness
    const c = cvs(256, 256, (g, w, h) => {
      const id = g.createImageData(w, h), d = id.data; let s = 7;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const v = new Float32Array(w * h); for (let i = 0; i < v.length; i++) v[i] = rnd();
      for (let pass = 0; pass < 2; pass++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; v[i] = (v[i] * 2 + v[y * w + (x + 1) % w] + v[((y + 1) % h) * w + x]) / 4; }
      for (let i = 0; i < v.length; i++) { const k = Math.max(0, Math.min(255, (v[i] - 0.5) * 3 * 255 + 128)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = k; d[i * 4 + 3] = 255; }
      g.putImageData(id, 0, 0);
    });
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  }
  function cookieTex() { // torch pattern: hot centre, a soft ring, faint outer halo and lens dust
    const c = cvs(256, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const r = w / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.18, '#f4f4f4'); gr.addColorStop(0.36, '#c9c9c9'); gr.addColorStop(0.44, '#dedede');
      gr.addColorStop(0.5, '#9a9a9a'); gr.addColorStop(0.72, '#5e5e5e'); gr.addColorStop(0.9, '#262626'); gr.addColorStop(1, '#000');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      g.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 70; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r * 0.85, x = r + Math.cos(a) * d, y = r + Math.sin(a) * d, rr = 2 + rnd() * 9; const q = g.createRadialGradient(x, y, 0, x, y, rr); q.addColorStop(0, 'rgba(150,150,150,1)'); q.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = q; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      g.globalCompositeOperation = 'source-over';
    });
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }
  function envTex() { // a dim warm room seen in brass and glass
    const c = cvs(256, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a1410'); gr.addColorStop(0.45, '#3a2a1c'); gr.addColorStop(0.55, '#4a3420'); gr.addColorStop(1, '#120c08');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const blob = (x, y, rx, ry, col) => { const q = g.createRadialGradient(x, y, 0, x, y, rx); q.addColorStop(0, col); q.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.scale(1, ry / rx); g.fillStyle = q; g.fillRect(x - rx, y * rx / ry - rx, rx * 2, rx * 2); g.restore(); };
      blob(40, 70, 26, 14, 'rgba(255,190,110,0.85)'); blob(150, 62, 34, 18, 'rgba(255,170,90,0.6)'); blob(210, 74, 20, 12, 'rgba(120,150,210,0.45)');
      g.fillStyle = 'rgba(255,220,170,0.25)'; g.fillRect(0, 60, w, 3);
    });
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
  }

  /* ======================= the shader ======================= */
  const U = R.U = {
    uA0: { value: null }, uA1: { value: null }, uDetail: { value: null }, uEnvT: { value: null }, uCookie: { value: null },
    uTorchPos: { value: new V3() }, uTorchDir: { value: new V3(0, 0, -1) }, uTorchCol: { value: new V3() }, uTorchK: { value: new V3(0.88, 0.97, 22) },
    uTorchMat: { value: new THREE.Matrix4() },
    uPlPos: { value: new V3(0, -99, 0) }, uPlCol: { value: new V3() }, uPlRange: { value: 6.5 },
    uFlick: { value: 1 }, uG0: { value: new V3() }, uG1: { value: new V3() }, uG2: { value: new V3() }, uG3: { value: new V3() },
    uG4: { value: new V3() }, uG5: { value: new V3() }, uG6: { value: new V3() }, uG7: { value: new V3() },
    uSky: { value: new V3() }, uFogCol: { value: new V3() }, uFogDen: { value: 0.058 }, uBump: { value: 0.32 }
  };
  const VS = `
attribute vec4 mt; attribute vec4 tn;
#ifdef STATIC
attribute vec4 lt; attribute vec4 lf; attribute vec4 lg; attribute vec4 lg2;
varying vec4 vLt; varying vec4 vLf; varying vec4 vLg; varying vec4 vLg2;
#endif
uniform mat4 uTorchMat;
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec4 vMt; varying vec4 vTn; varying vec4 vTc;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz); vUv = uv; vMt = mt; vTn = tn;
  vTc = uTorchMat * wp;
#ifdef STATIC
  vLt = lt; vLf = lf; vLg = lg; vLg2 = lg2;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
  const FS = `
#ifdef ARRAY
precision highp sampler2DArray;
uniform sampler2DArray uA0; uniform sampler2DArray uA1;
#else
uniform sampler2D uMap;
#endif
uniform sampler2D uDetail; uniform sampler2D uEnvT; uniform sampler2D uCookie;
uniform vec3 uTorchPos; uniform vec3 uTorchDir; uniform vec3 uTorchCol; uniform vec3 uTorchK;
uniform vec3 uPlPos; uniform vec3 uPlCol; uniform float uPlRange;
uniform float uFlick; uniform vec3 uG0; uniform vec3 uG1; uniform vec3 uG2; uniform vec3 uG3; uniform vec3 uG4; uniform vec3 uG5; uniform vec3 uG6; uniform vec3 uG7;
uniform vec3 uSky; uniform vec3 uFogCol; uniform float uFogDen; uniform float uBump;
#ifdef STATIC
varying vec4 vLt; varying vec4 vLf; varying vec4 vLg; varying vec4 vLg2;
#else
uniform vec3 uProbe; uniform vec3 uProbeF; uniform float uProbeSky;
#endif
#ifdef TRANSP
uniform float uOpacity;
#endif
varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec4 vMt; varying vec4 vTn; varying vec4 vTc;
vec3 lin3(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
vec3 bumpN(vec3 n, vec3 p, vec2 dH, float fd) {
  vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * fd; vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * n - grad);
}
void main() {
  float code = floor(vMt.x * 255.0 + 0.5);
#ifdef ARRAY
  vec4 tx = code < 127.5 ? texture(uA0, vec3(vUv, code)) : texture(uA1, vec3(vUv, code - 128.0));
#else
  vec4 tx = texture2D(uMap, vUv);
#endif
  float fl = floor(vTn.w * 255.0 + 0.5), hasA = mod(fl, 2.0), nob = mod(floor(fl / 2.0), 2.0), cutF = mod(floor(fl / 4.0), 2.0), emi = floor(fl / 16.0) / 15.0;
#ifdef CUTOUT
  if (cutF > 0.5 && tx.a < 0.5) discard;
#endif
  float metal = vMt.w;
  vec3 alb = lin3(tx.rgb) * vTn.rgb * vTn.rgb;
  float det = texture2D(uDetail, vUv * 5.0).r;
  alb *= mix(1.0, 0.85 + det * 0.3, 0.14 * (1.0 - metal) * (1.0 - nob)); // a whisper of grain: more reads as noise when moving // no grain on small, flat-shaded props
  float fd = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vN) * fd;
  if (nob < 0.5 && hasA < 0.5) { float h = tx.a; N = bumpN(N, vW, vec2(dFdx(h), dFdy(h)) * uBump, 1.0); }
  vec3 V = normalize(cameraPosition - vW);
  float ao;
  vec3 irr;
#ifdef STATIC
  vec3 bk = vLt.rgb * vLt.rgb * 4.0, bf = vLf.rgb * vLf.rgb * 4.0; vec4 g = vLg * vLg * 4.0, g2 = vLg2 * vLg2 * 4.0;
  ao = vLt.w;
  irr = bk + bf * uFlick + g.x * uG0 + g.y * uG1 + g.z * uG2 + g.w * uG3 + g2.x * uG4 + g2.y * uG5 + g2.z * uG6 + g2.w * uG7 + uSky * vLf.w;
#else
  ao = 1.0; irr = uProbe + uProbeF * uFlick + uSky * uProbeSky;
#endif
  // torch: a spot with a cookie pattern
  vec3 Lt = uTorchPos - vW; float dt = length(Lt); Lt /= max(dt, 1e-4);
  float spot = smoothstep(uTorchK.x, uTorchK.y, dot(-Lt, uTorchDir));
  vec2 cuv = vTc.xy / max(vTc.w, 1e-4) * 0.5 + 0.5;
  float ck = vTc.w > 0.0 ? texture2D(uCookie, cuv).r : 0.0;
  vec3 tI = uTorchCol * (spot * ck * pow(clamp(1.0 - dt / uTorchK.z, 0.0, 1.0), 1.5));
  // Paatti's lamp
  vec3 Lp = uPlPos - vW; float dp = length(Lp); Lp /= max(dp, 1e-4);
  vec3 pI = uPlCol * pow(clamp(1.0 - dp / uPlRange, 0.0, 1.0), 2.0);
  float ndt = max(dot(N, Lt), 0.0), ndp = max(dot(N, Lp), 0.0);
  vec3 dirIrr = tI * ndt + pI * ndp;
  float gl = exp2(vMt.z * 10.0) + 1.0, nrm = (gl + 8.0) * 0.0398;
  vec3 F0 = mix(vec3(0.04), alb, metal) * vMt.y;
  vec3 spec = (tI * ndt * pow(max(dot(N, normalize(Lt + V)), 0.0), gl) + pI * ndp * pow(max(dot(N, normalize(Lp + V)), 0.0), gl)) * nrm;
  vec3 Rv = reflect(-V, N);
  vec3 env = lin3(texture2D(uEnvT, vec2(atan(Rv.z, Rv.x) * 0.1591 + 0.5, Rv.y * 0.5 + 0.5)).rgb);
  float envK = dot(irr * ao + dirIrr * 0.6, vec3(0.333)) * 2.2 + 0.015;
  vec3 col = alb * (1.0 - metal * 0.85) * (irr * ao + dirIrr * mix(1.0, ao, 0.35)) + F0 * (spec + env * envK * (0.25 + metal)) + alb * emi * 1.25;
  float fz = length(vW - cameraPosition) * uFogDen; col = mix(col, uFogCol, 1.0 - exp(-fz * fz));
#ifdef TRANSP
  gl_FragColor = vec4(col, (hasA > 0.5 ? tx.a : 1.0) * uOpacity);
#else
  gl_FragColor = vec4(col, 1.0);
#endif
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
  const matCache = new Map();
  R.material = function (o) { // o: {stat, side, cut, transp, map, opacity, poly}
    const key = [o.stat ? 1 : 0, o.side || 0, o.cut ? 1 : 0, o.transp ? 1 : 0, o.map ? o.map.uuid : '', o.opacity || 1, o.poly ? 1 : 0].join('|');
    if (!o.unique && matCache.has(key)) return matCache.get(key);
    const defines = {}; if (o.stat) defines.STATIC = 1; if (o.cut) defines.CUTOUT = 1; if (o.transp) defines.TRANSP = 1;
    const uniforms = Object.assign({}, U);
    if (R.gl2 && !o.map) defines.ARRAY = 1; else uniforms.uMap = { value: o.map || R.whiteTex };
    if (!o.stat) { uniforms.uProbe = { value: new V3(0.05, 0.05, 0.06) }; uniforms.uProbeF = { value: new V3() }; uniforms.uProbeSky = { value: 0 }; }
    if (o.transp) uniforms.uOpacity = { value: o.opacity === undefined ? 1 : o.opacity };
    const m = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, defines, side: o.side || THREE.FrontSide, transparent: !!o.transp, depthWrite: !o.transp });
    m.extensions.derivatives = true;
    if (o.poly) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
    m.userData.uber = true;
    if (!o.unique) matCache.set(key, m);
    return m;
  };

  /* ======================= reading three materials ======================= */
  const _c = new THREE.Color();
  function lum(c) { return c.r * 0.3 + c.g * 0.59 + c.b * 0.11; }
  // what our shader needs to know about a material: layer, tint, gloss, metal, emissive, flags, pass
  R.describe = function (m) {
    if (!m || m.visible === false) return null;
    if (m.userData && (m.userData.uber || m.userData.mergeBasic)) return null;
    if (m.blending === THREE.AdditiveBlending) return null;      // flames and glows stay as they are
    if (m.isShaderMaterial || m.isSpriteMaterial || m.isLineBasicMaterial || m.isPointsMaterial) return null;
    if (!(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return null;
    const map = m.map || null, code = R.layer(map);
    const basic = !!m.isMeshBasicMaterial;
    const rough = basic ? 1 : (m.roughness !== undefined ? m.roughness : 0.9), metal = basic ? 0 : (m.metalness || 0);
    const a = rough * rough, gl = Math.max(2, Math.min(1024, 2 / Math.max(a * a, 1e-4) - 2));
    _c.copy(m.color || _c.setRGB(1, 1, 1));
    let emi = 0;
    if (basic) emi = 1;
    else if (m.emissive) { const e = lum(m.emissive) * (m.emissiveIntensity || 1); emi = Math.min(1, e / Math.max(0.05, lum(_c) * 0.8)); }
    const layerA = !!(map && R.isCutLater(code)), alpha = layerA && (!!m.transparent || m.alphaTest > 0);
    const transp = !!m.transparent && (m.opacity < 0.99 || alpha || m.depthWrite === false);
    const cut = (m.alphaTest > 0) || (!transp && alpha);
    return {
      code, tint: [Math.sqrt(Math.max(0, _c.r)), Math.sqrt(Math.max(0, _c.g)), Math.sqrt(Math.max(0, _c.b))],
      spec: basic ? 0 : 1, gloss: Math.log2(gl - 1) / 10, metal, emi: Math.round(Math.min(1, emi) * 15),
      side: m.side === THREE.DoubleSide ? 2 : m.side === THREE.BackSide ? 1 : 0, transp, cut, alpha, opacity: m.opacity, poly: !!m.polygonOffset,
      nobump: basic || metal > 0.5 || !map || layerA || !!(m.userData && m.userData.flat), map
    };
  };
  // whether a layer has holes is only known once its pixels are read: sample the source image now
  const cutKnown = new Map();
  R.isCutLater = function (code) {
    if (cutKnown.has(code)) return cutKnown.get(code);
    const L = code >= 128 ? lay[1][code - 128] : lay[0][code]; let cut = false;
    if (L && L.img) { try { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(L.img, 0, 0, 32, 32); cut = hasAlpha(g.getImageData(0, 0, 32, 32).data); } catch (e) { cut = false; } }
    cutKnown.set(code, cut); return cut;
  };

  /* ======================= geometry extraction ======================= */
  const _m3 = new THREE.Matrix3(), _v = new V3(), _n = new V3();
  // returns triangle soup in world space: {p:[...], n:[...], uv:[...], mat:[...descriptor index per triangle]}
  function extract(mesh, descs, out) {
    const g = mesh.geometry; if (!g || !g.attributes.position) return false;
    const pos = g.attributes.position, nor = g.attributes.normal, uvA = g.attributes.uv, idx = g.index;
    mesh.updateWorldMatrix(true, false);
    const mw = mesh.matrixWorld; _m3.getNormalMatrix(mw);
    const det = mw.determinant();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    for (const gr of groups) {
      const d = descs(mats[Math.min(gr.materialIndex || 0, mats.length - 1)]); if (!d) continue;
      const tm = d.map ? (d.map.updateMatrix(), d.map.matrix) : null;
      const flip = (det < 0) !== (d.side === 1);
      const end = Math.min(gr.start + gr.count, idx ? idx.count : pos.count);
      for (let i = gr.start; i + 2 < end + 0; i += 3) {
        const tri = [0, 1, 2].map(k => idx ? idx.getX(i + k) : i + k);
        if (flip) { const s = tri[1]; tri[1] = tri[2]; tri[2] = s; }
        for (const vi of tri) {
          _v.fromBufferAttribute(pos, vi).applyMatrix4(mw); out.p.push(_v.x, _v.y, _v.z);
          if (nor) { _n.fromBufferAttribute(nor, vi).applyMatrix3(_m3).normalize(); if (d.side === 1) _n.negate(); } else _n.set(0, 1, 0);
          out.n.push(_n.x, _n.y, _n.z);
          let u = uvA ? uvA.getX(vi) : 0, w = uvA ? uvA.getY(vi) : 0;
          if (tm) { const e = tm.elements, uu = e[0] * u + e[3] * w + e[6], ww = e[1] * u + e[4] * w + e[7]; u = uu; w = ww; }
          out.uv.push(u, w);
        }
        out.d.push(d);
      }
    }
    return true;
  }
  // cut triangles along room boundaries (axis-aligned lines) so each piece lies in exactly one room
  function clipLattice(src, xs, zs) {
    const out = { p: [], n: [], uv: [], d: [] };
    const lerp = (a, b, t) => { const r = a.map((x, i) => x + (b[i] - x) * t); const l = Math.hypot(r[3], r[4], r[5]) || 1; r[3] /= l; r[4] /= l; r[5] /= l; return r; };
    function split(poly, axis, c) { // returns [below, above]
      const lo = [], hi = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], da = a[axis] - c, db = b[axis] - c;
        if (da <= 0) lo.push(a); if (da >= 0) hi.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const m = lerp(a, b, da / (da - db)); lo.push(m); hi.push(m); }
      }
      return [lo, hi];
    }
    for (let t = 0; t < src.d.length; t++) {
      const v = [];
      for (let k = 0; k < 3; k++) { const i = t * 3 + k; v.push([src.p[i * 3], src.p[i * 3 + 1], src.p[i * 3 + 2], src.n[i * 3], src.n[i * 3 + 1], src.n[i * 3 + 2], src.uv[i * 2], src.uv[i * 2 + 1]]); }
      const x0 = Math.min(v[0][0], v[1][0], v[2][0]), x1 = Math.max(v[0][0], v[1][0], v[2][0]), z0 = Math.min(v[0][2], v[1][2], v[2][2]), z1 = Math.max(v[0][2], v[1][2], v[2][2]);
      if (!(x1 - x0 > 0.3 || z1 - z0 > 0.3) || (!xs.some(c => c > x0 + 1e-4 && c < x1 - 1e-4) && !zs.some(c => c > z0 + 1e-4 && c < z1 - 1e-4))) {
        for (const q of v) { out.p.push(q[0], q[1], q[2]); out.n.push(q[3], q[4], q[5]); out.uv.push(q[6], q[7]); } out.d.push(src.d[t]); continue;
      }
      let polys = [v];
      {
        for (const c of xs) if (c > x0 + 1e-4 && c < x1 - 1e-4) { const np = []; for (const pg of polys) for (const q of split(pg, 0, c)) if (q.length >= 3) np.push(q); polys = np; }
        for (const c of zs) if (c > z0 + 1e-4 && c < z1 - 1e-4) { const np = []; for (const pg of polys) for (const q of split(pg, 2, c)) if (q.length >= 3) np.push(q); polys = np; }
      }
      for (const pg of polys) for (let i = 1; i + 1 < pg.length; i++) {
        for (const q of [pg[0], pg[i], pg[i + 1]]) { out.p.push(q[0], q[1], q[2]); out.n.push(q[3], q[4], q[5]); out.uv.push(q[6], q[7]); }
        out.d.push(src.d[t]);
      }
    }
    return out;
  }
  // split long edges so baked light and AO have enough vertices (flat arrays: no garbage)
  function tessellateTri(src, t, maxE, out) {
    const me2 = maxE * maxE, st = [];
    { // already small: copy straight through
      const i = t * 9, P = src.p; let mx = 0;
      for (let e = 0; e < 3; e++) { const a = i + e * 3, b = i + ((e + 1) % 3) * 3, dx = P[a] - P[b], dy = P[a + 1] - P[b + 1], dz = P[a + 2] - P[b + 2], l = dx * dx + dy * dy + dz * dz; if (l > mx) mx = l; }
      if (mx <= me2) { for (let k = 0; k < 9; k++) { out.p.push(P[i + k]); out.n.push(src.n[i + k]); } for (let k = 0; k < 6; k++) out.uv.push(src.uv[t * 6 + k]); out.d.push(src.d[t]); out.c.push(out.curCell); return; }
    }
    const v0 = new Float32Array(24);
    for (let k = 0; k < 3; k++) { const i = t * 3 + k; v0.set([src.p[i * 3], src.p[i * 3 + 1], src.p[i * 3 + 2], src.n[i * 3], src.n[i * 3 + 1], src.n[i * 3 + 2], src.uv[i * 2], src.uv[i * 2 + 1]], k * 8); }
    st.push(v0);
    while (st.length) {
      const q = st.pop();
      let best = -1, bl = me2;
      for (let e = 0; e < 3; e++) { const a = e * 8, b = ((e + 1) % 3) * 8, dx = q[a] - q[b], dy = q[a + 1] - q[b + 1], dz = q[a + 2] - q[b + 2], l = dx * dx + dy * dy + dz * dz; if (l > bl) { bl = l; best = e; } }
      if (best < 0 || st.length > 3000) { for (let k = 0; k < 3; k++) { const o = k * 8; out.p.push(q[o], q[o + 1], q[o + 2]); out.n.push(q[o + 3], q[o + 4], q[o + 5]); out.uv.push(q[o + 6], q[o + 7]); } out.d.push(src.d[t]); out.c.push(out.curCell); continue; }
      const A = best * 8, B = ((best + 1) % 3) * 8, C = ((best + 2) % 3) * 8, m = new Float32Array(8);
      for (let i = 0; i < 8; i++) m[i] = (q[A + i] + q[B + i]) / 2;
      const ml = Math.hypot(m[3], m[4], m[5]) || 1; m[3] /= ml; m[4] /= ml; m[5] /= ml;
      const t1 = new Float32Array(24), t2 = new Float32Array(24);
      t1.set(q.subarray(A, A + 8), 0); t1.set(m, 8); t1.set(q.subarray(C, C + 8), 16);
      t2.set(m, 0); t2.set(q.subarray(B, B + 8), 8); t2.set(q.subarray(C, C + 8), 16);
      st.push(t1, t2);
    }
  }

  /* ======================= baking ======================= */
  // static lights: {x,y,z, col:[r,g,b] (linear irradiance at 1m), range, flick, group (-1|0..7), lv}
  R.addLight = function (l) { l.group = l.group === undefined ? -1 : l.group; R.lights.push(l); return l; };
  let lightGrid = null;
  function buildLightGrid() {
    lightGrid = new Map();
    for (const l of R.lights) {
      const r = l.range, i0 = Math.floor((l.x - r) / 4), i1 = Math.floor((l.x + r) / 4), j0 = Math.floor((l.z - r) / 4), j1 = Math.floor((l.z + r) / 4);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 1000 + j; if (!lightGrid.has(k)) lightGrid.set(k, []); lightGrid.get(k).push(l); }
    }
  }
  const EMPTY = [];
  function lightsNear(x, z) { return lightGrid.get(Math.floor(x / 4) * 1000 + Math.floor(z / 4)) || EMPTY; }
  const MOON = new V3(0.38, 1, 0.22).normalize();
  // irradiance at a point with normal n. ctx: {cell, lvOf} ; writes into o
  R.bakePoint = function (x, y, z, nx, ny, nz, o, forProbe) {
    const W = K.W, lvP = W.levelOfY(y);
    let r = 0, gg = 0, b = 0, fr = 0, fg = 0, fb = 0;
    const grp = o.grp || (o.grp = new Float32Array(8)); grp.fill(0);
    const ox = x + nx * 0.22, oz = z + nz * 0.22;
    for (const l of lightsNear(x, z)) {
      if (l.lv !== lvP && !l.anyLv) continue;
      const dx = l.x - x, dy = l.y - y, dz = l.z - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > l.range * l.range) continue;
      const d = Math.sqrt(d2) || 1e-3;
      let w = forProbe ? 1 : (dx * nx + dy * ny + dz * nz) / d; w = Math.max(0, (w + 0.12) / 1.12); if (w <= 0) continue;
      const att = Math.pow(Math.max(0, 1 - d / l.range), l.decay || 2);
      if (att <= 0) continue;
      if (!l.noOcc && K.Nav.losWalls) { // wall occlusion, remembered per light and 25 cm cell (thousands of vertices share a cell)
        const ck = K.Nav.cellKey(ox, oz, lvP), lc = l.losC || (l.losC = new Map()); let v = lc.get(ck);
        if (v === undefined) { v = K.Nav.losWalls(l.x, l.z, ox, oz, lvP) ? 1 : 0; lc.set(ck, v); }
        if (!v) continue;
      }
      const k = att * w;
      if (l.group >= 0) grp[l.group] += k * l.gi;
      else if (l.flick) { fr += k * l.col[0]; fg += k * l.col[1]; fb += k * l.col[2]; }
      else { r += k * l.col[0]; gg += k * l.col[1]; b += k * l.col[2]; }
    }
    const sky = W.skyAt(x, y, z, lvP);
    if (sky > 0) { const m = Math.max(0, nx * MOON.x + ny * MOON.y + nz * MOON.z) * 0.65 + 0.35; r += 0.20 * sky * m; gg += 0.25 * sky * m; b += 0.38 * sky * m; }
    const amb = W.ambientAt(x, y, z, lvP, ny);
    r += amb[0]; gg += amb[1]; b += amb[2];
    o.r = r; o.g = gg; o.b = b; o.fr = fr; o.fg = fg; o.fb = fb; o.sky = sky;
    return o;
  };
  const enc = v => Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, v) / 4) * 255)));

  /* ======================= cells and portals ======================= */
  function cellRec(id) { if (!R.cells.has(id)) R.cells.set(id, { id, meshes: [], portals: [], out: K.W.cellIsOut(id), vis: true, track: [] }); return R.cells.get(id); }
  R.addPortal = function (a, b, box, door) {
    if (!a || !b || a === b) return null;
    const p = { a, b, box: new THREE.Box3(new V3(box[0], box[1], box[2]), new V3(box[3], box[4], box[5])), door: door || null };
    R.portals.push(p); cellRec(a).portals.push(p); cellRec(b).portals.push(p); return p;
  };

  /* ======================= static compile ======================= */
  R.compileStatic = function (meshes, opts) {
    const W = K.W, t0 = performance.now();
    const descCache = new Map(), descs = m => { if (!descCache.has(m)) descCache.set(m, R.describe(m)); return descCache.get(m); };
    const soup = { p: [], n: [], uv: [], d: [] }, taken = [];
    for (const m of meshes) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!mats.every(x => descs(x))) continue;
      if (extract(m, descs, soup)) taken.push(m);
    }
    const T1 = performance.now();
    const lat = K.W.lattice(), cl = clipLattice(soup, lat.xs, lat.zs);
    const T2 = performance.now();
    // each clipped piece lies in one room: pick its room, then subdivide finely indoors and coarsely outside
    const ts = { p: [], n: [], uv: [], d: [], c: [], curCell: '' };
    for (let t = 0; t < cl.d.length; t++) {
      const i = t * 9;
      const cx = (cl.p[i] + cl.p[i + 3] + cl.p[i + 6]) / 3, cy = (cl.p[i + 1] + cl.p[i + 4] + cl.p[i + 7]) / 3, cz = (cl.p[i + 2] + cl.p[i + 5] + cl.p[i + 8]) / 3;
      const nx = cl.n[i] + cl.n[i + 3] + cl.n[i + 6], ny = cl.n[i + 1] + cl.n[i + 4] + cl.n[i + 7], nz = cl.n[i + 2] + cl.n[i + 5] + cl.n[i + 8], nl = Math.hypot(nx, ny, nz) || 1;
      const cell = W.cellAt(cx + nx / nl * 0.06, cy + ny / nl * 0.06, cz + nz / nl * 0.06);
      ts.curCell = cell; tessellateTri(cl, t, W.cellIsOut(cell) ? 2.2 : (opts.maxEdge || 0.8), ts);
    }
    const T3 = performance.now();
    R.stats.trisIn = soup.d.length; R.stats.trisClip = cl.d.length;
    // bucket triangles by cell and pass
    const buckets = new Map();
    for (let t = 0; t < ts.d.length; t++) {
      const d = ts.d[t], cell = ts.c[t];
      const pass = d.transp ? 'tr' + (d.opacity || 1).toFixed(2) + (d.poly ? 'p' : '') : (d.side === 2 || d.cut) ? 'cut' : 'op';
      const key = cell + '|' + pass + (R.gl2 ? '' : '|' + d.code);
      if (!buckets.has(key)) buckets.set(key, { cell, pass, d, tris: [] });
      buckets.get(key).tris.push(t);
    }
    let verts = 0, calls = 0; const o = {};
    const cache = new Map(); let cbuf = new Uint8Array(16 * 65536), cn = 0; // baked light, already encoded, per unique vertex
    const bakeCached = (px, py, pz, nx, ny, nz) => {
      const xq = Math.round(px * 100), yq = Math.round(py * 100), zq = Math.round(pz * 100), nq = Math.round(nx * 4 + 4) * 81 + Math.round(ny * 4 + 4) * 9 + Math.round(nz * 4 + 4);
      const key = ((Math.imul(xq, 73856093) ^ Math.imul(yq, 19349663) ^ Math.imul(zq, 83492791)) >>> 11) * 4294967296 + ((Math.imul(xq, 2654435761) ^ Math.imul(zq, 40503) ^ Math.imul(yq, 97) ^ Math.imul(nq, 2246822519)) >>> 0);
      let idx = cache.get(key);
      if (idx === undefined) {
        R.bakePoint(px, py, pz, nx, ny, nz, o); const ao = W.aoAt(px, py, pz, nx, ny, nz);
        if ((cn + 1) * 16 > cbuf.length) { const nb = new Uint8Array(cbuf.length * 2); nb.set(cbuf); cbuf = nb; }
        idx = cn++; const b = idx * 16;
        cbuf[b] = enc(o.r); cbuf[b + 1] = enc(o.g); cbuf[b + 2] = enc(o.b); cbuf[b + 3] = Math.round(Math.max(0, Math.min(1, ao)) * 255);
        cbuf[b + 4] = enc(o.fr); cbuf[b + 5] = enc(o.fg); cbuf[b + 6] = enc(o.fb); cbuf[b + 7] = Math.round(Math.max(0, Math.min(1, o.sky)) * 255);
        for (let q = 0; q < 8; q++) cbuf[b + 8 + q] = enc(o.grp[q]);
        cache.set(key, idx);
      }
      return idx * 16;
    };
    for (const [, bk] of buckets) {
      const n = bk.tris.length * 3; verts += n;
      const P = new Float32Array(n * 3), N = new Int8Array(n * 3), UV = new Float32Array(n * 2), MT = new Uint8Array(n * 4), TN = new Uint8Array(n * 4);
      const LT = new Uint8Array(n * 4), LF = new Uint8Array(n * 4), LG = new Uint8Array(n * 4), LG2 = new Uint8Array(n * 4);
      let v = 0;
      for (const t of bk.tris) {
        const d = ts.d[t], fl = (d.alpha ? 1 : 0) | (d.nobump ? 2 : 0) | (d.cut ? 4 : 0) | (d.emi << 4);
        const q8 = d._q8 || (d._q8 = [Math.round(d.spec * 255), Math.round(Math.max(0, Math.min(1, d.gloss)) * 255), Math.round(d.metal * 255), Math.round(Math.min(1, d.tint[0]) * 255), Math.round(Math.min(1, d.tint[1]) * 255), Math.round(Math.min(1, d.tint[2]) * 255)]);
        for (let k = 0; k < 3; k++, v++) {
          const i = t * 3 + k, px = ts.p[i * 3], py = ts.p[i * 3 + 1], pz = ts.p[i * 3 + 2], nx = ts.n[i * 3], ny = ts.n[i * 3 + 1], nz = ts.n[i * 3 + 2];
          P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz;
          N[v * 3] = Math.round(nx * 127); N[v * 3 + 1] = Math.round(ny * 127); N[v * 3 + 2] = Math.round(nz * 127);
          UV[v * 2] = ts.uv[i * 2]; UV[v * 2 + 1] = ts.uv[i * 2 + 1];
          MT[v * 4] = d.code; MT[v * 4 + 1] = q8[0]; MT[v * 4 + 2] = q8[1]; MT[v * 4 + 3] = q8[2];
          TN[v * 4] = q8[3]; TN[v * 4 + 1] = q8[4]; TN[v * 4 + 2] = q8[5]; TN[v * 4 + 3] = fl;
          const c = bakeCached(px, py, pz, nx, ny, nz), v4 = v * 4;
          LT[v4] = cbuf[c]; LT[v4 + 1] = cbuf[c + 1]; LT[v4 + 2] = cbuf[c + 2]; LT[v4 + 3] = cbuf[c + 3];
          LF[v4] = cbuf[c + 4]; LF[v4 + 1] = cbuf[c + 5]; LF[v4 + 2] = cbuf[c + 6]; LF[v4 + 3] = cbuf[c + 7];
          LG[v4] = cbuf[c + 8]; LG[v4 + 1] = cbuf[c + 9]; LG[v4 + 2] = cbuf[c + 10]; LG[v4 + 3] = cbuf[c + 11];
          LG2[v4] = cbuf[c + 12]; LG2[v4 + 1] = cbuf[c + 13]; LG2[v4 + 2] = cbuf[c + 14]; LG2[v4 + 3] = cbuf[c + 15];
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3, true));
      geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      geo.setAttribute('mt', new THREE.BufferAttribute(MT, 4, true)); geo.setAttribute('tn', new THREE.BufferAttribute(TN, 4, true));
      geo.setAttribute('lt', new THREE.BufferAttribute(LT, 4, true)); geo.setAttribute('lf', new THREE.BufferAttribute(LF, 4, true));
      geo.setAttribute('lg', new THREE.BufferAttribute(LG, 4, true)); geo.setAttribute('lg2', new THREE.BufferAttribute(LG2, 4, true));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const tr = bk.pass.startsWith('tr');
      const mat = R.material({ stat: true, side: bk.pass === 'op' ? THREE.FrontSide : THREE.DoubleSide, cut: bk.pass === 'cut', transp: tr, opacity: tr ? bk.d.opacity : 1, poly: tr && bk.d.poly, map: R.gl2 ? null : bk.d.map });
      const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.userData.cell = bk.cell; mesh.renderOrder = tr ? 2 : 0;
      scene.add(mesh); cellRec(bk.cell).meshes.push(mesh); calls++;
    }
    for (const m of taken) { if (m.parent) m.parent.remove(m); }
    R.stats.static = { meshes: taken.length, tris: verts / 3, calls, ms: Math.round(performance.now() - t0), baked: cn, tExtract: Math.round(T1 - t0), tClip: Math.round(T2 - T1), tTess: Math.round(T3 - T2), tBake: Math.round(performance.now() - T3) };
    return R.stats.static;
  };

  /* ======================= dynamic objects ======================= */
  // swap the materials of a moving object for the shared shader; its light comes from a probe at its position
  R.convertDynamic = function (root, opts = {}) {
    const list = [], local = new Map();
    if (opts.hand) for (let i = R.dyn.length - 1; i >= 0; i--) if (R.dyn[i].hand) R.dyn.splice(i, 1);
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || o.userData.keepMat) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const ds = mats.map(m => R.describe(m)); if (ds.some(d => !d)) return;
      const g = o.geometry; if (!g || !g.attributes.position) return;
      const n = g.attributes.position.count, MT = new Uint8Array(n * 4), TN = new Uint8Array(n * 4);
      const groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : n, materialIndex: 0 }];
      for (const gr of groups) {
        const d = ds[Math.min(gr.materialIndex || 0, ds.length - 1)], fl = (d.alpha ? 1 : 0) | (d.nobump ? 2 : 0) | (d.cut ? 4 : 0) | (d.emi << 4);
        const end = gr.start + gr.count;
        for (let i = gr.start; i < end; i++) {
          const v = g.index ? g.index.getX(i) : i;
          MT[v * 4] = d.code; MT[v * 4 + 1] = Math.round(d.spec * 255); MT[v * 4 + 2] = Math.round(Math.max(0, Math.min(1, d.gloss)) * 255); MT[v * 4 + 3] = Math.round(d.metal * 255);
          TN[v * 4] = Math.round(Math.min(1, d.tint[0]) * 255); TN[v * 4 + 1] = Math.round(Math.min(1, d.tint[1]) * 255); TN[v * 4 + 2] = Math.round(Math.min(1, d.tint[2]) * 255); TN[v * 4 + 3] = fl;
        }
      }
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      // fold the texture transform into the uvs (the shader has no per-material uv matrix)
      const d0 = ds[0]; if (d0.map && ds.every(d => d.map === d0.map)) { d0.map.updateMatrix(); const e = d0.map.matrix.elements; if (!(e[0] === 1 && e[4] === 1 && e[6] === 0 && e[7] === 0 && e[1] === 0 && e[3] === 0)) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), w = uv.getY(i); uv.setXY(i, e[0] * u + e[3] * w + e[6], e[1] * u + e[4] * w + e[7]); } uv.needsUpdate = true; } }
      g.setAttribute('mt', new THREE.BufferAttribute(MT, 4, true)); g.setAttribute('tn', new THREE.BufferAttribute(TN, 4, true));
      const tr = ds.some(d => d.transp), side = ds.some(d => d.side === 2) ? THREE.DoubleSide : THREE.FrontSide;
      const vk = [side, ds.some(d => d.cut), tr, tr ? ds[0].opacity : 1, ds.some(d => d.poly), ds.some(d => d.side === 1), R.gl2 ? '' : (ds[0].map ? ds[0].map.uuid : '')].join('|');
      if (!local.has(vk)) { const mm = R.material({ stat: false, unique: true, side, cut: ds.some(d => d.cut), transp: tr, opacity: tr ? ds[0].opacity : 1, poly: ds.some(d => d.poly), map: R.gl2 ? null : ds[0].map }); if (ds.some(d => d.side === 1)) mm.side = THREE.BackSide; local.set(vk, mm); }
      o.material = local.get(vk);
      list.push(o);
    });
    if (list.length) R.dyn.push({ root, meshes: list, last: new V3(1e9, 0, 0), hand: !!opts.hand, every: opts.every || 0 });
    return list.length;
  };
  const _wp = new V3(), _probe = {};
  function setProbe(meshes, x, y, z) {
    R.bakePoint(x, y, z, 0, 1, 0, _probe, true);
    // switchable lights (courtyard lamps, the wing's electric bulbs) at their current level
    let r = _probe.r, g = _probe.g, b = _probe.b; const grp = _probe.grp;
    for (let i = 0; i < 8; i++) { const k = grp[i]; if (k > 0) { const v = U['uG' + i].value; r += k * v.x; g += k * v.y; b += k * v.z; } }
    for (const m of meshes) { const u = m.material.uniforms; if (!u || !u.uProbe) continue; u.uProbe.value.set(r, g, b); u.uProbeF.value.set(_probe.fr, _probe.fg, _probe.fb); u.uProbeSky.value = _probe.sky; }
  }
  // re-light every dynamic object (after a switchable light changed for good)
  R.reprobe = function () { for (const e of R.dyn) e.last.set(1e9, 0, 0); };
  R.upload = function (tex) { if (R.warmed && tex && renderer && renderer.initTexture) renderer.initTexture(tex); }; // before the warm-up, the warm-up render uploads it
  R.probeAt = (x, y, z) => R.bakePoint(x, y, z, 0, 1, 0, {}, true);
  let dynI = 0;
  function updateProbes() {
    // a few objects per frame; objects that moved more than 20 cm are re-lit
    const n = R.dyn.length; if (!n) return;
    for (let k = 0; k < Math.min(n, 12); k++) {
      const e = R.dyn[dynI = (dynI + 1) % n];
      if (e.hand) continue;
      e.root.getWorldPosition(_wp);
      if (_wp.distanceToSquared(e.last) > 0.04) { e.last.copy(_wp); setProbe(e.meshes, _wp.x, _wp.y + 0.3, _wp.z); }
    }
  }
  R.setHandProbe = function (x, y, z) { for (const e of R.dyn) if (e.hand) setProbe(e.meshes, x, y, z); };

  /* ======================= culling ======================= */
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  R.track = function (obj, cells) { // a dynamic object drawn only when one of its rooms is visible
    const rs = []; obj.traverse(o => { if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && !(o.material && o.material.visible === false)) rs.push(o); });
    const e = { obj, cells: cells || null, rs, on: true, auto: !cells };
    // a moving object's room is judged at the middle of what it draws (some groups sit at the origin with their parts placed in the world)
    if (!cells) { obj.updateMatrixWorld(true); const bx = new THREE.Box3().setFromObject(obj); if (!bx.isEmpty()) e.anchor = obj.worldToLocal(bx.getCenter(new V3())); }
    R.tracked.push(e); return e;
  };
  R.tracked = [];
  let visSet = new Set(), allVis = true, outVis = false;
  R.visible = id => allVis || visSet.has(id);
  R.cull = function (cam, forceAll) {
    cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const W = K.W, p = cam.position, start = W.cellAt(p.x, p.y, p.z);
    const next = new Set();
    allVis = !!forceAll || !R.cells.has(start);
    if (!allVis) {
      const depth = new Map([[start, 0]]), q = [start]; next.add(start);
      while (q.length) {
        const c = q.shift(), dc = depth.get(c), rec = R.cells.get(c); if (!rec || dc >= 7) continue;
        for (const pt of rec.portals) {
          const o = pt.a === c ? pt.b : pt.a; if (next.has(o)) continue;
          if (pt.door && pt.door.angle < 0.04) continue;
          if (!frustum.intersectsBox(pt.box) && !pt.box.containsPoint(p)) continue;
          next.add(o); depth.set(o, dc + 1); q.push(o);
        }
      }
      outVis = false; for (const id of next) { const r = R.cells.get(id); if (r && r.out) { outVis = true; break; } }
      if (outVis) for (const [id, r] of R.cells) if (r.out) next.add(id);
    }
    visSet = next;
    let calls = 0;
    for (const [id, r] of R.cells) { const v = allVis || next.has(id); for (const m of r.meshes) { m.visible = v; if (v) calls++; } }
    for (const e of R.tracked) {
      let v = allVis;
      if (!v) { const cs = e.cells || e.auto && (e.cellsNow = autoCells(e)); for (const c of cs) if (next.has(c)) { v = true; break; } }
      if (v !== e.on) { e.on = v; for (const o of e.rs) o.layers.mask = v ? 1 : 2; }
    }
    R.stats.cells = next.size; R.stats.staticCalls = calls;
  };
  const _ap = new V3();
  function autoCells(e) { // moving object: its room from its position, checked twice a second
    const now = performance.now(); if (e.cellsNow && now - (e.t || 0) < 500) return e.cellsNow; e.t = now;
    if (e.anchor) { _ap.copy(e.anchor); e.obj.localToWorld(_ap); } else e.obj.getWorldPosition(_ap);
    return (e.cellsNow = [K.W.cellAt(_ap.x, _ap.y + 0.1, _ap.z)]);
  }

  /* ======================= per frame ======================= */
  const _tp = new V3(), _td = new V3(), _q = new THREE.Quaternion();
  R.frame = function (t, st) { // st: {torch:{obj,on,intensity,color,range,angle,penumbra}, pl:{pos,on,intensity}, flash, fog}
    const tr = st.torch;
    if (tr && tr.on) {
      tr.obj.getWorldPosition(_tp); tr.target.getWorldPosition(_td); _td.sub(_tp).normalize();
      U.uTorchPos.value.copy(_tp); U.uTorchDir.value.copy(_td);
      const ti = tr.intensity * 0.78; U.uTorchCol.value.set(tr.color.r * ti, tr.color.g * ti, tr.color.b * ti);
      const outer = Math.cos(tr.angle), inner = Math.cos(tr.angle * (1 - tr.penumbra));
      U.uTorchK.value.set(outer, inner, tr.range);
      // cookie projection: the torch as a camera
      if (!R._tcam) R._tcam = new THREE.PerspectiveCamera(1, 1, 0.05, 30);
      const tc = R._tcam; tc.fov = THREE.MathUtils.radToDeg(tr.angle) * 2.15; tc.updateProjectionMatrix();
      tc.position.copy(_tp); tc.lookAt(_tp.x + _td.x, _tp.y + _td.y, _tp.z + _td.z); tc.updateMatrixWorld();
      U.uTorchMat.value.multiplyMatrices(tc.projectionMatrix, tc.matrixWorldInverse);
    } else U.uTorchCol.value.set(0, 0, 0);
    const pl = st.pl;
    if (pl && pl.on) { U.uPlPos.value.copy(pl.pos); U.uPlCol.value.set(1.0, 0.58, 0.22).multiplyScalar(pl.intensity); U.uPlRange.value = pl.range || 6.5; } else U.uPlCol.value.set(0, 0, 0);
    U.uFlick.value = 0.86 + Math.sin(t * 13) * 0.05 + Math.sin(t * 7.3) * 0.05 + Math.random() * 0.04;
    const f = st.flash || 0; U.uSky.value.set(0.55, 0.62, 0.85).multiplyScalar(f * 1.6);
    if (st.fog) { U.uFogCol.value.set(st.fog.color.r, st.fog.color.g, st.fog.color.b); U.uFogDen.value = st.fog.density; }
    updateProbes();
  };
  R.setGroup = function (i, r, g, b) { const u = U['uG' + i]; if (u) u.value.set(r, g, b); };

  /* ======================= setup and warm-up ======================= */
  R.init = function (ren, sc, cam) {
    renderer = ren; scene = sc; camera = cam;
    R.gl2 = !!ren.capabilities.isWebGL2;
    R.whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 128]), 1, 1); R.whiteTex.needsUpdate = true;
    U.uDetail.value = detailTex(); U.uEnvT.value = envTex(); U.uCookie.value = cookieTex();
    camera.layers.mask = 1;
  };
  R.finishTextures = function () {
    if (!R.gl2) return;
    U.uA0.value = fillArray(lay[0], S0); U.uA1.value = fillArray(lay[1], S1); R.arraysBuilt = true;
    R.stats.layers = [lay[0].length, lay[1].length];
    R.stats.texMB = +(((lay[0].length * S0 * S0 + lay[1].length * S1 * S1) * 4 * 1.33) / 1048576).toFixed(1);
  };
  R.prepareBake = function () { buildLightGrid(); };
  // draw everything once into a tiny target: uploads every buffer and texture and links every shader now, not mid-game
  R.warmup = function () {
    R.warmed = true;
    const rt = new THREE.WebGLRenderTarget(64, 64);
    const saved = []; scene.traverse(o => { saved.push([o, o.visible, o.frustumCulled, o.layers.mask]); o.visible = true; o.frustumCulled = false; o.layers.mask = 1; });
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt);
    try { renderer.render(scene, camera); } catch (e) { console.warn('warmup', e); }
    renderer.setRenderTarget(prev);
    for (const [o, v, f, l] of saved) { o.visible = v; o.frustumCulled = f; o.layers.mask = l; }
    rt.dispose();
    for (const e of R.tracked) e.on = null;
  };
})(window.K);
