export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  desktop: GridItem[];
  tablet: GridItem[];
  mobile: GridItem[];
}

export interface WidgetConfig {
  id: string;
  title: string;
  defaultSize: { w: number; h: number };
}

export const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: "net-worth", title: "Net Worth", defaultSize: { w: 2, h: 2 } },
  { id: "accounts", title: "Account Balances", defaultSize: { w: 2, h: 1 } },
  { id: "summary", title: "Summary", defaultSize: { w: 2, h: 1 } },
  { id: "spending", title: "Spending", defaultSize: { w: 2, h: 2 } },
  { id: "cash-flow", title: "Cash Flow", defaultSize: { w: 2, h: 1 } },
  { id: "recent-txns", title: "Recent Transactions", defaultSize: { w: 2, h: 2 } },
  { id: "budgets", title: "Budget Progress", defaultSize: { w: 2, h: 1 } },
  { id: "bills", title: "Upcoming Bills", defaultSize: { w: 2, h: 1 } },
  { id: "investments", title: "Investments", defaultSize: { w: 2, h: 1 } },
];

export function getDefaultLayout(): { desktop: GridItem[]; tablet: GridItem[]; mobile: GridItem[] } {
  const desktop: GridItem[] = [
    { i: "net-worth", x: 0, y: 0, w: 2, h: 2 },
    { i: "accounts", x: 2, y: 0, w: 2, h: 1 },
    { i: "summary", x: 2, y: 1, w: 2, h: 1 },
    { i: "spending", x: 0, y: 2, w: 2, h: 2 },
    { i: "cash-flow", x: 2, y: 2, w: 2, h: 1 },
    { i: "recent-txns", x: 2, y: 3, w: 2, h: 2 },
    { i: "bills", x: 0, y: 5, w: 2, h: 1 },
    { i: "investments", x: 0, y: 4, w: 2, h: 1 },
  ];
  const tablet: GridItem[] = desktop.map((item, i) => ({ ...item, x: 0, y: i * item.h, w: 2 }));
  const mobile: GridItem[] = desktop.map((item, i) => ({ ...item, x: 0, y: i * item.h, w: 1 }));
  return { desktop, tablet, mobile };
}
