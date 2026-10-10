"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CircleHelp,
  Droplets,
  Flag,
  Gamepad2,
  Home,
  House,
  Layers,
  Mountain,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Route,
  Sun,
  Trees,
  Trophy,
  Undo2,
  Waves,
  Wheat,
} from "lucide-react";
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
import { CATEGORY_COLOR, HexHavenGame, type GameResult, type HandView, type Hud, type Phase, type Popup, type QuestView } from "./engine";
import { GAME } from "./manifest";
import { CATEGORY_LABEL, type Category } from "./tiles";

const records = createRecords("hex-haven:v1", { best: 0, games: 0, mostTiles: 0, mostQuests: 0 });

const EMPTY_HUD: Hud = { score: 0, remaining: 0, placed: 0, hand: [], angle: 0, quests: [], canUndo: false, selected: false, preview: null };

const CATEGORY_ICON: Record<Category, typeof Trees> = {
  forest: Trees,
  village: House,
  lake: Waves,
  river: Droplets,
  road: Route,
  field: Wheat,
  stone: Mountain,
  sand: Sun,
};

const MOVE_KEYS: Record<string, "up" | "down" | "left" | "right"> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
};

const STYLES = `
@keyframes hex-pop {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(0.85); }
  12% { opacity: 1; transform: translate(-50%, -60%) scale(1.06); }
  22% { transform: translate(-50%, -65%) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -170%) scale(1); }
}
@keyframes hex-hint {
  0% { opacity: 0; transform: translateY(8px); }
  8%, 85% { opacity: 1; transform: none; }
  100% { opacity: 0; }
}
@keyframes hex-in {
  from { opacity: 0; transform: translateY(6px) scale(0.96); }
  to { opacity: 1; transform: none; }
}
`;

export function HexHaven({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HexHavenGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(GameResult & { newBest: boolean }) | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [popups, setPopups] = useState<Popup[]>([]);
  const [runKey, setRunKey] = useState(0);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const touch = useTouchScreen();
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const game = new HexHavenGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      thumbs: setThumbs,
      popup: (p) => {
        setPopups((list) => [...list.slice(-7), p]);
        const id = setTimeout(() => {
          timers.delete(id);
          setPopups((list) => list.filter((x) => x.id !== p.id));
        }, 1900);
        timers.add(id);
      },
      over: (run) => {
        const before = records.get();
        const newBest = run.score > before.best;
        records.set({
          best: Math.max(before.best, run.score),
          games: before.games + 1,
          mostTiles: Math.max(before.mostTiles, run.placed),
          mostQuests: Math.max(before.mostQuests, run.quests),
        });
        setResult({ ...run, newBest });
      },
    });
    gameRef.current = game;
    void game.load(modelSizes);
    return () => {
      timers.forEach(clearTimeout);
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  const start = () => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setHelp(false);
    setPopups([]);
    setRunKey((k) => k + 1);
    game.start();
  };

  const toMenu = () => {
    setResult(null);
    setPopups([]);
    gameRef.current?.toMenu();
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

  // Game keys. M, N, H, F, P and Esc belong to the shared shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || editing) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const k = e.key.toLowerCase();
      const confirm = e.key === "Enter" || e.key === " ";
      if (phase === "playing") {
        const move = MOVE_KEYS[k];
        if (move) {
          e.preventDefault();
          game.holdKey(move, true);
          return;
        }
        if (e.repeat) return;
        if (k === "q" || k === "e") {
          e.preventDefault();
          if (e.shiftKey) game.rotateView(k === "e" ? 1 : -1);
          else game.rotate(k === "e" ? 1 : -1);
        } else if (k === "r") {
          e.preventDefault();
          game.rotate(1);
        } else if (k === "z") {
          e.preventDefault();
          game.undo();
        } else if (k === "+" || k === "=") game.zoom(0.85);
        else if (k === "-" || k === "_") game.zoom(1 / 0.85);
        else if (confirm && !onButton) {
          e.preventDefault();
          game.confirm();
        }
      } else if (phase === "paused") {
        if (confirm && !onButton) {
          e.preventDefault();
          game.resume();
        }
      } else if (phase === "menu" || phase === "over") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const move = MOVE_KEYS[e.key.toLowerCase()];
      if (move) gameRef.current?.holdKey(move, false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // Leaving the tab or window pauses the game.
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

  const inGame = phase === "playing" || phase === "paused";

  return (
    <GameRoot game={GAME} className="bg-[#d4ecf3]">
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Hex Haven game board" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !editing && <MenuScreen best={saved.best} games={saved.games} onPlay={start} onHelp={() => setHelp(true)} onControls={() => setEditing(true)} />}

      {/* From the title screen the controls editor shows the HUD behind it, so the tray keeps clear of it. */}
      {(inGame || (phase === "menu" && editing)) && (
        <HudOverlay
          store={hud}
          thumbs={thumbs}
          best={saved.best}
          editing={editing}
          paused={phase === "paused"}
          onPause={pauseOrResume}
          onRotate={(d) => gameRef.current?.rotate(d)}
          onUndo={() => gameRef.current?.undo()}
          onConfirm={() => gameRef.current?.confirm()}
        />
      )}
      {phase === "playing" && saved.games < 3 && <ControlsHint key={runKey} />}

      <div data-bleed className="pointer-events-none absolute inset-0 overflow-hidden">
        {popups.map((p) => (
          <PopupView key={p.id} popup={p} />
        ))}
      </div>

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
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
              Menu
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
        <ControlsEditor
          controls={trayControls}
          face={() => <Tray hud={hud.get()} thumbs={thumbs} onRotate={() => {}} onUndo={() => {}} />}
          onClose={() => setEditing(false)}
        />
      )}

      {phase === "over" && result && !help && (
        <Modal title="Haven complete">
          <div className="text-center">
            {result.newBest && (
              <p className="g-display mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1 text-sm text-amber-950">
                <Trophy className="size-3.5" /> New best
              </p>
            )}
            <p className="g-muted text-xs font-bold tracking-[0.16em] uppercase">Final score</p>
            <p className="g-display text-6xl font-semibold tabular-nums">{formatNumber(result.score)}</p>
            <p className="g-muted mt-1 text-sm font-semibold">Your island is finished. Build another?</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Tiles" value={formatNumber(result.placed)} />
            <Stat label="Perfect" value={formatNumber(result.perfects)} />
            <Stat label="Quests" value={formatNumber(result.quests)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Big forest" value={formatNumber(result.forest)} />
            <Stat label="Big village" value={formatNumber(result.village)} />
            <Stat label="Best" value={formatNumber(Math.max(saved.best, result.score))} />
          </div>
          <BigButton onClick={start} icon={<RotateCcw className="size-5" />} autoFocus>
            Play again
          </BigButton>
          <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
            Menu
          </SoftButton>
        </Modal>
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function MenuScreen({ best, games, onPlay, onHelp, onControls }: { best: number; games: number; onPlay: () => void; onHelp: () => void; onControls: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="px-4 pt-2 text-center sm:pt-4">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-base font-medium text-white [text-shadow:0_2px_0_#065f46,0_4px_14px_rgb(0_0_0/0.35)] sm:text-lg">
          Lay tiles · match the edges · grow a tiny kingdom
        </p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
          Play
        </BigButton>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-bold">
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
            <Trophy className="size-4 text-amber-500" /> Best <span className="g-display tabular-nums">{formatNumber(best)}</span>
          </span>
          {games > 0 && (
            <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
              <Layers className="size-4 text-emerald-600" /> {formatNumber(games)} {games === 1 ? "island" : "islands"} built
            </span>
          )}
          <button
            type="button"
            onClick={onHelp}
            className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <CircleHelp className="size-4" /> How to play
          </button>
        </div>
        <p className="hidden text-center text-xs font-bold text-white [text-shadow:0_1px_4px_rgb(0_40_30/0.6)] sm:block">
          Click to place · R / right-click rotate · Z undo · WASD / drag to move · wheel to zoom
        </p>
        <p className="text-center text-xs font-bold text-white [text-shadow:0_1px_4px_rgb(0_40_30/0.6)] sm:hidden">
          Tap a spot, tap again to place · drag to move · pinch to zoom
        </p>
      </div>
    </div>
  );
}

function HudOverlay({
  store,
  thumbs,
  best,
  editing,
  paused,
  onPause,
  onRotate,
  onUndo,
  onConfirm,
}: {
  store: Store<Hud>;
  thumbs: Record<string, string>;
  best: number;
  /** The controls editor is open: it draws its own copy of the tray. */
  editing: boolean;
  paused: boolean;
  onPause: () => void;
  onRotate: (dir: 1 | -1) => void;
  onUndo: () => void;
  onConfirm: () => void;
}) {
  const hud = useStore(store);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* Top: score, quests, system buttons. */}
      <div className="flex items-start justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        {/* `data-avoid`: the tray keeps clear of these (shared/touch-layout.tsx). */}
        <div data-avoid className="min-w-0 space-y-2">
          <div className="g-hud inline-flex flex-col rounded-[22px] px-4 py-1.5">
            <p className="g-display text-2xl leading-tight font-semibold tabular-nums sm:text-3xl">{formatNumber(hud.score)}</p>
            <p className="g-muted text-[11px] font-bold tabular-nums">best {formatNumber(Math.max(best, hud.score))}</p>
          </div>
          <QuestList quests={hud.quests} />
        </div>
        <div data-avoid className="pointer-events-auto flex shrink-0 items-start gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <SystemButtons />
        </div>
      </div>

      {/* Bottom: the tile tray (movable: shared/touch-layout.tsx) and the preview line just above it. */}
      <ControlLayer controls={trayControls} hidden={editing}>
        {(placed, _frame, fit) => (
          <>
            <div className="pointer-events-none absolute flex w-max justify-center" style={above(placed.tray)}>
              <PreviewLine hud={hud} onConfirm={onConfirm} />
            </div>
            {fit("tray", <Tray hud={hud} thumbs={thumbs} onRotate={onRotate} onUndo={onUndo} />)}
          </>
        )}
      </ControlLayer>
    </div>
  );
}

/** The tile tray: undo, rotate, the tile in hand and the next ones. Order = placement priority. */
const trayControls = createControls("hex-haven:controls:v1", {
  tray: { label: "Tile tray", w: 300, h: 60, x: 0, y: -40, center: true, fit: true },
});

function Tray({ hud, thumbs, onRotate, onUndo }: { hud: Hud; thumbs: Record<string, string>; onRotate: (dir: 1 | -1) => void; onUndo: () => void }) {
  const [current, ...next] = hud.hand;
  return (
    <div className="g-panel pointer-events-auto flex items-center gap-1.5 p-1.5 sm:gap-2 sm:p-2">
      <TrayButton label="Undo (Z)" onClick={onUndo} disabled={!hud.canUndo}>
        <Undo2 className="size-5" />
      </TrayButton>
      <TrayButton label="Rotate left (Q)" onClick={() => onRotate(-1)}>
        <RotateCcw className="size-5" />
      </TrayButton>
      <CurrentTile tile={current} thumbs={thumbs} angle={hud.angle} />
      <TrayButton label="Rotate right (R / E)" onClick={() => onRotate(1)}>
        <RotateCw className="size-5" />
      </TrayButton>
      <div className="flex items-center gap-1 pr-1 pl-0.5 sm:gap-1.5">
        {next.slice(0, 3).map((t, i) => (
          <SmallTile key={i} tile={t} thumbs={thumbs} dim={i > 0} />
        ))}
        <div className="ml-0.5 flex min-w-9 flex-col items-center leading-none">
          <Layers className="size-4 text-emerald-600" />
          <span className="g-display mt-0.5 text-lg leading-none font-semibold tabular-nums">{hud.remaining}</span>
          <span className="g-muted text-[9px] font-bold tracking-wider uppercase">left</span>
        </div>
      </div>
    </div>
  );
}


function QuestList({ quests }: { quests: QuestView[] }) {
  if (!quests.length) return null;
  return (
    <ul className="flex max-w-[11rem] flex-col gap-1.5 sm:max-w-none">
      {quests.map((q) => {
        const Icon = CATEGORY_ICON[q.cat];
        const pct = Math.min(100, (q.progress / q.target) * 100);
        return (
          <li
            key={q.id}
            className="g-hud flex animate-[hex-in_0.35s_ease] items-center gap-2 rounded-[20px] py-1 pr-3 pl-1"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: CATEGORY_COLOR[q.cat] }}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="g-display flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                <span className="truncate">
                  {CATEGORY_LABEL[q.cat]} of {q.target}
                </span>
                <span className="tabular-nums">
                  {q.progress}/{q.target}
                </span>
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_14%,transparent)] sm:w-28">
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: CATEGORY_COLOR[q.cat] }} />
                </span>
                <span className="g-muted text-[10px] font-bold whitespace-nowrap">+{q.rewardTiles} tiles</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PreviewLine({ hud, onConfirm }: { hud: Hud; onConfirm: () => void }) {
  const p = hud.preview;
  if (hud.selected && p) {
    return (
      <button
        type="button"
        onClick={onConfirm}
        disabled={!p.valid}
        className="g-btn pointer-events-auto inline-flex animate-[hex-in_0.2s_ease] items-center px-5 py-2.5 text-lg disabled:opacity-90 pointer-coarse:px-3.5 pointer-coarse:py-1.5 pointer-coarse:text-sm disabled:grayscale-[0.6]"
      >
        <span className="g-unskew gap-2">
          {p.valid ? (
            <>
              <Check className="size-5" /> Place · +{p.points}
              {p.perfect && <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs text-amber-950">{p.flawless ? "Flawless" : "Perfect"}</span>}
            </>
          ) : (
            <>Doesn&apos;t fit · rotate it</>
          )}
        </span>
      </button>
    );
  }
  if (!p) return <div className="h-0" />;
  return (
    <div className="g-hud inline-flex animate-[hex-in_0.15s_ease] items-center gap-2 px-3.5 py-1.5 text-sm font-bold">
      {p.valid ? (
        <>
          <span className="g-display text-base font-semibold text-emerald-600">+{p.points}</span>
          {p.perfect ? (
            <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs text-amber-950">{p.flawless ? "Flawless fit · +2 tiles" : "Perfect fit · +1 tile"}</span>
          ) : (
            <span className="g-muted">{p.points === 0 ? "no matching sides" : `${p.points / 10} matching side${p.points === 10 ? "" : "s"}`}</span>
          )}
        </>
      ) : (
        <span className="text-rose-600">Doesn&apos;t fit · rotate it</span>
      )}
    </div>
  );
}

function TrayButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      className="g-soft grid size-11 shrink-0 place-items-center rounded-full pointer-coarse:size-8 transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] active:scale-95 disabled:opacity-40"
    >
      <span className="g-unskew">{children}</span>
    </button>
  );
}

function CurrentTile({ tile, thumbs, angle }: { tile: HandView | undefined; thumbs: Record<string, string>; angle: number }) {
  return (
    <div className="relative grid size-[84px] shrink-0 place-items-center sm:size-24 pointer-coarse:size-[60px]" title={tile?.name}>
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_40%,transparent)_0%,transparent_70%)]" />
      {tile && thumbs[tile.kind] && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL rendered in the browser
        <img
          src={thumbs[tile.kind]}
          alt={tile.name}
          draggable={false}
          className="relative size-full drop-shadow-[0_4px_6px_rgb(0_0_0/0.35)] transition-transform duration-150 ease-out"
          style={{ transform: `rotate(${angle}deg)` }}
        />
      )}
      {tile && (
        <span className="g-display absolute -bottom-1.5 left-1/2 max-w-[120%] -translate-x-1/2 truncate rounded-full bg-[#1f3b2d] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white">
          {tile.name}
        </span>
      )}
      {tile?.quest && <QuestBadge cat={tile.quest.cat} target={tile.quest.target} />}
    </div>
  );
}

function SmallTile({ tile, thumbs, dim }: { tile: HandView; thumbs: Record<string, string>; dim: boolean }) {
  return (
    <div className={`relative size-9 shrink-0 sm:size-12 pointer-coarse:size-8 ${dim ? "opacity-70" : ""}`} title={tile.name}>
      {thumbs[tile.kind] && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL rendered in the browser
        <img src={thumbs[tile.kind]} alt={tile.name} draggable={false} className="size-full" />
      )}
      {tile.quest && (
        <span
          className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-white ring-2 ring-white"
          style={{ background: CATEGORY_COLOR[tile.quest.cat] }}
        >
          <Flag className="size-2.5" />
        </span>
      )}
    </div>
  );
}

function QuestBadge({ cat, target }: { cat: Category; target: number }) {
  const Icon = CATEGORY_ICON[cat];
  return (
    <span
      className="g-display absolute -top-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-md ring-2 ring-white"
      style={{ background: CATEGORY_COLOR[cat] }}
    >
      <Icon className="size-3" /> {CATEGORY_LABEL[cat]} of {target}
    </span>
  );
}

function PopupView({ popup }: { popup: Popup }) {
  const tone = {
    points: "text-white text-3xl",
    perfect: "text-amber-200 text-4xl",
    quest: "text-emerald-200 text-4xl",
    fail: "text-rose-200 text-2xl",
    info: "text-white text-2xl",
  }[popup.tone];
  return (
    <div
      className="absolute animate-[hex-pop_1.8s_ease-out_forwards] text-center whitespace-nowrap"
      style={{ left: popup.x, top: popup.y }}
    >
      <p
        className={`g-display font-bold [-webkit-text-stroke:2px_#1f3b2d] [paint-order:stroke_fill] [text-shadow:0_3px_0_#1f3b2d,0_6px_18px_rgb(0_0_0/0.3)] ${tone}`}
      >
        {popup.text}
      </p>
      {popup.sub && (
        <p className="g-hud mx-auto mt-1 w-fit px-2.5 py-0.5 text-xs font-bold">{popup.sub}</p>
      )}
    </div>
  );
}

function ControlsHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),10px)+150px)] flex animate-[hex-hint_8s_ease_forwards] justify-center px-4 sm:top-5 sm:bottom-auto">
      <p className="g-hud px-4 py-2 text-center text-sm font-bold">
        <span className="hidden sm:inline">Click a glowing spot to place · R or right-click to rotate · drag to look around</span>
        <span className="sm:hidden">Tap a glowing spot, then tap again to place · drag to look around</span>
      </p>
    </div>
  );
}
