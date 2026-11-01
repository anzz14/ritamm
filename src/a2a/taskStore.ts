import type { Task } from "./schemas.js";

export class InMemoryTaskStore {
  private readonly tasks = new Map<string, Task>();

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  set(id: string, task: Task): this {
    this.tasks.set(id, task);
    return this;
  }
}