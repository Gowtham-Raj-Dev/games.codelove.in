import { ADSENSE_CLIENT } from "@/lib/adsense";

export const dynamic = "force-static";

/**
 * Authorized Digital Sellers file (https://iabtechlab.com/ads-txt/): tells ad buyers that Google may sell this
 * site's ad space for the AdSense publisher in src/lib/adsense.ts. ads.txt names the ID without its "ca-" prefix.
 */
export function GET() {
  const body = ADSENSE_CLIENT
    ? `google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`
    : "# The Google AdSense publisher ID is not configured yet (src/lib/adsense.ts).\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
