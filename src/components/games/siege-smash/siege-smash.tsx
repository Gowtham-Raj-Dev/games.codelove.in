"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Bomb, ChevronRight, CircleHelp, Gamepad2, LayoutGrid, Lock, Pause, Play, RotateCcw, Skull, Split, Star } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { above, ControlLayer, ControlsButton, ControlsEditor, createControls } from "../shared/touch-layout";
import {
  BigButton,
  createRecords,
  createStore,
  formatNumber,
  GameRoot,
  GameTitle,
  HowToPlay,
  IconButton,
  LoadingScreen,
  Modal,
  SoftButton,
  Stat,
  SystemButtons,
  useRecords,
  useShortcuts,
  useStore,
  useTouchScreen,
  type Store,
} from "../shared/ui";
import { SiegeSmashGame, type Hud, type LevelResult, type Phase } from "./engine";
import { LEVELS, REGIONS, ammoTotal } from "./levels";
import { GAME } from "./manifest";
import { AMMO, AMMO_ORDER, type AmmoKind } from "./pieces";

const records = createRecords("siege-smash:v1", { stars: [] as number[], best: [] as number[], last: 0, plays: 0 });

const EMPTY_HUD: Hud = {
  level: 0,
  score: 0,
  defenders: 0,
  total: 0,
  ammo: { boulder: 0, bomb: 0, splitter: 0 },
  selected: "boulder",
  shotsUsed: 0,
  shotsLeft: 0,
  stage: "intro",
  power: 0,
  angle: 0,
  aiming: false,
  canSplit: false,
};

const totalStars = (stars: number[]) => stars.reduce((n, s) => n + (s ?? 0), 0);
const regionOpen = (region: number, stars: number[]) => totalStars(stars) >= REGIONS[region].stars;
const firstOfRegion = (region: number) => LEVELS.findIndex((l) => l.region === region);

function levelOpen(index: number, stars: number[]) {
  const level = LEVELS[index];
  if (!level || !regionOpen(level.region, stars)) return false;
  return index === firstOfRegion(level.region) || (stars[index - 1] ?? 0) > 0 || (stars[index] ?? 0) > 0;
}

/** The level the Play button suggests: the first open one without stars, else the last played. */
function suggestedLevel(stars: number[], last: number) {
  const next = LEVELS.findIndex((_, i) => levelOpen(i, stars) && !(stars[i] > 0));
  return next >= 0 ? next : Math.min(last, LEVELS.length - 1);
}

export function SiegeSmash({ sizes }: { sizes: Record<string, number> }) {
  // A re-render passes a new object; keep the first one so the game is not rebuilt.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SiegeSmashGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(LevelResult & { newBest: boolean; firstClear: boolean }) | null>(null);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const touch = useTouchScreen();
  const [selected, setSelected] = useState(0);
  const [levelKey, setLevelKey] = useState(0);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new SiegeSmashGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      result: (r) => {
        const before = records.get();
        const stars = [...before.stars];
        const best = [...before.best];
        const firstClear = r.won && !(stars[r.level] > 0);
        const newBest = r.won && r.score > (best[r.level] ?? 0);
        if (r.won) {
          stars[r.level] = Math.max(stars[r.level] ?? 0, r.stars);
          best[r.level] = Math.max(best[r.level] ?? 0, r.score);
        }
        records.set({ stars, best, last: r.level, plays: before.plays + 1 });
        setResult({ ...r, newBest, firstClear });
      },
    });
    gameRef.current = game;
    const saved = records.get();
    const first = suggestedLevel(saved.stars, saved.last);
    setSelected(first);
    void game.load(modelSizes, first);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  const startLevel = (index: number) => {
    const game = gameRef.current;
    if (!game || !levelOpen(index, records.get().stars)) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setHelp(false);
    setSelected(index);
    setLevelKey((k) => k + 1);
    game.startLevel(index);
  };

  const selectLevel = (index: number) => {
    if (!levelOpen(index, records.get().stars)) {
      gameRef.current?.sfx.denied();
      return;
    }
    setSelected(index);
    gameRef.current?.sfx.select();
    gameRef.current?.showLevel(index);
  };

  const toMenu = () => {
    const game = gameRef.current;
    setResult(null);
    if (!game) return;
    const index = game.currentLevel;
    const next = result?.won && levelOpen(index + 1, records.get().stars) ? index + 1 : index;
    setSelected(next);
    game.toMenu();
    if (next !== index) game.showLevel(next);
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
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
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  const nextLevel = () => {
    const game = gameRef.current;
    if (!game) return;
    const next = game.currentLevel + 1;
    if (next < LEVELS.length && levelOpen(next, records.get().stars)) startLevel(next);
    else toMenu();
  };

  // Game keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || editing) return;
      const down = e.type === "keydown";
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (phase === "playing") {
        if (down && e.code === "KeyR" && !e.repeat) {
          startLevel(game.currentLevel);
          return;
        }
        if (game.key(e.code, down, e.repeat)) e.preventDefault();
        return;
      }
      if (!down) {
        game.key(e.code, false);
        return;
      }
      const confirm = (e.key === "Enter" || e.key === " ") && !onButton;
      if (phase === "paused") {
        if (confirm) {
          e.preventDefault();
          game.resume();
        } else if (e.code === "KeyR") startLevel(game.currentLevel);
      } else if (phase === "menu") {
        if (confirm) {
          e.preventDefault();
          startLevel(selected);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          for (let i = selected + dir; i >= 0 && i < LEVELS.length; i += dir) {
            if (levelOpen(i, records.get().stars)) {
              selectLevel(i);
              break;
            }
          }
        }
      } else if (phase === "won") {
        if (confirm) {
          e.preventDefault();
          nextLevel();
        } else if (e.code === "KeyR") startLevel(game.currentLevel);
      } else if (phase === "lost") {
        if (confirm || e.code === "KeyR") {
          e.preventDefault();
          startLevel(game.currentLevel);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  });

  // Leaving the tab or window pauses the level.
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

  // Pointer input on the 3D view (aim drags, taps, camera gestures).
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    gameRef.current?.pointerDown(e.pointerId, e.clientX, e.clientY, e.button);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => gameRef.current?.pointerMove(e.pointerId, e.clientX, e.clientY);
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => gameRef.current?.pointerUp(e.pointerId);
  const onPointerCancel = (e: ReactPointerEvent<HTMLCanvasElement>) => gameRef.current?.pointerCancel(e.pointerId);

  const running = phase === "playing" || phase === "paused";
  const level = LEVELS[result?.level ?? selected] ?? LEVELS[0];

  return (
    <GameRoot game={GAME} className="bg-[#cfe6f3]" onWheel={(e) => gameRef.current?.wheel(e.deltaY)}>
      <style>{"@keyframes siege-star{0%{opacity:0;transform:scale(0.2) rotate(-40deg)}70%{opacity:1;transform:scale(1.25) rotate(8deg)}100%{opacity:1;transform:scale(1)}}"}</style>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        aria-label="Siege Smash game"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !editing && (
        <MenuScreen
          stars={saved.stars}
          best={saved.best}
          selected={selected}
          onSelect={selectLevel}
          onPlay={() => startLevel(selected)}
          onHelp={() => setHelp(true)}
          onControls={() => setEditing(true)}
        />
      )}

      {/* From the title screen the controls editor shows the HUD behind it, so the ammo bar keeps clear of it. */}
      {(running || phase === "won" || phase === "lost" || (phase === "menu" && editing)) && (
        <HudOverlay
          key={levelKey}
          store={hud}
          editing={editing}
          paused={phase === "paused"}
          showControls={running}
          onPause={pauseOrResume}
          onRestart={() => startLevel(gameRef.current?.currentLevel ?? 0)}
          onAmmo={(k) => gameRef.current?.selectAmmo(k)}
          firstTime={saved.plays < 3}
        />
      )}

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={() => startLevel(gameRef.current?.currentLevel ?? 0)} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<LayoutGrid className="size-4" />}>
              Castles
            </SoftButton>
          </div>
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
        </Modal>
      )}
      {(phase === "paused" || phase === "menu") && editing && (
        <ControlsEditor controls={ammoControls} face={() => <AmmoBar hud={hud.get()} onAmmo={() => {}} />} onClose={() => setEditing(false)} />
      )}

      {phase === "won" && result && !help && (
        <Modal title="Castle taken!">
          <p className="g-display -mt-2 text-center text-sm opacity-80">
            {result.level + 1}. {level.name}
          </p>
          <StarRow stars={result.stars} />
          <div className="text-center">
            {result.newBest && (
              <p className="mx-auto mb-1 inline-block rounded-full bg-[var(--accent)] px-3 py-0.5 text-xs font-bold tracking-wider text-[#1a2e05] uppercase">New best</p>
            )}
            <p className="g-display text-5xl tabular-nums">{formatNumber(result.score)}</p>
            {result.bonus > 0 && (
              <p className="g-muted mt-1 text-xs font-bold">
                includes {formatNumber(result.bonus)} for {result.bonus / 10000} unused shot{result.bonus === 10000 ? "" : "s"}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Shots" value={result.shotsUsed} />
            <Stat label="Par" value={level.par} />
            <Stat label="Best" value={formatNumber(Math.max(saved.best[result.level] ?? 0, result.score))} />
          </div>
          {result.level + 1 < LEVELS.length && !levelOpen(result.level + 1, saved.stars) && (
            <p className="g-tint rounded-[var(--g-hud-radius)] px-3 py-2 text-center text-xs font-bold">
              <Lock className="mr-1 inline size-3.5" />
              {REGIONS[LEVELS[result.level + 1].region].name} opens at {REGIONS[LEVELS[result.level + 1].region].stars} stars — you have {totalStars(saved.stars)}.
            </p>
          )}
          {result.level + 1 < LEVELS.length && levelOpen(result.level + 1, saved.stars) ? (
            <>
              <BigButton onClick={nextLevel} icon={<ChevronRight className="size-6" />} autoFocus>
                Next castle
              </BigButton>
              <div className="grid grid-cols-2 gap-2">
                <SoftButton onClick={() => startLevel(result.level)} icon={<RotateCcw className="size-4" />}>
                  {result.stars < 3 ? "Retry for 3★" : "Retry"}
                </SoftButton>
                <SoftButton onClick={toMenu} icon={<LayoutGrid className="size-4" />}>
                  Castles
                </SoftButton>
              </div>
            </>
          ) : (
            <>
              <BigButton onClick={toMenu} icon={<LayoutGrid className="size-5" />} autoFocus>
                {result.level + 1 >= LEVELS.length ? "All castles taken!" : "Castles"}
              </BigButton>
              <SoftButton onClick={() => startLevel(result.level)} icon={<RotateCcw className="size-4" />}>
                {result.stars < 3 ? "Retry for 3★" : "Retry"}
              </SoftButton>
            </>
          )}
        </Modal>
      )}

      {phase === "lost" && result && !help && (
        <Modal title="Out of shots">
          <p className="text-center text-sm">
            <Skull className="mr-1 inline size-4" />
            {result.remaining} defender{result.remaining === 1 ? "" : "s"} still standing in {level.name}.
          </p>
          <p className="g-muted text-center text-xs">Tip: hit towers high to topple them, and save bombs for clusters.</p>
          <BigButton onClick={() => startLevel(result.level)} icon={<RotateCcw className="size-5" />} autoFocus>
            Try again
          </BigButton>
          <SoftButton onClick={toMenu} icon={<LayoutGrid className="size-4" />}>
            Castles
          </SoftButton>
        </Modal>
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function StarRow({ stars, size = "lg" }: { stars: number; size?: "lg" | "sm" | "xs" }) {
  const cls = size === "lg" ? "size-12" : size === "sm" ? "size-4" : "size-3";
  return (
    <div className={`flex items-end justify-center ${size === "lg" ? "gap-2" : "gap-0.5"}`} aria-label={`${stars} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          className={`${cls} ${i < stars ? "fill-amber-400 text-amber-600" : "fill-current text-current opacity-25"} ${size === "lg" && i === 1 ? "-translate-y-2" : ""} ${size === "lg" && i < stars ? "animate-[siege-star_0.5s_ease_both]" : ""}`}
          style={size === "lg" ? { animationDelay: `${0.15 + i * 0.25}s` } : undefined}
        />
      ))}
    </div>
  );
}

function MenuScreen({
  stars,
  best,
  selected,
  onSelect,
  onPlay,
  onHelp,
  onControls,
}: {
  stars: number[];
  best: number[];
  selected: number;
  onSelect: (i: number) => void;
  onPlay: () => void;
  onHelp: () => void;
  onControls: () => void;
}) {
  const [tab, setTab] = useState(LEVELS[selected]?.region ?? 0);
  const [shownFor, setShownFor] = useState(selected);
  // Follow the selection when it changes from outside (keyboard, finishing a level).
  if (shownFor !== selected) {
    setShownFor(selected);
    setTab(LEVELS[selected]?.region ?? 0);
  }
  const total = totalStars(stars);
  const level = LEVELS[selected];
  const max = LEVELS.length * 3;
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="px-4 pt-1 text-center sm:pt-2">
        <GameTitle game={GAME} />
        <p className="g-display mt-2 text-sm text-[#fefce8] [text-shadow:0_2px_0_#365314,0_4px_14px_#000a] sm:text-base">Aim the trebuchet · topple the towers · rout the defenders</p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-xl px-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-4 sm:pb-6">
        <div className="g-panel p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="g-display text-lg">Choose a castle</p>
            <p className="inline-flex items-center gap-1 text-sm font-bold tabular-nums">
              <Star className="size-4 fill-amber-400 text-amber-600" /> {total} / {max}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5" role="tablist" aria-label="Regions">
            {REGIONS.map((r, i) => {
              const open = total >= r.stars;
              return (
                <button
                  key={r.name}
                  type="button"
                  role="tab"
                  aria-selected={tab === i}
                  data-active={tab === i}
                  onClick={() => setTab(i)}
                  className="g-soft px-1.5 py-1.5 text-xs font-bold sm:text-sm"
                >
                  <span className="g-unskew gap-1">
                    {!open && <Lock className="size-3.5" />}
                    {r.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="g-muted mt-2 text-center text-xs">
            {total >= REGIONS[tab].stars ? REGIONS[tab].blurb : `Earn ${REGIONS[tab].stars} stars to open ${REGIONS[tab].name} (you have ${total}).`}
          </p>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {LEVELS.map((l, i) =>
              l.region !== tab ? null : (
                <button
                  key={l.name}
                  type="button"
                  onClick={() => onSelect(i)}
                  data-active={selected === i}
                  aria-label={`Castle ${i + 1}: ${l.name}${levelOpen(i, stars) ? "" : " (locked)"}`}
                  className={`g-soft flex flex-col items-center justify-center px-1 py-1.5 ${levelOpen(i, stars) ? "" : "opacity-50"}`}
                >
                  <span className="g-unskew flex-col">
                    <span className="g-display text-lg leading-none">{levelOpen(i, stars) ? i + 1 : <Lock className="size-4" />}</span>
                    <StarRow stars={stars[i] ?? 0} size="xs" />
                  </span>
                </button>
              ),
            )}
          </div>
          {level && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs">
              <span className="g-display text-base">
                {selected + 1}. {level.name}
              </span>
              <span className="g-muted font-bold">
                {ammoTotal(level)} shots · par {level.par}
                {best[selected] ? ` · best ${formatNumber(best[selected])}` : ""}
              </span>
            </div>
          )}
          <div className="mt-3">
            <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
              Lay siege
            </BigButton>
          </div>
        </div>
        <p className="mt-2 hidden text-center text-xs font-semibold text-[#fefce8] [text-shadow:0_1px_4px_rgb(0_0_0/0.6)] sm:block">
          ← → choose castle · Enter play · drag to aim · Space fire · 1–3 ammo
        </p>
      </div>
    </div>
  );
}

const AMMO_ICON: Record<AmmoKind, typeof Bomb> = { boulder: Skull, bomb: Bomb, splitter: Split };

function AmmoGlyph({ kind, className = "" }: { kind: AmmoKind; className?: string }) {
  if (kind === "boulder") return <span aria-hidden className={`inline-block rounded-full bg-[radial-gradient(circle_at_35%_30%,#d6d3d1,#57534e_70%)] ring-1 ring-black/40 ${className}`} />;
  const Icon = AMMO_ICON[kind];
  return <Icon aria-hidden className={className} />;
}

function HudOverlay({
  store,
  editing,
  paused,
  showControls,
  onPause,
  onRestart,
  onAmmo,
  firstTime,
}: {
  store: Store<Hud>;
  /** The controls editor is open: it draws its own copy of the ammo bar. */
  editing: boolean;
  paused: boolean;
  showControls: boolean;
  onPause: () => void;
  onRestart: () => void;
  onAmmo: (k: AmmoKind) => void;
  firstTime: boolean;
}) {
  const hud = useStore(store);
  const level = LEVELS[hud.level];
  const potential = hud.shotsUsed <= level.par ? 3 : hud.shotsUsed <= level.par + 1 ? 2 : 1;
  const [tipOpen, setTipOpen] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setTipOpen(false), 7000);
    return () => clearTimeout(id);
  }, []);
  const aimStage = hud.stage === "aim" || hud.stage === "intro";

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* `data-avoid`: the ammo bar keeps clear of these (shared/touch-layout.tsx). */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <div data-avoid className="g-hud max-w-[60vw] px-3 py-2 sm:px-4">
          <p className="g-display truncate text-sm leading-tight sm:text-lg">
            {hud.level + 1}. {level.name}
          </p>
          <div className="mt-1 flex items-center gap-1" aria-label={`${hud.defenders} of ${hud.total} defenders left`}>
            {Array.from({ length: hud.total }, (_, i) => (
              <Skull key={i} className={`size-4 ${i < hud.defenders ? "" : "opacity-25"}`} />
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-bold tabular-nums">
            <span>{formatNumber(hud.score)}</span>
            <StarRow stars={potential} size="xs" />
          </div>
        </div>
        <div data-avoid className="pointer-events-auto flex items-start gap-2">
          {showControls && (
            <IconButton onClick={onRestart} label="Restart level (R)">
              <RotateCcw className="size-5" />
            </IconButton>
          )}
          <div className="flex flex-col gap-2">
            {showControls && (
              <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
                {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
              </IconButton>
            )}
            <SystemButtons vertical />
          </div>
        </div>
      </div>

      {showControls && tipOpen && level.tip && (
        <div className="absolute top-[max(calc(env(safe-area-inset-top)+112px),124px)] right-16 left-3 flex justify-start sm:inset-x-0 sm:top-24 sm:justify-center sm:px-4">
          <p className="g-panel max-w-sm animate-[game-fade_0.4s_ease] px-3 py-2 text-sm font-semibold sm:px-4 sm:text-center">{level.tip}</p>
        </div>
      )}

      {showControls && (
        // The ammo bar is movable (shared/touch-layout.tsx); the hints sit just above it.
        <ControlLayer controls={ammoControls} hidden={editing}>
          {(placed, _frame, fit) => (
            <>
              <div className="pointer-events-none absolute flex w-max max-w-[90vw] flex-col items-center gap-2" style={above(placed.ammo)}>
                {hud.canSplit && <p className="g-hud g-display animate-pulse px-4 py-2 text-lg">Tap / Space — split!</p>}
                {hud.stage === "settle" && <p className="g-hud px-3 py-1 text-xs font-bold opacity-90">Tap to skip</p>}
                {aimStage && (hud.aiming || firstTime) && (
                  <p className="g-hud px-3 py-1 text-center text-xs font-bold">
                    {hud.aiming ? (
                      <>
                        Power {hud.power}% · {hud.angle > 0 ? `${hud.angle}° right` : hud.angle < 0 ? `${-hud.angle}° left` : "straight"} — release to fire
                      </>
                    ) : (
                      <>
                        <span className="sm:hidden">Drag back to aim · release to fire</span>
                        <span className="hidden sm:inline">Drag back to aim, or A D W S · Space to fire · Q E orbit</span>
                      </>
                    )}
                  </p>
                )}
              </div>
              {fit("ammo", <AmmoBar hud={hud} onAmmo={onAmmo} />)}
            </>
          )}
        </ControlLayer>
      )}
    </div>
  );
}

/** The ammo bar. Order = placement priority. */
const ammoControls = createControls("siege-smash:controls:v1", {
  ammo: { label: "Ammo bar", w: 200, h: 52, x: 0, y: -40, center: true, fit: true },
});

function AmmoBar({ hud, onAmmo }: { hud: Hud; onAmmo: (k: AmmoKind) => void }) {
  const level = LEVELS[hud.level] ?? LEVELS[0];
  return (
    <div className="pointer-events-auto flex items-end gap-2">
      <div className="g-hud hidden flex-col items-stretch px-3 py-1.5 sm:flex">
        <span className="text-[10px] font-bold tracking-widest uppercase opacity-70">Power</span>
        <span className="mt-0.5 h-2 w-24 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_15%,transparent)]">
          <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${hud.power}%` }} />
        </span>
        <span className="mt-0.5 text-xs font-bold tabular-nums">
          {hud.power}% · {hud.angle > 0 ? `${hud.angle}°R` : hud.angle < 0 ? `${-hud.angle}°L` : "0°"}
        </span>
      </div>
      {AMMO_ORDER.map((k, i) => {
        const count = hud.ammo[k];
        if (count <= 0 && !(level.ammo[k] ?? 0)) return null;
        const active = hud.selected === k;
        return (
          <button
            key={k}
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onAmmo(k);
            }}
            disabled={count <= 0}
            data-active={active}
            title={`${AMMO[k].name} — ${AMMO[k].hint} (${i + 1})`}
            className={`g-hud relative flex min-w-16 flex-col items-center px-2.5 py-1.5 transition pointer-coarse:min-w-14 pointer-coarse:px-2 pointer-coarse:py-1 disabled:opacity-40 ${active ? "ring-3 ring-[var(--accent)]" : ""}`}
          >
            <span className="flex items-center gap-1.5">
              <AmmoGlyph kind={k} className="size-5" />
              <span className="g-display text-lg tabular-nums pointer-coarse:text-base">×{count}</span>
            </span>
            <span className="text-[10px] font-bold tracking-wide uppercase opacity-75">
              <span className="hidden sm:inline">{i + 1} · </span>
              {AMMO[k].name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
