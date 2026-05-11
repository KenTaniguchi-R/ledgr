import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { initApp } from "./app-init";

interface DataPoint {
  date: string;
  assetsCents: number;
  liabilitiesCents: number;
  netWorthCents: number;
  assetsDisplay: string;
  liabilitiesDisplay: string;
  netWorthDisplay: string;
}

interface NetWorthData {
  points: DataPoint[];
  currentNetWorthDisplay: string;
  changeDisplay: string;
  changePercent: number;
}

function NetWorthTrend({ data }: { data: NetWorthData }) {
  const isPositiveChange = data.changePercent >= 0;

  return (
    <div style={{ padding: "16px" }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>Net Worth</div>
        <div style={{ fontSize: "24px", fontWeight: 600 }}>{data.currentNetWorthDisplay}</div>
        <div style={{
          fontSize: "13px",
          color: isPositiveChange ? "oklch(0.6 0.15 145)" : "oklch(0.577 0.245 27.325)",
        }}>
          {isPositiveChange ? "+" : ""}{data.changeDisplay} ({isPositiveChange ? "+" : ""}{data.changePercent.toFixed(1)}%)
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data.points}>
          <defs>
            <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(d: string) => {
              const [, m] = d.split("-");
              const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              return months[parseInt(m)] ?? d;
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `$${(v / 100000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: "12px",
            }}
            formatter={(_, _name, props) => {
              const p = props.payload as DataPoint;
              return [p.netWorthDisplay, "Net Worth"];
            }}
            labelFormatter={(label) => String(label)}
          />
          <Area
            type="monotone"
            dataKey="netWorthCents"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#netWorthGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Root() {
  const [data, setData] = useState<NetWorthData | null>(null);

  useEffect(() => {
    initApp((d) => setData(d as NetWorthData));
  }, []);

  if (!data) {
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <NetWorthTrend data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
