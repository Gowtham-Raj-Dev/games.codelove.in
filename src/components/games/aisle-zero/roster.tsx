"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Coins, EyeOff, Lock, Play, ShoppingBag, Star, Target, Timer, X } from "lucide-react";
import { BigButton, formatNumber } from "../shared/ui";
import { basePay, CHAPTERS, chapterOf, formatTime, goalText, nextNight, NIGHT_COUNT, nightOpen, NIGHTS, NIGHTS_PER_CHAPTER, STAR, starCount, totalStars, type Save } from "./content";

/**
 * The shift roster: five chapters of six nights. Nights open one by one (escape one to open the next); each
 * has three stars — escape in time, never be spotted, the night's own goal — that can be won on separate runs.
 */

export function Stars({ bits, className = "size-3" }: { bits: number; className?: string }) {
  return (
    <span className="inline-flex gap-px" aria-label={`${starCount(bits)} of 3 stars`}>
      {[STAR.time, STAR.unseen, STAR.goal].map((b) => (
        <Star key={b} className={`${className} ${bits & b ? "fill-[#e8b83a] text-[#e8b83a]" : "text-white/25"}`} />
      ))}
    </span>
  );
}

/** One of a night's three stars, spelled out. */
export function StarLine({ icon, won, children }: { icon: "time" | "unseen" | "goal"; won: boolean; children: ReactNode }) {
  const Icon = icon === "time" ? Timer : icon === "unseen" ? EyeOff : Target;
  return (
    <li className={`flex items-center gap-2 ${won ? "" : "opacity-70"}`}>
      <Star className={`size-4 shrink-0 ${won ? "fill-[#e8b83a] text-[#e8b83a]" : "text-white/30"}`} />
      <Icon className="size-3.5 shrink-0 text-[#a5a18d]" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function Roster({ save, compact, onPlay, onShop, onClose }: { save: Save; compact: boolean; onPlay: (night: number) => void; onShop: () => void; onClose: () => void }) {
  const [picked, setPicked] = useState(() => nextNight(save));
  const chapter = chapterOf(picked);
  const night = NIGHTS[picked];
  const open = nightOpen(save, picked);
  const bits = save.stars[picked] ?? 0;

  // Keys: ← → pick a night, Enter starts it, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setPicked((n) => Math.max(0, Math.min(NIGHT_COUNT - 1, n + (e.key === "ArrowRight" ? 1 : -1))));
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        if (open) onPlay(picked);
      } else if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-black/55" onPointerDown={(e) => e.stopPropagation()}>
      <div className={`grid min-h-full place-items-center ${compact ? "p-2" : "p-4"}`}>
        <section role="dialog" aria-label="Shift roster" className={`g-panel w-full max-w-3xl ${compact ? "p-2.5" : "p-5"}`}>
          <div className="flex items-center gap-2">
            <h2 className={`g-panel-title min-w-0 flex-1 truncate leading-none ${compact ? "text-lg" : "text-3xl"}`}>Shift roster</h2>
            <span className="g-tint inline-flex shrink-0 items-center gap-1 rounded-[3px] px-2 py-1 text-xs font-bold tabular-nums">
              <Star className="size-3.5 fill-[#e8b83a] text-[#e8b83a]" /> {totalStars(save)}/{NIGHT_COUNT * 3}
            </span>
            <button type="button" onClick={onShop} className="g-tint inline-flex shrink-0 items-center gap-1 rounded-[3px] px-2 py-1 text-xs font-bold tabular-nums hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)]" title="Staff shop">
              <Coins className="size-3.5 text-[#e8b83a]" /> {formatNumber(save.bank)} <ShoppingBag className="ml-1 size-3.5" />
            </button>
            <button type="button" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)" className="g-tint grid size-8 shrink-0 place-items-center rounded-[3px] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              <X className="size-4" />
            </button>
          </div>

          {/* Chapters: a locked one opens when the chapter before it is finished. */}
          <div className={`grid grid-cols-5 gap-1 ${compact ? "mt-2" : "mt-4"}`} role="tablist">
            {CHAPTERS.map((c, i) => {
              const first = i * NIGHTS_PER_CHAPTER;
              const unlocked = nightOpen(save, first);
              // opens on the night that is up next when it is in this chapter, else on the chapter's first
              const next = nextNight(save);
              const land = chapterOf(next) === i ? next : first;
              const stars = save.stars.slice(first, first + NIGHTS_PER_CHAPTER).reduce((n, s) => n + starCount(s), 0);
              return (
                <button
                  key={c.name}
                  type="button"
                  role="tab"
                  aria-selected={i === chapter}
                  onClick={() => setPicked(land)}
                  title={c.name}
                  className={`g-display flex min-w-0 flex-col items-center justify-center rounded-[3px] px-1 transition ${compact ? "py-1 text-[10px]" : "py-1.5 text-xs"} ${
                    i === chapter ? "bg-[var(--accent)] text-black" : unlocked ? "g-tint hover:brightness-125" : "g-tint opacity-50"
                  }`}
                >
                  <span className="flex w-full items-center justify-center gap-1">
                    {!unlocked && <Lock className="size-3 shrink-0" />}
                    <span className="truncate">{compact ? `Ch. ${i + 1}` : c.name}</span>
                  </span>
                  <span className="text-[10px] tabular-nums opacity-80">
                    {stars}/{NIGHTS_PER_CHAPTER * 3}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={`grid gap-3 ${compact ? "mt-2 grid-cols-[1fr_1.15fr]" : "mt-4 sm:grid-cols-[1fr_1.1fr]"}`}>
            {/* The chapter's six nights. */}
            <div>
              {!compact && <p className="g-muted mb-2 text-xs">{CHAPTERS[chapter].blurb}</p>}
              <ol className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: NIGHTS_PER_CHAPTER }, (_, k) => {
                  const n = chapter * NIGHTS_PER_CHAPTER + k;
                  const unlocked = nightOpen(save, n);
                  const done = !!save.done[n];
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        onClick={() => setPicked(n)}
                        onDoubleClick={() => unlocked && onPlay(n)}
                        aria-pressed={n === picked}
                        aria-label={`Night ${n + 1}: ${NIGHTS[n].name}${unlocked ? "" : " (locked)"}`}
                        className={`relative flex w-full flex-col items-center justify-center gap-0.5 rounded-[3px] border-2 transition ${compact ? "h-12" : "h-[68px]"} ${
                          n === picked ? "border-[var(--accent)] bg-white/12" : "border-transparent bg-white/6 hover:bg-white/10"
                        } ${unlocked ? "" : "opacity-45"}`}
                      >
                        {unlocked ? <span className={`g-display leading-none tabular-nums ${compact ? "text-base" : "text-2xl"}`}>{n + 1}</span> : <Lock className="size-4" />}
                        {unlocked && <Stars bits={save.stars[n] ?? 0} className={compact ? "size-2.5" : "size-3"} />}
                        {done && <Check className="absolute top-1 right-1 size-3 text-[#6f9a5c]" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* The night that is picked. */}
            <div className={`g-tint flex min-w-0 flex-col rounded-[3px] ${compact ? "p-2" : "p-3"}`}>
              <p className="g-display text-[10px] tracking-[0.25em] text-[var(--accent)] uppercase">
                Night {picked + 1} · {night.items.length} items · wage {basePay(picked)}
              </p>
              <h3 className={`g-panel-title mt-0.5 leading-tight ${compact ? "text-base" : "text-2xl"}`}>{night.name}</h3>
              <p className={`mt-1 leading-snug text-[#cfc8b0] ${compact ? "line-clamp-3 text-[11px]" : "text-sm"}`}>{night.brief}</p>
              <ul className={`mt-2 space-y-1 ${compact ? "text-[11px]" : "text-[13px]"}`}>
                <StarLine icon="time" won={!!(bits & STAR.time)}>
                  Escape in under {formatTime(night.par)}
                  {save.times[picked] ? <span className="g-muted"> · best {formatTime(save.times[picked])}</span> : null}
                </StarLine>
                <StarLine icon="unseen" won={!!(bits & STAR.unseen)}>
                  Never let it spot you
                </StarLine>
                <StarLine icon="goal" won={!!(bits & STAR.goal)}>
                  {goalText(night.goal)}
                </StarLine>
              </ul>
              <div className={`mt-auto ${compact ? "pt-2" : "pt-3"}`}>
                {open ? (
                  <BigButton onClick={() => onPlay(picked)} icon={<Play className="size-5 fill-current" />} autoFocus>
                    <span data-az-clock-in>Clock in</span>
                  </BigButton>
                ) : (
                  <p className="g-muted flex items-center justify-center gap-1.5 py-2 text-center text-xs font-semibold">
                    <Lock className="size-3.5" /> Escape night {picked} first
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
