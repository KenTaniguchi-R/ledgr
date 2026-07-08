export interface OfxTransaction {
  date: string;
  amount: number;
  description: string;
  type: string;
  fitId: string;
}

function parseDateOFX(dtStr: string): string {
  const clean = dtStr.trim().slice(0, 8);
  if (clean.length !== 8) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

function amountToCents(amtStr: string): number {
  const cleaned = amtStr.replace(/[,\s]/g, "").trim();
  return Math.round(parseFloat(cleaned) * 100);
}

// The OFX field set is fixed (TRNTYPE, DTPOSTED, TRNAMT, FITID, NAME, MEMO),
// so compile each field's patterns once and reuse across all blocks/files
// instead of rebuilding two RegExps on every extractField call.
const FIELD_PATTERNS = new Map<string, { xml: RegExp; sgml: RegExp }>();

function fieldPatterns(field: string): { xml: RegExp; sgml: RegExp } {
  let patterns = FIELD_PATTERNS.get(field);
  if (!patterns) {
    patterns = {
      xml: new RegExp(`<${field}>([^<]+)</${field}>`, "i"),
      sgml: new RegExp(`<${field}>([^\\n<]+)`, "i"),
    };
    FIELD_PATTERNS.set(field, patterns);
  }
  return patterns;
}

function extractField(block: string, field: string): string {
  const { xml, sgml } = fieldPatterns(field);

  const xmlMatch = block.match(xml);
  if (xmlMatch) return xmlMatch[1].trim();

  const sgmlMatch = block.match(sgml);
  if (sgmlMatch) return sgmlMatch[1].trim();

  return "";
}

export function parseOfx(content: string): OfxTransaction[] {
  const transactions: OfxTransaction[] = [];
  const blocks = content.split(/<STMTTRN>/i).slice(1);

  for (const block of blocks) {
    const endIdx = block.search(/<\/STMTTRN>|<STMTTRN>/i);
    const txnBlock = endIdx > -1 ? block.slice(0, endIdx) : block;

    const type = extractField(txnBlock, "TRNTYPE");
    const dateRaw = extractField(txnBlock, "DTPOSTED");
    const amountRaw = extractField(txnBlock, "TRNAMT");
    const fitId = extractField(txnBlock, "FITID");
    const name = extractField(txnBlock, "NAME") || extractField(txnBlock, "MEMO");

    if (!dateRaw || !amountRaw || !fitId) continue;

    transactions.push({
      date: parseDateOFX(dateRaw),
      amount: amountToCents(amountRaw),
      description: name,
      type: type || "OTHER",
      fitId,
    });
  }

  return transactions;
}
