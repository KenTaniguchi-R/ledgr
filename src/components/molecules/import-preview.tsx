"use client";

interface Props {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export function ImportPreview({ headers, rows, totalRows }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Showing {rows.length} of {totalRows} rows
      </p>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t">
                {headers.map((h) => (
                  <td key={h} className="px-3 py-1.5 truncate max-w-[200px]">{row[h]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
