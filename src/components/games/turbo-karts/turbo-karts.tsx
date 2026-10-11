"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, CircleHelp, Coins, Flag, Gamepad2, Globe, Home, Lock, LogOut, Medal, Play, RotateCcw, ShoppingBag, Timer, Trophy, Users } from "lucide-react";
import type { LoadProgress } from "../shared/assets";
import { inPlayables, onPointerControlsChange, playablesFirstFrame, playablesLifecycle, playablesCloud, playablesReady, playablesScore, pointerControls, usePlayables } from "../shared/playables";
import { ControlsButton, ControlsEditor } from "../shared/touch-layout";
import {
  BigButton,
  createStore,
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
} from "../shared/ui";
import { CLASSES, ordinal, TurboKartsGame, type Hud, type Mode, type Phase, type RaceResult } from "./engine";
import { CUP_COINS, raceCoins, skinIndex } from "./garage";
import { formatTime, HudOverlay, TouchControls, TouchFace, touchControls, touchIds } from "./hud";
import { DRIVERS, GAME } from "./manifest";
import { KartNet, MAX_PLAYERS, PLAYER_COLORS, type Link, type RoomView } from "./online";
import { CoinBank, OnlinePanel, ShopPanel, type ShopTab } from "./panels";
import { cupBest, ownsCup, ownsDriver, records, tuneOf, type Saved } from "./records";
import { cupOfTrack, CUPS, TRACKS } from "./tracks";

/** The cup the menu's choice needs: the cup itself, or the one a Time Trial circuit belongs to. */
const neededCup = (saved: Saved) => CUPS[saved.mode === "cup" ? saved.cup : cupOfTrack(saved.ttTrack)] ?? CUPS[0];

const EMPTY_HUD: Hud = {
  place: 5,
  racers: 5,
  lap: 1,
  laps: 3,
  time: 0,
  lapTime: 0,
  lastLap: null,
  bestLap: null,
  item: null,
  itemCount: 0,
  rolling: false,
  coins: 0,
  speed: 0,
  drift: 0,
  boost: false,
  shield: false,
  countdown: null,
  wrongWay: false,
  toast: null,
  toastId: 0,
  order: [],
  track: 0,
  race: 0,
  mode: "cup",
};

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyE",
  "KeyK",
  "KeyQ",
  "Enter",
  "NumpadEnter",
]);

/** Touch devices (or the first touch) get on-screen controls, with the gas held down for them. */
const touchInput = (() => {
  let seen = false;
  return {
    subscribe(fn: () => void) {
      const onPointer = (e: PointerEvent) => {
        if (e.pointerType === "touch" && !seen) {
          seen = true;
          fn();
        }
      };
      window.addEventListener("pointerdown", onPointer);
      const offKeyboard = onPointerControlsChange(fn);
      return () => {
        window.removeEventListener("pointerdown", onPointer);
        offKeyboard();
      };
    },
    // YouTube Playables: the on-screen controls also serve a mouse (until a key is pressed).
    get: () => seen || pointerControls() || window.matchMedia("(pointer: coarse)").matches,
    server: () => false,
  };
})();

const TROPHY_TONE = ["", "text-yellow-300", "text-slate-200", "text-orange-400"];

interface ShownResult extends RaceResult {
  newLap: boolean;
  newRace: boolean;
  /** Coins this race put in the bank. */
  payout: number;
}

/** A room code from an invite link (?room=ABCDE). */
const inviteFromUrl = () => {
  // YouTube Playables has no online rooms: nothing may leave the bundle.
  if (typeof window === "undefined" || inPlayables()) return "";
  const code = (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === 5 ? code : "";
};

/** Trophies won: every cup at every class counts once (the score YouTube shows). */
const trophies = (saved: Saved) => CUPS.reduce((n, _, cup) => n + CLASSES.filter((__, cls) => cupBest(saved, cup, cls) === 1).length, 0);

/** A grid order every player in the room works out the same way: shuffled by the race's seed. */
const gridHash = (id: string, seed: number) => {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h ^ id.charCodeAt(i), 2654435761) >>> 0) ^ (h >>> 13);
  return h >>> 0;
};

export function TurboKarts({ sizes }: { sizes: Record<string, number> }) {
  // A page re-render passes a new sizes object; keep the first so the game isn't rebuilt.
  const [modelSizes] = useState(sizes);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<TurboKartsGame | null>(null);
  const gameRef = useRef<TurboKartsGame | null>(null);
  const [hud] = useState(() => createStore<Hud>(EMPTY_HUD));
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShownResult | null>(null);
  const [help, setHelp] = useState(false);
  const [editing, setEditing] = useState(false);
  const [invite] = useState(inviteFromUrl);
  /** Menu overlays: the garage, or the online rooms. */
  const [view, setView] = useState<"main" | "garage" | "online">(invite ? "online" : "main");
  const [shopTab, setShopTab] = useState<ShopTab>("karts");
  const netRef = useRef<KartNet | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const [links, setLinks] = useState<Map<string, Link>>(() => new Map());
  const [netBusy, setNetBusy] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  /** This player's id in the room. */
  const [meId, setMeId] = useState("");
  /** The round this player is racing (or sat out, having joined after the start). */
  const racedRound = useRef(-1);
  const [waiting, setWaiting] = useState(false);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const touch = useSyncExternalStore(touchInput.subscribe, touchInput.get, touchInput.server);
  const saved = useRecords(records);
  const autoGas = saved.autoGas ?? touch;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = new TurboKartsGame(canvas, {
      progress: setProgress,
      phase: setPhase,
      hud: hud.set,
      error: setError,
      result: (r) => {
        const before = records.get();
        const id = TRACKS[r.track].id;
        let newLap = false;
        let newRace = false;
        const patch: Partial<typeof before> = { races_run: before.races_run + 1 };
        let payout = raceCoins(r.place, r.coins);
        if (r.mode === "time") {
          if (r.bestLap > 0 && (!before.laps[id] || r.bestLap < before.laps[id])) {
            newLap = true;
            patch.laps = { ...before.laps, [id]: r.bestLap };
          }
          if (!before.races[id] || r.time < before.races[id]) {
            newRace = true;
            patch.races = { ...before.races, [id]: r.time };
          }
          // No rivals to beat: a small fee for the run, more for a record.
          payout = 5 + r.coins + (newLap ? 10 : 0) + (newRace ? 10 : 0);
        } else if (r.mode === "cup" && r.cupOver) {
          const place = r.cup.find((s) => s.player)?.place ?? 5;
          const key = `${r.cupIndex}:${before.cls}`;
          if (!cupBest(before, r.cupIndex, before.cls) || place < cupBest(before, r.cupIndex, before.cls)) {
            patch.cups = { ...before.cups, [key]: place };
            const won = trophies({ ...before, cups: patch.cups });
            if (won > trophies(before)) playablesScore(won);
          }
          payout += CUP_COINS[place - 1] ?? 0;
        } else if (r.mode === "online") {
          // The host closes the race for the whole room and lines up the next circuit.
          const net = netRef.current;
          if (net?.isHost) {
            void net
              .finish(
                r.standings.map((s) => ({ id: s.id, name: s.name, place: s.place, time: s.time ?? 0 })),
                (r.track + 1) % TRACKS.length,
              )
              .catch(() => {});
          }
        }
        patch.coins = before.coins + payout;
        records.set(patch);
        setResult({ ...r, newLap, newRace, payout });
      },
    }, { visibility: !inPlayables() });
    gameRef.current = g;
    setGame(g);
    playablesFirstFrame();
    const stopLifecycle = playablesLifecycle(
      () => {
        g.releaseAll();
        g.pause();
        g.setSuspended(true);
      },
      () => g.setSuspended(false),
    );
    // The models don't depend on the save: they load while YouTube's cloud save is on its way.
    g.setDriver(records.get().driver);
    void g.load(modelSizes);
    void playablesCloud((cloud) => {
      records.hydrate(cloud as Partial<Saved>);
      // YouTube shows the best score it was sent: keep it in step with the save.
      playablesScore(trophies(records.get()));
      if (gameRef.current === g) g.setDriver(records.get().driver);
    });
    return () => {
      stopLifecycle();
      gameRef.current = null;
      g.dispose();
      void netRef.current?.close();
      netRef.current = null;
    };
  }, [hud, modelSizes]);

  // The garage follows the chosen kart: its upgrades, and the paint job in use.
  const driverKey = (DRIVERS[saved.driver] ?? DRIVERS[0]).key;
  const tune = tuneOf(saved, driverKey);
  const tuneKey = tune.join(",");
  useEffect(() => {
    game?.setGarage(tuneOf(records.get(), driverKey), skinIndex(saved.skin));
  }, [game, driverKey, tuneKey, saved.skin]);

  // --- Online ---------------------------------------------------------------------------------------

  const myself = useCallback(() => {
    const r = records.get();
    const driver = ownsDriver(r, DRIVERS[r.driver] ?? DRIVERS[0]) ? r.driver : 0;
    return { name: r.name.trim() || `Racer ${Math.floor(10 + Math.random() * 90)}`, driver, skin: skinIndex(r.skin) };
  }, []);

  // A race starts when the room says so; it is over for everyone when the room is back in the lobby.
  const applyRoom = useCallback((room: RoomView) => {
    const g = gameRef.current;
    const net = netRef.current;
    if (!g || !net) return;
    g.netRoster(room.members.map((m) => m.id));
    if (room.state === "play" && racedRound.current !== room.round) {
      racedRound.current = room.round;
      // Joined after the lights went out: sit this one out.
      if (net.now() > room.start + 4000) {
        setWaiting(true);
        return;
      }
      setWaiting(false);
      setResult(null);
      setHelp(false);
      setLeaveAsk(false);
      (document.activeElement as HTMLElement | null)?.blur();
      const players = [...room.members]
        .sort((a, b) => gridHash(a.id, room.seed) - gridHash(b.id, room.seed) || a.id.localeCompare(b.id))
        .map((m) => ({ id: m.id, name: m.name, driver: m.driver, skin: m.skin, color: PLAYER_COLORS[m.color] ?? PLAYER_COLORS[0] }));
      g.startOnline({
        track: Math.min(TRACKS.length - 1, Math.max(0, room.track)),
        cls: Math.min(CLASSES.length - 1, Math.max(0, room.cls)),
        me: net.me,
        players,
        start: room.start,
        clock: () => net.now(),
        send: (state) => net.sendState(state),
        event: (e) => net.sendEvent(e),
      });
    } else if (room.state === "lobby") {
      setWaiting(false);
      g.endOnline();
    }
  }, []);

  /** Opens the connection (once) and runs a room action on it. */
  const connect = useCallback(async (action: (net: KartNet) => Promise<string | null>) => {
    setNetBusy(true);
    setNetError(null);
    try {
      let net = netRef.current;
      if (!net) {
        net = await KartNet.open();
        netRef.current = net;
        setMeId(net.me);
        net.handlers.room = (next, why) => {
          roomRef.current = next;
          setRoom(next ? { ...next } : null);
          if (next) applyRoom(next);
          else {
            setNetError(why ?? null);
            setLinks(new Map());
          }
        };
        net.handlers.state = (id, s) => gameRef.current?.netState(id, s);
        net.handlers.event = (id, e) => gameRef.current?.netEvent(id, e);
        net.handlers.link = () => setLinks(new Map(netRef.current?.links));
      }
      const failed = await action(net);
      if (failed) setNetError(failed);
    } catch (err) {
      console.warn("[karts] online", err);
      setNetError("Couldn't connect — check your internet and try again.");
    } finally {
      setNetBusy(false);
    }
  }, [applyRoom]);

  const leaveRoom = useCallback(() => {
    setLeaveAsk(false);
    setWaiting(false);
    racedRound.current = -1;
    void netRef.current?.leave();
    roomRef.current = null;
    setRoom(null);
    setLinks(new Map());
    if (gameRef.current?.isOnline) {
      setResult(null);
      gameRef.current.toMenu();
    }
  }, []);

  // Host duties: public rooms start by themselves, and a race nobody can close is closed on a timer.
  const hostNow = !!room && room.host === meId;
  const roomState = room?.state;
  const roomPub = room?.pub;
  const roomCount = room?.members.length ?? 0;
  const roomRound = room?.round ?? 0;
  useEffect(() => {
    if (!hostNow || !roomState) return;
    const net = netRef.current;
    if (!net) return;
    if (roomState === "lobby" && roomPub && roomCount >= 2) {
      const id = window.setTimeout(() => {
        const r = roomRef.current;
        if (r && r.state === "lobby") void net.start(r.track, r.cls).catch(() => {});
      }, roomCount >= MAX_PLAYERS ? 5000 : 12000);
      return () => window.clearTimeout(id);
    }
    if (roomState === "play") {
      const id = window.setTimeout(() => {
        const r = roomRef.current;
        if (r && r.state === "play" && r.round === roomRound) void net.finish([], (r.track + 1) % TRACKS.length).catch(() => {});
      }, 5 * 60_000);
      return () => window.clearTimeout(id);
    }
  }, [hostNow, roomState, roomPub, roomCount, roomRound]);

  // The others see the kart and paint you have on now.
  const inRoom = !!room;
  useEffect(() => {
    const mine = ownsDriver(records.get(), DRIVERS[saved.driver] ?? DRIVERS[0]) ? saved.driver : 0;
    if (inRoom) void netRef.current?.setMe({ driver: mine, skin: skinIndex(saved.skin) }).catch(() => {});
  }, [inRoom, saved.driver, saved.skin, saved.cars]);

  useEffect(() => {
    game?.setAutoGas(touch && autoGas);
  }, [game, touch, autoGas]);

  useEffect(() => {
    if (phase === "menu") playablesReady();
  }, [phase]);

  const start = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    (document.activeElement as HTMLElement | null)?.blur();
    const r = records.get();
    if (!ownsDriver(r, DRIVERS[r.driver] ?? DRIVERS[0]) || !ownsCup(r, neededCup(r))) return;
    setResult(null);
    setHelp(false);
    if (r.mode === "cup") g.startCup(r.driver, r.cls, r.cup);
    else g.startTimeTrial(r.driver, r.cls, r.ttTrack);
  }, []);

  const next = () => {
    setResult(null);
    gameRef.current?.nextRace();
  };
  const retry = () => {
    setResult(null);
    setHelp(false);
    gameRef.current?.restartRace();
  };
  const podium = () => {
    gameRef.current?.showPodium();
  };
  const toMenu = () => {
    setResult(null);
    setHelp(false);
    gameRef.current?.toMenu();
  };
  /** After an online race: back to the room for the next one. */
  const toRoom = () => {
    toMenu();
    setView("online");
  };

  const racing = phase === "racing" || phase === "countdown" || phase === "intro" || phase === "finished";
  const pauseOrResume = () => {
    const g = gameRef.current;
    (document.activeElement as HTMLElement | null)?.blur();
    if (help) {
      setHelp(false);
      return;
    }
    if (editing) {
      setEditing(false);
      return;
    }
    // An online race keeps running: the button only asks whether to leave.
    if (g?.isOnline) {
      setLeaveAsk((v) => !v);
      return;
    }
    if (racing) g?.pause();
    else if (phase === "paused") g?.resume();
  };
  const openHelp = () => {
    if (racing) gameRef.current?.pause();
    setHelp(true);
  };
  useShortcuts({ onPause: pauseOrResume, onHelp: openHelp });

  const changeDriver = (dir: number) => {
    const nextDriver = (records.get().driver + dir + DRIVERS.length) % DRIVERS.length;
    records.set({ driver: nextDriver });
    gameRef.current?.setDriver(nextDriver);
  };

  // Game keys go to the engine while racing; Enter / arrows drive the menus.
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || e.ctrlKey || e.metaKey || e.altKey || help || editing) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      const confirm = e.code === "Enter" || e.code === "NumpadEnter";
      if (phase === "intro" && (confirm || e.code === "Space")) {
        e.preventDefault();
        g.skipIntro();
        return;
      }
      if (racing) {
        if (GAME_CODES.has(e.code)) {
          e.preventDefault();
          g.key(e.code, true);
        }
      } else if (phase === "paused") {
        if (confirm && !onButton) {
          e.preventDefault();
          g.resume();
        }
      } else if (phase === "menu") {
        if (view !== "main") return;
        if (confirm && !onButton) {
          e.preventDefault();
          start();
        } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
          e.preventDefault();
          changeDriver(e.code === "ArrowLeft" ? -1 : 1);
        }
      } else if (phase === "results" && result && confirm && !onButton) {
        e.preventDefault();
        if (result.mode === "online") toRoom();
        else if (result.mode === "cup" && result.cupOver) podium();
        else if (result.mode === "cup") next();
        else retry();
      } else if (phase === "podium" && confirm && !onButton) {
        e.preventDefault();
        toMenu();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (GAME_CODES.has(e.code)) gameRef.current?.key(e.code, false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  });

  // Leaving the tab or window pauses the race (YouTube pauses through its own SDK instead).
  useEffect(() => {
    if (inPlayables()) return;
    const pause = () => {
      gameRef.current?.releaseAll();
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

  const track = TRACKS[hud.get().track] ?? TRACKS[0];
  const showHud = phase === "countdown" || phase === "racing" || phase === "finished" || phase === "paused";

  return (
    <GameRoot
      game={GAME}
      className="bg-[#101010]"
      onPointerDown={() => {
        if (phase === "intro") gameRef.current?.skipIntro();
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label="Turbo Karts game" />

      <LoadingScreen game={GAME} progress={progress} error={error} ready={phase !== "loading" && phase !== "error"} />

      {phase === "menu" && !editing && view !== "online" && (
        <MenuScreen
          game={game}
          onStart={start}
          onHelp={() => setHelp(true)}
          onControls={() => setEditing(true)}
          onDriver={changeDriver}
          onGarage={(tab) => {
            setShopTab(tab);
            setView("garage");
          }}
          onOnline={() => setView("online")}
          inRoom={!!room}
          touch={touch}
        />
      )}
      {phase === "menu" && !editing && !help && view === "garage" && (
        <ShopPanel
          key={shopTab}
          tab={shopTab}
          onDriver={(index) => {
            records.set({ driver: index });
            gameRef.current?.setDriver(index);
          }}
          onClose={() => setView("main")}
        />
      )}
      {phase === "menu" && !editing && !help && view === "online" && (
        <OnlinePanel
          room={room}
          me={meId}
          links={links}
          busy={netBusy}
          error={netError}
          invite={invite}
          waiting={waiting}
          onQuick={() => void connect((net) => net.quick(myself()).then(() => null))}
          onCreate={() => {
            const r = records.get();
            void connect((net) => net.create(false, myself(), r.mode === "time" ? r.ttTrack : (CUPS[r.cup] ?? CUPS[0]).tracks[0], r.cls).then(() => null));
          }}
          onJoin={(code) => void connect((net) => net.join(code, myself()))}
          onLeave={leaveRoom}
          onStart={() => {
            const r = roomRef.current;
            if (r) void netRef.current?.start(r.track, r.cls).catch(() => setNetError("Couldn't start the race — try again."));
          }}
          onSettings={(track, cls) => void netRef.current?.settings(track, cls).catch(() => {})}
          onClose={() => setView("main")}
        />
      )}
      {/* Controls editor from the title screen: the HUD shows behind it so controls keep clear of it. */}
      {phase === "menu" && editing && <HudOverlay store={hud} game={game} paused={false} onPause={() => {}} touch={touch} trackName={track.name} />}

      {phase === "intro" && <IntroCard trackIndex={hud.get().track} race={hud.get().race} mode={hud.get().mode} cup={saved.cup} />}

      {showHud && <HudOverlay store={hud} game={game} paused={phase === "paused"} onPause={pauseOrResume} touch={touch} trackName={track.name} />}
      {touch && (phase === "racing" || phase === "countdown") && <TouchControls game={game} autoGas={autoGas} />}
      {phase === "racing" && saved.races_run < 2 && !touch && <ControlsHint />}

      {phase === "paused" && !help && !editing && (
        <Modal title="Paused">
          <BigButton onClick={pauseOrResume} icon={<Play className="size-5 fill-current" />} autoFocus>
            Resume
          </BigButton>
          <div className="grid grid-cols-3 gap-2">
            <SoftButton onClick={retry} icon={<RotateCcw className="size-4" />}>
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
            <SoftButton onClick={() => records.set({ autoGas: !autoGas })} active={autoGas}>
              Auto-accelerate: {autoGas ? "on" : "off"}
            </SoftButton>
          )}
          {touch && (
            <SoftButton onClick={() => setEditing(true)} icon={<Gamepad2 className="size-4" />}>
              Edit controls
            </SoftButton>
          )}
        </Modal>
      )}
      {(phase === "paused" || phase === "menu") && editing && <ControlsEditor controls={touchControls} active={touchIds(autoGas)} face={(id, p) => <TouchFace id={id} at={p} />} onClose={() => setEditing(false)} />}

      {leaveAsk && game?.isOnline && phase !== "results" && (
        <Modal title="Leave race?">
          <p className="g-muted -mt-2 text-center text-sm">The race keeps going for the others.</p>
          <BigButton onClick={() => setLeaveAsk(false)} icon={<Play className="size-5 fill-current" />} autoFocus>
            Keep racing
          </BigButton>
          <SoftButton onClick={leaveRoom} icon={<LogOut className="size-4" />}>
            Leave room
          </SoftButton>
        </Modal>
      )}

      {phase === "results" && result && !help && result.mode === "online" && <OnlineResults result={result} onRoom={toRoom} onLeave={leaveRoom} />}
      {phase === "results" && result && !help && result.mode !== "online" && <ResultsPanel result={result} onNext={next} onRetry={retry} onPodium={podium} onMenu={toMenu} />}

      {phase === "podium" && result && !help && <PodiumPanel result={result} onMenu={toMenu} onAgain={start} />}

      {help && <HowToPlay game={GAME} onClose={() => setHelp(false)} />}
    </GameRoot>
  );
}

// --- Menu -------------------------------------------------------------------------------------------

/** One of the driver card's three bars: the label over five steps. */
function Bars({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] leading-none font-bold tracking-wide uppercase opacity-70">{label}</p>
      <span className="mt-1 flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-1.5 flex-1 -skew-x-12 ${i <= value ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,currentColor_15%,transparent)]"}`} />
        ))}
      </span>
    </div>
  );
}

/**
 * The title screen's panel. Everything fits without scrolling: one column on a desktop and on a phone
 * held upright, two columns (race settings | driver and start) on a phone held sideways.
 */
function MenuScreen({
  game,
  onStart,
  onHelp,
  onControls,
  onDriver,
  onGarage,
  onOnline,
  inRoom,
  touch,
}: {
  game: TurboKartsGame | null;
  onStart: () => void;
  onHelp: () => void;
  onControls: () => void;
  onDriver: (dir: number) => void;
  onGarage: (tab: ShopTab) => void;
  onOnline: () => void;
  /** Already in an online room (the button goes back to it). */
  inRoom: boolean;
  touch: boolean;
}) {
  const saved = useRecords(records);
  const youtube = usePlayables();
  const driver = DRIVERS[saved.driver] ?? DRIVERS[0];
  const owned = ownsDriver(saved, driver);
  const stage = neededCup(saved);
  const stageOwned = ownsCup(saved, stage);
  const cup = saved.mode === "cup";
  const cupDef = CUPS[saved.cup] ?? CUPS[0];
  const setMode = (mode: "cup" | "time") => {
    records.set({ mode });
    game?.previewTrack(mode === "time" ? saved.ttTrack : cupDef.tracks[0]);
  };
  const setCup = (i: number) => {
    records.set({ cup: i });
    game?.previewTrack(CUPS[i].tracks[0]);
  };
  const stepTrack = (dir: number) => {
    const i = (saved.ttTrack + dir + TRACKS.length) % TRACKS.length;
    records.set({ ttTrack: i });
    game?.previewTrack(i);
  };
  /** What is in the way of the start: the kart first, then the cup. Bought on the spot. */
  const locked = !owned ? { what: driver.name, cost: driver.cost ?? 0 } : !stageOwned ? { what: stage.name, cost: stage.cost } : null;
  const unlock = () => {
    const r = records.get();
    if (!locked || r.coins < locked.cost) return;
    if (!owned) records.set({ coins: r.coins - locked.cost, cars: [...r.cars, driver.key] });
    else records.set({ coins: r.coins - locked.cost, stages: [...r.stages, stage.id] });
  };
  const tt = TRACKS[saved.ttTrack] ?? TRACKS[0];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5 land:absolute land:top-0 land:right-0 land:p-2">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-end">
        <div className="px-4 pt-1 text-center lg:hidden land:hidden">
          <GameTitle game={GAME} size="sm" />
        </div>
        <div className="flex-1 lg:hidden" />

        <div className="g-panel pointer-events-auto mx-auto mb-[max(env(safe-area-inset-bottom),8px)] max-h-full w-[calc(100%-16px)] max-w-md overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:mx-0 lg:mb-5 lg:ml-5 lg:w-[400px] land:mb-[max(env(safe-area-inset-bottom),6px)] land:max-w-3xl land:p-2.5">
          <div className="mb-2 hidden lg:block">
            <GameTitle game={GAME} size="sm" />
          </div>

          <div className="grid grid-cols-1 gap-2 land:grid-cols-2 land:items-end land:gap-3">
            {/* The race: mode, speed class, cup or circuit. */}
            <div className="min-w-0 space-y-2">
              <div className="flex items-stretch gap-2">
                <CoinBank coins={saved.coins} />
                <div className={`grid flex-1 gap-2 ${youtube ? "" : "grid-cols-2"}`}>
                  <SoftButton onClick={() => onGarage("karts")} icon={<ShoppingBag className="size-4" />}>
                    Shop
                  </SoftButton>
                  {/* No online rooms in YouTube Playables: nothing may leave the bundle. */}
                  {!youtube && (
                    <SoftButton onClick={onOnline} active={inRoom} icon={inRoom ? <Users className="size-4" /> : <Globe className="size-4" />}>
                      {inRoom ? "My room" : "Online"}
                    </SoftButton>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SoftButton onClick={() => setMode("cup")} active={cup} icon={<Trophy className="size-4" />}>
                  Cup
                </SoftButton>
                <SoftButton onClick={() => setMode("time")} active={!cup} icon={<Timer className="size-4" />}>
                  Time Trial
                </SoftButton>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {CLASSES.map((c, i) => (
                  <SoftButton key={c.name} onClick={() => records.set({ cls: i })} active={saved.cls === i}>
                    {c.name}
                    {cup && cupBest(saved, saved.cup, i) > 0 && cupBest(saved, saved.cup, i) <= 3 && <Medal className={`size-3.5 ${TROPHY_TONE[cupBest(saved, saved.cup, i)]}`} />}
                  </SoftButton>
                ))}
              </div>

              {cup ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {CUPS.map((c, i) => (
                      <SoftButton key={c.id} onClick={() => setCup(i)} active={saved.cup === i}>
                        {c.name.replace(" Cup", "")}
                        {!ownsCup(saved, c) && <Lock className="size-3.5 opacity-80" />}
                      </SoftButton>
                    ))}
                  </div>
                  <p className="g-muted truncate text-[11px] leading-tight" title={cupDef.tracks.map((t) => TRACKS[t].name).join(", ")}>
                    {cupDef.tracks.map((t) => TRACKS[t].name).join(" · ")}
                  </p>
                </>
              ) : (
                <>
                  <div className="g-tint flex items-center gap-1 px-1 py-1">
                    <IconButton onClick={() => stepTrack(-1)} label="Previous circuit" plain>
                      <ChevronLeft className="size-5" />
                    </IconButton>
                    <div className="min-w-0 flex-1 text-center">
                      <p className="g-display flex items-center justify-center gap-1.5 text-base leading-tight italic">
                        <span className="truncate">{tt.name}</span>
                        {!stageOwned && <Lock className="size-3.5 shrink-0 opacity-80" />}
                      </p>
                      <p className="text-[10px] leading-tight tabular-nums opacity-75">
                        {saved.ttTrack + 1}/{TRACKS.length} · Lap {formatTime(saved.laps[tt.id] ?? null)} · Race {formatTime(saved.races[tt.id] ?? null)}
                      </p>
                    </div>
                    <IconButton onClick={() => stepTrack(1)} label="Next circuit" plain>
                      <ChevronRight className="size-5" />
                    </IconButton>
                  </div>
                  <p className="g-muted truncate text-[11px] leading-tight" title={tt.blurb}>
                    {tt.blurb}
                  </p>
                </>
              )}
            </div>

            {/* The driver and the start. */}
            <div className="min-w-0 space-y-2">
              <div className="g-tint px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <IconButton onClick={() => onDriver(-1)} label="Previous driver" plain>
                    <ChevronLeft className="size-5" />
                  </IconButton>
                  <div className="min-w-0 text-center">
                    <p className="g-display flex items-center justify-center gap-2 text-xl leading-tight italic">
                      <span className="size-3 shrink-0 rounded-full ring-2 ring-black/50" style={{ background: driver.color }} />
                      <span className="truncate">{driver.name}</span>
                      {!owned && <Lock className="size-4 shrink-0 opacity-80" />}
                    </p>
                    <p className="text-[10px] leading-tight font-bold tracking-[0.18em] uppercase opacity-60">
                      Kart {saved.driver + 1}/{DRIVERS.length}
                    </p>
                  </div>
                  <IconButton onClick={() => onDriver(1)} label="Next driver" plain>
                    <ChevronRight className="size-5" />
                  </IconButton>
                </div>
                <div className="mt-1 flex gap-3">
                  <Bars label="Speed" value={driver.speed} />
                  <Bars label="Accel" value={driver.accel} />
                  <Bars label="Handling" value={driver.handling} />
                </div>
              </div>

              {locked ? (
                <BigButton onClick={unlock} disabled={saved.coins < locked.cost} icon={<Coins className="size-6" />}>
                  Unlock · {locked.cost}
                </BigButton>
              ) : (
                <BigButton onClick={onStart} icon={<Flag className="size-6" />} autoFocus>
                  {cup ? "Start cup" : "Start trial"}
                </BigButton>
              )}
              <p className="g-muted hidden text-center text-[11px] leading-tight lg:block [@media(max-height:680px)]:hidden">
                {touch ? "On-screen pedals and steering" : "W/↑ gas · A D / ← → steer · Space drift · E item · Q look back"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntroCard({ trackIndex, race, mode, cup }: { trackIndex: number; race: number; mode: Mode; cup: number }) {
  const t = TRACKS[trackIndex] ?? TRACKS[0];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center px-4">
      <div className="g-panel max-w-lg animate-[game-fade_0.4s_ease] px-6 py-4 text-center">
        <p className="g-display text-xs text-[var(--accent)]">{mode === "cup" ? `${(CUPS[cup] ?? CUPS[0]).name} · Race ${race + 1} of ${(CUPS[cup] ?? CUPS[0]).tracks.length}` : "Time Trial"}</p>
        <h2 className="g-title mt-1 text-4xl sm:text-6xl">{t.name}</h2>
        <p className="g-muted mt-2 text-sm">{t.blurb}</p>
        <p className="mt-3 text-[11px] font-bold tracking-widest uppercase opacity-60">Enter / tap to skip</p>
      </div>
    </div>
  );
}

function ControlsHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 flex animate-[game-fade_0.4s_ease] justify-center px-4 lg:bottom-8">
      <p className="g-hud px-4 py-2 text-center text-sm font-bold">Hold Space while turning to drift · E uses items · Q looks back</p>
    </div>
  );
}

// --- Results ----------------------------------------------------------------------------------------

function Standings({ result, cup }: { result: RaceResult; cup: boolean }) {
  const rows = cup ? result.cup : result.standings;
  return (
    <ol className="space-y-1">
      {rows.map((s) => {
        return (
          <li
            key={s.id}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm italic ${s.player ? "bg-[var(--accent)] font-bold text-black" : "g-tint"}`}
          >
            <span className="g-display w-8 tabular-nums">{ordinal(s.place)}</span>
            <span className="size-3 shrink-0 rounded-full ring-1 ring-black/40" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate font-bold">
              {s.name}
              {s.player && <span className="ml-1 text-xs opacity-75">(you)</span>}
            </span>
            {cup ? (
              <span className="tabular-nums">
                <span className="mr-2 text-xs opacity-70">+{s.points}</span>
                <span className="g-display">{s.total}</span>
              </span>
            ) : (
              <span className="text-xs tabular-nums">{s.time === null ? "DNF" : formatTime(s.time)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ResultsPanel({
  result,
  onNext,
  onRetry,
  onPodium,
  onMenu,
}: {
  result: ShownResult;
  onNext: () => void;
  onRetry: () => void;
  onPodium: () => void;
  onMenu: () => void;
}) {
  const cup = result.mode === "cup";
  const [tab, setTab] = useState<"race" | "cup">("race");
  const title = cup ? (result.place === 1 ? "Victory!" : `${ordinal(result.place)} place`) : "Finish!";
  return (
    <Modal title={title} wide>
      <p className="g-muted -mt-2 text-center text-xs font-bold tracking-widest uppercase">
        {TRACKS[result.track].name}
        {cup ? ` · Race ${result.race + 1} of ${CUPS[result.cupIndex].tracks.length}` : " · Time Trial"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Time" value={formatTime(result.time)} />
        <Stat label="Best lap" value={formatTime(result.bestLap)} />
        <Stat label={cup ? "Points" : "Laps"} value={cup ? `+${result.standings.find((s) => s.player)?.points ?? 0}` : result.lapTimes.length} />
      </div>
      <Payout coins={result.payout} />
      {(result.newLap || result.newRace) && (
        <p className="mx-auto flex w-fit items-center gap-1.5 bg-amber-400 px-3 py-1 text-xs font-black tracking-wider text-amber-950 uppercase">
          <Trophy className="size-3.5" /> {result.newRace && result.newLap ? "New lap & race records" : result.newRace ? "New race record" : "New lap record"}
        </p>
      )}
      {cup ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SoftButton onClick={() => setTab("race")} active={tab === "race"}>
              This race
            </SoftButton>
            <SoftButton onClick={() => setTab("cup")} active={tab === "cup"}>
              Cup standings
            </SoftButton>
          </div>
          <Standings result={result} cup={tab === "cup"} />
        </>
      ) : (
        <ol className="space-y-1">
          {result.lapTimes.map((t, i) => (
            <li key={i} className={`g-tint flex justify-between px-3 py-1.5 text-sm tabular-nums ${t === result.bestLap ? "font-bold text-[var(--accent)]" : ""}`}>
              <span>Lap {i + 1}</span>
              <span>{formatTime(t)}</span>
            </li>
          ))}
        </ol>
      )}
      {cup && result.cupOver ? (
        <BigButton onClick={onPodium} icon={<Trophy className="size-6" />} autoFocus>
          Podium
        </BigButton>
      ) : cup ? (
        <BigButton onClick={onNext} icon={<Flag className="size-6" />} autoFocus>
          Next race
        </BigButton>
      ) : (
        <BigButton onClick={onRetry} icon={<RotateCcw className="size-6" />} autoFocus>
          Try again
        </BigButton>
      )}
      <div className="grid grid-cols-2 gap-2">
        {cup && (
          <SoftButton onClick={onRetry} icon={<RotateCcw className="size-4" />}>
            Retry race
          </SoftButton>
        )}
        <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
          Menu
        </SoftButton>
      </div>
    </Modal>
  );
}

function Payout({ coins }: { coins: number }) {
  return (
    <p className="mx-auto flex w-fit items-center gap-1.5 text-sm font-black">
      <Coins className="size-4 text-amber-400" /> +{coins} coins
    </p>
  );
}

/** After an online race: everyone's place, then back to the room for the next one. */
function OnlineResults({ result, onRoom, onLeave }: { result: ShownResult; onRoom: () => void; onLeave: () => void }) {
  const title = result.place === 1 && result.standings.length > 1 ? "You win!" : `${ordinal(result.place)} place`;
  return (
    <Modal title={title} wide>
      <p className="g-muted -mt-2 text-center text-xs font-bold tracking-widest uppercase">{TRACKS[result.track].name} · Online race</p>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Time" value={result.standings.find((s) => s.player)?.time == null ? "DNF" : formatTime(result.time)} />
        <Stat label="Best lap" value={formatTime(result.bestLap || null)} />
      </div>
      <Payout coins={result.payout} />
      <Standings result={result} cup={false} />
      <BigButton onClick={onRoom} icon={<Users className="size-6" />} autoFocus>
        Back to room
      </BigButton>
      <SoftButton onClick={onLeave} icon={<LogOut className="size-4" />}>
        Leave room
      </SoftButton>
    </Modal>
  );
}

function PodiumPanel({ result, onMenu, onAgain }: { result: ShownResult; onMenu: () => void; onAgain: () => void }) {
  const me = result.cup.find((s) => s.player);
  const place = me?.place ?? 5;
  const label = place === 1 ? "Gold cup!" : place === 2 ? "Silver cup!" : place === 3 ? "Bronze cup!" : `${ordinal(place)} overall`;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:inset-y-0 lg:right-6 lg:left-auto lg:items-center lg:p-0">
      <div className="g-panel pointer-events-auto w-full max-w-md space-y-3 p-5 lg:w-[400px]">
        <div className="text-center">
          <Trophy className={`mx-auto size-10 ${TROPHY_TONE[place] ?? "opacity-40"}`} />
          <h2 className="g-panel-title mt-1 text-3xl sm:text-4xl">{label}</h2>
          <p className="g-muted text-xs font-bold tracking-widest uppercase">{CUPS[result.cupIndex].name} · final standings</p>
        </div>
        <Standings result={result} cup />
        <div className="grid grid-cols-2 gap-2">
          <SoftButton onClick={onAgain} icon={<RotateCcw className="size-4" />}>
            Race again
          </SoftButton>
          <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
            Menu
          </SoftButton>
        </div>
      </div>
    </div>
  );
}
