"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A game's muted gameplay loop over its cover in the /games grid. It downloads and plays only while
 * the card is on screen and fades in once it is really playing (the cover shows until then); never for
 * people who prefer reduced motion or have data saver on.
 */
export function GameCardPreview({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // React sets `muted` as a property after the HTML loads; browsers only autoplay muted video.
    v.muted = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={video}
      src={src}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
      className={`absolute inset-0 h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04] ${playing ? "opacity-100" : "opacity-0"}`}
    />
  );
}
