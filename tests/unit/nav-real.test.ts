import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import { LlmError } from "../../src/core/errors.js";
import { extractLines } from "../../src/agentA/pdf/extractRows.js";
import { parseStatement } from "../../src/agentA/pdf/parseStatement.js";
import { runBankChecks, assertBankChecks } from "../../src/agentA/checks.js";
import { categorizeAll } from "../../src/agentA/llm/categorize.js";
import { deriveTrades } from "../../src/agentA/trades.js";
import { toTransactions } from "../../src/agentA/toTransactions.js";
import { loadAgentBData } from "../../src/pack/loadAgentBData.js";
import { loadCvpQ3 } from "../../src/pack/loadCvpQ3.js";
import { loadNavSummary } from "../../src/pack/loadNavSummary.js";
import { resolveAgentBData, resolveBankStatement } from "../../src/pack/workbook.js";
import { reviewMarks } from "../../src/agentB/review.js";
import { computeNav } from "../../src/agentB/nav.js";

const packDir = join(process.cwd(), "pack");

describe("NAV with supplied pack", () => {
  it("matches the quarter-close golden bridge using rules fallback offline", async () => {
    const parsed = parseStatement(await extractLines(readFileSync(resolveBankStatement(packDir))));
    const bankReport = runBankChecks(parsed);
    assertBankChecks(bankReport);
    const navSummary = await loadNavSummary(packDir);
    const agentB = loadAgentBData(resolveAgentBData(packDir));
    const categorized = await categorizeAll(parsed.rawRows, {
      llm: { chatJson: async () => { throw new LlmError("offline"); } },
      ctx: { lpRoster: navSummary.lps, q3Liabilities: navSummary.liabilities },
      logger: { warn: () => undefined }
    });
    const trades = deriveTrades(categorized);
    const transactions = toTransactions(parsed.rawRows, categorized);
    const heldAtQ4 = new Set(navSummary.holdings.map((holding) => holding.company));
    agentB.sales.forEach((sale) => heldAtQ4.delete(sale.company));
    agentB.purchases.forEach((purchase) => heldAtQ4.add(purchase.company));
    const review = reviewMarks({
      q3: await loadCvpQ3(packDir), q4Marks: agentB.marks, heldAtQ4,
      purchases: agentB.purchases.map((purchase) => ({ company: purchase.company, date: purchase.date, amount_usd: purchase.amount.toNumber() })),
      sales: agentB.sales.map((sale) => ({ company: sale.company, date: sale.date, proceeds_usd: sale.proceeds.toNumber() })),
      fxRate: "1.0666", thresholdPct: new Decimal("15")
    });
    const result = computeNav({
      closingCash: bankReport.closing, navQ3: navSummary.navQ3, q3Holdings: navSummary.holdings,
      q4Marks: review.entries, fx: "1.0666", review, purchases: trades.purchases, sales: trades.sales,
      q4Accruals: navSummary.q4Accruals, transactions
    });
    expect(result.closing_cash).toBe(23896579.25);
    expect(result.investments_usd).toBe(146062460);
    expect(result.liabilities).toBe(195000);
    expect(result.nav_q4).toBe(169764039.25);
    expect(result.management_fee).toBe(1250000);
    expect(result.bridge.capital_called).toBe(20000000);
    expect(result.bridge.distributions).toBe(22500000);
    expect(result.bridge.income).toBe(459429.25);
    expect(result.bridge.expenses).toBe(1522850);
    expect(result.bridge.realized_gain).toBe(9000000);
    expect(result.bridge.change_in_unrealized).toBe(4102660);
    expect(result.bridge.difference).toBe(0);

    expect(() => computeNav({
      closingCash: bankReport.closing, navQ3: navSummary.navQ3, q3Holdings: navSummary.holdings,
      q4Marks: review.entries, fx: "1.0666", review, purchases: trades.purchases, sales: trades.sales,
      q4Accruals: navSummary.q4Accruals,
      transactions: transactions.map((transaction) => transaction.category === "accrual_settlement" && transaction.debit === 65000 ? { ...transaction, category: "expense" as const } : transaction)
    })).toThrow(/65000/);

    const changedFx = computeNav({
      closingCash: bankReport.closing, navQ3: navSummary.navQ3, q3Holdings: navSummary.holdings,
      q4Marks: review.entries, fx: "1.0667", review, purchases: trades.purchases, sales: trades.sales,
      q4Accruals: navSummary.q4Accruals, transactions
    });
    expect(changedFx.nav_q4 - result.nav_q4).toBe(1310);

    expect(() => computeNav({ ...baseNav(navSummary, review, trades, transactions, bankReport), sales: [{ company: "Missing Co", date: "2022-12-01", proceeds_usd: 1 }] })).toThrow(/not in Q3 holdings/);
  });
});

function baseNav(navSummary: Awaited<ReturnType<typeof loadNavSummary>>, review: ReturnType<typeof reviewMarks>, trades: ReturnType<typeof deriveTrades>, transactions: ReturnType<typeof toTransactions>, bankReport: ReturnType<typeof runBankChecks>) {
  return {
    closingCash: bankReport.closing, navQ3: navSummary.navQ3, q3Holdings: navSummary.holdings,
    q4Marks: review.entries, fx: "1.0666", review, purchases: trades.purchases, sales: trades.sales,
    q4Accruals: navSummary.q4Accruals, transactions
  };
}
