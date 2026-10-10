import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Ban, Boxes, Download, MonitorSmartphone, Music, Smartphone, UserX } from "lucide-react";
import { GameCard } from "@/components/game-card";
import { JsonLd } from "@/components/json-ld";
import { Eyebrow } from "@/components/ui";
import { formatNumber } from "@/lib/catalog";
import { androidApp } from "@/lib/game-apps";
import { gameModels } from "@/lib/game-models";
import { games } from "@/lib/games";
import { pageMetadata } from "@/lib/seo";
import { absoluteUrl, MODELS_SITE, modelsUrl, SITE } from "@/lib/site";

const DESCRIPTION =
  "Play free 3D games online — no ads, no download, no sign-up. Kart racing, skating, tower defense, a dungeon crawler, cooking, mini golf, puzzles and strategy, on PC or phone.";

export const metadata: Metadata = {
  ...pageMetadata({
    // The home page: the root layout's "%s | site" template doesn't reach it, so the title names the site itself.
    title: `Free 3D Games Online — Play Ad-Free, No Download | ${SITE.name}`,
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
      "ad-free games",
      "ad-free games online",
      "free games without ads",
      "games with no ads",
      "free online games no download",
      "play free games online",
      "free games for PC",
      "free games on phone",
      "free Android games",
      "3D games for Android",
      "ad-free Android games",
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
  { icon: Ban, label: "No ads" },
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
      q: "Do the games have ads?",
      a: "No. These are ad-free games: no banner ads, no video ads before you play and no ads between levels.",
    },
    {
      q: "Do I need to download or install anything?",
      a: "No. Open a game and press Play — it starts on the page, on a PC, Mac, Chromebook, tablet or phone.",
    },
    {
      q: "Is there an Android app?",
      a: `${android.length ? `Yes — ${listNames(android)} can be installed as a free, ad-free Android app from ${android.length > 1 ? "each game's page" : "its game page"}.` : "Not yet."} Android apps for all the other games are coming in future updates.`,
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

export default function GamesPage() {
  const playable = games.filter((g) => !g.comingSoon);
  const upcoming = games.filter((g) => g.comingSoon);
  const perGame = playable.map((game) => ({ game, models: gameModels(game) }));
  const allModels = new Set(perGame.flatMap((g) => g.models.map((m) => m.slug)));
  const allPacks = new Set(perGame.flatMap((g) => g.models.map((m) => m.collectionKey)));
  const genres = new Set(playable.map((g) => g.genre));
  const onAndroid = playable.filter((g) => androidApp(g.slug));
  const questions = faq(onAndroid.map((g) => g.title));

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
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

      <header className="mb-10 space-y-4">
        <Eyebrow>Play free</Eyebrow>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Free 3D games online</h1>
        <p className="text-base leading-relaxed text-muted sm:text-lg">
          Play {playable.length} free 3D games — kart racing, skating, tower defense, a dungeon crawler, cooking, mini golf, puzzles and village
          strategy. They are <strong className="font-semibold text-fg">ad-free games</strong> with no download and no sign-up: press Play and they
          start right here, with a keyboard, mouse or touch screen. Every game is built only from the free 3D models on{" "}
          <a href={modelsUrl("/")} className="text-fg underline underline-offset-2 hover:text-accent">
            {MODELS_SITE.name}
          </a>{" "}
          — the same characters, vehicles, buildings and props you can download there.
        </p>
        <ul className="flex flex-wrap gap-2 text-xs text-muted">
          {PERKS.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5">
              <Icon className="size-3.5 text-accent" /> {label}
            </li>
          ))}
        </ul>
        {onAndroid.length > 0 && (
          <p className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
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
            </span>
          </p>
        )}
      </header>

      <dl className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Games", value: playable.length },
          { label: "Genres", value: genres.size },
          { label: "Library models used", value: allModels.size },
          { label: "Model packs", value: allPacks.size },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface px-5 py-4">
            <dt className="text-xs text-subtle">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(s.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {perGame.map(({ game, models }, i) => (
          <GameCard key={game.slug} game={game} modelCount={models.length} priority={i < 3} android={!!androidApp(game.slug)} />
        ))}
      </div>

      {upcoming.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Coming soon</h2>
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

      <section className="mt-20 mb-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How these games are made</h2>
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
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-line bg-surface p-5">
              <Icon className="size-5 text-accent" />
              <h3 className="mt-3 font-semibold text-fg">{title}</h3>
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

      <section className="mt-16 mb-4">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Free 3D games — questions</h2>
        <dl className="mt-6 grid gap-4 md:grid-cols-2">
          {questions.map(({ q, a }) => (
            <div key={q} className="rounded-2xl border border-line bg-surface p-5">
              <dt className="font-semibold text-fg">{q}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
