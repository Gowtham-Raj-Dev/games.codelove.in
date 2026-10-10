import Link from "next/link";
import { useId } from "react";
import { SiteNav } from "@/components/site-nav";
import { SITE } from "@/lib/site";

/** Brand mark — same artwork as src/app/icon.svg (the favicon). */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  // Sanitized: useId output can contain characters that break url(#…) references.
  const gradient = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0 drop-shadow-[0_0_14px_rgb(124_58_237/0.55)]`} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.55" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradient})`} />
      <path d="M32 11.5 50 21.75 32 32 14 21.75z" fill="#fff" />
      <path d="M14 21.75 32 32v20.5L14 42.25z" fill="#fff" fillOpacity="0.78" />
      <path d="M50 21.75 32 32v20.5l18-10.25z" fill="#fff" fillOpacity="0.52" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">{SITE.shortName}</span>
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-accent" aria-label={`${SITE.shortName} — home`}>
          <Logo />
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
