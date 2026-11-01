import { randomUUID } from "node:crypto";

import type { Part, Task, TaskState } from "./schemas.js";

export function textPart(text: string): Part {
  return { kind: "text", text };
}

export function dataPart(data: Record<string, unknown>): Part {
  return { kind: "data", data };
}

export function makeTask(
  state: TaskState,
  parts: Part[],
  options: { id?: string; contextId?: string } = {}
): Task {
  const id = options.id ?? randomUUID();
  return {
    kind: "task",
    id,
    contextId: options.contextId ?? randomUUID(),
    status: { state, timestamp: new Date().toISOString() },
    artifacts: [{ artifactId: randomUUID(), parts }]
  };
}