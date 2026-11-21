"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { box, ControlLayer, ControlsEditor as Editor, createControls, type Frame, type Placed } from "../shared/touch-layout";
import { IconButton, SystemButtons, useStore, type Store } from "../shared/ui";
import type { Hud, NovaStrikeGame } from "./engine";
import { MEDAL_NAMES, SECTORS, stageCode, STAGES } from "./stages";

/** In-flight HUD, banners, screen flashes, the touch controls and a few icons the menus share. */

const pad = (n: number, len: number) => String(Math.max(0, Math.floor(n))).padStart(len, "0");

/** Keyframes used by the game's overlays (scoped names). */
export function NovaStyles() {
  return (
    <style>{`
      @keyframes nova-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0.15 } }
      @keyframes nova-banner { 0% { opacity: 0; transform: scale(1.6); letter-spacing: 0.4em } 12% { opacity: 1; transform: scale(1); letter-spacing: 0.06em } 85% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes nova-flash { from { opacity: 0.55 } to { opacity: 0 } }
      @keyframes nova-white { from { opacity: 0.9 } to { opacity: 0 } }
      @keyframes nova-pulse { 0%, 100% { opacity: 0.25 } 50% { opacity: 0.7 } }
      @keyframes nova-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
      @keyframes nova-hint { 0% { opacity: 0 } 8%, 80% { opacity: 1 } 100% { opacity: 0 } }
    `}</style>
  );
}

/** Faint CRT scanlines over the whole view — the arcade-cabinet look. */
export function Scanlines() {
  return <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[repeating-linear-gradient(0deg,rgb(0_0_0/0.16)_0_1px,transparent_1px_3px)] mix-blend-multiply" />;
}

// --- Icons the menus share --------------------------------------------------------------------------

export const MEDAL_COLORS = ["#334155", "#d08a4a", "#cbd5e1", "#ffd166"];

/** A medal disc: empty ring when none, bronze / silver / gold otherwise. */
export function Medal({ tier, size = "sm", label = false }: { tier: number; size?: "xs" | "sm" | "lg"; label?: boolean }) {
  const color = MEDAL_COLORS[tier] ?? MEDAL_COLORS[0];
  const dims = size === "lg" ? "size-16 border-2" : size === "sm" ? "size-5 border-2" : "size-3.5 border";
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={tier ? `${MEDAL_NAMES[tier]} medal` : "No medal yet"}>
      <span
        className={`inline-grid shrink-0 place-items-center rounded-full ${dims}`}
        style={{ borderColor: color, background: tier ? `radial-gradient(circle at 35% 30%, #fff8, ${color} 45%, #0008)` : "transparent", boxShadow: tier ? `0 0 ${size === "lg" ? 14 : 6}px ${color}` : undefined }}
      >
        {size === "lg" && tier > 0 && <span className="g-display text-lg text-[#020617]">{["", "B", "S", "G"][tier]}</span>}
      </span>
      {label && <span className="g-muted text-[10px] uppercase">{tier ? MEDAL_NAMES[tier] : "—"}</span>}
    </span>
  );
}

/** The currency: a small gold hexagon. */
export function CreditIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={`inline-block shrink-0 ${className}`} aria-hidden>
      <path d="M6 0.5 L11 3.2 V8.8 L6 11.5 L1 8.8 V3.2 Z" fill="#ffd166" stroke="#b7791f" strokeWidth="0.8" />
      <path d="M6 3 L8.4 4.4 V7.6 L6 9 L3.6 7.6 V4.4 Z" fill="#fff3c4" />
    </svg>
  );
}

function Bar({ value, color, segments = 10, className = "" }: { value: number; color: string; segments?: number; className?: string }) {
  const lit = Math.ceil(value * segments - 0.001);
  return (
    <div className={`flex gap-[3px] ${className}`}>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-full flex-1"
          style={{
            background: i < lit ? color : "color-mix(in srgb, currentColor 14%, transparent)",
            boxShadow: i < lit ? `0 0 6px ${color}` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function ShipIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="M6 0 L8 6 L12 9 L12 11 L7 9.5 L6 12 L5 9.5 L0 11 L0 9 L4 6 Z" fill="currentColor" />
    </svg>
  );
}

function BombIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="#ff4fd8" />
      <path d="M6 3 L9 6 L6 9 L3 6 Z" fill="#ffd1f5" />
    </svg>
  );
}

// --- HUD --------------------------------------------------------------------------------------------

export function HudOverlay({ store, touch, paused, onPause }: { store: Store<Hud>; touch: boolean; paused: boolean; onPause: () => void }) {
  const hud = useStore(store);
  const stage = STAGES[hud.stage] ?? STAGES[0];
  const shieldColor = hud.shield < 0.3 ? "#ff2d55" : hud.shield < 0.6 ? "#ffd166" : "#22d3ee";
  const track = hud.boss ? <BossBar name={hud.boss.name} hp={hud.boss.hp} /> : <Progress label={`${stageCode(stage)} ${SECTORS[stage.sector].short}`} progress={hud.progress} checkpoint={hud.checkpoint} boss={stage.boss !== null} />;
  const status = (
    <div data-avoid className={`g-hud px-3 py-2 ${touch ? "w-40" : "w-64"}`}>
      <div className="flex items-center justify-between text-[10px] tracking-[0.2em]">
        <span className="g-muted">SHIELD</span>
        <span className="flex items-center gap-1.5">
          {Array.from({ length: Math.max(0, hud.lives) }, (_, i) => (
            <ShipIcon key={i} className="size-3 text-[#22d3ee]" />
          ))}
        </span>
      </div>
      <Bar value={hud.shield} color={shieldColor} className={`mt-1 ${touch ? "h-2" : "h-3"}`} />
      <div className="mt-1.5 flex items-center gap-1">
        {Array.from({ length: Math.max(0, hud.bombs) }, (_, i) => (
          <BombIcon key={i} className="size-3.5" />
        ))}
        <span className="g-muted ml-1 text-[10px] tracking-[0.15em]">
          {hud.bombs ? "" : "NO "}BOMBS{touch ? "" : " · B"}
        </span>
      </div>
      {touch && <Bar value={hud.boost} color="#a78bfa" segments={8} className="mt-1.5 h-1" />}
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] select-none">
      {/* Damage flash, bomb flash and the low-shield vignette. */}
      {hud.hurt > 0 && <div key={`h${hud.hurt}`} className="absolute inset-0 animate-[nova-flash_0.35s_ease-out_forwards] bg-[radial-gradient(ellipse_at_center,transparent_35%,#ff2d55_100%)]" />}
      {hud.bombFlash > 0 && <div key={`b${hud.bombFlash}`} className="absolute inset-0 animate-[nova-white_0.6s_ease-out_forwards] bg-white" />}
      {hud.danger && <div className="absolute inset-0 animate-[nova-pulse_0.9s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_center,transparent_55%,#ff2d5599_100%)]" />}

      {/* Top row: score (left), progress / boss (centre), system (right). */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(env(safe-area-inset-top),8px)] sm:p-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div data-avoid className="g-hud min-w-0 px-3 py-2 sm:px-4">
            <p className="g-muted text-[10px] tracking-[0.2em]">SCORE</p>
            <p className="g-display text-base leading-tight tabular-nums text-[#ecfeff] sm:text-xl">{pad(hud.score, 7)}</p>
            <div className="mt-1 flex items-center gap-2 text-xs tabular-nums">
              <span className="g-display text-[10px] text-[#f472b6] sm:text-xs">x{hud.mult}</span>
              <span className="h-1.5 w-10 bg-[color-mix(in_srgb,currentColor_14%,transparent)] sm:w-16">
                <span className="block h-full bg-[#f472b6] shadow-[0_0_6px_#f472b6]" style={{ width: `${hud.comboT * 100}%` }} />
              </span>
              <span className="inline-flex items-center gap-1 text-[#ffd166]">
                <CreditIcon className="size-3" /> {hud.credits}
              </span>
            </div>
          </div>
          {touch && status}
        </div>

        <div className="hidden min-w-0 flex-1 flex-col items-center gap-1 sm:flex land:flex">{track}</div>

        <div className="pointer-events-auto flex flex-col items-end gap-2" data-avoid>
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          {!touch && <SystemButtons vertical />}
        </div>
      </div>

      {/* Phones held upright: the progress bar gets its own row under the score. */}
      <div className="absolute inset-x-0 top-[calc(max(env(safe-area-inset-top),8px)+72px)] flex justify-end px-2 sm:hidden land:hidden">
        <div className="w-[calc(100%-176px)] min-w-32">{track}</div>
      </div>

      {/* Banner. */}
      {hud.banner && (
        <div key={hud.banner.id} className="absolute inset-x-0 top-[30%] flex justify-center px-4 text-center land:top-[24%]">
          <div className="animate-[nova-banner_2.6s_ease-out_forwards]">
            <p
              className={`g-title text-xl sm:text-4xl land:text-2xl ${hud.banner.tone === "warn" ? "animate-[nova-blink_0.5s_steps(1)_infinite] text-[#ff2d55]" : hud.banner.tone === "good" ? "text-[#5dff9b]" : ""}`}
              style={hud.banner.tone === "warn" ? { textShadow: "3px 3px 0 #000, 0 0 22px #ff2d55" } : undefined}
            >
              {hud.banner.text}
            </p>
            {hud.banner.sub && <p className="mt-3 text-sm tracking-[0.15em] text-[#a5f3fc] uppercase [text-shadow:0_0_8px_#000] sm:text-base land:mt-1.5">{hud.banner.sub}</p>}
          </div>
        </div>
      )}

      {/* Keyboard and mouse: shield / lives / bombs bottom left, boost / weapon bottom right. */}
      {!touch && <div className="absolute bottom-4 left-4">{status}</div>}
      {!touch && (
        <div className="absolute right-4 bottom-4">
          <div className="g-hud w-56 px-3 py-2">
            <div className="flex items-center justify-between text-[10px] tracking-[0.2em]">
              <span className="g-muted">BOOST</span>
              <span className={hud.laser > 1 ? "text-[#5b8cff]" : "text-[#5dff9b]"}>{hud.laser > 1 ? "TWIN LASER" : "LASER"}</span>
            </div>
            <Bar value={hud.boost} color="#a78bfa" segments={8} className="mt-1 h-2" />
            <div className="mt-1.5 flex items-center justify-between text-[10px] tracking-[0.2em]">
              <span className="g-muted">CHARGE</span>
              <span className="text-[#ff4fd8]">{hud.locks ? `LOCK ${hud.locks}/${hud.maxLocks}` : hud.charge >= 1 ? "READY" : ""}</span>
            </div>
            <Bar value={hud.charge} color={hud.charge >= 1 ? "#ff4fd8" : "#7df9ff"} segments={8} className="mt-1 h-2" />
          </div>
        </div>
      )}
    </div>
  );
}

function Progress({ label, progress, checkpoint, boss }: { label: string; progress: number; checkpoint: number; boss: boolean }) {
  return (
    <div data-avoid className="g-hud w-full max-w-sm px-3 py-1.5">
      <div className="flex items-center justify-between gap-2 text-[10px] tracking-[0.2em]">
        <span className="g-display truncate text-[9px] text-[var(--accent)]">{label.toUpperCase()}</span>
        <span className="g-muted">{boss ? "BOSS" : "END"}</span>
      </div>
      <div className="relative mt-1 h-1.5 bg-[color-mix(in_srgb,currentColor_14%,transparent)]">
        <div className="h-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" style={{ width: `${progress * 100}%` }} />
        {checkpoint > 0 && <span className="absolute -top-1 h-3.5 w-0.5 bg-[#5dff9b]" style={{ left: `${checkpoint * 100}%` }} />}
      </div>
    </div>
  );
}

function BossBar({ name, hp }: { name: string; hp: number }) {
  return (
    <div data-avoid className="g-hud w-full max-w-md border-[#ff2d55] px-3 py-1.5">
      <div className="flex items-center justify-between gap-2 text-[10px] tracking-[0.2em]">
        <span className="g-display truncate text-[9px] text-[#ff2d55]">{name.toUpperCase()}</span>
        <span className="g-muted tabular-nums">{Math.ceil(hp * 100)}%</span>
      </div>
      <div className="mt-1 h-2 bg-[color-mix(in_srgb,currentColor_14%,transparent)]">
        <div className="h-full bg-[linear-gradient(90deg,#ff2d55,#ff8a3c)] shadow-[0_0_8px_#ff2d55] transition-[width] duration-150" style={{ width: `${hp * 100}%` }} />
      </div>
    </div>
  );
}

// --- Touch controls ---------------------------------------------------------------------------------

type ButtonId = "fire" | "roll" | "boost" | "bomb";

/** The fire button under the right thumb with roll, boost and bomb around it; the stick under the left. Order = placement priority. */
const controls = createControls("nova-strike:controls:v1", {
  fire: { label: "Fire", w: 84, x: -58, y: -62, round: true },
  roll: { label: "Roll", w: 58, x: -142, y: -44, round: true },
  boost: { label: "Boost", w: 52, x: -50, y: -146, round: true },
  bomb: { label: "Bomb", w: 52, x: -126, y: -118, round: true },
  stick: { label: "Steering stick", w: 108, x: 78, y: -82, round: true },
});

/** What a button shows: its name, the bombs left, and the lock-on charge filling the fire button's ring. */
function Face({ id, hud, down = false }: { id: ButtonId; hud: Hud; down?: boolean }) {
  return (
    <span
      className={`g-hud g-display relative grid size-full place-items-center rounded-full! text-[9px] ${down ? "scale-95 bg-[var(--accent)]! text-[#020617]!" : id === "fire" ? "border-2! border-[var(--accent)]!" : ""} ${id === "bomb" && hud.bombs <= 0 ? "opacity-50" : ""}`}
    >
      {id === "fire" && (
        <>
          <span className="text-[11px]">FIRE</span>
          {hud.charge > 0 && <span className="absolute inset-1 rounded-full border-4 border-[#ff4fd8]" style={{ clipPath: `inset(${(1 - hud.charge) * 100}% 0 0 0)` }} />}
        </>
      )}
      {id === "roll" && "ROLL"}
      {id === "boost" && "BOOST"}
      {id === "bomb" && (
        <span className="flex flex-col items-center gap-0.5">
          <BombIcon className="size-4" />
          {hud.bombs}
        </span>
      )}
    </span>
  );
}

function StickFace() {
  return (
    <div className="grid size-full place-items-center rounded-full border-2 border-dashed border-[#22d3ee66] bg-[#02061733]">
      <div className="size-[38%] rounded-full bg-[#22d3ee88] shadow-[0_0_10px_#22d3ee]" />
    </div>
  );
}

function TouchButton({ id, at, hud, onChange }: { id: ButtonId; at: Placed; hud: Hud; onChange: (down: boolean) => void }) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => {
    if (v === down) return;
    setDown(v);
    onChange(v);
  };
  return (
    <button
      type="button"
      aria-label={controls.defs[id].label}
      style={box(at)}
      className="pointer-events-auto absolute touch-none rounded-full select-none"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        set(false);
      }}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Face id={id} hud={hud} down={down} />
    </button>
  );
}

/** A steering stick that follows the thumb anywhere on its half of the screen, and the action buttons. */
export function TouchControls({ game, store, hidden = false }: { game: NovaStrikeGame | null; store: Store<Hud>; hidden?: boolean }) {
  const hud = useStore(store);
  return (
    <div className="absolute inset-0 z-[3]">
      <ControlLayer controls={controls} hidden={hidden}>
        {(placed, frame) => (
          <>
            <Stick game={game} at={placed.stick} frame={frame} />
            <TouchButton id="fire" at={placed.fire} hud={hud} onChange={(d) => game?.pointerFire(d)} />
            <TouchButton id="roll" at={placed.roll} hud={hud} onChange={(d) => d && game?.touchRoll()} />
            <TouchButton id="boost" at={placed.boost} hud={hud} onChange={(d) => game?.setBoost(d)} />
            <TouchButton id="bomb" at={placed.bomb} hud={hud} onChange={(d) => d && game?.touchBomb()} />
          </>
        )}
      </ControlLayer>
    </div>
  );
}

function Stick({ game, at, frame }: { game: NovaStrikeGame | null; at: Placed; frame: Frame }) {
  const held = useRef<{ id: number; x: number; y: number; bx: number; by: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  // How far the knob travels.
  const R = at.w / 2 - 12;
  const knobSize = Math.round(at.w * 0.42);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (held.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const b = e.currentTarget.parentElement!.getBoundingClientRect();
    held.current = { id: e.pointerId, x: e.clientX, y: e.clientY, bx: b.left, by: b.top };
    setKnob({ ox: e.clientX - b.left, oy: e.clientY - b.top, x: 0, y: 0 });
    game?.setTouch({ x: 0, y: 0 });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = held.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      // The base follows the thumb when it drags past the edge.
      s.x += (dx / l) * (l - R);
      s.y += (dy / l) * (l - R);
      dx = e.clientX - s.x;
      dy = e.clientY - s.y;
    }
    game?.setTouch({ x: dx / R, y: -dy / R });
    setKnob({ ox: s.x - s.bx, oy: s.y - s.by, x: dx, y: dy });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = held.current;
    if (!s || s.id !== e.pointerId) return;
    held.current = null;
    game?.setTouch(null);
    setKnob(null);
  };

  return (
    <>
      <div className="pointer-events-auto absolute touch-none" style={stickZone(at, frame)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Steering stick" />
      {knob ? (
        <div className="pointer-events-none absolute rounded-full border-2 border-[#22d3ee99] bg-[#02061766]" style={{ left: knob.ox - R - 12, top: knob.oy - R - 12, width: (R + 12) * 2, height: (R + 12) * 2 }}>
          <div className="absolute rounded-full bg-[#22d3ee] shadow-[0_0_14px_#22d3ee]" style={{ left: R + 12 - knobSize / 2 + knob.x, top: R + 12 - knobSize / 2 + knob.y, width: knobSize, height: knobSize }} />
        </div>
      ) : (
        <div className="pointer-events-none absolute" style={box(at)}>
          <StickFace />
        </div>
      )}
    </>
  );
}

/** The stick's touch area: its half of the screen, from a little above its resting spot down (never over the HUD). */
function stickZone(c: Placed, f: Frame): CSSProperties {
  const left = c.x < f.w / 2;
  const hudBottom = Math.max(0, ...f.avoid.filter((a) => (left ? a.l < f.w / 2 : a.r > f.w / 2)).map((a) => a.b));
  return {
    left: left ? 0 : f.w / 2,
    width: f.w / 2,
    top: Math.max(hudBottom + 4, Math.min(f.h * 0.42, c.y - c.h / 2 - 24)),
    bottom: 0,
  };
}

/** Move and resize the touch controls (Pause → Edit controls, or Controls on the title screen). */
export function ControlsEditor({ store, onClose }: { store: Store<Hud>; onClose: () => void }) {
  const hud = useStore(store);
  return <Editor controls={controls} onClose={onClose} face={(id): ReactNode => (id === "stick" ? <StickFace /> : <Face id={id} hud={hud} />)} />;
}
