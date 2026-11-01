import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseMoney } from "../../src/core/money.js";
import type { RawRow } from "../../src/agentA/pdf/parseStatement.js";
import { rulesCategorize } from "../../src/agentA/llm/fallback.js";

interface Expected {
  category: string;
  lp_code: string | null;
  company: string | null;
}

const expected = JSON.parse(readFileSync("tests/fixtures/expected_categories.json", "utf8")) as Expected[];
const distributions = ["LP07", "LP09", "LP02", "LP04", "LP01", "LP08", "LP06", "LP10", "LP03", "LP05"];
const calls = ["LP02", "LP01", "LP07", "LP04", "LP03", "LP05", "LP08", "LP06", "LP09", "LP07", "LP10"];
const context = {
  lpRoster: Array.from({ length: 10 }, (_, index) => ({ code: `LP${String(index + 1).padStart(2, "0")}`, name: `Partner ${index + 1}`, commitment: parseMoney("1000000") })),
  q3Liabilities: [
    { name: "Admin services", amount: parseMoney("65000") },
    { name: "Audit services", amount: parseMoney("120000") }
  ]
};

function description(index: number, item: Expected): string {
  if (item.category === "management_fee") return "MANAGEMENT FEE UNDER LPA";
  if (item.category === "accrual_settlement") return index === 1 ? "ADMIN SERVICES INVOICE" : "AUDIT SERVICES INVOICE";
  if (item.category === "dividend_income") return "DIVIDEND RECEIVED";
  if (item.category === "interest_income") return "INTEREST RECEIVED";
  if (item.category === "capital_call") return `${calls.shift()} CAPITAL CALL`;
  if (item.category === "distribution") return `${distributions.shift()} DISTRIBUTION PAYMENT`;
  if (item.category === "bank_charges") return "BANK WIRE CHARGE";
  if (item.category === "expense_refund") return "EXPENSE REFUND OVERBILLING";
  if (item.category === "sale_proceeds") return "Fjord Payments AS COMPLETION SALE PROCEEDS";
  if (item.category === "investment_purchase") return "SUBSCRIPTION SHARES IN Ionmere Materials Ltd";
  return index === 34 ? "D&O INSURANCE PREMIUM" : "LEGAL INVOICE";
}

describe("rules fallback golden labels", () => {
  it("reproduces all 39 expected categories offline", () => {
    const rows: RawRow[] = expected.map((item, index) => {
      const debit = item.category === "capital_call" || item.category === "dividend_income" || item.category === "interest_income" || item.category === "sale_proceeds" || item.category === "expense_refund" ? "0" : index === 1 ? "65000" : index === 3 ? "120000" : index === 19 ? "0" : index === 35 ? "14000000" : "100";
      const credit = debit === "0" ? (item.category === "sale_proceeds" ? "29000000" : "100") : "0";
      return { date: `2022-01-${String(index + 1).padStart(2, "0")}`, description: description(index, item), reference: `REF-${index}`, debit: parseMoney(debit), credit: parseMoney(credit), balance: parseMoney("0") };
    });
    const actual = rows.map((row, index) => rulesCategorize(row, context, index));
    expect(actual.map(({ category, lp_code, company }) => ({ category, lp_code, company }))).toEqual(expected);
  });
});
