"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Axe, Backpack, Check, Drumstick, Fish, Flame, Hammer, Heart, Lock, Package, Shell, Snowflake, Sparkles, Sword, Tent, X, type LucideIcon } from "lucide-react";
import { asset } from "@/lib/asset";
import { formatNumber } from "../shared/ui";
import { CASTAWAYS, KITS, ownedKey, PERKS, type ProgressSave, type ShopTab } from "./campaign";

/**
 * The outfitter between islands: castaways (each with a knack), perks that last for good (bought a
 * level at a time) and starting kits (one is carried ashore). Paid for with the shells earned on the
 * islands. Picking a castaway shows them by the campfire behind the panel.
 */

export const TABS: { tab: ShopTab; label: string }[] = [
  { tab: "castaway", label: "Castaways" },
  { tab: "perk", label: "Perks" },
  { tab: "kit", label: "Kits" },
];

const PERK_ICONS: Record<string, LucideIcon> = { vigor: Heart, belly: Drumstick, coat: Snowflake, arm: Sword, comber: Package, pack: Backpack };
const KIT_ICONS: Record<string, LucideIcon> = { none: Shell, woodcutter: Axe, fisher: Fish, camper: Flame, builder: Hammer, veteran: Tent };

export function ShellIcon({ className = "size-3.5" }: { className?: string }) {
  return <Shell className={`shrink-0 text-[#c2410c] ${className}`} aria-hidden />;
}

interface Card {
  id: string;
  name: string;
  detail: string;
  /** Price of the thing (or of its next level); null = nothing left to buy. */
  price: number | null;
  owned: boolean;
  equipped: boolean;
  /** Perks: levels bought / levels there are. */
  level?: [number, number];
}

/** The shop's cards for a tab, from the save. */
export function cardsFor(tab: ShopTab, save: ProgressSave): Card[] {
  if (tab === "castaway") {
    return CASTAWAYS.map((c) => {
      const owned = c.price === 0 || save.owned.includes(ownedKey("castaway", c.id));
      return { id: c.id, name: c.name, detail: c.perk, price: owned ? null : c.price, owned, equipped: save.castaway === c.id };
    });
  }
  if (tab === "kit") {
    return KITS.map((k) => {
      const owned = k.price === 0 || save.owned.includes(ownedKey("kit", k.id));
      return { id: k.id, name: k.name, detail: k.desc, price: owned ? null : k.price, owned, equipped: save.kit === k.id };
    });
  }
  return PERKS.map((p) => {
    const level = Math.min(p.prices.length, save.perks[p.id] ?? 0);
    return { id: p.id, name: p.name, detail: p.desc, price: level < p.prices.length ? p.prices[level] : null, owned: level > 0, equipped: false, level: [level, p.prices.length] };
  });
}

export function Shop({
  save,
  tab,
  selected,
  busy,
  onTab,
  onSelect,
  onBuy,
  onEquip,
  onClose,
  onLayout,
}: {
  save: ProgressSave;
  tab: ShopTab;
  selected: string;
  /** A castaway's model is on its way (0..1). */
  busy: number | null;
  onTab: (tab: ShopTab) => void;
  onSelect: (id: string) => void;
  onBuy: (tab: ShopTab, id: string) => void;
  onEquip: (tab: ShopTab, id: string) => void;
  onClose: () => void;
  /** How much of the screen the panel covers: the 3D view is moved into the rest. */
  onLayout: (shift: { x: number; y: number }) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const cards = cardsFor(tab, save);
  const card = cards.find((c) => c.id === selected) ?? cards[0];
  const short = card.price === null ? 0 : card.price - save.shells;
  const [flash, setFlash] = useState<string | null>(null);

  // Report the panel's footprint: a bottom sheet pushes the castaway up, a side panel pushes them left.
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

  const canBuy = card.price !== null && short <= 0;
  const act = () => {
    if (card.price !== null) {
      if (!canBuy) return;
      onBuy(tab, card.id);
      setFlash(card.id);
    } else if (tab !== "perk" && !card.equipped) onEquip(tab, card.id);
  };

  // Keys: ← → pick, ↑ ↓ tabs, Enter buy / equip, Esc or S close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const i = cards.findIndex((x) => x.id === card.id);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        onSelect(cards[(i + (e.key === "ArrowRight" ? 1 : -1) + cards.length) % cards.length].id);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const t = TABS.findIndex((x) => x.tab === tab);
        onTab(TABS[(t + (e.key === "ArrowDown" ? 1 : -1) + TABS.length) % TABS.length].tab);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        act();
      } else if (e.key === "Escape" || e.key === "s" || e.key === "S") {
        // (No preventDefault on Esc: the browser needs the key to leave full screen.)
        if (e.key !== "Escape") e.preventDefault();
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
        aria-label="Shop"
        onPointerDown={(e) => e.stopPropagation()}
        className="g-panel pointer-events-auto flex max-h-[58%] w-full flex-col overflow-hidden rounded-b-none p-2.5 pb-[max(env(safe-area-inset-bottom),10px)] sm:m-3 sm:max-h-none sm:w-[min(430px,46vw)] sm:rounded-b-[var(--g-panel-radius)] sm:p-4 land:m-2 land:max-h-none land:w-[min(400px,50vw)] land:p-2.5 land:pb-2.5"
      >
        <div className="flex items-center gap-1.5">
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-2xl leading-none sm:text-3xl land:text-xl">Outfitter</h2>
          <span data-cw-shells className="g-tint g-display inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-base tabular-nums land:py-0.5">
            <ShellIcon className="size-4" /> {formatNumber(save.shells)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shop (Esc)"
            title="Close shop (Esc)"
            className="g-tint grid size-8 shrink-0 place-items-center rounded-lg hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-7"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex gap-1 land:mt-1.5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              role="tab"
              aria-selected={t.tab === tab}
              onClick={() => onTab(t.tab)}
              className={`g-display min-w-0 flex-1 truncate rounded-lg px-1 py-1 text-base transition land:py-0.5 land:text-sm ${t.tab === tab ? "bg-[var(--accent)] text-[#fff7ed]" : "g-tint hover:brightness-110"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1 land:mt-1.5">
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {cards.map((c) => {
              const picked = c.id === card.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-pressed={picked}
                    data-cw-item={c.id}
                    className={`relative flex w-full flex-col items-center gap-0.5 overflow-hidden rounded-xl border-2 p-1 pb-1.5 text-center transition ${
                      picked ? "border-[var(--accent)] bg-[#fff7ed]/80" : "border-transparent bg-[#2b2118]/8 hover:bg-[#2b2118]/14"
                    }`}
                  >
                    <Thumb tab={tab} id={c.id} />
                    <span className="g-display w-full truncate text-[15px] leading-tight">{c.name}</span>
                    <span className="inline-flex items-center gap-1 text-[13px] leading-none tabular-nums">
                      {c.level ? (
                        <Pips level={c.level} />
                      ) : c.equipped ? (
                        <span className="text-[var(--accent)]">{tab === "kit" ? "Packed" : "Playing"}</span>
                      ) : c.owned ? (
                        <span className="inline-flex items-center gap-0.5 text-[#15803d]">
                          <Check className="size-3" /> Owned
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-0.5 ${c.price !== null && c.price > save.shells ? "opacity-60" : ""}`}>
                          <ShellIcon className="size-3" /> {formatNumber(c.price ?? 0)}
                        </span>
                      )}
                    </span>
                    {!c.owned && !c.level && <Lock className="absolute top-1 right-1 size-3 opacity-60" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-2 flex items-center gap-2 border-t border-dashed border-[#8b5e34]/60 pt-2 land:mt-1.5 land:pt-1.5">
          <div className="min-w-0 flex-1">
            <p className="g-display truncate text-lg leading-tight">
              {card.name}
              {card.level && card.level[0] > 0 ? ` · level ${card.level[0]}` : ""}
            </p>
            <p className="g-muted text-sm leading-tight">{busy !== null ? `Rowing ashore… ${Math.round(busy * 100)}%` : card.detail}</p>
          </div>
          {flash === card.id ? (
            <span className="g-display inline-flex animate-[game-fade_0.2s_ease] items-center gap-1 rounded-xl bg-[#15803d] px-3 py-2 text-sm text-white">
              <Sparkles className="size-4" /> {tab === "perk" ? "Learned!" : "Yours!"}
            </span>
          ) : (
            <ActionButton onClick={act} disabled={card.price !== null ? !canBuy : tab === "perk" || card.equipped}>
              {card.price !== null ? (
                short > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="size-3.5" /> {formatNumber(short)} more
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    {card.level && card.level[0] > 0 ? "Upgrade" : "Buy"} <ShellIcon className="size-4 text-current" /> {formatNumber(card.price)}
                  </span>
                )
              ) : tab === "perk" ? (
                <>
                  <Check className="size-4" /> Maxed
                </>
              ) : card.equipped ? (
                <>
                  <Check className="size-4" /> {tab === "kit" ? "Packed" : "Playing"}
                </>
              ) : tab === "kit" ? (
                "Pack"
              ) : (
                "Play"
              )}
            </ActionButton>
          )}
        </div>
      </section>
    </div>
  );
}

function ActionButton({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      data-cw-act
      onClick={onClick}
      disabled={disabled}
      className="g-btn shrink-0 px-3.5 py-2 text-base focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-55 land:py-1.5"
    >
      <span className="g-unskew gap-1.5 whitespace-nowrap">{children}</span>
    </button>
  );
}

function Pips({ level: [have, of] }: { level: [number, number] }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Level ${have} of ${of}`}>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={`h-1.5 w-3.5 rounded-sm ${i < have ? "bg-[var(--accent)]" : "bg-[#2b2118]/20"}`} />
      ))}
    </span>
  );
}

const thumbBox = "relative grid h-14 w-full place-items-center overflow-hidden rounded-lg sm:h-16 land:h-11";

/** The picture on a shop card: the castaway's portrait, or an emblem for a perk or kit. */
function Thumb({ tab, id }: { tab: ShopTab; id: string }) {
  if (tab === "castaway") {
    const model = CASTAWAYS.find((c) => c.id === id)?.model ?? CASTAWAYS[0].model;
    return (
      <span className={`${thumbBox} bg-gradient-to-b from-[#7dd3fc]/45 to-[#fde68a]/40`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset(`/library/${model}.webp`)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />
      </span>
    );
  }
  const Icon = (tab === "perk" ? PERK_ICONS[id] : KIT_ICONS[id]) ?? Package;
  return (
    <span className={`${thumbBox} ${tab === "perk" ? "bg-gradient-to-b from-[#fdba74]/50 to-[#fff7ed]/30" : "bg-gradient-to-b from-[#a7f3d0]/45 to-[#fff7ed]/30"}`}>
      <Icon className="size-7 text-[#2b2118]" aria-hidden />
    </span>
  );
}
