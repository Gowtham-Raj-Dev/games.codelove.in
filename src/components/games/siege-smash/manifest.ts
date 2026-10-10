import type { GameEntry } from "@/lib/games";
import { AMMO, DEFENDERS, MODEL, PIECES } from "./pieces";

/** Siege Smash — every model it uses, from the site's own library (public/library). No three.js here. */

const pieceModels = Object.values(PIECES).flatMap((p) => ("wreck" in p && p.wreck ? [p.model, p.wreck] : [p.model]));

/** Load order matters: what the first screen needs (trebuchet, castle pieces, orcs) goes first. */
export const MODELS: string[] = [
  ...new Set([
    MODEL.trebuchet,
    ...pieceModels,
    DEFENDERS.orc.model,
    AMMO.boulder.model,
    MODEL.flag,
    MODEL.banner,
    MODEL.treeLarge,
    MODEL.treeSmall,
    MODEL.rocksLarge,
    MODEL.rocksSmall,
    MODEL.trunk,
    MODEL.catapult,
    MODEL.ram,
    MODEL.siegeTower,
    MODEL.flagWide,
    MODEL.bannerLong,
    AMMO.bomb.model,
    AMMO.splitter.model,
    DEFENDERS.skeleton.model,
    DEFENDERS.knight.model,
  ]),
];

export const GAME: GameEntry = {
  slug: "siege-smash",
  title: "Siege Smash",
  tagline: "Aim the trebuchet, topple the towers, rout the defenders.",
  description:
    "A 3D physics puzzle. Load your trebuchet, aim the arc and smash 14 castles built from real, wobbling blocks — walls crack, towers topple, powder kegs blow and defenders tumble. Use as few shots as you can for three stars, with boulders, bombs and splitting stones to choose from.",
  genre: "Physics puzzle",
  accent: "#a3e635",
  cover: "/games/siege-smash/cover.webp",
  models: MODELS,
  collections: ["Castle Kit", "Mini Dungeon", "Graveyard Kit", "Tower Defense Kit", "Platformer Kit"],
  controls: [
    { action: "Aim and set power", keys: ["Drag", "A", "D", "W", "S"], touch: "Drag back anywhere" },
    { action: "Fire", keys: ["Release", "Space"], touch: "Let go" },
    { action: "Split the splitter (in flight)", keys: ["Space", "Click"], touch: "Tap the screen" },
    { action: "Choose ammo", keys: ["1", "2", "3"], touch: "Tap ammo" },
    { action: "Orbit / zoom camera", keys: ["Q", "E", "Right-drag", "Wheel"], touch: "Two-finger drag / pinch" },
    { action: "Restart level", keys: ["R"], touch: "Restart button" },
  ],
  howTo: [
    "Knock out every defender in the castle to clear the level.",
    "Drag back from the trebuchet to aim — the dotted arc shows where the shot will fly. Release to fire.",
    "Hit towers high to topple them, or drop shots behind walls onto the courtyard.",
    "Boulders smash, bombs explode on impact, and splitting stones break into three when you tap again in flight.",
    "Powder kegs explode when hit and set each other off.",
    "Fewer shots earn more stars, and stars open new regions.",
  ],
  touchHowTo: [
    "Knock out every defender in the castle to clear the level.",
    "Put your finger anywhere on the screen and drag back to aim — the dotted arc shows where the shot will fly. Let go to fire, or slide back to where you started to cancel.",
    "Hit towers high to topple them, or drop shots behind walls onto the courtyard.",
    "Boulders smash, bombs explode on impact, and splitting stones break into three when you tap the screen again in flight.",
    "Powder kegs explode when hit and set each other off.",
    "Fewer shots earn more stars, and stars open new regions. Use two fingers to turn the camera and pinch to zoom.",
  ],
  features: ["Real stacking & toppling physics", "3 ammo types", "14 castles in 3 regions", "Three-star ratings"],
  music: "Siege Folk",
};
