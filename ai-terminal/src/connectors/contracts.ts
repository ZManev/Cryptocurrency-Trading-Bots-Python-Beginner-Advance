import type { Chain, Candidate, TradeIntent } from "../domain/types.js";

/**
 * Integration boundary only. Implementations must be read-only at this stage.
 * No connector may receive signing keys or submit transactions/orders.
 */
export interface MarketDataConnector {
  readonly chain: Chain;
  health(): Promise<{ ok: boolean; detail: string }>;
  discover(): Promise<readonly Candidate[]>;
}

export interface PaperExecutionRecorder {
  record(intent: TradeIntent): Promise<{ recorded: boolean; reference: string }>;
}

export const integrationTargets = {
  solana: { repository: "ZManev/jito-searcher-bot", ref: "feature/mainnet-bam-foundation", capabilities: ["RPC read-only", "WebSocket telemetry", "Raydium quotes", "Jito diagnostics"] },
  ethereum: { repository: "ZManev/Triangular-Arbitrage-master", ref: "main", capabilities: ["EVM market research", "fork simulation pending"] },
  arbitrum: { repository: "ZManev/Binance-Bot", ref: "feature/arbitrum-flashloan-simulation", capabilities: ["flash-loan research", "simulation-only"] },
  binance: { repository: "ZManev/Cryptocurrency-Trading-Bots-Python-Beginner-Advance", ref: "master", capabilities: ["legacy strategy research", "read-only adapter pending"] }
} as const;
