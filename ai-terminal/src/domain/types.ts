export type Chain = "solana" | "ethereum" | "arbitrum" | "binance";
export type AgentName = "SCOUT" | "FILTER" | "ANALYST" | "EXECUTOR" | "RISK" | "LOGGER";
export type TradingMode = "observe" | "paper";

export interface Candidate {
  id: string;
  chain: Chain;
  symbol: string;
  venue: string;
  liquidityUsd: number;
  volume24hUsd: number;
  ageMinutes: number;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  holderConcentrationPct: number;
  spreadBps: number;
}

export interface FilterResult {
  candidateId: string;
  passed: boolean;
  reasons: string[];
}

export interface AnalysisResult {
  candidateId: string;
  score: number;
  signals: Record<string, number>;
}

export interface TradeIntent {
  id: string;
  candidateId: string;
  chain: Chain;
  symbol: string;
  notionalUsd: number;
  mode: TradingMode;
  createdAt: string;
}

export interface AgentEvent {
  agent: AgentName;
  status: "PASS" | "BLOCKED" | "INFO" | "ERROR";
  message: string;
  at: string;
}

export interface PipelineResult {
  candidate: Candidate;
  filter: FilterResult;
  analysis?: AnalysisResult;
  intent?: TradeIntent;
  events: AgentEvent[];
}
