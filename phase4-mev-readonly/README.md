# Solana Mainnet MEV — Read-Only Foundation

This package implements Phase 1 diagnostics only. It reads Solana Mainnet state, subscribes to slot updates, requests a Raydium quote, and calls Jito's read-only `getTipAccounts` method.

## Safety boundary

- No wallet or private key is loaded.
- No transaction is constructed, signed, simulated, or submitted.
- No Jito bundle is constructed or submitted.
- The Jito adapter allowlists only `getTipAccounts`.
- The Solana RPC adapter allowlists read-only methods.
- The application fails closed unless all execution flags are explicitly `false`.

The inherited Devnet execution harness is intentionally not imported by this package.

## Setup

```bash
cd phase4-mev-readonly
npm install
cp .env.example .env
```

Set `SOLANA_RPC_URL` and `SOLANA_WS_URL` to a dedicated Mainnet RPC provider. Do not use a shared public RPC for sustained or latency-sensitive workloads.

## Local checks

```bash
npm test
npm run build
npm run probe
```

The probe makes read-only network requests. It emits JSON with per-check PASS/FAIL results. A successful RPC health check alone does not prove provider suitability or MEV profitability.

## Phase boundaries

Phase 1: Mainnet read-only RPC, WebSocket, Raydium quote, Jito diagnostics.

Phase 2: pool discovery, route graph, arbitrage candidate generation and fee-aware profitability analysis. No execution.

Phase 3: Jito searcher client research and offline/local bundle construction/simulation only. Submission methods remain absent and blocked.

Phase 4: optional validator-side BAM integration. Requires a separately operated validator with upcoming leader slots; it is not required for the searcher.

Phase 5: security, replay, latency, P&L attribution and reconciliation audit.

## Evidence

Save probe output as `artifacts/mainnet-mev/phase1-readonly.json`. Never replace missing evidence with a manually assigned PASS.
