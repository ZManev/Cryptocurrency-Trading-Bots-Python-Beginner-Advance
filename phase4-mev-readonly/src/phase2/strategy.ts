import type { TradeCandidate } from "./types.js";

export interface MarketSnapshot {
  slot: number;
  observedAt: string;
  quotes: Array<{
    inputMint: string;
    outputMint: string;
    inputAmount: bigint;
    expectedOutputAmount: bigint;
    minimumOutputAmount: bigint;
    slippageBps: number;
    routeProgramIds: string[];
  }>;
}

export interface Strategy {
  readonly name: string;
  generateCandidates(snapshot: MarketSnapshot): Promise<TradeCandidate[]>;
}

/** Strategy implementations produce proposals only; they have no signer or sender dependency. */
export function assertCandidateFreshness(snapshot: MarketSnapshot, maxAgeMs: number, nowMs = Date.now()): void {
  const observed = Date.parse(snapshot.observedAt);
  if (!Number.isFinite(observed) || nowMs - observed < 0 || nowMs - observed > maxAgeMs) {
    throw new Error("MARKET_SNAPSHOT_STALE");
  }
  if (!Number.isSafeInteger(snapshot.slot) || snapshot.slot <= 0) {
    throw new Error("MARKET_SNAPSHOT_SLOT_INVALID");
  }
}
