# Implementation Status

Branch: `feature/solana-mainnet-mev-readonly`

## Phase 1

Read-only diagnostic source and workflow are present. The workflow runs unit tests and TypeScript compilation. Network probes require operator-provided Mainnet RPC and WebSocket endpoints and actual captured output. Phase 1 RPC, WebSocket, Raydium, and Jito statuses remain NOT VERIFIED until that evidence is reviewed.

## Phase 2 scaffold

Added:
- typed execution candidate and simulation contracts;
- pure risk evaluation for input amount, slippage, program allowlist, network fee + Jito tip debit limits;
- adapter-driven balance / fee / simulation assessment;
- HSM signer interface only (no provider integration and no private-key storage);
- fail-closed execution gate requiring verified Phase 1 evidence, kill-switch release, separate live/signing/submission controls, independent approval ID, and candidate binding;
- safety unit tests.

## Explicit non-implementation

No concrete HSM integration, signing implementation, transaction sender, Jito bundle sender, live trading path, production credentials, or live activation has been added. Existing Phase 1 startup continues to require all execution flags to be false. No real transaction has been signed or submitted.

## Next engineering gates

1. Verify Phase 1 with timestamped real RPC, WSS, Raydium, and Jito evidence.
2. Add adapter contract tests and a local/fork simulation harness.
3. Select and independently review an HSM/KMS provider and mTLS protocol.
4. Complete transaction instruction decoding and token/native debit accounting.
5. Security review, audit/reconciliation tests, and independent approval workflow.
6. Only then consider a separately reviewed production execution adapter and explicit live authorization.
