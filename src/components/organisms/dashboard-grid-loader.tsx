"use client";

import dynamic from "next/dynamic";
import type { DashboardData } from "./dashboard-grid";
import type { DashboardLayout } from "./widgets/registry";

const DashboardGrid = dynamic(
  () => import("./dashboard-grid").then((m) => ({ default: m.DashboardGrid })),
  {
    ssr: false,
    loading: () => <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>,
  }
);

interface DashboardGridLoaderProps {
  layout: DashboardLayout;
  data: DashboardData;
}

export function DashboardGridLoader(props: DashboardGridLoaderProps) {
  return <DashboardGrid {...props} />;
}
