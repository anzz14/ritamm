import { describe, expect, it } from "vitest";

import { makeTask, dataPart, textPart } from "../../src/a2a/builders.js";
import { A2AError } from "../../src/core/errors.js";
import { parseMoney } from "../../src/core/money.js";
import { runBankAgent } from "../../src/agentA/executor.js";
import type { IngestResult } from "../../src/agentA/index.js";

const ingestResult: IngestResult = {
  transactions: [],
  bankReport: {
    opening: parseMoney("0"), closing: parseMoney("0"), totalDebits: parseMoney("0"), totalCredits: parseMoney("0"), transactionCount: 0, checks: [], passed: true
  },
  trades: {
    purchases: [{ company: "Example Ltd", date: "2022-12-15", amount_usd: 10 }],
    sales: [{ company: "Sold AS", date: "2022-12-16", proceeds_usd: 20 }]
  },
  fallbackCount: 0
};
const logger = { warn: () => undefined };

function client(sequence: Awaited<ReturnType<typeof makeTask>>[]) {
  let index = 0;
  return { sendMessage: async () => sequence[index++]! };
}

describe("Agent A executor", () => {
  it("completes the two-turn Agent B conversation and returns data unchanged", async () => {
    const artifact = { purchases: [{ company: "Example Ltd" }], sales: [], transaction_count: 1 };
    const result = await runBankAgent({
      ingest: async () => ingestResult,
      bClient: client([makeTask("input-required", [textPart("send trades")]), makeTask("completed", [dataPart(artifact)])]),
      logger,
      fundCode: "GPF",
      valuationDate: "2022-12-31"
    });
    expect(result).toBe(artifact);
  });

  it("retries three unmatched attempts and then throws", async () => {
    const task = () => makeTask("input-required", [textPart("Matched 1 of 2 items.")], { id: "task", contextId: "context" });
    let calls = 0;
    await expect(runBankAgent({
      ingest: async () => ingestResult,
      bClient: { sendMessage: async () => { calls += 1; return calls === 1 ? task() : task(); } },
      logger,
      fundCode: "GPF",
      valuationDate: "2022-12-31"
    })).rejects.toThrow("after 3 attempts");
    expect(calls).toBe(4);
  });

  it("throws when Agent B returns failed", async () => {
    await expect(runBankAgent({
      ingest: async () => ingestResult,
      bClient: client([makeTask("failed", [textPart("bad request")])]),
      logger,
      fundCode: "GPF",
      valuationDate: "2022-12-31"
    })).rejects.toBeInstanceOf(A2AError);
  });
});
