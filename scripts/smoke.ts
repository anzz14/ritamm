import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Decimal } from "decimal.js";

import { startServer } from "../src/a2a/server.js";
import { InMemoryTaskStore } from "../src/a2a/taskStore.js";
import { createAgentA } from "../src/agentA/index.js";
import { createAgentB } from "../src/agentB/index.js";
import { LlmError } from "../src/core/errors.js";
import { loadAgentBData } from "../src/pack/loadAgentBData.js";
import { loadCvpQ3 } from "../src/pack/loadCvpQ3.js";
import { loadNavSummary } from "../src/pack/loadNavSummary.js";
import { resolveAgentBData } from "../src/pack/workbook.js";
import { runPipeline } from "../src/pipeline.js";

const stubLlm = {
  chatJson: async () => {
    throw new LlmError("Offline smoke test forces rules fallback");
  }
};

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

async function rpc(url: string, method: string, params: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  return response.json();
}

async function postRaw(url: string, rawBody: string): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody
  });
  return response.json();
}

async function runCheck(name: string, fn: () => Promise<void>): Promise<boolean> {
  const start = performance.now();
  try {
    await fn();
    const elapsed = (performance.now() - start).toFixed(0);
    console.log(` ✅ ${name} (${elapsed}ms)`);
    return true;
  } catch (error) {
    const elapsed = (performance.now() - start).toFixed(0);
    console.error(` ❌ ${name} (${elapsed}ms) - ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log("=== GPF A2A Endpoint Smoke Test ===");

  const packDir = "./pack";
  const nav = await loadNavSummary(packDir);
  const data = loadAgentBData(resolveAgentBData(packDir));
  const q3 = await loadCvpQ3(packDir);

  const agentA = createAgentA({
    config: { packDir, fundCode: data.fundCode, valuationDate: data.valuationDate },
    llm: stubLlm,
    logger: silentLogger
  });
  const serverA = await startServer(agentA.app, 0);
  const urlA = `http://127.0.0.1:${serverA.port}/a2a`;

  const agentB = createAgentB({
    pack: { agentBData: data, q3, q3Holdings: nav.holdings, navQ3: nav.navQ3, q4Accruals: nav.q4Accruals },
    taskStore: new InMemoryTaskStore(),
    fx: "1.0666",
    thresholdPct: new Decimal("15"),
    logger: silentLogger
  });
  const serverB = await startServer(agentB.app, 0);
  const urlB = `http://127.0.0.1:${serverB.port}/a2a`;

  let passed = 0;
  const total = 13;

  try {
    console.log("\nAgent A checks:");
    // 1 GET agent-card
    if (await runCheck("1 GET /.well-known/agent-card.json -> 200, protocolVersion '0.3.0', url present", async () => {
      const res = await fetch(`http://127.0.0.1:${serverA.port}/.well-known/agent-card.json`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const card = await res.json() as any;
      if (card.protocolVersion !== "0.3.0" || !card.url) throw new Error("Invalid card payload");
    })) passed += 1;

    // 2 POST message/send get_trades
    if (await runCheck("2 POST message/send {'action':'get_trades'} -> completed task with 1 purchase + 1 sale + transaction_count 39", async () => {
      const res = await rpc(urlA, "message/send", {
        message: {
          kind: "message",
          role: "user",
          messageId: "m1",
          parts: [{ kind: "data", data: { action: "get_trades" } }]
        }
      });
      const task = res.result;
      if (task?.status?.state !== "completed") throw new Error(`Unexpected state: ${task?.status?.state}`);
      const payload = task.artifacts[0].parts[0].data;
      if (payload.purchases.length !== 1 || payload.sales.length !== 1 || payload.transaction_count !== 39) {
        throw new Error(`Trades payload mismatch: ${JSON.stringify(payload)}`);
      }
    })) passed += 1;

    // 3 invalid JSON body -> -32700
    if (await runCheck("3 invalid JSON body -> -32700", async () => {
      const res = await postRaw(urlA, "{invalid-json");
      if (res.error?.code !== -32700) throw new Error(`Expected -32700, got ${res.error?.code}`);
    })) passed += 1;

    // 4 wrong method -> -32601
    if (await runCheck("4 wrong method -> -32601", async () => {
      const res = await rpc(urlA, "wrong/method", {});
      if (res.error?.code !== -32601) throw new Error(`Expected -32601, got ${res.error?.code}`);
    })) passed += 1;

    // 5 bad params -> -32602
    if (await runCheck("5 bad params -> -32602", async () => {
      const res = await rpc(urlA, "message/send", "bad_params_string");
      if (res.error?.code !== -32602) throw new Error(`Expected -32602, got ${res.error?.code}`);
    })) passed += 1;

    console.log("\nAgent B checks:");
    // 6 card OK
    if (await runCheck("6 card OK -> 200, protocolVersion '0.3.0', url present", async () => {
      const res = await fetch(`http://127.0.0.1:${serverB.port}/.well-known/agent-card.json`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      const card = await res.json() as any;
      if (card.protocolVersion !== "0.3.0" || !card.url) throw new Error("Invalid card payload");
    })) passed += 1;

    let taskId = "";
    let contextId = "";

    // 7 first message -> input-required with taskId + contextId
    if (await runCheck("7 first message -> input-required with taskId+contextId", async () => {
      const res = await rpc(urlB, "message/send", {
        message: {
          kind: "message",
          role: "user",
          messageId: "mb1",
          parts: [{ kind: "data", data: { fund: "GPF", valuation_date: "2022-12-31" } }]
        }
      });
      if (res.result?.status?.state !== "input-required") throw new Error(`Expected input-required, got ${res.result?.status?.state}`);
      taskId = res.result.id;
      contextId = res.result.contextId;
      if (!taskId || !contextId) throw new Error("Missing taskId or contextId");
    })) passed += 1;

    // 8 second message with WRONG amounts -> input-required + "Matched 1 of 2"
    if (await runCheck("8 second message with WRONG amounts -> input-required + 'Matched 1 of 2'", async () => {
      const res = await rpc(urlB, "message/send", {
        message: {
          kind: "message",
          role: "user",
          messageId: "mb2",
          taskId,
          contextId,
          parts: [{
            kind: "data",
            data: {
              purchases: [{ company: "Ionmere Materials Ltd", date: "2022-12-15", amount_usd: 14000000 }],
              sales: [{ company: "Fjord Payments AS", date: "2022-11-18", proceeds_usd: 999 }]
            }
          }]
        }
      });
      if (res.result?.status?.state !== "input-required") throw new Error(`Expected input-required, got ${res.result?.status?.state}`);
      const msg = res.result?.status?.message?.parts?.[0]?.text ?? "";
      if (!msg.includes("Matched 1 of 2")) throw new Error(`Expected 'Matched 1 of 2', got: ${msg}`);
    })) passed += 1;

    // 9 second message correct -> completed, 7 marks + 2 notes, fair_value numeric
    if (await runCheck("9 second message correct -> completed, artifacts[0] has 7 marks + 2 notes, fair_value numeric", async () => {
      const res = await rpc(urlB, "message/send", {
        message: {
          kind: "message",
          role: "user",
          messageId: "mb3",
          taskId,
          contextId,
          parts: [{
            kind: "data",
            data: {
              purchases: [{ company: "Ionmere Materials Ltd", date: "2022-12-15", amount_usd: 14000000 }],
              sales: [{ company: "Fjord Payments AS", date: "2022-11-18", proceeds_usd: 29000000 }]
            }
          }]
        }
      });
      if (res.result?.status?.state !== "completed") throw new Error(`Expected completed, got ${res.result?.status?.state}`);
      const artifact = res.result.artifacts[0].parts[0].data;
      if (artifact.marks.length !== 7) throw new Error(`Expected 7 marks, got ${artifact.marks.length}`);
      if (artifact.notes.length !== 2) throw new Error(`Expected 2 notes, got ${artifact.notes.length}`);
      if (typeof artifact.marks[0].fair_value !== "number") throw new Error("fair_value is not numeric");
    })) passed += 1;

    // 10 re-send after completion -> same completed task (idempotent)
    if (await runCheck("10 re-send after completion -> same completed task (idempotent)", async () => {
      const res = await rpc(urlB, "message/send", {
        message: {
          kind: "message",
          role: "user",
          messageId: "mb4",
          taskId,
          contextId,
          parts: []
        }
      });
      if (res.result?.status?.state !== "completed" || res.result?.id !== taskId) {
        throw new Error(`Idempotency failed: state=${res.result?.status?.state}, id=${res.result?.id}`);
      }
    })) passed += 1;

    // 11 unknown taskId -> -32001
    if (await runCheck("11 unknown taskId -> -32001", async () => {
      const res = await rpc(urlB, "message/send", {
        message: {
          kind: "message",
          role: "user",
          messageId: "mb5",
          taskId: "unknown-id",
          contextId: "ctx",
          parts: []
        }
      });
      if (res.error?.code !== -32001) throw new Error(`Expected -32001, got ${res.error?.code}`);
    })) passed += 1;

    // 12 missing data part -> -32602
    if (await runCheck("12 missing data part -> -32602", async () => {
      const res = await rpc(urlB, "message/send", {
        message: {
          kind: "message",
          role: "user",
          messageId: "mb6",
          parts: []
        }
      });
      if (res.error?.code !== -32602) throw new Error(`Expected -32602, got ${res.error?.code}`);
    })) passed += 1;

    console.log("\nPipeline check:");
    // 13 runPipeline to temp dir
    if (await runCheck("13 runPipeline to a temp dir -> all output files exist, nav difference 0.00, nav_q4 == 169764039.25", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "gpf-smoke-pipeline-"));
      try {
        const result = await runPipeline({
          packDir,
          outputDir: tempDir,
          agentAPort: 0,
          agentBPort: 0,
          llm: stubLlm,
          logger: silentLogger
        });
        if (result.navQ4 !== 169764039.25) throw new Error(`Expected navQ4 169764039.25, got ${result.navQ4}`);
        if (result.bridgeDifference !== 0) throw new Error(`Expected bridgeDifference 0, got ${result.bridgeDifference}`);
        for (const file of ["transactions.json", "marks.json", "review.json", "nav.json", "bank_checks.json", "a2a_log.jsonl"]) {
          readFileSync(join(tempDir, file), "utf8");
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    })) passed += 1;

  } finally {
    await Promise.allSettled([serverA.close(), serverB.close()]);
  }

  console.log(`\nSmoke summary: ${passed}/${total} passed\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Smoke script failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
