import { readFileSync } from "node:fs";

import { z } from "zod";

import { ParseError, ValidationError } from "../core/errors.js";
import { isIsoDate } from "../core/dates.js";
import { parseMoney, type Money } from "../core/money.js";
import type { Mark } from "../core/types.js";

const amountSchema = z.union([z.string().min(1), z.number().finite()]).transform((value): Money => parseMoney(value));
const dateSchema = z.string().refine(isIsoDate, "Expected an ISO date");

const markSchema = z.object({
  company: z.string().min(1),
  currency: z.string().min(1),
  fair_value: amountSchema,
  valuation_method: z.string().min(1),
  valuation_date: dateSchema
}).transform((mark): Mark => ({
  company: mark.company,
  currency: mark.currency,
  fairValue: mark.fair_value,
  method: mark.valuation_method,
  valuationDate: mark.valuation_date
}));

const purchaseSchema = z.object({
  company: z.string().min(1),
  date: dateSchema,
  amount_usd: amountSchema
}).transform((purchase) => ({
  company: purchase.company,
  date: purchase.date,
  amount: purchase.amount_usd
}));

const saleSchema = z.object({
  company: z.string().min(1),
  date: dateSchema,
  proceeds_usd: amountSchema
}).transform((sale) => ({
  company: sale.company,
  date: sale.date,
  proceeds: sale.proceeds_usd
}));

const noteSchema = z.union([
  z.string().transform((note) => ({ note })),
  z.object({ company: z.string().min(1), note: z.string().min(1) })
]);

const agentBDataSchema = z.object({
  fund_name: z.string().min(1).optional(),
  fund_code: z.string().min(1).optional(),
  fund: z.object({ name: z.string().min(1), code: z.string().min(1) }).optional(),
  valuation_date: dateSchema,
  marks: z.array(markSchema),
  notes: z.array(noteSchema),
  purchases: z.array(purchaseSchema),
  sales: z.array(saleSchema)
}).superRefine((data, context) => {
  if ((!data.fund_name || !data.fund_code) && !data.fund) {
    context.addIssue({ code: "custom", path: ["fund"], message: "fund or flat fund_name/fund_code is required" });
  }
});

export type AgentBData = {
  fundName: string;
  fundCode: string;
  valuationDate: string;
  marks: z.infer<typeof markSchema>[];
  notes: z.infer<typeof noteSchema>[];
  purchases: z.infer<typeof purchaseSchema>[];
  sales: z.infer<typeof saleSchema>[];
};

export function loadAgentBData(filePath: string): AgentBData {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new ParseError(`Could not read Agent B data: ${filePath}`, { cause: error });
  }
  const parsed = agentBDataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Invalid Agent B data", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    });
  }
  const fundName = parsed.data.fund?.name ?? parsed.data.fund_name;
  const fundCode = parsed.data.fund?.code ?? parsed.data.fund_code;
  if (!fundName || !fundCode) throw new ValidationError("Invalid Agent B fund identity");
  return {
    fundName,
    fundCode,
    valuationDate: parsed.data.valuation_date,
    marks: parsed.data.marks,
    notes: parsed.data.notes,
    purchases: parsed.data.purchases,
    sales: parsed.data.sales
  };
}