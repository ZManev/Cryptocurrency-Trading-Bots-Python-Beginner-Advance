# AI Multi-Agent Trading Terminal

A TypeScript foundation for a six-agent crypto research and paper-trading control plane, inspired by the supplied terminal design.

## Status

**Foundation scaffold — implementation and CI execution still pending.** This branch does not claim successful builds, tests, exchange connectivity, profitability, or live deployment.

## Safety contract

- Default operation is research + paper mode.
- No private keys, signing material, exchange secrets, or wallet credentials are accepted by the core.
- No live orders, transaction signing, transaction submission, Jito bundle submission, or withdrawals.
- RiskEngine is the only policy authority; missing/invalid controls must deny.
- Existing chain-specific repositories remain separate systems behind typed, read-only integration contracts.

## Six agents

1. SCOUT — normalizes candidate discovery.
2. FILTER — deterministic liquidity, volume, holder concentration, spread and authority checks.
3. ANALYST — produces a transparent 0–100 score.
4. EXECUTOR — emits a paper intent only; no venue API call.
5. RISK — enforces score, notional, kill switch and hard execution locks.
6. LOGGER — emits an auditable event trail.

## Ecosystem integration targets

| Ecosystem | Repository | Current boundary |
| --- | --- | --- |
| Solana | [jito-searcher-bot](https://github.com/ZManev/jito-searcher-bot/tree/feature/mainnet-bam-foundation) | Read-only RPC/WS, Raydium quote and Jito diagnostics; signing/broadcast disabled |
| Ethereum | [Triangular-Arbitrage-master](https://github.com/ZManev/Triangular-Arbitrage-master/tree/main) | README-only baseline observed; implementation required |
| Arbitrum | [Binance-Bot](https://github.com/ZManev/Binance-Bot/tree/feature/arbitrum-flashloan-simulation) | Simulation-only integration target |
| Binance Spot | [Cryptocurrency-Trading-Bots-Python-Beginner-Advance](https://github.com/ZManev/Cryptocurrency-Trading-Bots-Python-Beginner-Advance/tree/master) | Legacy strategy code; safe read-only adapter not yet implemented |

## Local development

```bash
npm install
npm test
npm run build
npm run dev
```

## Next milestones

- Add authenticated read-only market-data adapters, with credentials held outside the app and least privilege.
- Add connector health, rate limits, timeout/retry policy and normalized market events.
- Build the dashboard API and dark terminal UI.
- Add persistence, replayable event log, metrics and alert delivery.
- Add integration tests using fixtures and mocks before any external network probes.
- Require independent security review and explicit approvals before considering any execution capability.
