/* Real hair: "P8 Alyson- Hair Black reduced polys" by backdoor3d, CC BY-ND 4.0 (used as is: only placed and sized on each head). */
(function (K) {
  let prom = null;
  K.loadHair = function () {
    if (prom) return prom;
    prom = new Promise(res => {
      const src = window.HAIR_ALYSON_GLB; if (!src || !window.MeshoptDecoder || !THREE.GLTFLoader) { res(null); return; }
      MeshoptDecoder.ready.then(() => {
        try {
          const s = atob(src), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
          const ld = new THREE.GLTFLoader(); ld.setMeshoptDecoder(MeshoptDecoder);
          ld.parse(u.buffer, '', g => res(g.scene), () => res(null));
        } catch (e) { res(null); }
      }, () => res(null));
    });
    return prom;
  };
  const _v = new THREE.Vector3(), _d = new THREE.Vector3();
  // our own head meshes (MIT avatars): pull a bun or a ponytail sticking out behind the skull back into it, so the hair sits right
  K.tuckBehind = function (sm, zPlane, yMin) {
    sm.updateMatrixWorld(true); const inv = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(sm.matrixWorld).invert());
    const pa = sm.geometry.attributes.position; let n = 0;
    for (let i = 0; i < pa.count; i++) {
      sm.boneTransform(i, _v); _v.applyMatrix4(sm.matrixWorld);
      if (_v.z < zPlane && _v.y > yMin) { _d.set(0, 0, zPlane + (_v.z - zPlane) * 0.1 - _v.z).applyMatrix3(inv); pa.setXYZ(i, pa.getX(i) + _d.x, pa.getY(i) + _d.y, pa.getZ(i) + _d.z); n++; }
    }
    if (n) { pa.needsUpdate = true; sm.geometry.computeBoundingSphere(); }
    return n;
  };
  // world-space points of a skinned head (bind pose), every other vertex
  K.headPoints = function (meshes) { const pts = []; for (const sm of meshes) { const pa = sm.geometry.attributes.position; sm.updateMatrixWorld(true); for (let i = 0; i < pa.count; i += 2) { sm.boneTransform(i, _v); pts.push(_v.clone().applyMatrix4(sm.matrixWorld)); } } return pts; };
  // the crown part of the hair (its top quarter) tells how big a head it was made for
  function crownBox(obj) {
    obj.updateMatrixWorld(true); const all = new THREE.Box3().setFromObject(obj), cut = all.max.y - (all.max.y - all.min.y) * 0.28, b = new THREE.Box3();
    obj.traverse(m => {
      if (!m.isMesh) return; const p = m.geometry.attributes.position, arr = p.isInterleavedBufferAttribute ? p.data.array : p.array;
      const q = !p.normalized ? 1 : arr instanceof Int16Array ? 1 / 32767 : arr instanceof Uint16Array ? 1 / 65535 : arr instanceof Int8Array ? 1 / 127 : arr instanceof Uint8Array ? 1 / 255 : 1; // quantized positions (r128 does not de-normalize getX)
      for (let i = 0; i < p.count; i += 3) { _v.set(p.getX(i) * q, p.getY(i) * q, p.getZ(i) * q).applyMatrix4(m.matrixWorld); if (_v.y > cut) b.expandByPoint(_v); }
    });
    return { crown: b, all };
  }
  // put a copy of the hair on a head: sized to the head's width, crown on the crown, hairline at the brow; it then follows the head bone
  K.fitHair = function (src, root, headBone, head, o = {}) {
    const hair = src.clone(true), g = new THREE.Group(), mats = [];
    hair.traverse(m => {
      if (!m.isMesh) return;
      const mt = m.material = m.material.clone(); // per wearer, so each can fade on its own; textures untouched
      // rendered exactly as the model ships (blended cards); only a faint glow is added for the dark
      if (o.emissive) mt.emissive = new THREE.Color(o.emissive);
      m.castShadow = false; m.frustumCulled = false; m.renderOrder = 2; mats.push(mt);
    });
    g.add(hair); root.add(g);
    // one uniform size (the model is only placed and scaled, never reshaped): wide enough for the skull, deep enough to reach round it
    let { all } = crownBox(g); const as = all.getSize(new THREE.Vector3());
    const hw = head.max.x - head.min.x, hd = head.max.z - head.min.z;
    const k = Math.min(hw * 1.32 / as.x, Math.max(hw * (o.fit || 1.08) / as.x, hd * (o.depth || 0.92) / as.z)); g.scale.setScalar(k);
    let crown;
    ({ crown, all } = crownBox(g)); const cc = crown.getCenter(new THREE.Vector3()), hc = head.getCenter(new THREE.Vector3());
    g.position.x += hc.x - cc.x; g.position.y += head.max.y + (o.top || 0.006) - crown.max.y;
    g.position.z += (head.max.z - (o.brow || 0.03)) - all.max.z;  // the hairline sits just behind the brow
    g.updateMatrixWorld(true);
    headBone.attach(g);
    g.userData.mats = mats; return g;
  };
})(window.K);
