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
  defaultHeight: number;
}

export const DASHBOARD_WIDGETS: WidgetConfig[] = [
  { id: "net-worth", title: "Net Worth", defaultHeight: 2 },
  { id: "accounts", title: "Account Balances", defaultHeight: 2 },
  { id: "summary", title: "Summary", defaultHeight: 2 },
  { id: "spending", title: "Spending", defaultHeight: 2 },
  { id: "cash-flow", title: "Cash Flow", defaultHeight: 2 },
  { id: "recent-txns", title: "Recent Transactions", defaultHeight: 2 },
  { id: "budgets", title: "Budget Progress", defaultHeight: 1 },
  { id: "bills", title: "Upcoming Bills", defaultHeight: 2 },
  { id: "investments", title: "Investments", defaultHeight: 1 },
];

export const WIDGET_TITLE_MAP = new Map(
  DASHBOARD_WIDGETS.map((w) => [w.id, w.title]),
);

const DESKTOP_ORDER: { id: string; col: 0 | 1 }[] = [
  { id: "net-worth", col: 0 },
  { id: "accounts", col: 1 },
  { id: "cash-flow", col: 1 },
  { id: "summary", col: 0 },
  { id: "spending", col: 1 },
  { id: "recent-txns", col: 0 },
  { id: "bills", col: 1 },
  { id: "investments", col: 0 },
];

function buildDesktopLayout(): GridItem[] {
  const colY = [0, 0];
  const heightMap = new Map(
    DASHBOARD_WIDGETS.map((w) => [w.id, w.defaultHeight]),
  );

  return DESKTOP_ORDER.map(({ id, col }) => {
    const h = heightMap.get(id) ?? 1;
    const y = colY[col];
    colY[col] += h;
    return { i: id, x: col, y, w: 1, h };
  });
}

export function getDefaultLayout(): DashboardLayout {
  const desktop = buildDesktopLayout();
  const mobile: GridItem[] = [];
  let y = 0;
  for (const item of desktop) {
    mobile.push({ ...item, x: 0, y, w: 1 });
    y += item.h;
  }
  return { desktop, tablet: desktop, mobile };
}
