"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ChevronRight, ChevronsUp, CircleHelp, Coins, Crosshair, FastForward, Gamepad2, Heart, Home, Pause, Play, RotateCcw, Skull, Snowflake, Star, Swords, Trophy, X } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { above, ControlLayer, ControlsButton, ControlsEditor, createControls } from "../shared/touch-layout";
import {
  BigButton,
  createRecords,
  createStore,
  formatNumber,
  FullscreenButton,
  GameRoot,
  GameTitle,
  HowToPlay,
  IconButton,
  Kbd,
  LoadingScreen,
  Modal,
  RotateButton,
  SoftButton,
  Stat,
  SystemButtons,
  useRecords,
  useShortcuts,
  useStore,
  useTouchScreen,
  type Store,
} from "../shared/ui";
import { SaucerSiegeGame, type Banner, type Hud, type Phase, type Result } from "./engine";
import { GAME } from "./manifest";
import { MAPS, TOWER_KINDS, TOWERS, type TowerKind } from "./rules";

interface MapRecord {
  best: number;
  stars: number;
  wins: number;
}

const records = createRecords("saucer-siege:v1", { maps: {} as Record<string, MapRecord>, map: 0, plays: 0 });

const EMPTY_HUD: Hud = {
  gold: 0,
  lives: 20,
  maxLives: 20,
  wave: 0,
  waves: 15,
  countdown: -1,
  bonus: 0,
  speed: 1,
  alive: 0,
  armed: null,
  cell: false,
  tower: null,
  boss: null,
  next: null,
  towers: 0,
};

const PAN_KEYS: Record<string, string> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
};

export function SaucerSiege({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SaucerSiegeGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(Result & { newBest: boolean }) | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [icons, setIcons] = useState<Partial<Record<TowerKind, string>>>({});
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const touch = useTouchScreen();
  const saved = useRecords(records);
  const mapIndex = Math.min(MAPS.length - 1, Math.max(0, saved.map));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new SaucerSiegeGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      banner: setBanner,
      icons: setIcons,
      result: (r) => {
        const before = records.get();
        const id = MAPS[r.map].id;
        const prev = before.maps[id] ?? { best: 0, stars: 0, wins: 0 };
        const newBest = r.won ? r.stars > prev.stars || prev.wins === 0 : r.wave > prev.best;
        records.set({
          maps: { ...before.maps, [id]: { best: Math.max(prev.best, r.wave), stars: Math.max(prev.stars, r.stars), wins: prev.wins + (r.won ? 1 : 0) } },
          plays: before.plays + 1,
        });
        setResult({ ...r, newBest });
      },
    });
    gameRef.current = game;
    void game.load(modelSizes, Math.min(MAPS.length - 1, Math.max(0, records.get().map)));
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  // Banners fade out by themselves.
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 2800);
    return () => clearTimeout(id);
  }, [banner]);

  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  const start = useCallback(
    (index = mapIndex) => {
      const game = gameRef.current;
      if (!game) return;
      blur();
      records.set({ map: index });
      setResult(null);
      setHelp(false);
      game.start(index);
    },
    [mapIndex],
  );

  const toMenu = () => {
    setResult(null);
    setBanner(null);
    gameRef.current?.toMenu();
  };

  const chooseMap = (index: number) => {
    records.set({ map: index });
    gameRef.current?.setMap(index);
  };

  const pauseOrResume = useCallback(() => {
    const game = gameRef.current;
    blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (editing) {
      setEditing(false);
      return;
    }
    if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
  }, [help, editing, phase]);

  const openHelp = useCallback(() => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  }, [phase]);

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Game keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || editing) return;
      const k = e.key.toLowerCase();
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (phase === "playing") {
        if (PAN_KEYS[k]) {
          e.preventDefault();
          game.setKey(PAN_KEYS[k], true);
          return;
        }
        if (e.repeat) return;
        const kind = TOWER_KINDS.find((t) => TOWERS[t].hotkey === k);
        if (kind) game.pickKind(kind);
        else if (k === "u") game.upgrade();
        else if (k === "x" || k === "delete") game.sell();
        else if (k === "q") game.deselect();
        else if (k === " ") {
          e.preventDefault();
          blur();
          game.callWave();
        } else if (k === "t") game.cycleSpeed();
        else if (k === "+" || k === "=") game.zoom(1);
        else if (k === "-" || k === "_") game.zoom(-1);
      } else if (phase === "paused") {
        if ((k === "enter" || k === " ") && !onButton) {
          e.preventDefault();
          game.resume();
        }
      } else if (phase === "menu") {
        if (k === "enter" && !onButton) {
          e.preventDefault();
          start();
        } else if (k === "arrowleft" || k === "arrowright") {
          e.preventDefault();
          chooseMap((mapIndex + (k === "arrowleft" ? MAPS.length - 1 : 1)) % MAPS.length);
        }
      } else if (phase === "won" || phase === "lost") {
        if (k === "enter" && !onButton && result) {
          e.preventDefault();
          start(result.won && result.map < MAPS.length - 1 ? result.map + 1 : result.map);
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const dir = PAN_KEYS[e.key.toLowerCase()];
      if (dir) gameRef.current?.setKey(dir, false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Leaving the tab or window pauses the game.
  useEffect(() => {
    const pause = () => {
      const game = gameRef.current;
      if (!game) return;
      for (const dir of ["up", "down", "left", "right"]) game.setKey(dir, false);
      game.pause();
    };
    const onVisibility = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, []);

  const inGame = phase === "playing" || phase === "paused";

  return (
    <GameRoot game={GAME} className="bg-[#2b2350]">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Saucer Siege game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !editing && (
        <MenuScreen mapIndex={mapIndex} maps={saved.maps} onMap={chooseMap} onPlay={() => start()} onHelp={() => setHelp(true)} onControls={() => setEditing(true)} />
      )}

      {/* From the title screen the controls editor shows the HUD behind it, so the bar keeps clear of it. */}
      {(inGame || (phase === "menu" && editing)) && (
        <HudOverlay
          store={hud}
          icons={icons}
          editing={editing}
          paused={phase === "paused"}
          firstGame={saved.plays === 0}
          onPause={pauseOrResume}
          game={gameRef}
        />
      )}

      {banner && inGame && <BannerView key={banner.id} banner={banner} />}

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={() => start(mapIndex)} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
          <div className="flex justify-center">
            <SystemButtons />
          </div>
        </Modal>
      )}
      {(phase === "paused" || phase === "menu") && editing && (
        <ControlsEditor controls={barControls} face={() => <Bar hud={hud.get()} icons={icons} game={gameRef} />} onClose={() => setEditing(false)} />
      )}

      {(phase === "won" || phase === "lost") && result && !help && (
        <ResultModal result={result} onRetry={() => start(result.map)} onNext={() => start(result.map + 1)} onMenu={toMenu} />
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Menu -----------------------------------------------------------------------------------------

function Stars({ n, size = "size-4", className = "" }: { n: number; size?: string; className?: string }) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`} aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${size} ${i < n ? "fill-amber-300 text-amber-300" : "opacity-30"}`} />
      ))}
    </span>
  );
}

const DIFF_TONE: Record<string, string> = {
  Easy: "bg-emerald-400 text-emerald-950",
  Medium: "bg-amber-300 text-amber-950",
  Hard: "bg-rose-400 text-rose-950",
};

function MenuScreen({
  mapIndex,
  maps,
  onMap,
  onPlay,
  onHelp,
  onControls,
}: {
  mapIndex: number;
  maps: Record<string, MapRecord>;
  onMap: (i: number) => void;
  onPlay: () => void;
  onHelp: () => void;
  onControls: () => void;
}) {
  const map = MAPS[mapIndex];
  const rec = maps[map.id];
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="px-4 pt-1 text-center sm:pt-2">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-xs tracking-[0.18em] text-white uppercase [text-shadow:0_0_10px_#7c3aed,0_2px_6px_rgb(0_0_0/0.6)] sm:text-sm">
          Build towers · shoot down the saucers · save the valley
        </p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-xl space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Map">
          {MAPS.map((m, i) => {
            const r = maps[m.id];
            const active = i === mapIndex;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onMap(i)}
                className={`g-hud px-2 py-2.5 text-center transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:px-3 ${
                  active ? "shadow-[0_0_0_2px_var(--accent),0_0_24px_color-mix(in_srgb,var(--accent)_60%,transparent)]" : "opacity-85 hover:opacity-100"
                }`}
              >
                <span className={`g-display inline-block rounded-[var(--g-hud-radius)] px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase ${DIFF_TONE[m.difficulty]}`}>
                  {m.difficulty}
                </span>
                <span className="g-display mt-1.5 block text-[13px] leading-tight font-bold sm:text-base">{m.name}</span>
                <span className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold opacity-70">
                  {r?.wins ? <Stars n={r.stars} size="size-3.5" /> : r?.best ? `Best: wave ${r.best}` : `${m.waves} waves`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="g-hud min-h-10 px-4 py-2 text-center text-sm">
          {map.blurb}
          {rec && (
            <span className="opacity-70">
              {rec.wins ? ` Cleared ${rec.wins}×.` : ""} Best wave {rec.best}/{map.waves}.
            </span>
          )}
        </p>

        <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
          Defend {map.name.split(" ").pop()}
        </BigButton>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
          <button type="button" onClick={onHelp} className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <CircleHelp className="size-3.5" /> How to play
          </button>
          <span className="g-hud hidden items-center gap-1.5 px-3 py-1.5 sm:inline-flex">← → map · Enter play · 1–4 towers · Space next wave</span>
        </div>
      </div>
    </div>
  );
}

// --- HUD ------------------------------------------------------------------------------------------

function TowerIcon({ src, className = "" }: { src?: string; className?: string }) {
  return <span aria-hidden className={`block bg-contain bg-center bg-no-repeat ${className}`} style={src ? ({ backgroundImage: `url(${src})` } as CSSProperties) : undefined} />;
}

function HudOverlay({
  store,
  icons,
  editing,
  paused,
  firstGame,
  onPause,
  game,
}: {
  store: Store<Hud>;
  icons: Partial<Record<TowerKind, string>>;
  /** The controls editor is open: it draws its own copy of the bar. */
  editing: boolean;
  paused: boolean;
  firstGame: boolean;
  onPause: () => void;
  game: RefObject<SaucerSiegeGame | null>;
}) {
  const hud = useStore(store);
  const lowLives = hud.lives <= 5;
  return (
    <>
      {/* Top bar. `data-avoid`: the bottom bar keeps clear of these (shared/touch-layout.tsx). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 pt-[max(env(safe-area-inset-top),10px)] sm:p-4">
        <div data-avoid className="g-hud flex items-center gap-1 p-1 sm:gap-1.5 pointer-coarse:gap-0.5 pointer-coarse:p-0.5">
          <HudStat icon={<Coins className="size-4 text-amber-300" />} value={formatNumber(hud.gold)} label="Gold" />
          <HudStat icon={<Heart className={`size-4 fill-rose-400 text-rose-400 ${lowLives ? "animate-pulse" : ""}`} />} value={hud.lives} label="Lives" warn={lowLives} />
          <HudStat icon={<Swords className="size-4 text-[var(--accent)]" />} value={`${hud.wave}/${hud.waves}`} label="Wave" />
        </div>
        <div data-avoid className="pointer-events-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <SystemButtons />
          </div>
          <FullscreenButton className="sm:hidden" />
          <RotateButton className="sm:hidden" />
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
        </div>
      </div>

      {hud.boss !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(max(env(safe-area-inset-top),10px)+52px)] flex justify-center px-4 sm:top-[72px]">
          <div className="g-hud w-full max-w-xs px-3 py-1.5">
            <p className="g-display text-center text-[10px] font-bold tracking-[0.3em] uppercase">Mothership</p>
            <div className="mt-1 h-2 overflow-hidden rounded-[var(--g-hud-radius)] bg-[color-mix(in_srgb,currentColor_15%,transparent)]">
              <div className="h-full bg-gradient-to-r from-fuchsia-400 to-violet-500 transition-[width] duration-200" style={{ width: `${hud.boss * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Bottom: the build bar / tower panel with the wave controls (movable: shared/touch-layout.tsx), and the hint just above it. */}
      <ControlLayer controls={barControls} hidden={editing}>
        {(placed, _frame, fit) => (
          <>
            <div className="pointer-events-none absolute flex w-max max-w-[90vw] justify-center" style={above(placed.bar)}>
              <Hint hud={hud} firstGame={firstGame} />
            </div>
            {fit("bar", <Bar hud={hud} icons={icons} game={game} />)}
          </>
        )}
      </ControlLayer>
    </>
  );
}

/** The bottom bar. Order = placement priority. */
const barControls = createControls("saucer-siege:controls:v1", {
  bar: { label: "Tower bar", w: 340, h: 110, x: 0, y: -64, center: true, fit: true },
});

function Bar({ hud, icons, game }: { hud: Hud; icons: Partial<Record<TowerKind, string>>; game: RefObject<SaucerSiegeGame | null> }) {
  const g = () => game.current;
  return (
    <div className="flex max-w-3xl flex-col items-stretch gap-2 sm:flex-row sm:items-end pointer-coarse:gap-1">
      <div className="pointer-events-auto flex-1">
        {hud.tower ? <TowerPanel hud={hud} icon={icons[hud.tower.kind]} game={game} /> : <BuildBar hud={hud} icons={icons} game={game} />}
      </div>
      <div className="pointer-events-auto flex gap-2 sm:w-48 sm:flex-col pointer-coarse:w-auto pointer-coarse:gap-1">
        {hud.next && <p className="g-hud hidden px-2 py-1 text-center text-[10px] leading-tight font-semibold sm:block pointer-coarse:hidden">Next: {hud.next}</p>}
        <WaveButton hud={hud} onCall={() => g()?.callWave()} />
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            g()?.cycleSpeed();
          }}
          title="Game speed (T)"
          className={`g-hud flex shrink-0 items-center justify-center gap-1.5 px-4 py-2.5 text-sm transition hover:brightness-125 pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-xs focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
            hud.speed > 1 ? "shadow-[0_0_0_2px_var(--accent),0_0_18px_color-mix(in_srgb,var(--accent)_55%,transparent)]" : ""
          }`}
        >
          <FastForward className="size-4 fill-current" />
          <span className="g-display font-bold">{hud.speed}×</span>
          <span className="ml-1 hidden sm:inline">
            <Kbd>T</Kbd>
          </span>
        </button>
      </div>
    </div>
  );
}

function HudStat({ icon, value, label, warn = false }: { icon: ReactNode; value: ReactNode; label: string; warn?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-[var(--g-hud-radius)] px-2 py-1 sm:px-2.5 pointer-coarse:gap-1 pointer-coarse:px-1.5 pointer-coarse:py-0.5 [&_svg]:pointer-coarse:size-3 ${warn ? "bg-rose-500/35" : "g-tint"}`} title={label}>
      {icon}
      <span className="sr-only">{label}</span>
      <span className="g-display text-sm font-bold tabular-nums sm:text-base pointer-coarse:text-xs">{value}</span>
    </div>
  );
}

function Hint({ hud, firstGame }: { hud: Hud; firstGame: boolean }) {
  let text: ReactNode = null;
  if (hud.armed) {
    text = (
      <>
        <span className="sm:hidden">Tap</span>
        <span className="hidden sm:inline">Click</span> empty tiles to build a <b>{TOWERS[hud.armed].name}</b> · <span className="hidden sm:inline">Q / right-click to cancel</span>
        <span className="sm:hidden">tap the button again to cancel</span>
      </>
    );
  } else if (hud.cell) text = <>Pick a tower for this tile</>;
  else if (firstGame && hud.wave === 0 && hud.towers === 0)
    text = (
      <>
        <span className="sm:hidden">Tap</span>
        <span className="hidden sm:inline">Click</span> an empty tile next to the road to build your first tower
      </>
    );
  if (!text) return null;
  return <p className="g-hud pointer-events-none px-4 py-1.5 text-center text-xs font-semibold sm:text-sm pointer-coarse:px-3 pointer-coarse:py-1 pointer-coarse:text-[11px]">{text}</p>;
}

function BuildBar({ hud, icons, game }: { hud: Hud; icons: Partial<Record<TowerKind, string>>; game: RefObject<SaucerSiegeGame | null> }) {
  return (
    <div
      className={`g-hud grid grid-cols-4 gap-1.5 p-1.5 transition sm:gap-2 sm:p-2 pointer-coarse:gap-1 pointer-coarse:p-1 ${
        hud.cell ? "shadow-[0_0_0_2px_var(--accent),0_0_26px_color-mix(in_srgb,var(--accent)_55%,transparent)]" : ""
      }`}
    >
      {TOWER_KINDS.map((kind) => {
        const def = TOWERS[kind];
        const afford = hud.gold >= def.cost;
        const armed = hud.armed === kind;
        return (
          <button
            key={kind}
            type="button"
            data-active={armed}
            onClick={(e) => {
              e.currentTarget.blur();
              game.current?.pickKind(kind);
            }}
            onPointerEnter={() => game.current?.previewKind(kind)}
            onPointerLeave={() => game.current?.previewKind(null)}
            onFocus={() => game.current?.previewKind(kind)}
            onBlur={() => game.current?.previewKind(null)}
            title={`${def.name} — ${def.blurb} (${def.hotkey})`}
            className={`g-soft relative px-1 pt-1 pb-1.5 transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:px-2 sm:py-1.5 pointer-coarse:px-1.5 pointer-coarse:py-1 ${armed ? "brightness-125" : ""} ${afford ? "" : "opacity-50"}`}
          >
            <span className="g-unskew w-full flex-col sm:flex-row sm:justify-start sm:gap-2 sm:text-left pointer-coarse:flex-col pointer-coarse:gap-0 pointer-coarse:text-center">
              <span className="g-display absolute top-1 left-1.5 hidden text-[10px] opacity-55 sm:block pointer-coarse:hidden">{def.hotkey}</span>
              <TowerIcon src={icons[kind]} className="size-11 shrink-0 sm:size-12 pointer-coarse:size-7" />
              <span className="min-w-0">
                <span className="g-display block truncate text-[11px] leading-tight font-bold sm:text-xs pointer-coarse:text-[10px]">{def.name}</span>
                <span className={`g-display flex items-center justify-center gap-1 text-xs font-bold tabular-nums sm:justify-start pointer-coarse:justify-center pointer-coarse:text-[10px] ${afford ? "text-amber-300" : "text-rose-300"}`}>
                  <Coins className="size-3" />
                  {def.cost}
                </span>
                <span className="hidden text-[10px] leading-tight opacity-65 lg:block">{def.blurb}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TowerPanel({ hud, icon, game }: { hud: Hud; icon?: string; game: RefObject<SaucerSiegeGame | null> }) {
  const t = hud.tower!;
  const def = TOWERS[t.kind];
  const canUpgrade = t.upgrade !== null && hud.gold >= t.upgrade;
  const next = t.level < 2 ? def.levels[t.level + 1] : null;
  return (
    <div className="g-panel flex items-center gap-2 p-2 sm:gap-3 pointer-coarse:gap-1.5 pointer-coarse:p-1.5">
      <TowerIcon src={icon} className="hidden size-14 shrink-0 sm:block pointer-coarse:hidden" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="g-panel-title text-xs whitespace-nowrap sm:text-base">{def.name}</p>
          <Stars n={t.level + 1} size="size-3" />
          {t.frozen && (
            <span className="inline-flex items-center gap-1 rounded-[var(--g-hud-radius)] bg-cyan-300 px-1.5 py-0.5 text-[10px] font-black text-cyan-950 uppercase">
              <Snowflake className="size-3" /> Frozen
            </span>
          )}
        </div>
        <div className="g-muted mt-0.5 flex flex-wrap gap-x-3 text-[11px] font-semibold tabular-nums">
          <span>
            Dmg {Math.round(t.damage)}
            {next && <span className="text-emerald-300"> →{Math.round(next.damage)}</span>}
          </span>
          <span>Rate {t.rate.toFixed(1)}/s</span>
          <span>
            Range {t.range.toFixed(1)}
            {next && <span className="text-emerald-300"> →{next.range.toFixed(1)}</span>}
          </span>
          {t.splash > 0 && <span>Splash</span>}
          <span className="inline-flex items-center gap-0.5">
            <Crosshair className="size-3" /> {t.kills}
          </span>
        </div>
      </div>
      <button
        type="button"
        disabled={t.upgrade === null}
        onClick={(e) => {
          e.currentTarget.blur();
          game.current?.upgrade();
        }}
        title="Upgrade (U)"
        className={`${canUpgrade ? "g-btn" : "g-soft"} px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-60 sm:px-4 pointer-coarse:px-2 pointer-coarse:py-1 pointer-coarse:text-[10px]`}
      >
        <span className="g-unskew flex-col">
          <span className="flex items-center gap-1">
            <ChevronsUp className="size-4" /> {t.upgrade === null ? "Max" : "Upgrade"}
          </span>
          {t.upgrade !== null && (
            <span className={`flex items-center gap-0.5 tabular-nums ${canUpgrade ? "" : "text-rose-300"}`}>
              <Coins className="size-3" />
              {t.upgrade}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          game.current?.sell();
        }}
        title="Sell (X)"
        className="g-soft px-3 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:px-2 pointer-coarse:py-1 pointer-coarse:text-[10px]"
      >
        <span className="g-unskew flex-col">
          <span className="g-display">Sell</span>
          <span className="text-amber-300 tabular-nums">+{t.sell}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          game.current?.deselect();
        }}
        aria-label="Close (Q)"
        title="Close (Q)"
        className="g-soft grid size-9 shrink-0 place-items-center focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:size-7"
      >
        <span className="g-unskew">
          <X className="size-4" />
        </span>
      </button>
    </div>
  );
}

function WaveButton({ hud, onCall }: { hud: Hud; onCall: () => void }) {
  const done = hud.wave >= hud.waves;
  const ready = hud.countdown >= 0 && !done;
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={(e) => {
        e.currentTarget.blur();
        onCall();
      }}
      title={hud.next ? `Next wave: ${hud.next} — call it early for bonus gold (Space)` : "Call the next wave early for bonus gold (Space)"}
      className={`${ready ? "g-btn" : "g-hud"} flex min-w-0 flex-1 items-center justify-center px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:px-2 pointer-coarse:py-1`}
    >
      {ready ? (
        <span className="g-unskew gap-2">
          <ChevronRight className="size-5 shrink-0 pointer-coarse:size-4" />
          <span className="min-w-0">
            <span className="block text-[13px] leading-tight whitespace-nowrap pointer-coarse:text-[11px]">{hud.wave === 0 ? "Wave 1" : `Wave ${hud.wave + 1} · ${hud.countdown}s`}</span>
            <span className="block text-[10px] leading-tight whitespace-nowrap opacity-80 pointer-coarse:text-[9px]">
              {hud.next?.startsWith("Mothership") ? "Mothership! " : "Go now "}
              {hud.bonus > 0 ? `+${hud.bonus}` : ""}
            </span>
          </span>
        </span>
      ) : (
        <span className="min-w-0 text-center">
          <span className="g-display block text-[13px] leading-tight font-bold pointer-coarse:text-[11px]">{done ? "Final wave" : `Wave ${hud.wave}`}</span>
          <span className="block text-[11px] leading-tight opacity-70 pointer-coarse:text-[9px]">{hud.alive} saucers left</span>
        </span>
      )}
    </button>
  );
}

function BannerView({ banner }: { banner: Banner }) {
  const tone = banner.tone === "boss" ? "g-title-accent" : banner.tone === "good" ? "text-emerald-200" : banner.tone === "bad" ? "text-rose-300" : "";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center px-4">
      <div className="animate-[saucer-banner_2.8s_ease_forwards] text-center">
        <p className={`g-title text-3xl sm:text-5xl pointer-coarse:text-2xl ${tone}`}>
          {banner.tone === "boss" && <Skull className="mr-2 inline size-8 align-[-4px] sm:size-10" />}
          {banner.title}
        </p>
        {banner.sub && <p className="g-display mt-2 text-xs tracking-[0.12em] text-white uppercase [text-shadow:0_0_8px_#7c3aed,0_2px_6px_rgb(0_0_0/0.7)] sm:text-sm pointer-coarse:mt-1 pointer-coarse:text-[10px]">{banner.sub}</p>}
      </div>
      <style>{`@keyframes saucer-banner{0%{opacity:0;transform:translateY(-12px) scale(.92)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}`}</style>
    </div>
  );
}

// --- Results --------------------------------------------------------------------------------------

function ResultModal({ result, onRetry, onNext, onMenu }: { result: Result & { newBest: boolean }; onRetry: () => void; onNext: () => void; onMenu: () => void }) {
  const map = MAPS[result.map];
  const hasNext = result.won && result.map < MAPS.length - 1;
  const minutes = Math.floor(result.time / 60);
  const seconds = Math.floor(result.time % 60);
  return (
    <Modal title={result.won ? "Valley saved!" : "The keep has fallen"} wide>
      <div className="text-center">
        {result.won ? <Stars n={result.stars} size="size-9" className="justify-center" /> : <p className="g-muted text-sm font-semibold">You held out until wave {result.wave} of {result.waves}.</p>}
        <p className="g-muted g-display mt-1 text-xs tracking-[0.15em] uppercase">{map.name}</p>
        {result.newBest && (
          <p className="g-display mx-auto mt-2 inline-flex items-center gap-1.5 rounded-[var(--g-hud-radius)] bg-amber-400 px-3 py-1 text-xs font-bold tracking-wider text-amber-950 uppercase">
            <Trophy className="size-3.5" /> New best
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Wave" value={`${result.wave}/${result.waves}`} />
        <Stat label="Saucers" value={formatNumber(result.kills)} />
        <Stat label="Gold earned" value={formatNumber(result.gold)} />
        <Stat label={result.won ? "Lives left" : "Time"} value={result.won ? `${result.lives}/${result.maxLives}` : `${minutes}:${String(seconds).padStart(2, "0")}`} />
      </div>
      {hasNext ? (
        <BigButton onClick={onNext} icon={<ChevronRight className="size-6" />} autoFocus>
          Next: {MAPS[result.map + 1].name}
        </BigButton>
      ) : (
        <BigButton onClick={onRetry} icon={<RotateCcw className="size-5" />} autoFocus>
          {result.won ? "Play again" : "Try again"}
        </BigButton>
      )}
      <div className="grid grid-cols-2 gap-2">
        {hasNext ? (
          <SoftButton onClick={onRetry} icon={<RotateCcw className="size-4" />}>
            Replay
          </SoftButton>
        ) : (
          <SoftButton onClick={onMenu} icon={<Trophy className="size-4" />}>
            Other maps
          </SoftButton>
        )}
        <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
          Menu
        </SoftButton>
      </div>
    </Modal>
  );
}
