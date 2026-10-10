import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { FirebaseAnalytics } from "@/components/firebase-analytics";
import { JsonLd } from "@/components/json-ld";
import { SiteChrome } from "@/components/site-chrome";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import { DEFAULT_IMAGE } from "@/lib/seo";
import { absoluteUrl, CODELOVE, SITE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Free 3D Games Online`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: SITE.keywords,
  category: "games",
  authors: [{ name: SITE.author }],
  creator: SITE.author,
  publisher: SITE.brand,
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { title: SITE.shortName, statusBarStyle: "black-translucent" },
  // Share card for a route that sets none of its own (today only the 404 page): pageMetadata() replaces both on
  // every page. No canonical here on purpose — a page that forgot its own would inherit it and point at the wrong URL.
  openGraph: { type: "website", siteName: SITE.brand, locale: SITE.locale, images: [DEFAULT_IMAGE] },
  twitter: { card: "summary_large_image", images: [DEFAULT_IMAGE.url] },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
  // <meta name="google-adsense-account">: how AdSense checks that the site belongs to the publisher.
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

/** CodeLove's "@id" is on its own domain, so every CodeLove site's structured data names the same publisher. */
const publisherId = `${CODELOVE.url}/#organization`;

const siteJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.brand,
    alternateName: SITE.shortName,
    url: absoluteUrl("/"),
    description: SITE.description,
    inLanguage: "en",
    creator: { "@type": "Person", name: SITE.author },
    publisher: { "@id": publisherId },
  },
  { "@context": "https://schema.org", "@type": "Organization", "@id": publisherId, name: CODELOVE.name, url: CODELOVE.url },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* The AdSense loader, on every page once a publisher ID is set. The site has no ad units, so ads show only where Auto ads is switched on in the AdSense account. */}
      {ADSENSE_CLIENT ? (
        <head>
          <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} crossOrigin="anonymous" />
        </head>
      ) : null}
      <body className="flex min-h-full flex-col">
        <JsonLd data={siteJsonLd} />
        <FirebaseAnalytics />
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-fg px-4 py-2 text-sm text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteChrome>
          <SiteHeader />
        </SiteChrome>
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteChrome>
          <SiteFooter />
        </SiteChrome>
      </body>
    </html>
  );
}
