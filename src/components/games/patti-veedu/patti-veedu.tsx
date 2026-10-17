"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
/** "desk" on mouse-and-keyboard computers, "touch" elsewhere; null while rendering on the server. */
const deviceKind = () => (window.matchMedia("(hover: hover) and (pointer: fine)").matches && navigator.maxTouchPoints === 0 ? "desk" : "touch");

/** True while the screen is taller than wide (a phone held upright). */
const PORTRAIT = "(orientation: portrait)";
const upright = () => window.matchMedia(PORTRAIT).matches;
const onTurn = (cb: () => void) => {
  const m = window.matchMedia(PORTRAIT);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** The game's inset variable and the screen side it takes its inset from: as is, and with the game turned a quarter right. */
const SIDES = [
  ["--st", "Top", "Right"],
  ["--sr", "Right", "Bottom"],
  ["--sb", "Bottom", "Left"],
  ["--sl", "Left", "Top"],
] as const;

/**
 * Patti Veedu plays in its own page (public/games/patti-veedu/app/, a standalone three.js game with its own
 * menus, touch controls and settings), framed full screen. Mouse-and-keyboard computers get its desktop layout.
 * Its full screen and rotate buttons act on this page (js/screen.js in the game), and browsers report the camera
 * cutout only to the top page, so the cutout insets are handed to the game's --st/--sr/--sb/--sl.
 * The game only plays sideways: on a phone held upright the frame is turned a quarter right, so it opens in
 * landscape straight away (no "turn your phone" screen). Inside the frame the game sees a landscape screen and
 * touches arrive in its own turned coordinates. Turning the phone sideways, or the first tap's full screen and
 * landscape lock, puts the frame back.
 */
export function PattiVeedu() {
  const kind = useSyncExternalStore(noSubscribe, deviceKind, () => null);
  const portrait = useSyncExternalStore(onTurn, upright, () => false);
  const turned = kind === "touch" && portrait;
  const frame = useRef<HTMLIFrameElement>(null);
  const probe = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pass = () => {
      const root = frame.current?.contentDocument?.documentElement;
      if (!root || !probe.current) return;
      const cs = getComputedStyle(probe.current);
      for (const [name, side, turnedSide] of SIDES) {
        const s = (turned ? turnedSide : side).toLowerCase();
        root.style.setProperty(name, `max(env(safe-area-inset-${s}, 0px), ${cs.getPropertyValue(`padding-${s}`)})`);
      }
    };
    const f = frame.current;
    f?.addEventListener("load", pass);
    window.addEventListener("resize", pass);
    window.addEventListener("orientationchange", pass);
    pass();
    return () => {
      f?.removeEventListener("load", pass);
      window.removeEventListener("resize", pass);
      window.removeEventListener("orientationchange", pass);
    };
  }, [kind, turned]);

  return (
    <div className="fixed inset-0 touch-none overscroll-none bg-[#0b090c]">
      <div
        ref={probe}
        aria-hidden
        className="pointer-events-none invisible fixed"
        style={{ padding: "env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)" }}
      />
      {kind && (
        <iframe
          ref={frame}
          src={`/games/patti-veedu/app/index.html${kind === "desk" ? "?desk" : ""}`}
          title="Patti Veedu"
          className="size-full touch-none border-0"
          // upright phone: a landscape frame (screen height × screen width) turned a quarter right about its top-left corner
          style={turned ? { position: "absolute", top: 0, left: "100%", width: "100dvh", height: "100dvw", transform: "rotate(90deg)", transformOrigin: "top left" } : undefined}
          allow="autoplay; fullscreen; screen-wake-lock; gamepad"
          allowFullScreen
          // keyboard and mouse go straight to the game
          onLoad={(e) => e.currentTarget.focus()}
        />
      )}
    </div>
  );
}
