import { describe, expect, it } from "vitest";

import { parseMoney } from "../../src/core/money.js";
import type { RawRow } from "../../src/agentA/pdf/parseStatement.js";
import { buildSystemPrompt, buildUserPrompt, categorizationSchema } from "../../src/agentA/llm/prompt.js";
import { validateCategorization } from "../../src/agentA/llm/validate.js";

const row: RawRow = {
  date: "2022-01-01", description: "ADMIN INVOICE", reference: "A", debit: parseMoney("65.00"), credit: parseMoney("0.00"), balance: parseMoney("0.00")
};
const context = { lpRoster: [{ code: "LP01", name: "Limited Partner", commitment: parseMoney("100.00") }], q3Liabilities: [{ name: "Admin", amount: parseMoney("65.00") }] };

describe("categorization prompt and validation", () => {
  it("includes category rules, examples, roster, liabilities, and compact rows", () => {
    expect(buildSystemPrompt()).toContain("sale_proceeds");
    expect(buildSystemPrompt()).toContain("Output ONLY JSON array");
    expect(buildUserPrompt([row], context)).toContain("LP01 = Limited Partner");
    expect(buildUserPrompt([row], context)).toContain("0 | 2022-01-01 | ADMIN INVOICE");
    expect(categorizationSchema.parse([{ index: 0, category: "accrual_settlement", lp_code: null, company: null, reason: "matched" }])).toHaveLength(1);
  });

  it("reports missing, duplicate, direction, LP, company, and accrual violations", () => {
    const bad = [
      { index: 0, category: "capital_call" as const, lp_code: "BAD", company: "Wrong", reason: "bad" },
      { index: 0, category: "accrual_settlement" as const, lp_code: null, company: null, reason: "duplicate" }
    ];
    const issues = validateCategorization([row, { ...row, date: "2022-01-02" }], bad, context);
    expect(issues.join(" | ")).toMatch(/Duplicate|must be a credit|unknown lp_code|company is forbidden|Missing categorization index 1/);
  });

  it("accepts a valid accrual settlement", () => {
    expect(validateCategorization([row], [{ index: 0, category: "accrual_settlement", lp_code: null, company: null, reason: "matched liability" }], context)).toEqual([]);
  });
});