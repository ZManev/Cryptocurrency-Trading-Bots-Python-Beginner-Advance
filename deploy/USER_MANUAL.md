# CONTROLLED PRODUCTION EXECUTION PLATFORM — USER MANUAL

## Phase 3 — Solana Devnet Execution & Evidence Package

Repository: ZManev/Cryptocurrency-Trading-Bots-Python-Beginner-Advance  
Branch: phase-3/solana-devnet-e2e

## 1. Purpose

This package provides the deployable foundation for a controlled crypto execution platform.

Evidence boundary:

Strategy / AI
→ OrderIntent
→ RiskApproval
→ Execution Gate
→ Solana / Raydium adapter
→ real on-chain transaction
→ observed fill / balance delta
→ PostgreSQL
→ reconciliation
→ audit evidence

**Important:** Phase 3 is Devnet execution infrastructure. It is not a declaration that successful real-money Mainnet execution has been completed.

## 2. Deployment package

```text
phase3/
├── contracts/
├── database/
└── solana-devnet/

deploy/
├── .env.example
├── README.md
└── compose/
    └── docker-compose.yml

.github/workflows/
└── python-package-conda.yml
```

## 3. Prerequisites

- Git
- Docker + Docker Compose
- Node.js 20+
- PostgreSQL 16 via Compose
- Dedicated Solana Devnet RPC for CI/local E2E
- Currently supported/liquid Raydium Devnet output mint

Never commit private keys to Git, GitHub Actions variables, frontend code, strategy code, or this repository.

## 4. Local deployment

From repository root:

```bash
cp deploy/.env.example deploy/.env
```

Set:

```text
POSTGRES_PASSWORD=<long-random-secret>
SOLANA_RPC_URL=<dedicated-devnet-rpc>
RAYDIUM_OUTPUT_MINT=<current-devnet-output-mint>
```

Start PostgreSQL:

```bash
docker compose --env-file deploy/.env -f deploy/compose/docker-compose.yml up -d postgres
```

Run the real Devnet E2E:

```bash
docker compose --env-file deploy/.env -f deploy/compose/docker-compose.yml --profile e2e run --rm solana-devnet-e2e
```

## 5. GitHub Actions

Configure repository secret:

```text
SOLANA_RPC_URL
```

The workflow initializes PostgreSQL, installs the E2E harness, executes the Raydium Devnet flow, and records ledger evidence.

Triggers:
- push to phase-3/solana-devnet-e2e
- manual workflow_dispatch

## 6. Database

The PostgreSQL schema contains:

- accounts
- order_intents
- risk_approvals
- execution_requests
- fills
- reconciliation_results
- audit_events
- idempotency_keys
- kill_switch_state

PostgreSQL is the canonical application ledger. The blockchain/exchange remains the source of execution truth.

## 7. Production Execution Proof

```text
funding_signature
        ↓
transaction_signature
        ↓
observed_balance_delta
        ↓
fill_id
        ↓
reconciliation_id
        ↓
audit_event_id
        ↓
PRODUCTION_EXECUTION_PROOF = PASS
```

PASS must be derived from evidence:

1. Funding transaction verified.
2. Real transaction exists on the target venue.
3. Transaction meets the configured confirmation/finality policy.
4. Observed output balance delta is positive.
5. PostgreSQL fill exists.
6. Fill references the same transaction signature.
7. Reconciliation status is RECONCILED.
8. Audit evidence exists with the correlation chain.

A CI-green workflow alone is not execution proof.

## 8. Transaction lifecycle

```text
CREATED
  ↓
SIMULATED
  ↓
SIGNED
  ↓
SUBMITTED
  ↓
PROCESSED
  ↓
CONFIRMED
  ↓
FINALIZED
  ↓
FILLED
  ↓
RECONCILED
  ↓
AUDITED
```

For Mainnet, use production RPC, fresh blockhashes, and track blockhash validity. If a blockhash expires, rebuild and re-sign the transaction instead of blindly retrying the old signed transaction.

## 9. Security boundary

AI, strategy code, UI and notification channels must not receive unrestricted private-key access.

```text
AI / Strategy
     ↓
OrderIntent
     ↓
Risk
     ↓
Execution Gate
     ↓
Signing Service
     ↓
Venue Adapter
     ↓
Venue
```

Capability is not authority.

## 10. Kill switches and idempotency

Production control should support:

- SYSTEM
- ACCOUNT
- VENUE
- STRATEGY
- INSTRUMENT

An active kill switch blocks execution at the gate.

Every execution request must carry an idempotency key. Duplicate requests must not create duplicate financial actions.

## 11. Troubleshooting

### SOLANA_RPC_URL missing

The real DEX E2E intentionally fails. Configure a dedicated Devnet RPC.

### Faucet / funding rate limited

Do not interpret faucet availability as execution proof. Verify the funding signature and funded balance.

### Blockhash expired

Rebuild the transaction with a fresh blockhash, sign again, submit, and reconcile the new transaction signature.

### Raydium quote unavailable

Verify the Devnet output mint is currently supported/liquid and that the configured RPC can reach required Solana accounts.

### PostgreSQL reconciliation missing

Verify schema initialization and that the E2E process reached the ledger-write stage. A transaction without matching fill and reconciliation evidence is not PASS.

## 12. Evidence record

A production-grade evidence record should contain:

```text
correlation_id
funding_signature
transaction_signature
balance_before
balance_after
observed_balance_delta
fill_id
reconciliation_id
reconciliation_status
audit_event_id
finality
verified_at
```

## 13. Current acceptance status

The repository contains the deployable Devnet E2E package and CI integration.

Previously observed CI runs had not produced a verified successful real Raydium Devnet execution with complete PostgreSQL reconciliation evidence.

Therefore:

```text
PRODUCTION_EXECUTION_PROOF = NOT VERIFIED
```

Do not change this status to PASS manually.

## 14. Mainnet transition

Mainnet requires separate production configuration and controls:

- production RPC
- isolated signing service / KMS / HSM / Vault boundary
- real SOL fee funding
- mainnet program/token addresses
- execution risk limits
- kill switches
- transaction monitoring
- finalized reconciliation
- alerting
- canary controls
- operational runbooks

Devnet and Mainnet credentials, mints and configuration must remain separated.

## 15. Reference evidence chain

```text
REAL VENUE
    ↓
REAL TRANSACTION
    ↓
REAL FILL / BALANCE DELTA
    ↓
RECONCILIATION
    ↓
POSTGRES
    ↓
AUDIT
    ↓
PRODUCTION_EXECUTION_PROOF
```

Operational rule: a green CI build is not financial execution proof. Production proof must originate from real venue state and be independently reconciled into the canonical ledger.
