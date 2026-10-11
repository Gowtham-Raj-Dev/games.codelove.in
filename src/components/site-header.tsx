import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { CODELOVE, SITE } from "@/lib/site";

/** Brand mark — same artwork as src/app/icon.svg (the favicon). */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0`} aria-hidden>
      <rect x="1.5" y="1.5" width="61" height="61" rx="13" fill="#e03a12" stroke="var(--color-fg)" strokeWidth="3" />
      <path
        d="M20 21h24a12 12 0 0 1 11.8 9.8l2 11a6.5 6.5 0 0 1-11.4 5.3L41 41H23l-5.4 6.1A6.5 6.5 0 0 1 6.2 41.8l2-11A12 12 0 0 1 20 21z"
        fill="#fff"
      />
      <path d="M20.5 26.5h4v3.5H28v4h-3.5v3.5h-4V34H17v-4h3.5z" fill="#1c1030" />
      <circle cx="40.5" cy="34.5" r="2.6" fill="#1c1030" />
      <circle cx="46.5" cy="29.5" r="2.6" fill="#1c1030" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {/* The narrowest phones show the mark alone, so the header's buttons fit beside it. */}
      <span className="font-display text-base leading-none max-[349px]:hidden sm:text-lg font-bold tracking-wide uppercase">
        {CODELOVE.name} <span className="text-accent">Games</span>
      </span>
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-fg bg-bg">
      <div aria-hidden className="h-1.5 bg-[linear-gradient(90deg,var(--color-accent)_0_33.4%,var(--color-accent-2)_33.4%_66.7%,var(--color-accent-3)_66.7%)]" />
      <div className="mx-auto flex h-14 max-w-7xl sm:h-16 items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-accent" aria-label={`${SITE.name} — home`}>
          <Logo />
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
