"use client";

import { useEffect, type ReactNode } from "react";
import { Anchor, Check, CloudFog, CloudRain, Lock, Play, RotateCcw, Sailboat, Snowflake, Star, Sun, TreePalm, X, type LucideIcon } from "lucide-react";
import { ISLANDS, islandOpen, starCount, totalStars, type ProgressSave } from "./campaign";
import type { SaveInfo } from "./engine";

/**
 * The sea chart: the five islands in the order they are sailed, with the stars earned on each. An
 * island opens once the one before it has been escaped. Picking one shows it behind the chart; its
 * card says what is new there and what its three stars are for.
 */

const ICONS: Record<string, LucideIcon> = { cove: TreePalm, boar: CloudRain, dune: Sun, frost: Snowflake, beacon: CloudFog };

export function Stars({ n, className = "size-4" }: { n: number; className?: string }) {
  return (
    <span className="inline-flex gap-px" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${className} ${i < n ? "fill-[#f59e0b] text-[#b45309]" : "text-[#2b2118]/30"}`} />
      ))}
    </span>
  );
}

export function Chart({
  save,
  saveInfo,
  pick,
  confirm,
  onPick,
  onLand,
  onContinue,
  onCancel,
  onClose,
}: {
  save: ProgressSave;
  /** The island in progress, if any. */
  saveInfo: SaveInfo | null;
  pick: number;
  /** Asking before a camp in progress is thrown away. */
  confirm: boolean;
  onPick: (i: number) => void;
  onLand: (i: number) => void;
  onContinue: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const def = ISLANDS[pick];
  const open = islandOpen(save, pick);
  const mask = save.stars[pick] ?? 0;
  const here = saveInfo?.island === pick;
  const best = save.best[pick] ?? 0;

  // Keys: ← → pick, Enter lands / continues, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        onPick((pick + (e.key === "ArrowRight" ? 1 : -1) + ISLANDS.length) % ISLANDS.length);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (!open) return;
        if (here && !confirm) onContinue();
        else onLand(pick);
      } else if (e.key === "Escape") {
        // (No preventDefault on Esc: the browser needs the key to leave full screen.)
        e.stopImmediatePropagation();
        if (confirm) onCancel();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const goals: [string, boolean][] = [
    ["Get off the island", (mask & 1) > 0],
    [`Leave by the end of day ${def.par}`, (mask & 2) > 0],
    [def.bonus.text, (mask & 4) > 0],
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex max-h-full justify-center p-2 pb-[max(env(safe-area-inset-bottom),8px)] sm:p-4">
      <section role="dialog" aria-label="Sea chart" onPointerDown={(e) => e.stopPropagation()} className="g-panel pointer-events-auto flex max-h-[calc(100dvh-16px)] w-full max-w-2xl flex-col overflow-hidden p-3 sm:p-4 land:max-w-3xl land:p-2.5">
        <div className="flex items-center gap-2">
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-2xl leading-none sm:text-3xl land:text-xl">Sea chart</h2>
          <span className="g-tint g-display inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-base tabular-nums land:py-0.5">
            <Star className="size-4 fill-[#f59e0b] text-[#b45309]" /> {totalStars(save)}/{ISLANDS.length * 3}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close (Esc)"
            className="g-tint grid size-8 shrink-0 place-items-center rounded-lg hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-7"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* The route: five islands, left to right. */}
        <ol className="mt-2 grid grid-cols-5 gap-1.5 land:mt-1.5">
          {ISLANDS.map((isl, i) => {
            const ok = islandOpen(save, i);
            const Icon = ICONS[isl.id] ?? TreePalm;
            return (
              <li key={isl.id}>
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  aria-pressed={i === pick}
                  aria-label={`${i + 1}. ${isl.name}${ok ? "" : " — locked"}`}
                  data-cw-island={i}
                  className={`relative flex h-[68px] w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-0.5 transition land:h-14 ${
                    i === pick ? "border-[var(--accent)] bg-[#fff7ed]/85 shadow-[2px_3px_0_#2b211840]" : "border-transparent bg-[#2b2118]/8 hover:bg-[#2b2118]/14"
                  } ${ok ? "" : "opacity-55"}`}
                >
                  {ok ? <Icon className="size-5" /> : <Lock className="size-4" />}
                  <span className="g-display w-full truncate text-center text-[13px] leading-none sm:text-[15px]">
                    <span className="sm:hidden">{i + 1}</span>
                    <span className="hidden sm:inline">{isl.name}</span>
                  </span>
                  {ok && <Stars n={starCount(save.stars[i] ?? 0)} className="size-3" />}
                  {saveInfo?.island === i && <Anchor className="absolute top-1 right-1 size-3 text-[var(--accent)]" aria-label="Camp in progress" />}
                </button>
              </li>
            );
          })}
        </ol>

        {/* The picked island. */}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain land:mt-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="g-display text-2xl leading-tight land:text-xl">
              {pick + 1}. {def.name}
            </h3>
            {best > 0 && <span className="g-muted text-sm">Fastest escape: {best.toFixed(1)} days</span>}
          </div>
          <p className="text-[15px] leading-snug land:text-sm">{def.blurb}</p>
          <p className="g-muted mt-0.5 text-sm leading-snug">{def.twist}</p>
          <ul className="mt-1.5 grid grid-cols-1 gap-x-3 gap-y-0.5 text-sm sm:grid-cols-3 land:grid-cols-3">
            {goals.map(([text, done], i) => (
              <li key={i} className={`flex items-start gap-1 leading-tight ${done ? "" : "opacity-80"}`}>
                <Star className={`mt-0.5 size-3.5 shrink-0 ${done ? "fill-[#f59e0b] text-[#b45309]" : "text-[#2b2118]/45"}`} />
                <span>
                  {text}
                  {done && <Check className="ml-1 inline size-3.5 text-[#15803d]" aria-label="earned" />}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-2 land:mt-1.5">
          {confirm ? (
            <div className="space-y-2">
              <p className="text-center text-[15px] leading-snug">
                Land on {def.name} from scratch? Your day {saveInfo?.day} camp on {ISLANDS[saveInfo?.island ?? 0].name} will be lost.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <ChartButton soft onClick={onCancel}>
                  Keep my camp
                </ChartButton>
                <ChartButton onClick={() => onLand(pick)}>
                  <Sailboat className="size-5" /> Land anew
                </ChartButton>
              </div>
            </div>
          ) : !open ? (
            <p className="g-tint g-display flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-center text-base">
              <Lock className="size-4" /> Escape {ISLANDS[pick - 1].name} to chart a course here
            </p>
          ) : here ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <ChartButton onClick={onContinue}>
                <Play className="size-5 fill-current" /> Continue · Day {saveInfo.day}
              </ChartButton>
              <ChartButton soft onClick={() => onLand(pick)}>
                <RotateCcw className="size-4" /> Start over
              </ChartButton>
            </div>
          ) : (
            <ChartButton onClick={() => onLand(pick)}>
              <Sailboat className="size-5" /> {mask > 0 ? "Land again" : "Land here"}
            </ChartButton>
          )}
        </div>
      </section>
    </div>
  );
}

function ChartButton({ onClick, soft = false, children }: { onClick: () => void; soft?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      data-cw-go={soft ? undefined : ""}
      onClick={onClick}
      className={`${soft ? "g-soft text-base" : "g-btn text-xl"} flex w-full items-center justify-center px-4 py-2.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] land:py-1.5 land:text-base`}
    >
      <span className="g-unskew gap-2 whitespace-nowrap">{children}</span>
    </button>
  );
}
