import { readFileSync } from "node:fs";

import { dataPart, makeTask, textPart } from "../a2a/builders.js";
import { createA2AServer, type A2ALogger } from "../a2a/server.js";
import type { Task } from "../a2a/schemas.js";
import { loadNavSummary } from "../pack/loadNavSummary.js";
import { assertBankChecks, runBankChecks, type BankCheckReport } from "./checks.js";
import { categorizeAll, type CategorizeDeps } from "./llm/categorize.js";
import { extractLines } from "./pdf/extractRows.js";
import { parseStatement } from "./pdf/parseStatement.js";
import { toTransactions, type Transaction } from "./toTransactions.js";
import { deriveTrades, type DerivedTrades } from "./trades.js";
import { resolveBankStatement } from "../pack/workbook.js";

export interface AgentAConfig {
	packDir: string;
	fundCode: string;
	valuationDate: string;
}

export interface IngestResult {
	transactions: Transaction[];
	bankReport: BankCheckReport;
	trades: DerivedTrades;
	fallbackCount: number;
}

export interface AgentADependencies {
	config: AgentAConfig;
	llm: CategorizeDeps["llm"];
	logger: A2ALogger;
}

export function createAgentA(deps: AgentADependencies): { app: ReturnType<typeof createA2AServer>; ingest(): Promise<IngestResult> } {
	let cached: Promise<IngestResult> | undefined;
	const ingest = (): Promise<IngestResult> => {
		cached ??= (async () => {
			const nav = await loadNavSummary(deps.config.packDir);
		      const parsed = parseStatement(await extractLines(readFileSync(resolveBankStatement(deps.config.packDir))));
			const bankReport = runBankChecks(parsed);
			assertBankChecks(bankReport);
			const categorized = await categorizeAll(parsed.rawRows, { llm: deps.llm, ctx: { lpRoster: nav.lps, q3Liabilities: nav.liabilities }, logger: deps.logger });
			const transactions = toTransactions(parsed.rawRows, categorized);
			return { transactions, bankReport, trades: deriveTrades(categorized), fallbackCount: categorized.filter((item) => item.categorized_by === "rules_fallback").length };
		})();
		return cached;
	};

	const handler = {
		async handleMessage(message: Parameters<NonNullable<Parameters<typeof createA2AServer>[0]>["handler"]["handleMessage"]>[0]): Promise<Task> {
			const action = message.parts.find((part) => part.kind === "data")?.data.action;
			if (action !== "get_trades") return makeTask("failed", [textPart("Unknown action; expected get_trades")], { id: message.taskId, contextId: message.contextId });
			const result = await ingest();
			return makeTask("completed", [dataPart({ ...result.trades, transaction_count: result.transactions.length })], { id: message.taskId, contextId: message.contextId });
		}
	};
	const app = createA2AServer({
		card: {
			protocolVersion: "0.3.0", name: "GPF Bank & Ingestion Agent", description: "Bank statement ingestion and trade derivation", url: "http://127.0.0.1:8001/a2a", preferredTransport: "JSONRPC", version: "0.1.0", capabilities: { streaming: false, pushNotifications: false }, defaultInputModes: ["application/json", "text/plain"], defaultOutputModes: ["application/json"], skills: [{ id: "bank-statement-ingestion", name: "Bank statement ingestion", description: "Ingests and checks bank statements", tags: ["bank", "trades"] }]
		},
		handler,
		logger: deps.logger
	});
	return { app, ingest };
}
