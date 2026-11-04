import type { AnalysisResult, TradeIntent, TradingMode } from "../domain/types.js";

export interface RiskPolicy {
  mode: TradingMode;
  maxNotionalUsd: number;
  minAnalystScore: number;
  killSwitch: boolean;
  liveTradingEnabled: boolean;
  signingEnabled: boolean;
  transactionSubmissionEnabled: boolean;
}

export type RiskDecision =
  | { approved: true; intent: TradeIntent; authority: "PAPER_ONLY" }
  | { approved: false; reasons: string[]; authority: "DENY" };

export class RiskEngine {
  constructor(private readonly policy: RiskPolicy) {}

  authorize(analysis: AnalysisResult, intent: TradeIntent): RiskDecision {
    const reasons: string[] = [];
    if (this.policy.killSwitch) reasons.push("kill_switch_active");
    if (this.policy.mode !== "paper" || intent.mode !== "paper") reasons.push("only_paper_mode_is_supported");
    if (intent.notionalUsd <= 0 || intent.notionalUsd > this.policy.maxNotionalUsd) reasons.push("notional_outside_risk_limit");
    if (analysis.score < this.policy.minAnalystScore) reasons.push("analyst_score_below_threshold");
    if (this.policy.liveTradingEnabled) reasons.push("live_trading_is_not_supported");
    if (this.policy.signingEnabled) reasons.push("signing_is_not_supported");
    if (this.policy.transactionSubmissionEnabled) reasons.push("transaction_submission_is_not_supported");
    if (reasons.length) return { approved: false, reasons, authority: "DENY" };
    return { approved: true, intent, authority: "PAPER_ONLY" };
  }
}

export const defaultRiskPolicy: RiskPolicy = {
  mode: "paper",
  maxNotionalUsd: 100,
  minAnalystScore: 70,
  killSwitch: false,
  liveTradingEnabled: false,
  signingEnabled: false,
  transactionSubmissionEnabled: false
};
