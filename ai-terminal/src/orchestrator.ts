import { randomUUID } from "node:crypto";
import { AnalystAgent, FilterAgent, ScoutAgent, type FilterPolicy } from "./agents/agents.js";
import { defaultRiskPolicy, RiskEngine, type RiskPolicy } from "./risk/risk-gate.js";
import type { Candidate, PipelineResult, TradeIntent } from "./domain/types.js";

const now = () => new Date().toISOString();

export interface TerminalConfig {
  filter: FilterPolicy;
  risk: RiskPolicy;
  paperNotionalUsd: number;
}

export const defaultTerminalConfig: TerminalConfig = {
  filter: {
    minLiquidityUsd: 100_000,
    minVolume24hUsd: 250_000,
    maxHolderConcentrationPct: 35,
    maxSpreadBps: 80,
    requireRevokedAuthorities: true
  },
  risk: defaultRiskPolicy,
  paperNotionalUsd: 25
};

export class TradingTerminal {
  private readonly scout = new ScoutAgent();
  private readonly filter: FilterAgent;
  private readonly analyst = new AnalystAgent();
  private readonly risk: RiskEngine;

  constructor(private readonly config: TerminalConfig = defaultTerminalConfig) {
    this.filter = new FilterAgent(config.filter);
    this.risk = new RiskEngine(config.risk);
  }

  process(candidates: readonly Candidate[]): PipelineResult[] {
    return this.scout.discover(candidates).map((candidate) => {
      const events: PipelineResult["events"] = [
        { agent: "SCOUT", status: "PASS", message: "Candidate discovered", at: now() }
      ];
      const filter = this.filter.evaluate(candidate);
      events.push({
        agent: "FILTER",
        status: filter.passed ? "PASS" : "BLOCKED",
        message: filter.passed ? "All configured filters passed" : filter.reasons.join(", "),
        at: now()
      });
      if (!filter.passed) {
        events.push({ agent: "LOGGER", status: "INFO", message: "Candidate rejected and recorded", at: now() });
        return { candidate, filter, events };
      }

      const analysis = this.analyst.score(candidate);
      events.push({
        agent: "ANALYST",
        status: analysis.score >= this.config.risk.minAnalystScore ? "PASS" : "BLOCKED",
        message: `Score ${analysis.score}/100`,
        at: now()
      });

      const intent: TradeIntent = {
        id: randomUUID(),
        candidateId: candidate.id,
        chain: candidate.chain,
        symbol: candidate.symbol,
        notionalUsd: this.config.paperNotionalUsd,
        mode: "paper",
        createdAt: now()
      };
      const decision = this.risk.authorize(analysis, intent);
      events.push({
        agent: "RISK",
        status: decision.approved ? "PASS" : "BLOCKED",
        message: decision.approved ? "Paper-only intent authorized" : decision.reasons.join(", "),
        at: now()
      });
      events.push({
        agent: "EXECUTOR",
        status: decision.approved ? "INFO" : "BLOCKED",
        message: decision.approved ? "Paper intent recorded; no venue adapter invoked" : "Execution blocked by risk authority",
        at: now()
      });
      events.push({ agent: "LOGGER", status: "INFO", message: "Pipeline decision recorded", at: now() });
      return { candidate, filter, analysis, ...(decision.approved ? { intent: decision.intent } : {}), events };
    });
  }
}
