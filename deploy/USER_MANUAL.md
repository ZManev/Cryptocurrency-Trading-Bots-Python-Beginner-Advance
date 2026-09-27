# Controlled Production Execution Platform — User Manual

## 1. Purpose

This package provides the deployable Phase 3 foundation for a controlled crypto execution platform.

The verified design boundary is:

Strategy / AI
→ OrderIntent
→ RiskApproval
→ ExecutionRequest / Execution Gate
→ Solana / Raydium adapter
→ real on-chain transaction
→ observed fill / balance delta
→ PostgreSQL
→ reconciliation
→ audit evidence.

**Important:** Phase 3 is Devnet execution infrastructure. It is not a declaration that a successful real-money Mainnet execution has been completed.

## 2. Repository deployment

Branch:

`phase-3/solana-devnet-e2e`

Core directories:

```text
phase3/
  contracts/
  database/
  solana-devnet/

deploy/
  .env.example
  README.md
  compose/docker-compose.yml

.github/workflows/
  python-package-conda.yml
```

## 3. Prerequisites

- Git
- Docker + Docker Compose
- Node.js 20+
- PostgreSQL 16 (provided by Compose)
- A dedicated Solana Devnet RPC endpoint for CI/local E2E
- A currently liquid Raydium Devnet output mint

Do not put private keys in Git, GitHub Actions variables, frontend code, strategy code, or this repository.

## 4. Local deployment

From the repository root:

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

Run the real Devnet E2E profile:

```bash
docker compose --env-file deploy/.env -f deploy/compose/docker-compose.yml --profile e2e run --rm solana-devnet-e2e
```

## 5. GitHub Actions deployment

Repository secret:

```text
SOLANA_RPC_URL
```

The workflow initializes PostgreSQL, installs the E2E harness, executes the Raydium Devnet flow and writes the ledger evidence.

Trigger:

- push to `phase-3/solana-devnet-e2e`
- manual `workflow_dispatch`

## 6. Database

The PostgreSQL schema contains the execution evidence chain:

- accounts
- order_intents
- risk_approvals
- execution_requests
- fills
- reconciliation_results
- audit_events
- idempotency_keys
- kill_switch_state

PostgreSQL is the canonical application ledger. It does not replace the venue/blockchain as the source of execution truth.

## 7. Production Execution Proof

The proof chain is:

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

PASS must be derived from evidence.

Required conditions:

1. Funding transaction verified.
2. Real transaction exists on the target venue.
3. Transaction is confirmed/finalized according to the configured settlement policy.
4. Observed output balance delta is positive.
5. PostgreSQL fill exists.
6. Fill references the same transaction signature.
7. Reconciliation status is `RECONCILED`.
8. Audit event exists with the execution correlation chain.

A CI-green workflow alone is not execution proof.

## 8. Solana transaction lifecycle

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

For Mainnet, use a production RPC rather than the public endpoint, use fresh blockhashes, track `lastValidBlockHeight`, and rebuild/re-sign a transaction when its blockhash expires. For audit evidence, record finalized state where the settlement policy requires it.

## 9. Safety boundary

AI, strategy code, UI and notification channels must not receive unrestricted private-key access.

The intended production boundary is:

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

## 10. Kill switches

Production control must support independent switches for:

- SYSTEM
- ACCOUNT
- VENUE
- STRATEGY
- INSTRUMENT

An active kill switch blocks execution at the gate.

## 11. Idempotency

Every execution request must carry an idempotency key.

Duplicate requests must not create duplicate financial actions.

The database schema includes a unique idempotency record to support this boundary.

## 12. Troubleshooting

### SOLANA_RPC_URL missing

The real DEX E2E intentionally fails. Configure a dedicated Devnet RPC.

### Faucet / funding rate limited

Do not interpret a faucet HTTP success/failure as an execution proof. Use a funded Devnet account and verify the funding signature and resulting balance.

### Blockhash expired

Do not blindly retry an old signed transaction. Rebuild the transaction with a fresh blockhash, sign again, submit, and reconcile the resulting signature.

### Raydium quote unavailable

Verify the Devnet output mint is currently supported/liquid and that the configured RPC can reach the required Solana accounts.

### PostgreSQL reconciliation missing

Check that the schema was initialized and that the E2E process reached the ledger-write stage. A transaction without a matching fill and reconciliation record is not a PASS.

## 13. Evidence record

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

## 14. Current acceptance status

The repository contains the deployable Devnet E2E package and CI integration.

At the time this manual is generated, the previously observed CI runs had not produced a verified successful real Raydium Devnet execution with complete PostgreSQL reconciliation evidence. Therefore:

```text
PRODUCTION_EXECUTION_PROOF = NOT VERIFIED
```

Do not change this status to PASS manually.

## 15. Mainnet transition

Mainnet requires a separate production configuration and controls:

- production RPC
- secure signing service / KMS / HSM / Vault boundary
- real SOL fee funding
- mainnet token/program addresses
- execution risk limits
- kill switches
- transaction monitoring
- finalized reconciliation
- alerting
- canary controls
- operational runbooks

Devnet and Mainnet credentials, mints and configuration must remain separated.

## 16. References

- Solana Production Readiness: https://solana.com/docs/tools/production-readiness
- Solana Transaction Confirmation & Expiration: https://solana.com/developers/cookbook/transactions/confirmation
- Solana getTransaction RPC: https://solana.com/docs/rpc/http/gettransaction
