"use client";

import { useEffect, useLayoutEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, saveTheme, storedTheme, THEME_KEY, THEME_MODES, watchSystemTheme } from "@/lib/theme";

/**
 * Header button that steps through the themes: system → light → dark. The icon follows <html data-mode> in CSS
 * (globals.css), so the server-rendered button is already right when the page appears.
 */
export function ThemeToggle() {
  // In development Strict Mode's remount clears the attributes THEME_SCRIPT set on <html>; put them back before paint.
  useLayoutEffect(() => {
    applyTheme(storedTheme());
  }, []);

  // Follow the system while the choice is "system", and a choice made in another tab.
  useEffect(() => {
    const sync = () => applyTheme(storedTheme());
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === null) sync();
    };
    const unwatch = watchSystemTheme(sync);
    window.addEventListener("storage", onStorage);
    return () => {
      unwatch();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const next = () => saveTheme(THEME_MODES[(THEME_MODES.indexOf(storedTheme()) + 1) % THEME_MODES.length]);

  return (
    <button
      type="button"
      onClick={next}
      aria-label="Switch theme: system, light or dark"
      title="Switch theme: system, light or dark"
      className="ml-1 grid size-9 shrink-0 place-items-center rounded-full border-2 border-fg bg-surface text-fg transition hover:bg-accent-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Monitor data-theme-icon="system" className="size-4" />
      <Sun data-theme-icon="light" className="size-4" />
      <Moon data-theme-icon="dark" className="size-4" />
    </button>
  );
}
