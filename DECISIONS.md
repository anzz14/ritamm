# Decisions

## Decision 1: Hand-rolled A2A 0.3 on Express + Zod
**Decision:** Hand-rolled the Agent-to-Agent (A2A) protocol v0.3.0 using Express 5 and Zod 4 schemas in `src/a2a/`, rather than using `@a2a-js/sdk` v1.x.
**Alternatives:** 
1. Installing `@a2a-js/sdk` (version 1.x npm package).
2. Using custom REST/gRPC endpoints without standard A2A envelopes.
**Why:** The challenge brief explicitly specifies the A2A v0.3 protocol format (featuring `kind: "message"` / `kind: "task"`, `parts: [{kind: "text" | "data"}]`, and JSON-RPC 2.0 `message/send`). The official npm package `@a2a-js/sdk` is now at version 1.x and does not match the brief's required contract closely enough. A hand-rolled implementation avoids an A2A SDK dependency, guarantees fidelity to the specified envelopes, provides full control over error codes (`-32600`, `-32601`, `-32602`, `-32700`, `-32001`), and remains easy to test offline.

## Decision 2: Deterministic PDF Parsing with LLM Categorization & Deterministic Rules Fallback
**Decision:** Bank statement text extraction, visual layout grouping, and running balance checks are handled 100% deterministically in TypeScript (`pdfjs-dist` + regex column geometry). The LLM is invoked strictly for semantic categorization of the extracted rows, protected by rigorous code validation and a full deterministic fallback engine (`src/agentA/llm/fallback.ts`).
**Alternatives:** 
1. Passing raw PDF text or image pages directly to a multi-modal LLM to extract and compute numbers end-to-end.
2. Relying entirely on rules without any LLM.
3. Throwing an unrecoverable runtime error immediately whenever LLM rate limits or network issues occur.
**Why:** LLMs are non-deterministic and can hallucinate numbers, miscalculate decimals, or fail to parse tabular layout accurately when descriptions wrap across multiple lines. Deterministic extraction guarantees 0 balance breaks and exact penny reconciliation. Using the LLM for semantic categorization provides flexibility for ambiguous descriptions (e.g. matching informal wire remarks to LP names), while the rules fallback ensures the pipeline runs reliably offline or under API outages without compromising data integrity.

## Decision 3: Exact Decimal Arithmetic (`decimal.js`) and Hard Balance Reconciliation
**Decision:** All monetary values, calculations, and reconciliations are performed using `decimal.js` with 2 decimal places half-up rounding (`round2`), BigInt cents comparisons (`toCents`), and strict assert checks (`assertBankChecks`, `bridge.difference === 0`). Output JSON numbers are exported via `.toDecimalPlaces(2).toNumber()`.
**Alternatives:** 
1. Standard JavaScript floating-point numbers (`IEEE 754`).
2. Storing only integer cents throughout the pipeline.
**Why:** Floating-point math introduces binary rounding errors (e.g. `0.1 + 0.2 !== 0.3`), which can accumulate into cent discrepancies on multi-million dollar funds. PE audit guidelines mandate zero delta on the NAV bridge (`difference === 0.00`). If the bridge does not balance to the penny, the pipeline throws a `ReconciliationError` and refuses to emit inconsistent reports, enforcing accounting correctness.

## Decision 4: In-Process Agent Coordination and NAV Reporting
**Decision:** Agent B computes NAV and valuation review in-process via `agentB.computeReports({transactions, bankReport})` after the A2A task verification completes, orchestrated by `src/pipeline.ts`.
**Alternatives:** 
1. Extending the A2A message payload to transfer all 39 bank transactions and Excel sheets across the JSON-RPC wire.
2. Running Agent B as a completely disconnected CLI script requiring manual file passing.
**Why:** The challenge brief's A2A message schema defines the collaboration boundary as exchanging trade requests and verified trade sets (`purchases` and `sales`), releasing marks upon verification. Passing the entire bank statement and general ledger over the A2A wire would violate the specified message protocol. Computing the reports in Agent B using Agent A's validated outputs preserves protocol compliance while ensuring all deliverables are produced in a single automated run.
