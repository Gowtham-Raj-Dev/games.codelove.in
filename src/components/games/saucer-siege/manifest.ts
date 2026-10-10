import type { GameEntry } from "@/lib/games";

/** Saucer Siege — every model it uses, from the site's own library (public/library). No three.js here. */

const kit = (name: string) => `tower-defense-kit/${name}`;

/** Ground tiles per theme; the snow set mirrors the grass set (no river in the snow). */
const tileSet = (p: "" | "snow-") => ({
  tile: kit(`${p}tile`),
  straight: kit(`${p}tile-straight`),
  corner: kit(`${p}tile-corner-round`),
  split: kit(`${p}tile-split`),
  end: kit(`${p}tile-end-round`),
  spawn: kit(`${p}tile-spawn-end-round`),
  tree: kit(`${p}tile-tree`),
  tree2: kit(`${p}tile-tree-double`),
  tree4: kit(`${p}tile-tree-quad`),
  rock: kit(`${p}tile-rock`),
  crystal: kit(`${p}tile-crystal`),
  hill: kit(`${p}tile-hill`),
  detailTree: kit(`${p}detail-tree-large`),
  detailRocks: kit(`${p}detail-rocks`),
  detailCrystal: kit(`${p}detail-crystal-large`),
});

export const TILES = { grass: tileSet(""), snow: tileSet("snow-") };

export const RIVER = { straight: kit("tile-river-straight"), bridge: kit("tile-river-bridge") };

export const KEEP = { base: kit("tower-round-bottom-b"), middle: kit("tower-round-middle-c"), crystals: kit("tower-round-crystals") };

export const SAUCER_MODELS = {
  scout: kit("enemy-ufo-b"),
  standard: kit("enemy-ufo-a"),
  armored: kit("enemy-ufo-d-weapon"),
  beam: kit("enemy-ufo-c"),
  boss: kit("enemy-ufo-a-weapon"),
} as const;

export const FX = { beam: kit("enemy-ufo-beam"), burst: kit("enemy-ufo-beam-burst"), hover: kit("selection-a"), select: kit("selection-b") };

/** Tower bodies: the floors stacked for level 1, 2 and 3 (bottom → top), then the weapon on top. */
export const TOWER_MODELS = {
  ballista: {
    floors: [kit("tower-round-bottom-a"), kit("tower-round-middle-a"), kit("tower-round-middle-b")],
    top: kit("tower-round-top-a"),
    weapon: kit("weapon-ballista"),
    ammo: kit("weapon-ammo-arrow"),
  },
  cannon: {
    floors: [kit("tower-square-bottom-b"), kit("tower-square-middle-a"), kit("tower-square-middle-a")],
    top: kit("tower-square-top-b"),
    weapon: kit("weapon-cannon"),
    ammo: kit("weapon-ammo-cannonball"),
  },
  catapult: {
    floors: [kit("tower-square-bottom-a"), kit("tower-square-middle-a"), kit("tower-square-middle-a")],
    top: kit("tower-square-top-a"),
    weapon: kit("weapon-catapult"),
    ammo: kit("weapon-ammo-boulder"),
  },
  turret: {
    floors: [kit("tower-round-bottom-c"), kit("tower-round-middle-c"), kit("tower-round-middle-a")],
    top: kit("tower-round-top-c"),
    weapon: kit("weapon-turret"),
    ammo: kit("weapon-ammo-bullet"),
  },
} as const;

/** Load order matters: the menu shows the first (grass) map with saucers flying over it. */
export const MODELS: string[] = [
  ...new Set([
    ...Object.values(TILES.grass),
    ...Object.values(KEEP),
    SAUCER_MODELS.standard,
    SAUCER_MODELS.scout,
    ...Object.values(FX),
    ...Object.values(TOWER_MODELS).flatMap((t) => [...t.floors, t.top, t.weapon, t.ammo]),
    SAUCER_MODELS.armored,
    SAUCER_MODELS.beam,
    SAUCER_MODELS.boss,
    ...Object.values(RIVER),
    ...Object.values(TILES.snow),
  ]),
];

export const GAME: GameEntry = {
  slug: "saucer-siege",
  title: "Saucer Siege",
  tagline: "Medieval towers versus flying saucers. Hold the valley!",
  description:
    "A 3D tower defense where ballistas, cannons, catapults and turrets defend a medieval valley from waves of UFOs. Plan your build along the winding road, upgrade towers into tall keeps, and shoot down beam saucers before they freeze your defences. Three maps, mothership bosses every five waves.",
  genre: "Tower defense",
  accent: "#a78bfa",
  cover: "/games/saucer-siege/cover.webp",
  models: MODELS,
  collections: ["Tower Defense Kit"],
  controls: [
    { action: "Build on a tile / select tower", keys: ["Click"], touch: "Tap a tile" },
    { action: "Focus fire on a saucer", keys: ["Click saucer"], touch: "Tap a saucer" },
    { action: "Pick tower type", keys: ["1", "2", "3", "4"], touch: "Tap the build bar" },
    { action: "Upgrade / sell selected tower", keys: ["U", "X"], touch: "Tap Upgrade / Sell" },
    { action: "Cancel / deselect", keys: ["Right-click", "Q"], touch: "Tap ✕, or tap the road" },
    { action: "Call next wave early (bonus gold)", keys: ["Space"], touch: "Tap the wave button (Go now)" },
    { action: "Game speed 1× / 2× / 3×", keys: ["T"], touch: "Tap the 1× / 2× / 3× button" },
    { action: "Move camera", keys: ["W A S D", "Arrows", "Drag"], touch: "Drag" },
    { action: "Zoom", keys: ["Wheel", "+", "−"], touch: "Pinch" },
  ],
  howTo: [
    "Flying saucers follow the road to your crystal keep. Each one that reaches it costs lives — lose them all and the valley falls.",
    "Tap an empty tile beside the road, then pick a tower. Or press 1–4 first and click tiles to build quickly.",
    "Ballista: fast bolts. Cannon: splash. Catapult: huge range and splash, slow. Turret: rapid fire — great on scouts, weak against armour.",
    "Select a tower to upgrade it (each level adds a floor) or sell it for 70% back. Tap a saucer to make every tower in range focus on it.",
    "Purple beam saucers freeze the nearest tower with a tractor beam — shoot them down first to free it.",
    "A mothership arrives every fifth wave. Call waves early with Space for bonus gold.",
  ],
  touchHowTo: [
    "Flying saucers follow the road to your crystal keep. Each one that reaches it costs lives — lose them all and the valley falls.",
    "Tap an empty tile beside the road, then tap a tower in the build bar. To build several, tap the tower first, then tap tiles — tap it again to stop.",
    "Ballista: fast bolts. Cannon: splash. Catapult: huge range and splash, slow. Turret: rapid fire — great on scouts, weak against armour.",
    "Tap a tower to upgrade it (each level adds a floor) or sell it for 70% back. Tap a saucer to make every tower in range focus on it.",
    "Purple beam saucers freeze the nearest tower with a tractor beam — shoot them down first to free it.",
    "A mothership arrives every fifth wave. Tap Go now on the wave button to call a wave early for bonus gold. Drag to move the camera, pinch to zoom.",
  ],
  features: ["3 maps: meadow, river and frozen pass", "4 towers with 3 upgrade levels", "4 saucer types + mothership bosses", "Tractor beams, focus fire, 1×–3× speed"],
  music: "Saucer March",
};
