# Greatness PE Fund (GPF) Quarter-Close System

Automated quarter-end NAV closing and valuation review for Greatness PE Fund (Q4 2022) powered by two autonomous agents communicating over the Agent-to-Agent (A2A) protocol.

> **Note on Language:** Built with **Node.js 24 & TypeScript** (rather than Python), as confirmed by email prior to 14:00 IST. Pure TypeScript with strict typing, zero float math, and Express 5.

---

## Architecture Overview

```
                                +-----------------------------------+
                                |            GPF Pack               |
                                | (Bank PDF, Valuation/NAV Excel)   |
                                +-----------------+-----------------+
                                                  |
                                                  v
+-------------------------------+      A2A JSON-RPC 2.0      +-------------------------------+
|    Agent A: Bank Ingestion    | <------------------------> |    Agent B: Valuation & NAV   |
|                               |     POST /a2a (Port 8002)  |                               |
| - PDF text & line extraction  |                            | - Q3 vs Q4 valuation review   |
| - Layout & balance validation | 1. Send {fund, date}       | - Materiality check (R1-R4)   |
| - LLM categorization + rules  | 2. Input-required: trades  | - Trade set verification      |
| - Trade derivation (buy/sell) | 3. Send verified trades    | - Release valuation marks     |
| - Serves card on Port 8001    | 4. Completed: marks task   | - Q4 NAV computation & bridge |
+---------------+---------------+                            +---------------+---------------+
                |                                                            |
                +----------------------------+-------------------------------+
                                             |
                                             v
                              +------------------------------+
                              |         Output JSONs         |
                              |  - transactions.json (39)    |
                              |  - marks.json (7 marks)      |
                              |  - review.json (5 flagged)   |
                              |  - nav.json ($169,764,039.25)|
                              |  - bank_checks.json (passed) |
                              |  - a2a_log.jsonl (audit log) |
                              +------------------------------+
```

---

## Deliverables & Results Summary

| Metric | Result | Source / Verification |
|---|---|---|
| **Closing Cash** | **$23,896,579.25** | Bank statement closing balance (0 running balance breaks) |
| **Investments (USD)** | **$146,062,460.00** | Q4 portfolio fair value (Ember at 1.0666 FX, Ionmere at cost) |
| **Liabilities** | **$195,000.00** | Q4 accrued liabilities from NAV summary |
| **Q4 NAV** | **$169,764,039.25** | Cash + Investments - Liabilities |
| **NAV Bridge Difference** | **$0.00** | Exact penny balance across capital calls, distributions, income, expenses, realized & unrealized gains |
| **Review Flags** | **5 companies** | Bluetarn (R1), Cedar (R1), Harbor (R1), Delta (R2), Ionmere (R3) |
| **FX Rate** | **1.0666** | Official ECB EUR/USD reference rate for 30 Dec 2022 |
| **Materiality Threshold** | **15.0%** | Absolute change in local currency |
| **Transactions Processed**| **39 transactions** | 100% categorized, bank checks verified |

---

## Prerequisites

- **Node.js**: `>= 22.13.0` (developed and tested on Node 24.2.0 / 24.22.2)
- **npm**: `>= 10.0.0`
- **Operating System**: Linux, macOS, or Windows

---

## Setup & Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Configure your OpenAI-compatible API credentials in `.env`:
   ```ini
   LLM_API_KEY="your-api-key"
   LLM_BASE_URL=https://api.groq.com/openai/v1
   LLM_MODEL=openai/gpt-oss-20b
   AGENT_A_PORT=8001
   AGENT_B_PORT=8002
   ```
   *(Note: The pipeline functions 100% deterministically offline via rules fallback even without an LLM key).*

3. **Run the full Quarter-Close pipeline:**
   ```bash
   npm start -- ./pack .
   ```
   - Argument 1 (`./pack`): Path to input pack directory.
   - Argument 2 (`.`): Working root directory (results written to `./output`).

---

## Verification & Test Commands

- **Unit and Integration Tests (offline):**
  ```bash
  npm test
  ```
  Runs 28 test files (82 tests) across money math, dates, schemas, PDF parsing, bank checks, rules fallback, review engine, NAV engine, output writers, and two-turn A2A communication.

- **Typecheck:**
  ```bash
  npm run typecheck
  ```
  Strict TypeScript type verification with zero errors.

- **A2A Endpoint Smoke Test:**
  ```bash
  npm run smoke
  ```
  Boots both Agent A and Agent B offline on ephemeral ports, executing 13 distinct endpoint validation checks (Agent cards, JSON-RPC errors, trade verification, and pipeline execution).

- **Live LLM Categorization Verification:**
  ```bash
  npm run llm:check
  ```
  Executes live LLM categorization against the bank statement and verifies all 39 rows against expected categories.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `LLM_API_KEY` | OpenAI-compatible API key for live categorization | *(Optional)* |
| `LLM_BASE_URL` | Base URL for LLM completions | `https://api.groq.com/openai/v1` |
| `LLM_MODEL` | Model identifier | `openai/gpt-oss-20b` |
| `AGENT_A_PORT` | Port for Agent A HTTP server | `8001` |
| `AGENT_B_PORT` | Port for Agent B HTTP server | `8002` |
| `PACK_DIR` | Default path to input pack files | `./pack` |
| `OUTPUT_DIR` | Default path for output JSON deliverables | `./output` |
| `THRESHOLD_PCT` | Materiality threshold for review flag R1 (%) | `15` |
| `LLM_CACHE_DIR` | Optional local disk cache directory for LLM calls | *(Optional)* |

---

## Honest Gaps & Current Limitations

1. **Protocol Transport**: Streaming and push notifications are disabled (`capabilities.streaming = false`), adhering strictly to standard JSON-RPC 2.0 request/response.
2. **Task Storage**: Agent state is maintained using an `InMemoryTaskStore`. In-flight tasks do not survive process restarts.
3. **Format Specificity**: Bank statement parsing is tailored to the Greatness PE Fund statement format and layout structure. Adapting to new bank templates requires writing layout extractors.
4. **Fallback Rules**: The deterministic fallback rules are heuristic regex and token matching patterns. While they achieve 39/39 accuracy on this fund, complex arbitrary descriptions benefit from the primary LLM path.
5. **Security & Authentication**: Endpoints do not implement mTLS, API keys, or JWT bearer authentication on the A2A endpoints.
6. **FX Sourcing**: The 1.0666 EUR/USD rate is statically pinned from the official ECB reference rate for 30 Dec 2022 rather than fetched live over an external FX API.

---

## Next Steps for Production Deployment

1. **Enterprise A2A Protocol Adoption**: Integrate production-grade transport security (mTLS, HMAC signatures, and mutual authentication tokens).
2. **Persistent Distributed Task Store**: Replace in-memory task maps with Redis / PostgreSQL backing for idempotency and disaster recovery.
3. **Multi-Fund Bank Adapters**: Implement plugin-based layout extractors with visual OCR support for diverse custodian and bank formats.
4. **Observability & OpenTelemetry**: Add distributed trace propagation across A2A message headers to track requests across agent boundaries.
5. **Human-in-the-Loop Review UI**: Provide a web-based reconciliation dashboard for fund controllers to inspect flagged items, approve accrual settlements, and sign off on quarterly NAV bridges.

