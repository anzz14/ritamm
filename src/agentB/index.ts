import { randomUUID } from "node:crypto";

import { z } from "zod";
import { A2AError } from "../core/errors.js";
import { Decimal } from "decimal.js";
import { dataPart, textPart } from "../a2a/builders.js";
import { createA2AServer, type A2ALogger } from "../a2a/server.js";
import { JsonRpcErrorCodes, type AgentCard, type Message, type Task } from "../a2a/schemas.js";
import type { InMemoryTaskStore } from "../a2a/taskStore.js";
import { normalizeName } from "../core/names.js";
import { parseMoney, type Money } from "../core/money.js";
import { toNumber2 } from "../core/money.js";
import type { AgentBData } from "../pack/loadAgentBData.js";
import type { Liability, Q3Holding, Q3Position } from "../core/types.js";
import { buildMarksArtifact } from "./marks.js";
import { computeNav, type NavResult } from "./nav.js";
import { reviewMarks, type ReviewResult } from "./review.js";
import { verifyTrades, type TradeSet } from "./verifyTrades.js";
import type { Transaction } from "../agentA/toTransactions.js";
import type { BankCheckReport } from "../agentA/checks.js";

export interface AgentBPack {
  agentBData: AgentBData;
  q3: Q3Position[];
  q3Holdings: Q3Holding[];
  navQ3: Money;
  q4Accruals: Liability[];
}

export interface AgentBDependencies {
  pack: AgentBPack;
  taskStore: Pick<InMemoryTaskStore, "get" | "set">;
  fx: string | { rate: string };
  thresholdPct: Decimal;
  port?: number;
  logger?: A2ALogger;
}

export interface AgentBReports {
  review: ReviewResult;
  nav: NavResult;
}

const requestDataSchema = z.object({ fund: z.string().min(1), valuation_date: z.string().min(1) });
const tradesSchema = z.object({
  purchases: z.array(z.object({ company: z.string().min(1), date: z.string().min(1), amount_usd: z.union([z.string(), z.number()]) })),
  sales: z.array(z.object({ company: z.string().min(1), date: z.string().min(1), proceeds_usd: z.union([z.string(), z.number()]) }))
});

function message(text: string): Message {
  return { kind: "message", role: "agent", messageId: randomUUID(), parts: [textPart(text)] };
}

function data(messageValue: Message): unknown {
  return messageValue.parts.find((part) => part.kind === "data")?.data;
}

function task(status: Task["status"]["state"], text: string, id = randomUUID(), contextId = randomUUID()): Task {
  return { kind: "task", id, contextId, status: { state: status, timestamp: new Date().toISOString(), message: message(text) } };
}

function toTradeSet(value: z.infer<typeof tradesSchema>): TradeSet {
  return value;
}

function normalizedTrades(value: TradeSet): { purchases: Array<{ company: string; date: string; amount_usd: number }>; sales: Array<{ company: string; date: string; proceeds_usd: number }> } {
  return {
    purchases: value.purchases.map((item) => ({ company: item.company, date: item.date, amount_usd: toNumber2(parseMoney(item.amount_usd ?? 0)) })),
    sales: value.sales.map((item) => ({ company: item.company, date: item.date, proceeds_usd: toNumber2(parseMoney(item.proceeds_usd ?? 0)) }))
  };
}

function expectedTrades(data: AgentBData): TradeSet {
  return {
    purchases: data.purchases.map((item) => ({ company: item.company, date: item.date, amount_usd: toNumber2(item.amount) })),
    sales: data.sales.map((item) => ({ company: item.company, date: item.date, proceeds_usd: toNumber2(item.proceeds) }))
  };
}

export function createAgentB({ pack, taskStore, fx, thresholdPct, port = 8002, logger = { info: () => undefined, warn: () => undefined, error: () => undefined } }: AgentBDependencies): { app: ReturnType<typeof createA2AServer>; getResults(): AgentBReports | undefined; computeReports(input: { transactions: Transaction[]; bankReport: BankCheckReport }): AgentBReports } {
  let results: AgentBReports | undefined;
  let verifiedTrades: TradeSet | undefined;
  const card: AgentCard = {
    protocolVersion: "0.3.0", name: "GPF Valuation & NAV Agent", description: "Releases valuation marks and computes NAV", url: `http://127.0.0.1:${port}/a2a`, preferredTransport: "JSONRPC", version: "0.1.0", capabilities: { streaming: false, pushNotifications: false }, defaultInputModes: ["application/json", "text/plain"], defaultOutputModes: ["application/json"], skills: [{ id: "valuation-and-nav", name: "Valuation and NAV", description: "Verifies trades and releases marks", tags: ["valuation", "nav"] }]
  };
  const computeReports = (input: { transactions: Transaction[]; bankReport: BankCheckReport }): AgentBReports => {
    if (!verifiedTrades) throw new A2AError(JsonRpcErrorCodes.TaskNotFound, "Verified trades are not available");
    const held = new Set(pack.q3Holdings.map((holding) => holding.company));
    verifiedTrades.sales.forEach((sale) => held.delete(sale.company));
    verifiedTrades.purchases.forEach((purchase) => held.add(purchase.company));
    const numericTrades = normalizedTrades(verifiedTrades);
    const review = reviewMarks({ q3: pack.q3, q4Marks: pack.agentBData.marks, heldAtQ4: held, purchases: numericTrades.purchases, sales: numericTrades.sales, fxRate: typeof fx === "string" ? fx : fx.rate, thresholdPct });
    const nav = computeNav({ closingCash: input.bankReport.closing, navQ3: pack.navQ3, q3Holdings: pack.q3Holdings, q4Marks: review.entries, fx, review, purchases: numericTrades.purchases, sales: numericTrades.sales, q4Accruals: pack.q4Accruals, transactions: input.transactions });
    results = { review, nav };
    return results;
  };
  const handler = {
    async handleMessage(input: Message): Promise<Task> {
      if (!input.taskId) {
        const parsed = requestDataSchema.safeParse(data(input));
        if (!parsed.success) throw new A2AError(JsonRpcErrorCodes.InvalidParams, "First message requires fund and valuation_date data");
        if (parsed.data.fund !== pack.agentBData.fundCode || parsed.data.valuation_date !== pack.agentBData.valuationDate) return task("failed", "Fund or valuation date does not match Agent B data");
        const created = task("input-required", "To release the Q4 marks I need the fund's Q4 purchases and sales of companies. Send a data part {purchases:[{company,date,amount_usd}], sales:[{company,date,proceeds_usd}]}.");
        taskStore.set(created.id, created);
        return created;
      }
      const current = taskStore.get(input.taskId);
      if (!current) throw new A2AError(JsonRpcErrorCodes.TaskNotFound, `Unknown task ${input.taskId}`);
      if (input.contextId !== current.contextId) throw new A2AError(JsonRpcErrorCodes.InvalidParams, "Task contextId does not match");
      if (current.status.state === "completed") return current;
      const parsed = tradesSchema.safeParse(data(input));
      if (!parsed.success) throw new A2AError(JsonRpcErrorCodes.InvalidParams, "Trade data is invalid or missing");
      const verification = verifyTrades(toTradeSet(parsed.data), expectedTrades(pack.agentBData));
      if (!verification.ok) {
        const waiting = { ...current, status: { ...current.status, state: "input-required" as const, message: message(`Matched ${verification.matched} of ${verification.expected} items. Please re-check your purchases and sales and resend.`) } };
        taskStore.set(waiting.id, waiting);
        return waiting;
      }
      verifiedTrades = toTradeSet(parsed.data);
      const artifact = buildMarksArtifact(pack.agentBData);
      const { artifactId, ...artifactData } = artifact;
      const completed: Task = { ...current, status: { ...current.status, state: "completed", message: message("Q4 marks released") }, artifacts: [{ artifactId, parts: [dataPart(artifactData)] }] };
      taskStore.set(completed.id, completed);
      return completed;
    }
  };
  return { app: createA2AServer({ card, handler, logger }), getResults: () => results, computeReports };
}