import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { loadAgentBData } from "../../src/pack/loadAgentBData.js";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("Agent B data loader", () => {
  it("validates JSON and converts string/number amounts to Money", () => {
    const directory = mkdtempSync(join(tmpdir(), "gpf-agent-b-"));
    const input = {
      fund_name: "GPF",
      fund_code: "GPF",
      valuation_date: "2022-12-31",
      marks: Array.from({ length: 7 }, (_, index) => ({
        company: `Company ${index + 1}`,
        currency: "USD",
        fair_value: index === 0 ? "13100000" : 100 + index,
        valuation_method: "Market multiples",
        valuation_date: "2022-12-31"
      })),
      notes: ["First note", "Second note"],
      purchases: [{ company: "Ionmere", date: "2022-12-15", amount_usd: "14000000" }],
      sales: [{ company: "Fjord", date: "2022-11-18", proceeds_usd: 29000000 }]
    };
    const path = join(directory, "agent_b_data.json");
    writeFileSync(path, JSON.stringify(input));
    const data = loadAgentBData(path);
    expect(data.marks).toHaveLength(7);
    expect(data.notes).toHaveLength(2);
    expect(data.purchases[0]?.amount.toFixed(2)).toBe("14000000.00");
    expect(data.sales[0]?.proceeds.toFixed(2)).toBe("29000000.00");
  });

  it("keeps agent_b_data out of Agent A source files", () => {
    const agentADirectory = join(process.cwd(), "src", "agentA");
    const references = sourceFiles(agentADirectory).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return source.includes("agent_b_data") ? [path] : [];
    });
    expect(references).toEqual([]);
  });
});