import { describe, expect, it } from "vitest";

import { A2AClient, buildUserMessage } from "../../src/a2a/client.js";
import { makeTask, textPart } from "../../src/a2a/builders.js";
import { createMemoryLog } from "../../src/a2a/log.js";
import { createA2AServer, startServer } from "../../src/a2a/server.js";
import { JsonRpcErrorCodes, type AgentCard, type Message } from "../../src/a2a/schemas.js";

const card: AgentCard = {
  protocolVersion: "0.3.0",
  name: "Echo Agent",
  description: "Two-turn integration test agent",
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

describe("A2A echo integration", () => {
  it("serves the card and completes a two-turn task with protocol errors", async () => {
    const log = createMemoryLog();
    let turn = 0;
    let firstMessage: Message | undefined;
    let taskId: string | undefined;
    let contextId: string | undefined;
    const app = createA2AServer({
      card,
      logger,
      handler: {
        handleMessage: async (message) => {
          turn += 1;
          if (turn === 1) {
            firstMessage = message;
            const task = makeTask("input-required", [textPart("Send the second turn.")]);
            taskId = task.id;
            contextId = task.contextId;
            return task;
          }
          expect(message.taskId).toBe(taskId);
          expect(message.contextId).toBe(contextId);
          return makeTask("completed", [textPart("Echo complete.")], {
            id: taskId,
            contextId
          });
        }
      },
      logSink: undefined
    });
    const server = await startServer(app, 0);
    card.url = `http://127.0.0.1:${server.port}/a2a`;
    const client = new A2AClient(`http://127.0.0.1:${server.port}`, { logSink: log });

    try {
      const cardResponse = await fetch(`http://127.0.0.1:${server.port}/.well-known/agent-card.json`);
      expect(cardResponse.status).toBe(200);
      expect((await cardResponse.json()).name).toBe("Echo Agent");

      const first = await client.sendMessage(buildUserMessage([textPart("Start") ]));
      expect(first.status.state).toBe("input-required");
      const second = await client.sendMessage(buildUserMessage([textPart("Continue")], {
        taskId: first.id,
        contextId: first.contextId
      }));
      expect(second.status.state).toBe("completed");
      expect(second.id).toBe(first.id);
      expect(second.contextId).toBe(first.contextId);

      const base = `http://127.0.0.1:${server.port}/a2a`;
      const parseError = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      });
      expect((await parseError.json()).error.code).toBe(JsonRpcErrorCodes.ParseError);

      const invalidRequest = await post(base, { nope: true });
      expect((await invalidRequest.json()).error.code).toBe(JsonRpcErrorCodes.InvalidRequest);

      const methodNotFound = await post(base, {
        jsonrpc: "2.0", id: 3, method: "tasks/get", params: {}
      });
      expect((await methodNotFound.json()).error.code).toBe(JsonRpcErrorCodes.MethodNotFound);

      const invalidParams = await post(base, {
        jsonrpc: "2.0", id: 4, method: "message/send", params: {}
      });
      expect((await invalidParams.json()).error.code).toBe(JsonRpcErrorCodes.InvalidParams);

      expect(log.entries).toHaveLength(4);
      expect(log.entries.map((entry) => entry.direction)).toEqual([
        "request", "response", "request", "response"
      ]);
      for (const entry of log.entries) {
        expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
      }
    } finally {
      await server.close();
    }
  });
});
