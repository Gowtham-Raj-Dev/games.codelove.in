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

const sent = { firstFrame: false, ready: false };

/** The loading screen is showing. */
export function playablesFirstFrame() {
  const yt = sdk();
  if (!yt || sent.firstFrame) return;
  sent.firstFrame = true;
  yt.game.firstFrameReady();
}

/** The menu is up and takes input. */
export function playablesReady() {
  const yt = sdk();
  if (!yt || sent.ready) return;
  playablesFirstFrame();
  sent.ready = true;
  yt.game.gameReady();
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

/** The cloud save (an object), {} for a new player, null outside YouTube. */
export async function playablesLoad(): Promise<Record<string, unknown> | null> {
  const yt = sdk();
  if (!yt) return null;
  try {
    const text = await yt.game.loadData();
    const data: unknown = text ? JSON.parse(text) : {};
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

let saving: Promise<void> = Promise.resolve();

/** Saves to the cloud, one write at a time, newest last. */
export function playablesSave(data: object) {
  const yt = sdk();
  if (!yt) return;
  const text = JSON.stringify(data);
  saving = saving.then(() => yt.game.saveData(text)).catch(() => {});
}

export function playablesScore(value: number) {
  void sdk()
    ?.engagement.sendScore({ value: Math.floor(value) })
    .catch(() => {});
}
