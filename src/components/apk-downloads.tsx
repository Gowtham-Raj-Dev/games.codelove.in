"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FIREBASE_CONFIG } from "@/lib/firebase";

/**
 * How many times each game's Android APK was downloaded: one number per game in Firebase's Realtime Database
 * (downloads/<slug>), raised by one when somebody taps "Download for Android" (at most once per phone and version) and
 * read back to show on the game's page. If the database cannot be reached (or the rules are not published yet) the
 * count is simply not shown and the download itself is never blocked.
 */
const SKIP_HOSTS = new Set(["localhost", "127.0.0.1", "appassets.androidplatform.net"]);
const EVENT = "apk-downloaded";

async function open() {
  const [{ getApp, getApps, initializeApp }, fb] = await Promise.all([import("firebase/app"), import("firebase/database")]);
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
  return { fb, db: fb.getDatabase(app, FIREBASE_CONFIG.databaseURL) };
}

async function readCount(slug: string): Promise<number | null> {
  try {
    const { fb, db } = await open();
    const snap = await fb.get(fb.ref(db, `downloads/${slug}`));
    return snap.exists() ? Number(snap.val()) || 0 : 0;
  } catch {
    return null;
  }
}

async function addCount(slug: string): Promise<boolean> {
  try {
    const { fb, db } = await open();
    await fb.set(fb.ref(db, `downloads/${slug}`), fb.increment(1));
    return true;
  } catch {
    return false;
  }
}

/** The "Download for Android" link: counts the download, then lets the browser save the file as usual. */
export function ApkDownloadLink({ slug, version, href, filename, className, children }: { slug: string; version: string; href: string; filename: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      download={filename}
      type="application/vnd.android.package-archive"
      className={className}
      onClick={() => {
        if (SKIP_HOSTS.has(location.hostname)) return;
        const key = `apk-counted:${slug}:${version}`;
        try {
          if (localStorage.getItem(key)) return; // this phone has been counted for this version
        } catch {
          /* storage blocked: count anyway */
        }
        void addCount(slug).then((ok) => {
          if (!ok) return;
          try {
            localStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new CustomEvent(EVENT, { detail: slug }));
        });
      }}
    >
      {children}
    </a>
  );
}

/** "1,234 downloads", shown once the number is known. */
export function ApkDownloadCount({ slug, className }: { slug: string; className?: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void readCount(slug).then((n) => live && setCount(n));
    load();
    const onDone = (e: Event) => {
      if ((e as CustomEvent).detail === slug) load();
    };
    window.addEventListener(EVENT, onDone);
    return () => {
      live = false;
      window.removeEventListener(EVENT, onDone);
    };
  }, [slug]);
  if (count === null) return null;
  return <span className={className}>{count.toLocaleString("en-IN")} {count === 1 ? "download" : "downloads"}</span>;
}
