"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { IconButton, SystemButtons, useStore, type Store } from "../shared/ui";
import type { Hud, NovaStrikeGame } from "./engine";
import { STAGES } from "./stages";

/** In-flight HUD, banners, screen flashes and the touch controls. */

const pad = (n: number, len: number) => String(Math.max(0, Math.floor(n))).padStart(len, "0");

/** Keyframes used by the HUD (scoped names). */
export function NovaStyles() {
  return (
    <style>{`
      @keyframes nova-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0.15 } }
      @keyframes nova-banner { 0% { opacity: 0; transform: scale(1.6); letter-spacing: 0.4em } 12% { opacity: 1; transform: scale(1); letter-spacing: 0.06em } 85% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes nova-flash { from { opacity: 0.55 } to { opacity: 0 } }
      @keyframes nova-white { from { opacity: 0.9 } to { opacity: 0 } }
      @keyframes nova-pulse { 0%, 100% { opacity: 0.25 } 50% { opacity: 0.7 } }
      @keyframes nova-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
    `}</style>
  );
}

/** Faint CRT scanlines over the whole view — the arcade-cabinet look. */
export function Scanlines() {
  return <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[repeating-linear-gradient(0deg,rgb(0_0_0/0.16)_0_1px,transparent_1px_3px)] mix-blend-multiply" />;
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

export function HudOverlay({ store, touch, paused, onPause }: { store: Store<Hud>; touch: boolean; paused: boolean; onPause: () => void }) {
  const hud = useStore(store);
  const stage = STAGES[hud.stage];
  const shieldColor = hud.shield < 0.3 ? "#ff2d55" : hud.shield < 0.6 ? "#ffd166" : "#22d3ee";
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] select-none">
      {/* Damage flash, bomb flash and the low-shield vignette. */}
      {hud.hurt > 0 && <div key={`h${hud.hurt}`} className="absolute inset-0 animate-[nova-flash_0.35s_ease-out_forwards] bg-[radial-gradient(ellipse_at_center,transparent_35%,#ff2d55_100%)]" />}
      {hud.bombFlash > 0 && <div key={`b${hud.bombFlash}`} className="absolute inset-0 animate-[nova-white_0.6s_ease-out_forwards] bg-white" />}
      {hud.danger && <div className="absolute inset-0 animate-[nova-pulse_0.9s_ease-in-out_infinite] bg-[radial-gradient(ellipse_at_center,transparent_55%,#ff2d5599_100%)]" />}

      {/* Top row: score (left), progress / boss (centre), system (right). */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(env(safe-area-inset-top),8px)] sm:p-4">
        <div className="g-hud min-w-0 px-3 py-2 sm:px-4">
          <p className="g-muted text-[10px] tracking-[0.2em]">SCORE</p>
          <p className="g-display text-base leading-tight tabular-nums text-[#ecfeff] sm:text-xl">{pad(hud.score, 7)}</p>
          <div className="mt-1 flex items-center gap-2 text-xs tabular-nums">
            <span className="g-display text-[10px] text-[#f472b6] sm:text-xs">x{hud.mult}</span>
            <span className="h-1.5 w-14 bg-[color-mix(in_srgb,currentColor_14%,transparent)] sm:w-20">
              <span className="block h-full bg-[#f472b6] shadow-[0_0_6px_#f472b6]" style={{ width: `${hud.comboT * 100}%` }} />
            </span>
            <span className="opacity-80">HITS {pad(hud.hits, 3)}</span>
          </div>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col items-center gap-1 ${touch ? "hidden" : ""}`}>
          {hud.boss ? <BossBar name={hud.boss.name} hp={hud.boss.hp} /> : <Progress label={stage?.short ?? ""} progress={hud.progress} checkpoint={hud.checkpoint} stage={hud.stage} />}
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <IconButton onClick={onPause} label={paused ? "Resume (Esc)" : "Pause (Esc)"}>
            {paused ? <Play className="size-5 fill-current" /> : <Pause className="size-5 fill-current" />}
          </IconButton>
          {!touch && <SystemButtons vertical />}
        </div>
      </div>

      {touch && (
        <div className="absolute inset-x-2 top-[calc(max(env(safe-area-inset-top),8px)+84px)] flex flex-col items-center gap-1">
          {hud.boss ? <BossBar name={hud.boss.name} hp={hud.boss.hp} /> : <Progress label={stage?.short ?? ""} progress={hud.progress} checkpoint={hud.checkpoint} stage={hud.stage} />}
        </div>
      )}

      {/* Banner. */}
      {hud.banner && (
        <div key={hud.banner.id} className="absolute inset-x-0 top-[30%] flex justify-center px-4 text-center">
          <div className="animate-[nova-banner_2.6s_ease-out_forwards]">
            <p
              className={`g-title text-xl sm:text-4xl ${hud.banner.tone === "warn" ? "animate-[nova-blink_0.5s_steps(1)_infinite] text-[#ff2d55]" : hud.banner.tone === "good" ? "text-[#5dff9b]" : ""}`}
              style={hud.banner.tone === "warn" ? { textShadow: "3px 3px 0 #000, 0 0 22px #ff2d55" } : undefined}
            >
              {hud.banner.text}
            </p>
            {hud.banner.sub && <p className="mt-3 text-sm tracking-[0.15em] text-[#a5f3fc] uppercase [text-shadow:0_0_8px_#000] sm:text-base">{hud.banner.sub}</p>}
          </div>
        </div>
      )}

      {/* Bottom: shield / lives / bombs (left) and boost / weapon (right). */}
      <div className={`absolute flex flex-col gap-1.5 ${touch ? "top-[calc(max(env(safe-area-inset-top),8px)+112px)] left-2" : "bottom-4 left-4"}`}>
        <div className={`g-hud px-3 py-2 ${touch ? "w-40" : "w-64"}`}>
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
            {Array.from({ length: hud.bombs }, (_, i) => (
              <BombIcon key={i} className="size-3.5" />
            ))}
            <span className="g-muted ml-1 text-[10px] tracking-[0.15em]">{hud.bombs ? "" : "NO "}BOMBS{touch ? "" : " · B"}</span>
          </div>
        </div>
      </div>

      {!touch && (
        <div className="absolute right-4 bottom-4 flex flex-col items-end gap-1.5">
          <div className="g-hud w-56 px-3 py-2">
            <div className="flex items-center justify-between text-[10px] tracking-[0.2em]">
              <span className="g-muted">BOOST</span>
              <span className={hud.laser > 1 ? "text-[#5b8cff]" : "text-[#5dff9b]"}>{hud.laser > 1 ? "TWIN LASER" : "LASER"}</span>
            </div>
            <Bar value={hud.boost} color="#a78bfa" segments={8} className="mt-1 h-2" />
            <div className="mt-1.5 flex items-center justify-between text-[10px] tracking-[0.2em]">
              <span className="g-muted">CHARGE</span>
              <span className="text-[#ff4fd8]">{hud.locks ? `LOCK ${hud.locks}/4` : hud.charge >= 1 ? "READY" : ""}</span>
            </div>
            <Bar value={hud.charge} color={hud.charge >= 1 ? "#ff4fd8" : "#7df9ff"} segments={8} className="mt-1 h-2" />
          </div>
        </div>
      )}
    </div>
  );
}

function Progress({ label, progress, checkpoint, stage }: { label: string; progress: number; checkpoint: number; stage: number }) {
  return (
    <div className="g-hud w-full max-w-sm px-3 py-1.5">
      <div className="flex items-center justify-between text-[10px] tracking-[0.2em]">
        <span className="g-display text-[9px] text-[var(--accent)]">
          {stage + 1}-{label.toUpperCase()}
        </span>
        <span className="g-muted">BOSS</span>
      </div>
      <div className="relative mt-1 h-1.5 bg-[color-mix(in_srgb,currentColor_14%,transparent)]">
        <div className="h-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" style={{ width: `${progress * 100}%` }} />
        <span className="absolute -top-1 h-3.5 w-0.5 bg-[#5dff9b]" style={{ left: `${checkpoint * 100}%` }} />
      </div>
    </div>
  );
}

function BossBar({ name, hp }: { name: string; hp: number }) {
  return (
    <div className="g-hud w-full max-w-md border-[#ff2d55] px-3 py-1.5">
      <div className="flex items-center justify-between text-[10px] tracking-[0.2em]">
        <span className="g-display text-[9px] text-[#ff2d55]">{name.toUpperCase()}</span>
        <span className="g-muted tabular-nums">{Math.ceil(hp * 100)}%</span>
      </div>
      <div className="mt-1 h-2 bg-[color-mix(in_srgb,currentColor_14%,transparent)]">
        <div className="h-full bg-[linear-gradient(90deg,#ff2d55,#ff8a3c)] shadow-[0_0_8px_#ff2d55] transition-[width] duration-150" style={{ width: `${hp * 100}%` }} />
      </div>
    </div>
  );
}

// --- Touch controls ---------------------------------------------------------------------------------

function HoldButton({ label, onChange, className = "", children, accent = false }: { label: string; onChange: (down: boolean) => void; className?: string; children: ReactNode; accent?: boolean }) {
  const [down, setDown] = useState(false);
  const set = (v: boolean) => {
    setDown(v);
    onChange(v);
  };
  return (
    <button
      type="button"
      aria-label={label}
      className={`g-hud g-display pointer-events-auto grid touch-none place-items-center rounded-full! text-[9px] select-none ${down ? "scale-95 bg-[var(--accent)]! text-[#020617]!" : accent ? "border-2! border-[var(--accent)]!" : ""} ${className}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        set(false);
      }}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => down && set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** Left-thumb floating stick (anywhere on the left half) and right-thumb buttons. */
export function TouchControls({ game, store }: { game: NovaStrikeGame | null; store: Store<Hud> }) {
  const hud = useStore(store);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const id = useRef<number | null>(null);
  const R = 52;
  useEffect(() => () => game?.setTouch(null), [game]);
  const move = (e: ReactPointerEvent, base: { x: number; y: number }) => {
    let dx = e.clientX - base.x;
    let dy = e.clientY - base.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setStick({ ...base, dx, dy });
    game?.setTouch({ x: dx / R, y: -dy / R });
  };
  const end = () => {
    id.current = null;
    setStick(null);
    game?.setTouch(null);
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] select-none">
      <div
        className="pointer-events-auto absolute bottom-0 left-0 h-[55%] w-1/2 touch-none"
        onPointerDown={(e) => {
          e.stopPropagation();
          if (id.current !== null) return;
          id.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          const base = { x: e.clientX, y: e.clientY };
          setStick({ ...base, dx: 0, dy: 0 });
          game?.setTouch({ x: 0, y: 0 });
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== id.current || !stick) return;
          move(e, stick);
        }}
        onPointerUp={(e) => e.pointerId === id.current && end()}
        onPointerCancel={(e) => e.pointerId === id.current && end()}
        aria-label="Steering stick"
      >
        {!stick && (
          <div className="absolute bottom-[max(env(safe-area-inset-bottom),28px)] left-8 grid size-28 place-items-center rounded-full border-2 border-dashed border-[#22d3ee66] text-center text-[10px] tracking-[0.15em] text-[#a5f3fc99]">
            DRAG
            <br />
            TO FLY
          </div>
        )}
      </div>
      {stick && (
        <div className="pointer-events-none fixed" style={{ left: stick.x - R, top: stick.y - R, width: R * 2, height: R * 2 }}>
          <div className="absolute inset-0 rounded-full border-2 border-[#22d3ee99] bg-[#02061766]" />
          <div className="absolute size-12 rounded-full bg-[#22d3ee] shadow-[0_0_14px_#22d3ee]" style={{ left: R - 24 + stick.dx, top: R - 24 + stick.dy }} />
        </div>
      )}
      <div className="absolute right-3 bottom-[max(env(safe-area-inset-bottom),18px)] grid grid-cols-[auto_auto] items-end gap-3">
        <div className="flex flex-col items-center gap-3">
          <HoldButton label="Nova bomb" className="size-14" onChange={(d) => d && game?.touchBomb()}>
            <span className="flex flex-col items-center gap-0.5">
              <BombIcon className="size-4" />
              {hud.bombs}
            </span>
          </HoldButton>
          <HoldButton label="Boost" className="size-14" onChange={(d) => game?.setBoost(d)}>
            BOOST
          </HoldButton>
        </div>
        <div className="flex flex-col items-center gap-3">
          <HoldButton label="Barrel roll" className="size-16" onChange={(d) => d && game?.touchRoll()}>
            ROLL
          </HoldButton>
          <HoldButton label="Fire (hold to charge)" accent className="relative size-24 text-[11px]" onChange={(d) => game?.pointerFire(d)}>
            <span>FIRE</span>
            {hud.charge > 0 && (
              <span className="absolute inset-1 rounded-full border-4 border-[#ff4fd8]" style={{ clipPath: `inset(${(1 - hud.charge) * 100}% 0 0 0)` }} />
            )}
          </HoldButton>
        </div>
      </div>
    </div>
  );
}

