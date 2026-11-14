"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Footprints, Hand, Zap } from "lucide-react";
import { box, ControlLayer, ControlsEditor as Editor, createControls, type Frame, type Placed } from "../shared/touch-layout";
import { useStore, type Store } from "../shared/ui";
import type { Hud, NightHeistGame } from "./engine";
import { GadgetIcon } from "./screens";

/**
 * Touch controls: a floating move stick and the Use, Sneak, Run and Gadget buttons, which players can
 * move and resize (Pause → Edit controls; shared/touch-layout.tsx). A tap anywhere else on the floor
 * throws a coin there (the game's canvas takes it).
 */

type ButtonId = "use" | "sneak" | "run" | "gadget";

/** An arc around the Use button under the right thumb; the stick under the left. Order = placement priority. */
const controls = createControls("night-heist:controls:v1", {
  use: { label: "Use", w: 70, x: -52, y: -56 },
  sneak: { label: "Sneak", w: 52, x: -124, y: -44 },
  run: { label: "Run", w: 52, x: -44, y: -130 },
  gadget: { label: "Gadget", w: 46, x: -120, y: -112 },
  stick: { label: "Move stick", w: 108, x: 76, y: -80, round: true },
});

type Game = { current: NightHeistGame | null };

function Face({ id, size, hud }: { id: ButtonId; size: number; hud: Hud | null }) {
  const icon = Math.round(size * 0.4);
  if (id === "use") {
    return (
      <>
        <Hand size={icon} />
        <span className="g-display text-[10px] leading-none">Use</span>
      </>
    );
  }
  if (id === "sneak") {
    return (
      <>
        <Footprints size={icon} />
        <span className="g-display text-[9px] leading-none">{hud?.sneakLock ? "Sneak on" : "Sneak"}</span>
      </>
    );
  }
  if (id === "run") {
    return (
      <>
        <Zap size={icon} />
        <span className="g-display text-[9px] leading-none">Run</span>
      </>
    );
  }
  return (
    <>
      <GadgetIcon id={hud?.gadget ?? "smoke"} className="size-5" />
      <span className="g-display text-[9px] leading-none tabular-nums">{hud?.charges ?? 0}</span>
    </>
  );
}

const look = (id: ButtonId, hud: Hud | null) =>
  `${id === "use" ? "g-btn" : "g-hud"} ${id === "sneak" && hud?.sneakLock ? "!border-[#93c5fd] !bg-[#1e3a8a]/80" : ""} ${id === "use" && !hud?.prompt ? "opacity-70" : ""} ${id === "gadget" && !hud?.charges ? "opacity-50" : ""}`;

/** The buttons that matter right now: the gadget only when one with uses is equipped. */
const active = (hud: Hud | null): ("stick" | ButtonId)[] => (hud?.gadget && hud.gadget !== "lockpick" ? ["use", "sneak", "run", "gadget", "stick"] : ["use", "sneak", "run", "stick"]);

export function TouchControls({ game, store }: { game: Game; store: Store<Hud | null> }) {
  const hud = useStore(store);
  return (
    <ControlLayer controls={controls} active={active(hud)}>
      {(placed, frame) => (
        <>
          <Stick game={game} at={placed.stick} frame={frame} />
          <TouchButton id="use" at={placed.use} hud={hud} onDown={() => game.current?.use()} />
          <TouchButton id="sneak" at={placed.sneak} hud={hud} onDown={() => game.current?.toggleSneak()} />
          <TouchButton id="run" at={placed.run} hud={hud} onDown={() => game.current?.setRun(true)} onUp={() => game.current?.setRun(false)} />
          {placed.gadget && <TouchButton id="gadget" at={placed.gadget} hud={hud} onDown={() => game.current?.gadget()} />}
        </>
      )}
    </ControlLayer>
  );
}

/** The stick rests at its spot and follows the thumb anywhere in the lower corner of its side of the screen. */
function Stick({ game, at, frame }: { game: Game; at: Placed; frame: Frame }) {
  const stickRef = useRef<{ id: number; x: number; y: number; bx: number; by: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const R = at.w / 2 - 14;
  const knobSize = Math.round(at.w * 0.44);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickRef.current) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const b = e.currentTarget.parentElement!.getBoundingClientRect();
    stickRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, bx: b.left, by: b.top };
    setKnob({ ox: e.clientX - b.left, oy: e.clientY - b.top, x: 0, y: 0 });
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
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
    game.current?.setStick(dx / R, -dy / R);
    setKnob({ ox: s.x - s.bx, oy: s.y - s.by, x: dx, y: dy });
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stickRef.current;
    if (!s || s.id !== e.pointerId) return;
    stickRef.current = null;
    game.current?.setStick(0, 0);
    setKnob(null);
  };

  return (
    <>
      <div className="pointer-events-auto absolute touch-none" style={stickZone(at, frame)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Move" />
      {knob ? (
        <div className="pointer-events-none absolute rounded-full bg-black/40 ring-2 ring-[#f87171]/40" style={{ left: knob.ox - R - 14, top: knob.oy - R - 14, width: (R + 14) * 2, height: (R + 14) * 2 }}>
          <div className="absolute rounded-full bg-[radial-gradient(circle_at_35%_30%,#f5f0e1,#a8956b_70%)] ring-2 ring-black/60" style={{ left: R + 14 - knobSize / 2 + knob.x, top: R + 14 - knobSize / 2 + knob.y, width: knobSize, height: knobSize }} />
        </div>
      ) : (
        <div className="pointer-events-none absolute" style={box(at)}>
          <StickFace size={at.w} />
        </div>
      )}
    </>
  );
}

function StickFace({ size }: { size: number }) {
  return (
    <div className="grid size-full place-items-center rounded-full bg-black/30 ring-2 ring-[#f87171]/25">
      <div className="rounded-full bg-[#ecdfbf]/45 ring-2 ring-black/40" style={{ width: size * 0.375, height: size * 0.375 }} />
    </div>
  );
}

/** The stick's touch area: the lower part of its half of the screen (the rest of the floor is for throwing coins). */
function stickZone(c: Placed, f: Frame): CSSProperties {
  const hudBottom = Math.max(0, ...f.avoid.map((a) => a.b));
  const left = c.x < f.w / 2;
  return {
    left: left ? 0 : f.w * 0.55,
    width: f.w * 0.45,
    top: Math.max(hudBottom + 4, f.h * 0.5, c.y - c.h / 2 - 90),
    bottom: 0,
  };
}

function TouchButton({ id, at, hud, onDown, onUp }: { id: ButtonId; at: Placed; hud: Hud | null; onDown: () => void; onUp?: () => void }) {
  return (
    <button
      type="button"
      aria-label={controls.defs[id].label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      style={box(at)}
      className={`pointer-events-auto absolute flex touch-none flex-col items-center justify-center gap-0.5 overflow-hidden transition active:scale-95 ${look(id, hud)}`}
    >
      <Face id={id} size={at.w} hud={hud} />
    </button>
  );
}

// --- Editor -----------------------------------------------------------------------------------------

export function ControlsEditor({ store, onClose }: { store: Store<Hud | null>; onClose: () => void }) {
  const hud = useStore(store);
  const face = (id: "stick" | ButtonId, p: Placed): ReactNode =>
    id === "stick" ? (
      <StickFace size={p.w} />
    ) : (
      <div className={`relative flex size-full flex-col items-center justify-center gap-0.5 overflow-hidden ${look(id, hud)}`}>
        <Face id={id} size={p.w} hud={hud} />
      </div>
    );
  return <Editor controls={controls} onClose={onClose} face={face} />;
}
