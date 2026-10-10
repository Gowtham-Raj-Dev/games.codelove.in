import type { GameEntry } from "@/lib/games";

/** Night Heist — every model it uses, from the site's own library (public/library). No three.js here. */

/** Characters: the thief (a gentleman burglar in a dark suit) and the two kinds of night guard. */
export const CH = {
  thief: "mini-characters/character-male-d",
  guard: "mini-characters/character-male-c",
  warden: "mini-characters/character-female-d",
} as const;

/** Architecture and props, by role. */
export const M = {
  wall: "retro-fantasy-kit/wall",
  exit: "retro-fantasy-kit/wall-door",
  floor: "holiday-kit/floor-stone",
  officeFloor: "furniture-kit/floor-full",
  rug: "furniture-bits/rug-rectangle-stripes-a",
  mural: "tomb-chaser-1/wall01-art",
  column: "tomb-chaser-1/column-art",
  door: "tomb-chaser-1/door-art",
  sconce: "tomb-chaser-1/torch-art",
  flame: "tomb-chaser-1/fire-torch01-art",
  anubis: "tomb-chaser-1/god-anubis-art",
  bastet: "tomb-chaser-1/god-bastet-art",
  ra: "tomb-chaser-1/god-ra-art",
  obelisk: "tomb-chaser-1/obelisk-art",
  jar: "tomb-chaser-1/jar01-art",
  jarSmall: "tomb-chaser-1/jar02-art",
  gemRed: "tomb-chaser-1/gem01-art",
  gemGreen: "tomb-chaser-1/gem02-art",
  gemBlue: "tomb-chaser-1/gem03-art",
  coins: "tomb-chaser-1/coins-art",
  plate: "tomb-chaser-1/platform-art",
  web: "tomb-chaser-1/spiderweb-art",
  lance: "tomb-chaser-1/lance-art",
  sarcophagus: "tomb-chaser-1/trap-art",
  pedestal: "avatar-garden/avatar-pedestal01",
  rope: "platformer-kit/fence-rope",
  laser: "modular-space-kit/gate-lasers",
  camera: "racing-kit/camera-exclusive",
  desk: "furniture-kit/desk",
  screen: "furniture-kit/computer-screen",
  chair: "furniture-kit/chair-desk",
  bookcase: "furniture-kit/bookcase-closed-doors",
  console: "space-station-kit/computer-system",
  crate: "retro-fantasy-kit/detail-crate",
  key: "mini-dungeon/key",
  coin: "mini-dungeon/coin",
} as const;

/** Load order matters: what the first screen needs goes first. */
export const MODELS: string[] = [CH.thief, CH.guard, CH.warden, ...Object.values(M)];

export const GAME: GameEntry = {
  slug: "night-heist",
  title: "Night Heist",
  tagline: "Slip past the guards. Lift the pharaoh's gems. Vanish.",
  description:
    "A 3D stealth heist in eight cases. Sneak through a museum's Egyptian wing after closing time: stay out of the guards' torch beams, keep to the shadows, time the sweeping cameras and laser gates, step around pressure plates, toss coins to lure guards away, find key cards for locked vaults and slip out with the gems before the alarm rings.",
  genre: "Stealth",
  accent: "#f87171",
  cover: "/games/night-heist/cover.webp",
  models: MODELS,
  collections: [
    "Tomb Chaser 1",
    "Mini Characters",
    "Retro Fantasy Kit",
    "Holiday Kit",
    "Furniture Kit",
    "Furniture Bits",
    "Avatar Garden",
    "Platformer Kit",
    "Modular Space Kit",
    "Racing Kit",
    "Space Station Kit",
    "Mini Dungeon",
  ],
  controls: [
    { action: "Move", keys: ["W", "A", "S", "D"], touch: "Left stick" },
    { action: "Sneak — slow and silent", keys: ["Shift (hold)", "C (toggle)"], touch: "Sneak toggle" },
    { action: "Run — fast but loud", keys: ["Space (hold)"], touch: "Run (hold)" },
    { action: "Grab / open / knock out", keys: ["E"], touch: "Use button" },
    { action: "Throw a coin", keys: ["Click"], touch: "Tap a spot on the floor" },
    { action: "Overview map", keys: ["Q"], touch: "Map button" },
    { action: "Restart the heist", keys: ["R"], touch: "Pause → Restart" },
  ],
  howTo: [
    "Guards see along their torch beams. Stay out of the cones, or put a statue, column or crate between you.",
    "Shadows hide you: in the dark a guard only spots you up close. Torchlight and moonlight give you away from afar.",
    "Walking makes a little noise and running makes a lot. Sneak when a guard is near.",
    "Click a spot to throw a coin — guards walk over to check the noise.",
    "Cameras sweep, lasers switch on and off and pressure plates never forgive. Key cards open vault doors.",
    "Sneak up behind an unaware guard and press E to knock him out for a while.",
    "Grab the target gem and reach the exit. No alarm plus all the loot earns three stars.",
  ],
  touchHowTo: [
    "Guards see along their torch beams. Stay out of the cones, or put a statue, column or crate between you.",
    "Shadows hide you: in the dark a guard only spots you up close. Torchlight and moonlight give you away from afar.",
    "Walking makes a little noise and running makes a lot. Turn Sneak on when a guard is near; hold Run only when nobody can hear.",
    "Tap a spot on the floor to throw a coin there — guards walk over to check the noise.",
    "Cameras sweep, lasers switch on and off and pressure plates never forgive. Key cards open vault doors.",
    "Sneak up behind an unaware guard and tap Use when Knock out appears.",
    "Tap Use to grab the target gem, then reach the exit. No alarm plus all the loot earns three stars.",
  ],
  features: ["Eight handcrafted heists", "Vision cones, cameras & lasers", "Light, shadow & noise", "Coin lures and knockouts", "Three-star case files"],
  music: "After Hours",
  comingSoon: true,
};
