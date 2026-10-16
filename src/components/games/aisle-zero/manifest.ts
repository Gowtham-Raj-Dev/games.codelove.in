import type { GameEntry } from "@/lib/games";

/**
 * Aisle Zero — a standalone three.js game (public/games/aisle-zero/app/) played in an iframe, like Patti Veedu.
 * The abandoned supermarket (shelving, thousands of products, freezers, checkouts, lockers, carts) is built in
 * code with generated textures; the two monsters are library models, loaded from /library at run time.
 * No three.js here: the server pages only read this manifest.
 */
export const MODELS = ["ghosts/human-deer", "ghosts/hooded-horror-woman"] as const;

export const GAME: GameEntry = {
  slug: "aisle-zero",
  title: "Aisle Zero",
  tagline: "A huge abandoned supermarket at night. A cart, a list, and something that roams the aisles.",
  description:
    "A first-person 3D horror game set in the abandoned Sri Velan Super Market. Push your cart through ten dark aisles, a produce corner, a frozen wall and a stock room, collect the eight things on your shopping list, pay at the register and escape through the emergency exit. A Wendigo roams the whole store. It does not know where you are until it sees you or hears you: sneak, hide in lockers and throw cans to lure it away.",
  genre: "Horror stealth",
  accent: "#e2261a",
  cover: "/games/aisle-zero/cover.webp",
  models: MODELS,
  collections: ["Ghosts"],
  ownShell: true,
  modelsIntro: "Its monsters, the Wendigo and the hooded ghost, are",
  controls: [
    { action: "Walk", keys: ["W", "A", "S", "D"], touch: "Left side: touch and drag" },
    { action: "Run (loud, drains stamina)", keys: ["Shift"], touch: "Push the stick all the way" },
    { action: "Look around", keys: ["Mouse"], touch: "Right side: swipe" },
    { action: "Pick up, hide, pay", keys: ["E"], touch: "USE button" },
    { action: "Crouch (quiet)", keys: ["C", "Ctrl"], touch: "SNEAK button" },
    { action: "Flashlight on / off", keys: ["F"], touch: "LIGHT button" },
    { action: "Throw a can to make noise", keys: ["Q"], touch: "THROW button" },
    { action: "Store map", keys: ["M", "Tab"], touch: "MAP button" },
    { action: "Mute", keys: ["N"] },
    { action: "Pause", keys: ["Esc", "P"], touch: "II button" },
  ],
  howTo: [
    "Collect the eight items on your shopping list. Each one glows with a light beam you can see over the shelves; the list names the aisle and the map (M) shows where.",
    "When you have everything, pay at register 4 in the front lobby. The alarm unlocks the emergency exit at the far back of the store, and the Wendigo comes for you.",
    "The creature roams the store on its own. It notices you by sight (your flashlight makes you easy to spot) and by sound: running is loud, crouching is quiet.",
    "When it notices you it freezes for a moment. That is your chance to break its line of sight.",
    "Lockers marked HIDE let you hide. If it saw you go in, it will pull you out, so get out of sight first.",
    "Throw cans (Q) to draw it away. A hooded ghost sometimes appears at the end of an aisle: it cannot hurt you, look away and keep moving.",
  ],
  touchHowTo: [
    "Collect the eight items on your shopping list. Each one glows with a light beam you can see over the shelves; the list names the aisle and the MAP button shows where.",
    "Drag on the left side to walk; push all the way to run (it is loud). Swipe on the right side to look.",
    "When you have everything, pay at register 4 in the front lobby. The emergency exit at the back unlocks and the Wendigo comes for you.",
    "Tap SNEAK to crouch, LIGHT for the flashlight and THROW to throw a can and lure the creature away.",
    "Lockers marked HIDE let you hide. Get out of its sight first or it will find you.",
    "Hold your phone sideways and wear headphones: its footsteps and breathing tell you where it is.",
  ],
  features: ["A huge store: 10 aisles, frozen wall, produce corner, stock room", "A Wendigo that roams, hunts by sight and sound", "Hide, crouch, throw cans, use the map", "Real-time shadows and a flashlight beam"],
  music: "Procedural horror score",
  // CC BY credits: "The Human Deer" by ceeleste and the hooded ghost by PurplePoint (Sketchfab, CC BY 4.0); also in the game menu and THIRD_PARTY.txt.
};
