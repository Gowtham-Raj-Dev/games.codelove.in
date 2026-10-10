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

let analytics: Promise<void> | undefined;

/** Starts Google Analytics for Firebase once. The SDK is loaded on demand, so it stays out of the main bundle. */
export function startAnalytics(): Promise<void> {
  analytics ??= (async () => {
    const [{ getApp, getApps, initializeApp }, { getAnalytics, isSupported }] = await Promise.all([
      import("firebase/app"),
      import("firebase/analytics"),
    ]);
    if (!(await isSupported())) return;
    getAnalytics(getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG));
  })().catch((error: unknown) => console.warn("Firebase Analytics failed to start", error));
  return analytics;
}
