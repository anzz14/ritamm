import { readFileSync } from "node:fs";

import { z } from "zod";

import { ParseError, ValidationError } from "../core/errors.js";

const fxSchema = z.object({
  "EUR/USD": z.object({
    rate: z.string().min(1),
    rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    valuation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().url(),
    note: z.string().min(1)
  })
});

export type FxRate = {
  rate: string;
  rateDate: string;
  source: string;
};

export function loadFx(path: string): FxRate {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ParseError(`Could not read FX rates: ${path}`, { cause: error });
  }

  const result = fxSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Invalid FX rates configuration", {
      issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }))
    });
  }
  const fx = result.data["EUR/USD"];
  return { rate: fx.rate, rateDate: fx.rate_date, source: fx.source };
}