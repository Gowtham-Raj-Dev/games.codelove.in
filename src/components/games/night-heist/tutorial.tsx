"use client";

import { useEffect, useRef, useState } from "react";
import { useStore, type Store } from "../shared/ui";
import type { Hud } from "./engine";

/**
 * Hints that walk a new player through the first heist, one at a time and each once, at the moment they
 * matter (not all up front). Driven only by the HUD numbers, so it never touches the game itself.
 */
interface Step {
  id: string;
  /** After this many seconds of the heist the hint can show (0: at once). */
  after?: number;
  when?: (h: Hud) => boolean;
  text: (touch: boolean) => string;
  /** Seconds on screen. */
  for: number;
}

const STEPS: Step[] = [
  { id: "move", text: (t) => (t ? "Drag the stick to move. Follow the yellow arrow on the floor to the Scarab Emerald." : "Move with WASD or the arrow keys. Follow the yellow arrow on the floor to the Scarab Emerald."), for: 8 },
  { id: "sneak", after: 9, when: (h) => h.loot === 0, text: (t) => (t ? "Tap Sneak to creep. Sneaking is slow but quiet." : "Hold Shift to sneak. Sneaking is slow but quiet."), for: 6 },
  { id: "light", when: (h) => h.light > 0.6, text: () => "You are standing in the light. Guards spot you far more easily here. Keep to the shadows.", for: 6 },
  { id: "susp", when: (h) => h.suspicion > 0.18, text: () => "The bar at the top fills when a guard sees you. Break line of sight and it drains.", for: 6 },
  { id: "take", when: (h) => !!h.prompt && h.loot === 0, text: (t) => (t ? "Tap the use button to take it." : "Press E to take it."), for: 4 },
  { id: "loot", when: (h) => h.loot >= 1 && !h.gem, text: () => "Nice! Loot is cash. Grab all of it for the third star.", for: 5 },
  { id: "coin", after: 20, when: (h) => h.coins > 0 && !h.gem, text: (t) => (t ? "Tap the floor to throw a coin. Guards go to check the noise." : "Click the floor to throw a coin. Guards go to check the noise."), for: 6 },
  { id: "gem", when: (h) => h.gem, text: () => "Got it! Now get out. Follow the green arrow to the exit.", for: 7 },
];

export function Tutorial({ store, touch, runKey }: { store: Store<Hud | null>; touch: boolean; runKey: number }) {
  const hud = useStore(store);
  const [now, setNow] = useState<{ id: string; text: string } | null>(null);
  const seen = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new run starts the walk-through again (it stops for good once the heist is won).
  useEffect(() => {
    seen.current = new Set();
    setNow(null);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runKey]);

  useEffect(() => {
    if (!hud || hud.overview) return;
    const step = STEPS.find((s) => !seen.current.has(s.id) && hud.time >= (s.after ?? 0) && (s.when ? s.when(hud) : true));
    if (!step) return;
    seen.current.add(step.id);
    setNow({ id: step.id, text: step.text(touch) });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNow(null), step.for * 1000);
  }, [hud, touch]);

  if (!now) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),96px)] flex justify-center px-4 land:bottom-4">
      <p key={now.id} role="status" className="g-hud g-display max-w-lg animate-[game-fade_0.3s_ease] px-4 py-2 text-center text-sm">
        {now.text}
      </p>
    </div>
  );
}
