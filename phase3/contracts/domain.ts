export type Venue = "solana" | "binance" | "hyperliquid" | "polymarket";
export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";

export interface OrderIntent {
  intentId: string;
  accountId: string;
  strategyId: string;
  venue: Venue;
  instrument: string;
  side: Side;
  orderType: OrderType;
  quantity: string;
  limitPrice?: string;
  maxSlippageBps: number;
  maxFee?: string;
  clientOrderId: string;
  idempotencyKey: string;
  expiresAt: string;
  metadata: Record<string, string>;
}

export interface RiskApproval {
  approvalId: string;
  intentId: string;
  approved: boolean;
  reason: string;
  approvedQuantity: string;
  maxNotional?: string;
  maxSlippageBps: number;
  riskPolicyVersion: string;
  approvedAt: string;
  expiresAt: string;
}

export interface ExecutionRequest {
  executionId: string;
  approvalId: string;
  intentId: string;
  accountId: string;
  venue: Venue;
  instrument: string;
  side: Side;
  quantity: string;
  idempotencyKey: string;
  requestedAt: string;
  authorizationContext: Record<string, string>;
}

export interface FillEvent {
  fillId: string;
  executionId: string;
  venue: Venue;
  venueOrderId?: string;
  venueTradeId?: string;
  instrument: string;
  side: Side;
  quantity: string;
  price: string;
  fee: string;
  feeAsset: string;
  timestamp: string;
  transactionId?: string;
  rawReference?: string;
}
