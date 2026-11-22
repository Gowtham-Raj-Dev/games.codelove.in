import { audio } from "./audio";

/**
 * CrazyGames SDK v3. It is loaded only when the game runs inside CrazyGames (the page is framed by
 * crazygames.com / crazygames.io, or `?crazygames` is on the address for testing); on the website and
 * in YouTube Playables every function here does nothing.
 *
 * What CrazyGames asks for, and where it happens:
 * - loadingStart / loadingStop around the load, gameplayStart / gameplayStop whenever the player is
 *   (not) in the action — menus, pauses, results and ads all count as "not".
 * - Ads only through the SDK, only at natural breaks (midgame) or for a reward the player chooses.
 *   Sound and the game are held while an ad plays.
 */

interface CgAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CgSdk {
  init(): Promise<void>;
  environment?: string;
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart(): void;
    loadingStop(): void;
    happytime(): void;
  };
  ad: { requestAd(type: "midgame" | "rewarded", callbacks: CgAdCallbacks): void; hasAdblock?: () => Promise<boolean> };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CgSdk };
  }
}

const SRC = "https://sdk.crazygames.com/crazygames-sdk-v3.js";

/** Framed by CrazyGames (or asked for by hand while testing). */
function wanted(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("crazygames")) return true;
  if (window.self === window.top) return false;
  const hosts = [document.referrer, ...(window.location.ancestorOrigins ? Array.from(window.location.ancestorOrigins) : [])];
  return hosts.some((h) => /(^|[/.])crazygames\.(com|io)/i.test(h));
}

let ready: Promise<CgSdk | null> | null = null;
let sdkRef: CgSdk | null = null;
let playing = false;
let blocked = false;

/** Loads and starts the SDK (once). Resolves with null outside CrazyGames or if the SDK cannot start. */
export function crazyInit(): Promise<CgSdk | null> {
  if (ready) return ready;
  ready = new Promise<CgSdk | null>((resolve) => {
    if (!wanted()) return resolve(null);
    const done = async () => {
      const sdk = window.CrazyGames?.SDK;
      if (!sdk) return resolve(null);
      try {
        await sdk.init();
        sdkRef = sdk;
        resolve(sdk);
      } catch {
        resolve(null);
      }
    };
    if (window.CrazyGames?.SDK) return void done();
    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.onload = () => void done();
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return ready;
}

/** True inside CrazyGames once the SDK has started. */
export const inCrazyGames = () => sdkRef !== null;

/** Whether the game is wanted on this page at all (before the SDK has finished loading). */
export const crazyWanted = wanted;

export function crazyLoading(on: boolean) {
  try {
    if (on) sdkRef?.game.loadingStart();
    else sdkRef?.game.loadingStop();
  } catch {}
}

/** The player is in the action (true) or in a menu / pause / result / ad (false). Repeats are dropped. */
export function crazyGameplay(on: boolean) {
  if (!sdkRef || on === playing) return;
  if (on && blocked) return;
  playing = on;
  try {
    if (on) sdkRef.game.gameplayStart();
    else sdkRef.game.gameplayStop();
  } catch {}
}

/** A good moment: a three-star heist. */
export function crazyHappy() {
  try {
    sdkRef?.game.happytime();
  } catch {}
}

/**
 * Shows an ad. `midgame` at a natural break, `rewarded` only when the player asked for it. Resolves true
 * when a rewarded ad was watched to the end (a midgame ad resolves true when it ran or was skipped by
 * CrazyGames's own rules), false when there was no ad or it failed. Always resolves, never throws.
 */
export function crazyAd(type: "midgame" | "rewarded", hooks: { onStart?: () => void; onEnd?: () => void } = {}): Promise<boolean> {
  const sdk = sdkRef;
  if (!sdk) return Promise.resolve(false);
  const resumeGameplay = playing;
  return new Promise<boolean>((resolve) => {
    let finished = false;
    const end = (ok: boolean) => {
      if (finished) return;
      finished = true;
      blocked = false;
      audio.hold(false);
      hooks.onEnd?.();
      resolve(ok);
    };
    try {
      sdk.ad.requestAd(type, {
        adStarted: () => {
          blocked = true;
          if (resumeGameplay) crazyGameplay(false);
          audio.hold(true);
          hooks.onStart?.();
        },
        adFinished: () => end(true),
        adError: () => end(false),
      });
    } catch {
      end(false);
    }
  });
}
