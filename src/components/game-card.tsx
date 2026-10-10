import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowUpRight, Gamepad2, Hourglass, Play, Smartphone } from "lucide-react";
import { GameCardPreview } from "@/components/game-card-preview";
import { asset } from "@/lib/asset";
import { gameDisplayClass } from "@/lib/game-fonts";
import type { GameEntry } from "@/lib/games";

/** Stand-in for the cover of a game that is still being built: its title on an accent glow. */
export function ComingSoonArt({ game, titleClass = "text-3xl" }: { game: GameEntry; titleClass?: string }) {
  return (
    <div
      className="absolute inset-0 grid place-items-center bg-[#0b0b12]"
      style={{
        backgroundImage: `radial-gradient(110% 85% at 50% 0%, ${game.accent}66, transparent 70%), radial-gradient(70% 60% at 50% 120%, ${game.accent}33, transparent 70%)`,
      }}
    >
      <span className={`px-6 text-center text-white/90 drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)] ${titleClass} ${gameDisplayClass(game.slug)}`}>
        {game.title}
      </span>
    </div>
  );
}

/** A game in the /games grid: cover, genre, title, tagline — opens the game's details page. */
export function GameCard({ game, modelCount, priority = false, android = false }: { game: GameEntry; modelCount: number; priority?: boolean; android?: boolean }) {
  return (
    <Link
      href={`/${game.slug}/`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_24px_60px_-24px_var(--glow)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ "--glow": `${game.accent}99` } as CSSProperties}
    >
      <div className="relative aspect-[1200/630] overflow-hidden bg-elevated">
        {game.comingSoon ? (
          <ComingSoonArt game={game} />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset(game.cover)}
              alt={`${game.title} gameplay`}
              width={1200}
              height={630}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
            {game.preview && <GameCardPreview src={asset(game.preview)} />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          </>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
          <Gamepad2 className="size-3.5" /> {game.genre}
        </span>
        {android && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
            <Smartphone className="size-3.5" /> Android app
          </span>
        )}
        {game.comingSoon ? (
          <span
            className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-black/80 shadow-lg shadow-black/40"
            style={{ background: game.accent }}
          >
            <Hourglass className="size-3.5" /> Coming soon
          </span>
        ) : (
          <span
            className="absolute right-3 bottom-3 grid size-11 place-items-center rounded-full text-black/80 shadow-lg shadow-black/40 transition duration-300 group-hover:scale-110"
            style={{ background: game.accent }}
          >
            <Play className="size-5 translate-x-px fill-current" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-line px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className={`text-xl text-fg ${gameDisplayClass(game.slug)}`}>{game.title}</h2>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-subtle transition group-hover:text-fg" />
        </div>
        <p className="text-sm leading-relaxed text-muted">{game.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {game.features.slice(0, 2).map((f) => (
            <span key={f} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-subtle">
              {f}
            </span>
          ))}
        </div>
        <p className="mt-auto pt-3 text-xs text-subtle">
          {modelCount > 0 ? `${modelCount} library models` : "Library models"} · {game.collections.slice(0, 2).join(" · ")}
          {game.collections.length > 2 ? " …" : ""}
        </p>
      </div>
    </Link>
  );
}
