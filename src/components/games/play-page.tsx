import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import { Hourglass } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { gameDisplayClass, gameFontVars } from "@/lib/game-fonts";
import { modelSizes } from "@/lib/game-models";
import { gameTitle, genreTitle, type GameEntry } from "@/lib/games";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, SITE } from "@/lib/site";

/**
 * Server side of a game's full-screen player route (/games/<slug>/play/). Each game has its own
 * route file, so a page only bundles its own game.
 */

/**
 * Every play route: on phones the game fills the screen beside a notch / camera cutout too — without
 * `cover`, full screen leaves a black bar there. HUDs keep clear of it (.g-root in globals.css).
 */
export const playViewport: Viewport = {
  themeColor: SITE.themeColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export function playMetadata(game: GameEntry): Metadata {
  const credits = { authors: [{ name: SITE.author }], creator: SITE.author, publisher: SITE.brand };
  if (game.comingSoon) {
    return {
      ...pageMetadata({ title: `${game.title} — Coming Soon`, description: game.description, path: `/${game.slug}/play/` }),
      ...credits,
      robots: { index: false, follow: true },
    };
  }
  return {
    ...pageMetadata({
      title: gameTitle(game, "Play "),
      description: `${game.title} full-screen player: start playing now in your browser, on PC or phone. ${game.description}`,
      path: `/${game.slug}/play/`,
      image: { url: game.cover, alt: `${game.title} gameplay` },
      keywords: [
        game.title,
        `play ${game.title.toLowerCase()}`,
        `${game.title.toLowerCase()} online`,
        `free 3D ${genreTitle(game).toLowerCase()} game`,
        "free 3D games online",
        "free games",
        SITE.brand,
      ],
    }),
    ...credits,
  };
}

export function PlayPage({ game, Player }: { game: GameEntry; Player: ComponentType<{ sizes: Record<string, number> }> }) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "VideoGame",
          name: game.title,
          description: game.description,
          url: absoluteUrl(`/${game.slug}/`),
          image: absoluteUrl(game.cover),
          genre: game.genre,
          gamePlatform: "Web browser",
          isAccessibleForFree: true,
          author: { "@type": "Person", name: SITE.author },
          creator: { "@type": "Person", name: SITE.author },
          publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/") },
        }}
      />
      <h1 className="sr-only">{game.title}</h1>
      {/* The game's own fonts; bytes per model make the loading bar exact from the first frame. */}
      <div className={gameFontVars(game.slug)}>
        <Player sizes={modelSizes(game.models)} />
      </div>
    </>
  );
}

/** Stands in for the player while a game is still being built (its route bundles none of the game's code). */
export function ComingSoonPlay({ game }: { game: GameEntry }) {
  return (
    <div
      className={`grid min-h-dvh place-items-center bg-[#0b0b12] px-4 py-10 text-center text-white ${gameFontVars(game.slug)}`}
      style={{ backgroundImage: `radial-gradient(90% 70% at 50% 0%, ${game.accent}55, transparent 70%)` }}
    >
      <div className="max-w-md space-y-4">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: game.accent }}>
          <Hourglass className="size-4" /> Coming soon
        </p>
        <h1 className={`text-5xl sm:text-6xl ${gameDisplayClass(game.slug)}`} style={{ color: game.accent }}>
          {game.title}
        </h1>
        <p className="text-lg text-white/80">{game.tagline}</p>
        <p className="text-sm text-white/55">This game is still being built. Check back soon!</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href="/"
            className="rounded-full px-6 py-3 text-sm font-bold text-black/85 transition hover:brightness-110"
            style={{ background: game.accent }}
          >
            Play other games
          </Link>
          <Link href={`/${game.slug}/`} className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10">
            About {game.title}
          </Link>
        </div>
      </div>
    </div>
  );
}
