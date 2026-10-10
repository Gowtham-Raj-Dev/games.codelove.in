"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Crown, Globe, Loader2, Lock, LogOut, Share2, Swords, Trophy, Users, Wifi, X } from "lucide-react";
import { BigButton, createRecords, Modal, SoftButton, useRecords } from "../shared/ui";
import type { CannonCoveGame, OnlineHud } from "./engine";
import { CoveNet, MAX_PLAYERS, ONLINE_SHIPS, PLAYER_COLORS, type Link, type Result, type RoomView } from "./online";

/** Online battles: pick a name and ship, find or make a room, wait for friends, fight, see who won. */

type GameRef = { readonly current: CannonCoveGame | null };

const profile = createRecords("cannon-cove:online", { name: "", ship: 0 });

const SHIP_BARS: Record<number, [number, number, number]> = { 0: [3, 1, 1], 1: [2, 2, 2], 2: [1, 3, 3] };

export function roomFromUrl() {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("room");
  return code ? code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) : null;
}

function Panel({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-black/45 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-3">
        <div role="dialog" aria-label={title} className="g-panel relative w-full max-w-md space-y-3 p-4 sm:p-5 land:max-w-2xl land:p-3">
          <h2 className="g-panel-title pr-10 text-2xl sm:text-3xl land:text-xl">{title}</h2>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="g-tint absolute top-3 right-3 grid size-8 place-items-center rounded-full hover:brightness-110">
              <X className="size-4" />
            </button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function SmallBtn({ onClick, children, primary = false, disabled = false, title }: { onClick: () => void; children: ReactNode; primary?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${primary ? "g-btn" : "g-soft"} inline-flex shrink-0 items-center justify-center px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:px-2 pointer-coarse:py-1 pointer-coarse:text-xs`}
    >
      <span className="g-unskew gap-1.5">{children}</span>
    </button>
  );
}

const linkText: Record<Link, string> = { connecting: "connecting…", direct: "connected", relay: "connected (slow link)" };

export function OnlinePanel({
  game,
  code: startCode,
  menuOpen,
  onMenuClose,
  onExit,
}: {
  game: GameRef;
  code: string | null;
  menuOpen: boolean;
  onMenuClose: () => void;
  onExit: () => void;
}) {
  const saved = useRecords(profile);
  const [net, setNet] = useState<CoveNet | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [, setLinks] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState(startCode ?? "");
  const [results, setResults] = useState<Result[] | null>(null);
  const [inBattle, setInBattle] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoIn, setAutoIn] = useState<number | null>(null);
  const battle = useRef<number | null>(null);
  const autoAt = useRef(0);
  const finishing = useRef(false);

  const me = () => ({ name: (profile.get().name.trim() || `Captain ${Math.floor(Math.random() * 900 + 100)}`).slice(0, 16), ship: profile.get().ship });

  // Connect once; leave the room (and the database) when the panel closes.
  useEffect(() => {
    let alive = true;
    let opened: CoveNet | null = null;
    const engine = game.current;
    CoveNet.open()
      .then((n) => {
        if (!alive) {
          void n.close();
          return;
        }
        opened = n;
        if (process.env.NODE_ENV !== "production") Object.assign(window, { __coveNet: n });
        n.handlers.state = (id, s) => game.current?.onlineState(id, s);
        n.handlers.event = (id, e) => game.current?.onlineEvent(id, e);
        n.handlers.link = () => setLinks((x) => x + 1);
        n.handlers.room = (r, why) => {
          const g = game.current;
          if (!r) {
            if (battle.current !== null) g?.stopOnline();
            battle.current = null;
            setInBattle(false);
            setRoom(null);
            if (why && why !== "You left the room") setError(why);
            return;
          }
          setRoom(r);
          if (r.state === "play" && battle.current !== r.round && g) {
            // A round has started (or was already running when we joined): sail in.
            const mine = r.members.find((m) => m.id === n.me);
            battle.current = r.round;
            finishing.current = false;
            setResults(null);
            setInBattle(true);
            g.startOnline({
              me: n.me,
              name: mine?.name ?? "You",
              ship: mine?.ship ?? 0,
              color: mine?.color ?? 0,
              start: r.start,
              end: r.end,
              goal: r.goal,
              seed: r.seed,
              peers: r.members,
              now: () => n.now(),
              send: (s) => n.sendState(s),
              emit: (e) => n.sendEvent(e),
            });
          } else if (r.state === "play" && g) g.setOnlinePeers(r.members);
          else if (r.state === "lobby" && battle.current !== null) {
            // The round is over.
            setResults(r.results ?? g?.onlineResults() ?? []);
            g?.stopOnline();
            battle.current = null;
            setInBattle(false);
          }
        };
        setNet(n);
        if (startCode) {
          setBusy("Joining…");
          n.join(startCode, me())
            .then((why) => why && setError(why))
            .catch(() => setError("Couldn't join — check your connection"))
            .finally(() => setBusy(null));
        }
      })
      .catch((err) => {
        console.warn("[cove] online", err);
        if (alive) setFailed("Couldn't reach the online harbour. Check your internet and try again.");
      });
    return () => {
      alive = false;
      if (battle.current !== null) engine?.stopOnline();
      void opened?.close();
    };
    // Connect once per panel; the starting code is only read the first time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // The host keeps time: ends the round when the clock runs out or someone reaches the goal, and
  // starts public rooms by itself once two captains are in.
  useEffect(() => {
    if (!net || !room) return;
    const id = window.setInterval(() => {
      const r = net.room;
      if (!r || !net.isHost) return;
      const now = net.now();
      if (r.state === "play") {
        const scores = game.current?.onlineResults() ?? [];
        if (!finishing.current && (now > r.end + 600 || scores.some((s) => s.k >= r.goal))) {
          finishing.current = true;
          void net.finish(scores);
        }
        return;
      }
      if (r.pub && r.members.length >= 2) {
        if (!autoAt.current) autoAt.current = now + 10_000;
        const left = Math.ceil((autoAt.current - now) / 1000);
        setAutoIn(Math.max(0, left));
        if (left <= 0) {
          autoAt.current = 0;
          setAutoIn(null);
          void net.start(r.goal, r.minutes);
        }
      } else if (autoAt.current) {
        autoAt.current = 0;
        setAutoIn(null);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [net, room, game]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      console.warn("[cove] online", err);
      setError(err instanceof Error ? err.message : "Something went wrong — try again");
    } finally {
      setBusy(null);
    }
  };

  const leave = () => {
    if (battle.current !== null) game.current?.stopOnline();
    battle.current = null;
    setInBattle(false);
    setResults(null);
    onMenuClose();
    void act("Leaving…", async () => net?.leave());
    setRoom(null);
  };

  const share = async () => {
    if (!room) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    const text = `Join my Cannon Cove battle! Room ${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "Cannon Cove", text, url });
      else {
        await navigator.clipboard.writeText(`${text} — ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // Share sheet closed.
    }
  };

  const copy = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked.
    }
  };

  if (failed)
    return (
      <Panel title="Online battle" onClose={onExit}>
        <p className="text-sm">{failed}</p>
        <BigButton onClick={onExit}>OK</BigButton>
      </Panel>
    );

  if (!net)
    return (
      <Panel title="Online battle" onClose={onExit}>
        <p className="g-display flex items-center gap-2 text-base">
          <Loader2 className="size-4 animate-spin" /> Connecting to the online harbour…
        </p>
      </Panel>
    );

  // In battle: only the battle menu and, at the end, the results.
  if (inBattle && room) {
    if (!menuOpen) return null;
    return (
      <Modal title="Battle menu">
        <p className="g-muted text-center text-sm">The battle goes on while this menu is open.</p>
        <BigButton onClick={onMenuClose} icon={<Swords className="size-5" />}>
          Back to the battle
        </BigButton>
        <SoftButton onClick={leave} icon={<LogOut className="size-4" />}>
          Leave the battle
        </SoftButton>
      </Modal>
    );
  }

  if (results && room)
    return (
      <Panel title="Battle over!">
        <ResultsTable results={results} me={net.me} room={room} />
        <div className="grid grid-cols-2 gap-2">
          <SoftButton onClick={leave} icon={<LogOut className="size-4" />}>
            Leave
          </SoftButton>
          <BigButton onClick={() => setResults(null)} icon={<Swords className="size-5" />}>
            Next battle
          </BigButton>
        </div>
      </Panel>
    );

  if (room) {
    const host = room.host === net.me;
    const mine = room.members.find((m) => m.id === net.me);
    return (
      <Panel title={room.pub ? "Public battle" : "Private room"} onClose={leave}>
        <div className="space-y-3 land:grid land:grid-cols-2 land:gap-3 land:space-y-0">
        <div className="space-y-2">
        <div className="g-tint flex flex-wrap items-center justify-between gap-2 rounded-[var(--g-hud-radius)] px-3 py-2">
          <div>
            <p className="g-muted text-[10px] font-bold tracking-wide uppercase">Room code</p>
            <p className="g-display text-3xl leading-none tracking-[0.2em] tabular-nums land:text-2xl">{room.code}</p>
          </div>
          <div className="flex gap-1.5">
            <SmallBtn onClick={copy} title="Copy the code">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
            </SmallBtn>
            <SmallBtn onClick={share} primary title="Send the link to friends">
              <Share2 className="size-4" /> Invite
            </SmallBtn>
          </div>
        </div>
        <ul className="space-y-1">
          {room.members.map((m) => {
            const link = m.id === net.me ? null : (net.links.get(m.id) ?? "connecting");
            return (
              <li key={m.id} className="g-tint flex items-center gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1.5 text-sm pointer-coarse:text-xs">
                <span className="size-3 shrink-0 rounded-full ring-2 ring-black/30" style={{ background: PLAYER_COLORS[m.color % PLAYER_COLORS.length] }} />
                <span className="g-display min-w-0 flex-1 truncate">
                  {m.name}
                  {m.id === net.me && <span className="g-muted text-xs"> (you)</span>}
                </span>
                {m.id === room.host && <Crown className="size-4 text-amber-600" aria-label="Host" />}
                <span className="g-muted text-xs">{ONLINE_SHIPS[m.ship]?.name ?? "Sloop"}</span>
                {link && <span className={`text-[10px] font-bold ${link === "connecting" ? "g-muted" : "text-emerald-800"}`}>{linkText[link]}</span>}
              </li>
            );
          })}
          {room.members.length < MAX_PLAYERS && (
            <li className="g-muted rounded-[var(--g-hud-radius)] border-2 border-dashed border-[color-mix(in_srgb,currentColor_25%,transparent)] px-2.5 py-1.5 text-center text-xs">
              {room.members.length < 2 ? "Waiting for another captain — invite friends with the code" : `Room for ${MAX_PLAYERS - room.members.length} more`}
            </li>
          )}
        </ul>
        </div>
        <div className="space-y-2">
        <ShipPicker value={mine?.ship ?? saved.ship} onPick={(k) => {
          profile.set({ ship: k });
          void net.setMe({ ship: k });
        }} />
        {host && !room.pub && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <span className="font-bold">Sinks to win</span>
            {[3, 5, 10].map((g) => (
              <SmallBtn key={g} onClick={() => void net.settings(g, room.minutes)} primary={room.goal === g}>
                {g}
              </SmallBtn>
            ))}
            <span className="ml-1 font-bold">Minutes</span>
            {[3, 5].map((m) => (
              <SmallBtn key={m} onClick={() => void net.settings(room.goal, m)} primary={room.minutes === m}>
                {m}
              </SmallBtn>
            ))}
          </div>
        )}
        {room.pub ? (
          <p className="g-display text-center text-sm">
            {room.members.length < 2 ? "Waiting for captains to join…" : autoIn !== null ? `Battle starts in ${autoIn}…` : "Starting soon…"}
          </p>
        ) : host ? (
          <BigButton onClick={() => void act("Starting…", () => net.start(room.goal, room.minutes))} disabled={room.members.length < 2 || !!busy} icon={<Swords className="size-5" />}>
            {room.members.length < 2 ? "Need 2 captains to start" : "Start battle"}
          </BigButton>
        ) : (
          <p className="g-display text-center text-sm">Waiting for the host to start the battle…</p>
        )}
        <p className="g-muted text-center text-[11px]">
          {room.goal} sinks or {room.minutes} minutes · ships respawn after sinking
        </p>
        {error && <p className="text-center text-xs font-bold text-red-800">{error}</p>}
        </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Online battle" onClose={onExit}>
      <div className="space-y-3 land:grid land:grid-cols-2 land:gap-3 land:space-y-0">
      <div className="space-y-2">
      <label className="block">
        <span className="g-muted text-[11px] font-bold tracking-wide uppercase">Captain name</span>
        <input
          value={saved.name}
          maxLength={16}
          onChange={(e) => profile.set({ name: e.target.value.replace(/[^\p{L}\p{N} _.-]/gu, "") })}
          placeholder="Your name"
          className="g-tint mt-0.5 block w-full rounded-[var(--g-hud-radius)] px-3 py-2 text-base font-bold outline-none focus:ring-2 focus:ring-[var(--accent)] pointer-coarse:py-1.5 pointer-coarse:text-sm"
        />
      </label>
      <ShipPicker value={saved.ship} onPick={(k) => profile.set({ ship: k })} />
      </div>
      <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 land:grid-cols-1">
        <BigButton onClick={() => void act("Finding a battle…", () => net.quick(me()))} disabled={!!busy} icon={<Globe className="size-5" />}>
          Quick match
        </BigButton>
        <BigButton onClick={() => void act("Making a room…", () => net.create(false, me()))} disabled={!!busy} icon={<Users className="size-5" />}>
          Play with friends
        </BigButton>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
          placeholder="ROOM CODE"
          aria-label="Room code"
          className="g-tint g-display min-w-0 flex-1 rounded-[var(--g-hud-radius)] px-3 py-2 text-center text-lg tracking-[0.25em] outline-none focus:ring-2 focus:ring-[var(--accent)] pointer-coarse:py-1.5 pointer-coarse:text-base"
        />
        <SmallBtn onClick={() => void act("Joining…", async () => setError(await net.join(codeInput, me())))} disabled={codeInput.length !== 5 || !!busy} primary>
          <Lock className="size-4" /> Join
        </SmallBtn>
      </div>
      <p className="g-muted text-center text-[11px] leading-snug">
        <Wifi className="mr-1 inline size-3 align-[-2px]" />
        Quick match puts you in a battle with captains online. Play with friends makes a private room — send them the code.
      </p>
      {busy && (
        <p className="g-display flex items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> {busy}
        </p>
      )}
      {error && <p className="text-center text-xs font-bold text-red-800">{error}</p>}
      </div>
      </div>
    </Panel>
  );
}

function ShipPicker({ value, onPick }: { value: number; onPick: (k: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {ONLINE_SHIPS.map((s, k) => (
        <button
          key={s.name}
          type="button"
          onClick={() => onPick(k)}
          aria-pressed={value === k}
          className={`g-tint rounded-[var(--g-hud-radius)] px-2 py-1.5 text-left transition ${value === k ? "ring-2 ring-[var(--accent)]" : "opacity-80 hover:opacity-100"}`}
        >
          <p className="g-display text-sm leading-tight">{s.name}</p>
          <p className="g-muted text-[10px] leading-tight">{s.blurb}</p>
          {(["Speed", "Hull", "Guns"] as const).map((label, i) => (
            <p key={label} className="mt-0.5 flex items-center gap-1 text-[9px] font-bold">
              <span className="w-8">{label}</span>
              {[1, 2, 3].map((n) => (
                <span key={n} className={`h-1.5 flex-1 rounded-full ${SHIP_BARS[k][i] >= n ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,currentColor_15%,transparent)]"}`} />
              ))}
            </p>
          ))}
        </button>
      ))}
    </div>
  );
}

function ResultsTable({ results, me, room }: { results: Result[]; me: string; room: RoomView }) {
  const color = (id: string) => PLAYER_COLORS[(room.members.find((m) => m.id === id)?.color ?? 0) % PLAYER_COLORS.length];
  const winner = results[0];
  return (
    <div className="space-y-2">
      {winner && (
        <p className="g-display text-center text-lg">
          <Trophy className="mr-1 inline size-5 align-[-3px] text-amber-600" />
          {winner.id === me ? "You win!" : `${winner.name} wins!`}
        </p>
      )}
      <ol className="space-y-1">
        {results.map((r, i) => (
          <li key={r.id} className={`g-tint flex items-center gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1.5 text-sm ${r.id === me ? "ring-2 ring-[var(--accent)]" : ""}`}>
            <span className="g-display w-5 text-center">{i + 1}</span>
            <span className="size-3 shrink-0 rounded-full" style={{ background: color(r.id) }} />
            <span className="g-display min-w-0 flex-1 truncate">{r.name}</span>
            <span className="tabular-nums">
              <b>{r.k}</b> sinks · {r.d} sunk
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** In-battle HUD: the clock, the scoreboard and who sank whom. */
export function OnlineHudView({ online, touch }: { online: OnlineHud; touch: boolean }) {
  const lead = online.scores[0];
  return (
    <>
      <div data-avoid className="absolute inset-x-0 top-[max(env(safe-area-inset-top),12px)] flex flex-col items-center gap-1 px-3">
        <p className={`g-hud g-display tabular-nums ${touch ? "px-2.5 py-0.5 text-sm" : "px-4 py-1 text-xl"} ${online.left <= 20 && !online.countdown ? "text-red-800" : ""}`}>
          {online.countdown ? `Starts in ${online.countdown}` : `${Math.floor(online.left / 60)}:${String(online.left % 60).padStart(2, "0")}`}
          <span className={`g-muted ml-2 ${touch ? "text-[10px]" : "text-sm"}`}>first to {online.goal}</span>
        </p>
        {online.feed.map((f) => (
          <p key={f.id} className={`g-hud animate-[cove-banner_0.3s_ease] px-2.5 py-0.5 font-bold ${touch ? "text-[10px]" : "text-xs"}`}>
            {f.text}
          </p>
        ))}
      </div>
      <ol data-avoid className={`g-hud absolute ${touch ? "top-[calc(max(env(safe-area-inset-top),12px)+70px)] left-3 w-[min(40vw,170px)] px-1.5 py-1" : "top-[calc(max(env(safe-area-inset-top),20px)+96px)] left-5 w-56 px-2.5 py-1.5"} space-y-0.5`}>
        {online.scores.map((s) => (
          <li key={s.id} className={`flex items-center gap-1.5 ${touch ? "text-[10px]" : "text-xs"} ${s.me ? "font-black" : "font-semibold"}`}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.me ? "You" : s.name}</span>
            {s === lead && s.k > 0 && <Crown className="size-3 text-amber-600" />}
            <span className="tabular-nums">
              {s.k}
              <span className="g-muted">/{s.d}</span>
            </span>
          </li>
        ))}
      </ol>
      {online.respawn !== null && (
        <div className="absolute inset-x-0 top-[40%] flex justify-center px-4">
          <p className={`g-panel g-display ${touch ? "px-4 py-1.5 text-base" : "px-6 py-3 text-2xl"}`}>Back on the water in {online.respawn}…</p>
        </div>
      )}
    </>
  );
}
