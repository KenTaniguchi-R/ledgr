import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { initApp } from "./app-init";

interface TransactionRow {
  date: string;
  name: string;
  merchant: string | null;
  category: string | null;
  amountCents: number;
  amountDisplay: string;
  isIncome: boolean;
}

interface TableData {
  transactions: TransactionRow[];
  totalCount: number;
  page: number;
}

function TransactionTable({ data }: { data: TableData }) {
  const [sortKey, setSortKey] = useState<keyof TransactionRow>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...data.transactions].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const headerStyle = (key: keyof TransactionRow) => ({
    padding: "8px 12px",
    textAlign: "left" as const,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "var(--muted-foreground)",
    cursor: "pointer",
    borderBottom: "1px solid var(--border)",
    background: sortKey === key ? "var(--accent)" : "transparent",
  });

  function toggleSort(key: keyof TransactionRow) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div style={{ padding: "8px", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            <th style={headerStyle("date")} onClick={() => toggleSort("date")}>Date</th>
            <th style={headerStyle("name")} onClick={() => toggleSort("name")}>Description</th>
            <th style={headerStyle("category")} onClick={() => toggleSort("category")}>Category</th>
            <th style={{ ...headerStyle("amountCents"), textAlign: "right" }} onClick={() => toggleSort("amountCents")}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((txn, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>{txn.date}</td>
              <td style={{ padding: "8px 12px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {txn.merchant ?? txn.name}
              </td>
              <td style={{ padding: "8px 12px", color: txn.category ? "var(--foreground)" : "var(--muted-foreground)" }}>
                {txn.category ?? "Uncategorized"}
              </td>
              <td style={{
                padding: "8px 12px",
                textAlign: "right",
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                color: txn.isIncome ? "oklch(0.6 0.15 145)" : "var(--foreground)",
              }}>
                {txn.isIncome ? "+" : ""}{txn.amountDisplay}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.totalCount > data.transactions.length && (
        <div style={{ padding: "8px 12px", fontSize: "12px", color: "var(--muted-foreground)", textAlign: "center" }}>
          Showing {data.transactions.length} of {data.totalCount}
        </div>
      )}
    </div>
  );
}

function Root() {
  const [data, setData] = useState<TableData | null>(null);

  useEffect(() => {
    initApp((d) => setData(d as TableData));
  }, []);

  if (!data) {
    return <div style={{ padding: "16px", color: "var(--muted-foreground)" }}>Loading...</div>;
  }

  return <TransactionTable data={data} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
