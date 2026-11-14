"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Banknote, Check, Coins, Footprints, Hand, Handshake, Lock, Sparkles, X } from "lucide-react";
import { asset } from "@/lib/asset";
import { findItem, GADGETS, isOwned, OUTFITS, THIEVES, UPGRADES, type Save, type ShopKind, type UpgradeDef } from "./content";
import { fmtMoney, GadgetIcon } from "./screens";

/**
 * The shop: the crew, their outfits, one gadget to carry and upgrades — bought with the cash banked
 * after every heist. Picking a thief or an outfit shows it on the 3D thief beside the panel.
 */

export const TABS: { kind: ShopKind; label: string }[] = [
  { kind: "thief", label: "Crew" },
  { kind: "outfit", label: "Outfits" },
  { kind: "gadget", label: "Gadgets" },
  { kind: "upgrade", label: "Upgrades" },
];

interface Card {
  id: string;
  name: string;
  detail: string;
  /** Price of the next thing to buy (null: nothing left to buy). */
  price: number | null;
  owned: boolean;
  equipped: boolean;
  /** Upgrades: levels bought / levels there are. */
  level?: [number, number];
}

const UPGRADE_ICONS: Record<string, ReactNode> = {
  pouch: <Coins className="size-6" />,
  soles: <Footprints className="size-6" />,
  hands: <Hand className="size-6" />,
  belt: <Sparkles className="size-6" />,
  fence: <Handshake className="size-6" />,
};

function upgradeCard(u: UpgradeDef, save: Save): Card {
  const level = save.upgrades[u.id] ?? 0;
  const max = u.prices.length;
  return {
    id: u.id,
    name: u.name,
    detail: level >= max ? `${u.levels[max - 1]} (fully upgraded)` : level ? `Now: ${u.levels[level - 1]} · next: ${u.levels[level]}` : u.levels[0],
    price: level >= max ? null : u.prices[level],
    owned: level >= max,
    equipped: level >= max,
    level: [level, max],
  };
}

export function cardsFor(tab: ShopKind, save: Save): Card[] {
  if (tab === "upgrade") return UPGRADES.map((u) => upgradeCard(u, save));
  const list = tab === "thief" ? THIEVES : tab === "outfit" ? OUTFITS : GADGETS;
  const equipped = tab === "thief" ? save.thief : tab === "outfit" ? save.outfit : save.gadget;
  return list.map((it) => {
    const owned = isOwned(save, tab, it);
    return { id: it.id, name: it.name, detail: it.perk, price: owned ? null : it.price, owned, equipped: equipped === it.id };
  });
}

export function Shop({
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
  /** Equip (or, for the gadget in hand, put it away). */
  onEquip: (kind: ShopKind, id: string) => void;
  onClose: () => void;
  /** How much of the screen the panel covers: the 3D view is moved into the rest. */
  onLayout: (shift: { x: number; y: number }) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const cards = cardsFor(tab, save);
  const card = cards.find((c) => c.id === selected) ?? cards[0];
  const short = card.price === null ? 0 : card.price - save.bank;
  const [flash, setFlash] = useState<string | null>(null);

  // Report the panel's footprint: a bottom sheet pushes the thief up, a side panel pushes him left.
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
    if (card.price !== null) {
      if (short > 0) return;
      onBuy(tab, card.id);
      setFlash(card.id);
    } else if (tab !== "upgrade" && (!card.equipped || tab === "gadget")) onEquip(tab, card.id);
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
        const t = TABS.findIndex((x) => x.kind === tab);
        onTab(TABS[(t + (e.key === "ArrowDown" ? 1 : -1) + TABS.length) % TABS.length].kind);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        act();
      } else if (e.key === "Escape" || e.key === "s" || e.key === "S") {
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

  const label =
    card.price !== null ? (
      short > 0 ? (
        <span className="inline-flex items-center gap-1">
          <Lock className="size-3.5" /> {fmtMoney(short)} more
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {tab === "upgrade" && card.level && card.level[0] > 0 ? "Upgrade" : "Buy"} {fmtMoney(card.price)}
        </span>
      )
    ) : tab === "upgrade" ? (
      <>
        <Check className="size-4" /> Maxed
      </>
    ) : card.equipped ? (
      tab === "gadget" ? (
        "Put away"
      ) : (
        <>
          <Check className="size-4" /> Equipped
        </>
      )
    ) : (
      "Equip"
    );
  const disabled = card.price !== null ? short > 0 : tab === "upgrade" || (card.equipped && tab !== "gadget");

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end sm:flex-row sm:items-stretch sm:justify-end land:flex-row land:items-stretch land:justify-end">
      <section
        ref={panel}
        role="dialog"
        aria-label="Shop"
        onPointerDown={(e) => e.stopPropagation()}
        className="g-panel pointer-events-auto flex max-h-[58%] w-full flex-col overflow-hidden rounded-b-none p-2.5 pb-[max(env(safe-area-inset-bottom),10px)] sm:m-3 sm:max-h-none sm:w-[min(440px,46vw)] sm:rounded-b-[var(--g-panel-radius)] sm:p-4 land:m-2 land:max-h-none land:w-[min(400px,52vw)] land:p-2.5 land:pb-2.5"
      >
        <div className="flex items-center gap-1.5">
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-xl leading-none sm:text-2xl land:text-lg">Shop</h2>
          <span className="g-tint inline-flex shrink-0 items-center gap-1 rounded-[3px] px-2 py-1.5 text-xs font-bold tabular-nums land:py-1" data-nh-bank>
            <Banknote className="size-3.5" /> {fmtMoney(save.bank)}
          </span>
          <button type="button" onClick={onClose} aria-label="Close shop (Esc)" title="Close shop (Esc)" className="g-tint grid size-8 shrink-0 place-items-center rounded-[3px] hover:brightness-90 focus-visible:outline-2 focus-visible:outline-[#1c1917] land:size-7">
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
              className={`g-display min-w-0 flex-1 truncate rounded-[3px] px-1 py-1.5 text-[11px] transition sm:text-xs land:py-1 ${t.kind === tab ? "bg-[#1c1917] text-[#f5f0e1]" : "g-tint hover:brightness-90"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1 land:mt-1.5">
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2 land:grid-cols-4">
            {cards.map((c) => {
              const picked = c.id === card.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-pressed={picked}
                    className={`relative flex w-full flex-col items-center gap-1 overflow-hidden rounded-[4px] border-2 p-1 pb-1.5 text-center transition ${picked ? "border-[#b91c1c] bg-black/10" : "border-transparent bg-black/5 hover:bg-black/10"}`}
                  >
                    <Thumb kind={tab} id={c.id} />
                    <span className="w-full truncate text-[11px] leading-tight font-bold">{c.name}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums">
                      {c.level ? (
                        <span className="inline-flex gap-0.5" aria-label={`Level ${c.level[0]} of ${c.level[1]}`}>
                          {Array.from({ length: c.level[1] }, (_, n) => (
                            <span key={n} className={`h-1.5 w-3 ${n < c.level![0] ? "bg-[#b91c1c]" : "bg-black/20"}`} />
                          ))}
                        </span>
                      ) : c.equipped ? (
                        <span className="text-[#b91c1c]">Equipped</span>
                      ) : c.owned ? (
                        <span className="inline-flex items-center gap-0.5 text-[#15803d]">
                          <Check className="size-3" /> Owned
                        </span>
                      ) : (
                        <span className={c.price! > save.bank ? "opacity-60" : ""}>{fmtMoney(c.price!)}</span>
                      )}
                    </span>
                    {!c.owned && !c.level && <Lock className="absolute top-1 right-1 size-3 opacity-60" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-2 flex items-center gap-2 border-t border-black/20 pt-2 land:mt-1.5 land:pt-1.5">
          <div className="min-w-0 flex-1">
            <p className="g-display truncate text-sm leading-tight sm:text-base">{card.name}</p>
            <p className="g-muted text-[11px] leading-tight">{card.detail}</p>
          </div>
          {flash === card.id && card.price === null ? (
            <span className="g-display inline-flex animate-[game-fade_0.2s_ease] items-center gap-1 rounded-[3px] bg-[#15803d] px-3 py-2 text-xs text-white">
              <Sparkles className="size-4" /> Yours!
            </span>
          ) : (
            <button type="button" onClick={act} disabled={disabled} data-nh-shop-action className="g-btn shrink-0 px-3.5 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-55 land:py-1.5">
              <span className="g-unskew gap-1.5 whitespace-nowrap">{label}</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

const thumbBox = "relative grid h-14 w-full place-items-center overflow-hidden rounded-[3px] sm:h-16 land:h-12";

/** The picture on a shop card. */
function Thumb({ kind, id }: { kind: ShopKind; id: string }) {
  if (kind === "thief") {
    return (
      <span className={`${thumbBox} bg-gradient-to-b from-[#1e293b] to-[#0b0f19]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset(`/library/${findItem(THIEVES, id).key}.webp`)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />
      </span>
    );
  }
  if (kind === "outfit") {
    const outfit = findItem(OUTFITS, id);
    return (
      <span className={`${thumbBox} bg-[#0b0f19]`}>
        <span className="size-9 rounded-full ring-2 ring-white/40" style={{ background: outfit.swatch, boxShadow: outfit.glow ? `0 0 14px ${outfit.glow}` : undefined }} />
      </span>
    );
  }
  return (
    <span className={`${thumbBox} bg-gradient-to-b from-[#1e293b] to-[#0b0f19] text-[#f5f0e1]`}>{kind === "gadget" ? <GadgetIcon id={id} className="size-6" /> : (UPGRADE_ICONS[id] ?? <Sparkles className="size-6" />)}</span>
  );
}
