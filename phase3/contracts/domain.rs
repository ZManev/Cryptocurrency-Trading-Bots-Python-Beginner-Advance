use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Venue { Solana, Binance, Hyperliquid, Polymarket }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Side { Buy, Sell }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionRequest {
    pub execution_id: String,
    pub approval_id: String,
    pub intent_id: String,
    pub account_id: String,
    pub venue: Venue,
    pub instrument: String,
    pub side: Side,
    pub quantity: String,
    pub idempotency_key: String,
    pub requested_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillEvent {
    pub fill_id: String,
    pub execution_id: String,
    pub venue: Venue,
    pub venue_order_id: Option<String>,
    pub venue_trade_id: Option<String>,
    pub instrument: String,
    pub side: Side,
    pub quantity: String,
    pub price: String,
    pub fee: String,
    pub fee_asset: String,
    pub timestamp: String,
    pub transaction_id: Option<String>,
}
