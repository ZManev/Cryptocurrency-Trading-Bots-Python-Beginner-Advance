# Phase 3 Deployable Package

This directory deploys the Phase 3 ledger and Solana Devnet E2E harness.

## Safety boundary

- Devnet only.
- The E2E harness generates an ephemeral signer at runtime.
- No production private key is accepted by the E2E workflow.
- Production credentials must be supplied through GitHub Actions Secrets or an external secret manager.
- PostgreSQL is the canonical ledger; Google Sheets/in-memory state is not authoritative.

## Local deployment

From the repository root:

```bash
cp deploy/.env.example deploy/.env
# edit deploy/.env and set a strong POSTGRES_PASSWORD

docker compose --env-file deploy/.env -f deploy/compose/docker-compose.yml up -d postgres
docker compose --env-file deploy/.env -f deploy/compose/docker-compose.yml --profile e2e run --rm solana-devnet-e2e
```

## GitHub Actions

Set a repository secret named `SOLANA_RPC_URL` to a dedicated Devnet RPC endpoint if the public Solana endpoint is rate-limited.

The workflow deliberately fails rather than silently falling back to a production network.

## Database

The compose deployment automatically initializes:

- accounts
- order_intents
- risk_approvals
- execution_requests
- fills
- audit_events
- idempotency_keys
- kill_switch_state

## Deployment definition

This package is deployable infrastructure, but a successful Solana E2E proof still requires an actually funded Devnet execution. A CI green build alone is not treated as financial execution evidence.


## Real DEX E2E

Phase 3 now executes a real **Raydium Devnet swap** instead of a SystemProgram transfer.

Evidence path:

    OrderIntent
      -> RiskApproval
      -> ExecutionRequest / Gate=ALLOW
      -> Raydium Trade V2
      -> on-chain swap transaction
      -> observed output-token balance
      -> PostgreSQL Fill
      -> ReconciliationResult=RECONCILED
      -> AuditEvent

The E2E signer is generated ephemerally inside the test process. No production private key is stored in GitHub.

Raydium's current SDK/demo documents Devnet routing through the SDK's Trade V2 path and Devnet program IDs; the E2E uses that adapter with an explicit output mint, 0.01 SOL input, and 100 bps maximum slippage.

For local execution, set RAYDIUM_OUTPUT_MINT to a currently liquid Raydium Devnet token and run the E2E profile after PostgreSQL is healthy.
