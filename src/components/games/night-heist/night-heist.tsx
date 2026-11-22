"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, Gamepad2, Home, Play, RotateCcw } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { crazyAd, crazyGameplay, crazyHappy, crazyInit, crazyLoading, crazyWanted, inCrazyGames } from "../shared/crazygames";
import { inPlayables, playablesSave } from "../shared/playables";
import { BigButton, createRecords, createStore, GameRoot, HowToPlay, LoadingScreen, Modal, SoftButton, SystemButtons, useRecords, useShortcuts } from "../shared/ui";
import { LEVELS } from "./campaign";
import { districtIndex, findItem, GADGETS, isOwned, isUnlocked, modsOf, nextHeist, OUTFITS, ownedKey, payout, readSave, THIEVES, UPGRADES, type Save, type ShopKind } from "./content";
import { NightHeistGame, type Hud, type Phase } from "./engine";
import { GAME } from "./manifest";
import { Briefing, CaseFiles, HudOverlay, MenuScreen, ResultCard, Toasts, type Outcome, type Toast } from "./screens";
import { cardsFor, Shop } from "./shop";
import { ControlsEditor, TouchControls } from "./touch";
import { Tutorial } from "./tutorial";

/**
 * What is kept in this browser. It is read back through `readSave` every time, so whatever is stored —
 * a save from the first version, a half-written one, somebody's edits — comes out as a valid save.
 */
const records = createRecords<Record<string, unknown>>("night-heist:v1", {}, { cloud: inPlayables() ? playablesSave : undefined });
const currentSave = () => readSave(records.get());
const writeSave = (patch: Partial<Save>) => records.set({ ...readSave({ ...records.get(), ...patch }), cases: undefined });

const STYLES = `
@keyframes nh-hint { 0% { opacity: 0; transform: translateY(8px); } 8%, 82% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .nh-anim { animation-duration: 0.01s !important; } }
`;

export function NightHeist({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NightHeistGame | null>(null);
  const [hud] = useState(() => createStore<Hud | null>(null));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  /** The title screen or the case files (both over the 3D backdrop). */
  const [files, setFiles] = useState(false);
  // The heist opened last comes up first (nothing of it is in the first HTML, so the server need not know).
  const [selected, setSelected] = useState(() => Math.min(LEVELS.length - 1, currentSave().last));
  const [district, setDistrict] = useState(() => districtIndex(selected));
  const [shop, setShop] = useState<{ tab: ShopKind; selected: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [touch, setTouch] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const raw = useRecords(records);
  const save = useMemo(() => readSave(raw), [raw]);
  const [adBusy, setAdBusy] = useState(false);
  const uiRef = useRef<Record<string, (...args: never[]) => void> | null>(null);
  const toastId = useRef(0);
  const toastTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

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

  // CrazyGames: start the SDK (only when framed by CrazyGames) and tell it when loading is over.
  useEffect(() => {
    if (!crazyWanted()) return;
    void crazyInit().then((sdk) => sdk && crazyLoading(true));
  }, []);
  useEffect(() => {
    if (phase !== "loading") crazyLoading(false);
  }, [phase]);
  // Gameplay is "on" only while the player is in the action (not paused, in a menu, on a result or watching an ad).
  useEffect(() => {
    crazyGameplay(phase === "playing" && !adBusy && !help && !editing);
  }, [phase, adBusy, help, editing]);

  const pushToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    const timer = setTimeout(
      () => {
        toastTimers.current.delete(timer);
        setToasts((list) => list.filter((t) => t.id !== id));
      },
      tone === "bad" ? 4200 : 2800,
    );
    toastTimers.current.add(timer);
  }, []);

  const clearToasts = useCallback(() => {
    toastTimers.current.forEach(clearTimeout);
    toastTimers.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const timers = toastTimers.current;
    const game = new NightHeistGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      toast: pushToast,
      result: (r) => {
        const before = currentSave();
        const key = String(r.level);
        const prev = before.heists[key];
        const heists = { ...before.heists };
        let paid = 0;
        let best = false;
        if (r.escaped) {
          paid = payout(r.value, prev?.value ?? 0, modsOf(before).cash);
          best = !prev || r.stars > prev.stars || r.time < prev.time || r.value > prev.value;
          heists[key] = {
            stars: Math.max(prev?.stars ?? 0, r.stars),
            time: Math.min(prev?.time ?? Infinity, r.time),
            value: Math.max(prev?.value ?? 0, r.value),
            loot: Math.max(prev?.loot ?? 0, r.loot),
            clean: (prev?.clean ?? false) || !r.alarm,
          };
        }
        writeSave({ heists, runs: before.runs + 1, bank: before.bank + paid });
        setResult({ ...r, best, paid, bank: before.bank + paid });
        if (r.escaped && r.stars === 3) crazyHappy();
      },
    });
    gameRef.current = game;
    const start = currentSave();
    void game.load(modelSizes, { thief: start.thief, outfit: start.outfit }, Math.min(LEVELS.length - 1, start.last));
    // Tests (scripts/check-night-heist.mjs): the solver and a way to play its inputs in the real game.
    if (process.env.NODE_ENV !== "production") {
      void import("./bot").then(({ solve, toSimInput, BOT_DT }) => {
        if (gameRef.current !== game) return;
        Object.assign(window, {
          __nightHeist: {
            game,
            records,
            heists: LEVELS.length,
            save: currentSave,
            ui: () => uiRef.current,
            solve: (i: number) => solve(LEVELS[i], i),
            /** Plays a solver's inputs in the heist that is running (start it from the menus first). `hold`: keep the game from stepping by itself afterwards. */
            play(inputs: Parameters<typeof toSimInput>[0][], finish = true, hold = false) {
              game.auto = true;
              try {
                for (const inp of inputs) game.autoStep(BOT_DT, toSimInput(inp));
                for (let i = 0; finish && i < 400 && game.sim && !game.sim.result; i++) game.autoStep(BOT_DT, { x: 0, z: 0, sneak: true, run: false });
              } finally {
                game.auto = hold;
              }
              return game.sim?.result ?? null;
            },
            /** Runs the thief straight at the nearest guard until the heist ends (to get caught). */
            getCaught() {
              game.auto = true;
              try {
                for (let i = 0; i < 6000 && game.sim && !game.sim.result; i++) {
                  const sim = game.sim;
                  let best = Infinity;
                  let x = 0;
                  let z = 0;
                  for (const g of sim.guards) {
                    const d = Math.hypot(g.x - sim.thief.x, g.z - sim.thief.z);
                    if (g.kind !== "dog" && d < best) {
                      best = d;
                      const path = sim.grid.path(sim.thief.x, sim.thief.z, g.x, g.z, { thief: true }) ?? [];
                      const to = path[0] ?? g;
                      const l = Math.hypot(to.x - sim.thief.x, to.z - sim.thief.z) || 1;
                      x = (to.x - sim.thief.x) / l;
                      z = (to.z - sim.thief.z) / l;
                    }
                  }
                  game.autoStep(BOT_DT, { x, z, sneak: false, run: true });
                }
              } finally {
                game.auto = false;
              }
              return game.sim?.result ?? null;
            },
          },
        });
      });
    }
    return () => {
      gameRef.current = null;
      timers.forEach(clearTimeout);
      timers.clear();
      game.dispose();
      if (process.env.NODE_ENV !== "production") delete (window as { __nightHeist?: unknown }).__nightHeist;
    };
  }, [hud, modelSizes, pushToast]);

  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  // --- Shop: picking a thief or an outfit shows it on the 3D thief; closing puts back what is equipped. ---
  const shift = useRef({ x: 0, y: 0 });

  const showLook = (thief: string, outfit: string) => gameRef.current?.setLook(thief, outfit);

  function closeShop() {
    const s = currentSave();
    setShop(null);
    showLook(s.thief, s.outfit);
    gameRef.current?.setShowcase(false);
  }

  const openShop = (tab: ShopKind = "thief") => {
    const game = gameRef.current;
    if (!game) return;
    if (phase === "result") {
      setResult(null);
      clearToasts();
      game.toMenu();
    } else if (phase === "briefing") game.toMenu();
    else if (phase !== "menu") return;
    const s = currentSave();
    setHelp(false);
    setShop({ tab, selected: tab === "thief" ? s.thief : tab === "outfit" ? s.outfit : tab === "gadget" ? s.gadget || GADGETS[0].id : UPGRADES[0].id });
    game.setShowcase(true, shift.current);
  };

  const pickTab = (tab: ShopKind) => {
    const s = currentSave();
    showLook(s.thief, s.outfit);
    setShop({ tab, selected: cardsFor(tab, s).find((c) => c.equipped)?.id ?? cardsFor(tab, s)[0].id });
  };

  const pickItem = (id: string) => {
    if (!shop) return;
    setShop({ ...shop, selected: id });
    const s = currentSave();
    if (shop.tab === "thief") showLook(id, s.outfit);
    else if (shop.tab === "outfit") showLook(s.thief, id);
  };

  const equip = (kind: ShopKind, id: string) => {
    const s = currentSave();
    if (kind === "thief" && isOwned(s, kind, findItem(THIEVES, id))) writeSave({ thief: id });
    else if (kind === "outfit" && isOwned(s, kind, findItem(OUTFITS, id))) writeSave({ outfit: id });
    else if (kind === "gadget" && isOwned(s, kind, findItem(GADGETS, id))) writeSave({ gadget: s.gadget === id ? "" : id });
    const now = currentSave();
    showLook(now.thief, now.outfit);
  };

  const buy = (kind: ShopKind, id: string) => {
    const s = currentSave();
    if (kind === "upgrade") {
      const u = UPGRADES.find((x) => x.id === id);
      const level = u ? (s.upgrades[u.id] ?? 0) : 0;
      if (!u || level >= u.prices.length || s.bank < u.prices[level]) return;
      writeSave({ bank: s.bank - u.prices[level], upgrades: { ...s.upgrades, [u.id]: level + 1 } });
      return;
    }
    const list = kind === "thief" ? THIEVES : kind === "outfit" ? OUTFITS : GADGETS;
    const item = list.find((x) => x.id === id);
    if (!item || isOwned(s, kind, item) || s.bank < item.price) return;
    // Bought things are put on straight away.
    writeSave({ bank: s.bank - item.price, owned: [...s.owned, ownedKey(kind, item.id)], [kind]: item.id });
    const now = currentSave();
    showLook(now.thief, now.outfit);
  };

  const onLayout = useCallback((s: { x: number; y: number }) => {
    shift.current = s;
    gameRef.current?.setShowcase(true, s);
  }, []);

  // --- Heists ---

  const openCase = (i: number) => {
    const index = Math.max(0, Math.min(LEVELS.length - 1, i));
    if (!isUnlocked(index, currentSave())) return;
    if (shop) closeShop();
    setResult(null);
    clearToasts();
    setFiles(true);
    setSelected(index);
    setDistrict(districtIndex(index));
    writeSave({ last: index });
    gameRef.current?.briefing(index);
  };

  const start = (i = selected) => {
    const index = Math.max(0, Math.min(LEVELS.length - 1, i));
    const s = currentSave();
    if (!isUnlocked(index, s)) return;
    blur();
    if (shop) closeShop();
    setResult(null);
    setHelp(false);
    setEditing(false);
    clearToasts();
    setSelected(index);
    setRunKey((k) => k + 1);
    gameRef.current?.setLook(s.thief, s.outfit);
    gameRef.current?.start(index, modsOf(s));
  };

  /** Back to the case files (from a briefing, a pause or a result). */
  const toFiles = () => {
    setResult(null);
    setEditing(false);
    clearToasts();
    setFiles(true);
    setDistrict(districtIndex(selected));
    gameRef.current?.toMenu();
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    blur();
    if (help) setHelp(false);
    else if (editing) setEditing(false);
    else if (shop) closeShop();
    else if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
    else if (phase === "briefing") toFiles();
    else if (phase === "menu" && files) setFiles(false);
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Tests drive the same functions the buttons call.
  useEffect(() => {
    uiRef.current = { start, open: openCase, files: toFiles, shop: openShop, buy, equip, pause: pauseOrResume };
  });

  // Enter confirms on menus; S opens the shop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (help || editing || shop || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (e.key === "Enter" && !onButton) {
        if (phase === "briefing") start();
        else if (phase === "paused") gameRef.current?.resume();
        else if (phase === "menu") openCase(files ? selected : nextHeist(currentSave()));
      } else if (e.code === "KeyR" && phase === "playing") {
        // Only mid-heist: not during the escape fade (that would throw away a won heist) or the caught pause.
        if (gameRef.current?.sim?.stage === "play") start();
      } else if (e.key.toLowerCase() === "s" && phase === "menu") {
        e.preventDefault();
        openShop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving the tab pauses the heist (YouTube Playables pauses through its own SDK instead).
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

  /** CrazyGames: an ad at the natural break between heists, then carry on. */
  const afterBreak = (go: () => void) => {
    if (!inCrazyGames() || adBusy) return go();
    setAdBusy(true);
    void crazyAd("midgame").then(() => {
      setAdBusy(false);
      go();
    });
  };

  /** CrazyGames: a rewarded ad the player picked doubles the cash from this heist. */
  const doubleHaul = () => {
    if (!result || result.doubled || !result.escaped || result.paid <= 0 || adBusy) return;
    const snapshot = result;
    setAdBusy(true);
    void crazyAd("rewarded").then((watched) => {
      setAdBusy(false);
      if (!watched) {
        pushToast("No ad is available right now.", "bad");
        return;
      }
      writeSave({ bank: currentSave().bank + snapshot.paid });
      setResult({ ...snapshot, doubled: true, bank: snapshot.bank + snapshot.paid });
    });
  };

  const running = phase === "playing" || phase === "paused";
  const next = result ? result.level + 1 : 0;
  const nextOpen = !!result && next < LEVELS.length && isUnlocked(next, save);

  return (
    <GameRoot game={GAME} className="bg-[#06070c]">
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Night Heist game" />

      {/* A soft vignette keeps the eye on the thief. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(2,3,8,0.55)_100%)]" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !shop && !editing && !help && !files && (
        <MenuScreen save={save} onPlay={() => openCase(nextHeist(currentSave()))} onFiles={() => setFiles(true)} onShop={() => openShop()} onHelp={() => setHelp(true)} onControls={() => setEditing(true)} touch={touch} />
      )}
      {phase === "menu" && !shop && !editing && !help && files && <CaseFiles save={save} district={district} onDistrict={setDistrict} onPick={openCase} onBack={() => setFiles(false)} onShop={() => openShop()} />}
      {phase === "menu" && shop && <Shop save={save} tab={shop.tab} selected={shop.selected} onTab={pickTab} onSelect={pickItem} onBuy={buy} onEquip={equip} onClose={closeShop} onLayout={onLayout} />}

      {phase === "briefing" && !help && <Briefing index={selected} save={save} onStart={() => start()} onBack={toFiles} onShop={() => openShop("gadget")} touch={touch} />}

      {(running || (phase === "menu" && editing)) && <HudOverlay store={hud} onPause={pauseOrResume} onMap={() => gameRef.current?.toggleOverview()} touch={touch || editing} />}
      {running && <Toasts toasts={toasts} />}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}
      {phase === "playing" && selected === 0 && !save.heists["0"] && <Tutorial store={hud} touch={touch} runKey={runKey} />}
      {phase === "playing" && !touch && save.runs < 2 && !(selected === 0 && !save.heists["0"]) && (
        <div key={`hint-${runKey}`} className="nh-anim pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),72px)] flex animate-[nh-hint_8s_ease_forwards] justify-center px-4 opacity-0">
          <p className="g-hud g-display px-4 py-2 text-center text-sm">WASD move · Shift sneak · Space run · E use · click the floor to throw a coin · Q map</p>
        </div>
      )}

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={() => start()} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toFiles} icon={<Home className="size-4" />}>
              Heists
            </SoftButton>
          </div>
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
          {/* Music, sound, full screen: on a phone the corner buttons make way for the game, so they are here. */}
          <div className="flex justify-center">
            <SystemButtons small />
          </div>
        </Modal>
      )}
      {editing && (phase === "menu" || phase === "paused") && <ControlsEditor store={hud} onClose={() => setEditing(false)} />}

      {phase === "result" && result && !help && <ResultCard result={result} nextOpen={nextOpen} onNext={() => afterBreak(() => openCase(next))} onRetry={() => afterBreak(() => start(result.level))} onMenu={toFiles} onShop={() => openShop()} onDouble={inCrazyGames() ? doubleHaul : undefined} busy={adBusy} />}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}
