import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseMoney } from "../../src/core/money.js";
import { writeOutputs } from "../../src/output/writers.js";

describe("Output writers", () => {
  it("writes all required JSON files with 2-space indentation and deletes stale json files", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "writers-test-"));
    try {
      // Create a stale json file and an a2a_log.jsonl file
      writeFileSync(join(tempDir, "stale.json"), '{"stale":true}\n', "utf8");
      writeFileSync(join(tempDir, "a2a_log.jsonl"), '{"ts":"2022-12-31T00:00:00Z"}\n', "utf8");

      const payload = {
        transactions: [
          {
            date: "2022-10-03",
            description: "OUTWARD WIRE TO ADVISORS",
            reference: "MGMT-OCT",
            debit: 1250000,
            credit: 0,
            balance: 11200000,
            category: "management_fee" as const,
            lp_code: null,
            company: null,
            categorized_by: "llm" as const
          }
        ],
        marksArtifact: {
          artifactId: "marks-GPF-2022-12-31",
          rawFieldPreserved: true,
          nested: { key: "value" }
        },
        review: {
          threshold_pct: 15,
          eurusd_rate: 1.0666,
          entries: []
        },
        nav: {
          closing_cash: 23896579.25,
          investments_usd: 146062460,
          liabilities: 195000,
          nav_q4: 169764039.25,
          management_fee: 1250000,
          expense_breakdown: {
            management_fee: 1250000,
            expense: 77000,
            bank_charges: 850,
            expense_refund: 0,
            q4_accruals: 195000,
            total: 1522850
          },
          bridge: {
            nav_q3: 160224800,
            capital_called: 20000000,
            distributions: 22500000,
            income: 459429.25,
            expenses: 1522850,
            realized_gain: 9000000,
            change_in_unrealized: 4102660,
            nav_q4: 169764039.25,
            difference: 0
          }
        },
        bankReport: {
          opening: parseMoney("12450000"),
          closing: parseMoney("23896579.25"),
          totalDebits: parseMoney("38016350"),
          totalCredits: parseMoney("49462929.25"),
          transactionCount: 39,
          checks: [{ name: "running balance", passed: true, detail: "All match" }],
          passed: true
        }
      };

      writeOutputs(tempDir, payload);

      // Verify stale.json was deleted, but a2a_log.jsonl was preserved
      expect(existsSync(join(tempDir, "stale.json"))).toBe(false);
      expect(existsSync(join(tempDir, "a2a_log.jsonl"))).toBe(true);

      // Verify files written
      const files = ["transactions.json", "marks.json", "review.json", "nav.json", "bank_checks.json"];
      for (const file of files) {
        expect(existsSync(join(tempDir, file))).toBe(true);
        const text = readFileSync(join(tempDir, file), "utf8");
        // Verify 2-space pretty-print
        expect(text).toContain("  ");
        expect(text.endsWith("\n")).toBe(true);
      }

      // Verify raw marksArtifact has no mutation
      const parsedMarks = JSON.parse(readFileSync(join(tempDir, "marks.json"), "utf8"));
      expect(parsedMarks).toEqual(payload.marksArtifact);

      // Verify bank_checks formatting
      const parsedBankChecks = JSON.parse(readFileSync(join(tempDir, "bank_checks.json"), "utf8"));
      expect(parsedBankChecks.opening).toBe(12450000);
      expect(parsedBankChecks.passed).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

