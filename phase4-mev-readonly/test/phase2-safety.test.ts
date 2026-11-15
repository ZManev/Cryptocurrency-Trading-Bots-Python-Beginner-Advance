import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCandidate } from "../src/phase2/risk-engine.js";
import { evaluateExecutionGate } from "../src/phase2/execution-gate.js";
import { assessSimulation } from "../src/phase2/simulation.js";
import type { TradeCandidate } from "../src/phase2/types.js";

const candidate: TradeCandidate = {
  id: "test-candidate",
  inputMint: "So11111111111111111111111111111111111111112",
  outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  inputAmount: 1_000n,
  expectedOutputAmount: 2_000n,
  minimumOutputAmount: 1_900n,
  maxSlippageBps: 50,
  estimatedNetworkFeeLamports: 5_000n,
  jitoTipLamports: 1_000n,
  maxTotalDebitLamports: 10_000n,
  instructions: [{ programId: "AllowedProgram", kind: "swap" }]
};

test("risk engine accepts only within configured limits and program allowlist", () => {
  const decision = evaluateCandidate(candidate, {
    maxTotalDebitLamports: 10_000n,
    maxSlippageBps: 100,
    allowedProgramIds: new Set(["AllowedProgram"]),
    maxInputAmount: 2_000n
  });
  assert.equal(decision.approved, true);
  assert.equal(decision.totalDebitLamports, 6_000n);
});

test("risk engine rejects an unknown program and debit above cap", () => {
  const decision = evaluateCandidate({
    ...candidate,
    instructions: [{ programId: "UnknownProgram", kind: "unknown" }],
    jitoTipLamports: 20_000n
  }, {
    maxTotalDebitLamports: 10_000n,
    maxSlippageBps: 100,
    allowedProgramIds: new Set(["AllowedProgram"]),
    maxInputAmount: 2_000n
  });
  assert.equal(decision.approved, false);
  assert.ok(decision.reasons.includes("PROGRAM_NOT_ALLOWLISTED:UnknownProgram"));
  assert.ok(decision.reasons.includes("TOTAL_FEE_AND_TIP_LIMIT_EXCEEDED"));
});

test("execution gate remains closed without independent approvals and all controls", () => {
  const decision = evaluateExecutionGate({
    mode: "SIMULATION",
    liveTradingEnabled: false,
    signingEnabled: false,
    transactionSubmissionEnabled: false,
    killSwitchEngaged: true,
    phase1EvidenceVerified: false
  });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("KILL_SWITCH_ENGAGED"));
  assert.ok(decision.reasons.includes("PHASE1_EVIDENCE_NOT_VERIFIED"));
});

test("simulation rejects errors and excessive fees", async () => {
  const result = await assessSimulation(candidate, {
    getBalance: async () => 100_000n,
    estimateFee: async () => 50_000n,
    simulate: async () => ({ err: null, feeLamports: 50_000n, postSimulationSlot: 123 })
  }, {
    payer: "public-key-only",
    minimumPayerBalanceLamports: 1n,
    maxFeeLamports: 10_000n,
    maxTotalDebitLamports: 10_000n
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes("NETWORK_FEE_LIMIT_EXCEEDED"));
});
