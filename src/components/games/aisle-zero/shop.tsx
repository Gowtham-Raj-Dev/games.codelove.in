"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BatteryFull, Check, Coins, Flashlight, Footprints, Lock, ShoppingCart, Sparkles, Wind, X } from "lucide-react";
import { formatNumber } from "../shared/ui";
import { CARTS, GEAR, type CartDef, type GearDef, type GearId, type Save } from "./content";

/**
 * The staff shop: gear that makes a night a little easier (never safe) and paint for the cart, bought with
 * the wages saved after every night. Picking a cart shows it on the cart in front of the camera.
 */

type Tab = "gear" | "cart";

const TABS: { id: Tab; label: string }[] = [
  { id: "gear", label: "Gear" },
  { id: "cart", label: "Carts" },
];

function CanGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <rect x="4" y="2" width="8" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 5.5h8M4 10.5h8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

const GEAR_ICONS: Record<GearId, ReactNode> = {
  battery: <BatteryFull className="size-5" />,
  lens: <Flashlight className="size-5" />,
  soles: <Footprints className="size-5" />,
  pouch: <CanGlyph className="size-5" />,
  lungs: <Wind className="size-5" />,
  wheels: <ShoppingCart className="size-5" />,
};

export const cartOwned = (save: Save, cart: CartDef) => cart.price === 0 || save.carts.includes(cart.id);

export function Shop({
  save,
  compact,
  onBuyGear,
  onBuyCart,
  onEquipCart,
  onPreview,
  onClose,
}: {
  save: Save;
  compact: boolean;
  onBuyGear: (gear: GearDef) => void;
  onBuyCart: (cart: CartDef) => void;
  onEquipCart: (cart: CartDef) => void;
  /** Shows a cart's paint on the 3D cart (null: back to the one equipped). */
  onPreview: (cart: string | null) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("gear");
  const [picked, setPicked] = useState(save.cart);
  const [flash, setFlash] = useState<string | null>(null);
  const cart = CARTS.find((c) => c.id === picked) ?? CARTS[0];
  const owned = cartOwned(save, cart);
  const equipped = save.cart === cart.id;

  const pickCart = (id: string) => {
    setPicked(id);
    onPreview(id);
  };
  const pickTab = (next: Tab) => {
    setTab(next);
    // leaving the carts puts the equipped one back on
    if (next === "gear") {
      setPicked(save.cart);
      onPreview(null);
    }
  };
  const buyGear = (g: GearDef) => {
    const level = save.gear[g.id];
    if (level >= g.prices.length || save.bank < g.prices[level]) return;
    onBuyGear(g);
    setFlash(g.id);
  };
  const actCart = () => {
    if (owned) {
      if (!equipped) onEquipCart(cart);
    } else if (save.bank >= cart.price) {
      onBuyCart(cart);
      setFlash(cart.id);
    }
  };

  // Keys: Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-stretch justify-end">
      <section
        role="dialog"
        aria-label="Staff shop"
        onPointerDown={(e) => e.stopPropagation()}
        className={`g-panel pointer-events-auto flex flex-col overflow-hidden ${compact ? "m-1.5 w-[min(430px,58%)] p-2.5" : "m-3 w-[min(460px,94vw)] p-4"}`}
      >
        <div className="flex items-center gap-1.5">
          <h2 className={`g-panel-title min-w-0 flex-1 truncate leading-none ${compact ? "text-lg" : "text-2xl"}`}>Staff shop</h2>
          <span className="g-tint inline-flex shrink-0 items-center gap-1 rounded-[3px] px-2 py-1.5 text-xs font-bold tabular-nums" data-az-bank>
            <Coins className="size-3.5 text-[#e8b83a]" /> {formatNumber(save.bank)}
          </span>
          <button type="button" onClick={onClose} aria-label="Close shop (Esc)" title="Close shop (Esc)" className="g-tint grid size-8 shrink-0 place-items-center rounded-[3px] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex gap-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => pickTab(t.id)}
              className={`g-display min-w-0 flex-1 truncate rounded-[3px] px-1 text-xs transition ${compact ? "py-1" : "py-1.5"} ${t.id === tab ? "bg-[var(--accent)] text-black" : "g-tint hover:brightness-125"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "gear" ? (
          <ul className="-mx-1 mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-1 pb-1">
            {GEAR.map((g) => {
              const level = save.gear[g.id];
              const max = level >= g.prices.length;
              const price = max ? 0 : g.prices[level];
              const short = price - save.bank;
              return (
                <li key={g.id} className={`g-tint flex items-center gap-2.5 rounded-[3px] ${compact ? "p-1.5" : "p-2.5"}`}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-[3px] bg-black/40 text-[#e6dfc9]">{GEAR_ICONS[g.id]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <b className="truncate text-sm">{g.name}</b>
                      <span className="flex shrink-0 gap-0.5" aria-label={`Level ${level} of ${g.prices.length}`}>
                        {g.prices.map((_, i) => (
                          <span key={i} className={`h-1.5 w-3.5 ${i < level ? "bg-[var(--accent)]" : "bg-white/15"}`} />
                        ))}
                      </span>
                    </span>
                    <span className="g-muted block truncate text-[11px] leading-tight">
                      {g.levels[level]}
                      {!max && <> → {g.levels[level + 1]}</>}
                    </span>
                    {!compact && <span className="g-muted block truncate text-[11px] leading-tight opacity-80">{g.blurb}</span>}
                  </span>
                  {flash === g.id ? (
                    <span className="g-display inline-flex shrink-0 animate-[game-fade_0.2s_ease] items-center gap-1 rounded-[3px] bg-[#6f9a5c] px-2.5 py-1.5 text-xs text-black">
                      <Sparkles className="size-3.5" /> Fitted
                    </span>
                  ) : (
                    <Action onClick={() => buyGear(g)} disabled={max || short > 0} name={`gear-${g.id}`}>
                      {max ? (
                        <>
                          <Check className="size-3.5" /> Max
                        </>
                      ) : short > 0 ? (
                        <>
                          <Lock className="size-3.5" /> {formatNumber(price)}
                        </>
                      ) : (
                        <>
                          <Coins className="size-3.5" /> {formatNumber(price)}
                        </>
                      )}
                    </Action>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <ul className={`-mx-1 mt-2 grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto overscroll-contain px-1 pb-1 ${compact ? "grid-cols-4" : "grid-cols-3"}`}>
              {CARTS.map((c) => {
                const have = cartOwned(save, c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pickCart(c.id)}
                      aria-pressed={c.id === cart.id}
                      data-az-cart={c.id}
                      className={`relative flex w-full flex-col items-center gap-1 overflow-hidden rounded-[3px] border-2 p-1 pb-1.5 text-center transition ${c.id === cart.id ? "border-[var(--accent)] bg-white/12" : "border-transparent bg-white/6 hover:bg-white/10"}`}
                    >
                      <span className={`grid w-full place-items-center rounded-[2px] ${compact ? "h-9" : "h-14"}`} style={{ background: c.swatch }}>
                        <ShoppingCart className={`${compact ? "size-5" : "size-7"} text-black/55 drop-shadow-[0_1px_0_rgb(255_255_255/.35)]`} />
                      </span>
                      <span className="w-full truncate text-[11px] leading-tight font-bold">{c.name}</span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums">
                        {save.cart === c.id ? (
                          <span className="text-[var(--accent)]">Equipped</span>
                        ) : have ? (
                          <span className="inline-flex items-center gap-0.5 text-[#8cc08a]">
                            <Check className="size-3" /> Owned
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 ${c.price > save.bank ? "opacity-60" : ""}`}>
                            <Coins className="size-3 text-[#e8b83a]" /> {formatNumber(c.price)}
                          </span>
                        )}
                      </span>
                      {!have && <Lock className="absolute top-1 right-1 size-3 opacity-70" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex items-center gap-2 border-t border-white/15 pt-2">
              <div className="min-w-0 flex-1">
                <p className="g-display truncate text-sm leading-tight">{cart.name}</p>
                <p className="g-muted truncate text-[11px] leading-tight">Paint only: it changes nothing but the look</p>
              </div>
              {flash === cart.id ? (
                <span className="g-display inline-flex animate-[game-fade_0.2s_ease] items-center gap-1 rounded-[3px] bg-[#6f9a5c] px-3 py-2 text-xs text-black">
                  <Sparkles className="size-4" /> Yours
                </span>
              ) : (
                <Action onClick={actCart} disabled={(owned && equipped) || (!owned && save.bank < cart.price)} name="cart-action" big>
                  {owned ? (
                    equipped ? (
                      <>
                        <Check className="size-4" /> Equipped
                      </>
                    ) : (
                      "Equip"
                    )
                  ) : save.bank < cart.price ? (
                    <>
                      <Lock className="size-3.5" /> {formatNumber(cart.price - save.bank)} more
                    </>
                  ) : (
                    <>
                      Buy <Coins className="size-3.5" /> {formatNumber(cart.price)}
                    </>
                  )}
                </Action>
              )}
            </div>
          </>
        )}
        <p className="g-muted mt-2 text-center text-[10.5px] leading-tight">Wages: a base for every escape, 20 a star and 5 a coin. Gear makes nights easier, never safe.</p>
      </section>
    </div>
  );
}

function Action({ onClick, disabled, name, big = false, children }: { onClick: () => void; disabled: boolean; name: string; big?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-az-buy={name}
      className={`g-btn shrink-0 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-55 ${big ? "px-3.5 py-2" : "px-2.5 py-1.5"}`}
    >
      <span className="g-unskew gap-1.5 whitespace-nowrap tabular-nums">{children}</span>
    </button>
  );
}
