import type { SimulationResult, TradeCandidate } from "./types.js";

export interface SimulationAdapter {
  getBalance(owner: string): Promise<bigint>;
  simulate(candidate: TradeCandidate): Promise<SimulationResult>;
  estimateFee(candidate: TradeCandidate): Promise<bigint>;
}

export interface SimulationPolicy {
  payer: string;
  minimumPayerBalanceLamports: bigint;
  maxFeeLamports: bigint;
  maxTotalDebitLamports: bigint;
}

export interface SimulationAssessment {
  passed: boolean;
  reasons: string[];
  payerBalanceLamports?: bigint;
  estimatedFeeLamports?: bigint;
  simulatedFeeLamports?: bigint;
  postSimulationSlot?: number;
}

export async function assessSimulation(
  candidate: TradeCandidate,
  adapter: SimulationAdapter,
  policy: SimulationPolicy
): Promise<SimulationAssessment> {
  const reasons: string[] = [];
  const [balance, estimatedFee, simulation] = await Promise.all([
    adapter.getBalance(policy.payer),
    adapter.estimateFee(candidate),
    adapter.simulate(candidate)
  ]);

  if (balance < policy.minimumPayerBalanceLamports) reasons.push("INSUFFICIENT_PAYER_BALANCE");
  if (simulation.err !== null) reasons.push("SIMULATION_FAILED");
  if (estimatedFee > policy.maxFeeLamports || simulation.feeLamports > policy.maxFeeLamports) {
    reasons.push("NETWORK_FEE_LIMIT_EXCEEDED");
  }
  const estimatedTotalDebit = candidate.nativeInputDebitLamports + estimatedFee + candidate.jitoTipLamports;
  const simulatedTotalDebit = candidate.nativeInputDebitLamports + simulation.feeLamports + candidate.jitoTipLamports;
  if (estimatedTotalDebit > policy.maxTotalDebitLamports ||
      simulatedTotalDebit > policy.maxTotalDebitLamports) reasons.push("TOTAL_DEBIT_LIMIT_EXCEEDED");
  if (!Number.isSafeInteger(simulation.postSimulationSlot) || simulation.postSimulationSlot <= 0) {
    reasons.push("SIMULATION_SLOT_INVALID");
  }

  return {
    passed: reasons.length === 0,
    reasons,
    payerBalanceLamports: balance,
    estimatedFeeLamports: estimatedFee,
    simulatedFeeLamports: simulation.feeLamports,
    postSimulationSlot: simulation.postSimulationSlot
  };
}
