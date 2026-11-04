import type { AnalysisResult, Candidate, FilterResult } from "../domain/types.js";

export class ScoutAgent {
  discover(input: readonly Candidate[]): Candidate[] {
    return input.filter((c) =>
      Number.isFinite(c.liquidityUsd) &&
      Number.isFinite(c.volume24hUsd) &&
      c.liquidityUsd >= 0 &&
      c.volume24hUsd >= 0
    );
  }
}

export interface FilterPolicy {
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  maxHolderConcentrationPct: number;
  maxSpreadBps: number;
  requireRevokedAuthorities: boolean;
}

export class FilterAgent {
  constructor(private readonly policy: FilterPolicy) {}

  evaluate(candidate: Candidate): FilterResult {
    const reasons: string[] = [];
    if (candidate.liquidityUsd < this.policy.minLiquidityUsd) reasons.push("liquidity_below_minimum");
    if (candidate.volume24hUsd < this.policy.minVolume24hUsd) reasons.push("volume_below_minimum");
    if (candidate.holderConcentrationPct > this.policy.maxHolderConcentrationPct) reasons.push("holder_concentration_too_high");
    if (candidate.spreadBps > this.policy.maxSpreadBps) reasons.push("spread_too_wide");
    if (this.policy.requireRevokedAuthorities && candidate.chain === "solana") {
      if (!candidate.mintAuthorityRevoked) reasons.push("mint_authority_not_revoked");
      if (!candidate.freezeAuthorityRevoked) reasons.push("freeze_authority_not_revoked");
    }
    return { candidateId: candidate.id, passed: reasons.length === 0, reasons };
  }
}

export class AnalystAgent {
  score(candidate: Candidate): AnalysisResult {
    const liquidity = Math.min(25, candidate.liquidityUsd / 40_000);
    const volume = Math.min(25, candidate.volume24hUsd / 100_000);
    const distribution = Math.max(0, 25 - candidate.holderConcentrationPct / 2);
    const execution = Math.max(0, 25 - candidate.spreadBps / 4);
    const score = Math.round(Math.max(0, Math.min(100, liquidity + volume + distribution + execution)));
    return {
      candidateId: candidate.id,
      score,
      signals: { liquidity, volume, distribution, execution }
    };
  }
}
