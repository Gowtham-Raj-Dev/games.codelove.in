import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, Gamepad2, Hourglass, Keyboard, ListChecks, Music, Play, Smartphone } from "lucide-react";
import { ComingSoonArt, GameCard } from "@/components/game-card";
import { GameTrailer } from "@/components/game-trailer";
import { JsonLd } from "@/components/json-ld";
import { asset } from "@/lib/asset";
import { androidApp } from "@/lib/game-apps";
import { formatBytes, formatNumber } from "@/lib/catalog";
import { gameDisplayClass } from "@/lib/game-fonts";
import { gameDownloadBytes, gameModels } from "@/lib/game-models";
import { GAME_BUTTONS, GAME_SHORTCUTS, games, genreTitle, getGame } from "@/lib/games";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, GAME_CREDIT, MODELS_SITE, modelsUrl, SITE } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return games.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) return {};
  const credits = { authors: [{ name: SITE.author }], creator: SITE.author, publisher: SITE.brand };
  if (game.comingSoon) {
    return {
      ...pageMetadata({ title: `${game.title} — Coming Soon`, description: game.description, path: `/${game.slug}/` }),
      ...credits,
      robots: { index: false, follow: true },
    };
  }
  const name = game.title.toLowerCase();
  const genre = genreTitle(game).toLowerCase();
  const app = androidApp(game.slug);
  return {
    ...pageMetadata({
      title: `${game.title} — Free 3D ${genreTitle(game)} Game Online`,
      description: `Play ${game.title} free online — no ads, no download. ${game.description} ${GAME_CREDIT}.`,
      path: `/${game.slug}/`,
      image: { url: game.cover, alt: `${game.title} gameplay` },
      keywords: [
        game.title,
        `${name} game`,
        `play ${name} online`,
        `${name} free`,
        ...(app ? [`${name} apk`, `${name} android`] : []),
        `free 3D ${genre} game`,
        `free ${genre} game`,
        `${genre} game online`,
        "free 3D games online",
        "free 3D games",
        "3D games",
        "free games",
        "free games online",
        "ad-free games",
        "free games without ads",
        "free online games no download",
        `${SITE.author} games`,
        SITE.brand,
        ...game.collections,
      ],
    }),
    ...credits,
  };
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-md border border-line-strong border-b-2 bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-fg">{children}</kbd>;
}

function Steps({ lines, accent, className = "" }: { lines: string[]; accent: string; className?: string }) {
  return (
    <ol className={`mt-5 space-y-3 ${className}`}>
      {lines.map((line, i) => (
        <li key={line} className="flex gap-3 text-sm leading-relaxed text-muted">
          <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-black/80" style={{ background: accent }}>
            {i + 1}
          </span>
          {line}
        </li>
      ))}
    </ol>
  );
}

export default async function GameDetailsPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();
  const models = gameModels(game);
  const bytes = gameDownloadBytes(game);
  const packs = [...new Map(models.map((m) => [m.collectionKey, m.collection])).entries()];
  const withThumbs = models.filter((m) => m.thumb);
  const shown = withThumbs.slice(0, 48);
  const others = games.filter((g) => g.slug !== game.slug && !g.comingSoon).slice(0, 3);
  const playHref = `/${game.slug}/play/`;
  const soon = game.comingSoon === true;
  const app = soon ? null : androidApp(game.slug);
  const trailer = soon ? null : game.trailer;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">
      <JsonLd
        data={[
          ...(soon
            ? []
            : [
                {
                  "@context": "https://schema.org",
                  "@type": "VideoGame",
                  name: game.title,
                  description: game.description,
                  url: absoluteUrl(`/${game.slug}/`),
                  image: absoluteUrl(game.cover),
                  genre: game.genre,
                  gamePlatform: app ? ["Web browser", "Android"] : "Web browser",
                  applicationCategory: "Game",
                  operatingSystem: app ? "Any (browser), Android (app)" : "Any",
                  playMode: "SinglePlayer",
                  isAccessibleForFree: true,
                  offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
                  author: { "@type": "Person", name: SITE.author },
                  creator: { "@type": "Person", name: SITE.author },
                  publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/") },
                  ...(trailer ? { trailer: { "@id": absoluteUrl(trailer.src) } } : {}),
                },
              ]),
          ...(trailer
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "VideoObject",
                  "@id": absoluteUrl(trailer.src),
                  name: `${game.title} — gameplay trailer`,
                  description: `${game.tagline} ${game.description}`,
                  thumbnailUrl: absoluteUrl(trailer.poster),
                  contentUrl: absoluteUrl(trailer.hd ?? trailer.src),
                  uploadDate: "2026-10-07",
                  duration: `PT${trailer.seconds}S`,
                  author: { "@type": "Person", name: SITE.author },
                  publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/") },
                },
              ]
            : []),
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Games", item: absoluteUrl("/") },
              { "@type": "ListItem", position: 2, name: game.title, item: absoluteUrl(`/${game.slug}/`) },
            ],
          },
        ]}
      />

      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-sm text-subtle">
        <Link href="/" className="hover:text-fg">
          Games
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-muted">{game.title}</span>
      </nav>

      {/* Hero: cover beside the title, tagline and play/download buttons; the longer copy sits below. */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-center">
        {soon ? (
          <div className="relative aspect-[1200/630] overflow-hidden rounded-3xl border border-line">
            <ComingSoonArt game={game} titleClass="text-5xl sm:text-7xl" />
          </div>
        ) : trailer ? (
          <GameTrailer game={{ ...game, trailer }} playHref={playHref} />
        ) : (
          <Link
            href={playHref}
            className="group relative block aspect-[1200/630] overflow-hidden rounded-3xl border border-line bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset(game.cover)}
              alt={`${game.title} gameplay`}
              width={1200}
              height={630}
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent transition group-hover:from-black/60" />
            <span
              className="absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-black/80 shadow-2xl shadow-black/50 transition duration-300 group-hover:scale-110"
              style={{ background: game.accent }}
            >
              <Play className="size-8 translate-x-0.5 fill-current" />
            </span>
          </Link>
        )}

        <div className="space-y-4">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] uppercase" style={{ color: game.accent }}>
            <Gamepad2 className="size-4" /> {game.genre}
          </p>
          <h1 className={`text-4xl sm:text-6xl ${gameDisplayClass(game.slug)}`} style={{ color: game.accent }}>
            {game.title}
          </h1>
          <p className="text-lg font-medium text-fg">{game.tagline}</p>
          <p className="text-sm text-muted">
            Created by <span className="font-medium text-fg">{SITE.author}</span> · Published by{" "}
            <Link href="/" className="font-medium text-fg hover:underline">
              {SITE.brand}
            </Link>
          </p>
          {soon ? (
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 text-base font-bold"
                style={{ borderColor: game.accent, color: game.accent }}
              >
                <Hourglass className="size-5" /> Coming soon
              </span>
              <span className="text-sm text-subtle">Still being built — check back soon.</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={playHref}
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-black/85 shadow-lg shadow-black/30 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{ background: game.accent }}
              >
                <Play className="size-5 fill-current" /> Play now — free
              </Link>
              {app ? (
                <a
                  href={asset(app.apk)}
                  download={`${game.slug}-${app.version}.apk`}
                  type="application/vnd.android.package-archive"
                  className="inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 text-base font-bold transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  style={{ borderColor: game.accent, color: game.accent }}
                >
                  <Download className="size-5" /> Download for Android
                </a>
              ) : (
                <span className="text-sm text-subtle">No download · no sign-up</span>
              )}
            </div>
          )}
          {app && (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl text-black/80" style={{ background: game.accent }}>
                  <Smartphone className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg">{game.title} for Android</p>
                  <p className="text-xs text-subtle">
                    v{app.version} · {formatBytes(app.bytes)} APK · Android {app.minAndroid}+ · landscape, full screen · plays offline
                  </p>
                </div>
              </div>
              <details className="group mt-3 text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted hover:text-fg">
                  <ChevronRight className="size-3.5 transition group-open:rotate-90" /> How to install
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-9 text-xs leading-relaxed text-muted">
                  <li>Tap “Download for Android” on your phone (or copy the APK to it).</li>
                  <li>Open the downloaded file. If Android asks, allow your browser to “Install unknown apps”.</li>
                  <li>Tap Install, then open {game.title} from your home screen. It always plays in landscape and keeps your village on the phone.</li>
                </ol>
                <p className="mt-2 pl-4 font-mono text-[10px] break-all text-subtle">SHA-256 {app.sha256}</p>
              </details>
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section className="mt-8 space-y-4">
        <p className="leading-relaxed text-muted">{game.description}</p>
        <ul className="flex flex-wrap gap-2 text-xs text-muted">
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5">
            <Keyboard className="size-3.5" /> Keyboard & mouse
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5">
            <Smartphone className="size-3.5" /> {app ? "Touch screens · Android app" : "Touch screens"}
          </li>
          <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5">
            <Music className="size-3.5" /> Music: “{game.music}”
          </li>
          {bytes > 0 && !soon && (
            <li className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5">
              <Download className="size-3.5" /> {formatBytes(bytes)} of models
            </li>
          )}
        </ul>
      </section>

      {/* Features */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {game.features.map((f) => (
          <div key={f} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm font-medium text-fg">
            <span className="size-2 shrink-0 rounded-full" style={{ background: game.accent }} />
            {f}
          </div>
        ))}
      </section>

      {/* How to play + controls. Touch screens (pointer-coarse) get their own tips, gestures and buttons. */}
      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <ListChecks className="size-5" style={{ color: game.accent }} /> How to play
          </h2>
          {game.touchHowTo ? (
            <>
              <Steps lines={game.howTo} accent={game.accent} className="pointer-coarse:hidden" />
              <Steps lines={game.touchHowTo} accent={game.accent} className="hidden pointer-coarse:block" />
            </>
          ) : (
            <Steps lines={game.howTo} accent={game.accent} />
          )}
        </div>

        <div className="rounded-3xl border border-line bg-surface p-6 sm:p-7">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="contents pointer-coarse:hidden">
              <Keyboard className="size-5" style={{ color: game.accent }} /> Controls
            </span>
            <span className="hidden pointer-coarse:contents">
              <Smartphone className="size-5" style={{ color: game.accent }} /> Touch controls
            </span>
          </h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-subtle">
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium pointer-coarse:hidden">Keyboard / mouse</th>
                  <th className="pb-2 font-medium">Touch</th>
                </tr>
              </thead>
              <tbody>
                {game.controls.map((c) => (
                  <tr key={c.action} className={`border-b border-line/60 last:border-0 ${c.touch ? "" : "pointer-coarse:hidden"}`}>
                    <td className="py-2.5 pr-3 font-medium text-fg">{c.action}</td>
                    <td className="py-2.5 pr-3 pointer-coarse:hidden">
                      <span className="flex flex-wrap gap-1">
                        {c.keys.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted pointer-coarse:text-fg">{c.touch ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!game.ownShell && (
            <>
              <h3 className="mt-6 mb-2 hidden text-xs font-semibold tracking-wide text-subtle uppercase pointer-coarse:block">Buttons in every game</h3>
              <p className="-mt-1 mb-2 hidden text-xs text-subtle pointer-coarse:block">In the top corner of the screen, or in the pause or settings menu.</p>
              <ul className="hidden gap-1.5 pointer-coarse:grid sm:grid-cols-2">
                {GAME_BUTTONS.filter((b) => !b.fullscreen).map(({ action, icon: Icon }) => (
                  <li key={action} className="flex items-center gap-2.5 rounded-xl bg-elevated px-3 py-2 text-xs text-muted">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface text-fg">
                      <Icon className="size-4" />
                    </span>
                    {action}
                  </li>
                ))}
              </ul>
              <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-subtle uppercase pointer-coarse:hidden">Shortcuts in every game</h3>
              <ul className="grid gap-1.5 pointer-coarse:hidden sm:grid-cols-2">
                {GAME_SHORTCUTS.map((s) => (
                  <li key={s.action} className="flex items-center justify-between gap-2 rounded-xl bg-elevated px-3 py-2 text-xs text-muted">
                    {s.action}
                    <span className="flex gap-1">
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Models used */}
      {models.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Built with {formatNumber(models.length)} models from {MODELS_SITE.name}</h2>
              <p className="mt-1 text-sm text-muted">
                {game.modelsIntro ?? `Every 3D model in ${game.title} comes from`}{" "}
                {packs.map(([key, name], i) => (
                  <span key={key}>
                    {i > 0 && (i === packs.length - 1 ? " and " : ", ")}
                    <a href={modelsUrl(`/models/collection/${key}/`)} className="text-fg underline-offset-2 hover:underline">
                      {name}
                    </a>
                  </span>
                ))}
                . Click any model to view and download it.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12">
            {shown.map((m) => (
              <a
                key={m.slug}
                href={modelsUrl(`/models/${m.slug}/`)}
                title={`${m.title} — ${m.collection}`}
                className="group relative grid aspect-square place-items-center overflow-hidden rounded-xl border border-line bg-surface transition hover:border-line-strong"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset(m.thumb!.src)}
                  alt={m.title}
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                  className="h-[82%] w-[82%] object-contain transition-transform duration-300 group-hover:scale-110"
                />
              </a>
            ))}
          </div>
          {withThumbs.length > shown.length && <p className="mt-3 text-sm text-subtle">+ {withThumbs.length - shown.length} more models</p>}
        </section>
      )}

      {/* More games */}
      <section className="mt-16">
        <div className="mb-4 flex items-end justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">More games</h2>
          <Link href="/" className="text-sm text-muted hover:text-fg">
            All games →
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((g) => (
            <GameCard key={g.slug} game={g} modelCount={gameModels(g).length} android={!!androidApp(g.slug)} />
          ))}
        </div>
      </section>
    </div>
  );
}
