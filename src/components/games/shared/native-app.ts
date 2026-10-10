"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The Android app (android/kingdom-clash/) plays a game in a WebView, with the game's files served
 * from inside the APK. It adds "KingdomClashApp/<version>" to the user agent and talks to the page:
 *
 * - Android back button → `window.__nativeBack()`. Return true when the game used it (closed a
 *   panel, paused a battle); otherwise the app asks to press back again to exit.
 * - App sent to / back from the background → a `nativeapp` window event with detail "pause" / "resume".
 */

const APP_UA = /\bKingdomClashApp\/[\d.]+/;

export const isNativeApp = () => typeof navigator !== "undefined" && APP_UA.test(navigator.userAgent);

const noSubscribe = () => () => {};

/** True inside the Android app (false while the static HTML hydrates, then the real answer). */
export function useNativeApp() {
  return useSyncExternalStore(noSubscribe, isNativeApp, () => false);
}

declare global {
  interface Window {
    __nativeBack?: () => boolean;
  }
}

/** Handles the Android back button; the latest handler is always the one called. */
export function useNativeBack(handler: () => boolean) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const call = () => ref.current();
    window.__nativeBack = call;
    return () => {
      if (window.__nativeBack === call) delete window.__nativeBack;
    };
  }, []);
}

/** Runs `onChange(true)` when the app goes to the background and `onChange(false)` when it returns. */
export function useNativeLifecycle(onChange: (background: boolean) => void) {
  const ref = useRef(onChange);
  useEffect(() => {
    ref.current = onChange;
  });
  useEffect(() => {
    const on = (e: Event) => {
      const state = (e as CustomEvent<string>).detail;
      if (state === "pause" || state === "resume") ref.current(state === "pause");
    };
    window.addEventListener("nativeapp", on);
    return () => window.removeEventListener("nativeapp", on);
  }, []);
}
