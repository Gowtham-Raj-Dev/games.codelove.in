import { useSyncExternalStore } from "react";
import { audio } from "./audio";

/**
 * YouTube Playables. The bundle made by scripts/build-playables.mjs loads YouTube's SDK
 * (https://www.youtube.com/game_api/v1) before the game; on the website there is no SDK and every
 * function here does nothing. What YouTube requires, and where it happens:
 *
 * - firstFrameReady once the loading screen is up, gameReady once the menu takes input.
 * - Pause / resume and sound only through the SDK (onPause / onResume / isAudioEnabled) — the page
 *   visibility API must not be used, and YouTube's mute silences everything.
 * - Progress saved with saveData (never localStorage), after loadData has been awaited.
 * - The best score sent with sendScore, matching the saved best.
 * - Nothing leaves the bundle: no online rooms, no links to other sites (YouTube's CSP blocks them).
 */

interface YtGame {
  IN_PLAYABLES_ENV: boolean;
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  system: {
    isAudioEnabled(): boolean;
    onAudioEnabledChange(callback: (enabled: boolean) => void): () => void;
    onPause(callback: () => void): () => void;
    onResume(callback: () => void): () => void;
  };
  engagement: { sendScore(score: { value: number }): Promise<void> };
}

declare global {
  interface Window {
    ytgame?: YtGame;
  }
}

const sdk = (): YtGame | null => (typeof window !== "undefined" && window.ytgame) || null;

/** True in the YouTube Playables build. */
export const inPlayables = () => sdk() !== null;

const noSubscribe = () => () => {};

/** React: true in the YouTube Playables build (false while the static HTML hydrates). */
export const usePlayables = () => useSyncExternalStore(noSubscribe, inPlayables, () => false);

/**
 * YouTube requires mouse input for every interaction, and the games with driving or movement keys
 * have none on a desktop. So in Playables their on-screen controls (which take a mouse as well as a
 * finger) also show on mouse-and-keyboard computers — until a key is pressed, which tells us the
 * player has a keyboard in hand.
 */
const keyboard = { used: false, listeners: new Set<() => void>() };
if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e) => {
      if (keyboard.used || e.ctrlKey || e.metaKey || e.altKey || ["Shift", "Control", "Alt", "Meta", "Escape", "Tab"].includes(e.key)) return;
      keyboard.used = true;
      keyboard.listeners.forEach((fn) => fn());
    },
    true,
  );
}
const subscribeKeyboard = (fn: () => void) => {
  keyboard.listeners.add(fn);
  return () => void keyboard.listeners.delete(fn);
};

/** React: true when the on-screen controls should show for a mouse (Playables, no key pressed yet). */
export const usePointerControls = () => useSyncExternalStore(subscribeKeyboard, () => inPlayables() && !keyboard.used, () => false);
/** The same, outside React. */
export const pointerControls = () => inPlayables() && !keyboard.used;
export const onPointerControlsChange = subscribeKeyboard;

const sent = { firstFrame: false, ready: false };

/** The loading screen is showing. */
export function playablesFirstFrame() {
  const yt = sdk();
  if (!yt || sent.firstFrame) return;
  sent.firstFrame = true;
  yt.game.firstFrameReady();
}

/**
 * The menu is up and takes input. Sent once the loading screen has left (in Playables it goes at
 * once, shared/loading-screen.tsx): YouTube forbids gameReady while a loading screen still shows, and
 * wants it within five seconds.
 */
export const PLAYABLES_LOADING_EXIT = 120;

export function playablesReady() {
  const yt = sdk();
  if (!yt || sent.ready) return;
  playablesFirstFrame();
  sent.ready = true;
  window.setTimeout(() => yt.game.gameReady(), PLAYABLES_LOADING_EXIT + 60);
}

/**
 * Follows YouTube's pause / resume and mute: audio is held while paused or muted, and the game is
 * told to stop and start. Returns the unsubscribe.
 */
export function playablesLifecycle(onPause: () => void, onResume: () => void) {
  const yt = sdk();
  if (!yt) return () => {};
  const state = { paused: false, muted: !yt.system.isAudioEnabled() };
  const apply = () => audio.hold(state.paused || state.muted);
  apply();
  const offs = [
    yt.system.onPause(() => {
      state.paused = true;
      apply();
      onPause();
    }),
    yt.system.onResume(() => {
      state.paused = false;
      apply();
      onResume();
    }),
    yt.system.onAudioEnabledChange((enabled) => {
      state.muted = !enabled;
      apply();
    }),
  ];
  return () => offs.forEach((off) => off());
}

/** YouTube rejects saveData until loadData has come back. */
let loaded = false;
/** The whole cloud save of a game that keeps several records (see playablesSlot). */
const cloudDoc: Record<string, unknown> = {};

/** The cloud save (an object), {} for a new player, null outside YouTube. */
export async function playablesLoad(): Promise<Record<string, unknown> | null> {
  const yt = sdk();
  if (!yt) return null;
  let data: Record<string, unknown> = {};
  try {
    const text = await yt.game.loadData();
    const parsed: unknown = text ? JSON.parse(text) : {};
    // A save from an older version, or anything unreadable, starts clean instead of crashing.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }
  loaded = true;
  Object.assign(cloudDoc, data);
  return data;
}

/**
 * Loads the cloud save without holding the game up: `apply` gets the save when YouTube answers, and
 * the promise settles then or after `wait` ms, whichever is first — a slow answer must not keep the
 * loading screen up (YouTube wants gameReady within five seconds). Outside YouTube it settles at once.
 */
export function playablesCloud(apply: (cloud: Record<string, unknown>) => void, wait = 1200): Promise<void> {
  if (!sdk()) return Promise.resolve();
  const arrived = playablesLoad().then((cloud) => {
    if (cloud) apply(cloud);
  });
  return Promise.race([arrived, new Promise<void>((resolve) => window.setTimeout(resolve, wait))]);
}

let saving: Promise<void> = Promise.resolve();

/** Saves to the cloud, one write at a time, newest last. */
export function playablesSave(data: object) {
  const yt = sdk();
  if (!yt || !loaded) return;
  const text = JSON.stringify(data);
  saving = saving.then(() => yt.game.saveData(text)).catch(() => {});
}

/**
 * For a game with more than one set of records: each set is a named part of the one cloud save.
 * Returns the `cloud` writer for createRecords; after playablesLoad, hydrate each set from its part.
 */
export function playablesSlot(slot: string) {
  return (value: object) => {
    cloudDoc[slot] = value;
    playablesSave(cloudDoc);
  };
}

export function playablesScore(value: number) {
  void sdk()
    ?.engagement.sendScore({ value: Math.floor(value) })
    .catch(() => {});
}
