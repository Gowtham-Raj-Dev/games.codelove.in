"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, Flag, Gamepad2, Home, Medal, Play, RotateCcw, Timer, Trophy } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { ControlsButton, ControlsEditor } from "../shared/touch-layout";
import {
  BigButton,
  createRecords,
  createStore,
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
} from "../shared/ui";
import { CLASSES, ordinal, TurboKartsGame, type Hud, type Mode, type Phase, type RaceResult } from "./engine";
import { formatTime, HudOverlay, TouchControls, TouchFace, touchControls, touchIds } from "./hud";
import { DRIVERS, GAME } from "./manifest";
import { TRACKS } from "./tracks";

const records = createRecords("turbo-karts:v1", {
  driver: 0,
  cls: 1,
  mode: "cup" as Mode,
  ttTrack: 0,
  /** Best lap and best 3-lap time per circuit id (Time Trial). */
  laps: {} as Record<string, number>,
  races: {} as Record<string, number>,
  /** Best cup finish per class (1..5). */
  cups: {} as Record<string, number>,
  races_run: 0,
  autoGas: null as boolean | null,
});

const EMPTY_HUD: Hud = {
  place: 5,
  racers: 5,
  lap: 1,
  laps: 3,
  time: 0,
  lapTime: 0,
  lastLap: null,
  bestLap: null,
  item: null,
  itemCount: 0,
  rolling: false,
  coins: 0,
  speed: 0,
  drift: 0,
  boost: false,
  shield: false,
  countdown: null,
  wrongWay: false,
  toast: null,
  toastId: 0,
  order: [],
  track: 0,
  race: 0,
  mode: "cup",
};

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyE",
  "KeyK",
  "KeyQ",
  "Enter",
  "NumpadEnter",
]);

/** Touch devices (or the first touch) get on-screen controls, with the gas held down for them. */
const touchInput = (() => {
  let seen = false;
  return {
    subscribe(fn: () => void) {
      const onPointer = (e: PointerEvent) => {
        if (e.pointerType === "touch" && !seen) {
          seen = true;
          fn();
        }
      };
      window.addEventListener("pointerdown", onPointer);
      return () => window.removeEventListener("pointerdown", onPointer);
    },
    get: () => seen || window.matchMedia("(pointer: coarse)").matches,
    server: () => false,
  };
})();

const TROPHY_TONE = ["", "text-yellow-300", "text-slate-200", "text-orange-400"];

interface ShownResult extends RaceResult {
  newLap: boolean;
  newRace: boolean;
}

export function TurboKarts({ sizes }: { sizes: Record<string, number> }) {
  // A page re-render passes a new sizes object; keep the first so the game isn't rebuilt.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<TurboKartsGame | null>(null);
  const gameRef = useRef<TurboKartsGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShownResult | null>(null);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const touch = useSyncExternalStore(touchInput.subscribe, touchInput.get, touchInput.server);
  const saved = useRecords(records);
  const autoGas = saved.autoGas ?? touch;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new TurboKartsGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      result: (r) => {
        const before = records.get();
        const id = TRACKS[r.track].id;
        let newLap = false;
        let newRace = false;
        const patch: Partial<typeof before> = { races_run: before.races_run + 1 };
        if (r.mode === "time") {
          if (r.bestLap > 0 && (!before.laps[id] || r.bestLap < before.laps[id])) {
            newLap = true;
            patch.laps = { ...before.laps, [id]: r.bestLap };
          }
          if (!before.races[id] || r.time < before.races[id]) {
            newRace = true;
            patch.races = { ...before.races, [id]: r.time };
          }
        } else if (r.cupOver) {
          const place = r.cup.find((s) => s.player)?.place ?? 5;
          const key = String(before.cls);
          if (!before.cups[key] || place < before.cups[key]) patch.cups = { ...before.cups, [key]: place };
        }
        records.set(patch);
        setResult({ ...r, newLap, newRace });
      },
    });
    gameRef.current = g;
    setGame(g);
    g.setDriver(records.get().driver);
    void g.load(modelSizes);
    return () => {
      gameRef.current = null;
      g.dispose();
    };
  }, [hud, modelSizes]);

  useEffect(() => {
    game?.setAutoGas(touch && autoGas);
  }, [game, touch, autoGas]);

  const start = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    (document.activeElement as HTMLElement | null)?.blur();
    const r = records.get();
    setResult(null);
    setHelp(false);
    if (r.mode === "cup") g.startCup(r.driver, r.cls);
    else g.startTimeTrial(r.driver, r.cls, r.ttTrack);
  }, []);

  const next = () => {
    setResult(null);
    gameRef.current?.nextRace();
  };
  const retry = () => {
    setResult(null);
    setHelp(false);
    gameRef.current?.restartRace();
  };
  const podium = () => {
    gameRef.current?.showPodium();
  };
  const toMenu = () => {
    setResult(null);
    setHelp(false);
    gameRef.current?.toMenu();
  };

  const racing = phase === "racing" || phase === "countdown" || phase === "intro" || phase === "finished";
  const pauseOrResume = () => {
    const g = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (editing) {
      setEditing(false);
      return;
    }
    if (racing) g?.pause();
    else if (phase === "paused") g?.resume();
  };
  const openHelp = () => {
    if (racing) gameRef.current?.pause();
    setHelp(true);
  };
  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  const changeDriver = (dir: number) => {
    const nextDriver = (records.get().driver + dir + DRIVERS.length) % DRIVERS.length;
    records.set({ driver: nextDriver });
    gameRef.current?.setDriver(nextDriver);
  };

  // Game keys go to the engine while racing; Enter / arrows drive the menus.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || e.ctrlKey || e.metaKey || e.altKey || help || editing) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = e.code === "Enter" || e.code === "NumpadEnter";
      if (phase === "intro" && (confirm || e.code === "Space")) {
        e.preventDefault();
        g.skipIntro();
        return;
      }
      if (racing) {
        if (GAME_CODES.has(e.code)) {
          e.preventDefault();
          g.key(e.code, true);
        }
      } else if (phase === "paused") {
        if (confirm && !onButton) {
          e.preventDefault();
          g.resume();
        }
      } else if (phase === "menu") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
          e.preventDefault();
          changeDriver(e.code === "ArrowLeft" ? -1 : 1);
        }
      } else if (phase === "results" && result && confirm && !onButton) {
        e.preventDefault();
        if (result.mode === "cup" && result.cupOver) podium();
        else if (result.mode === "cup") next();
        else retry();
      } else if (phase === "podium" && confirm && !onButton) {
        e.preventDefault();
        toMenu();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (GAME_CODES.has(e.code)) gameRef.current?.key(e.code, false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Leaving the tab or window pauses the race.
  useEffect(() => {
    const pause = () => {
      gameRef.current?.releaseAll();
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

  const track = TRACKS[hud.get().track] ?? TRACKS[0];
  const showHud = phase === "countdown" || phase === "racing" || phase === "finished" || phase === "paused";

  return (
    <GameRoot
      game={GAME}
      className="bg-[#101010]"
      onPointerDown={() => {
        if (phase === "intro") gameRef.current?.skipIntro();
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Turbo Karts game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !editing && <MenuScreen game={game} onStart={start} onHelp={() => setHelp(true)} onControls={() => setEditing(true)} onDriver={changeDriver} touch={touch} />}
      {/* Controls editor from the title screen: the HUD shows behind it so controls keep clear of it. */}
      {phase === "menu" && editing && <HudOverlay store={hud} game={game} paused={false} onPause={() => {}} touch={touch} trackName={track.name} />}

      {phase === "intro" && <IntroCard trackIndex={hud.get().track} race={hud.get().race} mode={hud.get().mode} />}

      {showHud && <HudOverlay store={hud} game={game} paused={phase === "paused"} onPause={pauseOrResume} touch={touch} trackName={track.name} />}
      {touch && (phase === "racing" || phase === "countdown") && <TouchControls game={game} autoGas={autoGas} />}
      {phase === "racing" && saved.races_run < 2 && !touch && <ControlsHint />}

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={retry} icon={<RotateCcw className="size-4" />}>
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
            <SoftButton onClick={() => records.set({ autoGas: !autoGas })} active={autoGas}>
              Auto-accelerate: {autoGas ? "on" : "off"}
            </SoftButton>
          )}
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
        </Modal>
      )}
      {(phase === "paused" || phase === "menu") && editing && <ControlsEditor controls={touchControls} active={touchIds(autoGas)} face={(id, p) => <TouchFace id={id} at={p} />} onClose={() => setEditing(false)} />}

      {phase === "results" && result && !help && <ResultsPanel result={result} onNext={next} onRetry={retry} onPodium={podium} onMenu={toMenu} />}

      {phase === "podium" && result && !help && <PodiumPanel result={result} onMenu={toMenu} onAgain={start} />}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Menu -------------------------------------------------------------------------------------------

function Bars({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold tracking-wide uppercase">
      <span className="w-16 opacity-70">{label}</span>
      <span className="flex flex-1 gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-2 flex-1 -skew-x-12 ${i <= value ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,currentColor_15%,transparent)]"}`} />
        ))}
      </span>
    </div>
  );
}

function MenuScreen({
  game,
  onStart,
  onHelp,
  onControls,
  onDriver,
  touch,
}: {
  game: TurboKartsGame | null;
  onStart: () => void;
  onHelp: () => void;
  onControls: () => void;
  onDriver: (dir: number) => void;
  touch: boolean;
}) {
  const saved = useRecords(records);
  const driver = DRIVERS[saved.driver] ?? DRIVERS[0];
  const cup = saved.mode === "cup";
  const setMode = (mode: Mode) => {
    records.set({ mode });
    game?.previewTrack(mode === "time" ? saved.ttTrack : 0);
  };
  const setTrack = (i: number) => {
    records.set({ ttTrack: i });
    game?.previewTrack(i);
  };
  const tt = TRACKS[saved.ttTrack] ?? TRACKS[0];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-end">
        <div className="px-4 pt-1 text-center lg:hidden">
          <GameTitle game={GAME} size="sm" />
        </div>
        <div className="flex-1 lg:hidden" />

        <div className="g-panel pointer-events-auto mx-auto mb-[max(env(safe-area-inset-bottom),12px)] max-h-[58vh] w-[calc(100%-24px)] max-w-md overflow-y-auto p-4 sm:p-5 lg:mx-0 lg:mb-6 lg:ml-6 lg:max-h-[calc(100%-24px)] lg:w-[400px]">
          <div className="hidden lg:block">
            <GameTitle game={GAME} size="sm" />
            <p className="g-muted mt-2 text-sm">{GAME.tagline}</p>
          </div>

          <div className="mt-0 grid grid-cols-2 gap-2 lg:mt-5">
            <SoftButton onClick={() => setMode("cup")} active={cup} icon={<Trophy className="size-4" />}>
              Cup
            </SoftButton>
            <SoftButton onClick={() => setMode("time")} active={!cup} icon={<Timer className="size-4" />}>
              Time Trial
            </SoftButton>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {CLASSES.map((c, i) => (
              <SoftButton key={c.name} onClick={() => records.set({ cls: i })} active={saved.cls === i}>
                {c.name}
                {cup && saved.cups[String(i)] && saved.cups[String(i)] <= 3 && <Medal className={`size-3.5 ${TROPHY_TONE[saved.cups[String(i)]]}`} />}
              </SoftButton>
            ))}
          </div>

          {cup ? (
            <p className="g-muted mt-3 text-xs leading-relaxed">
              Three races — {TRACKS.map((t) => t.name).join(", ")}. Points 10-8-6-4-2; most points takes the trophy.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {TRACKS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrack(i)}
                  className={`g-soft flex w-full items-center justify-between px-3 py-2 text-left text-sm ${saved.ttTrack === i ? "" : "opacity-80"}`}
                  data-active={saved.ttTrack === i}
                >
                  <span className="g-unskew w-full justify-between gap-2">
                    <span className="font-bold">{t.name}</span>
                    <span className="text-[11px] tabular-nums opacity-80">
                      Lap {formatTime(saved.laps[t.id] ?? null)} · Race {formatTime(saved.races[t.id] ?? null)}
                    </span>
                  </span>
                </button>
              ))}
              <p className="g-muted text-xs">{tt.blurb} You start with a triple turbo.</p>
            </div>
          )}

          <div className="g-tint mt-4 p-3">
            <div className="flex items-center justify-between">
              <IconButton onClick={() => onDriver(-1)} label="Previous driver" plain>
                <ChevronLeft className="size-6" />
              </IconButton>
              <div className="text-center">
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">Driver</p>
                <p className="g-display flex items-center gap-2 text-2xl italic">
                  <span className="size-3 rounded-full ring-2 ring-black/50" style={{ background: driver.color }} />
                  {driver.name}
                </p>
              </div>
              <IconButton onClick={() => onDriver(1)} label="Next driver" plain>
                <ChevronRight className="size-6" />
              </IconButton>
            </div>
            <div className="mt-2 space-y-1.5">
              <Bars label="Speed" value={driver.speed} />
              <Bars label="Accel" value={driver.accel} />
              <Bars label="Handling" value={driver.handling} />
            </div>
          </div>

          <div className="mt-4">
            <BigButton onClick={onStart} icon={<Flag className="size-6" />} autoFocus>
              {cup ? "Start cup" : "Start trial"}
            </BigButton>
          </div>
          <p className="g-muted mt-3 hidden text-center text-xs sm:block">
            {touch ? "On-screen pedals and steering" : "W/↑ gas · A D / ← → steer · Space drift · E item · Q look back"}
          </p>
        </div>
      </div>
    </div>
  );
}

function IntroCard({ trackIndex, race, mode }: { trackIndex: number; race: number; mode: Mode }) {
  const t = TRACKS[trackIndex] ?? TRACKS[0];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center px-4">
      <div className="g-panel max-w-lg animate-[game-fade_0.4s_ease] px-6 py-4 text-center">
        <p className="g-display text-xs text-[var(--accent)]">{mode === "cup" ? `Grand Prix Cup · Race ${race + 1} of ${TRACKS.length}` : "Time Trial"}</p>
        <h2 className="g-title mt-1 text-4xl sm:text-6xl">{t.name}</h2>
        <p className="g-muted mt-2 text-sm">{t.blurb}</p>
        <p className="mt-3 text-[11px] font-bold tracking-widest uppercase opacity-60">Enter / tap to skip</p>
      </div>
    </div>
  );
}

function ControlsHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 flex animate-[game-fade_0.4s_ease] justify-center px-4 lg:bottom-8">
      <p className="g-hud px-4 py-2 text-center text-sm font-bold">Hold Space while turning to drift · E uses items · Q looks back</p>
    </div>
  );
}

// --- Results ----------------------------------------------------------------------------------------

function Standings({ result, cup }: { result: RaceResult; cup: boolean }) {
  const rows = cup ? result.cup : result.standings;
  return (
    <ol className="space-y-1">
      {rows.map((s) => {
        const d = DRIVERS[s.driver];
        return (
          <li
            key={s.driver}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm italic ${s.player ? "bg-[var(--accent)] font-bold text-black" : "g-tint"}`}
          >
            <span className="g-display w-8 tabular-nums">{ordinal(s.place)}</span>
            <span className="size-3 rounded-full ring-1 ring-black/40" style={{ background: d.color }} />
            <span className="flex-1 font-bold">
              {d.name}
              {s.player && <span className="ml-1 text-xs opacity-75">(you)</span>}
            </span>
            {cup ? (
              <span className="tabular-nums">
                <span className="mr-2 text-xs opacity-70">+{s.points}</span>
                <span className="g-display">{s.total}</span>
              </span>
            ) : (
              <span className="text-xs tabular-nums">{formatTime(s.time)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ResultsPanel({
  result,
  onNext,
  onRetry,
  onPodium,
  onMenu,
}: {
  result: ShownResult;
  onNext: () => void;
  onRetry: () => void;
  onPodium: () => void;
  onMenu: () => void;
}) {
  const cup = result.mode === "cup";
  const [tab, setTab] = useState<"race" | "cup">("race");
  const title = cup ? (result.place === 1 ? "Victory!" : `${ordinal(result.place)} place`) : "Finish!";
  return (
    <Modal title={title} wide>
      <p className="g-muted -mt-2 text-center text-xs font-bold tracking-widest uppercase">
        {TRACKS[result.track].name}
        {cup ? ` · Race ${result.race + 1} of ${TRACKS.length}` : " · Time Trial"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Time" value={formatTime(result.time)} />
        <Stat label="Best lap" value={formatTime(result.bestLap)} />
        <Stat label={cup ? "Points" : "Laps"} value={cup ? `+${result.standings.find((s) => s.player)?.points ?? 0}` : result.lapTimes.length} />
      </div>
      {(result.newLap || result.newRace) && (
        <p className="mx-auto flex w-fit items-center gap-1.5 bg-amber-400 px-3 py-1 text-xs font-black tracking-wider text-amber-950 uppercase">
          <Trophy className="size-3.5" /> {result.newRace && result.newLap ? "New lap & race records" : result.newRace ? "New race record" : "New lap record"}
        </p>
      )}
      {cup ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => setTab("race")} active={tab === "race"}>
              This race
            </SoftButton>
            <SoftButton onClick={() => setTab("cup")} active={tab === "cup"}>
              Cup standings
            </SoftButton>
          </div>
          <Standings result={result} cup={tab === "cup"} />
        </>
      ) : (
        <ol className="space-y-1">
          {result.lapTimes.map((t, i) => (
            <li key={i} className={`g-tint flex justify-between px-3 py-1.5 text-sm tabular-nums ${t === result.bestLap ? "font-bold text-[var(--accent)]" : ""}`}>
              <span>Lap {i + 1}</span>
              <span>{formatTime(t)}</span>
            </li>
          ))}
        </ol>
      )}
      {cup && result.cupOver ? (
        <BigButton onClick={onPodium} icon={<Trophy className="size-6" />} autoFocus>
          Podium
        </BigButton>
      ) : cup ? (
        <BigButton onClick={onNext} icon={<Flag className="size-6" />} autoFocus>
          Next race
        </BigButton>
      ) : (
        <BigButton onClick={onRetry} icon={<RotateCcw className="size-6" />} autoFocus>
          Try again
        </BigButton>
      )}
      <div className="grid grid-cols-2 gap-2">
        {cup && (
          <SoftButton onClick={onRetry} icon={<RotateCcw className="size-4" />}>
            Retry race
          </SoftButton>
        )}
        <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
          Menu
        </SoftButton>
      </div>
    </Modal>
  );
}

function PodiumPanel({ result, onMenu, onAgain }: { result: ShownResult; onMenu: () => void; onAgain: () => void }) {
  const me = result.cup.find((s) => s.player);
  const place = me?.place ?? 5;
  const label = place === 1 ? "Gold cup!" : place === 2 ? "Silver cup!" : place === 3 ? "Bronze cup!" : `${ordinal(place)} overall`;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:inset-y-0 lg:right-6 lg:left-auto lg:items-center lg:p-0">
      <div className="g-panel pointer-events-auto w-full max-w-md space-y-3 p-5 lg:w-[400px]">
        <div className="text-center">
          <Trophy className={`mx-auto size-10 ${TROPHY_TONE[place] ?? "opacity-40"}`} />
          <h2 className="g-panel-title mt-1 text-3xl sm:text-4xl">{label}</h2>
          <p className="g-muted text-xs font-bold tracking-widest uppercase">Grand Prix Cup · final standings</p>
        </div>
        <Standings result={result} cup />
        <div className="grid grid-cols-2 gap-2">
          <SoftButton onClick={onAgain} icon={<RotateCcw className="size-4" />}>
            Race again
          </SoftButton>
          <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
            Menu
          </SoftButton>
        </div>
      </div>
    </div>
  );
}
