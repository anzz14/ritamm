import express, { type ErrorRequestHandler, type Express, type Request } from "express";
import type { Server } from "node:http";

import { A2AError } from "../core/errors.js";
import type { JsonlLogEntry } from "./log.js";
import {
  AgentCardSchema,
  JsonRpcErrorCodes,
  JsonRpcRequestSchema,
  MessageSendParamsSchema,
  TaskSchema,
  type AgentCard,
  type Message,
  type Task
} from "./schemas.js";

export interface AgentHandler {
  handleMessage(message: Message, context?: A2AContext): Promise<Task>;
}

export interface A2AContext {
  requestId: string | number | null;
}

export interface A2ALogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export type A2ALogEntry = JsonlLogEntry;

export type A2ALogSink = ((entry: A2ALogEntry) => void) | { write(entry: A2ALogEntry): void };

interface ServerOptions {
  card: AgentCard;
  handler: AgentHandler;
  logger: A2ALogger;
  logSink?: A2ALogSink;
}

function emit(
  sink: A2ALogSink | undefined,
  direction: A2ALogEntry["direction"],
  payload: unknown
): void {
  const entry: A2ALogEntry = {
    ts: new Date().toISOString(), direction, from: "server", to: "client", payload
  };
  if (typeof sink === "function") {
    sink(entry);
  } else {
    sink?.write(entry);
  }
}

function idFrom(value: unknown): string | number | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" || typeof id === "number" || id === null ? id : null;
}

function response(id: string | number | null, error: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code: error, message } };
}

export function createA2AServer({ card, handler, logger, logSink }: ServerOptions): Express {
  const app = express();
  const postPath = new URL(AgentCardSchema.parse(card).url).pathname || "/";

  app.use(express.json());
  const jsonErrorHandler: ErrorRequestHandler = (error, request, res, next) => {
    if (error instanceof SyntaxError && "body" in error) {
      const body = response(null, JsonRpcErrorCodes.ParseError, "Parse error");
      emit(logSink, "request", null);
      emit(logSink, "response", body);
      res.status(200).json(body);
      return;
    }
    next(error);
  };
  app.use(jsonErrorHandler);

  app.get("/.well-known/agent-card.json", (request: Request, res) => {
    const host = request.get("host");
    const currentCard: AgentCard = host
      ? { ...card, url: `${request.protocol}://${host}${new URL(card.url).pathname}` }
      : card;
    res.json(currentCard);
  });

  app.post(postPath, async (request: Request, res) => {
    const payload: unknown = request.body;
    emit(logSink, "request", payload);
    const id = idFrom(payload);
    const envelope = JsonRpcRequestSchema.safeParse(payload);
    if (!envelope.success) {
      const body = response(id, JsonRpcErrorCodes.InvalidRequest, "Invalid Request");
      emit(logSink, "response", body);
      res.status(200).json(body);
      return;
    }
    if (envelope.data.method !== "message/send") {
      const body = response(envelope.data.id, JsonRpcErrorCodes.MethodNotFound, "Method not found");
      emit(logSink, "response", body);
      res.status(200).json(body);
      return;
    }
    const params = MessageSendParamsSchema.safeParse(envelope.data.params);
    if (!params.success) {
      const body = response(envelope.data.id, JsonRpcErrorCodes.InvalidParams, "Invalid params");
      emit(logSink, "response", body);
      res.status(200).json(body);
      return;
    }

    try {
      const task = TaskSchema.parse(await handler.handleMessage(params.data.message, {
        requestId: envelope.data.id
      }));
      const body = { jsonrpc: "2.0" as const, id: envelope.data.id, result: task };
      emit(logSink, "response", body);
      res.status(200).json(body);
    } catch (error) {
      logger.error("A2A handler failed", { error: error instanceof Error ? error.message : String(error) });
      const body = error instanceof A2AError
        ? response(envelope.data.id, error.code, error.message)
        : response(envelope.data.id, JsonRpcErrorCodes.InternalError, "Internal error");
      emit(logSink, "response", body);
      res.status(200).json(body);
    }
  });

  return app;
}

export async function startServer(app: Express, port: number): Promise<{ close(): Promise<void>; port: number }> {
  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(port);
    instance.once("listening", () => resolve(instance));
    instance.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Could not determine listening port");
  }
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
