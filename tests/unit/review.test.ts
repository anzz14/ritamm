import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import { parseMoney } from "../../src/core/money.js";
import type { Mark, Q3Position } from "../../src/core/types.js";
import { reviewMarks } from "../../src/agentB/review.js";

const q3: Q3Position[] = [{ company: "Held Co", currency: "USD", costLocal: parseMoney("100"), fairValueLocal: parseMoney("100"), fxRate: "1", fairValueUsd: parseMoney("100"), method: "Cost" }];
const mark = (company: string, fairValue: string, method = "Market") : Mark => ({ company, currency: "USD", fairValue: parseMoney(fairValue), method, valuationDate: "2022-12-31" });
const base = { q3, q4Marks: [mark("Held Co", "115")], heldAtQ4: new Set<string>(), purchases: [], sales: [], fxRate: "1.0666", thresholdPct: new Decimal("15") };

describe("review marks", () => {
  it("flags exactly 15 percent locally and reports USD change separately", () => {
    const entry = reviewMarks(base).entries[0]!;
    expect(entry.flags).toContain("R1");
    expect(entry.change_pct).toBe(15);
    expect(entry.change_pct_usd).toBe(15);
  });

  it("does not flag a 14.99 percent local move", () => {
    expect(reviewMarks({ ...base, q4Marks: [mark("Held Co", "114.99")] }).entries[0]!.flags).not.toContain("R1");
  });

  it("flags method changes, carried cost, and unheld marks", () => {
    const result = reviewMarks({
      ...base,
      q4Marks: [mark("Held Co", "100", "Multiple") , mark("Ghost Co", "50")],
      purchases: [{ company: "New Co", date: "2022-12-15", amount_usd: 20 }],
      sales: []
    });
    expect(result.entries.find((entry) => entry.company === "Held Co")?.flags).toContain("R2");
    expect(result.entries.find((entry) => entry.company === "New Co")?.flags).toContain("R3");
    expect(result.entries.find((entry) => entry.company === "Ghost Co")?.flags).toContain("R4");
  });

  it("reports sold companies without marks as realized and unflagged", () => {
    const result = reviewMarks({ ...base, q4Marks: [], sales: [{ company: "Held Co", date: "2022-11-18", proceeds_usd: 200 }] });
    expect(result.entries[0]?.flags).toEqual([]);
    expect(result.entries[0]?.reason).toBe("Sold 2022-11-18; realized, excluded from NAV");
  });
});