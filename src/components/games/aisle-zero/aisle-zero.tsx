"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronDown, CircleHelp, DoorOpen, Eye, Flashlight, FlashlightOff, Footprints, Hand, Home, Map as MapIcon, Pause, Play, RotateCcw, ShoppingCart, Skull, Timer } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import {
  BigButton,
  createRecords,
  createStore,
  GameRoot,
  GameTitle,
  HowToPlay,
  IconButton,
  Kbd,
  LoadingScreen,
  Modal,
  SoftButton,
  SystemButtons,
  SystemMenu,
  useMediaQuery,
  useRecords,
  useShortcuts,
  useStore,
  useTouchScreen,
  type Store,
} from "../shared/ui";
import { AisleZeroGame, type Hud, type Phase, type Result } from "./engine";
import { GAME } from "./manifest";
import { ITEM_DEFS, type ItemDef } from "./world";

const records = createRecords("aisle-zero:v1", { best: 0, escapes: 0, runs: 0, listOpen: true });

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };
type LockableOrientation = ScreenOrientation & { lock?: (to: "landscape") => Promise<void> };

/**
 * Phones: full screen and locked sideways, from the tap that starts the game (browsers only allow both from
 * a tap). Where the browser can't lock (iPhone Safari), the page turns the game sideways itself (see `turned`).
 */
function goLandscape() {
  const orientation = screen.orientation as LockableOrientation | undefined;
  const lock = () => void orientation?.lock?.("landscape").catch(() => {});
  if (document.fullscreenElement || window.matchMedia("(display-mode: standalone)").matches) return lock();
  const root = document.documentElement as WebkitEl;
  if (root.requestFullscreen) void root.requestFullscreen({ navigationUI: "hide" }).then(lock, () => {});
  else root.webkitRequestFullscreen?.();
}

/** Film grain: a fine noise tile, repeated at screen-pixel size and jumping about (CSS only). */
function useGrain() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    if (!g) return;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- generated once on the client
    setUrl(c.toDataURL("image/png"));
  }, []);
  return url;
}

export function AisleZero({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fearRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<AisleZeroGame | null>(null);
  const [hud] = useState(() => createStore<Hud | null>(null));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(Result & { best: boolean }) | null>(null);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState<{ id: number; text: string } | null>(null);
  const [picked, setPicked] = useState<{ id: number; def: ItemDef; n: number } | null>(null);
  const saved = useRecords(records);
  const touch = useTouchScreen();
  const portrait = useMediaQuery("(orientation: portrait)");
  const grain = useGrain();
  const pausedAt = useRef(0);
  const ids = useRef(0);

  // A landscape game: on a phone held upright, turn it sideways (once the menu is up; the loading screen
  // has its own upright layout).
  const turned = touch && portrait && phase !== "loading" && phase !== "error";

  const showMessage = useCallback((text: string, ms: number) => {
    const id = ++ids.current;
    setMessage({ id, text });
    setTimeout(() => setMessage((m) => (m?.id === id ? null : m)), ms);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new AisleZeroGame(
      canvas,
      {
        progress: setProgress,
        phase: (p) => {
          if (p === "paused") pausedAt.current = performance.now();
          setPhase(p);
        },
        hud: hud.set,
        error: setError,
        message: showMessage,
        picked: (def, n) => {
          const id = ++ids.current;
          setPicked({ id, def, n });
          setTimeout(() => setPicked((p) => (p?.id === id ? null : p)), 2000);
        },
        result: (r) => {
          const before = records.get();
          const best = r.won && (!before.best || r.time < before.best);
          records.set({ runs: before.runs + 1, escapes: before.escapes + (r.won ? 1 : 0), best: best ? r.time : before.best });
          setResult({ ...r, best });
        },
      },
      { fear: fearRef.current, flash: flashRef.current },
    );
    gameRef.current = game;
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes, showMessage]);

  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  const start = () => {
    blur();
    if (touch) goLandscape();
    setResult(null);
    setHelp(false);
    setMessage(null);
    setPicked(null);
    gameRef.current?.start();
  };

  const toMenu = () => {
    setResult(null);
    setMessage(null);
    gameRef.current?.toMenu();
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (phase === "playing") game?.pause();
    // The Esc that releases the mouse already paused: don't resume on the same key press.
    else if (phase === "paused" && performance.now() - pausedAt.current > 350) game?.resume();
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // L opens / closes the shopping list; Enter confirms on menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (help || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.code === "KeyL" && phase === "playing") records.set({ listOpen: !records.get().listOpen });
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (e.key !== "Enter" || onButton) return;
      if (phase === "menu" || phase === "over") start();
      else if (phase === "paused") gameRef.current?.resume();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving the tab pauses the game.
  useEffect(() => {
    const pause = () => gameRef.current?.pause();
    const onVisibility = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, []);

  const playing = phase === "playing";

  return (
    // turned: the frame's layout box sits beside the screen, so clip it (no stray scrollbar)
    <div className={turned ? "fixed inset-0 overflow-hidden" : "contents"}>
    <div className={turned ? "absolute top-0 left-full h-[100vw] w-[100vh] origin-top-left rotate-90 supports-[height:100dvh]:w-[100dvh]" : "contents"}>
      <GameRoot game={GAME} className="bg-[#070a0b]">
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full [filter:contrast(1.07)_saturate(.86)]" aria-label="Aisle Zero game" />

        {/* Film look: grain, vignette, the creature's red closing in, the jump-scare flash. */}
        {grain && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[.05] mix-blend-overlay motion-safe:animate-[g-grain_0.5s_steps(5)_infinite]"
            style={{ backgroundImage: `url(${grain})`, backgroundSize: "128px 128px" }}
          />
        )}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/.7)_100%)]" />
        <div ref={fearRef} aria-hidden className="pointer-events-none absolute inset-0 opacity-0 bg-[radial-gradient(ellipse_at_center,rgb(120_0_0/0)_38%,rgb(150_0_0/.7)_100%)]" />
        {picked && (
          <div
            key={picked.id}
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-[g-fade-out_0.7s_ease-out_forwards] bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(255_225_140/.28)_100%)]"
          />
        )}
        <div ref={flashRef} aria-hidden className="pointer-events-none absolute inset-0 z-30 bg-[#a00] opacity-0" />

        <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

        {phase === "menu" && !help && <MenuScreen best={saved.best} escapes={saved.escapes} onStart={start} onHelp={() => setHelp(true)} touch={touch} />}

        {/* Touch areas first: the HUD's buttons (list, pause, map) sit above them. */}
        {playing && touch && <TouchControls game={gameRef} store={hud} turned={turned} />}
        {(playing || phase === "paused") && <HudOverlay store={hud} touch={touch} listOpen={saved.listOpen} lastPicked={picked?.def.id ?? null} onPause={pauseOrResume} game={gameRef} onHelp={openHelp} />}
        {(playing || phase === "paused") && picked && (
          <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center px-4">
            <p key={picked.id} className="g-hud animate-[game-fade_0.25s_ease] border-[#6f9a5c]! px-5 py-2 text-base font-bold tracking-[0.06em] text-[#cfe8bc] sm:text-lg">
              + {picked.def.name}
              <span className="ml-3 tabular-nums opacity-80">
                {picked.n}/{ITEM_DEFS.length}
              </span>
            </p>
          </div>
        )}
        {playing && message && (
          <p
            key={message.id}
            className="pointer-events-none absolute inset-x-0 bottom-[max(11%,calc(env(safe-area-inset-bottom)+64px))] mx-auto max-w-[80%] animate-[game-fade_0.5s_ease] text-center text-base font-semibold text-[#f1e6c4] [text-shadow:0_0_10px_#000,0_0_3px_#000] sm:text-2xl"
          >
            {message.text}
          </p>
        )}
        {phase === "paused" && !help && (
          <Modal title="Paused">
            <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
              Resume
            </BigButton>
            <div className="grid grid-cols-3 gap-2">
              <SoftButton onClick={start} icon={<RotateCcw className="size-4" />}>
                Restart
              </SoftButton>
              <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
                Help
              </SoftButton>
              <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
                Leave
              </SoftButton>
            </div>
            <div className="flex justify-center">
              <SystemButtons small />
            </div>
          </Modal>
        )}

        {phase === "over" && result && !help && <ResultCard result={result} onRetry={start} onMenu={toMenu} />}

        {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
      </GameRoot>
    </div>
    </div>
  );
}

// --- Menu --------------------------------------------------------------------------------------------------

function MenuScreen({ best, escapes, onStart, onHelp, touch }: { best: number; escapes: number; onStart: () => void; onHelp: () => void; touch: boolean }) {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgb(10_6_6/.55),rgb(0_0_0/.92))]">
      <div className="absolute top-0 right-0 p-2 pt-[max(env(safe-area-inset-top),8px)] pr-[max(env(safe-area-inset-right),8px)] sm:p-4">
        <SystemButtons onHelp={onHelp} small={touch} />
      </div>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-6 py-10 text-center">
        <GameTitle game={GAME} size={touch ? "sm" : "lg"} />
        <p className="g-display mt-2 text-xs tracking-[0.5em] text-[#a5a18d] sm:text-sm">Night shift</p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-[#b3ae9a] sm:text-base">
          Sri Velan Super Market closed in 1998. Tonight you have a cart, a shopping list and one way out.
          <br />
          It hunts by sight and sound.
        </p>
        {escapes > 0 && (
          <p className="g-hud mt-4 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold">
            <Timer className="size-3.5 text-[var(--accent)]" /> Best escape {fmtTime(best)} · {escapes} escape{escapes === 1 ? "" : "s"}
          </p>
        )}
        <div className="mt-6 w-full max-w-xs space-y-2">
          <BigButton onClick={onStart} autoFocus icon={<ShoppingCart className="size-5" />}>
            Enter the store
          </BigButton>
          <SoftButton onClick={onHelp} icon={<CircleHelp className="size-4" />}>
            How to play
          </SoftButton>
        </div>
        <p className="mt-5 text-xs text-[#7a7664]">Headphones recommended. Its breathing tells you where it is.</p>
        {!touch && <p className="mt-1 text-[11px] text-[#625f52]">WASD move · Mouse look · Shift run · C sneak · E use · T light · Q throw · Tab map</p>}
        <p className="mt-4 max-w-lg text-[10.5px] leading-snug text-[#5a574b]">
          Models: Wendigo &ldquo;The Human Deer&rdquo; by ceeleste and the hooded ghost by PurplePoint (both CC BY 4.0, via Sketchfab). The store is built in code.
        </p>
      </div>
    </div>
  );
}

// --- HUD ---------------------------------------------------------------------------------------------------

function HudOverlay({
  store,
  touch,
  listOpen,
  lastPicked,
  onPause,
  onHelp,
  game,
}: {
  store: Store<Hud | null>;
  touch: boolean;
  listOpen: boolean;
  lastPicked: string | null;
  onPause: () => void;
  onHelp: () => void;
  game: { current: AisleZeroGame | null };
}) {
  const hud = useStore(store);
  if (!hud) return null;
  const pad = "pt-[max(env(safe-area-inset-top),8px)] pl-[max(env(safe-area-inset-left),8px)] pr-[max(env(safe-area-inset-right),8px)]";
  return (
    <>
      {/* crosshair */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 size-[5px] -translate-1/2 rounded-full bg-[#ebebd7]/70 shadow-[0_0_4px_#000]" />

      <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-4 ${pad}`}>
        <ShoppingList hud={hud} open={listOpen} touch={touch} lastPicked={lastPicked} />
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <p className={`g-hud max-w-full truncate px-3 py-1.5 font-semibold tracking-[0.04em] sm:px-5 sm:py-2 ${touch ? "text-xs" : "text-sm sm:text-base"}`}>{hud.objective}</p>
          {hud.alert && (
            <p
              role="status"
              className={`g-display px-3 py-1 text-sm tracking-[0.3em] sm:text-base ${hud.alert === "run" ? "animate-pulse text-[#ff3b30] [text-shadow:0_0_14px_#b3120c]" : "text-[#a9a48f]"}`}
            >
              {hud.alert === "run" ? "Run" : "It is near"}
            </p>
          )}
        </div>
        <div className="pointer-events-auto flex shrink-0 items-start gap-2">
          <div className="g-hud flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold tabular-nums" title="Cans to throw">
            <CanIcon /> {hud.cans}
          </div>
          <div className="flex flex-col gap-2">
            <IconButton onClick={onPause} label="Pause (Esc)" small={touch}>
              <Pause className="size-5 fill-current" />
            </IconButton>
            <IconButton onClick={() => game.current?.toggleMap()} label={hud.mapOpen ? "Close the map (Tab)" : "Store map (Tab)"} dim={!hud.mapOpen} small={touch}>
              <MapIcon className="size-5" />
            </IconButton>
            <SystemMenu onHelp={onHelp} small={touch} />
          </div>
        </div>
      </div>

      {/* stamina */}
      <div className={`pointer-events-none absolute w-40 sm:w-56 ${touch ? "bottom-[max(env(safe-area-inset-bottom),18px)] left-1/2 -translate-x-1/2" : "bottom-[max(env(safe-area-inset-bottom),18px)] left-4"}`}>
        {!touch && <span className="g-muted text-[11px] font-bold tracking-[0.25em] uppercase">Stamina</span>}
        <div className="mt-1 h-[7px] overflow-hidden rounded-full bg-white/12">
          <div className={`h-full rounded-full transition-[width] duration-100 ${hud.winded ? "bg-[#7a2a2a]" : "bg-[#b4b49c]"}`} style={{ width: `${hud.stamina}%` }} />
        </div>
      </div>

      {hud.prompt && (
        <div className="pointer-events-none absolute inset-x-0 top-[62%] flex justify-center px-4">
          <p className="g-hud flex items-center gap-2 px-4 py-1.5 text-base font-semibold tracking-[0.04em] sm:text-xl">
            {!touch && <Kbd>E</Kbd>}
            {touch && <Hand className="size-4" />}
            {hud.prompt}
          </p>
        </div>
      )}

      {!touch && (
        <p className="pointer-events-none absolute right-4 bottom-[max(env(safe-area-inset-bottom),16px)] text-right text-xs leading-relaxed text-[#a5a18d]/85">
          <span className="inline-flex items-center gap-1.5">
            {hud.flash ? <Flashlight className="size-3.5" /> : <FlashlightOff className="size-3.5" />} T light
          </span>
          {" · "}
          <span className={hud.crouch ? "text-[#93c5fd]" : ""}>C sneak{hud.crouch ? " (on)" : ""}</span>
          {" · "}Q throw · L list
        </p>
      )}

      {!hud.locked && <ClickToLook />}
      {hud.mapOpen && <MapOverlay game={game} />}
    </>
  );
}

function CanIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
      <rect x="4" y="2" width="8" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 5.5h8M4 10.5h8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** The shopping list: tap (or L) to fold it away. A row flashes when its item goes in the cart. */
function ShoppingList({ hud, open, touch, lastPicked }: { hud: Hud; open: boolean; touch: boolean; lastPicked: string | null }) {
  return (
    <div className={`g-hud pointer-events-auto shrink-0 border-l-[3px]! border-l-[#b3120c]! ${touch ? "max-w-[38%] px-2.5 py-1.5" : "min-w-56 px-4 py-2.5"}`}>
      <button
        type="button"
        onClick={() => records.set({ listOpen: !open })}
        aria-expanded={open}
        title="Show / hide the list (L)"
        className="flex w-full items-center gap-2 text-left text-[11px] font-bold tracking-[0.25em] text-[#e2524a] hover:text-[#ff6a5a]"
      >
        <ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="truncate">List</span>
        <span className="ml-auto pl-3 tracking-[0.08em] text-[#e6dfc9] tabular-nums">
          {hud.collected}/{ITEM_DEFS.length}
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <ul className={`min-h-0 overflow-hidden ${touch ? "text-[11px] leading-snug" : "mt-1 text-[15px] leading-normal"}`}>
          {ITEM_DEFS.map((def, i) => {
            const got = hud.got[i];
            return (
              <li key={def.id} className={`flex items-start gap-2 rounded-sm px-1 py-0.5 transition-colors duration-700 ${lastPicked === def.id ? "bg-[#ffdc78]/40" : ""}`}>
                <span className="mt-[0.45em] size-2 shrink-0 rounded-full" style={{ background: got ? "#4d6445" : hex(def.color) }} />
                <span className="min-w-0">
                  <b className={`block truncate font-semibold ${got ? "text-[#6f9a5c] line-through" : ""}`}>{def.name}</b>
                  {!touch && <small className={`block text-[12.5px] ${got ? "text-[#4d6445]" : "text-[#a5a18d]"}`}>{def.where}</small>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Desktop: the mouse isn't captured (after Esc, or before the first click). */
function ClickToLook() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
      <p className="g-hud flex items-center gap-2 px-4 py-2 text-sm font-semibold">
        <Eye className="size-4" /> Click to look around
      </p>
    </div>
  );
}

/** The store map, drawn by the engine at the screen's density. */
function MapOverlay({ game }: { game: { current: AisleZeroGame | null } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = ref.current;
      const g = c?.getContext("2d");
      const box = c?.closest<HTMLElement>("[data-map]");
      if (!c || !g || !box) return;
      // as big as fits (86% of the frame, at most 720 px tall), at the store's 72 × 94 proportions
      const ch = Math.min(box.clientHeight * 0.86, 720, ((box.clientWidth * 0.94) / 72) * 94);
      c.style.height = `${ch}px`;
      c.style.width = `${(ch / 94) * 72}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round((ch / 94) * 72 * dpr);
      const h = Math.round(ch * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      game.current?.drawMap(g, w, h);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [game]);
  return (
    <div data-map className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35">
      <div className="relative">
        <canvas ref={ref} className="block border-2 border-[#4b5a4b] shadow-[0_0_40px_#000]" />
        <p className="g-display absolute top-2 left-3 text-xs tracking-[0.2em] text-[#cfd8b0]">Store map</p>
      </div>
    </div>
  );
}

// --- Result ------------------------------------------------------------------------------------------------

function ResultCard({ result, onRetry, onMenu }: { result: Result & { best: boolean }; onRetry: () => void; onMenu: () => void }) {
  const won = result.won;
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/70 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label={won ? "Escaped" : "It got you"} className="g-panel w-full max-w-md p-6 text-center">
          <p className="g-display text-xs tracking-[0.4em] text-[var(--accent)]">{won ? "You made it out" : "The cart stands alone"}</p>
          <h2 className={`g-title mt-2 text-5xl sm:text-6xl ${won ? "text-[#8cc08a]! [text-shadow:0_0_30px_rgb(60_160_60/.5)]!" : ""}`}>{won ? "Escaped" : "It got you"}</h2>
          <p className="mt-3 text-sm leading-relaxed">{result.line}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="g-tint rounded-[3px] px-2 py-2">
              <dt className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">Items</dt>
              <dd className="g-display text-lg tabular-nums">
                {result.collected}/{ITEM_DEFS.length}
              </dd>
            </div>
            <div className="g-tint rounded-[3px] px-2 py-2">
              <dt className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">Time</dt>
              <dd className="g-display text-lg tabular-nums">{fmtTime(result.time)}</dd>
            </div>
          </dl>
          {won && result.best && <p className="g-display mt-3 text-sm text-[var(--accent)]">Your fastest escape</p>}
          {!won && <p className="g-muted mt-3 text-xs">Tip: hide in a locker marked HIDE when it hunts you, and switch your light off to slip past.</p>}
          <div className="mt-5 space-y-2">
            <BigButton onClick={onRetry} autoFocus icon={won ? <DoorOpen className="size-5" /> : <Skull className="size-5" />}>
              {won ? "Play again" : "Try again"}
            </BigButton>
            <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
              Main menu
            </SoftButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Touch controls ------------------------------------------------------------------------------------------

/**
 * Left side: drag to walk (push all the way to run). Right side: swipe to look. Buttons on the right.
 * `turned`: the page is turned 90° (a phone held upright), so screen coordinates are turned back first.
 */
function TouchControls({ game, store, turned }: { game: { current: AisleZeroGame | null }; store: Store<Hud | null>; turned: boolean }) {
  const hud = useStore(store);
  const stickRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const R = 52;
  /** Screen → game-frame coordinates. */
  const at = (e: ReactPointerEvent) => (turned ? { x: e.clientY, y: window.innerWidth - e.clientX } : { x: e.clientX, y: e.clientY });

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    stickRef.current = { id: e.pointerId, ...p };
    setKnob({ ox: p.x, oy: p.y, x: 0, y: 0 });
  };
  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    const p = at(e);
    let dx = p.x - s.x;
    let dy = p.y - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    game.current?.setStick(dx / R, -dy / R, l >= R * 0.98);
    setKnob({ ox: s.x, oy: s.y, x: dx, y: dy });
  };
  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    stickRef.current = null;
    game.current?.setStick(0, 0, false);
    setKnob(null);
  };

  const onLookDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    lookRef.current = { id: e.pointerId, ...at(e) };
  };
  const onLookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = lookRef.current;
    if (!l || l.id !== e.pointerId) return;
    const p = at(e);
    game.current?.look(p.x - l.x, p.y - l.y, 0.0048);
    l.x = p.x;
    l.y = p.y;
  };
  const onLookUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookRef.current?.id === e.pointerId) lookRef.current = null;
  };

  return (
    <>
      <div className="absolute inset-y-0 left-0 w-[45%] touch-none" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp} aria-label="Move">
        {knob ? (
          <div className="pointer-events-none fixed" style={{ left: knob.ox - R - 6, top: knob.oy - R - 6 }}>
            <div className="relative rounded-full border-2 border-[#e6e6d2]/35 bg-black/25" style={{ width: (R + 6) * 2, height: (R + 6) * 2 }}>
              <div className="absolute size-12 rounded-full bg-[#e6e6d2]/45" style={{ left: R + 6 - 24 + knob.x, top: R + 6 - 24 + knob.y }} />
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),22px)] left-[max(env(safe-area-inset-left),22px)] grid size-28 place-items-center rounded-full border-2 border-[#e6e6d2]/20 bg-black/20">
            <Footprints className="size-6 text-[#e6e6d2]/40" />
          </div>
        )}
      </div>
      <div className="absolute inset-y-0 right-0 w-[55%] touch-none" onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} aria-label="Look around" />
      <div className="pointer-events-none absolute right-[max(env(safe-area-inset-right),14px)] bottom-[max(env(safe-area-inset-bottom),14px)] h-[176px] w-[190px]">
        <TouchButton className={`right-0 bottom-0 size-[78px] ${hud?.prompt ? "border-[#e2261a]! bg-[#96140a]/60!" : ""}`} onDown={() => game.current?.act()} label="Use">
          <Hand className="size-6" />
          <span className="text-[10px] font-bold tracking-[0.06em]">Use</span>
        </TouchButton>
        <TouchButton className={`right-[90px] bottom-0 size-14 ${hud?.crouch ? "border-[#93c5fd]! bg-[#1e3a8a]/70!" : ""}`} onDown={() => game.current?.toggleCrouch()} label="Sneak">
          <Footprints className="size-5" />
          <span className="text-[9px] font-bold">Sneak</span>
        </TouchButton>
        <TouchButton className={`right-[90px] bottom-[66px] size-14 ${hud?.flash ? "" : "opacity-60"}`} onDown={() => game.current?.toggleFlash()} label="Light">
          {hud?.flash ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
          <span className="text-[9px] font-bold">Light</span>
        </TouchButton>
        <TouchButton className="right-[11px] bottom-[90px] size-14" onDown={() => game.current?.throwCan()} label="Throw">
          <CanIcon />
          <span className="text-[9px] font-bold">Throw</span>
        </TouchButton>
      </div>
    </>
  );
}

function TouchButton({ className, onDown, label, children }: { className: string; onDown: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto absolute flex touch-none flex-col items-center justify-center gap-0.5 rounded-full border-2 border-[#e6e6d2]/40 bg-black/45 text-[#e6dfc9] transition active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}
