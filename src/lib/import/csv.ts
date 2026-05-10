import Papa from "papaparse";

export interface CsvPreview {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
  totalRows: number;
}

export function parsePreview(content: string): CsvPreview {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    preview: 10,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const fullCount = Papa.parse(content, { header: true, skipEmptyLines: true });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    delimiter: result.meta.delimiter,
    totalRows: fullCount.data.length,
  };
}

export function parseAll(content: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}
