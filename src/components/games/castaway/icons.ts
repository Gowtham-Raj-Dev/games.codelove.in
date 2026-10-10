import * as THREE from "three";
import type { Baked } from "./props";

/**
 * Item icons for the HUD and the crafting journal, rendered once from the library models themselves
 * (three-quarter view, soft light, transparent background) into data URLs.
 */
export function renderIcons(renderer: THREE.WebGLRenderer, items: { id: string; baked: Baked; tint?: string; tilt?: number }[], size = 96): Record<string, string> {
  const out: Record<string, string> = {};
  const S = size * 2;
  const rt = new THREE.WebGLRenderTarget(S, S, { colorSpace: THREE.SRGBColorSpace });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#fff6e8", "#6b5a4a", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const pixels = new Uint8Array(S * S * 4);
  const big = document.createElement("canvas");
  big.width = big.height = S;
  const bctx = big.getContext("2d")!;
  const small = document.createElement("canvas");
  small.width = small.height = size;
  const sctx = small.getContext("2d")!;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  for (const item of items) {
    let material = item.baked.material;
    if (item.tint) {
      const m = (material as THREE.MeshLambertMaterial).clone();
      m.color.set(item.tint);
      material = m;
    }
    const mesh = new THREE.Mesh(item.baked.geometry, material);
    mesh.rotation.set(item.tilt ?? 0, -0.6, 0);
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
    camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0.55, 1).normalize().multiplyScalar(dist));
    camera.lookAt(sphere.center);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, pixels);
    const img = bctx.createImageData(S, S);
    // Flip vertically (GL rows start at the bottom).
    for (let y = 0; y < S; y++) img.data.set(pixels.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    bctx.putImageData(img, 0, 0);
    sctx.clearRect(0, 0, size, size);
    sctx.drawImage(big, 0, 0, size, size);
    out[item.id] = small.toDataURL("image/png");
    scene.remove(mesh);
    if (material !== item.baked.material) material.dispose();
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  rt.dispose();
  return out;
}
