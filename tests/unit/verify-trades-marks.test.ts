import { describe, expect, it } from "vitest";

import { parseMoney } from "../../src/core/money.js";
import { buildMarksArtifact } from "../../src/agentB/marks.js";
import { verifyTrades, type TradeSet } from "../../src/agentB/verifyTrades.js";

const records: TradeSet = {
  purchases: [{ company: "Ionmere Materials Ltd", date: "2022-12-15", amount_usd: 14000000 }, { company: "Second Co", date: "2022-12-16", amount_usd: 2 }],
  sales: [{ company: "Fjord Payments AS", date: "2022-11-18", proceeds_usd: 29000000 }]
};

describe("Agent B trade verification", () => {
  it("accepts exact trades and string/number amounts", () => {
    expect(verifyTrades({ purchases: [{ company: "ionmere materials ltd", date: "2022-12-15", amount_usd: "14000000" }, { company: "Second Co", date: "2022-12-16", amount_usd: "2.00" }], sales: [{ company: "FJORD PAYMENTS AS", date: "2022-11-18", proceeds_usd: 29000000 }] }, records)).toEqual({ matched: 3, expected: 3, ok: true });
  });

  it("counts a wrong amount as unmatched", () => {
    const result = verifyTrades({ purchases: [{ company: "Ionmere Materials Ltd", date: "2022-12-15", amount_usd: 1 }, { company: "Second Co", date: "2022-12-16", amount_usd: 2 }], sales: records.sales }, records);
    expect(result).toEqual({ matched: 2, expected: 3, ok: false });
  });

  it("rejects extra claimed items and handles empty sets", () => {
    expect(verifyTrades({ purchases: [...records.purchases, { company: "Extra", date: "2022-01-01", amount_usd: 1 }], sales: records.sales }, records).ok).toBe(false);
    expect(verifyTrades({ purchases: [], sales: [] }, { purchases: [], sales: [] })).toEqual({ matched: 0, expected: 0, ok: true });
  });

  it("builds a numeric marks artifact with deterministic id", () => {
    const artifact = buildMarksArtifact({ fundName: "Fund", fundCode: "GPF", valuationDate: "2022-12-31", marks: [{ company: "Example", currency: "USD", fairValue: parseMoney("1.234"), method: "Cost", valuationDate: "2022-12-31" }], notes: [], purchases: [], sales: [] });
    expect(artifact.artifactId).toBe("marks-GPF-2022-12-31");
    expect(artifact.marks[0]?.fair_value).toBe(1.23);
  });
});