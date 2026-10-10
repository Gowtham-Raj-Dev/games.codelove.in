/**
 * Google AdSense publisher ID, e.g. "ca-pub-1234567890123456".
 *
 * While it is empty the site loads nothing from AdSense. Once set, the root layout adds the AdSense account meta
 * tag and loader script to every page, and /ads.txt (src/app/ads.txt/route.ts) lists the publisher. The site has
 * no ad units of its own: ads then show only where Auto ads is switched on in the AdSense account.
 */
export const ADSENSE_CLIENT: string = "ca-pub-1282068947061740";
