import Link from "next/link";
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
      className="pop pop-lift group relative flex flex-col overflow-hidden rounded-2xl bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07]"
            />
            {game.preview && <GameCardPreview src={asset(game.preview)} />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
          </>
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border-2 border-fg bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-fg">
          <Gamepad2 className="size-3.5" /> {game.genre}
        </span>
        {android && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border-2 border-fg bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-fg">
            <Smartphone className="size-3.5" /> Android app
          </span>
        )}
        {game.comingSoon ? (
          <span
            className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border-2 border-fg px-3 py-1 text-xs font-bold text-ink shadow-[0_3px_0_var(--color-fg)]"
            style={{ background: game.accent }}
          >
            <Hourglass className="size-3.5" /> Coming soon
          </span>
        ) : (
          <span
            className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border-2 border-fg py-1.5 pr-4 pl-3.5 font-display text-sm font-bold tracking-wide text-ink uppercase shadow-[0_4px_0_var(--color-fg)] transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-105"
            style={{ background: game.accent }}
          >
            <Play className="size-4 fill-current" /> Play
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t-2 border-fg px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className={`text-xl text-fg ${gameDisplayClass(game.slug)}`}>{game.title}</h3>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-subtle transition duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" />
        </div>
        <p className="text-sm leading-relaxed text-muted">{game.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {game.features.slice(0, 2).map((f) => (
            <span key={f} className="rounded-full border border-line bg-elevated/60 px-2 py-0.5 text-[11px] font-medium text-muted">
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
