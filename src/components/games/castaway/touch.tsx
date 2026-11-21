"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Apple, BookOpen, Check, Hand, RotateCw, Sword, X, type LucideIcon } from "lucide-react";
import { audio } from "../shared/audio";
import { box, ControlLayer, ControlsEditor as Editor, createControls, type Frame, type Placed } from "../shared/touch-layout";
import { useStore, type Store } from "../shared/ui";
import type { CastawayGame, Hud } from "./engine";

/**
 * Touch controls: a floating move stick, the big action button, and two small ones that are "eat"
 * and "journal" — or "rotate" and "cancel" while a building is being placed. Players can move and
 * resize them (Pause → Edit controls; shared/touch-layout.tsx).
 */

type ButtonId = "action" | "eat" | "book";

/** The action button under the right thumb, its two helpers around it; the stick under the left. Order = placement priority. */
const controls = createControls("castaway:controls:v1", {
  action: { label: "Action", w: 78, x: -54, y: -124 },
  eat: { label: "Eat / rotate", w: 52, x: -128, y: -106 },
  book: { label: "Journal / cancel", w: 52, x: -48, y: -200 },
  stick: { label: "Move stick", w: 112, x: 78, y: -138, round: true },
});

function face(id: ButtonId, hud: Hud): { Icon: LucideIcon; look: string; dim: boolean; label: string } {
  if (id === "action") {
    const fight = hud.danger > 0 && !!hud.prompt?.text.startsWith("Attack");
    return { Icon: hud.placing ? Check : fight ? Sword : Hand, look: "g-btn", dim: false, label: hud.placing ? "Place" : "Action" };
  }
  if (id === "eat") return hud.placing ? { Icon: RotateCw, look: "g-hud", dim: false, label: "Rotate" } : { Icon: Apple, look: "g-hud", dim: !hud.foods.length, label: "Eat" };
  return hud.placing ? { Icon: X, look: "g-hud", dim: false, label: "Cancel building" } : { Icon: BookOpen, look: "g-hud", dim: false, label: "Crafting journal" };
}

/** The move stick at rest. */
function StickFace({ size }: { size: number }) {
  return (
    <div className="grid size-full place-items-center rounded-full border-2 border-dashed border-[#fff7ed]/45 bg-black/20">
      <div className="rounded-full border-2 border-[#2b2118]/70 bg-[var(--accent)]/60" style={{ width: size * 0.4, height: size * 0.4 }} />
    </div>
  );
}

// --- Playing ----------------------------------------------------------------------------------------

export function TouchControls({ game, store }: { game: { current: CastawayGame | null }; store: Store<Hud> }) {
  const hud = useStore(store);
  const placing = !!hud.placing;
  return (
    <ControlLayer controls={controls}>
      {(placed, frame) => (
        <>
          <Stick game={game} at={placed.stick} frame={frame} />
          <TouchButton id="action" at={placed.action} hud={hud} onDown={() => game.current?.press(true)} onUp={() => game.current?.press(false)} />
          <TouchButton id="eat" at={placed.eat} hud={hud} onDown={() => (placing ? game.current?.rotatePlacing() : game.current?.eat())} />
          <TouchButton id="book" at={placed.book} hud={hud} onDown={() => (placing ? game.current?.cancelPlacing() : game.current?.openBook())} />
        </>
      )}
    </ControlLayer>
  );
}

/** The stick rests at its spot and follows the thumb anywhere on its half of the screen. */
function Stick({ game, at, frame }: { game: { current: CastawayGame | null }; at: Placed; frame: Frame }) {
  const stickRef = useRef<{ id: number; x: number; y: number; bx: number; by: number } | null>(null);
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  // How far the knob travels.
  const R = at.w / 2 - 12;
  const knobSize = Math.round(at.w * 0.46);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
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
      <div className="pointer-events-auto absolute touch-none" style={stickZone(at, frame)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-label="Move" />
      {knob ? (
        <div className="pointer-events-none absolute rounded-full border-2 border-dashed border-[#fff7ed]/60 bg-black/25" style={{ left: knob.ox - R - 12, top: knob.oy - R - 12, width: (R + 12) * 2, height: (R + 12) * 2 }}>
          <div
            className="absolute rounded-full border-2 border-[#2b2118] bg-[var(--accent)] shadow-[2px_3px_0_#2b2118]"
            style={{ left: R + 12 - knobSize / 2 + knob.x, top: R + 12 - knobSize / 2 + knob.y, width: knobSize, height: knobSize }}
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

/** The stick's touch area: its half of the screen, from a little above its resting spot down to the hotbar (never over the HUD). */
function stickZone(c: Placed, f: Frame): CSSProperties {
  const left = c.x < f.w / 2;
  const mine = (a: { l: number; r: number }) => (left ? a.l < f.w / 2 : a.r > f.w / 2);
  // HUD boxes in the top half push the zone down; the hotbar (bottom) ends it.
  const top = Math.max(0, ...f.avoid.filter((a) => mine(a) && a.t < f.h * 0.45).map((a) => a.b));
  const bottom = Math.min(f.h, ...f.avoid.filter((a) => mine(a) && a.t > f.h * 0.6).map((a) => a.t));
  return {
    left: left ? 0 : f.w / 2,
    width: f.w / 2,
    top: Math.max(top + 4, Math.min(f.h * 0.42, c.y - c.h / 2 - 24)),
    height: Math.max(40, bottom - Math.max(top + 4, Math.min(f.h * 0.42, c.y - c.h / 2 - 24)) - 2),
  };
}

function TouchButton({ id, at, hud, onDown, onUp }: { id: ButtonId; at: Placed; hud: Hud; onDown: () => void; onUp?: () => void }) {
  const { Icon, look, dim, label } = face(id, hud);
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        audio.unlock();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      style={box(at)}
      className={`pointer-events-auto absolute grid touch-none place-items-center transition active:scale-95 ${look} ${dim ? "opacity-60" : ""}`}
    >
      <span className="g-unskew">
        <Icon size={Math.round(at.w * 0.44)} />
      </span>
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
      face={(id, p) => {
        if (id === "stick") return <StickFace size={p.w} />;
        const { Icon, look } = face(id, hud);
        return (
          <div className={`grid size-full place-items-center ${look}`}>
            <span className="g-unskew">
              <Icon size={Math.round(p.w * 0.44)} />
            </span>
          </div>
        );
      }}
    />
  );
}
