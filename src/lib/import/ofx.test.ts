import { describe, test, expect } from "vitest";
import { parseOfx } from "./ofx";

const OFX_V1_SAMPLE = `
OFXHEADER:100
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-25.50
<FITID>TXN001
<NAME>STARBUCKS
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>100.00
<FITID>TXN002
<NAME>PAYROLL DEPOSIT
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const OFX_V2_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20240115</DTPOSTED>
<TRNAMT>-42.00</TRNAMT>
<FITID>XML001</FITID>
<NAME>GROCERY STORE</NAME>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

describe("parseOfx", () => {
  test("parses OFX v1 (SGML) transactions", () => {
    const result = parseOfx(OFX_V1_SAMPLE);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: "2024-01-15",
      amount: -2550,
      description: "STARBUCKS",
      type: "DEBIT",
      fitId: "TXN001",
    });
    expect(result[1]).toEqual({
      date: "2024-01-16",
      amount: 10000,
      description: "PAYROLL DEPOSIT",
      type: "CREDIT",
      fitId: "TXN002",
    });
  });

  test("parses OFX v2 (XML) transactions", () => {
    const result = parseOfx(OFX_V2_SAMPLE);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2024-01-15",
      amount: -4200,
      description: "GROCERY STORE",
      type: "DEBIT",
      fitId: "XML001",
    });
  });

  test("returns empty array for invalid content", () => {
    const result = parseOfx("not an OFX file at all");
    expect(result).toEqual([]);
  });
});
