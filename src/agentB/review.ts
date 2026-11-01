import { Decimal } from "decimal.js";

import { pctChange, parseMoney, toNumber2, type Money } from "../core/money.js";
import { normalizeName } from "../core/names.js";
import type { Mark, Q3Position } from "../core/types.js";
import type { Purchase, Sale } from "../agentA/trades.js";

export interface ReviewInput {
  q3: Q3Position[];
  q4Marks: Mark[];
  heldAtQ4: Set<string>;
  purchases: Purchase[];
  sales: Sale[];
  fxRate: string;
  thresholdPct: Decimal;
}

export interface ReviewEntry {
  company: string;
  currency: string;
  q3_fair_value: number | null;
  q4_fair_value: number | null;
  change_pct: number | null;
  change_pct_usd: number | null;
  q3_method: string | null;
  q4_method: string | null;
  flags: string[];
  reason: string;
}

export interface ReviewResult {
  threshold_pct: number;
  eurusd_rate: number;
  entries: ReviewEntry[];
}

function methodChanged(left: string, right: string): boolean {
  return left.trim().toLowerCase() !== right.trim().toLowerCase();
}

function usdValue(value: Money, currency: string, fxRate: Money): Money {
  return currency.trim().toUpperCase() === "EUR" ? value.times(fxRate) : value;
}

function reasonFor(flags: string[], reasons: string[], soldDate?: string): string {
  if (soldDate && flags.length === 0) return `Sold ${soldDate}; realized, excluded from NAV`;
  return reasons.join(" ");
}

export function reviewMarks(input: ReviewInput): ReviewResult {
  const q3ByName = new Map(input.q3.map((position) => [normalizeName(position.company), position]));
  const q4ByName = new Map(input.q4Marks.map((mark) => [normalizeName(mark.company), mark]));
  const purchasesByName = new Map(input.purchases.map((purchase) => [normalizeName(purchase.company), purchase]));
  const salesByName = new Map(input.sales.map((sale) => [normalizeName(sale.company), sale]));
  const heldNames = new Set([...input.heldAtQ4].map(normalizeName));
  const names = new Set([...q3ByName.keys(), ...q4ByName.keys(), ...purchasesByName.keys()]);
  const fxRate = parseMoney(input.fxRate);
  const entries: ReviewEntry[] = [];

  for (const name of names) {
    const q3 = q3ByName.get(name);
    const q4 = q4ByName.get(name);
    const purchase = purchasesByName.get(name);
    const sale = salesByName.get(name);
    const held = heldNames.has(name) || Boolean(q3 && !sale) || Boolean(purchase);
    const company = q4?.company ?? q3?.company ?? purchase?.company ?? sale?.company ?? name;
    const currency = q4?.currency ?? q3?.currency ?? "USD";
    const flags: string[] = [];
    const reasons: string[] = [];
    let changePct: Decimal | null = null;
    let changePctUsd: Decimal | null = null;

    if (q3 && q4) {
      changePct = pctChange(q3.fairValueLocal, q4.fairValue);
      changePctUsd = pctChange(q3.fairValueUsd, usdValue(q4.fairValue, q4.currency, fxRate));
      if (changePct.abs().gte(input.thresholdPct)) {
        flags.push("R1");
        const direction = changePct.gte(0) ? "up" : "down";
        reasons.push(`Mark ${direction} ${changePct.abs().toFixed(2)}% in ${q4.currency} vs ${input.thresholdPct.toFixed(0)}% threshold (R1)`);
      }
      if (methodChanged(q3.method, q4.method)) {
        flags.push("R2");
        reasons.push(`Valuation method changed from ${q3.method} to ${q4.method} (R2)`);
      }
    }
    if (held && !q4) {
      flags.push("R3");
      reasons.push(`Held at Q4 without a mark; carried at cost (R3)`);
    }
    if (q4 && !held) {
      flags.push("R4");
      reasons.push(`Mark exists but company is not held at Q4; excluded from NAV (R4)`);
    }
    entries.push({
      company,
      currency,
      q3_fair_value: q3 ? toNumber2(q3.fairValueLocal) : null,
      q4_fair_value: q4 ? toNumber2(q4.fairValue) : null,
      change_pct: changePct ? toNumber2(changePct) : null,
      change_pct_usd: changePctUsd ? toNumber2(changePctUsd) : null,
      q3_method: q3?.method ?? null,
      q4_method: q4?.method ?? null,
      flags,
      reason: reasonFor(flags, reasons, sale && !q4 ? sale.date : undefined)
    });
  }
  return { threshold_pct: toNumber2(input.thresholdPct), eurusd_rate: Number(input.fxRate), entries };
}