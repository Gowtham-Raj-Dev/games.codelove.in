"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Full-screen app routes that render without the site header and footer: the game players (/<slug>/play/). */
const APP_ROUTES = [/^\/[^/]+\/play\/?$/];

/** Renders its children (the header or footer) everywhere except on full-screen app routes. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return APP_ROUTES.some((route) => route.test(pathname)) ? null : children;
}
