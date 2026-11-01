import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { Decimal } from "decimal.js";

import { A2AClient } from "./a2a/client.js";
import { createJsonlLog } from "./a2a/log.js";
import { startServer, type A2ALogger } from "./a2a/server.js";
import { InMemoryTaskStore } from "./a2a/taskStore.js";
import { runBankAgent } from "./agentA/executor.js";
import { createAgentA } from "./agentA/index.js";
import { LlmClient } from "./agentA/llm/client.js";
import type { CategorizeDeps } from "./agentA/llm/categorize.js";
import { createAgentB } from "./agentB/index.js";
import type { NavResult } from "./agentB/nav.js";
import type { ReviewResult } from "./agentB/review.js";
import { getEnv, type EnvOverrides } from "./config/env.js";
import { loadFx } from "./config/fx.js";
import { LlmError, ParseError } from "./core/errors.js";
import { loadAgentBData } from "./pack/loadAgentBData.js";
import { resolveAgentBData } from "./pack/workbook.js";
import { loadCvpQ3 } from "./pack/loadCvpQ3.js";
import { loadNavSummary } from "./pack/loadNavSummary.js";
import { writeOutputs } from "./output/writers.js";
import type { Transaction } from "./agentA/toTransactions.js";

export interface PipelineOptions {
  packDir?: string;
  outputDir?: string;
  agentAPort?: number;
  agentBPort?: number;
  llm?: CategorizeDeps["llm"];
  envOverrides?: EnvOverrides;
  logger?: A2ALogger;
}

export interface PipelineResult {
  closingCash: number;
  investmentsUsd: number;
  liabilities: number;
  navQ4: number;
  bridgeDifference: number;
  flaggedCount: number;
  flaggedCompanies: string[];
  thresholdPct: number;
  fxRate: string;
  transactionCount: number;
  fallbackCount: number;
  review: ReviewResult;
  nav: NavResult;
  transactions: Transaction[];
  marksArtifact: unknown;
}

function findPackFile(packDir: string, pattern: RegExp): string {
  const file = readdirSync(packDir).find((name) => pattern.test(name));
  if (!file) throw new ParseError(`No file matching ${pattern} in ${packDir}`);
  return join(packDir, file);
}

export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineResult> {
  const env = getEnv(options.envOverrides);
  const packDir = resolve(options.packDir ?? env.PACK_DIR);
  const outputDir = resolve(options.outputDir ?? env.OUTPUT_DIR);
  const logger: A2ALogger = options.logger ?? {
    info: () => undefined,
    warn: (msg, ctx) => console.warn(msg, ctx ?? {}),
    error: (msg, ctx) => console.error(msg, ctx ?? {})
  };

  const fx = loadFx(join(process.cwd(), "config/fx-rates.json"));
  const thresholdPct = new Decimal(env.THRESHOLD_PCT);

  const navSummary = await loadNavSummary(packDir);
  const agentBData = loadAgentBData(resolveAgentBData(packDir));
  const q3Positions = await loadCvpQ3(packDir);

  const llm = options.llm ?? (env.LLM_API_KEY
    ? new LlmClient({
        apiKey: env.LLM_API_KEY,
        baseUrl: env.LLM_BASE_URL,
        model: env.LLM_MODEL,
        cacheDir: env.LLM_CACHE_DIR
      })
    : {
        chatJson: async () => {
          throw new LlmError("LLM API key not configured; rules fallback will be used");
        }
      });

  const taskStore = new InMemoryTaskStore();
  const agentB = createAgentB({
    pack: {
      agentBData,
      q3: q3Positions,
      q3Holdings: navSummary.holdings,
      navQ3: navSummary.navQ3,
      q4Accruals: navSummary.q4Accruals
    },
    taskStore,
    fx,
    thresholdPct,
      port: options.agentBPort ?? env.AGENT_B_PORT,
      logger
  });

  const agentA = createAgentA({
    config: {
      packDir,
      fundCode: agentBData.fundCode,
      valuationDate: agentBData.valuationDate
    },
    llm,
    logger
  });

  let aServer: { close(): Promise<void>; port: number } | undefined;
  let bServer: { close(): Promise<void>; port: number } | undefined;

  try {
    bServer = await startServer(agentB.app, options.agentBPort ?? env.AGENT_B_PORT);
    aServer = await startServer(agentA.app, options.agentAPort ?? env.AGENT_A_PORT);

    const logPath = join(outputDir, "a2a_log.jsonl");
    rmSync(logPath, { force: true });
    const logSink = createJsonlLog(logPath);
    const bClient = new A2AClient(`http://127.0.0.1:${bServer.port}/a2a`, { logSink });

    const marksArtifact = await runBankAgent({
      ingest: agentA.ingest,
      bClient,
      logger,
      fundCode: agentBData.fundCode,
      valuationDate: agentBData.valuationDate
    });

    const ingestResult = await agentA.ingest();
    const reports = agentB.computeReports({
      transactions: ingestResult.transactions,
      bankReport: ingestResult.bankReport
    });

    writeOutputs(outputDir, {
      transactions: ingestResult.transactions,
      marksArtifact,
      review: reports.review,
      nav: reports.nav,
      bankReport: ingestResult.bankReport
    });

    const flaggedEntries = reports.review.entries.filter((entry) => entry.flags.length > 0);

    return {
      closingCash: reports.nav.closing_cash,
      investmentsUsd: reports.nav.investments_usd,
      liabilities: reports.nav.liabilities,
      navQ4: reports.nav.nav_q4,
      bridgeDifference: reports.nav.bridge.difference,
      flaggedCount: flaggedEntries.length,
      flaggedCompanies: flaggedEntries.map((e) => e.company),
      thresholdPct: reports.review.threshold_pct,
      fxRate: reports.review.eurusd_rate.toString(),
      transactionCount: ingestResult.transactions.length,
      fallbackCount: ingestResult.fallbackCount,
      review: reports.review,
      nav: reports.nav,
      transactions: ingestResult.transactions,
      marksArtifact
    };
  } finally {
    await Promise.allSettled([
      aServer?.close(),
      bServer?.close()
    ]);
  }
}
