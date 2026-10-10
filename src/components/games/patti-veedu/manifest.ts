import type { GameEntry } from "@/lib/games";

/**
 * Patti Veedu — a standalone three.js game (source: pattyveedu-game/PattiVeedu-Project/game, copied into
 * public/games/patti-veedu/app/ by `npm run patti:sync`) played in an iframe. Paatti and Valli are Microsoft
 * Rocketbox avatars and the house is built in code; its yards use these library models (embedded in the game's
 * js/yard-models.js by assets-src/yard/build_yard.mjs). No three.js here.
 */
export const MODELS = [
  "avatar-garden/tree02",
  "avatar-garden/base-palm-tree01",
  "avatar-show/banana-plant",
  "avatar-garden/bush03",
  "avatar-garden/bush02",
  "avatar-garden/stone01",
  "avatar-garden/stone02",
  "halloween-bits/tree-dead-large",
  "halloween-bits/tree-dead-medium",
  "halloween-bits/lantern-hanging",
  "halloween-bits/lantern-standing",
] as const;

export const GAME: GameEntry = {
  slug: "patti-veedu",
  title: "Patti Veedu",
  tagline: "Grandma's house. Five nights. Listen for her anklet bells.",
  description:
    "A first-person Tamil horror puzzle game set in a Chettinad mansion. Paatti walks the halls with her lantern, hunting by sound: sneak, hide in wardrobes and under cots, and solve the house's puzzles to unlock the four locks on the front door before the fifth night ends. In Tamil and English.",
  genre: "Horror puzzle",
  accent: "#e2563b",
  cover: "/games/patti-veedu/cover.webp",
  trailer: { src: "/games/patti-veedu/trailer.mp4", hd: "/games/patti-veedu/trailer-1080.mp4", poster: "/games/patti-veedu/trailer-poster.webp", seconds: 50 },
  preview: "/games/patti-veedu/card-loop.mp4",
  models: MODELS,
  collections: ["Avatar Garden", "Avatar Show", "Halloween Bits"],
  ownShell: true,
  modelsIntro: "Its yard trees, palms, plants, rocks and lanterns come from",
  controls: [
    { action: "Walk", keys: ["W", "A", "S", "D"], touch: "Left side: touch and drag" },
    { action: "Run (makes noise)", keys: ["Shift"], touch: "Push the stick all the way" },
    { action: "Look around", keys: ["Mouse"], touch: "Right side: swipe" },
    { action: "Take, open, read, hide", keys: ["E"], touch: "Big action button" },
    { action: "Crouch (silent)", keys: ["C", "Ctrl"], touch: "Crouch button" },
    { action: "Torch on / off", keys: ["F"], touch: "Torch button" },
    { action: "Drop what you hold", keys: ["G"] },
    { action: "Diary, letters and map", keys: ["J", "M"], touch: "Diary button" },
    { action: "Pause", keys: ["Esc", "P"], touch: "Pause button" },
  ],
  howTo: [
    "The front door has four locks. The key to the last one is in the second wing of the house. Escape within five nights.",
    "Paatti hunts by sound. Running and cracked tiles make noise; crouch to move silently.",
    "Wear headphones: the direction of her anklet bells (kolusu) tells you where she is.",
    "Hide in wardrobes, under cots and in the hay when she comes near.",
    "A syringe knocks Paatti out for a while if you stab her up close.",
    "Read the notes and the diary: they hold the clues to the lamps, the clock, the pallanguzhi board and the portraits.",
  ],
  touchHowTo: [
    "The front door has four locks. The key to the last one is in the second wing of the house. Escape within five nights.",
    "Drag on the left side to walk; push all the way to run (it makes noise). Swipe on the right side to look.",
    "Wear headphones: the direction of her anklet bells (kolusu) tells you where she is.",
    "The big button changes with what you look at: take, open, read or hide.",
    "A syringe knocks Paatti out for a while if you stab her up close.",
    "Hold your phone sideways. Read the notes and the diary for the puzzle clues.",
  ],
  features: ["Five nights in a Chettinad mansion", "Stealth: hide, crouch, listen", "Lamp, clock, pallanguzhi and portrait puzzles", "Tamil and English"],
  music: "Patti Veedu theme",
};
