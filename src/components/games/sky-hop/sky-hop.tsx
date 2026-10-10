"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDownToLine, ChevronLeft, ChevronRight, CircleHelp, Clock, Flag, Gamepad2, Heart, KeyRound, Map as MapIcon, Pause, Play, RotateCcw, ShoppingBag, Star, Trophy } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { inPlayables, playablesFirstFrame, playablesLifecycle, playablesLoad, playablesReady, playablesSave, playablesScore } from "../shared/playables";
import { SKY_HOP } from "../shared/songs";
import { box, ControlLayer, ControlsButton, ControlsEditor, createControls, type Placed } from "../shared/touch-layout";
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
import { findItem, HEROES, LEGACY_STAGE, perksOf, stageReward, STAGES_PER_WORLD, WORLDS, type ShopItem, type ShopKind } from "./content";
import { SkyHopGame, START_LIVES, type Hud, type LevelResult, type Loadout, type Phase, type StageRef, type ToastKind } from "./engine";
import { GAME } from "./manifest";
import { CoinIcon, isOwned, ownedKey, Shop } from "./shop";
import { nextStage, StageMap, type StageInfo } from "./stages";

interface LevelRecord {
  /** Bit mask of the stars found. */
  stars: number;
  coins: number;
  /** Best time in seconds (0 = not finished yet). */
  time: number;
}

/**
 * `stages`: per "world:stage", the best run. `levels` / `unlocked` / `character` are from the old
 * five-level game (read once by migrate()). `bank`, `owned`, `hero`, `skin`, `world`: the shop.
 */
const DEFAULTS = {
  character: 0,
  unlocked: 1,
  levels: {} as Record<string, LevelRecord>,
  stages: {} as Record<string, LevelRecord>,
  bank: 0,
  owned: [] as string[],
  hero: "",
  skin: "classic",
  world: WORLDS[0].id,
  migrated: false,
};

type Save = typeof DEFAULTS;

// In YouTube Playables progress goes to YouTube's cloud save instead of this browser.
const records = createRecords("sky-hop:v1", DEFAULTS, { cloud: inPlayables() ? playablesSave : undefined });

/** Brings an old save (five levels, five free characters) into worlds and stages. */
function migrate() {
  const save = records.get();
  if (save.migrated) return;
  const stages = { ...save.stages };
  LEGACY_STAGE.forEach(([world, stage], old) => {
    const rec = save.levels[String(old)];
    if (rec && !stages[`${world}:${stage}`]) stages[`${world}:${stage}`] = rec;
  });
  // Players who had reached the snowy levels keep Frosty Peaks.
  const owned = save.unlocked >= 4 && !save.owned.includes(ownedKey("world", "frost")) ? [...save.owned, ownedKey("world", "frost")] : save.owned;
  records.set({ stages, owned, hero: save.hero || HEROES[save.character]?.id || HEROES[0].id, migrated: true });
}

const loadoutOf = (save: Save): Loadout => ({ hero: findItem(HEROES, save.hero).id, skin: save.skin, world: save.world });

const countStars = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
const recordOf = (save: Save, world: string, stage: number) => save.stages[`${world}:${stage}`];
const stagesOf = (save: Save, world: string): StageInfo[] =>
  Array.from({ length: STAGES_PER_WORLD }, (_, i) => {
    const r = recordOf(save, world, i);
    return { stars: r ? countStars(r.stars) : 0, done: !!r?.time };
  });
const totalStars = (save: Save) => Object.values(save.stages).reduce((n, r) => n + countStars(r.stars), 0);
const starsFound = (ref: StageRef) => {
  const mask = recordOf(records.get(), ref.world, ref.stage)?.stars ?? 0;
  return [0, 1, 2].map((i) => (mask & (1 << i)) !== 0);
};

/** Why a world can't be bought yet: every stage of the world before it must be finished first. */
const worldGate = (save: Save, id: string) => {
  const i = WORLDS.findIndex((w) => w.id === id);
  return i <= 0 || stagesOf(save, WORLDS[i - 1].id).every((s) => s.done) ? null : `Finish every stage of ${WORLDS[i - 1].name} first`;
};

const EMPTY_HUD: Hud = { level: 0, coins: 0, maxHp: 3, levelCoins: 0, lives: START_LIVES, hp: 3, stars: [false, false, false], key: false, chest: false, time: 0 };

const GAME_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyQ", "KeyE", "KeyR"]);

const formatTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

type Result = LevelResult & { best: number; newBest: boolean; record: LevelRecord; saved: number };

export function SkyHop({ sizes }: { sizes: Record<string, number> }) {
  // A page re-render passes a new object: keep the first one so the game isn't rebuilt.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SkyHopGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [toasts] = useState(() => createStore<Toast | null>(null));
  const [phase, setPhase] = useState<Phase>("loading");
  const [map, setMap] = useState(false);
  const [shop, setShop] = useState<{ tab: ShopKind; selected: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [over, setOver] = useState<{ ref: StageRef; saved: number } | null>(null);
  const [current, setCurrent] = useState<StageRef>({ world: WORLDS[0].id, stage: 0 });
  const [help, setHelp] = useState(false);
  // Only read after loading (nothing touch-specific renders before), so SSR markup still matches.
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [editing, setEditing] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const saved = useRecords(records);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const youtube = inPlayables();
    let toastId = 0;
    const game = new SkyHopGame(
      canvas,
      {
        progress: setProgress,
        phase: setPhase,
        hud: hud.set,
        error: setError,
        busy: setBusy,
        toast: (text, kind) => toasts.set({ id: ++toastId, text, kind }),
        fade: (alpha) => {
          if (fadeRef.current) fadeRef.current.style.opacity = String(alpha);
        },
        complete: (run) => {
          const before = records.get();
          const key = `${run.world}:${run.stage}`;
          const prev = before.stages[key] ?? { stars: 0, coins: 0, time: 0 };
          const mask = run.stars.reduce((m, s, i) => (s ? m | (1 << i) : m), 0);
          const newBest = !prev.time || run.time < prev.time;
          const record: LevelRecord = { stars: prev.stars | mask, coins: Math.max(prev.coins, run.coins), time: newBest ? run.time : prev.time };
          const world = findItem(WORLDS, run.world);
          const reward = stageReward(run.coins, countStars(mask), run.stage === STAGES_PER_WORLD - 1, world, findItem(HEROES, before.hero));
          records.set({ stages: { ...before.stages, [key]: record }, bank: before.bank + reward });
          const stars = totalStars(records.get());
          if (stars > totalStars(before)) playablesScore(stars);
          setResult({ ...run, best: record.time, newBest: newBest && !!prev.time, record, saved: reward });
        },
        over: (ref, coins) => {
          const before = records.get();
          const reward = stageReward(coins, 0, false, findItem(WORLDS, ref.world), findItem(HEROES, before.hero));
          records.set({ bank: before.bank + reward });
          setOver({ ref, saved: reward });
        },
      },
      { visibility: !youtube },
    );
    gameRef.current = game;
    // Dev server only: scripts/record-sky-trailer.mjs drives the game (and renders its music) through this.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __skyHop: { game, records, audio, music, song: SKY_HOP, ui: { map: setMap } } });
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
      migrate();
      if (gameRef.current === game) void game.load(modelSizes, loadoutOf(records.get()));
    })();
    return () => {
      stopLifecycle();
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, toasts, modelSizes]);

  useEffect(() => {
    if (phase === "menu") playablesReady();
  }, [phase]);

  const startStage = (ref: StageRef, fresh: boolean) => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setOver(null);
    setHelp(false);
    setMap(false);
    setEditing(false);
    if (shop) closeShop();
    setCurrent(ref);
    setRunKey((k) => k + 1);
    toasts.set(null);
    game.startStage(ref, fresh, starsFound(ref));
  };

  /** Back to the menu with the stage map open (from a result, game over or the pause menu). */
  const toStages = () => {
    setResult(null);
    setOver(null);
    gameRef.current?.toMenu();
    setMap(true);
  };

  const toTitle = () => {
    setResult(null);
    setOver(null);
    setMap(false);
    gameRef.current?.toMenu();
  };

  /** World tab on the stage map: owned worlds are shown, locked ones open in the shop. */
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

  // --- Shop: picking an item previews it on the hero; closing puts back what's equipped. ---
  const shown = useRef<Loadout | null>(null);
  const shift = useRef({ x: 0, y: 0 });

  const preview = (kind: ShopKind, id: string) => {
    const game = gameRef.current;
    const now = (shown.current ??= loadoutOf(records.get()));
    if (!game || now[kind] === id) return;
    now[kind] = id;
    if (kind === "hero") void game.setHero(id);
    else if (kind === "skin") game.setSkin(id);
    else game.setWorld(id);
  };

  const openShop = (tab: ShopKind = "hero", selected?: string) => {
    if (phase === "over" || phase === "complete") toTitle();
    else if (phase !== "menu") return;
    const save = records.get();
    shown.current = loadoutOf(save);
    setMap(false);
    setShop({ tab, selected: selected ?? loadoutOf(save)[tab] });
    if (selected) preview(tab, selected);
    gameRef.current?.setShowcase(true, shift.current);
  };

  function closeShop() {
    const save = loadoutOf(records.get());
    setShop(null);
    (["hero", "skin", "world"] as const).forEach((kind) => preview(kind, save[kind]));
    gameRef.current?.setShowcase(false);
  }

  const pickTab = (tab: ShopKind) => {
    if (!shop) return;
    // Leaving a tab puts its equipped item back on.
    preview(shop.tab, loadoutOf(records.get())[shop.tab]);
    setShop({ tab, selected: loadoutOf(records.get())[tab] });
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

  /** Title screen arrows: the heroes you own, one after another. */
  const cycleHero = (dir: number) => {
    const save = records.get();
    const mine = HEROES.filter((h) => isOwned(save, "hero", h));
    const i = mine.findIndex((h) => h.id === loadoutOf(save).hero);
    const next = mine[(i + dir + mine.length) % mine.length];
    records.set({ hero: next.id });
    void gameRef.current?.setHero(next.id);
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
    if (shop || map) return;
    if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  const worldStages = stagesOf(saved, saved.world);
  const resultWorld = result ? findItem(WORLDS, result.world) : null;
  const nextRef: StageRef | null = result && result.stage + 1 < STAGES_PER_WORLD ? { world: result.world, stage: result.stage + 1 } : null;
  const nextWorld = resultWorld && !nextRef ? (WORLDS[WORLDS.indexOf(resultWorld) + 1] ?? null) : null;

  /** The map's Play: the next stage of the shown world. */
  const playMap = (stage = nextStage(worldStages)) => startStage({ world: saved.world, stage }, true);

  // Keyboard: game controls while playing, Enter / arrows / S on the menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey) return;
      if (help || editing || shop || map) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (phase === "playing") {
        if (GAME_KEYS.has(e.code)) {
          e.preventDefault();
          game.setKey(e.code, true);
        }
        return;
      }
      if (e.repeat) return;
      const confirm = e.key === "Enter" || (e.key === " " && !onButton);
      if (phase === "paused" && confirm && !onButton) {
        e.preventDefault();
        game.resume();
      } else if (phase === "menu") {
        if (confirm && !onButton) {
          e.preventDefault();
          setMap(true);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          cycleHero(e.key === "ArrowLeft" ? -1 : 1);
        } else if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          openShop();
        }
      } else if (phase === "complete" && result && confirm && !onButton) {
        e.preventDefault();
        if (nextRef) startStage(nextRef, false);
        else toStages();
      } else if (phase === "over" && over && confirm && !onButton) {
        e.preventDefault();
        startStage(over.ref, true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => gameRef.current?.setKey(e.code, false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // Leaving the tab or window pauses the game (YouTube pauses through its own SDK instead).
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

  const inLevel = phase === "playing" || phase === "paused" || phase === "dying" || phase === "complete";
  const hero = findItem(HEROES, saved.hero);
  const world = findItem(WORLDS, saved.world);

  return (
    <GameRoot game={GAME} className="bg-[#9fd3f7]">
      <style>{KEYFRAMES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Sky Hop game" />
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-[#1c1917]" style={{ opacity: 0 }} />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !editing && !shop && !map && (
        <TitleScreen
          hero={hero.name}
          heroTint={hero.tint}
          perk={hero.perk}
          world={world.name}
          stars={totalStars(saved)}
          bank={saved.bank}
          stage={nextStage(worldStages)}
          busy={busy}
          onHero={cycleHero}
          onPlay={() => setMap(true)}
          onShop={() => openShop()}
          onHelp={() => setHelp(true)}
          onControls={() => setEditing(true)}
          touch={touch}
        />
      )}
      {phase === "menu" && shop && (
        <Shop
          save={{ ...saved, hero: loadoutOf(saved).hero }}
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
        <StageMap world={saved.world} stages={worldStages} owned={(id) => isOwned(saved, "world", findItem(WORLDS, id))} onWorld={pickWorld} onPlay={playMap} onClose={() => setMap(false)} />
      )}
      {/* Controls editor from the title screen: the HUD shows behind it so controls keep clear of it. */}
      {phase === "menu" && editing && <HudOverlay store={hud} tint={hero.tint} found={0} paused={false} onPause={() => {}} />}

      {phase === "playing" && <Controls key={runKey} game={gameRef} touch={touch} onTouch={() => setTouch(true)} />}

      {inLevel && <HudOverlay store={hud} tint={hero.tint} found={recordOf(saved, current.world, current.stage)?.stars ?? 0} paused={phase === "paused"} onPause={pauseOrResume} />}
      {inLevel && <ToastLayer store={toasts} />}
      {phase === "playing" && <LevelBanner key={`banner-${runKey}`} stage={current} />}
      {phase === "playing" && current.world === WORLDS[0].id && current.stage === 0 && <ControlsHint key={`hint-${runKey}`} touch={touch} />}

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => gameRef.current?.toCheckpoint()} icon={<Flag className="size-4" />}>
              Checkpoint
            </SoftButton>
            <SoftButton onClick={() => startStage(current, false)} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              How to play
            </SoftButton>
            <SoftButton onClick={toStages} icon={<MapIcon className="size-4" />}>
              Stages
            </SoftButton>
          </div>
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
        </Modal>
      )}
      {(phase === "paused" || phase === "menu") && editing && <ControlsEditor controls={touchControls} face={(id, p) => <HopFace id={id} at={p} />} onClose={() => setEditing(false)} />}

      {phase === "complete" && result && resultWorld && !help && (
        <Modal title={nextRef ? "Stage clear!" : "World clear!"} wide>
          <p className="g-display -mt-2 text-center text-sm text-[var(--accent)] [text-shadow:1px_1px_0_#1c1917]">
            {resultWorld.name} · {result.stage + 1}. {resultWorld.stages[result.stage]}
          </p>
          <div className="flex justify-center gap-3">
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ animationDelay: `${0.2 + i * 0.18}s` }} className="animate-[skyhop-pop_0.5s_ease_both]">
                <Star
                  className={`size-11 stroke-[2.5] sm:size-12 ${result.stars[i] ? "fill-[var(--accent)] text-[#1c1917]" : result.record.stars & (1 << i) ? "fill-[#fde68a] text-[#1c1917] opacity-60" : "fill-transparent text-[#1c1917] opacity-30"}`}
                />
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Time" value={formatTime(result.time)} />
            <Stat label="Coins" value={`${result.coins}/${result.totalCoins}`} />
            <Stat label="Best" value={formatTime(result.best)} />
          </div>
          <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full border-[3px] border-[#1c1917] bg-white px-3 py-1 text-xs font-black tabular-nums">
            <CoinIcon /> +{formatNumber(result.saved)} saved · {formatNumber(saved.bank)} in the bank
          </p>
          {result.newBest && (
            <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full border-2 border-[#1c1917] bg-[var(--accent)] px-3 py-1 text-xs font-black tracking-wider text-[#1c1917] uppercase">
              <Trophy className="size-3.5" /> New best time
            </p>
          )}
          {nextRef ? (
            <BigButton onClick={() => startStage(nextRef, false)} icon={<Play className="size-6 fill-current" />} autoFocus>
              Next stage
            </BigButton>
          ) : nextWorld && !isOwned(saved, "world", nextWorld) ? (
            <BigButton onClick={() => openShop("world", nextWorld.id)} icon={<ShoppingBag className="size-6" />} autoFocus>
              Unlock {nextWorld.name}
            </BigButton>
          ) : (
            <BigButton onClick={toStages} icon={<Trophy className="size-6" />} autoFocus>
              {nextWorld ? `On to ${nextWorld.name}` : "All stages"}
            </BigButton>
          )}
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={() => startStage({ world: result.world, stage: result.stage }, false)} icon={<RotateCcw className="size-4" />}>
              Again
            </SoftButton>
            <SoftButton onClick={toStages} icon={<MapIcon className="size-4" />}>
              Stages
            </SoftButton>
            <SoftButton onClick={() => openShop()} icon={<ShoppingBag className="size-4" />}>
              Shop
            </SoftButton>
          </div>
        </Modal>
      )}

      {phase === "over" && over && !help && (
        <Modal title="Game over">
          <p className="text-center text-sm">
            Out of lives on <span className="font-bold">{findItem(WORLDS, over.ref.world).stages[over.ref.stage]}</span>. Try again with {START_LIVES + perksOf(hero).lives} fresh lives!
          </p>
          {over.saved > 0 && (
            <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full border-[3px] border-[#1c1917] bg-white px-3 py-1 text-xs font-black tabular-nums">
              <CoinIcon /> +{formatNumber(over.saved)} coins saved
            </p>
          )}
          <BigButton onClick={() => startStage(over.ref, true)} icon={<RotateCcw className="size-5" />} autoFocus>
            Try again
          </BigButton>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={toStages} icon={<MapIcon className="size-4" />}>
              Stages
            </SoftButton>
            <SoftButton onClick={() => openShop()} icon={<ShoppingBag className="size-4" />}>
              Shop
            </SoftButton>
          </div>
        </Modal>
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

const KEYFRAMES = `
@keyframes skyhop-pop { 0% { opacity: 0; transform: scale(0.3) rotate(-20deg); } 60% { opacity: 1; transform: scale(1.2) rotate(6deg); } 100% { opacity: 1; transform: none; } }
@keyframes skyhop-toast { 0% { opacity: 0; transform: translateY(-12px) scale(0.8); } 12% { opacity: 1; transform: translateY(0) scale(1.06); } 18% { transform: scale(1); } 80% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes skyhop-banner { 0% { opacity: 0; transform: translateY(16px) scale(0.9); } 12%, 75% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-10px); } }
@keyframes skyhop-hint { 0% { opacity: 0; } 8%, 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes skyhop-bob { 0%, 100% { transform: translateY(-2px); } 50% { transform: translateY(-5px); } }
@media (prefers-reduced-motion: reduce) { [class*="skyhop-bob"] { animation: none !important; } }
`;

// --- Screens -------------------------------------------------------------------------------------

function TitleScreen({
  hero,
  heroTint,
  perk,
  world,
  stars,
  bank,
  stage,
  busy,
  onHero,
  onPlay,
  onShop,
  onHelp,
  onControls,
  touch,
}: {
  hero: string;
  heroTint: string;
  perk: string;
  world: string;
  stars: number;
  bank: number;
  stage: number;
  busy: number | null;
  onHero: (dir: number) => void;
  onPlay: () => void;
  onShop: () => void;
  onHelp: () => void;
  onControls: () => void;
  touch: boolean;
}) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5 [@media(max-height:480px)]:py-2">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="flex flex-1 flex-col justify-between px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:justify-center sm:px-10 sm:pb-10 lg:px-16 [@media(max-height:480px)]:pb-3">
        <div className="text-center sm:max-w-md sm:text-left [@media(max-height:480px)]:origin-top-left [@media(max-height:480px)]:scale-75">
          <GameTitle game={GAME} />
          <p className="g-display mt-3 text-sm text-white [text-shadow:2px_2px_0_#1c1917] sm:text-lg [@media(max-height:480px)]:hidden">6 worlds · 60 stages · 15 heroes</p>
        </div>

        <div className="mt-6 w-full max-w-sm space-y-3 self-center sm:self-start [@media(max-height:480px)]:-mt-4 [@media(max-height:480px)]:space-y-2">
          <div className="g-panel flex items-center justify-between p-1.5">
            <IconButton onClick={() => onHero(-1)} label="Previous hero" plain>
              <ChevronLeft className="size-6" />
            </IconButton>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="size-5 shrink-0 rounded-full border-[3px] border-[#1c1917]" style={{ background: heroTint }} />
              <div className="min-w-0 text-center">
                <p className="g-muted truncate text-[10px] font-bold tracking-[0.12em] uppercase">{busy !== null ? `Hopping in… ${Math.round(busy * 100)}%` : perk}</p>
                <p className="g-display truncate text-xl leading-none">{hero}</p>
              </div>
            </div>
            <IconButton onClick={() => onHero(1)} label="Next hero" plain>
              <ChevronRight className="size-6" />
            </IconButton>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
              <span data-sh-play>Play</span>
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

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold sm:justify-start">
            <span className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5">
              <Star className="size-3.5 fill-[var(--accent)] stroke-[#1c1917] stroke-[2.5]" /> {stars}/{WORLDS.length * STAGES_PER_WORLD * 3}
            </span>
            <span className="g-hud inline-flex max-w-[60vw] items-center gap-1.5 truncate px-3 py-1.5">
              <MapIcon className="size-3.5 shrink-0" /> <span className="truncate">{world}</span> · {stage + 1}/{STAGES_PER_WORLD}
            </span>
            <button
              type="button"
              onClick={onHelp}
              className="g-hud inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              <CircleHelp className="size-3.5" /> How to play
            </button>
          </div>
          {!touch && (
            <p className="hidden text-center text-xs font-bold text-white [text-shadow:1px_1px_0_#1c1917,0_0_6px_rgb(0_0_0/0.4)] sm:block sm:text-left [@media(max-height:480px)]:!hidden">
              WASD move · Space jump · Shift ground pound · Q/E look · S shop
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function HudOverlay({ store, tint, found, paused, onPause }: { store: Store<Hud>; tint: string; found: number; paused: boolean; onPause: () => void }) {
  const hud = useStore(store);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
      {/* `data-avoid`: touch controls keep clear of these (shared/touch-layout.tsx). */}
      <div data-avoid className="flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="g-hud inline-flex items-center gap-1 px-2 py-1.5" aria-label={`${hud.hp} of ${hud.maxHp} hearts`}>
            {Array.from({ length: hud.maxHp }, (_, i) => (
              <Heart key={i} className={`size-5 stroke-[#1c1917] stroke-[2.5] sm:size-6 ${i < hud.hp ? "fill-[#f43f5e]" : "fill-transparent opacity-30"}`} />
            ))}
          </div>
          <div className="g-hud inline-flex items-center gap-1.5 py-1 pr-3 pl-1.5" aria-label={`${hud.lives} lives`}>
            <span className="size-6 rounded-full border-[3px] border-[#1c1917]" style={{ background: tint }} />
            <span className="g-display text-lg tabular-nums">×{hud.lives}</span>
          </div>
        </div>
        <div className="g-hud inline-flex items-center gap-2 py-1 pr-3 pl-1.5">
          <BigCoin />
          <span key={hud.coins} className="g-display text-xl tabular-nums sm:text-2xl">
            {hud.coins}
          </span>
        </div>
      </div>

      <div data-avoid className="flex items-start gap-2">
        <div className="flex flex-col items-end gap-2">
          <div className="g-hud inline-flex items-center gap-1 px-2 py-1.5" aria-label="Stars">
            {hud.stars.map((s, i) => (
              <Star
                key={i}
                className={`size-5 stroke-[#1c1917] stroke-[2.5] sm:size-6 ${s ? "fill-[var(--accent)]" : found & (1 << i) ? "fill-[#fde68a] opacity-45" : "fill-transparent opacity-30"}`}
              />
            ))}
            <KeyRound className={`ml-1 size-5 sm:size-6 ${hud.key ? "text-[#b45309]" : hud.chest ? "text-[#16a34a]" : "opacity-25"}`} aria-label={hud.key ? "Key" : "No key"} />
          </div>
          <div className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1 text-base tabular-nums">
            <Clock className="size-4" /> {formatTime(hud.time)}
          </div>
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

function ToastLayer({ store }: { store: Store<Toast | null> }) {
  const toast = useStore(store);
  if (!toast) return null;
  const icon =
    toast.kind === "star" ? (
      <Star className="size-6 fill-[var(--accent)] stroke-[#1c1917] stroke-[2.5]" />
    ) : toast.kind === "life" ? (
      <Heart className="size-6 fill-[#f43f5e] stroke-[#1c1917] stroke-[2.5]" />
    ) : toast.kind === "key" ? (
      <KeyRound className="size-6 text-[#b45309]" />
    ) : (
      <Flag className="size-6 fill-[#ef4444] stroke-[#1c1917]" />
    );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] flex justify-center px-4">
      <div key={toast.id} className="g-panel g-display flex animate-[skyhop-toast_2.4s_ease_forwards] items-center gap-2 px-5 py-2.5 text-lg sm:text-2xl">
        {icon}
        {toast.text}
      </div>
    </div>
  );
}

function LevelBanner({ stage }: { stage: StageRef }) {
  const world = findItem(WORLDS, stage.world);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[30%] flex animate-[skyhop-banner_2.6s_ease_forwards] flex-col items-center px-4 text-center">
      <p className="g-display text-lg text-white [text-shadow:2px_2px_0_#1c1917]">
        {world.name} · Stage {stage.stage + 1}
      </p>
      <h2 className="g-title text-5xl sm:text-7xl">{world.stages[stage.stage]}</h2>
    </div>
  );
}

function ControlsHint({ touch }: { touch: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex animate-[skyhop-hint_9s_ease_forwards] justify-center px-4 opacity-0 [animation-delay:2.4s] ${
        touch ? "top-[38%]" : "bottom-[max(env(safe-area-inset-bottom),20px)]"
      }`}
    >
      <p className="g-hud px-4 py-2 text-center text-sm font-bold">
        {touch ? "Left stick to run · Jump twice to double jump · drag the right side to look" : "WASD run · Space jump (twice = double jump) · Shift in the air = ground pound · Q/E look"}
      </p>
    </div>
  );
}

// --- Touch & mouse controls -----------------------------------------------------------------------

function Controls({ game, touch, onTouch }: { game: React.RefObject<SkyHopGame | null>; touch: boolean; onTouch: () => void }) {
  const stickBase = useRef<HTMLDivElement>(null);
  const stickKnob = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { kind: "stick" | "look"; x: number; y: number; ox: number; oy: number }>());
  // Half the stick base (size-22).
  const RADIUS = 44;

  const showStick = (x: number, y: number, kx: number, ky: number, visible: boolean) => {
    const base = stickBase.current;
    const knob = stickKnob.current;
    if (!base || !knob) return;
    base.style.opacity = visible ? "1" : "0";
    base.style.transform = `translate(${x - RADIUS}px, ${y - RADIUS}px)`;
    knob.style.transform = `translate(${kx}px, ${ky}px)`;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") onTouch();
    const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
    const kind = isTouch && e.clientX < window.innerWidth * 0.5 ? "stick" : "look";
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { kind, x: e.clientX, y: e.clientY, ox: e.clientX, oy: e.clientY });
    if (kind === "stick") showStick(e.clientX, e.clientY, 0, 0, true);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    const g = game.current;
    if (!p || !g) return;
    if (p.kind === "look") {
      g.orbit(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    let dx = e.clientX - p.ox;
    let dy = e.clientY - p.oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      // Drag the stick's centre along so it never feels stuck.
      p.ox += (dx / d) * (d - RADIUS);
      p.oy += (dy / d) * (d - RADIUS);
      dx = e.clientX - p.ox;
      dy = e.clientY - p.oy;
    }
    showStick(p.ox, p.oy, dx, dy, true);
    const nx = dx / RADIUS;
    const ny = dy / RADIUS;
    const len = Math.hypot(nx, ny);
    // Small dead zone, then full speed comes quickly.
    const k = len < 0.12 ? 0 : Math.min(1, (len - 0.12) / 0.7) / len;
    g.setStick(nx * k, -ny * k);
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (p?.kind === "stick") {
      game.current?.setStick(0, 0);
      showStick(p.ox, p.oy, 0, 0, false);
    }
  };

  useEffect(() => {
    const g = game.current;
    return () => g?.setStick(0, 0);
  }, [game]);

  return (
    <>
      <div className="absolute inset-0 touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <div
        ref={stickBase}
        className="pointer-events-none absolute top-0 left-0 grid size-22 place-items-center rounded-full border-4 border-[#1c1917]/70 bg-white/35 opacity-0 transition-opacity duration-150"
      >
        <div ref={stickKnob} className="size-9 rounded-full border-4 border-[#1c1917] bg-[var(--accent)] shadow-[0_4px_0_#1c1917]" />
      </div>
      {touch && (
        <>
          <p className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),18px)] left-5 text-xs font-bold text-white/90 [text-shadow:1px_1px_0_#1c1917]">
            Touch &amp; drag to run
          </p>
          <ControlLayer controls={touchControls}>
            {(placed) => (
              <>
                <TouchButton id="pound" at={placed.pound} onDown={() => game.current?.touchPound()} />
                <TouchButton id="jump" at={placed.jump} onDown={() => game.current?.touchJump(true)} onUp={() => game.current?.touchJump(false)} />
              </>
            )}
          </ControlLayer>
        </>
      )}
    </>
  );
}

/** Jump and ground pound, movable from Pause → Edit controls; the stick follows the thumb anywhere on the left half. */
const touchControls = createControls("sky-hop:controls:v1", {
  jump: { label: "Jump", w: 68, x: -50, y: -52, round: true },
  pound: { label: "Ground pound", w: 48, x: -120, y: -42, round: true },
});

type TouchId = keyof typeof touchControls.defs;

const HOP_BUTTON = "grid place-items-center rounded-full border-[3px] border-[#1c1917] bg-[var(--accent)] text-[#1c1917]";

function HopIcon({ id, size }: { id: TouchId; size: number }) {
  return id === "jump" ? (
    <span className="g-display" style={{ fontSize: Math.round(size * 0.21) }}>
      Jump
    </span>
  ) : (
    <ArrowDownToLine size={Math.round(size * 0.42)} />
  );
}

/** A button as the controls editor shows it. */
function HopFace({ id, at }: { id: TouchId; at: Placed }) {
  return (
    <span className={`${HOP_BUTTON} size-full shadow-[0_6px_0_#1c1917]`}>
      <HopIcon id={id} size={at.w} />
    </span>
  );
}

function TouchButton({ id, at, onDown, onUp }: { id: TouchId; at: Placed; onDown: () => void; onUp?: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      aria-label={touchControls.defs[id].label}
      style={box(at)}
      className={`${HOP_BUTTON} pointer-events-auto absolute touch-none transition-transform select-none ${pressed ? "translate-y-1 shadow-[0_2px_0_#1c1917]" : "shadow-[0_6px_0_#1c1917]"}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressed(true);
        onDown();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        setPressed(false);
        onUp?.();
      }}
      onPointerCancel={() => {
        setPressed(false);
        onUp?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <HopIcon id={id} size={at.w} />
    </button>
  );
}

function BigCoin() {
  return (
    <span aria-hidden className="inline-grid size-7 shrink-0 place-items-center rounded-full border-[3px] border-[#1c1917] bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500">
      <span className="h-3 w-1 rounded-full bg-amber-100/80" />
    </span>
  );
}

