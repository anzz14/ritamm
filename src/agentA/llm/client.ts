import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { LlmError } from "../../core/errors.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  cacheDir?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable().optional() })
  })).min(1)
});

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function extractJson(content: string): string {
  const start = [...content].findIndex((character) => character === "{" || character === "[");
  if (start < 0) throw new LlmError("LLM response did not contain JSON", { retryable: false });
  const opening = content[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === opening) depth += 1;
    else if (character === closing && --depth === 0) return content.slice(start, index + 1);
  }
  throw new LlmError("LLM response contained incomplete JSON", { retryable: false });
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function cacheKey(model: string, messages: ChatMessage[]): string {
  return createHash("sha256").update(model + JSON.stringify(messages)).digest("hex");
}

function isRetryable(error: unknown): boolean {
  return error instanceof LlmError && error.details !== undefined
    && typeof error.details === "object" && (error.details as { retryable?: boolean }).retryable === true;
}

export class LlmClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: LlmClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 4;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async chatJson<T>(messages: ChatMessage[], schema: z.ZodType<T>): Promise<T> {
    const path = this.options.cacheDir ? join(this.options.cacheDir, `${cacheKey(this.options.model, messages)}.json`) : undefined;
    if (path) {
      try {
        return schema.parse(JSON.parse(readFileSync(path, "utf8")));
      } catch { /* A corrupt cache is treated as a miss. */ }
    }
    let requestMessages = [...messages];
    let validationRetry = false;
    let attempt = 0;
    while (attempt < this.maxRetries) {
      attempt += 1;
      let content: string;
      try {
        content = await this.request(requestMessages, attempt);
      } catch (error) {
        if (!isRetryable(error) || attempt >= this.maxRetries) throw error;
        const details = error instanceof LlmError && typeof error.details === "object" ? error.details as { retryAfterMs?: number } : {};
        const delay = details.retryAfterMs ?? (1000 * 2 ** (attempt - 1) + Math.random() * 100);
        await this.sleep(delay);
        continue;
      }
      try {
        const parsed = schema.parse(JSON.parse(extractJson(content)));
        if (path) {
          mkdirSync(this.options.cacheDir!, { recursive: true });
          writeFileSync(path, JSON.stringify(parsed), "utf8");
        }
        return parsed;
      } catch (error) {
        if (validationRetry) throw new LlmError("LLM JSON failed validation", { cause: error, retryable: false });
        validationRetry = true;
        requestMessages = [...requestMessages, {
          role: "user",
          content: `Your JSON failed validation: ${error instanceof z.ZodError ? error.message : String(error)} Return corrected JSON only`
        }];
      }
    }
    throw new LlmError("LLM request exhausted retries", { retryable: false });
  }

  private async request(messages: ChatMessage[], attempt: number): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json"
        },        body: JSON.stringify({ model: this.options.model, messages, temperature: 0, max_tokens: 4096 }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new LlmError("LLM network request failed", { retryable: true, attempt, cause: String(error) });
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const errorText = await response.text().catch(() => "");
      let providerMessage = "";
      try {
        const parsed = JSON.parse(errorText) as { error?: { message?: unknown } };
        providerMessage = typeof parsed.error?.message === "string" ? `: ${parsed.error.message}` : "";
      } catch {
        providerMessage = "";
      }
      throw new LlmError(`LLM request failed with status ${response.status}${providerMessage}`, {
        status: response.status,
        retryable,
        retryAfterMs: retryable ? retryAfterMs(response.headers.get("retry-after")) : undefined,
        providerMessage
      });
    }
    const body = await response.json().catch(() => undefined);
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new LlmError("LLM response shape was invalid", { retryable: true, attempt });
    const content = parsed.data.choices[0]?.message.content;
    if (!content?.trim()) throw new LlmError("LLM response content was empty", { retryable: true, attempt });
    return content;
  }
}