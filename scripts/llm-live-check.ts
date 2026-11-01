import { resolveBankStatement } from "../src/pack/workbook.js";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getEnv } from "../src/config/env.js";
import { loadNavSummary } from "../src/pack/loadNavSummary.js";
import { extractLines } from "../src/agentA/pdf/extractRows.js";
import { parseStatement } from "../src/agentA/pdf/parseStatement.js";
import { LlmClient } from "../src/agentA/llm/client.js";
import { categorizeAll } from "../src/agentA/llm/categorize.js";

interface Expected {
  category: string;
  lp_code: string | null;
  company: string | null;
}

function findFile(directory: string, pattern: RegExp): string {
  const files = readdirSync(directory);
  const file = files.find((candidate) => pattern.test(candidate));
  if (!file) {
    const available = files.length > 0 ? files.join(", ") : "directory is empty";
    throw new Error(`No pack file matching ${pattern} in ${directory}; available entries: ${available}`);
  }
  return join(directory, file);
}

async function main(): Promise<void> {
  const env = getEnv();
  if (!env.LLM_API_KEY) throw new Error("LLM_API_KEY is required for the live check");
  const expected = JSON.parse(readFileSync("tests/fixtures/expected_categories.json", "utf8")) as Expected[];
  const pdfPath = resolveBankStatement(env.PACK_DIR);
  const statement = parseStatement(await extractLines(readFileSync(pdfPath)));
  const nav = await loadNavSummary(env.PACK_DIR);
  const llm = new LlmClient({ apiKey: env.LLM_API_KEY, baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL, cacheDir: env.LLM_CACHE_DIR });
  const result = await categorizeAll(statement.rawRows, {
    llm,
    ctx: { lpRoster: nav.lps, q3Liabilities: nav.liabilities },
    logger: { warn: (message, context) => console.warn(message, context ?? {}) }
  });
  let mismatches = 0;
  console.log("row | expected | got | by");
  result.forEach((item, index) => {
    const expectedLabel = expected[index];
    const actual = { category: item.category, lp_code: item.lp_code, company: item.company };
    const matches = JSON.stringify(expectedLabel) === JSON.stringify(actual);
    if (!matches) mismatches += 1;
    console.log(`${index} | ${JSON.stringify(expectedLabel)} | ${JSON.stringify(actual)} | ${item.categorized_by}`);
  });
  console.log(`fallback rows: ${result.filter((item) => item.categorized_by === "rules_fallback").length}`);
  if (result.length !== expected.length || mismatches > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
