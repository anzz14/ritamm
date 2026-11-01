import { Decimal } from "decimal.js";

import { normalizeName } from "../core/names.js";
import { toCents } from "../core/money.js";

export interface TradeItem {
  company: string;
  date: string;
  amount_usd?: number | string;
  proceeds_usd?: number | string;
}

export interface TradeSet {
  purchases: TradeItem[];
  sales: TradeItem[];
}

export interface TradeVerification {
  matched: number;
  expected: number;
  ok: boolean;
}

function amount(item: TradeItem): bigint {
  const value = item.amount_usd ?? item.proceeds_usd;
  return toCents(new Decimal(value ?? 0));
}

function matchItems(claimed: TradeItem[], records: TradeItem[]): number {
  const remaining = records.map((record) => ({ record, used: false }));
  let matched = 0;
  for (const item of claimed) {
    const candidate = remaining.find((entry) => !entry.used
      && normalizeName(entry.record.company) === normalizeName(item.company)
      && entry.record.date === item.date
      && amount(entry.record) === amount(item));
    if (candidate) {
      candidate.used = true;
      matched += 1;
    }
  }
  return matched;
}

export function verifyTrades(claimed: TradeSet, records: TradeSet): TradeVerification {
  const expected = records.purchases.length + records.sales.length;
  const matched = matchItems(claimed.purchases, records.purchases) + matchItems(claimed.sales, records.sales);
  const claimedCount = claimed.purchases.length + claimed.sales.length;
  return { matched, expected, ok: matched === expected && claimedCount === expected };
}