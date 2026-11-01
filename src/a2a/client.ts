import { randomUUID } from "node:crypto";

import { A2AError } from "../core/errors.js";
import type { JsonlLogEntry } from "./log.js";
import {
  AgentCardSchema,
  JsonRpcErrorCodes,
  JsonRpcResponseSchema,
  MessageSchema,
  TaskSchema,
  type AgentCard,
  type Message,
  type Part,
  type Task
} from "./schemas.js";
import type { A2ALogSink } from "./server.js";

export interface A2AClientOptions {
  fetchImpl?: typeof fetch;
  logSink?: A2ALogSink;
  timeoutMs?: number;
}

function emit(
  sink: A2ALogSink | undefined,
  direction: JsonlLogEntry["direction"],
  payload: unknown
): void {
  const entry: JsonlLogEntry = {
    ts: new Date().toISOString(), direction, from: "client", to: "server", payload
  };
  if (typeof sink === "function") {
    sink(entry);
  } else {
    sink?.write(entry);
  }
}

async function jsonOrError(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new A2AError(JsonRpcErrorCodes.InternalError, "A2A response was not valid JSON");
  }
}

export class A2AClient {
  private readonly fetchImpl: typeof fetch;
  private readonly logSink?: A2ALogSink;
  private readonly timeoutMs: number;
  private card?: AgentCard;

  constructor(private readonly baseUrl: string, options: A2AClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logSink = options.logSink;
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async getCard(): Promise<AgentCard> {
    const url = new URL("/.well-known/agent-card.json", this.baseUrl).toString();
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    const payload = await jsonOrError(response);
    const parsed = AgentCardSchema.safeParse(payload);
    if (!response.ok || !parsed.success) {
      throw new A2AError(JsonRpcErrorCodes.InternalError, "Could not load agent card");
    }
    this.card = parsed.data;
    return this.card;
  }

  async sendMessage(message: Message): Promise<Task> {
    const card = this.card ?? await this.getCard();
    const request = {
      jsonrpc: "2.0" as const,
      id: randomUUID(),
      method: "message/send",
      params: { message: MessageSchema.parse(message) }
    };
    emit(this.logSink, "request", request);
    const response = await this.fetchImpl(card.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    const payload = await jsonOrError(response);
    emit(this.logSink, "response", payload);
    const parsed = JsonRpcResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new A2AError(JsonRpcErrorCodes.InternalError, "Invalid A2A response");
    }
    if ("error" in parsed.data) {
      throw new A2AError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.data);
    }
    if (!response.ok) {
      throw new A2AError(JsonRpcErrorCodes.InternalError, "Invalid A2A response");
    }
    const task = TaskSchema.safeParse(parsed.data.result);
    if (!task.success) {
      throw new A2AError(JsonRpcErrorCodes.InternalError, "A2A response did not contain a valid task");
    }
    return task.data;
  }
}

export function buildUserMessage(parts: Part[], options: { taskId?: string; contextId?: string } = {}): Message {
  return MessageSchema.parse({
    kind: "message",
    role: "user",
    messageId: randomUUID(),
    parts,
    ...options
  });
}