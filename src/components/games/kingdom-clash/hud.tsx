"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRightToLine, ArrowUpCircle, Check, ChevronsRight, CircleHelp, Clock, Crown, Dices, Expand, Globe, Hammer, Home, Info, LayoutGrid, Lock, Map as MapIcon, Moon, Music, PackageOpen, Pause, Play, Search, Settings, Shield, ShoppingCart, Shrink, Sparkles, Star, Swords, Trophy, Users, Volume2, X, Zap } from "lucide-react";
import { audio } from "../shared/audio";
import { useNativeApp } from "../shared/native-app";
import {
  BigButton,
  IconButton,
  PhoneRotateIcon,
  rotateScreen,
  SoftButton,
  SystemButtons,
  SystemMenu,
  toggleFullscreen,
  useAudioSettings,
  useFullscreen,
  useMediaQuery,
  usePhoneLandscape,
} from "../shared/ui";
import {
  ACHIEVEMENTS,
  BUILDINGS,
  HEROES,
  SHOP_ORDER,
  SPELL_ORDER,
  SPELLS,
  TROOP_ORDER,
  TROOPS,
  allowed,
  formatTime,
  gemsForResource,
  gemsToFinish,
  shortNumber,
  unlockTh,
  isHero,
  levelMul,
  type BKind,
  type HeroKind,
  type SpellKind,
  type TroopKind,
} from "./data";
import type { BattleHud, BattleResult, HeroHud, Quality, SelectedInfo, Slot, VillageHud } from "./engine";
import { ONLINE_LOOT, searchCost, stage as stageOf } from "./layouts";
import { SITE } from "@/lib/site";
import * as V from "./village";

// --- Little pieces ---------------------------------------------------------------------------------------

/** A rendered portrait (data URL made in the browser, so next/image has nothing to optimize). */
export function Pic({ src, className }: { src: string; alt: ""; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- data URL rendered in the browser
  return <img src={src} alt="" className={className} />;
}

export function ResIcon({ res, size = 16 }: { res: "gold" | "elixir" | "gems"; size?: number }) {
  if (res === "gold")
    return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: "radial-gradient(circle at 35% 30%,#fff7c2,#fbbf24 45%,#b45309)", boxShadow: "0 0 0 2px #78350f" }} />;
  if (res === "elixir")
    return (
      <span
        aria-hidden
        className="inline-block shrink-0"
        style={{ width: size * 0.85, height: size * 1.05, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%", background: "radial-gradient(circle at 35% 35%,#fbcfe8,#d946ef 50%,#701a75)", boxShadow: "0 0 0 2px #4a044e" }}
      />
    );
  return <span aria-hidden className="inline-block shrink-0" style={{ width: size * 0.85, height: size * 0.85, transform: "rotate(45deg)", background: "linear-gradient(135deg,#d1fae5,#10b981 55%,#065f46)", boxShadow: "0 0 0 2px #064e3b" }} />;
}

/** A price; when you can't pay it the number turns red on a white chip (readable on any button). */
export function Cost({ res, amount, have }: { res: "gold" | "elixir" | "gems"; amount: number; have?: number }) {
  const short = have !== undefined && have < amount;
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${short ? "rounded-md bg-white px-1.5 font-black text-red-600 ring-2 ring-red-500 [text-shadow:none]" : ""}`}>
      <ResIcon res={res} size={14} />
      {shortNumber(amount)}
    </span>
  );
}

export function Bar({ value, color, className = "", rtl = false }: { value: number; color: string; className?: string; rtl?: boolean }) {
  return (
    <div className={`flex h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_18%,transparent)] ${rtl ? "justify-end" : ""} ${className}`}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, background: color }} />
    </div>
  );
}

export function Stars({ n, size = 16, total = 3 }: { n: number; size?: number; total?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: total }, (_, i) => (
        <Star key={i} style={{ width: size, height: size }} className={i < n ? "fill-amber-300 text-amber-600" : "fill-[color-mix(in_srgb,currentColor_15%,transparent)] text-[color-mix(in_srgb,currentColor_35%,transparent)]"} />
      ))}
    </span>
  );
}

/** Shared frame for the big panels (shop, army, campaign). */
function Sheet({ title, onClose, children, tabs, wide = true }: { title: string; onClose: () => void; children: ReactNode; tabs?: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[2px] land:bg-black/55 land:backdrop-blur-none" onPointerDown={(e) => e.stopPropagation()}>
      {/* Phones in landscape: a full-screen sheet (beside the camera cutout), like a mobile game's menus. */}
      <div className="safe-pad flex h-full items-end justify-center sm:items-center sm:p-4 land:safe-pad">
        <div
          role="dialog"
          aria-label={title}
          className={`g-panel flex max-h-[min(88vh,760px)] w-full flex-col overflow-hidden land:h-full land:max-h-full land:max-w-none ${wide ? "max-w-3xl" : "max-w-md"}`}
        >
          {/* Landscape phones: the tabs sit in the title row to leave the height for the content. */}
          <div className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-2 sm:px-5 land:gap-2 land:pt-2.5 land:pb-1.5">
            <h2 className={`g-panel-title flex-1 truncate text-2xl sm:text-3xl land:text-2xl ${tabs ? "land:flex-none" : ""}`}>{title}</h2>
            {tabs && <div className="no-scrollbar hidden min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 land:flex">{tabs}</div>}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="g-tint grid size-10 shrink-0 place-items-center rounded-full hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-11 land:border-[3px] land:border-red-900 land:bg-gradient-to-b land:from-red-400 land:to-red-700 land:text-white land:shadow-[0_3px_0_#7f1d1d]"
            >
              <X className="size-5 land:size-6" strokeWidth={3} />
            </button>
          </div>
          {/* shrink-0: a long panel must not squash the tabs (an overflowing row may otherwise shrink to nothing). */}
          {tabs && <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pt-0.5 pb-2.5 sm:px-5 land:hidden">{tabs}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 land:pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" data-active={active} onClick={onClick} className={`g-soft shrink-0 px-3.5 py-2 text-sm font-bold land:px-3 land:py-1.5 ${active ? "" : "opacity-75"}`}>
      <span className="g-unskew gap-1.5">{children}</span>
    </button>
  );
}

// --- Top bar ------------------------------------------------------------------------------------------------

type TopBarProps = { hud: VillageHud; onSettings: () => void; onHelp: () => void; onDefend: () => void; onEdit: () => void };

export function TopBar(props: TopBarProps) {
  const land = usePhoneLandscape();
  if (land) return <LandTopBar {...props} />;
  const { hud, onSettings, onHelp, onDefend, onEdit } = props;
  return (
    // Compact on phones held upright (narrower than `sm`), a little roomier on bigger screens.
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-1.5 sm:p-2.5">
      <div className="flex min-w-0 flex-col gap-1 sm:gap-1.5">
        <VillageChip hud={hud} />
        <BuildersChip hud={hud} />
        <RaidersChip hud={hud} onDefend={onDefend} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:gap-1.5">
        <ResourceBar res="gold" value={hud.gold} cap={hud.goldCap} />
        <ResourceBar res="elixir" value={hud.elixir} cap={hud.elixirCap} />
        <GemsChip gems={hud.gems} />
        {/* One menu button keeps the top bar roomy; it opens edit, settings, sound, help, full screen and turn. */}
        <div className="pointer-events-auto mt-0.5">
          <SystemMenu onHelp={onHelp} small>
            <IconButton label="Edit layout" onClick={onEdit} small>
              <LayoutGrid className="size-[18px]" />
            </IconButton>
            <IconButton label="Settings" onClick={onSettings} small>
              <Settings className="size-[18px]" />
            </IconButton>
          </SystemMenu>
        </div>
      </div>
    </div>
  );
}

/**
 * Landscape phones (and the Android app): one slim band — village and settings top-left, builders and
 * raid warning top-centre, resources stacked top-right — so the village keeps the middle of the screen.
 */
function LandTopBar({ hud, onSettings, onHelp, onDefend, onEdit }: TopBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-2.5 pt-2">
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <VillageChip hud={hud} small />
        <SystemButtons onHelp={onHelp} small>
          <IconButton label="Edit layout" onClick={onEdit} small>
            <LayoutGrid className="size-[18px]" />
          </IconButton>
          <IconButton label="Settings" onClick={onSettings} small>
            <Settings className="size-[18px]" />
          </IconButton>
        </SystemButtons>
      </div>
      <div className="absolute top-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <BuildersChip hud={hud} />
        <RaidersChip hud={hud} onDefend={onDefend} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ResourceBar res="gold" value={hud.gold} cap={hud.goldCap} small />
        <ResourceBar res="elixir" value={hud.elixir} cap={hud.elixirCap} small />
        <GemsChip gems={hud.gems} small />
      </div>
    </div>
  );
}

function VillageChip({ hud, small = false }: { hud: VillageHud; small?: boolean }) {
  return (
    <div className={`g-hud pointer-events-auto flex items-center ${small ? "gap-2 py-1 pr-3 pl-1" : "gap-1.5 py-0.5 pr-2.5 pl-0.5 sm:gap-2 sm:py-1 sm:pr-3 sm:pl-1"}`}>
      <span
        className={`g-display grid shrink-0 place-items-center rounded-[10px] bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950 ring-2 ring-amber-900 ${small ? "size-8 text-base" : "size-7 rounded-lg text-sm sm:size-8 sm:rounded-[10px] sm:text-base"}`}
      >
        {hud.th}
      </span>
      <div className="min-w-0">
        <p className={`g-display truncate leading-tight ${small ? "max-w-[8.5rem] text-sm" : "max-w-[9.5rem] text-xs sm:max-w-[13rem] sm:text-sm"}`}>{hud.name || "Your village"}</p>
        <p className={`flex items-center font-bold opacity-80 ${small ? "gap-2 text-[11px]" : "gap-1.5 text-[10px] sm:gap-2 sm:text-[11px]"}`}>
          <span className="inline-flex items-center gap-0.5">
            <Trophy className="size-2.5 text-amber-300 sm:size-3" />
            {hud.trophies}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-2.5 fill-amber-300 text-amber-300 sm:size-3" />
            {hud.stars}
          </span>
        </p>
      </div>
    </div>
  );
}

function BuildersChip({ hud }: { hud: VillageHud }) {
  return (
    <div className="g-hud inline-flex w-fit items-center gap-1 px-2 py-0.5 text-[10px] font-bold whitespace-nowrap sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs">
      <Hammer className="size-3 text-amber-300 sm:size-3.5" /> Builders {hud.freeBuilders}/{hud.builders}
    </div>
  );
}

function RaidersChip({ hud, onDefend }: { hud: VillageHud; onDefend: () => void }) {
  if (hud.raidIn < 0 || hud.raidIn > 45) return null;
  return (
    <div className="g-hud pointer-events-auto flex w-fit animate-[game-fade_0.4s_ease] items-center gap-1.5 py-0.5 pr-1 pl-2 text-[10px] font-bold whitespace-nowrap sm:gap-2 sm:py-1 sm:pl-2.5 sm:text-xs">
      <Shield className="size-3 text-red-400 sm:size-3.5" />
      Raiders in {formatTime(hud.raidIn)}
      <button type="button" onClick={onDefend} className="g-btn px-1.5 py-0.5 text-[10px] sm:px-2 sm:text-xs">
        <span className="g-unskew">Defend</span>
      </button>
    </div>
  );
}

function GemsChip({ gems, small = false }: { gems: number; small?: boolean }) {
  return (
    <div className={`g-hud flex items-center ${small ? "w-[7.25rem] gap-2 py-0.5 pr-3 pl-2" : "w-[6.75rem] gap-1.5 py-0.5 pr-2 pl-1.5 sm:w-36 sm:gap-2 sm:py-1 sm:pr-2.5 sm:pl-2"}`}>
      <ResIcon res="gems" size={14} />
      <span className={`g-display flex-1 text-right tabular-nums ${small ? "text-sm" : "text-[13px] sm:text-base"}`}>{gems}</span>
    </div>
  );
}

/** The storage cap sits after the amount ("3,214 /5K"), so each bar stays one slim row. */
function ResourceBar({ res, value, cap, small = false }: { res: "gold" | "elixir"; value: number; cap: number; small?: boolean }) {
  const full = value >= cap;
  return (
    <div className={`g-hud ${small ? "w-[7.25rem] px-2 py-1" : "w-[6.75rem] py-1 pr-2 pl-1.5 sm:w-36 sm:pr-2.5 sm:pl-2"}`}>
      <div className={`flex items-center ${small ? "gap-2" : "gap-1.5 sm:gap-2"}`}>
        <ResIcon res={res} size={14} />
        <span className={`g-display flex-1 text-right leading-none tabular-nums ${small ? "text-sm" : "text-[13px] sm:text-base"} ${full ? "text-amber-300" : ""}`}>
          {shortNumber(value)}
          <span className={`ml-0.5 opacity-60 ${small ? "text-[9px]" : "text-[9px] sm:text-[10px]"}`}>/{shortNumber(cap)}</span>
        </span>
      </div>
      <Bar rtl value={cap ? value / cap : 0} color={res === "gold" ? "linear-gradient(270deg,#fde68a,#f59e0b)" : "linear-gradient(270deg,#f5d0fe,#c026d3)"} className={small ? "mt-1 h-1.5" : "mt-1 h-1 sm:h-1.5"} />
    </div>
  );
}

// --- Bottom bar & building panel ----------------------------------------------------------------------------

export function BottomBar({ hud, onRaid, onShop, onArmy, tutorial }: { hud: VillageHud; onRaid: () => void; onShop: () => void; onArmy: () => void; tutorial: number }) {
  const glow = "animate-pulse ring-4 ring-amber-300";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2 pb-2.5 sm:p-4 land:p-2.5">
      <button type="button" onClick={onRaid} className={`g-btn pointer-events-auto flex flex-col items-center px-4 py-2 sm:px-6 sm:py-3 land:px-5 land:py-2 ${tutorial === 4 ? glow : ""}`} aria-label="Raid (R)">
        <span className="g-unskew flex-col gap-0">
          <Swords className="size-7 sm:size-8 land:size-6" />
          <span className="text-lg leading-none sm:text-xl land:text-lg">Raid</span>
        </span>
      </button>
      <div className="flex items-end gap-2">
        <button type="button" onClick={onArmy} className={`g-soft pointer-events-auto flex flex-col items-center px-3 py-2 font-bold sm:px-4 land:px-3 land:py-1.5 ${tutorial === 3 ? glow : ""}`} aria-label="Army (T)">
          <span className="g-unskew flex-col gap-0">
            <Users className="size-6" />
            <span className="g-display text-sm leading-tight">Army</span>
            <span className="text-[10px] tabular-nums opacity-90">
              {hud.army}/{hud.housing}
            </span>
          </span>
        </button>
        <button type="button" onClick={onShop} className={`g-btn pointer-events-auto flex flex-col items-center px-4 py-2 sm:px-5 land:px-4 land:py-1.5 ${tutorial === 1 || tutorial === 2 ? glow : ""}`} aria-label="Shop (B)">
          <span className="g-unskew flex-col gap-0">
            <ShoppingCart className="size-7 land:size-6" />
            <span className="text-lg leading-none">Shop</span>
          </span>
        </button>
      </div>
    </div>
  );
}

export function BuildingPanel({
  info,
  hud,
  icon,
  onUpgrade,
  onFinish,
  onCollect,
  onPanel,
  onWalls,
  onClose,
  onBuy,
  onHeal,
  onDetails,
}: {
  info: SelectedInfo;
  hud: VillageHud;
  icon?: string;
  onUpgrade: () => void;
  onFinish: () => void;
  onCollect: () => void;
  onPanel: (p: "army" | "lab" | "spells") => void;
  onWalls: () => void;
  onClose: () => void;
  onBuy: (res: "gold" | "elixir", amount: number, gems: number) => void;
  onHeal: () => void;
  /** Opens the full building popup (large portraits of this level and the next, every stat). */
  onDetails?: () => void;
}) {
  const up = info.upgrade;
  const have = up ? (up.res === "gold" ? hud.gold : up.res === "elixir" ? hud.elixir : hud.gems) : 0;
  const missing = up && up.res !== "gems" && have < up.cost ? up.cost - have : 0;
  const cap = up?.res === "gold" ? hud.goldCap : hud.elixirCap;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[96px] flex justify-center px-2 sm:bottom-[104px] land:right-[11.5rem] land:bottom-2.5 land:left-[6.75rem] land:px-0">
      <div
        className="g-panel pointer-events-auto w-full max-w-xl animate-[game-fade_0.25s_ease] p-3 sm:p-4 land:max-h-[calc(100dvh-5.5rem)] land:overflow-y-auto land:p-2.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 land:items-center land:gap-2">
          {icon && (
            <button type="button" onClick={onDetails} aria-label="Building details" title="Details" className="shrink-0">
              <Pic src={icon} alt="" className="size-14 rounded-xl bg-[color-mix(in_srgb,currentColor_8%,transparent)] land:size-10" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="g-panel-title text-xl leading-tight sm:text-2xl land:text-lg">
              {info.name}
              {info.kind !== "obstacle" && <span className="g-muted ml-2 text-base">Level {info.level}</span>}
            </h3>
            <p className="g-muted hidden text-xs leading-snug sm:block land:hidden">{info.desc}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="g-tint grid size-8 shrink-0 place-items-center rounded-full">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 land:mt-1.5">
          {info.stats.map((s) => (
            <div key={s.label} className="g-tint rounded-lg px-2 py-1">
              <p className="g-muted text-[10px] font-bold tracking-wide uppercase">{s.label}</p>
              <p className="text-sm leading-tight font-bold">
                {s.value}
                {s.next && <span className="ml-1 text-green-700">→ {s.next}</span>}
              </p>
            </div>
          ))}
        </div>
        {info.busy && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{info.busy.label}</span>
              <span className="tabular-nums">{formatTime(info.busy.left)}</span>
            </div>
            <Bar value={1 - info.busy.left / info.busy.total} color="linear-gradient(90deg,#86efac,#16a34a)" className="mt-1" />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 land:mt-2">
          {info.busy && (
            <button type="button" onClick={onFinish} className="g-btn flex-1 px-3 py-2 text-base land:py-1.5">
              <span className="g-unskew gap-1.5">
                Finish now <ResIcon res="gems" size={14} /> {info.busy.gems}
              </span>
            </button>
          )}
          {up && (
            <button type="button" onClick={onUpgrade} disabled={!up.reason?.startsWith("Not enough") && !up.can} className="g-btn flex-1 px-3 py-2 text-base disabled:opacity-55 land:py-1.5">
              <span className="g-unskew flex-col gap-0 leading-tight">
                <span className="inline-flex items-center gap-1.5">
                  <ArrowUpCircle className="size-4" />
                  {up.label} <span className="kc-hide-sm opacity-70">(U)</span>
                </span>
                {up.cost > 0 ? (
                  <span className="inline-flex items-center gap-2 text-sm">
                    <Cost res={up.res} amount={up.cost} have={have} />
                    {up.time > 0 && (
                      <span className="inline-flex items-center gap-0.5 opacity-85">
                        <Clock className="size-3.5" />
                        {formatTime(up.time)}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs opacity-90">{up.reason}</span>
                )}
              </span>
            </button>
          )}
          {missing > 0 && missing <= cap && (
            <button type="button" onClick={() => onBuy(up!.res as "gold" | "elixir", missing, gemsForResource(missing))} className="g-soft px-3 py-2 text-sm font-bold">
              <span className="g-unskew gap-1">
                Buy {shortNumber(missing)} <ResIcon res={up!.res} size={12} /> for <ResIcon res="gems" size={12} /> {gemsForResource(missing)}
              </span>
            </button>
          )}
          {info.kind === "wall" && up?.cost ? (
            <SoftButtonInline onClick={onWalls}>Upgrade all level-{info.level} walls</SoftButtonInline>
          ) : null}
          {info.heal && (
            <SoftButtonInline onClick={onHeal}>
              <Moon className="size-4" /> Wake now <ResIcon res="gems" size={12} /> {info.heal.gems}
            </SoftButtonInline>
          )}
          {info.collect && (
            <SoftButtonInline onClick={onCollect}>
              Collect <ResIcon res={info.collect.res} size={13} /> {shortNumber(info.collect.amount)}
            </SoftButtonInline>
          )}
          {info.panel && (
            <SoftButtonInline onClick={() => onPanel(info.panel!)}>
              {info.panel === "army" ? "Train troops" : info.panel === "lab" ? "Research" : "Brew spells"}
            </SoftButtonInline>
          )}
        </div>
        {up?.reason && !up.can && <p className="mt-1.5 text-center text-xs font-bold text-red-700">{up.reason}</p>}
      </div>
    </div>
  );
}

function SoftButtonInline({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="g-soft flex-1 px-3 py-2 text-sm font-bold whitespace-nowrap land:py-1.5">
      <span className="g-unskew gap-1.5">{children}</span>
    </button>
  );
}

export function PlacingBar({ hud, onConfirm, onCancel, onRow, className = "" }: { hud: VillageHud; onConfirm: () => void; onCancel: () => void; onRow: () => void; className?: string }) {
  const p = hud.placing!;
  const def = BUILDINGS[p.kind];
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-2 ${className || "bottom-[96px] sm:bottom-[104px] land:right-[11.5rem] land:bottom-2.5 land:left-[6.75rem] land:px-0"}`}>
      <div className="g-hud pointer-events-auto flex items-center gap-3 py-2 pr-2 pl-4 land:gap-2 land:py-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <div>
          <p className="g-display text-base leading-tight">{def.name}</p>
          <p className="text-xs opacity-80">{p.valid ? (p.kind === "wall" ? "Walls follow on in a line" : "Drag it into place") : "Not enough room here"}</p>
        </div>
        {!p.tray && (
          <span className="text-sm font-bold">
            <Cost res={p.res as "gold" | "elixir"} amount={p.cost} have={p.res === "gold" ? hud.gold : hud.elixir} />
          </span>
        )}
        {p.kind === "wall" && (
          <button type="button" onClick={onRow} disabled={!p.valid} aria-label="Place a row of walls" title="Place a straight row (up to 10)" className="g-soft flex h-12 items-center px-3 text-sm font-bold disabled:opacity-50">
            <span className="g-unskew gap-1">
              <ArrowRightToLine className="size-5" /> Row
            </span>
          </button>
        )}
        <button type="button" onClick={onConfirm} disabled={!p.valid} aria-label="Place (Enter)" className="g-btn grid size-12 place-items-center disabled:opacity-50">
          <span className="g-unskew">
            <Check className="size-6" />
          </span>
        </button>
        <button type="button" onClick={onCancel} aria-label="Cancel (Esc)" className="g-soft grid size-12 place-items-center">
          <span className="g-unskew">
            <X className="size-6" />
          </span>
        </button>
      </div>
    </div>
  );
}

// --- Shop ----------------------------------------------------------------------------------------------------

const SHOP_TABS: { id: string; label: string; kinds: BKind[] }[] = [
  { id: "res", label: "Resources", kinds: ["goldmine", "elixirpump", "goldstorage", "elixirstorage", "builder"] },
  { id: "army", label: "Army & Heroes", kinds: ["barracks", "camp", "lab", "spellfactory", "kingaltar", "queenaltar"] },
  { id: "def", label: "Defences", kinds: ["cannon", "archertower", "catapult", "magetower", "tesla", "bomb", "skeltrap", "wall"] },
];

export function Shop({ save, icons, onBuy, onClose }: { save: V.Save; icons: Record<string, string>; onBuy: (k: BKind) => void; onClose: () => void }) {
  const [tab, setTab] = useState(() => (save.tutorial <= 2 ? "res" : "def"));
  const th = V.thLevel(save);
  const kinds = SHOP_TABS.find((t) => t.id === tab)!.kinds;
  return (
    <Sheet
      title="Shop"
      onClose={onClose}
      tabs={SHOP_TABS.map((t) => (
        <Tab key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
          {t.label}
        </Tab>
      ))}
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 land:flex land:h-full land:snap-x land:gap-2.5 land:overflow-x-auto land:pb-1">
        {kinds
          .filter((k) => SHOP_ORDER.includes(k))
          .map((k) => {
            const def = BUILDINGS[k];
            const max = allowed(k, th);
            const have = V.countOf(save, k);
            const cost = V.buildCost(save, k);
            const locked = max === 0;
            const full = have >= max;
            const res = def.res as "gold" | "elixir";
            const hint = save.tutorial === 1 && k === "goldmine" ? true : save.tutorial === 2 && k === "elixirpump";
            return (
              <button
                key={k}
                type="button"
                disabled={locked || full}
                onClick={() => onBuy(k)}
                className={`g-tint relative flex flex-col items-center rounded-xl p-2 text-center transition hover:brightness-105 disabled:opacity-60 land:w-[152px] land:shrink-0 land:snap-start land:justify-center land:px-2.5 ${hint ? "ring-4 ring-amber-400 ring-inset" : ""}`}
              >
                {icons[`b:${k}`] ? <Pic src={icons[`b:${k}`]} alt="" className="size-20 land:size-24" /> : <div className="size-20 land:size-24" />}
                <span className="g-display text-base leading-tight">{def.name}</span>
                <span className="g-muted text-[11px] font-bold">
                  {locked ? `Town Hall ${unlockTh(k)}` : `Built ${have}/${max}`}
                </span>
                <span className="mt-1 inline-flex items-center gap-2 text-sm font-bold">
                  <Cost res={res} amount={cost} have={locked || full ? undefined : save[res]} />
                  {def.time[0] > 0 && (
                    <span className="g-muted inline-flex items-center gap-0.5 text-xs">
                      <Clock className="size-3" />
                      {formatTime(def.time[0])}
                    </span>
                  )}
                </span>
                {(locked || full) && (
                  <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-[color-mix(in_srgb,currentColor_15%,transparent)]">
                    {locked ? <Lock className="size-3.5" /> : <Check className="size-3.5" />}
                  </span>
                )}
                <span className="g-muted mt-1 line-clamp-2 text-[10px] leading-tight land:line-clamp-3 land:text-[11px]">{def.desc}</span>
              </button>
            );
          })}
      </div>
      {th < 5 && <p className="g-muted mt-3 text-center text-xs font-semibold land:hidden">Upgrade your Town Hall to unlock more buildings and higher levels.</p>}
    </Sheet>
  );
}

// --- Army: train, brew, research ----------------------------------------------------------------------------

export function ArmyPanel({
  save,
  hud,
  icons,
  initial,
  onTrain,
  onUntrain,
  onBrew,
  onUnbrew,
  onResearch,
  onFinishTraining,
  onFinishBrewing,
  onFinishResearch,
  onClose,
}: {
  save: V.Save;
  hud: VillageHud;
  icons: Record<string, string>;
  initial: "army" | "lab" | "spells";
  onTrain: (k: TroopKind) => void;
  onUntrain: (k: TroopKind) => void;
  onBrew: (k: SpellKind) => void;
  onUnbrew: (k: SpellKind) => void;
  onResearch: (k: TroopKind | SpellKind) => void;
  onFinishTraining: () => void;
  onFinishBrewing: () => void;
  onFinishResearch: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initial);
  const barracks = V.barracksLevel(save);
  const speed = V.trainSpeed(save);
  const factory = V.factoryLevel(save);
  const lab = V.labLevel(save);
  const queue = new Map<TroopKind, number>();
  for (const k of save.queue) queue.set(k, (queue.get(k) ?? 0) + 1);
  const brewing = new Map<SpellKind, number>();
  for (const k of save.brew) brewing.set(k, (brewing.get(k) ?? 0) + 1);
  return (
    <Sheet
      title={tab === "army" ? "Train troops" : tab === "spells" ? "Brew spells" : "Laboratory"}
      onClose={onClose}
      tabs={
        <>
          <Tab active={tab === "army"} onClick={() => setTab("army")}>
            <Users className="size-4" /> Troops
          </Tab>
          <Tab active={tab === "spells"} onClick={() => setTab("spells")}>
            <Zap className="size-4" /> Spells
          </Tab>
          <Tab active={tab === "lab"} onClick={() => setTab("lab")}>
            <Sparkles className="size-4" /> Lab
          </Tab>
        </>
      }
    >
      {tab === "army" && (
        <div className="land:grid land:grid-cols-[minmax(0,14.5rem)_minmax(0,1fr)] land:items-start land:gap-3">
          <div className="land:sticky land:top-0">
            <div className="g-tint rounded-xl p-3">
              <div className="flex items-center justify-between text-sm font-bold">
                <span>Army camps</span>
                <span className="tabular-nums">
                  {hud.army}
                  {hud.queued ? ` (+${hud.queued})` : ""} / {hud.housing}
                </span>
              </div>
              <Bar value={hud.housing ? (hud.army + hud.queued) / hud.housing : 0} color="linear-gradient(90deg,#93c5fd,#2563eb)" className="mt-1.5" />
              <p className={`mt-1.5 text-[11px] font-bold ${speed > 1 ? "text-green-700" : "g-muted"}`}>
                {speed > 1 ? `${speed} barracks: training ${speed}× faster` : "Build another barracks to train twice as fast"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TROOP_ORDER.filter((k) => (save.army[k] ?? 0) > 0).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,currentColor_10%,transparent)] py-0.5 pr-2 pl-0.5 text-xs font-bold">
                    {icons[`t:${k}`] && <Pic src={icons[`t:${k}`]} alt="" className="size-6" />}×{save.army[k]}
                  </span>
                ))}
                {!TROOP_ORDER.some((k) => (save.army[k] ?? 0) > 0) && <span className="g-muted text-xs">No troops yet — train some below.</span>}
              </div>
              {save.queue.length > 0 && (
                <div className="mt-3 border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] pt-2">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span>Training · {formatTime(hud.trainLeft)}</span>
                    <button type="button" onClick={onFinishTraining} className="g-btn px-2.5 py-1 text-sm">
                      <span className="g-unskew gap-1">
                        Finish <ResIcon res="gems" size={12} /> {gemsToFinish(hud.trainLeft)}
                      </span>
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {[...queue].map(([k, n]) => (
                      <button key={k} type="button" onClick={() => onUntrain(k)} title="Remove one" className="relative inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,currentColor_10%,transparent)] py-0.5 pr-2 pl-0.5 text-xs font-bold">
                        {icons[`t:${k}`] && <Pic src={icons[`t:${k}`]} alt="" className="size-6" />}×{n}
                        <X className="size-3 text-red-600" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {hud.heroes.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2.5 land:mt-2 land:grid-cols-1 land:gap-2">
                {hud.heroes.map((h) => (
                  <HeroCard key={h.kind} h={h} icon={icons[`t:${h.kind}`]} />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 land:mt-0 land:grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] land:gap-2">
              {TROOP_ORDER.map((k) => {
                const t = TROOPS[k];
                const level = save.troopLv[k];
                const locked = barracks < t.barracks;
                const cost = t.cost[level - 1];
                const room = hud.army + hud.queued + t.housing <= hud.housing;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={locked}
                    onClick={() => onTrain(k)}
                    className={`g-tint relative flex flex-col items-center rounded-xl p-2 text-center transition hover:brightness-105 disabled:opacity-55 ${!room && !locked ? "opacity-75" : ""} ${save.tutorial === 3 && k === "warrior" ? "ring-4 ring-amber-400" : ""}`}
                  >
                    {icons[`t:${k}`] ? <Pic src={icons[`t:${k}`]} alt="" className="size-16" /> : <div className="size-16" />}
                    <span className="absolute top-1.5 left-1.5 rounded-md bg-gradient-to-b from-amber-300 to-amber-600 px-1.5 text-[11px] font-black text-amber-950 ring-1 ring-amber-900">{level}</span>
                    {(queue.get(k) ?? 0) > 0 && <span className="absolute top-1.5 right-1.5 rounded-md bg-sky-600 px-1.5 text-[11px] font-black text-white">+{queue.get(k)}</span>}
                    <span className="g-display text-sm leading-tight">{t.name}</span>
                    {locked ? (
                      <span className="g-muted inline-flex items-center gap-1 text-[11px] font-bold">
                        <Lock className="size-3" /> Barracks {t.barracks}
                      </span>
                    ) : (
                      <>
                        <span className="text-xs font-bold">
                          <Cost res="elixir" amount={cost} have={save.elixir} />
                        </span>
                        <span className="g-muted text-[10px] font-bold land:text-[11px]">
                          Space {t.housing} · {formatTime(Math.max(1, Math.round(t.train / speed)))}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="g-muted mt-3 text-center text-xs land:mt-2">
              Tap a troop to train it. New troops march from the Barracks to your Army Camps.{hud.heroes.length === 0 && " Build the King's Altar (Town Hall 3) for your first hero."}
            </p>
          </div>
        </div>
      )}
      {tab === "spells" && (
        <>
          {factory === 0 ? (
            <p className="g-tint rounded-xl p-4 text-center text-sm font-semibold">
              {save.buildings.some((b) => b.kind === "spellfactory")
                ? "Your Spell Factory is being built: you can brew spells as soon as it's finished."
                : V.thLevel(save) >= 3
                  ? "Build a Spell Factory (Shop → Army & Heroes) to brew spells."
                  : "The Spell Factory unlocks at Town Hall 3. Upgrade your Town Hall to brew spells."}
            </p>
          ) : (
            <>
              <div className="g-tint rounded-xl p-3">
                <div className="flex items-center justify-between text-sm font-bold">
                  <span>Spells</span>
                  <span className="tabular-nums">
                    {hud.spells}
                    {save.brew.length ? ` (+${save.brew.length})` : ""} / {hud.spellSlots}
                  </span>
                </div>
                <Bar value={hud.spellSlots ? (hud.spells + save.brew.length) / hud.spellSlots : 0} color="linear-gradient(90deg,#f5d0fe,#a21caf)" className="mt-1.5" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SPELL_ORDER.filter((k) => (save.spells[k] ?? 0) > 0).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,currentColor_10%,transparent)] px-1.5 py-0.5 text-xs font-bold">
                      <SpellOrb kind={k} size={18} />×{save.spells[k]}
                    </span>
                  ))}
                  {[...brewing].map(([k, n]) => (
                    <button key={k} type="button" onClick={() => onUnbrew(k)} className="inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,currentColor_10%,transparent)] px-1.5 py-0.5 text-xs font-bold opacity-80">
                      <SpellOrb kind={k} size={18} /> brewing ×{n} <X className="size-3 text-red-600" />
                    </button>
                  ))}
                  {!SPELL_ORDER.some((k) => (save.spells[k] ?? 0) > 0) && !save.brew.length && <span className="g-muted text-xs">No spells yet: tap one below to brew it.</span>}
                </div>
                {save.brew.length > 0 && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-[color-mix(in_srgb,currentColor_15%,transparent)] pt-2 text-xs font-bold">
                    <span>
                      Brewing {save.brew.length} spell{save.brew.length > 1 ? "s" : ""} · {formatTime(hud.brewLeft)}
                    </span>
                    <button type="button" onClick={onFinishBrewing} className="g-btn px-2.5 py-1 text-sm">
                      <span className="g-unskew gap-1">
                        Finish <ResIcon res="gems" size={12} /> {gemsToFinish(hud.brewLeft)}
                      </span>
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 land:mt-2 land:grid-cols-5 land:gap-2">
                {SPELL_ORDER.map((k) => {
                  const sp = SPELLS[k];
                  const level = save.spellLv[k];
                  const locked = factory < sp.factory;
                  return (
                    <button key={k} type="button" disabled={locked} onClick={() => onBrew(k)} className="g-tint relative flex flex-col items-center gap-1 rounded-xl p-3 text-center transition hover:brightness-105 disabled:opacity-55 land:p-2">
                      <SpellOrb kind={k} size={52} />
                      <span className="absolute top-1.5 left-1.5 rounded-md bg-gradient-to-b from-amber-300 to-amber-600 px-1.5 text-[11px] font-black text-amber-950 ring-1 ring-amber-900">{level}</span>
                      <span className="g-display text-sm leading-tight">{sp.name}</span>
                      {locked ? (
                        <span className="g-muted inline-flex items-center gap-1 text-[11px] font-bold">
                          <Lock className="size-3" /> Factory {sp.factory}
                        </span>
                      ) : (
                        <span className="text-xs font-bold">
                          <Cost res="elixir" amount={sp.cost[level - 1]} have={save.elixir} /> · {formatTime(sp.brew)}
                        </span>
                      )}
                      <span className="g-muted text-[10px] leading-tight land:line-clamp-3">{sp.desc}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      {tab === "lab" && (
        <>
          {lab === 0 ? (
            <p className="g-tint rounded-xl p-4 text-center text-sm font-semibold">Build a Laboratory (Town Hall 2) to research stronger troops and spells.</p>
          ) : (
            <>
              {hud.research && (
                <div className="g-tint rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2 text-sm font-bold">
                    <span>
                      Researching {hud.research.kind in TROOPS ? TROOPS[hud.research.kind as TroopKind].name : SPELLS[hud.research.kind as SpellKind].name} · {formatTime(hud.research.left)}
                    </span>
                    <button type="button" onClick={onFinishResearch} className="g-btn px-2.5 py-1 text-sm">
                      <span className="g-unskew gap-1">
                        Finish <ResIcon res="gems" size={12} /> {gemsToFinish(hud.research.left)}
                      </span>
                    </button>
                  </div>
                  <Bar value={1 - hud.research.left / hud.research.total} color="linear-gradient(90deg,#86efac,#16a34a)" className="mt-1.5" />
                </div>
              )}
              <p className="g-muted mt-2 text-xs font-semibold">Laboratory level {lab}: troops and spells can be researched up to level {lab}.</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[...TROOP_ORDER, ...SPELL_ORDER].map((k) => {
                  const info = V.researchInfo(save, k);
                  const isTroop = k in TROOPS;
                  const name = isTroop ? TROOPS[k as TroopKind].name : SPELLS[k as SpellKind].name;
                  return (
                    <div key={k} className="g-tint flex items-center gap-2 rounded-xl p-2">
                      {isTroop ? icons[`t:${k}`] ? <Pic src={icons[`t:${k}`]} alt="" className="size-11" /> : <div className="size-11" /> : <SpellOrb kind={k as SpellKind} size={40} />}
                      <div className="min-w-0 flex-1">
                        <p className="g-display text-sm leading-tight">
                          {name} <span className="g-muted">Lv {info.level}</span>
                        </p>
                        {info.max ? (
                          <p className="text-xs font-bold text-green-700">Max level</p>
                        ) : !info.unlocked ? (
                          <p className="g-muted text-xs font-bold">Not unlocked yet</p>
                        ) : (
                          <p className="text-xs font-bold">
                            <Cost res="elixir" amount={info.cost} have={save.elixir} /> · {formatTime(info.time)}
                            {!info.ready && <span className="ml-1 text-red-700">· Lab {info.needLab}</span>}
                          </p>
                        )}
                      </div>
                      {!info.max && info.unlocked && (
                        <button type="button" disabled={!info.ready || !!save.research} onClick={() => onResearch(k)} className="g-btn px-2.5 py-1.5 text-sm disabled:opacity-50">
                          <span className="g-unskew">Lv {info.level + 1}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function HeroCard({ h, icon }: { h: HeroHud; icon?: string }) {
  const def = HEROES[h.kind];
  const status = h.level < 1 ? "Altar being built" : h.upgrading ? "Training (upgrade)" : h.ready ? "Ready to fight" : `Sleeping · ${formatTime(h.left)}`;
  return (
    <div className="g-tint flex items-center gap-2 rounded-xl p-2">
      {icon ? <Pic src={icon} alt="" className="size-14 land:size-12" /> : <Crown className="size-10 text-amber-600" />}
      <div className="min-w-0 flex-1">
        <p className="g-display truncate text-sm leading-tight">
          {def.name} <span className="g-muted">Lv {Math.max(1, h.level)}</span>
        </p>
        <p className={`text-[11px] font-bold ${h.ready ? "text-green-700" : "g-muted"}`}>{status}</p>
        <Bar value={h.hp} color={h.ready ? "linear-gradient(90deg,#86efac,#16a34a)" : "linear-gradient(90deg,#c4b5fd,#7c3aed)"} className="mt-1" />
        <p className="g-muted mt-0.5 truncate text-[10px]">
          {Math.round(def.hp * levelMul(Math.max(1, h.level)))} HP · {def.ability.name}
        </p>
      </div>
    </div>
  );
}

const SPELL_GLYPH: Record<SpellKind, string> = { lightning: "⚡", heal: "✚", rage: "✸", freeze: "❄", jump: "⤊" };

export function SpellOrb({ kind, size = 32 }: { kind: SpellKind; size?: number }) {
  const c = SPELLS[kind].color;
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.5, background: `radial-gradient(circle at 35% 30%, #ffffff, ${c} 45%, color-mix(in srgb, ${c} 50%, #1e1b4b))`, boxShadow: `0 0 0 2px #1f2937, 0 0 ${size / 3}px ${c}`, textShadow: "0 1px 2px #0008" }}
    >
      {SPELL_GLYPH[kind]}
    </span>
  );
}

// --- Campaign -------------------------------------------------------------------------------------------------

/** The Raid panel: online battles against random rival villages, and the 100-stage campaign. */
export function Campaign({ save, hud, onAttack, onOnline, onClose }: { save: V.Save; hud: VillageHud; onAttack: (stage: number) => void; onOnline: () => void; onClose: () => void }) {
  // Your first raid is campaign stage 1 (the tutorial points there); after that online battles come first.
  const [tab, setTab] = useState<"online" | "campaign">(save.stats.raids > 0 ? "online" : "campaign");
  const tabs = (
    <>
      <Tab active={tab === "online"} onClick={() => setTab("online")}>
        <Globe className="size-4" /> Online
      </Tab>
      <Tab active={tab === "campaign"} onClick={() => setTab("campaign")}>
        <MapIcon className="size-4" /> Campaign
      </Tab>
    </>
  );
  return (
    <Sheet title={tab === "online" ? "Online battle" : `Campaign · ${hud.stars}/300 ★`} onClose={onClose} tabs={tabs}>
      {tab === "online" ? <OnlineTab save={save} hud={hud} onFind={onOnline} /> : <CampaignStages save={save} hud={hud} onAttack={onAttack} />}
    </Sheet>
  );
}

function OnlineTab({ save, hud, onFind }: { save: V.Save; hud: VillageHud; onFind: () => void }) {
  const cost = searchCost(hud.th);
  const hasTroops = TROOP_ORDER.some((k) => (save.army[k] ?? 0) > 0) || hud.heroes.some((h) => h.ready);
  const loot = ONLINE_LOOT[hud.th - 1];
  const low = Math.round((loot * 0.6) / 100) * 100;
  const high = Math.round((loot * 1.6) / 100) * 100;
  return (
    <div className="grid gap-3 land:grid-cols-[minmax(0,1fr)_16.5rem] land:items-start">
      <div className="g-tint rounded-xl p-3 sm:p-4">
        <p className="g-muted text-[11px] font-bold tracking-wide uppercase">Town Hall {hud.th} · random rivals</p>
        <h3 className="g-panel-title text-2xl land:text-xl">Raid a rival village</h3>
        <p className="mt-1 text-sm leading-snug font-semibold">
          Every search finds a different village at your Town Hall level (sometimes one above or below), packed with gold and elixir. Look it over first: tap <b>Next</b> for another village, or drop a troop to start the attack.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
          <span className="g-muted text-xs">Loot in each village:</span>
          <Cost res="gold" amount={low} />–<Cost res="gold" amount={high} />
          <Cost res="elixir" amount={low} />–<Cost res="elixir" amount={high} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,currentColor_10%,transparent)] px-2 py-1">
            <Trophy className="size-3.5 text-amber-600" /> {hud.trophies} trophies
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,currentColor_10%,transparent)] px-2 py-1">
            <Swords className="size-3.5" /> {save.stats.onlineWins ?? 0} online wins
          </span>
        </div>
      </div>
      <div className="g-tint rounded-xl p-3 land:[&_.g-btn]:py-2.5 land:[&_.g-btn]:text-xl">
        <BigButton onClick={onFind} disabled={!hasTroops || save.gold < cost} icon={<Search className="size-6" />}>
          {hasTroops ? "Find a match" : "Train troops first"}
        </BigButton>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs font-bold">
          Each search costs <Cost res="gold" amount={cost} have={save.gold} />
        </p>
        <p className="g-muted mt-1 text-center text-[11px] font-semibold">
          Army: {hud.army} troop space{hud.spells ? ` · ${hud.spells} spells` : ""}
          {hud.heroes.map((h) => ` · ${HEROES[h.kind].name} ${h.ready ? "ready" : h.upgrading ? "training" : "sleeping"}`).join("")}. Stars win trophies; a defeat loses some.
        </p>
      </div>
    </div>
  );
}

function CampaignStages({ save, hud, onAttack }: { save: V.Save; hud: VillageHud; onAttack: (stage: number) => void }) {
  const unlocked = V.unlockedStage(save);
  const [sel, setSel] = useState(unlocked);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector(`[data-stage="${unlocked}"]`)?.scrollIntoView({ block: "center" });
  }, [unlocked]);
  const st = stageOf(sel);
  const stars = save.stars[sel - 1] ?? 0;
  const locked = sel > unlocked;
  const hasTroops = TROOP_ORDER.some((k) => (save.army[k] ?? 0) > 0) || hud.heroes.some((h) => h.ready);
  const bonusClaimed = save.bonus.includes(sel);
  const bands = ["#65a30d", "#0891b2", "#7c3aed", "#c2410c", "#b91c1c"];
  return (
    <>
      <div className="land:grid land:grid-cols-[minmax(0,1fr)_16.5rem] land:items-start land:gap-3">
        <div ref={listRef} className="grid grid-cols-5 gap-2 sm:grid-cols-10 land:grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] land:gap-1.5">
          {Array.from({ length: 100 }, (_, i) => {
            const n = i + 1;
            const s = save.stars[i] ?? 0;
            const lock = n > unlocked;
            const th = Math.min(5, 1 + Math.floor(i / 20));
            return (
              <button
                key={n}
                type="button"
                data-stage={n}
                onClick={() => setSel(n)}
                className={`relative flex flex-col items-center rounded-xl py-1.5 transition ${sel === n ? "ring-4 ring-amber-400" : ""} ${lock ? "opacity-45" : "hover:brightness-110"}`}
                style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${bands[th - 1]} 70%, white), ${bands[th - 1]})`, boxShadow: "inset 0 -3px 0 #0003" }}
              >
                <span className="g-display text-lg leading-none text-white [text-shadow:0_2px_0_#0007]">{lock ? <Lock className="size-4" /> : n}</span>
                <span className="mt-0.5 text-white">
                  <Stars n={s} size={10} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="g-tint sticky bottom-0 mt-3 rounded-xl p-3 backdrop-blur land:top-0 land:bottom-auto land:mt-0 land:[&_.g-btn]:py-2.5 land:[&_.g-btn]:text-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="g-muted text-[11px] font-bold tracking-wide uppercase">
                Stage {sel} · Town Hall {st.th} · {st.difficulty}
                {st.power > 1.01 && <span className="ml-1 text-red-700">· Elite +{Math.round((st.power - 1) * 100)}%</span>}
              </p>
              <h3 className="g-panel-title truncate text-2xl land:text-xl">{st.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold">
                <span className="g-muted text-xs">Loot:</span>
                <Cost res="gold" amount={st.gold} />
                <Cost res="elixir" amount={st.elixir} />
              </div>
              {!bonusClaimed && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold">
                  <span className="g-muted">First clear bonus:</span>
                  <Cost res="gold" amount={st.bonusGold} />
                  <Cost res="elixir" amount={st.bonusElixir} />
                  <Cost res="gems" amount={st.bonusGems} />
                </div>
              )}
            </div>
            <div className="shrink-0 text-center">
              <Stars n={stars} size={22} />
              <p className="g-muted text-[10px] font-bold">best</p>
            </div>
          </div>
          <div className="mt-2">
            <BigButton onClick={() => onAttack(sel)} disabled={locked || !hasTroops} icon={<Swords className="size-6" />}>
              {locked ? "Earn a star on the stage before" : hasTroops ? "Attack!" : "Train troops first"}
            </BigButton>
          </div>
          <p className="g-muted mt-1.5 text-center text-[11px] font-semibold">
            Army: {hud.army} troop space{hud.spells ? ` · ${hud.spells} spells` : ""}
            {hud.heroes.map((h) => ` · ${HEROES[h.kind].name} ${h.ready ? "ready" : h.upgrading ? "training" : "sleeping"}`).join("")}. Every attack steals loot — farm any stage again.
          </p>
        </div>
      </div>
    </>
  );
}

// --- Battle HUD -----------------------------------------------------------------------------------------------

export function BattleBar({ b, icons, onSlot, onEnd, onPause, onSpeed, onNext }: { b: BattleHud; icons: Record<string, string>; onSlot: (id: string) => void; onEnd: () => void; onPause: () => void; onSpeed: () => void; onNext: () => void }) {
  const raid = b.mode === "raid";
  const endLabel = b.percent > 0 || b.started ? "End battle" : raid ? "Retreat" : "Skip";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
        <div className="g-hud max-w-[46%] px-3 py-1.5 land:max-w-[34%]">
          <p className="g-display truncate text-base leading-tight sm:text-lg">{raid && !b.online ? `${b.stage}. ${b.name}` : b.name}</p>
          {b.online && (
            <p className="flex items-center gap-1.5 truncate text-[11px] font-bold opacity-90">
              {b.online.owner} · TH {b.online.th} · <Trophy className="size-3 text-amber-300" /> +{b.online.win} / −{b.online.lose}
            </p>
          )}
          {raid ? (
            <div className="mt-0.5 space-y-0.5 text-xs font-bold">
              <p className="flex items-center gap-1.5">
                <ResIcon res="gold" size={12} />
                <span className="tabular-nums">{shortNumber(b.gold)}</span>
                <span className="opacity-60">/ {shortNumber(b.goldAvail)}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <ResIcon res="elixir" size={12} />
                <span className="tabular-nums">{shortNumber(b.elixir)}</span>
                <span className="opacity-60">/ {shortNumber(b.elixirAvail)}</span>
              </p>
            </div>
          ) : (
            <p className="text-xs font-bold">Raiders left: {b.raidersLeft}</p>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="g-hud flex items-center gap-2 px-3 py-1">
            <span className="text-amber-300">
              <Stars n={b.stars} size={18} />
            </span>
            <span className="g-display text-xl tabular-nums">{b.percent}%</span>
          </div>
          {!b.started && raid && <p className="g-hud px-2 py-0.5 text-[11px] font-bold">{b.scoutLeft >= 0 ? `Battle starts in ${b.scoutLeft}s` : "Timer starts on your first troop"}</p>}
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1.5 land:flex-row-reverse land:items-center">
          <div className="g-hud flex items-center gap-1.5 px-3 py-1">
            <Clock className="size-4" />
            <span className={`g-display text-xl tabular-nums ${b.timeLeft <= 30 ? "text-red-400" : ""}`}>{formatTime(b.timeLeft).replace(/^(\d+)m (\d+)s$/, "$1:$2")}</span>
          </div>
          <div className="flex gap-1.5">
            <IconButton label="Pause (Esc)" onClick={onPause}>
              <Pause className="size-5 fill-current" />
            </IconButton>
            <button type="button" onClick={onSpeed} className="g-hud g-display grid h-11 min-w-11 place-items-center px-2 text-sm" aria-label="Battle speed">
              {b.speed}×
            </button>
          </div>
          <button type="button" onClick={onEnd} className="g-soft px-3 py-1.5 text-sm font-bold land:hidden">
            <span className="g-unskew">{endLabel}</span>
          </button>
        </div>
      </div>
      <button type="button" onClick={onEnd} className="g-soft pointer-events-auto absolute bottom-2.5 left-2.5 hidden px-3 py-2 text-sm font-bold land:block">
        <span className="g-unskew">{endLabel}</span>
      </button>
      {raid && !b.started && <p className="g-display pointer-events-none absolute inset-x-0 bottom-[104px] text-center text-xl text-white [text-shadow:0_2px_0_#1f2937,1px_0_0_#1f2937,-1px_0_0_#1f2937,0_-1px_0_#1f2937] sm:bottom-[112px] land:hidden">Tap or press and hold to deploy troops</p>}
      {b.online && !b.started && (
        <button type="button" onClick={onNext} onPointerDown={(e) => e.stopPropagation()} aria-label="Next village (Enter)" className="g-btn pointer-events-auto absolute right-3 bottom-[104px] flex flex-col items-center px-5 py-2 sm:bottom-[112px]">
          <span className="g-unskew flex-col gap-0 leading-tight">
            <span className="inline-flex items-center gap-1 text-xl">
              Next <ChevronsRight className="size-6" />
            </span>
            <span className="text-sm">
              <Cost res="gold" amount={b.online.next} />
            </span>
          </span>
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2 pb-2.5 land:px-[8.5rem] land:pb-2">
        <div className="g-hud pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto p-1.5" onPointerDown={(e) => e.stopPropagation()}>
          {b.slots.length === 0 && <p className="px-3 py-3 text-sm font-bold">{raid ? "No troops" : "No troops to defend with — your defences are on their own!"}</p>}
          {b.slots.map((s, i) => (
            <SlotButton key={s.id} s={s} index={i} active={b.selected === s.id} icon={icons[`t:${s.kind}`]} onClick={() => onSlot(s.id)} />
          ))}
        </div>
      </div>
    </>
  );
}

function SlotButton({ s, index, active, icon, onClick }: { s: Slot; index: number; active: boolean; icon?: string; onClick: () => void }) {
  const name = s.spell ? SPELLS[s.kind as SpellKind].name : isHero(s.kind) ? HEROES[s.kind as HeroKind].name : (TROOPS[s.kind as TroopKind]?.name ?? s.kind);
  if (s.hero) return <HeroSlot s={s} index={index} active={active} icon={icon} name={name} onClick={onClick} />;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={s.count === 0}
      aria-label={`${name} (${index < 9 ? index + 1 : 0})`}
      className={`relative flex w-[58px] shrink-0 flex-col items-center rounded-[10px] pt-1 pb-0.5 transition sm:w-16 ${active ? "bg-gradient-to-b from-amber-200 to-amber-500 text-amber-950 ring-2 ring-white" : "bg-[color-mix(in_srgb,currentColor_10%,transparent)]"} disabled:opacity-35`}
    >
      {s.spell ? <SpellOrb kind={s.kind as SpellKind} size={36} /> : icon ? <Pic src={icon} alt="" className="size-9 sm:size-10" /> : <span className="size-9" />}
      <span className="g-display text-sm leading-none tabular-nums">×{s.count}</span>
      <span className="absolute top-0.5 left-1 text-[9px] font-black opacity-75">{index < 9 ? index + 1 : index === 9 ? 0 : ""}</span>
      <span className="absolute top-0.5 right-1 text-[9px] font-black">L{s.level}</span>
    </button>
  );
}

/** A hero in the hotbar: deploy it, then tap again for its ability. */
function HeroSlot({ s, index, active, icon, name, onClick }: { s: Slot; index: number; active: boolean; icon?: string; name: string; onClick: () => void }) {
  const h = s.hero!;
  const ability = h.out && h.ability;
  const spent = h.out && !h.ability;
  const label = !h.out ? name : ability ? HEROES[s.kind as HeroKind].ability.name : h.hp > 0 ? "Fighting" : "Fallen";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={spent}
      aria-label={`${label} (${index < 9 ? index + 1 : 0})`}
      className={`relative flex w-[64px] shrink-0 flex-col items-center rounded-[10px] pt-1 pb-1 transition sm:w-[72px] ${
        ability ? "animate-pulse bg-gradient-to-b from-fuchsia-300 to-purple-600 text-white ring-2 ring-white" : active ? "bg-gradient-to-b from-amber-200 to-amber-500 text-amber-950 ring-2 ring-white" : "bg-[color-mix(in_srgb,currentColor_10%,transparent)]"
      } disabled:opacity-45`}
    >
      {icon ? <Pic src={icon} alt="" className="size-9 sm:size-10" /> : <Crown className="size-9" />}
      <span className="g-display max-w-full truncate px-0.5 text-[10px] leading-none">{ability ? "Ability!" : !h.out ? "Hero" : label}</span>
      <span className="mt-0.5 h-1.5 w-11 overflow-hidden rounded-full bg-black/40">
        <span className="block h-full rounded-full bg-green-400" style={{ width: `${Math.round(h.hp * 100)}%` }} />
      </span>
      <span className="absolute top-0.5 left-1 text-[9px] font-black opacity-75">{index < 9 ? index + 1 : index === 9 ? 0 : ""}</span>
      <span className="absolute top-0.5 right-1 text-[9px] font-black">L{s.level}</span>
    </button>
  );
}

export function ResultModal({ r, icons, onHome }: { r: BattleResult; icons: Record<string, string>; onHome: () => void }) {
  const raid = r.mode === "raid";
  const title = raid ? (r.win ? (r.stars === 3 ? "Flawless victory!" : "Victory!") : "Defeat") : r.win ? "Village defended!" : "Your village was raided";
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-black/50 backdrop-blur-[2px] land:backdrop-blur-none" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4 land:safe-pad">
        <div
          role="dialog"
          aria-label={title}
          className="g-panel w-full max-w-md animate-[game-fade_0.35s_ease] p-5 text-center sm:p-6 land:grid land:max-w-3xl land:grid-cols-2 land:items-center land:gap-6 land:p-5"
        >
          <div>
            <p className="g-muted text-xs font-bold tracking-widest uppercase">{raid ? (r.online ? `Online · ${r.online.owner} · ${r.name}` : `Stage ${r.stage} · ${r.name}`) : r.name}</p>
            <h2 className="g-panel-title mt-1 text-3xl sm:text-4xl">{title}</h2>
            <div className="mt-3 flex justify-center">
              <Stars n={r.stars} size={46} />
            </div>
            <p className="g-display mt-1 text-2xl tabular-nums">{r.percent}% destroyed</p>
            {raid && r.newBest && r.stars > 0 && <p className="mx-auto mt-1 w-fit rounded-full bg-amber-400 px-3 py-0.5 text-xs font-black text-amber-950 uppercase">New best</p>}
          </div>
          <div>
            <div className="g-tint mt-4 rounded-xl p-3 text-left land:mt-0">
              <p className="g-muted text-[11px] font-bold uppercase">{raid ? "Loot" : "Stolen from you"}</p>
              <div className="mt-1 flex items-center justify-center gap-5 text-lg font-black">
                <span className="inline-flex items-center gap-1.5">
                  <ResIcon res="gold" size={18} /> {raid ? "+" : "−"}
                  {shortNumber(r.gold)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ResIcon res="elixir" size={18} /> {raid ? "+" : "−"}
                  {shortNumber(r.elixir)}
                </span>
              </div>
              {r.bonus && (
                <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-green-800">
                  First clear bonus included: <Cost res="gold" amount={r.bonus.gold} /> <Cost res="elixir" amount={r.bonus.elixir} /> <Cost res="gems" amount={r.bonus.gems} />
                </p>
              )}
              <p className="mt-2 flex items-center justify-center gap-1 text-sm font-bold">
                <Trophy className="size-4 text-amber-600" /> {r.trophies >= 0 ? "+" : ""}
                {r.trophies} trophies
              </p>
            </div>
            {(r.troops.length > 0 || r.spells.length > 0) && (
              <div className="mt-3">
                <p className="g-muted text-[11px] font-bold uppercase">{raid ? "Troops used" : "Defenders sent"}</p>
                <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                  {r.troops.map((t) => (
                    <span key={t.kind} className="g-tint inline-flex items-center gap-1 rounded-lg py-0.5 pr-2 pl-0.5 text-xs font-bold">
                      {icons[`t:${t.kind}`] && <Pic src={icons[`t:${t.kind}`]} alt="" className="size-7" />}×{t.n}
                    </span>
                  ))}
                  {r.spells.map((s) => (
                    <span key={s.kind} className="g-tint inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-bold">
                      <SpellOrb kind={s.kind} size={20} />×{s.n}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!raid && (
              <p className="g-muted mt-2 text-xs font-semibold">
                Raiders defeated: {r.raidersKilled}/{r.raiders}. Your builders have already repaired everything.
              </p>
            )}
            <div className="mt-5 land:mt-3">
              <BigButton onClick={onHome} icon={<Home className="size-5" />} autoFocus>
                Return home
              </BigButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Name, settings, tutorial ---------------------------------------------------------------------------------

export function NameDialog({ initial, suggest, onDone, title = "Name your village", onClose }: { initial: string; suggest: () => string; onDone: (name: string) => void; title?: string; onClose?: () => void }) {
  const [name, setName] = useState(initial);
  // Phones: don't open the keyboard over the game before the player asks for it.
  const touch = useMediaQuery("(pointer: coarse)");
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-black/55 backdrop-blur-sm land:backdrop-blur-none" onPointerDown={(e) => e.stopPropagation()}>
      <div className="grid min-h-full place-items-center p-4 land:safe-pad">
        <form
          role="dialog"
          aria-label={title}
          className="g-panel w-full max-w-sm space-y-4 p-6 text-center land:max-w-md land:space-y-2.5 land:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onDone(name);
          }}
        >
          <h2 className="g-panel-title text-3xl land:text-2xl">{title}</h2>
          <p className="g-muted text-sm">Every great kingdom starts with a name. Raiders and rivals will know it.</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              maxLength={20}
              autoFocus={!touch}
              aria-label="Village name"
              className="g-display min-w-0 flex-1 rounded-xl border-[3px] border-[#1f2937] bg-white/80 px-3 py-2 text-xl text-[#2b2116] outline-none focus:border-amber-500"
            />
            <button type="button" onClick={() => setName(suggest())} aria-label="Random name" title="Random name" className="g-soft grid size-12 shrink-0 place-items-center">
              <span className="g-unskew">
                <Dices className="size-6" />
              </span>
            </button>
          </div>
          <button type="submit" className="g-btn flex w-full items-center justify-center px-6 py-3 text-2xl land:py-2 land:text-xl">
            <span className="g-unskew">{onClose ? "Rename" : "Found village"}</span>
          </button>
          {onClose && (
            <SoftButton onClick={onClose} icon={<X className="size-4" />}>
              Cancel
            </SoftButton>
          )}
        </form>
      </div>
    </div>
  );
}

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: "smooth", label: "Smooth", hint: "Best frame rate" },
  { id: "auto", label: "Auto", hint: "Sharp, adapts to the phone" },
  { id: "hd", label: "HD", hint: "Full screen sharpness" },
];

export function SettingsPanel({
  save,
  quality,
  onQuality,
  onHelp,
  onRename,
  onReset,
  onClose,
}: {
  save: V.Save;
  quality: Quality;
  onQuality: (q: Quality) => void;
  onHelp: () => void;
  onRename: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<"settings" | "credits">("settings");
  const sound = useAudioSettings();
  // The Android app is always full screen and in landscape.
  const app = useNativeApp();
  const screenMode = useFullscreen();
  const [screenTip, setScreenTip] = useState<string | null>(null);
  return (
    <Sheet
      title={tab === "credits" ? "Credits" : "Settings"}
      onClose={onClose}
      wide={false}
      tabs={
        <>
          <Tab active={tab === "settings"} onClick={() => setTab("settings")}>
            <Settings className="size-4" /> Settings
          </Tab>
          <Tab active={tab === "credits"} onClick={() => setTab("credits")}>
            <Info className="size-4" /> Credits
          </Tab>
        </>
      }
    >
      {tab === "credits" ? (
        <CreditsTab />
      ) : (
        <div className="space-y-3 land:grid land:grid-cols-2 land:items-start land:gap-3 land:space-y-0">
          <div className="space-y-3">
            <div className="g-tint flex items-center justify-between gap-2 rounded-xl p-3">
              <div className="min-w-0">
                <p className="g-muted text-[11px] font-bold uppercase">Village</p>
                <p className="g-display truncate text-xl">{save.name}</p>
              </div>
              <button type="button" onClick={onRename} className="g-soft px-3 py-2 text-sm font-bold">
                <span className="g-unskew">Rename</span>
              </button>
            </div>
            <div className="g-tint space-y-2 rounded-xl p-3">
              <p className="g-muted text-[11px] font-bold uppercase">Sound</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-active={sound.music}
                  onClick={() => {
                    audio.unlock();
                    audio.toggleMusic();
                  }}
                  className={`g-soft px-3 py-2.5 text-sm font-bold ${sound.music ? "" : "opacity-60"}`}
                >
                  <span className="g-unskew gap-1.5">
                    <Music className="size-4" /> Music {sound.music ? "on" : "off"}
                  </span>
                </button>
                <button
                  type="button"
                  data-active={sound.sfx}
                  onClick={() => {
                    audio.unlock();
                    audio.toggleSfx();
                  }}
                  className={`g-soft px-3 py-2.5 text-sm font-bold ${sound.sfx ? "" : "opacity-60"}`}
                >
                  <span className="g-unskew gap-1.5">
                    <Volume2 className="size-4" /> Effects {sound.sfx ? "on" : "off"}
                  </span>
                </button>
              </div>
              <p className="g-muted pt-1 text-[11px] font-bold uppercase">Graphics</p>
              <div className="grid grid-cols-3 gap-1.5">
                {QUALITIES.map((q) => (
                  <button key={q.id} type="button" data-active={quality === q.id} onClick={() => onQuality(q.id)} className={`g-soft px-2 py-2 text-sm font-bold ${quality === q.id ? "" : "opacity-60"}`}>
                    <span className="g-unskew flex-col gap-0 leading-tight">
                      {q.label}
                      <span className="text-[10px] font-semibold opacity-90">{q.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              {!app && !screenMode.standalone && (
                <>
                  <p className="g-muted pt-1 text-[11px] font-bold uppercase">Screen</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-active={screenMode.active}
                      onClick={() => {
                        if (screenMode.supported) toggleFullscreen();
                        else setScreenTip("Safari on iPhone can't play full screen: tap Share, then Add to Home Screen, and open the game from there.");
                      }}
                      className="g-soft px-3 py-2.5 text-sm font-bold"
                    >
                      <span className="g-unskew gap-1.5">
                        {screenMode.active ? <Shrink className="size-4" /> : <Expand className="size-4" />} {screenMode.active ? "Exit full screen" : "Full screen"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void rotateScreen().then((ok) => setScreenTip(ok ? null : "This browser can't turn the screen by itself: turn your phone, and switch off its rotation lock if the game doesn't follow."))
                      }
                      className="g-soft px-3 py-2.5 text-sm font-bold"
                    >
                      <span className="g-unskew gap-1.5">
                        <PhoneRotateIcon className="size-4" /> Turn screen
                      </span>
                    </button>
                  </div>
                  {screenTip && <p className="text-xs leading-snug font-semibold">{screenTip}</p>}
                </>
              )}
            </div>
            <div className="g-tint grid grid-cols-3 gap-2 rounded-xl p-3 text-center text-xs font-bold">
              <div>
                <p className="g-display text-xl">{save.stats.raids}</p>raids
              </div>
              <div>
                <p className="g-display text-xl">{save.stats.wins}</p>wins
              </div>
              <div>
                <p className="g-display text-xl">
                  {save.stats.held}/{save.stats.defences}
                </p>
                defences held
              </div>
            </div>
            <button type="button" onClick={onHelp} className="g-soft flex w-full items-center justify-center px-3 py-2 text-sm font-bold">
              <span className="g-unskew gap-1.5">
                <CircleHelp className="size-4" /> How to play
              </span>
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <p className="g-muted mb-1.5 text-[11px] font-bold uppercase">
                Achievements {save.ach.length}/{ACHIEVEMENTS.length}
              </p>
              <ul className="space-y-1">
                {ACHIEVEMENTS.map((a) => {
                  const done = save.ach.includes(a.id);
                  return (
                    <li key={a.id} className={`g-tint flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${done ? "" : "opacity-65"}`}>
                      <span className={`grid size-5 shrink-0 place-items-center rounded-full ${done ? "bg-green-600 text-white" : "bg-[color-mix(in_srgb,currentColor_15%,transparent)]"}`}>{done && <Check className="size-3.5" />}</span>
                      <span className="flex-1">
                        <b>{a.name}</b> · {a.desc}
                      </span>
                      <span className="inline-flex items-center gap-1 font-bold">
                        <ResIcon res="gems" size={11} />
                        {a.gems}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            {confirm ? (
              <div className="rounded-xl border-2 border-red-700 p-3 text-center">
                <p className="text-sm font-bold text-red-800">Start over? Your village, army and campaign stars will be lost.</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <SoftButton onClick={() => setConfirm(false)}>Keep playing</SoftButton>
                  <button type="button" onClick={onReset} className="rounded-[14px] border-[3px] border-red-900 bg-red-600 px-3 py-2 text-sm font-bold text-white">
                    Reset village
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="w-full text-center text-xs font-bold text-red-700 underline">
                Reset progress…
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

const MUSIC = ["Thatched Villagers", "Master of the Feast", "Clash Defiant", "Five Armies"];

/** The 3D model packs (manifest `collections`), all CC0, by their original makers. */
const MODEL_MAKERS = [
  { by: "Kenney", packs: "Fantasy Town, Castle, Tower Defense, Survival, Nature and Graveyard kits, Mini Dungeon and Mini Characters" },
  { by: "KayKit", packs: "Adventurers character pack (the heroes)" },
  { by: "Polygonal Mind", packs: "Crystal Crossroads" },
];

function CreditsTab() {
  const app = useNativeApp();
  const version = app ? navigator.userAgent.match(/KingdomClashApp\/([\d.]+)/)?.[1] : null;
  const label = "g-muted mb-1 text-[11px] font-bold uppercase";
  return (
    <div className="space-y-3 text-sm leading-snug land:grid land:grid-cols-2 land:items-start land:gap-3 land:space-y-0">
      <div className="space-y-3">
        <div className="g-tint rounded-xl p-3 text-center">
          <p className="g-display text-2xl">Kingdom Clash</p>
          <p className="mt-1">
            Created by <b>{SITE.author}</b>
          </p>
          <p>
            Published by <b>{SITE.brand}</b>
          </p>
          {version && <p className="g-muted mt-1 text-xs">Android app · version {version}</p>}
        </div>
        <div className="g-tint rounded-xl p-3">
          <p className={label}>Music</p>
          <p>{MUSIC.map((t) => `“${t}”`).join(", ")}</p>
          <p className="mt-1">
            by <b>Kevin MacLeod</b> (incompetech.com), licensed under{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className="underline">
              CC BY 4.0
            </a>
            .
          </p>
        </div>
        <div className="g-tint rounded-xl p-3">
          <p className={label}>Sound effects</p>
          <p>Made in code: every sound is generated live while you play.</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="g-tint rounded-xl p-3">
          <p className={label}>3D models</p>
          <ul className="space-y-1.5">
            {MODEL_MAKERS.map((m) => (
              <li key={m.by}>
                <b>{m.by}</b> · {m.packs}
              </li>
            ))}
          </ul>
          <p className="g-muted mt-2 text-xs">All CC0 (public domain), from the {SITE.brand} library.</p>
        </div>
        <div className="g-tint rounded-xl p-3">
          <p className={label}>Made with</p>
          <p>three.js, React and Next.js · fonts Lilita One and Signika (SIL Open Font License)</p>
        </div>
      </div>
    </div>
  );
}

const TUTORIAL: Record<number, string> = {
  1: "Welcome, chief! Open the Shop and build a Gold Mine.",
  2: "Gold pays for defences and walls. Now build an Elixir Collector — elixir trains your army.",
  3: "Open the Army and train some Warriors. They march from the Barracks to the Army Camp.",
  4: "Your army is ready! Press Raid and attack the first village of the campaign.",
  6: "Great raid! Spend the loot on upgrades — the Town Hall unlocks new buildings and levels. Raiders will come for your gold, so build defences!",
};

export function TutorialHint({ step, onDismiss }: { step: number; onDismiss: () => void }) {
  const text = TUTORIAL[step];
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[102px] flex justify-center px-3 sm:bottom-[112px] land:right-[11.5rem] land:bottom-2.5 land:left-[6.75rem] land:px-0">
      <div className="g-panel pointer-events-auto flex max-w-md animate-[game-fade_0.4s_ease] items-center gap-3 px-4 py-3 land:py-2.5" onPointerDown={(e) => e.stopPropagation()}>
        <Sparkles className="size-6 shrink-0 text-amber-600" />
        <p className="text-sm leading-snug font-semibold">{text}</p>
        {step === 6 && (
          <button type="button" onClick={onDismiss} className="g-btn shrink-0 px-3 py-1.5 text-sm">
            <span className="g-unskew">Got it</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function PauseModal({ onResume, onEnd }: { onResume: () => void; onEnd: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px] land:safe-pad land:backdrop-blur-none" onPointerDown={(e) => e.stopPropagation()}>
      <div role="dialog" aria-label="Paused" className="g-panel w-full max-w-xs space-y-3 p-6 text-center">
        <h2 className="g-panel-title text-4xl">Paused</h2>
        <BigButton onClick={onResume} icon={<Play className="size-5 fill-current" />} autoFocus>
          Resume
        </BigButton>
        <SoftButton onClick={onEnd}>End battle</SoftButton>
      </div>
    </div>
  );
}

export function Toasts({ items }: { items: { id: number; text: string; tone: string }[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[136px] z-20 flex flex-col items-center gap-1.5 px-4 sm:top-24 land:top-[5.75rem] land:px-[12rem]">
      {items.map((t) => (
        <div key={t.id} className={`g-hud max-w-md animate-[game-fade_0.3s_ease] px-4 py-2 text-center text-sm font-bold land:text-[15px] ${t.tone === "bad" ? "text-red-300" : t.tone === "good" ? "text-green-300" : ""}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// --- Layout editor ---------------------------------------------------------------------------------------------

/** Small pill buttons for the editor: the village keeps the screen. */
const EDIT_BTN = "pointer-events-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-full border-2 px-2.5 text-[12px] font-extrabold shadow-[0_2px_0_#0005] disabled:opacity-45";
const EDIT_DARK = `${EDIT_BTN} border-[#fbbf24] bg-[#111827e6] text-[#fef3c7]`;
const EDIT_RED = `${EDIT_BTN} border-red-900 bg-red-600 text-white`;
const EDIT_GREEN = `${EDIT_BTN} border-green-900 bg-green-600 text-white`;

/**
 * The layout editor: drag any building to move it, store buildings in the tray (or all at once) and
 * place them back from it; Save keeps the new layout, Cancel puts everything back. Compact on purpose:
 * small pills at the top and a slim tray at the bottom.
 */
export function LayoutEditor({
  hud,
  icons,
  onSave,
  onCancel,
  onStoreAll,
  onStore,
  onPlace,
  onConfirm,
  onCancelPlace,
  onRow,
}: {
  hud: VillageHud;
  icons: Record<string, string>;
  onSave: () => void;
  onCancel: () => void;
  onStoreAll: () => void;
  onStore: () => void;
  onPlace: (kind: BKind) => void;
  onConfirm: () => void;
  onCancelPlace: () => void;
  onRow: () => void;
}) {
  const tray = hud.editing?.tray ?? [];
  const left = tray.reduce((n, t) => n + t.n, 0);
  const sel = hud.selected && hud.selected.kind !== "obstacle" ? hud.selected : null;
  const p = hud.placing;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-2 pt-2" onPointerDown={stop}>
        <button type="button" onClick={onStoreAll} className={EDIT_DARK}>
          <PackageOpen className="size-3.5" /> Store all
        </button>
        <p className="kc-ink truncate pt-1 text-center text-[12px] font-extrabold">
          <span className="g-display text-[14px]">Layout editor</span>
          <span className="ml-1.5 opacity-90">· {left ? `${left} in tray` : "drag to move"}</span>
        </p>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" onClick={onCancel} className={EDIT_RED}>
            <X className="size-3.5" strokeWidth={3} /> Cancel
          </button>
          <button type="button" onClick={onSave} disabled={left > 0} className={EDIT_GREEN}>
            <Check className="size-3.5" strokeWidth={3} /> Save
          </button>
        </div>
      </div>
      {(p || sel) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[60px] flex justify-center px-2">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border-2 border-[#fbbf24] bg-[#111827e6] py-1 pr-1 pl-3 text-[#fef3c7]" onPointerDown={stop}>
            {p ? (
              <>
                <span className="text-[12px] font-extrabold">
                  {BUILDINGS[p.kind].name}
                  {!p.valid && <span className="ml-1 text-red-300">· no room</span>}
                </span>
                {p.kind === "wall" && (
                  <button type="button" onClick={onRow} disabled={!p.valid} aria-label="Place a row of walls" className={EDIT_DARK}>
                    <ArrowRightToLine className="size-3.5" /> Row
                  </button>
                )}
                <button type="button" onClick={onConfirm} disabled={!p.valid} aria-label="Place" className={`${EDIT_GREEN} px-2`}>
                  <Check className="size-4" strokeWidth={3} />
                </button>
                <button type="button" onClick={onCancelPlace} aria-label="Put back" className={`${EDIT_RED} px-2`}>
                  <X className="size-4" strokeWidth={3} />
                </button>
              </>
            ) : (
              sel && (
                <>
                  <span className="text-[12px] font-extrabold">
                    {sel.name} <span className="opacity-70">Lv {sel.level}</span>
                  </span>
                  <button type="button" onClick={onStore} className={EDIT_DARK}>
                    <PackageOpen className="size-3.5" /> Store
                  </button>
                </>
              )
            )}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2 pb-1.5">
        <div className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-xl border-2 border-[#fbbf24] bg-[#111827d9] p-1 no-scrollbar" onPointerDown={stop}>
          {tray.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] font-bold text-[#fef3c7]">Tap a building, then Store — or Store all to start a fresh layout.</p>
          ) : (
            tray.map((t) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => onPlace(t.kind)}
                aria-label={`Place ${BUILDINGS[t.kind].name}`}
                title={BUILDINGS[t.kind].name}
                className={`relative grid size-[44px] shrink-0 place-items-center rounded-lg ${p?.kind === t.kind ? "bg-gradient-to-b from-amber-200 to-amber-500 ring-2 ring-white" : "bg-white/10"}`}
              >
                {icons[`b:${t.kind}`] ? <Pic src={icons[`b:${t.kind}`]} alt="" className="size-9" /> : <span className="text-[9px] font-bold text-white">{BUILDINGS[t.kind].name}</span>}
                <span className="kc-ink absolute right-0.5 bottom-0 text-[11px] font-black tabular-nums">×{t.n}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
