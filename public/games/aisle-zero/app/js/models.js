/* AISLE ZERO — loads the library's GLB models and places them (instanced, so a whole store is a handful of draw calls). */
(function () {
  const K = (window.K = window.K || {});
  const BASE = new URL("../../../../library/", document.currentScript.src).href;

  /** Every library model the game uses (also listed in src/components/games/aisle-zero/manifest.ts). */
  K.MODEL_KEYS = ["ghosts/human-deer", "ghosts/hooded-horror-woman"];

  let loader = null;
  K.loadAll = async function (onProgress) {
    if (window.MeshoptDecoder) await MeshoptDecoder.ready;
    loader = new THREE.GLTFLoader();
    if (window.MeshoptDecoder) loader.setMeshoptDecoder(MeshoptDecoder);
    const out = {};
    let done = 0;
    await Promise.all(
      K.MODEL_KEYS.map(
        (k) =>
          new Promise((res) => {
            loader.load(
              BASE + k + ".glb",
              (g) => { out[k] = g; onProgress && onProgress(++done / K.MODEL_KEYS.length); res(); },
              undefined,
              (err) => { console.warn("model missing:", k, err && err.message ? err.message : err); out[k] = null; onProgress && onProgress(++done / K.MODEL_KEYS.length); res(); }
            );
          })
      )
    );
    return out;
  };

  const _m = new THREE.Matrix4(), _T = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

  /**
   * One InstancedMesh per sub-mesh of the model. `list`: [{x, y, z, ry, s | sx,sy,sz}]. `tint` multiplies the material colour.
   * Returns a Group (the caller adds it to the scene).
   */
  K.instance = function (gltf, list, tint) {
    const g = new THREE.Group();
    if (!gltf || !list.length) return g;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((mesh) => {
      if (!mesh.isMesh || mesh.isSkinnedMesh) return;
      let mat = mesh.material;
      if (tint !== undefined) { mat = mat.clone(); mat.color.multiply(new THREE.Color(tint)); }
      const im = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        _e.set(0, t.ry || 0, 0); _q.setFromEuler(_e); _p.set(t.x, t.y || 0, t.z);
        const k = t.s || 1; _s.set(t.sx || k, t.sy || k, t.sz || k);
        _T.compose(_p, _q, _s); _m.multiplyMatrices(_T, mesh.matrixWorld); im.setMatrixAt(i, _m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      g.add(im);
    });
    return g;
  };

  /** A single static copy (no skeleton). */
  K.place = function (gltf, x, y, z, ry, s, tint) {
    const g = K.instance(gltf, [{ x, y, z, ry, s }], tint);
    return g;
  };
})();
