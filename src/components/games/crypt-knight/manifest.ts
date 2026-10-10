import type { GameEntry } from "@/lib/games";
import { HEROES } from "./content";

/** Crypt Knight — every model it uses, from the site's own library (public/library). No three.js here. */

/** Characters and the weapons the skeletons carry (the knight's sword and shield are part of its model). */
export const C = {
  knight: "character-pack-adventures/knight",
  minion: "character-pack-skeletons/skeleton-minion",
  blade: "character-pack-skeletons/skeleton-blade",
  warrior: "character-pack-skeletons/skeleton-warrior",
  axe: "character-pack-skeletons/skeleton-axe",
  shieldLarge: "character-pack-skeletons/skeleton-shield-large-a",
  mage: "character-pack-skeletons/skeleton-mage",
  staff: "character-pack-skeletons/skeleton-staff",
  rogue: "character-pack-skeletons/skeleton-rogue",
  crossbow: "character-pack-skeletons/skeleton-crossbow",
} as const;

const d = (name: string) => `dungeon-remastered/${name}`;

/** Dungeon pieces the rooms are built from. */
export const D = {
  floor: d("floor-tile-large-gltf"),
  floorSmall: d("floor-tile-small-gltf"),
  floorBrokenA: d("floor-tile-small-broken-a-gltf"),
  floorBrokenB: d("floor-tile-small-broken-b-gltf"),
  floorDecorated: d("floor-tile-small-decorated-gltf"),
  floorDirt: d("floor-dirt-large-gltf"),
  spikes: d("floor-tile-big-spikes"),
  wall: d("wall-gltf"),
  wallArched: d("wall-arched-gltf"),
  wallCracked: d("wall-cracked-gltf"),
  wallShelves: d("wall-shelves-gltf"),
  wallWindow: d("wall-window-closed-gltf"),
  wallPillar: d("wall-pillar-gltf"),
  wallCorner: d("wall-corner-small-gltf"),
  doorway: d("wall-doorway"),
  barrier: d("barrier-column-gltf"),
  column: d("column-gltf"),
  pillar: d("pillar-gltf"),
  pillarDecorated: d("pillar-decorated-gltf"),
  torch: d("torch-mounted-gltf"),
  candles: d("candle-triple-gltf"),
  barrel: d("barrel-large-gltf"),
  barrelSmall: d("barrel-small-gltf"),
  barrelStack: d("barrel-small-stack-gltf"),
  box: d("box-small-gltf"),
  boxLarge: d("box-large-gltf"),
  crates: d("crates-stacked-gltf"),
  chest: d("chest"),
  coin: d("coin-gltf"),
  coinStack: d("coin-stack-small-gltf"),
  potion: d("bottle-c-brown-gltf"),
  bannerRed: d("banner-pattern-a-red-gltf"),
  bannerShield: d("banner-shield-red-gltf"),
  bannerThin: d("banner-thin-red-gltf"),
  rubble: d("rubble-half-gltf"),
  tableBroken: d("table-medium-broken-gltf"),
  table: d("table-long-decorated-a-gltf"),
  swordShield: d("sword-shield-broken-gltf"),
  trunk: d("trunk-large-a-gltf"),
} as const;

/** Needed for the menu and the first rooms: the knight, the crypt and the minions. */
export const FIRST_MODELS: string[] = [C.knight, ...Object.values(D), C.minion, C.blade];
/** Streamed in the background while the menu is up: warriors and mages appear from room 3, rogues and archers in later worlds. */
export const LATER_MODELS: string[] = [C.warrior, C.axe, C.shieldLarge, C.mage, C.staff, C.rogue, C.blade, C.crossbow];

/** Load order matters: what the first screen needs goes first. Other heroes load when picked. */
export const MODELS: string[] = [...new Set([...FIRST_MODELS, ...LATER_MODELS, ...HEROES.map((h) => h.key)])];

export const GAME: GameEntry = {
  slug: "crypt-knight",
  title: "Crypt Knight",
  tagline: "Sword, shield and a crypt full of restless skeletons.",
  description:
    "A 3D action roguelite. Fight stage by stage through five cursed worlds — 50 stages in all, up to 3 stars each: chain combos, block, parry and dodge-roll through attacks, and later stages bless you with random powers. Skeletons claw their way out of the floor and a skeleton king guards the last stage of every world. Coins are saved after every stage: unlock 5 heroes, 10 skins and new worlds in the shop.",
  genre: "Action roguelite",
  accent: "#f43f5e",
  cover: "/games/crypt-knight/cover.webp",
  models: MODELS,
  collections: ["Character Pack Adventures", "Character Pack Skeletons", "Dungeon Remastered"],
  trailer: { src: "/games/crypt-knight/trailer.mp4", hd: "/games/crypt-knight/trailer-1080.mp4", poster: "/games/crypt-knight/trailer-poster.webp", seconds: 40 },
  preview: "/games/crypt-knight/card-loop.mp4",
  controls: [
    { action: "Move", keys: ["W", "A", "S", "D"], touch: "Left stick (thumb anywhere bottom-left)" },
    { action: "Attack (tap for combos)", keys: ["J", "Click"], touch: "Sword button" },
    { action: "Block (hold)", keys: ["K", "Right-click"], touch: "Shield button (hold)" },
    { action: "Dodge roll", keys: ["Space", "Shift"], touch: "Roll button" },
    { action: "Spin attack (when charged)", keys: ["L", "E"], touch: "Spin button" },
    { action: "Drink potion", keys: ["Q"], touch: "Potion button" },
    { action: "Shop (heroes, skins, worlds)", keys: ["S"], touch: "Shop button on the title screen" },
  ],
  howTo: [
    "Every world has 10 stages. Clear every skeleton in a stage to win it and open the next one; stage 10 is the world's skeleton king. Finish with more health for more stars (up to 3).",
    "Tap attack for a 3-hit combo: chop, slice, stab. The last hit knocks enemies back and breaks a warrior's shield guard.",
    "Red markers on the floor show where an attack will land. Step out, roll through it or block it.",
    "Hold block to take far less damage. Block right as a hit lands to parry: the attacker is stunned and bolts fly back.",
    "Dodge-roll through attacks: you can't be hurt mid-roll. Rolling has a short cooldown.",
    "Landing hits charges your spin attack. When the ring is full, spin to hit everything around you.",
    "Later stages bless you with one random power for every stage before them. Smash chests, barrels and crates for coins and potions.",
    "Coins are saved after every stage (plus 10 per star and 150 for beating a king). Spend them in the shop on heroes, skins and worlds. A new world can be bought once every stage of the world before it is cleared — later worlds are tougher but pay more.",
  ],
  features: ["5 worlds, 50 stages, 3 stars each", "5 heroes and 10 skins to unlock with coins", "Combo, block, parry & dodge-roll combat", "A skeleton king guards every world"],
  music: "Crypt of Bones",
};
