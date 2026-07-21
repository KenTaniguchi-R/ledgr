"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  ArrowLeftRight,
  TrendingUp,
  Wallet,
  BarChart3,
  Receipt,
  LogOut,
  Upload,
  Settings,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface SidebarNavProps {
  userName: string;
  userEmail: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Money",
    items: [
      { href: "/accounts", label: "Accounts", icon: Building2 },
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/investments", label: "Investments", icon: TrendingUp },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/budgets", label: "Budgets", icon: Wallet },
      { href: "/bills", label: "Bills", icon: Receipt },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/import", label: "Import", icon: Upload },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function SidebarNav({ userName, userEmail }: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const closeMobile = useCallback(() => setOpenMobile(false), [setOpenMobile]);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="flex size-5 items-center justify-center rounded-md bg-positive text-[11px] font-extrabold text-background">
            L
          </span>
          Ledgr
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label ?? "root"} className="py-0.5">
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={
                        <Link
                          href={item.href}
                          onClick={closeMobile}
                        />
                      }
                      isActive={isActive}
                      tooltip={item.label}
                      className="data-active:bg-positive/10 data-active:text-positive"
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between px-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {userEmail}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
