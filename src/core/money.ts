import { Decimal } from "decimal.js";

import { ParseError } from "./errors.js";

const MoneyDecimal = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;

export function parseMoney(input: string | number): Money {
  const value = typeof input === "string" ? input.replace(/[\s,]/g, "") : input;
  if (typeof value === "string" && value.trim() === "") {
    throw new ParseError("Money value cannot be empty");
  }

  try {
    const result = new MoneyDecimal(value);
    if (!result.isFinite()) {
      throw new ParseError("Money value must be finite");
    }
    return result;
  } catch (error) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(`Invalid money value: ${String(input)}`);
  }
}

export function parseBankAmount(value: string): Money {
  if (!/^-?[\d,]+\.\d{2}$/.test(value)) {
    throw new ParseError(`Invalid bank amount: ${value}`);
  }
  return parseMoney(value);
}

export function toCents(value: Money): bigint {
  return BigInt(round2(value).times(100).toFixed(0));
}

export function fromCents(value: bigint): Money {
  return new MoneyDecimal(value.toString()).dividedBy(100);
}

export function round2(value: Money): Money {
  return new MoneyDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function toNumber2(value: Money): number {
  return round2(value).toNumber();
}

export function sum(values: Money[]): Money {
  return values.reduce((total, value) => total.plus(value), new MoneyDecimal(0));
}

export function eq(left: Money, right: Money): boolean {
  return round2(left).equals(round2(right));
}

export function mulRate(amount: Money, rate: string): Money {
  return round2(amount.times(new MoneyDecimal(rate)));
}

export function pctChange(from: Money, to: Money): Decimal {
  if (from.isZero()) {
    throw new ParseError("Percentage change cannot use a zero baseline");
  }
  return to.minus(from).dividedBy(from).times(100);
}