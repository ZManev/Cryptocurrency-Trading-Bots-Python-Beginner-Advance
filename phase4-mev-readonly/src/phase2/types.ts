export type ExecutionMode = "SIMULATION" | "LIVE";

export interface TradeCandidate {
  id: string;
  inputMint: string;
  outputMint: string;
  inputAmount: bigint;
  /** Native SOL portion of the input, normalized to lamports. */
  nativeInputDebitLamports: bigint;
  expectedOutputAmount: bigint;
  minimumOutputAmount: bigint;
  maxSlippageBps: number;
  estimatedNetworkFeeLamports: bigint;
  jitoTipLamports: bigint;
  maxTotalDebitLamports: bigint;
  instructions: Array<{ programId: string; kind: string }>;
}

export interface SimulationResult {
  err: unknown | null;
  feeLamports: bigint;
  postSimulationSlot: number;
  logs?: string[];
}

export interface RiskDecision {
  approved: boolean;
  reasons: string[];
  totalDebitLamports: bigint;
}

export interface ExecutionAuthorization {
  mode: ExecutionMode;
  liveTradingEnabled: boolean;
  signingEnabled: boolean;
  transactionSubmissionEnabled: boolean;
  killSwitchEngaged: boolean;
  phase1EvidenceVerified: boolean;
  independentApprovalId?: string;
  candidateId?: string;
}
