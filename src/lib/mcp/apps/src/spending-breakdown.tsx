import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { initApp } from "./app-init";

interface CategoryData {
  name: string;
  amountCents: number;
  amountDisplay: string;
  percentage: number;
}

interface SpendingData {
  categories: CategoryData[];
  period: string;
  totalDisplay: string;
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function SpendingBreakdown({ data }: { data: SpendingData }) {
  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>
          {data.period}
        </div>
        <div style={{ fontSize: "24px", fontWeight: 600 }}>
          {data.totalDisplay}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data.categories}
            dataKey="amountCents"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            strokeWidth={2}
            stroke="var(--background)"
          >
            {data.categories.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(_, name, props) => [props.payload.amountDisplay, name]}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: "12px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div style={{ marginTop: "12px" }}>
        {data.categories.map((cat, i) => (
          <div
            key={cat.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 0",
              borderBottom: "1px solid var(--border)",
              fontSize: "13px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "2px",
                  background: CHART_COLORS[i % CHART_COLORS.length],
                }}
              />
              <span>{cat.name}</span>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ color: "var(--muted-foreground)" }}>{cat.percentage}%</span>
              <span style={{ fontWeight: 500 }}>{cat.amountDisplay}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Root() {
  const [data, setData] = useState<SpendingData | null>(null);

  useEffect(() => {
    initApp((d) => setData(d as SpendingData));
  }, []);

  if (!data) {
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <SpendingBreakdown data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
