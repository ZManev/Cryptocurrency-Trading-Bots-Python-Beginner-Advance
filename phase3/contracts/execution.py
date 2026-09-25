from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field

class RiskApproval(BaseModel):
    approval_id: UUID
    intent_id: UUID
    approved: bool
    reason: str
    approved_quantity: Decimal = Field(ge=0)
    max_notional: Decimal | None = Field(default=None, ge=0)
    max_slippage_bps: int = Field(ge=0, le=10_000)
    risk_policy_version: str
    approved_at: datetime
    expires_at: datetime

class ExecutionRequest(BaseModel):
    execution_id: UUID
    approval_id: UUID
    intent_id: UUID
    account_id: UUID
    venue: str
    instrument: str
    side: str
    quantity: Decimal = Field(gt=0)
    idempotency_key: str
    requested_at: datetime
    authorization_context: dict[str, str] = Field(default_factory=dict)

class FillEvent(BaseModel):
    fill_id: UUID
    execution_id: UUID
    venue: str
    venue_order_id: str | None = None
    venue_trade_id: str | None = None
    instrument: str
    side: str
    quantity: Decimal = Field(gt=0)
    price: Decimal = Field(gt=0)
    fee: Decimal = Field(ge=0)
    fee_asset: str
    timestamp: datetime
    transaction_id: str | None = None
    raw_reference: str | None = None
