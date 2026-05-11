export interface ColumnMapping {
  date?: string;
  amount?: string;
  credit?: string;
  debit?: string;
  description?: string;
  category?: string;
  reference?: string;
}

const REQUIRED_PATTERNS: Record<"date" | "amount" | "description", RegExp[]> = {
  date: [/^(transaction\s*)?date$/i, /^posted$/i, /^booking$/i, /^settlement/i],
  amount: [/^amount$/i, /^sum$/i, /^value$/i, /^total$/i],
  description: [/^desc(ription)?$/i, /^narr(ation)?$/i, /^memo$/i, /^detail$/i, /^payee$/i, /^merchant$/i, /^name$/i],
};

const OPTIONAL_PATTERNS: Record<"credit" | "debit" | "category" | "reference", RegExp[]> = {
  credit: [/^credit$/i, /^deposit$/i, /^cr$/i],
  debit: [/^debit$/i, /^withdrawal$/i, /^dr$/i, /^charge$/i],
  category: [/^category$/i, /^cat$/i, /^type$/i],
  reference: [/^ref(erence)?$/i, /^check$/i, /^cheque$/i],
};

function matchHeader(header: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(header.trim()));
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  for (const header of headers) {
    if (!mapping.date && matchHeader(header, REQUIRED_PATTERNS.date)) {
      mapping.date = header;
    } else if (!mapping.amount && matchHeader(header, REQUIRED_PATTERNS.amount)) {
      mapping.amount = header;
    } else if (!mapping.description && matchHeader(header, REQUIRED_PATTERNS.description)) {
      mapping.description = header;
    } else if (!mapping.credit && matchHeader(header, OPTIONAL_PATTERNS.credit)) {
      mapping.credit = header;
    } else if (!mapping.debit && matchHeader(header, OPTIONAL_PATTERNS.debit)) {
      mapping.debit = header;
    } else if (!mapping.category && matchHeader(header, OPTIONAL_PATTERNS.category)) {
      mapping.category = header;
    } else if (!mapping.reference && matchHeader(header, OPTIONAL_PATTERNS.reference)) {
      mapping.reference = header;
    }
  }

  if (mapping.credit || mapping.debit) {
    mapping.amount = undefined;
  }

  return mapping;
}

export interface ValidatedMapping {
  date: string;
  description: string;
  amount?: string;
  credit?: string;
  debit?: string;
  category?: string;
  reference?: string;
}

export function validateMapping(mapping: ColumnMapping): { valid: true; mapping: ValidatedMapping } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!mapping.date) errors.push("Date column is required");
  if (!mapping.description) errors.push("Description column is required");
  if (!mapping.amount && !mapping.credit && !mapping.debit) {
    errors.push("Amount column (or Credit/Debit columns) required");
  }
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, mapping: mapping as ValidatedMapping };
}
