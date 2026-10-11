import { TextLink, TextList, TextPage, TextSection } from "@/components/text-page";
import { androidApp } from "@/lib/game-apps";
import { games } from "@/lib/games";
import { pageMetadata } from "@/lib/seo";
import { CODELOVE, MODELS_SITE, modelsUrl, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "About — Free 3D Games Online",
  description: `What ${SITE.name} is and who makes it: free 3D games that run in the browser with no download and no sign-up, built by ${SITE.author} from the free 3D models on ${MODELS_SITE.name}.`,
  path: "/about/",
});

export default function AboutPage() {
  const playable = games.filter((g) => !g.comingSoon);
  const upcoming = games.filter((g) => g.comingSoon);
  const onAndroid = playable.filter((g) => androidApp(g.slug));
  const genres = new Set(playable.map((g) => g.genre)).size;
  // CodeLove's other sites: the model library has its own paragraph above.
  const others = CODELOVE.tools.filter((tool) => tool.url !== MODELS_SITE.url);

  return (
    <TextPage
      eyebrow="About"
      title={
        <>
          Free 3D games, <span className="bg-accent-2 box-decoration-clone px-2 text-ink">made to be played.</span>
        </>
      }
      intro={
        <>
          {SITE.name} is a small collection of free 3D games that run in your browser. There is nothing to download and no
          account to make — open a game and press Play, on a PC or a phone.
        </>
      }
    >
      <TextSection title="What you can do here">
        <TextList>
          <li>
            <TextLink href="/#games">Play {playable.length} games</TextLink> in {genres} genres — kart racing, skating, tower defense, a
            dungeon crawler, cooking, mini golf, puzzles and village strategy.
          </li>
          <li>
            Read up before you play: every game has its own page with a trailer or cover, how to play, the keyboard, mouse and touch
            controls, and the 3D models it is built from.
          </li>
          <li>Play on a touch screen — every game has touch controls, and your best scores and progress are saved on your device.</li>
          {onAndroid.length > 0 && (
            <li>
              Install an Android app:{" "}
              {onAndroid.map((g, i) => (
                <span key={g.slug}>
                  {i > 0 && (i === onAndroid.length - 1 ? " and " : ", ")}
                  <TextLink href={`/${g.slug}/`}>{g.title}</TextLink>
                </span>
              ))}{" "}
              can be downloaded as a free APK from {onAndroid.length > 1 ? "their pages" : "its page"}.
            </li>
          )}
          {upcoming.length > 0 && (
            <li>
              See what is next: <TextLink href="/#coming-soon">{upcoming.length} more games</TextLink> are being built.
            </li>
          )}
        </TextList>
      </TextSection>

      <TextSection title="How the games are made">
        <p>
          Every character, vehicle, building and prop in these games is a free 3D model from{" "}
          <TextLink href={modelsUrl("/")}>{MODELS_SITE.name}</TextLink>, our library of openly licensed models (CC0, MIT and similar
          licenses). Each game&apos;s page lists the exact models it uses, and you can open any of them there to view and download it.
        </p>
        <p>
          The games are written with three.js and run entirely in your browser. Most of the music is not recorded: it is synthesized
          live in code with the Web Audio API and changes with the action. Kingdom Clash plays recorded tracks by Kevin MacLeod, credited
          in its settings.
        </p>
      </TextSection>

      <TextSection title="Why it is free">
        <p>
          The games are a way to show what the model library can do, and they are fun to make. There are no in-app purchases, no paid
          version and nothing locked behind a payment.
        </p>
      </TextSection>

      <TextSection title="Who makes it">
        <p>The site and its games are designed and built by {SITE.author}.</p>
        <p>
          {SITE.name} is part of <TextLink href={CODELOVE.url}>{CODELOVE.name}</TextLink>, together with{" "}
          <TextLink href={MODELS_SITE.url}>{MODELS_SITE.name}</TextLink>
          {others.map((tool, i) => (
            <span key={tool.url}>
              {i === others.length - 1 ? " and " : ", "}
              <TextLink href={tool.url}>{tool.name}</TextLink>
            </span>
          ))}
          .
        </p>
      </TextSection>

      <TextSection title="Questions and policies">
        <p>
          Found a bug or have an idea for a game? See <TextLink href="/contact/">Contact</TextLink> or write to{" "}
          <TextLink href={`mailto:${SITE.email}`}>{SITE.email}</TextLink>. How the site handles data is explained in the{" "}
          <TextLink href="/privacy/">Privacy Policy</TextLink>.
        </p>
      </TextSection>
    </TextPage>
  );
}
