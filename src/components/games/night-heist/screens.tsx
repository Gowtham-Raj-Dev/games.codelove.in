"use client";

import { useMemo, type ReactNode } from "react";
import {
  ArrowRight,
  Banknote,
  CameraOff,
  ChevronLeft,
  CircleHelp,
  Cloud,
  Coins,
  Eye,
  EyeOff,
  Footprints,
  Gem,
  Hand,
  Home,
  Hourglass,
  KeyRound,
  Lock,
  Map as MapIcon,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShoppingBag,
  Siren,
  Star,
  Timer,
  Unlock,
} from "lucide-react";
import { ControlsButton } from "../shared/touch-layout";
import { BigButton, GameTitle, IconButton, SoftButton, SystemButtons, usePhoneLandscape, useStore, type Store } from "../shared/ui";
import { LEVELS } from "./campaign";
import { DISTRICTS, districtIndex, districtOf, districtOpen, districtStars, findItem, GADGETS, HEISTS_PER_DISTRICT, isUnlocked, nextHeist, THIEVES, TOTAL_HEISTS, totalStars, type GadgetId, type HeistRecord, type Save } from "./content";
import type { Hud, Result } from "./engine";
import { laserAxis, parseLevel } from "./levels";
import { GAME } from "./manifest";

export const fmtMoney = (n: number) => `$${new Intl.NumberFormat("en-US").format(Math.round(n))}`;
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const caseNo = (i: number) => `Heist ${String(i + 1).padStart(2, "0")}`;

const GEM_HEX = { red: "#f87171", green: "#4ade80", blue: "#60a5fa" } as const;
const GUARD_HEX = { guard: "#fbbf24", warden: "#c4b5fd", sentry: "#fef08a", captain: "#fb7185", dog: "#a78bfa" } as const;

export function GadgetIcon({ id, className = "size-4" }: { id: GadgetId | string; className?: string }) {
  return id === "smoke" ? <Cloud className={className} /> : id === "jammer" ? <Radio className={className} /> : <Unlock className={className} />;
}

// --- Map sketch ------------------------------------------------------------------------------------------

/** A blueprint of the heist: walls, cover, plates, guard rounds, cameras, lasers, drones, the target and the way out. */
export function MapSketch({ index, className = "", routes = true }: { index: number; className?: string; routes?: boolean }) {
  const def = LEVELS[index];
  const data = useMemo(() => {
    const p = parseLevel(def, index);
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
  }, [def, index]);
  const { p } = data;
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
      {p.noisy.map((m) => (
        <rect key={`n${m.x},${m.z}`} x={m.x + 0.08} y={m.z + 0.08} width="0.84" height="0.84" fill="#fde68a" opacity="0.22" />
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
          opacity={pr.kind === "rope" || pr.kind === "desk" || pr.kind === "plinth" || pr.kind === "sarcophagus" ? 0.35 : 0.6}
        />
      ))}
      {p.doors.map((d) => (
        <rect key={`d${d.x},${d.z}`} x={d.x + 0.1} y={d.z + 0.1} width="0.8" height="0.8" fill="#facc15" opacity="0.85" />
      ))}
      {(def.lasers ?? []).map((l, i) => {
        const x = laserAxis(l) === "x";
        return (
          <g key={`l${i}`}>
            {l.move && <rect x={Math.min(l.x1, l.x2)} y={Math.min(l.z1, l.z2)} width={Math.abs(l.x2 - l.x1) + 1 + l.move.dx} height={Math.abs(l.z2 - l.z1) + 1 + l.move.dz} fill="#ef4444" opacity="0.12" />}
            <line x1={l.x1 + (x ? 0 : 0.5)} y1={l.z1 + (x ? 0.5 : 0)} x2={l.x2 + (x ? 1 : 0.5)} y2={l.z2 + (x ? 0.5 : 1)} stroke="#ef4444" strokeWidth="0.2" strokeDasharray="0.3 0.15" />
          </g>
        );
      })}
      {routes &&
        def.guards.map((gd, i) => (
          <g key={`g${i}`}>
            {gd.route.length > 1 && (
              <polyline
                points={[...gd.route, gd.route[0]].map(([x, z]) => `${x + 0.5},${z + 0.5}`).join(" ")}
                fill="none"
                stroke={GUARD_HEX[gd.kind ?? "guard"]}
                strokeWidth="0.12"
                strokeDasharray="0.35 0.25"
                opacity="0.7"
              />
            )}
            <circle cx={gd.route[0][0] + 0.5} cy={gd.route[0][1] + 0.5} r={gd.kind === "dog" ? 0.3 : 0.38} fill={GUARD_HEX[gd.kind ?? "guard"]} />
          </g>
        ))}
      {routes &&
        (def.drones ?? []).map((d, i) => (
          <g key={`dr${i}`}>
            <polyline points={[...d.route, d.route[0]].map(([x, z]) => `${x + 0.5},${z + 0.5}`).join(" ")} fill="none" stroke="#67e8f9" strokeWidth="0.12" strokeDasharray="0.15 0.2" opacity="0.8" />
            <circle cx={d.route[0][0] + 0.5} cy={d.route[0][1] + 0.5} r="0.75" fill="#67e8f9" opacity="0.3" />
          </g>
        ))}
      {(def.cameras ?? []).map((c, i) => {
        const a = (c.dir * Math.PI) / 180;
        const cx = c.x + 0.5;
        const cy = c.z + 0.5;
        const s = (c.sweep * Math.PI) / 360;
        const r = Math.min(3.2, (c.range ?? 6.6) * 0.55);
        return <path key={`c${i}`} d={`M${cx} ${cy}L${cx + Math.sin(a - s) * r} ${cy + Math.cos(a - s) * r}A${r} ${r} 0 0 0 ${cx + Math.sin(a + s) * r} ${cy + Math.cos(a + s) * r}Z`} fill="#60a5fa" opacity="0.3" />;
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
      <rect x={p.exit.x} y={p.exit.z} width="1" height="1" fill="#22c55e" />
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

// --- Title screen ------------------------------------------------------------------------------------------

export function MenuScreen({ save, onPlay, onFiles, onShop, onHelp, onControls, touch }: { save: Save; onPlay: () => void; onFiles: () => void; onShop: () => void; onHelp: () => void; onControls: () => void; touch: boolean }) {
  const next = nextHeist(save);
  const done = Object.keys(save.heists).length;
  const district = districtOf(next);
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col bg-[linear-gradient(to_bottom,rgb(5_7_13/0.86),rgb(5_7_13/0.35)_38%,rgb(5_7_13/0.3)_55%,rgb(5_7_13/0.92))]">
      <div className="pointer-events-auto flex items-center justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:p-5">
        <SystemButtons onHelp={onHelp}>
          <ControlsButton onClick={onControls} />
        </SystemButtons>
      </div>
      <div className="px-4 pt-1 text-center sm:pt-3 land:pt-0">
        <GameTitle game={GAME} />
        <p className="g-display mt-3 text-sm text-[#f5f0e1]/85 [text-shadow:0_2px_8px_#000] sm:text-base land:mt-1">Five districts. Forty heists. Not a sound.</p>
      </div>
      <div className="flex-1" />
      <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-8 land:space-y-2">
        <p className="g-display text-center text-xs text-[#f5f0e1] [text-shadow:0_1px_4px_#000]">
          {done >= TOTAL_HEISTS ? "Every heist pulled off" : `Next: ${caseNo(next)} · ${LEVELS[next].name}`} · {district.name}
        </p>
        <BigButton onClick={onPlay} icon={<Play className="size-6 fill-current" />} autoFocus>
          <span data-nh-play>{done === 0 ? "Play" : "Continue"}</span>
        </BigButton>
        <div className="grid grid-cols-2 gap-2">
          <SoftChip onClick={onFiles} label="Heists">
            <MapIcon className="size-4" /> Heists
            <span className="inline-flex items-center gap-1 text-xs tabular-nums">
              <Star className="size-3 fill-current" /> {totalStars(save)}/{TOTAL_HEISTS * 3}
            </span>
          </SoftChip>
          <SoftChip onClick={onShop} label="Shop">
            <ShoppingBag className="size-4" /> Shop
            <span className="inline-flex items-center gap-1 text-xs tabular-nums">
              <Banknote className="size-3.5" /> {fmtMoney(save.bank)}
            </span>
          </SoftChip>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-bold">
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5">{findItem(THIEVES, save.thief).name}</span>
          <button type="button" onClick={onHelp} className="g-hud g-display inline-flex items-center gap-1.5 px-3 py-1.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <CircleHelp className="size-3.5" /> How to play
          </button>
        </div>
        <p className="text-center text-xs font-semibold text-[#f5f0e1]/75 [text-shadow:0_1px_4px_#000] land:hidden">
          {touch ? "Left stick to move · tap the floor to throw a coin" : "WASD move · Shift sneak · Space run · E use · click to throw · G gadget · Q map"}
        </p>
      </div>
    </div>
  );
}

function SoftChip({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="g-hud g-display flex items-center justify-center gap-2 px-3 py-3 text-sm hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:py-2">
      {children}
    </button>
  );
}

// --- Case files (district and heist select) -----------------------------------------------------------------

export function CaseFiles({ save, district, onDistrict, onPick, onBack, onShop }: { save: Save; district: number; onDistrict: (d: number) => void; onPick: (i: number) => void; onBack: () => void; onShop: () => void }) {
  const d = DISTRICTS[district];
  const open = districtOpen(save, district);
  const first = district * HEISTS_PER_DISTRICT;
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[linear-gradient(180deg,#05070de6,#05070db3_40%,#05070df0)]">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-3 pt-[max(env(safe-area-inset-top),10px)] pb-6 sm:px-6">
        <div className="flex items-center gap-2 py-1">
          <button type="button" onClick={onBack} className="g-hud g-display inline-flex h-10 items-center gap-1 px-3 text-xs hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:h-8">
            <ChevronLeft className="size-4" /> Back
          </button>
          <h2 className="g-title min-w-0 flex-1 truncate text-2xl sm:text-3xl">Heists</h2>
          <span className="g-hud g-display inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs tabular-nums">
            <Star className="size-3.5 fill-[var(--accent)] text-[var(--accent)]" /> {totalStars(save)}/{TOTAL_HEISTS * 3}
          </span>
          <button type="button" onClick={onShop} className="g-hud g-display inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs tabular-nums hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <Banknote className="size-3.5" /> {fmtMoney(save.bank)}
          </button>
        </div>
        <div className="mt-2 flex gap-1.5" role="tablist" aria-label="Districts">
          {DISTRICTS.map((dd, i) => {
            const ok = districtOpen(save, i);
            return (
              <button
                key={dd.id}
                type="button"
                role="tab"
                aria-selected={i === district}
                onClick={() => onDistrict(i)}
                title={dd.name}
                style={i === district ? { background: dd.color, color: "#0b0f19" } : undefined}
                className={`g-display flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[3px] px-1 py-1.5 text-[11px] transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${i === district ? "" : "g-hud hover:brightness-125"} ${ok ? "" : "opacity-60"}`}
              >
                <span className="flex w-full items-center justify-center gap-1">
                  {!ok && <Lock className="size-3 shrink-0" />}
                  <span className="truncate">
                    {i + 1}
                    <span className="hidden sm:inline"> · {dd.name}</span>
                  </span>
                </span>
                <span className="tabular-nums opacity-80">
                  {districtStars(save, i)}/{HEISTS_PER_DISTRICT * 3}★
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-center">
          <p className="g-display text-lg text-[#f5f0e1] sm:text-xl">{d.name}</p>
          <p className="text-xs text-[#f5f0e1]/70 sm:text-sm">
            {d.blurb} · {d.security}
          </p>
          {!open && (
            <p className="g-display mt-1 text-xs text-[#fca5a5]">
              <Lock className="mr-1 inline size-3.5" />
              Pull off every heist in {DISTRICTS[district - 1].name} to open this district
            </p>
          )}
        </div>
        <ol className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 land:grid-cols-4">
          {Array.from({ length: HEISTS_PER_DISTRICT }, (_, n) => {
            const i = first + n;
            const def = LEVELS[i];
            const rec = save.heists[String(i)];
            const can = isUnlocked(i, save);
            const tilt = [-1.2, 0.9, -0.6, 1.2, 0.8, -1, 1.1, -0.8][n];
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!can}
                  onClick={() => onPick(i)}
                  style={{ transform: `rotate(${tilt}deg)` }}
                  aria-label={`${caseNo(i)}: ${def.name}${can ? "" : " — locked"}`}
                  className="g-panel group relative block w-full p-1.5 pb-2 text-left transition hover:-translate-y-1 hover:shadow-[0_20px_40px_#000d] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed"
                >
                  <div className="relative overflow-hidden rounded-[2px] bg-[#0c1a2e] ring-1 ring-black/40">
                    <MapSketch index={i} routes={false} className={`block aspect-[16/9] w-full ${can ? "" : "opacity-25 blur-[1px]"}`} />
                    {!can && (
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="g-display -rotate-6 border-2 border-[#f87171] bg-black/60 px-2 py-1 text-center text-[10px] leading-tight text-[#fca5a5] sm:text-xs">
                          <Lock className="mx-auto mb-0.5 size-4" />
                          Pull off the heist before
                        </span>
                      </div>
                    )}
                    {rec && rec.stars === 3 && <span className="g-display absolute top-1.5 right-1.5 rotate-12 border-2 border-[#f87171] bg-black/50 px-1.5 text-[10px] text-[#fca5a5]">Perfect</span>}
                    {def.timer && can && (
                      <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-[2px] bg-black/60 px-1 text-[10px] font-bold text-[#fde68a]">
                        <Hourglass className="size-3" /> {def.timer}s
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-start justify-between gap-1 px-1">
                    <div className="min-w-0">
                      <p className="g-muted text-[9px] font-bold tracking-[0.16em] uppercase">{caseNo(i)}</p>
                      <p className="g-display truncate text-[13px] leading-tight sm:text-base">{def.name}</p>
                    </div>
                    <Stamps stars={rec?.stars ?? 0} />
                  </div>
                  <p className="g-muted mt-0.5 truncate px-1 text-[11px] tabular-nums">{rec ? `Best ${fmtTime(rec.time)} · ${fmtMoney(rec.value)}` : def.place}</p>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-center text-xs text-[#f5f0e1]/60">Escape with the target for ★ · no alarm for ★ · every valuable for ★. The loot you carry out is cash for the shop.</p>
      </div>
    </div>
  );
}

// --- Briefing ------------------------------------------------------------------------------------------------

export function Briefing({ index, save, onStart, onBack, onShop, touch }: { index: number; save: Save; onStart: () => void; onBack: () => void; onShop: () => void; touch: boolean }) {
  const def = LEVELS[index];
  const record: HeistRecord | undefined = save.heists[String(index)];
  const district = districtOf(index);
  const parsed = useMemo(() => parseLevel(def, index), [def, index]);
  const kinds = (k: string) => def.guards.filter((g) => (g.kind ?? "guard") === k).length;
  const dogs = kinds("dog");
  const people = def.guards.length - dogs;
  const gadget = GADGETS.find((g) => g.id === save.gadget);
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="flex min-h-full items-end justify-end p-3 pt-[max(env(safe-area-inset-top),12px)] sm:items-center sm:p-6">
        <div role="dialog" aria-label={`${caseNo(index)}: ${def.name}`} className="g-panel relative w-full max-w-md p-4 sm:p-6">
          <span className="g-display absolute -top-3 right-5 rotate-3 border-2 border-[#b91c1c] bg-[#ecdfbf] px-2 py-0.5 text-xs text-[#b91c1c]">Confidential</span>
          <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">
            {caseNo(index)} · {district.name} · {def.place}
          </p>
          <h2 className="g-panel-title mt-1 text-3xl leading-tight sm:text-4xl">{def.name}</h2>
          <div className="mt-3 overflow-hidden rounded-[2px] ring-1 ring-black/40">
            <MapSketch index={index} className="block max-h-[30vh] w-full land:max-h-[38vh]" />
          </div>
          <p className="mt-3 text-sm leading-relaxed">{def.brief}</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li className="flex items-center gap-2">
              <Gem className="size-4 shrink-0" style={{ color: GEM_HEX[def.target.gem] }} />
              <span>
                Steal the <b>{def.target.name}</b> ({fmtMoney(district.targetValue)})
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Coins className="size-4 shrink-0" />
              <span>
                {parsed.lootTotal} other valuable{parsed.lootTotal === 1 ? "" : "s"} · {def.coins} coin{def.coins === 1 ? "" : "s"} to throw
              </span>
            </li>
            {def.timer && (
              <li className="flex items-center gap-2 font-bold text-[#b91c1c]">
                <Hourglass className="size-4 shrink-0" />
                <span>Vault timer: {def.timer} seconds to get out once you lift it</span>
              </li>
            )}
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
            {people} guard{people === 1 ? "" : "s"}
            {dogs ? ` · ${dogs} dog${dogs === 1 ? "" : "s"}` : ""}
            {def.cameras?.length ? ` · ${def.cameras.length} camera${def.cameras.length === 1 ? "" : "s"}` : ""}
            {def.lasers?.length ? " · lasers" : ""}
            {def.drones?.length ? ` · ${def.drones.length} drone${def.drones.length === 1 ? "" : "s"}` : ""}
            {record ? ` · best ${fmtTime(record.time)}, ${record.stars}★` : ""}
          </p>
          <button type="button" onClick={onShop} className="g-tint mt-2 flex w-full items-center justify-between gap-2 rounded-[3px] px-2.5 py-1.5 text-left text-xs font-bold hover:brightness-95 focus-visible:outline-2 focus-visible:outline-[#1c1917]">
            <span className="min-w-0 truncate">
              {findItem(THIEVES, save.thief).name}
              {gadget ? ` · ${gadget.name}` : " · no gadget"}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 underline underline-offset-2">
              <ShoppingBag className="size-3.5" /> Change
            </span>
          </button>
          <div className="mt-3 space-y-2">
            <BigButton onClick={onStart} autoFocus icon={<Play className="size-5 fill-current" />}>
              <span data-nh-begin>Begin the heist</span>
            </BigButton>
            <SoftButton onClick={onBack} icon={<ChevronLeft className="size-4" />}>
              Heists
            </SoftButton>
          </div>
          {!touch && <p className="g-muted mt-3 text-center text-[11px]">WASD move · Shift sneak · Space run · E use · click to throw · G gadget · Q map</p>}
        </div>
      </div>
    </div>
  );
}

// --- HUD -------------------------------------------------------------------------------------------------

export function HudOverlay({ store, onPause, onMap, touch }: { store: Store<Hud | null>; onPause: () => void; onMap: () => void; touch: boolean }) {
  const hud = useStore(store);
  const land = usePhoneLandscape();
  if (!hud) return null;
  const def = LEVELS[hud.level];
  const lit = hud.cloaked ? "Smoke" : hud.light > 0.6 ? "Lit" : hud.light > 0.35 ? "Dim" : "Hidden";
  const susp = hud.alarm ? 1 : hud.suspicion;
  return (
    <>
      {hud.alarm && <div className="pointer-events-none absolute inset-0 animate-pulse shadow-[inset_0_0_120px_30px_rgb(220_38_38/0.45)]" />}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(env(safe-area-inset-top),8px)] sm:p-4">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
        <div data-avoid className="g-hud max-w-[56vw] px-3 py-2 text-xs sm:max-w-xs sm:text-sm land:max-w-[36vw] land:py-1">
          <p className="g-display truncate text-[10px] opacity-70 sm:text-xs land:hidden">
            {caseNo(hud.level)} · {def.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 font-bold">
            <Gem className="size-3.5 shrink-0" style={{ color: hud.gem ? "#4ade80" : GEM_HEX[def.target.gem] }} />
            <span className="truncate">{hud.objective}</span>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums opacity-90 land:mt-0.5">
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
            {hud.gadget && hud.gadget !== "lockpick" && (
              <span className={`inline-flex items-center gap-1 ${hud.charges ? "text-[#7dd3fc]" : "opacity-50"}`} title="Gadget uses left (G)">
                <GadgetIcon id={hud.gadget} className="size-3.5" /> {hud.charges}
              </span>
            )}
            {hud.camerasOff && (
              <span className="inline-flex items-center gap-1 text-[#93c5fd]" title="Cameras offline">
                <CameraOff className="size-3.5" />
              </span>
            )}
          </p>
        </div>
        {touch && <Senses hud={hud} lit={lit} row={land} />}
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div data-avoid className={`g-hud g-display flex items-center gap-2 px-3 py-1.5 text-xs sm:text-sm ${hud.alarm ? "animate-pulse !border-[#ef4444] !bg-[#7f1d1d]/90 text-white" : ""}`} role="status">
            {hud.alarm ? <Siren className="size-4" /> : susp > 0.3 ? <Eye className="size-4 text-[#fbbf24]" /> : <EyeOff className="size-4 opacity-70" />}
            <span>{hud.alarm ? `Alarm · ${hud.alarmLeft}s` : susp > 0.3 ? "Suspicious" : "Unseen"}</span>
          </div>
          {!hud.alarm && (
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
              <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${susp * 100}%`, background: susp > 0.6 ? "#f97316" : "#fbbf24" }} />
            </div>
          )}
          {hud.timer >= 0 && (
            <div className={`g-hud g-display flex items-center gap-1.5 px-3 py-1 text-sm tabular-nums ${hud.timer <= 10 ? "animate-pulse !border-[#ef4444] text-[#fca5a5]" : "text-[#fde68a]"}`} role="timer" aria-label="Vault timer">
              <Hourglass className="size-4" /> {fmtTime(hud.timer)}
            </div>
          )}
        </div>
        <div data-avoid className={`pointer-events-auto flex items-start gap-2 ${land ? "flex-row-reverse" : ""}`}>
          <div className={`flex gap-2 ${land ? "flex-row-reverse" : "flex-col"}`}>
            <IconButton onClick={onPause} label="Pause (Esc)" small={land}>
              <Pause className="size-5 fill-current" />
            </IconButton>
            <IconButton onClick={onMap} label={hud.overview ? "Close the map (Q)" : "Overview map (Q)"} dim={!hud.overview} small={land}>
              <MapIcon className="size-5" />
            </IconButton>
          </div>
          <div className="hidden sm:block land:hidden">
            <SystemButtons vertical />
          </div>
        </div>
      </div>

      {/* Visibility and noise: under the objective on touch screens, in the bottom corner otherwise. */}
      {!touch && (
        <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),16px)] left-2 sm:left-4">
          <Senses hud={hud} lit={lit} row={false} />
        </div>
      )}

      {hud.prompt && (
        <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${touch ? (land ? "top-[58px]" : "bottom-[40%]") : "bottom-[max(env(safe-area-inset-bottom),24px)]"}`}>
          <div className="g-hud g-display px-4 py-2 text-sm">
            <p className="flex items-center gap-2">
              {!touch && hud.crack === 0 && <kbd className="rounded-[3px] border border-current px-1.5 text-xs">E</kbd>}
              {touch && <Hand className="size-4" />}
              {hud.prompt}
            </p>
            {hud.crack > 0 && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-[#7dd3fc]" style={{ width: `${hud.crack * 100}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
      <p className="g-display pointer-events-none absolute right-3 bottom-[max(env(safe-area-inset-bottom),12px)] hidden items-center gap-1.5 text-xs text-white/70 tabular-nums sm:flex land:hidden">
        <Timer className="size-3.5" /> {fmtTime(hud.time)}
      </p>
    </>
  );
}

/** How lit the thief is and how much noise he makes. */
function Senses({ hud, lit, row }: { hud: Hud; lit: string; row: boolean }) {
  return (
    <div data-avoid className={`flex gap-1.5 ${row ? "flex-row" : "flex-col"}`}>
      <div className="g-hud flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold land:py-1">
        {lit === "Hidden" || lit === "Smoke" ? <EyeOff className="size-4 text-[#93c5fd]" /> : <Eye className={`size-4 ${lit === "Lit" ? "text-[#fbbf24]" : "text-[#fde68a]/70"}`} />}
        <span className="w-12">{lit}</span>
        <span className="flex h-2.5 w-14 gap-0.5 land:w-8" aria-hidden>
          {[0.2, 0.4, 0.6, 0.8].map((v) => (
            <span key={v} className={`flex-1 ${!hud.cloaked && hud.light >= v ? "bg-[#fbbf24]" : "bg-white/15"}`} />
          ))}
        </span>
      </div>
      <div className="g-hud flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold land:py-1">
        <Footprints className={`size-4 ${hud.stance === "run" ? "text-[#f87171]" : hud.stance === "walk" ? "text-[#fde68a]" : "text-[#93c5fd]"}`} />
        <span className="w-12">{hud.stance === "run" ? "Loud" : hud.stance === "walk" ? "Soft" : hud.stance === "sneak" ? "Silent" : hud.sneakLock ? "Sneak" : "Still"}</span>
        <span className="flex h-2.5 w-14 items-end gap-0.5 land:w-8" aria-hidden>
          {[1, 2, 3].map((v) => (
            <span key={v} className={`flex-1 ${(hud.stance === "run" ? 3 : hud.stance === "walk" ? 1 : 0) >= v ? "bg-[#f87171]" : "bg-white/15"}`} style={{ height: `${v * 33}%` }} />
          ))}
        </span>
      </div>
    </div>
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
    <div className="pointer-events-none absolute inset-x-0 top-[104px] flex flex-col items-center gap-1.5 px-4 sm:top-[96px] land:top-[52px]">
      {toasts.map((t) => (
        <p key={t.id} className={`g-display max-w-md animate-[game-fade_0.3s_ease] px-3 py-1.5 text-center text-xs sm:text-sm ${t.tone === "bad" ? "border border-[#ef4444] bg-[#7f1d1d]/90 text-white" : t.tone === "good" ? "g-hud text-[#fde68a]" : "g-hud"}`}>
          {t.text}
        </p>
      ))}
    </div>
  );
}

// --- Result --------------------------------------------------------------------------------------------------

export interface Outcome extends Result {
  best: boolean;
  /** Cash banked for this run. */
  paid: number;
  bank: number;
}

const CAUGHT: Record<string, string> = {
  laser: "after tripping a laser",
  plate: "after stepping on a pressure plate",
  camera: "after a camera spotted you",
  drone: "after a drone spotted you",
  dog: "after a guard dog found you",
  timer: "after the vault timer ran out",
};

export function ResultCard({ result, nextOpen, onNext, onRetry, onMenu, onShop }: { result: Outcome; nextOpen: boolean; onNext: () => void; onRetry: () => void; onMenu: () => void; onShop: () => void }) {
  const def = LEVELS[result.level];
  const last = result.level === TOTAL_HEISTS - 1;
  const districtDone = result.escaped && (result.level + 1) % HEISTS_PER_DISTRICT === 0;
  const canNext = result.escaped && nextOpen && !last;
  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/55 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-3">
        <div role="dialog" aria-label={result.escaped ? "Escaped" : "Caught"} className="g-panel relative w-full max-w-md p-4 sm:p-6">
          <p className="g-muted text-xs font-bold tracking-[0.2em] uppercase">
            {caseNo(result.level)} · {def.name}
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="g-panel-title text-4xl">{result.escaped ? "Escaped" : "Caught"}</h2>
            <span className={`g-display -rotate-6 border-[3px] px-2 py-1 text-sm ${result.escaped ? "border-[#15803d] text-[#15803d]" : "border-[#b91c1c] text-[#b91c1c]"}`}>{result.escaped ? (result.alarm ? "Case closed" : "Clean job") : "Arrested"}</span>
          </div>
          {result.escaped ? (
            <>
              <div className="mt-2 flex items-center justify-center gap-3">
                <Stamps stars={result.stars} size="lg" />
              </div>
              <ul className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px] font-bold">
                <li className="g-tint rounded-[3px] px-1 py-1.5">★ Escaped</li>
                <li className={`g-tint rounded-[3px] px-1 py-1.5 ${result.alarm ? "line-through opacity-50" : ""}`}>★ No alarm</li>
                <li className={`g-tint rounded-[3px] px-1 py-1.5 ${result.loot < result.lootTotal ? "line-through opacity-50" : ""}`}>★ All loot</li>
              </ul>
              <p className="g-display mt-3 flex items-center justify-center gap-1.5 text-sm text-[#15803d]">
                <Banknote className="size-4" /> +{fmtMoney(result.paid)} banked · {fmtMoney(result.bank)} in all
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed">
              You were caught {CAUGHT[result.reason] ?? "by a night guard"}. The {def.target.name} stays where it is — for tonight.
            </p>
          )}
          <dl className="mt-3 grid grid-cols-4 gap-1.5 text-sm">
            <ResultStat label="Time" value={fmtTime(result.time)} note={result.escaped && result.time <= result.par ? "under par" : undefined} />
            <ResultStat label="Loot" value={`${result.loot}/${result.lootTotal}`} />
            <ResultStat label="Haul" value={fmtMoney(result.value)} />
            <ResultStat label="KOs" value={String(result.knockouts)} />
          </dl>
          {result.best && result.escaped && <p className="g-display mt-2 text-center text-sm text-[#b91c1c]">New best for this heist</p>}
          {districtDone && <p className="g-display mt-2 text-center text-sm">{last ? "That was the last heist. The city is yours — go back for three stars everywhere." : `${districtOf(result.level).name} is cleaned out. ${DISTRICTS[districtIndex(result.level) + 1].name} is open.`}</p>}
          <div className="mt-4 space-y-2">
            {canNext ? (
              <BigButton onClick={onNext} autoFocus icon={<ArrowRight className="size-5" />}>
                <span data-nh-next>Next heist</span>
              </BigButton>
            ) : (
              <BigButton onClick={onRetry} autoFocus icon={<RotateCcw className="size-5" />}>
                <span data-nh-retry>{result.escaped ? "Play again" : "Try again"}</span>
              </BigButton>
            )}
            <div className="grid grid-cols-3 gap-2">
              <SoftButton onClick={onRetry} icon={<RotateCcw className="size-4" />}>
                Retry
              </SoftButton>
              <SoftButton onClick={onMenu} icon={<Home className="size-4" />}>
                Heists
              </SoftButton>
              <SoftButton onClick={onShop} icon={<ShoppingBag className="size-4" />}>
                Shop
              </SoftButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="g-tint rounded-[3px] px-1 py-2 text-center">
      <dt className="g-muted text-[10px] font-bold tracking-[0.1em] uppercase">{label}</dt>
      <dd className="g-display text-sm tabular-nums sm:text-base">{value}</dd>
      {note && <dd className="text-[10px] font-bold text-[#15803d]">{note}</dd>}
    </div>
  );
}
