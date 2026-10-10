"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Apple, BookOpen, Check, CircleHelp, Drumstick, Flame, Hand, Heart, Home, Lock, Mail, Moon, Pause, Play, RotateCcw, RotateCw, Sailboat, Skull, Sun, Sword, Trophy, Wrench, X } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
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
  Stat,
  SystemButtons,
  useRecords,
  useShortcuts,
  useStore,
  type Store,
} from "../shared/ui";
import { ACHIEVEMENTS, ITEMS, NOTES, OBJECTIVES, RECIPES, RESOURCES, TABS, type RecipeId, type ResourceId, type Tab } from "./data";
import { CastawayGame, type DeathInfo, type Hud, type Phase, type RunSummary, type SaveInfo, type Toast } from "./engine";
import { GAME } from "./manifest";

const records = createRecords("castaway:v1", { bestDay: 0, escapes: 0, fastestDays: 0, kills: 0, achievements: [] as string[] });

const EMPTY_HUD: Hud = {
  day: 1,
  t: 0,
  period: "Morning",
  night: false,
  health: 100,
  hunger: 100,
  warmth: 100,
  res: { wood: 0, stone: 0, fiber: 0, planks: 0, scrap: 0, cloth: 0 },
  foods: [],
  food: null,
  slots: [],
  selected: 0,
  prompt: null,
  fishing: null,
  cooking: null,
  placing: null,
  objective: OBJECTIVES[0],
  objectiveNo: 0,
  sleeping: false,
  ship: false,
  danger: 0,
  craft: { unlocked: [], crafted: [], bench: false, chest: false, have: { wood: 0, stone: 0, fiber: 0, planks: 0, scrap: 0, cloth: 0 } },
  cold: false,
  starving: false,
  home: false,
};

const STYLES = `
@keyframes cw-banner { 0% { opacity: 0; transform: translateY(10px) rotate(-1deg) scale(0.96); } 12% { opacity: 1; transform: rotate(-1deg); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px) rotate(-1deg); } }
@keyframes cw-hurt { 0% { opacity: 0.9; } 100% { opacity: 0; } }
@keyframes cw-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.75; } }
@keyframes cw-toast { 0% { opacity: 0; transform: translateX(-10px); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes cw-hint { 0% { opacity: 0; transform: translateY(8px); } 6%, 85% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes cw-note { from { opacity: 0; transform: translateY(-12px) rotate(-2deg); } to { opacity: 1; transform: rotate(-1.2deg); } }
@media (prefers-reduced-motion: reduce) { .cw-anim { animation-duration: 0.01s !important; } }
`;

const formatDays = (d: number) => (d > 0 ? `${d.toFixed(1)} days` : "—");

export function Castaway({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<CastawayGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [toasts] = useState(() => createStore<Toast[]>([]));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ title: string; sub?: string; id: number } | null>(null);
  const [hurtKey, setHurtKey] = useState(0);
  const [help, setHelp] = useState(false);
  const [note, setNote] = useState<{ text: string; index: number; id: number } | null>(null);
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const [won, setWon] = useState<(RunSummary & { newBest: boolean; fresh: string[] }) | null>(null);
  const [saveInfo, setSaveInfo] = useState<SaveInfo | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [tab, setTab] = useState<Tab>("tools");
  const [runKey, setRunKey] = useState(0);
  const [touch, setTouch] = useState(false);
  const runAchievements = useRef<string[]>([]);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new CastawayGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      icons: setIcons,
      toast: (t) => {
        const list = [...toasts.get().filter((x) => x.id > t.id - 4), t];
        toasts.set(list);
        setTimeout(() => toasts.set(toasts.get().filter((x) => x.id !== t.id)), t.kind === "achievement" ? 4200 : 3200);
      },
      banner: (title, sub) => setBanner({ title, sub, id: performance.now() }),
      hurt: () => setHurtKey((k) => k + 1),
      note: (text, index) => setNote({ text, index, id: performance.now() }),
      died: (info) => setDeath(info),
      won: (run) => {
        const before = records.get();
        const newBest = !before.fastestDays || run.days < before.fastestDays;
        records.set({
          escapes: before.escapes + 1,
          fastestDays: newBest ? Math.round(run.days * 10) / 10 : before.fastestDays,
          bestDay: Math.max(before.bestDay, run.day),
          kills: before.kills + run.kills,
        });
        setWon({ ...run, newBest, fresh: [...runAchievements.current] });
      },
      achieve: (id) => {
        const before = records.get();
        if (before.achievements.includes(id)) return;
        records.set({ achievements: [...before.achievements, id] });
        runAchievements.current.push(id);
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (!a) return;
        gameRef.current?.sfx.achievement();
        const list = [...toasts.get(), { id: Date.now(), text: `Achievement: ${a.name} — ${a.desc}`, kind: "achievement" as const }];
        toasts.set(list);
        setTimeout(() => toasts.set(toasts.get().filter((x) => x.kind !== "achievement" || !x.text.includes(a.name))), 4200);
      },
      day: (day) => {
        const before = records.get();
        if (day > before.bestDay) records.set({ bestDay: day });
      },
      saved: setSaveInfo,
    });
    gameRef.current = game;
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, toasts, modelSizes]);

  // Touch controls appear for touch screens (and as soon as someone touches).
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const sync = () => setTouch((t) => t || coarse.matches);
    sync();
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") setTouch(true);
    };
    window.addEventListener("pointerdown", onPointer);
    coarse.addEventListener("change", sync);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      coarse.removeEventListener("change", sync);
    };
  }, []);

  const start = (resume: boolean) => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setDeath(null);
    setWon(null);
    setHelp(false);
    setNote(null);
    setConfirmNew(false);
    toasts.set([]);
    runAchievements.current = [];
    setRunKey((k) => k + 1);
    game.start(resume);
  };

  const newIsland = () => {
    if (saveInfo && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    CastawayGame.clearSave();
    start(false);
  };

  const toMenu = () => {
    setDeath(null);
    setWon(null);
    setConfirmNew(false);
    gameRef.current?.toMenu();
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (phase === "book") game?.closeBook();
    else if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Menu keys: Enter continues (or starts) a game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || e.repeat) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (e.key !== "Enter" || onButton) return;
      if (phase === "menu") {
        e.preventDefault();
        if (saveInfo) start(true);
        else newIsland();
      } else if (phase === "paused") {
        e.preventDefault();
        game.resume();
      } else if (phase === "dead") {
        e.preventDefault();
        setDeath(null);
        game.respawn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  // Bottle notes fade after a while.
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 9000);
    return () => clearTimeout(id);
  }, [note]);

  const running = phase === "playing" || phase === "paused" || phase === "book";

  return (
    <GameRoot game={GAME} className="bg-[#0b2531]">
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Castaway game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && (
        <MenuScreen
          saveInfo={saveInfo}
          confirmNew={confirmNew}
          onContinue={() => start(true)}
          onNew={newIsland}
          onCancelNew={() => setConfirmNew(false)}
          onHelp={() => setHelp(true)}
          touch={touch}
          records={saved}
        />
      )}

      {running && <HudOverlay store={hud} icons={icons} paused={phase === "paused"} onPause={pauseOrResume} touch={touch} game={gameRef} />}
      {running && <Vignettes store={hud} />}
      {running && <Toasts store={toasts} icons={icons} touch={touch} />}
      {hurtKey > 0 && running && (
        <div key={`hurt-${hurtKey}`} className="cw-anim pointer-events-none absolute inset-0 animate-[cw-hurt_0.55s_ease-out_forwards] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(185_28_28/0.55)_100%)]" />
      )}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}
      {phase === "playing" && !touch && <ControlsHint key={`hint-${runKey}`} />}

      {banner && (running || phase === "won") && (
        <div key={`banner-${banner.id}`} className="cw-anim pointer-events-none absolute inset-x-0 top-[20%] flex animate-[cw-banner_3s_ease_forwards] flex-col items-center px-4 text-center opacity-0">
          <p className="g-title text-5xl sm:text-7xl">{banner.title}</p>
          {banner.sub && <p className="g-display mt-2 text-lg text-[#fff7ed] [text-shadow:0_2px_6px_#000c] sm:text-xl">{banner.sub}</p>}
        </div>
      )}

      {note && running && (
        <div key={`note-${note.id}`} className="pointer-events-none absolute inset-x-0 top-[13%] z-10 flex justify-center px-4">
          <div className="g-panel cw-anim pointer-events-auto relative w-full max-w-sm animate-[cw-note_0.4s_ease_both] p-5 pr-10" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Close note" onClick={() => setNote(null)} className="g-tint absolute top-3 right-3 grid size-8 place-items-center rounded-full">
              <X className="size-4" />
            </button>
            <p className="g-display flex items-center gap-1.5 text-sm text-[var(--accent)]">
              <Mail className="size-4" /> Message in a bottle · {note.index + 1}/{NOTES.length}
            </p>
            <p className="mt-2 text-lg leading-snug">“{note.text}”</p>
          </div>
        </div>
      )}

      {phase === "book" && <Journal store={hud} icons={icons} tab={tab} setTab={setTab} game={gameRef} />}

      {phase === "paused" && !help && (
        <Modal title="Paused">
          <p className="g-muted -mt-2 text-center text-sm">Your island is saved automatically.</p>
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              How to play
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Save & menu
            </SoftButton>
          </div>
        </Modal>
      )}

      {phase === "dead" && death && !help && (
        <Modal title="You passed out">
          <div className="space-y-2 text-center">
            <Skull className="mx-auto size-10 text-[var(--accent)]" />
            <p className="text-lg leading-snug">
              Day {death.day}. You wake up {death.home ? "at your bedroll" : "back at camp"}, aching.
            </p>
            {death.lost ? (
              <p className="g-muted text-sm leading-snug">
                You dropped {death.lost}. Your satchel lies where you fell — go and get it back.
              </p>
            ) : (
              <p className="g-muted text-sm">You weren&apos;t carrying much. Nothing was lost.</p>
            )}
          </div>
          <BigButton
            onClick={() => {
              setDeath(null);
              gameRef.current?.respawn();
            }}
            icon={<RotateCcw className="size-5" />}
            autoFocus
          >
            Wake up
          </BigButton>
          <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
            Menu
          </SoftButton>
        </Modal>
      )}

      {phase === "won" && won && !help && (
        <Modal title="Rescued!" wide>
          <div className="text-center">
            <Sailboat className="mx-auto size-10 text-[var(--accent)]" />
            <p className="mt-1 text-lg leading-snug">The crew hauls you aboard. You&apos;re going home.</p>
            {won.newBest && <p className="g-display mt-1 text-[var(--accent)]">Fastest escape yet!</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Stat label="Days" value={won.days.toFixed(1)} />
            <Stat label="Creatures" value={won.kills} />
            <Stat label="Crafted" value={won.crafted} />
            <Stat label="Built" value={won.built} />
            <Stat label="Fish" value={won.fish} />
            <Stat label="Faints" value={won.deaths} />
          </div>
          {won.fresh.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {won.fresh.map((id) => (
                <span key={id} className="g-tint g-display inline-flex items-center gap-1 rounded-[var(--g-hud-radius)] px-2.5 py-1 text-xs">
                  <Trophy className="size-3.5 text-[var(--accent)]" /> {ACHIEVEMENTS.find((a) => a.id === id)?.name}
                </span>
              ))}
            </div>
          )}
          <p className="g-muted text-center text-sm">
            Escapes {saved.escapes} · Fastest {formatDays(saved.fastestDays)} · Best day {saved.bestDay}
          </p>
          <BigButton onClick={() => start(false)} icon={<RotateCcw className="size-5" />} autoFocus>
            New island
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

// --- Menu --------------------------------------------------------------------------------------------

function MenuScreen({
  saveInfo,
  confirmNew,
  onContinue,
  onNew,
  onCancelNew,
  onHelp,
  touch,
  records: rec,
}: {
  saveInfo: SaveInfo | null;
  confirmNew: boolean;
  onContinue: () => void;
  onNew: () => void;
  onCancelNew: () => void;
  onHelp: () => void;
  touch: boolean;
  records: { bestDay: number; escapes: number; fastestDays: number; kills: number; achievements: string[] };
}) {
  const [showAch, setShowAch] = useState(false);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col bg-[linear-gradient(to_bottom,rgb(11_37_49/0.7),transparent_32%,transparent_55%,rgb(20_12_6/0.85))]">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>
      <div className="px-4 pt-1 text-center sm:pt-2">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-lg text-[#fff7ed] [text-shadow:0_2px_8px_#000] sm:text-xl">{GAME.tagline}</p>
      </div>
      <div className="flex-1" />
      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        {confirmNew ? (
          <div className="g-panel space-y-3 p-4 text-center">
            <p className="text-lg leading-snug">Start a new island? Your day {saveInfo?.day} camp will be lost.</p>
            <div className="grid grid-cols-2 gap-2">
              <SoftButton onClick={onCancelNew}>Keep it</SoftButton>
              <BigButton onClick={onNew}>New island</BigButton>
            </div>
          </div>
        ) : saveInfo ? (
          <>
            <BigButton onClick={onContinue} icon={<Play className="size-6 fill-current" />} autoFocus>
              Continue · Day {saveInfo.day}
            </BigButton>
            <SoftButton onClick={onNew} icon={<RotateCcw className="size-4" />}>
              New island
            </SoftButton>
          </>
        ) : (
          <BigButton onClick={onNew} icon={<Sailboat className="size-6" />} autoFocus>
            Wash ashore
          </BigButton>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
            <Sun className="size-4 text-[var(--accent)]" /> Best day {rec.bestDay || "—"}
          </span>
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
            <Sailboat className="size-4 text-[var(--accent)]" /> Escapes {rec.escapes}
            {rec.fastestDays ? ` · ${formatDays(rec.fastestDays)}` : ""}
          </span>
          <button type="button" onClick={() => setShowAch((s) => !s)} className="g-soft g-display inline-flex items-center px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-[var(--accent)]" data-active={showAch}>
            <span className="g-unskew gap-1.5">
              <Trophy className="size-4" /> {rec.achievements.length}/{ACHIEVEMENTS.length}
            </span>
          </button>
          <button type="button" onClick={onHelp} className="g-soft g-display inline-flex items-center px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <span className="g-unskew gap-1.5">
              <CircleHelp className="size-4" /> How to play
            </span>
          </button>
        </div>
        {showAch && (
          <div className="g-panel max-h-[40vh] overflow-y-auto p-4">
            <p className="g-panel-title mb-2 text-2xl">Achievements</p>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ACHIEVEMENTS.map((a) => {
                const got = rec.achievements.includes(a.id);
                return (
                  <li key={a.id} className={`g-tint flex items-start gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1.5 ${got ? "" : "opacity-60"}`}>
                    {got ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" /> : <Lock className="mt-0.5 size-4 shrink-0" />}
                    <span className="leading-tight">
                      <span className="g-display block">{a.name}</span>
                      <span className="g-muted text-sm">{a.desc}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="text-center text-sm text-[#fff7ed]/85 [text-shadow:0_1px_4px_#000]">
          {touch ? "Left stick to walk · big button to gather & fight · drag to look around" : "WASD walk · Space gather / fight · C journal · E eat · 1–6 hotbar · ← → camera"}
        </p>
      </div>
    </div>
  );
}

// --- HUD ---------------------------------------------------------------------------------------------

function Icon({ src, alt, className = "size-7" }: { src?: string; alt: string; className?: string }) {
  // Data-URL icons rendered from the game's own models.
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} draggable={false} className={`${className} object-contain`} /> : <span className={`${className} inline-block`} aria-hidden />;
}

function Meter({ label, value, icon, color, warn }: { label: string; value: number; icon: ReactNode; color: string; warn: boolean }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value}`}>
      <span className={`grid size-5 shrink-0 place-items-center ${warn ? "animate-[cw-pulse_0.9s_ease-in-out_infinite]" : ""}`}>{icon}</span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-[3px] border border-[#8b5e34]/70 bg-[#2b2118]/15">
        <div className="h-full transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="g-display w-7 text-right text-sm tabular-nums">{value}</span>
    </div>
  );
}

function DayDial({ t, night }: { t: number; night: boolean }) {
  // The sun (or moon) travelling over a little horizon.
  const a = Math.PI * Math.min(1, Math.max(0, night ? (t - 0.7) / 0.3 : (t + 0.04) / 0.74));
  const x = 18 - Math.cos(a) * 13;
  const y = 18 - Math.sin(a) * 12;
  return (
    <svg viewBox="0 0 36 22" className="h-5 w-8" aria-hidden>
      <path d="M3 19 A15 15 0 0 1 33 19" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="1" y1="19.5" x2="35" y2="19.5" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx={x} cy={y} r="3.4" fill={night ? "#cbd5ff" : "#f59e0b"} stroke="#2b2118" strokeWidth="1" />
    </svg>
  );
}

function HudOverlay({ store, icons, paused, onPause, touch, game }: { store: Store<Hud>; icons: Record<string, string>; paused: boolean; onPause: () => void; touch: boolean; game: { current: CastawayGame | null } }) {
  const hud = useStore(store);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 pt-[max(env(safe-area-inset-top),10px)] sm:p-4">
        <div className="min-w-0 space-y-2">
          <div className="g-hud w-44 space-y-1 px-2.5 py-2 sm:w-60">
            <Meter label="Health" value={hud.health} icon={<Heart className="size-4 fill-[#dc2626] text-[#7f1d1d]" />} color="linear-gradient(180deg,#f87171,#b91c1c)" warn={hud.health < 30} />
            <Meter label="Hunger" value={hud.hunger} icon={<Drumstick className="size-4 fill-[#f59e0b] text-[#7c2d12]" />} color="linear-gradient(180deg,#fdba74,#c2410c)" warn={hud.starving} />
            <Meter label="Warmth" value={hud.warmth} icon={<Flame className="size-4 fill-[#fb923c] text-[#9a3412]" />} color={hud.cold ? "linear-gradient(180deg,#93c5fd,#2563eb)" : "linear-gradient(180deg,#fde68a,#ea580c)"} warn={hud.cold} />
          </div>
          <div className={`g-hud grid w-44 grid-cols-3 gap-x-1 gap-y-0.5 px-1.5 py-1 sm:w-60 ${touch ? "" : "sm:grid-cols-3"}`}>
            {RESOURCES.map((r) => (
              <span key={r} className={`flex items-center gap-0.5 ${hud.res[r] ? "" : "opacity-45"}`} title={ITEMS[r].name}>
                <Icon src={icons[r]} alt={ITEMS[r].name} className="size-6" />
                <span className="g-display text-sm tabular-nums">{hud.res[r]}</span>
              </span>
            ))}
          </div>
          <div className="g-hud hidden w-60 px-2.5 py-1.5 sm:block">
            <p className="g-display text-xs text-[var(--accent)]">
              To do · {hud.objectiveNo + 1}/{OBJECTIVES.length}
            </p>
            <p className="text-[15px] leading-tight">{hud.objective}</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-1.5 pt-0.5">
          <div className="g-hud flex items-center gap-2 px-3 py-1">
            {hud.night ? <Moon className="size-4 fill-[#cbd5ff] text-[#3730a3]" /> : <Sun className="size-4 fill-[#fbbf24] text-[#b45309]" />}
            <span className="g-display text-lg leading-none whitespace-nowrap">Day {hud.day}</span>
            <DayDial t={hud.t} night={hud.night} />
            <span className="hidden text-sm sm:inline">{hud.period}</span>
          </div>
          {hud.danger > 0 && (
            <span className="g-hud g-display inline-flex items-center gap-1 px-2.5 py-0.5 text-sm text-[#b91c1c]">
              <Skull className="size-3.5" /> {hud.danger} {hud.danger === 1 ? "creature" : "creatures"}
            </span>
          )}
          {hud.ship && (
            <span className="g-btn px-3 py-1 text-sm">
              <span className="g-unskew gap-1">
                <Sailboat className="size-4" /> Ship waiting · board your raft
              </span>
            </span>
          )}
          {touch && hud.prompt && !hud.fishing && <PromptChip prompt={hud.prompt} touch />}
          {touch && <p className="g-hud max-w-[11rem] px-2 py-1 text-center text-[13px] leading-tight sm:hidden">{hud.objective}</p>}
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <SystemButtons vertical />
          {!touch && (
            <IconButton onClick={() => game.current?.openBook()} label="Crafting journal (C)">
              <BookOpen className="size-5" />
            </IconButton>
          )}
        </div>
      </div>

      <div className={`pointer-events-none absolute inset-x-0 flex flex-col items-center gap-2 px-2 ${touch ? "bottom-[max(env(safe-area-inset-bottom),8px)]" : "bottom-[max(env(safe-area-inset-bottom),14px)]"}`}>
        {hud.fishing && <FishingMeter f={hud.fishing} />}
        {hud.cooking !== null && (
          <div className="g-hud flex items-center gap-2 px-3 py-1">
            <Flame className="size-4 text-[var(--accent)]" />
            <span className="g-display text-sm">Cooking</span>
            <div className="h-2.5 w-28 overflow-hidden rounded-sm bg-[#2b2118]/20">
              <div className="h-full bg-[var(--accent)] transition-[width] duration-200" style={{ width: `${hud.cooking * 100}%` }} />
            </div>
          </div>
        )}
        {hud.placing && !touch && (
          <div className="g-hud flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
            <span className="g-display">Placing {hud.placing.name}</span>
            <span className="inline-flex items-center gap-1">
              <Kbd>Click</Kbd>/<Kbd>Space</Kbd> place
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>R</Kbd> rotate
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>X</Kbd> cancel
            </span>
          </div>
        )}
        {!touch && hud.prompt && !hud.fishing && <PromptChip prompt={hud.prompt} touch={false} />}
        {hud.sleeping && (
          <p className="g-hud g-display px-3 py-1 text-base">
            Zzz… <span className="g-muted text-sm">(press {touch ? "the button" : "Space"} to wake)</span>
          </p>
        )}
        <Hotbar hud={hud} icons={icons} game={game} touch={touch} />
      </div>
    </>
  );
}

function PromptChip({ prompt, touch }: { prompt: NonNullable<Hud["prompt"]>; touch: boolean }) {
  return (
    <p className={`g-hud flex max-w-[92vw] items-center gap-1.5 px-3 py-1 text-[15px] leading-tight ${prompt.ok ? "" : "opacity-80"}`}>
      {!touch && prompt.ok && <Kbd>{prompt.key}</Kbd>}
      {!prompt.ok && <Lock className="size-3.5 shrink-0" />}
      <span>{prompt.text}</span>
    </p>
  );
}

function FishingMeter({ f }: { f: NonNullable<Hud["fishing"]> }) {
  return (
    <div className="g-hud w-72 max-w-[90vw] px-3 py-2">
      <p className="g-display mb-1 text-center text-sm">Spear it when the fish is in the green!</p>
      <div className="relative h-5 overflow-hidden rounded-sm border border-[#8b5e34] bg-[#0e7490]/30">
        <div className="absolute inset-y-0 bg-[#4ade80]/80" style={{ left: `${f.a * 100}%`, width: `${(f.b - f.a) * 100}%` }} />
        <div className="absolute inset-y-[-2px] w-1.5 -translate-x-1/2 rounded bg-[#2b2118]" style={{ left: `${f.needle * 100}%` }} />
      </div>
    </div>
  );
}

function Hotbar({ hud, icons, game, touch }: { hud: Hud; icons: Record<string, string>; game: { current: CastawayGame | null }; touch: boolean }) {
  if (!hud.slots.length) return null;
  return (
    <div className="pointer-events-auto flex gap-1 sm:gap-1.5" role="toolbar" aria-label="Hotbar">
      {hud.slots.map((s, i) => {
        const active = hud.selected === i;
        return (
          <button
            key={i}
            type="button"
            title={`${s.label} (${i + 1})`}
            aria-label={`${s.label} (${i + 1})`}
            aria-pressed={active}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.currentTarget.blur();
              audio.unlock();
              game.current?.select(i);
            }}
            className={`g-hud relative grid place-items-center transition-transform ${touch ? "size-12" : "size-14"} ${active ? "-translate-y-1 shadow-[0_0_0_2px_var(--accent),0_6px_14px_#0006]" : "opacity-90"}`}
          >
            {s.icon ? <Icon src={icons[s.icon]} alt={s.label} className={touch ? "size-9" : "size-10"} /> : <span className="g-muted text-[11px] leading-none">{s.label}</span>}
            <span className="g-kbd absolute -top-1.5 -left-1 px-1 text-[10px] leading-tight">{i + 1}</span>
            {s.count !== undefined && <span className="g-display absolute right-0.5 bottom-0 text-sm leading-none tabular-nums">{s.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Vignettes({ store }: { store: Store<Hud> }) {
  const hud = useStore(store);
  return (
    <>
      {hud.health > 0 && hud.health < 30 && <div className="cw-anim pointer-events-none absolute inset-0 animate-[cw-pulse_1.1s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(153_27_27/0.5)_100%)]" />}
      {hud.cold && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgb(147_197_253/0.35)_100%)]" />}
      {hud.sleeping && <div className="pointer-events-none absolute inset-0 bg-[#0b1020]/45" />}
    </>
  );
}

function Toasts({ store, icons, touch }: { store: Store<Toast[]>; icons: Record<string, string>; touch: boolean }) {
  const list = useStore(store);
  return (
    <div className={`pointer-events-none absolute left-2.5 flex max-w-[70vw] flex-col items-start gap-1 sm:left-4 sm:max-w-sm ${touch ? "top-[176px]" : "top-[214px] sm:top-[260px]"}`}>
      {list.slice(-4).map((t) => (
        <p
          key={t.id}
          className={`cw-anim g-hud flex animate-[cw-toast_3.2s_ease_forwards] items-center gap-1.5 px-2.5 py-1 text-[15px] leading-tight ${t.kind === "warn" ? "text-[#9a3412]" : ""} ${t.kind === "achievement" ? "shadow-[0_0_0_2px_var(--accent)]" : ""}`}
        >
          {t.icon && <Icon src={icons[t.icon]} alt="" className="size-6" />}
          {t.kind === "achievement" && <Trophy className="size-4 shrink-0 text-[var(--accent)]" />}
          {t.kind === "objective" && <Check className="size-4 shrink-0 text-[#15803d]" />}
          {t.text}
        </p>
      ))}
    </div>
  );
}

function ControlsHint() {
  return (
    <div className="cw-anim pointer-events-none absolute inset-x-0 bottom-[110px] flex animate-[cw-hint_9s_ease_forwards] justify-center px-4 opacity-0">
      <p className="g-hud px-4 py-2 text-center text-[15px]">
        <Kbd>WASD</Kbd> walk · <Kbd>Shift</Kbd> run · <Kbd>Space</Kbd> gather / fight · <Kbd>C</Kbd> journal · <Kbd>E</Kbd> eat · <Kbd>← →</Kbd> or drag to look
      </p>
    </div>
  );
}

// --- Crafting journal --------------------------------------------------------------------------------

function Journal({ store, icons, tab, setTab, game }: { store: Store<Hud>; icons: Record<string, string>; tab: Tab; setTab: (t: Tab) => void; game: { current: CastawayGame | null } }) {
  const hud = useStore(store);
  const { craft } = hud;
  const list = RECIPES.filter((r) => r.tab === tab);
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-black/45 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-2 sm:p-4">
        <div role="dialog" aria-label="Crafting journal" className="g-panel relative w-full max-w-3xl p-4 sm:p-6">
          <button type="button" onClick={() => game.current?.closeBook()} aria-label="Close journal" className="g-tint absolute top-3 right-3 grid size-9 place-items-center rounded-full hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <X className="size-4" />
          </button>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1 pr-10">
            <h2 className="g-panel-title text-3xl sm:text-4xl">Survivor&apos;s journal</h2>
            <span className="g-muted pb-1 text-sm">
              Day {hud.day} · <Kbd>C</Kbd> to close
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
            <span className={`inline-flex items-center gap-1 rounded-[var(--g-hud-radius)] px-2 py-0.5 ${craft.bench ? "bg-[#15803d]/15 text-[#14532d]" : "g-tint g-muted"}`}>
              <Wrench className="size-3.5" /> {craft.bench ? "At the workbench" : "No workbench nearby"}
            </span>
            {craft.chest && <span className="g-tint inline-flex items-center gap-1 rounded-[var(--g-hud-radius)] px-2 py-0.5">Using your chest too</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {RESOURCES.map((r) => (
              <span key={r} className="g-tint inline-flex items-center gap-1 rounded-[var(--g-hud-radius)] px-1.5 py-0.5" title={ITEMS[r].name}>
                <Icon src={icons[r]} alt={ITEMS[r].name} className="size-6" />
                <span className="g-display tabular-nums">{craft.have[r]}</span>
              </span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} data-active={tab === t.id} onClick={() => setTab(t.id)} className="g-soft g-display px-2 py-1.5 text-base focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                <span className="g-unskew">{t.name}</span>
              </button>
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((r) => {
              const open = craft.unlocked.includes(r.id);
              const owned = r.id in ITEMS && !r.build && r.id !== "planks" && craft.crafted.includes(r.id);
              const enough = Object.entries(r.cost).every(([k, v]) => craft.have[k as ResourceId] >= (v ?? 0));
              const benchOk = !r.bench || craft.bench;
              const can = open && enough && benchOk && !owned;
              return (
                <li key={r.id} className={`g-tint flex gap-2.5 rounded-[var(--g-hud-radius)] p-2.5 ${open ? "" : "opacity-70"}`}>
                  <span className="grid size-14 shrink-0 place-items-center rounded-md bg-[#fff7ed]/60">
                    <Icon src={icons[r.id] ?? icons[r.icon]} alt={r.name} className={`size-12 ${open ? "" : "opacity-40 grayscale"}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="g-display flex items-center gap-1.5 text-lg leading-tight">
                      {open ? r.name : "???"}
                      {owned && <Check className="size-4 text-[#15803d]" />}
                      {r.bench && <Wrench className="size-3.5 opacity-60" aria-label="Needs workbench" />}
                    </p>
                    <p className="g-muted text-sm leading-snug">{open ? r.desc : `Locked — ${r.hint}`}</p>
                    {open && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.entries(r.cost).map(([k, v]) => {
                          const ok = craft.have[k as ResourceId] >= (v ?? 0);
                          return (
                            <span key={k} className={`inline-flex items-center gap-0.5 rounded px-1 text-sm tabular-nums ${ok ? "bg-[#fff7ed]/70" : "bg-[#fecaca]/70 text-[#991b1b]"}`}>
                              <Icon src={icons[k]} alt={ITEMS[k as ResourceId].name} className="size-5" />
                              {craft.have[k as ResourceId]}/{v}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {open && (
                    <button
                      type="button"
                      disabled={!can}
                      onClick={() => {
                        audio.unlock();
                        game.current?.craft(r.id as RecipeId);
                      }}
                      className="g-btn self-center px-3 py-2 text-base disabled:opacity-45"
                    >
                      <span className="g-unskew">{owned ? "Owned" : !benchOk ? "Bench" : r.build ? "Build" : "Craft"}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="g-muted mt-3 text-center text-sm">New recipes appear as you discover materials. Buildings are placed in the world after you pick them.</p>
        </div>
      </div>
    </div>
  );
}

// --- Touch controls ----------------------------------------------------------------------------------

function TouchControls({ game, store }: { game: { current: CastawayGame | null }; store: Store<Hud> }) {
  const hud = useStore(store);
  const stickRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const R = 50;

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (stickRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stickRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setKnob({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  };
  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      s.x += (dx / l) * (l - R);
      s.y += (dy / l) * (l - R);
      dx = e.clientX - s.x;
      dy = e.clientY - s.y;
    }
    game.current?.setStick(dx / R, -dy / R);
    setKnob({ ox: s.x, oy: s.y, x: dx, y: dy });
  };
  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    stickRef.current = null;
    game.current?.setStick(0, 0);
    setKnob(null);
  };

  const ActionIcon = hud.placing ? Check : hud.danger > 0 && hud.prompt?.text.startsWith("Attack") ? Sword : Hand;
  return (
    <>
      <div className="absolute bottom-[64px] left-0 h-[46%] w-[52%] touch-none" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp} aria-label="Move">
        {knob ? (
          <div className="pointer-events-none fixed" style={{ left: knob.ox - R - 14, top: knob.oy - R - 14 }}>
            <div className="relative rounded-full border-2 border-dashed border-[#fff7ed]/60 bg-black/25" style={{ width: (R + 14) * 2, height: (R + 14) * 2 }}>
              <div className="absolute size-14 rounded-full border-2 border-[#2b2118] bg-[var(--accent)] shadow-[2px_3px_0_#2b2118]" style={{ left: R + 14 - 28 + knob.x, top: R + 14 - 28 + knob.y }} />
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-6 left-6 grid size-28 place-items-center rounded-full border-2 border-dashed border-[#fff7ed]/45 bg-black/20">
            <div className="size-11 rounded-full border-2 border-[#2b2118]/70 bg-[var(--accent)]/60" />
          </div>
        )}
      </div>

      <div className="absolute right-2 bottom-[70px] h-[200px] w-[190px] touch-none select-none">
        <TouchButton
          className="g-btn right-1 bottom-1 size-[84px]"
          label="Action"
          onDown={() => game.current?.press(true)}
          onUp={() => game.current?.press(false)}
        >
          <ActionIcon className="size-9" />
        </TouchButton>
        {hud.placing ? (
          <>
            <TouchButton className="g-hud right-[96px] bottom-0 size-14" label="Rotate" onDown={() => game.current?.rotatePlacing()}>
              <RotateCw className="size-6" />
            </TouchButton>
            <TouchButton className="g-hud right-0 bottom-[96px] size-14" label="Cancel building" onDown={() => game.current?.cancelPlacing()}>
              <X className="size-6" />
            </TouchButton>
          </>
        ) : (
          <>
            <TouchButton className="g-hud right-[96px] bottom-0 size-14" label="Eat" onDown={() => game.current?.eat()} dim={!hud.foods.length}>
              <Apple className="size-6" />
            </TouchButton>
            <TouchButton className="g-hud right-0 bottom-[96px] size-14" label="Crafting journal" onDown={() => game.current?.openBook()}>
              <BookOpen className="size-6" />
            </TouchButton>
          </>
        )}
      </div>
    </>
  );
}

function TouchButton({ className, onDown, onUp, label, children, dim = false }: { className: string; onDown: () => void; onUp?: () => void; label: string; children: ReactNode; dim?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        audio.unlock();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute grid touch-none place-items-center transition active:scale-95 ${dim ? "opacity-60" : ""} ${className}`}
    >
      <span className="g-unskew">{children}</span>
    </button>
  );
}
