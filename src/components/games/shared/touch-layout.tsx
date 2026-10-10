"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { Gamepad2, Minus, Plus, RotateCcw } from "lucide-react";
import { inPlayables } from "./playables";
import { createRecords, useRecords, useTouchScreen } from "./ui";

/**
 * Movable touch controls. A game declares its on-screen controls (size and default spot) with
 * createControls, draws them inside <ControlLayer> at the places it hands back, and offers
 * <ControlsEditor> (Pause → Edit controls, or Controls on the title screen), where players drag and
 * resize them. A `fit` control (a tool bar) takes the size of its content, scaled. Layouts are kept per
 * orientation in this browser. Wherever they are put, no two controls overlap and none covers the
 * HUD (elements marked `data-avoid`): each one settles on the nearest free spot.
 */

type Orient = "portrait" | "landscape";
/**
 * A control's centre in px from the nearest edges of the safe area — x ≥ 0 from the left, x < 0 from
 * the right (or, with `c`, from the centre), y likewise from the top / bottom — so it keeps its place
 * on any screen size. `s` scales it.
 */
type Spot = { x: number; y: number; s: number; c?: 1 };
type Size = { w: number; h: number };
type Rect = { l: number; t: number; r: number; b: number };
/** The layer's size, its safe area and the HUD boxes to keep clear of — px from its top-left. */
export type Frame = { w: number; h: number; orient: Orient; safe: Rect; avoid: Rect[] };
/** A control on screen: centre and size in px. */
export type Placed = { x: number; y: number; w: number; h: number };
type Taken = { x: number; y: number; hx: number; hy: number }[];

export type ControlDef = {
  label: string;
  /** Size at 100% in px; the height defaults to the width. */
  w: number;
  h?: number;
  /** Default centre, in Spot terms (negative = from the right / bottom). */
  x: number;
  y: number;
  /** The default x is measured from the centre of the screen. */
  center?: boolean;
  /** Round controls get a round outline in the editor. */
  round?: boolean;
  /** Sized by its content (drawn with the `fit` helper); w / h are only the first guess. */
  fit?: boolean;
};

/** Space kept between controls, and between a control and the HUD. */
const GAP = 10;
/** Space kept from the screen edges. */
const EDGE = 8;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.6;
/** The editor's panel (Reset / Cancel / Save), about. */
const PANEL = { w: 244, h: 112 };

/** Declares a game's touch controls; their order is the placement priority (later ones give way). */
export function createControls<Id extends string>(key: string, defs: Record<Id, ControlDef>) {
  const order = Object.keys(defs) as Id[];
  const defaults = Object.fromEntries(order.map((id) => [id, { x: defs[id].x, y: defs[id].y, s: 1, ...(defs[id].center ? { c: 1 } : {}) }])) as Record<Id, Spot>;
  // YouTube Playables: nothing in the browser's storage, so a moved layout lasts for the session only.
  const cloud = inPlayables() ? () => {} : undefined;
  return { defs, order, defaults, records: createRecords<Record<Orient, Partial<Record<Id, Spot>> | null>>(key, { portrait: null, landscape: null }, { cloud }) };
}

export type Controls<Id extends string> = ReturnType<typeof createControls<Id>>;

/** Inline position and size for a placed control. */
export const box = (c: Placed): CSSProperties => ({ left: c.x - c.w / 2, top: c.y - c.h / 2, width: c.w, height: c.h });

// --- Layout -----------------------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A saved layout with anything missing or broken taken from the defaults. */
function layoutFor<Id extends string>(c: Controls<Id>, saved: Partial<Record<Id, Spot>> | null | undefined): Record<Id, Spot> {
  const out = { ...c.defaults };
  for (const id of c.order) {
    const s = saved?.[id];
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.s)) out[id] = { x: s.x, y: s.y, s: clamp(s.s, MIN_SCALE, MAX_SCALE), ...(s.c ? { c: 1 } : {}) };
  }
  return out;
}

/** A control's size at scale `s`: a fit control's measured content size, else its declared one — never bigger than the screen allows. */
function sizeOf(d: ControlDef, s: number, natural?: Size, f?: Frame) {
  const base = d.fit && natural ? natural : { w: d.w, h: d.h ?? d.w };
  const room = f ? Math.min(1, (f.safe.r - f.safe.l - EDGE * 2) / (base.w * s), (f.safe.b - f.safe.t - EDGE * 2) / (base.h * s)) : 1;
  return { w: Math.round(base.w * s * room), h: Math.round(base.h * s * room) };
}

/** Where a spot lands on this screen. */
function fromSpot(s: Spot, f: Frame) {
  const x = s.c ? (f.safe.l + f.safe.r) / 2 + s.x : s.x >= 0 ? f.safe.l + s.x : f.safe.r + s.x;
  return { x, y: s.y >= 0 ? f.safe.t + s.y : f.safe.b + s.y };
}

/** The spot for a centre at (x, y), measured from whichever edges are nearer (or the centre, near the middle). */
function toSpot(x: number, y: number, s: number, f: Frame): Spot {
  const mid = (f.safe.l + f.safe.r) / 2;
  const top = y < (f.safe.t + f.safe.b) / 2;
  const sy = top ? Math.round(y - f.safe.t) : -Math.max(1, Math.round(f.safe.b - y));
  if (Math.abs(x - mid) < (f.safe.r - f.safe.l) * 0.12) return { x: Math.round(x - mid), y: sy, s, c: 1 };
  return { x: x < mid ? Math.round(x - f.safe.l) : -Math.max(1, Math.round(f.safe.r - x)), y: sy, s };
}

/** True when a control of half-size hx × hy centred at (x, y) would touch the HUD or one of `taken`. */
function blocked(x: number, y: number, hx: number, hy: number, f: Frame, taken: Taken, gap = GAP) {
  for (const t of taken) if (Math.abs(x - t.x) < hx + t.hx + gap && Math.abs(y - t.y) < hy + t.hy + gap) return true;
  return f.avoid.some((a) => x + hx + gap > a.l && x - hx - gap < a.r && y + hy + gap > a.t && y - hy - gap < a.b);
}

/** The nearest free spot to (x, y): inside the safe area, clear of the HUD and of `taken`. */
function settle(x: number, y: number, hx: number, hy: number, f: Frame, taken: Taken) {
  const lo = { x: f.safe.l + EDGE + hx, y: f.safe.t + EDGE + hy };
  const hi = { x: f.safe.r - EDGE - hx, y: f.safe.b - EDGE - hy };
  // Bigger than the screen: centre it.
  if (lo.x > hi.x || lo.y > hi.y) return { x: (f.safe.l + f.safe.r) / 2, y: (f.safe.t + f.safe.b) / 2 };
  const cx = clamp(x, lo.x, hi.x);
  const cy = clamp(y, lo.y, hi.y);
  // A pixel of slack, so a saved spot (rounded to whole px) still counts as free.
  if (!blocked(cx, cy, hx, hy, f, taken, GAP - 1)) return { x: cx, y: cy };
  // Search rings of growing radius around it.
  const far = Math.hypot(f.w, f.h);
  for (let r = 4; r < far; r += 4) {
    const n = Math.ceil((Math.PI * 2 * r) / 6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (px >= lo.x && px <= hi.x && py >= lo.y && py <= hi.y && !blocked(px, py, hx, hy, f, taken)) return { x: px, y: py };
    }
  }
  // No room anywhere: leave it.
  return { x: cx, y: cy };
}

/** Every listed control's place on this screen, in placement order. */
function resolve<Id extends string>(c: Controls<Id>, layout: Record<Id, Spot>, f: Frame, ids: readonly Id[], natural: Partial<Record<Id, Size>>) {
  const out = {} as Record<Id, Placed>;
  const taken: Taken = [];
  for (const id of c.order) {
    if (!ids.includes(id)) continue;
    const { w, h } = sizeOf(c.defs[id], layout[id].s, natural[id], f);
    const want = fromSpot(layout[id], f);
    const p = settle(want.x, want.y, w / 2, h / 2, f, taken);
    out[id] = { x: p.x, y: p.y, w, h };
    taken.push({ x: p.x, y: p.y, hx: w / 2, hy: h / 2 });
  }
  return out;
}

/** Measures the layer, its safe area (the `data-safe` child) and the game's `data-avoid` boxes, and keeps them current. */
function useFrame(layer: RefObject<HTMLDivElement | null>) {
  const [frame, setFrame] = useState<Frame | null>(null);
  useLayoutEffect(() => {
    const el = layer.current;
    const root = el?.closest(".g-root") ?? el?.parentElement;
    const probe = el?.querySelector<HTMLElement>("[data-safe]");
    if (!el || !root || !probe) return;
    const avoidEls = [...root.querySelectorAll<HTMLElement>("[data-avoid]")];
    const measure = () => {
      const box = el.getBoundingClientRect();
      const rel = (r: DOMRect): Rect => ({ l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top });
      const next: Frame = {
        w: box.width,
        h: box.height,
        orient: box.width > box.height ? "landscape" : "portrait",
        safe: rel(probe.getBoundingClientRect()),
        avoid: avoidEls.map((a) => rel(a.getBoundingClientRect())).filter((r) => r.r > r.l && r.b > r.t),
      };
      setFrame((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    avoidEls.forEach((a) => ro.observe(a));
    return () => ro.disconnect();
  }, [layer]);
  return frame;
}

/** The measured content sizes of fit controls, reported by FitContent. */
function useNatural<Id extends string>() {
  const [natural, setNatural] = useState<Partial<Record<Id, Size>>>({});
  const report = useCallback((id: Id, n: Size) => setNatural((m) => (m[id] && m[id].w === n.w && m[id].h === n.h ? m : { ...m, [id]: n })), []);
  return [natural, report] as const;
}

/** Draws a fit control's content at its own size, scaled to fill the placed box (its positioned parent), and reports that size. */
function FitContent<Id extends string>({ id, at, natural, report, children }: { id: Id; at: Placed; natural?: Size; report: (id: Id, n: Size) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => report(id, { w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, report]);
  const scale = natural ? Math.min(at.w / natural.w, at.h / natural.h) : 1;
  return (
    <div ref={ref} className="absolute top-1/2 left-1/2 w-max" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
      {children}
    </div>
  );
}

/** Style for something that sits just above a placed control (a hint over a tool bar). */
export const above = (c: Placed, gap = 8): CSSProperties => ({ left: c.x, top: c.y - c.h / 2 - gap, transform: "translate(-50%, -100%)" });

// --- Playing ----------------------------------------------------------------------------------------

/**
 * A full-screen layer that places the controls: `children` gets each listed control's place (only
 * those in `active`, default all) and draws them — give each element `pointer-events-auto absolute`
 * and `style={box(placed[id])}`, or wrap a fit control's content in `fit(id, content)`.
 * `hidden` hides them (while the editor shows its own copies).
 */
export function ControlLayer<Id extends string>({
  controls,
  active,
  hidden = false,
  children,
}: {
  controls: Controls<Id>;
  active?: readonly Id[];
  hidden?: boolean;
  children: (placed: Record<Id, Placed>, frame: Frame, fit: (id: Id, content: ReactNode) => ReactNode) => ReactNode;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const frame = useFrame(layerRef);
  const saved = useRecords(controls.records);
  const [natural, report] = useNatural<Id>();
  const ids = (active ?? controls.order).join(",");
  const placed = useMemo(
    () => frame && resolve(controls, layoutFor(controls, saved[frame.orient]), frame, ids.split(",") as Id[], natural),
    [controls, frame, saved, ids, natural],
  );
  const fit = (id: Id, content: ReactNode) =>
    placed?.[id] && (
      <div key={id} className="pointer-events-auto absolute" style={box(placed[id])}>
        <FitContent id={id} at={placed[id]} natural={natural[id]} report={report}>
          {content}
        </FitContent>
      </div>
    );
  return (
    <div ref={layerRef} data-bleed className={`pointer-events-none absolute inset-0 touch-none select-none ${hidden ? "invisible" : ""}`}>
      <div data-safe className="g-safe" />
      {frame && placed && children(placed, frame, fit)}
    </div>
  );
}

// --- Editor -----------------------------------------------------------------------------------------

/** Opens the controls editor from a title screen (pass it to SystemButtons); touch screens only. */
export function ControlsButton({ onClick }: { onClick: () => void }) {
  const touch = useTouchScreen();
  if (!touch) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      title="Move and resize the touch controls"
      className="g-hud g-display inline-flex h-11 items-center gap-1.5 px-3 text-xs transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-[var(--accent)] pointer-coarse:h-8 pointer-coarse:px-2.5"
    >
      <Gamepad2 className="size-4" /> Controls
    </button>
  );
}

/**
 * Drag the controls where you want them and resize them; Save keeps the layout for this orientation.
 * `face` draws a control's look (filling its box) for the preview.
 */
export function ControlsEditor<Id extends string>({
  controls,
  active,
  face,
  onClose,
}: {
  controls: Controls<Id>;
  active?: readonly Id[];
  face: (id: Id, p: Placed) => ReactNode;
  onClose: () => void;
}) {
  const saved = useRecords(controls.records);
  const layerRef = useRef<HTMLDivElement>(null);
  const frame = useFrame(layerRef);
  const orient = frame?.orient ?? "portrait";
  const key = (active ?? controls.order).join(",");
  const ids = useMemo(() => key.split(",") as Id[], [key]);
  const base = useMemo(() => layoutFor(controls, saved[orient]), [controls, saved, orient]);
  // Edits per orientation: turning the phone mid-edit keeps both.
  const [drafts, setDrafts] = useState<Partial<Record<Orient, Record<Id, Spot>>>>({});
  const layout = drafts[orient] ?? base;
  const [natural, report] = useNatural<Id>();
  const placed = useMemo(() => frame && resolve(controls, layout, frame, ids, natural), [controls, frame, layout, ids, natural]);
  const [selected, setSelected] = useState<Id | null>(null);
  const [drag, setDrag] = useState<{ id: Id; pointer: number; dx: number; dy: number; x: number; y: number } | null>(null);

  const others = (id: Id): Taken => (placed ? ids.filter((o) => o !== id).map((o) => ({ x: placed[o].x, y: placed[o].y, hx: placed[o].w / 2, hy: placed[o].h / 2 })) : []);

  /** Writes a layout where every listed control stays exactly where it is now, except those in `moved`. */
  const commit = (moved: Partial<Record<Id, { x: number; y: number; s: number }>>) => {
    if (!frame || !placed) return;
    const next = { ...layout };
    for (const o of ids) {
      const m = moved[o];
      next[o] = m ? toSpot(m.x, m.y, m.s, frame) : toSpot(placed[o].x, placed[o].y, layout[o].s, frame);
    }
    setDrafts((d) => ({ ...d, [frame.orient]: next }));
  };

  const local = (e: ReactPointerEvent) => {
    const r = layerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const grab = (id: Id) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!placed || drag) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    setSelected(id);
    setDrag({ id, pointer: e.pointerId, dx: placed[id].x - p.x, dy: placed[id].y - p.y, x: placed[id].x, y: placed[id].y });
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer || !frame || !placed) return;
    const p = local(e);
    const { w, h } = placed[drag.id];
    const { safe } = frame;
    setDrag({ ...drag, x: clamp(p.x + drag.dx, safe.l + EDGE + w / 2, safe.r - EDGE - w / 2), y: clamp(p.y + drag.dy, safe.t + EDGE + h / 2, safe.b - EDGE - h / 2) });
  };

  /** A dropped control moves to the nearest free spot; the rest stay put. */
  const onDrop = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer || !frame || !placed) return;
    const { id, x, y } = drag;
    setDrag(null);
    if (x === placed[id].x && y === placed[id].y) return;
    const p = settle(x, y, placed[id].w / 2, placed[id].h / 2, frame, others(id));
    commit({ [id]: { ...p, s: layout[id].s } } as Partial<Record<Id, { x: number; y: number; s: number }>>);
  };

  /** Resizes the selected control where it stands; neighbours in the way step aside to their nearest free spot. */
  const resize = (step: number) => {
    if (!selected || !frame || !placed) return;
    const s = Math.round(clamp(layout[selected].s + step, MIN_SCALE, MAX_SCALE) * 10) / 10;
    const { w, h } = sizeOf(controls.defs[selected], s, natural[selected], frame);
    const me = settle(placed[selected].x, placed[selected].y, w / 2, h / 2, frame, []);
    const taken: Taken = [{ x: me.x, y: me.y, hx: w / 2, hy: h / 2 }];
    const moved = { [selected]: { ...me, s } } as Partial<Record<Id, { x: number; y: number; s: number }>>;
    for (const o of controls.order) {
      if (o === selected || !ids.includes(o)) continue;
      const p = settle(placed[o].x, placed[o].y, placed[o].w / 2, placed[o].h / 2, frame, taken);
      taken.push({ x: p.x, y: p.y, hx: placed[o].w / 2, hy: placed[o].h / 2 });
      moved[o] = { ...p, s: layout[o].s };
    }
    commit(moved);
  };

  const save = () => {
    const patch: Partial<Record<Orient, Partial<Record<Id, Spot>> | null>> = {};
    for (const o of Object.keys(drafts) as Orient[]) patch[o] = drafts[o] === controls.defaults ? null : drafts[o];
    controls.records.set(patch);
    onClose();
  };

  const scale = selected ? layout[selected].s : 1;

  // The editor's own panel sits where no control is: the middle, else under the HUD, else the bottom or top.
  const panelY = useMemo(() => {
    if (!frame || !placed) return null;
    const cx = (frame.safe.l + frame.safe.r) / 2;
    const hudBottom = Math.max(frame.safe.t, ...frame.avoid.map((a) => a.b));
    const ys = [frame.h / 2, hudBottom + EDGE + PANEL.h / 2, frame.safe.b - EDGE - PANEL.h / 2, frame.safe.t + EDGE + PANEL.h / 2];
    const free = (y: number) => !ids.some((o) => Math.abs(placed[o].x - cx) < (placed[o].w + PANEL.w) / 2 && Math.abs(placed[o].y - y) < (placed[o].h + PANEL.h) / 2);
    return ys.find(free) ?? frame.h / 2;
  }, [frame, placed, ids]);

  return (
    <div
      ref={layerRef}
      data-bleed
      className="absolute inset-0 z-30 touch-none bg-black/35 select-none"
      onPointerDown={(e) => {
        e.stopPropagation();
        setSelected(null);
      }}
      onPointerMove={onMove}
      onPointerUp={onDrop}
      onPointerCancel={onDrop}
    >
      <div data-safe className="g-safe" />
      {/* The HUD: controls keep clear of these. */}
      {frame?.avoid.map((a, i) => (
        <div key={i} className="pointer-events-none absolute border border-dashed border-[#f43f5e]/60 bg-[#f43f5e]/10" style={{ left: a.l - 2, top: a.t - 2, width: a.r - a.l + 4, height: a.b - a.t + 4 }} />
      ))}

      <div
        role="dialog"
        aria-label="Edit controls"
        className="g-panel absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 p-2.5 text-center"
        style={{ width: PANEL.w, top: panelY ?? "50%" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="g-display text-[11px] text-[var(--accent)]">Edit controls</p>
        <p className="g-muted mt-0.5 text-[10px] font-semibold">Drag to move · tap one to resize</p>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <Tool onClick={() => resize(-0.1)} disabled={!selected || scale <= MIN_SCALE} label="Smaller">
            <Minus className="size-3.5" />
          </Tool>
          <span className="g-display w-28 truncate text-[11px] tabular-nums">{selected ? `${controls.defs[selected].label} ${Math.round(scale * 100)}%` : "Size"}</span>
          <Tool onClick={() => resize(0.1)} disabled={!selected || scale >= MAX_SCALE} label="Bigger">
            <Plus className="size-3.5" />
          </Tool>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Tool
            onClick={() => {
              setDrafts((d) => ({ ...d, [orient]: controls.defaults }));
              setSelected(null);
            }}
          >
            <RotateCcw className="size-3" /> Reset
          </Tool>
          <Tool onClick={onClose}>Cancel</Tool>
          <Tool onClick={save} primary>
            Save
          </Tool>
        </div>
      </div>

      {frame &&
        placed &&
        ids.map((id) => {
          const live = drag?.id === id;
          const at = live ? { ...placed[id], x: drag.x, y: drag.y } : placed[id];
          const clash = live && blocked(at.x, at.y, at.w / 2, at.h / 2, frame, others(id), GAP - 1);
          const ring = clash ? "outline-2 outline-[#ef4444]" : selected === id ? "outline-2 outline-[#f8e7c0]" : "outline-1 outline-dashed outline-white/70";
          return (
            <div
              key={id}
              role="button"
              aria-label={`Move ${controls.defs[id].label}`}
              onPointerDown={grab(id)}
              style={box(at)}
              className={`absolute touch-none outline-offset-4 ${ring} ${controls.defs[id].round ? "rounded-full" : ""} ${live ? "z-30" : ""}`}
            >
              {controls.defs[id].fit ? (
                // A copy of a tool bar: shown, not used.
                <div className="pointer-events-none [&_*]:pointer-events-none!">
                  <FitContent id={id} at={at} natural={natural[id]} report={report}>
                    {face(id, at)}
                  </FitContent>
                </div>
              ) : (
                face(id, at)
              )}
            </div>
          );
        })}
    </div>
  );
}

function Tool({ onClick, children, primary = false, disabled = false, label }: { onClick: () => void; children: ReactNode; primary?: boolean; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${primary ? "g-btn" : "g-soft"} g-display flex h-8 min-w-8 items-center justify-center px-2 text-[11px] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40`}
    >
      <span className="g-unskew gap-1">{children}</span>
    </button>
  );
}
