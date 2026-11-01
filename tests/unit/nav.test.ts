import { describe, expect, it } from "vitest";
import { parseMoney } from "../../src/core/money.js";
import { computeNav } from "../../src/agentB/nav.js";
import { ReconciliationError } from "../../src/core/errors.js";
import type { Transaction } from "../../src/agentA/toTransactions.js";
import type { ReviewResult } from "../../src/agentB/review.js";

const q3 = [
  { company: "Held Co", costUsd: parseMoney("100"), fairValueUsd: parseMoney("100") },
  { company: "Sold Co", costUsd: parseMoney("100"), fairValueUsd: parseMoney("100") }
];
const review: ReviewResult = { threshold_pct: 15, eurusd_rate: 1.0666, entries: [
  { company: "Held Co", currency: "USD", q3_fair_value: 100, q4_fair_value: 100, change_pct: 0, change_pct_usd: 0, q3_method: "Cost", q4_method: "Cost", flags: [], reason: "" },
  { company: "Sold Co", currency: "USD", q3_fair_value: 100, q4_fair_value: null, change_pct: null, change_pct_usd: null, q3_method: "Cost", q4_method: null, flags: [], reason: "Sold 2022-01-01; realized, excluded from NAV" }
] };
const tx = (category: Transaction["category"], debit: number, credit: number): Transaction => ({ date: "2022-01-01", description: category, reference: "", debit, credit, balance: 0, category, lp_code: null, company: null, categorized_by: "llm" });
const base = { closingCash: parseMoney("0"), navQ3: parseMoney("100"), q3Holdings: q3, q4Marks: review.entries, fx: "1.0666", review, purchases: [], sales: [{ company: "Sold Co", date: "2022-01-01", proceeds_usd: 100 }], q4Accruals: [], transactions: [tx("sale_proceeds", 0, 100)] };

describe("NAV computation", () => {
  it("computes a balanced NAV and bridge", () => {
    const result = computeNav(base);
    expect(result.nav_q4).toBe(100);
    expect(result.bridge.difference).toBe(0);
    expect(result.bridge.realized_gain).toBe(0);
  });

  it("rejects a sale not present in Q3 holdings", () => {
    expect(() => computeNav({ ...base, sales: [{ company: "Missing Co", date: "2022-01-01", proceeds_usd: 1 }] })).toThrow(ReconciliationError);
  });
});