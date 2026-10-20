"use client";

import { useState } from "react";

type FlyingHeart = { id: number; tx: number; ty: number; rot: number; duration: number; size: number };

/** The footer's heart: outline until clicked, then filled red with a burst of 12 hearts flying up (animate-fly-up in globals.css). */
export function HeartButton() {
  const [clicked, setClicked] = useState(false);
  const [hearts, setHearts] = useState<FlyingHeart[]>([]);

  const handleClick = () => {
    setClicked(true);

    const newHearts = Array.from({ length: 12 }).map((_, i) => ({
      id: Date.now() + i,
      tx: (Math.random() - 0.5) * 100, // random x between -50px and 50px
      ty: (Math.random() - 0.5) * 100 - 40, // random y mostly upwards
      rot: (Math.random() - 0.5) * 90, // random rotation
      duration: Math.random() * 0.8 + 0.8, // 0.8s to 1.6s
      size: Math.random() * 10 + 8, // 8px to 18px
    }));

    setHearts((prev) => [...prev, ...newHearts]);

    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !newHearts.some((n) => n.id === h.id)));
    }, 1600);
  };

  return (
    <span className="relative inline-flex items-center justify-center">
      <button
        type="button"
        onClick={handleClick}
        className={`relative z-10 transition-colors ${clicked ? "text-red-500" : "text-muted hover:text-red-500"}`}
        aria-label="love"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 transition-colors"
          style={clicked ? { fill: "currentColor" } : { fill: "none" }}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      </button>

      {/* Flying hearts */}
      {hearts.map((h) => (
        <span
          key={h.id}
          className="pointer-events-none absolute top-1/2 left-1/2 animate-fly-up text-red-500"
          style={
            {
              fontSize: `${h.size}px`,
              animationDuration: `${h.duration}s`,
              "--tx": `${h.tx}px`,
              "--ty": `${h.ty}px`,
              "--r": `${h.rot}deg`,
            } as React.CSSProperties
          }
        >
          ❤️
        </span>
      ))}
    </span>
  );
}
