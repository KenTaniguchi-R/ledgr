import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { initApp } from "./app-init";

interface BudgetCategory {
  name: string;
  allocatedCents: number;
  spentCents: number;
  allocatedDisplay: string;
  spentDisplay: string;
  percentUsed: number;
}

interface BudgetData {
  month: string;
  categories: BudgetCategory[];
  totalAllocatedDisplay: string;
  totalSpentDisplay: string;
  daysRemaining: number;
}

function getBarColor(percent: number): string {
  if (percent > 100) return "oklch(0.577 0.245 27.325)";
  if (percent > 80) return "oklch(0.75 0.18 85)";
  return "oklch(0.6 0.15 145)";
}

function BudgetProgress({ data }: { data: BudgetData }) {
  const totalPercent =
    data.categories.reduce((s, c) => s + c.spentCents, 0) /
    Math.max(data.categories.reduce((s, c) => s + c.allocatedCents, 0), 1) * 100;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
          {data.month} · {data.daysRemaining} days left
        </div>
        <div style={{ fontSize: "20px", fontWeight: 600 }}>
          {data.totalSpentDisplay}{" "}
          <span style={{ fontSize: "14px", fontWeight: 400, color: "var(--muted-foreground)" }}>
            of {data.totalAllocatedDisplay} ({Math.round(totalPercent)}%)
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {data.categories.map((cat) => (
          <div key={cat.name}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
              <span>{cat.name}</span>
              <span style={{ color: "var(--muted-foreground)" }}>{cat.spentDisplay} / {cat.allocatedDisplay}</span>
            </div>
            <div style={{ height: "8px", borderRadius: "4px", background: "var(--muted)", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(cat.percentUsed, 100)}%`,
                borderRadius: "4px",
                background: getBarColor(cat.percentUsed),
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Root() {
  const [data, setData] = useState<BudgetData | null>(null);

  useEffect(() => {
    initApp((d) => setData(d as BudgetData));
  }, []);

  if (!data) {
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <BudgetProgress data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
