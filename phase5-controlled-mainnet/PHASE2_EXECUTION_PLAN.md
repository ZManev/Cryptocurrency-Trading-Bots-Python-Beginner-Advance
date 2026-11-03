# Phase 2 — Controlled Mainnet Execution

Status: **AUTHORIZED FOR IMPLEMENTATION; NOT AUTHORIZED FOR AN UNSPECIFIED LIVE ORDER**

Base: `feature/solana-mainnet-mev-readonly`  
Target branch: `feature/solana-phase2-controlled-mainnet-execution`  
Cluster: `mainnet-beta`

## 1. Scope

Implement a separately gated Solana Mainnet execution subsystem that can sign and submit an explicitly approved transaction after all pre-trade controls pass. Phase 1 remains read-only and immutable. Do not weaken or repurpose its read-only policy.

This phase does not authorize an unattended trading strategy, unrestricted wallet access, validator changes, or Jito bundle submission by default.

## 2. Hard separation

- Keep `phase4-mev-readonly/` read-only. Its RPC allowlist and fail-closed configuration remain unchanged.
- Create a separate `phase5-controlled-mainnet/` package for live execution.
- Do not import the Devnet execution adapter into the Mainnet package. Do not reuse Devnet RPC, keypairs, airdrop logic, or Devnet program addresses.
- No private key, seed phrase, wallet JSON, API secret, or signed transaction is committed to Git, CI logs, proof artifacts, or chat.
- Mainnet execution requires a dedicated low-balance wallet and an external secret signer (KMS/HSM or an explicitly approved local signer). No implicit fallback to a plaintext keypair.
- BAM validator operation and Jito bundle submission remain separate capabilities and OFF unless separately reviewed and explicitly approved.

## 3. Required execution pipeline

1. Load immutable Mainnet cluster identity and validate the Mainnet genesis hash.
2. Load an explicit trade intent: input/output mint, raw input amount, maximum slippage, maximum priority fee, and expiry.
3. Validate mint, program, route, token-account, and instruction allowlists.
4. Obtain a fresh quote; reject stale, malformed, mismatched, or over-impact quotes.
5. Build the unsigned transaction; decode and inspect every instruction and account.
6. Simulate the exact transaction against Mainnet; reject simulation errors, unexpected program IDs, unexpected writable accounts, or excessive compute/fees.
7. Evaluate hard risk limits: per-trade notional, daily notional, daily loss, minimum SOL reserve, slippage, price impact, priority fee, and exposure.
8. Require an explicit operator approval bound to the transaction message hash and intent expiry.
9. Pass the immutable approved message to the signer. The signer must independently verify the message hash and policy.
10. Re-check blockhash validity and risk state immediately before submission.
11. Submit once with preflight enabled and a bounded retry policy that cannot create duplicate economic orders.
12. Confirm signature; fetch parsed transaction/meta; reconcile input and output token balances, fees, rent, and account state.
13. Persist an append-only audit record and a machine-readable execution proof.

## 4. Fail-closed feature flags

All execution flags default to OFF. Missing, malformed, or conflicting configuration must disable execution.

- `APP_MODE=CONTROLLED_EXECUTION`
- `LIVE_TRADING=false` by default
- `TRANSACTION_SIGNING_ENABLED=false` by default
- `SEND_TRANSACTION_ENABLED=false` by default
- `RAYDIUM_EXECUTION_ENABLED=false` by default
- `JITO_EXECUTION_ENABLED=false`
- `SEND_BUNDLE_ENABLED=false`
- `BAM_ENABLED=false`
- `BAM_VALIDATOR_ENABLED=false`

Enabling the Mainnet transaction path requires all relevant flags to be explicitly true in a protected runtime environment and all policy limits to be present. Jito bundles and BAM validator operation are not prerequisites for ordinary RPC transaction submission and remain independently disabled.

## 5. Mandatory risk controls

No default capital amount is assumed. The operator must configure and approve explicit numeric limits before any live transaction:

- Maximum input amount and notional per trade
- Maximum cumulative daily notional
- Maximum daily realized and unrealized loss
- Maximum slippage and price impact
- Maximum priority fee and total network fee
- Minimum SOL reserve after fees
- Allowed input/output mints and allowed program IDs
- Maximum transaction age and quote age
- Maximum number of transactions per time window
- Emergency kill switch and signer-side deny switch

A zero, missing, non-finite, or invalid limit is a hard rejection, not an unlimited value.

## 6. Idempotency and recovery

- Assign each intent a unique immutable ID and canonical message hash.
- Persist intent state before signing: CREATED → VALIDATED → SIMULATED → RISK_APPROVED → OPERATOR_APPROVED → SIGNED → SUBMITTED → CONFIRMED/FAILED → RECONCILED.
- Never blindly resubmit after a timeout. Query signature/status and reconcile before any retry.
- Treat ambiguous submission outcomes as UNKNOWN and halt that intent pending reconciliation.
- Enforce one active execution per intent and deduplicate by intent ID/message hash.
- Kill switch blocks new signatures and submissions; it cannot reverse a transaction already on-chain.

## 7. Required tests before Mainnet activation

- Unit tests for config, policy, mint/program allowlists, amount arithmetic, fee ceilings, and intent expiry
- Adversarial tests for malicious/unknown instructions, writable-account injection, stale quotes, slippage drift, blockhash expiry, RPC failure, signer mismatch, and duplicate submission
- Simulation tests with exact transaction bytes and expected account effects
- Integration tests on a local validator or Devnet using isolated test credentials
- Mainnet read-only connectivity proof
- Mainnet signer self-test that signs a non-broadcast challenge only
- Reconciliation tests for success, failure, timeout, partial effects, and fee-only effects
- Build/test evidence from the exact branch commit

A Devnet test is not evidence of a Mainnet fill. A successful signature submission is not proof of a successful swap. A confirmed transaction is not reconciled until observed account deltas and fees match the intent.

## 8. Acceptance gates

| Gate | Acceptance evidence | Initial status |
|---|---|---|
| G0 Repository isolation | Phase 1 unchanged; separate package and branch | PENDING |
| G1 Build reproducibility | Lockfile, clean install, build and unit tests | NOT VERIFIED |
| G2 Risk and execution gate | Adversarial tests pass; defaults OFF | NOT VERIFIED |
| G3 Signer security | External signer, message-hash verification, no key leakage | NOT VERIFIED |
| G4 Devnet integration | Simulate/sign/submit/reconcile with test funds | NOT VERIFIED |
| G5 Mainnet read-only | RPC, WebSocket, quote and diagnostics proof | NOT VERIFIED |
| G6 Controlled live approval | Explicit limits, wallet, exact intent and operator approval | NOT AUTHORIZED |
| G7 First Mainnet execution | Signature, confirmation, balance delta, fees and audit proof | NOT RUN |

No gate is marked PASS without retained evidence tied to a commit SHA. Mainnet signing/submission remains disabled until G0–G6 are accepted. G7 is a separately approved one-transaction operation.

## 9. First live transaction protocol

Before the first broadcast, present a human-readable transaction preview including cluster, wallet public key, input/output mints, exact raw and decimal amounts, quote, minimum output, price impact, slippage, program IDs, instruction summary, estimated fees, signer, message hash, expiry, and all active limits. Require a fresh explicit approval for that exact preview. Any changed message requires a new approval.

The first Mainnet operation must be one bounded transaction, not a strategy loop. After confirmation, reconcile and stop. No automatic second trade.
