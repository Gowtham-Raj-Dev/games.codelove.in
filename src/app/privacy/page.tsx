import { TextLink, TextList, TextPage, TextSection } from "@/components/text-page";
import { pageMetadata } from "@/lib/seo";
import { CODELOVE, MODELS_SITE, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: `How ${SITE.name} handles data: no accounts, game saves that stay in your browser, Google Analytics, online rooms in Cannon Cove, and how Google AdSense advertising cookies work and how to opt out.`,
  path: "/privacy/",
});

/**
 * Change this date whenever the policy changes. Keep the policy true to the code: analytics is
 * src/components/firebase-analytics.tsx, ads are src/lib/adsense.ts, browser storage is the games
 * (src/components/games/shared/), online play is cannon-cove/online.ts.
 */
const UPDATED = "2026-10-10";

export default function PrivacyPage() {
  return (
    <TextPage
      eyebrow="Privacy"
      title="Privacy Policy"
      updated={UPDATED}
      intro={
        <>
          The short version: {SITE.name} has no accounts and never asks for your name or email address. It counts visits with
          Google Analytics, keeps your game saves and settings in your own browser, and may use Google AdSense to show ads on its
          pages. The details are below.
        </>
      }
    >
      <TextSection id="who" title="Who we are">
        <p>
          {SITE.name} is a site of free 3D browser games made by {SITE.author}, part of{" "}
          <TextLink href={CODELOVE.url}>{CODELOVE.name}</TextLink>. This policy covers {SITE.name} only; the model library the games
          are built from, <TextLink href={MODELS_SITE.url}>{MODELS_SITE.name}</TextLink>, has its own. For anything about this
          policy, write to <TextLink href={`mailto:${SITE.email}`}>{SITE.email}</TextLink>.
        </p>
      </TextSection>

      <TextSection id="not-collected" title="What we do not collect">
        <TextList>
          <li>There is no sign-up, login or profile, and nothing to pay for, so we hold no names, passwords or payment details.</li>
          <li>The site has no contact form, comment box or newsletter.</li>
          <li>Your scores, progress and unlocks are not sent to us.</li>
        </TextList>
      </TextSection>

      <TextSection id="analytics" title="Analytics">
        <p>
          The live site uses Google Analytics (through Google Firebase) to count visits. It records things such as the pages
          viewed, the kind of device and browser, the country or city a visit appears to come from, and how the visitor arrived.
          To do that it sets cookies and uses similar identifiers in your browser. We use these figures to see which games are
          played and to find problems — not to identify you.
        </p>
        <p>
          Google processes this data under its own <TextLink href="https://policies.google.com/privacy">privacy policy</TextLink>.
          You can stop Google Analytics on every site with Google&apos;s{" "}
          <TextLink href="https://tools.google.com/dlpage/gaoptout">opt-out browser add-on</TextLink>, or by blocking cookies for
          this site in your browser. Analytics does not run inside the Android apps.
        </p>
      </TextSection>

      <TextSection id="advertising" title="Advertising">
        <p>
          We use or may use Google AdSense to show ads on {SITE.name}. Where ads are
          shown, the following applies:
        </p>
        <TextList>
          <li>
            Third-party vendors, including Google, use cookies to serve ads based on a user&apos;s prior visits to this website or
            other websites.
          </li>
          <li>
            Google&apos;s use of advertising cookies enables it and its partners to serve ads to users based on their visits to this
            site and/or other sites on the Internet.
          </li>
          <li>
            You may opt out of personalized advertising by visiting{" "}
            <TextLink href="https://adssettings.google.com">Google Ads Settings</TextLink>. You can also opt out of some third-party
            vendors&apos; use of cookies for personalized advertising at{" "}
            <TextLink href="https://www.aboutads.info">www.aboutads.info</TextLink>.
          </li>
          <li>
            Google explains{" "}
            <TextLink href="https://policies.google.com/technologies/partner-sites">
              how it uses information from sites and apps that use its services
            </TextLink>
            .
          </li>
        </TextList>
        <p>
          Ad vendors may read or set cookies and use device identifiers and your IP address to choose, limit and measure ads. We
          do not give them your name or email address — we do not have them.
        </p>
      </TextSection>

      <TextSection id="browser-storage" title="What is stored in your browser">
        <p>
          The games remember things for you by saving them in your browser&apos;s local storage. This data stays on your device: it
          is not sent to us and we cannot read it.
        </p>
        <TextList>
          <li>
            <span className="text-fg">Progress</span> — best scores, finished levels, coins, unlocks and, in Kingdom Clash, your
            village.
          </li>
          <li>
            <span className="text-fg">Settings</span> — such as music, sound and language.
          </li>
          <li>
            <span className="text-fg">Cannon Cove</span> — the captain name and ship you chose for online battles.
          </li>
        </TextList>
        <p>Clearing this site&apos;s data in your browser settings deletes all of it, including your progress.</p>
      </TextSection>

      <TextSection id="other-services" title="Features that talk to other services">
        <TextList>
          <li>
            <span className="text-fg">Online battles in Cannon Cove.</span> Rooms are kept in Google Firebase Realtime Database: the
            room code, each player&apos;s captain name (the one you typed, or a random one), ship and color, and the match results. A
            room&apos;s data is removed when its players leave, and abandoned rooms are cleared later. The battle itself travels
            directly between the players&apos; browsers, so the devices in your room — and the Google servers that help them find
            each other — can see your IP address. Do not use your real name as a captain name.
          </li>
          <li>
            <span className="text-fg">The Android apps.</span> An app plays the game from files inside it and keeps your progress on
            the phone. It may ask online whether a newer version is available; it sends nothing about you beyond that request.
          </li>
          <li>
            <span className="text-fg">Links to other sites.</span> Game pages link to the models they use on {MODELS_SITE.name}, and
            the footer links to the other {CODELOVE.name} sites. Those sites have their own privacy policies.
          </li>
        </TextList>
      </TextSection>

      <TextSection id="hosting" title="Hosting and server logs">
        <p>
          The site is hosted on GitHub Pages. As with any website, the servers that deliver it process technical request data —
          your IP address, the time, the address requested and your browser type — to send you the pages and files and to keep
          the service secure. GitHub handles that data under its own{" "}
          <TextLink href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacy statement</TextLink>.
        </p>
      </TextSection>

      <TextSection id="email" title="If you email us">
        <p>
          When you write to <TextLink href={`mailto:${SITE.email}`}>{SITE.email}</TextLink> we receive your email address and
          whatever you put in the message. We use them only to answer you.
        </p>
      </TextSection>

      <TextSection id="children" title="Children">
        <p>
          The site is meant for a general audience. It needs no account or personal details, and we do not knowingly collect
          personal information from children.
        </p>
      </TextSection>

      <TextSection id="choices" title="Your choices and rights">
        <TextList>
          <li>You can block or delete cookies and this site&apos;s stored data in your browser settings. The games keep working.</li>
          <li>You can opt out of Google Analytics and of personalized advertising with the links above.</li>
          <li>
            Depending on where you live, the law may give you the right to see, correct or delete personal data about you, or to
            object to its use. We hold no account data about you. For what Google holds through Analytics or advertising, use the
            Google tools linked above — or email us and we will help where we can.
          </li>
        </TextList>
      </TextSection>

      <TextSection id="changes" title="Changes to this policy">
        <p>
          If the site starts to handle data differently, we will change this page and the date at the top. For questions, see{" "}
          <TextLink href="/contact/">Contact</TextLink>.
        </p>
      </TextSection>
    </TextPage>
  );
}
