"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadProgress } from "../shared/assets";
import { audio } from "../shared/audio";
import { useNativeBack, useNativeLifecycle } from "../shared/native-app";
import { createRecords, createStore, GameRoot, HowToPlay, LoadingScreen, usePhoneLandscape, useRecords, useShortcuts, useStore } from "../shared/ui";
import type { BKind } from "./data";
import { KingdomEngine, type BattleHud, type BattleResult, type Mode, type Quality, type VillageHud } from "./engine";
import { ArmyPanel, BattleBar, BottomBar, BuildingPanel, Campaign, LayoutEditor, NameDialog, PauseModal, PlacingBar, ResultModal, SettingsPanel, Shop, Toasts, TopBar, TutorialHint } from "./hud";
import { villageName } from "./layouts";
import { GAME } from "./manifest";
import { BuildingDetails } from "./details";
import { MOBILE_CSS, MobileBattleHud, MobileBottomBar, MobileBuildingBar, MobilePlacingBar, MobileTopBar, MobileTutorialHint } from "./mobile-hud";
import { soundtrack } from "./soundtrack";
import * as V from "./village";

const records = createRecords<{ save: V.Save | null }>("kingdom-clash:v1", { save: null });
/** Device preferences (not part of the village save). v2: everyone starts in HD (full screen sharpness). */
const prefs = createRecords<{ quality: Quality }>("kingdom-clash:prefs:v2", { quality: "hd" });

type Panel = null | "shop" | "army" | "lab" | "spells" | "campaign" | "settings" | "rename";

const KEY_DIRS: Record<string, string> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
  z: "zoomIn",
  "+": "zoomIn",
  "=": "zoomIn",
  x: "zoomOut",
  "-": "zoomOut",
};

export function KingdomClash({ sizes }: { sizes: Record<string, number> }) {
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<KingdomEngine | null>(null);
  const [hudStore] = useState(() => createStore<VillageHud | null>(null));
  const [battleStore] = useState(() => createStore<BattleHud | null>(null));
  const hud = useStore(hudStore);
  const battle = useStore(battleStore);
  const [mode, setMode] = useState<Mode>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [help, setHelp] = useState(false);
  /** The full building popup, for the building selected when it opened. */
  const [details, setDetailsFor] = useState<{ id: number; mode: "info" | "upgrade" } | null>(null);
  const [paused, setPaused] = useState(false);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [toasts, setToasts] = useState<{ id: number; text: string; tone: string }[]>([]);
  const toastId = useRef(0);
  // Phones held sideways and the Android app get their own layout (mobile-hud.tsx).
  const phone = usePhoneLandscape();
  const { quality } = useRecords(prefs);

  const toast = useCallback((text: string, tone = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const engine = new KingdomEngine(
      canvas,
      overlay,
      {
        progress: setProgress,
        mode: setMode,
        hud: hudStore.set,
        battle: battleStore.set,
        result: setResult,
        toast,
        error: setError,
        icons: setIcons,
      },
      { get: () => records.get().save, set: (save) => records.set({ save }) },
    );
    engineRef.current = engine;
    engine.setQuality(prefs.get().quality);
    // Console access for testing in development only.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __kc?: KingdomEngine }).__kc = engine;
    void engine.load(modelSizes);
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [hudStore, battleStore, modelSizes, toast]);

  const e = () => engineRef.current;
  const selectedId = hud?.selected?.id ?? null;
  // Selecting another building (or none) closes the popup of the previous one.
  const detailsOpen = !!details && details.id === selectedId && mode === "village";
  const setDetails = (m: "info" | "upgrade" | null) => setDetailsFor(m && selectedId !== null ? { id: selectedId, mode: m } : null);
  const modalOpen = panel !== null || help || detailsOpen || !!result || paused || (mode === "village" && !!hud && !hud.name);

  useEffect(() => {
    e()?.setUiBusy(modalOpen);
  }, [modalOpen]);

  useEffect(() => {
    e()?.setQuality(quality);
  }, [quality]);

  // Raiders on the way or the campaign open: have the battle music ready.
  const raidSoon = !!hud && hud.raidIn >= 0 && hud.raidIn <= 45;
  useEffect(() => {
    if (panel === "campaign" || raidSoon) soundtrack.preload("battle");
  }, [panel, raidSoon]);

  // Tutorial steps follow what you have done.
  useEffect(() => {
    const engine = e();
    if (!engine || !hud || mode !== "village") return;
    const s = engine.save;
    if (hud.tutorial === 1 && V.countOf(s, "goldmine") > 0) engine.setTutorial(2);
    else if (hud.tutorial === 2 && V.countOf(s, "elixirpump") > 0) engine.setTutorial(3);
    else if (hud.tutorial === 3 && hud.army + hud.queued >= 5) engine.setTutorial(4);
  }, [hud, mode]);

  const closeAll = () => {
    setPanel(null);
    setHelp(false);
    setDetails(null);
  };

  const onPause = () => {
    const engine = e();
    if (help) return setHelp(false);
    if (panel) return setPanel(null);
    if (detailsOpen) return setDetails(null);
    if (mode === "village") {
      if (hud?.placing) engine?.cancelPlacing();
      else if (hud?.selected) engine?.select(null);
      else if (hud?.editing) engine?.cancelLayout();
      return;
    }
    if (mode === "raid" || mode === "defence") {
      if (result) return;
      const next = !paused;
      setPaused(next);
      engine?.pauseBattle(next);
    }
  };

  useShortcuts({ onPause, onHelp: () => setHelp((h) => !h) });

  // Android app: the back button closes what is open, deselects or pauses a battle; with nothing
  // left to close the app asks to press back again to exit.
  useNativeBack(() => {
    const engine = e();
    if (help || panel || detailsOpen) {
      closeAll();
      return true;
    }
    if (mode === "village" && hud?.name) {
      if (hud.placing) engine?.cancelPlacing();
      else if (hud.selected) engine?.select(null);
      else if (hud.editing) engine?.cancelLayout();
      else return false;
      return true;
    }
    if (mode === "raid" || mode === "defence") {
      if (result) {
        setResult(null);
        setPaused(false);
        engine?.returnHome();
      } else {
        setPaused(!paused);
        engine?.pauseBattle(!paused);
      }
      return true;
    }
    return false;
  });

  // Android app in the background: silence it and pause a running battle.
  useNativeLifecycle((background) => {
    audio.hold(background);
    soundtrack.hold(background);
    if (background && (mode === "raid" || mode === "defence") && !result) {
      setPaused(true);
      engineRef.current?.pauseBattle(true);
    }
  });

  // Game keys.
  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      const engine = engineRef.current;
      if (!engine) return;
      const k = ev.key.toLowerCase();
      const dir = KEY_DIRS[k];
      if (dir && !panel) {
        if (k.startsWith("arrow")) ev.preventDefault();
        engine.setKey(dir, true);
        return;
      }
      if (ev.repeat) return;
      if (mode === "village" && hud?.editing) {
        // Layout editor: Enter places, everything else waits.
        if (k === "enter" && hud.placing) {
          ev.preventDefault();
          engine.confirmPlacing();
        }
      } else if (mode === "village" && !panel && !result && hud?.name) {
        if (k === "b") setPanel("shop");
        else if (k === "t") setPanel("army");
        else if (k === "r") setPanel("campaign");
        else if (k === "u") engine.upgradeSelected();
        else if (k === "c") engine.collectAll();
        else if (k === "e" && !hud.placing) engine.startEditing();
        else if (k === "enter" && hud?.placing) {
          ev.preventDefault();
          engine.confirmPlacing();
        } else return;
        ev.preventDefault();
      } else if ((mode === "raid" || mode === "defence") && !result && !paused) {
        if (/^[0-9]$/.test(k)) {
          engine.pickSlotIndex(k === "0" ? 9 : Number(k) - 1);
          ev.preventDefault();
        } else if (k === " ") {
          ev.preventDefault();
          engine.setSpeed(battle?.speed === 1 ? 2 : battle?.speed === 2 ? 3 : 1);
        } else if (k === "enter" && battle?.online && !battle.started) {
          ev.preventDefault();
          engine.nextOnline();
        }
      }
    };
    const up = (ev: KeyboardEvent) => {
      const dir = KEY_DIRS[ev.key.toLowerCase()];
      if (dir) engineRef.current?.setKey(dir, false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // Leaving the tab pauses a battle.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && (mode === "raid" || mode === "defence") && !result) {
        setPaused(true);
        engineRef.current?.pauseBattle(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mode, result]);

  const save = hud?.save;
  const inBattle = (mode === "raid" || mode === "defence") && !!battle;

  const startRaid = () => setPanel("campaign");
  const onSlot = (id: string) => e()?.pickSlot(id);
  const onEnd = () => e()?.endBattle();
  const onBattlePause = () => {
    setPaused(true);
    e()?.pauseBattle(true);
  };
  const onSpeed = () => e()?.setSpeed(battle?.speed === 1 ? 2 : battle?.speed === 2 ? 3 : 1);
  const onNext = () => e()?.nextOnline();
  const building = hud?.selected;
  const buildingIcon = building && building.kind !== "obstacle" ? icons[`b:${building.kind}`] : undefined;

  return (
    <GameRoot game={GAME} className="bg-[#8fc7e8]" safeArea="manual">
      <style>{`@keyframes kc-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}} @media (pointer:coarse){.kc-hide-sm{display:none}} ${MOBILE_CSS}`}</style>
      {/* The village fills the whole screen, under a notch too; the HUD stays in .g-safe beside it. */}
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Kingdom Clash village" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0 overflow-hidden" />

      {/* Stays on top until the village is ready, then fades out over it. */}
      <LoadingScreen game={GAME} progress={progress} error={error} ready={mode !== "loading" && mode !== "error"} />

      <div className="g-safe">
        {mode === "village" && hud && save && hud.editing && (
          <LayoutEditor
            hud={hud}
            icons={icons}
            onSave={() => e()?.saveLayout()}
            onCancel={() => e()?.cancelLayout()}
            onStoreAll={() => e()?.storeAll()}
            onStore={() => e()?.storeSelected()}
            onPlace={(k) => e()?.placeFromTray(k)}
            onConfirm={() => e()?.confirmPlacing()}
            onCancelPlace={() => e()?.cancelPlacing()}
            onRow={() => e()?.wallRow()}
          />
        )}
        {mode === "village" &&
          hud &&
          save &&
          !hud.editing &&
          (phone ? (
            <>
              <MobileTopBar hud={hud} onSettings={() => setPanel("settings")} onDefend={() => e()?.defendNow()} onEdit={() => e()?.startEditing()} />
              {hud.placing ? (
                <MobilePlacingBar hud={hud} onConfirm={() => e()?.confirmPlacing()} onCancel={() => e()?.cancelPlacing()} onRow={() => e()?.wallRow()} />
              ) : building ? (
                <MobileBuildingBar
                  key={building.id}
                  info={building}
                  hud={hud}
                  onDetails={setDetails}
                  onUpgrade={() => e()?.upgradeSelected()}
                  onFinish={() => e()?.finishSelected()}
                  onCollect={() => e()?.collectAll()}
                  onPanel={(p) => setPanel(p)}
                  onWalls={() => e()?.upgradeWallRow()}
                  onBuy={(res, amount, gems) => e()?.buyResource(res, amount, gems)}
                  onHeal={() => e()?.healSelectedHero()}
                />
              ) : (
                hud.name && <MobileTutorialHint step={hud.tutorial} onDismiss={() => e()?.setTutorial(7)} />
              )}
              <MobileBottomBar hud={hud} tutorial={hud.tutorial} onRaid={startRaid} onShop={() => setPanel("shop")} onArmy={() => setPanel("army")} />
            </>
          ) : (
            <>
              <TopBar hud={hud} onSettings={() => setPanel("settings")} onHelp={() => setHelp(true)} onDefend={() => e()?.defendNow()} onEdit={() => e()?.startEditing()} />
              {hud.placing ? (
                <PlacingBar hud={hud} onConfirm={() => e()?.confirmPlacing()} onCancel={() => e()?.cancelPlacing()} onRow={() => e()?.wallRow()} />
              ) : building ? (
                <BuildingPanel
                  info={building}
                  hud={hud}
                  icon={buildingIcon}
                  onUpgrade={() => e()?.upgradeSelected()}
                  onFinish={() => e()?.finishSelected()}
                  onCollect={() => e()?.collectAll()}
                  onPanel={(p) => setPanel(p)}
                  onWalls={() => e()?.upgradeWallRow()}
                  onClose={() => e()?.select(null)}
                  onBuy={(res, amount, gems) => e()?.buyResource(res, amount, gems)}
                  onHeal={() => e()?.healSelectedHero()}
                  onDetails={() => setDetails("info")}
                />
              ) : (
                hud.name && <TutorialHint step={hud.tutorial} onDismiss={() => e()?.setTutorial(7)} />
              )}
              <BottomBar hud={hud} tutorial={hud.tutorial} onRaid={startRaid} onShop={() => setPanel("shop")} onArmy={() => setPanel("army")} />
            </>
          ))}
        {inBattle &&
          battle &&
          !result &&
          (phone ? (
            <MobileBattleHud b={battle} icons={icons} onSlot={onSlot} onEnd={onEnd} onPause={onBattlePause} onSpeed={onSpeed} onNext={onNext} />
          ) : (
            <BattleBar b={battle} icons={icons} onSlot={onSlot} onEnd={onEnd} onPause={onBattlePause} onSpeed={onSpeed} onNext={onNext} />
          ))}
        <Toasts items={toasts} />
      </div>

      {mode === "village" && hud && save && (
        <>
          {detailsOpen && building && (
            <BuildingDetails
              info={building}
              hud={hud}
              mode={details.mode}
              portraits={(kind, levels) => e()?.portraits(kind, levels) ?? Promise.resolve({})}
              onUpgrade={() => e()?.upgradeSelected()}
              onBuy={(res, amount, gems) => e()?.buyResource(res, amount, gems)}
              onClose={() => setDetails(null)}
            />
          )}
          {panel === "shop" && (
            <Shop
              save={save}
              icons={icons}
              onBuy={(k: BKind) => {
                closeAll();
                e()?.startPlacing(k);
              }}
              onClose={closeAll}
            />
          )}
          {(panel === "army" || panel === "lab" || panel === "spells") && (
            <ArmyPanel
              key={panel}
              save={save}
              hud={hud}
              icons={icons}
              initial={panel}
              onTrain={(k) => e()?.train(k)}
              onUntrain={(k) => e()?.untrain(k)}
              onBrew={(k) => e()?.brew(k)}
              onUnbrew={(k) => e()?.unbrew(k)}
              onResearch={(k) => e()?.research(k)}
              onFinishTraining={() => e()?.finishTraining()}
              onFinishBrewing={() => e()?.finishBrewing()}
              onFinishResearch={() => e()?.finishResearch()}
              onClose={closeAll}
            />
          )}
          {panel === "campaign" && (
            <Campaign
              save={save}
              hud={hud}
              onAttack={(n) => {
                closeAll();
                e()?.startRaid(n);
              }}
              onOnline={() => {
                closeAll();
                e()?.startOnline();
              }}
              onClose={closeAll}
            />
          )}
          {panel === "settings" && (
            <SettingsPanel
              save={save}
              quality={quality}
              onQuality={(q) => prefs.set({ quality: q })}
              onHelp={() => {
                setPanel(null);
                setHelp(true);
              }}
              onRename={() => setPanel("rename")}
              onReset={() => {
                e()?.resetVillage();
                closeAll();
              }}
              onClose={closeAll}
            />
          )}
          {panel === "rename" && (
            <NameDialog
              title="Rename village"
              initial={hud.name}
              suggest={() => villageName()}
              onDone={(n) => {
                e()?.setName(n);
                closeAll();
              }}
              onClose={closeAll}
            />
          )}
          {!hud.name && <NameDialog initial={villageName()} suggest={() => villageName()} onDone={(n) => e()?.setName(n)} />}
        </>
      )}

      {paused && inBattle && !result && (
        <PauseModal
          onResume={() => {
            setPaused(false);
            e()?.pauseBattle(false);
          }}
          onEnd={() => {
            setPaused(false);
            e()?.pauseBattle(false);
            e()?.endBattle();
          }}
        />
      )}
      {result && (
        <ResultModal
          r={result}
          icons={icons}
          onHome={() => {
            setResult(null);
            setPaused(false);
            e()?.returnHome();
          }}
        />
      )}
      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}
