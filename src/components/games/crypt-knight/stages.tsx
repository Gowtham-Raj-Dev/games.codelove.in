"use client";

import { useEffect } from "react";
import { Crown, Lock, Star, X } from "lucide-react";
import { ROOMS_PER_WORLD, WORLDS } from "./content";

/**
 * The stage map: a world's ten stages with their stars. Stages open one by one — the king's stage
 * only after the nine before it — and the world chips switch between the worlds you own.
 */

export function Stars({ n, className = "size-3" }: { n: number; className?: string }) {
  return (
    <span className="inline-flex gap-px" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${className} ${i < n ? "fill-amber-300 text-amber-300" : "text-white/25"}`} />
      ))}
    </span>
  );
}

/** First stage without stars (the last one when all are cleared). */
export const nextStage = (stars: number[]) => {
  const i = stars.findIndex((s) => s === 0);
  return i < 0 ? stars.length - 1 : i;
};

export function StageMap({
  world,
  stars,
  owned,
  onWorld,
  onPlay,
  onClose,
}: {
  world: string;
  /** Stars per stage of this world (0 = not cleared). */
  stars: number[];
  /** Worlds the player can enter. */
  owned: (id: string) => boolean;
  onWorld: (id: string) => void;
  onPlay: (stage: number) => void;
  onClose: () => void;
}) {
  const next = nextStage(stars);
  const total = stars.reduce((a, b) => a + b, 0);
  const index = WORLDS.findIndex((w) => w.id === world);
  const done = stars.every((s) => s > 0);
  const after = WORLDS[index + 1];

  // Keys: Enter plays the next stage, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        onPlay(next);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-2 pb-[max(env(safe-area-inset-bottom),8px)] sm:p-4">
      <section role="dialog" aria-label="Stages" onPointerDown={(e) => e.stopPropagation()} className="g-panel pointer-events-auto w-full max-w-xl p-2.5 sm:p-4 land:max-w-lg land:p-2">
        <div className="flex items-center gap-2">
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-lg leading-none sm:text-2xl land:text-base">{WORLDS[index]?.name}</h2>
          <span className="g-tint inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold tabular-nums">
            <Star className="size-3.5 fill-amber-300 text-amber-300" /> {total}/{ROOMS_PER_WORLD * 3}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close (Esc)"
            className="g-tint grid size-8 shrink-0 place-items-center rounded-lg hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-7"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Worlds you own switch here; locked ones open the shop. */}
        <div className="mt-2 flex gap-1 land:mt-1.5">
          {WORLDS.map((w, i) => {
            const open = owned(w.id);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onWorld(w.id)}
                aria-pressed={w.id === world}
                title={w.name}
                className={`g-display flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1 text-[11px] transition ${
                  w.id === world ? "bg-[var(--accent)] text-black" : open ? "g-tint hover:brightness-125" : "g-tint opacity-50"
                }`}
              >
                {!open && <Lock className="size-3 shrink-0" />}
                <span className="truncate">{i + 1}</span>
                <span className="hidden truncate sm:inline">· {w.name.replace(/^The /, "")}</span>
              </button>
            );
          })}
        </div>

        <ol className="mt-2 grid grid-cols-5 gap-1.5 land:mt-1.5 land:gap-1">
          {stars.map((n, i) => {
            const locked = i > 0 && stars[i - 1] === 0;
            const king = i === ROOMS_PER_WORLD - 1;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onPlay(i)}
                  aria-label={`Stage ${i + 1}${king ? " (king)" : ""}${locked ? " — locked" : ""}`}
                  className={`relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 transition sm:h-16 land:h-11 ${
                    i === next && !locked ? "border-[var(--accent)] bg-white/12 shadow-[0_0_14px_var(--accent)]" : "border-transparent bg-white/6 hover:bg-white/12"
                  } ${locked ? "opacity-45" : ""} ${king ? "bg-gradient-to-b from-amber-400/25 to-transparent" : ""}`}
                >
                  {locked ? (
                    <Lock className="size-4" />
                  ) : king ? (
                    <Crown className="size-5 text-amber-300" />
                  ) : (
                    <span className="g-display text-base leading-none tabular-nums sm:text-lg land:text-sm">{i + 1}</span>
                  )}
                  {!locked && <Stars n={n} className="size-2.5 sm:size-3" />}
                </button>
              </li>
            );
          })}
        </ol>

        <p className="g-muted mt-2 text-center text-[11px] leading-tight font-semibold land:mt-1.5">
          {done
            ? after
              ? `World cleared! ${after.name} can now be unlocked in the shop.`
              : "Every world cleared — go for 3 stars everywhere!"
            : "Clear a stage to open the next · the king waits at stage 10 · keep your health for 3 stars"}
        </p>
      </section>
    </div>
  );
}
