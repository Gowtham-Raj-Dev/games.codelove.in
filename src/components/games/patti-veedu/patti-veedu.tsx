"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
/** "desk" on mouse-and-keyboard computers, "touch" elsewhere; null while rendering on the server. */
const deviceKind = () => (window.matchMedia("(hover: hover) and (pointer: fine)").matches && navigator.maxTouchPoints === 0 ? "desk" : "touch");

const SIDES = [
  ["--st", "Top"],
  ["--sr", "Right"],
  ["--sb", "Bottom"],
  ["--sl", "Left"],
] as const;

/**
 * Patti Veedu plays in its own page (public/games/patti-veedu/app/, a standalone three.js game with its own
 * menus, touch controls and settings), framed full screen. Mouse-and-keyboard computers get its desktop layout.
 * Its full screen and rotate buttons act on this page (js/screen.js in the game), and browsers report the camera
 * cutout only to the top page, so the cutout insets are handed to the game's --st/--sr/--sb/--sl.
 */
export function PattiVeedu() {
  const kind = useSyncExternalStore(noSubscribe, deviceKind, () => null);
  const frame = useRef<HTMLIFrameElement>(null);
  const probe = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pass = () => {
      const root = frame.current?.contentDocument?.documentElement;
      if (!root || !probe.current) return;
      const cs = getComputedStyle(probe.current);
      for (const [name, side] of SIDES) root.style.setProperty(name, `max(env(safe-area-inset-${side.toLowerCase()}, 0px), ${cs.getPropertyValue(`padding-${side.toLowerCase()}`)})`);
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
  }, [kind]);

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
          allow="autoplay; fullscreen; screen-wake-lock; gamepad"
          allowFullScreen
          // keyboard and mouse go straight to the game
          onLoad={(e) => e.currentTarget.focus()}
        />
      )}
    </div>
  );
}
