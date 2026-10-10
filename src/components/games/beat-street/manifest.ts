import type { GameEntry } from "@/lib/games";

/** Beat Street — every model it uses, from the site's own library (public/library). No three.js here. */

/** The lead dancers (rigged Rocketbox humans) and their clip set ("f" / "m" animations). */
export const DANCERS = [
  { key: "/models/female-party-01", name: "Roxy", set: "f" },
  { key: "/models/male-adult-18", name: "Dex", set: "m" },
] as const;

/** Extra crowd members (the lead you didn't pick joins them). */
export const CROWD = [
  { key: "/models/female-party-02", set: "f" },
  { key: "/models/male-adult-16", set: "m" },
] as const;

export const CLIPS = ["dance", "cheer", "clap", "idle"] as const;
export type ClipName = (typeof CLIPS)[number];

const CLIP_FILES: Record<ClipName, string> = {
  dance: "dancing_neutral",
  cheer: "cheer_01",
  clap: "claphands_01",
  idle: "idle_neutral_01",
};

export const clipKey = (set: "f" | "m", clip: ClipName) => `/animations/${set}_${CLIP_FILES[clip]}`;

export const M = {
  // Club and stage.
  floor: "mini-arcade/floor",
  podium: "retro-booth/floor-ring",
  screen: "trash-polka/screen",
  wall: "mini-arcade/wall",
  wallWindow: "mini-arcade/wall-window",
  wallCorner: "mini-arcade/wall-corner",
  column: "mini-arcade/column",
  speaker: "furniture-kit/speaker",
  ring: "chromatic-chaos/frame-neon-vapor-02",
  triangle: "chromatic-chaos/frame-neon-vapor-03",
  cube: "chromatic-chaos/frame-neon-vapor-01",
  truss: "avatar-show/studio-light-armature",
  lamp: "avatar-show/studio-lamp",
  // Note highway.
  receptor: "prototype-kit/button-floor-round",
  note: "prototype-kit/shape-cylinder-detailed",
  gem: "platformer-kit/jewel",
  // Arcade along the walls.
  prizeWheel: "mini-arcade/prize-wheel",
} as const;

export const ARCADE = [
  "mini-arcade/dance-machine",
  "mini-arcade/arcade-machine",
  "mini-arcade/pinball",
  "mini-arcade/claw-machine",
  "mini-arcade/basketball-game",
  "mini-arcade/gambling-machine",
  "mini-arcade/vending-machine",
  "mini-arcade/ticket-machine",
  "mini-arcade/air-hockey",
  "mini-arcade/prizes",
];

/** Load order matters: the stage and the default dancer first, the crowd last. */
export const MODELS: string[] = [
  M.floor,
  M.receptor,
  M.note,
  M.gem,
  M.podium,
  M.screen,
  DANCERS[0].key,
  ...(["dance", "clap", "cheer", "idle"] as const).map((c) => clipKey("f", c)),
  M.ring,
  M.triangle,
  M.cube,
  M.speaker,
  M.truss,
  M.lamp,
  M.wall,
  M.wallWindow,
  M.wallCorner,
  M.column,
  M.prizeWheel,
  ...ARCADE,
  DANCERS[1].key,
  ...(["dance", "clap", "cheer", "idle"] as const).map((c) => clipKey("m", c)),
  ...CROWD.map((c) => c.key),
];

export const GAME: GameEntry = {
  slug: "beat-street",
  title: "Beat Street",
  tagline: "Hit the notes on the beat and make the crowd dance.",
  description:
    "A 3D rhythm game in a neon arcade club. Notes slide down four glowing lanes in time with the music — hit them on the beat to keep your dancer moving and the crowd cheering. Nail the long holds, build your multiplier, trigger fever for double points and climb from Easy to Expert on four tracks, from disco to drum & bass.",
  genre: "Rhythm",
  accent: "#e879f9",
  cover: "/games/beat-street/cover.webp",
  models: MODELS,
  collections: ["Mini Arcade", "Rigged Adults", "Chromatic Chaos", "Retro Booth", "Avatar Show", "Trash Polka", "Prototype Kit", "Platformer Kit", "Furniture Kit"],
  controls: [
    { action: "Hit lanes 1–4", keys: ["D", "F", "J", "K"], touch: "Tap the lane" },
    { action: "Hit lanes (arrows)", keys: ["←", "↓", "↑", "→"] },
    { action: "Hold notes", keys: ["Hold the key"], touch: "Keep your finger down" },
    { action: "Pick track / difficulty", keys: ["↑", "↓", "←", "→"], touch: "Tap a track, then a difficulty" },
    { action: "Start / retry", keys: ["Enter"], touch: "Tap Play / Play again" },
  ],
  howTo: [
    "Press a lane's key just as its note crosses the glowing line. Perfect timing scores the most.",
    "Notes with a tail are holds: keep the key down until the tail has passed.",
    "Every 10 notes in a row raise your multiplier, up to ×4. A miss resets it.",
    "Perfect hits fill the fever bar. When it's full, fever doubles every point for 16 beats.",
    "Score 70% accuracy (grade C) to clear a track: that unlocks the next track and the next difficulty.",
    "Hits feel early or late (Bluetooth headphones)? Use Calibrate on the menu and tap along to the clicks.",
    "While a song plays, F is a lane key — fullscreen (F) works on the menus.",
  ],
  touchHowTo: [
    "Tap a lane just as its note crosses the glowing line — anywhere in that lane works, and you can use several fingers. Perfect timing scores the most.",
    "Notes with a tail are holds: keep your finger down until the tail has passed.",
    "Every 10 notes in a row raise your multiplier, up to ×4. A miss resets it.",
    "Perfect hits fill the fever bar. When it's full, fever doubles every point for 16 beats.",
    "Score 70% accuracy (grade C) to clear a track: that unlocks the next track and the next difficulty.",
    "Hits feel early or late (Bluetooth headphones)? Use Calibrate on the menu and tap the screen along to the clicks.",
  ],
  features: ["Notes generated from the music itself", "4 tracks × 4 difficulties", "Holds, combos, ×4 multiplier & fever", "A dancer and crowd that react to you"],
  music: "Disco Fever · Neon Nights · Pixel Heart · Bass Rocket",
};
