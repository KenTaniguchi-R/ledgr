"use client";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/organisms/sidebar-nav";

interface DashboardShellProps {
  userName: string;
  userEmail: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function DashboardShell({ userName, userEmail, defaultOpen = true, children }: DashboardShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <SidebarNav userName={userName} userEmail={userEmail} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] bg-background/95 backdrop-blur-sm md:hidden">
          <SidebarTrigger className="h-11 w-11" />
          <span className="text-sm font-semibold">Ledgr</span>
        </header>
        {/* The AI assistant button is `fixed bottom-6 right-6`, so it floats over
            whatever the page ends with. Reserve its height (56px + 24px inset)
            plus a gap, so content can always be scrolled clear of it.
            On lg+ there's width to spare, so the same footprint is also
            reserved on the right — a "gutter" for the FAB — rather than
            letting it sit on top of a wide table's last column, which is
            where a report table's rightmost header lands at that width. */}
        <main className="flex-1 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-24 lg:pl-8 lg:pr-24">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
