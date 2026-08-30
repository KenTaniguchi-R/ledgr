/**
 * Theme preference: three states, not two.
 *
 * "system" is the default and follows the OS. The other two are explicit
 * overrides, which matter for a self-hosted app — a shared or work-managed
 * machine decides the OS theme for you, and before this there was no way to
 * disagree with it.
 *
 * The resolved value is applied as a class on <html>; see globals.css, where
 * `:root.dark` is the single definition of the dark palette.
 */

export const THEME_STORAGE_KEY = "ledgr:theme";

export const THEME_OPTIONS = ["system", "light", "dark"] as const;
export type Theme = (typeof THEME_OPTIONS)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEME_OPTIONS as readonly string[]).includes(value);
}

/**
 * Applied to <html> before first paint by the inline script in app/layout.tsx,
 * and again by the toggle whenever the preference changes.
 */
export function applyTheme(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    // Blocked site data — fall back to following the OS.
    return "system";
  }
}

/**
 * Source for the blocking <script> in the document head.
 *
 * This is a fixed string literal with no interpolation — nothing from a user,
 * a request, or the database reaches it, which is what makes it safe to inject
 * via dangerouslySetInnerHTML. Keep it that way: if this ever needs a dynamic
 * value, serialise it with JSON.stringify rather than concatenating.
 */
export const THEME_INIT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;
