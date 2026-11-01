import { toCents } from "../../core/money.js";
import type { RawRow } from "../pdf/parseStatement.js";
import { type Categorization, type Category, type PromptContext } from "./prompt.js";

const words = (value: string): string[] => value.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const normalized = (value: string): string => words(value).join(" ");
const companyCase = (value: string): string => value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).replace(/\bAs\b/g, "AS");

/** Common abbreviations used in bank wire descriptions mapped to their full form. */
const ABBREVS: Record<string, string> = {
  FAM: "FAMILY", TRST: "TRUST", FDN: "FOUNDATION", RET: "RETIREMENT",
  PB: "PENSION", BRD: "BOARD", UNIV: "UNIVERSITY", ENDOW: "ENDOWMENT",
  SOV: "SOVEREIGN", RSV: "RESERVE", FOF: "FUND",
};

function expandAbbrevs(tokens: string[]): string[] {
  return tokens.map((t) => ABBREVS[t] ?? t);
}

function resolveLp(description: string, context: PromptContext): string | null {
  // 1. Explicit LP code in description (e.g. "GPF CC07 LP02")
  const code = description.match(/\bLP\d{2}\b/i)?.[0].toUpperCase();
  if (code && context.lpRoster.some((lp) => lp.code === code)) return code;
  // 2. Fuzzy name match with abbreviation expansion (handles "R MEHTA FAM TRST" → LP10).
  //    Score = fraction of LP name tokens found in description (not penalised by description length).
  const source = expandAbbrevs(words(description));
  let best: { code: string; score: number } | undefined;
  for (const lp of context.lpRoster) {
    const target = words(lp.name);
    const matches = source.filter((token) => target.some((candidate) => candidate.startsWith(token) || token.startsWith(candidate)));
    const score = matches.length / Math.max(target.length, 1);
    if (score >= 0.75 && (!best || score > best.score)) best = { code: lp.code, score };
  }
  return best?.code ?? null;
}

function companyFrom(description: string, category: "investment_purchase" | "sale_proceeds"): string | null {
  let value = description.replace(/\b(?:OUTWARD|INWARD) WIRE\b/gi, "").trim();
  if (category === "investment_purchase") {
    // Pattern A: company BEFORE keyword — "IONMERE MATERIALS LTD SUBSCRIPTION SERIES B SHARES"
    const beforeKeyword = value.match(/^(.+?)\s+SUBSCRIPTION\b(?!\s+(?:SHARES?\s+IN|SERIES|SHARES?))/i)
      ?? value.match(/^(.+?)\s+SUBSCRIPTION\b/i);
    // Pattern B: company AFTER "SHARES IN" / "INVESTMENT IN" — "SUBSCRIPTION SHARES IN Ionmere Materials Ltd"
    const afterKeyword = value.match(/(?:SHARES?\s+IN|INVESTMENT\s+IN)\s+(.+?)(?:\s+(?:SPA|COMPLETION)\b.*)?$/i);
    if (afterKeyword?.[1] && !/^SUBSCRIPTION/i.test(afterKeyword[1])) return companyCase(afterKeyword[1].trim());
    if (beforeKeyword?.[1]) return companyCase(beforeKeyword[1].trim());
    return null;
  }
  const soldAfterSpa = value.match(/SPA\s+(.+?)\s+COMPLETION\b/i);
  if (soldAfterSpa?.[1]) return companyCase(soldAfterSpa[1].trim());
  const soldAfterCompletion = value.match(/COMPLETION\s+OF\s+SALE\s+OF\s+(.+?)(?:\s+(?:PROCEEDS|SPA)\b.*)?$/i);
  if (soldAfterCompletion?.[1]) return companyCase(soldAfterCompletion[1].trim()) || null;
  const completion = value.match(/(.+?)\s+COMPLETION\b/i);
  if (completion?.[1]) return companyCase(completion[1].replace(/\b(?:PROCEEDS|SALE|SPA)\b/gi, "").trim()) || null;
  const disposal = value.match(/(?:SALE|DISPOSAL|PROCEEDS)\s+(?:OF\s+)?(.+?)(?:\s+(?:SPA|COMPLETION)\b.*)?$/i);
  return disposal?.[1] ? companyCase(disposal[1].trim()) : null;
}

/** Abbreviations that appear in descriptions but not in liability names. */
const LIABILITY_ABBREVS: Record<string, string[]> = {
  SVCS: ["SERVICES", "SERVICE"],
  ADMIN: ["ADMINISTRATION", "ADMINISTRATIVE"],
  FEE: ["FEE"],
};

function expandForLiability(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const expanded = LIABILITY_ABBREVS[t];
    if (expanded) out.push(...expanded);
    else out.push(t);
  }
  return out;
}

function matchesLiability(row: RawRow, context: PromptContext): boolean {
  // Amount must match a Q3 liability; name match uses word coverage with abbreviation expansion.
  const descTokens = expandForLiability(words(row.description));
  const description = descTokens.join(" ");
  return context.q3Liabilities.some((liability) => {
    const liabilityWords = words(liability.name);
    const matched = liabilityWords.filter((word) => description.split(" ").some((part) => part.startsWith(word) || word.startsWith(part))).length;
    return matched / Math.max(liabilityWords.length, 1) >= 0.4 && toCents(row.debit) === toCents(liability.amount);
  });
}

export function rulesCategorize(row: RawRow, context: PromptContext, index = 0): Categorization {
  const description = row.description.toUpperCase();
  const credit = row.credit.gt(0);
  let category: Category;
  let company: string | null = null;
  if (credit && /REFUND|OVERBILLING/.test(description)) category = "expense_refund";
  else if (!credit && matchesLiability(row, context)) category = "accrual_settlement";
  // Capital calls: explicit keywords OR inbound wire from an LP (ORG: prefix = originating party)
  else if (credit && /CALL|COMMITMENT|CAPITAL|CC\d+/.test(description)) category = "capital_call";
  else if (credit && /\bORG\b/.test(description) && resolveLp(description, context) !== null) category = "capital_call";
  else if (!credit && /DISTRIBUTION|DISTRIBUTE/.test(description)) category = "distribution";
  else if (credit && /SALE|SOLD|DISPOSAL|PROCEEDS|COMPLETION|SPA/.test(description)) {
    category = "sale_proceeds";
    company = companyFrom(row.description, category);
  } else if (!credit && /SUBSCRIPTION|SHARES? IN|INVESTMENT IN/.test(description)) {
    category = "investment_purchase";
    company = companyFrom(row.description, category);
  } else if (credit && /DIVIDEND/.test(description)) category = "dividend_income";
  else if (credit && /INTEREST/.test(description)) category = "interest_income";
  else if (!credit && /MANAGEMENT|ADVISER|ADVISOR|LPA/.test(description)) category = "management_fee";
  else if (!credit && /BANK|WIRE CHARGE|MAINTENANCE/.test(description)) category = "bank_charges";
  else category = "expense";
  return {
    index,
    category,
    lp_code: category === "capital_call" || category === "distribution" ? resolveLp(row.description, context) : null,
    company,
    reason: "Deterministic rules fallback"
  };
}
