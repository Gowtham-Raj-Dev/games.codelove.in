import Link from "next/link";
import { BadgeCheck, Download, Play, UserX } from "lucide-react";
import { HeartButton } from "@/components/heart-button";
import { ContactLinks } from "@/components/contact-links";
import { Logo } from "@/components/site-header";
import { asset } from "@/lib/asset";
import { games } from "@/lib/games";
import { CODELOVE, MODELS_SITE, modelsUrl, SITE } from "@/lib/site";

/** The model library the games are built from, and its tools: pages on models.codelove.in. */
const LIBRARY = [
  { href: modelsUrl("/models/"), label: "All 3D models" },
  { href: modelsUrl("/packs/"), label: "Download packs" },
  { href: modelsUrl("/animations/"), label: "Animations" },
  { href: modelsUrl("/builder/"), label: "Scene Builder" },
  { href: modelsUrl("/license/"), label: "Licensing" },
];

/** Who runs the site, how to reach them and the policies. */
const ABOUT = [
  { href: "/about/", label: "About" },
  { href: "/contact/", label: "Contact" },
  { href: "/privacy/", label: "Privacy policy" },
  { href: "/terms/", label: "Terms of use" },
];

const PROMISES = [
  { icon: BadgeCheck, label: "Free" },
  { icon: Download, label: "No download" },
  { icon: UserX, label: "No sign-up" },
];

/** The standard CodeLove credit, same on every site in the network. */
const AUTHOR_URL = "https://gowtham.codelove.in";
const creditLink = "font-medium text-fg transition-colors hover:text-accent";

const heading ="mb-4 font-display text-xs font-bold tracking-[0.16em] text-accent uppercase";

export function SiteFooter() {
  const playable = games.filter((g) => !g.comingSoon);
  const upcoming = games.filter((g) => g.comingSoon);
  return (
    <footer className="mt-24 sm:mt-32">
      {/* Last call before the links: back to the games. */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="pop relative overflow-hidden rounded-3xl bg-accent-2 px-6 py-10 text-ink sm:px-12 sm:py-14">
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl space-y-2">
              <p className="font-display text-3xl leading-tight font-bold tracking-tight uppercase sm:text-4xl">
                Ready? <span className="text-accent">Press play.</span>
              </p>
              <p className="text-sm leading-relaxed font-medium text-ink/80 sm:text-base">
                {playable.length} free 3D games, starting in seconds on a PC or a phone.
              </p>
            </div>
            <Link
              href="/#games"
              className="btn-play inline-flex items-center gap-2 rounded-full px-8 py-4 font-display text-lg font-bold tracking-wide uppercase"
            >
              <Play className="size-5 fill-current" /> Pick a game
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-16 border-t-2 border-fg bg-surface">
        <div className="relative mx-auto grid max-w-7xl grid-cols-2 gap-x-8 gap-y-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[1.5fr_1.6fr_1fr_1fr]">
          <div className="col-span-2 space-y-5 lg:col-span-1">
            <Logo />
            <p className="max-w-sm text-sm leading-relaxed text-muted">{SITE.description}</p>
            <ul className="flex flex-wrap gap-2 text-xs text-muted">
              {PROMISES.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
                  <Icon className="size-3.5 text-accent" /> {label}
                </li>
              ))}
            </ul>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <h2 className={heading}>Play</h2>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-muted">
              {playable.map((g) => (
                <li key={g.slug}>
                  <Link href={`/${g.slug}/`} className="transition-colors hover:text-fg">
                    {g.title}
                  </Link>
                </li>
              ))}
              {upcoming.map((g) => (
                <li key={g.slug}>
                  <Link href={`/${g.slug}/`} className="text-subtle transition-colors hover:text-fg">
                    {g.title} <span className="text-[11px]">· soon</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className={heading}>Made with</h2>
            <ul className="space-y-2.5 text-sm text-muted">
              {LIBRARY.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="transition-colors hover:text-fg">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          {/* The CodeLove network: the main site, its other tools and the guides there about these games. */}
          <nav aria-label={`${CODELOVE.name} network`}>
            <h2 className={heading}>{CODELOVE.name} network</h2>
            <ul className="space-y-2.5 text-sm text-muted">
              {[{ name: CODELOVE.name, url: CODELOVE.url }, ...CODELOVE.tools].map((site) => (
                <li key={site.url}>
                  <a href={site.url} className="transition-colors hover:text-fg">
                    {site.name}
                  </a>
                </li>
              ))}
            </ul>
            <h2 className={`${heading} mt-8`}>Guides</h2>
            <ul className="space-y-2.5 text-sm text-muted">
              {CODELOVE.guides.map((guide) => (
                <li key={guide.url}>
                  <a href={guide.url} className="transition-colors hover:text-fg">
                    {guide.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          {/* The parent brand, bottom right on desktop, on a row of its own under the link columns (the network column with its
              guides can be as tall as the Play list). Two files: dark lettering for the cream theme, white for the dark one. */}
          <div className="col-span-2 flex flex-col gap-3 lg:col-span-4 lg:flex-row lg:items-center lg:justify-end lg:gap-6">
          {/* What CodeLove is, in one line — same text on every CodeLove site. */}
          <p className="max-w-md text-sm leading-relaxed text-muted lg:order-first lg:text-right">
            CodeLove makes free web tools, apps and games for creators, students and developers — simple to use, no hidden
            fees.
          </p>
          <a href={CODELOVE.url} aria-label={`${CODELOVE.name} — codelove.in`} className="w-fit shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/codelove/codelove-footer-on-light.png")}
              alt={CODELOVE.name}
              width={704}
              height={144}
              loading="lazy"
              className="h-14 w-auto [:root[data-theme=dark]_&]:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/codelove/codelove-footer-on-dark.png")}
              alt={CODELOVE.name}
              width={704}
              height={144}
              loading="lazy"
              className="hidden h-14 w-auto [:root[data-theme=dark]_&]:block"
            />
          </a>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-xs leading-relaxed text-subtle sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <p>
              © {new Date().getFullYear()} {SITE.brand} — games by {SITE.author}, built from the free 3D models on{" "}
              <a href={modelsUrl("/")} className="text-muted underline underline-offset-2 hover:text-fg">
                {MODELS_SITE.name}
              </a>
              .
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              Built with <HeartButton /> by{" "}
              <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className={creditLink}>
                Gowtham
              </a>
              <span aria-hidden="true">·</span>
              <a href={CODELOVE.url} target="_blank" rel="noopener noreferrer" className={creditLink}>
                CodeLove
              </a>
              <span aria-hidden="true">·</span>
              <ContactLinks className="text-fg" />
            </p>
            <nav aria-label="About this site" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {ABOUT.map((l) =>
                l.href.startsWith("/") ? (
                  <Link key={l.href} href={l.href} className="transition-colors hover:text-fg">
                    {l.label}
                  </Link>
                ) : (
                  <a key={l.href} href={l.href} className="transition-colors hover:text-fg">
                    {l.label}
                  </a>
                ),
              )}
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
