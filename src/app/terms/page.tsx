import { TextLink, TextList, TextPage, TextSection } from "@/components/text-page";
import { pageMetadata } from "@/lib/seo";
import { CODELOVE, MODELS_SITE, SITE, modelsUrl } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Terms of Use",
  description: `The terms for playing the free 3D browser games on ${SITE.name}: fair use, online play in Cannon Cove, the Android apps, ads, the models the games are built from, availability and liability.`,
  path: "/terms/",
});

/** Change this date whenever the terms change. */
const UPDATED = "2026-10-25";

export default function TermsPage() {
  return (
    <TextPage
      eyebrow="Terms"
      title="Terms of Use"
      updated={UPDATED}
      intro={
        <>
          {SITE.name} is free to play, with no account. By playing the games or using the site you agree to these terms. They are
          short and meant to be fair: play, have fun and don&apos;t spoil it for others.
        </>
      }
    >
      <TextSection id="who" title="Who runs the site">
        <p>
          {SITE.name} is made by {SITE.author} and is part of <TextLink href={CODELOVE.url}>{CODELOVE.name}</TextLink>. You can reach
          us at <TextLink href={`mailto:${SITE.email}`}>{SITE.email}</TextLink> or through the <TextLink href="/contact/">Contact</TextLink>{" "}
          page.
        </p>
      </TextSection>

      <TextSection id="use" title="Using the games">
        <TextList>
          <li>The games are free for personal play in your browser or in our Android apps. You don&apos;t need to sign up or pay.</li>
          <li>
            Don&apos;t try to break, overload or attack the site or its online rooms, and don&apos;t use bots, cheats or scripts to
            disrupt other players.
          </li>
          <li>
            Don&apos;t copy the site or its games to publish them elsewhere as your own, or frame them inside another site with
            different ads.
          </li>
          <li>Recording and sharing videos of your play (for example on YouTube) is welcome, with a link back to the game.</li>
        </TextList>
      </TextSection>

      <TextSection id="online" title="Online play in Cannon Cove">
        <p>
          Online battles connect you directly with other players. Pick a captain name that isn&apos;t your real name and isn&apos;t
          offensive. We may remove rooms or names that break these terms. We don&apos;t check other players, so leave any room you
          aren&apos;t comfortable in.
        </p>
      </TextSection>

      <TextSection id="content" title="Games, models and other content">
        <p>
          The games, their code and their design belong to {SITE.author} and {CODELOVE.name}. The 3D models the games are built
          from come from <TextLink href={MODELS_SITE.url}>{MODELS_SITE.name}</TextLink>; using those models in your own projects
          is covered by its <TextLink href={modelsUrl("/license/")}>license page</TextLink>. Music, sounds and other assets are
          credited on the game pages where their license asks for it.
        </p>
        <p>
          If you think something on the site uses your work without permission, email{" "}
          <TextLink href={`mailto:${SITE.email}`}>{SITE.email}</TextLink> with the page and the details, and we will look at it
          quickly and remove it if needed.
        </p>
      </TextSection>

      <TextSection id="ads" title="Ads and analytics">
        <p>
          The site may show ads from Google AdSense and counts visits with Google Analytics. This keeps the games free. How that
          works, and how to opt out, is in the <TextLink href="/privacy/">Privacy Policy</TextLink>. Don&apos;t click ads on purpose to
          inflate them, or ask others to.
        </p>
      </TextSection>

      <TextSection id="availability" title="Availability and changes">
        <p>
          The games are provided as they are. We work to keep them running well, but a game may change, move, lose saved progress
          after an update, or be unavailable for a while. Your progress is kept in your own browser, so clearing site data removes
          it. We may update these terms as the site grows; the date at the top shows the latest version, and playing after a change
          means you accept it.
        </p>
      </TextSection>

      <TextSection id="liability" title="Liability">
        <p>
          The site is free and offered without warranties. As far as the law allows, we are not liable for any loss from using it
          or from not being able to use it, including lost game progress. Take breaks, and play with sound at a sensible volume.
        </p>
      </TextSection>

      <TextSection id="links" title="Links to other sites">
        <p>
          The site links to other {CODELOVE.name} sites and to outside services such as Google. Those sites have their own terms
          and policies, and we aren&apos;t responsible for them.
        </p>
      </TextSection>
    </TextPage>
  );
}
