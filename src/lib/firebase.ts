/**
 * Firebase web app config (project d-models-bfb95). These are public identifiers, not secrets — every
 * visitor's browser receives them; access to Firebase data is controlled by security rules.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDq3rfr1eZQuU0QRKgOzFMfQRlnvGSBAuI",
  authDomain: "d-models-bfb95.firebaseapp.com",
  projectId: "d-models-bfb95",
  storageBucket: "d-models-bfb95.firebasestorage.app",
  messagingSenderId: "919514664227",
  appId: "1:919514664227:web:d73acc2d535463aed95096",
  measurementId: "G-65L0LB1CJT",
  /** Realtime Database (Singapore): Cannon Cove's online battle rooms. */
  databaseURL: "https://d-models-bfb95-default-rtdb.asia-southeast1.firebasedatabase.app",
};

/**
 * The games site's own GA4 property. Visits also go to the network property above (G-65L0LB1CJT, shared by
 * the CodeLove sites), so both keep counting.
 */
export const GAMES_GA_ID = "G-MEHYR05XXV";

let analytics: Promise<void> | undefined;

/**
 * Starts Google Analytics for Firebase once, then adds the games property to the same gtag. The SDK is loaded
 * on demand, so it stays out of the main bundle.
 */
export function startAnalytics(): Promise<void> {
  analytics ??= (async () => {
    const [{ getApp, getApps, initializeApp }, { getAnalytics, isSupported }] = await Promise.all([
      import("firebase/app"),
      import("firebase/analytics"),
    ]);
    if (!(await isSupported())) return;
    getAnalytics(getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG));
    // Straight into gtag.js's queue: Firebase's wrapped window.gtag holds back IDs that aren't its own.
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer ??= [];
    // gtag.js only reads entries pushed as an `arguments` object.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (function (_command: string, _id: string) {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    })("config", GAMES_GA_ID);
  })().catch((error: unknown) => console.warn("Firebase Analytics failed to start", error));
  return analytics;
}
