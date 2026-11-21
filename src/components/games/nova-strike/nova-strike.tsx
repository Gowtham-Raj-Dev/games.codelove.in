"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CircleHelp, Gamepad2, Home, Map as MapIcon, Play, Rocket, RotateCcw, Trophy, Warehouse } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { music } from "../shared/music";
import { inPlayables, playablesCloud, playablesFirstFrame, playablesLifecycle, playablesReady, playablesSave, playablesScore, usePointerControls } from "../shared/playables";
import { ControlsButton } from "../shared/touch-layout";
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
  usePhoneLandscape,
  useRecords,
  useShortcuts,
  useTouchScreen,
} from "../shared/ui";
import { cleanSave, DEFAULT_SAVE, findShip, findSkin, findUpgrade, isOwned, loadoutOf, nextMission, ownedKey, upgradePrice, type Loadout, type Save, type ShopKind } from "./content";
import { NovaStrikeGame, type FailInfo, type Hud, type Phase, type StageResult } from "./engine";
import { Hangar } from "./hangar";
import { ControlsEditor, CreditIcon, HudOverlay, Medal, MEDAL_COLORS, NovaStyles, Scanlines, TouchControls } from "./hud";
import { GAME } from "./manifest";
import { MissionMap, TYPE_ICONS } from "./missions";
import { clearReward, MEDAL_NAMES, medalTarget, MISSION_LABEL, MISSIONS_PER_SECTOR, SECTORS, stageCode, STAGES } from "./stages";

// Progress (medals, best scores, credits, the hangar) is kept in this browser — in YouTube Playables, in YouTube's cloud save.
// Whatever is read back is checked by cleanSave() before it is used.
const records = createRecords<Save>("nova-strike:v2", DEFAULT_SAVE, { cloud: inPlayables() ? playablesSave : undefined });

const currentSave = () => cleanSave(records.get());

/** Changes the save: the patch is applied to the checked copy, and the whole of it is written back. */
function updateSave(patch: (save: Save) => Partial<Save>) {
  const save = currentSave();
  records.set({ ...save, ...patch(save) });
}

/** Every medal earned, three per mission at most (the score YouTube shows). */
const totalMedals = (save: Save) => save.medals.reduce((a, b) => a + b, 0);

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
  maxLocks: 4,
  laser: 1,
  stage: 0,
  progress: 0,
  checkpoint: -1,
  boss: null,
  banner: null,
  danger: false,
  hurt: 0,
  bombFlash: 0,
  credits: 0,
};

const GAME_KEYS = new Set(["Space", "KeyJ", "KeyQ", "KeyE", "KeyB", "KeyC", "KeyX", "ShiftLeft", "ShiftRight", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

type Results = StageResult & { earned: number; newBest: boolean };

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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
  /** The mission being briefed or flown. */
  const [stage, setStage] = useState(0);
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState<FailInfo | null>(null);
  const [help, setHelp] = useState(false);
  const [map, setMap] = useState(false);
  const [sector, setSector] = useState(0);
  const [hangar, setHangar] = useState<{ tab: ShopKind; selected: string } | null>(null);
  const [editing, setEditing] = useState(false);
  // YouTube Playables: the on-screen controls also serve a mouse (until a key is pressed).
  const pointerControls = usePointerControls();
  const touch = useTouchScreen() || pointerControls;
  const raw = useRecords(records);
  const save = useMemo(() => cleanSave(raw), [raw]);
  const autoFire = save.autoFire ?? touch;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new NovaStrikeGame(
      canvas,
      {
        progress: setProgress,
        phase: (p) => {
          setPhase(p);
          if (p === "briefing" || p === "playing") setStage(gameRef.current?.stageNumber ?? 0);
        },
        hud: hud.set,
        error: setError,
        results: (r) => {
          const before = currentSave();
          const earned = r.salvage + r.reward;
          const medals = [...before.medals];
          const best = [...before.best];
          const newBest = r.score > best[r.stage];
          medals[r.stage] = Math.max(medals[r.stage], r.medal);
          best[r.stage] = Math.max(best[r.stage], r.score);
          records.set({ ...before, medals, best, credits: before.credits + earned, kills: before.kills + r.kills, plays: before.plays + 1 });
          playablesScore(totalMedals(currentSave()));
          setResults({ ...r, earned, newBest });
        },
        over: (info) => {
          // The credits picked up before the last ship went down are kept.
          updateSave((s) => ({ credits: s.credits + info.salvage, kills: s.kills + info.kills, plays: s.plays + 1 }));
          setFailed(info);
        },
      },
      { visibility: !inPlayables() },
    );
    const apply = () => {
      const s = currentSave();
      g.setLoadout(loadoutOf(s));
      g.setHome(nextMission(s));
    };
    apply();
    gameRef.current = g;
    setGame(g);
    playablesFirstFrame();
    const stopLifecycle = playablesLifecycle(
      () => {
        g.pause();
        g.setSuspended(true);
      },
      () => g.setSuspended(false),
    );
    void (async () => {
      // YouTube: the cloud save comes first (briefly — a slow answer is applied when it arrives).
      await playablesCloud((cloud) => {
        records.hydrate(cloud as Partial<Save>);
        apply();
        // YouTube shows the best score it was sent: keep it in step with the save.
        playablesScore(totalMedals(currentSave()));
      });
      if (gameRef.current === g) void g.load(modelSizes);
    })();
    // For scripts/check-nova-strike.mjs (the dev server only).
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __novaStrike: { game: g, records, audio, music } });
    return () => {
      stopLifecycle();
      gameRef.current = null;
      g.dispose();
    };
  }, [hud, modelSizes]);

  useEffect(() => {
    if (phase === "menu") playablesReady();
  }, [phase]);

  // Settings and the loadout follow the save; in the hangar, the picked ship or paint job is shown instead.
  useEffect(() => {
    game?.setOptions({ invertY: save.invertY, autoFire });
  }, [game, save.invertY, autoFire]);

  const preview = useMemo<Loadout>(() => {
    const own = loadoutOf(save);
    if (!hangar) return own;
    if (hangar.tab === "ship") return { ...own, ship: findShip(hangar.selected).id };
    if (hangar.tab === "skin") return { ...own, skin: findSkin(hangar.selected).id };
    return own;
  }, [save, hangar]);
  useEffect(() => {
    game?.setLoadout(preview);
  }, [game, preview]);

  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  const clearCards = useCallback(() => {
    setResults(null);
    setFailed(null);
    setMap(false);
    setHangar(null);
    setHelp(false);
    gameRef.current?.setShowcase(false);
  }, []);

  /** Opens a mission's briefing. */
  const brief = useCallback(
    (i: number) => {
      blur();
      clearCards();
      gameRef.current?.brief(i);
    },
    [clearCards],
  );

  /** Launches the mission that is briefed — or flies the one just flown again. */
  const launch = useCallback(() => {
    blur();
    clearCards();
    gameRef.current?.launch();
  }, [clearCards]);

  /** The mission map, on the sector of the mission just flown (or of the next one to play). */
  const toMap = useCallback(
    (at?: number) => {
      const g = gameRef.current;
      const i = at ?? nextMission(currentSave());
      clearCards();
      if (g && g.currentPhase !== "menu") g.toMenu(i);
      setSector(STAGES[i]?.sector ?? 0);
      setMap(true);
    },
    [clearCards],
  );

  const openHangar = useCallback(() => {
    blur();
    setHelp(false);
    setMap(false);
    setHangar({ tab: "ship", selected: currentSave().ship });
  }, []);

  const closeHangar = useCallback(() => {
    setHangar(null);
    gameRef.current?.setShowcase(false);
  }, []);

  const onHangarLayout = useCallback((shift: { x: number; y: number }) => gameRef.current?.setShowcase(true, shift), []);

  const buy = (kind: ShopKind, id: string) => {
    updateSave((s) => {
      if (kind === "upgrade") {
        const u = findUpgrade(id);
        const price = upgradePrice(s, u);
        if (price === null || price > s.credits) return {};
        return { credits: s.credits - price, upgrades: { ...s.upgrades, [u.id]: (s.upgrades[u.id] ?? 0) + 1 } };
      }
      const item = kind === "ship" ? findShip(id) : findSkin(id);
      if (item.id !== id || isOwned(s, kind, item) || item.price > s.credits) return {};
      // A new ship or paint job goes straight on.
      return { credits: s.credits - item.price, owned: [...s.owned, ownedKey(kind, item.id)], ...(kind === "ship" ? { ship: item.id } : { skin: item.id }) };
    });
    gameRef.current?.sfx.pickup();
  };

  const equip = (kind: "ship" | "skin", id: string) => {
    updateSave((s) => {
      const item = kind === "ship" ? findShip(id) : findSkin(id);
      if (item.id !== id || !isOwned(s, kind, item)) return {};
      return kind === "ship" ? { ship: item.id } : { skin: item.id };
    });
    gameRef.current?.sfx.ui();
  };

  const pauseOrResume = useCallback(() => {
    const g = gameRef.current;
    blur();
    if (help) setHelp(false);
    else if (editing) setEditing(false);
    else if (phase === "playing") g?.pause();
    else if (phase === "paused") g?.resume();
    else if (phase === "briefing") toMap(g?.stageNumber);
  }, [help, editing, phase, toMap]);

  const openHelp = useCallback(() => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  }, [phase]);

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  const overlay = help || editing || !!hangar;
  const next = nextMission(save);

  // Game keys while flying; Enter / Space confirm on the menus.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || e.metaKey || e.altKey || overlay) return;
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
      if (phase === "menu" && !map) brief(next);
      else if (phase === "briefing") launch();
      else if (phase === "results" && results) {
        if (results.last) toMap(results.stage);
        else brief(results.stage + 1);
      } else if (phase === "over") launch();
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

  // Leaving the tab or window pauses the flight (YouTube pauses through its own SDK instead).
  useEffect(() => {
    if (inPlayables()) return;
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
    if (e.pointerType !== "mouse" || phase !== "playing" || pointerControls) return;
    const last = lastMouse.current;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    if (!last || Math.hypot(e.clientX - last.x, e.clientY - last.y) < 2) return;
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return;
    gameRef.current?.mouseMove(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };

  const flying = phase === "playing" || phase === "paused";
  const ready = phase !== "loading" && phase !== "error";

  return (
    <GameRoot game={GAME} className="bg-[#05040f]" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove}>
      <NovaStyles />
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Nova Strike game" />
      {ready && <Scanlines />}

      <LoadingScreen game={GAME} progress={progress} error={error} ready={ready} />

      {phase === "menu" && !map && !hangar && !editing && (
        <TitleScreen save={save} next={next} touch={touch} onPlay={() => brief(next)} onMap={() => toMap()} onHangar={openHangar} onHelp={() => setHelp(true)} onControls={() => setEditing(true)} />
      )}

      {phase === "menu" && map && !hangar && <MissionMap save={save} sector={sector} onSector={setSector} onPlay={brief} onClose={() => setMap(false)} />}

      {phase === "briefing" && !hangar && (
        <Briefing stage={stage} save={save} touch={touch} onLaunch={launch} onBack={() => toMap(stage)} onHangar={openHangar} onHelp={() => setHelp(true)} />
      )}

      {(flying || editing) && <HudOverlay store={hud} touch={touch} paused={phase === "paused"} onPause={pauseOrResume} />}
      {phase === "playing" && touch && <TouchControls game={game} store={hud} hidden={editing} />}
      {phase === "playing" && !touch && save.plays < 3 && <ControlsHint />}

      {phase === "paused" && !overlay && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={launch} icon={<RotateCcw className="size-4" />}>
              Restart
            </SoftButton>
            <SoftButton onClick={() => setHelp(true)} icon={<CircleHelp className="size-4" />}>
              Help
            </SoftButton>
            <SoftButton onClick={() => toMap(stage)} icon={<Home className="size-4" />}>
              Quit
            </SoftButton>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => updateSave((s) => ({ autoFire: !(s.autoFire ?? touch) }))} active={autoFire}>
              Auto fire: {autoFire ? "On" : "Off"}
            </SoftButton>
            <SoftButton onClick={() => updateSave((s) => ({ invertY: !s.invertY }))} active={save.invertY}>
              Invert Y: {save.invertY ? "On" : "Off"}
            </SoftButton>
          </div>
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
        </Modal>
      )}

      {phase === "results" && results && !overlay && (
        <ResultsCard r={results} onNext={() => brief(results.stage + 1)} onRetry={launch} onHangar={openHangar} onMap={() => toMap(results.stage)} />
      )}

      {phase === "over" && failed && !overlay && <FailCard info={failed} onRetry={launch} onHangar={openHangar} onMap={() => toMap(failed.stage)} />}

      {hangar && (
        <Hangar
          save={save}
          tab={hangar.tab}
          selected={hangar.selected}
          onTab={(tab) => setHangar({ tab, selected: tab === "ship" ? save.ship : tab === "skin" ? save.skin : "hull" })}
          onSelect={(selected) => setHangar((h) => h && { ...h, selected })}
          onBuy={buy}
          onEquip={equip}
          onClose={closeHangar}
          onLayout={onHangarLayout}
        />
      )}

      {editing && <ControlsEditor store={hud} onClose={() => setEditing(false)} />}
      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Screens -------------------------------------------------------------------------------------

function TitleScreen({
  save,
  next,
  touch,
  onPlay,
  onMap,
  onHangar,
  onHelp,
  onControls,
}: {
  save: Save;
  next: number;
  touch: boolean;
  onPlay: () => void;
  onMap: () => void;
  onHangar: () => void;
  onHelp: () => void;
  onControls: () => void;
}) {
  const landscape = usePhoneLandscape();
  const stage = STAGES[next];
  const cleared = save.medals.filter((n) => n > 0).length;
  const started = cleared > 0;
  const done = cleared === STAGES.length;
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col overflow-y-auto">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5 land:p-2">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="px-4 pt-2 text-center sm:px-8 sm:pt-4 sm:text-left land:px-5 land:pt-0 land:text-left">
        <GameTitle game={GAME} size={landscape ? "sm" : "lg"} />
        <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-bold tabular-nums sm:justify-start land:mt-2 land:justify-start">
          <span className="g-hud inline-flex items-center gap-1.5 px-2.5 py-1.5" data-title-credits>
            <CreditIcon /> {formatNumber(save.credits)}
          </span>
          <span className="g-hud inline-flex items-center gap-1.5 px-2.5 py-1.5">
            <Medal tier={3} size="xs" /> {totalMedals(save)}/{STAGES.length * 3}
          </span>
          <span className="g-hud inline-flex items-center gap-1.5 px-2.5 py-1.5">
            <Rocket className="size-3.5" /> {cleared}/{STAGES.length}
          </span>
        </p>
      </div>

      <div className="min-h-4 flex-1" />

      <div className="pointer-events-auto mx-auto w-full max-w-sm px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:mx-0 sm:px-8 sm:pb-8 land:mx-0 land:max-w-xs land:px-5 land:pb-3">
        <Panel className="space-y-3 p-4 land:space-y-2 land:p-2.5">
          <p className="g-display truncate text-center text-[10px] leading-relaxed" style={{ color: SECTORS[stage.sector].color }}>
            {done ? "Campaign complete" : `${started ? "Next" : "First"} mission ${stageCode(stage)} · ${stage.name}`}
          </p>
          <BigButton onClick={onPlay} icon={<Play className="size-5 fill-current" />} autoFocus>
            {started ? "Continue" : "Play"}
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={onMap} icon={<MapIcon className="size-4" />}>
              Missions
            </SoftButton>
            <SoftButton onClick={onHangar} icon={<Warehouse className="size-4" />}>
              Hangar
            </SoftButton>
            <SoftButton onClick={onHelp} icon={<CircleHelp className="size-4" />}>
              How to
            </SoftButton>
          </div>
          {!touch && (
            <p className="g-muted hidden text-center text-xs leading-relaxed sm:block">
              <Kbd>WASD</Kbd> fly · <Kbd>Space</Kbd> fire / hold to lock · <Kbd>Q</Kbd>
              <Kbd>E</Kbd> roll · <Kbd>B</Kbd> bomb · <Kbd>Shift</Kbd> boost
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Briefing({ stage, save, touch, onLaunch, onBack, onHangar, onHelp }: { stage: number; save: Save; touch: boolean; onLaunch: () => void; onBack: () => void; onHangar: () => void; onHelp: () => void }) {
  const s = STAGES[stage] ?? STAGES[0];
  const sector = SECTORS[s.sector];
  const Icon = TYPE_ICONS[s.type];
  const medal = save.medals[stage] ?? 0;
  const best = save.best[stage] ?? 0;
  const what = s.type === "rings" ? "rings + targets" : "targets";
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col justify-end overflow-y-auto">
      <div className="pointer-events-auto absolute top-0 right-0 p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5 land:p-2">
        <SystemButtons onHelp={onHelp} />
      </div>
      <div className="pointer-events-auto mx-auto w-full max-w-md animate-[nova-rise_0.4s_ease-out] px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-10 land:max-w-xl land:pb-2">
        <Panel className="space-y-3 p-4 sm:space-y-4 sm:p-5 land:space-y-2 land:p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="g-display flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]" style={{ color: sector.color }}>
                <Icon className="size-3.5" /> {stageCode(s)} · {sector.name} · {MISSION_LABEL[s.type]}
              </p>
              <h2 className="g-panel-title mt-2 text-lg text-[#ecfeff] sm:text-2xl land:mt-1 land:text-base">{s.name}</h2>
            </div>
            <Medal tier={medal} label />
          </div>
          <p className="text-sm leading-relaxed land:line-clamp-2 land:text-xs">{s.brief}</p>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Silver" value={<span className="text-xs">{medalTarget(s, 2)}</span>} />
            <Stat label="Gold" value={<span className="text-xs">{medalTarget(s, 3)}</span>} />
            <Stat label="Best" value={<span className="text-xs">{best ? formatNumber(best) : "—"}</span>} />
            <Stat
              label="Reward"
              value={
                <span className="inline-flex items-center gap-1 text-xs">
                  <CreditIcon className="size-3" /> {clearReward(s, 1)}+
                </span>
              }
            />
          </div>
          <p className="g-muted text-center text-[11px]">
            Medals count the {what} you destroy out of {s.par}
            {s.boss ? ` · Boss: ${s.bossName}` : ""}
          </p>
          <BigButton onClick={onLaunch} icon={<Rocket className="size-5" />} autoFocus>
            Launch
          </BigButton>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={onBack} icon={<MapIcon className="size-4" />}>
              Missions
            </SoftButton>
            <SoftButton onClick={onHangar} icon={<Warehouse className="size-4" />}>
              Hangar
            </SoftButton>
          </div>
          {!touch && (
            <p className="g-muted hidden text-center text-xs sm:block">
              <Kbd>Enter</Kbd> launch · <Kbd>Esc</Kbd> back
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ResultsCard({ r, onNext, onRetry, onHangar, onMap }: { r: Results; onNext: () => void; onRetry: () => void; onHangar: () => void; onMap: () => void }) {
  const s = STAGES[r.stage] ?? STAGES[0];
  const sectorDone = s.mission === MISSIONS_PER_SECTOR - 1;
  return (
    <Modal title={r.last ? "Victory" : sectorDone ? "Sector clear" : "Mission clear"} wide>
      <div className="flex items-center justify-center gap-4">
        <Medal tier={r.medal} size="lg" />
        <div className="min-w-0">
          <p className="g-display text-[10px] text-[var(--accent)]">
            {stageCode(s)} · {r.name}
          </p>
          <p className="g-display mt-2 text-sm" style={{ color: MEDAL_COLORS[r.medal] }} data-medal={r.medal}>
            {MEDAL_NAMES[r.medal]} medal
          </p>
          {r.medal < 3 && (
            <p className="g-muted mt-1 text-[11px]">
              {MEDAL_NAMES[r.medal + 1]} needs {medalTarget(s, r.medal + 1)} of {r.par}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Targets" value={`${Math.min(r.hits, r.par)}/${r.par}`} />
        <Stat label="Accuracy" value={`${Math.round(r.accuracy * 100)}%`} />
        <Stat label="Shield" value={`${Math.round(r.shield * 100)}%`} />
        <Stat label="Time" value={formatTime(r.time)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="g-tint px-2 py-2.5 text-center">
          <p className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">Score{r.newBest ? " · new best" : ""}</p>
          <p className="g-display mt-1 text-base text-[#ecfeff] tabular-nums sm:text-lg">{formatNumber(r.score)}</p>
        </div>
        <div className="g-tint px-2 py-2.5 text-center">
          <p className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">Credits</p>
          <p className="g-display mt-1 inline-flex items-center gap-1.5 text-base text-[#ffd166] tabular-nums sm:text-lg" data-earned={r.earned}>
            <CreditIcon className="size-4" /> +{formatNumber(r.earned)}
          </p>
        </div>
      </div>
      {r.last && <p className="text-center text-sm">The Nova Dreadnought is gone and the armada with it. Every sector is safe — now go back for the gold medals.</p>}
      {r.last ? (
        <BigButton onClick={onMap} icon={<Trophy className="size-5" />} autoFocus>
          Missions
        </BigButton>
      ) : (
        <BigButton onClick={onNext} icon={<Rocket className="size-5" />} autoFocus>
          Next mission
        </BigButton>
      )}
      <div className={`grid gap-2 ${r.last ? "grid-cols-2" : "grid-cols-3"}`}>
        <SoftButton onClick={onRetry} icon={<RotateCcw className="size-4" />}>
          Retry
        </SoftButton>
        <SoftButton onClick={onHangar} icon={<Warehouse className="size-4" />}>
          Hangar
        </SoftButton>
        {!r.last && (
          <SoftButton onClick={onMap} icon={<MapIcon className="size-4" />}>
            Missions
          </SoftButton>
        )}
      </div>
    </Modal>
  );
}

function FailCard({ info, onRetry, onHangar, onMap }: { info: FailInfo; onRetry: () => void; onHangar: () => void; onMap: () => void }) {
  const s = STAGES[info.stage] ?? STAGES[0];
  return (
    <Modal title="Mission failed">
      <p className="g-display text-center text-[10px] text-[var(--accent)]">
        {stageCode(s)} · {s.name}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Flown" value={`${Math.round(info.progress * 100)}%`} />
        <Stat label="Score" value={<span className="text-xs">{formatNumber(info.score)}</span>} />
        <Stat
          label="Credits"
          value={
            <span className="inline-flex items-center gap-1 text-xs text-[#ffd166]" data-kept={info.salvage}>
              <CreditIcon className="size-3" /> +{formatNumber(info.salvage)}
            </span>
          }
        />
      </div>
      <p className="g-muted text-center text-xs leading-relaxed">You keep the credits you picked up. Shield cells and stronger lasers in the hangar make any mission easier.</p>
      <BigButton onClick={onRetry} icon={<RotateCcw className="size-5" />} autoFocus>
        Retry
      </BigButton>
      <div className="grid grid-cols-2 gap-2">
        <SoftButton onClick={onHangar} icon={<Warehouse className="size-4" />}>
          Hangar
        </SoftButton>
        <SoftButton onClick={onMap} icon={<MapIcon className="size-4" />}>
          Missions
        </SoftButton>
      </div>
    </Modal>
  );
}

function ControlsHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[2] flex animate-[nova-hint_7s_ease_forwards] justify-center px-4">
      <p className="g-hud px-4 py-2 text-center text-xs">WASD / mouse fly · Space / click fire, hold to lock on · Q E roll · Shift boost · B bomb</p>
    </div>
  );
}
