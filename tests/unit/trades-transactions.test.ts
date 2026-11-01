import { describe, expect, it } from "vitest";

import { parseMoney } from "../../src/core/money.js";
import type { Categorized } from "../../src/agentA/llm/categorize.js";
import type { RawRow } from "../../src/agentA/pdf/parseStatement.js";
import { deriveTrades } from "../../src/agentA/trades.js";
import { toTransactions } from "../../src/agentA/toTransactions.js";

const rows: RawRow[] = [
  { date: "2022-12-15", description: "IONMERE SUBSCRIPTION", reference: "PUR-1", debit: parseMoney("14000000.00"), credit: parseMoney("0.00"), balance: parseMoney("1.00") },
  { date: "2022-11-18", description: "FJORD SALE", reference: "SAL-1", debit: parseMoney("0.00"), credit: parseMoney("29000000.00"), balance: parseMoney("2.00") }
];

const categorized: Categorized[] = [
  { index: 0, category: "investment_purchase", lp_code: null, company: "Ionmere Materials Ltd", reason: "purchase", categorized_by: "llm", date: rows[0]!.date, debit: rows[0]!.debit, credit: rows[0]!.credit },
  { index: 1, category: "sale_proceeds", lp_code: null, company: "Fjord Payments AS", reason: "sale", categorized_by: "rules_fallback", date: rows[1]!.date, debit: rows[1]!.debit, credit: rows[1]!.credit }
];

describe("trades and transaction output", () => {
  it("derives sorted purchases and sales with JSON numbers", () => {
    expect(deriveTrades(categorized)).toEqual({
      purchases: [{ company: "Ionmere Materials Ltd", date: "2022-12-15", amount_usd: 14000000 }],
      sales: [{ company: "Fjord Payments AS", date: "2022-11-18", proceeds_usd: 29000000 }]
    });
  });

  it("maps rows while preserving references and categorization metadata", () => {
    expect(toTransactions(rows, categorized)).toHaveLength(2);
    expect(toTransactions(rows, categorized)[0]).toMatchObject({ reference: "PUR-1", debit: 14000000, category: "investment_purchase" });
  });

  it("rejects a trade without a company", () => {
    expect(() => deriveTrades([{ ...categorized[0]!, company: null }])).toThrow("requires company");
  });
});