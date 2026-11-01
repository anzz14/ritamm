import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import { startServer } from "../../src/a2a/server.js";
import { InMemoryTaskStore } from "../../src/a2a/taskStore.js";
import { loadAgentBData } from "../../src/pack/loadAgentBData.js";
import { loadCvpQ3 } from "../../src/pack/loadCvpQ3.js";
import { loadNavSummary } from "../../src/pack/loadNavSummary.js";
import { resolveAgentBData } from "../../src/pack/workbook.js";
import { createAgentB } from "../../src/agentB/index.js";
import { parseMoney } from "../../src/core/money.js";

const packDir = join(process.cwd(), "pack");
const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function rpc(url: string, id: number, message: Record<string, unknown>): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "message/send", params: { message } }) });
  return response.json();
}

async function create(): Promise<ReturnType<typeof createAgentB>> {
  const data = loadAgentBData(resolveAgentBData(packDir));
  const nav = await loadNavSummary(packDir);
  return createAgentB({ pack: { agentBData: data, q3: await loadCvpQ3(packDir), q3Holdings: nav.holdings, navQ3: nav.navQ3, q4Accruals: nav.q4Accruals }, taskStore: new InMemoryTaskStore(), fx: "1.0666", thresholdPct: new Decimal("15"), logger });
}

describe("Agent B", () => {
  it("runs the real-pack two-turn flow and preserves numeric marks/notes", async () => {
    const agent = await create();
    const server = await startServer(agent.app, 0);
    try {
      const url = `http://127.0.0.1:${server.port}/a2a`;
      const first = await rpc(url, 1, { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "data", data: { fund: "GPF", valuation_date: "2022-12-31" } }] });
      expect(first.result.status.state).toBe("input-required");
      const data = loadAgentBData(resolveAgentBData(packDir));
      const second = await rpc(url, 2, { kind: "message", role: "user", messageId: "m2", taskId: first.result.id, contextId: first.result.contextId, parts: [{ kind: "data", data: { purchases: data.purchases.map((item) => ({ company: item.company, date: item.date, amount_usd: item.amount.toString() })), sales: data.sales.map((item) => ({ company: item.company, date: item.date, proceeds_usd: item.proceeds.toString() })) } }] });
      expect(second.result.status.state).toBe("completed");
      expect(typeof second.result.artifacts[0].parts[0].data.marks[0].fair_value).toBe("number");
      expect(second.result.artifacts[0].parts[0].data.notes).toHaveLength(2);
      const resend = await rpc(url, 3, { kind: "message", role: "user", messageId: "m3", taskId: first.result.id, contextId: first.result.contextId, parts: [] });
      expect(resend.result.status.state).toBe("completed");
    } finally { await server.close(); }
  });

  it("returns mismatch, invalid params, and unknown-task errors", async () => {
    const agent = await create();
    const server = await startServer(agent.app, 0);
    try {
      const url = `http://127.0.0.1:${server.port}/a2a`;
      const first = await rpc(url, 1, { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "data", data: { fund: "GPF", valuation_date: "2022-12-31" } }] });
      const oneWrong = await rpc(url, 2, { kind: "message", role: "user", messageId: "m2", taskId: first.result.id, contextId: first.result.contextId, parts: [{ kind: "data", data: { purchases: [{ company: "Ionmere Materials Ltd", date: "2022-12-15", amount_usd: 14000000 }], sales: [{ company: "Fjord Payments AS", date: "2022-11-18", proceeds_usd: 1 }] } }] });
      expect(oneWrong.result.status.message.parts[0].text).toContain("Matched 1 of 2");

      const empty = await rpc(url, 3, { kind: "message", role: "user", messageId: "m3", taskId: first.result.id, contextId: first.result.contextId, parts: [{ kind: "data", data: { purchases: [], sales: [] } }] });
      expect(empty.result.status.message.parts[0].text).toContain("Matched 0 of 2");

      const missing = await rpc(url, 4, { kind: "message", role: "user", messageId: "m4", parts: [] });
      expect(missing.error.code).toBe(-32602);
      const unknown = await rpc(url, 5, { kind: "message", role: "user", messageId: "m5", taskId: "unknown", contextId: "context", parts: [] });
      expect(unknown.error.code).toBe(-32001);
    } finally { await server.close(); }
  });
});
