"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Lock, Sparkles, X } from "lucide-react";
import { asset } from "@/lib/asset";
import { formatNumber } from "../shared/ui";
import { DECK_H, DECK_W, paintDeck } from "./board-art";
import { BOARDS, findItem, ITEMS, SKATERS, SKINS, STAGES, type BoardDef, type ShopItem, type ShopKind } from "./content";

/**
 * The shop: skaters, skins, boards and stages, bought with the coins collected on runs. Picking an
 * item previews it on the 3D skater behind the panel (the panel slides the 3D view aside).
 */

export interface Owned {
  bank: number;
  owned: string[];
  skater: string;
  skin: string;
  board: string;
  stage: string;
}

export const TABS: { kind: ShopKind; label: string }[] = [
  { kind: "skater", label: "Skaters" },
  { kind: "skin", label: "Skins" },
  { kind: "board", label: "Boards" },
  { kind: "stage", label: "Stages" },
];

export const ownedKey = (kind: ShopKind, id: string) => `${kind}:${id}`;
export const isOwned = (save: Owned, kind: ShopKind, item: ShopItem) => item.price === 0 || save.owned.includes(ownedKey(kind, item.id));

export function CoinIcon({ large = false, className = "" }: { large?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 ring-2 ring-amber-600/70 ${large ? "size-7" : "size-3.5"} ${className}`}
    />
  );
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
  save: Owned;
  tab: ShopKind;
  selected: string;
  busy: { label: string; ratio: number } | null;
  onTab: (tab: ShopKind) => void;
  onSelect: (id: string) => void;
  onBuy: (kind: ShopKind, item: ShopItem) => void;
  onEquip: (kind: ShopKind, id: string) => void;
  onClose: () => void;
  /** How much of the screen the panel covers: the 3D view is moved into the rest. */
  onLayout: (shift: { x: number; y: number }) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const items = ITEMS[tab];
  const item = items.find((i) => i.id === selected) ?? items[0];
  const owned = isOwned(save, tab, item);
  const equipped = save[tab] === item.id;
  const short = item.price - save.bank;
  const [flash, setFlash] = useState<string | null>(null);

  // Report the panel's footprint: a bottom sheet pushes the skater up, a side panel pushes it left.
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
    if (owned) {
      if (!equipped) onEquip(tab, item.id);
      return;
    }
    if (short > 0) return;
    onBuy(tab, item);
    setFlash(item.id);
  };

  // Keys: ← → pick, Enter buy / equip, Esc close.
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
      } else if (e.key === "Escape" || e.key === "b" || e.key === "B") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const stage = tab === "stage" ? findItem(STAGES, item.id) : null;
  const detail =
    tab === "skin" ? "Works on every skater" : tab === "board" ? boardDetail(findItem(BOARDS, item.id)) : stage ? stage.perks.join(" · ") : item.price ? "New skater" : "Starter skater";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-end sm:flex-row sm:items-stretch sm:justify-end land:flex-row land:items-stretch land:justify-end">
      <section
        ref={panel}
        role="dialog"
        aria-label="Shop"
        onPointerDown={(e) => e.stopPropagation()}
        className="g-panel pointer-events-auto flex max-h-[56%] w-full flex-col overflow-hidden rounded-b-none p-2.5 pb-[max(env(safe-area-inset-bottom),10px)] sm:m-3 sm:max-h-none sm:w-[min(430px,46vw)] sm:rounded-b-[var(--g-panel-radius)] sm:p-4 land:m-2 land:max-h-none land:w-[min(400px,50vw)] land:p-2.5 land:pb-2.5"
      >
        {/* Header: title, coins, close; then the tabs. */}
        <div className="flex items-center gap-1.5">
          <h2 className="g-panel-title min-w-0 flex-1 truncate text-xl leading-none sm:text-2xl land:text-lg">Shop</h2>
          <span className="g-tint inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold tabular-nums land:py-1">
            <CoinIcon /> {formatNumber(save.bank)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shop (Esc)"
            title="Close shop (Esc)"
            className="g-tint grid size-8 shrink-0 place-items-center rounded-lg hover:brightness-125 focus-visible:outline-2 focus-visible:outline-[var(--accent)] land:size-7"
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
              className={`g-display min-w-0 flex-1 truncate rounded-lg px-1 py-1.5 text-[11px] transition sm:text-xs land:py-1 ${
                t.kind === tab ? "bg-[var(--accent)] text-black" : "g-tint hover:brightness-125"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Items. */}
        <div className="-mx-1 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1 land:mt-1.5">
          <ul className="grid grid-cols-3 gap-1.5 sm:gap-2 land:grid-cols-4">
            {items.map((it) => {
              const have = isOwned(save, tab, it);
              const on = save[tab] === it.id;
              const picked = it.id === item.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(it.id)}
                    aria-pressed={picked}
                    className={`relative flex w-full flex-col items-center gap-1 overflow-hidden rounded-xl border-2 p-1 pb-1.5 text-center transition ${
                      picked ? "border-[var(--accent)] bg-white/12" : "border-transparent bg-white/6 hover:bg-white/10"
                    }`}
                  >
                    <Thumb kind={tab} id={it.id} skater={save.skater} />
                    <span className="w-full truncate text-[11px] leading-tight font-bold">{it.name}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums">
                      {on ? (
                        <span className="text-[var(--accent)]">Equipped</span>
                      ) : have ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-300">
                          <Check className="size-3" /> Owned
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 ${it.price > save.bank ? "opacity-60" : ""}`}>
                          <CoinIcon /> {formatNumber(it.price)}
                        </span>
                      )}
                    </span>
                    {!have && <Lock className="absolute top-1 right-1 size-3 opacity-70" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* The picked item and what you can do with it. */}
        <div className="mt-2 flex items-center gap-2 border-t border-white/15 pt-2 land:mt-1.5 land:pt-1.5">
          <div className="min-w-0 flex-1">
            <p className="g-display truncate text-sm leading-tight sm:text-base">{item.name}</p>
            <p className="g-muted truncate text-[11px] leading-tight">{busy ? `Loading ${busy.label}… ${Math.round(busy.ratio * 100)}%` : detail}</p>
          </div>
          {flash === item.id ? (
            <span className="g-display inline-flex animate-[game-fade_0.2s_ease] items-center gap-1 rounded-xl bg-emerald-400 px-3 py-2 text-xs text-emerald-950">
              <Sparkles className="size-4" /> Unlocked!
            </span>
          ) : (
            <ActionButton onClick={act} disabled={(owned && equipped) || (!owned && short > 0)}>
              {owned ? (
                equipped ? (
                  <>
                    <Check className="size-4" /> Equipped
                  </>
                ) : (
                  "Equip"
                )
              ) : short > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" /> {formatNumber(short)} more
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  Buy <CoinIcon /> {formatNumber(item.price)}
                </span>
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
      onClick={onClick}
      disabled={disabled}
      className="g-btn shrink-0 px-3.5 py-2 text-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-55 land:py-1.5"
    >
      <span className="g-unskew gap-1.5 whitespace-nowrap">{children}</span>
    </button>
  );
}

function boardDetail(board: BoardDef) {
  const bits = [board.trail ? `${board.trail === "hover" ? "Floats" : "Trail"}` : null, board.glow ? "Glowing wheels" : null].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Deck art";
}

const thumbBox = "relative grid h-14 w-full place-items-center overflow-hidden rounded-lg sm:h-16 land:h-12";

/** The picture on a shop card. */
function Thumb({ kind, id, skater }: { kind: ShopKind; id: string; skater: string }) {
  if (kind === "skater") {
    const def = findItem(SKATERS, id);
    return (
      <span className={`${thumbBox} bg-gradient-to-b from-sky-300/40 to-amber-200/20`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset(`/library/${def.key}.webp`)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" />
      </span>
    );
  }
  if (kind === "skin") return <SkinThumb id={id} skater={skater} />;
  if (kind === "board") return <BoardThumb id={id} />;
  const stage = findItem(STAGES, id);
  return (
    <span className={thumbBox} style={{ background: `linear-gradient(${stage.look.skyTop}, ${stage.look.horizon} 62%, ${stage.look.ground} 62%)` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={asset(`/games/skate-rush/stages/${id}.webp`)}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
    </span>
  );
}

/** The equipped skater's picture, recoloured with the skin's colours (keeps the light and shade). */
function SkinThumb({ id, skater }: { id: string; skater: string }) {
  const skin = findItem(SKINS, id);
  const src = asset(`/library/${findItem(SKATERS, skater).key}.webp`);
  const mask: CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
  return (
    <span className={`${thumbBox} bg-gradient-to-b from-white/10 to-white/0`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" className={`absolute inset-0 h-full w-full object-contain ${skin.look === "classic" ? "" : "grayscale"}`} />
      {skin.look !== "classic" && <span className="absolute inset-0 mix-blend-color" style={{ ...mask, background: skin.swatch }} />}
      {skin.look !== "classic" && <span className="absolute inset-0 opacity-35 mix-blend-overlay" style={{ ...mask, background: skin.swatch }} />}
    </span>
  );
}

const deckImages = new Map<string, string>();

/** A board seen from above, lying sideways: its deck art plus four wheels. */
function BoardThumb({ id }: { id: string }) {
  const board = findItem(BOARDS, id);
  const src = useMemo(() => {
    if (typeof document === "undefined") return "";
    const cached = deckImages.get(board.id);
    if (cached) return cached;
    const deck = document.createElement("canvas");
    paintDeck(deck, board);
    const out = document.createElement("canvas");
    out.width = DECK_H / 2;
    out.height = DECK_W / 2;
    const g = out.getContext("2d")!;
    g.beginPath();
    g.roundRect(1, 1, out.width - 2, out.height - 2, out.height / 2);
    g.clip();
    g.translate(out.width / 2, out.height / 2);
    g.rotate(-Math.PI / 2);
    g.drawImage(deck, -DECK_W / 4, -DECK_H / 4, DECK_W / 2, DECK_H / 2);
    const url = out.toDataURL();
    deckImages.set(board.id, url);
    return url;
  }, [board]);
  const wheel = { background: board.wheels, boxShadow: board.glow ? `0 0 6px ${board.wheels}` : undefined };
  return (
    <span className={`${thumbBox} bg-gradient-to-b from-white/10 to-white/0`}>
      <span className="relative w-[86%]">
        {[
          "top-[-3px] left-[16%]",
          "top-[-3px] right-[16%]",
          "bottom-[-3px] left-[16%]",
          "bottom-[-3px] right-[16%]",
        ].map((pos) => (
          <span key={pos} className={`absolute size-2 rounded-full ${pos} ${board.art === "hover" ? "hidden" : ""}`} style={wheel} />
        ))}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" className="relative block h-auto w-full rounded-full shadow-md shadow-black/40" style={board.art === "hover" ? { boxShadow: `0 6px 14px ${board.colors[1]}` } : undefined} />}
      </span>
    </span>
  );
}
