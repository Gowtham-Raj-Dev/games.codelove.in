"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CircleHelp,
  Coins,
  Crown,
  Droplet,
  Flame,
  FlaskConical,
  Footprints,
  Gamepad2,
  Heart,
  Home,
  Pause,
  Play,
  RotateCcw,
  Shield,
  ShoppingBag,
  Skull,
  Sparkles,
  Star,
  Sword,
  Swords,
  Tornado,
  Trophy,
  Wind,
  Zap,
} from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { CRYPT_EPIC } from "../shared/songs";
import { ControlsButton } from "../shared/touch-layout";
import {
  BigButton,
  createRecords,
  createStore,
  formatNumber,
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
  usePhoneLandscape,
  useRecords,
  useShortcuts,
  useStore,
  type Store,
} from "../shared/ui";
import { findItem, HEROES, ROOMS_PER_WORLD, stageReward, WORLDS, type ShopItem, type ShopKind } from "./content";
import { CryptKnightGame, type Hud, type Loadout, type Offer, type Phase, type RunSummary } from "./engine";
import { GAME } from "./manifest";
import type { PowerIcon } from "./powers";
import { CoinIcon, isOwned, ownedKey, Shop } from "./shop";
import { nextStage, StageMap, Stars } from "./stages";
import { ControlsEditor, TouchControls } from "./touch";

/** `stars`: per world, the stars of each of its ten stages (0 = not cleared). bestDepth / wins / bestTime are from the old ten-room runs. */
const records = createRecords("crypt-knight:v1", {
  bestDepth: 0,
  wins: 0,
  runs: 0,
  bestTime: 0,
  kills: 0,
  bank: 0,
  owned: [] as string[],
  hero: HEROES[0].id,
  skin: "classic",
  world: WORLDS[0].id,
  worlds: {} as Record<string, { best: number; wins: number }>,
  stars: {} as Record<string, number[]>,
});

type Save = ReturnType<typeof records.get>;

const loadoutOf = (save: Loadout): Loadout => ({ hero: save.hero, skin: save.skin, world: save.world });

/** A world's stars per stage. Old saves: the crypt rooms reached in a run count as cleared stages. */
const starsOf = (save: Save, world: string): number[] => {
  const saved = save.stars[world];
  if (saved) return saved;
  const legacy = world === WORLDS[0].id ? (save.wins > 0 ? ROOMS_PER_WORLD : Math.max(0, save.bestDepth - 1)) : 0;
  return Array.from({ length: ROOMS_PER_WORLD }, (_, i) => (i < legacy ? 1 : 0));
};

/** Why a world can't be bought yet: every stage of the world before it must be cleared first. */
const worldGate = (save: Save, id: string) => {
  const i = WORLDS.findIndex((w) => w.id === id);
  return i <= 0 || starsOf(save, WORLDS[i - 1].id).every((n) => n > 0) ? null : `Clear every stage of ${WORLDS[i - 1].name} first`;
};

const EMPTY_HUD: Hud = { hp: 100, maxHp: 100, potions: 2, maxPotions: 3, coins: 0, charge: 0, roll: 1, room: 1, rooms: 10, enemies: 0, boss: null, doorOpen: false, potionPrice: 30 };

const ICONS: Record<PowerIcon, ReactNode> = {
  sword: <Sword className="size-6" />,
  zap: <Zap className="size-6" />,
  heart: <Heart className="size-6" />,
  wind: <Wind className="size-6" />,
  droplet: <Droplet className="size-6" />,
  tornado: <Tornado className="size-6" />,
  flame: <Flame className="size-6" />,
  shield: <Shield className="size-6" />,
  swords: <Swords className="size-6" />,
  skull: <Skull className="size-6" />,
  flask: <FlaskConical className="size-6" />,
  coins: <Coins className="size-6" />,
  footprints: <Footprints className="size-6" />,
  sparkles: <Sparkles className="size-6" />,
};

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Keyframes used by this game's overlays (scoped names). */
const STYLES = `
@keyframes ck-banner { 0% { opacity: 0; transform: translateY(10px) scale(0.96); } 12% { opacity: 1; transform: none; } 78% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
@keyframes ck-hurt { 0% { opacity: 0.85; } 100% { opacity: 0; } }
@keyframes ck-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.7; } }
@keyframes ck-hint { 0% { opacity: 0; transform: translateY(8px); } 8%, 80% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes ck-card { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ck-anim { animation-duration: 0.01s !important; } }
`;

export function CryptKnight({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<CryptKnightGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [later, setLater] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Offer[] | null>(null);
  const [summary, setSummary] = useState<(RunSummary & { newBest: boolean; saved: number }) | null>(null);
  const [shop, setShop] = useState<{ tab: ShopKind; selected: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [map, setMap] = useState(false);
  /** The stage being played (0-based). */
  const stageRef = useRef(0);
  const [banner, setBanner] = useState<{ title: string; sub?: string; id: number } | null>(null);
  const [hurtKey, setHurtKey] = useState(0);
  const [help, setHelp] = useState(false);
  const [touch, setTouch] = useState(false);
  const [editing, setEditing] = useState(false);
  // The HUD shown behind the controls editor when it opens from the title screen.
  const [menuHud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [runKey, setRunKey] = useState(0);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new CryptKnightGame(canvas, {
      progress: setProgress,
      later: setLater,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      choose: setOptions,
      banner: (title, sub) => setBanner({ title, sub, id: performance.now() }),
      hurt: () => setHurtKey((k) => k + 1),
      over: (run) => {
        const before = records.get();
        const world = findItem(WORLDS, before.world);
        const saved = stageReward(run.coins, run.stars, run.won && run.stage === ROOMS_PER_WORLD - 1, world);
        const stars = [...starsOf(before, world.id)];
        const newBest = run.stars > stars[run.stage];
        stars[run.stage] = Math.max(stars[run.stage], run.stars);
        records.set({ stars: { ...before.stars, [world.id]: stars }, runs: before.runs + 1, kills: before.kills + run.kills, bank: before.bank + saved });
        setSummary({ ...run, newBest, saved });
      },
    });
    gameRef.current = game;
    void game.load(modelSizes, loadoutOf(records.get()));
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __cryptKnight: { game, records, audio, music, song: CRYPT_EPIC, ui: { map: setMap } } });
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

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

  const start = (stage = stageRef.current) => {
    const game = gameRef.current;
    if (!game) return;
    stageRef.current = stage;
    setMap(false);
    (document.activeElement as HTMLElement | null)?.blur();
    setSummary(null);
    setOptions(null);
    setHelp(false);
    setEditing(false);
    if (shop) closeShop();
    setRunKey((k) => k + 1);
    game.start(stage);
  };

  /** The stage map of the equipped world (from the title screen or the results). */
  const openMap = () => {
    if (phase === "over") toMenu();
    setMap(true);
  };

  /** World chip on the stage map: owned worlds are entered, locked ones open in the shop. */
  const pickWorld = (id: string) => {
    const save = records.get();
    if (isOwned(save, "world", findItem(WORLDS, id))) {
      records.set({ world: id });
      gameRef.current?.setWorld(id);
    } else {
      setMap(false);
      openShop("world", id);
    }
  };

  const toMenu = () => {
    setSummary(null);
    setEditing(false);
    setOptions(null);
    gameRef.current?.toMenu();
  };

  const pick = (id: string) => {
    setOptions(null);
    gameRef.current?.choosePower(id);
  };

  // --- Shop: picking an item previews it on the hero; closing puts back what's equipped. ---
  const shown = useRef<Loadout | null>(null);
  const shift = useRef({ x: 0, y: 0 });

  const preview = (kind: ShopKind, id: string) => {
    const game = gameRef.current;
    const now = (shown.current ??= loadoutOf(records.get()));
    if (!game || now[kind] === id) return;
    now[kind] = id;
    if (kind === "hero") {
      setBusy(0);
      void game.setHero(id, setBusy).finally(() => setBusy(null));
    } else if (kind === "skin") game.setSkin(id);
    else game.setWorld(id);
  };

  const openShop = (tab: ShopKind = "hero", selected?: string) => {
    if (phase === "over") toMenu();
    else if (phase !== "menu") return;
    const save = records.get();
    shown.current = loadoutOf(save);
    setMap(false);
    setShop({ tab, selected: selected ?? save[tab] });
    if (selected) preview(tab, selected);
    gameRef.current?.setShowcase(true, shift.current);
  };

  function closeShop() {
    const save = records.get();
    setShop(null);
    (["hero", "skin", "world"] as const).forEach((kind) => preview(kind, save[kind]));
    gameRef.current?.setShowcase(false);
  }

  const pickTab = (tab: ShopKind) => {
    if (!shop) return;
    // Leaving a tab puts its equipped item back on.
    preview(shop.tab, records.get()[shop.tab]);
    setShop({ tab, selected: records.get()[tab] });
  };

  const pickItem = (id: string) => {
    if (!shop) return;
    setShop({ ...shop, selected: id });
    preview(shop.tab, id);
  };

  const equip = (kind: ShopKind, id: string) => {
    records.set({ [kind]: id });
    preview(kind, id);
  };

  const buy = (kind: ShopKind, item: ShopItem) => {
    const save = records.get();
    if (save.bank < item.price || isOwned(save, kind, item) || (kind === "world" && worldGate(save, item.id))) return;
    records.set({ bank: save.bank - item.price, owned: [...save.owned, ownedKey(kind, item.id)], [kind]: item.id });
    preview(kind, item.id);
    gameRef.current?.celebrate();
  };

  const onLayout = useCallback((s: { x: number; y: number }) => {
    shift.current = s;
    gameRef.current?.setShowcase(true, s);
  }, []);

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
    if (shop) return;
    if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Menu keys: Enter starts, 1–3 pick a power, Escape leaves the results.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || editing || shop || map || e.repeat) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = e.key === "Enter" || (e.key === " " && !onButton);
      if (phase === "menu" && confirm && !onButton) {
        e.preventDefault();
        openMap();
      } else if ((phase === "menu" || phase === "over") && e.key.toLowerCase() === "s") {
        e.preventDefault();
        openShop();
      } else if (phase === "paused" && confirm && !onButton) {
        e.preventDefault();
        game.resume();
      } else if (phase === "choosing" && options) {
        const i = ["1", "2", "3"].indexOf(e.key);
        if (i >= 0 && options[i]) pick(options[i].power.id);
        else if (e.key.toLowerCase() === "b") game.buyPotion();
      } else if (phase === "over" && summary) {
        if (confirm && !onButton) {
          e.preventDefault();
          start(summary.won && summary.stage < ROOMS_PER_WORLD - 1 ? summary.stage + 1 : summary.stage);
        } else if (e.key === "Escape") openMap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving the tab or window pauses the run.
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

  const running = phase === "playing" || phase === "paused" || phase === "choosing";

  return (
    <GameRoot game={GAME} className="bg-[#07050b]">
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Crypt Knight game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !editing && !shop && !map && (
        <MenuScreen
          stars={starsOf(saved, saved.world)}
          world={findItem(WORLDS, saved.world).name}
          hero={findItem(HEROES, saved.hero).name}
          bank={saved.bank}
          later={later}
          onPlay={openMap}
          onShop={() => openShop()}
          onHelp={() => setHelp(true)}
          onControls={() => setEditing(true)}
          touch={touch}
        />
      )}
      {phase === "menu" && shop && (
        <Shop
          save={saved}
          tab={shop.tab}
          selected={shop.selected}
          busy={busy}
          gate={(kind, item) => (kind === "world" ? worldGate(saved, item.id) : null)}
          onTab={pickTab}
          onSelect={pickItem}
          onBuy={buy}
          onEquip={equip}
          onClose={closeShop}
          onLayout={onLayout}
        />
      )}
      {phase === "menu" && map && !shop && (
        <StageMap
          world={saved.world}
          stars={starsOf(saved, saved.world)}
          owned={(id) => isOwned(saved, "world", findItem(WORLDS, id))}
          onWorld={pickWorld}
          onPlay={start}
          onClose={() => setMap(false)}
        />
      )}
      {phase === "menu" && editing && <HudOverlay store={menuHud} paused={false} onPause={() => {}} touch />}

      {running && <HudOverlay store={hud} paused={phase === "paused"} onPause={pauseOrResume} touch={touch} />}
      {running && <LowHealth store={hud} />}
      {hurtKey > 0 && running && (
        <div key={`hurt-${hurtKey}`} className="ck-anim pointer-events-none absolute inset-0 animate-[ck-hurt_0.5s_ease-out_forwards] bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(185_28_28/0.55)_100%)]" />
      )}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}
      {phase === "playing" && !touch && saved.runs < 3 && <ControlsHint key={`hint-${runKey}`} />}

      {banner && running && (
        <div key={`banner-${banner.id}`} className="ck-anim pointer-events-none absolute inset-x-0 top-[24%] flex animate-[ck-banner_2.4s_ease_forwards] flex-col items-center px-4 text-center opacity-0">
          <p className="g-title text-4xl sm:text-6xl">{banner.title}</p>
          {banner.sub && <p className="g-display mt-3 border-y border-[#c9a24a]/60 px-4 py-1 text-xs tracking-[0.25em] text-[#f8e7c0] uppercase [text-shadow:0_2px_8px_#000]">{banner.sub}</p>}
        </div>
      )}

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
            Resume
          </BigButton>
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
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
        </Modal>
      )}
      {editing && (phase === "menu" || phase === "paused") && <ControlsEditor store={phase === "menu" ? menuHud : hud} onClose={() => setEditing(false)} />}

      {phase === "choosing" && options && !help && <PowerChoice options={options} store={hud} onPick={pick} game={gameRef} />}

      {phase === "over" && summary && !help && (
        <ResultModal
          summary={summary}
          world={saved.world}
          bank={saved.bank}
          nextWorld={WORLDS[WORLDS.findIndex((w) => w.id === saved.world) + 1] ?? null}
          nextOwned={(id) => isOwned(saved, "world", findItem(WORLDS, id))}
          onPlay={start}
          onStages={openMap}
          onShop={openShop}
        />
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Screens -----------------------------------------------------------------------------------------

function MenuScreen({
  stars,
  world,
  hero,
  bank,
  later,
  onPlay,
  onShop,
  onHelp,
  onControls,
  touch,
}: {
  stars: number[];
  world: string;
  hero: string;
  bank: number;
  later: number;
  onPlay: () => void;
  onShop: () => void;
  onHelp: () => void;
  onControls: () => void;
  touch: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col bg-[linear-gradient(to_bottom,rgb(7_5_11/0.8),transparent_35%,transparent_58%,rgb(7_5_11/0.88))]">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="px-4 pt-1 text-center sm:pt-3">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-sm text-[#efe6da] [text-shadow:0_2px_8px_#000] sm:text-base">Five worlds. Fifty stages. A crypt full of bones.</p>
      </div>

      <div className="flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8">
        <p className="g-display text-center text-xs text-[#f8e7c0] [text-shadow:0_1px_4px_#000]">
          {world} · {hero}
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <BigButton onClick={onPlay} icon={<Swords className="size-6" />} autoFocus>
            <span data-ck-play>Play</span>
          </BigButton>
          <button type="button" onClick={onShop} className="g-soft g-display inline-flex items-center px-3 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <span className="g-unskew gap-1.5 text-sm">
              <ShoppingBag className="size-4" /> Shop
              <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                <CoinIcon className="size-3" /> {formatNumber(bank)}
              </span>
            </span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
            <Star className="size-3.5 fill-amber-300 text-amber-300" /> {stars.reduce((a, b) => a + b, 0)}/{ROOMS_PER_WORLD * 3}
          </span>
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
            <Crown className="size-3.5 text-[var(--accent)]" /> Stage {nextStage(stars) + 1}/{ROOMS_PER_WORLD}
          </span>
          <button type="button" onClick={onHelp} className="g-soft g-display inline-flex items-center px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <span className="g-unskew gap-1.5">
              <CircleHelp className="size-3.5" /> How to play
            </span>
          </button>
        </div>
        {later < 1 && <p className="g-muted text-center text-[11px] font-semibold">Summoning warriors and mages in the background… {Math.round(later * 100)}%</p>}
        <p className="text-center text-xs font-semibold text-[#efe6da]/80 [text-shadow:0_1px_4px_#000]">
          {touch ? "Left stick to move · buttons to fight" : "WASD move · J / click attack · K / right-click block · Space roll · E spin · Q potion"}
        </p>
      </div>
    </div>
  );
}

/** After a stage: the stars, the coins saved and where to go next. */
function ResultModal({
  summary,
  world,
  bank,
  nextWorld,
  nextOwned,
  onPlay,
  onStages,
  onShop,
}: {
  summary: RunSummary & { newBest: boolean; saved: number };
  world: string;
  bank: number;
  nextWorld: { id: string; name: string } | null;
  nextOwned: (id: string) => boolean;
  onPlay: (stage: number) => void;
  onStages: () => void;
  onShop: (tab?: ShopKind, selected?: string) => void;
}) {
  const king = summary.stage === ROOMS_PER_WORLD - 1;
  const w = findItem(WORLDS, world);
  return (
    <Modal title={summary.won ? (king ? "World cleared!" : "Stage cleared") : "You fell"} wide>
      <div className="text-center">
        <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">
          {w.name} · Stage {summary.stage + 1}
        </p>
        {summary.won ? (
          <div className="mt-2 flex justify-center">
            <Stars n={summary.stars} className="size-10 sm:size-12" />
          </div>
        ) : (
          <p className="g-display mt-1 text-4xl">Try again</p>
        )}
        {summary.won && king && (
          <p className="g-display mx-auto mt-2 inline-flex items-center gap-1.5 border-y border-[#c9a24a]/70 px-3 py-1 text-xs tracking-[0.2em] text-[#f8e7c0] uppercase">
            <Crown className="size-3.5 text-amber-300" /> {w.boss} is dust
          </p>
        )}
        {summary.newBest && !king && (
          <p className="g-display mt-2 flex items-center justify-center gap-1.5 text-xs tracking-[0.2em] text-[#f8e7c0] uppercase">
            <Trophy className="size-3.5 text-amber-300" /> New best
          </p>
        )}
        <p className="g-display mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-sm text-amber-200 tabular-nums">
          <CoinIcon /> +{formatNumber(summary.saved)} coins saved · {formatNumber(bank)} total
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Kills" value={formatNumber(summary.kills)} />
        <Stat label="Time" value={formatTime(summary.time)} />
        <Stat label="Coins" value={formatNumber(summary.coins)} />
      </div>
      {summary.powers.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {summary.powers.map((p) => (
            <span key={p.name} className="g-tint g-display rounded-[var(--g-hud-radius)] px-2.5 py-1 text-xs">
              {p.name}
              {p.level > 1 ? ` ×${p.level}` : ""}
            </span>
          ))}
        </div>
      )}
      {summary.won && !king ? (
        <BigButton onClick={() => onPlay(summary.stage + 1)} icon={<Play className="size-5 fill-current" />} autoFocus>
          Next stage
        </BigButton>
      ) : summary.won && nextWorld && !nextOwned(nextWorld.id) ? (
        <BigButton onClick={() => onShop("world", nextWorld.id)} icon={<ShoppingBag className="size-5" />} autoFocus>
          Unlock {nextWorld.name}
        </BigButton>
      ) : (
        <BigButton onClick={() => onPlay(summary.stage)} icon={<RotateCcw className="size-5" />} autoFocus>
          {summary.won ? "Play again" : "Retry"}
        </BigButton>
      )}
      <div className="grid grid-cols-3 gap-2">
        <SoftButton onClick={() => onPlay(summary.stage)} icon={<RotateCcw className="size-4" />}>
          Retry
        </SoftButton>
        <SoftButton onClick={onStages} icon={<Star className="size-4" />}>
          Stages
        </SoftButton>
        <SoftButton onClick={() => onShop()} icon={<ShoppingBag className="size-4" />}>
          Shop
        </SoftButton>
      </div>
    </Modal>
  );
}

function HudOverlay({ store, paused, onPause, touch }: { store: Store<Hud>; paused: boolean; onPause: () => void; touch: boolean }) {
  const hud = useStore(store);
  // Phones held sideways: the corner buttons go in a row, leaving the right side to the touch controls.
  const land = usePhoneLandscape();
  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  return (
    <>
      {/* `data-avoid`: touch controls keep clear of these (touch.tsx). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <div data-avoid className="min-w-0 space-y-2">
          <div className="g-hud w-44 p-2 sm:w-64">
            <div className="g-display flex items-center justify-between px-0.5 text-[11px] tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3.5 fill-[var(--accent)] text-[var(--accent)]" /> Health
              </span>
              <span>
                {hud.hp} / {hud.maxHp}
              </span>
            </div>
            <Bar pct={hpPct} className="mt-1 h-3" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="g-hud g-display inline-flex items-center gap-1.5 px-2.5 py-1 text-xs tabular-nums">
              <FlaskConical className="size-3.5 text-[var(--accent)]" />
              {hud.potions}/{hud.maxPotions}
              {!touch && <span className="g-kbd px-1 text-[9px]">Q</span>}
            </span>
            <span className="g-hud g-display inline-flex items-center gap-1.5 px-2.5 py-1 text-xs tabular-nums">
              <span aria-hidden className="inline-block size-3 rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 ring-1 ring-amber-700" />
              {hud.coins}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-2 pt-0.5">
          <div data-avoid className="g-hud px-4 py-1.5 text-center">
            <p className="g-display text-[9px] tracking-[0.25em] text-[var(--accent)] uppercase">Stage</p>
            <p className="g-display text-lg leading-none tabular-nums">
              {hud.room}
              <span className="text-sm opacity-55">/{hud.rooms}</span>
            </p>
          </div>
          {hud.doorOpen ? (
            <p className="g-btn px-3 py-1 text-[11px]">
              <span className="g-unskew">The door is open · go north</span>
            </p>
          ) : hud.enemies > 0 && !hud.boss ? (
            <p className="g-hud g-display inline-flex items-center gap-1 px-2.5 py-1 text-[11px]">
              <Skull className="size-3.5" /> {hud.enemies} left
            </p>
          ) : null}
        </div>

        <div data-avoid className={`pointer-events-auto flex items-end gap-2 ${land ? "flex-row-reverse" : "flex-col"}`}>
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"} small={land}>
            {paused ? <Play className={`${land ? "size-[18px]" : "size-5"} fill-current`} /> : <Pause className={`${land ? "size-[18px]" : "size-5"} fill-current`} />}
          </IconButton>
          <SystemButtons vertical={!land} small={land} />
        </div>
      </div>

      {hud.boss && (
        <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${touch ? "top-[max(env(safe-area-inset-top),12px)] mt-[118px] pr-16 pl-3" : "bottom-[max(env(safe-area-inset-bottom),20px)]"}`}>
          <div className={`g-hud w-full px-3 pt-1.5 pb-2.5 ${touch ? "max-w-sm" : "max-w-xl"}`}>
            <p className="g-title mb-1.5 text-center text-sm">
              {hud.boss.name}
              {hud.boss.enraged && <span className="g-title-accent"> · Enraged</span>}
            </p>
            <Bar pct={Math.max(0, (hud.boss.hp / hud.boss.max) * 100)} className="h-3.5" boss />
          </div>
        </div>
      )}

      {!touch && (
        <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),16px)] left-4 flex items-end gap-3 sm:left-6">
          <Ability label="Spin" keyHint="E" value={hud.charge} ready={hud.charge >= 1} icon={<Tornado className="size-7" />} big />
          <Ability label="Roll" keyHint="Space" value={hud.roll} ready={hud.roll >= 1} icon={<Wind className="size-5" />} />
        </div>
      )}
    </>
  );
}

/** A crimson gauge in a gold-trimmed stone slot. */
function Bar({ pct, className = "", boss = false }: { pct: number; className?: string; boss?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[var(--g-hud-radius)] bg-black/70 ${className}`} style={{ border: "var(--g-hud-border)" }}>
      <div
        className={`h-full shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-[width] duration-200 ${boss ? "bg-[linear-gradient(180deg,#ef4444,#7f1d1d)]" : "bg-[linear-gradient(180deg,#f43f5e,#9f1239)]"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A carved stone tile that fills with crimson as the ability charges, and glows gold when ready. */
function Ability({ label, keyHint, value, ready, icon, big = false }: { label: string; keyHint: string; value: number; ready: boolean; icon: ReactNode; big?: boolean }) {
  const size = big ? 64 : 50;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`g-hud relative grid place-items-center overflow-hidden ${ready ? "shadow-[0_0_0_1px_#c9a24a,0_0_22px_rgb(201_162_74/0.55)]" : "opacity-80"}`} style={{ width: size, height: size }}>
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgb(244_63_94/0.7),rgb(127_29_29/0.8))] transition-[height] duration-150" style={{ height: `${Math.min(1, value) * 100}%` }} />
        <span className={`relative ${ready ? "text-[#f8e7c0]" : "opacity-60"}`}>{icon}</span>
      </div>
      <span className="g-display flex items-center gap-1 text-[10px] text-[#efe6da]/80 [text-shadow:0_1px_3px_#000]">
        {label} <Kbd>{keyHint}</Kbd>
      </span>
    </div>
  );
}

function LowHealth({ store }: { store: Store<Hud> }) {
  const hud = useStore(store);
  if (hud.hp <= 0 || hud.hp / hud.maxHp > 0.3) return null;
  return <div className="ck-anim pointer-events-none absolute inset-0 animate-[ck-pulse_1.1s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(153_27_27/0.5)_100%)]" />;
}

function ControlsHint() {
  return (
    <div className="ck-anim pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),24px)] flex animate-[ck-hint_7s_ease_forwards] justify-center px-4 opacity-0">
      <p className="g-hud g-display px-4 py-2 text-center text-sm">
        WASD move · <Kbd>J</Kbd> / click attack · <Kbd>K</Kbd> block · <Kbd>Space</Kbd> roll · <Kbd>E</Kbd> spin · <Kbd>Q</Kbd> potion
      </p>
    </div>
  );
}

function PowerChoice({ options, store, onPick, game }: { options: Offer[]; store: Store<Hud>; onPick: (id: string) => void; game: { current: CryptKnightGame | null } }) {
  const hud = useStore(store);
  const canBuy = hud.coins >= hud.potionPrice && hud.potions < hud.maxPotions;
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/60 backdrop-blur-[3px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="Choose a power" className="w-full max-w-3xl">
          <p className="g-display text-center text-xs tracking-[0.3em] text-[var(--accent)] uppercase [text-shadow:0_1px_4px_#000]">Room {hud.room} cleared</p>
          <h2 className="g-title mt-2 text-center text-3xl sm:text-5xl">Choose a power</h2>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {options.map(({ power: p, level }, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id)}
                style={{ animationDelay: `${i * 70}ms` }}
                className="g-panel ck-anim group flex animate-[ck-card_0.35s_ease_both] items-center gap-3 p-4 text-left transition hover:-translate-y-1 hover:brightness-125 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-col sm:items-start sm:p-5"
              >
                <span
                  className="grid size-12 shrink-0 place-items-center text-[#f8e7c0]"
                  style={{ background: "var(--g-btn)", border: "var(--g-btn-border)", borderRadius: "var(--g-btn-radius)", boxShadow: "var(--g-btn-shadow)" }}
                >
                  {ICONS[p.icon]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="g-panel-title text-lg">{p.name}</span>
                    <Kbd>{i + 1}</Kbd>
                  </span>
                  <span className="g-muted mt-1 block text-[15px] leading-snug">{p.desc}</span>
                  <span className="mt-2 flex items-center gap-1" aria-label={`Level ${level} of ${p.max}`}>
                    {Array.from({ length: p.max }, (_, n) => (
                      <span key={n} className={`h-1.5 w-4 ${n < level ? "bg-[var(--accent)]" : n === level ? "bg-[#c9a24a]" : "g-tint"}`} />
                    ))}
                    {level > 0 && <span className="g-muted g-display ml-1 text-[10px] uppercase">Level {level + 1}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mx-auto mt-5 flex max-w-md flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <button type="button" disabled={!canBuy} onClick={() => game.current?.buyPotion()} className="g-soft g-display px-4 py-2 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-45">
              <span className="g-unskew gap-2">
                <FlaskConical className="size-4 text-[var(--accent)]" /> Buy potion · {hud.potionPrice} coins <Kbd>B</Kbd>
              </span>
            </button>
            <span className="g-display text-xs text-[#efe6da]/75 tabular-nums [text-shadow:0_1px_3px_#000]">
              Health {hud.hp}/{hud.maxHp} · Potions {hud.potions}/{hud.maxPotions} · Coins {hud.coins}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
