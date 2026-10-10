"use client";

import { useEffect } from "react";
import { Flag, Lock, Star, X } from "lucide-react";
import { STAGES_PER_WORLD, WORLDS } from "./content";
import { WorldThumb } from "./shop";

/**
 * The stage map: a world's ten stages with their stars. Stages open one by one (finish one to open
 * the next), and the world tabs switch between the worlds you own — a locked one opens the shop.
 */

export interface StageInfo {
  /** Stars found (0–3). */
  stars: number;
  /** Finished at least once. */
  done: boolean;
}

export function Stars({ n, className = "size-3" }: { n: number; className?: string }) {
  return (
    <span className="inline-flex gap-px" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star key={i} className={`${className} stroke-[#1c1917] stroke-[2.5] ${i < n ? "fill-[var(--accent)]" : "fill-transparent opacity-30"}`} />
      ))}
    </span>
  );
}

/** First stage not finished yet (the last one when all are). */
export const nextStage = (stages: StageInfo[]) => {
  const i = stages.findIndex((s) => !s.done);
  return i < 0 ? stages.length - 1 : i;
};

export function StageMap({
  world,
  stages,
  owned,
  onWorld,
  onPlay,
  onClose,
}: {
  world: string;
  stages: StageInfo[];
  /** Worlds the player can enter. */
  owned: (id: string) => boolean;
  onWorld: (id: string) => void;
  onPlay: (stage: number) => void;
  onClose: () => void;
}) {
  const next = nextStage(stages);
  const total = stages.reduce((a, s) => a + s.stars, 0);
  const index = WORLDS.findIndex((w) => w.id === world);
  const def = WORLDS[index] ?? WORLDS[0];
  const done = stages.every((s) => s.done);
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
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-lg leading-none sm:text-2xl land:text-base">{def.name}</h2>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border-[3px] border-[#1c1917] bg-white px-2 py-0.5 text-xs font-black tabular-nums">
            <Star className="size-3.5 fill-[var(--accent)] stroke-[#1c1917] stroke-[2.5]" /> {total}/{STAGES_PER_WORLD * 3}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close (Esc)"
            className="grid size-8 shrink-0 place-items-center rounded-full border-[3px] border-[#1c1917] bg-white hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-7"
          >
            <X className="size-4" strokeWidth={3} />
          </button>
        </div>

        {/* Worlds you own switch here; locked ones open the shop. */}
        <div className="mt-2 grid grid-cols-6 gap-1 land:mt-1.5">
          {WORLDS.map((w, i) => {
            const open = owned(w.id);
            const on = w.id === world;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onWorld(w.id)}
                aria-pressed={on}
                aria-label={`${w.name}${open ? "" : " (locked)"}`}
                title={w.name}
                className={`relative overflow-hidden rounded-xl border-[3px] border-[#1c1917] transition ${on ? "-translate-y-0.5 shadow-[0_3px_0_#1c1917] ring-2 ring-[var(--accent)]" : "hover:-translate-y-0.5"} ${open ? "" : "opacity-60"}`}
              >
                <WorldThumb world={w} className="relative block h-9 w-full sm:h-11 land:h-8" />
                <span className="g-display absolute top-0 left-1 text-[10px] text-white [text-shadow:1px_1px_0_#1c1917]">{i + 1}</span>
                {!open && (
                  <span className="absolute inset-0 grid place-items-center bg-[#1c1917]/35">
                    <Lock className="size-3.5 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <ol className="mt-2 grid grid-cols-5 gap-1.5 land:mt-1.5 land:gap-1">
          {stages.map((s, i) => {
            const locked = i > 0 && !stages[i - 1].done;
            const last = i === STAGES_PER_WORLD - 1;
            const up = i === next && !locked;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onPlay(i)}
                  aria-label={`Stage ${i + 1}: ${def.stages[i]}${locked ? " — locked" : ""}`}
                  title={def.stages[i]}
                  className={`relative flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border-[3px] border-[#1c1917] transition sm:h-16 land:h-11 ${
                    up ? "-translate-y-0.5 animate-[skyhop-bob_1.6s_ease-in-out_infinite] bg-[var(--accent)] shadow-[0_4px_0_#1c1917]" : s.done ? "bg-white hover:bg-amber-50" : "bg-white/70"
                  } ${locked ? "opacity-50" : ""}`}
                >
                  {locked ? (
                    <Lock className="size-4" />
                  ) : last ? (
                    <Flag className="size-5 fill-[#ef4444] stroke-[#1c1917]" />
                  ) : (
                    <span className="g-display text-base leading-none tabular-nums sm:text-lg land:text-sm">{i + 1}</span>
                  )}
                  {!locked && <Stars n={s.stars} className="size-2.5 sm:size-3" />}
                </button>
              </li>
            );
          })}
        </ol>

        <p className="g-muted mt-2 text-center text-[11px] leading-tight font-bold land:mt-1.5">
          {done
            ? after
              ? owned(after.id)
                ? `World cleared! ${after.name} is open.`
                : `World cleared! Unlock ${after.name} in the shop.`
              : "Every world cleared — now find all 180 stars!"
            : `Next: ${def.stages[next]} · finish a stage to open the next · ×${def.coinMult} coins here`}
        </p>
      </section>
    </div>
  );
}
