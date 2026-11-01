import { describe, expect, it } from "vitest";

import { makeTask, textPart } from "../../src/a2a/builders.js";
import { createA2AServer, startServer, type A2ALogEntry } from "../../src/a2a/server.js";
import type { AgentCard } from "../../src/a2a/schemas.js";

const card: AgentCard = {
  protocolVersion: "0.3.0",
  name: "Echo Agent",
  description: "Test agent",
  url: "http://127.0.0.1:0/a2a",
  preferredTransport: "JSONRPC",
  version: "0.1.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["application/json", "text/plain"],
  defaultOutputModes: ["application/json"],
  skills: []
};

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

async function post(url: string, payload: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

describe("A2A server", () => {
  it("serves the card and handles message/send with request and response logs", async () => {
    const entries: A2ALogEntry[] = [];
    const app = createA2AServer({
      card,
      logger,
      logSink: (entry) => entries.push(entry),
      handler: { handleMessage: async () => makeTask("completed", [textPart("ok")]) }
    });
    const server = await startServer(app, 0);
    try {
      const cardResponse = await fetch(`http://127.0.0.1:${server.port}/.well-known/agent-card.json`);
      expect((await cardResponse.json()).name).toBe("Echo Agent");
      const response = await post(`http://127.0.0.1:${server.port}/a2a`, {
        jsonrpc: "2.0", id: 1, method: "message/send",
        params: { message: { kind: "message", role: "user", messageId: "m1", parts: [textPart("hi")] } }
      });
      expect(response.status).toBe(200);
      expect((await response.json()).result.status.state).toBe("completed");
      expect(entries).toHaveLength(2);
    } finally {
      await server.close();
    }
  });

  it("returns protocol errors and hides handler failures", async () => {
    const app = createA2AServer({
      card,
      logger,
      handler: { handleMessage: async () => { throw new Error("private stack detail"); } }
    });
    const server = await startServer(app, 0);
    try {
      const base = `http://127.0.0.1:${server.port}/a2a`;
      expect((await (await post(base, { jsonrpc: "2.0", id: 1, method: "other", params: {} })).json()).error.code).toBe(-32601);
      expect((await (await post(base, { jsonrpc: "2.0", id: 2, method: "message/send", params: {} })).json()).error.code).toBe(-32602);
      expect((await (await post(base, { jsonrpc: "2.0", id: 3, method: "message/send", params: { message: { kind: "message", role: "user", messageId: "m", parts: [] } } })).json()).error.code).toBe(-32603);
      const malformed = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
      const malformedBody = await malformed.json();
      expect(malformed.status).toBe(200);
      expect(malformedBody.error.code).toBe(-32700);
    } finally {
      await server.close();
    }
  });
});