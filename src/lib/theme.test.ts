import { describe, it, expect, afterEach, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  THEME_OPTIONS,
  THEME_INIT,
  isTheme,
  applyTheme,
  readStoredTheme,
} from "./theme";

/**
 * These run in the node environment (see vitest.stryker.config.ts), so the
 * few browser globals the module touches are stubbed rather than assumed.
 */

function stubStorage(initial: Record<string, string> = {}, throws = false) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem(key: string) {
      if (throws) throw new Error("blocked");
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (throws) throw new Error("blocked");
      store.set(key, value);
    },
  });
  return store;
}

function stubDom(prefersDark: boolean) {
  const classes = new Set<string>();
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({ matches: query.includes("dark") && prefersDark }),
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        toggle(name: string, force: boolean) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
    },
  });
  return classes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isTheme", () => {
  it.each(THEME_OPTIONS)("accepts %s", (value) => {
    expect(isTheme(value)).toBe(true);
  });

  it.each([
    ["", "empty string"],
    ["Dark", "wrong case"],
    ["system ", "trailing space"],
    ["auto", "unknown value"],
  ])("rejects %s (%s)", (value) => {
    expect(isTheme(value)).toBe(false);
  });

  it.each([null, undefined, 0, 1, {}, [], true])("rejects the non-string %s", (value) => {
    expect(isTheme(value)).toBe(false);
  });
});

describe("readStoredTheme", () => {
  it("returns the stored preference", () => {
    stubStorage({ [THEME_STORAGE_KEY]: "dark" });
    expect(readStoredTheme()).toBe("dark");
  });

  it("falls back to system when nothing is stored", () => {
    stubStorage();
    expect(readStoredTheme()).toBe("system");
  });

  it("falls back to system when the stored value is not a theme", () => {
    // A stale or hand-edited value must not reach applyTheme.
    stubStorage({ [THEME_STORAGE_KEY]: "solarized" });
    expect(readStoredTheme()).toBe("system");
  });

  it("falls back to system when storage throws", () => {
    // Private browsing or blocked site data.
    stubStorage({}, true);
    expect(readStoredTheme()).toBe("system");
  });
});

describe("applyTheme", () => {
  it("adds the dark class for an explicit dark choice, whatever the OS says", () => {
    const classes = stubDom(false);
    applyTheme("dark");
    expect(classes.has("dark")).toBe(true);
  });

  it("removes the dark class for an explicit light choice, whatever the OS says", () => {
    const classes = stubDom(true);
    applyTheme("light");
    expect(classes.has("dark")).toBe(false);
  });

  it("adds dark under system when the OS prefers dark", () => {
    const classes = stubDom(true);
    applyTheme("system");
    expect(classes.has("dark")).toBe(true);
  });

  it("does not add dark under system when the OS prefers light", () => {
    const classes = stubDom(false);
    applyTheme("system");
    expect(classes.has("dark")).toBe(false);
  });
});

describe("THEME_INIT", () => {
  it("references the same storage key the rest of the module uses", () => {
    // The script is a string, so a renamed key would otherwise desync silently
    // and the stored preference would be ignored on first paint.
    expect(THEME_INIT).toContain(THEME_STORAGE_KEY);
  });

  it("carries no interpolation beyond that key", () => {
    // It is injected via dangerouslySetInnerHTML. Nothing dynamic may appear.
    expect(THEME_INIT).not.toContain("${");
  });

  it("cannot break out of the script element", () => {
    expect(THEME_INIT).not.toContain("</script");
  });

  // The script runs before first paint and is the only thing standing between
  // the user and a flash of the wrong theme, so it is executed here rather than
  // just pattern-matched. `new Function` over `eval`: same purpose, but it does
  // not get the enclosing scope. The input is this module's own constant, which
  // the tests above pin as free of interpolation.
  describe("behaves the same as applyTheme", () => {
    it.each([
      { stored: "dark", prefersDark: false, expectDark: true },
      { stored: "light", prefersDark: true, expectDark: false },
      { stored: "system", prefersDark: true, expectDark: true },
      { stored: "system", prefersDark: false, expectDark: false },
      { stored: null, prefersDark: true, expectDark: true },
      { stored: null, prefersDark: false, expectDark: false },
    ])("stored=$stored prefersDark=$prefersDark -> dark=$expectDark", ({ stored, prefersDark, expectDark }) => {
      const classes = stubDom(prefersDark);
      stubStorage(stored ? { [THEME_STORAGE_KEY]: stored } : {});
      new Function(THEME_INIT)();
      expect(classes.has("dark")).toBe(expectDark);
    });
  });
});
