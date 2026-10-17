import type { Metadata } from "next";
import { SITE } from "@/lib/site";

/** The share image of pages without their own, and the root layout's fallback card. */
export const DEFAULT_IMAGE = { url: "/og/default.jpg", width: 1200, height: 630, alt: `${SITE.name} — free 3D games online` };

/**
 * Search results show about 160 characters of a description, so longer text is cut at the last whole
 * sentence that fits, or else at a word with an ellipsis.
 */
export function clampDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const sentenceEnd = head.lastIndexOf(". ");
  if (sentenceEnd >= 80) return head.slice(0, sentenceEnd + 1);
  return `${head.slice(0, head.lastIndexOf(" ")).replace(/[,;:—-]+$/, "")}…`;
}

/**
 * Per-page metadata: canonical URL, Open Graph and Twitter card. Next.js replaces (rather than
 * merges) the layout's openGraph/twitter objects, so every page builds the full set here.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  keywords,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  /** Route path with trailing slash, e.g. "/sky-hop/". */
  path: string;
  image?: { url: string; alt: string };
  keywords?: string[];
  /** Use the title as-is instead of the "%s | games.codelove.in" template. */
  absoluteTitle?: boolean;
}): Metadata {
  description = clampDescription(description);
  const ogImage = image ? { ...image, width: 1200, height: 630 } : DEFAULT_IMAGE;
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    ...(keywords ? { keywords: [...new Set(keywords.filter(Boolean))] } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE.brand,
      locale: SITE.locale,
      url: path,
      title: fullTitle,
      description,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [ogImage.url],
    },
  };
}
