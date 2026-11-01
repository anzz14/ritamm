import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createJsonlLog, createMemoryLog, type JsonlLogEntry } from "../../src/a2a/log.js";

const entry: JsonlLogEntry = {
  ts: "2022-12-31T00:00:00.000Z",
  direction: "request",
  from: "agent-a",
  to: "agent-b",
  payload: { ok: true }
};

describe("A2A logs", () => {
  it("appends one JSON line per file log entry and creates directories", () => {
    const directory = mkdtempSync(join(tmpdir(), "gpf-log-"));
    const path = join(directory, "nested", "a2a.jsonl");
    const log = createJsonlLog(path);
    log.write(entry);
    log.write({ ...entry, direction: "response" });
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "{}")).toEqual(entry);
  });

  it("keeps entries in memory for tests", () => {
    const log = createMemoryLog();
    log.write(entry);
    expect(log.entries).toEqual([entry]);
  });
});