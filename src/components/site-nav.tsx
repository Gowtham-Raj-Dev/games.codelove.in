import Link from "next/link";
import { Boxes, Play } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { games } from "@/lib/games";
import { modelsUrl } from "@/lib/site";

/** Sections of the home page. "Coming soon" is listed only while a game is still being built. */
const sections = () => [
  { href: "/#games", label: "All games" },
  ...(games.some((g) => g.comingSoon) ? [{ href: "/#coming-soon", label: "Coming soon" }] : []),
  { href: "/#how", label: "How they're made" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteNav() {
  return (
    <nav aria-label="Main" className="flex items-center gap-1 text-sm">
      {/* Phones show only the Play button: the same links are in the footer. */}
      {sections().map((l) => (
        <Link key={l.href} href={l.href} className="hidden rounded-full px-3 py-1.5 font-medium text-muted transition-colors hover:bg-fg/10 hover:text-fg lg:inline-flex">
          {l.label}
        </Link>
      ))}
      <a
        href={modelsUrl("/")}
        className="ml-1 hidden items-center gap-1.5 rounded-full border-2 border-fg bg-surface px-3.5 py-1 font-medium text-fg transition hover:bg-accent-2 hover:text-ink sm:inline-flex"
      >
        <Boxes className="size-3.5 text-accent" /> 3D models
      </a>
      <ThemeToggle />
      <Link
        href="/#games"
        className="btn-play ml-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-display font-bold tracking-wide whitespace-nowrap uppercase sm:ml-2 sm:px-4"
      >
        {/* Phones: just "Play", so the logo, the theme button and this fit on one line. */}
        <Play className="size-3.5 fill-current" /> Play<span className="hidden sm:inline"> now</span>
      </Link>
    </nav>
  );
}
