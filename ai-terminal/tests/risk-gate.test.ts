import { describe, expect, it } from "vitest";
import { defaultRiskPolicy, RiskEngine } from "../src/risk/risk-gate.js";
import type { AnalysisResult, TradeIntent } from "../src/domain/types.js";

const analysis: AnalysisResult = { candidateId: "c1", score: 90, signals: {} };
const intent: TradeIntent = {
  id: "intent-1", candidateId: "c1", chain: "solana", symbol: "SOL/USDC",
  notionalUsd: 25, mode: "paper", createdAt: new Date(0).toISOString()
};

describe("RiskEngine", () => {
  it("authorizes an in-limit paper intent only", () => {
    const result = new RiskEngine(defaultRiskPolicy).authorize(analysis, intent);
    expect(result.approved).toBe(true);
    if (result.approved) expect(result.authority).toBe("PAPER_ONLY");
  });

  it("fails closed when live trading is requested", () => {
    const result = new RiskEngine({ ...defaultRiskPolicy, liveTradingEnabled: true }).authorize(analysis, intent);
    expect(result.approved).toBe(false);
  });

  it("blocks signing and transaction submission", () => {
    const signing = new RiskEngine({ ...defaultRiskPolicy, signingEnabled: true }).authorize(analysis, intent);
    const submit = new RiskEngine({ ...defaultRiskPolicy, transactionSubmissionEnabled: true }).authorize(analysis, intent);
    expect(signing.approved).toBe(false);
    expect(submit.approved).toBe(false);
  });

  it("blocks oversize intents and low scores", () => {
    const large = new RiskEngine(defaultRiskPolicy).authorize(analysis, { ...intent, notionalUsd: 101 });
    const low = new RiskEngine(defaultRiskPolicy).authorize({ ...analysis, score: 20 }, intent);
    expect(large.approved).toBe(false);
    expect(low.approved).toBe(false);
  });
});
