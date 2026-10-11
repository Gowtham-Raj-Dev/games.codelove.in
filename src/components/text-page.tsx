import type { ReactNode } from "react";
import Link from "next/link";
import { Eyebrow } from "@/components/ui";

/**
 * Layout of the pages that are mostly text (/about/, /contact/, /privacy/): a header, then sections in one
 * column narrow enough to read comfortably.
 */

export function TextPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  intro: ReactNode;
  /** Date of the last change to a policy, as YYYY-MM-DD. */
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-14">
      <header className="space-y-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="font-display text-3xl leading-[1.05] font-bold tracking-tight text-balance uppercase sm:text-5xl">{title}</h1>
        <p className="max-w-3xl text-lg leading-relaxed text-muted">{intro}</p>
        {updated && (
          <p className="text-xs text-subtle">
            Last updated{" "}
            <time dateTime={updated}>
              {new Date(`${updated}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
            </time>
          </p>
        )}
      </header>
      <div className="mt-12 max-w-3xl space-y-12 sm:mt-16">{children}</div>
    </div>
  );
}

export function TextSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-xl font-bold tracking-tight uppercase sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function TextList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-accent">{children}</ul>;
}

/** A link inside a sentence. Pages of this site go through next/link; other sites open in a new tab. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  const className = "text-fg underline underline-offset-2 hover:text-accent";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  const external = !href.startsWith("mailto:");
  return (
    <a href={href} className={className} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}
