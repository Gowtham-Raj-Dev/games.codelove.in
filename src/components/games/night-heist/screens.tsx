"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CameraOff,
  ChevronLeft,
  CircleHelp,
  Coins,
  Eye,
  EyeOff,
  Footprints,
  Gem,
  Hand,
  Home,
  KeyRound,
  Lock,
  Map as MapIcon,
  Pause,
  Play,
  RotateCcw,
  Siren,
  Star,
  Timer,
} from "lucide-react";
import { BigButton, GameTitle, IconButton, SoftButton, SystemButtons, useStore, type Store } from "../shared/ui";
import type { Hud, NightHeistGame, Result } from "./engine";
import { LEVELS, LOOT_VALUE, parseLevel, TARGET_VALUE } from "./levels";
import { GAME } from "./manifest";

export interface LevelRecord {
  stars: number;
  time: number;
  value: number;
  loot: number;
  clean: boolean;
}

export type Records = Record<string, LevelRecord>;

export const totalValue = (recs: Records) => Object.values(recs).reduce((s, r) => s + (r?.value ?? 0), 0);

export function isUnlocked(i: number, recs: Records) {
  if (i === 0) return true;
  return !!recs[i - 1] && totalValue(recs) >= LEVELS[i].unlock;
}

export const fmtMoney = (n: number) => `$${new Intl.NumberFormat("en-US").format(Math.round(n))}`;
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const caseNo = (i: number) => `Case ${String(i + 1).padStart(2, "0")}`;

const GEM_HEX = { red: "#f87171", green: "#4ade80", blue: "#60a5fa" } as const;

// --- Map sketch ------------------------------------------------------------------------------------------

/** A blueprint of the heist: walls, exhibits, plates, guard rounds, cameras, lasers, the target and the way out. */
export function MapSketch({ index, className = "", routes = true }: { index: number; className?: string; routes?: boolean }) {
  const data = useMemo(() => {
    const p = parseLevel(LEVELS[index], index);
    const walls: string[] = [];
    const g = p.grid;
    for (let z = 0; z < g.h; z++) {
      let run = -1;
      for (let x = 0; x <= g.w; x++) {
        const wall = x < g.w && g.kind[g.idx(x, z)] === 2;
        if (wall && run < 0) run = x;
        if (!wall && run >= 0) {
          walls.push(`M${run} ${z}h${x - run}v1h${-(x - run)}z`);
          run = -1;
        }
      }
    }
    return { p, walls: walls.join("") };
  }, [index]);
  const { p } = data;
  const def = LEVELS[index];
  return (
    <svg viewBox={`-0.5 -0.5 ${p.grid.w + 1} ${p.grid.h + 1}`} className={className} role="img" aria-label={`Blueprint of ${def.name}`}>
      <defs>
        <pattern id={`nh-grid-${index}`} width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M1 0H0V1" fill="none" stroke="#38bdf8" strokeOpacity="0.12" strokeWidth="0.04" />
        </pattern>
      </defs>
      <rect x="-0.5" y="-0.5" width={p.grid.w + 1} height={p.grid.h + 1} fill="#0c1a2e" />
      <rect x="-0.5" y="-0.5" width={p.grid.w + 1} height={p.grid.h + 1} fill={`url(#nh-grid-${index})`} />
      {p.moons.map((m) => (
        <rect key={`m${m.x},${m.z}`} x={m.x} y={m.z} width="1" height="1" fill="#93c5fd" opacity="0.28" />
      ))}
      {p.torches.map((t) => (
        <circle key={`t${t.x},${t.z}`} cx={t.x + 0.5} cy={t.z + 0.5} r="2.2" fill="#fb923c" opacity="0.12" />
      ))}
      <path d={data.walls} fill="#bfdbfe" opacity="0.85" />
      {p.plates.map((pl) => (
        <rect key={`p${pl.x},${pl.z}`} x={pl.x + 0.18} y={pl.z + 0.18} width="0.64" height="0.64" fill="none" stroke="#f87171" strokeWidth="0.09" opacity="0.8" />
      ))}
      {p.props.map((pr, i) => (
        <rect
          key={`pr${i}`}
          x={pr.x + 0.22}
          y={pr.z + 0.22}
          width="0.56"
          height="0.56"
          rx={pr.kind === "column" || pr.kind === "obelisk" ? 0.28 : 0.06}
          fill={pr.kind === "pedestal" ? "none" : "#e0f2fe"}
          opacity={pr.kind === "rope" || pr.kind === "desk" || pr.kind === "plinth" ? 0.35 : 0.6}
        />
      ))}
      {p.doors.map((d) => (
        <rect key={`d${d.x},${d.z}`} x={d.x + 0.1} y={d.z + 0.1} width="0.8" height="0.8" fill="#facc15" opacity="0.85" />
      ))}
      {(def.lasers ?? []).map((l, i) => (
        <line
          key={`l${i}`}
          x1={l.x1 + 0.5 - ((l.axis ?? (l.z1 === l.z2 ? "x" : "z")) === "x" ? 0.5 : 0)}
          y1={l.z1 + 0.5 - ((l.axis ?? (l.z1 === l.z2 ? "x" : "z")) === "z" ? 0.5 : 0)}
          x2={l.x2 + 0.5 + ((l.axis ?? (l.z1 === l.z2 ? "x" : "z")) === "x" ? 0.5 : 0)}
          y2={l.z2 + 0.5 + ((l.axis ?? (l.z1 === l.z2 ? "x" : "z")) === "z" ? 0.5 : 0)}
          stroke="#ef4444"
          strokeWidth="0.2"
          strokeDasharray="0.3 0.15"
        />
      ))}
      {routes &&
        def.guards.map((gd, i) => (
          <g key={`g${i}`}>
            {gd.route.length > 1 && (
              <polyline
                points={[...gd.route, gd.route[0]].map(([x, z]) => `${x + 0.5},${z + 0.5}`).join(" ")}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="0.12"
                strokeDasharray="0.35 0.25"
                opacity="0.7"
              />
            )}
            <circle cx={gd.route[0][0] + 0.5} cy={gd.route[0][1] + 0.5} r="0.38" fill={gd.kind === "warden" ? "#c4b5fd" : "#fbbf24"} />
          </g>
        ))}
      {(def.cameras ?? []).map((c, i) => {
        const a = (c.dir * Math.PI) / 180;
        const cx = c.x + 0.5;
        const cy = c.z + 0.5;
        const s = (c.sweep * Math.PI) / 360;
        const r = 3.2;
        return (
          <path
            key={`c${i}`}
            d={`M${cx} ${cy}L${cx + Math.sin(a - s) * r} ${cy + Math.cos(a - s) * r}A${r} ${r} 0 0 0 ${cx + Math.sin(a + s) * r} ${cy + Math.cos(a + s) * r}Z`}
            fill="#60a5fa"
            opacity="0.3"
          />
        );
      })}
      {p.keys.map((k) => (
        <circle key={`k${k.x},${k.z}`} cx={k.x + 0.5} cy={k.z + 0.5} r="0.3" fill="#facc15" />
      ))}
      {p.loot.map((l) => (
        <circle key={`o${l.x},${l.z}`} cx={l.x + 0.5} cy={l.z + 0.5} r="0.22" fill="#fde68a" />
      ))}
      <g transform={`translate(${p.target.x + 0.5} ${p.target.z + 0.5})`}>
        <circle r="0.9" fill="none" stroke={GEM_HEX[def.target.gem]} strokeWidth="0.14" />
        <path d="M0 -0.5L0.42 0L0 0.5L-0.42 0Z" fill={GEM_HEX[def.target.gem]} />
      </g>
      <g transform={`translate(${p.exit.x + 0.5} ${p.exit.z + 0.5})`}>
        <rect x="-0.5" y="-0.5" width="1" height="1" fill="#22c55e" />
      </g>
      <circle cx={p.start.x + 0.5} cy={p.start.z + 0.5} r="0.42" fill="#f87171" stroke="#fff" strokeWidth="0.08" />
    </svg>
  );
}

// --- Stars -----------------------------------------------------------------------------------------------

export function Stamps({ stars, size = "sm" }: { stars: number; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "size-9" : "size-4";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${stars} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${cls} ${i < stars ? "fill-[var(--accent)] text-[#7f1d1d]" : "fill-transparent text-current opacity-30"}`} strokeWidth={size === "lg" ? 1.5 : 2} />
      ))}
    </span>
  );
}

// --- Case files (level select) -----------------------------------------------------------------------------

export function CaseFiles({ records, onPick, onHelp }: { records: Records; onPick: (i: number) => void; onHelp: () => void }) {
  const total = totalValue(records);
  const stars = Object.values(records).reduce((s, r) => s + (r?.stars ?? 0), 0);
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[linear-gradient(180deg,#05070dcc,#05070d99_40%,#05070de6)]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pt-[max(env(safe-area-inset-top),12px)] pb-8 sm:px-6">
        <div className="flex items-center justify-end gap-3 py-2">
          <SystemButtons onHelp={onHelp} />
        </div>
        <div className="mt-2 text-center">
          <GameTitle game={GAME} />
          <p className="g-display mt-3 text-sm text-[#f5f0e1]/80 sm:text-base">Case files · the Egyptian wing after closing time</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
              <Gem className="size-4 text-[var(--accent)]" /> {fmtMoney(total)} stolen
            </span>
            <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">
              <Star className="size-4 fill-[var(--accent)] text-[var(--accent)]" /> {stars} / {LEVELS.length * 3}
            </span>
            <button type="button" onClick={onHelp} className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              <CircleHelp className="size-4" /> How to play
            </button>
          </div>
        </div>
        <ol className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {LEVELS.map((def, i) => {
            const rec = records[i];
            const open = isUnlocked(i, records);
            const tilt = [-1.6, 1.2, -0.8, 1.6, 1, -1.4, 1.5, -1][i % 8];
            return (
              <li key={def.name}>
                <button
                  type="button"
                  disabled={!open}
                  onClick={() => onPick(i)}
                  style={{ transform: `rotate(${tilt}deg)` }}
                  className="g-panel group relative block w-full p-2 pb-3 text-left transition hover:-translate-y-1 hover:shadow-[0_20px_40px_#000d] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed"
                >
                  <div className="relative overflow-hidden rounded-[2px] bg-[#0c1a2e] ring-1 ring-black/40">
                    <MapSketch index={i} routes={false} className={`block aspect-[16/10] w-full ${open ? "" : "opacity-30 blur-[1px]"}`} />
                    {!open && (
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="g-display -rotate-6 border-2 border-[#f87171] bg-black/60 px-2 py-1 text-center text-[11px] leading-tight text-[#fca5a5] sm:text-xs">
                          <Lock className="mx-auto mb-0.5 size-4" />
                          {i > 0 && !records[i - 1] ? "Solve the last case" : `Needs ${fmtMoney(def.unlock)} stolen`}
                        </span>
                      </div>
                    )}
                    {rec && rec.stars === 3 && (
                      <span className="g-display absolute top-1.5 right-1.5 rotate-12 border-2 border-[#f87171] px-1.5 text-[10px] text-[#fca5a5]">Perfect</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-2 px-1">
                    <div className="min-w-0">
                      <p className="g-muted text-[10px] font-bold tracking-[0.18em] uppercase">{caseNo(i)}</p>
                      <p className="g-display truncate text-sm leading-tight sm:text-base">{def.name}</p>
                      <p className="g-muted truncate text-[11px]">{def.place}</p>
                    </div>
                    <Stamps stars={rec?.stars ?? 0} />
                  </div>
                  {rec && (
                    <p className="g-muted mt-1 px-1 text-[11px] tabular-nums">
                      Best {fmtTime(rec.time)} · {fmtMoney(rec.value)}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 text-center text-xs text-[#f5f0e1]/60">
          Escape with the target for ★ · no alarm for ★ · every valuable for ★. Loot you steal opens later cases.
        </p>
      </div>
    </div>
  );
}

// --- Briefing ------------------------------------------------------------------------------------------------

export function Briefing({ index, record, onStart, onBack, touch }: { index: number; record?: LevelRecord; onStart: () => void; onBack: () => void; touch: boolean }) {
  const def = LEVELS[index];
  const parsed = useMemo(() => parseLevel(def, index), [def, index]);
  const lootValue = parsed.loot.reduce((s, l) => s + LOOT_VALUE[l.kind], 0);
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="flex min-h-full items-end justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:items-center sm:p-6">
        <div role="dialog" aria-label={`${caseNo(index)}: ${def.name}`} className="g-panel relative w-full max-w-md p-5 sm:p-6">
          <span className="g-display absolute -top-3 right-5 rotate-3 border-2 border-[#b91c1c] bg-[#ecdfbf] px-2 py-0.5 text-xs text-[#b91c1c]">Confidential</span>
          <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">
            {caseNo(index)} · {def.place}
          </p>
          <h2 className="g-panel-title mt-1 text-3xl leading-tight sm:text-4xl">{def.name}</h2>
          <div className="mt-3 overflow-hidden rounded-[2px] ring-1 ring-black/40">
            <MapSketch index={index} className="block max-h-[34vh] w-full" />
          </div>
          <p className="mt-3 text-sm leading-relaxed">{def.brief}</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              <Gem className="size-4 shrink-0" style={{ color: GEM_HEX[def.target.gem] }} />
              <span>
                Steal the <b>{def.target.name}</b> ({fmtMoney(TARGET_VALUE)})
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Coins className="size-4 shrink-0" />
              <span>
                Optional: {parsed.lootTotal} valuables ({fmtMoney(lootValue)})
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Siren className="size-4 shrink-0" />
              <span>Escape without an alarm · par {fmtTime(def.par)}</span>
            </li>
          </ul>
          {def.intro && (
            <div className="mt-3 border-t border-dashed border-[#1c1917]/40 pt-3">
              <p className="g-display text-xs text-[#b91c1c]">Notes from the inside</p>
              <ul className="mt-1.5 space-y-1 text-[13px] leading-snug">
                {def.intro.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 bg-[#b91c1c]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="g-muted mt-3 text-xs">
            {def.coins} coins to throw · {def.guards.length} guard{def.guards.length === 1 ? "" : "s"}
            {def.cameras?.length ? ` · ${def.cameras.length} camera${def.cameras.length === 1 ? "" : "s"}` : ""}
            {def.lasers?.length ? ` · lasers` : ""}
            {record ? ` · best ${fmtTime(record.time)}, ${record.stars}★` : ""}
          </p>
          <div className="mt-4 space-y-2">
            <BigButton onClick={onStart} autoFocus icon={<Play className="size-5 fill-current" />}>
              Begin the heist
            </BigButton>
            <SoftButton onClick={onBack} icon={<ChevronLeft className="size-4" />}>
              Case files
            </SoftButton>
          </div>
          {!touch && <p className="g-muted mt-3 text-center text-[11px]">WASD move · Shift sneak · Space run · E use · click to throw · Q map</p>}
        </div>
      </div>
    </div>
  );
}

// --- HUD -------------------------------------------------------------------------------------------------

export function HudOverlay({ store, onPause, onMap, touch }: { store: Store<Hud | null>; onPause: () => void; onMap: () => void; touch: boolean }) {
  const hud = useStore(store);
  if (!hud) return null;
  const def = LEVELS[hud.level];
  const lit = hud.light > 0.6 ? "Lit" : hud.light > 0.35 ? "Dim" : "Hidden";
  const susp = hud.alarm ? 1 : hud.suspicion;
  return (
    <>
      {hud.alarm && <div className="pointer-events-none absolute inset-0 animate-pulse shadow-[inset_0_0_120px_30px_rgb(220_38_38/0.45)]" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(env(safe-area-inset-top),8px)] sm:p-4">
        <div className="g-hud max-w-[56vw] px-3 py-2 text-xs sm:max-w-xs sm:text-sm">
          <p className="g-display truncate text-[10px] opacity-70 sm:text-xs">
            {caseNo(hud.level)} · {def.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 font-bold">
            <Gem className="size-3.5 shrink-0" style={{ color: hud.gem ? "#4ade80" : GEM_HEX[def.target.gem] }} />
            <span className="truncate">{hud.objective}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums opacity-90">
            <span title="Valuables">
              Loot {hud.loot}/{hud.lootTotal}
            </span>
            <span className="text-[#fde68a]">{fmtMoney(hud.value)}</span>
            <span className="inline-flex items-center gap-1" title="Coins to throw">
              <Coins className="size-3.5" /> {hud.coins}
            </span>
            {hud.keys > 0 && (
              <span className="inline-flex items-center gap-1 text-[#facc15]" title="Key cards">
                <KeyRound className="size-3.5" /> {hud.keys}
              </span>
            )}
            {hud.camerasOff && (
              <span className="inline-flex items-center gap-1 text-[#93c5fd]">
                <CameraOff className="size-3.5" />
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className={`g-hud g-display flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm ${hud.alarm ? "animate-pulse !border-[#ef4444] !bg-[#7f1d1d]/90 text-white" : ""}`}
            role="status"
          >
            {hud.alarm ? <Siren className="size-4" /> : susp > 0.3 ? <Eye className="size-4 text-[#fbbf24]" /> : <EyeOff className="size-4 opacity-70" />}
            <span>{hud.alarm ? `Alarm · ${hud.alarmLeft}s` : susp > 0.3 ? "Suspicious" : "Unseen"}</span>
          </div>
          {!hud.alarm && (
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
              <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${susp * 100}%`, background: susp > 0.6 ? "#f97316" : "#fbbf24" }} />
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex items-start gap-2">
          <div className="flex flex-col gap-2">
            <IconButton onClick={onPause} label="Pause (Esc)">
              <Pause className="size-5 fill-current" />
            </IconButton>
            <IconButton onClick={onMap} label={hud.overview ? "Close the map (Q)" : "Overview map (Q)"} dim={!hud.overview}>
              <MapIcon className="size-5" />
            </IconButton>
          </div>
          <div className="hidden sm:block">
            <SystemButtons vertical />
          </div>
        </div>
      </div>

      {/* Visibility and noise. */}
      <div className={`pointer-events-none absolute left-2 flex flex-col gap-1.5 sm:left-4 ${touch ? "top-[132px]" : "bottom-[max(env(safe-area-inset-bottom),16px)]"}`}>
        <div className="g-hud flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold">
          {lit === "Hidden" ? <EyeOff className="size-4 text-[#93c5fd]" /> : <Eye className={`size-4 ${lit === "Lit" ? "text-[#fbbf24]" : "text-[#fde68a]/70"}`} />}
          <span className="w-12">{lit}</span>
          <span className="flex h-2.5 w-14 gap-0.5" aria-hidden>
            {[0.2, 0.4, 0.6, 0.8].map((v) => (
              <span key={v} className={`flex-1 ${hud.light >= v ? "bg-[#fbbf24]" : "bg-white/15"}`} />
            ))}
          </span>
        </div>
        <div className="g-hud flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold">
          <Footprints className={`size-4 ${hud.stance === "run" ? "text-[#f87171]" : hud.stance === "walk" ? "text-[#fde68a]" : "text-[#93c5fd]"}`} />
          <span className="w-12">{hud.stance === "run" ? "Loud" : hud.stance === "walk" ? "Soft" : hud.stance === "sneak" ? "Silent" : hud.sneakLock ? "Sneak" : "Still"}</span>
          <span className="flex h-2.5 w-14 items-end gap-0.5" aria-hidden>
            {[1, 2, 3].map((v) => (
              <span
                key={v}
                className={`flex-1 ${(hud.stance === "run" ? 3 : hud.stance === "walk" ? 1 : 0) >= v ? "bg-[#f87171]" : "bg-white/15"}`}
                style={{ height: `${v * 33}%` }}
              />
            ))}
          </span>
        </div>
      </div>

      {hud.prompt && (
        <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${touch ? "bottom-[210px]" : "bottom-[max(env(safe-area-inset-bottom),24px)]"}`}>
          <p className="g-hud g-display flex items-center gap-2 px-4 py-2 text-sm">
            {!touch && <kbd className="rounded-[3px] border border-current px-1.5 text-xs">E</kbd>}
            {touch && <Hand className="size-4" />}
            {hud.prompt}
          </p>
        </div>
      )}
      <p className="g-display pointer-events-none absolute right-3 bottom-[max(env(safe-area-inset-bottom),12px)] hidden items-center gap-1.5 text-xs text-white/70 tabular-nums sm:flex">
        <Timer className="size-3.5" /> {fmtTime(hud.time)}
      </p>
    </>
  );
}

// --- Toasts ------------------------------------------------------------------------------------------------

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "bad";
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[96px] flex flex-col items-center gap-1.5 px-4 sm:top-[84px]">
      {toasts.map((t) => (
        <p
          key={t.id}
          className={`g-display max-w-md animate-[game-fade_0.3s_ease] px-3 py-1.5 text-center text-xs sm:text-sm ${
            t.tone === "bad" ? "border border-[#ef4444] bg-[#7f1d1d]/90 text-white" : t.tone === "good" ? "g-hud text-[#fde68a]" : "g-hud"
          }`}
        >
          {t.text}
        </p>
      ))}
    </div>
  );
}

// --- Result --------------------------------------------------------------------------------------------------

export function ResultCard({
  result,
  best,
  nextOpen,
  onNext,
  onRetry,
  onMenu,
}: {
  result: Result;
  best: boolean;
  nextOpen: boolean;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
}) {
  const def = LEVELS[result.level];
  const reason =
    result.reason === "laser"
      ? "after tripping a laser"
      : result.reason === "plate"
        ? "after stepping on a pressure plate"
        : result.reason === "camera"
          ? "after a camera spotted you"
          : "by a night guard";
  const last = result.level === LEVELS.length - 1;
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/55 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4">
        <div role="dialog" aria-label={result.escaped ? "Escaped" : "Caught"} className="g-panel relative w-full max-w-md p-6">
          <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">
            {caseNo(result.level)} · {def.name}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <h2 className="g-panel-title text-4xl">{result.escaped ? "Escaped" : "Caught"}</h2>
            <span
              className={`g-display -rotate-6 border-[3px] px-2 py-1 text-sm ${result.escaped ? "border-[#15803d] text-[#15803d]" : "border-[#b91c1c] text-[#b91c1c]"}`}
            >
              {result.escaped ? (result.alarm ? "Case closed" : "Clean job") : "Arrested"}
            </span>
          </div>
          {result.escaped ? (
            <>
              <div className="mt-3 flex items-center justify-center gap-3">
                <Stamps stars={result.stars} size="lg" />
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px] font-bold">
                <li className="g-tint rounded-[3px] px-1 py-1.5">★ Escaped</li>
                <li className={`g-tint rounded-[3px] px-1 py-1.5 ${result.alarm ? "line-through opacity-50" : ""}`}>★ No alarm</li>
                <li className={`g-tint rounded-[3px] px-1 py-1.5 ${result.loot < result.lootTotal ? "line-through opacity-50" : ""}`}>★ All loot</li>
              </ul>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed">You were caught {reason}. The {def.target.name} stays in its case — for tonight.</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <ResultStat label="Time" value={fmtTime(result.time)} note={result.escaped && result.time <= result.par ? "under par" : undefined} />
            <ResultStat label="Loot" value={`${result.loot}/${result.lootTotal}`} />
            <ResultStat label="Haul" value={fmtMoney(result.value)} />
            <ResultStat label="Knockouts" value={String(result.knockouts)} />
          </dl>
          {best && result.escaped && <p className="g-display mt-3 text-center text-sm text-[#b91c1c]">New best for this case</p>}
          <div className="mt-5 space-y-2">
            {result.escaped && nextOpen && !last ? (
              <BigButton onClick={onNext} autoFocus icon={<ArrowRight className="size-5" />}>
                Next case
              </BigButton>
            ) : (
              <BigButton onClick={onRetry} autoFocus icon={<RotateCcw className="size-5" />}>
                {result.escaped ? "Play again" : "Try again"}
              </BigButton>
            )}
            <div className="grid grid-cols-2 gap-2">
              {result.escaped && nextOpen && !last ? (
                <SoftButton onClick={onRetry} icon={<RotateCcw className="size-4" />}>
                  Replay
                </SoftButton>
              ) : (
                <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
                  Case files
                </SoftButton>
              )}
              {result.escaped && nextOpen && !last ? (
                <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
                  Case files
                </SoftButton>
              ) : (
                <SoftButton onClick={onRetry} icon={<Play className="size-4" />}>
                  Retry
                </SoftButton>
              )}
            </div>
            {result.escaped && !nextOpen && !last && (
              <p className="g-muted text-center text-xs">The next case needs {fmtMoney(LEVELS[result.level + 1].unlock)} stolen in total — go back for more loot.</p>
            )}
            {result.escaped && last && <p className="g-muted text-center text-xs">That was the last case. Go back for three stars on every file.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="g-tint rounded-[3px] px-2 py-2 text-center">
      <dt className="g-muted text-[10px] font-bold tracking-[0.12em] uppercase">{label}</dt>
      <dd className="g-display text-base tabular-nums">{value}</dd>
      {note && <dd className="text-[10px] font-bold text-[#15803d]">{note}</dd>}
    </div>
  );
}

// --- Touch controls -------------------------------------------------------------------------------------------

export function TouchControls({ game, store }: { game: { current: NightHeistGame | null }; store: Store<Hud | null> }) {
  const hud = useStore(store);
  const stickRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const R = 50;

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stickRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setKnob({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  };
  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      s.x += (dx / l) * (l - R);
      s.y += (dy / l) * (l - R);
      dx = e.clientX - s.x;
      dy = e.clientY - s.y;
    }
    game.current?.setStick(dx / R, -dy / R);
    setKnob({ ox: s.x, oy: s.y, x: dx, y: dy });
  };
  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    stickRef.current = null;
    game.current?.setStick(0, 0);
    setKnob(null);
  };

  return (
    <>
      <div className="absolute bottom-0 left-0 h-[42%] w-[52%] touch-none" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp} aria-label="Move">
        {knob ? (
          <div className="pointer-events-none fixed" style={{ left: knob.ox - R - 14, top: knob.oy - R - 14 }}>
            <div className="relative rounded-full bg-black/40 ring-2 ring-[#f87171]/40" style={{ width: (R + 14) * 2, height: (R + 14) * 2 }}>
              <div className="absolute size-14 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f5f0e1,#a8956b_70%)] ring-2 ring-black/60" style={{ left: R + 14 - 28 + knob.x, top: R + 14 - 28 + knob.y }} />
            </div>
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),26px)] left-6 grid size-32 place-items-center rounded-full bg-black/30 ring-2 ring-[#f87171]/25">
            <div className="size-12 rounded-full bg-[#ecdfbf]/45 ring-2 ring-black/40" />
          </div>
        )}
      </div>
      <div className="absolute right-3 bottom-[max(env(safe-area-inset-bottom),16px)] h-[190px] w-[190px] touch-none select-none">
        <TouchButton className="g-btn right-0 bottom-0 size-[86px] text-xs" onDown={() => game.current?.use()} label="Use">
          <Hand className="size-7" />
          <span className="g-display mt-0.5 text-[10px]">Use</span>
        </TouchButton>
        <TouchButton className={`g-hud right-[98px] bottom-0 size-16 ${hud?.sneakLock ? "!border-[#93c5fd] !bg-[#1e3a8a]/80" : ""}`} onDown={() => game.current?.toggleSneak()} label="Sneak">
          <Footprints className="size-6" />
          <span className="g-display text-[9px]">{hud?.sneakLock ? "Sneak on" : "Sneak"}</span>
        </TouchButton>
        <TouchButton className="g-hud right-0 bottom-[98px] size-16" onDown={() => game.current?.setRun(true)} onUp={() => game.current?.setRun(false)} label="Run (hold)">
          <span className="g-display text-[11px] leading-none">Run</span>
          <span className="text-[9px] opacity-70">hold</span>
        </TouchButton>
        <div className="g-hud pointer-events-none absolute right-[98px] bottom-[86px] flex items-center gap-1 px-2 py-1 text-[10px] font-bold">
          <Coins className="size-3.5" /> tap to throw · {hud?.coins ?? 0}
        </div>
      </div>
    </>
  );
}

function TouchButton({ className, onDown, onUp, label, children }: { className: string; onDown: () => void; onUp?: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute flex touch-none flex-col items-center justify-center transition active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}
