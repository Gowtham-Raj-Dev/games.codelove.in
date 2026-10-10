"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleHelp, Home, Play, RotateCcw } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { BigButton, createRecords, createStore, GameRoot, HowToPlay, LoadingScreen, Modal, SoftButton, useRecords, useShortcuts } from "../shared/ui";
import { NightHeistGame, type Hud, type Phase, type Result } from "./engine";
import { LEVELS } from "./levels";
import { GAME } from "./manifest";
import { runBot } from "./bot";
import { Briefing, CaseFiles, HudOverlay, isUnlocked, ResultCard, Toasts, TouchControls, type Records, type Toast } from "./screens";

const records = createRecords("night-heist:v1", { cases: {} as Records, last: 0, runs: 0 });

export function NightHeist({ sizes }: { sizes: Record<string, number> }) {
  // Model sizes never change: keep the first object so a re-render doesn't rebuild the game.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<NightHeistGame | null>(null);
  const [hud] = useState(() => createStore<Hud | null>(null));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(Result & { best: boolean }) | null>(null);
  const [help, setHelp] = useState(false);
  const [selected, setSelected] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [touch, setTouch] = useState(false);
  const saved = useRecords(records);
  const toastId = useRef(0);

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

  const pushToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "bad" ? 4200 : 2800);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new NightHeistGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      toast: pushToast,
      result: (r) => {
        const before = records.get();
        const prev = before.cases[r.level];
        let best = false;
        const cases = { ...before.cases };
        if (r.escaped) {
          best = !prev || r.stars > prev.stars || (r.stars === prev.stars && r.time < prev.time) || r.value > prev.value;
          cases[r.level] = {
            stars: Math.max(prev?.stars ?? 0, r.stars),
            time: Math.min(prev?.time ?? Infinity, r.time),
            value: Math.max(prev?.value ?? 0, r.value),
            loot: Math.max(prev?.loot ?? 0, r.loot),
            clean: (prev?.clean ?? false) || !r.alarm,
          };
        }
        records.set({ cases, runs: before.runs + 1 });
        setResult({ ...r, best });
      },
    });
    gameRef.current = game;
    // DEBUG (temporary): test hook.
    (window as unknown as { __nh?: NightHeistGame; __nhBot?: unknown }).__nh = game;
    (window as unknown as { __nhBot?: unknown }).__nhBot = (i: number, o?: Parameters<typeof runBot>[2]) => runBot(game, i, o);
    void game.load(modelSizes);
    return () => {
      gameRef.current = null;
      game.dispose();
    };
  }, [hud, modelSizes, pushToast]);

  // Show the last case played behind the menu once loaded.
  useEffect(() => {
    if (phase === "menu") gameRef.current?.preview(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "menu"]);

  const blur = () => (document.activeElement as HTMLElement | null)?.blur();

  const openCase = (i: number) => {
    setSelected(i);
    records.set({ last: i });
    gameRef.current?.briefing(i);
  };

  const start = (i = selected) => {
    blur();
    setResult(null);
    setHelp(false);
    setToasts([]);
    setSelected(i);
    gameRef.current?.start(i);
  };

  const toMenu = () => {
    setResult(null);
    setToasts([]);
    gameRef.current?.toMenu();
  };

  const pauseOrResume = () => {
    const game = gameRef.current;
    blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (phase === "playing") game?.pause();
    else if (phase === "paused") game?.resume();
    else if (phase === "briefing") toMenu();
  };

  const openHelp = () => {
    if (phase === "playing") gameRef.current?.pause();
    setHelp(true);
  };

  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  // Enter confirms on menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (help || e.ctrlKey || e.metaKey || e.altKey) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (e.key !== "Enter" || onButton) return;
      if (phase === "briefing") start();
      else if (phase === "paused") gameRef.current?.resume();
      else if (phase === "menu") openCase(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Leaving the tab pauses the heist.
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

  const running = phase === "playing" || phase === "paused";
  const next = result ? result.level + 1 : 0;
  const nextOpen = !!result && next < LEVELS.length && isUnlocked(next, records.get().cases);

  return (
    <GameRoot game={GAME} className="bg-[#06070c]">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Night Heist game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !help && <CaseFiles records={saved.cases} onPick={openCase} onHelp={() => setHelp(true)} />}

      {phase === "briefing" && !help && <Briefing index={selected} record={saved.cases[selected]} onStart={() => start()} onBack={toMenu} touch={touch} />}

      {running && <HudOverlay store={hud} onPause={pauseOrResume} onMap={() => gameRef.current?.toggleOverview()} touch={touch} />}
      {running && <Toasts toasts={toasts} />}
      {phase === "playing" && touch && <TouchControls game={gameRef} store={hud} />}

      {phase === "paused" && !help && (
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
            <SoftButton onClick={toMenu} icon={<Home className="size-4" />}>
              Cases
            </SoftButton>
          </div>
        </Modal>
      )}

      {phase === "result" && result && !help && (
        <ResultCard result={result} best={result.best} nextOpen={nextOpen} onNext={() => openCase(next)} onRetry={() => start(result.level)} onMenu={toMenu} />
      )}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}
