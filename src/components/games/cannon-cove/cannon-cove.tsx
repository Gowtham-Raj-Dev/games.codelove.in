"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Anchor,
  CircleHelp,
  Coins,
  Crosshair,
  Flag,
  Gamepad2,
  Gauge,
  Hammer,
  Home,
  Map as MapIcon,
  Navigation,
  Package,
  Pause,
  Play,
  RotateCcw,
  Sailboat,
  Ship,
  ShieldPlus,
  Skull,
  Sparkles,
  Swords,
  Timer,
  Trophy,
  Users,
  Wind,
  Wrench,
} from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { SEA_SHANTY } from "../shared/songs";
import { box, ControlLayer, ControlsButton, ControlsEditor, createControls, type Placed } from "../shared/touch-layout";
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
  useRecords,
  useShortcuts,
  useStore,
  type Store,
} from "../shared/ui";
import { CannonCoveGame, EMPTY_HUD, type Card, type Hud, type Offer, type Phase, type PortView, type UpgradeId, type VoyageResult, type WreckReport } from "./engine";
import { GAME } from "./manifest";
import { Career, type CareerSave } from "./trade";
import { ChartScreen, DockButton, PortScreen, Tracker, zoneTone } from "./trade-ui";
import { OnlineHudView, OnlinePanel, roomFromUrl } from "./online-ui";

const records = createRecords("cannon-cove:v1", { bestWave: 0, bestGold: 0, mostSunk: 0, voyages: 0 });
/** The Open Sea trading career (one save). */
const career = createRecords<{ save: CareerSave | null }>("cannon-cove:trade:v1", { save: null });

const STYLES = `
@keyframes cove-hint { 0% { opacity: 0; transform: translateY(8px); } 8%, 80% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes cove-banner { 0% { opacity: 0; transform: translateY(-10px) scale(0.96); } 100% { opacity: 1; transform: none; } }
@keyframes cove-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
`;

export function CannonCove({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<CannonCoveGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [result, setResult] = useState<(VoyageResult & { newBest: boolean }) | null>(null);
  const [port, setPort] = useState<PortView | null>(null);
  const [wreck, setWreck] = useState<WreckReport | null>(null);
  const [chart, setChart] = useState(false);
  /** Sailing the Open Sea (not the wave battles). */
  const [trade, setTrade] = useState(false);
  /** Online battles: the panel is open (a room code from an invite link opens it straight away). */
  const [online, setOnline] = useState<{ code: string | null } | null>(() => {
    const code = roomFromUrl();
    return code ? { code } : null;
  });
  const [onlineMenu, setOnlineMenu] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [touch, setTouch] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const saved = useRecords(records);
  const voyage = useRecords(career);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new CannonCoveGame(canvas, {
      progress: setProgress,
      phase: (next) => {
        setPhase(next);
        // The chart closes whenever the game leaves the sea or the port.
        if (next !== "chart" && next !== "port") setChart(false);
      },
      hud: hud.set,
      offer: setOffer,
      error: setError,
      over: (run) => {
        const before = records.get();
        const newBest = run.wave > before.bestWave;
        records.set({
          bestWave: Math.max(before.bestWave, run.wave),
          bestGold: Math.max(before.bestGold, run.gold),
          mostSunk: Math.max(before.mostSunk, run.sunk),
          voyages: before.voyages + 1,
        });
        setResult({ ...run, newBest });
      },
      port: setPort,
      save: (data) => career.set({ save: data }),
      wrecked: setWreck,
    });
    gameRef.current = game;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __cannonCove: { game, records, career, audio, music, song: SEA_SHANTY } });
    game.setOverlay(overlayRef.current);
    // Floating texts over the 3D view use the game's display face.
    game.setFont(getComputedStyle(canvas).getPropertyValue("--game-display"));
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes]);

  // Chart the open sea in the background once the title screen is up, so setting sail is instant.
  const warmed = useRef(false);
  useEffect(() => {
    if (phase !== "menu" || warmed.current) return;
    warmed.current = true;
    const id = window.setTimeout(() => gameRef.current?.warmSea(), 1800);
    return () => window.clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    // Touch controls on phones and tablets (and as soon as anyone touches the screen).
    const coarse = window.matchMedia("(pointer: coarse)");
    const sync = () => coarse.matches && setTouch(true);
    sync();
    const onTouch = (e: PointerEvent) => e.pointerType === "touch" && setTouch(true);
    window.addEventListener("pointerdown", onTouch);
    coarse.addEventListener("change", sync);
    return () => {
      window.removeEventListener("pointerdown", onTouch);
      coarse.removeEventListener("change", sync);
    };
  }, []);

  const start = () => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setOffer(null);
    setHelp(false);
    setWreck(null);
    setTrade(false);
    setRunKey((k) => k + 1);
    game.start();
  };

  /** Open Sea: continue the saved career, or start a new one. */
  const sail = (fresh: boolean) => {
    const game = gameRef.current;
    if (!game) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setResult(null);
    setOffer(null);
    setHelp(false);
    setWreck(null);
    setConfirmNew(false);
    setTrade(true);
    setPreparing(true);
    // Let "Charting the seas…" paint before the open sea is built.
    window.setTimeout(() => {
      gameRef.current?.startTrade(fresh ? null : career.get().save);
      setPreparing(false);
      setRunKey((k) => k + 1);
    }, 60);
  };

  const toMenu = () => {
    setResult(null);
    setOffer(null);
    setWreck(null);
    setChart(false);
    setTrade(false);
    gameRef.current?.toMenu();
  };

  const openChart = () => {
    const game = gameRef.current;
    if (!game) return;
    if (phase === "playing") game.openChart();
    if (phase === "playing" || phase === "port") setChart(true);
  };

  const closeChart = () => {
    setChart(false);
    gameRef.current?.closeChart();
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
    if (chart) {
      closeChart();
      return;
    }
    // Online the battle never stops: Esc opens the battle menu instead.
    if (game?.onlineActive) {
      setOnlineMenu((open) => !open);
      return;
    }
    if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
  };

  const openHelp = () => {
    if (phase === "playing" && !gameRef.current?.onlineActive) gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Game keys.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game || e.ctrlKey || e.metaKey || e.altKey || help || editing) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const confirm = k === "Enter" || k === " ";
      if (k === "c" && !e.repeat && (phase === "playing" || phase === "port" || phase === "chart") && trade) {
        e.preventDefault();
        if (chart) closeChart();
        else openChart();
        return;
      }
      if (chart) return;
      if (phase === "playing") {
        let used = true;
        if (k === "a" || k === "ArrowLeft") game.setSteerKey("left", true);
        else if (k === "d" || k === "ArrowRight") game.setSteerKey("right", true);
        else if (e.repeat) used = k === "w" || k === "s" || k === "ArrowUp" || k === "ArrowDown" || k === " ";
        else if (k === "w" || k === "ArrowUp") game.sailStep(1);
        else if (k === "s" || k === "ArrowDown") game.sailStep(-1);
        else if (k === "q" || k === "j") game.setFire(1, true);
        else if (k === "e" || k === "l") game.setFire(-1, true);
        else if (k === "z") game.zoomStep();
        else if (k === "g" && trade) game.toggleAutopilot();
        else if (confirm && !onButton) game.dock();
        else used = k === " ";
        if (used) e.preventDefault();
      } else if (phase === "upgrade") {
        if (k === "1" || k === "2" || k === "3") game.choose(Number(k) - 1);
        else if (k === "r") game.repair();
      } else if (phase === "port") {
        if (k === "Enter" && !onButton) {
          e.preventDefault();
          game.setSail();
        }
      } else if (phase === "paused") {
        if (confirm && !onButton) {
          e.preventDefault();
          game.resume();
        }
      } else if ((phase === "menu" && !online) || phase === "over") {
        if (confirm && !onButton) {
          e.preventDefault();
          if (phase === "menu") sail(false);
          else start();
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const game = gameRef.current;
      if (!game) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "a" || k === "ArrowLeft") game.setSteerKey("left", false);
      else if (k === "d" || k === "ArrowRight") game.setSteerKey("right", false);
      else if (k === "q" || k === "j") game.setFire(1, false);
      else if (k === "e" || k === "l") game.setFire(-1, false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Leaving the tab or window pauses the voyage.
  useEffect(() => {
    const pause = () => {
      gameRef.current?.releaseInput();
      if (!gameRef.current?.onlineActive) gameRef.current?.pause();
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

  const running = phase === "playing" || phase === "paused" || phase === "upgrade" || phase === "sinking" || phase === "chart";
  const summary = useMemo(() => {
    if (!voyage.save) return null;
    const c = new Career(voyage.save);
    return { rank: c.rankInfo().name, gold: c.gold, ship: c.ship.name, ports: c.visited.length };
  }, [voyage.save]);

  return (
    <GameRoot game={GAME} className="bg-[#9fd3ee]" onWheel={(e) => running && gameRef.current?.zoomBy(e.deltaY * 0.0009)}>
      <style>{STYLES}</style>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Cannon Cove game" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 block h-full w-full" aria-hidden />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {online && phase !== "loading" && phase !== "error" && (
        <OnlinePanel
          game={gameRef}
          code={online.code}
          menuOpen={onlineMenu}
          onMenuClose={() => setOnlineMenu(false)}
          onExit={() => {
            setOnline(null);
            setOnlineMenu(false);
            // An invite link has done its job.
            if (window.location.search.includes("room=")) window.history.replaceState(null, "", window.location.pathname);
          }}
        />
      )}
      {phase === "menu" && !editing && !preparing && !online && (
        <MenuScreen
          best={saved.bestWave}
          summary={summary}
          touch={touch}
          onSail={() => sail(false)}
          onNew={() => (summary ? setConfirmNew(true) : sail(true))}
          onWaves={start}
          onOnline={() => setOnline({ code: null })}
          onHelp={() => setHelp(true)}
          onControls={() => setEditing(true)}
        />
      )}
      {preparing && (
        <div className="absolute inset-0 grid place-items-center bg-black/30">
          <p className="g-hud g-display animate-[cove-pulse_1s_ease_infinite] px-5 py-2 text-xl">Charting the seas…</p>
        </div>
      )}
      {/* Controls editor from the title screen: the HUD shows behind it so controls keep clear of it. */}
      {phase === "menu" && editing && <HudOverlay store={hud} paused={false} touch={touch} onPause={() => {}} onMinimap={onMinimap} onChart={() => {}} onDock={() => {}} />}

      {running && <HudOverlay store={hud} paused={phase === "paused"} touch={touch} onPause={pauseOrResume} onMinimap={onMinimap} onChart={openChart} onDock={() => gameRef.current?.dock()} onAuto={() => gameRef.current?.toggleAutopilot()} />}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}
      {phase === "playing" && !trade && saved.voyages < 3 && <ControlsHint key={runKey} touch={touch} />}
      {phase === "playing" && trade && (voyage.save?.stats.played ?? 0) < 240 && <TradeHint key={runKey} touch={touch} />}

      {phase === "upgrade" && offer && !help && <UpgradeModal offer={offer} onPick={(i) => gameRef.current?.choose(i)} onRepair={() => gameRef.current?.repair()} />}

      {phase === "port" && port && !help && <PortScreen view={port} game={gameRef} onChart={openChart} onMenu={toMenu} onHelp={() => setHelp(true)} />}
      {chart && (phase === "chart" || phase === "port") && (
        <ChartScreen
          game={gameRef}
          onClose={closeChart}
          onSail={
            phase === "chart"
              ? (target) => {
                  closeChart();
                  gameRef.current?.setWaypoint(target);
                  gameRef.current?.setAutopilot(true);
                }
              : undefined
          }
        />
      )}

      {phase === "paused" && !help && !editing && (
        <Modal title="Anchors dropped">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />}>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            {trade ? (
              <SoftButton
                onClick={() => {
                  gameRef.current?.resume();
                  openChart();
                }}
                icon={<MapIcon className="size-4" />}
              >
                Chart
              </SoftButton>
            ) : (
              <SoftButton onClick={start} icon={<RotateCcw className="size-4" />}>
                Restart
              </SoftButton>
            )}
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Menu
            </SoftButton>
          </div>
          {trade && <p className="g-muted text-center text-xs">Your voyage is saved — Menu keeps it for later.</p>}
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
          <div className="flex justify-center">
            <SystemButtons />
          </div>
        </Modal>
      )}
      {(phase === "paused" || phase === "menu") && editing && <ControlsEditor controls={touchControls} face={(id, p) => <TouchFace id={id} at={p} hud={hud.get()} />} onClose={() => setEditing(false)} />}

      {phase === "over" && result && !help && (
        <Modal title="Sent to the depths!">
          <div className="text-center">
            {result.newBest && (
              <p className="g-display mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-sm text-amber-950 ring-2 ring-amber-700/60">
                <Trophy className="size-3.5" /> New best voyage
              </p>
            )}
            <p className="g-muted text-xs font-bold tracking-[0.18em] uppercase">Reached wave</p>
            <p className="g-display text-7xl leading-none tabular-nums">{result.wave}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Ships sunk" value={formatNumber(result.sunk)} />
            <Stat label="Gold" value={formatNumber(result.gold)} />
            <Stat label="Best wave" value={Math.max(saved.bestWave, result.wave)} />
          </div>
          <p className="g-muted text-center text-sm">
            {result.forts > 0 ? `${result.forts} fort${result.forts > 1 ? "s" : ""} destroyed · ` : ""}
            {Math.floor(result.seconds / 60)}m {result.seconds % 60}s at sea
          </p>
          <BigButton onClick={start} icon={<RotateCcw className="size-5" />} autoFocus>
            Sail again
          </BigButton>
          <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
            Menu
          </SoftButton>
        </Modal>
      )}

      {phase === "wrecked" && wreck && !help && (
        <Modal title="Shipwrecked!">
          <p className="text-center text-sm">The pirates got you. The guild towed what was left of your ship back to {wreck.port}.</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Cargo lost" value={formatNumber(wreck.lostGoods)} />
            <Stat label="Contracts lost" value={wreck.failed} />
            <Stat label="Towing fee" value={formatNumber(wreck.fee)} />
          </div>
          <p className="g-muted text-center text-xs">Your ships, upgrades and rank are safe. Repair the hull before you sail again.</p>
          <BigButton onClick={() => gameRef.current?.recover()} icon={<Anchor className="size-5" />} autoFocus>
            Back to {wreck.port}
          </BigButton>
        </Modal>
      )}

      {confirmNew && (
        <Modal title="Start a new voyage?">
          <p className="text-center text-sm">Your saved career — gold, ships, rank and contracts — will be gone for good.</p>
          <BigButton onClick={() => sail(true)} icon={<Sailboat className="size-5" />}>
            Start over
          </BigButton>
          <SoftButton onClick={() => setConfirmNew(false)}>Keep my voyage</SoftButton>
        </Modal>
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Menu ----------------------------------------------------------------------------------------

function MenuScreen({
  best,
  summary,
  touch,
  onSail,
  onNew,
  onWaves,
  onOnline,
  onHelp,
  onControls,
}: {
  best: number;
  summary: { rank: string; gold: number; ship: string; ports: number } | null;
  touch: boolean;
  onSail: () => void;
  onNew: () => void;
  onWaves: () => void;
  onOnline: () => void;
  onHelp: () => void;
  onControls: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>
      <div className="px-4 pt-2 text-center sm:pt-4 land:pt-0">
        <GameTitle game={GAME} />
        <p className="g-hud g-display mx-auto mt-4 inline-block px-4 py-1 text-base sm:text-lg land:mt-2 land:text-sm">Trade across the open sea · fight off pirates · build a fleet</p>
      </div>
      <div className="flex-1" />
      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-2.5 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8 land:space-y-1.5">
        <BigButton onClick={summary ? onSail : onNew} icon={<Sailboat className="size-6" />} autoFocus>
          {summary ? "Continue voyage" : "Set sail — Open Sea"}
        </BigButton>
        {summary && (
          <p className="g-hud g-display mx-auto flex w-fit flex-wrap items-center justify-center gap-x-3 px-3 py-1 text-sm land:text-xs">
            <span>{summary.rank}</span>
            <span className="inline-flex items-center gap-1">
              <Coins className="size-3.5 text-amber-700" /> {formatNumber(summary.gold)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Ship className="size-3.5" /> {summary.ship}
            </span>
            <span>
              {summary.ports}/10 ports
            </span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <SoftButton onClick={onOnline} icon={<Users className="size-4" />}>
            Online battle
          </SoftButton>
          <SoftButton onClick={onWaves} icon={<Swords className="size-4" />}>
            Battle waves{best ? ` · best ${best}` : ""}
          </SoftButton>
        </div>
        <div className="flex justify-center gap-2">
          {summary && (
            <button type="button" onClick={onNew} className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1 text-xs hover:brightness-105">
              <RotateCcw className="size-3.5" /> New voyage
            </button>
          )}
          <button type="button" onClick={onHelp} className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1 text-xs hover:brightness-105">
            <CircleHelp className="size-3.5" /> How to play
          </button>
        </div>
        <p className="g-hud mx-auto w-fit px-3 py-1 text-center text-xs font-semibold land:hidden">
          {touch ? "Left stick steers and sets sails · buttons fire each side" : "A D steer · W S sails · Q E fire · Space dock · C chart · Esc pause"}
        </p>
      </div>
    </div>
  );
}

function TradeHint({ touch }: { touch: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex animate-[cove-hint_10s_ease_forwards] justify-center px-4 ${touch ? "top-[38%] land:top-[20%]" : "bottom-[max(calc(env(safe-area-inset-bottom)+150px),170px)]"}`}
    >
      <div className={`g-panel text-center font-semibold ${touch ? "max-w-xs px-3 py-2 text-xs" : "max-w-md px-5 py-3 text-sm"}`}>
        <p className={`g-panel-title ${touch ? "mb-1 text-lg" : "mb-1.5 text-2xl"}`}>Follow the gold arrow</p>
        <p>
          It points to your course — or tap <b>Auto-sail</b>
          {touch ? "" : " (G)"} and the ship sails there and docks by itself. The {touch ? "map button" : <Kbd>C</Kbd>} opens the sea chart.
        </p>
        <p className={`g-muted mt-1.5 ${touch ? "text-[10px]" : "text-xs"}`}>Pirates prowl far from home — run, or turn side-on and fire.</p>
      </div>
    </div>
  );
}

function ControlsHint({ touch }: { touch: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex animate-[cove-hint_9s_ease_forwards] justify-center px-4 ${touch ? "top-[38%]" : "bottom-[max(calc(env(safe-area-inset-bottom)+96px),112px)]"}`}
    >
      <div className={`g-panel text-center font-semibold ${touch ? "max-w-xs px-3 py-2 text-xs" : "max-w-md px-5 py-3 text-sm"}`}>
        <p className={`g-panel-title ${touch ? "mb-1 text-lg" : "mb-1.5 text-2xl"}`}>Hoist the colours, captain!</p>
        {touch ? (
          <p>Stick ← → steers · push ↑ ↓ for more or less sail · the buttons fire each side</p>
        ) : (
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <span>
              <Kbd>A</Kbd> <Kbd>D</Kbd> steer
            </span>
            <span>
              <Kbd>W</Kbd> <Kbd>S</Kbd> sails
            </span>
            <span>
              <Kbd>Q</Kbd> fire left
            </span>
            <span>
              <Kbd>E</Kbd> fire right
            </span>
          </p>
        )}
        <p className={`g-muted mt-1.5 ${touch ? "text-[10px]" : "text-xs"}`}>Your cannons point sideways: turn side-on to a ship, then fire.</p>
      </div>
    </div>
  );
}

// --- HUD -----------------------------------------------------------------------------------------

function HudOverlay({
  store,
  paused,
  touch,
  onPause,
  onMinimap,
  onChart,
  onDock,
  onAuto,
}: {
  store: Store<Hud>;
  paused: boolean;
  touch: boolean;
  onPause: () => void;
  onMinimap: (canvas: HTMLCanvasElement | null) => void;
  onChart: () => void;
  onDock: () => void;
  onAuto?: () => void;
}) {
  const hud = useStore(store);
  const hullFrac = hud.maxHull ? hud.hull / hud.maxHull : 0;
  const hullColor = hullFrac > 0.6 ? "bg-emerald-600" : hullFrac > 0.3 ? "bg-amber-500" : "bg-red-600";
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top-left: hull, gold, wave. `data-avoid`: touch controls keep clear (shared/touch-layout.tsx). */}
      <div data-avoid className={`absolute top-0 left-0 space-y-1.5 p-3 pt-[max(env(safe-area-inset-top),12px)] ${touch ? "w-[min(48vw,210px)]" : "w-[min(60vw,320px)] sm:p-5"}`}>
        <div className={`g-hud ${touch ? "px-2 py-1" : "px-3 py-1.5"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`g-display inline-flex items-center gap-1.5 ${touch ? "text-xs" : "text-base sm:text-lg"}`}>
              <Ship className={touch ? "size-3.5" : "size-4"} /> {hud.ship}
            </span>
            <span className={`g-display tabular-nums ${touch ? "text-xs" : "text-base sm:text-lg"}`}>
              {hud.hull}
              <span className={`g-muted ${touch ? "text-[10px]" : "text-sm"}`}> / {hud.maxHull}</span>
            </span>
          </div>
          <div className={`mt-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)] ring-1 ring-[color-mix(in_srgb,currentColor_30%,transparent)] ${touch ? "h-1.5" : "h-2.5"}`}>
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${hullColor} ${hullFrac < 0.3 ? "animate-[cove-pulse_0.8s_ease_infinite]" : ""}`}
              style={{ width: `${hullFrac * 100}%` }}
            />
          </div>
        </div>
        {hud.online ? null : hud.trade ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              <HudChip icon={<Coins className="size-4 text-amber-700" />}>{formatNumber(hud.gold)}</HudChip>
              <HudChip icon={<Package className="size-4" />}>
                {hud.trade.cargo}/{hud.trade.cap}
              </HudChip>
              <HudChip icon={<Flag className="size-4" />}>
                <span className={zoneTone(hud.trade.danger)}>{hud.trade.zone}</span>
              </HudChip>
            </div>
            <Tracker trade={hud.trade} touch={touch} />
          </>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <HudChip icon={<Coins className="size-4 text-amber-700" />}>{formatNumber(hud.gold)}</HudChip>
            <HudChip icon={<Flag className="size-4" />}>Wave {hud.wave}</HudChip>
            <HudChip icon={<Swords className="size-4 text-red-700" />}>{hud.enemies} left</HudChip>
            <HudChip icon={<Skull className="size-4" />} wide>
              {hud.sunk} sunk
            </HudChip>
          </div>
        )}
      </div>

      {/* Top-right: pause and system buttons (desktop), minimap. */}
      <div data-avoid className="absolute top-0 right-0 flex flex-col items-end gap-2 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <div className="pointer-events-auto flex items-center gap-2">
          {hud.trade && (
            <IconButton onClick={onChart} label="Sea chart (C)">
              <MapIcon className="size-5" />
            </IconButton>
          )}
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          <FullscreenButton className="sm:hidden" />
          <RotateButton className="sm:hidden" />
          <div className="hidden sm:block">
            <SystemButtons />
          </div>
        </div>
        <div className="g-hud rounded-full! p-1">
          <canvas ref={onMinimap} className={`block rounded-full ${touch ? "size-20" : "size-28 sm:size-36"}`} aria-label="Minimap" />
        </div>
      </div>

      {/* Banner and boss bar. */}
      <div className={`absolute inset-x-0 top-[max(env(safe-area-inset-top),12px)] flex flex-col items-center gap-2 px-3 ${hud.online ? "pt-36 sm:pt-28" : "pt-36 sm:pt-4"}`}>
        {hud.boss && (
          <div className="g-hud w-[min(86vw,420px)] px-4 py-1.5 pointer-coarse:w-[min(70vw,280px)] pointer-coarse:px-3 pointer-coarse:py-1">
            <p className="g-display text-center text-lg leading-tight text-emerald-900 pointer-coarse:text-xs">{hud.boss.name}</p>
            <div className="mt-1 h-3 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)] ring-1 ring-emerald-900/40">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-700 to-teal-500 transition-[width] duration-200" style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
            </div>
          </div>
        )}
        {hud.banner && <BannerView key={hud.banner.id} banner={hud.banner} />}
      </div>

      {hud.trade && !paused && <DockButton trade={hud.trade} touch={touch} onDock={onDock} />}
      {hud.online && <OnlineHudView online={hud.online} touch={touch} />}

      {hud.warn && (
        <div className="absolute inset-x-0 top-[46%] flex justify-center px-4">
          <p className="g-hud g-display animate-[cove-pulse_1s_ease_infinite] px-4 py-1.5 text-lg text-red-800 pointer-coarse:px-3 pointer-coarse:py-1 pointer-coarse:text-sm">{hud.warn}</p>
        </div>
      )}

      {/* Helm: reloads, wind, sails. */}
      {!touch && (
        <div className="absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] flex items-end justify-center gap-3 px-4">
          <ReloadGauge label="Port" keyName="Q" value={hud.reloadL} guns={hud.guns} />
          <HelmPanel hud={hud} onAuto={onAuto} />
          <ReloadGauge label="Starboard" keyName="E" value={hud.reloadR} guns={hud.guns} />
        </div>
      )}
      {touch && (
        <div className="absolute inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),16px)+108px)] flex justify-center">
          <HelmPanel hud={hud} compact onAuto={onAuto} />
        </div>
      )}
    </div>
  );
}

function HudChip({ icon, children, wide = false }: { icon: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <span className={`g-hud g-display items-center gap-1.5 px-2.5 py-0.5 text-base tabular-nums pointer-coarse:gap-1 pointer-coarse:px-1.5 pointer-coarse:py-0 pointer-coarse:text-[11px] [&>svg]:pointer-coarse:size-3 ${wide ? "hidden sm:inline-flex" : "inline-flex"}`}>
      {icon}
      {children}
    </span>
  );
}

function BannerView({ banner }: { banner: NonNullable<Hud["banner"]> }) {
  const tone = {
    info: "",
    good: "text-amber-800",
    boss: "text-emerald-900",
    bad: "text-red-800",
  }[banner.tone];
  return (
    <div className="g-panel animate-[cove-banner_0.35s_ease] px-6 py-2 text-center pointer-coarse:px-3 pointer-coarse:py-1">
      <p className={`g-panel-title text-3xl sm:text-5xl pointer-coarse:text-xl ${tone}`}>{banner.title}</p>
      <p className="g-muted mt-0.5 text-sm font-semibold sm:text-base pointer-coarse:text-[10px]">{banner.sub}</p>
    </div>
  );
}

function ReloadGauge({ label, keyName, value, guns }: { label: string; keyName: string; value: number; guns: number }) {
  const ready = value >= 1;
  return (
    <div className={`g-hud w-40 px-3 py-1.5 transition ${ready ? "ring-2 ring-[var(--accent)]" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="g-display inline-flex items-center gap-1.5 text-base">
          <Kbd>{keyName}</Kbd> {label}
        </span>
        <span className={`g-display text-sm ${ready ? "text-sky-800" : "g-muted"}`}>{ready ? "Ready!" : "Loading"}</span>
      </div>
      <div className="mt-1 flex gap-1">
        {Array.from({ length: guns }, (_, i) => (
          <span key={i} className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)]">
            <span className="block h-full rounded-full bg-sky-600" style={{ width: `${Math.min(1, Math.max(0, value * guns - i)) * 100}%` }} />
          </span>
        ))}
      </div>
    </div>
  );
}

function HelmPanel({ hud, compact = false, onAuto }: { hud: Hud; compact?: boolean; onAuto?: () => void }) {
  const effColor = hud.trimEff > 0.85 ? "text-emerald-800" : hud.trimEff > 0.5 ? "text-amber-800" : "text-red-800";
  return (
    <div data-avoid={compact || undefined} className={`g-hud flex items-center ${compact ? "gap-2 px-2 py-0.5" : "gap-3 px-3.5 py-1.5"}`}>
      <div
        className={`relative grid shrink-0 ${compact ? "size-8" : "size-12"} place-items-center rounded-full bg-[color-mix(in_srgb,currentColor_10%,transparent)] ring-2 ring-[color-mix(in_srgb,currentColor_45%,transparent)]`}
        title={`Wind: ${hud.windStrength < 0.92 ? "light breeze" : hud.windStrength < 1.06 ? "steady breeze" : "strong wind"}`}
      >
        <svg
          viewBox="0 0 40 40"
          className={`${compact ? "size-7" : "size-10"} transition-transform duration-150 ease-linear`}
          style={{ transform: `rotate(${hud.wind}deg) scale(${0.7 + hud.windStrength * 0.28})` }}
          aria-hidden
        >
          <path d="M20 6 L27 18 L22.5 16.5 L22.5 33 L17.5 33 L17.5 16.5 L13 18 Z" fill="var(--accent)" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className={`g-display leading-tight whitespace-nowrap ${compact ? "text-xs" : "text-base"} ${effColor}`}>
          <Wind className="mr-1 inline size-3.5" />
          {hud.trim}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className={`g-muted font-bold ${compact ? "text-[10px]" : "text-xs"}`}>Sails</span>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`${compact ? "h-2.5 w-2" : "h-3.5 w-2.5"} rounded-[2px] ring-1 ring-[color-mix(in_srgb,currentColor_45%,transparent)] ${hud.sail >= n ? "bg-current" : "bg-transparent"}`} />
          ))}
          {!compact && (
            <span className="g-display ml-2 inline-flex items-center gap-1 text-base tabular-nums">
              <Gauge className="size-3.5 opacity-70" /> {hud.speed} kn
            </span>
          )}
        </div>
      </div>
      {hud.trade && onAuto && (
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onAuto();
          }}
          data-active={hud.trade.auto}
          title={hud.trade.waypoint ? "Auto-sail to your course (G)" : "Set a course on the chart first"}
          className={`g-soft pointer-events-auto inline-flex shrink-0 items-center font-bold ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"} ${hud.trade.auto ? "animate-[cove-pulse_1.4s_ease_infinite]" : ""}`}
        >
          <span className="g-unskew gap-1">
            <Navigation className={compact ? "size-3" : "size-3.5"} />
            {hud.trade.auto ? "Auto on" : "Auto-sail"}
            {!compact && <Kbd>G</Kbd>}
          </span>
        </button>
      )}
    </div>
  );
}

// --- Touch controls ------------------------------------------------------------------------------

type GameRef = { readonly current: CannonCoveGame | null };

/** Steering stick and the two broadside buttons, movable from Pause → Edit controls (shared/touch-layout.tsx). Order = placement priority. */
const touchControls = createControls("cannon-cove:controls:v1", {
  stick: { label: "Steering stick", w: 96, x: 64, y: -64, round: true },
  fireR: { label: "Fire right", w: 56, x: -44, y: -44, round: true },
  fireL: { label: "Fire left", w: 56, x: -112, y: -44, round: true },
});

type TouchId = keyof typeof touchControls.defs;

function TouchControls({ game, store }: { game: GameRef; store: Store<Hud> }) {
  const hud = useStore(store);
  return (
    <ControlLayer controls={touchControls}>
      {(placed) => (
        <>
          <Joystick game={game} at={placed.stick} />
          <FireButton side={1} value={hud.reloadL} game={game} at={placed.fireL} />
          <FireButton side={-1} value={hud.reloadR} game={game} at={placed.fireR} />
        </>
      )}
    </ControlLayer>
  );
}

/** A control as the controls editor shows it. */
function TouchFace({ id, at, hud }: { id: TouchId; at: Placed; hud: Hud }) {
  if (id === "stick")
    return (
      <div className="g-hud relative grid size-full place-items-center rounded-full!">
        <StickFace size={at.w} knob={{ x: 0, y: 0 }} />
      </div>
    );
  const side = id === "fireL" ? 1 : -1;
  return <FireFace side={side} size={at.w} value={side === 1 ? hud.reloadL : hud.reloadR} />;
}

function StickFace({ size, knob }: { size: number; knob: { x: number; y: number } }) {
  const k = Math.round(size * 0.42);
  return (
    <>
      <span className="g-display absolute top-1 text-[10px] leading-none">▲ sail</span>
      <span className="g-display absolute bottom-1 text-[10px] leading-none">▼ sail</span>
      <span className="absolute left-2 text-sm opacity-70">◀</span>
      <span className="absolute right-2 text-sm opacity-70">▶</span>
      <span className="g-btn rounded-full!" style={{ width: k, height: k, transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </>
  );
}

function Joystick({ game, at }: { game: GameRef; at: Placed }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const state = useRef<{ id: number; cx: number; cy: number; latch: 0 | 1 | -1 } | null>(null);
  // How far the knob travels.
  const R = at.w / 2 - 14;

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
    game.current?.setStick(Math.abs(x) < 0.12 ? 0 : x);
    // Push up / down past the rim to raise / lower one sail level per push.
    const y = dy / R;
    if (s.latch === 0 && y < -0.7) {
      s.latch = 1;
      game.current?.sailStep(1);
    } else if (s.latch === 0 && y > 0.7) {
      s.latch = -1;
      game.current?.sailStep(-1);
    } else if (s.latch !== 0 && Math.abs(y) < 0.35) s.latch = 0;
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (state.current?.id !== e.pointerId) return;
    state.current = null;
    setKnob({ x: 0, y: 0 });
    game.current?.setStick(0);
  };

  return (
    <div
      style={box(at)}
      className="g-hud pointer-events-auto absolute grid touch-none place-items-center rounded-full!"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        state.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, latch: 0 };
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="Steering stick: left and right to steer, up and down to set sails"
      role="application"
    >
      <StickFace size={at.w} knob={knob} />
    </div>
  );
}

/** A fire button: the ring fills as the guns on that side reload. */
function FireFace({ side, size, value }: { side: 1 | -1; size: number; value: number }) {
  const ready = value >= 1;
  const deg = Math.min(1, Math.max(0, value)) * 360;
  return (
    <span className="grid size-full place-items-center rounded-full p-[3px]" style={{ background: `conic-gradient(var(--accent) ${deg}deg, rgb(59 36 18 / 0.55) ${deg}deg)` }}>
      <span className={`g-btn grid size-full place-items-center rounded-full! ${ready ? "" : "opacity-70 grayscale"}`}>
        <span className="flex flex-col items-center leading-none">
          <Crosshair size={Math.round(size * 0.29)} />
          <span className="mt-0.5" style={{ fontSize: Math.max(8, Math.round(size * 0.16)) }}>
            {side === 1 ? "◀ Left" : "Right ▶"}
          </span>
        </span>
      </span>
    </span>
  );
}

function FireButton({ side, value, game, at }: { side: 1 | -1; value: number; game: GameRef; at: Placed }) {
  return (
    <button
      type="button"
      style={box(at)}
      className="pointer-events-auto absolute touch-none rounded-full select-none"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        game.current?.setFire(side, true);
      }}
      onPointerUp={() => game.current?.setFire(side, false)}
      onPointerCancel={() => game.current?.setFire(side, false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={side === 1 ? "Fire left" : "Fire right"}
    >
      <FireFace side={side} size={at.w} value={value} />
    </button>
  );
}

// --- Upgrades ------------------------------------------------------------------------------------

const CARD_ICONS: Record<UpgradeId, ReactNode> = {
  reload: <Timer className="size-6" />,
  guns: <Crosshair className="size-6" />,
  hull: <ShieldPlus className="size-6" />,
  sails: <Sailboat className="size-6" />,
  shot: <Sparkles className="size-6" />,
  range: <Anchor className="size-6" />,
  ship: <Ship className="size-6" />,
  carpenter: <Hammer className="size-6" />,
  plunder: <Coins className="size-6" />,
};

function UpgradeModal({ offer, onPick, onRepair }: { offer: Offer; onPick: (i: number) => void; onRepair: () => void }) {
  const canRepair = offer.gold >= offer.repairCost && offer.hull < offer.maxHull;
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/40 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label="Choose an upgrade" className="g-panel w-full max-w-3xl space-y-4 p-5 sm:p-6">
          <div className="text-center">
            <p className="g-display text-base text-amber-800">Wave {offer.wave} cleared — the crew wants a reward</p>
            <h2 className="g-panel-title mt-1 text-4xl sm:text-5xl">Choose an upgrade</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {offer.cards.map((card, i) => (
              <UpgradeCard key={card.id} card={card} index={i} onPick={() => onPick(i)} />
            ))}
          </div>
          <div className="g-tint flex flex-col items-center justify-between gap-3 rounded-[var(--g-hud-radius)] p-3 sm:flex-row">
            <div className="g-display flex items-center gap-4 text-lg">
              <span className="inline-flex items-center gap-1.5">
                <Coins className="size-4 text-amber-700" /> {formatNumber(offer.gold)} gold
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Ship className="size-4" /> Hull {offer.hull} / {offer.maxHull}
              </span>
            </div>
            <button
              type="button"
              onClick={onRepair}
              disabled={!canRepair}
              className="g-btn px-4 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="g-unskew gap-2">
                <Wrench className="size-4" /> Repair +{offer.repairAmount} hull · {offer.repairCost} gold
                <span className="hidden sm:inline">
                  <Kbd>R</Kbd>
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpgradeCard({ card, index, onPick }: { card: Card; index: number; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      autoFocus={index === 0}
      className={`g-soft relative flex flex-row items-start gap-3 p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:flex-col sm:items-center sm:text-center ${
        card.rare ? "bg-amber-300/40! ring-2 ring-amber-600" : ""
      }`}
    >
      <span className="absolute top-2 right-2 hidden sm:block">
        <Kbd>{index + 1}</Kbd>
      </span>
      <span className={`g-btn grid size-12 shrink-0 place-items-center rounded-full! ${card.rare ? "bg-[linear-gradient(180deg,#f5c542,#b7791f)]!" : ""}`}>{CARD_ICONS[card.id]}</span>
      <span className="min-w-0">
        <span className="g-panel-title block text-2xl">{card.title}</span>
        <span className="mt-1 block text-sm leading-snug">{card.text}</span>
        {card.max > 1 && (
          <span className="mt-2 flex gap-1 sm:justify-center" aria-label={`Level ${card.level} of ${card.max}`}>
            {Array.from({ length: card.max }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-4 rounded-full ring-1 ring-[color-mix(in_srgb,currentColor_35%,transparent)] ${i < card.level ? "bg-[var(--accent)]" : i === card.level ? "bg-amber-500" : "bg-transparent"}`}
              />
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
