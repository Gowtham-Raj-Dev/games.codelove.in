"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, Coins, Home, Lock, Map as MapIcon, Medal, Package, Pause, Play, RotateCcw, Timer, Wrench, Zap } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
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
  type Store,
} from "../shared/ui";
import { COURSES, ISLANDS, REGIONS, UPGRADES, type UpgradeId } from "./data";
import { EMPTY_HUD, SkyCourierGame, type Hud, type KeyName, type MenuView, type Phase, type Result } from "./engine";
import { GAME } from "./manifest";

const records = createRecords("sky-courier:v1", {
  bank: 0,
  region: 0,
  unlocked: 1,
  engine: 0,
  tank: 0,
  hull: 0,
  bestDay: [0, 0, 0] as number[],
  deliveries: 0,
  shifts: 0,
  trials: [0, 0, 0] as number[],
  medals: [0, 0, 0] as number[],
});

type Saved = ReturnType<typeof records.get>;
type Screen = "home" | "routes" | "hangar" | "trials";
type GameRef = { current: SkyCourierGame | null };
type Outcome = Result & { newBest: boolean; prevBest: number };

const KEYMAP: Record<string, KeyName> = {
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  shift: "thrUp",
  r: "thrUp",
  control: "thrDown",
  q: "thrDown",
  " ": "boost",
  c: "look",
};

const MEDALS = ["—", "Bronze", "Silver", "Gold"];
const MEDAL_COLORS = ["#8a93a6", "#cd7f32", "#c0c7d4", "#d4af37"];
const formatTime = (s: number) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
};
const upgradeCost = (id: UpgradeId, level: number) => UPGRADES.find((u) => u.id === id)!.costs[level] ?? null;

export function SkyCourier({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SkyCourierGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [touch, setTouch] = useState(false);
  const [lastRun, setLastRun] = useState<{ kind: "shift" | "trial"; id: number }>({ kind: "shift", id: 0 });
  const saved = useRecords(records);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const sync = () => setTouch(coarse.matches);
    sync();
    coarse.addEventListener("change", sync);
    return () => coarse.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new SkyCourierGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      result: (r) => {
        const before = records.get();
        if (r.kind === "shift") {
          const prevBest = before.bestDay[r.region] ?? 0;
          const bestDay = [...before.bestDay];
          bestDay[r.region] = Math.max(prevBest, r.earned);
          records.set({ bank: before.bank + r.earned, bestDay, deliveries: before.deliveries + r.delivered, shifts: before.shifts + 1 });
          setOutcome({ ...r, newBest: r.earned > prevBest && r.earned > 0, prevBest });
        } else {
          const prevBest = before.trials[r.course] ?? 0;
          const better = r.time > 0 && (!prevBest || r.time < prevBest);
          const trials = [...before.trials];
          const medals = [...before.medals];
          if (better) trials[r.course] = r.time;
          medals[r.course] = Math.max(medals[r.course] ?? 0, r.medal);
          const bonus = better ? [0, 40, 80, 150][r.medal] : 0;
          records.set({ trials, medals, bank: before.bank + bonus });
          setOutcome({ ...r, newBest: better, prevBest });
        }
      },
    });
    gameRef.current = game;
    game.setOverlay(overlayRef.current);
    game.setFont(getComputedStyle(canvas).getPropertyValue("--game-display"));
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  const upgrades = useCallback(() => {
    const s = records.get();
    return { engine: s.engine, tank: s.tank, hull: s.hull };
  }, []);

  const startShift = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setOutcome(null);
    setHelp(false);
    const region = Math.min(records.get().region, records.get().unlocked - 1);
    setLastRun({ kind: "shift", id: region });
    game.startShift(region, upgrades());
  }, [upgrades]);

  const startTrial = useCallback(
    (course: number) => {
      const game = gameRef.current;
      if (!game) return;
      (document.activeElement as HTMLElement | null)?.blur();
      setOutcome(null);
      setHelp(false);
      setLastRun({ kind: "trial", id: course });
      game.startTrial(course, upgrades());
    },
    [upgrades],
  );

  const toMenu = useCallback((next: Screen = "home") => {
    setOutcome(null);
    setScreen(next);
    gameRef.current?.setMenuView(next === "routes" || next === "trials" ? "map" : "ship");
    gameRef.current?.toMenu();
  }, []);

  const go = (next: Screen) => {
    setScreen(next);
    gameRef.current?.setMenuView((next === "routes" || next === "trials" ? "map" : "ship") as MenuView);
  };

  const pauseOrResume = useCallback(() => {
    const game = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (game?.currentPhase === "playing") game.pause();
    else if (game?.currentPhase === "paused") game.resume();
    else if (game?.currentPhase === "menu" && screen !== "home") go("home");
  }, [help, screen]);

  const openHelp = useCallback(() => {
    if (gameRef.current?.currentPhase === "playing") gameRef.current.pause();
    setHelp(true);
  }, []);

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Flight keys. Ctrl alone is throttle down; Q does the same without browser shortcuts in the way.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || help) return;
      const k = e.key.toLowerCase();
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (phase === "playing") {
        const name = KEYMAP[k];
        if (name) {
          e.preventDefault();
          game.setKey(name, true);
        } else if (k === "e" && !e.repeat) {
          e.preventDefault();
          game.action();
        }
      } else if (phase === "menu" && screen === "home" && (k === "enter" || k === " ") && !onButton) {
        e.preventDefault();
        startShift();
      } else if (phase === "paused" && k === "enter" && !onButton) {
        e.preventDefault();
        game.resume();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const name = KEYMAP[e.key.toLowerCase()];
      if (name) gameRef.current?.setKey(name, false);
      // Releasing Shift / Ctrl can swallow the other key's keyup: drop both throttle keys.
      if (e.key === "Shift" || e.key === "Control") {
        gameRef.current?.setKey("thrUp", false);
        gameRef.current?.setKey("thrDown", false);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [phase, help, screen, startShift]);

  // Leaving the tab or window pauses the flight.
  useEffect(() => {
    const pause = () => {
      gameRef.current?.releaseInput();
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

  const onMinimap = useCallback((canvas: HTMLCanvasElement | null) => gameRef.current?.setMinimap(canvas), []);

  const buyUpgrade = (id: UpgradeId) => {
    const s = records.get();
    const cost = upgradeCost(id, s[id]);
    if (cost === null || s.bank < cost) return;
    records.set({ bank: s.bank - cost, [id]: s[id] + 1 } as Partial<Saved>);
    gameRef.current?.sfx.medal(1);
  };

  const unlockRegion = (id: number) => {
    const s = records.get();
    const r = REGIONS[id];
    if (id !== s.unlocked || s.bank < r.cost) return;
    records.set({ bank: s.bank - r.cost, unlocked: id + 1, region: id });
    gameRef.current?.sfx.medal(2);
  };

  const running = phase === "playing" || phase === "paused";

  return (
    <GameRoot game={GAME} className="bg-[#0b1d33]">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Sky Courier game" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 block h-full w-full" aria-hidden />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !help && (
        <>
          {screen === "home" && <HomeScreen saved={saved} onStart={startShift} onGo={go} onHelp={() => setHelp(true)} />}
          {screen === "routes" && <RoutesScreen saved={saved} onBack={() => go("home")} onUnlock={unlockRegion} onStart={startShift} />}
          {screen === "hangar" && <HangarScreen saved={saved} onBack={() => go("home")} onBuy={buyUpgrade} />}
          {screen === "trials" && <TrialsScreen saved={saved} onBack={() => go("home")} onStart={startTrial} />}
        </>
      )}

      {running && <HudOverlay store={hud} touch={touch} paused={phase === "paused"} onPause={pauseOrResume} onMinimap={onMinimap} saved={saved} firstShifts={saved.shifts < 2} />}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={() => (lastRun.kind === "shift" ? startShift() : startTrial(lastRun.id))} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={() => toMenu()} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
        </Modal>
      )}

      {phase === "results" && outcome && !help && (
        <ResultsModal
          outcome={outcome}
          saved={saved}
          onAgain={() => (outcome.kind === "shift" ? startShift() : startTrial(outcome.course))}
          onHangar={() => toMenu("hangar")}
          onMenu={() => toMenu()}
        />
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Bits ------------------------------------------------------------------------------------------------

function Rule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#d4af37]/70" />
      <span className="size-1.5 rotate-45 bg-[#d4af37]" />
      <span className="h-px flex-1 bg-[#d4af37]/70" />
    </div>
  );
}

function CoinChip({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`g-hud inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold tabular-nums ${className}`}>
      <Coins className="size-4 text-[#d4af37]" /> {formatNumber(value)}
    </span>
  );
}

function TopBar({ onHelp, children }: { onHelp?: () => void; children?: ReactNode }) {
  return (
    <div className="pointer-events-auto flex items-center justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
      <div className="flex items-center gap-2">
        {children}
      </div>
      <SystemButtons onHelp={onHelp} />
    </div>
  );
}

function ScreenFrame({ title, kicker, onBack, children, wide = false }: { title: string; kicker: string; onBack: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className={`mx-auto flex min-h-full w-full flex-col justify-center px-4 py-6 ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <div className="g-panel p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="g-display text-[11px] text-[var(--accent)]">{kicker}</p>
              <h2 className="g-panel-title mt-1 text-2xl sm:text-3xl">{title}</h2>
            </div>
            <IconButton onClick={onBack} label="Back (Esc)">
              <ChevronLeft className="size-5" />
            </IconButton>
          </div>
          <Rule className="my-4" />
          {children}
        </div>
      </div>
    </div>
  );
}

// --- Menu screens --------------------------------------------------------------------------------------------

function HomeScreen({ saved, onStart, onGo, onHelp }: { saved: Saved; onStart: () => void; onGo: (s: Screen) => void; onHelp: () => void }) {
  const region = REGIONS[Math.min(saved.region, saved.unlocked - 1)];
  const cycle = (dir: number) => {
    const n = saved.unlocked;
    records.set({ region: (Math.min(saved.region, n - 1) + dir + n) % n });
  };
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <TopBar onHelp={onHelp}>
        <CoinChip value={saved.bank} className="hidden sm:inline-flex" />
      </TopBar>
      <div className="px-4 pt-1 text-center sm:pt-3">
        <p className="g-display text-[11px] text-[#f8f1e3]/85 [text-shadow:0_1px_6px_#0b1d33]">Imperial air mail · est. 1926</p>
        <div className="mt-2">
          <GameTitle game={GAME} />
        </div>
        <p className="g-display mx-auto mt-3 max-w-md text-xs text-[#f8f1e3] [text-shadow:0_1px_8px_#0b1d33] sm:text-sm">Parcels by airship · on time, every time</p>
      </div>
      <div className="flex-1" />
      <div className="pointer-events-auto mx-auto w-full max-w-md px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <div className="g-panel space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <IconButton onClick={() => cycle(-1)} label="Previous route" plain>
              <ChevronLeft className="size-5" />
            </IconButton>
            <div className="min-w-0 text-center">
              <p className="g-muted text-[10px] font-bold tracking-[0.2em] uppercase">Today&apos;s route</p>
              <p className="g-display truncate text-lg">{region.name}</p>
              <p className="g-muted text-[11px]">
                Pay ×{region.pay.toFixed(2)} · best day {formatNumber(saved.bestDay[region.id] ?? 0)}
              </p>
            </div>
            <IconButton onClick={() => cycle(1)} label="Next route" plain>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
          <BigButton onClick={onStart} icon={<Play className="size-6 fill-current" />} autoFocus>
            Start shift
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={() => onGo("routes")} icon={<MapIcon className="size-4" />}>
              Routes
            </SoftButton>
            <SoftButton onClick={() => onGo("hangar")} icon={<Wrench className="size-4" />}>
              Hangar
            </SoftButton>
            <SoftButton onClick={() => onGo("trials")} icon={<Timer className="size-4" />}>
              Trials
            </SoftButton>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Bank" value={formatNumber(saved.bank)} />
            <Stat label="Delivered" value={formatNumber(saved.deliveries)} />
            <Stat label="Medals" value={saved.medals.filter((m) => m > 0).length + " / 3"} />
          </div>
        </div>
        <p className="mt-3 hidden text-center text-xs font-semibold text-[#f8f1e3]/90 [text-shadow:0_1px_4px_#0b1d33] sm:block">
          A D steer · W S climb · Shift / Ctrl throttle · Space boost · Esc pause
        </p>
      </div>
    </div>
  );
}

function RouteMap({ saved, highlight }: { saved: Saved; highlight: number }) {
  // North (−z) is up.
  const s = 0.16;
  const cx = 210;
  const cy = 190;
  const colors = ["#7cc4ff", "#ffd25a", "#e88aa8"];
  return (
    <svg viewBox="0 0 420 380" className="w-full rounded-[2px] border border-[#d4af37]/60 bg-[#0b1d33]" role="img" aria-label="Route map of the floating islands">
      <defs>
        <radialGradient id="sc-sea" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0b1d33" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="420" height="380" fill="url(#sc-sea)" />
      {[60, 120, 180].map((r) => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#d4af37" strokeOpacity="0.15" />
      ))}
      {ISLANDS.map((i) => {
        const x = cx + i.x * s;
        const y = cy + i.z * s;
        const locked = i.region >= saved.unlocked;
        const on = i.region <= highlight;
        return (
          <g key={i.id} opacity={locked ? 0.4 : 1}>
            <circle cx={x} cy={y} r={i.size * s * 0.55 + 3} fill={on ? colors[i.region] : "#f8f1e3"} fillOpacity={on ? 0.9 : 0.35} stroke="#0b1d33" strokeWidth="1.5" />
            {i.kind === "hub" && <circle cx={x} cy={y} r={i.size * s * 0.55 + 7} fill="none" stroke="#d4af37" strokeWidth="1.5" />}
            <text x={x} y={y - i.size * s * 0.55 - 6} textAnchor="middle" fontSize="9" fill="#f8f1e3" style={{ letterSpacing: "0.08em" }}>
              {i.name.toUpperCase()}
            </text>
          </g>
        );
      })}
      <text x="406" y="22" textAnchor="end" fontSize="11" fill="#d4af37">
        N ↑
      </text>
    </svg>
  );
}

function RoutesScreen({ saved, onBack, onUnlock, onStart }: { saved: Saved; onBack: () => void; onUnlock: (id: number) => void; onStart: () => void }) {
  const selected = Math.min(saved.region, saved.unlocked - 1);
  return (
    <ScreenFrame title="Route map" kicker="Choose today's route" onBack={onBack} wide>
      <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
        <RouteMap saved={saved} highlight={selected} />
        <div className="space-y-2.5">
          {REGIONS.map((r) => {
            const open = r.id < saved.unlocked;
            const next = r.id === saved.unlocked;
            const active = r.id === selected;
            return (
              <div key={r.id} className={`g-tint relative rounded-[2px] border p-3 ${active ? "border-[var(--accent)]" : "border-[#d4af37]/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="g-display text-sm">{r.name}</p>
                  <span className="text-xs font-bold tabular-nums text-[#d4af37]">Pay ×{r.pay.toFixed(2)}</span>
                </div>
                <p className="g-muted mt-1 text-xs leading-relaxed">{r.blurb}</p>
                <div className="mt-2">
                  {open ? (
                    <SoftButton onClick={() => records.set({ region: r.id })} active={active}>
                      {active ? "Selected" : "Fly this route"}
                    </SoftButton>
                  ) : next ? (
                    <SoftButton onClick={() => onUnlock(r.id)} icon={<Lock className="size-4" />}>
                      {saved.bank >= r.cost ? `Open for ${formatNumber(r.cost)} coins` : `Needs ${formatNumber(r.cost)} coins`}
                    </SoftButton>
                  ) : (
                    <p className="g-muted flex items-center gap-1.5 text-xs">
                      <Lock className="size-3.5" /> Open {REGIONS[r.id - 1].name} first
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-1">
            <CoinChip value={saved.bank} />
          </div>
          <BigButton onClick={onStart} icon={<Play className="size-5 fill-current" />}>
            Start shift
          </BigButton>
        </div>
      </div>
    </ScreenFrame>
  );
}

function HangarScreen({ saved, onBack, onBuy }: { saved: Saved; onBack: () => void; onBuy: (id: UpgradeId) => void }) {
  return (
    <ScreenFrame title="The hangar" kicker="Refit your airship" onBack={onBack}>
      <div className="space-y-3">
        {UPGRADES.map((u) => {
          const level = saved[u.id];
          const cost = upgradeCost(u.id, level);
          return (
            <div key={u.id} className="g-tint rounded-[2px] border border-[#d4af37]/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="g-display text-sm">{u.name}</p>
                <span className="flex gap-1" aria-label={`Level ${level} of ${u.costs.length}`}>
                  {u.costs.map((_, i) => (
                    <span key={i} className={`h-2 w-5 rounded-[1px] ${i < level ? "bg-[var(--accent)]" : "bg-[#f8f1e3]/20"}`} />
                  ))}
                </span>
              </div>
              <p className="g-muted mt-1 text-xs">{u.text}</p>
              <div className="mt-2">
                {cost === null ? (
                  <p className="text-xs font-bold text-[#d4af37]">Fully upgraded</p>
                ) : (
                  <SoftButton onClick={() => onBuy(u.id)} icon={<Coins className="size-4 text-[#d4af37]" />}>
                    {saved.bank >= cost ? `Fit for ${formatNumber(cost)}` : `Needs ${formatNumber(cost)}`}
                  </SoftButton>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between">
          <p className="g-muted text-xs">Tips from every shift land in the bank.</p>
          <CoinChip value={saved.bank} />
        </div>
      </div>
    </ScreenFrame>
  );
}

function TrialsScreen({ saved, onBack, onStart }: { saved: Saved; onBack: () => void; onStart: (course: number) => void }) {
  return (
    <ScreenFrame title="Ring trials" kicker="Race the clock through the rings" onBack={onBack}>
      <div className="space-y-3">
        {COURSES.map((c) => {
          const open = c.region < saved.unlocked;
          const medal = saved.medals[c.id] ?? 0;
          return (
            <div key={c.id} className="g-tint rounded-[2px] border border-[#d4af37]/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="g-display text-sm">{c.name}</p>
                <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: MEDAL_COLORS[medal] }}>
                  <Medal className="size-4" /> {MEDALS[medal]}
                </span>
              </div>
              <p className="g-muted mt-1 text-xs">{c.blurb}</p>
              <p className="mt-1.5 text-[11px] tabular-nums">
                <span className="g-muted">Best</span> {formatTime(saved.trials[c.id] ?? 0)} <span className="g-muted">· Gold {c.medals[0]} s · Silver {c.medals[1]} s · Bronze {c.medals[2]} s</span>
              </p>
              <div className="mt-2">
                {open ? (
                  <SoftButton onClick={() => onStart(c.id)} icon={<Play className="size-4 fill-current" />}>
                    Race
                  </SoftButton>
                ) : (
                  <p className="g-muted flex items-center gap-1.5 text-xs">
                    <Lock className="size-3.5" /> Open the {REGIONS[c.region].name} route first
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <p className="g-muted text-xs">New personal bests pay a bonus: 40 bronze · 80 silver · 150 gold.</p>
      </div>
    </ScreenFrame>
  );
}

// --- Results ------------------------------------------------------------------------------------------------

function ResultsModal({ outcome, saved, onAgain, onHangar, onMenu }: { outcome: Outcome; saved: Saved; onAgain: () => void; onHangar: () => void; onMenu: () => void }) {
  if (outcome.kind === "trial") {
    const c = COURSES[outcome.course];
    return (
      <Modal title={outcome.time ? `${MEDALS[outcome.medal] === "—" ? "Finished" : `${MEDALS[outcome.medal]} medal`}` : "Out of time"}>
        <div className="text-center">
          <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">{c.name}</p>
          <p className="g-display text-5xl tabular-nums" style={{ color: MEDAL_COLORS[outcome.medal] }}>
            {formatTime(outcome.time)}
          </p>
          {outcome.newBest && <p className="mt-2 inline-block bg-[#d4af37] px-3 py-1 text-xs font-black tracking-wider text-[#0b1d33] uppercase">New best</p>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Best" value={formatTime(saved.trials[outcome.course] ?? 0)} />
          <Stat label="Gold" value={`${c.medals[0]} s`} />
          <Stat label="Silver" value={`${c.medals[1]} s`} />
        </div>
        <BigButton onClick={onAgain} icon={<RotateCcw className="size-5" />} autoFocus>
          Race again
        </BigButton>
        <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
          Menu
        </SoftButton>
      </Modal>
    );
  }
  const r = outcome;
  return (
    <Modal title={r.reason === "hull" ? "Forced landing" : "Day's ledger"} wide>
      <div className="text-center">
        <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">{REGIONS[r.region].name} · tips earned</p>
        <p className="g-display text-6xl tabular-nums text-[#d4af37]">{formatNumber(r.earned)}</p>
        {r.newBest && <p className="mt-2 inline-block bg-[#d4af37] px-3 py-1 text-xs font-black tracking-wider text-[#0b1d33] uppercase">Best day on this route</p>}
        {r.reason === "hull" && <p className="g-muted mt-2 text-xs">The hull gave out — a tug towed you home. You keep today&apos;s tips.</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Delivered" value={r.delivered} />
        <Stat label="On time" value={r.onTime} />
        <Stat label="Best chain" value={r.bestChain} />
        <Stat label="Rings" value={r.rings} />
      </div>
      <p className="g-muted text-center text-xs">
        Bank: <span className="font-bold text-[#f8f1e3]">{formatNumber(saved.bank)}</span> coins
      </p>
      <BigButton onClick={onAgain} icon={<Play className="size-5 fill-current" />} autoFocus>
        Next shift
      </BigButton>
      <div className="grid grid-cols-2 gap-2">
        <SoftButton onClick={onHangar} icon={<Wrench className="size-4" />}>
          Hangar
        </SoftButton>
        <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
          Menu
        </SoftButton>
      </div>
    </Modal>
  );
}

// --- HUD --------------------------------------------------------------------------------------------------------

function Dial({ value, max, label, unit }: { value: number; max: number; label: string; unit: string }) {
  const k = Math.min(1, Math.max(0, value / max));
  const a = -120 + k * 240;
  const ticks = Array.from({ length: 9 }, (_, i) => -120 + i * 30);
  return (
    <div className="g-hud relative w-[88px] px-1 pt-1 pb-1.5 text-center sm:w-[104px]">
      <svg viewBox="0 0 100 64" className="w-full" aria-hidden>
        <path d="M 14 58 A 40 40 0 1 1 86 58" fill="none" stroke="#d4af37" strokeOpacity="0.35" strokeWidth="2" />
        {ticks.map((t) => (
          <line key={t} x1="50" y1="12" x2="50" y2={t % 60 === 0 ? 19 : 16} stroke="#d4af37" strokeWidth="2" transform={`rotate(${t} 50 50)`} />
        ))}
        <line x1="50" y1="50" x2="50" y2="17" stroke="#f8f1e3" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 50 50)`} />
        <circle cx="50" cy="50" r="4.5" fill="#d4af37" />
      </svg>
      <p className="g-display -mt-1 text-base leading-none tabular-nums sm:text-lg">{Math.round(value)}</p>
      <p className="text-[9px] font-bold tracking-[0.18em] uppercase opacity-70">
        {label} · {unit}
      </p>
    </div>
  );
}

function Bar({ value, color, label, icon, warn = false }: { value: number; color: string; label: string; icon: ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`shrink-0 ${warn ? "animate-pulse text-[#ff8a6b]" : "text-[#d4af37]"}`}>{icon}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-[1px] bg-[#f8f1e3]/15 ring-1 ring-[#d4af37]/50" role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full transition-[width] duration-100" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function Ticket({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "express" | "late" }) {
  const border = tone === "express" ? "#e8892b" : tone === "late" ? "#c0392b" : "#d4af37";
  return (
    <div
      className="relative overflow-hidden rounded-[2px] py-2 pr-3 pl-6 text-[#0b1d33] shadow-[0_6px_18px_#0007]"
      style={{ background: "var(--g-btn)", border: `2px solid ${border}` }}
    >
      <span className="absolute top-1/2 left-1.5 size-2.5 -translate-y-1/2 rounded-full bg-[#0b1d33]" aria-hidden />
      <span className="absolute inset-y-1 left-5 border-l border-dashed border-[#0b1d33]/40" aria-hidden />
      {children}
    </div>
  );
}

function ParcelTag({ hud }: { hud: Hud }) {
  const c = hud.carry;
  if (c) {
    const late = c.left < 0;
    const k = Math.max(0, c.left / c.time);
    return (
      <Ticket tone={late ? "late" : c.express ? "express" : "plain"}>
        <div className="flex items-center justify-between gap-3 text-[10px] font-bold tracking-[0.18em] uppercase">
          <span className="inline-flex items-center gap-1">
            <Package className="size-3.5" /> {c.express ? "Express air mail" : "Air mail"}
          </span>
          <span className="tabular-nums">{c.pay} coins</span>
        </div>
        <p className="g-display mt-0.5 truncate text-lg leading-tight sm:text-xl">To {c.to}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-[1px] bg-[#0b1d33]/15">
            <div className="h-full" style={{ width: `${k * 100}%`, background: late ? "#c0392b" : k < 0.3 ? "#e8892b" : "#1e6fb8" }} />
          </div>
          <span className={`g-display w-14 text-right text-sm tabular-nums ${late ? "text-[#c0392b]" : ""}`}>{late ? "LATE" : `${Math.ceil(c.left)} s`}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] font-semibold tabular-nums">
          <span>{Math.round(c.dist)} m to go</span>
          <span>Parcel {Math.round(c.condition * 100)}%</span>
        </div>
      </Ticket>
    );
  }
  if (!hud.offers.length) return null;
  return (
    <div className="space-y-1.5">
      {hud.offers.map((o, i) => (
        <Ticket key={i} tone={o.express ? "express" : "plain"}>
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold tracking-[0.16em] uppercase">
            <span>{o.express ? "Express · pick up" : "Pick up"}</span>
            <span className="tabular-nums">{o.pay} coins</span>
          </div>
          <p className="truncate text-sm font-bold">
            {o.from} <span className="opacity-60">→</span> {o.to}
          </p>
          <p className="text-[11px] font-semibold tabular-nums opacity-75">
            {Math.round(o.away)} m away · {Math.round(o.dist)} m run · {o.time} s
          </p>
        </Ticket>
      ))}
    </div>
  );
}

function HudOverlay({
  store,
  touch,
  paused,
  onPause,
  onMinimap,
  saved,
  firstShifts,
}: {
  store: Store<Hud>;
  touch: boolean;
  paused: boolean;
  onPause: () => void;
  onMinimap: (c: HTMLCanvasElement | null) => void;
  saved: Saved;
  firstShifts: boolean;
}) {
  const hud = useStore(store);
  const trial = hud.trial;
  const kt = hud.speed * 1.94;
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top-left: clock and coins (shift) or race clock (trial). */}
      <div className="absolute top-0 left-0 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        {trial ? (
          <div className="g-hud min-w-[120px] px-3 py-2">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase opacity-70">{trial.name}</p>
            <p className="g-display text-2xl tabular-nums sm:text-3xl">{formatTime(trial.time) === "—" ? "0:00.00" : formatTime(trial.time)}</p>
            <p className="text-xs font-bold tabular-nums">
              Ring {Math.min(trial.ring + 1, trial.total)} / {trial.total}
            </p>
            {saved.trials[COURSES.findIndex((c) => c.name === trial.name)] ? (
              <p className="text-[11px] tabular-nums opacity-70">Best {formatTime(saved.trials[COURSES.findIndex((c) => c.name === trial.name)])}</p>
            ) : null}
          </div>
        ) : (
          <div className="g-hud w-[124px] px-3 py-2 sm:w-[150px]">
            <div className="flex items-baseline justify-between">
              <p className="g-display text-2xl tabular-nums sm:text-3xl">{hud.clock}</p>
            </div>
            <div className="mt-1 h-1 overflow-hidden bg-[#f8f1e3]/15">
              <div className="h-full bg-[#d4af37]" style={{ width: `${hud.dayFrac * 100}%` }} />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-bold tabular-nums">
              <Coins className="size-4 text-[#d4af37]" /> {formatNumber(hud.coins)}
            </p>
            {hud.chain > 1 && <p className="text-[11px] font-bold text-[var(--accent)]">Chain ×{(1 + 0.1 * Math.min(10, hud.chain)).toFixed(1)}</p>}
          </div>
        )}
      </div>

      {/* Top-centre: the parcel tag. */}
      {!trial && (
        <div className={`absolute left-1/2 w-[min(330px,calc(100%-170px))] -translate-x-1/2 ${touch ? "top-[max(env(safe-area-inset-top),12px)] w-[min(300px,calc(100%-24px))] translate-y-[118px]" : "top-3 sm:top-5"}`}>
          <ParcelTag hud={hud} />
          {firstShifts && <p className="g-hud mt-1.5 px-2 py-1 text-center text-[11px] font-semibold">{hud.carry ? "Follow the arrow to the blue beam" : "Fly into a gold beam to load a parcel"}</p>}
        </div>
      )}

      {/* Top-right: pause, system buttons, minimap. */}
      <div className="absolute top-0 right-0 flex items-start gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <canvas ref={onMinimap} className={`block rounded-full ${touch ? "size-24" : "size-28 sm:size-36"}`} aria-label="Minimap" />
        <div className="pointer-events-auto flex flex-col gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          {!touch && <SystemButtons vertical />}
        </div>
      </div>

      {/* Countdown. */}
      {trial && trial.countdown > 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <p key={Math.ceil(trial.countdown)} className="g-title animate-[game-fade_0.3s_ease] text-8xl">
            {Math.ceil(trial.countdown)}
          </p>
        </div>
      )}

      {/* Toast. */}
      {hud.toast && (
        <div key={hud.toast.id} className={`absolute left-1/2 w-[min(320px,calc(100%-24px))] -translate-x-1/2 animate-[game-fade_0.3s_ease] ${touch ? "top-[46%]" : "top-[30%]"}`}>
          <div className={`g-panel px-4 py-3 text-center ${hud.toast.tone === "bad" ? "border-[#c0392b]!" : ""}`}>
            <p className={`g-display text-lg ${hud.toast.tone === "gold" ? "text-[#d4af37]" : hud.toast.tone === "good" ? "text-[var(--accent)]" : ""}`}>{hud.toast.title}</p>
            {hud.toast.lines.map((l) => (
              <p key={l} className="text-sm font-semibold">
                {l}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Bottom-centre: prompt and warnings. */}
      <div className={`absolute inset-x-0 flex flex-col items-center gap-2 px-4 ${touch ? "bottom-[190px]" : "bottom-[150px] sm:bottom-[132px]"}`}>
        {hud.warn && <p className="g-hud animate-pulse px-3 py-1.5 text-sm font-bold text-[#ffcf9a]">{hud.warn}</p>}
        {hud.prompt && !touch && <p className="g-hud px-3 py-1.5 text-sm font-bold">{hud.prompt}</p>}
      </div>

      {/* Bottom: gauges and meters. */}
      <div className={`absolute flex items-end gap-2 ${touch ? "top-[max(calc(env(safe-area-inset-top)+12px),12px)] left-1/2 hidden" : "bottom-0 left-0 p-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:p-5"}`}>
        <Dial value={kt} max={130} label="Speed" unit="kt" />
        <Dial value={hud.alt} max={320} label="Alt" unit="m" />
        <div className="g-hud flex h-[86px] w-9 flex-col items-center justify-end gap-1 px-1.5 py-1.5 sm:h-[98px]">
          <div className="relative w-2.5 flex-1 overflow-hidden bg-[#f8f1e3]/15 ring-1 ring-[#d4af37]/50">
            <div className="absolute inset-x-0 bottom-0 bg-[#d4af37]" style={{ height: `${hud.throttle * 100}%` }} />
          </div>
          <span className="text-[8px] font-bold tracking-wider uppercase opacity-70">Thr</span>
        </div>
      </div>
      <div className={`absolute ${touch ? "inset-x-0 top-[max(calc(env(safe-area-inset-top)+104px),104px)] px-3" : "right-0 bottom-0 w-[230px] p-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:w-[260px] sm:p-5"}`}>
        <div className={`g-hud space-y-2 px-3 py-2.5 ${touch ? "mx-auto max-w-[220px] py-1.5" : ""}`}>
          <Bar value={hud.boost / hud.boostCap} color={hud.boosting ? "#bfe6ff" : "var(--accent)"} label="Boost" icon={<Zap className="size-4" />} />
          {hud.mode === "shift" && <Bar value={hud.hull / hud.maxHull} color={hud.hull / hud.maxHull < 0.3 ? "#e85d4a" : "#f8f1e3"} label="Hull" icon={<Wrench className="size-4" />} warn={hud.hull / hud.maxHull < 0.3} />}
          {touch && (
            <p className="text-center text-[11px] font-bold tabular-nums">
              {Math.round(kt)} kt · {Math.round(hud.alt)} m
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Touch controls ------------------------------------------------------------------------------------------------

function TouchControls({ game, store }: { game: GameRef; store: Store<Hud> }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <Joystick game={game} />
      <div className="flex items-end gap-3">
        <BoostButton game={game} store={store} />
        <ThrottleSlider game={game} store={store} />
      </div>
    </div>
  );
}

function Joystick({ game }: { game: GameRef }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const state = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const R = 48;
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.cx;
    let dy = e.clientY - s.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    setKnob({ x: dx, y: dy });
    const x = dx / R;
    const y = -dy / R;
    game.current?.setStick(Math.abs(x) < 0.1 ? 0 : x, Math.abs(y) < 0.15 ? 0 : y);
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (state.current?.id !== e.pointerId) return;
    state.current = null;
    setKnob({ x: 0, y: 0 });
    game.current?.setStick(0, 0);
  };
  return (
    <div
      className="g-hud pointer-events-auto relative grid size-36 touch-none place-items-center rounded-full!"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        state.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Flight stick: left and right to steer, up to climb, down to dive"
      role="application"
    >
      <span className="g-display absolute top-1.5 text-[10px] leading-none">Climb</span>
      <span className="g-display absolute bottom-1.5 text-[10px] leading-none">Dive</span>
      <span className="absolute left-2.5 text-sm opacity-70">◀</span>
      <span className="absolute right-2.5 text-sm opacity-70">▶</span>
      <span className="g-btn size-14 rounded-full!" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

function BoostButton({ game, store }: { game: GameRef; store: Store<Hud> }) {
  const hud = useStore(store);
  const k = hud.boost / hud.boostCap;
  return (
    <button
      type="button"
      className="pointer-events-auto relative grid size-[84px] touch-none place-items-center rounded-full p-[5px] select-none"
      style={{ background: `conic-gradient(var(--accent) ${k * 360}deg, rgb(11 29 51 / 0.6) ${k * 360}deg)` }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        game.current?.setBoost(true);
      }}
      onPointerUp={() => game.current?.setBoost(false)}
      onPointerCancel={() => game.current?.setBoost(false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Boost"
    >
      <span className={`g-btn grid size-full place-items-center rounded-full! ${k > 0.05 ? "" : "opacity-60 grayscale"}`}>
        <span className="flex flex-col items-center leading-none">
          <Zap className="size-6" />
          <span className="mt-0.5 text-[10px]">Boost</span>
        </span>
      </span>
    </button>
  );
}

function ThrottleSlider({ game, store }: { game: GameRef; store: Store<Hud> }) {
  const hud = useStore(store);
  const ref = useRef<HTMLDivElement>(null);
  const set = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    game.current?.setThrottle(1 - (e.clientY - r.top) / r.height);
  };
  return (
    <div
      ref={ref}
      className="g-hud pointer-events-auto relative h-40 w-14 touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons && set(e)}
      role="slider"
      aria-label="Throttle"
      aria-valuenow={Math.round(hud.throttle * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="absolute inset-x-[22px] top-3 bottom-7 bg-[#f8f1e3]/15">
        <div className="absolute inset-x-0 bottom-0 bg-[#d4af37]" style={{ height: `${hud.throttle * 100}%` }} />
      </div>
      <span className="g-btn absolute left-1.5 h-4 w-[40px] rounded-[2px]!" style={{ bottom: `calc(${hud.throttle} * (100% - 40px) + 20px)` }} />
      <span className="g-display absolute inset-x-0 bottom-1.5 text-center text-[9px]">Thr</span>
    </div>
  );
}
