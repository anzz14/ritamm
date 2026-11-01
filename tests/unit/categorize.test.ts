import { describe, expect, it } from "vitest";

import { parseMoney } from "../../src/core/money.js";
import { LlmError } from "../../src/core/errors.js";
import type { RawRow } from "../../src/agentA/pdf/parseStatement.js";
import { categorizationSchema } from "../../src/agentA/llm/prompt.js";
import { categorizeAll } from "../../src/agentA/llm/categorize.js";

const rows: RawRow[] = [
  { date: "2022-01-01", description: "LP01 CAPITAL CALL", reference: "", debit: parseMoney("0.00"), credit: parseMoney("100.00"), balance: parseMoney("100.00") },
  { date: "2022-01-02", description: "SUBSCRIPTION SHARES IN Example Entity Ltd", reference: "", debit: parseMoney("50.00"), credit: parseMoney("0.00"), balance: parseMoney("50.00") }
];
const ctx = { lpRoster: [{ code: "LP01", name: "Limited Partner", commitment: parseMoney("1000.00") }], q3Liabilities: [] };
const logger = { warn: () => undefined };
const good = [{ index: 0, category: "capital_call" as const, lp_code: "LP01", company: null, reason: "LP credit" }, { index: 1, category: "investment_purchase" as const, lp_code: null, company: "Example Entity Ltd", reason: "Shares" }];

function fake(results: typeof good, calls: string[] = []) {
  return { chatJson: async (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => { calls.push(messages.at(-1)?.content ?? ""); return categorizationSchema.parse(results); } };
}

describe("categorization orchestration", () => {
  it("keeps perfect LLM results tagged llm", async () => {
    const result = await categorizeAll(rows, { llm: fake(good), ctx, logger });
    expect(result.every((item) => item.categorized_by === "llm")).toBe(true);
  });

  it("re-asks and accepts corrected results", async () => {
    let call = 0;
    const llm = { chatJson: async () => { call += 1; return categorizationSchema.parse(call === 1 ? [{ ...good[0], category: "distribution" }, good[1]] : good); } };
    const result = await categorizeAll(rows, { llm, ctx, logger });
    expect(call).toBe(2);
    expect(result.every((item) => item.categorized_by === "llm")).toBe(true);
  });

  it("uses rules fallback when the LLM always throws", async () => {
    const llm = { chatJson: async () => { throw new LlmError("offline test failure"); } };
    const result = await categorizeAll(rows, { llm, ctx, logger });
    expect(result.every((item) => item.categorized_by === "rules_fallback")).toBe(true);
    expect(result.map((item) => item.category)).toEqual(["capital_call", "investment_purchase"]);
  });
});