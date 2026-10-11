/** The visitor's choice: follow the system setting, or always light / dark. */
export type ThemeMode = "system" | "light" | "dark";

/** localStorage key of the choice. Nothing is stored while it is "system". */
export const THEME_KEY = "theme";

export const THEME_MODES: ThemeMode[] = ["system", "light", "dark"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs at the top of <body>, before the first paint, so the page never flashes the wrong theme: sets <html data-mode> to the
 * choice and <html data-theme> to the theme it means right now. Same logic as applyTheme() below.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,m="system";try{var s=localStorage.getItem("${THEME_KEY}");if(s==="light"||s==="dark")m=s}catch(e){}d.setAttribute("data-mode",m);d.setAttribute("data-theme",m==="system"?(matchMedia("${DARK_QUERY}").matches?"dark":"light"):m)})()`;

export function storedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.setAttribute("data-mode", mode);
  root.setAttribute("data-theme", mode === "system" ? (matchMedia(DARK_QUERY).matches ? "dark" : "light") : mode);
}

export function saveTheme(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Private mode or storage blocked: the choice lasts until the page is reloaded.
  }
  applyTheme(mode);
}

/** Calls `onChange` when the system switches between light and dark. Returns the cleanup. */
export function watchSystemTheme(onChange: () => void) {
  const query = matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
