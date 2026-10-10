"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { CircleHelp, Home, Lock, Pause, Play, RotateCcw, ShoppingBag, Star, Trash2, Trophy } from "lucide-react";
import { asset } from "@/lib/asset";
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
import { CRATES, dayPlan, LAYERS, NO_UPGRADES, recipeById, recipePrice, STAR_STEPS, thumb, UPGRADES, type Layer, type Upgrades } from "./data";
import { OrderUpGame, type Action, type DayResult, type Hud, type Label, type Phase, type Tone } from "./engine";
import { GAME } from "./manifest";

interface Save {
  day: number;
  wallet: number;
  upgrades: Upgrades;
}

const records = createRecords("order-up:v1", {
  /** Highest day completed. */
  bestDay: 0,
  /** Best money made in one day. */
  bestEarned: 0,
  totalEarned: 0,
  served: 0,
  stars: {} as Record<string, number>,
  save: null as Save | null,
});

const EMPTY_HUD: Hud = {
  day: 1,
  rush: false,
  timeLeft: 0,
  dayLength: 1,
  closing: false,
  earned: 0,
  target: 1,
  combo: 0,
  served: 0,
  lost: 0,
  plate: [],
  plateState: "empty",
  queue: [],
  hint: null,
};

const KEY_ACTIONS: Record<string, Action> = {
  "1": "bun",
  "2": "cheese",
  "3": "lettuce",
  "4": "tomato",
  "5": "onion",
  "6": "veggie",
  g: "beef",
  c: "take",
  Enter: "serve",
  " ": "serve",
  x: "bin",
  Backspace: "bin",
  Delete: "bin",
};

type Screen = "summary" | "shop" | null;

interface Run {
  day: number;
  /** Cash before today's sales (restored on a retry). */
  wallet: number;
  upgrades: Upgrades;
}

export function OrderUp({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<OrderUpGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [toast, setToast] = useState<{ text: string; tone: Tone; id: number } | null>(null);
  const [help, setHelp] = useState(false);
  const [screen, setScreen] = useState<Screen>(null);
  const [result, setResult] = useState<(DayResult & { wallet: number; newBest: boolean }) | null>(null);
  const [run, setRun] = useState<Run>({ day: 1, wallet: 0, upgrades: NO_UPGRADES });
  const [intro, setIntro] = useState(0);
  /** The latest run for event handlers (kept in step with `run` wherever it changes). */
  const runRef = useRef(run);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let toastId = 0;
    const game = new OrderUpGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      labels: setLabels,
      error: setError,
      toast: (text, tone) => setToast({ text, tone, id: ++toastId }),
      dayOver: (r) => {
        const cur = runRef.current;
        const wallet = Math.max(0, cur.wallet + r.earned);
        const before = records.get();
        const newBest = r.passed && r.day > before.bestDay;
        records.set({
          bestDay: r.passed ? Math.max(before.bestDay, r.day) : before.bestDay,
          bestEarned: Math.max(before.bestEarned, r.earned),
          totalEarned: before.totalEarned + Math.max(0, r.earned),
          served: before.served + r.served,
          stars: r.passed ? { ...before.stars, [r.day]: Math.max(before.stars[r.day] ?? 0, r.stars) } : before.stars,
          save: r.passed ? { day: r.day + 1, wallet, upgrades: cur.upgrades } : before.save,
        });
        if (r.passed) {
          runRef.current = { day: r.day + 1, wallet, upgrades: cur.upgrades };
          setRun(runRef.current);
        }
        setResult({ ...r, wallet, newBest });
        setScreen("summary");
      },
    });
    gameRef.current = game;
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  // Warm the cache for the ingredient and upgrade icons so HUD rows never pop in empty.
  useEffect(() => {
    for (const model of [...Object.values(LAYERS).map((l) => l.model), ...UPGRADES.map((u) => u.icon)]) {
      const img = new Image();
      img.src = asset(thumb(model));
    }
  }, []);

  // Toasts fade on their own.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), 1900);
    return () => clearTimeout(id);
  }, [toast]);

  const startDay = useCallback((next: Run) => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    runRef.current = next;
    setRun(next);
    setScreen(null);
    setResult(null);
    setHelp(false);
    setToast(null);
    setIntro((n) => n + 1);
    game.startDay(next.day, next.upgrades);
  }, []);

  const newGame = () => startDay({ day: 1, wallet: 0, upgrades: { ...NO_UPGRADES } });
  const continueGame = () => {
    const s = records.get().save;
    if (s) startDay({ day: s.day, wallet: s.wallet, upgrades: { ...NO_UPGRADES, ...s.upgrades } });
    else newGame();
  };
  const retryDay = () => startDay({ ...runRef.current });
  const nextDay = () => startDay({ ...runRef.current });

  const toMenu = () => {
    setScreen(null);
    setResult(null);
    gameRef.current?.toMenu();
  };

  const buy = (id: keyof Upgrades) => {
    const cur = runRef.current;
    const info = UPGRADES.find((u) => u.id === id)!;
    const level = cur.upgrades[id];
    const cost = info.cost[level];
    if (cost === undefined || cur.wallet < cost) return;
    const next: Run = { ...cur, wallet: cur.wallet - cost, upgrades: { ...cur.upgrades, [id]: level + 1 } };
    runRef.current = next;
    setRun(next);
    records.set({ save: { day: next.day, wallet: next.wallet, upgrades: next.upgrades } });
    gameRef.current?.previewUpgrades(next.upgrades);
    gameRef.current?.buySound();
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
    if (help) {
      setHelp(false);
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

  // Game keys while a day runs; Enter moves through the menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (phase === "playing") {
        const action = KEY_ACTIONS[e.key] ?? KEY_ACTIONS[e.key.toLowerCase()];
        if (action) {
          e.preventDefault();
          if (!e.repeat) game.action(action);
        }
        return;
      }
      const confirm = (e.key === "Enter" || e.key === " ") && !onButton;
      if (!confirm) return;
      e.preventDefault();
      if (phase === "paused") game.resume();
      else if (phase === "menu") {
        if (records.get().save) continueGame();
        else newGame();
      } else if (phase === "dayover" && result) {
        if (screen === "summary") {
          if (result.passed) setScreen("shop");
          else retryDay();
        } else if (screen === "shop") nextDay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving the tab or window pauses the day.
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

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.target !== canvasRef.current) return;
    gameRef.current?.pointerDown(e.clientX, e.clientY);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || e.pointerType !== "mouse") return;
    const over = e.target === canvas && !!gameRef.current?.pointerMove(e.clientX, e.clientY);
    canvas.style.cursor = over ? "pointer" : "";
  };
  const onPointerLeave = () => gameRef.current?.pointerLeave();

  const running = phase === "playing" || phase === "paused";

  return (
    <GameRoot game={GAME} className="bg-[#3a2a3f]" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <style>{KEYFRAMES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Order Up! game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {running && <CrateLabels labels={labels} />}

      {phase === "menu" && (
        <MenuScreen
          save={saved.save}
          bestDay={saved.bestDay}
          totalEarned={saved.totalEarned}
          onContinue={continueGame}
          onNew={newGame}
          onHelp={() => setHelp(true)}
        />
      )}

      {running && <HudOverlay store={hud} paused={phase === "paused"} onPause={pauseOrResume} onHelp={openHelp} />}
      {running && <BottomBar store={hud} toast={toast} />}
      {phase === "playing" && intro > 0 && <DayIntro key={intro} day={run.day} />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={retryDay} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
          <div className="flex justify-center sm:hidden">
            <SystemButtons />
          </div>
        </Modal>
      )}

      {phase === "dayover" && screen === "summary" && result && !help && (
        <Summary result={result} onShop={() => setScreen("shop")} onRetry={retryDay} onMenu={toMenu} />
      )}
      {phase === "dayover" && screen === "shop" && !help && <Shop run={run} onBuy={buy} onStart={nextDay} onMenu={toMenu} />}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Bits ----------------------------------------------------------------------------------------

const KEYFRAMES = `
@keyframes orderup-pop { 0% { opacity: 0; transform: translateY(10px) scale(.92) } 12% { opacity: 1; transform: none } 85% { opacity: 1 } 100% { opacity: 0; transform: translateY(-6px) } }
@keyframes orderup-in { from { opacity: 0; transform: translateY(6px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes orderup-pulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.08) } }
`;

/** Text over the 3D diner (not on a panel): white with the theme's berry drop shadow. */
const ON_SCENE = "text-white [text-shadow:0_2px_0_#be185d,0_3px_10px_rgb(0_0_0/0.45)]";

function Icon({ model, size = 28, className = "" }: { model: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-contain bg-center bg-no-repeat ${className}`}
      style={{ width: size, height: size, backgroundImage: `url(${asset(thumb(model))})` } as CSSProperties}
    />
  );
}

/** Bottom-to-top as left-to-right. */
function StackRow({ layers, size = 24 }: { layers: Layer[]; size?: number }) {
  return (
    <span className="inline-flex items-center -space-x-1">
      {layers.map((l, i) => (
        <Icon key={i} model={LAYERS[l].model} size={size} />
      ))}
    </span>
  );
}

function Money({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{value < 0 ? `−$${formatNumber(-value)}` : `$${formatNumber(value)}`}</span>;
}

function Stars({ count, size = "size-9" }: { count: number; size?: string }) {
  return (
    <span className="inline-flex gap-1.5">
      {[1, 2, 3].map((i) => (
        <Star
          key={i}
          className={`${size} ${
            i <= count
              ? "fill-amber-400 text-amber-500 drop-shadow-[0_2px_0_#b45309]"
              : "fill-[color-mix(in_srgb,currentColor_10%,transparent)] text-[color-mix(in_srgb,currentColor_25%,transparent)]"
          }`}
        />
      ))}
    </span>
  );
}

function CoinDot({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 ring-2 ring-amber-600/70 ${large ? "size-6" : "size-3.5"}`}
    />
  );
}

/** A thin progress bar in the theme's pink. */
function Bar({ ratio, tone = "bg-[var(--accent)]" }: { ratio: number; tone?: string }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]">
      <div className={`h-full rounded-full transition-[width] duration-300 ${tone}`} style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
    </div>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function MenuScreen({
  save,
  bestDay,
  totalEarned,
  onContinue,
  onNew,
  onHelp,
}: {
  save: Save | null;
  bestDay: number;
  totalEarned: number;
  onContinue: () => void;
  onNew: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>
      <div className="px-4 pt-1 text-center sm:pt-3">
        <GameTitle game={GAME} />
        <p className={`g-display mt-3 text-lg sm:text-2xl ${ON_SCENE}`}>Grill · stack · serve — before they walk out</p>
      </div>
      <div className="flex-1" />
      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        {save ? (
          <>
            <BigButton onClick={onContinue} icon={<Play className="size-6 fill-current" />} autoFocus>
              Open day {save.day}
            </BigButton>
            <div className="grid grid-cols-2 gap-2">
              <SoftButton onClick={onNew} icon={<RotateCcw className="size-4" />}>
                New game
              </SoftButton>
              <SoftButton onClick={onHelp} icon={<CircleHelp className="size-4" />}>
                How to play
              </SoftButton>
            </div>
          </>
        ) : (
          <>
            <BigButton onClick={onNew} icon={<Play className="size-6 fill-current" />} autoFocus>
              Open the diner
            </BigButton>
            <SoftButton onClick={onHelp} icon={<CircleHelp className="size-4" />}>
              How to play
            </SoftButton>
          </>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-extrabold">
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
            <Trophy className="size-3.5 text-amber-500" /> Best day {bestDay || "—"}
          </span>
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
            <CoinDot /> <Money value={totalEarned} /> earned
          </span>
        </div>
        <p className={`hidden text-center text-xs font-bold sm:block ${ON_SCENE}`}>1–5 ingredients · G grill · C take patty · Enter serve · X bin · Esc pause</p>
        <p className={`text-center text-xs font-bold sm:hidden ${ON_SCENE}`}>Tap crates, the grill, patties and customers</p>
      </div>
    </div>
  );
}

function CrateLabels({ labels }: { labels: Label[] }) {
  return (
    <div data-bleed className="pointer-events-none absolute inset-0 z-[1]">
      {labels.map((l) => (
        <div
          key={l.id}
          className="g-hud absolute flex -translate-x-1/2 -translate-y-full items-center gap-1 border-2 py-px pr-2 pl-0.5 text-[10px] font-extrabold whitespace-nowrap shadow-md sm:text-[11px]"
          style={{ left: l.x, top: l.y }}
        >
          {l.locked ? (
            <span className="g-muted flex items-center gap-0.5 pl-1" title={`Opens on day ${l.locked}`}>
              <Lock className="size-2.5" />
              {l.locked}
            </span>
          ) : (
            <>
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] text-white [@media(pointer:coarse)]:hidden">
                {l.key}
              </span>
              <span className="[@media(pointer:coarse)]:pl-1.5">{l.text}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function formatClock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function HudOverlay({ store, paused, onPause, onHelp }: { store: Store<Hud>; paused: boolean; onPause: () => void; onHelp: () => void }) {
  const hud = useStore(store);
  const reached = hud.earned >= hud.target;
  const urgent = !hud.closing && hud.timeLeft <= 20;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex items-start justify-between gap-2 p-2.5 pt-[max(env(safe-area-inset-top),10px)] sm:p-4">
      <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:gap-2">
        <div className="g-hud flex items-center gap-2 py-1 pr-4 pl-1">
          <span className="g-display rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-base text-white [text-shadow:0_1px_0_#be185d]">
            {hud.rush ? `Rush ${hud.day}` : `Day ${hud.day}`}
          </span>
          <div className="min-w-[64px]">
            <p className={`text-lg leading-none font-black tabular-nums ${urgent ? "text-rose-600" : ""}`}>{hud.closing ? "Closing!" : formatClock(hud.timeLeft)}</p>
            <Bar ratio={hud.closing ? 0 : hud.timeLeft / hud.dayLength} tone={urgent ? "bg-rose-500" : "bg-[var(--accent)]"} />
          </div>
        </div>
        <div className="g-hud flex items-center gap-2 py-1 pr-4 pl-1.5">
          <CoinDot large />
          <div className="min-w-[112px]">
            <p className="text-lg leading-none font-black">
              <Money value={hud.earned} className={reached ? "text-amber-600" : ""} />
              <span className="g-muted text-xs font-extrabold"> / ${formatNumber(hud.target)}</span>
            </p>
            <Bar ratio={hud.earned / hud.target} tone={reached ? "bg-amber-400" : "bg-[var(--accent)]"} />
          </div>
          {hud.combo >= 2 && (
            <span key={hud.combo} className="g-display animate-[orderup-in_0.25s_ease] rounded-full bg-[var(--accent)] px-2 py-0.5 text-sm text-white">
              ×{hud.combo} combo
            </span>
          )}
        </div>
      </div>
      <div className="pointer-events-auto flex items-start gap-2">
        <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
          {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
        </IconButton>
        <FullscreenButton className="sm:hidden" />
        <RotateButton className="sm:hidden" />
        <div className="hidden sm:block">
          <SystemButtons onHelp={onHelp} />
        </div>
      </div>
    </div>
  );
}

const PLATE_BORDER: Record<Hud["plateState"], string> = {
  empty: "",
  building: "",
  ready: "!border-emerald-500 shadow-[0_0_0_4px_rgb(16_185_129/0.25),0_0_26px_rgb(16_185_129/0.5)]",
  wrong: "!border-rose-500",
};

function BottomBar({ store, toast }: { store: Store<Hud>; toast: { text: string; tone: Tone; id: number } | null }) {
  const hud = useStore(store);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex flex-col items-center gap-2 px-2 pb-[max(env(safe-area-inset-bottom),10px)] sm:pb-4">
      {toast ? (
        <p
          key={toast.id}
          className={`g-hud animate-[orderup-pop_1.9s_ease_forwards] px-4 py-1.5 text-center text-sm font-extrabold shadow-lg ${
            toast.tone === "bad" ? "!border-rose-500 text-rose-700" : toast.tone === "good" ? "!border-emerald-500 text-emerald-700" : ""
          }`}
        >
          {toast.text}
        </p>
      ) : hud.hint ? (
        <p
          key={hud.hint}
          className="animate-[orderup-in_0.3s_ease] rounded-full border-[3px] border-white bg-[var(--accent)] px-4 py-1.5 text-center text-sm font-extrabold text-white shadow-[0_4px_0_#be185d] [text-shadow:0_1px_0_#be185d]"
        >
          {hud.hint}
        </p>
      ) : null}
      <div className="flex max-w-full items-stretch gap-2">
        <div className={`g-hud flex min-w-0 items-center gap-2 px-3 py-1 transition ${PLATE_BORDER[hud.plateState]}`}>
          <span className="g-display text-base leading-none">Plate</span>
          {hud.plate.length ? <StackRow layers={hud.plate} size={26} /> : <span className="g-muted text-xs font-bold">empty</span>}
          {hud.plateState === "ready" && <span className="g-display animate-[orderup-pulse_0.8s_ease_infinite] text-base text-emerald-600">Serve!</span>}
          {hud.plateState === "wrong" && <Trash2 className="size-4 text-rose-600" />}
        </div>
        {hud.queue.length > 0 && (
          <div className="g-hud hidden items-center gap-1.5 px-2.5 py-1 sm:flex">
            <span className="g-display text-base leading-none">Next</span>
            {hud.queue.slice(0, 3).map((id, i) => (
              <span key={i} className="g-tint flex items-center rounded-full px-1.5 py-0.5">
                <StackRow layers={recipeById(id).layers} size={17} />
              </span>
            ))}
          </div>
        )}
        {hud.queue.length > 0 && <div className="g-hud flex items-center px-3 text-xs font-extrabold sm:hidden">+{hud.queue.length} in line</div>}
      </div>
    </div>
  );
}

function DayIntro({ day }: { day: number }) {
  const plan = dayPlan(day);
  const news = plan.news.map(recipeById);
  const opened = CRATES.filter((c) => c.unlock === day && day > 1);
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] grid place-items-center p-4">
      <div className="g-panel animate-[orderup-pop_3.6s_ease_forwards] px-6 py-5 text-center">
        <p className="text-xs font-black tracking-[0.2em] text-[var(--accent)] uppercase">{plan.rush ? "Rush hour" : "Open for business"}</p>
        <p className="g-panel-title text-5xl">{plan.rush ? `Rush day ${day}` : `Day ${day}`}</p>
        <p className="mt-2 text-sm font-bold">
          Make <span className="text-pink-600">${plan.target}</span> in {formatClock(plan.length)}
        </p>
        {news.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="g-muted text-[10px] font-black tracking-[0.2em] uppercase">New on the menu</p>
            {news.map((r) => (
              <div key={r.id} className="g-tint flex items-center justify-center gap-2 rounded-full px-3 py-1">
                <span className="g-display text-lg">{r.name}</span>
                <StackRow layers={r.layers} size={22} />
                <span className="text-xs font-black text-pink-600">${recipePrice(r)}</span>
              </div>
            ))}
          </div>
        )}
        {opened.length > 0 && <p className="mt-2 text-xs font-extrabold text-emerald-700">New crate: {opened.map((c) => `${c.label} (${c.key})`).join(", ")}</p>}
      </div>
    </div>
  );
}

function Summary({
  result,
  onShop,
  onRetry,
  onMenu,
}: {
  result: DayResult & { wallet: number; newBest: boolean };
  onShop: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  const r = result;
  return (
    <Modal title={r.passed ? `Day ${r.day} done!` : "Target missed"} wide>
      <div className="text-center">
        <Stars count={r.stars} />
        {r.newBest && (
          <p className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-black tracking-wider text-amber-950 uppercase">
            <Trophy className="size-3.5" /> New best day
          </p>
        )}
        <p className="g-muted mt-2 text-xs font-black tracking-[0.2em] uppercase">Earned today</p>
        <p className={`g-display text-6xl tabular-nums ${r.passed ? "text-pink-600" : ""}`}>
          <Money value={r.earned} />
        </p>
        <p className="g-muted text-sm font-bold">
          target ${r.target} · ★★ ${Math.ceil(r.target * STAR_STEPS[1])} · ★★★ ${Math.ceil(r.target * STAR_STEPS[2])}
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Served" value={r.served} />
        <Stat label="Lost" value={r.lost} />
        <Stat label="Tips" value={`$${r.tips}`} />
        <Stat label="Combo" value={`×${r.bestCombo}`} />
      </div>
      <p className="g-muted text-center text-xs font-bold">
        Sales ${r.sales} · tips ${r.tips} · waste −${r.waste}
      </p>
      {r.passed ? (
        <BigButton onClick={onShop} icon={<ShoppingBag className="size-5" />} autoFocus>
          Kitchen shop
        </BigButton>
      ) : (
        <>
          <p className="text-center text-sm">Serve faster for bigger tips, keep a combo going and don&apos;t let patties burn.</p>
          <BigButton onClick={onRetry} icon={<RotateCcw className="size-5" />} autoFocus>
            Retry day {r.day}
          </BigButton>
        </>
      )}
      <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
        Menu
      </SoftButton>
    </Modal>
  );
}

function Shop({ run, onBuy, onStart, onMenu }: { run: Run; onBuy: (id: keyof Upgrades) => void; onStart: () => void; onMenu: () => void }) {
  return (
    <Modal title="Kitchen shop" wide>
      <p className="-mt-2 flex items-center justify-center gap-1.5 text-center text-sm font-bold">
        <CoinDot /> <Money value={run.wallet} className="text-lg font-black text-pink-600" /> <span className="g-muted">· upgrades last all game</span>
      </p>
      <div className="grid gap-1.5">
        {UPGRADES.map((u) => {
          const level = run.upgrades[u.id];
          const max = level >= u.cost.length;
          const cost = u.cost[level];
          const afford = !max && run.wallet >= cost;
          return (
            <div key={u.id} className="g-tint flex items-center gap-3 rounded-2xl px-2.5 py-1.5">
              <Icon model={u.icon} size={40} className="rounded-xl bg-white ring-2 ring-[color-mix(in_srgb,var(--accent)_40%,transparent)]" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5">
                  <span className="g-display text-lg leading-tight">{u.name}</span>
                  <span className="flex gap-0.5">
                    {u.cost.map((_, i) => (
                      <span key={i} className={`size-2 rounded-full ${i < level ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,currentColor_18%,transparent)]"}`} />
                    ))}
                  </span>
                </p>
                <p className="g-muted text-xs leading-snug font-semibold">{max ? "Fully upgraded." : u.text[level]}</p>
              </div>
              <button
                type="button"
                disabled={!afford}
                onClick={() => onBuy(u.id)}
                className="g-btn shrink-0 px-3.5 py-1.5 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-45 disabled:grayscale"
              >
                <span className="g-unskew">{max ? "Max" : `$${cost}`}</span>
              </button>
            </div>
          );
        })}
      </div>
      <BigButton onClick={onStart} icon={<Play className="size-5 fill-current" />} autoFocus>
        Open day {run.day}
      </BigButton>
      <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
        Save &amp; menu
      </SoftButton>
    </Modal>
  );
}
