"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, Gauge, Home, Lock, Minus, Pause, Play, Plus, RotateCcw, SkipForward, Sparkles, Trophy } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
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
  useAudioSettings,
  useRecords,
  useShortcuts,
  useStore,
  type Store,
} from "../shared/ui";
import { DIFFICULTIES, type Difficulty } from "./chart";
import { BeatStreetGame, CLEAR_ACCURACY, laneForKey, type Calibration, type Grade, type Hud, type Phase, type RunResult } from "./engine";
import { DANCERS, GAME } from "./manifest";
import { TRACKS, trackSeconds } from "./songs";

interface Best {
  score: number;
  acc: number;
  grade: Grade;
  fc: boolean;
}

const records = createRecords("beat-street:v1", {
  best: {} as Record<string, Best>,
  offsetMs: 0,
  speed: 1,
  dancer: 0,
  track: 0,
  difficulty: 0 as Difficulty,
  plays: 0,
});

type Saved = ReturnType<typeof records.get>;

const bestKey = (track: number, d: number) => `${TRACKS[track].id}:${d}`;
const cleared = (s: Saved, track: number, d: number) => (s.best[bestKey(track, d)]?.acc ?? 0) >= CLEAR_ACCURACY;
const trackOpen = (s: Saved, track: number) => track === 0 || [0, 1, 2, 3].some((d) => cleared(s, track - 1, d));
const diffOpen = (s: Saved, track: number, d: number) => trackOpen(s, track) && (d <= 1 || cleared(s, track, d - 1));

const EMPTY_HUD: Hud = { track: 0, difficulty: 0, score: 0, combo: 0, multiplier: 1, accuracy: 100, fever: 0, feverOn: false, progress: 0, section: "", judge: null, count: null };
const LANE_KEYS = ["D", "F", "J", "K"];
const LANE_TINTS = ["#ff3dd5", "#9b6bff", "#2ee6ff", "#3dffb0"];
const SPEEDS = [0.8, 1, 1.2, 1.4, 1.6, 2];
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export interface LaneSpot {
  x: number;
  y: number;
  w: number;
}

interface Outcome extends RunResult {
  newBest: boolean;
  unlocked: string[];
}

export function BeatStreet({ sizes }: { sizes: Record<string, number> }) {
  // A page re-render passes a new object; keep the first one so the game isn't rebuilt.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<BeatStreetGame | null>(null);
  const pointers = useRef(new Map<number, number>());
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [lanes] = useState(() => createStore<LaneSpot[]>([]));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [help, setHelp] = useState(false);
  const saved = useRecords(records);
  const track = Math.min(saved.track, TRACKS.length - 1);
  const difficulty = saved.difficulty;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new BeatStreetGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      lanes: lanes.set,
      error: setError,
      results: (r) => {
        const before = records.get();
        const key = bestKey(r.track, r.difficulty);
        const prev = before.best[key];
        const newBest = !prev || r.score > prev.score;
        const entry: Best = {
          score: Math.max(prev?.score ?? 0, r.score),
          acc: Math.max(prev?.acc ?? 0, r.accuracy),
          grade: gradeMax(prev?.grade, r.grade),
          fc: !!prev?.fc || r.fullCombo,
        };
        const after: Saved = { ...before, best: { ...before.best, [key]: entry }, plays: before.plays + 1 };
        const unlocked: string[] = [];
        TRACKS.forEach((t, i) => {
          if (!trackOpen(before, i) && trackOpen(after, i)) unlocked.push(`${t.title} unlocked`);
          for (let d = 2; d < 4; d++) if (trackOpen(before, i) && !diffOpen(before, i, d) && diffOpen(after, i, d)) unlocked.push(`${t.title} · ${DIFFICULTIES[d]} unlocked`);
        });
        records.set({ best: after.best, plays: after.plays });
        setOutcome({ ...r, newBest, unlocked });
      },
    });
    gameRef.current = game;
    const s = records.get();
    game.selectDancer(s.dancer);
    game.preview(Math.min(s.track, TRACKS.length - 1));
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, lanes, modelSizes]);

  const start = (t = track, d = difficulty) => {
    const game = gameRef.current;
    if (!game || !diffOpen(records.get(), t, d)) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setOutcome(null);
    setHelp(false);
    pointers.current.clear();
    const s = records.get();
    game.start(t, d, { offsetMs: s.offsetMs, speed: s.speed });
  };

  const toMenu = () => {
    setOutcome(null);
    gameRef.current?.toMenu();
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (phase === "playing" || phase === "countin") game?.pause();
    else if (phase === "paused") game?.resume();
    else if (phase === "calibrate") game?.stopCalibration();
    else if (phase === "results") toMenu();
  };

  const openHelp = () => {
    if (phase === "playing" || phase === "countin") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  const selectTrack = (t: number) => {
    const next = (t + TRACKS.length) % TRACKS.length;
    const s = records.get();
    let d = s.difficulty;
    while (d > 0 && !diffOpen(s, next, d)) d--;
    records.set({ track: next, difficulty: d as Difficulty });
    gameRef.current?.preview(next);
    gameRef.current?.sfx.move();
  };

  const selectDifficulty = (d: number) => {
    if (d < 0 || d > 3) return;
    if (!diffOpen(records.get(), track, d)) {
      gameRef.current?.sfx.locked();
      return;
    }
    records.set({ difficulty: d as Difficulty });
    gameRef.current?.sfx.move();
  };

  const changeDancer = (dir: number) => {
    const next = (saved.dancer + dir + DANCERS.length) % DANCERS.length;
    records.set({ dancer: next });
    gameRef.current?.selectDancer(next);
  };

  // Keys. Captured before the shared shortcuts so F can be a lane while you play (it's fullscreen elsewhere).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help) return;
      const lane = laneForKey(e);
      const playing = phase === "playing" || phase === "countin" || phase === "calibrate";
      if (playing && lane !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) game.keyDown(lane, e.timeStamp);
        return;
      }
      if (phase === "calibrate" && e.key === " ") {
        e.preventDefault();
        if (!e.repeat) game.keyDown(0, e.timeStamp);
        return;
      }
      if (e.repeat) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = e.key === "Enter" || (e.key === " " && !onButton);
      if (phase === "menu") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          selectTrack(track + (e.key === "ArrowUp" ? -1 : 1));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          selectDifficulty(difficulty + (e.key === "ArrowLeft" ? -1 : 1));
        }
      } else if (phase === "paused" && confirm && !onButton) {
        e.preventDefault();
        game.resume();
      } else if (phase === "results" && confirm && !onButton) {
        e.preventDefault();
        start();
      }
    };
    const up = (e: KeyboardEvent) => {
      const lane = laneForKey(e);
      if (lane === undefined) return;
      gameRef.current?.keyUp(lane, e.timeStamp);
      if (phase === "calibrate" && e.key === " ") gameRef.current?.keyUp(0, e.timeStamp);
    };
    window.addEventListener("keydown", down, { capture: true });
    window.addEventListener("keyup", up, { capture: true });
    return () => {
      window.removeEventListener("keydown", down, { capture: true });
      window.removeEventListener("keyup", up, { capture: true });
    };
  });

  // Leaving the tab or window pauses (the music clock freezes with it).
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

  // Touch / mouse: press the lane under the finger, hold for hold notes. Several fingers at once.
  const onPointerDown = (e: ReactPointerEvent) => {
    const game = gameRef.current;
    if (!game || (e.target as HTMLElement).closest("button, a, [data-ui]")) return;
    if (phase !== "playing" && phase !== "countin" && phase !== "calibrate") return;
    const lane = phase === "calibrate" ? 0 : game.laneAt(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, lane);
    game.keyDown(lane, e.timeStamp);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const lane = pointers.current.get(e.pointerId);
    if (lane === undefined) return;
    pointers.current.delete(e.pointerId);
    gameRef.current?.keyUp(lane, e.timeStamp);
  };

  const inRun = phase === "playing" || phase === "paused" || phase === "countin";

  return (
    <GameRoot game={GAME} className="bg-[#07020d]" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Beat Street game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && (
        <MenuScreen
          saved={saved}
          track={track}
          difficulty={difficulty}
          onTrack={selectTrack}
          onDifficulty={selectDifficulty}
          onDancer={changeDancer}
          onPlay={() => start()}
          onHelp={() => setHelp(true)}
          onCalibrate={() => gameRef.current?.startCalibration()}
        />
      )}

      {phase === "calibrate" && <CalibrationScreen game={gameRef} saved={saved} onClose={() => gameRef.current?.stopCalibration()} />}

      {inRun && <LaneMarks lanes={lanes} />}
      {inRun && <HudOverlay store={hud} paused={phase === "paused"} hint={saved.plays < 3} onPause={pauseOrResume} />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <p className="g-muted -mt-1 text-center text-xs">The music picks up after a 3-2-1 count-in.</p>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={() => start()} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
        </Modal>
      )}

      {phase === "results" && outcome && !help && (
        <ResultsScreen
          outcome={outcome}
          saved={saved}
          onRetry={() => start()}
          onNext={
            outcome.track + 1 < TRACKS.length && trackOpen(records.get(), outcome.track + 1)
              ? () => {
                  selectTrack(outcome.track + 1);
                  setOutcome(null);
                  gameRef.current?.toMenu();
                }
              : null
          }
          onMenu={toMenu}
        />
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

function gradeMax(a: Grade | undefined, b: Grade): Grade {
  const order: Grade[] = ["D", "C", "B", "A", "S"];
  return !a || order.indexOf(b) > order.indexOf(a) ? b : a;
}

// --- Menu ----------------------------------------------------------------------------------------------

function MenuScreen({
  saved,
  track,
  difficulty,
  onTrack,
  onDifficulty,
  onDancer,
  onPlay,
  onHelp,
  onCalibrate,
}: {
  saved: Saved;
  track: number;
  difficulty: Difficulty;
  onTrack: (t: number) => void;
  onDifficulty: (d: number) => void;
  onDancer: (dir: number) => void;
  onPlay: () => void;
  onHelp: () => void;
  onCalibrate: () => void;
}) {
  const open = trackOpen(saved, track);
  const canPlay = diffOpen(saved, track, difficulty);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col overflow-y-auto lg:flex-row lg:items-stretch">
      <div className="flex flex-1 flex-col">
        <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5 lg:pr-0">
          <div className="lg:hidden">
            <SystemButtons onHelp={onHelp} />
          </div>
        </div>
        <div className="px-4 pt-1 text-center lg:pt-6 lg:pl-10 lg:text-left">
          <GameTitle game={GAME} />
          <p className="g-display mt-3 text-sm font-semibold tracking-wide text-[#a5f3fc] [text-shadow:0_0_10px_#22d3ee] sm:text-base">
            Hit the beat · hold the groove · light up the club
          </p>
        </div>
        <div className="min-h-40 flex-1" />
        <div className="pointer-events-auto hidden px-10 pb-8 lg:block">
          <DancerPicker dancer={saved.dancer} onDancer={onDancer} />
        </div>
      </div>

      <div className="pointer-events-auto mx-auto w-full max-w-md px-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:mx-0 lg:flex lg:w-[400px] lg:max-w-none lg:flex-col lg:justify-center lg:px-5 lg:py-5">
        <div className="mb-3 hidden justify-end lg:flex">
          <SystemButtons onHelp={onHelp} />
        </div>
        <div className="g-panel p-3 sm:p-4">
          <p className="g-display g-muted mb-2 text-[11px] font-bold tracking-[0.2em] uppercase">Track</p>
          <ul className="hidden space-y-1.5 sm:block">
            {TRACKS.map((t, i) => (
              <li key={t.id}>
                <TrackRow saved={saved} index={i} difficulty={difficulty} active={i === track} onClick={() => onTrack(i)} />
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1 sm:hidden">
            <IconButton onClick={() => onTrack(track - 1)} label="Previous track" plain>
              <ChevronLeft className="size-5" />
            </IconButton>
            <div className="min-w-0 flex-1">
              <TrackRow saved={saved} index={track} difficulty={difficulty} active onClick={() => onTrack(track + 1)} />
            </div>
            <IconButton onClick={() => onTrack(track + 1)} label="Next track" plain>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>

          <p className="g-display g-muted mt-3 mb-2 text-[11px] font-bold tracking-[0.2em] uppercase">Difficulty</p>
          <div className="grid grid-cols-4 gap-1.5">
            {DIFFICULTIES.map((name, d) => {
              const ok = diffOpen(saved, track, d);
              const best = saved.best[bestKey(track, d)];
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onDifficulty(d)}
                  aria-pressed={d === difficulty}
                  title={ok ? name : `Clear ${DIFFICULTIES[d - 1]} on this track to unlock`}
                  className={`flex flex-col items-center rounded-[10px] border px-1 py-1.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    d === difficulty ? "border-[#e879f9] bg-[#e879f926] shadow-[0_0_12px_#e879f966]" : "border-[#22d3ee66] hover:brightness-125"
                  } ${ok ? "" : "opacity-45"}`}
                >
                  <span className="flex items-center gap-1">
                    {!ok && <Lock className="size-3" />}
                    {name}
                  </span>
                  <span className="mt-0.5 h-4 text-[11px]">{best ? <GradeBadge grade={best.grade} small /> : <span className="g-muted">—</span>}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus disabled={!canPlay}>
              {open ? (canPlay ? "Play" : "Locked") : "Locked"}
            </BigButton>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
            <div className="lg:hidden">
              <DancerPicker dancer={saved.dancer} onDancer={onDancer} compact />
            </div>
            <SoftButton onClick={onCalibrate} icon={<Gauge className="size-4" />}>
              Calibrate
              <span className="tabular-nums opacity-70">
                {saved.offsetMs > 0 ? "+" : ""}
                {saved.offsetMs}
              </span>
            </SoftButton>
          </div>
        </div>
        <p className="mt-2 hidden text-center text-xs font-semibold text-white/75 sm:block">
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> track · <Kbd>←</Kbd> <Kbd>→</Kbd> difficulty · <Kbd>Enter</Kbd> play
        </p>
      </div>
    </div>
  );
}

function TrackRow({ saved, index, difficulty, active, onClick }: { saved: Saved; index: number; difficulty: Difficulty; active: boolean; onClick: () => void }) {
  const t = TRACKS[index];
  const unlocked = trackOpen(saved, index);
  const best = saved.best[bestKey(index, difficulty)];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        active ? "bg-[#e879f926] shadow-[inset_0_0_0_1.5px_#e879f9,0_0_14px_#e879f955]" : "g-tint hover:brightness-125"
      } ${unlocked ? "" : "opacity-60"}`}
    >
      <span className="g-display grid size-8 shrink-0 place-items-center rounded-full border border-[#22d3ee99] text-sm font-bold text-[#a5f3fc]">
        {unlocked ? index + 1 : <Lock className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-tight font-bold">{t.title}</span>
        <span className="g-muted block truncate text-xs">
          {t.style} · {t.song.bpm} BPM · {fmtTime(trackSeconds(t))}
        </span>
      </span>
      {unlocked ? (
        best ? (
          <span className="text-right">
            <GradeBadge grade={best.grade} small />
            <span className="g-muted block text-[10px] tabular-nums">{formatNumber(best.score)}</span>
          </span>
        ) : (
          <span className="g-muted text-[10px] font-bold tracking-wider uppercase">New</span>
        )
      ) : (
        <span className="g-muted max-w-24 text-right text-[10px] leading-tight">Clear {TRACKS[index - 1].title}</span>
      )}
    </button>
  );
}

function DancerPicker({ dancer, onDancer, compact = false }: { dancer: number; onDancer: (dir: number) => void; compact?: boolean }) {
  return (
    <div className={`g-hud flex items-center justify-between ${compact ? "h-full p-0.5" : "w-64 p-1.5"}`}>
      <IconButton onClick={() => onDancer(-1)} label="Previous dancer" plain>
        <ChevronLeft className="size-5" />
      </IconButton>
      <div className="text-center">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">Dancer</p>
        <p className="text-base leading-tight font-bold">{DANCERS[dancer]?.name ?? DANCERS[0].name}</p>
      </div>
      <IconButton onClick={() => onDancer(1)} label="Next dancer" plain>
        <ChevronRight className="size-5" />
      </IconButton>
    </div>
  );
}

const GRADE_COLORS: Record<Grade, string> = { S: "#fde047", A: "#67e8f9", B: "#e879f9", C: "#a78bfa", D: "#94a3b8" };

function GradeBadge({ grade, small = false }: { grade: Grade; small?: boolean }) {
  const color = GRADE_COLORS[grade];
  return (
    <span
      className={`g-title inline-block leading-none ${small ? "text-base" : "text-8xl"}`}
      style={{ color, textShadow: `0 0 ${small ? 6 : 16}px ${color}, 0 0 ${small ? 14 : 44}px ${color}` }}
    >
      {grade}
    </span>
  );
}

// --- Calibration ---------------------------------------------------------------------------------------

function CalibrationScreen({ game, saved, onClose }: { game: RefObject<BeatStreetGame | null>; saved: Saved; onClose: () => void }) {
  const [cal, setCal] = useState<Calibration | null>(null);
  const settings = useAudioSettings();
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setCal(game.current?.calibration() ?? null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  const beat = cal?.beat ?? 0;
  const phase = beat - Math.floor(beat);
  const flash = beat >= 0 ? Math.exp(-phase * 7) : 0;
  const accent = beat >= 0 && Math.floor(beat) % 4 === 0;
  const set = (ms: number) => records.set({ offsetMs: Math.max(-300, Math.min(300, Math.round(ms))) });
  const speedIdx = Math.max(0, SPEEDS.indexOf(saved.speed));

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/45 backdrop-blur-[2px]">
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="Calibrate" className="g-panel w-full max-w-md space-y-4 p-5 sm:p-6">
          <h2 className="g-panel-title text-center text-3xl sm:text-4xl">Calibrate</h2>
          <p className="g-muted text-center text-sm leading-relaxed">
            Tap <Kbd>Space</Kbd> or any lane key — or tap the screen — exactly on every click you hear. Eight taps or more give a good reading.
          </p>
          <div className="flex items-center justify-center py-2">
            <div
              className="grid size-28 place-items-center rounded-full border-2"
              style={{
                borderColor: accent ? "#e879f9" : "#22d3ee",
                boxShadow: `0 0 ${10 + flash * 40}px ${accent ? "#e879f9" : "#22d3ee"}`,
                transform: `scale(${1 + flash * 0.12})`,
              }}
            >
              <div className="text-center">
                <p className="g-display text-3xl font-bold tabular-nums">{cal?.offsetMs === null || !cal ? "—" : `${cal.offsetMs > 0 ? "+" : ""}${cal.offsetMs}`}</p>
                <p className="g-muted text-[10px] font-bold tracking-widest uppercase">ms · {cal?.taps ?? 0} taps</p>
              </div>
            </div>
          </div>
          {!settings.sfx && <p className="text-center text-xs font-bold text-[#fde047]">Sound effects are off — press N to hear the clicks.</p>}
          <SoftButton onClick={() => cal?.offsetMs !== null && cal && set(cal.offsetMs)} icon={<Sparkles className="size-4" />}>
            Use this reading
          </SoftButton>
          <div className="g-tint flex items-center justify-between rounded-[12px] p-2">
            <span className="pl-1 text-sm font-bold">Offset</span>
            <div className="flex items-center gap-2" data-ui>
              <IconButton onClick={() => set(saved.offsetMs - 5)} label="Earlier (−5 ms)" plain>
                <Minus className="size-4" />
              </IconButton>
              <span className="g-display w-20 text-center text-lg font-bold tabular-nums">
                {saved.offsetMs > 0 ? "+" : ""}
                {saved.offsetMs} ms
              </span>
              <IconButton onClick={() => set(saved.offsetMs + 5)} label="Later (+5 ms)" plain>
                <Plus className="size-4" />
              </IconButton>
            </div>
          </div>
          <div className="g-tint flex items-center justify-between rounded-[12px] p-2">
            <span className="pl-1 text-sm font-bold">Note speed</span>
            <div className="flex items-center gap-2" data-ui>
              <IconButton onClick={() => records.set({ speed: SPEEDS[Math.max(0, speedIdx - 1)] })} label="Slower notes" plain>
                <Minus className="size-4" />
              </IconButton>
              <span className="g-display w-20 text-center text-lg font-bold tabular-nums">×{saved.speed.toFixed(1)}</span>
              <IconButton onClick={() => records.set({ speed: SPEEDS[Math.min(SPEEDS.length - 1, speedIdx + 1)] })} label="Faster notes" plain>
                <Plus className="size-4" />
              </IconButton>
            </div>
          </div>
          <p className="g-muted text-center text-xs leading-relaxed">Positive = you hear the music late (Bluetooth headphones often need +100 to +200 ms).</p>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => set(0)} icon={<RotateCcw className="size-4" />}>
              Reset
            </SoftButton>
            <BigButton onClick={onClose}>Done</BigButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- HUD -----------------------------------------------------------------------------------------------

const JUDGE_TEXT: Record<NonNullable<Hud["judge"]>["kind"], { text: string; color: string }> = {
  perfect: { text: "Perfect", color: "#fde047" },
  great: { text: "Great", color: "#67e8f9" },
  good: { text: "Good", color: "#c4b5fd" },
  miss: { text: "Miss", color: "#94a3b8" },
  drop: { text: "Dropped", color: "#94a3b8" },
  hold: { text: "Hold!", color: "#f0abfc" },
};

function HudOverlay({
  store,
  paused,
  hint,
  onPause,
}: {
  store: Store<Hud>;
  paused: boolean;
  hint: boolean;
  onPause: () => void;
}) {
  const hud = useStore(store);
  const settings = useAudioSettings();
  const t = TRACKS[hud.track] ?? TRACKS[0];
  const difficulty = hud.difficulty;
  const judge = hud.judge ? JUDGE_TEXT[hud.judge.kind] : null;
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-2 p-2.5 pt-[max(env(safe-area-inset-top),10px)] sm:p-4">
        <div className="g-hud min-w-0 px-3 py-1.5 sm:px-4">
          <p className="g-display text-2xl leading-tight font-bold tabular-nums sm:text-3xl">{formatNumber(hud.score)}</p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold tabular-nums">
            <span className={`rounded-md px-1.5 ${hud.multiplier > 1 ? "bg-[#e879f9] text-[#1a0420]" : "bg-[#ffffff1f]"}`}>×{hud.multiplier}</span>
            <span className="opacity-75">{hud.accuracy.toFixed(1)}%</span>
          </div>
          <FeverBar fever={hud.fever} on={hud.feverOn} />
        </div>

        <div className="g-hud hidden min-w-0 flex-1 px-4 py-1.5 sm:block sm:max-w-sm">
          <div className="flex items-baseline justify-between gap-2 text-xs font-bold">
            <span className="truncate">
              {t.title} · <span className="text-[#f0abfc]">{DIFFICULTIES[difficulty]}</span>
            </span>
            <span className="g-muted shrink-0 uppercase">{hud.section}</span>
          </div>
          <Progress value={hud.progress} />
        </div>

        <div className="pointer-events-auto flex items-start gap-2" data-ui>
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <FullscreenButton className="sm:hidden" />
          <RotateButton className="sm:hidden" />
          <div className="hidden sm:block">
            <SystemButtons />
          </div>
        </div>
      </div>
      <div className="px-2.5 sm:hidden">
        <div className="g-hud px-3 py-1">
          <div className="flex items-baseline justify-between gap-2 text-[11px] font-bold">
            <span className="truncate">
              {t.title} · <span className="text-[#f0abfc]">{DIFFICULTIES[difficulty]}</span>
            </span>
            <span className="g-muted shrink-0 uppercase">{hud.section}</span>
          </div>
          <Progress value={hud.progress} />
        </div>
      </div>

      {!settings.music && (
        <p className="g-hud absolute top-28 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-bold whitespace-nowrap text-[#fde047] sm:top-24">
          Music is off — press M (the notes still follow the beat)
        </p>
      )}

      {/* Combo and judgement, over the far end of the highway. */}
      <div className={`absolute inset-x-0 top-[37%] flex flex-col items-center opacity-90 sm:top-[35%] ${hud.count ? "invisible" : ""}`}>
        {judge && hud.judge && (
          <div key={hud.judge.id} className="animate-[beat-pop_0.45s_ease-out_forwards] text-center">
            <p
              className="g-display text-3xl font-black tracking-wider uppercase italic sm:text-4xl"
              style={{ color: judge.color, textShadow: `0 0 12px ${judge.color}, 0 2px 0 #000` }}
            >
              {judge.text}
            </p>
            {hud.judge.timing && <p className="g-display -mt-0.5 text-[11px] font-bold tracking-[0.25em] text-white/70 uppercase">{hud.judge.timing}</p>}
          </div>
        )}
        {hud.combo >= 3 && (
          <div className="mt-1 text-center">
            <p key={hud.combo} className="g-title animate-[beat-bump_0.18s_ease-out] text-5xl tabular-nums sm:text-6xl">
              {hud.combo}
            </p>
            <p className="g-display -mt-1 text-[11px] font-bold tracking-[0.4em] text-[#a5f3fc] uppercase">Combo</p>
          </div>
        )}
      </div>

      {hud.feverOn && (
        <p className="g-title absolute top-[19%] left-1/2 -translate-x-1/2 animate-pulse text-2xl whitespace-nowrap sm:top-[12%] sm:text-3xl [@media(max-height:480px)]:hidden" style={{ color: "#fde047", textShadow: "0 0 10px #f59e0b, 0 0 30px #e879f9" }}>
          Fever ×2
        </p>
      )}

      {hud.count && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p key={hud.count} className="g-title animate-[beat-pop_0.5s_ease-out_forwards] text-8xl sm:text-9xl">
              {hud.count}
            </p>
            {hint && (
              <p className="g-hud mt-6 inline-block px-4 py-2 text-sm font-bold">
                {coarse ? "Tap a lane as its note crosses the line" : "Press D F J K as the notes cross the line"}
              </p>
            )}
          </div>
        </div>
      )}

      <style>{KEYFRAMES}</style>
    </div>
  );
}

/** Lane labels (keys) or big touch pads under the receptors — placed in screen pixels, so full width (data-bleed). */
function LaneMarks({ lanes }: { lanes: Store<LaneSpot[]> }) {
  const spots = useStore(lanes);
  const [coarse] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  if (spots.length !== 4) return null;
  return (
    <div data-bleed className="pointer-events-none absolute inset-0">
      {spots.map((s, i) =>
        coarse ? (
          <div
            key={i}
            className="absolute bottom-0 rounded-t-2xl border-x border-t"
            style={{
              left: s.x - s.w / 2 + 3,
              width: s.w - 6,
              top: s.y + 18,
              borderColor: `${LANE_TINTS[i]}66`,
              background: `linear-gradient(${LANE_TINTS[i]}26, transparent)`,
            }}
          />
        ) : (
          <span key={i} className="absolute -translate-x-1/2" style={{ left: s.x, top: s.y + 16 }}>
            <Kbd>{LANE_KEYS[i]}</Kbd>
          </span>
        ),
      )}
    </div>
  );
}

const KEYFRAMES = `
@keyframes beat-pop { 0% { transform: scale(1.35); opacity: 0; } 18% { transform: scale(1); opacity: 1; } 75% { opacity: 1; } 100% { transform: translateY(-10px); opacity: 0; } }
@keyframes beat-bump { 0% { transform: scale(1.18); } 100% { transform: scale(1); } }
`;

function FeverBar({ fever, on }: { fever: number; on: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className={`text-[9px] font-black tracking-[0.2em] uppercase ${on ? "text-[#fde047]" : "opacity-70"}`}>Fever</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#ffffff1f] sm:w-28">
        <div
          className={`h-full rounded-full ${on ? "animate-pulse bg-[linear-gradient(90deg,#fde047,#e879f9)]" : "bg-[linear-gradient(90deg,#22d3ee,#e879f9)]"}`}
          style={{ width: `${Math.round(fever * 100)}%`, boxShadow: fever > 0.9 ? "0 0 8px #e879f9" : undefined }}
        />
      </div>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#ffffff1f]">
      <div className="h-full rounded-full bg-[linear-gradient(90deg,#e879f9,#22d3ee)]" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

// --- Results -------------------------------------------------------------------------------------------

function ResultsScreen({ outcome, saved, onRetry, onNext, onMenu }: { outcome: Outcome; saved: Saved; onRetry: () => void; onNext: (() => void) | null; onMenu: () => void }) {
  const t = TRACKS[outcome.track];
  const best = saved.best[bestKey(outcome.track, outcome.difficulty)];
  const clearedRun = outcome.accuracy >= CLEAR_ACCURACY;
  const title = outcome.fullCombo ? "Full combo!" : clearedRun ? "Cleared!" : "Keep dancing";
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/35" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4 lg:justify-end lg:pr-10">
        <div role="dialog" aria-label="Results" className="g-panel w-full max-w-md space-y-4 p-5 sm:p-6">
          <div className="text-center">
            <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">
              {t.title} · {DIFFICULTIES[outcome.difficulty]}
            </p>
            <h2 className="g-panel-title mt-1 text-3xl sm:text-4xl">{title}</h2>
          </div>
          <div className="flex items-center justify-center gap-5">
            <GradeBadge grade={outcome.grade} />
            <div className="text-left">
              {outcome.newBest && (
                <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#fde047] px-2.5 py-0.5 text-[10px] font-black tracking-wider text-[#1a1203] uppercase">
                  <Trophy className="size-3" /> New best
                </p>
              )}
              <p className="g-muted text-[10px] font-bold tracking-[0.2em] uppercase">Score</p>
              <p className="g-display text-4xl leading-none font-bold tabular-nums">{formatNumber(outcome.score)}</p>
              <p className="mt-1 text-sm font-bold tabular-nums">
                {outcome.accuracy.toFixed(1)}% <span className="g-muted font-semibold">accuracy</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <Stat label="Perfect" value={outcome.perfect} />
            <Stat label="Great" value={outcome.great} />
            <Stat label="Good" value={outcome.good} />
            <Stat label="Miss" value={outcome.miss} />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Max combo" value={outcome.maxCombo} />
            <Stat label="Holds" value={`${outcome.holds}/${outcome.holdsTotal}`} />
            <Stat label="Best" value={formatNumber(best?.score ?? outcome.score)} />
          </div>
          {outcome.unlocked.length > 0 && (
            <div className="g-tint space-y-1 rounded-[12px] p-2.5 text-center text-sm font-bold text-[#a5f3fc]">
              {outcome.unlocked.map((u) => (
                <p key={u} className="flex items-center justify-center gap-1.5">
                  <Sparkles className="size-4" /> {u}!
                </p>
              ))}
            </div>
          )}
          {!clearedRun && <p className="g-muted text-center text-xs">Reach {CLEAR_ACCURACY}% accuracy (grade C) to clear the track.</p>}
          <BigButton onClick={onRetry} icon={<RotateCcw className="size-5" />} autoFocus>
            Play again
          </BigButton>
          <div className={`grid gap-2 ${onNext ? "grid-cols-2" : "grid-cols-1"}`}>
            {onNext && (
              <SoftButton onClick={onNext} icon={<SkipForward className="size-4" />}>
                Next track
              </SoftButton>
            )}
            <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
        </div>
      </div>
    </div>
  );
}
