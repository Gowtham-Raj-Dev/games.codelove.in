import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Boxes, Download, Gamepad2, MonitorSmartphone, Music, Play, Smartphone, UserX } from "lucide-react";
import { GameCard } from "@/components/game-card";
import { GameCardPreview } from "@/components/game-card-preview";
import { JsonLd } from "@/components/json-ld";
import { asset } from "@/lib/asset";
import { formatNumber } from "@/lib/catalog";
import { androidApp } from "@/lib/game-apps";
import { gameDisplayClass } from "@/lib/game-fonts";
import { gameModels } from "@/lib/game-models";
import { games } from "@/lib/games";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, MODELS_SITE, modelsUrl, SITE } from "@/lib/site";

const DESCRIPTION =
  "Play free 3D games online — no download, no sign-up. Kart racing, skating, tower defense, a dungeon crawler, cooking, mini golf, puzzles and strategy, on PC or phone.";

export const metadata: Metadata = {
  ...pageMetadata({
    // The home page: the root layout's "%s | site" template doesn't reach it, so the title names the site itself.
    title: `Free 3D Games Online — Play Free, No Download | ${SITE.name}`,
    absoluteTitle: true,
    description: DESCRIPTION,
    path: "/",
    keywords: [
      "free 3D games online",
      "free 3D games",
      "3D games",
      "3D games online",
      "free games",
      "free games online",
      "free online games no download",
      "play free games online",
      "free games for PC",
      "free games on phone",
      "free Android games",
      "3D games for Android",
      "free 3D racing game",
      "free kart racing game",
      "free tower defense game",
      "free endless runner game",
      "free strategy game",
      "free puzzle game",
      "free cooking game",
      "free mini golf game",
      "Gowtham games",
      "games.codelove.in",
      "codelove games",
    ],
  }),
  authors: [{ name: SITE.author }],
  creator: SITE.author,
  publisher: SITE.brand,
};

const PERKS = [
  { icon: BadgeCheck, label: "100% free" },
  { icon: Download, label: "No download" },
  { icon: UserX, label: "No sign-up" },
  { icon: MonitorSmartphone, label: "PC & mobile" },
  { icon: Smartphone, label: "Android app" },
];

/** "A", "A and B", "A, B and C". */
const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/** Questions shown on the page and in the FAQPage structured data. `android` names the games that have an APK today. */
function faq(android: string[]) {
  return [
    {
      q: "Are these 3D games really free?",
      a: "Yes. Every game is free to play online, with no in-app purchases, no paid version and nothing locked behind a payment.",
    },
    {
      q: "Do I need to download or install anything?",
      a: "No. Open a game and press Play — it starts on the page, on a PC, Mac, Chromebook, tablet or phone.",
    },
    {
      q: "Is there an Android app?",
      a: `${android.length ? `Yes — ${listNames(android)} can be installed as a free Android app from ${android.length > 1 ? "each game's page" : "its game page"}.` : "Not yet."} Android apps for all the other games are coming in future updates.`,
    },
    {
      q: "Do I need an account?",
      a: "No sign-up, no login and no email. Your best scores and progress are saved on your own device.",
    },
    {
      q: "Can I play on my phone?",
      a: "Yes. Every game has touch controls, and the controls table on each game's page shows what to tap.",
    },
    {
      q: "How are the games made?",
      a: `Every game is built only from the free 3D models on ${MODELS_SITE.name} — characters, vehicles, buildings and props you can download — with three.js, and music generated live in code.`,
    },
  ];
}

const sectionTitle = "font-display text-3xl font-bold tracking-tight uppercase sm:text-4xl";

export default function GamesPage() {
  const playable = games.filter((g) => !g.comingSoon);
  const upcoming = games.filter((g) => g.comingSoon);
  const perGame = playable.map((game) => ({ game, models: gameModels(game) }));
  const allModels = new Set(perGame.flatMap((g) => g.models.map((m) => m.slug)));
  const allPacks = new Set(perGame.flatMap((g) => g.models.map((m) => m.collectionKey)));
  const genres = new Set(playable.map((g) => g.genre));
  const onAndroid = playable.filter((g) => androidApp(g.slug));
  const questions = faq(onAndroid.map((g) => g.title));
  // The hero's spotlight is the first game of the list, with the next three as quick picks under it.
  const [featured, ...rest] = playable;
  const picks = rest.slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-14">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Free 3D Games Online",
            description: DESCRIPTION,
            url: absoluteUrl("/"),
            isAccessibleForFree: true,
            publisher: { "@type": "Organization", name: SITE.brand, url: absoluteUrl("/") },
            mainEntity: {
              "@type": "ItemList",
              numberOfItems: playable.length,
              itemListElement: playable.map((g, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteUrl(`/${g.slug}/`),
                name: g.title,
              })),
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: questions.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
          },
        ]}
      />

      {/* Hero: the pitch beside the featured game. */}
      <header className="grid gap-8 sm:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="min-w-0 space-y-4 sm:space-y-6">
          <p className="inline-flex -rotate-1 items-center gap-2 rounded-full border-2 border-fg bg-accent-2 px-3.5 py-1 font-display text-xs font-bold tracking-wider text-ink uppercase shadow-[3px_3px_0_var(--color-fg)]">
            <span className="size-2 animate-pulse rounded-full bg-accent" /> {playable.length} games · free · no download
          </p>
          <h1 className="font-display text-[2.125rem] leading-[1.12] font-bold tracking-tight text-balance uppercase sm:text-5xl lg:text-6xl">
            Free 3D games online. <span className="bg-accent-2 box-decoration-clone px-2 text-ink">Just press play.</span>
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted sm:text-lg">
            Kart racing, skating, tower defense, a dungeon crawler, cooking, mini golf, puzzles and village strategy. They are{" "}
            <strong className="font-semibold text-fg">free games</strong> with no download and no sign-up — they start right here, with a
            keyboard, mouse or touch screen.
          </p>
          {/* Phones: the two buttons stack, each as wide as the screen. */}
          <div className="flex flex-col gap-x-4 gap-y-4 pt-1 pb-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-y-5">
            <Link
              href="#games"
              className="btn-play inline-flex items-center justify-center gap-2.5 rounded-full px-8 py-3.5 font-display text-base font-bold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:py-4 sm:text-lg"
            >
              <Play className="size-5 fill-current sm:size-6" /> Browse {playable.length} games
            </Link>
            {featured && (
              <Link
                href={`/${featured.slug}/play/`}
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-fg bg-surface px-6 py-3.5 font-display sm:py-4 text-sm font-bold tracking-wide text-fg uppercase shadow-[0_5px_0_var(--color-fg)] transition hover:-translate-y-0.5 hover:bg-accent-2 hover:text-ink active:translate-y-1 active:shadow-[0_1px_0_var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Play {featured.title} <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
          {/* Phones: one row that scrolls sideways, out to the screen edges. */}
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 text-xs font-semibold text-fg sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {PERKS.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-fg bg-surface px-3 py-1 whitespace-nowrap">
                <Icon className="size-3.5 text-accent" /> {label}
              </li>
            ))}
          </ul>
        </div>

        {featured && (
          <div className="min-w-0 space-y-3">
            <Link
              href={`/${featured.slug}/`}
              className="pop pop-lift group relative block aspect-[1200/630] overflow-hidden rounded-3xl bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset(featured.cover)}
                alt={`${featured.title} gameplay`}
                width={1200}
                height={630}
                fetchPriority="high"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              {featured.preview && <GameCardPreview src={asset(featured.preview)} />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
              <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full border-2 border-fg bg-accent-2 px-3 py-0.5 font-display text-[11px] font-bold tracking-wider text-ink uppercase">
                Featured
              </span>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:gap-4 sm:p-6">
                <div className="min-w-0 space-y-1">
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-white/80">
                    <Gamepad2 className="size-3.5" /> {featured.genre}
                  </p>
                  <p className={`text-2xl text-white sm:text-4xl ${gameDisplayClass(featured.slug)}`}>{featured.title}</p>
                  <p className="line-clamp-2 text-xs text-white/80 sm:text-sm">{featured.tagline}</p>
                </div>
                <span className="relative grid size-12 shrink-0 sm:size-16 place-items-center rounded-full border-2 border-fg bg-accent text-white transition duration-300 group-hover:scale-110">
                  <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                  <Play className="relative size-5 translate-x-px fill-current sm:size-7" />
                </span>
              </div>
            </Link>
            <ul className="grid grid-cols-3 gap-3">
              {picks.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/${g.slug}/`}
                    className="group relative block aspect-[1200/630] overflow-hidden rounded-xl border-2 border-fg bg-elevated transition duration-200 hover:-translate-y-1 hover:shadow-[4px_4px_0_var(--color-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset(g.cover)}
                      alt=""
                      width={1200}
                      height={630}
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <span className="absolute inset-x-2 bottom-1.5 truncate text-xs font-semibold text-white sm:text-sm">{g.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {/* Phones: a 2 × 2 grid, ruled with the cells' own borders; from `sm` up, one row with rules between the cells. */}
      <dl className="pop mt-10 grid grid-cols-2 divide-fg overflow-hidden rounded-2xl bg-surface sm:mt-14 sm:grid-cols-4 sm:divide-x-2">
        {[
          { label: "Games", value: playable.length },
          { label: "Genres", value: genres.size },
          { label: "3D models used", value: allModels.size },
          { label: "Model packs", value: allPacks.size },
        ].map((s) => (
          <div key={s.label} className="border-fg px-4 py-3.5 text-center max-sm:odd:border-r-2 max-sm:nth-[n+3]:border-t-2 sm:px-5 sm:py-4">
            <dd className="font-display text-3xl font-bold text-accent tabular-nums sm:text-4xl">{formatNumber(s.value)}</dd>
            <dt className="mt-0.5 text-xs font-semibold tracking-wide text-muted uppercase">{s.label}</dt>
          </div>
        ))}
      </dl>

      <section id="games" className="mt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className={sectionTitle}>All games</h2>
            <p className="mt-1.5 text-sm text-muted">Pick one — every game has its own page with a trailer, the controls and how to play.</p>
          </div>
          <p className="rounded-full border-2 border-fg bg-accent-3 px-3 py-0.5 font-display text-xs font-bold tracking-wider text-white uppercase">{playable.length} playable now</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {perGame.map(({ game, models }, i) => (
            <GameCard key={game.slug} game={game} modelCount={models.length} priority={i < 3} android={!!androidApp(game.slug)} />
          ))}
        </div>
      </section>

      {onAndroid.length > 0 && (
        <section className="mt-12 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-fg bg-surface px-5 py-4 sm:px-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-fg bg-accent-2 text-ink">
            <Smartphone className="size-5" />
          </span>
          <p className="min-w-0 flex-1 basis-64 text-sm leading-relaxed text-muted">
            <strong className="font-semibold text-fg">Android app:</strong>{" "}
            {onAndroid.map((g, i) => (
              <span key={g.slug}>
                {i > 0 && (i === onAndroid.length - 1 ? " and " : ", ")}
                <Link href={`/${g.slug}/`} className="text-fg underline underline-offset-2 hover:text-accent">
                  {g.title}
                </Link>
              </span>
            ))}{" "}
            {onAndroid.length > 1 ? "are" : "is"} available as a free Android app today. Android apps for all the other games are coming soon.
          </p>
        </section>
      )}

      {upcoming.length > 0 && (
        <section id="coming-soon" className="mt-16">
          <h2 className={sectionTitle}>Coming soon</h2>
          <p className="mt-1.5 text-sm text-muted">
            {upcoming.length} more games are being built the same way — only from the models in the library.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((game) => (
              <GameCard key={game.slug} game={game} modelCount={gameModels(game).length} />
            ))}
          </div>
        </section>
      )}

      <section id="how" className="mt-20">
        <h2 className={sectionTitle}>How these games are made</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Boxes,
              title: "Only library models",
              text: `Every character, animation, vehicle, building and prop is a model from ${MODELS_SITE.name} (CC0 and MIT). Each game's page lists the exact models it uses — open any of them to download it yourself.`,
            },
            {
              icon: Music,
              title: "Music made in code",
              text: "Each game has its own soundtrack — a sea shanty, a dungeon march, a diner bossa — synthesized live with the Web Audio API and building up as the action gets intense. Toggle music (M) and sound (N) separately.",
            },
            {
              icon: Smartphone,
              title: "Runs anywhere",
              text: "Built with three.js. Play with keyboard and mouse, or touch controls on a phone; best scores are saved in your browser. Models stream in with a live progress bar and stay cached while you play.",
            },
          ].map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="pop relative overflow-hidden rounded-2xl bg-surface p-6">
              <span aria-hidden className="absolute top-3 right-4 font-display text-5xl font-bold text-fg/10">
                0{i + 1}
              </span>
              <span className="grid size-10 place-items-center rounded-xl border-2 border-fg bg-accent-2 text-ink">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-wide text-fg uppercase">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted">
          Want to make your own?{" "}
          <a href={modelsUrl("/builder/")} className="text-fg underline underline-offset-2 hover:text-accent">
            Compose a scene in the builder
          </a>{" "}
          or{" "}
          <a href={modelsUrl("/models/")} className="text-fg underline underline-offset-2 hover:text-accent">
            browse all models
          </a>
          .
        </p>
      </section>

      <section id="faq" className="mt-16">
        <h2 className={sectionTitle}>Free 3D games — questions</h2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {questions.map(({ q, a }) => (
            <div key={q} className="rounded-2xl border-2 border-fg bg-surface p-5">
              <dt className="font-semibold text-fg">{q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
