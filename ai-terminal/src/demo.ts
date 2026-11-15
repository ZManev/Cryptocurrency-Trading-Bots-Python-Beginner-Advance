import { TradingTerminal } from "./orchestrator.js";
import type { Candidate } from "./domain/types.js";

const sample: Candidate[] = [{
  id: "demo-sol-usdc",
  chain: "solana",
  symbol: "SOL/USDC",
  venue: "paper-demo",
  liquidityUsd: 2_500_000,
  volume24hUsd: 8_000_000,
  ageMinutes: 60_000,
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
  holderConcentrationPct: 12,
  spreadBps: 8
}];

console.log(JSON.stringify(new TradingTerminal().process(sample), null, 2));
