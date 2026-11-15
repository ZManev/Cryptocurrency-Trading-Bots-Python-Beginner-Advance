import type { TradeCandidate, RiskDecision } from "./types.js";

export interface RiskPolicy {
  maxTotalDebitLamports: bigint;
  maxSlippageBps: number;
  allowedProgramIds: ReadonlySet<string>;
  maxInputAmount: bigint;
}

export function evaluateCandidate(candidate: TradeCandidate, policy: RiskPolicy): RiskDecision {
  const reasons: string[] = [];
  const totalDebitLamports =
    candidate.nativeInputDebitLamports + candidate.estimatedNetworkFeeLamports + candidate.jitoTipLamports;

  if (!candidate.id.trim()) reasons.push("CANDIDATE_ID_MISSING");
  if (candidate.inputAmount <= 0n || candidate.nativeInputDebitLamports < 0n) reasons.push("INPUT_AMOUNT_INVALID");
  if (candidate.expectedOutputAmount <= 0n || candidate.minimumOutputAmount <= 0n) {
    reasons.push("OUTPUT_AMOUNT_INVALID");
  }
  if (candidate.minimumOutputAmount > candidate.expectedOutputAmount) reasons.push("MINIMUM_OUTPUT_EXCEEDS_QUOTE");
  if (!Number.isInteger(candidate.maxSlippageBps) || candidate.maxSlippageBps < 0 ||
      candidate.maxSlippageBps > policy.maxSlippageBps) reasons.push("SLIPPAGE_POLICY_EXCEEDED");
  if (candidate.inputAmount > policy.maxInputAmount) reasons.push("INPUT_LIMIT_EXCEEDED");
  if (candidate.maxTotalDebitLamports > policy.maxTotalDebitLamports) {
    reasons.push("CANDIDATE_DEBIT_CAP_EXCEEDS_POLICY");
  }
  if (totalDebitLamports > candidate.maxTotalDebitLamports ||
      totalDebitLamports > policy.maxTotalDebitLamports) reasons.push("TOTAL_DEBIT_LIMIT_EXCEEDED");
  if (candidate.instructions.length === 0) reasons.push("NO_INSTRUCTIONS");
  for (const instruction of candidate.instructions) {
    if (!policy.allowedProgramIds.has(instruction.programId)) {
      reasons.push("PROGRAM_NOT_ALLOWLISTED:" + instruction.programId);
    }
  }
  return { approved: reasons.length === 0, reasons, totalDebitLamports };
}
