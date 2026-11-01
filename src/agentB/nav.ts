import { ReconciliationError } from "../core/errors.js";
import { normalizeName } from "../core/names.js";
import { eq, parseMoney, sum, toNumber2, type Money } from "../core/money.js";
import type { Liability, Q3Holding } from "../core/types.js";
import type { Purchase, Sale } from "../agentA/trades.js";
import type { Transaction } from "../agentA/toTransactions.js";
import type { ReviewResult } from "./review.js";

export interface NavInput {
  closingCash: Money;
  navQ3: Money;
  q3Holdings: Q3Holding[];
  q4Marks: ReviewResult["entries"];
  fx: string | { rate: string };
  review: ReviewResult;
  purchases: Purchase[];
  sales: Sale[];
  q4Accruals: Liability[];
  transactions: Transaction[];
}

export interface ExpenseBreakdown {
  management_fee: number;
  expense: number;
  bank_charges: number;
  expense_refund: number;
  q4_accruals: number;
  total: number;
}

export interface NavResult {
  closing_cash: number;
  investments_usd: number;
  liabilities: number;
  nav_q4: number;
  management_fee: number;
  expense_breakdown: ExpenseBreakdown;
  bridge: {
    nav_q3: number;
    capital_called: number;
    distributions: number;
    income: number;
    expenses: number;
    realized_gain: number;
    change_in_unrealized: number;
    nav_q4: number;
    difference: number;
  };
}

function fxRate(fx: NavInput["fx"]): Money {
  return parseMoney(typeof fx === "string" ? fx : fx.rate);
}

function transactionTotal(transactions: Transaction[], category: Transaction["category"], side: "debit" | "credit"): Money {
  return sum(transactions.filter((transaction) => transaction.category === category).map((transaction) => parseMoney(transaction[side])));
}

function moneyNumber(value: number): Money {
  return parseMoney(value);
}

export function computeNav(input: NavInput): NavResult {
  const rate = fxRate(input.fx);
  const q3ByName = new Map(input.q3Holdings.map((holding) => [normalizeName(holding.company), holding]));
  const purchaseByName = new Map(input.purchases.map((purchase) => [normalizeName(purchase.company), purchase]));
  const soldByName = new Map(input.sales.map((sale) => [normalizeName(sale.company), sale]));
  const reviewByName = new Map(input.review.entries.map((entry) => [normalizeName(entry.company), entry]));
  for (const sale of input.sales) {
    if (!q3ByName.has(normalizeName(sale.company))) throw new ReconciliationError(`Sold company ${sale.company} is not in Q3 holdings`);
  }
  const heldNames = new Set([...q3ByName.keys()].filter((name) => !soldByName.has(name)));
  for (const purchase of input.purchases) heldNames.add(normalizeName(purchase.company));
  const investments: Money[] = [];
  let q4Unrealized = parseMoney("0");
  for (const name of heldNames) {
    const q3 = q3ByName.get(name);
    const purchase = purchaseByName.get(name);
    const review = reviewByName.get(name);
    if (review?.flags.includes("R4")) continue;
    const cost = q3?.costUsd ?? (purchase ? moneyNumber(purchase.amount_usd) : undefined);
    if (!cost) throw new ReconciliationError(`Held company ${review?.company ?? name} has no cost basis`);
    let fairValue: Money;
    if (review?.q4_fair_value !== null && review?.q4_fair_value !== undefined) {
      const local = moneyNumber(review.q4_fair_value);
      fairValue = review.currency.toUpperCase() === "EUR" ? local.times(rate) : local;
    } else {
      fairValue = cost;
    }
    investments.push(fairValue);
    q4Unrealized = q4Unrealized.plus(fairValue.minus(cost));
  }
  const investmentsUsd = sum(investments);
  const liabilities = sum(input.q4Accruals.map((liability) => liability.amount));
  const navQ4 = input.closingCash.plus(investmentsUsd).minus(liabilities);
  const q3Unrealized = sum(input.q3Holdings.map((holding) => holding.fairValueUsd.minus(holding.costUsd)));
  const capitalCalled = transactionTotal(input.transactions, "capital_call", "credit");
  const distributions = transactionTotal(input.transactions, "distribution", "debit");
  const income = transactionTotal(input.transactions, "dividend_income", "credit").plus(transactionTotal(input.transactions, "interest_income", "credit"));
  const managementFee = transactionTotal(input.transactions, "management_fee", "debit");
  const expense = transactionTotal(input.transactions, "expense", "debit");
  const bankCharges = transactionTotal(input.transactions, "bank_charges", "debit");
  const expenseRefund = transactionTotal(input.transactions, "expense_refund", "credit");
  const expenseAccruals = liabilities;
  const expenses = managementFee.plus(expense).plus(bankCharges).minus(expenseRefund).plus(expenseAccruals);
  const realizedGain = sum(input.sales.map((sale) => moneyNumber(sale.proceeds_usd).minus(q3ByName.get(normalizeName(sale.company))!.costUsd)));
  const changeInUnrealized = q4Unrealized.minus(q3Unrealized);
  const bridgeNav = input.navQ3.plus(capitalCalled).minus(distributions).plus(income).minus(expenses).plus(realizedGain).plus(changeInUnrealized);
  const difference = navQ4.minus(bridgeNav);
  if (!eq(difference, parseMoney("0"))) {
    throw new ReconciliationError(`NAV bridge does not balance; difference ${difference.toFixed(2)}. Check categories, especially accrual_settlement expense treatment.`, { difference: difference.toFixed(2) });
  }
  const breakdown: ExpenseBreakdown = {
    management_fee: toNumber2(managementFee), expense: toNumber2(expense), bank_charges: toNumber2(bankCharges), expense_refund: toNumber2(expenseRefund), q4_accruals: toNumber2(expenseAccruals), total: toNumber2(expenses)
  };
  return {
    closing_cash: toNumber2(input.closingCash), investments_usd: toNumber2(investmentsUsd), liabilities: toNumber2(liabilities), nav_q4: toNumber2(navQ4), management_fee: toNumber2(managementFee), expense_breakdown: breakdown,
    bridge: { nav_q3: toNumber2(input.navQ3), capital_called: toNumber2(capitalCalled), distributions: toNumber2(distributions), income: toNumber2(income), expenses: toNumber2(expenses), realized_gain: toNumber2(realizedGain), change_in_unrealized: toNumber2(changeInUnrealized), nav_q4: toNumber2(bridgeNav), difference: toNumber2(difference) }
  };
}