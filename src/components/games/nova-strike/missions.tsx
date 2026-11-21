"use client";

import { useEffect } from "react";
import { CircleDot, Crosshair, Lock, Package, Skull, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { formatNumber } from "../shared/ui";
import { isUnlocked, nextMission, type Save } from "./content";
import { Medal } from "./hud";
import { MISSION_LABEL, MISSIONS_PER_SECTOR, SECTORS, STAGES, type MissionType } from "./stages";

/**
 * The mission map: five sectors of seven missions with the medal and best score of each. Missions
 * open one by one; a sector opens when the boss of the one before it is down.
 */

export const TYPE_ICONS: Record<MissionType, LucideIcon> = { strike: Crosshair, rings: CircleDot, convoy: Package, gauntlet: TriangleAlert, boss: Skull };

/** Medals earned in a sector, out of three per mission. */
const sectorMedals = (save: Save, sector: number) => {
  let n = 0;
  for (let i = 0; i < MISSIONS_PER_SECTOR; i++) n += save.medals[sector * MISSIONS_PER_SECTOR + i] ?? 0;
  return n;
};

export function MissionMap({ save, sector, onSector, onPlay, onClose }: { save: Save; sector: number; onSector: (sector: number) => void; onPlay: (stage: number) => void; onClose: () => void }) {
  const next = nextMission(save);
  const def = SECTORS[sector] ?? SECTORS[0];
  const first = sector * MISSIONS_PER_SECTOR;
  const cleared = STAGES.every((_, i) => (save.medals[i] ?? 0) > 0);

  // Keys: Enter plays the next mission, ← → change sector, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        onPlay(next);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        onSector((sector + (e.key === "ArrowRight" ? 1 : -1) + SECTORS.length) % SECTORS.length);
      } else if (e.key === "Escape") {
        // (No preventDefault on Esc: the browser needs the key to leave full screen.)
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-2 pb-[max(env(safe-area-inset-bottom),8px)] sm:p-4">
      <section role="dialog" aria-label="Missions" onPointerDown={(e) => e.stopPropagation()} className="g-panel pointer-events-auto w-full max-w-2xl p-2.5 sm:p-4 land:max-w-xl land:p-2">
        <div className="flex items-center gap-2">
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-sm leading-none sm:text-lg land:text-xs" style={{ color: def.color }}>
            {sector + 1}. {def.name}
          </h2>
          <span className="g-tint inline-flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs font-bold tabular-nums">
            <Medal tier={3} size="xs" /> {sectorMedals(save, sector)}/{MISSIONS_PER_SECTOR * 3}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close (Esc)"
            className="g-tint grid size-8 shrink-0 place-items-center hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-7"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Sectors. */}
        <div className="mt-2 flex gap-1 land:mt-1.5" role="tablist">
          {SECTORS.map((s, i) => {
            const open = isUnlocked(save, i * MISSIONS_PER_SECTOR);
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === sector}
                onClick={() => onSector(i)}
                title={s.name}
                data-sector={i}
                className={`g-display flex min-w-0 flex-1 items-center justify-center gap-1 px-1 py-2 text-[9px] transition land:py-1.5 ${i === sector ? "text-[#020617]" : open ? "g-tint hover:brightness-125" : "g-tint opacity-50"}`}
                style={i === sector ? { background: s.color } : undefined}
              >
                {!open && <Lock className="size-3 shrink-0" />}
                <span>{i + 1}</span>
                <span className="hidden truncate sm:inline">· {s.short}</span>
              </button>
            );
          })}
        </div>

        <ol className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7 land:mt-1.5 land:grid-cols-7 land:gap-1">
          {Array.from({ length: MISSIONS_PER_SECTOR }, (_, k) => {
            const i = first + k;
            const stage = STAGES[i];
            const locked = !isUnlocked(save, i);
            const medal = save.medals[i] ?? 0;
            const Icon = TYPE_ICONS[stage.type];
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onPlay(i)}
                  data-mission={i}
                  aria-label={`Mission ${sector + 1}-${k + 1}: ${stage.name} (${MISSION_LABEL[stage.type]})${locked ? " — locked" : ""}`}
                  title={locked ? "Clear the mission before it first" : `${stage.name} · ${MISSION_LABEL[stage.type]}${save.best[i] ? ` · best ${formatNumber(save.best[i])}` : ""}`}
                  className={`relative flex h-[68px] w-full flex-col items-center justify-center gap-1 border-2 px-0.5 transition land:h-14 ${
                    i === next && !locked ? "border-[var(--accent)] bg-white/12 shadow-[0_0_14px_var(--accent)]" : "border-transparent bg-white/6 hover:bg-white/12"
                  } ${locked ? "opacity-45" : ""} ${stage.type === "boss" ? "bg-gradient-to-b from-rose-500/25 to-transparent" : ""}`}
                >
                  <span className="flex items-center gap-1">
                    {locked ? <Lock className="size-3.5" /> : <Icon className={`size-3.5 ${stage.type === "boss" ? "text-rose-400" : "text-[var(--accent)]"}`} />}
                    <span className="g-display text-[10px] leading-none tabular-nums">
                      {sector + 1}-{k + 1}
                    </span>
                  </span>
                  <span className="w-full truncate text-center text-[10px] leading-tight font-bold">{stage.name}</span>
                  {!locked && <Medal tier={medal} size="xs" />}
                </button>
              </li>
            );
          })}
        </ol>

        <p className="g-muted mt-2 text-center text-[11px] leading-tight font-semibold land:mt-1.5">
          {cleared
            ? "Campaign complete — go for gold on every mission!"
            : !isUnlocked(save, first)
              ? `Destroy the ${SECTORS[sector - 1]?.bossName ?? "boss"} to open this sector.`
              : `${def.blurb} Clear a mission to open the next.`}
        </p>
      </section>
    </div>
  );
}
