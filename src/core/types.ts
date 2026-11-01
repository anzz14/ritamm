import type { Money } from "./money.js";

export interface Mark {
  company: string;
  currency: string;
  fairValue: Money;
  method: string;
  valuationDate: string;
}

export interface Q3Position {
  company: string;
  currency: string;
  costLocal: Money;
  fairValueLocal: Money;
  fxRate: string;
  fairValueUsd: Money;
  method: string;
}

export interface Q3Holding {
  company: string;
  costUsd: Money;
  fairValueUsd: Money;
}

export interface Liability {
  name: string;
  amount: Money;
}

export interface LpCommitment {
  code: string;
  name: string;
  commitment: Money;
}