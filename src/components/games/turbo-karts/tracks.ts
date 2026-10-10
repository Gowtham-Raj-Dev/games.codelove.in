import { CORNER_DECOR, PROPS, ROAD, WALLS } from "./manifest";

/**
 * Turbo Karts circuits. A circuit is a turtle program over Racing Kit road tiles (1×1 grid tiles,
 * scaled to TILE metres): straights, corners of three sizes, ramps and a bridge. From it we get the
 * placed road pieces and a dense centre line (one sample per metre) that the race runs on: lap
 * progress, walls, ground height, the AI racing line and the minimap. No three.js in here.
 */

export const TILE = 12;
/** Asphalt half width. */
export const ROAD_HALF = 0.345 * TILE;
/** Outer edge of the white kerb: beyond it is grass. */
export const CURB_HALF = 0.418 * TILE;
/** Barrier line on the ground. */
export const WALL_HALF = 0.5 * TILE + 1.7;
/** Rails along ramps and the bridge deck. */
export const DECK_HALF = 0.47 * TILE;
const STEP = 1;

export type CornerStyle = keyof typeof CORNER_DECOR;
export type WallStyle = "barrier" | "blocks" | "rail";

export interface Theme {
  skyTop: string;
  skyHorizon: string;
  ground: string;
  /** Tint for the grass strips of the road tiles (and kerb sand), to match the ground. */
  grass: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
}

export interface Along {
  keys: string[];
  /** Fractions of the lap (0 = finish line). */
  from: number;
  to: number;
  /** 1 = left of the driving direction, -1 = right. */
  side: 1 | -1;
  /** Metres beyond the wall line. */
  offset: number;
  every: number;
  /** Faces the track (true) or runs along it. */
  face?: boolean;
  height?: number;
}

export interface Scatter {
  keys: string[];
  count: number;
  /** Distance band beyond the wall line. */
  near: number;
  far: number;
  height: [number, number];
}

export interface TrackDef {
  id: string;
  name: string;
  blurb: string;
  layout: string;
  corners: CornerStyle;
  walls: WallStyle;
  roadLong: string;
  theme: Theme;
  /** Item box rows and coin lines, as fractions of the lap. */
  items: number[];
  coins: { at: number; d: number }[];
  /** Overhead arches across the road. */
  arches: { key: string; at: number }[];
  along: Along[];
  scatter: Scatter[];
  seed: number;
}

export const TRACKS: TrackDef[] = [
  {
    id: "podium-park",
    name: "Podium Park",
    blurb: "The classic: a long grandstand straight, sweeping bends and a tricky dip.",
    layout: "G4 F S3 L3 S2 B S3 L2 S2 L2 R2 S2 R2 L3 S6 L2 S3 L2 R2 S2 L2 S1 B S3",
    corners: "border",
    walls: "barrier",
    roadLong: ROAD.long,
    theme: {
      skyTop: "#3d8fe0",
      skyHorizon: "#cfe8f7",
      ground: "#79bf93",
      grass: "#6fb98a",
      sun: "#fff2dc",
      sunIntensity: 2.4,
      hemiSky: "#e3f2ff",
      hemiGround: "#6f8f6a",
      hemiIntensity: 1.25,
      fogNear: 140,
      fogFar: 420,
      exposure: 1.05,
    },
    items: [0.2, 0.47, 0.76],
    coins: [
      { at: 0.1, d: 2.6 },
      { at: 0.33, d: -2.4 },
      { at: 0.58, d: 0 },
      { at: 0.88, d: -2.6 },
    ],
    arches: [
      { key: PROPS.overheadRound, at: 0.4 },
      { key: PROPS.overhead, at: 0.64 },
    ],
    along: [
      { keys: [PROPS.grandStandCovered, PROPS.grandStand, PROPS.grandStandAwning], from: -0.06, to: 0.075, side: -1, offset: 2, every: 12.5, face: true },
      { keys: [PROPS.pitsGarage, PROPS.pitsGarageClosed, PROPS.pitsGarage, PROPS.pitsOffice], from: -0.05, to: 0.06, side: 1, offset: 9, every: 12.2, face: true },
      { keys: [PROPS.bannerRed, PROPS.bannerGreen], from: 0.1, to: 0.95, side: -1, offset: 3, every: 70 },
      { keys: [PROPS.billboard, PROPS.billboardLow, PROPS.billboardDouble], from: 0.15, to: 0.9, side: 1, offset: 4, every: 95, face: true },
      { keys: [PROPS.lightPost], from: 0.12, to: 0.98, side: 1, offset: 1.5, every: 58 },
      { keys: [PROPS.flagRed, PROPS.flagGreen, PROPS.flagTankco], from: 0.08, to: 0.97, side: -1, offset: 1, every: 33 },
      { keys: [PROPS.grandStandRound], from: 0.5, to: 0.53, side: -1, offset: 4, every: 40, face: true },
      { keys: [PROPS.camera], from: 0.25, to: 0.8, side: 1, offset: 1, every: 140, face: true },
      { keys: [PROPS.raceCarRed, PROPS.raceCarWhite, PROPS.raceCarGreen, PROPS.raceCarOrange], from: -0.045, to: 0.05, side: 1, offset: 2.2, every: 15, height: 1.25 },
    ],
    scatter: [
      { keys: [PROPS.treeLarge, PROPS.treeSmall, PROPS.treeLarge], count: 120, near: 6, far: 70, height: [7, 13] },
      { keys: [PROPS.tent, PROPS.tentRoof, PROPS.tentClosed], count: 10, near: 8, far: 30, height: [0, 0] },
    ],
    seed: 11,
  },
  {
    id: "dune-jump",
    name: "Dune Jump",
    blurb: "Desert heat, sand traps, a hairpin pair — and a huge ramp over the back straight.",
    layout: "G4 F S2 B S1 L3 S2 L2 S1 R2 S2 L2 S3 J S3 L3 S2 L2 S1 R2 R2 L2 L1 S3",
    corners: "sand",
    walls: "blocks",
    roadLong: ROAD.long,
    theme: {
      skyTop: "#4f9ad8",
      skyHorizon: "#f6dfb4",
      ground: "#e9c98f",
      grass: "#dcb978",
      sun: "#ffe2b0",
      sunIntensity: 2.7,
      hemiSky: "#ffeccf",
      hemiGround: "#b9895a",
      hemiIntensity: 1.15,
      fogNear: 130,
      fogFar: 400,
      exposure: 1.02,
    },
    items: [0.17, 0.44, 0.8],
    coins: [
      { at: 0.08, d: -2.6 },
      { at: 0.3, d: 2.4 },
      { at: 0.5, d: 0 },
      { at: 0.66, d: 2.5 },
      { at: 0.92, d: 0 },
    ],
    arches: [{ key: PROPS.overheadRound, at: 0.27 }],
    along: [
      { keys: [PROPS.grandStandAwning, PROPS.grandStand], from: -0.05, to: 0.06, side: -1, offset: 2, every: 12.5, face: true },
      { keys: [PROPS.tentLong, PROPS.tent, PROPS.tentClosed], from: -0.04, to: 0.06, side: 1, offset: 8, every: 26, face: true },
      { keys: [PROPS.flagTankco, PROPS.flagRed], from: 0.08, to: 0.97, side: 1, offset: 1, every: 45 },
      { keys: [PROPS.billboardLow, PROPS.billboard], from: 0.12, to: 0.9, side: -1, offset: 4, every: 110, face: true },
      { keys: [PROPS.radar], from: 0.35, to: 0.37, side: 1, offset: 6, every: 30, face: true },
      { keys: [PROPS.camera], from: 0.53, to: 0.6, side: -1, offset: 1, every: 30, face: true },
      { keys: [PROPS.pylon], from: 0.1, to: 0.98, side: -1, offset: -0.6, every: 21 },
    ],
    scatter: [
      { keys: [PROPS.rockTallA, PROPS.rockTallB, PROPS.rockTallE, PROPS.rockLargeC, PROPS.rockLargeF], count: 55, near: 14, far: 110, height: [9, 26] },
      { keys: [PROPS.cactusTall, PROPS.cactusShort], count: 70, near: 4, far: 60, height: [3.5, 7] },
      { keys: [PROPS.bush], count: 30, near: 3, far: 40, height: [1.2, 2.2] },
      { keys: [PROPS.woodRamp], count: 6, near: 6, far: 40, height: [2.4, 3.2] },
    ],
    seed: 23,
  },
  {
    id: "overpass-8",
    name: "Overpass 8",
    blurb: "A figure-eight at dusk: climb the ramp, fly over the bridge, then dive back under it.",
    layout: "G4 F S1 X S4 L3 S2 B S1 L3 S2 L3 S3 U P M Q D R3 S1 B S2 R3 S1 R3",
    corners: "wall",
    walls: "rail",
    roadLong: ROAD.longMid,
    theme: {
      skyTop: "#4b5cb8",
      skyHorizon: "#ffb48c",
      ground: "#5f9f78",
      grass: "#5c9a74",
      sun: "#ffc08a",
      sunIntensity: 2.2,
      hemiSky: "#c7b6ff",
      hemiGround: "#4c5f55",
      hemiIntensity: 1.2,
      fogNear: 120,
      fogFar: 380,
      exposure: 1.08,
    },
    items: [0.15, 0.45, 0.73],
    coins: [
      { at: 0.09, d: 2.4 },
      { at: 0.3, d: -2.4 },
      { at: 0.56, d: 0 },
      { at: 0.86, d: 2.4 },
    ],
    arches: [
      { key: PROPS.overheadLights, at: 0.32 },
      { key: PROPS.overhead, at: 0.82 },
    ],
    along: [
      { keys: [PROPS.grandStandCovered, PROPS.grandStandCovered, PROPS.grandStand], from: -0.06, to: 0.045, side: -1, offset: 2, every: 12.5, face: true },
      { keys: [PROPS.lightPost, PROPS.lightPostModern], from: 0.05, to: 0.99, side: 1, offset: 1.2, every: 34 },
      { keys: [PROPS.lightPost], from: 0.05, to: 0.99, side: -1, offset: 1.2, every: 47 },
      { keys: [PROPS.billboardDouble, PROPS.billboard], from: 0.1, to: 0.95, side: 1, offset: 5, every: 80, face: true },
      { keys: [PROPS.bannerGreen, PROPS.bannerRed], from: 0.1, to: 0.95, side: -1, offset: 4, every: 75 },
      { keys: [PROPS.pitsOffice, PROPS.pitsGarage, PROPS.pitsGarageClosed], from: -0.03, to: 0.05, side: 1, offset: 9, every: 12.2, face: true },
      { keys: [PROPS.raceCarOrange, PROPS.raceCarWhite, PROPS.raceCarRed], from: -0.025, to: 0.045, side: 1, offset: 2.2, every: 16, height: 1.25 },
    ],
    scatter: [
      { keys: [PROPS.treeLarge, PROPS.treeSmall], count: 110, near: 5, far: 70, height: [7, 13] },
      { keys: [PROPS.tentRoof, PROPS.tent], count: 6, near: 10, far: 30, height: [0, 0] },
    ],
    seed: 37,
  },
];

export const LAPS = 3;

// --- Pieces -----------------------------------------------------------------------------------------

type Vec2 = [number, number];

interface Frame {
  /** Endpoints in model units, with their outward headings (θ: direction (sin θ, cos θ)). */
  a: Vec2;
  aOut: number;
  b: Vec2;
  bOut: number;
  corner?: { c: Vec2; r: number };
  /** Road height (model units) along a→b. */
  height?: (t: number) => number;
}

const straightFrame = (tiles: number, height?: (t: number) => number): Frame => ({
  a: [0.15, -0.65],
  aOut: 0,
  b: [0.15, -0.65 - tiles],
  bOut: Math.PI,
  height,
});

const cornerFrame = (n: number): Frame => ({
  a: [0.15, -0.65],
  aOut: 0,
  b: [n - 0.35, -n - 0.15],
  bOut: Math.PI / 2,
  corner: { c: [n - 0.35, -0.65], r: n - 0.5 },
});

export type PieceKind = "straight" | "grid" | "finish" | "boost" | "under" | "jump" | "jumpDown" | "rampUp" | "rampDown" | "deckIn" | "deck" | "deckOut" | "corner";

export interface RoadPiece {
  kind: PieceKind;
  /** Model keys sharing this transform (road tile + corner kerbs). */
  keys: string[];
  /** World transform of the model's own origin (models are scaled by TILE). */
  x: number;
  z: number;
  rot: number;
  /** Corner size (1..3) and direction (+1 left, -1 right). */
  size?: number;
  turn?: number;
}

export interface Sample {
  x: number;
  z: number;
  /** Road surface height. */
  y: number;
  /** Unit tangent. */
  tx: number;
  tz: number;
  /** Distance from the finish line. */
  s: number;
  /** Signed curvature (1/m, + = turning left). */
  curv: number;
  /** Wall lines to the left and right (metres from the centre line). */
  wallL: number;
  wallR: number;
  kind: PieceKind;
  elevated: boolean;
  /** Last sample of a jump ramp: the road drops away after it. */
  lip: boolean;
}

export interface Track {
  def: TrackDef;
  pieces: RoadPiece[];
  samples: Sample[];
  length: number;
  /** Racing line: lateral offset per sample (+ = left), and its curvature. */
  line: Float32Array;
  lineCurv: Float32Array;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Spatial hash of sample indices (cell = HASH metres). */
  hash: Map<string, number[]>;
}

const HASH = 16;
const hashKey = (x: number, z: number) => `${Math.floor(x / HASH)},${Math.floor(z / HASH)}`;

const rotate = (x: number, z: number, a: number): Vec2 => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];

interface RawSample {
  x: number;
  z: number;
  y: number;
  kind: PieceKind;
  elevated: boolean;
  lip: boolean;
}

/** Lays out a circuit's pieces and samples its centre line. */
export function buildTrack(def: TrackDef): Track {
  const pieces: RoadPiece[] = [];
  const raw: RawSample[] = [];
  let px = 0;
  let pz = 0;
  let heading = Math.PI / 2; // start driving towards +x
  let finishIndex = 0;

  const place = (kind: PieceKind, keys: string[], frame: Frame, reverse: boolean, extra: Partial<RoadPiece> = {}) => {
    const entry = reverse ? frame.b : frame.a;
    const exit = reverse ? frame.a : frame.b;
    const entryOut = reverse ? frame.bOut : frame.aOut;
    const exitOut = reverse ? frame.aOut : frame.bOut;
    const rot = heading - entryOut - Math.PI;
    const [ex, ez] = rotate(entry[0] * TILE, entry[1] * TILE, rot);
    const ox = px - ex;
    const oz = pz - ez;
    pieces.push({ kind, keys, x: ox, z: oz, rot, ...extra });

    // Centre line in model units, a → b.
    const at = (t: number): Vec2 => {
      if (frame.corner) {
        const { c, r } = frame.corner;
        const ang = (t * Math.PI) / 2;
        return [c[0] - r * Math.cos(ang), c[1] - r * Math.sin(ang)];
      }
      return [frame.a[0] + (frame.b[0] - frame.a[0]) * t, frame.a[1] + (frame.b[1] - frame.a[1]) * t];
    };
    const len = frame.corner ? frame.corner.r * TILE * (Math.PI / 2) : Math.hypot(frame.b[0] - frame.a[0], frame.b[1] - frame.a[1]) * TILE;
    const count = Math.max(2, Math.round(len / STEP));
    const elevated = kind === "rampUp" || kind === "rampDown" || kind === "deckIn" || kind === "deck" || kind === "deckOut";
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const t = reverse ? 1 - u : u;
      const [mx, mz] = at(t);
      const [wx, wz] = rotate(mx * TILE, mz * TILE, rot);
      raw.push({ x: ox + wx, z: oz + wz, y: (frame.height?.(t) ?? 0) * TILE, kind, elevated, lip: kind === "jump" && i === count - 1 });
    }
    const [xx, xz] = rotate(exit[0] * TILE, exit[1] * TILE, rot);
    px = ox + xx;
    pz = oz + xz;
    heading = exitOut + rot;
  };

  for (const tok of def.layout.trim().split(/\s+/)) {
    const m = /^([A-Z])(\d*)$/.exec(tok);
    if (!m) throw new Error(`Bad track token ${tok}`);
    const t = m[1];
    const n = Number(m[2] || 1);
    if (t === "R" || t === "L") {
      const keys = [n === 1 ? ROAD.corner1 : n === 2 ? ROAD.corner2 : ROAD.corner3, ...CORNER_DECOR[def.corners][n as 1 | 2 | 3]];
      // The corner tile turns right when driven a → b.
      place("corner", keys, cornerFrame(n), t === "L", { size: n, turn: t === "L" ? 1 : -1 });
    } else if (t === "S" || t === "G") {
      let left = n;
      while (left > 0) {
        if (left >= 2) {
          place(t === "G" ? "grid" : "straight", [t === "G" ? ROAD.grid : def.roadLong], straightFrame(2), false);
          left -= 2;
        } else {
          place("straight", [ROAD.straight], straightFrame(1), false);
          left -= 1;
        }
      }
    } else if (t === "F") {
      finishIndex = raw.length;
      place("finish", [ROAD.straight], straightFrame(1), false);
    } else if (t === "B") place("boost", [ROAD.arrow], straightFrame(1), false);
    else if (t === "X") place("under", [ROAD.straight], straightFrame(1), false);
    else if (t === "J") {
      // A kicker: up to the lip, then the same tile turned round as the back slope.
      place("jump", [ROAD.ramp], straightFrame(1, (u) => 0.25 * u), false);
      place("jumpDown", [ROAD.ramp], straightFrame(1, (u) => 0.25 * u), true);
    }
    else if (t === "U") place("rampUp", [ROAD.rampLong], straightFrame(2, (u) => 0.5 * u), false);
    else if (t === "D") place("rampDown", [ROAD.rampLong], straightFrame(2, (u) => 0.5 * u), true);
    else if (t === "P") place("deckIn", [ROAD.deckStart], straightFrame(1, () => 0.5), true);
    else if (t === "M") place("deck", [ROAD.deck], straightFrame(1, () => 0.5), false);
    else if (t === "Q") place("deckOut", [ROAD.deckStart], straightFrame(1, () => 0.5), false);
    else throw new Error(`Unknown track token ${tok}`);
  }
  if (Math.hypot(px, pz) > 0.01 || Math.abs(Math.sin((heading - Math.PI / 2) / 2)) > 0.001) {
    throw new Error(`Track ${def.id} does not close (${px.toFixed(2)}, ${pz.toFixed(2)})`);
  }

  // Start the samples at the finish line, and centre the circuit on the origin.
  const ordered = [...raw.slice(finishIndex), ...raw.slice(0, finishIndex)];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of ordered) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (const p of ordered) {
    p.x -= cx;
    p.z -= cz;
  }
  for (const p of pieces) {
    p.x -= cx;
    p.z -= cz;
  }

  const n = ordered.length;
  const samples: Sample[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = ordered[i];
    const prev = ordered[(i - 1 + n) % n];
    const next = ordered[(i + 1) % n];
    if (i > 0) s += Math.hypot(p.x - prev.x, p.z - prev.z);
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const raw = p.elevated ? DECK_HALF : p.kind === "jump" || p.kind === "jumpDown" ? 0.5 * TILE : WALL_HALF;
    samples.push({ x: p.x, z: p.z, y: p.y, tx, tz, s, curv: 0, wallL: raw, wallR: raw, kind: p.kind, elevated: p.elevated, lip: p.lip });
  }
  const last = ordered[n - 1];
  const length = s + Math.hypot(ordered[0].x - last.x, ordered[0].z - last.z);

  // Curvature from the heading change over a few metres.
  const heading0 = samples.map((p) => Math.atan2(p.tx, p.tz));
  for (let i = 0; i < n; i++) {
    let dh = heading0[(i + 2) % n] - heading0[(i - 2 + n) % n];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    samples[i].curv = dh / (4 * STEP);
  }

  // Walls: under the bridge the deck pillars close in; on the inside of tight corners the wall
  // can't be further than the corner's radius. Then taper every change so walls never step.
  const wallL = samples.map((p) => (p.kind === "under" ? 0.5 * TILE - 0.3 : p.wallL));
  const wallR = wallL.slice();
  for (let i = 0; i < n; i++) {
    const c = samples[i].curv;
    if (Math.abs(c) > 1e-3) {
      const r = 1 / Math.abs(c) - 0.4;
      if (c > 0) wallL[i] = Math.min(wallL[i], r);
      else wallR[i] = Math.min(wallR[i], r);
    }
  }
  const taper = (w: number[]) => {
    const out = w.slice();
    for (let i = 0; i < n; i++) {
      for (let k = -14; k <= 14; k++) {
        const j = (i + k + n) % n;
        out[i] = Math.min(out[i], w[j] + Math.abs(k) * STEP * 0.4);
      }
    }
    return out;
  };
  const tl = taper(wallL);
  const tr = taper(wallR);
  for (let i = 0; i < n; i++) {
    samples[i].wallL = tl[i];
    samples[i].wallR = tr[i];
  }

  const hash = new Map<string, number[]>();
  samples.forEach((p, i) => {
    const k = hashKey(p.x, p.z);
    let list = hash.get(k);
    if (!list) hash.set(k, (list = []));
    list.push(i);
  });

  const { line, lineCurv } = racingLine(samples);
  return {
    def,
    pieces,
    samples,
    length,
    line,
    lineCurv,
    bounds: { minX: minX - cx, maxX: maxX - cx, minZ: minZ - cz, maxZ: maxZ - cz },
    hash,
  };
}

/** A smooth line that cuts the corners: relax the centre line, keeping it on the asphalt. */
function racingLine(samples: Sample[]) {
  const n = samples.length;
  const d = new Float32Array(n);
  const limit = (i: number) => {
    const p = samples[i];
    return p.elevated || p.kind === "jump" || p.kind === "jumpDown" || p.kind === "under" ? 1.2 : ROAD_HALF - 1.5;
  };
  const px = (i: number) => samples[i].x + samples[i].tz * d[i];
  const pz = (i: number) => samples[i].z - samples[i].tx * d[i];
  for (const [span, iters] of [
    [10, 220],
    [4, 160],
    [2, 80],
  ] as const) {
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const a = (i - span + n) % n;
        const b = (i + span) % n;
        const mx = (px(a) + px(b)) / 2;
        const mz = (pz(a) + pz(b)) / 2;
        const p = samples[i];
        const target = (mx - p.x) * p.tz - (mz - p.z) * p.tx;
        const lim = limit(i);
        d[i] = Math.max(-lim, Math.min(lim, d[i] + (target - d[i]) * 0.5));
      }
    }
  }
  const lineCurv = new Float32Array(n);
  const hd = (i: number) => {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    return Math.atan2(px(b) - px(a), pz(b) - pz(a));
  };
  for (let i = 0; i < n; i++) {
    let dh = hd((i + 3) % n) - hd((i - 3 + n) % n);
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const dist = Math.hypot(px((i + 3) % n) - px((i - 3 + n) % n), pz((i + 3) % n) - pz((i - 3 + n) % n)) || 1;
    lineCurv[i] = dh / dist;
  }
  return { line: d, lineCurv };
}

// --- Queries ----------------------------------------------------------------------------------------

export interface TrackPos {
  /** Index of the sample at or just before the point. */
  i: number;
  /** Distance from the finish line. */
  s: number;
  /** Lateral offset, + = left of the driving direction. */
  d: number;
  /** Road surface height at this point. */
  y: number;
}

/** Projects a point onto the centre line, searching near a previous sample index. */
export function locate(track: Track, x: number, z: number, hint: number, out: TrackPos, window = 24): TrackPos {
  const { samples } = track;
  const n = samples.length;
  let best = hint;
  let bestD = Infinity;
  for (let k = -window; k <= window; k++) {
    const i = (hint + k + n) % n;
    const p = samples[i];
    const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  }
  // Use the segment before or after the nearest sample, whichever the point projects onto.
  let i = best;
  const p = samples[i];
  const along = (x - p.x) * p.tx + (z - p.z) * p.tz;
  if (along < 0) i = (i - 1 + n) % n;
  const a = samples[i];
  const b = samples[(i + 1) % n];
  const segLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ux = (b.x - a.x) / segLen;
  const uz = (b.z - a.z) / segLen;
  const t = Math.max(0, Math.min(1, ((x - a.x) * ux + (z - a.z) * uz) / segLen));
  const cx = a.x + (b.x - a.x) * t;
  const cz = a.z + (b.z - a.z) * t;
  out.i = i;
  out.s = a.s + t * segLen;
  out.d = (x - cx) * uz - (z - cz) * ux;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}

/** Global nearest sample (for respawns and the menu) using the spatial hash. */
export function nearestSample(track: Track, x: number, z: number) {
  let best = 0;
  let bestD = Infinity;
  const cx = Math.floor(x / HASH);
  const cz = Math.floor(z / HASH);
  for (let r = 1; r < 40 && best === 0 && bestD === Infinity; r += 3) {
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        for (const idx of track.hash.get(`${cx + i},${cz + j}`) ?? []) {
          const p = track.samples[idx];
          const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = idx;
          }
        }
      }
    }
  }
  return best;
}

/** Distance from (x, z) to the closest centre-line sample whose lap distance is far from `s`. */
export function clearance(track: Track, x: number, z: number, s = -1, skip = 30) {
  let best = Infinity;
  const cx = Math.floor(x / HASH);
  const cz = Math.floor(z / HASH);
  const L = track.length;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      for (const idx of track.hash.get(`${cx + i},${cz + j}`) ?? []) {
        const p = track.samples[idx];
        if (s >= 0) {
          const ds = Math.abs(p.s - s);
          if (Math.min(ds, L - ds) < skip) continue;
        }
        best = Math.min(best, Math.hypot(p.x - x, p.z - z));
      }
    }
  }
  return best;
}

/** Sample index at a lap distance. */
export function indexAt(track: Track, s: number) {
  const L = track.length;
  const w = ((s % L) + L) % L;
  const n = track.samples.length;
  let i = Math.min(n - 1, Math.floor((w / L) * n));
  while (i > 0 && track.samples[i].s > w) i--;
  while (i < n - 1 && track.samples[i + 1].s <= w) i++;
  return i;
}

/** World point at lap distance s and lateral offset d. */
export function pointAt(track: Track, s: number, d: number) {
  const i = indexAt(track, s);
  const n = track.samples.length;
  const a = track.samples[i];
  const b = track.samples[(i + 1) % n];
  const L = track.length;
  const span = (b.s - a.s + L) % L || 1;
  const t = Math.max(0, Math.min(1, ((((s % L) + L) % L) - a.s) / span));
  const tx = a.tx + (b.tx - a.tx) * t;
  const tz = a.tz + (b.tz - a.tz) * t;
  const tl = Math.hypot(tx, tz) || 1;
  return {
    x: a.x + (b.x - a.x) * t + (tz / tl) * d,
    z: a.z + (b.z - a.z) * t - (tx / tl) * d,
    y: a.y + (b.y - a.y) * t,
    heading: Math.atan2(tx, tz),
    i,
  };
}

export const WALL_KEYS = WALLS;
