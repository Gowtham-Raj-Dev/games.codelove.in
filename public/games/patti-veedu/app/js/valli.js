/* Valli: the little girl who walks the house at night. A real child avatar (Microsoft Rocketbox, MIT),
   repainted dead-pale, long black hair over her face, posed limp and still; she twitches and turns to look at you. */
(function (K) {
  const V = K.Valli = { group: null, ready: false };
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _iq = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _ax = new THREE.Vector3();
  // rotate bone b so the direction from b to c points along world dir d (share k of the way)
  function aim(b, c, d, k = 1) {
    b.getWorldPosition(_a); c.getWorldPosition(_b); _b.sub(_a).normalize();
    _q.setFromUnitVectors(_b, _d.copy(d).normalize()); _iq.identity(); _q.slerp(_iq, 1 - k);
    b.parent.getWorldQuaternion(_q2); const loc = _q2.clone().invert().multiply(_q).multiply(_q2); b.quaternion.premultiply(loc);
  }
  function bendW(b, axis, ang) { b.parent.getWorldQuaternion(_q2); _q.setFromAxisAngle(axis, ang); b.quaternion.premultiply(_q2.clone().invert().multiply(_q).multiply(_q2)); }

  V.build = function (scene) {
    return new Promise(resolve => {
      const src = window.VALLI_RB_GLB; if (!src || !THREE.GLTFLoader) { resolve(null); return; }
      try {
        const s = atob(src), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
        const hairP = K.loadHair ? K.loadHair() : Promise.resolve(null);
        new THREE.GLTFLoader().parse(u.buffer, '', gltf => hairP.then(hairSrc => {
          try { V.group = setup(gltf, hairSrc); V.group.visible = false; scene.add(V.group); V.ready = true; resolve(V.group); }
          catch (e) { console.warn('Valli setup failed', e); resolve(null); }
        }), () => resolve(null));
      } catch (e) { resolve(null); }
    });
  };

  function setup(gltf, hairSrc) {
    const root = new THREE.Group(), body = gltf.scene; root.add(body); root.updateMatrixWorld(true);
    let pre = 'Bip02_'; if (!body.getObjectByName(pre + 'Head')) pre = 'Bip01_';
    const bone = n => body.getObjectByName(pre + n), wp = o => o.getWorldPosition(new THREE.Vector3());
    const skins = []; body.traverse(o => { if (o.isSkinnedMesh) skins.push(o); });
    if (!skins.length || !bone('Head')) throw new Error('model incomplete');
    const mats = [], texList = [];
    for (const sm of skins) {
      sm.frustumCulled = false; sm.castShadow = false;
      const m = sm.material; m.transparent = true; m.opacity = 0; m.depthWrite = true;
      if (m.map) { m.map.anisotropy = 4; texList.push(m.map); m.emissiveMap = m.map; m.emissive.setHex(/head/.test(m.name) ? 0x343834 : 0x1c201e); }
      if (m.normalMap) texList.push(m.normalMap);
      m.roughness = 0.8; mats.push(m);
    }
    // which way does she face? the eyes sit in front of the head bone
    const eyeP = bone('LEye') ? wp(bone('LEye')) : null, faceYaw = eyeP && (eyeP.z - wp(bone('Head')).z) < 0 ? Math.PI : 0;
    body.rotation.y += faceYaw; root.updateMatrixWorld(true); // turn her so she faces +Z like everything else
    // --- the pose: limp arms, head hanging forward and to one side, a slight lean
    const up = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
    aim(bone('L_UpperArm'), bone('L_Forearm'), new THREE.Vector3(0.12, -1, 0.05)); aim(bone('L_Forearm'), bone('L_Hand'), new THREE.Vector3(0.06, -1, 0.1));
    aim(bone('R_UpperArm'), bone('R_Forearm'), new THREE.Vector3(-0.12, -1, 0.05)); aim(bone('R_Forearm'), bone('R_Hand'), new THREE.Vector3(-0.06, -1, 0.1));
    bendW(bone('Spine1'), X, 0.05); bendW(bone('Neck'), X, 0.16); bendW(bone('Head'), X, 0.1); bendW(bone('Head'), Z, 0.3);
    root.updateMatrixWorld(true);
    const rest = {}; ['Neck', 'Head', 'Spine1', 'L_Hand', 'R_Hand'].forEach(n => { if (bone(n)) rest[n] = bone(n).quaternion.clone(); });
    // --- long black hair from the crown: over the back, and hanging down across the face
    const headB = bone('Head'), pts = []; { const v = new THREE.Vector3(); for (const sm of skins) { if (!/head/.test(sm.material.name)) continue; const pa = sm.geometry.attributes.position; for (let i = 0; i < pa.count; i += 2) { sm.boneTransform(i, v); v.applyMatrix4(sm.matrixWorld); pts.push(v.clone()); } } }
    const hP = wp(headB); const hb = new THREE.Box3(); for (const p of pts) if (p.y > hP.y - 0.02) hb.expandByPoint(p);
    const hc = hb.getCenter(new THREE.Vector3()), hs = hb.getSize(new THREE.Vector3());
    const face = new THREE.Group(); face.position.copy(hc); root.add(face); face.updateMatrixWorld(true); headB.attach(face);
    const hairM = new THREE.MeshLambertMaterial({ map: K.makeGhostHairTex(), color: 0x1a1714, alphaTest: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0 }); mats.push(hairM);
    const rx = hs.x / 2, ry = hs.y / 2, rz = hs.z / 2, strands = [];
    const lock = (a, y, w, len, tilt) => {
      const piv = new THREE.Group(); piv.rotation.order = 'YXZ';
      piv.position.set(Math.sin(a) * (rx + 0.006), y, Math.cos(a) * (rz + 0.006) - rz * 0.1); piv.rotation.y = a; piv.rotation.x = tilt;
      const st = new THREE.Mesh(new THREE.PlaneGeometry(w, len, 1, 4), hairM); st.position.y = -len / 2;
      const sp = st.geometry.attributes.position; for (let i = 0; i < sp.count; i++) { const k = 0.5 - sp.getY(i) / len; sp.setZ(i, -k * k * 0.04); sp.setX(i, sp.getX(i) * (1 + k * 0.4)); }
      st.geometry.computeVertexNormals(); piv.add(st); face.add(piv); strands.push(piv);
    };
    if (hairSrc) {
      // real long black hair; her ponytail is tucked away under it
      const heads = skins.filter(sm => /head/.test(sm.material.name));
      K.tuckBehind(heads[0], hb.max.z - (hb.max.x - hb.min.x) * 1.12, hP.y - 0.16);
      const skull = new THREE.Box3(); for (const q of K.headPoints(heads)) if (q.y > hP.y + 0.03) skull.expandByPoint(q);
      const hg = K.fitHair(hairSrc, root, headB, skull, { fit: 1.08, depth: 0.95, top: 0.006, brow: 0.03, emissive: 0x080808 });
      for (const mt of hg.userData.mats) { mats.push(mt); if (mt.map) texList.push(mt.map); }
    } else for (let i = 0; i < 12; i++) { const a = Math.PI * (0.4 + i * 0.11); lock(a, ry * 0.6, 0.075, 0.55 + 0.1 * Math.abs(Math.sin(i * 2.3)), -0.15 - 0.15 * Math.max(0, -Math.cos(a))); }
    if (!hairSrc) for (const a of [-0.72, 0.7, -0.46]) lock(a, ry * 0.8, a === -0.46 ? 0.04 : 0.06, a === -0.46 ? 0.34 : 0.44, -0.08); // locks framing her face, one straying across it
    // --- two pale eyes glinting through the hair
    const glow = K.makeGlowTex('rgba(236,242,236,1)', 'rgba(170,200,205,0.3)'), eyes = [];
    for (const n of ['LEye', 'REye']) { const b = bone(n); if (!b) continue; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sp.scale.set(0.026, 0.026, 1); sp.position.copy(wp(b)).add(new THREE.Vector3(0, 0, 0.02)); root.add(sp); sp.updateMatrixWorld(true); b.attach(sp); eyes.push(sp); }
    // --- a silver anklet on one foot: the kolusu the house is named for
    const sil = new THREE.MeshStandardMaterial({ color: 0x9a9c98, metalness: 0.8, roughness: 0.4, transparent: true, opacity: 0 }); mats.push(sil);
    const fl = bone('L_Foot'); if (fl) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.005, 6, 16), sil); ring.rotation.x = Math.PI / 2; ring.position.copy(wp(fl)).add(new THREE.Vector3(0, 0.015, -0.01)); root.add(ring); ring.updateMatrixWorld(true); fl.attach(ring); }
    root.userData = { yaw0: 0, bone, rest, mats, eyes, texList, tw: 1.5, twA: 0, twT: 0, hold: 0, t: 0 };
    return root;
  }
  V.textures = () => (V.group ? V.group.userData.texList : []);
  V.setOpacity = function (op) {
    if (!V.group) return; const u = V.group.userData;
    for (const m of u.mats) m.opacity = op;
    for (const e of u.eyes) e.material.opacity = Math.min(1, op * 1.1);
  };
  // stand at a spot, facing the camera
  V.show = function (x, y, z, cam) { const g = V.group; if (!g) return; g.position.set(x, y + 0.02, z); g.rotation.set(0, Math.atan2(cam.x - x, cam.z - z) + (g.userData.yaw0 || 0), 0); g.visible = true; V.setOpacity(0); };
  V.hide = function () { if (V.group) V.group.visible = false; };
  // while she is seen: her head jerks, settles, jerks again; the body sways a hair
  V.update = function (dt, cam) {
    const g = V.group; if (!g || !g.visible) return; const u = g.userData, b = u.bone; u.t += dt;
    for (const n in u.rest) b(n).quaternion.copy(u.rest[n]);
    u.tw -= dt; if (u.tw <= 0 && u.hold <= 0) { u.twT = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.3); u.hold = 0.2 + Math.random() * 0.3; u.tw = 0.8 + Math.random() * 1.6; }
    if (u.hold > 0) { u.hold -= dt; if (u.hold <= 0) u.twT = 0; }
    u.twA += (u.twT - u.twA) * Math.min(1, dt * (u.twT ? 30 : 6));
    g.updateMatrixWorld(true); g.getWorldQuaternion(_q); _ax.set(0, 0, 1).applyQuaternion(_q);
    bendW(b('Head'), _ax, u.twA); _ax.set(0, 1, 0); bendW(b('Neck'), _ax, Math.sin(u.t * 0.8) * 0.08);
    g.position.y += Math.sin(u.t * 1.4) * 0.0006;
  };
})(window.K);
