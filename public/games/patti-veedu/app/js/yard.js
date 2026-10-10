/* Patti Veedu — real 3D models for the yards: trees, the coconut palm, banana plants, tulasi, rocks,
   dead trees and lanterns, from the Models.codelove.in library (CC0, embedded in yard-models.js).
   They are parsed once at boot, before the house is built, then merged into the static world like
   every other prop. When a model is missing the world falls back to its old shapes. */
'use strict';
(function (K) {
  const protos = new Map();
  const Y = K.Yard = { ready: false, has: k => protos.has(k) };

  // night look per model: colour multiplier (moonlit, desaturated) and the faint blue of outM()
  const MOOD = {
    tree: [0.62, 0.68, 0.66], palm: [0.6, 0.64, 0.6], banana: [0.6, 0.66, 0.6], tulasi: [0.7, 0.75, 0.7], fern: [0.4, 0.47, 0.42],
    stoneFlat: [0.34, 0.35, 0.4], stone: [0.36, 0.37, 0.42], deadTree: [0.55, 0.5, 0.48], deadTreeM: [0.55, 0.5, 0.48],
    lantern: [0.8, 0.8, 0.8], lanternStand: [0.8, 0.8, 0.8]
  };
  const MAT_MOOD = { PalmTree_Tree: [0.42, 0.38, 0.36] }; // the pale bark of the garden trees and palms, darkened for night
  // share of the height buried by default: the palms' and trees' wide root cones, the banana plant's pot
  const SINK = { palm: 0.22, tree: 0.06, banana: 0.3 };

  function bytes(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }
  function parse(buf) {
    return new Promise(res => {
      try { const ld = new THREE.GLTFLoader(); if (window.MeshoptDecoder) ld.setMeshoptDecoder(MeshoptDecoder); ld.parse(buf, '', g => res(g.scene), () => res(null)); }
      catch (e) { res(null); }
    });
  }
  // quantized glTF data → plain floats: r128's getX does not undo normalisation, and the merge reads raw values
  function unpack(a) {
    const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
    let s = 1, lo = -Infinity;
    if (a.normalized) {
      if (arr instanceof Int8Array) { s = 1 / 127; lo = -1; } else if (arr instanceof Uint8Array) s = 1 / 255;
      else if (arr instanceof Int16Array) { s = 1 / 32767; lo = -1; } else if (arr instanceof Uint16Array) s = 1 / 65535;
    }
    const n = a.count, k = a.itemSize, out = new Float32Array(n * k), get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) out[i * k + j] = Math.max(lo, get[j].call(a, i) * s);
    return new THREE.BufferAttribute(out, k);
  }
  // a glTF image as a canvas: drawable into the texture arrays and uploadable with flipY on WebGL 1
  function canvasOf(im) { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c; }

  function prep(key, root) {
    const tint = MOOD[key] || [1, 1, 1], seen = new Set();
    root.traverse(m => {
      if (!m.isMesh) return;
      const g = m.geometry;
      for (const n of Object.keys(g.attributes)) { if (n === 'position' || n === 'normal' || n === 'uv') g.setAttribute(n, unpack(g.attributes[n])); else g.deleteAttribute(n); }
      // glTF images are stored top row first; the engine stores layers bottom row first (three's flipY)
      const uv = g.attributes.uv; if (uv) for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
        if (seen.has(mt)) continue; seen.add(mt);
        if (mt.map && mt.map.image) { mt.map.image = canvasOf(mt.map.image); mt.map.flipY = true; mt.map.needsUpdate = true; }
        if (mt.transparent || mt.alphaTest > 0) { mt.transparent = false; mt.alphaTest = 0.5; mt.depthWrite = true; } // leaves: cut-out, not blended
        const t = MAT_MOOD[mt.name] || tint; mt.color.setRGB(mt.color.r * t[0], mt.color.g * t[1], mt.color.b * t[2]);
        if (mt.emissive) { mt.emissive.setHex(0x03050a); mt.emissiveIntensity = 1; } // like outM(): the moon's faint blue
        mt.roughness = Math.max(0.75, mt.roughness === undefined ? 1 : mt.roughness); mt.metalness = key.startsWith('lantern') ? 0.4 : 0;
      }
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    protos.set(key, { root, box, size: box.getSize(new THREE.Vector3()) });
  }

  Y.load = async function () {
    const src = window.YARD_GLB; if (!src || !THREE.GLTFLoader || /[?&]noyard\b/.test(location.search)) return; // ?noyard: the old shapes, to compare
    if (window.MeshoptDecoder) await MeshoptDecoder.ready;
    await Promise.all(Object.keys(src).map(async key => {
      // images decode after the scene is returned: wait for them so the canvases have pixels
      const root = await parse(bytes(src[key])); if (!root) return;
      const ims = []; root.traverse(m => { if (m.isMesh) for (const mt of [].concat(m.material)) if (mt.map && mt.map.image) ims.push(mt.map.image); });
      await Promise.all(ims.map(im => im.decode ? im.decode().catch(() => {}) : null));
      prep(key, root);
    }));
    Y.ready = protos.size > 0;
  };

  /* A copy of a model, standing on the ground: o = {x, y, z, h (height above ground) or s (scale), ry, sink (m below y)}.
     Without a sink, SINK[key] of the model goes under the ground and h is what stays above it.
     It is a batch group, so W.compile merges it into the static world. */
  Y.place = function (key, o, addFn) {
    const p = protos.get(key); if (!p) return null;
    const f = o.sink === undefined ? (SINK[key] || 0) : 0, s = o.s || (o.h ? o.h / (p.size.y * (1 - f)) : 1), sink = o.sink === undefined ? f * p.size.y * s : o.sink;
    const g = new THREE.Group(); g.userData.batch = true; g.userData.noTrack = true; // merged away: nothing left to cull per frame
    const inner = p.root.clone(); inner.position.set(0, -p.box.min.y, 0); g.add(inner); // the models' origin is the trunk / base centre
    g.position.set(o.x, (o.y || 0) - sink, o.z); g.rotation.y = o.ry || 0; g.scale.setScalar(s);
    g.userData.size = p.size.clone().multiplyScalar(s);
    (addFn || (x => x))(g);
    return g;
  };
})(window.K);
