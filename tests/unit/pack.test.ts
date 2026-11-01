import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { loadCvpQ3 } from "../../src/pack/loadCvpQ3.js";
import { loadNavSummary } from "../../src/pack/loadNavSummary.js";
import { ReconciliationError } from "../../src/core/errors.js";

async function writeWorkbook(directory: string, name: string, build: (workbook: ExcelJS.Workbook) => void): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  await workbook.xlsx.writeFile(join(directory, name));
}

describe("pack loaders", () => {
  it("finds renamed Q3 workbooks, detects headers, and stops at Total", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gpf-pack-"));
    await writeWorkbook(directory, "renamed_CVP_Valuation_Report_final.xlsx", (workbook) => {
      const sheet = workbook.addWorksheet("Q3");
      sheet.addRow(["Prepared report"]);
      sheet.addRow(["Portfolio company", "Currency", "Cost Local", "Fair Value Local", "FX Rate", "Fair Value USD", "Method"]);
      sheet.addRow(["Ember", "EUR", "13100000.00", "13100000.00", "0.9748", "13445000.00", "Cost"]);
      sheet.addRow(["Ionmere", "USD", "14000000.00", "14000000.00", "1", "14000000.00", "Cost"]);
      sheet.addRow(["Total", "", 27100000, 27100000, "", 27445000, ""]);
      sheet.addRow(["Ignored", "USD", 1, 1, "1", 1, "Cost"]);
    });
    const positions = await loadCvpQ3(directory);
    expect(positions).toHaveLength(2);
    expect(positions[0]?.company).toBe("Ember");
    expect(positions[0]?.fxRate).toBe("0.9748");
    expect(positions[1]?.fairValueUsd.toFixed(2)).toBe("14000000.00");
  });

  it("loads NAV sections and rejects a broken reconciliation", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gpf-pack-"));
    await writeWorkbook(directory, "renamed_GPF_NAV_Summary.xlsx", (workbook) => {
      const nav = workbook.addWorksheet("NAV");
      nav.addRow(["Cash", 12450000]);
      nav.addRow(["Portfolio company", "Cost USD", "Fair Value USD"]);
      nav.addRow(["Ember", 13000000, 13979800]);
      nav.addRow(["Ionmere", 14000000, 133980000]);
      nav.addRow(["Total", "", 147959800]);
      nav.addRow(["Liabilities"]);
      nav.addRow(["Q3 reserve", 185000]);
      nav.addRow(["Total liabilities", 185000]);
      nav.addRow(["Investor (LP)"]);
      nav.addRow(["Code", "Name", "Commitment"]);
      nav.addRow(["LP01", "First LP", 125000000]);
      nav.addRow(["LP02", "Second LP", 125000000]);
      nav.addRow(["Total", "", 250000000]);
      nav.addRow(["NAV", 160224800]);
      const accruals = workbook.addWorksheet("Q4 Accruals");
      accruals.addRow(["Name", "Amount"]);
      accruals.addRow(["Admin", 65000]);
      accruals.addRow(["Audit", 130000]);
      accruals.addRow(["Total", 195000]);
    });
    const summary = await loadNavSummary(directory);
    expect(summary.navQ3.toFixed(2)).toBe("160224800.00");
    expect(summary.holdings).toHaveLength(2);
    expect(summary.lps).toHaveLength(2);
    expect(summary.q4Accruals).toHaveLength(2);
    expect(summary.q4Accruals[0]?.amount.toFixed(2)).toBe("65000.00");

    expect(summary.investmentsFv.toFixed(2)).toBe("147959800.00");

    const brokenDirectory = mkdtempSync(join(tmpdir(), "gpf-pack-broken-"));
    await writeWorkbook(brokenDirectory, "broken_GPF_NAV_Summary.xlsx", (workbook) => {
      const nav = workbook.addWorksheet("NAV");
      nav.addRow(["Cash", 1]);
      nav.addRow(["Portfolio company", "Cost USD", "Fair Value USD"]);
      nav.addRow(["Only holding", 1, 1]);
      nav.addRow(["Total", "", 1]);
      nav.addRow(["Liabilities"]);
      nav.addRow(["Total liabilities", 0]);
      nav.addRow(["Investor (LP)"]);
      nav.addRow(["Code", "Name", "Commitment"]);
      nav.addRow(["Total", "", 0]);
      nav.addRow(["NAV", 999]);
      workbook.addWorksheet("Q4 Accruals");
    });
    await expect(loadNavSummary(brokenDirectory)).rejects.toThrow(ReconciliationError);
  });
});