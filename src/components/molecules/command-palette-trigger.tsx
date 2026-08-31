"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { CommandPalette } from "@/components/organisms/command-palette";

/** Platform is fixed for the life of the page, so there is nothing to notify. */
function noopSubscribe() {
  return () => {};
}

function detectMac() {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** Matches the common case, so the first paint rarely shows the wrong key. */
function assumeMacOnServer() {
  return true;
}

/**
 * Opens the command palette.
 *
 * The button matters as much as the shortcut: a palette reachable only by ⌘K
 * is invisible to anyone who does not already know it exists, which is most
 * people the first time. The shortcut is printed on the button so it teaches
 * itself.
 */
export function CommandPaletteTrigger() {
  const [open, setOpen] = useState(false);

  // Read through an external store rather than an effect: the platform never
  // changes, so there is nothing to subscribe to, and the server snapshot keeps
  // hydration consistent without writing state from inside an effect.
  const isMac = useSyncExternalStore(noopSubscribe, detectMac, assumeMacOnServer);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // metaKey on macOS, ctrlKey elsewhere — binding only one strands half of
      // the users on a shortcut their keyboard cannot produce.
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5 text-left text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Search…</span>
        <kbd className="shrink-0 rounded border border-sidebar-border px-1 py-0.5 font-sans text-[10px] text-sidebar-foreground/50">
          {isMac ? "⌘" : "Ctrl "}K
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
