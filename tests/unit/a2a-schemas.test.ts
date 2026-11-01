import { describe, expect, it } from "vitest";

import {
  AgentCardSchema,
  JsonRpcRequestSchema,
  MessageSchema,
  MessageSendParamsSchema,
  TaskSchema
} from "../../src/a2a/schemas.js";

const message = {
  kind: "message" as const,
  role: "user" as const,
  messageId: "message-1",
  parts: [{ kind: "text" as const, text: "Review the quarter close." }]
};

describe("A2A schemas", () => {
  it("parses a valid message/send request", () => {
    const request = JsonRpcRequestSchema.parse({
      jsonrpc: "2.0",
      id: 1,
      method: "message/send",
      params: { message }
    });
    expect(MessageSendParamsSchema.parse(request.params).message.messageId).toBe("message-1");
  });

  it("rejects a message without messageId", () => {
    expect(() => MessageSchema.parse({ ...message, messageId: undefined })).toThrow();
  });

  it("parses task, agent card, and data parts", () => {
    expect(TaskSchema.parse({
      kind: "task",
      id: "task-1",
      contextId: "context-1",
      status: { state: "completed", timestamp: "2022-12-31T00:00:00Z" },
      artifacts: [{ artifactId: "artifact-1", parts: [{ kind: "data", data: { ok: true } }] }]
    }).status.state).toBe("completed");
    expect(AgentCardSchema.parse({
      protocolVersion: "0.3.0",
      name: "Quarter Close Agent",
      description: "Test agent",
      url: "http://localhost:8001/",
      preferredTransport: "JSONRPC",
      version: "0.1.0",
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["application/json", "text/plain"],
      defaultOutputModes: ["application/json"],
      skills: [{ id: "review", name: "Review", description: "Reviews data", tags: ["nav"] }]
    }).protocolVersion).toBe("0.3.0");
  });
});