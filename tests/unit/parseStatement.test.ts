import { describe, expect, it } from "vitest";

import { parseStatement } from "../../src/agentA/pdf/parseStatement.js";
import type { Page, PositionedText } from "../../src/agentA/pdf/extractRows.js";

const x = { date: 10, description: 80, reference: 220, debit: 350, credit: 430, balance: 510 };

function token(s: string, left: number, y: number, width = s.length * 5): PositionedText {
  return { s, x: left, y, r: left + width };
}

function page(lines: PositionedText[][]): Page {
  return { lines: lines.map((items) => ({ y: items[0]?.y ?? 0, items })) };
}

const header = [token("Date", x.date, 100), token("Description", x.description, 100), token("Reference", x.reference, 100), token("Debit", x.debit, 100), token("Credit", x.credit, 100), token("Balance", x.balance, 100)];

describe("statement parser", () => {
  it("re-derives columns per page and assigns right-aligned amounts", () => {
    const lines = [
      header,
      [token("03 Oct 2022", 10, 90), token("BALANCE BROUGHT FORWARD", 80, 90), token("12,450,000.00", 510, 90, 70)],
      [token("04 Oct 2022", 10, 80), token("PAYMENT", 80, 80), token("REF-1", 220, 80), token("1,250,000.00", 350, 80, 70), token("11,200,000.00", 510, 80, 70)],
      [token("WRAPPED DESCRIPTION", 80, 70), token("CONT-1", 220, 70)],
      [token("TOTAL DEBITS", 80, 60), token("1,250,000.00", 350, 60, 70), token("0.00", 430, 60, 30)]
    ];
    const parsed = parseStatement([page(lines), page([header, [token("Page 2 of 2", 80, 50)]])]);
    expect(parsed.opening.toFixed(2)).toBe("12450000.00");
    expect(parsed.rawRows).toHaveLength(1);
    expect(parsed.rawRows[0]?.debit.toFixed(2)).toBe("1250000.00");
    expect(parsed.rawRows[0]?.credit.toFixed(2)).toBe("0.00");
    expect(parsed.rawRows[0]?.description).toContain("WRAPPED DESCRIPTION");
    expect(parsed.statedTotals?.debits.toFixed(2)).toBe("1250000.00");
  });

  it("rejects a row with both debit and credit", () => {
    const lines = [header, [token("03 Oct 2022", 10, 90), token("BALANCE BROUGHT FORWARD", 80, 90), token("1.00", 510, 90, 20)], [token("04 Oct 2022", 10, 80), token("BAD", 80, 80), token("1.00", 350, 80, 20), token("2.00", 430, 80, 20), token("2.00", 510, 80, 20)]];
    expect(() => parseStatement([page(lines)])).toThrow(/exactly one direction/);
  });
});