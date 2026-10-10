"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { CircleHelp, Home, Lock, Play, Rocket, RotateCcw, Trophy } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import {
  BigButton,
  createRecords,
  createStore,
  formatNumber,
  GameRoot,
  GameTitle,
  HowToPlay,
  Kbd,
  LoadingScreen,
  Modal,
  Panel,
  SoftButton,
  Stat,
  SystemButtons,
  useRecords,
  useShortcuts,
} from "../shared/ui";
import { NovaStrikeGame, type Hud, type Phase, type StageResult } from "./engine";
import { HudOverlay, NovaStyles, Scanlines, TouchControls } from "./hud";
import { GAME } from "./manifest";
import { MEDAL_NAMES, STAGES } from "./stages";

interface ScoreEntry {
  name: string;
  score: number;
  stage: number;
}

const DEFAULT_SCORES: ScoreEntry[] = [
  { name: "NVA", score: 120000, stage: 3 },
  { name: "ACE", score: 80000, stage: 3 },
  { name: "ROX", score: 50000, stage: 2 },
  { name: "ZAP", score: 25000, stage: 2 },
  { name: "GLX", score: 10000, stage: 1 },
];

const records = createRecords("nova-strike:v1", {
  scores: DEFAULT_SCORES,
  unlocked: 1,
  medals: [0, 0, 0] as number[],
  runs: 0,
  invertY: false,
  name: "",
});

const EMPTY_HUD: Hud = {
  score: 0,
  mult: 1,
  combo: 0,
  comboT: 0,
  hits: 0,
  shield: 1,
  lives: 3,
  bombs: 3,
  boost: 1,
  charge: 0,
  locks: 0,
  laser: 1,
  stage: 0,
  progress: 0,
  checkpoint: 0.5,
  boss: null,
  banner: null,
  danger: false,
  hurt: 0,
  bombFlash: 0,
};

const MEDAL_COLORS = ["#334155", "#d08a4a", "#cbd5e1", "#ffd166"];

const GAME_KEYS = new Set(["Space", "KeyJ", "KeyQ", "KeyE", "KeyB", "KeyC", "KeyX", "ShiftLeft", "ShiftRight", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const noSubscribe = () => () => {};
const isCoarse = () => window.matchMedia("(pointer: coarse)").matches;

const qualifies = (scores: ScoreEntry[], score: number) => score > 0 && (scores.length < 5 || score > scores[scores.length - 1].score);

export function NovaStrike({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NovaStrikeGame | null>(null);
  const [game, setGame] = useState<NovaStrikeGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StageResult | null>(null);
  const [over, setOver] = useState<{ score: number; stage: number; final: boolean } | null>(null);
  const [entry, setEntry] = useState<{ score: number; stage: number } | null>(null);
  const [briefStage, setBriefStage] = useState(0);
  const [help, setHelp] = useState(false);
  const [stageSelect, setStageSelect] = useState(false);
  const touch = useSyncExternalStore(noSubscribe, isCoarse, () => false);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new NovaStrikeGame(canvas, {
      progress: setProgress,
      phase: (p) => {
        setPhase(p);
        if (p === "briefing") setBriefStage(gameRef.current?.stageNumber ?? 0);
      },
      hud: hud.set,
      error: setError,
      results: (r) => {
        const before = records.get();
        const medals = [...before.medals];
        medals[r.stage] = Math.max(medals[r.stage] ?? 0, r.medal);
        records.set({ medals, unlocked: Math.min(STAGES.length, Math.max(before.unlocked, r.stage + 2)) });
        setResults(r);
      },
      over: (score, stage) => setOver({ score, stage, final: false }),
      victory: () => {},
    });
    g.setInvertY(records.get().invertY);
    gameRef.current = g;
    setGame(g);
    void g.load(modelSizes);
    // Temporary test hook.
    (window as unknown as { __debug?: unknown }).__debug = g;
    return () => {
      gameRef.current = null;
      g.dispose();
    };
  }, [hud, modelSizes]);

  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  const startRun = useCallback((stage: number) => {
    blur();
    setStageSelect(false);
    setResults(null);
    setOver(null);
    setEntry(null);
    records.set({ runs: records.get().runs + 1 });
    gameRef.current?.newRun(stage);
  }, []);

  const launch = useCallback(() => {
    blur();
    setHelp(false);
    gameRef.current?.launch();
  }, []);

  const toMenu = useCallback(() => {
    setResults(null);
    setOver(null);
    setEntry(null);
    setStageSelect(false);
    gameRef.current?.toMenu();
  }, []);

  /** Run finished (game over without continuing, or victory): offer the score table. */
  const finishRun = useCallback((score: number, stage: number) => {
    if (qualifies(records.get().scores, score)) setEntry({ score, stage });
    else setOver({ score, stage, final: true });
  }, []);

  const nextStage = useCallback(() => {
    blur();
    const r = results;
    setResults(null);
    if (r?.last) finishRun(r.score, STAGES.length);
    else gameRef.current?.nextStage();
  }, [results, finishRun]);

  const continueRun = useCallback(() => {
    blur();
    setOver(null);
    gameRef.current?.continueRun();
  }, []);

  const giveUp = useCallback(() => {
    const o = over;
    if (!o) return;
    setOver(null);
    finishRun(o.score, o.stage + 1);
  }, [over, finishRun]);

  const saveEntry = (name: string) => {
    if (!entry) return;
    const clean = (name.toUpperCase().replace(/[^A-Z0-9]/g, "") || "ACE").slice(0, 3).padEnd(3, "-");
    const scores = [...records.get().scores, { name: clean, score: entry.score, stage: entry.stage }].sort((a, b) => b.score - a.score).slice(0, 5);
    records.set({ scores, name: clean });
    setEntry(null);
    toMenu();
  };

  const pauseOrResume = useCallback(() => {
    const g = gameRef.current;
    blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (phase === "playing") g?.pause();
    else if (phase === "paused") g?.resume();
  }, [help, phase]);

  const openHelp = useCallback(() => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  }, [phase]);

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Game keys while flying; Enter / Space confirm on the menus.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || e.metaKey || e.altKey || help) return;
      if (e.target instanceof HTMLInputElement) return;
      if (phase === "playing") {
        if (GAME_KEYS.has(e.code)) {
          e.preventDefault();
          if (!e.repeat) g.keyDown(e.code);
        }
        return;
      }
      if (e.ctrlKey) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = (e.key === "Enter" || e.key === " ") && !onButton;
      if (!confirm || e.repeat) return;
      e.preventDefault();
      if (phase === "menu" && !stageSelect) startRun(0);
      else if (phase === "briefing") launch();
      else if (phase === "results" || phase === "victory") nextStage();
      else if (phase === "over" && over && !over.final) continueRun();
      else if (phase === "paused") g.resume();
    };
    const onUp = (e: KeyboardEvent) => gameRef.current?.keyUp(e.code);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Leaving the tab or window pauses the flight.
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

  // Mouse: steer towards the pointer, click to fire (hold to charge).
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.target !== canvasRef.current || e.pointerType !== "mouse" || e.button !== 0) return;
    gameRef.current?.pointerFire(true);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse") return;
    gameRef.current?.pointerFire(false);
  };
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const onPointerMove = (e: ReactPointerEvent) => {
    if (e.pointerType !== "mouse" || phase !== "playing") return;
    const last = lastMouse.current;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) < 2) return;
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    gameRef.current?.mouseMove(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };

  const toggleInvert = () => {
    const next = !records.get().invertY;
    records.set({ invertY: next });
    gameRef.current?.setInvertY(next);
  };

  const flying = phase === "playing" || phase === "paused";

  return (
    <GameRoot game={GAME} className="bg-[#05040f]" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove}>
      <NovaStyles />
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Nova Strike game" />
      {phase !== "loading" && phase !== "error" && <Scanlines />}

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !entry && (
        <MenuScreen
          scores={saved.scores}
          unlocked={saved.unlocked}
          medals={saved.medals}
          stageSelect={stageSelect}
          touch={touch}
          onStart={() => startRun(0)}
          onStage={(i) => startRun(i)}
          onStageSelect={setStageSelect}
          onHelp={() => setHelp(true)}
        />
      )}

      {phase === "briefing" && <Briefing stage={briefStage} medal={saved.medals[briefStage] ?? 0} touch={touch} onLaunch={launch} onMenu={toMenu} onHelp={() => setHelp(true)} />}

      {flying && <HudOverlay store={hud} touch={touch} paused={phase === "paused"} onPause={pauseOrResume} />}
      {phase === "playing" && touch && <TouchControls game={game} store={hud} />}
      {phase === "playing" && !touch && saved.runs < 3 && <ControlsHint />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Quit
            </SoftButton>
          </div>
          <SoftButton onClick={toggleInvert} active={saved.invertY}>
            Invert up / down: {saved.invertY ? "On" : "Off"}
          </SoftButton>
        </Modal>
      )}

      {(phase === "results" || phase === "victory") && results && !help && <ResultsCard r={results} onNext={nextStage} />}

      {phase === "over" && over && !over.final && !entry && <ContinueCard score={over.score} onContinue={continueRun} onGiveUp={giveUp} />}

      {over?.final && !entry && (
        <Modal title="Game over">
          <div className="text-center">
            <p className="g-muted text-xs tracking-[0.2em]">FINAL SCORE</p>
            <p className="g-display mt-2 text-3xl text-[#ecfeff] tabular-nums">{formatNumber(over.score)}</p>
          </div>
          <BigButton onClick={() => startRun(0)} icon={<RotateCcw className="size-5" />} autoFocus>
            Retry
          </BigButton>
          <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
            Menu
          </SoftButton>
        </Modal>
      )}

      {entry && <InitialsEntry score={entry.score} victory={entry.stage > STAGES.length - 1} lastName={saved.name} onSave={saveEntry} />}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function MenuScreen({
  scores,
  unlocked,
  medals,
  stageSelect,
  touch,
  onStart,
  onStage,
  onStageSelect,
  onHelp,
}: {
  scores: ScoreEntry[];
  unlocked: number;
  medals: number[];
  stageSelect: boolean;
  touch: boolean;
  onStart: () => void;
  onStage: (i: number) => void;
  onStageSelect: (on: boolean) => void;
  onHelp: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col overflow-y-auto">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>

      <div className="px-4 pt-2 text-center sm:pt-6">
        <GameTitle game={GAME} />
        <p className="mt-5">
          <span className="g-display inline-block animate-[nova-blink_1.1s_steps(1)_infinite] bg-[#020617cc] px-3 py-2 text-xs text-[#ffd166] sm:text-sm">{touch ? "Tap start" : "Press start"}</span>
        </p>
      </div>

      <div className="min-h-6 flex-1" />

      <div className="pointer-events-auto mx-auto grid w-full max-w-3xl gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:grid-cols-[1fr_1fr] sm:pb-8">
        <Panel className="space-y-3 p-4">
          {!stageSelect ? (
            <>
              <BigButton onClick={onStart} icon={<Play className="size-5 fill-current" />} autoFocus>
                Start
              </BigButton>
              <div className="grid grid-cols-2 gap-2">
                <SoftButton onClick={() => onStageSelect(true)} icon={unlocked > 1 ? <Rocket className="size-4" /> : <Lock className="size-4" />}>
                  Stages
                </SoftButton>
                <SoftButton onClick={onHelp} icon={<CircleHelp className="size-4" />}>
                  How to
                </SoftButton>
              </div>
              <p className="g-muted hidden text-center text-xs leading-relaxed sm:block">
                <Kbd>WASD</Kbd> fly · <Kbd>Space</Kbd> fire / hold to lock · <Kbd>Q</Kbd>
                <Kbd>E</Kbd> roll · <Kbd>B</Kbd> bomb · <Kbd>Shift</Kbd> boost
              </p>
            </>
          ) : (
            <>
              <p className="g-display text-center text-xs text-[var(--accent)]">Stage select</p>
              <div className="space-y-2">
                {STAGES.map((s, i) => {
                  const open = i < unlocked;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!open}
                      onClick={() => onStage(i)}
                      className="g-soft flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm disabled:opacity-40"
                    >
                      <span className="g-unskew gap-3">
                        <span className="g-display text-[10px] text-[var(--accent)]">{i + 1}</span>
                        <span className="font-bold">{s.name}</span>
                      </span>
                      <span className="g-unskew gap-2 text-xs">{open ? <Medal tier={medals[i] ?? 0} small /> : <Lock className="size-4" />}</span>
                    </button>
                  );
                })}
              </div>
              <p className="g-muted text-center text-xs">Clear a stage to unlock the next.</p>
              <SoftButton onClick={() => onStageSelect(false)}>Back</SoftButton>
            </>
          )}
        </Panel>

        <Panel className="p-4">
          <p className="g-display flex items-center justify-center gap-2 text-xs text-[#ffd166]">
            <Trophy className="size-4" /> High scores
          </p>
          <ol className="mt-3 space-y-1.5 text-sm tabular-nums">
            {scores.map((s, i) => (
              <li key={`${s.name}-${s.score}-${i}`} className="g-tint flex items-center justify-between px-3 py-1.5">
                <span className="flex items-center gap-3">
                  <span className="g-display text-[10px] text-[var(--accent)]">{i + 1}</span>
                  <span className="g-display text-xs text-[#ecfeff]">{s.name}</span>
                </span>
                <span className="font-bold">{formatNumber(s.score)}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function Medal({ tier, small = false }: { tier: number; small?: boolean }) {
  const color = MEDAL_COLORS[tier] ?? MEDAL_COLORS[0];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-grid place-items-center rounded-full border-2 ${small ? "size-5" : "size-16"}`}
        style={{ borderColor: color, background: tier ? `radial-gradient(circle at 35% 30%, #fff8, ${color} 45%, #0008)` : "transparent", boxShadow: tier ? `0 0 14px ${color}` : undefined }}
      >
        {!small && tier > 0 && <span className="g-display text-lg text-[#020617]">{["", "B", "S", "G"][tier]}</span>}
      </span>
      {small && <span className="g-muted text-[10px] uppercase">{tier ? MEDAL_NAMES[tier] : "—"}</span>}
    </span>
  );
}

function Briefing({ stage, medal, touch, onLaunch, onMenu, onHelp }: { stage: number; medal: number; touch: boolean; onLaunch: () => void; onMenu: () => void; onHelp: () => void }) {
  const s = STAGES[stage];
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col justify-end overflow-y-auto">
      <div className="pointer-events-auto absolute top-0 right-0 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>
      <div className="pointer-events-auto mx-auto w-full max-w-md animate-[nova-rise_0.4s_ease-out] px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-10">
        <Panel className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="g-display text-xs text-[var(--accent)]">Stage {stage + 1}</p>
              <h2 className="g-panel-title mt-2 text-xl text-[#ecfeff] sm:text-2xl">{s.name}</h2>
            </div>
            <Medal tier={medal} small />
          </div>
          <p className="text-sm leading-relaxed">{s.brief}</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Boss" value={<span className="text-[10px]">{s.bossName}</span>} />
            <Stat label="Gold" value={`${s.par} hits`} />
            <Stat label="Silver" value={`${Math.ceil(s.par * 0.7)} hits`} />
          </div>
          <BigButton onClick={onLaunch} icon={<Rocket className="size-5" />} autoFocus>
            Launch
          </BigButton>
          <div className="flex items-center justify-between gap-3">
            <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
          {!touch && (
            <p className="g-muted text-center text-xs">
              <Kbd>Enter</Kbd> launch
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ResultsCard({ r, onNext }: { r: StageResult; onNext: () => void }) {
  return (
    <Modal title={r.last ? "Victory" : "Stage clear"} wide>
      <div className="flex items-center justify-center gap-4">
        <Medal tier={r.medal} />
        <div>
          <p className="g-display text-[10px] text-[var(--accent)]">
            {r.stage + 1}. {r.name}
          </p>
          <p className="g-display mt-2 text-sm" style={{ color: MEDAL_COLORS[r.medal] }}>
            {MEDAL_NAMES[r.medal]} medal
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Hits" value={`${r.hits}/${r.par}`} />
        <Stat label="Accuracy" value={`${Math.round(r.accuracy * 100)}%`} />
        <Stat label="Shield" value={`${Math.round(r.shield * 100)}%`} />
        <Stat label="Bonus" value={`+${formatNumber(r.bonus)}`} />
      </div>
      <div className="text-center">
        <p className="g-muted text-xs tracking-[0.2em]">SCORE</p>
        <p className="g-display mt-1 text-2xl text-[#ecfeff] tabular-nums">{formatNumber(r.score)}</p>
      </div>
      {r.last && <p className="text-center text-sm">The station core is down. The sector is safe — for now.</p>}
      <BigButton onClick={onNext} icon={r.last ? <Trophy className="size-5" /> : <Rocket className="size-5" />} autoFocus>
        {r.last ? "Finish" : "Next stage"}
      </BigButton>
    </Modal>
  );
}

function ContinueCard({ score, onContinue, onGiveUp }: { score: number; onContinue: () => void; onGiveUp: () => void }) {
  const [count, setCount] = useState(9);
  useEffect(() => {
    if (count <= 0) {
      onGiveUp();
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [count, onGiveUp]);
  return (
    <Modal title="Continue?">
      <p className="g-title text-center text-6xl text-[#ff2d55]">{count}</p>
      <p className="g-muted text-center text-xs">Score {formatNumber(score)} · continuing resets your score</p>
      <BigButton onClick={onContinue} icon={<Play className="size-5 fill-current" />} autoFocus>
        Continue
      </BigButton>
      <SoftButton onClick={onGiveUp}>Give up</SoftButton>
    </Modal>
  );
}

function InitialsEntry({ score, victory, lastName, onSave }: { score: number; victory: boolean; lastName: string; onSave: (name: string) => void }) {
  const [name, setName] = useState(lastName.replace(/-/g, ""));
  return (
    <Modal title={victory ? "Victory" : "New record"}>
      <div className="text-center">
        <p className="g-muted text-xs tracking-[0.2em]">{victory ? "MISSION COMPLETE · SCORE" : "HIGH SCORE"}</p>
        <p className="g-display mt-2 text-3xl text-[#ffd166] tabular-nums">{formatNumber(score)}</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name);
        }}
      >
        <label className="block text-center text-xs tracking-[0.2em]">
          ENTER YOUR INITIALS
          <input
            autoFocus
            value={name}
            maxLength={3}
            onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            className="g-display mx-auto mt-3 block w-40 border-2 border-[var(--accent)] bg-[#020617] px-3 py-3 text-center text-2xl tracking-[0.3em] text-[#ecfeff] outline-none focus:shadow-[0_0_18px_var(--accent)]"
            aria-label="Initials"
          />
        </label>
        <BigButton onClick={() => onSave(name)}>Save</BigButton>
      </form>
    </Modal>
  );
}

function ControlsHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[2] flex animate-[skate-hint_6s_ease_forwards] justify-center px-4">
      <p className="g-hud px-4 py-2 text-center text-xs">
        WASD / mouse fly · Space / click fire, hold to lock on · Q E roll · Shift boost · B bomb
      </p>
    </div>
  );
}
