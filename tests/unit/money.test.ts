import { describe, expect, it } from "vitest";

import {
  eq,
  fromCents,
  mulRate,
  parseBankAmount,
  parseMoney,
  pctChange,
  sum,
  toCents,
  toNumber2
} from "../../src/core/money.js";

describe("money", () => {
  it("multiplies an amount by an exact decimal rate", () => {
    expect(mulRate(parseMoney("13,100,000"), "1.0666").toFixed(2)).toBe("13972460.00");
  });

  it("sums decimal values without binary floating point error", () => {
    expect(sum([parseMoney("0.1"), parseMoney("0.2")]).toFixed(2)).toBe("0.30");
  });

  it("parses valid bank amounts and rejects malformed precision", () => {
    expect(parseBankAmount("1,234.50").toFixed(2)).toBe("1234.50");
    expect(() => parseBankAmount("1,2.5")).toThrow();
  });

  it("converts between decimal money and cents", () => {
    expect(toCents(parseMoney("39429.25"))).toBe(3942925n);
    expect(fromCents(3942925n).toFixed(2)).toBe("39429.25");
  });

  it("computes percentage change", () => {
    expect(pctChange(parseMoney("24.6"), parseMoney("25.7")).toFixed(2)).toBe("4.47");
  });

  it("rounds JSON output to two decimal places", () => {
    expect(toNumber2(sum([
      parseMoney("8150.27"),
      parseMoney("21402.88"),
      parseMoney("9876.10")
    ]))).toBe(39429.25);
  });

  it("compares values at cents precision", () => {
    expect(eq(parseMoney("1.234"), parseMoney("1.235"))).toBe(false);
    expect(eq(parseMoney("1.234"), parseMoney("1.2344"))).toBe(true);
  });
});