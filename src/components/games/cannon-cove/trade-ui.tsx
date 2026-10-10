"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Anchor, BookOpen, Check, Coins, Compass, Crosshair, Flame, Home, Lock, Map as MapIcon, Navigation, Package, Sailboat, ScrollText, ShieldPlus, Ship, Skull, Store, Wind, Wrench, X } from "lucide-react";
import { formatNumber, Kbd, SystemMenu, IconButton } from "../shared/ui";
import type { CannonCoveGame, ChartView, MarketRow, OfferRow, PortView, ShipRow, TradeHud, UpgradeRow } from "./engine";
import { clock, danger, GOODS, metres, PORT, PORTS, RANKS, type ContractKind, type GoodId } from "./trade";

/** Open Sea screens: the port (market, contracts, shipyard, upgrades, logbook), the sea chart and the trade HUD. */

type GameRef = { readonly current: CannonCoveGame | null };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function Btn({ onClick, disabled, children, primary = false, title, className = "" }: { onClick: () => void; disabled?: boolean; children: ReactNode; primary?: boolean; title?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${primary ? "g-btn" : "g-soft"} inline-flex shrink-0 items-center justify-center px-2.5 py-1 text-xs font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:px-1.5 pointer-coarse:py-0.5 pointer-coarse:text-[10px] ${className}`}
    >
      <span className="g-unskew gap-1">{children}</span>
    </button>
  );
}

function Bar({ frac, className }: { frac: number; className: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,currentColor_16%,transparent)] ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
      <div className={`h-full rounded-full transition-[width] duration-200 ${className}`} style={{ width: `${clamp01(frac) * 100}%` }} />
    </div>
  );
}

const KIND: Record<ContractKind, { label: string; icon: ReactNode; tone: string }> = {
  freight: { label: "Freight", icon: <Package className="size-3.5" />, tone: "bg-sky-700/15 text-sky-900" },
  express: { label: "Express", icon: <ScrollText className="size-3.5" />, tone: "bg-violet-700/15 text-violet-900" },
  order: { label: "Order", icon: <Store className="size-3.5" />, tone: "bg-emerald-700/15 text-emerald-900" },
  bounty: { label: "Bounty", icon: <Skull className="size-3.5" />, tone: "bg-red-700/15 text-red-900" },
  salvage: { label: "Salvage", icon: <Anchor className="size-3.5" />, tone: "bg-amber-700/20 text-amber-900" },
};

// --- Port screen ----------------------------------------------------------------------------------

type Tab = "market" | "contracts" | "ships" | "upgrades" | "log";

export function PortScreen({ view, game, onChart, onMenu, onHelp }: { view: PortView; game: GameRef; onChart: () => void; onMenu: () => void; onHelp: () => void }) {
  const [tab, setTab] = useState<Tab>("market");
  const [seen, setSeen] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  // Slide the 3D picture left so your ship shows beside the panel.
  useEffect(() => {
    const el = panel.current;
    const g = game.current;
    if (!el || !g) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      const wide = window.innerWidth > window.innerHeight;
      g.setShowcase(wide ? r.width + 12 : 0, wide ? 0 : r.height + 8);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      g.setShowcase(0, 0);
    };
  }, [game]);

  const notices = view.notices.slice(seen);
  // Messages fade away by themselves after a few seconds.
  useEffect(() => {
    if (view.notices.length <= seen) return;
    const id = window.setTimeout(() => setSeen(view.notices.length), 9000);
    return () => window.clearTimeout(id);
  }, [view.notices.length, seen]);
  const offers = view.offers.length;
  const tabs: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "market", label: "Market", icon: <Coins className="size-3.5" /> },
    { id: "contracts", label: "Contracts", icon: <ScrollText className="size-3.5" />, badge: offers },
    { id: "ships", label: "Shipyard", icon: <Ship className="size-3.5" /> },
    { id: "upgrades", label: "Upgrades", icon: <Wrench className="size-3.5" /> },
    { id: "log", label: "Logbook", icon: <BookOpen className="size-3.5" /> },
  ];
  const hullFrac = view.maxHull ? view.hull / view.maxHull : 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-stretch justify-end portrait:items-end" onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={panel}
        role="dialog"
        aria-label={view.name}
        className="g-panel pointer-events-auto m-2 flex w-[min(620px,calc(100%-16px))] flex-col overflow-hidden mt-[max(env(safe-area-inset-top),8px)] mb-[max(env(safe-area-inset-bottom),8px)] land:m-1.5 land:w-[66%] portrait:h-[70%] portrait:w-[calc(100%-16px)]"
      >
        {/* Header: always in view. */}
        <div className="flex items-center gap-2 border-b-2 border-[color-mix(in_srgb,currentColor_18%,transparent)] px-3 py-2 land:px-2 land:py-1">
          <div className="min-w-0 flex-1">
            <h2 className="g-panel-title truncate text-2xl leading-tight land:text-base pointer-coarse:text-lg">
              <Anchor className="mr-1 inline size-5 align-[-3px] land:size-4" />
              {view.name}
            </h2>
            <p className="g-muted truncate text-xs land:hidden">{view.blurb}</p>
          </div>
          <span className="g-tint g-display inline-flex items-center gap-1 rounded-[var(--g-hud-radius)] px-2 py-1 text-sm tabular-nums land:px-1.5 land:py-0.5 land:text-xs">
            <Coins className="size-3.5 text-amber-700" /> {formatNumber(view.gold)}
          </span>
          <Btn onClick={onChart} title="Sea chart (C)">
            <MapIcon className="size-3.5" /> <span className="land:hidden">Chart</span>
          </Btn>
          <SystemMenu small onHelp={onHelp}>
            <IconButton label="Save and go to the title screen" onClick={onMenu} small>
              <Home className="size-[18px]" />
            </IconButton>
          </SystemMenu>
          <Btn primary onClick={() => game.current?.setSail()} title="Set sail (Enter)" className="px-3 py-1.5 text-sm land:px-2 land:py-1 land:text-xs">
            <Sailboat className="size-4" /> Set sail
          </Btn>
        </div>

        {/* Ship, hold, hull, rank. */}
        <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-xs land:gap-1.5 land:px-2 land:py-1 land:text-[10px]">
          <div className="min-w-0">
            <p className="g-display flex items-center justify-between gap-1 truncate">
              <span className="truncate">
                <Package className="mr-0.5 inline size-3 align-[-1px]" /> Hold
              </span>
              <span className="tabular-nums">
                {view.cargo}/{view.cap}
              </span>
            </p>
            <Bar frac={view.cap ? view.cargo / view.cap : 0} className="bg-sky-600" />
          </div>
          <div className="min-w-0">
            <p className="g-display flex items-center justify-between gap-1">
              <span className="truncate">
                <ShieldPlus className="mr-0.5 inline size-3 align-[-1px]" /> Hull
              </span>
              <span className="tabular-nums">
                {view.hull}/{view.maxHull}
              </span>
            </p>
            <div className="flex items-center gap-1">
              <div className="flex-1">
                <Bar frac={hullFrac} className={hullFrac > 0.6 ? "bg-emerald-600" : hullFrac > 0.3 ? "bg-amber-500" : "bg-red-600"} />
              </div>
              {view.repairCost > 0 && (
                <Btn onClick={() => game.current?.portRepair()} disabled={view.gold <= 0} title="Repair the hull" className="px-1.5! py-0! text-[10px]!">
                  <Wrench className="size-3" /> {formatNumber(Math.min(view.repairCost, view.gold))}
                </Btn>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <p className="g-display flex items-center justify-between gap-1">
              <span className="truncate">{view.rank.name}</span>
              <span className="g-muted tabular-nums">{view.rank.next ? `${formatNumber(view.rank.xp)} xp` : "max"}</span>
            </p>
            <Bar frac={view.rank.frac} className="bg-amber-500" />
          </div>
        </div>

        {notices.length > 0 && (
          <div className="mx-3 mb-1 space-y-1 land:mx-2">
            {notices.slice(-2).map((n, i) => (
              <div
                key={`${seen}-${i}`}
                className={`flex items-start gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1.5 text-xs ring-1 land:py-0.5 land:text-[10px] ${i < Math.min(notices.length, 2) - 1 ? "land:hidden" : ""} ${
                  n.tone === "good" ? "bg-emerald-600/15 ring-emerald-700/30" : n.tone === "bad" ? "bg-red-600/15 ring-red-700/30" : "bg-sky-600/12 ring-sky-700/25"
                }`}
              >
                <p className="line-clamp-2 min-w-0 flex-1 leading-snug land:line-clamp-1">
                  <b>{n.title}</b> {n.text}
                </p>
                {i === Math.min(notices.length, 2) - 1 && (
                  <button type="button" onClick={() => setSeen(view.notices.length)} aria-label="Dismiss" className="g-muted -mr-1 shrink-0 rounded p-0.5 hover:brightness-75">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <Guide view={view} onTab={setTab} game={game} />

        <div className="flex gap-1 overflow-x-auto px-3 pb-1.5 land:px-2 land:pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
              className="g-soft relative inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:px-2 pointer-coarse:py-0.5 pointer-coarse:text-[10px]"
            >
              <span className="g-unskew gap-1">
                <span className="max-[430px]:hidden">{t.icon}</span>
                {t.label}
                {!!t.badge && <span className="rounded-full bg-amber-500 px-1 text-[9px] leading-tight text-amber-950">{t.badge}</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "market" ? (
            <Market view={view} game={game} />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 land:px-2 land:pb-2">
              {tab === "contracts" && <Contracts view={view} game={game} />}
              {tab === "ships" && <Shipyard view={view} game={game} />}
              {tab === "upgrades" && <Upgrades view={view} game={game} />}
              {tab === "log" && <Logbook view={view} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Market({ view, game }: { view: PortView; game: GameRef }) {
  const rows = useMemo(() => {
    const score = (r: MarketRow) => (r.have > 0 ? 0 : 10) + (r.local ? 0 : r.wanted ? 1 : 2);
    return [...view.market].sort((a, b) => score(a) - score(b));
  }, [view.market]);
  const [pick, setPick] = useState<GoodId>(() => rows[0].id);
  const sel = rows.find((r) => r.id === pick) ?? rows[0];
  const wantedAboard = view.market.filter((r) => r.wanted && r.have > 0);
  const wantedIncome = wantedAboard.reduce((sum, r) => sum + view.quote(r.id, r.have).sell, 0);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 land:px-2">
        {wantedAboard.length > 0 && (
          <button
            type="button"
            onClick={() => game.current?.sellWanted()}
            className="g-btn mb-1.5 flex w-full items-center justify-center px-3 py-1.5 text-sm pointer-coarse:py-1 pointer-coarse:text-xs land:mb-1 land:py-0.5"
          >
            <span className="g-unskew gap-1.5">
              <Coins className="size-4" /> Sell everything {view.name} wants · +{formatNumber(wantedIncome)}
            </span>
          </button>
        )}
        <p className="g-muted mb-1 text-[11px] leading-snug land:hidden">Tap a good to trade it. Buy what&apos;s made here, sell where it&apos;s wanted.</p>
        <div className="g-muted grid grid-cols-[26px_minmax(0,1fr)_44px_56px] items-center gap-2 px-2 text-[10px] font-bold tracking-wide uppercase">
          <span />
          <span>Goods</span>
          <span className="text-right">Buy</span>
          <span className="text-right">Sell</span>
        </div>
        <ul className="space-y-1 pb-2">
          {rows.map((r) => {
            const profit = r.paid !== null ? r.sell - r.paid : null;
            const active = r.id === sel.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setPick(r.id)}
                  aria-pressed={active}
                  className={`g-tint grid w-full grid-cols-[26px_minmax(0,1fr)_44px_56px] items-center gap-2 rounded-[var(--g-hud-radius)] px-2 py-1 text-left transition focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                    active ? "ring-2 ring-[var(--accent)]" : r.have > 0 ? "ring-1 ring-sky-700/30" : ""
                  }`}
                >
                  <span className="text-center text-lg leading-none pointer-coarse:text-base">{r.icon}</span>
                  <span className="min-w-0">
                    <span className="g-display block truncate text-sm leading-tight pointer-coarse:text-xs">{r.name}</span>
                    <span className="block truncate text-[10px] leading-tight">
                      {r.local && <span className="mr-1 rounded bg-emerald-700/20 px-1 font-bold text-emerald-900">made here</span>}
                      {r.wanted && <span className="mr-1 rounded bg-amber-600/25 px-1 font-bold text-amber-900">wanted</span>}
                      <span className="g-muted">{r.have > 0 ? `${r.have} aboard` : ""}</span>
                    </span>
                  </span>
                  <span className="g-display text-right text-sm tabular-nums pointer-coarse:text-xs">{r.buy ?? <span className="g-muted">—</span>}</span>
                  <span className="text-right leading-tight">
                    <span className={`g-display block text-sm tabular-nums pointer-coarse:text-xs ${r.wanted ? "text-amber-800" : ""}`}>{r.sell}</span>
                    {profit !== null && <span className={`block text-[9px] font-bold tabular-nums ${profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{profit >= 0 ? `+${profit}` : profit} each</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <TradeBox r={sel} view={view} game={game} />
    </>
  );
}

/** The selected good: where it sells, and one-tap buy / sell buttons with exact totals. Always in view. */
function TradeBox({ r, view, game }: { r: MarketRow; view: PortView; game: GameRef }) {
  const free = view.cap - view.cargo;
  const buys = r.buy === null ? [] : [...new Set([1, 5, r.maxBuy].filter((n) => n >= 1 && n <= r.maxBuy))].sort((a, b) => a - b);
  const sells = r.have > 0 ? [...new Set([1, r.have])].sort((a, b) => a - b) : [];
  const wanted = view.wantedAt(r.id).slice(0, 2);
  const hint = r.wanted
    ? `${view.name} wants ${r.name.toLowerCase()} — a good place to sell.`
    : wanted.length
      ? `Sells best at ${wanted.map((w) => `${w.name} (${metres(w.dist)}${w.price !== null ? `, ${w.price}` : ""})`).join(" or ")}.`
      : `Few ports want ${r.name.toLowerCase()}.`;
  let why = "";
  if (r.buy !== null && r.maxBuy < 1) why = free <= 0 ? "Your hold is full." : "Not enough gold.";
  return (
    <div className="border-t-2 border-[color-mix(in_srgb,currentColor_15%,transparent)] px-3 pt-1.5 pb-2 land:px-2 land:pt-1 land:pb-1.5">
      <p className="flex items-center gap-2">
        <span className="text-xl leading-none">{r.icon}</span>
        <span className="g-display text-base leading-tight land:text-sm">{r.name}</span>
        <span className="g-muted ml-auto text-[11px] tabular-nums">{r.have > 0 ? `${r.have} aboard${r.paid !== null ? ` · paid ${r.paid}` : ""}` : `Hold ${view.cargo}/${view.cap}`}</span>
      </p>
      <p className="g-muted mt-0.5 truncate text-[11px] leading-snug land:text-[10px]" title={hint}>
        {hint}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {r.buy !== null ? (
          buys.length ? (
            buys.map((n) => (
              <Btn key={`b${n}`} primary onClick={() => game.current?.tradeBuy(r.id, n)} title={`Buy ${n} ${r.name}`}>
                Buy {n} · {formatNumber(view.quote(r.id, n).buy ?? 0)}
              </Btn>
            ))
          ) : (
            <span className="text-[11px] font-bold text-red-800">{why}</span>
          )
        ) : (
          <span className="g-muted text-[11px]">Not sold here</span>
        )}
        <span className="mx-0.5 h-5 w-px bg-[color-mix(in_srgb,currentColor_25%,transparent)]" />
        {sells.length ? (
          sells.map((n) => (
            <Btn key={`s${n}`} onClick={() => game.current?.tradeSell(r.id, n)} title={`Sell ${n} ${r.name}`}>
              {n === r.have && n > 1 ? "Sell all" : "Sell"} {n} · {formatNumber(view.quote(r.id, n).sell)}
            </Btn>
          ))
        ) : (
          <span className="g-muted text-[11px]">None aboard to sell</span>
        )}
      </div>
    </div>
  );
}

/** First voyages: one next step at a time, with a button that shows where. */
function Guide({ view, onTab, game }: { view: PortView; onTab: (t: Tab) => void; game: GameRef }) {
  const steps = [
    { done: view.stats.contracts > 0 || view.active.length > 0, text: "Take a contract — freight cargo is loaded for you, no money needed.", act: "Contracts", go: () => onTab("contracts") },
    { done: view.visited >= 2, text: "Set sail. Turn on Auto-sail and the ship steers itself to the course and docks.", act: "Set sail", go: () => game.current?.setSail() },
    { done: view.stats.sold >= 20, text: "Trade: buy goods marked “made here”, sell them where they're “wanted”.", act: "Market", go: () => onTab("market") },
    { done: view.fleet >= 2, text: "Save up and buy a bigger ship — more hold, more cannons.", act: "Shipyard", go: () => onTab("ships") },
  ];
  const i = steps.findIndex((s) => !s.done);
  if (view.guideOff || i < 0) return null;
  const s = steps[i];
  return (
    <div className="mx-3 mb-1.5 flex items-center gap-2 rounded-[var(--g-hud-radius)] bg-amber-500/20 px-2.5 py-1.5 text-xs ring-1 ring-amber-700/35 land:mx-2 land:py-1 land:text-[10px]">
      <span className="g-display shrink-0 rounded-full bg-amber-600 px-1.5 text-[10px] text-amber-50">
        {i + 1}/{steps.length}
      </span>
      <p className="line-clamp-2 min-w-0 flex-1 leading-snug land:line-clamp-1">{s.text}</p>
      <Btn primary onClick={s.go}>
        {s.act}
      </Btn>
      <button type="button" onClick={() => game.current?.setGuide(false)} aria-label="Hide the guide" title="Hide the guide" className="g-muted shrink-0 rounded p-0.5 hover:brightness-75">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function ContractCard({ o, active, game, here }: { o: OfferRow; active: boolean; game: GameRef; here: string }) {
  const k = KIND[o.c.kind];
  const [sure, setSure] = useState(false);
  const deliverHere = active && o.c.to === here && o.c.kind !== "bounty";
  return (
    <li className={`g-tint rounded-[var(--g-hud-radius)] px-2.5 py-2 land:py-1.5 ${active ? "ring-1 ring-amber-700/40" : ""}`}>
      <div className="flex items-start gap-2">
        <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${k.tone}`}>
          {k.icon}
          {k.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="g-display text-sm leading-tight pointer-coarse:text-xs">{o.title}</p>
          <p className="text-[11px] leading-snug pointer-coarse:text-[10px]">{active ? o.line : o.detail}</p>
          <p className="g-muted mt-0.5 flex flex-wrap gap-x-2.5 text-[10px] font-bold">
            {o.dist > 0 && <span>{metres(o.dist)}</span>}
            <span className={active && o.c.left < 30 ? "text-red-700" : ""}>⏱ {clock(active ? o.c.left : o.c.time)}</span>
            {(o.c.kind === "freight" || o.c.kind === "express") && <span>Hold: {o.c.qty}</span>}
            {deliverHere && o.c.kind === "order" && <span className="text-amber-800">Bring the goods here, then dock again</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="g-display inline-flex items-center gap-1 text-sm tabular-nums text-amber-800 pointer-coarse:text-xs">
            <Coins className="size-3.5" />
            {formatNumber(o.c.reward)}
          </span>
          {active ? (
            <Btn onClick={() => (sure ? game.current?.abandonContract(o.c.id) : setSure(true))} title="Give up this contract">
              {sure ? "Really?" : "Abandon"}
            </Btn>
          ) : (
            <Btn primary onClick={() => game.current?.acceptContract(o.c.id)} disabled={!!o.blocked} title={o.blocked ?? "Take this contract"}>
              Accept
            </Btn>
          )}
        </div>
      </div>
      {!active && o.blocked && <p className="mt-1 text-[10px] font-bold text-red-800">{o.blocked}</p>}
    </li>
  );
}

function Contracts({ view, game }: { view: PortView; game: GameRef }) {
  return (
    <div className="space-y-2">
      <p className="g-muted text-[11px] leading-snug land:text-[10px]">Accepting a contract sets your course — turn on Auto-sail at sea and the ship takes you there. Clocks only run while you sail.</p>
      {view.active.length > 0 && (
        <section>
          <h3 className="g-display g-muted mb-1 text-[11px] tracking-wide uppercase">
            Your contracts ({view.active.length}/{view.maxContracts})
          </h3>
          <ul className="space-y-1">
            {view.active.map((o) => (
              <ContractCard key={o.c.id} o={o} active game={game} here={view.id} />
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="g-display g-muted mb-1 text-[11px] tracking-wide uppercase">On the board at {view.name}</h3>
        {view.offers.length ? (
          <ul className="space-y-1">
            {view.offers.map((o) => (
              <ContractCard key={o.c.id} o={o} active={false} game={game} here={view.id} />
            ))}
          </ul>
        ) : (
          <p className="g-tint rounded-[var(--g-hud-radius)] px-3 py-2 text-xs">All taken. New contracts are posted every few minutes at sea.</p>
        )}
        <p className="g-muted mt-1.5 text-[10px]">New contracts here in {clock(view.refresh)} (the clock runs while you sail).</p>
      </section>
    </div>
  );
}

function ShipStats({ r }: { r: ShipRow }) {
  return (
    <span className="g-muted flex flex-wrap gap-x-2 text-[10px] font-bold">
      <span title="Cargo hold">
        <Package className="mr-0.5 inline size-3 align-[-2px]" />
        {r.cap}
      </span>
      <span title="Hull">
        <ShieldPlus className="mr-0.5 inline size-3 align-[-2px]" />
        {r.hull}
      </span>
      <span title="Cannons each side">
        <Crosshair className="mr-0.5 inline size-3 align-[-2px]" />
        {r.guns}/side
      </span>
      <span title={r.def.steam ? "Steam engines: the wind doesn't matter" : "Top speed under sail"}>
        {r.def.steam ? <Flame className="mr-0.5 inline size-3 align-[-2px]" /> : <Wind className="mr-0.5 inline size-3 align-[-2px]" />}
        {Math.round(r.def.speed * 1.6)} kn
      </span>
    </span>
  );
}

function Shipyard({ view, game }: { view: PortView; game: GameRef }) {
  const fleet = view.ships.filter((s) => s.owned);
  const sale = view.ships.filter((s) => !s.owned && s.sold);
  const elsewhere = view.ships.filter((s) => !s.owned && !s.sold);
  const where = (id: string) =>
    PORTS.filter((p) => p.yard.includes(id as never))
      .map((p) => p.name)
      .join(", ");
  return (
    <div className="space-y-2">
      <section>
        <h3 className="g-display g-muted mb-1 text-[11px] tracking-wide uppercase">Your fleet</h3>
        <ul className="grid gap-1 sm:grid-cols-2">
          {fleet.map((r) => (
            <li key={r.def.id} className={`g-tint flex items-center gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1.5 ${r.active ? "ring-2 ring-[var(--accent)]" : ""}`}>
              <Ship className="size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="g-display truncate text-sm leading-tight pointer-coarse:text-xs">{r.def.name}</p>
                <ShipStats r={r} />
              </div>
              {r.active ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-800">
                  <Check className="size-3" /> Sailing
                </span>
              ) : (
                <Btn onClick={() => game.current?.switchShip(r.def.id)} disabled={!!r.blocked} title={r.blocked ?? `Take the ${r.def.name} to sea`}>
                  Sail her
                </Btn>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="g-display g-muted mb-1 text-[11px] tracking-wide uppercase">{view.yard ? `Built at ${view.name}` : `No shipyard at ${view.name}`}</h3>
        {sale.length > 0 ? (
          <ul className="space-y-1">
            {sale.map((r) => (
              <li key={r.def.id} className="g-tint flex items-center gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1.5">
                <Ship className="size-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="g-display text-sm leading-tight pointer-coarse:text-xs">
                    {r.def.name} <span className="g-muted text-[10px]">{r.def.kind}</span>
                  </p>
                  <p className="text-[11px] leading-snug pointer-coarse:text-[10px]">{r.def.blurb}</p>
                  <ShipStats r={r} />
                  {r.blocked && r.blocked !== "Not enough gold" && <p className="text-[10px] font-bold text-red-800">{r.blocked}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="g-display inline-flex items-center gap-1 text-sm tabular-nums text-amber-800 pointer-coarse:text-xs">
                    <Coins className="size-3.5" />
                    {formatNumber(r.def.price)}
                  </span>
                  <Btn primary onClick={() => game.current?.buyShip(r.def.id)} disabled={!!r.blocked} title={r.blocked ?? `Buy the ${r.def.name}`}>
                    {r.blocked && r.blocked !== "Not enough gold" ? <Lock className="size-3" /> : null} Buy
                  </Btn>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="g-tint rounded-[var(--g-hud-radius)] px-3 py-2 text-xs">{view.yard ? "You own every ship built here." : "Switch between the ships you own here, or sail to a shipyard to buy more."}</p>
        )}
      </section>
      {elsewhere.length > 0 && (
        <section>
          <h3 className="g-display g-muted mb-1 text-[11px] tracking-wide uppercase">Built elsewhere</h3>
          <ul className="space-y-0.5 text-[11px] pointer-coarse:text-[10px]">
            {elsewhere.map((r) => (
              <li key={r.def.id} className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span>
                  <b>{r.def.name}</b> <span className="g-muted">· {r.def.kind} · hold {r.cap}</span>
                </span>
                <span className="g-muted">
                  {formatNumber(r.def.price)} gold · {where(r.def.id)}
                  {r.def.rank > 0 ? ` · ${RANKS[r.def.rank].name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Upgrades({ view, game }: { view: PortView; game: GameRef }) {
  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {view.upgrades.map((u: UpgradeRow) => (
        <li key={u.id} className="g-tint flex items-center gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="g-display text-sm leading-tight pointer-coarse:text-xs">{u.title}</p>
            <p className="text-[11px] leading-snug pointer-coarse:text-[10px]">{u.text}</p>
            <span className="mt-0.5 flex gap-0.5" aria-label={`Level ${u.level} of ${u.max}`}>
              {Array.from({ length: u.max }, (_, i) => (
                <span key={i} className={`h-1.5 w-3.5 rounded-full ring-1 ring-[color-mix(in_srgb,currentColor_35%,transparent)] ${i < u.level ? "bg-[var(--accent)]" : "bg-transparent"}`} />
              ))}
            </span>
          </div>
          {u.cost === null ? (
            <span className="text-[10px] font-bold text-emerald-800">Maxed</span>
          ) : (
            <Btn primary onClick={() => game.current?.buyUpgrade(u.id)} disabled={view.gold < u.cost} title={`Buy for ${u.cost} gold`}>
              <Coins className="size-3" /> {formatNumber(u.cost)}
            </Btn>
          )}
        </li>
      ))}
    </ul>
  );
}

function Logbook({ view }: { view: PortView }) {
  const s = view.stats;
  const stats: [string, string][] = [
    ["Gold earned", formatNumber(s.earned)],
    ["Contracts", formatNumber(s.contracts)],
    ["Goods sold", formatNumber(s.sold)],
    ["Pirates sunk", formatNumber(s.pirates)],
    ["Treasures", formatNumber(s.treasures)],
    ["Sailed", metres(s.sailed)],
  ];
  return (
    <div className="space-y-2">
      <div className="g-tint rounded-[var(--g-hud-radius)] px-3 py-2">
        <p className="g-display flex items-center justify-between text-sm">
          <span>Guild rank: {view.rank.name}</span>
          <span className="g-muted text-xs tabular-nums">
            {formatNumber(view.rank.xp)}
            {view.rank.next ? ` / ${formatNumber(view.rank.next)} xp` : " xp"}
          </span>
        </p>
        <Bar frac={view.rank.frac} className="bg-amber-500" />
        <p className="g-muted mt-1 text-[10px]">
          {view.rank.nextName ? `Next: ${view.rank.nextName} — bigger ships and more contracts at once.` : "The highest rank in the guild."} {view.maps > 0 ? `· ${view.maps} treasure map${view.maps > 1 ? "s" : ""} on your chart` : ""}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {stats.map(([k, v]) => (
          <div key={k} className="g-tint rounded-[var(--g-hud-radius)] px-2 py-1 text-center">
            <p className="g-muted text-[9px] font-bold tracking-wide uppercase">{k}</p>
            <p className="g-display text-sm tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-1">
        {view.goals.map((g) => (
          <li key={g.id} className={`g-tint flex items-center gap-2 rounded-[var(--g-hud-radius)] px-2.5 py-1 ${g.done ? "opacity-70" : ""}`}>
            <span className={`grid size-5 shrink-0 place-items-center rounded-full ${g.done ? "bg-emerald-600 text-white" : "ring-1 ring-[color-mix(in_srgb,currentColor_35%,transparent)]"}`}>{g.done && <Check className="size-3" />}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-tight font-bold pointer-coarse:text-[11px]">
                {g.title} <span className="g-muted font-semibold">— {g.text}</span>
              </p>
              {!g.done && <Bar frac={g.cur / g.max} className="bg-sky-600" />}
            </div>
            <span className="g-display shrink-0 text-xs tabular-nums text-amber-800">{formatNumber(g.reward)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Sea chart ------------------------------------------------------------------------------------

type Pick = { kind: "port"; id: string } | { kind: "point"; x: number; z: number } | null;

const SEA = "#c4e0dd";
const LAND = "#e6cf98";
const INK = "#3b2412";

/** Pirate danger as a soft red wash, drawn once per chart size. */
function dangerLayer(size: number, bounds: number) {
  const c = document.createElement("canvas");
  const n = 48;
  c.width = c.height = n;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = ((i + 0.5) / n) * 2 * bounds - bounds;
      const z = ((j + 0.5) / n) * 2 * bounds - bounds;
      const d = danger(x, z);
      if (d < 0.1) continue;
      ctx.fillStyle = `rgba(185, 28, 28, ${Math.min(0.2, d * 0.22)})`;
      ctx.fillRect(i, j, 1, 1);
    }
  }
  const out = document.createElement("canvas");
  out.width = out.height = size;
  const o = out.getContext("2d")!;
  o.imageSmoothingEnabled = true;
  o.drawImage(c, 0, 0, size, size);
  return out;
}

export function ChartScreen({ game, onClose, onSail }: { game: GameRef; onClose: () => void; onSail?: (target: { x: number; z: number; label: string }) => void }) {
  const [view, setView] = useState<ChartView | null>(() => game.current?.chart() ?? null);
  const [pick, setPick] = useState<Pick>(null);
  const [size, setSize] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<{ size: number; img: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const sync = () => setSize(Math.floor(Math.min(el.clientWidth, el.clientHeight)));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !view || size < 40) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    cv.width = cv.height = px;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    if (!layer.current || layer.current.size !== px) layer.current = { size: px, img: dangerLayer(px, view.bounds) };
    drawChart(ctx, px, dpr, view, pick, layer.current.img);
  }, [view, pick, size]);

  const toWorld = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const b = view!.bounds;
    return { x: ((e.clientX - r.left) / r.width) * 2 * b - b, z: ((e.clientY - r.top) / r.height) * 2 * b - b, perPx: (2 * b) / r.width };
  };

  const onTap = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!view) return;
    const w = toWorld(e);
    let best: string | null = null;
    let bd = 26 * w.perPx;
    for (const p of view.ports) {
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    setPick(best ? { kind: "port", id: best } : { kind: "point", x: w.x, z: w.z });
  };

  const setCourse = (target: { x: number; z: number; label: string } | null) => {
    game.current?.setWaypoint(target);
    setView(game.current?.chart() ?? null);
  };

  if (!view) return null;
  const port = pick?.kind === "port" ? view.ports.find((p) => p.id === pick.id) ?? null : null;
  const dist = (x: number, z: number) => metres(Math.hypot(x - view.player.x, z - view.player.z));
  const wp = view.waypoint;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-2 backdrop-blur-[2px]" onPointerDown={(e) => e.stopPropagation()}>
      <div role="dialog" aria-label="Sea chart" className="g-panel flex h-full max-h-[760px] w-full max-w-[1100px] flex-col gap-2 p-2 sm:p-3 landscape:flex-row">
        <div ref={box} className="relative min-h-0 min-w-0 flex-1">
          <canvas ref={canvas} onPointerDown={onTap} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-[var(--g-hud-radius)] shadow-inner" style={{ width: size, height: size }} aria-label="Sea chart: tap a port" />
        </div>
        <div className="flex max-h-[42%] w-full shrink-0 flex-col gap-2 overflow-y-auto landscape:max-h-none landscape:w-[min(300px,38%)]">
          <div className="flex items-center gap-2">
            <h2 className="g-panel-title flex-1 text-2xl leading-none land:text-lg">
              <Compass className="mr-1 inline size-5 align-[-3px]" />
              Sea chart
            </h2>
            <IconButton label="Close chart (C)" onClick={onClose} small>
              <X className="size-[18px]" />
            </IconButton>
          </div>
          {port ? (
            <div className="g-tint space-y-1.5 rounded-[var(--g-hud-radius)] p-2.5 text-xs land:p-2 land:text-[11px]">
              <p className="g-display text-base leading-tight">
                ⚓ {port.name} {port.here && <span className="text-[10px] text-emerald-800">· you are here</span>}
              </p>
              <p className="g-muted">
                {dist(port.x, port.z)} away · {port.visited ? "visited" : "not visited yet"}
                {port.yard ? " · shipyard" : ""}
              </p>
              <PriceList title="Sells" goods={port.produces} prices={port.prices?.buy} />
              <PriceList title="Wants" goods={port.wants} prices={port.prices?.sell} />
              <p className="g-muted text-[10px]">
                {port.prices ? (view.live ? "Live prices (Trade Network)" : `Prices from your last visit (${clock(view.time - port.prices.t)} ago at sea)`) : "Visit to learn its prices."}
              </p>
              {!port.here && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {onSail && (
                    <Btn primary onClick={() => onSail({ x: port.x, z: port.z, label: port.name })} title="Set the course and let the ship sail there and dock">
                      <Navigation className="size-3.5" /> Auto-sail there
                    </Btn>
                  )}
                  <Btn primary={!onSail} onClick={() => setCourse({ x: port.x, z: port.z, label: port.name })}>
                    <MapIcon className="size-3.5" /> Set course
                  </Btn>
                  {wp && (
                    <Btn onClick={() => setCourse(null)}>
                      <X className="size-3.5" /> Clear
                    </Btn>
                  )}
                </div>
              )}
            </div>
          ) : pick?.kind === "point" ? (
            <div className="g-tint space-y-1.5 rounded-[var(--g-hud-radius)] p-2.5 text-xs">
              <p className="g-display text-base leading-tight">Open water</p>
              <p className="g-muted">{dist(pick.x, pick.z)} away</p>
              <div className="flex flex-wrap gap-1.5">
                {onSail && (
                  <Btn primary onClick={() => onSail({ x: pick.x, z: pick.z, label: "Marked spot" })}>
                    <Navigation className="size-3.5" /> Auto-sail here
                  </Btn>
                )}
                <Btn primary={!onSail} onClick={() => setCourse({ x: pick.x, z: pick.z, label: "Marked spot" })}>
                  <MapIcon className="size-3.5" /> Set course here
                </Btn>
                {wp && (
                  <Btn onClick={() => setCourse(null)}>
                    <X className="size-3.5" /> Clear
                  </Btn>
                )}
              </div>
            </div>
          ) : (
            <div className="g-tint space-y-1 rounded-[var(--g-hud-radius)] p-2.5 text-xs land:text-[11px]">
              <p>Tap a port to see what it sells and wants, then set a course — a gold arrow will point the way.</p>
              {wp && (
                <p className="flex items-center justify-between gap-2">
                  <span>
                    Course: <b>{wp.label}</b> · {dist(wp.x, wp.z)}
                  </span>
                  <Btn onClick={() => setCourse(null)}>Clear</Btn>
                </p>
              )}
            </div>
          )}
          {view.targets.length > 0 && (
            <ul className="space-y-0.5 text-[11px] land:text-[10px]">
              {view.targets.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => setCourse({ x: t.x, z: t.z, label: t.kind === "port" ? t.label.split("→").pop()!.trim() : t.label })}>
                    {t.kind === "treasure" ? "✕ " : ""}
                    {t.label}
                  </button>
                  <span className="g-muted shrink-0 tabular-nums">{dist(t.x, t.z)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="g-muted mt-auto text-[10px] leading-snug">Red waters: pirates. Green: the Haunted Sea, where the Drowned Queen sails. ✕ marks treasure from your maps.</p>
        </div>
      </div>
    </div>
  );
}

function PriceList({ title, goods, prices }: { title: string; goods: readonly (keyof typeof GOODS)[]; prices?: Partial<Record<keyof typeof GOODS, number>> }) {
  return (
    <p>
      <b>{title}:</b>{" "}
      {goods.map((g, i) => (
        <span key={g}>
          {i > 0 && ", "}
          {GOODS[g].icon} {GOODS[g].name}
          {prices?.[g] !== undefined && <b className="tabular-nums text-amber-800"> {prices[g]}</b>}
        </span>
      ))}
    </p>
  );
}

function drawChart(ctx: CanvasRenderingContext2D, px: number, dpr: number, view: ChartView, pick: Pick, danger: HTMLCanvasElement) {
  const b = view.bounds;
  const s = px / (2 * b);
  const X = (x: number) => (x + b) * s;
  const Z = (z: number) => (z + b) * s;
  const u = dpr * Math.max(0.75, Math.min(1.3, px / dpr / 520));
  ctx.clearRect(0, 0, px, px);
  ctx.fillStyle = SEA;
  ctx.fillRect(0, 0, px, px);
  ctx.drawImage(danger, 0, 0);
  // The Haunted Sea.
  const g = ctx.createRadialGradient(X(view.haunted.x), Z(view.haunted.z), 0, X(view.haunted.x), Z(view.haunted.z), view.haunted.r * s);
  g.addColorStop(0, "rgba(20, 83, 45, 0.45)");
  g.addColorStop(1, "rgba(20, 83, 45, 0.08)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(X(view.haunted.x), Z(view.haunted.z), view.haunted.r * s, 0, Math.PI * 2);
  ctx.fill();
  // Grid every 250 m.
  ctx.strokeStyle = "rgba(59,36,18,0.12)";
  ctx.lineWidth = 1 * dpr;
  for (let v = -b + 150; v < b; v += 250) {
    ctx.beginPath();
    ctx.moveTo(X(v), 0);
    ctx.lineTo(X(v), px);
    ctx.moveTo(0, Z(v));
    ctx.lineTo(px, Z(v));
    ctx.stroke();
  }
  // Islands.
  ctx.fillStyle = LAND;
  ctx.strokeStyle = "rgba(59,36,18,0.45)";
  ctx.lineWidth = 1 * dpr;
  for (const i of view.islands) {
    ctx.beginPath();
    ctx.arc(X(i.x), Z(i.z), Math.max(1.6 * dpr, i.r * s), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Region names.
  ctx.font = `italic 600 ${11 * u}px Georgia, serif`;
  ctx.fillStyle = "rgba(20,60,40,0.7)";
  ctx.fillText("Haunted Sea", X(view.haunted.x), Z(view.haunted.z));
  const skull = PORT.skull;
  ctx.fillStyle = "rgba(127,29,29,0.6)";
  ctx.fillText("Pirate Waters", X(skull.x + 160), Z(skull.z - 200));
  // Course line.
  const wp = view.waypoint;
  if (wp) {
    ctx.setLineDash([6 * dpr, 5 * dpr]);
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(X(view.player.x), Z(view.player.z));
    ctx.lineTo(X(wp.x), Z(wp.z));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Ports.
  for (const p of view.ports) {
    const x = X(p.x);
    const y = Z(p.z);
    const selected = pick?.kind === "port" && pick.id === p.id;
    ctx.beginPath();
    ctx.arc(x, y, (selected ? 9 : 7) * u, 0, Math.PI * 2);
    ctx.fillStyle = p.visited ? "#fbbf24" : "#e2d3ae";
    ctx.fill();
    ctx.lineWidth = (selected ? 3 : 2) * dpr;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `700 ${9 * u}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText("⚓", x, y + 0.5 * dpr);
    ctx.font = `700 ${11 * u}px ui-sans-serif, system-ui, sans-serif`;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = "rgba(255,248,230,0.85)";
    const ly = y + 15 * u;
    ctx.strokeText(p.visited ? p.name : `${p.name} ?`, x, ly);
    ctx.fillText(p.visited ? p.name : `${p.name} ?`, x, ly);
  }
  // Contract targets and treasure.
  for (const t of view.targets) {
    const x = X(t.x);
    const y = Z(t.z);
    if (t.kind === "port") {
      ctx.beginPath();
      ctx.arc(x, y, 12 * u, 0, Math.PI * 2);
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2.5 * dpr;
      ctx.stroke();
    } else {
      ctx.font = `900 ${(t.kind === "treasure" ? 16 : 15) * u}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = t.kind === "treasure" ? "#dc2626" : t.kind === "bounty" ? "#7f1d1d" : "#0c4a6e";
      ctx.fillText(t.kind === "treasure" ? "✕" : t.kind === "bounty" ? "☠" : "⚓", x, y);
    }
  }
  if (wp) {
    ctx.save();
    ctx.translate(X(wp.x), Z(wp.z));
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#fbbf24";
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 2 * dpr;
    ctx.fillRect(-5 * u, -5 * u, 10 * u, 10 * u);
    ctx.strokeRect(-5 * u, -5 * u, 10 * u, 10 * u);
    ctx.restore();
  }
  if (pick?.kind === "point") {
    ctx.beginPath();
    ctx.arc(X(pick.x), Z(pick.z), 6 * u, 0, Math.PI * 2);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }
  // You.
  const h = view.player.h;
  ctx.save();
  ctx.translate(X(view.player.x), Z(view.player.z));
  // Heading h points along (sin h, cos h): on the chart, x runs right and z down.
  ctx.rotate(Math.PI - h);
  ctx.beginPath();
  ctx.moveTo(0, -10 * u);
  ctx.lineTo(6 * u, 7 * u);
  ctx.lineTo(0, 4 * u);
  ctx.lineTo(-6 * u, 7 * u);
  ctx.closePath();
  ctx.fillStyle = "#dc2626";
  ctx.fill();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.restore();
  // Compass rose.
  const cx = px - 26 * u;
  const cy = 30 * u;
  ctx.fillStyle = "rgba(255,248,230,0.8)";
  ctx.beginPath();
  ctx.arc(cx, cy, 16 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 13 * u);
  ctx.lineTo(cx + 4 * u, cy);
  ctx.lineTo(cx - 4 * u, cy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `800 ${9 * u}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText("N", cx, cy + 8 * u);
  // Scale bar: 500 m.
  const bar = 500 * s;
  ctx.fillStyle = INK;
  ctx.fillRect(12 * u, px - 14 * u, bar, 3 * dpr);
  ctx.font = `700 ${9 * u}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("500 m", 12 * u, px - 22 * u);
  // Frame.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3 * dpr;
  ctx.strokeRect(1.5 * dpr, 1.5 * dpr, px - 3 * dpr, px - 3 * dpr);
}

// --- HUD bits -------------------------------------------------------------------------------------

/** Contract tracker under the top-left HUD. */
export function Tracker({ trade, touch }: { trade: TradeHud; touch: boolean }) {
  const lines = touch ? trade.track.slice(0, 2) : trade.track;
  if (!lines.length && !trade.waypoint) return null;
  return (
    <div className={`g-hud space-y-0.5 ${touch ? "px-1.5 py-0.5" : "px-2.5 py-1.5"}`}>
      {lines.map((l) => (
        <p key={l.id} className={`flex items-center justify-between gap-2 leading-tight ${touch ? "text-[10px]" : "text-xs"} ${l.urgent ? "animate-[cove-pulse_0.8s_ease_infinite] text-red-800" : ""}`}>
          <span className="min-w-0 truncate font-bold">{l.text}</span>
          <span className="g-muted shrink-0 tabular-nums">
            {l.dist !== null ? metres(l.dist) : ""}
            {l.left !== null ? ` · ${clock(l.left)}` : ""}
          </span>
        </p>
      ))}
      {!lines.length && trade.waypoint && (
        <p className={`flex items-center justify-between gap-2 leading-tight ${touch ? "text-[10px]" : "text-xs"}`}>
          <span className="min-w-0 truncate font-bold">➤ {trade.waypoint.label}</span>
          <span className="g-muted shrink-0 tabular-nums">{metres(trade.waypoint.dist)}</span>
        </p>
      )}
    </div>
  );
}

/** The Dock button, shown inside a harbour's gold ring. */
export function DockButton({ trade, touch, onDock }: { trade: TradeHud; touch: boolean; onDock: () => void }) {
  if (!trade.dock) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${touch ? "bottom-[calc(max(env(safe-area-inset-bottom),16px)+148px)]" : "bottom-[max(calc(env(safe-area-inset-bottom)+96px),112px)]"}`}>
      {trade.dockBlocked ? (
        <p className={`g-hud g-display text-red-800 ${touch ? "px-2.5 py-0.5 text-xs" : "px-4 py-1.5 text-base"}`}>{trade.dockBlocked}</p>
      ) : (
        <button type="button" onClick={onDock} className={`g-btn pointer-events-auto animate-[cove-banner_0.3s_ease] ${touch ? "px-3 py-1 text-sm" : "px-5 py-2 text-lg"}`}>
          <span className="g-unskew gap-2">
            <Anchor className={touch ? "size-4" : "size-5"} /> Dock at {trade.dock}
            {!touch && <Kbd>Space</Kbd>}
          </span>
        </button>
      )}
    </div>
  );
}

export function zoneTone(d: number) {
  return d < 0.12 ? "text-emerald-800" : d < 0.4 ? "" : d < 0.7 ? "text-orange-800" : "text-red-800";
}
