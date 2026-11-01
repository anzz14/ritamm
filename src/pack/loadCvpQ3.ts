import ExcelJS from "exceljs";

import { ParseError } from "../core/errors.js";
import type { Q3Position } from "../core/types.js";
import { findRow, money, normalized, resolvePackFile, rowValues, text } from "./workbook.js";

function column(headers: string[], names: string[]): number {
  const index = headers.findIndex((header) => names.some((name) => header.includes(name)));
  if (index < 0) {
    throw new ParseError(`Missing Q3 column: ${names.join("/")}`);
  }
  return index;
}

export async function loadCvpQ3(packDir: string): Promise<Q3Position[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolvePackFile(packDir, /CVP_Valuation_Report/i));
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ParseError("Q3 workbook has no worksheet");
  }
  const headerRow = findRow(worksheet, "Portfolio company");
  if (!headerRow) {
    throw new ParseError("Q3 workbook has no Portfolio company header");
  }
  const headers = rowValues(worksheet.getRow(headerRow)).map(normalized);
  const company = column(headers, ["portfolio company"]);
  const currency = column(headers, ["currency"]);
  const cost = column(headers, ["cost local", "cost"]);
  const fairValue = column(headers, ["fair value local", "fair value"]);
  const fxRate = column(headers, ["fx rate", "exchange rate"]);
  const fairValueUsd = column(headers, ["fair value usd", "usd fair value"]);
  const method = column(headers, ["method", "valuation method"]);
  const positions: Q3Position[] = [];
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = rowValues(worksheet.getRow(rowNumber));
    if (values.some((value) => normalized(value).startsWith("total"))) {
      break;
    }
    if (!text(values[company])) {
      continue;
    }
    positions.push({
      company: text(values[company]), currency: text(values[currency]),
      costLocal: money(values[cost]), fairValueLocal: money(values[fairValue]),
      fxRate: text(values[fxRate]), fairValueUsd: money(values[fairValueUsd]),
      method: text(values[method])
    });
  }
  return positions;
}