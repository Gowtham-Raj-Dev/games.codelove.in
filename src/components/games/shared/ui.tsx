"use client";

import { useEffect, useState, useSyncExternalStore, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Expand, Info, Menu, Music, Music2, Shrink, Volume2, VolumeX, X } from "lucide-react";
import { GAME_BUTTONS, GAME_SHORTCUTS, howToFor, type GameEntry } from "@/lib/games";
import { SITE } from "@/lib/site";
import { themeVars } from "../themes";
import { audio } from "./audio";
import { useNativeApp } from "./native-app";
import { inPlayables, usePlayables } from "./playables";

/**
 * Building blocks every game's UI is made of: the full-screen frame, loading screen, how-to-play
 * sheet, audio toggles, buttons, modals, plus the shared keyboard shortcuts and small stores.
 *
 * Every game looks different: GameRoot sets the game's theme variables (src/components/games/
 * themes.ts) and the play route sets its fonts (src/lib/game-fonts.ts). Style your own HUD with the
 * same classes so it matches: `g-panel` (menus/cards), `g-hud` (chips over the 3D view),
 * `g-btn` / `g-soft` (buttons — wrap content in `g-unskew`), `g-title` / `g-display` (display
 * font), `g-muted`, `g-tint`, `g-kbd`. `--accent` is the game's accent colour.
 */

// --- Stores -----------------------------------------------------------------------------------------

/** A tiny external store for per-frame game state (HUD) — read with useStore(). */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((fn) => fn());
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

export type Store<T> = ReturnType<typeof createStore<T>>;

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Records kept in this browser (best score, unlocks, settings) — every access guarded. With `cloud`
 * (YouTube Playables) nothing touches localStorage: every change goes to `cloud`, and the saved
 * copy comes in through hydrate().
 */
export function createRecords<T extends object>(key: string, defaults: T, { cloud }: { cloud?: (value: T) => void } = {}) {
  const listeners = new Set<() => void>();
  let cache: T | null = null;
  const read = (): T => {
    if (cloud) return defaults;
    try {
      return { ...defaults, ...JSON.parse(window.localStorage.getItem(key) ?? "{}") };
    } catch {
      return defaults;
    }
  };
  const records = {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    get: (): T => (cache ??= read()),
    server: (): T => defaults,
    set(patch: Partial<T>) {
      cache = { ...records.get(), ...patch };
      if (cloud) cloud(cache);
      else {
        try {
          window.localStorage.setItem(key, JSON.stringify(cache));
        } catch {
          // Storage blocked: keep for this session.
        }
      }
      listeners.forEach((fn) => fn());
    },
    /** Replaces the records with a saved copy without saving it again (cloud saves). */
    hydrate(saved: Partial<T>) {
      cache = { ...defaults, ...saved };
      listeners.forEach((fn) => fn());
    },
  };
  return records;
}

export function useRecords<T extends object>(records: ReturnType<typeof createRecords<T>>) {
  return useSyncExternalStore(records.subscribe, records.get, records.server);
}

/** Phones held sideways — same query as the `land:` variant in globals.css. */
export const PHONE_LANDSCAPE = "(orientation: landscape) and (max-height: 540px)";

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on a phone in landscape (and always in the Android app): HUDs switch to their landscape layout. */
export const usePhoneLandscape = () => useMediaQuery(PHONE_LANDSCAPE);

/** Set by GameRoot once a finger touches the game (touch-screen laptops report a mouse pointer). */
const touchUsed = createStore(false);

/** True on touch screens — phones, tablets, the Android app, or after a touch — which get touch instructions. */
export function useTouchScreen() {
  const coarse = useMediaQuery("(pointer: coarse)");
  const app = useNativeApp();
  return useStore(touchUsed) || coarse || app;
}

export function useAudioSettings() {
  return useSyncExternalStore(audio.subscribe, audio.getSettings, audio.serverSettings);
}

// --- Shortcuts --------------------------------------------------------------------------------------

// Older Safari (iPad) only has the webkit-prefixed full screen API.
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };

const fullscreenElement = () => document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;

async function enterFullscreen() {
  const root = document.documentElement as WebkitElement;
  if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
  else root.webkitRequestFullscreen?.();
}

export function toggleFullscreen() {
  if (fullscreenElement()) {
    if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
    else (document as WebkitDocument).webkitExitFullscreen?.();
    return;
  }
  void enterFullscreen().catch(() => {});
}

// TypeScript's DOM types leave out lock(): only some mobile browsers have it.
type LockableOrientation = ScreenOrientation & { lock?: (to: "portrait" | "landscape") => Promise<void> };

/**
 * Turns the screen the other way: portrait → landscape, landscape → portrait. Browsers only lock the
 * orientation of a full screen page (or one opened from the Home Screen), so it goes full screen
 * first. False where the browser can't (iPhone Safari, desktops).
 */
export async function rotateScreen() {
  const orientation = screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock) return false;
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  try {
    if (!fullscreenElement() && !standalone) await enterFullscreen();
    await orientation.lock(portrait ? "landscape" : "portrait");
    return true;
  } catch {
    return false;
  }
}

const onFullscreenChange = (fn: () => void) => {
  document.addEventListener("fullscreenchange", fn);
  document.addEventListener("webkitfullscreenchange", fn);
  return () => {
    document.removeEventListener("fullscreenchange", fn);
    document.removeEventListener("webkitfullscreenchange", fn);
  };
};
const never = () => () => {};

/**
 * `supported`: the browser can make the page full screen (iPhone Safari can't — there the site
 * opens full screen once added to the Home Screen). `active`: it is full screen now.
 */
export function useFullscreen() {
  const supported = useSyncExternalStore(never, () => !!(document.fullscreenEnabled || (document as WebkitDocument).webkitFullscreenEnabled), () => false);
  const active = useSyncExternalStore(onFullscreenChange, () => !!fullscreenElement(), () => false);
  // Opened from the Home Screen: already full screen.
  const standalone = useSyncExternalStore(never, () => window.matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone, () => false);
  return { supported, active, standalone };
}

/**
 * Shortcuts shared by every game: M music, N sound effects, H / ? help, F fullscreen and — when
 * `onPause` is given — Esc / P pause. Game controls are handled by each game.
 */
export function useShortcuts({ onPause, onHelp }: { onPause?: () => void; onHelp?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "m") audio.toggleMusic();
      else if (k === "n") audio.toggleSfx();
      else if (k === "f" && !inPlayables()) toggleFullscreen();
      else if ((k === "h" || k === "?") && onHelp) onHelp();
      else if ((k === "escape" || k === "p") && onPause) onPause();
      else return;
      audio.unlock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPause, onHelp]);
}

// --- Frame ------------------------------------------------------------------------------------------

/**
 * Full-screen game container (theme + fonts); pass pointer handlers for swipe / drag controls.
 * They also fire for taps on HUD buttons — check e.target === your canvas when that matters.
 */
export function GameRoot({
  game,
  children,
  className = "",
  safeArea = "auto",
  ...handlers
}: {
  game: GameEntry;
  children: ReactNode;
  className?: string;
  /** "manual": the game keeps its HUD clear of a camera cutout itself (see .g-root in globals.css). */
  safeArea?: "auto" | "manual";
} & Pick<HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel" | "onPointerLeave" | "onWheel" | "onClick">) {
  // Browsers only start audio after a gesture: the first tap or key press anywhere unlocks it. Every
  // later one resumes it too, in case the phone stopped it and couldn't start it again by itself.
  useEffect(() => {
    const unlock = () => audio.unlock();
    const touched = (e: PointerEvent) => {
      if (e.pointerType === "touch" && !touchUsed.get()) touchUsed.set(true);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", touched);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pointerdown", touched);
    };
  }, []);
  return (
    <div
      className={`g-root fixed inset-0 z-40 touch-none overflow-hidden bg-[#0b1220] select-none [&_canvas]:cursor-default ${className}`}
      style={themeVars(game.slug, game.accent)}
      data-safe-area={safeArea}
      onContextMenu={(e) => e.preventDefault()}
      {...handlers}
    >
      {children}
    </div>
  );
}

/** The game's logo-style title in its display face; the last word takes the accent colour. */
export function GameTitle({ game, size = "lg" }: { game: GameEntry; size?: "sm" | "lg" }) {
  const words = game.title.split(" ");
  const last = words.length > 1 ? words.pop() : null;
  return (
    <h2 className={`g-title ${size === "sm" ? "text-4xl sm:text-5xl" : "text-5xl sm:text-7xl lg:text-8xl"}`}>
      {words.join(" ")}
      {last && (
        <>
          {" "}
          <span className="g-title-accent">{last}</span>
        </>
      )}
    </h2>
  );
}

/** Loading screen in the game's own world (its look per game lives in shared/loaders.tsx). */
export { LoadingScreen } from "./loading-screen";

/** Top-right cluster: music, sound, help, fullscreen. */
export function SystemButtons({
  onHelp,
  children,
  vertical = false,
  small = false,
  grid = false,
}: {
  onHelp?: () => void;
  children?: ReactNode;
  vertical?: boolean;
  small?: boolean;
  /** Four to a row (inside SystemMenu's panel). */
  grid?: boolean;
}) {
  const settings = useAudioSettings();
  // The Android app is already full screen.
  const app = useNativeApp();
  const icon = small ? "size-[18px]" : "size-5";
  return (
    <div className={`pointer-events-auto ${grid ? "grid grid-cols-4 gap-1.5" : `flex items-center gap-2 ${vertical ? "flex-col" : ""}`}`}>
      {children}
      <IconButton
        label={settings.music ? "Music off (M)" : "Music on (M)"}
        onClick={() => {
          audio.unlock();
          audio.toggleMusic();
        }}
        dim={!settings.music}
        small={small}
      >
        {settings.music ? <Music className={icon} /> : <Music2 className={icon} />}
      </IconButton>
      <IconButton
        label={settings.sfx ? "Sound effects off (N)" : "Sound effects on (N)"}
        onClick={() => {
          audio.unlock();
          audio.toggleSfx();
        }}
        dim={!settings.sfx}
        small={small}
      >
        {settings.sfx ? <Volume2 className={icon} /> : <VolumeX className={icon} />}
      </IconButton>
      {onHelp && (
        <IconButton label="How to play (H)" onClick={onHelp} small={small}>
          <CircleHelp className={icon} />
        </IconButton>
      )}
      {onHelp && <CreditsButton small={small} iconClass={icon} />}
      {!app && <FullscreenButton small={small} iconClass={icon} />}
      <RotateButton small={small} iconClass={icon} />
    </div>
  );
}

/**
 * Every corner button behind one menu button, for busy screens: tap it to open them in a small panel,
 * tap anywhere else (or a button in it) to close. The panel stays mounted while closed, so a sheet one
 * of its buttons opened (credits, a tip) stays up.
 */
export function SystemMenu({ onHelp, children, small = false, align = "right" }: { onHelp?: () => void; children?: ReactNode; small?: boolean; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const icon = small ? "size-[18px]" : "size-5";
  return (
    <div className="pointer-events-auto relative">
      <IconButton label={open ? "Close menu" : "Menu"} onClick={() => setOpen((o) => !o)} small={small}>
        {open ? <X className={icon} /> : <Menu className={icon} />}
      </IconButton>
      {open && (
        <div
          className="fixed inset-0 z-40"
          onPointerDown={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        />
      )}
      <div
        className={`g-hud absolute top-full z-50 mt-1.5 w-max p-1.5 ${align === "right" ? "right-0" : "left-0"} ${open ? "animate-[game-fade_0.15s_ease]" : "hidden"}`}
        onClick={() => setOpen(false)}
      >
        <SystemButtons onHelp={onHelp} small={small} grid>
          {children}
        </SystemButtons>
      </div>
    </div>
  );
}

/** A phone turning between upright and sideways. */
export function PhoneRotateIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="8.5" y="5" width="7" height="14" rx="1.5" transform="rotate(-45 12 12)" />
      <path d="M14.5 2.6a9.6 9.6 0 0 1 6.9 6.9" />
      <path d="m21.4 9.5.5-3M21.4 9.5l-2.9-.9" />
      <path d="M9.5 21.4a9.6 9.6 0 0 1-6.9-6.9" />
      <path d="m2.6 14.5-.5 3M2.6 14.5l2.9.9" />
    </svg>
  );
}

/**
 * Touch screens: turns the screen to the other orientation (portrait ↔ landscape). Where the browser
 * can't, it says to turn the phone instead. Not in the Android app, which stays in landscape.
 */
export function RotateButton({ small = false, iconClass = "size-5", className = "" }: { small?: boolean; iconClass?: string; className?: string }) {
  const app = useNativeApp();
  const youtube = usePlayables();
  const touch = useTouchScreen();
  const portrait = useMediaQuery("(orientation: portrait)");
  const [tip, setTip] = useState(false);
  // YouTube Playables handles the screen itself.
  if (app || youtube || !touch) return null;
  return (
    <>
      <IconButton label={portrait ? "Turn to landscape" : "Turn to portrait"} onClick={() => void rotateScreen().then((ok) => ok || setTip(true))} small={small} className={className}>
        <PhoneRotateIcon className={iconClass} />
      </IconButton>
      {tip && (
        <TipSheet title={portrait ? "Landscape" : "Portrait"} onClose={() => setTip(false)}>
          This browser can&apos;t turn the screen by itself. Turn your phone {portrait ? "sideways" : "upright"} — if the game doesn&apos;t turn with it, switch off your phone&apos;s
          rotation lock.
        </TipSheet>
      )}
    </>
  );
}

/**
 * Full screen on / off. Where the browser can't (iPhone Safari) it explains Add to Home Screen
 * instead; hidden in the Android app and when opened from the Home Screen, which are full screen already.
 */
export function FullscreenButton({ small = false, iconClass = "size-5", className = "" }: { small?: boolean; iconClass?: string; className?: string }) {
  const app = useNativeApp();
  const youtube = usePlayables();
  const { supported, active, standalone } = useFullscreen();
  const [tip, setTip] = useState(false);
  if (app || youtube || standalone) return null;
  return (
    <>
      <IconButton label={active ? "Exit full screen (F)" : "Full screen (F)"} onClick={() => (supported ? toggleFullscreen() : setTip(true))} small={small} className={className}>
        {active ? <Shrink className={iconClass} /> : <Expand className={iconClass} />}
      </IconButton>
      {tip && (
        <TipSheet title="Full screen" onClose={() => setTip(false)}>
          Safari on iPhone can&apos;t play games full screen. Tap <b>Share</b>, then <b>Add to Home Screen</b>, and open the game from your Home Screen.
        </TipSheet>
      )}
    </>
  );
}

/** A short note over the game (what to do where the browser can't go full screen or turn the screen). */
function TipSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const root = document.querySelector<HTMLElement>(".g-root");
  if (!root) return null;
  return createPortal(
    <div
      className="absolute inset-0 z-50 overflow-y-auto bg-black/55 backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label={title} className="g-panel relative w-full max-w-xs p-5 text-center" onClick={(e) => e.stopPropagation()}>
          <h2 className="g-panel-title text-2xl">{title}</h2>
          <p className="mt-3 text-sm leading-relaxed">{children}</p>
          <div className="mt-5">
            <BigButton onClick={onClose}>Got it</BigButton>
          </div>
        </div>
      </div>
    </div>,
    root,
  );
}

// --- Credits ----------------------------------------------------------------------------------------

/** Who made the game: opened from the Credits button beside "How to play" (and Kingdom Clash's settings). */
export function CreditsSheet({ onClose }: { onClose: () => void }) {
  // Drawn into the game frame so it sits above every HUD layer and keeps the game's theme.
  const root = document.querySelector<HTMLElement>(".g-root");
  if (!root) return null;
  return createPortal(
    <div
      className="absolute inset-0 z-50 overflow-y-auto bg-black/55 backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="Credits" className="g-panel relative w-full max-w-xs p-5 text-center" onClick={(e) => e.stopPropagation()}>
          <h2 className="g-panel-title text-2xl sm:text-3xl">Credits</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="g-display g-muted text-xs">Created by</dt>
              <dd className="g-display mt-0.5 text-xl">{SITE.author}</dd>
            </div>
            <div>
              <dt className="g-display g-muted text-xs">Published by</dt>
              <dd className="g-display mt-0.5 text-xl">{SITE.brand}</dd>
            </div>
          </dl>
          <div className="mt-5">
            <BigButton onClick={onClose}>Close</BigButton>
          </div>
        </div>
      </div>
    </div>,
    root,
  );
}

function CreditsButton({ small, iconClass }: { small: boolean; iconClass: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Credits" onClick={() => setOpen(true)} small={small}>
        <Info className={iconClass} />
      </IconButton>
      {open && <CreditsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

// --- How to play ------------------------------------------------------------------------------------

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="g-kbd inline-flex min-w-6 items-center justify-center px-1.5 py-0.5 text-[11px] font-bold">{children}</kbd>;
}

function ControlsList({ game }: { game: GameEntry }) {
  return (
    <ul className="space-y-2">
      {game.controls.map((c) => (
        <li key={c.action} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold">{c.action}</span>
          <span className="flex flex-wrap items-center justify-end gap-1">
            {c.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Touch screens: each action's tap / swipe / button, and the on-screen buttons instead of keyboard shortcuts. */
function TouchControlsList({ game }: { game: GameEntry }) {
  return (
    <ul className="space-y-2">
      {game.controls
        .filter((c) => c.touch)
        .map((c) => (
          <li key={c.action} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold">{c.action}</span>
            <span className="g-tint rounded-full px-2.5 py-1 text-right text-xs font-bold">{c.touch}</span>
          </li>
        ))}
    </ul>
  );
}

function ButtonsList() {
  const native = useNativeApp();
  const youtube = usePlayables();
  const app = native || youtube;
  const { standalone } = useFullscreen();
  return (
    <>
      <p className="g-muted -mt-1 mb-3 text-xs">In the top corner of the screen, or in the pause or settings menu.</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {GAME_BUTTONS.filter((b) => !b.fullscreen || (!app && !standalone)).map(({ action, icon: Icon }) => (
          <li key={action} className="g-tint flex items-center gap-2.5 rounded-[var(--g-hud-radius)] px-3 py-2 text-xs">
            <span className="g-hud grid size-7 shrink-0 place-items-center">
              <Icon className="size-4" />
            </span>
            {action}
          </li>
        ))}
        {!app && (
          <li className="g-tint flex items-center gap-2.5 rounded-[var(--g-hud-radius)] px-3 py-2 text-xs">
            <span className="g-hud grid size-7 shrink-0 place-items-center">
              <PhoneRotateIcon className="size-4" />
            </span>
            Turn the screen (portrait / landscape)
          </li>
        )}
      </ul>
    </>
  );
}

export function HowToPlay({ game, onClose }: { game: GameEntry; onClose: () => void }) {
  const touch = useTouchScreen();
  const youtube = usePlayables();
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-black/55 backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="How to play" className="g-panel relative w-full max-w-lg p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="g-tint absolute top-4 right-4 grid size-9 place-items-center rounded-full hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <X className="size-4" />
          </button>
          <p className="g-display text-xs text-[var(--accent)]">{game.genre}</p>
          <h2 className="g-panel-title mt-1 pr-10 text-2xl sm:text-3xl">How to play {game.title}</h2>
          <ul className="mt-4 space-y-2">
            {howToFor(game, touch).map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                {line}
              </li>
            ))}
          </ul>
          <h3 className="g-display g-muted mt-6 mb-3 text-xs">{touch ? "Touch controls" : "Controls"}</h3>
          {touch ? <TouchControlsList game={game} /> : <ControlsList game={game} />}
          <h3 className="g-display g-muted mt-6 mb-3 text-xs">{touch ? "Buttons" : "Shortcuts"}</h3>
          {touch ? (
            <ButtonsList />
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {GAME_SHORTCUTS.filter((s) => !youtube || s.keys[0] !== "F").map((s) => (
                <li key={s.action} className="g-tint flex items-center justify-between gap-2 rounded-[var(--g-hud-radius)] px-3 py-2 text-xs">
                  {s.action}
                  <span className="flex gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6">
            <BigButton onClick={onClose}>Got it</BigButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Bits -------------------------------------------------------------------------------------------

export function Modal({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/40 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label={title} className={`g-panel w-full space-y-4 p-6 ${wide ? "max-w-lg" : "max-w-sm"}`}>
          <h2 className="g-panel-title text-center text-3xl sm:text-4xl">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A themed card for your own menus (same material as modals). */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`g-panel ${className}`}>{children}</div>;
}

export function BigButton({ onClick, icon, children, autoFocus, disabled }: { onClick: () => void; icon?: ReactNode; children: ReactNode; autoFocus?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        audio.unlock();
        onClick();
      }}
      autoFocus={autoFocus}
      disabled={disabled}
      className="g-btn flex w-full items-center justify-center px-6 py-4 text-2xl pointer-coarse:px-4 pointer-coarse:py-2 pointer-coarse:text-lg focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] disabled:opacity-50"
    >
      <span className="g-unskew gap-2.5">
        {icon}
        {children}
      </span>
    </button>
  );
}

export function SoftButton({ onClick, icon, children, active = false }: { onClick: () => void; icon?: ReactNode; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      data-active={active}
      onClick={() => {
        audio.unlock();
        onClick();
      }}
      className="g-soft flex w-full items-center justify-center px-4 py-3 text-sm pointer-coarse:px-3 pointer-coarse:py-1.5 pointer-coarse:text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span className="g-unskew gap-2">
        {icon}
        {children}
      </span>
    </button>
  );
}

export function IconButton({
  onClick,
  label,
  children,
  plain = false,
  dim = false,
  small = false,
  className = "",
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  plain?: boolean;
  dim?: boolean;
  /** 36px instead of 44px (touch screens always get 32px). */
  small?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.blur();
        audio.unlock();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={`grid ${small ? "size-9" : "size-11"} pointer-coarse:size-8 place-items-center transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        plain ? "rounded-full hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)]" : "g-hud hover:brightness-110"
      } ${dim ? "opacity-55" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="g-tint rounded-[var(--g-hud-radius)] px-2 py-2.5 text-center">
      <p className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">{label}</p>
      <p className="g-display text-base tabular-nums">{value}</p>
    </div>
  );
}

/** HUD chip over the 3D view. */
export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`g-hud inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-bold ${className}`}>{children}</div>;
}

export const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
