"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CircleHelp, Gem, Heart, Home, Magnet, Map as MapIcon, Pause, Play, RotateCcw, Shirt, ShoppingBag, Sparkles, Trophy, User } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { CITY_RUSH } from "../shared/songs";
import { playablesFirstFrame, playablesLifecycle, playablesLoad, playablesReady, playablesSave, playablesScore, inPlayables } from "../shared/playables";
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
  usePhoneLandscape,
  useShortcuts,
  useStore,
  type Store,
} from "../shared/ui";
import { BOARDS, findItem, ITEMS, SKATERS, SKINS, STAGES, type ShopItem, type ShopKind } from "./content";
import { SkateRushGame, type Hud, type Loadout, type Move, type Phase, type RunResult } from "./engine";
import { GAME } from "./manifest";
import { CoinIcon, isOwned, ownedKey, Shop } from "./shop";

interface Save {
  best: number;
  bank: number;
  runs: number;
  /** Version 1 saves: 0 = Skate Boy, 1 = Skate Girl. */
  character: number;
  skater: string;
  skin: string;
  board: string;
  stage: string;
  /** Bought items, "kind:id". */
  owned: string[];
}

const DEFAULTS: Save = { best: 0, bank: 0, runs: 0, character: 0, skater: "", skin: SKINS[0].id, board: BOARDS[0].id, stage: STAGES[0].id, owned: [] };

// In YouTube Playables progress goes to YouTube's cloud save instead of this browser.
const records = createRecords("skate-rush:v1", DEFAULTS, { cloud: inPlayables() ? playablesSave : undefined });

/** The equipped items, falling back to the free ones for anything unknown or not owned. */
function loadoutOf(save: Save): Loadout {
  const skater = save.skater || (save.character === 1 ? SKATERS[1].id : SKATERS[0].id);
  const pick = (kind: ShopKind, id: string) => {
    const list = ITEMS[kind];
    const item = list.find((i) => i.id === id);
    return item && isOwned(save, kind, item) ? item.id : list[0].id;
  };
  return { skater: pick("skater", skater), skin: pick("skin", save.skin), board: pick("board", save.board), stage: pick("stage", save.stage) };
}

const EMPTY_HUD: Hud = { score: 0, coins: 0, distance: 0, shield: false, magnet: 0, boost: 0 };

const KEY_MOVES: Record<string, Move> = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowUp: "jump",
  w: "jump",
  W: "jump",
  " ": "jump",
  ArrowDown: "duck",
  s: "duck",
  S: "duck",
};

type Result = RunResult & { newBest: boolean; bonus: number; multiplier: number };

/** What the 3D camera frames for each shop tab. */
const showcaseOf = (kind: ShopKind) => (kind === "board" ? "board" : kind === "stage" ? "stage" : "skater");

export function SkateRush({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SkateRushGame | null>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [help, setHelp] = useState(false);
  const [shop, setShop] = useState<{ tab: ShopKind; selected: string } | null>(null);
  const [busy, setBusy] = useState<{ label: string; ratio: number } | null>(null);
  const saved = useRecords(records);
  const loadout = loadoutOf(saved);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const youtube = inPlayables();
    const game = new SkateRushGame(
      canvas,
      {
        progress: setProgress,
        phase: setPhase,
        hud: hud.set,
        error: setError,
        busy: setBusy,
        over: (run) => {
          const before = records.get();
          const multiplier = findItem(STAGES, loadoutOf(before).stage).rules.coins;
          const bonus = Math.round(run.coins * (multiplier - 1));
          const newBest = run.score > before.best;
          records.set({ best: Math.max(before.best, run.score), bank: before.bank + run.coins + bonus, runs: before.runs + 1 });
          if (newBest) playablesScore(run.score);
          setResult({ ...run, newBest, bonus, multiplier });
        },
      },
      { visibility: !youtube },
    );
    gameRef.current = game;
    // Dev server only: scripts/record-skate-trailer.mjs drives the game (and renders its music) through this.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __skateRush: { game, records, audio, music, song: CITY_RUSH } });
    playablesFirstFrame();
    const stopLifecycle = playablesLifecycle(
      () => {
        game.pause();
        game.setSuspended(true);
      },
      () => game.setSuspended(false),
    );
    void (async () => {
      // YouTube: wait for the cloud save before anything can be saved over it.
      const cloud = await playablesLoad();
      if (cloud) records.hydrate(cloud as Partial<Save>);
      if (gameRef.current === game) void game.load(modelSizes, loadoutOf(records.get()));
    })();
    return () => {
      stopLifecycle();
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  useEffect(() => {
    if (phase === "menu") playablesReady();
  }, [phase]);

  const start = () => {
    const game = gameRef.current;
    if (!game || busy) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setHelp(false);
    setRunKey((k) => k + 1);
    game.start();
  };

  const toMenu = () => {
    setResult(null);
    gameRef.current?.toMenu();
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

  useShortcuts({ onPause: shop ? undefined : pauseOrResume, onHelp: openHelp });

  // --- Shop ---

  /** Shows an item on the 3D skater (a preview, or the equipped one). */
  const preview = (kind: ShopKind, id: string) => {
    const game = gameRef.current;
    if (!game) return;
    if (kind === "skater") void game.setSkater(id);
    else if (kind === "skin") game.setSkin(id);
    else if (kind === "board") game.setBoard(id);
    else void game.setStage(id);
  };

  const shift = useRef({ x: 0, y: 0 });
  const shopTab = useRef<ShopKind>("skater");

  const openShop = (tab: ShopKind = "skater") => {
    if (phase === "over") toMenu();
    else if (phase !== "menu") return;
    setResult(null);
    shopTab.current = tab;
    setShop({ tab, selected: loadout[tab] });
    gameRef.current?.setShowcase(showcaseOf(tab), shift.current);
  };

  const closeShop = () => {
    const game = gameRef.current;
    setShop(null);
    if (!game) return;
    // Back to what's equipped (the last previews may not be owned).
    const now = loadoutOf(records.get());
    const current = game.currentLoadout;
    (Object.keys(now) as ShopKind[]).forEach((kind) => now[kind] !== current[kind] && preview(kind, now[kind]));
    game.setShowcase("menu");
  };

  const pickTab = (tab: ShopKind) => {
    if (!shop) return;
    // Leaving a tab puts its equipped item back on the skater.
    if (shop.selected !== loadout[shop.tab]) preview(shop.tab, loadout[shop.tab]);
    shopTab.current = tab;
    setShop({ tab, selected: loadout[tab] });
    gameRef.current?.setShowcase(showcaseOf(tab), shift.current);
  };

  const pickItem = (id: string) => {
    if (!shop) return;
    setShop({ ...shop, selected: id });
    preview(shop.tab, id);
  };

  const equip = (kind: ShopKind, id: string) => {
    records.set({ [kind]: id } as Partial<Save>);
    preview(kind, id);
  };

  const buy = (kind: ShopKind, item: ShopItem) => {
    const save = records.get();
    if (save.bank < item.price || isOwned(save, kind, item)) return;
    records.set({ bank: save.bank - item.price, owned: [...save.owned, ownedKey(kind, item.id)], [kind]: item.id } as Partial<Save>);
    gameRef.current?.sfx.power();
    preview(kind, item.id);
  };

  const onLayout = useCallback((s: { x: number; y: number }) => {
    shift.current = s;
    gameRef.current?.setShowcase(showcaseOf(shopTab.current), s);
  }, []);

  // Game keys: arrows / WASD / Space while running, Enter on the menus, B for the shop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || shop) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = e.key === "Enter" || e.key === " ";
      if (phase === "playing") {
        const move = KEY_MOVES[e.key];
        if (move) {
          e.preventDefault();
          if (!e.repeat) game.input(move);
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
        } else if (e.key === "b" || e.key === "B") openShop();
      } else if (phase === "over") {
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        } else if (e.key === "Escape") toMenu();
        else if (e.key === "b" || e.key === "B") openShop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving the tab or window pauses the run (YouTube pauses through its own SDK instead).
  useEffect(() => {
    if (inPlayables()) return;
    const pause = () => gameRef.current?.pause();
    const onVisibility = () => document.hidden && pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", pause);
    };
  }, []);

  // Swipes (touch or mouse drag). Each 24px of travel fires one move, so a single touch can chain moves.
  const onPointerDown = (e: ReactPointerEvent) => {
    if (phase === "playing") swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const s = swipe.current;
    const game = gameRef.current;
    if (!s || !game) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) < 24) return;
    game.input(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "jump" : "duck");
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const endSwipe = () => {
    swipe.current = null;
  };

  const running = phase === "playing" || phase === "paused" || phase === "crashed";

  return (
    <GameRoot game={GAME} className="bg-[#cde3f4]" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endSwipe} onPointerCancel={endSwipe}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Skate Rush game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !shop && (
        <MenuScreen loadout={loadout} best={saved.best} bank={saved.bank} busy={busy} onPlay={start} onShop={openShop} onHelp={() => setHelp(true)} />
      )}

      {phase === "menu" && shop && (
        <Shop
          save={{ ...saved, ...loadout }}
          tab={shop.tab}
          selected={shop.selected}
          busy={busy}
          onTab={pickTab}
          onSelect={pickItem}
          onBuy={buy}
          onEquip={equip}
          onClose={closeShop}
          onLayout={onLayout}
        />
      )}

      {running && <HudOverlay store={hud} best={saved.best} paused={phase === "paused"} onPause={pauseOrResume} />}
      {phase === "playing" && saved.runs < 3 && <ControlsHint key={runKey} />}

      {phase === "paused" && !help && (
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
        </Modal>
      )}

      {phase === "over" && result && !help && (
        <Modal title="Wiped out!">
          <div className="text-center">
            {result.newBest && (
              <p className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-xs font-black tracking-wider text-amber-950 uppercase">
                <Trophy className="size-3.5" /> New best
              </p>
            )}
            <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">Score</p>
            <p className="g-display text-6xl tabular-nums pointer-coarse:text-5xl">{formatNumber(result.score)}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Coins" value={formatNumber(result.coins + result.bonus)} />
            <Stat label="Distance" value={`${formatNumber(result.distance)} m`} />
            <Stat label="Best" value={formatNumber(Math.max(saved.best, result.score))} />
          </div>
          {result.bonus > 0 && (
            <p className="g-tint flex items-center justify-center gap-1.5 rounded-[var(--g-hud-radius)] px-3 py-1.5 text-center text-xs font-bold">
              <Sparkles className="size-3.5 text-amber-300" /> {findItem(STAGES, loadout.stage).name} bonus ×{result.multiplier}: +{formatNumber(result.bonus)}
            </p>
          )}
          <BigButton onClick={start} icon={<RotateCcw className="size-5" />}>
            Play again
          </BigButton>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => openShop()} icon={<ShoppingBag className="size-4" />}>
              Shop · {formatNumber(saved.bank)}
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
        </Modal>
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function MenuScreen({
  loadout,
  best,
  bank,
  busy,
  onPlay,
  onShop,
  onHelp,
}: {
  loadout: Loadout;
  best: number;
  bank: number;
  busy: { label: string; ratio: number } | null;
  onPlay: () => void;
  onShop: (tab?: ShopKind) => void;
  onHelp: () => void;
}) {
  const tiles: { kind: ShopKind; label: string; value: string; icon: ReactNode }[] = [
    { kind: "skater", label: "Skater", value: findItem(SKATERS, loadout.skater).name, icon: <User className="size-4" /> },
    { kind: "skin", label: "Skin", value: findItem(SKINS, loadout.skin).name, icon: <Shirt className="size-4" /> },
    { kind: "board", label: "Board", value: findItem(BOARDS, loadout.board).name, icon: <BoardIcon /> },
    { kind: "stage", label: "Stage", value: findItem(STAGES, loadout.stage).name, icon: <MapIcon className="size-4" /> },
  ];
  const sideways = usePhoneLandscape();
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp} />
      </div>

      <div className="px-4 pt-2 text-center sm:pt-4 land:pt-0">
        <GameTitle game={GAME} size={sideways ? "sm" : "lg"} />
        <p className="g-display mt-3 text-sm text-white [text-shadow:2px_2px_0_#111] sm:text-base land:hidden">Dodge the traffic · grab the coins · don&apos;t stop</p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-2.5 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8 land:max-w-3xl land:space-y-1.5 land:pb-2">
        <div className="space-y-2.5 land:flex land:items-stretch land:gap-2 land:space-y-0">
        <div className="grid grid-cols-4 gap-1.5 land:flex-1">
          {tiles.map((t) => (
            <button
              key={t.kind}
              type="button"
              onClick={() => onShop(t.kind)}
              title={`${t.label}: ${t.value} — open the shop`}
              className="g-hud flex min-w-0 flex-col items-center gap-0.5 px-1 py-1.5 text-center hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:py-1"
            >
              <span className="flex items-center gap-1 text-[10px] font-bold tracking-[0.12em] uppercase opacity-70">
                {t.icon}
                <span className="hidden min-[380px]:inline">{t.label}</span>
              </span>
              <span className="g-display w-full truncate text-[11px] leading-tight sm:text-xs">{t.value}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2 land:w-60 land:shrink-0">
          <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus disabled={!!busy}>
            {busy ? `${Math.round(busy.ratio * 100)}%` : "Play"}
          </BigButton>
          <button
            type="button"
            onClick={() => onShop()}
            className="g-soft flex flex-col items-center justify-center gap-0.5 px-4 text-xs font-bold focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:px-3"
          >
            <ShoppingBag className="size-5" />
            Shop
          </button>
        </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 land:py-1">
            <Trophy className="size-3.5 text-amber-300" /> Best {formatNumber(best)}
          </span>
          <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 land:py-1">
            <CoinIcon /> {formatNumber(bank)} coins
          </span>
          <button
            type="button"
            onClick={onHelp}
            className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:py-1"
          >
            <CircleHelp className="size-3.5" /> How to play
          </button>
        </div>

        <p className="hidden text-center text-xs font-semibold text-white/85 [text-shadow:0_1px_4px_rgb(0_0_0/0.5)] sm:block land:hidden">
          ← → change lane · ↑ / Space jump · ↓ duck · B shop · Esc pause · M music
        </p>
        <p className="text-center text-xs font-semibold text-white/85 [text-shadow:0_1px_4px_rgb(0_0_0/0.5)] sm:hidden">Swipe ← → to change lane · ↑ jump · ↓ duck</p>
      </div>
    </div>
  );
}

function BoardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <rect x="2" y="8" width="20" height="6" rx="3" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </svg>
  );
}

function HudOverlay({ store, best, paused, onPause }: { store: Store<Hud>; best: number; paused: boolean; onPause: () => void }) {
  const hud = useStore(store);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
      <div className="space-y-2">
        <div className="g-hud inline-flex items-center gap-2 py-1.5 pr-4 pl-1.5">
          <CoinIcon large />
          <span className="g-display text-xl tabular-nums">{formatNumber(hud.coins)}</span>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          {hud.shield && <PowerChip icon={<Heart className="size-3.5 fill-current" />} label="Shield" tone="bg-rose-500" />}
          {hud.magnet > 0 && <PowerChip icon={<Magnet className="size-3.5" />} label="Magnet" tone="bg-amber-500" left={hud.magnet} />}
          {hud.boost > 0 && <PowerChip icon={<Gem className="size-3.5" />} label="2× Score" tone="bg-indigo-500" left={hud.boost} />}
        </div>
      </div>

      <div className="flex items-start gap-2">
        <div className="g-hud px-4 py-1.5 text-right">
          <p className="g-display text-2xl leading-tight tabular-nums sm:text-3xl">{formatNumber(hud.score)}</p>
          <p className="text-[11px] font-bold tabular-nums opacity-70">
            {formatNumber(hud.distance)} m · best {formatNumber(Math.max(best, hud.score))}
          </p>
        </div>
        <div className="pointer-events-auto flex flex-col gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <SystemButtons vertical />
        </div>
      </div>
    </div>
  );
}

function ControlsHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),24px)] flex animate-[skate-hint_5s_ease_forwards] justify-center px-4">
      <p className="g-hud px-4 py-2 text-center text-sm font-bold">
        <span className="hidden sm:inline">← → change lane · ↑ jump · ↓ duck</span>
        <span className="sm:hidden">Swipe to dodge · up to jump · down to duck</span>
      </p>
    </div>
  );
}

function PowerChip({ icon, label, tone, left }: { icon: ReactNode; label: string; tone: string; left?: number }) {
  return (
    <div className="g-hud inline-flex items-center gap-2 py-1 pr-3 pl-1 text-xs font-bold">
      <span className={`grid size-6 place-items-center rounded-full ${tone}`}>{icon}</span>
      {label}
      {left !== undefined && (
        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_20%,transparent)]">
          <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, (left / 10) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}
