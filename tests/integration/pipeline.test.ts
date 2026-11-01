import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LlmError } from "../../src/core/errors.js";
import { runPipeline } from "../../src/pipeline.js";

const stubLlm = {
  chatJson: async () => {
    throw new LlmError("Stub LLM throws to force fallback");
  }
};

describe("Pipeline integration", () => {
  it("runs pipeline with fallback, asserts golden outputs and file shapes", async () => {
    const tempDir1 = mkdtempSync(join(tmpdir(), "gpf-pipeline-test-1-"));
    const tempDir2 = mkdtempSync(join(tmpdir(), "gpf-pipeline-test-2-"));
    const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];
    const logger = {
      info: () => undefined,
      warn: (message: string, context?: Record<string, unknown>) => warnings.push({ message, context }),
      error: () => undefined
    };

    try {
      const result1 = await runPipeline({
        packDir: "./pack",
        outputDir: tempDir1,
        agentAPort: 0,
        agentBPort: 0,
        llm: stubLlm,
        logger
      });

      expect(result1.navQ4).toBe(169764039.25);
      expect(result1.bridgeDifference).toBe(0);
      expect(result1.transactionCount).toBe(39);
      expect(result1.closingCash).toBe(23896579.25);
      expect(result1.investmentsUsd).toBe(146062460.0);
      expect(result1.liabilities).toBe(195000.0);
      expect(result1.fallbackCount).toBeGreaterThan(0);

      // Verify all output files exist
      const transactions = JSON.parse(readFileSync(join(tempDir1, "transactions.json"), "utf8"));
      const marks = JSON.parse(readFileSync(join(tempDir1, "marks.json"), "utf8"));
      const review = JSON.parse(readFileSync(join(tempDir1, "review.json"), "utf8"));
      const nav = JSON.parse(readFileSync(join(tempDir1, "nav.json"), "utf8"));
      const bankChecks = JSON.parse(readFileSync(join(tempDir1, "bank_checks.json"), "utf8"));
      const a2aLog = readFileSync(join(tempDir1, "a2a_log.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(transactions).toHaveLength(39);
      expect(marks).toEqual(result1.marksArtifact);
      expect(nav.nav_q4).toBe(169764039.25);
      expect(nav.bridge.difference).toBe(0);
      expect(bankChecks.passed).toBe(true);

      // a2a_log has at least 4 entries with timestamps
      expect(a2aLog.length).toBeGreaterThanOrEqual(4);
      for (const entry of a2aLog) {
        expect(entry).toHaveProperty("ts");
        expect(entry).toHaveProperty("direction");
      }

      // Run second time to verify deterministic byte-identical JSON
      await runPipeline({
        packDir: "./pack",
        outputDir: tempDir2,
        agentAPort: 0,
        agentBPort: 0,
        llm: stubLlm,
        logger
      });

      expect(warnings.length).toBeGreaterThan(0);

      for (const file of ["transactions.json", "marks.json", "review.json", "nav.json", "bank_checks.json"]) {
        const content1 = readFileSync(join(tempDir1, file), "utf8");
        const content2 = readFileSync(join(tempDir2, file), "utf8");
        expect(content1).toBe(content2);
      }
    } finally {
      rmSync(tempDir1, { recursive: true, force: true });
      rmSync(tempDir2, { recursive: true, force: true });
    }
  });
});

