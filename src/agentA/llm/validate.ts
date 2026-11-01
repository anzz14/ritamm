import { toCents } from "../../core/money.js";
import type { Liability, LpCommitment } from "../../core/types.js";
import type { RawRow } from "../pdf/parseStatement.js";
import { CATEGORIES, type Categorization, type Category } from "./prompt.js";

export interface ValidationContext {
  lpRoster: LpCommitment[];
  q3Liabilities: Liability[];
}

const creditCategories = new Set<Category>([
  "capital_call", "dividend_income", "interest_income", "sale_proceeds", "expense_refund"
]);
const debitCategories = new Set<Category>([
  "distribution", "management_fee", "investment_purchase", "bank_charges", "expense", "accrual_settlement"
]);
const companyCategories = new Set<Category>(["investment_purchase", "sale_proceeds"]);
const lpCategories = new Set<Category>(["capital_call", "distribution"]);

export function validateCategorization(rows: RawRow[], llmOut: Categorization[], context: ValidationContext): string[] {
  const issues: string[] = [];
  const indexes = new Set<number>();
  const roster = new Set(context.lpRoster.map((lp) => lp.code));
  const liabilities = context.q3Liabilities.map((liability) => toCents(liability.amount));
  for (const result of llmOut) {
    if (indexes.has(result.index)) issues.push(`Duplicate categorization index ${result.index}`);
    indexes.add(result.index);
    const row = rows[result.index];
    if (!row) {
      issues.push(`Index ${result.index} does not identify an input row`);
      continue;
    }
    if (!CATEGORIES.includes(result.category)) issues.push(`Index ${result.index} has an unknown category`);
    const isCredit = row.credit.gt(0) && row.debit.isZero();
    const isDebit = row.debit.gt(0) && row.credit.isZero();
    if (creditCategories.has(result.category) && !isCredit) issues.push(`Index ${result.index}: ${result.category} must be a credit`);
    if (debitCategories.has(result.category) && !isDebit) issues.push(`Index ${result.index}: ${result.category} must be a debit`);
    if (lpCategories.has(result.category)) {
      if (!result.lp_code) issues.push(`Index ${result.index}: ${result.category} requires lp_code`);
      else if (!roster.has(result.lp_code)) issues.push(`Index ${result.index}: unknown lp_code ${result.lp_code}`);
    } else if (result.lp_code !== null) issues.push(`Index ${result.index}: lp_code is forbidden for ${result.category}`);
    if (companyCategories.has(result.category) && !result.company) issues.push(`Index ${result.index}: ${result.category} requires company`);
    if (!companyCategories.has(result.category) && result.company !== null) issues.push(`Index ${result.index}: company is forbidden for ${result.category}`);
    if (result.category === "accrual_settlement" && !liabilities.includes(toCents(row.debit))) {
      issues.push(`Index ${result.index}: accrual amount does not match a Q3 liability`);
    }
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (!indexes.has(index)) issues.push(`Missing categorization index ${index}`);
  }
  return issues;
}