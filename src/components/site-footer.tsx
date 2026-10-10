import Link from "next/link";
import { Logo } from "@/components/site-header";
import { games } from "@/lib/games";
import { CODELOVE, modelsUrl, SITE } from "@/lib/site";

/** The model library the games are built from, and its tools: pages on models.codelove.in. */
const LIBRARY = [
  { href: modelsUrl("/models/"), label: "All 3D models" },
  { href: modelsUrl("/packs/"), label: "Download packs" },
  { href: modelsUrl("/animations/"), label: "Animations" },
  { href: modelsUrl("/builder/"), label: "Scene Builder" },
  { href: modelsUrl("/license/"), label: "Licensing" },
];

/** Who runs the site, how to reach them and the policies — shared with the model library. */
const ABOUT = [
  { href: modelsUrl("/about/"), label: "About" },
  { href: modelsUrl("/contact/"), label: "Contact" },
  { href: modelsUrl("/privacy/"), label: "Privacy policy" },
  { href: modelsUrl("/terms/"), label: "Terms of use" },
];

const heading = "mb-4 text-xs font-semibold tracking-[0.14em] text-subtle uppercase";

export function SiteFooter() {
  const playable = games.filter((g) => !g.comingSoon);
  return (
    <footer className="mt-24 border-t border-line bg-surface/40 sm:mt-32">
      {/* Tablets give the brand its own row: three link columns beside it only fit from lg up. */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-10 px-4 py-12 sm:px-6 sm:py-14 md:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="col-span-2 space-y-4 md:col-span-3 lg:col-span-1">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-muted">{SITE.description}</p>
        </div>
        <div>
          <h2 className={heading}>Games</h2>
          <ul className="space-y-2.5 text-sm text-muted">
            {playable.map((g) => (
              <li key={g.slug}>
                <Link href={`/${g.slug}/`} className="transition-colors hover:text-fg">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={heading}>3D model library</h2>
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
        {/* The main CodeLove site and its other tools. On phones the group spans the footer as a row of links. */}
        <div className="col-span-2 md:col-span-1">
          <h2 className={heading}>More from {CODELOVE.name}</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-muted md:block md:space-y-2.5">
            {[{ name: `${CODELOVE.name} home`, url: CODELOVE.url }, ...CODELOVE.tools].map((site) => (
              <li key={site.url}>
                <a href={site.url} className="transition-colors hover:text-fg">
                  {site.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <nav aria-label="About this site" className="mx-auto flex max-w-7xl flex-wrap gap-x-6 gap-y-2 px-4 pt-6 text-sm text-muted sm:px-6">
          {ABOUT.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-fg">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 pt-4 pb-6 text-xs leading-relaxed text-subtle sm:px-6 md:flex-row md:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE.brand} — site and games by {SITE.author}. The 3D models are free under the MIT, CC0, public-domain and CC BY licenses —{" "}
            <a href={modelsUrl("/license/")} className="text-muted underline underline-offset-2 hover:text-fg">
              licensing
            </a>
            .
          </p>
          <p>Independent site — not affiliated with or endorsed by any model creator.</p>
        </div>
      </div>
    </footer>
  );
}
