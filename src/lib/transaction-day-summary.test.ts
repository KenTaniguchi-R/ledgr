import { describe, it, expect } from "vitest";
import { summarizeDay, dayCountLabel } from "./transaction-day-summary";

const spend = (normalizedAmount: number) => ({ isTransfer: false, normalizedAmount });
const transfer = (normalizedAmount: number) => ({ isTransfer: true, normalizedAmount });

describe("summarizeDay", () => {
  it("excludes transfers from the net", () => {
    const summary = summarizeDay([spend(-8642), transfer(-100000), spend(-1860)]);

    expect(summary.net).toBe(-10502);
    expect(summary.spendingCount).toBe(2);
    expect(summary.transferCount).toBe(1);
  });

  it("nets a day of spending alone unchanged", () => {
    expect(summarizeDay([spend(420000), spend(-1199)]).net).toBe(418801);
  });

  it("reports a zero net for a day that is only transfers", () => {
    const summary = summarizeDay([transfer(-50000), transfer(1275)]);

    expect(summary).toEqual({ spendingCount: 0, transferCount: 2, net: 0 });
  });

  // isTransfer is nullable on the row, and a null must not be read as a transfer.
  it("counts a null isTransfer as spending", () => {
    const summary = summarizeDay([{ isTransfer: null, normalizedAmount: -500 }]);

    expect(summary).toEqual({ spendingCount: 1, transferCount: 0, net: -500 });
  });
});

describe("dayCountLabel", () => {
  it("says 'transactions' while no transfer is present", () => {
    expect(dayCountLabel({ spendingCount: 4, transferCount: 0, net: 0 })).toBe("4 transactions");
    expect(dayCountLabel({ spendingCount: 1, transferCount: 0, net: 0 })).toBe("1 transaction");
  });

  it("names the two counts apart once a transfer is present", () => {
    expect(dayCountLabel({ spendingCount: 2, transferCount: 2, net: 0 })).toBe(
      "2 spending · 2 transfers",
    );
    expect(dayCountLabel({ spendingCount: 2, transferCount: 1, net: 0 })).toBe(
      "2 spending · 1 transfer",
    );
  });

  it("drops the spending half when the day is only transfers", () => {
    expect(dayCountLabel({ spendingCount: 0, transferCount: 2, net: 0 })).toBe("2 transfers");
  });
});
