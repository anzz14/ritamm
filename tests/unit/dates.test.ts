import { describe, expect, it } from "vitest";

import { isIsoDate, isoFromUtcDate, parseStatementDate } from "../../src/core/dates.js";

describe("dates", () => {
  it.each([
    ["Jan", "01"], ["Feb", "02"], ["Mar", "03"], ["Apr", "04"],
    ["May", "05"], ["Jun", "06"], ["Jul", "07"], ["Aug", "08"],
    ["Sep", "09"], ["Oct", "10"], ["Nov", "11"], ["Dec", "12"]
  ])("parses %s", (month, monthNumber) => {
    expect(parseStatementDate(`03 ${month} 2022`)).toBe(`2022-${monthNumber}-03`);
  });

  it("rejects invalid months and days", () => {
    expect(() => parseStatementDate("03 Foo 2022")).toThrow();
    expect(() => parseStatementDate("31 Apr 2022")).toThrow();
  });

  it("uses UTC getters without shifting the calendar day", () => {
    expect(isoFromUtcDate(new Date("2022-10-03T00:00:00-07:00"))).toBe("2022-10-03");
  });

  it("recognizes valid ISO dates", () => {
    expect(isIsoDate("2022-02-28")).toBe(true);
    expect(isIsoDate("2022-02-30")).toBe(false);
    expect(isIsoDate("03 Oct 2022")).toBe(false);
  });
});