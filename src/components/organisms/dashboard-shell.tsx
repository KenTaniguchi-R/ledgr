"use client";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/organisms/sidebar-nav";

interface DashboardShellProps {
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}

export function DashboardShell({ userName, userEmail, children }: DashboardShellProps) {
  return (
    <SidebarProvider defaultOpen>
      <SidebarNav userName={userName} userEmail={userEmail} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] bg-background/95 backdrop-blur-sm md:hidden">
          <SidebarTrigger className="h-11 w-11" />
          <span className="text-sm font-semibold">Ledgr</span>
        </header>
        <main className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
