"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { asset } from "@/lib/asset";
import type { GameEntry } from "@/lib/games";

// Safari's prefixed full screen APIs (iPhone can only show a <video> full screen, with its own player).
type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type LockableOrientation = ScreenOrientation & { lock?: (to: "landscape") => Promise<void> };

const fullscreenElement = () => document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;

/**
 * A game's trailer in the hero of its page: plays muted and on a loop while it is on screen (never on
 * its own for people who prefer reduced motion). Sound and full screen restart it from the top with
 * the voice-over the first time; full screen also switches to the 1080p file and turns phones sideways.
 */
export function GameTrailer({ game, playHref }: { game: GameEntry & { trailer: NonNullable<GameEntry["trailer"]> }; playHref: string }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [full, setFull] = useState(false);
  /** The viewer paused it: don't restart it when it scrolls back into view. */
  const held = useRef(false);
  /** Sound has been turned on once (the first time restarts the trailer so the voice-over plays whole). */
  const heard = useRef(false);
  const { trailer } = game;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    // React sets `muted` as a property after the HTML loads; browsers only autoplay muted video.
    v.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) held.current = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !held.current) void v.play().catch(() => {});
        else if (!entry.isIntersecting && !fullscreenElement()) v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    const onFullscreen = () => setFull(!!box.current && fullscreenElement() === box.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    return () => {
      io.disconnect();
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
    };
  }, []);

  const play = (v: HTMLVideoElement) => {
    held.current = false;
    void v.play().catch(() => {});
  };

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) play(v);
    else {
      held.current = true;
      v.pause();
    }
  };

  const soundOn = (v: HTMLVideoElement) => {
    v.muted = false;
    setMuted(false);
    if (!heard.current) {
      heard.current = true;
      v.currentTime = 0;
    }
    play(v);
  };

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    if (v.muted) soundOn(v);
    else {
      v.muted = true;
      setMuted(true);
    }
  };

  /** Full screen shows the 1080p file: switch to it where the smaller one is playing, keeping the place. */
  const sharpen = (v: HTMLVideoElement) => {
    if (!trailer.hd || v.currentSrc.endsWith(trailer.hd)) return;
    const at = v.currentTime;
    v.src = asset(trailer.hd);
    v.addEventListener(
      "loadedmetadata",
      () => {
        v.currentTime = at;
        play(v);
      },
      { once: true },
    );
  };

  const toggleFullscreen = () => {
    const v = video.current as WebkitVideo | null;
    const el = box.current as WebkitElement | null;
    if (!v || !el) return;
    if (fullscreenElement()) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
      else (document as WebkitDocument).webkitExitFullscreen?.();
      return;
    }
    // Ask first, while this still counts as the tap (browsers refuse full screen later).
    if (el.requestFullscreen) {
      void el
        .requestFullscreen({ navigationUI: "hide" })
        .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape"))
        .catch(() => {});
    } else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else v.webkitEnterFullscreen?.();
    soundOn(v);
    sharpen(v);
  };

  const glass = "rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const control = `grid size-9 place-items-center ${glass}`;

  return (
    <div
      ref={box}
      className={`group relative aspect-video overflow-hidden ${full ? "bg-black" : "rounded-3xl border border-line bg-elevated"}`}
    >
      {/* The 720p file in the page (it is only ~700 px wide); full screen switches to the 1080p 60 fps one. */}
      <video
        ref={video}
        src={asset(trailer.src)}
        poster={asset(trailer.poster)}
        muted
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        aria-label={`${game.title} gameplay trailer`}
        className={`absolute inset-0 h-full w-full cursor-pointer ${full ? "object-contain" : "object-cover"}`}
      />
      {!playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play the trailer"
          className="absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-black/80 shadow-2xl shadow-black/50 transition duration-300 hover:scale-110"
          style={{ background: game.accent }}
        >
          <Play className="size-8 translate-x-0.5 fill-current" />
        </button>
      )}
      {/* Top right and bottom right: the trailer's own captions sit top left and bottom left. */}
      <div className="absolute top-3 right-3 flex gap-2 sm:top-4 sm:right-4">
        <button type="button" onClick={toggle} aria-label={playing ? "Pause the trailer" : "Play the trailer"} className={control}>
          {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
        </button>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Turn the sound on" : "Turn the sound off"}
          className={muted ? `flex h-9 items-center gap-1.5 px-3 text-xs font-semibold ${glass}` : control}
        >
          {muted ? (
            <>
              <VolumeX className="size-4" /> Sound
            </>
          ) : (
            <Volume2 className="size-4" />
          )}
        </button>
        <button type="button" onClick={toggleFullscreen} aria-label={full ? "Exit full screen" : "Full screen"} className={control}>
          {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </button>
      </div>
      <Link
        href={playHref}
        className={`absolute right-3 bottom-3 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-black/85 shadow-lg shadow-black/30 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:right-4 sm:bottom-4 ${
          full ? "inline-flex" : "hidden sm:inline-flex"
        }`}
        style={{ background: game.accent }}
      >
        <Play className="size-4 fill-current" /> Play now
      </Link>
    </div>
  );
}
