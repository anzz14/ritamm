import type { Liability, LpCommitment } from "../../core/types.js";
import type { RawRow } from "../pdf/parseStatement.js";
import { z } from "zod";

export const CATEGORIES = [
  "capital_call", "distribution", "management_fee", "investment_purchase", "sale_proceeds",
  "dividend_income", "interest_income", "bank_charges", "expense", "expense_refund", "accrual_settlement"
] as const;

export const categorizationSchema = z.array(z.object({
  index: z.number().int().nonnegative(),
  category: z.enum(CATEGORIES),
  lp_code: z.string().nullable(),
  company: z.string().nullable(),
  reason: z.string().min(1)
}));

export type Category = typeof CATEGORIES[number];
export type Categorization = z.infer<typeof categorizationSchema>[number];
export interface PromptContext {
  lpRoster: LpCommitment[];
  q3Liabilities: Liability[];
}

const definitions = `You are a careful private-equity bank-statement categorizer. Classify every row exactly once.

Categories and rules:
- capital_call: credit from an LP.
- distribution: debit to an LP.
- sale_proceeds: credit from sale of a portfolio company; company is the target company SOLD, NEVER the buyer, payer, or acquirer. In wire text structured as "<Buyer/Payer> SPA <Target Company> COMPLETION", the company between "SPA" and "COMPLETION" is the target company sold (e.g. in "INWARD WIRE NORDIC ACQUISITIONS AS SPA FJORD PAYMENTS AS COMPLETION", the buyer is Nordic Acquisitions and the sold portfolio company is "Fjord Payments AS").
- investment_purchase: debit subscribing for shares; company is the portfolio company bought (e.g. in "IONMERE MATERIALS LTD SUBSCRIPTION SERIES B SHARES", the company is "Ionmere Materials Ltd").
- expense_refund: credit refunding a previously paid expense; words such as REFUND or OVERBILLING support this, and it is NOT income.
- accrual_settlement: payment of an invoice for a PRIOR-period service already accrued. Use it only when the description and amount match one Q3 liability supplied below.
- management_fee: fee to the fund manager or adviser per the LPA.
- bank_charges: fees charged directly by the bank, specifically including "ACCOUNT MAINTENANCE FEE", "MAINTENANCE FEE", and "WIRE CHARGES". Never classify bank maintenance fees or wire charges as expense.
- expense: operating payments to third-party providers (such as legal fees to law firms and insurance premiums). Do NOT classify bank charges as expense.
- dividend_income: credit from a portfolio-company dividend.
- interest_income: credit from interest.

lp_code is only for capital_call or distribution. Use the supplied LP roster; resolve a named LP without a code when it matches the roster, otherwise null.
company is only for investment_purchase or sale_proceeds, in normal Title Case with legal suffix when available; otherwise null.
Output ONLY JSON array. Each item must have index, category, lp_code, company, and a short reason.

Few-shot examples using distinct wording:
Input: CREDIT | "Investor remittance for subscribed commitment" | ref "EX-A"
Output: [{"index":0,"category":"capital_call","lp_code":"<matching roster code>","company":null,"reason":"LP credit for commitment"}]

Input: DEBIT | "ACCOUNT MAINTENANCE FEE NOV-22" | ref "EX-B"
Output: [{"index":0,"category":"bank_charges","lp_code":null,"company":null,"reason":"Monthly bank account maintenance charge"}]

Input: CREDIT | "MERGERS AG SPA ALPHA PAYMENTS LTD COMPLETION" | ref "EX-C"
Output: [{"index":0,"category":"sale_proceeds","lp_code":null,"company":"Alpha Payments Ltd","reason":"Target company sold under SPA"}]`;

export function buildSystemPrompt(): string {
  return definitions;
}

export function buildUserPrompt(rows: RawRow[], context: PromptContext, indexOffset = 0): string {
  const roster = context.lpRoster.map((lp) => `${lp.code} = ${lp.name}`).join("; ") || "(none)";
  const liabilities = context.q3Liabilities.map((liability) => `${liability.name} = ${liability.amount.toFixed(2)}`).join("; ") || "(none)";
  const table = rows.map((row, index) => [
    index + indexOffset, row.date, row.description, row.reference, row.debit.toFixed(2), row.credit.toFixed(2)
  ].join(" | ")).join("\n");
  return `LP roster: ${roster}\nQ3 liabilities (name and amount): ${liabilities}\nRows {index|date|description|reference|debit|credit}:\n${table}`;
}

export const BATCH_SIZE = 20;
