import type { ExecutionAuthorization } from "./types.js";

export interface GateDecision {
  allowed: boolean;
  reasons: string[];
}

export function evaluateExecutionGate(auth: ExecutionAuthorization): GateDecision {
  const reasons: string[] = [];
  if (auth.killSwitchEngaged) reasons.push("KILL_SWITCH_ENGAGED");
  if (auth.mode !== "LIVE") reasons.push("LIVE_MODE_NOT_SELECTED");
  if (!auth.phase1EvidenceVerified) reasons.push("PHASE1_EVIDENCE_NOT_VERIFIED");
  if (!auth.liveTradingEnabled) reasons.push("LIVE_TRADING_DISABLED");
  if (!auth.signingEnabled) reasons.push("SIGNING_DISABLED");
  if (!auth.transactionSubmissionEnabled) reasons.push("SUBMISSION_DISABLED");
  if (!auth.independentApprovalId?.trim()) reasons.push("INDEPENDENT_APPROVAL_MISSING");
  if (!auth.candidateId?.trim()) reasons.push("CANDIDATE_BINDING_MISSING");
  return { allowed: reasons.length === 0, reasons };
}

// No RPC send method or transaction execution path is implemented in Phase 2 scaffolding.
