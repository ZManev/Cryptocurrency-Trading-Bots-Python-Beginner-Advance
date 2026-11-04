import { describe, expect, it } from "vitest";
import { TradingTerminal } from "../src/orchestrator.js";
import type { Candidate } from "../src/domain/types.js";

const good: Candidate = {
  id: "candidate-1", chain: "solana", symbol: "SOL/USDC", venue: "test",
  liquidityUsd: 2_000_000, volume24hUsd: 5_000_000, ageMinutes: 50_000,
  mintAuthorityRevoked: true, freezeAuthorityRevoked: true,
  holderConcentrationPct: 10, spreadBps: 10
};

describe("TradingTerminal", () => {
  it("runs the six-agent pipeline and creates only a paper intent", () => {
    const [result] = new TradingTerminal().process([good]);
    expect(result?.filter.passed).toBe(true);
    expect(result?.analysis?.score).toBeGreaterThanOrEqual(70);
    expect(result?.intent?.mode).toBe("paper");
    expect(result?.events.map((e) => e.agent)).toEqual(["SCOUT", "FILTER", "ANALYST", "RISK", "EXECUTOR", "LOGGER"]);
  });

  it("stops rejected candidates before analysis or execution", () => {
    const [result] = new TradingTerminal().process([{ ...good, mintAuthorityRevoked: false }]);
    expect(result?.filter.passed).toBe(false);
    expect(result?.analysis).toBeUndefined();
    expect(result?.intent).toBeUndefined();
  });
});
