"use client";

import { useEffect, useState } from "react";
import {
  ArrowBigUp,
  ChevronRight,
  Clock,
  Gem,
  Sparkles,
  X,
} from "lucide-react";
import {
  BUILDINGS,
  formatTime,
  gemsForResource,
  shortNumber,
  type BKind,
} from "./data";
import type { SelectedInfo, VillageHud } from "./engine";
import { Cost, Pic, ResIcon } from "./hud";

/**
 * Full-screen building popup: a large portrait of the building at its level and — when it can be
 * upgraded — at the next level beside it, so you see what the upgrade will look like, with every
 * stat now → next and the upgrade button with its price and time. Opened from a selected building's
 * Info (mode "info") or Upgrade (mode "upgrade") button.
 */
export function BuildingDetails({
  info,
  hud,
  mode,
  portraits,
  onUpgrade,
  onBuy,
  onClose,
}: {
  info: SelectedInfo;
  hud: VillageHud;
  mode: "info" | "upgrade";
  portraits: (kind: BKind, levels: number[]) => Promise<Record<number, string>>;
  onUpgrade: () => void;
  onBuy: (res: "gold" | "elixir", amount: number, gems: number) => void;
  onClose: () => void;
}) {
  const kind = info.kind === "obstacle" ? null : info.kind;
  const level = Math.max(1, info.level);
  const up = info.upgrade;
  // The next level is shown even while the Town Hall still locks it (or while it's being built).
  const nextLevel =
    kind && info.level >= 1 && info.level < info.maxLevel
      ? info.level + 1
      : null;
  const [pics, setPics] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!kind) return;
    let live = true;
    void portraits(kind, nextLevel ? [level, nextLevel] : [level]).then(
      (p) => live && setPics(p),
    );
    return () => {
      live = false;
    };
  }, [kind, level, nextLevel, portraits]);

  const have = up
    ? up.res === "gold"
      ? hud.gold
      : up.res === "elixir"
        ? hud.elixir
        : hud.gems
    : 0;
  const missing =
    up && up.res !== "gems" && have < up.cost ? up.cost - have : 0;
  const cap = up?.res === "gold" ? hud.goldCap : hud.elixirCap;
  const canPress = !!up && (up.can || !!up.reason?.startsWith("Not enough"));
  const title =
    info.kind === "obstacle"
      ? info.name
      : nextLevel && mode === "upgrade"
        ? `Upgrade ${info.name}`
        : info.name;

  return (
    <div
      className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[2px] land:backdrop-blur-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="safe-pad flex h-full items-center justify-center sm:p-4 land:safe-pad">
        <div
          role="dialog"
          aria-label={title}
          className="g-panel flex max-h-full w-full max-w-3xl animate-[game-fade_0.25s_ease] flex-col overflow-hidden land:h-full land:max-w-none"
        >
          <div className="flex items-center gap-3 px-4 pt-2.5 pb-1">
            <h2 className="g-panel-title min-w-0 flex-1 truncate text-2xl sm:text-3xl land:text-[22px]">
              {title}
              {kind && (
                <span className="g-muted ml-2 text-base">
                  {info.level < 1 ? "being built" : `Level ${info.level}`}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-10 shrink-0 place-items-center rounded-full border-[3px] border-red-900 bg-gradient-to-b from-red-400 to-red-700 text-white shadow-[0_3px_0_#7f1d1d]"
            >
              <X className="size-5" strokeWidth={3} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 land:grid land:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] land:gap-4 land:overflow-hidden">
            {/* Previews: this level → the next */}
            <div className="flex items-center justify-center gap-2 land:h-full">
              {kind ? (
                <>
                  <Preview
                    src={pics[level]}
                    label={info.level < 1 ? "Level 1" : `Level ${level}`}
                    dim={!!nextLevel && mode === "upgrade"}
                  />
                  {nextLevel && (
                    <>
                      <ChevronRight
                        className="size-9 shrink-0 text-amber-600"
                        strokeWidth={3}
                      />
                      <Preview
                        src={pics[nextLevel]}
                        label={`Level ${nextLevel}`}
                        next
                      />
                    </>
                  )}
                </>
              ) : (
                <p className="g-tint rounded-xl p-6 text-center text-sm font-semibold">
                  {info.desc}
                </p>
              )}
            </div>
            {/* Stats and the upgrade */}
            {/* Stats scroll when the screen is short; the upgrade button below always stays in view. */}
            <div className="mt-3 flex min-h-0 flex-col land:mt-0 land:pb-1.5">
              <div className="min-h-0 flex-1 land:overflow-y-auto">
                {kind && (
                  <p className="g-muted line-clamp-3 text-[12px] leading-snug land:line-clamp-2">
                    {info.desc}
                  </p>
                )}
                <div className="mt-1.5 space-y-1">
                  {info.stats.map((s) => (
                    <div
                      key={s.label}
                      className="g-tint flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                    >
                      <span className="g-muted w-[5.5rem] shrink-0 text-[10px] font-bold tracking-wide uppercase">
                        {s.label}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] leading-tight font-bold">
                        {s.value}
                        {s.next && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-green-600 px-1.5 py-px text-[11px] text-white">
                            <ArrowBigUp className="size-3" /> {s.next}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {info.busy && (
                  <p className="g-tint mt-1.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold">
                    <Clock className="size-3.5" /> {info.busy.label} ·{" "}
                    {formatTime(info.busy.left)} left
                  </p>
                )}
                {!up && kind && info.level >= info.maxLevel && (
                  <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[13px] font-bold text-white">
                    <Sparkles className="size-4" /> Max level —{" "}
                    {BUILDINGS[kind].name} is fully upgraded
                  </p>
                )}
              </div>
              {up && (
                <div className="shrink-0 pt-2">
                  {up.reason && !up.can && (
                    <p className="mb-1 text-center text-[12px] font-bold text-red-700">
                      {up.reason}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onUpgrade();
                      if (up.can) onClose();
                    }}
                    disabled={!canPress}
                    className="g-btn flex w-full items-center justify-center px-3 py-1.5 text-lg disabled:opacity-55"
                  >
                    <span className="g-unskew flex-col gap-0 leading-tight">
                      <span className="inline-flex items-center gap-1.5">
                        <ArrowBigUp className="size-5" />
                        {info.kind === "obstacle"
                          ? up.label
                          : nextLevel
                            ? `Upgrade to level ${nextLevel}`
                            : up.label}
                      </span>
                      {up.cost > 0 && (
                        <span className="inline-flex items-center gap-3 text-sm">
                          <Cost res={up.res} amount={up.cost} have={have} />
                          {up.time > 0 && (
                            <span className="inline-flex items-center gap-1 opacity-90">
                              <Clock className="size-4" />
                              {formatTime(up.time)}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                  {missing > 0 && missing <= cap && (
                    <button
                      type="button"
                      onClick={() =>
                        onBuy(
                          up.res as "gold" | "elixir",
                          missing,
                          gemsForResource(missing),
                        )
                      }
                      className="g-soft mt-1.5 flex w-full items-center justify-center px-3 py-1.5 text-[13px] font-bold"
                    >
                      <span className="g-unskew gap-1.5">
                        <Gem className="size-4" /> Buy the missing{" "}
                        {shortNumber(missing)}{" "}
                        <ResIcon res={up.res} size={12} /> for{" "}
                        <ResIcon res="gems" size={12} />{" "}
                        {gemsForResource(missing)}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Preview({
  src,
  label,
  next = false,
  dim = false,
}: {
  src?: string;
  label: string;
  next?: boolean;
  dim?: boolean;
}) {
  return (
    <figure
      className={`flex min-w-0 flex-1 flex-col items-center ${dim ? "opacity-75" : ""}`}
    >
      <div
        className={`relative grid aspect-square w-full max-w-[min(12rem,38vh)] place-items-center rounded-2xl ${next ? "bg-[radial-gradient(circle_at_50%_55%,#fde68a,#f59e0b33_60%,transparent_72%)]" : "bg-[radial-gradient(circle_at_50%_55%,#ffffffb3,transparent_70%)]"}`}
      >
        {src ? (
          <Pic
            src={src}
            alt=""
            className="size-full object-contain motion-safe:animate-[kc-bob_3.2s_ease-in-out_infinite]"
          />
        ) : (
          <span className="size-10 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
        )}
        {next && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-amber-950 uppercase ring-2 ring-amber-900">
            Next
          </span>
        )}
      </div>
      <figcaption
        className={`g-display mt-0.5 text-base ${next ? "text-amber-700" : ""}`}
      >
        {label}
      </figcaption>
    </figure>
  );
}
