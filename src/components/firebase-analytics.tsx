"use client";

import { useEffect } from "react";
import { startAnalytics } from "@/lib/firebase";

/** Hosts that never report analytics: local previews and the Android app (its WebView serves the packed site). */
const SKIP_HOSTS = new Set(["localhost", "127.0.0.1", "appassets.androidplatform.net"]);

/**
 * Google Analytics for Firebase on the published site (production builds only). Page views for client-side
 * navigation are recorded by GA4's enhanced measurement (browser history events), which is on by default.
 */
export function FirebaseAnalytics() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || SKIP_HOSTS.has(location.hostname)) return;
    void startAnalytics();
  }, []);
  return null;
}
