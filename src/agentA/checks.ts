import { ReconciliationError } from "../core/errors.js";
import { eq, sum, toCents, type Money } from "../core/money.js";
import type { ParsedStatement, RawRow } from "./pdf/parseStatement.js";

export interface BankCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface BankCheckReport {
  opening: Money;
  closing: Money;
  totalDebits: Money;
  totalCredits: Money;
  transactionCount: number;
  checks: BankCheck[];
  passed: boolean;
}

function centsEqual(left: Money, right: Money): boolean {
  return toCents(left) === toCents(right);
}

function runningBalanceCheck(parsed: ParsedStatement): BankCheck {
  let previous = parsed.opening;
  const failures: string[] = [];
  parsed.rawRows.forEach((row, index) => {
    const expected = previous.minus(row.debit).plus(row.credit);
    if (!centsEqual(expected, row.balance)) failures.push(`index ${index} date ${row.date}`);
    previous = row.balance;
  });
  return {
    name: "running balance",
    passed: failures.length === 0,
    detail: failures.length === 0 ? "All running balances reconcile" : `Failing rows: ${failures.join(", ")}`
  };
}

function closingBalanceCheck(parsed: ParsedStatement, closing: Money): BankCheck {
  const expected = parsed.opening
    .plus(sum(parsed.rawRows.map((row) => row.credit)))
    .minus(sum(parsed.rawRows.map((row) => row.debit)));
  return {
    name: "closing balance",
    passed: centsEqual(expected, closing),
    detail: centsEqual(expected, closing)
      ? "Opening balance plus net activity equals closing balance"
      : `Expected ${expected.toFixed(2)}, found ${closing.toFixed(2)}`
  };
}

function statedTotalsCheck(parsed: ParsedStatement, totalDebits: Money, totalCredits: Money): BankCheck {
  if (!parsed.statedTotals) return { name: "stated totals", passed: true, detail: "No stated totals present" };
  const passed = eq(totalDebits, parsed.statedTotals.debits) && eq(totalCredits, parsed.statedTotals.credits);
  return {
    name: "stated totals",
    passed,
    detail: passed ? "Recomputed totals match the statement" : `Expected debits ${parsed.statedTotals.debits.toFixed(2)} and credits ${parsed.statedTotals.credits.toFixed(2)}`
  };
}

function directionCheck(rows: RawRow[]): BankCheck {
  const failures = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.debit.gt(0) === !row.credit.gt(0))
    .map(({ row, index }) => `index ${index} date ${row.date}`);
  return {
    name: "transaction directions",
    passed: failures.length === 0,
    detail: failures.length === 0 ? "Every row has one positive direction" : `Invalid rows: ${failures.join(", ")}`
  };
}

export function runBankChecks(parsed: ParsedStatement): BankCheckReport {
  const lastRow = parsed.rawRows.at(-1);
  const closing = lastRow?.balance ?? parsed.opening;
  const totalDebits = sum(parsed.rawRows.map((row) => row.debit));
  const totalCredits = sum(parsed.rawRows.map((row) => row.credit));
  const checks = [
    runningBalanceCheck(parsed),
    closingBalanceCheck(parsed, closing),
    statedTotalsCheck(parsed, totalDebits, totalCredits),
    directionCheck(parsed.rawRows)
  ];
  return {
    opening: parsed.opening,
    closing,
    totalDebits,
    totalCredits,
    transactionCount: parsed.rawRows.length,
    checks,
    passed: checks.every((check) => check.passed)
  };
}

export function assertBankChecks(report: BankCheckReport): void {
  if (!report.passed) {
    const failures = report.checks.filter((check) => !check.passed);
    throw new ReconciliationError("Bank statement checks failed", { checks: failures });
  }
}