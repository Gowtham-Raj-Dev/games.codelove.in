"use client";

import { useState, type ReactNode } from "react";
import { CarFront, Check, ChevronLeft, ChevronRight, Coins, Copy, Crown, Flag, Globe, Lock, LogOut, PaintBucket, Share2, Trophy, Users, Wrench, Zap } from "lucide-react";
import { BigButton, IconButton, Modal, SoftButton, useRecords } from "../shared/ui";
import { CLASSES, ordinal } from "./engine";
import { MAX_LEVEL, SKINS, UPGRADES, upgradeCost, type Tune } from "./garage";
import { formatTime } from "./hud";
import { DRIVERS } from "./manifest";
import { MAX_PLAYERS, PLAYER_COLORS, type Link, type RoomView } from "./online";
import { ownsCup, ownsDriver, records, tuneOf, type Saved } from "./records";
import { CUPS, TRACKS } from "./tracks";

export function CoinBank({ coins }: { coins: number }) {
  return (
    <span className="g-tint inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-sm font-black tabular-nums">
      <Coins className="size-4 text-amber-400" /> {coins}
    </span>
  );
}

// --- Shop -------------------------------------------------------------------------------------------

export type ShopTab = "karts" | "paint" | "tune" | "stages";

const priceTag = (cost: number) => (
  <>
    <Coins className="size-3.5 text-amber-400" /> {cost}
  </>
);

/** A row's button: the price while it is for sale, then "Use" / "In use". */
function BuyButton({ owned, active, cost, coins, onClick, use = "Use", on = "In use" }: { owned: boolean; active: boolean; cost: number; coins: number; onClick: () => void; use?: string; on?: string }) {
  return (
    <button type="button" disabled={(!owned && coins < cost) || (owned && active)} data-active={owned && active} onClick={onClick} className="g-soft flex w-24 shrink-0 items-center justify-center px-2 py-2 text-xs font-black disabled:opacity-55 data-[active=true]:opacity-100">
      <span className="g-unskew gap-1">{owned ? (active ? on : use) : priceTag(cost)}</span>
    </button>
  );
}

/**
 * Everything coins buy, on one page: karts, kart designs, upgrades for the kart you drive, and cups.
 * It fits without scrolling: tabs over the list upright and on a desktop, tabs beside the list on a
 * phone held sideways.
 */
export function ShopPanel({ tab: first = "karts", onDriver, onClose }: { tab?: ShopTab; onDriver: (index: number) => void; onClose: () => void }) {
  const saved = useRecords(records);
  const [tab, setTab] = useState<ShopTab>(first);
  const driver = DRIVERS[saved.driver] ?? DRIVERS[0];
  const tune = tuneOf(saved, driver.key);
  const spend = (cost: number, patch: Partial<Saved>) => {
    const s = records.get();
    if (s.coins < cost) return false;
    records.set({ coins: s.coins - cost, ...patch });
    return true;
  };

  const pickKart = (i: number) => {
    const d = DRIVERS[i];
    const s = records.get();
    if (!ownsDriver(s, d) && !spend(d.cost ?? 0, { cars: [...s.cars, d.key] })) return;
    onDriver(i);
  };
  const pickSkin = (id: string, cost: number) => {
    const s = records.get();
    if (s.skins.includes(id)) records.set({ skin: id });
    else spend(cost, { skins: [...s.skins, id], skin: id });
  };
  const buyUpgrade = (i: number) => {
    const s = records.get();
    const now = tuneOf(s, driver.key);
    const cost = upgradeCost(now[i]);
    if (cost === null) return;
    const next = now.slice() as Tune;
    next[i]++;
    spend(cost, { tunes: { ...s.tunes, [driver.key]: next } });
  };
  const pickCup = (i: number) => {
    const c = CUPS[i];
    const s = records.get();
    if (!ownsCup(s, c) && !spend(c.cost, { stages: [...s.stages, c.id] })) return;
    records.set({ cup: i });
  };

  const TABS: [ShopTab, string, ReactNode][] = [
    ["karts", "Karts", <CarFront key="k" className="size-4" />],
    ["paint", "Designs", <PaintBucket key="p" className="size-4" />],
    ["tune", "Upgrades", <Wrench key="t" className="size-4" />],
    ["stages", "Stages", <Flag key="s" className="size-4" />],
  ];

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/40 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-3 land:p-2">
        <div role="dialog" aria-label="Shop" className="g-panel w-full max-w-lg space-y-3 p-4 sm:p-5 land:grid land:max-w-3xl land:grid-cols-[12.5rem_minmax(0,1fr)] land:items-start land:gap-3 land:space-y-0 land:p-3">
          <div className="space-y-2.5 land:space-y-2">
            <h2 className="g-panel-title text-center text-3xl sm:text-4xl land:text-2xl">Shop</h2>
            <div className="flex items-center justify-between gap-2">
              <p className="g-display flex min-w-0 items-center gap-2 text-lg italic land:text-base">
                <span className="size-3 shrink-0 rounded-full ring-2 ring-black/50" style={{ background: driver.color }} />
                <span className="pr-1.5">{driver.name}</span>
              </p>
              <CoinBank coins={saved.coins} />
            </div>
            <div className="grid grid-cols-4 gap-1.5 land:grid-cols-2">
              {TABS.map(([id, label, icon]) => (
                <SoftButton key={id} onClick={() => setTab(id)} active={tab === id} icon={<span className="hidden sm:inline land:hidden">{icon}</span>}>
                  {label}
                </SoftButton>
              ))}
            </div>
            <div className="hidden land:block">
              <SoftButton onClick={onClose} icon={<ChevronLeft className="size-4" />}>
                Back
              </SoftButton>
            </div>
          </div>

          <div className="min-w-0">

      {tab === "karts" && (
        <ul className="space-y-1.5">
          {DRIVERS.map((d, i) => (
            <li key={d.key} className="g-tint flex items-center gap-3 px-3 py-1.5">
              <span className="size-4 shrink-0 rounded-full ring-2 ring-black/40" style={{ background: d.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight font-black">{d.name}</p>
                <p className="g-muted text-[11px] leading-tight font-bold">
                  Speed {d.speed} · Accel {d.accel} · Handling {d.handling}
                </p>
              </div>
              <BuyButton owned={ownsDriver(saved, d)} active={saved.driver === i} cost={d.cost ?? 0} coins={saved.coins} onClick={() => pickKart(i)} use="Drive" on="Driving" />
            </li>
          ))}
        </ul>
      )}

      {tab === "paint" && (
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 land:grid-cols-7">
          {SKINS.map((s) => {
            const owned = saved.skins.includes(s.id);
            const on = saved.skin === s.id;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => pickSkin(s.id, s.cost)} disabled={!owned && saved.coins < s.cost} data-active={on} className="g-soft flex w-full flex-col items-center px-1 py-1.5 text-[11px] font-black disabled:opacity-45">
                  <span className="g-unskew flex-col gap-0.5">
                    <span className="size-6 rounded-full ring-2 ring-black/40" style={{ background: s.tint ?? driver.color, boxShadow: s.glow ? `0 0 10px ${s.glow}` : undefined }} />
                    {s.name}
                    <span className="flex items-center gap-1 text-[10px] opacity-80">{on ? "On" : owned ? "Owned" : priceTag(s.cost)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "tune" && (
        <ul className="space-y-1.5">
          {UPGRADES.map((u, i) => {
            const level = tune[i];
            const cost = upgradeCost(level);
            return (
              <li key={u.id} className="g-tint flex items-center gap-3 px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-tight font-black">
                    {u.name} <span className="g-muted text-xs font-bold">· {u.blurb}</span>
                  </p>
                  <span className="mt-1.5 flex gap-1">
                    {Array.from({ length: MAX_LEVEL }, (_, n) => (
                      <span key={n} className={`h-2 flex-1 -skew-x-12 ${n < level ? "bg-[var(--accent)]" : "bg-[color-mix(in_srgb,currentColor_15%,transparent)]"}`} />
                    ))}
                  </span>
                </div>
                <button type="button" disabled={cost === null || saved.coins < cost} onClick={() => buyUpgrade(i)} className="g-soft flex w-24 shrink-0 items-center justify-center px-2 py-2 text-xs font-black disabled:opacity-45">
                  <span className="g-unskew gap-1">{cost === null ? "MAX" : priceTag(cost)}</span>
                </button>
              </li>
            );
          })}
          <li className="g-muted text-[11px] leading-tight">Upgrades are for {driver.name}&apos;s kart — drive another kart to tune that one.</li>
        </ul>
      )}

      {tab === "stages" && (
        <ul className="space-y-1.5">
          {CUPS.map((c, i) => (
            <li key={c.id} className="g-tint flex items-center gap-3 px-3 py-1.5">
              <Trophy className="size-5 shrink-0 text-[var(--accent)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-tight font-black">{c.name}</p>
                <p className="g-muted truncate text-[11px] leading-tight font-bold">{c.tracks.map((t) => TRACKS[t].name).join(" · ")}</p>
              </div>
              <BuyButton owned={ownsCup(saved, c)} active={saved.cup === i} cost={c.cost} coins={saved.coins} onClick={() => pickCup(i)} use="Select" on="Selected" />
            </li>
          ))}
          <li className="g-muted text-[11px] leading-tight">A cup&apos;s three circuits open in Time Trial with it.</li>
        </ul>
      )}
          </div>

          <div className="land:hidden">
            <SoftButton onClick={onClose} icon={<ChevronLeft className="size-4" />}>
              Back
            </SoftButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Online -----------------------------------------------------------------------------------------

const LINK_LABEL: Record<Link, string> = { connecting: "Connecting…", direct: "Linked", relay: "Linked (slow)" };

const field = "g-tint w-full px-3 py-2.5 text-base font-bold outline-none placeholder:opacity-50 focus:ring-2 focus:ring-[var(--accent)]";

export interface OnlineProps {
  room: RoomView | null;
  me: string;
  links: Map<string, Link>;
  busy: boolean;
  error: string | null;
  /** A code from an invite link, to join with. */
  invite: string;
  /** The race is on without you (you joined after the start). */
  waiting: boolean;
  onQuick: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onLeave: () => void;
  onStart: () => void;
  onSettings: (track: number, cls: number) => void;
  onClose: () => void;
}

export function inviteLink(code: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  return url.toString();
}

export function OnlinePanel(p: OnlineProps) {
  return p.room ? <Lobby {...p} room={p.room} /> : <Connect {...p} />;
}

/** Not in a room yet: Quick Race (public rooms) on one side, friends (private rooms) on the other. */
function Connect({ busy, error, invite, onQuick, onCreate, onJoin, onClose }: OnlineProps) {
  const saved = useRecords(records);
  const [code, setCode] = useState(invite);
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return (
    <Modal title="Race online" wide>
      <label className="block">
        <span className="g-muted text-[11px] font-bold tracking-widest uppercase">Your name</span>
        <input
          className={`${field} mt-1`}
          value={saved.name}
          maxLength={14}
          placeholder="Racer"
          autoComplete="off"
          onChange={(e) => records.set({ name: e.target.value.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 14) })}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>

      <section className="g-tint space-y-2 p-3">
        <h3 className="flex items-center gap-2 text-sm font-black tracking-wide uppercase">
          <Globe className="size-4 text-[var(--accent)]" /> Quick Race
        </h3>
        <p className="g-muted text-xs leading-relaxed">
          Jump into a public room with whoever is online right now. Rooms fill up to {MAX_PLAYERS} players, then a new one opens. Races start by themselves.
        </p>
        <BigButton onClick={onQuick} disabled={busy} icon={<Zap className="size-5" />} autoFocus={!invite}>
          {busy ? "Connecting…" : "Find a race"}
        </BigButton>
      </section>

      <section className="g-tint space-y-2 p-3">
        <h3 className="flex items-center gap-2 text-sm font-black tracking-wide uppercase">
          <Lock className="size-4 text-[var(--accent)]" /> Play with friends
        </h3>
        <p className="g-muted text-xs leading-relaxed">A private room only opens with its code. Make one and send the invite link, or type a friend&apos;s code.</p>
        <SoftButton onClick={onCreate} icon={<Users className="size-4" />}>
          Create private room
        </SoftButton>
        <div className="flex gap-2">
          <input
            className={`${field} min-w-0 flex-1 text-center tracking-[0.35em] uppercase`}
            value={clean}
            placeholder="CODE"
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus={!!invite}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && clean.length === 5 && !busy) onJoin(clean);
            }}
          />
          <button type="button" disabled={busy || clean.length !== 5} onClick={() => onJoin(clean)} className="g-soft w-24 shrink-0 px-3 text-sm font-black disabled:opacity-45">
            <span className="g-unskew">Join</span>
          </button>
        </div>
      </section>

      {error && <p className="bg-red-600 px-3 py-2 text-center text-sm font-bold text-white">{error}</p>}
      <SoftButton onClick={onClose} icon={<ChevronLeft className="size-4" />}>
        Back
      </SoftButton>
    </Modal>
  );
}

/** In a room: who is here, the next circuit, and (for the host of a private room) the start button. */
function Lobby({ room, me, links, error, waiting, onLeave, onStart, onSettings }: OnlineProps & { room: RoomView }) {
  const [copied, setCopied] = useState(false);
  const host = room.host === me;
  const track = TRACKS[room.track] ?? TRACKS[0];
  const enough = room.members.length >= 2;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(room.code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the code is on screen to read out.
    }
  };
  const share = () => void navigator.share?.({ title: "Turbo Karts", text: `Race me in Turbo Karts — room ${room.code}`, url: inviteLink(room.code) }).catch(() => {});
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const step = (dir: number) => onSettings((room.track + dir + TRACKS.length) % TRACKS.length, room.cls);

  return (
    <Modal title={room.pub ? "Quick Race" : "Private room"} wide>
      {room.pub ? (
        <p className="g-muted -mt-2 text-center text-xs font-bold tracking-widest uppercase">
          Public room · {room.members.length}/{MAX_PLAYERS} players
        </p>
      ) : (
        <div className="g-tint -mt-1 space-y-2 p-3 text-center">
          <p className="g-muted text-[11px] font-bold tracking-widest uppercase">Room code — only friends with it can join</p>
          <p className="g-display text-4xl tracking-[0.3em] text-[var(--accent)]">{room.code}</p>
          <div className={`grid gap-2 ${canShare ? "grid-cols-2" : ""}`}>
            <SoftButton onClick={() => void copy()} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {copied ? "Link copied" : "Copy invite link"}
            </SoftButton>
            {canShare && (
              <SoftButton onClick={share} icon={<Share2 className="size-4" />}>
                Share
              </SoftButton>
            )}
          </div>
        </div>
      )}

      <ol className="space-y-1">
        {room.members.map((m) => {
          const mine = m.id === me;
          const link = links.get(m.id);
          return (
            <li key={m.id} className={`flex items-center gap-2 px-3 py-1.5 text-sm ${mine ? "bg-[var(--accent)] font-bold text-black" : "g-tint"}`}>
              <span className="size-3 shrink-0 rounded-full ring-1 ring-black/40" style={{ background: PLAYER_COLORS[m.color] ?? PLAYER_COLORS[0] }} />
              <span className="min-w-0 flex-1 truncate font-bold">
                {m.name}
                {mine && <span className="ml-1 text-xs opacity-75">(you)</span>}
              </span>
              {m.id === room.host && <Crown className="size-3.5 shrink-0" aria-label="Host" />}
              <span className="shrink-0 text-xs opacity-75">{(DRIVERS[m.driver] ?? DRIVERS[0]).name}</span>
              {!mine && <span className="w-20 shrink-0 text-right text-[11px] opacity-70">{link ? LINK_LABEL[link] : ""}</span>}
            </li>
          );
        })}
        {Array.from({ length: Math.max(0, 2 - room.members.length) }, (_, i) => (
          <li key={i} className="g-tint px-3 py-1.5 text-sm italic opacity-60">
            Waiting for another racer…
          </li>
        ))}
      </ol>

      <div className="g-tint p-3">
        <div className="flex items-center justify-between gap-2">
          {host && !room.pub ? (
            <IconButton onClick={() => step(-1)} label="Previous circuit" plain>
              <ChevronLeft className="size-6" />
            </IconButton>
          ) : (
            <span />
          )}
          <div className="min-w-0 text-center">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-60">Next race · {CLASSES[room.cls]?.name ?? "Pro"}</p>
            <p className="g-display truncate text-2xl italic">{track.name}</p>
          </div>
          {host && !room.pub ? (
            <IconButton onClick={() => step(1)} label="Next circuit" plain>
              <ChevronRight className="size-6" />
            </IconButton>
          ) : (
            <span />
          )}
        </div>
        {host && !room.pub && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CLASSES.map((c, i) => (
              <SoftButton key={c.name} onClick={() => onSettings(room.track, i)} active={room.cls === i}>
                {c.name}
              </SoftButton>
            ))}
          </div>
        )}
      </div>

      {room.results && room.results.length > 0 && !waiting && (
        <div>
          <p className="g-muted mb-1 text-[11px] font-bold tracking-widest uppercase">Last race</p>
          <ol className="space-y-1">
            {[...room.results]
              .sort((a, b) => a.place - b.place)
              .map((r) => (
                <li key={r.id} className={`flex items-center gap-2 px-3 py-1 text-xs ${r.id === me ? "font-black text-[var(--accent)]" : ""} g-tint`}>
                  <span className="g-display w-8 tabular-nums">{ordinal(r.place)}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                  <span className="tabular-nums">{r.time > 0 ? formatTime(r.time) : "DNF"}</span>
                </li>
              ))}
          </ol>
        </div>
      )}

      {waiting ? (
        <p className="g-tint px-3 py-3 text-center text-sm font-bold">A race is on — you&apos;re on the grid for the next one.</p>
      ) : room.pub ? (
        <p className="g-tint px-3 py-3 text-center text-sm font-bold">{enough ? "Get ready — the race starts in a few seconds!" : "The race starts as soon as a second racer joins."}</p>
      ) : host ? (
        <BigButton onClick={onStart} disabled={!enough} icon={<Flag className="size-6" />} autoFocus>
          {enough ? "Start race" : "Waiting for friends"}
        </BigButton>
      ) : (
        <p className="g-tint px-3 py-3 text-center text-sm font-bold">Waiting for the host to start the race…</p>
      )}

      {error && <p className="bg-red-600 px-3 py-2 text-center text-sm font-bold text-white">{error}</p>}
      <SoftButton onClick={onLeave} icon={<LogOut className="size-4" />}>
        Leave room
      </SoftButton>
    </Modal>
  );
}
