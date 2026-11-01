import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Worksheet } from "exceljs";

import { ParseError } from "../core/errors.js";
import { isoFromUtcDate } from "../core/dates.js";
import { parseMoney, type Money } from "../core/money.js";

function inputDirectories(packDir: string): string[] {
  const fallback = resolve(process.cwd(), "src", "pack");
  return packDir === fallback ? [packDir] : [packDir, fallback];
}

function resolveInputFile(packDir: string, pattern: RegExp, extension: RegExp | undefined): string {
  const searched: string[] = [];
  for (const directory of inputDirectories(packDir)) {
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    searched.push(`${directory}: ${files.join(", ") || "(empty)"}`);
    const file = files.find((candidate) => pattern.test(candidate) && (!extension || extension.test(candidate)));
    if (file) return join(directory, file);
  }
  throw new ParseError(`No input file matching ${pattern}; searched ${searched.join("; ")}`);
}

export function resolvePackFile(packDir: string, pattern: RegExp): string {
  return resolveInputFile(packDir, pattern, /\.xlsx$/i);
}

export function resolveBankStatement(packDir: string): string {
  return resolveInputFile(packDir, /^GPF_Bank_Statement.*(?: \(\d+\))?\.pdf$/i, /\.pdf$/i);
}

export function resolveAgentBData(packDir: string): string {
  return resolveInputFile(packDir, /^agent_b_data(?: \(\d+\))?\.json$/i, /\.json$/i);
}

/*
 * Keep the public workbook error focused on workbook callers while all input
 * files share the same suffix-tolerant search behavior.
 */
export function resolveLegacyPackFile(packDir: string, pattern: RegExp): string {
  const file = resolveInputFile(packDir, pattern, undefined);
  if (!file) {
    throw new ParseError(`No input file matching ${pattern}`);
  }
  return file;
}

export function cellValue(value: unknown): unknown {
  if (value && typeof value === "object" && "result" in value) {
    return (value as { result: unknown }).result;
  }
  return value;
}

export function text(value: unknown): string {
  const unwrapped = cellValue(value);
  if (unwrapped instanceof Date) {
    return isoFromUtcDate(unwrapped);
  }
  return unwrapped === undefined || unwrapped === null ? "" : String(unwrapped).trim();
}

export function money(value: unknown): Money {
  const unwrapped = cellValue(value);
  if (unwrapped instanceof Date || unwrapped === undefined || unwrapped === null || text(unwrapped) === "") {
    throw new ParseError("Expected a money cell");
  }
  return parseMoney(typeof unwrapped === "number" ? unwrapped : text(unwrapped));
}

export function normalized(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function rowValues(row: Worksheet["getRow"] extends (...args: never[]) => infer R ? R : never): unknown[] {
  return Array.from({ length: row.cellCount }, (_, index) => cellValue(row.getCell(index + 1).value));
}

export function findRow(worksheet: Worksheet, label: string): number | undefined {
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    if (rowValues(worksheet.getRow(rowNumber)).some((value) => normalized(value) === normalized(label))) {
      return rowNumber;
    }
  }
  return undefined;
}
