import * as CANNON from "cannon-es";
import type { Material, ShapeDef } from "./pieces";

/** cannon-es world setup and shape helpers for Siege Smash. */

export const GRAVITY = 12;
export const FIXED_STEP = 1 / 90;

export interface PhysicsMaterials {
  ground: CANNON.Material;
  stone: CANNON.Material;
  wood: CANNON.Material;
  ammo: CANNON.Material;
  flesh: CANNON.Material;
}

export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  const solver = world.solver as CANNON.GSSolver;
  solver.iterations = 14;
  solver.tolerance = 1e-5;
  world.quatNormalizeFast = true;
  world.quatNormalizeSkip = 0;

  const mats: PhysicsMaterials = {
    ground: new CANNON.Material("ground"),
    stone: new CANNON.Material("stone"),
    wood: new CANNON.Material("wood"),
    ammo: new CANNON.Material("ammo"),
    flesh: new CANNON.Material("flesh"),
  };
  const stiff = { contactEquationStiffness: 1e8, contactEquationRelaxation: 3, frictionEquationStiffness: 1e8, frictionEquationRelaxation: 3 };
  world.defaultContactMaterial.friction = 0.55;
  world.defaultContactMaterial.restitution = 0.04;
  Object.assign(world.defaultContactMaterial, stiff);
  const pair = (a: CANNON.Material, b: CANNON.Material, friction: number, restitution: number) =>
    world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution, ...stiff }));
  pair(mats.stone, mats.stone, 0.62, 0.02);
  pair(mats.stone, mats.wood, 0.6, 0.03);
  pair(mats.wood, mats.wood, 0.58, 0.05);
  pair(mats.ground, mats.stone, 0.75, 0.02);
  pair(mats.ground, mats.wood, 0.7, 0.05);
  pair(mats.ground, mats.ammo, 0.6, 0.22);
  pair(mats.ammo, mats.stone, 0.4, 0.12);
  pair(mats.ammo, mats.wood, 0.4, 0.15);
  pair(mats.flesh, mats.stone, 0.75, 0.02);
  pair(mats.flesh, mats.wood, 0.75, 0.02);
  pair(mats.flesh, mats.ground, 0.8, 0.02);
  pair(mats.flesh, mats.ammo, 0.4, 0.1);

  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, material: mats.ground });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  return { world, mats, ground };
}

export function materialFor(mats: PhysicsMaterials, m: Material) {
  return m === "wood" || m === "powder" ? mats.wood : mats.stone;
}

/**
 * The physics shape for a piece of size (sx, sy, sz), centred on the body origin. Prisms are regular
 * n-gons stretched to the footprint (square roofs, hexagon towers, barrels).
 */
export function shapeFor(def: ShapeDef, sx: number, sy: number, sz: number): CANNON.Shape {
  if (def.type === "box") return new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2));
  const n = def.sides;
  const verts: CANNON.Vec3[] = [];
  const faces: number[][] = [];
  // Square prisms put their corners on the box corners; hexagons point along x (Castle Kit's hex towers).
  const offset = n === 4 ? Math.PI / 4 : 0;
  const rx = n === 4 ? (sx / 2) * Math.SQRT2 : sx / 2;
  const rz = n === 4 ? (sz / 2) * Math.SQRT2 : n === 6 ? sz / Math.sqrt(3) : sz / 2;
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    verts.push(new CANNON.Vec3(Math.cos(a) * rx, -sy / 2, Math.sin(a) * rz));
  }
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    verts.push(new CANNON.Vec3(Math.cos(a) * rx * def.top, sy / 2, Math.sin(a) * rz * def.top));
  }
  // Faces wound counter-clockwise seen from outside (vertices run from +x towards +z).
  faces.push(Array.from({ length: n }, (_, i) => i)); // bottom
  faces.push(Array.from({ length: n }, (_, i) => 2 * n - 1 - i)); // top
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j, n + i].reverse());
  }
  return new CANNON.ConvexPolyhedron({ vertices: verts, faces });
}
