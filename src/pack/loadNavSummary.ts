import ExcelJS from "exceljs";

import { ReconciliationError, ParseError } from "../core/errors.js";
import { eq, parseMoney, sum, type Money } from "../core/money.js";
import type { Liability, LpCommitment, Q3Holding } from "../core/types.js";
import { normalized, resolvePackFile, rowValues, text } from "./workbook.js";

export interface NavSummary {
  cash: Money;
  investmentsFv: Money;
  liabilities: Liability[];
  navQ3: Money;
  holdings: Q3Holding[];
  lps: LpCommitment[];
  q4Accruals: Liability[];
}

function amount(value: unknown): Money | undefined {
  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "")) {
    try { return parseMoney(value); } catch { return undefined; }
  }
  return undefined;
}

function lastAmount(values: unknown[]): Money | undefined {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const parsed = amount(values[index]);
    if (parsed) return parsed;
  }
  return undefined;
}

function rowContaining(sheet: ExcelJS.Worksheet, predicate: (value: string) => boolean): number | undefined {
  for (let number = 1; number <= sheet.rowCount; number += 1) {
    if (rowValues(sheet.getRow(number)).some((value) => predicate(normalized(value)))) return number;
  }
  return undefined;
}

function tableHeader(sheet: ExcelJS.Worksheet, required: string[]): { row: number; columns: number[] } {
  for (let number = 1; number <= sheet.rowCount; number += 1) {
    const headers = rowValues(sheet.getRow(number)).map(normalized);
    if (required.every((needle) => headers.some((header) => header.includes(needle)))) {
      return {
        row: number,
        columns: required.map((needle) => headers.findIndex((header) => header.includes(needle)))
      };
    }
  }
  throw new ParseError(`Missing worksheet table: ${required.join(", ")}`);
}

function parseHoldings(sheet: ExcelJS.Worksheet): Q3Holding[] {
  const header = tableHeader(sheet, ["portfolio company", "cost", "fair value"]);
  const [companyColumn, costColumn, fairValueColumn] = header.columns;
  if (companyColumn === undefined || costColumn === undefined || fairValueColumn === undefined) {
    throw new ParseError("Incomplete holding header");
  }
  const holdings: Q3Holding[] = [];
  for (let number = header.row + 1; number <= sheet.rowCount; number += 1) {
    const values = rowValues(sheet.getRow(number));
    if (values.some((value) => normalized(value) === "total")) break;
    const company = text(values[companyColumn]);
    if (!company) continue;
    const cost = lastAmount([values[costColumn]]);
    const fairValue = lastAmount([values[fairValueColumn]]);
    if (!cost || !fairValue) throw new ParseError(`Invalid holding row ${number}`);
    holdings.push({ company, costUsd: cost, fairValueUsd: fairValue });
  }
  return holdings;
}

function parseLiabilities(sheet: ExcelJS.Worksheet): Liability[] {
  const totalRow = rowContaining(sheet, (value) => value === "total liabilities");
  if (!totalRow) return [];
  let start = 1;
  for (let number = totalRow - 1; number >= 1; number -= 1) {
    const row = rowValues(sheet.getRow(number)).map(normalized);
    if (row.some((value) => value === "liabilities" || value === "liability")) {
      start = number + 1;
      break;
    }
  }
  const liabilities: Liability[] = [];
  for (let number = start; number < totalRow; number += 1) {
    const values = rowValues(sheet.getRow(number));
    const name = text(values.find((value) => typeof value === "string" && text(value) !== ""));
    const parsed = lastAmount(values);
    if (name && parsed && normalized(name) !== "total liabilities") liabilities.push({ name, amount: parsed });
  }
  return liabilities;
}

function parseLps(sheet: ExcelJS.Worksheet): LpCommitment[] {
  const marker = rowContaining(sheet, (value) => value.includes("investor") && value.includes("lp"));
  if (!marker) return [];
  let nameColumn: number | undefined;
  let codeColumn: number | undefined;
  let commitmentColumn: number | undefined;
  let headerRow: number;
  try {
    const header = tableHeaderFrom(sheet, marker, ["investor", "lp code", "commitment"]);
    headerRow = header.row;
    [nameColumn, codeColumn, commitmentColumn] = header.columns;
  } catch {
    const header = tableHeaderFrom(sheet, marker + 1, ["code", "name", "commitment"]);
    headerRow = header.row;
    [codeColumn, nameColumn, commitmentColumn] = header.columns;
  }
  if (nameColumn === undefined || codeColumn === undefined || commitmentColumn === undefined) {
    throw new ParseError("Incomplete LP commitment header");
  }
  const lps: LpCommitment[] = [];
  for (let number = headerRow + 1; number <= sheet.rowCount; number += 1) {
    const values = rowValues(sheet.getRow(number));
    if (values.some((value) => normalized(value) === "total")) break;
    const name = text(values[nameColumn]);
    const code = text(values[codeColumn]);
    const commitment = amount(values[commitmentColumn]);
    if (code && name && commitment) lps.push({ code, name, commitment });
  }
  return lps;
}

function tableHeaderFrom(sheet: ExcelJS.Worksheet, start: number, required: string[]): { row: number; columns: number[] } {
  for (let number = start; number <= Math.min(sheet.rowCount, start + 5); number += 1) {
    const headers = rowValues(sheet.getRow(number)).map(normalized);
    if (required.every((needle) => headers.some((header) => header.includes(needle)))) {
      return { row: number, columns: required.map((needle) => headers.findIndex((header) => header.includes(needle))) };
    }
  }
  throw new ParseError("Missing LP commitment header");
}

function parseAccruals(sheet: ExcelJS.Worksheet): Liability[] {
  const accruals: Liability[] = [];
  for (let number = 1; number <= sheet.rowCount; number += 1) {
    const values = rowValues(sheet.getRow(number));
    const name = text(values[0]);
    const parsed = lastAmount(values);
    if (name && parsed && !["total", "name", "liability"].includes(normalized(name))) accruals.push({ name, amount: parsed });
  }
  return accruals;
}

export async function loadNavSummary(packDir: string): Promise<NavSummary> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolvePackFile(packDir, /GPF_NAV_Summary/i));
  const sheet = workbook.worksheets[0];
  const accrualSheet = workbook.worksheets[1];
  if (!sheet || !accrualSheet) throw new ParseError("NAV workbook requires two worksheets");
  const cashRow = rowContaining(sheet, (value) => value === "cash" || value.startsWith("cash at bank"));
  const navRow = rowContaining(sheet, (value) => value === "nav" || value.startsWith("net asset value"));
  const cash = cashRow ? lastAmount(rowValues(sheet.getRow(cashRow))) : undefined;
  const navQ3 = navRow ? lastAmount(rowValues(sheet.getRow(navRow))) : undefined;
  if (!cash || !navQ3) throw new ParseError("NAV workbook is missing cash or NAV");
  const holdings = parseHoldings(sheet);
  const liabilities = parseLiabilities(sheet);
  const investmentsFv = sum(holdings.map((holding) => holding.fairValueUsd));
  const computed = cash.plus(investmentsFv).minus(sum(liabilities.map((liability) => liability.amount)));
  if (!eq(computed, navQ3)) throw new ReconciliationError("Q3 NAV does not reconcile", { computed: computed.toFixed(2), stated: navQ3.toFixed(2) });
  return { cash, investmentsFv, liabilities, navQ3, holdings, lps: parseLps(sheet), q4Accruals: parseAccruals(accrualSheet) };
}