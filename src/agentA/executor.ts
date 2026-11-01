import { A2AError } from "../core/errors.js";
import { dataPart } from "../a2a/builders.js";
import { buildUserMessage } from "../a2a/client.js";
import type { A2AClient } from "../a2a/client.js";
import type { Task } from "../a2a/schemas.js";
import type { IngestResult } from "./index.js";

interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

interface ExecutorInput {
  ingest: () => Promise<IngestResult>;
  bClient: Pick<A2AClient, "sendMessage">;
  logger: Logger;
  fundCode: string;
  valuationDate: string;
}

function dataFrom(task: Task): Record<string, unknown> {
  const part = task.artifacts?.[0]?.parts[0];
  if (!part || part.kind !== "data") throw new A2AError(-32603, "Agent B completed without a data artifact");
  return part.data;
}

function matchedMessage(task: Task): string {
  return task.status.message?.parts.find((part) => part.kind === "text")?.text ?? "Agent B requested another trade attempt";
}

export async function runBankAgent({ ingest, bClient, logger, fundCode, valuationDate }: ExecutorInput): Promise<Record<string, unknown>> {
  const result = await ingest();
  let task = await bClient.sendMessage(buildUserMessage([dataPart({ fund: fundCode, valuation_date: valuationDate })]));
  if (task.status.state !== "input-required") {
    throw new A2AError(-32603, `Agent B expected input-required, received ${task.status.state}`);
  }
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const message = buildUserMessage([dataPart({ purchases: result.trades.purchases, sales: result.trades.sales })], { taskId: task.id, contextId: task.contextId });
    task = await bClient.sendMessage(message);
    if (task.status.state === "completed") return dataFrom(task);
    if (task.status.state === "failed") throw new A2AError(-32603, "Agent B failed while verifying trades");
    if (task.status.state !== "input-required") throw new A2AError(-32603, `Unexpected Agent B state: ${task.status.state}`);
    logger.warn("Agent B did not match all trades; retrying unchanged trades", { attempt, message: matchedMessage(task) });
  }
  throw new A2AError(-32603, "Agent B did not verify trades after 3 attempts");
}