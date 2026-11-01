import { LlmError, ValidationError } from "../../core/errors.js";
import type { RawRow } from "../pdf/parseStatement.js";
import { BATCH_SIZE, buildSystemPrompt, buildUserPrompt, categorizationSchema, type Categorization, type PromptContext } from "./prompt.js";
import { rulesCategorize } from "./fallback.js";
import { validateCategorization } from "./validate.js";

interface LlmLike {
  chatJson(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, schema: typeof categorizationSchema): Promise<Categorization[]>;
}

interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface Categorized extends Categorization {
  categorized_by: "llm" | "rules_fallback";
  date: string;
  debit: RawRow["debit"];
  credit: RawRow["credit"];
}

export interface CategorizeDeps {
  llm: LlmLike;
  ctx: PromptContext;
  logger: Logger;
}

function batches<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function remap(results: Categorization[], indexes: number[]): Categorization[] {
  return results.map((result) => ({ ...result, index: indexes[result.index] ?? result.index }));
}

function enrich(row: RawRow, result: Categorization, categorized_by: Categorized["categorized_by"]): Categorized {
  return { ...result, date: row.date, debit: row.debit, credit: row.credit, categorized_by };
}

function deterministicPostFix(rows: RawRow[], candidates: Categorized[], context: PromptContext): Categorized[] {
  return candidates.map((candidate, index) => {
    const fallback = rulesCategorize(rows[index]!, context, index);
    const saleCompanyMismatch = candidate.category === "sale_proceeds" && fallback.company !== null && candidate.company !== fallback.company;
    const missedBankCharge = candidate.category === "expense" && fallback.category === "bank_charges";
    return saleCompanyMismatch || missedBankCharge
      ? enrich(rows[index]!, fallback, "rules_fallback")
      : candidate;
  });
}

export async function categorizeAll(rows: RawRow[], deps: CategorizeDeps): Promise<Categorized[]> {
  const output = new Map<number, Categorized>();
  for (const [offset, batch] of batches(rows, BATCH_SIZE).entries()) {
    const start = offset * BATCH_SIZE;
    try {
      const results = await deps.llm.chatJson([
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(batch, deps.ctx, start) }
      ], categorizationSchema);
      for (const result of remap(results, batch.map((_, index) => start + index))) output.set(result.index, enrich(rows[result.index]!, result, "llm"));
    } catch (error) {
      if (!(error instanceof LlmError)) throw error;
      deps.logger.warn("LLM categorization batch failed; using rules fallback", { start, error: error.message });
      batch.forEach((row, index) => output.set(start + index, enrich(row, rulesCategorize(row, deps.ctx, start + index), "rules_fallback")));
    }
  }
  let candidates = rows.map((row, index) => output.get(index) ?? enrich(row, rulesCategorize(row, deps.ctx, index), "rules_fallback"));
  let issues = validateCategorization(rows, candidates, deps.ctx);
  if (issues.length) {
    const affected = new Set(issues.flatMap((issue) => [...issue.matchAll(/index (\d+)/gi)].map((match) => Number(match[1]))));
    const indexes = [...affected].filter((index) => index >= 0 && index < rows.length);
    if (indexes.length) {
      try {
        const corrected = await deps.llm.chatJson([
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: `${buildUserPrompt(indexes.map((index) => rows[index]!), deps.ctx)}\nCorrect these issues: ${issues.join("; ")}` }
        ], categorizationSchema);
        for (const result of remap(corrected, indexes)) output.set(result.index, enrich(rows[result.index]!, result, "llm"));
      } catch (error) {
        if (!(error instanceof LlmError)) throw error;
        deps.logger.warn("LLM correction failed; using rules fallback", { indexes, error: error.message });
        indexes.forEach((index) => output.set(index, enrich(rows[index]!, rulesCategorize(rows[index]!, deps.ctx, index), "rules_fallback")));
      }
    }
    candidates = rows.map((row, index) => output.get(index) ?? enrich(row, rulesCategorize(row, deps.ctx, index), "rules_fallback"));
    issues = validateCategorization(rows, candidates, deps.ctx);
  }
  candidates = deterministicPostFix(rows, candidates, deps.ctx);
  issues = validateCategorization(rows, candidates, deps.ctx);
  if (issues.length) throw new ValidationError("Categorization remained invalid", { issues });
  return candidates;
}