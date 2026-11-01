# Assumptions

## Assumption 1: FX Rate and Date Selection
- **What I assumed:** EUR/USD exchange rate of **1.0666**, which is the official European Central Bank (ECB) euro foreign exchange reference rate published on **30 December 2022** (the last business day published on or before Saturday, 31 December 2022).
- **Why:** 31 December 2022 fell on a Saturday. Central banks and financial institutions adopt the last published business day reference rate immediately preceding the valuation date. This matches the exact convention used by The Cayman Valuation Partners in the Q3 valuation report, where Friday, 30 September 2022 rate of 0.9748 was applied for the Q3 close. Source: https://www.ecb.europa.eu/stats/exchange/eurofxref/shared/pdf/2022/12/20221230.pdf (archived reference rate).
- **What would change if wrong:** Ember Retail GmbH is marked at EUR 13,100,000.00. Every 0.0001 change in the EUR/USD rate moves Q4 investments and NAV by exactly $1,310.00 (EUR 13,100,000 × 0.0001).

## Assumption 2: Materiality Threshold and Local Currency Measurement
- **What I assumed:** A materiality threshold of **15%** absolute change in the portfolio company's **local currency** fair value, inclusive (`>= 15%`), to trigger Review Flag R1.
- **Why:** Measuring valuation movements in local currency isolates genuine operational or multiples-based valuation changes from foreign exchange volatility. For example, Ember Retail GmbH changed by -2.96% in EUR (from EUR 13,500,000 to EUR 13,100,000), but rose +6.18% in USD solely due to EUR strengthening against USD (0.9748 → 1.0666). Flagging Ember for valuation movement would be an FX artifact, not a valuation discrepancy.
- **What would change if wrong:** 
  - At 15%: Bluetarn Software Inc (+37.50%), Cedar Health Holdings (-31.91%), and Harbor Analytics Inc (+17.83%) are flagged under R1.
  - If threshold were 20%: Harbor Analytics (+17.83%) would not be flagged.
  - If threshold were 10%: The same three companies would remain flagged.
  - If threshold were 25%: Only Bluetarn and Cedar would be flagged.

## Assumption 3: Valuation of Unmarked Holdings (Ionmere Materials Ltd)
- **What I assumed:** Ionmere Materials Ltd was subscribed on 15 December 2022 for $14,000,000.00 but has no mark in the Q4 valuation report. In accordance with PE accounting standards (IPEV Guidelines), recent investments without a completed subsequent valuation are carried at cost ($14,000,000.00) and flagged under Review Flag R3.
- **Why:** Ionmere is a verified Q4 purchase confirmed against the bank statement and Agent B data. Omitting it would understate fund assets and violate the balance sheet equation. Carrying at cost results in $0 unrealized gain/loss ($14M fair value - $14M cost).
- **What would change if wrong:** If Ionmere were omitted from Q4 NAV, Q4 investments would be $132,062,460.00 instead of $146,062,460.00, and Q4 NAV would be $155,764,039.25 instead of $169,764,039.25.

## Assumption 4: Agent A Read-Only Reference Data Access
- **What I assumed:** Agent A reads the LP roster (names and commitment amounts) and Q3 liabilities (audit and admin accruals) from the Q3 NAV summary spreadsheet (`GPF_NAV_Summary_Q3_2022.xlsx`) as static, read-only reference data. Agent A never accesses `agent_b_data.json`.
- **Why:** Real bank wire descriptions often lack formal LP codes (such as row 19: `INCOMING TT R MEHTA FAM TRST /BNF GREATNESS PE FUND/ CALL NO 7`, which corresponds to LP10 `R. Mehta Family Trust`). Similarly, determining whether payments to Harbourside Fund Services ($65,000) and Coral & Finch LLP ($120,000) are prior-period accrual settlements rather than current Q4 expenses requires reference to accrued Q3 liabilities.
- **What would change if wrong:** LP10's capital call wire could not be mapped to its LP code without hardcoding, and the two accrual settlements would be miscategorized as expenses, causing the bridge difference to fail by $185,000.00.

## Assumption 5: Expense Treatment and Prior-Period Accrual Settlements
- **What I assumed:**
  1. Northbay Specialty Insurance D&O premium of $42,000.00 (paid in Q4 for 2023 coverage) is fully expensed in Q4 2022 in accordance with the brief instructions.
  2. All bank account maintenance fees and wire charges ($850.00 total) are classified as fund operating expenses.
  3. Payments to Harbourside Fund Services ($65,000.00) and Coral & Finch LLP ($120,000.00) settle accrued Q3 liabilities and are classified as `accrual_settlement`, not expenses.
  4. Q4 accruals from the NAV summary totaling $195,000.00 are included in Q4 expenses and recorded as Q4 liabilities.
  5. The legal fee refund of $3,500.00 from Haldane & Ross LLP is categorized as `expense_refund` (reducing net expenses), not as income.
- **Why:** Cash paid to settle liabilities that were already expensed in Q3 reduces cash and liabilities, but does not hit the Q4 income/expense statement. Counting them as Q4 expenses would double-count the expense.
- **What would change if wrong:** If the accrual settlements were expensed, total expenses would be $1,707,850.00 instead of $1,522,850.00, and the NAV bridge difference would fail by $185,000.00.

## Assumption 6: Excluded Opening Balance and Realized Investments
- **What I assumed:**
  1. The "BALANCE BROUGHT FORWARD" line on the bank statement ($12,450,000.00) is opening balance, not a transaction; exactly 39 transactions occurred in Q4.
  2. Fjord Payments AS (sold on 18 November 2022 for $29,000,000.00 vs cost of $20,000,000.00) is recognized as a realized gain of $9,000,000.00, has an entry in `review.json` noting it was sold and excluded from NAV, and has 0 review flags.
- **Why:** Realized investments do not form part of closing NAV because the fund no longer holds shares at quarter-end; the proceeds are reflected in cash.
- **What would change if wrong:** If Fjord were retained in investments, NAV would be double-counted by the value of the shares and the cash proceeds received.
