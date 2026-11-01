import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface JsonlLogEntry {
  ts: string;
  direction: "request" | "response";
  from: string;
  to: string;
  payload: unknown;
}

export interface JsonlLog {
  write(entry: JsonlLogEntry): void;
}

export function createJsonlLog(filePath: string): JsonlLog {
  mkdirSync(dirname(filePath), { recursive: true });
  return {
    write(entry) {
      appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
    }
  };
}

export function createMemoryLog(): JsonlLog & { entries: JsonlLogEntry[] } {
  const entries: JsonlLogEntry[] = [];
  return {
    entries,
    write(entry) {
      entries.push(entry);
    }
  };
}