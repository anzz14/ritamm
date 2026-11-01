import { describe, expect, it } from "vitest";

import { A2AClient, buildUserMessage } from "../../src/a2a/client.js";
import { makeTask, textPart } from "../../src/a2a/builders.js";
import { JsonRpcErrorCodes, type AgentCard } from "../../src/a2a/schemas.js";

const card: AgentCard = {
  protocolVersion: "0.3.0",
  name: "Test Agent",
  description: "Test",
  url: "https://agent.example.test/a2a",
  preferredTransport: "JSONRPC",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["application/json", "text/plain"],
  defaultOutputModes: ["application/json"],
  skills: []
};

describe("A2A client", () => {
  it("loads the card, sends a message, and logs both directions", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const logs: unknown[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: input.toString(), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify(card), { status: 200 });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "request", result: makeTask("completed", [textPart("done")]) }));
    };
    const client = new A2AClient("https://agent.example.test", {
      fetchImpl,
      logSink: (entry) => logs.push(entry)
    });
    const task = await client.sendMessage(buildUserMessage([textPart("hello")]));
    expect(task.status.state).toBe("completed");
    expect(calls[0]?.url).toBe("https://agent.example.test/.well-known/agent-card.json");
    expect(calls[1]?.url).toBe(card.url);
    expect(logs).toHaveLength(2);
  });

  it("throws the server's JSON-RPC error as A2AError", async () => {
    let callCount = 0;
    const fetchImpl: typeof fetch = async () => {
      callCount += 1;
      const payload = callCount === 1 ? card : {
        jsonrpc: "2.0", id: "request", error: { code: JsonRpcErrorCodes.InvalidParams, message: "Invalid params" }
      };
      return new Response(JSON.stringify(payload), { status: 200 });
    };
    const client = new A2AClient("https://agent.example.test", { fetchImpl });
    await expect(client.sendMessage(buildUserMessage([]))).rejects.toMatchObject({
      name: "A2AError",
      code: JsonRpcErrorCodes.InvalidParams,
      message: "Invalid params"
    });
  });
});