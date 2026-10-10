"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, Flag, Home, Map as MapIcon, Pause, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import {
  BigButton,
  createRecords,
  createStore,
  FullscreenButton,
  GameRoot,
  GameTitle,
  HowToPlay,
  IconButton,
  LoadingScreen,
  Modal,
  RotateButton,
  SoftButton,
  Stat,
  SystemButtons,
  useRecords,
  useShortcuts,
  useStore,
  type Store,
} from "../shared/ui";
import { HOLES } from "./course";
import { MAX_STROKES, PuttParadiseGame, scoreName, type Banner, type Hud, type Phase, type RoundResult } from "./engine";
import { powerColor } from "./fx";
import { BALLS, GAME } from "./manifest";

const records = createRecords("putt-paradise:v1", { best: 0, holesInOne: 0, rounds: 0, ball: 0 });

const EMPTY_HUD: Hud = { hole: 0, par: 2, name: "", strokes: 0, scores: [], power: 0.3, dragging: false, overview: false, canPutt: false };
const PAR_TOTAL = HOLES.reduce((a, h) => a + h.par, 0);
/** Game keys passed straight to the engine while playing. */
const GAME_KEYS = new Set(["a", "d", "w", "s", "q", "e", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Shift"]);

const toPar = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);

export function PuttParadise({ sizes }: { sizes: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<PuttParadiseGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  // Captured once: a parent re-render (or a dev hot reload) must never rebuild the game mid-round.
  const [modelSizes] = useState(sizes);
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [round, setRound] = useState<(RoundResult & { newBest: boolean; prevBest: number }) | null>(null);
  const [help, setHelp] = useState(false);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new PuttParadiseGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      banner: setBanner,
      holeDone: (r) => {
        if (r.holeInOne) records.set({ holesInOne: records.get().holesInOne + 1 });
      },
      roundDone: (r) => {
        const before = records.get();
        const newBest = before.best === 0 || r.total < before.best;
        records.set({ best: newBest ? r.total : before.best, rounds: before.rounds + 1 });
        setRound({ ...r, newBest, prevBest: before.best });
      },
    });
    gameRef.current = game;
    game.selectBall(records.get().ball);
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  // Banners fade on their own.
  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), banner.tone === "intro" ? 2900 : 2300);
    return () => window.clearTimeout(id);
  }, [banner]);

  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  const start = () => {
    blur();
    setRound(null);
    setHelp(false);
    setBanner(null);
    gameRef.current?.startRound();
  };

  const toMenu = () => {
    setRound(null);
    setBanner(null);
    gameRef.current?.toMenu();
  };

  const nextHole = () => {
    blur();
    gameRef.current?.nextHole();
  };

  const playing = phase === "intro" || phase === "aim" || phase === "rolling" || phase === "holed";

  const pauseOrResume = () => {
    const game = gameRef.current;
    blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (playing) game?.pause();
    else if (phase === "paused") game?.resume();
  };

  const openHelp = () => {
    if (playing) gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  const changeBall = (i: number) => {
    const next = (i + BALLS.length) % BALLS.length;
    records.set({ ball: next });
    gameRef.current?.selectBall(next);
    gameRef.current?.sfx.tick(true);
  };

  // Game keys.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const confirm = e.key === "Enter" || e.key === " ";
      if (playing) {
        if (e.key === "Tab") {
          e.preventDefault();
          if (!e.repeat) game.toggleOverview();
        } else if (key === "r") {
          if (!e.repeat) game.replayHole();
        } else if (e.key === " ") {
          e.preventDefault();
          if (!e.repeat) game.keyDown(" ");
        } else if (GAME_KEYS.has(key)) {
          e.preventDefault();
          game.keyDown(key);
        }
      } else if (phase === "paused") {
        if (confirm && !onButton) {
          e.preventDefault();
          game.resume();
        }
      } else if (phase === "menu") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          changeBall(saved.ball + (e.key === "ArrowLeft" ? -1 : 1));
        }
      } else if (phase === "card") {
        if (confirm && !onButton) {
          e.preventDefault();
          nextHole();
        }
      } else if (phase === "done") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      gameRef.current?.keyUp(key);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Leaving the tab or window pauses the round.
  useEffect(() => {
    const pause = () => {
      gameRef.current?.clearKeys();
      gameRef.current?.pause();
    };
    const onVisibility = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, []);

  const inRound = playing || phase === "paused" || phase === "card";

  return (
    <GameRoot game={GAME} className="bg-[#cdeffa]">
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full touch-none" aria-label="Putt Paradise mini golf course" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && <MenuScreen ball={saved.ball} best={saved.best} holesInOne={saved.holesInOne} rounds={saved.rounds} onBall={changeBall} onPlay={start} onHelp={() => setHelp(true)} />}

      {inRound && (
        <HudOverlay
          store={hud}
          phase={phase}
          onPause={pauseOrResume}
          onMap={() => gameRef.current?.toggleOverview()}
        />
      )}

      {banner && (phase === "intro" || phase === "aim" || phase === "rolling" || phase === "holed") && <BannerView key={banner.id} banner={banner} />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton
              onClick={() => {
                gameRef.current?.replayHole();
              }}
              icon={<RotateCcw className="size-4" />}
            >
              Replay
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
          <PausedCard store={hud} />
          <div className="flex justify-center">
            <SystemButtons />
          </div>
        </Modal>
      )}

      {phase === "card" && !help && <ScorecardModal store={hud} onNext={nextHole} />}

      {phase === "done" && round && !help && (
        <Modal title="Round complete" wide>
          <div className="text-center">
            {round.newBest && (
              <p className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold tracking-wider text-white uppercase">
                <Trophy className="size-3.5" /> New best round
              </p>
            )}
            <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">Total</p>
            <p className="g-display text-6xl tabular-nums">{round.total}</p>
            <p className="g-panel-title mt-1 text-xl text-[var(--accent)]">{toPar(round.total - round.par)} to par</p>
          </div>
          <ScoreTable scores={round.scores} />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Par" value={round.par} />
            <Stat label="Best" value={Math.min(round.total, round.prevBest || round.total)} />
            <Stat label="Aces" value={round.holesInOne} />
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

function MenuScreen({
  ball,
  best,
  holesInOne,
  rounds,
  onBall,
  onPlay,
  onHelp,
}: {
  ball: number;
  best: number;
  holesInOne: number;
  rounds: number;
  onBall: (i: number) => void;
  onPlay: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>

      <div className="px-4 pt-1 text-center sm:pt-3">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-base text-white italic [text-shadow:0_2px_10px_#042f2e99] sm:text-lg">Nine holes · one lagoon · real ball physics</p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <div className="g-panel p-3">
          <p className="g-muted text-center text-[10px] font-bold tracking-[0.2em] uppercase">Choose your ball</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BALLS.map((b, i) => (
              <button
                key={b.key}
                type="button"
                onClick={() => onBall(i)}
                aria-pressed={ball === i}
                className={`flex flex-col items-center gap-1.5 rounded-[var(--g-hud-radius)] px-2 py-2.5 transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                  ball === i ? "g-tint ring-2 ring-[var(--accent)]" : "hover:bg-[color-mix(in_srgb,currentColor_6%,transparent)]"
                }`}
              >
                <span
                  aria-hidden
                  className="size-8 rounded-full shadow-[inset_-4px_-5px_8px_rgb(0_0_0/0.25),inset_3px_3px_6px_rgb(255_255_255/0.45)]"
                  style={{ background: b.color }}
                />
                <span className="text-xs font-bold">{b.name}</span>
              </button>
            ))}
          </div>
        </div>

        <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
          Tee off
        </BigButton>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
            <Trophy className="size-3.5 text-[var(--accent)]" /> Best {best ? `${best} (${toPar(best - PAR_TOTAL)})` : "—"}
          </span>
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
            <Sparkles className="size-3.5 text-[var(--accent)]" /> {holesInOne} hole{holesInOne === 1 ? "" : "s"}-in-one
          </span>
          {rounds > 0 && <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">{rounds} rounds</span>}
          <button
            type="button"
            onClick={onHelp}
            className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-105 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <CircleHelp className="size-3.5" /> How to play
          </button>
        </div>
      </div>
    </div>
  );
}

function HudOverlay({ store, phase, onPause, onMap }: { store: Store<Hud>; phase: Phase; onPause: () => void; onMap: () => void }) {
  const hud = useStore(store);
  const total = hud.scores.reduce<number>((a, s) => a + (s ?? 0), 0);
  const parSoFar = hud.scores.reduce<number>((a, s, i) => a + (s === null ? 0 : HOLES[i].par), 0);
  const paused = phase === "paused";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <div className="g-hud min-w-0 px-3 py-2 sm:px-4">
          <p className="g-muted text-[10px] font-bold tracking-[0.16em] whitespace-nowrap uppercase">
            Hole {hud.hole + 1}
            <span className="hidden sm:inline"> of {HOLES.length}</span>
            <span className="sm:hidden">/{HOLES.length}</span> · Par {hud.par}
          </p>
          <p className="g-display max-w-[9.5rem] truncate text-base leading-tight italic sm:max-w-none sm:text-xl">{hud.name}</p>
        </div>

        <div className="g-hud flex shrink-0 items-center gap-2.5 px-3 py-2 sm:gap-4 sm:px-4">
          <div className="text-center">
            <p className="g-muted text-[10px] font-bold tracking-[0.14em] uppercase">Strokes</p>
            <p className={`g-display text-2xl leading-tight tabular-nums ${hud.strokes >= MAX_STROKES - 2 ? "text-rose-600" : ""}`}>{hud.strokes}</p>
          </div>
          <div className="h-8 w-px bg-[color-mix(in_srgb,currentColor_18%,transparent)]" />
          <div className="text-center">
            <p className="g-muted text-[10px] font-bold tracking-[0.14em] uppercase">Round</p>
            <p className="g-display text-2xl leading-tight tabular-nums">{parSoFar ? toPar(total - parSoFar) : "E"}</p>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <IconButton onClick={onMap} label={hud.overview ? "Back to the ball (Tab)" : "Overview of the hole (Tab)"} dim={false}>
              {hud.overview ? <Flag className="size-5" /> : <MapIcon className="size-5" />}
            </IconButton>
            <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
              {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
            </IconButton>
            <FullscreenButton className="sm:hidden" />
            <RotateButton className="sm:hidden" />
          </div>
          <div className="hidden sm:block">
            <SystemButtons vertical />
          </div>
        </div>
      </div>

      {hud.canPutt && !hud.overview && <PowerMeter power={hud.power} dragging={hud.dragging} />}
      {hud.overview && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),20px)] flex justify-center px-4">
          <p className="g-hud px-4 py-2 text-sm font-bold">Overview · press Tab or the flag to return</p>
        </div>
      )}
    </>
  );
}

function PowerMeter({ power, dragging }: { power: number; dragging: boolean }) {
  const pct = Math.round(power * 100);
  const color = `#${powerColor(power).getHexString()}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] flex flex-col items-center gap-2 px-4">
      <div className="g-hud w-full max-w-sm px-4 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-bold tracking-[0.14em] uppercase">
          <span className="g-muted">{dragging ? "Release to putt" : "Power"}</span>
          <span className="g-display text-sm tracking-normal tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_12%,transparent)]">
          <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${Math.max(2, pct)}%`, background: `linear-gradient(90deg, #99f6e4, ${color})` }} />
        </div>
      </div>
      <p className="putt-hint g-hud px-3 py-1 text-center text-xs font-semibold">
        <span className="hidden sm:inline">Drag back from the ball · or A/D aim, W/S power, Space putt · Q/E orbit</span>
        <span className="sm:hidden">Drag back from the ball, release to putt</span>
      </p>
    </div>
  );
}

function BannerView({ banner }: { banner: Banner }) {
  const hole = banner.tone === "intro" ? HOLES[Number(banner.title.replace(/\D/g, "")) - 1] : null;
  const big = banner.tone === "great";
  const color = banner.tone === "bad" ? "text-rose-600" : banner.tone === "plain" ? "" : "text-[var(--accent)]";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[19%] flex justify-center px-4">
      <div className="putt-banner g-panel flex max-w-sm flex-col items-center px-7 py-4 text-center">
        {hole && <p className="g-muted text-[10px] font-bold tracking-[0.22em] uppercase">Par {hole.par}</p>}
        <p className={`g-panel-title ${big ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"} ${color}`}>{hole ? hole.name : banner.title}</p>
        {hole ? (
          <>
            <p className="g-display mt-1 text-sm italic opacity-80">{banner.title} of {HOLES.length}</p>
            <p className="mt-2 text-sm leading-snug font-semibold">{hole.tip}</p>
          </>
        ) : (
          banner.sub && <p className="mt-1.5 text-sm font-semibold opacity-85">{banner.sub}</p>
        )}
      </div>
    </div>
  );
}

function PausedCard({ store }: { store: Store<Hud> }) {
  const hud = useStore(store);
  return <ScoreTable scores={hud.scores} current={hud.hole} />;
}

function ScorecardModal({ store, onNext }: { store: Store<Hud>; onNext: () => void }) {
  const hud = useStore(store);
  const s = hud.scores[hud.hole] ?? MAX_STROKES;
  const last = hud.hole === HOLES.length - 1;
  return (
    <Modal title="Scorecard" wide>
      <p className="-mt-2 text-center text-sm font-semibold">
        <span className="g-muted">Hole {hud.hole + 1} · </span>
        <span className="text-[var(--accent)]">{scoreName(s, HOLES[hud.hole].par)}</span>
        <span className="g-muted">
          {" "}
          · {s} stroke{s === 1 ? "" : "s"}
        </span>
      </p>
      <ScoreTable scores={hud.scores} current={hud.hole} />
      <BigButton onClick={onNext} icon={last ? <Trophy className="size-5" /> : <Play className="size-5 fill-current" />} autoFocus>
        {last ? "Finish round" : `Hole ${hud.hole + 2}`}
      </BigButton>
    </Modal>
  );
}

/** The classic card: circles for under par, squares for over. */
function ScoreTable({ scores, current }: { scores: (number | null)[]; current?: number }) {
  const played = scores.reduce<number>((a, s) => a + (s ?? 0), 0);
  const parPlayed = scores.reduce<number>((a, s, i) => a + (s === null ? 0 : HOLES[i].par), 0);
  return (
    <div className="g-tint overflow-x-auto rounded-[var(--g-hud-radius)] p-2">
      <table className="w-full table-fixed border-collapse text-center text-sm tabular-nums">
        <colgroup>
          <col className="w-10" />
          {HOLES.map((_, i) => (
            <col key={i} />
          ))}
          <col className="w-9" />
        </colgroup>
        <thead>
          <tr className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">
            <th className="px-1 py-1 text-left font-bold">Hole</th>
            {HOLES.map((_, i) => (
              <th key={i} className={`px-0.5 py-1 font-bold ${i === current ? "text-[var(--accent)]" : ""}`}>
                {i + 1}
              </th>
            ))}
            <th className="px-1 py-1 font-bold">Tot</th>
          </tr>
        </thead>
        <tbody>
          <tr className="g-muted border-t border-[color-mix(in_srgb,currentColor_15%,transparent)]">
            <td className="px-1 py-1 text-left text-[11px] font-bold uppercase">Par</td>
            {HOLES.map((h, i) => (
              <td key={i} className="px-0.5 py-1">
                {h.par}
              </td>
            ))}
            <td className="px-1 py-1 font-bold">{PAR_TOTAL}</td>
          </tr>
          <tr className="border-t border-[color-mix(in_srgb,currentColor_15%,transparent)]">
            <td className="px-1 py-1.5 text-left text-[11px] font-bold uppercase">You</td>
            {HOLES.map((h, i) => (
              <td key={i} className="px-0.5 py-1.5">
                <ScoreMark score={scores[i] ?? null} par={h.par} />
              </td>
            ))}
            <td className="g-display px-1 py-1.5 text-base">{played || "–"}</td>
          </tr>
        </tbody>
      </table>
      {parPlayed > 0 && <p className="g-muted mt-1 text-right text-[11px] font-bold">{toPar(played - parPlayed)} to par so far</p>}
    </div>
  );
}

function ScoreMark({ score, par }: { score: number | null; par: number }) {
  if (score === null) return <span className="g-muted">·</span>;
  const d = score - par;
  const base = "mx-auto grid size-6 place-items-center text-[13px] font-bold";
  if (score === 1) return <span className={`${base} rounded-full bg-[var(--accent)] text-white`}>1</span>;
  if (d <= -2) return <span className={`${base} rounded-full border-2 border-double border-[var(--accent)] text-[var(--accent)]`}>{score}</span>;
  if (d === -1) return <span className={`${base} rounded-full border-2 border-[var(--accent)] text-[var(--accent)]`}>{score}</span>;
  if (d === 0) return <span className={base}>{score}</span>;
  if (d === 1) return <span className={`${base} border-2 border-current opacity-80`}>{score}</span>;
  return <span className={`${base} border-[3px] border-double border-current opacity-80`}>{score}</span>;
}

const STYLES = `
@keyframes putt-banner { 0% { opacity: 0; transform: translateY(14px) scale(0.92); } 12% { opacity: 1; transform: none; } 82% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-8px); } }
.putt-banner { animation: putt-banner 2.4s ease forwards; }
@keyframes putt-hint { 0%, 70% { opacity: 1; } 100% { opacity: 0.55; } }
.putt-hint { animation: putt-hint 6s ease forwards; }
@media (prefers-reduced-motion: reduce) { .putt-banner, .putt-hint { animation: none; } }
`;
