import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-xl place-items-center gap-4 px-4 py-32 text-center">
      <p className="font-mono text-sm text-accent">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">Game over — page not found.</h1>
      <p className="text-muted">The page you are looking for doesn&apos;t exist.</p>
      <Link href="/" className="rounded-full bg-fg px-5 py-2 text-sm font-medium text-bg">
        Back to the games
      </Link>
    </div>
  );
}
