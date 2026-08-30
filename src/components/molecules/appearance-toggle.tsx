"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  readStoredTheme,
  isTheme,
  type Theme,
} from "@/lib/theme";

const CHANGE_EVENT = "ledgr:theme-change";

const CHOICES: { value: Theme; label: string; icon: typeof Monitor }[] = [
  { value: "system", label: "Use device settings", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

// Read through an external store so the server render and the first client
// render agree on "system" and reconcile after hydration, rather than writing
// state from an effect.
function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    media.removeEventListener("change", onChange);
  };
}

function systemOnServer(): Theme {
  return "system";
}

export function AppearanceToggle() {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, systemOnServer);

  // Base UI models a toggle group as an array even when only one item can be
  // active, and hands back an empty array when the active item is clicked
  // again. Ignoring a non-theme value keeps one option always selected.
  function select(groupValue: string[]) {
    const next = groupValue[0];
    if (!isTheme(next)) return;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Blocked site data — the theme still applies for this page view.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Ledgr follows your device by default. Override it here if the machine
          you are on decides differently than you would.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          value={[theme]}
          onValueChange={select}
          variant="outline"
          spacing={1}
          aria-label="Appearance"
        >
          {CHOICES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              // The shared toggle marks the active item with `bg-muted`, which
              // sits ~0.045 lightness from the card in dark mode — too close to
              // read as selected on the one control whose entire job is showing
              // which option is active. Inverting against `primary` is legible
              // in both themes.
              className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary"
            >
              <Icon />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}
