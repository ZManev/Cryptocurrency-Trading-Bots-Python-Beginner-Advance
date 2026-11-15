# Solana Mainnet MEV — Read-Only Foundation + Phase 2 Scaffold

Phase 1 provides read-only Solana Mainnet diagnostics: RPC health/genesis/slot/account reads, a WebSocket slot event, Raydium quote, and Jito `getTipAccounts`.

Phase 2 adds **non-executing architecture scaffolding** for strategy candidates, risk evaluation, simulation assessment, an execution gate, and an HSM signer contract.

## Safety boundary

- No wallet private key is loaded or stored by this application.
- No concrete HSM provider adapter is implemented yet; `HsmSigner` is an interface contract only.
- No transaction submission or Jito bundle submission adapter is implemented.
- The execution gate is a policy evaluator, not a transaction sender.
- Phase 1 remains read-only and requires all execution flags to be explicitly `false`.
- Phase 2 modules do not override Phase 1's read-only startup guard.
- Do not put API keys, HSM credentials, or private keys in source control or chat.

## Setup and checks

```bash
cd phase4-mev-readonly
npm install
cp .env.example .env
npm test
npm run build
npm run probe
```

Use a dedicated Mainnet RPC provider for sustained workloads. The probe performs read-only requests only. A PASS requires captured, timestamped output from the actual probe; configuration alone is not evidence.

## Phase 2 modules

- `src/phase2/types.ts`: typed candidate, simulation, risk, and authorization contracts.
- `src/phase2/risk-engine.ts`: fee + Jito tip debit cap, slippage, input amount, and program allowlist checks.
- `src/phase2/simulation.ts`: adapter-driven balance, fee, and simulation assessment.
- `src/phase2/hsm-signer.ts`: HSM signer interface and response identity checks; no key material handling or provider implementation.
- `src/phase2/execution-gate.ts`: fail-closed gate requiring verified Phase 1 evidence, live controls, kill-switch release, independent approval ID, and candidate binding.

## Not implemented / not authorized

Real HSM signing, transaction submission, Jito bundle submission, live trading, production secrets, and live activation are **not implemented or enabled**. The 0.01 SOL maximum total-debit policy must be enforced by a production policy configuration and independently tested before any live use. No transaction should be sent from this branch.

## Evidence

Save probe output as `artifacts/mainnet-mev/phase1-readonly.json`. Never replace missing evidence with a manually assigned PASS.
