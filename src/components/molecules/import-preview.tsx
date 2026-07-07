"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      <div className="rounded border">
        <Table className="text-xs">
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {headers.map((h) => (
                <TableHead key={h} className="h-auto px-3 py-2">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                {headers.map((h) => (
                  <TableCell key={h} className="px-3 py-1.5 truncate max-w-[200px]">{row[h]}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
