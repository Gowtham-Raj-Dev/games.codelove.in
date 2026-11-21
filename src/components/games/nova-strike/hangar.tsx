"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bomb, Check, Coins, Crosshair, Lock, Shield, Sparkles, Wind, X, Zap, type LucideIcon } from "lucide-react";
import { asset } from "@/lib/asset";
import { formatNumber } from "../shared/ui";
import { findShip, findSkin, findUpgrade, isOwned, shipBars, SHIPS, SKINS, UPGRADE_LEVELS, upgradePrice, UPGRADES, type Save, type ShopKind } from "./content";
import { CreditIcon } from "./hud";

/**
 * The hangar: ships, upgrades and paint jobs, bought with the credits earned on missions. Picking a
 * ship or a paint job shows it on the 3D ship behind the panel (the view is moved clear of it).
 */

export const TABS: { kind: ShopKind; label: string }[] = [
  { kind: "ship", label: "Ships" },
  { kind: "upgrade", label: "Upgrades" },
  { kind: "skin", label: "Paint" },
];

const UPGRADE_ICONS: Record<string, LucideIcon> = { hull: Shield, cannon: Zap, targeting: Crosshair, bay: Bomb, thruster: Wind, salvage: Coins };

const itemsOf = (kind: ShopKind): { id: string; name: string }[] => (kind === "ship" ? SHIPS : kind === "upgrade" ? UPGRADES : SKINS);

/** Where an item stands for this save: what the card and the action button say. */
function stateOf(save: Save, kind: ShopKind, id: string) {
  if (kind === "upgrade") {
    const u = findUpgrade(id);
    const level = save.upgrades[u.id] ?? 0;
    const price = upgradePrice(save, u);
    return { owned: level > 0, equipped: false, price, level, maxed: price === null };
  }
  const item = kind === "ship" ? findShip(id) : findSkin(id);
  const owned = isOwned(save, kind, item);
  return { owned, equipped: (kind === "ship" ? save.ship : save.skin) === item.id, price: owned ? null : item.price, level: 0, maxed: false };
}

export function Hangar({
  save,
  tab,
  selected,
  onTab,
  onSelect,
  onBuy,
  onEquip,
  onClose,
  onLayout,
}: {
  save: Save;
  tab: ShopKind;
  selected: string;
  onTab: (tab: ShopKind) => void;
  onSelect: (id: string) => void;
  onBuy: (kind: ShopKind, id: string) => void;
  onEquip: (kind: "ship" | "skin", id: string) => void;
  onClose: () => void;
  /** How much of the screen the panel covers: the 3D view is moved into the rest. */
  onLayout: (shift: { x: number; y: number }) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const items = itemsOf(tab);
  const item = items.find((i) => i.id === selected) ?? items[0];
  const st = stateOf(save, tab, item.id);
  const short = st.price !== null ? st.price - save.credits : 0;
  const [flash, setFlash] = useState<string | null>(null);

  // Report the panel's footprint: a bottom sheet pushes the ship up, a side panel pushes it left.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (r.width > W * 0.9) onLayout({ x: 0, y: r.height / H / 2 });
      else onLayout({ x: -r.width / W / 2, y: 0 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [onLayout]);

  const act = () => {
    if (st.price !== null) {
      if (short > 0) return;
      onBuy(tab, item.id);
      setFlash(item.id);
    } else if (tab !== "upgrade" && !st.equipped) onEquip(tab, item.id);
  };

  // Keys: ← → pick, ↑ ↓ tabs, Enter buy / equip, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = items.findIndex((x) => x.id === item.id);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        onSelect(items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length].id);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const t = TABS.findIndex((x) => x.kind === tab);
        onTab(TABS[(t + (e.key === "ArrowDown" ? 1 : -1) + TABS.length) % TABS.length].kind);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        act();
      } else if (e.key === "Escape") {
        // (No preventDefault on Esc: the browser needs the key to leave full screen.)
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1400);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end sm:flex-row sm:items-stretch sm:justify-end land:flex-row land:items-stretch land:justify-end">
      <section
        ref={panel}
        role="dialog"
        aria-label="Hangar"
        onPointerDown={(e) => e.stopPropagation()}
        className="g-panel pointer-events-auto flex max-h-[62%] w-full flex-col overflow-hidden p-2.5 pb-[max(env(safe-area-inset-bottom),10px)] sm:m-3 sm:max-h-none sm:w-[min(440px,46vw)] sm:p-4 land:m-2 land:max-h-none land:w-[min(400px,52vw)] land:p-2.5"
      >
        {/* Header: title, credits, close; then the tabs. */}
        <div className="flex items-center gap-2">
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-base leading-none sm:text-xl land:text-sm">Hangar</h2>
          <span className="g-tint inline-flex shrink-0 items-center gap-1.5 px-2 py-1.5 text-xs font-bold tabular-nums land:py-1" data-credits>
            <CreditIcon /> {formatNumber(save.credits)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hangar (Esc)"
            title="Close hangar (Esc)"
            className="g-tint grid size-8 shrink-0 place-items-center hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-7"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex gap-1 land:mt-1.5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={t.kind === tab}
              onClick={() => onTab(t.kind)}
              className={`g-display min-w-0 flex-1 truncate px-1 py-2 text-[9px] transition sm:text-[10px] land:py-1.5 ${t.kind === tab ? "bg-[var(--accent)] text-[#020617]" : "g-tint hover:brightness-125"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Items. */}
        <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1 land:mt-1.5">
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2 land:grid-cols-4">
            {items.map((it) => {
              const s = stateOf(save, tab, it.id);
              const picked = it.id === item.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(it.id)}
                    aria-pressed={picked}
                    data-item={`${tab}:${it.id}`}
                    className={`relative flex w-full flex-col items-center gap-1 overflow-hidden border-2 p-1 pb-1.5 text-center transition ${picked ? "border-[var(--accent)] bg-white/12" : "border-transparent bg-white/6 hover:bg-white/10"}`}
                  >
                    <Thumb kind={tab} id={it.id} level={s.level} />
                    <span className="w-full truncate text-[11px] leading-tight font-bold">{it.name}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums">
                      {s.equipped ? (
                        <span className="text-[var(--accent)]">Equipped</span>
                      ) : s.maxed ? (
                        <span className="text-emerald-300">Maxed</span>
                      ) : s.price === null ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-300">
                          <Check className="size-3" /> Owned
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 ${s.price > save.credits ? "opacity-60" : ""}`}>
                          <CreditIcon className="size-3" /> {formatNumber(s.price)}
                        </span>
                      )}
                    </span>
                    {tab !== "upgrade" && !s.owned && <Lock className="absolute top-1 right-1 size-3 opacity-70" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The picked item and what you can do with it. */}
        <div className="mt-2 border-t border-white/15 pt-2 land:mt-1.5 land:pt-1.5">
          <Detail kind={tab} id={item.id} level={st.level} />
          <div className="mt-2 flex items-center gap-2 land:mt-1.5">
            <p className="g-display min-w-0 flex-1 truncate text-[11px] leading-tight sm:text-xs">{item.name}</p>
            {flash === item.id ? (
              <span className="g-display inline-flex animate-[game-fade_0.2s_ease] items-center gap-1 bg-emerald-400 px-3 py-2 text-[10px] text-emerald-950">
                <Sparkles className="size-4" /> {tab === "upgrade" ? "Upgraded!" : "Unlocked!"}
              </span>
            ) : (
              <ActionButton onClick={act} disabled={st.price !== null ? short > 0 : tab === "upgrade" || st.equipped}>
                {st.price !== null ? (
                  short > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="size-3.5" /> {formatNumber(short)} more
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {tab === "upgrade" ? "Upgrade" : "Buy"} <CreditIcon /> {formatNumber(st.price)}
                    </span>
                  )
                ) : tab === "upgrade" ? (
                  "Maxed"
                ) : st.equipped ? (
                  <>
                    <Check className="size-4" /> Equipped
                  </>
                ) : (
                  "Equip"
                )}
              </ActionButton>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ActionButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      data-action
      onClick={onClick}
      disabled={disabled}
      className="g-btn shrink-0 px-3.5 py-2 text-xs focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-55 land:py-1.5"
    >
      <span className="g-unskew gap-1.5 whitespace-nowrap">{children}</span>
    </button>
  );
}

/** What the picked item does: a ship's numbers as bars, an upgrade's levels, a paint job's note. */
function Detail({ kind, id, level }: { kind: ShopKind; id: string; level: number }) {
  if (kind === "ship") {
    const ship = findShip(id);
    const bars = shipBars(ship);
    return (
      <div>
        <p className="g-muted text-[11px] leading-snug">{ship.blurb}</p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
          <StatBar label="Shield" value={bars.shield} />
          <StatBar label="Speed" value={bars.speed} />
          <StatBar label="Power" value={bars.power} />
          <StatBar label={`Locks ${ship.locks} · Bombs ${ship.bombs}`} value={bars.locks} />
        </div>
      </div>
    );
  }
  if (kind === "upgrade") {
    const u = findUpgrade(id);
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="g-muted min-w-0 text-[11px] leading-snug">{u.perk}. Works on every ship.</p>
        <Pips level={level} />
      </div>
    );
  }
  return <p className="g-muted text-[11px] leading-snug">A paint job and engine colour for every ship.</p>;
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="g-muted truncate text-[9px] tracking-[0.12em] uppercase">{label}</p>
      <div className="mt-0.5 h-1.5 bg-white/12">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round(Math.min(1, Math.max(0.06, value)) * 100)}%` }} />
      </div>
    </div>
  );
}

function Pips({ level }: { level: number }) {
  return (
    <span className="inline-flex shrink-0 gap-1" aria-label={`Level ${level} of ${UPGRADE_LEVELS}`}>
      {Array.from({ length: UPGRADE_LEVELS }, (_, i) => (
        <span key={i} className={`h-2.5 w-4 ${i < level ? "bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]" : "bg-white/15"}`} />
      ))}
    </span>
  );
}

const thumbBox = "relative grid h-14 w-full place-items-center overflow-hidden sm:h-16 land:h-12";

/** The picture on a hangar card. */
function Thumb({ kind, id, level }: { kind: ShopKind; id: string; level: number }) {
  if (kind === "ship") {
    return (
      <span className={`${thumbBox} bg-gradient-to-b from-cyan-400/25 to-fuchsia-400/10`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset(`/library/${findShip(id).key}.webp`)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />
      </span>
    );
  }
  if (kind === "upgrade") {
    const Icon = UPGRADE_ICONS[id] ?? Sparkles;
    return (
      <span className={`${thumbBox} bg-white/6`}>
        <Icon className="size-6 text-[var(--accent)]" aria-hidden />
        <span className="absolute bottom-1">
          <span className="inline-flex gap-0.5">
            {Array.from({ length: UPGRADE_LEVELS }, (_, i) => (
              <span key={i} className={`h-1 w-2.5 ${i < level ? "bg-[var(--accent)]" : "bg-white/20"}`} />
            ))}
          </span>
        </span>
      </span>
    );
  }
  const skin = findSkin(id);
  const hull = skin.hull ?? "#d7dee8";
  const accent = skin.accent ?? "#ffa033";
  return (
    <span className={thumbBox} style={{ background: `linear-gradient(135deg, ${hull} 0 46%, ${skin.trim ?? "#aab5c5"} 46% 62%, ${accent} 62% 100%)` }}>
      <span className="absolute right-1 bottom-1 size-3 rounded-full" style={{ background: skin.trail, boxShadow: `0 0 8px 2px ${skin.trail}` }} />
    </span>
  );
}
