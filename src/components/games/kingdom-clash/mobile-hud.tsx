"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { ArrowBigUp, ArrowRightToLine, BrickWall, Check, Coins, Crown, FlaskConical, Gem, Hammer, Info, LayoutGrid, Moon, Pause, Search, Settings, Shield, ShoppingCart, Star, Swords, Trophy, Users, X, Zap } from "lucide-react";
import { BUILDINGS, HEROES, SPELLS, TROOPS, formatTime, gemsForResource, isHero, shortNumber, type HeroKind, type SpellKind, type TroopKind } from "./data";
import type { BattleHud, SelectedInfo, Slot, VillageHud } from "./engine";
import { Pic, ResIcon, SpellOrb, Stars } from "./hud";

/**
 * The phone layout (landscape phones and the Android app), laid out like a mobile strategy game:
 * chunky buttons in the corners — Attack bottom-left, Army and Shop bottom-right — resources
 * top-right, the village name top-left, and a row of round action buttons under a selected
 * building. Every target is at least 44 px and every text at least 11 px. The parent places these
 * inside `.g-safe`, so nothing sits under the camera cutout.
 */

/** Shared look: bevelled buttons, outlined text, the tutorial glow (in the components layer, so utilities override it). */
export const MOBILE_CSS = `@layer components{
.kc-chunky{box-shadow:inset 0 -5px 0 #0000002e,inset 0 3px 0 #ffffff70,0 4px 0 var(--edge),0 7px 12px #0000005c;transition:transform .08s,box-shadow .08s,filter .15s}
.kc-chunky:active:not(:disabled){transform:translateY(3px);box-shadow:inset 0 -3px 0 #0000002e,inset 0 2px 0 #ffffff70,0 1px 0 var(--edge),0 3px 6px #0000005c}
.kc-chunky:disabled{filter:saturate(.3) brightness(.9)}
.kc-ink{color:#fff;text-shadow:0 1.5px 0 #1f2937,1px 0 0 #1f2937,-1px 0 0 #1f2937,0 -1px 0 #1f2937}
@keyframes kc-glow{0%,100%{box-shadow:0 0 0 0 #fde04700}50%{box-shadow:0 0 0 7px #fde047cc}}
.kc-glow{animation:kc-glow 1.1s ease-in-out infinite}
}`;

type Tone = "green" | "blue" | "gold" | "red" | "purple" | "gray";

const TONES: Record<Tone, { bg: string; edge: string }> = {
  green: { bg: "linear-gradient(180deg,#d9f99d 0%,#4ade80 38%,#16a34a 100%)", edge: "#14532d" },
  blue: { bg: "linear-gradient(180deg,#bae6fd 0%,#60a5fa 40%,#1d4ed8 100%)", edge: "#1e3a8a" },
  gold: { bg: "linear-gradient(180deg,#fef9c3 0%,#fcd34d 38%,#d97706 100%)", edge: "#78350f" },
  red: { bg: "linear-gradient(180deg,#fecaca 0%,#f87171 38%,#b91c1c 100%)", edge: "#7f1d1d" },
  purple: { bg: "linear-gradient(180deg,#f5d0fe 0%,#c084fc 40%,#7e22ce 100%)", edge: "#3b0764" },
  gray: { bg: "linear-gradient(180deg,#f3f4f6 0%,#9ca3af 40%,#4b5563 100%)", edge: "#1f2937" },
};

function Chunky({ tone, glow = false, className = "", style, children, ...rest }: { tone: Tone; glow?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const t = TONES[tone];
  return (
    <button
      type="button"
      {...rest}
      className={`kc-chunky pointer-events-auto grid shrink-0 place-items-center text-white ${className.split(" ").includes("absolute") ? "" : "relative"} ${className}`}
      style={{ background: t.bg, border: `3px solid ${t.edge}`, "--edge": t.edge, ...style } as CSSProperties}
    >
      {glow && <span aria-hidden className="kc-glow pointer-events-none absolute -inset-[5px] rounded-[inherit]" />}
      {children}
    </button>
  );
}

/** Dark rounded chip over the 3D view. */
const CHIP = "rounded-xl border-2 border-[#fbbf24] bg-[#111827e0] text-[#fef3c7]";
/** The free band between the corner buttons (Attack left; Army + Shop right). */
const MIDDLE = "pointer-events-none absolute bottom-2.5 left-[86px] right-[140px] flex flex-col items-center";

// --- Village ------------------------------------------------------------------------------------------------

export function MobileTopBar({ hud, onSettings, onDefend, onEdit }: { hud: VillageHud; onSettings: () => void; onDefend: () => void; onEdit: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-2.5 pt-2">
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <div className="flex items-center">
          <span className="g-display kc-ink relative z-10 grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-amber-200 via-amber-400 to-amber-700 text-xl ring-[2.5px] ring-[#1f2937]" title="Town Hall level">
            {hud.th}
          </span>
          <div className={`${CHIP} -ml-2.5 min-w-0 rounded-l-none py-0.5 pr-3 pl-4`}>
            <p className="g-display max-w-[10rem] truncate text-[14px] leading-tight text-white">{hud.name || "Your village"}</p>
            <p className="flex items-center gap-2.5 text-[12px] font-extrabold leading-tight">
              <span className="inline-flex items-center gap-1">
                <Trophy className="size-3 text-amber-300" />
                {hud.trophies}
              </span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-3 fill-amber-300 text-amber-300" />
                {hud.stars}
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <Chunky tone="gray" onClick={onSettings} aria-label="Settings" className="size-[38px] rounded-full">
            <Settings className="size-5 drop-shadow-[0_1.5px_0_#1f2937]" />
          </Chunky>
          <Chunky tone="gray" onClick={onEdit} aria-label="Edit layout" className="size-[38px] rounded-full">
            <LayoutGrid className="size-5 drop-shadow-[0_1.5px_0_#1f2937]" />
          </Chunky>
        </div>
      </div>
      <div className="absolute top-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className={`${CHIP} inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[13px] font-extrabold whitespace-nowrap`}>
          <Hammer className="size-3.5 text-amber-300" />
          <span className="g-display">
            {hud.freeBuilders}/{hud.builders}
          </span>
          <span className="text-[11px] opacity-80">builders free</span>
        </div>
        {hud.raidIn >= 0 && hud.raidIn <= 45 && (
          <div className="pointer-events-auto flex animate-[game-fade_0.4s_ease] items-center gap-2 rounded-xl border-2 border-red-400 bg-[#450a0ae6] py-0.5 pr-0.5 pl-2 text-[12px] font-extrabold whitespace-nowrap text-red-50">
            <Shield className="size-3.5 text-red-300" />
            Raiders in {formatTime(hud.raidIn)}
            <Chunky tone="red" onClick={onDefend} className="rounded-lg px-2 py-0.5">
              <span className="g-display kc-ink text-[12px]">Defend</span>
            </Chunky>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ResourceMeter res="gold" value={hud.gold} cap={hud.goldCap} />
        <ResourceMeter res="elixir" value={hud.elixir} cap={hud.elixirCap} />
        <ResourceMeter res="gems" value={hud.gems} />
      </div>
    </div>
  );
}

const FILL = {
  gold: "linear-gradient(180deg,#fef08a,#f59e0b 55%,#b45309)",
  elixir: "linear-gradient(180deg,#fbcfe8,#d946ef 55%,#86198f)",
};

/** A resource bar: the fill shows how full the storages are; the icon sits on the right end. */
function ResourceMeter({ res, value, cap, small = false }: { res: "gold" | "elixir" | "gems"; value: number; cap?: number; small?: boolean }) {
  const full = cap !== undefined && value >= cap;
  return (
    <div className={`relative ${small ? "h-[22px] w-[128px]" : "h-[26px] w-[150px]"}`}>
      <div className="absolute inset-y-[3px] right-[12px] left-0 overflow-hidden rounded-l-[8px] rounded-r-[4px] border-2 border-[#1f2937] bg-[#0b1220d9]">
        {/* Fills from the right, where the icon sits. */}
        {cap !== undefined && res !== "gems" && <div className="absolute inset-y-0 right-0 transition-[width] duration-500" style={{ width: `${Math.min(100, (value / Math.max(1, cap)) * 100)}%`, background: FILL[res] }} />}
        {cap !== undefined && <span className="kc-ink absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px] font-black opacity-90">{full ? "FULL" : `max ${shortNumber(cap)}`}</span>}
        <span className="g-display kc-ink absolute inset-y-0 right-3.5 flex items-center text-[14px] tabular-nums">{shortNumber(value)}</span>
      </div>
      <span className="absolute top-1/2 right-0 grid size-[26px] -translate-y-1/2 place-items-center">
        <ResIcon res={res} size={res === "gold" ? 20 : 18} />
      </span>
    </div>
  );
}

export function MobileBottomBar({ hud, tutorial, onRaid, onShop, onArmy }: { hud: VillageHud; tutorial: number; onRaid: () => void; onShop: () => void; onArmy: () => void }) {
  return (
    <>
      <Chunky tone="gold" glow={tutorial === 4} onClick={onRaid} aria-label="Attack" className="absolute bottom-2.5 left-2.5 h-[64px] w-[64px] rounded-[18px]">
        <span className="flex flex-col items-center">
          <Swords className="size-7 drop-shadow-[0_1.5px_0_#78350f]" strokeWidth={2.4} />
          <span className="g-display kc-ink text-[13px] leading-none">Attack!</span>
        </span>
      </Chunky>
      <div className="pointer-events-none absolute right-2.5 bottom-2.5 flex items-end gap-2">
        <Chunky tone="blue" glow={tutorial === 3} onClick={onArmy} aria-label="Army" className="h-[52px] w-[52px] rounded-[16px]">
          <span className="flex flex-col items-center">
            <Users className="size-5 drop-shadow-[0_1.5px_0_#1e3a8a]" strokeWidth={2.4} />
            <span className="g-display kc-ink text-[11px] leading-none">Army</span>
          </span>
          <span className="g-display absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border-2 border-[#1f2937] bg-[#1f2937] px-1.5 text-[10px] leading-tight text-white tabular-nums whitespace-nowrap">
            {hud.army}/{hud.housing}
          </span>
        </Chunky>
        <Chunky tone="green" glow={tutorial === 1 || tutorial === 2} onClick={onShop} aria-label="Shop" className="h-[60px] w-[60px] rounded-[18px]">
          <span className="flex flex-col items-center">
            <ShoppingCart className="size-7 drop-shadow-[0_1.5px_0_#14532d]" strokeWidth={2.4} />
            <span className="g-display kc-ink text-[12px] leading-none">Shop</span>
          </span>
        </Chunky>
      </div>
    </>
  );
}

/** One round action under a selected building, with its label and price underneath. */
function Action({ tone, icon, label, cost, onClick, disabled }: { tone: Tone; icon: ReactNode; label: string; cost?: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex w-[62px] flex-col items-center gap-0.5">
      <Chunky tone={tone} onClick={onClick} disabled={disabled} aria-label={label} className="size-[44px] rounded-full">
        {icon}
      </Chunky>
      <span className="g-display kc-ink max-w-full truncate text-center text-[11px] leading-tight">{label}</span>
      {cost}
    </div>
  );
}

/** A price under an action; red when you can't pay it. */
function Price({ res, amount, have }: { res: "gold" | "elixir" | "gems"; amount: number; have?: number }) {
  const short = have !== undefined && have < amount;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-[1.5px] px-1.5 text-[11px] font-black tabular-nums ${short ? "border-red-700 bg-white text-red-600" : "border-[#1f2937] bg-[#111827e0] text-white"}`}>
      <ResIcon res={res} size={10} />
      {shortNumber(amount)}
    </span>
  );
}

const ICON = "size-[22px] drop-shadow-[0_1.5px_0_#0006]";

export function MobileBuildingBar({
  info,
  hud,
  onDetails,
  onUpgrade,
  onFinish,
  onCollect,
  onPanel,
  onWalls,
  onBuy,
  onHeal,
}: {
  info: SelectedInfo;
  hud: VillageHud;
  /** Opens the full popup: "info", or "upgrade" (this level and the next side by side). */
  onDetails: (mode: "info" | "upgrade") => void;
  onUpgrade: () => void;
  onFinish: () => void;
  onCollect: () => void;
  onPanel: (p: "army" | "lab" | "spells") => void;
  onWalls: () => void;
  onBuy: (res: "gold" | "elixir", amount: number, gems: number) => void;
  onHeal: () => void;
}) {
  const up = info.upgrade;
  const have = up ? (up.res === "gold" ? hud.gold : up.res === "elixir" ? hud.elixir : hud.gems) : 0;
  const missing = up && up.res !== "gems" && have < up.cost ? up.cost - have : 0;
  const cap = up?.res === "gold" ? hud.goldCap : hud.elixirCap;
  const upLabel = up ? (up.label.startsWith("Upgrade") ? "Upgrade" : up.label) : "";
  return (
    <div className={MIDDLE}>
      <p className="g-display kc-ink text-center text-[16px] leading-tight">
        {info.name}
        {info.kind !== "obstacle" && <span className="ml-1.5 text-[13px] text-amber-200">Level {info.level}</span>}
      </p>
      {info.busy && (
        <div className="mt-1 w-56">
          <div className="kc-ink flex items-center justify-between text-[12px] font-black">
            <span>{info.busy.label}</span>
            <span className="tabular-nums">{formatTime(info.busy.left)}</span>
          </div>
          <div className="mt-0.5 h-2.5 overflow-hidden rounded-full border-2 border-[#1f2937] bg-[#0b1220d9]">
            <div className="h-full bg-gradient-to-b from-green-300 to-green-600" style={{ width: `${Math.max(0, Math.min(100, (1 - info.busy.left / info.busy.total) * 100))}%` }} />
          </div>
        </div>
      )}
      {up?.reason && !up.can && <p className="mt-1 rounded-full bg-[#7f1d1de6] px-2.5 py-0.5 text-[12px] font-extrabold text-white">{up.reason}</p>}
      <div className="pointer-events-auto mt-1.5 flex max-w-full flex-wrap items-start justify-center gap-x-1 gap-y-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <Action tone="blue" icon={<Info className={ICON} strokeWidth={2.6} />} label="Info" onClick={() => onDetails("info")} />
        {info.busy && <Action tone="purple" icon={<Zap className={ICON} strokeWidth={2.4} />} label="Finish now" cost={<Price res="gems" amount={info.busy.gems} have={hud.gems} />} onClick={onFinish} />}
        {up && (
          <Action
            tone={up.can ? "green" : "gray"}
            icon={<ArrowBigUp className={ICON} strokeWidth={2.4} />}
            label={upLabel}
            cost={up.cost > 0 ? <Price res={up.res} amount={up.cost} have={have} /> : undefined}
            // Buildings: the upgrade popup shows the next level first; clearing an obstacle starts at once.
            onClick={info.kind === "obstacle" ? onUpgrade : () => onDetails("upgrade")}
          />
        )}
        {missing > 0 && missing <= cap && (
          <Action
            tone="purple"
            icon={<Gem className={ICON} strokeWidth={2.4} />}
            label={`Buy ${shortNumber(missing)}`}
            cost={<Price res="gems" amount={gemsForResource(missing)} have={hud.gems} />}
            onClick={() => onBuy(up!.res as "gold" | "elixir", missing, gemsForResource(missing))}
          />
        )}
        {info.kind === "wall" && up?.cost ? <Action tone="gold" icon={<BrickWall className={ICON} strokeWidth={2.4} />} label="All walls" onClick={onWalls} /> : null}
        {info.heal && <Action tone="purple" icon={<Moon className={ICON} strokeWidth={2.4} />} label="Wake now" cost={<Price res="gems" amount={info.heal.gems} have={hud.gems} />} onClick={onHeal} />}
        {info.collect && <Action tone="gold" icon={<Coins className={ICON} strokeWidth={2.4} />} label="Collect" cost={<Price res={info.collect.res} amount={info.collect.amount} />} onClick={onCollect} />}
        {info.panel && (
          <Action
            tone="blue"
            icon={info.panel === "army" ? <Users className={ICON} strokeWidth={2.4} /> : info.panel === "lab" ? <FlaskConical className={ICON} strokeWidth={2.4} /> : <Zap className={ICON} strokeWidth={2.4} />}
            label={info.panel === "army" ? "Train" : info.panel === "lab" ? "Research" : "Brew"}
            onClick={() => onPanel(info.panel!)}
          />
        )}
      </div>
    </div>
  );
}

export function MobilePlacingBar({ hud, onConfirm, onCancel, onRow }: { hud: VillageHud; onConfirm: () => void; onCancel: () => void; onRow: () => void }) {
  const p = hud.placing!;
  return (
    <div className={MIDDLE}>
      <div className={`${CHIP} pointer-events-auto flex items-center gap-2.5 py-1.5 pr-1.5 pl-3`} onPointerDown={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="g-display text-[15px] leading-tight">{BUILDINGS[p.kind].name}</p>
          <p className={`text-[12px] font-bold ${p.valid ? "opacity-85" : "text-red-300"}`}>{p.valid ? (p.kind === "wall" ? "Walls follow on in a line" : "Drag it into place") : "Not enough room here"}</p>
        </div>
        <Price res={p.res as "gold" | "elixir"} amount={p.cost} have={p.res === "gold" ? hud.gold : hud.elixir} />
        {p.kind === "wall" && (
          <Chunky tone="gold" onClick={onRow} disabled={!p.valid} aria-label="Place a row of walls" className="h-[44px] rounded-full px-2.5">
            <span className="g-display kc-ink inline-flex items-center gap-0.5 text-[13px]">
              <ArrowRightToLine className="size-4" strokeWidth={3} /> Row
            </span>
          </Chunky>
        )}
        <Chunky tone="green" onClick={onConfirm} disabled={!p.valid} aria-label="Place" className="size-[44px] rounded-full">
          <Check className="size-6" strokeWidth={3} />
        </Chunky>
        <Chunky tone="red" onClick={onCancel} aria-label="Cancel" className="size-[44px] rounded-full">
          <X className="size-6" strokeWidth={3} />
        </Chunky>
      </div>
    </div>
  );
}

const TUTORIAL: Record<number, string> = {
  1: "Welcome, chief! Tap Shop and build a Gold Mine.",
  2: "Gold pays for defences and walls. Now build an Elixir Collector — elixir trains your army.",
  3: "Tap Army and train some Warriors. They march from the Barracks to the Army Camp.",
  4: "Your army is ready! Tap Attack and raid the first village of the campaign.",
  6: "Great raid! Spend the loot on upgrades — the Town Hall unlocks new buildings and levels. Raiders will come for your gold, so build defences!",
};

export function MobileTutorialHint({ step, onDismiss }: { step: number; onDismiss: () => void }) {
  const text = TUTORIAL[step];
  if (!text) return null;
  return (
    <div className={MIDDLE}>
      <div className="g-panel pointer-events-auto flex max-w-[420px] animate-[game-fade_0.4s_ease] items-center gap-2 px-3 py-2" onPointerDown={(e) => e.stopPropagation()}>
        <Crown className="size-6 shrink-0 text-amber-600" />
        <p className="text-[13px] leading-snug font-semibold">{text}</p>
        {step === 6 && (
          <button type="button" onClick={onDismiss} className="g-btn shrink-0 px-3 py-1.5 text-sm">
            <span className="g-unskew">Got it</span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Battle ---------------------------------------------------------------------------------------------------

/** 2:05 — the battle clock. */
const clock = (t: number) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The battle screen, laid out like Clash of Clans: the rival and its loot top-left, the countdown
 * ("Battle starts in" while scouting, "Battle ends in" after) top-centre, your own storages top-right,
 * End battle and Next just above a slim troop bar. Kept small so the battlefield fills the screen.
 */
export function MobileBattleHud({ b, icons, onSlot, onEnd, onPause, onSpeed, onNext }: { b: BattleHud; icons: Record<string, string>; onSlot: (id: string) => void; onEnd: () => void; onPause: () => void; onSpeed: () => void; onNext: () => void }) {
  const raid = b.mode === "raid";
  const scouting = raid && !b.started;
  const endLabel = b.percent > 0 || b.started ? "End battle" : raid ? "Retreat" : "Skip";
  return (
    <>
      {/* The rival village, its loot and the trophies at stake */}
      <div className="pointer-events-none absolute top-1.5 left-2.5 max-w-[34%]">
        <p className="g-display kc-ink truncate text-[14px] leading-tight">{raid && !b.online ? `${b.stage}. ${b.name}` : b.name}</p>
        {b.online && (
          <p className="kc-ink truncate text-[11px] leading-tight font-extrabold">
            {b.online.owner} · TH {b.online.th}
          </p>
        )}
        {raid ? (
          <div className="mt-0.5">
            <p className="kc-ink text-[10px] leading-tight font-extrabold opacity-90">{scouting ? "Available loot:" : "Loot taken:"}</p>
            {(["gold", "elixir"] as const).map((r) => (
              <p key={r} className="kc-ink flex items-center gap-1 text-[13px] leading-[1.15] font-black tabular-nums">
                <ResIcon res={r} size={12} />
                {shortNumber(scouting ? (r === "gold" ? b.goldAvail : b.elixirAvail) : r === "gold" ? b.gold : b.elixir)}
                {!scouting && <span className="text-[10px] opacity-75">/ {shortNumber(r === "gold" ? b.goldAvail : b.elixirAvail)}</span>}
              </p>
            ))}
            {b.online && (
              <>
                <p className="kc-ink mt-0.5 flex items-center gap-1 text-[13px] leading-tight font-black">
                  <Trophy className="size-3 text-amber-300" /> {b.online.win}
                </p>
                <p className="kc-ink text-[10px] leading-tight font-extrabold">
                  Defeat: <span className="text-red-300">−{b.online.lose}</span>
                </p>
              </>
            )}
          </div>
        ) : (
          <p className="kc-ink text-[12px] font-extrabold">Raiders left: {b.raidersLeft}</p>
        )}
      </div>

      {/* Countdown or battle clock, then stars and damage */}
      <div className="pointer-events-none absolute top-1 left-1/2 flex -translate-x-1/2 flex-col items-center">
        <p className="kc-ink text-[11px] leading-none font-extrabold whitespace-nowrap">{b.scoutLeft >= 0 ? "Battle starts in:" : scouting ? "Timer starts with your first troop" : "Battle ends in:"}</p>
        <p className={`g-display kc-ink text-[21px] leading-tight tabular-nums ${!scouting && b.timeLeft <= 30 ? "!text-red-300" : ""}`}>{b.scoutLeft >= 0 ? `${b.scoutLeft}s` : clock(b.timeLeft)}</p>
        {!scouting && (
          <div className={`${CHIP} flex items-center gap-1.5 px-2 py-px`}>
            <Stars n={b.stars} size={13} />
            <span className="g-display text-[13px] tabular-nums">{b.percent}%</span>
          </div>
        )}
      </div>

      {/* Your storages, speed and pause */}
      <div className="absolute top-1.5 right-2.5 flex flex-col items-end gap-1">
        <ResourceMeter res="gold" value={b.own.gold} cap={b.own.goldCap} small />
        <ResourceMeter res="elixir" value={b.own.elixir} cap={b.own.elixirCap} small />
        <div className="flex gap-1.5">
          <Chunky tone="gray" onClick={onSpeed} aria-label="Battle speed" className="size-[32px] rounded-full">
            <span className="g-display kc-ink text-[12px]">{b.speed}×</span>
          </Chunky>
          <Chunky tone="gray" onClick={onPause} aria-label="Pause" className="size-[32px] rounded-full">
            <Pause className="size-3.5 fill-current drop-shadow-[0_1.5px_0_#1f2937]" />
          </Chunky>
        </div>
      </div>

      {scouting && <p className="g-display kc-ink pointer-events-none absolute inset-x-0 bottom-[128px] text-center text-[15px]">Tap or press and hold to deploy troops</p>}

      <Chunky tone="red" onClick={onEnd} className="absolute bottom-[84px] left-2.5 rounded-lg px-2.5 py-1">
        <span className="g-display kc-ink text-[12px] leading-none whitespace-nowrap">{endLabel}</span>
      </Chunky>
      {b.online && scouting && (
        <Chunky tone="gold" onClick={onNext} aria-label="Next village" className="absolute right-2.5 bottom-[84px] rounded-xl px-2.5 py-1">
          <span className="flex items-center gap-1.5">
            <Search className="size-4 drop-shadow-[0_1.5px_0_#78350f]" strokeWidth={3} />
            <span className="flex flex-col items-start gap-0.5 leading-none">
              <span className="g-display kc-ink text-[15px]">Next</span>
              <Price res="gold" amount={b.online.next} />
            </span>
          </span>
        </Chunky>
      )}

      <div className="pointer-events-none absolute inset-x-2 bottom-1.5 flex justify-center">
        <div className="pointer-events-auto no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl border-2 border-[#fbbf24] bg-[#111827d9] p-1 pt-1.5" onPointerDown={(e) => e.stopPropagation()}>
          {b.slots.length === 0 && <p className="px-3 py-2.5 text-[13px] font-bold text-[#fef3c7]">{raid ? "No troops" : "No troops to defend with — your defences are on their own!"}</p>}
          {b.slots.map((s) => (
            <TroopCard key={s.id} s={s} active={b.selected === s.id} icon={icons[`t:${s.kind}`]} onClick={() => onSlot(s.id)} />
          ))}
        </div>
      </div>
    </>
  );
}

/** A card in the troop bar: how many are left on top (like Clash of Clans), the level in the corner. */
function TroopCard({ s, active, icon, onClick }: { s: Slot; active: boolean; icon?: string; onClick: () => void }) {
  const hero = s.hero;
  const name = s.spell ? SPELLS[s.kind as SpellKind].name : isHero(s.kind) ? HEROES[s.kind as HeroKind].name : (TROOPS[s.kind as TroopKind]?.name ?? s.kind);
  const ability = !!hero && hero.out && hero.ability;
  const spent = !!hero && hero.out && !hero.ability;
  const bg = ability
    ? "linear-gradient(180deg,#f5d0fe,#a855f7 55%,#6b21a8)"
    : active
      ? "linear-gradient(180deg,#fef9c3,#fcd34d 50%,#d97706)"
      : s.spell
        ? "linear-gradient(180deg,#e9d5ff,#a78bfa 55%,#5b21b6)"
        : "linear-gradient(180deg,#e0f2fe,#7dd3fc 50%,#0369a1)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={hero ? spent : s.count === 0}
      aria-label={hero ? (ability ? `${name}: ${HEROES[s.kind as HeroKind].ability.name}` : name) : `${name} ×${s.count}`}
      className={`relative flex w-[48px] shrink-0 flex-col items-center overflow-hidden rounded-lg border-[2.5px] pt-2.5 pb-0.5 transition-transform disabled:opacity-40 ${active || ability ? "-translate-y-1 border-white" : "border-[#1f2937]"} ${ability ? "animate-pulse" : ""}`}
      style={{ background: bg }}
    >
      {s.spell ? (
        <span className="mb-0.5">
          <SpellOrb kind={s.kind as SpellKind} size={32} />
        </span>
      ) : icon ? (
        <Pic src={icon} alt="" className="size-[38px]" />
      ) : (
        <span className="size-[38px]" />
      )}
      <span className="g-display kc-ink absolute top-0 left-1 text-[12px] leading-tight tabular-nums">{hero ? (ability ? "Ability!" : !hero.out ? "Hero" : hero.hp > 0 ? "Fight" : "Fallen") : `x${s.count}`}</span>
      {hero && (
        <span className="mt-0.5 h-1.5 w-9 overflow-hidden rounded-full bg-black/45">
          <span className="block h-full rounded-full bg-green-400" style={{ width: `${Math.round(hero.hp * 100)}%` }} />
        </span>
      )}
      <span className="absolute right-0.5 bottom-0.5 rounded bg-black/55 px-1 text-[9px] leading-tight font-black text-white">{s.level}</span>
    </button>
  );
}
