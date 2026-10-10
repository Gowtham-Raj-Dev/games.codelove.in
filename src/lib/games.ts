import { CircleHelp, Expand, Music, Pause, Volume2, type LucideIcon } from "lucide-react";
import { GAME as skyHop } from "@/components/games/sky-hop/manifest";
import { GAME as turboKarts } from "@/components/games/turbo-karts/manifest";
import { GAME as siegeSmash } from "@/components/games/siege-smash/manifest";
import { GAME as kingdomClash } from "@/components/games/kingdom-clash/manifest";
import { GAME as castaway } from "@/components/games/castaway/manifest";
import { GAME as novaStrike } from "@/components/games/nova-strike/manifest";
import { GAME as nightHeist } from "@/components/games/night-heist/manifest";
import { GAME as skyCourier } from "@/components/games/sky-courier/manifest";
import { GAME as beatStreet } from "@/components/games/beat-street/manifest";
import { GAME as puttParadise } from "@/components/games/putt-paradise/manifest";
import { GAME as cannonCove } from "@/components/games/cannon-cove/manifest";
import { GAME as cryptKnight } from "@/components/games/crypt-knight/manifest";
import { GAME as hexHaven } from "@/components/games/hex-haven/manifest";
import { GAME as orderUp } from "@/components/games/order-up/manifest";
import { GAME as saucerSiege } from "@/components/games/saucer-siege/manifest";
import { GAME as skateRush } from "@/components/games/skate-rush/manifest";
import { GAME as pattiVeedu } from "@/components/games/patti-veedu/manifest";

/**
 * Browser games built entirely from the library's own 3D models, playable at /games/<slug>/.
 * Each game describes itself in its own manifest (src/components/games/<slug>/manifest.ts) —
 * kept free of three.js so the server pages can read it.
 */

export interface GameControl {
  action: string;
  keys: string[];
  /** The same action on a touch screen. Leave it out when there is none: phones then skip the row. */
  touch?: string;
}

export interface GameEntry {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  genre: string;
  /** Theme colour of the game's UI (hex). */
  accent: string;
  /** Cover image in /public (1200×630). */
  cover: string;
  /**
   * Gameplay trailer shown in place of the cover on the game's page: a 720p MP4 (phones), an optional
   * 1080p one (desktops and full screen) and its poster frame, all in /public.
   */
  trailer?: { src: string; hd?: string; poster: string; seconds: number };
  /** Short muted gameplay loop (MP4 in /public, 1200:630 like the cover) played over the cover in the /games grid. */
  preview?: string;
  /** Library model keys the game loads ("mini-skate/skateboard" → /library/mini-skate/skateboard.glb). */
  models: readonly string[];
  /** Library collections those models come from. */
  collections: string[];
  controls: GameControl[];
  /** Goal and tips, shown in "How to play" and on the games page. */
  howTo: string[];
  /** The same tips for touch screens (phones, tablets, the Android app) — set it when a tip names keys or the mouse. */
  touchHowTo?: string[];
  /** Short highlights for the games page. */
  features: string[];
  /** Name of the game's soundtrack. */
  music: string;
  /** Still being built: listed as "Coming soon", with no cover and no playable route. */
  comingSoon?: boolean;
  /**
   * Runs in its own interface (a standalone HTML game in an iframe): the site's shared buttons and shortcuts
   * don't apply, so the game page lists only the game's own controls.
   */
  ownShell?: boolean;
  /** Says which of the game's models come from the library, when not all of them do: "Its yard trees … come from". */
  modelsIntro?: string;
}

/** Shortcuts every game supports (each game adds its own controls). */
export const GAME_SHORTCUTS: { action: string; keys: string[] }[] = [
  { action: "Pause / resume", keys: ["Esc", "P"] },
  { action: "Music on / off", keys: ["M"] },
  { action: "Sound effects on / off", keys: ["N"] },
  { action: "How to play", keys: ["H"] },
  { action: "Fullscreen", keys: ["F"] },
];

/** The on-screen buttons every game has: touch screens are shown these instead of the shortcuts. */
export const GAME_BUTTONS: { action: string; icon: LucideIcon; fullscreen?: boolean }[] = [
  { action: "Pause / resume", icon: Pause },
  { action: "Music on / off", icon: Music },
  { action: "Sound effects on / off", icon: Volume2 },
  { action: "How to play", icon: CircleHelp },
  { action: "Fullscreen", icon: Expand, fullscreen: true },
];

/** Genre for page titles, e.g. "Free 3D Kart Racing Game": title case, without a "3D" the title already says. */
export const genreTitle = (game: GameEntry) =>
  game.genre.replace(/^3D\s+/i, "").replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/** Tips for the player's device: the touch ones on touch screens, when the game has them. */
export const howToFor = (game: GameEntry, touch: boolean) => (touch && game.touchHowTo) || game.howTo;

export const games: GameEntry[] = [
  pattiVeedu,
  skateRush,
  saucerSiege,
  cannonCove,
  cryptKnight,
  orderUp,
  hexHaven,
  skyHop,
  turboKarts,
  siegeSmash,
  beatStreet,
  puttParadise,
  kingdomClash,
  castaway,
  novaStrike,
  nightHeist,
  skyCourier,
];

export function getGame(slug: string): GameEntry | undefined {
  return games.find((g) => g.slug === slug);
}
