import { join, resolve } from "node:path";
import { runPipeline } from "./pipeline.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled error:", reason instanceof Error ? reason.message : String(reason));
  process.exit(1);
});

async function main(): Promise<void> {
  const packArg = process.argv[2] ?? "./pack";
  const rootArg = process.argv[3] ?? ".";
  const packDir = resolve(packArg);
  const outputDir = resolve(join(rootArg, "output"));

  console.log(`Starting GPF Quarter-Close pipeline...`);
  console.log(`Pack directory:   ${packDir}`);
  console.log(`Output directory: ${outputDir}`);

  const result = await runPipeline({ packDir, outputDir });

  console.log("\n==================== GPF Q4 2022 NAV Summary ====================");
  console.log(`Closing Cash:        $${result.closingCash.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  console.log(`Investments (USD):   $${result.investmentsUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  console.log(`Liabilities:         $${result.liabilities.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  console.log(`-----------------------------------------------------------------`);
  console.log(`Q4 NAV:              $${result.navQ4.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  console.log(`Bridge Difference:   $${result.bridgeDifference.toFixed(2)}`);
  console.log(`-----------------------------------------------------------------`);
  console.log(`EUR/USD FX Rate:     ${result.fxRate}`);
  console.log(`Threshold:           ${result.thresholdPct}%`);
  console.log(`Flagged Companies:   ${result.flaggedCount} (${result.flaggedCompanies.join(", ")})`);
  console.log(`Transactions:        ${result.transactionCount} total (${result.fallbackCount} rules fallback)`);
  console.log("=================================================================\n");
}

main().catch((error) => {
  console.error("Pipeline failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

