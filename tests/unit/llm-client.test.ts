import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";
import { describe, expect, it } from "vitest";

import { LlmClient } from "../../src/agentA/llm/client.js";

const schema = z.object({ ok: z.boolean() });
const messages = [{ role: "user" as const, content: "Return JSON" }];
const response = (content: string | null, status = 200, headers?: HeadersInit) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status, headers });

describe("LLM client", () => {
  it("extracts fenced JSON", async () => {
    const client = new LlmClient({ apiKey: "secret", baseUrl: "https://llm.test", model: "model", fetchImpl: async () => response("Here: ```json\n{\"ok\":true}\n```") });
    await expect(client.chatJson(messages, schema)).resolves.toEqual({ ok: true });
  });

  it("sends the API key and JSON content type correctly", async () => {
    let requestInit: RequestInit | undefined;
    const client = new LlmClient({
      apiKey: "secret",
      baseUrl: "https://llm.test",
      model: "model",
      fetchImpl: async (_input, init) => {
        requestInit = init;
        return response("{\"ok\":true}");
      }
    });

    await expect(client.chatJson(messages, schema)).resolves.toEqual({ ok: true });
    expect(requestInit?.headers).toEqual({
      Authorization: "Bearer secret",
      "content-type": "application/json"
    });
  });

  it("retries 429 and honors Retry-After", async () => {
    let calls = 0;
    const slept: number[] = [];
    const client = new LlmClient({ apiKey: "secret", baseUrl: "https://llm.test", model: "model", sleep: async (ms) => { slept.push(ms); }, fetchImpl: async () => ++calls === 1 ? response(null, 429, { "retry-after": "2" }) : response("{\"ok\":true}") });
    await expect(client.chatJson(messages, schema)).resolves.toEqual({ ok: true });
    expect(slept).toEqual([2000]);
  });

  it("does not retry unauthorized responses", async () => {
    let calls = 0;
    const client = new LlmClient({ apiKey: "secret", baseUrl: "https://llm.test", model: "model", fetchImpl: async () => { calls += 1; return response(null, 401); } });
    await expect(client.chatJson(messages, schema)).rejects.toMatchObject({ code: "LLM_ERROR", details: { status: 401 } });
    expect(calls).toBe(1);
  });

  it("retries empty content", async () => {
    let calls = 0;
    const client = new LlmClient({ apiKey: "secret", baseUrl: "https://llm.test", model: "model", sleep: async () => undefined, fetchImpl: async () => ++calls === 1 ? response(null) : response("{\"ok\":true}") });
    await expect(client.chatJson(messages, schema)).resolves.toEqual({ ok: true });
  });

  it("retries once with the validation error appended", async () => {
    const bodies: string[] = [];
    const client = new LlmClient({ apiKey: "secret", baseUrl: "https://llm.test", model: "model", fetchImpl: async (_input, init) => { bodies.push(String(init?.body)); return response(bodies.length === 1 ? "not JSON" : "{\"ok\":true}"); } });
    await expect(client.chatJson(messages, schema)).resolves.toEqual({ ok: true });
    expect(bodies[1]).toContain("Your JSON failed validation:");
  });

  it("uses disk cache without fetching on a hit", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "gpf-llm-cache-"));
    let calls = 0;
    const options = { apiKey: "secret", baseUrl: "https://llm.test", model: "model", cacheDir, fetchImpl: async () => { calls += 1; return response("{\"ok\":true}"); } };
    await expect(new LlmClient(options).chatJson(messages, schema)).resolves.toEqual({ ok: true });
    await expect(new LlmClient(options).chatJson(messages, schema)).resolves.toEqual({ ok: true });
    expect(calls).toBe(1);
  });
});