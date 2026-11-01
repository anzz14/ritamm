import { describe, expect, it } from "vitest";

import { assertBankChecks, runBankChecks } from "../../src/agentA/checks.js";
import { ReconciliationError } from "../../src/core/errors.js";
import { parseMoney } from "../../src/core/money.js";
import type { ParsedStatement } from "../../src/agentA/pdf/parseStatement.js";

function statement(): ParsedStatement {
  return {
    opening: parseMoney("100.00"),
    rawRows: [
      { date: "2022-10-03", description: "Debit", reference: "A", debit: parseMoney("10.00"), credit: parseMoney("0.00"), balance: parseMoney("90.00") },
      { date: "2022-10-04", description: "Credit", reference: "B", debit: parseMoney("0.00"), credit: parseMoney("5.00"), balance: parseMoney("95.00") }
    ],
    statedTotals: { debits: parseMoney("10.00"), credits: parseMoney("5.00") }
  };
}

describe("bank checks", () => {
  it("passes a reconciled statement and asserts successfully", () => {
    const report = runBankChecks(statement());
    expect(report.passed).toBe(true);
    expect(report.transactionCount).toBe(2);
    expect(() => assertBankChecks(report)).not.toThrow();
  });

  it("reports every mutated running balance with index and date", () => {
    const parsed = statement();
    parsed.rawRows[1]!.balance = parseMoney("95.01");
    const report = runBankChecks(parsed);
    expect(report.checks[0]?.passed).toBe(false);
    expect(report.checks[0]?.detail).toContain("index 1 date 2022-10-04");
  });

  it("detects a dropped row through the closing balance check", () => {
    const parsed = statement();
    parsed.rawRows = [parsed.rawRows[1]!];
    const report = runBankChecks(parsed);
    expect(report.checks[1]?.passed).toBe(false);
  });

  it("detects flipped stated totals and throws a typed error", () => {
    const parsed = statement();
    parsed.statedTotals!.debits = parseMoney("11.00");
    const report = runBankChecks(parsed);
    expect(report.checks[2]?.passed).toBe(false);
    expect(() => assertBankChecks(report)).toThrow(ReconciliationError);
  });
});