import { describe, expect, it, vi, afterEach } from "vitest";
import { TradingTerminal, defaultTerminalConfig } from "../src/orchestrator.js";
import { AnalystAgent, FilterAgent } from "../src/agents/agents.js";
import type { Candidate } from "../src/domain/types.js";

const good: Candidate = {
  id: "candidate-1", chain: "solana", symbol: "SOL/USDC", venue: "test",
  liquidityUsd: 2_000_000, volume24hUsd: 5_000_000, ageMinutes: 50_000,
  mintAuthorityRevoked: true, freezeAuthorityRevoked: true,
  holderConcentrationPct: 10, spreadBps: 10
};

describe("TradingTerminal", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([NaN, Infinity, -Infinity, -1, 101])("rejects invalid concentration %s before FILTER", (holderConcentrationPct) => {
    expect(new TradingTerminal().process([{ ...good, holderConcentrationPct }])).toEqual([]);
  });

  it.each([NaN, Infinity, -Infinity, -1])("rejects invalid market measurements %s before FILTER", (value) => {
    for (const key of ["spreadBps", "liquidityUsd", "volume24hUsd"]) {
      expect(new TradingTerminal().process([{ ...good, [key]: value }])).toEqual([]);
    }
  });

  it.each([NaN, Infinity, -Infinity, -1])("rejects invalid filter threshold %s", (value) => {
    for (const key of ["minLiquidityUsd", "minVolume24hUsd", "maxHolderConcentrationPct", "maxSpreadBps"]) {
      expect(() => new FilterAgent({ ...defaultTerminalConfig.filter, [key]: value })).toThrow();
    }
  });

  it("validates concentration policy bounds and accepts boundary thresholds", () => {
    expect(() => new FilterAgent({ ...defaultTerminalConfig.filter, maxHolderConcentrationPct: 101 })).toThrow();
    expect(() => new FilterAgent({ minLiquidityUsd: 0, minVolume24hUsd: 0, maxHolderConcentrationPct: 100, maxSpreadBps: 0, requireRevokedAuthorities: true })).not.toThrow();
  });

  it("uses the original risk snapshot after policy mutation and replacement", () => {
    const config = { ...defaultTerminalConfig, risk: { ...defaultTerminalConfig.risk } };
    const terminal = new TradingTerminal(config);
    config.risk.minAnalystScore = 100;
    config.risk.maxNotionalUsd = 0;
    config.risk = { ...config.risk };
    const [result] = terminal.process([good]);
    expect(result?.events.find(e => e.agent === "ANALYST")?.status).toBe("PASS");
    expect(result?.intent).toBeDefined();
  });

  it.each([NaN, Infinity, -Infinity])("blocks invalid analyst score %s consistently", (score) => {
    vi.spyOn(AnalystAgent.prototype, "score").mockReturnValue({ candidateId: good.id, score, signals: {} });
    const [result] = new TradingTerminal().process([good]);
    expect(result?.events.find(e => e.agent === "ANALYST")?.status).toBe("BLOCKED");
    expect(result?.events.find(e => e.agent === "RISK")?.status).toBe("BLOCKED");
    expect(result?.intent).toBeUndefined();
  });

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
