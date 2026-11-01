import { ParseError } from "../../core/errors.js";
import { parseBankAmount, type Money } from "../../core/money.js";
import { parseStatementDate } from "../../core/dates.js";
import type { Page, PositionedText, VisualLine } from "./extractRows.js";

export interface RawRow {
  date: string;
  description: string;
  reference: string;
  debit: Money;
  credit: Money;
  balance: Money;
}

export interface StatementTotals {
  debits: Money;
  credits: Money;
}

export interface ParsedStatement {
  opening: Money;
  rawRows: RawRow[];
  statedTotals?: StatementTotals;
}

interface Columns {
  description: number;
  reference: number;
  debit: number;
  credit: number;
  balance: number;
}

interface NumericColumns {
  debit?: Money;
  credit?: Money;
  balance?: Money;
}

const amountPattern = /^-?[\d,]+\.\d{2}$/;
const datePattern = /^\d{2} [A-Z][a-z]{2} \d{4}$/;

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function itemNamed(line: VisualLine, name: string): PositionedText | undefined {
  return line.items.find((item) => item.s.trim().toLowerCase() === name.toLowerCase());
}

function headerColumns(line: VisualLine): Columns | undefined {
  const description = itemNamed(line, "Description");
  const reference = itemNamed(line, "Reference");
  const debit = itemNamed(line, "Debit");
  const credit = itemNamed(line, "Credit");
  const balance = itemNamed(line, "Balance");
  if (!description || !reference || !debit || !credit || !balance) return undefined;
  return { description: description.x, reference: reference.x, debit: debit.x, credit: credit.x, balance: balance.x };
}

function findColumns(page: Page): Columns | undefined {
  return page.lines
    .find((line) => itemNamed(line, "Date") && itemNamed(line, "Balance"))
    ? headerColumns(page.lines.find((line) => itemNamed(line, "Date") && itemNamed(line, "Balance")) as VisualLine)
    : undefined;
}

function numericColumns(line: VisualLine, columns: Columns): NumericColumns {
  const result: NumericColumns = {};
  const numeric = line.items.filter((item) => amountPattern.test(item.s));
  const destinations = [
    ["debit", columns.debit],
    ["credit", columns.credit],
    ["balance", columns.balance]
  ] as Array<[keyof NumericColumns, number]>;
  destinations.sort((left, right) => left[1] - right[1]);
  for (const item of numeric) {
    const destination = destinations.filter((entry) => entry[1] <= item.r + 1).at(-1);
    if (destination) result[destination[0]] = parseBankAmount(item.s);
  }
  return result;
}

function dateText(line: VisualLine, columns: Columns): string {
  return clean(line.items.filter((item) => item.x < columns.description - 2).map((item) => item.s).join(" "));
}

function textInRange(line: VisualLine, start: number, end: number): string {
  return clean(line.items
    .filter((item) => item.x >= start && item.x < end && !amountPattern.test(item.s))
    .map((item) => item.s).join(" "));
}

function appendText(current: string, addition: string): string {
  return addition ? clean(`${current} ${addition}`) : current;
}

export function parseStatement(pages: Page[]): ParsedStatement {
  let opening: Money | undefined;
  let current: RawRow | undefined;
  const rawRows: RawRow[] = [];
  let statedTotals: StatementTotals | undefined;
  let finished = false;

  const finishCurrent = (): void => {
    if (!current) return;
    const hasDebit = !current.debit.isZero();
    const hasCredit = !current.credit.isZero();
    if (hasDebit === hasCredit) throw new ParseError(`Transaction must have exactly one direction: ${current.date}`);
    rawRows.push(current);
    current = undefined;
  };

  for (const page of pages) {
    const columns = findColumns(page);
    if (!columns) throw new ParseError("Statement page has no transaction header");
    for (const line of page.lines) {
      const lineText = clean(line.items.map((item) => item.s).join(" "));
      if (/TOTAL DEBITS/i.test(lineText)) {
        const values = numericColumns(line, columns);
        if (!values.debit || !values.credit) throw new ParseError("Statement totals are incomplete");
        statedTotals = { debits: values.debit, credits: values.credit };
        finishCurrent();
        finished = true;
        break;
      }
      if (/Page \d+ of \d+/i.test(lineText)) break;
      if (itemNamed(line, "Date") && itemNamed(line, "Balance")) continue;

      const date = dateText(line, columns);
      const description = textInRange(line, columns.description - 2, columns.reference - 2);
      const reference = textInRange(line, columns.reference - 2, columns.debit - 2);
      if (datePattern.test(date)) {
        finishCurrent();
        const values = numericColumns(line, columns);
        const balance = values.balance;
        if (!balance) throw new ParseError(`Transaction has no balance: ${date}`);
        const debit = values.debit ?? parseBankAmount("0.00");
        const credit = values.credit ?? parseBankAmount("0.00");
        const next: RawRow = { date: parseStatementDate(date), description, reference, debit, credit, balance };
        if (description.toLowerCase().includes("balance brought forward")) opening = balance;
        else current = next;
      } else if (current) {
        current.description = appendText(current.description, description);
        current.reference = appendText(current.reference, reference);
      }
    }
    if (finished) break;
  }
  finishCurrent();
  if (!opening) throw new ParseError("Statement has no opening balance");
  return statedTotals ? { opening, rawRows, statedTotals } : { opening, rawRows };
}