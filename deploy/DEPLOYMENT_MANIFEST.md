# Deployment Manifest

## Branch

`phase-3/solana-devnet-e2e`

## Deployable package

```text
phase3/
├── contracts/
│   ├── domain.rs
│   ├── domain.ts
│   ├── execution.py
│   └── order_intent.py
├── database/
│   └── 001_phase3_ledger.sql
└── solana-devnet/
    ├── .dockerignore
    ├── Dockerfile
    ├── e2e.ts
    ├── package.json
    ├── raydium-execution-adapter.ts
    └── tsconfig.json

deploy/
├── .env.example
├── README.md
└── compose/
    └── docker-compose.yml

.github/
└── workflows/
    └── python-package-conda.yml
```

## Execution evidence chain

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
```

## Proof chain

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

## Deployment boundary

Phase 3 = controlled Solana Devnet execution and evidence pipeline.

Phase 4 = production execution/control plane with isolated signing, execution gate, risk enforcement, production RPC, monitoring, recovery and Mainnet canary controls.

No private key is committed to this repository.
