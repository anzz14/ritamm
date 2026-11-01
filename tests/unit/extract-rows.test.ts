import { describe, expect, it } from "vitest";

import { extractLines } from "../../src/agentA/pdf/extractRows.js";

function item(str: string, x: number, y: number, width = str.length): object {
  return { str, transform: [1, 0, 0, 1, x, y], width };
}

describe("PDF row extraction", () => {
  it("filters empty items and groups positioned text into ordered visual lines", async () => {
    const loader = (() => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (pageNumber: number) => ({
          getTextContent: async () => ({
            items: pageNumber === 1
              ? [item("Balance", 50, 100), item("Date", 10, 100.5), item("", 0, 100), item("Debit", 90, 95)]
              : [item("Credit", 80, 120)]
          })
        })
      })
    })) as unknown as Parameters<typeof extractLines>[1];

    const pages = await extractLines(Buffer.from("fake-pdf"), loader);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.lines[0]?.items.map((entry) => entry.s)).toEqual(["Date", "Balance"]);
    expect(pages[0]?.lines[1]?.items[0]?.s).toBe("Debit");
    expect(pages[1]?.lines[0]?.items[0]?.s).toBe("Credit");
  });
});