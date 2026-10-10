"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { FlaskConical, Shield, Sword, Tornado, Wind, type LucideIcon } from "lucide-react";
import { box, ControlLayer, ControlsEditor as Editor, createControls, type Frame, type Placed } from "../shared/touch-layout";
import { useStore, type Store } from "../shared/ui";
import type { Action, CryptKnightGame, Hud } from "./engine";

/**
 * Touch controls: a floating move stick and five action buttons, which players can move and resize
 * (Pause → Edit controls; shared/touch-layout.tsx).
 */

type ButtonId = "attack" | "block" | "roll" | "spin" | "potion";

/** An arc around the attack button under the right thumb; the stick under the left. Order = placement priority. */
const controls = createControls("crypt-knight:controls:v1", {
  attack: { label: "Attack", w: 62, x: -48, y: -52 },
  block: { label: "Block", w: 46, x: -114, y: -40 },
  roll: { label: "Roll", w: 46, x: -40, y: -118 },
  spin: { label: "Spin", w: 46, x: -118, y: -104 },
  potion: { label: "Potion", w: 40, x: -86, y: -172 },
  stick: { label: "Move stick", w: 104, x: 74, y: -78, round: true },
});

const FACES: Record<ButtonId, { look: string; Icon: LucideIcon }> = {
  attack: { look: "g-btn", Icon: Sword },
  block: { look: "g-hud", Icon: Shield },
  roll: { look: "g-hud", Icon: Wind },
  spin: { look: "g-hud", Icon: Tornado },
  potion: { look: "g-hud", Icon: FlaskConical },
};

const GLOW = "shadow-[0_0_0_1px_#c9a24a,0_0_22px_rgb(201_162_74/0.6)]";

function looks(id: ButtonId, hud: Hud) {
  return {
    dim: (id === "roll" && hud.roll < 1) || (id === "spin" && hud.charge < 1) || (id === "potion" && hud.potions <= 0),
    glow: id === "spin" && hud.charge >= 1,
  };
}

/** A button's icon, its charge rising in crimson from the bottom, and the potion count. */
function Face({ id, size, hud }: { id: ButtonId; size: number; hud: Hud }) {
  const { Icon } = FACES[id];
  const fill = id === "roll" ? hud.roll : id === "spin" ? hud.charge : 1;
  return (
    <>
      {fill < 1 && <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgb(244_63_94/0.55),rgb(127_29_29/0.7))]" style={{ height: `${Math.max(0, fill) * 100}%` }} />}
      <Icon className={`relative ${id === "potion" ? "text-[var(--accent)]" : ""}`} size={Math.round(size * 0.45)} />
      {id === "potion" && <span className="g-display absolute top-0.5 right-0.5 grid size-4 place-items-center bg-[#f8e7c0] text-[10px] text-[#3f0d0d]">{hud.potions}</span>}
    </>
  );
}

/** The move stick at rest. */
function StickFace({ size }: { size: number }) {
  return (
    <div className="grid size-full place-items-center rounded-full bg-black/25 ring-2 ring-[#c9a24a]/30">
      <div className="rounded-full bg-[#b91c1c]/50 ring-2 ring-[#c9a24a]/50" style={{ width: size * 0.375, height: size * 0.375 }} />
    </div>
  );
}

// --- Playing ----------------------------------------------------------------------------------------

export function TouchControls({ game, store }: { game: { current: CryptKnightGame | null }; store: Store<Hud> }) {
  const hud = useStore(store);
  return (
    <ControlLayer controls={controls}>
      {(placed, frame) => (
        <>
          <Stick game={game} at={placed.stick} frame={frame} />
          <TouchButton id="attack" at={placed.attack} hud={hud} onDown={tap(game, "attack")} />
          <TouchButton
            id="block"
            at={placed.block}
            hud={hud}
            onDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              game.current?.setTouchBlock(true);
            }}
            onUp={() => game.current?.setTouchBlock(false)}
          />
          <TouchButton id="roll" at={placed.roll} hud={hud} onDown={tap(game, "roll")} />
          <TouchButton id="spin" at={placed.spin} hud={hud} onDown={tap(game, "spin")} />
          <TouchButton id="potion" at={placed.potion} hud={hud} onDown={tap(game, "potion")} />
        </>
      )}
    </ControlLayer>
  );
}

const tap = (game: { current: CryptKnightGame | null }, action: Action) => (e: ReactPointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
  game.current?.press(action);
};

/** The stick rests at its spot and follows the thumb anywhere on its half of the screen. */
function Stick({ game, at, frame }: { game: { current: CryptKnightGame | null }; at: Placed; frame: Frame }) {
  const stickRef = useRef<{ id: number; x: number; y: number; bx: number; by: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  // How far the knob travels.
  const R = at.w / 2 - 14;
  const knobSize = Math.round(at.w * 0.44);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stickRef.current) return;
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
      <div className="pointer-events-auto absolute" style={stickZone(at, frame)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Move" />
      {knob ? (
        <div className="pointer-events-none absolute rounded-full bg-black/35 ring-2 ring-[#c9a24a]/50" style={{ left: knob.ox - R - 14, top: knob.oy - R - 14, width: (R + 14) * 2, height: (R + 14) * 2 }}>
          <div
            className="absolute rounded-full bg-[radial-gradient(circle_at_35%_30%,#f8e7c0,#b91c1c_60%,#7f1d1d)] ring-2 ring-[#c9a24a]"
            style={{ left: R + 14 - knobSize / 2 + knob.x, top: R + 14 - knobSize / 2 + knob.y, width: knobSize, height: knobSize }}
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute" style={box(at)}>
          <StickFace size={at.w} />
        </div>
      )}
    </>
  );
}

/** The stick's touch area: its half of the screen, from a little above its resting spot down (never over the HUD). */
function stickZone(c: Placed, f: Frame): CSSProperties {
  const hudBottom = Math.max(0, ...f.avoid.map((a) => a.b));
  return {
    left: c.x < f.w / 2 ? 0 : f.w / 2,
    width: f.w / 2,
    top: Math.max(hudBottom + 4, Math.min(f.h * 0.4, c.y - c.h / 2 - 24)),
    bottom: 0,
  };
}

function TouchButton({ id, at, hud, onDown, onUp }: { id: ButtonId; at: Placed; hud: Hud; onDown: (e: ReactPointerEvent) => void; onUp?: () => void }) {
  const { dim, glow } = looks(id, hud);
  return (
    <button
      type="button"
      aria-label={controls.defs[id].label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown(e);
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      style={box(at)}
      className={`pointer-events-auto absolute grid touch-none place-items-center overflow-hidden transition active:scale-95 ${FACES[id].look} ${dim ? "opacity-60" : ""} ${glow ? GLOW : ""}`}
    >
      <Face id={id} size={at.w} hud={hud} />
    </button>
  );
}

// --- Editor -----------------------------------------------------------------------------------------

export function ControlsEditor({ store, onClose }: { store: Store<Hud>; onClose: () => void }) {
  const hud = useStore(store);
  return (
    <Editor
      controls={controls}
      onClose={onClose}
      face={(id, p) =>
        id === "stick" ? (
          <StickFace size={p.w} />
        ) : (
          <div className={`relative grid size-full place-items-center overflow-hidden ${FACES[id].look}`}>
            <Face id={id} size={p.w} hud={hud} />
          </div>
        )
      }
    />
  );
}
