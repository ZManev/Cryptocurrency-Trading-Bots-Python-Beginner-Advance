from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID
from pydantic import BaseModel, Field

class Venue(str, Enum):
    SOLANA = "solana"
    BINANCE = "binance"
    HYPERLIQUID = "hyperliquid"
    POLYMARKET = "polymarket"

class Side(str, Enum):
    BUY = "buy"
    SELL = "sell"

class OrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"

class OrderIntent(BaseModel):
    intent_id: UUID
    account_id: UUID
    strategy_id: str
    venue: Venue
    instrument: str
    side: Side
    order_type: OrderType
    quantity: Decimal = Field(gt=0)
    limit_price: Decimal | None = Field(default=None, gt=0)
    max_slippage_bps: int = Field(ge=0, le=10_000)
    max_fee: Decimal | None = Field(default=None, ge=0)
    client_order_id: str
    idempotency_key: str = Field(min_length=1, max_length=255)
    expires_at: datetime
    metadata: dict[str, str] = Field(default_factory=dict)
