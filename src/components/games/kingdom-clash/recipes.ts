/**
 * Kingdom Clash — how every building looks at every level, composed from library kit pieces.
 * Pure data: positions are in tiles from the footprint centre (y up, +x / +z face the camera).
 * The engine merges each recipe into a few meshes; `turret` parts aim at targets and `spin`
 * parts turn (mill wheels).
 */
import { BUILDINGS, type BKind, type HeroKind, type RaiderKind, type TroopKind } from "./data";
import type { ModelName } from "./manifest";

export type Look = "gold" | "elixir" | "glow" | "dark" | "red" | "frost" | "granite" | "stone" | "earth";

export interface Part {
  m: ModelName;
  x?: number;
  y?: number;
  z?: number;
  /** Rotation about y (radians). */
  r?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  look?: Look;
}

export interface Recipe {
  parts: Part[];
  /** The square foundation (kept apart so the building on it can be fitted inside its footprint). */
  base?: Part[];
  /** Aims at targets (defences); its origin is the pivot. */
  turret?: { y: number; parts: Part[] };
  /** Turns around its x axis (a wheel), placed at (x, y, z) with rotation r. */
  spin?: { x: number; y: number; z: number; r: number; parts: Part[]; speed: number };
  /** Rough height (labels, bars). */
  height: number;
}

const R90 = Math.PI / 2;
const R180 = Math.PI;

/** Heights of stackable pieces (model units). */
const H: Partial<Record<ModelName, number>> = {
  towerBase: 1.01,
  towerBaseColor: 1.01,
  towerMidDoor: 1.01,
  towerMidWindows: 1.01,
  towerMid: 1.01,
  hexBase: 1.31,
  hexMid: 0.46,
  roundTower: 1.31,
  tdRoundBase: 0.21,
  tdRoundBottomA: 0.6,
  tdRoundBottomB: 0.6,
  tdRoundBottomC: 0.6,
  tdRoundMiddleA: 0.6,
  tdRoundMiddleB: 0.6,
  tdRoundTopA: 0.5,
  tdRoundTopB: 0.5,
  tdSquareBottomA: 0.5,
  tdSquareBottomB: 0.5,
  tdSquareMiddleA: 0.5,
  tdSquareMiddleB: 0.5,
  tdSquareTopA: 0.5,
  woodStructure: 0.5,
  woodStructureHigh: 1,
  towerBorder: 0.45,
};

/** Stacks pieces upwards; returns the parts and the top height. */
function stack(models: ModelName[], s: number, x = 0, z = 0, y0 = 0, look?: Look): [Part[], number] {
  const parts: Part[] = [];
  let y = y0;
  for (const m of models) {
    parts.push({ m, x, y, z, s, look });
    y += (H[m] ?? 0.5) * s;
  }
  return [parts, y];
}

/** A one-cell Fantasy Town house scaled by s: wall panels on four sides and a roof. */
function house(s: number, y: number, faces: [ModelName, ModelName, ModelName, ModelName], roof: ModelName | null, x = 0, z = 0, look?: Look): Part[] {
  // Panels sit on the +x edge of their cell; rotate them onto +x, +z, -x, -z.
  const rots = [0, -R90, R180, R90];
  const parts: Part[] = faces.map((m, i) => ({ m, x, y, z, r: rots[i], s }));
  if (roof) parts.push({ m: roof, x, y: y + s, z, s, look });
  return parts;
}

/** A plinth of stone under a building. */
const plinth = (w: number, h = 0.3, look?: Look): Part => ({ m: "towerBorder", sx: w, sy: h / 0.45, sz: w, look });

const flagOn = (x: number, y: number, z: number, s = 1, look?: Look): Part => ({ m: "flag", x, y, z, s, r: -R90 * 0.5, look });

// --- Buildings ------------------------------------------------------------------------------------

function townhall(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  const parts: Part[] = [plinth(3.6, 0.3, gold)];
  if (level <= 2) {
    const s = 1.9 + level * 0.1;
    parts.push(...house(s, 0.3, ["wallWindow", "wallDoor", "wall", "wallWindow"], "roofHighPoint", -0.25, -0.25));
    parts.push({ m: "chimney", x: -0.9, y: 0.3 + s * 0.95, z: -0.75, s: 1.2 });
    parts.push({ m: "bannerRed", x: -0.25 + 0.14 * s, y: 0.35, z: -0.25, s: s * 0.9 });
    if (level === 1) parts.push({ m: "stallRed", x: 1.25, y: 0.3, z: 1.05, s: 1.05, r: -R90 });
    if (level === 2) {
      // A stone wing joins the hall.
      parts.push(...house(1.15, 0.3, ["wallWindow", "wall", "wallWindow", "wallWindow"], "roofHighGable", 1.15, 1.0));
      parts.push({ m: "lantern", x: 1.5, y: 0.3, z: -1.45, s: 0.9 }, { m: "lantern", x: -1.45, y: 0.3, z: 1.5, s: 0.9 });
      parts.push(flagOn(-0.25, 0.3 + s * 2 - 0.05, -0.25, 1.2));
      parts.push({ m: "cartHigh", x: -1.15, y: 0.3, z: 1.25, s: 0.8, r: R90 });
    }
    return { parts, height: 0.3 + s * 2 };
  }
  // Level 3+: a castle keep, with corner towers joining at 4 and gold roofs at 5.
  const keep: ModelName[] = level >= 4 ? ["towerMidDoor", "towerMidWindows"] : ["towerMidDoor"];
  const ks = level >= 4 ? 1.55 : 1.75;
  const [k, top] = stack(keep, ks, -0.2, -0.2, 0.3);
  parts.push(...k, { m: "towerTopRoofWindows", x: -0.2, y: top, z: -0.2, s: ks * 1.06, look: gold });
  parts.push({ m: "bannerLong", x: -0.2 + ks * 0.5, y: 0.45, z: -0.2, s: 0.8 + level * 0.06 });
  const corners = level >= 4 ? [[1.3, 1.3], [-1.35, 1.3], [1.3, -1.35], [-1.35, -1.35]] : [[1.3, 1.3], [-1.35, 1.3]];
  const hs = 0.7 + level * 0.04;
  for (const [x, z] of corners) {
    parts.push({ m: "hexBase", x, y: 0.3, z, s: hs }, { m: "hexRoof", x, y: 0.3 + 1.31 * hs, z, s: hs * 1.1, look: gold });
    if (level >= 5) parts.push(flagOn(x, 0.3 + 1.31 * hs + 0.75 * hs, z, 0.8, "gold"));
  }
  parts.push(flagOn(-0.2, top + ks * 1.06 * 1.0, -0.2, 1.2, gold));
  if (level >= 4) parts.push({ m: "lantern", x: 1.65, y: 0.3, z: 0.1, s: 0.8 }, { m: "lantern", x: 0.1, y: 0.3, z: 1.65, s: 0.8 });
  if (level >= 5) parts.push({ m: "statue", x: 0.55, y: 0.3, z: 1.55, s: 0.7, r: -R90 * 0.5 });
  return { parts, height: top + ks * 1.1 };
}

function goldmine(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  // A rocky hill that grows every level, its gold seams getting richer.
  const parts: Part[] = [{ m: "rocksLarge", x: -0.4, z: -0.45, s: 1.15 + level * 0.17, r: 0.4 }];
  parts.push({ m: "goldOre", x: -0.15, z: 0.95, s: 1.2 + level * 0.12, look: "gold" });
  parts.push({ m: "cartHigh", x: 0.85, z: 0.6, s: 0.78, r: -0.5 }, { m: "goldOre", x: 0.85, y: 0.42, z: 0.6, s: 1.25, look: "gold" });
  if (level === 2) parts.push({ m: "woodStructure", x: -0.55, z: 0.35, s: 1.1, r: 0.4 }, { m: "lantern", x: 1.15, z: -0.95, s: 0.7 });
  if (level >= 3) parts.push({ m: "woodStructureHigh", x: -0.55, z: 0.3, s: 1.1, r: 0.4 }, { m: "logs", x: 0.25, z: -1.15, s: 1.2, r: R90 }, { m: "goldOre", x: 1.15, z: -0.25, s: 1.6, look: "gold" });
  if (level >= 4) {
    // A stone pit-head tower with a slate roof.
    parts.push({ m: "towerBase", x: 1.05, z: -1.0, s: 0.72, look: "stone" }, { m: "towerTopRoof", x: 1.05, y: 0.73, z: -1.0, s: 0.78, look: level >= 5 ? "gold" : "granite" });
    parts.push({ m: "cartHigh", x: -1.1, z: 1.05, s: 0.72, r: 0.9 }, { m: "goldOre", x: -1.1, y: 0.38, z: 1.05, s: 1.15, look: "gold" });
  }
  if (level >= 5) parts.push({ m: "chest", x: 0.25, z: 0.0, s: 0.95, r: -0.6, look: "gold" }, flagOn(1.05, 1.5, -1.0, 0.9, "gold"));
  return {
    parts,
    spin: level >= 3 ? { x: -0.55, y: level >= 3 ? 1.2 : 0.6, z: 0.3, r: 0.4 + R90, speed: 1.4, parts: [{ m: "watermill", s: 0.38 + level * 0.03, look: gold }] } : undefined,
    height: 2.2,
  };
}

function elixirpump(level: number): Recipe {
  const parts: Part[] = [];
  if (level === 1) {
    // A small pool with a wooden pump frame.
    parts.push({ m: "fountain", s: 0.95, look: "elixir" }, { m: "woodStructure", x: -0.95, z: -0.95, s: 0.85 });
  } else parts.push({ m: "fountainDetail", s: 1.05 + level * 0.06, look: "elixir" });
  if (level === 2) parts.push({ m: "pillarWood", x: -1.15, z: 1.15, s: 1.1 }, { m: "pillarWood", x: 1.15, z: -1.15, s: 1.1 }, { m: "barrelSmall", x: 1.1, z: 1.1, s: 0.9 });
  if (level >= 3) for (const [x, z] of [[-1.15, 1.15], [1.15, -1.15], [-1.15, -1.15], [1.15, 1.15]]) parts.push({ m: "pillarStone", x, z, s: 1.0 + level * 0.06, look: level >= 5 ? "gold" : undefined });
  if (level >= 4) parts.push({ m: "crystalLarge", x: -0.95, z: 0.05, s: 0.6, look: "glow" }, { m: "crystalLarge", x: 0.05, z: -0.95, s: 0.55, look: "glow" });
  if (level >= 5) parts.push(flagOn(1.15, 0, 1.15, 1.1, "gold"), { m: "obelisk", x: -1.15, z: -1.15, s: 1.0, look: "gold" });
  // The crystal over the basin floats and turns; it grows every level.
  return {
    parts,
    spin: { x: 0, y: level >= 2 ? 0.8 + level * 0.06 : 0.45, z: 0, r: 0, speed: 0, parts: [{ m: "crystal", s: 1.1 + level * 0.32, look: "elixir" }] },
    height: 2 + level * 0.15,
  };
}

function goldstorage(level: number): Recipe {
  const parts: Part[] = [];
  const coins: [number, number][] = [[1.0, 0.95], [-1.0, 0.95], [0.95, -1.0], [0.25, 1.15], [-0.6, 1.15]];
  if (level === 1) {
    // Crates and a small chest.
    parts.push({ m: "chest", x: -0.2, z: -0.2, s: 1.7, r: -R90 * 0.5 }, { m: "boxLarge", x: 0.9, z: -0.4, s: 1.3, r: 0.3 }, { m: "boxLarge", x: -0.9, z: 0.5, s: 1.1, r: -0.2 });
    coins.slice(0, 2).forEach(([x, z], i) => parts.push({ m: "coin", x, z, s: 0.65, r: i }));
    return { parts, height: 1.3 };
  }
  // From level 2 a big chest — iron-bound from 3, gold at 5 — on a stone dais from 3.
  const dais = level >= 3 ? 0.3 : 0;
  if (dais) parts.push({ m: "towerBorder", y: 0, sx: 2.1, sy: dais / 0.45, sz: 2.1, look: level >= 4 ? "granite" : "stone", x: -0.1, z: -0.1 });
  parts.push({ m: "chest", x: -0.1, y: dais, z: -0.1, s: 2.2 + level * 0.25, r: -R90 * 0.5, look: level >= 5 ? "gold" : level >= 3 ? "dark" : undefined });
  coins.slice(0, Math.min(5, level + 1)).forEach(([x, z], i) => parts.push({ m: "coin", x, z, s: 0.7, r: i * 1.3 }));
  if (level === 2) parts.push({ m: "boxLarge", x: 1.05, z: -0.15, s: 1.4, r: R90 });
  if (level >= 4) for (const [x, z] of [[1.15, 1.15], [-1.2, -1.2]]) parts.push({ m: "pillarStone", x, z, s: 1.2, look: level >= 5 ? "gold" : undefined });
  if (level >= 4) parts.push({ m: "keg", x: 1.1, z: -0.9, s: 0.8 }, { m: "boxLarge", x: -1.1, z: 0.3, s: 1.2 });
  if (level >= 5) parts.push(flagOn(1.15, 0, -1.15, 1, "gold"), flagOn(-1.15, 0, 1.15, 1, "gold"));
  return { parts, height: 1.5 + level * 0.2 };
}

function elixirstorage(level: number): Recipe {
  // A storage tank: a big iron-banded vat of elixir that grows every level — on a timber deck at
  // first, a round stone plinth from level 2 (granite from 4) — with small casks beside it, a stone
  // frame from level 3, glowing crystals on the lid from 4 and gold trim at 5.
  const parts: Part[] = [];
  const plinth = level >= 2 ? 0.21 : 0.05;
  const tank = 2.5 + level * 0.32;
  const top = plinth + tank * 0.46;
  if (level === 1) parts.push({ m: "planks", y: 0, sx: 2.3, sz: 2.3 });
  else parts.push({ m: "tdRoundBase", sx: 2.3 + level * 0.06, sz: 2.3 + level * 0.06, look: level >= 4 ? "granite" : "stone" });
  // The vat is plain timber and iron; the elixir shows as the glowing surface inside its rim.
  parts.push({ m: "keg", y: plinth, s: tank });
  const pool = tank * 0.21;
  parts.push({ m: "fountain", y: top - 0.05, sx: pool, sy: pool * 0.55, sz: pool, look: "elixir" });
  parts.push({ m: "potion", x: 1.08, z: 0.98, s: 1.3 + level * 0.06, look: "elixir" });
  if (level >= 2) parts.push({ m: "keg", x: -1.05, z: 1.02, s: 0.9 + level * 0.05, r: -0.4, look: "elixir" });
  if (level === 1) parts.push({ m: "barrelSmall", x: -1.0, z: 1.0, s: 0.9 });
  if (level >= 3)
    for (const [x, z] of [
      [-1.15, -1.15],
      [1.15, -1.15],
      [-1.2, 0.05],
    ])
      parts.push({ m: "pillarStone", x, z, s: 1.0 + level * 0.1, look: level >= 5 ? "gold" : undefined });
  if (level >= 4) parts.push({ m: "crystal", y: top, s: 1.0 + (level - 4) * 0.35, look: "glow" }, { m: "lanternGlass", x: 1.2, z: -0.1, s: 1.2 });
  if (level >= 5) parts.push({ m: "crystalLarge", x: 0.95, z: -0.95, s: 0.5, look: "glow" }, flagOn(1.2, 0, 1.2, 1, "gold"));
  return { parts, height: top + (level >= 4 ? 0.5 : 0.15) };
}

function builder(): Recipe {
  return {
    parts: [
      ...house(1.15, 0, ["wallWoodWindow", "wallWoodDoor", "wallWood", "wallWood"], "roofPoint", -0.15, -0.15),
      { m: "anvil", x: 0.6, z: 0.55, s: 1.5, r: -R90 * 0.5 },
      { m: "logs", x: -0.55, z: 0.7, s: 0.7, r: R90 },
    ],
    height: 1.8,
  };
}

function barracks(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  const parts: Part[] = [];
  if (level === 1) {
    // A training camp: canvas tent, dummy and weapon rack.
    parts.push({ m: "tent", x: -0.3, z: -0.3, s: 3.3, r: R90 * 0.5 }, { m: "campfire", x: 0.75, z: -0.1, s: 1.6 }, { m: "target", x: 0.95, z: 0.95, s: 1.15, r: -R90 * 0.5 }, { m: "weaponRack", x: 1.05, z: -0.75, s: 1.15, r: -R90 });
    return { parts, height: 1.6 };
  }
  // Level 2 a wooden hut, 3 a stone hall, 4 adds a tower and slate roof, 5 two towers and gold roofs.
  const stone = level >= 3;
  const faces: [ModelName, ModelName, ModelName, ModelName] = stone ? ["wallWindow", "wallDoor", "wall", "wallWindow"] : ["wallWoodWindow", "wallWoodDoor", "wallWood", "wallWood"];
  const s = 1.45 + level * 0.06;
  const roof: ModelName = level >= 3 ? "roofHighGable" : "roofGable";
  const roofLook: Look | undefined = level >= 5 ? "gold" : level >= 4 ? "granite" : undefined;
  parts.push(...house(s, 0, faces, roof, -0.3, -0.3, roofLook));
  parts.push({ m: "bannerRed", x: -0.3 + 0.14 * s, y: 0.1, z: -0.3, s: s * 0.95 });
  parts.push({ m: "weaponRack", x: 0.95, z: 1.15, s: 1.2, r: -R90 * 0.5, look: gold });
  if (level >= 2) parts.push({ m: "target", x: 1.15, z: 0.0, s: 1.05, r: -R90 });
  if (level >= 3) parts.push({ m: "chimney", x: -0.8, y: s * 0.9, z: -0.95, s: 1.1 });
  const tower = (x: number, z: number) => {
    parts.push({ m: "towerBase", x, z, s: 0.7, look: "stone" }, { m: "towerTopRoof", x, y: 0.71, z, s: 0.76, look: roofLook }, flagOn(x, 0.71 + 0.95, z, 0.75, gold));
  };
  if (level >= 4) tower(1.1, -1.1);
  if (level >= 5) tower(-1.1, 1.1);
  return { parts, height: s * 2 };
}

function camp(level: number): Recipe {
  const parts: Part[] = [{ m: "campfire", s: 3.2 }];
  const logs: [number, number, number][] = [[0, 0.85, R90], [0.85, 0, 0], [0, -0.85, R90], [-0.85, 0, 0]];
  logs.forEach(([x, z, r]) => parts.push({ m: "logs", x, z, s: 0.75, r }));
  const tents: [number, number, number][] = [[-1.35, -1.35, R90 * 0.5], [1.4, -1.35, -R90 * 0.5], [-1.35, 1.4, R90 * 1.5], [1.4, 1.4, R180 + R90 * 0.5]];
  tents.slice(0, Math.min(4, level)).forEach(([x, z, r]) => parts.push({ m: "forestTent", x, z, s: 0.9, r }));
  if (level >= 3) parts.push({ m: "arenaBanner", x: 1.75, z: 0.1, s: 1.0, r: -R90 });
  if (level >= 4) parts.push(flagOn(-1.75, 0, 0.1, 1.2));
  if (level >= 5) parts.push({ m: "weaponRack", x: 0.1, z: 1.75, s: 1.0, look: "gold" }, flagOn(0.1, 0, -1.75, 1.2, "gold"));
  return { parts, height: 1.4 };
}

function lab(level: number): Recipe {
  const s = 2.1 + level * 0.06;
  const parts: Part[] = [plinth(2.6, 0.2)];
  parts.push({ m: "hexMid", y: 0.2, s, r: R90 * 0.5 });
  let y = 0.2 + 0.46 * s;
  if (level >= 2) {
    parts.push({ m: "hexMid", y, s: s * 0.8, r: R90 * 0.5 });
    y += 0.46 * s * 0.8;
  }
  if (level >= 3) parts.push({ m: "hexRoof", y: y - 0.05, s: s * 0.75, r: R90 * 0.5, look: level >= 5 ? "gold" : undefined });
  parts.push({ m: "workbench", x: 1.05, y: 0.2, z: 0.75, s: 1.6, r: -R90 });
  parts.push({ m: "potion", x: 1.1, y: 0.2, z: -0.5, s: 0.8, look: "elixir" }, { m: "potion", x: 0.75, y: 0.2, z: 1.15, s: 0.6 });
  if (level >= 4) parts.push({ m: "crystalLarge", x: -1.0, y: 0.2, z: 1.0, s: 0.75, look: "glow" }, { m: "lanternGlass", x: 1.2, y: 0.2, z: -1.15, s: 1.5 });
  return { parts, height: y + (level >= 3 ? 1.3 : 0.3) };
}

function spellfactory(level: number): Recipe {
  const s = 2.1 + level * 0.08;
  const parts: Part[] = [{ m: "tdRoundCrystals", s, look: "glow" }];
  const pillars: [number, number][] = [[1.15, 1.15], [-1.15, 1.15], [1.15, -1.15], [-1.15, -1.15]];
  pillars.slice(0, Math.min(4, level)).forEach(([x, z]) => parts.push({ m: "obelisk", x, z, s: 1.0 + level * 0.08, look: level >= 5 ? "gold" : undefined }));
  if (level >= 2) parts.push({ m: "fireBasket", x: 1.2, z: 0, s: 1.3 }, { m: "fireBasket", x: 0, z: 1.2, s: 1.3 });
  if (level >= 3) parts.push({ m: "crystal", x: -1.2, z: 0, s: 1.5, look: "glow" });
  if (level >= 4) parts.push({ m: "altar", x: 0, z: -1.25, s: 1.0 });
  return { parts, height: 2 + level * 0.15 };
}

/** Hero altars: the dais the hero stands on (offset from the footprint centre, size per level). */
const ALTAR_SPOT = 0.3;
const daisSize = (level: number) => 1.35 + level * 0.08;

/** Where a hero stands on its altar: offset from the footprint centre and the height of the dais top. */
export function altarSpot(level: number) {
  const k = GROWTH[level - 1];
  return { x: ALTAR_SPOT * k, z: ALTAR_SPOT * k, y: FOUNDATION_H + 0.21 * daisSize(level) * k };
}

function kingaltar(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  // A round dais for the King, his frost axe standing in a rock behind it.
  const parts: Part[] = [{ m: "tdRoundBase", x: ALTAR_SPOT, z: ALTAR_SPOT, s: daisSize(level), look: gold ?? (level >= 4 ? "granite" : level >= 2 ? "stone" : undefined) }];
  parts.push({ m: "rocksSmall", x: -0.8, z: -0.8, s: 1.1, r: 0.6 }, { m: "frostAxe", x: -0.8, y: 0.25, z: -0.8, s: 1.2 + level * 0.07, r: R90 * 0.5, look: gold });
  parts.push({ m: "bannerRed", x: -1.25, z: 0.55, s: 1.05 + level * 0.05, r: R90 });
  if (level >= 2) parts.push({ m: "fireBasket", x: 1.15, z: -1.15, s: 1.15 }, { m: "fireBasket", x: -1.15, z: 1.15, s: 1.15 });
  if (level >= 3) parts.push({ m: "weaponRack", x: 0.45, z: -1.2, s: 1.05, look: gold }, { m: "shieldRound", x: 1.22, y: 0.35, z: 0.2, s: 1.5, r: -R90 });
  if (level >= 4) parts.push({ m: "fireBasket", x: 1.15, z: 1.15, s: 1.15 }, { m: "pillarStone", x: -1.2, z: -0.05, s: 1.15 });
  if (level >= 5) parts.push(flagOn(-1.2, 0, -1.2, 1.1, "gold"), { m: "statue", x: 1.2, z: -0.45, s: 0.6, r: -R90 * 0.5, look: "gold" });
  return { parts, height: 1.8 };
}

function queenaltar(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  // A round dais in a little elven grove: archery target, pines and glowing crystals.
  const parts: Part[] = [{ m: "tdRoundBase", x: ALTAR_SPOT, z: ALTAR_SPOT, s: daisSize(level), look: gold ?? (level >= 4 ? "granite" : level >= 2 ? "stone" : undefined) }];
  parts.push({ m: "target", x: -0.85, z: -0.9, s: 1.3, r: R90 * 0.5 }, { m: "bush", x: 1.1, z: -1.1, s: 1.1 });
  parts.push({ m: "bannerGreen", x: -1.25, z: 0.55, s: 1.05 + level * 0.05, r: R90 });
  if (level >= 2) parts.push({ m: "treePineRound", x: -1.15, z: 1.15, s: 0.7 }, { m: "crystalLarge", x: 1.15, z: 1.15, s: 0.55, look: "glow" });
  if (level >= 3) parts.push({ m: "lanternGlass", x: 1.22, z: 0.0, s: 1.4 }, { m: "crystal", x: -0.15, z: -1.25, s: 1.2, look: "glow" });
  if (level >= 4) parts.push({ m: "crystalLarge", x: -1.2, z: -0.1, s: 0.5, look: "glow" }, flagOn(1.2, 0, -1.2, 1));
  if (level >= 5) parts.push({ m: "obelisk", x: 0.35, z: -1.25, s: 1.0, look: "gold" }, flagOn(-1.2, 0, -1.2, 1.1, "gold"));
  return { parts, height: 1.8 };
}

function cannon(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  const parts: Part[] = [];
  let top: number;
  if (level === 1) {
    // A log platform.
    parts.push({ m: "planks", sx: 1.9, sy: 2.2, sz: 1.9 });
    for (const [x, z, r] of [[0, 0.95, 0], [0, -0.95, 0], [0.95, 0, R90], [-0.95, 0, R90]]) parts.push({ m: "logs", x, z, s: 0.75, r });
    top = 0.13;
  } else {
    // Stone bases that rise every level (dark granite at 4, gold at 5).
    const bases: [ModelName, number][] = [
      ["tdRoundBottomA", 0.45],
      ["tdRoundBottomB", 0.55],
      ["tdRoundBottomC", 0.62],
      ["tdRoundBottomC", 0.72],
    ];
    const [m, sy] = bases[level - 2];
    const s = 2.15 + level * 0.04;
    parts.push({ m, s, sy, look: level >= 5 ? "gold" : level >= 4 ? "granite" : undefined });
    top = 0.6 * s * sy;
  }
  const balls: [number, number][] = [[1.1, 1.05], [1.28, 0.75], [0.8, 1.25], [1.15, 0.92]];
  balls.slice(0, Math.min(4, level)).forEach(([x, z], i) => parts.push({ m: "cannonball", x, y: i === 3 ? 0.2 : 0, z, s: 1.25 }));
  if (level >= 3) parts.push({ m: "boxLarge", x: -1.1, z: 1.0, s: 1.0, r: 0.4 });
  if (level >= 4) parts.push(flagOn(-1.05, 0, -1.05, 0.95, gold), { m: "keg", x: 1.1, z: -1.0, s: 0.75 });
  return { parts, turret: { y: top - 0.05, parts: [{ m: "cannon", s: 1.55 + level * 0.17, look: gold ?? (level >= 4 ? "dark" : undefined) }] }, height: top + 1.1 };
}

function archertower(level: number): Recipe {
  const parts: Part[] = [];
  let deck = 0;
  if (level === 1) {
    parts.push({ m: "woodStructureHigh", s: 1.7 });
    deck = 1.7;
  } else if (level === 2) {
    parts.push({ m: "tdRoundBottomA", s: 1.9, sy: 0.7 }, { m: "woodStructureHigh", y: 0.6 * 1.9 * 0.7, s: 1.5 });
    deck = 0.8 + 1.5;
  } else {
    const floors: ModelName[] = level === 3 ? ["tdRoundBottomA", "tdRoundMiddleA"] : ["tdRoundBottomB", "tdRoundMiddleA", "tdRoundMiddleA"];
    const [p, top] = stack(floors, level === 3 ? 1.7 : 1.55);
    parts.push(...p);
    deck = top;
  }
  if (level >= 4) parts.push(flagOn(0.6, deck, -0.6, 0.8, level >= 5 ? "gold" : undefined));
  if (level >= 5) parts.push({ m: "bannerShort", x: 0.55, y: deck - 1.25, z: 0, s: 1.2 });
  return { parts, turret: { y: deck, parts: [{ m: "ballista", s: 1.6 + level * 0.08, look: level >= 5 ? "gold" : undefined }] }, height: deck + 1 };
}

function catapult(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  const parts: Part[] = [];
  let y = 0;
  if (level === 2) {
    // A palisade pen.
    for (const [x, z, r] of [[-1.2, 0, R90], [0, -1.2, 0], [-1.2, -0.6, R90], [-0.6, -1.2, 0]]) parts.push({ m: "fence", x, z, r, sy: 1.2 });
  }
  if (level === 3) {
    // A raised wooden firing deck.
    parts.push({ m: "woodStructure", sx: 2.3, sy: 1, sz: 2.3 });
    y = 0.5;
  }
  if (level >= 4) {
    parts.push({ m: "tdSquareBottomA", sx: 2.2, sy: 1.1, sz: 2.2, look: level >= 5 ? "gold" : "granite" });
    y = 0.55;
  }
  const piles: [number, number, number][] = [[1.1, 1.1, 1.5], [0.8, 1.25, 1.3], [1.25, 0.75, 1.3], [1.05, 1.0, 1.1]];
  piles.slice(0, Math.min(4, level)).forEach(([x, z, s], i) => parts.push({ m: "boulder", x, y: i === 3 ? 0.25 : 0, z, s }));
  if (level >= 4) parts.push({ m: "keg", x: -1.1, z: 1.1, s: 0.8 }, flagOn(-1.15, y, -1.15, 1, gold));
  return { parts, turret: { y, parts: [{ m: "siegeCatapult", s: 1.0 + level * 0.1, r: R90, look: level >= 4 ? (gold ?? "dark") : undefined }] }, height: y + 2 };
}

function magetower(level: number): Recipe {
  const floors: ModelName[][] = [
    ["tdSquareBottomA", "tdSquareMiddleA"],
    ["tdSquareBottomA", "tdSquareMiddleA", "tdSquareMiddleB"],
    ["tdSquareBottomB", "tdSquareMiddleA", "tdSquareMiddleB"],
    ["tdSquareBottomB", "tdSquareMiddleA", "tdSquareMiddleA", "tdSquareMiddleB"],
    ["tdSquareBottomB", "tdSquareMiddleA", "tdSquareMiddleA", "tdSquareMiddleB"],
  ];
  const s = 1.75;
  const [parts, top] = stack(floors[level - 1], s);
  if (level >= 5) parts.push({ m: "tdSquareTopA", y: top, s: s * 1.02, look: "gold" });
  if (level >= 3) parts.push({ m: "crystal", x: 1.15, z: 1.15, s: 1.2, look: "glow" });
  if (level >= 4) parts.push({ m: "crystal", x: -1.15, z: 1.15, s: 1.0, look: "glow" });
  return { parts, turret: { y: top + 0.25, parts: [{ m: "crystalLarge", s: 0.9 + level * 0.08, look: level >= 5 ? "gold" : "glow" }] }, height: top + 1.2 };
}

function tesla(level: number): Recipe {
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  // The coil (Crystal Crossroads' sci-fi machine) on a round stone pad. It grows every level; power
  // cells gather round it from level 2 (two, then three, then four), it glows electric blue at 4 and
  // turns gold at 5, and a charged crystal floats over its tip.
  const h = 2.15 + level * 0.19;
  const pad = 0.21;
  const parts: Part[] = [{ m: "tdRoundBase", s: 1.45 + level * 0.04, sy: 1, look: gold ?? (level >= 4 ? "granite" : "stone") }];
  parts.push({ m: "teslaCoil", y: pad, s: h / 5.6, look: gold ?? (level >= 4 ? "frost" : undefined) });
  const cells: [number, number][] = [[0.66, 0.66], [-0.66, -0.66], [0.66, -0.66], [-0.66, 0.66]];
  const n = level === 1 ? 0 : Math.min(4, level);
  cells.slice(0, n).forEach(([x, z]) => parts.push({ m: "teslaCell", x, z, s: 0.5 + level * 0.025, look: gold ?? (level >= 4 ? "frost" : undefined) }));
  if (level >= 3) parts.push({ m: "crystal", x: -0.72, z: 0.05, s: 0.75, look: "frost" }, { m: "crystal", x: 0.05, z: -0.72, s: 0.6, look: "frost" });
  return {
    parts,
    // The charged crystal over the tip: electric blue (gold at 5).
    spin: { x: 0, y: pad + h + 0.12, z: 0, r: 0, speed: 0, parts: [{ m: "crystal", s: 0.55 + level * 0.06, look: level >= 5 ? "gold" : "frost" }] },
    height: pad + h + 0.4,
  };
}

function skeltrap(level: number): Recipe {
  const parts: Part[] = [{ m: "graveMound", x: 0.05, z: 0.1, s: 0.75 }, { m: "gravestone", x: -0.05, z: -0.3, s: 0.6 + level * 0.04, look: level >= 5 ? "gold" : level >= 3 ? "dark" : undefined }];
  return { parts, height: 0.8 };
}

function bomb(level: number): Recipe {
  const parts: Part[] = [{ m: "keg", y: -0.12, s: 0.7 + level * 0.06, look: level >= 4 ? "dark" : undefined }];
  if (level >= 3) parts.push({ m: "spikes", s: 0.9 });
  return { parts, height: 0.6 };
}

/** Height of the square foundation every building stands on. */
export const FOUNDATION_H = 0.2;
/** Foundation material per level: earth, grey stone, sandstone, dark granite, granite with gold corners. */
const BASE_LOOK: (Look | undefined)[] = ["earth", "stone", undefined, "granite", "granite"];
const CORNER_LOOK: (Look | undefined)[] = [undefined, "granite", "granite", "stone", "gold"];
/** Size of a building on its foundation per level. */
const GROWTH = [0.9, 0.95, 1, 1.04, 1.08];

/** A square slab filling the footprint, with corner stones from level 2. */
function foundation(size: number, level: number): Part[] {
  const w = size - 0.08;
  const parts: Part[] = [{ m: "towerBorder", sx: w, sy: FOUNDATION_H / 0.45, sz: w, look: BASE_LOOK[level - 1] }];
  if (level >= 2) {
    const c = w / 2 - 0.16;
    const s = level >= 4 ? 0.34 : 0.28;
    for (const [x, z] of [[c, c], [-c, c], [c, -c], [-c, -c]]) parts.push({ m: "towerBase", x, z, s, sy: (FOUNDATION_H + 0.08 + level * 0.02) / (1.01 * s), look: CORNER_LOOK[level - 1] });
  }
  return parts;
}

/** Stands a recipe on its foundation (replacing a plinth the recipe brought itself). */
function withBase(kind: BKind, level: number, r: Recipe): Recipe {
  if (kind === "wall" || kind === "bomb" || kind === "skeltrap") return r;
  let base = -1;
  const parts = r.parts.filter((p) => {
    if (base < 0 && p.m === "towerBorder" && !p.y && !p.x && !p.z) {
      base = 0.45 * (p.s ?? 1) * (p.sy ?? 1);
      return false;
    }
    return true;
  });
  const lift = FOUNDATION_H - Math.max(0, base);
  // Everything on the foundation grows a little with each level.
  const k = GROWTH[level - 1];
  const grow = (p: Part): Part => ({ ...p, x: (p.x ?? 0) * k, y: (p.y ?? 0) * k + lift, z: (p.z ?? 0) * k, s: (p.s ?? 1) * k });
  const growT = (p: Part): Part => ({ ...p, x: (p.x ?? 0) * k, y: (p.y ?? 0) * k, z: (p.z ?? 0) * k, s: (p.s ?? 1) * k });
  return {
    base: foundation(BUILDINGS[kind].size, kind === "builder" ? 1 : level),
    parts: parts.map(grow),
    turret: r.turret && { y: r.turret.y * k + lift, parts: r.turret.parts.map(growT) },
    spin: r.spin && { ...r.spin, x: r.spin.x * k, y: r.spin.y * k + lift, z: r.spin.z * k, parts: r.spin.parts.map(growT) },
    height: r.height * k + lift,
  };
}

export function recipe(kind: BKind, level: number): Recipe {
  const l = Math.max(1, Math.min(5, level));
  return withBase(kind, l, baseRecipe(kind, l));
}

function baseRecipe(kind: BKind, l: number): Recipe {
  switch (kind) {
    case "townhall":
      return townhall(l);
    case "goldmine":
      return goldmine(l);
    case "elixirpump":
      return elixirpump(l);
    case "goldstorage":
      return goldstorage(l);
    case "elixirstorage":
      return elixirstorage(l);
    case "builder":
      return builder();
    case "barracks":
      return barracks(l);
    case "camp":
      return camp(l);
    case "lab":
      return lab(l);
    case "spellfactory":
      return spellfactory(l);
    case "kingaltar":
      return kingaltar(l);
    case "queenaltar":
      return queenaltar(l);
    case "skeltrap":
      return skeltrap(l);
    case "cannon":
      return cannon(l);
    case "archertower":
      return archertower(l);
    case "catapult":
      return catapult(l);
    case "magetower":
      return magetower(l);
    case "tesla":
      return tesla(l);
    case "bomb":
      return bomb(l);
    case "wall":
      return { parts: wallPost(l), height: 1 };
  }
}

// --- Walls: a post on every wall tile and a segment towards each neighbour ----------------------------

// Every level is its own material: wooden palisade, grey stone, red brick, granite battlements, granite
// with gold. Posts share the segment's cross-section, so a run of walls reads as one continuous wall.
export function wallPost(level: number): Part[] {
  switch (level) {
    case 1:
      return [{ m: "pillarWood", sx: 1.7, sy: 0.82, sz: 1.7 }];
    case 2:
      // The stone wall piece squeezed into a square pillar (its depth runs from z -0.5 to -0.3).
      return [{ m: "stoneWall", sx: 0.44, sy: 1.12, sz: 2.2, z: 0.88 }];
    case 3:
      return [{ m: "brickWall", sx: 0.5, sy: 1.3, sz: 1.67, z: 0.58 }];
    case 4:
      return [{ m: "towerBase", s: 0.5, sy: 1.95, look: "granite" }, { m: "towerBorder", y: 0.98, s: 0.56, sy: 0.4, look: "granite" }];
    default:
      // Solid gold pillars between dark granite battlements.
      return [{ m: "towerBaseColor", s: 0.5, sy: 2.0, look: "gold" }, { m: "towerBorder", y: 1.0, s: 0.56, sy: 0.55, look: "granite" }];
  }
}

/** A segment from the tile centre towards +x (rotate for other directions). */
export function wallSegment(level: number): Part[] {
  switch (level) {
    case 1:
      // Two palisade panels (each 0.5 long, its depth centred at z -0.225).
      return [
        { m: "fence", x: 0.25, z: 0.225, sy: 1.4 },
        { m: "fence", x: 0.75, z: 0.225, sy: 1.4 },
      ];
    case 2:
      return [{ m: "stoneWall", x: 0.5, sy: 1.0, sz: 1.9, z: 0.76 }];
    case 3:
      return [{ m: "brickWall", x: 0.5, sy: 1.15, sz: 1.4, z: 0.49 }];
    case 4:
      // Castle wall with battlements, turned to run along x (its depth then sits at z 0..0.5·sx).
      return [{ m: "castleWallNarrow", x: 0.5, z: -0.21, sx: 0.84, sy: 0.66, sz: 1.0, r: R90, look: "granite" }];
    default:
      return [{ m: "castleWallNarrow", x: 0.5, z: -0.225, sx: 0.9, sy: 0.76, sz: 1.0, r: R90, look: "granite" }];
  }
}

// --- Other world pieces ------------------------------------------------------------------------------

/** Obstacles (index = SObstacle.model): the first three are 2×2. */
export const OBSTACLES: Part[][] = [
  [
    { m: "treeOak", x: -0.35, z: -0.3, s: 1.5 },
    { m: "treeDefault", x: 0.45, z: 0.4, s: 1.2 },
  ],
  [{ m: "rocksLarge", s: 1.5, r: 0.7 }],
  [
    { m: "treeFat", x: 0.1, z: -0.2, s: 1.6 },
    { m: "bush", x: -0.5, z: 0.5, s: 1.6 },
  ],
  [{ m: "treePineRound", s: 1.2 }],
  [{ m: "stump", s: 1.8 }],
  [{ m: "bush", s: 2.2 }],
  [{ m: "mushrooms", s: 2.4 }],
  [{ m: "rockB", s: 1.4, r: 1.2 }],
];

/** Rubble left by a destroyed building (scaled to its footprint). */
export function rubble(size: number): Part[] {
  const s = size / 3;
  return [
    { m: "debris", x: -0.3 * s, z: 0.2 * s, s: 2.6 * s },
    { m: "debrisWood", x: 0.45 * s, z: -0.35 * s, s: 2.2 * s, r: 0.7 },
    { m: "rocksSmall", x: 0.1 * s, z: 0.5 * s, s: 0.9 * s, r: 0.3 },
    { m: "debris", x: 0.55 * s, z: 0.6 * s, s: 1.6 * s, r: 2 },
  ];
}

// --- Troops ------------------------------------------------------------------------------------------

export interface Gear {
  m: ModelName;
  /** Bone (or hand slot) the gear hangs on. */
  bone: string;
  /** Hold it like this built-in prop (same parent, grip and turn); the prop itself is hidden. */
  like?: string;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  s?: number;
  look?: Look;
}

export interface TroopLook {
  m: ModelName;
  /** Height in tiles. */
  height: number;
  gear: Gear[];
  /** Clip played while attacking. */
  attack: string;
  /** Attack clips taken in turn (a sword cut, another, a kick…) instead of `attack` every time. */
  combo?: string[];
  run: string;
  /** Pose between blows / shots (aiming a bow); idle when unset. */
  hold?: string;
  /** Clip names for characters whose rig names them differently ("idle" → "Idle"). */
  clips?: Record<string, string>;
  /** Borrow the animations of another model with the same skeleton. */
  clipSource?: ModelName;
  /** Built-in props to hide (by node name). */
  hide?: string[];
  /**
   * Made-up clips: `base`'s legs and body with `arms`' arms — moving, or frozen at second `at`
   * (running while carrying something, or holding a weapon up instead of letting it hang).
   */
  mix?: { name: string; base: string; arms: string; at?: number }[];
}

/** Kenney mini characters' hands hang at hip height: these poses hold the weapon up in front instead. */
const READY = "attack-melee-right";
const READY_AT = 0.06;
/** Arms raised in front of the chest (the end of "pick-up"): aiming a crossbow, carrying a bomb. */
const CHEST = "pick-up";
const CHEST_AT = 0.45;
const readyMix = (arms = READY, at = READY_AT, name = "ready") => [
  { name, base: "idle", arms, at },
  { name: `${name}-walk`, base: "walk", arms, at },
  { name: `${name}-run`, base: "sprint", arms, at },
];
const readyClips = (name = "ready") => ({ idle: name, walk: `${name}-walk` });

/** KayKit adventurers (the Axe King). */
const KAYKIT_CLIPS: Record<string, string> = { idle: "Idle", walk: "Walking_A", sprint: "Running_A", die: "Death_A", "emote-yes": "Cheer", "interact-right": "Interact", sleep: "Lie_Idle", ability: "Cheer" };
/** The God of War collection's biped rig (the skeleton, and the Elf Queen who borrows its clips). */
const BIPED_CLIPS: Record<string, string> = { idle: "idle", walk: "mv_tar21", sprint: "mv_tar21", die: "hurt", "emote-yes": "win", "interact-right": "win", sleep: "shuimian", enter: "enter", ability: "win" };

const sword = (look?: Look, s = 1): Gear => ({ m: "sword", bone: "arm-right", x: -0.06, y: -0.13, z: 0.07, rx: R90, s, look });
const shield = (m: ModelName, look?: Look): Gear => ({ m, bone: "arm-left", x: 0.08, y: -0.08, z: 0.02, ry: -R90, s: 0.9, look });

export function troopLook(kind: TroopKind | RaiderKind | HeroKind | "bones" | "builder", level: number): TroopLook {
  const grow = 1 + (level - 1) * 0.05;
  const gold: Look | undefined = level >= 5 ? "gold" : undefined;
  switch (kind) {
    case "warrior":
      return {
        m: "warrior",
        height: 0.7 * grow,
        // From level 4 the warrior swaps his sword for a chaos blade.
        gear: [level >= 4 ? { ...sword(gold, 0.75 + level * 0.05), m: "chaosBlade" as const } : sword(gold, 0.9 + level * 0.06), ...(level >= 2 ? [shield(level >= 3 ? "shieldRect" : "shieldRound", gold)] : [])],
        attack: "attack-melee-right",
        combo: ["attack-melee-right", "attack-melee-right", "attack-kick-right"],
        // Sword held up in front, not hanging at the hip.
        run: "ready-run",
        mix: readyMix(),
        clips: readyClips(),
      };
    case "archer":
      return {
        m: "archer",
        height: 0.7 * grow,
        gear: [{ m: "bow", bone: "arm-left", x: 0.07, y: -0.13, z: 0.05, s: 0.9 + level * 0.05, look: level >= 4 ? (gold ?? "dark") : undefined }],
        attack: "holding-right-shoot",
        run: "sprint",
        hold: "holding-right",
      };
    case "thief":
      return {
        m: "thief",
        height: 0.66 * grow,
        gear: [{ m: "key", bone: "arm-right", x: -0.06, y: -0.15, z: 0.05, rz: R90, s: 0.45 + level * 0.04, look: gold }],
        attack: "attack-melee-right",
        combo: ["attack-melee-right", "attack-kick-left"],
        run: "sprint",
      };
    case "giant":
      return {
        m: "giant",
        height: 1.25 * grow,
        gear: level >= 3 ? [{ m: "shieldRound", bone: "arm-left", x: 0.08, y: -0.08, z: 0.02, ry: -R90, s: 0.8, look: gold }] : [],
        attack: "attack-melee-right",
        // Fists: left, right, then a stomp-kick.
        combo: ["attack-melee-left", "attack-melee-right", "attack-melee-left", "attack-kick-right"],
        run: "walk",
      };
    case "valkyrie":
      return {
        m: "valkyrie",
        height: 0.72 * grow,
        // The Weapons page's two-handed battle axe.
        gear: [{ m: "battleAxe", bone: "arm-right", x: -0.05, y: -0.13, z: 0.07, rx: R90, s: 0.36 + level * 0.012, look: gold }],
        attack: "attack-melee-right",
        combo: ["attack-melee-right", "attack-melee-left", "attack-melee-right", "attack-kick-right"],
        run: "ready-run",
        mix: readyMix(),
        clips: readyClips(),
      };
    case "breaker":
      // A skeleton sapper running with a lit bomb in both hands in front of its chest (black, red at 4, gold at 5).
      return {
        m: "skeleton",
        height: 0.62 * grow,
        gear: [{ m: "bombBall", bone: "torso", x: 0, y: 0.16, z: 0.2, s: 0.6 + level * 0.04, look: gold ?? (level >= 4 ? "red" : "dark") }],
        attack: "carry",
        run: "carry-run",
        hold: "carry",
        mix: readyMix(CHEST, CHEST_AT, "carry"),
        clips: readyClips("carry"),
      };
    case "crossbow":
      return {
        m: "crossbow",
        height: 0.7 * grow,
        // The Weapons page's two-handed crossbow.
        // Aimed forward at chest height (stock up, bolt forward).
        gear: [{ m: "heavyCrossbow", bone: "arm-right", x: -0.05, y: -0.15, z: 0.06, rx: R90, ry: -R90, s: 0.3 + level * 0.01, look: level >= 4 ? (gold ?? "dark") : undefined }],
        attack: "aim",
        run: "aim-run",
        hold: "aim",
        mix: readyMix(CHEST, CHEST_AT, "aim"),
        clips: readyClips("aim"),
      };
    case "knight":
      return {
        m: "knight",
        height: 1.0 + (level - 1) * 0.03,
        // The Weapons page's two-handed greatsword in the knight's hand; his cape from level 3.
        gear: [{ m: "greatsword", bone: "handslot.r", like: "2H_Sword", s: 1 + (level - 1) * 0.03, look: gold }],
        hide: ["1H_Sword", "1H_Sword_Offhand", "2H_Sword", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", ...(level >= 3 ? [] : ["Knight_Cape"])],
        attack: "2H_Melee_Attack_Chop",
        combo: ["2H_Melee_Attack_Chop", "2H_Melee_Attack_Slice"],
        run: "Running_A",
        hold: "2H_Melee_Idle",
        // Standing with the greatsword up in both hands, not hanging.
        clips: { ...KAYKIT_CLIPS, idle: "2H_Melee_Idle" },
      };
    case "mage":
      return { m: "mage", height: 0.7 * grow, gear: [{ m: "crystal", bone: "arm-right", x: -0.05, y: -0.17, z: 0.06, s: 0.45 + level * 0.06, look: gold ?? "glow" }], attack: "holding-right-shoot", run: "walk", hold: "holding-right" };
    case "healer":
      return { m: "healer", height: 0.74 * grow, gear: [{ m: "lanternGlass", bone: "arm-right", x: -0.05, y: -0.2, z: 0.06, s: 0.5 + level * 0.05, look: gold }], attack: "holding-right-shoot", run: "walk", hold: "holding-right" };
    case "king":
      return {
        m: "king",
        height: 1.15 + (level - 1) * 0.04,
        gear: [{ m: "frostAxe", bone: "handslot.r", like: "1H_Axe", s: 0.92 + level * 0.04, look: gold }],
        hide: ["1H_Axe", "1H_Axe_Offhand", "2H_Axe", "Mug", ...(level >= 3 ? [] : ["Barbarian_Round_Shield"])],
        attack: "1H_Melee_Attack_Chop",
        run: "Running_A",
        clips: KAYKIT_CLIPS,
      };
    case "queen":
      return { m: "queen", height: 1.02 + (level - 1) * 0.03, gear: [], attack: "atk01", run: "mv_tar21", clips: BIPED_CLIPS, clipSource: "bones" };
    case "bones":
      return { m: "bones", height: 0.62 + (level - 1) * 0.02, gear: [], attack: "atk01", run: "mv_tar21", clips: BIPED_CLIPS };
    case "builder":
      return { m: "builder", height: 0.58, gear: [{ m: "hammer", bone: "arm-right", x: -0.05, y: -0.14, z: 0.07, rx: R90, s: 1.3 }], attack: "attack-melee-right", run: "walk" };
    case "skeleton":
      return { m: "skeleton", height: 0.6 * grow, gear: [sword("dark", 0.9)], attack: "attack-melee-right", combo: ["attack-melee-right", "attack-kick-right"], run: "ready-run", mix: readyMix(), clips: readyClips() };
    case "zombie":
      return { m: "zombie", height: 0.95 * grow, gear: [], attack: "attack-melee-right", combo: ["attack-melee-left", "attack-melee-right"], run: "walk" };
    case "vampire":
      return { m: "vampire", height: 0.62 * grow, gear: [], attack: "attack-melee-right", combo: ["attack-melee-right", "attack-melee-left", "attack-kick-right"], run: "sprint" };
    case "keeper":
      return { m: "keeper", height: 0.62 * grow, gear: [{ m: "lanternGlass", bone: "arm-right", x: -0.05, y: -0.2, z: 0.06, s: 0.5 }], attack: "holding-right-shoot", run: "walk", hold: "holding-right" };
  }
}
