"use client";

import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import {
  Anchor,
  Castle,
  ChefHat,
  Crown,
  Disc3,
  Flame,
  FlagTriangleRight,
  Hamburger,
  Hexagon,
  KeyRound,
  Orbit,
  Plane,
  Rocket,
  Sailboat,
  Skull,
  Star,
  Target,
  TreePalm,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Each game's own loading screen (drawn by shared/loading-screen.tsx over the game's cover art): a
 * logo, tips and a progress bar from the game's world — Kingdom Clash's gold-framed bar, Turbo
 * Karts' start lights, Cannon Cove's treasure-map route… — status lines in its voice, and an
 * optional ambient effect. Keyframes (g-*) live in globals.css.
 */
export interface LoadingLook {
  /** Darkens the cover art at the top and bottom so the title and bar stay readable. */
  shade: string;
  /** Text colour, when the theme's loading text would not read on the shaded art. */
  ink?: string;
  /** Shown one after another as the download goes on. */
  lines: string[];
  Bar: ComponentType<{ pct: number }>;
  /** The bar prints the percentage itself (the status line then leaves it out). */
  ownPct?: boolean;
  /** Ambient effect over the art. */
  Fx?: ComponentType;
  title: TitleLook;
}

/** The logo, ribbon, tips and sky of a loading screen. Colours are 6-digit hex (alpha gets appended). */
export interface TitleLook {
  /** Icon on the medal above the title. */
  emblem: LucideIcon;
  /** A few words on the ribbon under the title. */
  motto: string;
  /** Short tips that work for keyboard and touch alike (default: the game's tagline). */
  tips?: string[];
  /** Gradient stops of the small first word(s) and the big last word. */
  top: string;
  main: string;
  /** Outline colour, and its width in em (0 for neon / engraved titles). */
  outline: string;
  stroke: number;
  /** Filter under the title — solid depth, offset sticker shadow or neon glow. Default: depth in the outline colour. */
  depth?: string;
  /** Degrees; negative leans the title up to the right. */
  tilt?: number;
  /** Average glyph width (em) of the display font as the theme sets it; long words shrink to fit phones. */
  charW: number;
  /** The whole title on one line instead of a small first word over a big last word. */
  oneLine?: boolean;
  /** `glow`: a neon medal instead of a solid one. */
  medal: { bg: string; icon: string; ring: string; glow?: string };
  /** `shadow` (text) and `depth` (filter) default to a solid drop. */
  ribbon: { bg: string; text: string; edge: string; shadow?: string; depth?: string };
  /** Light rays and halo behind the title; `rays` is their opacity (0 = none). */
  glow: string;
  rays: number;
  /** Particles drifting up: sparks, embers, fireflies, bubbles… */
  spark: string;
  /** Soft clouds drifting across the top. */
  clouds?: boolean;
  /** Tint of the shaded sky behind the title (top, then lower down). */
  sky: [string, string];
}

/** Gold coin medal shared by the sunny games. */
const GOLD = "radial-gradient(circle at 35% 28%, #fffbeb, #fcd34d 38%, #f59e0b 70%, #b45309)";

type BarProps = { pct: number };

/** A fill's width — never empty, so the bar reads as a bar from the first frame. */
const fill = (pct: number): CSSProperties => ({ width: `${Math.max(3, pct)}%` });

/** Left position of something riding the fill's tip, kept inside the bar. */
const tip = (pct: number, min = 4, max = 96) => `${Math.min(max, Math.max(min, pct))}%`;

const GROW = "transition-[width] duration-300 ease-out";
const RIDE = "transition-[left] duration-300 ease-out";

/**
 * Diagonal stripes sliding along a fill. They slide by moving (not by repainting), so they stay smooth
 * while the game is busy parsing models.
 */
function Stripes({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <span
      className="absolute inset-y-0 right-0 motion-safe:animate-[g-stripes_0.9s_linear_infinite]"
      style={
        {
          left: -size,
          backgroundImage: `linear-gradient(-45deg, ${color} 25%, transparent 25% 50%, ${color} 50% 75%, transparent 75%)`,
          backgroundSize: `${size}px ${size}px`,
          "--stripe": `${size}px`,
        } as CSSProperties
      }
    />
  );
}

/** A soft highlight sweeping along a fill now and then. */
function Glint() {
  return (
    <span
      className="absolute inset-y-0 left-0 w-[45%] motion-safe:animate-[g-glint_2.8s_ease-in-out_infinite]"
      style={{ transform: "translateX(-110%)", background: "linear-gradient(100deg, #fff0, #ffffff8c 50%, #fff0)" }}
    />
  );
}

const OUTLINE = "0 2px 0 #1f2937, 2px 0 0 #1f2937, -2px 0 0 #1f2937, 0 -2px 0 #1f2937, 2px 2px 0 #1f2937, -2px 2px 0 #1f2937, 0 3px 0 #1f2937";

// --- Bars -------------------------------------------------------------------------------------------

/** Kingdom Clash: chunky gold-ringed bar, a castle badge, a glossy green fill with a glint, the percentage on top. */
function ClashBar({ pct }: BarProps) {
  return (
    <div className="relative pl-[30px]">
      <span
        className="absolute top-1/2 left-0 z-[2] -mt-[31px] grid size-[62px] place-items-center rounded-full border-[3px] border-[#1f2937] text-[#1e3a8a]"
        style={{ background: GOLD, boxShadow: "inset 0 -4px 0 #b4530999, inset 0 3px 0 #fff9, 0 4px 0 #1f2937, 0 10px 18px #0009" }}
      >
        <Castle className="size-[30px]" strokeWidth={2.4} />
      </span>
      <div
        className="relative h-[46px] rounded-2xl border-[3px] border-[#1f2937] p-[5px]"
        style={{ background: "linear-gradient(180deg, #0b1220, #1e293b)", boxShadow: "inset 0 0 0 2px #fbbf24, inset 0 6px 10px #000c, 0 5px 0 #1f2937, 0 16px 32px #000a" }}
      >
        <div
          className={`relative h-full overflow-hidden rounded-[10px] ${GROW}`}
          style={{
            width: `calc(30px + (100% - 30px) * ${pct / 100})`,
            background: "linear-gradient(180deg, #bbf7d0, #4ade80 28%, #22c55e 58%, #16a34a 82%, #15803d)",
            boxShadow: "inset 0 -4px 0 #166534, inset 0 2px 0 #ffffffb3",
          }}
        >
          <Stripes color="#ffffff30" size={22} />
          <Glint />
          <span className="absolute inset-x-1.5 top-[3px] h-[36%] rounded-lg" style={{ background: "linear-gradient(180deg, #ffffffb3, #ffffff1a)" }} />
          <span className="absolute inset-y-0.5 right-0 w-4 rounded-lg" style={{ background: "linear-gradient(90deg, #f0fdf400, #f0fdf4e6)" }} />
        </div>
        <span className="g-display absolute inset-0 grid place-items-center pl-6 text-[21px] leading-none text-white tabular-nums" style={{ textShadow: OUTLINE }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

/** Turbo Karts: five start lights over a slanted carbon bar with a chequered finish. */
function KartBar({ pct }: BarProps) {
  const lit = Math.min(5, Math.floor(pct / 20));
  const go = pct >= 100;
  return (
    <div>
      <div className="mx-auto mb-5 flex w-fit gap-2.5 rounded-md border-2 border-[#262626] bg-[#0a0a0a] px-3 py-2 shadow-[0_8px_20px_#000a]">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="size-6 rounded-full border-2 border-black transition-[background,box-shadow] duration-200 sm:size-7"
            style={
              go
                ? { background: "radial-gradient(circle at 35% 35%, #bbf7d0, #16a34a 60%)", boxShadow: "0 0 16px #22c55e" }
                : i < lit
                  ? { background: "radial-gradient(circle at 35% 35%, #fecaca, #dc2626 60%)", boxShadow: "0 0 16px #ef4444" }
                  : { background: "#2a0b0b" }
            }
          />
        ))}
      </div>
      <div className="relative h-5 -skew-x-12 border-2 border-[#f97316] bg-[#111111e6] shadow-[6px_6px_0_#000]">
        <div className={`relative h-full overflow-hidden ${GROW}`} style={{ ...fill(pct), background: "linear-gradient(90deg, #fdba74, #f97316, #ea580c)" }}>
          <Stripes color="#00000026" size={20} />
        </div>
        <span className="absolute inset-y-0 right-0 w-6" style={{ background: "repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 8px 8px" }} />
      </div>
    </div>
  );
}

/** Skate Rush: a slanted sticker — white outline, hard orange shadow, hazard-striped fill. */
function SkateBar({ pct }: BarProps) {
  return (
    <div className="h-9 -skew-x-6 rounded-[10px] border-[3px] border-white bg-[#111] p-[3px] shadow-[6px_6px_0_#f59e0b]">
      <div className={`relative h-full overflow-hidden rounded-[5px] bg-[#facc15] ${GROW}`} style={fill(pct)}>
        <Stripes color="#11111140" size={22} />
      </div>
    </div>
  );
}

/** Saucer Siege: an uplink of glowing cells; the next one blinks. */
function SaucerBar({ pct }: BarProps) {
  const cells = 24;
  const on = Math.round((pct / 100) * cells);
  return (
    <div className="flex h-5 gap-[3px] rounded-[3px] border border-[#a78bfa99] bg-[#0b0820b3] p-[3px] shadow-[0_0_22px_#8b5cf655]">
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[1px] ${i === on ? "motion-safe:animate-[g-blink_0.7s_linear_infinite]" : ""}`}
          style={i <= on ? { background: "#c4b5fd", boxShadow: "0 0 8px #a78bfa" } : { background: "#a78bfa1f" }}
        />
      ))}
    </div>
  );
}

/** Cannon Cove: a ship sailing a dashed route across a parchment strip to the X. */
function CoveBar({ pct }: BarProps) {
  return (
    <div
      className="rounded-lg border-2 border-[#6b4423] px-6 pt-10 pb-4"
      style={{ background: "linear-gradient(180deg, #f6e7c8, #e7cf9f)", boxShadow: "0 0 0 3px #3b2412, 0 14px 30px #000a" }}
    >
      <div className="relative mr-8 border-t-[3px] border-dashed border-[#6b442359]">
        <div className={`absolute -top-[3px] left-0 border-t-[3px] border-dashed border-[#b91c1c] ${GROW}`} style={fill(pct)} />
        <span className={`absolute -top-9 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 0, 100) }}>
          <Sailboat className="size-8 text-[#3b2412] motion-safe:animate-[g-bob_1.6s_ease-in-out_infinite]" strokeWidth={2.2} />
        </span>
        {/* X marks the spot. */}
        <span className="absolute -top-[13px] -right-9 size-6">
          <span className="absolute top-1/2 left-0 h-[5px] w-full -translate-y-1/2 rotate-45 rounded-full bg-[#b91c1c]" />
          <span className="absolute top-1/2 left-0 h-[5px] w-full -translate-y-1/2 -rotate-45 rounded-full bg-[#b91c1c]" />
        </span>
      </div>
    </div>
  );
}

/** Crypt Knight: a thin crimson bar in gold trim, with a torch flame burning at its tip. */
function CryptBar({ pct }: BarProps) {
  return (
    <div className="relative mx-4 mt-6 h-3">
      <span className="absolute inset-0 border border-[#c9a24a] bg-[#0d0a0bcc] shadow-[0_0_0_1px_#000,0_0_24px_#b91c1c55]" />
      <span
        className={`absolute inset-y-[2px] left-[2px] shadow-[0_0_16px_#ef4444aa] ${GROW}`}
        style={{ width: `calc(${Math.max(3, pct)}% - 4px)`, background: "linear-gradient(90deg, #450a0a, #b91c1c, #ef4444)" }}
      />
      <span className="absolute top-1/2 -left-3 size-4 -translate-y-1/2 rotate-45 border border-[#c9a24a] bg-[#7f1d1d]" />
      <span className="absolute top-1/2 -right-3 size-4 -translate-y-1/2 rotate-45 border border-[#c9a24a] bg-[#7f1d1d]" />
      <span className={`absolute -top-7 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 2, 98) }}>
        <Flame className="size-7 origin-bottom fill-[#f97316] text-[#fde68a] drop-shadow-[0_0_10px_#f97316] motion-safe:animate-[g-flicker_0.18s_ease-in-out_infinite_alternate]" />
      </span>
    </div>
  );
}

/** Order Up: a milkshake-pink candy-stripe pill, with a chef's hat bobbing along. */
function DinerBar({ pct }: BarProps) {
  return (
    <div className="relative pt-9">
      <div className="h-9 rounded-full border-4 border-[#f472b6] bg-[#fff8ef] p-[3px]" style={{ boxShadow: "0 6px 0 #be185d, 0 14px 28px #0008" }}>
        <div className={`relative h-full overflow-hidden rounded-full bg-[#ec4899] ${GROW}`} style={{ ...fill(pct), boxShadow: "inset 0 3px 0 #ffffff66" }}>
          <Stripes color="#f9a8d4" size={24} />
        </div>
      </div>
      <span className={`absolute top-0 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 5, 95) }}>
        <ChefHat className="size-8 text-white drop-shadow-[0_3px_0_#be185d] motion-safe:animate-[g-bob_1.2s_ease-in-out_infinite]" strokeWidth={2.4} />
      </span>
    </div>
  );
}

const HEX = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";
const MEADOW = ["#6ee7b7", "#34d399", "#a7f3d0", "#10b981"];

/** Hex Haven: a row of hex tiles growing over, one after another. */
function HexBar({ pct }: BarProps) {
  const tiles = 12;
  const done = (pct / 100) * tiles;
  return (
    <div className="flex justify-center gap-1.5 drop-shadow-[0_3px_0_#065f46]">
      {Array.from({ length: tiles }, (_, i) => (
        <span key={i} className="relative aspect-[0.87] w-[7.2%] max-w-10 overflow-hidden bg-[#ffffff33]" style={{ clipPath: HEX }}>
          <span
            className="absolute inset-x-0 bottom-0 transition-[height] duration-300"
            style={{ height: `${Math.min(1, Math.max(0, done - i)) * 100}%`, background: MEADOW[i % MEADOW.length] }}
          />
        </span>
      ))}
    </div>
  );
}

/** Sky Hop: a cartoon bar with a little hopper bouncing on its tip. */
function HopBar({ pct }: BarProps) {
  return (
    <div className="relative pt-10">
      <div className="h-10 rounded-full border-4 border-[#1c1917] bg-white p-1 shadow-[0_6px_0_#1c1917]">
        <div className={`h-full rounded-full bg-[#facc15] ${GROW}`} style={{ ...fill(pct), boxShadow: "inset 0 -4px 0 #eab308, inset 0 4px 0 #ffffffaa" }} />
      </div>
      <span className={`absolute top-0 -translate-x-1/2 ${RIDE}`} style={{ left: tip(pct, 5, 95) }}>
        <span className="relative flex size-10 items-center justify-center gap-1 rounded-full border-[3px] border-[#1c1917] bg-[#f472b6] motion-safe:animate-[g-hop_0.45s_ease-in-out_infinite_alternate]">
          {[0, 1].map((eye) => (
            <span key={eye} className="grid size-2.5 place-items-center rounded-full bg-white">
              <span className="size-1.5 rounded-full bg-[#1c1917]" />
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}

/** Siege Smash: a riveted stone frame with a boulder rolling along the fill. */
function SiegeBar({ pct }: BarProps) {
  return (
    <div className="relative">
      <div
        className="h-9 rounded-md border-[3px] border-[#44403c] p-[5px]"
        style={{ background: "linear-gradient(180deg, #d6d3d1, #a8a29e)", boxShadow: "0 5px 0 #292524, 0 14px 28px #0009" }}
      >
        <div className="h-full rounded-[3px] bg-[#292524] shadow-[inset_0_2px_4px_#000a]">
          <div
            className={`relative h-full overflow-hidden rounded-[3px] ${GROW}`}
            style={{ ...fill(pct), background: "linear-gradient(180deg, #bef264, #65a30d)", boxShadow: "inset 0 -3px 0 #3f6212" }}
          >
            <Stripes color="#3f621226" size={18} />
          </div>
        </div>
      </div>
      {["top-[3px] left-[3px]", "top-[3px] right-[3px]", "bottom-[3px] left-[3px]", "bottom-[3px] right-[3px]"].map((at) => (
        <span key={at} className={`absolute ${at} size-1.5 rounded-full bg-[#57534e]`} />
      ))}
      <span className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${RIDE}`} style={{ left: tip(pct, 3, 97) }}>
        <span
          className="relative block size-9 rounded-full border-[3px] border-[#292524] motion-safe:animate-[spin_1.4s_linear_infinite]"
          style={{ background: "radial-gradient(circle at 35% 30%, #e7e5e4, #a8a29e 55%, #78716c)" }}
        >
          <span className="absolute top-1.5 left-2 size-2 rounded-full bg-[#78716c]" />
          <span className="absolute right-2 bottom-2 size-1.5 rounded-full bg-[#78716c]" />
        </span>
      </span>
    </div>
  );
}

/** Beat Street: an equalizer — loaded bars light up neon and dance. */
function BeatBar({ pct }: BarProps) {
  const bars = 32;
  const on = Math.round((pct / 100) * bars);
  return (
    <div className="flex h-14 items-end gap-[3px]">
      {Array.from({ length: bars }, (_, i) => {
        const color = `hsl(${292 - (i / (bars - 1)) * 104} 90% 66%)`;
        return i < on ? (
          <span
            key={i}
            className="h-full flex-1 origin-bottom rounded-t-sm motion-safe:animate-[g-eq_0.5s_ease-in-out_infinite_alternate]"
            style={{ background: color, boxShadow: `0 0 10px ${color}`, animationDuration: `${0.38 + (i % 5) * 0.09}s`, animationDelay: `${-((i * 0.17) % 1)}s` }}
          />
        ) : (
          <span key={i} className="h-[14%] flex-1 rounded-t-sm bg-[#ffffff1f]" />
        );
      })}
    </div>
  );
}

/** Putt Paradise: a striped fairway, a ball rolling along it and the flag waiting at the hole. */
function PuttBar({ pct }: BarProps) {
  return (
    <div className="relative pt-12">
      <div className="relative h-4 rounded-full bg-[#042f2e80] ring-1 ring-white/50">
        <div className={`h-full rounded-full ${GROW}`} style={{ ...fill(pct), background: "repeating-linear-gradient(90deg, #4ade80 0 14px, #22c55e 14px 28px)" }} />
        <span className="absolute top-1/2 right-2 h-2 w-5 -translate-y-1/2 rounded-[50%] bg-[#042f2e]" />
        <span className="absolute right-[17px] bottom-1/2 h-14 w-[2px] bg-white" />
        <span
          className="absolute right-[19px] bottom-[calc(50%+36px)] h-5 w-7 origin-right bg-[#f43f5e] motion-safe:animate-[g-wave_1.1s_ease-in-out_infinite_alternate]"
          style={{ clipPath: "polygon(100% 0, 0 50%, 100% 100%)" }}
        />
        {/* Rolls from the tee to the hole's centre. */}
        <span className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${RIDE}`} style={{ left: `calc(10px + (100% - 28px) * ${pct / 100})` }}>
          <span
            className="block size-5 rounded-full shadow-[0_2px_4px_#0006] motion-safe:animate-[spin_0.9s_linear_infinite]"
            style={{ background: "radial-gradient(circle at 35% 30%, #fff, #e5e7eb 55%, #9ca3af)" }}
          />
        </span>
      </div>
    </div>
  );
}

/** Castaway: a frayed rope bar in a hand-drawn frame, with the island palm waiting at the end. */
function CastawayBar({ pct }: BarProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-7 flex-1 border-2 border-[#2b2118] bg-[#f7f1e1] p-[3px]"
        style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px", boxShadow: "3px 4px 0 #2b2118" }}
      >
        <div
          className={`h-full ${GROW}`}
          style={{
            ...fill(pct),
            borderRadius: "255px 12px 225px 12px / 12px 225px 12px 255px",
            background: "repeating-linear-gradient(115deg, #c2410c 0 7px, #9a3412 7px 10px)",
          }}
        />
      </div>
      <TreePalm className="size-9 shrink-0 text-[#fdba74] drop-shadow-[2px_2px_0_#2b2118]" strokeWidth={2.2} />
    </div>
  );
}

/** Nova Strike: chunky arcade pixel blocks with a magenta drop shadow. */
function NovaBar({ pct }: BarProps) {
  const blocks = 20;
  const on = Math.round((pct / 100) * blocks);
  return (
    <div className="flex gap-1 border-2 border-[#22d3ee] bg-[#020617cc] p-1 shadow-[4px_4px_0_#db2777]">
      {Array.from({ length: blocks }, (_, i) => (
        <span
          key={i}
          className={`h-5 flex-1 ${i === on ? "motion-safe:animate-[g-blink_0.5s_linear_infinite]" : ""}`}
          style={{ background: i <= on ? "#22d3ee" : "#22d3ee14" }}
        />
      ))}
    </div>
  );
}

const SAFE_CODE = "730514";

/** Night Heist: a safe's combination cracking digit by digit, over a thin alarm-red laser. */
function HeistBar({ pct }: BarProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 90);
    return () => clearInterval(id);
  }, []);
  const cracked = Math.floor((pct / 100) * SAFE_CODE.length);
  return (
    <div>
      <div className="flex justify-center gap-1.5 sm:gap-2">
        {[...SAFE_CODE].map((digit, i) => (
          <span
            key={i}
            className="grid h-12 w-9 place-items-center rounded-[3px] border font-mono text-2xl font-bold sm:w-10"
            style={
              i < cracked
                ? { borderColor: "#f5f0e1", color: "#f5f0e1", background: "#0b0f19e6", boxShadow: "0 0 14px #f8717155" }
                : { borderColor: "#f8717166", color: "#f8717199", background: "#0b0f19b3" }
            }
          >
            {i < cracked ? digit : (tick * 7 + i * 3) % 10}
          </span>
        ))}
      </div>
      <div className="mt-4 h-[3px] bg-[#f8717126]">
        <div className={`h-full bg-[#f87171] shadow-[0_0_12px_#f87171] ${GROW}`} style={fill(pct)} />
      </div>
    </div>
  );
}

// Route of Sky Courier's plane: start, curve control point, end (viewBox 300 × 64).
const ROUTE = { from: [14, 54], via: [150, -12], to: [286, 54] } as const;
const PLANE = "M11 0 L5 -1.8 L0 -10 L-2.6 -10 L0.6 -1.8 L-5.5 -1.6 L-8 -5 L-10 -5 L-8.4 0 L-10 5 L-8 5 L-5.5 1.6 L0.6 1.8 L-2.6 10 L0 10 L5 1.8 Z";

/** Sky Courier: a plane flying a gold dotted arc from departure to arrival. */
function CourierBar({ pct }: BarProps) {
  const t = pct / 100;
  const { from: a, via: c, to: b } = ROUTE;
  const at = (k: 0 | 1) => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t ** 2 * b[k];
  const slope = (k: 0 | 1) => 2 * (1 - t) * (c[k] - a[k]) + 2 * t * (b[k] - c[k]);
  const angle = (Math.atan2(slope(1), slope(0)) * 180) / Math.PI;
  const d = `M${a[0]} ${a[1]} Q${c[0]} ${c[1]} ${b[0]} ${b[1]}`;
  return (
    <div className="g-display text-[10px] tracking-[0.3em] text-[#d4af37] uppercase">
      <svg viewBox="0 0 300 64" className="w-full overflow-visible" aria-hidden>
        <path d={d} fill="none" stroke="#d4af3773" strokeWidth={1.5} strokeDasharray="1 6" strokeLinecap="round" />
        <path d={d} fill="none" stroke="#d4af37" strokeWidth={2} pathLength={100} strokeDasharray={`${pct} 100`} />
        {[a, b].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r={4} fill="#0b1d33" stroke="#d4af37" strokeWidth={2} />
        ))}
        <path d={PLANE} transform={`translate(${at(0)} ${at(1)}) rotate(${angle})`} fill="#f8f1e3" stroke="#0b1d33" strokeWidth={0.8} />
      </svg>
      <div className="mt-1 flex justify-between">
        <span>Depart</span>
        <span>Arrive</span>
      </div>
    </div>
  );
}

// --- Ambient effects --------------------------------------------------------------------------------

/** A sensor sweep rolling down the screen. */
function ScanFx() {
  return (
    <span
      className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-0 motion-safe:animate-[g-scan_5s_linear_infinite]"
      style={{ background: "linear-gradient(180deg, transparent, #a78bfa1f 70%, #c4b5fd55 98%, transparent)" }}
    />
  );
}

/** Torchlight flickering up from below. */
function TorchFx() {
  return (
    <span
      className="pointer-events-none absolute inset-0 motion-safe:animate-[g-torch_2.4s_ease-in-out_infinite]"
      style={{ background: "radial-gradient(ellipse 70% 45% at 50% 100%, #b91c1c66, transparent 70%)" }}
    />
  );
}

/** Two club spotlights pulsing in turn. */
function DiscoFx() {
  return (
    <>
      <span
        className="pointer-events-none absolute inset-0 motion-safe:animate-[g-pulse_1.1s_ease-in-out_infinite_alternate]"
        style={{ background: "radial-gradient(ellipse 50% 60% at 12% 0%, #e879f966, transparent 70%)" }}
      />
      <span
        className="pointer-events-none absolute inset-0 [animation-delay:-0.55s] motion-safe:animate-[g-pulse_1.1s_ease-in-out_infinite_alternate]"
        style={{ background: "radial-gradient(ellipse 50% 60% at 88% 0%, #22d3ee66, transparent 70%)" }}
      />
    </>
  );
}

/** CRT scanlines. */
function CrtFx() {
  return <span className="pointer-events-none absolute inset-0" style={{ background: "repeating-linear-gradient(0deg, #0000 0 2px, #02061773 2px 4px)" }} />;
}

/** A guard's searchlight sweeping across. */
function SearchlightFx() {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 -inset-x-1/2 motion-safe:animate-[g-sweep_7s_ease-in-out_infinite_alternate]"
      style={{ background: "radial-gradient(ellipse 22% 75% at 50% 0%, #fef3c72e, transparent 70%)" }}
    />
  );
}

// --- Per game ---------------------------------------------------------------------------------------

export const LOADING_LOOKS: Record<string, LoadingLook> = {
  "skate-rush": {
    shade: "#111111",
    lines: ["Waxing the rails…", "Tightening the trucks…", "Spray-painting the ramps…", "Dropping in…"],
    Bar: SkateBar,
    title: {
      emblem: Zap,
      motto: "Dodge · Jump · Grab",
      tips: [
        "Every coin adds 10 points. Coin trails lead to a safe lane.",
        "Cars block a whole lane. Switch lanes before you reach them.",
        "Jump barriers, cones and fences. Duck under striped gates.",
        "Heart = shield, star = coin magnet, jewel = double score.",
        "Slam down in mid-air to slide straight under a gate.",
        "Watch out for oncoming traffic!",
      ],
      top: "#ffffff 30%, #e5e5e5 90%",
      main: "#fef08a 10%, #facc15 50%, #f59e0b 95%",
      outline: "#111111",
      stroke: 0.14,
      depth: "drop-shadow(.2em .2em 0 #111111) drop-shadow(.42em .42em 0 #f59e0b99)",
      tilt: -4,
      charW: 0.74,
      medal: { bg: "radial-gradient(circle at 35% 28%, #fef9c3, #facc15 45%, #eab308 80%)", icon: "#111111", ring: "#111111" },
      ribbon: { bg: "linear-gradient(180deg, #262626, #111111)", text: "#facc15", edge: "#000000", shadow: "0 .1em 0 #000", depth: "drop-shadow(.16em .16em 0 #f59e0b)" },
      glow: "#facc15",
      rays: 0.35,
      spark: "#facc15",
      sky: ["#1c1917", "#292524"],
    },
  },
  "saucer-siege": {
    shade: "#05030d",
    lines: ["Calibrating the tractor beam…", "Scanning for earthlings…", "Charging the plasma cannons…", "Entering orbit…"],
    Bar: SaucerBar,
    Fx: ScanFx,
    title: {
      emblem: Orbit,
      motto: "Build · Upgrade · Defend",
      tips: [
        "Build towers beside the road before the saucers reach your keep.",
        "Ballista: fast bolts. Cannon: splash. Catapult: huge range.",
        "Turrets shred scouts but struggle against armour.",
        "Upgrade a tower to add a floor, or sell it for 70% back.",
        "Shoot purple beam saucers first. They freeze your towers.",
        "A mothership arrives every fifth wave.",
        "Call waves early for bonus gold.",
      ],
      top: "#ffffff 30%, #ede9fe 90%",
      main: "#f5f3ff 10%, #c4b5fd 50%, #8b5cf6 95%",
      outline: "#2e1065",
      stroke: 0.06,
      depth: "drop-shadow(0 0 .25em #a78bfa) drop-shadow(0 0 .9em #7c3aed)",
      charW: 0.98,
      medal: { bg: "radial-gradient(circle at 50% 40%, #2e1065, #0b0820 75%)", icon: "#c4b5fd", ring: "#a78bfa", glow: "#8b5cf6" },
      ribbon: { bg: "linear-gradient(180deg, #4c1d95, #2e1065)", text: "#ede9fe", edge: "#a78bfa", shadow: "0 0 .5em #a78bfa", depth: "drop-shadow(0 0 .4em #7c3aed)" },
      glow: "#a78bfa",
      rays: 0.3,
      spark: "#c4b5fd",
      sky: ["#2e1065", "#4c1d95"],
    },
  },
  "cannon-cove": {
    shade: "#04121c",
    lines: ["Hoisting the sails…", "Loading the cannons…", "Reading the treasure map…", "Weighing anchor…"],
    Bar: CoveBar,
    title: {
      emblem: Anchor,
      motto: "Sail · Fire · Plunder",
      tips: [
        "Your cannons point sideways. Turn side-on before you fire.",
        "Sail across the wind for top speed. Into it is painfully slow.",
        "Drop to battle sails for tight turns.",
        "A red ! means an enemy is about to fire. Turn hard!",
        "Sail through barrels and chests for gold and repairs.",
        "Every 5th wave the ghost ship rises. Leave the green rings!",
        "Pick an upgrade after every wave.",
      ],
      top: "#fffaf0 25%, #fdf3dc 60%, #e7cf9f 95%",
      main: "#fef3c7 8%, #fcd34d 40%, #f59e0b 70%, #b45309 100%",
      outline: "#3b2412",
      stroke: 0.12,
      tilt: -2,
      charW: 0.46,
      medal: { bg: "radial-gradient(circle at 35% 28%, #d6a46a, #a2703e 50%, #6b4423)", icon: "#fdf3dc", ring: "#3b2412" },
      ribbon: { bg: "linear-gradient(180deg, #b91c1c, #991b1b 60%, #7f1d1d)", text: "#fdf3dc", edge: "#450a0a" },
      glow: "#fcd34d",
      rays: 0.35,
      spark: "#bae6fd",
      clouds: true,
      sky: ["#0e4a6b", "#0369a1"],
    },
  },
  "crypt-knight": {
    shade: "#050304",
    lines: ["Lighting the torches…", "Sharpening the blade…", "Waking the dead…", "Descending into the crypt…"],
    Bar: CryptBar,
    Fx: TorchFx,
    title: {
      emblem: Skull,
      motto: "Slash · Parry · Roll",
      tips: [
        "Clear every skeleton to win the stage.",
        "The third hit of a combo breaks a warrior's shield guard.",
        "Red floor markers show where an attack will land.",
        "Block right as a hit lands to parry and stun the attacker.",
        "You can't be hurt in the middle of a roll.",
        "Fill the ring to unleash a spin attack.",
        "Stage 10 of every world is its skeleton king.",
        "Keep your health for 3 stars. Coins unlock heroes, skins and worlds.",
      ],
      top: "#fffbeb 20%, #f8e7c0 55%, #c9a24a 95%",
      main: "#fecaca 5%, #ef4444 40%, #b91c1c 75%, #7f1d1d 100%",
      outline: "#0d0a0b",
      stroke: 0.05,
      depth: "drop-shadow(0 .1em 0 #000) drop-shadow(0 0 .6em #b91c1c99) drop-shadow(0 .6em .8em #000d)",
      charW: 0.82,
      medal: { bg: "radial-gradient(circle at 35% 28%, #3f0d0d, #1a1416 70%)", icon: "#c9a24a", ring: "#c9a24a", glow: "#b91c1c" },
      ribbon: { bg: "linear-gradient(180deg, #991b1b, #7f1d1d 60%, #450a0a)", text: "#f8e7c0", edge: "#2a0505", shadow: "0 .1em 0 #000", depth: "drop-shadow(0 .1em 0 #c9a24a) drop-shadow(0 .4em .5em #000c)" },
      glow: "#ef4444",
      rays: 0,
      spark: "#f97316",
      sky: ["#3b0a0a", "#450a0a"],
    },
  },
  "order-up": {
    shade: "#1c1019",
    lines: ["Firing up the grill…", "Whipping the shakes…", "Wiping the counter…", "Flipping the sign to OPEN…"],
    Bar: DinerBar,
    title: {
      emblem: Hamburger,
      motto: "Grill · Stack · Serve",
      tips: [
        "Build each burger bottom to top, exactly as ordered.",
        "Pull patties off the grill when the ring turns green.",
        "Serve fast for bigger tips. Serving in a row builds a combo.",
        "Watch the patience bars. Empty means an angry walk-out.",
        "Wrong stack? Bin it, but wasted food costs money.",
        "Spend the day's cash on kitchen upgrades.",
      ],
      top: "#ffffff 20%, #fdf2f8 50%, #fbcfe8 90%",
      main: "#ffffff 20%, #fdf2f8 50%, #fbcfe8 90%",
      outline: "#9d174d",
      stroke: 0.12,
      depth: "drop-shadow(0 .28em 0 #be185d) drop-shadow(0 .7em .8em #000a)",
      tilt: -4,
      charW: 0.5,
      oneLine: true,
      medal: { bg: "radial-gradient(circle at 35% 28%, #fce7f3, #f9a8d4 45%, #ec4899)", icon: "#ffffff", ring: "#be185d" },
      ribbon: { bg: "linear-gradient(180deg, #5eead4, #14b8a6 60%, #0d9488)", text: "#ffffff", edge: "#0f766e", depth: "drop-shadow(0 .16em 0 #be185d) drop-shadow(0 .4em .5em #0008)" },
      glow: "#f472b6",
      rays: 0.35,
      spark: "#f9a8d4",
      sky: ["#500724", "#831843"],
    },
  },
  "hex-haven": {
    shade: "#0b2a1f",
    lines: ["Planting the forests…", "Laying the meadow tiles…", "Filling the rivers…", "Raising the cottages…"],
    Bar: HexBar,
    title: {
      emblem: Hexagon,
      motto: "Place · Match · Grow",
      tips: [
        "Every matching side scores 10 points.",
        "Rivers flow into rivers or lakes. Roads meet roads.",
        "Match every side of 3 or more neighbours for a bonus tile.",
        "Flag tiles carry quests. Grow that area to win more tiles.",
        "Peek at the next three tiles to plan ahead.",
        "The game ends when your stack runs out.",
      ],
      top: "#ffffff 30%, #ecfdf5 90%",
      main: "#ecfdf5 10%, #a7f3d0 45%, #34d399 80%, #059669 100%",
      outline: "#064e3b",
      stroke: 0.12,
      depth: "drop-shadow(0 .26em 0 #065f46) drop-shadow(0 .7em .8em #0009)",
      tilt: -2,
      charW: 0.56,
      medal: { bg: "radial-gradient(circle at 35% 28%, #ecfdf5, #6ee7b7 45%, #10b981)", icon: "#064e3b", ring: "#065f46" },
      ribbon: { bg: "linear-gradient(180deg, #fde68a, #fbbf24 60%, #f59e0b)", text: "#78350f", edge: "#b45309", shadow: "0 .1em 0 #fef3c7", depth: "drop-shadow(0 .16em 0 #065f46) drop-shadow(0 .4em .5em #0008)" },
      glow: "#a7f3d0",
      rays: 0.4,
      spark: "#d9f99d",
      clouds: true,
      sky: ["#065f46", "#047857"],
    },
  },
  "sky-hop": {
    shade: "#0c4a6e",
    ink: "#ffffff",
    lines: ["Fluffing the clouds…", "Pumping up the platforms…", "Stretching the legs…", "Polishing the coins…"],
    Bar: HopBar,
    title: {
      emblem: Star,
      motto: "Run · Jump · Stomp",
      tips: [
        "Small flags are checkpoints. They refill your hearts.",
        "Jump again in mid-air for a flipping double jump.",
        "Stomp enemies from above. Polar bears take two!",
        "Ground pound to smash crates and nearby enemies.",
        "Every level hides three stars. One is in the key's chest.",
        "100 coins earn an extra life.",
        "Snow is slippery. Start braking early!",
      ],
      top: "#ffffff 30%, #e0f2fe 90%",
      main: "#fef9c3 8%, #fde047 40%, #facc15 70%, #eab308 100%",
      outline: "#1c1917",
      stroke: 0.14,
      depth: "drop-shadow(.12em .3em 0 #1c1917) drop-shadow(0 .7em .8em #0008)",
      tilt: -4,
      charW: 0.68,
      medal: { bg: "radial-gradient(circle at 35% 28%, #fbcfe8, #f472b6 50%, #db2777)", icon: "#ffffff", ring: "#1c1917" },
      ribbon: { bg: "linear-gradient(180deg, #f472b6, #ec4899 60%, #db2777)", text: "#ffffff", edge: "#9d174d", shadow: "0 .12em 0 #1c1917" },
      glow: "#fde047",
      rays: 0.45,
      spark: "#ffffff",
      clouds: true,
      sky: ["#0369a1", "#0ea5e9"],
    },
  },
  "turbo-karts": {
    shade: "#0a0a0a",
    lines: ["Warming up the tyres…", "Filling the tanks…", "Painting the start line…", "Lining up on the grid…"],
    Bar: KartBar,
    title: {
      emblem: Trophy,
      motto: "Drift · Boost · Win",
      tips: [
        "Hold drift through a turn. Purple sparks give the biggest boost.",
        "Drive through ? boxes for turbos, shields and bananas.",
        "Drop a banana when a rival is right on your tail.",
        "Coins make your kart faster, up to 10.",
        "Stay on the asphalt. Grass slows you down.",
        "Hold the gas just before GO for a rocket start.",
        "Drift in mid-air off the big ramp for a trick boost.",
      ],
      top: "#ffffff 30%, #e5e5e5 90%",
      main: "#fed7aa 5%, #fb923c 40%, #f97316 70%, #c2410c 100%",
      outline: "#111111",
      stroke: 0.12,
      depth: "drop-shadow(.2em .2em 0 #000) drop-shadow(0 0 .9em #f9731666)",
      tilt: -6,
      charW: 0.66,
      medal: { bg: GOLD, icon: "#111111", ring: "#111111" },
      ribbon: { bg: "linear-gradient(90deg, #fb923c, #ea580c)", text: "#111111", edge: "#9a3412", shadow: "0 .08em 0 #fdba74", depth: "drop-shadow(.16em .16em 0 #000)" },
      glow: "#f97316",
      rays: 0.3,
      spark: "#fb923c",
      sky: ["#1c1917", "#292524"],
    },
  },
  "siege-smash": {
    shade: "#111a05",
    lines: ["Winding the catapult…", "Stacking the towers…", "Rounding up boulders…", "Waking the guards…"],
    Bar: SiegeBar,
    title: {
      emblem: Target,
      motto: "Aim · Fire · Topple",
      tips: [
        "Knock out every defender to clear the level.",
        "Drag back to aim. The dotted arc shows the shot.",
        "Hit towers high to topple them.",
        "Splitting stones break into three. Tap again mid-flight.",
        "Powder kegs set each other off!",
        "Fewer shots earn more stars.",
      ],
      top: "#fefce8 30%, #e7e5e4 90%",
      main: "#ecfccb 8%, #bef264 40%, #84cc16 72%, #4d7c0f 100%",
      outline: "#1a2e05",
      stroke: 0.12,
      tilt: -2,
      charW: 0.6,
      medal: { bg: "radial-gradient(circle at 35% 28%, #f5f5f4, #a8a29e 55%, #57534e)", icon: "#292524", ring: "#292524" },
      ribbon: { bg: "linear-gradient(180deg, #dc2626, #b91c1c 60%, #7f1d1d)", text: "#fefce8", edge: "#450a0a" },
      glow: "#d9f99d",
      rays: 0.35,
      spark: "#fde68a",
      clouds: true,
      sky: ["#365314", "#4d7c0f"],
    },
  },
  "beat-street": {
    shade: "#020005",
    lines: ["Tuning the decks…", "Dropping the bass…", "Hanging the disco ball…", "Clearing the dance floor…"],
    Bar: BeatBar,
    Fx: DiscoFx,
    title: {
      emblem: Disc3,
      motto: "Tap · Hold · Groove",
      tips: [
        "Hit each note as it crosses the glowing line.",
        "Hold notes with tails until the tail has passed.",
        "Every 10 notes in a row raise your multiplier, up to ×4.",
        "Fill the fever bar to double every point.",
        "Score 70% to unlock the next track.",
        "Hits feel late? Use Calibrate on the menu.",
      ],
      top: "#ffffff 20%, #f5d0fe 60%, #e879f9 100%",
      main: "#ffffff 10%, #a5f3fc 50%, #22d3ee 100%",
      outline: "#e879f9",
      stroke: 0,
      depth: "drop-shadow(0 0 .12em #e879f9) drop-shadow(0 0 .5em #e879f9) drop-shadow(0 0 1.2em #a21caf)",
      charW: 1,
      medal: { bg: "radial-gradient(circle, #1e0b2b, #07010c 75%)", icon: "#67e8f9", ring: "#e879f9", glow: "#e879f9" },
      ribbon: { bg: "linear-gradient(180deg, #22d3ee33, #22d3ee12)", text: "#a5f3fc", edge: "#22d3ee", shadow: "0 0 .5em #22d3ee", depth: "drop-shadow(0 0 .35em #22d3ee)" },
      glow: "#e879f9",
      rays: 0.25,
      spark: "#67e8f9",
      sky: ["#4a044e", "#701a75"],
    },
  },
  "putt-paradise": {
    shade: "#042f2e",
    lines: ["Mowing the greens…", "Raking the bunkers…", "Placing the flags…", "Teeing up…"],
    Bar: PuttBar,
    title: {
      emblem: FlagTriangleRight,
      motto: "Nine dreamy holes",
      tips: [
        "Sink the ball in as few strokes as you can.",
        "Drag back like a slingshot, then let go to putt.",
        "Bank shots off the walls to get round corners.",
        "Ramps and the loop need speed.",
        "Into the lagoon costs a stroke.",
        "Each hole shows its par. Beat it!",
      ],
      top: "#ffffff 40%, #f0fdfa 90%",
      main: "#ffffff 25%, #ccfbf1 60%, #5eead4 100%",
      outline: "#134e4a",
      stroke: 0.03,
      depth: "drop-shadow(0 .06em 0 #134e4a) drop-shadow(0 .4em .7em #042f2ecc)",
      charW: 0.55,
      medal: { bg: "radial-gradient(circle at 35% 28%, #ffffff, #f0fdfa 50%, #99f6e4)", icon: "#0f766e", ring: "#ffffff" },
      ribbon: { bg: "linear-gradient(180deg, #2dd4bf, #14b8a6 60%, #0f766e)", text: "#ffffff", edge: "#115e59", depth: "drop-shadow(0 .3em .5em #042f2e99)" },
      glow: "#ccfbf1",
      rays: 0.35,
      spark: "#ffffff",
      clouds: true,
      sky: ["#0f766e", "#14b8a6"],
    },
  },
  "kingdom-clash": {
    shade: "#0b1d4a",
    lines: ["Raising the walls…", "Filling the gold mines…", "Training the troops…", "Waking the Axe King…", "Polishing the Town Hall…"],
    Bar: ClashBar,
    ownPct: true,
    title: {
      emblem: Crown,
      motto: "Build · Train · Raid",
      tips: [
        "Collect from Gold Mines and Elixir Collectors when their bubbles pop up.",
        "Upgrade your Town Hall to unlock new buildings and higher levels.",
        "Storages raise how much gold and elixir you can hold.",
        "Build walls in straight lines with the Row button.",
        "The Hidden Tesla stays underground until raiders come close.",
        "Wall Breakers carry lit bombs that blow walls open.",
        "Pick a hero's card again in battle for War Cry or Vanish.",
        "Heroes sleep at their altar to heal between battles.",
        "50% destroyed is one star, the Town Hall another, everything three.",
        "Online rivals are full of loot. Hit Next to find a richer one.",
        "Lightning, heal, rage, freeze and jump spells can turn a battle.",
        "Rearrange your whole village in the layout editor.",
      ],
      top: "#ffffff 22%, #dbeafe 55%, #93c5fd 92%",
      main: "#fffbeb 6%, #fde68a 32%, #fbbf24 55%, #f59e0b 76%, #c2410c 100%",
      outline: "#1f2937",
      stroke: 0.13,
      tilt: -3,
      charW: 0.52,
      medal: { bg: GOLD, icon: "#78350f", ring: "#1f2937" },
      ribbon: { bg: "linear-gradient(180deg, #60a5fa, #2563eb 55%, #1d4ed8)", text: "#ffffff", edge: "#1e3a8a" },
      glow: "#fde68a",
      rays: 0.5,
      spark: "#fbbf24",
      clouds: true,
      sky: ["#1e3a8a", "#2563eb"],
    },
  },
  castaway: {
    shade: "#0b2531",
    lines: ["Gathering driftwood…", "Lighting the campfire…", "Charting the island…", "Washing ashore…"],
    Bar: CastawayBar,
    title: {
      emblem: TreePalm,
      motto: "Gather · Craft · Survive",
      top: "#fff7ed 40%, #fed7aa 95%",
      main: "#fff7ed 10%, #fdba74 50%, #ea580c 100%",
      outline: "#2b2118",
      stroke: 0.1,
      depth: "drop-shadow(.08em .14em 0 #2b2118) drop-shadow(0 .6em .7em #0008)",
      tilt: -3,
      charW: 0.45,
      medal: { bg: "radial-gradient(circle at 35% 28%, #fff7ed, #fdba74 55%, #c2410c)", icon: "#2b2118", ring: "#2b2118" },
      ribbon: { bg: "linear-gradient(180deg, #f7f1e1, #e7dcc4)", text: "#2b2118", edge: "#c2410c", shadow: "none", depth: "drop-shadow(.1em .14em 0 #2b2118)" },
      glow: "#fdba74",
      rays: 0.3,
      spark: "#fde68a",
      clouds: true,
      sky: ["#0e7490", "#0891b2"],
    },
  },
  "nova-strike": {
    shade: "#020617",
    lines: ["Charging the lasers…", "Warming up the cabinet…", "Loading stage one…", "Player one, get ready…"],
    Bar: NovaBar,
    Fx: CrtFx,
    title: {
      emblem: Rocket,
      motto: "Insert coin",
      top: "#ecfeff 30%, #a5f3fc 90%",
      main: "#fdf2f8 10%, #f472b6 55%, #db2777 100%",
      outline: "#020617",
      stroke: 0.08,
      depth: "drop-shadow(.12em .12em 0 #db2777) drop-shadow(0 0 .6em #22d3ee88)",
      charW: 1,
      medal: { bg: "radial-gradient(circle, #0f172a, #020617 75%)", icon: "#22d3ee", ring: "#22d3ee", glow: "#22d3ee" },
      ribbon: { bg: "linear-gradient(180deg, #0f172a, #020617)", text: "#22d3ee", edge: "#22d3ee", shadow: "0 0 .4em #22d3ee", depth: "drop-shadow(.12em .12em 0 #db2777)" },
      glow: "#22d3ee",
      rays: 0.2,
      spark: "#f472b6",
      sky: ["#0f172a", "#1e1b4b"],
    },
  },
  "night-heist": {
    shade: "#0b1220",
    lines: ["Cutting the cameras…", "Studying the blueprints…", "Timing the guards…", "Cracking the safe…"],
    Bar: HeistBar,
    Fx: SearchlightFx,
    title: {
      emblem: KeyRound,
      motto: "Sneak · Crack · Escape",
      top: "#f5f0e1 40%, #d6d3c4 95%",
      main: "#fecaca 5%, #f87171 50%, #b91c1c 100%",
      outline: "#0b0f19",
      stroke: 0.05,
      depth: "drop-shadow(0 .1em 0 #000) drop-shadow(0 0 .7em #f8717166)",
      charW: 0.7,
      medal: { bg: "radial-gradient(circle, #1e293b, #0b0f19 75%)", icon: "#f87171", ring: "#f87171", glow: "#f87171" },
      ribbon: { bg: "linear-gradient(180deg, #1e293b, #0f172a)", text: "#f5f0e1", edge: "#f87171", shadow: "0 .1em 0 #000", depth: "drop-shadow(0 .3em .5em #000b)" },
      glow: "#fef3c7",
      rays: 0,
      spark: "#fef3c7",
      sky: ["#0f172a", "#1e293b"],
    },
  },
  "sky-courier": {
    shade: "#0b1d33",
    lines: ["Filing the flight plan…", "Loading the parcels…", "Checking the weather…", "Cleared for take-off…"],
    Bar: CourierBar,
    title: {
      emblem: Plane,
      motto: "Fly · Deliver · Land",
      top: "#f8f1e3 40%, #e7dcc4 95%",
      main: "#fdf6d8 5%, #e8c766 45%, #d4af37 70%, #8a6d1c 100%",
      outline: "#0b1d33",
      stroke: 0.06,
      depth: "drop-shadow(0 .12em 0 #0b1d33) drop-shadow(0 .5em .7em #000a)",
      charW: 0.75,
      medal: { bg: "radial-gradient(circle at 35% 28%, #fdf6d8, #d4af37 55%, #8a6d1c)", icon: "#0b1d33", ring: "#0b1d33" },
      ribbon: { bg: "linear-gradient(180deg, #13294b, #0b1d33)", text: "#d4af37", edge: "#d4af37", shadow: "0 .1em 0 #000", depth: "drop-shadow(0 .3em .5em #000a)" },
      glow: "#d4af37",
      rays: 0.3,
      spark: "#f8f1e3",
      clouds: true,
      sky: ["#13294b", "#1e3a5f"],
    },
  },
};

export const loadingLook = (slug: string): LoadingLook => LOADING_LOOKS[slug] ?? LOADING_LOOKS["skate-rush"];
