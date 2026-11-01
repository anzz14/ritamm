import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { BankCheckReport } from "../agentA/checks.js";
import type { Transaction } from "../agentA/toTransactions.js";
import type { NavResult } from "../agentB/nav.js";
import type { ReviewResult } from "../agentB/review.js";
import { toNumber2 } from "../core/money.js";

export interface OutputsPayload {
  transactions: Transaction[];
  marksArtifact: unknown;
  review: ReviewResult;
  nav: NavResult;
  bankReport: BankCheckReport;
}

export function writeOutputs(
  dir: string,
  { transactions, marksArtifact, review, nav, bankReport }: OutputsPayload
): void {
  mkdirSync(dir, { recursive: true });

  // Delete stale JSON files in output directory before writing new results
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (file === "a2a_log.jsonl") continue;
      if (file.endsWith(".json")) {
        rmSync(join(dir, file), { force: true });
      }
    }
  }

  const bankChecksJson = {
    opening: toNumber2(bankReport.opening),
    closing: toNumber2(bankReport.closing),
    totalDebits: toNumber2(bankReport.totalDebits),
    totalCredits: toNumber2(bankReport.totalCredits),
    transactionCount: bankReport.transactionCount,
    checks: bankReport.checks,
    passed: bankReport.passed
  };

  writeFileSync(join(dir, "transactions.json"), `${JSON.stringify(transactions, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "marks.json"), `${JSON.stringify(marksArtifact, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "nav.json"), `${JSON.stringify(nav, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "bank_checks.json"), `${JSON.stringify(bankChecksJson, null, 2)}\n`, "utf8");
}
