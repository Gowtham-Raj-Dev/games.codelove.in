import { Mail } from "lucide-react";
import { TextLink, TextList, TextPage, TextSection } from "@/components/text-page";
import { pageMetadata } from "@/lib/seo";
import { MODELS_SITE, modelsUrl, SITE } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Contact — Bugs, Ideas and Questions",
  description: `Contact ${SITE.name} by email at ${SITE.email}: a bug in a game, an idea for a new one, a problem with the Android app or a privacy question.`,
  path: "/contact/",
});

export default function ContactPage() {
  return (
    <TextPage
      eyebrow="Contact"
      title="Get in touch."
      intro="A bug in a game, an idea for a new one, a problem with the Android app, or a question — write to us by email."
    >
      <section className="rounded-2xl border border-line border-l-2 border-l-accent bg-surface p-6">
        <h2 className="text-sm font-medium text-muted">Email</h2>
        <p className="mt-2 text-xl font-semibold tracking-tight break-all sm:text-2xl">{SITE.email}</p>
        <a
          href={`mailto:${SITE.email}`}
          className="mt-5 inline-flex items-center gap-2 btn-play rounded-full px-6 py-3 font-display text-sm font-bold tracking-wide uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Mail className="size-4" /> Write an email
        </a>
      </section>

      <TextSection title="What to include">
        <TextList>
          <li>
            <span className="text-fg">A bug in a game</span> — which game, what happened and what you were doing, plus your device
            (PC, phone or tablet) and browser. A screenshot helps.
          </li>
          <li>
            <span className="text-fg">A game that will not load or runs slowly</span> — the game, your device and browser, and where
            the loading bar stopped.
          </li>
          <li>
            <span className="text-fg">The Android app</span> — the game, the app version shown on its page, and your phone model and
            Android version.
          </li>
          <li>
            <span className="text-fg">An idea or a request</span> — a new game, a new level or a change to the controls. We read all
            of them.
          </li>
          <li>
            <span className="text-fg">A privacy question</span> — the <TextLink href="/privacy/">Privacy Policy</TextLink> explains what
            the site does with data; ask us about anything it leaves open.
          </li>
        </TextList>
      </TextSection>

      <TextSection title="Before you write">
        <p>Some answers are already on the site:</p>
        <TextList>
          <li>
            <TextLink href="/#faq">Frequently asked questions</TextLink> — whether the games are free, downloads, accounts and
            phones.
          </li>
          <li>Each game&apos;s page — how to play it and every control, for keyboard, mouse and touch.</li>
          <li>
            A question about a 3D model, its license or a wrong credit belongs to the model library: see{" "}
            <TextLink href={modelsUrl("/contact/")}>{MODELS_SITE.name} — Contact</TextLink>.
          </li>
        </TextList>
      </TextSection>

      <TextSection title="Email only">
        <p>
          The site has no contact form and no accounts, so email is the way to reach us. We use your address and your message only
          to answer you.
        </p>
      </TextSection>
    </TextPage>
  );
}
